# Cursor Watchalong

Share a live Chrome tab through an invite link. Friends join from a regular web page (no install),
see each other's named cursors, draw fading marks over the page, and — when the host allows it —
play, pause, seek, click and scroll in the host's tab.

No accounts, no database: rooms live in memory on a small signaling server, and video, audio,
cursors and drawings flow peer-to-peer over WebRTC.

See [docs/design.md](docs/design.md) for every product and technical decision and the milestone plan.

## Layout

| Path | What |
| --- | --- |
| `packages/protocol` | zod schemas for every signaling + DataChannel message, geometry helpers, constants |
| `apps/server` | Node + `ws` signaling server with in-memory rooms; serves the built guest app |
| `apps/web` | React + Vite guest page (`/r/<roomId>#k=<secret>`) |
| `apps/extension` | WXT (MV3) Chrome extension: background, offscreen capture, popup, side panel |

## Develop

Requires Node 22+ and pnpm 10.

```bash
pnpm install
```

```bash
pnpm dev:server
```

```bash
pnpm dev:web
```

```bash
pnpm dev:ext
```

`dev:ext` launches Chromium with the unpacked extension. Invite links point at `http://localhost:5173`
by default (override with `WXT_PUBLIC_ORIGIN` / `WXT_WS_URL`).

```bash
pnpm test
```

```bash
pnpm typecheck && pnpm lint
```

## Status

M0 (scaffold): protocol, room server with admission/signaling, guest join flow, extension
start-sharing → room → invite link → admit/deny. WebRTC streaming lands in M1.

## License

MIT
