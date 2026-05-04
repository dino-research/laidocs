export function useSidecar() {
  // In dev mode (browser), the backend runs separately
  // In production (Tauri), the sidecar is managed by src-tauri
  return { status: "ready" as const };
}
