import { API_BASE } from "./sidecar";

export interface UploadStageEvent {
  stage: "uploading" | "uploaded" | "converting" | "converted" | "saving" | "saved" | "error";
  id?: string;
  title?: string;
  folder?: string;
  filename?: string;
  message?: string;
}

export interface CrawlStageEvent {
  stage: "crawling" | "crawled" | "saving" | "saved" | "error";
  id?: string;
  title?: string;
  folder?: string;
  filename?: string;
  message?: string;
}

/**
 * Upload a file and stream back SSE stage events.
 * Calls onStage() for each event. Resolves when stream ends.
 * Rejects on network error or when an "error" stage event is received.
 */
export async function apiUploadStream(
  file: File,
  folder: string,
  onStage: (event: UploadStageEvent) => void,
): Promise<void> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder", folder);

  const res = await fetch(`${API_BASE}/api/documents/upload`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`Upload failed: ${res.status} ${res.statusText}${text ? ` – ${text}` : ""}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        try {
          const event: UploadStageEvent = JSON.parse(trimmed.slice(6));
          onStage(event);
          if (event.stage === "error") {
            throw new Error(event.message || "Upload failed");
          }
        } catch (parseErr) {
          if (parseErr instanceof Error && parseErr.message !== "Unexpected end of JSON input") {
            throw parseErr;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

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

/**
 * Crawl a URL and stream back SSE stage events.
 * Calls onStage() for each event. Resolves when stream ends.
 * Rejects on network error or when an "error" stage event is received.
 */
export async function apiCrawlStream(
  url: string,
  folder: string,
  onStage: (event: CrawlStageEvent) => void,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/documents/crawl`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, folder }),
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`Crawl failed: ${res.status} ${res.statusText}${text ? ` – ${text}` : ""}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        try {
          const event: CrawlStageEvent = JSON.parse(trimmed.slice(6));
          onStage(event);
          if (event.stage === "error") {
            throw new Error(event.message || "Crawl failed");
          }
        } catch (parseErr) {
          if (parseErr instanceof Error && parseErr.message !== "Unexpected end of JSON input") {
            throw parseErr;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
