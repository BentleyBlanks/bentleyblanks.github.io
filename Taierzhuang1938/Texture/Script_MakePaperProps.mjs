// 纸品道具贴图生成器（Tex_Paper*.png）。
//
// 为什么是「分层合成」而不是直接生图：AI 生图写不对汉字，一定出乱码。
// 所以 AI（或纯程序化）只负责**做旧纸底**，所有文字由本脚本用系统字体
// 逐字绝对定位排版（竖排右起、手写抖动），最后用无头浏览器整页截图。
//
//   node Taierzhuang1938/Texture/Script_MakePaperProps.mjs
//   node Taierzhuang1938/Texture/Script_MakePaperProps.mjs --only=letter --keep
//   node Taierzhuang1938/Texture/Script_MakePaperProps.mjs --bases=<放 base_*.png 的目录>
//
// --bases 指向 AI 出的空白纸底（base_leaflet/base_news/base_letter/base_map.png）。
// 纸底只取其亮度，色相由本脚本按道具重新上色（canvas 'color' 混合），
// 目录缺图就整张走程序化做旧，不会失败。
//
// 浏览器一律走仓库既有的 LaunchBrowser + ServeRoot，不裸写 puppeteer。

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "../Script_DevServer.mjs";

const textureDir = path.dirname(fileURLToPath(import.meta.url));

const args = new Map(process.argv.slice(2)
  .filter((a) => a.startsWith("--"))
  .map((a) => {
    const eq = a.indexOf("=");
    return eq < 0 ? [a.slice(2), true] : [a.slice(2, eq), a.slice(eq + 1)];
  }));
const only = args.get("only") ? String(args.get("only")).split(",") : null;
const keep = args.has("keep");
const basesDir = args.get("bases") ? path.resolve(String(args.get("bases"))) : null;

// ---------------------------------------------------------------------------
// 道具清单。text 里的每一条最终都要能逐字读出来。
// 传单/报纸用繁体（1938 年铅印实况），家信用简体（策划案给的原句，且是粗手写）。
// ---------------------------------------------------------------------------
const PROPS = [
  { key: "leaflet", out: "Tex_PaperLeaflet.png", w: 1024, h: 1536, base: "base_leaflet.png" },
  { key: "news", out: "Tex_PaperNewspaper.png", w: 1024, h: 1448, base: "base_news.png" },
  { key: "letter", out: "Tex_PaperLetter.png", w: 1024, h: 1536, base: "base_letter.png" },
  { key: "map", out: "Tex_PaperEndingMap.png", w: 1536, h: 1024, base: "base_map.png" },
];

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "paperprops-"));

// 纸底：有就拷进工作目录（同源才能被 canvas 读像素）。
const baseAvailable = new Map();
for (const prop of PROPS) {
  if (!basesDir) continue;
  const src = path.join(basesDir, prop.base);
  if (!fs.existsSync(src)) continue;
  fs.copyFileSync(src, path.join(workDir, prop.base));
  baseAvailable.set(prop.key, prop.base);
}

for (const prop of PROPS) {
  fs.writeFileSync(
    path.join(workDir, `${prop.key}.html`),
    BuildHtml(prop, baseAvailable.get(prop.key) ?? null),
    "utf8",
  );
}

const server = await ServeRoot(workDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const report = [];
for (const prop of PROPS) {
  if (only && !only.includes(prop.key)) continue;
  const page = await browser.newPage({
    viewport: { width: prop.w, height: prop.h },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 300)); });
  await page.goto(`http://127.0.0.1:${port}/${prop.key}.html`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => window.__paperReady === true, null, { timeout: 60000 });
  const fonts = await page.evaluate(() => window.__fontReport);
  const outPath = path.join(textureDir, prop.out);
  await page.screenshot({ path: outPath, type: "png" });
  await page.close();
  const missing = Object.entries(fonts || {}).filter(([, ok]) => !ok).map(([n]) => n);
  report.push({
    prop: prop.key,
    out: prop.out,
    size: `${prop.w}x${prop.h}`,
    bytes: fs.statSync(outPath).size,
    base: baseAvailable.has(prop.key) ? "AI 纸底" : "程序化纸底",
    missingFonts: missing,
    errors,
  });
}
await browser.close();
server.close();
if (keep) console.log(`工作目录保留：${workDir}`);
else fs.rmSync(workDir, { recursive: true, force: true });
for (const row of report) {
  console.log(
    `${row.out.padEnd(26)} ${row.size.padEnd(10)} ${(row.bytes / 1024).toFixed(0).padStart(5)} KB  ${row.base}` +
    (row.missingFonts.length ? `  缺字体:${row.missingFonts.join("/")}` : "") +
    (row.errors.length ? `  页面报错:${row.errors[0]}` : ""),
  );
}

// ---------------------------------------------------------------------------

