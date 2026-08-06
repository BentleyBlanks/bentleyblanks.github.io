// 《地道里的光》 —— 2D 骨骼装配与姿态解算。
// 每块骨头是一张单独烘焙的高清贴图，挂进 Three 的层级里；
// 每帧只改关节角度，所以任何景别下都清晰，姿态之间也能连续插值。
//
// 骨架（侧视）：
//   root(胯) ├ torso(躯干) ├ head(头)
//            │             ├ armBack(上臂) → foreBack(前臂)
//            │             └ armFront(上臂) → foreFront(前臂)
//            ├ legBack(大腿) → shinBack(小腿) → footBack
//            └ legFront(大腿) → shinFront(小腿) → footFront

import * as THREE from "three";
import * as ART from "./Script_Art.mjs";

// 零件贴图密度（像素/米）。150 是给中景定的：镜头推到 4.1m 画宽（刨料那一拍）时
// 画面密度到 ~900px/米，150 的贴图要放大六倍，人就糊成一团。480 之后放大不到两倍。
// 骨头都是巴掌大的小图，八种角色一共也就十来兆，代价换得起。
// INK_K 把所有写死的墨线粗细/抖动按同一比例带上来——不然线会细成蛛丝。
const PART_PPM = 480;
const INK_K = PART_PPM / 150;

// 体型（相对成年男子）。柱子在第一章还是个半大孩子，后面才抽条；
// 妹妹比他矮一头多。个头差本身就是叙事：门框上的刻痕量的就是这个。
export const BODY_SCALE = {
  father: 1.0, soldier: 0.99, puppet: 0.97, militia: 0.98,
  family: 0.93, villager: 0.95, player: 0.93, sister: 0.66,
};

// 骨长（米），按 1.72m 身高排布
export const BONE = {
  hipY: 0.62,
  torso: 0.52,
  headR: 0.115,
  upperArm: 0.25,
  foreArm: 0.24,
  thigh: 0.31,
  shin: 0.31,
  foot: 0.19,
};

function MakeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(2, Math.ceil(w));
  c.height = Math.max(2, Math.ceil(h));
  return c;
}

function Tex(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  return t;
}

// 把一段绘制烘成"枢轴在原点"的贴图片
// drawFn(ctx, px, py) 以 (px,py) 为枢轴；padding 留给墨线与抖动
function BakePart(wM, hM, pivotU, pivotV, drawFn) {
  const pad = Math.round(10 * INK_K);   // 留给墨线抖动的边，也要随密度长
  const w = wM * PART_PPM + pad * 2;
  const h = hM * PART_PPM + pad * 2;
  const canvas = MakeCanvas(w, h);
  const ctx = canvas.getContext("2d");
  const px = pad + pivotU * wM * PART_PPM;
  const py = pad + pivotV * hM * PART_PPM;
  drawFn(ctx, px, py);
  const geo = new THREE.PlaneGeometry(w / PART_PPM, h / PART_PPM);
  // 平移几何体，让枢轴落在网格原点
  geo.translate(w / PART_PPM / 2 - px / PART_PPM, -(h / PART_PPM / 2 - py / PART_PPM), 0);
  const mat = new THREE.MeshBasicMaterial({
    map: Tex(canvas), transparent: true, depthWrite: false, depthTest: false,
  });
  return new THREE.Mesh(geo, mat);
}

const rigCache = new Map();

function BuildParts(kind) {
  if (rigCache.has(kind)) return rigCache.get(kind);
  const [coat, coatDark] = ART.RIG_COLOR(kind);
  const P = PART_PPM;
  const parts = {
    torso: () => BakePart(0.42, BONE.torso + 0.06, 0.5, 1,
      (ctx, px, py) => ART.DrawTorsoPart(ctx, px, py, 0.42 * P, BONE.torso * P, kind, kind + "torso", INK_K)),
    head: () => BakePart(0.46, 0.46, 0.42, 1,
      (ctx, px, py) => ART.DrawHeadPart(ctx, px, py, BONE.headR * P, kind, kind + "head", INK_K)),
    upperArmB: () => BakePart(0.13, BONE.upperArm, 0.5, 0,
      (ctx, px, py) => ART.DrawLimb(ctx, px, py, BONE.upperArm * P, 0.13 * P, 0.105 * P, coatDark, kind + "uab", { k: INK_K })),
    foreArmB: () => BakePart(0.12, BONE.foreArm + 0.05, 0.5, 0,
      (ctx, px, py) => {
        ART.DrawLimb(ctx, px, py, BONE.foreArm * P, 0.105 * P, 0.085 * P, coatDark, kind + "fab", { k: INK_K });
        ctx.beginPath();
        ctx.arc(px, py + BONE.foreArm * P, 0.045 * P, 0, Math.PI * 2);
        ctx.fillStyle = ART.PAL.skinDark;
        ctx.fill();
      }),
    upperArmF: () => BakePart(0.13, BONE.upperArm, 0.5, 0,
      (ctx, px, py) => ART.DrawLimb(ctx, px, py, BONE.upperArm * P, 0.13 * P, 0.105 * P, coat, kind + "uaf", { k: INK_K })),
    foreArmF: () => BakePart(0.12, BONE.foreArm + 0.05, 0.5, 0,
      (ctx, px, py) => {
        ART.DrawLimb(ctx, px, py, BONE.foreArm * P, 0.105 * P, 0.085 * P, coat, kind + "faf", { k: INK_K });
        ctx.beginPath();
        ctx.arc(px, py + BONE.foreArm * P, 0.047 * P, 0, Math.PI * 2);
        ctx.fillStyle = ART.PAL.skin;
        ctx.fill();
        ctx.strokeStyle = ART.IN.ink;
        ctx.lineWidth = 3 * INK_K;
        ctx.stroke();
      }),
    thighB: () => BakePart(0.17, BONE.thigh, 0.5, 0,
      (ctx, px, py) => ART.DrawLimb(ctx, px, py, BONE.thigh * P, 0.17 * P, 0.13 * P, coatDark, kind + "thb", { k: INK_K })),
    shinB: () => BakePart(0.14, BONE.shin, 0.5, 0,
      (ctx, px, py) => ART.DrawLimb(ctx, px, py, BONE.shin * P, 0.13 * P, 0.10 * P, "#6b5540", kind + "shb", { k: INK_K })),
    footB: () => BakePart(BONE.foot + 0.05, 0.10, 0.16, 0,
      (ctx, px, py) => ART.DrawFootPart(ctx, px, py, BONE.foot * P, 0.09 * P, "#43331f", kind + "ftb", INK_K)),
    thighF: () => BakePart(0.17, BONE.thigh, 0.5, 0,
      (ctx, px, py) => ART.DrawLimb(ctx, px, py, BONE.thigh * P, 0.17 * P, 0.13 * P, coat, kind + "thf", { k: INK_K })),
    shinF: () => BakePart(0.14, BONE.shin, 0.5, 0,
      (ctx, px, py) => ART.DrawLimb(ctx, px, py, BONE.shin * P, 0.13 * P, 0.10 * P, "#7d6349", kind + "shf", { k: INK_K })),
    footF: () => BakePart(BONE.foot + 0.05, 0.10, 0.16, 0,
      (ctx, px, py) => ART.DrawFootPart(ctx, px, py, BONE.foot * P, 0.09 * P, "#4d3a28", kind + "ftf", INK_K)),
  };
  const built = {};
  for (const k of Object.keys(parts)) built[k] = parts[k]();
  rigCache.set(kind, built);
  return built;
}

