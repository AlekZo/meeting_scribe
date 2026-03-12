import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Brain, Eye, FileText, Sparkles, Cpu, EyeOff, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  getModelCatalog,
  TASK_DEFAULTS,
  AITask,
  getModelForTask,
  saveModelForTask,
  getOpenRouterKey,
  saveOpenRouterKey,
  syncModelCatalog,
  getCatalogSyncedAt,
} from "@/lib/openrouter";

const TASKS: { task: AITask; label: string; description: string; icon: React.ReactNode }[] = [
  { task: "summarization", label: "Summarization & Action Items", description: "Long transcripts → summaries. Default: Hunter Alpha (free, 1M ctx)", icon: <FileText className="h-3.5 w-3.5 text-primary" /> },
  { task: "cleaning", label: "Cleaning & Speaker ID", description: "Fast formatting & speaker tagging. Default: Llama 3.3 70B", icon: <Sparkles className="h-3.5 w-3.5 text-success" /> },
  { task: "embedding", label: "Search & Embeddings", description: "Semantic retrieval. Default: Qwen3 Embedding 8B", icon: <Cpu className="h-3.5 w-3.5 text-info" /> },
  { task: "vision", label: "Vision & File Parsing", description: "Screen/doc capture. Default: Qwen3 VL 235B", icon: <Eye className="h-3.5 w-3.5 text-warning" /> },
  { task: "default", label: "Default / Fallback", description: "Used when no task-specific model is set", icon: <Brain className="h-3.5 w-3.5 text-muted-foreground" /> },
];

export default function AIModelRoutingSection() {
  const [apiKey, setApiKey] = useState(() => getOpenRouterKey());
  const [showKey, setShowKey] = useState(false);
  const [assignments, setAssignments] = useState<Record<string, string>>(() =>
    Object.fromEntries(TASKS.map((t) => [t.task, getModelForTask(t.task)]))
  );
  const [catalog, setCatalog] = useState(() => getModelCatalog());
  const [syncing, setSyncing] = useState(false);
  const [syncedAt, setSyncedAt] = useState(() => getCatalogSyncedAt());

  const handleKeyChange = (val: string) => {
    setApiKey(val);
    saveOpenRouterKey(val);
  };

  const handleModelChange = (task: AITask, modelId: string) => {
    setAssignments((prev) => ({ ...prev, [task]: modelId }));
    saveModelForTask(task, modelId);
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await syncModelCatalog();
      setCatalog(getModelCatalog());
      setSyncedAt(result.timestamp);
      toast.success(`Synced ${result.count} models from OpenRouter`);
    } catch (e: any) {
      toast.error(e.message || "Failed to sync models");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <section className="space-y-5 rounded-lg border border-border bg-card p-6">
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-warning" />
            <h2 className="text-base font-medium">AI Model Routing</h2>
          </div>
          <div className="flex items-center gap-2">
            {syncedAt && (
              <span className="text-[10px] text-muted-foreground font-mono">
                {catalog.length} models · synced {new Date(syncedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={handleSync}
              disabled={syncing}
            >
              <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
              Sync Models & Prices
            </Button>
          </div>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Assign specific OpenRouter models to pipeline tasks for optimal cost & quality
        </p>
      </div>

      {/* API Key */}
      <div>
        <Label className="text-xs text-muted-foreground">OpenRouter API Key</Label>
        <div className="relative mt-1">
          <Input
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => handleKeyChange(e.target.value)}
            className="bg-background font-mono text-sm pr-9"
            placeholder="sk-or-v1-••••"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Get your key from{" "}
          <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="text-primary hover:underline">
            openrouter.ai/keys
          </a>
        </p>
      </div>

      {/* Task-based selectors */}
      <div className="space-y-3">
        {TASKS.map(({ task, label, description, icon }) => {
          const selectedModel = catalog.find((m) => m.id === assignments[task]);
          return (
            <div key={task} className="flex items-start gap-3 rounded-md border border-border bg-background p-3">
              <div className="mt-0.5 shrink-0">{icon}</div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <p className="text-xs font-medium leading-tight">{label}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">{description}</p>
                <select
                  value={assignments[task]}
                  onChange={(e) => handleModelChange(task, e.target.value)}
                  className="w-full h-8 rounded-md border border-input bg-card px-2 text-[11px] font-mono focus:ring-1 focus:ring-ring outline-none"
                >
                  {catalog.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} {m.costIn > 0 ? `($${m.costIn}/$${m.costOut})` : "(Free)"} · {(m.context / 1000).toFixed(0)}K ctx
                    </option>
                  ))}
                </select>
                {selectedModel && (
                  <p className="text-[10px] text-muted-foreground font-mono">
                    In: ${selectedModel.costIn}/M · Out: ${selectedModel.costOut}/M · Context: {selectedModel.context.toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