function BuildHtml(prop, baseFile) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<style>
  html,body{margin:0;padding:0;background:#000;}
  #stage{position:relative;width:${prop.w}px;height:${prop.h}px;overflow:hidden;}
  #paper,#grime{position:absolute;inset:0;}
  #grime{mix-blend-mode:multiply;}
  .layer{position:absolute;inset:0;}
  .ink{mix-blend-mode:multiply;}
  .ch{position:absolute;line-height:1;white-space:pre;text-align:center;transform-origin:50% 50%;}
</style></head><body>
<div id="stage">
  <canvas id="paper" width="${prop.w}" height="${prop.h}"></canvas>
  <div class="layer ink" id="ink"></div>
  <canvas id="grime" width="${prop.w}" height="${prop.h}"></canvas>
</div>
<script>
const W = ${prop.w}, H = ${prop.h};
const KEY = ${JSON.stringify(prop.key)};
const BASE_FILE = ${JSON.stringify(baseFile)};

// ---- 确定性随机（换种子才会换纹理，重跑结果一致）----
function Mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const RND = Mulberry32(0x5A1938 + KEY.length * 977);
const R = (lo,hi)=>lo+RND()*(hi-lo);

// ---- 每张纸的调色 ----
const PALETTE = {
  leaflet: { paper:"#e6d8b4", deep:"#b79b68", stain:"#8d6a35", ink:"#241d16" },
  news:    { paper:"#ded3b6", deep:"#ab9c76", stain:"#7d6338", ink:"#1c1a17" },
  letter:  { paper:"#eae0c4", deep:"#c0ac82", stain:"#8b6c3d", ink:"#221f2c" },
  map:     { paper:"#cfc8ac", deep:"#9a9377", stain:"#6f6a4c", ink:"#3c3a2c" },
}[KEY];

const paper = document.getElementById("paper");
const pc = paper.getContext("2d");
const grime = document.getElementById("grime");
const gc = grime.getContext("2d");
const ink = document.getElementById("ink");

// ---- 字体自查：与 monospace 的宽度不同才算装上了 ----
// 注意：不能拿汉字量宽 —— 全角字在任何中文字体里都是同一个前进宽度，
// 量出来永远相等，会把装着的字体全报成「缺失」。用拉丁串量才有区分度。
function FontPresent(family){
  const c = document.createElement("canvas").getContext("2d");
  const probe = "MWilliam@#1234 gjpq";
  c.font = "72px monospace";
  const ref = c.measureText(probe).width;
  c.font = '72px "' + family + '", monospace';
  return c.measureText(probe).width !== ref;
}
window.__fontReport = {};
for (const f of ["SimSun","SimHei","KaiTi","FangSong","LiSu","STZhongsong","STKaiti"]) {
  window.__fontReport[f] = FontPresent(f);
}

// ===========================================================================
// 纸底
// ===========================================================================
function FillNoise(ctx, w, h, amount, warm){
  const img = ctx.getImageData(0,0,w,h);
  const d = img.data;
  for (let i=0;i<d.length;i+=4){
    const n = (RND()-0.5)*amount;
    d[i]   = Math.max(0,Math.min(255, d[i]   + n*1.05 + warm));
    d[i+1] = Math.max(0,Math.min(255, d[i+1] + n));
    d[i+2] = Math.max(0,Math.min(255, d[i+2] + n*0.9 - warm*0.6));
  }
  ctx.putImageData(img,0,0);
}

/**
 * 纸浆纤维。长度必须短（3–14px）—— 第一版画到 190px，出来是一层划痕/铅笔道，
 * 整张纸像被人用刀刮过，比没有还糟。纤维就是短、多、淡。
 */
function Fibers(ctx, w, h, count, alpha){
  ctx.save();
  ctx.lineCap = "round";
  for (let i=0;i<count;i++){
    const x = RND()*w, y = RND()*h;
    const len = R(3,14), ang = RND()*Math.PI*2;
    ctx.strokeStyle = RND()<0.5
      ? "rgba(255,250,232,"+(alpha*R(0.3,1)).toFixed(3)+")"
      : "rgba(96,80,52,"+(alpha*R(0.25,0.85)).toFixed(3)+")";
    ctx.lineWidth = R(0.4,1.0);
    ctx.beginPath();
    ctx.moveTo(x,y);
    ctx.lineTo(x+Math.cos(ang)*len, y+Math.sin(ang)*len);
    ctx.stroke();
  }
  ctx.restore();
}

function Blotches(ctx, w, h, count, color, maxR, maxA){
  for (let i=0;i<count;i++){
    const x = RND()*w, y = RND()*h, r = R(maxR*0.25, maxR);
    const g = ctx.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0, color.replace("ALPHA", (RND()*maxA).toFixed(3)));
    g.addColorStop(1, color.replace("ALPHA","0"));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill();
  }
}

