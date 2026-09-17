// ===========================================================================
// Script_MissionNotesCli.mjs —— 关卡编排批注的命令行口（agent 不开浏览器也能读/结案）
//
// 工作台把用户的意见写进 `Taierzhuang1938/Notes/<Level>/notes.json`，
// agent 从这里读、改完从这里标掉。读的是同一个文件、同一份 schema
//（`Script_MissionNotes.mjs`），所以不会出现「面板说三条、命令行说两条」。
//
//   node Taierzhuang1938/Script_MissionNotesCli.mjs list [--all]
//   node Taierzhuang1938/Script_MissionNotesCli.mjs handoff
//   node Taierzhuang1938/Script_MissionNotesCli.mjs drift
//   node Taierzhuang1938/Script_MissionNotesCli.mjs resolve <id> --summary "…" [--commit <sha>]
//   node Taierzhuang1938/Script_MissionNotesCli.mjs dismiss <id>
//
//   --level=FirstLevel   换关卡（默认 FirstLevel）
//
// `drift` 要拿当前关卡的编排模型来比对，所以它动态 import
// `Script_MissionOrchestration.mjs`；那份还没建好时打一句提示就退，退出码 0 ——
// 这条命令是「顺手查一下」，不该把别人的门禁弄红。
// ===========================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  HandoffMarkdown, NoteDrift, ResolveNote, DismissNote, ValidateNote, LEVEL_RE, NotesPathFor,
} from "./Script_MissionNotes.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const argv = process.argv.slice(2);

const HELP = `关卡编排批注（Taierzhuang1938/Notes/<Level>/notes.json）

  list [--all]                                  列出待处理批注（--all 连已结案的一起列）
  handoff                                       打印完整交接文本（按阶段分组 + 机器可读 JSON 块）
  drift                                         哪些批注的「原设置」已经和当前关卡对不上了
  resolve <id> --summary "…" [--commit <sha>]   标成已处理，写清楚改了什么
  dismiss <id> [--summary "…"]                  标成不处理

  --level=FirstLevel                            换关卡（默认 FirstLevel）`;

// 带值的开关：`--summary "…"` 与 `--summary=…` 两种写法都收。分开记一份，是因为
// 空格写法的那个值也长得像位置参数 —— 不排掉它，`resolve <id> --summary "太早了"`
// 里的「太早了」会被当成下一个位置参数。
const VALUE_FLAGS = new Set(["level", "summary", "commit"]);
const positional = [];
const flags = new Map();
for (let i = 0; i < argv.length; i += 1) {
  const item = argv[i];
  if (!item.startsWith("--")) { positional.push(item); continue; }
  const eq = item.indexOf("=");
  const name = eq < 0 ? item.slice(2) : item.slice(2, eq);
  if (eq >= 0) { flags.set(name, item.slice(eq + 1)); continue; }
  if (VALUE_FLAGS.has(name) && i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
    flags.set(name, argv[i + 1]);
    i += 1;
    continue;
  }
  flags.set(name, "");
}

function Flag(name) { return flags.get(name); }

function Fail(message) {
  console.error(message);
  process.exit(1);
}

const command = positional[0] || "list";
const level = Flag("level") || "FirstLevel";
if (!LEVEL_RE.test(level)) Fail(`--level 只能是字母数字：${level}`);

const relative = NotesPathFor(level);
const notesFile = path.join(rootDir, relative);

function LoadNotes() {
  if (!fs.existsSync(notesFile)) Fail(`没有 ${relative} —— 工作台保存过一次就有了`);
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(notesFile, "utf8")); } catch (error) {
    Fail(`${relative} 不是合法 JSON：${error.message}`);
  }
  if (!Array.isArray(parsed)) Fail(`${relative} 要是一个数组`);
  return parsed;
}

