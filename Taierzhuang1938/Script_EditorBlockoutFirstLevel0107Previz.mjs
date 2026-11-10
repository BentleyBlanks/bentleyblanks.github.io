// ===========================================================================
// Script_EditorBlockoutFirstLevel0107Previz.mjs —— FirstLevel0107（第一关新剧本 01–07）的最简预演生成器（纯 node）
//
//   node Taierzhuang1938/Script_EditorBlockoutFirstLevel0107Previz.mjs           → 生成并自检，不写盘
//   node Taierzhuang1938/Script_EditorBlockoutFirstLevel0107Previz.mjs --force   → 自检通过后写 Blockout/FirstLevel0107.previz.json
//
// 为什么有它：白盒编辑器只在预演里播配音（Script_EditorBlockoutPreviz 读 previz.json 的 voice 清单，docs/Data_EditorBlockout.md §14），
// 0107 还没有排过预演，所以先出一份「只为听台词」的最简版（2026-11-09）：
//   · 每个关键帧一段（28 段），镜头只有一条：顺子的眼睛，位置 / 姿态 / 朝向 = 这一帧关键帧里玩家的站位，整段不动；
//   · 演员不排走位、不播片段（站在关键帧布设里），只有台词：这一帧的句子按台词表的顺序一句接一句，句间沿用
//     voice.json 里录音的原始间隔 gapBeforeS（同一场里相邻的两句），跨场或这一帧的第一句用固定间隔，句与句不互压；
//   · 说话人 = 台词表 Data_EditorBlockoutFirstLevel0107Lines 里写的 actor（"player" = 顺子）；那一帧里没有这个人
//     （04-1 的连长）就从后面最近一个有他的关键帧把他按原样 spawn 进这一段；
//   · 播完 then: "next"（最后一帧 07-2 是 "stay"），没有事件 / 信号 / 音效（场景信号照关键帧的 signals）；
//   · 嘴：口型轨 Audio/Blockout0107/Data_Blockout0107FaceTracks.json（配音脚本 --face 烘的，按 mp3 sha256 认）。
// 真排预演（走位、动作、镜头、爆炸）以后另写；这份重跑会被覆盖。
// 自检：Script_EditorBlockoutFirstLevel0107PrevizTest.mjs 的 CheckPreviz（生成时也跑一遍，有错不写）。
// ===========================================================================

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { L0107_VOICE_SCENES } from "./Data_EditorBlockoutFirstLevel0107Lines.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = join(HERE, "Blockout", "FirstLevel0107.json");
const VOICE_FILE = join(HERE, "Blockout", "FirstLevel0107.voice.json");
const PREVIZ_FILE = join(HERE, "Blockout", "FirstLevel0107.previz.json");
const LoadJson = (file) => JSON.parse(readFileSync(file, "utf8"));

/** 排台词的几个数（秒）：第一句前的空、跨场两句之间、录音间隔的下限（不互压）、最后一句后的余量。 */
export const PREVIZ_0107_TIMING = Object.freeze({ leadS: 0.8, crossSceneGapS: 0.6, minGapS: 0.12, tailS: 1.5 });

const Up = (v) => Math.ceil(v * 100 - 1e-6) / 100;
const R = (v) => Math.round(v * 100) / 100;

/** 台词表里的全部句子，按场、按句序，带场 id 与场内序号。 */
function ScriptLines() {
  return L0107_VOICE_SCENES.flatMap((scene) => scene.lines.map((line, index) => ({ ...line, scene: scene.id, index })));
}

/** 这个人在 index 之后最近一个关键帧里的布设（spawn 用）；找不到返回 null。 */
function LaterUnit(config, index, id) {
  for (let i = index + 1; i < config.keyframes.length; i++) {
    const unit = config.keyframes[i].units.find((u) => u.id === id);
    if (unit) return unit;
  }
  return null;
}

function SpawnOf(unit) {
  const spawn = { side: unit.side === "civ" || unit.side === "civilian" ? "civ" : unit.side, x: unit.x, z: unit.z };
  for (const key of ["kind", "name", "castId", "role", "yawDeg", "stance", "weapon"]) if (unit[key] !== undefined) spawn[key] = unit[key];
  return spawn;
}

