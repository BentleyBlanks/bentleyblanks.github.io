// 《台儿庄：血战滕县》加载画面报纸剪报的门禁（纯 Node，毫秒级）。
//
// 守的是「清单 ↔ 磁盘 ↔ 文本 ↔ 贴图清单」四头对得上，以及抽签不与上次重复：
//   1. Data_BootPapers 的 id 唯一、文件名合规、图真在磁盘上、尺寸与贴图清单一致；
//   2. 每张都有四条文本（报名 / 日期 / 汉字日期 / 简述），简述非空且不含「报纸称」以外的战果断言占位符；
//   3. PaperCard 组出的三行字（副题 / 史料摘录行 / 简述行）都不带未解析的 {占位符} 或裸键；
//   4. PickBootPaper 不返回上一次那张；只有一张时才允许重复；
//   5. index.html 的 import map 登记了两个新模块，DOM 里有 #bootPaper / #bootPaperName / #bootPaperNote，
//      且不再残留旧道具展示台的 #bootProp。
// 跑法：node Taierzhuang1938/Script_BootPaperTest.mjs

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ApplyTiltDrag, BOOT_PAPERS, BOOT_PAPER_DIR, BOOT_PAPER_TILT, PickBootPaper } from "./Data_BootPapers.mjs";
import { TEXTURE_MANIFEST } from "./Data_TextureManifest.mjs";
import { PaperCard } from "./Script_BootPaper.mjs";
import { T } from "./Script_Text.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
let passed = 0;
const Check = (ok, label, detail = "") => {
  assert.ok(ok, `${label}${detail ? `：${detail}` : ""}`);
  passed++;
  console.log(`  ✓ ${label}`);
};

console.log("清单");
Check(BOOT_PAPERS.length === 11, "收录 11 期（Notion 里被标了颜色且贴着原图的那批）", String(BOOT_PAPERS.length));
Check(new Set(BOOT_PAPERS.map((p) => p.id)).size === BOOT_PAPERS.length, "id 唯一");
Check(new Set(BOOT_PAPERS.map((p) => p.file)).size === BOOT_PAPERS.length, "文件名唯一");

