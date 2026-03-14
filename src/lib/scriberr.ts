// Scriberr API client
// Docs: docs/scriberr-api.md

import { loadSetting } from "@/lib/storage";
import type { TranscriptSegment } from "@/components/MeetingPlayer";

/** Truncate transcript for token-efficient LLM calls (speaker ID, summarization).
 *  Takes first N and last N segments, like the Python script does. */
export function truncateForLLM(
  segments: TranscriptSegment[],
  maxSegments = 40,
  headTail = 20
): string {
  const lines = segments.map(
    (s) => `${s.speaker}: ${s.text}`
  );

  if (lines.length <= maxSegments) {
    return lines.join("\n\n");
  }

  return (
    "--- START OF TRANSCRIPT ---\n" +
    lines.slice(0, headTail).join("\n\n") +
    "\n\n... [Transcript truncated] ...\n\n" +
    lines.slice(-headTail).join("\n\n") +
    "\n--- END OF TRANSCRIPT ---"
  );
}

function getConfig() {
  const customUrl = loadSetting<string>("scriberr_url", "");
  const protocol = loadSetting<string>("scriberr_protocol", "http");
  // If no custom URL is set, use the nginx proxy path (works in Docker)
  const baseUrl = customUrl
    ? `${protocol}://${customUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`
    : "/scriberr";
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

/** Progress tracking via polling (or use SSE from scriberr-extended.ts for real-time updates) */
export interface ScriberrProgress {
  progress: number;
  stage?: string;
}

/** Track transcription progress by polling status every 10s.
 *  Resilient to transient network errors (retries instead of breaking).
 *  Detects OOM failures and retries on CPU automatically. */
export function trackProgress(
  jobId: string,
  onProgress: (data: ScriberrProgress) => void,
  onDone?: () => void,
  onError?: (err: Error) => void
): () => void {
  let stopped = false;
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 10;

  const poll = async () => {
    while (!stopped) {
      try {
        const status = await getTranscriptionStatus(jobId);
        consecutiveErrors = 0; // reset on success
        if (stopped) break;

        if (status.status === "completed") {
          onProgress({ progress: 100, stage: "completed" });
          onDone?.();
          break;
        } else if (status.status === "failed") {
          // Check for OOM — retry on CPU like the Python script does
          if (isOomError({ message: status.error_message || "" })) {
            const autoRetry = loadSetting("auto_retry_oom", true);
            if (autoRetry) {
              console.warn(`[poll] Job ${jobId} OOM detected, retrying on CPU…`);
              onProgress({ progress: 15, stage: "retrying-cpu" });
              try {
                await retryCpuFallback(jobId);
                // Keep polling — job is restarted
                await new Promise((r) => setTimeout(r, 10_000));
                continue;
              } catch (retryErr) {
                onError?.(retryErr instanceof Error ? retryErr : new Error(String(retryErr)));
                break;
              }
            }
          }
          onError?.(new Error(status.error_message || "Transcription failed"));
          break;
        } else if (status.status === "processing") {
          onProgress({ progress: 50, stage: "processing" });
        } else if (status.status === "pending") {
          onProgress({ progress: 10, stage: "pending" });
        } else if (status.status === "uploaded") {
          onProgress({ progress: 5, stage: "uploaded" });
        }
      } catch (err) {
        consecutiveErrors++;
        console.warn(`[poll] Network error polling ${jobId} (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`, err);
        // Only give up after many consecutive network failures
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          if (!stopped) onError?.(new Error(`Lost connection to Scriberr after ${MAX_CONSECUTIVE_ERRORS} retries`));
          break;
        }
        // Otherwise wait and retry
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

/** Upload progress callback */
export type UploadProgressCallback = (loaded: number, total: number) => void;

/** Upload a file via XHR with progress tracking */
function uploadWithProgress(
  url: string,
  formData: FormData,
  apiKey: string,
  onProgress?: UploadProgressCallback
): Promise<ScriberrUploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);

    // Set auth headers
    const authMethod = loadSetting<string>("scriberr_auth_method", "x-api-key");
    if (apiKey) {
      if (authMethod === "bearer") {
        xhr.setRequestHeader("Authorization", `Bearer ${apiKey}`);
      } else {
        xhr.setRequestHeader("X-API-Key", apiKey);
      }
    }

    if (onProgress) {
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          onProgress(e.loaded, e.total);
        }
      });
    }

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("Invalid JSON response"));
        }
      } else {
        reject(new Error(`Upload failed: ${xhr.status} ${xhr.responseText}`));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
    xhr.addEventListener("abort", () => reject(new Error("Upload aborted")));

    xhr.send(formData);
  });
}

/** Upload an audio file to Scriberr */
export async function uploadAudio(
  file: File,
  title: string,
  onProgress?: UploadProgressCallback
): Promise<ScriberrUploadResult> {
  const { baseUrl, apiKey } = getConfig();
  const formData = new FormData();
  formData.append("audio", file, file.name);
  formData.append("title", title);
  formData.append("diarization", "true");

  return uploadWithProgress(
    `${baseUrl}/api/v1/transcription/submit`,
    formData,
    apiKey,
    onProgress
  );
}

