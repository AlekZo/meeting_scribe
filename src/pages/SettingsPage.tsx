import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Save, ExternalLink, MessageCircle, Loader2, CheckCircle2, XCircle, Cpu, Trash2, Download, Upload, Database, HardDrive, Server, Lock, Unlock, ScrollText, Search, Filter, Sparkles, Zap, FolderOpen, Tag, FileSpreadsheet, Bot, Settings2, ChevronRight, RefreshCw, File, Eye, EyeOff, Info, Moon, Sun, Monitor } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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

// @ts-ignore — injected by Vite define
const APP_VERSION: string = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "1.0.0";

type ConnectionStatus = "untested" | "testing" | "connected" | "error";

interface SectionDef {
  id: string;
  label: string;
  icon: React.ElementType;
  group: string;
}

const sections: SectionDef[] = [
  { id: "scriberr", label: "Scriberr API", icon: Cpu, group: "Integrations" },
  { id: "telegram", label: "Telegram Bot", icon: MessageCircle, group: "Integrations" },
  { id: "google", label: "Google", icon: FileSpreadsheet, group: "Integrations" },
  { id: "google-calendar", label: "Google Calendar", icon: FileSpreadsheet, group: "Integrations" },
  { id: "ai-routing", label: "AI Model Routing", icon: Bot, group: "AI & Processing" },
  { id: "ai-prompts", label: "AI Prompts", icon: Sparkles, group: "AI & Processing" },
  { id: "processing", label: "Processing", icon: Zap, group: "AI & Processing" },
  { id: "transcription", label: "Transcription Engine", icon: Settings2, group: "AI & Processing" },
  { id: "storage", label: "Storage & Volumes", icon: HardDrive, group: "Data" },
  { id: "auto-tags", label: "Auto-Tag Rules", icon: Tag, group: "Data" },
  { id: "folder-watch", label: "Folder Watcher", icon: FolderOpen, group: "Data" },
  { id: "excel-import", label: "Excel Import", icon: FileSpreadsheet, group: "Data" },
  { id: "sync", label: "Local Storage & Sync", icon: HardDrive, group: "Data" },
  { id: "backup", label: "Data & Backup", icon: Database, group: "Data" },
  { id: "activity", label: "Activity Log", icon: ScrollText, group: "Data" },
  { id: "appearance", label: "Appearance", icon: Monitor, group: "Data" },
];

const groups = ["Integrations", "AI & Processing", "Data"];

