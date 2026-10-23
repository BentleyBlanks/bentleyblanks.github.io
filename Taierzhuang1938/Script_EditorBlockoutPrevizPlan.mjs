// 白盒关卡编辑器的预演（previz）规则（docs/Data_EditorBlockout.md §14.1）。
//
// 纯模块：零 three、零 DOM，node 与浏览器共用，导入时不抛错。
//   BLOCKOUT_PREVIZ_SCHEMA           文件 schema
//   ValidateBlockoutPreviz(doc, {config?, voice?})  → { ok, errors, warnings }（中文、带路径）
//   NormalizeBlockoutPreviz(doc)     深拷贝 + 排序 + 缺省值
//   SamplePrevizActor(entry, t, baseUnit, opts?)    演员在 t 秒的位置 / 朝向 / 姿态 / 片段
//   SamplePrevizCamera(camera, t, resolve, {cuts})  镜头在 t 秒的机位 / 朝向 / 视场（cuts = 切镜，见 PREVIZ_CUTS）
//   PrevizFreeLookSegment(camera, index)            能转头不能走（2026-10-21，eye.free）：这一条属于哪一段 free 眼睛（PREVIZ_FREE_LOOK）
//   PrevizSequenceDuration(seq, {lineDuration?})    序列时长
//   PrevizOverlays(seq, t)           白光 / 黑场 / 说明字 / 震屏在 t 秒的确定性取值
//   PrevizThrows(seq, base, standAt) 演员键 throw（2026-10-18 第三轮）：投弹动作的出手点 → 落点抛物线；SampleThrowFlight 取 t 秒位置
//   SamplePrevizAircraft(entry, t, opts)  飞机轨（2026-10-19）：按时间航点取位置 / 机头 / 爬升 / 坡度；PrevizStrafeImpacts 取扫射弹着点
//   PrevizTimeScale(seq, t) / PrevizWallTime(seq, t) / PrevizTimeFromWall(seq, wall)  慢动作（2026-10-19）：预演时间 ↔ 墙上时间
//
// 2026-10-20：演员键 ride（阶跃，{ on, x, z, y, yawDeg } | null，口径同配置 §3 的 ride，校验 / 归一化借 Script_EditorBlockoutConfig）：
//   挂在车 / 战车 / 担架上跟着走，位置键不管用（校验报警告）；SamplePrevizActor 多给 ride。音效别名加 babyCry / cellarSob /
//   gateSmash / jarShatter（运行时 PREVIZ_SFX 直接放音频文件）。
//
// 位置键的时间语义（运行时包与集成负责人 10-18 对齐）：带 x / z 的键的 t = 到达时刻。
// 从上一个有位置的键（没有就是关键帧布设、t = 0）出发，按 move 的自然速度走，
// 出发时刻 = max(上一个位置键 t, 本键 t − 路长 / 速度)；窗口不够就从上一个位置键起匀速赶到。
// t = 0 的位置键 = 开场直接摆在那里。move:"cut" = 到点瞬移。

import { RideIssues, NormalizeRide, BLOCKOUT_RIDE_CARRIER_KINDS } from "./Script_EditorBlockoutConfig.mjs";

export const BLOCKOUT_PREVIZ_SCHEMA = "tengxian-blockout-previz/1";

export const PREVIZ_EYE_HEIGHT = Object.freeze({ stand: 1.62, crouch: 1.05, prone: 0.32 });
export const PREVIZ_MOVE_SPEED = Object.freeze({ walk: 1.4, run: 3.5, crawl: 0.5, drag: 0.9 });
export const PREVIZ_MOVES = Object.freeze(["walk", "run", "crawl", "drag", "cut"]);
export const PREVIZ_STANCES = Object.freeze(["stand", "crouch", "prone"]);
export const PREVIZ_DEFAULTS = Object.freeze({ pointH: 1.6, fov: 60, ease: "inOut", turnS: 0.4, subtitleHoldS: 0.35 });
export const PREVIZ_EVENT_TYPES = Object.freeze(["flash", "black", "caption", "explosion", "smoke", "muzzle", "shake", "signal", "sfx"]);
export const PREVIZ_SMOKE_KINDS = Object.freeze(["SmokeDust", "SmokeWhite", "SmokeBlack"]);
export const PREVIZ_SFX_ALIASES = Object.freeze([
  "artilleryFar", "artilleryNear", "shellBlast", "tinnitus", "mgBurstFar", "mgBurstNear", "rifleVolley", "rifleShot",
  "mortarPop", "mortarImpact", "grenadeBlast", "tankTracks", "tankGun", "dirtFall", "slap", "stab", "bodyFall",
  "planeDrone", "planeDive", "strafeNear", "strafeFar", "strafeDirt",
  // 2026-10-20（06–10 耿家庄）：直接放 Audio/BlockoutPreviz/ 里的文件（运行时 PREVIZ_SFX 写 url）
  "babyCry", "cellarSob", "gateSmash", "jarShatter",
  // 2026-10-24（06–10 第九版 07-4）：远处听不清的日本话——直接放现成的日语占位配音（运行时 PREVIZ_SFX 写 url）
  "ijaShoutFar",
]);
/**
 * 投弹（演员键 throw，2026-10-18 第三轮）：throw 键的 t = 开始抡（播步兵投弹片段 GrenadeThrow，Script_InfantryAnimation「背枪投弹」）。
 * releaseS 与 Script_InfantryAnimation.INFANTRY_RELEASE_SECONDS 一致（PrevizPlanTest 核对）：这一刻弹脱手，按抛物线飞到 throw 的落点；
 * clipS = 片段全长（GrenadeThrow 实测 4.23 s；之后交还原生动画）。出手点 = 演员此刻脚下 + 离地 releaseH、朝向前方 releaseFwd、右手 releaseRight（按片段脱手帧量的）。
 * 飞行时间缺省按水平距离：flightBaseS + 距离 × flightPerM，夹在 [flightMinS, flightMaxS]；弧顶比两端连线高 max(arcMinM, 距离 × arcPerM)。
 */
export const PREVIZ_THROW = Object.freeze({
  releaseS: 2.15, clipS: 4.2, releaseH: 1.95, releaseFwd: 0.25, releaseRight: 0.2,
  flightBaseS: 0.55, flightPerM: 0.06, flightMinS: 0.6, flightMaxS: 1.8, arcMinM: 1.2, arcPerM: 0.22, targetH: 0.15,
});
/**
 * 飞机轨（2026-10-19，§14.1 aircraft）。models：Data_AircraftAssets 的 id（纯模块不 import 它：三个 id 写死在这里，PrevizPlanTest 核对）。
 * bankPerRadPerS：转弯时的坡度 = 偏航角速度（rad/s）× 这个，夹在 ±bankMax；strafe 弹着 hz 缺省、横向散布、几发一声打土声。
 * minVisibleSpeedMps：航点之间速度低于它时机头沿用上一段方向（两点重合 / 悬停不转头）。
 */
export const PREVIZ_AIRCRAFT = Object.freeze({
  models: Object.freeze(["MitsubishiKi30", "MitsubishiKi21Ia", "NakajimaKi43"]),
  bankPerRadPerS: 1.6, bankMax: 0.7, headingEpsS: 0.05,
  strafeHz: 15, strafeSpreadM: 0.8, strafeImpactRadius: 0.6, strafeDirtEvery: 3, strafeNearM: 150,
  minVisibleSpeedMps: 0.5,
});
/**
 * 慢动作（2026-10-19，§14.1 slowmo）：窗口 [t, t + dur) 里预演时钟按 rate 走（墙上 1 s = 预演 rate s），进出各 fade 秒线性渐变
 *（夹到 dur/2）。rate 下限 rateMin（再慢就是定格）；台词不排在慢动作里（校验报警告）。
 */
export const PREVIZ_SLOWMO = Object.freeze({ rateMin: 0.05, rateMax: 1, fadeDefaultS: 0.25 });
const KEY_FIELDS = ["stance", "aim", "state", "visible", "carryRole", "woundedWalk", "talking", "clip", "lie", "weapon", "ride", "dragSolo"];
/** 倒地怎么躺（同配置 §3 的 lie）："along" = 顺着朝向躺、头朝前；null = 演员倒地姿态原样。 */
export const PREVIZ_LIE_MODES = Object.freeze(["along"]);
const ID_RE = /^[A-Za-z0-9_-]+$/;

const Finite = (v) => typeof v === "number" && Number.isFinite(v);
const IsObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const IsPoint = (p) => IsObject(p) && Finite(p.x) && Finite(p.z);
const Clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const Clamp01 = (v) => Math.min(1, Math.max(0, v));

export function WrapDeg(deg) { let d = ((deg + 180) % 360 + 360) % 360 - 180; if (d === -180) d = 180; return d; }
export function YawDegFromTo(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  if (Math.abs(dx) < 1e-9 && Math.abs(dz) < 1e-9) return 0;
  return WrapDeg(Math.atan2(-dx, -dz) * 180 / Math.PI);
}
export function LerpYawDeg(a, b, t) { return WrapDeg(a + WrapDeg(b - a) * Clamp01(t)); }
export function PrevizEase(u, ease = "inOut") {
  const x = Clamp01(u);
  return ease === "linear" ? x : x * x * (3 - 2 * x);
}
function RouteLength(points) {
  let n = 0;
  for (let i = 1; i < points.length; i++) n += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  return n;
}
function SampleRoute(points, d) {
  let left = Math.max(0, d);
  let heading = points.length > 1 ? YawDegFromTo(points[0], points[1]) : 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], seg = Math.hypot(b.x - a.x, b.z - a.z);
    if (seg > 1e-9) heading = YawDegFromTo(a, b);
    if (left <= seg) { const k = seg > 1e-9 ? left / seg : 1; return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, heading }; }
    left -= seg;
  }
  const last = points[points.length - 1];
  return { x: last.x, z: last.z, heading };
}

// ---------------------------------------------------------------------------
// 校验

function CheckFaceTo(errors, at, v) {
  if (v === undefined) return;
  if (typeof v === "string" ? !v : !IsPoint(v)) errors.push(`${at} 要是点 {x,z}、单位 id 或 "player"`);
}

