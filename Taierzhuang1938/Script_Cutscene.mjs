// 《滕县 1938》过场动画系统 —— 实机演出，不是预渲染。
//
// 这是一次**方向变更**：docs/Data_DesignFirstPass.md 第 5.3 节与
// Data_EasyRed2Plan.md 第 6.1 节写着「零过场动画」「不做夺走控制权的镜头动画」。
// 用户点名要这五场，所以这五场（也只有这五场）夺走控制权。
// 战斗中的实机演出仍然不夺控制权，那条规矩没变。
//
// ── 它怎么工作 ──────────────────────────────────────────────────────────
//   · 相机走一条脚本化的轨道（Data_TengxianScript.mjs 的 CUTSCENES.shots）；
//   · 场景里的 Actor 按一条全局时间轴的关键帧摆位（cast[].track）；
//   · 黑边（上下各 12% 视高）＋ 字幕层 ＋ 黑场，全部是 DOM，不占一个 draw call；
//   · 全程可按 Esc 跳过，**跳过后字幕仍以卡片形式补出** ——
//     史实信息不许因为跳过而丢失（这是设计书的硬要求，不是可选项）。
//
// ── 三条不许违反的工程规矩 ──────────────────────────────────────────────
//   1. **不许 SkinnedMesh。** Actor 是骨头组＋刚体块，深度法线预通道拿
//      overrideMaterial 覆盖全场，蒙皮网格会塌。这里只用 ActorFactory 造人。
//   2. **不许 Math.random()。** 手持晃动、抖动全走 Script_Noise 的
//      Mulberry32 / HashString / ValueNoise2 —— 出图必须可复现，
//      否则视觉审查每跑一次得到一张不同的图，没法比。
//   3. **半透明/加性/billboard 材质建完必须 MarkNoPrepass。**
//      这里只有枪口焰是加性贴片，建材质的那一行紧跟着就调它。
//
// ── 绘制量（1280×720、actorQuality=medium 实测，只数过场自己带进场的东西）──
//   CS_Chuchuan        340 网格 / 30.8k 三角 / 1 灯   （独立布景，城不在视锥里）
//   CS_LiZongrenTang    39 网格 /  2.1k 三角 / 1 灯   （独立布景）
//   CS_LastWire         77 网格 /  5.6k 三角 / 1 灯   （独立布景）
//   CS_WangMingzhang   121 网格 / 11.1k 三角 / 0 灯   ★ 叠在滕县城之上
//   CS_BeimenBreakout  293 网格 / 26.5k 三角 / 0 灯   ★ 叠在滕县城之上
//
//   带 ★ 的两场发生在城里，绘制量是**加在城头上的**。性能红线是
//   drawCalls ≤ 5000 / triangles ≤ 600 万。26.5k 三角很轻，293 个网格仍需计入总账，
//   但不得通过删群众或隐藏人物过线；需要优化时只能合批或使用等价 LOD。
//
// ── 与 Script_Actor 的关系 ──────────────────────────────────────────────
// 本模块**不 import Script_Actor**，工厂由外部注入（actorFactory）。
// 换模 agent 正在重写那个文件，硬耦合过去两边都动不了。
// 需要的接口只有三个：Create(kind,{seed}) → { root, Update(dt,state), SetWeapon(id), Dispose() }。

import * as THREE from "three";
import { GLTFLoader } from "./vendor/three/examples/jsm/loaders/GLTFLoader.js";
import { MarkNoPrepass } from "./Script_Post.mjs";
// Lerp 在 Script_Noise 里没导出，导出的名字是 Mix —— 别自己再写一个线性插值，
// 两份实现迟早会有一份被改。
import { HashString, ValueNoise2, Clamp01, Clamp, Mix as Lerp } from "./Script_Noise.mjs";
import { CUTSCENES, CAST } from "./Data_TengxianScript.mjs";
import { TILE_METERS, ScaleBoxUv } from "./Script_Geo.mjs";
import { SampleJieheHeight } from "./Script_JieheHeight.mjs";

// 过场里的少量静态模型（例如出川的小站）走独立 loader：它们只是演出布景，
// 不进碰撞、导航或战场的确定性数据。
const CUTSCENE_MODEL_LOADER = new GLTFLoader();

/** 各材质配方一张贴图铺几米（与城里的 AddWall / MakeBox 同一套数）。 */
const TILE_BY_RECIPE = {
  Ground: TILE_METERS.ground, GroundRubble: TILE_METERS.ground,
  BrickWall: TILE_METERS.brick, BrickWallSooty: TILE_METERS.brick,
  Adobe: TILE_METERS.adobe, RoofTile: TILE_METERS.roof, Stone: TILE_METERS.stone,
  WoodDoor: TILE_METERS.wood, WoodBeam: TILE_METERS.wood, WoodStock: TILE_METERS.wood,
  CarriageBenchWood: TILE_METERS.wood,
  Sandbag: TILE_METERS.sandbag, Steel: TILE_METERS.steel, SteelHelmet: TILE_METERS.steel,
  ClothNra: TILE_METERS.cloth, ClothIja: TILE_METERS.cloth,
};

/**
 * 车厢外的远景地面：顶点直接取项目已下载并校验过的 SRTM 高程采样。
 * 这不是图片、不是竖直遮挡板；从任意车窗角度看都是真实水平地形和自然天际线。
 */
