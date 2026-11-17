import { MAX_NAME_LENGTH } from "@watchalong/protocol";
import { Brand } from "@watchalong/ui/components/brand";
import { StatusDot } from "@watchalong/ui/components/status-dot";
import { Alert, AlertDescription } from "@watchalong/ui/components/ui/alert";
import { Button } from "@watchalong/ui/components/ui/button";
import { Input } from "@watchalong/ui/components/ui/input";
import { Label } from "@watchalong/ui/components/ui/label";
import { CircleAlert, PanelRight, Radio, Square } from "lucide-react";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { useSession } from "../../components/useSession";
import { HOST_NAME_KEY, HOST_PIN_KEY, sendExt } from "../../lib/messages";
import "../../lib/app.css";

function Popup() {
  const session = useSession();
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  // Resolved on open so the click handler can call gesture-gated APIs synchronously.
  const [tab, setTab] = useState<chrome.tabs.Tab | null>(null);
  const live = session.status === "live" || session.status === "starting";

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([t]) => setTab(t ?? null));
    chrome.storage.local.get([HOST_NAME_KEY, HOST_PIN_KEY]).then((v) => {
      if (typeof v[HOST_NAME_KEY] === "string") setName(v[HOST_NAME_KEY]);
      if (typeof v[HOST_PIN_KEY] === "string") setPin(v[HOST_PIN_KEY]);
    });
  }, []);

  const saveName = (value: string) => {
    setName(value);
    chrome.storage.local.set({ [HOST_NAME_KEY]: value.trim().slice(0, MAX_NAME_LENGTH) });
  };

  const savePin = (value: string) => {
    setPin(value);
    chrome.storage.local.set({ [HOST_PIN_KEY]: value.trim().slice(0, 128) });
  };

  const start = () => {
    if (tab?.id === undefined || tab.windowId === undefined) return;
    const tabId = tab.id;
    setBusy(true);
    // sidePanel.open and permissions.request both need this click's user gesture,
    // so both start in the same tick, before any await.
    const panel = chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
    const perms = chrome.permissions.request({ origins: ["<all_urls>"] }).catch(() => false);
    Promise.all([panel, perms]).then(async () => {
      await sendExt({ target: "background", type: "start-sharing", tabId });
      window.close();
    });
  };

  const openPanel = () => {
    if (tab?.windowId !== undefined)
      chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
    window.close();
  };

  return (
    <main className="w-80 space-y-4 p-4">
      <Brand compact />
      {live ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2.5 text-sm">
            <StatusDot tone="live" pulse />
            <span className="min-w-0 flex-1 truncate">
              Sharing <span className="font-medium">{session.tabTitle ?? "a tab"}</span>
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={openPanel}>
              <PanelRight />
              Controls
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                sendExt({ target: "background", type: "stop-sharing" });
                window.close();
              }}
            >
              <Square />
              Stop
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Share this tab with friends. They can point, draw and, if you allow it, control
            playback.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="host-name">Your name</Label>
            <Input
              id="host-name"
              placeholder="Host"
              maxLength={MAX_NAME_LENGTH}
              value={name}
              onChange={(e) => saveName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="host-pin">Host PIN</Label>
            <Input
              id="host-pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Needed to start a session"
              maxLength={128}
              value={pin}
              onChange={(e) => savePin(e.target.value)}
              aria-invalid={session.error?.includes("PIN") || undefined}
            />
            <p className="text-xs text-muted-foreground">
              Only people with the PIN can host. Guests don't need it. Saved on this device.
            </p>
          </div>
          {session.error && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertDescription>{session.error}</AlertDescription>
            </Alert>
          )}
          <Button className="w-full" size="lg" onClick={start} disabled={busy || !tab}>
            <Radio />
            Start sharing this tab
          </Button>
          <p className="text-xs text-muted-foreground">
            Chrome will ask once for access to sites, so the overlay keeps working when the tab
            navigates.
          </p>
        </div>
      )}
    </main>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<Popup />);
