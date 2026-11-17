/**
 * Turns a guest's click or scroll at a normalized point into synthetic events in this frame.
 * Events are untrusted (isTrusted=false): most sites react to them, a few ignore them, and
 * fullscreen/pop-ups can't be triggered. That's the accepted trade-off for not requiring the
 * `debugger` permission.
 *
 * When the point lands on an <iframe>, the input is handed to that frame's content script
 * through the extension (never through page-visible messages), so pages can't forge it.
 */

export const PROBE_KEY = "__watchalongProbe";

export type InjectedInput =
  | { kind: "click" | "dblclick"; x: number; y: number }
  | { kind: "wheel"; x: number; y: number; dx: number; dy: number };

/**
 * Input for an iframe never travels through page-visible postMessage. Instead the parent
 * registers the input with the extension under a one-time challenge and posts only the
 * challenge to the child frame; the child's content script echoes the challenge over its own
 * extension port, and the engine delivers the input to exactly that frame.
 */
export interface InputInjectorOptions {
  /** Our own overlay element, which must never be the click target. */
  ignore: () => Element | null;
  /** Register input for the iframe that will acknowledge `challenge`. */
  forwardToFrame: (challenge: string, input: InjectedInput) => void;
  /** This frame received a probe from its parent: tell the engine. */
  ackProbe: (challenge: string) => void;
}

export class InputInjector {
  private onMessage = (event: MessageEvent) => {
    if (event.source !== window.parent || window.parent === window) return;
    const data = event.data as Record<string, unknown> | null;
    const challenge = data?.[PROBE_KEY];
    if (typeof challenge === "string" && /^[0-9a-f-]{36}$/.test(challenge)) {
      this.options.ackProbe(challenge);
    }
  };

  constructor(private options: InputInjectorOptions) {
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
    const ignored = this.options.ignore();
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
    if (!frame.contentWindow || frame.offsetWidth <= 0 || frame.offsetHeight <= 0) return;
    // Undo CSS transforms (e.g. scale) before removing borders and normalizing.
    const sx = rect.width / frame.offsetWidth;
    const sy = rect.height / frame.offsetHeight;
    const lx = (cx - rect.left) / sx - frame.clientLeft;
    const ly = (cy - rect.top) / sy - frame.clientTop;
    const w = frame.clientWidth;
    const h = frame.clientHeight;
    if (w <= 0 || h <= 0) return;
    const challenge = crypto.randomUUID();
    this.options.forwardToFrame(challenge, { ...input, x: clamp01(lx / w), y: clamp01(ly / h) });
    frame.contentWindow.postMessage({ [PROBE_KEY]: challenge }, "*");
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
    // Only an element that can still move in the requested direction takes the scroll;
    // otherwise it chains outward, like real wheel input.
    const canY =
      dy !== 0 &&
      /(auto|scroll|overlay)/.test(style.overflowY) &&
      (dy > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0);
    const canX =
      dx !== 0 &&
      /(auto|scroll|overlay)/.test(style.overflowX) &&
      (dx > 0 ? el.scrollLeft + el.clientWidth < el.scrollWidth - 1 : el.scrollLeft > 0);
    if (canY || canX) return el;
    if (/(contain|none)/.test(style.overscrollBehavior)) return el;
  }
  return document.scrollingElement ?? document.documentElement;
}

function parentOf(el: Element): Element | null {
  if (el.parentElement) return el.parentElement;
  const root = el.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
