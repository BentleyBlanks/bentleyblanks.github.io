// ===========================================================================
// Script_EditorBlockoutCli.mjs —— 白盒关卡编辑器的配置命令行（node，docs/Data_EditorBlockout.md §1、§8、§9）
//
// 从 worktree 根运行：
//   node Taierzhuang1938/Script_EditorBlockoutCli.mjs export FirstLevel [--out=<path>] [--force]
//   node Taierzhuang1938/Script_EditorBlockoutCli.mjs scene SecondLevel [--force]
//   node Taierzhuang1938/Script_EditorBlockoutCli.mjs scene FirstLevel0105 [--force]    （只写场景文件）
//   node Taierzhuang1938/Script_EditorBlockoutCli.mjs export FirstLevel0105 [--force]   （只写配置；之后以手改的 JSON 为准）
//   node Taierzhuang1938/Script_EditorBlockoutCli.mjs scene FirstLevel0610 [--force]    （06–10 耿家庄：只写场景文件）
//   node Taierzhuang1938/Script_EditorBlockoutCli.mjs export FirstLevel0610 [--force]   （06–10：只写配置）
//   node Taierzhuang1938/Script_EditorBlockoutCli.mjs scene FirstLevel1218 [--force]    （12–18 北沙河：只写场景文件）
//   node Taierzhuang1938/Script_EditorBlockoutCli.mjs export FirstLevel1218 [--force]   （12–18：只写配置）
//   node Taierzhuang1938/Script_EditorBlockoutCli.mjs validate [FirstLevel|SecondLevel|FirstLevel0105|FirstLevel0610|FirstLevel1218|all]
//   node Taierzhuang1938/Script_EditorBlockoutCli.mjs summary [FirstLevel|SecondLevel]
//   node Taierzhuang1938/Script_EditorBlockoutCli.mjs kf <Level> <keyframeId>
// 通用选项：--commit=<sha>（缺省读 git HEAD）、--generated-at=<ISO>（缺省现在）。只有这个 CLI 读时钟与 git。
//
// export / scene 默认不覆盖已有文件（人或 AI 可能刚改过），要覆盖加 --force。
// 写出的 JSON 一律 2 空格缩进 + 末尾换行（与 /__blockout/save 同口径）。
// ===========================================================================

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ValidateBlockout, ValidateBlockoutScene, NormalizeBlockout, BLOCKOUT_LEVEL_KEYS, KeyframeIndex } from "./Script_EditorBlockoutConfig.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BLOCKOUT_DIR = path.join(HERE, "Blockout");

const F = (v) => Number(Number(v).toFixed(1));

export function ConfigFile(level) { return path.join(BLOCKOUT_DIR, `${level}.json`); }
export function SceneFile(level) { return path.join(BLOCKOUT_DIR, `${level}.scene.json`); }
export function StringifyBlockout(doc) { return JSON.stringify(doc, null, 2) + "\n"; }

function ParseArgs(argv) {
  const positional = [], options = {};
  for (const arg of argv) {
    const m = /^--([A-Za-z-]+)(?:=(.*))?$/.exec(arg);
    if (m) options[m[1]] = m[2] === undefined ? true : m[2];
    else positional.push(arg);
  }
  return { positional, options };
}

function GitHead() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: HERE, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function SourceOptions(options) {
  return {
    commit: typeof options.commit === "string" ? options.commit : GitHead(),
    generatedAt: typeof options["generated-at"] === "string" ? options["generated-at"] : new Date().toISOString(),
  };
}

function WriteGuarded(file, text, force) {
  if (fs.existsSync(file) && !force) {
    throw new Error(`${path.relative(process.cwd(), file)} 已存在；确认要覆盖（会丢掉手改的内容）再加 --force`);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, text, "utf8");
  fs.renameSync(tmp, file);
}

function ReadJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function AssertLevel(level) {
  if (!BLOCKOUT_LEVEL_KEYS.includes(level)) throw new Error(`不认识的关卡 ${JSON.stringify(level)}（只有 ${BLOCKOUT_LEVEL_KEYS.join(" / ")}）`);
}

// ---------------------------------------------------------------------------

