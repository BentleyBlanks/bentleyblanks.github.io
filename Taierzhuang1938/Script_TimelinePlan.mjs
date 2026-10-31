// Timeline 过场的数据规则（docs/Data_EditorSuite.md「Timeline 过场」）。纯函数：node 与浏览器共用，不 import three。
//
// ## 一份 Timeline 是什么
// 一份 `Timeline/<Id>.timeline.json` = 按顺序排的几段**子序列**（UE Sequencer 的 Shot / Unity Timeline 的
// Control Clip）。每段子序列就是一段白盒预演（Blockout/<Level>.previz.json 的 sequences[] 一项，字段口径
// 见 docs/Data_EditorBlockout.md §14.1）：镜头轨、演员键、台词、事件、飞机、慢动作。整份 Timeline 的时间轴 =
// 各段首尾相接（主时间轴）；每段从自己那个关键帧的布设起播。
//
// ## 为什么不另写播放器
// 播放、拖动、逐帧全走白盒编辑器里那一个预演播放器（Script_EditorBlockoutPreviz）：它的 Seek 是确定性求值，
// 拖到哪一秒画面就是哪一秒。另写一个就等于把演员、镜头、字幕、口型的求值抄第二遍，抄漏一条就是
// 「Timeline 里对、预演里不对」。Timeline 只换喂给它的那份数据（UseSource）。
//
// ## 拷贝，不是引用
// 现在唯一一份 FirstLevelOpening 是第一关开场 01-1…01-4 四段预演的**拷贝**（2026-10-31 用户：测试用，
// 不影响白盒编辑器里那份）。改 Timeline 不动 Blockout/ 里的预演；要跟回预演的新版，跑
// `node Taierzhuang1938/Script_TimelineCli.mjs sync <Id>`（照 copiedFrom 重新拷，覆盖本地改动）。

import { BLOCKOUT_PREVIZ_SCHEMA, ValidateBlockoutPreviz, PrevizSequenceDuration } from "./Script_EditorBlockoutPrevizPlan.mjs";

export const TIMELINE_SCHEMA = "tengxian-timeline/1";
/** 时码与逐帧的帧率（只管显示与「下一帧」的步长，播放本身按真实 dt 走）。 */
export const TIMELINE_FPS = 30;
/** 台词在清单里没写时长时按这么长画（秒）。 */
export const TIMELINE_LINE_FALLBACK_S = 2;

/**
 * 登记表。加一份 Timeline = 写一个 Timeline/<Id>.timeline.json + 在这里加一行（或用 CLI 的 new，它两样都做）。
 * level：子序列的关键帧在哪个白盒关卡里（打开 Timeline 时白盒编辑器切到这一关）。
 */
export const TIMELINES = Object.freeze([
  Object.freeze({ id: "FirstLevelOpening", title: "第一关开场（测试拷贝）", level: "FirstLevel0105",
    file: "Timeline/FirstLevelOpening.timeline.json" }),
]);
export const DEFAULT_TIMELINE_ID = TIMELINES[0].id;

export function FindTimeline(id) { return TIMELINES.find((entry) => entry.id === id) || null; }

/** 事件的中文名（轨道上的标签与 CLI 输出共用）。 */
export const TIMELINE_EVENT_LABELS = Object.freeze({
  flash: "白光", black: "黑场", caption: "说明字", explosion: "爆炸", smoke: "烟", muzzle: "枪口火",
  shake: "震屏", signal: "信号", sfx: "音效", flare: "照明弹", slowmo: "慢动作",
});

const IsObject = (v) => v && typeof v === "object" && !Array.isArray(v);
const Finite = (v) => typeof v === "number" && Number.isFinite(v);

/** 换成预演播放器认的那份文档（子序列原样带过去）。 */
export function TimelineAsPreviz(doc) {
  return {
    schema: BLOCKOUT_PREVIZ_SCHEMA, level: doc?.level, title: doc?.title,
    voice: doc?.voice, faceTracks: doc?.faceTracks,
    sequences: Array.isArray(doc?.sequences) ? doc.sequences : [],
  };
}

/**
 * 核对一份 Timeline。自己的字段（schema / id / level / copiedFrom）在这里查，子序列交给预演的校验
 * （给了 config 就核对关键帧与单位 id，给了 voice 就核对台词 id）。→ { ok, errors, warnings }
 */
