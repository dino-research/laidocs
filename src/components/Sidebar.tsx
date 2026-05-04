import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { apiGet, apiPost } from "../lib/sidecar";
import { useFolderContext } from "../context/FolderContext";

interface Folder {
  path: string;
  name: string;
  document_count: number;
}

export default function Sidebar() {
  const { activeFolder, setActiveFolder, refreshFoldersKey, triggerRefreshFolders } =
    useFolderContext();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderError, setNewFolderError] = useState("");
  const location = useLocation();

  const fetchFolders = useCallback(async () => {
    try {
      const data = await apiGet<Folder[]>("/api/folders/");
      setFolders(data);
    } catch {
      setFolders([]);
    }
  }, [refreshFoldersKey]);

  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) {
      setNewFolderError("Name is required");
      return;
    }
    setNewFolderError("");
    try {
      await apiPost("/api/folders/", { path: name, name });
      setNewFolderName("");
      setShowNewFolder(false);
      triggerRefreshFolders();
    } catch (err) {
      setNewFolderError(err instanceof Error ? err.message : "Failed to create folder");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleCreateFolder();
    if (e.key === "Escape") {
      setShowNewFolder(false);
      setNewFolderName("");
      setNewFolderError("");
    }
  };

  const isDocsPage = location.pathname === "/";

  return (
    <aside className="flex h-full w-64 flex-shrink-0 flex-col border-r border-gray-800 bg-gray-900">
      {/* Logo / Title */}
      <div className="border-b border-gray-800 p-4">
        <h1 className="text-lg font-bold text-white">
          <span className="mr-1.5">📁</span>LAIDocs
        </h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-auto p-3">
        {/* All Documents */}
        <button
          onClick={() => setActiveFolder(null)}
          className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            isDocsPage && activeFolder === null
              ? "bg-gray-800 text-white"
              : "text-gray-400 hover:bg-gray-800 hover:text-white"
          }`}
        >
          📄 All Documents
        </button>

        <NavLink
          to="/search"
          className={({ isActive }) =>
            `flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "bg-gray-800 text-white"
                : "text-gray-400 hover:bg-gray-800 hover:text-white"
            }`
          }
        >
          🔍 Search
        </NavLink>

        {/* Folders section */}
        <div className="mt-4">
          <div className="flex items-center justify-between px-3 mb-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Folders
            </p>
            <button
              onClick={() => setShowNewFolder(!showNewFolder)}
              className="rounded p-0.5 text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300"
              title="New Folder"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          {/* New folder inline input */}
          {showNewFolder && (
            <div className="mb-2 px-1">
              <input
                type="text"
                autoFocus
                value={newFolderName}
                onChange={(e) => {
                  setNewFolderName(e.target.value);
                  setNewFolderError("");
                }}
                onKeyDown={handleKeyDown}
                placeholder="Folder name…"
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500"
              />
              {newFolderError && (
                <p className="mt-1 text-xs text-red-400">{newFolderError}</p>
              )}
              <div className="mt-1.5 flex gap-1.5">
                <button
                  onClick={handleCreateFolder}
                  className="rounded px-2 py-0.5 text-xs font-medium text-blue-400 hover:bg-gray-800"
                >
                  Create
                </button>
                <button
                  onClick={() => {
                    setShowNewFolder(false);
                    setNewFolderName("");
                    setNewFolderError("");
                  }}
                  className="rounded px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-800 hover:text-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Folder list */}
          {folders.length === 0 && !showNewFolder ? (
            <p className="px-3 text-xs text-gray-600 italic">No folders yet</p>
          ) : (
            <div className="space-y-0.5">
              {folders.map((folder) => {
                const isActive = isDocsPage && activeFolder === folder.path;
                return (
                  <button
                    key={folder.path}
                    onClick={() => setActiveFolder(folder.path)}
                    className={`flex w-full items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors ${
                      isActive
                        ? "bg-gray-800 text-white"
                        : "text-gray-400 hover:bg-gray-800 hover:text-white"
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      📁 <span className="truncate">{folder.name || folder.path}</span>
                    </span>
                    <span className="ml-2 flex-shrink-0 rounded-full bg-gray-700 px-1.5 py-0.5 text-xs text-gray-400">
                      {folder.document_count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </nav>

      {/* Settings at bottom */}
      <div className="border-t border-gray-800 p-3">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "bg-gray-800 text-white"
                : "text-gray-400 hover:bg-gray-800 hover:text-white"
            }`
          }
        >
          ⚙️ Settings
        </NavLink>
      </div>
    </aside>
  );
}
