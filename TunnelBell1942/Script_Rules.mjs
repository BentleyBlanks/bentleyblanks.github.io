// 《地道战 · 钟声》—— 玩法核心（纯逻辑，禁止 import three.js）。
//
// 这个文件必须能在纯 Node 里跑：冒烟测试 / 机器人自动通关都靠它。
// 只依赖 Data_Contract.mjs（常量）、Data_Levels.mjs（关卡）、Data_Story.mjs（剧情文本）。
//
// 动词表：走 / 猫腰 / 爬 / 攀 / 用 / 携带一件 / 呼应。没有攻击，没有跳跃，没有血条。
// 冲突全部靠躲、藏、堵、引解决。

import {
  PLAYER,
  NOISE,
  SENSE,
  CAMERA,
  HAZARD,
  INTERACT,
  FOLLOW,
  ITEMS,
  HEADROOM,
  NextRandom,
  Clamp,
  Lerp,
  Approach,
} from "./Data_Contract.mjs";
import * as Levels from "./Data_Levels.mjs";
import * as Story from "./Data_Story.mjs";

/** 存档键。契约要求从 Data_Story 转出。 */
export const SAVE_KEY =
  (Story && typeof Story.SAVE_KEY === "string" && Story.SAVE_KEY) ||
  "tunnelbell1942_v1";

// ───────────────────────────── 内部调参 ─────────────────────────────

const MAX_STEP = 1 / 30; // StepPlay 子步上限
const MAX_SUBSTEPS = 64;
const EVENT_CAP = 256;

const STEP_UP = 0.55; // 能自动迈上的台阶高度，超过算墙
const FLOOR_SNAP = 0.34; // 站立时脚下地板的吸附容差
const SHAFT_GRAB_X = 0.6; // 竖井吸附的水平半径（契约写死 ±0.6）

const LAND_STUN_SEC = 0.62; // 超过 safeFallSpeed 的硬直
const LAND_STUMBLE_SEC = 0.16; // 普通落地的小踉跄
const DEATH_RESPAWN_SEC = 1.5;

const HEAR_RISE_PER_SEC = 0.78; // 听觉抬警觉的速度
const HEAR_ALERT_CAP = 0.82; // 光靠听永远抓不到人（>searchAt，<1）
const SEARCH_LOOK_SEC = 2.4;
const SUSPICIOUS_HOLD_SEC = 1.1;

const PROBE_WIND_SEC = 1.0; // 刺刀前摇（契约底线 ≥0.8）
const PROBE_STRIKE_SEC = 0.28;
const PROBE_REST_SEC = 1.5;
const PROBE_RADIUS = 0.8;

const TRAIL_STEP = 0.26; // 面包屑采样间距
const TRAIL_MAX = 512;

const HAZARD_HEIGHT = 2.4; // 危害在竖直方向覆盖多高
const HAZARD_RAMP = 0.85; // 浓度爬升（每秒）
const HAZARD_CLEAR = 1.3; // 封住后浓度回落（每秒）

const CHECKPOINT_RADIUS = 1.7;

// ───────────────────────────── 小工具 ─────────────────────────────

function DeepClone(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    const out = new Array(value.length);
    for (let i = 0; i < value.length; i++) out[i] = DeepClone(value[i]);
    return out;
  }
  const out = {};
  for (const key in value) {
    if (Object.prototype.hasOwnProperty.call(value, key)) out[key] = DeepClone(value[key]);
  }
  return out;
}

