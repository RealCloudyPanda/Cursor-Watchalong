import { parseInvite } from "./invite";
import { RoomRoute } from "./RoomRoute";
import { Landing } from "./screens/Landing";
import { PrivacyPage } from "./screens/PrivacyPage";

export function App() {
  if (window.location.pathname.replace(/\/$/, "") === "/privacy") return <PrivacyPage />;
  const invite = parseInvite(window.location);
  if (!invite) return <Landing />;
  return <RoomRoute roomId={invite.roomId} secret={invite.secret} />;
}
