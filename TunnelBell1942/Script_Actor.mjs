// 《地道战 · 钟声》—— 程序化角色与关节动画。
//
// 契约见 AGENTS.md 第 7 节。本文件只负责「搭骨架」和「摆姿势」，
// 不读也不写 state，不加载任何外部资源，不用 Math.random()。
//
// 设计要点：
//   1. 侧视 2.5D。角色本体朝 +X（右），所以矢状面（走、弯腰、抡臂）的旋转全在 Z 轴上。
//      Y 轴用于转身/扭腰，X 轴用于左右侧倾和手臂外展。
//   2. facing 用 group.rotation.y 翻面（不是 scale.x），
//      这样法线不会反、背上的枪和腰上的刀不会镜像穿帮——
//      所有不对称配件都按「身体本地坐标」摆放，转身后自动仍在正确的一侧。
//   3. 姿态用一维 Float32Array 通道表示（每个关节 6 个通道：rx ry rz + dx dy dz）。
//      混合、写回全是数值搬运，PoseActor 每帧零分配。
//
// 关节通道布局（人形 / 犬形共用同一套下标，方便复用混合机器）：
//   0 root   1 hip    2 torso  3 chest  4 neck   5 head
//   6 armL   7 foreL  8 handL     （犬：左前腿 上/下/爪）
//   9 armR  10 foreR 11 handR     （犬：右前腿 上/下/爪）
//  12 legL  13 shinL 14 footL     （犬：左后腿）
//  15 legR  16 shinR 17 footR     （犬：右后腿）
//  18 handItem（挂点：马灯/铁锨/粮袋）
//  19 propA （老忠—无 / 传宝—腰包 / 老人—拐棍 / 士兵—背枪 / 军官—佩刀 / 犬—尾巴）
//  20 propB （士兵、军官—手电挂点 / 犬—下颚）

import * as FallbackThree from './vendor/three/build/three.module.mjs';
import { PLAYER } from './Data_Contract.mjs';

// ——————————————————————————————————————————————————————————— 常量

const PI = Math.PI;
const TAU = PI * 2;

const CH = 6;              // 每关节通道数
const NJ = 21;             // 关节数（人形与犬形一致）
const NCH = NJ * CH;

const J_ROOT = 0;
const J_HIP = 1;
const J_TORSO = 2;
const J_CHEST = 3;
const J_NECK = 4;
const J_HEAD = 5;
const J_ARML = 6;
const J_FOREL = 7;
const J_HANDL = 8;
const J_ARMR = 9;
const J_FORER = 10;
const J_HANDR = 11;
const J_LEGL = 12;
const J_SHINL = 13;
const J_FOOTL = 14;
const J_LEGR = 15;
const J_SHINR = 16;
const J_FOOTR = 17;
const J_ITEM = 18;
const J_PROPA = 19;
const J_PROPB = 20;

// 体型与关键姿态高度全部从 Data_Contract.PLAYER 推导，改那边这边自动跟。
const ADULT = PLAYER.standHeight;                          // 1.70
const CROUCH_RATIO = PLAYER.crouchHeight / ADULT;          // 猫腰时的身高占比
const CRAWL_RATIO = PLAYER.crawlHeight / ADULT;            // 匍匐时的身高占比

/** 状态切换混合时长（秒）。AGENTS.md 7.1 规定 0.12。 */
const BLEND_SEC = 0.12;

/** 转身插值速率（每秒）。约 0.12 秒完成 180°。 */
const TURN_RATE = 26.0;

/** 模块级临时姿态缓冲。PoseActor 内同步使用，绝不逃逸，因此可以全局复用。 */
const scratch = new Float32Array(NCH);

// ——————————————————————————————————————————————————————————— 数学小工具（全部零分配）

function Clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function Clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

/** 平滑阶跃。 */
function Sm(u) {
  const t = Clamp01(u);
  return t * t * (3 - 2 * t);
}

/** 把 c 映射到 [a,b] 区间内的平滑 0..1，区间外夹紧。用来拼一次性动作的分段。 */
function Seg(c, a, b) {
  if (b <= a) return c >= b ? 1 : 0;
  return Sm((c - a) / (b - a));
}

/** 带「落脚停顿」的摆动：指数 < 1 会把正负峰变宽，脚落地时有微小驻留。 */
function Swing(p, e) {
  const s = Math.sin(p);
  const a = s < 0 ? -s : s;
  const v = Math.pow(a, e);
  return s < 0 ? -v : v;
}

/** 0..1 的窄脉冲，n 越大越尖。 */
function Pulse(v, n) {
  return v <= 0 ? 0 : Math.pow(v, n);
}

// ——————————————————————————————————————————————————————————— 姿态通道读写

function ClearPose(out) {
  for (let i = 0; i < NCH; i++) out[i] = 0;
}

function SetR(out, j, x, y, z) {
  const k = j * CH;
  out[k] = x;
  out[k + 1] = y;
  out[k + 2] = z;
}

function AddR(out, j, x, y, z) {
  const k = j * CH;
  out[k] += x;
  out[k + 1] += y;
  out[k + 2] += z;
}

function AddRz(out, j, z) {
  out[j * CH + 2] += z;
}

function SetRz(out, j, z) {
  out[j * CH + 2] = z;
}

function GetRz(out, j) {
  return out[j * CH + 2];
}

function AddP(out, j, x, y, z) {
  const k = j * CH + 3;
  out[k] += x;
  out[k + 1] += y;
  out[k + 2] += z;
}

// ——————————————————————————————————————————————————————————— 角色规格表
//
// 剪影优先：靠身高、体宽、驼背量、头身比和一件标志性配件区分，不靠贴图。

const SPECS = {
  // 高老忠：偏瘦、微驼、白羊肚手巾、长袄过膝，步子稳、摆臂小。
  laozhong: {
    height: ADULT * 0.976, build: 0.84, limb: 0.90, headScale: 1.00,
    thighRatio: 0.243, shinRatio: 0.237,
    stoop: -0.15, cadence: 0.90, stepAmp: 0.88, armSwing: 0.72,
    gown: true, towel: true, beard: false,
    col: { cloth: 0x2c3039, cloth2: 0x22262e, skin: 0x8a6a52, accent: 0xd2ccbb, metal: 0x777d86, dark: 0x171a21 },
  },
  // 高传宝：结实挺拔、短打、腰间别着东西，动作快、摆臂大。
  chuanbao: {
    height: ADULT * 1.024, build: 1.08, limb: 1.06, headScale: 0.97,
    thighRatio: 0.248, shinRatio: 0.240,
    stoop: -0.02, cadence: 1.14, stepAmp: 1.10, armSwing: 1.15,
    sash: true, pouch: true,
    col: { cloth: 0x333a45, cloth2: 0x22272f, skin: 0x93715a, accent: 0x5c4830, metal: 0x8a9099, dark: 0x14171d },
  },
  villager: {
    height: ADULT * 0.988, build: 0.98, limb: 1.00, headScale: 1.00,
    thighRatio: 0.245, shinRatio: 0.235,
    stoop: -0.07, cadence: 1.00, stepAmp: 0.98, armSwing: 0.95,
    cap: true,
    col: { cloth: 0x2f333c, cloth2: 0x262a32, skin: 0x8d6e57, accent: 0x8f8574, metal: 0x777d86, dark: 0x171a20 },
  },
  // 孩子：小、头大、腿短、动作碎（cadence 高、幅度小）。
  child: {
    height: ADULT * 0.647, build: 0.94, limb: 0.90, headScale: 1.44,
    thighRatio: 0.222, shinRatio: 0.212,
    stoop: -0.04, cadence: 1.58, stepAmp: 0.76, armSwing: 1.20,
    col: { cloth: 0x3b414d, cloth2: 0x2c313a, skin: 0x9a7860, accent: 0xa89a84, metal: 0x777d86, dark: 0x1a1e25 },
  },
  // 老人：驼得厉害、慢、拄棍。
  elder: {
    height: ADULT * 0.929, build: 0.80, limb: 0.86, headScale: 1.03,
    thighRatio: 0.240, shinRatio: 0.232,
    stoop: -0.32, cadence: 0.70, stepAmp: 0.60, armSwing: 0.45,
    gown: true, stick: true, beard: true,
    col: { cloth: 0x2a2e36, cloth2: 0x22262d, skin: 0x8a6d58, accent: 0xb9b3a5, metal: 0x777d86, dark: 0x171a20 },
  },
  // 日军士兵：军帽带屁帘、背长枪、步子方正（摆臂僵、步幅平）。
  soldier: {
    height: ADULT * 0.971, build: 1.05, limb: 1.04, headScale: 0.97,
    thighRatio: 0.245, shinRatio: 0.235,
    stoop: 0.00, cadence: 1.02, stepAmp: 1.02, armSwing: 0.80,
    capFlap: true, rifle: true, torch: true, boots: 0.55,
    col: { cloth: 0x39412f, cloth2: 0x2c3325, skin: 0x9c7b62, accent: 0x4b5238, metal: 0x8f959d, dark: 0x14150f },
  },
  // 山田：军官帽、马靴、佩刀、站得更直，走路慢而有压迫感。
  officer: {
    height: ADULT * 1.018, build: 1.00, limb: 1.00, headScale: 0.96,
    thighRatio: 0.246, shinRatio: 0.238,
    stoop: 0.05, cadence: 0.76, stepAmp: 0.94, armSwing: 0.55,
    peakCap: true, sword: true, torch: true, boots: 0.95, belt: true,
    col: { cloth: 0x323a33, cloth2: 0x272e28, skin: 0x9c7f68, accent: 0x5a4a2a, metal: 0x9aa2ab, dark: 0x101110 },
  },
  // 军犬：四足 rig，跟人形完全不同。height 是肩高。
  dog: {
    dog: true,
    height: ADULT * 0.412, build: 1.00, limb: 1.00, headScale: 1.00,
    thighRatio: 0.43, shinRatio: 0.37,
    stoop: 0.00, cadence: 1.30, stepAmp: 1.00, armSwing: 1.00,
    col: { cloth: 0x24262c, cloth2: 0x1b1d22, skin: 0x2a2c33, accent: 0x3a3d45, metal: 0x8f959d, dark: 0x0f1013 },
  },
};

const DEFAULT_KIND = 'villager';

function ResolveKind(kind) {
  return Object.prototype.hasOwnProperty.call(SPECS, kind) ? kind : DEFAULT_KIND;
}

// ——————————————————————————————————————————————————————————— 共享资源缓存
//
// 同一 kind 的所有 rig 共用几何与材质，用引用计数管理释放。
// 按 three 命名空间分桶，防止调用方传进来的 three 与本文件回退 import 的不是同一份。

const cacheByThree = new WeakMap();

function AcquireAssets(three, kind, spec) {
  let byKind = cacheByThree.get(three);
  if (!byKind) {
    byKind = new Map();
    cacheByThree.set(three, byKind);
  }
  let a = byKind.get(kind);
  if (!a) {
    a = spec.dog ? BuildDogAssets(three, spec) : BuildHumanAssets(three, spec);
    a.refs = 0;
    a.bucket = byKind;
    a.key = kind;
    byKind.set(kind, a);
  }
  a.refs++;
  return a;
}

function ReleaseAssets(a) {
  if (!a || a.released) return;
  a.refs--;
  if (a.refs > 0) return;
  a.released = true;
  for (let i = 0; i < a.list.length; i++) {
    const d = a.list[i];
    if (d && typeof d.dispose === 'function') d.dispose();
  }
  a.list.length = 0;
  if (a.bucket && a.bucket.get(a.key) === a) a.bucket.delete(a.key);
}

function Cap(three, list, radius, length) {
  const body = Math.max(0.0005, length - radius * 2);
  const g = new three.CapsuleGeometry(radius, body, 3, 8);
  list.push(g);
  return g;
}

function Lam(three, list, color) {
  const m = new three.MeshLambertMaterial({ color: color, flatShading: true });
  list.push(m);
  return m;
}