/** 01–05 新剧本白盒（FirstLevel0105）：场景与配置各有生成器，都按 Data_EditorBlockoutFirstLevel0105Space 的锚点。 */
async function CmdExport0105(options) {
  const { BuildFirstLevel0105Config } = await import("./Script_EditorBlockoutFirstLevel0105Keyframes.mjs");
  const issues = [];
  const doc = await BuildFirstLevel0105Config({ ...SourceOptions(options), issues });
  const result = ValidateBlockout(doc);
  if (!result.ok) throw new Error(`生成的配置没过校验：\n  ${result.errors.join("\n  ")}`);
  const out = typeof options.out === "string" ? path.resolve(process.cwd(), options.out) : ConfigFile("FirstLevel0105");
  WriteGuarded(out, StringifyBlockout(doc), !!options.force);
  console.log(`写出 ${path.relative(process.cwd(), out)}：${doc.keyframes.length} 个关键帧，${doc.keyframes.reduce((s, k) => s + k.units.length, 0)} 个单位位次，警告 ${result.warnings.length}，摆位问题 ${issues.length}`);
  for (const w of result.warnings) console.log(`  警告 ${w}`);
  for (const line of issues) console.log(`  问题 ${line}`);
}

async function CmdScene0105(options) {
  const { BuildFirstLevel0105Scene } = await import("./Script_EditorBlockoutFirstLevel0105Scene.mjs");
  const notes = [];
  const scene = await BuildFirstLevel0105Scene({ ...SourceOptions(options), notes });
  const check = ValidateBlockoutScene(scene);
  if (!check.ok) throw new Error(`生成的场景没过校验：\n  ${check.errors.join("\n  ")}`);
  WriteGuarded(SceneFile("FirstLevel0105"), StringifyBlockout(scene), !!options.force);
  console.log(`写出 ${path.relative(process.cwd(), SceneFile("FirstLevel0105"))}：${scene.terrain.cols}×${scene.terrain.rows} 格高度（${scene.terrain.cellM} m）、${scene.blocks.length} 个体块、${(scene.gates || []).length} 个随信号体块`);
  for (const line of notes) console.log(`  ${line}`);
}

/** 06–10 新剧本白盒（FirstLevel0610）：与 0105 同一套做法，锚点 Data_EditorBlockoutFirstLevel0610Space。 */
async function CmdExport0610(options) {
  const { BuildFirstLevel0610Config } = await import("./Script_EditorBlockoutFirstLevel0610Keyframes.mjs");
  const issues = [];
  const doc = await BuildFirstLevel0610Config({ ...SourceOptions(options), issues });
  const result = ValidateBlockout(doc);
  if (!result.ok) throw new Error(`生成的配置没过校验：\n  ${result.errors.join("\n  ")}`);
  const out = typeof options.out === "string" ? path.resolve(process.cwd(), options.out) : ConfigFile("FirstLevel0610");
  WriteGuarded(out, StringifyBlockout(doc), !!options.force);
  console.log(`写出 ${path.relative(process.cwd(), out)}：${doc.keyframes.length} 个关键帧，${doc.keyframes.reduce((s, k) => s + k.units.length, 0)} 个单位位次，警告 ${result.warnings.length}，摆位问题 ${issues.length}`);
  for (const w of result.warnings) console.log(`  警告 ${w}`);
  for (const line of issues) console.log(`  问题 ${line}`);
}

async function CmdScene0610(options) {
  const { BuildFirstLevel0610Scene } = await import("./Script_EditorBlockoutFirstLevel0610Scene.mjs");
  const notes = [];
  const scene = await BuildFirstLevel0610Scene({ ...SourceOptions(options), notes });
  const check = ValidateBlockoutScene(scene);
  if (!check.ok) throw new Error(`生成的场景没过校验：\n  ${check.errors.join("\n  ")}`);
  WriteGuarded(SceneFile("FirstLevel0610"), StringifyBlockout(scene), !!options.force);
  console.log(`写出 ${path.relative(process.cwd(), SceneFile("FirstLevel0610"))}：${scene.terrain.cols}×${scene.terrain.rows} 格高度（${scene.terrain.cellM} m）、${scene.blocks.length} 个体块、${(scene.gates || []).length} 个随信号体块`);
  for (const line of notes) console.log(`  ${line}`);
}

