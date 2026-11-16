export interface VideoCandidate {
  visibleArea: number;
  playing: boolean;
  hasSource: boolean;
}

/**
 * Index of the "main" video in a page: the largest visible one, preferring a playing video
 * when two are about the same size (e.g. a muted preview next to the real player).
 * Returns -1 when nothing sensible is on screen.
 */
export function pickMainVideo(candidates: VideoCandidate[]): number {
  let best = -1;
  let bestScore = 0;
  candidates.forEach((c, i) => {
    if (!c.hasSource || c.visibleArea < 64 * 64) return;
    const score = c.visibleArea * (c.playing ? 1.25 : 1);
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  return best;
}
