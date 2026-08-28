// 县城采样点出图：一条命令把 Data_SamplePoints 里的每一个点位拍一遍，
// 落成一份带清单、带逐帧读数、可与上一批逐点对位的记录。
//
//   node Taierzhuang1938/Script_SamplePointShot.mjs
//   node Taierzhuang1938/Script_SamplePointShot.mjs --group=Gate --jpeg=0
//   node Taierzhuang1938/Script_SamplePointShot.mjs --only=Gate_EastOuter,Air_WholeCity
//   node Taierzhuang1938/Script_SamplePointShot.mjs --compare=_shots/Sample_2026.08.25
//
// 产物：Taierzhuang1938/_shots/Sample_<YYYY.MM.DD>/
//   <序号>_<id>.png    基线原图（无损，本地对比用）
//   <序号>_<id>.jpg    同一帧的 JPEG（发 Notion 用，体积约十分之一）
//   Manifest.json      每张图的真实位姿 + 逐帧读数（亮度/对比度/分块均值）
//   Index.md           分组清单，直接就是记录文档的正文
//
// ## 让这批图「可比」的纪律
// 1. **机位不在这里算**。脚本开的是游戏里的采样点编辑器，逐点调
//    `Debug.SamplePoint(id)` —— 编辑器里预览到的就是这里拍到的。
// 2. **一关只建一次城**。按关卡分批，关内连着拍完再换关：建一次城十几秒，
//    八十八个点挨个重开页面是二十分钟的纯等待。
// 3. **世界是停的**。编辑器接管期间玩法全停（与过场同一条通道），
//    所以同一个点位两次拍到的人、火、烟都在同一处 —— 差异只来自场景本身。
//
// ## 逐帧读数是干什么的
// 八十多张图靠肉眼比是比不动的。Manifest 里每张图记了平均亮度、对比度、
// 暗部占比与 4×4 分块均值；`--compare=<上一批目录>` 会把两批逐点做差，
// 把「哪几张真的变了」先筛出来，再拿眼睛去看那几张。
// 顺带还能抓住最常见的一种废图：机位埋进了几何里 —— 那种图对比度接近 0。

import path from "node:path";
import fs from "node:fs";
import zlib from "node:zlib";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import {
  SampleRunPlan, ValidatePoints, GroupLabel, OrderedPoints, PhaseFor,
} from "./Script_SamplePoints.mjs";
import { SAMPLE_GROUPS } from "./Data_SamplePoints.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");

const args = new Map(process.argv.slice(2)
  .filter((a) => a.startsWith("--"))
  .map((a) => {
    const eq = a.indexOf("=");
    return eq < 0 ? [a.slice(2), "1"] : [a.slice(2, eq), a.slice(eq + 1)];
  }));

const VIEWPORT = {
  width: Number(args.get("width") || 1600),
  height: Number(args.get("height") || 900),
};
const WRITE_JPEG = args.get("jpeg") !== "0";
const QUALITY = args.get("quality") || "high";
const SCALE = args.get("scale") || "medium";
/** 相机跳到新机位后推多少帧再拍。GI 探针、雾与阴影都要这几十帧才落定。 */
const SETTLE_FRAMES = Number(args.get("settle") || 45);
/** 建完城先空跑这么多帧：AI 铺开、烟柱起来，城才是活的。 */
const WARMUP_FRAMES = Number(args.get("warmup") || 240);

function Today() {
  const now = new Date();
  return `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.`
    + `${String(now.getDate()).padStart(2, "0")}`;
}
const RUN_DATE = String(args.get("date") || Today());

// ---------------------------------------------------------------------------
// PNG 读数：不引依赖，zlib 就够
// ---------------------------------------------------------------------------

/**
 * 解出一张 PNG 的 RGB 像素（只认 8 位、非隔行的 truecolor / truecolor+alpha ——
 * playwright 出的就是这两种）。返回 null 表示「读不了，跳过读数」，不当错误。
 */
