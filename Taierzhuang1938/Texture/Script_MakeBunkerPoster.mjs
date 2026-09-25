// 掩蔽部标语海报贴图（Texture_BunkerPosterDefendShandong.webp，01 洞内北壁 `bunkerPoster`，
// 契约 docs/Data_FirstLevelStoryboard0103Contract.md §2 第 14 条）。
//
// 分层合成，同 Script_MakePaperProps：AI 写不对汉字，所以 Lovart 只出**无字**的木刻宣传画底图
// （上 45% 留白纸），两列竖排标语由本脚本用系统字体逐字排上去，再把纸外的白底抠成透明。
//
//   node Taierzhuang1938/Texture/Script_MakeBunkerPoster.mjs --base=<Lovart 底图 png> [--simplified] [--size=512x768] [--layout=textBottom|textTop]
//
// 版式（2026-09-25 审查后改成 textBottom，默认）：**画在上、字在下**。SB02 真实流程的 Blast 机位俯 13°、横滚 +15°，
// 北壁上离地 0.95 m 以上全在画框外；字排在海报下半才露得出来（Data_OpeningSet0103 bunkerPoster 的注释）。
// 底图不重生：把 Lovart 底图在折痕处（高 40.5%）切开，画（折痕以下，去掉最底下一条毛边）挪到上 58%，
// 无字的纸（折痕以上）上下翻过来垫到下 42%——原来的毛边纸口翻到了海报底边，接缝落在折痕上。textTop 是旧版式。
//
// 字：分镜里是「保卫山东 抗击日寇」。贴图照 1938 年的铅印/手刷实况写**繁体**（同纸品道具的口径，
// Texture/Data_PaperProps.md）：右列「保衛山東」、左列「抗擊日寇」，竖排右起。--simplified 出简体版。
// 底图来源：Lovart（2026-09-25，thread c83763d7-a278-402c-86ec-fc3004ff88da 第 2 张，NRA 灰布军装、无红星），
// 原图存在 REL/附件/evidence/Set/lovart/，不进仓库。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "../Script_DevServer.mjs";