// 每个角色需要自己的一份网格（贴图共享，几何与材质克隆）
function CloneMesh(src) {
  const m = new THREE.Mesh(src.geometry, src.material.clone());
  m.material.map = src.material.map;
  return m;
}

/** 组装一具骨架，返回 {group, joints} */
export function CreateRig(kind) {
  const proto = BuildParts(kind);
  const group = new THREE.Group();          // 原点在脚底
  const root = new THREE.Group();           // 胯
  root.position.y = BONE.hipY;
  group.add(root);

  const mk = (key, order) => {
    const m = CloneMesh(proto[key]);
    m.renderOrder = order;
    return m;
  };

  // —— 后侧肢体（画在躯干之后）
  const legBack = new THREE.Group();
  const shinBack = new THREE.Group();
  shinBack.position.y = -BONE.thigh;
  const footBack = new THREE.Group();
  footBack.position.y = -BONE.shin;
  footBack.add(mk("footB", 1));
  shinBack.add(mk("shinB", 1), footBack);
  legBack.add(mk("thighB", 1), shinBack);

  const armBack = new THREE.Group();
  const foreBack = new THREE.Group();
  foreBack.position.y = -BONE.upperArm;
  foreBack.add(mk("foreArmB", 2));
  armBack.add(mk("upperArmB", 2), foreBack);

  // —— 躯干与头
  const torso = new THREE.Group();
  torso.add(mk("torso", 5));
  const head = new THREE.Group();
  head.position.y = BONE.torso;
  head.add(mk("head", 6));
  torso.add(head);

  // —— 前侧肢体（画在躯干之前）
  const legFront = new THREE.Group();
  const shinFront = new THREE.Group();
  shinFront.position.y = -BONE.thigh;
  const footFront = new THREE.Group();
  footFront.position.y = -BONE.shin;
  footFront.add(mk("footF", 7));
  shinFront.add(mk("shinF", 7), footFront);
  legFront.add(mk("thighF", 7), shinFront);

  const armFront = new THREE.Group();
  const foreFront = new THREE.Group();
  foreFront.position.y = -BONE.upperArm;
  foreFront.add(mk("foreArmF", 8));
  armFront.add(mk("upperArmF", 8), foreFront);

  // 挂载顺序即绘制顺序
  root.add(legBack, armBack, torso, legFront, armFront);
  armBack.position.y = BONE.torso * 0.86;
  armFront.position.y = BONE.torso * 0.86;

  return {
    group,
    joints: { root, torso, head, legBack, shinBack, footBack, legFront, shinFront, footFront, armBack, foreBack, armFront, foreFront },
  };
}

const DEG = Math.PI / 180;
function Lerp(a, b, t) { return a + (b - a) * t; }