function DecodePng(buffer) {
  if (buffer.length < 8 || buffer.readUInt32BE(0) !== 0x89504e47) return null;
  let offset = 8;
  let width = 0; let height = 0; let depth = 0; let colorType = 0; let interlace = 0;
  const idat = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8]; colorType = body[9]; interlace = body[12];
    } else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  if (depth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) return null;
  const channels = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[pos]; pos += 1;
    const line = raw.subarray(pos, pos + stride); pos += stride;
    const target = out.subarray(y * stride, (y + 1) * stride);
    const prior = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i += 1) {
      const a = i >= channels ? target[i - channels] : 0;
      const b = prior ? prior[i] : 0;
      const c = prior && i >= channels ? prior[i - channels] : 0;
      const raw0 = line[i];
      let value = raw0;
      if (filter === 1) value = raw0 + a;
      else if (filter === 2) value = raw0 + b;
      else if (filter === 3) value = raw0 + ((a + b) >> 1);
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
        value = raw0 + (pa <= pb && pa <= pc ? a : (pb <= pc ? b : c));
      }
      target[i] = value & 0xff;
    }
  }
  return { width, height, channels, pixels: out };
}

/** 一张图的读数。分块均值是 4×4，够抓「哪半边变了」而不至于噪声满天飞。 */
function FrameStats(buffer) {
  const image = DecodePng(buffer);
  if (!image) return null;
  const { width, height, channels, pixels } = image;
  const step = 4;
  let sum = 0; let sumSq = 0; let count = 0; let dark = 0; let bright = 0;
  const blocks = new Array(16).fill(0);
  const blockCount = new Array(16).fill(0);
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = y * width * channels + x * channels;
      const lum = 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
      sum += lum; sumSq += lum * lum; count += 1;
      if (lum < 12) dark += 1;
      if (lum > 243) bright += 1;
      const bx = Math.min(3, Math.floor((x / width) * 4));
      const by = Math.min(3, Math.floor((y / height) * 4));
      const b = by * 4 + bx;
      blocks[b] += lum; blockCount[b] += 1;
    }
  }
  const mean = sum / count;
  const std = Math.sqrt(Math.max(0, sumSq / count - mean * mean));
  return {
    mean: +mean.toFixed(2),
    std: +std.toFixed(2),
    darkFrac: +(dark / count).toFixed(4),
    brightFrac: +(bright / count).toFixed(4),
    blocks: blocks.map((value, i) => +(value / Math.max(1, blockCount[i])).toFixed(1)),
  };
}

/** 白天的天光预设。夜战关的图本来就暗，不能按同一条尺子卡。 */
const DAY_SKIES = new Set(["smokyDay", "chuchuanDay", "overcast", "dusk", "dawn"]);

/**
 * 一张图「像不像废图」。三种最常见的废法：
 *   · 机位埋进几何里 —— 满屏一堵墙，对比度接近 0；
 *   · 白天却整幅是暗的 —— 机位贴着一面背光的墙，或者掉进了室内；
 *   · 只拍到天。
 */
function FrameVerdict(stats, sky) {
  if (!stats) return "";
  if (stats.std < 5) return "对比度接近 0：机位可能埋在几何里";
  if (stats.darkFrac > 0.92) return "几乎全黑：机位可能在室内或地下";
  if (DAY_SKIES.has(sky) && stats.mean < 30) return "白天却一片暗：机位可能贴着墙或在室内";
  if (stats.brightFrac > 0.6) return "几乎全白：可能只拍到天";
  return "";
}

// ---------------------------------------------------------------------------
// 与上一批对位
// ---------------------------------------------------------------------------

