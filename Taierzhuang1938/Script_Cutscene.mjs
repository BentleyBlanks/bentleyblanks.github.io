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
//   drawCalls ≤ 1400 / triangles ≤ 320 万，26.5k 三角可以忽略，
//   但 293 个网格 ≈ 293 个 draw call 不能忽略 —— 一个 Actor 在 medium 下
//   约 16 个材质桶，13 个人就是 200 多。
//   **接进正片时给过场单独建一个 quality:"low" 的 ActorFactory**（约 12 桶/人），
//   或者把 CS_BeimenBreakout 的群众减到 8 人。这条别等上线才发现。
//
// ── 与 Script_Actor 的关系 ──────────────────────────────────────────────
// 本模块**不 import Script_Actor**，工厂由外部注入（actorFactory）。
// 换模 agent 正在重写那个文件，硬耦合过去两边都动不了。
// 需要的接口只有三个：Create(kind,{seed}) → { root, Update(dt,state), SetWeapon(id), Dispose() }。

import * as THREE from "three";
import { MarkNoPrepass } from "./Script_Post.mjs";
// Lerp 在 Script_Noise 里没导出，导出的名字是 Mix —— 别自己再写一个线性插值，
// 两份实现迟早会有一份被改。
import { HashString, ValueNoise2, Clamp01, Clamp, Mix as Lerp } from "./Script_Noise.mjs";
import { CUTSCENES, CAST } from "./Data_TengxianScript.mjs";

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
// 数据自检
// ---------------------------------------------------------------------------

/**
 * 分镜的秒数之和必须等于这一场声明的总时长。
 *
 * 这条自检不是洁癖：设计书给死了每场的秒数（38/26/22/36/24），
 * 时长对不上就意味着有人偷偷加减了镜头，而这种改动在画面上看不出来 ——
 * 只会表现为「字幕来不及读完」或「黑场多了两秒」，最难查。
 */
export function ValidateCutscene(cut) {
  const problems = [];
  if (!cut || !cut.id) return ["过场数据为空"];
  const shots = cut.shots || [];
  if (!shots.length) problems.push(`${cut.id}: 没有任何分镜`);
  const sum = shots.reduce((a, s) => a + (s.seconds || 0), 0);
  if (Math.abs(sum - cut.seconds) > 0.005) {
    problems.push(`${cut.id}: 分镜秒数之和 ${sum.toFixed(2)} ≠ 声明时长 ${cut.seconds}`);
  }
  for (const shot of shots) {
    if (!shot.camera || !shot.camera.from) problems.push(`${cut.id} 镜${shot.n}: 缺机位`);
    if (!shot.focalMm) problems.push(`${cut.id} 镜${shot.n}: 缺焦距`);
    for (const line of shot.lines || []) {
      if (line.who && !CAST[line.who]) problems.push(`${cut.id} 镜${shot.n}: 人物表里没有 ${line.who}`);
    }
  }
  for (const actor of cut.cast || []) {
    if (!actor.track || !actor.track.length) { problems.push(`${cut.id}: ${actor.id} 没有轨道`); continue; }
    for (let i = 1; i < actor.track.length; i += 1) {
      if (actor.track[i].t < actor.track[i - 1].t) {
        problems.push(`${cut.id}: ${actor.id} 的关键帧时间没有递增（第 ${i} 帧）`);
      }
    }
  }
  return problems;
}

