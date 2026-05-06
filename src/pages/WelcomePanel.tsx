import { useState } from "react";
import UploadDialog from "../components/UploadDialog";
import CrawlDialog from "../components/CrawlDialog";

// ── SVG Icons ─────────────────────────────────────────────────────

const IconUpload = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const IconGlobe = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

const IconSparkle = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
  </svg>
);

const IconBook = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
  </svg>
);

const IconChat = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);

// ── Feature card ──────────────────────────────────────────────────

function FeatureCard({ icon, title, description, delay }: { icon: React.ReactNode; title: string; description: string; delay: number }) {
  return (
    <div
      className="fade-in-up"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: "20px",
        borderRadius: 12,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        transition: "all 0.25s cubic-bezier(0.22, 1, 0.36, 1)",
        animationDelay: `${delay}ms`,
        cursor: "default",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--border-hover)";
        e.currentTarget.style.background = "var(--surface-raised)";
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 8px 30px rgba(0,0,0,0.3)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.background = "var(--surface)";
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: "var(--accent-subtle)",
        border: "1px solid var(--border-glow)",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "var(--accent-text)",
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", marginBottom: 4 }}>
          {title}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
          {description}
        </div>
      </div>
    </div>
  );
}

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
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Ambient background glow */}
      <div style={{
        position: "absolute",
        top: "-20%",
        left: "30%",
        width: 500,
        height: 500,
        borderRadius: "50%",
        background: "radial-gradient(circle, var(--accent-subtle) 0%, transparent 70%)",
        pointerEvents: "none",
        opacity: 0.7,
      }} />
      <div style={{
        position: "absolute",
        bottom: "-30%",
        right: "20%",
        width: 400,
        height: 400,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(99, 102, 241, 0.04) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          maxWidth: 540,
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Hero icon */}
        <div
          className="fade-in float"
          style={{
            width: 72,
            height: 72,
            borderRadius: 20,
            background: "linear-gradient(135deg, var(--accent-subtle), var(--surface-alt))",
            border: "1px solid var(--border-glow)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 28,
            boxShadow: "0 8px 30px var(--accent-subtle)",
          }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-text)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
          </svg>
        </div>

        <h1
          className="fade-in-up heading-display"
          style={{
            margin: "0 0 12px",
            animationDelay: "0.06s",
          }}
        >
          Welcome to LAIDocs
        </h1>

        <p
          className="fade-in-up"
          style={{
            fontSize: 14,
            color: "var(--text-muted)",
            lineHeight: 1.65,
            margin: "0 0 32px",
            maxWidth: 400,
            animationDelay: "0.12s",
          }}
        >
          Your intelligent knowledge base. Upload documents, crawl web pages, and chat with your content using AI.
        </p>

        {/* Action Buttons */}
        <div
          className="fade-in-up"
          style={{ display: "flex", gap: 12, marginBottom: 48, animationDelay: "0.18s" }}
        >
          <button
            onClick={() => setShowUpload(true)}
            className="btn-accent"
          >
            <IconUpload />
            Upload File
          </button>

          <button
            onClick={() => setShowCrawl(true)}
            className="btn-ghost"
          >
            <IconGlobe />
            Crawl URL
          </button>
        </div>

        {/* Feature cards */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
          width: "100%",
        }}>
          <FeatureCard
            icon={<IconBook />}
            title="Smart Import"
            description="PDF, DOCX, PPTX, HTML — auto-converted to searchable Markdown."
            delay={240}
          />
          <FeatureCard
            icon={<IconSparkle />}
            title="AI-Powered"
            description="Semantic search and RAG-based Q&A grounded in your documents."
            delay={300}
          />
          <FeatureCard
            icon={<IconChat />}
            title="Chat with Docs"
            description="Ask questions about any document and get instant, cited answers."
            delay={360}
          />
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