function Compare(currentManifest, previousDir) {
  const file = path.resolve(previousDir.startsWith("_shots")
    ? path.join(projectDir, previousDir) : previousDir, "Manifest.json");
  if (!fs.existsSync(file)) {
    console.log(`\n对比：找不到 ${file}`);
    return [];
  }
  const previous = JSON.parse(fs.readFileSync(file, "utf8"));
  const before = new Map(previous.shots.map((shot) => [shot.id, shot]));
  const rows = [];
  for (const shot of currentManifest.shots) {
    const old = before.get(shot.id);
    if (!old || !old.stats || !shot.stats) continue;
    const dMean = +(shot.stats.mean - old.stats.mean).toFixed(2);
    const dStd = +(shot.stats.std - old.stats.std).toFixed(2);
    const dBlock = Math.max(...shot.stats.blocks
      .map((value, i) => Math.abs(value - (old.stats.blocks[i] ?? value))));
    rows.push({ id: shot.id, label: shot.label, dMean, dStd, dBlock: +dBlock.toFixed(1) });
  }
  rows.sort((a, b) => b.dBlock - a.dBlock);
  console.log(`\n与 ${previous.date} 那一批逐点对位（按最大分块差排序，只列前 20）：`);
  console.log("   分块差  亮度差  对比度差  点位");
  for (const row of rows.slice(0, 20)) {
    console.log(`   ${String(row.dBlock).padStart(6)}  ${String(row.dMean).padStart(6)}`
      + `  ${String(row.dStd).padStart(8)}  ${row.id} ${row.label}`);
  }
  const changed = rows.filter((row) => row.dBlock >= 3).length;
  console.log(`   共 ${rows.length} 张可对位，其中 ${changed} 张分块差 ≥ 3（值得拿眼睛看）。`);
  return rows;
}

// ---------------------------------------------------------------------------
// 出图
// ---------------------------------------------------------------------------

const problems = ValidatePoints();
if (problems.length) {
  console.error("采样点表有问题，先修表再出图：");
  for (const message of problems) console.error(`  - ${message}`);
  process.exit(1);
}

const onlyIds = args.has("only") ? new Set(String(args.get("only")).split(",")) : null;
const onlyGroup = args.get("group") || null;
// --phase= 认 0—6，也认 "overview"（点位表的 phase 就是这两种值，见 Data_SamplePoints 头注）。
const onlyPhaseArg = args.has("phase") ? String(args.get("phase")) : null;
const onlyPhase = onlyPhaseArg === null ? null
  : (onlyPhaseArg === "overview" ? "overview" : Number(onlyPhaseArg));
const selected = OrderedPoints().filter((point) => (
  (!onlyIds || onlyIds.has(point.id))
  && (!onlyGroup || point.group === onlyGroup)
  && (onlyPhase === null || point.phase === onlyPhase)
));
if (!selected.length) {
  console.error("筛选之后一个点位都不剩。");
  process.exit(1);
}
const plan = SampleRunPlan(selected);

let outDir = args.get("out")
  ? path.resolve(String(args.get("out")))
  : path.join(projectDir, "_shots", `Sample_${RUN_DATE}`);
if (!args.get("out") && fs.existsSync(outDir) && !args.has("force")) {
  let n = 2;
  while (fs.existsSync(`${outDir}_${n}`)) n += 1;
  outDir = `${outDir}_${n}`;
}
fs.mkdirSync(outDir, { recursive: true });

let commit = "(未知)";
try {
  commit = execSync("git rev-parse --short HEAD", { cwd: rootDir }).toString().trim();
} catch (error) { /* 不在 git 里也照拍 */ }

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const context = await browser.newContext({
  viewport: VIEWPORT, deviceScaleFactor: 1,
});
// 编辑器会话会把改过的点位存进 localStorage。**出图必须拍源码里那一份**：
// 拍一批带着别人未导出改动的图，等于这一批与历史全部不可比。
await context.addInitScript(() => {
  try { window.localStorage.removeItem("tz1938.samplePoints.v1"); } catch (error) { /* 无痕 */ }
});
const page = await context.newPage();