/** 全部五场一起校验，给自检脚本用。 */
export function ValidateAllCutscenes(table = CUTSCENES) {
  const problems = [];
  for (const cut of Object.values(table)) problems.push(...ValidateCutscene(cut));
  return problems;
}

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
.csSubs{position:absolute;left:8%;right:8%;bottom:${BAR_RATIO * 100 + 4}%;text-align:center}
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
    this.ownedGeometries = [];
    this.ownedMaterials = [];
    this.flashPool = [];
    this.gunsight = null;
    this.cardTime = -1;
    this.cardHold = 0;
    this.savedCamera = null;
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
      if (event.key === "Escape") this.Skip();
    };
    if (this.doc) this.doc.addEventListener("keydown", this._onKey);
  }

  get Playing() { return this.playing; }
  get Time() { return this.time; }
  get CurrentId() { return this.cut ? this.cut.id : null; }

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
      this.resolve = null;
      this._Finish(true);
      if (stale) stale({ id: this.cut ? this.cut.id : null, aborted: true });
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
    this.blackAlpha = 0;
    this.shakeSeed = HashString(`shake:${id}`);
    this.playing = true;

    this._SaveCamera();
    this._BuildSet(cut);
    if (this.hud && typeof this.hud.SetOrdersVisible === "function") this.hud.SetOrdersVisible(false);
    if (this.onCapture) this.onCapture(cut);
    if (this.dom) {
      this.dom.root.classList.add("on");
      this.dom.card.classList.remove("on");
      this.dom.card.innerHTML = "";
      this.dom.skip.style.display = "";
    }
    // 一进场先摆一帧，免得第一帧还停在玩家的机位上（会闪一下旧画面）。
    this.Update(0);
    return new Promise((resolve) => { this.resolve = resolve; });
  }

  /** 跳过。字幕仍以卡片补出 —— 史实信息不许因为跳过而丢失。 */
  Skip() {
    if (!this.playing || this.skipped) return;
    this.skipped = true;
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

    this._ApplyCamera(cut, shot, local);
    this._ApplyActors(cut, dt);
    this._ApplyProps(shot, local);
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
      this.props.set(spec.name || `prop${this.props.size}`, {
        mesh, base: mesh.position.clone(),
      });
    }

    if (this.actorFactory) {
      for (const spec of cut.cast || []) {
        let actor = null;
        try {
          actor = this.actorFactory.Create(spec.kind || "nra", { seed: spec.seed || spec.id });
        } catch (error) {
          console.warn(`[Cutscene] ${cut.id}: 造 ${spec.id} 失败 —— ${String(error).slice(0, 160)}`);
          continue;
        }
        // **weapon:null 必须真的调一次 SetWeapon(null)。** 不调的话 Actor 会挂上
        // KIND_SPEC 里的 defaultWeapon（中正式），于是「王铭章手里是望远镜不是枪」
        // 和「每三人里有一人空着手」这两条都当场作废 —— 后者是史实点，不是美术偏好。
        if ("weapon" in spec && typeof actor.SetWeapon === "function") actor.SetWeapon(spec.weapon || null);
        actor.root.visible = false;
        this.setRoot.add(actor.root);
        this.actors.set(spec.id, { actor, spec });
      }
    }

    this._BuildFlashPool();
    this._BuildGunsight();
  }

  _MakeProp(spec) {
    const size = spec.size || [1, 1, 1];
    let geometry = null;
    if (spec.kind === "cyl") {
      geometry = new THREE.CylinderGeometry(size[0], size[0], size[1], 14, 1);
    } else if (spec.kind === "plane") {
      geometry = new THREE.PlaneGeometry(size[0], size[1]);
      geometry.rotateX(-Math.PI / 2);
    } else {
      geometry = new THREE.BoxGeometry(size[0], size[1], size[2] ?? size[0]);
    }
    this.ownedGeometries.push(geometry);

    let material = null;
    if (spec.mat && this.library && typeof this.library.Get === "function") {
      try { material = this.library.Get(spec.mat); } catch (error) { material = null; }
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
      const light = new THREE.PointLight(
        spec.light.color ?? 0xffd9a0, spec.light.intensity ?? 8, spec.light.distance ?? 8, 2);
      light.position.set(0, spec.light.offsetY ?? 0, 0);
      mesh.add(light);
    }
    mesh.position.set(spec.pos[0], spec.pos[1], spec.pos[2]);
    if (spec.rx) mesh.rotation.x = spec.rx;
    if (spec.ry) mesh.rotation.y = spec.ry;
    mesh.castShadow = !spec.inside;
    mesh.receiveShadow = true;
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
    for (let i = 0; i < 4; i += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xffd9a0, blending: THREE.AdditiveBlending,
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
    };
  }

  _RestoreCamera() {
    if (!this.savedCamera) return;
    this.camera.position.copy(this.savedCamera.position);
    this.camera.quaternion.copy(this.savedCamera.quaternion);
    this.camera.fov = this.savedCamera.fov;
    this.camera.near = this.savedCamera.near;
    this.camera.updateProjectionMatrix();
    this.savedCamera = null;
  }

  _ApplyCamera(cut, shot, local) {
    const cam = shot.camera;
    const k = shot.seconds > 0 ? local / shot.seconds : 1;
    const e = Ease(cam.ease, k);
    const o = this.origin;

    const from = cam.from;
    const to = cam.to || cam.from;
    const look = cam.look || [from[0], from[1], from[2] - 1];
    const lookTo = cam.lookTo || look;

    this.camera.position.set(
      o.x + Lerp(from[0], to[0], e),
      o.y + Lerp(from[1], to[1], e),
      o.z + Lerp(from[2], to[2], e),
    );
    const target = new THREE.Vector3(
      o.x + Lerp(look[0], lookTo[0], e),
      o.y + Lerp(look[1], lookTo[1], e),
      o.z + Lerp(look[2], lookTo[2], e),
    );
    // 近平面：微距特写（85 mm 打 0.4 m 外的纸）默认 0.08 也够，但长焦回望
    // 300 m 外的城墙时把 near 抬起来能省一大截深度精度。按机位到被摄物的距离给。
    const dist = this.camera.position.distanceTo(target);
    // 近平面按被摄距离给，长焦回望 300 m 外的城墙时能省一大截深度精度。
    // 但**带准星的镜子例外**：准星贴在镜头前 0.3—0.5 m，near 一抬就整个被切掉，
    // 画面上表现为「准星没了」，而不是报错 —— 这类 bug 只能靠出图发现。
    this.camera.near = shot.gunsight ? 0.02 : Clamp(dist * 0.03, 0.03, 1.2);
    this.camera.fov = FovFromFocalMm(shot.focalMm);
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

  _ApplyActors(cut, dt) {
    for (const { actor, spec } of this.actors.values()) {
      const sample = SampleTrack(spec.track, this.time);
      if (sample.hidden || !sample.pos) { actor.root.visible = false; continue; }
      actor.root.visible = true;
      actor.root.position.set(sample.pos[0], sample.pos[1], sample.pos[2]);
      actor.root.rotation.y = sample.ry;
      const state = { ...sample.state, elapsed: this.time };
      delete state.hidden;
      actor.Update(dt, state);
    }
  }

  _ApplyProps(shot, local) {
    // 每帧先把所有道具放回基准位，再叠加本镜的位移 ——
    // 否则上一镜的位移会留在道具身上，切回来道具就飘在半空。
    for (const entry of this.props.values()) entry.mesh.position.copy(entry.base);
    for (const move of shot.propMoves || []) {
      const entry = this.props.get(move.name);
      if (!entry) continue;
      const k = Clamp01((local - (move.startAt || 0)) / Math.max(1e-6, (move.endAt || 1) - (move.startAt || 0)));
      const e = Ease(move.ease, k);
      entry.mesh.position.set(
        Lerp(move.from[0], move.to[0], e),
        Lerp(move.from[1], move.to[1], e),
        Lerp(move.from[2], move.to[2], e),
      );
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
      mesh.material.opacity = 0.9 * k;
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
    // 硬切不淡入，其余用 4 秒/单位的速度收敛（≈0.25 s 全黑）
    this.blackAlpha = want >= this.blackAlpha
      ? Math.min(want, this.blackAlpha + dt * 4)
      : Math.max(want, this.blackAlpha - dt * 4);
    if (this.dom) this.dom.black.style.opacity = String(this.blackAlpha);
  }

  // -------------------------------------------------------------------------
  // 字幕 / 台词 / 音效
  // -------------------------------------------------------------------------

  _FireCues(cut, shot, shotStart, local) {
    const key = (kind, i) => `${shot.n}:${kind}:${i}`;
    const crossed = (at) => this.prevTime <= shotStart + at && this.time > shotStart + at;

    (shot.subs || []).forEach((sub, i) => {
      const id = key("sub", i);
      if (this.fired.has(id) || !crossed(sub.at)) return;
      this.fired.add(id);
      this.subSlots.push({ ...sub, left: sub.seconds || 3.0 });
      this.log.push({ cut: cut.id, shot: shot.n, kind: "sub", tier: sub.tier, text: sub.text });
      this._RenderSubs();
    });

    (shot.lines || []).forEach((line, i) => {
      const id = key("line", i);
      if (this.fired.has(id) || !crossed(line.at)) return;
      this.fired.add(id);
      const who = line.who ? CAST[line.who] : null;
      this.lineSlot = {
        who: who ? (who.short || who.name) : "",
        text: line.text, off: !!line.off, tier: line.tier, left: line.seconds || 3.0,
      };
      this.log.push({ cut: cut.id, shot: shot.n, kind: "line", who: line.who, tier: line.tier, text: line.text });
      this._RenderLine();
    });

    (shot.sfx || []).forEach((sfx, i) => {
      const id = key("sfx", i);
      if (this.fired.has(id) || !crossed(sfx.at)) return;
      this.fired.add(id);
      if (this.audio && typeof this.audio.Play === "function") {
        this.audio.Play(sfx.name, { volume: sfx.volume ?? 0.5 });
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
    this.dom.subs.innerHTML = this.subSlots.map((s) => {
      const cls = `csSub${s.big ? " big" : ""}${s.small ? " small" : ""}`;
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
    if (this.hud && typeof this.hud.SetOrdersVisible === "function") this.hud.SetOrdersVisible(true);
    if (this.onRelease) this.onRelease(this.cut);
    const resolve = this.resolve;
    this.resolve = null;
    const cut = this.cut;
    this.cut = null;
    if (resolve && !silent) resolve({ id: cut ? cut.id : null, skipped: this.skipped });
  }

  Dispose() {
    if (this.playing) this._Finish(true);
    if (this.doc && this._onKey) this.doc.removeEventListener("keydown", this._onKey);
    if (this.dom && this.dom.root.parentNode) this.dom.root.parentNode.removeChild(this.dom.root);
    this.dom = null;
  }
}

export default CutsceneDirector;
