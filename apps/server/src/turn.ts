import type { IceServer } from "@watchalong/protocol";

const STUN_ONLY: IceServer[] = [
  { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] },
];

export interface IceProviderOptions {
  keyId?: string;
  apiToken?: string;
  /** Credential lifetime requested from Cloudflare. */
  ttlSeconds?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
  log?: (message: string) => void;
}

/**
 * ICE servers for every participant. With Cloudflare Realtime TURN credentials configured, it
 * mints short-lived TURN credentials and refreshes them well before they expire; otherwise it
 * hands out public STUN only. Synchronous `current()` so the room registry stays synchronous.
 */
export class IceProvider {
  private servers: IceServer[] = STUN_ONLY;
  private expiresAt = 0;
  private refreshing: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly ttl: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly log: (message: string) => void;

  constructor(private options: IceProviderOptions = {}) {
    this.ttl = options.ttlSeconds ?? 24 * 60 * 60;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
    this.log = options.log ?? ((m) => console.warn(m));
  }

  get turnConfigured(): boolean {
    return !!(this.options.keyId && this.options.apiToken);
  }

  /** Fetch credentials now and keep them fresh. Safe to call without TURN configured. */
  async start(): Promise<void> {
    if (!this.turnConfigured) return;
    await this.refresh();
    // Refresh hourly, so any credential handed to a new participant is valid for at least
    // ttl − 1h (≈23h). Already-connected peers keep the credentials they joined with.
    this.timer = setInterval(() => {
      if (this.expiresAt - this.now() < this.ttl * 1000 - 60 * 60_000) void this.refresh();
    }, 5 * 60_000);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  current(): IceServer[] {
    if (this.turnConfigured && this.now() >= this.expiresAt) {
      // Expired (refresh failing): fall back to STUN rather than hand out dead credentials.
      void this.refresh();
      return STUN_ONLY;
    }
    return this.servers;
  }

  refresh(): Promise<void> {
    this.refreshing ??= this.fetchCredentials().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async fetchCredentials(): Promise<void> {
    const { keyId, apiToken } = this.options;
    if (!keyId || !apiToken) return;
    try {
      const res = await this.fetchImpl(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ ttl: this.ttl }),
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!res.ok) throw new Error(`Cloudflare TURN responded ${res.status}`);
      const parsed = parseIceServers(await res.json());
      if (parsed.length === 0) throw new Error("Cloudflare TURN returned no ICE servers");
      this.servers = parsed;
      this.expiresAt = this.now() + this.ttl * 1000;
    } catch (err) {
      this.log(`TURN credential refresh failed: ${err instanceof Error ? err.message : err}`);
    }
  }
}

/** Accepts both `{ iceServers: [...] }` and the older `{ iceServers: { ... } }` shapes. */
export function parseIceServers(body: unknown): IceServer[] {
  const raw = (body as { iceServers?: unknown } | null)?.iceServers;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const out: IceServer[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const { urls, username, credential } = item as Record<string, unknown>;
    const urlList = (Array.isArray(urls) ? urls : [urls]).filter(
      (u): u is string => typeof u === "string" && /^(stun|turns?):/.test(u),
    );
    // Browsers time out on port 53 TURN; drop those URLs.
    const usable = urlList.filter((u) => !/:53(\?|$)/.test(u));
    if (usable.length === 0) continue;
    out.push({
      urls: usable,
      ...(typeof username === "string" ? { username } : {}),
      ...(typeof credential === "string" ? { credential } : {}),
    });
  }
  return out;
}