function CheckAnchor(errors, at, v, required) {
  if (v === undefined) { if (required) errors.push(`${at} 必填`); return; }
  if (!IsObject(v)) { errors.push(`${at} 要是点 {x,z,h?} 或演员锚 {actor, offset?}`); return; }
  if (v.aircraft !== undefined) {
    // 飞机锚（2026-10-19）：{ aircraft: "<飞机轨 id>", offset? }，偏移按世界轴、相对机身
    if (typeof v.aircraft !== "string" || !v.aircraft) errors.push(`${at}.aircraft 要是飞机轨的 id`);
    if (v.offset !== undefined && !(Array.isArray(v.offset) && v.offset.length === 3 && v.offset.every(Finite))) errors.push(`${at}.offset 要是 3 个有限数字`);
    return;
  }
  if (v.actor !== undefined) {
    if (typeof v.actor !== "string" || !v.actor) errors.push(`${at}.actor 要是单位 id 或 "player"`);
    if (v.offset !== undefined && !(Array.isArray(v.offset) && v.offset.length === 3 && v.offset.every(Finite))) errors.push(`${at}.offset 要是 3 个有限数字`);
  } else if (!IsPoint(v)) errors.push(`${at} 要带有限的 x / z`);
  else if (v.h !== undefined && !Finite(v.h)) errors.push(`${at}.h 要是有限数字`);
}

function KeyframeUnits(config, id) {
  const kf = config?.keyframes?.find(k => k?.id === id);
  return kf ? new Set((kf.units || []).map(u => u.id)) : null;
}

function VoiceLineMap(voice) {
  const map = new Map();
  for (const scene of voice?.scenes || []) for (const line of scene?.lines || []) if (line?.id) map.set(line.id, line);
  for (const line of Array.isArray(voice?.lines) ? voice.lines : []) if (line?.id) map.set(line.id, line);
  return map;
}

/**
 * 预演文件校验。config 是归一化（或原始）配置：给了就核对 keyframe / 单位 id / then；
 * voice 是台词清单：给了就核对 line。错误 = 播不了；警告 = 能播但值得看一眼。
 */
