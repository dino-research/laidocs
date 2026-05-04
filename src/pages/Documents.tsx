import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet, apiDelete } from "../lib/sidecar";
import { useSidecar } from "../hooks/useSidecar";
import { useFolderContext } from "../context/FolderContext";
import UploadDialog from "../components/UploadDialog";
import CrawlDialog from "../components/CrawlDialog";

interface Document {
  id: string;
  title: string;
  folder: string | null;
  source_type: string;
  content?: string;
  created_at: string;
  updated_at?: string;
}

function relativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;

  return date.toLocaleDateString();
}

export default function Documents() {
  const { status, error } = useSidecar();
  const { activeFolder, triggerRefreshFolders } = useFolderContext();
  const navigate = useNavigate();

  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [crawlOpen, setCrawlOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    setFetchError("");
    try {
      const query = activeFolder ? `?folder=${encodeURIComponent(activeFolder)}` : "";
      const data = await apiGet<Document[]>(`/api/documents/${query}`);
      setDocuments(data);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, [activeFolder]);

  useEffect(() => {
    if (status !== "ready") return;
    fetchDocuments();
  }, [status, fetchDocuments]);

  const handleDelete = async (docId: string) => {
    try {
      await apiDelete(`/api/documents/${docId}`);
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
      setDeleteConfirm(null);
      triggerRefreshFolders();
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to delete document");
    }
  };

  // Sidecar not ready states
  if (status === "starting") {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-3 text-2xl animate-pulse">⏳</div>
          <p className="text-sm text-gray-400">Connecting to backend…</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-3 text-2xl">⚠️</div>
          <p className="text-sm text-red-400">Failed to connect to backend.</p>
          {error && <p className="mt-1 text-xs text-gray-500">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 h-full flex flex-col">
      {/* Header with actions */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {activeFolder ? (
              <span className="flex items-center gap-2">
                📁 <span className="truncate max-w-xs">{activeFolder}</span>
              </span>
            ) : (
              "Documents"
            )}
          </h1>
          {documents.length > 0 && (
            <p className="mt-1 text-sm text-gray-500">{documents.length} document{documents.length !== 1 ? "s" : ""}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setUploadOpen(true)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            📤 Upload File
          </button>
          <button
            onClick={() => setCrawlOpen(true)}
            className="rounded-md bg-gray-700 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-600 hover:text-white"
          >
            🌐 Crawl URL
          </button>
        </div>
      </div>

      {/* Error state */}
      {fetchError && (
        <div className="mb-4 rounded-md bg-red-900/30 border border-red-800 p-3 text-sm text-red-300">
          {fetchError}
          <button
            onClick={fetchDocuments}
            className="ml-2 underline hover:text-red-200"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="mb-3 text-2xl animate-pulse">⏳</div>
            <p className="text-sm text-gray-400">Loading documents…</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && documents.length === 0 && !fetchError && (
        <div className="flex-1 flex items-center justify-center">
          <div className="rounded-lg border border-dashed border-gray-700 py-16 text-center max-w-md">
            <p className="text-4xl mb-3">📂</p>
            <p className="text-gray-300 font-medium">No documents yet</p>
            <p className="mt-1 text-sm text-gray-500">
              Upload a file or crawl a URL to get started.
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                onClick={() => setUploadOpen(true)}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                📤 Upload File
              </button>
              <button
                onClick={() => setCrawlOpen(true)}
                className="rounded-md bg-gray-700 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-600 hover:text-white"
              >
                🌐 Crawl URL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document grid */}
      {!loading && documents.length > 0 && (
        <div className="flex-1 overflow-auto">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="group relative rounded-lg border border-gray-800 bg-gray-900 p-4 transition-colors hover:border-gray-700 hover:bg-gray-800/50 cursor-pointer"
                onClick={() => navigate(`/doc/${doc.id}`)}
              >
                {/* Delete button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirm(doc.id);
                  }}
                  className="absolute right-2 top-2 rounded-md p-1 text-gray-600 opacity-0 transition-all group-hover:opacity-100 hover:bg-gray-700 hover:text-red-400"
                  title="Delete"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </button>

                {/* Delete confirmation overlay */}
                {deleteConfirm === doc.id && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute inset-0 flex items-center justify-center rounded-lg bg-gray-950/90 z-10"
                  >
                    <div className="text-center p-4">
                      <p className="text-sm text-white mb-3">Delete this document?</p>
                      <div className="flex gap-2 justify-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(doc.id);
                          }}
                          className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
                        >
                          Delete
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirm(null);
                          }}
                          className="rounded-md bg-gray-700 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-600"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Source icon + Title */}
                <div className="flex items-start gap-2 mb-2 pr-6">
                  <span className="text-lg mt-0.5 flex-shrink-0">
                    {doc.source_type === "url" ? "🌐" : "📎"}
                  </span>
                  <h3 className="text-sm font-medium text-white leading-snug line-clamp-2">
                    {doc.title || "Untitled"}
                  </h3>
                </div>

                {/* Content preview */}
                {doc.content && (
                  <p className="mb-3 text-xs text-gray-500 line-clamp-3 leading-relaxed">
                    {doc.content.substring(0, 100)}
                    {doc.content.length > 100 ? "…" : ""}
                  </p>
                )}

                {/* Meta row */}
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span className="flex items-center gap-1">
                    {doc.folder && (
                      <span className="rounded bg-gray-800 px-1.5 py-0.5 text-gray-500">
                        {doc.folder}
                      </span>
                    )}
                  </span>
                  <span>{relativeTime(doc.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dialogs */}
      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploadSuccess={() => {
          fetchDocuments();
          triggerRefreshFolders();
        }}
      />
      <CrawlDialog
        open={crawlOpen}
        onClose={() => setCrawlOpen(false)}
        onCrawlSuccess={() => {
          fetchDocuments();
          triggerRefreshFolders();
        }}
      />
    </div>
  );
}
