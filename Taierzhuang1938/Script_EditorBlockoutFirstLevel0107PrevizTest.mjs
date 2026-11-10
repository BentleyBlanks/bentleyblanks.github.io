// ===========================================================================
// Script_EditorBlockoutFirstLevel0107PrevizTest.mjs —— FirstLevel0107 占位配音与最简预演的纯 node 自检（2026-11-09）
//
//   node Taierzhuang1938/Script_EditorBlockoutFirstLevel0107PrevizTest.mjs           → 查 Blockout/FirstLevel0107.previz.json
//   node Taierzhuang1938/Script_EditorBlockoutFirstLevel0107PrevizTest.mjs --fresh   → 查生成器当场生成的那份（并核对与盘上逐字相同）
//
// 查（照 0105 PrevizTest 的写法，只查这份最简预演用得到的）：
//   台词表 Data_EditorBlockoutFirstLevel0107Lines：只用任务书原句（句数、关键帧覆盖 01-1…07-2 每帧至少一句）、每场 ≤ 3 个参考嗓子之外的
//     说话人写了 refs、日语行 text 是纯假名且带 kanji / 中文字幕、只导出 JSON 能写的值；
//   配音清单 Blockout/FirstLevel0107.voice.json：每句都在、字 / 字幕 / 说话人 / 关键帧与台词表一致、mp3 在盘上且 sha256 对得上、时长为正；
//   预演：运行时包的 ValidateBlockoutPreviz（关键帧 / 单位 / 台词 id）零错误零警告；28 帧每帧一段、按关键帧顺序；
//     每句台词恰好出现一次、在自己的关键帧那段里、按台词表顺序；同一段里句与句不互压，同一场相邻两句的间隔不短于录音间隔；
//     镜头是一条整段不动的顺子眼睛，位置 / 姿态 / 朝向 = 关键帧玩家站位；说话人在那一帧里（或本段 spawn 的）；then 链对。
// ===========================================================================

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { L0107_VOICE_SCENES, L0107_VOICE_LINES } from "./Data_EditorBlockoutFirstLevel0107Lines.mjs";
import { ValidateBlockoutPreviz } from "./Script_EditorBlockoutPrevizPlan.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const Load = (f) => JSON.parse(readFileSync(join(HERE, f), "utf8"));
const R = (v) => Math.round(v * 1000) / 1000;
const EPS = 0.011;

/** 任务书（2026-11-09）里的句数：每个关键帧几句。 */
const EXPECTED_PER_KEYFRAME = Object.freeze({
  "01-1": 5, "01-2": 3, "01-3": 1, "02-1": 1, "02-2": 6, "02-3": 1, "02-4": 2, "02-5": 5,
  "03-1": 2, "03-2": 1, "03-3": 1, "03-4": 3, "03-5": 1, "04-1": 1, "04-2": 4, "04-3": 2,
  "05-1": 2, "05-2": 4, "06-1": 1, "06-2": 1, "06-3": 1, "06-4": 5, "06-5": 1, "06-6": 1,
  "06-7": 3, "06-8": 2, "07-1": 5, "07-2": 5,
});

function CheckLines(errors) {
  const per = {};
  for (const l of L0107_VOICE_LINES) per[l.keyframe] = (per[l.keyframe] || 0) + 1;
  for (const [kf, n] of Object.entries(EXPECTED_PER_KEYFRAME)) if (per[kf] !== n) errors.push(`台词表 ${kf} 有 ${per[kf] || 0} 句，任务书是 ${n} 句`);
  for (const kf of Object.keys(per)) if (!(kf in EXPECTED_PER_KEYFRAME)) errors.push(`台词表有任务书以外的关键帧 ${kf}`);
  const ids = new Set();
  for (const l of L0107_VOICE_LINES) {
    if (ids.has(l.id)) errors.push(`台词 id 重复：${l.id}`);
    ids.add(l.id);
    if (!l.text || !l.subtitle || !l.speaker || !l.who) errors.push(`${l.id} 缺 text / subtitle / speaker / who`);
    if (l.lang === "ja") {
      if (/[\u4e00-\u9fff]/.test(l.text)) errors.push(`${l.id} 日语送 TTS 的 text 要是纯假名：${l.text}`);
      if (!l.kanji) errors.push(`${l.id} 日语行要带 kanji（稿面）`);
      if (!/[\u4e00-\u9fff]/.test(l.subtitle)) errors.push(`${l.id} 日语行字幕要是中文：${l.subtitle}`);
    } else if (l.subtitle !== l.text) errors.push(`${l.id} 中文行字幕要与念的字一样`);
    if (!["shout", "normal", "low", "breath"].includes(l.projection)) errors.push(`${l.id} projection 不对：${l.projection}`);
  }
  for (const scene of L0107_VOICE_SCENES) {
    const voices = new Set(scene.lines.map((l) => l.who));
    if (voices.size > 3 && !(Array.isArray(scene.refs) && scene.refs.length === 3)) errors.push(`${scene.id} 有 ${voices.size} 个说话人，要写 refs 挑 3 个挂参考音`);
    for (const w of scene.refs || []) if (!voices.has(w)) errors.push(`${scene.id}.refs 里的 ${w} 不在这一场开口`);
  }
  try { JSON.stringify(L0107_VOICE_SCENES); } catch (e) { errors.push(`台词表不能写成 JSON：${e.message}`); }
}

