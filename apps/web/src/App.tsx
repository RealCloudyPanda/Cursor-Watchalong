import { MAX_NAME_LENGTH } from "@watchalong/protocol";
import { type FormEvent, useState } from "react";
import { parseInvite } from "./invite";
import { useRoomConnection } from "./useRoomConnection";

export function App() {
  const invite = parseInvite(window.location);
  if (!invite) {
    return (
      <main className="center">
        <h1>Cursor Watchalong</h1>
        <p>Open an invite link from a host to join a watch party.</p>
      </main>
    );
  }
  return <Room roomId={invite.roomId} secret={invite.secret} />;
}

const NAME_KEY = "watchalong:name";

function Room({ roomId, secret }: { roomId: string; secret: string }) {
  const { state, join } = useRoomConnection(roomId, secret);
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? "");

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    localStorage.setItem(NAME_KEY, trimmed);
    join(trimmed);
  };

  switch (state.status) {
    case "idle":
    case "error":
      return (
        <main className="center">
          <h1>Join watch party</h1>
          <form onSubmit={onSubmit}>
            <input
              placeholder="Your name"
              maxLength={MAX_NAME_LENGTH}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button type="submit">Join</button>
          </form>
          {state.status === "error" && <p className="error">Couldn’t join: {state.code}</p>}
        </main>
      );
    case "connecting":
      return <Status text="Connecting…" />;
    case "waiting":
      return <Status text="Waiting for the host to let you in…" />;
    case "host-away":
      return <Status text="The host lost connection. Waiting for them to come back…" />;
    case "admitted":
      // M1: <video> with the host's tab stream; M3: draw canvas + toolbar.
      return <Status text="You're in! Stream coming in M1." />;
    case "ended":
      return <Status text={ENDED_TEXT[state.reason]} />;
  }
}

const ENDED_TEXT = {
  denied: "The host declined your request.",
  kicked: "The host removed you from the session.",
  "room-ended": "The session has ended.",
  closed: "Disconnected from the session.",
} as const;

function Status({ text }: { text: string }) {
  return (
    <main className="center">
      <p>{text}</p>
    </main>
  );
}
