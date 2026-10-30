// 白盒试玩的纯规则（docs/Data_EditorBlockout.md §17，2026-10-31）。
//
// 用户 10-31：「功能加上，把 01-05 做出来 play 感受一下」—— 白盒编辑器里选一段关键帧，按下「试玩」就从这一帧开打：
// 关键帧里摆的日军换成真 AI（会走位、会开枪、吃子弹），玩家不再无敌、子弹有数，一步打完自动进下一步，打完或死了出一张小结。
//
// 每关一份 Blockout/<Level>.play.json（可选；没有就按关键帧数据推断），与关键帧配置分开放：关键帧 JSON 由生成器重导会覆盖手改，
// 试玩编排单独一份不会被冲掉；agent 直接改它，开着的编辑器 2 s 内同步（试玩中改的下一次开打才生效）。
//
//   {
//     "schema": "tengxian-blockout-play/1", "level": "FirstLevel0105",
//     "defaults": { "invincible": false, "infiniteAmmo": false, "previz": true },
//     "ranges": [ { "id": "pit", "label": "03 守机枪坑", "from": "03-1", "to": "03-5" } ],   // 试玩面板上的预设段落
//     "steps": {
//       "02-4": { "mode": "fight", "clear": { "kill": "all" }, "push": ["pursuers"], "objective": "蹲在箱垛后把追兵打回去" },
//       "03-3": { "mode": "fight", "clear": { "time": 75 }, "push": ["rush1"], "mortar": { "from": ["IjaMortarA"], "everyS": 9 } }
//     }
//   }
//
// 一步（step）= 一个关键帧。mode：
//   fight  这一帧的日军（下面「谁变 AI」）换成真 AI；先走到这一帧的玩家站位（approach），到了才放兵；过关条件满足就进下一步
//   move   不放兵，走到 clear.reach（缺省 = 关键帧的 next 坐标，没有就是下一帧的玩家站位）
//   watch  看戏：有预演就播预演（可在面板里关），没有就把玩家摆到机位、停 watchS 秒；日军都是演员
//   skip   跳过
// 不写 mode：这一帧有能变 AI 的日军 → fight；否则有 next 坐标 → move；否则 watch。
//
// clear（满足任一条就过）：kill: "all" | n（这一步放出来的人打死几个）、reach: true | {x,z,r}、time: 秒。
// 谁变 AI：side 是 ija、kind 是 soldier / officer、没倒地、role 不是掷弹筒手 / 翻译、不在 keep 里；其余照旧是演员。
// push：按单位 id 或 group 点名，这些人往玩家那边压（AI order advance）；其余守在关键帧摆的位置（hold，半径 holdM）。
// mortar：掷弹筒（演员）每 everyS 秒往玩家身边打一发（落点随机散 spreadM），走游戏的 Combat.FireShell（有啸声、会炸死人）。
// fresh：这一步的人哪怕前面被打死过也重新放（关键帧里同一批追兵一路追、玩家每一处都打退一波时用）；缺省 false = 打死的不复活。
// bayonet：这一步放出来的人全上刺刀（拐角近战）；缺省只有 role 是 bayonet 的人上。
// alert：放兵时日军知不知道玩家在哪（缺省 true：这几仗都是日军冲着人来的；守点的远处机枪光靠眼睛看不见蹲在坑里的人）。
//   false = 不报，日军得自己看见 / 听见（以后摸进去的段落用）。
//
// 这一份零 three、零 DOM，node 直接测（Script_EditorBlockoutPlayPlanTest）。

export const BLOCKOUT_PLAY_SCHEMA = "tengxian-blockout-play/1";
export const BLOCKOUT_PLAY_MODES = Object.freeze(["fight", "move", "watch", "skip"]);

