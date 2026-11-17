import type { Participant } from "@watchalong/protocol";
import { defineContentScript } from "wxt/utils/define-content-script";
import { InputInjector } from "../lib/content/input-injector";
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
    const w = window as Window & {
      __watchalongInstalled?: boolean;
      __watchalongActive?: boolean;
      __watchalongConnect?: () => void;
    };
    if (w.__watchalongInstalled) {
      // Injected again for a new session on the same page: reconnect if we went inert.
      if (!w.__watchalongActive) w.__watchalongConnect?.();
      return;
    }
    w.__watchalongInstalled = true;

    // Chrome closes extension ports when a page enters the back/forward cache and doesn't
    // reopen them, so reconnect when a cached page is restored.
    window.addEventListener("pageshow", (e) => {
      if (e.persisted && !w.__watchalongActive) connect();
    });
    w.__watchalongConnect = connect;
    connect();

    function connect() {
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
      let injector: InputInjector | null = null;
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
        // Every frame gets an injector: child frames receive clicks forwarded by their parent.
        injector = new InputInjector({
          ignore: () => overlay?.element ?? null,
          forwardToFrame: (challenge, input) => post({ type: "frame-input", challenge, input }),
          ackProbe: (challenge) => post({ type: "probe-ack", challenge }),
        });
        post({
          type: "frame-info",
          origin: location.origin,
          parentOrigin: location.ancestorOrigins?.[0] ?? null,
        });
        if (!isTop) {
          // Keyboard events don't leave a focused iframe, so relay the draw keys to the top frame.
          const onKey = (e: KeyboardEvent, down: boolean) => {
            if (e.key === "Alt") post({ type: "draw-key", key: down ? "alt-down" : "alt-up" });
            else if (down && e.key === "Escape") post({ type: "draw-key", key: "escape" });
          };
          const kd = (e: KeyboardEvent) => onKey(e, true);
          const ku = (e: KeyboardEvent) => onKey(e, false);
          const blur = () => post({ type: "draw-key", key: "alt-up" });
          window.addEventListener("keydown", kd, true);
          window.addEventListener("keyup", ku, true);
          window.addEventListener("blur", blur);
          cleanups.push(() => {
            window.removeEventListener("keydown", kd, true);
            window.removeEventListener("keyup", ku, true);
            window.removeEventListener("blur", blur);
          });
        }
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
        injector?.dispose();
        injector = null;
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
          case "inject":
            injector?.inject(message.input);
            break;
          case "draw-key":
            if (message.key === "escape") overlay?.cancelPinnedDrawing();
            else overlay?.setAltHeld(message.key === "alt-down");
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
              case "pointer":
                overlay?.ripple(from.id, m.x, m.y);
                overlay?.cursor(from.id, m.x, m.y);
                injector?.inject({ kind: m.kind, x: m.x, y: m.y });
                break;
              case "wheel":
                overlay?.cursor(from.id, m.x, m.y);
                injector?.inject({ kind: "wheel", x: m.x, y: m.y, dx: m.dx, dy: m.dy });
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
    }
  },
});
