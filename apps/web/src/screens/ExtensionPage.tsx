import { Alert, AlertDescription, AlertTitle } from "@watchalong/ui/components/ui/alert";
import { Button } from "@watchalong/ui/components/ui/button";
import { Card, CardContent } from "@watchalong/ui/components/ui/card";
import { Clock, Code2, Puzzle, ShieldCheck } from "lucide-react";
import { GITHUB_URL, STORE_URL } from "../site/links";
import { SiteLayout } from "../site/SiteLayout";

const PERMISSIONS: [string, string][] = [
  ["Capture the shared tab", "Streams the video and audio of the one tab you choose to share."],
  [
    "Run on the shared tab",
    "Draws cursors and drawings, and applies play, pause and clicks you allow.",
  ],
  ["Side panel", "Shows your session controls next to the tab, outside the shared video."],
  ["Storage", "Remembers your display name and host PIN on this device."],
  [
    "Access to sites (optional)",
    "Asked for when you start sharing, so the overlay keeps working when the tab navigates. Only the shared tab is ever affected.",
  ],
];

export function ExtensionPage() {
  return (
    <SiteLayout>
      <section className="mx-auto max-w-4xl space-y-12 px-5 py-16">
        <div className="space-y-5 text-center">
          <img src="/icon-128.png" alt="" className="mx-auto size-20 rounded-2xl" />
          <h1 className="text-4xl font-semibold tracking-tight">Cursor Watchalong for Chrome</h1>
          <p className="mx-auto max-w-xl text-lg text-muted-foreground">
            The host uses the extension to share a tab. Guests don't need it: they join from the
            invite link in any browser.
          </p>
          {STORE_URL ? (
            <Button asChild size="lg">
              <a href={STORE_URL}>
                <Puzzle />
                Add to Chrome
              </a>
            </Button>
          ) : (
            <div className="mx-auto max-w-lg">
              <Alert className="text-left">
                <Clock />
                <AlertTitle>Coming soon to the Chrome Web Store</AlertTitle>
                <AlertDescription>
                  The extension is in review. Until it's listed, developers can build it from the
                  source code.
                </AlertDescription>
              </Alert>
              <Button asChild size="lg" variant="secondary" className="mt-4">
                <a href={GITHUB_URL}>
                  <Code2 />
                  View the source on GitHub
                </a>
              </Button>
            </div>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {[
            ["1", "Install", "Add the extension and pin it to your toolbar."],
            ["2", "Share a tab", "Open a video, click the icon, and choose Start sharing."],
            ["3", "Invite", "Copy the link from the side panel and admit your friends."],
          ].map(([n, t, b]) => (
            <Card key={n} className="border-border/60 bg-card/60">
              <CardContent className="space-y-2">
                <span className="font-mono text-xs text-primary">STEP {n}</span>
                <h2 className="font-medium">{t}</h2>
                <p className="text-sm text-muted-foreground">{b}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="space-y-4">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <ShieldCheck className="size-5 text-primary" /> What the extension can access, and why
          </h2>
          <ul className="divide-y divide-border/60 rounded-2xl border border-border/60 bg-card/60">
            {PERMISSIONS.map(([t, b]) => (
              <li key={t} className="grid gap-1 px-5 py-4 sm:grid-cols-[14rem_1fr] sm:gap-6">
                <span className="text-sm font-medium">{t}</span>
                <span className="text-sm text-muted-foreground">{b}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">
            Requires Chrome 119 or newer. Read the{" "}
            <a href="/privacy" className="text-primary underline underline-offset-2">
              privacy policy
            </a>{" "}
            for exactly what data is handled.
          </p>
        </div>
      </section>
    </SiteLayout>
  );
}
