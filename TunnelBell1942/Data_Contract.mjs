// 《地道战 · 钟声》—— 全模块共享常量。
//
// 这个文件是并行开发的公共地基：关卡、玩法、视觉、动画都从这里取数值。
// 它不 import 任何东西（three.js 也不行），保证纯 Node 可用。
// 改这里的数值等于改全局手感，改之前先确认没有模块在硬编码同名数字。

/** 深度层。渲染层按这些 z 摆放物件，玩法层只认 PLAY。
 *
 *  这些 z 在长焦透视下会产生真实的近大远小与视差（见 AGENTS.md 第 2.1 节），
 *  所以间距是有意义的，不是随手排的：改一个就会改变该层的视差速度和尺寸。 */
export const LAYER_Z = {
  FAR: -26,
  BACK: -14,
  MID: -6,
  PLAY: 0,
  FORE: 5,
};

/** 玩家体型与运动。单位：米 / 秒。 */
export const PLAYER = {
  width: 0.52,
  standHeight: 1.70,
  crouchHeight: 0.95,
  crawlHeight: 0.70,
  eyeHeight: 1.52,

  walkSpeed: 3.30,
  sneakSpeed: 1.45,
  crouchSpeed: 1.75,
  crawlSpeed: 1.30,
  climbSpeed: 2.15,
  dirtClimbSpeed: 1.25,

  accel: 26.0,
  decel: 34.0,
  gravity: 23.0,
  maxFallSpeed: 18.0,
  safeFallSpeed: 11.0,
};

/** 各动作产生的噪音（0..1）。敌人听觉拿它跟距离一起判定。 */
export const NOISE = {
  idle: 0.00,
  sneak: 0.06,
  crouch: 0.14,
  walk: 0.42,
  crawl: 0.10,
  land: 0.55,
  climb: 0.18,
  dig: 0.62,
  push: 0.70,
  lever: 0.35,
  call: 0.95,
  bell: 1.00,
};

/** 敌人感知。 */
export const SENSE = {
  /** 从看见到判定被抓要多久（秒）。给玩家反应窗口，这是手感底线。 */
  alertRiseSec: 1.25,
  /** 脱离视线后警觉衰减速度（每秒）。 */
  alertFallPerSec: 0.42,
  /** 进入 suspicious 的门槛。 */
  suspiciousAt: 0.28,
  /** 进入 search（主动往可疑点走）的门槛。 */
  searchAt: 0.62,
  /** 蹲下时被看见的概率折扣（乘在有效视距上）。 */
  crouchVisibility: 0.62,
  /** 潜行移动时的额外折扣。 */
  sneakVisibility: 0.78,
  /** 躲进道具里 = 完全不可见。 */
  hiddenVisibility: 0.0,
  /** 听觉：noise * hearing 半径内会引起怀疑。 */
  hearingScale: 1.0,
  /** 搜索状态下的移动速度倍率。 */
  searchSpeedScale: 1.45,
};

/** 摄像机。长焦透视，看向 -Z，只平移不旋转。 */
export const CAMERA = {
  /** 视场角（度）。窄 = 长焦 = 横版可读性。18–24 是安全区，
   *  调大会立刻出现广角畸变、竖直边缘外扩，横版当场穿帮。 */
  fovDeg: 20,
  /** 俯角（度，向下看）。0 = 纯水平。
   *  纯水平时地面只是一条边，看不见它往纵深退去，纵深感永远上不去。
   *  4–8° 会让地面展开成向后退的台面。硬上限 8：再大竖直线收敛就穿帮了。 */
  pitchDeg: 6,
  /** viewHeight 的语义是「z=0 玩法平面上的可视世界高度」，不是相机到近裁面的高度。
   *  玩法层的夹紧、机器人、冒烟测试全部建立在这个语义上。
   *  相机距离由此反推：dist = (viewHeight/2) / tan(fov/2)。 */
  viewHeight: 11.5,
  // 地道净空只有 1.78 米。9.0 的视口意味着画面里只有 19.8% 是能走的空间，
  // 上下 80% 全是实心土——收紧到 7.2 才谈得上"压迫感"而不是"埋在土里"。
  tunnelViewHeight: 7.2,
  // 摄像机在玩家头顶抬多少（分层，见 Script_Rules 的 targetY）
  surfaceLift: 2.0,          // 地表：把地平线压到画面下三分之一，村庄和天空拿回上 2/3
  tunnelLift: 0.55,          // 地道：净空居中
  followLerp: 4.6,           // 每秒的追踪强度
  deadzoneX: 1.1,
  deadzoneY: 0.9,
  lookAheadX: 2.2,           // 朝向前方的预视距离
  shakeDecay: 3.2,
  // 透视相机的 near 必须为正。默认 viewHeight 下相机距 z=0 约 32.6 米，
  // 最近的 FORE 层在 z=+5（距相机 27.6），最远的 FAR 在 z=-26（距 58.6）。
  near: 4,
  far: 260,
};

