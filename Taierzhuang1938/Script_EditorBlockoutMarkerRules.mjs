// ===========================================================================
// Script_EditorBlockoutMarkerRules.mjs —— 白盒编辑器三层新标记的纯规则（docs/Data_EditorBlockout.md §5.5，2026-10-20）
//
// 零 three、零 DOM：node 测试与浏览器共用。Script_EditorBlockoutMarkers / Map / 总控只调这里的函数，不各自再抄一份：
//   · 每个人的标签：有名字用名字；「全部」档无名的人按身份兜底（国军 / 日军 / 百姓 / 小孩 / 军官 / 伤员 / 担架 / 驴车…），
//     同一帧里同一种兜底文字不止一个时带 id 的尾号区分（Walker04 → 「国军 04」）。
//   · 地标（场景文件 landmarks）：按 kind 分色（和敌 / 友 / 百姓 / 要点 / 下一步 / 危险的颜色都不撞）、线框比实物略大、
//     光柱高到能从墙外看见、片区画虚线。几何只算到「角点 / 边 / 高」这一步，画法在 Markers。
//   · 关键帧站位：标签「拍号 + 名字」（08-3 压窗口）。
//   · 开关状态：三档的「标签」与两个新开关的取值、localStorage 的读写格式（读写都在调用方包 try/catch）。
// ===========================================================================

import { BLOCKOUT_MG_WEAPONS, BLOCKOUT_LANDMARK_KINDS } from "./Script_EditorBlockoutConfig.mjs";

/** 「标签」开关的三档：有名字的（缺省）→ 全部 → 关。 */
export const BLOCKOUT_LABEL_MODES = Object.freeze(["named", "all", "off"]);

/** 图层开关的缺省值（总控、界面、标记层、地图四处同源）。 */
export const BLOCKOUT_LAYER_DEFAULTS = Object.freeze({ arcs: "default", intents: true, labels: "named", xray: true, landmarks: true, stations: true });

/** 记住用户上次的开关选择：localStorage 键。 */
export const BLOCKOUT_LAYERS_STORAGE_KEY = "tengxian1938_blockout_layers";

/** 地标按 kind 的颜色：粉（洞 / 缝）、青（门）、紫（窗）、薄荷绿（坑 / 窖）、白（片区，虚线）、黄绿（物件）、米白（地名）。 */
export const BLOCKOUT_LANDMARK_COLORS = Object.freeze({
  hole: "#ff6fd8", door: "#3fe0e0", window: "#a98bff", pit: "#5ef0a8", area: "#f2f2ee", prop: "#c9f05a", place: "#e8e8e0",
});

/** 地标的画法参数：线框外扩、最小厚度（薄的洞 / 缝也看得见）、光柱高、标签挂的高度、片区的光柱矮一截。 */
export const BLOCKOUT_LANDMARK_DRAW = Object.freeze({
  padM: 0.08,          // 线框比实物每边大这么多
  minSideM: 0.3,       // 线框每边至少这么厚（墙缝 0.2、狗洞 0.45 也要能一眼找到）
  minHeightM: 0.3,
  pillarM: 3.4,        // 光柱从脚下到这么高（院墙 2.2、房子 3.2 都够不着它顶）
  areaPillarM: 2.6,    // 片区 / 地名矮一些
  labelLiftM: 0.35,    // 标签挂在光柱顶上再高一点
  flagM: 0.45,         // 顶上的小旗长
  placeRingM: 0.8,     // 地名脚下的小地环
  labelFarM: 160,      // 这么远以外不挂标签（线框照画）
  nearLabelM: 10,      // 这么近时有线框的标签挂在线框顶上（不挂柱顶，第一人称里柱顶早出画面了）
  fillAlpha: 0.16,     // 线框四面与顶面的淡填充
  fillFadeNearM: 2.5,  // 线框边离相机这么近以内填充整片不画（石碾贴脸时那块填充会糊半个屏幕；线框照画）
  fillFadeFarM: 6.5,   // 这以外填充不淡
});