export function ValidateTimeline(doc, { config = null, voice = null } = {}) {
  const errors = [], warnings = [];
  if (!IsObject(doc)) return { ok: false, errors: ["Timeline 文件要是 JSON 对象"], warnings };
  if (doc.schema !== TIMELINE_SCHEMA) errors.push(`schema 要是 ${TIMELINE_SCHEMA}`);
  if (typeof doc.id !== "string" || !/^[A-Za-z][A-Za-z0-9]*$/.test(doc.id)) errors.push("id 要是 PascalCase 名字");
  if (doc.title !== undefined && typeof doc.title !== "string") errors.push("title 要是字符串");
  if (doc.copiedFrom !== undefined) {
    const c = doc.copiedFrom;
    if (!IsObject(c) || typeof c.file !== "string" || !Array.isArray(c.keyframes)) errors.push("copiedFrom 要是 { file, keyframes[] }");
  }
  if (Array.isArray(doc.sequences) && doc.sequences.length === 0) errors.push("sequences 至少要一段");
  const inner = ValidateBlockoutPreviz(TimelineAsPreviz(doc), { config, voice });
  errors.push(...inner.errors);
  warnings.push(...inner.warnings);
  return { ok: errors.length === 0, errors, warnings };
}

/** 台词清单 → 句子 id 查表（清单格式见 Blockout/<Level>.voice.json）。 */
export function VoiceLineTable(voice) {
  const map = new Map();
  for (const scene of voice?.scenes || []) for (const line of scene?.lines || []) if (line?.id) map.set(line.id, line);
  return map;
}

/**
 * 主时间轴：各段首尾相接。lineDuration(id) → 秒（没有就按台词默认）。
 * → { durationS, segments: [{ index, keyframe, title, start, durationS, end }] }
 */
export function TimelineLayout(doc, { lineDuration = null } = {}) {
  const segments = [];
  let at = 0;
  (doc?.sequences || []).forEach((seq, index) => {
    const durationS = PrevizSequenceDuration(seq, { lineDuration });
    segments.push({ index, keyframe: seq.keyframe, title: seq.title || seq.keyframe, start: at, durationS, end: at + durationS });
    at += durationS;
  });
  return { durationS: at, segments };
}

/** 主时间轴上的 t 落在哪一段、段内第几秒。t 超出两头时夹到首尾。 */
export function LocateTime(layout, t) {
  const segs = layout?.segments || [];
  if (!segs.length) return { index: -1, local: 0 };
  const time = Math.max(0, Math.min(layout.durationS, Number(t) || 0));
  for (const seg of segs) if (time < seg.end) return { index: seg.index, local: time - seg.start };
  const last = segs[segs.length - 1];
  return { index: last.index, local: last.durationS };
}

/** 一条镜头的短名：第一人称眼睛 / 机位（推拉、转头、跟人）。 */
function ShotKind(cam) {
  if (cam.eye) return cam.eye.free ? "眼睛·可转头" : (Finite(cam.eye.toYawDeg) || Finite(cam.eye.toPitchDeg) || cam.eye.toLook ? "眼睛·转头" : "眼睛");
  const anchored = (cam.from && cam.from.actor) || (cam.look && cam.look.actor) || (cam.look && cam.look.aircraft);
  const moving = !!(cam.to || cam.lookTo);
  return `${anchored ? "跟拍" : "机位"}${moving ? "·运镜" : ""}`;
}

function Round(v, digits = 2) { return Number(v.toFixed(digits)); }

/**
 * 主时间轴上的三条轨（镜头 / 台词 / 事件）+ 子序列轨。t0 / t1 都是主时间轴秒数；
 * src 指回数据里的位置（「sequences[i].camera[j]」），给「复制定位」与 agent 改文件用。
 * lineInfo(id) → 清单里那一句（speaker / subtitle / durationS），可省。
 */
