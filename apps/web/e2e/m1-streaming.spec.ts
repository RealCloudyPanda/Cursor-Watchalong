import { expect, test } from "@playwright/test";
import {
  admitNext,
  audioLevel,
  closeAll,
  decodedFrames,
  expectStreaming,
  joinAndAdmit,
  requestJoin,
  startHost,
} from "./helpers";

test.afterEach(closeAll);

test("guest asks to join, host admits, guest receives live video and audio", async ({
  browser,
}) => {
  const host = await startHost(browser);
  const guest = await requestJoin(browser, host.inviteUrl, "Sam");
  await expect(guest.getByText("Waiting for the host")).toBeVisible();

  await admitNext(host, "Sam");
  await expectStreaming(guest);

  const tracks = await guest.evaluate(() => {
    const v = document.querySelector<HTMLVideoElement>('[data-testid="stream"]');
    const s = v?.srcObject as MediaStream | null;
    return s
      ? s
          .getTracks()
          .map((t) => t.kind)
          .sort()
      : [];
  });
  expect(tracks).toEqual(["audio", "video"]);

  await expect
    .poll(async () => (await host.state()).guests[0]?.connection, { timeout: 15_000 })
    .toBe("connected");
  await expect(guest.getByText("Live", { exact: true })).toBeVisible();

  // New frames keep being decoded (not a single frozen frame)...
  const f1 = await decodedFrames(guest);
  await guest.waitForTimeout(1_000);
  expect(await decodedFrames(guest)).toBeGreaterThan(f1 + 10);
  // ...and the host's tone is actually audible, not a silent track.
  await expect.poll(() => audioLevel(guest), { timeout: 10_000 }).toBeGreaterThan(0.01);
});

test("roster shows host and guest with their colors", async ({ browser }) => {
  const host = await startHost(browser, "Ava");
  const { page } = await joinAndAdmit(browser, host, "Sam");
  await page.getByRole("button", { name: /people in the room/ }).click();
  await expect(page.getByText("Ava")).toBeVisible();
  await expect(page.getByText("Sam (you)")).toBeVisible();
});

test("denied guest sees a clear message", async ({ browser }) => {
  const host = await startHost(browser);
  const guest = await requestJoin(browser, host.inviteUrl, "Eve");
  await expect.poll(async () => (await host.state()).pending.length).toBe(1);
  await host.call("deny", (await host.state()).pending[0].guestId);
  await expect(guest.getByText("The host didn't let you in")).toBeVisible();
});

test("a tampered invite secret is rejected", async ({ browser }) => {
  const host = await startHost(browser);
  const page = await requestJoin(
    browser,
    host.inviteUrl.replace(/#k=.*/, "#k=wrong-secret-wrong-secret"),
    "Mallory",
  );
  await expect(page.getByText("This invite link is invalid")).toBeVisible();
  expect((await host.state()).pending).toHaveLength(0);
});

test("ending the session ends it for guests", async ({ browser }) => {
  const host = await startHost(browser);
  const { page } = await joinAndAdmit(browser, host, "Sam");
  await host.call("end", "host-ended");
  await expect(page.getByText("The session has ended")).toBeVisible();
});

test("kicked guest is removed and told so", async ({ browser }) => {
  const host = await startHost(browser);
  const { page, guestId } = await joinAndAdmit(browser, host, "Sam");
  await host.call("kick", guestId);
  await expect(page.getByText("You were removed from the session")).toBeVisible();
  await expect.poll(async () => (await host.state()).guests.length).toBe(0);
});

test("guest leaving frees their slot on the host", async ({ browser }) => {
  const host = await startHost(browser);
  const { page } = await joinAndAdmit(browser, host, "Sam");
  await page.getByRole("button", { name: "Leave session" }).click();
  await expect(page.getByText("You left the session")).toBeVisible();
  await expect.poll(async () => (await host.state()).guests.length).toBe(0);
});

test("two guests stream at the same time", async ({ browser }) => {
  const host = await startHost(browser);
  const a = await joinAndAdmit(browser, host, "Ann");
  const b = await joinAndAdmit(browser, host, "Ben");
  await expectStreaming(a.page);
  await expectStreaming(b.page);
  await expect.poll(async () => (await host.state()).guests.length).toBe(2);
});
