# Cursor Watchalong — Design

Status: implemented through M5 (2026-11-16). This captures every decision made so far; change it
here first when a decision changes.

## 1. Product summary

A Chrome extension lets a **host** share one live tab through an invite link. **Guests** join from a
normal web page (no install), watch the tab's video + audio, see everyone's named cursors, draw
fading marks, and — when the host allows it — control the tab (play/pause/seek, click, scroll).

Target audience: **public Chrome Web Store** release. No accounts, **no database**: all state is
in memory and dies with the room.

## 2. Decisions

| Area | Decision |
| --- | --- |
| Media topology | **P2P mesh**: host extension opens one `RTCPeerConnection` per guest. |
| Room size | Host + **4 guests max**, enforced by the server. |
| Stream quality | **1080p30** capture, adaptive: `degradationPreference: "maintain-framerate"` so WebRTC drops resolution, not frames, under load. |
| Signaling / rooms | **Node + `ws`**, in-memory `Map<roomId, Room>`, also serves the built guest web app. |
| Hosting | **Fly.io**, single instance (rooms are in memory). Dockerfile deploy. |
| NAT traversal | **Cloudflare Realtime TURN**; server mints short-lived ICE credentials per participant. Google STUN as fallback in dev. |
| Data path | **WebRTC DataChannels**, host is the hub. `cursor` channel unordered/unreliable (`maxRetransmits: 0`); `control` channel reliable+ordered (commands, strokes, roster). Host rebroadcasts guest cursors/strokes to other guests. Server sees no room traffic after signaling. |
| Input injection | **Content script** only (no `debugger` permission). `elementFromPoint` + synthetic pointer/mouse events + `el.click()`; `scrollBy` on nearest scrollable ancestor. Events are `isTrusted=false`; accepted limitation. |
| Playback | **Semantic media commands** (`play`, `pause`, `seek`, `seekBy`, `mute`) applied to the page's main `<video>` via the HTMLMediaElement API. |
| Keyboard (guests) | **Mapped shortcuts only**: Space/K → toggle, J/L → ±10s, ←/→ → ±5s, M → mute. Converted to semantic commands; no raw typing in v1. |
| Overlay model | **Host page is the source of truth**: content script draws all cursors + strokes in a shadow-DOM canvas inside the host tab, so they are baked into the captured stream. Guests render **only their own in-progress stroke** locally for instant feedback; everything else arrives via video. |
| Anchoring | Coordinates normalized **0..1 to the shared tab's viewport**. Marks do not follow page scroll. |
| Drawing | Freehand pen in the user's color, fixed width, smoothed. Fades **~3s after pen-up** (`STROKE_FADE_DELAY_MS`, configurable) over 500ms. |
| Draw toggle | Visible **Draw** button + **hold Alt/Option** to draw temporarily. In draw mode, pointer input never reaches the page. |
| Host UI | **Chrome side panel** (not captured): invite link, admit/deny, roster, per-guest control toggles, Draw toggle, End. Toolbar popup only starts sharing / opens the panel. |
| Joining | Invite link `https://<host>/r/<roomId>#k=<secret>`. Secret lives in the URL fragment (never sent in HTTP requests or logs; sent only over the WebSocket). Guest enters a name → **host must Admit**. |
| Default guest rights | **Point + draw**. Host grants **control** per guest or for everyone; host can revoke at any time. |
| Concurrent input | **All commands go through** in arrival order at the host; a toast ("Sam paused") shows who did what. |
| Reconnect | Room survives **30s** after host socket drops. Guests auto-reconnect with a rejoin token (`sessionStorage`) and skip re-approval within 5 min. Host **End** or closing the shared tab ends the room immediately. |
| Comms | No voice or text chat in v1 (assume Discord/a call). |
| DRM | **Warn** on known DRM domains (Netflix, Disney+, Max, Prime Video, Hulu, Apple TV+) in the side panel; sharing still allowed. Netflix sync-mode is a future project. |
| Permissions | Required: `tabCapture`, `offscreen`, `scripting`, `storage`, `sidePanel`, `activeTab`. **Optional host permission `<all_urls>`**, requested on first Start Sharing so the content script survives cross-origin navigation and runs in iframes. Minimum Chrome 119. |
| Iframe input | Never via page-visible messages carrying authority: the parent registers the input with the engine under a one-time challenge, posts only the challenge, and the child's content script claims it over its extension port. |
| UI | shadcn/ui + Tailwind v4 in a shared `packages/ui`, dark theme with a violet accent. |

## 3. Tech stack

- **TypeScript** everywhere, **pnpm workspaces** monorepo.
- `packages/protocol` — **zod** schemas + inferred types for every message; validated at every boundary
  (server, extension, web). Also coordinate math and shared constants.
- `apps/server` — Node, `ws`, serves `apps/web/dist`. Run with `tsx` in dev.
- `apps/web` — **React + Vite** guest app. Cursors/strokes on raw `<canvas>`, not React state.
- `apps/extension` — **WXT** (MV3) + React for side panel/popup; vanilla canvas for the in-page overlay.
- **Biome** for lint + format. **Vitest** for units (TDD for protocol, coordinate mapping, room state
  machine, command handlers). **Playwright** e2e loading the unpacked extension in Chromium with fake
  media (from M1 onward).
- License: MIT.

## 4. Architecture

