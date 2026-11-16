import { createRoot } from "react-dom/client";
import type { ExtMessage } from "../../lib/messages";
import "../../lib/panel.css";

function Popup() {
  const start = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined || tab.windowId === undefined) return;
    // Both need the click's user gesture, so start them in the same tick before awaiting.
    const panel = chrome.sidePanel.open({ windowId: tab.windowId });
    const perms = chrome.permissions.request({ origins: ["<all_urls>"] });
    await Promise.allSettled([panel, perms]);
    const msg: ExtMessage = { target: "background", type: "start-sharing", tabId: tab.id };
    await chrome.runtime.sendMessage(msg);
    window.close();
  };

  return (
    <main className="panel">
      <h1>Cursor Watchalong</h1>
      <p>Share this tab with friends. They can point, draw, and (if you allow) control it.</p>
      <button type="button" onClick={start}>
        Start sharing this tab
      </button>
    </main>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<Popup />);