const pageProblems = [];
page.on("pageerror", (error) => pageProblems.push(`PAGEERROR ${String(error).slice(0, 240)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  if (/fonts\.(googleapis|gstatic)\.com/.test(message.location()?.url || "")) return;
  pageProblems.push(`CONSOLE ${message.text().slice(0, 240)}`);
});

// 补拍（`--only=…`）要能落回同一个目录：目录里已有清单就接着写，
// 按 id 覆盖这一次拍到的那几张，其余原样留着。
// 不合并的话，「修好一个点位补拍一张」会把另外八十八张的清单冲掉。
const manifestFile = path.join(outDir, "Manifest.json");
const previousShots = fs.existsSync(manifestFile)
  ? (JSON.parse(fs.readFileSync(manifestFile, "utf8")).shots || []) : [];
const manifest = {
  date: RUN_DATE,
  commit,
  viewport: VIEWPORT,
  quality: QUALITY,
  scale: SCALE,
  settleFrames: SETTLE_FRAMES,
  warmupFrames: WARMUP_FRAMES,
  generatedAt: new Date().toISOString(),
  shots: [],
};

let failures = 0;
const started = Date.now();

for (const batch of plan) {
  const url = `http://127.0.0.1:${port}/Taierzhuang1938/`
    + `?shot=1&phase=${batch.phase}&quality=${QUALITY}&scale=${SCALE}`;
  console.log(`\n=== ${batch.phaseId} ${batch.phaseLabel}（${batch.points.length} 个点位）===`);
  pageProblems.length = 0;
  await page.goto(url, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => window.Taierzhuang !== undefined, null, { timeout: 240000 });
  await page.evaluate((frames) => window.Taierzhuang.StepFrames(frames), WARMUP_FRAMES);
  await page.waitForTimeout(700);
  // 开采样点编辑器：玩法从这一刻起全停，相机归编辑器管。
  const opened = await page.evaluate(() => !!window.Taierzhuang.Debug.OpenEditor("samplePoints"));
  if (!opened) {
    console.log("ERR  采样点编辑器打不开，本关跳过");
    failures += batch.points.length;
    continue;
  }

  let appliedSky = null;
  for (const point of batch.points) {
    const wantSky = point.sky || null;
    if (wantSky !== appliedSky) {
      const ok = await page.evaluate((name) => (name
        ? window.Taierzhuang.Debug.ApplySky(name)
        : (window.Taierzhuang.Debug.RestoreSky(), true)), wantSky);
      if (!ok) console.log(`     天光 ${wantSky} 套不上，按本关原样拍`);
      appliedSky = wantSky;
    }
    const pose = await page.evaluate((id) => window.Taierzhuang.Debug.SamplePoint(id), point.id);
    if (!pose) {
      console.log(`ERR  ${point.fileName} 装不上位姿`);
      failures += 1;
      continue;
    }
    await page.evaluate((frames) => window.Taierzhuang.StepFrames(frames), SETTLE_FRAMES);
    await page.waitForTimeout(220);
    const pngPath = path.join(outDir, `${point.fileName}.png`);
    const buffer = await page.screenshot({ path: pngPath });
    if (WRITE_JPEG) {
      await page.screenshot({
        path: path.join(outDir, `${point.fileName}.jpg`), type: "jpeg", quality: 88,
      });
    }
    const stats = FrameStats(buffer);
    const verdict = FrameVerdict(stats, point.sky || PhaseFor(point.phase)?.sky);
    manifest.shots.push({
      id: point.id,
      file: `${point.fileName}.png`,
      jpeg: WRITE_JPEG ? `${point.fileName}.jpg` : null,
      label: point.label,
      group: point.group,
      groupLabel: GroupLabel(point.group),
      note: point.note,
      phase: point.phase,
      phaseId: PhaseFor(point.phase)?.id || null,
      phaseLabel: PhaseFor(point.phase)?.label || null,
      sky: point.sky || PhaseFor(point.phase)?.sky || null,
      skyOverridden: !!point.sky,
      pose,
      bytes: buffer.length,
      stats,
      verdict,
    });
    if (verdict) failures += 1;
    const flag = verdict ? "警" : "ok";
    console.log(`${flag}   ${point.fileName.padEnd(30)} ${(buffer.length / 1024).toFixed(0)}KB`
      + `  亮度 ${stats ? stats.mean.toFixed(0) : "?"} 对比 ${stats ? stats.std.toFixed(0) : "?"}`
      + `${verdict ? `  ← ${verdict}` : ""}`);
  }
  if (pageProblems.length) {
    console.log(`     本关有 ${pageProblems.length} 条控制台报错：`);
    for (const message of pageProblems.slice(0, 4)) console.log(`       ${message}`);
  }
  manifest.shots
    .filter((shot) => shot.phase === batch.phase)
    .forEach((shot) => { shot.consoleErrors = pageProblems.length; });
}

await context.close();
await browser.close();
server.close();

// --- 清单 -------------------------------------------------------------------
// 合并旧清单，再按全表顺序重排 —— 目录里的图是按文件名排的，清单必须一致。
{
  const fresh = new Set(manifest.shots.map((shot) => shot.id));
  const kept = previousShots.filter((shot) => !fresh.has(shot.id));
  const order = new Map(OrderedPoints().map((point, index) => [point.id, index]));
  manifest.shots = [...manifest.shots, ...kept]
    .sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9));
  if (kept.length) console.log(`（沿用上一次清单里的 ${kept.length} 张）`);
}
fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 1)}\n`);

const Deg = (rad) => `${(rad * 57.2958).toFixed(0)}°`;
const lines = [
  `# 滕县城 场景截图记录 ${RUN_DATE}`,
  "",
  `- 提交：\`${commit}\``,
  `- 采样点：${manifest.shots.length} 个 · 视口 ${VIEWPORT.width}×${VIEWPORT.height}`
  + ` · 画质 ${QUALITY}/${SCALE}`,
  "- 机位来自 `Data_SamplePoints.mjs`，出图走游戏内「采样点编辑器」的同一份位姿；"
  + "拍摄期间玩法全停，所以同一点位两批之间的差异只来自场景本身。",
  "",
];
for (const group of SAMPLE_GROUPS) {
  const shots = manifest.shots.filter((shot) => shot.group === group.id);
  if (!shots.length) continue;
  lines.push(`## ${group.label}（${shots.length}）`, "");
  for (const shot of shots) {
    lines.push(`### ${shot.file.slice(0, 4)} ${shot.label}`, "");
    lines.push(`![${shot.label}](${shot.file})`, "");
    const height = shot.pose.ground == null
      ? `y ${shot.pose.y.toFixed(1)}（绝对）`
      : `离地 ${(shot.pose.y - shot.pose.ground).toFixed(1)} m`;
    lines.push(`- 机位 (${shot.pose.x}, ${shot.pose.z}) · ${height}`
      + ` · 朝向 ${Deg(shot.pose.yaw)} · 俯仰 ${Deg(shot.pose.pitch)}`
      + ` · FOV ${shot.pose.fov.toFixed(0)}° · 远面 ${shot.pose.far.toFixed(0)} m`);
    lines.push(`- 切片 ${shot.phaseLabel} · 天光 ${shot.sky}${shot.skyOverridden ? "（覆盖）" : ""}`);
    if (shot.stats) {
      lines.push(`- 读数 亮度 ${shot.stats.mean} · 对比度 ${shot.stats.std}`
        + ` · 暗部 ${(shot.stats.darkFrac * 100).toFixed(0)}%`);
    }
    if (shot.note) lines.push(`- ${shot.note}`);
    if (shot.verdict) lines.push(`- **⚠ ${shot.verdict}**`);
    lines.push("");
  }
}
fs.writeFileSync(path.join(outDir, "Index.md"), `${lines.join("\n")}\n`);

if (args.has("compare")) Compare(manifest, String(args.get("compare")));

const seconds = ((Date.now() - started) / 1000).toFixed(0);
console.log(`\n${manifest.shots.length} 张，用时 ${seconds} 秒 → ${outDir}`);
console.log(`清单：${path.join(outDir, "Index.md")}`);
if (failures) console.log(`有 ${failures} 张需要复核（见上面的「警」）。`);
process.exit(failures ? 1 : 0);