function Num(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function Arr(value) {
  return Array.isArray(value) ? value : [];
}

function Emit(state, event) {
  if (state.events.length >= EVENT_CAP) state.events.shift();
  state.events.push(event);
}

function Sfx(state, id, x, y) {
  Emit(state, { kind: "sfx", id, x: Num(x, state.player.x), y: Num(y, state.player.y) });
}

function Shake(state, power) {
  state.camera.shake = Clamp(Math.max(state.camera.shake, power), 0, 1);
  Emit(state, { kind: "shake", power });
}

function Dust(state, x, y, power) {
  Emit(state, { kind: "dust", x, y, power });
}

function SetAnim(holder, name, speed, dt) {
  const anim = holder.anim;
  if (anim.name !== name) {
    anim.name = name;
    anim.t = 0;
  } else {
    anim.t += dt;
  }
  anim.speed = Clamp(Num(speed, 0), 0, 1);
}

// ───────────────────────────── 关卡装载与归一化 ─────────────────────────────

// 兜底关卡：只在 Data_Levels 完全缺失/损坏时使用，保证不黑屏、不抛错。
function FallbackLevel(index) {
  const id = "act" + (index + 1);
  return {
    id,
    chapterId: id,
    title: "（缺少关卡数据）",
    actor: index === 0 ? "laozhong" : "chuanbao",
    bounds: { x0: 0, x1: 60, yTop: 6, yBottom: -12 },
    startX: 4,
    startY: 0,
    exit: { x: 54, y: 0, radius: 2.2, needAllVillagers: false, label: "村口" },
    timeOfDay: "night",
    floors: [{ id: "f_ground", x0: -4, x1: 64, y: 0, kind: "dirt" }],
    ceils: [],
    shafts: [],
    hatches: [],
    props: [],
    enemies: [],
    npcs: [],
    hazards: [],
    triggers: [],
    checkpoints: [{ id: "cp_start", x: 4, y: 0, label: "起点" }],
    objectives: [{ id: "obj_exit", text: "前往村口", doneWhen: { atExit: true } }],
  };
}

function NormalizeLevel(raw, index) {
  const level = raw && typeof raw === "object" ? raw : FallbackLevel(index);

  level.id = typeof level.id === "string" ? level.id : "act" + (index + 1);
  level.chapterId = typeof level.chapterId === "string" ? level.chapterId : level.id;
  level.title = typeof level.title === "string" ? level.title : "";
  level.actor = typeof level.actor === "string" ? level.actor : "chuanbao";
  level.timeOfDay = typeof level.timeOfDay === "string" ? level.timeOfDay : "night";

  const b = level.bounds && typeof level.bounds === "object" ? level.bounds : {};
  level.bounds = {
    x0: Num(b.x0, 0),
    x1: Num(b.x1, 160),
    yTop: Num(b.yTop, 6),
    yBottom: Num(b.yBottom, -12),
  };

  level.startX = Num(level.startX, level.bounds.x0 + 4);
  level.startY = Num(level.startY, 0);

  const ex = level.exit && typeof level.exit === "object" ? level.exit : {};
  level.exit = {
    x: Num(ex.x, level.bounds.x1 - 6),
    y: Num(ex.y, 0),
    radius: Num(ex.radius, 2.2),
    needAllVillagers: !!ex.needAllVillagers,
    label: typeof ex.label === "string" ? ex.label : "出口",
  };

  level.floors = Arr(level.floors).map((f, i) => ({
    id: typeof f.id === "string" ? f.id : "floor_" + i,
    x0: Num(f.x0, 0),
    x1: Num(f.x1, 0),
    y: Num(f.y, 0),
    kind: typeof f.kind === "string" ? f.kind : "dirt",
  }));
  if (level.floors.length === 0) {
    level.floors.push({
      id: "floor_auto",
      x0: level.bounds.x0 - 4,
      x1: level.bounds.x1 + 4,
      y: 0,
      kind: "dirt",
    });
  }

  level.ceils = Arr(level.ceils).map((c) => ({
    x0: Num(c.x0, 0),
    x1: Num(c.x1, 0),
    y: Num(c.y, 0),
  }));

  level.shafts = Arr(level.shafts).map((s, i) => ({
    id: typeof s.id === "string" ? s.id : "shaft_" + i,
    x: Num(s.x, 0),
    yTop: Num(s.yTop, 0),
    yBottom: Num(s.yBottom, -8),
    kind: typeof s.kind === "string" ? s.kind : "ladder",
    requiresHatch: s.requiresHatch || null,
  }));

  level.hatches = Arr(level.hatches).map((h, i) => ({
    id: typeof h.id === "string" ? h.id : "hatch_" + i,
    x: Num(h.x, 0),
    shaftId: h.shaftId || null,
    hidden: !!h.hidden,
    opened: !!h.opened,
    revealBy: h.revealBy || null,
    label: typeof h.label === "string" ? h.label : "地道口",
    propId: h.propId || null,
  }));

  level.props = Arr(level.props).map((p, i) => ({
    id: typeof p.id === "string" ? p.id : "prop_" + i,
    x: Num(p.x, 0),
    y: Num(p.y, 0),
    z: Num(p.z, 0),
    kind: typeof p.kind === "string" ? p.kind : "sign",
    facing: Num(p.facing, 1) < 0 ? -1 : 1,
    interact: typeof p.interact === "string" ? p.interact : "none",
    data: p.data && typeof p.data === "object" ? p.data : {},
    label: typeof p.label === "string" ? p.label : "",
    hidden: !!p.hidden,
  }));

  level.enemies = Arr(level.enemies).map((e, i) => {
    const patrol = e.patrol && typeof e.patrol === "object" ? e.patrol : null;
    const vision = e.vision && typeof e.vision === "object" ? e.vision : {};
    return {
      id: typeof e.id === "string" ? e.id : "enemy_" + i,
      x: Num(e.x, 0),
      y: Num(e.y, 0),
      kind: typeof e.kind === "string" ? e.kind : "search",
      facing: Num(e.facing, 1) < 0 ? -1 : 1,
      patrol: patrol
        ? {
            x0: Num(patrol.x0, Num(e.x, 0)),
            x1: Num(patrol.x1, Num(e.x, 0)),
            speed: Num(patrol.speed, 1.4),
            pauseSec: Num(patrol.pauseSec, 1.2),
          }
        : null,
      vision: {
        range: Num(vision.range, 9),
        halfAngleDeg: Num(vision.halfAngleDeg, 38),
        height: Num(vision.height, 1.5),
      },
      hearing: Num(e.hearing, 6),
      probeAt: Array.isArray(e.probeAt) && e.probeAt.length ? e.probeAt.map((v) => Num(v, 0)) : null,
    };
  });

  level.npcs = Arr(level.npcs).map((n, i) => ({
    id: typeof n.id === "string" ? n.id : "npc_" + i,
    x: Num(n.x, 0),
    y: Num(n.y, 0),
    name: typeof n.name === "string" ? n.name : "乡亲",
    role: typeof n.role === "string" ? n.role : "villager",
    follow: !!n.follow,
    rescued: !!n.rescued,
  }));

  level.hazards = Arr(level.hazards).map((h, i) => ({
    id: typeof h.id === "string" ? h.id : "hazard_" + i,
    kind: typeof h.kind === "string" ? h.kind : "gas",
    x0: Num(h.x0, 0),
    x1: Num(h.x1, 0),
    y: Num(h.y, 0),
    armAt: h.armAt || null,
    speed: Num(h.speed, 0),
    sealedBy: h.sealedBy || null,
  }));

  level.triggers = Arr(level.triggers).map((t, i) => {
    const emit = t.emit && typeof t.emit === "object" ? t.emit : {};
    return {
      id: typeof t.id === "string" ? t.id : "trigger_" + i,
      x0: Num(t.x0, 0),
      x1: Num(t.x1, 0),
      yMin: Num(t.yMin, level.bounds.yBottom),
      yMax: Num(t.yMax, level.bounds.yTop),
      once: t.once === undefined ? true : !!t.once,
      emit: {
        panels: Arr(emit.panels),
        reveal: Arr(emit.reveal),
        arm: Arr(emit.arm),
        spawn: Arr(emit.spawn),
        objective: typeof emit.objective === "string" ? emit.objective : null,
        checkpoint: !!emit.checkpoint,
        win: !!emit.win,
      },
    };
  });

  level.checkpoints = Arr(level.checkpoints).map((c, i) => ({
    id: typeof c.id === "string" ? c.id : "cp_" + i,
    x: Num(c.x, 0),
    y: Num(c.y, 0),
    label: typeof c.label === "string" ? c.label : "",
  }));

  level.objectives = Arr(level.objectives).map((o, i) => ({
    id: typeof o.id === "string" ? o.id : "obj_" + i,
    text: typeof o.text === "string" ? o.text : "",
    doneWhen: o.doneWhen && typeof o.doneWhen === "object" ? o.doneWhen : {},
  }));

  return level;
}

function LoadLevelData(index) {
  const list = Levels && Array.isArray(Levels.LEVELS) ? Levels.LEVELS : null;
  const count = list ? list.length : 0;
  const safeIndex = count > 0 ? Clamp(Math.round(index) || 0, 0, count - 1) : Math.max(0, Math.round(index) || 0);

  let raw = null;
  if (Levels && typeof Levels.GetLevel === "function") {
    try {
      raw = Levels.GetLevel(safeIndex);
    } catch (err) {
      raw = null;
    }
  }
  if (!raw && list && list[safeIndex]) raw = DeepClone(list[safeIndex]);
  if (!raw || typeof raw !== "object") raw = FallbackLevel(safeIndex);
  return NormalizeLevel(raw, safeIndex);
}

/** 关卡总数（Main 判断还有没有下一幕）。 */
export function LevelCount() {
  return Levels && Array.isArray(Levels.LEVELS) ? Levels.LEVELS.length : 1;
}

// ───────────────────────────── 地形查询 ─────────────────────────────

function FloorUnder(level, x, y, tol) {
  const t = Num(tol, FLOOR_SNAP);
  const floors = level.floors;
  let best = null;
  for (let i = 0; i < floors.length; i++) {
    const f = floors[i];
    if (x < f.x0 - 0.02 || x > f.x1 + 0.02) continue;
    if (f.y > y + t) continue;
    if (!best || f.y > best.y) best = f;
  }
  return best;
}

function CeilAbove(level, x, floorY) {
  const ceils = level.ceils;
  let best = Infinity;
  for (let i = 0; i < ceils.length; i++) {
    const c = ceils[i];
    if (x < c.x0 - 0.02 || x > c.x1 + 0.02) continue;
    if (c.y <= floorY + 0.12) continue;
    if (c.y < best) best = c.y;
  }
  return best;
}

/** 某个 x 上、以 refY 为脚下参考的净空。没有地板返回 null。 */
function Column(level, x, refY, tol) {
  const floor = FloorUnder(level, x, refY, tol);
  if (!floor) return { floor: null, floorY: null, ceilY: Infinity, clearance: Infinity };
  const ceilY = CeilAbove(level, x, floor.y);
  return {
    floor,
    floorY: floor.y,
    ceilY,
    clearance: ceilY === Infinity ? Infinity : ceilY - floor.y,
  };
}

function PostureFor(clearance, wantCrouch) {
  if (clearance < HEADROOM.crouchNeeds) return "crawl";
  if (clearance < HEADROOM.standNeeds || wantCrouch) return "crouch";
  return "stand";
}

function PostureHeight(posture) {
  if (posture === "crawl") return PLAYER.crawlHeight;
  if (posture === "crouch") return PLAYER.crouchHeight;
  return PLAYER.standHeight;
}

/** 目标 x 能不能过去（净空够爬 + 台阶不太高 + 不出界）。 */
function CanWalkTo(state, x, fromY) {
  const level = state.level;
  if (x < level.bounds.x0 - 1 || x > level.bounds.x1 + 1) return false;
  const col = Column(level, x, fromY + STEP_UP, STEP_UP + FLOOR_SNAP);
  if (!col.floor) return true; // 悬空：允许走过去然后掉下去
  if (col.clearance < HEADROOM.crawlNeeds - 0.02) return false;
  if (col.floorY > fromY + STEP_UP) return false;
  return true;
}

// ───────────────────────────── State 构造 ─────────────────────────────

function MakeAnim() {
  return { name: "idle", t: 0, speed: 0 };
}

/** 建立一个新的游戏状态（默认第一幕）。 */
export function CreateState(levelIndex = 0) {
  const state = {
    levelIndex: 0,
    level: null,
    phase: "play",
    time: 0,
    seed: 0x2b1a09,

    player: {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      facing: 1,
      layer: "surface",
      onGround: true,
      onShaft: false,
      crouch: false,
      sneak: false,
      hidden: false,
      dead: false,
      carrying: null,
      anim: MakeAnim(),
      noise: 0,
      lightRadius: 2.4,

      // 扩展字段（渲染层可选读取）
      posture: "stand",
      height: PLAYER.standHeight,
      shaftId: null,
      hidePropId: null,
      action: null,
      actionTimer: 0,
      actionTotal: 0,
      actionPropId: null,
      stagger: 0,
      deathTimer: 0,
      noiseSpike: 0,
      stepTimer: 0,
    },

    camera: { x: 0, y: 0, viewHeight: CAMERA.viewHeight, shake: 0 },
    enemies: [],
    npcs: [],
    hazards: [],
    world: {
      hatches: {},
      levers: {},
      pushed: {},
      picked: {},
      codex: {},
      revealed: {},
      used: {},
      dropCount: 0,
    },
    story: { chapterId: "act1", queue: [], seen: {}, objectiveText: "" },
    hud: {
      prompt: null,
      objective: "",
      suspicion: 0,
      villagersSafe: 0,
      villagersTotal: 0,
      codexCount: 0,
      carryLabel: null,
    },
    input: {
      moveX: 0,
      up: false,
      down: false,
      crouch: false,
      sneak: false,
      interactPressed: false,
      itemPressed: false,
      callPressed: false,
    },
    events: [],
    checkpointId: null,
    stats: { deaths: 0, timeInLevel: 0 },

    // 内部簿记（渲染层不需要读）
    triggersFired: {},
    triggersInside: {},
    panelTimer: 0,
    panelId: null,
    trail: [],
    winTimer: 0,
  };

  ResetLevel(state, levelIndex);
  return state;
}

/** 重开某一幕（也用于进入下一幕）。 */
export function ResetLevel(state, levelIndex) {
  const index = Math.max(0, Math.round(Num(levelIndex, 0)));
  const level = LoadLevelData(index);

  state.levelIndex = index;
  state.level = level;
  state.phase = "play";
  state.time = 0;
  state.seed = (0x2b1a09 + index * 7919) | 0;
  state.events.length = 0;
  state.triggersFired = {};
  state.triggersInside = {};
  state.panelTimer = 0;
  state.panelId = null;
  state.trail = [];
  state.winTimer = 0;
  state.checkpointId = null;
  state.stats.timeInLevel = 0;

  // 世界持久量
  state.world.hatches = {};
  for (const h of level.hatches) {
    state.world.hatches[h.id] = {
      opened: !!h.opened,
      hidden: !!h.hidden,
      x: h.x,
      shaftId: h.shaftId,
      label: h.label,
    };
  }
  state.world.levers = {};
  state.world.pushed = {};
  state.world.picked = {};
  state.world.revealed = {};
  state.world.used = {};
  state.world.dropCount = 0;
  // codex 跨幕保留，不清空

  // 敌人运行时
  const spawnGated = {};
  for (const t of level.triggers) {
    for (const id of t.emit.spawn) spawnGated[id] = true;
  }
  state.enemies = level.enemies.map((e) => ({
    id: e.id,
    x: e.x,
    y: e.y,
    facing: e.facing,
    kind: e.kind,
    state: e.patrol ? "patrol" : "idle",
    alertness: 0,
    anim: MakeAnim(),
    visionRange: e.vision.range,
    visionHalfAngleDeg: e.vision.halfAngleDeg,

    // 内部
    homeX: e.x,
    homeY: e.y,
    homeFacing: e.facing,
    visionHeight: e.vision.height,
    hearing: e.hearing,
    patrol: e.patrol,
    patrolDir: 1,
    pauseTimer: 0,
    lookTimer: 0,
    lastSeenX: e.x,
    lastSeenY: e.y,
    hasLead: false,
    dormant: !!spawnGated[e.id],
    probeAt: e.probeAt,
    probeIndex: 0,
    probePhase: "move",
    probeTimer: 0,
    stepTimer: 0,
    barkTimer: 0,
  }));

  // 乡亲运行时
  state.npcs = level.npcs.map((n) => ({
    id: n.id,
    x: n.x,
    y: n.y,
    facing: 1,
    name: n.name,
    role: n.role,
    follow: !!n.follow,
    rescued: !!n.rescued,
    anim: MakeAnim(),
    homeX: n.x,
    homeY: n.y,
    order: 0,
  }));

  // 危害运行时（armAt 为 null 视为常驻休眠，只能被 trigger 的 arm 唤醒）
  state.hazards = level.hazards.map((h) => ({
    id: h.id,
    kind: h.kind,
    x0: h.x0,
    x1: h.x0, // 对外暴露的是当前锋面
    y: h.y,
    active: false,
    level: 0,

    srcX0: h.x0,
    srcX1: h.x1,
    armAt: h.armAt,
    armed: false,
    warn: 0,
    front: 0,
    speed: h.speed > 0 ? h.speed : h.kind === "water" ? HAZARD.waterSpeed : HAZARD.gasSpeed,
    sealedBy: h.sealedBy,
    hissTimer: 0,
  }));

  // 玩家
  const p = state.player;
  p.x = level.startX;
  p.y = level.startY;
  p.vx = 0;
  p.vy = 0;
  p.facing = 1;
  p.onShaft = false;
  p.shaftId = null;
  p.hidden = false;
  p.hidePropId = null;
  p.dead = false;
  p.deathTimer = 0;
  p.carrying = null;
  p.action = null;
  p.actionTimer = 0;
  p.actionTotal = 0;
  p.actionPropId = null;
  p.stagger = 0;
  p.noise = 0;
  p.noiseSpike = 0;
  p.stepTimer = 0;
  p.anim.name = "idle";
  p.anim.t = 0;
  p.anim.speed = 0;
  SnapToFloor(state);

  // 剧情
  state.story.chapterId = level.chapterId;
  state.story.queue = [];
  state.story.objectiveText = "";
  const chapter = FindChapter(level.chapterId);
  if (chapter && Array.isArray(chapter.opening)) {
    for (const id of chapter.opening) QueuePanel(state, id);
  }

  state.hud.villagersTotal = state.npcs.length;
  state.hud.villagersSafe = state.npcs.filter((n) => n.rescued).length;
  state.hud.codexCount = Object.keys(state.world.codex).length;

  SnapCamera(state);
  UpdateHud(state);
  return state;
}

function FindChapter(chapterId) {
  const list = Story && Array.isArray(Story.CHAPTERS) ? Story.CHAPTERS : null;
  if (!list) return null;
  for (const c of list) {
    if (c && c.id === chapterId) return c;
  }
  return null;
}

function QueuePanel(state, panelId) {
  if (typeof panelId !== "string" || !panelId) return;
  if (state.story.seen[panelId]) return;
  if (state.story.queue.indexOf(panelId) >= 0) return;
  state.story.queue.push(panelId);
}

function PanelDuration(panelId) {
  const panels = Story && Story.PANELS ? Story.PANELS : null;
  const panel = panels ? panels[panelId] : null;
  const text = panel && typeof panel.text === "string" ? panel.text : "";
  return Clamp(1.5 + text.length * 0.11, 1.5, 4.2);
}

function SnapToFloor(state) {
  const p = state.player;
  const col = Column(state.level, p.x, p.y + 0.6, 2.5);
  if (col.floor) {
    p.y = col.floorY;
    p.onGround = true;
    p.vy = 0;
  }
  RefreshPosture(state, 0);
  UpdateLayer(p);
}

function SnapCamera(state) {
  const p = state.player;
  state.camera.x = p.x;
  state.camera.y = p.y + 0.9;
  state.camera.viewHeight = p.layer === "tunnel" ? CAMERA.tunnelViewHeight : CAMERA.viewHeight;
  state.camera.shake = 0;
  ClampCamera(state);
}

function UpdateLayer(p) {
  p.layer = p.y < -1 ? "tunnel" : "surface";
}

// ───────────────────────────── 主循环 ─────────────────────────────

/** 推进一帧。dt 秒；内部 clamp 到 ≤1/30，超出分多个子步。确定性，无 Math.random。 */
export function StepPlay(state, dt) {
  if (!state || !state.level) return;
  let remain = Num(dt, 0);
  if (remain <= 0) return;
  if (remain > 0.5) remain = 0.5; // 掉帧保护：宁可慢放也不穿墙
  let guard = 0;
  while (remain > 1e-6 && guard++ < MAX_SUBSTEPS) {
    const step = remain > MAX_STEP ? MAX_STEP : remain;
    SubStep(state, step);
    remain -= step;
  }
  // 边沿输入在一帧内只消费一次
  state.input.interactPressed = false;
  state.input.itemPressed = false;
  state.input.callPressed = false;
}

function SubStep(state, dt) {
  state.time += dt;

  UpdatePanels(state, dt);

  const simulating = state.phase === "play" || state.phase === "lost";
  if (simulating) {
    state.stats.timeInLevel += dt;
    if (state.phase === "play" && !state.player.dead) {
      UpdatePlayer(state, dt);
      UpdateTriggers(state);
      UpdateCheckpoints(state);
    } else {
      UpdateDeadPlayer(state, dt);
    }
    UpdateTrail(state);
    UpdateHazards(state, dt);
    UpdateEnemies(state, dt);
    UpdateNpcs(state, dt);
    if (state.phase === "play" && !state.player.dead) CheckWin(state, dt);
  } else if (state.phase === "won" || state.phase === "chapterEnd") {
    IdleAnims(state, dt);
  }

  UpdateCamera(state, dt);
  UpdateHud(state);
}

function IdleAnims(state, dt) {
  SetAnim(state.player, state.player.carrying ? "carryIdle" : "idle", 0, dt);
  for (const e of state.enemies) SetAnim(e, "idle", 0, dt);
  for (const n of state.npcs) SetAnim(n, "idle", 0, dt);
}

// ───────────────────────────── 漫画气泡 ─────────────────────────────

function UpdatePanels(state, dt) {
  if (state.phase === "won" || state.phase === "chapterEnd") return;

  if (state.phase === "panel") {
    state.panelTimer -= dt;
    const canSkip = state.panelTimer <= PanelDuration(state.panelId) - 0.4;
    if (state.input.interactPressed && canSkip) {
      state.input.interactPressed = false;
      state.panelTimer = 0;
    }
    if (state.panelTimer <= 0) {
      if (state.panelId) state.story.seen[state.panelId] = true;
      state.panelId = null;
      state.phase = "play";
    }
    return;
  }

  if (state.phase === "play" && state.story.queue.length > 0) {
    const id = state.story.queue.shift();
    state.panelId = id;
    state.panelTimer = PanelDuration(id);
    state.phase = "panel";
    Emit(state, { kind: "panel", id });
    // 停下脚步，别在气泡里滑行
    state.player.vx = 0;
  }
}

/** 让 UI 提前跳过当前气泡（Main 可选调用）。 */
export function DismissPanel(state) {
  if (state.phase !== "panel") return false;
  if (state.panelId) state.story.seen[state.panelId] = true;
  state.panelId = null;
  state.panelTimer = 0;
  state.phase = "play";
  return true;
}

// ───────────────────────────── 玩家 ─────────────────────────────

function RefreshPosture(state, dt) {
  const p = state.player;
  const col = Column(state.level, p.x, p.y + 0.15, FLOOR_SNAP);
  const clearance = col.clearance;
  const wantCrouch = !!state.input.crouch;
  const posture = PostureFor(clearance, wantCrouch);
  p.posture = posture;
  p.height = PostureHeight(posture);
  p.crouch = posture !== "stand";
  return col;
}

function MoveSpeedFor(p, input) {
  let speed;
  if (p.posture === "crawl") speed = PLAYER.crawlSpeed;
  else if (p.posture === "crouch") speed = input.sneak ? PLAYER.crouchSpeed * 0.72 : PLAYER.crouchSpeed;
  else speed = input.sneak ? PLAYER.sneakSpeed : PLAYER.walkSpeed;
  if (p.carrying === "grain" || p.carrying === "shovel") speed *= 0.92;
  return speed;
}

function UpdatePlayer(state, dt) {
  const p = state.player;
  const input = state.input;

  p.sneak = !!input.sneak;
  UpdateLayer(p);

  // 噪音尖峰衰减
  p.noiseSpike = Math.max(0, p.noiseSpike - dt * 0.85);

  // 呼应
  if (input.callPressed && !p.action && !p.hidden) {
    DoCall(state);
  }

  // 丢下手里的东西
  if (input.itemPressed && !p.action && p.carrying) {
    DropCarried(state);
  }

  if (p.hidden) {
    UpdateHiding(state, dt);
    FinishPlayerFrame(state, dt);
    return;
  }

  if (p.action) {
    UpdateAction(state, dt);
    FinishPlayerFrame(state, dt);
    return;
  }

  // 交互
  if (input.interactPressed) {
    const target = FindTarget(state);
    if (target) {
      input.interactPressed = false;
      BeginInteract(state, target);
      FinishPlayerFrame(state, dt);
      return;
    }
  }

  if (p.onShaft) {
    UpdateClimb(state, dt);
    FinishPlayerFrame(state, dt);
    return;
  }

  // 进竖井
  if ((input.up || input.down) && TryEnterShaft(state)) {
    FinishPlayerFrame(state, dt);
    return;
  }

  RefreshPosture(state, dt);
  UpdateWalk(state, dt);
  FinishPlayerFrame(state, dt);
}

function UpdateWalk(state, dt) {
  const p = state.player;
  const input = state.input;
  const level = state.level;

  const stunned = p.stagger > 0;
  if (stunned) p.stagger = Math.max(0, p.stagger - dt);

  const moveX = stunned ? 0 : Clamp(Num(input.moveX, 0), -1, 1);
  const maxSpeed = MoveSpeedFor(p, input);
  const target = moveX * maxSpeed;

  // 线性加减速：按下就动，松开 ~0.1 秒停住
  if (Math.abs(target) > 0.001) {
    const rate = PLAYER.accel * dt;
    p.vx = Math.abs(target - p.vx) <= rate ? target : p.vx + Math.sign(target - p.vx) * rate;
    p.facing = moveX > 0 ? 1 : -1;
  } else {
    const rate = PLAYER.decel * dt;
    p.vx = Math.abs(p.vx) <= rate ? 0 : p.vx - Math.sign(p.vx) * rate;
  }

  // 水平推进 + 撞墙
  if (p.vx !== 0) {
    const nextX = p.x + p.vx * dt;
    if (CanWalkTo(state, nextX, p.y)) {
      p.x = nextX;
    } else {
      // 细分一次，尽量贴到墙上
      const midX = p.x + p.vx * dt * 0.35;
      if (CanWalkTo(state, midX, p.y)) p.x = midX;
      p.vx = 0;
    }
    p.x = Clamp(p.x, level.bounds.x0 + 0.3, level.bounds.x1 - 0.3);
  }

  // 竖直：吸附地板 / 重力
  const col = Column(level, p.x, p.y + FLOOR_SNAP, FLOOR_SNAP + 0.05);
  if (p.vy <= 0 && col.floor && p.y - col.floorY <= FLOOR_SNAP + 0.02) {
    if (!p.onGround) Land(state, -p.vy);
    p.y = col.floorY;
    p.vy = 0;
    p.onGround = true;
  } else {
    p.onGround = false;
    p.vy = Math.max(-PLAYER.maxFallSpeed, p.vy - PLAYER.gravity * dt);
    const nextY = p.y + p.vy * dt;
    const below = FloorUnder(level, p.x, p.y, 0.02);
    if (below && nextY <= below.y) {
      p.y = below.y;
      Land(state, -p.vy);
      p.vy = 0;
      p.onGround = true;
    } else {
      p.y = nextY;
      if (p.y < level.bounds.yBottom) {
        // 掉出世界：当作摔进坑，回检查点
        Die(state, "fall");
        return;
      }
    }
  }

  UpdateLayer(p);
  RefreshPosture(state, dt);

  // 脚步声
  const speedFrac = Math.abs(p.vx) / PLAYER.walkSpeed;
  if (p.onGround && speedFrac > 0.05) {
    p.stepTimer -= dt * (0.7 + speedFrac);
    if (p.stepTimer <= 0) {
      p.stepTimer = p.posture === "stand" ? 0.42 : 0.58;
      const floorKind = col.floor ? col.floor.kind : "dirt";
      Sfx(state, floorKind === "stone" || floorKind === "roof" ? "step_stone" : "step_dirt", p.x, p.y);
    }
  } else {
    p.stepTimer = 0;
  }
}

function Land(state, impact) {
  const p = state.player;
  if (impact < 1.2) return;
  Sfx(state, "land", p.x, p.y);
  Dust(state, p.x, p.y, Clamp(impact / PLAYER.maxFallSpeed, 0.1, 1));
  p.noiseSpike = Math.max(p.noiseSpike, NOISE.land * Clamp(impact / PLAYER.safeFallSpeed, 0.25, 1));
  if (impact > PLAYER.safeFallSpeed) {
    // 摔倒硬直，但不死（这不是马里奥，也不是魂）
    p.stagger = LAND_STUN_SEC;
    Shake(state, 0.45);
  } else if (impact > PLAYER.safeFallSpeed * 0.45) {
    p.stagger = LAND_STUMBLE_SEC;
    Shake(state, 0.12);
  }
  p.vx *= 0.35;
}

function TryEnterShaft(state) {
  const p = state.player;
  const input = state.input;
  const shaft = ShaftNear(state, p.x, p.y);
  if (!shaft) return false;
  if (!ShaftUsable(state, shaft)) return false;

  const wantUp = !!input.up;
  const wantDown = !!input.down;
  if (!wantUp && !wantDown) return false;
  if (wantUp && p.y >= shaft.yTop - 0.05) return false;
  if (wantDown && p.y <= shaft.yBottom + 0.05) return false;

  p.onShaft = true;
  p.shaftId = shaft.id;
  p.vx = 0;
  p.vy = 0;
  p.onGround = false;
  p.y = Clamp(p.y, shaft.yBottom, shaft.yTop);
  Sfx(state, "ladder", shaft.x, p.y);
  return true;
}

function ShaftById(state, id) {
  for (const s of state.level.shafts) {
    if (s.id === id) return s;
  }
  return null;
}

function ShaftNear(state, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const s of state.level.shafts) {
    const dx = Math.abs(x - s.x);
    if (dx > SHAFT_GRAB_X) continue;
    if (y < s.yBottom - 0.7 || y > s.yTop + 0.7) continue;
    if (dx < bestD) {
      bestD = dx;
      best = s;
    }
  }
  return best;
}

