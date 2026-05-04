import { useSidecar } from "../hooks/useSidecar";

export default function Documents() {
  const { status, error } = useSidecar();

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
    <div className="p-8">
      <h1 className="mb-6 text-2xl font-bold text-white">Documents</h1>

      {/* Empty state */}
      <div className="rounded-lg border border-dashed border-gray-700 py-16 text-center">
        <p className="text-4xl mb-3">📂</p>
        <p className="text-gray-300 font-medium">No documents yet</p>
        <p className="mt-1 text-sm text-gray-500">
          Upload a file or crawl a URL to get started.
        </p>

        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            disabled
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white opacity-50 cursor-not-allowed"
            title="Coming soon"
          >
            Upload File
          </button>
          <button
            disabled
            className="rounded-md bg-gray-700 px-4 py-2 text-sm font-medium text-gray-300 opacity-50 cursor-not-allowed"
            title="Coming soon"
          >
            Crawl URL
          </button>
        </div>
      </div>
    </div>
  );
}
