# Chrome Web Store listing

## Summary (≤132 characters)

Share a live tab with friends. Everyone sees each other's cursors, draws fading marks, and can control playback.

## Description

Watch YouTube and other videos together, or browse any page together, from one shared tab.

- **Invite with a link.** Friends join from a normal web page. No install or account needed.
- **You approve everyone.** Each guest waits until you let them in.
- **See each other point.** Every person has a colored cursor with their name.
- **Draw on the screen.** Circle what you spotted; marks fade after a few seconds.
- **Share control when you want.** Let guests play, pause, seek, click and scroll, or keep them to pointing and drawing.
- **Private by design.** Video goes directly between browsers over encrypted WebRTC. No database, no tracking.

Protected video (Netflix, Disney+, Prime Video and similar) usually shows black in tab capture. The extension warns you on those sites.

## Category

Social & Communication

## Permission justifications

| Permission | Justification |
| --- | --- |
| `tabCapture` | Captures the video and audio of the single tab the host chooses to share. |
| `offscreen` | Hosts the capture stream and WebRTC connections, which MV3 service workers can't hold. |
| `scripting` | Injects the shared overlay (cursors, drawings) and input handling into the shared tab only. |
| `storage` | Remembers the host's display name and host PIN on this device, and the live session state shown in the side panel. |
| `sidePanel` | Shows session controls (invite link, guest approvals, permissions) without appearing in the shared video. |
| `activeTab` | Grants access to the tab the host clicked the extension on. |
| Optional host permission `<all_urls>` | Requested only when sharing starts, so the overlay keeps working after the shared tab navigates to another site and inside embedded video frames. The extension acts only on the tab being shared. |

## Single purpose

Share one browser tab with invited guests who can see it, point at it, draw on it and, with permission, control it.

## Assets checklist

- [ ] 128×128 icon (generated from `apps/extension/assets/icon.svg`)
- [ ] At least one 1280×800 screenshot (side panel + guest view)
- [ ] 440×280 small promo tile
- [ ] Privacy policy URL (publish `PRIVACY.md`)