/** 12–18 新剧本白盒（FirstLevel1218）：与 0105 / 0610 同一套做法，锚点 Data_EditorBlockoutFirstLevel1218Space。 */
async function CmdExport1218(options) {
  const { BuildFirstLevel1218Config } = await import("./Script_EditorBlockoutFirstLevel1218Keyframes.mjs");
  const issues = [];
  const doc = await BuildFirstLevel1218Config({ ...SourceOptions(options), issues });
  const result = ValidateBlockout(doc);
  if (!result.ok) throw new Error(`生成的配置没过校验：\n  ${result.errors.join("\n  ")}`);
  const out = typeof options.out === "string" ? path.resolve(process.cwd(), options.out) : ConfigFile("FirstLevel1218");
  WriteGuarded(out, StringifyBlockout(doc), !!options.force);
  console.log(`写出 ${path.relative(process.cwd(), out)}：${doc.keyframes.length} 个关键帧，${doc.keyframes.reduce((s, k) => s + k.units.length, 0)} 个单位位次，警告 ${result.warnings.length}，摆位问题 ${issues.length}`);
  for (const w of result.warnings) console.log(`  警告 ${w}`);
  for (const line of issues) console.log(`  问题 ${line}`);
}

async function CmdScene1218(options) {
  const { BuildFirstLevel1218Scene } = await import("./Script_EditorBlockoutFirstLevel1218Scene.mjs");
  const notes = [];
  const scene = await BuildFirstLevel1218Scene({ ...SourceOptions(options), notes });
  const check = ValidateBlockoutScene(scene);
  if (!check.ok) throw new Error(`生成的场景没过校验：\n  ${check.errors.join("\n  ")}`);
  WriteGuarded(SceneFile("FirstLevel1218"), StringifyBlockout(scene), !!options.force);
  console.log(`写出 ${path.relative(process.cwd(), SceneFile("FirstLevel1218"))}：${scene.terrain.cols}×${scene.terrain.rows} 格高度（${scene.terrain.cellM} m）、${scene.blocks.length} 个体块、${(scene.gates || []).length} 个随信号体块`);
  for (const line of notes) console.log(`  ${line}`);
}

async function CmdExport(level, options) {
  if (level === "FirstLevel0105") return CmdExport0105(options);
  if (level === "FirstLevel0610") return CmdExport0610(options);
  if (level === "FirstLevel1218") return CmdExport1218(options);
  if (level !== "FirstLevel") throw new Error("export 只支持 FirstLevel / FirstLevel0105 / FirstLevel0610 / FirstLevel1218（第二关的配置随 scene SecondLevel 一起写）");
  const { BuildFirstLevelBlockoutConfig } = await import("./Script_EditorBlockoutFirstLevel.mjs");
  const issues = [];
  const doc = BuildFirstLevelBlockoutConfig({ ...SourceOptions(options), issues });
  const result = ValidateBlockout(doc);
  if (!result.ok) throw new Error(`生成的配置没过校验：\n  ${result.errors.join("\n  ")}`);
  const out = typeof options.out === "string" ? path.resolve(process.cwd(), options.out) : ConfigFile(level);
  WriteGuarded(out, StringifyBlockout(doc), !!options.force);
  console.log(`写出 ${path.relative(process.cwd(), out)}：${doc.keyframes.length} 个关键帧，${doc.keyframes.reduce((s, k) => s + k.units.length, 0)} 个单位位次，警告 ${result.warnings.length}，摆位 / 走位问题 ${issues.length}`);
  for (const w of result.warnings) console.log(`  警告 ${w}`);
  for (const line of issues) console.log(`  问题 ${line}`);
}

/** 第一关的摆位与走位检查（玩家站位、间距、过渡穿墙；与 ConfigTest 判失败的口径相同），只报不改退出码。 */
async function PrintFirstLevelIssues(doc) {
  const { FirstLevelBlockoutIssues } = await import("./Script_EditorBlockoutFirstLevel.mjs");
  const issues = FirstLevelBlockoutIssues(doc);
  console.log(`FirstLevel 摆位 / 走位: ${issues.length ? `${issues.length} 处问题（测试会判失败）` : "没有问题"}`);
  for (const line of issues) console.log(`  问题 ${line}`);
}

async function CmdScene(level, options) {
  if (level === "FirstLevel0105") return CmdScene0105(options);
  if (level === "FirstLevel0610") return CmdScene0610(options);
  if (level === "FirstLevel1218") return CmdScene1218(options);
  if (level !== "SecondLevel") throw new Error("scene 只支持 SecondLevel / FirstLevel0105 / FirstLevel0610 / FirstLevel1218（第一关的场景就是游戏里的第一关）");
  const { BuildSecondLevelBlockout, SampleSecondLevelGroundChecks } = await import("./Script_EditorBlockoutSecondLevel.mjs");
  const { scene, config } = await BuildSecondLevelBlockout(SourceOptions(options));
  const sceneCheck = ValidateBlockoutScene(scene);
  if (!sceneCheck.ok) throw new Error(`生成的场景没过校验：\n  ${sceneCheck.errors.join("\n  ")}`);
  const configCheck = ValidateBlockout(config);
  if (!configCheck.ok) throw new Error(`生成的配置没过校验：\n  ${configCheck.errors.join("\n  ")}`);
  WriteGuarded(SceneFile(level), StringifyBlockout(scene), !!options.force);
  WriteGuarded(ConfigFile(level), StringifyBlockout(config), !!options.force);
  console.log(`写出 ${path.relative(process.cwd(), SceneFile(level))}：${scene.terrain.cols}×${scene.terrain.rows} 格高度、${scene.blocks.length} 个体块`);
  console.log(`写出 ${path.relative(process.cwd(), ConfigFile(level))}：${config.keyframes.length} 个关键帧`);
  for (const row of await SampleSecondLevelGroundChecks()) console.log(`  地面抽样 ${row}`);
}

