// 白盒关卡编辑器的配置格式（docs/Data_EditorBlockout.md §3、§5.2、§5.3）。
//
// 纯模块：node 与浏览器共用，scripts/Script_LocalPreview.mjs 启动时也会 import 它，
// 所以**导入时不得抛错、不得碰 DOM / three / window**。
//
// 朝向一律 yawDeg：0 = 朝北（−Z），+90 = 朝西，−90 = 朝东；前方 = (−sin, −cos)，
// 与玩家 / 演员 rotation.y 同号（rotation.y = yawDeg·π/180）。

export const BLOCKOUT_SCHEMA = "tengxian-blockout/1";
export const BLOCKOUT_SCENE_SCHEMA = "tengxian-blockout-scene/1";
export const BLOCKOUT_LEVEL_KEYS = Object.freeze(["FirstLevel", "SecondLevel", "FirstLevel0105", "FirstLevel0610"]);
export const BLOCKOUT_LEVEL_RE = /^[A-Za-z0-9]+$/;
export const BLOCKOUT_CONFIG_FILE_RE = /^Taierzhuang1938\/Blockout\/[A-Za-z0-9]+\.json$/;
export const BLOCKOUT_KEYFRAME_ID_RE = /^[A-Za-z0-9_-]+$/;

export const BLOCKOUT_SIDES = Object.freeze(["ija", "nra", "civ"]);
export const BLOCKOUT_KINDS = Object.freeze(["soldier", "officer", "civilian", "child", "tank", "litter", "cart", "animal"]);
export const BLOCKOUT_STANCES = Object.freeze(["stand", "crouch", "prone"]);
export const BLOCKOUT_POI_KINDS = Object.freeze(["objective", "poi", "landmark", "danger"]);
export const BLOCKOUT_MG_WEAPONS = Object.freeze(["Type11", "Type92Hmg", "Zb26"]);
/** 倒地的人怎么躺（§3 可选 lie，2026-10-18）："along" = 身体顺着朝向躺、头朝 yawDeg 的前方；不写 = 演员倒地姿态原样（身子横在朝向两侧）。 */
export const BLOCKOUT_LIE_MODES = Object.freeze(["along"]);

/** 过渡缺省速度（米 / 秒），§3 单位表。 */
export const BLOCKOUT_DEFAULT_SPEED = Object.freeze({ ija: 2.8, nra: 2.4, civ: 1.6, litter: 1.2, tank: 2.0 });
/** 过渡时长夹取（秒），§5.2。 */
export const BLOCKOUT_TRANSITION = Object.freeze({ minS: 0.6, maxS: 8, turnS: 0.4, stayEpsM: 0.05 });
/** 拍号显示（可选 keyframes[].stageLabel，如「02末」）：导航栏与卡片用它代替两位阶段号，最多这么多字。 */
export const BLOCKOUT_STAGE_LABEL_MAX = 6;
/** 文字长度：超过只报警告。 */
export const BLOCKOUT_TEXT_LIMITS = Object.freeze({ what: 80, next: 40 });

const NO_WEAPON_KINDS = new Set(["civilian", "child", "tank", "litter", "cart", "animal"]);

export function BlockoutConfigPath(level) {
  return `Taierzhuang1938/Blockout/${level}.json`;
}

// ---------------------------------------------------------------------------
// 小工具

function Finite(value) { return typeof value === "number" && Number.isFinite(value); }
function IsObject(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
function IsPoint(value) { return IsObject(value) && Finite(value.x) && Finite(value.z); }
function Clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
// 报错时回显用户给的值：只回显标量，对象 / 数组一律写类型（嵌套极深的值 JSON.stringify 会栈溢出，
// 存档口在 LocalPreview 进程里调校验器，那里抛出来会带倒整个预览服务）。
function Echo(value) {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return JSON.stringify(value).slice(0, 80);
  if (Array.isArray(value)) return "数组";
  return typeof value === "object" ? "对象" : typeof value;
}
function WrapDeg(deg) {
  let d = ((deg + 180) % 360 + 360) % 360 - 180;
  if (d === -180) d = 180;
  return d;
}
function Round(value, digits = 3) {
  const k = 10 ** digits;
  return Math.round(value * k) / k;
}

export function YawDegFromTo(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  if (Math.abs(dx) < 1e-9 && Math.abs(dz) < 1e-9) return 0;
  return WrapDeg(Math.atan2(-dx, -dz) * 180 / Math.PI);
}

export function ForwardFromYawDeg(yawDeg) {
  const r = yawDeg * Math.PI / 180;
  return { x: -Math.sin(r), z: -Math.cos(r) };
}

/** 两个 yaw 之间按最短方向插值。 */
export function LerpYawDeg(a, b, t) {
  return WrapDeg(a + WrapDeg(b - a) * t);
}

export function PathLength(points) {
  if (!Array.isArray(points)) return 0;
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  return length;
}

/** 沿折线走 distanceM 米后的位置与行进朝向；超出终点停在终点。 */
export function SamplePath(points, distanceM) {
  if (!Array.isArray(points) || points.length === 0) return { x: 0, z: 0, headingYawDeg: 0, done: true };
  if (points.length === 1) return { x: points[0].x, z: points[0].z, headingYawDeg: 0, done: true };
  let left = Math.max(0, distanceM);
  let heading = YawDegFromTo(points[0], points[1]);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const seg = Math.hypot(b.x - a.x, b.z - a.z);
    if (seg > 1e-9) heading = YawDegFromTo(a, b);
    if (left <= seg) {
      const t = seg > 1e-9 ? left / seg : 1;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, headingYawDeg: heading, done: false };
    }
    left -= seg;
  }
  const last = points[points.length - 1];
  return { x: last.x, z: last.z, headingYawDeg: heading, done: true };
}

