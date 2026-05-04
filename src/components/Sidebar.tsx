import { NavLink } from "react-router-dom";

export default function Sidebar() {
  return (
    <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
      <div className="p-4 border-b border-gray-800">
        <h1 className="text-lg font-bold text-white">📁 LAIDocs</h1>
      </div>
      <nav className="flex-1 p-4 space-y-2">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `block px-3 py-2 rounded-md text-sm transition-colors ${
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
            `block px-3 py-2 rounded-md text-sm transition-colors ${
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
            `block px-3 py-2 rounded-md text-sm transition-colors ${
              isActive
                ? "bg-gray-800 text-white"
                : "text-gray-400 hover:bg-gray-800 hover:text-white"
            }`
          }
        >
          ⚙️ Settings
        </NavLink>
      </nav>
    </aside>
  );
}
