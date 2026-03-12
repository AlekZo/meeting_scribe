// Scriberr API client
// Docs: docs/scriberr-api.md

import { loadSetting } from "@/lib/storage";
import type { TranscriptSegment } from "@/components/MeetingPlayer";

function getConfig() {
  const baseUrl = (loadSetting<string>("scriberr_url", "http://localhost:8080") || "").replace(/\/+$/, "");
  const apiKey = loadSetting<string>("scriberr_api_key", "");
  return { baseUrl, apiKey };
}

function headers(apiKey: string, json = false): Record<string, string> {
  const h: Record<string, string> = {};
  if (apiKey) h["X-API-Key"] = apiKey;
  if (json) h["Content-Type"] = "application/json";
  return h;
}

export interface ScriberrUploadResult {
  id: string;
  status: string;
  message?: string;
}

export interface ScriberrStatus {
  status: "pending" | "processing" | "completed" | "failed";
  progress?: number;
  result?: any;
}

export interface ScriberrTranscript {
  id: string;
  title?: string;
  language?: string;
  duration?: number;
  segments: Array<{
    id: number;
    start: number;
    end: number;
    speaker: string;
    text: string;
  }>;
}

/** Upload an audio file to Scriberr */
export async function uploadAudio(
  file: File,
  title: string,
  language: string = "auto",
  diarization: boolean = true
): Promise<ScriberrUploadResult> {
  const { baseUrl, apiKey } = getConfig();
  const formData = new FormData();
  formData.append("audio", file, file.name);
  formData.append("title", title);
  formData.append("diarization", String(diarization));
  if (language && language !== "auto") formData.append("language", language);

  const res = await fetch(`${baseUrl}/api/v1/transcription/submit`, {
    method: "POST",
    headers: headers(apiKey),
    body: formData,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Upload a video file to Scriberr */
export async function uploadVideo(
  file: File,
  title: string
): Promise<ScriberrUploadResult> {
  const { baseUrl, apiKey } = getConfig();
  const formData = new FormData();
  formData.append("video", file, file.name);
  formData.append("title", title);

  const res = await fetch(`${baseUrl}/api/v1/transcription/upload-video`, {
    method: "POST",
    headers: headers(apiKey),
    body: formData,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Start transcription for a job */
export async function startTranscription(jobId: string, options?: {
  language?: string;
}): Promise<any> {
  const { baseUrl, apiKey } = getConfig();
  
  // Read whisper settings
  const model = loadSetting("whisper_model", "large-v3");
  const device = loadSetting("whisper_device", "cuda");
  const batchSize = loadSetting("whisper_batch_size", 4);
  const computeType = loadSetting("whisper_compute_type", "float16");
  const beamSize = loadSetting("whisper_beam_size", 5);
  const chunkSize = loadSetting("whisper_chunk_size", 20);
  const diarization = loadSetting("whisper_diarization", true);
  const vad = loadSetting("whisper_vad", true);

  const payload: Record<string, any> = {
    model_family: "whisper",
    model,
    model_cache_only: false,
    device,
    device_index: 0,
    batch_size: batchSize,
    compute_type: computeType,
    threads: 14,
    output_format: "all",
    verbose: true,
    task: "transcribe",
    language: options?.language || "en",
    vad_method: vad ? "pyannote" : "none",
    vad_onset: 0.55,
    vad_offset: 0.35,
    chunk_size: chunkSize,
    diarize: diarization,
    diarize_model: "pyannote",
    temperature: 0,
    beam_size: beamSize,
    fp16: computeType === "float16",
  };

  const res = await fetch(`${baseUrl}/api/v1/transcription/${encodeURIComponent(jobId)}/start`, {
    method: "POST",
    headers: headers(apiKey, true),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Start transcription failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Poll transcription status */
export async function getTranscriptionStatus(jobId: string): Promise<ScriberrStatus> {
  const { baseUrl, apiKey } = getConfig();
  const res = await fetch(`${baseUrl}/api/v1/transcription/${encodeURIComponent(jobId)}/status`, {
    headers: headers(apiKey),
  });
  if (!res.ok) throw new Error(`Status check failed: ${res.status}`);
  return res.json();
}

/** Get completed transcript */
export async function getTranscript(jobId: string): Promise<ScriberrTranscript> {
  const { baseUrl, apiKey } = getConfig();
  const res = await fetch(`${baseUrl}/api/v1/transcription/${encodeURIComponent(jobId)}/transcript`, {
    headers: headers(apiKey),
  });
  if (!res.ok) throw new Error(`Get transcript failed: ${res.status}`);
  return res.json();
}

/** Update speaker names */
export async function updateSpeakers(
  jobId: string,
  mappings: Array<{ original_speaker: string; custom_name: string }>
): Promise<any> {
  const { baseUrl, apiKey } = getConfig();
  const res = await fetch(`${baseUrl}/api/v1/transcription/${encodeURIComponent(jobId)}/speakers`, {
    method: "POST",
    headers: headers(apiKey, true),
    body: JSON.stringify({ mappings }),
  });
  if (!res.ok) throw new Error(`Update speakers failed: ${res.status}`);
  return res.json();
}

/** Convert Scriberr segments to our TranscriptSegment format */
export function convertSegments(scriberrSegments: ScriberrTranscript["segments"]): TranscriptSegment[] {
  return scriberrSegments.map((s) => ({
    speaker: s.speaker,
    startTime: s.start,
    endTime: s.end,
    text: s.text,
  }));
}

/** Get the Scriberr web UI URL for a job */
export function getScriberrUrl(jobId: string): string {
  const { baseUrl } = getConfig();
  return `${baseUrl}/audio/${jobId}`;
}

/** Start transcription with CPU fallback on OOM */
export async function startWithOomRetry(jobId: string, options?: { language?: string }): Promise<any> {
  try {
    return await startTranscription(jobId, options);
  } catch (err: any) {
    const autoRetry = loadSetting("auto_retry_oom", true);
    if (autoRetry && err.message?.includes("out of memory")) {
      // Override to CPU settings temporarily
      const { baseUrl, apiKey } = getConfig();
      const payload = {
        model_family: "whisper",
        model: loadSetting("whisper_model", "large-v3"),
        device: "cpu",
        compute_type: "int8",
        batch_size: 1,
        diarize: loadSetting("whisper_diarization", true),
        diarize_model: "pyannote",
        language: options?.language || "en",
        task: "transcribe",
      };
      const res = await fetch(`${baseUrl}/api/v1/transcription/${encodeURIComponent(jobId)}/start`, {
        method: "POST",
        headers: headers(apiKey, true),
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`CPU retry failed: ${res.status} ${await res.text()}`);
      return res.json();
    }
    throw err;
  }
}
