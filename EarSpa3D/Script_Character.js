// 《采耳物语 · EarSpa3D》可爱角色模块
//
// 目标：「好舒服」那一半的情绪。偏低多边形治愈系，不是写实人脸 —— 大眼睛、腮红、
// 软发团、小鼻子小嘴、宽松衣服、头枕在软枕上。
//
// 一条硬约束：耳朵位置必须能对齐 canal 空间原点，所以 earAnchor 必须**固定不动**。
// 耳廓的抽动、呼吸的起伏、表情的变化都只作用在 earAnchor 的兄弟节点上，
// 绝不动 anchor 本身 —— 否则 lead 那边的工具判定就会跟视觉错位。

import * as THREE from "three";
import { PALETTE } from "./Data_Palette.mjs";

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth01 = (t) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };

/** Mulberry32：与另两个模块同一套，保证可复现。 */
export function MakeRng(seed = 20260910) {
  let a = (seed >>> 0) || 1;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── 人体比例（mm）。头宽约 180 是契约给的量级，这里按「可爱化」略放大头身比。 ──
const HEAD = { rx: 82, ry: 100, rz: 96, cz: -92 }; // 头：宽/高/前后，中心在耳道正内侧
// 头中心离耳道口 92mm，头在 z 方向的半轴 96mm —— 于是头的侧面正好切在耳道口附近，
// 耳廓稍微再往外伸一点，符合真耳「耳廓贴着头侧、耳道口在头侧表面」的关系。

const QUALITY_CHAR = {
  low: { head: 2, body: 2, blob: 1, arc: 12, blush: 12, eyeSeg: 12 },
  mid: { head: 3, body: 3, blob: 1, arc: 20, blush: 18, eyeSeg: 18 },
  high: { head: 4, body: 4, blob: 2, arc: 28, blush: 26, eyeSeg: 24 },
};

function pick(materials, key, color, opts = {}) {
  const m = materials && materials[key];
  if (m && m.isMaterial) return { mat: m, owned: false };
  return {
    mat: new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: opts.roughness ?? 0.85, metalness: 0,
      ...opts,
    }),
    owned: true,
  };
}

/**
 * 造一个躺着的可爱角色。
 * @param {*} _THREE 契约要求的位置参数（实际用模块内 import 的 THREE）。
 * @param {{materials?:object, quality?:string, seed?:number}} opts
 */