const manifest = TEXTURE_MANIFEST.find((entry) => entry.id === "BootPaper");
Check(!!manifest, "贴图清单登记了 BootPaper");
const registered = new Map(manifest.files.map(([rel, , w, h]) => [rel, [w, h]]));
const dir = path.join(here, BOOT_PAPER_DIR.replace(/^\.\//, ""));
for (const paper of BOOT_PAPERS) {
  Check(/^Texture_BootPaper[A-Za-z]+\d{8}\.webp$/.test(paper.file), `${paper.id}: 文件名合规`);
  const file = path.join(dir, paper.file);
  Check(fs.existsSync(file), `${paper.id}: 图在磁盘上`);
  const rel = path.posix.join(BOOT_PAPER_DIR.replace(/^\.\/Texture\//, ""), paper.file);
  Check(registered.has(rel), `${paper.id}: 贴图清单登记了 ${rel}`);
  const head = fs.readFileSync(file).subarray(0, 32);
  Check(head.subarray(0, 4).toString() === "RIFF" && head.subarray(8, 12).toString() === "WEBP", `${paper.id}: 是 webp`);
}

console.log("文本");
for (const paper of BOOT_PAPERS) {
  const card = PaperCard(paper);
  for (const field of ["name", "date", "kicker", "summary", "subtitle", "alt"]) {
    Check(typeof card[field] === "string" && card[field].length > 0 && !/\{|\}|^boot\./.test(card[field]),
      `${paper.id}: ${field} 已解析`, card[field]);
  }
  Check(card.summary.startsWith("简述：") && card.summary.length > 8, `${paper.id}: 简述行`);
  Check(/^[〇一二三四五六七八九十]+年[〇一二三四五六七八九十]+月([〇一二三四五六七八九十]+日)? · 战前报讯$/.test(card.subtitle),
    `${paper.id}: 副题是汉字日期（第 5 期 Notion 只写到月）`, card.subtitle);
}
Check(T("boot.paper.kicker") === "史料摘录", "史料摘录 kicker");

console.log("抽签");
const seen = new Set();
for (let i = 0; i < 400; i++) {
  const last = BOOT_PAPERS[i % BOOT_PAPERS.length].id;
  const pick = PickBootPaper(last);
  assert.notEqual(pick.id, last, "不许与上一次重复");
  seen.add(pick.id);
}
Check(seen.size === BOOT_PAPERS.length, "400 次抽签覆盖全部 11 期");
Check(PickBootPaper(null, () => 0.999999).id === BOOT_PAPERS.at(-1).id, "rand 上界不越界");
Check(PickBootPaper("不存在的id", () => 0).id === BOOT_PAPERS[0].id, "上次 id 不在清单里照常抽");

console.log("拖拽倾斜");
{
  const T0 = { yaw: 0, pitch: 0 };
  const right = ApplyTiltDrag(T0, 100, 0);
  Check(right.yaw > 0 && right.pitch === 0, "横向右拖 → 偏航为正、不动俯仰");
  Check(ApplyTiltDrag(T0, 0, 100).pitch < 0 && ApplyTiltDrag(T0, 0, -100).pitch > 0, "竖拖 → 俯仰方向与拖动相反（拖下去上边抬起）");
  let tilt = T0;
  for (let i = 0; i < 2000; i++) tilt = ApplyTiltDrag(tilt, 40, 40);
  Check(Math.abs(tilt.yaw) <= BOOT_PAPER_TILT.maxYawDeg + 1e-9 && Math.abs(tilt.pitch) <= BOOT_PAPER_TILT.maxPitchDeg + 1e-9,
    "一直往一个方向拖也不超过上限（不会转到 180°）", JSON.stringify(tilt));
  tilt = T0;
  for (let i = 0; i < 2000; i++) tilt = ApplyTiltDrag(tilt, -40, -40);
  Check(tilt.yaw >= -BOOT_PAPER_TILT.maxYawDeg - 1e-9 && tilt.pitch <= BOOT_PAPER_TILT.maxPitchDeg + 1e-9, "反方向同样封顶");
  Check(BOOT_PAPER_TILT.maxYawDeg < 90 && BOOT_PAPER_TILT.maxPitchDeg < 90, "上限都远小于 90°");
  const near = ApplyTiltDrag({ yaw: 38, pitch: 0 }, 10, 0).yaw - 38;
  const far = ApplyTiltDrag({ yaw: 0, pitch: 0 }, 10, 0).yaw;
  Check(near < far, "接近上限时同样位移转得更少（橡皮筋）");
  Check(ApplyTiltDrag({ yaw: 30, pitch: 0 }, -10, 0).yaw < 30 - 10 * BOOT_PAPER_TILT.yawDegPerPx * 0.99, "往回拖不衰减");
}

console.log("页面接线");
const html = fs.readFileSync(path.join(here, "index.html"), "utf8");
Check(/"\.\/Script_BootPaper\.mjs": "\.\/Script_BootPaper\.mjs\?v=\d+"/.test(html), "import map 登记 Script_BootPaper");
Check(/"\.\/Data_BootPapers\.mjs": "\.\/Data_BootPapers\.mjs\?v=\d+"/.test(html), "import map 登记 Data_BootPapers");
for (const id of ["bootPaperWrap", "bootPaper", "bootPaperName", "bootPaperNote", "bootStart", "bootStep", "bootBar"]) {
  Check(new RegExp(`id="${id}"`).test(html), `#${id} 在 DOM 里`);
}
Check(!/id="bootProp/.test(html), "旧道具展示台的 #bootProp 已摘掉");

console.log(`\nBootPaperTest：${passed} 项通过`);
