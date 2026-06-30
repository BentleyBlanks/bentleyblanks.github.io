#!/usr/bin/env node
// 把自托管的思源黑体（Noto Sans SC）裁剪成「只含游戏实际用到的字符」，把 2.3MB 的全量 CJK 字体
// 压到 ~0.4MB——线上首屏加载（App.preloadFonts 会 await 字体）从此不再卡。
//
// 用法：node scripts/subset-fonts.mjs   （文案改动后重跑一次即可）
// 依赖：Python + `pip install fonttools brotli`（提供 pyftsubset / fontTools.subset）。
// 全量字体保留为 src/assets/fonts/*.full.woff2（已 gitignore，不打包/不部署），裁剪结果覆盖同名 .woff2。
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fontsDir = path.join(root, "src/assets/fonts");

// 1) 扫描所有会被渲染的文案，收集用到的字符（CJK + ASCII + 常用标点）。
const chars = new Set();
for (let c = 0x20; c < 0x7f; c++) chars.add(String.fromCodePoint(c));
[..."　、。·…—–‐‑“”‘’「」『』《》〈〉【】（）〔〕％℃№×÷±°→←↑↓▸◆◇■□●○✓✗★☆⚡⊙⚔"].forEach((c) => chars.add(c));
const scan = (p) => {
  for (const ch of fs.readFileSync(p, "utf8")) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x2e80 || (cp >= 0x20 && cp < 0x7f)) chars.add(ch);
  }
};
const walk = (dir) => {
  for (const f of fs.readdirSync(dir)) {
    const fp = path.join(dir, f);
    const st = fs.statSync(fp);
    if (st.isDirectory()) {
      if (!["node_modules", "dist", "assets"].includes(f)) walk(fp);
    } else if (/\.(ts|tsx|json|html|css)$/.test(f)) scan(fp);
  }
};
walk(path.join(root, "src"));
scan(path.join(root, "index.html"));
const charsetPath = path.join(fontsDir, ".charset.txt");
fs.writeFileSync(charsetPath, [...chars].join(""), "utf8");
console.log(`charset: ${chars.size} unique chars (${[...chars].filter((c) => c.codePointAt(0) >= 0x2e80).length} CJK)`);

// 2) 用全量字体（.full.woff2，若无则当前 .woff2 当源）裁剪出小字体。
for (const w of ["400", "700"]) {
  const active = path.join(fontsDir, `noto-sans-sc-${w}.woff2`);
  const full = path.join(fontsDir, `noto-sans-sc-${w}.full.woff2`);
  const src = fs.existsSync(full) ? full : active;
  if (!fs.existsSync(src)) {
    console.warn(`! 缺源字体：${src}，跳过 ${w}`);
    continue;
  }
  if (src === active) {
    fs.copyFileSync(active, full); // 第一次跑：把当前全量备份成 .full
  }
  execFileSync(
    "python",
    ["-m", "fontTools.subset", full, `--text-file=${charsetPath}`, "--flavor=woff2", "--no-hinting", "--desubroutinize", `--output-file=${active}`],
    { stdio: "inherit" }
  );
  const kb = (fs.statSync(active).size / 1024).toFixed(0);
  // 覆盖校验：HTMLText 对缺字极不宽容（整段会渲染成空白），所以裁完必须确认每个用到的字都在。
  // 用「码点数字」对比，避开 Windows 终端把中文 stdout 当 cp936 解码导致的误报。
  const cmapOut = execFileSync("python", ["-c", `from fontTools.ttLib import TTFont;f=TTFont(${JSON.stringify(active)});print(','.join(str(c) for c in f.getBestCmap()))`], { encoding: "utf8" });
  const covered = new Set(cmapOut.trim().split(",").map(Number));
  // 只校验真正的 CJK 文字（emoji/符号本就走系统 emoji 字体回退，不该算漏字）。
  const isCjk = (cp) => cp >= 0x2e80 && cp <= 0xffef && !(cp >= 0x2600 && cp <= 0x27bf) && cp !== 0xfe0f;
  const missing = [...chars].filter((c) => isCjk(c.codePointAt(0)) && !covered.has(c.codePointAt(0)));
  if (missing.length) {
    console.error(`! ${w} 漏字（会导致那些卡片标题空白）：${missing.join("")}`);
    process.exitCode = 1;
  }
  console.log(`noto-sans-sc-${w}: ${kb} KB${missing.length ? " ⚠ 有漏字" : " ✓ 覆盖完整"}`);
}
fs.rmSync(charsetPath, { force: true });
console.log("done — rebuild (npm run build) to bundle the slim fonts.");
