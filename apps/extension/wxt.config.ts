import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Cursor Watchalong",
    description:
      "Share a live tab with friends who can point, draw, and control playback together.",
    permissions: ["tabCapture", "offscreen", "scripting", "storage", "sidePanel", "activeTab"],
    // Requested at Start Sharing so the overlay survives cross-origin navigation and iframes.
    optional_host_permissions: ["<all_urls>"],
    action: { default_title: "Cursor Watchalong" },
  },
});
