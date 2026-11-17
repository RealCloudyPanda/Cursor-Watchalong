import {
  type Participant,
  STROKE_FADE_DELAY_MS,
  STROKE_FADE_DURATION_MS,
} from "@watchalong/protocol";

/**
 * The shared overlay drawn inside the host's tab. Because it lives in the page, tab capture
 * bakes it into the stream, so guests see exactly what the host sees.
 *
 * It is a single full-viewport canvas in a closed shadow root, promoted to the browser's top
 * layer (popover="manual") so it stays above fullscreen video and the page's own popups.
 * Pointer events pass through unless the host is drawing.
 */

/** Positions are normalized (0..1) so cursors stay put when the viewport resizes. */
interface CursorState {
  x: number;
  y: number;
  tx: number;
  ty: number;
  lastMove: number;
  visible: boolean;
}

interface Stroke {
  owner: string;
  color: string;
  points: { x: number; y: number }[];
  endedAt: number | null;
  lastActivity: number;
}

interface Ripple {
  x: number;
  y: number;
  color: string;
  at: number;
}

const CURSOR_IDLE_HIDE_MS = 8_000;
const MAX_POINTS_PER_STROKE = 2_000;
const MAX_STROKES_PER_PERSON = 40;
const RIPPLE_MS = 600;
const STROKE_WIDTH = 4;
const HOST_ID = "__host";
/** A stroke that stops receiving points without an end (lost message, rogue guest) is ended. */
const ABANDONED_STROKE_MS = 5_000;

export interface OverlayOptions {
  hostColor: string;
  hostName: string;
  /** Host toggled draw mode from inside the page (hold Alt / press Escape). */
  onDrawingChanged: (drawing: boolean) => void;
}

export class Overlay {
  private host: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private roster = new Map<string, Participant>();
  private cursors = new Map<string, CursorState>();
  private strokes = new Map<string, Stroke>();
  private ripples: Ripple[] = [];
  private raf = 0;
  private drawingPinned = false;
  private altHeld = false;
  private hostStroke: string | null = null;
  private hostPointer: number | null = null;
  /** The current mouse gesture began as drawing; swallow its click even if Alt was released. */
  private gestureWasDrawing = false;
  private hostStrokeSeq = 0;
  private disposers: (() => void)[] = [];

  constructor(private options: OverlayOptions) {
    this.host = document.createElement("watchalong-overlay");
    this.applyHostStyles();
    const shadow = this.host.attachShadow({ mode: "closed" });
    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;";
    shadow.append(this.canvas);
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("2d canvas unavailable");
    this.ctx = ctx;

    (document.documentElement ?? document.body).append(this.host);
    this.promote();
    this.resize();

    this.listen(window, "resize", () => this.resize());
    this.listen(document, "fullscreenchange", () => this.promote());
    this.listen(window, "pointermove", (e) => this.trackHostPointer(e as PointerEvent), true);
    this.listen(document, "pointerleave", () => this.hideCursor(HOST_ID));
    this.listen(window, "blur", () => this.setAlt(false));
    this.listen(window, "keydown", (e) => this.onKey(e as KeyboardEvent, true), true);
    this.listen(window, "keyup", (e) => this.onKey(e as KeyboardEvent, false), true);
    // Drawing input is handled in the capture phase on window and swallowed there, so page
    // handlers (document/window listeners, click handlers) never see a drawing gesture.
    this.listen(window, "pointerdown", (e) => this.hostDrawStart(e as PointerEvent), true);
    this.listen(window, "pointermove", (e) => this.hostDrawMove(e as PointerEvent), true);
    this.listen(window, "pointerup", (e) => this.hostDrawEnd(e), true);
    this.listen(window, "pointercancel", (e) => this.hostDrawEnd(e), true);
    for (const type of ["mousedown", "mouseup", "click", "dblclick", "contextmenu", "auxclick"]) {
      this.listen(window, type, (e) => this.swallow(e), true);
    }
  }

  // ── Public API (driven by the host engine) ───────────────────

  /** The overlay's host element, which input injection must never target. */
  get element(): HTMLElement {
    return this.host;
  }

