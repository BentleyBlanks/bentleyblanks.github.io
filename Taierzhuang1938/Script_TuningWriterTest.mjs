// ===========================================================================
// Script_TuningWriterTest.mjs —— 调参表改写器 + 本地保存端点的闸门（纯 Node，秒级）
//
// 这一层守的是一句话：**保存完 `git diff` 只多不少地只动那一个数**。
// 五张 `Data_Tuning_Ai*.mjs` 里每组数上面都压着一段「为什么是这个数」的账，
// 改写器一旦把注释、缩进、行尾逗号或换行风格动了，那些账就在一次「保存」里没了。
//
// 覆盖（docs/Data_EnemyAi.md §14.3）：
//   ① 改一个数 → 只有那一行变，其余**逐字节**相等；
//   ② 五张真表的**每一个**数值 / 布尔叶子都解析得回来（引用型的两处除外，见 ⑦）；
//   ③ 同名键不许串：`GRENADE.minM` 与 `INVESTIGATE.minM`、
//      `AWARENESS.thresholds.suspicious` 与 `AWARENESS.release.suspicious`；
//   ④ 缺键 / 类型不符 / 表达式（`Math.PI * 0.5`）一律进 missing，绝不猜着改；
//   ⑤ 布尔、负数、科学计数、数组下标、`-1.0` 那种小数排版；
//   ⑥ 改完的文本能被 `import` 起来且读到新值（写到临时目录再 import）；
//   ⑦ 保存端点：起一次真的 `Script_LocalPreview`，POST 改临时目录里的一张表副本，
//      验证文件真的变了；非法文件名 / 越界路径 / 超大 body / 非回环地址被拒。
//
// 跑法：node Taierzhuang1938/Script_TuningWriterTest.mjs
//   或：node Taierzhuang1938/Script_TestRunner.mjs --only=TuningWriterTest
// ===========================================================================

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ApplyTuningChanges, ReadTuningValue, TUNING_FILE_RE } from "./Script_TuningWriter.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const previewScript = path.join(rootDir, "scripts", "Script_LocalPreview.mjs");

let checks = 0;
function Check(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

const TABLE_FILES = [
  "Data_Tuning_Ai.mjs", "Data_Tuning_AiCover.mjs", "Data_Tuning_AiPerception.mjs",
  "Data_Tuning_AiShooting.mjs", "Data_Tuning_AiTactics.mjs",
];
const sources = new Map();
for (const name of TABLE_FILES) sources.set(name, fs.readFileSync(path.join(projectDir, name), "utf8"));

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "tz-tuning-"));

/** 改动的行号清单（同时确认行数没变）。 */
function ChangedLines(before, after) {
  const a = before.split("\n");
  const b = after.split("\n");
  Check(a.length === b.length, "改写不许增删行");
  const rows = [];
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) rows.push({ line: i + 1, before: a[i], after: b[i] });
  return rows;
}

/** 把改过的那些行还原回去，剩下的必须与原文**逐字节**相等。 */
function AssertOnlyTheseLines(before, after, rows, label) {
  const b = after.split("\n");
  for (const row of rows) b[row.line - 1] = row.before;
  Check(b.join("\n") === before, `${label}：除了那 ${rows.length} 行，其余逐字节相等`);
}

// ======================================================== ① 只动那一行
{
  const before = sources.get("Data_Tuning_AiCover.mjs");
  const { source: after, applied, missing } = ApplyTuningChanges(before, [
    { path: "COVER.standoffM", value: 0.7 },
  ]);
  Check(missing.length === 0, "没有 missing");
  Check(applied.length === 1 && applied[0].from === 0.65 && applied[0].to === 0.7,
    `applied 记下了 from/to：${JSON.stringify(applied)}`);
  const rows = ChangedLines(before, after);
  Check(rows.length === 1, `只有一行变（实际 ${rows.length}）`);
  // 仓库里的表是 CRLF，按 "\n" 切出来的行尾还挂着 "\r" —— 断言要容得下它，
  // 那个 "\r" 恰恰是「换行风格没被改写器动过」的证据。
  Check(/^\s*standoffM: 0\.7,\r?$/.test(rows[0].after), `变的那一行是 standoffM：${JSON.stringify(rows[0].after)}`);
  Check(rows[0].before.replace("0.65", "0.7") === rows[0].after, "行内除了那个数一个字符都没动");
  AssertOnlyTheseLines(before, after, rows, "单值改写");
  Check(ReadTuningValue(after, "COVER.standoffM") === 0.7, "读回新值");
  Check(after.includes("\r\n") === before.includes("\r\n"), "换行风格没变");
  console.log(`ok  ① 改一个数：只动第 ${rows[0].line} 行，其余逐字节相等`);
}