function Foxing(ctx, w, h, count){
  for (let i=0;i<count;i++){
    const x = RND()*w, y = RND()*h, r = R(3,16);
    const g = ctx.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,"rgba(122,84,40,"+R(0.10,0.30).toFixed(3)+")");
    g.addColorStop(0.6,"rgba(122,84,40,"+R(0.04,0.12).toFixed(3)+")");
    g.addColorStop(1,"rgba(122,84,40,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill();
  }
}

/** 折痕：一条暗线 + 一条亮线，模拟纸被压出的棱。 */
function Crease(ctx, x0,y0,x1,y1, strength){
  const dx = x1-x0, dy = y1-y0, len = Math.hypot(dx,dy);
  const nx = -dy/len, ny = dx/len;
  const seg = 26;
  for (let side=0; side<2; side++){
    ctx.beginPath();
    for (let i=0;i<=seg;i++){
      const t = i/seg;
      const wob = Math.sin(t*Math.PI*R(1.6,2.4)) * R(2,7);
      const px = x0+dx*t + nx*(wob + (side? 2.2 : -2.2));
      const py = y0+dy*t + ny*(wob + (side? 2.2 : -2.2));
      if (i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
    }
    ctx.strokeStyle = side
      ? "rgba(255,252,238,"+(strength*0.55).toFixed(3)+")"
      : "rgba(88,70,42,"+(strength*0.75).toFixed(3)+")";
    ctx.lineWidth = side ? 3.2 : 4.2;
    ctx.stroke();
  }
}

/** 边缘磨损：外圈压暗 + 随机小缺口（保持不透明，engine 怎么用都不会露黑边）。 */
function WornEdges(ctx, w, h, depth){
  const g1 = ctx.createLinearGradient(0,0,depth,0);
  g1.addColorStop(0,"rgba(92,72,42,0.42)"); g1.addColorStop(1,"rgba(92,72,42,0)");
  ctx.fillStyle=g1; ctx.fillRect(0,0,depth,h);
  const g2 = ctx.createLinearGradient(w,0,w-depth,0);
  g2.addColorStop(0,"rgba(92,72,42,0.42)"); g2.addColorStop(1,"rgba(92,72,42,0)");
  ctx.fillStyle=g2; ctx.fillRect(w-depth,0,depth,h);
  const g3 = ctx.createLinearGradient(0,0,0,depth);
  g3.addColorStop(0,"rgba(92,72,42,0.42)"); g3.addColorStop(1,"rgba(92,72,42,0)");
  ctx.fillStyle=g3; ctx.fillRect(0,0,w,depth);
  const g4 = ctx.createLinearGradient(0,h,0,h-depth);
  g4.addColorStop(0,"rgba(92,72,42,0.42)"); g4.addColorStop(1,"rgba(92,72,42,0)");
  ctx.fillStyle=g4; ctx.fillRect(0,h-depth,w,depth);
  // 缺口/毛边
  for (let i=0;i<70;i++){
    const edge = (i%4);
    const t = RND();
    const bite = R(4,20);
    let x,y;
    if (edge===0){ x=t*w; y=0; } else if (edge===1){ x=w; y=t*h; }
    else if (edge===2){ x=t*w; y=h; } else { x=0; y=t*h; }
    const g = ctx.createRadialGradient(x,y,0,x,y,bite*2.2);
    g.addColorStop(0,"rgba(74,58,34,"+R(0.20,0.5).toFixed(3)+")");
    g.addColorStop(1,"rgba(74,58,34,0)");
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,bite*2.2,0,7); ctx.fill();
  }
}

async function PaintPaper(){
  pc.fillStyle = PALETTE.paper;
  pc.fillRect(0,0,W,H);

  if (BASE_FILE){
    const img = await new Promise((ok,fail)=>{
      const im = new Image();
      im.onload=()=>ok(im); im.onerror=fail; im.src = BASE_FILE;
    }).catch(()=>null);
    if (img){
      // cover 铺满，再往里推一点：AI 出的扫描件四周留了白底投影，不裁会露出白边
      const zoom = KEY === "map" ? 1.0 : 1.14;
      const s = Math.max(W/img.width, H/img.height) * zoom;
      const dw = img.width*s, dh = img.height*s;
      pc.drawImage(img,(W-dw)/2,(H-dh)/2,dw,dh);
      // 只留 AI 纸底的明暗，色相强制回到本道具的调色
      pc.globalCompositeOperation = "color";
      pc.fillStyle = PALETTE.paper; pc.fillRect(0,0,W,H);
      pc.globalCompositeOperation = "source-over";
      // 压掉过强的对比，别抢文字
      pc.globalAlpha = 0.42; pc.fillStyle = PALETTE.paper; pc.fillRect(0,0,W,H);
      pc.globalAlpha = 1;
    }
  }

  Blotches(pc, W,H, 34, "rgba(158,132,86,ALPHA)", Math.max(W,H)*0.42, 0.10);
  Blotches(pc, W,H, 22, "rgba(255,250,230,ALPHA)", Math.max(W,H)*0.3, 0.12);
  // AI 纸底本身就是扫描件，纤维已经在里头了，再补一层只会脏。
  Fibers(pc, W,H, BASE_FILE ? 500 : 2600, BASE_FILE ? 0.22 : 0.36);
  Foxing(pc, W,H, KEY==="letter" ? 26 : 48);
  FillNoise(pc, W,H, KEY==="news" ? 22 : 15, KEY==="map" ? -2 : 3);
}

