// 单件预览：把某个绘制函数单独渲成一张图，接进游戏前先看清楚形状。
// 运行：node TunnelLight1943/Script_ArtPreview.mjs <输出png> <what>
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(process.argv[2] || "./preview.png");
const what = process.argv[3] || "shoulder";
const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1200, height: 620 } });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
await page.goto(`http://127.0.0.1:${port}/TunnelLight1943/index.html`, { waitUntil: "domcontentloaded" });
const dataUrl = await page.evaluate(async (what) => {
  const ART = await import("./Script_Art.mjs");
  const kinds = ["player", "father", "sister", "militia", "soldier", "puppet"];
  const cw = 380, chh = 560;
  const c = document.createElement("canvas");
  c.width = cw * kinds.length; c.height = chh;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#c9bda2";
  ctx.fillRect(0, 0, c.width, c.height);
  kinds.forEach((k, i) => {
    ctx.save();
    ctx.translate(i * cw, 0);
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.strokeRect(0.5, 0.5, cw - 1, chh - 1);
    if (what === "shoulder") ART.DrawShoulder(ctx, cw * 0.55, chh * 0.46, 1.25, k, "prev" + k);
    ctx.fillStyle = "#2b1f16";
    ctx.font = "20px sans-serif";
    ctx.fillText(k, 12, 28);
    ctx.restore();
  });
  return c.toDataURL("image/png");
}, what);
fs.writeFileSync(out, Buffer.from(dataUrl.split(",")[1], "base64"));
await browser.close(); server.close();
console.log(errs.length ? ("ERR: " + errs[0]) : `✓ ${out}`);
