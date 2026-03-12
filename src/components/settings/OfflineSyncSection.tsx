import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Wifi, WifiOff, RefreshCw, Calendar, HardDrive } from "lucide-react";
import { isOnline } from "@/lib/storage";

export default function OfflineSyncSection() {
  const [online, setOnline] = useState(isOnline());
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(
    localStorage.getItem("meetscribe_last_gcal_sync")
  );

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const storageUsed = (() => {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("meetscribe_")) {
        total += (localStorage.getItem(key) || "").length;
      }
    }
    return (total / 1024).toFixed(1);
  })();

  const pullCalendarNames = async () => {
    setSyncing(true);
    // This would call Google Calendar API when backend is wired
    await new Promise((r) => setTimeout(r, 2000));
    const now = new Date().toISOString();
    localStorage.setItem("meetscribe_last_gcal_sync", now);
    setLastSync(now);
    setSyncing(false);
  };

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-primary" />
          <h2 className="text-base font-medium">Local Storage & Sync</h2>
        </div>
        <div className="flex items-center gap-1.5">
          {online ? (
            <Wifi className="h-3.5 w-3.5 text-success" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-destructive" />
          )}
          <span className="text-xs text-muted-foreground">
            {online ? "Online" : "Offline"}
          </span>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        All data is stored locally in your browser. Transcription runs on your local Scriberr instance. 
        Google Calendar sync only runs when you're online.
      </p>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-md border border-border bg-background p-3">
          <p className="text-muted-foreground">Local storage used</p>
          <p className="mt-1 text-lg font-mono font-medium text-foreground">{storageUsed} KB</p>
        </div>
        <div className="rounded-md border border-border bg-background p-3">
          <p className="text-muted-foreground">Last Calendar sync</p>
          <p className="mt-1 text-sm font-mono font-medium text-foreground">
            {lastSync
              ? new Date(lastSync).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
              : "Never"}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={pullCalendarNames}
          disabled={!online || syncing}
          className="gap-1.5 text-xs"
        >
          {syncing ? (
            <RefreshCw className="h-3 w-3 animate-spin" />
          ) : (
            <Calendar className="h-3 w-3" />
          )}
          Pull meeting names from Google Calendar
        </Button>
      </div>

      {!online && (
        <p className="text-[10px] text-warning">
          You're offline. Upload & transcription work locally via Scriberr. Google sync will resume when online.
        </p>
      )}
    </section>
  );
}
