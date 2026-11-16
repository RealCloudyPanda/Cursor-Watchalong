/**
 * Storage that never throws. Browsers can deny storage (privacy modes, blocked third-party
 * storage), and joining must still work then; values just aren't remembered.
 */
const memory = new Map<string, string>();

function safe(kind: "local" | "session"): Storage | null {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function getItem(kind: "local" | "session", key: string): string | null {
  try {
    return safe(kind)?.getItem(key) ?? memory.get(`${kind}:${key}`) ?? null;
  } catch {
    return memory.get(`${kind}:${key}`) ?? null;
  }
}

export function setItem(kind: "local" | "session", key: string, value: string) {
  memory.set(`${kind}:${key}`, value);
  try {
    safe(kind)?.setItem(key, value);
  } catch {
    // keep the in-memory copy
  }
}

export function removeItem(kind: "local" | "session", key: string) {
  memory.delete(`${kind}:${key}`);
  try {
    safe(kind)?.removeItem(key);
  } catch {
    // ignore
  }
}
