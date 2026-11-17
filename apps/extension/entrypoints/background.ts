import { isLikelyDrmHost } from "@watchalong/protocol";
import { defineBackground } from "wxt/utils/define-background";
import {
  type ExtMessage,
  HOST_NAME_KEY,
  HOST_PIN_KEY,
  IDLE_SESSION,
  sendExt,
} from "../lib/messages";
import { patchSession, readSession, replaceSession } from "../lib/session";

const OFFSCREEN_PATH = "/offscreen.html";

class AlreadyRunningError extends Error {}

/** Serializes start/stop so a stale timer or rejected request can never touch a newer session. */
let lifecycle: Promise<unknown> = Promise.resolve();
function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = lifecycle.then(task, task);
  lifecycle = run.catch(() => undefined);
  return run;
}

export default defineBackground(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});

  chrome.runtime.onMessage.addListener((message: ExtMessage, sender) => {
    if (message.target !== "background") return;
    // Only our own extension pages may drive the session.
    if (sender.id !== chrome.runtime.id || sender.tab) return;
    switch (message.type) {
      case "start-sharing":
        serialize(() =>
          startSharing(message.tabId).catch(async (err: unknown) => {
            if (err instanceof AlreadyRunningError) {
              await patchSession({ error: err.message });
              return;
            }
            await failStart(err);
          }),
        );
        break;
      case "stop-sharing":
        serialize(stopSharing);
        break;
      case "focus-shared-tab":
        focusSharedTab();
        break;
      case "host-state":
        serialize(async () => {
          const current = await readSession();
          // Ignore late updates from a session that was already stopped.
          if (current.status !== "live" && current.status !== "starting") return;
          if (message.host.status === "ended") {
            // Keep nothing about a finished session (guests, invite link, activity).
            await replaceSession({ status: "ended", error: message.host.error });
            await closeOffscreen();
            return;
          }
          await patchSession({ host: message.host, status: "live", error: message.host.error });
        });
        break;
      case "inject-overlay":
        serialize(() => injectOverlay(message.tabId).catch(() => {}));
        break;
      case "drawing-changed":
        patchSession({ drawing: message.drawing });
        break;
      case "offscreen-error":
        serialize(() => failStart(message.error));
        break;
    }
  });

  // Closing the shared tab ends the session immediately.
  chrome.tabs.onRemoved.addListener(async (tabId) => {
    const session = await readSession();
    if (session.tabId === tabId && (session.status === "live" || session.status === "starting")) {
      serialize(stopSharing);
    }
  });

  // Keep the side panel's title in sync when the shared tab navigates.
  chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
    if (!info.title && !info.url) return;
    const session = await readSession();
    if (session.tabId !== tabId || session.status !== "live") return;
    const host = safeHostname(tab.url);
    patchSession({ tabTitle: tab.title, tabHost: host, drmWarning: isLikelyDrmHost(host) });
  });
});

async function startSharing(tabId: number) {
  const current = await readSession();
  if (current.status === "live" || current.status === "starting") {
    throw new AlreadyRunningError(
      "A session is already running. End it before sharing another tab.",
    );
  }
  const tab = await chrome.tabs.get(tabId);
  const host = safeHostname(tab.url);
  if (tab.url && /^(chrome|edge|about|chrome-extension|devtools|view-source):/.test(tab.url)) {
    throw new Error("Chrome doesn't allow sharing this kind of page. Open a website first.");
  }
  await replaceSession({
    ...IDLE_SESSION,
    status: "starting",
    tabId,
    tabTitle: tab.title,
    tabHost: host,
    drmWarning: isLikelyDrmHost(host),
  });

  await ensureOffscreen();
  const stored = await chrome.storage.local.get([HOST_NAME_KEY, HOST_PIN_KEY]);
  const hostPin = typeof stored[HOST_PIN_KEY] === "string" ? stored[HOST_PIN_KEY].trim() : "";
  const hostName =
    typeof stored[HOST_NAME_KEY] === "string" && stored[HOST_NAME_KEY].trim()
      ? stored[HOST_NAME_KEY].trim().slice(0, 32)
      : "Host";
  // Stream IDs expire after a few seconds, so mint it last, right before it's consumed.
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  await sendExt({
    target: "offscreen",
    type: "start",
    streamId,
    tabId,
    hostName,
    ...(hostPin ? { hostPin } : {}),
  });
}

async function failStart(err: unknown) {
  const error = err instanceof Error ? err.message : String(err);
  await replaceSession({ ...IDLE_SESSION, error });
  await closeOffscreen();
}

async function stopSharing() {
  const session = await readSession();
  if (session.status === "idle" || session.status === "ended") {
    await closeOffscreen();
    return;
  }
  await replaceSession({ status: "ended" });
  await sendExt({ target: "offscreen", type: "end" });
  // Give the offscreen document a moment to tell the server before it's closed.
  await new Promise((r) => setTimeout(r, 300));
  await closeOffscreen();
}

async function focusSharedTab() {
  const { tabId } = await readSession();
  if (tabId === undefined) return;
  const tab = await chrome.tabs.update(tabId, { active: true }).catch(() => null);
  if (tab?.windowId !== undefined) chrome.windows.update(tab.windowId, { focused: true });
}

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });
  if (contexts.length > 0) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: "Capture the shared tab and stream it to guests over WebRTC.",
  });
}

const OVERLAY_ID = "watchalong-overlay";
const OVERLAY_FILE = "content-scripts/overlay.js";

/**
 * Run the overlay in the shared tab. With the optional all-sites permission it is registered
 * for every frame and future navigation (it goes inert in any other tab); without it, it's
 * injected once into the current page only.
 */
async function injectOverlay(tabId: number) {
  const session = await readSession();
  if (session.tabId !== tabId || (session.status !== "live" && session.status !== "starting")) {
    return;
  }
  const allSites = await chrome.permissions.contains({ origins: ["<all_urls>"] });
  if (allSites) {
    await chrome.scripting.unregisterContentScripts({ ids: [OVERLAY_ID] }).catch(() => {});
    await chrome.scripting
      .registerContentScripts([
        {
          id: OVERLAY_ID,
          js: [OVERLAY_FILE],
          matches: ["<all_urls>"],
          allFrames: true,
          // Also run in about:blank / blob: frames that players create dynamically.
          matchOriginAsFallback: true,
          runAt: "document_idle",
          persistAcrossSessions: false,
        } as chrome.scripting.RegisteredContentScript,
      ])
      .catch(() => {});
  }
  // Re-check: the session may have ended while registering (injection is serialized with stop).
  const still = await readSession();
  if (still.tabId !== tabId || (still.status !== "live" && still.status !== "starting")) {
    await removeOverlay();
    return;
  }
  await chrome.scripting
    .executeScript({ target: { tabId, allFrames: allSites }, files: [OVERLAY_FILE] })
    .catch(() => {});
}

async function removeOverlay() {
  await chrome.scripting.unregisterContentScripts({ ids: [OVERLAY_ID] }).catch(() => {});
}

async function closeOffscreen() {
  await removeOverlay();
  await chrome.offscreen.closeDocument().catch(() => {});
}

function safeHostname(url: string | undefined): string {
  try {
    return url ? new URL(url).hostname : "";
  } catch {
    return "";
  }
}