export const BLOCKOUT_PLAY = Object.freeze({
  /** 离这一步的玩家站位多远算「到了」（fight / move 的 approach 段）。 */
  approachM: 4,
  /** clear.reach 不写半径时的缺省。 */
  reachM: 3,
  /** watch 没有预演时停几秒。 */
  watchS: 4,
  /** 守点的半径：AI 在关键帧摆的位置附近这么大一圈里找掩体。 */
  holdM: 2.5,
  /** 过关后停一下再进下一步（让「✓ 打退了」那行字看得见、最后一枪的尸体倒下去）。 */
  clearPauseS: 1.2,
  /** 掷弹筒缺省：每几秒一发、第一发几秒后、落点散布、飞行时间（八九式 3.2 s）。 */
  mortarEveryS: 10,
  mortarFirstS: 6,
  mortarSpreadM: 7,
  mortarFlightS: 3.2,
  /** 玩家倒下后几秒弹小结（阵亡卡先放一会儿）。 */
  deathSummaryS: 2.6,
  /** 开打时报给日军的那一声能传多远（米）：听觉可信度按「距离 / 这个数」衰减，03 坑外最远的跃进组约 210 m，要让他们也到「警觉」。 */
  alertLoudnessM: 600,
  /** 放兵后几秒再报（感知在人第一次想事时才挂上）。 */
  alertDelayS: 0.6,
  /** 之后隔几秒再报一次（听来的觉察十来秒就消退）。 */
  alertEveryS: 4,
  /** 一步最多放多少个 AI（多出来的照旧是演员，避免一帧里塞几十个兵把帧打穿）。 */
  maxAiPerStep: 28,
});

/** 不变 AI 的角色：掷弹筒组（AI 不会用掷弹筒，由 mortar 规则代打）、翻译（不拿枪）。 */
export const PLAY_PUPPET_ROLES = Object.freeze(["mortar", "mortarLoader", "interpreter"]);
/** 能变 AI 的种类。 */
export const PLAY_AI_KINDS = Object.freeze(["soldier", "officer"]);