  setRoster(participants: Participant[]) {
    this.roster = new Map(participants.filter((p) => p.role === "guest").map((p) => [p.id, p]));
    for (const id of [...this.cursors.keys()]) {
      if (id !== HOST_ID && !this.roster.has(id)) this.removeParticipant(id);
    }
  }

  setHost(name: string, color: string) {
    this.options.hostName = name;
    this.options.hostColor = color;
  }

  cursor(id: string, x: number, y: number) {
    const p = { x, y };
    const c = this.cursors.get(id);
    const now = performance.now();
    if (!c?.visible) {
      this.cursors.set(id, { x: p.x, y: p.y, tx: p.x, ty: p.y, lastMove: now, visible: true });
    } else {
      c.tx = p.x;
      c.ty = p.y;
      c.lastMove = now;
    }
    this.kick();
  }

  hideCursor(id: string) {
    const c = this.cursors.get(id);
    if (c) c.visible = false;
    this.kick();
  }

  strokeStart(owner: string, strokeId: string, x: number, y: number) {
    const color = owner === HOST_ID ? this.options.hostColor : this.roster.get(owner)?.color;
    if (!color) return;
    const key = `${owner}:${strokeId}`;
    const mine = [...this.strokes.entries()].filter(([, s]) => s.owner === owner);
    const now = performance.now();
    // One unfinished stroke per person: a new start ends the previous one.
    for (const [, s] of mine) if (s.endedAt === null) s.endedAt = now;
    if (mine.length >= MAX_STROKES_PER_PERSON) {
      const oldest = mine[0];
      if (oldest) this.strokes.delete(oldest[0]);
    }
    this.strokes.set(key, { owner, color, points: [{ x, y }], endedAt: null, lastActivity: now });
    this.kick();
  }

  strokePoint(owner: string, strokeId: string, x: number, y: number) {
    const s = this.strokes.get(`${owner}:${strokeId}`);
    if (!s || s.endedAt !== null || s.points.length >= MAX_POINTS_PER_STROKE) return;
    s.points.push({ x, y });
    s.lastActivity = performance.now();
    this.kick();
  }

  strokeEnd(owner: string, strokeId: string) {
    const s = this.strokes.get(`${owner}:${strokeId}`);
    if (s && s.endedAt === null) s.endedAt = performance.now();
    this.kick();
  }

  ripple(owner: string, x: number, y: number) {
    const color = this.roster.get(owner)?.color ?? this.options.hostColor;
    this.ripples.push({ x, y, color, at: performance.now() });
    this.kick();
  }

  removeParticipant(id: string) {
    this.cursors.delete(id);
    for (const s of this.strokes.values()) {
      if (s.owner === id && s.endedAt === null) s.endedAt = performance.now();
    }
    this.kick();
  }

  /** Alt held/released while keyboard focus is inside an iframe (relayed by the engine). */
  setAltHeld(held: boolean) {
    this.setAlt(held);
  }

  /** Escape pressed inside an iframe. */
  cancelPinnedDrawing() {
    if (!this.drawingPinned) return;
    this.drawingPinned = false;
    this.updatePointerMode();
    this.options.onDrawingChanged(false);
  }

  /** Draw mode toggled from the side panel. */
  setDrawing(drawing: boolean) {
    this.drawingPinned = drawing;
    this.updatePointerMode();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    for (const d of this.disposers.splice(0)) d();
    this.host.remove();
  }

  // ── Host input ───────────────────────────────────────────────

  private get drawing() {
    return this.drawingPinned || this.altHeld;
  }

  private onKey(e: KeyboardEvent, down: boolean) {
    if (e.key === "Alt") {
      this.setAlt(down);
      if (down) e.preventDefault();
    } else if (down && e.key === "Escape" && this.drawingPinned) {
      this.drawingPinned = false;
      this.updatePointerMode();
      this.options.onDrawingChanged(false);
    }
  }

  private setAlt(held: boolean) {
    if (this.altHeld === held) return;
    this.altHeld = held;
    if (!held) this.hostDrawEnd();
    this.updatePointerMode();
  }

  private updatePointerMode() {
    const on = this.drawing;
    this.host.style.setProperty("pointer-events", on ? "auto" : "none", "important");
    this.host.style.setProperty("cursor", on ? "crosshair" : "default", "important");
    if (!on) this.hostDrawEnd();
  }

