import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: {
    name: "Cursor Watchalong",
    // Service-worker capture IDs consumed by an offscreen document and sidePanel.open() need 116.
    minimum_chrome_version: "116",
    description:
      "Share a live tab with friends who can point, draw, and control playback together.",
    permissions: ["tabCapture", "offscreen", "scripting", "storage", "sidePanel", "activeTab"],
    // Requested at Start Sharing so the overlay survives cross-origin navigation and iframes.
    optional_host_permissions: ["<all_urls>"],
    action: { default_title: "Cursor Watchalong" },
  },
});
