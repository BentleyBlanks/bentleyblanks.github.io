// 参考视频抽帧：给 K 动画当对照用。
//
// 本机没有 ffmpeg，就借无头浏览器：把 mp4 喂给 <video>，按时间点 seek，
// 每停一次画进 canvas 存一张 PNG。慢，但零依赖，而且和游戏共用同一套
// 浏览器工具链。
//
// 运行：node TunnelLight1943/Script_VideoFrames.mjs <mp4路径或URL> <输出目录> [帧数]
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const src = process.argv[2];
const outDir = path.resolve(process.argv[3] || "./frames");
const count = parseInt(process.argv[4] || "16", 10);
if (!src) { console.error("用法：Script_VideoFrames.mjs <mp4> <输出目录> [帧数]"); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });

// 远程 URL 先落到本地，再从本地静态服务喂给页面——绕开跨域取帧的污染限制
let localPath = src;
if (/^https?:/i.test(src)) {
  localPath = path.join(outDir, "_ref.mp4");
  const res = await fetch(src);
  if (!res.ok) { console.error("下载失败：" + res.status); process.exit(1); }
  fs.writeFileSync(localPath, Buffer.from(await res.arrayBuffer()));
  console.log(`已下载 ${(fs.statSync(localPath).size / 1e6).toFixed(1)} MB`);
}
const rel = path.relative(rootDir, localPath).split(path.sep).join("/");

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://127.0.0.1:${port}/TunnelLight1943/index.html`, { waitUntil: "domcontentloaded" });

const frames = await page.evaluate(async ({ url, count }) => {
  const v = document.createElement("video");
  v.muted = true;
  v.src = url;
  await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error("视频加载失败")); });
  const c = document.createElement("canvas");
  c.width = v.videoWidth; c.height = v.videoHeight;
  const ctx = c.getContext("2d");
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const t = (v.duration * i) / (count - 1);
    v.currentTime = Math.min(t, v.duration - 0.05);
    await new Promise((res) => { v.onseeked = res; });
    ctx.drawImage(v, 0, 0);
    out.push({ t: +t.toFixed(2), dataUrl: c.toDataURL("image/jpeg", 0.9) });
  }
  return out;
}, { url: `http://127.0.0.1:${port}/${rel}`, count });

for (const f of frames) {
  const name = `f${String(Math.round(f.t * 100)).padStart(4, "0")}.jpg`;
  fs.writeFileSync(path.join(outDir, name), Buffer.from(f.dataUrl.split(",")[1], "base64"));
}
await browser.close();
server.close();
console.log(`抽了 ${frames.length} 帧 → ${outDir}`);
