// 白盒关卡编辑器的配置格式（docs/Data_EditorBlockout.md §3、§5.2、§5.3）。
//
// 纯模块：node 与浏览器共用，scripts/Script_LocalPreview.mjs 启动时也会 import 它，
// 所以**导入时不得抛错、不得碰 DOM / three / window**。
//
// 朝向一律 yawDeg：0 = 朝北（−Z），+90 = 朝西，−90 = 朝东；前方 = (−sin, −cos)，
// 与玩家 / 演员 rotation.y 同号（rotation.y = yawDeg·π/180）。

export const BLOCKOUT_SCHEMA = "tengxian-blockout/1";
export const BLOCKOUT_SCENE_SCHEMA = "tengxian-blockout-scene/1";
/** 场景文件 paint（地面涂色，§2.2）最多几项。 */
export const BLOCKOUT_PAINT_MAX_ITEMS = 5000;
/**
 * 场景文件 backdrop（远景层，§2.2，2026-10-20）的上限与种类：只看不走的远处地面、田块、路、村子、山包。
 * shapes 的 kind：box（房墙 / 屋顶 / 院墙）、blob（一团树冠）、hill（低山包）、tree（编辑器的枯树模型，同场地里的树）。
 */
export const BLOCKOUT_BACKDROP = Object.freeze({
  shapeKinds: Object.freeze(["box", "blob", "hill", "tree"]),
  maxShapes: 8000, maxPaint: 2000, maxRects: 40000, maxPalette: 64,
  farMin: 100, farMax: 20000, radiusMax: 20000, blendMax: 2000,
});
/**
 * 场景文件 landmarks（地标，§2.2，2026-10-20）：白盒灰里看不清的「特殊地方」——洞口 / 缝（hole）、门（door）、窗（window）、
 * 坑 / 窖（pit）、片区（area，给半径或宽深）、物件（prop）、地名（place）。编辑器把它们画成亮色线框 + 光柱 + 头顶标签（§5.5）。
 * 每项 { id, name, kind, x, z, y?, w?, d?, h?, ry?, radiusM?, note? }：y 是中心高度（米，不写就落地）；w / d / h 给了就画贴着它的线框；
 * radiusM 画地环（片区）；note 是标签上的一行小字。
 */
export const BLOCKOUT_LANDMARK_KINDS = Object.freeze(["hole", "door", "window", "pit", "area", "prop", "place"]);
export const BLOCKOUT_LANDMARK_LIMITS = Object.freeze({ maxItems: 400, nameMax: 24, noteMax: 60, sizeMax: 2000 });
export const BLOCKOUT_LEVEL_KEYS = Object.freeze(["FirstLevel", "SecondLevel", "FirstLevel0105", "FirstLevel0610", "FirstLevel1218"]);
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
/** 百姓 / 小孩的身体（§3 可选 body，2026-10-19）："rig" = 能放动作片段的骨骼占位身体（缺省）；"procedural" = 旧的程序化 tzm 身体。 */
export const BLOCKOUT_BODY_MODES = Object.freeze(["rig", "procedural"]);
/**
 * 挂到车上（§3 可选 ride，2026-10-20）：能被人 / 担架挂上去的单位种类（车、战车、担架）。
 * ride = { on: "<那个单位的 id>", x, z（车本地米，+x 右、−z 前）, y（演员根离车底下地面多高）, yawDeg（相对车头） }，null = 下车。
 */
export const BLOCKOUT_RIDE_CARRIER_KINDS = Object.freeze(["cart", "tank", "litter"]);

/** ride 的毛病清单（空数组 = 合法）。at 是报错路径前缀（如 keyframes[3].units[2].ride）。null / undefined 不算错（= 不挂）。 */
export function RideIssues(ride, at = "ride") {
  if (ride === undefined || ride === null) return [];
  if (!IsObject(ride)) return [`${at} 要是 { on, x?, z?, y?, yawDeg? } 或 null`];
  const out = [];
  if (typeof ride.on !== "string" || !ride.on) out.push(`${at}.on 要是车 / 战车 / 担架的单位 id`);
  for (const k of ["x", "z", "y", "yawDeg"]) if (ride[k] !== undefined && !Finite(ride[k])) out.push(`${at}.${k} 要是有限数字`);
  return out;
}

