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
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/>
    <path d="m21 21-4.3-4.3"/>
  </svg>
);

const IconFolder = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  </svg>
);

const IconArrow = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/>
    <polyline points="12 5 19 12 12 19"/>
  </svg>
);

function HighlightedSnippet({ snippet }: { snippet: string }) {
  return (
    <p
      style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.65, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", margin: 0 }}
      dangerouslySetInnerHTML={{ __html: snippet }}
    />
  );
}

function Spinner() {
  return (
    <div style={{ width: 15, height: 15, border: "2px solid var(--border)", borderTopColor: "var(--text-muted)", borderRadius: "50%" }} className="spin" />
  );
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
      <div style={{ width: 32, height: 3, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${score * 100}%`, background: "var(--text-faint)", borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 10, color: "var(--text-faint)", letterSpacing: "0.5px", fontVariantNumeric: "tabular-nums" }}>
        {(score * 100).toFixed(0)}%
      </span>
    </div>
  );
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
  const inputRef = useRef<HTMLInputElement>(null);

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

  // Keyboard shortcut: Cmd/Ctrl+K to focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

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
      <div style={{ padding: "32px 40px 24px", borderBottom: "1px solid var(--border)", flexShrink: 0 }} className="fade-in">
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 20 }}>
          <h1 className="heading-display" style={{ margin: 0 }}>Search</h1>
          {searched && !loading && (
            <span style={{ fontSize: 13, color: "var(--text-faint)" }}>
              {results.length === 0 ? "No results" : `${results.length} result${results.length !== 1 ? "s" : ""}`}
            </span>
          )}
        </div>

        {/* Search input */}
        <div style={{ position: "relative" }}>
          <span style={{
            position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
            color: "var(--text-faint)", pointerEvents: "none",
            transition: "color 0.15s ease",
          }}>
            <IconSearch />
          </span>
          {loading && (
            <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)" }}>
              <Spinner />
            </span>
          )}
          {!loading && query && (
            <button
              onClick={() => { setQuery(""); setResults([]); setSearched(false); inputRef.current?.focus(); }}
              style={{
                position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer",
                color: "var(--text-faint)", display: "flex", alignItems: "center", justifyContent: "center",
                padding: 2, borderRadius: 3, transition: "color 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--text-muted)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--text-faint)")}
              title="Clear"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
          <input
            id="search-input"
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your knowledge base…"
            autoFocus
            className="warp-input"
            style={{
              paddingLeft: 46, paddingRight: 42, fontSize: 15,
              paddingTop: 13, paddingBottom: 13, borderRadius: 10,
            }}
          />
          {/* Shortcut hint */}
          {!query && (
            <span style={{
              position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
              fontSize: 10, color: "var(--text-faint)", letterSpacing: "0.5px",
              background: "var(--surface-alt)", border: "1px solid var(--border)",
              borderRadius: 4, padding: "2px 5px", pointerEvents: "none",
            }}>
              ⌘K
            </span>
          )}
        </div>
      </div>

      {/* Results */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 40px" }}>
        {error && (
          <div style={{
            marginBottom: 16, padding: "12px 16px",
            background: "var(--error-bg)", border: "1px solid rgba(192,112,112,0.25)",
            borderRadius: 8, fontSize: 13, color: "var(--error)",
          }}>
            {error}
          </div>
        )}

        {/* Empty / prompt state */}
        {!query.trim() && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", paddingTop: 72, textAlign: "center",
          }} className="fade-in">
            <div style={{ color: "var(--text-faint)", opacity: 0.35, marginBottom: 18 }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
              </svg>
            </div>
            <p style={{ fontSize: 16, color: "var(--text-secondary)", margin: "0 0 8px", fontWeight: 400 }}>Search your documents</p>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0, lineHeight: 1.6 }}>
              Semantic + full-text search across your entire knowledge base.<br/>
              Type to begin.
            </p>
          </div>
        )}

        {/* No results */}
        {searched && results.length === 0 && !loading && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", paddingTop: 72, textAlign: "center",
          }} className="fade-in">
            <p style={{ fontSize: 16, color: "var(--text-secondary)", margin: "0 0 8px" }}>
              Nothing found for "{query}"
            </p>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
              Try different keywords or upload more documents
            </p>
          </div>
        )}

        {/* Results list */}
        {results.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }} className="stagger-children">
            {results.map((result) => (
              <button
                key={result.doc_id}
                onClick={() => navigate(`/doc/${result.doc_id}`)}
                style={{
                  width: "100%", textAlign: "left", cursor: "pointer",
                  padding: "16px 20px",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-card)",
                  display: "block",
                  transition: "border-color 0.18s, background 0.18s, box-shadow 0.18s",
                  fontFamily: "inherit",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--border-hover)";
                  e.currentTarget.style.background = "var(--surface-raised)";
                  e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.22)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--border)";
                  e.currentTarget.style.background = "var(--surface)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                  <h3 style={{
                    fontSize: 14, fontWeight: 500, color: "var(--text-primary)",
                    margin: 0, lineHeight: 1.4,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    flex: 1,
                  }}>
                    {result.title || "Untitled"}
                  </h3>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                    <ScoreBar score={result.score} />
                    <span style={{ color: "var(--text-faint)", opacity: 0.5 }}><IconArrow /></span>
                  </div>
                </div>
                {result.folder && (
                  <span className="tag" style={{ marginBottom: 8, display: "inline-flex" }}>
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