// ---------------------------------------------------------------------------
// 关键帧轨道：给过场里最重的几拍用的逐帧动画。
//
// 静态姿势（pose）只有"摆到位"，没有"怎么到位"——按跪、挨砸这类动作的分量
// 全在过程里。轨道就是一列带时间戳的关节快照，采样时在相邻两帧之间用
// smoothstep 过渡：匀速插值看着像机器人，缓入缓出才有肌肉的感觉。
//
// 数值是照着即梦生成的参考视频（按跪审问那一段）逐帧对出来的：
// 挣扎向上是慢的、被按回去是快的；抡枪托前有一个明显的蓄力后仰；
// 被砸中后先是整个人向前砸出去，用手撑住，再花很长时间才抬起头。
// 角度单位：度；hipY/hipX：米。缺省关节沿用上一帧的值。
export const TRACKS = {
  // 被按跪着挣扎（循环）：想起身——被按回去——喘一口——再想起身
  pressedStruggle: {
    dur: 3.6, loop: true,
    keys: [
      { t: 0.0, hipY: -0.44, hipX: 0.02, torso: 26, head: -12, thighB: -10, shinB: 98, footB: 26, thighF: -4, shinF: 94, footF: 26, armB: -14, foreB: -18, armF: -18, foreF: -14 },
      { t: 0.9, hipY: -0.40, hipX: 0.00, torso: 6, head: -30, armB: -30, foreB: -26, armF: -34, foreF: -22 },   // 挣起来一点，头抬起
      { t: 1.25, hipY: -0.46, hipX: 0.05, torso: 34, head: -6, armB: -12, foreB: -16, armF: -16, foreF: -12 },  // 被按回去：快
      { t: 1.7, hipY: -0.45, hipX: 0.03, torso: 30, head: -16 },                                               // 伏着喘
      { t: 2.6, hipY: -0.41, hipX: 0.01, torso: 10, head: -34, armB: -28, armF: -32 },                          // 又一次
      { t: 3.1, hipY: -0.46, hipX: 0.05, torso: 34, head: -4 },
      { t: 3.6, hipY: -0.44, hipX: 0.02, torso: 26, head: -12 },
    ],
  },
  // 按人的兵（循环）：双手压着，对方一挣就再压下去
  pressHold: {
    dur: 3.6, loop: true,
    keys: [
      { t: 0.0, hipY: -0.18, hipX: 0.10, torso: 38, head: -20, armB: -74, foreB: -30, armF: -82, foreF: -24, thighB: -44, shinB: 52, thighF: -20, shinF: 24 },
      { t: 0.9, hipY: -0.14, torso: 30, armB: -66, armF: -74 },        // 对方挣起来，手被顶起一点
      { t: 1.25, hipY: -0.22, torso: 44, head: -14, armB: -80, armF: -88 },  // 重新压死：快
      { t: 2.6, hipY: -0.16, torso: 32, armB: -68, armF: -76 },
      { t: 3.1, hipY: -0.22, torso: 44, armB: -80, armF: -88 },
      { t: 3.6, hipY: -0.18, torso: 38, armB: -74, armF: -82 },
    ],
  },
  // 抡枪托（单次）：蓄力后仰慢，抡下去快，收住有回弹
  buttStrike: {
    dur: 2.2, loop: false,
    keys: [
      { t: 0.0, hipY: -0.06, hipX: -0.04, torso: -8, head: -4, armB: -120, foreB: -40, armF: -108, foreF: -36, thighB: -26, shinB: 26, thighF: 14, shinF: 10 },
      { t: 0.75, hipY: -0.10, hipX: -0.14, torso: -30, head: -10, armB: -196, foreB: -54, armF: -182, foreF: -48 },  // 举过头顶：蓄力
      { t: 0.95, hipY: -0.16, hipX: 0.16, torso: 46, head: -26, armB: -52, foreB: -18, armF: -40, foreF: -12 },      // 砸下：0.2s，全程最快的一下
      { t: 1.25, hipY: -0.12, hipX: 0.10, torso: 34, head: -18, armB: -64, foreB: -24, armF: -52, foreF: -18 },      // 回弹
      { t: 2.2, hipY: -0.06, hipX: -0.02, torso: -4, head: -6, armB: -58, foreB: -44, armF: -46, foreF: -38 },      // 收回，枪垂在身前
    ],
  },
  // 妹妹在树下仰头跳着够（循环）：蹲一下、蹦起来伸手、落地、望着喘口气——
  // 她的视线与够不着的那只手就是引导线（无文字引导三层配方之三）
  reachJump: {
    dur: 1.7, loop: true,
    keys: [
      { t: 0.0, hipY: -0.07, hipX: 0.02, torso: 8, head: -34, armF: -44, foreF: -12, armB: -12, foreB: -10, thighB: -18, shinB: 24, footB: -4, thighF: -14, shinF: 20, footF: -4 },
      { t: 0.22, hipY: 0.15, hipX: 0.03, torso: -4, head: -30, armF: -166, foreF: -6, armB: -20, foreB: -8, thighB: -24, shinB: 34, thighF: -30, shinF: 40 },
      { t: 0.45, hipY: -0.02, hipX: 0.02, torso: 10, head: -28, armF: -70, foreF: -14, thighB: -14, shinB: 18, thighF: -10, shinF: 14 },
      { t: 0.78, hipY: -0.11, hipX: 0.02, torso: 12, head: -26, armF: -34, foreF: -12 },
      { t: 1.15, hipY: -0.04, hipX: 0.02, torso: 6, head: -34, armF: -48, foreF: -12 },
      { t: 1.7, hipY: -0.07, hipX: 0.02, torso: 8, head: -34, armF: -44, foreF: -12 },
    ],
  },
  // 拉锯（循环）：木匠的常态活。推出去那一下吃力（躯干跟着送），回拉轻快；
  // 后手搭在料上不动。锯（DrawCarry「锯」）挂在前手上、随前臂转——
  // 手臂一伸一屈，锯就一进一出。
  sawing: {
    dur: 1.5, loop: true,
    keys: [
      { t: 0.0, hipY: -0.08, hipX: 0.07, torso: 26, head: -20, armF: -60, foreF: -12, armB: -46, foreB: -22, thighB: -22, shinB: 28, footB: -6, thighF: 14, shinF: 8, footF: -8 },
      { t: 0.42, hipY: -0.06, hipX: 0.00, torso: 17, head: -18, armF: -86, foreF: -46 },   // 回拉：肘折回来
      { t: 0.78, hipY: -0.08, hipX: 0.07, torso: 26, head: -20, armF: -60, foreF: -12 },   // 再推
      { t: 1.14, hipY: -0.06, hipX: 0.01, torso: 18, head: -18, armF: -84, foreF: -44 },
      { t: 1.5, hipY: -0.08, hipX: 0.07, torso: 26, head: -20, armF: -60, foreF: -12 },
    ],
  },
  // 锄地（循环）：扬起来慢、落下去快，落了还要往回带一下松土。
  // 双手都在把上（前后臂同相位），锄（DrawCarry「锄头」）随前臂转——
  // 扬过肩、砸进土、拖回来，一整套都在手上。
  hoeing: {
    dur: 2.3, loop: true,
    keys: [
      { t: 0.0, hipY: -0.02, hipX: -0.04, torso: -6, head: -10, armF: -118, foreF: -30, armB: -104, foreB: -36, thighB: -16, shinB: 20, footB: -6, thighF: 10, shinF: 6, footF: -8 },
      { t: 0.45, hipY: -0.22, hipX: 0.12, torso: 44, head: -26, armF: -46, foreF: -10, armB: -38, foreB: -14 },  // 落锄：全程最快的一下
      { t: 0.9, hipY: -0.18, hipX: 0.08, torso: 38, head: -22, armF: -56, foreF: -24, armB: -46, foreB: -26 },   // 往回带，松土
      { t: 1.55, hipY: -0.07, hipX: 0.00, torso: 8, head: -12, armF: -94, foreF: -28, armB: -82, foreB: -32 },   // 慢慢扬起来
      { t: 2.3, hipY: -0.02, hipX: -0.04, torso: -6, head: -10, armF: -118, foreF: -30, armB: -104, foreB: -36 },
    ],
  },
  // 挨砸（单次）：整个人向前砸出去，双手撑地，很慢地摇着头抬起来
  struckFall: {
    dur: 3.4, loop: false,
    keys: [
      { t: 0.0, hipY: -0.44, hipX: 0.02, torso: 26, head: -12, thighB: -10, shinB: 98, footB: 26, thighF: -4, shinF: 94, footF: 26, armB: -14, foreB: -18, armF: -18, foreF: -14 },
      { t: 0.18, hipY: -0.50, hipX: 0.24, torso: 74, head: -40, armB: -96, foreB: -14, armF: -104, foreF: -10 },  // 被砸得扑出去：0.18s
      { t: 0.55, hipY: -0.52, hipX: 0.22, torso: 78, head: -34, armB: -90, foreB: -12, armF: -98, foreF: -8 },    // 撑住，沉底
      { t: 1.6, hipY: -0.50, hipX: 0.18, torso: 66, head: -50 },                                                  // 半天不动
      { t: 2.3, hipY: -0.48, hipX: 0.13, torso: 54, head: -30 },                                                  // 慢慢起来一点
      { t: 2.7, hipY: -0.48, hipX: 0.13, torso: 56, head: -42 },                                                  // 摇头：一边
      { t: 3.05, hipY: -0.47, hipX: 0.12, torso: 52, head: -22 },                                                 // 另一边
      { t: 3.4, hipY: -0.46, hipX: 0.09, torso: 44, head: -28 },
    ],
  },
};

