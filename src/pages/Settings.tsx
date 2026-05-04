import { useEffect, useState, useCallback } from "react";
import { apiGet, apiPost, apiPut } from "../lib/sidecar";

// ── Types ──────────────────────────────────────────────────────────

interface ServiceConfig {
  base_url: string;
  api_key: string;
  model: string;
}

interface RerankerConfig extends ServiceConfig {
  enabled: boolean;
}

interface SettingsData {
  llm: ServiceConfig;
  embedding: ServiceConfig;
  reranker: RerankerConfig;
  port: number;
}

interface TestResult {
  type: "success" | "error";
  message: string;
}

// ── Reusable input component ──────────────────────────────────────

function PasswordInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label className="mb-1 block text-sm text-gray-400">{label}</label>
      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 pr-10 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-200"
          tabIndex={-1}
        >
          {visible ? "🙈 Hide" : "👁 Show"}
        </button>
      </div>
    </div>
  );
}

function TextInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm text-gray-400">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
      />
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm text-gray-400">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        placeholder={placeholder}
        className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
      />
    </div>
  );
}

function TestResultBadge({ result }: { result: TestResult | null }) {
  if (!result) return null;
  return (
    <p
      className={`mt-2 text-xs ${
        result.type === "success" ? "text-green-400" : "text-red-400"
      }`}
    >
      {result.type === "success" ? "✅" : "❌"} {result.message}
    </p>
  );
}

// ── Config section cards ──────────────────────────────────────────

function ServiceSection({
  title,
  icon,
  config,
  onChange,
  testResult,
  onTest,
  testLabel,
  testDisabled,
}: {
  title: string;
  icon: string;
  config: ServiceConfig;
  onChange: (cfg: ServiceConfig) => void;
  testResult: TestResult | null;
  onTest: () => void;
  testLabel: string;
  testDisabled?: boolean;
}) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
      <h2 className="mb-4 text-lg font-semibold text-gray-100">
        {icon} {title}
      </h2>

      <div className="space-y-3">
        <TextInput
          label="Base URL"
          value={config.base_url}
          onChange={(v) => onChange({ ...config, base_url: v })}
          placeholder="https://api.openai.com/v1"
        />
        <PasswordInput
          label="API Key"
          value={config.api_key}
          onChange={(v) => onChange({ ...config, api_key: v })}
          placeholder="sk-..."
        />
        <TextInput
          label="Model"
          value={config.model}
          onChange={(v) => onChange({ ...config, model: v })}
          placeholder="gpt-4"
        />
      </div>

      <div className="mt-4">
        <button
          type="button"
          disabled={testDisabled}
          onClick={onTest}
          className={`rounded px-4 py-1.5 text-sm font-medium text-white transition-colors ${
            testDisabled
              ? "cursor-not-allowed bg-gray-700 text-gray-400"
              : "bg-green-600 hover:bg-green-700"
          }`}
        >
          {testLabel}
        </button>
      </div>

      <TestResultBadge result={testResult} />
    </div>
  );
}

// ── Main Settings page ────────────────────────────────────────────

