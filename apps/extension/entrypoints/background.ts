import { isLikelyDrmHost } from "@watchalong/protocol";
import { defineBackground } from "wxt/utils/define-background";
import { type ExtMessage, IDLE_SESSION } from "../lib/messages";
import { patchSession, readSession } from "../lib/session";

const OFFSCREEN_PATH = "/offscreen.html";

export default defineBackground(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});

  chrome.runtime.onMessage.addListener((message: ExtMessage) => {
    if (message.target !== "background") return;
    switch (message.type) {
      case "start-sharing":
        startSharing(message.tabId).catch((err: unknown) =>
          patchSession({ status: "idle", error: String(err) }),
        );
        break;
      case "stop-sharing":
        stopSharing();
        break;
      case "session-update":
        patchSession(message.patch).then((s) => {
          if (s.status === "ended") closeOffscreen();
        });
        break;
    }
  });

  // Closing the shared tab ends the session immediately.
  chrome.tabs.onRemoved.addListener(async (tabId) => {
    const session = await readSession();
    if (session.tabId === tabId && session.status !== "idle") stopSharing();
  });
});

async function startSharing(tabId: number) {
  const tab = await chrome.tabs.get(tabId);
  const hostname = tab.url ? new URL(tab.url).hostname : "";
  await chrome.storage.session.set({ session: { ...IDLE_SESSION, status: "starting", tabId } });
  await patchSession({ drmWarning: isLikelyDrmHost(hostname) });

  // Must run while the user's action-click invocation on this tab is still valid.
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  await ensureOffscreen();
  const stored = await chrome.storage.local.get("hostName");
  const hostName = typeof stored.hostName === "string" ? stored.hostName : "Host";
  const msg: ExtMessage = { target: "offscreen", type: "start", streamId, hostName };
  await chrome.runtime.sendMessage(msg);
  // M3: inject the overlay content script into tabId (scripting.executeScript, allFrames).
}

function stopSharing() {
  const msg: ExtMessage = { target: "offscreen", type: "end" };
  chrome.runtime.sendMessage(msg).catch(() => {});
  patchSession({ status: "ended" });
  closeOffscreen();
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

function closeOffscreen() {
  chrome.offscreen.closeDocument().catch(() => {});
}