export function BuildCharacter(_THREE, { materials, quality = "mid", seed = 20260910 } = {}) {
  const rng = MakeRng(seed);
  let q = QUALITY_CHAR[quality] || QUALITY_CHAR.mid;

  const group = new THREE.Group();
  group.name = "Character";
  const ownedGeometries = [];
  const ownedMaterials = [];
  const own = (g) => { ownedGeometries.push(g); return g; };
  const reg = (p) => { if (p.owned) ownedMaterials.push(p.mat); return p.mat; };

  // ─────────────────── earAnchor ───────────────────
  // 契约：group 里的耳朵位置要对齐 canal 空间原点（= 耳道口），耳道坐标系的 +Z
  // 指向耳道深处（朝头内侧），+Y 指向耳廓上方。
  //
  // 本文件的「角色空间」：+X 前（脸朝向），+Y 上（头顶方向），−Z 是角色自己的右侧。
  // 右耳的三个轴在角色空间里是：medial(耳道深处) = −Z，superior(耳廓上方) = +Y，
  // anterior(前) = +X。这三个向量两两正交且构成右手系，所以可以直接当旋转矩阵，
  // 于是耳道坐标系就变成角色空间里一次固定旋转 —— 好处：
  //   · anchor 完全静止，工具判定不会跟视觉错位；
  //   · 角色整体旋转时耳道坐标系跟着一起转，方向关系永远正确。
  const earAnchor = new THREE.Object3D();
  earAnchor.name = "EarAnchor";
  earAnchor.matrixAutoUpdate = true;
  earAnchor.matrix.makeBasis(
    new THREE.Vector3(1, 0, 0),   // 耳道系 +X → 角色前
    new THREE.Vector3(0, 1, 0),   // 耳道系 +Y → 角色上
    new THREE.Vector3(0, 0, -1)   // 耳道系 +Z（耳道深处）→ 角色内侧
  );
  earAnchor.matrix.decompose(earAnchor.position, earAnchor.quaternion, earAnchor.scale);
  group.add(earAnchor);

  // 所有身体部件挂在 bodyRoot 下，正是为了让 earAnchor 不受任何表情/呼吸动画影响。
  const bodyRoot = new THREE.Group();
  bodyRoot.name = "Body";
  group.add(bodyRoot);

  // ─────────────────── 材质 ───────────────────
  const skinM = reg(pick(materials, "skin", PALETTE.skin, { roughness: 0.85 }));
  const clothM = reg(pick(materials, "cloth", PALETTE.mint, { roughness: 0.95 }));
  const hairM = reg(pick(materials, "hair", PALETTE.woodDeep, { roughness: 0.88 }));
  const inkM = reg(pick(materials, "ink", PALETTE.ink, { roughness: 0.6 }));

  // 腮红：半透明加法，天然就有「透出来」的可爱感
  const blushMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(PALETTE.blush), transparent: true, opacity: 0.0,
    depthWrite: false, blending: THREE.NormalBlending, side: THREE.DoubleSide,
  });
  ownedMaterials.push(blushMat);
  const whiteM = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.white) });
  ownedMaterials.push(whiteM);

  // ─────────────────── 部件 ───────────────────
  // 全部用球/胶囊这类程序化几何，靠缩放做形状。低多边形也够可爱，手机也扛得住。

  function bodyBlob(sx, sy, sz, px, py, pz, mat, detail) {
    const g = own(new THREE.IcosahedronGeometry(1, detail));
    const m = new THREE.Mesh(g, mat);
    m.scale.set(sx, sy, sz);
    m.position.set(px, py, pz);
    // 记下静止位置：动画都是「相对它做偏移」，否则每帧往同一个方向累加就会飘走
    m.userData.basePos = new THREE.Vector3(px, py, pz);
    bodyRoot.add(m);
    return m;
  }

  /** 给部件换几何：保持引用一致，别的地方还指着同一个 geometry。 */
  function swapGeo(mesh, g) {
    if (mesh.geometry) mesh.geometry.dispose();
    mesh.geometry = own(g);
    return mesh.geometry;
  }

  // 头：一个稍稍「上宽下窄」的蛋形（婴幼儿比例才有治愈感），用两球叠出来
  const headMain = bodyBlob(HEAD.rx, HEAD.ry, HEAD.rz, 0, 0, HEAD.cz, skinM, q.head);
  // 下巴/脸颊那一小团，让侧脸不是纯球
  const headJaw = bodyBlob(HEAD.rx * 0.78, HEAD.ry * 0.52, HEAD.rz * 0.80, -6, -HEAD.ry * 0.62, HEAD.cz + 6, skinM, Math.max(1, q.head - 1));

  // 躯干：躺姿，身体朝角色的脚方向（−Y）延伸
  const torso = bodyBlob(96, 150, 74, 6, -232, HEAD.cz + 6, clothM, q.body);
  const belly = bodyBlob(88, 96, 70, 2, -352, HEAD.cz + 2, clothM, q.body);
  const legs = bodyBlob(76, 150, 62, -8, -520, HEAD.cz - 4, clothM, Math.max(1, q.body - 1));

  // 手臂：一只手垫在头下（真采耳时最常见的姿势），另一只搭在身前
  function capsule(r, len, px, py, pz, rotZ, mat, detail) {
    const g = own(new THREE.CapsuleGeometry(r, len, 4, Math.max(6, 8 + detail * 4)));
    const m = new THREE.Mesh(g, mat);
    m.position.set(px, py, pz);
    m.rotation.z = rotZ;
    m.userData.baseRotZ = rotZ;
    m.userData.basePos = new THREE.Vector3(px, py, pz);
    bodyRoot.add(m);
    return m;
  }
  const armUnder = capsule(34, 150, -34, -120, HEAD.cz - 78, 0.28, skinM, q.blob);
  const armFront = capsule(30, 130, 46, -250, HEAD.cz + 62, -0.55, clothM, q.blob);

  // 枕头：软软的一大块，头就枕在上面
  const pillow = bodyBlob(150, 62, 130, -12, -78, HEAD.cz - 40, new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.cream), roughness: 0.98, metalness: 0,
    sheen: 0.4, sheenColor: new THREE.Color(PALETTE.white),
  }), q.body);
  ownedMaterials.push(pillow.material);

  // 头发：一团软软的短发 + 一撮呆毛
  const hairCap = bodyBlob(HEAD.rx * 1.04, HEAD.ry * 0.92, HEAD.rz * 1.03, 2, 10, HEAD.cz - 4, hairM, q.head);
  hairCap.position.y += HEAD.ry * 0.14;
  const bun = bodyBlob(46, 40, 42, -26, HEAD.ry * 0.86, HEAD.cz - 34, hairM, q.blob);
  const tuft = capsule(11, 46, -6, HEAD.ry * 1.12, HEAD.cz + 30, 0.5, hairM, q.blob);
  const bang = bodyBlob(HEAD.rx * 0.86, 26, 20, 10, HEAD.ry * 0.42, HEAD.cz + HEAD.rz * 0.72, hairM, q.blob);

  // ─── 五官：都挂在 faceRoot 上，方便整体做表情 ───
  const faceRoot = new THREE.Group();
  faceRoot.position.set(0, 0, HEAD.cz);
  bodyRoot.add(faceRoot);

  // 眼睛：大椭圆 + 一点高光。用 scale.y 做眨眼/眯眼，比 morph target 直接得多。
  const eyeGeo = own(new THREE.SphereGeometry(1, q.eyeSeg, Math.max(8, q.eyeSeg / 2)));
  function makeEye(x, y) {
    const g = new THREE.Group();
    g.position.set(x, y, HEAD.rz * 0.72);
    const ball = new THREE.Mesh(eyeGeo, inkM);
    ball.scale.set(19, 25, 6);
    g.add(ball);
    const hi = new THREE.Mesh(eyeGeo, whiteM);
    hi.scale.set(6.5, 7.5, 3);
    hi.position.set(4.5, 7, 4.5);
    g.add(hi);
    // 闭眼时的弧线（笑眼）：默认藏起来
    const arcG = own(new THREE.TorusGeometry(15, 3.0, 6, q.arc, Math.PI));
    const arc = new THREE.Mesh(arcG, inkM);
    arc.position.set(0, -2, 4);
    arc.rotation.z = Math.PI;
    arc.visible = false;
    g.add(arc);
    faceRoot.add(g);
    return { group: g, ball, hi, arc };
  }
  const eyeL = makeEye(-32, 16);
  const eyeR = makeEye(34, 14);

  // 腮红：两片压扁的圆，随舒适度加深
  const blushGeo = own(new THREE.CircleGeometry(20, q.blush));
  function makeBlush(x, y) {
    const m = new THREE.Mesh(blushGeo, blushMat);
    m.position.set(x, y, HEAD.rz * 0.70);
    m.scale.set(1, 0.72, 1);
    faceRoot.add(m);
    return m;
  }
  const blushL = makeBlush(-58, -16);
  const blushR = makeBlush(60, -18);

  // 鼻子：小小一颗
  const nose = new THREE.Mesh(eyeGeo, skinM);
  nose.scale.set(11, 9, 12);
  nose.position.set(2, -16, HEAD.rz * 0.88);
  faceRoot.add(nose);

  // 嘴：一条弧线。smile01 控制弧度，开心时嘴角上翘。
  const mouthGeo = own(new THREE.TorusGeometry(13, 2.6, 6, q.arc, Math.PI * 0.9));
  const mouth = new THREE.Mesh(mouthGeo, inkM);
  mouth.position.set(4, -42, HEAD.rz * 0.86);
  mouth.rotation.z = Math.PI * 1.05;
  faceRoot.add(mouth);
  // 「惊讶 / 打哈欠」时用的小圆嘴（自己一份几何，避免跟眼睛共享后被 setQuality 换掉）
  const mouthOpen = new THREE.Mesh(own(new THREE.SphereGeometry(1, Math.max(8, q.eyeSeg), Math.max(6, q.eyeSeg / 2))), inkM);
  mouthOpen.scale.set(9, 11, 6);
  mouthOpen.position.set(4, -44, HEAD.rz * 0.86);
  mouthOpen.visible = false;
  faceRoot.add(mouthOpen);

  // 左耳只做个体积感，不做解剖 —— 相机不会看它
  const leftEar = bodyBlob(7, 26, 20, 0, -4, HEAD.cz - HEAD.rz * 0.97, skinM, q.blob);
  leftEar.userData.baseRotY = 0.3;
  leftEar.rotation.y = 0.3;

  // ─── 右耳的「肉垫」：把耳廓接到头侧，顺便让耳廓看起来是长出来的 ───
  // 注意：这不是耳廓本身（耳廓由 Script_EarAnatomy 生成后挂到 earAnchor）。
  // 这里只做耳廓根部那一圈隆起，避免耳廓像一片纸插在头上。
  const earPad = own(new THREE.SphereGeometry(1, Math.max(8, q.eyeSeg), Math.max(8, q.eyeSeg / 2)));
  const earPadMesh = new THREE.Mesh(earPad, skinM);
  earPadMesh.scale.set(26, 34, 10);
  earPadMesh.position.set(0, 0, -8);
  // earPad 要跟着 earAnchor 的方向，但**不能**是 anchor 的子节点（不动 anchor）
  const earVisual = new THREE.Group();
  earVisual.name = "EarVisual";
  earVisual.applyMatrix4(earAnchor.matrix);
  group.add(earVisual);
  earVisual.add(earPadMesh);

  // ─────────────────── 表情 ───────────────────

  const EXPR = {
    relaxed: { eyeOpen: 0.42, smile: 0.30, blush: 0.35, brow: 0, mouthOpen: 0, curl: 0.05, shiver: 0, earTwitch: 0.05, headDown: 0.02 },
    ticklish: { eyeOpen: 0.68, smile: 0.55, blush: 0.75, brow: 0.3, mouthOpen: 0, curl: 0.85, shiver: 0.35, earTwitch: 1.0, headDown: 0.06 },
    happy: { eyeOpen: 0.10, smile: 1.0, blush: 0.9, brow: 0, mouthOpen: 0, curl: 0.25, shiver: 0, earTwitch: 0.2, headDown: 0.03 },
    shiver: { eyeOpen: 0.30, smile: 0.35, blush: 0.8, brow: 0.2, mouthOpen: 0.25, curl: 0.6, shiver: 0.85, earTwitch: 0.7, headDown: 0.08 },
    surprise: { eyeOpen: 1.35, smile: 0.0, blush: 0.4, brow: 0.7, mouthOpen: 1.0, curl: 0.15, shiver: 0.1, earTwitch: 0.5, headDown: -0.03 },
    sleepy: { eyeOpen: 0.12, smile: 0.18, blush: 0.5, brow: 0, mouthOpen: 0.3, curl: 0.1, shiver: 0, earTwitch: 0.03, headDown: 0.10 },
    // ouch 只有「一点点委屈」：嘴角往下一点点、眉毛内八一点点，绝不做恐怖表情
    ouch: { eyeOpen: 0.85, smile: -0.35, blush: 0.45, brow: -0.5, mouthOpen: 0.15, curl: 0.35, shiver: 0.25, earTwitch: 0.4, headDown: 0.05 },
  };

  const cur = Object.assign({}, EXPR.relaxed);   // 当前（插值中）
  const tgt = Object.assign({}, EXPR.relaxed);   // 目标
  const want = Object.assign({}, EXPR.relaxed);  // 每帧的临时目标（复用，避免每帧新建对象）
  let exprName = "relaxed";
  let exprIntensity = 1;
  let blink = 0;                                  // 0 = 睁，1 = 全闭
  let blinkTimer = 1.2 + rng() * 3.0;
  let breathPhase = rng() * Math.PI * 2;
  let breath01 = 0.5;
  let time = 0;
  let earTwitchImpulse = 0;
  let shiverPhase = 0;
  let curlImpulse = 0;

  /** 手动眨眼（契约 API）。 */
  function Blink() {
    blinkTimer = 0;
    blink = 0.001;
  }

  /** 呼吸相位（契约 API）：传给 Update 或单独叫都行。 */
  function SetBreath01(v) {
    breath01 = clamp(v, 0, 1);
  }

  function SetExpression(name, intensity01 = 1) {
    const preset = EXPR[name];
    if (!preset) return; // 未知表情静默忽略，绝不抛异常把游戏卡死
    exprName = name;
    exprIntensity = clamp(intensity01, 0, 1.5);
    for (const k of Object.keys(preset)) {
      tgt[k] = lerp(EXPR.relaxed[k], preset[k], clamp(exprIntensity, 0, 1.5));
    }
  }

  /**
   * 每帧更新。
   * state = { expression, comfort01, tickle01, depth, pain01 }
   * 呼吸起伏、随机眨眼、耳廓抽动、腮红深浅、偶尔的满足微笑都由这里驱动。
   */
  function Update(dt, state = {}) {
    const stepDt = (typeof dt === "number" && dt > 1e-6 && dt < 0.25) ? dt : 1 / 60;
    time += stepDt;

    if (state.expression && state.expression !== exprName) SetExpression(state.expression, 1);

    // 舒适度 / 痒 / 痛都会反过来改表情参数（不是硬切换，是叠加，看起来才自然）
    const comfort = clamp(state.comfort01 ?? 0.5, 0, 1);
    const tickle = clamp(state.tickle01 ?? 0, 0, 1);
    const pain = clamp(state.pain01 ?? 0, 0, 1);

    const wantSrc = tgt;
    for (const key of Object.keys(wantSrc)) want[key] = wantSrc[key];
    want.blush = clamp(want.blush + comfort * 0.35 + tickle * 0.2, 0, 1);
    want.smile = clamp(want.smile + comfort * 0.25 - pain * 0.45, -0.6, 1.2);
    want.shiver = clamp(want.shiver + tickle * 0.5, 0, 1.2);
    want.eyeOpen = clamp(want.eyeOpen * (1 - comfort * 0.25) + pain * 0.25, 0.05, 1.5);
    want.curl = clamp(want.curl + tickle * 0.5, 0, 1.2);
    want.earTwitch = clamp(want.earTwitch + tickle * 0.6 + pain * 0.3, 0, 1.4);

    // 平滑逼近：表情变化要有惯性，突变会显得廉价
    const k = clamp(stepDt * 6, 0, 1);
    for (const key of Object.keys(cur)) cur[key] = lerp(cur[key], want[key], k);

    // ── 呼吸：胸腔起伏 + 头极轻微上下 ──
    breathPhase += stepDt * (0.9 + (1 - comfort) * 0.5); // 越舒服呼吸越慢
    const breath = Math.sin(breathPhase) * 0.5 + 0.5;
    breath01 = lerp(breath01, breath, clamp(stepDt * 4, 0, 1));
    const breathe = (breath01 - 0.5) * 2; // -1..1
    if (torso) torso.scale.y = 150 * (1 + breathe * 0.022);
    if (belly) belly.scale.y = 96 * (1 + breathe * 0.030);
    if (headMain) headMain.position.y = breathe * 1.4;
    if (headJaw) headJaw.position.y = -HEAD.ry * 0.62 + breathe * 1.4;
    if (faceRoot) faceRoot.position.y = breathe * 1.4;

    // ── 眨眼：随机间隔，累了眨得更频繁 ──
    blinkTimer -= stepDt;
    if (blinkTimer <= 0) {
      blink = 0.0001;
      blinkTimer = lerp(3.4, 1.6, comfort) * (0.6 + rng() * 0.9);
    }
    if (blink > 0) {
      blink += stepDt * 7.5;
      if (blink >= 1) blink = 0; // 一次眨眼约 0.13s
    }
    // 0→1→0 的三角波当闭眼量
    const blinkAmt = blink > 0 ? Math.sin(clamp(blink, 0, 1) * Math.PI) : 0;

    // ── 眼睛 ──
    // 大眼 + 闭眼笑：eyeOpen 小到一定程度就换成弧线（眯眼笑）
    const openAmt = clamp(cur.eyeOpen, 0, 1.5) * (1 - blinkAmt);
    const smileEyes = cur.eyeOpen < 0.22 && cur.smile > 0.4 && blinkAmt < 0.3;
    const eyeScaleY = clamp(openAmt, 0.06, 1.5);
    for (const e of [eyeL, eyeR]) {
      e.ball.visible = !smileEyes;
      e.hi.visible = !smileEyes && eyeScaleY > 0.35;
      e.arc.visible = smileEyes;
      e.ball.scale.set(19, 25 * eyeScaleY, 6);
      e.hi.scale.set(6.5, 7.5 * eyeScaleY, 3);
      if (eyeScaleY < 0.35) e.hi.visible = false;
    }

    // ── 腮红：随舒适度加深，另外做一点点呼吸般的脉动（活物感） ──
    blushMat.opacity = clamp(cur.blush, 0, 1) * (0.34 + 0.10 * Math.sin(time * 1.7));
    const blushScale = 1 + clamp(cur.blush, 0, 1) * 0.22;
    blushL.scale.set(blushScale, 0.72 * blushScale, 1);
    blushR.scale.set(blushScale, 0.72 * blushScale, 1);

    // ── 嘴：smile 正数上翘、负数下撇；mouthOpen 时换成小圆嘴 ──
    const openMouth = cur.mouthOpen > 0.4;
    mouth.visible = !openMouth;
    mouthOpen.visible = openMouth;
    const s = clamp(cur.smile, -0.6, 1.2);
    mouth.rotation.z = Math.PI * 1.05 - s * 0.55;
    mouth.scale.set(1 + s * 0.22, 1 + s * 0.30, 1);
    mouthOpen.scale.set(9 * (0.8 + cur.mouthOpen * 0.5), 11 * (0.7 + cur.mouthOpen * 0.7), 6);

    // ── 身体：痒的时候蜷一下（curl），痛的时候缩一下 ──
    curlImpulse = lerp(curlImpulse, cur.curl, clamp(stepDt * 3, 0, 1));
    const curlAngle = curlImpulse * 0.22;
    if (legs) legs.rotation.z = curlAngle * 0.8;
    if (armFront) armFront.rotation.z = (armFront.userData.baseRotZ ?? -0.55) + curlAngle * 1.4;
    if (torso) torso.rotation.z = curlAngle * 0.25;

    // ── 酥麻的轻颤（shiver）：几个正弦叠加，幅度小、频率高 ──
    // 位移必须相对「静止位置」算，否则每帧累加会让部件慢慢飘出画面。
    shiverPhase += stepDt * (22 + cur.shiver * 26);
    const shiver = cur.shiver * (Math.sin(shiverPhase) * 0.55 + Math.sin(shiverPhase * 1.7 + 1.3) * 0.45);
    if (torso) torso.position.x = torso.userData.basePos.x + shiver * 2.2;
    if (belly) belly.position.x = belly.userData.basePos.x + shiver * 2.0;
    if (headMain) headMain.rotation.z = shiver * 0.012;
    if (armFront) armFront.position.y = armFront.userData.basePos.y + shiver * 3.0;

    // ── 耳廓抽动：刺激时的轻微抖动 ──
    // earVisual 是 earAnchor 的**兄弟**（同变换、不同节点），动它不会影响工具判定。
    earTwitchImpulse = lerp(earTwitchImpulse, cur.earTwitch, clamp(stepDt * 5, 0, 1));
    const twitch = earTwitchImpulse * (Math.sin(time * 17.3) * 0.6 + Math.sin(time * 29.1) * 0.4) * 0.035;
    earVisual.rotation.x = twitch;
    earVisual.rotation.y = twitch * 0.7;
    earVisual.position.x = twitch * 2.2;

    void exprIntensity;
  }

  function setQuality(next) {
    const cfg = QUALITY_CHAR[next] || QUALITY_CHAR.mid;
    if (cfg === q) return;
    q = cfg;
    // 真实换细节：头/躯干球体细分级别、五官弧线段数全部重建。
    // 注意保留各部件原有的旋转（左耳的朝向就是靠 rotation.y 定的）。
    const rotY = leftEar.rotation.y, rotZ = leftEar.rotation.z;
    swapGeo(headMain, new THREE.IcosahedronGeometry(1, cfg.head));
    swapGeo(headJaw, new THREE.IcosahedronGeometry(1, Math.max(1, cfg.head - 1)));
    swapGeo(hairCap, new THREE.IcosahedronGeometry(1, cfg.head));
    swapGeo(bun, new THREE.IcosahedronGeometry(1, cfg.blob));
    swapGeo(bang, new THREE.IcosahedronGeometry(1, cfg.blob));
    swapGeo(torso, new THREE.IcosahedronGeometry(1, cfg.body));
    swapGeo(belly, new THREE.IcosahedronGeometry(1, cfg.body));
    swapGeo(legs, new THREE.IcosahedronGeometry(1, Math.max(1, cfg.body - 1)));
    swapGeo(pillow, new THREE.IcosahedronGeometry(1, cfg.body));
    swapGeo(leftEar, new THREE.IcosahedronGeometry(1, cfg.blob));
    leftEar.rotation.y = rotY;
    leftEar.rotation.z = rotZ;
    const eyeG = own(new THREE.SphereGeometry(1, cfg.eyeSeg, Math.max(8, Math.floor(cfg.eyeSeg / 2))));
    for (const e of [eyeL, eyeR]) {
      swapGeo(e.ball, eyeG);
      e.hi.geometry = eyeG; // 高光与眼球共用同一份，别再各造一份
      swapGeo(e.arc, new THREE.TorusGeometry(15, 3.0, 6, cfg.arc, Math.PI));
    }
    swapGeo(mouth, new THREE.TorusGeometry(13, 2.6, 6, cfg.arc, Math.PI * 0.9));
    swapGeo(mouthOpen, new THREE.SphereGeometry(1, cfg.eyeSeg, Math.max(6, Math.floor(cfg.eyeSeg / 2))));
    swapGeo(nose, eyeG);
    swapGeo(earPadMesh, new THREE.SphereGeometry(1, cfg.eyeSeg, Math.max(8, Math.floor(cfg.eyeSeg / 2))));
    blushGeo.dispose();
    const nb = own(new THREE.CircleGeometry(20, cfg.blush));
    blushL.geometry = nb; blushR.geometry = nb;
  }

  function dispose() {
    for (const g of ownedGeometries) g.dispose();
    for (const m of ownedMaterials) m.dispose();
    ownedGeometries.length = 0;
    ownedMaterials.length = 0;
    group.clear();
  }

  function stats() {
    let meshes = 0, tris = 0;
    group.traverse((o) => {
      if (!o.isMesh) return;
      meshes++;
      const g = o.geometry;
      if (!g) return;
      tris += (g.index ? g.index.count / 3 : (g.getAttribute("position")?.count || 0) / 3);
    });
    return { meshes, triangles: Math.round(tris), expression: exprName, quality };
  }

  /** 把整个角色摆成「躺着、右耳朝上」的姿势。lead 可以再覆盖。 */
  function SetPose(id) {
    if (id === "supine") {
      // 仰卧：脸朝上，右耳朝向观察者的上方后侧 —— 采耳店里的标准躺姿
      group.rotation.set(0, -0.5, -0.35);
    } else if (id === "side") {
      group.rotation.set(0, -0.35, -1.25);
    } else {
      group.rotation.set(0, 0, 0);
    }
  }
  SetPose("supine");

  return {
    group,
    earAnchor,
    /** 表情与耳朵视觉的节点（耳廓模型建议挂这里，它跟 anchor 同变换但可独立做抽动） */
    earVisual,
    SetExpression,
    SetBreath01,
    Update,
    Blink,
    SetPose,
    setQuality,
    dispose,
    stats,
  };
}

export default BuildCharacter;
