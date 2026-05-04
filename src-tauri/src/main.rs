// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// Sidecar process handle (placeholder for future lifecycle management)
/// In production, this will spawn and manage the Python API sidecar binary
/// located at src-tauri/bin/api/main
struct SidecarState {
    // child: Option<Child>,  // Future: hold the child process
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to LAIDocs.", name)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(SidecarState {
            // child: None,  // Future: initialize sidecar here
        })
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    // TODO: Sidecar lifecycle management
    // - Spawn the Python sidecar on app startup
    // - Monitor sidecar health via /api/health endpoint
    // - Gracefully terminate sidecar on app close
    // - Restart sidecar on crash with exponential backoff
}
