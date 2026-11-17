import { expect, test } from "@playwright/test";
import { closeAll, joinAndAdmit, requestJoin, startHost } from "./helpers";

/**
 * Regenerates the README screenshots in docs/screenshots.
 * Opt-in: SCREENSHOTS=1 pnpm --filter @watchalong/web e2e readme-screenshots
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to regenerate README screenshots");
test.afterEach(closeAll);

const out = "../../docs/screenshots";
const desktop = { width: 1440, height: 900 };

test("website screens", async ({ browser, page }) => {
  await page.setViewportSize(desktop);
  await page.goto("/");
  await page.screenshot({ path: `${out}/landing.png` });

  const host = await startHost(browser, "Ava", { scene: true });
  const path = new URL(host.inviteUrl).pathname + new URL(host.inviteUrl).hash;

  const join = await (await browser.newContext()).newPage();
  await join.setViewportSize(desktop);
  await join.goto(path);
  await join.getByLabel("Your name").fill("Ben");
  await join.screenshot({ path: `${out}/join.png` });

  const waiting = await requestJoin(browser, host.inviteUrl, "Dana");
  await waiting.setViewportSize(desktop);
  await expect(waiting.getByText("Waiting for the host")).toBeVisible();
  await waiting.waitForTimeout(600);
  await waiting.screenshot({ path: `${out}/waiting.png` });

  const { page: room, guestId } = await joinAndAdmit(browser, host, "Ben");
  await host.call("setControl", guestId, true);
  await room.setViewportSize(desktop);
  await expect(room.getByText("You can control")).toBeVisible();
  await room.waitForTimeout(1_000);
  // Draw a circle with the guest's pen so the screenshot shows drawing in action.
  await room.keyboard.press("d");
  const box = await room.getByTestId("input-layer").boundingBox();
  if (!box) throw new Error("no input layer");
  const cx = box.x + box.width * 0.62;
  const cy = box.y + box.height * 0.56;
  await room.mouse.move(cx + 90, cy);
  await room.mouse.down();
  for (let i = 1; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2.05;
    await room.mouse.move(cx + Math.cos(a) * 90, cy + Math.sin(a) * 70);
  }
  await room.mouse.up();
  await room.mouse.move(cx + 130, cy + 60);
  await room.screenshot({ path: `${out}/room.png` });

  await page.goto("/privacy");
  await page.screenshot({ path: `${out}/privacy.png` });
});

test("extension screens", async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 1040 });
  await page.goto("/e2e-harness/extension.html?page=sidepanel");
  await expect(page.getByText("Invite link")).toBeVisible();
  await page.screenshot({ path: `${out}/side-panel.png` });

  await page.setViewportSize({ width: 320, height: 420 });
  await page.goto("/e2e-harness/extension.html?page=popup");
  await expect(page.getByRole("button", { name: "Start sharing this tab" })).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/popup.png`, fullPage: true });
});
