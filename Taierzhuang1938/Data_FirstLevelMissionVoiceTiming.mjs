import { MISSION_VOICE_ALIGNMENT } from "./Data_FirstLevelMissionVoiceAlignment.mjs";
// 一段连续对白只有一条录音、一个区间；动作打断处不拆音频，只在录音里留空当并打事件。
// 2026-09-19 重构：军列相关的 gate / parallel / 事件全部下线。
export const MISSION_VOICE_TIMING = Object.freeze({});
// 具名事件（玩法包按这些名字接动作；每句开始另有通用的 "Line" 事件）：
//   BunkerBlast                01 BunkerBanter 末句被近爆打断的那一刻（录音在此戛然而止）
//   RescueHeave                02 RescueLift「一、二——起！」的「起」
//   BorrowLightMatchesPocketed 06 BorrowLight 第一处动作空当：顺子把火柴往兜里一收
//   BorrowLightCigaretteOffered06 BorrowLight 第二处动作空当：老周摸出烟包递一根过去
//   AircraftDiveOrder          14 AircraftReturn「先下沟！莫停车边！」句首（沿用旧 id）
//   ZhouNoAnswer               17 ZhouDeath 第一句之后那段「……」，没人应声
export function MissionVoiceTimeline(cue, total) {
  const aligned = MISSION_VOICE_ALIGNMENT[cue.id];
  const weights = cue.lines.map((line) => Math.max(4, line.text.length));
  const sum = weights.reduce((a, b) => a + b, 0);
  let cursor = 0;
  // 对齐区间只在确实装得进这条时长时才用：缺录音时 total 是按字数估的，
  // 硬套录音的区间会让后几句落在区间外，字幕和 Line 事件直接被跳过。
  const fits = aligned?.lines.length === cue.lines.length && aligned.lines.at(-1)[1] <= total + 0.05;
  const lines = fits ? aligned.lines : weights.map((weight) => {
    const start = cursor; cursor += total * weight / sum; return [start, cursor];
  });
  const segment = { id: "WholeExchange", start: 0, end: total, wait: 0 };
  const tail = 0;
  const Late = (index, fraction) => lines[index][0] + (lines[index][1] - lines[index][0]) * fraction;
  if (cue.id === "BunkerBanter") segment.events = [{ at: lines[5][1], id: "BunkerBlast" }];
  if (cue.id === "RescueLift") segment.events = [{ at: Late(2, .82), id: "RescueHeave" }];
  if (cue.id === "BorrowLight") segment.events = [
    { at: lines[4][1], id: "BorrowLightMatchesPocketed" },
    { at: lines[5][1], id: "BorrowLightCigaretteOffered" },
  ];
  if (cue.id === "AircraftReturn") segment.events = [{ at: lines[1][0], id: "AircraftDiveOrder" }];
  if (cue.id === "ZhouDeath") segment.events = [{ at: lines[0][1], id: "ZhouNoAnswer" }];
  return { lines, segments: [segment], tail };
}