export default function Settings() {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Test results
  const [llmTest, setLlmTest] = useState<TestResult | null>(null);
  const [embTest, setEmbTest] = useState<TestResult | null>(null);

  // Track original settings for diffing
  const [original, setOriginal] = useState<SettingsData | null>(null);

  // Load settings on mount
  useEffect(() => {
    apiGet<SettingsData>("/api/settings")
      .then((data) => {
        setSettings(data);
        setOriginal(data);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Test LLM
  const testLlm = useCallback(async () => {
    if (!settings) return;
    setLlmTest(null);
    try {
      // Send current form values; backend falls back to saved if empty
      const res = await apiPost<{ success: boolean; response?: string; error?: string }>(
        "/api/settings/test-llm",
        {
          base_url: settings.llm.base_url,
          api_key: settings.llm.api_key,
          model: settings.llm.model,
        },
      );
      if (res.success) {
        setLlmTest({ type: "success", message: `LLM responded: "${res.response}"` });
      } else {
        setLlmTest({ type: "error", message: res.error ?? "Unknown error" });
      }
    } catch (err: unknown) {
      setLlmTest({ type: "error", message: (err as Error).message });
    }
  }, [settings]);

  // Test Embedding
  const testEmbedding = useCallback(async () => {
    if (!settings) return;
    setEmbTest(null);
    try {
      const res = await apiPost<{
        success: boolean;
        dimension?: number;
        usage?: Record<string, unknown>;
        error?: string;
      }>("/api/settings/test-embedding", {
        base_url: settings.embedding.base_url,
        api_key: settings.embedding.api_key,
        model: settings.embedding.model,
      });
      if (res.success) {
        setEmbTest({ type: "success", message: `Embedding OK — dimension: ${res.dimension}` });
      } else {
        setEmbTest({ type: "error", message: res.error ?? "Unknown error" });
      }
    } catch (err: unknown) {
      setEmbTest({ type: "error", message: (err as Error).message });
    }
  }, [settings]);

  // Save settings (only changed fields)
  const save = useCallback(async () => {
    if (!settings || !original) return;
    setSaving(true);
    setSaveStatus(null);
    try {
      const payload: Partial<SettingsData> = {};

      const llmChanged =
        settings.llm.base_url !== original.llm.base_url ||
        settings.llm.model !== original.llm.model ||
        settings.llm.api_key !== original.llm.api_key;
      if (llmChanged) {
        // Only send api_key if user actually changed it (not still masked)
        const llmPayload = {} as ServiceConfig;
        if (settings.llm.base_url !== original.llm.base_url) llmPayload.base_url = settings.llm.base_url;
        if (settings.llm.model !== original.llm.model) llmPayload.model = settings.llm.model;
        if (settings.llm.api_key !== original.llm.api_key) llmPayload.api_key = settings.llm.api_key;
        payload.llm = llmPayload;
      }

      const embChanged =
        settings.embedding.base_url !== original.embedding.base_url ||
        settings.embedding.model !== original.embedding.model ||
        settings.embedding.api_key !== original.embedding.api_key;
      if (embChanged) {
        const embPayload = {} as ServiceConfig;
        if (settings.embedding.base_url !== original.embedding.base_url)
          embPayload.base_url = settings.embedding.base_url;
        if (settings.embedding.model !== original.embedding.model) embPayload.model = settings.embedding.model;
        if (settings.embedding.api_key !== original.embedding.api_key)
          embPayload.api_key = settings.embedding.api_key;
        payload.embedding = embPayload;
      }

      const rerChanged =
        settings.reranker.base_url !== original.reranker.base_url ||
        settings.reranker.model !== original.reranker.model ||
        settings.reranker.api_key !== original.reranker.api_key ||
        settings.reranker.enabled !== original.reranker.enabled;
      if (rerChanged) {
        const rerPayload = {} as RerankerConfig;
        if (settings.reranker.base_url !== original.reranker.base_url)
          rerPayload.base_url = settings.reranker.base_url;
        if (settings.reranker.model !== original.reranker.model) rerPayload.model = settings.reranker.model;
        if (settings.reranker.api_key !== original.reranker.api_key)
          rerPayload.api_key = settings.reranker.api_key;
        if (settings.reranker.enabled !== original.reranker.enabled) rerPayload.enabled = settings.reranker.enabled;
        payload.reranker = rerPayload;
      }

      if (settings.port !== original.port) {
        payload.port = settings.port;
      }

      const updated = await apiPut<SettingsData>("/api/settings", payload);
      setSettings(updated);
      setOriginal(updated);
      setSaveStatus("Settings saved successfully.");
    } catch (err: unknown) {
      setSaveStatus(`Failed to save: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }, [settings, original]);

  // ── Render ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-gray-400">Loading settings…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-red-400">Error loading settings: {error}</p>
      </div>
    );
  }

  if (!settings) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-gray-400">Configure LLM, embedding, and reranker providers.</p>
      </div>

      {/* LLM Configuration */}
      <ServiceSection
        title="LLM Configuration"
        icon="🤖"
        config={settings.llm}
        onChange={(cfg) => setSettings({ ...settings, llm: cfg })}
        testResult={llmTest}
        onTest={testLlm}
        testLabel="Test LLM"
      />

      {/* Embedding Configuration */}
      <ServiceSection
        title="Embedding Configuration"
        icon="🔢"
        config={settings.embedding}
        onChange={(cfg) => setSettings({ ...settings, embedding: cfg })}
        testResult={embTest}
        onTest={testEmbedding}
        testLabel="Test Embedding"
      />

      {/* Reranker Configuration */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-100">
          ⚡ Reranker Configuration
        </h2>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={settings.reranker.enabled}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    reranker: { ...settings.reranker, enabled: e.target.checked },
                  })
                }
                className="peer sr-only"
              />
              <div className="h-6 w-11 rounded-full bg-gray-700 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-gray-400 after:transition-all peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:bg-white" />
            </label>
            <span className="text-sm text-gray-300">Enable Reranker</span>
          </div>

          <TextInput
            label="Base URL"
            value={settings.reranker.base_url}
            onChange={(v) =>
              setSettings({ ...settings, reranker: { ...settings.reranker, base_url: v } })
            }
            placeholder="https://api.openai.com/v1"
          />
          <PasswordInput
            label="API Key"
            value={settings.reranker.api_key}
            onChange={(v) =>
              setSettings({ ...settings, reranker: { ...settings.reranker, api_key: v } })
            }
            placeholder="sk-..."
          />
          <TextInput
            label="Model"
            value={settings.reranker.model}
            onChange={(v) =>
              setSettings({ ...settings, reranker: { ...settings.reranker, model: v } })
            }
            placeholder="rerank-v1"
          />
        </div>

        <div className="mt-4">
          <button
            type="button"
            disabled
            className="cursor-not-allowed rounded bg-gray-700 px-4 py-1.5 text-sm font-medium text-gray-400"
          >
            Test Reranker
          </button>
          <span className="ml-2 text-xs text-gray-500">(coming soon)</span>
        </div>
      </div>

      {/* General */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-100">
          🛠 General
        </h2>
        <NumberInput
          label="Server Port"
          value={settings.port}
          onChange={(v) => setSettings({ ...settings, port: v })}
          placeholder="8008"
        />
        <p className="mt-2 text-xs text-gray-500">
          Port the backend API listens on. Restart required after changing.
        </p>
      </div>

      {/* Save button + status */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="rounded bg-blue-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Settings"}
        </button>
        {saveStatus && (
          <p
            className={`text-sm ${
              saveStatus.startsWith("Settings")
                ? "text-green-400"
                : "text-red-400"
            }`}
          >
            {saveStatus}
          </p>
        )}
      </div>
    </div>
  );
}