// ============================================ ② 五张真表的每一个叶子都解析得回
{
  // 引用型的值（`weights: COVER_WEIGHTS`、`PERCEPTION.fov: FOV`）不是字面量，
  // 改不动也读不到 —— 这是设计：编辑器要改的是**它自己那一组**里的数。
  const REFERENCE_PREFIXES = ["PERCEPTION.", "COVER.weights."];
  let leaves = 0;
  for (const name of TABLE_FILES) {
    const source = sources.get(name);
    const module = await import(pathToFileURL(path.join(projectDir, name)).href);
    const Walk = (value, prefix) => {
      if (value === null || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        const at = `${prefix}.${key}`;
        if (typeof child === "number" || typeof child === "boolean") {
          if (REFERENCE_PREFIXES.some((p) => at.startsWith(p))) continue;
          leaves += 1;
          const read = ReadTuningValue(source, at);
          Check(read === child, `${name} 的 ${at} 解析得到 ${child}（实际 ${String(read)}）`);
          continue;
        }
        Walk(child, at);
      }
    };
    for (const [key, value] of Object.entries(module)) Walk(value, key);
    // 顶层就是数组的那一张（SIGHT_BY_STANCE 没包 Freeze）也要走得通
    if (name === "Data_Tuning_Ai.mjs") {
      Check(ReadTuningValue(source, "SIGHT_BY_STANCE.2") === 45, "裸数组导出（没包 Freeze）也解析得到");
    }
  }
  Check(leaves > 200, `叶子数够多，覆盖是真的（${leaves} 个）`);
  Check(ReadTuningValue(sources.get("Data_Tuning_AiPerception.mjs"), "PERCEPTION.fov.omniRadiusM") === undefined,
    "引用型的值读不到（`fov: FOV` 不是字面量）—— 这是已知边界，不是回归");
  console.log(`ok  ② 五张真表的 ${leaves} 个数值/布尔叶子逐个解析回原值`);
}

// ================================================ ③ 同名键不许串层
{
  const before = sources.get("Data_Tuning_AiTactics.mjs");
  Check(ReadTuningValue(before, "GRENADE.minM") === 8 && ReadTuningValue(before, "INVESTIGATE.minM") === 3,
    "两个 minM 本来就是两个数");
  const { source: after, applied, missing } = ApplyTuningChanges(before, [{ path: "GRENADE.minM", value: 9 }]);
  Check(missing.length === 0 && applied.length === 1 && applied[0].from === 8, "改的是 GRENADE 那一个");
  const rows = ChangedLines(before, after);
  Check(rows.length === 1 && /^\s*minM: 9,/.test(rows[0].after), "只有一行 minM 变了");
  Check(ReadTuningValue(after, "INVESTIGATE.minM") === 3, "另一层的同名键一个字没动");
  AssertOnlyTheseLines(before, after, rows, "同名键");

  const perception = sources.get("Data_Tuning_AiPerception.mjs");
  const deep = ApplyTuningChanges(perception, [{ path: "AWARENESS.thresholds.suspicious", value: 0.3 }]);
  Check(deep.missing.length === 0 && deep.applied[0].from === 0.25, "改的是 thresholds 那一个");
  Check(ReadTuningValue(deep.source, "AWARENESS.release.suspicious") === 0.15, "同一组里 release 的同名键没动");
  Check(ReadTuningValue(deep.source, "AWARENESS.thresholds.alert") === 0.55, "同一行里旁边的键没动");
  const deepRows = ChangedLines(perception, deep.source);
  Check(deepRows.length === 1, "同一行上有三个键，只改那一个");
  AssertOnlyTheseLines(perception, deep.source, deepRows, "行内多键");
  console.log("ok  ③ 同名键按花括号层级定位，不串层、不串行");
}