export function ValidateBlockoutPreviz(doc, { config = null, voice = null } = {}) {
  const errors = [], warnings = [];
  if (!IsObject(doc)) return { ok: false, errors: ["预演文件要是 JSON 对象"], warnings };
  if (doc.schema !== BLOCKOUT_PREVIZ_SCHEMA) errors.push(`schema 要是 ${BLOCKOUT_PREVIZ_SCHEMA}`);
  if (typeof doc.level !== "string" || !doc.level) errors.push("level 要是关卡键");
  else if (config?.level && config.level !== doc.level) errors.push(`level 是 ${doc.level}，配置是 ${config.level}`);
  if (doc.voice !== undefined && typeof doc.voice !== "string") errors.push("voice 要是清单地址字符串");
  if (doc.faceTracks !== undefined && typeof doc.faceTracks !== "string") errors.push("faceTracks 要是口型轨地址字符串");
  if (!Array.isArray(doc.sequences)) { errors.push("sequences 要是数组"); return { ok: false, errors, warnings }; }
  const kfIds = config ? (config.keyframes || []).map(k => k?.id) : null;
  const lines = voice ? VoiceLineMap(voice) : null;
  const seen = new Set();
  doc.sequences.forEach((seq, si) => {
    const at = `sequences[${si}]`;
    if (!IsObject(seq)) { errors.push(`${at} 要是对象`); return; }
    if (typeof seq.keyframe !== "string" || !ID_RE.test(seq.keyframe)) errors.push(`${at}.keyframe 要是关键帧 id`);
    else {
      if (seen.has(seq.keyframe)) errors.push(`${at}.keyframe 重复：${seq.keyframe}（一个关键帧最多一段）`);
      seen.add(seq.keyframe);
      if (kfIds && !kfIds.includes(seq.keyframe)) errors.push(`${at}.keyframe 在配置里找不到：${seq.keyframe}`);
    }
    if (seq.title !== undefined && typeof seq.title !== "string") errors.push(`${at}.title 要是字符串`);
    if (seq.durationS !== undefined && !(Finite(seq.durationS) && seq.durationS > 0)) errors.push(`${at}.durationS 要是正数`);
    if (seq.then !== undefined) {
      if (typeof seq.then !== "string" || !seq.then) errors.push(`${at}.then 要是 "next" / "stay" / 关键帧 id`);
      else if (kfIds && seq.then !== "next" && seq.then !== "stay" && !kfIds.includes(seq.then)) errors.push(`${at}.then 在配置里找不到：${seq.then}`);
      else if (kfIds && seq.then === "next" && kfIds.indexOf(seq.keyframe) === kfIds.length - 1) warnings.push(`${at}.then 是 next，但这是最后一个关键帧（播完留在原地）`);
    }
    const units = config && typeof seq.keyframe === "string" ? KeyframeUnits(config, seq.keyframe) : null;
    const spawned = new Set();
    // 镜头
    if (seq.camera !== undefined && !Array.isArray(seq.camera)) errors.push(`${at}.camera 要是数组`);
    (Array.isArray(seq.camera) ? seq.camera : []).forEach((c, ci) => {
      const cat = `${at}.camera[${ci}]`;
      if (!IsObject(c)) { errors.push(`${cat} 要是对象`); return; }
      if (!Finite(c.t) || c.t < 0) errors.push(`${cat}.t 要是非负数`);
      if (!Finite(c.dur) || c.dur < 0) errors.push(`${cat}.dur 要是非负数`);
      if (c.ease !== undefined && !["linear", "inOut"].includes(c.ease)) errors.push(`${cat}.ease 要是 linear / inOut`);
      if (c.fov !== undefined && !(Finite(c.fov) && c.fov > 1 && c.fov < 170)) errors.push(`${cat}.fov 要是 1–170 的度数`);
      if (c.shake !== undefined && !(Finite(c.shake) && c.shake >= 0 && c.shake <= 1)) errors.push(`${cat}.shake 要在 0–1`);
      if (c.keepMove !== undefined && typeof c.keepMove !== "boolean") errors.push(`${cat}.keepMove 要是 true / false`);
      if (c.eye !== undefined) {
        const e = c.eye;
        if (!IsObject(e)) { errors.push(`${cat}.eye 要是对象`); return; }
        if (e.stance !== undefined && !PREVIZ_STANCES.includes(e.stance)) errors.push(`${cat}.eye.stance 要是 stand / crouch / prone`);
        for (const k of ["x", "z", "yawDeg", "pitchDeg", "toYawDeg", "toPitchDeg"]) if (e[k] !== undefined && !Finite(e[k])) errors.push(`${cat}.eye.${k} 要是有限数字`);
        if ((e.x === undefined) !== (e.z === undefined)) errors.push(`${cat}.eye 的 x / z 要同时给`);
        // 2026-10-21：眼睛也能用锚点定默认视线（look 起幅 / toLook 落幅：点、演员锚、飞机锚），写了锚就不看 yawDeg / pitchDeg；
        // free: true = 能转头不能走（§14.1）：眼睛位置要钉死（x / z 必填），玩家一动鼠标这一条剩下的时间视线归玩家
        CheckAnchor(errors, `${cat}.eye.look`, e.look, false);
        CheckAnchor(errors, `${cat}.eye.toLook`, e.toLook, false);
        if (e.free !== undefined && typeof e.free !== "boolean") errors.push(`${cat}.eye.free 要是 true / false`);
        if (e.free === true && (e.x === undefined || e.z === undefined)) errors.push(`${cat}.eye.free 的眼睛要钉死位置（x / z 必填）`);
      } else {
        CheckAnchor(errors, `${cat}.from`, c.from, true);
        CheckAnchor(errors, `${cat}.to`, c.to, false);
        CheckAnchor(errors, `${cat}.look`, c.look, true);
        CheckAnchor(errors, `${cat}.lookTo`, c.lookTo, false);
      }
      for (const [key, anchor] of [["from", c.from], ["to", c.to], ["look", c.look], ["lookTo", c.lookTo], ["eye.look", c.eye?.look], ["eye.toLook", c.eye?.toLook]]) {
        const actor = anchor?.actor;
        if (units && typeof actor === "string" && actor !== "player" && !units.has(actor) && !SpawnIds(seq).has(actor)) errors.push(`${cat}.${key}.actor 在关键帧 ${seq.keyframe} 里找不到：${actor}`);
        const plane = anchor?.aircraft;
        if (typeof plane === "string" && plane && !AircraftIds(seq).has(plane)) errors.push(`${cat}.${key}.aircraft 在这一段的 aircraft 里找不到：${plane}`);
      }
    });
    // 飞机（2026-10-19）
    if (seq.aircraft !== undefined && !Array.isArray(seq.aircraft)) errors.push(`${at}.aircraft 要是数组`);
    const planeIds = new Set();
    (Array.isArray(seq.aircraft) ? seq.aircraft : []).forEach((p, pi) => {
      const pat = `${at}.aircraft[${pi}]`;
      if (!IsObject(p)) { errors.push(`${pat} 要是对象`); return; }
      if (typeof p.id !== "string" || !ID_RE.test(p.id)) errors.push(`${pat}.id 要是 [A-Za-z0-9_-]+`);
      else { if (planeIds.has(p.id)) errors.push(`${pat}.id 重复：${p.id}`); planeIds.add(p.id); }
      if (p.model !== undefined && !PREVIZ_AIRCRAFT.models.includes(p.model)) errors.push(`${pat}.model 要是 ${PREVIZ_AIRCRAFT.models.join(" / ")}`);
      if (!Array.isArray(p.path) || p.path.length < 2) errors.push(`${pat}.path 要是 ≥ 2 个航点 {t, x, y | h, z}`);
      else {
        let last = -Infinity;
        p.path.forEach((w, wi) => {
          const wat = `${pat}.path[${wi}]`;
          if (!IsObject(w)) { errors.push(`${wat} 要是对象`); return; }
          if (!Finite(w.t) || w.t < 0) errors.push(`${wat}.t 要是非负数`);
          else { if (w.t <= last) errors.push(`${wat}.t 要比上一个航点晚（航点按时间升序）`); last = w.t; }
          if (!Finite(w.x) || !Finite(w.z)) errors.push(`${wat} 要带有限的 x / z`);
          if ((w.y === undefined) === (w.h === undefined)) errors.push(`${wat} 的 y（世界高）和 h（离地高）二选一`);
          else if (!Finite(w.y ?? w.h)) errors.push(`${wat} 的 y / h 要是有限数字`);
        });
      }
      if (p.strafe !== undefined && !Array.isArray(p.strafe)) errors.push(`${pat}.strafe 要是数组`);
      (Array.isArray(p.strafe) ? p.strafe : []).forEach((s, si) => {
        const sat = `${pat}.strafe[${si}]`;
        if (!IsObject(s)) { errors.push(`${sat} 要是对象`); return; }
        if (!Finite(s.t0) || !Finite(s.t1) || s.t0 < 0 || s.t1 <= s.t0) errors.push(`${sat} 的 t0 / t1 要是 0 ≤ t0 < t1`);
        if (!IsPoint(s.from) || !IsPoint(s.to)) errors.push(`${sat} 的 from / to 要是地面上的点 {x, z}`);
        if (s.hz !== undefined && !(Finite(s.hz) && s.hz > 0 && s.hz <= 60)) errors.push(`${sat}.hz 要是 0–60`);
        if (Array.isArray(p.path) && p.path.length >= 2 && Finite(s.t0) && Finite(s.t1)) {
          const t0 = p.path[0]?.t, t1 = p.path[p.path.length - 1]?.t;
          if (Finite(t0) && Finite(t1) && (s.t0 < t0 || s.t1 > t1)) warnings.push(`${sat} 的时间不在航线 [${t0}, ${t1}] 里（飞机不在天上时弹着照画）`);
        }
      });
      if (p.sound !== undefined) {
        if (!IsObject(p.sound)) errors.push(`${pat}.sound 要是对象 {drone?, diveT?}`);
        else {
          if (p.sound.drone !== undefined && typeof p.sound.drone !== "boolean") errors.push(`${pat}.sound.drone 要是 true / false`);
          if (p.sound.diveT !== undefined && !(Finite(p.sound.diveT) && p.sound.diveT >= 0)) errors.push(`${pat}.sound.diveT 要是非负数`);
        }
      }
    });
    // 慢动作（2026-10-19）
    if (seq.slowmo !== undefined && !Array.isArray(seq.slowmo)) errors.push(`${at}.slowmo 要是数组`);
    const slow = (Array.isArray(seq.slowmo) ? seq.slowmo : []).filter(IsObject);
    slow.forEach((s, si) => {
      const sat = `${at}.slowmo[${si}]`;
      if (!Finite(s.t) || s.t < 0) errors.push(`${sat}.t 要是非负数`);
      if (!(Finite(s.dur) && s.dur > 0)) errors.push(`${sat}.dur 要是正数`);
      if (!(Finite(s.rate) && s.rate >= PREVIZ_SLOWMO.rateMin && s.rate <= PREVIZ_SLOWMO.rateMax)) errors.push(`${sat}.rate 要在 ${PREVIZ_SLOWMO.rateMin}–${PREVIZ_SLOWMO.rateMax}（倍率，0.3 = 放慢到三成）`);
      if (s.fade !== undefined && !(Finite(s.fade) && s.fade >= 0)) errors.push(`${sat}.fade 要是非负数`);
      if (Finite(s.t) && Finite(s.dur)) {
        for (const o of slow.slice(0, si)) if (Finite(o.t) && Finite(o.dur) && s.t < o.t + o.dur && o.t < s.t + s.dur) errors.push(`${sat} 与别的慢动作窗口重叠`);
        for (const l of Array.isArray(seq.lines) ? seq.lines : []) if (IsObject(l) && Finite(l.t) && l.t >= s.t && l.t < s.t + s.dur) warnings.push(`${sat} 里排了台词 ${l.line}（慢动作里台词照常速放，听着对不上）`);
      }
    });
    (Array.isArray(seq.slowmo) ? seq.slowmo : []).forEach((s, si) => { if (!IsObject(s)) errors.push(`${at}.slowmo[${si}] 要是对象`); });
    // 演员
    if (seq.actors !== undefined && !Array.isArray(seq.actors)) errors.push(`${at}.actors 要是数组`);
    const actorIds = new Set();
    (Array.isArray(seq.actors) ? seq.actors : []).forEach((a, ai) => {
      const aat = `${at}.actors[${ai}]`;
      if (!IsObject(a)) { errors.push(`${aat} 要是对象`); return; }
      if (typeof a.id !== "string" || !a.id) errors.push(`${aat}.id 要是非空字符串`);
      else {
        if (actorIds.has(a.id)) errors.push(`${aat}.id 重复：${a.id}`);
        actorIds.add(a.id);
      }
      if (a.spawn !== undefined) {
        const s = a.spawn;
        if (!IsObject(s) || !Finite(s.x) || !Finite(s.z)) errors.push(`${aat}.spawn 要带有限的 x / z`);
        else {
          if (s.side !== undefined && !["ija", "nra", "civ"].includes(s.side)) errors.push(`${aat}.spawn.side 要是 ija / nra / civ`);
          if (s.stance !== undefined && !PREVIZ_STANCES.includes(s.stance)) errors.push(`${aat}.spawn.stance 要是 stand / crouch / prone`);
        }
        if (units && units.has(a.id)) errors.push(`${aat}.spawn 的 id 与关键帧里的单位重名：${a.id}`);
        spawned.add(a.id);
      } else if (units && typeof a.id === "string" && !units.has(a.id)) errors.push(`${aat}.id 在关键帧 ${seq.keyframe} 里找不到（临时加人要写 spawn）：${a.id}`);
      if (!Array.isArray(a.keys)) { errors.push(`${aat}.keys 要是数组`); return; }
      let lastT = -Infinity;
      // ride（2026-10-20）：从关键帧单位 / spawn 的 ride 起，按键的顺序跟踪「此刻挂在谁身上」，挂着时写位置键只报警告（运行时不管它）
      let riding = NormalizeRide(a.spawn?.ride ?? (units && typeof a.id === "string" ? KeyframeUnit(config, seq.keyframe, a.id)?.ride : null));
      StableSortByT(a.keys.filter(k => IsObject(k) && Finite(k.t))).forEach((k) => {
        if (k.ride !== undefined) riding = NormalizeRide(k.ride);
        else if (riding && k.x !== undefined) warnings.push(`${aat} t=${k.t} 的位置键不管用：这时挂在 ${riding.on} 上（要下车先写 ride: null）`);
      });
      a.keys.forEach((k, ki) => {
        const kat = `${aat}.keys[${ki}]`;
        if (!IsObject(k)) { errors.push(`${kat} 要是对象`); return; }
        if (!Finite(k.t) || k.t < 0) errors.push(`${kat}.t 要是非负数`);
        else { if (k.t < lastT) warnings.push(`${kat}.t 比上一个键早（会按 t 重新排序）`); lastT = k.t; }
        if ((k.x === undefined) !== (k.z === undefined)) errors.push(`${kat} 的 x / z 要同时给`);
        else if (k.x !== undefined && (!Finite(k.x) || !Finite(k.z))) errors.push(`${kat} 的 x / z 要是有限数字`);
        if (k.ride !== undefined && k.ride !== null) {
          errors.push(...RideIssues(k.ride, `${kat}.ride`));
          const on = IsObject(k.ride) ? k.ride.on : null;
          if (typeof on === "string" && on) {
            if (on === a.id) errors.push(`${kat}.ride.on 不能是自己`);
            else if (units && !units.has(on) && !SpawnIds(seq).has(on)) errors.push(`${kat}.ride.on 在关键帧 ${seq.keyframe} 里找不到：${on}`);
            else {
              const carrier = SpawnOf(seq, on) || (config ? KeyframeUnit(config, seq.keyframe, on) : null);
              const kind = carrier ? (carrier.kind || "soldier") : null;
              if (kind && !BLOCKOUT_RIDE_CARRIER_KINDS.includes(kind)) errors.push(`${kat}.ride.on 指的 ${on} 是 ${kind}，只能挂到 ${BLOCKOUT_RIDE_CARRIER_KINDS.join(" / ")} 上`);
            }
          }
        }
        if (k.path !== undefined) {
          if (!Array.isArray(k.path)) errors.push(`${kat}.path 要是 {x,z} 数组`);
          else k.path.forEach((p, pi) => { if (!IsPoint(p)) errors.push(`${kat}.path[${pi}] 要带有限的 x / z`); });
          if (k.x === undefined) errors.push(`${kat}.path 只能跟 x / z 一起写`);
        }
        if (k.move !== undefined && !PREVIZ_MOVES.includes(k.move)) errors.push(`${kat}.move 要是 ${PREVIZ_MOVES.join(" / ")}`);
        if (k.yawDeg !== undefined && !Finite(k.yawDeg)) errors.push(`${kat}.yawDeg 要是有限数字`);
        CheckFaceTo(errors, `${kat}.faceTo`, k.faceTo);
        if (units && typeof k.faceTo === "string" && k.faceTo !== "player" && !units.has(k.faceTo) && !SpawnIds(seq).has(k.faceTo)) errors.push(`${kat}.faceTo 在关键帧 ${seq.keyframe} 里找不到：${k.faceTo}`);
        if (k.stance !== undefined && !PREVIZ_STANCES.includes(k.stance)) errors.push(`${kat}.stance 要是 stand / crouch / prone`);
        if (k.state !== undefined && !["alive", "down"].includes(k.state)) errors.push(`${kat}.state 要是 alive / down`);
        for (const b of ["aim", "visible", "talking", "dragSolo"]) if (k[b] !== undefined && typeof k[b] !== "boolean" && !Finite(k[b])) errors.push(`${kat}.${b} 要是 true / false`);
        if (k.woundedWalk !== undefined && typeof k.woundedWalk !== "boolean" && !Finite(k.woundedWalk)) errors.push(`${kat}.woundedWalk 要是 true / false`);
        if (k.carryRole !== undefined && k.carryRole !== null && !["front", "rear"].includes(k.carryRole)) errors.push(`${kat}.carryRole 要是 front / rear / null`);
        if (k.clip !== undefined && k.clip !== null && (typeof k.clip !== "string" || !k.clip)) errors.push(`${kat}.clip 要是片段名或 null`);
        if (k.clipFrom !== undefined && !(Finite(k.clipFrom) && k.clipFrom >= 0)) errors.push(`${kat}.clipFrom 要是非负数`);
        if (k.clipHold !== undefined && typeof k.clipHold !== "boolean") errors.push(`${kat}.clipHold 要是 true / false`);
        if (k.clipRelease !== undefined && !(Finite(k.clipRelease) && k.clipRelease >= 0)) errors.push(`${kat}.clipRelease 要是非负数（片段秒数）`);
        if (k.clipRelease !== undefined && !k.clip) errors.push(`${kat}.clipRelease 要和 clip 写在同一个键`);
        if (k.lie !== undefined && k.lie !== null && !PREVIZ_LIE_MODES.includes(k.lie)) errors.push(`${kat}.lie 要是 ${PREVIZ_LIE_MODES.join(" / ")} 或 null`);
        if (k.weapon !== undefined && k.weapon !== null && (typeof k.weapon !== "string" || !k.weapon)) errors.push(`${kat}.weapon 要是武器 id（如 Dadao / HanYang）或 null（空手）`);
        if (k.throw !== undefined) {
          const th = k.throw;
          if (!IsPoint(th)) errors.push(`${kat}.throw 要是落点 {x, z, h?, flightS?}`);
          else {
            if (th.h !== undefined && !Finite(th.h)) errors.push(`${kat}.throw.h 要是有限数字`);
            if (th.flightS !== undefined && !(Finite(th.flightS) && th.flightS > 0 && th.flightS <= 5)) errors.push(`${kat}.throw.flightS 要是 0–5 秒`);
          }
          if (k.clip !== undefined && k.clip !== null) errors.push(`${kat}.throw 与 clip 不能写在同一个键（投弹自己就是一个片段）`);
        }
      });
    });
    // 台词
    if (seq.lines !== undefined && !Array.isArray(seq.lines)) errors.push(`${at}.lines 要是数组`);
    (Array.isArray(seq.lines) ? seq.lines : []).forEach((l, li) => {
      const lat = `${at}.lines[${li}]`;
      if (!IsObject(l)) { errors.push(`${lat} 要是对象`); return; }
      if (!Finite(l.t) || l.t < 0) errors.push(`${lat}.t 要是非负数`);
      if (typeof l.line !== "string" || !l.line) errors.push(`${lat}.line 要是清单里的句子 id`);
      else if (lines && !lines.has(l.line)) errors.push(`${lat}.line 在台词清单里找不到：${l.line}`);
      if (l.actor !== undefined && (typeof l.actor !== "string" || !l.actor)) errors.push(`${lat}.actor 要是单位 id`);
      else if (units && typeof l.actor === "string" && l.actor !== "player" && !units.has(l.actor) && !SpawnIds(seq).has(l.actor)) errors.push(`${lat}.actor 在关键帧 ${seq.keyframe} 里找不到：${l.actor}`);
    });
    // 事件
    if (seq.events !== undefined && !Array.isArray(seq.events)) errors.push(`${at}.events 要是数组`);
    (Array.isArray(seq.events) ? seq.events : []).forEach((e, ei) => {
      const eat = `${at}.events[${ei}]`;
      if (!IsObject(e)) { errors.push(`${eat} 要是对象`); return; }
      if (!Finite(e.t) || e.t < 0) errors.push(`${eat}.t 要是非负数`);
      if (!PREVIZ_EVENT_TYPES.includes(e.type)) { errors.push(`${eat}.type 要是 ${PREVIZ_EVENT_TYPES.join(" / ")}`); return; }
      const NeedDur = () => { if (!(Finite(e.dur) && e.dur > 0)) errors.push(`${eat}.dur 要是正数`); };
      const NeedPoint = () => { if (!Finite(e.x) || !Finite(e.z)) errors.push(`${eat} 要带有限的 x / z`); };
      if (e.type === "flash") { NeedDur(); if (e.strength !== undefined && !(Finite(e.strength) && e.strength >= 0 && e.strength <= 1)) errors.push(`${eat}.strength 要在 0–1`); }
      else if (e.type === "black") { NeedDur(); if (e.fade !== undefined && !(Finite(e.fade) && e.fade >= 0)) errors.push(`${eat}.fade 要是非负数`); }
      else if (e.type === "caption") { NeedDur(); if (typeof e.text !== "string" || !e.text) errors.push(`${eat}.text 要是非空字符串`); }
      else if (e.type === "explosion") {
        NeedPoint();
        if (e.radius !== undefined && !(Finite(e.radius) && e.radius > 0)) errors.push(`${eat}.radius 要是正数`);
        if (e.h !== undefined && !(Finite(e.h) && e.h >= 0 && e.h <= 10)) errors.push(`${eat}.h 要是 0–10 米（爆点离地高）`);
      }
      else if (e.type === "smoke") {
        NeedPoint();
        if (e.kind !== undefined && !PREVIZ_SMOKE_KINDS.includes(e.kind)) errors.push(`${eat}.kind 要是 ${PREVIZ_SMOKE_KINDS.join(" / ")}`);
        if (e.dur !== undefined && !(Finite(e.dur) && e.dur > 0)) errors.push(`${eat}.dur 要是正数`);
        if (e.scale !== undefined && !(Finite(e.scale) && e.scale >= 0.3 && e.scale <= 6)) errors.push(`${eat}.scale 要是 0.3–6（白盒简易烟放大几倍）`);
      } else if (e.type === "muzzle") {
        if (typeof e.actor === "string") { if (units && e.actor !== "player" && !units.has(e.actor) && !SpawnIds(seq).has(e.actor)) errors.push(`${eat}.actor 在关键帧 ${seq.keyframe} 里找不到：${e.actor}`); }
        else NeedPoint();
        if (e.count !== undefined && !(Number.isInteger(e.count) && e.count >= 1 && e.count <= 60)) errors.push(`${eat}.count 要是 1–60 的整数`);
        if (e.interval !== undefined && !(Finite(e.interval) && e.interval > 0)) errors.push(`${eat}.interval 要是正数`);
      } else if (e.type === "shake") { NeedDur(); if (!(Finite(e.strength) && e.strength >= 0 && e.strength <= 1)) errors.push(`${eat}.strength 要在 0–1`); }
      else if (e.type === "signal") {
        if (typeof e.name !== "string" || !e.name) errors.push(`${eat}.name 要是信号名`);
        if (typeof e.on !== "boolean") errors.push(`${eat}.on 要是 true / false`);
      } else if (e.type === "sfx") {
        if (typeof e.name !== "string" || !e.name) errors.push(`${eat}.name 要是音效别名`);
        else if (!PREVIZ_SFX_ALIASES.includes(e.name)) warnings.push(`${eat}.name 不在 §14.3 的别名表里：${e.name}（运行时会跳过）`);
        if ((e.x === undefined) !== (e.z === undefined)) errors.push(`${eat} 的 x / z 要同时给`);
        if (e.volume !== undefined && !(Finite(e.volume) && e.volume >= 0)) errors.push(`${eat}.volume 要是非负数`);
      }
    });
    void spawned;
  });
  return { ok: errors.length === 0, errors, warnings };
}

