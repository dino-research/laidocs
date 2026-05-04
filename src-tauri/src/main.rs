// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};

/// Sidecar lifecycle manager state.
/// Holds the child process handle for graceful stdin-based shutdown.
struct SidecarState {
    child: Arc<Mutex<Option<tauri_plugin_shell::process::CommandChild>>>,
}

/// Spawns the backend sidecar process and wires up stdout/stderr event forwarding.
///
/// - **Dev mode** (`debug_assertions`): runs `python3 backend/main.py --dev` directly
///   via the OS command, expecting the backend source at `<project_root>/backend/main.py`.
/// - **Release mode**: spawns the bundled sidecar binary `bin/api/main` (configured in
///   `tauri.conf.json` → `externalBin`).
///
/// A dedicated thread reads `CommandEvent`s from the child's `Receiver` and emits
/// Tauri events (`sidecar-stdout`, `sidecar-stderr`, `sidecar-exit`) so the
/// frontend can react in real time.
fn spawn_sidecar(app: &tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_shell::process::{Command, CommandEvent};

    let (mut rx, child) = if cfg!(debug_assertions) {
        // Dev: run the Python backend directly.
        // The current working directory of a Tauri dev process is src-tauri/,
        // so we go up one level to reach the project root where backend/ lives.
        Command::new("python3")
            .args(["backend/main.py", "--dev"])
            .current_dir(std::env::current_dir().unwrap_or_default().parent().unwrap().parent().unwrap_or(std::path::Path::new(".")))
            .spawn()
            .map_err(|e| format!("Failed to spawn dev sidecar: {}", e))?
    } else {
        // Release: use the bundled sidecar binary.
        Command::new_sidecar("bin/api/main")
            .spawn()
            .map_err(|e| format!("Failed to spawn release sidecar: {}", e))?
    };

    // Store the child process handle for later graceful shutdown.
    let state = app.state::<SidecarState>();
    *state.child.lock().unwrap() = Some(child);

    // Spawn a thread to forward sidecar output as Tauri events.
    let app_handle = app.clone();
    std::thread::spawn(move || {
        loop {
            match rx.recv() {
                Some(CommandEvent::Stdout(line)) => {
                    let _ = app_handle.emit("sidecar-stdout", &line);
                }
                Some(CommandEvent::Stderr(line)) => {
                    let _ = app_handle.emit("sidecar-stderr", &line);
                }
                Some(CommandEvent::Terminated(status)) => {
                    let code = status.code();
                    let _ = app_handle.emit("sidecar-exit", serde_json::json!({
                        "code": code,
                        "success": code == Some(0),
                    }));
                    break;
                }
                Some(CommandEvent::Error(err)) => {
                    let _ = app_handle.emit("sidecar-stderr", format!("[sidecar-error] {}", err));
                    break;
                }
                None => {
                    // Receiver closed — child is gone.
                    let _ = app_handle.emit("sidecar-exit", serde_json::json!({
                        "code": null,
                        "success": false,
                    }));
                    break;
                }
            }
        }
    });

    Ok(())
}

/// Sends a graceful shutdown message to the sidecar via stdin.
/// The backend is expected to handle the `"sidecar shutdown\n"` message
/// and exit cleanly. **NEVER** calls `process.kill()` — always use
/// stdin-based graceful shutdown.
fn shutdown_sidecar(app: &tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<SidecarState>();
    let mut guard = state.child.lock().unwrap();

    if let Some(ref mut child) = *guard {
        child
            .write(b"sidecar shutdown\n")
            .map_err(|e| format!("Failed to send shutdown to sidecar: {}", e))?;
        *guard = None;
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Tauri commands — exposed to the frontend via invoke()
// ---------------------------------------------------------------------------

/// Manually start (or restart) the backend sidecar.
///
/// If a sidecar is already running it is shut down gracefully first.
#[tauri::command]
fn start_sidecar(app: tauri::AppHandle) -> Result<(), String> {
    // Shut down any existing instance first.
    let _ = shutdown_sidecar(&app);
    spawn_sidecar(&app)
}

/// Manually shut down the backend sidecar gracefully.
#[tauri::command]
fn stop_sidecar(app: tauri::AppHandle) -> Result<(), String> {
    shutdown_sidecar(&app)
}

/// Ping the sidecar's health endpoint.
///
/// Calls `GET http://localhost:8000/api/health` and returns the JSON body
/// so the frontend can verify the backend is alive and ready.
#[tauri::command]
fn ping_sidecar() -> Result<serde_json::Value, String> {
    let resp = ureq::get("http://localhost:8000/api/health")
        .timeout_read(5_000)
        .timeout_write(5_000)
        .call()
        .map_err(|e| format!("Health check failed: {}", e))?;

    let body: serde_json::Value = resp
        .into_json()
        .map_err(|e| format!("Failed to parse health response: {}", e))?;

    Ok(body)
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(SidecarState {
            child: Arc::new(Mutex::new(None)),
        })
        .setup(|app| {
            // Auto-start the sidecar when the application launches.
            let handle = app.handle().clone();
            if let Err(e) = spawn_sidecar(&handle) {
                eprintln!("[LAIDocs] sidecar auto-start failed: {}", e);
                // Don't panic — the frontend can retry via `start_sidecar` command.
            }

            // Listen for the global "app-close-requested" event so we can
            // shut down the sidecar before the process exits.
            // We also hook into window-close events as a safety net.
            let close_handle = app.handle().clone();
            app.on_window_event(move |_window, event| {
                if let tauri::WindowEvent::CloseRequested { .. } = event {
                    let _ = shutdown_sidecar(&close_handle);
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![start_sidecar, stop_sidecar, ping_sidecar])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
