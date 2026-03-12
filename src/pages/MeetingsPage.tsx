import { MeetingRow } from "@/components/MeetingRow";
import { sampleMeetings } from "@/data/meetings";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useState } from "react";

export default function MeetingsPage() {
  const [search, setSearch] = useState("");
  const filtered = sampleMeetings.filter((m) =>
    m.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Meetings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            All recorded meetings and their transcription status
          </p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search meetings..."
            className="pl-9 bg-card"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        {filtered.map((m) => (
          <MeetingRow
            key={m.id}
            id={m.id}
            title={m.title}
            date={m.date}
            duration={m.duration}
            status={m.status}
            source={m.source}
            mediaType={m.mediaType}
            calendarEventUrl={m.calendarEventUrl}
          />
        ))}
        {filtered.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">No meetings found</p>
        )}
      </div>
    </div>
  );
}
