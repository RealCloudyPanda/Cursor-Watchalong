import type { Browser, BrowserContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";

const contexts: BrowserContext[] = [];

async function newContext(browser: Browser) {
  const ctx = await browser.newContext();
  contexts.push(ctx);
  return ctx;
}

/** Close every context a test opened (host harness, guests), even when the test failed. */
export async function closeAll() {
  await Promise.all(contexts.splice(0).map((c) => c.close().catch(() => {})));
}

/** Decoded video frames so far: increases only if new frames keep arriving. */
export function decodedFrames(page: Page) {
  return page.evaluate(() => {
    const v = document.querySelector<HTMLVideoElement>('[data-testid="stream"]');
    return v?.getVideoPlaybackQuality().totalVideoFrames ?? 0;
  });
}

/** RMS level of the received audio track over ~300ms (the harness plays a constant tone). */
export function audioLevel(page: Page) {
  return page.evaluate(async () => {
    const v = document.querySelector<HTMLVideoElement>('[data-testid="stream"]');
    const stream = v?.srcObject as MediaStream | null;
    const track = stream?.getAudioTracks()[0];
    if (!track) return 0;
    const ctx = new AudioContext();
    await ctx.resume();
    const src = ctx.createMediaStreamSource(new MediaStream([track]));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    src.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let peak = 0;
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 50));
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const x of buf) sum += x * x;
      peak = Math.max(peak, Math.sqrt(sum / buf.length));
    }
    await ctx.close();
    return peak;
  });
}

export interface HostHandle {
  page: Page;
  inviteUrl: string;
  state: () => Promise<any>;
  call: (method: string, ...args: unknown[]) => Promise<void>;
  received: () => Promise<{ from: { id: string; name: string }; message: any }[]>;
}

export async function startHost(
  browser: Browser,
  name = "Hosty",
  opts: { scene?: boolean } = {},
): Promise<HostHandle> {
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  await page.goto(
    `/e2e-harness/host.html?name=${encodeURIComponent(name)}${opts.scene ? "&scene" : ""}`,
  );
  await expect
    .poll(() => page.evaluate(() => (window as any).__host.state?.inviteUrl), { timeout: 15_000 })
    .toBeTruthy();
  const inviteUrl: string = await page.evaluate(() => (window as any).__host.state.inviteUrl);
  return {
    page,
    inviteUrl,
    state: () => page.evaluate(() => (window as any).__host.state),
    call: (method, ...args) =>
      page.evaluate(([m, a]) => (window as any).__host.session[m as string](...(a as unknown[])), [
        method,
        args,
      ] as const),
    received: () => page.evaluate(() => (window as any).__host.received),
  };
}

export async function requestJoin(browser: Browser, inviteUrl: string, name: string) {
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  await page.goto(new URL(inviteUrl).pathname + new URL(inviteUrl).hash);
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: "Ask to join" }).click();
  return page;
}

export async function admitNext(host: HostHandle, name: string) {
  await expect
    .poll(async () => (await host.state()).pending.map((p: any) => p.name), { timeout: 10_000 })
    .toContain(name);
  const pending = (await host.state()).pending.find((p: any) => p.name === name);
  await host.call("admit", pending.guestId);
  return pending.guestId as string;
}

export async function joinAndAdmit(browser: Browser, host: HostHandle, name: string) {
  const page = await requestJoin(browser, host.inviteUrl, name);
  const guestId = await admitNext(host, name);
  await expectStreaming(page);
  return { page, guestId };
}

export async function expectStreaming(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const v = document.querySelector<HTMLVideoElement>('[data-testid="stream"]');
          return v ? v.videoWidth : 0;
        }),
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0);
}
