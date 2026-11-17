/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Discover every dependency up front so the dev server never reloads mid-test.
  optimizeDeps: {
    entries: [
      "index.html",
      "e2e-harness/host.html",
      "e2e-harness/overlay.html",
      "e2e-harness/extension.html",
    ],
  },
  test: { include: ["src/**/*.test.ts"] },
  server: {
    port: 5173,
    proxy: { "/ws": { target: "ws://localhost:8787", ws: true } },
  },
});
