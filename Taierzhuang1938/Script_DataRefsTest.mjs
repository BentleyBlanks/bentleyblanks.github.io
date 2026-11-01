// 数据之间的引用检查（docs/Data_DataSources.md「引用检查」，纯 Node，秒级）。
//
// 数据之间互相引用一律写编号；这里逐类核对「写的编号真的有」，按编号对不上就红：
//   1. 说话手势（Data_FirstLevelSpeakerGestures）按台词编号挂：编号要有，而且说话人要对得上 ——
//      台词编号是「<场>.<第几句>」，中间插一句后面的编号就挪位，挪位几乎总会换说话人，这一条就是拦它的。
//   2. 台词时间轴（Audio/FirstLevel/Data_FirstLevelLineTimings.json）：编号要有，说话人要对得上。
//   3. 口型（Audio/FirstLevel/Data_FirstLevelFaceTracks.json）：逐句的挂台词编号、整场的挂场编号，都要有。
//   4. 每句台词的说话人都在配音选角表（MISSION_VOICE_CAST）里。
//   5. 数据模块里写的文本键（textKey / labelKey / titleKey / hintKey / bootLabel）都在文本表里。
// 场景文件里的资产编号由 Script_SceneDoc.ValidateScene 核对（场景编辑器存盘与 SceneTest），这里不重复。

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MISSION_DIALOGUE, MISSION_VOICE_CAST } from "./Data_FirstLevelMissionDialogue.mjs";
import { FIRST_LEVEL_SPEAKER_GESTURES } from "./Data_FirstLevelSpeakerGestures.mjs";
import { HasText } from "./Script_Text.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
let checks = 0;
const failures = [];
const Check = (ok, message) => { checks += 1; if (!ok) failures.push(message); };
const ReadJson = (file) => JSON.parse(fs.readFileSync(path.join(here, file), "utf8"));

// --- 台词编号 ----------------------------------------------------------------------------------------------
const lines = new Map();
const cues = new Set();
for (const cue of MISSION_DIALOGUE) {
  cues.add(cue.id);
  for (const line of cue.lines || []) if (line.id) lines.set(line.id, line);
}
Check(lines.size > 0, "第一关台词表里有逐句编号");

// 1. 说话手势
for (const [lineId, row] of Object.entries(FIRST_LEVEL_SPEAKER_GESTURES)) {
  const line = lines.get(lineId);
  Check(!!line, `说话手势挂在 ${lineId}，台词表里没有这一句`);
  if (line) Check(line.who === row.who, `说话手势 ${lineId} 写的是 ${row.who}，这一句实际是 ${line.who} 说的（插句 / 删句后编号挪位了？）`);
}

// 2. 台词时间轴
const timings = Object.values(ReadJson("Audio/FirstLevel/Data_FirstLevelLineTimings.json"));
for (const t of timings) {
  const line = lines.get(t.lineId);
  Check(!!line, `台词时间轴有 ${t.lineId}，台词表里没有这一句`);
  if (line) Check(line.who === t.who, `台词时间轴 ${t.lineId} 写的是 ${t.who}，这一句实际是 ${line.who} 说的`);
}

// 3. 口型
const faceTracks = ReadJson("Audio/FirstLevel/Data_FirstLevelFaceTracks.json").tracks;
for (const [key, track] of Object.entries(faceTracks)) {
  const id = track.id ?? key;
  if (track.kind === "line") Check(lines.has(id), `口型 ${id} 挂在逐句台词上，台词表里没有这一句`);
  else Check(cues.has(id) || lines.has(id), `口型 ${id} 挂的场 / 句在台词表里没有`);
}

// 4. 说话人都在选角表里
const cast = new Set(Object.keys(MISSION_VOICE_CAST));
for (const [id, line] of lines) Check(cast.has(line.who), `台词 ${id} 的说话人 ${line.who} 不在配音选角表 MISSION_VOICE_CAST 里`);

// 5. 数据模块里的文本键
const TEXT_KEY = /^(textKey|labelKey|titleKey|hintKey|bootLabel)$/;
let textRefs = 0;
function WalkText(value, where, seen) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  for (const [k, v] of Object.entries(value)) {
    if (TEXT_KEY.test(k) && typeof v === "string") { textRefs += 1; Check(HasText(v), `${where} 写的文本键 ${v} 不在文本表里`); }
    else if (v && typeof v === "object") WalkText(v, where, seen);
  }
}
for (const file of fs.readdirSync(here).filter((f) => /^Data_.*\.mjs$/.test(f) && !/^Data_Text_/.test(f)).sort()) {
  const mod = await import(pathToFileURL(path.join(here, file)).href);
  const seen = new Set();
  for (const [name, value] of Object.entries(mod)) WalkText(value, `${file} ${name}`, seen);
}

assert.ok(failures.length === 0, `数据引用：${failures.length} 条对不上\n  ${failures.slice(0, 40).join("\n  ")}${failures.length > 40 ? `\n  ……还有 ${failures.length - 40} 条` : ""}`);
console.log(`[dataRefs] 数据引用：${checks} 条全过（台词 ${lines.size} 句、手势 ${Object.keys(FIRST_LEVEL_SPEAKER_GESTURES).length}、时间轴 ${timings.length}、口型 ${Object.keys(faceTracks).length}、文本键 ${textRefs}）`);