/** §5.3 缺省射界。mode："default" 只给机枪与战车；"all" 再给举枪的步枪；"off" 一律无。 */
export function DefaultArc(unit, mode = "default") {
  if (mode === "off" || !unit) return null;
  if (unit.kind === "tank") return { halfDeg: 20, rangeM: 90 };
  if (BLOCKOUT_MG_WEAPONS.includes(unit.weapon)) return { halfDeg: 25, rangeM: 70 };
  if (mode === "all" && unit.aim && unit.weapon && !NO_WEAPON_KINDS.has(unit.kind)) return { halfDeg: 30, rangeM: 45 };
  return null;
}

function DefaultWeapon(side, kind) {
  if (NO_WEAPON_KINDS.has(kind) || side === "civ") return null;
  if (side === "ija") return "Type38";
  if (side === "nra") return "HanYang";
  return null;
}

function DefaultSpeed(unit) {
  if (unit.kind === "litter") return BLOCKOUT_DEFAULT_SPEED.litter;
  if (unit.kind === "tank") return BLOCKOUT_DEFAULT_SPEED.tank;
  return BLOCKOUT_DEFAULT_SPEED[unit.side] ?? BLOCKOUT_DEFAULT_SPEED.nra;
}

// ---------------------------------------------------------------------------
// 校验

function CheckPoints(errors, at, value) {
  if (value === undefined) return;
  if (!Array.isArray(value)) { errors.push(`${at} 要是 {x,z} 数组`); return; }
  value.forEach((p, i) => { if (!IsPoint(p)) errors.push(`${at}[${i}] 要带有限的 x / z`); });
}

function CheckYaw(errors, at, value) {
  if (Finite(value.yawDeg)) return;
  if (value.yawDeg !== undefined) errors.push(`${at}.yawDeg 要是有限数字`);
  if (value.faceTo !== undefined && !IsPoint(value.faceTo)) errors.push(`${at}.faceTo 要带有限的 x / z`);
}