function ShaftUsable(state, shaft) {
  if (!shaft.requiresHatch) return true;
  const h = state.world.hatches[shaft.requiresHatch];
  return !!(h && h.opened);
}

function UpdateClimb(state, dt) {
  const p = state.player;
  const input = state.input;
  const shaft = ShaftById(state, p.shaftId);
  if (!shaft) {
    p.onShaft = false;
    p.shaftId = null;
    return;
  }

  p.x = Approach(p.x, shaft.x, 16, dt);
  p.posture = "crouch";
  p.height = PLAYER.crouchHeight;
  p.crouch = true;

  const dir = (input.up ? 1 : 0) + (input.down ? -1 : 0);
  const speed = shaft.kind === "dirt" ? PLAYER.dirtClimbSpeed : PLAYER.climbSpeed;
  if (dir !== 0) {
    p.y += dir * speed * dt;
    p.noiseSpike = Math.max(p.noiseSpike, NOISE.climb);
    p.stepTimer -= dt;
    if (p.stepTimer <= 0) {
      p.stepTimer = 0.46;
      Sfx(state, "ladder", p.x, p.y);
    }
  }
  p.vy = dir * speed;

  UpdateLayer(p);

  // 到顶 / 到底：脱离并踩到那层地板
  if (dir > 0 && p.y >= shaft.yTop - 0.02) {
    p.y = shaft.yTop;
    ExitShaft(state, shaft, true);
  } else if (dir < 0 && p.y <= shaft.yBottom + 0.02) {
    p.y = shaft.yBottom;
    ExitShaft(state, shaft, false);
  } else {
    p.y = Clamp(p.y, shaft.yBottom, shaft.yTop);
  }
}