async function CmdValidate(which) {
  const levels = !which || which === "all" ? BLOCKOUT_LEVEL_KEYS : [which];
  let bad = 0;
  for (const level of levels) {
    AssertLevel(level);
    const file = ConfigFile(level);
    if (!fs.existsSync(file)) { console.log(`${level}: 没有配置文件 ${path.relative(process.cwd(), file)}`); bad++; continue; }
    const doc = ReadJson(file);
    const result = ValidateBlockout(doc);
    console.log(`${level}: ${result.ok ? "通过" : "不通过"}（错误 ${result.errors.length}，警告 ${result.warnings.length}）`);
    for (const e of result.errors) console.log(`  错误 ${e}`);
    for (const w of result.warnings) console.log(`  警告 ${w}`);
    if (!result.ok) bad++;
    else if (level === "FirstLevel") await PrintFirstLevelIssues(doc);
    const sceneFile = SceneFile(level);
    if (fs.existsSync(sceneFile)) {
      const scene = ValidateBlockoutScene(ReadJson(sceneFile));
      console.log(`${level} 场景: ${scene.ok ? "通过" : "不通过"}（错误 ${scene.errors.length}）`);
      for (const e of scene.errors) console.log(`  错误 ${e}`);
      if (!scene.ok) bad++;
    }
  }
  if (bad) process.exitCode = 1;
}

/** 关键帧一行摘要（summary / kf 共用）。 */
export function KeyframeSummary(kf) {
  const sides = { ija: 0, nra: 0, civ: 0 };
  let down = 0, guesses = 0;
  for (const u of kf.units) { sides[u.side] = (sides[u.side] || 0) + 1; if (u.state === "down") down++; if (u.guess) guesses++; }
  const p = kf.player;
  return {
    id: kf.id, stage: kf.stage, name: kf.name,
    player: `(${p.x}, ${p.z}) 朝 ${F(p.yawDeg)}° 俯仰 ${F(p.pitchDeg ?? 0)}° ${p.stance || "stand"}`,
    ija: sides.ija, nra: sides.nra, civ: sides.civ, down, guesses, pois: kf.pois.length,
    next: kf.next ? `${kf.next.text}${Number.isFinite(kf.next.x) ? ` → (${kf.next.x}, ${kf.next.z})` : ""}` : "",
  };
}

function CmdSummary(level) {
  level = level || "FirstLevel";
  AssertLevel(level);
  const doc = ReadJson(ConfigFile(level));
  const result = ValidateBlockout(doc);
  const warningsById = new Map();
  for (const w of result.warnings) {
    const m = /^keyframes\[(\d+)\]/.exec(w);
    const id = m ? doc.keyframes[Number(m[1])]?.id : "*";
    if (!warningsById.has(id)) warningsById.set(id, []);
    warningsById.get(id).push(w);
  }
  console.log(`${doc.title || level}（${doc.keyframes.length} 个关键帧；源 ${doc.source?.gameVersion || "?"} @ ${(doc.source?.commit || "").slice(0, 10)}）`);
  console.log("id     阶段 敌  友  民  倒地 推测 POI  玩家                                   下一步");
  for (const kf of doc.keyframes) {
    const s = KeyframeSummary(kf);
    console.log(`${s.id.padEnd(6)} ${String(s.stage).padStart(2)}  ${String(s.ija).padStart(3)} ${String(s.nra).padStart(3)} ${String(s.civ).padStart(3)} ${String(s.down).padStart(4)} ${String(s.guesses).padStart(4)} ${String(s.pois).padStart(3)}  ${s.player.padEnd(38)} ${s.next}`);
    for (const w of warningsById.get(kf.id) || []) console.log(`       警告 ${w}`);
  }
  if (!result.ok) { console.log(`配置有 ${result.errors.length} 处错误：`); for (const e of result.errors) console.log(`  ${e}`); process.exitCode = 1; }
}