const TRACK_JOINTS = ["torso", "head", "thighB", "shinB", "footB", "thighF", "shinF", "footF", "armB", "foreB", "armF", "foreF"];

// 采样：找到 t 两侧的关键帧，缺省关节先向前找最近一次显式赋值
function SampleTrack(name, time) {
  const tr = TRACKS[name];
  if (!tr) return null;
  const t = tr.loop ? time % tr.dur : Math.min(time, tr.dur - 1e-4);
  const keys = tr.keys;
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].t <= t) i += 1;
  const a = keys[i];
  const b = keys[Math.min(i + 1, keys.length - 1)];
  const span = Math.max(1e-4, b.t - a.t);
  let u = Math.max(0, Math.min(1, (t - a.t) / span));
  u = u * u * (3 - 2 * u);           // smoothstep：缓入缓出
  const ValAt = (ki, joint) => {
    for (let k = ki; k >= 0; k -= 1) if (keys[k][joint] !== undefined) return keys[k][joint];
    for (let k = ki + 1; k < keys.length; k += 1) if (keys[k][joint] !== undefined) return keys[k][joint];
    return 0;
  };
  const out = {};
  for (const joint of ["hipY", "hipX"]) out[joint] = Lerp(ValAt(i, joint), ValAt(Math.min(i + 1, keys.length - 1), joint), u);
  for (const joint of TRACK_JOINTS) out[joint] = Lerp(ValAt(i, joint), ValAt(Math.min(i + 1, keys.length - 1), joint), u) * DEG;
  return out;
}


/**
 * 姿态解算：把状态映射成关节角度。
 * state: {phase, moving, crouch, carry, climbing, digging, aiming, posture, pose, poseK}
 * posture: stand | stoop | squat | crawl —— 地道各段净高不同，见 Core 的 TunnelPosture
 * poseK: 0..1 的动作进度，驱动 planePush（推程）/ vault（翻越）这类姿势——不是时间
 * 所有角度用弧度，正值 = 顺时针（面朝 +x 时向前）
 */