// ===========================================================================
// 排版辅助
// ===========================================================================
const VERT_PUNCT = new Set(["，","、","。","；","："]);

/** 一列竖排文字（右起阅读）。逐字绝对定位，便于抖动与竖排标点归位。 */
function Column(text, o){
  const chars = [...text];
  let cy = o.y, drift = 0;
  chars.forEach((ch, i) => {
    const el = document.createElement("span");
    el.className = "ch";
    el.textContent = ch;
    const j = o.jitter || 0;
    const rot = (RND()*2-1)*j*3.4;
    const ox = (RND()*2-1)*j*6;
    const oy = (RND()*2-1)*j*5;
    const sc = 1 + (RND()*2-1)*j*0.07;
    drift += (o.drift || 0);
    const size = o.size;
    let extra = "";
    if (VERT_PUNCT.has(ch)) extra = " translate(" + (size*0.34) + "px," + (-size*0.40) + "px)";
    if (ch === "…" || ch === "—") extra = " rotate(90deg)";
    const dark = o.inkVary ? (1 - RND()*o.inkVary) : 1;
    // 手写：随机把个别字写重（KaiTi 没有粗体，浏览器合成的假粗正好像蘸多了墨）
    const weight = (o.weight || 400) + (o.weightVary && RND() < 0.38 ? 300 : 0);
    el.style.cssText =
      "left:" + (o.x - size/2 + ox + drift) + "px;" +
      "top:" + (cy + oy) + "px;" +
      "width:" + size + "px;" +
      "font-size:" + size + "px;" +
      "font-family:" + o.font + ";" +
      "color:" + o.color + ";" +
      "opacity:" + (dark * (o.opacity ?? 1)).toFixed(3) + ";" +
      "font-weight:" + weight + ";" +
      (o.shadow && RND() < 0.35 ? "text-shadow:0 0 " + R(0.4,1.1).toFixed(2) + "px currentColor;" : "") +
      "transform:rotate(" + rot.toFixed(2) + "deg) scale(" + sc.toFixed(3) + ")" + extra + ";";
    ink.appendChild(el);
    cy += o.cell;
  });
  return cy;
}

/** 横排一行（只给报头这种整体识读的地方用）。 */
function Row(text, o){
  const chars = [...text];
  let cx = o.x;
  chars.forEach((ch)=>{
    const el = document.createElement("span");
    el.className = "ch";
    el.textContent = ch;
    el.style.cssText =
      "left:" + cx + "px; top:" + o.y + "px; width:" + o.size + "px;" +
      "font-size:" + o.size + "px; font-family:" + o.font + "; color:" + o.color + ";" +
      "opacity:" + (o.opacity ?? 1) + "; font-weight:" + (o.weight||400) + ";";
    ink.appendChild(el);
    cx += o.cell;
  });
  return cx;
}

function Rule(x,y,w,h,color,opacity){
  const el = document.createElement("div");
  el.style.cssText = "position:absolute;left:"+x+"px;top:"+y+"px;width:"+w+"px;height:"+h+"px;background:"+color+";opacity:"+opacity+";";
  ink.appendChild(el);
}

/**
 * 报纸正文的「灰条铅字」。
 * 一格一个实心方块会读成棋盘/二维码；真正的竖排小号铅字在这个尺度上
 * 只剩「几道横画 + 偶尔一竖」的密度感，所以每格拆成 2–3 条横画。
 * skip 是要让开的矩形（铜版照片位）。
 */
function Bar(x, y, w, h, color, opacity){
  const el = document.createElement("div");
  el.style.cssText =
    "position:absolute;left:" + x + "px;top:" + y + "px;width:" + w + "px;height:" + h + "px;" +
    "background:" + color + ";opacity:" + opacity.toFixed(2) + ";";
  ink.appendChild(el);
}