function CheckUnit(errors, warnings, at, unit) {
  if (!IsObject(unit)) { errors.push(`${at} 要是对象`); return; }
  if (typeof unit.id !== "string" || !unit.id) errors.push(`${at}.id 要是非空字符串`);
  if (!BLOCKOUT_SIDES.includes(unit.side)) errors.push(`${at}.side 要是 ${BLOCKOUT_SIDES.join(" / ")}，现在是 ${Echo(unit.side)}`);
  if (unit.kind !== undefined && !BLOCKOUT_KINDS.includes(unit.kind)) errors.push(`${at}.kind 不认识：${Echo(unit.kind)}`);
  if (!Finite(unit.x) || !Finite(unit.z)) errors.push(`${at} 要带有限的 x / z`);
  CheckYaw(errors, at, unit);
  if (unit.stance !== undefined && !BLOCKOUT_STANCES.includes(unit.stance)) errors.push(`${at}.stance 要是 ${BLOCKOUT_STANCES.join(" / ")}`);
  if (unit.state !== undefined && !["alive", "down"].includes(unit.state)) errors.push(`${at}.state 要是 alive / down`);
  if (unit.arc !== undefined && unit.arc !== null) {
    if (!IsObject(unit.arc) || !Finite(unit.arc.halfDeg) || !Finite(unit.arc.rangeM)) errors.push(`${at}.arc 要带有限的 halfDeg / rangeM`);
    else if (unit.arc.halfDeg <= 0 || unit.arc.halfDeg > 180 || unit.arc.rangeM <= 0) errors.push(`${at}.arc 的 halfDeg 要在 (0,180]、rangeM 要大于 0`);
  }
  if (unit.speedMps !== undefined && (!Finite(unit.speedMps) || unit.speedMps <= 0)) errors.push(`${at}.speedMps 要是正数`);
  CheckPoints(errors, `${at}.path`, unit.path);
  CheckPoints(errors, `${at}.intent`, unit.intent);
  if (unit.name !== undefined && typeof unit.name !== "string") errors.push(`${at}.name 要是字符串`);
  if (unit.castId !== undefined && (typeof unit.castId !== "string" || !/^[A-Za-z][A-Za-z0-9]*$/.test(unit.castId))) errors.push(`${at}.castId 要是定妆角色 id（字母开头的字母数字）`);
  if (unit.guess !== undefined && typeof unit.guess !== "boolean") warnings.push(`${at}.guess 应当是 true / false`);
  if (unit.bearers !== undefined && !(Number.isInteger(unit.bearers) && unit.bearers >= 0 && unit.bearers <= 2)) errors.push(`${at}.bearers 要是 0–2 的整数`);
  if (unit.lie !== undefined && !BLOCKOUT_LIE_MODES.includes(unit.lie)) errors.push(`${at}.lie 要是 ${BLOCKOUT_LIE_MODES.join(" / ")}（不写 = 演员倒地姿态原样）`);
}

function CheckKeyframe(errors, warnings, at, kf) {
  if (!IsObject(kf)) { errors.push(`${at} 要是对象`); return; }
  if (typeof kf.id !== "string" || !BLOCKOUT_KEYFRAME_ID_RE.test(kf.id)) errors.push(`${at}.id 要匹配 ${BLOCKOUT_KEYFRAME_ID_RE}`);
  if (!Number.isInteger(kf.stage) || kf.stage < 1 || kf.stage > 99) errors.push(`${at}.stage 要是 1–99 的整数`);
  if (typeof kf.name !== "string" || !kf.name) errors.push(`${at}.name 要是非空字符串`);
  if (kf.stageTitle !== undefined && typeof kf.stageTitle !== "string") errors.push(`${at}.stageTitle 要是字符串`);
  if (kf.stageLabel !== undefined && (typeof kf.stageLabel !== "string" || !kf.stageLabel || kf.stageLabel.length > BLOCKOUT_STAGE_LABEL_MAX)) errors.push(`${at}.stageLabel 要是 1–${BLOCKOUT_STAGE_LABEL_MAX} 个字的字符串`);
  if (!IsObject(kf.player) || !Finite(kf.player.x) || !Finite(kf.player.z)) errors.push(`${at}.player 要带有限的 x / z`);
  else {
    CheckYaw(errors, `${at}.player`, kf.player);
    if (kf.player.pitchDeg !== undefined && !Finite(kf.player.pitchDeg)) errors.push(`${at}.player.pitchDeg 要是有限数字`);
    if (kf.player.stance !== undefined && !BLOCKOUT_STANCES.includes(kf.player.stance)) errors.push(`${at}.player.stance 要是 ${BLOCKOUT_STANCES.join(" / ")}`);
  }
  if (kf.what !== undefined && typeof kf.what !== "string") errors.push(`${at}.what 要是字符串`);
  else if (typeof kf.what === "string" && kf.what.length > BLOCKOUT_TEXT_LIMITS.what) warnings.push(`${at}.what 有 ${kf.what.length} 字，超过 ${BLOCKOUT_TEXT_LIMITS.what}`);
  if (kf.next !== undefined && kf.next !== null) {
    if (!IsObject(kf.next) || typeof kf.next.text !== "string") errors.push(`${at}.next 要带 text`);
    else {
      if (kf.next.text.length > BLOCKOUT_TEXT_LIMITS.next) warnings.push(`${at}.next.text 有 ${kf.next.text.length} 字，超过 ${BLOCKOUT_TEXT_LIMITS.next}`);
      const hasX = kf.next.x !== undefined;
      const hasZ = kf.next.z !== undefined;
      if (hasX || hasZ) { if (!Finite(kf.next.x) || !Finite(kf.next.z)) errors.push(`${at}.next 的 x / z 要同时是有限数字`); }
      if (kf.next.radiusM !== undefined && !(Finite(kf.next.radiusM) && kf.next.radiusM >= 0)) errors.push(`${at}.next.radiusM 要是非负数`);
    }
  }
  if (kf.how !== undefined && (!Array.isArray(kf.how) || kf.how.some(item => typeof item !== "string"))) errors.push(`${at}.how 要是字符串数组`);
  if (kf.notes !== undefined && typeof kf.notes !== "string") errors.push(`${at}.notes 要是字符串`);
  if (kf.signals !== undefined && (!Array.isArray(kf.signals) || kf.signals.some(item => typeof item !== "string" || !item))) errors.push(`${at}.signals 要是非空字符串数组`);
  if (kf.units !== undefined) {
    if (!Array.isArray(kf.units)) errors.push(`${at}.units 要是数组`);
    else {
      const seen = new Set();
      kf.units.forEach((unit, i) => {
        CheckUnit(errors, warnings, `${at}.units[${i}]`, unit);
        if (unit && typeof unit.id === "string") {
          if (seen.has(unit.id)) errors.push(`${at}.units[${i}].id 重复：${unit.id}`);
          seen.add(unit.id);
        }
      });
    }
  }
  if (kf.pois !== undefined) {
    if (!Array.isArray(kf.pois)) errors.push(`${at}.pois 要是数组`);
    else kf.pois.forEach((poi, i) => {
      const pat = `${at}.pois[${i}]`;
      if (!IsObject(poi)) { errors.push(`${pat} 要是对象`); return; }
      if (typeof poi.id !== "string" || !poi.id) errors.push(`${pat}.id 要是非空字符串`);
      if (typeof poi.name !== "string") errors.push(`${pat}.name 要是字符串`);
      if (poi.kind !== undefined && !BLOCKOUT_POI_KINDS.includes(poi.kind)) errors.push(`${pat}.kind 要是 ${BLOCKOUT_POI_KINDS.join(" / ")}`);
      if (!Finite(poi.x) || !Finite(poi.z)) errors.push(`${pat} 要带有限的 x / z`);
      if (poi.radiusM !== undefined && !(Finite(poi.radiusM) && poi.radiusM >= 0)) errors.push(`${pat}.radiusM 要是非负数`);
    });
  }
}

