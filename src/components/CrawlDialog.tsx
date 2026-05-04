import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../lib/sidecar";

interface Folder {
  path: string;
  name: string;
  document_count: number;
}

interface CrawlDialogProps {
  open: boolean;
  onClose: () => void;
  onCrawlSuccess: () => void;
}

export default function CrawlDialog({ open, onClose, onCrawlSuccess }: CrawlDialogProps) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState("");
  const [url, setUrl] = useState("");
  const [crawling, setCrawling] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!open) return;
    apiGet<Folder[]>("/api/folders/")
      .then(setFolders)
      .catch(() => setFolders([]));
    // Reset state on open
    setUrl("");
    setSelectedFolder("");
    setError("");
    setSuccess("");
  }, [open]);

  if (!open) return null;

  const handleCrawl = async () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setError("Please enter a URL");
      return;
    }
    // Basic URL validation
    try {
      new URL(trimmedUrl);
    } catch {
      setError("Please enter a valid URL (e.g. https://example.com)");
      return;
    }

    setError("");
    setSuccess("");
    setCrawling(true);
    try {
      const result = await apiPost<{ title?: string; id?: string }>("/api/documents/crawl", {
        url: trimmedUrl,
        folder: selectedFolder,
      });
      const title = result.title || trimmedUrl;
      setSuccess(`Crawled "${title}" successfully!`);
      onCrawlSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Crawl failed");
    } finally {
      setCrawling(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-xl bg-gray-900 p-6 shadow-2xl border border-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Crawl URL</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Success message */}
        {success && (
          <div className="mb-4 rounded-md bg-green-900/30 border border-green-800 p-3 text-sm text-green-300">
            {success}
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mb-4 rounded-md bg-red-900/30 border border-red-800 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* URL input */}
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-gray-300">URL</label>
          <input
            type="text"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !crawling) handleCrawl();
            }}
            placeholder="https://example.com"
            autoFocus
            className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500"
          />
        </div>

        {/* Folder selector */}
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-gray-300">Folder</label>
          <select
            value={selectedFolder}
            onChange={(e) => setSelectedFolder(e.target.value)}
            className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
          >
            <option value="">None</option>
            {folders.map((f) => (
              <option key={f.path} value={f.path}>
                {f.name || f.path}
              </option>
            ))}
          </select>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleCrawl}
            disabled={crawling}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {crawling ? (
              <span className="flex items-center gap-2">
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Crawling…
              </span>
            ) : (
              "Crawl"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