/** 危害蔓延。 */
export const HAZARD = {
  gasSpeed: 2.6,             // 毒烟每秒推进多少米
  waterSpeed: 1.9,
  gasLethalLevel: 0.85,      // 蔓延到这个浓度且玩家在范围内 → 失败
  warnLeadSec: 2.5,          // 危害启动前的预警时间
};

/** 互动。 */
export const INTERACT = {
  reach: 1.35,               // 玩家到互动点的水平距离阈值
  reachY: 1.6,               // 垂直阈值
  hatchOpenSec: 0.85,
  bellRingSec: 1.10,
  pushSpeed: 1.05,
  digSec: 1.60,
};

/** NPC 跟随。 */
export const FOLLOW = {
  spacing: 1.35,             // 队列里每个人的间距
  catchUpSpeed: 4.1,
  maxLag: 9.0,               // 落后超过这个距离会小跑
  arriveRadius: 1.2,
};

/** 时段配色。渲染层用它决定基调，关卡层用 timeOfDay 选。 */
export const PALETTE = {
  night: {
    sky: 0x0b1220,
    fogSurface: 0x121c2c,
    fogTunnel: 0x140d08,
    moon: 0xa9c4e8,
    moonIntensity: 0.95,
    ambientSurface: 0x2a3a52,
    ambientTunnel: 0x1a1008,
    ground: 0x2b3040,
    earth: 0x3a2a1c,
    earthLit: 0x6b4a2c,
    warmLight: 0xffb066,
  },
  dusk: {
    sky: 0x2a1c18,
    fogSurface: 0x3a281f,
    fogTunnel: 0x160e08,
    moon: 0xffb27a,
    moonIntensity: 1.05,
    ambientSurface: 0x4a3226,
    ambientTunnel: 0x1a1008,
    ground: 0x3d3228,
    earth: 0x3a2a1c,
    earthLit: 0x6b4a2c,
    warmLight: 0xffc07a,
  },
  dawn: {
    sky: 0x1a2436,
    fogSurface: 0x27384a,
    fogTunnel: 0x150e09,
    moon: 0xcfd9e8,
    moonIntensity: 1.0,
    ambientSurface: 0x39485c,
    ambientTunnel: 0x1b1109,
    ground: 0x333a44,
    earth: 0x3a2a1c,
    earthLit: 0x6b4a2c,
    warmLight: 0xffbe86,
  },
};

/** 玩家可携带的物品。一次只能一件。 */
export const ITEMS = {
  lantern: { label: "马灯", light: 6.2 },
  plug: { label: "木塞", light: 0 },
  shovel: { label: "铁锨", light: 0 },
  grain: { label: "粮袋", light: 0 },
  note: { label: "字条", light: 0 },
};

/** 地道净空判定：低于这个高度必须猫腰。 */
export const HEADROOM = {
  standNeeds: 1.78,
  crouchNeeds: 1.05,
  crawlNeeds: 0.62,
};

/** 确定性随机。所有模块都用它，禁止 Math.random()。 */
export function NextRandom(state) {
  // xorshift32，state 是一个 { seed:number } 或直接带 seed 字段的对象
  let x = state.seed | 0;
  if (x === 0) x = 0x9e3779b9;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  state.seed = x | 0;
  return ((x >>> 0) % 100000) / 100000;
}

export function Clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

export function Lerp(a, b, t) {
  return a + (b - a) * t;
}

/** 帧率无关的指数逼近。 */
export function Approach(current, target, perSecond, dt) {
  const t = 1 - Math.exp(-perSecond * dt);
  return current + (target - current) * t;
}
