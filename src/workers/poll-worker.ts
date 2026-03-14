// Web Worker for transcription status polling.
// Runs in a separate thread — immune to background tab throttling.

interface PollConfig {
  jobId: string;
  queueId: string;
  baseUrl: string;
  apiKey: string;
  authMethod: string;
  intervalMs: number;
}

interface PollMessage {
  type: "start" | "stop";
  config?: PollConfig;
  queueId?: string;
}

const activePollers = new Map<string, number>();

function buildHeaders(apiKey: string, authMethod: string): Record<string, string> {
  const h: Record<string, string> = {};
  if (apiKey) {
    if (authMethod === "bearer") {
      h["Authorization"] = `Bearer ${apiKey}`;
    } else {
      h["X-API-Key"] = apiKey;
    }
  }
  return h;
}

async function pollOnce(config: PollConfig) {
  try {
    const res = await fetch(
      `${config.baseUrl}/api/v1/transcription/${encodeURIComponent(config.jobId)}/status`,
      { headers: buildHeaders(config.apiKey, config.authMethod) }
    );
    if (!res.ok) {
      self.postMessage({ type: "error", queueId: config.queueId, error: `Status check failed: ${res.status}` });
      return;
    }
    const data = await res.json();
    self.postMessage({ type: "status", queueId: config.queueId, jobId: config.jobId, status: data });

    // Stop polling on terminal states
    if (data.status === "completed" || data.status === "failed") {
      const timer = activePollers.get(config.queueId);
      if (timer) {
        clearInterval(timer);
        activePollers.delete(config.queueId);
      }
    }
  } catch (err: any) {
    self.postMessage({ type: "network-error", queueId: config.queueId, error: err.message });
    // Don't stop — network blips are transient
  }
}

self.onmessage = (e: MessageEvent<PollMessage>) => {
  const { type } = e.data;

  if (type === "start" && e.data.config) {
    const config = e.data.config;
    // Clear any existing poller for this queue item
    const existing = activePollers.get(config.queueId);
    if (existing) clearInterval(existing);

    // Poll immediately, then at interval
    pollOnce(config);
    const timer = self.setInterval(() => pollOnce(config), config.intervalMs);
    activePollers.set(config.queueId, timer);
  }

  if (type === "stop" && e.data.queueId) {
    const timer = activePollers.get(e.data.queueId);
    if (timer) {
      clearInterval(timer);
      activePollers.delete(e.data.queueId);
    }
  }
};
