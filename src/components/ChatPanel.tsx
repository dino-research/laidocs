import { useState, useRef, useEffect, useCallback } from "react";
import { streamChat } from "../lib/sidecar";
import MarkdownPreview from "./MarkdownPreview";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

const IconTrash = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/>
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
);

const IconX = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const IconSend = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/>
    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
);

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div style={{
      display: "flex", gap: 10,
      flexDirection: isUser ? "row-reverse" : "row",
      animation: "fadeInUp 0.2s cubic-bezier(0.22, 1, 0.36, 1) both",
    }}>
      {/* Avatar */}
      <div style={{
        flexShrink: 0, width: 26, height: 26, borderRadius: "50%",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 9, fontWeight: 600, letterSpacing: "0.5px",
        background: isUser ? "var(--btn-bg)" : "var(--surface-alt)",
        color: "var(--text-muted)",
        border: "1px solid var(--border)",
        marginTop: 2,
      }}>
        {isUser ? "You" : "AI"}
      </div>

      {/* Bubble */}
      <div style={{
        maxWidth: "82%",
        borderRadius: isUser ? "12px 12px 3px 12px" : "12px 12px 12px 3px",
        padding: "10px 14px",
        fontSize: 13,
        lineHeight: 1.65,
        background: isUser ? "var(--btn-bg)" : "var(--surface-alt)",
        color: isUser ? "var(--text-primary)" : "var(--text-secondary)",
        border: `1px solid ${isUser ? "var(--border-hover)" : "var(--border)"}`,
      }}>
        {isUser ? (
          <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{message.content}</p>
        ) : message.streaming ? (
          <div>
            <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{message.content}</p>
            <span className="chat-cursor" />
          </div>
        ) : (
          <div style={{ fontSize: 13 }}>
            <MarkdownPreview content={message.content} />
          </div>
        )}
      </div>
    </div>
  );
}

interface ChatPanelProps {
  docId: string;
  onClose: () => void;
}

export default function ChatPanel({ docId, onClose }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const sendMessage = useCallback(async () => {
    const question = input.trim();
    if (!question || streaming) return;
    setInput("");
    setError(null);

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: question };
    const assistantMsg: Message = { id: crypto.randomUUID(), role: "assistant", content: "", streaming: true };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setStreaming(true);

    try {
      await streamChat(docId, question, (token) => {
        setMessages((prev) =>
          prev.map((m) => m.id === assistantMsg.id ? { ...m, content: m.content + token } : m)
        );
      });
    } catch (err) {
      setError(String(err));
      setMessages((prev) => prev.filter((m) => m.id !== assistantMsg.id));
    } finally {
      setMessages((prev) =>
        prev.map((m) => m.id === assistantMsg.id ? { ...m, streaming: false } : m)
      );
      setStreaming(false);
    }
  }, [docId, input, streaming]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--surface)" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px", borderBottom: "1px solid var(--border)", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--success)" }} className="pulse" />
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", letterSpacing: "0" }}>
            Chat with Document
          </span>
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          <button
            onClick={() => { setMessages([]); setError(null); }}
            title="Clear conversation"
            className="btn-icon"
          >
            <IconTrash />
          </button>
          <button onClick={onClose} title="Close chat" className="btn-icon">
            <IconX />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 14 }}>
        {messages.length === 0 && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", height: "100%",
            textAlign: "center", padding: "32px 16px",
          }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-faint)", opacity: 0.45, marginBottom: 14 }}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-muted)", margin: "0 0 6px" }}>
              Ask anything about this document
            </p>
            <p style={{ fontSize: 11, color: "var(--text-faint)", margin: 0, lineHeight: 1.6 }}>
              Answers are grounded in this document only.<br/>
              Press Enter to send.
            </p>
          </div>
        )}

        {messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)}

        {error && (
          <div style={{
            padding: "10px 14px", borderRadius: 8,
            border: "1px solid rgba(192,112,112,0.25)",
            background: "var(--error-bg)",
            fontSize: 12, color: "var(--error)",
          }}>
            {error}
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{ padding: "10px 12px", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
          <textarea
            ref={inputRef}
            id="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question…"
            rows={2}
            disabled={streaming}
            className="warp-input"
            style={{ flex: 1, resize: "none", fontFamily: "inherit", fontSize: 13, borderRadius: 8 }}
          />
          <button
            id="chat-send-btn"
            onClick={sendMessage}
            disabled={!input.trim() || streaming}
            style={{
              flexShrink: 0, width: 34, height: 34,
              borderRadius: "var(--radius-pill)",
              background: "var(--btn-bg)", border: "1px solid var(--border-hover)",
              color: "var(--text-secondary)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "opacity 0.2s, background 0.15s",
              opacity: (!input.trim() || streaming) ? 0.3 : 1,
            }}
            onMouseEnter={e => { if (input.trim() && !streaming) e.currentTarget.style.background = "var(--btn-bg-hover)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "var(--btn-bg)"; }}
          >
            {streaming
              ? <div style={{ width: 13, height: 13, border: "1.5px solid var(--border)", borderTopColor: "var(--text-muted)", borderRadius: "50%" }} className="spin" />
              : <IconSend />
            }
          </button>
        </div>
        <p style={{ fontSize: 9, color: "var(--text-faint)", margin: "6px 0 0", letterSpacing: "1px", textTransform: "uppercase" }}>
          Grounded in this document only · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
