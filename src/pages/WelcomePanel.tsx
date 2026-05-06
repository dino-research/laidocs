import { useState } from "react";
import UploadDialog from "../components/UploadDialog";
import CrawlDialog from "../components/CrawlDialog";

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

const IconUpload = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const IconGlobe = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

// ── WelcomePanel ──────────────────────────────────────────────────

export default function WelcomePanel() {
  const [showUpload, setShowUpload] = useState(false);
  const [showCrawl, setShowCrawl] = useState(false);

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
          Welcome to LaiDocs
        </h2>

        <p
          style={{
            fontSize: 13,
            color: "var(--text-muted)",
            lineHeight: 1.6,
            margin: "0 0 28px",
          }}
        >
          Select a file from the Explorer, or get started by adding a new document to your workspace.
        </p>

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={() => setShowUpload(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 16px",
              background: "var(--surface-alt)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-pill)",
              color: "var(--text-primary)",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--surface-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--surface-alt)";
            }}
          >
            <IconUpload />
            Upload File
          </button>

          <button
            onClick={() => setShowCrawl(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 16px",
              background: "var(--surface-alt)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-pill)",
              color: "var(--text-primary)",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--surface-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--surface-alt)";
            }}
          >
            <IconGlobe />
            Crawl URL
          </button>
        </div>
      </div>

      <UploadDialog
        open={showUpload}
        onClose={() => setShowUpload(false)}
        initialFolder="unsorted"
        onUploadSuccess={() => setShowUpload(false)}
      />
      <CrawlDialog
        open={showCrawl}
        onClose={() => setShowCrawl(false)}
        initialFolder="unsorted"
        onCrawlSuccess={() => setShowCrawl(false)}
      />
    </div>
  );
}