  private trackHostPointer(e: PointerEvent) {
    const n = this.toNorm(e.clientX, e.clientY);
    this.cursor(HOST_ID, n.x, n.y);
  }

  private isOverlayEvent(e: Event) {
    return e.composedPath().includes(this.host);
  }

  private swallow(e: Event) {
    if ((this.drawing || this.gestureWasDrawing) && this.isOverlayEvent(e)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
    if (e.type === "click" || e.type === "contextmenu") this.gestureWasDrawing = false;
  }

  private hostDrawStart(e: PointerEvent) {
    if (!this.drawing || !this.isOverlayEvent(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.button !== 0 || this.hostPointer !== null) return;
    this.gestureWasDrawing = true;
    this.hostPointer = e.pointerId;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // pointer already gone
    }
    this.hostStroke = `h${++this.hostStrokeSeq}`;
    const n = this.toNorm(e.clientX, e.clientY);
    this.strokeStart(HOST_ID, this.hostStroke, n.x, n.y);
  }

  private hostDrawMove(e: PointerEvent) {
    if (!this.hostStroke || e.pointerId !== this.hostPointer) return;
    e.stopImmediatePropagation();
    for (const ev of e.getCoalescedEvents?.() ?? [e]) {
      const n = this.toNorm(ev.clientX, ev.clientY);
      this.strokePoint(HOST_ID, this.hostStroke, n.x, n.y);
    }
  }

  private hostDrawEnd(e?: Event) {
    if (e instanceof PointerEvent) {
      if (e.pointerId !== this.hostPointer) return;
      e.stopImmediatePropagation();
    }
    this.hostPointer = null;
    if (!this.hostStroke) return;
    this.strokeEnd(HOST_ID, this.hostStroke);
    this.hostStroke = null;
  }

  // ── Rendering ────────────────────────────────────────────────

  private kick() {
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    this.raf = 0;
    const { ctx, canvas } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    let animating = false;
    animating = this.drawStrokes(now) || animating;
    animating = this.drawRipples(now) || animating;
    animating = this.drawCursors(now) || animating;
    if (animating) this.kick();
  };

  private drawStrokes(now: number): boolean {
    const { ctx } = this;
    let alive = false;
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (const [key, s] of this.strokes) {
      let alpha = 1;
      if (s.endedAt === null && now - s.lastActivity > ABANDONED_STROKE_MS) s.endedAt = now;
      if (s.endedAt !== null) {
        const t = now - s.endedAt - STROKE_FADE_DELAY_MS;
        if (t >= STROKE_FADE_DURATION_MS) {
          this.strokes.delete(key);
          continue;
        }
        if (t > 0) alpha = 1 - t / STROKE_FADE_DURATION_MS;
      }
      alive = true;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = STROKE_WIDTH;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.shadowColor = "rgba(0,0,0,0.45)";
      ctx.shadowBlur = 3;
      const pts = s.points.map((p) => ({ x: p.x * w, y: p.y * h }));
      ctx.beginPath();
      const first = pts[0];
      if (!first) continue;
      ctx.moveTo(first.x, first.y);
      if (pts.length === 1) {
        ctx.lineTo(first.x + 0.1, first.y + 0.1);
      } else {
        // Quadratic curves through midpoints give a smooth line from sparse samples.
        for (let i = 1; i < pts.length - 1; i++) {
          const p = pts[i] as { x: number; y: number };
          const n = pts[i + 1] as { x: number; y: number };
          ctx.quadraticCurveTo(p.x, p.y, (p.x + n.x) / 2, (p.y + n.y) / 2);
        }
        const last = pts[pts.length - 1] as { x: number; y: number };
        ctx.lineTo(last.x, last.y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    return alive;
  }

  private drawRipples(now: number): boolean {
    const { ctx } = this;
    this.ripples = this.ripples.filter((r) => now - r.at < RIPPLE_MS);
    for (const r of this.ripples) {
      const t = (now - r.at) / RIPPLE_MS;
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(r.x * window.innerWidth, r.y * window.innerHeight, 6 + t * 22, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return this.ripples.length > 0;
  }

  private drawCursors(now: number): boolean {
    let moving = false;
    for (const [id, c] of this.cursors) {
      if (!c.visible) continue;
      const idle = now - c.lastMove;
      if (idle > CURSOR_IDLE_HIDE_MS) {
        c.visible = false;
        continue;
      }
      // Ease toward the latest reported position for smooth motion between updates.
      c.x += (c.tx - c.x) * 0.45;
      c.y += (c.ty - c.y) * 0.45;
      if (Math.abs(c.tx - c.x) > 0.0002 || Math.abs(c.ty - c.y) > 0.0002) moving = true;
      const fade = idle > CURSOR_IDLE_HIDE_MS - 1_000 ? (CURSOR_IDLE_HIDE_MS - idle) / 1_000 : 1;
      const isHost = id === HOST_ID;
      const p = this.roster.get(id);
      const color = isHost ? this.options.hostColor : p?.color;
      const name = isHost ? this.options.hostName : p?.name;
      if (!color || !name) continue;
      this.drawCursor(c.x * window.innerWidth, c.y * window.innerHeight, color, name, fade);
      moving = true; // keep ticking so idle cursors fade out on time
    }
    return moving;
  }

  private drawCursor(x: number, y: number, color: string, name: string, alpha: number) {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.translate(x, y);
    // Arrow
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 17);
    ctx.lineTo(4.5, 13);
    ctx.lineTo(7.5, 20);
    ctx.lineTo(10.5, 18.6);
    ctx.lineTo(7.6, 11.8);
    ctx.lineTo(13, 11.8);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 4;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#fff";
    ctx.stroke();
    // Name pill
    ctx.font = "600 12px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
    const label = name.length > 24 ? `${name.slice(0, 23)}…` : name;
    const tw = ctx.measureText(label).width;
    const px = 14;
    const py = 20;
    const pw = tw + 14;
    const ph = 20;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(px, py, pw, ph, 10);
    ctx.fill();
    ctx.fillStyle = readableText(color);
    ctx.textBaseline = "middle";
    ctx.fillText(label, px + 7, py + ph / 2 + 0.5);
    ctx.restore();
  }

  // ── Helpers ──────────────────────────────────────────────────

  private resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.canvas.width = Math.round(window.innerWidth * this.dpr);
    this.canvas.height = Math.round(window.innerHeight * this.dpr);
    this.kick();
  }

  private toNorm(px: number, py: number) {
    return {
      x: Math.min(1, Math.max(0, px / window.innerWidth)),
      y: Math.min(1, Math.max(0, py / window.innerHeight)),
    };
  }

  /** Put the overlay on top of everything, including a fullscreen element. */
  private promote() {
    const fs = document.fullscreenElement;
    const container = document.documentElement ?? document.body;
    if (this.host.parentNode !== container) container.append(this.host);
    if (typeof this.host.showPopover === "function") {
      try {
        if (this.host.matches(":popover-open")) this.host.hidePopover();
        this.host.showPopover();
      } catch {
        // popover unsupported or host detached; fixed positioning still works
      }
    }
    void fs;
    this.resize();
  }

  private applyHostStyles() {
    this.host.setAttribute("popover", "manual");
    const s = this.host.style;
    const set = (k: string, v: string) => s.setProperty(k, v, "important");
    set("position", "fixed");
    set("inset", "0");
    set("width", "100vw");
    set("height", "100vh");
    set("max-width", "none");
    set("max-height", "none");
    set("margin", "0");
    set("padding", "0");
    set("border", "0");
    set("background", "transparent");
    set("overflow", "visible");
    set("z-index", "2147483647");
    set("pointer-events", "none");
    set("display", "block");
    set("contain", "strict");
  }

  private listen(target: EventTarget, type: string, handler: (e: Event) => void, capture = false) {
    target.addEventListener(type, handler, { capture, passive: false });
    this.disposers.push(() => target.removeEventListener(type, handler, { capture }));
  }
}

/** Black or white text, whichever reads better on the given hex color. */
function readableText(hex: string): string {
  const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return "#000";
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => Number.parseInt(h as string, 16) / 255) as [
    number,
    number,
    number,
  ];
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.55 ? "#111" : "#fff";
}
