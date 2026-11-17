import { expect, test } from "@playwright/test";
import { closeAll, joinAndAdmit, startHost } from "./helpers";

test.afterEach(closeAll);

test("guest pointer and strokes reach the host as cursor and stroke messages", async ({
  browser,
}) => {
  const host = await startHost(browser);
  const { page } = await joinAndAdmit(browser, host, "Sam");
  const layer = page.getByTestId("input-layer");
  const box = await layer.boundingBox();
  if (!box) throw new Error("no input layer");

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect
    .poll(async () => (await host.received()).some((r) => r.message.type === "cursor"))
    .toBe(true);
  const cursor = (await host.received()).find((r) => r.message.type === "cursor")?.message;
  expect(cursor.x).toBeCloseTo(0.5, 1);
  expect(cursor.y).toBeCloseTo(0.5, 1);

  // Draw without control: drawing is allowed for everyone.
  await page.keyboard.press("d");
  await expect(page.getByRole("button", { name: "Draw mode" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + 100 + i * 20, box.y + 100 + i * 8);
  await page.mouse.up();

  await expect
    .poll(async () => (await host.received()).map((r) => r.message.type))
    .toEqual(expect.arrayContaining(["stroke-start", "stroke-point", "stroke-end"]));
  const types = (await host.received()).map((r) => r.message.type);
  expect(types.indexOf("stroke-start")).toBeLessThan(types.lastIndexOf("stroke-end"));
  // Clicks while drawing are not forwarded as page clicks.
  expect(types).not.toContain("pointer");
});

test("the in-tab overlay draws named cursors and strokes that fade after ~3s", async ({ page }) => {
  await page.goto("/e2e-harness/overlay.html");
  const ink = () => page.evaluate(() => (window as any).__overlay.overlayInk());
  expect(await ink()).toBe(0);

  await page.evaluate(() => {
    const o = (window as any).__overlay.overlay;
    o.cursor("guest001", 0.5, 0.5);
    o.strokeStart("guest001", "s1", 0.1, 0.1);
    for (let i = 1; i < 20; i++) o.strokePoint("guest001", "s1", 0.1 + i * 0.02, 0.1 + i * 0.01);
    o.strokeEnd("guest001", "s1");
  });
  await expect.poll(ink).toBeGreaterThan(200);
  const withCursorOnly = async () => {
    await page.evaluate(() => (window as any).__overlay.overlay.hideCursor("guest001"));
    await page.evaluate(() => (window as any).__overlay.overlay.hideCursor("__host"));
    return ink();
  };
  // Still visible right after drawing…
  expect(await withCursorOnly()).toBeGreaterThan(100);
  // …and gone after the fade (3s delay + 0.5s fade).
  await page.waitForTimeout(3_800);
  expect(await withCursorOnly()).toBe(0);
});

test("the overlay never blocks the page unless the host is drawing", async ({ page }) => {
  await page.goto("/e2e-harness/overlay.html");
  await page.getByRole("button", { name: "Target" }).click();
  expect(await page.evaluate(() => (window as any).__overlay.clicks)).toEqual(["target"]);

  // Hold Alt to draw: the overlay captures the drag instead of the page.
  await page.keyboard.down("Alt");
  await page.mouse.move(150, 130);
  await page.mouse.down();
  await page.mouse.move(250, 140);
  await page.mouse.up();
  await page.keyboard.up("Alt");
  expect(await page.evaluate(() => (window as any).__overlay.clicks)).toEqual(["target"]);
  expect(await page.evaluate(() => (window as any).__overlay.overlayInk())).toBeGreaterThan(50);
});

test("pinned draw mode is cancelled with Escape and reported to the host UI", async ({ page }) => {
  await page.goto("/e2e-harness/overlay.html");
  await page.evaluate(() => (window as any).__overlay.overlay.setDrawing(true));
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => (window as any).__overlay.drawingChanges)).toEqual([false]);
});