function GrayColumn(x, y0, y1, cell, size, color, skip){
  let y = y0;
  while (y < y1){
    if (skip && x > skip.x0 && x < skip.x1 && y + size > skip.y0 && y < skip.y1){ y += cell; continue; }
    if (RND() < 0.05){ y += cell * R(1, 2.0); continue; }   // 段落/句读留白
    const strokes = RND() < 0.42 ? 2 : 3;
    for (let s = 0; s < strokes; s++){
      const w = size * R(0.48, 0.92);
      const h = Math.max(1, size * R(0.09, 0.16));
      Bar(x - w/2 + size*R(-0.06,0.06), y + size*(0.13 + s*0.29), w, h, color, R(0.45, 0.88));
    }
    if (RND() < 0.45){   // 偶尔一竖，压出汉字的骨架感
      const h = size * R(0.4, 0.72);
      Bar(x + size*R(-0.18,0.18), y + size*0.14, Math.max(1, size*0.1), h, color, R(0.3, 0.6));
    }
    y += cell;
  }
}

// ===========================================================================
// 四张图的内容
// ===========================================================================
function BuildLeaflet(){
  ink.style.filter = "blur(0.25px)";
  const I = PALETTE.ink;
  // 顶部褪色红日（克制处理：只用一个淡红圆盘，不画军旗）
  const disc = document.createElement("div");
  disc.style.cssText =
    "position:absolute;left:" + (W/2-58) + "px;top:118px;width:116px;height:116px;border-radius:50%;" +
    "background:radial-gradient(circle,rgba(158,42,34,0.72) 62%,rgba(158,42,34,0.30) 86%,rgba(158,42,34,0) 100%);";
  ink.appendChild(disc);

  // 右首：告中國士兵書
  Column("告中國士兵書", { x: 906, y: 286, size: 50, cell: 60, font: '"SimSun",serif', color: I, opacity: 0.88, jitter: 0 });
  Rule(852, 286, 3, 372, I, 0.35);

  // 主文案（竖排右起两列，必须一眼读全）
  Column("放下武器，", { x: 690, y: 300, size: 142, cell: 166, font: '"LiSu","STZhongsong","SimHei",serif', color: I, opacity: 0.94, jitter: 0, shadow: true });
  Column("可保生命",   { x: 470, y: 300, size: 142, cell: 166, font: '"LiSu","STZhongsong","SimHei",serif', color: I, opacity: 0.94, jitter: 0, shadow: true });

  // 小字：宣抚班式的许诺
  const small = { size: 33, cell: 40, font: '"SimSun",serif', color: I, opacity: 0.8, jitter: 0 };
  Column("皇軍不殺俘虜　優待來歸者",   Object.assign({ x: 320, y: 330 }, small));
  Column("給與飲食　醫治傷病",         Object.assign({ x: 268, y: 330 }, small));
  Column("願歸鄉者發給路費",           Object.assign({ x: 216, y: 330 }, small));
  Column("持此傳單即為憑證",           Object.assign({ x: 164, y: 330 }, small));

  // 落款（竖排最左，符合舊式版面）
  Column("日本軍宣撫班", { x: 104, y: 1050, size: 38, cell: 46, font: '"SimSun",serif', color: I, opacity: 0.62, jitter: 0 });

  // 底部一条印刷横线（要压在落款之下，第一版横线正好穿过「撫」字）
  Rule(90, 1408, W-180, 3, I, 0.3);
  Rule(90, 1418, W-180, 1.5, I, 0.22);
}

/**
 * 铜版照片位：真·半调网点。
 * 用 CSS repeating-radial-gradient 做的第一版是从单个圆心发散的同心弧，
 * 出图是一片摩尔纹，一眼就是渲染事故 —— 网点得一颗一颗按明暗画。
 */
function HalftonePhoto(x, y, w, h){
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.style.cssText = "position:absolute;left:"+x+"px;top:"+y+"px;width:"+w+"px;height:"+h+"px;opacity:0.88;";
  const q = c.getContext("2d");
  // 明暗必须有大结构（上淡下重＋一处高光），否则一整块等密度网点只是个黑方块
  const Field = (px, py) => {
    let v = 0.08 + 0.62*(py/h);
    v += 0.17*Math.sin(px*0.021 + py*0.012);
    v += 0.12*Math.sin(px*0.047 + 2.1)*Math.cos(py*0.033);
    v -= 0.26*Math.exp(-(((px-w*0.30)**2 + (py-h*0.28)**2)/(2*(w*0.19)**2)));
    return Math.max(0, Math.min(1, v));
  };
  const pitch = 5;
  q.fillStyle = "#242018";
  for (let py = pitch/2; py < h; py += pitch){
    for (let px = pitch/2; px < w; px += pitch){
      const r = (pitch*0.52) * Math.pow(Field(px, py), 0.85);
      if (r < 0.3) continue;
      q.beginPath(); q.arc(px, py, r, 0, 7); q.fill();
    }
  }
  ink.appendChild(c);
}

