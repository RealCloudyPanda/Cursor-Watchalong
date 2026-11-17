import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  vite: () => ({ plugins: [tailwindcss()] }),
  hooks: {
    // WXT turns the runtime content script's `matches` into required host_permissions.
    // All-sites access must stay optional (requested at Start Sharing), so drop it.
    "build:manifestGenerated": (_wxt, manifest) => {
      delete manifest.host_permissions;
    },
  },
  manifest: {
    name: "Cursor Watchalong",
    // 116: SW capture IDs for offscreen docs + sidePanel.open(); 119: matchOriginAsFallback.
    minimum_chrome_version: "119",
    description:
      "Share a live tab with friends who can point, draw, and control playback together.",
    permissions: ["tabCapture", "offscreen", "scripting", "storage", "sidePanel", "activeTab"],
    // Requested at Start Sharing so the overlay survives cross-origin navigation and iframes.
    optional_host_permissions: ["<all_urls>"],
    action: { default_title: "Cursor Watchalong" },
  },
});
