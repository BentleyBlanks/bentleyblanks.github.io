// 图标后期：把生成图的白底抠成透明、裁掉留白、压到图标尺寸。
// 生成器出的是白底方图，游戏里要叠在深色面板上，必须先抠底。
// 用无头浏览器的 canvas 做（本仓库没有 node-canvas 依赖）。
// 运行：node TunnelLight1943/Script_IconBake.mjs

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const iconDir = path.join(projectDir, "Icon");
const rootDir = path.resolve(projectDir, "..");

const JOBS = [
  { src: "_lamp_raw.png", out: "Icon_Lamp.png", size: 384 },
  { src: "_ground_raw.png", out: "Icon_ChoiceGround.png", size: 512 },
  { src: "_tunnel_raw.png", out: "Icon_ChoiceTunnel.png", size: 512 },
];

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
await page.goto(`http://127.0.0.1:${port}/TunnelLight1943/index.html`, { waitUntil: "domcontentloaded" });

for (const job of JOBS) {
  const srcPath = path.join(iconDir, job.src);
  if (!fs.existsSync(srcPath)) { console.log(`跳过（缺文件）：${job.src}`); continue; }
  const url = `http://127.0.0.1:${port}/TunnelLight1943/Icon/${job.src}`;
  const dataUrl = await page.evaluate(async ({ url, size }) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const w = img.naturalWidth, h = img.naturalHeight;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h);
    const px = data.data;
    // 抠白底：越接近纯白越透明；同时保住浅色水彩（用亮度+饱和度共同判断）
    let minX = w, minY = h, maxX = 0, maxY = 0;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], g = px[i + 1], b = px[i + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const sat = mx === 0 ? 0 : (mx - mn) / mx;
      const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
      let a = 255;
      if (sat < 0.10) {
        // 近乎无彩：按亮度线性抠掉（1.0 全透明，0.86 起开始渐隐）
        a = Math.round(Math.max(0, Math.min(1, (0.985 - lum) / 0.125)) * 255);
      }
      px[i + 3] = a;
      if (a > 24) {
        const p = i / 4;
        const x = p % w, y = (p / w) | 0;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    ctx.putImageData(data, 0, 0);
    // 裁掉四周留白后按正方形居中压缩
    const bw = Math.max(1, maxX - minX), bh = Math.max(1, maxY - minY);
    const side = Math.max(bw, bh);
    const out = document.createElement("canvas");
    out.width = size; out.height = size;
    const octx = out.getContext("2d");
    octx.imageSmoothingQuality = "high";
    const pad = side * 0.06;
    octx.drawImage(c,
      minX - (side - bw) / 2 - pad, minY - (side - bh) / 2 - pad, side + pad * 2, side + pad * 2,
      0, 0, size, size);
    return out.toDataURL("image/png");
  }, { url, size: job.size });

  const buf = Buffer.from(dataUrl.split(",")[1], "base64");
  fs.writeFileSync(path.join(iconDir, job.out), buf);
  console.log(`✓ ${job.out}  ${(buf.length / 1024).toFixed(0)} KB`);
}

await browser.close();
server.close();
console.log("图标烘焙完成");
