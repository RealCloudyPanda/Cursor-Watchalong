export const MAX_GUESTS = 4;
export const MAX_MESSAGE_BYTES = 16 * 1024;
export const HOST_RECONNECT_GRACE_MS = 30_000;
export const REJOIN_TOKEN_TTL_MS = 5 * 60_000;
export const STROKE_FADE_DELAY_MS = 3_000;
export const STROKE_FADE_DURATION_MS = 500;
export const CURSOR_RATE_PER_SEC = 60;
export const COMMAND_RATE_PER_SEC = 20;
export const MAX_NAME_LENGTH = 32;

export const CAPTURE_CONSTRAINTS = { width: 1920, height: 1080, frameRate: 30 } as const;

/** Domains whose video is usually DRM-protected and captures as black frames. */
export const DRM_DOMAINS = [
  "netflix.com",
  "disneyplus.com",
  "max.com",
  "primevideo.com",
  "amazon.com",
  "hulu.com",
  "tv.apple.com",
] as const;

export function isLikelyDrmHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return DRM_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

/** Cursor colors assigned by the host in join order. */
export const PARTICIPANT_COLORS = ["#ff4d6d", "#4dabf7", "#51cf66", "#fcc419", "#cc5de8"] as const;
