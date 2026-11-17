import { parseInvite } from "./invite";
import { RoomRoute } from "./RoomRoute";
import { ExtensionPage } from "./screens/ExtensionPage";
import { Landing } from "./screens/Landing";
import { NotFound } from "./screens/NotFound";
import { PrivacyPage } from "./screens/PrivacyPage";

export function App() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return <Landing />;
  if (path === "/privacy") return <PrivacyPage />;
  if (path === "/extension") return <ExtensionPage />;
  const invite = parseInvite(window.location);
  if (invite) return <RoomRoute roomId={invite.roomId} secret={invite.secret} />;
  if (/^\/r\/[A-Za-z0-9_-]+$/.test(path)) return <NotFound incompleteInvite />;
  return <NotFound />;
}