/** 关键帧站位的画法参数。 */
export const BLOCKOUT_STATION_DRAW = Object.freeze({
  color: "#f7e9c3", currentColor: "#ffd56a",
  triM: 0.5, currentTriM: 0.7, ringM: 0.9,
  dimAlpha: 0.5, lineWidthM: 0.09, dash: Object.freeze([0.7, 0.55]),
  labelLiftM: 1.25, labelFarM: 220,
  // 站在那一点上（或贴着它）时不挂它的标签：第一人称会糊在脸上
  skipNearM: 2.0,
});

/** 站位标签：「拍号 + 名字」，如「08-3 压窗口」；没名字只有拍号。 */
export function StationLabel(kf) {
  const id = kf && kf.id != null ? String(kf.id) : "";
  const name = kf && typeof kf.name === "string" ? kf.name.trim() : "";
  return name ? `${id} ${name}`.trim() : id;
}

function IsMachineGun(unit) { return !!unit && BLOCKOUT_MG_WEAPONS.includes(unit.weapon); }

/**
 * 无名单位的兜底文字（只看身份，不带尾号）。
 * 国军 / 日军 / 百姓 / 小孩 / 军官 / 伤员 / 担架 / 驴车 / 战车 / 牲口；机枪手写「机枪」（和原来的头顶标签一致）。
 */
export function UnitFallbackText(unit) {
  if (!unit) return "";
  const side = unit.side, kind = unit.kind || "soldier";
  if (kind === "tank") return "战车";
  if (kind === "litter") return "担架";
  if (kind === "cart") return "驴车";
  if (kind === "animal") return "牲口";
  if (IsMachineGun(unit)) return "机枪";
  if (unit.state === "down") return side === "ija" ? "日军（倒地）" : "伤员";
  if (kind === "officer") return side === "ija" ? "日军军官" : "军官";
  if (kind === "child") return "小孩";
  if (kind === "civilian" || side === "civ") return "百姓";
  if (side === "ija") return "日军";
  if (side === "nra") return "国军";
  return "";
}

/** id 的尾号（Walker04 → "04"、EastIja5 → "5"、Luo → ""）。 */
export function IdTail(id) {
  const m = /(\d+)$/.exec(String(id ?? ""));
  return m ? m[1] : "";
}

/**
 * 一帧里每个单位的标签文字。mode："named"（有名字的才有字，无名的机枪写「机枪」，其余空 = 只画色点）、
 * "all"（无名的按身份兜底，同一种兜底不止一个时带 id 尾号）、"off"（全空）。
 * → Map<id, text>。
 */
export function UnitLabelTexts(units, mode = "named") {
  const out = new Map();
  if (!Array.isArray(units)) return out;
  if (mode === "off") { for (const u of units) out.set(u.id, ""); return out; }
  const counts = new Map();
  const fallback = new Map();
  for (const u of units) {
    if (!u || u.visible === false) continue;
    if (u.name) continue;
    const text = mode === "all" ? UnitFallbackText(u) : (IsMachineGun(u) ? "机枪" : "");
    fallback.set(u.id, text);
    if (text) counts.set(text, (counts.get(text) || 0) + 1);
  }
  for (const u of units) {
    if (!u) continue;
    if (u.name) { out.set(u.id, u.name); continue; }
    const text = fallback.get(u.id) || "";
    if (!text) { out.set(u.id, ""); continue; }
    const tail = mode === "all" && (counts.get(text) || 0) > 1 ? IdTail(u.id) : "";
    out.set(u.id, tail ? `${text} ${tail}` : text);
  }
  return out;
}

/** 规范化「标签」档位：true → named、false → off、三档字符串原样、其余 → fallback。 */
export function LabelMode(value, fallback = "named") {
  if (value === true) return "named";
  if (value === false) return "off";
  return BLOCKOUT_LABEL_MODES.includes(value) ? value : fallback;
}

