import { expect, test } from "@playwright/test";
import { closeAll, startHost } from "./helpers";

/**
 * Records a short product demo (guest's view) to docs/demo.
 * Opt-in: DEMO_VIDEO=1 pnpm --filter @watchalong/web e2e demo-video
 */
test.skip(!process.env.DEMO_VIDEO, "set DEMO_VIDEO=1 to record the demo video");
test.afterEach(closeAll);
test.setTimeout(120_000);

const size = { width: 1280, height: 720 };

// Playwright videos don't show the mouse pointer, so draw one.
const cursorScript = () => {
  window.addEventListener("DOMContentLoaded", () => {
    const c = document.createElement("div");
    c.style.cssText =
      "position:fixed;z-index:2147483647;pointer-events:none;width:22px;height:22px;left:-50px;top:-50px;transition:transform .08s";
    c.innerHTML =
      '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M3 2l17 9.5-7.4 2-4.5 8.1-2.3-1.2 4.5-8.2L3 17z" fill="#fff" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    document.body.append(c);
    addEventListener("mousemove", (e) => {
      c.style.left = `${e.clientX - 3}px`;
      c.style.top = `${e.clientY - 2}px`;
    });
    addEventListener("mousedown", () => (c.style.transform = "scale(.85)"));
    addEventListener("mouseup", () => (c.style.transform = ""));
  });
};

test("demo", async ({ browser }) => {
  const host = await startHost(browser, "Ava", { scene: true });
  const ctx = await browser.newContext({
    viewport: size,
    recordVideo: { dir: "../../docs/demo/raw", size },
  });
  await ctx.addInitScript(cursorScript);
  const page = await ctx.newPage();
  const glide = async (x: number, y: number, steps = 25) => page.mouse.move(x, y, { steps });

  // 1. Homepage + live demo doodle
  await page.goto("/");
  await page.waitForTimeout(1200);
  const demo = (await page.getByLabel(/Interactive demo/).boundingBox())!;
  await glide(demo.x + demo.width * 0.45, demo.y + demo.height * 0.35);
  await page.mouse.down();
  for (let i = 0; i <= 30; i++) {
    const a = (i / 30) * Math.PI * 2;
    await page.mouse.move(
      demo.x + demo.width * (0.55 + Math.cos(a) * 0.1),
      demo.y + demo.height * (0.45 + Math.sin(a) * 0.13),
    );
  }
  await page.mouse.up();
  await page.waitForTimeout(1500);

  // 2. Open the invite link and ask to join
  const url = new URL(host.inviteUrl);
  await page.goto(url.pathname + url.hash);
  await page.waitForTimeout(500);
  const name = page.getByLabel("Your name");
  await glide(640, 400);
  await name.click();
  await name.pressSequentially("Ben", { delay: 120 });
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Ask to join" }).click();
  await page.waitForTimeout(1300);

  // Host admits and grants control
  await expect.poll(async () => (await host.state()).pending.length).toBe(1);
  const guestId = (await host.state()).pending[0].guestId;
  await host.call("admit", guestId);
  await page.locator('[data-testid="input-layer"]').waitFor();
  await page.waitForTimeout(1200);

  // 3. Point, then draw on the shared tab
  const box = (await page.getByTestId("input-layer").boundingBox())!;
  await glide(box.x + box.width * 0.3, box.y + box.height * 0.4);
  await glide(box.x + box.width * 0.55, box.y + box.height * 0.5);
  await page.keyboard.press("d");
  await page.waitForTimeout(400);
  const cx = box.x + box.width * 0.62;
  const cy = box.y + box.height * 0.56;
  await glide(cx + 100, cy, 10);
  await page.mouse.down();
  for (let i = 0; i <= 36; i++) {
    const a = (i / 36) * Math.PI * 2.05;
    await page.mouse.move(cx + Math.cos(a) * 100, cy + Math.sin(a) * 75);
  }
  await page.mouse.up();
  await page.keyboard.press("d");
  await page.waitForTimeout(1500);

  // 4. Host grants control, guest pauses and seeks
  await host.call("setControl", guestId, true);
  await expect(page.getByText("You can control")).toBeVisible();
  await page.waitForTimeout(600);
  const pause = page.getByRole("button", { name: "Pause" });
  const pb = (await pause.boundingBox())!;
  await glide(pb.x + pb.width / 2, pb.y + pb.height / 2);
  await pause.click();
  await page.waitForTimeout(900);
  await page.keyboard.press("l");
  await page.waitForTimeout(1200);

  await ctx.close();
});
