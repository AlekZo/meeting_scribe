import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { SyncStatusIndicator } from "./SyncStatus";
import { loadSetting } from "@/lib/storage";
import { useState, useEffect } from "react";

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(() => loadSetting<boolean>("sidebar_collapsed", false));

  // Listen for storage changes to sync collapse state
  useEffect(() => {
    const handler = () => setCollapsed(loadSetting<boolean>("sidebar_collapsed", false));
    window.addEventListener("storage", handler);
    const interval = setInterval(handler, 200);
    return () => {
      window.removeEventListener("storage", handler);
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      {/* Sync status indicator — fixed top-right */}
      <div className="fixed top-3 right-4 z-50">
        <SyncStatusIndicator />
      </div>
      <main className={`min-h-screen transition-all duration-200 ${collapsed ? "ml-14" : "ml-60"}`}>
        <div className="p-6 lg:p-8 2xl:p-10 3xl:p-14">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
