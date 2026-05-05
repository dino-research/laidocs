import { useEffect, useState, useCallback } from "react";
import { apiGet, apiPost, apiPut } from "../lib/sidecar";

interface ServiceConfig { base_url: string; api_key: string; model: string; }
interface RerankerConfig extends ServiceConfig { enabled: boolean; }
interface SettingsData { llm: ServiceConfig; embedding: ServiceConfig; reranker: RerankerConfig; port: number; }
interface TestResult { type: "success" | "error"; message: string; }

// ── Field label ───────────────────────────────────────────────────
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{
      display: "block", fontSize: 10, color: "var(--text-faint)",
      letterSpacing: "1.4px", textTransform: "uppercase", marginBottom: 7, fontWeight: 500,
    }}>
      {children}
    </label>
  );
}

// ── Text input ────────────────────────────────────────────────────
function WarpInput({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  const [visible, setVisible] = useState(false);
  const isPassword = type === "password";
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div style={{ position: "relative" }}>
        <input
          type={isPassword && !visible ? "password" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          placeholder={placeholder}
          className="warp-input"
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setVisible(!visible)}
            style={{
              position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", cursor: "pointer",
              fontSize: 10, color: "var(--text-faint)", letterSpacing: "0.5px",
              transition: "color 0.15s", padding: "2px 4px",
            }}
            tabIndex={-1}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--text-muted)")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--text-faint)")}
          >
            {visible ? "HIDE" : "SHOW"}
          </button>
        )}
      </div>
    </div>
  );
}

function WarpNumberInput({ label, value, onChange, placeholder }: {
  label: string; value: number; onChange: (v: number) => void; placeholder?: string;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} placeholder={placeholder} className="warp-input" />
    </div>
  );
}

// ── Test result ───────────────────────────────────────────────────
function TestResultBadge({ result }: { result: TestResult | null }) {
  if (!result) return null;
  return (
    <div style={{
      marginTop: 12, padding: "10px 14px", borderRadius: 8, fontSize: 12,
      color: result.type === "success" ? "var(--success)" : "var(--error)",
      background: result.type === "success" ? "var(--success-bg)" : "var(--error-bg)",
      border: `1px solid ${result.type === "success" ? "rgba(122,171,122,0.2)" : "rgba(192,112,112,0.2)"}`,
      lineHeight: 1.5, animation: "fadeIn 0.18s ease-out",
    }}>
      {result.message}
    </div>
  );
}

// ── SVG Icons ─────────────────────────────────────────────────────
const IconLLM = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
  </svg>
);
const IconEmbed = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
  </svg>
);
const IconRerank = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
    <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
  </svg>
);
const IconGeneral = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);

// ── Toggle ────────────────────────────────────────────────────────
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ position: "relative", display: "inline-flex", cursor: "pointer", alignItems: "center", gap: 10 }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ position: "absolute", opacity: 0, width: 0, height: 0 }} />
      <div className="warp-toggle-track" style={{
        background: checked ? "var(--btn-bg)" : "var(--surface-alt)",
        border: `1px solid ${checked ? "var(--border-strong)" : "var(--border)"}`,
      }}>
        <div className="warp-toggle-thumb" style={{
          left: checked ? 18 : 2,
          background: checked ? "var(--text-secondary)" : "var(--text-faint)",
        }} />
      </div>
    </label>
  );
}

