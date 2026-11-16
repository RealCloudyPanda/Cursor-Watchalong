import { IDLE_SESSION, SESSION_KEY, type SessionState } from "./messages";

export async function readSession(): Promise<SessionState> {
  const stored = await chrome.storage.session.get(SESSION_KEY);
  return (stored[SESSION_KEY] as SessionState | undefined) ?? IDLE_SESSION;
}

export async function patchSession(patch: Partial<SessionState>): Promise<SessionState> {
  const next = { ...(await readSession()), ...patch };
  await chrome.storage.session.set({ [SESSION_KEY]: next });
  return next;
}

export function onSessionChange(cb: (session: SessionState) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === "session" && changes[SESSION_KEY]) {
      cb((changes[SESSION_KEY].newValue as SessionState | undefined) ?? IDLE_SESSION);
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
