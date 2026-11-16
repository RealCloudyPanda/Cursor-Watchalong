import { parseWire, ServerMessage } from "@watchalong/protocol";
import { useCallback, useEffect, useRef, useState } from "react";
import { wsUrl } from "./invite";

export type JoinState =
  | { status: "idle" }
  | { status: "connecting" }
  | { status: "waiting" }
  | { status: "admitted"; guestId: string; hostId: string }
  | { status: "host-away"; graceMs: number }
  | { status: "ended"; reason: "denied" | "kicked" | "room-ended" | "closed" }
  | { status: "error"; code: string };

const REJOIN_KEY = (roomId: string) => `watchalong:rejoin:${roomId}`;

/** Guest-side signaling connection. M1 adds the RTCPeerConnection on top of `admitted`. */
export function useRoomConnection(roomId: string, secret: string) {
  const [state, setState] = useState<JoinState>({ status: "idle" });
  const wsRef = useRef<WebSocket | null>(null);

  const join = useCallback(
    (name: string) => {
      wsRef.current?.close();
      setState({ status: "connecting" });
      const ws = new WebSocket(wsUrl(window.location));
      wsRef.current = ws;

      ws.onopen = () => {
        const rejoinToken = sessionStorage.getItem(REJOIN_KEY(roomId)) ?? undefined;
        ws.send(JSON.stringify({ type: "join", roomId, secret, name, rejoinToken }));
      };

      ws.onmessage = (event) => {
        const parsed = parseWire(ServerMessage, String(event.data));
        if (!parsed.ok) return;
        const msg = parsed.value;
        switch (msg.type) {
          case "waiting-for-host":
            return setState({ status: "waiting" });
          case "admitted":
            sessionStorage.setItem(REJOIN_KEY(roomId), msg.rejoinToken);
            return setState({ status: "admitted", guestId: msg.guestId, hostId: msg.hostId });
          case "host-away":
            return setState({ status: "host-away", graceMs: msg.graceMs });
          case "host-back":
            return setState((s) => (s.status === "host-away" ? { status: "waiting" } : s));
          case "denied":
          case "kicked":
          case "room-ended":
            sessionStorage.removeItem(REJOIN_KEY(roomId));
            return setState({ status: "ended", reason: msg.type });
          case "error":
            return setState({ status: "error", code: msg.code });
        }
      };

      ws.onclose = () =>
        setState((s) =>
          s.status === "ended" || s.status === "error" ? s : { status: "ended", reason: "closed" },
        );
    },
    [roomId, secret],
  );

  useEffect(() => () => wsRef.current?.close(), []);

  return { state, join };
}
