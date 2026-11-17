import type { Participant } from "@watchalong/protocol";
import { defineContentScript } from "wxt/utils/define-content-script";
import { MediaController } from "../lib/content/media-controller";
import { Overlay } from "../lib/content/overlay";
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
    let overlay: Overlay | null = null;
    let disposed = false;
    const cleanups: (() => void)[] = [];

    const reportViewport = () =>
      post({ type: "viewport", width: window.innerWidth, height: window.innerHeight });

    const applyRoster = (roster: Participant[]) => {
      if (!overlay) return;
      const host = roster.find((p) => p.role === "host");
      if (host) overlay.setHost(host.name, host.color);
      overlay.setRoster(roster);
    };

    const start = (hello: Extract<ToTab, { type: "hello" }>) => {
      media = new MediaController((state, score) => post({ type: "media-report", state, score }));
      if (isTop) {
        const host = hello.roster.find((p) => p.role === "host");
        try {
          overlay = new Overlay({
            hostName: host?.name ?? "Host",
            hostColor: host?.color ?? "#ff4d6d",
            onDrawingChanged: (drawing) => post({ type: "drawing-changed", drawing }),
          });
          applyRoster(hello.roster);
          overlay.setDrawing(hello.drawing);
        } catch {
          overlay = null;
        }
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
      overlay?.dispose();
      overlay = null;
      for (const c of cleanups.splice(0)) c();
      w.__watchalongActive = false;
    };

    port.onMessage.addListener((message: ToTab) => {
      switch (message.type) {
        case "hello":
          if (!media) start(message);
          break;
        case "roster":
          applyRoster(message.participants);
          break;
        case "guest-gone":
          overlay?.removeParticipant(message.id);
          break;
        case "set-drawing":
          overlay?.setDrawing(message.drawing);
          break;
        case "guest": {
          const { from, message: m } = message;
          switch (m.type) {
            case "media":
              media?.apply(m);
              break;
            case "cursor":
              overlay?.cursor(from.id, m.x, m.y);
              break;
            case "cursor-leave":
              overlay?.hideCursor(from.id);
              break;
            case "stroke-start":
              overlay?.strokeStart(from.id, m.strokeId, m.x, m.y);
              overlay?.cursor(from.id, m.x, m.y);
              break;
            case "stroke-point":
              overlay?.strokePoint(from.id, m.strokeId, m.x, m.y);
              overlay?.cursor(from.id, m.x, m.y);
              break;
            case "stroke-end":
              overlay?.strokeEnd(from.id, m.strokeId);
              break;
            default:
              break;
          }
          break;
        }
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
