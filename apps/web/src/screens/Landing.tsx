import { Button } from "@watchalong/ui/components/ui/button";
import { Card, CardContent } from "@watchalong/ui/components/ui/card";
import { Kbd } from "@watchalong/ui/components/ui/kbd";
import {
  ArrowRight,
  KeyRound,
  Link2,
  MousePointer2,
  MousePointerClick,
  PenLine,
  Play,
  Puzzle,
  RefreshCw,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { LiveDemo } from "../site/LiveDemo";
import { SiteLayout } from "../site/SiteLayout";

const FEATURES = [
  {
    icon: Play,
    title: "Live tab sharing",
    body: "Stream any Chrome tab's video and audio at up to 1080p, straight from browser to browser.",
  },
  {
    icon: MousePointer2,
    title: "Named cursors",
    body: "Everyone gets a color and a name tag, so “look here” finally means something.",
  },
  {
    icon: PenLine,
    title: "Fading drawings",
    body: "Circle the detail you spotted. Marks fade on their own after about three seconds.",
  },
  {
    icon: MousePointerClick,
    title: "Shared control",
    body: "With your OK, friends can play, pause, seek, click and scroll in the real page.",
  },
  {
    icon: UserCheck,
    title: "You approve everyone",
    body: "Guests wait until you let them in. Remove anyone or revoke control at any time.",
  },
  {
    icon: RefreshCw,
    title: "Built to stay connected",
    body: "Brief network drops reconnect automatically, and strict networks fall back to a relay.",
  },
];

const STEPS = [
  {
    icon: Puzzle,
    title: "Start sharing",
    body: "Click the extension on any tab and choose “Start sharing this tab”.",
  },
  {
    icon: Link2,
    title: "Send the link",
    body: "Copy the invite link from the side panel and send it to your friends.",
  },
  {
    icon: UserCheck,
    title: "Let them in",
    body: "They open it in any browser, pick a name, and you click Admit. That's it.",
  },
];

const FAQ = [
  {
    q: "Do my friends need to install anything?",
    a: "No. Only the host uses the Chrome extension. Guests join from a normal web page in any modern browser.",
  },
  {
    q: "Is it private?",
    a: "Video, audio, cursors and drawings go directly between browsers over encrypted WebRTC. There are no accounts, no database and no tracking. Rooms disappear when they end. See the privacy policy for details.",
  },
  {
    q: "Can guests control my whole browser?",
    a: "No. Guests can only point and draw until you give them control, and even then they can only act on the one tab you're sharing. They can't reach other tabs, the address bar or your settings.",
  },
  {
    q: "Does it work with Netflix or Disney+?",
    a: "Usually not. Those sites protect their video, so tab capture shows a black picture. The extension warns you on those sites. YouTube and most other sites work well.",
  },
  {
    q: "How many people can join?",
    a: "Up to four guests plus the host. Your upload speed sends a separate stream to each guest, so smaller rooms look best.",
  },
  {
    q: "What's the host PIN?",
    a: "This server can require a PIN to start sessions, so only people you trust can host. Guests never need it.",
  },
];

export function Landing() {
  return (
    <SiteLayout>
      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pt-16 pb-20 lg:grid-cols-[1fr_1.1fr] lg:pt-24">
        <div className="space-y-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary">
            <ShieldCheck className="size-3.5" /> No accounts · No database · Peer-to-peer
          </span>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Watch together.{" "}
            <span className="bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-transparent">
              Point together.
            </span>
          </h1>
          <p className="max-w-lg text-lg text-pretty text-muted-foreground">
            Share one live Chrome tab with friends. They join from a link, see each other's cursors,
            draw on the screen, and with your OK, take the controls.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <a href="/extension">
                <Puzzle />
                Get the extension
              </a>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <a href="#how-it-works">
                How it works
                <ArrowRight />
              </a>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Got an invite link? Just open it. Guests don't need to install anything.
          </p>
        </div>
        <LiveDemo />
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-20 border-t border-border/50 py-20">
        <div className="mx-auto max-w-6xl px-5">
          <SectionTitle
            eyebrow="Features"
            title="Everything a watch party needs"
            body="Built around one idea: everyone should be able to point at the screen."
          />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <Card
                key={f.title}
                className="border-border/60 bg-card/60 transition-colors hover:border-primary/40"
              >
                <CardContent className="space-y-3">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <f.icon className="size-5" />
                  </span>
                  <h3 className="font-medium">{f.title}</h3>
                  <p className="text-sm text-muted-foreground">{f.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-20 border-t border-border/50 py-20">
        <div className="mx-auto max-w-6xl px-5">
          <SectionTitle eyebrow="How it works" title="From tab to watch party in three steps" />
          <ol className="mt-10 grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li
                key={s.title}
                className="relative rounded-2xl border border-border/60 bg-card/60 p-6"
              >
                <span className="absolute top-5 right-5 font-mono text-xs text-muted-foreground">
                  0{i + 1}
                </span>
                <span className="mb-4 flex size-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <s.icon className="size-5" />
                </span>
                <h3 className="font-medium">{s.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span>
              <Kbd>D</Kbd> or hold <Kbd>Alt</Kbd> to draw
            </span>
            <span>
              <Kbd>Space</Kbd> / <Kbd>K</Kbd> play or pause
            </span>
            <span>
              <Kbd>J</Kbd> <Kbd>L</Kbd> skip 10s
            </span>
            <span>
              <Kbd>M</Kbd> mute
            </span>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20 border-t border-border/50 py-20">
        <div className="mx-auto max-w-3xl px-5">
          <SectionTitle eyebrow="FAQ" title="Questions, answered" />
          <div className="mt-10 divide-y divide-border/60 rounded-2xl border border-border/60 bg-card/60">
            {FAQ.map((f) => (
              <details key={f.q} className="group px-5 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium">
                  {f.q}
                  <span className="text-muted-foreground transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="pb-5 text-sm text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border/50 py-20">
        <div className="mx-auto max-w-4xl px-5">
          <div className="rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/20 via-card to-card p-10 text-center">
            <KeyRound className="mx-auto mb-4 size-8 text-primary" />
            <h2 className="text-3xl font-semibold tracking-tight">Ready to host?</h2>
            <p className="mx-auto mt-3 max-w-md text-muted-foreground">
              Install the extension, open the tab you want to share, and send the link.
            </p>
            <Button asChild size="lg" className="mt-6">
              <a href="/extension">
                <Puzzle />
                Get the Chrome extension
              </a>
            </Button>
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}

function SectionTitle({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-medium text-primary">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance">{title}</h2>
      {body && <p className="mt-3 text-muted-foreground">{body}</p>}
    </div>
  );
}
