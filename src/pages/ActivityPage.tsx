import { ActivityLog, sampleActivity } from "@/components/ActivityLog";
import { Input } from "@/components/ui/input";
import { Search, Filter } from "lucide-react";
import { useState } from "react";

export default function ActivityPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");

  const filtered = sampleActivity.filter((e) => {
    if (filter !== "all" && e.type !== filter) return false;
    if (search && !e.message.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const filters = [
    { value: "all", label: "All" },
    { value: "upload", label: "Upload" },
    { value: "transcription", label: "Transcription" },
    { value: "telegram", label: "Telegram" },
    { value: "calendar", label: "Calendar" },
    { value: "rename", label: "Rename" },
    { value: "error", label: "Errors" },
  ];

  return (
    <div className="space-y-6 2xl:space-y-8">
      <div>
        <h1 className="text-2xl 2xl:text-3xl 3xl:text-4xl font-semibold tracking-tight">Activity Log</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Full processing history — uploads, transcriptions, renames, notifications
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search activity..."
            className="pl-9 bg-card"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1">
          {filters.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                filter === f.value
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        {filtered.length > 0 ? (
          <ActivityLog events={filtered} />
        ) : (
          <p className="py-12 text-center text-sm text-muted-foreground">No activity found</p>
        )}
      </div>
    </div>
  );
}
