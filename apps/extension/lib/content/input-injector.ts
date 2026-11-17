/**
 * Turns a guest's click or scroll at a normalized point into synthetic events in this frame.
 * Events are untrusted (isTrusted=false): most sites react to them, a few ignore them, and
 * fullscreen/pop-ups can't be triggered. That's the accepted trade-off for not requiring the
 * `debugger` permission.
 *
 * When the point lands on an <iframe>, the input is forwarded to that frame's content script
 * with a per-session nonce, so the page itself can't forge it.
 */

export const FRAME_MESSAGE_KEY = "__watchalongInput";

export type InjectedInput =
  | { kind: "click" | "dblclick"; x: number; y: number }
  | { kind: "wheel"; x: number; y: number; dx: number; dy: number };

interface FrameMessage {
  [FRAME_MESSAGE_KEY]: true;
  nonce: string;
  input: InjectedInput;
}

export class InputInjector {
  private onMessage = (event: MessageEvent) => {
    // Only accept input forwarded by our own script in the parent frame.
    if (event.source !== window.parent || window.parent === window) return;
    const data = event.data as Partial<FrameMessage> | null;
    if (data?.[FRAME_MESSAGE_KEY] !== true || data.nonce !== this.nonce) return;
    const input = data.input;
    if (!input || !isUnit(input.x) || !isUnit(input.y)) return;
    if (input.kind !== "click" && input.kind !== "dblclick" && input.kind !== "wheel") return;
    if (input.kind === "wheel" && !(Number.isFinite(input.dx) && Number.isFinite(input.dy))) return;
    this.inject(input);
  };

  constructor(
    private nonce: string,
    /** Our own overlay element, which must never be the click target. */
    private ignore: () => Element | null,
  ) {
    window.addEventListener("message", this.onMessage);
  }

  dispose() {
    window.removeEventListener("message", this.onMessage);
  }

  inject(input: InjectedInput) {
    const cx = input.x * window.innerWidth;
    const cy = input.y * window.innerHeight;
    const target = this.hitTest(cx, cy);
    if (!target) return;

    if (target instanceof HTMLIFrameElement || target instanceof HTMLFrameElement) {
      this.forwardToFrame(target, cx, cy, input);
      return;
    }
    if (input.kind === "wheel") this.wheel(target, cx, cy, input.dx, input.dy);
    else this.click(target, cx, cy, input.kind === "dblclick");
  }

  private hitTest(cx: number, cy: number): Element | null {
    const ignored = this.ignore();
    let el =
      document.elementsFromPoint(cx, cy).find((e) => e !== ignored && !ignored?.contains(e)) ??
      null;
    // Descend into open shadow roots so web components receive the event on the real target.
    while (el?.shadowRoot) {
      const inner = el.shadowRoot.elementFromPoint(cx, cy);
      if (!inner || inner === el) break;
      el = inner;
    }
    return el;
  }

  private forwardToFrame(
    frame: HTMLIFrameElement | HTMLFrameElement,
    cx: number,
    cy: number,
    input: InjectedInput,
  ) {
    const rect = frame.getBoundingClientRect();
    const left = rect.left + frame.clientLeft;
    const top = rect.top + frame.clientTop;
    const w = frame.clientWidth;
    const h = frame.clientHeight;
    if (w <= 0 || h <= 0 || !frame.contentWindow) return;
    const message: FrameMessage = {
      [FRAME_MESSAGE_KEY]: true,
      nonce: this.nonce,
      input: { ...input, x: clamp01((cx - left) / w), y: clamp01((cy - top) / h) },
    };
    frame.contentWindow.postMessage(message, "*");
  }

  private click(target: Element, cx: number, cy: number, double: boolean) {
    const base = {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: cx,
      clientY: cy,
      screenX: window.screenX + cx,
      screenY: window.screenY + cy,
      view: window,
    };
    const pointer = { ...base, pointerId: 1, pointerType: "mouse", isPrimary: true };

    target.dispatchEvent(new PointerEvent("pointerover", pointer));
    target.dispatchEvent(new MouseEvent("mouseover", base));
    target.dispatchEvent(new PointerEvent("pointermove", pointer));
    target.dispatchEvent(new MouseEvent("mousemove", base));

    const once = (detail: number) => {
      const downOk = target.dispatchEvent(
        new PointerEvent("pointerdown", { ...pointer, button: 0, buttons: 1 }),
      );
      const mouseDownOk =
        downOk &&
        target.dispatchEvent(
          new MouseEvent("mousedown", { ...base, button: 0, buttons: 1, detail }),
        );
      if (mouseDownOk) focusFor(target);
      target.dispatchEvent(new PointerEvent("pointerup", { ...pointer, button: 0, buttons: 0 }));
      target.dispatchEvent(new MouseEvent("mouseup", { ...base, button: 0, buttons: 0, detail }));
      target.dispatchEvent(new MouseEvent("click", { ...base, button: 0, buttons: 0, detail }));
    };

    // A guest's double-click arrives as "click" then "dblclick": the first click was already
    // replayed, so "dblclick" replays only the second click plus the dblclick event.
    if (double) {
      once(2);
      target.dispatchEvent(new MouseEvent("dblclick", { ...base, button: 0, detail: 2 }));
    } else {
      once(1);
    }
  }

  private wheel(target: Element, cx: number, cy: number, dx: number, dy: number) {
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: cx,
      clientY: cy,
      deltaX: dx,
      deltaY: dy,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      view: window,
    });
    // Untrusted wheel events don't scroll by themselves. If the page didn't take over the
    // wheel (maps, custom scrollers), scroll the nearest scrollable ancestor ourselves.
    if (!target.dispatchEvent(event)) return;
    const scroller = findScroller(target, dx, dy);
    scroller.scrollBy({ left: dx, top: dy, behavior: "instant" as ScrollBehavior });
  }
}

function focusFor(target: Element) {
  const focusable = target.closest<HTMLElement>(
    "a[href], button, input, select, textarea, summary, [tabindex], [contenteditable='true']",
  );
  focusable?.focus({ preventScroll: true });
}

function findScroller(start: Element, dx: number, dy: number): Element {
  for (let el: Element | null = start; el; el = parentOf(el)) {
    if (el === document.body || el === document.documentElement) break;
    const style = getComputedStyle(el);
    const canY =
      dy !== 0 &&
      /(auto|scroll|overlay)/.test(style.overflowY) &&
      el.scrollHeight > el.clientHeight;
    const canX =
      dx !== 0 && /(auto|scroll|overlay)/.test(style.overflowX) && el.scrollWidth > el.clientWidth;
    if (canY || canX) return el;
  }
  return document.scrollingElement ?? document.documentElement;
}

function parentOf(el: Element): Element | null {
  if (el.parentElement) return el.parentElement;
  const root = el.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const isUnit = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;