// ── Password input with show/hide toggle ──
function PasswordInput({ value, onChange, className, placeholder }: { value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; className?: string; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        className={cn(className, "pr-8")}
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        aria-label={show ? "Hide" : "Show"}
      >
        {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

// ── Info tooltip for Whisper params ──
function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex ml-1">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen(!open)}
        className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        aria-label="Info"
      >
        <Info className="h-3 w-3" />
      </button>
      {open && (
        <span className="absolute bottom-full left-0 mb-1.5 px-2.5 py-2 rounded-md bg-popover border border-border text-[11px] leading-relaxed text-popover-foreground w-64 z-50 shadow-lg">
          {text}
        </span>
      )}
    </span>
  );
}

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState("scriberr");

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
  

  // ── Google ──
  const [googleCalId, setGoogleCalId] = useState(() => loadSetting("google_calendar_id", ""));
  const [googleDriveFolderId, setGoogleDriveFolderId] = useState(() => loadSetting("google_drive_folder_id", ""));
  const [googleAutoSync, setGoogleAutoSync] = useState(() => loadSetting("google_auto_sync_docs", false));
  const [googleCalMatch, setGoogleCalMatch] = useState(() => loadSetting("google_cal_match", true));
  const [timezone, setTimezone] = useState(() => loadSetting("timezone", "Europe/Moscow"));
  const [googleStatus, setGoogleStatus] = useState<ConnectionStatus>("untested");
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [googleSaEmail, setGoogleSaEmail] = useState<string | null>(null);
  const saFileRef = useRef<HTMLInputElement>(null);

  // ── Transcription Engine ──
  const [whisperModel, setWhisperModel] = useState(() => loadSetting("whisper_model", "large-v3"));
  const [whisperDevice, setWhisperDevice] = useState(() => loadSetting("whisper_device", "cuda"));
  const [batchSize, setBatchSize] = useState(() => loadSetting("whisper_batch_size", 4));
  const [computeType, setComputeType] = useState(() => loadSetting("whisper_compute_type", "float16"));
  const [beamSize, setBeamSize] = useState(() => loadSetting("whisper_beam_size", 5));
  const [chunkSize, setChunkSize] = useState(() => loadSetting("whisper_chunk_size", 20));
  const [diarization, setDiarization] = useState(() => loadSetting("whisper_diarization", true));
  const [vad, setVad] = useState(() => loadSetting("whisper_vad", true));
  const [threads, setThreads] = useState(() => loadSetting("whisper_threads", 4));

  // ── Dirty tracking with beforeunload guard ──
  const [saved, setSaved] = useState(true);
  const markDirty = () => setSaved(false);

  useEffect(() => {
    if (saved) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saved]);

  // ── Global settings search ──
  const [settingsSearch, setSettingsSearch] = useState("");

  // ── Server info ──
  const [serverInfo, setServerInfo] = useState<{ available: boolean; dbSize?: number; version?: string } | null>(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  // ── Storage info ──
  const [storageInfo, setStorageInfo] = useState<{ dataDir: string; totalSize: number; fileCount: number; files: { path: string; size: number; modified: string }[] } | null>(null);
  const [storageLoading, setStorageLoading] = useState(false);

  const fetchStorageInfo = async () => {
    setStorageLoading(true);
    try {
      const res = await fetch("/api/storage", { signal: AbortSignal.timeout(5000) });
      if (res.ok) setStorageInfo(await res.json());
    } catch {}
    setStorageLoading(false);
  };

  useEffect(() => {
    getServerInfo().then(setServerInfo);
    fetchStorageInfo();
    // Load Google SA status
    fetch("/api/google/status").then(r => r.json()).then(d => {
      if (d.configured) setGoogleSaEmail(d.email);
    }).catch(() => {});
  }, []);

  const normalizeScriberrHost = (value: string) =>
    value.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");

  const resolveScriberrBase = () => {
    const normalizedHost = normalizeScriberrHost(scriberrUrl);
    if (!normalizedHost) return "/scriberr";
    if (normalizedHost.includes("scriberr-blackwell")) {
      console.warn("Warning: Using internal Docker hostname. This will fail in browser. Use the Nginx proxy instead (leave empty) or provide an external hostname.");
    }
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
      // Use /auth/registration-status which is a safe endpoint that doesn't require auth
      const res = await fetch(`${base}/api/v1/auth/registration-status`, {
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
      const base2 = resolveScriberrBase();
      let errorMsg = `Cannot reach Scriberr: ${err.message}`;
      if (err?.name === "TimeoutError") {
        errorMsg = `Connection timed out to ${base2}. Check if Scriberr is running and accessible.`;
      } else if (err?.message?.includes("Failed to fetch")) {
        errorMsg = `Failed to fetch from ${base2}. If using internal Docker hostname (scriberr-blackwell), leave URL empty to use Nginx proxy.`;
      }
      toast.error(errorMsg);
    }
  };

  const testTelegram = async () => {
    setTgStatus("testing");
    try {
      const { testBotConnection } = await import("@/lib/telegram");
      const bot = await testBotConnection();
      setTgStatus("connected");
      toast.success(`Connected to @${bot.username}`);
    } catch (err: any) {
      setTgStatus("error");
      toast.error(err.message || "Telegram connection failed");
    }
  };

  const handleSave = () => {
    const normalizedScriberrHost = normalizeScriberrHost(scriberrUrl);
    saveSetting("scriberr_url", normalizedScriberrHost);
    saveSetting("scriberr_protocol", scriberrProtocol);
    saveSetting("scriberr_api_key", apiKey);
    saveSetting("scriberr_auth_method", authMethod);
    saveSetting("tg_enabled", tgEnabled);
    saveSetting("tg_bot_token", tgBotToken);
    saveSetting("tg_chat_id", tgChatId);
    saveSetting("auto_transcribe", autoTranscribe);
    saveSetting("speaker_detection", speakerDetection);
    saveSetting("auto_retry_oom", autoRetryOom);
    
    saveSetting("google_calendar_id", googleCalId);
    saveSetting("google_drive_folder_id", googleDriveFolderId);
    saveSetting("google_auto_sync_docs", googleAutoSync);
    saveSetting("google_cal_match", googleCalMatch);
    saveSetting("timezone", timezone);
    saveSetting("whisper_model", whisperModel);
    saveSetting("whisper_device", whisperDevice);
    saveSetting("whisper_batch_size", batchSize);
    saveSetting("whisper_compute_type", computeType);
    saveSetting("whisper_beam_size", beamSize);
    saveSetting("whisper_chunk_size", chunkSize);
    saveSetting("whisper_diarization", diarization);
    saveSetting("whisper_vad", vad);
    saveSetting("whisper_threads", threads);
    setSaved(true);
    toast.success("Settings saved");
  };

  const StatusBadge = ({ status }: { status: ConnectionStatus }) => {
    if (status === "untested") return null;
    if (status === "testing") return <Loader2 className="h-3.5 w-3.5 text-info animate-spin" />;
    if (status === "connected") return <CheckCircle2 className="h-3.5 w-3.5 text-success" />;
    return <XCircle className="h-3.5 w-3.5 text-destructive" />;
  };

  const set = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); markDirty(); };

  // Activity log
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

  // Select input class
  const selectCls = "mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm font-mono focus:ring-1 focus:ring-ring outline-none";

  const activeGroup = sections.find((s) => s.id === activeSection)?.group || groups[0];

  // ── Search matching: jump to matching section ──
  useEffect(() => {
    if (!settingsSearch.trim()) return;
    const q = settingsSearch.toLowerCase();
    // Map keywords to section IDs
    const keywordMap: Record<string, string[]> = {
      scriberr: ["scriberr", "api key", "proxy", "nginx", "connection"],
      telegram: ["telegram", "bot token", "chat id", "tg"],
      google: ["google", "calendar", "drive", "service account", "timezone"],
      "ai-routing": ["openrouter", "model", "routing", "ai model"],
      "ai-prompts": ["prompt", "system prompt"],
      processing: ["auto-transcribe", "speaker detection", "retry", "oom"],
      transcription: ["whisper", "beam", "batch", "compute", "diarization", "vad", "chunk"],
      storage: ["volume", "docker", "mount"],
      "auto-tags": ["tag", "rule", "category", "keyword"],
      "folder-watch": ["folder", "watch", "directory"],
      "excel-import": ["excel", "import", "spreadsheet"],
      sync: ["sync", "local", "offline"],
      backup: ["backup", "restore", "export", "clear"],
      activity: ["activity", "log", "event"],
      appearance: ["theme", "dark", "light", "appearance", "mode"],
    };
    for (const [sectionId, keywords] of Object.entries(keywordMap)) {
      if (keywords.some((kw) => kw.includes(q) || q.includes(kw))) {
        setActiveSection(sectionId);
        break;
      }
    }
  }, [settingsSearch]);

  return (
    <div className="space-y-6">
      {/* Header + Search + Save */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight shrink-0">Settings</h1>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search settings..."
            className="pl-9 h-8 text-xs bg-card"
            value={settingsSearch}
            onChange={(e) => setSettingsSearch(e.target.value)}
          />
        </div>
        <Button onClick={handleSave} size="sm" className="gap-1.5 shrink-0">
          <Save className="h-3.5 w-3.5" />
          Save
          {!saved && <span className="ml-1 h-2 w-2 rounded-full bg-warning animate-pulse" />}
        </Button>
      </div>

      {/* Group tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {groups.map((group) => (
          <button
            key={group}
            onClick={() => {
              const firstInGroup = sections.find((s) => s.group === group);
              if (firstInGroup) setActiveSection(firstInGroup.id);
            }}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
              activeGroup === group
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            )}
          >
            {group}
          </button>
        ))}
      </div>

      {/* Section pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        {sections.filter((s) => s.group === activeGroup).map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              activeSection === s.id
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            )}
          >
            <s.icon className="h-3 w-3" />
            {s.label}
            {s.id === "activity" && allActivity.length > 0 && (
              <span className="ml-0.5 text-[10px] opacity-70">({allActivity.length})</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="max-w-2xl space-y-6">

          {/* ── Scriberr ── */}
          {activeSection === "scriberr" && (
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <StatusBadge status={scriberrStatus} />
                <a href="https://github.com/rishikanthc/Scriberr" target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 ml-auto">
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
                    >
                      {scriberrProtocol === "https" ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                      {scriberrProtocol}://
                    </button>
                    <Input
                      value={scriberrUrl}
                      onChange={(e) => set(setScriberrUrl)(e.target.value)}
                      className="rounded-l-none bg-background font-mono text-sm"
                      placeholder="192.168.1.100:8080 or scriberr.local"
                    />
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    <strong>Recommended:</strong> Leave empty to use Nginx proxy (works in Docker). <br/>
                    <strong>External:</strong> Use external IP/hostname like <span className="font-mono">192.168.1.50:8080</span> or <span className="font-mono">scriberr.example.com</span>. <br/>
                    <strong>Note:</strong> Internal Docker IPs (172.x.x.x) won't work from browser.
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
                    >
                      {authMethod === "x-api-key" ? "X-API-Key" : "Bearer"}
                    </button>
                    <PasswordInput
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

              {/* Scriberr Cleanup */}
              <div className="rounded-md border border-border p-4 space-y-2 mt-4">
                <p className="text-sm font-medium text-foreground">Scriberr Cleanup</p>
                <p className="text-xs text-muted-foreground">
                  Remove processing data from Scriberr <strong>only</strong> for meetings tracked in this app.
                  Other Scriberr jobs are not affected. Your local transcripts and media files will remain safe.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={async () => {
                    const { loadMeetings: lm, saveMeetings: sm } = await import("@/lib/storage");
                    const { deleteScriberrJob } = await import("@/lib/scriberr");
                    const meetings = lm();
                    let deletedCount = 0;
                    for (const meeting of meetings) {
                      if (meeting.id && !meeting.scriberrDeleted && meeting.status === "completed") {
                        try {
                          const success = await deleteScriberrJob(meeting.id);
                          if (success) {
                            meeting.scriberrDeleted = true;
                            deletedCount++;
                          }
                        } catch {}
                      }
                    }
                    sm(meetings);
                    if (deletedCount > 0) {
                      toast.success(`Cleaned up ${deletedCount} meeting(s) from Scriberr`);
                    } else {
                      toast.info("No meetings to clean up");
                    }
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                  Clean up Scriberr Storage
                </Button>
              </div>
            </section>
          )}

          {/* ── Telegram ── */}
          {activeSection === "telegram" && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
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
                    <PasswordInput value={tgBotToken} onChange={(e) => set(setTgBotToken)(e.target.value)} className="mt-1 bg-background font-mono text-sm" placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11" />
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Get from <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-primary hover:underline">@BotFather</a>
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Allowed Chat IDs</Label>
                    <Input value={tgChatId} onChange={(e) => set(setTgChatId)(e.target.value)} className="mt-1 bg-background font-mono text-sm" placeholder="Comma-separated chat IDs" />
                    <p className="mt-1 text-[10px] text-muted-foreground">Restrict which chats can send files. Leave empty to allow all.</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={testTelegram} className="gap-1.5 text-xs">Test Bot Connection</Button>
                </div>
              )}
            </section>
          )}

          {/* ── Google ── */}
          {activeSection === "google" && (
            <section className="space-y-4">
              {/* Setup Guide */}
              <Collapsible>
                <div className="rounded-md border border-primary/20 bg-primary/5 overflow-hidden">
                  <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 text-xs font-medium text-primary hover:bg-primary/10 transition-colors">
                    <span className="flex items-center gap-1.5">
                      <ScrollText className="h-3.5 w-3.5" />
                      How to set up Google Integration
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 [[data-state=open]>&]:rotate-90" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t border-primary/10 px-3 py-3 text-xs text-muted-foreground space-y-3">
                      <div className="space-y-1.5">
                        <p className="font-medium text-foreground">Step 1: Create a Google Cloud Service Account</p>
                        <ol className="list-decimal list-inside space-y-0.5 ml-1">
                          <li>Go to <a href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">Google Cloud Console → Service Accounts</a></li>
                          <li>Create a new project (or use an existing one)</li>
                          <li>Click <strong>"Create Service Account"</strong>, give it a name (e.g. "Meeting Transcriber")</li>
                          <li>Click <strong>"Done"</strong> — no roles needed</li>
                          <li>Click the created account → <strong>Keys</strong> tab → <strong>Add Key → Create new key → JSON</strong></li>
                          <li>Download the JSON file — you'll upload it below</li>
                        </ol>
                      </div>

                      <div className="space-y-1.5">
                        <p className="font-medium text-foreground">Step 2: Enable APIs</p>
                        <ol className="list-decimal list-inside space-y-0.5 ml-1">
                          <li>In Google Cloud Console, go to <strong>APIs & Services → Library</strong></li>
                          <li>Enable <strong>Google Calendar API</strong></li>
                          <li>Enable <strong>Google Drive API</strong></li>
                          <li>Enable <strong>Google Docs API</strong></li>
                        </ol>
                      </div>

                      <div className="space-y-1.5">
                        <p className="font-medium text-foreground">Step 3: Share your Calendar</p>
                        <ol className="list-decimal list-inside space-y-0.5 ml-1">
                          <li>Open <a href="https://calendar.google.com" target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">Google Calendar</a></li>
                          <li>Click the ⋮ next to your calendar → <strong>Settings and sharing</strong></li>
                          <li>Under <strong>"Share with specific people"</strong>, add the service account email</li>
                          <li>Set permission to <strong>"See all event details"</strong></li>
                          <li>Copy the <strong>Calendar ID</strong> from the "Integrate calendar" section (or use "primary")</li>
                        </ol>
                      </div>

                      <div className="space-y-1.5">
                        <p className="font-medium text-foreground">Step 4: Share a Drive Folder (optional)</p>
                        <ol className="list-decimal list-inside space-y-0.5 ml-1">
                          <li>Create a folder in <a href="https://drive.google.com" target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">Google Drive</a> for transcripts</li>
                          <li>Right-click → <strong>Share</strong> → add the service account email as <strong>Editor</strong></li>
                          <li>Copy the <strong>Folder ID</strong> from the URL: <code className="text-[10px] bg-secondary px-1 py-0.5 rounded">drive.google.com/drive/folders/<strong>THIS_PART</strong></code></li>
                        </ol>
                      </div>

                      <div className="space-y-1.5">
                        <p className="font-medium text-foreground">Step 5: Configure below</p>
                        <p>Upload the JSON key, paste your Calendar ID and Drive Folder ID, then hit <strong>Test Connection</strong>.</p>
                      </div>
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
              {/* Service Account */}
              <div className="rounded-md border border-border p-3 space-y-2">
                <Label className="text-xs font-medium">Service Account</Label>
                {googleSaEmail ? (
                  <div className="flex items-center gap-2 text-xs">
                    <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                    <span className="font-mono text-muted-foreground truncate">{googleSaEmail}</span>
                    <Button size="sm" variant="ghost" className="ml-auto h-6 text-xs text-destructive" onClick={async () => {
                      await fetch("/api/google/service-account", { method: "DELETE" });
                      setGoogleSaEmail(null);
                      setGoogleStatus("untested");
                      toast.success("Service account removed");
                    }}>Remove</Button>
                  </div>
                ) : (
                  <div>
                    <input ref={saFileRef} type="file" accept=".json" className="hidden" onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const fd = new FormData();
                      fd.append("sa", file);
                      try {
                        const res = await fetch("/api/google/service-account", { method: "POST", body: fd });
                        const data = await res.json();
                        if (res.ok) {
                          setGoogleSaEmail(data.email);
                          toast.success(`Service account configured: ${data.email}`);
                        } else {
                          toast.error(data.error);
                        }
                      } catch (err: any) {
                        toast.error(`Upload failed: ${err.message}`);
                      }
                      e.target.value = "";
                    }} />
                    <Button size="sm" variant="outline" className="text-xs" onClick={() => saFileRef.current?.click()}>
                      <Upload className="h-3 w-3 mr-1" /> Upload JSON Key
                    </Button>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Upload your Google Cloud service account JSON key. Share your calendar and Drive folder with the service account email.
                    </p>
                  </div>
                )}
              </div>

              {/* Calendar ID */}
              <div>
                <Label className="text-xs text-muted-foreground">Google Calendar ID</Label>
                <Input value={googleCalId} onChange={(e) => set(setGoogleCalId)(e.target.value)} className="mt-1 bg-background font-mono text-sm" placeholder="primary" />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Calendar to match meetings from. Use "primary" or a specific calendar ID. Share the calendar with the service account email.
                </p>
              </div>

              {/* Drive Folder ID */}
              <div>
                <Label className="text-xs text-muted-foreground">Google Drive Folder ID</Label>
                <Input value={googleDriveFolderId} onChange={(e) => set(setGoogleDriveFolderId)(e.target.value)} className="mt-1 bg-background font-mono text-sm" placeholder="Folder ID for transcript docs" />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  ID from the Drive folder URL. Share the folder with the service account email. Leave empty to create docs in the service account's root.
                </p>
              </div>

              {/* Timezone */}
              <div>
                <Label className="text-xs text-muted-foreground">Timezone</Label>
                <select value={timezone} onChange={(e) => set(setTimezone)(e.target.value)} className={selectCls}>
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

              {/* Toggles */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Match Calendar Events</p>
                  <p className="text-xs text-muted-foreground">Parse date from filename and match to Google Calendar events to rename meetings</p>
                </div>
                <Switch checked={googleCalMatch} onCheckedChange={set(setGoogleCalMatch)} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Auto-sync Transcripts to Google Docs</p>
                  <p className="text-xs text-muted-foreground">Automatically create a Google Doc with the transcript when transcription completes</p>
                </div>
                <Switch checked={googleAutoSync} onCheckedChange={set(setGoogleAutoSync)} />
              </div>

              {/* Test Connection */}
              <Button size="sm" variant="outline" className="text-xs" disabled={googleStatus === "testing"} onClick={async () => {
                setGoogleStatus("testing");
                try {
                  const res = await fetch(`/api/google/test?calendarId=${encodeURIComponent(googleCalId || "primary")}`);
                  const data = await res.json();
                  if (res.ok && data.ok) {
                    setGoogleStatus("connected");
                    toast.success("Google connection successful");
                  } else {
                    setGoogleStatus("error");
                    toast.error(data.error || "Connection failed");
                  }
                } catch (err: any) {
                  setGoogleStatus("error");
                  toast.error(`Test failed: ${err.message}`);
                }
              }}>
                {googleStatus === "testing" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : googleStatus === "connected" ? <CheckCircle2 className="h-3 w-3 mr-1 text-success" /> : googleStatus === "error" ? <XCircle className="h-3 w-3 mr-1 text-destructive" /> : null}
                Test Google Connection
              </Button>
            </section>
          )}

          {/* ── Google Calendar Preview ── */}
          {activeSection === "google-calendar" && (
            <section className="space-y-4">
              <div className="rounded-md border border-border p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Calendar Events Preview</Label>
                  <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={async () => {
                    setCalendarLoading(true);
                    setCalendarEvents([]);
                    try {
                      const calId = googleCalId || "primary";
                      const today = new Date().toISOString().slice(0, 10);
                      const res = await fetch(`/api/google/calendar/events?calendarId=${encodeURIComponent(calId)}&date=${today}`);
                      const data = await res.json();
                      if (res.ok && data.events) {
                        setCalendarEvents(data.events);
                        if (data.events.length === 0) toast.info("No events found for today");
                      } else {
                        toast.error(data.error || "Failed to fetch events");
                      }
                    } catch (err: any) {
                      toast.error(`Failed: ${err.message}`);
                    } finally {
                      setCalendarLoading(false);
                    }
                  }}>
                    {calendarLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    Fetch Today's Events
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Shows events from your configured Google Calendar. Uses the same Calendar ID and Service Account from the Google settings section.
                </p>
              </div>

              {calendarEvents.length > 0 && (
                <div className="rounded-md border border-border overflow-hidden">
                  <div className="bg-secondary/30 px-3 py-2 text-xs font-medium text-muted-foreground border-b border-border">
                    {calendarEvents.length} event{calendarEvents.length !== 1 ? "s" : ""} found
                  </div>
                  <div className="divide-y divide-border">
                    {calendarEvents.map((evt: any, i: number) => (
                      <div key={i} className="px-3 py-2.5 flex items-start gap-3 hover:bg-secondary/20 transition-colors">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{evt.summary || "Untitled"}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] font-mono text-muted-foreground">
                              {evt.start ? new Date(evt.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                              {" → "}
                              {evt.end ? new Date(evt.end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                            </span>
                            {evt.attendees && evt.attendees.length > 0 && (
                              <span className="text-[10px] text-muted-foreground/60">{evt.attendees.length} attendees</span>
                            )}
                          </div>
                        </div>
                        {evt.htmlLink && (
                          <a href={evt.htmlLink} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-0.5">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!calendarLoading && calendarEvents.length === 0 && (
                <div className="rounded-md border border-dashed border-border p-6 text-center">
                  <p className="text-sm text-muted-foreground">Click "Fetch Today's Events" to preview your calendar</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">Make sure Google integration is configured in the Google settings section</p>
                </div>
              )}
            </section>
          )}


          {activeSection === "ai-routing" && <AIModelRoutingSection />}

          {/* ── AI Prompts ── */}
          {activeSection === "ai-prompts" && <AIPromptsSection />}

          {/* ── Processing ── */}
          {activeSection === "processing" && (
            <section className="space-y-4">
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
            </section>
          )}

          {/* ── Transcription Engine ── */}
          {activeSection === "transcription" && (
            <section className="space-y-4">
              <p className="text-xs text-muted-foreground">WhisperX configuration passed to Scriberr API</p>
               <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Model<InfoTip text="Whisper model size. 'large-v3' gives the best accuracy for most languages but needs ~6 GB VRAM. 'medium' is a solid compromise (~4 GB). 'small'/'base'/'tiny' are progressively faster but less accurate — useful for quick drafts or low-resource machines." /></Label>
                  <select value={whisperModel} onChange={(e) => set(setWhisperModel)(e.target.value)} className={selectCls}>
                    <option>large-v3</option><option>large-v2</option><option>medium</option><option>small</option><option>base</option><option>tiny</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Device<InfoTip text="'CUDA' runs on your NVIDIA GPU and is 5-10× faster than CPU. Choose 'CPU' only if no GPU is available — transcription will be significantly slower but still functional." /></Label>
                  <select value={whisperDevice} onChange={(e) => set(setWhisperDevice)(e.target.value)} className={selectCls}>
                    <option value="cuda">CUDA (GPU)</option><option value="cpu">CPU</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Batch Size<InfoTip text="Number of audio chunks processed in parallel. Higher values (16-24) speed up transcription but consume more VRAM. If you get out-of-memory (OOM) errors, reduce this first. Start with 8 on 8 GB GPUs, 16-24 on 12+ GB." /></Label>
                  <Input value={batchSize} onChange={(e) => set(setBatchSize)(Number(e.target.value))} className="mt-1 bg-background font-mono text-sm" type="number" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Compute Type<InfoTip text="Numerical precision for inference. 'float16' — best speed/quality balance on GPU (recommended). 'int8' — uses ~50% less VRAM with minor quality loss, good for constrained GPUs. 'float32' — maximum precision but 2× more VRAM, rarely needed." /></Label>
                  <select value={computeType} onChange={(e) => set(setComputeType)(e.target.value)} className={selectCls}>
                    <option value="float16">float16</option><option value="int8">int8</option><option value="float32">float32</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Beam Size<InfoTip text="Number of candidate sequences the decoder explores at each step. Higher values (5-10) improve accuracy for difficult audio (accents, noise) but increase processing time linearly. Default of 5 works well for most meetings." /></Label>
                  <Input value={beamSize} onChange={(e) => set(setBeamSize)(Number(e.target.value))} className="mt-1 bg-background font-mono text-sm" type="number" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Chunk Size<InfoTip text="Length of each audio segment in seconds sent to the model. 20-30s is typical. Shorter chunks (10-15s) can help with very noisy audio but may cut words at boundaries. Longer chunks (30s+) give more context but use more memory." /></Label>
                  <Input value={chunkSize} onChange={(e) => set(setChunkSize)(Number(e.target.value))} className="mt-1 bg-background font-mono text-sm" type="number" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">CPU Threads<InfoTip text="Number of CPU threads used for processing. Only relevant when Device is set to 'CPU'. Set to your physical core count for best results — going higher than that gives diminishing returns due to context switching." /></Label>
                  <Input value={threads} onChange={(e) => set(setThreads)(Number(e.target.value))} className="mt-1 bg-background font-mono text-sm" type="number" min={1} max={64} />
                </div>
              </div>
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Speaker Diarization<InfoTip text="Uses pyannote.audio to detect and label different speakers in the recording. Essential for multi-person meetings — without it, all text is attributed to a single speaker. Adds ~10-20% to processing time." /></p>
                    <p className="text-xs text-muted-foreground">Use pyannote for speaker separation</p>
                  </div>
                  <Switch checked={diarization} onCheckedChange={set(setDiarization)} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">VAD (Voice Activity Detection)<InfoTip text="Pre-filters silent segments before transcription using pyannote VAD. Reduces processing time by skipping silence and improves word-level timestamps. Recommended for recordings with long pauses or ambient noise." /></p>
                    <p className="text-xs text-muted-foreground">Use pyannote VAD for better segmentation</p>
                  </div>
                  <Switch checked={vad} onCheckedChange={set(setVad)} />
                </div>
              </div>
            </section>
          )}

          {/* ── Storage & Volumes ── */}
          {activeSection === "storage" && (
            <section className="space-y-5">
              <div className="flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Docker Volume</span>
                <Button variant="ghost" size="sm" className="ml-auto gap-1.5 text-xs" onClick={fetchStorageInfo} disabled={storageLoading}>
                  {storageLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Refresh
                </Button>
              </div>

              {storageInfo ? (
                <>
                  {/* Volume path & stats */}
                  <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">Mount Path</p>
                        <p className="text-sm font-mono text-foreground">{storageInfo.dataDir}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Total Size</p>
                        <p className="text-sm font-mono text-foreground">
                          {storageInfo.totalSize > 1024 * 1024
                            ? `${(storageInfo.totalSize / (1024 * 1024)).toFixed(1)} MB`
                            : `${(storageInfo.totalSize / 1024).toFixed(1)} KB`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{storageInfo.fileCount} file{storageInfo.fileCount !== 1 ? "s" : ""}</span>
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-success" />
                        Volume mounted
                      </span>
                    </div>
                  </div>

                  {/* File listing */}
                  <div className="rounded-lg border border-border bg-card overflow-hidden">
                    <div className="px-4 py-2 border-b border-border bg-secondary/30">
                      <p className="text-xs font-medium text-muted-foreground">Files in Volume</p>
                    </div>
                    <div className="max-h-64 overflow-y-auto divide-y divide-border">
                      {storageInfo.files.map((f) => (
                        <div key={f.path} className="flex items-center gap-3 px-4 py-2 text-xs">
                          <File className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="font-mono text-foreground truncate flex-1">{f.path}</span>
                          <span className="text-muted-foreground shrink-0">
                            {f.size > 1024 * 1024
                              ? `${(f.size / (1024 * 1024)).toFixed(1)} MB`
                              : `${(f.size / 1024).toFixed(1)} KB`}
                          </span>
                        </div>
                      ))}
                      {storageInfo.files.length === 0 && (
                        <p className="px-4 py-6 text-center text-xs text-muted-foreground">No files in volume yet</p>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-lg border border-border bg-card p-6 text-center">
                  <HardDrive className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {storageLoading ? "Loading storage info..." : "Server offline — cannot read volume info"}
                  </p>
                </div>
              )}

              {/* Configuration guide */}
              <div className="rounded-md bg-secondary/30 px-4 py-3 space-y-2">
                <p className="text-xs font-medium text-foreground">Configuring the Volume</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  The data volume is configured in <code className="font-mono bg-secondary px-1 rounded">docker-compose.yml</code>. 
                  To use a custom host path for easy backup access:
                </p>
                <pre className="text-[11px] font-mono bg-background/80 rounded p-2.5 overflow-x-auto text-muted-foreground leading-relaxed">
{`# docker-compose.yml
volumes:
  meetscribe_data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /path/to/your/backup/folder`}
                </pre>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Or use a simple bind mount instead of a named volume:
                </p>
                <pre className="text-[11px] font-mono bg-background/80 rounded p-2.5 overflow-x-auto text-muted-foreground leading-relaxed">
{`# In the api service:
volumes:
  - ./my-data:/data  # Maps to host folder`}
                </pre>
                <p className="text-[11px] text-muted-foreground">
                  After changing the volume, run <code className="font-mono bg-secondary px-1 rounded">docker compose down && docker compose up -d</code> to apply.
                  Your SQLite database and all files will be accessible directly from the host filesystem for backup tools like <code className="font-mono bg-secondary px-1 rounded">rsync</code>, <code className="font-mono bg-secondary px-1 rounded">restic</code>, or cron scripts.
                </p>
              </div>
            </section>
          )}

          {/* ── Auto-Tags ── */}
          {activeSection === "auto-tags" && <AutoTagRulesSection />}

          {/* ── Folder Watcher ── */}
          {activeSection === "folder-watch" && <FolderWatchSection />}

          {/* ── Excel Import ── */}
          {activeSection === "excel-import" && <ExcelImportSection />}

          {/* ── Local Storage & Sync ── */}
          {activeSection === "sync" && <OfflineSyncSection />}

          {/* ── Data & Backup ── */}
          {activeSection === "backup" && (
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                {serverInfo && (
                  <div className="flex items-center gap-2">
                    <Server className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className={cn("text-[11px] font-mono", serverInfo.available ? "text-success" : "text-muted-foreground")}>
                      {serverInfo.available ? "Server connected" : "Server offline — localStorage only"}
                    </span>
                    {serverInfo.available && serverInfo.dbSize && (
                      <span className="text-[10px] font-mono text-muted-foreground">({(serverInfo.dbSize / 1024).toFixed(0)} KB)</span>
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
                <Button variant="outline" size="sm" className="gap-2" disabled={isBackingUp} onClick={async () => {
                  setIsBackingUp(true);
                  try {
                    await downloadBackup();
                    toast.success(serverInfo?.available ? "Backup downloaded (ZIP with separate files)" : "Backup downloaded (JSON)");
                  } catch (e: any) { toast.error(e.message || "Backup failed"); }
                  finally { setIsBackingUp(false); }
                }}>
                  {isBackingUp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  Download Backup
                </Button>
                <div className="relative">
                  <Button variant="outline" size="sm" className="gap-2" disabled={isRestoring} onClick={() => document.getElementById("restore-input")?.click()}>
                    {isRestoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    Restore from Backup
                  </Button>
                  <input id="restore-input" type="file" accept=".zip,.json" className="hidden" onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setIsRestoring(true);
                    try {
                      const result = await uploadRestore(file);
                      toast.success(`Restored ${result.restoredKeys} data entries. Reloading...`);
                      setTimeout(() => window.location.reload(), 1000);
                    } catch (err: any) { toast.error(err.message || "Restore failed"); }
                    finally { setIsRestoring(false); e.target.value = ""; }
                  }} />
                </div>
              </div>
              <div className="rounded-md bg-secondary/30 px-3 py-2 mt-2">
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  <strong className="text-foreground">Migration guide:</strong> To move data to a new server, download a backup → deploy new instance → restore from backup.
                  {serverInfo?.available && " The backup ZIP contains individual meeting, transcript, and override files plus a raw SQLite DB copy."}
                </p>
              </div>

              <div className="pt-4 border-t border-border">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10">
                      <Trash2 className="h-3.5 w-3.5" />
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
                      <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => {
                        // Clear localStorage
                        const keys = Object.keys(localStorage).filter((k) => k.startsWith("meetscribe_"));
                        keys.forEach((k) => localStorage.removeItem(k));
                        // Clear server SQLite database
                        try {
                          await fetch("/api/store", { method: "DELETE" });
                        } catch (e) {
                          console.warn("Could not clear server store:", e);
                        }
                        toast.success("Cleared all data, including imported meetings.");
                        setTimeout(() => window.location.reload(), 500);
                      }}>
                        Delete Everything
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </section>
          )}

          {/* ── Activity Log ── */}
          {activeSection === "activity" && (
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Search activity..." className="pl-9 bg-card" value={activitySearch} onChange={(e) => setActivitySearch(e.target.value)} />
                </div>
                <div className="flex items-center gap-1">
                  {activityFilters.map((f) => (
                    <button key={f.value} onClick={() => setActivityFilter(f.value)} className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                      activityFilter === f.value ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                    )}>
                      {f.label}
                    </button>
                  ))}
                </div>
                {allActivity.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => { saveSetting("activity_log", []); window.location.reload(); }} className="text-xs text-muted-foreground gap-1">
                    <Trash2 className="h-3 w-3" /> Clear
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
            </section>
          )}

          {/* ── Appearance ── */}
          {activeSection === "appearance" && (
            <section className="space-y-6">
              <div>
                <p className="text-sm font-medium mb-3">Theme</p>
                <p className="text-xs text-muted-foreground mb-4">Choose your preferred color scheme. Changes apply immediately.</p>
                <div className="grid grid-cols-3 gap-3">
                  {([
                    { value: "dark", label: "Dark", icon: Moon, desc: "Easy on the eyes" },
                    { value: "light", label: "Light", icon: Sun, desc: "Classic bright mode" },
                    { value: "system", label: "System", icon: Monitor, desc: "Match OS setting" },
                  ] as const).map((theme) => {
                    const currentTheme = loadSetting("theme", "dark");
                    const isActive = currentTheme === theme.value;
                    return (
                      <button
                        key={theme.value}
                        onClick={() => {
                          saveSetting("theme", theme.value);
                          // Apply theme immediately
                          const root = document.documentElement;
                          if (theme.value === "system") {
                            const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
                            root.classList.toggle("dark", prefersDark);
                          } else {
                            root.classList.toggle("dark", theme.value === "dark");
                          }
                          toast.success(`Theme set to ${theme.label}`);
                        }}
                        className={cn(
                          "flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all",
                          isActive
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-muted-foreground/30 hover:bg-secondary/30"
                        )}
                      >
                        <theme.icon className={cn("h-5 w-5", isActive ? "text-primary" : "text-muted-foreground")} />
                        <span className={cn("text-sm font-medium", isActive ? "text-primary" : "text-foreground")}>{theme.label}</span>
                        <span className="text-[10px] text-muted-foreground">{theme.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          )}
      </div>
      {/* App version footer */}
      <div className="mt-6 pt-4 border-t border-border text-center">
        <p className="text-[10px] text-muted-foreground font-mono">
          Meeting Transcriber v{APP_VERSION} • Built with Scriberr
        </p>
      </div>
    </div>
  );
}
