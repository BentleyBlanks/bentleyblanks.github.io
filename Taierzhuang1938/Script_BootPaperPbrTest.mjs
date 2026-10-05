// Real Worker/WebGL UI acceptance: all eleven pairs, visible shading, fallback,
// stale async decode, resource cleanup and selective loading. Screenshots stay local.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { BOOT_PAPERS, BootPaperPbrUrls } from "./Data_BootPapers.mjs";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "tmp/BootPaperPbr");
await fs.mkdir(output, { recursive: true });
const record = JSON.parse(await fs.readFile(path.join(import.meta.dirname, "_import/TextureBakes/Data_BootPaperPbr.json"), "utf8"));
assert.equal(record.records.length, BOOT_PAPERS.length);
assert.equal(new Set(record.records.map(r => r.sourceHash)).size, BOOT_PAPERS.length);
for (const paper of BOOT_PAPERS) {
  const entry = record.records.find(r => r.id === paper.id);
  const base = await fs.readFile(path.join(import.meta.dirname, BootPaperPbrUrls(paper).base.split("?")[0]));
  assert.equal(crypto.createHash("sha256").update(base).digest("hex"), entry.baseHash, "original print stays byte-identical");
  const [normal, rough] = await Promise.all(["normal", "roughness"].map(async channel => {
    const rel = BootPaperPbrUrls(paper)[channel].split("?")[0];
    return sharp(await fs.readFile(path.join(import.meta.dirname, rel))).raw().toBuffer({ resolveWithObject: true });
  }));
  assert.equal(normal.info.width, rough.info.width); assert.equal(normal.info.height, rough.info.height);
  let variance = 0, roughMin = 255, roughMax = 0;
  for (let i = 0; i < normal.data.length; i += 3) {
    const n = [...normal.data.subarray(i, i + 3)].map(v => v / 255 * 2 - 1);
    assert.ok(Math.abs(Math.hypot(...n) - 1) < 0.012, `${paper.id}: unit tangent normal`);
    assert.ok(n[2] > 0.5, "shallow, front-facing relief");
    variance += Math.abs(n[0]) + Math.abs(n[1]);
    const j = i / 3 * 4;
    if (rough.data[j + 3]) { roughMin = Math.min(roughMin, rough.data[j]); roughMax = Math.max(roughMax, rough.data[j]); }
  }
  assert.ok(variance / (normal.data.length / 3) > 0.025, "non-flat normal map");
  assert.ok(roughMin >= 190 && roughMax <= 242 && roughMax > roughMin, "matte but spatially varying roughness");
  assert.equal(rough.data[3], 0, "exterior does not receive specular light");
}
console.log("PASS 11 unique sources, unchanged print, normalized normals, matte roughness and coverage");

