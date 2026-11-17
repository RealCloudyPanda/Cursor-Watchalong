/**
 * Dev-only: renders the extension's popup or side panel in a normal page with a stubbed
 * `chrome` API and a sample live session, for README screenshots. ?page=popup|sidepanel
 */
const now = Date.now();
const session = {
  status: "live",
  tabId: 1,
  tabTitle: "Sunset Timelapse – 4K Nature Footage",
  tabHost: "www.youtube.com",
  drmWarning: false,
  drawing: false,
  host: {
    status: "live",
    roomId: "k3Jd9QwPz1Lm",
    inviteUrl: "https://cursor-watchalong.fly.dev/r/k3Jd9QwPz1Lm#k=Yh7Qp2Lx9Vb4Nc8Rt1Ws6Dz",
    hostName: "Ava",
    hostColor: "#ff4d6d",
    pending: [{ guestId: "pend0001", name: "Dana" }],
    guests: [
      { id: "guest001", name: "Ben", color: "#4dabf7", canControl: true, connection: "connected" },
      { id: "guest002", name: "Cam", color: "#51cf66", canControl: false, connection: "connected" },
    ],
    activity: [
      { id: 3, at: now - 20_000, by: "guest001", name: "Ben", color: "#4dabf7", text: "paused" },
      {
        id: 2,
        at: now - 80_000,
        by: "guest001",
        name: "Ben",
        color: "#4dabf7",
        text: "skipped to 3:21",
      },
      { id: 1, at: now - 140_000, by: "guest001", name: "Ben", color: "#4dabf7", text: "played" },
    ],
    controlForAll: false,
  },
};
const noop = () => {};
const store = (data: Record<string, unknown>) => ({
  get: async () => data,
  set: async () => {},
});
Object.assign(window, {
  chrome: {
    storage: {
      session: store({ session }),
      local: store({ hostName: "Ava", hostPin: "123456" }),
      onChanged: { addListener: noop, removeListener: noop },
    },
    runtime: { sendMessage: async () => {}, id: "harness" },
    tabs: { query: async () => [{ id: 1, windowId: 1 }] },
    windows: { WINDOW_ID_CURRENT: -2 },
    sidePanel: { open: async () => {} },
    permissions: { request: async () => true },
  },
});
const page = new URLSearchParams(location.search).get("page");
if (page === "popup") {
  // Show the not-yet-sharing popup (name + PIN + start button).
  (window as any).chrome.storage.session = store({});
  await import("../../extension/entrypoints/popup/main");
} else {
  await import("../../extension/entrypoints/sidepanel/main");
}
