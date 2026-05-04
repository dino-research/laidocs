import { useParams } from "react-router-dom";
import { useSidecar } from "../hooks/useSidecar";

export default function DocumentEditor() {
  const { id } = useParams<{ id: string }>();
  const { status } = useSidecar();

  if (status !== "ready") {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-3 text-2xl animate-pulse">⏳</div>
          <p className="text-sm text-gray-400">Connecting to backend…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Document title bar */}
      <div className="flex items-center border-b border-gray-800 px-6 py-3">
        <h1 className="text-lg font-semibold text-white">
          {id ? `Document: ${id}` : "Document Editor"}
        </h1>
      </div>

      {/* Split view placeholder */}
      <div className="flex flex-1 overflow-hidden">
        {/* Edit pane */}
        <div className="flex flex-1 flex-col border-r border-gray-800 p-6">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Editor
          </h2>
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-gray-700">
            <p className="text-sm text-gray-500">
              Document editor — select a document to edit
            </p>
          </div>
        </div>

        {/* Preview pane */}
        <div className="flex flex-1 flex-col p-6">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Preview
          </h2>
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-gray-700">
            <p className="text-sm text-gray-500">Preview will appear here</p>
          </div>
        </div>
      </div>
    </div>
  );
}
