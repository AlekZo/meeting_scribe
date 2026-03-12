// OpenRouter API client with task-based model routing and cost tracking

import { loadSetting, saveSetting } from "@/lib/storage";

export type AITask = "summarization" | "cleaning" | "embedding" | "vision" | "default";

export interface ModelOption {
  id: string;
  label: string;
  costIn: number;   // $ per 1M input tokens
  costOut: number;  // $ per 1M output tokens
  context: number;  // max context window
}

// Hardcoded fallback catalog
const FALLBACK_CATALOG: ModelOption[] = [
  { id: "openrouter/hunter-alpha", label: "Hunter Alpha (Free, 1M ctx)", costIn: 0, costOut: 0, context: 1_050_000 },
  { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B", costIn: 0.10, costOut: 0.32, context: 131_072 },
  { id: "qwen/qwen-3.5-plus-2026-02-15", label: "Qwen 3.5 Plus", costIn: 0.30, costOut: 0.90, context: 1_000_000 },
  { id: "minimax/minimax-m2.1", label: "MiniMax M2.1", costIn: 0.27, costOut: 0.95, context: 256_000 },
  { id: "openai/gpt-5.1-chat", label: "GPT-5.1 Chat", costIn: 1.25, costOut: 10, context: 256_000 },
  { id: "openai/gpt-5.1", label: "GPT-5.1", costIn: 1.25, costOut: 10, context: 256_000 },
  { id: "qwen/qwen3-embedding-8b", label: "Qwen3 Embedding 8B", costIn: 0.01, costOut: 0, context: 32_768 },
  { id: "qwen/qwen3-vl-235b-a22b-instruct", label: "Qwen3 VL 235B", costIn: 0.20, costOut: 0.88, context: 131_072 },
];

/** Get the model catalog — synced from OpenRouter or fallback */
export function getModelCatalog(): ModelOption[] {
  const synced = loadSetting<ModelOption[] | null>("openrouter_model_catalog", null);
  return synced && synced.length > 0 ? synced : FALLBACK_CATALOG;
}

// Re-export for backward compat
export const MODEL_CATALOG = getModelCatalog();

/** Fetch models & pricing from OpenRouter API and cache locally */
export async function syncModelCatalog(): Promise<{ count: number; timestamp: string }> {
  const resp = await fetch("https://openrouter.ai/api/v1/models");
  if (!resp.ok) throw new Error(`OpenRouter returned ${resp.status}`);
  const data = await resp.json();
  const models: ModelOption[] = (data.data ?? [])
    .filter((m: any) => m.pricing && m.id)
    .map((m: any) => {
      const costIn = parseFloat(m.pricing?.prompt ?? "0") * 1_000_000;
      const costOut = parseFloat(m.pricing?.completion ?? "0") * 1_000_000;
      const ctx = m.context_length ?? 0;
      return {
        id: m.id,
        label: m.name ?? m.id,
        costIn: Math.round(costIn * 100) / 100,
        costOut: Math.round(costOut * 100) / 100,
        context: ctx,
      };
    })
    .sort((a: ModelOption, b: ModelOption) => a.costIn - b.costIn);
  const ts = new Date().toISOString();
  saveSetting("openrouter_model_catalog", models);
  saveSetting("openrouter_catalog_synced_at", ts);
  return { count: models.length, timestamp: ts };
}

export function getCatalogSyncedAt(): string | null {
  return loadSetting<string | null>("openrouter_catalog_synced_at", null);
}

export const TASK_DEFAULTS: Record<AITask, string> = {
  summarization: "openrouter/hunter-alpha",
  cleaning: "meta-llama/llama-3.3-70b-instruct",
  embedding: "qwen/qwen3-embedding-8b",
  vision: "qwen/qwen3-vl-235b-a22b-instruct",
  default: "openrouter/hunter-alpha",
};

export function getModelForTask(task: AITask): string {
  const settings = loadSetting<Record<string, string>>("ai_model_assignments", {});
  return settings[task] ?? TASK_DEFAULTS[task];
}

export function saveModelForTask(task: AITask, modelId: string): void {
  const settings = loadSetting<Record<string, string>>("ai_model_assignments", {});
  settings[task] = modelId;
  saveSetting("ai_model_assignments", settings);
}

export function getOpenRouterKey(): string {
  return loadSetting<string>("openrouter_api_key", "");
}

export function saveOpenRouterKey(key: string): void {
  saveSetting("openrouter_api_key", key);
}

export interface AIUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

function estimateCost(modelId: string, promptTokens: number, completionTokens: number): number {
  const catalog = getModelCatalog();
  const model = catalog.find((m) => m.id === modelId);
  if (!model) return 0;
  return (promptTokens / 1_000_000) * model.costIn + (completionTokens / 1_000_000) * model.costOut;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenRouterResponse {
  content: string;
  usage: AIUsage;
}

export async function callOpenRouter(
  task: AITask,
  messages: ChatMessage[],
  options?: { modelOverride?: string }
): Promise<OpenRouterResponse> {
  const apiKey = getOpenRouterKey();
  if (!apiKey) throw new Error("OpenRouter API key not configured. Go to Settings to add it.");

  const modelId = options?.modelOverride ?? getModelForTask(task);

  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": window.location.origin,
      "X-Title": "MeetingScribe",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: modelId, messages }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OpenRouter error (${resp.status}): ${text}`);
  }

  const data = await resp.json();
  const choice = data.choices?.[0];
  const usage = data.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  const promptTokens = usage.prompt_tokens ?? 0;
  const completionTokens = usage.completion_tokens ?? 0;

  return {
    content: choice?.message?.content ?? "",
    usage: {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      estimatedCost: estimateCost(modelId, promptTokens, completionTokens),
    },
  };
}

// Accumulate usage per meeting
export function trackMeetingUsage(meetingId: string, usage: AIUsage): void {
  const all = loadSetting<Record<string, AIUsage>>("meeting_usage", {});
  const prev = all[meetingId] ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCost: 0 };
  all[meetingId] = {
    promptTokens: prev.promptTokens + usage.promptTokens,
    completionTokens: prev.completionTokens + usage.completionTokens,
    totalTokens: prev.totalTokens + usage.totalTokens,
    estimatedCost: prev.estimatedCost + usage.estimatedCost,
  };
  saveSetting("meeting_usage", all);
}

export function getMeetingUsage(meetingId: string): AIUsage {
  const all = loadSetting<Record<string, AIUsage>>("meeting_usage", {});
  return all[meetingId] ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCost: 0 };
}

export function getTotalUsage(): AIUsage {
  const all = loadSetting<Record<string, AIUsage>>("meeting_usage", {});
  return Object.values(all).reduce(
    (acc, u) => ({
      promptTokens: acc.promptTokens + u.promptTokens,
      completionTokens: acc.completionTokens + u.completionTokens,
      totalTokens: acc.totalTokens + u.totalTokens,
      estimatedCost: acc.estimatedCost + u.estimatedCost,
    }),
    { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCost: 0 }
  );
}
