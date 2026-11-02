// 环境参数的值：固定值，或一天 24 小时里的关键帧（docs/Data_Environment.md §3）。
//
// 预设里一个参数写成：
//   固定值   52 / "#fff2df" / [1.0, 0.97, 0.91] / "soft" / true
//   关键帧   { "keys": [ { "h": 12, "v": 52, "tag": "day" }, { "h": 18, "v": 12, "tag": "dusk" } ], "interp": "smooth" }
// 关键帧绕一天循环：最后一个到第一个之间跨午夜插值。interp：smooth（缺省，两帧之间缓入缓出）/ linear / step（保持前一帧）。
// 值怎么插由参数声明定（Data_EnvComponents）：number 线性或对数；angle 走最短弧；color 换成线性光再插；
// rgb 逐通道（也可对数）；enum / bool 就近取（过了一半换成下一个）。
// tag 是「这一帧属于哪一套表现」（白天 / 黄昏 / 晚上）：同一个参数里 tag 相同的几帧是联动的，改一个其余跟着改
// （晚上 22:00 与 04:00 是同一套表现，夜里那段就不会被插成半个白天）。
//
// 纯函数，零 import。框架求值、编辑器画曲线、测试都用这一份。

export const DAY_HOURS = 24;
const INTERPS = new Set(["smooth", "linear", "step"]);

export function WrapHour(hour) {
  const h = Number(hour) || 0;
  return ((h % DAY_HOURS) + DAY_HOURS) % DAY_HOURS;
}

/** 两个时刻在一天里的差（-12…12，b 在 a 之后为正）。 */
export function HourDelta(a, b) {
  let d = WrapHour(b) - WrapHour(a);
  if (d > DAY_HOURS / 2) d -= DAY_HOURS;
  if (d < -DAY_HOURS / 2) d += DAY_HOURS;
  return d;
}

export function IsTrack(value) {
  return !!value && typeof value === "object" && !Array.isArray(value) && Array.isArray(value.keys);
}

export function CloneValue(value) {
  if (Array.isArray(value)) return value.map(CloneValue);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = CloneValue(v);
    return out;
  }
  return value;
}

export function SameValue(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => SameValue(v, b[i]));
  }
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  if (typeof a === "string" && typeof b === "string") return a.toLowerCase() === b.toLowerCase();
  return a === b;
}

// ---------------------------------------------------------------------------
// 颜色

