import { useState } from "react";
import { useSidecar } from "../hooks/useSidecar";

export default function Search() {
  const { status } = useSidecar();
  const [query, setQuery] = useState("");

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
    <div className="p-8">
      <h1 className="mb-6 text-2xl font-bold text-white">Search</h1>

      {/* Search input */}
      <div className="relative mb-8">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your documents…"
          className="w-full rounded-lg border border-gray-700 bg-gray-900 py-2.5 pl-10 pr-4 text-sm text-gray-100 placeholder-gray-500 outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Placeholder */}
      <div className="rounded-lg border border-dashed border-gray-700 py-16 text-center">
        <p className="text-4xl mb-3">🔍</p>
        <p className="text-gray-300 font-medium">No results yet</p>
        <p className="mt-1 text-sm text-gray-500">
          Search will be available after documents are indexed.
        </p>
      </div>
    </div>
  );
}
