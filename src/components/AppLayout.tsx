import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { loadSetting } from "@/lib/storage";
import { useState, useEffect } from "react";

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(() => loadSetting<boolean>("sidebar_collapsed", false));

  // Listen for storage changes to sync collapse state
  useEffect(() => {
    const handler = () => setCollapsed(loadSetting<boolean>("sidebar_collapsed", false));
    window.addEventListener("storage", handler);
    // Also poll for same-tab changes
    const interval = setInterval(handler, 200);
    return () => {
      window.removeEventListener("storage", handler);
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className={`min-h-screen transition-all duration-200 ${collapsed ? "ml-14" : "ml-60"}`}>
        <div className="p-6 lg:p-8 2xl:p-10 3xl:p-14">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
