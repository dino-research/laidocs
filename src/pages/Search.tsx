import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSidecar } from "../hooks/useSidecar";
import { apiPost } from "../lib/sidecar";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SearchResult {
  doc_id: string;
  title: string;
  folder: string;
  snippet: string;
  score: number;
  highlights: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function HighlightedSnippet({ snippet }: { snippet: string }) {
  // Backend wraps matches in <b>…</b> tags
  return (
    <p
      className="text-sm text-gray-400 leading-relaxed line-clamp-3"
      dangerouslySetInnerHTML={{ __html: snippet }}
    />
  );
}

function FolderBadge({ folder }: { folder: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400 border border-blue-500/20">
      <span>📁</span>
      {folder || "unsorted"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// SearchResultCard
// ---------------------------------------------------------------------------

function SearchResultCard({
  result,
  onClick,
}: {
  result: SearchResult;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl border border-white/5 bg-white/3 p-4 transition-all duration-200 hover:bg-white/8 hover:border-blue-500/40 hover:shadow-lg hover:shadow-blue-500/5 group"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="font-semibold text-white group-hover:text-blue-400 transition-colors line-clamp-1">
          {result.title || "Untitled"}
        </h3>
        <span className="shrink-0 text-xs text-gray-600 tabular-nums mt-0.5">
          {(result.score * 100).toFixed(0)}%
        </span>
      </div>
      <div className="mb-2">
        <FolderBadge folder={result.folder} />
      </div>
      <HighlightedSnippet snippet={result.snippet} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function Search() {
  const { status } = useSidecar();
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debouncedQuery = useDebounce(query, 350);
  const abortRef = useRef<AbortController | null>(null);

  // Run search whenever debounced query changes
  useEffect(() => {
    if (!debouncedQuery.trim() || status !== "ready") {
      setResults([]);
      setSearched(false);
      return;
    }

    // Cancel any in-flight request
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);

    apiPost<SearchResult[]>("/api/search/", { query: debouncedQuery, top_k: 15 })
      .then((data) => {
        setResults(data);
        setSearched(true);
      })
      .catch((err) => {
        if (err?.name !== "AbortError") {
          setError(String(err));
        }
      })
      .finally(() => setLoading(false));
  }, [debouncedQuery, status]);

  // ── Loading state ──────────────────────────────────────────────────
  if (status !== "ready") {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-3 text-3xl animate-pulse">⏳</div>
          <p className="text-sm text-gray-400">Connecting to backend…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="px-8 pt-8 pb-6 border-b border-white/5">
        <h1 className="text-2xl font-bold text-white mb-5">Search</h1>

        {/* Search input */}
        <div className="relative">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 pointer-events-none"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          {loading && (
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          <input
            id="search-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your documents…"
            autoFocus
            className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-10 text-sm text-gray-100 placeholder-gray-500 outline-none transition-all focus:border-blue-500/60 focus:bg-white/8 focus:ring-1 focus:ring-blue-500/40"
          />
        </div>

        {/* Result count */}
        {searched && !loading && (
          <p className="mt-3 text-xs text-gray-500">
            {results.length === 0
              ? "No results found"
              : `${results.length} result${results.length !== 1 ? "s" : ""}`}
          </p>
        )}
      </div>

      {/* ── Results ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {error && (
          <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {!query.trim() && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-5xl mb-4 opacity-60">🔍</div>
            <p className="text-gray-300 font-medium">Start typing to search</p>
            <p className="mt-1 text-sm text-gray-500">
              Searches titles and content across all your documents
            </p>
          </div>
        )}

        {searched && results.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-5xl mb-4 opacity-60">😶</div>
            <p className="text-gray-300 font-medium">Nothing found for "{query}"</p>
            <p className="mt-1 text-sm text-gray-500">
              Try different keywords or upload more documents
            </p>
          </div>
        )}

        {results.length > 0 && (
          <div className="space-y-3">
            {results.map((result) => (
              <SearchResultCard
                key={result.doc_id}
                result={result}
                onClick={() => navigate(`/doc/${result.doc_id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