function ExitShaft(state, shaft, atTop) {
  const p = state.player;
  const probeY = atTop ? shaft.yTop + 0.5 : shaft.yBottom + 0.4;
  const floor = FloorUnder(state.level, shaft.x, probeY, atTop ? 0.9 : 0.6);
  p.x = shaft.x;
  p.y = floor ? floor.y : atTop ? shaft.yTop : shaft.yBottom;
  p.onShaft = false;
  p.shaftId = null;
  p.vy = 0;
  p.vx = 0;
  p.onGround = true;
  UpdateLayer(p);
  RefreshPosture(state, 0);
  Sfx(state, "cloth", p.x, p.y);
}

function UpdateHiding(state, dt) {
  const p = state.player;
  p.vx = 0;
  p.vy = 0;
  p.noiseSpike = 0;
  const wantsOut =
    state.input.interactPressed || Math.abs(Num(state.input.moveX, 0)) > 0.65 || state.input.up;
  if (wantsOut) {
    state.input.interactPressed = false;
    p.hidden = false;
    p.hidePropId = null;
    Sfx(state, "cloth", p.x, p.y);
    p.noiseSpike = Math.max(p.noiseSpike, NOISE.crouch);
  }
}

function FinishPlayerFrame(state, dt) {
  const p = state.player;

  // 连续噪音
  let base = NOISE.idle;
  if (p.hidden) base = 0;
  else if (p.onShaft) base = Math.abs(p.vy) > 0.05 ? NOISE.climb : NOISE.idle;
  else if (Math.abs(p.vx) > 0.08) {
    const frac = Clamp(Math.abs(p.vx) / PLAYER.walkSpeed, 0, 1);
    if (p.posture === "crawl") base = NOISE.crawl;
    else if (p.posture === "crouch") base = NOISE.crouch;
    else base = state.input.sneak ? NOISE.sneak : NOISE.walk * frac;
  }
  p.noise = Clamp(Math.max(base, p.noiseSpike), 0, 1);

  // 灯光半径
  const carryLight = p.carrying && ITEMS[p.carrying] ? ITEMS[p.carrying].light : 0;
  const targetLight = Math.max(p.layer === "tunnel" ? 1.6 : 2.4, carryLight);
  p.lightRadius = Approach(p.lightRadius, targetLight, 5, dt);

  UpdatePlayerAnim(state, dt);
}

function UpdatePlayerAnim(state, dt) {
  const p = state.player;
  const speedFrac = Clamp(Math.abs(p.vx) / PLAYER.walkSpeed, 0, 1);
  let name;

  if (p.dead) name = p.deathReason === "spotted" ? "caught" : "dead";
  else if (p.hidden) name = "hide";
  else if (p.action === "hatch") name = "dig";
  else if (p.action === "bell") name = "ring";
  else if (p.action === "push") name = "push";
  else if (p.action === "call") name = "call";
  else if (p.action) name = "use";
  else if (p.onShaft) name = "climb";
  else if (p.stagger > 0) name = "land";
  else if (!p.onGround && p.vy < -1.2) name = "fall";
  else if (p.posture === "crawl") name = speedFrac > 0.03 ? "crawl" : "crouchIdle";
  else if (p.posture === "crouch") name = speedFrac > 0.03 ? "crawl" : "crouchIdle";
  else if (speedFrac > 0.03) {
    if (p.carrying) name = "carryWalk";
    else if (p.sneak) name = "sneak";
    else name = "walk";
  } else name = p.carrying ? "carryIdle" : "idle";

  SetAnim(p, name, p.onShaft ? 0.6 : speedFrac, dt);
}

function UpdateDeadPlayer(state, dt) {
  const p = state.player;
  p.vx = 0;
  p.noise = 0;
  p.deathTimer -= dt;
  UpdatePlayerAnim(state, dt);
  if (p.deathTimer <= 0) RespawnAtCheckpoint(state);
}

function DoCall(state) {
  const p = state.player;
  p.action = "call";
  p.actionTimer = 0.55;
  p.actionTotal = 0.55;
  p.actionPropId = null;
  p.noiseSpike = NOISE.call;
  Sfx(state, "shout", p.x, p.y);
  // 招呼附近的乡亲
  for (const n of state.npcs) {
    if (n.rescued || n.follow) continue;
    if (Math.abs(n.x - p.x) > 7 || Math.abs(n.y - p.y) > 2.5) continue;
    StartFollow(state, n);
  }
}

// ───────────────────────────── 互动 ─────────────────────────────

function PropX(state, prop) {
  const pushed = state.world.pushed[prop.id];
  return typeof pushed === "number" ? pushed : prop.x;
}

function PropVisible(state, prop) {
  if (!prop.hidden) return true;
  return !!state.world.revealed[prop.id];
}

function NpcById(state, id) {
  for (const n of state.npcs) {
    if (n.id === id) return n;
  }
  return null;
}

function HatchForProp(state, prop) {
  const id = prop.data && prop.data.hatchId ? prop.data.hatchId : null;
  if (id && state.world.hatches[id]) return { id, rec: state.world.hatches[id] };
  // 兜底：按 propId 反查
  for (const h of state.level.hatches) {
    if (h.propId === prop.id) return { id: h.id, rec: state.world.hatches[h.id] };
  }
  return null;
}

function InteractAvailable(state, prop) {
  if (!prop || prop.interact === "none" || !prop.interact) return false;
  if (!PropVisible(state, prop)) return false;
  if (state.world.picked[prop.id]) return false;

  switch (prop.interact) {
    case "hatch": {
      const h = HatchForProp(state, prop);
      if (!h || !h.rec) return false;
      if (h.rec.hidden && !state.world.revealed[h.id]) return false;
      return !h.rec.opened; // 开过之后由竖井提示接管
    }
    case "hide":
      return true;
    case "bell":
      return !state.world.used[prop.id];
    case "pickup":
      return true;
    case "lever":
      return !state.world.levers[prop.data.channel];
    case "push":
      return Math.abs(PropX(state, prop) - Num(prop.data.toX, prop.x)) > 0.2;
    case "talk": {
      const npc = NpcById(state, prop.data.npcId);
      if (!npc) return false;
      return !npc.follow && !npc.rescued;
    }
    case "read":
      return !state.world.codex[prop.data.codexId];
    default:
      return false;
  }
}

function FindTarget(state) {
  const p = state.player;
  let best = null;
  let bestD = Infinity;
  const reach = INTERACT.reach + PLAYER.width * 0.5;
  for (const prop of state.level.props) {
    if (!InteractAvailable(state, prop)) continue;
    const dx = Math.abs(PropX(state, prop) - p.x);
    if (dx > reach) continue;
    const dy = Math.abs(prop.y - p.y);
    if (dy > INTERACT.reachY) continue;
    const d = dx + dy * 0.4;
    if (d < bestD) {
      bestD = d;
      best = prop;
    }
  }
  return best;
}

function LeverLabel(channel, ok) {
  if (!ok) return "需要木塞";
  if (channel === "gasSeal") return "封住卡口";
  if (channel === "waterDivert") return "引水";
  if (channel === "gateOpen") return "打开";
  return "拉动";
}

function PromptForProp(state, prop) {
  const p = state.player;
  switch (prop.interact) {
    case "hatch":
      return { key: "E", label: "开地道口", id: prop.id, kind: "hatch" };
    case "hide":
      return { key: "E", label: prop.label ? "躲进" + prop.label : "躲起来", id: prop.id, kind: "hide" };
    case "bell":
      return { key: "E", label: "敲钟", id: prop.id, kind: "bell" };
    case "pickup": {
      const item = prop.data.item;
      const label = ITEMS[item] ? ITEMS[item].label : prop.label || "东西";
      return { key: "E", label: "捡起" + label, id: prop.id, kind: "pickup" };
    }
    case "lever": {
      const need = prop.data.needItem || null;
      const ok = !need || p.carrying === need;
      return {
        key: "E",
        label: ok ? LeverLabel(prop.data.channel, true) : "需要" + (ITEMS[need] ? ITEMS[need].label : need),
        id: prop.id,
        kind: "lever",
        blocked: !ok,
      };
    }
    case "push":
      return { key: "E", label: "推动" + (prop.label || ""), id: prop.id, kind: "push" };
    case "talk": {
      const npc = NpcById(state, prop.data.npcId);
      return { key: "E", label: "带上" + (npc ? npc.name : "乡亲"), id: prop.id, kind: "talk" };
    }
    case "read":
      return { key: "E", label: "查看" + (prop.label || ""), id: prop.id, kind: "read" };
    default:
      return null;
  }
}

/** 当前最近的可互动目标提示。没有则返回 null。 */
export function CurrentPrompt(state) {
  if (!state || !state.level) return null;
  const p = state.player;
  if (p.dead || state.phase === "won" || state.phase === "chapterEnd") return null;
  if (p.hidden) return { key: "E", label: "出来", id: p.hidePropId, kind: "hide" };
  if (p.action) return null;

  const prop = FindTarget(state);
  if (prop) {
    const prompt = PromptForProp(state, prop);
    if (prompt) return prompt;
  }

  if (p.onShaft) {
    return { key: "W", label: "攀爬", id: p.shaftId, kind: "shaft" };
  }
  const shaft = ShaftNear(state, p.x, p.y);
  if (shaft && ShaftUsable(state, shaft)) {
    if (p.y > shaft.yBottom + 0.3) return { key: "S", label: "下去", id: shaft.id, kind: "shaft" };
    if (p.y < shaft.yTop - 0.3) return { key: "W", label: "上去", id: shaft.id, kind: "shaft" };
  }
  return null;
}

function BeginInteract(state, prop) {
  const p = state.player;
  const kind = prop.interact;

  if (kind === "lever") {
    const need = prop.data.needItem || null;
    if (need && p.carrying !== need) {
      Sfx(state, "cloth", p.x, p.y);
      return;
    }
  }

  let duration = 0.35;
  if (kind === "hatch") duration = INTERACT.hatchOpenSec;
  else if (kind === "bell") duration = INTERACT.bellRingSec;
  else if (kind === "push") {
    const toX = Num(prop.data.toX, prop.x);
    duration = Math.max(0.2, Math.abs(toX - PropX(state, prop)) / INTERACT.pushSpeed);
  } else if (kind === "lever") duration = 0.45;
  else if (kind === "read") duration = 0.5;
  else if (kind === "talk") duration = 0.4;
  else if (kind === "pickup") duration = 0.3;
  else if (kind === "hide") duration = 0.25;

  p.action = kind;
  p.actionTimer = duration;
  p.actionTotal = duration;
  p.actionPropId = prop.id;
  p.vx = 0;

  // 起手的声音
  if (kind === "hatch") {
    Sfx(state, "dig", p.x, p.y);
    p.noiseSpike = Math.max(p.noiseSpike, NOISE.dig);
  } else if (kind === "push") {
    Sfx(state, "push", p.x, p.y);
    p.noiseSpike = Math.max(p.noiseSpike, NOISE.push);
  } else if (kind === "lever") {
    p.noiseSpike = Math.max(p.noiseSpike, NOISE.lever);
  }
}

function UpdateAction(state, dt) {
  const p = state.player;
  p.vx = 0;
  const prop = FindPropById(state, p.actionPropId);

  if (p.action === "push" && prop) {
    const toX = Num(prop.data.toX, prop.x);
    const cur = PropX(state, prop);
    const dir = Math.sign(toX - cur) || 1;
    const next = cur + dir * INTERACT.pushSpeed * dt;
    const done = (dir > 0 && next >= toX) || (dir < 0 && next <= toX);
    state.world.pushed[prop.id] = done ? toX : next;
    p.x = (done ? toX : next) - dir * (PLAYER.width * 0.5 + 0.45);
    p.facing = dir > 0 ? 1 : -1;
    p.noiseSpike = Math.max(p.noiseSpike, NOISE.push);
    p.stepTimer -= dt;
    if (p.stepTimer <= 0) {
      p.stepTimer = 0.5;
      Sfx(state, "push", p.x, p.y);
      Dust(state, PropX(state, prop), prop.y, 0.3);
    }
  }

  if (p.action === "hatch") {
    p.noiseSpike = Math.max(p.noiseSpike, NOISE.dig * 0.8);
  }

  p.actionTimer -= dt;
  if (p.actionTimer > 0) return;

  const finished = p.action;
  p.action = null;
  p.actionTimer = 0;
  p.actionPropId = null;
  if (finished !== "call" && prop) CompleteInteract(state, finished, prop);
}

