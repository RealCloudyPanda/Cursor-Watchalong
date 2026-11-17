# Privacy Policy

_Last updated: 2026-11-16_

Cursor Watchalong lets a host share one browser tab with guests they invite. This policy
explains what data the extension and its signaling server handle.

## What we don't do

- We don't have accounts, and we don't ask for your email address.
- We don't use a database. Nothing about your sessions is stored after they end.
- We don't sell, share or analyze your data, and we don't use analytics or advertising trackers.

## What is processed while a session is live

| Data | Where it goes | Why |
| --- | --- | --- |
| Video and audio of the **one tab you choose to share** | Sent directly from the host's browser to admitted guests over encrypted WebRTC. If a direct connection isn't possible, it passes through an encrypted TURN relay (Cloudflare) that can't read it. | To show guests your tab |
| Display names you type | Sent to the signaling server and to everyone in the room | To label cursors and the guest list |
| Cursor positions, drawings and control commands | Sent directly between participants over encrypted WebRTC | Pointing, drawing and remote control |
| Room ID, connection setup messages, IP address | Handled in memory by the signaling server, discarded when the room ends | To connect participants |

The invite link's secret is kept in the part of the URL after `#`, which browsers never send to
web servers.

## Data stored on your device

- The extension stores your host display name in Chrome's local extension storage. While you
  are sharing, it keeps the live session's details (invite link, guest names, recent activity)
  in Chrome's in-memory session storage so the side panel can show them; they are cleared when
  the session ends and never written to disk.
- The guest page stores your display name in your browser's local storage, and a short-lived
  rejoin token in session storage so a brief disconnect doesn't require re-approval.

## Permissions

The extension only reads or acts on the tab you explicitly choose to share, and only while you
are sharing it. See [docs/store-listing.md](docs/store-listing.md) for why each permission is needed.

## Contact

Open an issue at [github.com/RealCloudyPanda/Cursor-Watchalong/issues](https://github.com/RealCloudyPanda/Cursor-Watchalong/issues).
