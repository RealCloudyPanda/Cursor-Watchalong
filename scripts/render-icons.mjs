// Renders apps/extension/assets/icon.svg to the PNG sizes Chrome and the Web Store need.
// Usage: node scripts/render-icons.mjs  (uses the Playwright already installed for e2e)
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(`${root}apps/web/package.json`);
const { chromium } = require("@playwright/test");

const svg = readFileSync(`${root}apps/extension/assets/icon.svg`, "utf8");
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
await page.setContent("<!doctype html><title>icons</title>");
const sizes = [16, 32, 48, 96, 128];
// Draw the SVG onto a canvas at each exact size (crisp, no viewport quirks).
const pngs = await page.evaluate(
  async ({ svg, sizes }) => {
    const img = new Image();
    img.src = `data:image/svg+xml;base64,${btoa(svg)}`;
    await img.decode();
    return sizes.map((size) => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, size, size);
      return canvas.toDataURL("image/png").split(",")[1];
    });
  },
  { svg, sizes },
);
sizes.forEach((size, i) => {
  writeFileSync(`${root}apps/extension/public/icon/${size}.png`, Buffer.from(pngs[i], "base64"));
});
await browser.close();
console.log("icons written to apps/extension/public/icon/");
