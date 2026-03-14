// Scriberr API client — extended endpoints (profiles, summaries, chat, notes, SSE, YouTube, admin)
// Core transcription endpoints remain in scriberr.ts

import { loadSetting } from "@/lib/storage";

function getConfig() {
  const customUrl = loadSetting<string>("scriberr_url", "");
  const protocol = loadSetting<string>("scriberr_protocol", "http");
  const baseUrl = customUrl
    ? `${protocol}://${customUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`
    : `${window.location.origin}/scriberr`;
  const apiKey = loadSetting<string>("scriberr_api_key", "");
  return { baseUrl, apiKey };
}

function authHeaders(apiKey: string, json = false): Record<string, string> {
  const authMethod = loadSetting<string>("scriberr_auth_method", "x-api-key");
  const h: Record<string, string> = {};
  if (apiKey) {
    if (authMethod === "bearer") {
      h["Authorization"] = `Bearer ${apiKey}`;
    } else {
      h["X-API-Key"] = apiKey;
    }
  }
  if (json) h["Content-Type"] = "application/json";
  return h;
}

// ─── SSE Events ─────────────────────────────────────────────────────

export interface ScriberrSSEEvent {
  type: string;
  data: any;
}

/** Subscribe to server-sent events for real-time transcription updates */
export function subscribeToEvents(
  onEvent: (event: ScriberrSSEEvent) => void,
  onError?: (err: Event) => void
): () => void {
  const { baseUrl, apiKey } = getConfig();
  const url = new URL(`${baseUrl}/api/v1/events`);
  if (apiKey) url.searchParams.set("api_key", apiKey);

  const source = new EventSource(url.toString());

  source.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      onEvent({ type: e.type || "message", data });
    } catch {
      onEvent({ type: "message", data: e.data });
    }
  };

  source.onerror = (e) => {
    onError?.(e);
  };

  return () => source.close();
}

// ─── Transcription Profiles ─────────────────────────────────────────

export interface TranscriptionProfile {
  id: string;
  name: string;
  description?: string;
  is_default: boolean;
  parameters: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export async function listProfiles(): Promise<TranscriptionProfile[]> {
  const { baseUrl, apiKey } = getConfig();
  const res = await fetch(`${baseUrl}/api/v1/profiles`, {
    headers: authHeaders(apiKey),
  });
  if (!res.ok) throw new Error(`List profiles failed: ${res.status}`);
  return res.json();
}

export async function getProfile(id: string): Promise<TranscriptionProfile> {
  const { baseUrl, apiKey } = getConfig();
  const res = await fetch(`${baseUrl}/api/v1/profiles/${encodeURIComponent(id)}`, {
    headers: authHeaders(apiKey),
  });
  if (!res.ok) throw new Error(`Get profile failed: ${res.status}`);
  return res.json();
}

export async function createProfile(profile: Partial<TranscriptionProfile>): Promise<TranscriptionProfile> {
  const { baseUrl, apiKey } = getConfig();
  const res = await fetch(`${baseUrl}/api/v1/profiles`, {
    method: "POST",
    headers: authHeaders(apiKey, true),
    body: JSON.stringify(profile),
  });
  if (!res.ok) throw new Error(`Create profile failed: ${res.status}`);
  return res.json();
}

export async function updateProfile(id: string, profile: Partial<TranscriptionProfile>): Promise<TranscriptionProfile> {
  const { baseUrl, apiKey } = getConfig();
  const res = await fetch(`${baseUrl}/api/v1/profiles/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: authHeaders(apiKey, true),
    body: JSON.stringify(profile),
  });
  if (!res.ok) throw new Error(`Update profile failed: ${res.status}`);
  return res.json();
}

export async function deleteProfile(id: string): Promise<void> {
  const { baseUrl, apiKey } = getConfig();
  const res = await fetch(`${baseUrl}/api/v1/profiles/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(apiKey),
  });
  if (!res.ok) throw new Error(`Delete profile failed: ${res.status}`);
}

export async function setDefaultProfile(id: string): Promise<void> {
  const { baseUrl, apiKey } = getConfig();
  const res = await fetch(`${baseUrl}/api/v1/profiles/${encodeURIComponent(id)}/set-default`, {
    method: "POST",
    headers: authHeaders(apiKey),
  });
  if (!res.ok) throw new Error(`Set default profile failed: ${res.status}`);
}

