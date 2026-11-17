import { expect, test } from "@playwright/test";
import { closeAll, joinAndAdmit, startHost } from "./helpers";

test.afterEach(closeAll);

test("a guest with control sends clicks, double-clicks and scrolls at the right spot", async ({
  browser,
}) => {
  const host = await startHost(browser);
  const { page, guestId } = await joinAndAdmit(browser, host, "Sam");
  await host.call("setControl", guestId, true);
  await expect(page.getByText("You can control")).toBeVisible();
  const box = await page.getByTestId("input-layer").boundingBox();
  if (!box) throw new Error("no input layer");

  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.75);
  await page.mouse.dblclick(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.wheel(0, 120);

  await expect
    .poll(
      async () =>
        (await host.received()).filter((r) => ["pointer", "wheel"].includes(r.message.type)).length,
    )
    .toBeGreaterThanOrEqual(4);
  const msgs = (await host.received())
    .map((r) => r.message)
    .filter((m) => m.type === "pointer" || m.type === "wheel");
  expect(msgs[0]).toMatchObject({ type: "pointer", kind: "click" });
  expect(msgs[0].x).toBeCloseTo(0.25, 1);
  expect(msgs[0].y).toBeCloseTo(0.75, 1);
  expect(msgs.map((m: any) => m.kind ?? m.type)).toEqual(["click", "click", "dblclick", "wheel"]);
  const wheel = msgs[3];
  // Scroll distance is scaled to the host's viewport (720px tall harness tab).
  expect(wheel.dy).toBeGreaterThan(0);
});

test("without control, clicks and scrolls stay local and explain why", async ({ browser }) => {
  const host = await startHost(browser);
  const { page } = await joinAndAdmit(browser, host, "Sam");
  const box = await page.getByTestId("input-layer").boundingBox();
  if (!box) throw new Error("no input layer");
  await page.mouse.click(box.x + 50, box.y + 50);
  await expect(page.getByText("The host hasn't given you control")).toBeVisible();
  await page.mouse.wheel(0, 200);
  await page.waitForTimeout(300);
  expect(
    (await host.received()).filter(
      (r) => r.message.type !== "cursor" && r.message.type !== "cursor-leave",
    ),
  ).toHaveLength(0);
});

test("injected clicks hit the element under the point, through the overlay and into iframes", async ({
  page,
}) => {
  await page.goto("/e2e-harness/overlay.html");
  const vw = await page.evaluate(() => window.innerWidth);
  const vh = await page.evaluate(() => window.innerHeight);
  // Center of #target (100,100 200x80)
  await page.evaluate(
    ([x, y]) => (window as any).__overlay.injector.inject({ kind: "click", x, y }),
    [200 / vw, 140 / vh],
  );
  await page.evaluate(
    ([x, y]) => (window as any).__overlay.injector.inject({ kind: "dblclick", x, y }),
    [200 / vw, 140 / vh],
  );
  expect(await page.evaluate(() => (window as any).__overlay.clicks)).toEqual([
    "target",
    "target",
    "dbl",
  ]);

  // Even while the host is drawing (overlay captures pointer), injection skips the overlay.
  await page.evaluate(() => (window as any).__overlay.overlay.setDrawing(true));
  await page.evaluate(
    ([x, y]) => (window as any).__overlay.injector.inject({ kind: "click", x, y }),
    [200 / vw, 140 / vh],
  );
  expect((await page.evaluate(() => (window as any).__overlay.clicks)).length).toBe(4);

  // Scroll inside the nested scroller.
  await page.evaluate(
    ([x, y]) => (window as any).__overlay.injector.inject({ kind: "wheel", x, y, dx: 0, dy: 300 }),
    [200 / vw, 360 / vh],
  );
  expect(await page.evaluate(() => document.getElementById("scroller")?.scrollTop)).toBe(300);
});

test("clicks on an iframe are handed to the extension, not posted to the page", async ({
  page,
}) => {
  await page.goto("/e2e-harness/overlay.html");
  const vw = await page.evaluate(() => window.innerWidth);
  const vh = await page.evaluate(() => window.innerHeight);
  // Track what the child frame's page can observe.
  await page.evaluate(() => {
    const f = document.getElementById("frame") as HTMLIFrameElement;
    (window as any).__seen = [];
    f.contentWindow?.addEventListener("message", (e) => (window as any).__seen.push(e.data));
  });
  // Point at 3/4 across and 1/3 down the iframe (left 400, top 100, 300x150).
  await page.evaluate(
    ([x, y]) => (window as any).__overlay.injector.inject({ kind: "click", x, y }),
    [(400 + 225) / vw, (100 + 50) / vh],
  );
  await page.waitForTimeout(100);
  const forwarded = await page.evaluate(() => (window as any).__overlay.forwarded);
  expect(forwarded).toHaveLength(1);
  expect(forwarded[0].input.kind).toBe("click");
  expect(forwarded[0].input.x).toBeCloseTo(0.75, 2);
  expect(forwarded[0].input.y).toBeCloseTo(1 / 3, 2);
  expect(forwarded[0].frameId).toBe(7);
  // Nothing about the input is posted into the page.
  expect(await page.evaluate(() => (window as any).__seen)).toEqual([]);
});

test("scrolling chains to the page once a nested scroller hits its end", async ({ page }) => {
  await page.goto("/e2e-harness/overlay.html");
  const vw = await page.evaluate(() => window.innerWidth);
  const vh = await page.evaluate(() => window.innerHeight);
  await page.evaluate(() => {
    const s = document.getElementById("scroller") as HTMLElement;
    s.scrollTop = s.scrollHeight;
  });
  await page.evaluate(
    ([x, y]) => (window as any).__overlay.injector.inject({ kind: "wheel", x, y, dx: 0, dy: 200 }),
    [200 / vw, 360 / vh],
  );
  expect(await page.evaluate(() => window.scrollY)).toBe(200);
});
