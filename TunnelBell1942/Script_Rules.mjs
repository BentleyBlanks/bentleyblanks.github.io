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
// 竖井吸附的水平半径。0.6 时"看着贴在梯子上却上不去"的死区有 0.35 米宽
// （玩家半宽 0.26，脚已经压在井口了还抓不住）。0.78 刚好覆盖到人的肩宽外沿，
// 又远小于道具互动半径 1.61，不会跟旁边的柴垛抢提示。
const SHAFT_GRAB_X = 0.78;
const FLUSH_OUT_REACH = 1.5; // 搜索状态的兵走到这么近，会把藏在道具里的人翻出来

/** 一个 channel 是否已经被打开——拉闸和地雷都算。
 *  危害的 armAt / sealedBy 都走这里，免得"能炸开的塌方"变成死锁。 */
function Switched(state, channel) {
  if (!channel || !state.world) return false;
  return !!(state.world.levers?.[channel] || state.world.mines?.[channel]);
}

// 落地硬直。原来是"超过 safeFallSpeed 一律 0.62 秒完全不能动"——
// 半秒多的输入锁死在没有战斗的游戏里只有惩罚没有博弈，玩家读成"手柄掉线了"。
// 改成随冲击强度插值的短硬直 + 期间保留一部分操控（踉跄，不是石化）。
const LAND_STUN_MIN_SEC = 0.20;
const LAND_STUN_MAX_SEC = 0.40;
const LAND_STUMBLE_SEC = 0.14; // 普通落地的小踉跄
const STAGGER_CONTROL = 0.34; // 硬直期间还剩多少操控（0 = 完全锁死）
const DEATH_RESPAWN_SEC = 1.5;
const CAPTURE_HOLD_SEC = 2.4; // 被抓收尾前的停顿，给这一下留点分量

const HEAR_RISE_PER_SEC = 0.78; // 听觉抬警觉的速度
const HEAR_ALERT_CAP = 0.82; // 光靠听永远抓不到人（>searchAt，<1）
const SEARCH_LOOK_SEC = 2.4;
const SUSPICIOUS_HOLD_SEC = 1.1;

// 警觉的分级门槛。契约只给了 suspiciousAt(0.28) / searchAt(0.62) 两档，
// 中间是一条连续曲线，玩家除了看进度条没有任何"分级的紧张"。
// 补两头：刚被扫到的第一下，和被抓前的最后一下。
const ALERT_GLIMPSE = 0.07; // 视线刚扫到（alertRiseSec=1.25 → 约 0.09s）
const ALERT_FINAL = 0.80; // 最后一秒（约 1.00s，离被抓还剩 0.25s）

// "他还在找我"的余温。**只是信息，不改行为**——这一点是实测逼出来的：
//
//   · 把警觉本身冻住半秒 → 探头一眼从 0.99 直接跳到 1.0，契约给的 1.25 秒
//     反应窗口当场归零（机器人第一幕死亡数 1 → 29）。
//   · 改成不动警觉、只延长敌人的 search/suspicious 行为 → 搜索态的兵会把
//     巡逻范围外扩 ±7 米，第一幕 86–103 那段"三个兵 + 一条狗"的走廊立刻
//     没有空窗，机器人 24 次死亡仍然过不去（0.25 秒都会让它慢 9 秒）。
//
// 所以警觉的升降完全照契约不动，这里只记一个"他还没松劲"的计时器，
// 交给 HUD / 音效去表达。真要让敌人搜得更久，得先让关卡把掩体间距放宽。
const HUNT_PERSIST_SEC = 1.8; // 掉出 searchAt 之后还惦记多久
const SUSPECT_PERSIST_SEC = 1.2; // 掉出 suspiciousAt 之后还惦记多久

// 反击三件套（AGENTS.md 0.1 / 5.4）。玩家没有攻击键：他做的是**启动**反击，
// 扣扳机的是全村。所以这三个动词一律要前提——没传到令的组，枪眼和地雷都按不动。
const SIGNAL_NOISE = 0.62; // 敲钢轨传令：这是响动，跑腿的风险就在这上面
const SIGNAL_SEC = 0.7;
const MINE_SEC = 0.55;
const LOOPHOLE_SEC = 0.6;
const MINE_RADIUS_X = 6.5; // 地雷把这个范围里的敌人掀出战场
// 雷埋在街面下、从地道里拉——所以爆炸要**向上够到地表**。
// 对称半径在这儿是错的：雷在 y=-8，敌人全在 y=0，差 8 米，
// 用 4 米的对称半径等于这颗雷永远炸不到任何人。
const MINE_REACH_UP = 9.0;
const MINE_REACH_DOWN = 2.5;
const LOOPHOLE_RANGE_X = 9.0; // 枪眼朝头顶的街面打，够着一段巡逻线
const RIFLE_SHOTS = 3;
// 子弹是有数的（AGENTS.md 0.0.1）。冀中民兵的弹药要省着用，一枪出去还打草惊蛇——
// 所以枪不是常规解法，敲晕才是。默认额度 = 每个枪眼**刚好一轮**，一发都不许浪费；
// 关卡可以用 level.ammo 压得更紧，让"先打哪个枪眼"变成真的取舍。
const AMMO_PER_LOOPHOLE = RIFLE_SHOTS;
const GUNSHOT_ALARM_X = 34; // 一枪响，这一片的人全都抬头
const GUNSHOT_HUNT_X = 16; // 这么近的直接朝枪响处扑
const BLAST_ALARM_X = 46; // 地雷更响

// 招呼（F）：既是唯一的"带上乡亲"手段，也是把掉队的人拉回来的手段。
const CALL_RECRUIT_RANGE_X = 7.0;
const CALL_RECRUIT_RANGE_Y = 2.5;
const CALL_RALLY_SEC = 2.6; // 喊完之后跟随者加速归队的时长
const CALL_RALLY_SCALE = 1.7; // 归队时的速度倍率

const PROBE_WIND_SEC = 1.0; // 刺刀前摇（契约底线 ≥0.8）
const PROBE_STRIKE_SEC = 0.28;
const PROBE_REST_SEC = 1.5;
const PROBE_RADIUS = 0.8;

const TRAIL_STEP = 0.26; // 面包屑采样间距
const TRAIL_MAX = 512;
// 跟随者沿面包屑的"弧长"行进，不是直线扑向目标点。直线会切角：
// 拐进竖井那一下整队人会斜着穿过土层，看着就是从墙里游过去。
const FOLLOW_SNAP = 0.10; // 弧长误差小于这个就算到位
const FOLLOW_SLOT_SLACK = 0.55; // 队形容差：差这么多以内不小跑

const HAZARD_HEIGHT = 2.4; // 危害在竖直方向覆盖多高
const HAZARD_RAMP = 0.85; // 浓度爬升（每秒）
const HAZARD_CLEAR = 1.3; // 封住后浓度回落（每秒）

const CHECKPOINT_RADIUS = 1.7;

const LIGHT_VISIBILITY = 0.6; // 提着马灯，有效视距最多放大到 1.6 倍
const DARK_VISIBILITY = 0.78; // 灭了灯在地道里摸黑，更难被看见
const VENT_RANGE = 3.2; // 通气孔：地表与地道之间的声音通道
// 隔着土层，脚步声是**闷**的。原来这里把竖直距离乘 0.6（= 更容易听见），
// 跟注释写的"打折"正好相反：结果地道里跑一步，头顶街上的兵反而先听见。
// 那条 bug 直接否掉了"从地下绕过去"——绕过去等于自报家门。
// 现在：有土层隔着 → 竖直距离按 1.9 倍算（几乎听不见）；正对通气孔 → 按 1.0（原样传过来）。
const CROSSLAYER_MUFFLE = 1.9;

// ───────────────────────────── 引 / 封（AGENTS.md 0.0）─────────────────────────────
//
// 这两个动词存在的理由：**地道是武器，地表是暴露的地方**。一个熟自己村子的人
// 不该只会贴墙躲，他知道哪块墙一推就倒、知道往哪儿扔块土坷垃能把人调开。
//
// 「引」有两种形态，方向相反，别混成一个：
//   · 扔（Q，随时随地，不需要道具）—— 响在**别处**，把人从我要走的路上调开。
//     这是玩家最常用的主动动词，所以它不许挂在关卡数据上，否则关卡没写就等于没有。
//   · lure 道具（E，关卡布置）—— 响在**自己脚下这个点**，把人叫过来。
//     这是布置陷阱用的：叫到死胡同、叫到雷上、叫到枪眼底下。
//
// 代价不是"弹药"，是三样：起手要 0.5 秒站着不能动、有冷却、以及"热度"——
// 同一片地方扔多了，他们就不再往响声那边跑，改朝**声音的来处**（也就是玩家）搜。
const LURE_WIND_SEC = 0.5; // 弯腰摸一块土坷垃，抡出去
const LURE_COOL_SEC = 2.4; // 冷却。连按无效是设计，不是限制
const LURE_THROW_DIST = 9.5; // 落点离玩家多远（沿面朝方向；撞墙就落在墙根）
const LURE_MIN_DIST = 2.6; // 比这还近就别扔了，等于把人叫到自己脸上
// 落点的**听得见半径，单位是米**（跟关卡数据 lure.data.radius 同一套单位）。
// 别拿它当"噪音强度"乘 hearing：那样算出来只有五米，比扔出去的距离还短，
// 等于只能引到已经站在落点旁边的人——引这个动词当场就废了。
// 11 米略大于 9.5 米的投掷距离，正好覆盖前方那一段路。
const LURE_RADIUS = 11;
const LURE_EAR_MIN = 0.7; // 耳朵好坏的折算范围（狗听得远）
const LURE_EAR_MAX = 1.6;
const LURE_SELF_NOISE = 0.18; // 起手那一下自己发出的动静：贴着人扔照样露馅
// 走到落点后蹲着查看多久 —— 这段就是玩家挣来的窗口。
// 5.5 秒不是随手定的：它要够玩家从十米外贴到他背后（背对着的人看不见你，
// 所以那十米是站着跑的，3.3 m/s ≈ 3 秒），再加上 1.2 秒的制服前摇。
// 短于 5 秒，「引开 → 绕到背后 → 敲晕」这条闭环在时间上就不成立。
const LURE_HOLD_SEC = 5.5;
const LURE_TRAVEL_MAX = 7.0; // 走过去的时间上限，免得他为一块石头追一辈子
const LURE_RANGE_SLACK = 17; // 为了查这块石头，他愿意离开巡逻区间多远
const LURE_FOCUS_VISION = 0.5; // 蹲着盯地上那块石头时，视距对折（这是窗口的来源）
const LURE_HEAT_FADE = 1 / 15; // 热度每秒退多少
const LURE_HEAT_WISE = 2.5; // 热度过了这条线，他们不上当，改朝声音来处搜
const LURE_PROP_HOLD = 5.6; // 关卡布置的 lure 点：叫过来之后停得更久（要够拉雷/开枪眼）

// 「封」：堵街、掩地道口、放倒院墙。切断的是**敌人的**路——
// 玩家的通行判定（CanWalkTo）永远不看这张表，这是红线，别改。
const BLOCK_SEC = 0.9; // 放倒一堵墙要点力气
const BLOCK_NOISE = 0.72; // 而且很响：当着人的面封路是送死
const BLOCK_HALF_WIDTH = 0.9; // 封口的横向厚度（敌人跨不过去的那一段）
const BLOCK_REACH_Y = 2.4; // 只对同一层的敌人生效

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

/** 过场脚本归一化。坏数据一律降级成"能放完的空步骤"，绝不让一段过场卡死玩家。 */
function NormalizeCutscenes(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const id in raw) {
    if (!Object.prototype.hasOwnProperty.call(raw, id)) continue;
    const cut = raw[id];
    if (!cut || typeof cut !== "object") continue;
    const steps = Arr(cut.steps)
      .map((s) => NormalizeStep(s))
      .filter(Boolean);
    out[id] = {
      id,
      letterbox: cut.letterbox === "full" ? "full" : "wide",
      skippable: cut.skippable === undefined ? true : !!cut.skippable,
      steps,
    };
  }
  return out;
}

function NormalizeStep(s) {
  if (!s || typeof s !== "object" || typeof s.kind !== "string") return null;
  const to = s.to && typeof s.to === "object" ? s.to : null;
  const step = {
    kind: s.kind,
    // sec 是这一步的时长。0 表示瞬发；panel 步没有时长（等玩家翻页）。
    sec: Math.max(0, Num(s.sec, 0)),
    id: typeof s.id === "string" ? s.id : null,
    ids: Arr(s.ids).filter((x) => typeof x === "string"),
    ease: s.ease === "linear" ? "linear" : "inOut",
    anim: typeof s.anim === "string" ? s.anim : null,
    facing: s.facing === -1 ? -1 : s.facing === 1 ? 1 : null,
    rings: Math.max(1, Math.round(Num(s.rings, 3))),
    to: null,
  };
  if (to) {
    step.to = {
      x: typeof to.x === "number" && Number.isFinite(to.x) ? to.x : null,
      y: typeof to.y === "number" && Number.isFinite(to.y) ? to.y : null,
      viewHeight:
        typeof to.viewHeight === "number" && Number.isFinite(to.viewHeight) ? to.viewHeight : null,
    };
  }
  if (step.kind === "fade") step.fadeTo = Clamp(Num(s.to, 1), 0, 1);
  return step;
}

function NormalizeLevel(raw, index) {
  const level = raw && typeof raw === "object" ? raw : FallbackLevel(index);

  level.id = typeof level.id === "string" ? level.id : "act" + (index + 1);
  level.chapterId = typeof level.chapterId === "string" ? level.chapterId : level.id;
  level.title = typeof level.title === "string" ? level.title : "";
  level.actor = typeof level.actor === "string" ? level.actor : "chuanbao";
  level.timeOfDay = typeof level.timeOfDay === "string" ? level.timeOfDay : "night";
  // "captured"：这一幕以主角被抓收场，不是走到出口。第一幕的情感支点。
  level.endKind = typeof level.endKind === "string" ? level.endKind : null;

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

  // —— 挖掘（AGENTS.md 0.0.2）——
  // 授权挖点 + 倒土点。自由地形破坏会同时打穿寻路、敌人导航和土层剖面，白盒阶段不做。
  level.digSpots = Arr(level.digSpots).map((s, i) => {
    const x = Num(s.x, 0);
    const y = Num(s.y, 0);
    const dir = typeof s.dir === "string" ? s.dir : "right";
    const fall = dir === "left" ? -6 : dir === "right" ? 6 : 0;
    const rise = dir === "up" ? 4 : dir === "down" ? -4 : 0;
    return {
      id: typeof s.id === "string" ? s.id : "dig_" + i,
      x,
      y,
      dir,
      toX: Num(s.toX, x + fall),
      toY: Num(s.toY, y + rise),
      sec: Clamp(Num(s.sec, INTERACT.digSec * 2), 2.5, 6.0),
      spoil: Clamp(Math.round(Num(s.spoil, 1)), 1, 3),
      soft: s.soft === undefined ? true : !!s.soft,
      // 挖通之后新洞的净空。关卡可以写绝对高度 ceilY，或写净空 clearance；
      // 都不写就按"一锨一锨掏出来的矮洞"给 1.20 米——只够猫腰，
      // 跟现成的干线（1.78 以上）在手感上分得开。
      ceilY: typeof s.ceilY === "number" && Number.isFinite(s.ceilY) ? s.ceilY : null,
      clearance: Clamp(Num(s.clearance, 1.2), HEADROOM.crawlNeeds, 3.0),
      label: typeof s.label === "string" ? s.label : "这段土",
      kind: typeof s.kind === "string" ? s.kind : "prop_beam",
      hidden: !!s.hidden,
    };
  });
  level.spoilSinks = Arr(level.spoilSinks).map((s, i) => ({
    id: typeof s.id === "string" ? s.id : "sink_" + i,
    x: Num(s.x, 0),
    y: Num(s.y, 0),
    capacity: Math.max(1, Math.round(Num(s.capacity, 3))),
    label: typeof s.label === "string" ? s.label : "枯井",
    kind: typeof s.kind === "string" ? s.kind : "well",
    hidden: !!s.hidden,
  }));

  // 挖点/倒土点直接长成互动道具，关卡不用再写一遍 prop。
  // 关卡如果自己写了 interact:"dig"/"dumpSpoil" 的 prop（想换个 kind 或换个位置），
  // 就以它为准，这里不再重复生成。
  {
    const claimed = {};
    for (const p of level.props) {
      const id = p.data && (p.data.digSpotId || p.data.sinkId);
      if (typeof id === "string") claimed[id] = true;
    }
    for (const s of level.digSpots) {
      if (claimed[s.id]) continue;
      level.props.push({
        id: "prop_" + s.id, x: s.x, y: s.y, z: 0, kind: s.kind, facing: s.dir === "left" ? -1 : 1,
        interact: "dig", data: { digSpotId: s.id, panels: [] }, label: s.label, hidden: s.hidden,
      });
    }
    for (const s of level.spoilSinks) {
      if (claimed[s.id]) continue;
      level.props.push({
        id: "prop_" + s.id, x: s.x, y: s.y, z: 0, kind: s.kind, facing: 1,
        interact: "dumpSpoil", data: { sinkId: s.id, panels: [] }, label: s.label, hidden: s.hidden,
      });
    }
  }

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
    // 「按人分路线」：孩子钻得过矮口但够不着梯子，老人爬不了竖井。
    // 缺省一律 true——老关卡不写这两个字段，行为跟以前完全一样。
    canCrawl: n.canCrawl === undefined ? true : !!n.canCrawl,
    canClimb: n.canClimb === undefined ? true : !!n.canClimb,
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
        cutscene: typeof emit.cutscene === "string" ? emit.cutscene : null,
      },
    };
  });

  // 机位区（见 AGENTS.md 2.3）。缺字段一律退回默认跟随的取值，
  // 关卡少写一个 lift 不该让整段镜头塌成 0。
  level.shots = Arr(level.shots)
    .map((s, i) => ({
      id: typeof s.id === "string" ? s.id : "shot_" + i,
      x0: Num(s.x0, 0),
      x1: Num(s.x1, 0),
      viewHeight: Num(s.viewHeight, 0) > 0 ? Num(s.viewHeight, 0) : null,
      lift: typeof s.lift === "number" && Number.isFinite(s.lift) ? s.lift : null,
      anchorX: typeof s.anchorX === "number" && Number.isFinite(s.anchorX) ? s.anchorX : null,
      ease: Num(s.ease, 1.2) > 0.01 ? Num(s.ease, 1.2) : 1.2,
      yMin: Num(s.yMin, level.bounds.yBottom),
      yMax: Num(s.yMax, level.bounds.yTop),
      reason: typeof s.reason === "string" ? s.reason : "",
    }))
    .filter((s) => s.x1 > s.x0);

  level.cutscenes = NormalizeCutscenes(level.cutscenes);

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

/**
 * 目标 x 能不能过去。
 * 规则（照抄《勇敢的心》的手感）：
 *   - 净空连爬都不够 → 是墙，谁也进不去；
 *   - 台阶太高 → 是墙；
 *   - 站着的人进不了"要猫腰"的矮口，必须先低头（按住 crouch 或本来就在矮处）。
 *     进去之后姿态自动维持，绝不会被卡在几何里。
 */
