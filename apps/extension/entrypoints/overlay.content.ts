import { defineContentScript } from "wxt/utils/define-content-script";
import { MediaController } from "../lib/content/media-controller";
import { PORT_NAME } from "../lib/messages";
import type { FromTab, ToTab } from "../lib/tab-protocol";

/**
 * Runs in every frame of the shared tab while a session is live (registered at runtime only,
 * never declared in the manifest). The engine disconnects the port immediately for any other
 * tab, which makes this script go inert.
 */
export default defineContentScript({
  matches: ["<all_urls>"],
  registration: "runtime",
  allFrames: true,
  runAt: "document_idle",
  main() {
    const w = window as Window & { __watchalongActive?: boolean };
    if (w.__watchalongActive) return;
    w.__watchalongActive = true;

    const isTop = window === window.top;
    let port: chrome.runtime.Port;
    try {
      port = chrome.runtime.connect({ name: PORT_NAME });
    } catch {
      w.__watchalongActive = false;
      return; // extension reloaded or context invalidated
    }

    const post = (message: FromTab) => {
      try {
        port.postMessage(message);
      } catch {
        // port closed
      }
    };

    let media: MediaController | null = null;
    let disposed = false;
    const cleanups: (() => void)[] = [];

    const reportViewport = () =>
      post({ type: "viewport", width: window.innerWidth, height: window.innerHeight });

    const start = () => {
      media = new MediaController((state, score) => post({ type: "media-report", state, score }));
      if (isTop) {
        reportViewport();
        let t: ReturnType<typeof setTimeout> | undefined;
        const onResize = () => {
          clearTimeout(t);
          t = setTimeout(reportViewport, 150);
        };
        window.addEventListener("resize", onResize);
        cleanups.push(() => window.removeEventListener("resize", onResize));
      }
    };

    const dispose = () => {
      if (disposed) return;
      disposed = true;
      media?.dispose();
      media = null;
      for (const c of cleanups.splice(0)) c();
      w.__watchalongActive = false;
    };

    port.onMessage.addListener((message: ToTab) => {
      switch (message.type) {
        case "hello":
          if (!media) start();
          break;
        case "guest":
          if (message.message.type === "media") media?.apply(message.message);
          break;
        case "end":
          dispose();
          port.disconnect();
          break;
        default:
          break;
      }
    });
    port.onDisconnect.addListener(dispose);
  },
});