function BuildHumanAssets(three, sp) {
  const list = [];
  const h = sp.height;
  const lr = h * 0.036 * sp.build * sp.limb;
  const geo = {
    box: new three.BoxGeometry(1, 1, 1),
    sphere: new three.SphereGeometry(0.5, 12, 8),
    cyl: new three.CylinderGeometry(0.5, 0.5, 1, 8),
    upArm: null, foreArm: null, thigh: null, shin: null, torso: null, chest: null,
  };
  list.push(geo.box, geo.sphere, geo.cyl);
  geo.upArm = Cap(three, list, lr * 0.90, h * 0.175);
  geo.foreArm = Cap(three, list, lr * 0.80, h * 0.178);
  geo.thigh = Cap(three, list, lr * 1.28, h * sp.thighRatio);
  geo.shin = Cap(three, list, lr * 1.02, h * sp.shinRatio);
  geo.torso = Cap(three, list, lr * 1.9, h * 0.175);
  geo.chest = Cap(three, list, lr * 2.05, h * 0.165);

  const c = sp.col;
  const mat = {
    cloth: Lam(three, list, c.cloth),
    cloth2: Lam(three, list, c.cloth2),
    skin: Lam(three, list, c.skin),
    accent: Lam(three, list, c.accent),
    metal: Lam(three, list, c.metal),
    dark: Lam(three, list, c.dark),
  };
  return { geo: geo, mat: mat, list: list };
}

function BuildDogAssets(three, sp) {
  const list = [];
  const s = sp.height / 0.70;
  const geo = {
    box: new three.BoxGeometry(1, 1, 1),
    sphere: new three.SphereGeometry(0.5, 10, 7),
    cyl: new three.CylinderGeometry(0.5, 0.5, 1, 8),
    body: null, chest: null, legUp: null, legLow: null, neck: null, tail: null,
  };
  list.push(geo.box, geo.sphere, geo.cyl);
  geo.body = Cap(three, list, 0.115 * s, 0.56 * s);
  geo.chest = Cap(three, list, 0.125 * s, 0.26 * s);
  geo.legUp = Cap(three, list, 0.036 * s, 0.30 * s);
  geo.legLow = Cap(three, list, 0.032 * s, 0.26 * s);
  geo.neck = Cap(three, list, 0.058 * s, 0.17 * s);
  geo.tail = Cap(three, list, 0.024 * s, 0.30 * s);

  const c = sp.col;
  const mat = {
    cloth: Lam(three, list, c.cloth),
    cloth2: Lam(three, list, c.cloth2),
    skin: Lam(three, list, c.skin),
    accent: Lam(three, list, c.accent),
    metal: Lam(three, list, c.metal),
    dark: Lam(three, list, c.dark),
  };
  return { geo: geo, mat: mat, list: list };
}

// ——————————————————————————————————————————————————————————— 装配小工具

function Joint(three, parent, x, y, z) {
  const o = new three.Object3D();
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}

