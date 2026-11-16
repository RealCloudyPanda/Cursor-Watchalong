/** Guest web app origin used to build invite links. */
export const PUBLIC_ORIGIN: string = import.meta.env.WXT_PUBLIC_ORIGIN ?? "http://localhost:5173";
/** Signaling WebSocket. */
export const WS_URL: string = import.meta.env.WXT_WS_URL ?? "ws://localhost:8787/ws";
