/** Parse `/r/<roomId>#k=<secret>`. The secret stays in the fragment so it never reaches HTTP logs. */
export function parseInvite(location: Pick<Location, "pathname" | "hash">) {
  const match = location.pathname.match(/^\/r\/([A-Za-z0-9_-]{10,32})\/?$/);
  const secret = new URLSearchParams(location.hash.slice(1)).get("k");
  if (!match?.[1] || !secret) return null;
  return { roomId: match[1], secret };
}

export function wsUrl(location: Pick<Location, "protocol" | "host">) {
  return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
}
