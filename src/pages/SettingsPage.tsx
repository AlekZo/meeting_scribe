import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, ExternalLink, MessageCircle, Loader2, CheckCircle2, XCircle, Cpu, Trash2, Download, Upload, Database, HardDrive, Server, Lock, Unlock, ScrollText, Search, Filter } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import AIModelRoutingSection from "@/components/settings/AIModelRoutingSection";
import { cn } from "@/lib/utils";
import { loadSetting, saveSetting, downloadBackup, uploadRestore, getServerInfo, loadActivityLog } from "@/lib/storage";
import AIPromptsSection from "@/components/settings/AIPromptsSection";
import OfflineSyncSection from "@/components/settings/OfflineSyncSection";
import FolderWatchSection from "@/components/settings/FolderWatchSection";
import AutoTagRulesSection from "@/components/settings/AutoTagRulesSection";
import ExcelImportSection from "@/components/settings/ExcelImportSection";
import { ActivityLog, ActivityEvent } from "@/components/ActivityLog";

type ConnectionStatus = "untested" | "testing" | "connected" | "error";

export default function SettingsPage() {
  // ── Scriberr ──
  const [scriberrUrl, setScriberrUrl] = useState(() => loadSetting("scriberr_url", ""));
  const [scriberrProtocol, setScriberrProtocol] = useState<"http" | "https">(() => loadSetting("scriberr_protocol", "http"));
  const [apiKey, setApiKey] = useState(() => loadSetting("scriberr_api_key", ""));
  const [authMethod, setAuthMethod] = useState<"x-api-key" | "bearer">(() => loadSetting("scriberr_auth_method", "x-api-key"));
  const [scriberrStatus, setScriberrStatus] = useState<ConnectionStatus>("untested");

  // ── Telegram ──
  const [tgEnabled, setTgEnabled] = useState(() => loadSetting("tg_enabled", false));
  const [tgBotToken, setTgBotToken] = useState(() => loadSetting("tg_bot_token", ""));
  const [tgChatId, setTgChatId] = useState(() => loadSetting("tg_chat_id", ""));
  const [tgStatus, setTgStatus] = useState<ConnectionStatus>("untested");

  // ── Processing ──
  const [autoTranscribe, setAutoTranscribe] = useState(() => loadSetting("auto_transcribe", true));
  const [speakerDetection, setSpeakerDetection] = useState(() => loadSetting("speaker_detection", false));
  const [autoRetryOom, setAutoRetryOom] = useState(() => loadSetting("auto_retry_oom", true));
  const [publishSheets, setPublishSheets] = useState(() => loadSetting("publish_sheets", true));

  // ── Google ──
  const [googleCalId, setGoogleCalId] = useState(() => loadSetting("google_calendar_id", ""));
  const [googleSheetsId, setGoogleSheetsId] = useState(() => loadSetting("google_sheets_id", ""));
  const [googleTab, setGoogleTab] = useState(() => loadSetting("google_tab", "Meeting_Logs"));
  const [timezone, setTimezone] = useState(() => loadSetting("timezone", "Europe/Moscow"));

  // ── Transcription Engine ──
  const [whisperModel, setWhisperModel] = useState(() => loadSetting("whisper_model", "large-v3"));
  const [whisperDevice, setWhisperDevice] = useState(() => loadSetting("whisper_device", "cuda"));
  const [batchSize, setBatchSize] = useState(() => loadSetting("whisper_batch_size", 4));
  const [computeType, setComputeType] = useState(() => loadSetting("whisper_compute_type", "float16"));
  const [beamSize, setBeamSize] = useState(() => loadSetting("whisper_beam_size", 5));
  const [chunkSize, setChunkSize] = useState(() => loadSetting("whisper_chunk_size", 20));
  const [diarization, setDiarization] = useState(() => loadSetting("whisper_diarization", true));
  const [vad, setVad] = useState(() => loadSetting("whisper_vad", true));

  // ── Dirty tracking ──
  const [saved, setSaved] = useState(true);
  const markDirty = () => setSaved(false);

  // ── Server info ──
  const [serverInfo, setServerInfo] = useState<{ available: boolean; dbSize?: number; version?: string } | null>(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    getServerInfo().then(setServerInfo);
  }, []);

  const normalizeScriberrHost = (value: string) =>
    value.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");

  const resolveScriberrBase = () => {
    const normalizedHost = normalizeScriberrHost(scriberrUrl);
    if (!normalizedHost) return `${window.location.origin}/scriberr`;
    return `${scriberrProtocol}://${normalizedHost}`;
  };

  const testScriberr = async () => {
    setScriberrStatus("testing");
    try {
      const base = resolveScriberrBase();
      const h: Record<string, string> = {};
      if (apiKey) {
        if (authMethod === "bearer") {
          h["Authorization"] = `Bearer ${apiKey}`;
        } else {
          h["X-API-Key"] = apiKey;
        }
      }
      const res = await fetch(`${base}/api/v1/health`, {
        method: "GET",
        headers: h,
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        setScriberrStatus("connected");
        toast.success(normalizeScriberrHost(scriberrUrl) ? "Scriberr is healthy" : "Scriberr proxy is healthy");
      } else {
        setScriberrStatus("error");
        toast.error(`Scriberr returned ${res.status}`);
      }
    } catch (err: any) {
      setScriberrStatus("error");
      toast.error(err?.name === "TimeoutError" ? "Connection timed out" : `Cannot reach Scriberr: ${err.message}`);
    }
  };

  const testTelegram = async () => {
    setTgStatus("testing");
    setTimeout(() => setTgStatus(tgBotToken ? "connected" : "error"), 1500);
  };

  const handleSave = () => {
    const normalizedScriberrHost = normalizeScriberrHost(scriberrUrl);

    // Scriberr
    saveSetting("scriberr_url", normalizedScriberrHost);
    saveSetting("scriberr_protocol", scriberrProtocol);
    saveSetting("scriberr_api_key", apiKey);
    saveSetting("scriberr_auth_method", authMethod);
    saveSetting("tg_enabled", tgEnabled);
    saveSetting("tg_bot_token", tgBotToken);
    saveSetting("tg_chat_id", tgChatId);
    // Processing
    saveSetting("auto_transcribe", autoTranscribe);
    saveSetting("speaker_detection", speakerDetection);
    saveSetting("auto_retry_oom", autoRetryOom);
    saveSetting("publish_sheets", publishSheets);
    // Google
    saveSetting("google_calendar_id", googleCalId);
    saveSetting("google_sheets_id", googleSheetsId);
    saveSetting("google_tab", googleTab);
    saveSetting("timezone", timezone);
    // Transcription Engine
    saveSetting("whisper_model", whisperModel);
    saveSetting("whisper_device", whisperDevice);
    saveSetting("whisper_batch_size", batchSize);
    saveSetting("whisper_compute_type", computeType);
    saveSetting("whisper_beam_size", beamSize);
    saveSetting("whisper_chunk_size", chunkSize);
    saveSetting("whisper_diarization", diarization);
    saveSetting("whisper_vad", vad);

    setSaved(true);
    toast.success("Settings saved");
  };

  const StatusBadge = ({ status }: { status: ConnectionStatus }) => {
    if (status === "untested") return null;
    if (status === "testing") return <Loader2 className="h-3.5 w-3.5 text-info animate-spin" />;
    if (status === "connected") return <CheckCircle2 className="h-3.5 w-3.5 text-success" />;
    return <XCircle className="h-3.5 w-3.5 text-destructive" />;
  };

  // Helper to update state + mark dirty
  const set = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); markDirty(); };

  // Activity log state
  const [activitySearch, setActivitySearch] = useState("");
  const [activityFilter, setActivityFilter] = useState("all");

  const rawLog = loadActivityLog();
  const allActivity: ActivityEvent[] = rawLog.map((entry: any, i: number) => ({
    id: entry.id || `log_${i}`,
    timestamp: entry.timestamp || "",
    type: entry.type || "system",
    message: entry.message || "",
    status: entry.status || (entry.type === "error" ? "error" : "success"),
    details: entry.details,
  }));

  const filteredActivity = allActivity.filter((e) => {
    if (activityFilter !== "all" && e.type !== activityFilter) return false;
    if (activitySearch && !e.message.toLowerCase().includes(activitySearch.toLowerCase())) return false;
    return true;
  });

  const activityFilters = [
    { value: "all", label: "All" },
    { value: "upload", label: "Upload" },
    { value: "transcription", label: "Transcription" },
    { value: "error", label: "Errors" },
  ];

  return (
    <div className="space-y-6 2xl:space-y-8 max-w-2xl 2xl:max-w-3xl 3xl:max-w-4xl">
      <div>
        <h1 className="text-2xl 2xl:text-3xl 3xl:text-4xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure integrations and preferences
        </p>
      </div>

      <Tabs defaultValue="settings" className="space-y-6">
        <TabsList>
          <TabsTrigger value="settings">Configuration</TabsTrigger>
          <TabsTrigger value="activity" className="gap-1.5">
            <ScrollText className="h-3.5 w-3.5" />
            Activity Log
            {allActivity.length > 0 && (
              <span className="ml-1 text-[10px] opacity-60">{allActivity.length}</span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="space-y-8 2xl:space-y-10">

      {/* Scriberr */}
      <section className="space-y-4 rounded-lg border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-primary" />
            <h2 className="text-base font-medium">Scriberr API</h2>
            <StatusBadge status={scriberrStatus} />
          </div>
          <a href="https://github.com/rishikanthc/Scriberr" target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
            Docs <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Base URL (optional)</Label>
            <div className="flex items-center gap-0 mt-1">
              <button
                type="button"
                onClick={() => { const next = scriberrProtocol === "http" ? "https" : "http"; setScriberrProtocol(next); markDirty(); }}
                className={cn(
                  "flex items-center gap-1 rounded-l-md border border-r-0 px-2.5 py-2 text-xs font-mono transition-colors shrink-0",
                  scriberrProtocol === "https"
                    ? "bg-success/10 border-success/30 text-success"
                    : "bg-muted border-border text-muted-foreground hover:text-foreground"
                )}
                title={scriberrProtocol === "https" ? "Using HTTPS (secure)" : "Using HTTP (insecure)"}
              >
                {scriberrProtocol === "https" ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                {scriberrProtocol}://
              </button>
              <Input
                value={scriberrUrl}
                onChange={(e) => set(setScriberrUrl)(e.target.value)}
                className="rounded-l-none bg-background font-mono text-sm"
                placeholder="Leave empty to use /scriberr proxy"
              />
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Docker cross-stack: expose Scriberr on host port <span className="font-mono">8080</span> and keep this field empty.
            </p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Authentication</Label>
            <div className="flex items-center gap-0 mt-1">
              <button
                type="button"
                onClick={() => { const next = authMethod === "x-api-key" ? "bearer" : "x-api-key"; setAuthMethod(next); markDirty(); }}
                className={cn(
                  "rounded-l-md border border-r-0 px-2.5 py-2 text-xs font-mono transition-colors shrink-0",
                  "bg-muted border-border text-muted-foreground hover:text-foreground"
                )}
                title={authMethod === "x-api-key" ? "Using X-API-Key header" : "Using Bearer token"}
              >
                {authMethod === "x-api-key" ? "X-API-Key" : "Bearer"}
              </button>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => set(setApiKey)(e.target.value)}
                className="rounded-l-none bg-background font-mono text-sm"
                placeholder="Enter API key"
              />
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={testScriberr} className="gap-1.5 text-xs">
            Test Connection
          </Button>
        </div>
      </section>

      {/* Telegram */}
      <section className="space-y-4 rounded-lg border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-info" />
            <h2 className="text-base font-medium">Telegram Bot</h2>
            <StatusBadge status={tgStatus} />
          </div>
          <Switch checked={tgEnabled} onCheckedChange={set(setTgEnabled)} />
        </div>
        <p className="text-xs text-muted-foreground">
          Receive voice messages and audio files. Get interactive notifications for meeting selection, speaker renaming, and transcription status.
        </p>
        {tgEnabled && (
          <div className="space-y-3 pt-2">
            <div>
              <Label className="text-xs text-muted-foreground">Bot Token</Label>
              <Input
                type="password"
                value={tgBotToken}
                onChange={(e) => set(setTgBotToken)(e.target.value)}
                className="mt-1 bg-background font-mono text-sm"
                placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                Get from{" "}
                <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  @BotFather
                </a>
              </p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Allowed Chat IDs</Label>
              <Input
                value={tgChatId}
                onChange={(e) => set(setTgChatId)(e.target.value)}
                className="mt-1 bg-background font-mono text-sm"
                placeholder="Comma-separated chat IDs"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                Restrict which chats can send files. Leave empty to allow all.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={testTelegram} className="gap-1.5 text-xs">
              Test Bot Connection
            </Button>
          </div>
        )}
      </section>

      {/* AI Model Routing */}
      <AIModelRoutingSection />

      {/* Processing */}
      <section className="space-y-4 rounded-lg border border-border bg-card p-6">
        <h2 className="text-base font-medium">Processing</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Auto-transcribe on upload</p>
              <p className="text-xs text-muted-foreground">Automatically start transcription when files are uploaded</p>
            </div>
            <Switch checked={autoTranscribe} onCheckedChange={set(setAutoTranscribe)} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">AI Speaker Detection</p>
              <p className="text-xs text-muted-foreground">Use OpenRouter to identify and label speakers after transcription</p>
            </div>
            <Switch checked={speakerDetection} onCheckedChange={set(setSpeakerDetection)} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Auto-retry on GPU OOM</p>
              <p className="text-xs text-muted-foreground">Automatically retry on CPU if GPU runs out of memory</p>
            </div>
            <Switch checked={autoRetryOom} onCheckedChange={set(setAutoRetryOom)} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Publish to Google Sheets</p>
              <p className="text-xs text-muted-foreground">Automatically log completed meetings to Google Sheets</p>
            </div>
            <Switch checked={publishSheets} onCheckedChange={set(setPublishSheets)} />
          </div>
        </div>
      </section>

      {/* Google */}
      <section className="space-y-4 rounded-lg border border-border bg-card p-6">
        <h2 className="text-base font-medium">Google Integration</h2>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Google Calendar ID</Label>
            <Input value={googleCalId} onChange={(e) => set(setGoogleCalId)(e.target.value)} className="mt-1 bg-background font-mono text-sm" placeholder="primary" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Google Sheets ID</Label>
            <Input value={googleSheetsId} onChange={(e) => set(setGoogleSheetsId)(e.target.value)} className="mt-1 bg-background font-mono text-sm" placeholder="Spreadsheet ID for meeting logs" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Meeting Logs Tab</Label>
            <Input value={googleTab} onChange={(e) => set(setGoogleTab)(e.target.value)} className="mt-1 bg-background font-mono text-sm" placeholder="Meeting_Logs" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Timezone</Label>
            <select
              value={timezone}
              onChange={(e) => set(setTimezone)(e.target.value)}
              className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm font-mono focus:ring-1 focus:ring-ring outline-none"
            >
              <option value="Pacific/Midway">(UTC-11:00) Midway</option>
              <option value="Pacific/Honolulu">(UTC-10:00) Honolulu</option>
              <option value="America/Anchorage">(UTC-09:00) Anchorage</option>
              <option value="America/Los_Angeles">(UTC-08:00) Los Angeles</option>
              <option value="America/Denver">(UTC-07:00) Denver</option>
              <option value="America/Chicago">(UTC-06:00) Chicago</option>
              <option value="America/New_York">(UTC-05:00) New York</option>
              <option value="America/Sao_Paulo">(UTC-03:00) São Paulo</option>
              <option value="Atlantic/Reykjavik">(UTC+00:00) Reykjavik</option>
              <option value="Europe/London">(UTC+00:00) London</option>
              <option value="Europe/Berlin">(UTC+01:00) Berlin</option>
              <option value="Europe/Paris">(UTC+01:00) Paris</option>
              <option value="Europe/Istanbul">(UTC+03:00) Istanbul</option>
              <option value="Europe/Moscow">(UTC+03:00) Moscow</option>
              <option value="Asia/Dubai">(UTC+04:00) Dubai</option>
              <option value="Asia/Kolkata">(UTC+05:30) Kolkata</option>
              <option value="Asia/Almaty">(UTC+06:00) Almaty</option>
              <option value="Asia/Bangkok">(UTC+07:00) Bangkok</option>
              <option value="Asia/Shanghai">(UTC+08:00) Shanghai</option>
              <option value="Asia/Tokyo">(UTC+09:00) Tokyo</option>
              <option value="Australia/Sydney">(UTC+10:00) Sydney</option>
              <option value="Pacific/Auckland">(UTC+12:00) Auckland</option>
            </select>
          </div>
        </div>
      </section>

      {/* Auto-Tagging Rules */}
      <AutoTagRulesSection />

      {/* AI Prompts */}
      <AIPromptsSection />

      {/* Local Storage & Sync */}
      <OfflineSyncSection />

      {/* Folder Watcher */}
      <FolderWatchSection />

      {/* Excel Import */}
      <ExcelImportSection />

      <section className="space-y-4 rounded-lg border border-border bg-card p-6">
        <h2 className="text-base font-medium">Transcription Engine</h2>
        <p className="text-xs text-muted-foreground">WhisperX configuration passed to Scriberr API</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Model</Label>
            <select
              value={whisperModel}
              onChange={(e) => set(setWhisperModel)(e.target.value)}
              className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm font-mono focus:ring-1 focus:ring-ring outline-none"
            >
              <option>large-v3</option>
              <option>large-v2</option>
              <option>medium</option>
              <option>small</option>
              <option>base</option>
              <option>tiny</option>
            </select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Device</Label>
            <select
              value={whisperDevice}
              onChange={(e) => set(setWhisperDevice)(e.target.value)}
              className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm font-mono focus:ring-1 focus:ring-ring outline-none"
            >
              <option value="cuda">CUDA (GPU)</option>
              <option value="cpu">CPU</option>
            </select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Batch Size</Label>
            <Input value={batchSize} onChange={(e) => set(setBatchSize)(Number(e.target.value))} className="mt-1 bg-background font-mono text-sm" type="number" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Compute Type</Label>
            <select
              value={computeType}
              onChange={(e) => set(setComputeType)(e.target.value)}
              className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm font-mono focus:ring-1 focus:ring-ring outline-none"
            >
              <option value="float16">float16</option>
              <option value="int8">int8</option>
              <option value="float32">float32</option>
            </select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Beam Size</Label>
            <Input value={beamSize} onChange={(e) => set(setBeamSize)(Number(e.target.value))} className="mt-1 bg-background font-mono text-sm" type="number" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Chunk Size</Label>
            <Input value={chunkSize} onChange={(e) => set(setChunkSize)(Number(e.target.value))} className="mt-1 bg-background font-mono text-sm" type="number" />
          </div>
        </div>
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Speaker Diarization</p>
              <p className="text-xs text-muted-foreground">Use pyannote for speaker separation</p>
            </div>
            <Switch checked={diarization} onCheckedChange={set(setDiarization)} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">VAD (Voice Activity Detection)</p>
              <p className="text-xs text-muted-foreground">Use pyannote VAD for better segmentation</p>
            </div>
            <Switch checked={vad} onCheckedChange={set(setVad)} />
          </div>
        </div>
      </section>

      {/* Data & Backup */}
      <section className="space-y-4 rounded-lg border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            <h2 className="text-base font-medium">Data & Backup</h2>
          </div>
          {serverInfo && (
            <div className="flex items-center gap-2">
              <Server className="h-3.5 w-3.5 text-muted-foreground" />
              <span className={cn(
                "text-[11px] font-mono",
                serverInfo.available ? "text-success" : "text-muted-foreground"
              )}>
                {serverInfo.available ? "Server connected" : "Server offline — localStorage only"}
              </span>
              {serverInfo.available && serverInfo.dbSize && (
                <span className="text-[10px] font-mono text-muted-foreground">
                  ({(serverInfo.dbSize / 1024).toFixed(0)} KB)
                </span>
              )}
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {serverInfo?.available
            ? "Data is stored on the server (SQLite) and synced to your browser. Download a backup before app updates or server migration."
            : "Server API not detected. Data is stored in your browser's localStorage only. Deploy with Docker to enable server-side persistence."}
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={isBackingUp}
            onClick={async () => {
              setIsBackingUp(true);
              try {
                await downloadBackup();
                toast.success(serverInfo?.available
                  ? "Backup downloaded (ZIP with separate files)"
                  : "Backup downloaded (JSON)");
              } catch (e: any) {
                toast.error(e.message || "Backup failed");
              } finally {
                setIsBackingUp(false);
              }
            }}
          >
            {isBackingUp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Download Backup
          </Button>

          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={isRestoring}
              onClick={() => document.getElementById("restore-input")?.click()}
            >
              {isRestoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Restore from Backup
            </Button>
            <input
              id="restore-input"
              type="file"
              accept=".zip,.json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setIsRestoring(true);
                try {
                  const result = await uploadRestore(file);
                  toast.success(`Restored ${result.restoredKeys} data entries. Reloading...`);
                  setTimeout(() => window.location.reload(), 1000);
                } catch (err: any) {
                  toast.error(err.message || "Restore failed");
                } finally {
                  setIsRestoring(false);
                  e.target.value = "";
                }
              }}
            />
          </div>
        </div>

        <div className="rounded-md bg-secondary/30 px-3 py-2 mt-2">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Migration guide:</strong> To move data to a new server,
            download a backup → deploy new instance → restore from backup.
            {serverInfo?.available && " The backup ZIP contains individual meeting, transcript, and override files plus a raw SQLite DB copy."}
          </p>
        </div>
      </section>

      {/* Save & Clear */}
      <div className="flex items-center justify-between sticky bottom-4 bg-background/95 backdrop-blur-sm rounded-lg border border-border px-4 py-3">
        <Button onClick={handleSave} className="gap-2">
          <Save className="h-4 w-4" />
          Save Settings
          {!saved && (
            <span className="ml-1 h-2 w-2 rounded-full bg-warning animate-pulse" />
          )}
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10">
              <Trash2 className="h-4 w-4" />
              Clear All Data
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear all application data?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete all meetings, transcripts, settings, auto-tagging rules, AI usage history, and activity logs. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  const keys = Object.keys(localStorage).filter((k) => k.startsWith("meetscribe_"));
                  keys.forEach((k) => localStorage.removeItem(k));

                  toast.success("Cleared all data, including imported meetings.");
                  setTimeout(() => window.location.reload(), 500);
                }}
              >
                Delete Everything
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search activity..."
                className="pl-9 bg-card"
                value={activitySearch}
                onChange={(e) => setActivitySearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-1">
              {activityFilters.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setActivityFilter(f.value)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    activityFilter === f.value
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {allActivity.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  saveSetting("activity_log", []);
                  window.location.reload();
                }}
                className="text-xs text-muted-foreground gap-1"
              >
                <Trash2 className="h-3 w-3" />
                Clear
              </Button>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card">
            {filteredActivity.length > 0 ? (
              <ActivityLog events={filteredActivity} />
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">
                {allActivity.length === 0 ? "No activity yet. Upload a file to see events here." : "No activity found"}
              </p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