// ── Service section card ───────────────────────────────────────────
function ServiceSection({ title, icon, config, onChange, testResult, onTest, testLabel, testDisabled, children }: {
  title: string; icon: React.ReactNode; config: ServiceConfig;
  onChange: (cfg: ServiceConfig) => void; testResult: TestResult | null;
  onTest: () => void; testLabel: string; testDisabled?: boolean;
  children?: React.ReactNode;
}) {
  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    await onTest();
    setTesting(false);
  };

  return (
    <div className="warp-card" style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 20 }}>
        <span style={{ color: "var(--text-faint)" }}>{icon}</span>
        <h2 style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", margin: 0, letterSpacing: "-0.1px" }}>
          {title}
        </h2>
      </div>
      {children}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <WarpInput label="Base URL" value={config.base_url} onChange={(v) => onChange({ ...config, base_url: v })} placeholder="https://api.openai.com/v1" />
        <WarpInput label="API Key" value={config.api_key} onChange={(v) => onChange({ ...config, api_key: v })} placeholder="sk-..." type="password" />
        <WarpInput label="Model" value={config.model} onChange={(v) => onChange({ ...config, model: v })} placeholder="gpt-4o" />
      </div>
      <div style={{ marginTop: 18 }}>
        <button
          type="button"
          disabled={testDisabled || testing}
          onClick={handleTest}
          className="btn-ghost"
          style={{ fontSize: 12, padding: "6px 16px", opacity: testDisabled ? 0.4 : 1, cursor: testDisabled ? "not-allowed" : "pointer" }}
        >
          {testing ? (
            <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span className="spin" style={{ display: "inline-block", width: 11, height: 11, border: "1.5px solid var(--border)", borderTopColor: "var(--text-muted)", borderRadius: "50%" }} />
              Testing…
            </span>
          ) : testLabel}
        </button>
        <TestResultBadge result={testResult} />
      </div>
    </div>
  );
}

// ── Settings page ─────────────────────────────────────────────────
type Tab = "llm" | "embedding" | "reranker" | "general";

const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "llm",       label: "LLM",       icon: <IconLLM /> },
  { id: "embedding", label: "Embedding", icon: <IconEmbed /> },
  { id: "reranker",  label: "Reranker",  icon: <IconRerank /> },
  { id: "general",   label: "General",   icon: <IconGeneral /> },
];

