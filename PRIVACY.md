# Privacy Policy

_Last updated: 2026-11-17_

Cursor Watchalong lets a host share one browser tab with guests they invite. This policy explains
what data the Chrome extension, the guest website (cursor-watchalong.fly.dev) and its signaling
server handle, why, and for how long.

## Summary

- No accounts, no database, no analytics, no advertising, no tracking.
- Session data exists only while a session is running and is not stored afterwards.
- We never sell user data or use it for anything except running the watch party you started.

## Data we handle

| Data | Who handles it | Why | How long |
| --- | --- | --- | --- |
| **Video and audio of the one tab the host shares** | Sent directly from the host's browser to admitted guests over encrypted WebRTC. If a direct connection fails, it passes through Cloudflare's TURN relay, which forwards encrypted traffic it can't read. | Showing guests the shared tab | Never stored |
| **Display names** | The signaling server and everyone in the room | Labelling cursors and the guest list | In server memory until the session ends |
| **Cursor positions, clicks, scrolls, drawings and playback commands** | Sent directly between participants over encrypted WebRTC | Pointing, drawing and (with the host's permission) controlling the shared tab | Never stored |
| **Host PIN** (only if the server requires one) | Stored in the host's browser (Chrome extension storage) and sent to the signaling server when starting a session | Letting only authorised people start sessions | Kept on the host's device until they change it; the server never stores what was entered |
| **IP addresses** | The signaling server; STUN servers run by Cloudflare and Google; Cloudflare's TURN relay; and the other participants, as part of WebRTC | Connecting participants and preventing abuse (rate limits) | Server memory only: rate-limit entries are deleted within a few minutes, connection records when you disconnect |
| **Invite links** | Shared by the host with whoever they choose | Joining a session | The secret part (after `#`) is never sent to any web server |

## Data stored on your device

- **Extension (host):** your display name and host PIN in Chrome's local extension storage. While
  you're sharing, the live session's details (invite link, guest names, recent activity) are kept
  in Chrome's in-memory session storage for the side panel and cleared when the session ends.
- **Website (guest):** your display name in local storage, and a short-lived rejoin token in
  session storage so a brief disconnect doesn't require the host to approve you again.

## Permissions

The extension only reads or acts on the single tab you explicitly choose to share, and only while
you are sharing it. The extension page at https://cursor-watchalong.fly.dev/extension explains why
each permission is needed.

## Limited Use

The use of information received from Chrome APIs complies with the
[Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/),
including the Limited Use requirements. Data is used only to provide the watch-party features
described above. It is not sold, not transferred to third parties except as needed to provide those
features (the relay and STUN providers listed above), not used for advertising, and not used to
determine creditworthiness or for lending.

## Children

Cursor Watchalong is not directed at children under 13 and doesn't knowingly collect their data.

## Changes

If this policy changes, the date at the top is updated and the new version is published at
https://cursor-watchalong.fly.dev/privacy.

## Contact

Open an issue at [github.com/RealCloudyPanda/Cursor-Watchalong/issues](https://github.com/RealCloudyPanda/Cursor-Watchalong/issues).