function FindPropById(state, id) {
  if (!id) return null;
  for (const prop of state.level.props) {
    if (prop.id === id) return prop;
  }
  return null;
}

function CompleteInteract(state, kind, prop) {
  const p = state.player;
  switch (kind) {
    case "hatch": {
      const h = HatchForProp(state, prop);
      if (h && h.rec) {
        h.rec.opened = true;
        for (const raw of state.level.hatches) {
          if (raw.id === h.id) raw.opened = true;
        }
        Sfx(state, "hatch_open", p.x, p.y);
        Dust(state, p.x, p.y, 0.6);
        Shake(state, 0.18);
        state.world.used[prop.id] = true;
      }
      break;
    }
    case "hide": {
      p.hidden = true;
      p.hidePropId = prop.id;
      p.x = PropX(state, prop);
      p.vx = 0;
      Sfx(state, "cloth", p.x, p.y);
      break;
    }
    case "bell": {
      state.world.used[prop.id] = true;
      const rings = Num(prop.data.rings, 3);
      for (let i = 0; i < rings; i++) Sfx(state, "bell_ring", PropX(state, prop), prop.y);
      Shake(state, 0.4);
      p.noiseSpike = NOISE.bell;
      break;
    }
    case "pickup": {
      const item = prop.data.item;
      if (item) {
        if (p.carrying && p.carrying !== item) DropCarried(state);
        p.carrying = item;
      }
      state.world.picked[prop.id] = true;
      state.world.used[prop.id] = true;
      if (prop.dropped) {
        const idx = state.level.props.indexOf(prop);
        if (idx >= 0) state.level.props.splice(idx, 1);
      }
      Sfx(state, "pickup", p.x, p.y);
      break;
    }
    case "lever": {
      const channel = prop.data.channel;
      if (channel) {
        state.world.levers[channel] = true;
        Sfx(state, "lever", p.x, p.y);
        Shake(state, 0.15);
        if (prop.data.needItem && p.carrying === prop.data.needItem) p.carrying = null;
      }
      state.world.used[prop.id] = true;
      break;
    }
    case "push": {
      state.world.used[prop.id] = true;
      Dust(state, PropX(state, prop), prop.y, 0.5);
      Shake(state, 0.2);
      break;
    }
    case "talk": {
      const npc = NpcById(state, prop.data.npcId);
      if (npc) StartFollow(state, npc);
      state.world.used[prop.id] = true;
      if (prop.data.panel) QueuePanel(state, prop.data.panel);
      break;
    }
    case "read": {
      const codexId = prop.data.codexId;
      if (codexId && !state.world.codex[codexId]) {
        state.world.codex[codexId] = true;
        Emit(state, { kind: "codex", id: codexId });
      }
      state.world.used[prop.id] = true;
      break;
    }
    default:
      break;
  }
}

function ItemPropKind(item) {
  if (item === "lantern") return "lantern";
  if (item === "grain") return "crock";
  if (item === "note") return "sign";
  return "prop_beam";
}

function DropCarried(state) {
  const p = state.player;
  const item = p.carrying;
  if (!item) return null;
  const id = "drop_" + item + "_" + state.world.dropCount++;
  const prop = {
    id,
    x: p.x,
    y: p.y,
    z: 0,
    kind: ItemPropKind(item),
    facing: p.facing,
    interact: "pickup",
    data: { item },
    label: ITEMS[item] ? ITEMS[item].label : item,
    hidden: false,
    dropped: true,
  };
  state.level.props.push(prop);
  p.carrying = null;
  Sfx(state, "cloth", p.x, p.y);
  return prop;
}

// ───────────────────────────── 触发器 / 检查点 / 目标 ─────────────────────────────

function UpdateTriggers(state) {
  const p = state.player;
  for (const t of state.level.triggers) {
    const inside = p.x >= t.x0 && p.x <= t.x1 && p.y >= t.yMin && p.y <= t.yMax;
    const was = !!state.triggersInside[t.id];
    state.triggersInside[t.id] = inside;
    if (!inside || was) continue;
    if (t.once && state.triggersFired[t.id]) continue;
    FireTrigger(state, t);
  }
}

function FireTrigger(state, t) {
  state.triggersFired[t.id] = true;
  const emit = t.emit;

  for (const id of emit.panels) QueuePanel(state, id);

  for (const id of emit.reveal) {
    state.world.revealed[id] = true;
    const hatch = state.world.hatches[id];
    if (hatch) hatch.hidden = false;
    for (const prop of state.level.props) {
      if (prop.id === id) prop.hidden = false;
      // 关卡也可能只 reveal 地道口 id，而道具用 hatchId 指过去
      if (prop.interact === "hatch" && prop.data && prop.data.hatchId === id) prop.hidden = false;
    }
    for (const h of state.level.hatches) {
      if (h.id === id && h.propId) state.world.revealed[h.propId] = true;
      if (h.revealBy === t.id) {
        const rec = state.world.hatches[h.id];
        if (rec) rec.hidden = false;
      }
    }
  }
  // revealBy 也可能直接写 trigger id
  for (const h of state.level.hatches) {
    if (h.revealBy === t.id) {
      const rec = state.world.hatches[h.id];
      if (rec) rec.hidden = false;
      state.world.revealed[h.id] = true;
      if (h.propId) state.world.revealed[h.propId] = true;
    }
  }
  for (const prop of state.level.props) {
    if (prop.hidden && prop.data && prop.data.revealBy === t.id) prop.hidden = false;
  }

  for (const id of emit.arm) ArmHazard(state, id);
  for (const hz of state.hazards) {
    if (hz.armAt === t.id) ArmHazard(state, hz.id);
  }

  for (const id of emit.spawn) {
    for (const e of state.enemies) {
      if (e.id === id && e.dormant) {
        e.dormant = false;
        Sfx(state, "boot", e.x, e.y);
      }
    }
  }

  if (emit.objective) {
    state.story.objectiveText = emit.objective;
    Emit(state, { kind: "objective", text: emit.objective });
  }

  if (emit.checkpoint) SetCheckpointNear(state, (t.x0 + t.x1) * 0.5, state.player.y, t.id);

  if (emit.win) WinLevel(state);
}

function SetCheckpointNear(state, x, y, fallbackId) {
  let best = null;
  let bestD = Infinity;
  for (const c of state.level.checkpoints) {
    const d = Math.abs(c.x - x) + Math.abs(c.y - y) * 0.5;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  if (!best || bestD > 14) {
    best = { id: "cp_" + (fallbackId || "auto") , x: state.player.x, y: state.player.y, label: "" };
    state.level.checkpoints.push(best);
  }
  if (state.checkpointId === best.id) return;
  state.checkpointId = best.id;
  Emit(state, { kind: "checkpoint", id: best.id });
}

function UpdateCheckpoints(state) {
  const p = state.player;
  for (const c of state.level.checkpoints) {
    if (c.id === state.checkpointId) continue;
    if (Math.abs(c.x - p.x) > CHECKPOINT_RADIUS) continue;
    if (Math.abs(c.y - p.y) > 2.0) continue;
    state.checkpointId = c.id;
    Emit(state, { kind: "checkpoint", id: c.id });
  }
}

function ObjectiveDone(state, obj) {
  const w = obj.doneWhen || {};
  if (w.trigger) return !!state.triggersFired[w.trigger];
  if (w.propUsed) return !!state.world.used[w.propUsed];
  if (w.npcRescued) {
    if (w.npcRescued === "all") return state.npcs.length > 0 && state.npcs.every((n) => n.rescued);
    const npc = NpcById(state, w.npcRescued);
    return !!(npc && npc.rescued);
  }
  if (w.atExit) return state.phase === "won" || AtExit(state);
  return false;
}

/** HUD 只显示当前一条目标。 */
export function ActiveObjective(state) {
  if (!state || !state.level) return "";
  for (const obj of state.level.objectives) {
    if (!ObjectiveDone(state, obj)) return obj.text;
  }
  if (state.story.objectiveText) return state.story.objectiveText;
  return "前往" + state.level.exit.label;
}

function AtExit(state) {
  const p = state.player;
  const exit = state.level.exit;
  return Math.abs(p.x - exit.x) <= exit.radius && Math.abs(p.y - exit.y) <= Math.max(2.0, exit.radius);
}

function AllVillagersSafe(state) {
  if (state.npcs.length === 0) return true;
  return state.npcs.every((n) => n.rescued);
}

function CheckWin(state, dt) {
  const exit = state.level.exit;
  if (!AtExit(state)) return;
  if (exit.needAllVillagers && !AllVillagersSafe(state)) return;
  WinLevel(state);
}

function WinLevel(state) {
  if (state.phase === "won") return;
  state.phase = "won";
  state.player.vx = 0;
  const chapter = FindChapter(state.level.chapterId);
  if (chapter && Array.isArray(chapter.closing)) {
    for (const id of chapter.closing) {
      state.story.seen[id] = true;
      Emit(state, { kind: "panel", id });
    }
  }
  Emit(state, { kind: "won" });
}

// ───────────────────────────── 危害 ─────────────────────────────

function ArmHazard(state, id) {
  for (const h of state.hazards) {
    if (h.id !== id) continue;
    if (h.armed) continue;
    h.armed = true;
    h.warn = HAZARD.warnLeadSec;
    h.active = false;
    h.front = 0;
    h.level = 0;
    // 预警：先响后来，玩家一定有反应时间
    Sfx(state, h.kind === "water" ? "water" : h.kind === "gas" ? "gas" : "land", h.srcX0, h.y);
    Emit(state, { kind: "objective", text: HazardWarnText(h) });
    Shake(state, 0.25);
    Dust(state, h.srcX0, h.y + 0.6, 0.5);
  }
}

function HazardWarnText(h) {
  if (h.kind === "gas") return "毒烟灌进来了 —— 封住卡口";
  if (h.kind === "water") return "他们在灌水 —— 快走";
  return "顶上要塌了";
}

function UpdateHazards(state, dt) {
  for (const h of state.hazards) {
    const sealed = h.sealedBy ? !!state.world.levers[h.sealedBy] : false;

    if (h.warn > 0) {
      h.warn -= dt;
      if (h.warn <= 0 && !sealed) {
        h.active = true;
        Sfx(state, h.kind === "water" ? "water" : "gas", h.srcX0, h.y);
      }
      h.x1 = h.srcX0;
      continue;
    }

    if (sealed) {
      h.active = false;
      h.level = Math.max(0, h.level - HAZARD_CLEAR * dt);
      h.front = Math.max(0, h.front - (h.speed * 1.5 * dt) / Math.max(0.001, Math.abs(h.srcX1 - h.srcX0)));
    } else if (h.active) {
      const span = Math.max(0.001, Math.abs(h.srcX1 - h.srcX0));
      h.front = Clamp(h.front + (h.speed * dt) / span, 0, 1);
      h.level = Math.min(1, h.level + HAZARD_RAMP * dt);
      h.hissTimer -= dt;
      if (h.hissTimer <= 0) {
        h.hissTimer = 1.6;
        Sfx(state, h.kind === "water" ? "water" : "gas", Lerp(h.srcX0, h.srcX1, h.front), h.y);
      }
    }

    h.x0 = h.srcX0;
    h.x1 = Lerp(h.srcX0, h.srcX1, h.front);

    if (state.phase === "play" && !state.player.dead && HazardHits(state, h)) {
      Die(state, h.kind);
    }
  }
}

function HazardHits(state, h) {
  if (!h.active || h.level < HAZARD.gasLethalLevel) return false;
  const p = state.player;
  const lo = Math.min(h.x0, h.x1);
  const hi = Math.max(h.x0, h.x1);
  if (p.x < lo - 0.3 || p.x > hi + 0.3) return false;
  const dy = p.y - h.y;
  if (dy < -1.4 || dy > HAZARD_HEIGHT) return false;
  return true;
}

// ───────────────────────────── 敌人 ─────────────────────────────

function VisibilityScale(p) {
  if (p.hidden) return SENSE.hiddenVisibility;
  let s = 1;
  if (p.posture === "crawl") s *= SENSE.crouchVisibility * 0.85;
  else if (p.posture === "crouch") s *= SENSE.crouchVisibility;
  if (p.sneak) s *= SENSE.sneakVisibility;
  if (Math.abs(p.vx) < 0.05 && p.posture !== "stand") s *= 0.9;
  return s;
}

/** 视线被土层挡住吗？地表敌人看不到地道里的人，反之亦然。 */
function EarthBetween(level, ax, ay, bx, by) {
  if (Math.abs(by - ay) <= 1.5) return false;
  const lo = Math.min(ay, by) + 0.25;
  const hi = Math.max(ay, by) - 0.25;
  if (hi <= lo) return false;
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    for (const f of level.floors) {
      if (x < f.x0 - 0.02 || x > f.x1 + 0.02) continue;
      if (f.y > lo && f.y < hi) return true;
    }
  }
  return false;
}

