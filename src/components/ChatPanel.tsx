import { useState, useRef, useEffect, useCallback } from "react";
import { streamChat } from "../lib/sidecar";
import MarkdownPreview from "./MarkdownPreview";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar */}
      <div
        className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
          isUser
            ? "bg-blue-600 text-white"
            : "bg-gradient-to-br from-purple-600 to-blue-600 text-white"
        }`}
      >
        {isUser ? "U" : "AI"}
      </div>

      {/* Bubble */}
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
          isUser
            ? "bg-blue-600 text-white rounded-tr-sm"
            : "bg-white/5 border border-white/8 text-gray-200 rounded-tl-sm"
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : message.streaming ? (
          <div className="prose prose-sm prose-invert max-w-none">
            <p className="whitespace-pre-wrap">{message.content}</p>
            <span className="inline-block w-1.5 h-4 bg-blue-400 animate-pulse ml-0.5 align-middle" />
          </div>
        ) : (
          <div className="prose prose-sm prose-invert max-w-none">
            <MarkdownPreview content={message.content} />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChatPanel
// ---------------------------------------------------------------------------

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

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sendMessage = useCallback(async () => {
    const question = input.trim();
    if (!question || streaming) return;

    setInput("");
    setError(null);

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: question,
    };
    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      streaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setStreaming(true);

    try {
      await streamChat(docId, question, (token) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id ? { ...m, content: m.content + token } : m,
          ),
        );
      });
    } catch (err) {
      setError(String(err));
      setMessages((prev) => prev.filter((m) => m.id !== assistantMsg.id));
    } finally {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id ? { ...m, streaming: false } : m,
        ),
      );
      setStreaming(false);
    }
  }, [docId, input, streaming]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearHistory = () => {
    setMessages([]);
    setError(null);
  };

  return (
    <div className="flex flex-col h-full border-l border-white/8 bg-gray-950">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-sm font-semibold text-white">Chat with Document</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clearHistory}
            title="Clear conversation"
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          <button
            onClick={onClose}
            title="Close chat"
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Messages ─────────────────────────────────────────── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="text-4xl mb-3 opacity-60">💬</div>
            <p className="text-sm font-medium text-gray-400">Ask anything about this document</p>
            <p className="mt-1 text-xs text-gray-600">
              The AI will answer using only the document content
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-xs text-red-400">
            {error}
          </div>
        )}
      </div>

      {/* ── Input ─────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-t border-white/8">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            id="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question… (Enter to send, Shift+Enter for newline)"
            rows={2}
            disabled={streaming}
            className="flex-1 resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-gray-100 placeholder-gray-500 outline-none transition-all focus:border-blue-500/60 focus:bg-white/8 focus:ring-1 focus:ring-blue-500/40 disabled:opacity-50"
          />
          <button
            id="chat-send-btn"
            onClick={sendMessage}
            disabled={!input.trim() || streaming}
            className="shrink-0 flex items-center justify-center w-9 h-9 rounded-xl bg-blue-600 text-white transition-all hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {streaming ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
        </div>
        <p className="mt-1.5 text-xs text-gray-600">Answers are grounded in this document only</p>
      </div>
    </div>
  );
}
