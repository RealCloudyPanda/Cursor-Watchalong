import {
  type GuestMessage,
  type Rect,
  STROKE_FADE_DELAY_MS,
  STROKE_FADE_DURATION_MS,
} from "@watchalong/protocol";
import { useCallback, useEffect, useRef } from "react";

interface InputLayerProps {
  rect: Rect;
  viewport: { width: number; height: number } | null;
  color: string;
  drawing: boolean;
  canControl: boolean;
  send: (message: GuestMessage) => boolean;
  onNoControl: () => void;
}

interface LocalStroke {
  points: { x: number; y: number }[];
  endedAt: number | null;
}

const STROKE_WIDTH = 4;
const MAX_POINTS = 2_000;
/** Match the host's per-guest limits regardless of display refresh rate. */
const CURSOR_INTERVAL_MS = 1000 / 60;
const STROKE_POINT_INTERVAL_MS = 1000 / 110;

/**
 * Transparent layer exactly over the host's tab inside the video. It turns the guest's pointer
 * into cursor updates, strokes (draw mode) or clicks and scrolls (interact mode).
 *
 * Only the guest's own strokes are drawn here, for instant feedback. Everyone else's cursors and
 * marks arrive inside the video, because the host's tab draws them.
 */
export function InputLayer({
  rect,
  viewport,
  color,
  drawing,
  canControl,
  send,
  onNoControl,
}: InputLayerProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<LocalStroke[]>([]);
  const active = useRef<{ id: string; stroke: LocalStroke; pointerId: number } | null>(null);
  /** The current mouse gesture began as drawing: swallow its click even if Alt is released. */
  const gestureDrew = useRef(false);
  const lastCursorAt = useRef(0);
  const lastPointAt = useRef(0);
  const strokeSeq = useRef(0);
  const pendingCursor = useRef<{ x: number; y: number } | null>(null);
  const pendingPoints = useRef<{ x: number; y: number }[]>([]);
  const wheel = useRef({ dx: 0, dy: 0, x: 0, y: 0 });
  const flushRaf = useRef(0);
  const drawRaf = useRef(0);

  const norm = useCallback((clientX: number, clientY: number) => {
    const box = layerRef.current?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return null;
    return {
      x: Math.min(1, Math.max(0, (clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (clientY - box.top) / box.height)),
    };
  }, []);

  // ── Local stroke rendering ───────────────────────────────────

  const paint = useCallback(() => {
    drawRaf.current = 0;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const now = performance.now();
    strokes.current = strokes.current.filter(
      (s) => s.endedAt === null || now - s.endedAt < STROKE_FADE_DELAY_MS + STROKE_FADE_DURATION_MS,
    );
    // Scale line width with the stage so it matches the host's stroke as seen in the video.
    const scale = viewport ? w / viewport.width : 1;
    for (const s of strokes.current) {
      const t = s.endedAt === null ? 0 : now - s.endedAt - STROKE_FADE_DELAY_MS;
      ctx.globalAlpha = t > 0 ? Math.max(0, 1 - t / STROKE_FADE_DURATION_MS) : 1;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, STROKE_WIDTH * scale);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const pts = s.points.map((p) => ({ x: p.x * w, y: p.y * h }));
      const first = pts[0];
      if (!first) continue;
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);
      if (pts.length === 1) ctx.lineTo(first.x + 0.1, first.y + 0.1);
      for (let i = 1; i < pts.length - 1; i++) {
        const p = pts[i] as { x: number; y: number };
        const n = pts[i + 1] as { x: number; y: number };
        ctx.quadraticCurveTo(p.x, p.y, (p.x + n.x) / 2, (p.y + n.y) / 2);
      }
      const last = pts[pts.length - 1];
      if (last && pts.length > 1) ctx.lineTo(last.x, last.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (strokes.current.length > 0) drawRaf.current = requestAnimationFrame(paint);
  }, [color, viewport]);

  const repaint = useCallback(() => {
    if (!drawRaf.current) drawRaf.current = requestAnimationFrame(paint);
  }, [paint]);

  useEffect(() => repaint(), [repaint]);
  useEffect(
    () => () => {
      cancelAnimationFrame(drawRaf.current);
      cancelAnimationFrame(flushRaf.current);
    },
    [],
  );

  // ── Batched sending (one cursor / stroke batch / wheel per frame) ─

  const flush = useCallback(() => {
    flushRaf.current = 0;
    const now = performance.now();
    let deferred = false;
    const a = active.current;
    if (a && pendingPoints.current.length > 0) {
      // Time-based budget (~110 points/s): thin the batch to what the budget allows.
      const budget = Math.min(
        2,
        Math.floor((now - lastPointAt.current) / STROKE_POINT_INTERVAL_MS),
      );
      if (budget <= 0) {
        deferred = true;
      } else {
        const pts = pendingPoints.current;
        const picks =
          pts.length <= budget
            ? pts
            : budget === 1
              ? [pts[pts.length - 1]]
              : [pts[Math.floor(pts.length / 2)], pts[pts.length - 1]];
        for (const p of picks) {
          if (p) send({ type: "stroke-point", strokeId: a.id, x: p.x, y: p.y });
        }
        lastPointAt.current = now;
        pendingPoints.current = [];
      }
      pendingCursor.current = null;
    } else if (pendingCursor.current) {
      if (now - lastCursorAt.current >= CURSOR_INTERVAL_MS) {
        send({ type: "cursor", ...pendingCursor.current });
        lastCursorAt.current = now;
        pendingCursor.current = null;
      } else {
        deferred = true;
      }
    }

    const wh = wheel.current;
    if (wh.dx !== 0 || wh.dy !== 0) {
      const factor = viewport ? viewport.height / rect.height : 1;
      send({
        type: "wheel",
        x: wh.x,
        y: wh.y,
        dx: clampDelta(wh.dx * factor),
        dy: clampDelta(wh.dy * factor),
      });
      wheel.current = { dx: 0, dy: 0, x: wh.x, y: wh.y };
    }
    if (deferred) flushRaf.current = requestAnimationFrame(() => flushRef.current());
  }, [send, viewport, rect.height]);
  const flushRef = useRef(flush);
  flushRef.current = flush;

  const schedule = useCallback(() => {
    if (!flushRaf.current) flushRaf.current = requestAnimationFrame(flush);
  }, [flush]);

  // ── Pointer handlers ─────────────────────────────────────────

  const endStroke = useCallback(
    (e?: { pointerId: number }) => {
      const a = active.current;
      if (!a || (e && e.pointerId !== a.pointerId)) return;
      // Drain the stroke's last point now (ignoring the budget) so nothing deferred can leak
      // into the next stroke, then end it.
      cancelAnimationFrame(flushRaf.current);
      flushRaf.current = 0;
      const last = pendingPoints.current[pendingPoints.current.length - 1];
      if (last) send({ type: "stroke-point", strokeId: a.id, x: last.x, y: last.y });
      pendingPoints.current = [];
      a.stroke.endedAt = performance.now();
      active.current = null;
      send({ type: "stroke-end", strokeId: a.id });
      repaint();
    },
    [repaint, send],
  );

  // While the pen is down but still, re-send the last point so the host doesn't treat the
  // stroke as abandoned (it ends strokes that go quiet for 5s).
  useEffect(() => {
    const id = setInterval(() => {
      const a = active.current;
      const last = a?.stroke.points[a.stroke.points.length - 1];
      if (a && last) send({ type: "stroke-point", strokeId: a.id, x: last.x, y: last.y });
    }, 2_000);
    return () => clearInterval(id);
  }, [send]);

  useEffect(() => {
    if (!drawing) endStroke();
  }, [drawing, endStroke]);

  const onPointerDown = (e: React.PointerEvent) => {
    gestureDrew.current = drawing;
    // One stroke at a time: ignore extra fingers/pens while a stroke is in progress.
    if (!drawing || e.button !== 0 || active.current) return;
    const p = norm(e.clientX, e.clientY);
    if (!p) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const id = `s${Date.now().toString(36)}${(++strokeSeq.current).toString(36)}`.slice(0, 32);
    const stroke: LocalStroke = { points: [p], endedAt: null };
    strokes.current.push(stroke);
    active.current = { id, stroke, pointerId: e.pointerId };
    send({ type: "stroke-start", strokeId: id, x: p.x, y: p.y });
    repaint();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    const a = active.current;
    if (a && e.pointerId !== a.pointerId) return;
    for (const ev of events) {
      const p = norm(ev.clientX, ev.clientY);
      if (!p) continue;
      if (a) {
        if (a.stroke.points.length < MAX_POINTS) a.stroke.points.push(p);
        pendingPoints.current.push(p);
      } else {
        pendingCursor.current = p;
      }
    }
    if (a) repaint();
    schedule();
  };

  const onClick = (e: React.MouseEvent) => {
    const drew = gestureDrew.current;
    gestureDrew.current = false;
    if (drawing || drew) return;
    const p = norm(e.clientX, e.clientY);
    if (!p) return;
    if (!canControl) {
      onNoControl();
      return;
    }
    send({ type: "pointer", kind: e.detail === 2 ? "dblclick" : "click", x: p.x, y: p.y });
  };

  // Wheel needs a non-passive listener so the guest page itself doesn't scroll.
  useEffect(() => {
    const el = layerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (drawing) return;
      if (!canControl) {
        onNoControl();
        return;
      }
      const p = norm(e.clientX, e.clientY);
      if (!p) return;
      const unit =
        e.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : e.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? el.clientHeight
            : 1;
      wheel.current = {
        dx: wheel.current.dx + e.deltaX * unit,
        dy: wheel.current.dy + e.deltaY * unit,
        x: p.x,
        y: p.y,
      };
      schedule();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [drawing, canControl, norm, onNoControl, schedule]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard control goes through global shortcuts
    <div
      ref={layerRef}
      role="application"
      aria-label="Shared tab. Move to point, click to interact, hold Alt to draw."
      className="absolute touch-none select-none"
      style={{
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        cursor: drawing ? "crosshair" : "default",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endStroke(e)}
      onPointerCancel={(e) => endStroke(e)}
      onLostPointerCapture={(e) => endStroke(e)}
      onPointerLeave={() => {
        if (!active.current) send({ type: "cursor-leave" });
      }}
      onClick={onClick}
      data-testid="input-layer"
    >
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 size-full" />
    </div>
  );
}

const clampDelta = (n: number) => Math.max(-5_000, Math.min(5_000, Math.round(n)));
