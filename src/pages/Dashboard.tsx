import { FileAudio, Calendar, FileText, Activity } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { MeetingRow } from "@/components/MeetingRow";
import { sampleMeetings } from "@/data/meetings";

export default function Dashboard() {
  const recentMeetings = sampleMeetings.slice(0, 5);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Overview of your meeting transcriptions
        </p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total Meetings" value={sampleMeetings.length} icon={Calendar} trend="+3 this week" />
        <StatCard label="Transcriptions" value={sampleMeetings.filter((m) => m.status === "completed").length} icon={FileText} />
        <StatCard label="Audio Files" value={sampleMeetings.filter((m) => m.mediaType === "audio").length} icon={FileAudio} />
        <StatCard label="Processing" value={sampleMeetings.filter((m) => m.status === "transcribing").length} icon={Activity} />
      </div>

      <div>
        <h2 className="mb-4 text-lg font-medium">Recent Meetings</h2>
        <div className="space-y-2">
          {recentMeetings.map((m) => (
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
        </div>
      </div>
    </div>
  );
}