// ============================================ ④ 缺键 / 类型不符 / 表达式
{
  const before = sources.get("Data_Tuning_AiCover.mjs");
  const result = ApplyTuningChanges(before, [
    { path: "COVER.nope", value: 1 },              // 组里没有这个键
    { path: "NOPE.standoffM", value: 1 },          // 没有这个组
    { path: "COVER.weights", value: 1 },           // 是引用，不是数
    { path: "COVER", value: 1 },                   // 只有一段，不是叶子路径
    { path: "COVER.standoffM", value: true },      // 数字位不收布尔
    { path: "COVER.standoffM", value: Number.NaN },// 非有限数
    { path: "COVER_CYCLE.peekMinS", value: 0.9 },  // 这个是好的
  ]);
  Check(result.missing.length === 6, `六条都进 missing：${JSON.stringify(result.missing)}`);
  Check(result.applied.length === 1 && result.applied[0].path === "COVER_CYCLE.peekMinS", "好的那一条照改");
  Check(ChangedLines(before, result.source).length === 1, "坏的那几条一行都没碰");

  const tactics = sources.get("Data_Tuning_AiTactics.mjs");
  const boolWrong = ApplyTuningChanges(tactics, [{ path: "TACTICS.steerPathProbe", value: 0 }]);
  Check(boolWrong.missing.length === 1 && boolWrong.source === tactics, "布尔位不收数字（0 不是 false）");

  // 表达式：真表里没有，用一段合成源码把这条守死。
  const synthetic = [
    "const Freeze = Object.freeze;",
    "export const SPIN = Freeze({",
    "  halfTurnRad: Math.PI * 0.5,   // 表达式：改不动",
    "  name: \"spin\",                // 字符串：改不动",
    "  rate: 2.5,",
    "});",
    "",
  ].join("\n");
  const expr = ApplyTuningChanges(synthetic, [
    { path: "SPIN.halfTurnRad", value: 1 }, { path: "SPIN.name", value: 1 }, { path: "SPIN.rate", value: 3 },
  ]);
  Check(expr.missing.length === 2 && expr.applied.length === 1, "表达式与字符串进 missing，旁边的数照改");
  Check(expr.source.includes("Math.PI * 0.5,   // 表达式：改不动"), "表达式那一行原样留着（含行内注释）");
  Check(expr.source.includes("rate: 3.0,"), "同一层的数改成了 3（原来是 2.5，小数排版保住）");
  console.log("ok  ④ 缺键 / 引用 / 表达式 / 字符串 / 类型不符 一律 missing，绝不猜着改");
}