function BuildHeightTerrainGeometry(terrain) {
  const side = terrain.side < 0 ? -1 : 1;
  const columns = Math.max(2, Math.floor(terrain.columns || 40));
  const rows = Math.max(2, Math.floor(terrain.rows || 56));
  const near = Math.max(3, Number(terrain.near) || 4);
  const far = Math.max(near + 1, Number(terrain.far) || 100);
  const minZ = Number(terrain.minZ) || -80;
  const maxZ = Number(terrain.maxZ) || 80;
  const [sourceMinX, sourceMaxX, sourceMinZ, sourceMaxZ] = terrain.sourceBounds || [-1250, 1250, -2200, -380];
  const [referenceX, referenceZ] = terrain.sourceReference || [0, -1470];
  const referenceY = SampleJieheHeight(referenceX, referenceZ);
  const baseY = Number(terrain.baseY) || 0;
  const count = columns * rows;
  const positions = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  for (let col = 0; col < columns; col += 1) {
    const u = col / (columns - 1);
    const localX = side * (near + (far - near) * u);
    const sampleX = sourceMinX + (sourceMaxX - sourceMinX) * u;
    for (let row = 0; row < rows; row += 1) {
      const v = row / (rows - 1);
      const index = col * rows + row;
      const localZ = minZ + (maxZ - minZ) * v;
      const sampleZ = sourceMinZ + (sourceMaxZ - sourceMinZ) * v;
      positions[index * 3] = localX;
      positions[index * 3 + 1] = baseY + SampleJieheHeight(sampleX, sampleZ) - referenceY;
      positions[index * 3 + 2] = localZ;
      uvs[index * 2] = localX / TILE_METERS.ground;
      uvs[index * 2 + 1] = localZ / TILE_METERS.ground;
    }
  }
  const indices = new Uint16Array((columns - 1) * (rows - 1) * 6);
  let cursor = 0;
  for (let col = 0; col < columns - 1; col += 1) {
    for (let row = 0; row < rows - 1; row += 1) {
      const a = col * rows + row, b = a + 1, c = (col + 1) * rows + row, d = c + 1;
      if (side > 0) {
        indices[cursor] = a; indices[cursor + 1] = b; indices[cursor + 2] = c;
        indices[cursor + 3] = b; indices[cursor + 4] = d; indices[cursor + 5] = c;
      } else {
        indices[cursor] = a; indices[cursor + 1] = c; indices[cursor + 2] = b;
        indices[cursor + 3] = b; indices[cursor + 4] = c; indices[cursor + 5] = d;
      }
      cursor += 6;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

// ---------------------------------------------------------------------------
// 镜头数学
// ---------------------------------------------------------------------------

/**
 * 35 mm 等效焦距 → three 的垂直 FOV（度）。
 *
 * 分镜表上写的是 24/35/50/85/135/200 mm，**代码里一律不许直接写 fov 度数** ——
 * 写成度数以后没人对得上分镜，改一个镜头就得拿计算器。
 * 全画幅感光面高 24 mm：fov = 2·atan(12 / f)。
 */
export function FovFromFocalMm(focalMm, sensorHeightMm = 24) {
  const f = Math.max(4, focalMm || 50);
  return (2 * Math.atan(sensorHeightMm / (2 * f)) * 180) / Math.PI;
}

/** 缓动表。分镜里 ease 写的就是这里的键名。 */
export const EASINGS = {
  linear: (k) => k,
  easeIn: (k) => k * k,
  easeOut: (k) => 1 - (1 - k) * (1 - k),
  easeInOut: (k) => (k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k)),
  hold: () => 0,
};

function Ease(name, k) {
  const fn = EASINGS[name] || EASINGS.easeInOut;
  return fn(Clamp01(k));
}

/**
 * Actor 的正面是**局部 -Z**（见 Script_Ai：yaw = atan2(-dx, -dz)）。
 * 分镜数据里的 ry 都按这个约定写；下游要算「面朝某个方向」时用这个函数，
 * 别自己拍脑袋写 atan2 —— 写反了人就背对着走。
 */
export function YawFacing(dx, dz) {
  return Math.atan2(-dx, -dz);
}

// ---------------------------------------------------------------------------
// 数据自检 —— 规则在 Script_CutsceneCheck.mjs（纯数据，Node 里能跑），这里只 re-export，
// 正片 Play() 前的硬断言与命令行 `node Taierzhuang1938/Script_CutsceneCheck.mjs` 是同一份。
// ---------------------------------------------------------------------------

import {
  ValidateCutscene, ValidateAllCutscenes, ResolveHeadLookConfig, ClampHeadLook,
} from "./Script_CutsceneCheck.mjs";
export { ValidateCutscene, ValidateAllCutscenes, ResolveHeadLookConfig, ClampHeadLook };

// ---------------------------------------------------------------------------
// 关键帧采样
// ---------------------------------------------------------------------------

/**
 * 在一条轨道上取 t 时刻的位姿。
 *
 * 数值字段（moveSpeed / crouch / aim …）线性插值，布尔字段（hidden / dead）
 * **取前一关键帧的值不插值** —— 布尔插值没有意义，而且 dead 一插值就会
 * 在半路触发 Ragdoll。第一帧之前一律隐藏：没写就是还没上场。
 */
function SampleTrack(track, t) {
  if (t < track[0].t) return { hidden: true };
  let i = track.length - 1;
  for (let k = 0; k < track.length - 1; k += 1) {
    if (t < track[k + 1].t) { i = k; break; }
  }
  const a = track[i];
  const b = track[i + 1];
  const stateA = a.state || {};
  if (!b) {
    return { pos: a.pos, ry: a.ry || 0, state: stateA, hidden: !!stateA.hidden };
  }
  const span = Math.max(1e-6, b.t - a.t);
  const k = Clamp01((t - a.t) / span);
  const stateB = b.state || {};
  const state = {};
  // 布尔（也就是段内不变的东西）取 a；数值两头插。
  for (const key of new Set([...Object.keys(stateA), ...Object.keys(stateB)])) {
    const va = stateA[key];
    const vb = stateB[key];
    if (typeof va === "boolean" || typeof vb === "boolean") { state[key] = !!va; continue; }
    state[key] = Lerp(va ?? 0, vb ?? 0, k);
  }
  return {
    pos: [Lerp(a.pos[0], b.pos[0], k), Lerp(a.pos[1], b.pos[1], k), Lerp(a.pos[2], b.pos[2], k)],
    ry: Lerp(a.ry || 0, b.ry || 0, k),
    state,
    hidden: !!stateA.hidden,
  };
}

// ---------------------------------------------------------------------------
// DOM 覆盖层
// ---------------------------------------------------------------------------

const STYLE_ID = "cutsceneStyle";
const BAR_RATIO = 0.12;          // 上下黑边各占视高 12%（设计书给死的）

const CSS = `
.csRoot{position:fixed;inset:0;pointer-events:none;z-index:60;
  font-family:"Noto Serif SC",serif;opacity:0;transition:opacity .35s ease}
.csRoot.on{opacity:1}
.csBar{position:absolute;left:0;right:0;height:${BAR_RATIO * 100}%;background:#000}
.csBar.top{top:0}
.csBar.bot{bottom:0}
.csBlack{position:absolute;inset:0;background:#000;opacity:0}
/* 字幕层比台词层高一档：两层都锚在 bottom:16% 时，同屏出现会直接压在一起
   （李宗仁那一场因此只能把带时刻的字幕全挪进跳过卡）。字幕在上、台词在下。 */
.csSubs{position:absolute;left:8%;right:8%;bottom:${BAR_RATIO * 100 + 11}%;text-align:center}
.csSubs.center{bottom:auto;top:50%;transform:translateY(-50%)}
.csSub.title{font-size:clamp(26px,3.2vw,52px);letter-spacing:.32em;color:#f2ead6;margin:0 0 .6em}
.csSub.date{font-size:clamp(14px,1.3vw,22px);letter-spacing:.22em;color:#b9b1a1}
.csSub{color:#e7dfcc;font-size:clamp(15px,1.55vw,25px);line-height:1.6;
  text-shadow:0 2px 6px #000,0 0 2px #000;margin:0 0 .35em}
.csSub.big{font-size:clamp(21px,2.4vw,38px);letter-spacing:.14em;color:#f2ead6}
.csSub.small{font-size:clamp(12px,1.05vw,17px);color:#b9b1a1;line-height:1.75}
.csSubNote{display:block;font-size:.74em;color:#9b9384;margin-top:.3em;line-height:1.7}
.csTier{font-size:.66em;color:#8a8172;margin-right:.5em;vertical-align:.15em;letter-spacing:.08em}
.csLine{position:absolute;left:8%;right:8%;bottom:${BAR_RATIO * 100 + 4}%;text-align:center}
.csLineText{color:#f0e6d0;font-size:clamp(16px,1.7vw,28px);line-height:1.6;
  text-shadow:0 2px 6px #000,0 0 2px #000}
.csWho{color:#c7b184;margin-right:.6em}
.csOff{font-style:italic;color:#d9cfb8}
.csSkip{position:absolute;right:2.4%;bottom:${BAR_RATIO * 100 + 1.4}%;
  color:#6f6a5e;font-size:12px;letter-spacing:.18em}
.csCard{position:absolute;inset:0;background:#000;display:flex;flex-direction:column;
  justify-content:center;align-items:center;padding:0 12%;opacity:0;transition:opacity .3s ease}
.csCard.on{opacity:1}
.csCardTitle{color:#c7b184;font-size:clamp(18px,1.9vw,30px);letter-spacing:.3em;margin-bottom:1.4em}
.csCardLine{color:#ded5c0;font-size:clamp(13px,1.25vw,20px);line-height:1.9;margin-bottom:.9em;
  max-width:56em;text-align:center}
.csCardLine.small{font-size:clamp(11px,1.0vw,16px);color:#a8a091}
.csTallyRow{display:flex;gap:1.4em;align-items:baseline;color:#ded5c0;
  font-size:clamp(14px,1.35vw,22px);line-height:2.1}
.csTallyLabel{color:#8f8776;letter-spacing:.32em;min-width:6em;text-align:right}
.csTallyNote{color:#7e7767;font-size:.72em;margin-left:.8em}
`;

function EnsureStyle(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

function TierTag(tier) {
  if (!tier || tier === "游戏") return "";
  return `<span class="csTier">【${tier}】</span>`;
}

// ---------------------------------------------------------------------------
// 导演
// ---------------------------------------------------------------------------

export class CutsceneDirector {
  // -------------------------------------------------------------------------
  // 说话与听 —— 导演层自动合成，数据文件一个字都不用写
  //
  // 为什么不让数据逐条写关键帧：一场 102 s 的车厢戏有二十句台词、三十几个演员，
  // 逐句给「谁动嘴、谁转头」是七百条关键帧，写不完也维护不了；而这件事本来就
  // **从 shot.lines 推得出来**：谁在说、说到第几秒、旁边坐着谁。引擎自己算。
  //
  // **这一整套必须挂在类身上，不能写成模块级常量/函数。**
  // Script_CutsceneControlTest 用 new Function 把 `export class CutsceneDirector`
  // 到 `export default` 之间的源码单独切出来跑，模块作用域里的东西在那个 eval
  // 里一个都看不见 —— 写成 const 就是 Play() 一进门 ReferenceError。
  // （这条注释是写给下一个想把它们"整理"回模块顶部的人的。）
  // -------------------------------------------------------------------------

  /** 全部旋钮。改数不用翻代码，也不用改数据。 */
  static LIFE = Object.freeze({
    talkMin: 1.0,       // 一句台词至少驱动多久（「不怕！」只有 0.6 s，太短看不出动作）
    talkFade: 0.28,     // 说话姿态的缓入/缓出秒数
    listenNear: 5.0,    // 这个半径内的人满幅转头
    listenFar: 7.0,     // 到这里衰减为 0（车厢对角两个座位是 5.3 m，要留余量）
    listenRise: 0.45,   // 转头用多久转到位
    listenHold: 0.9,    // 话说完后还看着说话者多久（再叠个体错开 0—0.7 s）
    listenFall: 0.9,    // 缓缓转回来用多久
    yawMin: 0.55,       // 每人转头幅度上限的下界（rad，约 31°）
    yawSpan: 0.35,      // 上限的个体浮动（最多约 52°）
    pitchMax: 0.32,     // 抬头/低头的上限
    chorusTalk: 0.5,    // 群体应答时每个人的说话幅度打几折
    chorusRadius: 9.0,  // 群体应答按「离带头那个人多远」挑人
  });

  /** 0—1 的说话包络：at 起缓入，end 后缓出。**闭式函数，不积分**（见 _ApplyActors）。 */
  static TalkEnvelope(t, at, end, delay = 0) {
    const fadeMax = CutsceneDirector.LIFE.talkFade;
    const a = at + delay;
    const b = end + delay;
    const fade = Math.min(fadeMax, (b - a) * 0.5);
    if (t <= a || t >= b + fade) return 0;
    if (t < a + fade) return Clamp01((t - a) / fade);
    if (t > b) return 1 - Clamp01((t - b) / fade);
    return 1;
  }

  /** 转头的包络：起始延迟 → 转到位 → 保持到话说完之后 → 缓缓转回。 */
  static ListenEnvelope(t, at, end, delay, hold) {
    const L = CutsceneDirector.LIFE;
    const a = at + delay;
    const b = end + hold;
    if (t <= a || t >= b + L.listenFall) return 0;
    if (t < a + L.listenRise) return Clamp01((t - a) / L.listenRise);
    if (t > b) return 1 - Clamp01((t - b) / L.listenFall);
    return 1;
  }

  /**
   * 把全场台词摊平成一条「谁在什么时候说话」的时间轴（Play 时算一次）。
   *
   * `who` 不在 cast 里的（出川那场的 `squad`）是**群体台词**：它没有对应的演员，
   * 挂到时间轴上**前一个具名说话者**身上 —— 也就是「班长问、全车答」里的班长。
   * 群众的表现因此是「朝班长应答」，而不是三十几张嘴对着空气一起动。
   */
  static BuildLineTimeline(cut) {
    const castIds = new Set((cut.cast || []).map((c) => c.id));
    const out = [];
    let start = 0;
    for (const shot of cut.shots || []) {
      for (const line of shot.lines || []) {
        const at = start + (Number(line.at) || 0);
        const span = Math.max(Number(line.seconds) || 0, CutsceneDirector.LIFE.talkMin);
        out.push({ who: line.who || null, at, end: at + span, off: !!line.off, shot: shot.n });
      }
      start += shot.seconds || 0;
    }
    out.sort((a, b) => a.at - b.at);
    let lastNamed = null;
    for (const line of out) {
      if (line.who && castIds.has(line.who)) {
        lastNamed = line.who; line.chorus = false; line.target = line.who;
      } else { line.chorus = true; line.target = lastNamed; }
    }
    return out;
  }

  /** 这个演员的轨道有没有**显式**写过 lookYaw / lookPitch。写过就是导演在管他的头，引擎不插手。 */
  static SpecDeclaresLook(spec) {
    if (spec.__csDeclaresLook === undefined) {
      spec.__csDeclaresLook = (spec.track || []).some((key) => {
        const s = key && key.state;
        return !!s && (Number.isFinite(s.lookYaw) || Number.isFinite(s.lookPitch));
      });
    }
    return spec.__csDeclaresLook;
  }

  /**
   * 这个演员这一刻头大概在哪个高度（世界 y）。转头要算俯仰，就得知道两个头差多少。
   *
   * 只读 actor.dims / actor.height —— 本模块**不 import Script_Actor**（见文件头），
   * 拿不到就退回「脚下 + 0.93 身高」，转头照样成立，只是俯仰略糙。
   */
  static ActorHeadY(actor, sample) {
    const d = actor && actor.dims;
    const s = sample.state || {};
    const foot = sample.pos[1];
    if (!d) return foot + (actor && actor.height ? actor.height * 0.93 : 1.5);
    // 与 Script_Actor 的 `seated` 同一口径：隐含坐姿要动作过半才算数
    // （零头不算坐下，否则站客的头高会被按比例压低，俯仰就朝着一个不存在的
    // 「半蹲的人」去算）。这两处的阈值必须一起改。
    const implied = (amount, weight) => {
      const x = Clamp01(((amount || 0) - 0.45) / 0.40);
      return x * x * (3 - 2 * x) * weight;
    };
    const seated = Math.max(s.sit || 0, implied(s.sleep, 1), implied(s.repairShoe, 0.72),
      implied(s.checkAmmo, 0.42), implied(s.cleanRifle, 0.32));
    const drop = seated * (d.hipY - d.thighLen - 0.045 * d.height);
    const lift = seated > 0.001 ? Clamp(Number(s.seatLift) || 0, 0, 0.28) : 0;
    const crouchDrop = Clamp01(s.crouch || 0) * 0.34 * d.hipY;
    const scale = actor.sizeScale || 1;
    return foot + (d.headCenterY - Math.max(drop, crouchDrop)) * scale + lift * scale;
  }

  /** 把角度折回 [−π, π]。转头算的是「相对自己朝向差多少」，不折就会绕远路。 */
  static WrapAngle(a) {
    let v = a;
    while (v > Math.PI) v -= Math.PI * 2;
    while (v < -Math.PI) v += Math.PI * 2;
    return v;
  }

  /**
   * @param {object} host
   *   camera        THREE.PerspectiveCamera —— 过场期间被完全接管，播完还原
   *   scene         THREE.Scene
   *   hud           可选。有就在开场时把它藏起来
   *   audio         可选。AudioEngine，用 Play(name,{volume})
   *   actorFactory  必需（要演人的话）。Create(kind,{seed}) → Actor
   *   library       可选。MaterialLibrary，道具的 mat 名字从这里取
   *   root          DOM 容器，默认 document.body
   *   onCapture/onRelease  夺走 / 交还玩家控制权的回调（正片接进来时必给）
   *   includeProbeProps    预览页专用：把 probeOnly 的道具也建出来
   */
  constructor({
    camera, scene, hud = null, audio = null, actorFactory = null, library = null,
    root = null, onCapture = null, onRelease = null, includeProbeProps = false,
    applySky = null, restoreSky = null,
    table = CUTSCENES,
  } = {}) {
    this.camera = camera;
    this.scene = scene;
    this.hud = hud;
    this.audio = audio;
    this.actorFactory = actorFactory;
    this.library = library;
    this.table = table;
    this.onCapture = onCapture;
    this.onRelease = onRelease;
    // 过场自带天空（cut.sky）的两只钩子：套 / 还。没接的话就沿用当前关的天。
    this.applySky = applySky;
    this.restoreSky = restoreSky;
    this.skyApplied = false;
    this.includeProbeProps = includeProbeProps;

    this.doc = (root && root.ownerDocument) || (typeof document !== "undefined" ? document : null);
    this.rootHost = root || (this.doc ? this.doc.body : null);
    this.dom = null;
    this._BuildDom();

    this.cut = null;
    this.time = 0;
    this.prevTime = 0;
    this.playing = false;
    this.skipped = false;
    this.resolve = null;
    this.fired = new Set();
    this.setRoot = null;
    this.actors = new Map();          // id -> { actor, spec }
    this.props = new Map();           // name -> { mesh, base }
    this.lineTimeline = [];           // Play() 时摊平的台词时间轴（说话/转头都查它）
    this._actorFrame = [];            // 每帧复用的采样缓冲，别在 60 Hz 的路径上造垃圾
    this._actorFrameById = new Map();
    this.ownedGeometries = [];
    this.ownedMaterials = [];
    this.flashPool = [];
    this.gunsight = null;
    this.cardTime = -1;
    this.cardHold = 0;
    this.savedCamera = null;
    this.savedAudio = null;
    // Timeline seek 会主动终止旧播放头，再从目标时间重建仍在持续的对白。
    // 不留这本账，快速拖动几次就会叠出好几个人声。
    this.activeCueVoices = new Set();
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.lookNeutral = false;
    this.lookConfig = ResolveHeadLookConfig(null, null);
    this.headLook = false;
    this.walkConfig = null;
    this.walkOffset = new THREE.Vector3();
    this.walkBob = 0;
    this.walkKeys = new Set();
    this._released = false;
    this.subSlots = [];               // { text, tier, small, big, note, until }
    this.lineSlot = null;
    this.shakeSeed = 1;
    this.blackAlpha = 0;
    // 播过的东西，给自检与「跳过卡」用；不清空，一场一场累加。
    this.log = [];

    this._onKey = (event) => {
      if (!this.playing) return;
      // 卡片阶段优先：这时候 Esc 的意思是「翻过卡片」，不是「再跳过一次」。
      if (this.cardTime >= 0) { this.cardTime = this.cardHold; return; }
      if (event.key === "Escape") { this.Skip(); return; }
      const key = String(event.key || "").toLowerCase();
      if (this.walkConfig && ["w", "a", "s", "d", "arrowup", "arrowleft", "arrowdown", "arrowright"].includes(key)) {
        this.walkKeys.add(key);
        event.preventDefault();
      }
    };
    this._onKeyUp = (event) => { this.walkKeys.delete(String(event.key || "").toLowerCase()); };
    if (this.doc) this.doc.addEventListener("keydown", this._onKey);
    if (this.doc) this.doc.addEventListener("keyup", this._onKeyUp);
  }

  get Playing() { return this.playing; }
  get Time() { return this.time; }
  get CurrentId() { return this.cut ? this.cut.id : null; }
  get AllowsLook() { return !!(this.playing && this.headLook && !this.lookNeutral); }
  get Look() { return { yaw: this.lookYaw, pitch: this.lookPitch }; }

  /** 输入层传入鼠标增量；过场机位本身仍由时间轴唯一驱动。 */
  AddLook(deltaX = 0, deltaY = 0) {
    if (!this.AllowsLook) return this.Look;
    const scale = this.lookConfig.sensitivityScale * 0.002;
    // Three 的相机在 lookAt 后仍沿局部轴旋转：正 yaw 是画面向左，正 pitch 是
    // 画面向上。因此标准第一人称输入必须两轴都减 movement，不能只凭 Euler 数值
    // 的正负猜玩家实际看到的方向。
    this.lookYaw = ClampHeadLook(this.lookYaw - Number(deltaX || 0) * scale, this.lookConfig.yaw);
    this.lookPitch = ClampHeadLook(this.lookPitch - Number(deltaY || 0) * scale, this.lookConfig.pitch);
    return this.Look;
  }

  SetLook(yaw = 0, pitch = 0) {
    this.lookYaw = ClampHeadLook(yaw, this.lookConfig.yaw);
    this.lookPitch = ClampHeadLook(pitch, this.lookConfig.pitch);
    return this.Look;
  }

  SetNeutralLook(on = true) {
    this.lookNeutral = !!on;
    if (this.lookNeutral) { this.lookYaw = 0; this.lookPitch = 0; }
    return this.lookNeutral;
  }

  // -------------------------------------------------------------------------
  // DOM
  // -------------------------------------------------------------------------

  _BuildDom() {
    if (!this.doc || !this.rootHost) return;
    EnsureStyle(this.doc);
    const el = this.doc.createElement("div");
    el.className = "csRoot";
    el.innerHTML = `
      <div class="csBar top"></div>
      <div class="csBar bot"></div>
      <div class="csBlack"></div>
      <div class="csSubs"></div>
      <div class="csLine"></div>
      <div class="csSkip">ESC 跳过</div>
      <div class="csCard"></div>`;
    this.rootHost.appendChild(el);
    this.dom = {
      root: el,
      black: el.querySelector(".csBlack"),
      subs: el.querySelector(".csSubs"),
      line: el.querySelector(".csLine"),
      card: el.querySelector(".csCard"),
      skip: el.querySelector(".csSkip"),
    };
  }

  // -------------------------------------------------------------------------
  // 播放
  // -------------------------------------------------------------------------

  /**
   * 播一场。返回 Promise，播完（或跳过后卡片读完）才 resolve。
   * @param {string} id  CUTSCENES 的键
   * @param {object} ctx 可选：{ poolOut } 之类要塞进结算面板的运行时数值
   */
  Play(id, ctx = {}) {
    const cut = this.table[id];
    if (!cut) return Promise.reject(new Error(`没有这场过场：${id}`));
    const problems = ValidateCutscene(cut);
    // 时长对不上就直接炸，别让它带着错的节奏上线 —— 这类错在画面上看不出来。
    if (problems.length) throw new Error(`过场数据自检不过：\n${problems.join("\n")}`);
    // 上一场还没播完就被叫了下一场：把旧的 Promise 收掉，别让调用方挂死。
    if (this.playing) {
      const stale = this.resolve;
      const staleId = this.cut ? this.cut.id : null;
      this.resolve = null;
      this._Finish(true);
      if (stale) stale({ id: staleId, aborted: true });
    }

    this.cut = cut;
    this.ctx = ctx || {};
    this.time = 0;
    this.prevTime = 0;
    this.skipped = false;
    this.fired.clear();
    this.subSlots.length = 0;
    this.lineSlot = null;
    this.cardTime = -1;
    this.headLook = cut.cameraMode === "headLook"
      || (cut.shots || []).some((shot) => shot.cameraMode === "headLook" || shot.camera?.cameraMode === "headLook");
    this.lookConfig = ResolveHeadLookConfig(cut, null);
    this.lookNeutral = !!(this.ctx.neutralLook || this.ctx.forceNeutralLook || this.ctx.deterministicView);
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.walkConfig = cut.walk || null;
    this.walkOffset.set(0, 0, 0);
    this.walkBob = 0;
    this.walkKeys.clear();
    this._released = false;
    // fadeIn：从黑场淡入（开场过场用）。没写就是硬切进第一镜。
    this.blackAlpha = cut.fadeIn ? 1 : 0;
    this.shakeSeed = HashString(`shake:${id}`);
    // 台词时间轴：谁在什么时候说话。_ApplyActors 每帧查它来合成说话与转头，
    // 数据文件因此一个字都不用改（旋钮见类顶部的 static LIFE）。
    this.lineTimeline = CutsceneDirector.BuildLineTimeline(cut);
    this.playing = true;

    this._SaveCamera();
    this._SaveAudio(cut);
    // 天空要**先于**布景套：Global SH 强度与直射光都随这份预设一并落位。
    this.skyApplied = false;
    if (cut.sky && this.applySky) this.skyApplied = !!this.applySky(cut.sky);
    this._BuildSet(cut);
    if (this.hud && typeof this.hud.SetOrdersVisible === "function") this.hud.SetOrdersVisible(false);
    if (this.hud && typeof this.hud.SetCinematic === "function") this.hud.SetCinematic(true);
    if (this.onCapture) this.onCapture(cut);
    if (this.dom) {
      // 进场不走 0.35 s 的淡入过渡（黑场开场会透出后面的实景），退场再恢复
      this.dom.root.style.transition = "none";
      this.dom.root.classList.add("on");
      void this.dom.root.offsetWidth;
      this.dom.root.style.transition = "";
      this.dom.card.classList.remove("on");
      this.dom.card.innerHTML = "";
      this.dom.skip.style.display = "";
    }
    // 一进场先摆一帧，免得第一帧还停在玩家的机位上（会闪一下旧画面）。
    this.Update(0);
    return new Promise((resolve) => { this.resolve = resolve; });
  }

  _SaveAudio(cut) {
    if (!this.audio) return;
    const hasHeadLook = this.headLook;
    if (!hasHeadLook) return;
    this.savedAudio = {
      ambience: this.audio.ambiencePreset ?? null,
      music: this.audio.musicCue ?? null,
    };
    // 数据显式指定 ambience/ambienceCue 时才切床；未指定保持已保存环境。
    const ambience = cut.ambience ?? cut.ambienceCue;
    if (ambience && typeof this.audio.Ambience === "function") this.audio.Ambience(ambience);
    if (cut.stopMusic !== false) {
      if (typeof this.audio.StopMusic === "function") this.audio.StopMusic(0.25);
      else if (typeof this.audio.Music === "function") this.audio.Music(null);
    }
  }

  _RestoreAudio() {
    if (!this.savedAudio || !this.audio) return;
    const saved = this.savedAudio;
    if (typeof this.audio.Ambience === "function") this.audio.Ambience(saved.ambience || "silence");
    if (saved.music && typeof this.audio.Music === "function") this.audio.Music(saved.music);
    else if (!saved.music && typeof this.audio.StopMusic === "function") this.audio.StopMusic(0.25);
    this.savedAudio = null;
  }

  /** 跳过。字幕仍以卡片补出 —— 史实信息不许因为跳过而丢失。 */
  Skip() {
    if (!this.playing || this.skipped) return;
    this.skipped = true;
    this.StopCueAudio();
    const card = this._SkipCardOf(this.cut);
    this._TeardownSet();
    this._ClearText();
    this.blackAlpha = 1;
    if (card) this._ShowCard(card); else this._Finish(false);
  }

  Update(dt) {
    if (!this.playing) return;
    if (this.cardTime >= 0) {
      this.cardTime += dt;
      if (this.cardTime >= this.cardHold) this._Finish(false);
      return;
    }

    this.prevTime = this.time;
    this.time += dt;
    const cut = this.cut;

    // --- 定位当前镜 -------------------------------------------------------
    let start = 0;
    let shot = null;
    let local = 0;
    for (const s of cut.shots) {
      if (this.time < start + s.seconds || s === cut.shots[cut.shots.length - 1]) {
        shot = s; local = this.time - start; break;
      }
      start += s.seconds;
    }
    if (!shot) return;
    local = Clamp(local, 0, shot.seconds);
    this.curShot = shot;

    // 先摆人再摆机位：机位可以 lookActor / fromActor 跟着人走，人得先就位。
    this._ApplyActors(cut, dt);
    this._UpdateWalk(cut, dt);
    this._ApplyCamera(cut, shot, local);
    this._ApplyProps(cut, shot, local);
    this._FireCues(cut, shot, start, local);
    this._ApplyFlashes(cut, shot, start);
    this._ApplyBlack(shot, local, dt);
    this._TickText(dt);

    if (this.time >= cut.seconds) {
      // 正常播完：还有 epilogueCard 的（王铭章那场并列史源装不下三秒）先补卡片。
      this._TeardownSet();
      this._ClearText();
      if (cut.epilogueCard) { this.blackAlpha = 1; this._ShowCard(cut.epilogueCard); return; }
      if (cut.tally) { this.blackAlpha = 1; this._ShowCard(this._TallyCard(cut)); return; }
      this._Finish(false);
    }
  }

  // -------------------------------------------------------------------------
  // 布景
  // -------------------------------------------------------------------------

  _BuildSet(cut) {
    const origin = cut.setOrigin || [0, 0, 0];
    this.setRoot = new THREE.Group();
    this.setRoot.name = `Cutscene_${cut.id}`;
    this.setRoot.position.set(origin[0], origin[1], origin[2]);
    this.scene.add(this.setRoot);
    this.origin = new THREE.Vector3(origin[0], origin[1], origin[2]);

    for (const spec of cut.props || []) {
      if (spec.probeOnly && !this.includeProbeProps) continue;
      const mesh = this._MakeProp(spec);
      if (!mesh) continue;
      this.setRoot.add(mesh);
      const light = mesh.children.find((c) => c.isPointLight) || null;
      this.props.set(spec.name || `prop${this.props.size}`, {
        mesh, base: mesh.position.clone(), baseRot: mesh.rotation.clone(),
        light, lightBase: light ? light.intensity : 0,
        flicker: spec.light && spec.light.flicker ? Clamp01(spec.light.flicker) : 0,
        flickerSeed: HashString(`flicker:${spec.name || this.props.size}`) % 100,
      });
    }

    if (this.actorFactory) {
      for (const spec of cut.cast || []) {
        let actor = null;
        try {
          actor = this.actorFactory.Create(spec.kind || "nra", {
            seed: spec.seed || spec.id,
            uniformHex: spec.uniformHex,
            trouserHex: spec.trouserHex,
            accessoryHex: spec.accessoryHex,
          });
        } catch (error) {
          console.warn(`[Cutscene] ${cut.id}: 造 ${spec.id} 失败 —— ${String(error).slice(0, 160)}`);
          continue;
        }
        // **weapon:null 必须真的调一次 SetWeapon(null)。** 不调的话 Actor 会挂上
        // KIND_SPEC 里的 defaultWeapon（中正式），于是「王铭章手里是望远镜不是枪」
        // 和「每三人里有一人空着手」这两条都当场作废 —— 后者是史实点，不是美术偏好。
        if ("weapon" in spec && typeof actor.SetWeapon === "function") actor.SetWeapon(spec.weapon || null);
        // 第一人称过场仍使用完整 Actor 身体和同一套坐/走动画；只把头部网格隐藏，
        // 避免相机在眼位附近看见自己的脸内壁。胸、臂、腿、装具都继续可见，
        // 所以低头时玩家明确是一名普通士兵，而不是悬空摄影机。
        if (spec.firstPerson && actor.neck && typeof actor.neck.traverse === "function") {
          actor.neck.traverse((node) => {
            if (node && node.isMesh) node.visible = false;
          });
          actor.firstPerson = true;
        }
        // 独立车厢没有接进正片地形的 groundProbe；让它去采远处 L0 的高度会把
        // 脚踝拉进钢地板。车厢地板是平的，按数据给 root 的脚底高度即可。
        actor.allowFootIk = false;
        actor.root.visible = false;
        this.setRoot.add(actor.root);
        this.actors.set(spec.id, { actor, spec });
      }
    }

    this._AttachActorProps(cut);

    this._BuildFlashPool();
    this._BuildGunsight();
  }

  /**
   * 把分镜道具挂到演员暴露的通用挂点（eyes/weaponMount/arms 等）上。
   * 不猜鞋、枪或线盘的骨骼名称；若 Actor 没有该挂点，道具留在布景根下并告警，
   * 这样无模型/旧 Actor 仍能稳定播完。
   */
  _AttachActorProps(cut) {
    const requests = [];
    for (const spec of cut.props || []) {
      if (spec.attachTo || spec.actorId || spec.mount) requests.push({ ...spec, actorId: spec.attachTo?.actor || spec.actorId, mount: spec.attachTo?.mount || spec.mount });
    }
    for (const actorSpec of cut.cast || []) {
      const attachments = Array.isArray(actorSpec.attachments) ? actorSpec.attachments
        : (Array.isArray(actorSpec.mounts) ? actorSpec.mounts : []);
      for (const attachment of attachments) {
        requests.push({ ...attachment, actorId: actorSpec.id });
      }
    }
    for (const request of cut.actorProps || cut.attachments || []) requests.push(request);
    for (const request of requests) {
      const actorEntry = this.actors.get(request.actorId || request.actor);
      const propEntry = this.props.get(request.name || request.prop || request.propName);
      if (!actorEntry || !propEntry) continue;
      const mount = this._ActorMount(actorEntry.actor, request.mount || request.mountName);
      if (!mount || typeof mount.add !== "function") {
        console.warn(`[Cutscene] ${cut.id}: 演员 ${request.actorId || request.actor} 没有挂点 ${request.mount || request.mountName}`);
        continue;
      }
      const mesh = propEntry.mesh;
      if (mesh.parent) mesh.parent.remove(mesh);
      mount.add(mesh);
      mesh.position.set(...(request.offset || request.pos || [0, 0, 0]));
      const rotation = request.rotation || [request.rx || 0, request.ry || 0, request.rz || 0];
      mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
      propEntry.attached = { actorId: request.actorId || request.actor, mount: request.mount || request.mountName };
    }
  }

  _ActorMount(actor, name) {
    if (!actor || !name) return null;
    if (typeof actor.GetMount === "function") {
      const exposed = actor.GetMount(name);
      if (exposed && typeof exposed.add === "function") return exposed;
    }
    const direct = actor[name];
    if (direct && typeof direct.add === "function") return direct;
    const mounts = actor.mounts || actor.mountPoints;
    const named = mounts && mounts[name];
    if (named && typeof named.add === "function") return named;
    if (actor.root && typeof actor.root.getObjectByName === "function") {
      const found = actor.root.getObjectByName(name);
      if (found && typeof found.add === "function") return found;
    }
    return null;
  }

  _MakeModelProp(spec) {
    const group = new THREE.Group();
    group.name = spec.name || "modelProp";
    group.position.set(spec.pos[0], spec.pos[1], spec.pos[2]);
    if (spec.rx) group.rotation.x = spec.rx;
    if (spec.ry) group.rotation.y = spec.ry;
    if (spec.rz) group.rotation.z = spec.rz;
    if (spec.scale) group.scale.setScalar(spec.scale);

    CUTSCENE_MODEL_LOADER.load(spec.url, (gltf) => {
      // 跳过/结束时 setRoot 已移出场景就不再补挂模型，避免异步回调把旧布景复活。
      if (!group.parent) return;
      gltf.scene.traverse((object) => {
        if (!object.isMesh) return;
        object.castShadow = spec.castShadow === undefined ? true : !!spec.castShadow;
        object.receiveShadow = spec.receiveShadow === undefined ? true : !!spec.receiveShadow;
        if (object.geometry) this.ownedGeometries.push(object.geometry);
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.filter(Boolean).forEach((material) => this.ownedMaterials.push(material));
      });
      group.add(gltf.scene);
    }, undefined, (error) => {
      console.warn(`[Cutscene] ${this.cut?.id || "unknown"}: 读取 ${spec.name || "model"} 失败 —— ${String(error).slice(0, 160)}`);
    });
    return group;
  }

  _MakeProp(spec) {
    if (spec.kind === "model") return this._MakeModelProp(spec);
    const size = spec.size || [1, 1, 1];
    let geometry = null;
    // 贴图按**世界尺寸**铺：一张 Ground 是 2.6 m、一张砖是 1.2 m。Box/Plane 的 UV
    // 默认每面 0—1，不按尺寸重算的话 7 m 的墙就是七块巨砖、140 m 的地是一片拉丝
    //（出川那张地面、最后一电那面墙都是这么来的）。spec.repeat 给了就按它来。
    const tile = spec.mat ? (TILE_BY_RECIPE[spec.mat] || 1.0) : 1.0;
    if (spec.kind === "cyl") {
      geometry = new THREE.CylinderGeometry(size[0], size[0], size[1], 14, 1);
      if (spec.mat && spec.repeat === undefined) {
        const uv = geometry.attributes.uv;
        const around = (2 * Math.PI * size[0]) / tile, tall = size[1] / tile;
        for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * around, uv.getY(i) * tall);
        uv.needsUpdate = true;
      }
    } else if (spec.kind === "plane") {
      geometry = new THREE.PlaneGeometry(size[0], size[1]);
      geometry.rotateX(-Math.PI / 2);
      if (spec.mat && spec.repeat === undefined) {
        const uv = geometry.attributes.uv;
        for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * (size[0] / tile), uv.getY(i) * (size[1] / tile));
        uv.needsUpdate = true;
      }
    } else if (spec.kind === "heightTerrain") {
      geometry = BuildHeightTerrainGeometry(spec.terrain || {});
    } else if (spec.kind === "backdrop") {
      // 车窗外的远山层是竖直的，不可沿用 ground plane 的 -90° 旋转。
      // 它只承担最远层云山并盖住世界默认天空／地平线；近中景仍由独立实体构成。
      geometry = new THREE.PlaneGeometry(size[0], size[1]);
    } else {
      geometry = new THREE.BoxGeometry(size[0], size[1], size[2] ?? size[0]);
      if (spec.mat && spec.repeat === undefined) {
        ScaleBoxUv(geometry, size[0], size[1], size[2] ?? size[0], tile, spec.name || "prop");
      }
    }
    this.ownedGeometries.push(geometry);

    let material = null;
    if (spec.texture) {
      const texture = new THREE.TextureLoader().load(spec.texture);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.anisotropy = 4;
      material = new THREE.MeshStandardMaterial({
        map: texture, color: spec.color ?? 0xffffff, roughness: spec.roughness ?? 0.98,
        metalness: spec.metalness ?? 0, side: spec.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
      });
      this.ownedMaterials.push(material);
    }
    if (spec.mat && this.library && typeof this.library.Get === "function") {
      // repeat：贴图在这块几何上铺几遍。Box/Plane 的 UV 是每面 0—1，一张 2 m 的
      // 土路纹理铺满 140 m 的地面就是一片拉丝（出川那张地面的「流水纹」就是它）。
      // 按「几何尺寸 ÷ 贴图的物理尺寸（约 2 m）」给 repeat，地面才像地面。
      const options = {};
      if (spec.repeat !== undefined) options.repeat = spec.repeat;
      // props 的旧数据多写的是 color，而材质库的调色旋钮叫 color；此前只认
      // tint，导致车窗外层的深色土野被程序地面贴图冲成一整块发白幕布。
      if (spec.tint !== undefined || spec.color !== undefined) options.color = spec.tint ?? spec.color;
      if (spec.roughness !== undefined) options.roughness = spec.roughness;
      if (spec.doubleSided) options.side = THREE.DoubleSide;
      try { material = this.library.Get(spec.mat, options); } catch (error) { material = null; }
    }
    if (!material || spec.inside || spec.emissive) {
      // 需要 BackSide 或自发光时不能直接用库里的共享材质 —— 一改就改到全场。
      const base = material ? material.clone() : new THREE.MeshStandardMaterial({
        color: spec.color ?? 0x8a8274, roughness: 0.92, metalness: 0.0,
      });
      if (spec.color !== undefined && !material) base.color.setHex(spec.color);
      if (spec.emissive !== undefined) {
        base.emissive = new THREE.Color(spec.emissive);
        base.emissiveIntensity = 1.0;
      }
      // inside:true → 翻成 BackSide。摄影机在盒子里时默认剔除背面会直接穿出去，
      // 「车厢内全黑」会变成大白天 —— CS_Chuchuan 镜 6 就是靠这个成立的。
      if (spec.inside) base.side = THREE.BackSide;
      material = base;
      this.ownedMaterials.push(base);
    }
    const mesh = new THREE.Mesh(geometry, material);
    // 自发光只是**让自己亮**，照不亮旁边的东西（没有 GI）。
    // 「台灯是唯一光源」「油灯」「门缝一条光」这三处要真的照亮屋子，
    // 就必须挂一盏点光 —— 少了它，三场室内戏在 night 预设下是纯黑的，
    // 而且看不出是 bug，只会以为「夜景就这样」。
    if (spec.light) {
      // decay 默认 2（物理正确的平方反比）—— 但「远处城头一片火照亮几十米外的
      // 麦地」这种气氛光按平方反比在 40 m 外就归零了。给数据一个旋钮：
      // decay 1 是线性衰减，0 是完全不衰减（只受 distance 截断）。
      const light = new THREE.PointLight(
        spec.light.color ?? 0xffd9a0, spec.light.intensity ?? 8, spec.light.distance ?? 8,
        spec.light.decay ?? 2);
      light.position.set(0, spec.light.offsetY ?? 0, 0);
      mesh.add(light);
    }
    mesh.position.set(spec.pos[0], spec.pos[1], spec.pos[2]);
    if (spec.rx) mesh.rotation.x = spec.rx;
    if (spec.ry) mesh.rotation.y = spec.ry;
    if (spec.rz) mesh.rotation.z = spec.rz;   // 挂钟指针、斜靠的东西都要它
    mesh.castShadow = spec.castShadow === undefined ? !spec.inside : !!spec.castShadow;
    mesh.receiveShadow = spec.receiveShadow === undefined ? true : !!spec.receiveShadow;
    mesh.name = spec.name || "prop";
    return mesh;
  }

  /**
   * 枪口焰：加性贴片，四个一池轮着用。
   * **建完立刻 MarkNoPrepass** —— 加性/半透明的东西不做这一步，
   * 深度法线预通道会拿 overrideMaterial 把它一起覆盖掉，
   * 预通道里蹦出糊在原点的方块，SSAO 与体积光的天空判据跟着废。
   */
  _BuildFlashPool() {
    const geometry = new THREE.PlaneGeometry(1, 1);
    this.ownedGeometries.push(geometry);
    // 径向渐变的 alpha 图：没有它，加性方片近看是几个套着的方块、远看是一块淡方晕
    //（王铭章过场反打那一镜抓到的）。64×64 的 Canvas 一张，四片共用。
    if (!this.flashTexture && typeof document !== "undefined") {
      const canvas = document.createElement("canvas");
      canvas.width = 64; canvas.height = 64;
      const ctx = canvas.getContext("2d");
      const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0.0, "rgba(255,255,255,1)");
      grad.addColorStop(0.25, "rgba(255,240,200,0.85)");
      grad.addColorStop(0.6, "rgba(255,200,120,0.25)");
      grad.addColorStop(1.0, "rgba(255,160,60,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);
      // 十字星芒：两条细亮线
      ctx.fillStyle = "rgba(255,245,220,0.55)";
      ctx.fillRect(0, 30, 64, 4);
      ctx.fillRect(30, 0, 4, 64);
      this.flashTexture = new THREE.CanvasTexture(canvas);
      this.flashTexture.colorSpace = THREE.SRGBColorSpace;
    }
    for (let i = 0; i < 4; i += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xffd9a0, blending: THREE.AdditiveBlending, map: this.flashTexture || null,
        transparent: true, opacity: 0, depthWrite: false, fog: false,
      });
      MarkNoPrepass(material);
      this.ownedMaterials.push(material);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.setRoot.add(mesh);
      this.flashPool.push(mesh);
    }
  }

  /**
   * 敌方视角那一镜要的「枪管前端与准星」。**不给日兵的脸** ——
   * 不把那一枪人格化，是 CS_WangMingzhang 的红线之一。
   * 贴在相机前，不进 setRoot（setRoot 有 setOrigin 偏移）。
   */
  _BuildGunsight() {
    const group = new THREE.Group();
    group.visible = false;
    const barrelGeo = new THREE.CylinderGeometry(0.022, 0.024, 0.34, 10);
    barrelGeo.rotateX(Math.PI / 2);
    const postGeo = new THREE.BoxGeometry(0.006, 0.030, 0.006);
    this.ownedGeometries.push(barrelGeo, postGeo);
    const metal = new THREE.MeshBasicMaterial({ color: 0x14120f, fog: false });
    this.ownedMaterials.push(metal);
    const barrel = new THREE.Mesh(barrelGeo, metal);
    barrel.position.set(0, -0.055, -0.30);
    const post = new THREE.Mesh(postGeo, metal);
    post.position.set(0, -0.030, -0.455);
    group.add(barrel, post);
    group.frustumCulled = false;
    this.scene.add(group);
    this.gunsight = group;
  }

  _TeardownSet() {
    if (this.setRoot) { this.scene.remove(this.setRoot); }
    for (const { actor } of this.actors.values()) {
      if (typeof actor.Dispose === "function") actor.Dispose();
    }
    this.actors.clear();
    this.props.clear();
    this._actorFrame.length = 0;
    this._actorFrameById.clear();
    this.flashPool.length = 0;
    if (this.gunsight) { this.scene.remove(this.gunsight); this.gunsight = null; }
    for (const g of this.ownedGeometries) g.dispose();
    for (const m of this.ownedMaterials) m.dispose();
    this.ownedGeometries.length = 0;
    this.ownedMaterials.length = 0;
    this.setRoot = null;
  }

  // -------------------------------------------------------------------------
  // 每帧
  // -------------------------------------------------------------------------

  _SaveCamera() {
    this.savedCamera = {
      position: this.camera.position.clone(),
      quaternion: this.camera.quaternion.clone(),
      fov: this.camera.fov,
      near: this.camera.near,
      far: this.camera.far,
    };
  }

  _RestoreCamera() {
    if (!this.savedCamera) return;
    this.camera.position.copy(this.savedCamera.position);
    this.camera.quaternion.copy(this.savedCamera.quaternion);
    this.camera.fov = this.savedCamera.fov;
    this.camera.near = this.savedCamera.near;
    this.camera.far = this.savedCamera.far;
    this.camera.updateProjectionMatrix();
    this.savedCamera = null;
  }

  _ApplyCamera(cut, shot, local) {
    const cam = shot.camera;
    const shotHeadLook = shot.cameraMode === "headLook"
      || cam.cameraMode === "headLook" || cut.cameraMode === "headLook";
    this.headLook = shotHeadLook;
    if (shotHeadLook) this.lookConfig = ResolveHeadLookConfig(cut, shot);
    const k = shot.seconds > 0 ? local / shot.seconds : 1;
    const e = Ease(cam.ease, k);
    const o = this.origin;

    const from = cam.from;
    const to = cam.to || cam.from;
    const look = cam.look || [from[0], from[1], from[2] - 1];
    const lookTo = cam.lookTo || look;

    // 机位/被摄物可以锚在演员身上：fromActor / lookActor 给演员 id，
    // from/look 这时是**相对那个演员脚下**的偏移（世界轴向，不随他转身）。
    // 好处是跟拍/反打不用逐秒反算坐标 —— 人走到哪，镜头就跟到哪。
    const anchorFrom = cam.fromActor ? this._ActorLocalPos(cam.fromActor) : null;
    const anchorLook = cam.lookActor ? this._ActorLocalPos(cam.lookActor) : null;
    const fx = anchorFrom ? anchorFrom.x : 0, fy = anchorFrom ? anchorFrom.y : 0, fz = anchorFrom ? anchorFrom.z : 0;
    const lx = anchorLook ? anchorLook.x : 0, ly = anchorLook ? anchorLook.y : 0, lz = anchorLook ? anchorLook.z : 0;

    this.camera.position.set(
      o.x + fx + Lerp(from[0], to[0], e) + this.walkOffset.x,
      o.y + fy + Lerp(from[1], to[1], e) + this.walkBob,
      o.z + fz + Lerp(from[2], to[2], e) + this.walkOffset.z,
    );
    const target = new THREE.Vector3(
      o.x + lx + Lerp(look[0], lookTo[0], e) + this.walkOffset.x,
      o.y + ly + Lerp(look[1], lookTo[1], e),
      o.z + lz + Lerp(look[2], lookTo[2], e) + this.walkOffset.z,
    );
    // 近平面：微距特写（85 mm 打 0.4 m 外的纸）默认 0.08 也够，但长焦回望
    // 300 m 外的城墙时把 near 抬起来能省一大截深度精度。按机位到被摄物的距离给。
    const dist = this.camera.position.distanceTo(target);
    // 近平面按被摄距离给，长焦回望 300 m 外的城墙时能省一大截深度精度。
    // 但**带准星的镜子例外**：准星贴在镜头前 0.3—0.5 m，near 一抬就整个被切掉，
    // 画面上表现为「准星没了」，而不是报错 —— 这类 bug 只能靠出图发现。
    this.camera.near = shot.gunsight ? 0.02 : Clamp(dist * 0.03, 0.03, 1.2);
    this.camera.fov = FovFromFocalMm(shot.focalMm);
    // 远平面：正片按关给（L5 收到 400 m 是为了压 draw call），但过场常要拍
    // 几百米外的城墙剪影 —— 远处的大布景会在远平面上被硬切出一个断头。
    // shot.cameraFar / cut.cameraFar 给了就用它，播完 _RestoreCamera 还原。
    const wantFar = shot.cameraFar ?? (this.cut && this.cut.cameraFar) ?? this.savedCamera?.far;
    // shot A 的 cameraFar 不能泄漏进 shot B。以前只在“有覆盖值”时写，切到没写
    // cameraFar 的下一镜仍沿用上一镜，远景会忽然被裁掉或深度精度骤降。
    if (wantFar && this.camera.far !== wantFar) this.camera.far = wantFar;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(target);

    // 手持晃动。**不许 Math.random** —— 用 ValueNoise2，同一时刻永远同一个值，
    // 出图才可复现（视觉审查靠比对同一帧，随机抖动等于每次给一张新图）。
    let amount = shot.camera.shake || 0;
    for (const burst of shot.shakeAt || []) {
      if (local >= burst.at && local < burst.at + burst.seconds) {
        const decay = 1 - (local - burst.at) / burst.seconds;
        amount = Math.max(amount, (burst.amount || 0.5) * decay);
      }
    }
    if (amount > 0) {
      const t = this.time * 2.7;
      const n = (u, v) => ValueNoise2(t * u, v, this.shakeSeed) - 0.5;
      this.camera.rotateX(n(1.0, 3.1) * 0.020 * amount);
      this.camera.rotateY(n(0.83, 11.7) * 0.024 * amount);
      this.camera.rotateZ(n(0.61, 23.5) * 0.030 * amount);
      this.camera.translateY(n(1.31, 41.3) * 0.020 * amount);
      this.camera.translateX(n(1.13, 57.9) * 0.016 * amount);
    }

    // 第一人称编排步行的确定性脚步起伏。它只服务导演写死的出门路径，和 WASD 的
    // walkBob 分开：纵向每步抬落、横向轻微换重心，最后一段按 fadeOut 停稳。
    const gait = cam.walkBob;
    if (gait) {
      const frequency = Math.max(0.1, Number(gait.frequency) || 1.8);
      const amplitude = Math.max(0, Number(gait.amount) || 0.018);
      const fadeIn = Math.max(0, Number(gait.fadeIn) || 0);
      const fadeOut = Math.max(0, Number(gait.fadeOut) || 0);
      let blend = 1;
      if (fadeIn > 0) blend *= Clamp01(local / fadeIn);
      if (fadeOut > 0) blend *= Clamp01((shot.seconds - local) / fadeOut);
      const phase = this.time * frequency * Math.PI * 2;
      this.camera.translateY(Math.abs(Math.sin(phase)) * amplitude * blend);
      this.camera.translateX(Math.sin(phase * 0.5) * amplitude * 0.45 * blend);
    }

    // 导演机位完成后再叠加玩家 Look；不修改 from/to/look 时间轴，也不让 Look
    // 影响下一镜的基准。neutralLook 给截图与测试一个完全确定的中性视角。
    if (shotHeadLook && !this.lookNeutral) {
      this.camera.rotateY(this.lookYaw);
      this.camera.rotateX(this.lookPitch);
    }

    if (this.gunsight) {
      this.gunsight.visible = !!shot.gunsight;
      if (shot.gunsight) {
        this.gunsight.position.copy(this.camera.position);
        this.gunsight.quaternion.copy(this.camera.quaternion);
        // 准星是**屏幕空间**的东西：它该占画幅的几分之几，与镜头焦距无关。
        // 几何是按 50 mm（半角 13.5°）搭的，换到 200 mm（半角 3.44°）就得缩到
        // tan(3.44°)/tan(13.5°)=0.25，不然一根枪管会撑满整个长焦画面。
        const halfFov = (this.camera.fov * Math.PI) / 360;
        this.gunsight.scale.setScalar(Math.tan(halfFov) / Math.tan((13.5 * Math.PI) / 180));
      }
    }
  }

  /** 某演员此刻在布景局部系里的脚下位置（没这个人 / 还没上场 → null）。 */
  _ActorLocalPos(id) {
    const entry = this.actors.get(id);
    if (!entry) {
      // 没造出 Actor（无工厂 / 造失败）时退回轨道采样，机位至少不会飞到原点
      const spec = (this.cut.cast || []).find((c) => c.id === id);
      if (!spec) return null;
      const sample = SampleTrack(spec.track, this.time);
      return sample.pos ? { x: sample.pos[0], y: sample.pos[1], z: sample.pos[2] } : null;
    }
    const p = entry.actor.root.position;
    return { x: p.x, y: p.y, z: p.z };
  }

  /**
   * 摆人。两遍：
   *   一遍把所有人放到位并记下头的高度 —— 听者要转头看说话的人，得先知道他在哪；
   *   二遍算每个人的 `talking` 与自动 `lookYaw/lookPitch`，再喂给 Actor.Update。
   *
   * **全部是 this.time 的闭式函数，不逐帧积分。** 出图脚本用 StepFrames 手动推时钟、
   * 而且可以从任意时刻抓帧；只要有一个量是「上一帧的状态 × 衰减」，同一秒抓两次
   * 就会得到两张不同的图，视觉审查立刻失去比较的基准。相位一律来自演员的 idlePhase，
   * 这里不摇任何随机数（文件头第 2 条）。
   */
  _ApplyActors(cut, dt) {
    const L = CutsceneDirector.LIFE;
    const now = this.time;
    const frame = this._actorFrame || (this._actorFrame = []);
    frame.length = 0;
    const byId = this._actorFrameById || (this._actorFrameById = new Map());
    byId.clear();

    for (const { actor, spec } of this.actors.values()) {
      const sample = SampleTrack(spec.track, now);
      if (sample.hidden || !sample.pos) { actor.root.visible = false; continue; }
      actor.root.visible = true;
      actor.root.position.set(sample.pos[0], sample.pos[1], sample.pos[2]);
      actor.root.rotation.y = sample.ry;
      const state = { ...sample.state, elapsed: now };
      delete state.hidden;
      const item = {
        actor, spec, state,
        x: sample.pos[0], z: sample.pos[2], ry: sample.ry || 0,
        headY: CutsceneDirector.ActorHeadY(actor, sample),
        // 个体错开的三个 0—1 种子。用 idlePhase 折出来，不另摇随机数。
        seed: ((actor.idlePhase || 0) / (Math.PI * 2)) % 1,
      };
      item.seed2 = (item.seed * 7.13) % 1;
      item.seed3 = (item.seed * 3.77) % 1;
      item.talk = 0;
      item.listen = null;
      frame.push(item);
      byId.set(spec.id, item);
    }

    const timeline = this.lineTimeline;
    if (timeline && timeline.length) {
      for (const line of timeline) {
        // 画外音（off:true）不驱动任何人：说话的人根本不在画面里，
        // 让他在别处点头是白费的，让全车朝他转头则是错的。
        if (line.off || !line.target) continue;
        if (now <= line.at - 0.05 || now >= line.end + L.listenHold + 1.8) continue;
        const speaker = byId.get(line.target);
        if (!speaker) continue;

        if (!line.chorus) {
          // 具名台词：说话的那个人自己动
          speaker.talk = Math.max(speaker.talk, CutsceneDirector.TalkEnvelope(now, line.at, line.end));
        }

        for (const item of frame) {
          if (item === speaker) continue;
          const dx = speaker.x - item.x;
          const dz = speaker.z - item.z;
          const flat = Math.hypot(dx, dz);
          const s = item.state;
          const still = (s.moveSpeed || 0) < 0.05;
          const awake = (s.sleep || 0) <= 0.5;
          const calm = !s.dead && (s.hurt || 0) < 0.05 && (s.dying || 0) < 0.05
            && (s.aim || 0) < 0.05 && (s.melee || 0) < 0.05 && (s.throwing || 0) < 0.05
            && (s.prone || 0) < 0.05;

          if (line.chorus) {
            // 群体应答：车厢里坐着/站着的人先后开口，幅度打五折、按 idlePhase 错开。
            // 「先后」是这一段的全部读数 —— 一起张嘴是合唱团，不是一车兵。
            if (!still || !awake || !calm || flat > L.chorusRadius) continue;
            const delay = item.seed2 * 0.55;
            item.talk = Math.max(item.talk,
              CutsceneDirector.TalkEnvelope(now, line.at, line.end, delay) * L.chorusTalk);
          }

          // 转头看说话的人。数据显式管着这个人的头就不插手（其余四场全是这种）。
          if (!still || !awake || !calm || CutsceneDirector.SpecDeclaresLook(item.spec)) continue;
          if (flat > L.listenFar) continue;
          const near = 1 - Clamp01((flat - L.listenNear) / Math.max(1e-3, L.listenFar - L.listenNear));
          if (near <= 0.001) continue;
          const delay = 0.10 + item.seed * 0.30;
          const hold = L.listenHold + item.seed3 * 0.7;
          const env = CutsceneDirector.ListenEnvelope(now, line.at, line.end, delay, hold) * near;
          if (env <= 0.001) continue;
          // 符号：Actor 正面是局部 −Z，总偏航 = atan2(−dx, −dz)；lookYaw 是相对
          // root 朝向的**增量**（chest 吃 0.35、neck 吃 0.65，加起来正好是它）。
          const want = CutsceneDirector.WrapAngle(Math.atan2(-dx, -dz) - item.ry);
          const cap = L.yawMin + item.seed3 * L.yawSpan;
          // lookPitch 正 = 抬头（docs/Data_CutsceneRedo.md §1.8 那条写死的规矩）
          const rise = Math.atan2(speaker.headY - item.headY, Math.max(0.35, flat));
          const yaw = Clamp(want, -cap, cap) * env;
          const pitch = Clamp(rise, -L.pitchMax, L.pitchMax) * env;
          // 换人说话时是**交叉淡入**，不是「谁的包络大谁赢」。
          // 时间轴按 at 升序，所以 item.listen 里一定是更早的那一句：让新的一句
          // 按自己的包络压过去，旧的一句留 (1−env) 的余韵。
          //
          // 取最大值那一版在这里栽过：上一句刚说完、余韵还有 0.3，新的一句才
          // 刚起（0.2），于是余韵赢了 —— 而余韵指向的往往正是「不用转头」的
          // 那个方向（对面座位），画面上就是「新说话的人没人理」。
          const prev = item.listen;
          item.listen = prev ? {
            env: Math.max(env, prev.env * (1 - env)),
            yaw: yaw + prev.yaw * (1 - env),
            pitch: pitch + prev.pitch * (1 - env),
          } : { env, yaw, pitch };
        }
      }
    }

    for (const item of frame) {
      const state = item.state;
      if (item.talk > 0.001) state.talking = item.talk;
      if (item.listen) {
        state.lookYaw = item.listen.yaw;
        state.lookPitch = item.listen.pitch;
        // 告诉 Actor 这份朝向是引擎合成的，不是导演写的 —— 说话的头部微动
        // 因此仍可满幅叠上去（导演写死的朝向则只留抖动，不许被改朝向）。
        state.lookAuto = true;
      }
      item.actor.Update(dt, state);
    }
  }

  /** 车厢小空间的受限步行：WASD/方向键可走，但绝不穿过侧墙或关着的车门。 */
  _UpdateWalk(cut, dt) {
    const config = cut.walk;
    if (!config || this.lookNeutral || this.time < (config.startAt || 0)) {
      // 解锁前只屏蔽位移，不吞按键；玩家若正按着 W，班长话音落下后应自然开始走，
      // 不能逼他松开再按一次。
      this.walkBob = 0;
      return;
    }
    const down = (a, b) => this.walkKeys.has(a) || this.walkKeys.has(b);
    const strafe = (down("d", "arrowright") ? 1 : 0) - (down("a", "arrowleft") ? 1 : 0);
    const forward = (down("w", "arrowup") ? 1 : 0) - (down("s", "arrowdown") ? 1 : 0);
    const moving = strafe !== 0 || forward !== 0;
    if (moving) {
      const length = Math.hypot(strafe, forward);
      // 车厢的导演镜头统一朝局部 +Z；此时画面右侧是局部 -X。上一版直接把
      // D 加到 +X，结果左右必反。这里把按键明确换成相机平面的前/右轴。
      const x = -strafe / length;
      const z = forward / length;
      const speed = Number(config.speed) || 2;
      const min = config.min || [-3, -7];
      const max = config.max || [3, 7];
      this.walkOffset.x = Clamp(this.walkOffset.x + x * speed * dt, min[0], max[0]);
      this.walkOffset.z = Clamp(this.walkOffset.z + z * speed * dt, min[1], max[1]);
      this.walkBob = Math.sin(this.time * 11.5) * 0.018;
    } else this.walkBob *= Math.max(0, 1 - dt * 12);
  }

  _ApplyProps(cut, shot, local) {
    // 每帧先把所有道具放回基准位，再叠加本镜的位移 ——
    // 否则上一镜的位移会留在道具身上，切回来道具就飘在半空。
    for (const entry of this.props.values()) {
      if (entry.attached) continue;
      entry.mesh.position.copy(entry.base);
      if (entry.baseRot) entry.mesh.rotation.copy(entry.baseRot);
    }
    // 车窗外的近／中／远景按全局时钟移动。局部镜头（如小站）仍可在下面
    // 用 propMoves 覆盖，以保证关键叙事经过站台时有精确构图。
    for (const move of cut.ambientMotion || []) {
      const entry = this.props.get(move.name);
      if (!entry || entry.attached || !Array.isArray(move.from) || !Array.isArray(move.axis)) continue;
      // 到站后不能让窗外景物继续掠过。用钳住的全局时间而不是把 speed
      // 直接置零，保证停下的那一帧正好接续此前的位置、没有循环层跳变。
      const motionTime = move.stopAt === undefined ? this.time : Math.min(this.time, move.stopAt);
      const distance = motionTime * (Number(move.speed) || 0);
      // 早期出川序章把每一根电杆按 18 m 回卷；同一根杆和同一棵树每两三秒
      // 从窗后跳回，哪怕远中近三层速度不同也还是一眼能看出“循环贴图”。
      // 连续行程的道具由数据预先铺到整段 99 秒的铁路上，永不回卷；驶出窗框后
      // 仅由相机裁掉。保留 loop 默认值，避免影响其他过场的短循环装饰。
      const span = Math.max(0.01, Number(move.span) || 1);
      const d = move.loop === false
        ? distance
        : ((distance % span) + span) % span;
      entry.mesh.position.set(
        move.from[0] + move.axis[0] * d,
        move.from[1] + move.axis[1] * d,
        move.from[2] + move.axis[2] * d,
      );
    }
    // 同一道具可以给多段位移（先掉到地上再滑、震一下再回弹）：只让**已经开始**的那
    // 一段里最晚开始的生效。原来是「数组里最后一条赢」—— 第二段在自己 startAt 之前
    // 会拿 from 把第一段盖掉，两段动作永远做不成。
    const active = new Map();
    for (const move of shot.propMoves || []) {
      const startAt = move.startAt || 0;
      if (local < startAt) continue;
      const prev = active.get(move.name);
      if (!prev || (prev.startAt || 0) <= startAt) active.set(move.name, move);
    }
    for (const move of active.values()) {
      const entry = this.props.get(move.name);
      if (!entry) continue;
      // 挂载道具的坐标属于演员挂点，不受布景局部 propMoves 重置。
      if (entry.attached) continue;
      const k = Clamp01((local - (move.startAt || 0)) / Math.max(1e-6, (move.endAt || 1) - (move.startAt || 0)));
      const e = Ease(move.ease, k);
      entry.mesh.position.set(
        Lerp(move.from[0], move.to[0], e),
        Lerp(move.from[1], move.to[1], e),
        Lerp(move.from[2], move.to[2], e),
      );
      // 可选：rotFrom/rotTo [rx,ry,rz]（弧度），摔下来的东西能翻个面
      if (move.rotFrom || move.rotTo) {
        const r0 = move.rotFrom || [entry.mesh.rotation.x, entry.mesh.rotation.y, entry.mesh.rotation.z];
        const r1 = move.rotTo || r0;
        entry.mesh.rotation.set(Lerp(r0[0], r1[0], e), Lerp(r0[1], r1[1], e), Lerp(r0[2], r1[2], e));
      }
    }
    // 火光闪烁：light.flicker 给了幅度（0—1），点光强度按确定性噪声抖
    for (const entry of this.props.values()) {
      if (!entry.light || !entry.flicker) continue;
      const n = ValueNoise2(this.time * 9.0, entry.flickerSeed, this.shakeSeed) - 0.5;
      const n2 = ValueNoise2(this.time * 23.0, entry.flickerSeed + 7.3, this.shakeSeed) - 0.5;
      entry.light.intensity = entry.lightBase * (1 + (n * 0.7 + n2 * 0.3) * 2 * entry.flicker);
    }
  }

  _ApplyFlashes(cut, shot, shotStart) {
    for (const mesh of this.flashPool) { mesh.visible = false; mesh.material.opacity = 0; }
    let slot = 0;
    for (const flash of shot.flash || []) {
      const t0 = shotStart + flash.at;
      const life = flash.seconds || 0.06;
      if (this.time < t0 || this.time > t0 + life) continue;
      const mesh = this.flashPool[slot % this.flashPool.length];
      slot += 1;
      const k = 1 - (this.time - t0) / life;
      mesh.visible = true;
      mesh.material.opacity = Math.min(1, 1.0 * k + 0.15);
      // HDR 增益：加性片的颜色乘 2.5，远处的焰才压得过天光
      mesh.material.color.setRGB(2.5, 2.1, 1.5);
      mesh.position.set(flash.pos[0], flash.pos[1], flash.pos[2]);
      mesh.scale.setScalar((flash.size || 1) * (0.75 + 0.35 * k));
      // billboard：贴片始终正对相机。相机在世界系，贴片在 setRoot 局部系。
      mesh.lookAt(this.camera.position);
    }
  }

  _ApplyBlack(shot, local, dt) {
    let want = 0;
    if (shot.black) want = 1;
    else if (shot.blackOutAt !== undefined && local >= shot.blackOutAt) {
      want = Clamp01((local - shot.blackOutAt) / Math.max(0.2, shot.seconds - shot.blackOutAt));
    }
    // 镜头开头从黑淡入（shot.fadeIn 秒）；整场开头从黑淡入（cut.fadeIn 秒）。
    // 两条都是「想要的黑度」的下限，与黑场/黑出取最大，不互相覆盖。
    if (shot.fadeIn > 0) want = Math.max(want, 1 - Clamp01(local / shot.fadeIn));
    if (this.cut && this.cut.fadeIn > 0) want = Math.max(want, 1 - Clamp01(this.time / this.cut.fadeIn));
    // 黑场镜**第一帧就全黑**（硬切进黑，不收敛）：字卡开场漏 0.25 s 旧画面就是这么来的
    if (shot.black) { this.blackAlpha = 1; if (this.dom) this.dom.black.style.opacity = "1"; return; }
    // 硬切不淡入，其余用 4 秒/单位的速度收敛（≈0.25 s 全黑）
    this.blackAlpha = want >= this.blackAlpha
      ? Math.min(want, this.blackAlpha + dt * 4)
      : Math.max(want, this.blackAlpha - dt * 4);
    if (this.dom) this.dom.black.style.opacity = String(this.blackAlpha);
  }

  // -------------------------------------------------------------------------
  // 字幕 / 台词 / 音效
  // -------------------------------------------------------------------------

  _VoiceDuration(cue) {
    if (!cue || !this.audio) return 0;
    const bank = this.audio.voiceBank;
    const entry = bank && typeof bank.get === "function" ? bank.get(cue) : null;
    return Number(entry?.duration) > 0 ? Number(entry.duration) : 0;
  }

  _PlayVoice(cue, offset = 0) {
    if (!cue || !this.audio || typeof this.audio.Play !== "function") return 0;
    const name = String(cue).startsWith("voice.") ? String(cue) : `voice.${cue}`;
    const voice = this.audio.Play(name, { volume: 1, priority: true, offset });
    if (voice) this.activeCueVoices.add(voice);
    // 缺声库时 Play 会稳定地返回 null；字幕仍按数据时长显示，不阻塞过场。
    return voice && Number(voice.duration) > 0 ? Number(voice.duration) : this._VoiceDuration(String(cue).replace(/^voice\./, ""));
  }

  /** 终止当前过场自己发出的播放头；环境床与游戏的其他声音不碰。 */
  StopCueAudio() {
    for (const voice of this.activeCueVoices) {
      if (this.audio && typeof this.audio.StopVoice === "function") this.audio.StopVoice(voice);
      else if (voice && Array.isArray(voice.nodes)) {
        for (const node of voice.nodes) {
          try { if (typeof node.stop === "function") node.stop(); } catch (error) { /* 已结束 */ }
        }
      }
    }
    this.activeCueVoices.clear();
  }

  /**
   * Timeline 静音快进到目标后，从目标采样点重建仍在持续的人声。
   * 短促 SFX 不倒放、不补放；它们没有连续时间语义，跳过就应当跳过。
   */
  SyncCueAudioAtTime() {
    if (!this.playing || !this.cut || !this.audio) return 0;
    this.StopCueAudio();
    let shotStart = 0;
    let resumed = 0;
    const seen = new Set();
    for (const shot of this.cut.shots || []) {
      for (const cue of [...(shot.subs || []), ...(shot.lines || [])]) {
        const voiceCue = cue.voiceCue ?? cue.voice ?? null;
        if (!voiceCue) continue;
        const at = shotStart + (Number(cue.at) || 0);
        const offset = this.time - at;
        const duration = this._VoiceDuration(String(voiceCue).replace(/^voice\./, ""));
        const identity = `${voiceCue}:${at}`;
        if (seen.has(identity) || !(duration > 0) || offset < 0 || offset >= duration) continue;
        seen.add(identity);
        this._PlayVoice(voiceCue, offset);
        resumed += 1;
      }
      shotStart += shot.seconds || 0;
    }
    return resumed;
  }

  _FireCues(cut, shot, shotStart, local) {
    const key = (kind, i) => `${shot.n}:${kind}:${i}`;
    const crossed = (at) => this.prevTime <= shotStart + at && this.time > shotStart + at;

    (shot.subs || []).forEach((sub, i) => {
      const id = key("sub", i);
      if (this.fired.has(id) || !crossed(sub.at)) return;
      this.fired.add(id);
      const voiceCue = sub.voiceCue ?? sub.voice ?? null;
      const voiceDuration = this._PlayVoice(voiceCue);
      this.subSlots.push({ ...sub, left: Math.max(sub.seconds || 3.0, voiceDuration) });
      this.log.push({ cut: cut.id, shot: shot.n, kind: "sub", tier: sub.tier, text: sub.text });
      this._RenderSubs();
    });

    (shot.lines || []).forEach((line, i) => {
      const id = key("line", i);
      if (this.fired.has(id) || !crossed(line.at)) return;
      this.fired.add(id);
      const who = line.who ? CAST[line.who] : null;
      const voiceCue = line.voiceCue ?? line.voice ?? null;
      const voiceDuration = this._PlayVoice(voiceCue);
      this.lineSlot = {
        who: who ? (who.short || who.name) : "",
        text: line.text, off: !!line.off, tier: line.tier,
        left: Math.max(line.seconds || 3.0, voiceDuration),
      };
      this.log.push({ cut: cut.id, shot: shot.n, kind: "line", who: line.who, tier: line.tier, text: line.text });
      this._RenderLine();
    });

    (shot.sfx || []).forEach((sfx, i) => {
      const id = key("sfx", i);
      if (this.fired.has(id) || !crossed(sfx.at)) return;
      this.fired.add(id);
      if (this.audio && typeof this.audio.Play === "function") {
        const voice = this.audio.Play(sfx.name, { volume: sfx.volume ?? 0.5 });
        if (voice) this.activeCueVoices.add(voice);
      }
    });
  }

  _TickText(dt) {
    let dirty = false;
    for (const slot of this.subSlots) slot.left -= dt;
    const before = this.subSlots.length;
    for (let i = this.subSlots.length - 1; i >= 0; i -= 1) {
      if (this.subSlots[i].left <= 0) this.subSlots.splice(i, 1);
    }
    if (this.subSlots.length !== before) dirty = true;
    if (dirty) this._RenderSubs();

    if (this.lineSlot) {
      this.lineSlot.left -= dt;
      if (this.lineSlot.left <= 0) { this.lineSlot = null; this._RenderLine(); }
    }
  }

  _RenderSubs() {
    if (!this.dom) return;
    // titleCard 的镜（黑场上的章节字卡）字幕居中；其余压在下黑边上方
    this.dom.subs.classList.toggle("center", !!(this.curShot && this.curShot.titleCard));
    this.dom.subs.innerHTML = this.subSlots.map((s) => {
      const cls = `csSub${s.big ? " big" : ""}${s.small ? " small" : ""}${s.title ? " title" : ""}${s.date ? " date" : ""}`;
      const note = s.small && typeof s.small === "string"
        ? `<span class="csSubNote">${s.small}</span>` : "";
      return `<p class="${cls}">${TierTag(s.tier)}${s.text}${note}</p>`;
    }).join("");
  }

  _RenderLine() {
    if (!this.dom) return;
    if (!this.lineSlot) { this.dom.line.innerHTML = ""; return; }
    const l = this.lineSlot;
    const who = l.who ? `<span class="csWho">${l.who}${l.off ? "（画外）" : ""}：</span>` : "";
    this.dom.line.innerHTML = `<div class="csLineText${l.off ? " csOff" : ""}">${who}${l.text}</div>`;
  }

  _ClearText() {
    this.subSlots.length = 0;
    this.lineSlot = null;
    if (this.dom) { this.dom.subs.innerHTML = ""; this.dom.line.innerHTML = ""; }
  }

  // -------------------------------------------------------------------------
  // 补出卡片 / 结算
  // -------------------------------------------------------------------------

  _SkipCardOf(cut) {
    if (cut.skipCardFrom && cut[cut.skipCardFrom]) return cut[cut.skipCardFrom];
    if (cut.skipCard) return cut.skipCard;
    if (cut.tally) return this._TallyCard(cut);
    return null;
  }

  /** 结算面板：只打守住时长、阵地易手次数、出城人数。**不打歼敌数。** */
  _TallyCard(cut) {
    const tally = cut.tally;
    if (!tally) return null;
    const rows = tally.rows.map((row) => ({
      label: row.label,
      value: String(row.value).replace("{poolOut}", String(this.ctx.poolOut ?? "—")),
      note: row.note || "",
    }));
    return { title: cut.title, tallyRows: rows, lines: tally.closing || [] };
  }

  _ShowCard(card) {
    if (!card || !this.dom) { this._Finish(false); return; }
    const rows = (card.tallyRows || []).map((r) => `
      <div class="csTallyRow"><span class="csTallyLabel">${r.label}</span>
      <span>${r.value}</span>${r.note ? `<span class="csTallyNote">${r.note}</span>` : ""}</div>`).join("");
    const lines = (card.lines || []).map((l) => {
      const note = l.small && typeof l.small === "string"
        ? `<span class="csSubNote">${l.small}</span>` : "";
      return `<div class="csCardLine${l.small === true ? " small" : ""}">${TierTag(l.tier)}${l.text}${note}</div>`;
    }).join("");
    this.dom.card.innerHTML =
      `<div class="csCardTitle">${card.title || ""}</div>${rows}${rows && lines ? "<div style='height:2em'></div>" : ""}${lines}`;
    this.dom.card.classList.add("on");
    this.dom.skip.style.display = "none";
    // 读秒：一行大约 1.6 秒，加 2 秒余量。任意键可以提前翻过。
    const count = (card.lines || []).length + (card.tallyRows || []).length;
    this.cardHold = 2.0 + 1.6 * count;
    this.cardTime = 0;
  }

  // -------------------------------------------------------------------------

  _Finish(silent) {
    if (!this.playing && !this.cut) return;
    if (silent) this.StopCueAudio();
    else this.activeCueVoices.clear();
    this.playing = false;
    this.cardTime = -1;
    this._TeardownSet();
    this._ClearText();
    if (this.dom) {
      this.dom.root.classList.remove("on");
      this.dom.card.classList.remove("on");
      this.dom.card.innerHTML = "";
      this.dom.black.style.opacity = "0";
    }
    this.blackAlpha = 0;
    this._RestoreCamera();
    this._RestoreAudio();
    if (this.skyApplied && this.restoreSky) this.restoreSky();
    this.skyApplied = false;
    if (this.hud && typeof this.hud.SetOrdersVisible === "function") this.hud.SetOrdersVisible(true);
    if (this.hud && typeof this.hud.SetCinematic === "function") this.hud.SetCinematic(false);
    if (this.onRelease && !this._released) {
      this._released = true;
      this.onRelease(this.cut);
    }
    const resolve = this.resolve;
    this.resolve = null;
    const cut = this.cut;
    this.cut = null;
    if (resolve && !silent) resolve({ id: cut ? cut.id : null, skipped: this.skipped });
  }

  Dispose() {
    if (this.playing) this._Finish(true);
    if (this.doc && this._onKey) this.doc.removeEventListener("keydown", this._onKey);
    if (this.doc && this._onKeyUp) this.doc.removeEventListener("keyup", this._onKeyUp);
    if (this.dom && this.dom.root.parentNode) this.dom.root.parentNode.removeChild(this.dom.root);
    this.dom = null;
    if (this.flashTexture) { this.flashTexture.dispose(); this.flashTexture = null; }
  }
}

export default CutsceneDirector;
