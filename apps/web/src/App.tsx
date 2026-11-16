import { parseInvite } from "./invite";
import { RoomRoute } from "./RoomRoute";
import { Landing } from "./screens/Landing";

export function App() {
  const invite = parseInvite(window.location);
  if (!invite) return <Landing />;
  return <RoomRoute roomId={invite.roomId} secret={invite.secret} />;
}