/** 配置文件校验。错误 = 编辑器不能按它摆；警告 = 能摆但值得看一眼。 */
export function ValidateBlockout(doc) {
  const errors = [];
  const warnings = [];
  if (!IsObject(doc)) return { ok: false, errors: ["配置要是一个 JSON 对象"], warnings };
  if (doc.schema !== BLOCKOUT_SCHEMA) errors.push(`schema 要是 ${JSON.stringify(BLOCKOUT_SCHEMA)}，现在是 ${Echo(doc.schema)}`);
  if (typeof doc.level !== "string" || !BLOCKOUT_LEVEL_RE.test(doc.level)) errors.push("level 要匹配 /^[A-Za-z0-9]+$/");
  if (doc.title !== undefined && typeof doc.title !== "string") errors.push("title 要是字符串");
  if (doc.zones !== undefined) {
    if (!Array.isArray(doc.zones)) errors.push("zones 要是数组");
    else doc.zones.forEach((zone, i) => {
      if (!IsObject(zone) || typeof zone.id !== "string" || typeof zone.name !== "string") errors.push(`zones[${i}] 要带 id / name`);
      else if (zone.box !== undefined && !(IsObject(zone.box) && ["minX", "maxX", "minZ", "maxZ"].every(k => Finite(zone.box[k])))) errors.push(`zones[${i}].box 要带有限的 minX / maxX / minZ / maxZ`);
    });
  }
  if (!Array.isArray(doc.keyframes) || doc.keyframes.length === 0) errors.push("keyframes 要是非空数组");
  else {
    const ids = new Set();
    doc.keyframes.forEach((kf, i) => {
      CheckKeyframe(errors, warnings, `keyframes[${i}]`, kf);
      if (kf && typeof kf.id === "string") {
        if (ids.has(kf.id)) errors.push(`keyframes[${i}].id 重复：${kf.id}`);
        ids.add(kf.id);
      }
    });
    for (let i = 1; i < doc.keyframes.length; i++) {
      const a = doc.keyframes[i - 1];
      const b = doc.keyframes[i];
      if (Number.isInteger(a?.stage) && Number.isInteger(b?.stage) && b.stage < a.stage) warnings.push(`keyframes[${i}] 的阶段号 ${b.stage} 比前一个 ${a.stage} 小（导航栏按顺序分段）`);
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}

/** 场景文件（§2.2）校验。 */
export function ValidateBlockoutScene(doc) {
  const errors = [];
  const warnings = [];
  if (!IsObject(doc)) return { ok: false, errors: ["场景要是一个 JSON 对象"], warnings };
  if (doc.schema !== BLOCKOUT_SCENE_SCHEMA) errors.push(`schema 要是 ${JSON.stringify(BLOCKOUT_SCENE_SCHEMA)}`);
  if (typeof doc.level !== "string" || !BLOCKOUT_LEVEL_RE.test(doc.level)) errors.push("level 要匹配 /^[A-Za-z0-9]+$/");
  const b = doc.bounds;
  if (!IsObject(b) || !["minX", "maxX", "minZ", "maxZ"].every(k => Finite(b[k])) || b.maxX <= b.minX || b.maxZ <= b.minZ) errors.push("bounds 要带有限且 max > min 的 minX / maxX / minZ / maxZ");
  if (!IsObject(doc.spawn) || !Finite(doc.spawn.x) || !Finite(doc.spawn.z)) errors.push("spawn 要带有限的 x / z");
  const t = doc.terrain;
  if (!IsObject(t) || t.kind !== "heightmap") errors.push('terrain.kind 要是 "heightmap"');
  else {
    if (t.encoding !== "int16-cm-base64") errors.push('terrain.encoding 要是 "int16-cm-base64"');
    if (!Finite(t.minX) || !Finite(t.minZ) || !(Finite(t.cellM) && t.cellM > 0)) errors.push("terrain 要带有限的 minX / minZ 与正的 cellM");
    if (!Number.isInteger(t.cols) || !Number.isInteger(t.rows) || t.cols < 1 || t.rows < 1) errors.push("terrain.cols / rows 要是正整数");
    if (typeof t.data !== "string") errors.push("terrain.data 要是 base64 字符串");
    else if (Number.isInteger(t.cols) && Number.isInteger(t.rows)) {
      const expectBytes = (t.cols + 1) * (t.rows + 1) * 2;
      const padding = t.data.endsWith("==") ? 2 : t.data.endsWith("=") ? 1 : 0;
      const bytes = Math.floor(t.data.length * 3 / 4) - padding;
      if (bytes !== expectBytes) errors.push(`terrain.data 应当是 ${expectBytes} 字节（(cols+1)×(rows+1) 个 int16），现在约 ${bytes}`);
    }
  }
  const ids = new Set();
  const CheckBlock = (block, at) => {
    if (!IsObject(block)) { errors.push(`${at} 要是对象`); return false; }
    if (typeof block.id !== "string" || !block.id) errors.push(`${at}.id 要是非空字符串`);
    else if (ids.has(block.id)) errors.push(`${at}.id 重复：${block.id}`);
    else ids.add(block.id);
    for (const k of ["x", "z", "w", "d", "h"]) if (!Finite(block[k])) errors.push(`${at}.${k} 要是有限数字`);
    if ((Finite(block.w) && block.w <= 0) || (Finite(block.d) && block.d <= 0) || (Finite(block.h) && block.h <= 0)) errors.push(`${at} 的 w / d / h 要大于 0`);
    if (block.ry !== undefined && !Finite(block.ry)) errors.push(`${at}.ry 要是有限数字（弧度）`);
    if (typeof block.semantic !== "string" || !block.semantic) errors.push(`${at}.semantic 要是非空字符串`);
    return true;
  };
  if (!Array.isArray(doc.blocks)) errors.push("blocks 要是数组");
  else doc.blocks.forEach((block, i) => CheckBlock(block, `blocks[${i}]`));
  // 可选 gates（§2.2，2026-10-18）：随场景信号出现 / 消失的体块。signal = 信号到了就消失；appearSignal = 信号到了才出现。
  if (doc.gates !== undefined) {
    if (!Array.isArray(doc.gates)) errors.push("gates 要是数组");
    else doc.gates.forEach((gate, i) => {
      const at = `gates[${i}]`;
      if (!CheckBlock(gate, at)) return;
      const hasSignal = typeof gate.signal === "string" && !!gate.signal;
      const hasAppear = typeof gate.appearSignal === "string" && !!gate.appearSignal;
      if (gate.signal !== undefined && !hasSignal) errors.push(`${at}.signal 要是非空字符串`);
      if (gate.appearSignal !== undefined && !hasAppear) errors.push(`${at}.appearSignal 要是非空字符串`);
      if (!hasSignal && !hasAppear) errors.push(`${at} 要带 signal（到了就消失）或 appearSignal（到了才出现）`);
    });
  }
  return { ok: errors.length === 0, errors, warnings };
}

// ---------------------------------------------------------------------------
// 归一化

function NormalizeYawFrom(source, from) {
  if (Finite(source.yawDeg)) return WrapDeg(source.yawDeg);
  if (IsPoint(source.faceTo) && from) return YawDegFromTo(from, source.faceTo);
  return 0;
}

function NormalizePoints(points) {
  return Array.isArray(points) ? points.filter(IsPoint).map(p => ({ x: p.x, z: p.z })) : [];
}

function NormalizeUnit(raw, arcMode) {
  const unit = Clone(raw);
  unit.kind = BLOCKOUT_KINDS.includes(unit.kind) ? unit.kind : "soldier";
  unit.stance = BLOCKOUT_STANCES.includes(unit.stance) ? unit.stance : "stand";
  unit.state = unit.state === "down" ? "down" : "alive";
  unit.aim = !!unit.aim;
  unit.guess = !!unit.guess;
  unit.name = typeof unit.name === "string" ? unit.name : "";
  // 担架：bearers 是抬担架的人数（缺省 2）；0 = 担架放在地上 / 床边，没人抬。state:"down" 只表示抬担架的人倒了。
  if (unit.kind === "litter") unit.bearers = Number.isInteger(unit.bearers) && unit.bearers >= 0 && unit.bearers <= 2 ? unit.bearers : 2;
  else delete unit.bearers;
  if (unit.weapon === undefined) unit.weapon = DefaultWeapon(unit.side, unit.kind);
  // lie 只认 "along"；没写或写错都去掉（= 原来的倒地样子，已有数据不变）
  if (!BLOCKOUT_LIE_MODES.includes(unit.lie)) delete unit.lie;
  unit.yawDeg = NormalizeYawFrom(unit, unit);
  delete unit.faceTo;
  unit.speedMps = Finite(unit.speedMps) && unit.speedMps > 0 ? unit.speedMps : DefaultSpeed(unit);
  unit.path = NormalizePoints(unit.path);
  unit.intent = NormalizePoints(unit.intent);
  unit.intentAuto = false;
  if (IsObject(unit.arc) && Finite(unit.arc.halfDeg) && Finite(unit.arc.rangeM)) {
    unit.arc = { halfDeg: unit.arc.halfDeg, rangeM: unit.arc.rangeM, yawDeg: Finite(unit.arc.yawDeg) ? WrapDeg(unit.arc.yawDeg) : unit.yawDeg, source: "data" };
  } else {
    const arc = DefaultArc(unit, arcMode);
    unit.arc = arc ? { ...arc, yawDeg: unit.yawDeg, source: "default" } : null;
  }
  return unit;
}

/**
 * 深拷贝并补齐缺省值。不改入参。
 * @param {object} doc 已通过 ValidateBlockout 的配置（未通过时尽力而为，坏单位跳过）
 * @param {{arcMode?: "default"|"all"|"off"}} [options]
 */
export function NormalizeBlockout(doc, { arcMode = "default" } = {}) {
  const out = Clone(doc) || {};
  out.title = typeof out.title === "string" ? out.title : (out.level || "");
  out.zones = Array.isArray(out.zones) ? out.zones : [];
  out.keyframes = (Array.isArray(out.keyframes) ? out.keyframes : []).filter(IsObject).map((kf, index) => {
    const player = IsObject(kf.player) ? kf.player : { x: 0, z: 0 };
    const next = IsObject(kf.next) && typeof kf.next.text === "string" ? {
      text: kf.next.text,
      ...(Finite(kf.next.x) && Finite(kf.next.z) ? { x: kf.next.x, z: kf.next.z } : {}),
      radiusM: Finite(kf.next.radiusM) ? kf.next.radiusM : 3,
    } : null;
    return {
      ...kf,
      index,
      stageTitle: typeof kf.stageTitle === "string" ? kf.stageTitle : "",
      stageLabel: typeof kf.stageLabel === "string" && kf.stageLabel ? kf.stageLabel : "",
      what: typeof kf.what === "string" ? kf.what : "",
      notes: typeof kf.notes === "string" ? kf.notes : "",
      how: Array.isArray(kf.how) ? kf.how.filter(item => typeof item === "string") : [],
      signals: Array.isArray(kf.signals) ? kf.signals.filter(item => typeof item === "string" && item) : [],
      player: {
        x: player.x, z: player.z,
        yawDeg: NormalizeYawFrom(player, player),
        pitchDeg: Finite(player.pitchDeg) ? player.pitchDeg : 0,
        stance: BLOCKOUT_STANCES.includes(player.stance) ? player.stance : "stand",
      },
      next,
      units: (Array.isArray(kf.units) ? kf.units : [])
        .filter(u => IsObject(u) && typeof u.id === "string" && BLOCKOUT_SIDES.includes(u.side) && Finite(u.x) && Finite(u.z))
        .map(u => NormalizeUnit(u, arcMode)),
      pois: (Array.isArray(kf.pois) ? kf.pois : [])
        .filter(p => IsObject(p) && typeof p.id === "string" && Finite(p.x) && Finite(p.z))
        .map(p => ({ ...p, name: typeof p.name === "string" ? p.name : "", kind: BLOCKOUT_POI_KINDS.includes(p.kind) ? p.kind : "poi", radiusM: Finite(p.radiusM) ? p.radiusM : 2 })),
    };
  });
  // 自动去向：数据没写 intent、而下一关键帧里这个人换了位置 → 取下一关键帧的 path（含终点）或直线。
  for (let i = 0; i + 1 < out.keyframes.length; i++) {
    const nextById = new Map(out.keyframes[i + 1].units.map(u => [u.id, u]));
    for (const unit of out.keyframes[i].units) {
      if (unit.intent.length) continue;
      const later = nextById.get(unit.id);
      if (!later || Math.hypot(later.x - unit.x, later.z - unit.z) <= 0.5) continue;
      const route = later.path.length ? later.path.slice() : [];
      const end = route[route.length - 1];
      if (!end || Math.hypot(end.x - later.x, end.z - later.z) > 1e-6) route.push({ x: later.x, z: later.z });
      unit.intent = route;
      unit.intentAuto = true;
    }
  }
  return out;
}

export function KeyframeIndex(doc, idOrIndex) {
  const list = doc?.keyframes || [];
  if (typeof idOrIndex === "number" && Number.isInteger(idOrIndex)) return idOrIndex >= 0 && idOrIndex < list.length ? idOrIndex : -1;
  if (typeof idOrIndex === "string") {
    const index = list.findIndex(kf => kf.id === idOrIndex);
    if (index >= 0) return index;
    if (/^\d+$/.test(idOrIndex)) return KeyframeIndex(doc, Number(idOrIndex));
  }
  return -1;
}

// ---------------------------------------------------------------------------
// 过渡（§5.2）

function Route(from, via, to) {
  const out = [{ x: from.x, z: from.z }];
  for (const p of via || []) {
    const last = out[out.length - 1];
    if (Math.hypot(p.x - last.x, p.z - last.z) > 1e-6) out.push({ x: p.x, z: p.z });
  }
  if (to) {
    const last = out[out.length - 1];
    if (Math.hypot(to.x - last.x, to.z - last.z) > 1e-6) out.push({ x: to.x, z: to.z });
  }
  return out;
}

// 每个人按自己的自然速度走（走得太快脚会打滑、看着像冲刺）；只有很短的挪动拉长到 minS。
// 整段太长时不提速，而是整段「快进」：见 PlanTransition 的 playbackRate。
function Timing(length, speed, limits) {
  if (length <= limits.stayEpsM) return { durationS: 0, speedMps: speed };
  let durationS = length / speed;
  if (durationS < limits.minS) durationS = limits.minS;
  return { durationS, speedMps: length / durationS };
}

/**
 * 从 prevKf 过渡到 nextKf 的计划。两者都应是 NormalizeBlockout 之后的关键帧。
 * 所有单位同时起步（startS = 0）；durationS = 最慢的那个（计划时间，按自然速度）。
 * playbackRate ≥ 1：整段超过 maxS 时按比例快进，消费方每帧用 dt × playbackRate 推进计划时间，
 * 演员动画也用同一个倍率，看起来是「快进」而不是所有人在冲刺。
 */
export function PlanTransition(prevKf, nextKf, options = {}) {
  const limits = { ...BLOCKOUT_TRANSITION, ...options };
  const prev = new Map((prevKf?.units || []).map(u => [u.id, u]));
  const next = new Map((nextKf?.units || []).map(u => [u.id, u]));
  const units = [];
  for (const [id, to] of next) {
    const from = prev.get(id);
    if (from) {
      const route = Route(from, to.path, to);
      const length = PathLength(route);
      const { durationS, speedMps } = Timing(length, to.speedMps || DefaultSpeed(to), limits);
      units.push({
        id, mode: durationS > 0 ? "move" : "stay", route, length, speedMps, startS: 0, endS: durationS,
        from: { x: from.x, z: from.z, yawDeg: from.yawDeg, stance: from.stance },
        to: { x: to.x, z: to.z, yawDeg: to.yawDeg, stance: to.stance },
        unitFrom: from, unitTo: to,
      });
    } else if (to.path.length) {
      const route = Route(to.path[0], to.path.slice(1), to);
      const length = PathLength(route);
      const { durationS, speedMps } = Timing(length, to.speedMps || DefaultSpeed(to), limits);
      units.push({
        id, mode: "appear", walkIn: true, route, length, speedMps, startS: 0, endS: durationS,
        from: { x: route[0].x, z: route[0].z, yawDeg: route.length > 1 ? YawDegFromTo(route[0], route[1]) : to.yawDeg, stance: to.stance },
        to: { x: to.x, z: to.z, yawDeg: to.yawDeg, stance: to.stance },
        unitFrom: null, unitTo: to,
      });
    } else {
      units.push({
        id, mode: "appear", walkIn: false, route: [{ x: to.x, z: to.z }], length: 0, speedMps: 0, startS: 0, endS: 0,
        from: { x: to.x, z: to.z, yawDeg: to.yawDeg, stance: to.stance },
        to: { x: to.x, z: to.z, yawDeg: to.yawDeg, stance: to.stance },
        unitFrom: null, unitTo: to,
      });
    }
  }
  for (const [id, from] of prev) {
    if (next.has(id)) continue;
    if (from.intent.length && !from.intentAuto) {
      const route = Route(from, from.intent, null);
      const length = PathLength(route);
      const { durationS, speedMps } = Timing(length, from.speedMps || DefaultSpeed(from), limits);
      const end = route[route.length - 1];
      units.push({
        id, mode: "vanish", walkOut: true, route, length, speedMps, startS: 0, endS: durationS,
        from: { x: from.x, z: from.z, yawDeg: from.yawDeg, stance: from.stance },
        to: { x: end.x, z: end.z, yawDeg: route.length > 1 ? YawDegFromTo(route[route.length - 2], end) : from.yawDeg, stance: from.stance },
        unitFrom: from, unitTo: null,
      });
    } else {
      units.push({
        id, mode: "vanish", walkOut: false, route: [{ x: from.x, z: from.z }], length: 0, speedMps: 0, startS: 0, endS: 0,
        from: { x: from.x, z: from.z, yawDeg: from.yawDeg, stance: from.stance },
        to: { x: from.x, z: from.z, yawDeg: from.yawDeg, stance: from.stance },
        unitFrom: from, unitTo: null,
      });
    }
  }
  const durationS = units.reduce((max, u) => Math.max(max, u.endS), 0);
  const playbackRate = durationS > limits.maxS ? durationS / limits.maxS : 1;
  return { durationS, playbackRate, wallS: durationS / playbackRate, units };
}

/**
 * 计划里某个单位在 t 秒时的状态。
 * @returns {{id, x, z, yawDeg, stance, moving, visible, speedMps, done}}
 */
export function SampleTransitionUnit(entry, t, { turnS = BLOCKOUT_TRANSITION.turnS } = {}) {
  const span = entry.endS - entry.startS;
  const local = Math.min(Math.max(t - entry.startS, 0), Math.max(span, 0));
  const done = t >= entry.endS;
  let visible = true;
  if (entry.mode === "vanish" && done) visible = false;
  if (entry.mode === "stay" || span <= 0) {
    const state = entry.mode === "vanish" ? entry.from : entry.to;
    return { id: entry.id, x: state.x, z: state.z, yawDeg: state.yawDeg, stance: state.stance, moving: false, visible, speedMps: 0, done: true };
  }
  const travelled = span > 0 ? entry.length * (local / span) : entry.length;
  const at = SamplePath(entry.route, travelled);
  const remaining = entry.endS - Math.max(t, entry.startS);
  let yawDeg = at.headingYawDeg;
  if (done) yawDeg = entry.to.yawDeg;
  else if (remaining < turnS && entry.mode !== "vanish") yawDeg = LerpYawDeg(at.headingYawDeg, entry.to.yawDeg, 1 - remaining / turnS);
  // 目标姿态是蹲 / 卧：蹲着走；从蹲 / 卧起身走：站着走。到达时切到目标姿态。
  const stance = done ? entry.to.stance : (entry.to.stance === "stand" ? "stand" : "crouch");
  return { id: entry.id, x: Round(at.x, 4), z: Round(at.z, 4), yawDeg, stance, moving: !done, visible, speedMps: done ? 0 : entry.speedMps, done };
}

/** 整个计划在 t 秒时的全部单位状态（按计划顺序）。 */
export function SampleTransition(plan, t, options) {
  return plan.units.map(entry => SampleTransitionUnit(entry, t, options));
}