// ================================ ⑤ 布尔 / 负数 / 科学计数 / 数组下标 / 小数排版
{
  const tactics = sources.get("Data_Tuning_AiTactics.mjs");
  const flip = ApplyTuningChanges(tactics, [{ path: "TACTICS.steerPathProbe", value: true }]);
  Check(flip.applied[0].from === false && flip.applied[0].to === true, "布尔位改得动");
  Check(/steerPathProbe: true,/.test(flip.source), "写进去的是 true");
  Check(ChangedLines(tactics, flip.source).length === 1, "布尔也只动一行");

  const cover = sources.get("Data_Tuning_AiCover.mjs");
  const negative = ApplyTuningChanges(cover, [
    { path: "COVER_WEIGHTS.distanceM", value: -1.4 },
    { path: "COVER_WEIGHTS.occupiedOther", value: -70 },
  ]);
  Check(negative.missing.length === 0 && negative.applied[0].from === -1, "负数读得到（-1.0 → -1）");
  Check(/distanceM: -1\.4,/.test(negative.source), "负小数写得回去");
  Check(/occupiedOther: -70,/.test(negative.source), "负整数写得回去");
  // `-1.0` 那种排版：改成整数时保住小数点，免得一列对齐的数被改花。
  const keepDecimal = ApplyTuningChanges(cover, [{ path: "COVER_WEIGHTS.distanceM", value: -2 }]);
  Check(/distanceM: -2\.0,/.test(keepDecimal.source), "原来是 -1.0 的位置写整数会补成 -2.0");

  const shooting = sources.get("Data_Tuning_AiShooting.mjs");
  Check(ReadTuningValue(shooting, "AIM.snapRad") === 2e-4, "科学计数读得到");
  const tiny = ApplyTuningChanges(shooting, [
    { path: "AIM.snapRad", value: 1e-7 },
    { path: "AIM.stanceScale.1", value: 0.9 },
    { path: "BURST.byKind.lmg.max", value: 11 },
  ]);
  Check(tiny.missing.length === 0 && tiny.applied.length === 3, "科学计数 / 数组下标 / 三层嵌套都改得动");
  Check(/snapRad: 1e-7,/.test(tiny.source), "科学计数写回去仍是科学计数");
  Check(ReadTuningValue(tiny.source, "AIM.stanceScale.1") === 0.9, "数组按下标改（stanceScale.1）");
  Check(ReadTuningValue(tiny.source, "AIM.stanceScale.0") === 1.0
    && ReadTuningValue(tiny.source, "AIM.stanceScale.2") === 0.74, "数组里旁边两个元素没动");
  Check(ReadTuningValue(tiny.source, "BURST.byKind.hmg.max") === 14, "同名 max 在别的枪种上没被串改");
  Check(ChangedLines(shooting, tiny.source).length === 3, "三处改动三行");

  const ai = sources.get("Data_Tuning_Ai.mjs");
  const squad = ApplyTuningChanges(ai, [
    { path: "SQUAD.slots.2.lateral", value: 5 }, { path: "SIGHT_BY_STANCE.2", value: 50 },
  ]);
  Check(squad.missing.length === 0 && ReadTuningValue(squad.source, "SQUAD.slots.2.lateral") === 5,
    "数组里的对象成员（SQUAD.slots.2.lateral）改得动");
  Check(ReadTuningValue(squad.source, "SQUAD.slots.4.lateral") === -6, "别的槽位没动");
  Check(/export const SIGHT_BY_STANCE = \[120, 80, 50\];/.test(squad.source), "裸数组导出改得动，排版不变");
  console.log("ok  ⑤ 布尔 / 负数 / 科学计数 / 数组下标 / 深层嵌套 / 小数排版");
}

// ====================================== ⑥ 改完的文本 import 起来读到新值
{
  const outDir = path.join(workDir, "reimport");
  fs.mkdirSync(outDir, { recursive: true });
  const cover = ApplyTuningChanges(sources.get("Data_Tuning_AiCover.mjs"), [
    { path: "COVER_CYCLE.peekMinS", value: 1.25 }, { path: "COVER.tallM", value: 1.7 },
  ]);
  const coverFile = path.join(outDir, "Data_Tuning_AiCover.mjs");
  fs.writeFileSync(coverFile, cover.source, "utf8");
  const reloaded = await import(pathToFileURL(coverFile).href);
  Check(reloaded.COVER_CYCLE.peekMinS === 1.25 && reloaded.COVER.tallM === 1.7, "import 回来读到新值");
  Check(reloaded.COVER.weights.validatedCrouched === 18, "组之间的引用还接得上（weights 仍指向 COVER_WEIGHTS）");
  Check(Object.isFrozen(reloaded.COVER), "纯 Node 里表仍然是冻的（TAIERZHUANG_TUNING_EDITABLE 没置起）");

  const tactics = ApplyTuningChanges(sources.get("Data_Tuning_AiTactics.mjs"), [
    { path: "TACTICS.steerPathProbe", value: true }, { path: "GRENADE.minM", value: 9 },
  ]);
  const tacticsFile = path.join(outDir, "Data_Tuning_AiTactics.mjs");
  fs.writeFileSync(tacticsFile, tactics.source, "utf8");
  const reloadedTactics = await import(pathToFileURL(tacticsFile).href);
  Check(reloadedTactics.TACTICS.steerPathProbe === true && reloadedTactics.GRENADE.minM === 9
    && reloadedTactics.INVESTIGATE.minM === 3, "布尔与同名键 import 回来都对");
  console.log("ok  ⑥ 改完的表 import 得起来，读到的是新值");
}