function SpawnIds(seq) {
  return new Set((Array.isArray(seq?.actors) ? seq.actors : []).filter(a => IsObject(a) && a.spawn && typeof a.id === "string").map(a => a.id));
}
/** 这一段里 id 的 spawn（带 kind 等字段）；没有 → null。 */
function SpawnOf(seq, id) {
  const a = (Array.isArray(seq?.actors) ? seq.actors : []).find(a => IsObject(a) && IsObject(a.spawn) && a.id === id);
  return a ? a.spawn : null;
}
/** 配置里某关键帧的某个单位；没有 → null。 */
function KeyframeUnit(config, keyframeId, unitId) {
  const kf = config?.keyframes?.find(k => k?.id === keyframeId);
  return kf ? (kf.units || []).find(u => u?.id === unitId) || null : null;
}
function AircraftIds(seq) {
  return new Set((Array.isArray(seq?.aircraft) ? seq.aircraft : []).filter(p => IsObject(p) && typeof p.id === "string").map(p => p.id));
}

// ---------------------------------------------------------------------------
// 归一化

const ByT = (a, b) => a.t - b.t;
function StableSortByT(list) { return list.map((v, i) => [v, i]).sort((a, b) => ByT(a[0], b[0]) || a[1] - b[1]).map(([v]) => v); }

/** 深拷贝 + 各轨按 t 排序 + 缺省值（then:"next"）。坏条目尽量跳过，不抛。 */
export function NormalizeBlockoutPreviz(doc) {
  const out = { schema: BLOCKOUT_PREVIZ_SCHEMA, level: "", voice: null, faceTracks: null, sequences: [] };
  if (!IsObject(doc)) return out;
  out.level = typeof doc.level === "string" ? doc.level : "";
  out.voice = typeof doc.voice === "string" ? doc.voice : null;
  out.faceTracks = typeof doc.faceTracks === "string" ? doc.faceTracks : null;
  const seen = new Set();
  for (const raw of Array.isArray(doc.sequences) ? doc.sequences : []) {
    if (!IsObject(raw) || typeof raw.keyframe !== "string" || seen.has(raw.keyframe)) continue;
    seen.add(raw.keyframe);
    const seq = Clone(raw);
    seq.title = typeof seq.title === "string" ? seq.title : "";
    seq.then = typeof seq.then === "string" && seq.then ? seq.then : "next";
    seq.camera = StableSortByT((Array.isArray(seq.camera) ? seq.camera : []).filter(c => IsObject(c) && Finite(c.t)))
      .map(c => ({ ...c, dur: Finite(c.dur) ? Math.max(0, c.dur) : 0, ease: c.ease === "linear" ? "linear" : "inOut", fov: Finite(c.fov) ? c.fov : PREVIZ_DEFAULTS.fov, shake: Finite(c.shake) ? Clamp01(c.shake) : 0 }));
    seq.actors = (Array.isArray(seq.actors) ? seq.actors : []).filter(a => IsObject(a) && typeof a.id === "string" && a.id)
      .map(a => ({ ...a, keys: StableSortByT((Array.isArray(a.keys) ? a.keys : []).filter(k => IsObject(k) && Finite(k.t))) }));
    seq.lines = StableSortByT((Array.isArray(seq.lines) ? seq.lines : []).filter(l => IsObject(l) && Finite(l.t) && typeof l.line === "string"));
    seq.events = StableSortByT((Array.isArray(seq.events) ? seq.events : []).filter(e => IsObject(e) && Finite(e.t) && PREVIZ_EVENT_TYPES.includes(e.type)));
    // 飞机轨：航点按 t 排、去掉坏航点；model 缺省 Ki-30；strafe 按 t0 排
    seq.aircraft = (Array.isArray(seq.aircraft) ? seq.aircraft : []).filter(p => IsObject(p) && typeof p.id === "string" && p.id)
      .map(p => ({
        ...p,
        model: PREVIZ_AIRCRAFT.models.includes(p.model) ? p.model : PREVIZ_AIRCRAFT.models[0],
        path: StableSortByT((Array.isArray(p.path) ? p.path : []).filter(w => IsObject(w) && Finite(w.t) && Finite(w.x) && Finite(w.z) && (Finite(w.y) || Finite(w.h)))),
        strafe: (Array.isArray(p.strafe) ? p.strafe : []).filter(s => IsObject(s) && Finite(s.t0) && Finite(s.t1) && s.t1 > s.t0 && IsPoint(s.from) && IsPoint(s.to))
          .sort((a, b) => a.t0 - b.t0),
        sound: { drone: p.sound?.drone !== false, diveT: Finite(p.sound?.diveT) ? p.sound.diveT : null },
      }))
      .filter(p => p.path.length >= 2);
    // 慢动作：按 t 排、rate 夹进范围、fade 缺省
    seq.slowmo = StableSortByT((Array.isArray(seq.slowmo) ? seq.slowmo : []).filter(s => IsObject(s) && Finite(s.t) && Finite(s.dur) && s.dur > 0 && Finite(s.rate)))
      .map(s => ({ t: s.t, dur: s.dur, rate: Math.min(PREVIZ_SLOWMO.rateMax, Math.max(PREVIZ_SLOWMO.rateMin, s.rate)),
        fade: Math.min(s.dur / 2, Finite(s.fade) && s.fade >= 0 ? s.fade : PREVIZ_SLOWMO.fadeDefaultS) }));
    seq.durationS = Finite(seq.durationS) && seq.durationS > 0 ? seq.durationS : null;
    out.sequences.push(seq);
  }
  return out;
}

