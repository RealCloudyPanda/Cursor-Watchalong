import { Brand } from "@watchalong/ui/components/brand";
import { Button } from "@watchalong/ui/components/ui/button";
import { cn } from "@watchalong/ui/lib/utils";
import { Code2, Menu, Puzzle, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { GITHUB_URL, SUPPORT_URL } from "./links";

const NAV = [
  { href: "/#features", label: "Features" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#faq", label: "FAQ" },
  { href: "/extension", label: "Extension" },
  { href: "/privacy", label: "Privacy" },
];

/** Header + footer shared by the marketing pages (not the room). */
export function SiteLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = window.location.pathname;
  return (
    <div className="relative flex min-h-svh flex-col overflow-x-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-48 left-1/2 h-[560px] w-[1100px] -translate-x-1/2 rounded-full bg-primary/15 blur-[130px]"
      />
      <header className="sticky top-0 z-30 border-b border-border/50 bg-background/75 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5">
          <a href="/" aria-label="Cursor Watchalong home">
            <Brand />
          </a>
          <nav aria-label="Main" className="ml-auto hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                aria-current={path === n.href ? "page" : undefined}
                className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground aria-[current=page]:text-foreground"
              >
                {n.label}
              </a>
            ))}
            <Button asChild size="sm" className="ml-2">
              <a href="/extension">
                <Puzzle />
                Get the extension
              </a>
            </Button>
          </nav>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X /> : <Menu />}
          </Button>
        </div>
        <nav
          aria-label="Mobile"
          className={cn("border-t border-border/50 px-5 py-3 md:hidden", !open && "hidden")}
        >
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              className="block rounded-md px-2 py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {n.label}
            </a>
          ))}
        </nav>
      </header>

      <main className="relative z-10 flex-1">{children}</main>

      <footer className="relative z-10 border-t border-border/50">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 sm:grid-cols-[1fr_auto_auto_auto]">
          <div className="space-y-3">
            <Brand compact />
            <p className="max-w-xs text-sm text-muted-foreground">
              Watch together in one shared Chrome tab. No accounts, no database.
            </p>
          </div>
          <FooterCol
            title="Product"
            links={[
              ["Features", "/#features"],
              ["How it works", "/#how-it-works"],
              ["Chrome extension", "/extension"],
            ]}
          />
          <FooterCol
            title="Legal"
            links={[
              ["Privacy policy", "/privacy"],
              ["License (MIT)", `${GITHUB_URL}/blob/main/LICENSE`],
            ]}
          />
          <FooterCol
            title="Help"
            links={[
              ["FAQ", "/#faq"],
              ["Support", SUPPORT_URL],
              ["Source code", GITHUB_URL],
            ]}
          />
        </div>
        <div className="mx-auto flex max-w-6xl items-center justify-between border-t border-border/50 px-5 py-5 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Cursor Watchalong</span>
          <a href={GITHUB_URL} className="inline-flex items-center gap-1.5 hover:text-foreground">
            <Code2 className="size-3.5" /> RealCloudyPanda/Cursor-Watchalong
          </a>
        </div>
      </footer>
    </div>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <ul className="space-y-2 text-sm">
        {links.map(([label, href]) => (
          <li key={label}>
            <a href={href} className="text-foreground/80 hover:text-foreground">
              {label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