export function TimelineTracks(doc, layout, { lineInfo = null } = {}) {
  const shots = [], lines = [], events = [], segments = [];
  for (const seg of layout.segments) {
    const seq = doc.sequences[seg.index];
    const base = seg.start, end = seg.end;
    segments.push({ t0: Round(base), t1: Round(end), label: `${seg.keyframe} ${seg.title}`, keyframe: seg.keyframe, src: `sequences[${seg.index}]` });
    const cams = (seq.camera || []).map((cam, j) => ({ cam, j })).filter((c) => Finite(c.cam?.t));
    cams.forEach(({ cam, j }, k) => {
      const next = cams[k + 1];
      // 镜头管 [t, t+dur)，空档沿用上一条最后一帧 —— 画到下一条开始（或段尾）
      const t1 = next ? next.cam.t : seg.durationS;
      shots.push({
        t0: Round(base + cam.t), t1: Round(base + Math.max(cam.t, Math.min(seg.durationS, t1))),
        label: `${seg.keyframe}·${k + 1}`, kind: ShotKind(cam), fov: Finite(cam.fov) ? cam.fov : null,
        keepMove: cam.keepMove === true, src: `sequences[${seg.index}].camera[${j}]`,
      });
    });
    (seq.lines || []).forEach((l, j) => {
      if (!Finite(l?.t)) return;
      const info = lineInfo ? lineInfo(l.line) : null;
      const dur = Finite(info?.durationS) ? info.durationS : TIMELINE_LINE_FALLBACK_S;
      lines.push({
        t0: Round(base + l.t), t1: Round(Math.min(end, base + l.t + dur)), id: l.line,
        label: info ? `${info.speaker || info.who || ""}：${info.subtitle || info.text || ""}` : l.line,
        missing: !info, src: `sequences[${seg.index}].lines[${j}]`,
      });
    });
    (seq.events || []).forEach((e, j) => {
      if (!Finite(e?.t)) return;
      const ranged = Finite(e.dur) && ["flash", "black", "caption", "smoke", "shake"].includes(e.type);
      const name = TIMELINE_EVENT_LABELS[e.type] || e.type;
      const detail = e.type === "signal" ? `${e.name}${e.on === false ? " 关" : ""}`
        : e.type === "sfx" ? e.name : e.type === "caption" ? e.text : e.type === "explosion" ? (e.kind || "") : "";
      events.push({
        t0: Round(base + e.t), t1: ranged ? Round(Math.min(end, base + e.t + e.dur)) : null,
        type: e.type, label: detail ? `${name} ${detail}` : name, src: `sequences[${seg.index}].events[${j}]`,
      });
    });
    (seq.slowmo || []).forEach((w, j) => {
      if (!Finite(w?.t) || !Finite(w?.dur)) return;
      events.push({ t0: Round(base + w.t), t1: Round(Math.min(end, base + w.t + w.dur)), type: "slowmo",
        label: `慢动作 ×${w.rate}`, src: `sequences[${seg.index}].slowmo[${j}]` });
    });
  }
  return { segments, shots, lines, events };
}

/** 主时间轴 t 这一刻：第几镜、哪几句台词在说。 */
export function TracksAt(tracks, t) {
  const shotIndex = tracks.shots.findIndex((s, i) => t >= s.t0 && (t < s.t1 || i === tracks.shots.length - 1));
  const lines = tracks.lines.filter((l) => t >= l.t0 && t < l.t1);
  return { shotIndex, shot: shotIndex >= 0 ? tracks.shots[shotIndex] : null, lines };
}

/** 时码 mm:ss:ff（ff 按 TIMELINE_FPS）。 */
export function FormatTimecode(t, fps = TIMELINE_FPS) {
  const total = Math.max(0, Math.round((Number(t) || 0) * fps));
  const f = total % fps, s = Math.floor(total / fps) % 60, m = Math.floor(total / fps / 60);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(m)}:${pad(s)}:${pad(f)}`;
}

/** 给人和 agent 看的纯文本摘要（CLI 的 show 打的就是它）。 */
export function DescribeTimeline(doc, layout, tracks, { segment = null } = {}) {
  const out = [];
  out.push(`${doc.id} · ${doc.title || ""} · ${layout.segments.length} 段 · ${layout.durationS.toFixed(2)} s（${FormatTimecode(layout.durationS)}）`);
  if (doc.copiedFrom) out.push(`拷贝自 ${doc.copiedFrom.file} [${doc.copiedFrom.keyframes.join(", ")}]${doc.copiedFrom.at ? ` · ${doc.copiedFrom.at}` : ""}`);
  for (const seg of layout.segments) {
    if (segment && seg.keyframe !== segment) continue;
    out.push("");
    out.push(`■ ${seg.keyframe} ${seg.title}  ${FormatTimecode(seg.start)} → ${FormatTimecode(seg.end)}（${seg.durationS.toFixed(2)} s）  sequences[${seg.index}]`);
    const inSeg = (item) => item.src.startsWith(`sequences[${seg.index}].`);
    const rows = [
      ...tracks.shots.filter(inSeg).map((s) => [s.t0, `镜头 ${s.label} ${s.kind}${s.fov ? ` ${s.fov}°` : ""}${s.keepMove ? " 保留运镜" : ""} → ${FormatTimecode(s.t1)}`, s.src]),
      ...tracks.lines.filter(inSeg).map((l) => [l.t0, `台词 ${l.id} ${l.label}${l.missing ? "（清单里没有）" : ""}`, l.src]),
      ...tracks.events.filter(inSeg).map((e) => [e.t0, `事件 ${e.label}${e.t1 != null ? ` → ${FormatTimecode(e.t1)}` : ""}`, e.src]),
    ].sort((a, b) => a[0] - b[0]);
    for (const [t, text, src] of rows) out.push(`  ${FormatTimecode(t)}  ${text}  ${src}`);
  }
  return out.join("\n");
}
