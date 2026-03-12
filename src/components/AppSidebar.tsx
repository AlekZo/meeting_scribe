import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Upload,
  List,
  Settings,
  Mic,
  Activity,
  ScrollText,
  Cpu,
  MessageCircle,
  Calendar,
} from "lucide-react";
import { loadSetting } from "@/lib/storage";

function ServiceStatusIndicators() {
  const scriberrUrl = loadSetting<string>("scriberr_url", "");
  const tgEnabled = loadSetting<boolean>("tg_enabled", false);
  const googleCalId = loadSetting<string>("google_calendar_id", "");

  const items = [
    { label: "Scriberr", icon: Cpu, connected: !!scriberrUrl },
    { label: "Telegram", icon: MessageCircle, connected: tgEnabled },
    { label: "Google", icon: Calendar, connected: !!googleCalId },
  ];

  return (
    <div className="flex items-center gap-3">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1" title={`${item.label}: ${item.connected ? "Configured" : "Not configured"}`}>
          <item.icon className="h-3 w-3 text-muted-foreground" />
          <span className={cn("h-1.5 w-1.5 rounded-full", item.connected ? "bg-success" : "bg-muted-foreground/40")} />
        </div>
      ))}
    </div>
  );
}

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/upload", icon: Upload, label: "Upload" },
  { to: "/meetings", icon: List, label: "Meetings" },
  { to: "/activity", icon: ScrollText, label: "Activity Log" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export function AppSidebar() {
  const location = useLocation();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-60 flex-col border-r border-border bg-sidebar">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 border-b border-border px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded bg-primary">
          <Mic className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="font-semibold tracking-tight text-foreground">
          MeetingHub
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const isActive =
            item.to === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(item.to);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      {/* Status */}
      <div className="border-t border-border px-4 py-3 space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Activity className="h-3 w-3 text-success animate-pulse-glow" />
          <span className="font-mono">System Online</span>
        </div>
        <ServiceStatusIndicators />
      </div>
    </aside>
  );
}
