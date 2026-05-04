import { API_BASE } from "./sidecar";

/**
 * Upload a file to the documents API using multipart/form-data.
 * The regular apiPost helper sets Content-Type to JSON, so we need this for file uploads.
 */
export async function apiUpload<T>(
  path: string,
  file: File,
  folder: string,
): Promise<T> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder", folder);

  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`POST ${path} failed: ${res.status} ${res.statusText}${text ? ` – ${text}` : ""}`);
  }

  return res.json() as Promise<T>;
}
