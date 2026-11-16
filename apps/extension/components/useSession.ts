import { useEffect, useState } from "react";
import { IDLE_SESSION, type SessionState } from "../lib/messages";
import { onSessionChange, readSession } from "../lib/session";

export function useSession(): SessionState {
  const [session, setSession] = useState<SessionState>(IDLE_SESSION);
  useEffect(() => {
    let alive = true;
    readSession().then((s) => alive && setSession(s));
    const off = onSessionChange(setSession);
    return () => {
      alive = false;
      off();
    };
  }, []);
  return session;
}
