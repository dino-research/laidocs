import { Link, useLocation } from "react-router-dom";

const PAGE_TITLES: Record<string, string> = {
  "/": "Documents",
  "/search": "Search",
  "/settings": "Settings",
};

function getPageTitle(pathname: string): string {
  // Check exact matches first
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  // Check prefix matches (e.g. /doc/123)
  for (const [prefix, title] of Object.entries(PAGE_TITLES)) {
    if (prefix !== "/" && pathname.startsWith(prefix)) return title;
  }
  if (pathname.startsWith("/doc/")) return "Document Editor";
  return "LAIDocs";
}

export default function TopBar() {
  const location = useLocation();
  const title = getPageTitle(location.pathname);

  return (
    <header className="flex h-12 flex-shrink-0 items-center justify-between border-b border-gray-800 bg-gray-900 px-4">
      {/* Left: current page title / breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium text-gray-100">{title}</span>
      </div>

      {/* Right: action buttons */}
      <div className="flex items-center gap-1">
        <Link
          to="/search"
          className="rounded-md p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
          title="Search"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </Link>
        <Link
          to="/settings"
          className="rounded-md p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
          title="Settings"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </Link>
      </div>
    </header>
  );
}