export function PoseRig(rig, s, dt) {
  const j = rig.joints;
  const p = s.phase || 0;
  const blend = Math.min(1, (dt || 0.016) * 12);   // 姿态之间连续过渡，不会跳
  const t = rig.pose || (rig.pose = {
    hipY: 0, hipX: 0, torso: 0, head: 0,
    thighB: 0, shinB: 0, footB: 0, thighF: 0, shinF: 0, footF: 0,
    armB: 0, foreB: 0, armF: 0, foreF: 0,
  });

  const target = {};
  const swing = Math.sin(p);
  const swing2 = Math.sin(p + Math.PI);

  // ── 关键帧轨道：过场里最重的几拍，逐帧对着参考视频 K 的 ──
  const tracked = s.track ? SampleTrack(s.track, s.trackT || 0) : null;
  if (tracked) {
    Object.assign(target, tracked);
    // 轨道自己带节奏，混合只是防跳变——太重会把 0.2s 的砸击糊成慢动作
    ApplyPose(rig, t, target, Math.min(1, (dt || 0.016) * 26));
    return;
  }

  // ── 一次性戏剧姿势 ──
  // 跪、挨砸、扑上去、被架走、把人搂进肩膀……这些是过场里最重的几拍，
  // 之前全靠字幕描述，演员站着不动。它们优先于走路/猫腰这类常态姿态。
  if (s.pose === "kneel") {
    // 被按着跪在地上：小腿贴地，上身被人从后面压着
    target.hipY = -0.52; target.hipX = 0.02;
    target.torso = 26 * DEG; target.head = -12 * DEG;
    target.thighB = -96 * DEG; target.shinB = 96 * DEG; target.footB = 8 * DEG;
    target.thighF = -92 * DEG; target.shinF = 100 * DEG; target.footF = 8 * DEG;
    target.armB = -14 * DEG; target.foreB = -18 * DEG;
    target.armF = -18 * DEG; target.foreF = -14 * DEG;
  } else if (s.pose === "struck") {
    // 挨了一下：上身被打得往前甩，膝一软，手先撑出去
    target.hipY = -0.34; target.hipX = 0.14;
    target.torso = 62 * DEG; target.head = -46 * DEG;
    target.thighB = -70 * DEG; target.shinB = 78 * DEG; target.footB = -8 * DEG;
    target.thighF = -30 * DEG; target.shinF = 26 * DEG; target.footF = -16 * DEG;
    target.armB = -102 * DEG; target.foreB = -26 * DEG;
    target.armF = -84 * DEG; target.foreF = -34 * DEG;
  } else if (s.pose === "lunge") {
    // 扑上去：整个人前倾，两只手往前够
    target.hipY = -0.16; target.hipX = 0.20;
    target.torso = 48 * DEG; target.head = -30 * DEG;
    target.armB = -128 * DEG; target.foreB = -10 * DEG;
    target.armF = -136 * DEG; target.foreF = -6 * DEG;
    target.thighB = -62 * DEG; target.shinB = 40 * DEG; target.footB = -18 * DEG;
    target.thighF = 22 * DEG; target.shinF = 16 * DEG; target.footF = -20 * DEG;
  } else if (s.pose === "hauled") {
    // 被两个人架着往外拖：胳膊被人从两边提起来，脚拖在地上
    const drag = s.moving ? Math.sin(p * 2.2) * 8 : 0;
    target.hipY = -0.22; target.hipX = -0.06;
    target.torso = -12 * DEG; target.head = 16 * DEG;
    target.armB = -150 * DEG; target.foreB = -8 * DEG;
    target.armF = -150 * DEG; target.foreF = -8 * DEG;
    target.thighB = (-16 + drag) * DEG; target.shinB = 20 * DEG; target.footB = 24 * DEG;
    target.thighF = (6 - drag) * DEG; target.shinF = 8 * DEG; target.footF = 26 * DEG;
  } else if (s.pose === "dragged") {
    // 被人从背后死死抱住往回拖：身子朝前挣、脚在地上蹭
    const drag = s.moving ? Math.sin(p * 2.6) * 10 : 0;
    target.hipY = -0.30; target.hipX = 0.10;
    target.torso = 30 * DEG; target.head = -18 * DEG;
    target.armB = -118 * DEG; target.foreB = -30 * DEG;
    target.armF = -108 * DEG; target.foreF = -38 * DEG;
    target.thighB = (-40 + drag) * DEG; target.shinB = 54 * DEG; target.footB = 18 * DEG;
    target.thighF = (-14 - drag) * DEG; target.shinF = 30 * DEG; target.footF = 22 * DEG;
  } else if (s.pose === "shelter") {
    // 把人搂进自己肩膀：近侧手臂抬起来绕过去，头低下护住
    target.hipY = -0.06; target.hipX = 0.02;
    target.torso = 12 * DEG; target.head = -22 * DEG;
    target.armF = -128 * DEG; target.foreF = -62 * DEG;
    target.armB = -26 * DEG; target.foreB = -30 * DEG;
    target.thighB = -14 * DEG; target.shinB = 16 * DEG; target.footB = -6 * DEG;
    target.thighF = 10 * DEG; target.shinF = 8 * DEG; target.footF = -8 * DEG;
  } else if (s.pose === "leanIn") {
    // 把额头抵在别人肩上：脖子前倾贴过去，手垂着
    target.hipY = -0.04; target.hipX = 0.06;
    target.torso = 20 * DEG; target.head = -34 * DEG;
    target.armB = -12 * DEG; target.foreB = -16 * DEG;
    target.armF = -16 * DEG; target.foreF = -20 * DEG;
    target.thighB = -10 * DEG; target.shinB = 12 * DEG; target.footB = -4 * DEG;
    target.thighF = 8 * DEG; target.shinF = 6 * DEG; target.footF = -6 * DEG;
  } else if (s.pose === "mark") {
    // 伸手在门框上比划：略侧身，近侧手臂抬到头顶那么高，另一只手扶着框
    target.hipY = -0.04; target.hipX = 0.03;
    target.torso = 10 * DEG; target.head = -14 * DEG;
    target.armF = -152 * DEG; target.foreF = -16 * DEG;
    target.armB = -46 * DEG; target.foreB = -54 * DEG;
    target.thighB = -12 * DEG; target.shinB = 14 * DEG; target.footB = -6 * DEG;
    target.thighF = 12 * DEG; target.shinF = 8 * DEG; target.footF = -8 * DEG;
  } else if (s.pose === "swing") {
    // 抡枪托：胳膊举到头顶后方，整个人拧过去
    target.hipY = -0.08; target.hipX = -0.10;
    target.torso = -22 * DEG; target.head = -8 * DEG;
    target.armB = -186 * DEG; target.foreB = -50 * DEG;
    target.armF = -170 * DEG; target.foreF = -44 * DEG;
    target.thighB = -34 * DEG; target.shinB = 30 * DEG; target.footB = -8 * DEG;
    target.thighF = 20 * DEG; target.shinF = 10 * DEG; target.footF = -12 * DEG;
  } else if (s.pose === "bow") {
    // ── 动词姿势（规范：每个玩法动词都要有对应动画）──
    // 弯腰拾东西：塌腰探手，另一只手向后压着找平衡
    target.hipY = -0.30; target.hipX = 0.10;
    target.torso = 58 * DEG; target.head = -30 * DEG;
    target.armF = -78 * DEG; target.foreF = -18 * DEG;
    target.armB = -22 * DEG; target.foreB = -10 * DEG;
    target.thighB = -46 * DEG; target.shinB = 52 * DEG; target.footB = -6 * DEG;
    target.thighF = -22 * DEG; target.shinF = 30 * DEG; target.footF = -10 * DEG;
  } else if (s.pose === "throwArm") {
    // 投掷收势：石子刚出手，臂甩到前上方，上身跟着送出去
    target.hipY = -0.06; target.hipX = 0.16;
    target.torso = 24 * DEG; target.head = -10 * DEG;
    target.armF = -122 * DEG; target.foreF = -4 * DEG;
    target.armB = -6 * DEG; target.foreB = -22 * DEG;
    target.thighB = -42 * DEG; target.shinB = 30 * DEG; target.footB = -10 * DEG;
    target.thighF = 18 * DEG; target.shinF = 10 * DEG; target.footF = -12 * DEG;
  } else if (s.pose === "planePush") {
    // 刨料：**姿势由推程直接驱动**（s.poseK 0→1），不是播一段循环给玩家看。
    // 他推多远，这具身子就送多远——手上的分量就是从这儿来的。
    // 起手弓腰、重心在后脚、两手压在刨子上；推出去时胯往前送、双臂伸直、
    // 上身跟着压下去。中国木匠是在矮长凳上刨料的，所以腰折得很深。
    const u = Math.max(0, Math.min(1, s.poseK ?? 0));
    const e = u * u * (3 - 2 * u);            // 缓入缓出：起步与收势都不生硬
    target.hipY = -0.13 - e * 0.05;
    target.hipX = -0.05 + e * 0.30;
    // 腰弓到 34° 就够了：再深头就埋进台面，画面上分不清人和木头
    target.torso = (32 + e * 8) * DEG;
    target.head = (-20 - e * 6) * DEG;
    // 双手都压在刨子上：前后臂同相位，随推程从"折回胸前"伸到"探到最远"
    target.armF = (-52 - e * 34) * DEG;
    target.foreF = (-58 + e * 50) * DEG;
    target.armB = (-44 - e * 32) * DEG;
    target.foreB = (-54 + e * 48) * DEG;
    // 前脚蹬住、后腿把身子往前送
    target.thighB = (-34 + e * 18) * DEG;
    target.shinB = (40 - e * 14) * DEG;
    target.footB = -10 * DEG;
    target.thighF = (18 - e * 10) * DEG;
    target.shinF = (10 + e * 8) * DEG;
    target.footF = -10 * DEG;
  } else if (s.pose === "crank") {
    // 摇辘轳：两手一前一后画圈，脚步扎稳
    const ph = p * 2.4;
    const ca = Math.sin(ph), cb = Math.cos(ph);
    target.hipY = -0.10; target.hipX = 0.08;
    target.torso = 18 * DEG; target.head = -10 * DEG;
    target.armF = (-96 + ca * 26) * DEG; target.foreF = (-30 + cb * 20) * DEG;
    target.armB = (-82 - ca * 26) * DEG; target.foreB = (-36 - cb * 20) * DEG;
    target.thighB = -18 * DEG; target.shinB = 20 * DEG; target.footB = -6 * DEG;
    target.thighF = 12 * DEG; target.shinF = 8 * DEG; target.footF = -8 * DEG;
  } else if (s.pose === "vault" || s.pose === "clamber") {
    // 翻越：三段——① 手够上顶沿、后腿蹬地；② 撑起来把腿收到胸前荡过去；
    // ③ 脚先落地、屈膝卸力。姿势按 poseK（Core 给的动作进度）在关键帧之间插，
    // 而不是从头到尾摆一个造型平移过去——那就是"没做动画"的样子。
    const k = Math.max(0, Math.min(1, s.poseK ?? 0.5));
    const heavy = s.pose === "clamber";
    // ① 起手：够顶沿
    const A = {
      hipY: -0.10, hipX: 0.12, torso: 46, head: -26,
      armF: -128, foreF: -14, armB: -34, foreB: -20,
      thighB: -38, shinB: 44, footB: -10, thighF: 10, shinF: 18, footF: -12,
    };
    // ② 顶点：两臂笔直撑住，膝盖收到胸口——整个人骑在顶沿上方
    const B = {
      hipY: 0.06, hipX: 0.20, torso: 54, head: -30,
      armF: -74, foreF: 10, armB: -62, foreB: 8,
      thighB: -104, shinB: 112, footB: 16, thighF: -86, shinF: 98, footF: 14,
    };
    // ③ 落地：腿先伸出去接地，上身还压着，胳膊甩到后面找平衡
    const C = {
      hipY: -0.22, hipX: 0.06, torso: 30, head: -14,
      armF: -30, foreF: -26, armB: 26, foreB: -18,
      thighB: -18, shinB: 34, footB: -6, thighF: -46, shinF: 40, footF: -16,
    };
    // 扛着东西那一档：一只手始终拎着，撑不成两手，所以身子更低、更慢
    if (heavy) {
      B.armF = -22; B.foreF = -34; B.torso = 62; B.hipY = -0.04;
      C.armF = -18; C.foreF = -30;
    }
    const mid = heavy ? 0.48 : 0.42;
    let from = A, to = B, u = k / mid;
    if (k >= mid) { from = B; to = C; u = (k - mid) / (1 - mid); }
    u = u * u * (3 - 2 * u);                    // 段内也平滑，关键帧之间不会顿一下
    for (const key of Object.keys(A)) {
      const v = from[key] + (to[key] - from[key]) * u;
      target[key] = (key === "hipY" || key === "hipX") ? v : v * DEG;
    }
    // 翻越是硬动作，混合给到最快——0.8 秒的戏被平滑掉就成了慢动作
    ApplyPose(rig, t, target, Math.min(1, (dt || 0.016) * 30));
    return;
  } else if (s.pose === "puzzled") {
    // 哑剧的「不太懂」：微微后仰、仰着头，手垂着——配头顶的「？」气泡
    target.hipY = -0.02; target.hipX = -0.02;
    target.torso = -6 * DEG; target.head = -34 * DEG;
    target.armB = -8 * DEG; target.foreB = -12 * DEG;
    target.armF = -12 * DEG; target.foreF = -16 * DEG;
    target.thighB = -6 * DEG; target.shinB = 8 * DEG; target.footB = -2 * DEG;
    target.thighF = 6 * DEG; target.shinF = 4 * DEG; target.footF = -4 * DEG;
  } else if (s.pose === "push") {
    // 推车：前倾压着车把，腿在后面蹬——腿保留走步摆动，人不是滑过去的
    const c = s.moving;
    target.hipY = -0.10; target.hipX = 0.14;
    target.torso = 32 * DEG; target.head = -12 * DEG;
    target.armF = -74 * DEG; target.foreF = -26 * DEG;
    target.armB = -66 * DEG; target.foreB = -30 * DEG;
    target.thighB = (-26 + (c ? swing2 * 22 : 0)) * DEG;
    target.shinB = (34 - (c ? swing2 * 16 : 0)) * DEG;
    target.footB = -8 * DEG;
    target.thighF = (-20 + (c ? swing * 22 : 0)) * DEG;
    target.shinF = (28 - (c ? swing * 16 : 0)) * DEG;
    target.footF = -8 * DEG;
  } else if (s.climbing) {
    // 爬梯：双手交替上够，腿蹬阶
    target.hipY = 0; target.hipX = 0;
    target.torso = -4 * DEG;
    target.head = 6 * DEG;
    target.armB = Lerp(-150, -110, (swing + 1) / 2) * DEG;
    target.foreB = -34 * DEG;
    target.armF = Lerp(-110, -150, (swing + 1) / 2) * DEG;
    target.foreF = -34 * DEG;
    target.thighB = Lerp(-10, -46, (swing2 + 1) / 2) * DEG;
    target.shinB = 44 * DEG;
    target.thighF = Lerp(-46, -10, (swing2 + 1) / 2) * DEG;
    target.shinF = 44 * DEG;
    target.footB = 10 * DEG; target.footF = 10 * DEG;
  } else if (s.digging) {
    // 挖土/施工：躬身，双手在身前一推一收
    const push = Math.sin(p * 1.6);
    target.hipY = -0.10; target.hipX = 0.03;
    target.torso = 34 * DEG;
    target.head = -18 * DEG;
    target.armB = (-48 + push * 22) * DEG;
    target.foreB = (-52 - push * 26) * DEG;
    target.armF = (-56 + push * 24) * DEG;
    target.foreF = (-46 - push * 28) * DEG;
    target.thighB = -26 * DEG; target.shinB = 32 * DEG; target.footB = -6 * DEG;
    target.thighF = 16 * DEG; target.shinF = 12 * DEG; target.footF = -14 * DEG;
  } else if (s.posture === "crawl") {
    // 爬行：手脚并用。躯干压到近水平，四肢交替往前够——地道最窄的那几段
    // （卡口、连夜赶工掏出来的新口）只能这么过去。
    const c = s.moving ? 1 : 0;
    target.hipY = -0.66 + (c ? Math.abs(Math.sin(p)) * 0.02 : 0);
    target.hipX = 0.10;
    target.torso = 76 * DEG;
    target.head = -62 * DEG;          // 躯干快趴平了，脖子得抬起来才看得见前面
    target.armB = (-96 + (c ? swing * 30 : 0)) * DEG;
    target.foreB = -18 * DEG;
    target.armF = (-96 + (c ? swing2 * 30 : 0)) * DEG;
    target.foreF = -18 * DEG;
    target.thighB = (-88 + (c ? swing2 * 20 : 0)) * DEG;
    target.shinB = 92 * DEG;
    target.footB = -30 * DEG;
    target.thighF = (-88 + (c ? swing * 20 : 0)) * DEG;
    target.shinF = 92 * DEG;
    target.footF = -30 * DEG;
  } else if (s.posture === "stoop") {
    // 猫腰：地道里的常态。不是蹲，是弓着背走——胯只略沉，腰折下去，
    // 头压在洞顶底下，手垂在身前随时撑一把。走得比站着慢，但还是在走。
    const c = s.moving ? 1 : 0;
    target.hipY = -0.14 + (c ? Math.abs(Math.sin(p)) * 0.024 : 0);
    target.hipX = 0.05;
    target.torso = 46 * DEG;
    target.head = -34 * DEG;
    target.armB = (-38 + (c ? swing * 18 : 0)) * DEG;
    target.foreB = -40 * DEG;
    target.armF = (-44 + (c ? swing2 * 18 : 0)) * DEG;
    target.foreF = -36 * DEG;
    target.thighB = (-30 + (c ? swing2 * 26 : 0)) * DEG;
    target.shinB = (40 - (c ? swing2 * 18 : 0)) * DEG;
    target.footB = -12 * DEG;
    target.thighF = (-30 + (c ? swing * 26 : 0)) * DEG;
    target.shinF = (40 - (c ? swing * 18 : 0)) * DEG;
    target.footF = -12 * DEG;
  } else if (s.crouch) {
    // 半蹲：胯下沉、上身前倾、膝深弯；移动时小步挪
    const c = s.moving ? 1 : 0;
    target.hipY = -0.30 + (c ? Math.abs(Math.sin(p)) * 0.03 : 0);
    target.hipX = 0.04;
    target.torso = 30 * DEG;
    target.head = -20 * DEG;
    target.thighB = (-54 + (c ? swing2 * 16 : 0)) * DEG;
    target.shinB = (76 - (c ? swing2 * 14 : 0)) * DEG;
    target.footB = -22 * DEG;
    target.thighF = (-54 + (c ? swing * 16 : 0)) * DEG;
    target.shinF = (76 - (c ? swing * 14 : 0)) * DEG;
    target.footF = -22 * DEG;
    target.armB = (-24 + (c ? swing * 10 : 0)) * DEG;
    target.foreB = -52 * DEG;
    target.armF = (-30 + (c ? swing2 * 10 : 0)) * DEG;
    target.foreF = -58 * DEG;
  } else if (s.carry) {
    // 扛：东西搁在肩上，近侧手臂上抬扶住（肘朝外），另一只手自然垂着摆动；
    // 肩担了重量，躯干朝反侧微倾配重，脖子略偏。
    target.hipY = s.moving ? Math.abs(Math.sin(p)) * 0.026 : 0;
    target.hipX = -0.02;
    target.torso = -7 * DEG;
    target.head = 6 * DEG;
    // 前臂：大臂抬到近水平、小臂折回来，手正好搭在肩头的木料上
    target.armF = -104 * DEG;
    target.foreF = -64 * DEG;
    // 后臂：不参与扶，随步子自然摆
    target.armB = (s.moving ? Math.sin(p) * 18 : 6) * DEG;
    target.foreB = -18 * DEG;
    const st = s.moving ? 1 : 0;
    target.thighB = swing2 * 20 * st * DEG;
    target.shinB = Math.max(0, -swing2) * 34 * st * DEG;
    target.footB = -swing2 * 8 * st * DEG;
    target.thighF = swing * 20 * st * DEG;
    target.shinF = Math.max(0, -swing) * 34 * st * DEG;
    target.footF = -swing * 8 * st * DEG;
  } else if (s.moving) {
    // 走：大腿摆、小腿在后摆时折起、手臂反向摆、躯干微前倾、上下起伏
    target.hipY = Math.abs(Math.sin(p)) * 0.035;
    target.hipX = 0;
    target.torso = 5 * DEG;
    target.head = -2 * DEG;
    target.thighB = swing2 * 30 * DEG;
    target.shinB = Math.max(0, -swing2) * 52 * DEG;
    target.footB = (-swing2 * 12 - 4) * DEG;
    target.thighF = swing * 30 * DEG;
    target.shinF = Math.max(0, -swing) * 52 * DEG;
    target.footF = (-swing * 12 - 4) * DEG;
    target.armB = swing * 26 * DEG;
    target.foreB = (-16 + Math.max(0, swing) * 20) * DEG;
    target.armF = swing2 * 26 * DEG;
    target.foreF = (-16 + Math.max(0, swing2) * 20) * DEG;
  } else {
    // 站立：呼吸带动肩与头，重心轻微前后
    const br = Math.sin(s.breath || 0);
    target.hipY = br * 0.012;
    target.hipX = 0;
    target.torso = (1.5 + br * 1.2) * DEG;
    target.head = (-1 - br * 1.5) * DEG;
    target.thighB = -3 * DEG; target.shinB = 4 * DEG; target.footB = -3 * DEG;
    target.thighF = 3 * DEG; target.shinF = 2 * DEG; target.footF = -3 * DEG;
    target.armB = (4 + br * 2) * DEG; target.foreB = (-12 - br * 3) * DEG;
    target.armF = (-4 - br * 2) * DEG; target.foreF = (-14 - br * 3) * DEG;
  }

  ApplyPose(rig, t, target, blend);
}

