import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Vite config — https://vitejs.dev/config/
export default defineConfig({
  // https://seven-err.github.io/oasis/
  base: process.env.GITHUB_PAGES === "true" ? "/oasis/" : "/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: parseInt(process.env.PORT || "5173"),
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: parseInt(process.env.PORT || "5173"),
    strictPort: true,
  },
});
