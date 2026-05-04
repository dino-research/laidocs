import { NavLink } from "react-router-dom";

export default function Sidebar() {
  return (
    <aside className="flex h-full w-64 flex-shrink-0 flex-col border-r border-gray-800 bg-gray-900">
      {/* Logo / Title */}
      <div className="border-b border-gray-800 p-4">
        <h1 className="text-lg font-bold text-white">
          <span className="mr-1.5">📁</span>LAIDocs
        </h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-3">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "bg-gray-800 text-white"
                : "text-gray-400 hover:bg-gray-800 hover:text-white"
            }`
          }
        >
          📄 Documents
        </NavLink>

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
      </nav>

      {/* Folder tree placeholder */}
      <div className="border-t border-gray-800 p-3">
        <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Folders
        </p>
        <p className="px-3 text-xs text-gray-600 italic">
          No folders yet
        </p>
      </div>
    </aside>
  );
}
