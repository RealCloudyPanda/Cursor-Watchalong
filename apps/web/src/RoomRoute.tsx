import { useGuestSession } from "./hooks/useGuestSession";
import { RoomView } from "./room/RoomView";
import { EndedScreen } from "./screens/EndedScreen";
import { JoinScreen } from "./screens/JoinScreen";
import { WaitingScreen } from "./screens/WaitingScreen";

export function RoomRoute({ roomId, secret }: { roomId: string; secret: string }) {
  const { session, state } = useGuestSession(roomId, secret);

  switch (state.phase) {
    case "idle":
    case "error":
      return <JoinScreen errorCode={state.errorCode} onJoin={(name) => session.join(name)} />;
    case "connecting":
    case "waiting":
      return <WaitingScreen phase={state.phase} onCancel={() => session.leave()} />;
    case "ended":
      return <EndedScreen reason={state.endReason ?? "room-ended"} />;
    default:
      return <RoomView session={session} state={state} />;
  }
}