function CanSee(state, e) {
  const p = state.player;
  const vis = VisibilityScale(p);
  if (vis <= 0.001) return false;
  const range = e.visionRange * vis;
  if (range <= 0.05) return false;

  const ax = e.x;
  const ay = e.y + e.visionHeight;
  const bx = p.x;
  const by = p.y + p.height * 0.55;
  const dx = bx - ax;
  const dy = by - ay;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > range) return false;
  if (dist > 0.001) {
    const cos = (dx * e.facing) / dist;
    const ang = Math.acos(Clamp(cos, -1, 1)) * (180 / Math.PI);
    if (ang > e.visionHalfAngleDeg) return false;
  }
  if (EarthBetween(state.level, ax, ay, bx, by)) return false;
  return true;
}

function CanHear(state, e) {
  const p = state.player;
  if (p.noise <= 0.02) return false;
  const radius = (e.hearing || 6) * p.noise * SENSE.hearingScale;
  if (radius <= 0.1) return false;
  const dx = p.x - e.x;
  const dy = (p.y - e.y) * 0.6; // 声音跨层传得动，但打折
  return dx * dx + dy * dy <= radius * radius;
}

function UpdateEnemies(state, dt) {
  for (const e of state.enemies) UpdateEnemy(state, e, dt);
}

function UpdateEnemy(state, e, dt) {
  if (e.dormant) {
    SetAnim(e, "idle", 0, dt);
    return;
  }

  const p = state.player;
  const alive = state.phase === "play" && !p.dead;
  const seeing = alive && CanSee(state, e);
  const hearing = alive && !seeing && CanHear(state, e);
  const prevState = e.state;

  if (seeing) {
    e.alertness = Clamp(e.alertness + dt / SENSE.alertRiseSec, 0, 1);
    e.lastSeenX = p.x;
    e.lastSeenY = p.y;
    e.hasLead = true;
    e.facing = p.x >= e.x ? 1 : -1;
  } else if (hearing) {
    e.alertness = Clamp(Math.min(e.alertness + HEAR_RISE_PER_SEC * dt, HEAR_ALERT_CAP), 0, 1);
    e.lastSeenX = p.x;
    e.lastSeenY = p.y;
    e.hasLead = true;
    e.facing = p.x >= e.x ? 1 : -1;
  } else {
    e.alertness = Clamp(e.alertness - SENSE.alertFallPerSec * dt, 0, 1);
    if (e.alertness < SENSE.suspiciousAt * 0.5) e.hasLead = false;
  }

  // 状态机
  let next;
  if (e.alertness >= 1 && seeing) next = "spotted";
  else if (e.alertness >= SENSE.searchAt) next = "search";
  else if (e.alertness >= SENSE.suspiciousAt) next = "suspicious";
  else if (e.probeAt) next = "probe";
  else if (e.patrol) next = "patrol";
  else next = "idle";
  e.state = next;

  if (next !== prevState) {
    e.lookTimer = next === "search" ? SEARCH_LOOK_SEC : SUSPICIOUS_HOLD_SEC;
    if (next === "search" && prevState !== "spotted") {
      Sfx(state, e.kind === "dog" ? "dog" : "shout", e.x, e.y);
    } else if (next === "suspicious" && (prevState === "patrol" || prevState === "idle" || prevState === "probe")) {
      Sfx(state, e.kind === "dog" ? "dog" : "breath", e.x, e.y);
    }
  }

  switch (e.state) {
    case "spotted":
      Capture(state, e);
      SetAnim(e, "call", 0, dt);
      return;
    case "search":
      EnemySearch(state, e, dt);
      break;
    case "suspicious":
      EnemySuspicious(state, e, dt);
      break;
    case "probe":
      EnemyProbe(state, e, dt);
      break;
    case "patrol":
      EnemyPatrol(state, e, dt);
      break;
    default:
      EnemyIdle(state, e, dt);
      break;
  }

  SnapEnemyToFloor(state, e);
}

function SnapEnemyToFloor(state, e) {
  const floor = FloorUnder(state.level, e.x, e.y + 0.8, 1.6);
  if (floor) e.y = floor.y;
}

function MoveEnemy(state, e, targetX, speed, dt) {
  const dx = targetX - e.x;
  if (Math.abs(dx) < 0.05) return false;
  const dir = dx > 0 ? 1 : -1;
  const nextX = e.x + dir * speed * dt;
  if (!CanWalkTo(state, nextX, e.y)) return false;
  e.x = Clamp(nextX, state.level.bounds.x0 + 0.3, state.level.bounds.x1 - 0.3);
  e.facing = dir;
  e.stepTimer -= dt;
  if (e.stepTimer <= 0) {
    e.stepTimer = 0.5;
    Sfx(state, "boot", e.x, e.y);
  }
  return true;
}

function EnemyIdle(state, e, dt) {
  // 哨兵站桩转头，确定性的伪随机节拍
  e.lookTimer -= dt;
  if (e.lookTimer <= 0) {
    e.lookTimer = 1.8 + NextRandom(state) * 2.2;
    e.facing = -e.facing;
  }
  SetAnim(e, "idle", 0, dt);
}

function EnemyPatrol(state, e, dt) {
  const patrol = e.patrol;
  if (!patrol) {
    EnemyIdle(state, e, dt);
    return;
  }
  if (e.pauseTimer > 0) {
    e.pauseTimer -= dt;
    SetAnim(e, "idle", 0, dt);
    return;
  }
  const target = e.patrolDir > 0 ? patrol.x1 : patrol.x0;
  const moved = MoveEnemy(state, e, target, patrol.speed, dt);
  if (!moved || Math.abs(e.x - target) < 0.12) {
    e.patrolDir = -e.patrolDir;
    e.pauseTimer = patrol.pauseSec;
    e.facing = e.patrolDir > 0 ? 1 : -1;
  }
  SetAnim(e, "walk", Clamp(patrol.speed / PLAYER.walkSpeed, 0, 1), dt);
}

function EnemySuspicious(state, e, dt) {
  e.lookTimer -= dt;
  if (e.hasLead) e.facing = e.lastSeenX >= e.x ? 1 : -1;
  SetAnim(e, "idle", 0, dt);
}

function EnemySearch(state, e, dt) {
  const speed = (e.patrol ? e.patrol.speed : 1.4) * SENSE.searchSpeedScale;
  const targetX = e.hasLead ? e.lastSeenX : e.homeX;
  const range = e.patrol ? 7 : 5;
  const lo = (e.patrol ? Math.min(e.patrol.x0, e.patrol.x1) : e.homeX) - range;
  const hi = (e.patrol ? Math.max(e.patrol.x0, e.patrol.x1) : e.homeX) + range;
  const goal = Clamp(targetX, lo, hi);

  if (Math.abs(goal - e.x) > 0.35) {
    MoveEnemy(state, e, goal, speed, dt);
    SetAnim(e, "walk", 1, dt);
  } else {
    e.lookTimer -= dt;
    if (e.lookTimer <= 0) {
      e.lookTimer = 0.9 + NextRandom(state) * 0.8;
      e.facing = -e.facing;
    }
    SetAnim(e, "idle", 0, dt);
  }
}

function EnemyProbe(state, e, dt) {
  const list = e.probeAt;
  if (!list || list.length === 0) {
    EnemyPatrol(state, e, dt);
    return;
  }
  const targetX = list[e.probeIndex % list.length];
  e.probeTimer -= dt;

  switch (e.probePhase) {
    case "move": {
      if (Math.abs(e.x - targetX) > 0.2) {
        MoveEnemy(state, e, targetX, e.patrol ? e.patrol.speed : 1.3, dt);
        SetAnim(e, "walk", 0.7, dt);
      } else {
        e.probePhase = "wind";
        e.probeTimer = PROBE_WIND_SEC;
        // 前摇：声音 + 尘土，至少 1 秒预警
        Sfx(state, "dig", targetX, e.y);
        Dust(state, targetX, e.y - 0.4, 0.45);
        Emit(state, { kind: "shake", power: 0.12 });
        SetAnim(e, "dig", 0, dt);
      }
      break;
    }
    case "wind": {
      SetAnim(e, "dig", 0, dt);
      if (e.probeTimer <= 0) {
        e.probePhase = "strike";
        e.probeTimer = PROBE_STRIKE_SEC;
        Sfx(state, "dig", targetX, e.y);
        Dust(state, targetX, e.y - 1.2, 0.7);
        Shake(state, 0.22);
        ProbeHit(state, e, targetX);
      }
      break;
    }
    case "strike": {
      SetAnim(e, "dig", 0, dt);
      if (e.probeTimer <= 0) {
        e.probePhase = "rest";
        e.probeTimer = PROBE_REST_SEC;
      }
      break;
    }
    default: {
      SetAnim(e, "idle", 0, dt);
      if (e.probeTimer <= 0) {
        e.probeIndex = (e.probeIndex + 1) % list.length;
        e.probePhase = "move";
      }
      break;
    }
  }
}

function ProbeHit(state, e, probeX) {
  const p = state.player;
  if (p.dead) return;
  if (p.layer !== "tunnel") return;
  if (p.y > e.y - 0.6) return;
  if (Math.abs(p.x - probeX) > PROBE_RADIUS) return;
  Die(state, "probe");
}

function Capture(state, e) {
  const p = state.player;
  if (p.dead) return;
  Emit(state, { kind: "spot", enemyId: e.id });
  Sfx(state, "alarm", e.x, e.y);
  Die(state, "spotted");
}

function Die(state, reason) {
  const p = state.player;
  if (p.dead) return;
  p.dead = true;
  p.deathReason = reason;
  p.deathTimer = DEATH_RESPAWN_SEC;
  p.vx = 0;
  p.vy = 0;
  p.hidden = false;
  p.hidePropId = null;
  p.onShaft = false;
  p.shaftId = null;
  p.action = null;
  p.actionTimer = 0;
  p.noise = 0;
  state.stats.deaths++;
  state.phase = "lost";
  Emit(state, { kind: "lost", reason });
  Sfx(state, reason === "spotted" ? "alarm" : "heartbeat", p.x, p.y);
  Shake(state, 0.6);
}

// ───────────────────────────── 乡亲跟随 ─────────────────────────────

function StartFollow(state, npc) {
  if (npc.follow || npc.rescued) return;
  npc.follow = true;
  let order = 0;
  for (const n of state.npcs) {
    if (n.follow && !n.rescued) order++;
  }
  npc.order = order;
  Sfx(state, "cloth", npc.x, npc.y);
}

