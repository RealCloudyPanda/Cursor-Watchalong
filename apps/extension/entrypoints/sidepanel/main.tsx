import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { type ExtMessage, IDLE_SESSION, type SessionState } from "../../lib/messages";
import { onSessionChange, readSession } from "../../lib/session";
import "../../lib/panel.css";

function SidePanel() {
  const [session, setSession] = useState<SessionState>(IDLE_SESSION);

  useEffect(() => {
    readSession().then(setSession);
    return onSessionChange(setSession);
  }, []);

  const toOffscreen = (msg: ExtMessage) => chrome.runtime.sendMessage(msg).catch(() => {});

  if (session.status !== "live") {
    return (
      <main className="panel">
        <h1>Cursor Watchalong</h1>
        <p>
          {session.status === "starting"
            ? "Starting…"
            : "Not sharing. Click the toolbar icon on a tab and choose Start sharing."}
        </p>
        {session.error && <p className="error">{session.error}</p>}
      </main>
    );
  }

  return (
    <main className="panel">
      <h1>Sharing this tab</h1>
      {session.drmWarning && (
        <p className="warn">This site's video may appear black to guests (DRM protected).</p>
      )}
      <label>
        Invite link
        <input readOnly value={session.inviteUrl ?? ""} onFocus={(e) => e.target.select()} />
      </label>
      <button
        type="button"
        onClick={() => session.inviteUrl && navigator.clipboard.writeText(session.inviteUrl)}
      >
        Copy link
      </button>

      {session.pending.length > 0 && <h2>Wants to join</h2>}
      {session.pending.map((p) => (
        <div className="row" key={p.guestId}>
          <span>{p.name}</span>
          <button
            type="button"
            onClick={() => toOffscreen({ target: "offscreen", type: "admit", guestId: p.guestId })}
          >
            Admit
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => toOffscreen({ target: "offscreen", type: "deny", guestId: p.guestId })}
          >
            Deny
          </button>
        </div>
      ))}

      <h2>In the room ({session.guests.length})</h2>
      {session.guests.map((g) => (
        <div className="row" key={g.guestId}>
          {g.name}
        </div>
      ))}

      <button
        type="button"
        className="danger"
        onClick={() => chrome.runtime.sendMessage({ target: "background", type: "stop-sharing" })}
      >
        End session
      </button>
    </main>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<SidePanel />);