/** 生成整份预演文档（纯函数：只依赖传入的配置与台词清单）。 */
export function BuildPreviz({ config, voice }) {
  const T = PREVIZ_0107_TIMING;
  const recorded = new Map();
  for (const scene of voice.scenes || []) for (const line of scene.lines || []) recorded.set(line.id, line);
  const lines = ScriptLines();
  const sequences = config.keyframes.map((kf, kfIndex) => {
    const mine = lines.filter((l) => l.keyframe === kf.id);
    const units = new Set(kf.units.map((u) => u.id));
    const actors = [], spawned = new Set();
    const out = [];
    let end = 0, prev = null;
    for (const line of mine) {
      const rec = recorded.get(line.id);
      if (!rec) continue;
      const sameScene = prev && prev.scene === line.scene && prev.index === line.index - 1;
      const gap = !prev ? T.leadS : sameScene ? Math.max(T.minGapS, rec.gapBeforeS ?? 0) : T.crossSceneGapS;
      const t = Up((prev ? end : 0) + gap);
      const entry = { t, line: line.id };
      const actor = line.actor;
      if (actor === "player" || units.has(actor)) entry.actor = actor;
      else if (actor) {
        const later = LaterUnit(config, kfIndex, actor);
        if (later) {
          if (!spawned.has(actor)) { actors.push({ id: actor, spawn: SpawnOf(later), keys: [] }); spawned.add(actor); }
          entry.actor = actor;
        }
      }
      out.push(entry);
      end = t + rec.durationS;
      prev = line;
    }
    const durationS = Up(Math.max(end, T.leadS) + T.tailS);
    const p = kf.player;
    const eye = { x: p.x, z: p.z, stance: p.stance || "stand", yawDeg: p.yawDeg ?? 0, pitchDeg: p.pitchDeg ?? 0 };
    return {
      keyframe: kf.id,
      title: kf.name,
      durationS,
      then: kfIndex === config.keyframes.length - 1 ? "stay" : "next",
      camera: [{ t: 0, dur: durationS, eye }],
      actors,
      lines: out,
      events: [],
    };
  });
  return {
    schema: "tengxian-blockout-previz/1",
    level: "FirstLevel0107",
    title: "第一关 01–07 预演（最简：顺子眼睛定镜 + 占位配音）",
    source: {
      generator: "node Taierzhuang1938/Script_EditorBlockoutFirstLevel0107Previz.mjs --force",
      note: "2026-11-09 最简预演：只为在白盒编辑器里按帧听台词（镜头 = 关键帧里玩家的站位 / 朝向，台词按录音间隔排，播完 then:next）；"
        + "没有走位、动作、事件。手改前先想好：重跑生成器会覆盖",
    },
    voice: "./Blockout/FirstLevel0107.voice.json",
    faceTracks: "./Audio/Blockout0107/Data_Blockout0107FaceTracks.json",
    sequences,
  };
}

async function Main(argv) {
  const config = LoadJson(CONFIG_FILE), voice = LoadJson(VOICE_FILE);
  const doc = BuildPreviz({ config, voice });
  const { CheckPreviz } = await import("./Script_EditorBlockoutFirstLevel0107PrevizTest.mjs");
  const report = await CheckPreviz(doc, { config, voice });
  for (const w of report.warnings) console.log("警告：" + w);
  for (const e of report.errors) console.log("错误：" + e);
  if (argv.includes("--report")) for (const row of report.rows) console.log(row);
  console.log(`预演 ${doc.sequences.length} 段，总长 ${R(doc.sequences.reduce((a, s) => a + s.durationS, 0))} s；错误 ${report.errors.length}，警告 ${report.warnings.length}`);
  if (report.errors.length) { process.exitCode = 1; return; }
  if (argv.includes("--force")) {
    const text = JSON.stringify(doc, null, 1) + "\n";
    writeFileSync(PREVIZ_FILE, text);
    console.log(`已写 ${PREVIZ_FILE}（${text.length} 字节）`);
  } else console.log("（没写盘；加 --force 写 Blockout/FirstLevel0107.previz.json）");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) Main(process.argv.slice(2));
