import { STROKE_FADE_DELAY_MS, STROKE_FADE_DURATION_MS } from "@watchalong/protocol";
import { Button } from "@watchalong/ui/components/ui/button";
import { Pause, PenLine, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface Stroke {
  points: { x: number; y: number }[];
  endedAt: number | null;
}

const FRIENDS = [
  { name: "Ben", color: "#4dabf7", fx: 0.00031, fy: 0.00047, phase: 0 },
  { name: "Cam", color: "#51cf66", fx: 0.00023, fy: 0.00037, phase: 2.1 },
];
const ME = "#ff4d6d";

/**
 * A playable mock of a session: friends' cursors drift around, you can draw marks that fade
 * after ~3 seconds (same timing as the real app), and the play button toggles the "video".
 */
export function LiveDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(true);
  const playingRef = useRef(true);
  playingRef.current = playing;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const strokes: Stroke[] = [];
    let active: Stroke | null = null;
    let raf = 0;
    let t0 = performance.now();
    let elapsed = 0;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const pos = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    };
    const down = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      active = { points: [pos(e)], endedAt: null };
      strokes.push(active);
    };
    const move = (e: PointerEvent) => {
      if (active) active.points.push(pos(e));
    };
    const up = () => {
      if (active) active.endedAt = performance.now();
      active = null;
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);

    const frame = (now: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (playingRef.current && !reduceMotion) elapsed += now - t0;
      t0 = now;
      drawScene(ctx, w, h, elapsed);

      // Strokes, fading like the real overlay.
      for (let i = strokes.length - 1; i >= 0; i--) {
        const s = strokes[i] as Stroke;
        const fade = s.endedAt === null ? 0 : now - s.endedAt - STROKE_FADE_DELAY_MS;
        if (fade >= STROKE_FADE_DURATION_MS) {
          strokes.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = fade > 0 ? 1 - fade / STROKE_FADE_DURATION_MS : 1;
        ctx.strokeStyle = ME;
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        s.points.forEach((p, k) => {
          if (k) ctx.lineTo(p.x * w, p.y * h);
          else ctx.moveTo(p.x * w, p.y * h);
        });
        if (s.points.length === 1)
          ctx.lineTo((s.points[0]?.x ?? 0) * w + 0.1, (s.points[0]?.y ?? 0) * h);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Friends' cursors drifting around.
      const t = reduceMotion ? 0 : now;
      for (const f of FRIENDS) {
        const x = (0.5 + 0.36 * Math.sin(t * f.fx + f.phase)) * w;
        const y = (0.45 + 0.3 * Math.sin(t * f.fy + f.phase * 1.7)) * h;
        drawCursor(ctx, x, y, f.color, f.name);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
    };
  }, []);

  return (
    <figure className="overflow-hidden rounded-2xl border border-border/60 bg-black shadow-2xl shadow-primary/10">
      <div className="flex items-center gap-2 border-b border-white/10 bg-background/80 px-4 py-2.5 text-xs text-muted-foreground">
        <span className="size-2 rounded-full bg-success" />
        Live demo
        <span className="ml-auto inline-flex items-center gap-1.5">
          <PenLine className="size-3.5" /> Drag on the video to draw
        </span>
      </div>
      <canvas
        ref={canvasRef}
        className="block aspect-video w-full cursor-crosshair touch-none"
        aria-label="Interactive demo: drag to draw marks that fade after a few seconds"
      />
      <figcaption className="flex items-center gap-3 border-t border-white/10 bg-background/80 px-3 py-2">
        <Button
          size="icon"
          className="size-9 rounded-full"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? "Pause demo" : "Play demo"}
        >
          {playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}
        </Button>
        <span className="text-xs text-muted-foreground">
          {playing ? "Ben and Cam are watching with you" : "Paused for everyone"}
        </span>
        <span className="ml-auto flex -space-x-2">
          {[ME, ...FRIENDS.map((f) => f.color)].map((c) => (
            <span
              key={c}
              className="size-6 rounded-full ring-2 ring-background"
              style={{ background: c }}
            />
          ))}
        </span>
      </figcaption>
    </figure>
  );
}

function drawScene(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#1e1b4b");
  sky.addColorStop(0.55, "#be185d");
  sky.addColorStop(1, "#f59e0b");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  const sx = w * (0.6 + 0.05 * Math.sin(t / 3000));
  const sun = ctx.createRadialGradient(sx, h * 0.6, 4, sx, h * 0.6, h * 0.25);
  sun.addColorStop(0, "#fde68a");
  sun.addColorStop(0.45, "#fbbf24");
  sun.addColorStop(1, "rgba(251,191,36,0)");
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, w, h);
  const ridge = (base: number, amp: number, color: string, speed: number) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, h);
    const y = (x: number) => base * h + Math.sin(x / (w / 7) + t * speed) * amp * h;
    for (let x = 0; x < w; x += 8) ctx.lineTo(x, y(x));
    ctx.lineTo(w, y(w));
    ctx.lineTo(w, h);
    ctx.fill();
  };
  ridge(0.68, 0.04, "#4c1d95", 0.0002);
  ridge(0.78, 0.03, "#2e1065", 0.0004);
  ridge(0.89, 0.02, "#0f0a1e", 0.0007);
}

function drawCursor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  name: string,
) {
  ctx.save();
  ctx.translate(x, y);
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
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.font = "600 12px ui-sans-serif, system-ui, sans-serif";
  const tw = ctx.measureText(name).width;
  ctx.beginPath();
  ctx.roundRect(14, 20, tw + 14, 20, 10);
  ctx.fill();
  ctx.fillStyle = "#111";
  ctx.textBaseline = "middle";
  ctx.fillText(name, 21, 30.5);
  ctx.restore();
}
