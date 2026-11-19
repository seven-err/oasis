import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const proxy = {
  "^/(auth|login|logout|change-password|dashboard|account|profile|team|activity|archives|deleted|reports|users|settings|activity-logs|hr|checks|payables|receivables|oasis|build)(/|$)": {
    target: "http://127.0.0.1:8000",
    changeOrigin: false,
  },
};

export default defineConfig(({ command }) => ({
  base: command === "build" || process.env.GITHUB_PAGES === "true" ? "/oasis/" : "/",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  build: { manifest: true },
  server: { host: "127.0.0.1", port: parseInt(process.env.PORT || "5173"), strictPort: true, proxy },
  preview: { host: "127.0.0.1", port: parseInt(process.env.PORT || "5173"), strictPort: true, proxy },
}));
