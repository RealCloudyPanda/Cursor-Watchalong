import type { ReactNode } from "react";
import policy from "../../../../PRIVACY.md?raw";
import { SiteLayout } from "../site/SiteLayout";

/** Renders PRIVACY.md (the Chrome Web Store privacy policy URL points here: /privacy). */
export function PrivacyPage() {
  return (
    <SiteLayout>
      <article className="mx-auto max-w-2xl space-y-4 px-5 py-16 text-sm leading-relaxed">
        {renderMarkdown(policy)}
      </article>
    </SiteLayout>
  );
}

/** Just enough Markdown for the policy: headings, bullets, tables, inline code/emphasis. */
function renderMarkdown(md: string): ReactNode[] {
  const out: ReactNode[] = [];
  const lines = md.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.startsWith("# ")) {
      out.push(
        <h1 key={i} className="text-3xl font-semibold tracking-tight">
          {inline(line.slice(2))}
        </h1>,
      );
    } else if (line.startsWith("## ")) {
      out.push(
        <h2 key={i} className="pt-4 text-lg font-semibold">
          {inline(line.slice(3))}
        </h2>,
      );
    } else if (line.startsWith("- ")) {
      const items: string[] = [];
      while ((lines[i] ?? "").startsWith("- ")) items.push((lines[i++] ?? "").slice(2));
      out.push(
        <ul key={i} className="list-disc space-y-1 pl-5 text-muted-foreground">
          {items.map((t) => (
            <li key={t}>{inline(t)}</li>
          ))}
        </ul>,
      );
      continue;
    } else if (line.startsWith("|")) {
      const rows: string[][] = [];
      while ((lines[i] ?? "").startsWith("|")) {
        const cells = (lines[i++] ?? "")
          .split("|")
          .slice(1, -1)
          .map((c) => c.trim());
        if (!cells.every((c) => /^-+$/.test(c))) rows.push(cells);
      }
      const [head, ...body] = rows;
      out.push(
        <div key={i} className="overflow-x-auto rounded-lg border border-border/60">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40">
              <tr>
                {head?.map((c) => (
                  <th key={c} className="px-3 py-2 font-medium">
                    {inline(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((r) => (
                <tr key={r.join("|")} className="border-t border-border/60 align-top">
                  {r.map((c) => (
                    <td key={c} className="px-3 py-2 text-muted-foreground">
                      {inline(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    } else if (line.trim()) {
      out.push(
        <p key={i} className="text-muted-foreground">
          {inline(line)}
        </p>,
      );
    }
    i++;
  }
  return out;
}

function inline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*|_[^_]+_|\[[^\]]+\]\([^)]+\))/g).map((part, k) => {
    const key = `${k}${part}`;
    if (part.startsWith("`")) return <code key={key}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**")) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("_") && part.endsWith("_")) return <em key={key}>{part.slice(1, -1)}</em>;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const href = link[2] ?? "";
      const safe = /^https:\/\//.test(href)
        ? href
        : `https://github.com/RealCloudyPanda/Cursor-Watchalong/blob/main/${href}`;
      return (
        <a key={key} href={safe} className="text-primary underline underline-offset-2">
          {link[1]}
        </a>
      );
    }
    return part;
  });
}
