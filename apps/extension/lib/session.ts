import { IDLE_SESSION, SESSION_KEY, type SessionState } from "./messages";

export async function readSession(): Promise<SessionState> {
  const stored = await chrome.storage.session.get(SESSION_KEY);
  return (stored[SESSION_KEY] as SessionState | undefined) ?? IDLE_SESSION;
}

let queue: Promise<unknown> = Promise.resolve();

/** Serialized read-modify-write so concurrent patches never overwrite each other. */
export function patchSession(patch: Partial<SessionState>): Promise<SessionState> {
  const run = queue.then(async () => {
    const next = { ...(await readSession()), ...patch };
    await chrome.storage.session.set({ [SESSION_KEY]: next });
    return next;
  });
  queue = run.catch(() => undefined);
  return run;
}

export function replaceSession(next: SessionState): Promise<SessionState> {
  const run = queue.then(async () => {
    await chrome.storage.session.set({ [SESSION_KEY]: next });
    return next;
  });
  queue = run.catch(() => undefined);
  return run;
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
