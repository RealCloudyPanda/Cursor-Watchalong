import { defineConfig } from "@playwright/test";

/** Real two-browser WebRTC tests: server on :8787, Vite dev on :5173 (serves the host harness). */
export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    channel: "chrome",
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        "--autoplay-policy=no-user-gesture-required",
      ],
    },
  },
  webServer: [
    {
      command: "pnpm --filter @watchalong/server start",
      url: "http://localhost:8787/healthz",
      env: { PORT: "8787", ROOMS_PER_IP_PER_MIN: "1000" },
      reuseExistingServer: false,
    },
    {
      command: "pnpm --filter @watchalong/web dev --strictPort",
      url: "http://localhost:5173",
      reuseExistingServer: true,
    },
  ],
});
