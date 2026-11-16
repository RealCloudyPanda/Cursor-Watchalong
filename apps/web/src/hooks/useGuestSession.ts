import { useEffect, useState, useSyncExternalStore } from "react";
import { wsUrl } from "../invite";
import { GuestSession } from "../session/guest-session";

/** One GuestSession per mounted room; disposed on unmount. */
export function useGuestSession(roomId: string, secret: string) {
  const [session] = useState(() => new GuestSession(roomId, secret, wsUrl(window.location)));
  useEffect(() => {
    session.activate();
    // Test hook for the dev-only e2e suite (never in production builds).
    if (import.meta.env.DEV) Object.assign(window, { __guest: session });
    return () => session.dispose();
  }, [session]);
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  return { session, state };
}
