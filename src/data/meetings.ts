import { TranscriptSegment } from "@/components/MeetingPlayer";

export interface Meeting {
  id: string;
  title: string;
  date: string;
  duration: string;
  status: "pending" | "transcribing" | "completed" | "error";
  source: "Upload" | "Telegram";
  mediaType: "audio" | "video";
  mediaSrc?: string;
  calendarEventUrl?: string;
  calendarEventId?: string;
  segments: TranscriptSegment[];
}

export const sampleMeetings: Meeting[] = [
  {
    id: "m1",
    title: "Sprint Planning - Q1 2026",
    date: "2026-03-12",
    duration: "45:20",
    status: "completed",
    source: "Upload",
    mediaType: "video",
    calendarEventUrl: "https://calendar.google.com/calendar/event?eid=abc123",
    calendarEventId: "abc123",
    segments: [
      { speaker: "Alex Chen", startTime: 0, endTime: 8, text: "Alright everyone, let's get started with today's sprint planning. We have quite a few items to go through this time." },
      { speaker: "Sarah Kim", startTime: 8, endTime: 15, text: "Sure. I've updated the backlog with the new priorities from yesterday's stakeholder meeting. There are three critical items." },
      { speaker: "Alex Chen", startTime: 15, endTime: 22, text: "Great. Let's start with the authentication module. What's the current status on that?" },
      { speaker: "Dev Patel", startTime: 22, endTime: 32, text: "I finished the OAuth integration yesterday. It's in review now. Should be merged by end of day. I also added the refresh token logic." },
      { speaker: "Sarah Kim", startTime: 32, endTime: 41, text: "Nice work. The API rate limiting is next on my list. I'll need about two days for the implementation and testing." },
      { speaker: "Alex Chen", startTime: 41, endTime: 50, text: "That works. Let's also discuss the Telegram bot integration — we need to finalize the message parsing logic before the release." },
      { speaker: "Dev Patel", startTime: 50, endTime: 60, text: "I can help with that. I've worked with the Telegram Bot API before. We should use webhook mode for reliability." },
      { speaker: "Alex Chen", startTime: 60, endTime: 68, text: "Perfect. Sarah, can you pair with Dev on that tomorrow? We want it ready for QA by Thursday." },
      { speaker: "Sarah Kim", startTime: 68, endTime: 76, text: "Absolutely. I'll block out the morning. Dev, let's sync at 10 AM?" },
      { speaker: "Dev Patel", startTime: 76, endTime: 82, text: "Works for me. I'll prepare a draft of the message schema tonight so we can hit the ground running." },
      { speaker: "Alex Chen", startTime: 82, endTime: 92, text: "Great teamwork. Last item — the transcription service. We need to decide on the self-hosted vs cloud approach by Friday." },
      { speaker: "Sarah Kim", startTime: 92, endTime: 102, text: "I've been testing Scriberr locally. The WhisperX results are impressive. Speaker diarization works well with 3-4 speakers." },
      { speaker: "Dev Patel", startTime: 102, endTime: 110, text: "Self-hosted gives us more control over data privacy. Plus we can run it in the same Docker network." },
      { speaker: "Alex Chen", startTime: 110, endTime: 118, text: "Agreed. Let's go with self-hosted. Sarah, can you write up the Docker compose config? Alright, I think we're good. Great meeting everyone." },
    ],
  },
  {
    id: "m2",
    title: "Design Review",
    date: "2026-03-11",
    duration: "32:10",
    status: "completed",
    source: "Telegram",
    mediaType: "audio",
    calendarEventUrl: "https://calendar.google.com/calendar/event?eid=def456",
    calendarEventId: "def456",
    segments: [
      { speaker: "Maria Lopez", startTime: 0, endTime: 10, text: "Let's review the new dashboard designs. I've shared the Figma link in the chat." },
      { speaker: "James Wu", startTime: 10, endTime: 20, text: "The dark theme looks excellent. I really like the emerald accent color choice." },
      { speaker: "Maria Lopez", startTime: 20, endTime: 30, text: "Thanks! Let's discuss the transcript player component next. I want to make sure it handles video too." },
    ],
  },
  {
    id: "m3",
    title: "Client Sync - Acme Corp",
    date: "2026-03-11",
    duration: "58:43",
    status: "pending",
    source: "Upload",
    mediaType: "video",
    segments: [],
  },
  {
    id: "m4",
    title: "Team Standup",
    date: "2026-03-10",
    duration: "15:02",
    status: "completed",
    source: "Telegram",
    mediaType: "audio",
    calendarEventUrl: "https://calendar.google.com/calendar/event?eid=ghi789",
    calendarEventId: "ghi789",
    segments: [
      { speaker: "Alex Chen", startTime: 0, endTime: 8, text: "Quick standup. What did everyone work on yesterday?" },
      { speaker: "Dev Patel", startTime: 8, endTime: 18, text: "I wrapped up the file upload component and started on the queue worker." },
      { speaker: "Sarah Kim", startTime: 18, endTime: 28, text: "I fixed the calendar integration bug and deployed the hotfix." },
    ],
  },
  {
    id: "m5",
    title: "Product Roadmap Discussion",
    date: "2026-03-10",
    duration: "1:12:30",
    status: "error",
    source: "Upload",
    mediaType: "video",
    segments: [],
  },
  {
    id: "m6",
    title: "Engineering Sync",
    date: "2026-03-09",
    duration: "28:15",
    status: "completed",
    source: "Upload",
    mediaType: "audio",
    segments: [
      { speaker: "Alex Chen", startTime: 0, endTime: 12, text: "We need to finalize the Docker setup for the transcription pipeline this week." },
      { speaker: "Dev Patel", startTime: 12, endTime: 24, text: "I've drafted the docker-compose file. It includes Scriberr, the file watcher, and the Telegram bot." },
    ],
  },
  {
    id: "m7",
    title: "1:1 with Manager",
    date: "2026-03-09",
    duration: "22:40",
    status: "completed",
    source: "Telegram",
    mediaType: "audio",
    segments: [
      { speaker: "Alex Chen", startTime: 0, endTime: 15, text: "Let's talk about your growth goals for this quarter and how the project is going." },
      { speaker: "Dev Patel", startTime: 15, endTime: 30, text: "I'd like to focus more on system design. The meeting transcription project is a great opportunity for that." },
    ],
  },
  {
    id: "m8",
    title: "All Hands Q1",
    date: "2026-03-08",
    duration: "1:05:12",
    status: "completed",
    source: "Upload",
    mediaType: "video",
    calendarEventUrl: "https://calendar.google.com/calendar/event?eid=jkl012",
    calendarEventId: "jkl012",
    segments: [
      { speaker: "CEO", startTime: 0, endTime: 20, text: "Welcome everyone to the Q1 all hands. We've had an incredible quarter with record growth." },
      { speaker: "CTO", startTime: 20, endTime: 40, text: "On the engineering side, we've shipped 47 features and reduced our incident response time by 60%." },
    ],
  },
];
