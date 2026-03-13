import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 5173, // Changed from 8080 to avoid clashing with the Scriberr backend
    hmr: {
      overlay: false,
    },
    proxy: {
      // 1. Proxy transcription API requests to Scriberr backend (running on 8080)
      "/scriberr/api/v1/transcription": {
        target: "http://localhost:8080",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/scriberr/, ""),
      },
      // 2. Proxy audio streaming requests to Scriberr backend
      "/scriberr/audio": {
        target: "http://localhost:8080",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/scriberr/, ""),
      },
      // 3. Proxy local database requests to the Node.js Express server (running on 3001)
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          ui: ["@radix-ui/react-dialog", "@radix-ui/react-popover", "@radix-ui/react-tooltip", "@radix-ui/react-dropdown-menu", "@radix-ui/react-tabs", "@radix-ui/react-select"],
          charts: ["recharts"],
        },
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