// ============================================ 文件名白名单（保存端点共用）
{
  Check(TUNING_FILE_RE.test("Taierzhuang1938/Data_Tuning_AiCover.mjs"), "白名单认正经表名");
  for (const bad of [
    "Taierzhuang1938/Data_Battle.mjs", "Data_Tuning_AiCover.mjs", "Taierzhuang1938/Data_Tuning_Ai_Cover.mjs",
    "Taierzhuang1938/../scripts/Script_LocalPreview.mjs", "Taierzhuang1938/Data_Tuning_../x.mjs",
    "/etc/passwd", "Taierzhuang1938/Data_Tuning_AiCover.mjs.bak",
  ]) Check(!TUNING_FILE_RE.test(bad), `白名单挡住 ${bad}`);
  console.log("ok  文件名白名单：只放 Taierzhuang1938/Data_Tuning_*.mjs");
}

// ================================================== ⑦ 保存端点（真起一次服）
/** 起一次真的本地预览服，根指向 root；返回 { port, Stop() }。 */
function StartPreview(root, port, extra = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [previewScript, `--root=${root}`, "--no-open", String(port), ...extra],
      { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error(`预览服没起来：${out}`)); }, 20000);
    child.stdout.on("data", (chunk) => {
      out += chunk.toString("utf8");
      const match = /http:\/\/127\.0\.0\.1:(\d+)\/__preview\//.exec(out);
      if (!match) return;
      clearTimeout(timer);
      resolve({
        port: Number(match[1]),
        Stop: () => new Promise((done) => { child.once("close", done); child.kill(); }),
      });
    });
    child.stderr.on("data", (chunk) => { out += chunk.toString("utf8"); });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
  });
}

