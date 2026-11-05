/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
  server: { proxy: { "/api": "http://localhost:8000" } },
  // The theme test reads theme.css as text; Vitest skips CSS unless included.
  test: { environment: "jsdom", css: { include: [/styles\/theme\.css/] } },
});
