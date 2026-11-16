import { expect, test } from "@playwright/test";
import { closeAll, decodedFrames, joinAndAdmit, startHost } from "./helpers";

test.afterEach(closeAll);

const dropHostSocket = (host: { page: import("@playwright/test").Page }) =>
  host.page.evaluate(() => (window as any).__host.session.ws?.close());
const dropGuestSocket = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as any).__guest.ws?.close());

async function expectFramesFlowing(page: import("@playwright/test").Page) {
  const f1 = await decodedFrames(page);
  await expect.poll(() => decodedFrames(page), { timeout: 20_000 }).toBeGreaterThan(f1 + 10);
}

test("host signaling drop: guests keep watching and the host resumes", async ({ browser }) => {
  const host = await startHost(browser);
  const { page } = await joinAndAdmit(browser, host, "Sam");
  await dropHostSocket(host);
  await expect(page.getByText("Host reconnecting")).toBeVisible();
  await expect.poll(async () => (await host.state()).status, { timeout: 15_000 }).toBe("live");
  await expect(page.getByText("Host reconnecting")).toBeHidden();
  await expectFramesFlowing(page);
});

test("guest signaling drop: guest rejoins without approval and gets a fresh stream", async ({
  browser,
}) => {
  const host = await startHost(browser);
  const { page, guestId } = await joinAndAdmit(browser, host, "Sam");
  await dropGuestSocket(page);
  await expect
    .poll(async () => (await host.state()).guests.map((g: any) => g.id), { timeout: 15_000 })
    .toEqual([guestId]);
  expect((await host.state()).pending).toHaveLength(0);
  await expectFramesFlowing(page);
});

test("guest rejoining while the host is away is reconciled when the host resumes", async ({
  browser,
}) => {
  const host = await startHost(browser);
  const { page, guestId } = await joinAndAdmit(browser, host, "Sam");
  await dropHostSocket(host);
  await dropGuestSocket(page);
  await expect.poll(async () => (await host.state()).status, { timeout: 15_000 }).toBe("live");
  await expect
    .poll(async () => (await host.state()).guests[0]?.connection, { timeout: 20_000 })
    .toBe("connected");
  expect((await host.state()).guests.map((g: any) => g.id)).toEqual([guestId]);
  await expectFramesFlowing(page);
});
