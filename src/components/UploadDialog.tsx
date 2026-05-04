import { useEffect, useRef, useState } from "react";
import { apiGet } from "../lib/sidecar";
import { apiUpload } from "../lib/api-upload";

interface Folder {
  path: string;
  name: string;
  document_count: number;
}

interface UploadDialogProps {
  open: boolean;
  onClose: () => void;
  onUploadSuccess: () => void;
}

const ACCEPTED_EXTENSIONS = ".pdf,.docx,.pptx,.xlsx,.md,.txt,.html,.csv";

export default function UploadDialog({ open, onClose, onUploadSuccess }: UploadDialogProps) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    apiGet<Folder[]>("/api/folders/")
      .then(setFolders)
      .catch(() => setFolders([]));
    // Reset state on open
    setSelectedFile(null);
    setSelectedFolder("");
    setError("");
    setSuccess("");
    setDragOver(false);
  }, [open]);

  if (!open) return null;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) setSelectedFile(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError("Please select a file");
      return;
    }
    setError("");
    setSuccess("");
    setUploading(true);
    try {
      await apiUpload("/api/documents/upload", selectedFile, selectedFolder);
      setSuccess(`"${selectedFile.name}" uploaded successfully!`);
      onUploadSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
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
          <h2 className="text-lg font-semibold text-white">Upload File</h2>
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

        {/* Drag & drop zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`mb-4 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
            dragOver
              ? "border-blue-500 bg-blue-500/10"
              : selectedFile
              ? "border-gray-600 bg-gray-800"
              : "border-gray-700 bg-gray-800/50 hover:border-gray-600"
          }`}
        >
          {selectedFile ? (
            <>
              <div className="mb-2 text-3xl">📎</div>
              <p className="text-sm font-medium text-white">{selectedFile.name}</p>
              <p className="text-xs text-gray-500">{(selectedFile.size / 1024).toFixed(1)} KB</p>
            </>
          ) : (
            <>
              <div className="mb-2 text-3xl">📤</div>
              <p className="text-sm text-gray-300">Drag & drop a file here</p>
              <p className="text-xs text-gray-500">or click to browse</p>
            </>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          onChange={handleFileSelect}
          className="hidden"
        />

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
            onClick={handleUpload}
            disabled={uploading || !selectedFile}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? (
              <span className="flex items-center gap-2">
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Converting…
              </span>
            ) : (
              "Upload"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
