import { useEffect, useState, useCallback } from "react";
import { apiGet, apiPost, apiPut } from "../lib/sidecar";

interface ServiceConfig { base_url: string; api_key: string; model: string; }
interface RerankerConfig extends ServiceConfig { enabled: boolean; }
interface SettingsData { llm: ServiceConfig; embedding: ServiceConfig; reranker: RerankerConfig; port: number; }
interface TestResult { type: "success" | "error"; message: string; }

// ── Shared input components ───────────────────────────────────────
function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label style={{ display: "block", fontSize: 11, color: "var(--text-muted)", letterSpacing: "1.4px", textTransform: "uppercase", marginBottom: 6 }}>{children}</label>;
}

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
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="warp-input"
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setVisible(!visible)}
            style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.5px" }}
            tabIndex={-1}
          >
            {visible ? "Hide" : "Show"}
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

function TestResultBadge({ result }: { result: TestResult | null }) {
  if (!result) return null;
  return (
    <p style={{ marginTop: 10, fontSize: 12, color: result.type === "success" ? "var(--success)" : "var(--error)" }}>
      {result.message}
    </p>
  );
}

// ── SVG Icons ─────────────────────────────────────────────────────
const IconLLM = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
  </svg>
);

const IconEmbed = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
  </svg>
);

const IconRerank = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
    <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
  </svg>
);

const IconGeneral = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);

// ── Section card ──────────────────────────────────────────────────
function ServiceSection({ title, icon, config, onChange, testResult, onTest, testLabel, testDisabled }: {
  title: string; icon: React.ReactNode; config: ServiceConfig;
  onChange: (cfg: ServiceConfig) => void; testResult: TestResult | null;
  onTest: () => void; testLabel: string; testDisabled?: boolean;
}) {
  return (
    <div className="warp-card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        <span style={{ color: "var(--text-muted)" }}>{icon}</span>
        <h2 style={{ fontSize: 15, fontWeight: 500, color: "var(--text-primary)", margin: 0 }}>{title}</h2>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <WarpInput label="Base URL" value={config.base_url} onChange={(v) => onChange({ ...config, base_url: v })} placeholder="https://api.openai.com/v1" />
        <WarpInput label="API Key" value={config.api_key} onChange={(v) => onChange({ ...config, api_key: v })} placeholder="sk-..." type="password" />
        <WarpInput label="Model" value={config.model} onChange={(v) => onChange({ ...config, model: v })} placeholder="gpt-4o" />
      </div>
      <div style={{ marginTop: 16 }}>
        <button type="button" disabled={testDisabled} onClick={onTest} className={testDisabled ? "" : "btn-ghost"} style={testDisabled ? { fontSize: 13, color: "var(--text-muted)", background: "none", border: "1px solid var(--border)", borderRadius: "var(--radius-pill)", padding: "7px 18px", cursor: "not-allowed", opacity: 0.5 } : {}}>
          {testLabel}
        </button>
        <TestResultBadge result={testResult} />
      </div>
    </div>
  );
}

// ── Toggle ────────────────────────────────────────────────────────
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ position: "relative", display: "inline-flex", cursor: "pointer", alignItems: "center", gap: 10 }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ position: "absolute", opacity: 0, width: 0, height: 0 }} />
      <div style={{
        width: 40, height: 22, borderRadius: 11,
        background: checked ? "var(--btn-bg)" : "var(--surface-alt)",
        border: "1px solid var(--border)",
        position: "relative", transition: "background 0.2s",
      }}>
        <div style={{
          position: "absolute", top: 2, left: checked ? 18 : 2,
          width: 16, height: 16, borderRadius: "50%",
          background: checked ? "var(--text-secondary)" : "var(--text-muted)",
          transition: "left 0.2s",
        }} />
      </div>
    </label>
  );
}