async function PostSave(origin, payload, raw = null) {
  const response = await fetch(`${origin}/__tuning/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw === null ? JSON.stringify(payload) : raw,
    signal: AbortSignal.timeout(15000),
  });
  let json = null;
  try { json = await response.json(); } catch { /* 有的错误分支没有 body */ }
  return { status: response.status, json };
}

{
  // 服务根是一个**临时目录**：端点真的会写盘，绝不拿仓库里的表当靶子。
  const serveRoot = path.join(workDir, "tree");
  const tableDir = path.join(serveRoot, "Taierzhuang1938");
  fs.mkdirSync(tableDir, { recursive: true });
  const target = path.join(tableDir, "Data_Tuning_AiCover.mjs");
  fs.writeFileSync(target, sources.get("Data_Tuning_AiCover.mjs"), "utf8");
  fs.writeFileSync(path.join(serveRoot, "index.html"), "<!doctype html><title>t</title>\n", "utf8");

  // 8300–8899：避开 8080（用户自己的预览服）与 Chromium 的受限端口段。
  const wanted = 8300 + Math.floor(Math.random() * 600);
  const preview = await StartPreview(serveRoot, wanted);
  const origin = `http://127.0.0.1:${preview.port}`;
  try {
    const status = await fetch(`${origin}/__tuning/status`, { signal: AbortSignal.timeout(10000) });
    const statusJson = await status.json();
    Check(status.status === 200 && statusJson.writable === true, `GET /__tuning/status → ${JSON.stringify(statusJson)}`);

    // 别的路由一个字没改：索引页的 ping 与静态文件照旧。
    const ping = await (await fetch(`${origin}/__preview/ping`, { signal: AbortSignal.timeout(10000) })).json();
    Check(ping.app === "BlanksLocalPreview" && path.resolve(ping.root) === path.resolve(serveRoot), "索引页 ping 没受影响");
    const page = await fetch(`${origin}/index.html`, { signal: AbortSignal.timeout(10000) });
    Check(page.status === 200 && page.headers.get("cache-control") === "no-store", "静态路由与响应头没受影响");

    const before = fs.readFileSync(target, "utf8");
    const ok = await PostSave(origin, {
      file: "Taierzhuang1938/Data_Tuning_AiCover.mjs",
      changes: [{ path: "COVER_CYCLE.peekMinS", value: 0.85 }, { path: "COVER_CYCLE.nope", value: 1 }],
    });
    Check(ok.status === 200 && ok.json.ok === true && ok.json.applied === 1
      && ok.json.missing.length === 1 && ok.json.changes[0].from === 0.7,
      `POST /__tuning/save → ${JSON.stringify(ok.json)}`);
    const after = fs.readFileSync(target, "utf8");
    const rows = ChangedLines(before, after);
    Check(rows.length === 1 && /peekMinS: 0\.85,/.test(rows[0].after), `盘上的文件真的变了：第 ${rows[0].line} 行`);
    AssertOnlyTheseLines(before, after, rows, "端点写回");
    Check(!fs.existsSync(`${target}.tmp`), "原子写回的 .tmp 没有留在盘上");

    // --- 被拒的用例 ---------------------------------------------------------
    const badName = await PostSave(origin, {
      file: "Taierzhuang1938/Data_Battle.mjs", changes: [{ path: "COMBAT.aiAccuracyBase", value: 0.5 }],
    });
    Check(badName.status === 403 && badName.json.ok === false, `非调参表被拒：${badName.status} ${JSON.stringify(badName.json)}`);

    const escape = await PostSave(origin, {
      file: "Taierzhuang1938/../../Data_Tuning_AiCover.mjs", changes: [{ path: "COVER.tallM", value: 2 }],
    });
    Check(escape.status === 403 && escape.json.ok === false, `越界路径被拒：${escape.status} ${JSON.stringify(escape.json)}`);

    const huge = await PostSave(origin, null, JSON.stringify({
      file: "Taierzhuang1938/Data_Tuning_AiCover.mjs",
      changes: [{ path: "COVER.tallM", value: 2, pad: "x".repeat(300 * 1024) }],
    }));
    Check(huge.status === 400 && huge.json?.ok === false, `超过 256 KB 的 body 被拒：${huge.status}`);

    const notJson = await PostSave(origin, null, "not json");
    Check(notJson.status === 400 && notJson.json.ok === false, `不是 JSON 的 body 被拒：${notJson.status}`);

    const getSave = await fetch(`${origin}/__tuning/save`, { signal: AbortSignal.timeout(10000) });
    Check(getSave.status === 405, `保存口只收 POST（GET → ${getSave.status}）`);

    Check(fs.readFileSync(target, "utf8") === after, "四条被拒的请求一个字节都没写进去");
    console.log(`ok  ⑦ 保存端点：:${preview.port} 上真写了盘，非法文件名 / 越界路径 / 超大 body / 非 JSON / GET 全被拒`);
  } finally {
    await preview.Stop();
  }

  // --- 非回环地址：起一次 --lan，从本机的局域网 IP 打过去 -------------------
  // 拿不到局域网地址（或者被防火墙挡住）时跳过 —— 这条是环境相关的，
  // 不该让整条闸门在一台没有网卡的机器上变红。
  const lanIp = Object.values(os.networkInterfaces()).flat()
    .find((net) => net && net.family === "IPv4" && !net.internal)?.address;
  if (!lanIp) {
    console.log("skip ⑦ 非回环拒绝：这台机器没有局域网 IPv4");
  } else {
    const preview2 = await StartPreview(serveRoot, 8300 + Math.floor(Math.random() * 600), ["--lan"]);
    try {
      const remote = `http://${lanIp}:${preview2.port}`;
      const save = await PostSave(remote, {
        file: "Taierzhuang1938/Data_Tuning_AiCover.mjs", changes: [{ path: "COVER.tallM", value: 2 }],
      });
      Check(save.status === 403 && save.json.ok === false, `非回环地址（${lanIp}）被拒：${save.status}`);
      const status = await (await fetch(`${remote}/__tuning/status`, { signal: AbortSignal.timeout(10000) })).json();
      Check(status.writable === false, "非回环地址上 status 退化成 writable:false（编辑器据此退化成「复制片段」）");
      console.log(`ok  ⑦ 非回环拒绝：从 ${lanIp} 打过来 403，status 报 writable:false`);
    } catch (error) {
      console.log(`skip ⑦ 非回环拒绝：局域网口打不通（${String(error.message || error).slice(0, 80)}）`);
    } finally {
      await preview2.Stop();
    }
  }
}

fs.rmSync(workDir, { recursive: true, force: true });
Check(!fs.existsSync(workDir), "临时目录清干净了");
// 仓库里的五张表一个字节都不许被这条闸门碰过。
for (const name of TABLE_FILES) {
  Check(fs.readFileSync(path.join(projectDir, name), "utf8") === sources.get(name),
    `${name} 在测试前后逐字节相同（改写器测试只用副本）`);
}

console.log(`\nTuningWriterTest 通过：${checks} 条断言`);
