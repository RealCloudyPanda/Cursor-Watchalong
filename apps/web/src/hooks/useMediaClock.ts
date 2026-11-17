import type { MediaState } from "@watchalong/protocol";
import { useEffect, useState } from "react";

/**
 * The host reports playback time about once a second. Between reports, advance the clock
 * locally so the seek bar moves smoothly.
 */
const MAX_EXTRAPOLATION_S = 2;

export function useMediaClock(state: MediaState | null, receivedAt: number): number {
  const [now, setNow] = useState(() => Date.now());
  const playing = !!state && !state.paused && state.hasVideo;

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [playing]);

  if (!state) return 0;
  if (!playing) return state.currentTime;
  // The host reports at least once a second while time advances. If reports stop (buffering,
  // stalls), stop extrapolating instead of running ahead of the real video.
  const elapsed =
    Math.min(Math.max(0, (now - receivedAt) / 1000), MAX_EXTRAPOLATION_S) * state.playbackRate;
  const t = state.currentTime + elapsed;
  return state.duration > 0 ? Math.min(t, state.duration) : t;
}