const textureDir = path.dirname(fileURLToPath(import.meta.url));
const Arg = (k, d = null) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const base = Arg("base");
if (!base || !fs.existsSync(base)) { console.error("need --base=<Lovart base png>"); process.exit(2); }
const [W, H] = Arg("size", "512x768").split("x").map(Number);
const simplified = process.argv.includes("--simplified");
const layout = Arg("layout", "textBottom");
if (!["textBottom", "textTop"].includes(layout)) { console.error(`unknown --layout=${layout}`); process.exit(2); }
const columns = simplified ? ["保卫山东", "抗击日寇"] : ["保衛山東", "抗擊日寇"];
const out = path.join(textureDir, "Texture_BunkerPosterDefendShandong.webp");

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "bunker-poster-"));
fs.copyFileSync(base, path.join(workDir, "base.png"));
// 隶书（Windows 自带 SIMLI.TTF）：拷进临时目录用 FontFace 显式加载，不靠无头浏览器的系统字体回退。
const fontFile = Arg("font", "C:/Windows/Fonts/SIMLI.TTF");
if (!fs.existsSync(fontFile)) { console.error(`font not found: ${fontFile} (--font=<ttf>)`); process.exit(2); }
fs.copyFileSync(fontFile, path.join(workDir, "poster.ttf"));
fs.writeFileSync(path.join(workDir, "index.html"), "<!doctype html><meta charset=utf-8><body></body>");
const server = await ServeRoot(workDir, 0);
const browser = await LaunchBrowser();
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  const dataUrl = await page.evaluate(async ({ W, H, columns, layout }) => {
    const face = new FontFace("PosterLi", "url(poster.ttf)"); await face.load(); document.fonts.add(face);
    const img = new Image(); img.src = "base.png"; await img.decode();
    const S = 1024 / img.width;                               // 在 1024 宽上排版，最后缩到 W×H
    const cw = 1024, ch = Math.round(img.height * S);
    const canvas = Object.assign(document.createElement("canvas"), { width: cw, height: ch }), ctx = canvas.getContext("2d");
    if (layout === "textBottom") {
      // 折痕（底图高 40.5%）以下的画 -> 上 58%；折痕以上的空白纸上下翻转 -> 下 42%。
      const fold = img.height * 0.405, cut = img.height * 0.965, split = Math.round(ch * 0.58);
      ctx.drawImage(img, 0, fold, img.width, cut - fold, 0, 0, cw, split);
      ctx.save(); ctx.translate(0, ch); ctx.scale(1, -1);
      ctx.drawImage(img, 0, 0, img.width, fold, 0, 0, cw, ch - split);
      ctx.restore();
    } else ctx.drawImage(img, 0, 0, cw, ch);
    // 1) 纸外的白底抠透明：从四边往里泛洪，近白、低饱和的像素算背景。
    const px = ctx.getImageData(0, 0, cw, ch), d = px.data, seen = new Uint8Array(cw * ch), stack = [];
    const Bg = (i) => { const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2]; return Math.min(r, g, b) > 214 && Math.max(r, g, b) - Math.min(r, g, b) < 26; };
    for (let x = 0; x < cw; x++) stack.push(x, (ch - 1) * cw + x);
    for (let y = 0; y < ch; y++) stack.push(y * cw, y * cw + cw - 1);
    while (stack.length) {
      const i = stack.pop();
      if (seen[i] || !Bg(i)) continue;
      seen[i] = 1; d[i * 4 + 3] = 0;
      const x = i % cw, y = (i / cw) | 0;
      if (x > 0) stack.push(i - 1); if (x < cw - 1) stack.push(i + 1); if (y > 0) stack.push(i - cw); if (y < ch - 1) stack.push(i + cw);
    }
    ctx.putImageData(px, 0, 0);
    // 2) 两列竖排大字：右列先读。墨色压在纸纹上（multiply），笔画边缘带一点飞白。
    const [top, bottom] = layout === "textBottom" ? [ch * 0.605, ch * 0.955] : [ch * 0.05, ch * 0.44], size = (bottom - top) / 4;
    const colX = [cw * 0.63, cw * 0.37];
    const ink = document.createElement("canvas"); ink.width = cw; ink.height = ch;
    const ic = ink.getContext("2d");
    ic.textAlign = "center"; ic.textBaseline = "middle";
    columns.forEach((text, c) => {
      [...text].forEach((chr, k) => {
        const y = top + size * (k + 0.5), jitter = (Math.sin(c * 7 + k * 3.1) * 0.02);
        ic.save(); ic.translate(colX[c], y); ic.rotate(jitter);
        ic.font = `${Math.round(size * 1.02)}px PosterLi`;
        ic.fillStyle = c === 0 ? "rgba(128,22,18,0.95)" : "rgba(22,18,14,0.95)";
        ic.fillText(chr, 0, 0);
        ic.restore();
      });
    });
    // 飞白：用纸本身的明暗把墨挖掉一点（纸纹亮处墨淡）。
    const inkPx = ic.getImageData(0, 0, cw, ch), id = inkPx.data, pd = ctx.getImageData(0, 0, cw, ch).data;
    for (let i = 0; i < id.length; i += 4) {
      if (!id[i + 3]) continue;
      const lum = (pd[i] + pd[i + 1] + pd[i + 2]) / 765, noise = Math.sin(i * 12.9898) * 43758.5453 % 1;
      id[i + 3] = Math.max(0, id[i + 3] * (1.15 - 0.45 * lum) - (Math.abs(noise) < 0.05 ? 140 : 0));
    }
    ic.putImageData(inkPx, 0, 0);
    ctx.globalCompositeOperation = "multiply"; ctx.drawImage(ink, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    // 3) 缩到游戏尺寸出 webp（带 alpha）。
    const small = Object.assign(document.createElement("canvas"), { width: W, height: H });
    const sc = small.getContext("2d"); sc.imageSmoothingQuality = "high"; sc.drawImage(canvas, 0, 0, W, H);
    return small.toDataURL("image/webp", 0.88);
  }, { W, H, columns, layout });
  const buffer = Buffer.from(dataUrl.split(",")[1], "base64");
  if (buffer.length < 10000 || buffer.slice(8, 12).toString() !== "WEBP") throw new Error(`bad webp output (${buffer.length} bytes)`);
  fs.writeFileSync(out, buffer);
  console.log(`wrote ${path.relative(process.cwd(), out)} ${W}x${H} ${(buffer.length / 1024).toFixed(0)} KB, layout ${layout}, columns ${columns.join(" / ")}`);
} finally {
  await browser.close();
  server.close();
  fs.rmSync(workDir, { recursive: true, force: true });
}
