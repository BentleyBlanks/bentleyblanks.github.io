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
  // 鞋帮高度。鞋是从踝**往下**画的，而大腿+小腿正好等于 hipY——踝落在 y=0，
  // 于是站着的人整个陷进地里一个鞋帮（2026-08-09 用户截图：车轮压在路沿上、
  // 人的鞋却陷在路面底下）。补偿在 ApplyPose 的 SoleLift 里，见那儿的注释。
  sole: 0.09,
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
    // 戴帽垂的（日军）得给脑后那片布留出画布：它垂过后颈，比头本身低一截。
    // 枢轴（脖根）在画布里的高度不变，只在下面多加一段——不然布会被裁平
    head: () => {
      // 帽垂（日军）往脑后垂过后颈，长发（娘/爹）落到肩——两种都得在枢轴**底下**
      // 多留一段画布，不然发梢会被裁成一个小揪儿（2026-08-17 实拍抓的）
      const longHair = kind === "family" || kind === "father";
      const hM = ART.UNIFORM[kind]?.capFlap ? 0.54 : longHair ? 0.64 : 0.46;
      return Bake(0.46, hM, 0.42, 0.46 / hM,
        (ctx, px, py) => ART.DrawHeadPart(ctx, px, py, BONE.headR * P, kind, kind + "head", INK_K));
    },
    upperArmB: () => Bake(0.115, BONE.upperArm, 0.5, 0,
      (ctx, px, py) => ART.DrawLimb(ctx, px, py, BONE.upperArm * P, 0.115 * P, 0.092 * P, coatDark, kind + "uab", { k: INK_K })),
    foreArmB: () => Bake(0.15, BONE.foreArm + 0.14, 0.5, 0,
      (ctx, px, py) => {
        ART.DrawLimb(ctx, px, py, BONE.foreArm * P, 0.092 * P, 0.074 * P, coatDark, kind + "fab", { k: INK_K });
        // 手：远侧那只压一档色。老版两只手都是 ctx.arc 的圆片——袖口上顶着
        // 两粒肉色扣子（2026-08-17 用户："关节都做的方块太丑了"）
        ART.DrawHandPart(ctx, px, py + BONE.foreArm * P, 0.042 * P, ART.PAL.skinDark,
          kind + "hb", { k: INK_K, lw: 2.4 });
      }),
    upperArmF: () => Bake(0.115, BONE.upperArm, 0.5, 0,
      (ctx, px, py) => ART.DrawLimb(ctx, px, py, BONE.upperArm * P, 0.115 * P, 0.092 * P, coat, kind + "uaf", { k: INK_K })),
    foreArmF: () => Bake(0.15, BONE.foreArm + 0.14, 0.5, 0,
      (ctx, px, py) => {
        ART.DrawLimb(ctx, px, py, BONE.foreArm * P, 0.092 * P, 0.074 * P, coat, kind + "faf", { k: INK_K });
        ART.DrawHandPart(ctx, px, py + BONE.foreArm * P, 0.044 * P, ART.PAL.skin,
          kind + "hf", { k: INK_K, lw: 3 });
      }),
    thighB: () => Bake(0.145, BONE.thigh, 0.5, 0,
      (ctx, px, py) => ART.DrawLimb(ctx, px, py, BONE.thigh * P, 0.145 * P, 0.112 * P, coatDark, kind + "thb", { k: INK_K })),
    // 小腿与脚按兵种取（绑腿 / 马靴 / 土布裤脚 + 布鞋）：原来这四个颜色是
    // 全场写死的农民褐，日军穿着一双农民的腿——「看不出是日军」有一半在这儿
    shinB: () => Bake(0.12, BONE.shin, 0.5, 0,
      (ctx, px, py) => ART.DrawShinPart(ctx, px, py, BONE.shin * P, 0.112 * P, 0.086 * P,
        kind, kind + "shb", { k: INK_K, back: true })),
    footB: () => Bake(BONE.foot + 0.12, 0.15, 0.22, 0,
      (ctx, px, py) => ART.DrawFootPart(ctx, px, py, BONE.foot * P, BONE.sole * P,
        ART.RIG_LEG(kind).footB, kind + "ftb", INK_K)),
    thighF: () => Bake(0.145, BONE.thigh, 0.5, 0,
      (ctx, px, py) => ART.DrawLimb(ctx, px, py, BONE.thigh * P, 0.145 * P, 0.112 * P, coat, kind + "thf", { k: INK_K })),
    shinF: () => Bake(0.12, BONE.shin, 0.5, 0,
      (ctx, px, py) => ART.DrawShinPart(ctx, px, py, BONE.shin * P, 0.112 * P, 0.086 * P,
        kind, kind + "shf", { k: INK_K })),
    footF: () => Bake(BONE.foot + 0.12, 0.15, 0.22, 0,
      (ctx, px, py) => ART.DrawFootPart(ctx, px, py, BONE.foot * P, BONE.sole * P,
        ART.RIG_LEG(kind).footF, kind + "ftf", INK_K)),
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
  root.position.y = BONE.hipY + BONE.sole;  // 摆姿势前的静止值，与站姿一致
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
  // 刺刀（不循环）：端枪、猛地送出去，随后把枪身挑起来停在高位。
  // 「襁褓随枪身离地」那一拍靠停住的高位姿势读出来（下一行把 carry 换成襁褓，
  // 挂点在手上，手停在哪儿襁褓就在哪儿）。机位钉在院门外侧、不推近不慢镜——
  // 关卡设计文档明令必须明确表现，同时不许猎奇化
  bayonetThrust: {
    dur: 2.2, loop: false,
    keys: [
      { t: 0.0, hipY: -0.04, hipX: -0.02, torso: 8, head: -6, armF: -58, foreF: -22, armB: -46, foreB: -30, thighB: -18, shinB: 22, footB: -6, thighF: 12, shinF: 8, footF: -8 },
      { t: 0.30, hipY: -0.10, hipX: 0.12, torso: 30, head: -12, armF: -84, foreF: -6, armB: -72, foreB: -10 },    // 送出去：全程最快的一下
      { t: 0.85, hipY: -0.08, hipX: 0.06, torso: 22, head: -16, armF: -96, foreF: -14, armB: -84, foreB: -18 },   // 顿住
      { t: 2.2, hipY: -0.05, hipX: 0.02, torso: 12, head: -18, armF: -124, foreF: -18, armB: -110, foreB: -22 },  // 挑起，停在高位
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
  // 举着手等着被抱起来（循环 2.2s）。**不是 reachJump**——那一支是在树底下
  // 蹦着够布巾（hipY 冲到 +0.15，人真的离地）；等人抱的孩子是**站着**把两只手
  // 举到他胸前，仰着脸，脚跟一颠一颠地催。2026-08-17 新增：上一版这 0.9 秒里
  // 她一格没动，玩家按着 E 使劲，画面上像在跟一根木桩较劲。
  // **末帧＝scoopedUp 的第一帧**，扣上腋下那一下接过去不跳。
  armsUpWait: {
    dur: 2.2, loop: true,
    keys: [
      { t: 0.0, hipY: -0.02, hipX: 0.03, torso: 10, head: -26, armF: -96, foreF: -48, armB: -88, foreB: -44, thighB: -8, shinB: 10, footB: -4, thighF: 6, shinF: 6, footF: -4 },
      // 踮一下脚，手再往上举一截（催他）
      { t: 0.42, hipY: 0.03, hipX: 0.04, torso: 7, head: -31, armF: -108, foreF: -42, armB: -99, foreB: -38, thighB: -5, shinB: 7, footB: -13, thighF: 4, shinF: 4, footF: -13 },
      { t: 0.80, hipY: -0.03, hipX: 0.03, torso: 12, head: -24, armF: -92, foreF: -50, armB: -85, foreB: -46, thighB: -10, shinB: 13, footB: -4, thighF: 7, shinF: 7, footF: -4 },
      // 换一只脚倒重心，胳膊酸了往下落一点点
      { t: 1.25, hipY: -0.04, hipX: 0.01, torso: 9, head: -28, armF: -87, foreF: -53, armB: -94, foreB: -41, thighB: -4, shinB: 6, thighF: -6, shinF: 9 },
      { t: 1.68, hipY: 0.01, hipX: 0.04, torso: 8, head: -32, armF: -103, foreF: -44, armB: -95, foreB: -40, thighB: -7, shinB: 9, footB: -10, thighF: 5, shinF: 5, footF: -10 },
      { t: 2.2, hipY: -0.02, hipX: 0.03, torso: 10, head: -26, armF: -96, foreF: -48, armB: -88, foreB: -44, thighB: -8, shinB: 10, footB: -4, thighF: 6, shinF: 6, footF: -4 },
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
  // 妹妹在怀里抖（序·那天，循环）：缩成一小团，两臂抱在胸前，肩背一颤一颤。
  // 幅度给小——「你能数出来她抖了多少下」靠的是频率不是大动作；
  // 头是埋着的（head 正值＝低头），跟挣扎/欢呼那种抬头的动势拉开
  tremble: {
    dur: 0.46, loop: true,
    keys: [
      // 蹲窝成一小团（在哥哥怀里）：胯落低、腿深屈、两臂抱胸——
      // 站着抖读不出「被搂在怀里」（首轮视觉审查退回）
      { t: 0.0, hipY: -0.30, hipX: 0.02, torso: 24, head: 10, armF: -64, foreF: -92, armB: -58, foreB: -86, thighB: -62, shinB: 74, footB: 2, thighF: -54, shinF: 66, footF: 0 },
      { t: 0.12, hipY: -0.315, torso: 27, head: 12 },
      { t: 0.24, hipY: -0.295, torso: 23, head: 9 },
      { t: 0.35, hipY: -0.31, torso: 26, head: 11 },
      { t: 0.46, hipY: -0.30, torso: 24, head: 10 },
    ],
  },
  // ── 序·那天：娘的四条轨道（2026-08-13 重做）────────────────────────────
  // 退回的原话是「娘的过场动画很生硬」。逐帧实拍核过，属实而且比想的更糟：
  // 这一整场她只有**三个钉死的静态姿势**——「一把将她拉进怀里、上下摸了一遍」
  // 借的是**拽水桶**那个 haulIn（poseK 钉在 0.55），于是画面上她伸着两条胳膊
  // 横在半空，隔着半个身位对着孩子发呆，一连 9 秒一格没变；「手指第一次从
  // 铁环上滑开、蹭一把汗、第二次攥住、猛地掀开」这四件事全靠三声音效交代，
  // 人从头到尾保持同一个前倾造型 5.4 秒。**台词里写了动作，画面上什么都没发生**
  // ——就是 CLAUDE.md 那条老账（「这他妈扇耳光…一个动画都没做」）的重演。
  //
  // 四条轨道对应四件事：拉进怀里上下摸一遍 / 搂着喘着说话 / 两次才掀开翻板 /
  // 掀着板守在窖口。写法上守两条规矩：**循环轨道的下半身在每个关键帧上钉成
  // 同一组数**（否则脚必滑，礅门轴那次的教训），**手的落点先算再拆角**
  // （上臂角＋前臂角＝世界角，0° 朝下）。

  // ① 一把将她拉进怀里，上下摸了一遍（单次 5.2s，接 c1_thatday 第 5 行）。
  // 分四段：探手够到 → 攥住往回带、人跟着蹲下去 → 搂紧一下 →
  // **两遍从肩到腿的上下摸**（这是这一句的题眼：她在确认孩子身上有没有伤）→
  // 抬头找柱子（下一句「柱子。」就从这个头位起）。
  // **肘必须吊下来**（首轮实拍退回换来的）：上臂给到 −80° 就是"把肘平端到
  // 身前"，肘先占掉 0.25m，手再往外 0.24m ⇒ 手落在身前 0.58m，而孩子的身子
  // 中心只在 0.31m——两条胳膊从她身上直穿过去、指着她背后的空气，读出来是
  // 「举着两条胳膊僵在那儿」。抱人的几何是**上臂几乎垂着（−10~−40）、
  // 前臂横过来兜住她**，行程全长在前臂上。这条同样是 CLAUDE.md「闲着的手
  // 要顺着重力吊下来、肘要折一下」那一条的正面用法。
  pullClose: {
    dur: 5.2, loop: false,
    keys: [
      // 刚转过身，重心还在后脚，近侧手已经探出去够她
      { t: 0.0, hipY: -0.04, hipX: 0.02, torso: 18, head: -24, armF: -60, foreF: -34, armB: -20, foreB: -26, thighB: -18, shinB: 22, footB: -8, thighF: 14, shinF: 10, footF: -10 },
      // 攥住她胳膊，开始往回带；身子跟着沉
      { t: 0.45, hipY: -0.13, hipX: 0.06, torso: 26, head: -30, armF: -40, foreF: -50, armB: -34, foreB: -34, thighB: -28, shinB: 34, thighF: 4, shinF: 16 },
      // 拽进怀里：整个人蹲下去围住她（这一帧起下半身钉死，不再动）。
      // 肘吊在体侧、前臂横过去兜住她的背，另一只手绕高一档护住肩胛
      { t: 0.95, hipY: -0.28, hipX: 0.05, torso: 26, head: -36, armF: -16, foreF: -74, armB: -24, foreB: -80, thighB: -48, shinB: 54, footB: -6, thighF: -36, shinF: 40, footF: -8 },
      // 搂紧一下（前臂再收进来一点，埋头）
      { t: 1.5, torso: 31, head: -40, armF: -12, foreF: -70, armB: -20, foreB: -76 },
      // 上下摸第一遍：手先托到她肩、脸那一带（前臂转到前上方）
      { t: 2.1, torso: 24, head: -44, armF: -34, foreF: -86, armB: -40, foreB: -88 },
      // …一路抹到腿上（前臂转到前下方）
      { t: 2.75, torso: 32, head: -30, armF: -6, foreF: -44, armB: -10, foreB: -40 },
      // 第二遍：又捧回她脸上
      { t: 3.3, torso: 22, head: -46, armF: -38, foreF: -90, armB: -42, foreB: -92 },
      // 手停在她两肩上
      { t: 3.9, torso: 27, head: -38, armF: -20, foreF: -74, armB: -26, foreB: -78 },
      // 抬头找柱子——下一句台词从这个头位起
      { t: 4.5, torso: 22, head: -48 },
      { t: 5.2, torso: 24, head: -44 },
    ],
  },
  // ② 蹲着搂住孩子，喘着抬头说话（循环 3.4s）。接在 pullClose 的末帧上，
  // 「柱子。」「抱她。」两句都挂它——她刚从村外跑回来，气还没喘匀，
  // 所以幅度全在肩背与头上，下半身一格不动。
  huddleBreath: {
    dur: 3.4, loop: true,
    keys: [
      { t: 0.0, hipY: -0.28, hipX: 0.05, torso: 24, head: -44, armF: -20, foreF: -74, armB: -26, foreB: -78, thighB: -48, shinB: 54, footB: -6, thighF: -36, shinF: 40, footF: -8 },
      { t: 0.8, hipY: -0.265, torso: 20, head: -47, armF: -23, foreF: -77, armB: -29, foreB: -81 },   // 吸气：肩背起来
      { t: 1.5, hipY: -0.285, torso: 27, head: -42, armF: -18, foreF: -71, armB: -24, foreB: -75 },   // 呼气
      { t: 2.3, hipY: -0.27, torso: 22, head: -46, armF: -22, foreF: -76, armB: -28, foreB: -80 },
      { t: 3.4, hipY: -0.28, torso: 24, head: -44, armF: -20, foreF: -74, armB: -26, foreB: -78 },
    ],
  },
  // ③ 两次才掀开翻板（单次 5.4s）。字幕点了四件事，四件事就得各占一段：
  // 够到铁环(0~0.7) → **滑开**：手脱手往后甩、身子后仰一顿(1.15) →
  // 直起来在衣襟上蹭汗(2.0) → 再蹲下去两只手都攥住(2.5) →
  // 腰一节节直起来发力(3.2) → 掀过竖直(3.9) → 撒手，板落到另一边(4.4)。
  // **盖板的开合要跟这条对上**：Core 那边给 state.lid 带了 delay，
  // 板在 2.6s 才开始转（在她第二次攥住之后），不然板早开了她还在够。
  // 几何：铁环在地面上、她身前约 0.35m。深蹲 hipY −0.42 + 腰折 60° 时
  // 肩点落在 (0.39, 0.42)，到环的距离 0.37m < 臂长 0.49m——够得着才敢这么摆。
  hatchHeave: {
    dur: 5.4, loop: false,
    keys: [
      { t: 0.0, hipY: -0.40, hipX: 0.06, torso: 58, head: -46, armF: -30, foreF: -22, armB: -22, foreB: -18, thighB: -84, shinB: 92, footB: -8, thighF: -72, shinF: 84, footF: -10 },
      // 扣住环往上拽，腰开始直
      { t: 0.7, hipY: -0.34, hipX: 0.04, torso: 48, head: -40, armF: -44, foreF: -16, armB: -34, foreB: -14, thighB: -74, shinB: 84, thighF: -64, shinF: 76 },
      // 滑开：手猛地脱手甩到身后，重心往后一顿
      { t: 1.15, hipY: -0.30, hipX: -0.07, torso: 24, head: -26, armF: -12, foreF: -40, armB: -6, foreB: -34, thighB: -64, shinB: 76, thighF: -54, shinF: 66 },
      // 顿住，喘一口
      { t: 1.5, hipY: -0.33, hipX: -0.02, torso: 34, head: -34, armF: -30, foreF: -34, armB: -18, foreB: -30 },
      // 在衣襟上蹭一把汗（手收到胸腹前，肘折死）
      { t: 2.0, hipY: -0.31, hipX: 0.00, torso: 30, head: -32, armF: -66, foreF: -74, armB: -20, foreB: -30 },
      // 再探下去，两只手都攥住铁环
      { t: 2.5, hipY: -0.42, hipX: 0.06, torso: 60, head: -48, armF: -32, foreF: -20, armB: -28, foreB: -18, thighB: -88, shinB: 96, thighF: -76, shinF: 88 },
      // 发力：腰一节节直起来，重心后压（板从这儿开始转）
      { t: 3.2, hipY: -0.28, hipX: 0.00, torso: 34, head: -34, armF: -58, foreF: -26, armB: -52, foreB: -22, thighB: -66, shinB: 74, thighF: -56, shinF: 64 },
      // 掀过竖直：人几乎站直，两手抬到胸前
      { t: 3.9, hipY: -0.12, hipX: -0.06, torso: 12, head: -22, armF: -92, foreF: -30, armB: -84, foreB: -26, thighB: -32, shinB: 38, thighF: -20, shinF: 24 },
      // 撒手，板落到另一边
      { t: 4.4, hipY: -0.16, hipX: 0.02, torso: 22, head: -28, armF: -40, foreF: -30, armB: -34, foreB: -26, thighB: -38, shinB: 44, thighF: -26, shinF: 30 },
      // 收势：跪回窖口边（末帧对齐 hatchGuard 的首帧，切过去人不跳）
      { t: 5.4, hipY: -0.36, hipX: 0.02, torso: 26, head: -22, armF: -44, foreF: -30, armB: -14, foreB: -18, thighB: -38, shinB: 128, footB: 12, thighF: -44, shinF: 136, footF: 14 },
    ],
  },
  // ④ 掀着板守在窖口（循环 4.2s）。跪着、一只手压着翻板冲底下说话，
  // 中间**回头瞟一眼院门**——外面的脚步已经到院门口了，这一眼比任何字幕都说事。
  // 底子是 kneel（跪的几何见那一支的注释：膝着地、小腿平铺在身后）。
  hatchGuard: {
    dur: 4.2, loop: true,
    keys: [
      { t: 0.0, hipY: -0.36, hipX: 0.02, torso: 26, head: -22, armF: -44, foreF: -30, armB: -14, foreB: -18, thighB: -38, shinB: 128, footB: 12, thighF: -44, shinF: 136, footF: 14 },
      { t: 0.9, hipY: -0.345, torso: 21, head: -28, armF: -48, armB: -18 },   // 催：探身冲窖口
      { t: 1.6, hipY: -0.365, torso: 29, head: -18, armF: -41, armB: -11 },
      { t: 2.4, hipY: -0.35, torso: 27, head: -4, armF: -44, armB: -14 },     // 回头瞟一眼院门
      { t: 3.0, hipY: -0.36, torso: 23, head: -26, armF: -46, armB: -16 },
      { t: 4.2, hipY: -0.36, torso: 26, head: -22, armF: -44, armB: -14 },
    ],
  },
  // ⑤ 妹妹这一边（成对轨道，与 pullClose 同长）：接触戏的老规矩——**受方
  // 前面那一段是"等"**，等施方的手真够到她身上，她才动。原来这一句她的
  // pose 是 null，也就是**笔直站着让娘对着空气摸**。
  // 0~0.45 两只小手还捂在耳朵上 → 0.45 被拽得往娘那边一趔趄 →
  // 0.95 撞进怀里、埋头（leanIn 的落点）→ 之后一直小幅打颤
  pulledClose: {
    dur: 5.2, loop: false,
    keys: [
      // 两只小手蜷在胸口（＝上一行 leanIn 的落点，切过来不跳）：肘朝前折死，
      // 前臂折回来，手落在自己胸前——这套数是 leanIn 验过的，照抄别改
      { t: 0.0, hipY: -0.02, hipX: 0.0, torso: 8, head: -10, armF: -24, foreF: -104, armB: -20, foreB: -98, thighB: -8, shinB: 10, footB: -4, thighF: 6, shinF: 6, footF: -4 },
      // 被拽得一趔趄：重心往娘那边倒，一只手被拉开
      { t: 0.45, hipY: -0.04, hipX: 0.07, torso: 16, head: -18, armF: -30, foreF: -88, armB: -26, foreB: -92, thighB: -16, shinB: 20, thighF: 12, shinF: 10 },
      // 撞进怀里、埋头（leanIn 的落点：整个人往对方那边倒，两只小手蜷在胸口）
      { t: 0.95, hipY: -0.05, hipX: 0.10, torso: 26, head: -40, armF: -24, foreF: -104, armB: -20, foreB: -98, thighB: -10, shinB: 12, footB: -4, thighF: 8, shinF: 6, footF: -6 },
      // 被摸的时候一颤一颤（幅度小、频率高——「你能数出来她抖了多少下」）
      { t: 1.6, torso: 29, head: -37 },
      { t: 2.2, torso: 25, head: -41 },
      { t: 2.9, torso: 28, head: -38 },
      { t: 3.6, torso: 25, head: -41 },
      { t: 4.3, torso: 28, head: -38 },
      { t: 5.2, torso: 26, head: -40 },
    ],
  },
  // ⑦ 蹲下去把妹妹抱起来（单次 1.45s，玩家操作①）。
  //
  // 2026-08-17 重排（用户："抱起妹妹的动画太蠢了…不流畅"）。上一版四个键
  // 1.1 秒，三段都被 smoothstep 各自缓入缓出，读出来是"蹲、停、抬、停、站、停"。
  // 换了插值（见 SampleTrack）之后还得**把动作本身排出来**，缺的是三件事：
  //   · **起手不许是站姿**：这一拍前面 0.9 秒玩家一直按着（scoopReach 已经蹲下去
  //     把手伸到她腋下了），轨道第一帧要**接着那个蹲**往下走，不能从站姿重来一遍
  //     ——老版就是这么当帧弹回去、再蹲第二次的。
  //   · **预备动作**：抬人之前先往下再沉一寸（0.18s 那格）。没有这一沉，
  //     "使劲"就只是位置在变。
  //   · **劲从腿上来**：胯先起、腰后起、两条胳膊最后才收紧兜住——一起动就是
  //     "整个人平移上去"。收尾给一次很小的回坐（0.85 的仰过头 → 1.15 的回落），
  //     怀里那点分量才落到身上。
  scoopChild: {
    dur: 1.45, loop: false,
    keys: [
      // 蹲到她的高度、两手兜在她腋下（＝ scoopReach 走满进度那一格，接过去不跳）
      // 每一格的两条腿都按闭合式配（hipY = 0.31·cosθ + 0.31·cos(θ+小腿) − 0.62），
      // 两条投影必须一样长，否则错开的那一档就是一只脚陷进地里／悬在半空
      { t: 0.0, hipY: -0.24, hipX: 0.07, torso: 38, head: -22, armF: -51, foreF: -89, armB: -44, foreB: -95, thighB: -76, shinB: 84, footB: -6, thighF: -60, shinF: 103, footF: -8 },
      // 预备：再沉一寸，两只手在她腋下扣死（这一格是"使劲"的证据）
      { t: 0.20, hipY: -0.29, hipX: 0.09, torso: 42, head: -18, armF: -56, foreF: -84, armB: -49, foreB: -90, thighB: -86, shinB: 94, thighF: -70, shinF: 114 },
      // 蹬腿起身：她离地。胯先上来、腰跟着直、肘往体侧落（开始改兜的角度）
      { t: 0.55, hipY: -0.106, hipX: 0.02, torso: 8, head: -6, armF: -20, foreF: -74, armB: -34, foreB: -110, thighB: -48, shinB: 56, footB: -4, thighF: -34, shinF: 68, footF: -6 },
      // 分量压上来：上身往后仰过一点点配重，同时胯往上一送把她坐稳
      { t: 0.85, hipY: 0.02, hipX: -0.05, torso: -11, head: 6, armF: 8, foreF: -74, armB: -16, foreB: -133, thighB: -2, shinB: 3, thighF: 4, shinF: 2 },
      // 回落（很小的一次回坐，重量真的落在身上了）
      { t: 1.15, hipY: -0.02, hipX: -0.02, torso: -4, head: 2, armF: 2, foreF: -67, armB: -22, foreB: -125 },
      // 站直兜稳（**＝childArms 的静止帧，两处必须一模一样**：末帧对不上，
      // 轨道一到期人就当帧弹一下）
      { t: 1.45, hipY: 0.0, hipX: -0.03, torso: -6, head: 3, armF: 4, foreF: -69, armB: -20, foreB: -128, thighB: -3, shinB: 4, footB: -3, thighF: 3, shinF: 2, footF: -3 },
    ],
  },
  // ⑦-对 妹妹这一边（成对轨道，与 scoopChild 同长）。接触戏的老规矩：
  // **抱的人在动、被抱的人一动不动＝抱了个假人**。老版她连轨道都没有——
  // 一到 carrying 就当帧换成 heldChild、位置从原地瞬移到他怀里、lift 直接给满，
  // 也就是"他还蹲着，她已经坐在半空中了"（实拍量到 t=0.48 时她 lift 已经 0.42）。
  //
  // 她这一边的四件事：伸手够他 → 被兜住、踮起来 → 离地（腿先垂着才有分量）→
  // 腿收上来盘住、脸埋进他肩窝。**腿要晚于人离地**：一起收就是"自己跳上去的"。
  scoopedUp: {
    dur: 1.45, loop: false,
    keys: [
      // 站着仰头，两只手已经举到他胸前（＝他按住那 0.9 秒里她做的事）
      { t: 0.0, hipY: -0.02, hipX: 0.03, torso: 10, head: -26, armF: -96, foreF: -48, armB: -88, foreB: -44, thighB: -8, shinB: 10, footB: -4, thighF: 6, shinF: 6, footF: -4 },
      // 被扣住腋下：踮起脚、身子被提得往上抻一点
      { t: 0.18, hipY: 0.03, hipX: 0.05, torso: 14, head: -30, armF: -104, foreF: -54, armB: -96, foreB: -50, thighB: -4, shinB: 6, footB: -14, thighF: 3, shinF: 4, footF: -14 },
      // 离地：腿这会儿还是垂着的（分量全挂在腋下），手开始往他脖子上够
      { t: 0.55, hipY: -0.04, hipX: 0.06, torso: 6, head: -22, armF: -112, foreF: -60, armB: -104, foreB: -58, thighB: -14, shinB: 20, footB: -6, thighF: -8, shinF: 14, footF: -8 },
      // 坐上臂弯：腿这才收起来盘住他，胳膊搂死脖子（这一格略过一点，像被颠了一下）
      { t: 0.85, hipY: -0.05, hipX: 0.07, torso: 22, head: -32, armF: -108, foreF: -66, armB: -101, foreB: -70, thighB: -56, shinB: 60, footB: -6, thighF: -68, shinF: 68, footF: -6 },
      // 回摆（她自己晃回来一下）
      { t: 1.15, hipY: -0.04, hipX: 0.05, torso: 13, head: -23, armF: -103, foreF: -72, armB: -96, foreB: -76 },
      // 稳住（**＝heldChild 的静止帧**，轨道一到期接过去不跳）
      { t: 1.45, hipY: -0.04, hipX: 0.05, torso: 16, head: -26, armF: -105, foreF: -70, armB: -98, foreB: -74, thighB: -52, shinB: 56, footB: -5, thighF: -64, shinF: 62, footF: -6 },
    ],
  },
  // ⑦b 往上颠一下把她托稳（单次 1.4s，玩家操作②：腾出一只手扒梯子之前）。
  // 抱着人要腾手，现实里就是先屈膝一沉、再往上一送，把人颠高半寸卡在臂弯里。
  // 起止两帧都是 childArms 的静止帧，接过去不跳。
  hoistChild: {
    dur: 1.4, loop: false,
    keys: [
      { t: 0.0, hipY: 0.0, hipX: -0.03, torso: -6, head: 3, armF: 4, foreF: -69, armB: -20, foreB: -128 },
      // 屈膝一沉（劲是从腿上来的，不是从胳膊上来的）
      { t: 0.35, hipY: -0.10, hipX: -0.01, torso: -2, head: 1, armF: 9, foreF: -62, armB: -14, foreB: -120, thighB: -18, shinB: 24, thighF: -14, shinF: 20 },
      // 往上一送：她被颠高，两条胳膊跟着收紧
      { t: 0.7, hipY: 0.04, hipX: -0.04, torso: -10, head: 5, armF: -4, foreF: -80, armB: -28, foreB: -137, thighB: -4, shinB: 6, thighF: 2, shinF: 4 },
      // 卡稳，换手扒住横档那一下由 climbing+childArms 那支接着演
      { t: 1.4, hipY: 0.0, hipX: -0.03, torso: -6, head: 3, armF: 4, foreF: -69, armB: -20, foreB: -128 },
    ],
  },
  // ⑧ 坐到窖沿把妹妹放上梯子（单次 3.0s）。**2026-08-15 起没人用了**：
  // 用户定「要抱着下地道」，她整段都在他怀里，不再有"放上梯子"这回事
  // （那一步换成了 hoistChild）。轨道留着——同视频序章那批遗产，要清另说。
  // 字幕点了两件事："先坐到窖沿"和"妹妹抓着他的衣襟不肯松手"——老版这两件事
  // 合起来是一个 FlashPose("kneel", 3.0)，也就是一张跪姿定格挂三秒。
  lowerChild: {
    dur: 3.0, loop: false,
    keys: [
      { t: 0.0, hipY: 0.0, hipX: -0.03, torso: -6, head: 3, armF: -96, foreF: -38, armB: -104, foreB: -38, thighB: -3, shinB: 4, footB: -3, thighF: 3, shinF: 2, footF: -3 },
      // 坐到窖沿（这一帧起下半身钉死，剩下的全长在腰和胳膊上）
      { t: 0.55, hipY: -0.40, hipX: -0.06, torso: 14, head: -10, armF: -88, foreF: -30, armB: -96, foreB: -30, thighB: -84, shinB: 92, footB: -6, thighF: -76, shinF: 84, footF: -8 },
      // 弯下腰把她往下送
      { t: 1.2, hipY: -0.40, hipX: -0.04, torso: 42, head: -34, armF: -52, foreF: -6, armB: -60, foreB: -4 },
      // 松开一只手——她还抓着衣襟，手停在半空
      { t: 1.9, torso: 38, head: -30, armF: -34, foreF: -18, armB: -48, foreB: -8 },
      // 把她的手指一根根掰开
      { t: 2.4, torso: 34, head: -32, armF: -44, foreF: -26, armB: -30, foreB: -22 },
      // 直起一点，看着她下梯子
      { t: 3.0, hipY: -0.36, torso: 26, head: -36, armF: -24, foreF: -22, armB: -18, foreB: -18 },
    ],
  },
  // ⑨ 把翻板压回去（单次 4.0s）：跪着，一只手扶着板一路跟到底——
  // 「最后消失在板缝里的，是娘那截蓝底白花的袖子」，所以这条轨道全部的活
  // 就是**那条胳膊跟着板缝一起下去**：手从抬起（板还立着）一点点落到地面，
  // 缝合上前最后一下才抽回来。lid 那边 rate 1.8＝0.56 秒落到底，
  // 手的行程压在 0~0.9 上，抽手在 1.2。剩下的时间她伏在板上没动——
  // 那是听外面脚步的三秒
  lidLower: {
    dur: 4.0, loop: false,
    keys: [
      // 扶着立着的板（手抬到胸口高）
      { t: 0.0, hipY: -0.36, hipX: 0.02, torso: 22, head: -26, armF: -96, foreF: -22, armB: -20, foreB: -20, thighB: -38, shinB: 128, footB: 12, thighF: -44, shinF: 136, footF: 14 },
      // 板往下压，手跟着落
      { t: 0.5, torso: 30, head: -20, armF: -58, foreF: -26, armB: -22, foreB: -20 },
      // 板快合上：手已经贴到地面那条缝上
      { t: 0.9, torso: 38, head: -14, armF: -28, foreF: -30, armB: -24, foreB: -18 },
      // 手掌整个平贴板面、只剩小臂压在缝上——0.9→1.2 两帧之间没有这一格，
      // smoothstep 插不出「一点点退出去」，袖子就是"闪没了"
      { t: 1.05, torso: 37, head: -15, armF: -32, foreF: -8 },
      // 抽回来——袖子从缝里退出去的那一下
      { t: 1.2, torso: 34, head: -18, armF: -46, foreF: -26, armB: -22, foreB: -20 },
      // 伏在板上听外面的脚步（肩背微微起伏）
      { t: 2.0, torso: 40, head: -12, armF: -34, foreF: -10, armB: -18, foreB: -22 },
      { t: 3.0, torso: 36, head: -16, armF: -36, foreF: -12 },
      { t: 4.0, torso: 40, head: -12, armF: -34, foreF: -10 },
    ],
  },
  // ── §1 冷灶那一场（柱子的四件事，2026-08-13）─────────────────────────
  // 这一拍原来是六行字幕配三个 `FlashPose("kneel"/"bow")`：摸锅底、掀粮瓮、
  // 刮缸底、给妹妹盖脚——四件手上的事，画面上是同一个人蹲在四个地方不动。
  // 下半身一律沿用 kneel 的几何（膝着地、小腿平铺在身后），动作全长在腰和手上。

  // 摸一把锅底——干的（3.2s）
  panBottom: {
    dur: 3.2, loop: false,
    keys: [
      { t: 0.0, hipY: -0.36, hipX: 0.02, torso: 26, head: -12, armF: -18, foreF: -14, armB: -14, foreB: -18, thighB: -38, shinB: 128, footB: 12, thighF: -44, shinF: 136, footF: 14 },
      { t: 0.7, torso: 40, head: -24, armF: -52, foreF: -26, armB: -18, foreB: -16 },   // 探手进锅
      { t: 1.3, torso: 44, head: -26, armF: -44, foreF: -36 },                          // 摸一圈
      { t: 1.7, torso: 43, head: -25, armF: -56, foreF: -22 },
      { t: 2.2, torso: 34, head: -30, armF: -70, foreF: -34 },                           // 手抽出来，捻捻手指
      { t: 2.7, torso: 30, head: -28, armF: -66, foreF: -44 },
      { t: 3.2, torso: 27, head: -14, armF: -22, foreF: -16 },
    ],
  },
  // 掀开粮瓮：瓮底只剩薄薄一层糜子（3.4s）
  liftJarLid: {
    dur: 3.4, loop: false,
    keys: [
      { t: 0.0, hipY: -0.36, hipX: 0.02, torso: 26, head: -12, armF: -18, foreF: -14, armB: -14, foreB: -18, thighB: -38, shinB: 128, footB: 12, thighF: -44, shinF: 136, footF: 14 },
      { t: 0.6, torso: 38, head: -22, armF: -46, foreF: -30, armB: -42, foreB: -26 },   // 两手抠住盖沿
      { t: 1.1, torso: 26, head: -18, armF: -72, foreF: -22, armB: -68, foreB: -18 },   // 掀起来
      { t: 1.6, torso: 30, head: -14, armF: -40, foreF: -44, armB: -36, foreB: -40 },   // 挪到一边放下
      { t: 2.2, torso: 48, head: -30, armF: -30, foreF: -22, armB: -20, foreB: -16 },   // 探头看瓮底
      { t: 2.8, torso: 46, head: -28, armF: -50, foreF: -30 },                          // 手伸进去捻一撮
      { t: 3.4, torso: 34, head: -26, armF: -66, foreF: -30 },
    ],
  },
  // 瓢探下去刮缸底，小半瓢——抿一口，剩下的倒进锅里（5.2s）
  scoopVat: {
    dur: 5.2, loop: false,
    keys: [
      { t: 0.0, hipY: -0.36, hipX: 0.02, torso: 26, head: -12, armF: -18, foreF: -14, armB: -14, foreB: -18, thighB: -38, shinB: 128, footB: 12, thighF: -44, shinF: 136, footF: 14 },
      { t: 0.7, torso: 44, head: -28, armF: -40, foreF: -34, armB: -18, foreB: -16 },   // 瓢探下去
      { t: 1.2, torso: 50, head: -32, armF: -28, foreF: -40 },                          // 够到缸底
      { t: 1.7, torso: 49, head: -31, armF: -36, foreF: -32 },                          // 刮着缸底转半圈
      { t: 2.2, torso: 50, head: -32, armF: -26, foreF: -42 },
      { t: 2.9, torso: 32, head: -24, armF: -64, foreF: -24 },                          // 提上来
      { t: 3.6, torso: 18, head: -30, armF: -82, foreF: -52 },                           // 凑到瓢沿抿一口
      { t: 4.1, torso: 16, head: -34, armF: -86, foreF: -58 },
      { t: 4.7, torso: 36, head: -22, armF: -54, foreF: -14 },                          // 剩下的倒进锅里
      { t: 5.2, torso: 40, head: -20, armF: -46, foreF: -6 },
    ],
  },
  // 替她把脚盖好（2.4s）：抓住袄角往下拉，再顺一把
  tuckQuilt: {
    dur: 2.4, loop: false,
    keys: [
      { t: 0.0, hipY: -0.36, hipX: 0.02, torso: 26, head: -12, armF: -18, foreF: -14, armB: -14, foreB: -18, thighB: -38, shinB: 128, footB: 12, thighF: -44, shinF: 136, footF: 14 },
      { t: 0.6, torso: 44, head: -30, armF: -58, foreF: -22, armB: -20, foreB: -16 },   // 抓住袄角
      { t: 1.2, torso: 48, head: -32, armF: -34, foreF: -34 },                          // 往下拉，盖住脚
      { t: 1.7, torso: 46, head: -31, armF: -42, foreF: -28 },                          // 顺一把
      { t: 2.4, torso: 30, head: -20, armF: -22, foreF: -16 },
    ],
  },
  // ⑬ 长按搂紧（循环 4.2s，序·那天窖底那一拍）。这一拍要按住 15 秒，
  // 老版每帧续期一个静态的 `shelter`——十五秒一格没变的定格，而这正是
  // 序章的题眼镜头。现在：肩背随呼吸起伏，每一轮**收紧一下**（头顶有动静
  // 的时候人会不自觉地把孩子往怀里再搂一把）。松手就整个撤掉轨道，
  // 人当场松开——「松手她的呼吸立刻变响」那条玩法在画面上也就成立了。
  hugTight: {
    dur: 4.2, loop: true,
    keys: [
      { t: 0.0, hipY: -0.26, hipX: 0.05, torso: 26, head: -34, armF: -18, foreF: -70, armB: -24, foreB: -76, thighB: -48, shinB: 54, footB: -6, thighF: -36, shinF: 40, footF: -8 },
      { t: 1.1, hipY: -0.248, torso: 22, head: -37, armF: -21, foreF: -73, armB: -27, foreB: -79 },   // 吸
      { t: 2.0, hipY: -0.268, torso: 29, head: -31, armF: -16, foreF: -67, armB: -22, foreB: -73 },   // 呼
      { t: 2.6, hipY: -0.275, torso: 32, head: -40, armF: -12, foreF: -62, armB: -18, foreB: -68 },   // 收紧一下
      { t: 3.2, hipY: -0.258, torso: 25, head: -35, armF: -19, foreF: -71, armB: -25, foreB: -77 },
      { t: 4.2, hipY: -0.26, torso: 26, head: -34, armF: -18, foreF: -70, armB: -24, foreB: -76 },
    ],
  },
  // 数正字（单次 7.2s，c1_count）。这一拍 11 行台词、24 秒，妹妹**一帧没动**
  // ——吹石粉时嘴肩头都不动，「一。」「二。」「三。」三声音效响过去手臂钉在
  // 同一个角度上，「她回头看柱子」时脸仍朝着门框。全拍就是一张贴纸。
  // 一条轨道演完四件事：吹掉石粉(0~1.2) → 一道一道点三下(1.65/2.95/4.25)
  // → 看着第三道(5.2) → 转过脸来找哥哥(6.2~7.2)。
  // 底子是 heldUp（被托在半空：腿垂着屈、一只手扒着哥哥的肩）。
  // **不许改 heading**：World 按 heading 整张镜像，她按在门框上的手会当帧
  // 弹过去 0.36m；「回头」转的是脖子。
  tallyCount: {
    dur: 7.2, loop: false,
    keys: [
      { t: 0.0, hipY: 0.0, hipX: 0.02, torso: 8, head: -22, armF: -132, foreF: -22, armB: -52, foreB: -34, thighB: -18, shinB: 46, footB: -14, thighF: -34, shinF: 58, footF: -16 },
      // 吹石粉：脸凑过去，撅起来吹一口（头的世界角压到 +6 ＝ 真的朝着门框吹）
      { t: 0.5, torso: 14, head: -8, armF: -126, foreF: -28 },
      { t: 0.9, torso: 16, head: -4, armF: -124, foreF: -30 },
      { t: 1.2, torso: 11, head: -14, armF: -130, foreF: -24 },
      // 「一。」——指头戳到最上那道
      { t: 1.65, torso: 9, head: -20, armF: -142, foreF: -14 },
      { t: 2.1, torso: 9, head: -20, armF: -136, foreF: -20 },
      // 「二。」——往下挪一道
      { t: 2.95, torso: 10, head: -17, armF: -130, foreF: -16 },
      { t: 3.4, torso: 10, head: -17, armF: -125, foreF: -22 },
      // 「三。」——再往下一道
      { t: 4.25, torso: 12, head: -13, armF: -118, foreF: -18 },
      { t: 4.7, torso: 12, head: -13, armF: -113, foreF: -24 },
      // 看着第三道线（手落下来一点，停住）
      { t: 5.2, torso: 11, head: -15, armF: -104, foreF: -30 },
      { t: 6.0, torso: 11, head: -15, armF: -102, foreF: -32 },
      // 回头找哥哥：手从门框上收下来，脖子转过去（heading 一格不动）
      { t: 6.6, torso: 6, head: -34, armF: -70, foreF: -38 },
      { t: 7.2, torso: 4, head: -38, armF: -58, foreF: -40 },
    ],
  },
  // 把脸贴到布上（单次 3.6s，c1_cellar「他抱起整布，低下头，将脸贴上去」）。
  // 老版借的是 leanIn——那是给妹妹写的「把额头抵在别人肩上」，torso+head 加起来
  // 是 −14°，也就是**下巴抬着**；两只手还蜷在身后。三行 8 秒里没有一帧是"贴脸"。
  // 这里手要真举到脸那么高（相对肩点是**往上** 0.13m），所以前臂不给正值。
  pressFace: {
    dur: 3.6, loop: false,
    keys: [
      { t: 0.0, hipY: -0.02, hipX: 0.0, torso: 8, head: -4, armF: -60, foreF: -30, armB: -54, foreB: -32, thighB: -8, shinB: 10, footB: -4, thighF: 6, shinF: 6, footF: -4 },
      // 把布捧到下巴前，头真的低下去（torso+head = +38 ＝ 低头）
      { t: 0.8, torso: 12, head: 26, armF: -100, foreF: -33, armB: -94, foreB: -35 },
      { t: 1.6, torso: 12, head: 27, armF: -101, foreF: -33 },   // 贴住，只剩呼吸
      { t: 2.4, torso: 11, head: 25, armF: -99, foreF: -32 },
      // 慢慢放下来
      { t: 3.6, torso: 9, head: 8, armF: -70, foreF: -30, armB: -64, foreB: -32 },
    ],
  },
  // ── 做饭蒙太奇（c1_cook，2026-08-13）───────────────────────────────
  // 12 行、约 42 秒，老版全程只有一个静态 kneel 被 FlashPose 闪了四次，
  // 另外六行连 on() 都没有（poseT 一到期人就站回默认站姿）。字幕在说
  // 「掰成小块」「摘掉根撕成几段」「蹲下吹气」，画面上是同一个跪着不动的剪影。
  // 三条轨道的下半身**逐帧原样重复 kneel 那一组**，动作全长在腰和前臂上。

  // 往锅里下料（循环 2.6s）：抓一把 → 送到锅口 → 撒进去 → 收回来
  cookDrop: {
    dur: 2.6, loop: true,
    keys: [
      { t: 0.0, hipY: -0.36, hipX: 0.02, torso: 30, head: -18, armF: -96, foreF: -34, armB: -26, foreB: -20, thighB: -38, shinB: 128, footB: 12, thighF: -44, shinF: 136, footF: 14 },
      { t: 0.7, torso: 36, head: -22, armF: -84, foreF: -18, armB: -24, foreB: -18 },   // 送到锅口
      { t: 1.2, torso: 38, head: -24, armF: -78, foreF: -6, armB: -22, foreB: -16 },    // 撒进去（手腕一抖）
      { t: 1.5, torso: 37, head: -23, armF: -82, foreF: -14 },
      { t: 2.0, torso: 32, head: -19, armF: -94, foreF: -30 },                          // 收回来再抓一把
      { t: 2.6, torso: 30, head: -18, armF: -96, foreF: -34 },
    ],
  },
  // 摘根、撕成几段（循环 1.4s）：两只手**反相对拉**——同相位就是拜佛
  tearHerb: {
    dur: 1.4, loop: true,
    keys: [
      { t: 0.0, hipY: -0.36, hipX: 0.02, torso: 28, head: -26, armF: -70, foreF: -28, armB: -58, foreB: -14, thighB: -38, shinB: 128, footB: 12, thighF: -44, shinF: 136, footF: 14 },
      { t: 0.35, torso: 30, head: -28, armF: -80, foreF: -18, armB: -48, foreB: -4 },     // 一撕
      { t: 0.7, torso: 28, head: -26, armF: -70, foreF: -28, armB: -58, foreB: -14 },
      { t: 1.05, torso: 31, head: -29, armF: -82, foreF: -16, armB: -46, foreB: -2 },     // 再撕
      { t: 1.4, torso: 28, head: -26, armF: -70, foreF: -28, armB: -58, foreB: -14 },
    ],
  },
  // 蹲下吹气（单次 3.6s）：伏到灶口 → 一口一口吹 → 直起来
  blowFire: {
    dur: 3.6, loop: false,
    keys: [
      { t: 0.0, hipY: -0.36, hipX: 0.02, torso: 26, head: -12, armF: -30, foreF: -18, armB: -26, foreB: -14, thighB: -38, shinB: 128, footB: 12, thighF: -44, shinF: 136, footF: 14 },
      { t: 0.9, hipY: -0.36, hipX: 0.08, torso: 48, head: -40, armF: -30, foreF: -18 },   // 伏到灶口（两手撑膝）
      { t: 1.5, torso: 52, head: -44 },                                                  // 吹第一口
      { t: 1.9, torso: 49, head: -41 },
      { t: 2.4, torso: 53, head: -45 },                                                  // 第二口
      { t: 3.0, hipX: 0.05, torso: 40, head: -30 },
      { t: 3.6, hipX: 0.02, torso: 28, head: -16 },                                      // 直起来
    ],
  },
  // 搅锅（循环 2.8s）：一只手扶锅沿，另一只手拿棍慢慢搅
  stirPot: {
    dur: 2.8, loop: true,
    keys: [
      { t: 0.0, hipY: -0.36, hipX: 0.02, torso: 32, head: -20, armF: -86, foreF: -22, armB: -62, foreB: -6, thighB: -38, shinB: 128, footB: 12, thighF: -44, shinF: 136, footF: 14 },
      { t: 0.7, torso: 34, head: -21, armF: -94, foreF: -12 },
      { t: 1.4, torso: 32, head: -20, armF: -86, foreF: -22 },
      { t: 2.1, torso: 31, head: -19, armF: -78, foreF: -32 },
      { t: 2.8, torso: 32, head: -20, armF: -86, foreF: -22 },
    ],
  },
  // ⑮ 按住妹妹蹲在墙根（循环 4.2s，c1_bell 那 13 秒）。与 hugTight 同一路，
  // 但底子是 shelter 的新几何（脚不再陷地）。**下半身每个关键帧写同一组数**，
  // 一格不许动——否则蹲着的人脚会来回蹭。
  shelterHold: {
    dur: 4.2, loop: true,
    keys: [
      { t: 0.0, hipY: -0.185, hipX: 0.05, torso: 22, head: -34, armF: -20, foreF: -70, armB: -26, foreB: -76, thighB: -46, shinB: 91, footB: -45, thighF: -34, shinF: 89, footF: -55 },
      { t: 1.2, hipY: -0.175, torso: 26, head: -38, armF: -23, foreF: -73, armB: -29, foreB: -79 },
      { t: 2.6, hipY: -0.195, torso: 28, head: -40, armF: -14, foreF: -64, armB: -20, foreB: -70 },   // 把她再往里收一下
      { t: 3.3, hipY: -0.180, torso: 24, head: -32, armF: -21, foreF: -71, armB: -27, foreB: -77 },
      { t: 4.2, hipY: -0.185, torso: 22, head: -34, armF: -20, foreF: -70, armB: -26, foreB: -76 },
    ],
  },
  // ── 妹妹的三条（黄昏那几拍，2026-08-13）─────────────────────────────
  // 底子都是 sitStool（坐在矮凳上，屁股 −0.34、小臂搭膝），下半身逐帧钉死。
  // 这三处原来都是「字幕在演、人坐着不动」：推碗给的是 bow（弯腰拾东西那个
  // 姿势）挂 2.8 秒，拽袖子那一行干脆连 on() 都没有，喝水只是把 carry 换掉。

  // ⑩ 按住两只碗，把哥哥那只推回来（单次 2.8s）。
  // 「哥，你也吃。」——推这一下是她全章唯一一次跟哥哥较劲，得看得见。
  pushBowlBack: {
    dur: 2.8, loop: false,
    keys: [
      { t: 0.0, hipY: -0.34, hipX: 0.02, torso: 14, head: -6, armF: -44, foreF: -58, armB: -38, foreB: -52, thighB: -84, shinB: 78, footB: 6, thighF: -78, shinF: 72, footF: 4 },
      // 两只手一起按到碗上（探到身前偏下）
      { t: 0.5, torso: 30, head: -22, armF: -54, foreF: -34, armB: -50, foreB: -30 },
      // 推出去：腰跟着送，胳膊伸开
      { t: 1.0, torso: 38, head: -18, armF: -66, foreF: -12, armB: -62, foreB: -10 },
      { t: 1.35, torso: 40, head: -16, armF: -70, foreF: -6, armB: -66, foreB: -4 },   // 到头，顿一下
      // 收回来，抬头看他（「哥，你也吃。」就落在这儿）
      { t: 1.9, torso: 22, head: -30, armF: -46, foreF: -50, armB: -42, foreB: -44 },
      { t: 2.8, torso: 16, head: -12, armF: -44, foreF: -58, armB: -38, foreB: -52 },
    ],
  },
  // ⑪ 缩了缩肩膀，往下拉自己的袖子（单次 3.8s）——**全章的题眼**：
  // 章末那一针一针缝的就是这截袖口，而这一行原来一个动作都没有。
  // 拽两下（第二下更用力），松手，袖口还停在手腕上面。
  tugSleeve: {
    dur: 3.8, loop: false,
    keys: [
      { t: 0.0, hipY: -0.34, hipX: 0.02, torso: 14, head: -6, armF: -44, foreF: -58, armB: -38, foreB: -52, thighB: -84, shinB: 78, footB: 6, thighF: -78, shinF: 72, footF: 4 },
      // 缩肩膀：整个人往里收一档，脖子缩起来
      { t: 0.6, hipY: -0.35, torso: 22, head: 8, armF: -34, foreF: -74, armB: -30, foreB: -68 },
      // 一只手抓住另一只的袖口
      { t: 1.2, torso: 26, head: -4, armF: -58, foreF: -46, armB: -44, foreB: -60 },
      { t: 1.6, torso: 28, head: -8, armF: -40, foreF: -62, armB: -44, foreB: -60 },   // 拽第一下
      { t: 2.1, torso: 26, head: -4, armF: -58, foreF: -46 },
      { t: 2.5, torso: 30, head: -10, armF: -34, foreF: -68 },                         // 第二下，更用力
      // 松手——袖口仍停在手腕上面
      { t: 3.1, torso: 20, head: 4, armF: -40, foreF: -66, armB: -36, foreB: -58 },
      { t: 3.8, torso: 16, head: 2, armF: -42, foreF: -60, armB: -38, foreB: -54 },
    ],
  },
  // ⑫ 捧着碗喝完（单次 3.4s）：两手捧起来 → 仰头 → 一口一口 → 放下，
  // 眼皮已经睁不开。
  sipBowl: {
    dur: 3.4, loop: false,
    keys: [
      { t: 0.0, hipY: -0.34, hipX: 0.02, torso: 14, head: -6, armF: -44, foreF: -58, armB: -38, foreB: -52, thighB: -84, shinB: 78, footB: 6, thighF: -78, shinF: 72, footF: 4 },
      // 捧到嘴边（前臂折死，手停在脸前）
      { t: 0.7, torso: 8, head: -14, armF: -52, foreF: -84, armB: -46, foreB: -78 },
      { t: 1.2, torso: 2, head: -26, armF: -56, foreF: -92, armB: -50, foreB: -86 },   // 仰头，第一口
      { t: 1.8, torso: 5, head: -18, armF: -54, foreF: -88, armB: -48, foreB: -82 },
      { t: 2.3, torso: 1, head: -28, armF: -57, foreF: -94, armB: -51, foreB: -88 },   // 第二口，仰到底
      // 放下碗，头垂下来
      { t: 2.9, torso: 18, head: 6, armF: -46, foreF: -56, armB: -40, foreB: -50 },
      { t: 3.4, torso: 20, head: 14, armF: -44, foreF: -58, armB: -38, foreB: -52 },
    ],
  },
  // ⑭ 在娘怀里打颤（循环 0.46s）。**不能拿 tremble 凑合**：那一条的底子是
  // 「蹲窝成一小团（在哥哥怀里）」，hipY −0.30、两条腿深屈；而这会儿她是
  // 站着被娘搂住的（pulledClose 末帧 hipY −0.05、腿几乎直）。直接切过去，
  // 0.08 秒之内她在娘怀里往下矮 15 厘米、两条腿凭空折起来——而这是全场最近
  // 的一个 insert（dist 2.6），躲不掉。下半身逐个数字照抄 pulledClose 的末帧，
  // 四个关键帧一格不许动（周期动作下半身必须钉死）。
  heldTremble: {
    dur: 0.46, loop: true,
    keys: [
      { t: 0.0, hipY: -0.05, hipX: 0.10, torso: 26, head: -40, armF: -24, foreF: -104, armB: -20, foreB: -98, thighB: -10, shinB: 12, footB: -4, thighF: 8, shinF: 6, footF: -6 },
      { t: 0.12, hipY: -0.062, torso: 29, head: -37 },
      { t: 0.24, hipY: -0.048, torso: 25, head: -41 },
      { t: 0.35, hipY: -0.058, torso: 28, head: -38 },
      { t: 0.46, hipY: -0.05, torso: 26, head: -40 },
    ],
  },
  // ⑥ 挡在门前朝菜窖指（循环 1.6s）：抬手指过去，**一顿一顿地戳两下**——
  // 静态的 mark 挂 1.8 秒读成"举着手站着"，指人是要戳的。
  pointHard: {
    dur: 1.6, loop: true,
    keys: [
      // **角度是世界角**（上臂+前臂，0° 朝下）：首版写成 −144，比水平线还高
      // 54°，也就是抬手指着房梁在喊「下去！」——和当年 pointLow 被退回的毛病
      // 一模一样。菜窖口在地面上、离她五米开外，从她的肩指过去是**水平往下**
      // 那一档，所以世界角落在 −80 上下；头也得跟着手走（torso+head 压进
      // −20°~0°，脸朝斜前下方而不是仰着）
      { t: 0.0, hipY: -0.05, hipX: 0.04, torso: 14, head: -26, armF: -62, foreF: -18, armB: -30, foreB: -44, thighB: -16, shinB: 20, footB: -6, thighF: 14, shinF: 10, footF: -8 },
      { t: 0.24, hipY: -0.07, hipX: 0.09, torso: 20, head: -30, armF: -70, foreF: -12, armB: -24, foreB: -40 },   // 戳出去
      { t: 0.5, hipY: -0.05, hipX: 0.04, torso: 15, head: -26, armF: -62, foreF: -18, armB: -30, foreB: -44 },
      { t: 0.74, hipY: -0.07, hipX: 0.09, torso: 20, head: -30, armF: -71, foreF: -11, armB: -24, foreB: -40 },   // 再戳一下
      { t: 1.0, hipY: -0.05, hipX: 0.04, torso: 14, head: -26, armF: -62, foreF: -18, armB: -30, foreB: -44 },
      { t: 1.6, hipY: -0.05, hipX: 0.04, torso: 14, head: -26, armF: -62, foreF: -18, armB: -30, foreB: -44 },
    ],
  },
  // 坐着打盹（黄昏·匀稠的，循环 6.2s＝Core 的打盹钟同一个周期）：
  // 底子是 sitStool 的坐姿；低头 3.4s（点两下）→ 动一下 0.7s（预告，
  // Core 在这一段出衣角窸窣的 cue）→ 抬头 2.1s 看他 → 猛地又耷拉下去。
  // **key 的时刻必须跟 Core 的 D = {down:3.4, stir:0.7, up:2.1} 对齐**——
  // 她的头就是这道玩法门的读数，头抬到哪儿手就得停到哪儿
  dozeNod: {
    dur: 6.2, loop: true,
    keys: [
      { t: 0.0, hipY: -0.34, hipX: 0.02, torso: 22, head: 22, armF: -44, foreF: -58, armB: -38, foreB: -52, thighB: -84, shinB: 78, footB: 6, thighF: -78, shinF: 72, footF: 4 },
      { t: 1.0, torso: 25, head: 32 },      // 点下去
      { t: 1.7, torso: 23, head: 26 },      // 悬着
      { t: 2.6, torso: 26, head: 34 },      // 又点一下
      { t: 3.4, torso: 24, head: 28 },      // 动一下：预告开始
      { t: 4.1, torso: 12, head: -12 },     // 头抬起来，看他
      { t: 5.9, torso: 13, head: -8 },      // 望着
      { t: 6.2, torso: 22, head: 22 },      // 猛地又耷拉下去
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
  // 锄地（循环）。这一条整个重 K 过一次（2026-08-10 用户：「挥舞锄头的动作还是
  // 太蠢了」「挥舞的时候为什么脚也会在y轴上漂移？」），三个教训写死在这儿：
  //
  // ① **胯一动，腿就得跟着解**。老版腿的角度只在第一帧 K 了一次（后面的键缺省
  //    沿用），而 hipY 从 -0.02 砸到 -0.22——腿挂在胯上，角度不变胯沉 20cm，
  //    两只脚就跟着整个沉进地里再浮出来，这就是"脚在 y 轴上漂"。
  //    现在每个键都带全六个腿关节，角度由 IK 解出（脚钉死在前 +0.14 / 后 -0.16）：
  //    踝的垂距 L·(cos a + cos(a−b)) 必须等于 BONE.hipY + hipY——**脚不漂全靠
  //    这条恒等式**，SmokeTest 逐键验它（TestHoeingFeetPlanted）。
  // ② **锄板要真的够到土**。锄是 alongArm 挂件，板在前臂方向 0.78m 开外；
  //    老版落锄 θ=armF+foreF=-56°，板悬在膝盖高的空气里，"松土"整段是端着锄
  //    在半空扫。现在落锄 θ=-44（板咬进身前 1.2m 的土里）、拉回 θ=-35（板贴着
  //    土被拖回脚前，肘弯着往怀里带）。
  // ③ **扬锄是扬过肩，不是举旗**——但手收在肩侧、肘大弯（θ=-186，板到头后
  //    上方 ≈2.0m），不是直臂朝前上方捧着。压着 2m 是有意的：爹和七叔在**窖里**
  //    （净高两米出头）也抡这条，抡高了锄板穿顶。
  //
  // 节奏：扬到头(0) →0.3s 抡下去（全程最快，148°）→ 咬住一顿 → 拉回松土 →
  // 慢慢提起来再扬上去（重的是锄，抬得慢）。
  hoeing: {
    dur: 2.6, loop: true,
    keys: [
      { t: 0.0, hipY: -0.055, hipX: -0.03, torso: -10, head: -4, armF: -80, foreF: -106, armB: -70, foreB: -108, thighF: -34.6, shinF: 35.8, footF: -5.1, thighB: -7.8, shinB: 41.5, footB: -37.7 },
      { t: 0.3, hipY: -0.115, hipX: 0.08, torso: 44, head: -26, armF: -30, foreF: -14, armB: -22, foreB: -14, thighF: -41.7, shinF: 69.8, footF: -32.1, thighB: -0.2, shinB: 51.2, footB: -55.0 },   // 落锄：全程最快的一下，板咬进土
      { t: 0.48, hipY: -0.11, hipX: 0.07, torso: 42, head: -24, armF: -26, foreF: -12, armB: -18, foreB: -12, thighF: -41.7, shinF: 67.7, footF: -30.1, thighB: -1.3, shinB: 51.1, footB: -53.8 },   // 咬住，顿一下
      { t: 1.05, hipY: -0.095, hipX: -0.01, torso: 20, head: -14, armF: 7, foreF: -42, armB: 12, foreB: -42, thighF: -44.2, shinF: 56.6, footF: -16.3, thighB: -12.3, shinB: 56.6, footB: -48.2 },   // 拉回：板贴着土拖到脚前，肘往怀里带
      { t: 1.8, hipY: -0.06, hipX: -0.03, torso: 2, head: -8, armF: -60, foreF: -70, armB: -50, foreB: -72, thighF: -36.2, shinF: 38.6, footF: -6.4, thighB: -8.9, shinB: 44.0, footB: -39.1 },      // 提起来，板扫过头前
      { t: 2.6, hipY: -0.055, hipX: -0.03, torso: -10, head: -4, armF: -80, foreF: -106, armB: -70, foreB: -108, thighF: -34.6, shinF: 35.8, footF: -5.1, thighB: -7.8, shinB: 41.5, footB: -37.7 },
    ],
  },
  // 撒食喂鸡（循环）：胳膊肘挎着笸箩，另一只手抓一把、扬出去，
  // 顿一顿看鸡抢食，再抓一把。扬手那一下最快，其余都是等
  scatterFeed: {
    dur: 2.8, loop: true,
    keys: [
      { t: 0.0, hipY: -0.02, hipX: 0.02, torso: 10, head: -8, armB: -66, foreB: -74, armF: -30, foreF: -20, thighB: -6, shinB: 8, footB: -4, thighF: 4, shinF: 4, footF: -4 },
      { t: 0.5, hipY: -0.04, hipX: 0.03, torso: 14, head: -10, armF: -52, foreF: -46 },   // 手伸进笸箩抓食
      { t: 0.85, hipY: 0.0, hipX: 0.0, torso: 4, head: -4, armF: 26, foreF: -8 },          // 扬出去（最快的一下）
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
  // 挨砸（单次）：整个人向前砸出去，双手撑地，很慢地摇着头抬起来。
  // **第一帧必须是站着的**——这条轨道三处用户（刘家老人、刘嫂、爹）挨砸时
  // 都还站着，而受方的 t 是从负数起的（等到枪托落下那一帧才动）。老版第一帧
  // 就是跪姿（hipY −0.44、小腿折在身后），于是"等"的那一段里人先自己跪下去，
  // 枪托才不紧不慢地抡下来——挨打的比打人的先倒
  struckFall: {
    dur: 3.6, loop: false,
    keys: [
      { t: 0.0, hipY: -0.03, hipX: 0.01, torso: 12, head: -14, thighB: -12, shinB: 16, footB: -5, thighF: 8, shinF: 6, footF: -7, armB: -30, foreB: -34, armF: -34, foreF: -30 },
      { t: 0.12, hipY: -0.22, hipX: 0.16, torso: 52, head: -26, armB: -66, foreB: -22, armF: -74, foreF: -18, thighB: -40, shinB: 44, thighF: -16, shinF: 22 },  // 打中：膝先软
      { t: 0.34, hipY: -0.50, hipX: 0.24, torso: 74, head: -40, armB: -96, foreB: -14, armF: -104, foreF: -10, thighB: -10, shinB: 98, footB: 26, thighF: -4, shinF: 94, footF: 26 },  // 扑出去、手撑地
      { t: 0.55, hipY: -0.52, hipX: 0.22, torso: 78, head: -34, armB: -90, foreB: -12, armF: -98, foreF: -8 },    // 撑住，沉底
      { t: 1.6, hipY: -0.50, hipX: 0.18, torso: 66, head: -50 },                                                  // 半天不动
      { t: 2.3, hipY: -0.48, hipX: 0.13, torso: 54, head: -30 },                                                  // 慢慢起来一点
      { t: 2.7, hipY: -0.48, hipX: 0.13, torso: 56, head: -42 },                                                  // 摇头：一边
      { t: 3.05, hipY: -0.47, hipX: 0.12, torso: 52, head: -22 },                                                 // 另一边
      { t: 3.6, hipY: -0.46, hipX: 0.09, torso: 44, head: -28 },
    ],
  },

  // 礅门轴（循环）：单膝跪在门边，一只手按着门轴，另一只手抡短木槌一下一下地敲。
  //
  // 老版是拿两个**静态姿势**来回切（`kneel` ⇄ `swing`，都是从别处借来的：
  // 一个是"被按着跪在地上"、一个是"抡枪托"）。两件事因此都错了——
  // 用户 2026-08-10 的原话：「脚会位移，而且我也看不出他是在修什么东西」：
  //   ① kneel 的胯高 −0.52、swing 的胯高 −0.08，两个姿势差了 44 厘米，
  //      腿也从跪姿变站姿——每 0.85 秒他就从跪着弹起来再蹲回去，脚当然在滑；
  //      hipX 还差 0.12m，整个人横着挪。
  //   ② 借来的 swing 是双手举过头顶抡枪托，读不出"他在敲一根轴"。
  //
  // 所以这条轨道有一条**硬约束**：下半身在每一个关键帧上都是同一组数
  //（hipY/hipX/两条腿/脚全不动），脚就不可能滑。动作全长在上半身：
  //   - 后手常按在轴边的门框上（一动不动，那是"扶住"）；
  //   - 前手抡槌：抬起来慢、落下去 0.11s，落点由 IK 反算过——槌头正砸在
  //     离地 0.2m、身前 0.45m 的那根轴头上（门枕石就在那儿，见 DrawDoorSocket）。
  // 相位由 Core 的 knockT 直接喂（t = knockT），所以"咚"的那一声、进度涨的
  // 那一格、槌子落下的那一帧是同一刻；门歪出去 knockT 往回退，槌子就跟着收住。
  malletTap: {
    dur: 0.85, loop: true,
    keys: [
      // t=0 与 t=0.85 必须是同一格：knockT 归零那一帧才接得上，不然每敲一下闪一下
      { t: 0.00, hipY: -0.31, hipX: 0.05, torso: 52, head: -40,
        armB: -42, foreB: -26, armF: 73, foreF: -120,
        thighB: -8, shinB: 96, footB: 16, thighF: -74, shinF: 80, footF: -4 },
      { t: 0.22, torso: 50, head: -38, armF: 40, foreF: -40 },       // 提槌
      // 举起来是**往自己身后举**（前臂世界角 −135°），不是往门那边举：
      // 爹跪在轴的西边、脸朝东，槌子要是甩向东，整条胳膊就横到扶门的柱子身上，
      // 画面上读成"这把槌子是柱子的"（实拍逮到的）
      { t: 0.58, torso: 46, head: -34, armF: -10, foreF: -145 },      // 举到最高（慢）
      { t: 0.74, torso: 45, head: -33, armF: -12, foreF: -150 },      // 顿住蓄一下
      { t: 0.85, torso: 52, head: -40, armF: 73, foreF: -120 },      // 砸下：0.11s，全程最快
    ],
  },

  // ── 第十一场（搜家）的接触动作 ──────────────────────────────────────────
  // 这一场以前是「谁也没碰谁」：夺包袱布只有一行 sis.carry = null，扇耳光借了
  // 抡枪托的 buttStrike，踹柱子干脆只有一个 kneel 静姿。剧本里写明的三个动作
  // （夺、扇、踹）因此在画面上一个都不成立。下面四对轨道各自成对——**动手的
  // 和挨手的必须同时起，落点对在同一帧上**（受方 t 起负数＝等到那一下才动）。

  // 夺（单次）：探身、一把攥住对方手里的东西、往自己怀里一扯。
  // 攥住那一下 0.15s 是全程最快的；扯回来带着对方的身子一起晃
  snatchGrab: {
    dur: 1.5, loop: false,
    keys: [
      { t: 0.0, hipY: -0.02, hipX: -0.02, torso: 4, head: -8, armF: -34, foreF: -30, armB: -28, foreB: -34, thighB: -14, shinB: 18, footB: -6, thighF: 10, shinF: 8, footF: -8 },
      { t: 0.35, hipY: -0.10, hipX: 0.16, torso: 34, head: -22, armF: -104, foreF: -6, armB: -74, foreB: -18 },   // 探身够过去
      { t: 0.50, hipY: -0.11, hipX: 0.18, torso: 36, head: -24, armF: -112, foreF: 0, armB: -80, foreB: -14 },    // 攥住：顿一下
      { t: 0.72, hipY: -0.04, hipX: -0.10, torso: -10, head: -6, armF: -46, foreF: -62, armB: -38, foreB: -58 },  // 往回一扯：0.22s，最快的一下
      { t: 1.5, hipY: -0.02, hipX: -0.04, torso: -2, head: -10, armF: -40, foreF: -54, armB: -34, foreB: -50 },   // 东西收在怀里
    ],
  },
  // 被夺（单次，从 t<0 起等）：手被扯得往前带了半步，人跟着趔趄，
  // 再空着两只手追出去够——够不着，手停在半空
  snatchLose: {
    dur: 1.8, loop: false,
    keys: [
      { t: 0.0, hipY: -0.03, hipX: 0.04, torso: 10, head: -14, armF: -52, foreF: -46, armB: -44, foreB: -42, thighB: -12, shinB: 16, footB: -5, thighF: 8, shinF: 6, footF: -6 },
      { t: 0.22, hipY: -0.06, hipX: 0.20, torso: 30, head: -26, armF: -96, foreF: -8, armB: -70, foreB: -20, thighB: -24, shinB: 26, thighF: 16, shinF: 10 },  // 被扯得往前带
      { t: 0.55, hipY: -0.05, hipX: 0.12, torso: 22, head: -30, armF: -108, foreF: -12, armB: -84, foreB: -22 },  // 追着够
      { t: 1.0, hipY: -0.04, hipX: 0.06, torso: 14, head: -24, armF: -92, foreF: -22, armB: -72, foreB: -30 },    // 停在半空
      { t: 1.8, hipY: -0.03, hipX: 0.02, torso: 8, head: -18, armF: -70, foreF: -34, armB: -56, foreB: -38 },
    ],
  },
  // 扇耳光（单次）。**跟抡枪托是两回事**：枪托要举过头顶蓄力、砸的是竖直向下的
  // 一记；耳光是横的——手抬到自己肩外侧，肘先松着，甩出去时小臂才抽直，
  // 打完手停在对方脸的高度上（armF≈-78° 时手心大约在 1.05m，正好是孩子的脸）。
  // 挥出去那一下 0.12s，是全作最快的一帧
  slap: {
    dur: 1.6, loop: false,
    keys: [
      { t: 0.0, hipY: -0.02, hipX: -0.02, torso: 2, head: -6, armF: -26, foreF: -30, armB: -14, foreB: -30, thighB: -12, shinB: 16, footB: -6, thighF: 8, shinF: 6, footF: -8 },
      // 另一只手要**反着走**，不然两条胳膊平行伸出去，读出来是"双手去够"不是抡
      { t: 0.40, hipY: -0.03, hipX: -0.12, torso: -16, head: 8, armF: 34, foreF: -62, armB: -6, foreB: -40 },     // 抬到肩外侧、肘松着
      // 落点是**量出来的**：兵的肩在 1.22m，孩子的脸在 0.91m、身前约 0.4m，
      // 两节胳膊合起来 0.5m —— 手要停在那儿，胳膊的世界角就得是 −52°。
      // 第一版按 −82° 抡（照抡枪托的幅度写的），手从她头顶上方半尺扫过去，
      // 打的是空气。**接触动作的角度按落点反算，别照感觉写。**
      { t: 0.52, hipY: -0.05, hipX: 0.14, torso: 22, head: -14, armF: -52, foreF: -2, armB: 10, foreB: -52 },     // 甩出去：0.12s（另一只手甩到身后配平）
      { t: 0.72, hipY: -0.04, hipX: 0.08, torso: 14, head: -10, armF: -44, foreF: -14, armB: 2, foreB: -46 },     // 收住
      { t: 1.6, hipY: -0.02, hipX: -0.02, torso: 2, head: -8, armF: -28, foreF: -30, armB: -14, foreB: -30 },     // 手垂回去
    ],
  },
  // 挨耳光倒地（单次，孩子的量级）。跟 struckFall 分开是因为分量不同：
  // 枪托砸的是整个人向前砸出去、双手撑地；耳光是**头先被打偏**，人才跟着侧倒，
  // 而且爬起来的第一件事是一只手捂住那半边脸（第十二场的"湿布贴脸"接在这儿）
  slappedFall: {
    dur: 3.2, loop: false,
    keys: [
      { t: 0.0, hipY: -0.03, hipX: 0.02, torso: 8, head: -14, armF: -46, foreF: -40, armB: -40, foreB: -36, thighB: -12, shinB: 16, footB: -5, thighF: 8, shinF: 6, footF: -6 },
      { t: 0.10, hipY: -0.05, hipX: 0.06, torso: 14, head: 38, armF: -40, foreF: -46 },                            // 头被打偏：0.1s，先动的是脑袋
      { t: 0.38, hipY: -0.42, hipX: 0.22, torso: 58, head: 20, armF: -96, foreF: -16, armB: -88, foreB: -20, thighB: -66, shinB: 84, footB: 14, thighF: -40, shinF: 62, footF: 10 },  // 人才跟着摔下去
      { t: 0.70, hipY: -0.48, hipX: 0.18, torso: 66, head: -8, armF: -92, foreF: -14, armB: -84, foreB: -18 },      // 一只手撑住，沉底
      { t: 1.35, hipY: -0.46, hipX: 0.14, torso: 58, head: -34, armF: -58, foreF: -104, armB: -80, foreB: -22 },    // 手抬起来捂脸
      { t: 2.10, hipY: -0.45, hipX: 0.12, torso: 52, head: -40, armF: -54, foreF: -110 },                          // 捂着不动
      { t: 3.2, hipY: -0.44, hipX: 0.10, torso: 48, head: -36, armF: -52, foreF: -108 },
    ],
  },
  // 踹（单次）：重心先坐到后腿上，前腿曲起、蹬出去，收腿。踹的是腹部，
  // 所以腿抬到 thighF≈-70° 就够（再高成了正踢腿，那是踢门不是踹人）
  kickGut: {
    dur: 1.5, loop: false,
    keys: [
      { t: 0.0, hipY: -0.02, hipX: -0.02, torso: 4, head: -8, armF: -34, foreF: -34, armB: -30, foreB: -30, thighB: -14, shinB: 18, footB: -6, thighF: 10, shinF: 8, footF: -8 },
      { t: 0.32, hipY: -0.06, hipX: -0.12, torso: -14, head: -4, thighF: -62, shinF: 74, footF: 6, thighB: -18, shinB: 24, armF: -18, armB: -46, foreB: -20 },  // 曲腿收上来
      { t: 0.46, hipY: -0.04, hipX: 0.10, torso: 16, head: -12, thighF: -74, shinF: 12, footF: -14, armF: -50, armB: -62 },   // 蹬出去：0.14s
      { t: 0.72, hipY: -0.03, hipX: 0.02, torso: 8, head: -10, thighF: -34, shinF: 34, footF: -6 },                          // 收腿
      { t: 1.5, hipY: -0.02, hipX: -0.02, torso: 4, head: -8, thighF: 10, shinF: 8, footF: -8, armF: -34, foreF: -34 },
    ],
  },
  // 挨踹（单次，从 t<0 起等）：腹部先折起来（人整个弯成一团），
  // 才是往后坐倒；很久之后手才从肚子上松开一点。这一拍不许有"撑起来还手"的相位
  gutFold: {
    dur: 3.4, loop: false,
    keys: [
      { t: 0.0, hipY: -0.04, hipX: 0.06, torso: 16, head: -18, armF: -56, foreF: -34, armB: -48, foreB: -32, thighB: -14, shinB: 18, footB: -5, thighF: 10, shinF: 8, footF: -6 },
      { t: 0.14, hipY: -0.14, hipX: -0.10, torso: 62, head: -34, armF: -34, foreF: -104, armB: -30, foreB: -100, thighB: -30, shinB: 34, thighF: -22, shinF: 28 },  // 折起来：0.14s
      { t: 0.50, hipY: -0.48, hipX: -0.18, torso: 70, head: -28, armF: -30, foreF: -112, armB: -26, foreB: -106, thighB: -92, shinB: 100, footB: 10, thighF: -84, shinF: 96, footF: 8 },  // 跪坐下去
      { t: 1.40, hipY: -0.52, hipX: -0.14, torso: 74, head: -20, armF: -28, foreF: -116, armB: -24, foreB: -110 },   // 捂着肚子不动
      { t: 2.40, hipY: -0.50, hipX: -0.12, torso: 66, head: -34, armF: -30, foreF: -108 },                          // 抬了一下头
      { t: 3.4, hipY: -0.50, hipX: -0.12, torso: 62, head: -30, armF: -32, foreF: -104 },
    ],
  },
  // 一把攥住别人的胳膊往回带（单次）：爹拦柱子那一下。手要真的够到对方
  // （armF -100° 时手心在身前 0.5m 上下），攥住之后整个人往后坐着往回拽
  clutchArm: {
    dur: 1.6, loop: false,
    keys: [
      { t: 0.0, hipY: -0.03, hipX: 0.02, torso: 8, head: -12, armF: -40, foreF: -30, armB: -34, foreB: -28, thighB: -14, shinB: 18, footB: -6, thighF: 10, shinF: 8, footF: -8 },
      { t: 0.22, hipY: -0.06, hipX: 0.20, torso: 32, head: -26, armF: -102, foreF: -8, armB: -56, foreB: -24, thighB: -26, shinB: 30, thighF: 18, shinF: 12 },  // 伸手够到：0.22s
      { t: 0.40, hipY: -0.08, hipX: 0.14, torso: 26, head: -24, armF: -96, foreF: -18, armB: -50, foreB: -28 },     // 攥住
      { t: 0.72, hipY: -0.10, hipX: -0.08, torso: -12, head: -18, armF: -70, foreF: -44, armB: -44, foreB: -34, thighB: -34, shinB: 38, thighF: 6, shinF: 10 },  // 往回拽
      { t: 1.6, hipY: -0.06, hipX: -0.02, torso: -4, head: -16, armF: -62, foreF: -40, armB: -40, foreB: -32 },
    ],
  },
  // 被攥住往回带（单次）：已经冲出去半步，胳膊被从后面拽住，身子还朝前、
  // 脚却被带得往回蹭——挣了一下，没挣开
  // dur 从 1.8 拉到 9.0（2026-08-13）：这一拍三行台词共 9 秒，老版演完 1.8 秒
  // 就在末帧上冻住 7.2 秒——「那只手抓得很紧」「水。」两行整整六秒是一具雕像，
  // 而且走轨道的人绕开了会呼吸的那几支。改 loop:true 更糟（每 4.6 秒把那下
  // 猛挣重放一遍），所以是**把关键帧铺满这 9 秒**：后半段只留很慢的起伏，
  // 下半身沿用 t=1.8 那一组数一个不改（攥着不放的余韵，不是又挣一次）。
  heldBack: {
    dur: 9.0, loop: false,
    keys: [
      { t: 0.0, hipY: -0.06, hipX: 0.18, torso: 34, head: -28, armF: -96, foreF: -12, armB: -60, foreB: -18, thighB: -34, shinB: 36, footB: -8, thighF: 20, shinF: 12, footF: -10 },
      { t: 0.30, hipY: -0.08, hipX: 0.10, torso: 26, head: -30, armB: -128, foreB: -6, armF: -84, foreF: -20, thighB: -20, shinB: 26, thighF: 8, shinF: 10 },   // 胳膊被拽住、往后带
      { t: 0.62, hipY: -0.07, hipX: 0.16, torso: 32, head: -34, armB: -136, foreB: -4, armF: -92, foreF: -14 },      // 又挣了一下
      { t: 1.0, hipY: -0.09, hipX: 0.04, torso: 20, head: -26, armB: -124, foreB: -10, armF: -74, foreF: -28 },      // 没挣开
      { t: 1.8, hipY: -0.08, hipX: 0.02, torso: 16, head: -24, armB: -112, foreB: -16, armF: -66, foreF: -32 },
      { t: 3.2, hipY: -0.075, torso: 14, head: -28, armB: -108, foreB: -20 },
      { t: 4.6, hipY: -0.085, torso: 17, head: -22, armB: -116, foreB: -14 },
      { t: 6.0, hipY: -0.075, torso: 14, head: -27, armB: -110, foreB: -18 },
      { t: 7.4, hipY: -0.086, torso: 17, head: -21, armB: -118, foreB: -13 },
      { t: 9.0, hipY: -0.078, torso: 15, head: -25, armB: -112, foreB: -16 },
    ],
  },
  // 抖开包袱、把里面的东西倒空（单次）：两手拎着两角一抖，再随手撇开。
  // 榆钱洒一地那一下由 Core 的 elmRain 接住，动作只管"是谁把它抖空的"
  shakeOut: {
    dur: 1.6, loop: false,
    keys: [
      { t: 0.0, hipY: -0.02, hipX: -0.04, torso: -2, head: -10, armF: -40, foreF: -54, armB: -34, foreB: -50, thighB: -12, shinB: 16, footB: -6, thighF: 8, shinF: 6, footF: -8 },
      { t: 0.26, hipY: -0.03, hipX: 0.02, torso: 8, head: -16, armF: -86, foreF: -22, armB: -78, foreB: -26 },      // 拎起来
      { t: 0.40, hipY: -0.02, hipX: -0.02, torso: -4, head: -12, armF: -70, foreF: -8, armB: -64, foreB: -12 },     // 一抖
      { t: 0.54, hipY: -0.03, hipX: 0.02, torso: 6, head: -16, armF: -88, foreF: -20, armB: -80, foreB: -24 },      // 再一抖
      { t: 0.90, hipY: -0.02, hipX: -0.06, torso: -8, head: -8, armF: -28, foreF: -18, armB: -26, foreB: -20 },     // 撇开
      { t: 1.6, hipY: -0.02, hipX: -0.02, torso: 0, head: -10, armF: -32, foreF: -30, armB: -28, foreB: -28 },
    ],
  },
  // 用枪身把人往回推（单次）：双手横端着枪，平推出去，人往前跨半步压过去
  shovePush: {
    dur: 1.4, loop: false,
    keys: [
      { t: 0.0, hipY: -0.02, hipX: -0.02, torso: 4, head: -8, armF: -56, foreF: -30, armB: -50, foreB: -34, thighB: -14, shinB: 18, footB: -6, thighF: 10, shinF: 8, footF: -8 },
      { t: 0.28, hipY: -0.04, hipX: -0.10, torso: -8, head: -6, armF: -66, foreF: -46, armB: -60, foreB: -50 },     // 收回来蓄一下
      { t: 0.44, hipY: -0.06, hipX: 0.18, torso: 28, head: -14, armF: -92, foreF: -4, armB: -84, foreB: -8, thighB: -30, shinB: 34, thighF: 20, shinF: 12 },  // 平推出去
      { t: 0.75, hipY: -0.04, hipX: 0.08, torso: 16, head: -10, armF: -78, foreF: -18, armB: -70, foreB: -22 },
      { t: 1.4, hipY: -0.02, hipX: -0.02, torso: 4, head: -8, armF: -56, foreF: -30, armB: -50, foreB: -34 },
    ],
  },
  // 被推得倒退（单次）：胸口挨了一下，脚跟着往后倒腾两步，手在身前挡着
  shovedBack: {
    dur: 1.6, loop: false,
    keys: [
      { t: 0.0, hipY: -0.03, hipX: 0.08, torso: 16, head: -22, armF: -64, foreF: -30, armB: -56, foreB: -28, thighB: -14, shinB: 18, footB: -6, thighF: 10, shinF: 8, footF: -8 },
      { t: 0.16, hipY: -0.06, hipX: -0.14, torso: -18, head: -6, armF: -80, foreF: -40, armB: -72, foreB: -38, thighB: -36, shinB: 30, thighF: 22, shinF: 16 },  // 胸口挨了一下：0.16s
      { t: 0.42, hipY: -0.05, hipX: -0.08, torso: -10, head: -14, thighB: 18, shinB: 14, thighF: -30, shinF: 26 },   // 倒腾一步
      { t: 0.68, hipY: -0.04, hipX: -0.10, torso: -12, head: -18, thighB: -28, shinB: 24, thighF: 16, shinF: 12 },   // 再一步
      { t: 1.6, hipY: -0.03, hipX: -0.04, torso: -4, head: -24, armF: -58, foreF: -34, armB: -52, foreB: -32 },
    ],
  },
  // ── §9 草苫底下那只手（2026-08-14 用户退回：「这个陌生人你完全没做出来」）──
  // 老版这一镜是**一张贴在地上的静帧贴图**（strawArm 道具）加柱子站在一米外
  // 举着胳膊：没有人、没有接触、没有动。两条轨道现在把它演出来。
  //
  // 躺着的人怎么写：World 见到 `sleep` 就把**整具骨架转 90°**（LIE_POSES），
  // 所以这支轨道跟妹妹的睡姿一样，写的是"站着的时候是什么样"，转过去才是
  // 躺着那个画面。两条换算记牢（伤员 heading -1，头落在东边、朝着柱子）：
  //   · 站姿的「上」（头顶方向）→ 躺下之后的**东**（柱子那一侧）
  //   · 站姿的「前」（面朝方向）→ 躺下之后的**上**（肚皮朝天）
  // 要让手落在东 +0.40m、高 +0.25m 处（＝蹲着的柱子那只垂着的手），
  // 就得在站姿里把胳膊举过头顶再往前偏 32°：armF ≈ −148°、前臂几乎伸直。
  // 照"站着伸手去够"的手感写（armF −90 上下）的话，躺下来是直挺挺指着天。
  strawReach: {
    dur: 9.4, loop: false,
    keys: [
      // 蜷着（同 sleep：两手掖在下巴底下、膝盖朝上拱）
      { t: 0.0, hipY: -0.02, hipX: 0.0, torso: 14, head: 14, armF: -14, foreF: -150, armB: -10, foreB: -148, thighB: -45, shinB: 111, footB: 0, thighF: -45, shinF: 111, footF: 0 },
      // 胳膊从草底下探出来：0.16 秒——快，是抓住，不是伸手要东西
      { t: 0.16, torso: 20, head: -4, armF: -148, foreF: -14 },
      // 攥住。头跟着仰过去（躺着的人要看头顶那边的人，是**仰脖**不是收下巴）
      { t: 0.42, torso: 24, head: -18, armF: -140, foreF: -26 },
      // 攥着不放，往回带一点点（他没力气，能做的只有不松手）
      { t: 0.95, torso: 22, head: -16, armF: -133, foreF: -34 },
      // 剩下的六七秒是三行台词：只留很慢的起伏，下半身一个数不改
      { t: 2.4, torso: 24, head: -19, armF: -136, foreF: -31 },
      { t: 4.0, torso: 21, head: -15, armF: -131, foreF: -36 },
      { t: 5.8, torso: 24, head: -18, armF: -135, foreF: -32 },
      { t: 7.6, torso: 21, head: -14, armF: -130, foreF: -37 },
      { t: 9.4, torso: 23, head: -17, armF: -134, foreF: -33 },
    ],
  },
  // 手松开、落回草里（单次）：胳膊先软下来，才整条落回身侧，头也躺平
  strawSink: {
    dur: 2.0, loop: false,
    keys: [
      { t: 0.0, hipY: -0.02, hipX: 0.0, torso: 23, head: -17, armF: -134, foreF: -33, armB: -10, foreB: -148, thighB: -45, shinB: 111, footB: 0, thighF: -45, shinF: 111, footF: 0 },
      { t: 0.30, torso: 20, head: -12, armF: -118, foreF: -52 },   // 手先松（指头张开那一下由角度带出来）
      { t: 0.90, torso: 17, head: 2, armF: -72, foreF: -96 },      // 整条胳膊落下去
      { t: 2.0, torso: 14, head: 14, armF: -18, foreF: -142 },     // 躺回蜷着那一团
    ],
  },
  // 蹲着被攥住手腕（单次，9 秒＝这一镜三行台词）。柱子蹲在草苫跟前、
  // 朝西（heading −1），所以**被攥住的是前手**（armF）。
  // 顺序是有讲究的：先是那条胳膊被拽沉（0.1 秒，只有胳膊动），人才跟着往前
  // 伏一下，然后猛地往回抽——**没抽出来**，胳膊仍旧被扯在原处。
  // 后半段只剩呼吸的起伏，两条腿一个数不改（蹲着的脚一动就是滑步）。
  wristSeized: {
    dur: 9.0, loop: false,
    keys: [
      { t: 0.0, hipY: -0.40, hipX: 0.04, torso: 22, head: 16, armF: -58, foreF: -46, armB: -34, foreB: -40, thighB: -78, shinB: 92, footB: 12, thighF: -70, shinF: 86, footF: 10 },
      { t: 0.10, torso: 30, head: 24, armF: -86, foreF: -16 },                          // 手被攥住：先动的只有这条胳膊
      { t: 0.32, hipY: -0.44, hipX: 0.16, torso: 40, head: 20, armB: -52, foreB: -30 }, // 整个人被带得往前伏
      { t: 0.64, hipY: -0.41, hipX: -0.06, torso: 10, head: 12, armF: -78, foreF: -30, armB: -60, foreB: -24 },  // 猛地往回抽
      { t: 1.05, hipY: -0.42, hipX: 0.02, torso: 18, head: 18, armF: -83, foreF: -21 }, // 没抽出来
      { t: 2.6, torso: 20, head: 16, armF: -85, foreF: -19 },
      { t: 4.4, torso: 17, head: 19, armF: -81, foreF: -23 },
      { t: 6.2, torso: 20, head: 15, armF: -85, foreF: -19 },
      { t: 9.0, torso: 18, head: 18, armF: -82, foreF: -22 },
    ],
  },
};

const TRACK_JOINTS = ["torso", "head", "thighB", "shinB", "footB", "thighF", "shinF", "footF", "armB", "foreB", "armF", "foreF"];
const TRACK_FIELDS = ["hipY", "hipX", ...TRACK_JOINTS];

// ── 关键帧之间怎么插（2026-08-17 重写；用户："抱起妹妹的动画…不流畅"）──
//
// 老版是**每一段各自 smoothstep**：缓入缓出是对每两帧之间说的，于是**每一个
// 关键帧上速度都归零**。一条 4 帧的轨道读出来就是三下互不相干的推拉——
// 蹲下去、停；兜起来、停；站直、停。关键帧写得越密越像卡顿，而"写密一点让它
// 顺一点"正是所有人的第一反应，等于往病根上加料。
//
// 现在走**分段三次 Hermite**，切线由前后两段的割线定（Catmull-Rom），
// 并按 Fritsch–Carlson 夹住不许过冲：
//   · 速度只在**真正的折返点**（局部极值：蹲到最低、抡到最高）上归零——
//     那儿本来就该停一下；一路往同一个方向走的几帧连成一条连贯的运动。
//   · **不过冲**是硬要求：这套姿势的角度全是按几何量出来的（手要落在她胯上、
//     膝要着地），普通 Catmull-Rom 在快慢段交界处会冲过关键帧十几度，
//     那就是手插进人体里。夹住之后曲线永远停在相邻两帧的值域内。
//   · 直轨（loop:false）两端各镜像一格 ⇒ 端点切线自然归零＝整条轨道缓入缓出，
//     接进/接出常态姿势时不会甩一下。
//   · 循环轨绕回去取邻居，所以**跨过末帧那一下也不再顿**（走姿、守窖口那种
//     一直在循环的轨道，老版每转一圈都要停一次）。
function TrackSeq(tr) {
  if (tr._seq) return tr._seq;
  const keys = tr.keys;
  const n = keys.length;
  // 稀疏语义照旧：某个关节这一帧没写就沿用上一次显式赋的值；开头没写的往后借。
  // 摊成稠密表只是为了不用每帧再逐关节往回扫。
  const dense = {};
  for (const joint of TRACK_FIELDS) {
    const col = new Array(n);
    let last;
    for (let k = 0; k < n; k += 1) {
      if (keys[k][joint] !== undefined) last = keys[k][joint];
      col[k] = last;
    }
    let first = 0;
    while (first < n && col[first] === undefined) first += 1;
    const fill = first < n ? col[first] : 0;
    for (let k = 0; k < first; k += 1) col[k] = fill;
    dense[joint] = col;
  }
  // 采样用的帧序：两端各补一格虚拟帧，切线算到端点也不用分支。
  // 循环轨的虚拟帧绕到另一头去（末帧 t==dur 且＝首帧的那种"闭合"轨道要跳过
  // 那格重复帧，否则绕回去取到的是同一个姿势，切线又成了 0）。
  const seq = keys.map((k, idx) => ({ t: k.t, i: idx }));
  if (tr.loop) {
    const closed = Math.abs(keys[n - 1].t - tr.dur) < 1e-3;
    const pre = closed ? Math.max(0, n - 2) : n - 1;
    const post = closed ? Math.min(n - 1, 1) : 0;
    seq.unshift({ t: keys[pre].t - tr.dur, i: pre });
    seq.push({ t: keys[post].t + tr.dur, i: post });
    seq.push({ t: keys[Math.min(n - 1, post + 1)].t + tr.dur, i: Math.min(n - 1, post + 1) });
  } else {
    const h0 = n > 1 ? keys[1].t - keys[0].t : 1;
    const h1 = n > 1 ? keys[n - 1].t - keys[n - 2].t : 1;
    seq.unshift({ t: keys[0].t - Math.max(1e-3, h0), i: 0 });          // 镜像＝端点速度 0
    seq.push({ t: keys[n - 1].t + Math.max(1e-3, h1), i: n - 1 });
    seq.push({ t: keys[n - 1].t + 2 * Math.max(1e-3, h1), i: n - 1 });
  }
  tr._seq = { seq, dense };
  return tr._seq;
}

function SampleTrack(name, time) {
  const tr = TRACKS[name];
  if (!tr) return null;
  const keys = tr.keys;
  const n = keys.length;
  const { seq, dense } = TrackSeq(tr);
  const t = tr.loop
    ? ((time % tr.dur) + tr.dur) % tr.dur
    : Math.min(Math.max(time, 0), tr.dur - 1e-4);
  let i = 0;
  while (i < n - 1 && keys[i + 1].t <= t) i += 1;
  // seq 前面补了一格，所以 keys[i] 是 seq[i+1]；这一段是 seq[q]→seq[q+1]
  const q = i + 1;
  const t0 = seq[q].t, t1 = seq[q + 1].t;
  const h = Math.max(1e-4, t1 - t0);
  const u = Math.max(0, Math.min(1, (t - t0) / h));
  // Hermite 基
  const u2 = u * u, u3 = u2 * u;
  const b0 = 2 * u3 - 3 * u2 + 1;
  const b1 = u3 - 2 * u2 + u;
  const b2 = -2 * u3 + 3 * u2;
  const b3 = u3 - u2;
  const hPrev = seq[q].t - seq[q - 1].t;
  const hNext = seq[q + 2].t - seq[q + 1].t;
  const out = {};
  for (const joint of TRACK_FIELDS) {
    const col = dense[joint];
    const vP = col[seq[q - 1].i], v0 = col[seq[q].i], v1 = col[seq[q + 1].i], vN = col[seq[q + 2].i];
    const d = (v1 - v0) / h;
    const dP = hPrev > 1e-6 ? (v0 - vP) / hPrev : d;
    const dN = hNext > 1e-6 ? (vN - v1) / hNext : d;
    // 折返点上切线归零，其余取两段割线的均值并夹住（Fritsch–Carlson）
    const m0 = dP * d <= 0 ? 0 : ClampSlope((dP + d) / 2, dP, d);
    const m1 = d * dN <= 0 ? 0 : ClampSlope((d + dN) / 2, d, dN);
    const v = b0 * v0 + b1 * h * m0 + b2 * v1 + b3 * h * m1;
    out[joint] = joint === "hipY" || joint === "hipX" ? v : v * DEG;
  }
  return out;
}

function ClampSlope(m, a, b) {
  const lim = 3 * Math.min(Math.abs(a), Math.abs(b));
  return Math.abs(m) > lim ? Math.sign(m) * lim : m;
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
/**
 * 把**前手**两骨反解到 aim（骨架局部坐标）上——"手真的落在那件东西上"。
 * 摇辘轳立的规矩，找吃的那三道手（掀苫草/拖门板/扒烧土）照抄：手上有活的
 * 姿势，胳膊不许照角度表摆在半空，否则画面上就是"对着东西空划拉"。
 * 两组解里挑**肘朝下**的那一组（肘翘到肩膀上头读成"吊在把手上"）。
 * both=true 时后手也搭上去（两手抓同一件东西，稍稍错开一点，别叠成一条）。
 */
function AimFrontHand(target, aim, both = false) {
  if (!aim) return;
  // 肩点＝躯干局部 (0, sh) 跟着躯干转过来的位置（同 ApplyPose 里那段）
  const sh = BONE.torso * 0.86;
  const sx = Math.sin(target.torso) * sh, sy = Math.cos(target.torso) * sh;
  const rootY = BONE.hipY + BONE.sole * SoleLift(target) + target.hipY;
  const elbowY = (k) => -BONE.upperArm * Math.cos(k.arm);
  const solve = (px, py) => {
    const tx = px - (target.hipX + sx), ty = py - (rootY + sy);
    const a1 = ArmIK(tx, ty, 1), a2 = ArmIK(tx, ty, -1);
    // **先挑解剖上对的那一组**（fore ≤ 0 ＝肘往前屈）：两组解的手落在同一点，
    // 差别只是肘往哪边翻，所以挑对的那组不会动手的位置。老版只按"肘朝下"挑，
    // 一半的机位下挑出来的是反关节的那一组
    const ok1 = a1.fore <= 0, ok2 = a2.fore <= 0;
    if (ok1 !== ok2) return ok1 ? a1 : a2;
    return elbowY(a1) <= elbowY(a2) ? a1 : a2;
  };
  const f = solve(aim.x, aim.y);
  target.armF = f.arm; target.foreF = f.fore;
  if (both) {
    const b = solve(aim.x - 0.09, aim.y + 0.05);
    target.armB = b.arm; target.foreB = b.fore;
  }
}

export function PoseRig(rig, s, dt) {
  const j = rig.joints;
  const p = s.phase || 0;
  // 姿态之间的过渡：**真正的指数平滑**。老版是 dt*12 的线性近似——掉帧那几帧
  // 一步跨过去（>1 被夹住＝硬切），高帧率下又比设计的慢。1−e^(−λt) 与帧率无关
  const blend = 1 - Math.exp(-14 * (dt || 0.016));
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
    // 跪在地上。老版是"大腿放平＋小腿竖直向下"——那是把膝盖抬到胯高的深蹲，
    // 脚被顶进地面 0.2m（三轮视觉审查各撞上一次：脚陷地/膝悬空/读成坐凳）。
    // 真跪的几何：大腿斜向前下（膝头着地），小腿折回去平铺在身后，
    // 胯坐在脚跟上方一拳——膝 ≈0.02、脚背贴地，谁站旁边都比得出对
    target.hipY = -0.36; target.hipX = 0.02;
    target.torso = 26 * DEG; target.head = -12 * DEG;
    target.thighB = -38 * DEG; target.shinB = 128 * DEG; target.footB = 12 * DEG;
    target.thighF = -44 * DEG; target.shinF = 136 * DEG; target.footF = 14 * DEG;
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
    // 2026-08-10 又修一次：**上臂角 + 前臂角相加超过 90° 就转到"往上"去了**
    // （0° 指向下，两节相加 −154° 的意思是前臂朝斜上方竖起来）。上一版正是这个
    // 数，实拍下读出来是娘举着一只手，手心离孩子半米——"抱住"从来没抱上。
    // 现在按落点反算：娘的肩 ≈1.15m，孩子的背在她身前 0.35m、低 0.2m，
    // 两节合起来 0.49m，所以**世界角必须落在 −55° 上下**（肘弯一点，
    // 上臂 −80 + 前臂 +26 = −54）。
    // 2026-08-11 再收一档：搂的是个六岁孩子（头顶才到他大腿），直着腰搂，
    // 手悬在半空、孩子抱着他的腿——两个人各演各的。整个人**蹲下去围住她**：
    // 胯沉、腰弯，手正好落在她头肩那一带，"捂住"才读得出来
    // 2026-08-13 第三次修：**这个姿势的脚一直埋在土里**（实测 footF −0.083 /
    // footB −0.049，而站姿该是 +0.078）。它是前半章占屏最久的姿势（抱妹妹→
    // 划正字→数正字→答「快了」→车铃 13 秒五拍连着），十几厘米的陷地一直在。
    // 腿长必须闭合：0.31·cos(大腿) + 0.31·cos(大腿+小腿) = 0.62 + hipY。
    // 顺手把胳膊也改成"肘吊下来、前臂横过去兜住"（老版 armF −84 是把肘平端
    // 到身前，手于是伸到孩子身后的空气里，见 pullClose 那条注释）
    target.hipY = -0.185; target.hipX = 0.05;
    target.torso = 24 * DEG; target.head = -34 * DEG;
    target.armF = -20 * DEG; target.foreF = -70 * DEG;   // 前臂横过来兜背（世界角 −90°）
    target.armB = -26 * DEG; target.foreB = -76 * DEG;   // 另一只手护后脑（世界角 −102°）
    // foot 取负是为了让 大腿+小腿+脚 ≈ 0，鞋底才平铺朝前（脚贴图 0° 指向前）
    target.thighB = -46 * DEG; target.shinB = 91 * DEG; target.footB = -45 * DEG;
    target.thighF = -34 * DEG; target.shinF = 89 * DEG; target.footF = -55 * DEG;
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
    // 手同样别越过 90°（见 shelter 那条）：−118° 是"两只手举在脸前面"，
    // 不是"蜷在胸口"。肘要折死（foreF 正值＝小臂折回来），手才落到自己胸前
    target.hipY = -0.05; target.hipX = 0.10;
    target.torso = 26 * DEG; target.head = -40 * DEG;
    target.armB = -20 * DEG; target.foreB = -98 * DEG;
    target.armF = -24 * DEG; target.foreF = -104 * DEG;
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
  } else if (s.pose === "liftChild") {
    // 站着把孩子托起来（第三道线那一拍：抱着妹妹够门框上的刻痕，要托住她
    // 整整两拍）。老版这两拍柱子摆的是 `shelter`——那是**蹲下去围住她**的
    // 姿势（hipY −0.24），可她此刻被抬到 0.52m 高、正在够 0.98m 的门框：
    // 一个蹲着的人托着一个悬在半空的孩子，两个人各演各的。
    // 落点是**照她实际吊在哪儿反算的**：她站在他身前 0.43m、被抬起 0.52m，
    // 屁股（连着 lift）落在 0.88m 高。所以手必须停在身前 0.35m、离地 0.88m
    // ⇒ 相对肩点 (0.438, −0.119)、长 0.454 < 臂长 0.49 ⇒ 上臂 −53、前臂 −44
    // （两节相加 −97 ＝ 前臂朝前偏上，正是"兜着往上托"那个形）。
    // 首轮实拍就是栽在没反算上：手停在 0.62m，离她屁股还有 0.3m，
    // 一个举着空气、一个浮在半空。
    const br = Math.sin(s.breath || 0);
    target.hipY = -0.03 + br * 0.008; target.hipX = -0.02;
    target.torso = (-8 + br * 1.2) * DEG;      // 后仰配重：怀里那点分量全压在腰上
    target.head = (2 - br * 1.4) * DEG;
    target.armF = (-53 + br * 1.5) * DEG; target.foreF = -44 * DEG;   // 兜在她屁股底下
    target.armB = (-47 + br * 1.5) * DEG; target.foreB = -38 * DEG;   // 另一只手扶着她的背
    // 托着人站不成立正：一脚在前撑住
    target.thighB = -14 * DEG; target.shinB = 16 * DEG; target.footB = -6 * DEG;
    target.thighF = 12 * DEG; target.shinF = 8 * DEG; target.footF = -8 * DEG;
  } else if (s.pose === "pinDown") {
    // 按住躺着的伤员（c1_rescue 末段，长按 5 秒）。老版用的是 shelter——那是
    // 「蹲下去围住一个六岁孩子」，手落在离地 0.94m、身前 0.50m，而躺着的人
    // 肩膀离地才 0.25m：画面上是一个孩子蹲在旁边、两只手悬在空中大半米按着
    // 空气（历史上被退回过的「哪里按住了？」）。
    // 几何：跪姿 + **腰折到 46°** 把肩带到身前 —— 肩点落在世界 (身前 0.257,
    // 离地 0.456)，压肩的手要去 (0.35, 0.25)，相对量只有 0.226m，够得着。
    // 长按的行程喂进 poseK（越按越沉），所以它登记在 World 的 poseU 名单里。
    const k = Math.max(0, Math.min(1, s.poseK ?? 0));
    target.hipY = -0.36; target.hipX = 0.04;
    target.torso = (46 + 3 * k) * DEG; target.head = -16 * DEG;
    target.armF = (-60 - 6 * k) * DEG; target.foreF = (-36 + 4 * k) * DEG;   // 压住肩（世界角 ≈ −24）
    target.armB = 12 * DEG; target.foreB = -18 * DEG;                        // 另一只手托后颈（正值＝往身后够）
    target.thighB = -38 * DEG; target.shinB = 128 * DEG; target.footB = 12 * DEG;
    target.thighF = -44 * DEG; target.shinF = 136 * DEG; target.footF = 14 * DEG;
  } else if (s.pose === "ladleSteady") {
    // 托着瓢喂水（c1_rescue 第一段，长按 3.4 秒）。同上：跪姿 + 腰折 40°，
    // 手落在伤员的嘴那一带（离地 ≈0.22m、身前 ≈0.30m）。
    // 「越托越沉」由长按的行程驱动（poseK ← poseU）——老版这 3.4 秒是一帧死值。
    const k = Math.max(0, Math.min(1, s.poseK ?? 0));
    target.hipY = -0.36; target.hipX = 0.03;
    target.torso = (40 + 4 * k) * DEG; target.head = -18 * DEG;
    target.armF = -48 * DEG; target.foreF = (-31 - 4 * k) * DEG;
    target.armB = -30 * DEG; target.foreB = -22 * DEG;
    target.thighB = -38 * DEG; target.shinB = 128 * DEG; target.footB = 12 * DEG;
    target.thighF = -44 * DEG; target.shinF = 136 * DEG; target.footF = 14 * DEG;
  } else if (s.pose === "twistTie") {
    // 拧紧袋口、绕绳扎回去（c1_forage 第四道手）。玩家真的在拿鼠标绕圈，
    // 老版画面上却是"跪着、两条胳膊直直垂在身侧"——手在离地 17 厘米处，
    // 离袋口 38 厘米，整个"拧绕扎"没有一帧动画。
    // **后手攥住袋颈基本不动，只前手绕**（两只手同相位就成了拜佛）。
    const a = (s.poseK ?? 0) * Math.PI * 4;      // 两圈
    target.hipY = -0.34; target.hipX = 0.04;
    target.torso = 34 * DEG; target.head = -44 * DEG;
    target.armB = (-58 + Math.sin(a) * 3) * DEG; target.foreB = -24 * DEG;
    target.armF = (-62 + 14 * Math.sin(a)) * DEG; target.foreF = (-30 + 16 * Math.cos(a)) * DEG;
    target.thighB = -38 * DEG; target.shinB = 128 * DEG; target.footB = 12 * DEG;
    target.thighF = -44 * DEG; target.shinF = 136 * DEG; target.footF = 14 * DEG;
  } else if (s.pose === "bandageWrap") {
    // 布条穿过肩下、绕到背后、再拉回胸前（c1_rescue 两道包扎）。玩家在绕圈，
    // 老版这两步也是 `pose:"kneel"`＝一帧死值。跟 twistTie 同一路，
    // 但圆心低得多——绕的是躺着的人的肩（离地 0.25m 上下）。
    // **两只手反相**：一只手把布条送到肩下，另一只手在背后接住，一送一接
    // 才是"绕"；同相位就成了拍手。
    const a = (s.poseK ?? 0) * Math.PI * 4;
    target.hipY = -0.36; target.hipX = 0.05;
    target.torso = 44 * DEG; target.head = -20 * DEG;
    target.armF = (-52 + 16 * Math.sin(a)) * DEG; target.foreF = (-26 + 18 * Math.cos(a)) * DEG;
    target.armB = (-40 + 16 * Math.sin(a + Math.PI)) * DEG; target.foreB = (-20 + 18 * Math.cos(a + Math.PI)) * DEG;
    target.thighB = -38 * DEG; target.shinB = 128 * DEG; target.footB = 12 * DEG;
    target.thighF = -44 * DEG; target.shinF = 136 * DEG; target.footF = 14 * DEG;
  } else if (s.pose === "heldChild") {
    // 被抱在怀里的孩子（与 childArms 走姿成对）。老版给的是 leanIn——那是
    // **站姿**（hipY −0.05、大腿 −10°、小腿 12°，腿几乎是直的），于是被抱起来
    // 的妹妹笔直地垂着两条腿浮在他身前。真被抱着的孩子：腿折起来盘住他，
    // 两只手往上够、搂住他的脖子。
    //
    // 2026-08-17 按新的坐高重算（用户："抱起妹妹的动画太蠢了"）。上一版她坐在
    // 0.82m 上：**头顶比他还高 0.1m**（实拍量的：她 head 1.258 / 他 1.159），
    // 读出来是"举着一个人"不是"抱着一个孩子"。抱孩子是**坐在胯上**——
    // 她的胯落在 0.70m（他的胯 0.57、肩 0.93），头顶就正好在他下巴那一线。
    // 落点反算（她体型 0.61：肩高 0.97m，上臂 0.153/前臂 0.146）：
    // 手要够到他的脖根（她身前 0.16m、比她自己的肩高 0.185m）⇒ 弦长 0.245m、
    // 世界角 −139°，拆成上臂 −105°、前臂 −70°。
    const br = Math.sin(s.breath || 0);
    target.hipY = -0.04; target.hipX = 0.05;
    // 整个人往他那边贴（torso 正值＝朝她自己的正前方折，而她正对着他）
    target.torso = (16 + br * 1.4) * DEG; target.head = (-26 - br * 1.6) * DEG;
    // 两条胳膊往上够着搂脖子（错开 7° 免得侧视里叠成一条）
    target.armF = -105 * DEG; target.foreF = -70 * DEG;
    target.armB = -98 * DEG; target.foreB = -74 * DEG;
    // 腿盘住他：大腿收到身前偏上（膝头顶在他腰上），小腿垂下去贴着他
    target.thighF = -64 * DEG; target.shinF = 62 * DEG; target.footF = -6 * DEG;
    target.thighB = -52 * DEG; target.shinB = 56 * DEG; target.footB = -5 * DEG;
  } else if (s.pose === "scoopReach") {
    // 蹲下去够她（进度驱动，poseU 0→1；玩家按住 E ＋ ↑ 的那 0.9 秒）。
    // 老版这一步借的是 `bow`——**弯腰拾东西**：两条胳膊平端着直指身前，
    // 而且 bow 不吃进度，0.9 秒里一格不动。实拍读出来是"他冲着空气鞠了个躬，
    // 然后妹妹瞬移到他怀里"。
    // 这一支是**有行程的**：站着 → 屈膝下蹲、腰跟着折 → 两只手探到她腋下扣住。
    // 走满进度那一格 = scoopChild 的第一帧，松手接回站姿也是连着的。
    //
    // **落点是量出来的，别照感觉写**（第一版就栽了：胳膊的世界角给到 −82°，
    // 两条手臂平端着直指身前，正是 CLAUDE.md 点名的那个"闲着的人不会平端双手"）：
    // 半蹲 hipY −0.24 ⇒ 胯 0.376m，腰折 38° ⇒ 肩落在（身前 0.22m, 0.658m）；
    // 妹妹站在身前 0.50m，腋下 0.68m ⇒ 肩→手 0.28m、世界角 −94.5°，
    // 拆成上臂 −51°、前臂 −89°（肘吊在身前下方、前臂折上来从她腋下兜进去）。
    // 她**必须站在 0.50m 外**这一条同样要紧：贴到 0.34m 时肩到腋下只剩 9 厘米，
    // 比一条上臂还短，胳膊怎么摆都是一团折起来的东西。
    //
    // 进度到骨架这一层统一叫 poseK（World 的 PoseProgress 按姿势名从
    // vaultK/poseU/poseK 里挑一个塞进来）——直接读 s.poseU 是拿不到的
    const k = Math.max(0, Math.min(1, s.poseK ?? 0));
    const e = k * k * (3 - 2 * k);
    const L = (a, b) => (a + (b - a) * e) * DEG;
    target.hipY = -0.02 + (-0.24 - -0.02) * e;
    target.hipX = 0.02 + (0.07 - 0.02) * e;
    target.torso = L(10, 38); target.head = L(-12, -22);
    // 手一路往下探：肘先离开体侧，前臂再折上来从腋下兜进去
    target.armF = L(-22, -51); target.foreF = L(-24, -89);
    target.armB = L(-14, -44); target.foreB = L(-20, -95);
    // 蹲的闭合式：hipY = 0.31·cos(大腿) + 0.31·cos(大腿+小腿) − 0.62
    // （−76/+84 ⇒ −0.238）。**两条腿都要按这条闭合式配**，只是角度错开——
    // 前腿第一版给了 −52/+60，投影 0.498 比后腿的 0.382 长了 12cm，
    // 实拍量出来那只脚陷进地里 2.3cm（`--probe` 的 footF=−0.023）。
    // −60/+103 的投影也是 0.382：膝往前顶得少一点、小腿往后斜得多一点，
    // 两只脚都落在地面上，侧视里还错得开
    target.thighB = L(-8, -76); target.shinB = L(10, 84); target.footB = L(-4, -6);
    target.thighF = L(6, -60); target.shinF = L(6, 103); target.footF = L(-4, -8);
  } else if (s.pose === "heldUp") {
    // 被托在半空的孩子（与 liftChild 成对）。老版她用的是 `mark`——那是
    // **站在地上**伸手比划的姿势，两条腿笔直踩着空气，人就这么浮在门框前。
    // 被抱起来的孩子：腿是垂着且屈的（没处使劲）、一只手够着要画的地方、
    // 另一只手扒着哥哥的肩借力。
    const br = Math.sin(s.breath || 0);
    target.hipY = 0; target.hipX = 0.02;
    target.torso = (8 + br * 1.5) * DEG; target.head = -22 * DEG;
    target.armF = -150 * DEG; target.foreF = -14 * DEG;   // 够门框（同 mark 那只手）
    target.armB = -52 * DEG; target.foreB = -34 * DEG;     // 扒着他的肩
    // 两条腿垂着、膝盖松松地屈——错开一前一后，不然侧视里只剩一条
    target.thighB = -18 * DEG; target.shinB = 46 * DEG; target.footB = -14 * DEG;
    target.thighF = -34 * DEG; target.shinF = 58 * DEG; target.footF = -16 * DEG;
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
    // 弯腰拾东西：塌腰探手，另一只手向后压着找平衡。
    // **胯不许压到 −0.30**：脚整个陷进地里（挨巴掌那一镜里柱子成了"半截人"）。
    // 闭合式：踝落在鞋底高度 ⇒ hipY = 两节腿的竖直投影 − 0.62。
    // 这两条腿投影 0.31·cos46 + 0.31·cos(46−52) = 0.524 ⇒ hipY = −0.096。
    // 弯腰弯的是腰不是腿，胯本来就只该沉一点点
    target.hipY = -0.096; target.hipX = 0.10;
    target.torso = 58 * DEG; target.head = -30 * DEG;
    target.armF = -78 * DEG; target.foreF = -18 * DEG;
    target.armB = -22 * DEG; target.foreB = -10 * DEG;
    target.thighB = -46 * DEG; target.shinB = 52 * DEG; target.footB = -6 * DEG;
    target.thighF = -22 * DEG; target.shinF = 30 * DEG; target.footF = -10 * DEG;
  } else if (s.pose === "pourBasket") {
    // 倒土：**由倒的进度直接驱动**（poseK 0→1，World 的 PoseProgress 从 poseU 取）。
    // 真动作是"两只手都在筐上"——一只手托筐底、一只手扣筐沿，弓着腰把筐口
    // 送到身前下方，越往后越要往下扣，最后那点土是抖出来的。
    // 单手拎着按一下不算：这筐装满土有二三十斤（HOLD_WEIGHT 0.8），
    // 一只手拎不平，也倒不干净。
    // 腰只折到 42°：再深脑袋就埋进筐里，侧视下人和筐糊成一坨。
    const k = Math.max(0, Math.min(1, s.poseK ?? 0));
    const e = k * k * (3 - 2 * k);                    // 缓入缓出，起手与收势都不生硬
    const shake = k > 0.55 ? Math.sin(k * Math.PI * 9) * 2.6 * DEG : 0;  // 末了抖两下筐
    // 胯只敢往下坐这么点：压到 -0.18 时后脚就陷进地里 3.8cm（PlayerLimbTips 量的，
    // 规范要求 ±0.02）。倒土是往前送不是往下蹲，重心该往后不该往下
    target.hipY = -0.07 - 0.055 * e; target.hipX = 0.05 + 0.13 * e;
    target.torso = (13 + 29 * e) * DEG; target.head = (-6 - 16 * e) * DEG;
    // 两条胳膊一起往前下方送，行程差一档：前手扣沿走得远，后手托底跟在后面
    target.armF = (-38 - 48 * e) * DEG + shake; target.foreF = (-30 + 24 * e) * DEG;
    target.armB = (-24 - 38 * e) * DEG + shake; target.foreB = (-34 + 20 * e) * DEG;
    // 土往前泼，重心得往后坐一点，不然人跟着栽出去
    target.thighB = (-14 - 16 * e) * DEG; target.shinB = (12 + 14 * e) * DEG; target.footB = -8 * DEG;
    target.thighF = (10 + 12 * e) * DEG; target.shinF = (8 + 8 * e) * DEG; target.footF = -10 * DEG;
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
  } else if (s.pose === "pointLow") {
    // 指给人看（**地道专用**）：抬手指着要说的那处，另一只手垂着，眼睛跟着手走。
    // 自带猫腰的腰身与胯高——和 stoop 同一套（头顶对得上 POSTURE_HEAD.stoop
    // 1.45m），所以在净高一米五的洞里用它，脑袋不会捅穿洞顶。名字带 Low
    // 就是这个意思：站在地面上要"指"，另写一个直腰的，别拿它凑合。
    // 抬起来那只手的世界末端约在 0.68m 前、1.15m 高——正好够着洞顶那截松土。
    target.hipY = -0.14; target.hipX = 0.05;
    target.torso = 42 * DEG;
    target.head = -50 * DEG;              // 顺着自己的手往上看
    target.armF = -118 * DEG;             // 负角向前：抬到前上方 28°，从脑袋侧上方指出去
    target.foreF = -6 * DEG;              // 胳膊几乎伸直，指出去
    target.armB = -2 * DEG; target.foreB = -14 * DEG;   // 另一只顺着重力垂着
    target.thighB = -36 * DEG; target.shinB = 46 * DEG; target.footB = -12 * DEG;
    target.thighF = -24 * DEG; target.shinF = 34 * DEG; target.footF = -12 * DEG;
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
    // 摇辘轳：**手真的攥在那根摇把上**。前手由 `s.aimHand`（World 按
    // `winchView.gripX/gripY` 换算出来的骨架局部坐标）两骨反解，所以屏幕上
    // 摇把转到哪儿手就在哪儿——鼠标绕圈、键盘、脱手倒转三条路同一只手。
    //
    // 上一版是两条胳膊按一条**自转的定速相位**在半空画圈，跟画面里那根摇把
    // 毫无关系；更要命的是轴心定在 1.43m，比这孩子的头顶还高 30 厘米，他一辈子
    // 也够不着（2026-08-10 用户：「角色的动作也太蠢了」）。尺度已经在
    // `Core.WINCH_HUB_Y` 那儿按"够得着"重排过了，这里只管把手送上去。
    //
    // s.poseK = 摇把此刻的相位（0..1，直接来自绳的行程）；
    // s.poseStrain = 手上有多吃力（体力越低越沉）。
    const ph = (s.poseK ?? 0) * Math.PI * 2;
    const strain = Math.max(0, Math.min(1, s.poseStrain ?? 0));
    // 摇把此刻在圈上的位置：cx>0 = 转到远端（要够出去），sy>0 = 转到高处。
    // **身子跟着摇把前后送**（±0.06m）——这不是装饰：这一档身位正是"胳膊只有
    // 0.39m 却够得到 0.43m"那笔账里的最后一项（见 Core.WINCH_HUB_Y 的注释）。
    const cx = Math.cos(ph), sy = Math.sin(ph);
    // **站直了摇**。这一条是实拍逼出来的：摇把对这个半大孩子来说已经在下巴
    // 那么高（辘轳是照大人做的），腰再往前一折，脑袋就顶到摇把跟前去了——
    // 屏幕上是"一枚大铁销糊在脸上"，胳膊还横着从脸前穿过去。人真在下巴高度
    // 摇东西的时候本来就是直着腰、把手往前送，不是弓着背。
    // 顺带：蹲深了鞋会陷进地里（站姿脚该在 +0.078，用 world.PlayerLimbTips()
    // 对一遍再改）。
    target.hipY = -0.03 - 0.03 * strain - 0.02 * sy;
    target.hipX = -0.01 + 0.05 * cx + 0.02 * strain;
    target.torso = (2 + 4 * cx + 8 * strain) * DEG;
    // 眼睛看着摇把：头不许往下埋（−2 是"平着看手"，−30 那种是弯腰拾东西）
    target.head = (-2 - 6 * strain) * DEG;
    // 后手扶在井架柱子上稳住身子；累了整个人往那边压
    target.armB = (-26 - 16 * strain) * DEG; target.foreB = (-52 + 10 * strain) * DEG;
    // 脚一前一后扎稳，把手抡到高处那半圈后腿蹬直
    target.thighB = (-20 - 6 * sy) * DEG; target.shinB = (24 + 6 * sy) * DEG; target.footB = -8 * DEG;
    target.thighF = (14 + 4 * sy) * DEG; target.shinF = 10 * DEG; target.footF = -10 * DEG;
    const aim = s.aimHand;
    if (aim) {
      AimFrontHand(target, aim);
    } else {
      // 没人告诉我摇把在哪儿（过场里摆姿势）：退回一条按相位画圈的胳膊
      target.armF = (-96 + Math.sin(ph) * 26) * DEG;
      target.foreF = (-30 + Math.cos(ph) * 20) * DEG;
    }
    // 手要跟得住摇把：默认 12/秒的混合会让手落后二三十度，读出来是
    // "手在追那根把手"。同翻越，硬动作给足混合
    ApplyPose(rig, t, target, Math.min(1, (dt || 0.016) * 30));
    return;
  } else if (s.pose === "knotPull") {
    // 接绳勒紧：两手在胸前较劲——一只攥着井绳，一只把麻绳头往外拽。
    // poseK = 这一把拽了多深（0..1）：拽得越狠，身子越往后坐、腰越往回收。
    // （这一拍画面上铺着那张活卡，看不见他；卡收走的那一帧看得见。）
    const k = Math.max(0, Math.min(1, s.poseK ?? 0));
    target.hipY = -0.10 - 0.06 * k; target.hipX = 0.04 - 0.10 * k;
    target.torso = (16 - 10 * k) * DEG; target.head = (-22 - 6 * k) * DEG;
    target.armF = (-72 + 34 * k) * DEG; target.foreF = (-56 - 18 * k) * DEG;
    target.armB = (-58 - 6 * k) * DEG; target.foreB = (-64 + 8 * k) * DEG;
    target.thighB = (-18 - 12 * k) * DEG; target.shinB = (22 + 12 * k) * DEG; target.footB = -8 * DEG;
    target.thighF = (14 + 8 * k) * DEG; target.shinF = (10 + 6 * k) * DEG; target.footF = -10 * DEG;
  } else if (s.pose === "foldCloth") {
    // 揭草苫 / 叠衣裳：跪在窖底，上身俯下去，两只手在身前的草苫上做活。
    // poseK = 这一下走了多远（0..1）：起手时手探出去够那个角（胳膊伸开、
    // 世界角压到 −66°），把布拖过来的过程里肘折回来、手收到身前（−14°）。
    // 下半身钉死在跪姿上不许动——周期动作最容易在这儿露馅（脚一滑就穿帮）。
    // （这一拍画面上铺着那张活卡，看不见他；卡收走的那一帧看得见。）
    const k = Math.max(0, Math.min(1, s.poseK ?? 0));
    target.hipY = -0.36; target.hipX = 0.03 + 0.03 * k;
    // 腰折下去多少，脖子就抬回来多少：头的世界角 (torso+head) 稳在 −8°~−6°，
    // 脸朝前下方看着手底下的活，不是"干呕"
    target.torso = (52 + 6 * k) * DEG; target.head = (-60 - 5 * k) * DEG;
    target.thighB = -38 * DEG; target.shinB = 128 * DEG; target.footB = 12 * DEG;
    target.thighF = -44 * DEG; target.shinF = 136 * DEG; target.footF = 14 * DEG;
    // 两只手都在活儿上，但一前一后错开（同一角度侧视里只剩一条胳膊）。
    // 前臂写正值＝把肘折回来，别再往负数加（那是继续抬手）
    target.armF = (-52 + 22 * k) * DEG; target.foreF = (-14 + 30 * k) * DEG;
    target.armB = (-44 + 18 * k) * DEG; target.foreB = (-8 + 24 * k) * DEG;
  } else if (s.pose === "layDown") {
    // 把那件衣裳按进坑里：跪着，两只手捧着往下按、按到底再掖平。
    // poseK = 按下去的进度：0 = 还抱在胸前；1 = 两手压在坑底。
    // 这一步原来是裸的一按 E（拟物标准 7.5 条），现在人真的在干这件事。
    const k = Math.max(0, Math.min(1, s.poseK ?? 0));
    target.hipY = -0.36; target.hipX = 0.02 + 0.04 * k;
    target.torso = (28 + 26 * k) * DEG; target.head = (-34 - 28 * k) * DEG;
    target.thighB = -38 * DEG; target.shinB = 128 * DEG; target.footB = 12 * DEG;
    target.thighF = -44 * DEG; target.shinF = 136 * DEG; target.footF = 14 * DEG;
    // 起手抱在胸前（肘折死、世界角 −16°），按下去的过程里胳膊伸开往下压
    target.armF = (-74 + 46 * k) * DEG; target.foreF = (-58 - 76 * k) * DEG;
    target.armB = (-66 + 40 * k) * DEG; target.foreB = (-52 - 68 * k) * DEG;
  } else if (s.pose === "heaveMat") {
    // 掀苫草（找吃的第一道手）：**姿势由掀到哪个角直接驱动**（poseK 0→1＝
    // 苫子从平铺到过重心），不是播一段循环。起手蹲着弓腰、两手探到脚前的地面
    // 上抠住苫子边；掀起来的过程里腰一节节直起来、两手跟着抬到胸前、重心往
    // 后坐——掀一片湿透的焦草苫子，劲是这么使的。
    const k = Math.max(0, Math.min(1, s.poseK ?? 0));
    const e = k * k * (3 - 2 * k);
    target.hipY = -0.17 + 0.13 * e; target.hipX = 0.03 - 0.09 * e;
    // 腰从 40° 直到 14°；头跟着抬（世界角 = torso + head，全程压在 −6°~−12°，
    // 脸朝前上方——低头低过头就读成干呕，见 CLAUDE.md）
    target.torso = (40 - 26 * e) * DEG;
    target.head = (-46 + 20 * e) * DEG;
    // 两手一起抠住外沿往上抬：负角向前上方，抬到 −80° 就到胸口了
    target.armF = (-46 - 34 * e) * DEG; target.foreF = (-18 + 6 * e) * DEG;
    target.armB = (-38 - 30 * e) * DEG; target.foreB = (-24 + 10 * e) * DEG;
    // 前腿蹬住把身子撑起来，后腿收
    target.thighB = (-26 + 12 * e) * DEG; target.shinB = (34 - 16 * e) * DEG; target.footB = -10 * DEG;
    target.thighF = (22 - 10 * e) * DEG; target.shinF = (16 - 6 * e) * DEG; target.footF = -10 * DEG;
    // 两只手**真的抠在苫子外沿上**（World 按 forage.grip 换算成局部坐标）
    AimFrontHand(target, s.aimHand, true);
  } else if (s.pose === "dragPlank") {
    // 拖门板（第二道手）：**由拖出去的行程驱动**（poseK 0→1）。两手攥着板头
    // 在体侧偏低处，人往后坐着退——拖的劲在腰腿上，不在胳膊上，所以胯要真的
    // 往后移、前腿蹬直。
    const k = Math.max(0, Math.min(1, s.poseK ?? 0));
    target.hipY = -0.12 - 0.02 * k; target.hipX = 0.05 - 0.13 * k;
    target.torso = (28 - 14 * k) * DEG;
    target.head = (-42 + 16 * k) * DEG;
    // 探出去攥住 → 一点点收回体侧（角度往 0 收＝手落回胯边）
    target.armF = (-58 + 30 * k) * DEG; target.foreF = (-26 - 12 * k) * DEG;
    target.armB = (-46 + 26 * k) * DEG; target.foreB = (-22 - 10 * k) * DEG;
    target.thighB = (-30 + 8 * k) * DEG; target.shinB = (36 - 10 * k) * DEG; target.footB = -10 * DEG;
    target.thighF = (24 - 8 * k) * DEG; target.shinF = (14 + 6 * k) * DEG; target.footF = -10 * DEG;
    // 两只手**真的攥在板头上**：板子架在食槽上，拖出去时那一头一路落下来，
    // 手跟着它落——不反解的话，手在半空、板子在脚底下，两不相干
    AimFrontHand(target, s.aimHand, true);
  } else if (s.pose === "scoopAsh") {
    // 扒烧土（第三道手）：蹲着，两手交替往怀里扒。**由这一把扒了多远驱动**
    // （poseK 0→1）：前手从探到土堆上收回胯前，后手同时探出去——一把接一把
    // 才有"扒"的样子，两只手同相位的话就是"拜了一下"。
    const k = Math.max(0, Math.min(1, s.poseK ?? 0));
    target.hipY = -0.24 - 0.03 * k; target.hipX = 0.02 - 0.03 * k;
    target.torso = (34 - 8 * k) * DEG;
    target.head = (-44 + 10 * k) * DEG;
    target.armF = (-64 + 40 * k) * DEG; target.foreF = (-40 + 24 * k) * DEG;
    target.armB = (-24 - 40 * k) * DEG; target.foreB = (-38 + 20 * k) * DEG;
    // 深蹲：膝盖屈住、脚掌整个踩在地上
    target.thighB = (-40 + 8 * k) * DEG; target.shinB = (58 - 8 * k) * DEG; target.footB = -14 * DEG;
    target.thighF = (26 - 6 * k) * DEG; target.shinF = (34 + 6 * k) * DEG; target.footF = -14 * DEG;
    // 前手**真的插在土里**，扒到哪儿手就在哪儿；后手照姿势表交替（两只手同时
    // 反解到一个点就成了"捧"，扒是一把接一把）
    AimFrontHand(target, s.aimHand, false);
  } else if (s.pose === "unwrapJar") {
    // 解扎口（第四道手）：蹲在罐跟前，两手都在身前罐口那么高的地方。
    // 这一拍画面上铺着那张活卡，看不见他；卡收走的那一帧看得见（同接绳）。
    const k = Math.max(0, Math.min(1, s.poseK ?? 0));
    target.hipY = -0.26; target.hipX = 0.02;
    target.torso = (30 - 4 * k) * DEG;
    target.head = (-42 + 6 * k) * DEG;
    target.armF = (-72 + 18 * k) * DEG; target.foreF = (-46 + 12 * k) * DEG;
    target.armB = (-60 + 14 * k) * DEG; target.foreB = (-40 + 10 * k) * DEG;
    target.thighB = -38 * DEG; target.shinB = 56 * DEG; target.footB = -14 * DEG;
    target.thighF = 24 * DEG; target.shinF = 34 * DEG; target.footF = -14 * DEG;
  } else if (s.pose === "dunkRope") {
    // 墩桶：两只手探出去攥住井绳，整个人往下坐着一墩。**劲不在胳膊上，在体重上**
    // ——胯要真的沉下去、膝盖跟着屈，不然就成了"挥手"。
    // 姿势**由这一把拽了多远驱动**（poseK 0→1）：起手时两只手探出去攥住绳、
    // 举得高；往下拽的过程里胳膊落下来、胯跟着坐下去、膝盖屈住。
    // 负角=向前上方；两只手都在同一根绳上（够得着是前提：Core 会把人往前
    // 挪到离绳半米，正好一臂）。劲在体重上，不在胳膊上
    const k = Math.max(0, Math.min(1, s.poseK ?? 0.5));
    target.hipY = -0.06 - 0.16 * k; target.hipX = 0.02 + 0.04 * k;
    target.torso = (2 + 10 * k) * DEG; target.head = (4 - 8 * k) * DEG;
    target.armF = (-104 + 34 * k) * DEG; target.foreF = (-6 - 8 * k) * DEG;
    target.armB = (-88 + 32 * k) * DEG; target.foreB = (-10 - 10 * k) * DEG;
    target.thighB = (-12 - 20 * k) * DEG; target.shinB = (14 + 22 * k) * DEG; target.footB = -8 * DEG;
    target.thighF = (10 + 14 * k) * DEG; target.shinF = (6 + 12 * k) * DEG; target.footF = -10 * DEG;
  } else if (s.pose === "haulIn") {
    // 把桶拽到井沿：**由横拽的行程驱动**（poseK 0→1）。起手探出去够桶帮，
    // 拽的过程里胳膊往回收、上身往后仰着较劲、后腿蹬住台底
    const k = Math.max(0, Math.min(1, s.poseK ?? 0));
    target.hipY = -0.06 - 0.06 * k; target.hipX = 0.10 - 0.16 * k;
    target.torso = (10 - 20 * k) * DEG; target.head = (-8 + 4 * k) * DEG;
    target.armF = (-94 + 52 * k) * DEG; target.foreF = (-8 - 40 * k) * DEG;
    target.armB = (-70 + 46 * k) * DEG; target.foreB = (-14 - 34 * k) * DEG;
    target.thighB = (-14 - 16 * k) * DEG; target.shinB = (14 + 14 * k) * DEG; target.footB = -8 * DEG;
    target.thighF = (14 + 8 * k) * DEG; target.shinF = (8 + 6 * k) * DEG; target.footF = -10 * DEG;
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
  } else if (s.pose === "braceDoor") {
    // 扶门：整个人顶在门板上，两手推在胸口高的板面上。poseK=吃劲程度——
    // 门压过来越多，腰塌得越深、后腿绷得越直（重量感一半长在这具身子上）
    const k = Math.max(0, Math.min(1, s.poseK ?? 0.4));
    target.hipY = -0.06 - 0.06 * k; target.hipX = 0.10 + 0.10 * k;
    target.torso = (20 + 14 * k) * DEG; target.head = -16 * DEG;
    target.armF = (-72 - 10 * k) * DEG; target.foreF = (-26 + 14 * k) * DEG;
    target.armB = (-60 - 10 * k) * DEG; target.foreB = (-30 + 12 * k) * DEG;
    target.thighB = (-34 - 8 * k) * DEG; target.shinB = (30 + 6 * k) * DEG; target.footB = -8 * DEG;
    target.thighF = (16 + 6 * k) * DEG; target.shinF = 14 * DEG; target.footF = -10 * DEG;
  } else if (s.pose === "braceUp") {
    // 在爬行段里支顶木：那截新掏的通道净高只有 0.72m（POSTURE_HEAD.crawl），
    // 站不起来也蹲不住——只能**跪着往上顶**。poseK = 顶上去的进度：
    // 0 = 跪坐着，板横抱在胸前；1 = 双手把板举到洞顶、胳膊撑直、腰跟着顶上去。
    // 手的落点是照骨长算的：跪姿胯 0.308、肩 ≈0.73（躯干折 22°），
    // 胳膊两节 0.49——armF 收到 -128° 前后时手心正好停在 0.90 上下，
    // 乘体型 0.80 就是世界里的 0.72m，也就是洞顶那条线。
    const k = Math.max(0, Math.min(1, s.poseK ?? 0));
    const push = k > 0.12 ? Math.sin(k * Math.PI * 4) * 0.9 * DEG : 0;   // 一下一下往上顶的余劲
    target.hipY = -0.312; target.hipX = 0.03 - 0.02 * k;
    target.torso = (44 - 22 * k) * DEG;       // 从伏着到把腰顶起来
    target.head = (-30 - 18 * k) * DEG;       // 眼睛跟着板往上看
    // 行程全长在**小臂**上（前臂从折在胸前一路推直）——这就是"往上顶"的读法。
    // k=1 时手心停在 0.885（体型 0.80 折世界 0.71m），正好抵住洞顶那条线
    target.armF = (-95 - 5 * k) * DEG + push; target.foreF = (-95 - 115 * k) * DEG;
    target.armB = (-88 - 6 * k) * DEG + push; target.foreB = (-92 - 114 * k) * DEG;
    // 双膝跪在地上、小腿折向身后（爬行段里没有别的姿势可选）
    target.thighB = -8 * DEG; target.shinB = 96 * DEG; target.footB = 16 * DEG;
    target.thighF = -6 * DEG; target.shinF = 92 * DEG; target.footF = 14 * DEG;
  } else if (s.pose === "sleep") {
    // 睡着：**这一支只管"蜷成一团"，躺不躺是渲染层的事**——World 见到 sleep
    // 就把整具骨架转 90°（LIE_POSES）。
    //
    // 2026-08-12 用户退回（「妹妹这样的动作睡觉的？」）：老版是把站姿的关节
    // 一根一根硬掰到接近水平（躯干 88°、大腿 −88°…），实拍出来是一堆散落的
    // 方块——袄子的下摆横着支出去、脑袋斜插在一边、小腿戳出画。这条路走了
    // 三轮都没走通，病根不在角度：**侧视骨架的每一块都是照"竖着的人"画的**，
    // 把关节掰平只会让贴图各躺各的。整具转过去就没这个问题——转的是同一个人，
    // 每一块的相对关系一点没变。
    //
    // 所以这儿写的是"站着的时候蜷成这样"：腰含着、下巴收向胸口、膝盖提到
    // 肚子跟前、两只手掖在下巴底下。转过 90° 之后，"朝前"就成了"朝上"，
    // 于是膝盖朝上拱、手掖在脸前——正是孩子睡觉那个团。
    // 角度都是**在躺下之后那个画面里**反算的（转 90° 会把"朝前"变成"朝上"，
    // 照站姿的手感写，胳膊会直挺挺地举向天——实拍第一版正是这样）：
    //   · 胳膊：躺下后要顺着身子朝头那边收、手停在下巴跟前
    //     ⇒ 站姿里上臂几乎垂着（−14°）、前臂几乎折回贴着上臂（−150°）；
    //   · 腿：躺下后膝盖朝上拱 45°、小腿再落回铺盖
    //     ⇒ 站姿里大腿 −45°、小腿 +111°。
    const br = Math.sin((s.breath || 0) * 0.9) * 1.2;   // 呼吸：肩背轻轻起伏
    target.hipY = -0.02; target.hipX = 0.0;
    target.torso = (14 + br) * DEG;
    target.head = 14 * DEG;                 // 世界角 +28°＝下巴微收（睡着的人不仰脖）
    target.armF = -14 * DEG; target.foreF = -150 * DEG;
    target.armB = -6 * DEG; target.foreB = -138 * DEG;
    target.thighF = -45 * DEG; target.shinF = 111 * DEG; target.footF = -10 * DEG;
    target.thighB = -34 * DEG; target.shinB = 100 * DEG; target.footB = -8 * DEG;
  } else if (s.pose === "clothMouth") {
    // 跪坐着把布巾咬在嘴上压咳：kneel 的下盘（真跪版：膝着地小腿后铺），
    // 近侧手把布**举到嘴边**——布巾走 carry（HandPoint 挂点），手到哪儿布
    // 就到哪儿，所以这只手的落点必须真在嘴上：胯 0.26、肩 ≈0.57、嘴 ≈0.63，
    // 上臂 −50°、前臂 −130°（合世界角 −180°＝小臂竖直朝上），
    // 手心停在 0.63 上下、身前 0.15——正是嘴的位置
    target.hipY = -0.36; target.hipX = 0.02;
    target.torso = 26 * DEG; target.head = -14 * DEG;
    target.thighB = -38 * DEG; target.shinB = 128 * DEG; target.footB = 12 * DEG;
    target.thighF = -44 * DEG; target.shinF = 136 * DEG; target.footF = 14 * DEG;
    target.armF = -50 * DEG; target.foreF = -130 * DEG;
    target.armB = -22 * DEG; target.foreB = -16 * DEG;
  } else if (s.pose === "sitStool") {
    // 坐在矮凳上歇着：屁股落到凳面（约0.28m），小臂搭在膝上——
    // 爹开场养那只没合口的手，坐的就是这一姿势
    target.hipY = -0.34; target.hipX = 0.02;
    target.torso = 14 * DEG; target.head = -6 * DEG;
    target.armF = -44 * DEG; target.foreF = -58 * DEG;
    target.armB = -38 * DEG; target.foreB = -52 * DEG;
    target.thighB = -84 * DEG; target.shinB = 78 * DEG; target.footB = 6 * DEG;
    target.thighF = -78 * DEG; target.shinF = 72 * DEG; target.footF = 4 * DEG;
  } else if (s.pose === "sitSide") {
    // 挎斗里的兵：整个人蜷进斗里，膝盖顶到胸口，枪抱在怀里（枪走 carry）
    target.hipY = -0.30; target.hipX = 0.04;
    target.torso = 6 * DEG; target.head = -4 * DEG;
    target.armF = -46 * DEG; target.foreF = -52 * DEG;
    target.armB = -40 * DEG; target.foreB = -48 * DEG;
    target.thighB = -96 * DEG; target.shinB = 88 * DEG; target.footB = 10 * DEG;
    target.thighF = -90 * DEG; target.shinF = 82 * DEG; target.footF = 8 * DEG;
  } else if (s.climbing && s.childArms) {
    // **抱着孩子下梯子**（序·那天：抱着妹妹下窖）。双手交替上够那一套在这儿
    // 不成立——一条胳膊正兜着人。所以：远侧那只手扒横档（一格一格换手，
    // 幅度比空手小得多），近侧那只**保持兜的角度不动**，孩子就一直在怀里；
    // 腿照常蹬阶，身子比空手更贴梯子（怀里有分量，不敢往后仰）。
    // 缺了这一支，抱着下窖那一段会退回"两只手都在爬"，怀里的人成了挂件。
    target.hipY = 0; target.hipX = -0.02;
    target.torso = -2 * DEG;
    target.head = 4 * DEG;
    target.armB = Lerp(-142, -118, (swing + 1) / 2) * DEG;   // 扒横档的那只
    target.foreB = -30 * DEG;
    // 兜着她的那只：**一格不许动**，角度照抄 childArms 的静止帧
    // （改了那儿就得改这儿——她在怀里的位置由这只手定）
    target.armF = 4 * DEG;
    target.foreF = -69 * DEG;
    target.thighB = Lerp(-10, -40, (swing2 + 1) / 2) * DEG;
    target.shinB = 40 * DEG;
    target.thighF = Lerp(-40, -10, (swing2 + 1) / 2) * DEG;
    target.shinF = 40 * DEG;
    target.footB = 10 * DEG; target.footF = 10 * DEG;
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
    target.foreB = (-6 + (c ? Math.max(0, -swing) * 14 : 0)) * DEG;
    target.armF = (-14 + (c ? swing2 * 22 : 0)) * DEG;
    target.foreF = (-6 + (c ? Math.max(0, -swing2) * 14 : 0)) * DEG;
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
    // 头压在洞顶底下。走得比站着慢，但还是在走。
    //
    // **胳膊的角度是世界角**：armFront/armBack 挂在 root 上（见顶上那张骨架图），
    // 不是躯干的子节点——0° 就是顺着重力吊下来，正角向后、负角向前。
    // 老版写的是 armF -44 / foreF -36：加起来向前 80°，两条胳膊一起平端在胸前
    // 直指正前方；两条腿又给了一模一样的角度，叠成一条。于是地道里站着的人
    // 全成了排队的僵尸（2026-08-10 用户截图退回：三个乡亲在洞里平举双手）。
    // 人弓着腰站住的时候，胳膊是**吊着**的（肩点已经被躯干带到胯前 0.32m，
    // 手自然垂在小腿前头），两只手绝不同角度，两条腿也一前一后错开——
    // 侧视里"两个人还是两条腿"全靠这点错位。
    const c = s.moving ? 1 : 0;
    const br = Math.sin(s.breath || 0);
    target.hipY = -0.14 + (c ? Math.abs(Math.sin(p)) * 0.024 : 0);
    target.hipX = 0.05;
    // 腰折 42°、脖子抬到 -54（世界角约 −12°，脸是朝前上方的）。
    // 老版腰 46 配脖子 −34，世界角 +12——脸冲着自己的脚。在洞里走路的人
    // 必须看得见前面，低头那副样子读出来是"弯腰干呕"，不是"猫腰走"
    target.torso = (42 + (c ? 0 : br * 1.6)) * DEG;
    target.head = (-54 - (c ? 0 : br * 1.8)) * DEG;
    // 站住时两只手都**折着肘搭在大腿前头**，不是直直吊下来。
    // 直吊的胳膊和小腿几乎平行，侧视里一个人就成了四根竖棍，读出来像只虫子；
    // 肘一折，胳膊有了拐角，和腿分得开——这是"歇着的人"和"标本"的分界。
    // 两只手还得差着十来度，不然左右手叠成一条粗胳膊。
    target.armB = (c ? -6 + swing * 24 : -6) * DEG;
    target.foreB = (c ? -16 + Math.max(0, swing) * 18 : 34) * DEG;
    target.armF = (c ? -6 + swing2 * 24 : -16) * DEG;
    target.foreF = (c ? -16 + Math.max(0, swing2) * 18 : 44) * DEG;
    // 腿：猫腰折的是腰，膝盖只是略屈。站住时一前一后错开，
    // 两条小腿的世界角仍然相同（同一个地面），错的是膝盖的前后
    target.thighB = (c ? -30 + swing2 * 26 : -36) * DEG;
    target.shinB = (c ? 40 - swing2 * 18 : 46) * DEG;
    target.footB = -12 * DEG;
    target.thighF = (c ? -30 + swing * 26 : -24) * DEG;
    target.shinF = (c ? 40 - swing * 18 : 34) * DEG;
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
  } else if (s.childArms) {
    // 抱着一个孩子走（序·那天：抱起妹妹下窖）。**这是个走姿，不是定格姿势**
    // ——老版只在按下那一帧闪 0.8 秒 shelter，之后柱子甩着两条空胳膊照常走，
    // 妹妹浮在他胸口跟着飘（"抱"字一点证据都没有）。
    //
    // 三笔就够：**两臂都抬到胸前兜住她**（前臂折回来托在她屁股底下，
    // 世界角落在 −60° 上下＝手停在自己身前 0.3m、离地 0.75m，正是她坐着的
    // 那个高度）、**身子往后仰配重**（怀里那点分量全压在腰上）、
    // **步幅收掉一档**（抱着人迈不开步，也不敢颠）。
    const c = s.moving ? 1 : 0;
    const br = Math.sin(s.breath || 0);
    // 抱着人站着**不是一尊像**（2026-08-17 用户："太蠢了"）。老版站住时这一支
    // 除了 ±1.2° 的呼吸全是死值，实拍隔半秒两张图像素相同。抱孩子的人一直在
    // 微微地倒重心、隔一会儿往上颠一下把她换个位置——两条错开周期的慢摆
    // （呼吸 1×、倒重心 0.37×、颠一下 0.19× 且只在波峰附近发力）就够了。
    const sway = Math.sin((s.breath || 0) * 0.37);
    const shift = Math.sin((s.breath || 0) * 0.19);
    const jog = Math.max(0, shift - 0.72) * 3.6;       // 隔十几秒往上托一下
    // 起伏比空手小得多：颠孩子的人会自己把步子放软
    target.hipY = c ? Math.abs(Math.sin(p)) * 0.018 : br * 0.010 + jog * 0.030;
    target.hipX = -0.03 + (c ? 0 : sway * 0.012);
    target.torso = (c ? -7 : -6 + br * 1.0 - sway * 1.6 - jog * 2.4) * DEG;   // 后仰配重
    target.head = (c ? 4 : 3 - br * 1.2 + sway * 1.1) * DEG;
    // 腿：步幅 30→20、小腿折度 52→36。站住时两条腿一前一后错开倒重心，
    // 别让抱着人的姿势又退回"两根平行的棍子"
    target.thighB = (c ? swing2 * 20 : -3 - sway * 2.6) * DEG;
    target.shinB = (c ? Math.max(0, -swing2) * 36 : 4 + sway * 2.0) * DEG;
    target.footB = (c ? -swing2 * 8 - 4 : -3) * DEG;
    target.thighF = (c ? swing * 20 : 3 + sway * 2.6) * DEG;
    target.shinF = (c ? Math.max(0, -swing) * 36 : 2 - sway * 1.4) * DEG;
    target.footF = (c ? -swing * 8 - 4 : -3) * DEG;
    // 两条胳膊都不摆——它们正兜着人。**肘要吊在体侧，不许平端出去**：
    // 老版给的是上臂 −96/−104（＝把**肘**抬到水平以上、整条胳膊直挺挺伸向身前），
    // 实测手落在身前 0.61m、离地 0.52m，而她的身子中心只在身前 0.26m——
    // 他在她身外 0.35m 的空气里认真兜着，她浮在旁边（2026-08-15 用户报「完全不对」）。
    //
    // 2026-08-17 又降了一档：上一版把她坐到 0.82m（＝他自己的胸口），实拍她的
    // 头顶比他还高，两条胳膊在她胯那一线横着抱——那是**举**不是**抱**。
    // 抱孩子是坐在胯上。按新落点反算（柱子体型 0.80：肩高 0.93m、胯 0.57m，
    // 上臂 0.20/前臂 0.192m）：
    // · 近侧那只托屁股 —— 手停在身前 0.16m、离地 0.645m（＝她坐的那一面）
    //   ⇒ 肩→手 0.323m、上臂 +4°（几乎垂直吊着）、前臂 −69°（折上来横兜）；
    // · 远侧那只搂后背 —— 手停在身前 0.17m、离地 0.90m ⇒ 上臂 −20°、前臂 −128°
    //   （肘吊在腰侧、前臂折上去绕过她的背）。
    // 两条错开二十几度，侧视里才不叠成一条。
    target.armF = (4 + (c ? Math.sin(p) * 2 : br * 1.2 + sway * 1.8) - jog * 7) * DEG;
    target.foreF = (-69 - (c ? Math.sin(p) * 2 : 0) - jog * 5) * DEG;
    target.armB = (-20 + (c ? Math.sin(p) * 2 : br * 1.2 - sway * 1.5) - jog * 6) * DEG;
    target.foreB = (-128 - (c ? Math.sin(p) * 2 : 0) - jog * 5) * DEG;
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
    // 走/跑：大腿摆、小腿在后摆时折起、手臂反向摆、躯干微前倾、上下起伏。
    // **跑不是把走路放快**（2026-08-13）：老版这一支的幅度写死，于是娘 3.4m/s
    // 冲进屋、妹妹追出去、谁被追着跑，画面上都是同一副散步的架势，只是位移快。
    // g = 0 走 / 1 跑，由 World 按实测速度给（1.5→3.2m/s）。跑起来四件事一起变：
    // 步幅张开、小腿在后摆时收得更狠（后跟踢屁股）、躯干压到前面去、
    // 手臂抡起来并把肘折死（跑的人不会甩着两条直胳膊）
    const g = Math.max(0, Math.min(1, s.gait || 0));
    target.hipY = Math.abs(Math.sin(p)) * (0.035 + 0.030 * g);
    target.hipX = 0.03 * g;
    target.torso = (5 + 13 * g) * DEG;
    target.head = (-2 - 9 * g) * DEG;      // 躯干压前，脖子抬回来（脸不许冲着自己的脚）
    const legAmp = 30 + 18 * g, shinAmp = 52 + 34 * g;
    target.thighB = swing2 * legAmp * DEG;
    target.shinB = Math.max(0, -swing2) * shinAmp * DEG;
    target.footB = (-swing2 * 12 - 4) * DEG;
    target.thighF = swing * legAmp * DEG;
    target.shinF = Math.max(0, -swing) * shinAmp * DEG;
    target.footF = (-swing * 12 - 4) * DEG;
    const armAmp = 26 + 24 * g;
    target.armB = swing * armAmp * DEG;
    target.foreB = (-16 - 30 * g + Math.max(0, swing) * (20 + 14 * g)) * DEG;
    target.armF = swing2 * armAmp * DEG;
    target.foreF = (-16 - 30 * g + Math.max(0, swing2) * (20 + 14 * g)) * DEG;
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

  // ── 生命体征：戏剧姿势也得喘气（2026-08-13）──────────────────────────
  // 只有"站着"那一支有呼吸，**所有一次性戏剧姿势都是死值**——按住搂紧 15 秒、
  // 坐着吃饭一整拍、靠墙坐着两拍、跪在灶前……画面上是一张完全不变的贴图。
  // 用户说的"生硬"，最长的几处就在这儿。
  //
  // 但**不许一刀切**，两条红线：
  // ① 手上有活、靠 AimFrontHand 两骨反解落在挂点上的那几支（crank/heaveMat/
  //    dragPlank/scoopAsh/unwrapJar/planePush…）不许再叠角度——叠了手就从
  //    把手上被推开，RenderHealthTest 的「手真落在挂点上」当场红。
  // ② 跪/按/咬布这几支的膝与手是贴着地的，hipY 一起伏就有一半时间陷进地里。
  // 所以走白名单，且 hipY 只给站/坐/搂那几支。
  const CALM_BREATH = new Set(["kneel", "bow", "leanIn", "shelter", "mark", "sitStool",
    "sitSide", "clothMouth", "press", "pressed", "puzzled", "sleep", "liftChild", "heldUp"]);
  const NO_HIP = new Set(["kneel", "press", "pressed", "clothMouth", "sleep"]);
  if (!tracked && !s.moving && s.pose && CALM_BREATH.has(s.pose)) {
    const br = Math.sin(s.breath || 0);
    const b2 = Math.sin((s.breath || 0) * 0.83);      // 手上那一路错开相位，别跟着胸口一起点头
    target.torso += br * 1.6 * DEG;
    target.head -= br * 1.9 * DEG;
    target.armF += b2 * 1.4 * DEG;
    target.armB -= b2 * 1.2 * DEG;
    if (!NO_HIP.has(s.pose)) target.hipY += br * 0.020;
  }

  ApplyPose(rig, t, target, blend);
}

// 站姿抬升：**谁在承重，谁就该踩在地平线上**。
//
// 这具骨架的 foot 关节既是踝也是着地点（大腿+小腿正好等于 hipY，踝落在 y=0），
// 而鞋是从踝往下画的。站着的时候承重的是鞋底，于是整个人陷进地里一个鞋帮——
// 车轮压在路沿上、人的鞋却在路面底下（2026-08-09 用户截图）。站着就得整体抬
// 起 BONE.sole，鞋底才踩在地平线上。
//
// **但跪、爬、趴这些姿势承重的是膝盖，不是鞋底**：爬行那一拍的脚是转过 180°
// 反铺在地上的（鞋帮朝上，见 crawl 那段的注释），一抬膝盖就离地——上游刚把
// 爬行的膝盖和手调到贴地，别再顶飞。
//
// 判据不能用胯高：猫腰走（胯 0.32）和爬行（胯 0.308~0.338）几乎一样低。
// **膝盖高度才分得开**——猫腰的膝盖屈在半空（0.15 上下），爬行的膝盖跪在地上。
// 膝盖相对胯的高度只由大腿的角度决定，跟胯自己在哪无关，所以能在抬升之前算。
const KNEE_ON_GROUND = 0.05;   // 膝盖低到这儿就是跪着，体重不在脚上
const KNEE_CLEAR = 0.13;       // 高过这儿体重全在脚上
/**
 * 两骨反解：把前臂末端（手）送到 (tx, ty)——**相对肩点**的骨架局部坐标（米）。
 *
 * 四肢角度的语义见文件头：0° = 指向下，正角 = 向后。于是"肩指向手"的方向角
 * φ = atan2(−tx, −ty)，大臂再绕着它偏开一个由余弦定理算出来的夹角。
 * 够不着就把距离夹到臂长（胳膊伸直去够），永远给得出一组角度——手到不了
 * 是**摆位的错**，不该让反解在这儿抛。
 */
export function ArmIK(tx, ty, elbow = 1) {
  const La = BONE.upperArm, Lf = BONE.foreArm;
  const raw = Math.hypot(tx, ty);
  const d = Math.max(Math.abs(La - Lf) + 1e-3, Math.min(La + Lf - 1e-3, raw));
  const phi = Math.atan2(-tx, -ty);
  const cosA = (d * d + La * La - Lf * Lf) / (2 * La * d);
  const a = Math.acos(Math.max(-1, Math.min(1, cosA)));
  const arm = phi + elbow * a;
  const ex = -La * Math.sin(arm), ey = -La * Math.cos(arm);
  // 手按夹过的 d 摆（够不着时就是伸直的那一点），不是按原始目标
  const hx = -d * Math.sin(phi), hy = -d * Math.cos(phi);
  const fore = Math.atan2(-(hx - ex), -(hy - ey));
  return { arm, fore: fore - arm };
}

function SoleLift(t) {
  // 膝点 = 绕胯转过大腿角之后的 (0,−thigh)；两条腿取更低的那个
  const drop = BONE.thigh * Math.max(Math.cos(t.thighB), Math.cos(t.thighF));
  const knee = BONE.hipY + t.hipY - drop;
  return Math.max(0, Math.min(1, (knee - KNEE_ON_GROUND) / (KNEE_CLEAR - KNEE_ON_GROUND)));
}

// 混合进当前姿态并写到关节上。轨道采样和状态姿势都从这儿出去
function ApplyPose(rig, t, target, blend) {
  const j = rig.joints;
  for (const k of Object.keys(target)) t[k] = Lerp(t[k], target[k], blend);

  // —— 关节的解剖闸（2026-08-17 用户："人物还是有很多反关节的设置"）。
  // **膝只能往后屈（shin ≥ 0）、肘只能往前屈（fore ≤ 0）**：这两个角都是相对
  // 上一节的局部角，0 是伸直，正值把小腿往身后送、把小臂往身后翻。
  // 病根是一条**写错的注释**——"foreF 正值＝小臂折回来"——被照抄了 51 处，
  // 于是全场的胳膊在肘上反着弯。那 51 处已经把号翻过来了，这道闸是防再犯：
  // 谁写反了，画面上顶多是伸直，绝不会再翻过去。
  t.shinB = Math.max(0, Math.min(150 * DEG, t.shinB));
  t.shinF = Math.max(0, Math.min(150 * DEG, t.shinF));
  t.foreB = Math.max(-155 * DEG, Math.min(0, t.foreB));
  t.foreF = Math.max(-155 * DEG, Math.min(0, t.foreF));

  j.root.position.set(t.hipX, BONE.hipY + BONE.sole * SoleLift(t) + t.hipY, 0);
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