/** 叶子网格。绝不把关节挂在网格下面，所以 mesh.scale 可以随便用。 */
function Part(three, parent, geo, mat, sx, sy, sz, x, y, z) {
  const m = new three.Mesh(geo, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = false;
  parent.add(m);
  return m;
}

/** 直接用真实尺寸的胶囊：几何自带长度，只摆位置。 */
function Limb(three, parent, geo, mat, len) {
  const m = new three.Mesh(geo, mat);
  m.position.set(0, -len * 0.5, 0);
  m.castShadow = true;
  parent.add(m);
  return m;
}

// ——————————————————————————————————————————————————————————— 人形装配

function BuildHuman(three, kind, sp, assets) {
  const g = assets.geo;
  const m = assets.mat;
  const h = sp.height;
  const bd = sp.build;

  // 比例全部从 height 推导，并且反过来保证「脚正好踩在 y=0」：
  // 胯高 = 踝高 + 小腿 + 大腿，剩下的高度分给脊柱，头顶正好落在 height 上。
  const thighL = h * sp.thighRatio;
  const shinL = h * sp.shinRatio;
  const ankleY = h * 0.033;
  const hipY = ankleY + shinL + thighL;
  const headR = h * 0.068 * sp.headScale;
  const headOver = headR * 1.995;                     // 颈根到头顶
  let spineTotal = h - hipY - headOver;
  if (spineTotal < h * 0.18) spineTotal = h * 0.18;
  const torsoL = spineTotal * 0.455;
  const chestL = spineTotal * 0.415;
  const neckL = spineTotal * 0.130;
  const upArmL = h * 0.175;
  const foreL = h * 0.155;
  const shW = h * 0.098 * bd;          // 肩半宽（z 向）
  const hipW = h * 0.062 * bd;
  const bodyD = h * 0.105 * bd;        // 躯干厚度（z）
  const bodyW = h * 0.125 * bd;        // 躯干宽度（x，侧视看到的厚度）

  const group = new three.Object3D();
  const root = Joint(three, group, 0, 0, 0);

  // —— 骨盆 ——
  const hip = Joint(three, root, 0, hipY, 0);
  Part(three, hip, g.box, m.cloth2, bodyW * 0.92, h * 0.085, bodyD * 1.9, 0, -h * 0.028, 0);

  // —— 脊柱 ——
  const torso = Joint(three, hip, 0, 0, 0);
  const torsoMesh = new three.Mesh(g.torso, m.cloth);
  torsoMesh.position.set(0, torsoL * 0.5, 0);
  torsoMesh.scale.set(1.0, 1.0, 1.62);
  torsoMesh.castShadow = true;
  torso.add(torsoMesh);

  const chest = Joint(three, torso, 0, torsoL, 0);
  const chestMesh = new three.Mesh(g.chest, m.cloth);
  chestMesh.position.set(0, chestL * 0.5, 0);
  chestMesh.scale.set(1.0, 1.0, 1.72);
  chestMesh.castShadow = true;
  chest.add(chestMesh);

  const neck = Joint(three, chest, 0, chestL, 0);
  Part(three, neck, g.cyl, m.skin, h * 0.038, neckL * 1.25, h * 0.038, 0, neckL * 0.4, 0);

  const head = Joint(three, neck, 0, neckL, 0);
  Part(three, head, g.sphere, m.skin, headR * 1.75, headR * 2.15, headR * 1.72,
    h * 0.006, headR * 0.92, 0);

  // —— 头部标志物（全部按身体本地坐标摆放，+X 就是「前」）——
  if (sp.towel) {
    // 白羊肚手巾：包住头顶，前额打结（结在 +X，转身后仍在脸前）。
    Part(three, head, g.box, m.accent, headR * 1.95, headR * 1.05, headR * 1.95,
      0, headR * 1.62, 0);
    Part(three, head, g.box, m.accent, headR * 0.85, headR * 0.62, headR * 0.55,
      headR * 0.98, headR * 1.85, 0);
  }
  if (sp.cap) {
    Part(three, head, g.box, m.accent, headR * 1.9, headR * 0.55, headR * 1.85,
      headR * 0.1, headR * 1.75, 0);
  }
  if (sp.capFlap) {
    // 军帽 + 屁帘（脑后垂布）。
    Part(three, head, g.box, m.cloth2, headR * 1.95, headR * 0.72, headR * 1.9,
      0, headR * 1.72, 0);
    Part(three, head, g.box, m.cloth2, headR * 0.75, headR * 0.35, headR * 1.6,
      headR * 1.25, headR * 1.60, 0);                      // 帽檐
    Part(three, head, g.box, m.accent, headR * 0.28, headR * 1.05, headR * 1.9,
      -headR * 1.05, headR * 0.95, 0);                     // 屁帘
  }
  if (sp.peakCap) {
    Part(three, head, g.box, m.dark, headR * 1.98, headR * 0.85, headR * 1.95,
      0, headR * 1.78, 0);
    Part(three, head, g.box, m.dark, headR * 1.05, headR * 0.22, headR * 1.7,
      headR * 1.35, headR * 1.50, 0);                      // 硬帽檐
  }
  if (sp.beard) {
    Part(three, head, g.box, m.accent, headR * 0.72, headR * 1.0, headR * 0.9,
      headR * 0.92, -headR * 0.35, 0);
  }

  // —— 手臂 ——
  const armL = Joint(three, chest, 0, chestL * 0.86, -shW);
  Limb(three, armL, g.upArm, m.cloth, upArmL);
  const forL = Joint(three, armL, 0, -upArmL, 0);
  Limb(three, forL, g.foreArm, m.cloth, foreL + h * 0.023);   // 多出来那一截就是拳头
  const handL = Joint(three, forL, 0, -foreL, 0);

  const armR = Joint(three, chest, 0, chestL * 0.86, shW);
  Limb(three, armR, g.upArm, m.cloth, upArmL);
  const forR = Joint(three, armR, 0, -upArmL, 0);
  Limb(three, forR, g.foreArm, m.cloth, foreL + h * 0.023);
  const handR = Joint(three, forR, 0, -foreL, 0);

  // 手不单独出网格：前臂胶囊的圆端就当拳头，省两个 draw call。

  // 携带物挂点：右手心，物体从这里往下垂。
  const handItem = Joint(three, handR, h * 0.02, -h * 0.045, 0);

  // —— 腿 ——
  const bootH = sp.boots ? sp.boots : 0;
  const shinMat = bootH > 0.6 ? m.dark : m.cloth2;

  const legL = Joint(three, hip, 0, 0, -hipW);
  Limb(three, legL, g.thigh, m.cloth2, thighL);
  const shinLj = Joint(three, legL, 0, -thighL, 0);
  const shinLm = Limb(three, shinLj, g.shin, shinMat, shinL);
  const footL = Joint(three, shinLj, 0, -shinL, 0);
  Part(three, footL, g.box, m.dark, h * 0.095, ankleY * 1.9, h * 0.048, h * 0.020, -ankleY * 0.55, 0);

  const legR = Joint(three, hip, 0, 0, hipW);
  Limb(three, legR, g.thigh, m.cloth2, thighL);
  const shinRj = Joint(three, legR, 0, -thighL, 0);
  const shinRm = Limb(three, shinRj, g.shin, shinMat, shinL);
  const footR = Joint(three, shinRj, 0, -shinL, 0);
  Part(three, footR, g.box, m.dark, h * 0.095, ankleY * 1.9, h * 0.048, h * 0.020, -ankleY * 0.55, 0);

  if (bootH > 0) {
    shinLm.scale.set(1.14, 1.0, 1.14);
    shinRm.scale.set(1.14, 1.0, 1.14);
  }

  // —— 衣着轮廓（决定剪影的关键块）——
  if (sp.sash) {
    Part(three, hip, g.box, m.accent, bodyW * 1.02, h * 0.045, bodyD * 2.02, 0, h * 0.012, 0);
  }
  if (sp.belt) {
    Part(three, hip, g.box, m.dark, bodyW * 1.04, h * 0.036, bodyD * 2.04, 0, h * 0.02, 0);
    // 军官的斜挎皮带
    Part(three, chest, g.box, m.dark, bodyW * 0.30, chestL * 1.5, bodyD * 0.30,
      bodyW * 0.42, chestL * 0.45, -shW * 0.42);
  }

  // —— 配件关节（propA / propB）——
  let propA;
  let propB;
  let lightMount = null;

  if (sp.rifle) {
    // 三八式长枪斜挎在右肩背后：枪口朝后上方，跟着躯干走。
    propA = Joint(three, chest, -bodyW * 0.42, chestL * 0.35, shW * 0.52);
    propA.rotation.set(0, 0, -0.55);
    Part(three, propA, g.cyl, m.dark, h * 0.017, h * 0.50, h * 0.017, 0, h * 0.09, 0);      // 枪身
    Part(three, propA, g.box, m.cloth2, h * 0.042, h * 0.17, h * 0.028, 0, -h * 0.22, 0);   // 枪托
    Part(three, propA, g.cyl, m.metal, h * 0.009, h * 0.13, h * 0.009, 0, h * 0.40, 0);     // 刺刀
  } else if (sp.sword) {
    // 佩刀挂左胯，刀尖朝后下。
    propA = Joint(three, hip, -h * 0.03, -h * 0.02, -hipW * 1.15);
    propA.rotation.set(0, 0, 0.62);
    Part(three, propA, g.cyl, m.metal, h * 0.014, h * 0.40, h * 0.014, 0, -h * 0.19, 0);
    Part(three, propA, g.box, m.dark, h * 0.028, h * 0.10, h * 0.022, 0, h * 0.03, 0);
  } else if (sp.stick) {
    // 拐棍握在左手里。
    propA = Joint(three, handL, h * 0.01, -h * 0.03, 0);
    Part(three, propA, g.cyl, m.accent, h * 0.016, h * 0.50, h * 0.016, 0, -h * 0.20, 0);
  } else if (sp.pouch) {
    // 腰间别着的木塞/手榴弹袋——高传宝的辨识点。
    propA = Joint(three, hip, h * 0.045, -h * 0.005, hipW * 0.95);
    Part(three, propA, g.box, m.accent, h * 0.055, h * 0.085, h * 0.045, 0, -h * 0.03, 0);
  } else {
    propA = Joint(three, hip, 0, 0, 0);
  }

  if (sp.torch) {
    // 手电：握在左手，朝身体本地 +X（正前方）。转身由 group.rotation.y 处理，方向自然正确。
    propB = Joint(three, handL, h * 0.02, -h * 0.05, 0);
    Part(three, propB, g.cyl, m.metal, h * 0.024, h * 0.075, h * 0.024, 0, 0, 0);
    lightMount = new three.Object3D();
    lightMount.position.set(h * 0.06, 0, 0);
    propB.add(lightMount);
  } else if (sp.gown) {
    // 长袄／棉袍：挂在骨盆下的独立关节上，盖到膝，把上腿藏掉，剪影立刻变「老乡」。
    // 用独立关节是为了让下摆能跟着大腿走，蹲下、伏地时不会插进土里。
    propB = Joint(three, hip, 0, 0, 0);
    Part(three, propB, g.box, m.cloth, bodyW * 1.18, h * 0.29, bodyD * 2.05, 0, -h * 0.140, 0);
  } else {
    propB = Joint(three, chest, 0, 0, 0);
  }

  const joints = {
    root: root, hip: hip, torso: torso, chest: chest, neck: neck, head: head,
    armL: armL, foreL: forL, handL: handL,
    armR: armR, foreR: forR, handR: handR,
    legL: legL, shinL: shinLj, footL: footL,
    legR: legR, shinR: shinRj, footR: footR,
    handItem: handItem, propA: propA, propB: propB,
    lightMount: lightMount,
  };

  // 挂件从挂点往下伸多长（佩刀 / 拐棍 / 长袄下摆防穿地要用）
  const propDrop = sp.sword ? h * 0.40 : sp.stick ? h * 0.46 : h * 0.30;
  const gownDrop = h * 0.288;

  const list = [
    root, hip, torso, chest, neck, head,
    armL, forL, handL, armR, forR, handR,
    legL, shinLj, footL, legR, shinRj, footR,
    handItem, propA, propB,
  ];

  return {
    group: group, joints: joints, jointList: list,
    thighLen: thighL, shinLen: shinL, torsoLen: torsoL, chestLen: chestL,
    upArmLen: upArmL, foreArmLen: foreL, hipY: hipY,
    propDrop: propDrop, gownDrop: gownDrop,
  };
}

// ——————————————————————————————————————————————————————————— 犬形装配

function BuildDog(three, sp, assets) {
  const g = assets.geo;
  const m = assets.mat;
  const s = sp.height / 0.70;

  const legUp = 0.30 * s;
  const legLow = 0.26 * s;
  const backY = 0.62 * s;
  const hipX = -0.26 * s;
  const chestX = 0.30 * s;

  const group = new three.Object3D();
  const root = Joint(three, group, 0, 0, 0);

  // 胯（后半身）
  const hip = Joint(three, root, hipX, backY, 0);
  Part(three, hip, g.box, m.cloth, 0.22 * s, 0.24 * s, 0.24 * s, -0.02 * s, -0.05 * s, 0);

  // 脊柱：水平向 +X 延伸
  const torso = Joint(three, hip, 0, 0, 0);
  const bodyMesh = new three.Mesh(g.body, m.cloth);
  bodyMesh.rotation.z = -PI * 0.5;                     // 胶囊竖着做的，转成水平
  bodyMesh.position.set(chestX * 0.5, -0.02 * s, 0);
  bodyMesh.scale.set(1.0, 1.0, 1.05);
  bodyMesh.castShadow = true;
  torso.add(bodyMesh);

  const chest = Joint(three, torso, chestX, 0.015 * s, 0);
  const chestMesh = new three.Mesh(g.chest, m.cloth);
  chestMesh.rotation.z = -PI * 0.5;
  chestMesh.position.set(0.02 * s, -0.03 * s, 0);
  chestMesh.scale.set(1.0, 1.0, 1.02);
  chestMesh.castShadow = true;
  chest.add(chestMesh);

  // 脖子向前上方
  const neck = Joint(three, chest, 0.11 * s, 0.055 * s, 0);
  neck.rotation.z = -0.95;
  const neckMesh = new three.Mesh(g.neck, m.cloth);
  neckMesh.position.set(0, -0.085 * s, 0);
  neckMesh.rotation.z = PI;                            // 让胶囊朝「上」（沿脖子方向）
  neckMesh.castShadow = true;
  neck.add(neckMesh);

  const head = Joint(three, neck, 0, 0.19 * s, 0);
  head.rotation.z = 0.95;                              // 抵消脖子倾角，头保持水平
  Part(three, head, g.box, m.cloth, 0.20 * s, 0.15 * s, 0.145 * s, 0.02 * s, 0.0, 0);
  Part(three, head, g.box, m.cloth2, 0.16 * s, 0.085 * s, 0.095 * s, 0.16 * s, -0.028 * s, 0);  // 吻部
  // 立耳（左右各一，尖朝上后）
  Part(three, head, g.box, m.cloth2, 0.035 * s, 0.10 * s, 0.055 * s, -0.045 * s, 0.10 * s, -0.052 * s);
  Part(three, head, g.box, m.cloth2, 0.035 * s, 0.10 * s, 0.055 * s, -0.045 * s, 0.10 * s, 0.052 * s);

  // 下颚（张嘴吠叫用）
  const jaw = Joint(three, head, 0.09 * s, -0.045 * s, 0);
  Part(three, jaw, g.box, m.dark, 0.14 * s, 0.038 * s, 0.085 * s, 0.075 * s, -0.012 * s, 0);

  // 嘴里的携带挂点（叼东西）
  const handItem = Joint(three, head, 0.24 * s, -0.045 * s, 0);

  // 尾巴
  const tail = Joint(three, hip, -0.10 * s, 0.07 * s, 0);
  tail.rotation.z = -2.35;                             // 向后上方翘
  const tailMesh = new three.Mesh(g.tail, m.cloth2);
  tailMesh.position.set(0, -0.15 * s, 0);
  tailMesh.castShadow = true;
  tail.add(tailMesh);

  const zw = 0.075 * s;

  function MakeLeg(parent, x, z) {
    const up = Joint(three, parent, x, -0.06 * s, z);
    Limb(three, up, g.legUp, m.cloth2, legUp);
    const low = Joint(three, up, 0, -legUp, 0);
    Limb(three, low, g.legLow, m.cloth2, legLow);
    const paw = Joint(three, low, 0, -legLow, 0);
    return { up: up, low: low, paw: paw };
  }

  const fl = MakeLeg(chest, 0.02 * s, -zw);
  const fr = MakeLeg(chest, 0.02 * s, zw);
  const bl = MakeLeg(hip, -0.02 * s, -zw);
  const br = MakeLeg(hip, -0.02 * s, zw);

  const joints = {
    root: root, hip: hip, torso: torso, chest: chest, neck: neck, head: head,
    armL: fl.up, foreL: fl.low, handL: fl.paw,
    armR: fr.up, foreR: fr.low, handR: fr.paw,
    legL: bl.up, shinL: bl.low, footL: bl.paw,
    legR: br.up, shinR: br.low, footR: br.paw,
    handItem: handItem, propA: tail, propB: jaw,
    // 犬形别名，渲染层用得上
    legFL: fl.up, legFR: fr.up, legBL: bl.up, legBR: br.up,
    tail: tail, jaw: jaw, lightMount: null,
  };

  const list = [
    root, hip, torso, chest, neck, head,
    fl.up, fl.low, fl.paw, fr.up, fr.low, fr.paw,
    bl.up, bl.low, bl.paw, br.up, br.low, br.paw,
    handItem, tail, jaw,
  ];

  return {
    group: group, joints: joints, jointList: list,
    thighLen: legUp, shinLen: legLow, torsoLen: 0.56 * s, chestLen: 0.26 * s,
    upArmLen: legUp, foreArmLen: legLow, hipY: backY, chestX: chestX,
  };
}

// ——————————————————————————————————————————————————————————— CreateActorRig

/**
 * 建一个角色 rig。
 * @param {string} kind  "laozhong"|"chuanbao"|"villager"|"child"|"elder"|"soldier"|"officer"|"dog"
 * @param {object} three 调用方的 three 命名空间；不传则用本文件回退 import 的那份。
 */
export function CreateActorRig(kind, three) {
  const T = three || FallbackThree;
  const k = ResolveKind(kind);
  const sp = SPECS[k];
  const assets = AcquireAssets(T, k, sp);
  const built = sp.dog ? BuildDog(T, sp, assets) : BuildHuman(T, k, sp, assets);

  const list = built.jointList;
  const rest = new Float32Array(NJ * 3);
  const restRot = new Float32Array(NJ * 3);
  for (let j = 0; j < NJ; j++) {
    const o = list[j];
    const m = j * 3;
    if (o) {
      rest[m] = o.position.x;
      rest[m + 1] = o.position.y;
      rest[m + 2] = o.position.z;
      restRot[m] = o.rotation.x;
      restRot[m + 1] = o.rotation.y;
      restRot[m + 2] = o.rotation.z;
    }
  }

  const rig = {
    kind: k,
    height: sp.height,
    group: built.group,
    joints: built.joints,
    jointList: list,
    spec: sp,
    assets: assets,
    three: T,
    isDog: !!sp.dog,

    // 骨段长度，姿态函数用来算胯部下沉，保证脚不穿地。
    thighLen: built.thighLen,
    shinLen: built.shinLen,
    legFull: built.thighLen + built.shinLen,
    torsoLen: built.torsoLen,
    chestLen: built.chestLen,
    chestX: built.chestX || 0,
    propDrop: built.propDrop || sp.height * 0.30,
    gownDrop: built.gownDrop || sp.height * 0.28,
    upArmLen: built.upArmLen,
    foreArmLen: built.foreArmLen,
    hipY: built.hipY,

    // 姿态与混合状态（每个 rig 独立，多角色互不干扰）
    rest: rest,
    restRot: restRot,
    applied: new Float32Array(NCH),
    blendFrom: new Float32Array(NCH),
    blendW: 1,
    animName: null,
    phase: 0,
    stateT: 0,
    lastTime: -1,
    yaw: 0,
    yawInit: false,
    disposed: false,
  };

  // 初始化成 idle，第一帧混合有个合理的起点。
  PoseFor(scratch, rig, 'idle', 0, 0, 0, 0);
  rig.applied.set(scratch);
  rig.blendFrom.set(scratch);
  ApplyPose(rig);
  return rig;
}

/** 释放 rig：脱离父节点、递减共享资源引用、断开引用防止泄漏。 */
export function DisposeRig(rig) {
  if (!rig || rig.disposed) return;
  rig.disposed = true;
  if (rig.group && rig.group.parent) rig.group.parent.remove(rig.group);
  ReleaseAssets(rig.assets);
  rig.assets = null;
  rig.jointList = null;
  rig.joints = null;
  rig.group = null;
}

// ——————————————————————————————————————————————————————————— 写回

function ApplyPose(rig) {
  const a = rig.applied;
  const rest = rig.rest;
  const rr = rig.restRot;
  const list = rig.jointList;
  for (let j = 0; j < NJ; j++) {
    const o = list[j];
    if (!o) continue;
    const k = j * CH;
    const m = j * 3;
    o.rotation.set(rr[m] + a[k], rr[m + 1] + a[k + 1], rr[m + 2] + a[k + 2]);
    o.position.set(rest[m] + a[k + 3], rest[m + 1] + a[k + 4], rest[m + 2] + a[k + 5]);
  }
}

// ——————————————————————————————————————————————————————————— 状态名规范化

function NormalizeAnim(name) {
  switch (name) {
    case 'idle':
    case 'walk':
    case 'sneak':
    case 'crouchIdle':
    case 'crawl':
    case 'climb':
    case 'fall':
    case 'land':
    case 'use':
    case 'dig':
    case 'push':
    case 'ring':
    case 'hide':
    case 'call':
    case 'caught':
    case 'dead':
    case 'carryIdle':
    case 'carryWalk':
      return name;
    default:
      return 'idle';
  }
}

/** 各状态的步频（弧度/秒）。 */
function Cadence(name, speed, sp) {
  switch (name) {
    case 'walk':
    case 'carryWalk':
      return TAU * (0.52 + 1.05 * speed) * sp.cadence;
    case 'sneak':
      return TAU * (0.30 + 0.58 * speed) * sp.cadence;
    case 'crawl':
      return TAU * (0.34 + 0.66 * speed) * sp.cadence;
    case 'climb':
      return TAU * (0.40 + 0.68 * speed) * sp.cadence;
    case 'push':
      return TAU * (0.24 + 0.36 * speed);
    case 'dig':
      return TAU * 0.55;
    case 'fall':
      return TAU * 1.4;
    default:
      return TAU * 0.42;
  }
}

/** 给定大小腿角度，算胯部要下沉多少才让脚还踩在地上。 */
function HipDrop(rig, thighZ, shinZ) {
  return rig.thighLen * Math.cos(thighZ) + rig.shinLen * Math.cos(thighZ + shinZ) - rig.legFull;
}

// ——————————————————————————————————————————————————————————— PoseActor

/**
 * 每帧摆一次姿势。零分配：所有临时量都在模块级 / rig 上预分配。
 * @param {object} rig    CreateActorRig 的返回值
 * @param {object} anim   { name, t, speed }，形状同 state.player.anim
 * @param {number} facing +1 朝右 / -1 朝左
 * @param {number} time   全局累计秒数（用于确定性抖动，替代 Math.random）
 */
export function PoseActor(rig, anim, facing, time) {
  if (!rig || rig.disposed || !rig.jointList) return;

  const now = typeof time === 'number' && time === time ? time : 0;
  let dt = now - rig.lastTime;
  if (rig.lastTime < 0 || !(dt > 0)) dt = 0;
  if (dt > 0.1) dt = 0.1;
  rig.lastTime = now;

  const name = NormalizeAnim(anim ? anim.name : null);

  let speed = 0;
  if (anim && typeof anim.speed === 'number' && anim.speed === anim.speed) {
    speed = Clamp(anim.speed, 0, 2);
  }

  // —— 状态切换：把「当前已应用的姿态」冻成混合起点 ——
  if (name !== rig.animName) {
    rig.blendFrom.set(rig.applied);
    rig.blendW = 0;
    rig.animName = name;
    rig.stateT = 0;
  }
  rig.stateT += dt;
  rig.blendW = rig.blendW + dt / BLEND_SEC;
  if (rig.blendW > 1) rig.blendW = 1;

  // —— 状态内计时：优先信任 Rules 给的 anim.t ——
  let at = rig.stateT;
  if (anim && typeof anim.t === 'number' && anim.t === anim.t && anim.t >= 0 && anim.t < 1e6) {
    at = anim.t;
  }

  // —— 步相位：按状态步频累积，换速不跳变 ——
  rig.phase += dt * Cadence(name, speed, rig.spec);
  if (rig.phase > TAU) rig.phase -= TAU * Math.floor(rig.phase / TAU);
  else if (rig.phase < 0) rig.phase = 0;

  // —— 目标姿态 → 与混合起点插值 → 写回 ——
  PoseFor(scratch, rig, name, at, rig.phase, now, speed);

  const w = Sm(rig.blendW);
  const app = rig.applied;
  const from = rig.blendFrom;
  for (let i = 0; i < NCH; i++) {
    app[i] = from[i] + (scratch[i] - from[i]) * w;
  }
  ApplyPose(rig);

  // —— 转身：rotation.y 翻面，不用 scale.x，避免法线翻转与配件镜像 ——
  const targetYaw = facing < 0 ? PI : 0;
  if (!rig.yawInit) {
    rig.yaw = targetYaw;
    rig.yawInit = true;
  } else if (rig.yaw !== targetYaw) {
    let d = targetYaw - rig.yaw;
    while (d > PI) d -= TAU;
    while (d < -PI) d += TAU;
    if (dt <= 0) {
      // 没有时间推进就别动，等下一帧
    } else {
      const k = 1 - Math.exp(-TURN_RATE * dt);
      rig.yaw += d * k;
      if (Math.abs(targetYaw - rig.yaw) < 0.01) rig.yaw = targetYaw;
    }
  }
  rig.group.rotation.y = rig.yaw;
}

function PoseFor(out, rig, name, at, p, time, speed) {
  if (rig.isDog) PoseDog(out, rig, name, at, p, time, speed);
  else PoseHuman(out, rig, name, at, p, time, speed);
}

// ——————————————————————————————————————————————————————————— 人形姿态
//
// 约定：+rz = 肢体向前（+X）摆；躯干前倾是 -rz；头抬起是 +rz。
//       +rx = 左臂外展 / 身体右倾；ry = 扭腰、转头。

function HumanBase(out, rig) {
  const sp = rig.spec;
  ClearPose(out);
  // 静止体态偏置：驼背量决定剪影里最重要的一条线。
  SetRz(out, J_TORSO, sp.stoop * 0.55);
  SetRz(out, J_CHEST, sp.stoop * 0.32);
  SetRz(out, J_HEAD, -sp.stoop * 0.62);
  SetR(out, J_ARML, 0.09, 0, 0.05);
  SetR(out, J_ARMR, -0.09, 0, 0.05);
  SetRz(out, J_FOREL, 0.17);
  SetRz(out, J_FORER, 0.17);
  SetRz(out, J_LEGL, 0.02);
  SetRz(out, J_LEGR, 0.02);
  SetRz(out, J_SHINL, -0.06);
  SetRz(out, J_SHINR, -0.06);
  SetRz(out, J_FOOTL, 0.04);
  SetRz(out, J_FOOTR, 0.04);
}

function PoseHuman(out, rig, name, at, p, time, speed) {
  const sp = rig.spec;
  const h = rig.height;
  HumanBase(out, rig);

  switch (name) {

    // —————————————————————————— 站立
    case 'idle': {
      const br = Math.sin(time * 1.15);
      const sway = Math.sin(time * 0.37) + 0.4 * Math.sin(time * 0.83 + 1.1);
      AddRz(out, J_CHEST, br * 0.022);
      AddP(out, J_ROOT, 0, h * 0.004 * br, 0);
      AddR(out, J_HIP, sway * 0.020, sway * 0.026, 0);
      AddR(out, J_HEAD, 0, sway * 0.10 + (sp.rifle || sp.sword ? Math.sin(time * 0.41) * 0.30 : 0),
        Math.sin(time * 0.61) * 0.035);
      AddRz(out, J_ARML, br * 0.020 - 0.03);
      AddRz(out, J_ARMR, -br * 0.020 - 0.03);
      if (sp.stick) {
        // 老人拄棍站着：左臂前伸压在棍上。
        SetR(out, J_ARML, 0.05, 0, 0.62);
        SetRz(out, J_FOREL, -0.18);
        AddR(out, J_HIP, 0.04, 0, 0);
      }
      if (sp.sword) {
        // 军官背手站姿，压迫感靠这个。
        SetR(out, J_ARML, 0.18, 0, -0.55);
        SetR(out, J_ARMR, -0.18, 0, -0.55);
        SetRz(out, J_FOREL, -0.95);
        SetRz(out, J_FORER, -0.95);
      }
      break;
    }

    // —————————————————————————— 行走（有重量）
    case 'walk':
    case 'carryWalk': {
      const carry = name === 'carryWalk';
      const stride = sp.stepAmp * (0.55 + 0.45 * speed);
      const sL = Swing(p, 0.70);
      const sR = Swing(p + PI, 0.70);
      const cL = Math.cos(p);
      const cR = Math.cos(p + PI);

      const thL = stride * 0.62 * sL;
      const thR = stride * 0.62 * sR;
      const knL = -(0.11 + 0.95 * stride * Math.max(0, cL));
      const knR = -(0.11 + 0.95 * stride * Math.max(0, cR));
      AddRz(out, J_LEGL, thL);
      AddRz(out, J_LEGR, thR);
      AddRz(out, J_SHINL, knL);
      AddRz(out, J_SHINR, knR);
      // 脚掌：站立相保持贴地，蹬地相补一点推力。
      AddRz(out, J_FOOTL, Clamp(-(thL + knL) + 0.34 * stride * Math.max(0, -Math.cos(p + 0.55)), -0.75, 0.75));
      AddRz(out, J_FOOTR, Clamp(-(thR + knR) + 0.34 * stride * Math.max(0, -Math.cos(p + PI + 0.55)), -0.75, 0.75));

      // 躯干起伏：双频（每步一次），落脚瞬间额外下沉 —— 这是「重量」的来源。
      const dip = Pulse(Math.max(0, -Math.cos(2 * p)), 3);
      AddP(out, J_ROOT, 0, h * stride * (0.0085 * Math.cos(2 * p) - 0.0125 * dip), 0);
      // 骨盆侧倾（摆动腿那侧掉下去）
      AddR(out, J_HIP, 0.055 * stride * Math.sin(p), 0.11 * stride * Math.sin(p), 0);
      AddRz(out, J_TORSO, -0.10 * speed - 0.02 * stride * Math.cos(2 * p));
      AddR(out, J_CHEST, 0, -0.17 * stride * Math.sin(p), 0);
      // 头部滞后：比肩带晚约 0.9 弧度，落脚时轻轻点一下。
      AddR(out, J_HEAD, 0, 0.10 * stride * Math.sin(p - 0.9), 0.055 * Math.cos(2 * p - 1.0) * stride);

      const aw = sp.armSwing * stride;
      const swL = -0.52 * aw * Math.sin(p);
      const swR = 0.52 * aw * Math.sin(p);
      AddRz(out, J_ARML, swL);
      AddRz(out, J_ARMR, swR);
      AddRz(out, J_FOREL, 0.16 + 0.34 * Math.max(0, swL));
      AddRz(out, J_FORER, 0.16 + 0.34 * Math.max(0, swR));

      if (sp.stick) {
        // 拐棍随右脚落地点地，左臂几乎不摆。
        SetR(out, J_ARML, 0.05, 0, 0.52 + 0.10 * Math.sin(p + PI));
        SetRz(out, J_FOREL, -0.20);
      }
      if (sp.rifle) {
        // 士兵：摆臂僵直，肘不太弯，步子方正。
        SetRz(out, J_FOREL, 0.08 + 0.12 * Math.max(0, swL));
        SetRz(out, J_FORER, 0.08 + 0.12 * Math.max(0, swR));
      }
      if (sp.sword) {
        // 山田：左手压刀柄，右手背在身后，走得慢而稳。
        SetR(out, J_ARML, 0.10, 0, 0.30);
        SetRz(out, J_FOREL, -0.55);
        AddRz(out, J_ARMR, -0.15);
      }
      if (carry) {
        // 提着东西：右臂垂直、肘微僵，身体向反侧代偿。
        SetR(out, J_ARMR, -0.16, 0, 0.05 + 0.07 * Math.sin(p - 0.6));
        SetRz(out, J_FORER, 0.12);
        AddR(out, J_TORSO, -0.075, 0, 0);
        AddR(out, J_CHEST, -0.05, 0, 0);
        AddR(out, J_HEAD, 0.05, 0, 0);
        SetRz(out, J_ITEM, -0.16 * Math.sin(p - 0.85) * stride);
      }
      break;
    }

    // —————————————————————————— 潜行（半猫腰、脚尖先落）
    case 'sneak': {
      const stride = 0.62 * sp.stepAmp * (0.45 + 0.55 * speed);
      const th = 0.42;
      const kn = -0.86;
      AddP(out, J_ROOT, 0, HipDrop(rig, th, kn), 0);
      AddRz(out, J_TORSO, -0.34);
      AddRz(out, J_CHEST, -0.16);
      AddRz(out, J_HEAD, 0.50);
      AddR(out, J_HEAD, 0, Math.sin(time * 0.55) * 0.22, 0);

      const sL = Swing(p, 0.55);
      const sR = Swing(p + PI, 0.55);
      const thL = th + stride * 0.42 * sL;
      const thR = th + stride * 0.42 * sR;
      const knL = kn - 0.55 * stride * Math.max(0, Math.cos(p));
      const knR = kn - 0.55 * stride * Math.max(0, Math.cos(p + PI));
      AddRz(out, J_LEGL, thL);
      AddRz(out, J_LEGR, thR);
      AddRz(out, J_SHINL, knL);
      AddRz(out, J_SHINR, knR);
      // 脚尖先着地：踝关节压得更绷。
      AddRz(out, J_FOOTL, Clamp(-(thL + knL) + 0.30, -0.8, 0.9));
      AddRz(out, J_FOOTR, Clamp(-(thR + knR) + 0.30, -0.8, 0.9));

      AddP(out, J_ROOT, 0, h * 0.008 * Math.cos(2 * p) * stride, 0);
      AddR(out, J_HIP, 0.05 * Math.sin(p) * stride, 0.10 * Math.sin(p) * stride, 0);
      // 手臂低位、贴身、平衡用。
      SetR(out, J_ARML, 0.16, 0, 0.30 - 0.26 * sp.armSwing * stride * Math.sin(p));
      SetR(out, J_ARMR, -0.16, 0, 0.30 + 0.26 * sp.armSwing * stride * Math.sin(p));
      SetRz(out, J_FOREL, -0.62);
      SetRz(out, J_FORER, -0.62);
      if (sp.rifle || sp.sword) {
        // 端着枪 / 按着刀往前搜。
        SetR(out, J_ARML, 0.22, 0, 0.75);
        SetR(out, J_ARMR, -0.20, 0, 0.55);
        SetRz(out, J_FOREL, -0.85);
        SetRz(out, J_FORER, -0.70);
      }
      break;
    }

    // —————————————————————————— 猫腰静止（招牌姿态之一）
    case 'crouchIdle': {
      // 猫腰：重心压到 PLAYER.crouchHeight 那一档，背弓成一条近乎水平的线，头前伸。
      // 目标胯高由 PLAYER.crouchHeight 反推；kn = -2*th 让小腿与大腿对称，
      // 踝关节正好留在胯的正下方，脚不会飘也不会陷。
      const hipT = h * CROUCH_RATIO * 0.545;
      const th = Math.acos(Clamp((hipT - (rig.hipY - rig.legFull)) / rig.legFull, -1, 1));
      const kn = -2 * th;
      AddP(out, J_ROOT, h * 0.045, HipDrop(rig, th, kn), 0);
      SetRz(out, J_TORSO, -0.85);
      SetRz(out, J_CHEST, -0.50);
      SetRz(out, J_NECK, -0.10);
      SetRz(out, J_HEAD, 1.42);
      SetRz(out, J_LEGL, th);
      SetRz(out, J_LEGR, th + 0.10);
      SetRz(out, J_SHINL, kn);
      SetRz(out, J_SHINR, kn - 0.10);
      SetRz(out, J_FOOTL, Clamp(-(th + kn), -0.8, 0.9));
      SetRz(out, J_FOOTR, Clamp(-(th + 0.10 + kn - 0.10), -0.8, 0.9));
      // 手臂垂在膝前
      SetR(out, J_ARML, 0.13, 0, 1.06);
      SetR(out, J_ARMR, -0.13, 0, 1.00);
      SetRz(out, J_FOREL, -0.42);
      SetRz(out, J_FORER, -0.42);
      // 屏息式浅呼吸
      const br = Math.sin(time * 1.35);
      AddRz(out, J_CHEST, br * 0.028);
      AddP(out, J_ROOT, 0, h * 0.004 * br, 0);
      AddR(out, J_HEAD, 0, Math.sin(time * 0.62) * 0.16, 0);
      break;
    }

    // —————————————————————————— 爬行（招牌姿态之二）
    case 'crawl': {
      // 匍匐：净空只有 HEADROOM.crawlNeeds(0.62m)，所以是肘撑地的低爬，
      // 不是四足高跪。重心极低、背弓、手撑地、头前伸——本作的题眼姿态。
      const s = Math.sin(p);
      const c = Math.cos(p);
      // 胯落到大腿能撑住的高度，膝盖正好点地。
      const hipT = h * CRAWL_RATIO * 0.384;
      const kneeR = h * 0.052;                     // 膝盖也有粗细，不能让轴线贴在 y=0
      const knee = -Math.acos(Clamp((hipT - kneeR) / rig.thighLen, -1, 1));
      AddP(out, J_ROOT, h * 0.02, hipT - rig.hipY + h * 0.008 * Math.cos(2 * p), 0);

      SetRz(out, J_TORSO, -1.26);                  // 背几乎水平
      SetRz(out, J_CHEST, -0.24);
      SetRz(out, J_NECK, -0.06);
      SetRz(out, J_HEAD, 1.52);                    // 头抬起来看前面
      AddR(out, J_HIP, 0.17 * s, 0.15 * s, 0);     // 躯干左右摆
      AddR(out, J_CHEST, -0.11 * s, -0.19 * s, 0);
      AddR(out, J_HEAD, 0, 0.13 * Math.sin(p - 0.8), 0);

      // 前肢：上臂几乎垂直撑住，小臂平摊在地上交替往前够（肘撑式匍匐）
      SetR(out, J_ARML, 0.10, 0, 1.74 + 0.40 * s);
      SetR(out, J_ARMR, -0.10, 0, 1.74 - 0.40 * s);
      SetRz(out, J_FOREL, 1.30 - 0.40 * s - 0.22 * Math.max(0, -c));
      SetRz(out, J_FORER, 1.30 + 0.40 * s - 0.22 * Math.max(0, c));

      // 后肢：膝点地，小腿平摊在后面，交替往后蹬（只往后摆，膝盖才不会钻进土里）
      const dL = 0.34 * Math.max(0, s);
      const dR = 0.34 * Math.max(0, -s);
      SetRz(out, J_LEGL, knee - dL);
      SetRz(out, J_LEGR, knee - dR);
      const flat = -(PI * 0.5 + knee) - 0.20;      // 小腿贴地，踝端略抬免得脚背穿土
      SetRz(out, J_SHINL, flat + dL + 0.20 * Math.max(0, s));
      SetRz(out, J_SHINR, flat + dR + 0.20 * Math.max(0, -s));
      SetRz(out, J_FOOTL, 0.25);
      SetRz(out, J_FOOTR, 0.25);
      break;
    }

    // —————————————————————————— 攀爬竖井
    case 'climb': {
      const s = Math.sin(p);
      const c = Math.cos(p);
      AddP(out, J_ROOT, h * 0.055, h * 0.010 * Math.sin(2 * p), 0);   // 贴住竖井壁
      AddRz(out, J_TORSO, -0.14);
      AddRz(out, J_CHEST, -0.08);
      AddRz(out, J_HEAD, 0.52);                    // 微微向上看
      AddR(out, J_HEAD, 0, 0.10 * Math.sin(p * 0.5), 0);
      AddR(out, J_HIP, 0.06 * s, 0.10 * s, 0);

      // 手交替向上抓握
      SetR(out, J_ARML, 0.13, 0, 2.72 + 0.46 * s);
      SetR(out, J_ARMR, -0.13, 0, 2.72 - 0.46 * s);
      SetRz(out, J_FOREL, -0.48 - 0.34 * Math.max(0, -c));
      SetRz(out, J_FORER, -0.48 - 0.34 * Math.max(0, c));
      // 脚交替蹬踏，膝抬高
      const kUpL = Math.max(0, -s);
      const kUpR = Math.max(0, s);
      SetRz(out, J_LEGL, 0.30 + 0.72 * kUpL);
      SetRz(out, J_LEGR, 0.30 + 0.72 * kUpR);
      SetRz(out, J_SHINL, -0.55 - 0.85 * kUpL);
      SetRz(out, J_SHINR, -0.55 - 0.85 * kUpR);
      SetRz(out, J_FOOTL, 0.35);
      SetRz(out, J_FOOTR, 0.35);
      break;
    }

    // —————————————————————————— 下坠
    case 'fall': {
      const f1 = Math.sin(time * 10.5);
      const f2 = Math.sin(time * 8.3 + 1.7);
      AddRz(out, J_TORSO, 0.20);
      AddRz(out, J_CHEST, 0.12);
      AddRz(out, J_HEAD, -0.30 + 0.06 * f2);
      SetR(out, J_ARML, 0.42, 0, 2.30 + 0.16 * f1);
      SetR(out, J_ARMR, -0.42, 0, 2.48 - 0.16 * f2);
      SetRz(out, J_FOREL, -0.62 + 0.12 * f2);
      SetRz(out, J_FORER, -0.55 + 0.12 * f1);
      SetRz(out, J_LEGL, 0.44 + 0.10 * f2);
      SetRz(out, J_LEGR, -0.26 + 0.10 * f1);
      SetRz(out, J_SHINL, -0.78);
      SetRz(out, J_SHINR, -0.34);
      SetRz(out, J_FOOTL, 0.30);
      SetRz(out, J_FOOTR, 0.22);
      AddR(out, J_HIP, 0.05 * f1, 0.08 * f2, 0);
      break;
    }

    // —————————————————————————— 落地缓冲（约 0.25 秒：压 → 弹）
    case 'land': {
      const u = at / 0.25;
      let comp;
      if (u < 0.30) comp = Sm(u / 0.30);
      else comp = Math.exp(-(u - 0.30) * 6.5);
      // 回弹微过冲
      const rb = u > 0.30 ? Math.max(0, Math.sin((u - 0.30) * 7.5)) * Math.exp(-(u - 0.30) * 4.5) * 0.22 : 0;
      const th = 0.62 * comp - 0.10 * rb;
      const kn = -1.28 * comp + 0.20 * rb;
      AddP(out, J_ROOT, 0, HipDrop(rig, Math.max(0, th), Math.min(0, kn)) + h * 0.020 * rb, 0);
      AddRz(out, J_LEGL, th);
      AddRz(out, J_LEGR, th * 0.92);
      AddRz(out, J_SHINL, kn);
      AddRz(out, J_SHINR, kn * 0.92);
      AddRz(out, J_FOOTL, Clamp(-(th + kn) * 0.9, -0.8, 0.9));
      AddRz(out, J_FOOTR, Clamp(-(th + kn) * 0.9, -0.8, 0.9));
      AddRz(out, J_TORSO, -0.50 * comp + 0.10 * rb);
      AddRz(out, J_CHEST, -0.22 * comp);
      AddRz(out, J_HEAD, 0.42 * comp);
      SetR(out, J_ARML, 0.34, 0, -0.78 * comp);
      SetR(out, J_ARMR, -0.34, 0, -0.84 * comp);
      SetRz(out, J_FOREL, 0.20 + 0.55 * comp);
      SetRz(out, J_FORER, 0.20 + 0.55 * comp);
      break;
    }

    // —————————————————————————— 使用 / 开地道口 / 拉闸（士兵：向下捅刺刀）
    case 'use': {
      const reach = Sm(Math.min(1, at / 0.26));
      const work = Math.sin(at * 7.4) * 0.14 * reach;
      if (sp.rifle) {
        // 搜索兵拿刺刀向下捅——地下 probe 用得上。
        const stab = Math.sin(at * 4.2);
        const th = 0.36 * reach;
        const kn = -0.72 * reach;
        AddP(out, J_ROOT, 0, HipDrop(rig, th, kn), 0);
        AddRz(out, J_LEGL, th + 0.16);
        AddRz(out, J_LEGR, th - 0.16);
        AddRz(out, J_SHINL, kn);
        AddRz(out, J_SHINR, kn * 0.8);
        AddRz(out, J_TORSO, -0.50 * reach - 0.10 * stab);
        AddRz(out, J_CHEST, -0.20 * reach);
        AddRz(out, J_HEAD, 0.30 * reach);
        SetR(out, J_ARML, 0.20, 0, 1.55 * reach + 0.22 * stab);
        SetR(out, J_ARMR, -0.16, 0, 1.05 * reach + 0.26 * stab);
        SetRz(out, J_FOREL, -0.30);
        SetRz(out, J_FORER, -0.45);
      } else {
        AddRz(out, J_TORSO, -0.22 * reach);
        AddRz(out, J_CHEST, -0.10 * reach);
        AddRz(out, J_HEAD, 0.18 * reach - 0.16 * reach);
        AddRz(out, J_LEGL, 0.20 * reach);
        AddRz(out, J_LEGR, -0.12 * reach);
        AddRz(out, J_SHINL, -0.30 * reach);
        AddRz(out, J_SHINR, -0.14 * reach);
        AddP(out, J_ROOT, 0, HipDrop(rig, 0.20 * reach, -0.30 * reach) * 0.6, 0);
        SetR(out, J_ARMR, -0.14, 0, 1.34 * reach + work);
        SetRz(out, J_FORER, -0.58 * reach - work * 0.6);
        SetR(out, J_ARML, 0.12, 0, 0.44 * reach + work * 0.5);
        SetRz(out, J_FOREL, -0.30 * reach);
        AddR(out, J_CHEST, 0, -0.16 * reach, 0);
      }
      break;
    }

    // —————————————————————————— 挖（入土 → 撬 → 甩土，躯干带动）
    case 'dig': {
      const c = (at / 1.05) % 1;
      const sRaise = Seg(c, 0.00, 0.22);
      const sStab = Seg(c, 0.22, 0.38);
      const sPry = Seg(c, 0.38, 0.58);
      const sLift = Seg(c, 0.58, 0.76);
      const sFling = Seg(c, 0.76, 0.90);
      const sBack = Seg(c, 0.90, 1.00);

      // 躯干：抬起 → 猛地俯冲入土 → 后仰撬 → 起身 → 侧甩
      const bend = -0.30 - 0.62 * sStab + 0.46 * sPry + 0.30 * sLift - 0.10 * sFling + 0.26 * sBack;
      AddRz(out, J_TORSO, bend);
      AddRz(out, J_CHEST, bend * 0.42);
      AddRz(out, J_HEAD, -bend * 0.75);
      // 甩土时腰跟着扭
      const twist = 0.22 * sRaise - 0.10 * sStab + 0.55 * sFling - 0.62 * sBack;
      AddR(out, J_HIP, 0, twist * 0.4, 0);
      AddR(out, J_CHEST, 0, twist, 0);
      AddR(out, J_HEAD, 0, -twist * 0.5, 0);

      // 腿：入土时沉胯发力
      const th = 0.24 + 0.34 * sStab - 0.22 * sLift;
      const kn = -0.42 - 0.55 * sStab + 0.42 * sLift;
      AddP(out, J_ROOT, 0, HipDrop(rig, th, kn), 0);
      AddRz(out, J_LEGL, th + 0.20);
      AddRz(out, J_LEGR, th - 0.20);
      AddRz(out, J_SHINL, kn);
      AddRz(out, J_SHINR, kn * 0.8);
      AddRz(out, J_FOOTL, Clamp(-(th + kn), -0.7, 0.8));
      AddRz(out, J_FOOTR, Clamp(-(th + kn * 0.8) - 0.2, -0.7, 0.8));

      // 双手同握一根锨柄：右手在上，左手在下，动作同相。
      const armSw = 0.50 + 0.90 * sRaise - 1.42 * sStab + 0.36 * sPry + 0.86 * sLift - 0.62 * sFling + 0.42 * sBack;
      SetR(out, J_ARMR, -0.16, 0, armSw);
      SetR(out, J_ARML, 0.20, 0, armSw + 0.42);
      SetRz(out, J_FORER, -0.30 - 0.45 * sRaise + 0.30 * sStab - 0.35 * sPry);
      SetRz(out, J_FOREL, -0.62 - 0.30 * sRaise + 0.40 * sStab);
      break;
    }

    // —————————————————————————— 推（碾盘 / 水缸）
    case 'push': {
      const strain = Math.sin(time * 3.1) * 0.05 + Math.sin(time * 5.7) * 0.02;
      const shove = Math.sin(p) * 0.5 + 0.5;
      AddP(out, J_ROOT, -h * 0.03, 0, 0);
      AddRz(out, J_TORSO, -0.52 - 0.06 * shove + strain);
      AddRz(out, J_CHEST, -0.24);
      AddRz(out, J_HEAD, 0.60 - 0.10 * shove);
      // 双臂前伸抵住
      SetR(out, J_ARML, 0.16, 0, 1.46 + 0.05 * shove);
      SetR(out, J_ARMR, -0.16, 0, 1.42 + 0.05 * shove);
      SetRz(out, J_FOREL, -0.14);
      SetRz(out, J_FORER, -0.14);
      // 前后弓步，后腿蹬地
      const front = 0.40 + 0.22 * shove;
      const back = -0.50 - 0.16 * shove;
      SetRz(out, J_LEGL, front);
      SetRz(out, J_SHINL, -0.74);
      SetRz(out, J_FOOTL, Clamp(-(front - 0.74), -0.7, 0.8));
      SetRz(out, J_LEGR, back);
      SetRz(out, J_SHINR, -0.20 - 0.14 * shove);
      SetRz(out, J_FOOTR, 0.55 + 0.16 * shove);
      AddP(out, J_ROOT, 0, HipDrop(rig, front, -0.74) * 0.7, 0);
      AddR(out, J_HIP, 0.04 * Math.sin(p), 0.06 * Math.sin(p), 0);
      break;
    }

    // —————————————————————————— 敲钟（第 1 幕高潮：后仰 → 抡臂 → 前倾 → 反冲）
    case 'ring': {
      const c = (at / 1.10) % 1;
      const wind = Seg(c, 0.00, 0.30);        // 后仰蓄力
      const swing = Seg(c, 0.30, 0.46);       // 抡臂前送
      const hit = Seg(c, 0.46, 0.52);         // 触钟
      const recoil = Seg(c, 0.52, 0.64);      // 反冲
      const back = Seg(c, 0.64, 1.00);        // 回位

      // 躯干：整条脊柱发力，不是只有手臂
      const spine = 0.42 * wind - 1.10 * swing - 0.14 * hit + 0.46 * recoil - 0.20 * back;
      AddRz(out, J_TORSO, spine * 0.62);
      AddRz(out, J_CHEST, spine * 0.42);
      AddRz(out, J_HEAD, -spine * 0.55 + 0.22 * wind);
      // 扭腰：抡的时候身体转过去
      const tw = -0.30 * wind + 0.62 * swing + 0.10 * hit - 0.34 * recoil + 0.06 * back;
      AddR(out, J_HIP, 0, tw * 0.45, 0);
      AddR(out, J_CHEST, 0, tw, 0);

      // 重心：蓄力提起来，击打压下去
      AddP(out, J_ROOT, h * (0.03 * wind - 0.05 * swing + 0.02 * recoil),
        h * (0.026 * wind - 0.048 * swing + 0.014 * recoil), 0);

      // 双手同握绳/锤：从头后甩到身前下方
      const arm = -1.05 * wind + 3.05 * swing + 0.30 * hit - 1.10 * recoil - 0.90 * back;
      SetR(out, J_ARMR, -0.20, 0, 0.35 + arm);
      SetR(out, J_ARML, 0.24, 0, 0.20 + arm * 0.92);
      SetRz(out, J_FORER, -0.85 + 0.62 * wind - 0.42 * swing + 0.35 * recoil);
      SetRz(out, J_FOREL, -0.95 + 0.62 * wind - 0.42 * swing + 0.35 * recoil);

      // 腿：前弓后蹬，击打时前腿吃力
      const fr = 0.16 + 0.44 * swing - 0.12 * wind;
      const bk = -0.20 - 0.42 * wind + 0.16 * swing;
      SetRz(out, J_LEGL, fr);
      SetRz(out, J_SHINL, -0.38 - 0.34 * swing);
      SetRz(out, J_FOOTL, Clamp(-(fr - 0.38), -0.7, 0.8));
      SetRz(out, J_LEGR, bk);
      SetRz(out, J_SHINR, -0.24 - 0.30 * wind);
      SetRz(out, J_FOOTR, 0.30 + 0.42 * wind);
      break;
    }

    // —————————————————————————— 躲藏（蜷缩、屏息）
    case 'hide': {
      const th = 1.18;
      const kn = -2.18;
      AddP(out, J_ROOT, 0, HipDrop(rig, th, kn) - h * 0.010, 0);
      AddRz(out, J_LEGL, th);
      AddRz(out, J_LEGR, th - 0.08);
      AddRz(out, J_SHINL, kn);
      AddRz(out, J_SHINR, kn + 0.08);
      AddRz(out, J_FOOTL, Clamp(-(th + kn), -0.9, 1.0));
      AddRz(out, J_FOOTR, Clamp(-(th + kn), -0.9, 1.0));
      AddRz(out, J_TORSO, -0.86);
      AddRz(out, J_CHEST, -0.52);
      AddRz(out, J_NECK, -0.16);
      AddRz(out, J_HEAD, 0.86);                     // 缩着但还是往外看一眼
      // 抱住膝盖
      SetR(out, J_ARML, 0.30, 0, 1.28);
      SetR(out, J_ARMR, -0.30, 0, 1.24);
      SetRz(out, J_FOREL, -1.90);
      SetRz(out, J_FORER, -1.86);
      // 屏息：频率明显低于 idle，幅度也更小
      const br = Math.sin(time * 0.72);
      AddRz(out, J_CHEST, br * 0.016);
      AddP(out, J_ROOT, 0, h * 0.0022 * br, 0);
      break;
    }

    // —————————————————————————— 呼应（喊人）
    case 'call': {
      const c = (at / 1.05) % 1;
      const up = Seg(c, 0.04, 0.20);
      const down = Seg(c, 0.52, 0.86);
      const shout = Math.max(0, up - down);
      AddP(out, J_ROOT, 0, h * 0.020 * shout, 0);     // 踮起来
      AddRz(out, J_TORSO, -0.14 - 0.16 * shout);
      AddRz(out, J_CHEST, 0.14 * shout);              // 挺胸
      AddRz(out, J_HEAD, 0.42 * shout);               // 仰头
      AddR(out, J_HEAD, 0, 0.10 * shout, 0);
      // 右手拢在嘴边
      SetR(out, J_ARMR, -0.42, 0, 2.05 * shout);
      SetRz(out, J_FORER, -1.85 * shout + 0.17 * (1 - shout));
      SetR(out, J_ARML, 0.18, 0, -0.30 * shout);
      SetRz(out, J_FOREL, 0.17 + 0.25 * shout);
      AddRz(out, J_LEGL, 0.14 * shout);
      AddRz(out, J_SHINL, -0.20 * shout);
      break;
    }

    // —————————————————————————— 被抓（僵住、举手、后缩）
    case 'caught': {
      const u = Seg(at, 0.0, 0.34);
      const tr = Math.sin(time * 13.0) * 0.018 + Math.sin(time * 21.0) * 0.008;
      AddP(out, J_ROOT, -h * 0.055 * u, 0, 0);        // 身体后缩
      AddRz(out, J_TORSO, 0.24 * u);
      AddRz(out, J_CHEST, 0.10 * u);
      AddRz(out, J_HEAD, -0.20 * u + tr);             // 缩下巴
      AddR(out, J_HEAD, 0, tr * 2.0, 0);
      // 举手
      SetR(out, J_ARML, 0.42 * u, 0, 2.52 * u + tr);
      SetR(out, J_ARMR, -0.42 * u, 0, 2.58 * u - tr);
      SetRz(out, J_FOREL, 0.17 - 0.52 * u);
      SetRz(out, J_FORER, 0.17 - 0.50 * u);
      // 腿并拢微屈
      const th = 0.20 * u;
      const kn = -0.40 * u;
      AddP(out, J_ROOT, 0, HipDrop(rig, th, kn), 0);
      AddRz(out, J_LEGL, th);
      AddRz(out, J_LEGR, th);
      AddRz(out, J_SHINL, kn);
      AddRz(out, J_SHINR, kn);
      AddRz(out, J_FOOTL, Clamp(-(th + kn), -0.5, 0.5));
      AddRz(out, J_FOOTR, Clamp(-(th + kn), -0.5, 0.5));
      break;
    }

    // —————————————————————————— 倒下（克制，缓缓伏下，不夸张）
    case 'dead': {
      const u1 = Seg(at, 0.00, 0.60);      // 膝一软
      const u2 = Seg(at, 0.35, 1.35);      // 上身前折
      const u3 = Seg(at, 0.95, 2.05);      // 贴地铺平
      const settle = Seg(at, 1.70, 2.40);

      // 最终躺平：胯离地约 0.11h，脊柱与四肢全部水平。
      const lieY = h * 0.162;
      const kneelDrop = HipDrop(rig, 0.95, -1.75);
      AddP(out, J_ROOT, h * 0.05 * u2,
        kneelDrop * u1 + (lieY - rig.hipY - kneelDrop) * u2 - h * 0.004 * settle, 0);
      SetRz(out, J_TORSO, -0.42 * u1 - 1.10 * u2);
      SetRz(out, J_CHEST, -0.16 * u2 - 0.14 * u3);
      SetRz(out, J_NECK, -0.10 * u3);
      SetRz(out, J_HEAD, 0.38 * u1 + 0.86 * u2 - 0.36 * u3);
      AddR(out, J_HIP, 0.10 * u2 + 0.13 * u3, 0.14 * u2, 0);

      // 腿：先跪 → 再摊平拖在身后
      SetRz(out, J_LEGL, 0.95 * u1 - 2.48 * u2);
      SetRz(out, J_LEGR, 0.86 * u1 - 2.34 * u2);
      SetRz(out, J_SHINL, -1.75 * u1 + 1.86 * u2);
      SetRz(out, J_SHINR, -1.66 * u1 + 1.78 * u2);
      SetRz(out, J_FOOTL, 0.55 * u1 - 0.28 * u2);
      SetRz(out, J_FOOTR, 0.50 * u1 - 0.26 * u2);
      // 手臂：先撑一下，最后顺着身体摊下去
      SetR(out, J_ARML, 0.16, 0, 0.85 * u1 + 0.20 * u2 - 0.68 * u3);
      SetR(out, J_ARMR, -0.16, 0, 0.78 * u1 + 0.18 * u2 - 0.62 * u3);
      SetRz(out, J_FOREL, 0.17 + 0.42 * u1 - 0.58 * u2 - 0.05 * u3);
      SetRz(out, J_FORER, 0.17 + 0.38 * u1 - 0.54 * u2 - 0.05 * u3);
      break;
    }

    // —————————————————————————— 提着东西站着
    case 'carryIdle': {
      const br = Math.sin(time * 1.05);
      const sway = Math.sin(time * 0.33);
      AddRz(out, J_CHEST, br * 0.020);
      AddP(out, J_ROOT, 0, h * 0.0035 * br, 0);
      AddR(out, J_HIP, 0.02 * sway, 0.02 * sway, 0);
      // 负重侧代偿
      AddR(out, J_TORSO, -0.085, 0, 0);
      AddR(out, J_CHEST, -0.055, 0, 0);
      AddR(out, J_HEAD, 0.06, 0.06 * sway, 0);
      // 右手提物：肘微僵，手垂直
      SetR(out, J_ARMR, -0.17, 0, 0.05 + 0.018 * br);
      SetRz(out, J_FORER, 0.10);
      SetR(out, J_ARML, 0.13, 0, -0.05 + 0.03 * br);
      SetRz(out, J_FOREL, 0.26);
      SetRz(out, J_ITEM, -0.05 * Math.sin(time * 1.6));
      AddRz(out, J_LEGR, 0.03);
      AddRz(out, J_LEGL, -0.02);
      break;
    }
  }

  // —— 随身长家伙的收纳 ——
  // 长枪背在胸背上、拐棍握在手里，身体一大幅前倾/贴地它们就会戳穿地面。
  // 这里把它们的「世界角」夹住：只允许倾到某个角度，再往下就在挂点上打滑。
  if (sp.rifle) {
    const world = GetRz(out, J_TORSO) + GetRz(out, J_CHEST) + rig.restRot[J_PROPA * 3 + 2];
    if (world < -1.42) SetRz(out, J_PROPA, -1.42 - world);
  }
  if (sp.sword) {
    // 佩刀挂在胯上：胯一低，刀鞘尖就会插进地里。按胯的实际高度把它撇平。
    const hy = rig.hipY + out[J_ROOT * CH + 4] + out[J_HIP * CH + 4] - h * 0.02;
    const need = Math.acos(Clamp(hy / rig.propDrop, -1, 1));
    const rest = rig.restRot[J_PROPA * 3 + 2];
    if (rest < need) SetRz(out, J_PROPA, need - rest);
  }
  if (sp.stick) {
    // 拐棍：直立行走时严格竖直拄地；其余姿态收成朝前上方，绝不插进地里。
    const chain = GetRz(out, J_TORSO) + GetRz(out, J_CHEST) +
      GetRz(out, J_ARML) + GetRz(out, J_FOREL) + GetRz(out, J_HANDL);
    let want = 1.92;
    switch (name) {
      case 'idle': case 'walk': case 'sneak': case 'carryIdle': case 'carryWalk':
      case 'use': case 'call':
        want = 0;
        break;
      default:
        break;
    }
    SetRz(out, J_PROPA, want - chain);
  }
  if (sp.gown) {
    // 长袄下摆跟着大腿走：蹲下时兜在膝前，伏地时顺着腿摊在身后。
    // 再按胯的实际高度兜底，保证下摆永远不会插进土里。
    let a = (GetRz(out, J_LEGL) + GetRz(out, J_LEGR)) * 0.375;
    const hy = rig.hipY + out[J_ROOT * CH + 4] + out[J_HIP * CH + 4];
    // + 0.22 是下摆方箱的半宽补偿：转起来最低的是角，不是中轴。
    const need = hy < rig.gownDrop ? Math.acos(Clamp(hy / rig.gownDrop, -1, 1)) + 0.22 : 0;
    if (a >= 0) { if (a < need) a = need; } else if (-a < need) a = -need;
    SetRz(out, J_PROPB, a);
  }

  return out;
}

// ——————————————————————————————————————————————————————————— 犬形姿态
//
// 四足：对角步（左前 + 右后同相）。头/颈的静止角已经烘进 rest，
// 这里的 rz 都是相对量。

function DogBase(out, rig) {
  ClearPose(out);
  SetRz(out, J_ARML, 0.02);
  SetRz(out, J_ARMR, 0.02);
  SetRz(out, J_FOREL, -0.16);
  SetRz(out, J_FORER, -0.16);
  SetRz(out, J_LEGL, -0.16);
  SetRz(out, J_LEGR, -0.16);
  SetRz(out, J_SHINL, 0.34);
  SetRz(out, J_SHINR, 0.34);
  SetRz(out, J_FOOTL, -0.18);
  SetRz(out, J_FOOTR, -0.18);
  SetRz(out, J_HANDL, -0.02);
  SetRz(out, J_HANDR, -0.02);
}

/** 四足统一屈伸。返回为了让爪子还踩在地上需要的躯干下沉量。 */
function DogStance(out, rig, th, sh) {
  const paw = Clamp(-(th + sh), -1.0, 1.0);
  SetRz(out, J_ARML, th); SetRz(out, J_ARMR, th);
  SetRz(out, J_FOREL, sh); SetRz(out, J_FORER, sh);
  SetRz(out, J_LEGL, th); SetRz(out, J_LEGR, th);
  SetRz(out, J_SHINL, sh); SetRz(out, J_SHINR, sh);
  SetRz(out, J_HANDL, paw); SetRz(out, J_HANDR, paw);
  SetRz(out, J_FOOTL, paw); SetRz(out, J_FOOTR, paw);
  return HipDrop(rig, th, sh);
}

function DogTrot(out, rig, p, amp) {
  // 对角同相：左前 ↔ 右后，右前 ↔ 左后
  const a = Swing(p, 0.72) * amp;
  const b = Swing(p + PI, 0.72) * amp;
  const ca = Math.cos(p);
  const cb = Math.cos(p + PI);
  AddRz(out, J_ARML, a * 0.62);
  AddRz(out, J_ARMR, b * 0.62);
  AddRz(out, J_FOREL, -0.42 * amp * Math.max(0, ca));
  AddRz(out, J_FORER, -0.42 * amp * Math.max(0, cb));
  AddRz(out, J_LEGL, b * 0.58);
  AddRz(out, J_LEGR, a * 0.58);
  AddRz(out, J_SHINL, 0.50 * amp * Math.max(0, cb));
  AddRz(out, J_SHINR, 0.50 * amp * Math.max(0, ca));
}

function PoseDog(out, rig, name, at, p, time, speed) {
  const h = rig.height;
  DogBase(out, rig);

  switch (name) {

    case 'idle':
    case 'carryIdle': {
      const br = Math.sin(time * 1.9);
      AddP(out, J_ROOT, 0, h * 0.005 * br, 0);
      AddRz(out, J_CHEST, br * 0.02);
      AddR(out, J_HEAD, 0, Math.sin(time * 0.65) * 0.30, Math.sin(time * 0.9) * 0.06);
      AddR(out, J_PROPA, 0, Math.sin(time * 3.4) * 0.42, 0.10 * Math.sin(time * 1.7));
      if (name === 'carryIdle') AddRz(out, J_NECK, -0.22);
      break;
    }

    case 'walk':
    case 'carryWalk': {
      const amp = 0.55 + 0.45 * speed;
      DogTrot(out, rig, p, amp);
      AddP(out, J_ROOT, 0, h * amp * (0.014 * Math.cos(2 * p) - 0.014 * Pulse(Math.max(0, -Math.cos(2 * p)), 3)), 0);
      AddR(out, J_HIP, 0.05 * amp * Math.sin(p), 0.07 * amp * Math.sin(p), 0);
      AddR(out, J_CHEST, -0.04 * amp * Math.sin(p), -0.06 * amp * Math.sin(p), 0);
      AddR(out, J_HEAD, 0, 0.08 * Math.sin(p - 0.8), 0.06 * Math.cos(2 * p - 0.9) * amp);
      AddR(out, J_PROPA, 0, Math.sin(time * 5.2) * 0.34, 0.16);
      if (name === 'carryWalk') AddRz(out, J_NECK, -0.24);
      break;
    }

    case 'sneak': {
      // 潜行：压低身子、头几乎贴地、尾巴放平。
      const amp = 0.30 + 0.30 * speed;
      AddP(out, J_ROOT, 0, DogStance(out, rig, 0.85, -1.70), 0);
      DogTrot(out, rig, p, amp);
      AddRz(out, J_TORSO, 0.06);
      AddRz(out, J_NECK, -0.42);
      AddRz(out, J_HEAD, 0.34);
      AddRz(out, J_PROPA, 0.70);
      AddR(out, J_HEAD, 0, Math.sin(time * 1.4) * 0.16, 0);
      break;
    }

    case 'crouchIdle': {
      // 蹲坐：后腿折起坐地，上身立起来，前腿撑直。
      const th = 1.15;
      const sh = -2.00;
      SetRz(out, J_LEGL, th); SetRz(out, J_LEGR, th);
      SetRz(out, J_SHINL, sh); SetRz(out, J_SHINR, sh);
      SetRz(out, J_FOOTL, 0.80); SetRz(out, J_FOOTR, 0.80);
      const drop = HipDrop(rig, th, sh);
      AddP(out, J_ROOT, 0, drop, 0);
      // 躯干立起来，把胸口顶回原高度，前腿反向抵消保持竖直。
      const tz = Math.asin(Clamp(-drop / Math.max(0.001, rig.chestX), -1, 1));
      SetRz(out, J_TORSO, tz);
      SetRz(out, J_ARML, -tz + 0.03); SetRz(out, J_ARMR, -tz - 0.03);
      SetRz(out, J_FOREL, -0.06); SetRz(out, J_FORER, -0.06);
      SetRz(out, J_HANDL, 0.03); SetRz(out, J_HANDR, 0.03);
      SetRz(out, J_NECK, -tz + 0.22);
      AddR(out, J_HEAD, 0, Math.sin(time * 0.8) * 0.24, 0);
      AddR(out, J_PROPA, 0, Math.sin(time * 2.6) * 0.24, 0.45);
      break;
    }

    case 'crawl':
    case 'hide': {
      // 趴下。hide 时呼吸更慢更浅。
      const still = name === 'hide';
      AddP(out, J_ROOT, 0, DogStance(out, rig, 1.50, -2.30), 0);
      AddRz(out, J_TORSO, 0.04);
      AddRz(out, J_NECK, -0.55);
      AddRz(out, J_HEAD, 0.46);
      AddRz(out, J_PROPA, 0.85);
      if (still) {
        const br = Math.sin(time * 0.68);
        AddP(out, J_ROOT, 0, h * 0.004 * br, 0);
        AddRz(out, J_CHEST, br * 0.012);
      } else {
        // 匍匐前进：四肢小幅交替，身体左右挪
        const s = Math.sin(p);
        AddRz(out, J_ARML, 0.26 * s);
        AddRz(out, J_ARMR, -0.26 * s);
        AddRz(out, J_LEGL, -0.24 * s);
        AddRz(out, J_LEGR, 0.24 * s);
        AddR(out, J_HIP, 0.10 * s, 0.12 * s, 0);
        AddR(out, J_HEAD, 0, 0.10 * Math.sin(p - 0.7), 0);
      }
      break;
    }

    case 'climb': {
      // 狗爬不了竖井：后腿蹲住，前身立起来扒墙、爪子交替刨。
      const s = Math.sin(p);
      const th = 0.70;
      const sh = -1.40;
      SetRz(out, J_LEGL, th); SetRz(out, J_LEGR, th);
      SetRz(out, J_SHINL, sh); SetRz(out, J_SHINR, sh);
      SetRz(out, J_FOOTL, 0.62); SetRz(out, J_FOOTR, 0.62);
      AddP(out, J_ROOT, h * 0.05, HipDrop(rig, th, sh) + h * 0.02 * Math.sin(2 * p), 0);
      SetRz(out, J_TORSO, 1.02);                   // 前身立起来
      SetRz(out, J_NECK, -0.55);
      SetRz(out, J_HEAD, 0.25);
      SetRz(out, J_ARML, 1.35 + 0.50 * s);         // 前爪扒在壁上交替刨
      SetRz(out, J_ARMR, 1.35 - 0.50 * s);
      SetRz(out, J_FOREL, -0.45 - 0.35 * Math.max(0, -Math.cos(p)));
      SetRz(out, J_FORER, -0.45 - 0.35 * Math.max(0, Math.cos(p)));
      SetRz(out, J_HANDL, -0.20); SetRz(out, J_HANDR, -0.20);
      AddRz(out, J_PROPA, -0.20);
      break;
    }

    case 'fall': {
      const f1 = Math.sin(time * 11.0);
      const f2 = Math.sin(time * 8.7 + 1.2);
      AddRz(out, J_TORSO, 0.16 + 0.05 * f1);
      AddRz(out, J_ARML, 0.90 + 0.16 * f1);
      AddRz(out, J_ARMR, 0.82 - 0.16 * f2);
      AddRz(out, J_LEGL, -0.55 + 0.14 * f2);
      AddRz(out, J_LEGR, -0.62 - 0.14 * f1);
      AddRz(out, J_SHINL, 0.55);
      AddRz(out, J_SHINR, 0.50);
      AddRz(out, J_NECK, 0.30);
      AddRz(out, J_PROPA, -0.45);
      break;
    }

    case 'land': {
      const u = at / 0.25;
      const comp = u < 0.30 ? Sm(u / 0.30) : Math.exp(-(u - 0.30) * 6.5);
      AddP(out, J_ROOT, 0, DogStance(out, rig, 0.95 * comp, -1.90 * comp), 0);
      AddRz(out, J_ARMR, -0.04 * comp);
      AddRz(out, J_LEGR, 0.04 * comp);
      AddRz(out, J_NECK, -0.30 * comp);
      AddRz(out, J_HEAD, 0.25 * comp);
      AddRz(out, J_PROPA, 0.35 * comp);
      break;
    }

    case 'use': {
      // 低头闻地
      const u = Sm(Math.min(1, at / 0.28));
      const sniff = Math.sin(at * 14.0) * 0.05 * u;
      AddP(out, J_ROOT, 0, -h * 0.05 * u, 0);
      AddRz(out, J_NECK, -0.85 * u);
      AddRz(out, J_HEAD, 0.55 * u + sniff);
      AddRz(out, J_PROPB, 0.10 + 0.10 * Math.sin(at * 16.0) * u);
      AddRz(out, J_ARML, 0.16 * u);
      AddRz(out, J_ARMR, -0.10 * u);
      AddR(out, J_PROPA, 0, Math.sin(time * 4.4) * 0.28, 0.2 * u);
      break;
    }

    case 'dig': {
      // 前爪快速刨土
      const c = (at / 0.42) % 1;
      const a = Math.sin(c * TAU);
      const b = Math.sin(c * TAU + PI);
      AddP(out, J_ROOT, 0, DogStance(out, rig, 0.62, -1.24), 0);
      AddRz(out, J_TORSO, 0.22);
      AddRz(out, J_NECK, -0.58);
      AddRz(out, J_ARML, 0.55 + 0.65 * a);
      AddRz(out, J_ARMR, 0.52 + 0.65 * b);
      AddRz(out, J_FOREL, -0.45 - 0.50 * Math.max(0, a));
      AddRz(out, J_FORER, -0.42 - 0.50 * Math.max(0, b));
      AddR(out, J_HIP, 0.06 * a, 0.05 * a, 0);
      break;
    }

    case 'push': {
      const strain = Math.sin(time * 3.4) * 0.04;
      AddP(out, J_ROOT, -h * 0.03, DogStance(out, rig, 0.40, -0.80), 0);
      AddRz(out, J_TORSO, 0.12 + strain);
      AddRz(out, J_NECK, -0.35);
      AddRz(out, J_ARML, 0.18 + strain);
      AddRz(out, J_ARMR, 0.15 + strain);
      AddRz(out, J_LEGL, -0.42 + strain);
      AddRz(out, J_LEGR, -0.38 + strain);
      AddRz(out, J_PROPA, 0.30);
      break;
    }

    case 'ring':
    case 'call': {
      // 吠叫 / 长嗥。call 是短促连吠，ring 是仰头长嗥。
      const howl = name === 'ring';
      const c = howl ? Seg(at, 0.10, 0.45) - Seg(at, 1.60, 2.20) : 0;
      const bark = howl ? 0 : Math.max(0, Math.sin(at * 11.0));
      const open = howl ? c : bark;
      AddP(out, J_ROOT, 0, h * 0.02 * open, 0);
      AddRz(out, J_NECK, (howl ? 0.85 : 0.42) * open);
      AddRz(out, J_HEAD, (howl ? 0.30 : 0.16) * open);
      AddRz(out, J_PROPB, -0.55 * open);          // 张嘴
      AddRz(out, J_CHEST, -0.06 * open);
      AddRz(out, J_ARML, -0.16 * open);
      AddRz(out, J_ARMR, -0.14 * open);
      AddR(out, J_PROPA, 0, Math.sin(time * 6.0) * 0.30, -0.25 * open);
      break;
    }

    case 'caught': {
      // 军犬发现目标：前低后高、龇牙、绷紧。
      const u = Seg(at, 0.0, 0.28);
      const tr = Math.sin(time * 17.0) * 0.02;
      AddP(out, J_ROOT, h * 0.03 * u, -h * 0.06 * u, 0);
      AddRz(out, J_TORSO, 0.28 * u);
      AddRz(out, J_NECK, -0.30 * u);
      AddRz(out, J_HEAD, 0.30 * u + tr);
      AddRz(out, J_PROPB, -0.40 * u + tr);
      AddRz(out, J_ARML, 0.42 * u);
      AddRz(out, J_ARMR, 0.40 * u);
      AddRz(out, J_FOREL, -0.55 * u);
      AddRz(out, J_FORER, -0.52 * u);
      AddRz(out, J_LEGL, -0.35 * u);
      AddRz(out, J_LEGR, -0.32 * u);
      AddRz(out, J_PROPA, -0.55 * u);
      break;
    }

    case 'dead': {
      const u1 = Seg(at, 0.0, 0.55);
      const u2 = Seg(at, 0.30, 1.30);
      AddP(out, J_ROOT, 0, -h * (0.30 * u1 + 0.24 * u2), 0);
      AddR(out, J_HIP, 1.25 * u2, 0, 0.05 * u1);     // 侧倒
      AddRz(out, J_NECK, -0.45 * u1 - 0.25 * u2);
      AddRz(out, J_HEAD, 0.30 * u1 - 0.25 * u2);
      AddRz(out, J_ARML, 1.10 * u1 + 0.30 * u2);
      AddRz(out, J_ARMR, 1.05 * u1 + 0.28 * u2);
      AddRz(out, J_FOREL, -0.95 * u1);
      AddRz(out, J_FORER, -0.90 * u1);
      AddRz(out, J_LEGL, 1.05 * u1 + 0.25 * u2);
      AddRz(out, J_LEGR, 1.00 * u1 + 0.22 * u2);
      AddRz(out, J_SHINL, -1.30 * u1);
      AddRz(out, J_SHINR, -1.26 * u1);
      AddRz(out, J_PROPA, 0.95 * u1);
      break;
    }
  }

  return out;
}

// ——————————————————————————————————————————————————————————— 钟
//
// 老槐树枝上挂的那口钟（其实是块犁铧铸的铁钟）。
// group 的原点就是绳子挂在树枝上的那一点，渲染层直接把它摆到树枝下。

const BELL_ROPE = 0.62;
const BELL_H = 0.52;

export function CreateBellRig(three) {
  const T = three || FallbackThree;
  const list = [];

  const group = new T.Object3D();
  const pivot = new T.Object3D();
  group.add(pivot);

  const matRope = new T.MeshLambertMaterial({ color: 0x6b5a42, flatShading: true });
  const matIron = new T.MeshLambertMaterial({ color: 0x4a4a50, flatShading: true });
  const matDark = new T.MeshLambertMaterial({ color: 0x24242a, flatShading: true });
  list.push(matRope, matIron, matDark);

  // 绳（挂在枝上那一截）
  const rope = new T.Object3D();
  pivot.add(rope);
  const gRope = new T.CylinderGeometry(0.016, 0.020, BELL_ROPE, 6);
  list.push(gRope);
  const ropeMesh = new T.Mesh(gRope, matRope);
  ropeMesh.position.set(0, -BELL_ROPE * 0.5, 0);
  ropeMesh.castShadow = true;
  rope.add(ropeMesh);

  // 钟体（车削出来的：外壁 → 唇 → 内壁，剖面自带厚度）
  const bell = new T.Object3D();
  bell.position.set(0, -BELL_ROPE, 0);
  rope.add(bell);

  const pts = [
    new T.Vector2(0.020, 0.000),
    new T.Vector2(0.058, -0.012),
    new T.Vector2(0.076, -0.060),
    new T.Vector2(0.088, -0.140),
    new T.Vector2(0.118, -0.258),
    new T.Vector2(0.166, -0.358),
    new T.Vector2(0.214, -0.438),
    new T.Vector2(0.240, -0.478),
    new T.Vector2(0.248, -BELL_H),
    new T.Vector2(0.226, -BELL_H + 0.006),
    new T.Vector2(0.196, -0.462),
    new T.Vector2(0.132, -0.336),
    new T.Vector2(0.086, -0.196),
    new T.Vector2(0.068, -0.092),
    new T.Vector2(0.046, -0.030),
    new T.Vector2(0.000, -0.020),
  ];
  const gBell = new T.LatheGeometry(pts, 18);
  list.push(gBell);
  const bellMesh = new T.Mesh(gBell, matIron);
  bellMesh.castShadow = true;
  bellMesh.receiveShadow = true;
  bell.add(bellMesh);

  // 钟顶吊环
  const gRing = new T.TorusGeometry(0.038, 0.011, 5, 10);
  list.push(gRing);
  const ring = new T.Mesh(gRing, matIron);
  ring.rotation.set(0, PI * 0.5, 0);
  ring.position.set(0, 0.030, 0);
  bell.add(ring);

  // 钟锤（内部）
  const clapper = new T.Object3D();
  clapper.position.set(0, -0.05, 0);
  bell.add(clapper);
  const gRod = new T.CylinderGeometry(0.010, 0.010, 0.32, 5);
  const gBall = new T.SphereGeometry(0.042, 8, 6);
  list.push(gRod, gBall);
  const rod = new T.Mesh(gRod, matDark);
  rod.position.set(0, -0.16, 0);
  clapper.add(rod);
  const ball = new T.Mesh(gBall, matDark);
  ball.position.set(0, -0.33, 0);
  clapper.add(ball);

  return {
    kind: 'bell',
    height: BELL_ROPE + BELL_H,
    group: group,
    joints: { pivot: pivot, rope: rope, bell: bell, clapper: clapper },
    disposables: list,
    disposed: false,
  };
}

/**
 * 摆钟。ringT = 敲击后经过的秒数（未敲过传 null / 负数 / 很大的数都当静止）。
 * 指数阻尼 + 双摆滞后 + 钟锤高频回荡，2~3 秒衰减到看不出来。零分配。
 */
export function PoseBell(rig, ringT) {
  if (!rig || rig.disposed || !rig.joints) return;
  let t = ringT;
  if (typeof t !== 'number' || t !== t || t < 0) t = 1e6;

  const j = rig.joints;
  if (t > 6) {
    j.pivot.rotation.z = 0;
    j.pivot.position.y = 0;
    j.rope.rotation.z = 0;
    j.bell.rotation.z = 0;
    j.clapper.rotation.z = 0;
    return;
  }

  const w = 9.4;                          // ≈1.5 Hz
  const decay = Math.exp(-t * 1.32);      // ~2.6 秒衰减到 3%
  const a = 0.72 * decay * Math.sin(w * t);
  // 绳子略滞后于挂点，钟体又略滞后于绳 —— 双摆的味道
  const aRope = 0.72 * Math.exp(-t * 1.32) * Math.sin(w * t - 0.42);
  const aBell = 0.72 * Math.exp(-t * 1.32) * Math.sin(w * t - 0.86);

  j.pivot.rotation.z = a;
  j.rope.rotation.z = (aRope - a) * 0.55;
  j.bell.rotation.z = (aBell - aRope) * 0.65;
  // 钟锤更快、更早停
  j.clapper.rotation.z = 1.15 * Math.exp(-t * 2.30) * Math.sin(w * 1.95 * t + 0.5) - a * 0.35;
  // 撞击瞬间的竖向抖动
  j.pivot.position.y = Math.exp(-t * 9.0) * 0.013 * Math.sin(t * 46.0);
}