function IsObject(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
function Finite(value) { return typeof value === "number" && Number.isFinite(value); }
function IsNameList(value) { return Array.isArray(value) && value.every(item => typeof item === "string" && item); }

function ClearIssues(clear, at, errors) {
  if (!IsObject(clear)) { errors.push(`${at} 要是对象`); return; }
  const keys = Object.keys(clear);
  if (!keys.length) errors.push(`${at} 至少要有 kill / reach / time 之一`);
  for (const key of keys) if (!["kill", "reach", "time"].includes(key)) errors.push(`${at}.${key} 不认识（只认 kill / reach / time）`);
  if (clear.kill !== undefined && clear.kill !== "all" && !(Number.isInteger(clear.kill) && clear.kill >= 1)) errors.push(`${at}.kill 要是 "all" 或正整数`);
  if (clear.reach !== undefined && clear.reach !== true) {
    if (!IsObject(clear.reach) || !Finite(clear.reach.x) || !Finite(clear.reach.z)) errors.push(`${at}.reach 要是 true 或 {x, z, r?}`);
    else if (clear.reach.r !== undefined && !(Finite(clear.reach.r) && clear.reach.r > 0)) errors.push(`${at}.reach.r 要是正数`);
  }
  if (clear.time !== undefined && !(Finite(clear.time) && clear.time > 0)) errors.push(`${at}.time 要是正数（秒）`);
}

function MortarIssues(mortar, at, errors) {
  if (!IsObject(mortar)) { errors.push(`${at} 要是对象`); return; }
  if (!IsNameList(mortar.from) || !mortar.from.length) errors.push(`${at}.from 要是非空的单位 id 数组`);
  for (const key of ["everyS", "firstS", "spreadM", "flightS"]) {
    if (mortar[key] !== undefined && !(Finite(mortar[key]) && mortar[key] > 0)) errors.push(`${at}.${key} 要是正数`);
  }
}

function StepIssues(step, at, errors, warnings, kf) {
  if (!IsObject(step)) { errors.push(`${at} 要是对象`); return; }
  if (step.mode !== undefined && !BLOCKOUT_PLAY_MODES.includes(step.mode)) errors.push(`${at}.mode 要是 ${BLOCKOUT_PLAY_MODES.join(" / ")}`);
  if (step.clear !== undefined) ClearIssues(step.clear, `${at}.clear`, errors);
  for (const key of ["push", "keep"]) if (step[key] !== undefined && !IsNameList(step[key])) errors.push(`${at}.${key} 要是字符串数组（单位 id 或 group）`);
  if (step.mortar !== undefined) MortarIssues(step.mortar, `${at}.mortar`, errors);
  if (step.objective !== undefined && typeof step.objective !== "string") errors.push(`${at}.objective 要是字符串`);
  for (const key of ["approach", "fresh", "bayonet", "alert"]) if (step[key] !== undefined && typeof step[key] !== "boolean") errors.push(`${at}.${key} 要是布尔`);
  if (step.previz !== undefined && typeof step.previz !== "boolean") errors.push(`${at}.previz 要是布尔`);
  for (const key of ["holdM", "watchS", "approachM"]) if (step[key] !== undefined && !(Finite(step[key]) && step[key] > 0)) errors.push(`${at}.${key} 要是正数`);
  if (!kf) return;
  // 点名的人要在这一帧里（按 id 或 group 认）；对不上只警告：关键帧改过名、人删了，试玩照样能打
  const ids = new Set(kf.units?.map(u => u.id) || []), groups = new Set((kf.units || []).map(u => u.group).filter(Boolean));
  for (const key of ["push", "keep"]) for (const name of IsNameList(step[key]) ? step[key] : []) {
    if (!ids.has(name) && !groups.has(name)) warnings.push(`${at}.${key} 的 ${name} 在关键帧 ${kf.id} 里找不到（既不是单位 id 也不是 group）`);
  }
  if (IsObject(step.mortar) && IsNameList(step.mortar.from)) for (const id of step.mortar.from) {
    if (!ids.has(id)) warnings.push(`${at}.mortar.from 的 ${id} 不在关键帧 ${kf.id} 里`);
  }
  if (step.clear?.reach === true && !(kf.next && Finite(kf.next.x) && Finite(kf.next.z))) warnings.push(`${at}.clear.reach 是 true，但关键帧 ${kf.id} 的 next 没有坐标（会改用下一帧的玩家站位）`);
}

/**
 * 试玩编排校验。config = 已归一化的关键帧配置（给了就核对关键帧 id / 单位名）。
 * 错误 = 这份编排不用（按推断打）；警告 = 能打但值得看一眼。
 */
export function ValidateBlockoutPlay(doc, { config = null } = {}) {
  const errors = [], warnings = [];
  if (!IsObject(doc)) return { ok: false, errors: ["试玩编排要是一个 JSON 对象"], warnings };
  if (doc.schema !== BLOCKOUT_PLAY_SCHEMA) errors.push(`schema 要是 ${JSON.stringify(BLOCKOUT_PLAY_SCHEMA)}`);
  if (typeof doc.level !== "string" || !doc.level) errors.push("level 要是非空字符串");
  else if (config?.level && doc.level !== config.level) errors.push(`level 是 ${doc.level}，配置是 ${config.level}`);
  if (doc.defaults !== undefined) {
    if (!IsObject(doc.defaults)) errors.push("defaults 要是对象");
    else for (const key of ["invincible", "infiniteAmmo", "previz"]) {
      if (doc.defaults[key] !== undefined && typeof doc.defaults[key] !== "boolean") errors.push(`defaults.${key} 要是布尔`);
    }
  }
  const kfIndex = new Map((config?.keyframes || []).map((kf, i) => [kf.id, i]));
  if (doc.ranges !== undefined) {
    if (!Array.isArray(doc.ranges)) errors.push("ranges 要是数组");
    else {
      const seen = new Set();
      doc.ranges.forEach((range, i) => {
        const at = `ranges[${i}]`;
        if (!IsObject(range)) { errors.push(`${at} 要是对象`); return; }
        if (typeof range.id !== "string" || !range.id) errors.push(`${at}.id 要是非空字符串`);
        else if (seen.has(range.id)) errors.push(`${at}.id 重复：${range.id}`);
        else seen.add(range.id);
        if (typeof range.label !== "string" || !range.label) errors.push(`${at}.label 要是非空字符串`);
        if (typeof range.from !== "string" || typeof range.to !== "string") { errors.push(`${at} 要带 from / to（关键帧 id）`); return; }
        if (!config) return;
        if (!kfIndex.has(range.from)) errors.push(`${at}.from 的 ${range.from} 不是这一关的关键帧`);
        if (!kfIndex.has(range.to)) errors.push(`${at}.to 的 ${range.to} 不是这一关的关键帧`);
        if (kfIndex.has(range.from) && kfIndex.has(range.to) && kfIndex.get(range.to) < kfIndex.get(range.from)) errors.push(`${at} 的 to 在 from 前面`);
      });
    }
  }
  if (doc.steps !== undefined) {
    if (!IsObject(doc.steps)) errors.push("steps 要是对象（关键帧 id → 这一步怎么打）");
    else for (const [id, step] of Object.entries(doc.steps)) {
      const kf = config ? config.keyframes[kfIndex.get(id)] : null;
      if (config && !kf) { errors.push(`steps.${id} 不是这一关的关键帧`); continue; }
      StepIssues(step, `steps.${id}`, errors, warnings, kf);
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}

/** 归一化（校验过的）编排；null / 坏的 → 空编排（全按推断）。 */
export function NormalizeBlockoutPlay(doc) {
  const src = IsObject(doc) ? doc : {};
  const defaults = IsObject(src.defaults) ? src.defaults : {};
  return {
    level: typeof src.level === "string" ? src.level : "",
    defaults: {
      invincible: defaults.invincible === true,
      infiniteAmmo: defaults.infiniteAmmo === true,
      previz: defaults.previz !== false,
    },
    ranges: (Array.isArray(src.ranges) ? src.ranges : []).filter(r => IsObject(r) && typeof r.id === "string" && typeof r.from === "string" && typeof r.to === "string")
      .map(r => ({ id: r.id, label: typeof r.label === "string" && r.label ? r.label : r.id, from: r.from, to: r.to, note: typeof r.note === "string" ? r.note : "" })),
    steps: IsObject(src.steps) ? src.steps : {},
  };
}

/** 名单（单位 id 或 group）里有没有这个人。 */
export function NamedIn(list, unit) {
  if (!Array.isArray(list) || !unit) return false;
  return list.includes(unit.id) || (!!unit.group && list.includes(unit.group));
}

/** 这个单位在 fight 步里能不能变 AI（不看 keep / 上限 / 已阵亡，那几样由 PlayStepPlan 管）。 */
export function UnitCanFight(unit) {
  if (!unit || unit.side !== "ija" || unit.state === "down") return false;
  if (!PLAY_AI_KINDS.includes(unit.kind || "soldier")) return false;
  if (PLAY_PUPPET_ROLES.includes(unit.role)) return false;
  return true;
}

/** AI 拿什么枪：数据写了机枪就用；机枪手给十一式（归一化会给没写枪的日军填三八式，所以先看角色）；其余三八式。 */
export function PlayWeaponFor(unit) {
  if (unit.weapon === "Type11" || unit.weapon === "Type92Hmg") return unit.weapon;
  if (unit.role === "machineGun") return "Type11";
  return "Type38";
}

function NextPoint(kf) {
  return kf?.next && Finite(kf.next.x) && Finite(kf.next.z) ? { x: kf.next.x, z: kf.next.z } : null;
}

/**
 * 一步怎么打（纯函数）。
 *   config  已归一化的关键帧配置；index 这一步的关键帧下标
 *   play    NormalizeBlockoutPlay 的结果
 *   killed  已经在前面步里被打死的单位 id（同一个人不复活）
 * → { index, id, mode, approach, approachM, holdM, objective, clear: { kill, reach: {x,z,r}|null, time },
 *     ai: [{ id, x, z, yawDeg, weapon, bayonet, castId, order, group, name }], aiIds: Set, mortar, watchS, previz }
 */
export function PlayStepPlan(config, index, play = NormalizeBlockoutPlay(null), { killed = new Set(), first = false } = {}) {
  const kf = config.keyframes[index];
  const step = IsObject(play.steps?.[kf.id]) ? play.steps[kf.id] : {};
  const candidates = kf.units.filter(u => UnitCanFight(u) && !NamedIn(step.keep, u));
  let mode = step.mode;
  if (!mode) mode = candidates.length ? "fight" : NextPoint(kf) ? "move" : "watch";
  const ai = [];
  if (mode === "fight") {
    for (const unit of candidates) {
      if (killed.has(unit.id) && step.fresh !== true) continue;
      if (ai.length >= BLOCKOUT_PLAY.maxAiPerStep) break;
      ai.push({
        id: unit.id, name: unit.name || "", group: unit.group || "",
        x: unit.x, z: unit.z, yawDeg: unit.yawDeg ?? 0,
        weapon: PlayWeaponFor(unit),
        bayonet: step.bayonet === true || unit.role === "bayonet",
        castId: unit.castId || null,
        order: NamedIn(step.push, unit) ? "advance" : "hold",
      });
    }
  }
  const next = NextPoint(kf), following = config.keyframes[index + 1]?.player || null;
  const clear = { kill: null, reach: null, time: null };
  const raw = IsObject(step.clear) ? step.clear : null;
  if (raw) {
    if (raw.kill !== undefined) clear.kill = raw.kill;
    if (raw.reach === true) {
      const p = next || following;
      if (p) clear.reach = { x: p.x, z: p.z, r: (next && kf.next.radiusM) || BLOCKOUT_PLAY.reachM };
    } else if (IsObject(raw.reach)) clear.reach = { x: raw.reach.x, z: raw.reach.z, r: raw.reach.r || BLOCKOUT_PLAY.reachM };
    if (raw.time !== undefined) clear.time = raw.time;
  } else if (mode === "fight") {
    clear.kill = "all";
  } else if (mode === "move") {
    const p = next || following;
    if (p) clear.reach = { x: p.x, z: p.z, r: (next && kf.next.radiusM) || BLOCKOUT_PLAY.reachM };
    else clear.time = BLOCKOUT_PLAY.watchS;
  }
  // fight 步一个能打的人都没有（都在前面被打死了）：只剩 kill 条件就直接过，别卡住
  if (mode === "fight" && !ai.length && clear.reach === null && clear.time === null) clear.kill = 0;
  const mortar = IsObject(step.mortar) && IsNameList(step.mortar.from) ? {
    from: step.mortar.from.slice(),
    everyS: step.mortar.everyS || BLOCKOUT_PLAY.mortarEveryS,
    firstS: step.mortar.firstS || BLOCKOUT_PLAY.mortarFirstS,
    spreadM: step.mortar.spreadM || BLOCKOUT_PLAY.mortarSpreadM,
    flightS: step.mortar.flightS || BLOCKOUT_PLAY.mortarFlightS,
  } : null;
  const approach = (mode === "fight" || mode === "move") && !first && step.approach !== false;
  return {
    index, id: kf.id, label: kf.stageLabel || String(kf.stage).padStart(2, "0"), name: kf.name, mode,
    approach, approachM: step.approachM || BLOCKOUT_PLAY.approachM,
    holdM: step.holdM || BLOCKOUT_PLAY.holdM,
    objective: typeof step.objective === "string" && step.objective ? step.objective : (kf.next?.text || kf.name),
    clear, ai, aiIds: new Set(ai.map(a => a.id)), mortar, alert: step.alert !== false,
    watchS: step.watchS || BLOCKOUT_PLAY.watchS,
    previz: step.previz !== false,
  };
}

/**
 * 过关判断（纯函数）。ctx = { kills（这一步打死的人数）, spawned（这一步放出来的人数）, alive（还活着的这一步的人）,
 *   elapsedS（放兵后过了几秒；approach 段不算）, player: {x, z} }。→ "kill" | "reach" | "time" | null
 */
export function PlayStepCleared(clear, ctx) {
  if (clear.kill !== null && clear.kill !== undefined) {
    if (clear.kill === "all" ? (ctx.spawned > 0 ? ctx.alive === 0 : true) : ctx.kills >= clear.kill) return "kill";
  }
  if (clear.reach && ctx.player && Math.hypot(ctx.player.x - clear.reach.x, ctx.player.z - clear.reach.z) <= clear.reach.r) return "reach";
  if (clear.time && ctx.elapsedS >= clear.time) return "time";
  return null;
}

/** 关卡里的一段（含两头）：from / to 是关键帧 id 或下标；to 缺省 = 最后一帧。→ [下标…]（空 = 不成立） */
export function PlayRange(config, from, to = null) {
  const list = config?.keyframes || [];
  const Index = (v) => typeof v === "number" ? (v >= 0 && v < list.length ? v : -1) : list.findIndex(kf => kf.id === v);
  const a = Index(from), b = to === null || to === undefined ? list.length - 1 : Index(to);
  if (a < 0 || b < 0 || b < a) return [];
  const out = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

/** 秒 → 「1:05」。 */
export function FormatPlayTime(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