// ─── Summarization ──────────────────────────────────────────────────

export interface SummaryTemplate {
  id: string;
  name: string;
  description?: string;
  prompt: string;
  model: string;
  include_speaker_info: boolean;
  created_at: string;
  updated_at: string;
}

export interface SummarySettings {
  default_model: string;
}

export async function summarize(request: {
  transcription_id: string;
  content: string;
  model: string;
  template_id?: string;
}): Promise<any> {
  const { baseUrl, apiKey } = getConfig();
  const res = await fetch(`${baseUrl}/api/v1/summarize`, {
    method: "POST",
    headers: authHeaders(apiKey, true),
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error(`Summarize failed: ${res.status}`);
  return res.json();
}

export async function listSummaryTemplates(): Promise<SummaryTemplate[]> {
  const { baseUrl, apiKey } = getConfig();
  const res = await fetch(`${baseUrl}/api/v1/summaries`, {
    headers: authHeaders(apiKey),
  });
  if (!res.ok) throw new Error(`List templates failed: ${res.status}`);
  return res.json();
}

export async function getSummaryTemplate(id: string): Promise<SummaryTemplate> {
  const { baseUrl, apiKey } = getConfig();
  const res = await fetch(`${baseUrl}/api/v1/summaries/${encodeURIComponent(id)}`, {
    headers: authHeaders(apiKey),
  });
  if (!res.ok) throw new Error(`Get template failed: ${res.status}`);
  return res.json();
}

export async function createSummaryTemplate(template: Partial<SummaryTemplate>): Promise<SummaryTemplate> {
  const { baseUrl, apiKey } = getConfig();
  const res = await fetch(`${baseUrl}/api/v1/summaries`, {
    method: "POST",
    headers: authHeaders(apiKey, true),
    body: JSON.stringify(template),
  });
  if (!res.ok) throw new Error(`Create template failed: ${res.status}`);
  return res.json();
}

export async function updateSummaryTemplate(id: string, template: Partial<SummaryTemplate>): Promise<SummaryTemplate> {
  const { baseUrl, apiKey } = getConfig();
  const res = await fetch(`${baseUrl}/api/v1/summaries/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: authHeaders(apiKey, true),
    body: JSON.stringify(template),
  });
  if (!res.ok) throw new Error(`Update template failed: ${res.status}`);
  return res.json();
}

export async function deleteSummaryTemplate(id: string): Promise<void> {
  const { baseUrl, apiKey } = getConfig();
  const res = await fetch(`${baseUrl}/api/v1/summaries/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(apiKey),
  });
  if (!res.ok) throw new Error(`Delete template failed: ${res.status}`);
}

export async function getSummarySettings(): Promise<SummarySettings> {
  const { baseUrl, apiKey } = getConfig();
  const res = await fetch(`${baseUrl}/api/v1/summaries/settings`, {
    headers: authHeaders(apiKey),
  });
  if (!res.ok) throw new Error(`Get summary settings failed: ${res.status}`);
  return res.json();
}

export async function saveSummarySettings(settings: SummarySettings): Promise<SummarySettings> {
  const { baseUrl, apiKey } = getConfig();
  const res = await fetch(`${baseUrl}/api/v1/summaries/settings`, {
    method: "POST",
    headers: authHeaders(apiKey, true),
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error(`Save summary settings failed: ${res.status}`);
  return res.json();
}

// ─── Chat ───────────────────────────────────────────────────────────

export interface ChatSession {
  id: string;
  transcription_id: string;
  model: string;
  provider?: string;
  title: string;
  is_active: boolean;
  message_count: number;
  last_message?: ChatMessage;
  created_at: string;
  updated_at: string;
  last_activity_at?: string;
}

export interface ChatMessage {
  id: number;
  role: string;
  content: string;
  created_at: string;
}

export interface ChatSessionWithMessages extends ChatSession {
  messages: ChatMessage[];
}

export async function getChatModels(): Promise<string[]> {
  const { baseUrl, apiKey } = getConfig();
  const res = await fetch(`${baseUrl}/api/v1/chat/models`, {
    headers: authHeaders(apiKey),
  });
  if (!res.ok) throw new Error(`Get chat models failed: ${res.status}`);
  const data = await res.json();
  return data.models || [];
}

export async function createChatSession(request: {
  transcription_id: string;
  model: string;
  title?: string;
}): Promise<ChatSession> {
  const { baseUrl, apiKey } = getConfig();
  const res = await fetch(`${baseUrl}/api/v1/chat/sessions`, {
    method: "POST",
    headers: authHeaders(apiKey, true),
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error(`Create chat session failed: ${res.status}`);
  return res.json();
}

export async function getChatSession(sessionId: string): Promise<ChatSessionWithMessages> {
  const { baseUrl, apiKey } = getConfig();
  const res = await fetch(`${baseUrl}/api/v1/chat/sessions/${encodeURIComponent(sessionId)}`, {
    headers: authHeaders(apiKey),
  });
  if (!res.ok) throw new Error(`Get chat session failed: ${res.status}`);
  return res.json();
}

export async function deleteChatSession(sessionId: string): Promise<void> {
  const { baseUrl, apiKey } = getConfig();
  const res = await fetch(`${baseUrl}/api/v1/chat/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
    headers: authHeaders(apiKey),
  });
  if (!res.ok) throw new Error(`Delete chat session failed: ${res.status}`);
}

/** Send message — returns streaming text response */
export async function sendChatMessage(sessionId: string, content: string): Promise<Response> {
  const { baseUrl, apiKey } = getConfig();
  const res = await fetch(`${baseUrl}/api/v1/chat/sessions/${encodeURIComponent(sessionId)}/messages`, {
    method: "POST",
    headers: authHeaders(apiKey, true),
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`Send message failed: ${res.status}`);
  return res; // Return raw response for streaming
}

export async function updateChatTitle(sessionId: string, title: string): Promise<ChatSession> {
  const { baseUrl, apiKey } = getConfig();
  const res = await fetch(`${baseUrl}/api/v1/chat/sessions/${encodeURIComponent(sessionId)}/title`, {
    method: "PUT",
    headers: authHeaders(apiKey, true),
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`Update chat title failed: ${res.status}`);
  return res.json();
}

export async function autoGenerateChatTitle(sessionId: string): Promise<ChatSession> {
  const { baseUrl, apiKey } = getConfig();
  const res = await fetch(`${baseUrl}/api/v1/chat/sessions/${encodeURIComponent(sessionId)}/title/auto`, {
    method: "POST",
    headers: authHeaders(apiKey),
  });
  if (!res.ok) throw new Error(`Auto-generate title failed: ${res.status}`);
  return res.json();
}

export async function getChatSessionsForTranscription(transcriptionId: string): Promise<ChatSession[]> {
  const { baseUrl, apiKey } = getConfig();
  const res = await fetch(`${baseUrl}/api/v1/chat/transcriptions/${encodeURIComponent(transcriptionId)}/sessions`, {
    headers: authHeaders(apiKey),
  });
  if (!res.ok) throw new Error(`Get chat sessions failed: ${res.status}`);
  return res.json();
}

// ─── Notes ──────────────────────────────────────────────────────────

export interface Note {
  id: string;
  transcription_id: string;
  quote: string;
  content: string;
  start_word_index?: number;
  end_word_index?: number;
  start_time?: number;
  end_time?: number;
  created_at: string;
  updated_at: string;
}

export async function getNote(noteId: string): Promise<Note> {
  const { baseUrl, apiKey } = getConfig();
  const res = await fetch(`${baseUrl}/api/v1/notes/${encodeURIComponent(noteId)}`, {
    headers: authHeaders(apiKey),
  });
  if (!res.ok) throw new Error(`Get note failed: ${res.status}`);
  return res.json();
}

export async function updateNote(noteId: string, content: string): Promise<Note> {
  const { baseUrl, apiKey } = getConfig();
  const res = await fetch(`${baseUrl}/api/v1/notes/${encodeURIComponent(noteId)}`, {
    method: "PUT",
    headers: authHeaders(apiKey, true),
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`Update note failed: ${res.status}`);
  return res.json();
}

export async function deleteNote(noteId: string): Promise<void> {
  const { baseUrl, apiKey } = getConfig();
  const res = await fetch(`${baseUrl}/api/v1/notes/${encodeURIComponent(noteId)}`, {
    method: "DELETE",
    headers: authHeaders(apiKey),
  });
  if (!res.ok) throw new Error(`Delete note failed: ${res.status}`);
}

// ─── YouTube ────────────────────────────────────────────────────────

export async function downloadYouTube(url: string, title?: string): Promise<any> {
  const { baseUrl, apiKey } = getConfig();
  const res = await fetch(`${baseUrl}/api/v1/transcription/youtube`, {
    method: "POST",
    headers: authHeaders(apiKey, true),
    body: JSON.stringify({ url, ...(title ? { title } : {}) }),
  });
  if (!res.ok) throw new Error(`YouTube download failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// ─── LLM Configuration ─────────────────────────────────────────────

export interface LLMConfig {
  id: number;
  provider: "ollama" | "openai";
  base_url?: string;
  openai_base_url?: string;
  has_api_key: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export async function getLLMConfig(): Promise<LLMConfig> {
  const { baseUrl, apiKey } = getConfig();
  const res = await fetch(`${baseUrl}/api/v1/llm/config`, {
    headers: authHeaders(apiKey),
  });
  if (!res.ok) throw new Error(`Get LLM config failed: ${res.status}`);
  return res.json();
}

export async function saveLLMConfig(config: {
  provider: "ollama" | "openai";
  base_url?: string;
  openai_base_url?: string;
  api_key?: string;
  is_active?: boolean;
}): Promise<LLMConfig> {
  const { baseUrl, apiKey } = getConfig();
  const res = await fetch(`${baseUrl}/api/v1/llm/config`, {
    method: "POST",
    headers: authHeaders(apiKey, true),
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error(`Save LLM config failed: ${res.status}`);
  return res.json();
}

// ─── Admin ──────────────────────────────────────────────────────────

export async function getQueueStats(): Promise<Record<string, any>> {
  const { baseUrl, apiKey } = getConfig();
  const res = await fetch(`${baseUrl}/api/v1/admin/queue/stats`, {
    headers: authHeaders(apiKey),
  });
  if (!res.ok) throw new Error(`Get queue stats failed: ${res.status}`);
  return res.json();
}

// ─── User Settings ──────────────────────────────────────────────────

export interface UserSettings {
  auto_transcription_enabled: boolean;
  default_profile_id?: string;
}

export async function getUserSettings(): Promise<UserSettings> {
  const { baseUrl, apiKey } = getConfig();
  const res = await fetch(`${baseUrl}/api/v1/user/settings`, {
    headers: authHeaders(apiKey),
  });
  if (!res.ok) throw new Error(`Get user settings failed: ${res.status}`);
  return res.json();
}

export async function updateUserSettings(settings: Partial<UserSettings>): Promise<UserSettings> {
  const { baseUrl, apiKey } = getConfig();
  const res = await fetch(`${baseUrl}/api/v1/user/settings`, {
    method: "PUT",
    headers: authHeaders(apiKey, true),
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error(`Update user settings failed: ${res.status}`);
  return res.json();
}

export async function setUserDefaultProfile(profileId: string): Promise<void> {
  const { baseUrl, apiKey } = getConfig();
  const res = await fetch(`${baseUrl}/api/v1/user/settings/default-profile`, {
    method: "POST",
    headers: authHeaders(apiKey, true),
    body: JSON.stringify({ profile_id: profileId }),
  });
  if (!res.ok) throw new Error(`Set default profile failed: ${res.status}`);
}

// ─── Delete Transcription Job ───────────────────────────────────────

export async function deleteTranscriptionJob(jobId: string): Promise<void> {
  const { baseUrl, apiKey } = getConfig();
  const res = await fetch(`${baseUrl}/api/v1/transcription/${encodeURIComponent(jobId)}`, {
    method: "DELETE",
    headers: authHeaders(apiKey),
  });
  if (!res.ok) throw new Error(`Delete job failed: ${res.status}`);
}