export function SrgbToLinear(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
export function LinearToSrgb(c) { return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }

/** "#rrggbb" → [r, g, b]（0–1，sRGB）。写坏了 → null。 */
export function HexToRgb01(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function Rgb01ToHex(rgb) {
  const c = (v) => Math.max(0, Math.min(255, Math.round((Number(v) || 0) * 255))).toString(16).padStart(2, "0");
  return `#${c(rgb[0])}${c(rgb[1])}${c(rgb[2])}`;
}

/** "#rrggbb" → 0xrrggbb（three 的 Color.setHex 吃这个）。 */
export function HexToInt(hex) {
  const rgb = HexToRgb01(hex);
  if (!rgb) return 0xffffff;
  return (Math.round(rgb[0] * 255) << 16) | (Math.round(rgb[1] * 255) << 8) | Math.round(rgb[2] * 255);
}

export function IntToHex(value) {
  return `#${(Math.max(0, Math.min(0xffffff, Number(value) | 0))).toString(16).padStart(6, "0")}`;
}

// ---------------------------------------------------------------------------
// 插值

export function Ease(interp, t) {
  if (interp === "step") return 0;
  if (interp === "linear") return t;
  return t * t * (3 - 2 * t);
}

function Lerp(a, b, t) { return a + (b - a) * t; }

/** 按参数声明在 a、b 之间插 t（0–1）。 */
export function LerpParamValue(param, a, b, t) {
  if (t <= 0) return CloneValue(a);
  if (t >= 1) return CloneValue(b);
  switch (param.kind) {
    case "number": {
      if (a === b) return a; // 平台段（夜里两帧同值）逐位不变，不让对数来回漂
      if (param.lerp === "log" && a > 0 && b > 0) return Math.exp(Lerp(Math.log(a), Math.log(b), t));
      return Lerp(a, b, t);
    }
    case "angle": {
      let d = ((b - a) % 360 + 540) % 360 - 180;
      return ((a + d * t) % 360 + 360) % 360;
    }
    case "color": {
      const ca = HexToRgb01(a), cb = HexToRgb01(b);
      if (!ca || !cb) return t < 0.5 ? a : b;
      return Rgb01ToHex(ca.map((v, i) => LinearToSrgb(Lerp(SrgbToLinear(v), SrgbToLinear(cb[i]), t))));
    }
    case "rgb": return a.map((v, i) => (v === b[i] ? v : param.lerp === "log" && v > 0 && b[i] > 0 ? Math.exp(Lerp(Math.log(v), Math.log(b[i]), t)) : Lerp(v, b[i], t)));
    default: return t < 0.5 ? CloneValue(a) : CloneValue(b);
  }
}

export function ParamDefault(param) { return CloneValue(param.default); }

/** 关键帧按时刻排好（不改原数组）。 */
export function SortedKeys(track) {
  return [...track.keys].sort((x, y) => x.h - y.h);
}

/** 这一刻落在哪两帧之间：→ { a, b, t（已按 interp 缓动）, ia, ib }（下标是排序后的）。 */
export function TrackSegment(track, hour) {
  const keys = SortedKeys(track);
  const h = WrapHour(hour);
  if (keys.length === 1) return { a: keys[0], b: keys[0], t: 0, ia: 0, ib: 0, keys };
  let ib = keys.findIndex((k) => k.h > h + 1e-9);
  if (ib < 0) ib = 0;
  const ia = (ib - 1 + keys.length) % keys.length;
  const a = keys[ia], b = keys[ib];
  const span = WrapHour(b.h - a.h) || DAY_HOURS;
  const raw = WrapHour(h - a.h) / span;
  const interp = INTERPS.has(track.interp) ? track.interp : "smooth";
  return { a, b, t: Ease(interp, Math.max(0, Math.min(1, raw))), ia, ib, keys };
}

/** 求一个参数在 hour 时的值：固定值原样给，关键帧插值。没写（undefined）给默认值。 */
export function EvalParamValue(param, value, hour) {
  if (value === undefined) return ParamDefault(param);
  if (!IsTrack(value)) return value;
  if (!value.keys.length) return ParamDefault(param);
  const seg = TrackSegment(value, hour);
  return LerpParamValue(param, seg.a.v, seg.b.v, seg.t);
}

// ---------------------------------------------------------------------------
// 关键帧编辑（都返回新对象，不改传进来的那份）

/** 离 hour 最近、且相差不超过 snapH 的那一帧的下标（原数组里的下标）；没有 → -1。 */
export function KeyIndexAt(track, hour, snapH = 0.05) {
  let best = -1, bestD = Infinity;
  track.keys.forEach((k, i) => {
    const d = Math.abs(HourDelta(k.h, hour));
    if (d <= snapH && d < bestD) { best = i; bestD = d; }
  });
  return best;
}

function RoundHour(h) { return Math.round(WrapHour(h) * 1000) / 1000; }

/** 把一个固定值换成关键帧：给的几个时刻都放同一个值（一个时刻也行）。 */
export function ToTrack(value, hours = [12], tags = []) {
  const list = hours.length ? hours : [12];
  return { keys: list.map((h, i) => ({ h: RoundHour(h), v: CloneValue(value), ...(tags[i] ? { tag: tags[i] } : {}) })), interp: "smooth" };
}

/** 关键帧 → 固定值（取 hour 这一刻的值）。 */
export function ToConstant(param, value, hour) {
  return CloneValue(EvalParamValue(param, value, hour));
}

/**
 * 在 hour 写一个值：那一刻已有关键帧就改它（tag 相同的联动帧一起改），没有就插一帧。
 * → { track, index }（index 是改 / 插的那一帧在新数组里的下标）。
 */
export function SetKeyAt(track, hour, value, { snapH = 0.05 } = {}) {
  const at = KeyIndexAt(track, hour, snapH);
  if (at >= 0) return { track: SetKeyValue(track, at, value), index: at };
  const keys = [...track.keys.map(CloneValue), { h: RoundHour(hour), v: CloneValue(value) }];
  return { track: { ...track, keys }, index: keys.length - 1 };
}

/** 改第 index 帧的值；它有 tag 时同一参数里 tag 相同的帧一起改（同一套表现）。 */
export function SetKeyValue(track, index, value) {
  const tag = track.keys[index]?.tag;
  const keys = track.keys.map((k, i) => (i === index || (tag && k.tag === tag)) ? { ...k, v: CloneValue(value) } : CloneValue(k));
  return { ...track, keys };
}

/** 挪第 index 帧到 hour（不与别的帧重叠：撞上就不挪）。 */
export function MoveKey(track, index, hour) {
  const h = RoundHour(hour);
  if (track.keys.some((k, i) => i !== index && Math.abs(HourDelta(k.h, h)) < 1e-3)) return track;
  const keys = track.keys.map((k, i) => (i === index ? { ...CloneValue(k), h } : CloneValue(k)));
  return { ...track, keys };
}

/** 删第 index 帧（最后一帧不删：关键帧至少一帧，要固定值请换成固定值）。 */
export function RemoveKey(track, index) {
  if (track.keys.length <= 1) return track;
  return { ...track, keys: track.keys.filter((_, i) => i !== index).map(CloneValue) };
}

/** 一个值是不是这个参数能收的合法值（不看范围，只看形状）。 */
export function ValueFits(param, value) {
  switch (param.kind) {
    case "number": case "angle": return typeof value === "number" && Number.isFinite(value);
    case "color": return HexToRgb01(value) !== null;
    case "rgb": return Array.isArray(value) && value.length === 3 && value.every((v) => typeof v === "number" && Number.isFinite(v));
    case "enum": return typeof value === "string" && (param.options || []).some((o) => o.value === value);
    case "bool": return typeof value === "boolean";
    default: return false;
  }
}
