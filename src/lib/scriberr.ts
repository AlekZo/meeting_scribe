// Scriberr API client
// Docs: docs/scriberr-api.md

import { loadSetting } from "@/lib/storage";
import type { TranscriptSegment } from "@/components/MeetingPlayer";

function getConfig() {
  const customUrl = loadSetting<string>("scriberr_url", "");
  const protocol = loadSetting<string>("scriberr_protocol", "http");
  // If no custom URL is set, use the nginx proxy path (works in Docker)
  const baseUrl = customUrl
    ? `${protocol}://${customUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`
    : `${window.location.origin}/scriberr`;
  const apiKey = loadSetting<string>("scriberr_api_key", "");
  return { baseUrl, apiKey };
}

function headers(apiKey: string, json = false): Record<string, string> {
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

export interface ScriberrUploadResult {
  id: string;
  status: string;
  error_message?: string;
}

export interface ScriberrStatus {
  status: "uploaded" | "pending" | "processing" | "completed" | "failed";
  transcript?: string;
  error_message?: string;
}

/** Progress tracking via polling (Scriberr has no SSE endpoint) */
export interface ScriberrProgress {
  progress: number;
  stage?: string;
}

/** Track transcription progress by polling status every 10s */
export function trackProgress(
  jobId: string,
  onProgress: (data: ScriberrProgress) => void,
  onDone?: () => void,
  onError?: (err: Error) => void
): () => void {
  let stopped = false;

  const poll = async () => {
    while (!stopped) {
      try {
        const status = await getTranscriptionStatus(jobId);
        if (stopped) break;

        if (status.status === "completed") {
          onProgress({ progress: 100, stage: "completed" });
          onDone?.();
          break;
        } else if (status.status === "failed") {
          onError?.(new Error(status.error_message || "Transcription failed"));
          break;
        } else if (status.status === "processing") {
          onProgress({ progress: 50, stage: "processing" });
        } else if (status.status === "pending") {
          onProgress({ progress: 10, stage: "pending" });
        }
      } catch (err) {
        if (!stopped) onError?.(err instanceof Error ? err : new Error(String(err)));
        break;
      }
      // Wait 10 seconds between polls
      await new Promise((r) => setTimeout(r, 10_000));
    }
  };

  poll();

  return () => { stopped = true; };
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
  title: string
): Promise<ScriberrUploadResult> {
  const { baseUrl, apiKey } = getConfig();
  const formData = new FormData();
  formData.append("audio", file, file.name);
  formData.append("title", title);
  // Python script explicitly sets diarization here for /submit
  formData.append("diarization", "true");

  // Changed from /upload to /submit to match Python script
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
    ...(options?.language && options.language !== "auto" ? { language: options.language } : {}),
    vad_method: vad ? "pyannote" : "none",
    vad_onset: 0.55,
    vad_offset: 0.35,
    chunk_size: chunkSize,
    diarize: diarization,
    diarize_model: "pyannote",
    temperature: 0,
    beam_size: beamSize,
    fp16: computeType === "float16",
    // Stability parameters from Python script (hallucination/OOM prevention)
    condition_on_previous_text: false,
    compression_ratio_threshold: 2.4,
    no_speech_threshold: 0.6,
    logprob_threshold: -1,
    best_of: 5,
    patience: 1,
    length_penalty: 1,
    suppress_numerals: false,
    segment_resolution: "sentence",
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

/** Get the audio file streaming URL for a job */
export function getAudioUrl(jobId: string): string {
  const { baseUrl } = getConfig();
  // Fixed to match Python script logic: scriberr_link = f"{self.base_url}/audio/{job_id}"
  return `${baseUrl}/audio/${encodeURIComponent(jobId)}`;
}

/** Parse OOM error from API ErrorResponse JSON embedded in error message */
function isOomError(err: any): boolean {
  try {
    // Error message format: "Start transcription failed: 500 {\"error\":\"...out of memory...\"}"
    const match = err.message?.match(/\{.*\}/s);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return typeof parsed.error === "string" && parsed.error.toLowerCase().includes("out of memory");
    }
  } catch {
    // fallback to raw string check
  }
  return err.message?.toLowerCase()?.includes("out of memory") ?? false;
}

/** Start transcription with CPU fallback on OOM */
export async function startWithOomRetry(jobId: string, options?: { language?: string }): Promise<any> {
  try {
    return await startTranscription(jobId, options);
  } catch (err: any) {
    const autoRetry = loadSetting("auto_retry_oom", true);
    if (autoRetry && isOomError(err)) {
      // Override to CPU settings temporarily
      const { baseUrl, apiKey } = getConfig();
      const payload: Record<string, any> = {
        model_family: "whisper",
        model: loadSetting("whisper_model", "large-v3"),
        device: "cpu",
        compute_type: "int8",
        batch_size: 1,
        threads: 14,
        chunk_size: loadSetting("whisper_chunk_size", 20),
        vad_method: "pyannote",
        diarize: loadSetting("whisper_diarization", true),
        diarize_model: "pyannote",
        fp16: false,
        condition_on_previous_text: false,
        compression_ratio_threshold: 2.4,
        ...(options?.language && options.language !== "auto" ? { language: options.language } : {}),
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