const server = await ServeRoot(root, 0);
const browser = await LaunchBrowser();
const errors = [], requests = [], reports = [];
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on("pageerror", e => errors.push(String(e)));
  page.on("request", r => { if (r.url().includes("/BootPaper/")) requests.push(r.url()); });
  const html = await fs.readFile(path.join(import.meta.dirname, "index.html"), "utf8");
  const fixture = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    ${html.match(/<script type="importmap">[\s\S]*?<\/script>/)[0]}
    <link rel="stylesheet" href="./Style_Game.css"><style>#bootPaperSurface{animation:none}</style>
    </head><body>${html.slice(html.indexOf('<div id="boot">'), html.indexOf('<div id="menu">'))}</body></html>`;
  await page.route("**/_check_BootPaperPbr.html*", r => r.fulfill({ contentType: "text/html", body: fixture }));
  const base = `http://127.0.0.1:${server.address().port}/Taierzhuang1938/`;
  await page.goto(base + "_check_BootPaperPbr.html?quality=high");
  await page.evaluate(async () => {
    const { BootPaper } = await import("./Script_BootPaper.mjs");
    const { BOOT_PAPERS } = await import("./Data_BootPapers.mjs");
    window.ShowPaper = index => {
      window.paper?.Dispose();
      const img = document.querySelector("#bootPaper");
      window.paper = new BootPaper({ img,
        sub: document.querySelector("#bootSub"), name: document.querySelector("#bootPaperName"), note: document.querySelector("#bootPaperNote") });
      localStorage.removeItem("tzBootPaperLast");
      const random = Math.random;
      try { Math.random = () => (index + 0.1) / BOOT_PAPERS.length; window.paper.Show(); }
      finally { Math.random = random; }
    };
  });
  const Show = async index => {
    await page.evaluate(i => window.ShowPaper(i), index);
    await page.waitForFunction(() => window.paper.surface?.ready, null, { timeout: 20000 });
    await page.locator(".bootPaperPbr").evaluate(el => { el.style.transition = "none"; });
  };
  for (let index = 0; index < BOOT_PAPERS.length; index++) {
    requests.length = 0; await Show(index);
    const file = `Paper_${BOOT_PAPERS[index].id}.png`;
    await page.screenshot({ path: path.join(output, file), animations: "disabled" });
    const unique = [...new Set(requests.map(url => new URL(url).pathname))];
    assert.equal(unique.length, 3, "only chosen base/normal/roughness requested");
    assert.ok(unique.every(url => url.includes(BOOT_PAPERS[index].id)));
    reports.push({ id: BOOT_PAPERS[index].id, requests: unique, screenshot: file });
  }
  await Show(0);
  const Pixels = async () => sharp(await page.locator(".bootPaperPbr").screenshot()).removeAlpha().raw().toBuffer();
  const Difference = (a, b) => a.reduce((sum, v, i) => sum + Math.abs(v - b[i]), 0) / a.length;
  const before = await Pixels();
  await page.evaluate(() => window.paper.surface.SetTilt({ yaw: 32, pitch: -18 }));
  await page.waitForTimeout(100);
  const tilted = await Pixels();
  assert.ok(Difference(before, tilted) > 2, "lighting responds to inclination");
  await page.evaluate(() => window.paper.surface.SetTilt({ yaw: 0, pitch: 0 }, true));
  await page.waitForTimeout(1100);
  assert.ok(Difference(before, await Pixels()) < 0.2, "lighting returns to rest");
  // Replace one data channel at a time at the network boundary. The production
  // shader must visibly consume BOTH maps, rather than merely downloading them.
  const flat = await sharp({ create: { width: 1, height: 1, channels: 3, background: { r: 128, g: 128, b: 255 } } }).png().toBuffer();
  await page.route("**/*Normal.webp*", r => r.fulfill({ contentType: "image/png", body: flat }));
  await Show(0);
  const flatPixels = await Pixels();
  assert.ok(Difference(before, flatPixels) > 0.15, "normal map changes rendered pixels");
  await page.unroute("**/*Normal.webp*");
  const originalRough = path.join(import.meta.dirname, BootPaperPbrUrls(BOOT_PAPERS[0]).roughness.split("?")[0]);
  const roughPixels = await sharp(originalRough).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < roughPixels.data.length; i += 4) roughPixels.data.fill(166, i, i + 3);
  // Preserve coverage exactly: only roughness changes, so exterior highlights
  // cannot produce a false positive for an unconnected roughness sampler.
  const rough = await sharp(roughPixels.data, { raw: roughPixels.info }).png().toBuffer();
  await page.route("**/*RoughnessMask.webp*", r => r.fulfill({ contentType: "image/png", body: rough }));
  await Show(0);
  assert.ok(Difference(before, await Pixels()) > 0.1, "roughness changes rendered pixels");
  await page.unroute("**/*RoughnessMask.webp*");
  await Show(0);
  const box = await page.locator("#bootPaperWrap").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2 + 50);
  assert.ok(await page.evaluate(() => window.paper.pointerId !== null && window.paper.tilt.yaw > 0));
  await page.screenshot({ path: path.join(output, "Dragged.png"), animations: "disabled" });
  await page.mouse.up();
  await page.waitForTimeout(1000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(output, "Mobile.png"), animations: "disabled" });
  assert.ok(await page.locator(".bootPaperPbr").isVisible());
  await page.evaluate(() => { window.oldSurface = window.paper.surface; window.paper.Hide(); });
  assert.ok(await page.evaluate(() => window.oldSurface.disposed && !window.oldSurface.worker && !document.querySelector(".bootPaperPbr")), "hide frees worker/canvas");
  await page.route("**/*Normal.webp*", r => r.fulfill({ status: 404, body: "fixture missing normal" }));
  await page.evaluate(() => window.ShowPaper(0));
  await page.waitForFunction(() => window.paper.surface?.disposed);
  assert.ok(await page.locator("#bootPaper.on").isVisible(), "missing map leaves original visible");
  await page.unroute("**/*Normal.webp*");
  await page.evaluate(() => {
    window.ShowPaper(1); window.paper.Hide();
  });
  await page.waitForTimeout(250);
  assert.equal(await page.locator(".bootPaperPbr").count(), 0, "late decode never recreates hidden surface");
  await page.evaluate(() => {
    const NativeWorker = window.Worker;
    window.Worker = class { constructor() { throw new Error("fixture worker unavailable"); } };
    window.ShowPaper(0); window.restoreWorker = () => { window.Worker = NativeWorker; };
  });
  await page.waitForFunction(() => window.paper.surface?.disposed);
  assert.ok(await page.locator("#bootPaper.on").isVisible(), "worker failure keeps original image");
  await page.evaluate(() => { window.restoreWorker(); window.paper.Dispose(); });
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(output, "Report.json"), JSON.stringify({ reports, lightingDifference: Difference(before, tilted), normalDifference: Difference(before, flatPixels), errors }, null, 2));
  console.log("PASS all 11 surfaces, per-paper requests, normal/roughness pixel effect, tilt/return, mobile, fallback and disposal");
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