/** ride 归一化：{ on, x, z, y, yawDeg }（缺的补 0），不合法 / null → null。 */
export function NormalizeRide(ride) {
  if (!IsObject(ride) || typeof ride.on !== "string" || !ride.on) return null;
  const n = (v) => (Finite(v) ? v : 0);
  return { on: ride.on, x: n(ride.x), z: n(ride.z), y: n(ride.y), yawDeg: WrapDeg(n(ride.yawDeg)) };
}

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
  if (unit.draft !== undefined && !["ox", "horse"].includes(unit.draft)) errors.push(`${at}.draft 要是 "ox" 或 "horse"`);
  if (unit.lie !== undefined && !BLOCKOUT_LIE_MODES.includes(unit.lie)) errors.push(`${at}.lie 要是 ${BLOCKOUT_LIE_MODES.join(" / ")}（不写 = 演员倒地姿态原样）`);
  if (unit.body !== undefined && !BLOCKOUT_BODY_MODES.includes(unit.body)) errors.push(`${at}.body 要是 ${BLOCKOUT_BODY_MODES.join(" / ")}（百姓 / 小孩的身体：骨骼占位 / 旧的程序化；不写 = rig）`);
  // ride（2026-10-20）：挂到车 / 战车 / 担架上；对方要在同一帧里（CheckKeyframe 核对）
  errors.push(...RideIssues(unit.ride, `${at}.ride`));
  if (IsObject(unit.ride) && unit.ride.on === unit.id) errors.push(`${at}.ride.on 不能是自己`);
  if (IsObject(unit.ride) && unit.ride.on && BLOCKOUT_RIDE_CARRIER_KINDS.includes(unit.kind) && unit.kind !== "litter") errors.push(`${at}.ride：${unit.kind} 不能挂到别的单位上（只有人和担架能挂）`);
  if (IsObject(unit.ride) && unit.ride.on && unit.kind === "litter" && Number.isInteger(unit.bearers) && unit.bearers > 0) warnings.push(`${at} 挂在车上的担架 bearers 应当是 0（抬担架的人会悬在车边）`);
}

/** 同一帧里 ride.on 指的单位要存在、是车 / 战车 / 担架、自己没再挂到别人身上（不许链）。 */
function CheckRideTargets(errors, at, units) {
  const byId = new Map();
  for (const u of units) if (IsObject(u) && typeof u.id === "string") byId.set(u.id, u);
  units.forEach((u, i) => {
    if (!IsObject(u) || !IsObject(u.ride) || typeof u.ride.on !== "string" || !u.ride.on || u.ride.on === u.id) return;
    const carrier = byId.get(u.ride.on);
    if (!carrier) { errors.push(`${at}.units[${i}].ride.on 在这一帧里找不到：${u.ride.on}`); return; }
    const kind = BLOCKOUT_KINDS.includes(carrier.kind) ? carrier.kind : "soldier";
    if (!BLOCKOUT_RIDE_CARRIER_KINDS.includes(kind)) errors.push(`${at}.units[${i}].ride.on 指的 ${u.ride.on} 是 ${kind}，只能挂到 ${BLOCKOUT_RIDE_CARRIER_KINDS.join(" / ")} 上`);
    if (IsObject(carrier.ride) && carrier.ride.on) errors.push(`${at}.units[${i}].ride.on 指的 ${u.ride.on} 自己也挂在别的单位上（不许一层层挂）`);
  });
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
      CheckRideTargets(errors, at, kf.units);
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
    // 2026-10-21：可选 tag（"airWall" = 只挡玩家的隐形墙）、noClimb（不能攀）
    if (block.tag !== undefined && (typeof block.tag !== "string" || !block.tag)) errors.push(`${at}.tag 要是非空字符串`);
    if (block.noClimb !== undefined && typeof block.noClimb !== "boolean") errors.push(`${at}.noClimb 要是 true / false`);
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
  // 可选 heightTint（§2.2，2026-10-20）：高度色带的上下限（米），不写 = 按网格最低 / 最高。
  if (doc.heightTint !== undefined) {
    const ht = doc.heightTint;
    if (!IsObject(ht) || !Finite(ht.lo) || !Finite(ht.hi) || ht.hi <= ht.lo) errors.push("heightTint 要是 { lo, hi }，有限数字且 hi > lo");
  }
  // 可选 colorSemantics（§2.2 / §6.3，2026-10-20）：这几种 semantic 的块在白盒画质里保留语义色（屋顶深灰、树冠暗绿），不刷成灰网格。
  if (doc.colorSemantics !== undefined) {
    if (!Array.isArray(doc.colorSemantics) || doc.colorSemantics.length > 16 || !doc.colorSemantics.every(v => typeof v === "string" && v)) errors.push("colorSemantics 要是至多 16 个非空字符串的数组");
  }
  // 可选 semanticColors（§2.2，2026-10-20）：这一关改几种 semantic 的块色，{ roof: "#3f3b36" }；不写 = 照第一关那张表。
  if (doc.semanticColors !== undefined) {
    const sc = doc.semanticColors;
    if (!IsObject(sc) || Object.keys(sc).length > 32 || !Object.entries(sc).every(([k, v]) => k && typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v))) errors.push('semanticColors 要是 { semantic: "#rrggbb" }（至多 32 项）');
  }
  // 可选 paint（§2.2，2026-10-20）：地面涂色。每项是多边形 poly 或折线 line + halfW，按顺序叠（后面的盖前面的）。
  if (doc.paint !== undefined) {
    if (!Array.isArray(doc.paint)) errors.push("paint 要是数组");
    else {
      if (doc.paint.length > BLOCKOUT_PAINT_MAX_ITEMS) errors.push(`paint 最多 ${BLOCKOUT_PAINT_MAX_ITEMS} 项，现在 ${doc.paint.length}`);
      const paintIds = new Set();
      doc.paint.forEach((item, i) => {
        const at = `paint[${i}]`;
        if (!IsObject(item)) { errors.push(`${at} 要是对象`); return; }
        if (typeof item.id !== "string" || !item.id) errors.push(`${at}.id 要是非空字符串`);
        else if (paintIds.has(item.id)) errors.push(`${at}.id 重复：${item.id}`);
        else paintIds.add(item.id);
        PaintItemIssues(item, at, errors);
      });
    }
  }
  // 可选 backdrop（§2.2，2026-10-20）：远景层，只看不走（不进碰撞、寻路、玩家能走的范围）
  if (doc.backdrop !== undefined) BackdropIssues(doc.backdrop, errors);
  // 可选 landmarks（§2.2，2026-10-20）：地标（狗洞、门、窖、片区、物件、地名），编辑器画亮色标记
  if (doc.landmarks !== undefined) LandmarkIssues(doc.landmarks, errors, "landmarks");
  return { ok: errors.length === 0, errors, warnings };
}

