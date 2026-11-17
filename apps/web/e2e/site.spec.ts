import { expect, test } from "@playwright/test";

test("homepage links to the extension page and privacy policy", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Watch together/ })).toBeVisible();
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Privacy" })
    .click();
  await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
  await expect(page.getByText("Limited Use", { exact: false }).first()).toBeVisible();
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Extension", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Cursor Watchalong for Chrome" })).toBeVisible();
  await expect(page.getByText("What the extension can access, and why")).toBeVisible();
});

test("the live demo lets visitors draw", async ({ page }) => {
  await page.goto("/");
  const demo = page.getByLabel(/Interactive demo/);
  const box = await demo.boundingBox();
  if (!box) throw new Error("no demo");
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 150, { steps: 10 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Pause demo" }).click();
  await expect(page.getByText("Paused for everyone")).toBeVisible();
});

test("FAQ answers expand", async ({ page }) => {
  await page.goto("/#faq");
  await page.getByText("Do my friends need to install anything?").click();
  await expect(page.getByText("Only the host uses the Chrome extension")).toBeVisible();
});

test("unknown pages and incomplete invites explain themselves", async ({ page }) => {
  await page.goto("/nope");
  await expect(page.getByText("This page doesn't exist")).toBeVisible();
  await page.goto("/r/abcDEF123456");
  await expect(page.getByText("This invite link is incomplete")).toBeVisible();
});
