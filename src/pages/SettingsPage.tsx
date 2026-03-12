import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Save, ExternalLink, MessageCircle, Loader2, CheckCircle2, XCircle, Cpu, Brain } from "lucide-react";
import { cn } from "@/lib/utils";
import { loadSetting, saveSetting } from "@/lib/storage";
import AIPromptsSection from "@/components/settings/AIPromptsSection";
import OfflineSyncSection from "@/components/settings/OfflineSyncSection";
import FolderWatchSection from "@/components/settings/FolderWatchSection";

type ConnectionStatus = "untested" | "testing" | "connected" | "error";

export default function SettingsPage() {
  const [scriberrUrl, setScriberrUrl] = useState("http://localhost:8080");
  const [apiKey, setApiKey] = useState("");
  const [autoTranscribe, setAutoTranscribe] = useState(true);
  const [speakerDetection, setSpeakerDetection] = useState(false);
  const [tgBotToken, setTgBotToken] = useState("");
  const [tgChatId, setTgChatId] = useState("");
  const [tgEnabled, setTgEnabled] = useState(false);
  const [openRouterKey, setOpenRouterKey] = useState("");
  const [openRouterModel, setOpenRouterModel] = useState("openai/gpt-4o-mini");

  const [scriberrStatus, setScriberrStatus] = useState<ConnectionStatus>("untested");
  const [tgStatus, setTgStatus] = useState<ConnectionStatus>("untested");

  const testScriberr = async () => {
    setScriberrStatus("testing");
    // Simulated test
    setTimeout(() => setScriberrStatus(scriberrUrl ? "connected" : "error"), 1500);
  };

  const testTelegram = async () => {
    setTgStatus("testing");
    setTimeout(() => setTgStatus(tgBotToken ? "connected" : "error"), 1500);
  };

  const StatusBadge = ({ status }: { status: ConnectionStatus }) => {
    if (status === "untested") return null;
    if (status === "testing") return <Loader2 className="h-3.5 w-3.5 text-info animate-spin" />;
    if (status === "connected") return <CheckCircle2 className="h-3.5 w-3.5 text-success" />;
    return <XCircle className="h-3.5 w-3.5 text-destructive" />;
  };

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure integrations and preferences
        </p>
      </div>

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
            <Label className="text-xs text-muted-foreground">Base URL</Label>
            <Input value={scriberrUrl} onChange={(e) => setScriberrUrl(e.target.value)} className="mt-1 bg-background font-mono text-sm" placeholder="http://localhost:8080" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">API Key</Label>
            <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="mt-1 bg-background font-mono text-sm" placeholder="Enter API key" />
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
          <Switch checked={tgEnabled} onCheckedChange={setTgEnabled} />
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
                onChange={(e) => setTgBotToken(e.target.value)}
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
                onChange={(e) => setTgChatId(e.target.value)}
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

      {/* OpenRouter / AI */}
      <section className="space-y-4 rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-warning" />
          <h2 className="text-base font-medium">AI Speaker Identification</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Uses OpenRouter to analyze transcripts and identify speakers by name from context clues
        </p>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">OpenRouter API Key</Label>
            <Input
              type="password"
              value={openRouterKey}
              onChange={(e) => setOpenRouterKey(e.target.value)}
              className="mt-1 bg-background font-mono text-sm"
              placeholder="sk-or-..."
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Model</Label>
            <select
              value={openRouterModel}
              onChange={(e) => setOpenRouterModel(e.target.value)}
              className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm font-mono focus:ring-1 focus:ring-ring outline-none"
            >
              <option value="openai/gpt-4o-mini">GPT-4o Mini (fast, cheap)</option>
              <option value="openai/gpt-4o">GPT-4o (best quality)</option>
              <option value="anthropic/claude-3.5-sonnet">Claude 3.5 Sonnet</option>
              <option value="google/gemini-pro-1.5">Gemini Pro 1.5</option>
            </select>
          </div>
        </div>
      </section>

      {/* Processing */}
      <section className="space-y-4 rounded-lg border border-border bg-card p-6">
        <h2 className="text-base font-medium">Processing</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Auto-transcribe on upload</p>
              <p className="text-xs text-muted-foreground">Automatically start transcription when files are uploaded</p>
            </div>
            <Switch checked={autoTranscribe} onCheckedChange={setAutoTranscribe} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">AI Speaker Detection</p>
              <p className="text-xs text-muted-foreground">Use OpenRouter to identify and label speakers after transcription</p>
            </div>
            <Switch checked={speakerDetection} onCheckedChange={setSpeakerDetection} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Auto-retry on GPU OOM</p>
              <p className="text-xs text-muted-foreground">Automatically retry on CPU if GPU runs out of memory</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Publish to Google Sheets</p>
              <p className="text-xs text-muted-foreground">Automatically log completed meetings to Google Sheets</p>
            </div>
            <Switch defaultChecked />
          </div>
        </div>
      </section>

      {/* Google */}
      <section className="space-y-4 rounded-lg border border-border bg-card p-6">
        <h2 className="text-base font-medium">Google Integration</h2>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Google Calendar ID</Label>
            <Input className="mt-1 bg-background font-mono text-sm" placeholder="primary" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Google Sheets ID</Label>
            <Input className="mt-1 bg-background font-mono text-sm" placeholder="Spreadsheet ID for meeting logs" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Meeting Logs Tab</Label>
            <Input className="mt-1 bg-background font-mono text-sm" placeholder="Meeting_Logs" defaultValue="Meeting_Logs" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Timezone Offset (hours from UTC)</Label>
            <Input className="mt-1 bg-background font-mono text-sm w-24" placeholder="0" defaultValue="0" type="number" />
          </div>
        </div>
      </section>

      {/* AI Prompts */}
      <AIPromptsSection />

      {/* Local Storage & Sync */}
      <OfflineSyncSection />

      {/* Folder Watcher */}
      <FolderWatchSection />

      {/* Whisper Config */}
      <section className="space-y-4 rounded-lg border border-border bg-card p-6">
        <h2 className="text-base font-medium">Transcription Engine</h2>
        <p className="text-xs text-muted-foreground">WhisperX configuration passed to Scriberr API</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Model</Label>
            <select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm font-mono focus:ring-1 focus:ring-ring outline-none">
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
            <select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm font-mono focus:ring-1 focus:ring-ring outline-none">
              <option value="cuda">CUDA (GPU)</option>
              <option value="cpu">CPU</option>
            </select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Batch Size</Label>
            <Input className="mt-1 bg-background font-mono text-sm" type="number" defaultValue="4" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Compute Type</Label>
            <select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm font-mono focus:ring-1 focus:ring-ring outline-none">
              <option value="float16">float16</option>
              <option value="int8">int8</option>
              <option value="float32">float32</option>
            </select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Beam Size</Label>
            <Input className="mt-1 bg-background font-mono text-sm" type="number" defaultValue="5" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Chunk Size</Label>
            <Input className="mt-1 bg-background font-mono text-sm" type="number" defaultValue="20" />
          </div>
        </div>
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Speaker Diarization</p>
              <p className="text-xs text-muted-foreground">Use pyannote for speaker separation</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">VAD (Voice Activity Detection)</p>
              <p className="text-xs text-muted-foreground">Use pyannote VAD for better segmentation</p>
            </div>
            <Switch defaultChecked />
          </div>
        </div>
      </section>

      <Button className="gap-2">
        <Save className="h-4 w-4" />
        Save Settings
      </Button>
    </div>
  );
}