/** Upload a video file to Scriberr */
export async function uploadVideo(
  file: File,
  title: string,
  onProgress?: UploadProgressCallback
): Promise<ScriberrUploadResult> {
  const { baseUrl, apiKey } = getConfig();
  const formData = new FormData();
  formData.append("video", file, file.name);
  formData.append("title", title);

  return uploadWithProgress(
    `${baseUrl}/api/v1/transcription/upload-video`,
    formData,
    apiKey,
    onProgress
  );
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
    threads: loadSetting("whisper_threads", 4),
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
    speaker_embeddings: false, // Disable to save VRAM — embeddings bloat the response
    temperature: 0,
    beam_size: beamSize,
    fp16: computeType === "float16",
    // Stability parameters (hallucination/OOM prevention — from Python script)
    condition_on_previous_text: false,
    compression_ratio_threshold: 2.4,
    no_speech_threshold: 0.6,
    logprob_threshold: -1,
    best_of: 5,
    patience: 1,
    length_penalty: 1,
    suppress_numerals: false,
    segment_resolution: "sentence",
    // Additional stability params missing from earlier version
    temperature_increment_on_fallback: 0.2,
    interpolate_method: "nearest",
    no_align: false,
    return_char_alignments: false,
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

/** Update speaker names, then re-fetch transcript with updated names */
export async function updateSpeakers(
  jobId: string,
  mappings: Array<{ original_speaker: string; custom_name: string }>
): Promise<ScriberrTranscript> {
  const { baseUrl, apiKey } = getConfig();
  const res = await fetch(`${baseUrl}/api/v1/transcription/${encodeURIComponent(jobId)}/speakers`, {
    method: "POST",
    headers: headers(apiKey, true),
    body: JSON.stringify({ mappings }),
  });
  if (!res.ok) throw new Error(`Update speakers failed: ${res.status}`);

  // Small delay to let Scriberr update its database (mirrors Python script)
  await new Promise((r) => setTimeout(r, 2000));

  // Re-fetch transcript with updated speaker names
  return getTranscript(jobId);
}

/** Safely locate segments array from any Scriberr response shape */
function resolveSegments(data: any): any[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.segments)) return data.segments;
  if (data.transcript && Array.isArray(data.transcript.segments)) return data.transcript.segments;
  return [];
}

/** Safely map a raw segment to TranscriptSegment with fallbacks */
function safeSegment(s: any): TranscriptSegment {
  return {
    speaker: s?.speaker || "Speaker 1",
    startTime: typeof s?.start === "number" ? s.start : 0,
    endTime: typeof s?.end === "number" ? s.end : 0,
    text: (s?.text || "").trim(),
  };
}

/** Convert Scriberr segments to our TranscriptSegment format, merging consecutive same-speaker segments */
export function convertSegments(scriberrData: any): TranscriptSegment[] {
  const rawSegments = resolveSegments(scriberrData);
  if (rawSegments.length === 0) return [];

  const merged: TranscriptSegment[] = [];
  let current = safeSegment(rawSegments[0]);

  for (let i = 1; i < rawSegments.length; i++) {
    const seg = safeSegment(rawSegments[i]);
    if (seg.speaker === current.speaker) {
      current.endTime = seg.endTime;
      current.text += " " + seg.text;
    } else {
      merged.push(current);
      current = seg;
    }
  }
  merged.push(current);
  return merged;
}

/** Convert without merging — raw 1:1 mapping for when you need original segments */
export function convertSegmentsRaw(scriberrData: any): TranscriptSegment[] {
  return resolveSegments(scriberrData).map(safeSegment);
}

/** Get the audio file streaming URL for a job — prefers local media if available.
 *  Falls back to our authenticated proxy to avoid CORS & auth header issues
 *  with native <audio>/<video> tags. */
export function getAudioUrl(jobId: string, localMediaSrc?: string): string {
  if (localMediaSrc) return localMediaSrc;
  // Use our Express proxy which injects Scriberr auth headers server-side
  return `/api/scriberr-stream/${encodeURIComponent(jobId)}`;
}

/** Get a direct browser-accessible Scriberr UI link for a job.
 *  Falls back to the proxy path if no custom URL is configured. */
export function getScriberrJobUrl(jobId: string): string | null {
  const customUrl = loadSetting<string>("scriberr_url", "");
  if (!customUrl) return null; // no external URL configured — can't link
  const protocol = loadSetting<string>("scriberr_protocol", "http");
  const host = customUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return `${protocol}://${host}/audio/${encodeURIComponent(jobId)}`;
}

/** Delete a job from Scriberr (cleans up remote processing data) */
export async function deleteScriberrJob(jobId: string): Promise<boolean> {
  const { baseUrl, apiKey } = getConfig();
  const res = await fetch(`${baseUrl}/api/v1/transcription/${encodeURIComponent(jobId)}`, {
    method: "DELETE",
    headers: headers(apiKey),
  });
  return res.ok;
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

/** Retry transcription with CPU fallback settings (called from polling on OOM) */
export async function retryCpuFallback(jobId: string, options?: { language?: string }): Promise<any> {
  const { baseUrl, apiKey } = getConfig();
  const payload: Record<string, any> = {
    model_family: "whisper",
    model: loadSetting("whisper_model", "large-v3"),
    device: "cpu",
    compute_type: "int8",
    batch_size: 1,
    threads: loadSetting("whisper_threads", 4),
    chunk_size: loadSetting("whisper_chunk_size", 20),
    vad_method: "pyannote",
    diarize: loadSetting("whisper_diarization", true),
    diarize_model: "pyannote",
    speaker_embeddings: false,
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