function BuildNewspaper(){
  ink.style.filter = "blur(0.2px)";
  const I = PALETTE.ink;
  // 报头
  Row("戰地日報", { x: 66, y: 74, size: 124, cell: 136, font: '"LiSu","STZhongsong","SimHei",serif', color: I, opacity: 0.93 });
  // 报头小字压在横线以上，别让它淌进正文（第一版淌下去和头条撞在一起）
  Column("中華民國二十七年一月十八日", { x: 726, y: 44, size: 16, cell: 18, font: '"SimSun",serif', color: I, opacity: 0.72, jitter: 0 });
  Column("第貳佰柒拾陸號", { x: 700, y: 44, size: 16, cell: 18, font: '"SimSun",serif', color: I, opacity: 0.72, jitter: 0 });
  Column("每份銅元四枚", { x: 674, y: 44, size: 16, cell: 18, font: '"SimSun",serif', color: I, opacity: 0.62, jitter: 0 });
  Row("本報南京專電", { x: 66, y: 226, size: 26, cell: 29, font: '"SimSun",serif', color: I, opacity: 0.66 });

  Rule(52, 282, W-104, 4, I, 0.62);
  Rule(52, 292, W-104, 2, I, 0.45);

  // 头条（竖排右起）
  Column("首都淪陷後暴行確證", { x: 928, y: 330, size: 76, cell: 88, font: '"SimHei","LiSu",sans-serif', color: I, opacity: 0.92, jitter: 0 });
  Rule(866, 330, 2.5, 800, I, 0.3);
  const sub = { size: 38, cell: 45, font: '"SimSun",serif', color: I, opacity: 0.84, jitter: 0 };
  Column("紅十字會掩埋屍體逾數萬具", Object.assign({ x: 826, y: 342 }, sub));
  Column("難民區內婦孺亦遭殺戮",     Object.assign({ x: 770, y: 342 }, sub));
  Column("外僑目擊縱火劫掠電告各國", Object.assign({ x: 714, y: 342 }, sub));
  Rule(676, 330, 2, 940, I, 0.26);

  // 正文：灰条铅字 + 界行（让开铜版照片位）
  const photoBox = { x0: 70, x1: 386, y0: 1046, y1: 1288 };
  let x = 644;
  while (x > 66){
    GrayColumn(x, 336, 1356, 25, 21, "#2a2622", photoBox);
    if (x - 26 > 66) Rule(x - 13, 330, 1, 1032, I, 0.2);
    x -= 26;
  }
  // 左下角一块铜版照片位（半调网点），旧报纸标配。画在灰条之后才盖得住。
  HalftonePhoto(78, 1050, 300, 230);
  Rule(78, 1046, 300, 3, I, 0.5);
  Rule(78, 1284, 300, 3, I, 0.5);
  Rule(52, 1386, W-104, 3, I, 0.5);
}

function BuildLetter(){
  // 粗手写：楷体 + 逐字抖动 + 墨色深浅不一 + 轻微洇开
  ink.style.filter = "blur(0.42px)";
  const I = "#1d1a24";
  // jitter 拉到 1.9：第一版 1.0 出来还是一板一眼的印刷楷体，不像识几个字的兵写的
  const hand = {
    size: 62, cell: 80, font: '"KaiTi","STKaiti","FangSong",serif',
    color: I, opacity: 0.93, jitter: 1.9, inkVary: 0.42, drift: 0.95,
    shadow: true, weight: 400, weightVary: true,
  };
  Column("娘的眼睛，请郎中再看一哈", Object.assign({ x: 838, y: 236 }, hand));
  Column("欠王家的谷，等发饷再还",   Object.assign({ x: 648, y: 262 }, hand));
  Column("春妹的鞋莫做大了",         Object.assign({ x: 462, y: 246 }, hand));
  Column("等我回来……",              Object.assign({ x: 272, y: 268 }, hand));
  // 写到一半停笔：几点墨渍。要甩开末列，不然会被读成「等我回来…………」
  for (let i=0;i<3;i++){
    const b = document.createElement("div");
    const r = R(3,8);
    b.style.cssText =
      "position:absolute;left:" + (168 + R(-22,26)) + "px;top:" + (960 + i*R(20,54)) + "px;" +
      "width:" + r + "px;height:" + (r*R(0.7,1.5)) + "px;border-radius:50%;background:" + I + ";" +
      "opacity:" + R(0.22,0.5).toFixed(2) + ";";
    ink.appendChild(b);
  }
}