/**
 * 地标清单（§2.2 landmarks）的毛病：不是数组、超过上限、id 重复、name / kind / x / z 不合法、尺寸不是正数、note 太长。
 * 往 errors 里推中文信息（带路径）。单独导出给生成器与测试用。
 */
export function LandmarkIssues(list, errors, at = "landmarks") {
  if (!Array.isArray(list)) { errors.push(`${at} 要是数组`); return; }
  const L = BLOCKOUT_LANDMARK_LIMITS;
  if (list.length > L.maxItems) errors.push(`${at} 最多 ${L.maxItems} 项，现在 ${list.length}`);
  const ids = new Set();
  list.forEach((lm, i) => {
    const p = `${at}[${i}]`;
    if (!IsObject(lm)) { errors.push(`${p} 要是对象`); return; }
    if (typeof lm.id !== "string" || !lm.id) errors.push(`${p}.id 要是非空字符串`);
    else if (ids.has(lm.id)) errors.push(`${p}.id 重复：${lm.id}`);
    else ids.add(lm.id);
    if (typeof lm.name !== "string" || !lm.name) errors.push(`${p}.name 要是非空字符串`);
    else if (lm.name.length > L.nameMax) errors.push(`${p}.name 最多 ${L.nameMax} 字`);
    if (!BLOCKOUT_LANDMARK_KINDS.includes(lm.kind)) errors.push(`${p}.kind 要是 ${BLOCKOUT_LANDMARK_KINDS.join(" / ")} 之一`);
    for (const k of ["x", "z"]) if (!Finite(lm[k])) errors.push(`${p}.${k} 要是有限数字`);
    for (const k of ["y", "ry"]) if (lm[k] !== undefined && !Finite(lm[k])) errors.push(`${p}.${k} 要是有限数字`);
    for (const k of ["w", "d", "h", "radiusM"]) if (lm[k] !== undefined && !(Finite(lm[k]) && lm[k] > 0 && lm[k] <= L.sizeMax)) errors.push(`${p}.${k} 要是 (0, ${L.sizeMax}] 的数`);
    if ((lm.w === undefined) !== (lm.d === undefined)) errors.push(`${p} 的 w / d 要一起给`);
    if (lm.note !== undefined && (typeof lm.note !== "string" || lm.note.length > L.noteMax)) errors.push(`${p}.note 要是不超过 ${L.noteMax} 字的字符串`);
  });
}

/**
 * 地标归一化（深拷贝、补缺省）：坏项跳过。→ [{ id, name, kind, x, z, y: number|null, w, d, h, ry, radiusM: number|null, note }]
 * 没给 w / d 的 w = d = 0（不画线框）；h 缺省 0；ry 缺省 0。
 */
