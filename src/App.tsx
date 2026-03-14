import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
import { UploadProvider } from "@/contexts/UploadContext";
import { initServerSync } from "@/lib/storage";
import MeetingsPage from "@/pages/MeetingsPage";
import MeetingDetailPage from "@/pages/MeetingDetailPage";

import SettingsPage from "@/pages/SettingsPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => {
  useEffect(() => {
    initServerSync();
  }, []);

  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <UploadProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<MeetingsPage />} />
              <Route path="/upload" element={<Navigate to="/" replace />} />
              <Route path="/meetings" element={<Navigate to="/" replace />} />
              <Route path="/meetings/:id" element={<MeetingDetailPage />} />
              <Route path="/activity" element={<Navigate to="/settings" replace />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </UploadProvider>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
