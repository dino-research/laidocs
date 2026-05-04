import { Link } from "react-router-dom";

export default function TopBar() {
  return (
    <header className="h-14 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-6">
      <h2 className="text-sm font-medium text-gray-300">LAIDocs</h2>
      <Link
        to="/settings"
        className="text-gray-400 hover:text-white transition-colors"
        title="Settings"
      >
        ⚙️
      </Link>
    </header>
  );
}