/** 原子写回：Ctrl+C 落在写一半那一瞬，文件要么是旧的要么是新的，不会半截。 */
function SaveNotes(notes) {
  const temporary = `${notesFile}.tmp`;
  fs.mkdirSync(path.dirname(notesFile), { recursive: true });
  fs.writeFileSync(temporary, `${JSON.stringify(notes, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, notesFile);
}

/** 编排模型（P1）。还没建好时返回 null —— 批注本身不依赖它。 */
async function LoadModel() {
  const file = path.join(projectDir, "Script_MissionOrchestration.mjs");
  if (!fs.existsSync(file)) return null;
  const module = await import(pathToFileURL(file).href);
  if (typeof module.BuildOrchestrationModel !== "function") return null;
  return module.BuildOrchestrationModel();
}

function Describe(note) {
  const target = note.target || {};
  if (target.kind === "point") return `point (${target.x}, ${target.z})`;
  if (target.kind === "time") return `time ${target.seconds ?? target.atS} s`;
  return `${target.kind} ${target.id}`;
}

function OneLine(text, width = 42) {
  const flat = String(text).replace(/\s+/g, " ").trim();
  return flat.length > width ? `${flat.slice(0, width - 1)}…` : flat;
}

async function Main() {
  if (argv.includes("--help") || argv.includes("-h") || command === "help") { console.log(HELP); return; }

  if (command === "list") {
    const all = argv.includes("--all");
    const notes = LoadNotes();
    const shown = all ? notes : notes.filter((note) => note.status === "open");
    console.log(`${level} · ${shown.length} 条${all ? "" : "待处理"}批注（文件里共 ${notes.length} 条）`);
    for (const note of shown) {
      const where = [Number.isFinite(note.phaseNumber) ? `阶段 ${note.phaseNumber}` : "", note.step || ""]
        .filter(Boolean).join(" / ") || "未指定阶段";
      console.log(`  ${note.id}  [${note.status}]${note.verified ? " ✓已核对" : ""}`
        + `  ${Describe(note)}  ${where}`);
      console.log(`      ${OneLine(note.text, 72)}`);
      if (note.proposal) console.log(`      建议：${note.proposal.kind}${note.proposal.note ? ` ${OneLine(note.proposal.note)}` : ""}`);
      if (note.image) console.log(`      图：Taierzhuang1938/Notes/${note.level}/${note.image}`);
      if (note.resolution) console.log(`      已处理：${OneLine(note.resolution.summary, 72)}`);
    }
    if (!shown.length) console.log("  （空）");
    const broken = notes.map((note, index) => ({ index, result: ValidateNote(note) })).filter((row) => !row.result.ok);
    for (const row of broken) console.log(`  ⚠ 第 ${row.index} 条不合规：${row.result.errors.join("；")}`);
    return;
  }

  if (command === "handoff") {
    const notes = LoadNotes();
    const model = await LoadModel();
    console.log(HandoffMarkdown(notes, model, { onlyOpen: !argv.includes("--all") }));
    return;
  }

  if (command === "drift") {
    const notes = LoadNotes();
    const model = await LoadModel();
    if (!model) {
      console.log("还没有 Taierzhuang1938/Script_MissionOrchestration.mjs（编排模型），没法比对原设置 —— 跳过。");
      return;
    }
    let changed = 0;
    for (const note of notes) {
      if (note.status !== "open" && !argv.includes("--all")) continue;
      const drift = NoteDrift(note, model);
      if (!drift.changed) continue;
      changed += 1;
      console.log(`${note.id}  ${Describe(note)}  —— ${drift.diff.length} 处变化`);
      for (const row of drift.diff.slice(0, 12)) {
        console.log(`    ${row.path || "(整体)"}：${JSON.stringify(row.from)} → ${JSON.stringify(row.to)}`);
      }
      if (drift.diff.length > 12) console.log(`    …还有 ${drift.diff.length - 12} 处`);
    }
    console.log(changed ? `\n${changed} 条批注的原设置已经和当前关卡对不上了。` : "所有批注的原设置都还对得上。");
    return;
  }

  if (command === "resolve" || command === "dismiss") {
    const id = positional[1];
    if (!id) Fail(`要给一个批注 id：node Taierzhuang1938/Script_MissionNotesCli.mjs ${command} <id> --summary "…"`);
    const summary = Flag("summary");
    if (command === "resolve" && !summary) Fail("resolve 要带 --summary \"改了什么\" —— 没有这句话，用户对不回来");
    const notes = LoadNotes();
    const at = notes.findIndex((note) => note.id === id);
    if (at < 0) Fail(`${relative} 里没有 ${id}`);
    const next = command === "resolve"
      ? ResolveNote(notes[at], { summary, commit: Flag("commit") || undefined })
      : DismissNote(notes[at], summary || "不处理");
    const check = ValidateNote(next);
    if (!check.ok) Fail(`改完这条批注反而不合规了：${check.errors.join("；")}`);
    notes[at] = next;
    SaveNotes(notes);
    console.log(`${id} → ${next.status}：${next.resolution.summary}${next.resolution.commit ? `（${next.resolution.commit}）` : ""}`);
    console.log(`已写回 ${relative}`);
    return;
  }

  console.error(`不认识的命令：${command}\n`);
  console.log(HELP);
  process.exit(1);
}

Main().catch((error) => {
  console.error(String(error && error.stack ? error.stack : error));
  process.exit(1);
});