export function NormalizeLandmarks(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const lm of list) {
    if (!IsObject(lm) || typeof lm.id !== "string" || !lm.id || seen.has(lm.id) || typeof lm.name !== "string" || !lm.name) continue;
    if (!BLOCKOUT_LANDMARK_KINDS.includes(lm.kind) || !Finite(lm.x) || !Finite(lm.z)) continue;
    seen.add(lm.id);
    const size = Finite(lm.w) && lm.w > 0 && Finite(lm.d) && lm.d > 0;
    out.push({
      id: lm.id, name: lm.name, kind: lm.kind, x: lm.x, z: lm.z,
      y: Finite(lm.y) ? lm.y : null,
      w: size ? lm.w : 0, d: size ? lm.d : 0, h: Finite(lm.h) && lm.h > 0 ? lm.h : 0, ry: Finite(lm.ry) ? lm.ry : 0,
      radiusM: Finite(lm.radiusM) && lm.radiusM > 0 ? lm.radiusM : null,
      note: typeof lm.note === "string" ? lm.note : "",
    });
  }
  return out;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
/** paint 一项（poly / line）的问题（场景 paint 与远景层 paint 共用）。 */
function PaintItemIssues(item, at, errors) {
  const PointsOk = (list, min) => Array.isArray(list) && list.length >= min && list.every(p => IsObject(p) && Finite(p.x) && Finite(p.z));
  if (typeof item.color !== "string" || !HEX_RE.test(item.color)) errors.push(`${at}.color 要是 "#rrggbb"`);
  if (item.strength !== undefined && !(Finite(item.strength) && item.strength >= 0 && item.strength <= 1)) errors.push(`${at}.strength 要在 0…1`);
  if (item.feather !== undefined && !(Finite(item.feather) && item.feather > 0 && item.feather <= 20)) errors.push(`${at}.feather 要在 (0, 20] 米`);
  const hasPoly = item.poly !== undefined, hasLine = item.line !== undefined;
  if (hasPoly === hasLine) errors.push(`${at} 要有 poly 或 line 其中一个`);
  else if (hasPoly && !PointsOk(item.poly, 3)) errors.push(`${at}.poly 要是至少 3 个 {x, z} 点`);
  else if (hasLine) {
    if (!PointsOk(item.line, 2)) errors.push(`${at}.line 要是至少 2 个 {x, z} 点`);
    if (!(Finite(item.halfW) && item.halfW > 0)) errors.push(`${at}.halfW 要是正数（米）`);
  }
}

/**
 * 远景层（§2.2 backdrop）校验：
 *   far（远裁剪，米）、ground { color, y, radiusM, blendM }、haze { color, fromM, toM, max }（可选）、
 *   paint（按顺序画进远景地面：poly / line 同场景 paint，或 { id, rects: [[x0, z0, x1, z1, 色号], …], palette: ["#rrggbb", …] }）、
 *   shapes（box / blob / hill / tree，见 BLOCKOUT_BACKDROP）。
 */
