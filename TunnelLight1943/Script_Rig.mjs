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
  father: 1.0, soldier: 0.99, officer: 0.98, puppet: 0.97, militia: 0.98,
  family: 0.90, villager: 0.95, player: 0.93, sister: 0.66,
};

// 骨长（米），按 1.72m 身高排布
export const BONE = {
  hipY: 0.62,
  torso: 0.52,
  torsoW: 0.29,   // 侧视躯干厚度（＝胸廓前后厚，不是肩宽）
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
function BakePart(wM, hM, pivotU, pivotV, drawFn, haze = null) {
  const pad = Math.round(10 * INK_K);   // 留给墨线抖动的边，也要随密度长
  const w = wM * PART_PPM + pad * 2;
  const h = hM * PART_PPM + pad * 2;
  const canvas = MakeCanvas(w, h);
  const ctx = canvas.getContext("2d");
  const px = pad + pivotU * wM * PART_PPM;
  const py = pad + pivotV * hM * PART_PPM;
  drawFn(ctx, px, py);
  // 空气透视：染在这块骨头**自己**身上（source-atop），不是把整个人调半透明。
  // 背景层的人一半透明，身后的树和炮楼就从他身上透出来——那是穿帮不是雾。
  if (haze && haze.amount > 0) {
    ctx.globalCompositeOperation = "source-atop";
    ctx.globalAlpha = haze.amount;
    ctx.fillStyle = haze.color;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
  const geo = new THREE.PlaneGeometry(w / PART_PPM, h / PART_PPM);
  // 平移几何体，让枢轴落在网格原点
  geo.translate(w / PART_PPM / 2 - px / PART_PPM, -(h / PART_PPM / 2 - py / PART_PPM), 0);
  const mat = new THREE.MeshBasicMaterial({
    map: Tex(canvas), transparent: true, depthWrite: false, depthTest: false,
  });
  return new THREE.Mesh(geo, mat);
}

const rigCache = new Map();

// haze：远景层的骨架按该层的雾量烘一套单独的零件（缓存键带上雾量）。
// 一种角色最多多出一两套，代价可以忽略——换来的是背景里的人是**实心**的。
function BuildParts(kind, haze = null) {
  const cacheKey = haze ? `${kind}|${haze.color}|${haze.amount.toFixed(2)}` : kind;
  if (rigCache.has(cacheKey)) return rigCache.get(cacheKey);
  const [coat, coatDark] = ART.RIG_COLOR(kind);
  const P = PART_PPM;
  // 这一套零件统一带上该层的雾量
  const Bake = (wM, hM, pu, pv, fn) => BakePart(wM, hM, pu, pv, fn, haze);
  const LONG_COAT = kind === "family" || kind === "sister";   // 大襟褂过胯
  const parts = {
    torso: () => Bake(BONE.torsoW, BONE.torso + (LONG_COAT ? 0.16 : 0.08), 0.5,
      // 枢轴（胯）在画布下沿往上留出下摆的位置
      LONG_COAT ? 0.72 : 0.88,
      (ctx, px, py) => ART.DrawTorsoPart(ctx, px, py, BONE.torsoW * P, BONE.torso * P, kind, kind + "torso", INK_K)),
    head: () => Bake(0.46, 0.46, 0.42, 1,
      (ctx, px, py) => ART.DrawHeadPart(ctx, px, py, BONE.headR * P, kind, kind + "head", INK_K)),
    upperArmB: () => Bake(0.115, BONE.upperArm, 0.5, 0,
      (ctx, px, py) => ART.DrawLimb(ctx, px, py, BONE.upperArm * P, 0.115 * P, 0.092 * P, coatDark, kind + "uab", { k: INK_K })),
    foreArmB: () => Bake(0.105, BONE.foreArm + 0.05, 0.5, 0,
      (ctx, px, py) => {
        ART.DrawLimb(ctx, px, py, BONE.foreArm * P, 0.092 * P, 0.074 * P, coatDark, kind + "fab", { k: INK_K });
        ctx.beginPath();
        ctx.arc(px, py + BONE.foreArm * P, 0.045 * P, 0, Math.PI * 2);
        ctx.fillStyle = ART.PAL.skinDark;
        ctx.fill();
      }),
    upperArmF: () => Bake(0.115, BONE.upperArm, 0.5, 0,
      (ctx, px, py) => ART.DrawLimb(ctx, px, py, BONE.upperArm * P, 0.115 * P, 0.092 * P, coat, kind + "uaf", { k: INK_K })),
    foreArmF: () => Bake(0.105, BONE.foreArm + 0.05, 0.5, 0,
      (ctx, px, py) => {
        ART.DrawLimb(ctx, px, py, BONE.foreArm * P, 0.092 * P, 0.074 * P, coat, kind + "faf", { k: INK_K });
        ctx.beginPath();
        ctx.arc(px, py + BONE.foreArm * P, 0.047 * P, 0, Math.PI * 2);
        ctx.fillStyle = ART.PAL.skin;
        ctx.fill();
        ctx.strokeStyle = ART.IN.ink;
        ctx.lineWidth = 3 * INK_K;
        ctx.stroke();
      }),
    thighB: () => Bake(0.145, BONE.thigh, 0.5, 0,
      (ctx, px, py) => ART.DrawLimb(ctx, px, py, BONE.thigh * P, 0.145 * P, 0.112 * P, coatDark, kind + "thb", { k: INK_K })),
    shinB: () => Bake(0.12, BONE.shin, 0.5, 0,
      (ctx, px, py) => ART.DrawLimb(ctx, px, py, BONE.shin * P, 0.112 * P, 0.086 * P, "#6b5540", kind + "shb", { k: INK_K })),
    footB: () => Bake(BONE.foot + 0.05, 0.10, 0.16, 0,
      (ctx, px, py) => ART.DrawFootPart(ctx, px, py, BONE.foot * P, 0.09 * P, "#43331f", kind + "ftb", INK_K)),
    thighF: () => Bake(0.145, BONE.thigh, 0.5, 0,
      (ctx, px, py) => ART.DrawLimb(ctx, px, py, BONE.thigh * P, 0.145 * P, 0.112 * P, coat, kind + "thf", { k: INK_K })),
    shinF: () => Bake(0.12, BONE.shin, 0.5, 0,
      (ctx, px, py) => ART.DrawLimb(ctx, px, py, BONE.shin * P, 0.112 * P, 0.086 * P, "#7d6349", kind + "shf", { k: INK_K })),
    footF: () => Bake(BONE.foot + 0.05, 0.10, 0.16, 0,
      (ctx, px, py) => ART.DrawFootPart(ctx, px, py, BONE.foot * P, 0.09 * P, "#4d3a28", kind + "ftf", INK_K)),
  };
  const built = {};
  for (const k of Object.keys(parts)) built[k] = parts[k]();
  rigCache.set(cacheKey, built);
  return built;
}

// 每个角色需要自己的一份网格（贴图共享，几何与材质克隆）
function CloneMesh(src) {
  const m = new THREE.Mesh(src.geometry, src.material.clone());
  m.material.map = src.material.map;
  return m;
}

/** 组装一具骨架，返回 {group, joints} */
export function CreateRig(kind, haze = null) {
  const proto = BuildParts(kind, haze);
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
  // 欢呼（循环）：布巾打下来了，妹妹拍着手原地小跳——两下轻跳、一下拍手定住。
  // 幅度照孩子来：蹦得高、胳膊抡得开，跟大人的克制拉开
  cheerHop: {
    dur: 1.6, loop: true,
    keys: [
      { t: 0.0, hipY: -0.06, hipX: 0.0, torso: -4, head: -8, armF: -136, foreF: -18, armB: -128, foreB: -14, thighB: -14, shinB: 18, footB: -5, thighF: -10, shinF: 14, footF: -5 },
      { t: 0.22, hipY: 0.12, hipX: 0.02, torso: -8, head: -12, armF: -158, foreF: -8, armB: -150, foreB: -6, thighB: -22, shinB: 30, thighF: -18, shinF: 26 },   // 蹦起来，双臂抡过头
      { t: 0.44, hipY: -0.08, hipX: 0.0, torso: -2, head: -6, armF: -120, foreF: -24, armB: -112, foreB: -20 },   // 落地缓一下
      { t: 0.66, hipY: 0.10, hipX: 0.02, torso: -8, head: -12, armF: -152, foreF: -10, armB: -144, foreB: -8 },   // 再蹦一下
      { t: 0.92, hipY: -0.05, hipX: 0.0, torso: -2, head: -8, armF: -96, foreF: -52, armB: -88, foreB: -48 },     // 拍手：两手收到胸前
      { t: 1.14, hipY: -0.04, hipX: 0.0, torso: -3, head: -8, armF: -104, foreF: -44, armB: -96, foreB: -40 },
      { t: 1.6, hipY: -0.06, hipX: 0.0, torso: -4, head: -8, armF: -136, foreF: -18, armB: -128, foreB: -14 },
    ],
  },
  // 拉锯（循环）。这一条改过一次，原因值得写下来：
  // 锯是 alongArm 挂件，**贴图方向 = 前臂的世界角 = armF + foreF**。老版本靠开合
  // 肘部来"一进一出"，前臂世界角从 -72° 荡到 -132°——锯在空中划了 60° 的钟摆，
  // 一会儿扎地一会儿指天，怎么看都不像在锯木头。
  // 现在把前臂世界角**锁死在 θ = -81°**（刃口朝前下 9°，一直躺在锯口里），
  // 行程改由肩来出：上臂摆到与刃口垂直（armF ≈ θ + 90°），肩转的切线方向正好
  // 平行于刃口，手就顺着锯身来回滑。每帧 foreF 必须 = θ - armF，别单独改一个。
  // armF 小 = 送出去（上臂垂下来），armF 大 = 拉回来（上臂向后甩）。
  // 中式框锯拉回来那一下才吃劲：回程慢、躯干坐下去，送出去快而轻。
  // 后手按住料不动（少许起伏），身子随行程前后送一寸。
  sawing: {
    dur: 1.5, loop: true,
    keys: [
      // 送到头（手在最前）
      { t: 0.0, hipY: -0.09, hipX: 0.09, torso: 27, head: -21, armF: -9, foreF: -72, armB: -30, foreB: -62, thighB: -22, shinB: 28, footB: -6, thighF: 14, shinF: 8, footF: -8 },
      { t: 0.09, hipY: -0.09, hipX: 0.085, torso: 26, head: -20, armF: -6, foreF: -75, armB: -32, foreB: -60 },   // 到头顿一下
      { t: 0.42, hipY: -0.06, hipX: -0.01, torso: 15, head: -16, armF: 27, foreF: -108, armB: -26, foreB: -66 }, // 拉回来：吃劲的一程，慢
      { t: 0.51, hipY: -0.06, hipX: -0.005, torso: 16, head: -16, armF: 24, foreF: -105 },                        // 换向
      { t: 0.75, hipY: -0.09, hipX: 0.09, torso: 27, head: -21, armF: -9, foreF: -72, armB: -30, foreB: -62 },     // 送出去：快而轻
      { t: 0.84, hipY: -0.09, hipX: 0.085, torso: 26, head: -20, armF: -6, foreF: -75, armB: -32, foreB: -60 },
      { t: 1.17, hipY: -0.06, hipX: -0.01, torso: 15, head: -16, armF: 27, foreF: -108, armB: -26, foreB: -66 },
      { t: 1.26, hipY: -0.06, hipX: -0.005, torso: 16, head: -16, armF: 24, foreF: -105 },
      { t: 1.5, hipY: -0.09, hipX: 0.09, torso: 27, head: -21, armF: -9, foreF: -72, armB: -30, foreB: -62 },
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
  // 撒食喂鸡（循环）：胳膊肘挎着笸箩，另一只手抓一把、扬出去，
  // 顿一顿看鸡抢食，再抓一把。扬手那一下最快，其余都是等
  scatterFeed: {
    dur: 2.8, loop: true,
    keys: [
      { t: 0.0, hipY: -0.02, hipX: 0.02, torso: 10, head: -8, armB: -66, foreB: -74, armF: -30, foreF: -20, thighB: -6, shinB: 8, footB: -4, thighF: 4, shinF: 4, footF: -4 },
      { t: 0.5, hipY: -0.04, hipX: 0.03, torso: 14, head: -10, armF: -52, foreF: -46 },   // 手伸进笸箩抓食
      { t: 0.85, hipY: 0.0, hipX: 0.0, torso: 4, head: -4, armF: 26, foreF: 8 },          // 扬出去（最快的一下）
      { t: 1.25, hipY: -0.01, hipX: 0.01, torso: 7, head: -7, armF: 10, foreF: -6 },      // 收手，看鸡抢
      { t: 2.8, hipY: -0.02, hipX: 0.02, torso: 10, head: -8, armF: -30, foreF: -20 },
    ],
  },
  // 扫院（循环）。老版本的错在把扫帚当"顺前臂垂下来的棍"：帚柄与前臂共线，
  // 柄的上半截就叠在小臂上、直戳到脑袋边——看着是根倚在身上的杆子，不是握着的
  // 扫帚。真拿扫帚，柄在手心里是**斜着**的（比前臂平一档）——这个偏角由 World
  // 的 ARM_TOOL_TILT 给（绕握点转，握点还在手心里）。这里管的是身体：
  // 弯下腰去（扫地的手位很低），前臂**伸直探到身前**（θ=armF+foreF 决定帚的
  // 朝向），后手在腹前虚扶柄的上端。一推一带都从前肩出。
  sweeping: {
    dur: 1.9, loop: true,
    keys: [
      { t: 0.0, hipY: -0.09, hipX: 0.07, torso: 27, head: -16, armF: -26, foreF: -9, armB: -14, foreB: -52, thighB: -12, shinB: 16, footB: -5, thighF: 7, shinF: 6, footF: -5 },
      { t: 0.7, hipY: -0.11, hipX: 0.09, torso: 30, head: -18, armF: -38, foreF: -10, armB: -22, foreB: -56 },  // 往前推
      { t: 1.2, hipY: -0.08, hipX: 0.06, torso: 24, head: -15, armF: -17, foreF: -8, armB: -10, foreB: -48 },   // 带回来
      { t: 1.9, hipY: -0.09, hipX: 0.07, torso: 27, head: -16, armF: -26, foreF: -9, armB: -14, foreB: -52 },
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
 * state: {phase, moving, crouch, carry, hold, holdW, climbing, digging, aiming, posture, pose, poseK}
 * carry = 扛在肩上（木料/门板/棉被）；hold = 提在手里（水桶/绳/石子），
 * holdW 0..1 是分量：0 拎块石子、1 满满一桶水。两者互斥，由渲染层按标签判定
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
    // 把人搂进自己肩膀。老版把近侧上臂甩到 -128°（举过头顶）、前臂再折 -62°，
    // 特写下读出来是「举手挥舞」而不是「搂着」——手根本没落到妹妹身上。
    // 现在：上臂垂到体侧偏前、**前臂横过身前兜住她的背**，手落在她另一侧的肩，
    // 头压低偏向她那边；另一只手护在她后脑。这是一对姿势，配 leanIn 一起看。
    target.hipY = -0.08; target.hipX = 0.03;
    target.torso = 16 * DEG; target.head = -30 * DEG;
    target.armF = -58 * DEG; target.foreF = -96 * DEG;   // 前臂横过来兜背
    target.armB = -42 * DEG; target.foreB = -78 * DEG;   // 另一只手护后脑
    target.thighB = -14 * DEG; target.shinB = 16 * DEG; target.footB = -6 * DEG;
    target.thighF = 10 * DEG; target.shinF = 8 * DEG; target.footF = -8 * DEG;
  } else if (s.pose === "pressed") {
    // 被按下去的那一下：不是自己蹲的——膝盖是被压弯的，肩往下沉、脖子缩起来。
    // 比常规半蹲低一大截，娘的手才落得到肩上（两个姿势是一对，一起改）
    target.hipY = -0.54; target.hipX = 0.04;
    target.torso = 24 * DEG; target.head = -30 * DEG;
    target.armB = -18 * DEG; target.foreB = -66 * DEG;
    target.armF = -24 * DEG; target.foreF = -72 * DEG;
    target.thighB = -86 * DEG; target.shinB = 98 * DEG; target.footB = -18 * DEG;
    target.thighF = -80 * DEG; target.shinF = 92 * DEG; target.footF = -18 * DEG;
  } else if (s.pose === "press") {
    // 把孩子按下去：自己先蹲到最低，近侧手臂横过去压在他肩上，另一只手撑地。
    // 这一拍必须一眼看出"手落在人身上"——第二章那句"娘按住你"以前只是字幕，
    // 画面上谁也没碰谁（用户原话：「哪里按住了？」）。
    target.hipY = -0.46; target.hipX = 0.08;
    target.torso = 22 * DEG; target.head = -18 * DEG;
    // 压人的那只手：往前够足、小臂再压下去——手要真的落在半人高（被按住的
    // 孩子的肩）上。角度往负走是抬高，别过头，不然成了"举手投降"
    target.armF = -84 * DEG; target.foreF = -34 * DEG;
    // 另一只手撑在地上找平衡
    target.armB = -30 * DEG; target.foreB = -52 * DEG;
    target.thighB = -104 * DEG; target.shinB = 104 * DEG; target.footB = 14 * DEG;
    target.thighF = -88 * DEG; target.shinF = 96 * DEG; target.footF = 12 * DEG;
  } else if (s.pose === "leanIn") {
    // 把额头抵在别人肩上：整个人往对方那边倒过去（不只是脖子前伸），
    // 两只小手蜷在自己胸口——不是垂着，那是站军姿。配 shelter 一起看
    target.hipY = -0.05; target.hipX = 0.10;
    target.torso = 26 * DEG; target.head = -40 * DEG;
    target.armB = -34 * DEG; target.foreB = -84 * DEG;
    target.armF = -30 * DEG; target.foreF = -88 * DEG;
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
  } else if (s.pose === "ropeHaul") {
    // 绳放到头了：他还想往前走，绳在后头拽住他。前手向后下方绷直（顺着绳的
    // 走向），上身往前顶、后腿蹬住地。**这不是拔河**，是"再往前一寸也走不动"
    // 的那一顿——所以劲不在胳膊上，在腰腿上。
    // poseK = 这一帧被绳吃掉了多大一步：顶得越使劲，身子拧得越紧。
    const k = Math.max(0, Math.min(1, s.poseK ?? 1));
    target.hipY = -0.05 - 0.05 * k; target.hipX = 0.05 + 0.10 * k;
    target.torso = (12 + 15 * k) * DEG; target.head = (-6 - 8 * k) * DEG;
    target.armF = (36 + 28 * k) * DEG;             // 正角=向后：手顺着绳伸回去
    target.foreF = (-10 - 10 * k) * DEG;
    target.armB = (-32 - 20 * k) * DEG; target.foreB = -20 * DEG;
    target.thighB = (-10 - 16 * k) * DEG; target.shinB = (8 + 10 * k) * DEG; target.footB = -10 * DEG;
    target.thighF = (14 + 12 * k) * DEG; target.shinF = (8 + 8 * k) * DEG; target.footF = -12 * DEG;
  } else if (s.pose === "throwArm") {
    // 投掷收势：石子刚出手，臂甩到前上方，上身跟着送出去
    target.hipY = -0.06; target.hipX = 0.16;
    target.torso = 24 * DEG; target.head = -10 * DEG;
    target.armF = -122 * DEG; target.foreF = -4 * DEG;
    target.armB = -6 * DEG; target.foreB = -22 * DEG;
    target.thighB = -42 * DEG; target.shinB = 30 * DEG; target.footB = -10 * DEG;
    target.thighF = 18 * DEG; target.shinF = 10 * DEG; target.footF = -12 * DEG;
  } else if (s.pose === "throwWind") {
    // 投掷蓄力：**由拉弓量直接驱动**（poseK 0→1，玩家把石子往后拽多远，
    // 身子就拧多紧）——臂向后下抡开、重心压到后腿、上身拧过去蓄住。
    // 松手那一帧切 throwArm，甩出去的劲是这里攒的。
    const k = s.poseK ?? 0.5;
    target.hipY = -0.04 - 0.06 * k; target.hipX = -0.02 - 0.10 * k;
    target.torso = (-4 - 18 * k) * DEG; target.head = (2 + 6 * k) * DEG;
    target.armF = (30 + 64 * k) * DEG;     // 正角=向后抡（同 vault 的符号语义）
    target.foreF = (-14 - 18 * k) * DEG;
    target.armB = (-16 - 10 * k) * DEG; target.foreB = -26 * DEG;
    target.thighB = (-10 - 18 * k) * DEG; target.shinB = (14 + 14 * k) * DEG; target.footB = -6 * DEG;
    target.thighF = (4 + 12 * k) * DEG; target.shinF = (6 + 6 * k) * DEG; target.footF = -6 * DEG;
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
    // 关键：**撑手要一直按在顶沿上**。上一版三帧里手都甩在头顶，人整个被
    // lift 抬着飘过去——"翻"字全靠位移，看着像悬浮。现在按真实的单手撑越
    // 摆：手往斜下方按住墙头（armF 只有 -40~-58，肘微屈），髋绕着那只手转。
    // ① 起手：伸手够墙头，后腿蹬地，上身压过去
    const A = {
      hipY: -0.12, hipX: 0.10, torso: 40, head: -22,
      armF: -58, foreF: -18, armB: -18, foreB: -24,
      thighB: -42, shinB: 50, footB: -12, thighF: 8, shinF: 16, footF: -12,
    };
    // ② 过顶：撑手已经在髋**后下方**按着墙头——真做单手撑越，到顶那一下手
    //    是压在身后的，不是举在胸前。所以 armF 转到负角之外（+ 为向后），
    //    肘几乎伸直；髋绕着这个支点荡过去，两腿收起来贴着顶沿甩到前侧
    const B = {
      hipY: 0.02, hipX: 0.26, torso: 34, head: -20,
      armF: 30, foreF: -8, armB: 20, foreB: -12,
      thighB: -96, shinB: 104, footB: 14, thighF: -78, shinF: 92, footF: 12,
    };
    // ③ 落地：腿先伸下去接地、屈膝卸力，撑手离墙甩到身后
    // ②′ 还骑在顶沿上，但**腿已经从后面扫到了前面**——这一帧是"翻"和"跳"
    //    的分水岭：高度不变（撑手是支点），变的是腿从墙这边扫到墙那边。
    //    少了它，中段就成了一动不动的抱膝定格，读出来还是腾空
    const B2 = {
      hipY: 0.00, hipX: 0.22, torso: 30, head: -16,
      armF: 44, foreF: -14, armB: 26, foreB: -10,
      thighB: -46, shinB: 62, footB: 6, thighF: -70, shinF: 46, footF: -4,
    };
    // ③ 落地：腿先伸下去接地、屈膝卸力，撑手离墙甩到身后
    const C = {
      hipY: -0.24, hipX: 0.04, torso: 26, head: -12,
      armF: 22, foreF: -30, armB: 34, foreB: -22,
      thighB: -14, shinB: 32, footB: -6, thighF: -42, shinF: 38, footF: -16,
    };
    // 扛着东西那一档：一只手拎着东西，撑不上劲——改成压着墙头蹭过去，
    // 身子更低、腿收不高
    if (heavy) {
      A.armF = -46; A.torso = 50;
      B.armF = 14; B.foreF = -20; B.torso = 46; B.hipY = -0.06;
      B.thighB = -74; B.shinB = 86; B.thighF = -58; B.shinF = 78;
      B2.armF = 20; B2.torso = 42; B2.hipY = -0.08;
      B2.thighB = -40; B2.shinB = 56; B2.thighF = -60; B2.shinF = 44;
      C.armF = -14; C.foreF = -30;
    }
    // 姿势的三段必须和**抬升曲线**的三段对齐（Core.VaultArc 的 rise/fall）：
    // 撑起来 → 骑在顶沿上腿扫过 → 松手落下。对不齐就会出现"人还在墙头上、
    // 腿却已经摆出落地姿势"这种一眼假
    const rise = 0.30, fall = heavy ? 0.72 : 0.64;
    let from = A, to = B, u = k / rise;
    if (k >= fall) { from = B2; to = C; u = (k - fall) / (1 - fall); }
    else if (k >= rise) { from = B; to = B2; u = (k - rise) / (fall - rise); }
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
    // 推车：前倾压着车把，腿在后面蹬——腿保留走步摆动，人不是滑过去的。
    // 两条胳膊要**斜着往下前方伸**，手落在 0.7m 上下的车把上；上一版举到
    // 74°，手停在胸口，车把在膝盖那么低的地方，谁也没握着谁。
    const c = s.moving;
    target.hipY = -0.10; target.hipX = 0.14;
    target.torso = 32 * DEG; target.head = -12 * DEG;
    target.armF = -54 * DEG; target.foreF = -34 * DEG;
    target.armB = -48 * DEG; target.foreB = -36 * DEG;
    target.thighB = (-26 + (c ? swing2 * 22 : 0)) * DEG;
    target.shinB = (34 - (c ? swing2 * 16 : 0)) * DEG;
    target.footB = -8 * DEG;
    target.thighF = (-20 + (c ? swing * 22 : 0)) * DEG;
    target.shinF = (28 - (c ? swing * 16 : 0)) * DEG;
    target.footF = -8 * DEG;
  } else if (s.pose === "rideBike") {
    // 骑自行车：微前倾扶把，腿在踏板上画圈——蹬踏相位由位移驱动（phase），
    // 车停了腿就搭在踏板上不转
    const c = s.moving;
    target.hipY = 0; target.hipX = 0.05;
    target.torso = 16 * DEG; target.head = -8 * DEG;
    target.armF = -58 * DEG; target.foreF = -20 * DEG;
    target.armB = -50 * DEG; target.foreB = -24 * DEG;
    target.thighB = (-62 + (c ? swing2 * 18 : 0)) * DEG;
    target.shinB = (58 - (c ? swing2 * 24 : 8)) * DEG;
    target.footB = 8 * DEG;
    target.thighF = (-58 + (c ? swing * 18 : -6)) * DEG;
    target.shinF = (52 - (c ? swing * 24 : 0)) * DEG;
    target.footF = 8 * DEG;
  } else if (s.pose === "rideMoto") {
    // 骑挎斗摩托：坐得比自行车深，两臂前伸压住宽把，腿踩在脚踏上不动
    target.hipY = -0.04; target.hipX = 0.10;
    target.torso = 22 * DEG; target.head = -10 * DEG;
    target.armF = -66 * DEG; target.foreF = -8 * DEG;
    target.armB = -58 * DEG; target.foreB = -12 * DEG;
    target.thighB = -74 * DEG; target.shinB = 70 * DEG; target.footB = 12 * DEG;
    target.thighF = -70 * DEG; target.shinF = 64 * DEG; target.footF = 10 * DEG;
  } else if (s.pose === "sitSide") {
    // 挎斗里的兵：整个人蜷进斗里，膝盖顶到胸口，枪抱在怀里（枪走 carry）
    target.hipY = -0.30; target.hipX = 0.04;
    target.torso = 6 * DEG; target.head = -4 * DEG;
    target.armF = -46 * DEG; target.foreF = -52 * DEG;
    target.armB = -40 * DEG; target.foreB = -48 * DEG;
    target.thighB = -96 * DEG; target.shinB = 88 * DEG; target.footB = 10 * DEG;
    target.thighF = -90 * DEG; target.shinF = 82 * DEG; target.footF = 8 * DEG;
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
    // 爬行：手脚并用，地道最窄的那几段（卡口、连夜赶工掏出来的新口）只能这么过。
    //
    // 这一拍是照着骨长重新算过的，不是随手填的角度——**手必须落在地上、膝盖
    // 必须跪在地上**，不然就是老版那个"人趴下去了、胳膊还悬在半空"的样子。
    // 算法（骨长见 BONE）：膝盖跪地 → 胯高 = 大腿长 0.31；手撑地 → 肩高 = 两节
    // 胳膊 0.49。所以后背是从胯往前上方斜着支起来的，不是趴平的：躯干折 68° 时
    // 肩点正好落在 0.475 高、0.48 靠前，胳膊略前伸 14° 就够到地。头顶 0.73，
    // 与 Core 的 POSTURE_HEAD.crawl(0.72) 对得上。
    const c = s.moving ? 1 : 0;
    // 爬起来是一耸一耸的：手一撑，胯就往上顶一下
    target.hipY = -0.312 + (c ? Math.abs(Math.sin(p)) * 0.03 : 0);
    target.hipX = 0.02;
    target.torso = (68 - (c ? Math.sin(p) * 4 : 0)) * DEG;
    target.head = -56 * DEG;          // 脖子抬起来才看得见前面（相对躯干，世界约前倾 12°）
    // 对角步：一只手往前够的时候，对侧的腿跟着往前收（swing / swing2 相位相反）。
    // 撑地那一侧接近伸直，往前够的那一侧抬起来——手离地是应该的，
    // 那是"正在往前挪"，不是飞
    target.armB = (-14 + (c ? swing * 22 : 0)) * DEG;
    target.foreB = (6 + (c ? Math.max(0, -swing) * 14 : 0)) * DEG;
    target.armF = (-14 + (c ? swing2 * 22 : 0)) * DEG;
    target.foreF = (6 + (c ? Math.max(0, -swing2) * 14 : 0)) * DEG;
    // 腿：大腿几乎垂直（膝盖跪在地上），小腿连着脚往后铺在地面上拖着走。
    // 大腿与小腿由同一个 swing 驱动、方向相反，小腿的世界角就始终贴着地面
    target.thighB = (-6 + (c ? swing2 * 16 : 0)) * DEG;
    target.shinB = (92 - (c ? swing2 * 14 : 0)) * DEG;
    // 脚这块贴图跟四肢不是一个朝向：肢体在 0° 时指向下，鞋子在 0° 时指向前，
    // 所以让鞋底贴着地板往后铺，要的是「大腿+小腿+脚 ≈ 180°」而不是「≈0°」。
    // 少了这一步，脚会以踝为轴垂到地板底下去（老版就是这么穿地的）
    target.footB = (180 + 6 - 92) * DEG;
    target.thighF = (-6 + (c ? swing * 16 : 0)) * DEG;
    target.shinF = (92 - (c ? swing * 14 : 0)) * DEG;
    target.footF = (180 + 6 - 92) * DEG;
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
  } else if (s.hold) {
    // 提：东西吊在近侧那只手上（水桶/麻绳/石子都走这儿），不是扛在肩上。
    // 空手走/站的姿势打底，按分量 holdW 往"坠"的方向拉——侧视里"沉"只读得出
    // 三笔：**胳膊被坠直**（肘伸开、摆幅收掉）、**身子往后仰配重**、
    // **另一只手甩得更开**。拎块石子(0.15)几乎还是空手的样子，
    // 提满满一桶水(1.0)才是另一个人。
    const w = Math.min(1, Math.max(0, s.holdW ?? 1));
    const c = s.moving ? 1 : 0;
    const br = Math.sin(s.breath || 0);
    target.hipY = c ? Math.abs(Math.sin(p)) * (0.035 - 0.009 * w) : br * 0.012;
    target.hipX = 0;
    target.torso = ((c ? 5 : 1.5 + br * 1.2) - 9 * w) * DEG;
    target.head = ((c ? -2 : -1 - br * 1.5) + 5 * w) * DEG;
    // 腿：提着重物迈不开大步，步幅与小腿折度都按分量收一档
    const legAmp = 30 - 9 * w, shinAmp = 52 - 14 * w;
    target.thighB = (c ? swing2 * legAmp : -3) * DEG;
    target.shinB = (c ? Math.max(0, -swing2) * shinAmp : 4) * DEG;
    target.footB = (c ? -swing2 * 12 - 4 : -3) * DEG;
    target.thighF = (c ? swing * legAmp : 3) * DEG;
    target.shinF = (c ? Math.max(0, -swing) * shinAmp : 2) * DEG;
    target.footF = (c ? -swing * 12 - 4 : -3) * DEG;
    // 远侧那只手空着：越重甩得越开，配重全靠它
    target.armB = (c ? swing * (26 + 12 * w) : 4 + br * 2) * DEG;
    target.foreB = (c ? -16 + Math.max(0, swing) * 20 : -12 - br * 3) * DEG;
    // 近侧提东西那只：摆幅按分量收掉，肘按分量伸开（w=1 时几乎是一根直杆）
    target.armF = ((c ? swing2 * (26 - 20 * w) : -4 - br * 2) + 6 * w) * DEG;
    target.foreF = ((c ? -16 + Math.max(0, swing2) * 20 : -14 - br * 3) * (1 - w) - 4 * w) * DEG;
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
  // **躯干带着肩走**——这行注释以前是句空话：两条胳膊挂在 root（胯）上而不是
  // 躯干上，代码只写了个固定的 y，肩膀就永远钉在胯的正上方。站着走着看不出来
  // （躯干才前倾几度），可一旦躯干折下去，肩就留在原地：爬行那一拍躯干压到 76°，
  // 人趴下去了、两条胳膊还悬在胯上方半米，看着就是"手飞了"。
  // 肩点＝躯干局部 (0, sh) 跟着躯干转过来的位置，躯干折多少肩就跟多少。
  const sh = BONE.torso * 0.86;
  const sx = Math.sin(t.torso) * sh, sy = Math.cos(t.torso) * sh;
  j.armBack.position.set(sx, sy, 0);
  j.armFront.position.set(sx, sy, 0);
}

/** 前臂末端（手）的世界坐标 */
export function HandPoint(rig) {
  const j = rig.joints;
  const v = new THREE.Vector3(0, -BONE.foreArm, 0);
  j.foreFront.updateWorldMatrix(true, false);
  return v.applyMatrix4(j.foreFront.matrixWorld);
}

/**
 * 四肢末端（两只手、两个膝盖、两只脚尖）的世界坐标。
 *
 * 用来体检"这个姿势站没站在地上"——爬行那一拍手悬在半空半米、脚穿到地板底下
 * 半年没人发现，就是因为没有任何一条断言量过肢体末端在哪儿。姿势看着像不像，
 * 眼睛说了算；**触没触地是可以量的**，就该量。
 */
export function LimbTips(rig) {
  const j = rig.joints;
  const at = (node, y) => {
    node.updateWorldMatrix(true, false);
    return new THREE.Vector3(0, y, 0).applyMatrix4(node.matrixWorld);
  };
  return {
    handF: at(j.foreFront, -BONE.foreArm), handB: at(j.foreBack, -BONE.foreArm),
    kneeF: at(j.shinFront, 0), kneeB: at(j.shinBack, 0),
    footF: at(j.footFront, 0), footB: at(j.footBack, 0),
    head: at(j.head, BONE.headR * 2),
  };
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
