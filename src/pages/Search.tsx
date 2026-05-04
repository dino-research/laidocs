import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSidecar } from "../hooks/useSidecar";
import { apiPost } from "../lib/sidecar";

interface SearchResult {
  doc_id: string;
  title: string;
  folder: string;
  snippet: string;
  score: number;
  highlights: string[];
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const IconSearch = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/>
    <path d="m21 21-4.3-4.3"/>
  </svg>
);

const IconFolder = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  </svg>
);

function HighlightedSnippet({ snippet }: { snippet: string }) {
  return (
    <p
      style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", margin: 0 }}
      dangerouslySetInnerHTML={{ __html: snippet }}
    />
  );
}

function Spinner() {
  return <div style={{ width: 16, height: 16, border: "2px solid var(--border)", borderTopColor: "var(--text-muted)", borderRadius: "50%" }} className="spin" />;
}

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

  useEffect(() => {
    if (!debouncedQuery.trim() || status !== "ready") {
      setResults([]); setSearched(false); return;
    }
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true); setError(null);

    apiPost<SearchResult[]>("/api/search/", { query: debouncedQuery, top_k: 15 })
      .then((data) => { setResults(data); setSearched(true); })
      .catch((err) => { if (err?.name !== "AbortError") setError(String(err)); })
      .finally(() => setLoading(false));
  }, [debouncedQuery, status]);

  if (status !== "ready") {
    return (
      <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Spinner />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ padding: "32px 40px 24px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <h1 className="heading-display" style={{ margin: "0 0 20px" }}>Search</h1>

        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }}>
            <IconSearch />
          </span>
          {loading && (
            <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)" }}>
              <Spinner />
            </span>
          )}
          <input
            id="search-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your documents…"
            autoFocus
            className="warp-input"
            style={{ paddingLeft: 44, paddingRight: 44, fontSize: 15, paddingTop: 12, paddingBottom: 12 }}
          />
        </div>

        {searched && !loading && (
          <p className="label-upper" style={{ marginTop: 12 }}>
            {results.length === 0 ? "No results" : `${results.length} result${results.length !== 1 ? "s" : ""}`}
          </p>
        )}
      </div>

      {/* Results */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 40px" }}>
        {error && (
          <div style={{ marginBottom: 16, padding: "12px 16px", background: "rgba(192,112,112,0.1)", border: "1px solid rgba(192,112,112,0.3)", borderRadius: 8, fontSize: 13, color: "var(--error)" }}>
            {error}
          </div>
        )}

        {!query.trim() && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 80, textAlign: "center" }}>
            <div style={{ color: "var(--text-muted)", opacity: 0.4, marginBottom: 16 }}>
              <IconSearch />
            </div>
            <p style={{ fontSize: 15, color: "var(--text-secondary)", margin: "0 0 6px" }}>Start typing to search</p>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Searches titles and content across all your documents</p>
          </div>
        )}

        {searched && results.length === 0 && !loading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 80, textAlign: "center" }}>
            <p style={{ fontSize: 15, color: "var(--text-secondary)", margin: "0 0 6px" }}>Nothing found for "{query}"</p>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Try different keywords or upload more documents</p>
          </div>
        )}

        {results.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {results.map((result) => (
              <button
                key={result.doc_id}
                onClick={() => navigate(`/doc/${result.doc_id}`)}
                className="warp-card"
                style={{
                  width: "100%", textAlign: "left", cursor: "pointer",
                  padding: "16px 20px", border: "1px solid var(--border)",
                  background: "none",
                  display: "block",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 500, color: "var(--text-primary)", margin: 0, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {result.title || "Untitled"}
                  </h3>
                  <span className="label-upper" style={{ flexShrink: 0, marginTop: 2 }}>
                    {(result.score * 100).toFixed(0)}%
                  </span>
                </div>
                {result.folder && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--text-muted)", background: "var(--surface-alt)", borderRadius: 4, padding: "2px 7px", letterSpacing: "0.5px", marginBottom: 8 }}>
                    <IconFolder /> {result.folder}
                  </span>
                )}
                <HighlightedSnippet snippet={result.snippet} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