```
 Host Chrome                                              Guest browser (web page)
┌──────────────────────────────────────────────┐        ┌──────────────────────────┐
│ Side panel (React) ── runtime msgs ──┐       │        │ apps/web (React)         │
│ Popup (start/open panel)             │       │        │  <video> remote stream   │
│                                      ▼       │        │  <canvas> own stroke     │
│ Background SW: room lifecycle, perms,       │        │  toolbar: Draw, playback │
│   tabCapture.getMediaStreamId               │        └───────▲──────────────────┘
│        │                                     │                │ WebRTC media +
│        ▼                                     │                │ DataChannels
│ Offscreen doc: getUserMedia(tab stream),     │◄───────────────┘ (P2P, TURN if needed)
│   RTCPeerConnection per guest, DataChannels, │
│   local audio playback, signaling WebSocket  │──── WebSocket ───► Node server (in-memory rooms,
│        │                                     │                   signaling relay, TURN creds,
│        ▼ runtime msgs                        │◄── WebSocket ───── serves web app)
│ Content script (shared tab): overlay canvas, │
│   input injection, <video> control          │
└──────────────────────────────────────────────┘
```

- **Background service worker** owns the session state machine and the shared `tabId`. It calls
  `chrome.tabCapture.getMediaStreamId({ targetTabId })`, creates the offscreen document (reason
  `USER_MEDIA`), and injects the content script into the shared tab only (`scripting.executeScript`,
  `allFrames: true`), re-injecting on `tabs.onUpdated` status `complete`.
- **Offscreen document** turns the stream id into a `MediaStream` (`chromeMediaSource: "tab"`),
  plays the audio back locally (tab capture mutes the host otherwise), holds the signaling
  WebSocket and all peer connections. Keeps the session alive while the service worker sleeps.
- **Content script** only acts on the shared tab. It never touches other tabs or browser chrome.
- Guests' commands are checked against their permission **at the host** (offscreen doc) before
  being forwarded to the content script. The server enforces admission and room size.

## 5. Coordinates

- Senders normalize pointer positions to the **rendered video content rect** on the guest
  (accounting for `object-fit: contain` letterboxing), giving `{x, y}` in `[0, 1]`.
- The content script maps `{x, y}` → `x * innerWidth, y * innerHeight` of the top frame.
- For clicks inside same-origin or cross-origin iframes, the top-frame script finds the iframe at the
  point, translates to frame-local normalized coordinates, and posts to that frame's content script.
- Pure functions in `packages/protocol/src/geometry.ts`, unit-tested.

## 6. Protocol (sketch — source of truth is `packages/protocol`)

**Signaling (WebSocket, client ↔ server)**
- Host → `create-room` → server ← `room-created { roomId, secret, hostToken, iceServers }`
- Guest → `join { roomId, secret, name, rejoinToken? }` → server → host `join-request { guestId, name }`
- Host → `admit { guestId }` / `deny { guestId }` / `kick { guestId }` / `end-room`
- Server → guest `admitted { guestId, rejoinToken, iceServers }` / `denied` / `room-ended`
- Both → `signal { to, description | candidate }` (relayed verbatim, sender stamped by server)

**Peer (DataChannel, guest ↔ host)**
- `cursor { x, y }` (unreliable) — host rebroadcasts `cursor { id, x, y }`
- `stroke-start { strokeId, x, y }`, `stroke-point { strokeId, x, y }`, `stroke-end { strokeId }`
- `media { action: play | pause | toggle | seek | seekBy | mute, value? }`
- `pointer { kind: click | dblclick, x, y }`, `wheel { x, y, dx, dy }`
- Host → guests: `roster { participants: [{ id, name, color, canControl }] }`,
  `activity { by, text }` (toasts), `denied-command { reason }`

Limits: messages > 16 KB dropped; per-guest rate limits on cursor (60/s) and commands (20/s);
server limits room creation per IP (in memory).

## 7. Session lifecycle

1. Host clicks the toolbar icon on a tab → popup → **Start sharing** (user gesture required by
   `tabCapture`). Optional host permission requested once.
2. Background creates offscreen doc, which opens the WebSocket and sends `create-room`.
3. Side panel shows invite link + DRM warning if applicable.
4. Guest opens link → name → waits → host Admits → WebRTC negotiation (host offers) → video plays.
5. Host toggles control per guest; host draws via side panel Draw button or hold-Alt in page.
6. End: host clicks End, closes the shared tab, or stops capture → `end-room` → guests see
   "Session ended", all peers closed, content script overlay removed.

## 8. Milestones

- **M0** Scaffold monorepo, protocol schemas + geometry with tests, server room state machine with
  tests, skeleton web app and extension that build.
- **M1** Room create / invite / admit; 1080p tab video + audio to **one** guest.
- **M2** DataChannels; semantic playback controls; mapped keyboard shortcuts.
- **M3** Named cursors + fading freehand drawing (host overlay + guest local stroke), Draw toggle + hold-Alt.
- **M4** Clicks + scroll injection; per-guest control permissions; activity toasts.
- **M5** Up to 4 guests; Cloudflare TURN; reconnect grace; DRM warning; Web Store packaging +
  privacy policy; Fly.io deploy.

## 9. Known risks / limitations

- Synthetic events (`isTrusted=false`) are ignored by some sites; no fullscreen, no popups.
- Guests see remote cursors/marks with stream latency and compression.
- Host upload limits 1080p mesh (~4–6 Mbps per guest).
- DRM video shows black to guests.
- Single server instance: deploys/restarts end all rooms.