function CheckVoice(voice, errors, warnings) {
  const byId = new Map();
  for (const s of voice.scenes || []) for (const l of s.lines || []) byId.set(l.id, { ...l, sceneEntry: s });
  if (voice.level !== "FirstLevel0107") errors.push(`voice.json level 是 ${voice.level}`);
  for (const l of L0107_VOICE_LINES) {
    const v = byId.get(l.id);
    if (!v) { errors.push(`voice.json 缺 ${l.id}`); continue; }
    for (const k of ["text", "subtitle", "speaker", "who", "keyframe", "lang"]) if (v[k] !== l[k]) errors.push(`${l.id}.${k} 清单是「${v[k]}」，台词表是「${l[k]}」（台词改了要重配）`);
    if (!(v.durationS > 0)) errors.push(`${l.id} durationS 不是正数`);
    const file = join(HERE, String(v.file || "").replace(/^\.\//, ""));
    if (!existsSync(file)) { errors.push(`${l.id} 的 mp3 不在盘上：${v.file}`); continue; }
    const sha = crypto.createHash("sha256").update(readFileSync(file)).digest("hex");
    if (sha !== v.sha256) errors.push(`${l.id} 的 mp3 sha256 对不上清单`);
    if (v.issues?.length) warnings.push(`${l.id}（${l.speaker}）核对：${v.issues.join("；")}`);
  }
  for (const id of byId.keys()) if (!L0107_VOICE_LINES.some((l) => l.id === id)) errors.push(`voice.json 里有台词表以外的句子 ${id}`);
  for (const s of voice.scenes || []) {
    if (s.hard?.length) warnings.push(`${s.id}#${s.attempt}（共 ${s.attempts} 次）硬错误：${s.hard.join("；")}`);
    if (s.attempts > 3) errors.push(`${s.id} 生成了 ${s.attempts} 次，超过 3 次上限`);
  }
}

/** 主检查：→ { errors, warnings, rows }。 */
export async function CheckPreviz(doc, { config, voice }) {
  const errors = [], warnings = [], rows = [];
  CheckLines(errors);
  CheckVoice(voice, errors, warnings);
  const v = ValidateBlockoutPreviz(doc, { config, voice });
  errors.push(...v.errors.map((e) => `[校验器] ${e}`));
  errors.push(...v.warnings.map((w) => `[校验器警告] ${w}`));
  const recorded = new Map();
  for (const s of voice.scenes || []) for (const l of s.lines || []) recorded.set(l.id, l);
  const kfIds = config.keyframes.map((k) => k.id);
  const seqIds = doc.sequences.map((s) => s.keyframe);
  if (JSON.stringify(seqIds) !== JSON.stringify(kfIds)) errors.push(`预演段要和关键帧一一对应、同顺序：${seqIds.join(",")}`);
  const used = new Map();
  doc.sequences.forEach((seq, si) => {
    const kf = config.keyframes.find((k) => k.id === seq.keyframe);
    if (!kf) return;
    const want = L0107_VOICE_LINES.filter((l) => l.keyframe === kf.id).map((l) => l.id);
    const got = seq.lines.map((l) => l.line);
    if (JSON.stringify(want) !== JSON.stringify(got)) errors.push(`${kf.id} 的台词应为 ${want.join(",")}，预演里是 ${got.join(",")}`);
    for (const id of got) used.set(id, (used.get(id) || 0) + 1);
    // 不互压 + 录音间隔
    let end = 0, prevId = null;
    for (const entry of seq.lines) {
      const rec = recorded.get(entry.line);
      if (!rec) continue;
      if (prevId && entry.t < end - 1e-6) errors.push(`${kf.id}：${entry.line} @${entry.t} 压住上一句 ${prevId}（到 ${R(end)}）`);
      const [ps, pn] = (prevId || "").split("."), [cs, cn] = entry.line.split(".");
      if (prevId && ps === cs && Number(cn) === Number(pn) + 1 && entry.t - end < Math.max(rec.gapBeforeS ?? 0, 0.12) - EPS)
        errors.push(`${kf.id}：${entry.line} 与上一句的间隔 ${R(entry.t - end)} s 比录音里的 ${rec.gapBeforeS} s 短`);
      const actor = entry.actor;
      const spawned = new Set((seq.actors || []).filter((a) => a.spawn).map((a) => a.id));
      if (actor && actor !== "player" && !kf.units.some((u) => u.id === actor) && !spawned.has(actor)) errors.push(`${kf.id}：${entry.line} 的说话人 ${actor} 不在这一帧`);
      const scripted = L0107_VOICE_LINES.find((l) => l.id === entry.line)?.actor;
      if (scripted && actor !== scripted) errors.push(`${kf.id}：${entry.line} 的说话人应为 ${scripted}，预演里是 ${actor ?? "（空）"}`);
      end = entry.t + rec.durationS;
      prevId = entry.line;
    }
    if (seq.durationS < end - 1e-6) errors.push(`${kf.id} durationS ${seq.durationS} 比最后一句结束 ${R(end)} 早`);
    // 镜头
    const p = kf.player;
    if (seq.camera.length !== 1) errors.push(`${kf.id} 镜头要只有一条（顺子的眼睛）`);
    const c = seq.camera[0], e = c?.eye;
    if (!e || c.t !== 0 || Math.abs(c.dur - seq.durationS) > 1e-6) errors.push(`${kf.id} 镜头要从 0 管到整段结束`);
    else {
      for (const k of ["x", "z", "yawDeg", "pitchDeg"]) if (Math.abs((e[k] ?? 0) - (p[k] ?? 0)) > 1e-6) errors.push(`${kf.id} 镜头 ${k} ${e[k]} ≠ 玩家站位 ${p[k]}`);
      if ((e.stance || "stand") !== (p.stance || "stand")) errors.push(`${kf.id} 镜头姿态 ${e.stance} ≠ 玩家 ${p.stance}`);
      if (e.toYawDeg !== undefined || e.toPitchDeg !== undefined || e.look || e.toLook) errors.push(`${kf.id} 镜头要整段不动`);
    }
    const thenWant = si === doc.sequences.length - 1 ? "stay" : "next";
    if (seq.then !== thenWant) errors.push(`${kf.id} then 是 ${seq.then}，应为 ${thenWant}`);
    rows.push(`${kf.id.padEnd(5)} ${String(seq.durationS).padStart(6)} s  ${seq.lines.length} 句  ${seq.lines.map((l) => `${l.line}@${l.t}`).join(" ")}`);
  });
  for (const l of L0107_VOICE_LINES) if ((used.get(l.id) || 0) !== 1) errors.push(`${l.id} 在预演里出现 ${used.get(l.id) || 0} 次（要恰好 1 次）`);
  return { errors, warnings, rows };
}

async function Main(argv) {
  const config = Load("Blockout/FirstLevel0107.json");
  const voiceFile = join(HERE, "Blockout/FirstLevel0107.voice.json");
  if (!existsSync(voiceFile)) { console.log("还没有 Blockout/FirstLevel0107.voice.json（先跑 Script_EditorBlockoutFirstLevel0107Voice.mjs）"); process.exitCode = 1; return; }
  const voice = Load("Blockout/FirstLevel0107.voice.json");
  const file = join(HERE, "Blockout/FirstLevel0107.previz.json");
  let doc;
  if (argv.includes("--fresh")) {
    const { BuildPreviz } = await import("./Script_EditorBlockoutFirstLevel0107Previz.mjs");
    doc = BuildPreviz({ config, voice });
    if (JSON.stringify(BuildPreviz({ config, voice })) !== JSON.stringify(doc)) { console.log("错误：两次生成不一样"); process.exitCode = 1; }
    if (existsSync(file) && JSON.stringify(Load("Blockout/FirstLevel0107.previz.json")) !== JSON.stringify(doc)) {
      console.log("错误：盘上的 previz.json 与生成器当场生成的不一样（重跑 Script_EditorBlockoutFirstLevel0107Previz.mjs --force）");
      process.exitCode = 1;
    }
  } else {
    if (!existsSync(file)) { console.log("还没有 Blockout/FirstLevel0107.previz.json（先跑生成器 --force）"); process.exitCode = 1; return; }
    doc = Load("Blockout/FirstLevel0107.previz.json");
  }
  const r = await CheckPreviz(doc, { config, voice });
  for (const row of r.rows) console.log(row);
  for (const w of r.warnings) console.log("警告：" + w);
  for (const e of r.errors) console.log("错误：" + e);
  console.log(r.errors.length ? `不通过：${r.errors.length} 个错误` : `通过（警告 ${r.warnings.length}）`);
  if (r.errors.length) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) Main(process.argv.slice(2));
