import { useState } from "react";
import { TagRule } from "@/data/meetings";
import { loadSetting, saveSetting } from "@/lib/storage";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X, Tag, Layers, HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function KeywordInput({ keywords, onChange, placeholder }: { keywords: string[]; onChange: (kw: string[]) => void; placeholder?: string }) {
  const [input, setInput] = useState("");

  const addKeyword = (value: string) => {
    const kw = value.trim().toLowerCase();
    if (kw && !keywords.includes(kw)) {
      onChange([...keywords, kw]);
    }
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addKeyword(input);
    }
    if (e.key === "Backspace" && !input && keywords.length > 0) {
      onChange(keywords.slice(0, -1));
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 min-h-[36px]">
      {keywords.map((kw) => (
        <span
          key={kw}
          className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-mono text-primary"
        >
          {kw}
          <button onClick={() => onChange(keywords.filter((k) => k !== kw))} className="hover:text-destructive">
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => input && addKeyword(input)}
        placeholder={keywords.length === 0 ? (placeholder ?? "Type keyword + Enter") : ""}
        className="flex-1 min-w-[80px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}

interface RuleEditorProps {
  title: string;
  icon: React.ReactNode;
  storageKey: string;
  description: string;
  hint: string;
  examples: { name: string; keywords: string[] }[];
  namePlaceholder: string;
  keywordPlaceholder: string;
}

function RuleEditor({ title, icon, storageKey, description, hint, examples, namePlaceholder, keywordPlaceholder }: RuleEditorProps) {
  const [rules, setRules] = useState<TagRule[]>(() => loadSetting<TagRule[]>(storageKey, []));
  const [newName, setNewName] = useState("");

  const save = (updated: TagRule[]) => {
    setRules(updated);
    saveSetting(storageKey, updated);
  };

  const addRule = () => {
    const name = newName.trim();
    if (!name || rules.some((r) => r.name.toLowerCase() === name.toLowerCase())) return;
    save([...rules, { name, keywords: [] }]);
    setNewName("");
  };

  const removeRule = (name: string) => {
    save(rules.filter((r) => r.name !== name));
  };

  const updateKeywords = (name: string, keywords: string[]) => {
    save(rules.map((r) => (r.name === name ? { ...r, keywords } : r)));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-medium">{title}</h3>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs p-3 space-y-2">
              <p className="text-xs">{hint}</p>
              <div className="space-y-1.5 pt-1 border-t border-border">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Examples</p>
                {examples.map((ex) => (
                  <div key={ex.name} className="text-[11px]">
                    <span className="font-medium">{ex.name}:</span>{" "}
                    <span className="font-mono text-muted-foreground">
                      {ex.keywords.map((k) => `[${k}]`).join(" ")}
                    </span>
                  </div>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>

      {rules.length > 0 && (
        <div className="space-y-2">
          {rules.map((rule) => (
            <div key={rule.name} className="rounded-md border border-border bg-background p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-card-foreground">{rule.name}</span>
                <button onClick={() => removeRule(rule.name)} className="text-muted-foreground hover:text-destructive transition-colors">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <KeywordInput
                keywords={rule.keywords}
                onChange={(kw) => updateKeywords(rule.name, kw)}
                placeholder={keywordPlaceholder}
              />
            </div>
          ))}
        </div>
      )}

      {rules.length === 0 && (
        <div className="rounded-md border border-dashed border-border bg-secondary/30 px-4 py-3">
          <p className="text-[11px] text-muted-foreground">
            No rules yet. Add one below — e.g.{" "}
            <span className="font-mono text-foreground">"{examples[0]?.name}"</span> with keywords{" "}
            <span className="font-mono text-foreground">
              {examples[0]?.keywords.slice(0, 3).map((k) => `"${k}"`).join(", ")}
            </span>
          </p>
        </div>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); addRule(); }}
        className="flex items-center gap-2"
      >
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={namePlaceholder}
          className="h-8 text-sm bg-background flex-1"
        />
        <Button type="submit" variant="outline" size="sm" className="gap-1 text-xs" disabled={!newName.trim()}>
          <Plus className="h-3 w-3" />
          Add
        </Button>
      </form>
    </div>
  );
}

export default function AutoTagRulesSection() {
  return (
    <section className="space-y-6 rounded-lg border border-border bg-card p-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-medium">Auto-Tagging Rules</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Define keyword rules to automatically categorize and type meetings based on transcript content.
            Uses word-boundary matching to avoid false positives.
          </p>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help shrink-0 mt-0.5" />
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-sm p-3 space-y-2">
              <p className="text-xs font-medium">How it works</p>
              <ul className="text-[11px] text-muted-foreground space-y-1 list-disc pl-3">
                <li>After transcription, the full transcript is scanned against your keyword rules</li>
                <li>Uses <span className="font-mono">\\b</span> word boundaries — "IT" won't match inside "situation"</li>
                <li><strong>Meeting Type:</strong> one type assigned (highest keyword match count wins)</li>
                <li><strong>Categories:</strong> all matching categories are applied (multi-tag)</li>
                <li>You can always manually override results on the meeting detail page</li>
              </ul>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <RuleEditor
          title="Meeting Type Rules"
          icon={<Layers className="h-4 w-4 text-info" />}
          storageKey="type_rules"
          description="Assign a single type per meeting (highest keyword match wins)"
          hint="Define meeting types like Standup, Retro, or Workshop. The type with the most keyword hits in the transcript wins."
          namePlaceholder="e.g. Standup, Workshop, Interview..."
          keywordPlaceholder="e.g. standup, yesterday, blocker"
          examples={[
            { name: "Standup", keywords: ["standup", "yesterday", "blocker", "today"] },
            { name: "Interview", keywords: ["candidate", "resume", "hiring", "offer"] },
            { name: "Retro", keywords: ["retro", "went well", "improve", "action item"] },
          ]}
        />
        <RuleEditor
          title="Category Rules"
          icon={<Tag className="h-4 w-4 text-primary" />}
          storageKey="category_rules"
          description="Multiple categories can be applied per meeting"
          hint="Define categories like Finance, Engineering, or HR. All matching categories will be applied — a meeting can belong to multiple categories."
          namePlaceholder="e.g. Finance, Engineering, HR..."
          keywordPlaceholder="e.g. budget, invoice, stripe"
          examples={[
            { name: "Finance", keywords: ["budget", "q3 earnings", "stripe", "invoice"] },
            { name: "Engineering", keywords: ["docker", "deploy", "api", "sprint"] },
            { name: "HR", keywords: ["onboarding", "performance review", "pto"] },
          ]}
        />
      </div>
    </section>
  );
}
