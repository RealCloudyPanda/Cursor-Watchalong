import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { ClientMessage, parseWire, type ServerMessage } from "@watchalong/protocol";
import { WebSocketServer } from "ws";
import { defaultIceServers } from "./ice";
import { RateLimiter } from "./rate-limit";
import { type Conn, RoomRegistry } from "./rooms";

const PORT = Number(process.env.PORT ?? 8787);
const WEB_DIST = resolve(fileURLToPath(new URL("../../web/dist", import.meta.url)));

const registry = new RoomRegistry({ iceServers: defaultIceServers });
const createLimiter = new RateLimiter(10, 60_000); // room creations per IP per minute
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
  const url = new URL(req.url ?? "/", "http://localhost");
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
  });
  createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({ server: http, path: "/ws", maxPayload: 64 * 1024 });
let socketSeq = 0;

wss.on("connection", (ws, req) => {
  const ip =
    (req.headers["fly-client-ip"] as string | undefined) ?? req.socket.remoteAddress ?? "?";
  const socketKey = `s${socketSeq++}`;
  const conn: Conn = {
    send: (message: ServerMessage) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
    },
    close: () => ws.close(),
  };

  ws.on("message", (data) => {
    if (!messageLimiter.allow(socketKey)) {
      conn.send({ type: "error", code: "rate-limited" });
      return;
    }
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

  ws.on("close", () => registry.disconnect(conn));
});

http.listen(PORT, () => {
  console.log(`cursor-watchalong server on http://localhost:${PORT} (ws at /ws)`);
});
