import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ClientMessage,
  MAX_MESSAGE_BYTES,
  parseWire,
  type ServerMessage,
} from "@watchalong/protocol";
import { WebSocketServer } from "ws";
import { RateLimiter } from "./rate-limit";
import { type Conn, RoomRegistry } from "./rooms";
import { IceProvider } from "./turn";

const PORT = Number(process.env.PORT ?? 8787);
const WEB_DIST = resolve(fileURLToPath(new URL("../../web/dist", import.meta.url)));

const ice = new IceProvider({
  // Trim: values pasted into dashboards often carry a stray space or newline.
  keyId: process.env.CF_TURN_KEY_ID?.trim(),
  apiToken: process.env.CF_TURN_API_TOKEN?.trim(),
});
const registry = new RoomRegistry({
  iceServers: () => ice.current(),
  maxRooms: Number(process.env.MAX_ROOMS ?? 2_000),
});
/**
 * Browser origins allowed to open the WebSocket (comma-separated). The extension's offscreen
 * document connects with its chrome-extension:// origin. Empty = allow all (local development).
 */
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
const createLimiter = new RateLimiter(Number(process.env.ROOMS_PER_IP_PER_MIN ?? 10), 60_000);
const messageLimiter = new RateLimiter(100, 1_000); // signaling messages per socket per second

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

const http = createServer((req, res) => {
  let url: URL;
  try {
    url = new URL(req.url ?? "/", "http://localhost");
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405).end();
    return;
  }
  if (url.pathname === "/healthz") {
    res.writeHead(200, { "content-type": "text/plain" }).end(`ok rooms=${registry.roomCount}`);
    return;
  }

  // Static guest app with SPA fallback (room links are /r/<roomId>#k=<secret>).
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  const requested = normalize(join(WEB_DIST, pathname));
  const isFile =
    requested.startsWith(WEB_DIST + sep) && existsSync(requested) && statSync(requested).isFile();
  const file = isFile ? requested : join(WEB_DIST, "index.html");
  if (!existsSync(file)) {
    res.writeHead(404).end("Guest app not built. Run `pnpm --filter @watchalong/web build`.");
    return;
  }
  res.writeHead(200, {
    "content-type": MIME[extname(file)] ?? "application/octet-stream",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "cache-control": file.includes(`${sep}assets${sep}`)
      ? "public, max-age=31536000, immutable"
      : "no-cache",
  });
  createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({
  server: http,
  path: "/ws",
  verifyClient: ({ origin }: { origin?: string }) =>
    ALLOWED_ORIGINS.length === 0 || (!!origin && ALLOWED_ORIGINS.includes(origin)),
  maxPayload: MAX_MESSAGE_BYTES * 4,
  perMessageDeflate: false,
});
let socketSeq = 0;

/** A receiver that stops reading must not make us buffer unboundedly. */
const MAX_BUFFERED_BYTES = 1024 * 1024;
const HEARTBEAT_MS = 15_000;
const connectionsPerIp = new Map<string, number>();
const MAX_CONNECTIONS_PER_IP = 40;

wss.on("connection", (ws, req) => {
  const ip =
    (req.headers["fly-client-ip"] as string | undefined) ?? req.socket.remoteAddress ?? "?";
  const open = (connectionsPerIp.get(ip) ?? 0) + 1;
  connectionsPerIp.set(ip, open);
  if (open > MAX_CONNECTIONS_PER_IP) {
    ws.close(1008, "too many connections");
  }
  const socketKey = `s${socketSeq++}`;
  let alive = true;
  let strikes = 0;
  const conn: Conn = {
    send: (message: ServerMessage) => {
      if (ws.readyState !== ws.OPEN) return;
      if (ws.bufferedAmount > MAX_BUFFERED_BYTES) {
        ws.terminate();
        return;
      }
      ws.send(JSON.stringify(message));
    },
    close: () => ws.close(),
  };

  ws.on("pong", () => {
    alive = true;
  });
  // Detect half-open sockets so host grace and guest slots are released on time.
  const heartbeat = setInterval(() => {
    if (!alive) {
      ws.terminate();
      return;
    }
    alive = false;
    ws.ping();
  }, HEARTBEAT_MS);

  ws.on("error", () => ws.terminate());

  ws.on("message", (data) => {
    alive = true;
    if (!messageLimiter.allow(socketKey)) {
      // Persistent offenders are disconnected rather than answered.
      strikes += 1;
      if (strikes > 50) ws.terminate();
      else if (strikes === 1) conn.send({ type: "error", code: "rate-limited" });
      return;
    }
    strikes = 0;
    const parsed = parseWire(ClientMessage, data.toString());
    if (!parsed.ok) {
      conn.send({ type: "error", code: "bad-message", message: parsed.error });
      return;
    }
    if (parsed.value.type === "create-room" && !createLimiter.allow(ip)) {
      conn.send({ type: "error", code: "rate-limited" });
      return;
    }
    registry.handle(conn, parsed.value);
  });

  ws.on("close", () => {
    clearInterval(heartbeat);
    const left = (connectionsPerIp.get(ip) ?? 1) - 1;
    if (left <= 0) connectionsPerIp.delete(ip);
    else connectionsPerIp.set(ip, left);
    registry.disconnect(conn);
  });
});

ice.start().finally(() => {
  http.listen(PORT, () => {
    console.log(
      `cursor-watchalong server on http://localhost:${PORT} (ws at /ws, TURN ${
        ice.turnActive
          ? "on"
          : ice.turnConfigured
            ? "configured but credentials failed: STUN only until a refresh succeeds"
            : "off: STUN only"
      })`,
    );
  });
});

const shutdown = () => {
  ice.stop();
  wss.close();
  http.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3_000).unref();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