function UpdateTrail(state) {
  const p = state.player;
  const trail = state.trail;
  const last = trail.length ? trail[trail.length - 1] : null;
  if (!last) {
    trail.push({ x: p.x, y: p.y, d: 0 });
    return;
  }
  const dx = p.x - last.x;
  const dy = p.y - last.y;
  const step = Math.sqrt(dx * dx + dy * dy);
  if (step < TRAIL_STEP) return;
  trail.push({ x: p.x, y: p.y, d: last.d + step });
  if (trail.length > TRAIL_MAX) trail.shift();
}

function TrailPointAt(state, distBehind) {
  const trail = state.trail;
  if (trail.length === 0) return { x: state.player.x, y: state.player.y };
  const head = trail[trail.length - 1];
  const want = head.d - distBehind;
  if (want <= trail[0].d) return { x: trail[0].x, y: trail[0].y };
  for (let i = trail.length - 1; i > 0; i--) {
    const a = trail[i - 1];
    const b = trail[i];
    if (want >= a.d && want <= b.d) {
      const t = b.d - a.d < 1e-6 ? 0 : (want - a.d) / (b.d - a.d);
      return { x: Lerp(a.x, b.x, t), y: Lerp(a.y, b.y, t) };
    }
  }
  return { x: head.x, y: head.y };
}

function UpdateNpcs(state, dt) {
  const p = state.player;
  const exit = state.level.exit;
  let queueIndex = 0;

  for (const n of state.npcs) {
    if (n.rescued) {
      SetAnim(n, "idle", 0, dt);
      continue;
    }

    if (!n.follow) {
      SetAnim(n, "idle", 0, dt);
      const floor = FloorUnder(state.level, n.x, n.y + 0.6, 1.4);
      if (floor) n.y = floor.y;
      continue;
    }

    queueIndex++;
    const target = TrailPointAt(state, FOLLOW.spacing * queueIndex);
    const dx = target.x - n.x;
    const dy = target.y - n.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const lag = Math.abs(p.x - n.x) + Math.abs(p.y - n.y);
    const speed = lag > FOLLOW.maxLag ? FOLLOW.catchUpSpeed : dist > 2.0 ? FOLLOW.catchUpSpeed * 0.8 : PLAYER.walkSpeed;

    if (dist > 0.12) {
      const step = Math.min(dist, speed * dt);
      n.x += (dx / dist) * step;
      n.y += (dy / dist) * step;
      n.facing = dx >= 0 ? 1 : -1;
      SetAnim(n, "walk", Clamp(speed / PLAYER.walkSpeed, 0, 1), dt);
    } else {
      SetAnim(n, "idle", 0, dt);
    }

    // 抵达出口 → 得救
    if (Math.abs(n.x - exit.x) <= Math.max(exit.radius, FOLLOW.arriveRadius) && Math.abs(n.y - exit.y) <= 2.2) {
      n.rescued = true;
      n.follow = false;
      Sfx(state, "cloth", n.x, n.y);
    }
  }
}

// ───────────────────────────── 摄像机 ─────────────────────────────

function ClampCamera(state) {
  const b = state.level.bounds;
  const c = state.camera;
  const halfH = c.viewHeight * 0.5;
  const halfW = c.viewHeight * 0.95; // 按 ~16:9 估的半宽，渲染层可再收
  const loX = b.x0 + halfW;
  const hiX = b.x1 - halfW;
  c.x = loX <= hiX ? Clamp(c.x, loX, hiX) : (b.x0 + b.x1) * 0.5;
  const loY = b.yBottom + halfH;
  const hiY = b.yTop - halfH;
  c.y = loY <= hiY ? Clamp(c.y, loY, hiY) : (b.yBottom + b.yTop) * 0.5;
}

function UpdateCamera(state, dt) {
  const p = state.player;
  const c = state.camera;

  const speedFrac = Clamp(Math.abs(p.vx) / PLAYER.walkSpeed, 0, 1);
  const targetX = p.x + p.facing * CAMERA.lookAheadX * speedFrac;
  const targetY = p.y + 0.9;

  const dx = targetX - c.x;
  if (dx > CAMERA.deadzoneX) c.x = Approach(c.x, targetX - CAMERA.deadzoneX, CAMERA.followLerp, dt);
  else if (dx < -CAMERA.deadzoneX) c.x = Approach(c.x, targetX + CAMERA.deadzoneX, CAMERA.followLerp, dt);

  const dy = targetY - c.y;
  if (dy > CAMERA.deadzoneY) c.y = Approach(c.y, targetY - CAMERA.deadzoneY, CAMERA.followLerp, dt);
  else if (dy < -CAMERA.deadzoneY) c.y = Approach(c.y, targetY + CAMERA.deadzoneY, CAMERA.followLerp, dt);
  if (p.onShaft) c.y = Approach(c.y, targetY, CAMERA.followLerp * 1.4, dt);

  const targetVH = p.layer === "tunnel" ? CAMERA.tunnelViewHeight : CAMERA.viewHeight;
  c.viewHeight = Approach(c.viewHeight, targetVH, 2.6, dt);

  c.shake = Approach(c.shake, 0, CAMERA.shakeDecay, dt);
  if (c.shake < 0.004) c.shake = 0;

  ClampCamera(state);
}

// ───────────────────────────── HUD ─────────────────────────────

function UpdateHud(state) {
  const hud = state.hud;
  hud.prompt = CurrentPrompt(state);
  hud.objective = ActiveObjective(state);
  let sus = 0;
  for (const e of state.enemies) {
    if (!e.dormant && e.alertness > sus) sus = e.alertness;
  }
  hud.suspicion = sus;
  hud.villagersTotal = state.npcs.length;
  hud.villagersSafe = state.npcs.reduce((acc, n) => acc + (n.rescued ? 1 : 0), 0);
  hud.codexCount = Object.keys(state.world.codex).length;
}

// ───────────────────────────── 复活 ─────────────────────────────

function FindCheckpoint(state) {
  for (const c of state.level.checkpoints) {
    if (c.id === state.checkpointId) return c;
  }
  return { id: null, x: state.level.startX, y: state.level.startY, label: "" };
}

/** 回到最近的检查点。保留已开的地道口 / 已拉的闸 / 已救的人。 */
export function RespawnAtCheckpoint(state) {
  const cp = FindCheckpoint(state);
  const p = state.player;

  p.x = cp.x;
  p.y = cp.y;
  p.vx = 0;
  p.vy = 0;
  p.facing = 1;
  p.dead = false;
  p.deathReason = null;
  p.deathTimer = 0;
  p.hidden = false;
  p.hidePropId = null;
  p.onShaft = false;
  p.shaftId = null;
  p.action = null;
  p.actionTimer = 0;
  p.actionPropId = null;
  p.stagger = 0;
  p.noise = 0;
  p.noiseSpike = 0;
  p.stepTimer = 0;
  SnapToFloor(state);

  // 敌人回位、警觉清零
  for (const e of state.enemies) {
    e.x = e.homeX;
    e.y = e.homeY;
    e.facing = e.homeFacing;
    e.alertness = 0;
    e.state = e.probeAt ? "probe" : e.patrol ? "patrol" : "idle";
    e.hasLead = false;
    e.lastSeenX = e.homeX;
    e.lastSeenY = e.homeY;
    e.pauseTimer = 0;
    e.lookTimer = 0;
    e.patrolDir = 1;
    e.probePhase = "move";
    e.probeTimer = 0;
    SetAnim(e, "idle", 0, 0);
  }

  // 危害：已经被触发过的重新拉起（但重新给一次完整预警），已封住的保持关闭
  for (const h of state.hazards) {
    h.front = 0;
    h.level = 0;
    h.active = false;
    h.x1 = h.srcX0;
    h.hissTimer = 0;
    if (h.armed) h.warn = HAZARD.warnLeadSec;
  }

  // 跟随者跟着回到检查点
  state.trail = [{ x: p.x, y: p.y, d: 0 }];
  let order = 0;
  for (const n of state.npcs) {
    if (n.rescued || !n.follow) continue;
    order++;
    n.x = p.x - order * FOLLOW.spacing * (p.facing >= 0 ? 1 : -1);
    n.y = p.y;
    const floor = FloorUnder(state.level, n.x, n.y + 0.6, 1.6);
    if (floor) n.y = floor.y;
  }

  // 非 once 的触发区重新可触发
  for (const t of state.level.triggers) {
    state.triggersInside[t.id] = false;
    if (!t.once) state.triggersFired[t.id] = false;
  }

  state.phase = "play";
  state.camera.shake = 0;
  SnapCamera(state);
  UpdateHud(state);
  return state;
}

// ───────────────────────────── 事件 / 存档 ─────────────────────────────

/** 取走事件队列并清空。 */
export function DrainEvents(state) {
  if (!state || !state.events || state.events.length === 0) return [];
  const out = state.events;
  state.events = [];
  return out;
}

/** 存档：levelIndex / checkpointId / 已收集 codex。 */
export function SerializeProgress(state) {
  const codex = [];
  for (const id in state.world.codex) {
    if (state.world.codex[id]) codex.push(id);
  }
  codex.sort();
  return JSON.stringify({
    v: 1,
    key: SAVE_KEY,
    levelIndex: state.levelIndex,
    checkpointId: state.checkpointId || null,
    codex,
  });
}

/** 读档。坏数据返回 null，绝不抛错。 */
export function LoadProgress(raw) {
  if (typeof raw !== "string" || raw.length === 0) return null;
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const levelIndex = Math.max(0, Math.round(Num(data.levelIndex, 0)));
  const checkpointId = typeof data.checkpointId === "string" ? data.checkpointId : null;
  const codex = Array.isArray(data.codex) ? data.codex.filter((id) => typeof id === "string") : [];
  return { levelIndex, checkpointId, codex };
}

/** 把读到的存档灌进 state（Main 可选调用）。 */
export function ApplyProgress(state, progress) {
  if (!progress) return state;
  ResetLevel(state, progress.levelIndex);
  for (const id of progress.codex) state.world.codex[id] = true;
  if (progress.checkpointId) {
    for (const c of state.level.checkpoints) {
      if (c.id === progress.checkpointId) {
        state.checkpointId = c.id;
        state.player.x = c.x;
        state.player.y = c.y;
        SnapToFloor(state);
        SnapCamera(state);
        break;
      }
    }
  }
  UpdateHud(state);
  return state;
}

// ───────────────────────────── 调试钩子 ─────────────────────────────

/** 直接把玩家挪到某处（测试用）。 */
export function DebugTeleport(state, x, y) {
  const p = state.player;
  p.x = Num(x, p.x);
  p.y = Num(y, p.y);
  p.vx = 0;
  p.vy = 0;
  p.onShaft = false;
  p.shaftId = null;
  p.hidden = false;
  p.action = null;
  p.actionTimer = 0;
  SnapToFloor(state);
  state.trail = [{ x: p.x, y: p.y, d: 0 }];
  SnapCamera(state);
  UpdateHud(state);
  return state;
}

/** 按住一组输入跑若干秒（测试用）。 */
export function DebugHold(state, inputPatch, seconds) {
  const dt = 1 / 60;
  const total = Num(seconds, 1);
  let t = 0;
  while (t < total - 1e-9) {
    if (inputPatch && typeof inputPatch === "object") {
      for (const key in inputPatch) state.input[key] = inputPatch[key];
    }
    StepPlay(state, dt);
    t += dt;
  }
  return state;
}

/** 按一次交互键（测试用）。 */
export function DebugPressInteract(state) {
  state.input.interactPressed = true;
  StepPlay(state, 1 / 60);
  state.input.interactPressed = false;
  return state;
}

// ───────────────────────────── 机器人自动通关 ─────────────────────────────

function ClearInput(input) {
  input.moveX = 0;
  input.up = false;
  input.down = false;
  input.crouch = false;
  input.sneak = false;
  input.interactPressed = false;
  input.itemPressed = false;
  input.callPressed = false;
}

function BotPickupPropFor(state, item) {
  let best = null;
  let bestD = Infinity;
  for (const prop of state.level.props) {
    if (prop.interact !== "pickup") continue;
    if (!prop.data || prop.data.item !== item) continue;
    if (!InteractAvailable(state, prop)) continue;
    const d = Math.abs(PropX(state, prop) - state.player.x);
    if (d < bestD) {
      bestD = d;
      best = prop;
    }
  }
  return best;
}