function CmdKeyframe(level, id) {
  AssertLevel(level);
  const doc = NormalizeBlockout(ReadJson(ConfigFile(level)));
  const index = KeyframeIndex(doc, id);
  if (index < 0) throw new Error(`${level} 里没有关键帧 ${id}`);
  const kf = doc.keyframes[index];
  const s = KeyframeSummary(kf);
  console.log(`${kf.id} · 阶段 ${kf.stage} ${kf.stageTitle} · ${kf.name}`);
  console.log(`玩家 ${s.player}`);
  console.log(`此时 ${kf.what}`);
  if (kf.next) console.log(`下一步 ${s.next}${kf.next.radiusM ? `（半径 ${kf.next.radiusM} m）` : ""}`);
  if (kf.how.length) console.log(`提示 ${kf.how.join(" / ")}`);
  if (kf.notes) console.log(`备注 ${kf.notes}`);
  if (kf.signals.length) console.log(`信号 ${kf.signals.join(" ")}`);
  console.log(`单位 ${kf.units.length}（敌 ${s.ija} / 友 ${s.nra} / 民 ${s.civ}；倒地 ${s.down}；推测 ${s.guesses}）`);
  for (const u of kf.units) {
    const extra = [u.kind !== "soldier" ? u.kind : "", u.stance !== "stand" ? u.stance : "", u.aim ? "举枪" : "", u.state === "down" ? "倒地" : "",
      u.guess ? "推测" : "", u.arc ? `射界 ±${u.arc.halfDeg}° ${u.arc.rangeM} m` : "", u.intent.length ? `去向 ${u.intent.length} 点` : "",
      u.path.length ? `来路 ${u.path.length} 点` : ""].filter(Boolean).join(" ");
    console.log(`  ${u.side.padEnd(3)} ${u.id.padEnd(30)} ${(u.name || "").padEnd(10)} (${u.x}, ${u.z}) 朝 ${F(u.yawDeg)}° ${extra}`);
  }
  for (const p of kf.pois) console.log(`  POI ${p.kind.padEnd(9)} ${p.id.padEnd(20)} ${p.name} (${p.x}, ${p.z}) r ${p.radiusM}`);
}

export async function Main(argv = process.argv.slice(2)) {
  const { positional, options } = ParseArgs(argv);
  const [command, a, b] = positional;
  switch (command) {
    case "export": await CmdExport(a || "FirstLevel", options); break;
    case "scene": await CmdScene(a || "SecondLevel", options); break;
    case "validate": await CmdValidate(a); break;
    case "summary": CmdSummary(a); break;
    case "kf": if (!a || !b) throw new Error("用法：kf <Level> <keyframeId>"); CmdKeyframe(a, b); break;
    default:
      console.log([
        "白盒关卡编辑器配置命令行",
        "  export FirstLevel [--out=<path>] [--force]   从游戏数据生成第一关配置（默认写 Taierzhuang1938/Blockout/FirstLevel.json）",
        "  scene SecondLevel [--force]                  生成第二关草稿场景与占位配置",
        "  scene FirstLevel0105 [--force]               生成 01–05 新剧本白盒的场景文件（地形 + 体块 + 塌洞等随信号体块）",
        "  export FirstLevel0105 [--force]              生成 01–05 新剧本白盒的关键帧配置（会覆盖手改）",
        "  scene FirstLevel0610 [--force]               生成 06–10 新剧本白盒（耿家庄）的场景文件",
        "  export FirstLevel0610 [--force]              生成 06–10 新剧本白盒的关键帧配置（会覆盖手改）",
        "  scene FirstLevel1218 [--force]               生成 12–18 新剧本白盒（北沙河）的场景文件",
        "  export FirstLevel1218 [--force]              生成 12–18 新剧本白盒的关键帧配置（会覆盖手改）",
        "  validate [FirstLevel|SecondLevel|all]        校验配置（与场景文件）；第一关另列摆位 / 走位问题",
        "  summary [Level]                              每个关键帧一行：玩家机位、各阵营人数、推测、POI、警告",
        "  kf <Level> <id>                              看一个关键帧的全部单位与 POI",
        "  选项 --commit=<sha> --generated-at=<ISO>      写进 source（缺省 git HEAD / 现在）",
      ].join("\n"));
      if (command) process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  Main().catch((error) => { console.error(error.message || error); process.exitCode = 1; });
}