// 混合进当前姿态并写到关节上。轨道采样和状态姿势都从这儿出去
function ApplyPose(rig, t, target, blend) {
  const j = rig.joints;
  for (const k of Object.keys(target)) t[k] = Lerp(t[k], target[k], blend);

  j.root.position.set(t.hipX, BONE.hipY + t.hipY, 0);
  j.torso.rotation.z = -t.torso;
  j.head.rotation.z = -t.head;
  j.legBack.rotation.z = -t.thighB;
  j.shinBack.rotation.z = -t.shinB;
  j.footBack.rotation.z = -t.footB;
  j.legFront.rotation.z = -t.thighF;
  j.shinFront.rotation.z = -t.shinF;
  j.footFront.rotation.z = -t.footF;
  j.armBack.rotation.z = -t.armB;
  j.foreBack.rotation.z = -t.foreB;
  j.armFront.rotation.z = -t.armF;
  j.foreFront.rotation.z = -t.foreF;
  // 躯干带着肩走
  j.armBack.position.y = BONE.torso * 0.86;
  j.armFront.position.y = BONE.torso * 0.86;
}

/** 前臂末端（手）的世界坐标 */
export function HandPoint(rig) {
  const j = rig.joints;
  const v = new THREE.Vector3(0, -BONE.foreArm, 0);
  j.foreFront.updateWorldMatrix(true, false);
  return v.applyMatrix4(j.foreFront.matrixWorld);
}

/** 肘点的世界坐标：手里的长家伙（锯/锄头）要顺着前臂的方向摆 */
export function ElbowPoint(rig) {
  const j = rig.joints;
  j.foreFront.updateWorldMatrix(true, false);
  return new THREE.Vector3(0, 0, 0).applyMatrix4(j.foreFront.matrixWorld);
}

/** 肩点的世界坐标：扛的东西搁在这儿 */
export function ShoulderPoint(rig) {
  const j = rig.joints;
  j.armFront.updateWorldMatrix(true, false);
  return new THREE.Vector3(0, 0.06, 0).applyMatrix4(j.armFront.matrixWorld);
}
