import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  List,
  Settings,
  Mic,
  Activity,
  Cpu,
  MessageCircle,
  Calendar,
  PanelLeftClose,
  PanelLeft,
  Loader2,
  Upload,
} from "lucide-react";
import { loadSetting, saveSetting } from "@/lib/storage";
import { SyncStatusIndicator } from "./SyncStatus";
import { useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useUpload } from "@/contexts/UploadContext";

function ServiceStatusIndicators({ collapsed }: { collapsed: boolean }) {
  const navigate = useNavigate();
  const scriberrUrl = loadSetting<string>("scriberr_url", "").trim();
  const tgEnabled = loadSetting<boolean>("tg_enabled", false);
  const googleCalId = loadSetting<string>("google_calendar_id", "");

  const items = [
    { label: "Scriberr", icon: Cpu, connected: true, detail: scriberrUrl ? "Custom URL" : "Proxy mode" },
    { label: "Telegram", icon: MessageCircle, connected: tgEnabled },
    { label: "Google", icon: Calendar, connected: !!googleCalId },
  ];

  return (
    <div className={cn("flex items-center", collapsed ? "flex-col gap-2" : "gap-3")}>
      {items.map((item) => (
        <button
          key={item.label}
          onClick={() => !item.connected && navigate("/settings")}
          className={cn(
            "flex items-center gap-1 transition-colors",
            !item.connected && "cursor-pointer hover:text-foreground"
          )}
          title={`${item.label}: ${item.connected ? (item.detail ? `${item.detail} configured` : "Configured") : "Not configured — click to set up"}`}
        >
          <item.icon className="h-3 w-3 text-muted-foreground" />
          {!collapsed && <span className={cn("h-1.5 w-1.5 rounded-full", item.connected ? "bg-success" : "bg-muted-foreground/40")} />}
        </button>
      ))}
    </div>
  );
}

const navItems = [
  { to: "/", icon: List, label: "Meetings" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export function AppSidebar() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => loadSetting<boolean>("sidebar_collapsed", false));
  const { activeCount } = useUpload();

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    saveSetting("sidebar_collapsed", next);
  };

  return (
    <TooltipProvider delayDuration={300}>
      <aside className={cn(
        "fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-border bg-sidebar transition-all duration-200",
        collapsed ? "w-14" : "w-60"
      )}>
        {/* Logo */}
        <div className={cn("flex h-14 items-center border-b border-border", collapsed ? "justify-center px-2" : "gap-2 px-5")}>
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-primary">
            <Mic className="h-4 w-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <span className="font-semibold tracking-tight text-foreground">
              MeetingHub
            </span>
          )}
        </div>

        {/* Navigation */}
        <nav className={cn("flex-1 space-y-1 py-4", collapsed ? "px-1.5" : "px-3")}>
          {navItems.map((item) => {
            const isActive =
              item.to === "/"
                ? location.pathname === "/" || location.pathname.startsWith("/meetings")
                : location.pathname.startsWith(item.to);

            const link = (
              <NavLink
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center rounded-md transition-colors",
                  collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2 text-sm font-medium",
                  isActive
                    ? "bg-sidebar-accent text-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed && item.label}
              </NavLink>
            );

            if (collapsed) {
              return (
                <Tooltip key={item.to}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              );
            }
            return link;
          })}
        </nav>

        {/* Active uploads indicator */}
        {activeCount > 0 && (
          <div className={cn("border-t border-border", collapsed ? "px-2 py-2 flex justify-center" : "px-3 py-2")}>
            <NavLink
              to="/"
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/15 transition-colors w-full",
                collapsed && "justify-center"
              )}
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
              {!collapsed && (
                <span className="flex items-center gap-1.5">
                  <Upload className="h-3 w-3" />
                  {activeCount} processing
                </span>
              )}
            </NavLink>
          </div>
        )}

        {/* Collapse toggle */}
        <div className={cn("border-t border-border", collapsed ? "px-2 py-2 flex justify-center" : "px-3 py-2")}>
          <button
            onClick={toggle}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors w-full"
          >
            {collapsed ? (
              <PanelLeft className="h-4 w-4 mx-auto" />
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>

        {/* Sync status */}
        <div className={cn("border-t border-border py-2", collapsed ? "px-2 flex justify-center" : "px-3")}>
          <SyncStatusIndicator compact={collapsed} />
        </div>

        {/* Status */}
        <div className={cn("border-t border-border py-3 space-y-2", collapsed ? "px-2 flex flex-col items-center" : "px-4")}>
          <div className={cn("flex items-center text-xs text-muted-foreground", collapsed ? "justify-center" : "gap-2")}>
            <Activity className="h-3 w-3 text-success animate-pulse-glow" />
            {!collapsed && <span className="font-mono">System Online</span>}
          </div>
          <ServiceStatusIndicators collapsed={collapsed} />
        </div>
      </aside>
    </TooltipProvider>
  );
}