function CanWalkTo(state, x, fromY, posture) {
  const level = state.level;
  if (x < level.bounds.x0 - 1 || x > level.bounds.x1 + 1) return false;
  const col = Column(level, x, fromY + STEP_UP, STEP_UP + FLOOR_SNAP);
  if (!col.floor) return true; // 悬空：允许走过去然后掉下去
  if (col.clearance < HEADROOM.crawlNeeds - 0.02) return false;
  if (col.floorY > fromY + STEP_UP) return false;
  if (posture === "stand" && col.clearance < HEADROOM.standNeeds) return false;
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

      // 「引」：随时可用的扔，不占携带槽（提着马灯照样扔得动）
      lureCooldown: 0,
      lureAimX: 0,
      lureAimY: 0,
      // 「挖」：背上背着多少土。跟 carrying 分开——土在背篓里，灯在手上。
      spoil: 0,
    },

    // aspect = 视口宽/高，由集成层在 Resize 时写入，摄像机夹紧要用它
    camera: {
      x: 0,
      y: 0,
      viewHeight: CAMERA.viewHeight,
      shake: 0,
      aspect: 16 / 9,
      breathX: 0,
      breathY: 0,
    },
    enemies: [],
    npcs: [],
    hazards: [],
    world: {
      hatches: {},
      levers: {},
      squads: {}, // squadId -> "idle" | "ready" | "fired"
      mines: {}, // channel -> 已引爆
      pushed: {},
      picked: {},
      codex: {},
      revealed: {},
      used: {},
      bellRung: false,
      dropCount: 0,
      // 封：channel -> true（渲染层按这个把墙画倒）
      blocked: {},
      // 封的几何：敌人跨不过去的那几段。玩家的通行判定不看这张表。
      blocks: [],
      // 引的"热度"：同一片地方扔多了就不灵了
      lureHeat: 0,
      lureCount: 0,
    },
    story: { chapterId: "act1", queue: [], seen: {}, objectiveText: "" },
    hud: {
      prompt: null,
      objective: "",
      suspicion: 0,
      alertStage: "calm",
      threat: null,
      callHint: null,
      lure: null, // { ready, cooldown, x, y, heat } —— UI 画准星/冷却圈用
      ammo: 0, // 子弹是有数的，玩家要一直看得见还剩几发
      spoil: 0, // 背上背着多少土
      spoilPiles: 0, // 地上还有几堆没处理的新土（= 几条露给敌人的线索）
      knockout: null, // { id, name } —— 站位成立时才有值
      stuckFollowers: [], // [{ id, name, reason:"crawl"|"climb" }] 谁没跟上、为什么
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

    // 演出（渲染 / 音频只读）
    cutscene: null,
    pendingCutscene: null,
    fade: 0, // 0 = 全亮，1 = 全黑
    timeScale: 1, // 0.25..1，关键瞬间的张弛
    timeScaleTimer: 0,
    timeScaleTarget: 1,
    slowSpent: 0,
    camHandback: 0,
    shot: null, // 当前生效的机位区（id + 权重），UI 调试用

    // 内部簿记（渲染层不需要读）
    triggersFired: {},
    triggersInside: {},
    trail: [],
    navNodes: null,
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
  state.trail = [];
  state.winArmed = false;
  state.navNodes = null; // 换关卡了，机器人的导航图作废
  // 一帧缓存按 state.time 记账，而 time 刚被清零——不作废会读到上一幕的旧答案
  state.koCacheT = -1;
  state.koCache = null;
  state.aimCacheT = -1;
  state.aimCache = null;
  state.checkpointId = null;
  state.stats.timeInLevel = 0;
  state.cutscene = null;
  state.fade = 0;
  state.timeScale = 1;
  state.timeScaleTimer = 0;
  state.timeScaleTarget = 1;
  state.slowSpent = 0;
  state.camHandback = 0;
  state.shot = null;
  state.shotId = null;
  state.shotW = 0;

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
  // 各小组一律从 idle 起：反击的前提每一幕都要重新跑腿挣回来
  state.world.squads = {};
  state.world.mines = {};
  for (const prop of level.props) {
    const sid = prop.data && prop.data.squadId;
    if (typeof sid === "string" && !state.world.squads[sid]) state.world.squads[sid] = "idle";
    const need = prop.data && prop.data.needSquad;
    if (typeof need === "string" && !state.world.squads[need]) state.world.squads[need] = "idle";
  }
  state.world.pushed = {};
  state.world.picked = {};
  state.world.revealed = {};
  state.world.used = {};
  state.world.bellRung = false;
  state.world.dropCount = 0;
  state.world.blocked = {};
  state.world.blocks = [];
  state.world.lureHeat = 0;
  state.world.lureCount = 0;
  // 挖掘
  state.world.dug = {};
  state.world.digProgress = {};
  state.world.spoilPiles = [];
  state.world.sinks = {};
  for (const s of level.spoilSinks) state.world.sinks[s.id] = { filled: 0, capacity: s.capacity };
  // 弹药：关卡没写就按"每个枪眼刚好一轮"给，绝不会因为没子弹而死锁。
  {
    let loopholes = 0;
    for (const prop of level.props) {
      if (prop.interact === "loophole") loopholes++;
    }
    const authored = Num(level.ammo, NaN);
    state.world.ammo = Number.isFinite(authored) ? Math.max(0, Math.round(authored)) : loopholes * AMMO_PER_LOOPHOLE;
    state.world.ammoMax = state.world.ammo;
    state.world.shotsFired = 0;
  }
  state.capturedEnding = false;
  // codex 跨幕保留，不清空

  // 敌人运行时
  // 谁是"还没登场"的敌人：触发区的 emit.spawn，以及道具 data.spawn（敲钟引来的追兵）。
  // 登场之前必须当作完全不存在——没有视野、不产生警觉、也不挡机器人的路。
  const spawnGated = {};
  for (const t of level.triggers) {
    for (const id of t.emit.spawn) spawnGated[id] = true;
  }
  for (const prop of level.props) {
    for (const id of Arr(prop.data && prop.data.spawn)) spawnGated[id] = true;
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

    // 感知结果（渲染/UI 只读）：谁在看我、现在是哪一档
    seesPlayer: false,
    hearsPlayer: false,
    alertStage: "calm",
    huntTimer: 0,
    suspectTimer: 0,
    linger: 0,

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
    defeated: false,
    probeAt: e.probeAt,
    probeIndex: 0,
    probePhase: "move",
    probeTimer: 0,
    stepTimer: 0,
    barkTimer: 0,

    // 被"引"过去时的运行时。lured 是给渲染/机器人读的：
    // 这个兵现在盯着地上一块石头，不是盯着我。
    lured: false,
    lureX: 0,
    lureY: 0,
    lureTimer: 0, // 还愿意为这块石头花多久（走过去 + 蹲着看）
    lureHold: 0, // 到了之后还要蹲多久
    lureAt: false, // 已经到落点了
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
    canCrawl: n.canCrawl !== false,
    canClimb: n.canClimb !== false,
    stuckReason: null, // null | "crawl" | "climb"

    // 跟随运行时（渲染层可读 posture/height/speed/slotError）
    trailD: 0,
    slotError: 0,
    rally: 0,
    posture: "stand",
    crouch: false,
    height: PLAYER.standHeight,
    speed: 0,
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
  p.lureCooldown = 0;
  p.lureAimX = p.x;
  p.lureAimY = p.y;
  p.spoil = 0;
  p.knockoutId = null;
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

  // 开场过场只挂号，不自动进（理由见 FireTrigger 里 emit.cutscene 的注释）
  state.pendingCutscene =
    chapter && typeof chapter.openingCutscene === "string" ? chapter.openingCutscene : null;

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

// 气泡不抢 phase：Rules 只负责发事件 + 排队，要不要暂停由 Main 决定
// （Main 可以自己把 phase 置成 "panel"，Rules 会停下模拟，队列清空后自动放行）。
function QueuePanel(state, panelId) {
  if (typeof panelId !== "string" || !panelId) return;
  if (state.story.seen[panelId]) return;
  state.story.seen[panelId] = true;
  state.story.queue.push(panelId);
  while (state.story.queue.length > 12) state.story.queue.shift();
  Emit(state, { kind: "panel", id: panelId });
}

/** 一条气泡建议显示多久（秒）。给 Main 的 UI 当默认停留时间用。 */
export function PanelDuration(panelId) {
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
  state.camera.breathX = 0;
  state.camera.breathY = 0;
  ClampCamera(state);
}

function UpdateLayer(p) {
  p.layer = p.y < -1 ? "tunnel" : "surface";
}

// ───────────────────────────── 主循环 ─────────────────────────────

// 时间张弛。三条规矩，都写死在这里而不是交给调用方：
//   1. 每次不超过 0.8 秒；
//   2. 只在玩家**不需要操作**的瞬间用（敲钟的定格、被发现的那一下、危害引爆的前摇）；
//   3. 只减速不加速，且过场里一律 1（过场自己就是节奏）。
// 每一档的"保持时长 + 缓回常速的时间"都要落进 0.8 秒预算，
// 所以保持段比看上去短：缓回来那一段也还是慢动作，玩家分不出它属于哪一半。
//   缓回耗时 = (1 - scale) / recoverPerSec
const TIME_SLOW = {
  min: 0.25,
  spotted: 0.32, // 被发现：此刻玩家已经没有可打的牌，这一下纯粹是演出
  spottedSec: 0.45, // 0.45 + 0.28 = 0.73s
  bell: 0.45, // 敲钟：ring 动作本来就锁着玩家
  bellSec: 0.42, // 0.42 + 0.23 = 0.65s
  hazard: 0.55, // 危害引爆的前摇（预警阶段，玩家还没被逼着跑）
  hazardSec: 0.3, // 0.30 + 0.19 = 0.49s
  recoverPerSec: 2.4,
};

const TIME_SLOW_BUDGET = 0.8; // 一次**连续**放慢的总上限

function SlowTime(state, scale, seconds) {
  if (!state || state.cutscene) return;
  const s = Clamp(Num(scale, 1), TIME_SLOW.min, 1);
  let sec = Clamp(Num(seconds, 0), 0, TIME_SLOW_BUDGET);
  if (sec <= 0) return;
  // 已经在更慢的档上就不打断
  if (state.timeScaleTimer > 0 && state.timeScaleTarget <= s) return;
  // 连续放慢的总预算。两个戏剧点凑在一起（敲完钟当场被发现）会各要 0.5 秒，
  // 叠起来接近一秒的慢动作，玩家读到的不是仪式感是卡顿。
  const left = TIME_SLOW_BUDGET - Num(state.slowSpent, 0);
  if (left <= 0.01) return;
  if (sec > left) sec = left;
  state.timeScaleTarget = s;
  state.timeScaleTimer = sec;
  state.timeScale = s;
  Emit(state, { kind: "timeScale", scale: s, sec });
}

function UpdateTimeScale(state, realDt) {
  if (state.cutscene) {
    state.timeScale = 1;
    state.timeScaleTimer = 0;
    state.slowSpent = 0;
    return;
  }
  if (state.timeScaleTimer > 0) {
    state.timeScaleTimer = Math.max(0, state.timeScaleTimer - realDt);
    state.slowSpent = Num(state.slowSpent, 0) + realDt;
    state.timeScale = state.timeScaleTarget;
    if (state.timeScaleTimer <= 0) state.timeScaleTarget = 1;
    return;
  }
  if (state.timeScale < 1) {
    state.timeScale = Math.min(1, state.timeScale + TIME_SLOW.recoverPerSec * realDt);
    state.slowSpent = Num(state.slowSpent, 0) + realDt;
  } else {
    // 回到常速才把预算还回去：这样"连续放慢"的上限是真的连续
    state.slowSpent = 0;
  }
}

/** 推进一帧。dt 秒；内部 clamp 到 ≤1/30，超出分多个子步。确定性，无 Math.random。 */
export function StepPlay(state, dt) {
  if (!state || !state.level) return;
  let realDt = Num(dt, 0);
  if (realDt <= 0) return;
  if (realDt > 0.5) realDt = 0.5; // 掉帧保护：宁可慢放也不穿墙
  UpdateTimeScale(state, realDt);
  // 张弛只缩放**模拟**的推进量；子步上限照旧，所以放慢不会让步长失控
  let remain = realDt * Clamp(Num(state.timeScale, 1), TIME_SLOW.min, 1);
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

  // 过场接管一切：玩家不动、AI 不跑、镜头归脚本。
  if (state.phase === "cutscene" && state.cutscene) {
    state.stats.timeInLevel += dt;
    UpdateCutscene(state, dt);
    state.camera.shake = Approach(state.camera.shake, 0, CAMERA.shakeDecay, dt);
    ClampCamera(state);
    UpdateHud(state);
    return;
  }

  // 过场刚放完留下的黑幕自己擦掉，绝不许把玩家关在黑屏里
  if (state.fade > 0 && !state.cutscene) {
    state.fade = Math.max(0, state.fade - dt / CUT_FADE_OUT_SEC);
  }

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
    UpdateSpoilPiles(state);
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
  // Main 如果为了显示气泡把 phase 设成 "panel"，队列清空后自动回到 play，
  // 保证任何情况下都不会因为气泡卡死。
  if (state.phase === "panel") {
    state.player.vx = 0;
    if (state.story.queue.length === 0) state.phase = "play";
  }
}

// ───────────────────────────── 过场（Cutscene）─────────────────────────────
//
// 过场不是"弹一串气泡"：镜头自己走、角色按脚本走位、玩家交出操作权。
// 见 AGENTS.md 3.1。这里只做状态机与副作用结算，黑边/字幕归 UI。
//
// 一条硬规矩：**跳过与放完必须留下一模一样的世界**。
// 所有会改世界的 step（spawn / reveal / bell）都走同一个 ApplyStep，
// 跳过时只是把剩下的步骤按顺序瞬发一遍，不走另一条代码路径。

const CUT_HANDBACK_SEC = 1.15; // 过场结束后镜头交还给跟随的缓冲
const CUT_PANEL_AUTO_PAD = 0.5; // 气泡自动翻页的额外停留（UI 不调 Advance 时的保险）
const CUT_FADE_OUT_SEC = 0.55; // 收场时把黑幕擦掉的时长

function FindCutsceneDef(state, id) {
  const table = state.level && state.level.cutscenes ? state.level.cutscenes : null;
  if (!table || typeof id !== "string") return null;
  return Object.prototype.hasOwnProperty.call(table, id) ? table[id] : null;
}

function CutsceneActorRef(state, id) {
  if (id === "player") return state.player;
  for (const e of state.enemies) {
    if (e.id === id) return e;
  }
  for (const n of state.npcs) {
    if (n.id === id) return n;
  }
  return null;
}

/** 进入一段过场。返回是否真的开始了。 */
export function StartCutscene(state, id) {
  if (!state || !state.level) return false;
  const def = FindCutsceneDef(state, id);
  if (!def || def.steps.length === 0) return false;
  if (state.cutscene) return false;
  if (state.player.dead) return false;

  const p = state.player;
  p.vx = 0;
  p.vy = 0;
  p.action = null;
  p.actionTimer = 0;
  p.actionPropId = null;
  p.stagger = 0;
  p.noise = 0;
  p.noiseSpike = 0;

  state.phase = "cutscene";
  state.timeScale = 1;
  state.cutscene = {
    // —— 契约字段（渲染 / UI 只读）——
    id,
    stepIndex: -1,
    t: 0,
    letterbox: def.letterbox,
    fade: state.fade,
    skippable: def.skippable,
    // —— 内部 ——
    steps: def.steps,
    stepSec: 0,
    tweens: [],
    cam: null,
    fadeFrom: state.fade,
    fadeTo: state.fade,
    fadeSec: 0,
    fadeT: 0,
    panelId: null,
    panelHold: 0,
    scripted: [],
    restore: [],
  };
  if (state.pendingCutscene === id) state.pendingCutscene = null;
  Emit(state, { kind: "cutsceneStart", id, letterbox: def.letterbox, skippable: def.skippable });
  EnterNextStep(state, false);
  return true;
}

/** 翻页 / 推进（UI 在玩家按键时调；panel 步之外无效）。 */
export function AdvanceCutscene(state) {
  const cs = state && state.cutscene;
  if (!cs) return false;
  if (cs.stepSec >= 0) return false; // 不是等翻页的步骤
  if (cs.panelId) DismissPanelById(state, cs.panelId);
  EnterNextStep(state, false);
  return true;
}

/**
 * 跳过。把剩余步骤的副作用**全部结算完**再收场。
 * 少结算一个 spawn/reveal 就等于"一按跳过就卡关"，这条比演出重要得多。
 */
export function SkipCutscene(state) {
  const cs = state && state.cutscene;
  if (!cs) return false;
  // 当前这一步的副作用在进入时已经落过了，只要把它的补间走完
  SettleCutsceneTweens(state);
  let guard = 0;
  while (cs.stepIndex + 1 < cs.steps.length && guard++ < 4096) {
    cs.stepIndex++;
    ApplyStep(state, cs.steps[cs.stepIndex], true);
    SettleCutsceneTweens(state);
  }
  EndCutscene(state);
  return true;
}

/** 当前过场是否停在等翻页的气泡上（UI 用来决定显不显示"继续"）。 */
export function CutscenePanel(state) {
  const cs = state && state.cutscene;
  return cs && cs.stepSec < 0 ? cs.panelId : null;
}

function EnterNextStep(state, instant) {
  const cs = state.cutscene;
  let guard = 0;
  while (guard++ < 4096) {
    cs.stepIndex++;
    if (cs.stepIndex >= cs.steps.length) {
      EndCutscene(state);
      return;
    }
    cs.t = 0;
    cs.panelId = null;
    cs.stepSec = ApplyStep(state, cs.steps[cs.stepIndex], instant);
    if (cs.stepSec !== 0) return; // 阻塞步骤（>0 计时，<0 等翻页）
  }
  EndCutscene(state);
}

/**
 * 执行一个步骤。返回这一步要阻塞多久：
 *   >0 秒数 / 0 瞬发（立刻进下一步）/ <0 等玩家翻页。
 * `instant=true` 时只落副作用、不阻塞——跳过走的就是这条。
 * 副作用无论哪条路径都一模一样，这是"跳过 == 放完"的唯一保证。
 */
function ApplyStep(state, step, instant) {
  const cs = state.cutscene;
  switch (step.kind) {
    case "camera": {
      const to = step.to || {};
      const cam = state.camera;
      cs.cam = {
        fromX: cam.x,
        fromY: cam.y,
        fromVH: cam.viewHeight,
        toX: to.x === null || to.x === undefined ? cam.x : to.x,
        toY: to.y === null || to.y === undefined ? cam.y : to.y,
        toVH: to.viewHeight === null || to.viewHeight === undefined ? cam.viewHeight : to.viewHeight,
        sec: step.sec,
        t: 0,
        ease: step.ease,
      };
      if (instant || step.sec <= 0) {
        ApplyCutsceneCamera(state, 1);
        return 0;
      }
      return step.sec;
    }
    case "actor": {
      const ref = CutsceneActorRef(state, step.id);
      if (!ref) return 0;
      const to = step.to || {};
      const toX = to.x === null || to.x === undefined ? ref.x : to.x;
      const toY = to.y === null || to.y === undefined ? ref.y : to.y;
      if (cs.scripted.indexOf(ref) < 0) {
        // 休眠的敌人也能当演员（山田、汤丙会在开场戏里摸进村，但那时还没"登场"）。
        // 记下他原来的岗位与休眠状态：演完要原样还回去，
        // 否则一段过场就把关卡的敌人配置改写了。
        cs.scripted.push(ref);
        ref.cutsceneActive = true;
        cs.restore.push({
          ref,
          x: ref.x,
          y: ref.y,
          facing: ref.facing,
          dormant: ref.dormant === undefined ? null : ref.dormant,
        });
      }
      // 走位是**非阻塞**的：几个人同时动、镜头同时摇，才是一段戏而不是幻灯片。
      // 要等就在后面写一条 wait。
      const tween = {
        ref,
        fromX: ref.x,
        fromY: ref.y,
        toX,
        toY,
        sec: instant ? 0 : step.sec,
        t: 0,
        anim: step.anim,
        facing: step.facing,
      };
      // 同一个人再下一条走位，覆盖上一条
      for (let i = cs.tweens.length - 1; i >= 0; i--) {
        if (cs.tweens[i].ref === ref) cs.tweens.splice(i, 1);
      }
      cs.tweens.push(tween);
      if (step.facing) ref.facing = step.facing;
      if (step.anim) SetAnim(ref, step.anim, 0.6, 0);
      if (tween.sec <= 0) ApplyActorTween(tween, 1);
      return 0;
    }
    case "panel": {
      if (step.id) {
        cs.panelId = step.id;
        if (!instant) {
          QueuePanel(state, step.id);
          cs.panelHold = PanelDuration(step.id) + CUT_PANEL_AUTO_PAD;
        }
      }
      // 跳过时不再往队列里塞台词——玩家已经说了不想看
      return instant || !step.id ? 0 : -1;
    }
    case "wait":
      return instant ? 0 : step.sec;
    case "sfx": {
      if (step.id) Sfx(state, step.id, state.camera.x, state.camera.y);
      return 0;
    }
    case "bell": {
      RingBellFromCutscene(state, step.rings);
      return instant ? 0 : step.sec;
    }
    case "spawn": {
      for (const id of step.ids) WakeEnemy(state, id);
      return 0;
    }
    case "reveal": {
      for (const id of step.ids) RevealById(state, id);
      return 0;
    }
    case "fade": {
      cs.fadeFrom = state.fade;
      cs.fadeTo = step.fadeTo;
      cs.fadeSec = instant ? 0 : step.sec;
      cs.fadeT = 0;
      if (cs.fadeSec <= 0) {
        state.fade = cs.fadeTo;
        cs.fade = state.fade;
        return 0;
      }
      return step.sec;
    }
    default:
      return 0;
  }
}

function Ease(t, kind) {
  const x = Clamp(t, 0, 1);
  if (kind === "linear") return x;
  return x < 0.5 ? 2 * x * x : 1 - 2 * (1 - x) * (1 - x); // inOut quad
}

function ApplyCutsceneCamera(state, k) {
  const cs = state.cutscene;
  const cam = cs.cam;
  if (!cam) return;
  const e = Ease(k, cam.ease);
  const c = state.camera;
  c.x = Lerp(cam.fromX, cam.toX, e);
  c.y = Lerp(cam.fromY, cam.toY, e);
  c.viewHeight = Lerp(cam.fromVH, cam.toVH, e);
  ClampCamera(state);
}

function ApplyActorTween(tw, k) {
  const e = Ease(k, "inOut");
  tw.ref.x = Lerp(tw.fromX, tw.toX, e);
  tw.ref.y = Lerp(tw.fromY, tw.toY, e);
  if (!tw.facing && Math.abs(tw.toX - tw.fromX) > 0.01) {
    tw.ref.facing = tw.toX > tw.fromX ? 1 : -1;
  }
}

/** 把所有还在跑的补间一次性走到底（跳过 / 收场时用）。 */
function SettleCutsceneTweens(state) {
  const cs = state.cutscene;
  if (!cs) return;
  for (const tw of cs.tweens) ApplyActorTween(tw, 1);
  cs.tweens.length = 0;
  if (cs.cam) {
    ApplyCutsceneCamera(state, 1);
    cs.cam.t = cs.cam.sec;
  }
  if (cs.fadeSec > 0) {
    state.fade = cs.fadeTo;
    cs.fade = state.fade;
    cs.fadeSec = 0;
  }
}

function UpdateCutscene(state, dt) {
  const cs = state.cutscene;
  if (!cs) return;
  cs.t += dt;

  // 淡入淡出
  if (cs.fadeSec > 0) {
    cs.fadeT += dt;
    const k = Clamp(cs.fadeT / cs.fadeSec, 0, 1);
    state.fade = Lerp(cs.fadeFrom, cs.fadeTo, k);
    if (k >= 1) cs.fadeSec = 0;
  }
  cs.fade = state.fade;

  // 角色走位
  for (let i = cs.tweens.length - 1; i >= 0; i--) {
    const tw = cs.tweens[i];
    tw.t += dt;
    const k = tw.sec <= 0 ? 1 : Clamp(tw.t / tw.sec, 0, 1);
    ApplyActorTween(tw, k);
    if (tw.anim) SetAnim(tw.ref, k >= 1 ? "idle" : tw.anim, k >= 1 ? 0 : 0.6, dt);
    if (k >= 1) cs.tweens.splice(i, 1);
  }

  // 镜头
  if (cs.cam) {
    cs.cam.t += dt;
    const k = cs.cam.sec <= 0 ? 1 : Clamp(cs.cam.t / cs.cam.sec, 0, 1);
    ApplyCutsceneCamera(state, k);
  }

  // 步骤推进
  if (cs.stepSec < 0) {
    // 等翻页：UI 不调 AdvanceCutscene 也不许把玩家永远关在这
    cs.panelHold -= dt;
    if (cs.panelHold <= 0) AdvanceCutscene(state);
    return;
  }
  if (cs.t >= cs.stepSec) EnterNextStep(state, false);
}

function EndCutscene(state) {
  const cs = state.cutscene;
  if (!cs) return;
  SettleCutsceneTweens(state);

  for (const ref of cs.scripted) ref.cutsceneActive = false;

  // 还没登场的演员回岗位：他在戏里走到哪儿是演出，不是关卡状态。
  // 不还原的话，被过场挪到村口的追兵会在真正 spawn 时出现在错误的地方，
  // 而且"跳过 vs 放完"的位置也对不上。
  for (const r of cs.restore) {
    if (r.dormant !== true) continue; // 已经登场的人保留演出留下的站位
    if (r.ref.defeated) continue;
    r.ref.x = r.x;
    r.ref.y = r.y;
    r.ref.facing = r.facing;
    SetAnim(r.ref, "idle", 0, 0);
  }

  // 交还给 AI，但不许"结束瞬间突然发现玩家"：
  // 警觉一律归零，玩家重新拿到完整的 alertRiseSec 反应窗口。
  for (const e of state.enemies) {
    e.alertness = 0;
    e.hasLead = false;
    e.seesPlayer = false;
    e.hearsPlayer = false;
    e.alertStage = "calm";
    e.huntTimer = 0;
    e.suspectTimer = 0;
    e.linger = 0;
    e.state = e.probeAt ? "probe" : e.patrol ? "patrol" : "idle";
  }

  // 跟随者重新贴回队形（过场里玩家可能被脚本挪过位置）
  const p = state.player;
  SeedTrailBehind(state, p.x, p.y, -(p.facing >= 0 ? 1 : -1));
  const headD = TrailHeadD(state);
  let order = 0;
  for (const n of state.npcs) {
    if (n.rescued || !n.follow) continue;
    order++;
    n.trailD = Math.max(state.trail[0].d, headD - QueueSpacing(state, state.npcs.length) * order);
    const at = TrailPointAtD(state, n.trailD);
    n.x = at.x;
    n.y = at.y;
  }

  // 一段戏放完 = 一个节拍完成，就地记检查点。
  // 顺带解决一件要命的事：过场可能把玩家挪了位置，不落检查点的话
  // 演完立刻死会被扔回演出之前的地方，而那时世界已经被过场改过了。
  SetCheckpointNear(state, p.x, p.y, "cut_" + cs.id);

  state.cutscene = null;
  state.phase = "play";
  // 镜头不许瞬移回玩家头上：留一段缓冲，让跟随从当前机位缓出去
  state.camHandback = CUT_HANDBACK_SEC;
  state.timeScale = 1;
  state.timeScaleTimer = 0;
  Emit(state, { kind: "cutsceneEnd", id: cs.id });

  // 触发器：和上面的检查点是同一个坑，必须在同一个地方收口。
  //
  // 过场可能把玩家放在某个触发框里。放完那条路径在这一子步就 return 了，
  // 永远不会评估触发器；跳过那条路径紧接着的一次 StepPlay 会评估并武装它。
  // 于是"跳过 vs 放完"的世界指纹分叉——而且分叉点取决于玩家最终站在哪，
  // 关卡只能靠把触发框挪开来绕。
  //
  // 在这里跑一次触发器评估，两条路径就都在**同一时刻、同一位置**结算一次：
  // 该触发的触发，triggersInside 同时置位，紧接着的 StepPlay 不会再触发第二遍。
  // 语义上也对：过场把人送进了触发区，等同于他自己走进去。
  UpdateTriggers(state);
}

/** 敲钟（过场版）。副作用必须和玩家亲手敲一模一样，否则跳过就卡关。 */
function RingBellFromCutscene(state, rings) {
  let bellProp = null;
  for (const prop of state.level.props) {
    if (prop.interact === "bell") {
      bellProp = prop;
      break;
    }
  }
  const bx = bellProp ? PropX(state, bellProp) : state.player.x;
  const by = bellProp ? bellProp.y : state.player.y;
  state.world.bellRung = true;
  if (bellProp) state.world.used[bellProp.id] = true;
  const count = bellProp ? Num(bellProp.data && bellProp.data.rings, rings) : rings;
  for (let i = 0; i < count; i++) Sfx(state, "bell_ring", bx, by);
  Shake(state, 0.4);
  if (bellProp && bellProp.data) {
    for (const id of Arr(bellProp.data.spawn)) WakeEnemy(state, id);
    if (typeof bellProp.data.objective === "string") {
      state.story.objectiveText = bellProp.data.objective;
      Emit(state, { kind: "objective", text: bellProp.data.objective });
    }
  }
  for (const e of state.enemies) {
    if (e.dormant) continue;
    if (Math.abs(e.x - bx) > 55) continue;
    e.alertness = Math.max(e.alertness, 0.7);
    e.lastSeenX = bx;
    e.lastSeenY = by;
    e.hasLead = true;
    e.state = "search";
    e.facing = bx >= e.x ? 1 : -1;
  }
}

function WakeEnemy(state, id) {
  for (const e of state.enemies) {
    // 已经被反击掀掉的人不会再爬起来——否则"打赢了"这件事没有任何重量
    if (e.id === id && e.dormant && !e.defeated) {
      e.dormant = false;
      Sfx(state, "boot", e.x, e.y);
    }
  }
}

/**
 * 把符合条件的敌人移出战场。
 * 这是全作唯一"敌人被打掉"的入口，而且**只能由反击三件套调用**——
 * 玩家永远没有攻击键，扣扳机的是全村（AGENTS.md 0.1）。
 */
function DefeatEnemies(state, predicate, cause) {
  let hit = 0;
  for (const e of state.enemies) {
    if (e.dormant || e.defeated) continue;
    if (!predicate(e)) continue;
    e.defeated = true;
    e.dormant = true;
    e.alertness = 0;
    e.hasLead = false;
    e.seesPlayer = false;
    e.hearsPlayer = false;
    e.alertStage = "calm";
    e.huntTimer = 0;
    e.suspectTimer = 0;
    e.linger = 0;
    e.state = "idle";
    SetAnim(e, "dead", 0, 0);
    Emit(state, { kind: "defeat", enemyId: e.id, cause, x: e.x, y: e.y });
    hit++;
  }
  return hit;
}

/** 消费掉队首的气泡（Main 的 UI 播完一条就调一次）。队列空了自动回到 play。 */
export function DismissPanel(state) {
  const popped = state.story.queue.length > 0 ? state.story.queue.shift() : null;
  if (state.phase === "panel" && state.story.queue.length === 0) state.phase = "play";
  return popped;
}

/** 当前该显示的气泡 id（Main 可选用）。 */
export function CurrentPanel(state) {
  return state.story.queue.length > 0 ? state.story.queue[0] : null;
}

function DismissPanelById(state, id) {
  const q = state.story.queue;
  const i = q.indexOf(id);
  if (i >= 0) q.splice(i, 1);
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
  // 背着一筐土走不快。倒土这一趟本来就该是有分量的
  if (p.spoil > 0) speed *= 1 - 0.06 * Math.min(p.spoil, SPOIL_CARRY_MAX);
  return speed;
}

function UpdatePlayer(state, dt) {
  const p = state.player;
  const input = state.input;

  p.sneak = !!input.sneak;
  UpdateLayer(p);

  // 噪音尖峰衰减
  p.noiseSpike = Math.max(0, p.noiseSpike - dt * 0.85);
  p.lureCooldown = Math.max(0, p.lureCooldown - dt);
  // 引的"热度"自己会退。停手一会儿，他们就又肯上当了。
  state.world.lureHeat = Math.max(0, state.world.lureHeat - LURE_HEAT_FADE * dt);

  // 呼应
  if (input.callPressed && !p.action && !p.hidden) {
    DoCall(state);
  }

  // Q：手上这一下。「引」必须随时可用——它要是也得先满足条件，就又变回只能躲了。
  //   蹲着不动 + 手里有东西 → 把它放在地上（第三幕灭灯摸黑那段的动作就是这个）；
  //   其余情况 → 弯腰摸一块土坷垃扔出去；
  //   实在扔不动（冷却中／前面就是墙）而手里有东西 → 退回"放下"。
  if (input.itemPressed && !p.action && !p.hidden) {
    if (p.carrying && p.crouch && Math.abs(p.vx) < 0.3) DropCarried(state);
    else if (!BeginThrow(state) && p.carrying) DropCarried(state);
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

  // 交互。"用"键身兼二职：够得着道具就用道具，站位成立就从背后制服。
  // 优先级跟 CurrentPrompt 保持一致，否则提示写着一件事、按下去做另一件。
  if (input.interactPressed) {
    const target = FindTarget(state);
    const ko = KnockoutTarget(state);
    if (ko && (!target || target.interact === "hide")) {
      input.interactPressed = false;
      BeginKnockout(state, ko);
      FinishPlayerFrame(state, dt);
      return;
    }
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

  // 踉跄期间仍然认输入，只是使不上劲。完全清零 moveX 会被读成"手柄掉线"，
  // 而这游戏没有攻防博弈可以填补那半秒空白。
  const moveX = Clamp(Num(input.moveX, 0), -1, 1);
  const maxSpeed = MoveSpeedFor(p, input) * (stunned ? STAGGER_CONTROL : 1);
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
    if (CanWalkTo(state, nextX, p.y, p.posture)) {
      p.x = nextX;
    } else {
      // 细分一次，尽量贴到墙上
      const midX = p.x + p.vx * dt * 0.35;
      if (CanWalkTo(state, midX, p.y, p.posture)) p.x = midX;
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
    // 摔倒硬直，但不死（这不是马里奥，也不是魂）。
    // 时长随冲击插值：刚过线的那一下只顿一下，真从高处摔下来才是完整的踉跄。
    const over = Clamp(
      (impact - PLAYER.safeFallSpeed) / Math.max(0.001, PLAYER.maxFallSpeed - PLAYER.safeFallSpeed),
      0,
      1,
    );
    p.stagger = Lerp(LAND_STUN_MIN_SEC, LAND_STUN_MAX_SEC, over);
    Shake(state, 0.28 + 0.22 * over);
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
    return;
  }

  // 搜村的兵会挨个挑柴垛。掩体挡得住"路过的一眼"，挡不住"专门来翻的人"。
  //
  // 分两种情形，因为"藏"在前半段是教给玩家的核心动词，不能一上来就废掉：
  //   · 警报没拉响时，只有已经在搜索/发现状态的敌人会翻掩体——玩家藏得住，
  //     藏是过巡逻线的正解。
  //   · 钟一响全村被翻个底朝天，任何醒着的兵走到跟前都会把人揪出来。否则
  //     钻进柴垛屏住呼吸就能把第一幕无限拖住，那个结局永远不来。
  const villageBeingSwept = !!state.world.bellRung;
  for (const enemy of state.enemies) {
    if (enemy.dormant || enemy.kind === "dog") continue;
    const hunting = enemy.state === "search" || enemy.state === "spotted";
    if (!hunting && !villageBeingSwept) continue;
    if (Math.abs(enemy.y - p.y) > 2.2) continue;
    if (Math.abs(enemy.x - p.x) > FLUSH_OUT_REACH) continue;
    p.hidden = false;
    p.hidePropId = null;
    p.noiseSpike = Math.max(p.noiseSpike, NOISE.crouch);
    Sfx(state, "cloth", p.x, p.y);
    Sfx(state, "shout", enemy.x, enemy.y);
    enemy.alertness = Math.max(enemy.alertness, 0.92);
    break;
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
    if (state.input.sneak && p.posture !== "stand") base *= 0.5; // 猫腰再放轻脚步
  }
  if (p.carrying === "lantern" && !p.hidden) {
    base = Math.max(base, NOISE.crouch); // 提着灯就别想彻底无声了
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

  if (p.dead) name = p.deathReason === "spotted" || p.deathReason === "captured" ? "caught" : "dead";
  else if (p.hidden) name = "hide";
  else if (p.action === "hatch" || p.action === "dig") name = "dig";
  else if (p.action === "bell") name = "ring";
  else if (p.action === "push") name = "push";
  else if (p.action === "block") name = "push"; // 放倒院墙 = 推
  // 敲晕先用现成的动画名（契约 5.2 那张表），等动画 Agent 补一个再换
  else if (p.action === "knockout") name = "use";
  else if (p.action === "lure") name = "use";
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
  if (p.deathTimer > 0) return;
  if (state.capturedEnding) {
    // 停一拍再收尾，别一帧切走
    state.capturedEnding = false;
    WinLevel(state);
    return;
  }
  RespawnAtCheckpoint(state);
}

// ───────────────────────────── 引（扔 / 敲）─────────────────────────────

/**
 * 石头往面朝方向飞多远才落地。撞上过不去的东西就落在那儿——
 * 所以隔着一堵实墙引不到对面，但矮墙、院门这种是飞得过去的。
 */
function LureLandingX(state, dirOverride) {
  const p = state.player;
  const dir = dirOverride ? (dirOverride >= 0 ? 1 : -1) : p.facing >= 0 ? 1 : -1;
  const level = state.level;
  let x = p.x;
  for (let d = 0.5; d <= LURE_THROW_DIST + 0.001; d += 0.5) {
    const nx = p.x + dir * d;
    if (nx <= level.bounds.x0 + 0.4 || nx >= level.bounds.x1 - 0.4) break;
    // 用"爬"的净空判定：石头钻得过任何人钻得过的口子
    if (!CanWalkTo(state, nx, p.y, "crawl")) break;
    x = nx;
  }
  return x;
}

function LureLandingY(state, x) {
  const floor = FloorUnder(state.level, x, state.player.y + 1.2, 2.6);
  return floor ? floor.y : state.player.y;
}

/** 现在能不能扔。返回 { ok, x, y, reason }。同一子步只算一遍（落点要走一遍地形）。 */
function LureAim(state) {
  if (state.aimCacheT === state.time) return state.aimCache;
  const result = LureAimRaw(state);
  state.aimCacheT = state.time;
  state.aimCache = result;
  return result;
}

function LureAimRaw(state) {
  const p = state.player;
  const x = LureLandingX(state);
  const y = LureLandingY(state, x);
  const far = Math.abs(x - p.x);
  let reason = null;
  if (p.dead || p.hidden || p.action || p.onShaft) reason = "busy";
  else if (state.phase !== "play") reason = "busy";
  else if (p.lureCooldown > 0) reason = "cooldown";
  else if (far < LURE_MIN_DIST) reason = "tooClose"; // 前面就是墙，扔了等于在自己脚边响
  return { ok: !reason, x, y, reason };
}

/**
 * 把"这里响了一下"广播出去。lureX/lureY 是**响的地方**，不是玩家的位置——
 * 这是整个动词成立的关键：敌人得到的线索指向别处。
 */
function RaiseLure(state, x, y, radiusM, holdSec) {
  const p = state.player;
  const heat = state.world.lureHeat;
  // 热度过线：他们不再上当。石头照样响，但他们开始朝**声音的来处**搜，
  // 也就是朝玩家这边。这是"引"的代价，也是它不能无脑连按的原因。
  const wised = heat >= LURE_HEAT_WISE;
  let pulled = 0;

  for (const e of state.enemies) {
    if (e.dormant || e.defeated) continue;
    // 半径是米；耳朵好的（狗）听得更远
    const radius =
      radiusM * Clamp((e.hearing || 6) / 6, LURE_EAR_MIN, LURE_EAR_MAX) * SENSE.hearingScale;
    const dx = x - e.x;
    const dy = (y - e.y) * (Math.abs(y - e.y) > 1.5 ? CROSSLAYER_MUFFLE : 1);
    if (dx * dx + dy * dy > radius * radius) continue;

    // 已经咬住我的人不吃这一套：扔石头不是脱身卡。
    if (e.alertness >= SENSE.searchAt && e.hasLead) continue;

    if (wised) {
      // 上过当了：这回他们冲着我来
      e.alertness = Math.max(e.alertness, SENSE.suspiciousAt + 0.06);
      e.lastSeenX = p.x;
      e.lastSeenY = p.y;
      e.hasLead = true;
      e.facing = p.x >= e.x ? 1 : -1;
      e.lured = false;
      e.lureTimer = 0;
      continue;
    }

    const travel = Math.abs(x - e.x) / Math.max(0.6, (e.patrol ? e.patrol.speed : 1.4) * SENSE.searchSpeedScale);
    e.lured = true;
    e.lureX = x;
    e.lureY = y;
    e.lureAt = false;
    // 热度越高，肯为一块石头花的时间越短——第三次就只是抬头看一眼
    e.lureHold = Math.max(1.2, holdSec * (1 - heat / LURE_HEAT_WISE * 0.55));
    e.lureTimer = Math.min(LURE_TRAVEL_MAX, travel + 0.6) + e.lureHold;
    e.hasLead = false; // 他手上的线索是那块石头，不是我
    e.lastSeenX = x;
    e.lastSeenY = y;
    e.facing = x >= e.x ? 1 : -1;
    pulled++;
  }

  state.world.lureHeat += 1;
  state.world.lureCount++;
  Emit(state, { kind: "lure", x, y, radius: radiusM, pulled, wised, heat: state.world.lureHeat });
  Sfx(state, "pebble", x, y);
  return pulled;
}

/** 起手：弯腰摸一块土坷垃。0.5 秒站着不能动，这是它的第一重代价。 */
function BeginThrow(state) {
  const p = state.player;
  const aim = LureAim(state);
  if (!aim.ok) {
    if (aim.reason === "tooClose" || aim.reason === "cooldown") Sfx(state, "cloth", p.x, p.y);
    return false;
  }
  p.action = "lure";
  p.actionTimer = LURE_WIND_SEC;
  p.actionTotal = LURE_WIND_SEC;
  p.actionPropId = null;
  p.lureAimX = aim.x;
  p.lureAimY = aim.y;
  p.vx = 0;
  // 摸石头、起身、抡胳膊：贴着人扔照样露馅
  p.noiseSpike = Math.max(p.noiseSpike, LURE_SELF_NOISE);
  Sfx(state, "cloth", p.x, p.y);
  return true;
}

function FinishThrow(state) {
  const p = state.player;
  p.lureCooldown = LURE_COOL_SEC;
  // 落点要按**当下**的地形重算一次：起手那 0.5 秒里玩家没动，但敌人动了
  RaiseLure(state, p.lureAimX, p.lureAimY, LURE_RADIUS, LURE_HOLD_SEC);
}

/** 附近有没有能招呼上的乡亲（F 是本作唯一的"带上人"手段，得让人看得见）。 */
function NearestCallable(state) {
  const p = state.player;
  let best = null;
  let bestD = Infinity;
  for (const n of state.npcs) {
    if (n.rescued || n.follow) continue;
    const dx = Math.abs(n.x - p.x);
    if (dx > CALL_RECRUIT_RANGE_X || Math.abs(n.y - p.y) > CALL_RECRUIT_RANGE_Y) continue;
    if (dx < bestD) {
      bestD = dx;
      best = n;
    }
  }
  return best;
}

/** 有跟随者掉出队形了吗——决定 F 现在是"喊人"还是"归队"。 */
function HasStraggler(state) {
  let slot = 0;
  for (const n of state.npcs) {
    if (n.rescued || !n.follow) continue;
    slot++;
    if (n.slotError > FOLLOW.spacing + FOLLOW_SLOT_SLACK) return true;
  }
  return false;
}

/**
 * F 的提示。关卡里没有一个 talk 道具——第二三幕全靠"呼应"把六个人带走，
 * 这个键要是不出现在 HUD 上，玩家根本不知道自己漏了什么。
 */
function CallHint(state) {
  const p = state.player;
  if (p.dead || p.hidden || p.action) return null;
  if (state.phase !== "play") return null;
  const npc = NearestCallable(state);
  if (npc) return { key: "F", label: "招呼" + (npc.name || "乡亲"), id: npc.id, kind: "call" };
  if (HasStraggler(state)) return { key: "F", label: "催一催", id: null, kind: "rally" };
  return null;
}

function DoCall(state) {
  const player = state.player;
  player.action = "call";
  player.actionTimer = 0.55;
  player.actionTotal = 0.55;
  player.actionPropId = null;
  player.noiseSpike = NOISE.call;
  Sfx(state, "shout", player.x, player.y);
  // 招呼附近的乡亲
  let recruited = 0;
  for (const n of state.npcs) {
    if (n.rescued || n.follow) continue;
    if (Math.abs(n.x - player.x) > CALL_RECRUIT_RANGE_X) continue;
    if (Math.abs(n.y - player.y) > CALL_RECRUIT_RANGE_Y) continue;
    StartFollow(state, n);
    recruited++;
  }
  // 已经在跟的人：喊一嗓子 = 催归队。
  // 不给这个收益的话，F 在带满六个人之后就是个纯粹会招来敌人的空键。
  let rallied = 0;
  for (const n of state.npcs) {
    if (n.rescued || !n.follow) continue;
    n.rally = CALL_RALLY_SEC;
    if (n.slotError > FOLLOW_SNAP) rallied++;
  }
  Emit(state, { kind: "call", x: player.x, y: player.y, recruited, rallied });
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
    // —— 主动动词：引 / 封（AGENTS.md 0.0）——
    case "lure":
      // 关卡布置的引点是**一次性**的：敲翻的瓦罐不会自己站回去。
      // 想反复引，用手上的土坷垃（Q），那个才是随身的。
      return !state.world.used[prop.id];
    case "block":
      return !state.world.blocked[prop.data.channel];
    // —— 挖 / 倒土 ——
    case "dig": {
      const spot = DigSpotById(state, prop.data.digSpotId);
      if (!spot) return false;
      return !state.world.dug[spot.id]; // soft:false 也照样提示，只是按不动（"此路不通"要看得见）
    }
    case "dumpSpoil": {
      const sink = SpoilSinkById(state, prop.data.sinkId);
      if (!sink) return false;
      const rec = state.world.sinks[sink.id];
      return !!rec && rec.filled < rec.capacity;
    }
    case "spoil":
      return true; // 地上的土堆：背起来
    // —— 反击三件套 ——
    // 提示照常出现（否则玩家不知道这儿有个枪眼），但条件不满足时 blocked=true，
    // 按下去只会得到一句"等他们就位"。跑腿本身就是玩法。
    case "signal":
      return SquadState(state, prop.data.squadId) === "idle";
    case "mine":
      return !state.world.mines[prop.data.channel];
    case "loophole":
      // 没子弹了就不再提示"打开枪眼"——那只会让玩家以为自己按错了
      if (state.world.ammo <= 0) return false;
      return SquadState(state, prop.data.squadId) !== "fired";
    default:
      return false;
  }
}

function SquadState(state, squadId) {
  if (typeof squadId !== "string" || !squadId) return "idle";
  return state.world.squads[squadId] || "idle";
}

/** 这一步的前提够不够（传令到位没有）。 */
function CounterReady(state, prop) {
  if (prop.interact === "mine") {
    const need = prop.data && prop.data.needSquad;
    return !need || SquadState(state, need) === "ready" || SquadState(state, need) === "fired";
  }
  if (prop.interact === "loophole") return SquadState(state, prop.data.squadId) === "ready";
  return true;
}

/** 这个道具现在按下去会不会"按了个寂寞"（条件不满足）。 */
function PropBlocked(state, prop) {
  if (prop.interact === "dig") {
    const spot = DigSpotById(state, prop.data.digSpotId);
    return !spot || !spot.soft; // 石头/夯土挖不动：这是给玩家看的"此路不通"
  }
  if (prop.interact === "dumpSpoil") return state.player.spoil <= 0;
  if (prop.interact === "spoil") return state.player.spoil >= SPOIL_CARRY_MAX;
  if (prop.interact !== "lever") return false;
  const need = prop.data && prop.data.needItem ? prop.data.needItem : null;
  return !!need && state.player.carrying !== need;
}

// 面朝方向的等效"距离折扣"（米）。挑得比常见的道具间距（1–2.5 米）小一半，
// 保证它只在两个东西**差不多近**的时候起作用，不会让人隔着一个近的去够远的。
const FACING_BONUS = 0.75;
// 条件没满足的提示要给条件满足的让路。典型现场：木塞掉在闸门脚下，
// 结果提示一直写着"需要木塞"，玩家踩在木塞上把自己锁死了。
const BLOCKED_PENALTY = 1.4;
// 「敲通气孔」这类引点常常就布在柴垛、水缸边上（关卡本来也该这么布：把人引开才好躲）。
// 但**手上随时有土坷垃可以扔**，柴垛却只有眼前这一个——所以引点永远给藏身点让路。
// 不加这一条，被追着跑的时候按下去的会是"弄出点动静"，那是致命的误触。
const LURE_PROP_PENALTY = 1.6;
// 刨不动的硬面（soft:false）按下去只有一句"刨不动"。它是给玩家看的"此路不通"，
// 不是一个动作——所以它必须给翻口、藏身洞、传令点让路。支道尽头只有 0.8–1.5 米，
// 硬面跟这些东西必然挤在同一个互动半径里，这一档惩罚就是那道保险。
const HARD_FACE_PENALTY = 2.6;

function FindTarget(state) {
  const p = state.player;
  let best = null;
  let bestD = Infinity;
  const reach = INTERACT.reach + PLAYER.width * 0.5;
  for (const prop of state.level.props) {
    if (!InteractAvailable(state, prop)) continue;
    const px = PropX(state, prop);
    const dx = Math.abs(px - p.x);
    if (dx > reach) continue;
    const dy = Math.abs(prop.y - p.y);
    if (dy > INTERACT.reachY) continue;
    // 打分而不是纯比距离：先看条件满不满足，再看在不在面朝方向，最后才是远近。
    // 站在两个道具正中间时，玩家心里想的永远是自己正对着的那个。
    let d = dx + dy * 0.4;
    const ahead = (px - p.x) * p.facing;
    if (ahead > 0.02) d -= FACING_BONUS;
    else if (ahead < -0.02) d += FACING_BONUS * 0.5;
    if (PropBlocked(state, prop)) d += BLOCKED_PENALTY;
    if (prop.interact === "lure") d += LURE_PROP_PENALTY;
    if (prop.interact === "dig") {
      const spot = DigSpotById(state, prop.data.digSpotId);
      if (spot && !spot.soft) d += HARD_FACE_PENALTY;
    }
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
    case "lure":
      return { key: "E", label: prop.label ? "敲响" + prop.label : "弄出点动静", id: prop.id, kind: "lure" };
    case "block":
      return { key: "E", label: prop.label ? "放倒" + prop.label : "堵上这条路", id: prop.id, kind: "block" };
    case "dig": {
      const spot = DigSpotById(state, prop.data.digSpotId);
      if (!spot) return null;
      if (!spot.soft) return { key: "E", label: "挖不动 —— 是夯土", id: prop.id, kind: "dig", blocked: true };
      const done = state.world.digProgress[spot.id] || 0;
      const bare = p.carrying !== "shovel";
      const label = done > 0.05 ? "接着挖" : bare ? "用手刨开" + spot.label : "挖开" + spot.label;
      return { key: "E", label, id: prop.id, kind: "dig", progress: done / DigSeconds(state, spot) };
    }
    case "dumpSpoil": {
      const has = p.spoil > 0;
      return {
        key: "E",
        label: has ? "把土倒进" + (prop.label || "枯井") : "手上没有土",
        id: prop.id,
        kind: "dumpSpoil",
        blocked: !has,
      };
    }
    case "spoil": {
      const full = p.spoil >= SPOIL_CARRY_MAX;
      return {
        key: "E",
        label: full ? "背不动了" : "背起这堆新土",
        id: prop.id,
        kind: "spoil",
        blocked: full,
      };
    }
    case "signal":
      return { key: "E", label: prop.label || "传口令", id: prop.id, kind: "signal" };
    case "mine": {
      const ok = CounterReady(state, prop);
      return {
        key: "E",
        label: ok ? "拉响" + (prop.label || "地雷") : "等他们就位",
        id: prop.id,
        kind: "mine",
        blocked: !ok,
      };
    }
    case "loophole": {
      const ok = CounterReady(state, prop);
      const dry = state.world.ammo <= 0;
      return {
        key: "E",
        label: dry ? "没子弹了" : ok ? "打开" + (prop.label || "枪眼") : "还没传到口令",
        id: prop.id,
        kind: "loophole",
        blocked: !ok || dry,
      };
    }
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
  // 敲晕只在站位成立的那几秒里存在，柴垛却遍地都是——所以它压过"躲进去"，
  // 但不许压过敲钟/开地道口这类目标动作（那些是这一幕真正要做的事）。
  const ko = KnockoutTarget(state);
  if (ko && (!prop || prop.interact === "hide")) {
    return { key: "E", label: "从背后制服", id: ko.id, kind: "knockout" };
  }
  if (prop) {
    const prompt = PromptForProp(state, prop);
    if (prompt) return prompt;
  }
  if (ko) return { key: "E", label: "从背后制服", id: ko.id, kind: "knockout" };

  if (p.onShaft) {
    return { key: "W", label: "攀爬", id: p.shaftId, kind: "shaft" };
  }
  const shaft = ShaftNear(state, p.x, p.y);
  if (shaft && ShaftUsable(state, shaft)) {
    if (p.y > shaft.yBottom + 0.3) return { key: "S", label: "下去", id: shaft.id, kind: "shaft" };
    if (p.y < shaft.yTop - 0.3) return { key: "W", label: "上去", id: shaft.id, kind: "shaft" };
  }
  // 没别的可按时，把"呼应"顶上来。第二三幕没有一个 talk 道具，
  // 六个乡亲全靠 F 才带得走——这个键不出现在提示条上就是隐藏必需品。
  return CallHint(state);
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
  // 前提没满足就是按不动。这是"反击有前提"的落点，不许悄悄放行。
  if ((kind === "mine" || kind === "loophole") && !CounterReady(state, prop)) {
    Sfx(state, "cloth", p.x, p.y);
    return;
  }
  // 子弹打光了就是打光了
  if (kind === "loophole" && state.world.ammo <= 0) {
    Sfx(state, "cloth", p.x, p.y);
    return;
  }
  if (kind === "dig") {
    const spot = DigSpotById(state, prop.data.digSpotId);
    if (!spot || !spot.soft) {
      Sfx(state, "cloth", p.x, p.y); // 夯土，刨两下就知道挖不动
      return;
    }
  }
  if (kind === "dumpSpoil" && p.spoil <= 0) {
    Sfx(state, "cloth", p.x, p.y);
    return;
  }
  if (kind === "spoil" && p.spoil >= SPOIL_CARRY_MAX) {
    Sfx(state, "cloth", p.x, p.y);
    return;
  }

  let duration = 0.35;
  if (kind === "hatch") duration = INTERACT.hatchOpenSec;
  else if (kind === "lure") duration = LURE_WIND_SEC;
  else if (kind === "block") duration = BLOCK_SEC;
  else if (kind === "dig") {
    // 已经挖过一半的接着挖：被发现打断不许让玩家白挖
    const spot = DigSpotById(state, prop.data.digSpotId);
    const total = DigSeconds(state, spot);
    duration = Math.max(0.2, total - (state.world.digProgress[spot.id] || 0));
  } else if (kind === "dumpSpoil") duration = 0.8;
  else if (kind === "spoil") duration = 0.6;
  else if (kind === "signal") duration = SIGNAL_SEC;
  else if (kind === "mine") duration = MINE_SEC;
  else if (kind === "loophole") duration = LOOPHOLE_SEC;
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
  } else if (kind === "dig") {
    Sfx(state, "dig", p.x, p.y);
    const bare = p.carrying !== "shovel";
    p.noiseSpike = Math.max(p.noiseSpike, Math.min(1, NOISE.dig * (bare ? DIG_BARE_NOISE : 1)));
  } else if (kind === "push") {
    Sfx(state, "push", p.x, p.y);
    p.noiseSpike = Math.max(p.noiseSpike, NOISE.push);
  } else if (kind === "lever") {
    p.noiseSpike = Math.max(p.noiseSpike, NOISE.lever);
  } else if (kind === "block") {
    // 放倒一堵墙是响的：当着人的面封路等于送死
    Sfx(state, "push", p.x, p.y);
    p.noiseSpike = Math.max(p.noiseSpike, BLOCK_NOISE);
  } else if (kind === "signal") {
    // 敲钢轨传令是**响的**。跑腿的风险就在这一下上，不许做成静音按钮。
    Sfx(state, "signal", p.x, p.y);
    p.noiseSpike = Math.max(p.noiseSpike, SIGNAL_NOISE);
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

  // 挖：一路上都在响，而且进度实时记账——半路被打断，已经挖掉的那部分留着
  if (p.action === "dig" && prop) {
    const spot = DigSpotById(state, prop.data.digSpotId);
    if (spot) {
      const bare = p.carrying !== "shovel";
      p.noiseSpike = Math.max(p.noiseSpike, Math.min(1, NOISE.dig * (bare ? DIG_BARE_NOISE : 1)));
      state.world.digProgress[spot.id] = (state.world.digProgress[spot.id] || 0) + dt;
      p.stepTimer -= dt;
      if (p.stepTimer <= 0) {
        p.stepTimer = 0.55;
        Sfx(state, "dig", p.x, p.y);
        Dust(state, spot.x, spot.y + 0.4, 0.35);
      }
    }
  }

  p.actionTimer -= dt;
  if (p.actionTimer > 0) return;

  const finished = p.action;
  const finishedProp = p.actionPropId;
  p.action = null;
  p.actionTimer = 0;
  p.actionPropId = null;
  // 徒手扔：不挂在任何道具上（这是它的重点——关卡没布置也能用）
  if (finished === "lure" && !finishedProp) {
    FinishThrow(state);
    return;
  }
  if (finished === "knockout") {
    FinishKnockout(state);
    return;
  }
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
      state.world.bellRung = true;
      const rings = Num(prop.data.rings, 3);
      for (let i = 0; i < rings; i++) Sfx(state, "bell_ring", PropX(state, prop), prop.y);
      Shake(state, 0.4);
      p.noiseSpike = NOISE.bell;

      // 钟声是因，追兵是果。关卡把要触发的东西写在 data 里。
      for (const id of Arr(prop.data.panels)) QueuePanel(state, id);
      for (const id of Arr(prop.data.spawn)) WakeEnemy(state, id);
      // 钟这一下值得停半拍：这是全幕的支点，也是玩家此刻唯一不需要操作的时刻
      SlowTime(state, TIME_SLOW.bell, TIME_SLOW.bellSec);
      if (typeof prop.data.objective === "string") {
        state.story.objectiveText = prop.data.objective;
        Emit(state, { kind: "objective", text: prop.data.objective });
      }
      // 全村都听见了：附近的敌人一律往钟这边扑
      const bx = PropX(state, prop);
      for (const e of state.enemies) {
        if (e.dormant) continue;
        if (Math.abs(e.x - bx) > 55) continue;
        e.alertness = Math.max(e.alertness, 0.7);
        e.lastSeenX = bx;
        e.lastSeenY = prop.y;
        e.hasLead = true;
        e.state = "search";
        e.facing = bx >= e.x ? 1 : -1;
      }
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
    // —— 挖 / 倒土 ——
    case "dig": {
      const spot = DigSpotById(state, prop.data.digSpotId);
      if (spot && !state.world.dug[spot.id]) {
        CarveDig(state, spot);
        // 挖出来的土就堆在洞口。不处理它，等于给搜村的人留一块路标。
        DropSpoilPile(state, spot.x, spot.y, spot.spoil);
        Sfx(state, "hatch_open", spot.x, spot.y);
        Dust(state, spot.x, spot.y + 0.5, 0.8);
        Shake(state, 0.2);
        for (const id of Arr(prop.data.panels)) QueuePanel(state, id);
        state.world.used[prop.id] = true;
        // 挖完这个口就不再是互动点了，别让它一直挡着提示
        const idx = state.level.props.indexOf(prop);
        if (idx >= 0) state.level.props.splice(idx, 1);
      }
      break;
    }
    case "spoil": {
      const pile = SpoilPileById(state, prop.data.pileId);
      if (pile) {
        // 背土占手：手里有马灯就得先撂下。摸黑走这一趟正是设计要的
        if (p.carrying && p.carrying !== SPOIL_ITEM) DropCarried(state);
        const take = Math.min(pile.amount, SPOIL_CARRY_MAX - p.spoil);
        p.spoil += take;
        p.carrying = SPOIL_ITEM;
        pile.amount -= take;
        if (pile.amount <= 0) RemoveSpoilPile(state, pile.id);
      }
      Sfx(state, "pickup", p.x, p.y);
      break;
    }
    case "dumpSpoil": {
      const sink = SpoilSinkById(state, prop.data.sinkId);
      const rec = sink ? state.world.sinks[sink.id] : null;
      if (rec) {
        const room = Math.max(0, rec.capacity - rec.filled);
        const put = Math.min(room, p.spoil);
        rec.filled += put;
        p.spoil -= put;
        if (p.spoil <= 0 && p.carrying === SPOIL_ITEM) p.carrying = null;
        Sfx(state, "dig", p.x, p.y);
        Dust(state, PropX(state, prop), prop.y, 0.5);
        Emit(state, { kind: "spoilDumped", sinkId: sink.id, amount: put, left: p.spoil });
        for (const id of Arr(prop.data.panels)) QueuePanel(state, id);
      }
      break;
    }
    // —— 引 / 封 ——
    case "lure": {
      // 关卡布置的引点跟"扔"方向相反：响在**自己脚下**，把人叫过来。
      // 这是布陷阱用的（叫到死胡同、叫到雷上、叫到枪眼底下），不是用来溜过去的。
      const lx = PropX(state, prop);
      // 关卡写的 radius 就是**米**（通气孔那种能把半条街叫过来的，写 11–12）
      const radius = Clamp(Num(prop.data.radius, LURE_RADIUS), 1, 40);
      RaiseLure(state, lx, prop.y, radius, LURE_PROP_HOLD);
      Sfx(state, "lure", lx, prop.y);
      p.noiseSpike = Math.max(p.noiseSpike, LURE_SELF_NOISE);
      for (const id of Arr(prop.data.panels)) QueuePanel(state, id);
      state.world.used[prop.id] = true;
      break;
    }
    case "block": {
      const channel = prop.data.channel;
      const bx = PropX(state, prop);
      if (channel) state.world.blocked[channel] = true;
      // 几何只在这里长出来：敌人跨不过去，玩家的 CanWalkTo 永远不看它。
      state.world.blocks.push({
        channel: channel || prop.id,
        x: bx,
        y: prop.y,
        halfWidth: Num(prop.data.halfWidth, BLOCK_HALF_WIDTH),
      });
      Sfx(state, "collapse", bx, prop.y);
      Dust(state, bx, prop.y + 0.6, 0.9);
      Shake(state, 0.3);
      // 倒下的墙同时挡视线：这才是"封"值得跑一趟的理由
      for (const e of state.enemies) {
        if (e.dormant) continue;
        if (Math.abs(e.y - prop.y) > BLOCK_REACH_Y) continue;
        if (Math.abs(e.x - bx) > 12) continue;
        // 塌下去的动静他们听得见，但看不到是谁弄的
        e.alertness = Math.max(e.alertness, SENSE.suspiciousAt + 0.05);
        e.lastSeenX = bx;
        e.lastSeenY = prop.y;
        e.hasLead = false;
      }
      Emit(state, { kind: "block", channel: channel || prop.id, x: bx, y: prop.y });
      for (const id of Arr(prop.data.panels)) QueuePanel(state, id);
      state.world.used[prop.id] = true;
      break;
    }
    // —— 反击三件套 ——
    case "signal": {
      const squadId = prop.data.squadId;
      if (squadId && SquadState(state, squadId) === "idle") {
        state.world.squads[squadId] = "ready";
        Emit(state, { kind: "squad", id: squadId, status: "ready" });
      }
      for (const id of Arr(prop.data.panels)) QueuePanel(state, id);
      Sfx(state, "signal", p.x, p.y);
      p.noiseSpike = Math.max(p.noiseSpike, SIGNAL_NOISE);
      state.world.used[prop.id] = true;
      break;
    }
    case "mine": {
      const channel = prop.data.channel;
      if (channel) state.world.mines[channel] = true;
      const need = prop.data.needSquad;
      if (need) {
        state.world.squads[need] = "fired";
        Emit(state, { kind: "squad", id: need, status: "fired" });
      }
      const mx = PropX(state, prop);
      Sfx(state, "mine", mx, prop.y);
      Shake(state, 0.75);
      Dust(state, mx, prop.y + 0.5, 1);
      // 掀翻这一段里的敌人。玩家没开枪——他拉的是全村埋好的雷。
      const hit = DefeatEnemies(
        state,
        (e) =>
          Math.abs(e.x - mx) <= MINE_RADIUS_X &&
          e.y >= prop.y - MINE_REACH_DOWN &&
          e.y <= prop.y + MINE_REACH_UP,
        "mine",
      );
      // 地雷比枪还响：合围的那一下，整条街都知道了
      AlarmArea(state, mx, prop.y, BLAST_ALARM_X, GUNSHOT_HUNT_X * 1.5);
      Emit(state, { kind: "counter", verb: "mine", x: mx, y: prop.y, hit, channel: channel || null });
      SlowTime(state, TIME_SLOW.hazard, TIME_SLOW.hazardSec);
      for (const id of Arr(prop.data.panels)) QueuePanel(state, id);
      state.world.used[prop.id] = true;
      break;
    }
    case "loophole": {
      const squadId = prop.data.squadId;
      if (squadId) {
        state.world.squads[squadId] = "fired";
        Emit(state, { kind: "squad", id: squadId, status: "fired" });
      }
      const lx = PropX(state, prop);
      // 有几发打几发。子弹是有数的，这一轮很可能就是这一段的全部火力。
      const shots = Math.max(1, Math.min(RIFLE_SHOTS, state.world.ammo));
      state.world.ammo = Math.max(0, state.world.ammo - shots);
      state.world.shotsFired += shots;
      for (let i = 0; i < shots; i++) Sfx(state, "rifle", lx, prop.y);
      Shake(state, 0.28);
      // 枪眼朝**头顶的街面**打：守在后面的民兵放冷枪，玩家只是把枪眼推开。
      const hit = DefeatEnemies(
        state,
        (e) => Math.abs(e.x - lx) <= LOOPHOLE_RANGE_X && e.y > prop.y + 1.0,
        "rifle",
      );
      // 打草惊蛇：一枪出去，这一片的人全都知道了。枪不是常规解法，代价就在这儿。
      AlarmArea(state, lx, prop.y, GUNSHOT_ALARM_X, GUNSHOT_HUNT_X);
      Emit(state, {
        kind: "counter", verb: "loophole", x: lx, y: prop.y, hit,
        squadId: squadId || null, shots, ammo: state.world.ammo,
      });
      for (const id of Arr(prop.data.panels)) QueuePanel(state, id);
      state.world.used[prop.id] = true;
      break;
    }
    default:
      break;
  }
}

// ───────────────────────────── 挖（AGENTS.md 0.0.2）─────────────────────────────
//
// 这个游戏叫《地道战》，玩家当然得能自己挖。合理化不用编，史实本身就给了机制：
// **挖地道真正的难处不是挖，是土往哪儿倒。** 地面上凭空多出一堆新土，
// 等于告诉搜村的人"这儿底下有洞"（山田那句"这块地的土是新的"就是这么来的）。
//
// 所以代价是三层，缺一层它就是无脑捷径：
//   1. 时间——一段 2.5–6 秒，期间人钉在原地；
//   2. 声音——NOISE.dig 是全表第二响，挖之前得先把这一带的人解决掉（引开/敲晕）；
//   3. 土——每段产出 spoil，堆在原地就是证据，得背到枯井/炕下/粮窖/场院倒掉。
//
// 有铁锨按原速，徒手慢一倍且更响：不给锨就完全挖不动会把关卡卡死，
// 而"慢一倍 + 更响"已经足够让玩家自己想去找那把锨。
const DIG_BARE_SCALE = 2.0; // 徒手挖的时长倍率
const DIG_BARE_NOISE = 1.15; // 徒手挖的音量倍率（刨土比铲土响）
// 一趟背得动多少。**背土占手**（p.carrying = "spoil"）——这是这套机制的第二颗牙：
// 要倒土就得先把马灯放下，摸黑走这一趟。第三幕那个在哨兵视距里的场院倒土点，
// 全靠这一条才有分量；做成纯计数不占手，它就只是绕个路。
const SPOIL_ITEM = "spoil";
const SPOIL_LABEL = "一筐新土";
const SPOIL_CARRY_MAX = 3;
const SPOIL_ALERT = SENSE.searchAt + 0.06; // 敌人走到新土堆跟前：直接进搜索
const SPOIL_NOTICE_X = 2.6; // 走到这么近算看见了
const SPOIL_NOTICE_Y = 1.6;

function DigSpotById(state, id) {
  for (const s of state.level.digSpots) {
    if (s.id === id) return s;
  }
  return null;
}

function SpoilSinkById(state, id) {
  for (const s of state.level.spoilSinks) {
    if (s.id === id) return s;
  }
  return null;
}

function DigSeconds(state, spot) {
  const bare = state.player.carrying !== "shovel";
  return spot.sec * (bare ? DIG_BARE_SCALE : 1);
}

/**
 * 挖通之后**真的变成能走的地形**。这是最容易做半截的地方——
 * 挖完看着通了却走不过去，等于白挖。
 * 引擎限制（实测）：地板取"脚下最高的那块"，所以新地板必须跟起点同高，
 * 不能靠垂直叠层做绕行；要换层就老老实实加一口竖井。
 */
function CarveDig(state, spot) {
  const level = state.level;
  const x0 = Math.min(spot.x, spot.toX);
  const x1 = Math.max(spot.x, spot.toX);
  const vertical = Math.abs(spot.toY - spot.y) >= 0.6;

  if (vertical) {
    const yTop = Math.max(spot.y, spot.toY);
    const yBottom = Math.min(spot.y, spot.toY);
    level.shafts.push({
      id: "dugshaft_" + spot.id,
      x: (spot.x + spot.toX) * 0.5,
      yTop,
      yBottom,
      kind: "dirt",
      requiresHatch: null,
    });
    // 井底得有块地板站，否则爬到底就掉出世界
    if (!FloorUnder(level, spot.toX, yBottom + 0.2, 0.4)) {
      level.floors.push({ id: "dugfloor_" + spot.id, x0: spot.toX - 1.2, x1: spot.toX + 1.2, y: yBottom, kind: "tunnel" });
    }
  } else {
    // floor 和 ceil 必须**成对**补。只补 floor，净空判定会当成敞开的天空；
    // 只补 ceil（下面没有 floor），渲染会在土层剖面上挖出一个没有底的空洞。
    level.floors.push({ id: "dugfloor_" + spot.id, x0: x0 - 0.4, x1: x1 + 0.4, y: spot.y, kind: "tunnel" });
    const ceilY = spot.ceilY !== null ? spot.ceilY : spot.y + spot.clearance;
    level.ceils.push({ x0: x0 - 0.4, x1: x1 + 0.4, y: ceilY });
  }

  state.world.dug[spot.id] = true;
  // 地形变了，机器人的导航图作废——不作废的话它永远不知道自己刚挖通一条路
  state.navNodes = null;
  Emit(state, {
    kind: "dug", id: spot.id, x: spot.x, y: spot.y, toX: spot.toX, toY: spot.toY, vertical,
  });
}

/** 挖出来的土堆在原地就是证据。堆本身也是可互动的（背起来才带得走）。 */
function DropSpoilPile(state, x, y, amount) {
  if (amount <= 0) return;
  for (const pile of state.world.spoilPiles) {
    if (Math.abs(pile.x - x) < 1.2 && Math.abs(pile.y - y) < 1.0) {
      pile.amount += amount;
      return;
    }
  }
  const id = "spoil_" + state.world.spoilPiles.length;
  state.world.spoilPiles.push({ id, x, y, amount, seen: false });
  state.level.props.push({
    id,
    x,
    y,
    z: 0,
    kind: "crock", // 一筐新土。渲染层认得这个 kind，不至于画不出来
    facing: 1,
    interact: "spoil",
    data: { pileId: id },
    label: "新土",
    hidden: false,
    spoilPile: true,
  });
}

function SpoilPileById(state, id) {
  for (const pile of state.world.spoilPiles) {
    if (pile.id === id) return pile;
  }
  return null;
}

function RemoveSpoilPile(state, id) {
  const piles = state.world.spoilPiles;
  for (let i = 0; i < piles.length; i++) {
    if (piles[i].id === id) {
      piles.splice(i, 1);
      break;
    }
  }
  const props = state.level.props;
  for (let i = 0; i < props.length; i++) {
    if (props[i].id === id) {
      props.splice(i, 1);
      break;
    }
  }
}

/** 没处理的新土：敌人走到跟前会显著提高警觉并进入搜索。这是这套机制的牙齿。 */
function UpdateSpoilPiles(state) {
  const piles = state.world.spoilPiles;
  if (piles.length === 0) return;
  for (const e of state.enemies) {
    if (e.dormant || e.defeated) continue;
    for (const pile of piles) {
      if (Math.abs(e.x - pile.x) > SPOIL_NOTICE_X) continue;
      if (Math.abs(e.y - pile.y) > SPOIL_NOTICE_Y) continue;
      if (e.alertness >= SPOIL_ALERT) continue;
      e.alertness = Math.max(e.alertness, SPOIL_ALERT);
      e.lastSeenX = pile.x;
      e.lastSeenY = pile.y;
      e.hasLead = true;
      e.lured = false;
      e.lureTimer = 0;
      if (!pile.seen) {
        pile.seen = true;
        Sfx(state, "shout", e.x, e.y);
        Emit(state, { kind: "spoilFound", x: pile.x, y: pile.y, enemyId: e.id });
      }
      break;
    }
  }
}

/**
 * 打草惊蛇：一声枪响/一颗雷，把一片区域的警觉整体抬起来。
 * 这是"枪弹稀缺且响"的落点（AGENTS.md 0.0.1）——用枪换掉的是整段路的安静。
 */
function AlarmArea(state, x, y, alarmX, huntX) {
  for (const e of state.enemies) {
    if (e.dormant || e.defeated) continue;
    const dx = Math.abs(e.x - x);
    if (dx > alarmX) continue;
    // 这一声把被引开的人也叫回神了：石头算什么
    e.lured = false;
    e.lureTimer = 0;
    e.lureAt = false;
    if (dx <= huntX) {
      e.alertness = Math.max(e.alertness, SENSE.searchAt + 0.08);
      e.lastSeenX = x;
      e.lastSeenY = y;
      e.hasLead = true;
      e.facing = x >= e.x ? 1 : -1;
    } else {
      e.alertness = Math.max(e.alertness, SENSE.suspiciousAt + 0.08);
    }
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
  // 背着的土撂下去还是一堆土（还是证据），不是一个凭空的道具
  if (item === SPOIL_ITEM) {
    DropSpoilPile(state, p.x, p.y, p.spoil);
    p.spoil = 0;
    p.carrying = null;
    Sfx(state, "cloth", p.x, p.y);
    return null;
  }
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

  for (const id of emit.reveal) RevealById(state, id);
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

  for (const id of emit.spawn) WakeEnemy(state, id);

  if (emit.objective) {
    state.story.objectiveText = emit.objective;
    Emit(state, { kind: "objective", text: emit.objective });
  }

  if (emit.checkpoint) SetCheckpointNear(state, (t.x0 + t.x1) * 0.5, state.player.y, t.id);

  // 过场：Rules 只挂号 + 发事件，由集成层决定什么时候把操作权收走。
  // 不在 StepPlay 里自作主张进过场——那会让任何"跑 N 帧看看"的调用
  // （测试、机器人、渲染健康检查）在开场就被一段三十秒的戏堵死。
  if (emit.cutscene) {
    state.pendingCutscene = emit.cutscene;
    Emit(state, { kind: "cutscene", id: emit.cutscene });
  }

  if (emit.win) {
    // 触发区说"到这就算通关"，但关卡自己写了 needAllVillagers。
    // AGENTS.md 第 0 节：第三幕结尾必须是一次完整的转移（全员抵达出口）。
    // 所以 win 只是"到地方了"，人没带齐就先记下来，等人齐了再收尾。
    state.winArmed = true;
    CheckWin(state, 0);
  }
}

/** 让某个 id（道具 / 地道口）现形。触发区和过场共用这一条路径。 */
function RevealById(state, id) {
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
  }
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

/**
 * 这条目标算不算通关的硬条件。
 * 只认"指得到东西"的目标——万一关卡里写了个不存在的 id，降级成不要求，
 * 而不是把整幕锁死。atExit 本身不算条件（它就是终点）。
 */
function ObjectiveRequired(state, obj) {
  const w = obj.doneWhen || {};
  if (w.atExit) return false;
  if (w.propUsed) return !!FindPropById(state, w.propUsed);
  if (w.trigger) return state.level.triggers.some((t) => t.id === w.trigger);
  if (w.npcRescued) {
    if (w.npcRescued === "all") return state.npcs.length > 0;
    return !!NpcById(state, w.npcRescued);
  }
  return false;
}

function PendingObjectives(state) {
  const out = [];
  for (const obj of state.level.objectives) {
    if (ObjectiveRequired(state, obj) && !ObjectiveDone(state, obj)) out.push(obj);
  }
  return out;
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
  // 以"被抓"收场的一幕，走到出口不算通关
  if (state.level.endKind === "captured") return;
  const exit = state.level.exit;
  if (!AtExit(state) && !state.winArmed) return;
  if (exit.needAllVillagers && !AllVillagersSafe(state)) return;
  // 事还没办完就到出口不算通关（第一幕必须先敲响钟）
  if (PendingObjectives(state).length > 0) return;
  WinLevel(state);
}

function WinLevel(state) {
  if (state.phase === "won") return;
  state.phase = "won";
  state.player.vx = 0;
  const chapter = FindChapter(state.level.chapterId);
  if (chapter && Array.isArray(chapter.closing)) {
    for (const id of chapter.closing) QueuePanel(state, id);
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
    // 引爆的那一下顿一顿。危害有 warnLeadSec 的前摇，这 0.35 秒完全落在
    // "还没开始蔓延"的窗口里，不会吃掉玩家往外跑的时间。
    SlowTime(state, TIME_SLOW.hazard, TIME_SLOW.hazardSec);
  }
}

function HazardWarnText(h) {
  if (h.kind === "gas") return "毒烟灌进来了 —— 封住卡口";
  if (h.kind === "water") return "他们在灌水 —— 快走";
  return "顶上要塌了";
}

function UpdateHazards(state, dt) {
  for (const h of state.hazards) {
    // 闸门也能启动危害：拉闸引水是玩家的手段，因果必须落在玩家身上，
    // 不能靠某个 trigger 自己走完（armAt 也允许直接写成闸门 channel）。
    if (!h.armed) {
      if (h.armAt && Switched(state, h.armAt)) ArmHazard(state, h.id);
      else if (h.kind === "water" && Switched(state, "waterDivert")) ArmHazard(state, h.id);
    }
    // sealedBy / armAt 认两种开关：拉闸（world.levers）和地雷（world.mines）。
    // 原来只查 levers，于是"用地雷炸开塌方"这种设计会静默死锁——
    // 危害拦得住人，而唯一能解开它的东西根本不被查询，关卡侧只能绕路。
    const sealed = h.sealedBy ? Switched(state, h.sealedBy) : false;

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
  // 提着马灯就是自己给自己打光：老远就看得见。
  // 放下灯摸黑贴着墙走，反而比平时还难被发现——第三幕最后那段就靠这个成立。
  s *= 1 + Clamp((p.lightRadius - 3.0) / 3.2, 0, 1) * LIGHT_VISIBILITY;
  if (p.lightRadius < 2.0 && p.layer === "tunnel") s *= DARK_VISIBILITY;
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

/** 这个兵此刻的有效视距倍率（蹲在地上盯着一块石头的人看不了远处）。 */
function EnemyVisionScale(e) {
  if (e.lured && e.lureAt) return LURE_FOCUS_VISION;
  return 1;
}

function CanSee(state, e) {
  const p = state.player;
  const vis = VisibilityScale(p);
  if (vis <= 0.001) return false;
  const range = e.visionRange * vis * EnemyVisionScale(e);
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
  // 放倒的院墙同时是一道视线屏障——"封"值得跑一趟的一半理由在这儿
  if (BlockBetween(state, ax, ay, bx, by)) return false;
  return true;
}

/** 这个兵能不能看见世界里的某个点（敲晕的"旁边有没有第二双眼睛"用它）。 */
function CanSeePoint(state, e, x, y) {
  if (e.dormant || e.defeated) return false;
  const ax = e.x;
  const ay = e.y + e.visionHeight;
  const by = y + PLAYER.standHeight * 0.55;
  const dx = x - ax;
  const dy = by - ay;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > e.visionRange * EnemyVisionScale(e)) return false;
  if (dist > 0.001) {
    const cos = (dx * e.facing) / dist;
    const ang = Math.acos(Clamp(cos, -1, 1)) * (180 / Math.PI);
    if (ang > e.visionHalfAngleDeg) return false;
  }
  if (EarthBetween(state.level, ax, ay, x, by)) return false;
  if (BlockBetween(state, ax, ay, x, by)) return false;
  return true;
}

function CanHear(state, e) {
  const p = state.player;
  if (p.noise <= 0.02) return false;
  const radius = (e.hearing || 6) * p.noise * SENSE.hearingScale;
  if (radius <= 0.1) return false;
  const dx = p.x - e.x;
  // 隔着一层土，脚步声是闷的：竖直距离按 CROSSLAYER_MUFFLE 放大，等于几乎传不上去。
  // 这条是"从地道绕过去"能不能成立的地基——绕后不该等于自报家门。
  // 通气孔是唯一的例外：那本来就是打通的声音通道，摸黑那段的紧张感全在这上面。
  const gap = Math.abs(p.y - e.y);
  const vent = gap > 1.5 ? NearVent(state, p.x) : true;
  const dy = (p.y - e.y) * (gap > 1.5 && !vent ? CROSSLAYER_MUFFLE : 1);
  return dx * dx + dy * dy <= radius * radius;
}

/** 这条水平线段上有没有被"封"住的口子（倒下的墙、堵死的街）。 */
function BlockBetween(state, ax, ay, bx, by) {
  const blocks = state.world.blocks;
  if (!blocks || blocks.length === 0) return false;
  const lo = Math.min(ax, bx);
  const hi = Math.max(ax, bx);
  for (const b of blocks) {
    if (Math.abs(b.y - ay) > BLOCK_REACH_Y && Math.abs(b.y - by) > BLOCK_REACH_Y) continue;
    if (b.x >= lo - b.halfWidth && b.x <= hi + b.halfWidth) return true;
  }
  return false;
}

/**
 * 敌人能不能从 fromX 走到 nextX。
 * **只有敌人走这条判定**——玩家的 CanWalkTo 永远不看 world.blocks。
 * 封了街把自己也堵死是这个动词最容易出的 bug，这行注释就是那道锁。
 */
function BlockedForEnemy(state, e, fromX, nextX) {
  const blocks = state.world.blocks;
  if (!blocks || blocks.length === 0) return false;
  for (const b of blocks) {
    if (Math.abs(b.y - e.y) > BLOCK_REACH_Y) continue;
    const lo = Math.min(fromX, nextX) - 0.001;
    const hi = Math.max(fromX, nextX) + 0.001;
    // 已经站在封口里的（比如墙就倒在他脚边）只准往外走，不许卡死
    const inside = Math.abs(fromX - b.x) <= b.halfWidth;
    if (inside) {
      if (Math.abs(nextX - b.x) < Math.abs(fromX - b.x)) return true;
      continue;
    }
    if (b.x - b.halfWidth <= hi && b.x + b.halfWidth >= lo) return true;
  }
  return false;
}

/** 玩家脚下附近有没有通气孔。 */
function NearVent(state, x) {
  for (const prop of state.level.props) {
    if (prop.kind !== "vent") continue;
    if (Math.abs(PropX(state, prop) - x) <= VENT_RANGE) return true;
  }
  return false;
}

function UpdateEnemies(state, dt) {
  for (const e of state.enemies) UpdateEnemy(state, e, dt);
}

/**
 * 把 0..1 的连续警觉切成玩家读得懂的五档。
 * 音效和 UI 挂在档位上，不用各自去猜阈值。
 */
function AlertStageOf(alertness) {
  if (alertness >= ALERT_FINAL) return "final"; // 最后一下：再不动就被抓
  if (alertness >= SENSE.searchAt) return "hunt"; // 他主动过来搜了
  if (alertness >= SENSE.suspiciousAt) return "suspect"; // 他停下来怀疑
  if (alertness >= ALERT_GLIMPSE) return "glimpse"; // 视线刚扫到
  return "calm";
}

const ALERT_STAGE_RANK = { calm: 0, glimpse: 1, suspect: 2, hunt: 3, final: 4 };

/**
 * 警觉跨过档位就发一次事件。只在**升档**时响，降档只更新 stage 不再发声，
 * 否则一次遭遇会在阈值上来回抖出一串音效。
 */
function EmitAlertStages(state, e, prevAlert, sensing) {
  const prev = AlertStageOf(prevAlert);
  const now = AlertStageOf(e.alertness);
  e.alertStage = now;
  if (now === prev) return;
  const up = ALERT_STAGE_RANK[now] > ALERT_STAGE_RANK[prev];
  Emit(state, {
    kind: "alert",
    stage: now,
    rising: up,
    enemyId: e.id,
    enemyKind: e.kind,
    x: e.x,
    y: e.y,
    dir: state.player.x >= e.x ? -1 : 1, // 从玩家看过去，威胁在哪一边
    seeing: !!e.seesPlayer,
    alertness: e.alertness,
  });
  if (!up) return;
  // 分级音效。suspect / hunt 沿用原来 state 切换时的声音（在下面的状态机里发），
  // 这里只补两头：第一次被扫到（极轻的布料/呼吸），和最后一下（心跳）。
  if (now === "glimpse" && sensing) Sfx(state, "cloth", e.x, e.y);
  else if (now === "final") Sfx(state, "heartbeat", e.x, e.y);
}

function UpdateEnemy(state, e, dt) {
  if (e.dormant) {
    // 被敲晕的人躺在原地，而且会被同伴发现——这是"敲晕换来一段时间，
    // 不是永久少一个人"的落点（AGENTS.md 0.0.1）。
    if (e.down) {
      UpdateDownedEnemy(state, e, dt);
      SetAnim(e, "caught", 0, dt);
      return;
    }
    SetAnim(e, "idle", 0, dt);
    return;
  }

  const p = state.player;
  const alive = state.phase === "play" && !p.dead;
  const seeing = alive && CanSee(state, e);
  const hearing = alive && !seeing && CanHear(state, e);
  const prevState = e.state;
  const prevAlert = e.alertness;

  // 渲染/UI 要能指出"是谁在看我"，所以感知结果必须落在 enemy 上，
  // 不能只活在这一帧的局部变量里。
  e.seesPlayer = !!seeing;
  e.hearsPlayer = !!hearing;

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

  // 「引」的余额。一旦真看见/听见玩家，石头就不重要了——引不是脱身卡。
  if (e.lured) {
    if (seeing || (hearing && e.alertness >= SENSE.suspiciousAt)) {
      e.lured = false;
      e.lureTimer = 0;
      e.lureAt = false;
    } else {
      e.lureTimer -= dt;
      if (Math.abs(e.x - e.lureX) < 0.6) {
        if (!e.lureAt) {
          e.lureAt = true;
          e.lureTimer = Math.min(e.lureTimer, e.lureHold);
          Sfx(state, e.kind === "dog" ? "dog" : "breath", e.x, e.y);
        }
      }
      if (e.lureTimer <= 0) {
        e.lured = false;
        e.lureAt = false;
        e.hasLead = false;
      }
    }
  }

  // 余温计时器：纯展示，不接进状态机（理由见文件头 HUNT_PERSIST_SEC 的注释）。
  if (e.alertness >= SENSE.searchAt) e.huntTimer = HUNT_PERSIST_SEC;
  else e.huntTimer = Math.max(0, (e.huntTimer || 0) - dt);
  if (e.alertness >= SENSE.suspiciousAt) e.suspectTimer = SUSPECT_PERSIST_SEC;
  else e.suspectTimer = Math.max(0, (e.suspectTimer || 0) - dt);
  e.linger = Clamp(Math.max(e.huntTimer / HUNT_PERSIST_SEC, e.suspectTimer / SUSPECT_PERSIST_SEC), 0, 1);

  EmitAlertStages(state, e, prevAlert, seeing || hearing);

  // 状态机
  let next;
  if (e.alertness >= 1 && seeing) next = "spotted";
  else if (e.alertness >= SENSE.searchAt) next = "search";
  // 被引开的人**真的走过去查看**：进 search，目标是那个点。
  // 这一条是"引"能不能用的分水岭——原地转个头不算引。
  else if (e.lured) next = "search";
  else if (e.alertness >= SENSE.suspiciousAt) next = "suspicious";
  else if (e.probeAt) next = "probe";
  else if (e.patrol) next = "patrol";
  else next = "idle";
  e.state = next;

  if (next !== prevState) {
    e.lookTimer = next === "search" ? SEARCH_LOOK_SEC : SUSPICIOUS_HOLD_SEC;
    if (next === "search" && prevState !== "spotted" && !e.lured) {
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
  // 敌人按"猫腰"判定：能进矮通道，但爬行才过得去的洞不追
  if (!CanWalkTo(state, nextX, e.y, "crouch")) return false;
  // 封住的口子：巡逻线到这儿就断了（玩家不受影响，见 BlockedForEnemy）
  if (BlockedForEnemy(state, e, e.x, nextX)) return false;
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
  // 被引开的人为了那块石头**愿意离开自己的巡逻区间**——这就是"调开"的意思。
  // 只在自己那七米里转两圈的话，引跟没引一样。
  const lured = e.lured && !e.hasLead;
  const targetX = lured ? e.lureX : e.hasLead ? e.lastSeenX : e.homeX;
  const range = lured ? LURE_RANGE_SLACK : e.patrol ? 7 : 5;
  const lo = (e.patrol ? Math.min(e.patrol.x0, e.patrol.x1) : e.homeX) - range;
  const hi = (e.patrol ? Math.max(e.patrol.x0, e.patrol.x1) : e.homeX) + range;
  const goal = Clamp(targetX, lo, hi);

  if (Math.abs(goal - e.x) > 0.35) {
    MoveEnemy(state, e, goal, speed, dt);
    SetAnim(e, "walk", 1, dt);
  } else if (lured) {
    // 到了。蹲下来盯着地上那块石头看——脸朝着它，视距对折（见 EnemyVisionScale）。
    // 玩家的窗口就是这几秒，而且是他自己挣来的，不是等来的。
    e.facing = e.lureX >= e.x ? 1 : -1;
    SetAnim(e, "idle", 0, dt);
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

// ───────────────────────────── 敲晕（AGENTS.md 0.0.1）─────────────────────────────
//
// 玩家仍然**没有攻击键**。敲晕走的是同一个"用"键，而且只在站位成立时才出现提示：
// 在背后 + 对方没察觉 + 旁边没有第二双眼睛。三条缺一条，按下去什么也不发生。
// 拿到这个站位的路子正是地道——从他脚底下过去，从他背后的院子冒出来。
//
// 它换来的是**一段时间**，不是"永久少一个人"：昏过去的人躺在街上，
// 同伴走到跟前就会炸锅。想留得久一点，就得挑没人会路过的地方下手。
const KO_WIND_SEC = 1.2; // 前摇。这段时间玩家站着，暴露
const KO_REACH_X = 1.55; // 够得着的水平距离
const KO_REACH_Y = 1.5; // 同层才谈得上背后
const KO_BEHIND_MIN = 0.25; // 太贴脸就不算"从背后"了，得在他身后一点
const KO_ALERT_MAX = SENSE.suspiciousAt; // 已经起疑的人会回头，摸不到
const KO_WITNESS_PAD = 1.0; // 第二双眼睛的宽容量：贴这么近就算看得见
const KO_DISCOVER_X = 3.2; // 同伴走到这么近会发现躺着的人
// 发现之后直接进搜索。但**别贴着 1.0**：0.86 意味着他一眼扫到玩家就是当场被抓，
// 契约给的 1.25 秒反应窗口等于被吃掉了。0.72 刚过 searchAt，行为一样凶，窗口还在。
const KO_DISCOVER_ALERT = SENSE.searchAt + 0.1;

/** 现在能不能从背后制服某个兵。返回该兵，或 null。 */
/** 这个兵现在能不能被摸掉（不看距离，只看"该不该"）。 */
function KnockoutEligible(state, e) {
  if (e.dormant || e.defeated || e.down) return false;
  // 狗听得见你走过来，摸不到它背后
  if (e.kind === "dog") return false;
  if (e.alertness >= KO_ALERT_MAX) return false;
  if (e.hasLead && e.alertness >= SENSE.suspiciousAt * 0.5) return false;
  if (e.state === "spotted" || e.state === "suspicious") return false;
  if (e.seesPlayer) return false;
  return true;
}

/** 敲晕这个动词此刻在这一幕里存不存在。 */
function KnockoutAllowed(state) {
  // 叙事必然不许被这个动词绕过（跟 0.0.2 里"封锁段不许有可挖点"是同一条纪律）：
  // 钟一响全村被翻个底朝天，人人竖着耳朵——这时候摸不到任何人背后。
  // 少了这一条，玩家可以等追兵的警觉自己退下去，逐个敲晕，然后大摇大摆走出村口，
  // 第一幕的收场就没了。
  if (state.world.bellRung && state.level.endKind === "captured") return false;
  return true;
}

// 一帧之内 CurrentPrompt 和 UpdateHud 都要问"现在能不能摸他"，而这个问题要遍历
// 敌人再做视线判定。按 state.time 记一次账，同一个子步只算一遍。
// 键是 state.time，纯确定性，不引入任何跟真实时间有关的差异。
function KnockoutTarget(state) {
  if (state.koCacheT === state.time) return state.koCache;
  const result = KnockoutTargetRaw(state);
  state.koCacheT = state.time;
  state.koCache = result;
  return result;
}

function KnockoutTargetRaw(state) {
  const p = state.player;
  if (p.dead || p.hidden || p.action || p.onShaft) return null;
  if (state.phase !== "play") return null;
  if (!KnockoutAllowed(state)) return null;

  let best = null;
  let bestD = Infinity;
  for (const e of state.enemies) {
    if (!KnockoutEligible(state, e)) continue;
    if (Math.abs(e.y - p.y) > KO_REACH_Y) continue;
    const dx = p.x - e.x;
    if (Math.abs(dx) > KO_REACH_X) continue;
    // 1) 必须在他背后
    if (Math.sign(dx) === e.facing) continue;
    if (Math.abs(dx) < KO_BEHIND_MIN) continue;
    // 2) 旁边不许有第二双眼睛
    if (KnockoutWitness(state, e)) continue;
    const d = Math.abs(dx);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/** 这一下会不会被别人看见。 */
function KnockoutWitness(state, target) {
  const p = state.player;
  for (const other of state.enemies) {
    if (other === target) continue;
    if (other.dormant || other.defeated || other.down) continue;
    if (Math.abs(other.y - p.y) > 2.6) continue;
    // 贴得太近的，就算此刻背对着，一转身也就看见了
    if (Math.abs(other.x - p.x) <= KO_WITNESS_PAD) return true;
    if (CanSeePoint(state, other, p.x, p.y)) return true;
    if (CanSeePoint(state, other, target.x, target.y)) return true;
  }
  return false;
}

function BeginKnockout(state, target) {
  const p = state.player;
  p.action = "knockout";
  p.actionTimer = KO_WIND_SEC;
  p.actionTotal = KO_WIND_SEC;
  p.actionPropId = null;
  p.knockoutId = target.id;
  p.vx = 0;
  p.facing = target.x >= p.x ? 1 : -1;
  Sfx(state, "cloth", p.x, p.y);
}

/** 前摇走完。这一秒二里目标可能已经转身或走开了——那就是空手一场。 */
function FinishKnockout(state) {
  const p = state.player;
  const id = p.knockoutId;
  p.knockoutId = null;
  let target = null;
  for (const e of state.enemies) {
    if (e.id === id) target = e;
  }
  if (!target || target.dormant || target.down) return;

  const dx = p.x - target.x;
  const stillBehind =
    Math.abs(dx) <= KO_REACH_X + 0.5 &&
    Math.abs(target.y - p.y) <= KO_REACH_Y &&
    Math.sign(dx) !== target.facing &&
    target.alertness < KO_ALERT_MAX + 0.2;
  if (!stillBehind) {
    // 摸空了。响一下，人也警觉了——这才是"有风险的行动"该有的收场。
    Sfx(state, "cloth", p.x, p.y);
    target.alertness = Math.max(target.alertness, SENSE.suspiciousAt + 0.1);
    target.lastSeenX = p.x;
    target.lastSeenY = p.y;
    target.hasLead = true;
    Emit(state, { kind: "knockout", enemyId: target.id, x: target.x, y: target.y, ok: false });
    return;
  }

  target.down = true;
  target.downX = target.x;
  target.downY = target.y;
  target.downFound = false;
  target.dormant = true; // 不再感知、不再移动。但没有 defeated：他还躺在那儿
  target.lured = false;
  target.lureTimer = 0;
  target.alertness = 0;
  target.seesPlayer = false;
  target.hearsPlayer = false;
  target.alertStage = "calm";
  target.huntTimer = 0;
  target.suspectTimer = 0;
  target.linger = 0;
  target.state = "idle";
  SetAnim(target, "caught", 0, 0);
  // 制服不是杀戮：一声闷响，一个人软下去，没有别的表现
  Sfx(state, "thud", target.x, target.y);
  p.noiseSpike = Math.max(p.noiseSpike, NOISE.crouch);
  Shake(state, 0.12);
  Emit(state, { kind: "knockout", enemyId: target.id, x: target.x, y: target.y, ok: true });
}

/** 躺着的人：等着被同伴发现。发现之后那一片就炸了。 */
function UpdateDownedEnemy(state, e, dt) {
  if (e.downFound) return;
  for (const other of state.enemies) {
    if (other === e || other.dormant || other.defeated) continue;
    if (Math.abs(other.y - e.y) > KO_REACH_Y) continue;
    if (Math.abs(other.x - e.x) > KO_DISCOVER_X) continue;
    e.downFound = true;
    other.alertness = Math.max(other.alertness, KO_DISCOVER_ALERT);
    other.lastSeenX = e.x;
    other.lastSeenY = e.y;
    other.hasLead = true;
    other.lured = false;
    other.lureTimer = 0;
    Sfx(state, "shout", other.x, other.y);
    Emit(state, { kind: "bodyFound", enemyId: e.id, byId: other.id, x: e.x, y: e.y });
    return;
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
  // 被发现的那一下定住半秒。这时候玩家已经没有可打的牌了——
  // 放慢不占用他的任何操作窗口，只是把这一下的分量留住。
  SlowTime(state, TIME_SLOW.spotted, TIME_SLOW.spottedSec);
  Die(state, "spotted");
}

function Die(state, reason) {
  const p = state.player;
  if (p.dead) return;
  // 第一幕：钟敲响之后被抓，就是这一幕该有的结局——不复活，收尾。
  // （钟还没响就被抓，说明该做的事没做完，正常回检查点。）
  const capturedEnding = state.level.endKind === "captured" && state.world.bellRung;
  p.dead = true;
  p.deathReason = capturedEnding ? "captured" : reason;
  p.deathTimer = capturedEnding ? CAPTURE_HOLD_SEC : DEATH_RESPAWN_SEC;
  state.capturedEnding = capturedEnding;
  p.vx = 0;
  p.vy = 0;
  p.hidden = false;
  p.hidePropId = null;
  p.onShaft = false;
  p.shaftId = null;
  p.action = null;
  p.actionTimer = 0;
  p.noise = 0;
  if (!capturedEnding) state.stats.deaths++;
  state.phase = "lost";
  Emit(state, { kind: "lost", reason: p.deathReason });
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
  // 入队时先落到面包屑上最靠近自己的那一点。
  // 不做这一步的话，刚喊上的人会被分到"队尾"那个槽位，
  // 于是他做的第一件事是从你身边掉头往回走八米——喊人喊得人跑了。
  npc.trailD = NearestTrailD(state, npc.x, npc.y);
  npc.rally = CALL_RALLY_SEC;
  Sfx(state, "cloth", npc.x, npc.y);
}

/**
 * 从 (x,y) 出发朝 dir 方向沿地板铺一条假面包屑，够整队人站开。
 * 复活 / 传送之后用它顶替"真实走过的路"，让队形立刻成立而不是叠在一点。
 * 遇到没有地板的地方就停——宁可尾巴短一点，也不许把人排进墙里。
 */
function TraceFloorRun(state, x, y, dir, need) {
  const level = state.level;
  const pts = [];
  let cy = y;
  for (let d = TRAIL_STEP; d <= need; d += TRAIL_STEP) {
    const nx = x + dir * d;
    if (nx < level.bounds.x0 + 0.3 || nx > level.bounds.x1 - 0.3) break;
    const floor = FloorUnder(level, nx, cy + STEP_UP, STEP_UP + FLOOR_SNAP);
    if (!floor) break;
    if (Math.abs(floor.y - cy) > STEP_UP) break;
    cy = floor.y;
    pts.push({ x: nx, y: cy });
  }
  return pts;
}

function SeedTrailBehind(state, x, y, dir) {
  const need = FOLLOW.spacing * Math.max(1, state.npcs.length) + 1.2;
  let pts = TraceFloorRun(state, x, y, dir, need);
  // 身后不够站（出生点贴着关卡边缘、检查点在死胡同里）就往另一头铺。
  // 队伍站在身前有点怪，但远远好过六个乡亲叠成一个人。
  if (pts.length * TRAIL_STEP < need * 0.9) {
    const alt = TraceFloorRun(state, x, y, -dir, need);
    if (alt.length > pts.length) pts = alt;
  }
  // 从尾到头重排成递增弧长
  const trail = [];
  let acc = 0;
  let prev = pts.length ? pts[pts.length - 1] : { x, y };
  trail.push({ x: prev.x, y: prev.y, d: 0 });
  for (let i = pts.length - 2; i >= 0; i--) {
    const q = pts[i];
    acc += Math.sqrt((q.x - prev.x) ** 2 + (q.y - prev.y) ** 2);
    trail.push({ x: q.x, y: q.y, d: acc });
    prev = q;
  }
  acc += Math.sqrt((x - prev.x) ** 2 + (y - prev.y) ** 2);
  trail.push({ x, y, d: acc });
  state.trail = trail;
}

/**
 * 队列间距。面包屑比整队人需要的还短时（刚开局、复活在死角），
 * 把间距压缩到刚好铺满现有的路，而不是让排不下的人全部堆到队尾那一点上。
 */
function QueueSpacing(state, count) {
  if (count <= 0) return FOLLOW.spacing;
  const trail = state.trail;
  const span = trail.length ? trail[trail.length - 1].d - trail[0].d : 0;
  // 不设有意义的下限：路只有一米时把六个人压成 0.16 米一档，
  // 依然比"排不下的全部夹到队尾同一点"强，而且玩家往前走一两步面包屑就够长了，
  // 队形自己会散开。
  const fit = span / (count + 0.25);
  return fit < FOLLOW.spacing ? Math.max(0.05, fit) : FOLLOW.spacing;
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

function TrailHeadD(state) {
  const trail = state.trail;
  return trail.length ? trail[trail.length - 1].d : 0;
}

/** 弧长 d 处的面包屑坐标（d 是绝对弧长，不是"落后多少"）。 */
function TrailPointAtD(state, d) {
  const trail = state.trail;
  if (trail.length === 0) return { x: state.player.x, y: state.player.y };
  if (trail.length === 1 || d <= trail[0].d) return { x: trail[0].x, y: trail[0].y };
  const head = trail[trail.length - 1];
  if (d >= head.d) return { x: head.x, y: head.y };
  // 从队尾往回找：跟随者都聚在靠近头部的一小段上，倒着找几乎总是几步就命中
  for (let i = trail.length - 1; i > 0; i--) {
    const a = trail[i - 1];
    const b = trail[i];
    if (d >= a.d && d <= b.d) {
      const t = b.d - a.d < 1e-6 ? 0 : (d - a.d) / (b.d - a.d);
      return { x: Lerp(a.x, b.x, t), y: Lerp(a.y, b.y, t) };
    }
  }
  return { x: head.x, y: head.y };
}

function TrailPointAt(state, distBehind) {
  return TrailPointAtD(state, TrailHeadD(state) - distBehind);
}

/** 面包屑上离 (x,y) 最近的那一点的弧长。新人入队时用它对齐。 */
function NearestTrailD(state, x, y) {
  const trail = state.trail;
  if (trail.length === 0) return 0;
  let best = trail[trail.length - 1].d;
  let bestD2 = Infinity;
  for (let i = 0; i < trail.length; i++) {
    const t = trail[i];
    const dx = t.x - x;
    const dy = t.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = t.d;
    }
  }
  return best;
}

/**
 * 半径内**最新**经过的那一段面包屑的弧长。停下等的人重新入队时用它：
 * 取"最近点"会挑到玩家很久以前路过的旧点，人会被拉回半张图之外。
 * 找不到（玩家根本没从他身边过）返回 null——那就还不该重新入队。
 */
function LatestTrailDNear(state, x, y, radius) {
  const trail = state.trail;
  const r2 = radius * radius;
  let best = null;
  for (let i = trail.length - 1; i >= 0; i--) {
    const t = trail[i];
    const dx = t.x - x;
    const dy = t.y - y;
    if (dx * dx + dy * dy <= r2) {
      best = t.d;
      break;
    }
  }
  return best;
}

/**
 * 队列排序：按各自在面包屑上的弧长从前往后排，而不是按关卡数组的顺序。
 * 数组顺序会让"刚喊上的人"抢到最靠前的槽位，于是整队人互相穿过去换位——
 * 六个乡亲在地道里对穿，这个画面比掉队还糟。
 */
function FollowOrder(state) {
  const out = [];
  for (const n of state.npcs) {
    if (n.rescued || !n.follow) continue;
    out.push(n);
  }
  out.sort((a, b) => {
    const d = (b.trailD || 0) - (a.trailD || 0);
    if (Math.abs(d) > 1e-6) return d;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; // 平手时按 id，保证确定性
  });
  return out;
}

/** 跟随者当前所在处的姿态（矮通道里得跟着猫腰，不能站着穿土）。 */
function NpcPosture(state, n) {
  const col = Column(state.level, n.x, n.y + 0.15, FLOOR_SNAP + 0.2);
  if (col.clearance === Infinity) return "stand";
  return PostureFor(col.clearance, false);
}

/**
 * 这个人现在是不是挂在竖井里。
 * 按几何判，不按"这一帧有没有往上动"——队伍在井里等前面的人时是不动的，
 * 靠位移判会让半支队伍在半空中摆出站立姿势。
 */
function InShaft(state, x, y) {
  for (const s of state.level.shafts) {
    if (Math.abs(x - s.x) > SHAFT_GRAB_X) continue;
    if (y > s.yBottom + 0.35 && y < s.yTop - 0.2) return true;
  }
  return false;
}

// ── 按人分路线（AGENTS.md 3 节 npcs.canCrawl / canClimb）──
//
// 六个乡亲不是一起走的：孩子钻得过矮口但够不着梯子，老人爬不了竖井但走得了平路。
// 护送因此从"跟随"变成"规划"，也正是史实里"老人孩子先走"的做法。
//
// 实现的三条底线：
//   · 过不去的人**停在原地等**，绝不穿墙、不卡在口子上；
//   · 他不挡后面的人（每个人各走各的弧长，前面停一个不影响后面的槽位）；
//   · 玩家回头走到他跟前，他自动重新接上队伍（hud.stuckFollowers 负责让人别走出老远才发现）。
const NPC_REJOIN_X = 3.2; // 玩家回到这么近，停下的人重新入队
const NPC_REJOIN_Y = 2.0;
const NPC_GATE_SAMPLE = 0.28; // 沿面包屑抽样的步长

// 干线上本来就压着一串支道竖井的井口（第三幕 e1@128 / e2@140 / e3@154 / e4@164
// 全在 y=-8 的干线上）。**"站在井口"不等于"在爬梯子"**——按位置判会把不会爬的人
// 钉死在他本来只是路过的地方（王大娘卡 167、栓柱卡 165，永远到不了 176 的出口）。
// 所以只在这一段路**真的换了层**时才要求 canClimb。
const NPC_CLIMB_WINDOW = 0.5; // 沿面包屑往前后各看这么远
const NPC_CLIMB_DROP = 0.55; // 这个窗口里的高差超过它才算"在换层"

/** 这个人过不过得去弧长 d 处（坐标 x,y）。返回 null / "crawl" / "climb"。 */
function NpcGateAt(state, n, x, y, d) {
  if (!n.canClimb && InShaft(state, x, y)) {
    const a = TrailPointAtD(state, d - NPC_CLIMB_WINDOW);
    const b = TrailPointAtD(state, d + NPC_CLIMB_WINDOW);
    if (Math.abs(b.y - a.y) > NPC_CLIMB_DROP) return "climb";
  }
  if (!n.canCrawl) {
    const col = Column(state.level, x, y + 0.15, FLOOR_SNAP + 0.2);
    if (col.clearance !== Infinity && col.clearance < HEADROOM.crouchNeeds) return "crawl";
  }
  return null;
}

/**
 * 从弧长 fromD 往 toD 走，第一次被挡在哪儿。
 * 返回 { d, reason } —— d 是能走到的最远弧长（挡点前一步），走得通则 reason 为 null。
 */
function NpcAdvanceLimit(state, n, fromD, toD) {
  if (n.canCrawl && n.canClimb) return { d: toD, reason: null };
  if (toD <= fromD) return { d: toD, reason: null }; // 往回退永远允许
  const span = toD - fromD;
  const steps = Math.max(1, Math.ceil(span / NPC_GATE_SAMPLE));
  let safe = fromD;
  for (let i = 1; i <= steps; i++) {
    const d = fromD + (span * i) / steps;
    const pt = TrailPointAtD(state, d);
    const gate = NpcGateAt(state, n, pt.x, pt.y, d);
    if (gate) return { d: safe, reason: gate };
    safe = d;
  }
  return { d: toD, reason: null };
}

function UpdateNpcs(state, dt) {
  const exit = state.level.exit;
  const headD = TrailHeadD(state);
  const queue = FollowOrder(state);
  const p = state.player;

  for (const n of state.npcs) {
    if (n.rescued) {
      SetAnim(n, "idle", 0, dt);
      continue;
    }
    if (!n.follow) {
      SetAnim(n, "idle", 0, dt);
      n.posture = NpcPosture(state, n);
      n.crouch = n.posture !== "stand";
      n.height = PostureHeight(n.posture);
      n.slotError = 0;
      const floor = FloorUnder(state.level, n.x, n.y + 0.6, 1.4);
      if (floor) n.y = floor.y;
    }
  }

  const spacing = QueueSpacing(state, queue.length);
  for (let i = 0; i < queue.length; i++) {
    const n = queue[i];
    n.rally = Math.max(0, (n.rally || 0) - dt);

    // 卡住的人：站在原地等。玩家走回他跟前就重新接上——
    // 不许出现"走到一半才卡住、只能退回去重来"的挫败。
    if (n.stuckReason) {
      const near = Math.abs(p.x - n.x) <= NPC_REJOIN_X && Math.abs(p.y - n.y) <= NPC_REJOIN_Y;
      // 重新入队只许改"他在队伍里的弧长"，不许改他站在哪儿——
      // 直接取全局最近点会让他从矮口这头瞬移到那头。
      const rejoinD = near ? LatestTrailDNear(state, n.x, n.y, 1.1) : null;
      if (rejoinD !== null) {
        n.trailD = rejoinD;
        n.stuckReason = null;
        n.rally = CALL_RALLY_SEC;
        Sfx(state, "cloth", n.x, n.y);
      } else {
        n.slotError = 0; // 卡住不算"掉队"：F 催不动他，别把提示浪费在这上面
        n.speed = 0;
        n.posture = NpcPosture(state, n);
        n.crouch = n.posture !== "stand";
        n.height = PostureHeight(n.posture);
        n.onShaft = false;
        SetAnim(n, n.posture === "stand" ? "idle" : "crouchIdle", 0, dt);
        continue;
      }
    }

    const wantD = headD - spacing * (i + 1);
    const cur = typeof n.trailD === "number" ? n.trailD : wantD;
    const err = wantD - cur;
    n.slotError = Math.abs(err);

    // 速度：贴着队形就按玩家步速走，掉出容差就小跑，掉太远（或刚被喊）再快一档。
    let speed = PLAYER.walkSpeed;
    if (n.slotError > FOLLOW.maxLag) speed = FOLLOW.catchUpSpeed * 1.25;
    else if (n.slotError > FOLLOW_SLOT_SLACK) speed = FOLLOW.catchUpSpeed;
    if (n.rally > 0 && err > 0) speed *= CALL_RALLY_SCALE;

    let nextD = cur;
    if (Math.abs(err) > FOLLOW_SNAP) {
      const step = Math.min(Math.abs(err), speed * dt);
      nextD = cur + Math.sign(err) * step;
    } else {
      nextD = wantD;
    }
    // 永远不许越过玩家，也不许掉到面包屑记录范围之外
    const tail = state.trail.length ? state.trail[0].d : 0;
    nextD = Clamp(nextD, tail, headD);

    // 走得过去吗。孩子够不着梯子、老人钻不了矮口 —— 挡住就停在挡点前，
    // 绝不硬穿过去（穿墙比掉队难看得多）。
    const limit = NpcAdvanceLimit(state, n, cur, nextD);
    if (limit.reason) {
      nextD = limit.d;
      n.stuckReason = limit.reason;
      Emit(state, { kind: "npcStuck", id: n.id, name: n.name, reason: limit.reason, x: n.x, y: n.y });
    }

    const from = TrailPointAtD(state, cur);
    const to = TrailPointAtD(state, nextD);
    n.trailD = nextD;
    n.x = to.x;
    n.y = to.y;

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const moved = Math.sqrt(dx * dx + dy * dy);
    if (Math.abs(dx) > 1e-4) n.facing = dx > 0 ? 1 : -1;

    // 姿态 + 动画。契约的动画名里有 crawl / crouchIdle / climb，
    // 之前跟随者一律 walk/idle：矮通道里六个人直挺挺穿过一米二的净空，
    // 竖井里整队人保持走路姿势垂直上升。剪影一眼就穿帮。
    const climbing =
      InShaft(state, n.x, n.y) ||
      (moved > 1e-4 && Math.abs(dy) > Math.abs(dx) * 1.6 && Math.abs(dy) > 0.004);
    n.posture = climbing ? "crouch" : NpcPosture(state, n);
    n.crouch = n.posture !== "stand";
    n.height = PostureHeight(n.posture);
    n.onShaft = climbing;
    const frac = Clamp(moved / dt / PLAYER.walkSpeed, 0, 1);
    let anim;
    if (climbing) anim = "climb";
    else if (moved <= 1e-4) anim = n.posture === "stand" ? "idle" : "crouchIdle";
    else if (n.posture !== "stand") anim = "crawl";
    else anim = "walk";
    SetAnim(n, anim, climbing ? 0.6 : frac, dt);
    n.speed = frac;

    // 抵达出口 → 得救
    if (Math.abs(n.x - exit.x) <= Math.max(exit.radius, FOLLOW.arriveRadius) && Math.abs(n.y - exit.y) <= 2.2) {
      n.rescued = true;
      n.follow = false;
      n.slotError = 0;
      Sfx(state, "cloth", n.x, n.y);
    }
  }
}

// ───────────────────────────── 摄像机 ─────────────────────────────

function ClampCamera(state) {
  const b = state.level.bounds;
  const c = state.camera;
  const halfH = c.viewHeight * 0.5;
  // 半宽必须按真实视口宽高比算。写死 16:9（viewHeight*0.95）在竖屏手机上会把
  // 相机夹到离关卡两端 8 米开外——出生点直接落在画面外，玩家一进游戏看不见自己。
  // aspect 由集成层在 Resize 时写入；拿不到就退回 16:9。
  const aspect = c.aspect > 0.2 ? c.aspect : 16 / 9;
  const halfW = halfH * aspect;
  const loX = b.x0 + halfW;
  const hiX = b.x1 - halfW;
  c.x = loX <= hiX ? Clamp(c.x, loX, hiX) : (b.x0 + b.x1) * 0.5;
  const loY = b.yBottom + halfH;
  const hiY = b.yTop - halfH;
  c.y = loY <= hiY ? Clamp(c.y, loY, hiY) : (b.yBottom + b.yTop) * 0.5;
}

// ── 镜头语言（AGENTS.md 2.3）──
//
// 呼吸感的幅度全在这里，刻意压到"说不出哪里不一样但就是活的"。
// 这几个数一旦放大就会晕，改之前先在手机上站着看三十秒。
const BREATH_AMP_X = 0.075; // 静止时的横向漂移（米）
const BREATH_AMP_Y = 0.045; // 竖向漂移（米）
const BREATH_PERIOD_X = 7.3; // 秒。和 Y 取互质的周期，避免画圈
const BREATH_PERIOD_Y = 5.1;
const BREATH_FADE = 1.6; // 走动时漂移收掉的速度
const TENSE_TIGHTEN = 0.055; // suspicion 拉满时视口收紧 5.5%
const HANDBACK_LERP_MIN = 0.42; // 过场交还镜头时的起始跟随强度（比例）
const ANCHOR_SAFE = 0.82; // 定镜头允许玩家离开画面中心多远（占半宽的比例）

/** 玩家当前落在哪个机位区里。区间重叠时取最后一个（关卡后写的覆盖先写的）。 */
function ActiveShot(state) {
  const shots = state.level.shots;
  if (!shots || shots.length === 0) return null;
  const p = state.player;
  let found = null;
  for (const s of shots) {
    if (p.x < s.x0 || p.x > s.x1) continue;
    if (p.y < s.yMin || p.y > s.yMax) continue;
    found = s;
  }
  return found;
}

function UpdateCamera(state, dt) {
  const p = state.player;
  const c = state.camera;

  // 呼吸偏移是"贴"在跟随结果上的，不是攒在里面的。
  // 先把上一帧的偏移撕下来，否则每帧都往同一个方向漂，几秒就飞出关卡。
  c.x -= Num(c.breathX, 0);
  c.y -= Num(c.breathY, 0);
  c.breathX = 0;
  c.breathY = 0;

  // —— 机位区：权重 w 在进出时各用 ease 秒过渡，所以永远不会硬切 ——
  const shot = ActiveShot(state);
  const shotId = shot ? shot.id : null;
  if (shotId !== state.shotId) {
    // 换区（或离开）：先把旧区的权重退回去，再涨新区的。
    // 直接跳权重就是硬切，正是 2.3 节点名要避免的"晃"。
    if (state.shotW <= 0.001 || !state.shotId) {
      state.shotId = shotId;
      state.shotW = 0;
    } else {
      state.shotW = Math.max(0, state.shotW - dt / Math.max(0.05, ShotEase(state)));
      if (state.shotW <= 0.001) state.shotId = shotId;
    }
  } else if (shotId) {
    state.shotW = Math.min(1, state.shotW + dt / Math.max(0.05, shot.ease));
  } else {
    state.shotW = Math.max(0, state.shotW - dt / 1.2);
  }
  const activeShot = state.shotId ? FindShotById(state, state.shotId) : null;
  const w = activeShot ? Clamp(state.shotW, 0, 1) : 0;
  state.shot = activeShot ? { id: activeShot.id, weight: w, anchored: activeShot.anchorX !== null } : null;

  const speedFrac = Clamp(Math.abs(p.vx) / PLAYER.walkSpeed, 0, 1);
  let targetX = p.x + p.facing * CAMERA.lookAheadX * speedFrac;
  // 摄像机抬多高分层定，因为两边要看的东西不一样：
  // 地表要把村庄和天空放进上三分之二（+0.9 会把地平线钉在 57.8%，
  //   剩下 42% 全是没内容的实心土，眼睛第一眼落在土上）；
  // 地道净空只有一米七出头，抬太高上下都是土，反而要把净空放到画面中间。
  let lift = p.layer === "tunnel" ? CAMERA.tunnelLift : CAMERA.surfaceLift;
  let targetVH = p.layer === "tunnel" ? CAMERA.tunnelViewHeight : CAMERA.viewHeight;
  if (activeShot) {
    if (activeShot.lift !== null) lift = Lerp(lift, activeShot.lift, w);
    if (activeShot.viewHeight !== null) targetVH = Lerp(targetVH, activeShot.viewHeight, w);
  }
  const targetY = p.y + lift;

  // 紧张时轻轻收一下口。玩家读不出"视口小了 5%"，但读得出"画面绷住了"。
  const tension = Clamp(Num(state.hud.suspicion, 0), 0, 1);
  targetVH *= 1 - TENSE_TIGHTEN * tension;

  // 过场交还：跟随强度从低往高爬，镜头是"缓过去"的，不是"弹回去"的
  let follow = CAMERA.followLerp;
  if (state.camHandback > 0) {
    state.camHandback = Math.max(0, state.camHandback - dt);
    const k = 1 - state.camHandback / CUT_HANDBACK_SEC;
    follow *= Lerp(HANDBACK_LERP_MIN, 1, Clamp(k, 0, 1));
  }

  // —— 水平 ——
  const anchored = activeShot && activeShot.anchorX !== null;
  if (anchored) {
    // 定镜头：镜头钉住，玩家走进构图里。仍然按权重混合，进出都是缓的。
    const dzX = state.shotW > 0.999 ? 0 : CAMERA.deadzoneX * (1 - w);
    const followX = ApproachDeadzone(c.x, targetX, dzX, follow, dt);
    let anchorX = activeShot.anchorX;
    // 定镜头绝不许把玩家挤出画面。关卡是按 16:9 挑的 anchorX，
    // 竖屏的半宽只有横屏的三分之一——同一个机位在手机上就会把人放到画外。
    // 所以按**真实** aspect 再夹一次：横屏照旧钉死，窄屏自动让开。
    const halfW = c.viewHeight * 0.5 * (c.aspect > 0.2 ? c.aspect : 16 / 9);
    const room = Math.max(0, halfW * ANCHOR_SAFE - PLAYER.width);
    anchorX = Clamp(anchorX, p.x - room, p.x + room);
    c.x = Lerp(followX, anchorX, w);
  } else {
    c.x = ApproachDeadzone(c.x, targetX, CAMERA.deadzoneX, follow, dt);
  }

  // —— 竖直 ——
  // 竖直死区只在人离地时才该存在——它是用来吸收跳落和爬梯的抖动的。
  // 站在地上还留着死区，摄像机就会停在 targetY 上下 deadzoneY 的任意位置，
  // 取景高度变成"看你从哪边收敛过来"的随机数，构图根本定不住。
  if (p.onGround && !p.onShaft) {
    c.y = Approach(c.y, targetY, follow, dt);
  } else {
    c.y = ApproachDeadzone(c.y, targetY, CAMERA.deadzoneY, follow, dt);
  }
  if (p.onShaft) c.y = Approach(c.y, targetY, follow * 1.4, dt);

  c.viewHeight = Approach(c.viewHeight, targetVH, 2.6, dt);

  // —— 呼吸：站定之后镜头极缓地漂，别让画面死在那儿 ——
  // 用 state.time 驱动，确定性；速度越快权重越低，走起来就收干净。
  const stillness = Clamp(1 - speedFrac * BREATH_FADE, 0, 1);
  c.breathX = Math.sin((state.time / BREATH_PERIOD_X) * Math.PI * 2) * BREATH_AMP_X * stillness;
  c.breathY = Math.sin((state.time / BREATH_PERIOD_Y) * Math.PI * 2 + 1.7) * BREATH_AMP_Y * stillness;
  c.x += c.breathX;
  c.y += c.breathY;

  c.shake = Approach(c.shake, 0, CAMERA.shakeDecay, dt);
  if (c.shake < 0.004) c.shake = 0;

  ClampCamera(state);
}

function ShotEase(state) {
  const s = FindShotById(state, state.shotId);
  return s ? s.ease : 1.2;
}

function FindShotById(state, id) {
  if (!id) return null;
  for (const s of state.level.shots) {
    if (s.id === id) return s;
  }
  return null;
}

/** 带死区的逼近：差值在死区内不动，超出才追。 */
function ApproachDeadzone(cur, target, deadzone, perSecond, dt) {
  const d = target - cur;
  if (d > deadzone) return Approach(cur, target - deadzone, perSecond, dt);
  if (d < -deadzone) return Approach(cur, target + deadzone, perSecond, dt);
  return cur;
}

// ───────────────────────────── HUD ─────────────────────────────

/**
 * 当前威胁最大的那个敌人。
 * 排序：正在看着我 > 听见我 > 警觉高 > 离得近。
 * 只挑一个——HUD 上同时指三个方向等于没指。
 */
function PickThreat(state) {
  const p = state.player;
  let best = null;
  let bestScore = -1;
  for (const e of state.enemies) {
    if (e.dormant) continue;
    if (e.alertness < ALERT_GLIMPSE && !e.seesPlayer) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // 距离只当细微的平手裁决，不该让远处一个已经锁定的兵输给近处一个刚起疑的
    const score =
      (e.seesPlayer ? 4 : 0) + (e.hearsPlayer ? 1 : 0) + e.alertness * 2 + 1 / (1 + dist);
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  if (!best) return null;
  const dx = best.x - p.x;
  const dy = best.y - p.y;
  return {
    id: best.id,
    kind: best.kind,
    x: best.x,
    y: best.y,
    dx,
    dy,
    // dir 是"从玩家看出去，威胁在左还是右"——UI 画箭头直接用这个
    dir: dx >= 0 ? 1 : -1,
    distance: Math.sqrt(dx * dx + dy * dy),
    facing: best.facing,
    alertness: best.alertness,
    stage: best.alertStage || AlertStageOf(best.alertness),
    state: best.state,
    seeing: !!best.seesPlayer,
    hearing: !!best.hearsPlayer,
    // 同层才谈得上"他就在那边"；隔着一层土的威胁 UI 该换个画法
    sameLayer: (best.y < -1 ? "tunnel" : "surface") === p.layer,
  };
}

function UpdateHud(state) {
  const hud = state.hud;
  hud.prompt = CurrentPrompt(state);
  hud.objective = ActiveObjective(state);
  let sus = 0;
  for (const e of state.enemies) {
    if (!e.dormant && e.alertness > sus) sus = e.alertness;
  }
  hud.suspicion = sus;
  hud.alertStage = AlertStageOf(sus);
  hud.threat = PickThreat(state);
  hud.callHint = CallHint(state);
  hud.villagersTotal = state.npcs.length;
  hud.villagersSafe = state.npcs.reduce((acc, n) => acc + (n.rescued ? 1 : 0), 0);
  hud.codexCount = Object.keys(state.world.codex).length;
  const carry = state.player.carrying;
  hud.carryLabel =
    carry === SPOIL_ITEM ? SPOIL_LABEL : carry && ITEMS[carry] ? ITEMS[carry].label : null;

  // 引：随时可用的主动动词，UI 要一直看得见落点和冷却
  const p = state.player;
  const aim = LureAim(state);
  hud.lure = {
    ready: aim.ok,
    reason: aim.reason,
    cooldown: p.lureCooldown,
    cooldownMax: LURE_COOL_SEC,
    x: aim.x,
    y: aim.y,
    // 热度：涨上去他们就不上当了。UI 该让玩家看见这条线。
    heat: Clamp(state.world.lureHeat / LURE_HEAT_WISE, 0, 1),
    wise: state.world.lureHeat >= LURE_HEAT_WISE,
  };
  hud.ammo = state.world.ammo;
  hud.ammoMax = state.world.ammoMax;
  // 挖出来的土：背上背了多少、地上还剩几堆没处理。后者是玩家最该盯着的东西——
  // 一堆没倒掉的新土等于给搜村的人留了路标。
  hud.spoil = p.spoil;
  hud.spoilMax = SPOIL_CARRY_MAX;
  hud.spoilPiles = state.world.spoilPiles.length;
  const ko = KnockoutTarget(state);
  hud.knockout = ko ? { id: ko.id, kind: ko.kind, x: ko.x, y: ko.y } : null;

  // 谁没跟上、为什么。**不要让玩家走出老远才发现少人。**
  const stuck = [];
  for (const n of state.npcs) {
    if (n.rescued || !n.follow || !n.stuckReason) continue;
    stuck.push({ id: n.id, name: n.name, reason: n.stuckReason, x: n.x, y: n.y });
  }
  hud.stuckFollowers = stuck;
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
  p.lureCooldown = 0;
  p.knockoutId = null;
  SnapToFloor(state);
  // 引的热度跟着这一条命一起清掉：回检查点重来一次，他们又肯上当了
  state.world.lureHeat = 0;

  // 敌人回位、警觉清零
  for (const e of state.enemies) {
    // 被敲晕的人不会因为玩家死一次就站起来——已经做到的事就是做到了。
    // 但也别让他躺在原地把巡逻线永远空着：这是"换来一段时间"，
    // 死一次就等于时间用完了，他醒过来回岗。
    if (e.down) {
      e.down = false;
      e.downFound = false;
      e.dormant = false;
    }
    e.lured = false;
    e.lureTimer = 0;
    e.lureAt = false;
    e.x = e.homeX;
    e.y = e.homeY;
    e.facing = e.homeFacing;
    e.alertness = 0;
    e.seesPlayer = false;
    e.hearsPlayer = false;
    e.alertStage = "calm";
    e.huntTimer = 0;
    e.suspectTimer = 0;
    e.linger = 0;
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

  // 跟随者跟着回到检查点。
  //
  // 面包屑必须**造出一条尾巴**，不能只留检查点这一个点：
  // 只有一个点时所有人的目标弧长都被夹到同一处，六个乡亲会在复活的瞬间
  // 叠成一个人（实测最小间距 0.000 米）。潜行游戏是要反复死的，
  // 这意味着每死一次全村就叠一次。
  SeedTrailBehind(state, p.x, p.y, -(p.facing >= 0 ? 1 : -1));
  const headD = TrailHeadD(state);
  let order = 0;
  for (const n of state.npcs) {
    if (n.rescued || !n.follow) continue;
    order++;
    n.trailD = Math.max(state.trail[0].d, headD - QueueSpacing(state, state.npcs.length) * order);
    const at = TrailPointAtD(state, n.trailD);
    n.x = at.x;
    n.y = at.y;
    n.slotError = 0;
    n.rally = 0;
    // 复活把队伍整个搬回检查点，卡在矮口/竖井上的人也跟着回来了
    n.stuckReason = null;
    n.posture = NpcPosture(state, n);
    n.crouch = n.posture !== "stand";
    n.height = PostureHeight(n.posture);
    SetAnim(n, n.posture === "stand" ? "idle" : "crouchIdle", 0, 0);
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
  SeedTrailBehind(state, p.x, p.y, -(p.facing >= 0 ? 1 : -1));
  const headD = TrailHeadD(state);
  let order = 0;
  for (const n of state.npcs) {
    if (n.rescued || !n.follow) continue;
    order++;
    n.trailD = Math.max(state.trail[0].d, headD - QueueSpacing(state, state.npcs.length) * order);
    const at = TrailPointAtD(state, n.trailD);
    n.x = at.x;
    n.y = at.y;
  }
  SnapCamera(state);
  UpdateHud(state);
  return state;
}

/**
 * 按住一组输入跑若干秒（测试用）。
 * 每帧先把输入清干净再套用 patch —— "按住这些键"就只按这些键，不会残留上一次的。
 */
export function DebugHold(state, inputPatch, seconds) {
  const dt = 1 / 60;
  const total = Num(seconds, 1);
  let t = 0;
  while (t < total - 1e-9) {
    ClearInput(state.input);
    if (inputPatch && typeof inputPatch === "object") {
      for (const key in inputPatch) state.input[key] = inputPatch[key];
    }
    StepPlay(state, dt);
    t += dt;
  }
  ClearInput(state.input);
  return state;
}

/**
 * 立刻走死亡/被抓流程（测试用）。
 * 之后正常跑 1.5 秒会自动回到最近检查点：stats.deaths +1、player.dead=false、phase="play"。
 */
export function DebugKill(state, reason = "test") {
  Die(state, reason);
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

function BotSignalPropFor(state, squadId) {
  if (!squadId) return null;
  for (const prop of state.level.props) {
    if (prop.interact !== "signal") continue;
    if (!prop.data || prop.data.squadId !== squadId) continue;
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
  // 地雷/枪眼没传到令 → 先跑一趟传令点。反击的"跑腿"对机器人也一样成立。
  if ((prop.interact === "mine" || prop.interact === "loophole") && !CounterReady(state, prop)) {
    const squadId = prop.interact === "mine" ? prop.data.needSquad : prop.data.squadId;
    const sig = BotSignalPropFor(state, squadId);
    if (sig) return { x: PropX(state, sig), y: sig.y, prop: sig, tag: "signal:" + squadId };
  }
  return { x: PropX(state, prop), y: prop.y, prop, tag: "prop:" + prop.id };
}

function BotGoal(state) {
  const level = state.level;
  const p = state.player;

  // 1) 有活跃/已武装的危害而且能封 → 优先去封
  for (const h of state.hazards) {
    if (!h.armed) continue;
    if (!h.sealedBy || Switched(state, h.sealedBy)) continue;
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
        return { x: (t.x0 + t.x1) * 0.5, y: Clamp(p.y, t.yMin, t.yMax), prop: null, tag: "trigger:" + t.id };
      }
    }
    if (w.npcRescued) {
      const npcGoal = BotNpcGoal(state, w.npcRescued);
      if (npcGoal) return npcGoal;
    }
    if (w.atExit) break;
    break;
  }

  // 2.5) 有人卡在矮口/竖井前等着 → 先回去接他。
  // 「按人分路线」的收场必须是"回头能接上"，不是"走远了才发现少人"。
  for (const n of state.npcs) {
    if (n.rescued || !n.follow || !n.stuckReason) continue;
    return { x: n.x, y: n.y, prop: null, npc: n, tag: "rejoin:" + n.id };
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

function BotHatchPropFor(state, hatchId) {
  for (const prop of state.level.props) {
    if (prop.interact !== "hatch") continue;
    const h = HatchForProp(state, prop);
    if (h && h.id === hatchId) return prop;
  }
  return null;
}

// ── 机器人的导航图 ──
// 关卡是多层的（地表 / 上层地道 / 下层地道），地板是一段一段的悬空台，
// 光"朝目标 x 走 + 就近找竖井"会走上一条到不了目标的台子然后掉下去。
// 所以按"地板段 + 竖井口切分"建一张图，用带危险权重的最短路选路线：
// 这样机器人才会为了躲开街上的岗哨主动钻街道地道（地道战的"街道相通"）。

const NAV_DANGER = 26; // 一个哨兵覆盖的路段要多付多少代价
const NAV_HATCH = 6; // 还没开的地道口：能开，但优先走现成的路
const NAV_HIDDEN = 10; // 还没现形的地道口：更贵，但不是死路
const NAV_ESCORT = 140; // 身后跟着过不去的人时，那条路要多付这么多（贵，但不封死）

function BuildNav(state) {
  const level = state.level;
  const nodes = [];

  for (const f of level.floors) {
    // 竖井口把地板切成几段，这样"从这头钻下去再从那头上来"才表达得出来
    const cuts = [f.x0, f.x1];
    for (const s of level.shafts) {
      if (s.x <= f.x0 + 0.3 || s.x >= f.x1 - 0.3) continue;
      if (Math.abs(s.yTop - f.y) < 0.9 || Math.abs(s.yBottom - f.y) < 0.9) cuts.push(s.x);
    }
    cuts.sort((a, b) => a - b);
    for (let i = 0; i < cuts.length - 1; i++) {
      if (cuts[i + 1] - cuts[i] < 0.2) continue;
      // 这一段最矮的净空。带着钻不了矮口的老人时要绕开它（「按人分路线」）
      let low = Infinity;
      for (let s = cuts[i] + 0.2; s < cuts[i + 1]; s += 0.6) {
        const col = Column(level, s, f.y + 0.15, FLOOR_SNAP + 0.2);
        if (col.clearance < low) low = col.clearance;
      }
      nodes.push({ id: nodes.length, x0: cuts[i], x1: cuts[i + 1], y: f.y, clearance: low, edges: [] });
    }
  }

  const AddEdge = (a, b, kind, extra) => {
    nodes[a].edges.push(Object.assign({ to: b, kind }, extra || {}));
    nodes[b].edges.push(Object.assign({ to: a, kind }, extra || {}));
  };

  // 走得通的相邻地板（含 ≤STEP_UP 的小台阶）
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      if (Math.abs(a.y - b.y) > STEP_UP) continue;
      const touch =
        Math.abs(a.x1 - b.x0) < 0.6 || Math.abs(b.x1 - a.x0) < 0.6 ||
        (a.x0 < b.x1 && b.x0 < a.x1);
      if (!touch) continue;
      const x = Math.abs(a.x1 - b.x0) < 0.6 ? a.x1 : Math.abs(b.x1 - a.x0) < 0.6 ? b.x1 : Math.max(a.x0, b.x0);
      AddEdge(i, j, "walk", { x });
    }
  }

  // 竖井
  // 井口正好压在切分点上时，两边的节点都算"够得着"——
  // 只连其中一个的话，会出现"钻了地道又被塞回原来那段危险街面"的假路线。
  const NodesAt = (x, y) => {
    const out = [];
    for (const n of nodes) {
      if (x < n.x0 - 0.7 || x > n.x1 + 0.7) continue;
      if (Math.abs(n.y - y) > 1.1) continue;
      out.push(n.id);
    }
    return out;
  };
  for (const s of level.shafts) {
    const tops = NodesAt(s.x, s.yTop);
    const bottoms = NodesAt(s.x, s.yBottom);
    for (const top of tops) {
      for (const bottom of bottoms) {
        if (top === bottom) continue;
        AddEdge(top, bottom, "shaft", { shaft: s, x: s.x });
      }
    }
  }

  return nodes;
}

function Nav(state) {
  if (!state.navNodes) state.navNodes = BuildNav(state);
  return state.navNodes;
}

function NavNodeAt(nodes, x, y) {
  let best = -1;
  let bestScore = Infinity;
  for (const n of nodes) {
    const dx = x < n.x0 ? n.x0 - x : x > n.x1 ? x - n.x1 : 0;
    const dy = Math.abs(n.y - y);
    const score = dy * 3 + dx;
    if (dy > 2.4 && dx > 0.8) continue;
    if (score < bestScore) {
      bestScore = score;
      best = n.id;
    }
  }
  return best;
}

/** 这段路上有几个岗哨（用来给最短路加危险权重）。 */
function NavDanger(state, node) {
  let danger = 0;
  for (const e of state.enemies) {
    if (e.dormant) continue;
    if (Math.abs(e.y - node.y) > 2.6) continue;
    const lo = e.patrol ? Math.min(e.patrol.x0, e.patrol.x1) : e.x;
    const hi = e.patrol ? Math.max(e.patrol.x0, e.patrol.x1) : e.x;
    if (hi < node.x0 - 2.5 || lo > node.x1 + 2.5) continue;
    danger += NAV_DANGER;
  }
  for (const h of state.hazards) {
    if (!h.active) continue;
    if (Math.abs(h.y - node.y) > 2.6) continue;
    const lo = Math.min(h.x0, h.x1) - 1;
    const hi = Math.max(h.x0, h.x1) + 1;
    if (hi < node.x0 || lo > node.x1) continue;
    danger += 90;
  }
  return danger;
}

function NavShaftUsable(state, shaft) {
  if (!shaft.requiresHatch) return { ok: true, cost: 0 };
  const rec = state.world.hatches[shaft.requiresHatch];
  if (!rec) return { ok: false, cost: 0 };
  if (rec.opened) return { ok: true, cost: 0 };
  // 还没现形的地道口不能算死路：关卡通常是"人走到跟前，触发区才让它现形"。
  // 当成"贵但走得通"，否则机器人永远想不到要下地道，只会去街上跟岗哨对撞。
  if (rec.hidden && !state.world.revealed[shaft.requiresHatch]) {
    return { ok: true, cost: NAV_HATCH + NAV_HIDDEN };
  }
  return { ok: true, cost: NAV_HATCH };
}

/**
 * 现在身后跟着的人有什么走不了的路（「按人分路线」）。
 * 带着爬不了竖井的老人时，走竖井那条捷径等于把人丢在井底。
 */
function EscortLimits(state) {
  let noClimb = false;
  let noCrawl = false;
  for (const n of state.npcs) {
    if (n.rescued || !n.follow) continue;
    if (!n.canClimb) noClimb = true;
    if (!n.canCrawl) noCrawl = true;
  }
  return { noClimb, noCrawl, any: noClimb || noCrawl };
}

/**
 * 从玩家当前位置到 (goalX, goalY) 的下一步。
 * 返回 { kind:"walk", x } 或 { kind:"shaft", shaft, down } 或 null（已经在目标那一段上）。
 */
function NavNext(state, goalX, goalY, escort) {
  const nodes = Nav(state);
  if (nodes.length === 0) return null;
  const p = state.player;
  const from = NavNodeAt(nodes, p.x, p.y);
  const to = NavNodeAt(nodes, goalX, goalY);
  if (from < 0 || to < 0) return null;
  if (from === to) return null;

  const n = nodes.length;
  const dist = new Array(n).fill(Infinity);
  const prev = new Array(n).fill(-1);
  const prevEdge = new Array(n).fill(null);
  const entryX = new Array(n).fill(0);
  const done = new Array(n).fill(false);
  dist[from] = 0;
  entryX[from] = p.x;

  for (let iter = 0; iter < n; iter++) {
    let cur = -1;
    let curD = Infinity;
    for (let i = 0; i < n; i++) {
      if (!done[i] && dist[i] < curD) {
        curD = dist[i];
        cur = i;
      }
    }
    if (cur < 0) break;
    if (cur === to) break;
    done[cur] = true;

    for (const edge of nodes[cur].edges) {
      if (done[edge.to]) continue;
      let cost = Math.abs(edge.x - entryX[cur]) + NavDanger(state, nodes[edge.to]);
      if (edge.kind === "shaft") {
        const usable = NavShaftUsable(state, edge.shaft);
        if (!usable.ok) continue;
        cost += 2 + usable.cost + Math.abs(edge.shaft.yTop - edge.shaft.yBottom) * 0.4;
        // 带着爬不了竖井的人：竖井不是不能走，是走了就得回来接人。贵，但不封死。
        if (escort && escort.noClimb) cost += NAV_ESCORT;
      }
      if (escort && escort.noCrawl && nodes[edge.to].clearance < HEADROOM.crouchNeeds) {
        cost += NAV_ESCORT;
      }
      const nd = dist[cur] + cost;
      if (nd < dist[edge.to]) {
        dist[edge.to] = nd;
        prev[edge.to] = cur;
        prevEdge[edge.to] = edge;
        entryX[edge.to] = edge.x;
      }
    }
  }

  if (dist[to] === Infinity) return null;
  // 回溯到第一跳
  let node = to;
  while (prev[node] !== -1 && prev[node] !== from) node = prev[node];
  if (prev[node] === -1) return null;
  const edge = prevEdge[node];
  if (!edge) return null;
  if (edge.kind === "shaft") {
    return { kind: "shaft", shaft: edge.shaft, down: edge.shaft.yBottom < nodes[from].y - 0.5 ? true : false, x: edge.shaft.x };
  }
  const target = nodes[node];
  const goRight = target.x0 >= nodes[from].x1 - 0.6;
  return { kind: "walk", x: goRight ? target.x0 + 0.6 : target.x1 - 0.6 };
}

/**
 * 找当前最该处理的敌人，并算清楚"他现在到底看不看得见我"。
 * 有效视距按机器人自己保持的猫腰+潜行折扣算，所以它知道什么时候能大胆走、
 * 什么时候得低头、什么时候必须躲。
 */
function BotThreat(state) {
  const p = state.player;
  const stealth = SENSE.crouchVisibility * SENSE.sneakVisibility;
  let worst = null;
  // 空窗要对所有人成立，但只有"真能看见猫腰的人"才算数：
  // 十几米开外正对着我的哨兵根本看不见蹲着的人，不该让机器人永远不敢动。
  let windowBlocked = false;
  for (const e of state.enemies) {
    if (e.dormant) continue;
    if (Math.abs(e.y - p.y) > 2.5) continue; // 不同层：土层挡着，不算威胁
    const dist = Math.abs(e.x - p.x);
    const facingMe = dist < 1.5 || Math.sign(p.x - e.x) === e.facing;
    // 被引开、正蹲着盯地上那块石头的人看不了远处。不把这一层算进来，
    // 机器人就永远不知道自己刚刚给自己开了一个窗口——"引"也就白引了。
    const seeScale = EnemyVisionScale(e);
    const effStealth = e.visionRange * seeScale * stealth + 1.4;
    const effStand = e.visionRange * seeScale + 1.4;
    if (dist > effStand + 5) continue; // 站着都看不见，跟我没关系
    const info = {
      e,
      dist,
      facingMe,
      effStealth,
      effStand,
      exposed: facingMe && dist < effStealth, // 猫腰潜行也会被看见
      loud: dist < (e.hearing || 6) * NOISE.walk + 0.5, // 站着跑会被听见
      alert: e.alertness,
    };
    if (facingMe && dist < effStealth + 1.0) windowBlocked = true;
    if (e.alertness >= 0.3) windowBlocked = true;
    // 挑"最该提防的那个"：先看有没有被盯上，再看警觉，最后才是远近。
    // 以前只按 facingMe 加分，结果十几米外一个面朝我的哨兵会把整个决策带偏。
    const score =
      info.alert * 2 +
      (info.exposed ? 3 : 0) +
      (facingMe && dist < effStealth + 2 ? 1 : 0) +
      (effStand + 5 - dist) * 0.05;
    if (!worst || score > worst.score) {
      info.score = score;
      worst = info;
    }
  }
  if (worst) worst.window = !windowBlocked;
  return worst;
}

/**
 * 从 fromX 跑到 toX 这一段，现在有人能看见吗？
 * 掩体接力真正要回答的是这个问题，而不是笼统的"附近有没有敌人面朝我"——
 * 十几米外一个面朝我的哨兵不该否决一次两米的短跳。
 */
/**
 * 预测这一跳会被看见多少秒（把敌人的巡逻往前推演，逐段累加）。
 * "被看见"不等于"被抓"——警觉要爬满 SENSE.alertRiseSec 才算数，
 * 所以真正该问的是"总曝光时间够不够他抓住我"，而不是"有没有一瞬间被看见"。
 */
function BotHopExposure(state, fromX, toX, stealth) {
  const p = state.player;
  const scale = stealth ? SENSE.crouchVisibility * SENSE.sneakVisibility : 1;
  const speed = stealth ? PLAYER.crouchSpeed * 0.72 : PLAYER.walkSpeed;
  const travel = Math.abs(toX - fromX) / Math.max(0.5, speed);
  const steps = 8;
  const step = travel / steps;
  let worst = 0;
  for (const e of state.enemies) {
    if (e.dormant) continue;
    if (Math.abs(e.y - p.y) > 2.5) continue;
    const eff = e.visionRange * EnemyVisionScale(e) * scale + 1.4;
    // 被引开的人不再按巡逻线推演：他正朝那块石头走／已经蹲在那儿了
    const lured = e.lured && e.lureTimer > 0;
    const lo = lured ? e.lureX : e.patrol ? Math.min(e.patrol.x0, e.patrol.x1) : e.x;
    const hi = lured ? e.lureX : e.patrol ? Math.max(e.patrol.x0, e.patrol.x1) : e.x;
    const sp = lured ? 0 : e.patrol ? e.patrol.speed : 0;
    let acc = e.alertness * SENSE.alertRiseSec; // 已经涨上去的警觉先算进去
    for (let i = 0; i <= steps; i++) {
      const t = i * step;
      const px = fromX + (toX - fromX) * (i / steps);
      let ex = e.x;
      let face = e.facing;
      if (sp > 0 && hi > lo) {
        // 把巡逻往前推：撞到端点就折返
        let x = e.x + face * sp * t;
        let guard = 0;
        while ((x < lo || x > hi) && guard++ < 8) {
          if (x < lo) {
            x = lo + (lo - x);
            face = 1;
          } else {
            x = hi - (x - hi);
            face = -1;
          }
        }
        ex = x;
      }
      const d = Math.abs(px - ex);
      const facingP = d < 1.5 || Math.sign(px - ex) === face;
      if (facingP && d < eff) acc += step;
    }
    if (acc > worst) worst = acc;
  }
  return worst;
}

function BotHopSafe(state, fromX, toX, stealth) {
  const p = state.player;
  const scale = stealth ? SENSE.crouchVisibility * SENSE.sneakVisibility : 1;
  const speed = stealth ? PLAYER.crouchSpeed * 0.72 : PLAYER.walkSpeed;
  const dir = toX >= fromX ? 1 : -1;
  const hopSec = Math.abs(toX - fromX) / Math.max(0.5, speed) + 0.4;
  for (const e of state.enemies) {
    if (e.dormant) continue;
    if (Math.abs(e.y - p.y) > 2.5) continue;
    if (e.alertness >= 0.3) return false; // 已经起疑了，别动
    const eff = e.visionRange * EnemyVisionScale(e) * scale + 1.4;
    // 已经蹲在石头跟前的人不会朝我走过来——这一跳的窗口是真的
    const eSpeed = e.lured && e.lureAt ? 0 : e.patrol ? e.patrol.speed : 1.2;
    // 这一跳里我离他最近能有多近（把他朝我走过来的可能也算上）
    const near = Math.min(Math.abs(e.x - fromX), Math.abs(e.x - toX)) - eSpeed * hopSec;
    if (near > eff) continue; // 全程都在他视距外，随便走

    // 够近了，就只能指望"我一直在他背后"。
    // 他在我前面、朝着我要去的方向走，而且我不会超过他 → 我一路跟在他背后，安全。
    const aheadOfMe = (e.x - fromX) * dir > 0;
    const stayBehind = aheadOfMe && (e.x - toX) * dir > 0 && e.facing === dir;
    // 他在我后面、背朝我 → 也安全。
    const behindMe = !aheadOfMe && e.facing !== dir;
    if (!stayBehind && !behindMe) {
      // 严格判据不过，就看看实际会被盯多久——够短就还是走得掉
      return BotHopExposure(state, fromX, toX, stealth) < SENSE.alertRiseSec * 0.6;
    }
  }
  return true;
}

/** 往哪边退才不会掉下台子／退回刚爬上来的竖井。 */
function BotRetreatDir(state, threat) {
  const p = state.player;
  const away = p.x >= threat.e.x ? 1 : -1;
  const floor = FloorUnder(state.level, p.x, p.y + 0.3, 0.6);
  if (!floor) return away;
  const room = away > 0 ? floor.x1 - p.x : p.x - floor.x0;
  if (room > 1.2) return away;
  return 0; // 退无可退，就地低头别动
}

/** 脚底下就有掩体吗（站上去就能钻进去）。 */
function BotCoverAt(state, x) {
  const p = state.player;
  let best = null;
  let bestD = 1.25;
  for (const prop of state.level.props) {
    if (prop.interact !== "hide") continue;
    if (!InteractAvailable(state, prop)) continue;
    if (Math.abs(prop.y - p.y) > 1.4) continue;
    const d = Math.abs(PropX(state, prop) - x);
    if (d < bestD) {
      bestD = d;
      best = prop;
    }
  }
  return best;
}

/**
 * 沿 dir 方向的下一个掩体。掩体接力就靠它。
 * 两个讲究：
 *   - 传了 noCross 就不选"要从他身上跨过去"的（往回退的时候用）；
 *   - 巡逻段里的掩体照用不误：它常常是唯一的踏脚石，
 *     躲进去等他走过再接力，比一口气冲二十米安全得多。
 */
function BotCoverToward(state, dir, noCross) {
  const p = state.player;
  let best = null;
  let bestD = Infinity;
  for (const prop of state.level.props) {
    if (prop.interact !== "hide") continue;
    if (!InteractAvailable(state, prop)) continue;
    if (Math.abs(prop.y - p.y) > 1.4) continue;
    const px = PropX(state, prop);
    const d = (px - p.x) * dir;
    if (d < 1.3 || d > 26) continue; // 脚下这个不算，太远的也够不着
    if (noCross) {
      const toEnemy = (noCross.e.x - p.x) * dir;
      if (toEnemy > 0 && d > toEnemy - 0.8) continue;
    }
    if (d < bestD) {
      bestD = d;
      best = prop;
    }
  }
  return best;
}

/** 找一个能躲的地方：别在敌人另一侧（跑过去等于送），限制在 14 米内。 */
function BotHideSpot(state, threat) {
  const p = state.player;
  let best = null;
  let bestD = Infinity;
  for (const prop of state.level.props) {
    if (prop.interact !== "hide") continue;
    if (!InteractAvailable(state, prop)) continue;
    const px = PropX(state, prop);
    const d = Math.abs(px - p.x);
    if (d > 14 || Math.abs(prop.y - p.y) > 2) continue;
    if (threat) {
      const toEnemy = threat.e.x - p.x;
      const toSpot = px - p.x;
      // 躲点在敌人那一侧、而且比敌人还远 → 不去
      if (Math.sign(toSpot) === Math.sign(toEnemy) && Math.abs(toSpot) > Math.abs(toEnemy) - 1.0) continue;
    }
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
  // 顺手就把口令传了：传令点散在地道支线里，等目标轮到它再回头跑要横穿半张图
  if (prompt.kind === "signal") return true;
  // —— 主动策略专属 ——
  // sneak 只躲：这几个动词一概不碰，那正是这条对照组的意义。
  if (bot.active) {
    // 从背后制服：站位是自己走出来的，遇上就不该放过
    if (prompt.kind === "knockout") return true;
    // 封路是纯赚：切断的是敌人的巡逻线，玩家自己不受影响
    if (prompt.kind === "block") return true;
    // 背上的土要倒掉，路上的土堆要背走——留着就是给搜村的人指路
    if (prompt.kind === "dumpSpoil") return state.player.spoil > 0;
    if (prompt.kind === "spoil") return true;
  }
  if (goal && goal.prop && goal.prop.id === prompt.id) return true;
  if (prompt.kind === "talk") return true;
  return false;
}

/**
 * 主动策略的核心：**摸上去**。
 * 挡路的那个兵背对着我、又没起疑、旁边也没人看着 → 走到他背后制服他。
 * 这就是契约 0.0.1 的那条闭环（绕到背后的工具是地道），机器人也照这条走。
 * 摸不成就退回老办法，不会赖着不放。
 */
// 能摸的人一定是**背对着我**的，也就是正走开的人。猫腰 1.75 m/s 追一个
// 1.2–1.8 m/s 的背影是追不上的——所以对**还在走的人**，"摸"只在近在咫尺时成立。
//
// 但**站着不动的人可以从十米外摸到**：他背对着我，就完全看不见我，
// 那十米是站着跑过去的。而让他站住不动的办法正是「引」——
// 扔块土坷垃到他前面，他走过去蹲下来看，这几秒就是给我留的。
// 「引开 → 从背后摸上去 → 敲晕」就是契约 0.0.1 那条闭环，机器人照这条走。
const BOT_STALK_RANGE = 4.2; // 对还在走动的人：再远就是追，不是摸
const BOT_STALK_STILL_RANGE = 8; // 对站住不动的人：可以从这么远摸过去（实测 8 米最划算）
const BOT_STALK_MAX_SEC = 3.5;
const BOT_STALK_STILL_SEC = 7.0;

/** 这个兵此刻是不是站着不动（引过去蹲着看／巡逻线端点的停顿）。 */
function EnemyStationary(e) {
  if (e.lured && e.lureAt) return true;
  if (e.state === "patrol" && e.pauseTimer > 0.4) return true;
  return false;
}

function BotStalkTarget(state, bot, dirToGoal) {
  if (!bot.active) return null;
  const p = state.player;
  if (p.hidden || p.action || p.onShaft) return null;
  if (!KnockoutAllowed(state)) return null;

  let best = null;
  let bestD = Infinity;
  for (const e of state.enemies) {
    if (!KnockoutEligible(state, e)) continue;
    if (Math.abs(e.y - p.y) > KO_REACH_Y) continue;
    const dx = e.x - p.x;
    const d = Math.abs(dx);
    const still = EnemyStationary(e);
    if (d > (still ? BOT_STALK_STILL_RANGE : BOT_STALK_RANGE)) continue;
    // 只摸挡在路上的（身后那个不碍事，绕开就完了）
    if (d > 2.5 && Math.sign(dx) !== dirToGoal) continue;
    // 他得背对着我：正面走过去是送
    if (Math.sign(p.x - e.x) === e.facing) continue;
    if (KnockoutWitness(state, e)) continue;
    // 中间还隔着别的兵就别摸了
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  if (best) best.stalkStill = EnemyStationary(best);
  return best;
}

/**
 * 主动策略的核心判断：现在该不该扔一块土坷垃。
 * 要点是**落点必须在威胁的那一侧、而且越过他**——落在自己这边等于把人叫过来。
 */
function BotShouldThrow(state, bot, threat, dirToGoal) {
  if (!bot.active || !threat) return false;
  const p = state.player;
  if (p.hidden || p.action || p.onShaft) return false;
  if (p.lureCooldown > 0.01) return false;
  if (bot.throwCooldown > 0) return false;
  // 只在**为了摸他**的时候扔。实测下来这一条是成败的分界：
  // 在走廊地形里单纯"把挡路的人调开"没有用——他被调去的地方还在我要走的路上，
  // 我照样得从他眼皮底下过。真正值钱的是把他调成**站着不动、背对着我**，
  // 那我就能贴上去把他放倒，这一段路从此站着走。
  if (!KnockoutAllowed(state)) return false;
  if (!KnockoutEligible(state, threat.e)) return false;
  if (Math.abs(threat.e.y - p.y) > KO_REACH_Y) return false;
  if (EnemyStationary(threat.e)) return false; // 已经站住了，直接摸过去就行
  if (threat.dist > BOT_STALK_STILL_RANGE - 1.5) return false; // 太远，引来也摸不着
  // 已经咬住我的人引不动（RaiseLure 里也会跳过），别浪费这半秒起手
  if (threat.alert >= SENSE.searchAt) return false;
  // 正被看着的时候不许扔：起手要站着不动半秒，那半秒足够他把警觉拉满
  if (threat.exposed) return false;
  // 太近了同理
  if (threat.dist < 4.5) return false;
  // 热度过线就先歇着，不然他们会朝我这边搜过来
  if (state.world.lureHeat >= LURE_HEAT_WISE - 0.4) return false;
  // 威胁得在我要去的方向上——身后那个不挡路，不用管
  const toThreat = Math.sign(threat.e.x - p.x);
  if (toThreat !== dirToGoal) return false;
  // 落点必须越过他至少 1.5 米，否则是把人往我这边叫
  const land = LureLandingX(state, dirToGoal);
  if ((land - threat.e.x) * dirToGoal < 1.5) return false;
  return true;
}

/**
 * 目标驱动的机器人。返回 { won, seconds, reason, strategy, ... }。
 *
 * 两种策略，是"主动玩法立没立起来"的量尺（AGENTS.md 0.0 的判据）：
 *   · "sneak"（默认）—— 只躲：猫腰、掩体接力、等空窗。绕地道照旧（那是导航图的事），
 *     但**绝不主动出手**：不扔石头、不敲晕、不封路、不挖。
 *   · "active" —— 优先用主动动词：引开（扔土坷垃）→ 绕到背后 → 敲晕 → 继续推进，
 *     顺路封路、顺路挖开新洞。
 *
 * 两种都必须能通关三幕（证明"躲"仍然可行），而 active 应当明显更快
 * （证明"躲"不是唯一解）。
 */
export function DebugAutoPlay(state, maxSeconds = 240, options = {}) {
  const dt = 1 / 60;
  const opts = typeof options === "string" ? { strategy: options } : options || {};
  const strategy = opts.strategy === "active" ? "active" : "sneak";
  const bot = {
    strategy,
    active: strategy === "active",
    pressCooldown: {},
    stuckTimer: 0,
    lastX: state.player.x,
    lastY: state.player.y,
    hiding: false,
    evade: false,
    evadeTimer: 0,
    dashing: false,
    blockedBy: null,
    blockedSec: 0,
    lastBlockedBy: null,
    lastBlockedT: 0,
    lastGoal: "",
    lures: 0,
    knockouts: 0,
    blocks: 0,
    digs: 0,
    throwCooldown: 0,
  };
  let t = 0;
  let guard = 0;
  const limit = Math.max(1, Num(maxSeconds, 240));

  const Report = (won, reason) => ({
    won,
    seconds: t,
    reason,
    strategy,
    lures: bot.lures,
    knockouts: bot.knockouts,
    blocks: bot.blocks,
    digs: bot.digs,
    deaths: state.stats.deaths,
  });

  while (t < limit && guard++ < 200000) {
    if (state.phase === "won") return Report(true, "reached_exit");
    // 机器人不看戏：挂号的过场直接开了再跳掉，
    // 这样"过场的副作用"照样结算（spawn/reveal/敲钟），关卡不会因为没人翻页而卡死。
    if (state.pendingCutscene && !state.cutscene) {
      const id = state.pendingCutscene;
      state.pendingCutscene = null;
      if (StartCutscene(state, id)) SkipCutscene(state);
    }
    if (state.cutscene) {
      SkipCutscene(state);
      continue;
    }
    BotThink(state, bot, dt);
    StepPlay(state, dt);
    t += dt;
    if (bot.giveUp) break;
  }

  if (state.phase === "won") return Report(true, "reached_exit");
  // blockedBy 只报**当前这一帧**真的挡着路的人。
  // 以前它是"这一局里任何时候被挡过一次"就一直留着的陈旧值：
  // 冒烟报 blockedBy=某个兵，实际那人在 y=0、目标在 y=-3.8，隔着 3.8 米土——
  // 照着这个值查巡逻线只会白查一整轮。真因是目标压在没实现的动词上。
  return Report(
    false,
      BotFailKind(bot) +
      " goal=" + (bot.lastGoal || "?") +
      " playerX=" + state.player.x.toFixed(1) +
      " playerY=" + state.player.y.toFixed(1) +
      " objective=" + ActiveObjective(state) +
      " deaths=" + state.stats.deaths +
      (bot.blockedBy ? " blockedBy=" + bot.blockedBy + "(当前)" : "") +
      (bot.blockedSec > 0.5 ? " blockedTotal=" + bot.blockedSec.toFixed(1) + "s" : "") +
      (!bot.blockedBy && bot.lastBlockedBy
        ? " lastBlockedBy=" + bot.lastBlockedBy + "@" + bot.lastBlockedT.toFixed(0) + "s"
        : ""),
  );
}

/** 失败原因分类，方便下次定位：卡在敌人 / 找不到路 / 目标不可达 / 几何卡死。 */
function BotFailKind(bot) {
  if (bot.noRoute > 3) return "no_route";
  if (bot.giveUp && bot.failKind === "geometry") return "stuck_geometry";
  // 只有"此刻还被挡着"才算被敌人挡住。否则一次擦肩而过就会把
  // 所有后续的失败都归错类。
  if (bot.blockedBy) return "blocked_by_enemy";
  if (bot.lastGoal && bot.lastGoal.indexOf("propDone:") === 0) return "goal_unreachable";
  if (bot.lastGoal && bot.lastGoal.indexOf("signal:") === 0) return "squad_unreachable";
  return "timeout";
}

function BotThink(state, bot, dt) {
  const input = state.input;
  const p = state.player;
  ClearInput(input);

  // 每帧先清掉"谁挡着我"，让这一帧的逻辑重新认领。
  // 不清的话这个字段会一直留着几分钟前擦肩而过的那个兵，报错时指错方向。
  if (bot.blockedBy) {
    bot.blockedSec = (bot.blockedSec || 0) + dt;
    bot.lastBlockedBy = bot.blockedBy;
    bot.lastBlockedT = state.time;
  }
  bot.blockedBy = null;

  for (const key in bot.pressCooldown) {
    if (bot.pressCooldown[key] > 0) bot.pressCooldown[key] -= dt;
  }

  if (state.phase === "panel") {
    // Main 如果为了播气泡把 phase 挂起了，机器人自己翻页，别在这卡死
    DismissPanel(state);
    return;
  }
  if (state.phase !== "play") return;
  if (p.dead) return;

  const goal = BotGoal(state);
  bot.lastGoal = goal.tag;

  // 这一跳该往哪走（导航图算的，可能跟目标方向相反——比如要先绕回去下地道）
  const escort = EscortLimits(state);
  const hop = p.onShaft ? null : NavNext(state, goal.x, goal.y, escort);
  const localX = hop ? hop.x : goal.x;
  if (!hop && !p.onShaft && Math.abs(goal.y - p.y) > 1.6) {
    // 导航图连不到目标那一层：不是被敌人挡着，是真没路
    bot.noRoute = (bot.noRoute || 0) + dt;
  } else {
    bot.noRoute = 0;
  }

  // 卡住检测
  const moved = Math.abs(p.x - bot.lastX) + Math.abs(p.y - bot.lastY);
  if (moved > 0.35) {
    bot.lastX = p.x;
    bot.lastY = p.y;
    bot.stuckTimer = 0;
  } else {
    bot.stuckTimer += dt;
  }
  // 只有"真的一动不动"才认定几何卡死。在敌人跟前蹲着等时机不算卡死——
  // 提前弃权等于白扔掉后面两百秒的尝试机会。
  if (bot.stuckTimer > 75) {
    bot.giveUp = true;
    bot.failKind = "geometry";
    return;
  }

  // ── 停滞升级 ──
  // 这个测试是要证明"关卡没有死锁"，不是证明 bot 玩得好。
  // 同一个目标上长时间原地打转 → 一级一级加码，最后允许被抓一次
  //（被抓只是回检查点，已开的地道口／已拉的闸／已救的人都还在）。
  // 用"离目标最近到过哪"来判定有没有进展。
  // 之前用"位置有没有动过"，结果机器人在两个柴垛之间来回蹭六米就把计时器清零了，
  // 于是永远升不了级，卡在原地三百秒。
  const goalDist = Math.abs(p.x - goal.x) + Math.abs(p.y - goal.y) * 2;
  if (goal.tag !== bot.stallGoal) {
    bot.stallGoal = goal.tag;
    bot.bestDist = goalDist;
    bot.stallTimer = 0;
    bot.desperate = 0;
    bot.caughtHere = 0;
  } else if (goalDist < (bot.bestDist === undefined ? Infinity : bot.bestDist) - 3) {
    bot.bestDist = goalDist;
    bot.stallTimer = 0;
    bot.desperate = 0;
  } else {
    bot.stallTimer = (bot.stallTimer || 0) + dt;
  }
  if (bot.deathMark !== state.stats.deaths) {
    // 刚被抓过：局面已经重置，重新好好玩
    bot.deathMark = state.stats.deaths;
    bot.stallTimer = 0;
    bot.desperate = 0;
    bot.dashTo = null;
    bot.caughtHere = (bot.caughtHere || 0) + 1;
  }
  // 兜底顺序：绕路（导航图里本来就含地道旁路）→ 猫腰掩体接力 → 等窗口 → 才轮到硬闯。
  // 而且同一个目标最多认三次被抓，再多就说明硬闯不是解，别无限撞。
  // 一级（不等空窗、强制掩体接力）永远开着——它不送命，只是急一点；
  // 二级（完全无视敌人）才是会被抓的那档，同一目标认三次就停用，改回耐心打法。
  if ((bot.caughtHere || 0) >= 3 && bot.stallTimer > 45) {
    bot.caughtHere = 0; // 耐心打法也试过一轮了，再给三次硬闯机会
    bot.stallTimer = 14;
  }
  const mayCharge = (bot.caughtHere || 0) < 3;
  bot.desperate = bot.stallTimer > 26 && mayCharge ? 2 : bot.stallTimer > 13 ? 1 : 0;

  // 竖直导航：在竖井上就一路按到底，别在半空里改主意
  if (p.onShaft) {
    const shaft = ShaftById(state, p.shaftId);
    const wantY = bot.climbTargetY !== undefined ? bot.climbTargetY : goal.y;
    if (shaft) {
      const mid = (shaft.yTop + shaft.yBottom) * 0.5;
      if (wantY > p.y + 0.05) input.up = true;
      else if (wantY < p.y - 0.05) input.down = true;
      else if (p.y > mid) input.up = true;
      else input.down = true;
    } else if (wantY > p.y) input.up = true;
    else input.down = true;
    return;
  }
  // 二级：彻底不管敌人了，低头直接朝路线目标走，被抓就被抓
  if (bot.desperate >= 2) {
    bot.blockedBy = bot.blockedBy || null;
    bot.failKind = "enemy";
    bot.stuckTimer = 0; // 这是在硬闯，不是卡住
    if (p.hidden) {
      input.interactPressed = true;
      return;
    }
    input.crouch = bot.stallTimer < 34;
    input.sneak = input.crouch;
    BotWalkTo(state, bot, localX, input);
    MaybePress(state, bot, goal, input);
    return;
  }

  // ── 潜行处置：掩体接力 ──
  // 关卡是按"柴垛—水缸—碾盘每隔七八米一个"设计的，正确打法是从掩体跑到掩体：
  //   离得远 → 一路猫腰潜行（猫腰视距只有站着的一半，远处根本看不见）；
  //   进了"猫腰也会被看见"的范围 → 没窗口就钻进眼前的掩体等；
  //   等他背过身 → 站起来全速冲下一个掩体，**冲了就冲到底**，半路他回头也不许掉头
  //     （掉头等于在他眼皮底下多待一倍时间，这是之前卡死的真正原因）；
  //   冲到掩体立刻再钻进去 —— 跑动会被听见，但只要藏起来他就找不到人。
  const threat = BotThreat(state);
  bot.hiding = false;
  const dirToGoal = Math.sign(localX - p.x) || p.facing;
  // 井口就在眼前：钻下去比躲柴垛安全得多，别再玩掩体接力了。
  // 但开地道口要站着刨将近一秒，被军犬盯着刨等于送——所以还是要挑没人看的时候。
  const shaftHop = !!(hop && hop.kind === "shaft");
  const nearMouth = shaftHop && Math.abs(p.x - hop.x) < 2.2;
  const atMouth =
    nearMouth && (!threat || BotHopSafe(state, p.x, hop.x, true));

  // 顺路就把乡亲喊上（有的关卡没有 talk 道具，只能靠"呼应"）。
  // 不这么干的话，等目标轮到"找齐乡亲"时得横穿半张图回头捡人。
  //
  // 但**爬不了竖井、钻不了矮口的人不能顺手带**：把老人喊上再钻竖井，
  // 他就停在井底了。这类人要等到"该带人走了"那一步再接——这正是
  // 「按人分路线」要玩家做的规划，机器人也得照做。
  const collecting = goal.tag.indexOf("npc:") === 0 || goal.tag.indexOf("rejoin:") === 0 || goal.tag === "exit";
  if (!p.hidden && !p.action && !(threat && threat.dist < 12)) {
    for (const n of state.npcs) {
      if (n.rescued || n.follow) continue;
      if (Math.abs(n.x - p.x) > 5.5 || Math.abs(n.y - p.y) > 2.2) continue;
      if (!collecting && (!n.canClimb || !n.canCrawl)) continue;
      input.callPressed = true;
      break;
    }
  }

  // ── 主动策略之一：站位成立就从背后制服 ──
  // 这是"绕地道 → 从他背后冒出来"挣来的收益，遇上了不该放过。
  // sneak 到这里什么也不做，只能继续等空窗——这正是这条对照组的意义。
  bot.throwCooldown = Math.max(0, (bot.throwCooldown || 0) - dt);
  if (bot.active && !p.hidden && !p.action) {
    const ko = KnockoutTarget(state);
    if (ko) {
      input.interactPressed = true;
      bot.knockouts++;
      bot.stuckTimer = 0;
      bot.stalkId = null;
      bot.stalkTimer = 0;
      return;
    }
    // 还没够着：挡在路上、背对着我、旁边没人看着 → 摸上去。
    // 但**只在他确实碍事的时候**才绕这一趟：要么他已经逼得我一路猫腰
    //（猫腰 1.75 m/s，站着走 3.3，把他放倒后面那一整段就能站着走），
    // 要么他已经站住不动了（那就是白捡的）。满街追背影不是"主动"，是浪费。
    const stalkCandidate = BotStalkTarget(state, bot, dirToGoal);
    const stalkWorth =
      stalkCandidate &&
      (EnemyStationary(stalkCandidate) ||
        (threat &&
          threat.e === stalkCandidate &&
          threat.dist < threat.effStand + 2 &&
          Math.abs(stalkCandidate.x - p.x) < BOT_STALK_RANGE));
    const stalk = stalkWorth ? stalkCandidate : null;
    if (stalk) {
      if (bot.stalkId !== stalk.id) {
        bot.stalkId = stalk.id;
        bot.stalkTimer = 0;
      }
      bot.stalkTimer += dt;
      const still = !!stalk.stalkStill;
      if (bot.stalkTimer < (still ? BOT_STALK_STILL_SEC : BOT_STALK_MAX_SEC)) {
        const behindX = stalk.x - stalk.facing * 0.9;
        const gap = Math.abs(behindX - p.x);
        // 他背对着我就根本看不见我 —— 远的时候站着跑（3.3 m/s），
        // 最后两米才低头。全程猫腰放轻只有 1.26 m/s，那这一趟永远走不完。
        if (gap < 2.2 || !still) {
          input.crouch = true;
          if (gap < 1.4) input.sneak = true;
        }
        BotWalkTo(state, bot, behindX, input);
        bot.stuckTimer = 0;
        bot.dashTo = null;
        bot.commitTimer = 0;
        return;
      }
    } else {
      bot.stalkId = null;
      bot.stalkTimer = 0;
    }
    // 摸不上（他背对着我但在十米开外，追是追不上的）→ **引**。
    // 关键是别等到"完全走不了"才引：只要前面这个人逼得我一路猫腰，
    // 就该把他调开——猫腰 1.75 m/s，站着走 3.3，这一半的速度就是主动玩法的收益。
    if (BotShouldThrow(state, bot, threat, dirToGoal)) {
      if (p.facing !== dirToGoal) {
        input.moveX = dirToGoal; // 石头往面朝方向飞：先把身子转过去
        input.crouch = true;
        input.sneak = true;
        return;
      }
      input.itemPressed = true;
      input.crouch = true;
      input.sneak = true;
      bot.throwCooldown = LURE_COOL_SEC + LURE_WIND_SEC;
      bot.lures++;
      bot.stuckTimer = 0;
      bot.commitTimer = 0;
      return;
    }
  }

  if (p.hidden) {
    bot.hideTimer = (bot.hideTimer || 0) + dt;
    const nextCover = BotCoverToward(state, dirToGoal, null);
    let exitTarget = nextCover ? PropX(state, nextCover) : localX;
    if (shaftHop && Math.abs(hop.x - p.x) < Math.abs(exitTarget - p.x)) exitTarget = hop.x;
    const clear =
      !threat || BotHopSafe(state, p.x, exitTarget, false) || BotHopSafe(state, p.x, exitTarget, true);
    // 实在等不到空窗就硬着头皮出去：宁可难看地通关，也不许无限等待
    if (clear || bot.hideTimer > (bot.active ? 5 : 20)) {
      input.interactPressed = true;
      if (!clear) {
        // 关键：出来就直接锁定下一个掩体开冲。
        // 否则下一帧发现"没窗口 + 脚下正好有掩体"，会立刻again钻回同一个柴垛，
        // 计时器归零，于是永远在同一个位置进进出出——之前卡死就是卡在这。
        if (Math.abs(exitTarget - p.x) > 0.8) bot.dashTo = exitTarget;
      }
      bot.hideTimer = 0;
      bot.commitTimer = 0;
    } else {
      bot.hiding = true;
      bot.stuckTimer = 0;
      if (threat) bot.blockedBy = threat.e.id;
    }
    return;
  }
  bot.hideTimer = 0;

  if (!threat || atMouth) {
    bot.commitTimer = 0;
    bot.dashTo = null;
    if (threat) {
      input.crouch = true;
      input.sneak = true;
    }
  } else {
    const inSight = threat.dist < threat.effStand + 2;
    const nearVision = threat.dist < threat.effStealth + 2.5 || threat.alert > 0.2;
    if (inSight) {
      input.crouch = true;
      input.sneak = true;
    }

    if (nearVision || bot.dashTo != null) {
      bot.blockedBy = threat.e.id;
      bot.stuckTimer = 0;
      bot.commitTimer = (bot.commitTimer || 0) + dt;
      const hopTarget = (() => {
        const next = BotCoverToward(state, dirToGoal, null);
        let x = next ? PropX(state, next) : localX;
        if (shaftHop && Math.abs(hop.x - p.x) < Math.abs(x - p.x)) x = hop.x;
        return x;
      })();
      const safeRun = BotHopSafe(state, p.x, hopTarget, false);
      const safeCreep = safeRun || BotHopSafe(state, p.x, hopTarget, true);
      const windowOpen = safeCreep;
      // 主动策略的耐心短得多：它手上有牌（引 / 摸 / 封），不该跟只会躲的人一样
      // 蹲在柴垛后面数十六秒。这跟"造窗口"是一体两面：sneak 等窗口，active 造窗口。
      const commit = bot.commitTimer > (bot.active ? 5 : 16) || bot.desperate > 0;

      // 1) 已经在冲了：冲到底
      if (bot.dashTo != null) {
        if (Math.abs(bot.dashTo - p.x) < 0.8) {
          bot.dashTo = null;
          bot.commitTimer = 0;
          const arrived = BotCoverAt(state, p.x);
          if (arrived && (!windowOpen || threat.alert > 0.15)) {
            bot.hiding = true; // 落地就钻进去
            MaybePress(state, bot, goal, input);
            return;
          }
        } else {
          const creep = !BotHopSafe(state, p.x, bot.dashTo, false) || threat.loud;
          input.crouch = creep;
          input.sneak = creep;
          BotWalkTo(state, bot, bot.dashTo, input);
          MaybePress(state, bot, goal, input);
          return;
        }
      }

      // 2) 有窗口（或憋太久）→ 起跑，目标是下一个掩体
      if (windowOpen || commit) {
        const dashX = hopTarget;
        if (Math.abs(dashX - p.x) > 0.8) bot.dashTo = dashX;
        bot.commitTimer = 0;
        // 能跑就全速站着跑；只有"跑会被看见但蹭得过去"时才猫腰
        const creep = !safeRun || threat.loud;
        input.crouch = creep;
        input.sneak = creep;
        BotWalkTo(state, bot, dashX, input);
        MaybePress(state, bot, goal, input);
        return;
      }

      // 3) 没窗口。**主动策略在这里出手：窗口是造出来的，不是等来的。**
      // sneak 没有这一整段，只能钻柴垛等他自己走开——两条策略的耗时差主要来自这里。

      // 3a) 挡路那个人正背对着我 → 猫腰摸到他背后制服他。
      // 只在"已经被挡住"时才绕这一趟：主动不等于满街追着人跑。
      const stalk = BotStalkTarget(state, bot, dirToGoal);
      if (stalk && Math.abs(stalk.x - p.x) <= BOT_STALK_RANGE) {
        if (bot.stalkId !== stalk.id) {
          bot.stalkId = stalk.id;
          bot.stalkTimer = 0;
        }
        bot.stalkTimer += dt;
        if (bot.stalkTimer < BOT_STALK_MAX_SEC) {
          const behindX = stalk.x - stalk.facing * 0.9;
          input.crouch = true;
          input.sneak = true;
          BotWalkTo(state, bot, behindX, input);
          bot.stuckTimer = 0;
          bot.dashTo = null;
          return;
        }
      } else if (!stalk) {
        bot.stalkId = null;
        bot.stalkTimer = 0;
      }

      // 3b) 引不动也摸不上，就还是老办法：
      //     钻眼前的掩体 → 退到后面的掩体 → 退出视距 → 低头继续挪
      const here = BotCoverAt(state, p.x);
      if (here) {
        bot.hiding = true;
        MaybePress(state, bot, goal, input);
        return;
      }
      // 只有真被看见了才往回退。没被看见就原地低头等——
      // 否则会在相邻两个柴垛之间来回蹭，形成死循环，一步也前进不了。
      if (threat.exposed) {
        const back = BotCoverToward(state, -dirToGoal, threat);
        if (back) {
          input.crouch = false;
          input.sneak = false;
          BotWalkTo(state, bot, PropX(state, back), input);
          MaybePress(state, bot, goal, input);
          return;
        }
        const dir = BotRetreatDir(state, threat);
        if (dir !== 0) {
          input.moveX = dir;
          return;
        }
      }
      input.crouch = true;
      input.sneak = true;
      input.moveX = 0; // 蹲着等时机
      MaybePress(state, bot, goal, input);
      return;
    } else {
      bot.commitTimer = 0;
      bot.dashTo = null;
    }
  }

  bot.climbTargetY = undefined;

  // 走地板 + 钻竖井的路线由导航图算（会为了躲岗哨主动绕地道）
  if (hop && hop.kind === "shaft") {
    const shaft = hop.shaft;
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
    // 站到井口了：定好要去哪一头，然后一按到底
    const goDown = Math.abs(shaft.yBottom - p.y) > Math.abs(shaft.yTop - p.y);
    bot.climbTargetY = goDown ? shaft.yBottom : shaft.yTop;
    if (goDown) input.down = true;
    else input.up = true;
    return;
  }

  BotWalkTo(state, bot, localX, input);
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
  const dir = dx > 0 ? 1 : -1;
  input.moveX = dir;
  // 前方净空不够站着走 → 提前低头，否则会撞在矮口上
  const col = Column(state.level, p.x + dir * 0.95, p.y + 0.15, FLOOR_SNAP);
  if (col.clearance < HEADROOM.standNeeds) input.crouch = true;
}

function MaybePress(state, bot, goal, input, preferProp) {
  const prompt = CurrentPrompt(state);
  if (!prompt) return;
  if (preferProp && prompt.id !== preferProp.id && prompt.kind !== "hatch") return;
  if (!BotWantsPrompt(state, bot, prompt, goal)) return;
  input.interactPressed = true;
  bot.pressCooldown[prompt.id] = 0.6;
}