function BackdropIssues(bd, errors) {
  const L = BLOCKOUT_BACKDROP;
  if (!IsObject(bd)) { errors.push("backdrop 要是对象"); return; }
  if (!(Finite(bd.far) && bd.far >= L.farMin && bd.far <= L.farMax)) errors.push(`backdrop.far 要在 ${L.farMin}…${L.farMax} 米`);
  const g = bd.ground;
  if (!IsObject(g)) errors.push("backdrop.ground 要是对象 { color, y, radiusM, blendM }");
  else {
    if (typeof g.color !== "string" || !HEX_RE.test(g.color)) errors.push('backdrop.ground.color 要是 "#rrggbb"');
    if (!Finite(g.y)) errors.push("backdrop.ground.y 要是有限数字（米）");
    if (!(Finite(g.radiusM) && g.radiusM > 0 && g.radiusM <= L.radiusMax)) errors.push(`backdrop.ground.radiusM 要在 (0, ${L.radiusMax}] 米`);
    if (g.blendM !== undefined && !(Finite(g.blendM) && g.blendM >= 0 && g.blendM <= L.blendMax)) errors.push(`backdrop.ground.blendM 要在 0…${L.blendMax} 米`);
  }
  if (bd.haze !== undefined) {
    const h = bd.haze;
    if (!IsObject(h) || typeof h.color !== "string" || !HEX_RE.test(h.color) || !Finite(h.fromM) || !Finite(h.toM) || h.fromM < 0 || h.toM <= h.fromM
      || !(Finite(h.max) && h.max >= 0 && h.max <= 1)) errors.push('backdrop.haze 要是 { color: "#rrggbb", fromM ≥ 0, toM > fromM, max 0…1 }');
  }
  const ids = new Set();
  const Id = (item, at) => {
    if (typeof item.id !== "string" || !item.id) errors.push(`${at}.id 要是非空字符串`);
    else if (ids.has(item.id)) errors.push(`${at}.id 重复：${item.id}`);
    else ids.add(item.id);
  };
  if (bd.paint !== undefined) {
    if (!Array.isArray(bd.paint)) errors.push("backdrop.paint 要是数组");
    else {
      if (bd.paint.length > L.maxPaint) errors.push(`backdrop.paint 最多 ${L.maxPaint} 项，现在 ${bd.paint.length}`);
      bd.paint.forEach((item, i) => {
        const at = `backdrop.paint[${i}]`;
        if (!IsObject(item)) { errors.push(`${at} 要是对象`); return; }
        Id(item, at);
        if (item.rects === undefined) { PaintItemIssues(item, at, errors); return; }
        const pal = item.palette;
        if (!Array.isArray(pal) || !pal.length || pal.length > L.maxPalette || !pal.every(c => typeof c === "string" && HEX_RE.test(c))) {
          errors.push(`${at}.palette 要是 1…${L.maxPalette} 个 "#rrggbb"`); return;
        }
        if (!Array.isArray(item.rects) || item.rects.length > L.maxRects) { errors.push(`${at}.rects 要是至多 ${L.maxRects} 个 [x0, z0, x1, z1, 色号]`); return; }
        let bad = 0, first = -1;
        item.rects.forEach((r, k) => {
          const ok = Array.isArray(r) && r.length === 5 && r.slice(0, 4).every(Finite) && r[2] > r[0] && r[3] > r[1] && Number.isInteger(r[4]) && r[4] >= 0 && r[4] < pal.length;
          if (!ok) { bad += 1; if (first < 0) first = k; }
        });
        if (bad) errors.push(`${at}.rects 有 ${bad} 个不对（第一个是 [${first}]）：要是 [x0, z0, x1, z1, 色号]，x1 > x0、z1 > z0、色号是 palette 的下标`);
      });
    }
  }
  if (bd.shapes !== undefined) {
    if (!Array.isArray(bd.shapes)) errors.push("backdrop.shapes 要是数组");
    else {
      if (bd.shapes.length > L.maxShapes) errors.push(`backdrop.shapes 最多 ${L.maxShapes} 个，现在 ${bd.shapes.length}`);
      bd.shapes.forEach((sh, i) => {
        const at = `backdrop.shapes[${i}]`;
        if (!IsObject(sh)) { errors.push(`${at} 要是对象`); return; }
        Id(sh, at);
        if (!L.shapeKinds.includes(sh.kind)) { errors.push(`${at}.kind 要是 ${L.shapeKinds.join(" / ")}`); return; }
        if (!Finite(sh.x) || !Finite(sh.z)) errors.push(`${at} 要带有限的 x / z`);
        if (!(Finite(sh.h) && sh.h > 0)) errors.push(`${at}.h 要是正数（米）`);
        if (sh.lift !== undefined && !Finite(sh.lift)) errors.push(`${at}.lift 要是有限数字（离地，米）`);
        if (sh.ry !== undefined && !Finite(sh.ry)) errors.push(`${at}.ry 要是有限数字（弧度）`);
        if (sh.kind !== "tree" && (typeof sh.color !== "string" || !HEX_RE.test(sh.color))) errors.push(`${at}.color 要是 "#rrggbb"`);
        if (sh.topColor !== undefined && (typeof sh.topColor !== "string" || !HEX_RE.test(sh.topColor))) errors.push(`${at}.topColor 要是 "#rrggbb"`);
        if (sh.kind === "box" && !(Finite(sh.w) && sh.w > 0 && Finite(sh.d) && sh.d > 0)) errors.push(`${at}（box）要带正的 w / d`);
        if ((sh.kind === "blob" || sh.kind === "hill") && !(Finite(sh.rx) && sh.rx > 0 && (sh.rz === undefined || (Finite(sh.rz) && sh.rz > 0)))) errors.push(`${at}（${sh.kind}）要带正的 rx（rz 可选）`);
      });
    }
  }
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
  // body（2026-10-19）只认 rig / procedural；没写或写错都去掉（= 运行时缺省 rig）
  if (!BLOCKOUT_BODY_MODES.includes(unit.body)) delete unit.body;
  // ride（2026-10-20）：{ on, x, z, y, yawDeg } 补齐缺省；没写 / null / 写错都去掉（= 不挂）
  const ride = NormalizeRide(unit.ride);
  if (ride && ride.on !== unit.id) unit.ride = ride; else delete unit.ride;
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
