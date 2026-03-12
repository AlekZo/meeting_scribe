import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Sparkles, RotateCcw } from "lucide-react";
import { loadSetting, saveSetting } from "@/lib/storage";

const DEFAULT_PROMPTS = {
  speakerIdentification: `You are analyzing a meeting transcript. Identify speakers by their names using context clues such as:
- Self-introductions ("Hi, I'm John")
- Others addressing them ("Thanks, Sarah")
- Role references ("As the project manager...")
- Email signatures or mentions

Return a JSON mapping of speaker labels (SPEAKER_00, SPEAKER_01...) to identified names. If you cannot identify a speaker, keep the original label.`,

  meetingSummary: `Summarize the following meeting transcript. Include:
1. **Key Topics** discussed
2. **Decisions** made
3. **Action Items** with assigned owners (if identifiable)
4. **Follow-ups** needed

Keep the summary concise but comprehensive. Use bullet points.`,

  transcriptCleaning: `Clean the following raw transcript:
- Fix obvious speech-to-text errors
- Add proper punctuation and capitalization
- Remove filler words (um, uh, like) unless they convey meaning
- Preserve the original speaker labels
- Do NOT change the meaning or add content

Return the cleaned transcript in the same segment format.`,

  titleGeneration: `Generate a concise, descriptive meeting title (max 8 words) based on this transcript. 
The title should capture the main topic or purpose of the meeting.
Return only the title text, nothing else.`,
};

type PromptKey = keyof typeof DEFAULT_PROMPTS;

const PROMPT_LABELS: Record<PromptKey, { label: string; description: string }> = {
  speakerIdentification: {
    label: "Speaker Identification",
    description: "Prompt sent to AI to map speaker labels to real names",
  },
  meetingSummary: {
    label: "Meeting Summary",
    description: "Generates a structured summary of the transcript",
  },
  transcriptCleaning: {
    label: "Transcript Cleaning",
    description: "Cleans up raw speech-to-text output",
  },
  titleGeneration: {
    label: "Title Generation",
    description: "Auto-generates a meeting title from transcript content",
  },
};

export default function AIPromptsSection() {
  const [prompts, setPrompts] = useState<Record<PromptKey, string>>(DEFAULT_PROMPTS);
  const [expandedPrompt, setExpandedPrompt] = useState<PromptKey | null>(null);

  useEffect(() => {
    const saved = loadSetting<Record<string, string>>("ai_prompts", {});
    setPrompts({ ...DEFAULT_PROMPTS, ...saved });
  }, []);

  const updatePrompt = (key: PromptKey, value: string) => {
    const updated = { ...prompts, [key]: value };
    setPrompts(updated);
    saveSetting("ai_prompts", updated);
  };

  const resetPrompt = (key: PromptKey) => {
    updatePrompt(key, DEFAULT_PROMPTS[key]);
  };

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-6">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="text-base font-medium">AI Prompts</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Customize the system prompts sent to OpenRouter for each AI task. Changes are saved locally.
      </p>
      <div className="space-y-3">
        {(Object.keys(PROMPT_LABELS) as PromptKey[]).map((key) => {
          const { label, description } = PROMPT_LABELS[key];
          const isExpanded = expandedPrompt === key;
          const isModified = prompts[key] !== DEFAULT_PROMPTS[key];
          return (
            <div key={key} className="rounded-md border border-border bg-background">
              <button
                onClick={() => setExpandedPrompt(isExpanded ? null : key)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <div>
                  <p className="text-sm font-medium flex items-center gap-2">
                    {label}
                    {isModified && (
                      <span className="text-[10px] font-normal text-warning bg-warning/10 px-1.5 py-0.5 rounded">
                        modified
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
                <span className="text-xs text-muted-foreground">{isExpanded ? "▲" : "▼"}</span>
              </button>
              {isExpanded && (
                <div className="border-t border-border px-4 py-3 space-y-2">
                  <Textarea
                    value={prompts[key]}
                    onChange={(e) => updatePrompt(key, e.target.value)}
                    className="min-h-[160px] bg-card font-mono text-xs leading-relaxed"
                  />
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => resetPrompt(key)}
                      className="gap-1.5 text-xs text-muted-foreground"
                      disabled={!isModified}
                    >
                      <RotateCcw className="h-3 w-3" />
                      Reset to default
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
