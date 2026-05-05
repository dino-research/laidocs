import ReactMarkdown from "react-markdown";
import { API_BASE } from "../lib/sidecar";
import remarkGfm from "remark-gfm";

interface MarkdownPreviewProps {
  content: string;
}

export default function MarkdownPreview({ content }: MarkdownPreviewProps) {
  return (
    <div style={{ overflow: "auto", height: "100%", padding: "28px 32px" }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 style={{ fontSize: 24, fontWeight: 400, color: "var(--text-primary)", marginBottom: 16, marginTop: 24, paddingBottom: 8, borderBottom: "1px solid var(--border)", lineHeight: 1.3, letterSpacing: "-0.24px" }}>
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 style={{ fontSize: 20, fontWeight: 400, color: "var(--text-primary)", marginBottom: 12, marginTop: 20, paddingBottom: 6, borderBottom: "1px solid var(--border)", lineHeight: 1.3, letterSpacing: "-0.2px" }}>
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 style={{ fontSize: 17, fontWeight: 500, color: "var(--text-primary)", marginBottom: 10, marginTop: 18, lineHeight: 1.4 }}>
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 style={{ fontSize: 15, fontWeight: 500, color: "var(--text-primary)", marginBottom: 8, marginTop: 14, lineHeight: 1.4 }}>
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p style={{ color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.75, fontSize: 15 }}>
              {children}
            </p>
          ),
          a: ({ href, children }) => (
            <a href={href} style={{ color: "var(--text-link)", textDecoration: "underline", textUnderlineOffset: 3 }} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          ul: ({ children }) => (
            <ul style={{ color: "var(--text-secondary)", marginBottom: 16, paddingLeft: 20, listStyleType: "disc", fontSize: 15, lineHeight: 1.7 }}>
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol style={{ color: "var(--text-secondary)", marginBottom: 16, paddingLeft: 20, listStyleType: "decimal", fontSize: 15, lineHeight: 1.7 }}>
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li style={{ marginBottom: 4, lineHeight: 1.7 }}>{children}</li>
          ),
          blockquote: ({ children }) => (
            <blockquote style={{
              borderLeft: "3px solid var(--border-strong)",
              paddingLeft: 16, margin: "16px 0",
              color: "var(--text-muted)", fontStyle: "italic",
              background: "var(--surface-alt)", borderRadius: "0 6px 6px 0",
              padding: "12px 16px",
            }}>
              {children}
            </blockquote>
          ),
          code: ({ className, children }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code style={{
                  background: "var(--surface-alt)", color: "var(--text-secondary)",
                  padding: "2px 6px", borderRadius: 4, fontSize: 13,
                  fontFamily: "'Geist Mono', 'Courier New', monospace",
                  border: "1px solid var(--border)",
                }}>
                  {children}
                </code>
              );
            }
            return (
              <code style={{ fontFamily: "'Geist Mono', 'Courier New', monospace", fontSize: 13 }} className={className}>
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre style={{
              background: "var(--surface-alt)", borderRadius: 8, padding: "16px 20px",
              marginBottom: 16, overflowX: "auto",
              border: "1px solid var(--border)", fontSize: 13,
              fontFamily: "'Geist Mono', 'Courier New', monospace",
            }}>
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div style={{ overflowX: "auto", marginBottom: 16 }}>
              <table style={{ minWidth: "100%", borderCollapse: "collapse", border: "1px solid var(--border)", borderRadius: 8 }}>
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead style={{ background: "var(--surface-alt)" }}>{children}</thead>
          ),
          th: ({ children }) => (
            <th style={{ border: "1px solid var(--border)", padding: "8px 12px", textAlign: "left", fontSize: 12, fontWeight: 500, color: "var(--text-muted)", letterSpacing: "1px", textTransform: "uppercase" }}>
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td style={{ border: "1px solid var(--border)", padding: "8px 12px", fontSize: 14, color: "var(--text-secondary)" }}>
              {children}
            </td>
          ),
          hr: () => <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "24px 0" }} />,
          img: ({ src, alt }) => {
            // Rewrite vault asset URLs to point at the backend server.
            // Stored markdown uses relative paths like /assets/xxx.png which
            // the browser would resolve against the frontend origin (Vite/Tauri)
            // instead of the FastAPI sidecar at API_BASE.
            const resolvedSrc = src?.startsWith("/assets/") ? `${API_BASE}${src}` : src;
            return (
              <img src={resolvedSrc} alt={alt ?? ""} style={{ maxWidth: "100%", borderRadius: 8, margin: "12px 0", border: "1px solid var(--border)" }} />
            );
          },
          strong: ({ children }) => (
            <strong style={{ fontWeight: 500, color: "var(--text-primary)" }}>{children}</strong>
          ),
          em: ({ children }) => (
            <em style={{ fontStyle: "italic", color: "var(--text-secondary)" }}>{children}</em>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