/** 折线细分 + 抖动。直尺画出来的湖岸和运河一眼假，必须先揉一遍。 */
function Wobble(pts, amp, step){
  const out = [];
  for (let i=0;i<pts.length-1;i++){
    const [x0,y0]=pts[i], [x1,y1]=pts[i+1];
    const n = Math.max(1, Math.ceil(Math.hypot(x1-x0,y1-y0)/step));
    for (let s=0;s<n;s++){
      const t=s/n;
      const px=x0+(x1-x0)*t, py=y0+(y1-y0)*t;
      const k = Math.sin(t*7.3+i*2.1)*0.5 + Math.sin(t*17.7+i)*0.3;
      out.push([px + k*amp + R(-amp*0.35,amp*0.35), py + k*amp*0.7 + R(-amp*0.35,amp*0.35)]);
    }
  }
  out.push(pts[pts.length-1]);
  return out;
}
function Trace(g, pts, close){
  g.beginPath(); g.moveTo(pts[0][0],pts[0][1]);
  for (let i=1;i<pts.length;i++) g.lineTo(pts[i][0],pts[i][1]);
  if (close) g.closePath();
}

function BuildMap(){
  // 底图只给地理暗示，一个字都不写（滕县/临城/台儿庄等标注由引擎 DOM 叠加）
  const g = pc;
  g.save();
  g.lineJoin = "round"; g.lineCap = "round";

  // 方格网（旧军图的分划）
  g.strokeStyle = "rgba(84,78,58,0.16)"; g.lineWidth = 1;
  for (let x=0; x<=W; x+=128){ g.beginPath(); g.moveTo(x+0.5,0); g.lineTo(x+0.5,H); g.stroke(); }
  for (let y=0; y<=H; y+=128){ g.beginPath(); g.moveTo(0,y+0.5); g.lineTo(W,y+0.5); g.stroke(); }

  // 微山湖：西侧狭长水面
  const lake = Wobble([[300,148],[344,266],[326,392],[360,506],[412,612],[452,702],[408,726],[352,650],[298,536],[258,402],[244,262],[262,164],[300,148]], 7, 26);
  Trace(g, lake, true);
  g.fillStyle = "rgba(122,136,132,0.26)"; g.fill();
  g.strokeStyle = "rgba(58,66,58,0.5)"; g.lineWidth = 2.2; g.stroke();
  // 湖内几道水纹线，别是一块死灰
  for (let i=0;i<5;i++){
    const yy = 200 + i*100;
    Trace(g, Wobble([[276+i*10, yy],[330+i*14, yy+18]], 3, 10), false);
    g.strokeStyle="rgba(58,66,58,0.18)"; g.lineWidth=1.4; g.stroke();
  }

  // 大运河：湖南端折向东南
  const canal = Wobble([[430,704],[556,752],[700,790],[860,820],[1032,848],[1216,882],[1420,922]], 9, 30);
  Trace(g, canal, false);
  g.strokeStyle="rgba(58,68,60,0.5)"; g.lineWidth=7; g.stroke();
  g.strokeStyle="rgba(198,200,180,0.45)"; g.lineWidth=2.6; g.stroke();

  // 支流
  for (const trib of [
    [[742,470],[778,600],[800,712],[826,806]],
    [[1178,486],[1146,632],[1142,758],[1180,876]],
    [[352,842],[470,880],[600,906],[700,918]],
  ]){
    Trace(g, Wobble(trib, 7, 24), false);
    g.strokeStyle="rgba(58,68,60,0.34)"; g.lineWidth=3; g.stroke();
  }

  // 津浦铁路：南北纵贯，枕木符号
  const rail = Wobble([[612,0],[632,150],[622,318],[648,470],[684,620],[726,780],[772,1024]], 4, 8);
  Trace(g, rail, false);
  g.strokeStyle="rgba(44,40,30,0.72)"; g.lineWidth=3.6; g.stroke();
  for (let i=0;i<rail.length-1;i+=3){
    const p=rail[i], q=rail[i+1];
    const dx=q[0]-p[0], dy=q[1]-p[1], L=Math.hypot(dx,dy)||1;
    const nx=-dy/L, ny=dx/L, half=8;
    g.beginPath();
    g.moveTo(p[0]-nx*half, p[1]-ny*half);
    g.lineTo(p[0]+nx*half, p[1]+ny*half);
    g.strokeStyle="rgba(44,40,30,0.62)"; g.lineWidth=2.1; g.stroke();
  }

  // 东北方山地：成串的山脊 + 晕滃短线。不进右下角，给引擎留干净的可叠字区。
  const Ridge = (bx, by, len, ang, density, alpha) => {
    const spine = [];
    const steps = Math.floor(len/10);
    for (let s=0;s<=steps;s++){
      spine.push([bx + Math.cos(ang)*s*10 + Math.sin(s*0.5)*5, by + Math.sin(ang)*s*10 + Math.cos(s*0.7)*4]);
    }
    Trace(g, spine, false);
    g.strokeStyle="rgba(66,62,44,"+(alpha*0.5).toFixed(2)+")"; g.lineWidth=1.4; g.stroke();
    for (const [px,py] of spine){
      if (RND() > density) continue;
      const h = R(7,17);
      g.beginPath(); g.moveTo(px,py); g.lineTo(px + R(-3,3), py + h);
      g.strokeStyle="rgba(66,62,44,"+(alpha*R(0.55,1)).toFixed(2)+")"; g.lineWidth=R(1.1,2.3); g.stroke();
    }
  };
  for (let r=0;r<11;r++) Ridge(R(960,1400), R(120,520), R(90,220), R(-0.45,0.45), 0.85, R(0.30,0.55));
  for (let r=0;r<4;r++)  Ridge(R(1120,1420), R(560,660), R(70,150), R(-0.3,0.3), 0.7, R(0.16,0.3));
  // 西南一小片丘陵
  for (let r=0;r<4;r++) Ridge(R(130,400), R(790,930), R(60,120), R(-0.25,0.25), 0.6, R(0.12,0.26));
  g.restore();
}