/**
 * 地标的几何（纯数）：
 *   box   有 w / d 时：{ corners: 4 个 [x, z]（已含外扩与最小厚度，按 ry 转）, y0, y1 }（线框底 / 顶的世界高；没给 y 时 y0 = ground）
 *   ring  有 radiusM 或 kind 是 place 时：{ r }
 *   pillarM / labelY 光柱高、标签挂的高度（离地）
 * ground 是脚下地面高（调用方按 groundAt(x, z) 给）。
 */
export function LandmarkGeometry(lm, ground = 0) {
  const D = BLOCKOUT_LANDMARK_DRAW;
  const area = lm.kind === "area" || lm.kind === "place";
  const out = { box: null, ring: null, pillarM: area ? D.areaPillarM : D.pillarM, labelY: 0, color: BLOCKOUT_LANDMARK_COLORS[lm.kind] || BLOCKOUT_LANDMARK_COLORS.place, dashed: lm.kind === "area" };
  if (lm.w > 0 && lm.d > 0) {
    const w = Math.max(D.minSideM, lm.w + 2 * D.padM), d = Math.max(D.minSideM, lm.d + 2 * D.padM);
    const h = Math.max(D.minHeightM, (lm.h || 0) + D.padM);
    const c = Math.cos(lm.ry || 0), s = Math.sin(lm.ry || 0);
    const P = (lx, lz) => [lm.x + lx * c + lz * s, lm.z - lx * s + lz * c];
    const corners = [P(-w / 2, -d / 2), P(w / 2, -d / 2), P(w / 2, d / 2), P(-w / 2, d / 2)];
    const y0 = Number.isFinite(lm.y) ? lm.y - (lm.h || 0) / 2 - D.padM / 2 : ground - D.padM / 2;
    out.box = { corners, y0, y1: y0 + h, w, d };
    // 光柱至少高过线框顶
    out.pillarM = Math.max(out.pillarM, y0 + h - ground + 0.6);
  }
  if (lm.radiusM > 0) out.ring = { r: lm.radiusM };
  else if (lm.kind === "place" && !out.box) out.ring = { r: D.placeRingM };
  out.labelY = ground + out.pillarM + D.labelLiftM;
  return out;
}

/** 地标 kind 是不是认得的。 */
export function IsLandmarkKind(kind) { return BLOCKOUT_LANDMARK_KINDS.includes(kind); }

/**
 * 图层开关取值归一化（总控 SetLayers 用）：arcs 三档、labels 三档、其余布尔；不认识的键丢掉。
 * → 只含合法键的新对象（缺的键按 base 补）。
 */
export function NormalizeLayers(partial, base = BLOCKOUT_LAYER_DEFAULTS) {
  const out = { ...base };
  if (!partial || typeof partial !== "object") return out;
  for (const [name, value] of Object.entries(partial)) {
    if (!(name in BLOCKOUT_LAYER_DEFAULTS)) continue;
    if (name === "arcs") out.arcs = value === true ? "default" : value === false ? "off" : ["all", "default", "off"].includes(value) ? value : out.arcs;
    else if (name === "labels") out.labels = LabelMode(value, out.labels);
    else out[name] = !!value;
  }
  return out;
}

/** localStorage 里那段文字 → 开关对象（坏的 / 缺的键按缺省）。text 可以是 null。 */
export function ParseStoredLayers(text, base = BLOCKOUT_LAYER_DEFAULTS) {
  if (typeof text !== "string" || !text) return { ...base };
  let doc;
  try { doc = JSON.parse(text); } catch (error) { return { ...base }; }
  return NormalizeLayers(doc, base);
}

/** 开关对象 → 存进 localStorage 的文字（只带六个键）。 */
export function SerializeLayers(layers) {
  const n = NormalizeLayers(layers);
  return JSON.stringify({ arcs: n.arcs, intents: n.intents, labels: n.labels, xray: n.xray, landmarks: n.landmarks, stations: n.stations });
}