/** 关键帧 id → 序列（找不到 null）。 */
export function PrevizSequenceFor(previz, keyframeId) {
  return previz?.sequences?.find(s => s.keyframe === keyframeId) || null;
}

/**
 * 序列时长：给了 durationS 用它，否则 = 镜头、演员键、台词（t + 时长）、事件（t + dur）的最晚结束。
 * lineDuration(id) → 秒（清单里的 durationS）；不给时台词按 2 s 算。
 */
export function PrevizSequenceDuration(seq, { lineDuration = null } = {}) {
  if (!seq) return 0;
  if (Finite(seq.durationS) && seq.durationS > 0) return seq.durationS;
  let end = 0;
  for (const c of seq.camera || []) end = Math.max(end, c.t + (c.dur || 0));
  for (const a of seq.actors || []) for (const k of a.keys || []) end = Math.max(end, k.t + (IsPoint(k.throw) ? PREVIZ_THROW.clipS : 0));
  for (const l of seq.lines || []) end = Math.max(end, l.t + (lineDuration?.(l.line) ?? 2));
  for (const e of seq.events || []) end = Math.max(end, e.t + (Finite(e.dur) ? e.dur : 0) + (e.type === "black" && Finite(e.fade) ? 0 : 0));
  // 飞机：最后一个航点；扫射段的结束。慢动作：窗口结束（按预演时间算，墙上时间更长）
  for (const p of seq.aircraft || []) {
    for (const w of p.path || []) if (Finite(w?.t)) end = Math.max(end, w.t);
    for (const s of p.strafe || []) if (Finite(s?.t1)) end = Math.max(end, s.t1);
  }
  for (const s of seq.slowmo || []) if (Finite(s?.t) && Finite(s?.dur)) end = Math.max(end, s.t + s.dur);
  return Math.max(0.1, end);
}

// ---------------------------------------------------------------------------
// 飞机（2026-10-19）

/** 航点的世界高：y 直接用；h = 离地高，按 groundAt(x, z) 加（纯测试里不给 groundAt 就当地面 0）。 */
function WaypointY(w, groundAt) {
  if (Finite(w.y)) return w.y;
  return (Finite(w.h) ? w.h : 0) + (typeof groundAt === "function" ? groundAt(w.x, w.z) : 0);
}

/**
 * 时间参数的 Catmull-Rom（非均匀节点）：航点之间平滑穿过，端点用相邻差分。→ {x,y,z} 与导数 {vx,vy,vz}（m/s）。
 * pts：[{t,x,y,z}] 按 t 升序、t 严格递增。t 在首尾之外时夹到端点（调用方另判可见）。
 */
function SampleSpline(pts, t) {
  const n = pts.length;
  if (n === 1) return { x: pts[0].x, y: pts[0].y, z: pts[0].z, vx: 0, vy: 0, vz: 0 };
  let i = 0;
  while (i < n - 2 && t >= pts[i + 1].t) i++;
  const p1 = pts[i], p2 = pts[i + 1];
  const p0 = pts[i - 1] || null, p3 = pts[i + 2] || null;
  const h = Math.max(1e-6, p2.t - p1.t);
  const u = Math.min(1, Math.max(0, (t - p1.t) / h));
  // 切线（单位：每秒）：中间点取相邻两段的中心差分，端点取那一段的斜率
  const Slope = (q, r) => { const dt = Math.max(1e-6, r.t - q.t); return { x: (r.x - q.x) / dt, y: (r.y - q.y) / dt, z: (r.z - q.z) / dt }; };
  const Tan = (a, b, c) => (a && c ? Slope(a, c) : a ? Slope(a, b) : Slope(b, c));
  const m1 = Tan(p0, p1, p2), m2 = Tan(p1, p2, p3);
  const u2 = u * u, u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  const d00 = 6 * u2 - 6 * u, d10 = 3 * u2 - 4 * u + 1, d01 = -6 * u2 + 6 * u, d11 = 3 * u2 - 2 * u;
  const P = (k) => h00 * p1[k] + h10 * h * m1[k] + h01 * p2[k] + h11 * h * m2[k];
  const D = (k) => (d00 * p1[k] + d10 * h * m1[k] + d01 * p2[k] + d11 * h * m2[k]) / h;
  return { x: P("x"), y: P("y"), z: P("z"), vx: D("x"), vy: D("y"), vz: D("z") };
}

const aircraftCompiled = new WeakMap();
function AircraftPoints(entry, groundAt) {
  const key = typeof groundAt === "function" ? groundAt : null;
  const hit = aircraftCompiled.get(entry);
  if (hit && hit.key === key) return hit.pts;
  const pts = StableSortByT((entry?.path || []).filter(w => IsObject(w) && Finite(w.t) && Finite(w.x) && Finite(w.z)))
    .map(w => ({ t: w.t, x: w.x, z: w.z, y: WaypointY(w, groundAt) }));
  // 同一时刻两个航点：后一个顶掉前一个（样条要严格递增的节点）
  const out = [];
  for (const p of pts) { if (out.length && p.t - out[out.length - 1].t <= 1e-6) out[out.length - 1] = p; else out.push(p); }
  aircraftCompiled.set(entry, { key, pts: out });
  return out;
}

/** 速度向量 → 机头偏航（yaw 口径同演员：0 = 朝北 −Z）与爬升角（弧度，抬头为正）。速度太小时 null。 */
function HeadingOf(v) {
  const flat = Math.hypot(v.vx, v.vz);
  if (Math.hypot(flat, v.vy) < PREVIZ_AIRCRAFT.minVisibleSpeedMps) return null;
  return { yawDeg: WrapDeg(Math.atan2(-v.vx, -v.vz) * 180 / Math.PI), climb: Math.atan2(v.vy, Math.max(1e-6, flat)) };
}

/**
 * 飞机轨在 t 秒的姿态（纯函数、确定性）。opts.groundAt(x,z) 给航点 h 换成世界高。
 * 机头顺着速度方向（过了航点之间的样条），转弯时按偏航角速度带一点坡度（左转压左翼：bank 为正 = 向左滚，
 * 与 Script_AircraftStrafe 的 bank 同号：rotation.z 为正）。首个航点之前 / 末个航点之后 visible: false（位置夹在端点上）。
 * @returns {{id, model, visible, x, y, z, yawDeg, climb, bank, dirX, dirZ, speedMps}}
 */
export function SamplePrevizAircraft(entry, t, opts = {}) {
  const pts = AircraftPoints(entry, opts.groundAt);
  const id = entry?.id ?? "", model = PREVIZ_AIRCRAFT.models.includes(entry?.model) ? entry.model : PREVIZ_AIRCRAFT.models[0];
  if (!pts.length) return { id, model, visible: false, x: 0, y: 0, z: 0, yawDeg: 0, climb: 0, bank: 0, dirX: 0, dirZ: -1, speedMps: 0 };
  const time = Finite(t) ? t : 0;
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  const tc = Math.min(t1, Math.max(t0, time));
  const s = SampleSpline(pts, tc);
  // 机头：速度方向；速度太小（两点重合）就往前后找一个有速度的时刻
  let head = HeadingOf(s);
  for (let k = 1; !head && k <= 8; k++) head = HeadingOf(SampleSpline(pts, Math.min(t1, Math.max(t0, tc + k * 0.25)))) || HeadingOf(SampleSpline(pts, Math.min(t1, Math.max(t0, tc - k * 0.25))));
  const yawDeg = head ? head.yawDeg : 0, climb = head ? head.climb : 0;
  // 坡度：偏航角速度（中心差分）× 系数，夹上限；端点外不转
  let bank = 0;
  if (head && pts.length > 2 && tc > t0 && tc < t1) {
    const e = PREVIZ_AIRCRAFT.headingEpsS;
    const a = HeadingOf(SampleSpline(pts, Math.max(t0, tc - e))), b = HeadingOf(SampleSpline(pts, Math.min(t1, tc + e)));
    if (a && b) {
      const rate = WrapDeg(b.yawDeg - a.yawDeg) * Math.PI / 180 / Math.max(1e-6, Math.min(t1, tc + e) - Math.max(t0, tc - e));
      bank = Math.max(-PREVIZ_AIRCRAFT.bankMax, Math.min(PREVIZ_AIRCRAFT.bankMax, rate * PREVIZ_AIRCRAFT.bankPerRadPerS));
    }
  }
  const r = yawDeg * Math.PI / 180;
  return {
    id, model, visible: time >= t0 && time <= t1,
    x: s.x, y: s.y, z: s.z, yawDeg, climb, bank,
    dirX: -Math.sin(r), dirZ: -Math.cos(r),
    vx: s.vx, vy: s.vy, vz: s.vz,
    speedMps: Math.hypot(s.vx, s.vy, s.vz),
    t0, t1,
  };
}

/**
 * 一条飞机轨的全部扫射弹着点（确定性）：每段 strafe 在 [t0, t1) 里按 hz 落点，沿 from → to 匀速推进，
 * 横向按确定性散布 ±strafeSpreadM。→ [{ t, x, z, segment, index, dirt }]（dirt = 这一发要不要放打土声，每 strafeDirtEvery 发一声）。
 */