// ── Settings page ─────────────────────────────────────────────────
export default function Settings() {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [llmTest, setLlmTest] = useState<TestResult | null>(null);
  const [embTest, setEmbTest] = useState<TestResult | null>(null);
  const [original, setOriginal] = useState<SettingsData | null>(null);

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
        base_url: settings.llm.base_url, api_key: settings.llm.api_key, model: settings.llm.model,
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
        base_url: settings.embedding.base_url, api_key: settings.embedding.api_key, model: settings.embedding.model,
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
      const llmChanged = settings.llm.base_url !== original.llm.base_url || settings.llm.model !== original.llm.model || settings.llm.api_key !== original.llm.api_key;
      if (llmChanged) {
        const p = {} as ServiceConfig;
        if (settings.llm.base_url !== original.llm.base_url) p.base_url = settings.llm.base_url;
        if (settings.llm.model !== original.llm.model) p.model = settings.llm.model;
        if (settings.llm.api_key !== original.llm.api_key) p.api_key = settings.llm.api_key;
        payload.llm = p;
      }
      const embChanged = settings.embedding.base_url !== original.embedding.base_url || settings.embedding.model !== original.embedding.model || settings.embedding.api_key !== original.embedding.api_key;
      if (embChanged) {
        const p = {} as ServiceConfig;
        if (settings.embedding.base_url !== original.embedding.base_url) p.base_url = settings.embedding.base_url;
        if (settings.embedding.model !== original.embedding.model) p.model = settings.embedding.model;
        if (settings.embedding.api_key !== original.embedding.api_key) p.api_key = settings.embedding.api_key;
        payload.embedding = p;
      }
      const rerChanged = settings.reranker.base_url !== original.reranker.base_url || settings.reranker.model !== original.reranker.model || settings.reranker.api_key !== original.reranker.api_key || settings.reranker.enabled !== original.reranker.enabled;
      if (rerChanged) {
        const p = {} as RerankerConfig;
        if (settings.reranker.base_url !== original.reranker.base_url) p.base_url = settings.reranker.base_url;
        if (settings.reranker.model !== original.reranker.model) p.model = settings.reranker.model;
        if (settings.reranker.api_key !== original.reranker.api_key) p.api_key = settings.reranker.api_key;
        if (settings.reranker.enabled !== original.reranker.enabled) p.enabled = settings.reranker.enabled;
        payload.reranker = p;
      }
      if (settings.port !== original.port) payload.port = settings.port;
      const updated = await apiPut<SettingsData>("/api/settings", payload);
      setSettings(updated); setOriginal(updated);
      setSaveStatus("Settings saved successfully.");
    } catch (err: unknown) {
      setSaveStatus(`Failed to save: ${(err as Error).message}`);
    } finally { setSaving(false); }
  }, [settings, original]);

  if (loading) return (
    <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Loading settings…</p>
    </div>
  );

  if (error) return (
    <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "var(--error)", fontSize: 14 }}>Error: {error}</p>
    </div>
  );

  if (!settings) return null;

  return (
    <div style={{ maxWidth: 640, padding: "32px 40px" }}>
      <h1 className="heading-display" style={{ margin: "0 0 6px" }}>Settings</h1>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 32px", letterSpacing: "0.2px" }}>
        Configure LLM, embedding, and reranker providers.
      </p>

      <ServiceSection title="LLM" icon={<IconLLM />} config={settings.llm}
        onChange={(cfg) => setSettings({ ...settings, llm: cfg })}
        testResult={llmTest} onTest={testLlm} testLabel="Test LLM" />

      <ServiceSection title="Embedding" icon={<IconEmbed />} config={settings.embedding}
        onChange={(cfg) => setSettings({ ...settings, embedding: cfg })}
        testResult={embTest} onTest={testEmbedding} testLabel="Test Embedding" />

      {/* Reranker */}
      <div className="warp-card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <span style={{ color: "var(--text-muted)" }}><IconRerank /></span>
          <h2 style={{ fontSize: 15, fontWeight: 500, color: "var(--text-primary)", margin: 0 }}>Reranker</h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <Toggle checked={settings.reranker.enabled} onChange={(v) => setSettings({ ...settings, reranker: { ...settings.reranker, enabled: v } })} />
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Enable Reranker</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <WarpInput label="Base URL" value={settings.reranker.base_url} onChange={(v) => setSettings({ ...settings, reranker: { ...settings.reranker, base_url: v } })} placeholder="https://api.openai.com/v1" />
          <WarpInput label="API Key" value={settings.reranker.api_key} onChange={(v) => setSettings({ ...settings, reranker: { ...settings.reranker, api_key: v } })} placeholder="sk-..." type="password" />
          <WarpInput label="Model" value={settings.reranker.model} onChange={(v) => setSettings({ ...settings, reranker: { ...settings.reranker, model: v } })} placeholder="rerank-v1" />
        </div>
        <div style={{ marginTop: 16 }}>
          <button disabled style={{ fontSize: 13, color: "var(--text-muted)", background: "none", border: "1px solid var(--border)", borderRadius: "var(--radius-pill)", padding: "7px 18px", cursor: "not-allowed", opacity: 0.4 }}>
            Test Reranker
          </button>
          <span style={{ marginLeft: 10, fontSize: 11, color: "var(--text-muted)", letterSpacing: "1px" }}>coming soon</span>
        </div>
      </div>

      {/* General */}
      <div className="warp-card" style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <span style={{ color: "var(--text-muted)" }}><IconGeneral /></span>
          <h2 style={{ fontSize: 15, fontWeight: 500, color: "var(--text-primary)", margin: 0 }}>General</h2>
        </div>
        <WarpNumberInput label="Server Port" value={settings.port} onChange={(v) => setSettings({ ...settings, port: v })} placeholder="8008" />
        <p style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)" }}>Restart required after changing port.</p>
      </div>

      {/* Save */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <button type="button" disabled={saving} onClick={save} className="btn-primary">
          {saving ? "Saving…" : "Save Settings"}
        </button>
        {saveStatus && (
          <p style={{ fontSize: 13, color: saveStatus.startsWith("Settings") ? "var(--success)" : "var(--error)", margin: 0 }}>
            {saveStatus}
          </p>
        )}
      </div>
    </div>
  );
}
