/**
 * Dev-only harness that runs the extension's in-tab overlay and input injector in a normal
 * page, so Playwright can check what the host's tab (and therefore the stream) shows.
 */
import { InputInjector } from "../../extension/lib/content/input-injector";
import { Overlay } from "../../extension/lib/content/overlay";

const clicks: string[] = [];
document.getElementById("target")?.addEventListener("click", () => clicks.push("target"));
document.getElementById("target")?.addEventListener("dblclick", () => clicks.push("dbl"));

const drawingChanges: boolean[] = [];
const overlay = new Overlay({
  hostName: "Hosty",
  hostColor: "#ff4d6d",
  onDrawingChanged: (d) => drawingChanges.push(d),
});
overlay.setRoster([
  { id: "host0001", name: "Hosty", color: "#ff4d6d", role: "host", canControl: true },
  { id: "guest001", name: "Sam", color: "#4dabf7", role: "guest", canControl: true },
]);
const forwarded: { challenge: string; input: unknown }[] = [];
const injector = new InputInjector({
  ignore: () => document.querySelector("watchalong-overlay"),
  forwardToFrame: (challenge, input) => forwarded.push({ challenge, input }),
  ackProbe: () => {},
});

/** Count opaque pixels in the overlay canvas (closed shadow root, so read via drawImage). */
function overlayInk(): number {
  const host = document.querySelector("watchalong-overlay") as HTMLElement & {
    __canvas?: HTMLCanvasElement;
  };
  const canvas = (overlay as unknown as { canvas: HTMLCanvasElement }).canvas;
  void host;
  const ctx = canvas.getContext("2d");
  if (!ctx) return 0;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let n = 0;
  for (let i = 3; i < data.length; i += 4) if ((data[i] ?? 0) > 20) n++;
  return n;
}

Object.assign(window, {
  __overlay: { overlay, injector, clicks, drawingChanges, overlayInk, forwarded },
});