export function PrevizStrafeImpacts(entry) {
  const out = [];
  (entry?.strafe || []).forEach((s, segment) => {
    if (!IsObject(s) || !Finite(s.t0) || !Finite(s.t1) || s.t1 <= s.t0 || !IsPoint(s.from) || !IsPoint(s.to)) return;
    const hz = Finite(s.hz) && s.hz > 0 ? Math.min(60, s.hz) : PREVIZ_AIRCRAFT.strafeHz;
    const n = Math.max(1, Math.floor((s.t1 - s.t0) * hz));
    const dx = s.to.x - s.from.x, dz = s.to.z - s.from.z, len = Math.hypot(dx, dz);
    const sx = len > 1e-6 ? -dz / len : 1, sz = len > 1e-6 ? dx / len : 0;   // 横向
    for (let i = 0; i < n; i++) {
      const t = s.t0 + i / hz;
      const u = (t - s.t0) / (s.t1 - s.t0);
      const hash = Math.sin(i * 12.9898 + segment * 78.233) * 43758.5453;
      const lateral = ((hash - Math.floor(hash)) * 2 - 1) * PREVIZ_AIRCRAFT.strafeSpreadM;
      out.push({ t, x: s.from.x + dx * u + sx * lateral, z: s.from.z + dz * u + sz * lateral, segment, index: i, dirt: i % PREVIZ_AIRCRAFT.strafeDirtEvery === 0 });
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
// 慢动作（2026-10-19）

/** 一个慢动作窗口在预演时间 t 的倍率（1 = 常速）：进出各 fade 秒线性渐变到 rate。 */
function SlowmoRateAt(s, t) {
  if (t < s.t || t >= s.t + s.dur) return 1;
  const fade = Math.min(Finite(s.fade) ? s.fade : PREVIZ_SLOWMO.fadeDefaultS, s.dur / 2);
  const rate = Math.min(PREVIZ_SLOWMO.rateMax, Math.max(PREVIZ_SLOWMO.rateMin, s.rate));
  if (fade <= 1e-9) return rate;
  const inK = Math.min(1, (t - s.t) / fade), outK = Math.min(1, (s.t + s.dur - t) / fade);
  const k = Math.min(inK, outK);
  return 1 + (rate - 1) * k;
}

/** 预演时间 t 这一刻预演时钟走多快（墙上 1 s = 预演 PrevizTimeScale s）；没有慢动作 = 1。 */
export function PrevizTimeScale(seq, t) {
  let scale = 1;
  for (const s of seq?.slowmo || []) if (IsObject(s) && Finite(s.t) && Finite(s.dur) && Finite(s.rate)) scale = Math.min(scale, SlowmoRateAt(s, Finite(t) ? t : 0));
  return scale;
}

/** 线性倍率 r(u) = a + b·u 在 [u0, u1] 上 ∫ du / r(u)（墙上时间）。 */
function WallIntegral(a, b, u0, u1) {
  if (u1 <= u0) return 0;
  if (Math.abs(b) < 1e-12) return (u1 - u0) / a;
  return (Math.log(a + b * u1) - Math.log(a + b * u0)) / b;
}

/** 预演时间 t 对应的墙上时间（从 0 起）：慢动作窗口里每一秒预演要花 1/rate 秒墙上时间，渐变段精确积分。单调递增。 */
export function PrevizWallTime(seq, t) {
  const T = Math.max(0, Finite(t) ? t : 0);
  const windows = (seq?.slowmo || []).filter(s => IsObject(s) && Finite(s.t) && Finite(s.dur) && s.dur > 0 && Finite(s.rate)).slice().sort((a, b) => a.t - b.t);
  let wall = 0, cursor = 0;
  for (const s of windows) {
    if (cursor >= T) break;
    const start = Math.max(cursor, s.t), end = Math.min(T, s.t + s.dur);
    if (start > cursor) wall += Math.min(T, start) - cursor;
    cursor = Math.max(cursor, Math.min(T, start));
    if (end <= start) continue;
    const fade = Math.min(Finite(s.fade) ? s.fade : PREVIZ_SLOWMO.fadeDefaultS, s.dur / 2);
    const rate = Math.min(PREVIZ_SLOWMO.rateMax, Math.max(PREVIZ_SLOWMO.rateMin, s.rate));
    // 三段：渐入 [s.t, s.t+fade]、平台、渐出 [s.t+dur-fade, s.t+dur]
    const pieces = fade > 1e-9
      ? [[s.t, s.t + fade, 1, (rate - 1) / fade], [s.t + fade, s.t + s.dur - fade, rate, 0], [s.t + s.dur - fade, s.t + s.dur, rate, (1 - rate) / fade]]
      : [[s.t, s.t + s.dur, rate, 0]];
    for (const [p0, p1, a0, b] of pieces) {
      const u0 = Math.max(start, p0), u1 = Math.min(end, p1);
      if (u1 <= u0) continue;
      // 倍率在这一段里写成 a + b·(u − p0)
      wall += WallIntegral(a0, b, u0 - p0, u1 - p0);
    }
    cursor = end;
  }
  if (cursor < T) wall += T - cursor;
  return wall;
}

/** 墙上时间 → 预演时间（PrevizWallTime 的反函数，二分到 1e-6 s）。 */
export function PrevizTimeFromWall(seq, wall) {
  const W = Math.max(0, Finite(wall) ? wall : 0);
  if (!(seq?.slowmo || []).length) return W;
  let lo = 0, hi = W;   // 预演时间 ≤ 墙上时间（倍率 ≤ 1）
  if (PrevizWallTime(seq, hi) < W) return W;
  for (let i = 0; i < 60 && hi - lo > 1e-6; i++) {
    const mid = (lo + hi) / 2;
    if (PrevizWallTime(seq, mid) < W) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------------------
// 演员

const compiled = new WeakMap();

/** 把一条演员轨按起点（关键帧布设 / spawn）编成「移动段 + 朝向键 + 阶跃字段」。结果按 entry + 起点缓存。 */
export function CompilePrevizActor(entry, baseUnit) {
  const base = entry?.spawn && IsObject(entry.spawn) ? entry.spawn : baseUnit || {};
  const cacheKey = `${base.x}|${base.z}|${base.yawDeg}|${base.stance}`;
  const hit = compiled.get(entry);
  if (hit && hit.key === cacheKey) return hit.track;
  const keys = StableSortByT((entry?.keys || []).filter(k => IsObject(k) && Finite(k.t)));
  const baseYaw = Finite(base.yawDeg) ? base.yawDeg : IsPoint(base.faceTo) ? YawDegFromTo(base, base.faceTo) : 0;
  let pos = { x: Finite(base.x) ? base.x : 0, z: Finite(base.z) ? base.z : 0 };
  let lastT = 0;
  const segments = [];
  for (const k of keys) {
    if (!Finite(k.x) || !Finite(k.z)) continue;
    const to = { x: k.x, z: k.z };
    const route = [pos, ...(Array.isArray(k.path) ? k.path.filter(IsPoint).map(p => ({ x: p.x, z: p.z })) : []), to];
    const length = RouteLength(route);
    const move = PREVIZ_MOVES.includes(k.move) ? k.move : "walk";
    const t1 = k.t;
    let t0 = t1;
    if (move !== "cut" && length > 1e-6 && t1 > lastT) {
      const travel = length / PREVIZ_MOVE_SPEED[move];
      t0 = Math.max(lastT, t1 - travel);
    }
    const faceAtEnd = Finite(k.yawDeg) || k.faceTo !== undefined ? k : null;
    segments.push({ t0, t1, route, length, move, cut: t1 - t0 <= 1e-6, from: pos, to, key: k, faceAtEnd });
    pos = to;
    lastT = t1;
  }
  const facing = keys.filter(k => Finite(k.yawDeg) || k.faceTo !== undefined);
  const fields = {};
  for (const f of KEY_FIELDS) fields[f] = keys.filter(k => k[f] !== undefined);
  // 朝向「换目标」的时刻：朝向键、移动段的起止
  const changes = [...new Set([...facing.map(k => k.t), ...segments.flatMap(s => (s.cut ? [s.t1] : [s.t0, s.t1]))])].sort((a, b) => a - b);
  const throws = keys.filter(k => IsPoint(k.throw));
  const track = { base, baseYaw, segments, facing, fields, changes, throws };
  compiled.set(entry, { key: cacheKey, track });
  return track;
}

function FaceYaw(k, at, resolve) {
  if (Finite(k.yawDeg)) return WrapDeg(k.yawDeg);
  const f = k.faceTo;
  const target = IsPoint(f) ? f : typeof f === "string" && resolve ? resolve(f) : null;
  if (!target || !Finite(target.x) || !Finite(target.z)) return null;
  if (Math.hypot(target.x - at.x, target.z - at.z) < 1e-4) return null;
  return YawDegFromTo(at, target);
}

function PositionAt(track, t) {
  let pos = { x: track.base.x ?? 0, z: track.base.z ?? 0 };
  for (const s of track.segments) {
    if (t >= s.t1) { pos = s.to; continue; }
    if (t < s.t0 || s.cut) return { ...pos, seg: null };
    const d = s.length * ((t - s.t0) / Math.max(1e-6, s.t1 - s.t0));
    const at = SampleRoute(s.route, d);
    return { x: at.x, z: at.z, seg: s, heading: s.move === "drag" ? WrapDeg(at.heading + 180) : at.heading };
  }
  return { ...pos, seg: null };
}

function TargetYaw(track, t, at, resolve) {
  if (at.seg) return at.heading;
  let face = null;
  for (const k of track.facing) if (k.t <= t) face = k;
  let arrival = null;
  for (const s of track.segments) if (s.t1 <= t) arrival = s;
  // 到点之后又来了朝向键：听朝向键的
  if (face && (!arrival || face.t > arrival.t1 || face === arrival.faceAtEnd)) {
    const y = FaceYaw(face, at, resolve);
    if (y !== null) return y;
  }
  // 走到了、本键没写朝向：保持到达时的行进方向（瞬移的不算行进，沿用之前的朝向）
  if (arrival && !arrival.cut && arrival.length > 1e-6) {
    const end = SampleRoute(arrival.route, arrival.length);
    return arrival.move === "drag" ? WrapDeg(end.heading + 180) : end.heading;
  }
  if (face) { const y = FaceYaw(face, at, resolve); if (y !== null) return y; }
  return track.baseYaw;
}

function YawAt(track, t, resolve, turnS, depth = 0) {
  const at = PositionAt(track, t);
  const target = TargetYaw(track, t, at, resolve);
  let change = null;
  for (const c of track.changes) if (c <= t && c > 0) change = c;
  if (change === null || t - change >= turnS || depth > 64) return target;
  const before = YawAt(track, change - 1e-4, resolve, turnS, depth + 1);
  return LerpYawDeg(before, target, (t - change) / turnS);
}

function StepField(track, name, t) {
  let hit;
  for (const k of track.fields[name]) if (k.t <= t) hit = k;
  return hit;
}

/**
 * 演员 entry 在 t 秒（序列时间）的状态。baseUnit = 当前关键帧里这个单位（归一化后的）；带 spawn 的 entry 用 spawn。
 * opts：resolve(id) → {x,z}（faceTo 指单位 id / "player" 时用）；clipDuration(name) → 秒；turnS。
 * lie：阶跃，没写过就沿用 baseUnit.lie（"along" / null）；weapon：阶跃，**只有键里写过才有值**（undefined = 用造人时那把，
 * 关键帧单位的缺省武器不在这里回填 —— 否则空手的翻译会被塞一支 Type38）。
 * throw：throw 键起 PREVIZ_THROW.clipS 秒内 = { seconds（抡了几秒）, x, z（落点）}，期间 clip 让位、stance 记 stand；否则 null。
 * ride（2026-10-20）：阶跃，没写过沿用 baseUnit / spawn 的 ride；归一化成 { on, x, z, y, yawDeg } 或 null。挂着时 x / z / yawDeg / moving
 * 照位置键算（运行时不用它们，按车的位姿摆人，位置键写了由校验报警告）。
 * dragSolo（2026-10-23，只对单被 litter 有意义）：阶跃，**只有键里写过才有值**（undefined = 用关键帧单位的 dragSolo）：true = 只认真有手攥着的被角，
 * 另一角不取镜像、落地（§5.6）。
 * @returns {{x,z,yawDeg,stance,aim,state,lie,weapon,ride,visible,carryRole,woundedWalk,talking,dragSolo,clip,clipSeconds,clipHold,throw,moving,speedMps,move}}
 */
export function SamplePrevizActor(entry, t, baseUnit, opts = {}) {
  const track = CompilePrevizActor(entry, baseUnit);
  const base = track.base;
  const turnS = Finite(opts.turnS) ? opts.turnS : PREVIZ_DEFAULTS.turnS;
  const time = Math.max(0, Finite(t) ? t : 0);
  const at = PositionAt(track, time);
  const yawDeg = YawAt(track, time, opts.resolve || null, turnS);
  const Value = (name, fallback) => { const k = StepField(track, name, time); return k ? k[name] : fallback; };
  const moving = !!at.seg;
  const move = at.seg ? at.seg.move : null;
  let stance = Value("stance", PREVIZ_STANCES.includes(base.stance) ? base.stance : "stand");
  if (move === "crawl") stance = "prone";
  const clipKey = StepField(track, "clip", time);
  let clip = clipKey ? clipKey.clip : null, clipSeconds = 0, clipHold = false, clipRelease = null;
  if (clip) {
    clipSeconds = time - clipKey.t + (Finite(clipKey.clipFrom) ? clipKey.clipFrom : 0);
    clipHold = clipKey.clipHold === true;
    // 2026-10-19：带停住段（清单 holdLoop）的片段，clipRelease = 片段播到这一秒就放开停住段、接着放出口（开场动作层的 pose.holdUntil）；
    // 不写 = 照旧在停住段里一直循环（0105 的 PvStandPointL 等靠这个停住）。
    clipRelease = Finite(clipKey.clipRelease) ? clipKey.clipRelease : null;
    const duration = opts.clipDuration?.(clip);
    if (Finite(duration) && duration > 0 && clipSeconds > duration) {
      if (clipHold) clipSeconds = duration;
      else { clip = null; clipSeconds = 0; }
    }
  }
  // 投弹：最近一个 throw 键起 clipS 秒内在抡（抡的时候站着、不播开场片段）
  let thrown = null;
  for (const k of track.throws) if (k.t <= time && time < k.t + PREVIZ_THROW.clipS) thrown = k;
  const throwState = thrown ? { seconds: time - thrown.t, x: thrown.throw.x, z: thrown.throw.z } : null;
  if (throwState) { clip = null; clipSeconds = 0; clipHold = false; clipRelease = null; stance = "stand"; }
  return {
    x: at.x, z: at.z, yawDeg,
    stance,
    aim: !!Value("aim", !!base.aim),
    state: Value("state", base.state === "down" ? "down" : "alive"),
    lie: PREVIZ_LIE_MODES.includes(Value("lie", base.lie)) ? Value("lie", base.lie) : null,
    weapon: Value("weapon", undefined),
    ride: NormalizeRide(Value("ride", base.ride ?? null)),
    visible: Value("visible", true) !== false,
    carryRole: Value("carryRole", null) || null,
    woundedWalk: !!Value("woundedWalk", false),
    talking: !!Value("talking", false),
    dragSolo: Value("dragSolo", undefined),
    clip, clipSeconds, clipHold, clipRelease,
    throw: throwState,
    moving, move,
    speedMps: at.seg ? at.seg.length / Math.max(1e-6, at.seg.t1 - at.seg.t0) : 0,
  };
}

/**
 * 一段预演里所有投弹的飞行：→ [{ actor, t0（脱手）, t1（落地）, from {x,y,z}, to {x,y,z}, arcM }]。
 * baseOf(id) → 关键帧单位（spawn 的人用 entry.spawn）；standAt(x,z) → 脚下地面。确定性（Seek 也对得上）。
 */
export function PrevizThrows(seq, baseOf, standAt, opts = {}) {
  const out = [];
  const T = PREVIZ_THROW;
  for (const entry of seq?.actors || []) {
    const base = entry.spawn && IsObject(entry.spawn) ? entry.spawn : baseOf?.(entry.id) || {};
    for (const k of entry.keys || []) {
      if (!IsObject(k) || !Finite(k.t) || !IsPoint(k.throw)) continue;
      const t0 = k.t + T.releaseS;
      const s = SamplePrevizActor(entry, t0, base, opts);
      const r = s.yawDeg * Math.PI / 180, fx = -Math.sin(r), fz = -Math.cos(r);
      const fromX = s.x + fx * T.releaseFwd - fz * T.releaseRight, fromZ = s.z + fz * T.releaseFwd + fx * T.releaseRight;
      const from = { x: fromX, y: standAt(s.x, s.z) + T.releaseH, z: fromZ };
      const to = { x: k.throw.x, y: standAt(k.throw.x, k.throw.z) + (Finite(k.throw.h) ? k.throw.h : T.targetH), z: k.throw.z };
      const dist = Math.hypot(to.x - from.x, to.z - from.z);
      const flight = Finite(k.throw.flightS) && k.throw.flightS > 0 ? k.throw.flightS
        : Math.min(T.flightMaxS, Math.max(T.flightMinS, T.flightBaseS + dist * T.flightPerM));
      out.push({ actor: entry.id, t0, t1: t0 + flight, from, to, arcM: Math.max(T.arcMinM, dist * T.arcPerM) });
    }
  }
  return out;
}

/** 飞行中的弹在 t 秒的位置（t 不在 [t0, t1] 里 → null）：两端连线 + 4·arc·u(1−u) 的抛物线。 */
export function SampleThrowFlight(flight, t) {
  if (!flight || !(t >= flight.t0) || t > flight.t1) return null;
  const u = (t - flight.t0) / Math.max(1e-6, flight.t1 - flight.t0);
  return { x: Lerp(flight.from.x, flight.to.x, u), y: Lerp(flight.from.y, flight.to.y, u) + 4 * flight.arcM * u * (1 - u), z: Lerp(flight.from.z, flight.to.z, u), u };
}

// ---------------------------------------------------------------------------
// 镜头

function Lerp(a, b, u) { return a + (b - a) * u; }
function LerpV(a, b, u) { return { x: Lerp(a.x, b.x, u), y: Lerp(a.y, b.y, u), z: Lerp(a.z, b.z, u) }; }
function YawPitchOf(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const flat = Math.hypot(dx, dz);
  return { yawDeg: flat > 1e-9 ? WrapDeg(Math.atan2(-dx, -dz) * 180 / Math.PI) : 0, pitchDeg: Math.atan2(dy, Math.max(1e-9, flat)) * 180 / Math.PI };
}

/** 一条镜头在局部进度 u（0–1，已经过 ease）时的机位。 */
function SampleShot(c, u, resolve) {
  if (c.eye) {
    const e = c.eye;
    const stance = PREVIZ_STANCES.includes(e.stance) ? e.stance : "stand";
    const anchor = Finite(e.x) && Finite(e.z) ? { x: e.x, z: e.z, h: PREVIZ_EYE_HEIGHT[stance] } : { actor: "player", offset: [0, PREVIZ_EYE_HEIGHT[stance], 0], eye: true, stance };
    const position = resolve(anchor);
    // 默认视线：起幅 look（锚点）或 yawDeg / pitchDeg，落幅 toLook（锚点）或 toYawDeg / toPitchDeg；锚点每次取样都重新算，
    // 所以 look 写飞机锚就是「视线跟着飞机走」（2026-10-21）
    const dir0 = IsObject(e.look) ? YawPitchOf(position, resolve(e.look))
      : { yawDeg: Finite(e.yawDeg) ? e.yawDeg : (position?.yawDeg ?? 0), pitchDeg: Finite(e.pitchDeg) ? e.pitchDeg : (position?.pitchDeg ?? 0) };
    const dir1 = IsObject(e.toLook) ? YawPitchOf(position, resolve(e.toLook))
      : { yawDeg: Finite(e.toYawDeg) ? e.toYawDeg : dir0.yawDeg, pitchDeg: Finite(e.toPitchDeg) ? e.toPitchDeg : dir0.pitchDeg };
    const yawDeg = LerpYawDeg(dir0.yawDeg, dir1.yawDeg, u);
    const pitchDeg = Lerp(dir0.pitchDeg, dir1.pitchDeg, u);
    return { position: { x: position.x, y: position.y, z: position.z }, yawDeg, pitchDeg, fov: c.fov ?? PREVIZ_DEFAULTS.fov, shake: c.shake || 0, eye: true, free: e.free === true };
  }
  const from = resolve(c.from), to = c.to ? resolve(c.to) : from;
  const look = resolve(c.look), lookTo = c.lookTo ? resolve(c.lookTo) : look;
  const position = LerpV(from, to, u), target = LerpV(look, lookTo, u);
  return { position, target, ...YawPitchOf(position, target), fov: c.fov ?? PREVIZ_DEFAULTS.fov, shake: c.shake || 0, eye: false };
}

/**
 * 切镜（2026-10-21，用户：「直接切镜我大概就能 get 意思」「实际游戏我也不会做镜头动画，除了非常少的几个」）：
 * 运镜不插值，一条镜头一开始就切到它的落幅（转头 = 直接看过去，推拉 = 直接到终点）；
 * 长于 splitS 秒、且起幅落幅差得多（转角 > splitDeg 或机位挪 > splitM）的，切成两个定镜：前半段起幅、后半段落幅
 * （从天上的飞机摇到地面、走一段路这种，起幅本身也有意思）。挂在演员 / 飞机上的锚照样跟着动（不然人跑出画）。
 * 单条写 `keepMove: true` 的照原样运镜（游戏里真做镜头动画的那几条）。
 */
export const PREVIZ_CUTS = Object.freeze({ splitS: 1.2, splitDeg: 20, splitM: 1.5 });

function ShotsDiffer(a, b) {
  return Math.abs(WrapDeg(b.yawDeg - a.yawDeg)) > PREVIZ_CUTS.splitDeg || Math.abs(b.pitchDeg - a.pitchDeg) > PREVIZ_CUTS.splitDeg
    || Math.hypot(b.position.x - a.position.x, b.position.y - a.position.y, b.position.z - a.position.z) > PREVIZ_CUTS.splitM;
}

/**
 * 镜头轨在 t 秒的机位。camera = 归一化后的 seq.camera；resolve(anchor) → {x,y,z}（点 {x,z,h?} 按地面 + h，
 * 演员锚按演员脚下 + offset；"player" 的眼睛锚还可以带 yawDeg / pitchDeg）。空轨返回 null。
 * 每条管 [t, t+dur)；空档沿用上一条的最后一帧；第一条之前用第一条的起点。
 * cuts：切镜（见 PREVIZ_CUTS；缺省 false = 照写的运镜，各关的数据测试按这个口径采样）。
 * @returns {{position:{x,y,z}, yawDeg, pitchDeg, fov, shake, index, eye, target?, cut?}|null}
 */
export function SamplePrevizCamera(camera, t, resolve, { cuts = false } = {}) {
  if (!Array.isArray(camera) || !camera.length || typeof resolve !== "function") return null;
  let index = 0;
  for (let i = 0; i < camera.length; i++) if (camera[i].t <= t) index = i;
  const c = camera[index];
  const dur = Math.max(0, c.dur || 0);
  const local = t < c.t ? 0 : dur > 0 ? Math.min(1, (t - c.t) / dur) : 1;
  if (cuts && c.keepMove !== true) {
    const end = SampleShot(c, 1, resolve);
    if (dur > PREVIZ_CUTS.splitS && local < 0.5) {
      const start = SampleShot(c, 0, resolve);
      if (ShotsDiffer(start, end)) return { ...start, index, cut: true };
    }
    return { ...end, index, cut: true };
  }
  const shot = SampleShot(c, PrevizEase(local, c.ease || PREVIZ_DEFAULTS.ease), resolve);
  return { ...shot, index };
}

/**
 * 能转头不能走（2026-10-21，§14.1 `eye.free`）：玩家一动鼠标 / 按方向键，视线就归玩家，到这一条镜头结束；
 * **紧挨着的几条 free 眼睛，只要位置、姿态一样，算同一段**（默认视线分几条写，玩家转头不被夺回），下一条不一样的镜头开始时收回。
 * → 这一条所属那一段的第一条镜头下标（不是 free 眼睛 → -1）。运行时按它判断「还是不是同一段」。
 */
export const PREVIZ_FREE_LOOK = Object.freeze({ samePosM: 0.05, degPerPx: 0.11, keyDegPerS: 90, pitchMaxDeg: 85 });
export function PrevizFreeLookSegment(camera, index) {
  if (!Array.isArray(camera) || !camera[index]?.eye || camera[index].eye.free !== true) return -1;
  const Same = (a, b) => a?.eye?.free === true && b?.eye?.free === true && (a.eye.stance || "stand") === (b.eye.stance || "stand")
    && Finite(a.eye.x) && Finite(b.eye.x) && Math.hypot(a.eye.x - b.eye.x, a.eye.z - b.eye.z) <= PREVIZ_FREE_LOOK.samePosM;
  let first = index;
  while (first > 0 && Same(camera[first - 1], camera[first])) first--;
  return first;
}

// ---------------------------------------------------------------------------
// 遮罩与震屏（确定性：同一 t 同一结果）

/**
 * t 秒时的白光（0–1）、黑场（0–1）、说明字、震屏强度。
 * 白光：开头瞬间满、按 dur 线性退；黑场：fade 秒渐入、保持、fade 秒渐出（fade 缺省 0.15）。
 */
export function PrevizOverlays(seq, t) {
  let flash = 0, black = 0, shake = 0;
  const captions = [];
  for (const e of seq?.events || []) {
    if (t < e.t) continue;
    const local = t - e.t, dur = Finite(e.dur) ? e.dur : 0;
    if (e.type === "flash" && local < dur) flash = Math.max(flash, (1 - local / dur) * (Finite(e.strength) ? e.strength : 1));
    else if (e.type === "black" && local < dur) {
      const fade = Math.min(Finite(e.fade) ? e.fade : 0.15, dur / 2);
      const k = fade > 0 ? Math.min(1, local / fade, (dur - local) / fade) : 1;
      black = Math.max(black, Clamp01(k));
    } else if (e.type === "caption" && local < dur) captions.push(e.text);
    else if (e.type === "shake" && local < dur) shake = Math.max(shake, (e.strength || 0) * (1 - local / dur));
  }
  return { flash, black, shake, captions };
}

/** 震屏偏移（确定性的几路正弦和）：→ {x,y,z 米, yawDeg, pitchDeg}。 */
export function PrevizShakeOffset(strength, t) {
  if (!(strength > 0)) return { x: 0, y: 0, z: 0, yawDeg: 0, pitchDeg: 0 };
  const s = Clamp01(strength);
  const n = (a, b, c) => Math.sin(t * a) * 0.6 + Math.sin(t * b + 1.3) * 0.3 + Math.sin(t * c + 2.1) * 0.1;
  return { x: n(23.1, 41.7, 67.3) * 0.06 * s, y: n(29.3, 53.9, 71.1) * 0.05 * s, z: n(19.7, 37.3, 61.9) * 0.06 * s,
    yawDeg: n(17.3, 33.1, 57.7) * 1.6 * s, pitchDeg: n(21.9, 45.3, 63.7) * 1.2 * s };
}

/** t 秒时该显示的台词（按序列 t + 清单时长 + 句尾挂留）：→ [{line, actor, start, end, index}]。 */
export function PrevizActiveLines(seq, t, lineDuration, holdS = PREVIZ_DEFAULTS.subtitleHoldS) {
  const out = [];
  (seq?.lines || []).forEach((l, index) => {
    const d = lineDuration?.(l.line) ?? 2;
    if (t >= l.t && t < l.t + d + holdS) out.push({ line: l.line, actor: l.actor ?? null, start: l.t, end: l.t + d, index });
  });
  return out;
}

/** t 秒时被事件改过的信号：→ Map(name → on)（只含事件动过的信号，按时间顺序取最后一次）。 */
export function PrevizSignalsAt(seq, t) {
  const map = new Map();
  for (const e of seq?.events || []) if (e.type === "signal" && e.t <= t) map.set(e.name, !!e.on);
  return map;
}

// ---------------------------------------------------------------------------
// 脚下地面（2026-10-18）：高度场 + 能一步踩上去的实心块顶面

export const STAND_MAX_STEP_M = 1.0;
const STAND_CELL_M = 4;
const STAND_SKIP_SEMANTICS = new Set(["water", "void", "foliage"]);

/**
 * 站人取地函数：脚下地面 = max(高度场, 点落在其脚印内的实心块的顶面)，
 * 只算顶面比该点高度场高出不超过 maxStepM 的块（射击台、台阶；洞顶、胸墙不算，否则洞里的人会被抬到洞顶上）。
 * 块按 ry（弧度，与 three rotation.y 同号）判脚印；gates 只算此刻还在场上的（signal 未发生 / appearSignal 已发生）。
 * blocks / gates：布局里的块（x,z,w,d,h,ry?,y?(中心高),solid,semantic,tag?）；y 缺省时按中心高度场 + h/2 算。
 * baseAt(x,z) → 高度场；signalled(name) → bool。→ (x,z) => y
 */
export function BlockStandSampler(blocks, gates, baseAt, signalled = () => false, { maxStepM = STAND_MAX_STEP_M } = {}) {
  const grid = new Map();
  const entries = [];
  const Add = (b, gate) => {
    if (!b || b.solid === false || !Finite(b.x) || !Finite(b.z) || !(b.w > 0) || !(b.d > 0) || !(b.h > 0)) return;
    if (STAND_SKIP_SEMANTICS.has(b.semantic) || b.blockoutWater || b.tag === "airWall" || b.airWall) return;
    const ry = Finite(b.ry) ? b.ry : 0, c = Math.cos(ry), s = Math.sin(ry);
    const top = Finite(b.y) ? b.y + b.h / 2 : baseAt(b.x, b.z) + b.h;
    const e = { x: b.x, z: b.z, hw: b.w / 2, hd: b.d / 2, c, s, top, gate };
    entries.push(e);
    const r = Math.hypot(e.hw, e.hd);
    for (let gx = Math.floor((b.x - r) / STAND_CELL_M); gx <= Math.floor((b.x + r) / STAND_CELL_M); gx++) {
      for (let gz = Math.floor((b.z - r) / STAND_CELL_M); gz <= Math.floor((b.z + r) / STAND_CELL_M); gz++) {
        const key = gx * 100003 + gz;
        let list = grid.get(key);
        if (!list) grid.set(key, list = []);
        list.push(e);
      }
    }
  };
  for (const b of blocks || []) Add(b, null);
  for (const g of gates || []) Add(g, g);
  const GateShown = (g) => (g.signal ? !signalled(g.signal) : g.appearSignal ? !!signalled(g.appearSignal) : true);
  const sampler = (x, z) => {
    const base = baseAt(x, z);
    const list = grid.get(Math.floor(x / STAND_CELL_M) * 100003 + Math.floor(z / STAND_CELL_M));
    if (!list) return base;
    let y = base;
    for (const e of list) {
      if (e.top <= y || e.top - base > maxStepM) continue;
      const dx = x - e.x, dz = z - e.z;
      const lx = dx * e.c - dz * e.s, lz = dx * e.s + dz * e.c;
      if (Math.abs(lx) > e.hw || Math.abs(lz) > e.hd) continue;
      if (e.gate && !GateShown(e.gate)) continue;
      y = e.top;
    }
    return y;
  };
  sampler.blockCount = entries.length;
  return sampler;
}
