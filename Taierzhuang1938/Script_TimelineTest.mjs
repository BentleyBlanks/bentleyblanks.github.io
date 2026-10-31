// Script_TimelineTest.mjs —— Timeline 数据规则与登记表的纯 Node 闸门（毫秒级）。
//
// 跑法：node Taierzhuang1938/Script_TimelineTest.mjs
//   1. 登记表里每一份 Timeline 文件都在、核对无错（关键帧、单位、台词 id 对着关卡配置与台词清单查）；
//   2. 主时间轴：段首尾相接、LocateTime 落段正确、两头夹住；镜头轨每段从 0 起、不越界；
//   3. 拷贝口径：copiedFrom 指的预演文件与关键帧都在；
//   4. 时码与轨道小函数。

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TIMELINES, TIMELINE_SCHEMA, ValidateTimeline, VoiceLineTable, TimelineLayout, TimelineTracks, TracksAt,
  LocateTime, FormatTimecode, TimelineAsPreviz, TIMELINE_LINE_FALLBACK_S,
} from "./Script_TimelinePlan.mjs";
import { NormalizeBlockout } from "./Script_EditorBlockoutConfig.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const Read = (rel) => JSON.parse(fs.readFileSync(path.join(HERE, rel.replace(/^\.\//, "")), "utf8"));
let checks = 0;
const Check = (ok, message) => { checks += 1; assert.ok(ok, message); };

Check(TIMELINES.length >= 1 && new Set(TIMELINES.map((t) => t.id)).size === TIMELINES.length, "登记表非空、id 不重复");
for (const entry of TIMELINES) {
  Check(fs.existsSync(path.join(HERE, entry.file)), `${entry.id}：文件 ${entry.file} 要在`);
  const doc = Read(entry.file);
  Check(doc.schema === TIMELINE_SCHEMA && doc.id === entry.id && doc.level === entry.level, `${entry.id}：schema / id / level 与登记表一致`);
  const config = NormalizeBlockout(Read(`Blockout/${doc.level}.json`));
  const voice = Read(doc.voice);
  const result = ValidateTimeline(doc, { config, voice });
  Check(result.ok, `${entry.id} 核对：${result.errors.slice(0, 5).join(" / ")}`);
  if (doc.copiedFrom) {
    Check(fs.existsSync(path.join(HERE, doc.copiedFrom.file)), `${entry.id}：copiedFrom.file 要在`);
    const source = Read(doc.copiedFrom.file);
    for (const kf of doc.copiedFrom.keyframes) Check(source.sequences.some((s) => s.keyframe === kf), `${entry.id}：源预演里要有 ${kf}`);
    Check(doc.sequences.map((s) => s.keyframe).join() === doc.copiedFrom.keyframes.join(), `${entry.id}：子序列与 copiedFrom.keyframes 同序`);
  }
  const table = VoiceLineTable(voice);
  const layout = TimelineLayout(doc, { lineDuration: (id) => table.get(id)?.durationS ?? TIMELINE_LINE_FALLBACK_S });
  const tracks = TimelineTracks(doc, layout, { lineInfo: (id) => table.get(id) || null });
  layout.segments.forEach((seg, i) => {
    Check(seg.durationS > 0, `${entry.id}：第 ${i} 段时长为正`);
    if (i > 0) Check(Math.abs(seg.start - layout.segments[i - 1].end) < 1e-9, `${entry.id}：第 ${i} 段接在上一段末尾`);
    const mid = LocateTime(layout, seg.start + seg.durationS / 2);
    Check(mid.index === i && Math.abs(mid.local - seg.durationS / 2) < 1e-9, `${entry.id}：段中点落回第 ${i} 段`);
  });
  Check(LocateTime(layout, -5).index === 0 && LocateTime(layout, 1e9).index === layout.segments.length - 1, `${entry.id}：两头夹住`);
  for (const shot of tracks.shots) Check(shot.t1 >= shot.t0 && shot.t1 <= layout.durationS + 1e-6, `${entry.id}：镜头 ${shot.label} 不越界`);
  for (const seg of layout.segments) {
    const first = tracks.shots.find((s) => s.src.startsWith(`sequences[${seg.index}].`));
    Check(first && Math.abs(first.t0 - seg.start) < 0.01, `${entry.id}：${seg.keyframe} 第一镜从段首起`);
  }
  Check(tracks.lines.every((l) => !l.missing), `${entry.id}：每句台词都在清单里`);
  Check(TracksAt(tracks, layout.segments[0].start + 0.01).shotIndex === 0, `${entry.id}：开头在第一镜`);
  Check(TimelineAsPreviz(doc).sequences === doc.sequences, `${entry.id}：换成预演文档时子序列原样带过去`);
}
Check(FormatTimecode(0) === "00:00:00" && FormatTimecode(61.5) === "01:01:15" && FormatTimecode(170.25) === "02:50:08", "时码 mm:ss:ff");
Check(!ValidateTimeline({ schema: TIMELINE_SCHEMA, id: "X", level: "L", sequences: [] }).ok, "空 Timeline 不过核对");

console.log(`TimelineTest: ${checks} 条全过（${TIMELINES.length} 份 Timeline）`);