export default function Settings() {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [llmTest, setLlmTest] = useState<TestResult | null>(null);
  const [embTest, setEmbTest] = useState<TestResult | null>(null);
  const [original, setOriginal] = useState<SettingsData | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("llm");

  useEffect(() => {
    apiGet<SettingsData>("/api/settings")
      .then((data) => { setSettings(data); setOriginal(data); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const testLlm = useCallback(async () => {
    if (!settings) return;
    setLlmTest(null);
    try {
      const res = await apiPost<{ success: boolean; response?: string; error?: string }>("/api/settings/test-llm", {
        base_url: settings.llm.base_url || "https://api.openai.com/v1", api_key: settings.llm.api_key, model: settings.llm.model,
      });
      setLlmTest(res.success
        ? { type: "success", message: `LLM responded: "${res.response}"` }
        : { type: "error", message: res.error ?? "Unknown error" });
    } catch (err: unknown) {
      setLlmTest({ type: "error", message: (err as Error).message });
    }
  }, [settings]);

  const testEmbedding = useCallback(async () => {
    if (!settings) return;
    setEmbTest(null);
    try {
      const res = await apiPost<{ success: boolean; dimension?: number; error?: string }>("/api/settings/test-embedding", {
        base_url: settings.embedding.base_url || "https://api.openai.com/v1", api_key: settings.embedding.api_key, model: settings.embedding.model,
      });
      setEmbTest(res.success
        ? { type: "success", message: `Embedding OK — dimension: ${res.dimension}` }
        : { type: "error", message: res.error ?? "Unknown error" });
    } catch (err: unknown) {
      setEmbTest({ type: "error", message: (err as Error).message });
    }
  }, [settings]);

  const save = useCallback(async () => {
    if (!settings || !original) return;
    setSaving(true); setSaveStatus(null);
    try {
      const payload: Partial<SettingsData> = {};
      
      const llmBaseUrl = settings.llm.base_url || "https://api.openai.com/v1";
      const llmChanged = llmBaseUrl !== original.llm.base_url || settings.llm.model !== original.llm.model || settings.llm.api_key !== original.llm.api_key;
      if (llmChanged) {
        payload.llm = { base_url: llmBaseUrl, model: settings.llm.model, api_key: settings.llm.api_key };
      }
      
      const embBaseUrl = settings.embedding.base_url || "https://api.openai.com/v1";
      const embChanged = embBaseUrl !== original.embedding.base_url || settings.embedding.model !== original.embedding.model || settings.embedding.api_key !== original.embedding.api_key;
      if (embChanged) {
        payload.embedding = { base_url: embBaseUrl, model: settings.embedding.model, api_key: settings.embedding.api_key };
      }
      
      const rerBaseUrl = settings.reranker.base_url || "https://api.openai.com/v1";
      const rerChanged = rerBaseUrl !== original.reranker.base_url || settings.reranker.model !== original.reranker.model || settings.reranker.api_key !== original.reranker.api_key || settings.reranker.enabled !== original.reranker.enabled;
      if (rerChanged) {
        payload.reranker = { base_url: rerBaseUrl, model: settings.reranker.model, api_key: settings.reranker.api_key, enabled: settings.reranker.enabled };
      }
      
      if (settings.port !== original.port) payload.port = settings.port;
      const updated = await apiPut<SettingsData>("/api/settings", payload);
      setSettings(updated); setOriginal(updated);
      setSaveStatus("saved");
    } catch (err: unknown) {
      setSaveStatus(`error:${(err as Error).message}`);
    } finally { setSaving(false); }
  }, [settings, original]);

  // ── Dirty check ───────────────────────────────────────────────
  const isDirty = (() => {
    if (!settings || !original) return false;
    const llmBaseUrl = settings.llm.base_url || "https://api.openai.com/v1";
    if (llmBaseUrl !== original.llm.base_url) return true;
    if (settings.llm.model !== original.llm.model) return true;
    if (settings.llm.api_key !== original.llm.api_key) return true;
    
    const embBaseUrl = settings.embedding.base_url || "https://api.openai.com/v1";
    if (embBaseUrl !== original.embedding.base_url) return true;
    if (settings.embedding.model !== original.embedding.model) return true;
    if (settings.embedding.api_key !== original.embedding.api_key) return true;

    const rerBaseUrl = settings.reranker.base_url || "https://api.openai.com/v1";
    if (rerBaseUrl !== original.reranker.base_url) return true;
    if (settings.reranker.model !== original.reranker.model) return true;
    if (settings.reranker.api_key !== original.reranker.api_key) return true;
    if (settings.reranker.enabled !== original.reranker.enabled) return true;

    if (settings.port !== original.port) return true;

    return false;
  })();

  if (loading) return (
    <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <div style={{ width: 18, height: 18, border: "2px solid var(--border)", borderTopColor: "var(--text-muted)", borderRadius: "50%" }} className="spin" />
        <p style={{ color: "var(--text-faint)", fontSize: 13 }}>Loading settings…</p>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "var(--error)", fontSize: 14 }}>Error: {error}</p>
    </div>
  );

  if (!settings) return null;

  const isSaveError = saveStatus?.startsWith("error:");
  const saveMsg = isSaveError ? saveStatus!.slice(6) : saveStatus === "saved" ? "Settings saved." : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Page header */}
      <div style={{ padding: "28px 40px 0", borderBottom: "1px solid var(--border)", flexShrink: 0 }} className="fade-in">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h1 className="heading-display" style={{ margin: "0 0 6px" }}>Settings</h1>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
              Configure LLM, embedding, and reranker providers.
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
            {saveMsg && (
              <span style={{
                fontSize: 12, color: isSaveError ? "var(--error)" : "var(--success)",
                animation: "fadeIn 0.2s ease-out",
              }}>
                {saveMsg}
              </span>
            )}
            <button
              type="button"
              disabled={saving || !isDirty}
              onClick={save}
              className="btn-primary"
              style={{ opacity: (!isDirty && !saving) ? 0.4 : 1 }}
            >
              {saving ? (
                <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span className="spin" style={{ display: "inline-block", width: 12, height: 12, border: "1.5px solid rgba(255,255,255,0.2)", borderTopColor: "var(--text-secondary)", borderRadius: "50%" }} />
                  Saving…
                </span>
              ) : "Save Settings"}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0 }}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 7,
                  padding: "9px 16px", fontSize: 13, fontWeight: isActive ? 500 : 400,
                  color: isActive ? "var(--text-primary)" : "var(--text-muted)",
                  background: "none", border: "none", cursor: "pointer",
                  borderBottom: isActive ? "2px solid var(--text-secondary)" : "2px solid transparent",
                  marginBottom: -1,
                  transition: "color 0.15s, border-color 0.15s",
                  fontFamily: "inherit",
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = "var(--text-secondary)"; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = "var(--text-muted)"; }}
              >
                <span style={{ color: isActive ? "var(--text-muted)" : "var(--text-faint)" }}>{tab.icon}</span>
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "28px 40px" }}>
        <div style={{ maxWidth: 600 }} className="fade-in" key={activeTab}>

          {activeTab === "llm" && (
            <ServiceSection
              title="Language Model"
              icon={<IconLLM />}
              config={settings.llm}
              onChange={(cfg) => setSettings({ ...settings, llm: cfg })}
              testResult={llmTest}
              onTest={testLlm}
              testLabel="Test connection"
            />
          )}

          {activeTab === "embedding" && (
            <ServiceSection
              title="Embedding Model"
              icon={<IconEmbed />}
              config={settings.embedding}
              onChange={(cfg) => setSettings({ ...settings, embedding: cfg })}
              testResult={embTest}
              onTest={testEmbedding}
              testLabel="Test connection"
            />
          )}

          {activeTab === "reranker" && (
            <div className="warp-card">
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 20 }}>
                <span style={{ color: "var(--text-faint)" }}><IconRerank /></span>
                <h2 style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", margin: 0 }}>Reranker</h2>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22, padding: "12px 16px", background: "var(--surface-alt)", borderRadius: 8, border: "1px solid var(--border)" }}>
                <Toggle checked={settings.reranker.enabled} onChange={(v) => setSettings({ ...settings, reranker: { ...settings.reranker, enabled: v } })} />
                <div>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 500 }}>Enable Reranker</div>
                  <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>Improves search relevance using a cross-encoder model</div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14, opacity: settings.reranker.enabled ? 1 : 0.45, transition: "opacity 0.2s" }}>
                <WarpInput label="Base URL" value={settings.reranker.base_url} onChange={(v) => setSettings({ ...settings, reranker: { ...settings.reranker, base_url: v } })} placeholder="https://api.openai.com/v1" />
                <WarpInput label="API Key" value={settings.reranker.api_key} onChange={(v) => setSettings({ ...settings, reranker: { ...settings.reranker, api_key: v } })} placeholder="sk-..." type="password" />
                <WarpInput label="Model" value={settings.reranker.model} onChange={(v) => setSettings({ ...settings, reranker: { ...settings.reranker, model: v } })} placeholder="rerank-v1" />
              </div>
              <div style={{ marginTop: 18 }}>
                <button disabled className="btn-ghost" style={{ fontSize: 12, padding: "6px 16px", opacity: 0.35, cursor: "not-allowed" }}>
                  Test connection
                </button>
                <span style={{ marginLeft: 10, fontSize: 10, color: "var(--text-faint)", letterSpacing: "1px", textTransform: "uppercase" }}>coming soon</span>
              </div>
            </div>
          )}

          {activeTab === "general" && (
            <div className="warp-card">
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 20 }}>
                <span style={{ color: "var(--text-faint)" }}><IconGeneral /></span>
                <h2 style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", margin: 0 }}>General</h2>
              </div>
              <WarpNumberInput label="Server Port" value={settings.port} onChange={(v) => setSettings({ ...settings, port: v })} placeholder="8008" />
              <p style={{ marginTop: 8, fontSize: 12, color: "var(--text-faint)", lineHeight: 1.6 }}>
                Restart required after changing port.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
