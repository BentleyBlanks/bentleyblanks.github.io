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

const PART_PPM = 150;   // 零件贴图密度（像素/米）——比场景件高得多，特写不糊

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
  const pad = 10;
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
      (ctx, px, py) => ART.DrawTorsoPart(ctx, px, py, 0.42 * P, BONE.torso * P, kind, kind + "torso")),
    head: () => BakePart(0.46, 0.46, 0.42, 1,
      (ctx, px, py) => ART.DrawHeadPart(ctx, px, py, BONE.headR * P, kind, kind + "head")),
    upperArmB: () => BakePart(0.13, BONE.upperArm, 0.5, 0,
      (ctx, px, py) => ART.DrawLimb(ctx, px, py, BONE.upperArm * P, 0.13 * P, 0.105 * P, coatDark, kind + "uab")),
    foreArmB: () => BakePart(0.12, BONE.foreArm + 0.05, 0.5, 0,
      (ctx, px, py) => {
        ART.DrawLimb(ctx, px, py, BONE.foreArm * P, 0.105 * P, 0.085 * P, coatDark, kind + "fab");
        ctx.beginPath();
        ctx.arc(px, py + BONE.foreArm * P, 0.045 * P, 0, Math.PI * 2);
        ctx.fillStyle = ART.PAL.skinDark;
        ctx.fill();
      }),
    upperArmF: () => BakePart(0.13, BONE.upperArm, 0.5, 0,
      (ctx, px, py) => ART.DrawLimb(ctx, px, py, BONE.upperArm * P, 0.13 * P, 0.105 * P, coat, kind + "uaf")),
    foreArmF: () => BakePart(0.12, BONE.foreArm + 0.05, 0.5, 0,
      (ctx, px, py) => {
        ART.DrawLimb(ctx, px, py, BONE.foreArm * P, 0.105 * P, 0.085 * P, coat, kind + "faf");
        ctx.beginPath();
        ctx.arc(px, py + BONE.foreArm * P, 0.047 * P, 0, Math.PI * 2);
        ctx.fillStyle = ART.PAL.skin;
        ctx.fill();
        ctx.strokeStyle = ART.IN.ink;
        ctx.lineWidth = 3;
        ctx.stroke();
      }),
    thighB: () => BakePart(0.17, BONE.thigh, 0.5, 0,
      (ctx, px, py) => ART.DrawLimb(ctx, px, py, BONE.thigh * P, 0.17 * P, 0.13 * P, coatDark, kind + "thb")),
    shinB: () => BakePart(0.14, BONE.shin, 0.5, 0,
      (ctx, px, py) => ART.DrawLimb(ctx, px, py, BONE.shin * P, 0.13 * P, 0.10 * P, "#6b5540", kind + "shb")),
    footB: () => BakePart(BONE.foot + 0.05, 0.10, 0.16, 0,
      (ctx, px, py) => ART.DrawFootPart(ctx, px, py, BONE.foot * P, 0.09 * P, "#43331f", kind + "ftb")),
    thighF: () => BakePart(0.17, BONE.thigh, 0.5, 0,
      (ctx, px, py) => ART.DrawLimb(ctx, px, py, BONE.thigh * P, 0.17 * P, 0.13 * P, coat, kind + "thf")),
    shinF: () => BakePart(0.14, BONE.shin, 0.5, 0,
      (ctx, px, py) => ART.DrawLimb(ctx, px, py, BONE.shin * P, 0.13 * P, 0.10 * P, "#7d6349", kind + "shf")),
    footF: () => BakePart(BONE.foot + 0.05, 0.10, 0.16, 0,
      (ctx, px, py) => ART.DrawFootPart(ctx, px, py, BONE.foot * P, 0.09 * P, "#4d3a28", kind + "ftf")),
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

/**
 * 姿态解算：把状态映射成关节角度。
 * state: {phase, moving, crouch, carry, climbing, digging, aiming, posture}
 * posture: stand | stoop | squat | crawl —— 地道各段净高不同，见 Core 的 TunnelPosture
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

/** 肩点的世界坐标：扛的东西搁在这儿 */
export function ShoulderPoint(rig) {
  const j = rig.joints;
  j.armFront.updateWorldMatrix(true, false);
  return new THREE.Vector3(0, 0.06, 0).applyMatrix4(j.armFront.matrixWorld);
}
