import { expect, test } from "@playwright/test";
import { closeAll, joinAndAdmit, startHost } from "./helpers";

test.afterEach(closeAll);

test("guests without control see disabled playback and can't send commands", async ({
  browser,
}) => {
  const host = await startHost(browser);
  const { page } = await joinAndAdmit(browser, host, "Sam");
  await expect(page.getByRole("button", { name: "Pause" })).toBeDisabled();
  await page.keyboard.press("k");
  await expect(page.getByText("The host hasn't given you control")).toBeVisible();
  await page.waitForTimeout(300);
  expect((await host.received()).filter((r) => r.message.type === "media")).toHaveLength(0);
});

test("with control, a guest pauses, seeks and mutes the host's video", async ({ browser }) => {
  const host = await startHost(browser);
  const { page, guestId } = await joinAndAdmit(browser, host, "Sam");
  await host.call("setControl", guestId, true);
  await expect(page.getByText("You can control")).toBeVisible();
  await expect(page.getByText("0:12 / 5:00").or(page.getByText(/0:1\d \/ 5:00/))).toBeVisible();

  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
  await page.keyboard.press("l");
  await page.keyboard.press("m");

  const media = (await host.received())
    .filter((r) => r.message.type === "media")
    .map((r) => r.message);
  expect(media).toEqual([
    { type: "media", action: "toggle" },
    { type: "media", action: "seekBy", value: 10 },
    { type: "media", action: "mute" },
  ]);
  expect((await host.received())[0]?.from.name).toBe("Sam");
});

test("other guests see who paused", async ({ browser }) => {
  const host = await startHost(browser);
  const a = await joinAndAdmit(browser, host, "Ann");
  const b = await joinAndAdmit(browser, host, "Ben");
  await host.call("setControlForAll", true);
  await expect(a.page.getByText("You can control")).toBeVisible();
  await a.page.getByRole("button", { name: "Pause" }).click();
  await expect(b.page.getByText("Ann paused")).toBeVisible();
  expect((await host.state()).activity[0]).toMatchObject({ name: "Ann", text: "paused" });
});

test("revoking control takes effect immediately", async ({ browser }) => {
  const host = await startHost(browser);
  const { page, guestId } = await joinAndAdmit(browser, host, "Sam");
  await host.call("setControl", guestId, true);
  await expect(page.getByRole("button", { name: "Pause" })).toBeEnabled();
  await host.call("setControl", guestId, false);
  await expect(page.getByRole("button", { name: "Pause" })).toBeDisabled();
});