// ===========================================================================
// 脏化 / 折痕 / 磨边（画在文字之上，让墨像压进纸里）
// ===========================================================================
function PaintGrime(){
  gc.clearRect(0,0,W,H);
  gc.fillStyle = "#ffffff"; gc.fillRect(0,0,W,H);
  Blotches(gc, W,H, 16, "rgba(126,96,52,ALPHA)", Math.max(W,H)*0.26, 0.16);
  Foxing(gc, W,H, KEY==="map" ? 20 : 34);

  // AI 纸底自带折痕，再叠一层同位置的会变成双重棱线 —— 有底就减弱。
  const cs = BASE_FILE ? 0.45 : 1;

  if (KEY === "leaflet"){
    Crease(gc, 0, H*0.5, W, H*0.5, 0.9*cs);
    Crease(gc, W*0.5, 0, W*0.5, H, 0.75*cs);
    Crease(gc, 0, H*0.25, W, H*0.25, 0.45*cs);
  } else if (KEY === "news"){
    Crease(gc, 0, H*0.5, W, H*0.5, 0.7*cs);
    Crease(gc, W*0.52, 0, W*0.52, H, 0.4*cs);
  } else if (KEY === "letter"){
    Crease(gc, 0, H*0.34, W, H*0.34, 0.8*cs);
    Crease(gc, 0, H*0.67, W, H*0.67, 0.8*cs);
    Crease(gc, W*0.5, 0, W*0.5, H, 0.35*cs);
    // 弹药箱垫写留下的压痕：一组横向棱与两条板缝
    for (let i=0;i<9;i++){
      const y = 150 + i*150 + R(-18,18);
      const grad = gc.createLinearGradient(0,y-7,0,y+7);
      grad.addColorStop(0,"rgba(255,255,255,0)");
      grad.addColorStop(0.42,"rgba(120,98,62,0.13)");
      grad.addColorStop(0.58,"rgba(255,252,238,0.20)");
      grad.addColorStop(1,"rgba(255,255,255,0)");
      gc.fillStyle=grad; gc.fillRect(0,y-7,W,14);
    }
    for (const bx of [286, 706]){
      const grad = gc.createLinearGradient(bx-5,0,bx+5,0);
      grad.addColorStop(0,"rgba(255,255,255,0)");
      grad.addColorStop(0.5,"rgba(112,92,58,0.16)");
      grad.addColorStop(1,"rgba(255,255,255,0)");
      gc.fillStyle=grad; gc.fillRect(bx-5,0,10,H);
    }
  } else {
    // 地图折成三乘三（AI 底已经有折痕时只轻轻补一道）
    Crease(gc, W/3, 0, W/3, H, 1.0*cs);
    Crease(gc, 2*W/3, 0, 2*W/3, H, 1.0*cs);
    Crease(gc, 0, H/3, W, H/3, 1.0*cs);
    Crease(gc, 0, 2*H/3, W, 2*H/3, 1.0*cs);
  }

  WornEdges(gc, W, H, Math.min(W,H)*0.09);
  // 整体压角
  const v = gc.createRadialGradient(W/2,H/2,Math.min(W,H)*0.3, W/2,H/2, Math.max(W,H)*0.74);
  v.addColorStop(0,"rgba(120,96,58,0)");
  v.addColorStop(1,"rgba(120,96,58," + (KEY === "map" ? 0.20 : 0.26) + ")");
  gc.fillStyle=v; gc.fillRect(0,0,W,H);
  // 脏化层不再单独打一遍噪声：纸底那层已经有颗粒，两层独立噪声叠起来
  // 肉眼几乎看不出差别，PNG 体积却上去一大截（无损压缩最怕随机噪声）。

}

(async () => {
  await PaintPaper();
  if (KEY === "leaflet") BuildLeaflet();
  else if (KEY === "news") BuildNewspaper();
  else if (KEY === "letter") BuildLetter();
  else BuildMap();
  PaintGrime();
  await document.fonts.ready;
  await new Promise((r)=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  window.__paperReady = true;
})();
</script></body></html>`;
}
