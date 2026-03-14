import { useState, useRef, useEffect } from "react";
import { MEETING_CATEGORIES, MeetingCategory } from "@/data/meetings";
import { Tag, ChevronDown, X, Plus, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

interface MeetingMetaMenuProps {
  category: MeetingCategory | undefined;
  tags: string[];
  onCategoryChange: (category: MeetingCategory | undefined) => void;
  onTagsChange: (tags: string[]) => void;
  meetingType?: string;
  autoCategories?: string[];
  onMeetingTypeChange?: (type: string | undefined) => void;
  onAutoCategoriesChange?: (categories: string[]) => void;
}

export function MeetingMetaMenu({
  category, tags, onCategoryChange, onTagsChange,
  meetingType, autoCategories = [], onMeetingTypeChange, onAutoCategoriesChange,
}: MeetingMetaMenuProps) {
  const [catOpen, setCatOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [showTagInput, setShowTagInput] = useState(false);
  const [autoCatPopover, setAutoCatPopover] = useState(false);
  const catRef = useRef<HTMLDivElement>(null);
  const autoCatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (catRef.current && !catRef.current.contains(e.target as Node)) setCatOpen(false);
      if (autoCatRef.current && !autoCatRef.current.contains(e.target as Node)) setAutoCatPopover(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) onTagsChange([...tags, t]);
    setTagInput("");
    setShowTagInput(false);
  };

  const removeTag = (tag: string) => onTagsChange(tags.filter((t) => t !== tag));

  const removeAutoCategory = (cat: string) => {
    onAutoCategoriesChange?.(autoCategories.filter((c) => c !== cat));
  };

  const [addCatInput, setAddCatInput] = useState("");
  const addAutoCategory = () => {
    const c = addCatInput.trim();
    if (c && !autoCategories.includes(c)) {
      onAutoCategoriesChange?.([...autoCategories, c]);
    }
    setAddCatInput("");
    setAutoCatPopover(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-5 py-3">
      {/* Meeting Type */}
      {meetingType ? (
        <div className="flex items-center gap-1.5">
          <span className="rounded bg-info/15 px-2 py-1 text-[11px] font-medium text-info border border-info/20 flex items-center gap-1.5">
            <Layers className="h-3 w-3" />
            {meetingType}
            <button onClick={() => onMeetingTypeChange?.(undefined)} className="hover:text-destructive">
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        </div>
      ) : (
        <button
          onClick={() => onMeetingTypeChange?.("Uncategorized")}
          className="flex items-center gap-1 rounded border border-dashed border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <Layers className="h-3 w-3" />
          Set type
        </button>
      )}

      <div className="h-4 w-px bg-border" />

      {/* Auto Categories */}
      <div ref={autoCatRef} className="relative flex flex-wrap items-center gap-1.5">
        {autoCategories.map((cat) => (
          <span
            key={cat}
            className="flex items-center gap-1 rounded-full border border-primary/20 px-2 py-0.5 text-[10px] font-medium text-primary/80"
          >
            {cat}
            <button onClick={() => removeAutoCategory(cat)} className="hover:text-destructive">
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
        <button
          onClick={() => setAutoCatPopover(!autoCatPopover)}
          className="flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <Plus className="h-2.5 w-2.5" />
          Category
        </button>
        {autoCatPopover && (
          <div className="absolute top-full left-0 z-30 mt-1 w-44 rounded-md border border-border bg-card shadow-lg p-2">
            <form onSubmit={(e) => { e.preventDefault(); addAutoCategory(); }}>
              <Input
                value={addCatInput}
                onChange={(e) => setAddCatInput(e.target.value)}
                className="h-7 text-xs bg-background"
                placeholder="Category name..."
                autoFocus
              />
            </form>
          </div>
        )}
      </div>

      <div className="h-4 w-px bg-border" />

      {/* Manual Category dropdown */}
      <div ref={catRef} className="relative">
        <button
          onClick={() => setCatOpen(!catOpen)}
          className={cn(
            "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
            category
              ? "border-primary/30 bg-primary/5 text-primary"
              : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
          )}
        >
          <Tag className="h-3 w-3" />
          {category || "Category"}
          <ChevronDown className={cn("h-3 w-3 transition-transform", catOpen && "rotate-180")} />
        </button>
        {catOpen && (
          <div className="absolute top-full left-0 z-30 mt-1 w-44 rounded-md border border-border bg-card shadow-lg py-1">
            {category && (
              <button
                onClick={() => { onCategoryChange(undefined); setCatOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-destructive hover:bg-secondary transition-colors"
              >
                <X className="h-3 w-3" />
                Clear
              </button>
            )}
            {MEETING_CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => { onCategoryChange(cat); setCatOpen(false); }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-secondary",
                  category === cat ? "text-primary font-medium" : "text-foreground"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="h-4 w-px bg-border" />

      {/* Tags */}
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-mono text-secondary-foreground"
          >
            #{tag}
            <button onClick={() => removeTag(tag)} className="text-muted-foreground hover:text-destructive">
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
        {showTagInput ? (
          <form onSubmit={(e) => { e.preventDefault(); addTag(); }} className="flex items-center">
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              className="h-6 w-24 text-[10px] font-mono bg-background px-2 py-0"
              placeholder="tag name"
              autoFocus
              onBlur={addTag}
            />
          </form>
        ) : (
          <button
            onClick={() => setShowTagInput(true)}
            className="flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <Plus className="h-2.5 w-2.5" />
            Add tag
          </button>
        )}
      </div>
    </div>
  );
}
