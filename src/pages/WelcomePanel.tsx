// ── Icons ─────────────────────────────────────────────────────────

const IconDocument = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-faint)", opacity: 0.5 }}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <line x1="10" y1="9" x2="8" y2="9" />
  </svg>
);

// ── WelcomePanel ──────────────────────────────────────────────────

export default function WelcomePanel() {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 40,
      }}
    >
      <div
        className="fade-in"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          maxWidth: 420,
        }}
      >
        <IconDocument />

        <h2
          style={{
            fontSize: 20,
            fontWeight: 500,
            color: "var(--text-primary)",
            margin: "20px 0 8px",
            letterSpacing: "-0.3px",
          }}
        >
          Select a document
        </h2>

        <p
          style={{
            fontSize: 13,
            color: "var(--text-muted)",
            lineHeight: 1.6,
            margin: "0 0 28px",
          }}
        >
          Choose a file from the Explorer, or create a new one using the{" "}
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ verticalAlign: "-1px", display: "inline" }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="11" x2="12" y2="17" />
            <line x1="9" y1="14" x2="15" y2="14" />
          </svg>{" "}
          button in the sidebar.
        </p>

        {/* Keyboard hints */}
        <div style={{ display: "flex", gap: 16 }}>
          <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
            Upload files or crawl URLs from the{" "}
            <kbd style={{
              background: "var(--surface-alt)",
              border: "1px solid var(--border)",
              borderRadius: 3,
              padding: "1px 5px",
              fontSize: 10,
              fontFamily: "'Geist Mono', monospace",
            }}>Documents</kbd>{" "}
            page
          </span>
        </div>
      </div>
    </div>
  );
}