function BotLeverPropFor(state, channel) {
  for (const prop of state.level.props) {
    if (prop.interact !== "lever") continue;
    if (!prop.data || prop.data.channel !== channel) continue;
    if (!InteractAvailable(state, prop)) continue;
    return prop;
  }
  return null;
}

function BotPropGoal(state, prop) {
  // 拉闸需要道具却没拿 → 先去捡
  if (prop.interact === "lever" && prop.data && prop.data.needItem && state.player.carrying !== prop.data.needItem) {
    const pick = BotPickupPropFor(state, prop.data.needItem);
    if (pick) return { x: PropX(state, pick), y: pick.y, prop: pick, tag: "item:" + prop.data.needItem };
  }
  return { x: PropX(state, prop), y: prop.y, prop, tag: "prop:" + prop.id };
}

function BotGoal(state) {
  const level = state.level;
  const p = state.player;

  // 1) 有活跃/已武装的危害而且能封 → 优先去封
  for (const h of state.hazards) {
    if (!h.armed) continue;
    if (!h.sealedBy || state.world.levers[h.sealedBy]) continue;
    const lever = BotLeverPropFor(state, h.sealedBy);
    if (lever) return BotPropGoal(state, lever);
  }

  // 2) 当前目标推导
  for (const obj of level.objectives) {
    if (ObjectiveDone(state, obj)) continue;
    const w = obj.doneWhen || {};
    if (w.propUsed) {
      const prop = FindPropById(state, w.propUsed);
      if (prop && InteractAvailable(state, prop)) return BotPropGoal(state, prop);
      if (prop) return { x: PropX(state, prop), y: prop.y, prop: null, tag: "propDone:" + prop.id };
    }
    if (w.trigger) {
      for (const t of level.triggers) {
        if (t.id !== w.trigger) continue;
        return { x: (t.x0 + t.x1) * 0.5, y: (t.yMin + t.yMax) * 0.5, prop: null, tag: "trigger:" + t.id };
      }
    }
    if (w.npcRescued) {
      const npcGoal = BotNpcGoal(state, w.npcRescued);
      if (npcGoal) return npcGoal;
    }
    if (w.atExit) break;
    break;
  }

  // 3) 出口要求带上所有人
  if (level.exit.needAllVillagers) {
    const npcGoal = BotNpcGoal(state, "all");
    if (npcGoal) return npcGoal;
  }

  return { x: level.exit.x, y: level.exit.y, prop: null, tag: "exit" };
}

function BotNpcGoal(state, which) {
  let best = null;
  let bestD = Infinity;
  for (const n of state.npcs) {
    if (n.rescued || n.follow) continue;
    if (which !== "all" && n.id !== which) continue;
    const d = Math.abs(n.x - state.player.x) + Math.abs(n.y - state.player.y) * 2;
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  if (!best) return null;
  // 优先走到对应的 talk 道具，没有就走到人身边（靠 call 招呼）
  for (const prop of state.level.props) {
    if (prop.interact === "talk" && prop.data && prop.data.npcId === best.id && InteractAvailable(state, prop)) {
      return { x: PropX(state, prop), y: prop.y, prop, tag: "npc:" + best.id };
    }
  }
  return { x: best.x, y: best.y, prop: null, npc: best, tag: "npc:" + best.id };
}

function BotPickShaft(state, fromY, toY, goalX) {
  const p = state.player;
  const goingDown = toY < fromY;
  let best = null;
  let bestScore = Infinity;
  for (const s of state.level.shafts) {
    const lo = s.yBottom - 0.9;
    const hi = s.yTop + 0.9;
    const coversFrom = fromY >= lo && fromY <= hi;
    if (!coversFrom) continue;
    // 这个竖井能不能把我带向目标方向
    if (goingDown && s.yBottom >= fromY - 0.5) continue;
    if (!goingDown && s.yTop <= fromY + 0.5) continue;
    const usable = ShaftUsable(state, s);
    const reachTarget = goingDown ? s.yBottom : s.yTop;
    const score =
      Math.abs(s.x - p.x) * 1.0 +
      Math.abs(s.x - goalX) * 0.6 +
      Math.abs(reachTarget - toY) * 1.2 +
      (usable ? 0 : 6);
    if (score < bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}

function BotHatchPropFor(state, hatchId) {
  for (const prop of state.level.props) {
    if (prop.interact !== "hatch") continue;
    const h = HatchForProp(state, prop);
    if (h && h.id === hatchId) return prop;
  }
  return null;
}

function BotThreat(state) {
  const p = state.player;
  let worst = null;
  for (const e of state.enemies) {
    if (e.dormant) continue;
    if (e.alertness < 0.3) continue;
    if (Math.abs(e.y - p.y) > 2.5) continue;
    const d = Math.abs(e.x - p.x);
    if (d > 14) continue;
    if (!worst || e.alertness > worst.alertness) worst = e;
  }
  return worst;
}

function BotHideSpot(state) {
  const p = state.player;
  let best = null;
  let bestD = Infinity;
  for (const prop of state.level.props) {
    if (prop.interact !== "hide") continue;
    if (!InteractAvailable(state, prop)) continue;
    const d = Math.abs(PropX(state, prop) - p.x);
    if (d > 6 || Math.abs(prop.y - p.y) > 2) continue;
    if (d < bestD) {
      bestD = d;
      best = prop;
    }
  }
  return best;
}

function BotWantsPrompt(state, bot, prompt, goal) {
  if (!prompt) return false;
  if (prompt.kind === "shaft") return false;
  if (prompt.blocked) return false;
  if (prompt.kind === "hide") return bot.hiding;
  if (bot.pressCooldown[prompt.id] > 0) return false;
  if (prompt.kind === "hatch") return true;
  if (prompt.kind === "read") return true;
  if (prompt.kind === "bell") return true;
  if (goal && goal.prop && goal.prop.id === prompt.id) return true;
  if (prompt.kind === "talk") return true;
  return false;
}

/**
 * 目标驱动的机器人：朝当前目标走，遇到要互动的就互动，遇到敌人就猫腰躲。
 * 不追求玩得漂亮，只保证能通关。返回 { won, seconds, reason }。
 */
export function DebugAutoPlay(state, maxSeconds = 240) {
  const dt = 1 / 60;
  const bot = {
    pressCooldown: {},
    stuckTimer: 0,
    lastX: state.player.x,
    lastY: state.player.y,
    unstickTimer: 0,
    unstickDir: 1,
    hiding: false,
    hideTimer: 0,
    lastGoal: "",
    lastReason: "",
    shaftId: null,
  };
  let t = 0;
  let guard = 0;
  const limit = Math.max(1, Num(maxSeconds, 240));

  while (t < limit && guard++ < 200000) {
    if (state.phase === "won") return { won: true, seconds: t, reason: "reached_exit" };
    BotThink(state, bot, dt);
    StepPlay(state, dt);
    t += dt;
    if (bot.giveUp) break;
  }

  if (state.phase === "won") return { won: true, seconds: t, reason: "reached_exit" };
  return {
    won: false,
    seconds: t,
    reason:
      (bot.giveUp ? "stuck" : "timeout") +
      " goal=" + (bot.lastGoal || "?") +
      " playerX=" + state.player.x.toFixed(1) +
      " playerY=" + state.player.y.toFixed(1) +
      " objective=" + ActiveObjective(state) +
      " deaths=" + state.stats.deaths,
  };
}

function BotThink(state, bot, dt) {
  const input = state.input;
  const p = state.player;
  ClearInput(input);

  for (const key in bot.pressCooldown) {
    if (bot.pressCooldown[key] > 0) bot.pressCooldown[key] -= dt;
  }

  if (state.phase === "panel") {
    input.interactPressed = true;
    return;
  }
  if (state.phase !== "play") return;
  if (p.dead) return;

  const goal = BotGoal(state);
  bot.lastGoal = goal.tag;

  // 卡住检测
  const moved = Math.abs(p.x - bot.lastX) + Math.abs(p.y - bot.lastY);
  if (moved > 0.35) {
    bot.lastX = p.x;
    bot.lastY = p.y;
    bot.stuckTimer = 0;
  } else {
    bot.stuckTimer += dt;
  }
  if (bot.stuckTimer > 30) {
    bot.giveUp = true;
    return;
  }

  // 威胁处理：猫腰 + 潜行；很危险就躲/退
  const threat = BotThreat(state);
  bot.hiding = false;
  if (threat) {
    input.crouch = true;
    input.sneak = true;
    if (threat.alertness > 0.62) {
      const spot = BotHideSpot(state);
      if (spot && Math.abs(PropX(state, spot) - p.x) < 1.2) {
        bot.hiding = true;
      } else if (spot) {
        BotWalkTo(state, bot, PropX(state, spot), input);
        MaybePress(state, bot, goal, input);
        return;
      } else if (threat.alertness > 0.8) {
        // 往反方向退一点
        input.moveX = p.x >= threat.x ? 1 : -1;
        MaybePress(state, bot, goal, input);
        return;
      }
    }
  }
  if (p.hidden && !bot.hiding) {
    input.interactPressed = true; // 没威胁就出来
    return;
  }
  if (bot.hiding && !p.hidden) {
    MaybePress(state, bot, goal, input);
    return;
  }
  if (p.hidden) return;

  // 竖直导航
  const needVertical = Math.abs(goal.y - p.y) > 1.4;
  if (p.onShaft) {
    const shaft = ShaftById(state, p.shaftId);
    if (shaft) {
      if (goal.y > p.y + 0.2) input.up = true;
      else if (goal.y < p.y - 0.2) input.down = true;
      else input.up = p.y < (shaft.yTop + shaft.yBottom) * 0.5 ? false : true;
      if (!input.up && !input.down) input.up = true;
    }
    return;
  }

  if (needVertical) {
    const shaft = BotPickShaft(state, p.y, goal.y, goal.x);
    if (shaft) {
      if (!ShaftUsable(state, shaft) && shaft.requiresHatch) {
        const hatchProp = BotHatchPropFor(state, shaft.requiresHatch);
        const rec = state.world.hatches[shaft.requiresHatch];
        const targetX = hatchProp ? PropX(state, hatchProp) : rec ? rec.x : shaft.x;
        BotWalkTo(state, bot, targetX, input);
        MaybePress(state, bot, goal, input, hatchProp);
        return;
      }
      if (Math.abs(p.x - shaft.x) > 0.3) {
        BotWalkTo(state, bot, shaft.x, input);
        MaybePress(state, bot, goal, input);
        return;
      }
      if (goal.y < p.y) input.down = true;
      else input.up = true;
      return;
    }
  }

  BotWalkTo(state, bot, goal.x, input);
  MaybePress(state, bot, goal, input);

  // 靠近乡亲但没有 talk 道具 → 呼应
  if (goal.npc && Math.abs(goal.npc.x - p.x) < 3.2 && Math.abs(goal.npc.y - p.y) < 2.2) {
    input.callPressed = true;
  }

  // 长时间没进展：抖一抖（试着上下、试着互动、试着反向）
  if (bot.stuckTimer > 4) {
    const phase = Math.floor(bot.stuckTimer) % 4;
    if (phase === 0) input.interactPressed = true;
    else if (phase === 1) input.down = true;
    else if (phase === 2) input.up = true;
    else input.moveX = -Math.sign(input.moveX || 1);
  }
  if (bot.stuckTimer > 9) input.crouch = true;
}

function BotWalkTo(state, bot, targetX, input) {
  const p = state.player;
  const dx = targetX - p.x;
  if (Math.abs(dx) < 0.28) {
    input.moveX = 0;
    return;
  }
  input.moveX = dx > 0 ? 1 : -1;
}

function MaybePress(state, bot, goal, input, preferProp) {
  const prompt = CurrentPrompt(state);
  if (!prompt) return;
  if (preferProp && prompt.id !== preferProp.id && prompt.kind !== "hatch") return;
  if (!BotWantsPrompt(state, bot, prompt, goal)) return;
  input.interactPressed = true;
  bot.pressCooldown[prompt.id] = 0.6;
}
