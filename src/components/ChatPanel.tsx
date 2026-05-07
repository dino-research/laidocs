import React, { useState, useRef, useEffect, useCallback } from "react";
import { streamChat, getChatHistory, startNewSession, clearChatHistory } from "../lib/sidecar";
import MarkdownPreview from "./MarkdownPreview";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  sessionId?: number;
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

const IconPlus = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
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
        flexShrink: 0, width: 24, height: 24, borderRadius: 7,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 8, fontWeight: 600, letterSpacing: "0.5px",
        background: isUser ? "var(--btn-bg)" : "var(--accent-subtle)",
        color: isUser ? "var(--text-muted)" : "var(--accent-text)",
        border: `1px solid ${isUser ? "var(--border)" : "var(--border-glow)"}`,
        marginTop: 2,
      }}>
        {isUser ? "You" : "AI"}
      </div>

      {/* Bubble */}
      <div style={{
        maxWidth: "85%",
        borderRadius: isUser ? "12px 12px 3px 12px" : "12px 12px 12px 3px",
        padding: "9px 13px",
        fontSize: 12,
        lineHeight: 1.6,
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
          <div style={{ fontSize: 12 }}>
            <MarkdownPreview content={message.content} compact />
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
  const [sessionId, setSessionId] = useState<number>(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Load chat history on mount
  useEffect(() => {
    getChatHistory(docId).then((history) => {
      if (history.length > 0) {
        const msgs: Message[] = history.map((h) => ({
          id: String(h.id),
          role: h.role,
          content: h.content,
          sessionId: h.session_id,
        }));
        setMessages(msgs);
        setSessionId(Math.max(...history.map(h => h.session_id)));
      }
    }).catch(() => { /* ignore load errors */ });
  }, [docId]);

  // Close drawer on Escape
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  const sendMessage = useCallback(async () => {
    const question = input.trim();
    if (!question || streaming) return;
    setInput("");
    setError(null);

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: question, sessionId };
    const assistantMsg: Message = { id: crypto.randomUUID(), role: "assistant", content: "", streaming: true, sessionId };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setStreaming(true);

    try {
      await streamChat(docId, question, (token) => {
        setMessages((prev) =>
          prev.map((m) => m.id === assistantMsg.id ? { ...m, content: m.content + token } : m)
        );
      }, sessionId);
    } catch (err) {
      setError(String(err));
      setMessages((prev) => prev.filter((m) => m.id !== assistantMsg.id));
    } finally {
      setMessages((prev) =>
        prev.map((m) => m.id === assistantMsg.id ? { ...m, streaming: false } : m)
      );
      setStreaming(false);
    }
  }, [docId, input, streaming, sessionId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--surface)" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "11px 14px", borderBottom: "1px solid var(--border)", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 6, height: 6, borderRadius: "50%",
            background: "var(--accent)",
            boxShadow: "0 0 8px var(--accent-glow)",
          }} className="pulse" />
          <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-secondary)", letterSpacing: "0" }}>
            Chat with Document
          </span>
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          <button
            onClick={async () => {
              const newId = await startNewSession(docId);
              setSessionId(newId);
            }}
            title="New session (fresh context)"
            className="btn-icon"
          >
            <IconPlus />
          </button>
          <button
            onClick={async () => {
              await clearChatHistory(docId);
              setMessages([]);
              setError(null);
              setSessionId(1);
            }}
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
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "14px", display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.length === 0 && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", height: "100%",
            textAlign: "center", padding: "32px 16px",
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: "var(--accent-subtle)",
              border: "1px solid var(--border-glow)",
              display: "flex", alignItems: "center", justifyContent: "center",
              marginBottom: 18,
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-text)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", margin: "0 0 5px" }}>
              Ask anything about this document
            </p>
            <p style={{ fontSize: 11, color: "var(--text-faint)", margin: 0, lineHeight: 1.6 }}>
              Answers are grounded in this document only.<br/>
              Press Enter to send.
            </p>
          </div>
        )}

        {messages.map((msg, idx) => {
          const prevSession = idx > 0 ? messages[idx - 1].sessionId : msg.sessionId;
          const showDivider = msg.sessionId !== prevSession;
          return (
            <React.Fragment key={msg.id}>
              {showDivider && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 0", color: "var(--text-faint)", fontSize: 10,
                }}>
                  <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                  <span>New Session</span>
                  <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                </div>
              )}
              <MessageBubble message={msg} />
            </React.Fragment>
          );
        })}

        {error && (
          <div style={{
            padding: "10px 14px", borderRadius: 10,
            border: "1px solid rgba(248,113,113,0.2)",
            background: "var(--error-bg)",
            fontSize: 12, color: "var(--error)",
          }}>
            {error}
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
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
            style={{ flex: 1, resize: "none", fontFamily: "inherit", fontSize: 12, borderRadius: 8 }}
          />
          <button
            id="chat-send-btn"
            onClick={sendMessage}
            disabled={!input.trim() || streaming}
            style={{
              flexShrink: 0, width: 32, height: 32,
              borderRadius: 8,
              background: input.trim() && !streaming ? "var(--btn-accent)" : "var(--btn-bg)",
              border: "1px solid transparent",
              color: "#fff", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.2s cubic-bezier(0.22,1,0.36,1)",
              opacity: (!input.trim() || streaming) ? 0.4 : 1,
              boxShadow: input.trim() && !streaming ? "0 2px 10px var(--accent-glow)" : "none",
            }}
          >
            {streaming
              ? <div style={{ width: 13, height: 13, border: "1.5px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%" }} className="spin" />
              : <IconSend />
            }
          </button>
        </div>
        <p style={{ fontSize: 8, color: "var(--text-faint)", margin: "5px 0 0", letterSpacing: "0.8px", textTransform: "uppercase" }}>
          Grounded in this document only · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
