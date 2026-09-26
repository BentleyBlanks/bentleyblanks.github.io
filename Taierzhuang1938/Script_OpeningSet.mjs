// ===========================================================================
// Script_OpeningSet.mjs —— 第一关 01–03 过场分镜布景（Set 包，契约
// docs/Data_FirstLevelStoryboard0103Contract.md §4.5）。
//
// 数据在 Data_OpeningSet0103.PROPS（纯数据）；这里只把它变成 three 网格：
//   · 静态件按材质走 BuildSink 合批（AGENTS §3），分三组：01–03 常驻组、近爆之后才出现的塌方组、
//     02 起才出现的组（show:"rescue"，还权坐位的靠背：01 里它挡 SB03 看审问组的视线）；
//   · 动态件：门楣南段的落下（FallLintel）、马灯的点光与灯罩闪烁、沟沿国军旗被踹倒（PoseFlag）；
//   · 全部挂在本模块自己的根节点下，Exit() 拆干净（几何、自有材质、贴图、灯），场景里不留一个节点。
// 库材质（library.Get）与外部模型模板是共享的，只摘不 dispose。
//
// Step 2 加了四样，生命周期各自独立：
//   · 世界特效：近爆的定向喷土（Script_OpeningBlastFx，blastAge 走到 BLAST.atS 自动喷一次）、
//     远处烟柱与火点（Data SMOKE，按任务步骤挂 vfx.SmokeSource，离开 01–03 全部 RemoveSmokeSource）、
//     03 开头两架日机横飞（Data FLYOVER，aircraft.SetManualPose，飞完/离开 03 交还）；
//   · 03 前沿布景（Data FRONT_PROPS：阵位破砖墙壳、缺口倒墙、缺口护壁、弹药箱）：它是阵位与缺口的世界外观，
//     04–06 玩家还在那儿打，所以装在 FRONT_SET_STAGES 里、单独一个根节点，出了这几步才收；
//   · 阴天开关（Data sky.overcast，默认关；?openingOvercast=1 临时打开）：进 01–03 套阴天预设，离开还原。
//
// 运行时接线（Script_FirstLevelMissionRuntime 的薄钩子）：
//   Enter(stageId)                          每一步 Enter 调；01–03 装载，别的步骤收走
//   Update(dt, stageId, phase, flags)       flags = { collapsed, blastAge, player }（blastAge：离近爆的秒数，没炸过为 null；
//                                           player：玩家位置，飞机按它触发；breakables：战车运行时的可破坏墙，
//                                           阵位砖壳跟着它的当前级）
//   Exit()                                  整关拆除
// ===========================================================================
import * as THREE from "three";
import { PROPS, SET_STAGES, FLOOR, BLAST, SMOKE, SmokeOptions, SmokeShare, FLYOVER, FLYOVER_TRIGGER, FlyoverPose, sky as SKY,
  FRONT_SET_STAGES, FRONT_PROPS, BRICK, ProfileAt } from "./Data_OpeningSet0103.mjs";
import { OPENING_STORYBOARDS } from "./Data_OpeningStoryboards.mjs";
import { MISSION_LAYOUT } from "./Data_FirstLevelMissionLayout.mjs";
import { FRONT_BREAKABLES } from "./Data_FirstLevelFrontBreakables.mjs";
import { BuildSink } from "./Script_World.mjs";
import { MakeBox, MakeSandbag, PlaceGeometry, TILE_METERS } from "./Script_Geo.mjs";
import { OpeningBlastFx } from "./Script_OpeningBlastFx.mjs";
import { SKY_PRESETS } from "./Script_Sky.mjs";

const DEG = Math.PI / 180;
const Clamp01 = (v) => Math.max(0, Math.min(1, v));
const UP = new THREE.Vector3(0, 1, 0);
/** 01 的导演拍：任务步骤在「Found」前后就从 Trapped 切到 BunkerRescue 了，01/02 的界线要看导演 phase。 */
const TRAPPED_PHASES = new Set(OPENING_STORYBOARDS.phases.Trapped);
/** 02（救援）起才出现的组：步骤进了 01–02 之后，或者 01–02 里导演已经演到 02 的拍。 */
export function RescueShown(stageId, phase) {
  if (stageId === "Trapped") return false;
  if (stageId === "BunkerRescue") return !TRAPPED_PHASES.has(phase);
  return true;
}
/**
 * 阴天预设（Data sky）：Script_Sky 的 overcast 为底，雾照抄本关自己的天（不改雾），再按 tweaks 压饱和、往灰褐里拉。
 * 纯函数，测试直接比对。
 */
export function OvercastPreset(presets = SKY_PRESETS) {
  const base = presets[SKY.base], fogFrom = presets[SKY.fogFrom];
  if (!base || !fogFrom) throw new Error(`OpeningSet: sky presets ${SKY.base}/${SKY.fogFrom} missing`);
  return { ...base, ...SKY.tweaks, fog: fogFrom.fog };
}
/** 挂进 SKY_PRESETS（宿主的 ApplySkyPreset 只认名字）；只挂一次。 */
export function RegisterOvercastPreset(presets = SKY_PRESETS) {
  if (!presets[SKY.preset]) presets[SKY.preset] = Object.freeze(OvercastPreset(presets));
  return presets[SKY.preset];
}
/**
 * 可破坏体块每一级的墙顶世界高度（第 0 级＝原体块顶）。与 Script_FirstLevelFrontBreakables 同一口径：
 * 数据的 topM 是离体块脚下共享地面的高度，地面高过墙脚时从地面量（SpaceBreakableSpecs + SegmentBox 的 lift）。
 */
export function BreakableTops(block, breakable, groundAt) {
  const base = block.y - block.h / 2, lift = Math.max(0, groundAt(block.x, block.z) - base);
  return [block.y + block.h / 2, ...breakable.stages.map((s) => base + lift + s.topM)];
}
/** 可复现的伪随机（每件道具自己一串，改一件不牵动别的件）。 */
function Rng(seedText) {
  let h = 2166136261;
  for (const ch of String(seedText)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}
/** 一段圆木 / 方木：从 a 到 b（世界坐标 Vector3）。 */
function Beam(a, b, { w = 0.1, h = w, round = false, tile = TILE_METERS.wood, seed = "beam" } = {}) {
  const dir = new THREE.Vector3().subVectors(b, a), len = dir.length();
  const geometry = round ? new THREE.CylinderGeometry(w / 2, w / 2, len, 8, 1).rotateX(Math.PI / 2) : MakeBox(w, h, len, tile, seed);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize());
  return geometry.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
}
/** 竖立件：底在 base，朝 axis（单位向量）长 h。 */
function Post(base, axis, h, w = 0.1, { round = false, seed = "post" } = {}) {
  return Beam(base, base.clone().addScaledVector(axis, h), { w, round, seed });
}
/** 墙的朝向：side 写在数据里（north/south/east/west），返回指向墙里的水平单位向量。 */
function WallNormal(a, b, side) {
  const d = new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize(), n = new THREE.Vector3(d.z, 0, -d.x);
  const want = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] }[side] || [0, -1];
  if (n.x * want[0] + n.z * want[1] < 0) n.negate();
  return n;
}
/** 所有几何统一成「有索引、有法线、有 uv」再进 BuildSink（MergeGeometries 要求属性一致）。 */
function Normalize(geometry) {
  let g = geometry.index ? geometry : geometry.setIndex([...Array(geometry.attributes.position.count).keys()]);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  for (const name of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(name)) g.deleteAttribute(name);
  return g;
}

export class OpeningSet {
  /**
   * @param {object} host
   *   scene, library（Script_Materials），groundAt(x,z)（共享地面采样器），
   *   可选：loadTexture(url)→Promise<Texture>，loadExternal(assetId)→Promise<Object3D>，
   *   makeCanvas(w,h)→canvas（旗面贴图；没有就用纯色）。
   */
  constructor({ scene, library, groundAt, loadTexture = null, loadExternal = null, makeCanvas = null,
    vfx = null, aircraft = null, applySky = null, restoreSky = null, overcast = null }) {
    this.scene = scene; this.library = library; this.groundAt = groundAt;
    this.loadTexture = loadTexture ?? (typeof document !== "undefined" ? (url) => new THREE.TextureLoader().loadAsync(url) : null);
    this.loadExternal = loadExternal ?? (typeof document !== "undefined"
      ? async (id) => (await import("./Script_ExternalProps.mjs")).InstantiateExternalProp(id, library) : null);
    this.makeCanvas = makeCanvas ?? (typeof document !== "undefined"
      ? (w, h) => Object.assign(document.createElement("canvas"), { width: w, height: h }) : null);
    this.vfx = vfx; this.aircraft = aircraft; this.applySky = applySky; this.restoreSky = restoreSky;
    this.blastFx = vfx ? new OpeningBlastFx({ vfx }) : null;
    this.root = null;
    this.front = null;
    this.stage = null;
    this.generation = 0;
    this.lintelProgress = null;
    /** 本次近爆喷过没有（blastAge 回到 null ＝ 重试，清掉）。 */
    this.blastSprayed = false;
    /** row.id -> vfx 烟源句柄。 */
    this.smoke = new Map();
    this.flyover = null;           // { t, triggered, stageTime, poses:Set<aircraftId> }
    this.suspended = false;
    // 阴天：数据开关、构造参数、或页面地址 ?openingOvercast=1（给用户 A/B 看）。
    let urlOvercast = false;
    try { urlOvercast = typeof location !== "undefined" && new URLSearchParams(location.search).get("openingOvercast") === "1"; } catch { /* 非浏览器 */ }
    this.overcast = overcast ?? (SKY.overcast || urlOvercast);
    this.skyApplied = false;
  }

  get Active() { return !!this.root; }

  // ---------------------------------------------------------------- lifecycle
  Enter(stageId) {
    this.stage = stageId;
    // 前沿布景在 01 进场时就建好（先藏着）：02→03 是正常游玩里的步骤切换，不是加载画面，
    // 几千块砖的合批放在那一帧现建会卡一下（审查 09-25）。03–06 显示，出了 01–06 收走。
    const frontShown = FRONT_SET_STAGES.includes(stageId);
    if (frontShown || SET_STAGES.includes(stageId)) {
      if (!this.front && !this.suspended) this.BuildFront();
      if (this.front) this.front.root.visible = frontShown;
    } else this.ExitFront();
    if (!SET_STAGES.includes(stageId)) { this.ExitOpening(); return false; }
    if (!this.root && !this.suspended) this.Build();
    this.SyncSky();
    return true;
  }

  Update(dt, stageId, phase, flags = {}) {
    if (stageId !== this.stage) this.Enter(stageId);
    this.blastFx?.Update(dt);
    if (!this.root) { this.SyncBreakables(flags.breakables); return; }
    this.time = (this.time || 0) + dt;
    const collapsed = !!flags.collapsed;
    this.collapsedRoot.visible = collapsed;
    this.rescueRoot.visible = collapsed && RescueShown(stageId, phase);
    if (collapsed) {
      const f = this.lintel?.spec.fall;
      // 没看到近爆（选章 / 回跳 / 重试直接进 02）＝已经落定。落定后不再每帧设姿态。
      const want = flags.blastAge == null || !f ? 1 : this.LintelProgressAt(flags.blastAge);
      if (want !== this.lintelProgress) this.FallLintel(want);
      this.UpdateRoofTimber(dt, stageId, phase);
    }
    if(flags.flagFall!=null)this.PoseFlag("flagTrench",flags.flagFall);
    this.UpdateBlast(flags.blastAge, stageId);
    this.UpdateLantern(stageId, collapsed);
    if (this.smokeStage !== stageId) { this.smokeStage = stageId; this.UpdateSmoke(stageId); }
    this.UpdateFlyover(dt, stageId, flags.player);
    this.SyncBreakables(flags.breakables);
  }

  /** 整关拆除：01–03 布景、前沿布景、烟、飞机、天光全部复位。 */
  Exit() {
    this.ExitOpening();
    this.ExitFront();
  }

  /** 收走 01–03 那一份（布景、烟、飞机、阴天）。前沿布景另算（ExitFront）。 */
  ExitOpening() {
    this.generation += 1;
    this.ClearSmoke();
    this.EndFlyover();
    this.blastFx?.Clear();
    this.blastSprayed = false;
    if (this.skyApplied) { this.skyApplied = false; this.restoreSky?.(); }
    if (!this.root) return;
    this.DisposeRoot(this.root, this.ownedMaterials, this.ownedTextures, this.lights);
    this.flags?.clear();
    this.root = null; this.collapsedRoot = null; this.rescueRoot = null; this.lintel = null; this.lantern = null; this.roofTimber = null;
    this.smokeStage = null;
    this.ownedMaterials = []; this.ownedTextures = []; this.lights = [];
    for (const handle of this.fireHandles || []) this.vfx?.lights?.RemoveFire?.(handle);
    this.fireHandles = [];
    this.lintelProgress = null;
  }

  ExitFront() {
    if (!this.front) return;
    this.DisposeRoot(this.front.root, this.front.ownedMaterials, [], []);
    this.front = null;
  }

  DisposeRoot(root, ownedMaterials, ownedTextures, lights) {
    root.removeFromParent();
    const geometries = new Set(), materials = new Set(ownedMaterials);
    root.traverse((o) => { if (o.geometry && !o.userData.sharedGeometry) geometries.add(o.geometry); });
    for (const g of geometries) g.dispose();
    for (const m of materials) { m.map?.dispose?.(); m.dispose(); }
    for (const t of ownedTextures) t.dispose();
    for (const light of lights) light.dispose?.();
  }

  /**
   * 同页 A/B（布景开/关）用：true 把两份布景、烟、飞机、阴天全收掉并且不再装载，false 恢复（下一帧按当前步骤重装）。
   * 只给量帧耗时与调试用；正片不调。
   */
  Suspend(on) {
    this.suspended = !!on;
    const stage = this.stage;
    if (on) this.Exit();
    this.stage = null;
    if (stage) this.Enter(stage);
  }

  /** 诊断 / 测试：当前挂着多少网格、灯、自有材质，烟、飞机、阴天。 */
  Stats() {
    let meshes = 0, lights = 0, nodes = 0, frontMeshes = 0;
    this.root?.traverse((o) => { nodes += 1; if (o.isMesh) meshes += 1; if (o.isLight) lights += 1; });
    // 只数画得出来的（可破坏墙每级一份砖壳，只有当前级那份显示）。
    this.front?.root.traverseVisible((o) => { if (o.isMesh) frontMeshes += 1; });
    return { active: this.Active, nodes, meshes, lights, clusterLights: this.fireHandles?.length || 0, ownedMaterials: this.ownedMaterials?.length || 0,
      collapsedVisible: !!this.collapsedRoot?.visible, rescueVisible: !!this.rescueRoot?.visible, lintelProgress: this.lintelProgress,
      front: !!this.front, frontMeshes, smoke: [...this.smoke.keys()], blast: this.blastFx?.Stats() ?? null, blastSprayed: this.blastSprayed,
      flyover: this.flyover ? { t: +this.flyover.t.toFixed(2), triggered: this.flyover.triggered, flying: [...this.flyover.poses] } : null,
      overcast: this.overcast, skyApplied: this.skyApplied, suspended: this.suspended };
  }

  // ---------------------------------------------------------------- 近爆的定向喷土
  /** blastAge 走过 BLAST.atS（炮弹落地）那一帧喷一次；选章 / 重试直接进来（blastAge 早过了 1 s）不补喷。 */
  UpdateBlast(blastAge, stageId) {
    if (blastAge == null) { this.blastSprayed = false; return; }
    if (this.blastSprayed || stageId !== "Trapped" || blastAge < BLAST.atS) return;
    this.blastSprayed = true;
    if (blastAge > BLAST.atS + 0.5) return;
    this.SprayBlast();
  }

  /** 从 BLAST 数据喷一次（调试入口 DebugBlast 也走这里）。 */
  SprayBlast(tuning = null) {
    if (!this.blastFx) return null;
    const b = tuning ? { ...BLAST, ...tuning } : BLAST;       // tuning：抓帧 / 调参时临时覆盖（正片不传）
    const floor = this.groundAt(b.at.x, b.at.z), [lo, hi] = b.liftM;
    const dustAt = b.dustAt ? { x: b.dustAt.x, y: this.groundAt(b.dustAt.x, b.dustAt.z) + (b.dustAt.lift ?? 0.7), z: b.dustAt.z } : null;
    return this.blastFx.DirectionalBlast({ x: b.at.x, y: floor + (lo + hi) / 2, z: b.at.z }, b.dir,
      { heightM: (hi - lo) / 2, groundY: this.groundAt(FLOOR.x, FLOOR.z), clods: b.clods, splinters: b.splinters, spray: b.spray, dust: b.dust,
        seconds: b.seconds, spreadRad: b.spreadRad, speed: b.speed, burst: b.burst, clodSize: b.clodSize, upBoost: b.upBoost,
        sprayDir: b.sprayDir, dustDir: b.dustDir, dustAt, dustHeightM: b.dustHeightM, dustLead: b.dustLead });
  }

  /**
   * 调试 / 抓帧入口：现在就近爆一次（喷土 + 门楣从门楣位重新落下），不碰导演与任务状态。
   * 之后的 Update 若 flags.blastAge 仍是 null，门楣按「已落定」处理——抓帧请在真实流程的 Blast 拍里拍。
   */
  DebugBlast(tuning = null) {
    this.blastSprayed = true;
    return this.SprayBlast(tuning);
  }

  // ---------------------------------------------------------------- 烟柱与火点
  UpdateSmoke(stageId) {
    if (!this.vfx) return;
    const rows = SMOKE.filter((row) => row.stages.includes(stageId)), want = new Set(rows.map((row) => row.id));
    for (const [id, handle] of this.smoke) if (!want.has(id)) { this.vfx.RemoveSmokeSource(handle); this.smoke.delete(id); }
    // 按当前画质与池容量压 rate（SmokeShare）：这一步所有烟源一起压，已经在冒的也改（改 source.rate，不重建、烟柱不断）。
    const spawn = this.vfx.spawnScale ?? 1, share = SmokeShare(rows, spawn, this.vfx.pools?.sourceSmoke?.capacity);
    this.smokeShare = share;
    for (const row of rows) {
      const opts = SmokeOptions(row);
      opts.rate = +(opts.rate * share).toFixed(3);
      if (this.smoke.has(row.id)) { const src = this.vfx.smokeSources?.get?.(this.smoke.get(row.id)); if (src) src.rate = opts.rate * spawn; continue; }
      const y = this.groundAt(row.x, row.z) + (row.fire > 0 ? 0.15 : 1.0);
      this.smoke.set(row.id, this.vfx.SmokeSource({ x: row.x, y, z: row.z }, opts));
    }
  }

  ClearSmoke() {
    for (const handle of this.smoke.values()) this.vfx?.RemoveSmokeSource(handle);
    this.smoke.clear();
    this.smokeStage = null;
  }

  // ---------------------------------------------------------------- 03 开头的飞机
  UpdateFlyover(dt, stageId, player) {
    if (!this.aircraft || stageId !== FLYOVER_TRIGGER.stage) { this.EndFlyover(); return; }
    const fly = (this.flyover ??= { t: 0, stageTime: 0, triggered: false, done: false, poses: new Set() });
    fly.stageTime += dt;
    if (!fly.triggered) {
      const near = player && Math.hypot(player.x - FLYOVER_TRIGGER.at.x, player.z - FLYOVER_TRIGGER.at.z) <= FLYOVER_TRIGGER.radiusM;
      if (!near && fly.stageTime < FLYOVER_TRIGGER.fallbackS) return;
      fly.triggered = true;
    }
    if (fly.done) return;
    fly.t += dt;
    let flying = 0;
    for (const row of FLYOVER) {
      const pose = FlyoverPose(row, fly.t);
      if (pose) { this.aircraft.SetManualPose(row.aircraft, pose); fly.poses.add(row.aircraft); flying += 1; }
      else if (fly.poses.has(row.aircraft) && fly.t > row.delayS) { this.aircraft.SetManualPose(row.aircraft, null); fly.poses.delete(row.aircraft); }
    }
    if (!flying && fly.t > 1) fly.done = true;
  }

  /** 调试 / 抓帧：现在就起飞（t 秒处）。 */
  DebugFlyover(t = 0) {
    this.flyover = { t, stageTime: FLYOVER_TRIGGER.fallbackS, triggered: true, done: false, poses: this.flyover?.poses ?? new Set() };
  }

  EndFlyover() {
    if (!this.flyover) return;
    for (const id of this.flyover.poses) this.aircraft?.SetManualPose(id, null);
    this.flyover = null;
  }

  // ---------------------------------------------------------------- 阴天开关
  SetOvercast(on) {
    this.overcast = !!on;
    this.SyncSky();
  }

  SyncSky() {
    const want = this.overcast && !this.suspended && SET_STAGES.includes(this.stage);
    if (want && !this.skyApplied && this.applySky) {
      RegisterOvercastPreset();
      this.skyApplied = this.applySky(SKY.preset) !== false;
    } else if (!want && this.skyApplied) {
      this.skyApplied = false;
      this.restoreSky?.();
    }
  }

  // ---------------------------------------------------------------- fallen lintel
  LintelProgressAt(blastAge) {
    const f = this.lintel.spec.fall;
    const u = Clamp01((blastAge - f.startS) / Math.max(1e-3, f.endS - f.startS));
    let t = u * u;                                  // 重力：越落越快
    const after = blastAge - f.endS;
    if (after > 0 && after < f.bounceS) t = 1 - f.bounceRad * Math.sin(Math.PI * after / f.bounceS);   // 砸在塌顶木上弹一下
    return t;
  }

  /** 门楣南段落下：progress 0 = 还在门楣上（水平朝北），1 = 断头搁在塌顶木上。导演也可以直接调。 */
  FallLintel(progress) {
    const piece = this.lintel?.mesh;
    if (!piece) return;
    const t = Math.max(-0.2, Math.min(1, progress));
    this.lintelProgress = t;
    piece.quaternion.copy(this.lintel.qIntact).slerp(this.lintel.qRest, t);
    piece.updateMatrixWorld(true);
  }

  // ---------------------------------------------------------------- 塌顶木：近爆后卡在洞顶下，到 settle.phase 那一拍塌下来
  /** 0 = 卡在洞顶下（hang），1 = 落定（SB03A 画面上沿那一条）。导演 phase 到了 settle.phase（或 01 之后的任何一拍）开始落。 */
  RoofTimberSettled(stageId, phase) {
    const spec = this.roofTimber?.spec;
    if (!spec?.settle) return true;
    if (stageId !== "Trapped" && stageId !== "BunkerRescue") return true;
    const order = OPENING_STORYBOARDS.phases.Trapped, at = order.indexOf(spec.settle.phase), k = order.indexOf(phase);
    if (k < 0) return RescueShown(stageId, phase) || stageId !== "Trapped";      // 02 的拍，或没有导演 phase：已落定
    return k >= at;
  }

  UpdateRoofTimber(dt, stageId, phase) {
    const t = this.roofTimber;
    if (!t) return;
    const settled = this.RoofTimberSettled(stageId, phase);
    if (!settled) { t.age = null; t.sawHang = true; if (t.progress !== 0) this.PoseRoofTimber(0); return; }
    if (t.age == null) t.age = t.sawHang ? 0 : Infinity;      // 看着它卡在洞顶下的才演塌下来；选章 / 直接进 02 就是落定的
    t.age += dt;
    const s = t.spec.settle, u = Clamp01(t.age / s.seconds);
    let p = u * u;
    const after = t.age - s.seconds;
    if (after > 0 && after < s.bounceS) p = 1 - s.bounceRad * Math.sin(Math.PI * after / s.bounceS);
    if (p !== t.progress) {
      // 看着它塌下来的那一下：砸地的一小团土（和垫块同时出现，盖住它们「冒出来」）。
      if (t.sawHang && p >= 0.9 && (t.progress ?? 0) < 0.9 && this.blastFx) {
        const s = t.spec.settle, mid = t.restA.clone().lerp(t.restB, 0.7);
        this.blastFx.DirectionalBlast({ x: mid.x, y: mid.y - 0.3, z: mid.z }, { x: 0.35, y: 0.3, z: 0.2 },
          { clods: s.impact.clods, splinters: 0, spray: 0, dust: s.impact.dust, seconds: 0.3, spreadRad: 1.0, heightM: 0.15, groundY: this.groundAt(FLOOR.x, FLOOR.z),
            speed: { clods: [1, 3], splinters: [1, 2], spray: [1, 2], dust: [0.6, 1.6] } });
      }
      this.PoseRoofTimber(p);
    }
  }

  /** 塌顶木姿态：0 = hang，1 = 落定（a/b）。两头各自插值，网格局部 +z 从 a 指向 b。 */
  PoseRoofTimber(progress) {
    const t = this.roofTimber;
    if (!t) return;
    t.progress = progress;
    const a = t.hangA.clone().lerp(t.restA, progress), b = t.hangB.clone().lerp(t.restB, progress);
    t.mesh.position.copy(a).add(b).multiplyScalar(0.5);
    t.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), b.clone().sub(a).normalize());
    t.mesh.updateMatrixWorld(true);
    if (t.supports) t.supports.visible = progress >= 0.9;
  }

  // ---------------------------------------------------------------- lantern
  UpdateLantern(stageId, collapsed) {
    const lamp = this.lantern;
    if (!lamp) return;
    const s = lamp.spec, lit = s.litStages.includes(stageId);
    // 马灯只在 01 亮：出了 01 就把火光池的槽还回去（不等离开 03），灭了的灯不再占 LightRig 的名额；回跳到 01 再要回来。
    if (lamp.light.isClusterFire) {
      if (!lit && lamp.light.handle != null) {
        lamp.rig.RemoveFire(lamp.light.handle);
        this.fireHandles = this.fireHandles.filter((h) => h !== lamp.light.handle);
        lamp.light.handle = null;
      } else if (lit && lamp.light.handle == null) {
        lamp.light.handle = lamp.rig.AddFire(lamp.fireAt, lamp.fireOptions);
        this.fireHandles.push(lamp.light.handle);
      }
    }
    const [a, b, c] = s.light.flickerHz, t = this.time;
    const flicker = 1 - s.light.flicker * (0.5 + 0.25 * Math.sin(t * a * 2 * Math.PI) + 0.15 * Math.sin(t * b * 2 * Math.PI + 1.3) + 0.1 * Math.sin(t * c * 2 * Math.PI + 0.4));
    lamp.light.visible = lit;
    lamp.light.intensity = lit ? s.light.intensity * flicker : 0;
    if (lamp.light.isClusterFire && lamp.light.handle != null) lamp.rig.UpdateFire(lamp.light.handle, { intensity: lamp.light.intensity });
    lamp.glass.emissiveIntensity = lit ? 2.4 * flicker : 0.05;
    // 近爆那一下马灯晃（挂钩上摆），之后慢慢停住。
    const swing = collapsed ? 0.12 * Math.exp(-0.9 * (this.time - (lamp.swingFrom ??= this.time))) : 0;
    lamp.group.rotation.z = swing * Math.sin(this.time * 5.2);
  }

  // ---------------------------------------------------------------- build
  Build() {
    this.root = new THREE.Group(); this.root.name = "OpeningSet0103";
    this.collapsedRoot = new THREE.Group(); this.collapsedRoot.name = "OpeningSet0103_Collapsed"; this.collapsedRoot.visible = false;
    this.rescueRoot = new THREE.Group(); this.rescueRoot.name = "OpeningSet0103_Rescue"; this.rescueRoot.visible = false;
    this.root.add(this.collapsedRoot, this.rescueRoot);
    this.ownedMaterials = []; this.ownedTextures = []; this.lights = []; this.fireHandles = [];
    const sinks = { always: new BuildSink(), collapsed: new BuildSink(), rescue: new BuildSink() };
    const materials = new Map();
    this.sinkMaterials = materials;
    for (const prop of PROPS) {
      const sink = sinks[prop.show || "always"];
      if (!sink) throw new Error(`OpeningSet: unknown show ${prop.show} (${prop.id})`);
      sink.SetSector(`OpeningSet_${prop.show || "always"}`);
      this.BuildProp(prop, sink, materials);
    }
    const resolve = (name) => materials.get(name) || this.Lib(name);
    for (const [key, sink] of Object.entries(sinks)) {
      const parent = { collapsed: this.collapsedRoot, rescue: this.rescueRoot }[key] || this.root;
      for (const mesh of sink.Flush(parent, {}, { castShadow: true, receiveShadow: true, resolve })) mesh.name = `OpeningSet0103_${key}_${mesh.name}`;
    }
    this.scene.add(this.root);
    this.root.updateMatrixWorld(true);
    this.LoadExternals();
  }

  Lib(name, options) {
    // 真材质库在：缺配方就是写错名字，原样抛出（契约「不许静默退回」）。只有没有库（纯 node、编辑器预览）才用纯色。
    if (this.library?.Get) return this.library.Get(name, options);
    const key = `__fallback_${name}`;
    if (!this.sinkMaterials.has(key)) this.sinkMaterials.set(key, this.Own(new THREE.MeshStandardMaterial({ color: 0x6b5a45, roughness: 0.95 })));
    return this.sinkMaterials.get(key);
  }
  Own(material) { this.ownedMaterials.push(material); return material; }
  Floor(prop, x, z) { return prop.ground ? this.groundAt(prop.ground.x, prop.ground.z) : this.groundAt(x, z); }

  BuildProp(prop, sink, materials) {
    const kind = prop.kind;
    if (kind === "sandbagWall") return this.BuildSandbagWall(prop, sink);
    if (kind === "poster") return this.BuildPoster(prop, sink);
    if (kind === "lantern") return this.BuildLantern(prop);
    if (kind === "crateStack") return this.BuildCrates(prop, sink);
    if (kind === "fallingTimber") return this.BuildFallingTimber(prop, sink);
    if (kind === "timber") return this.BuildTimber(prop, sink);
    if (kind === "facade") return this.BuildFacade(prop, sink, materials);
    if (kind === "duckboards") return this.BuildDuckboards(prop, sink);
    if (kind === "revetment") return this.BuildRevetment(prop, sink);
    if (kind === "sandbagStakes") return this.BuildSandbagStakes(prop, sink);
    if (kind === "flag") return this.BuildFlag(prop, sink);
    if (kind === "planks") return this.BuildPlanks(prop, sink);
    if (kind === "mound") return this.BuildMound(prop, sink);
    if (kind === "earthSkin") return this.BuildEarthSkin(prop, sink);
    if (kind === "external") return null;       // 异步：LoadExternals
    throw new Error(`OpeningSet: unknown prop kind ${kind} (${prop.id})`);
  }

  BuildSandbagWall(prop, sink) {
    const rnd = Rng(prop.id), floor = this.Floor(prop, prop.a.x, prop.a.z);
    const along = new THREE.Vector3(prop.b.x - prop.a.x, 0, prop.b.z - prop.a.z), len = along.length(); along.normalize();
    const ry = Math.atan2(along.x, along.z) - Math.PI / 2;     // MakeSandbag 长轴沿局部 x
    for (let layer = 0; layer < prop.layers; layer++) {
      const stagger = layer % 2 ? prop.bagM / 2 : 0, count = Math.ceil((len + stagger) / prop.bagM);
      for (let i = 0; i < count; i++) {
        const s = Math.min(len - prop.bagM * 0.35, Math.max(prop.bagM * 0.35, i * prop.bagM - stagger + prop.bagM / 2));
        for (const row of [-0.25, 0.25]) {
          const x = prop.a.x + along.x * s + along.z * row * prop.depthM, z = prop.a.z + along.z * s - along.x * row * prop.depthM;
          sink.Add("Sandbag", PlaceGeometry(MakeSandbag(prop.bagM * (0.94 + rnd() * 0.08), prop.layerM * 1.25, prop.depthM * 0.52, TILE_METERS.sandbag, `${prop.id}${layer}${i}${row}`),
            { x, y: floor + prop.layerM * (layer + 0.55), z, ry: ry + (rnd() - 0.5) * 0.12, rz: (rnd() - 0.5) * 0.05 }));
        }
      }
    }
  }

  BuildPoster(prop, sink) {
    const floor = this.Floor(prop, prop.x, prop.z), b = prop.board, rnd = Rng(prop.id);
    // 背后的木板墙：竖板，洞底到顶板。
    for (let x = b.x0; x < b.x1 - 0.01; x += b.plankM) {
      const w = Math.min(b.plankM, b.x1 - x) - 0.012, h = b.lift1 - b.lift0 - rnd() * 0.08;
      sink.Add("WoodBeam", PlaceGeometry(MakeBox(w, h, 0.04, TILE_METERS.wood, `${prop.id}${x}`),
        { x: x + w / 2, y: floor + b.lift0 + h / 2, z: b.z + (rnd() - 0.5) * 0.02, rz: (rnd() - 0.5) * 0.02 }));
    }
    const material = this.Own(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0, alphaTest: 0.5, side: THREE.FrontSide }));
    if (!this.loadTexture) material.color.setHex(0xb8a27a);
    else {
      const generation = this.generation;
      this.loadTexture(prop.texture).then((texture) => {
        if (generation !== this.generation || !this.root) { texture.dispose(); return; }
        texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
        this.ownedTextures.push(texture); material.map = texture; material.needsUpdate = true;
      }).catch((error) => console.warn(`[OpeningSet] poster texture failed: ${error}`));
    }
    // 纸稍微起翘：一张 4×6 的面片，四角往外鼓一点。
    const paper = new THREE.PlaneGeometry(prop.w, prop.h, 4, 6), pos = paper.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i) / prop.w * 2, v = pos.getY(i) / prop.h * 2;
      pos.setZ(i, 0.012 * (u * u * v * v) + 0.004 * Math.sin(v * 5 + u * 3));
    }
    paper.computeVertexNormals();
    const key = `OpeningSetPoster_${prop.id}`;
    this.sinkMaterials.set(key, material);
    sink.Add(key, PlaceGeometry(paper, { x: prop.x, y: floor + prop.lift, z: b.z + 0.035, ry: (prop.faceYawDeg - 180) * DEG, rz: 0.03 }));
  }

  BuildLantern(prop) {
    const floor = this.Floor(prop, prop.x, prop.z);
    const group = new THREE.Group(); group.name = `OpeningSet0103_${prop.id}`;
    group.position.set(prop.x, floor + prop.lift + 0.16, prop.z);      // 挂点在灯顶提环上
    const steel = this.Own(new THREE.MeshStandardMaterial({ color: 0x2c2a26, roughness: 0.55, metalness: 0.7 }));
    const glass = this.Own(new THREE.MeshStandardMaterial({ color: 0xd9b27a, roughness: 0.2, metalness: 0, emissive: 0xffa04a, emissiveIntensity: 0, transparent: false }));
    const parts = [
      new THREE.CylinderGeometry(0.075, 0.085, 0.035, 12).translate(0, -0.3, 0),          // 油壶
      new THREE.CylinderGeometry(0.085, 0.07, 0.03, 12).translate(0, -0.27, 0),
      new THREE.ConeGeometry(0.075, 0.07, 12).translate(0, -0.08, 0),                        // 顶罩
      new THREE.CylinderGeometry(0.012, 0.012, 0.04, 6).translate(0, -0.03, 0),
      new THREE.TorusGeometry(0.06, 0.006, 5, 16, Math.PI).translate(0, -0.03, 0),          // 提环
    ];
    for (const [x, z] of [[0.06, 0], [-0.06, 0], [0, 0.06], [0, -0.06]]) parts.push(new THREE.CylinderGeometry(0.005, 0.005, 0.16, 4).translate(x, -0.19, z));  // 护栏
    const frameSink = new BuildSink();
    for (const g of parts) frameSink.Add("frame", Normalize(g));
    const glassSink = new BuildSink();
    glassSink.Add("glass", Normalize(new THREE.CylinderGeometry(0.05, 0.058, 0.15, 12).translate(0, -0.18, 0)));
    for (const mesh of frameSink.Flush(group, {}, { castShadow: false, resolve: () => steel })) mesh.name = `${group.name}_Frame`;
    for (const mesh of glassSink.Flush(group, {}, { castShadow: false, resolve: () => glass })) mesh.name = `${group.name}_Glass`;
    const nail = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.07), steel); nail.position.set(0, 0.0, 0); nail.name = `${group.name}_Nail`;
    group.add(nail);
    // 灯光走 LightRig 的火光池（簇光），**不往场景里放 three 的 PointLight**：每多/少一盏 visible 的 PointLight，
    // NUM_POINT_LIGHTS 就变一次，整座城的材质全部重编译（Script_ClusteredLights 文件头；01 进场与 01→02 灭灯各卡一次）。
    // 没有 LightRig（纯 node 测试、编辑器预览）才退回一盏 PointLight。
    const s = prop.light, rig = this.vfx?.lights?.AddFire ? this.vfx.lights : null;
    let light;
    if (rig) {
      const at = { x: group.position.x, y: group.position.y - 0.18, z: group.position.z };
      const fireOptions = { intensity: 0, radius: s.distanceM, color: s.color, flicker: false, priority: 2 };
      light = { isClusterFire: true, handle: rig.AddFire(at, fireOptions), visible: false, intensity: 0 };
      this.fireHandles.push(light.handle);
      this.lanternFire = { at, fireOptions };
    } else {
      light = new THREE.PointLight(s.color, 0, s.distanceM, s.decay);
      light.name = `${group.name}_Light`; light.castShadow = false; light.position.set(0, -0.18, 0);
      group.add(light);
      this.lights.push(light);
    }
    this.root.add(group);
    this.lantern = { spec: prop, group, light, glass, rig, fireAt: this.lanternFire?.at, fireOptions: this.lanternFire?.fireOptions };
  }

  BuildCrates(prop, sink) {
    const floor = this.Floor(prop, prop.x, prop.z), rnd = Rng(prop.id);
    let y = floor;
    for (const [i, layer] of prop.layers.entries()) {
      const ry = ((prop.yawDeg || 0) + (layer.dyawDeg || 0)) * DEG, cx = prop.x + (layer.dx || 0), cz = prop.z + (layer.dz || 0);
      const h = layer.lid ? layer.h * 0.9 : layer.h;
      sink.Add("WoodCrate", PlaceGeometry(MakeBox(layer.w, h, layer.d, 0.6, `${prop.id}${i}`), { x: cx, y: y + h / 2, z: cz, ry }));
      // 箱角包边与提手：两根横条，读得出是弹药箱不是方块。
      for (const side of [-1, 1]) sink.Add("WoodBeam", PlaceGeometry(MakeBox(0.04, h * 0.98, layer.d + 0.02, 0.8, `${prop.id}${i}e${side}`),
        { x: cx + Math.cos(ry) * side * (layer.w / 2 - 0.03), y: y + h / 2, z: cz - Math.sin(ry) * side * (layer.w / 2 - 0.03), ry }));
      if (layer.lid) {
        // 掀开的盖子斜靠在箱后沿。
        sink.Add("WoodCrate", PlaceGeometry(MakeBox(layer.w, 0.03, layer.d, 0.6, `${prop.id}lid`),
          { x: cx + Math.sin(ry) * (-layer.d * 0.55), y: y + h + layer.d * 0.3, z: cz + Math.cos(ry) * (-layer.d * 0.55), ry, rx: 1.05 + rnd() * 0.1 }));
      }
      y += h;
    }
  }

  BuildFallingTimber(prop, sink) {
    const floor = this.Floor(prop, prop.intact.x, prop.intact.z), i = prop.intact, rnd = Rng(prop.id);
    // 北段还搁在北柱顶上：它是 MISSION_SCENARIO 塌方态的 Space 体块 BunkerMouthLintelN（整关都在，04 以后洞口不会
    // 少一根门楣）。这里只加断口处几根劈开的木刺。
    for (let k = 0; k < 4; k++) sink.Add("WoodBeam", PlaceGeometry(MakeBox(0.04 + rnd() * 0.03, 0.03 + rnd() * 0.03, 0.18 + rnd() * 0.14, TILE_METERS.wood, `${prop.id}sN${k}`),
      { x: i.x + (rnd() - 0.5) * i.w * 0.8, y: floor + i.lift + (rnd() - 0.5) * i.h * 0.7, z: prop.breakZ + 0.06, rx: (rnd() - 0.5) * 0.5, ry: (rnd() - 0.5) * 0.4 }));
    // 南段：以南门柱顶为轴落下，单独一只网格（每帧设姿态）。局部 -z 指向断头。
    const pivot = new THREE.Vector3(prop.pivot.x, floor + prop.pivot.lift, prop.pivot.z);
    const rest = new THREE.Vector3(prop.rest.x, floor + prop.rest.lift, prop.rest.z);
    const len = pivot.distanceTo(rest), over = Math.max(0, prop.pivot.z - (i.z + i.d / 2)) * -1 + 0.1;
    const parts = [PlaceGeometry(MakeBox(i.w, i.h, len + over, TILE_METERS.wood, `${prop.id}S`), { z: -(len - over) / 2 })];
    for (let k = 0; k < 5; k++) parts.push(PlaceGeometry(MakeBox(0.04 + rnd() * 0.04, 0.03 + rnd() * 0.04, 0.22 + rnd() * 0.2, TILE_METERS.wood, `${prop.id}sS${k}`),
      { x: (rnd() - 0.5) * i.w * 0.8, y: (rnd() - 0.5) * i.h * 0.7, z: -len - 0.08, rx: (rnd() - 0.5) * 0.6, ry: (rnd() - 0.5) * 0.5 }));
    const pieceSink = new BuildSink();
    for (const g of parts) pieceSink.Add("WoodBeam", g);
    const [mesh] = pieceSink.Flush(this.collapsedRoot, {}, { castShadow: true, receiveShadow: true, resolve: () => this.Lib("WoodBeam") });
    mesh.name = `OpeningSet0103_${prop.id}_Falling`;
    mesh.position.copy(pivot);
    const qIntact = new THREE.Quaternion();                              // 局部 -z = 世界 -z（朝北，沿门楣）
    const qRest = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), rest.clone().sub(pivot).normalize());
    this.lintel = { spec: prop, mesh, qIntact, qRest };
    this.FallLintel(0);
  }

  BuildTimber(prop, sink) {
    const floor = this.Floor(prop, prop.a.x, prop.a.z);
    const a = new THREE.Vector3(prop.a.x, floor + prop.a.lift, prop.a.z), b = new THREE.Vector3(prop.b.x, floor + prop.b.lift, prop.b.z);
    const rnd = Rng(prop.id);
    if (prop.hang) {
      // 会塌的那根：单独一只网格（原点在中点、局部 +z 沿木料），每帧由 PoseRoofTimber 摆。
      const len = a.distanceTo(b), pieceSink = new BuildSink();
      pieceSink.Add("WoodBeam", MakeBox(prop.w, prop.h, len, TILE_METERS.wood, prop.id));
      const [mesh] = pieceSink.Flush(this.collapsedRoot, {}, { castShadow: true, receiveShadow: true, resolve: () => this.Lib("WoodBeam") });
      mesh.name = `OpeningSet0103_${prop.id}_Settling`;
      const V = (p) => new THREE.Vector3(p.x, floor + p.lift, p.z);
      this.roofTimber = { spec: prop, mesh, restA: a, restB: b, hangA: V(prop.hang.a), hangB: V(prop.hang.b), progress: null, age: null };
      this.PoseRoofTimber(0);
    } else sink.Add("WoodBeam", Beam(a, b, { w: prop.w, h: prop.h, seed: prop.id }));
    // 断口的木刺（断板用）：挂在下端。
    const dir = b.clone().sub(a).normalize();
    for (let k = 0; k < (prop.splinters || 0); k++) {
      const tip = b.clone().addScaledVector(dir, 0.04 + rnd() * 0.12);
      tip.x += (rnd() - 0.5) * prop.w * 0.8;
      sink.Add("WoodBeam", Beam(b.clone().addScaledVector(dir, -0.05), tip, { w: 0.02 + rnd() * 0.03, h: 0.015 + rnd() * 0.02, seed: `${prop.id}s${k}` }));
    }
    // 两头垫的土块：会塌的那根，土块跟它一起下来（塌下之前不在：南头那堆在 SB03 画面右下，审查 09-25）。
    const supportSink = prop.hang ? new BuildSink() : sink;
    for (const s of prop.supports || []) for (let k = 0; k < 5; k++)
      supportSink.Add("GroundRubble", PlaceGeometry(Normalize(new THREE.DodecahedronGeometry(0.5, 0)), {
        x: s.x + (rnd() - 0.5) * s.w * 0.6, y: floor + s.h * (0.25 + rnd() * 0.3), z: s.z + (rnd() - 0.5) * s.d * 0.6,
        ry: rnd() * 6, rx: rnd() * 2, scale: 0.16 + rnd() * 0.1 }));
    if (prop.hang && prop.supports?.length) {
      const group = new THREE.Group(); group.name = `OpeningSet0103_${prop.id}_Supports`; group.visible = false;
      this.collapsedRoot.add(group);
      supportSink.Flush(group, {}, { castShadow: true, receiveShadow: true, resolve: () => this.Lib("GroundRubble") });
      this.roofTimber.supports = group;
      this.PoseRoofTimber(this.roofTimber.progress ?? 0);
    }
  }

  BuildFacade(prop, sink, materials) {
    const rnd = Rng(prop.id), z = prop.z;
    const floorAt = (x) => this.groundAt(x, z + 0.25);         // 沟底（立面南侧一点），北壁坡脚取样会偏高
    const opens = prop.openings;
    const Inside = (x, y) => opens.some((o) => x > o.x0 && x < o.x1 && y < o.h);
    // 后仰（prop.lean）：离沟底 fromM 以下竖直，以上按 deg 往北仰、贴着北壁坡面（坡面约 70°），立面上半截不再悬在坡面前面。
    // Back(h)：离沟底 h 处立面往北退多少（负 z）；Tilt(h)：那一截的绕 x 轴转角（负值＝顶往北）。
    const lean = prop.lean ? { from: prop.lean.fromM, t: Math.tan(prop.lean.deg * DEG), rad: prop.lean.deg * DEG } : null;
    const Back = (h) => lean ? -Math.max(0, h - lean.from) * lean.t : 0;
    const Tilt = (h) => lean && h > lean.from ? -lean.rad : 0;
    // 横板：一行一行铺，开口处断开。
    for (let y = 0; y < prop.heightM - 0.01; y += prop.plankM) {
      const h = Math.min(prop.plankM, prop.heightM - y) - 0.015, yc = y + h / 2;
      let start = null;
      for (let x = prop.x0; x <= prop.x1 + 1e-6; x += 0.05) {
        const open = Inside(x, yc) || x >= prop.x1;
        if (!open && start == null) start = x;
        if ((open || x >= prop.x1) && start != null) {
          const end = Math.min(x, prop.x1), w = end - start;
          if (w > 0.05) sink.Add("WoodBeam", PlaceGeometry(MakeBox(w, h, 0.05, TILE_METERS.wood, `${prop.id}${y}${start}`),
            { x: (start + end) / 2, y: floorAt((start + end) / 2) + yc, z: z + Back(yc) + (rnd() - 0.5) * 0.015, rx: Tilt(yc), rz: (rnd() - 0.5) * 0.015 }));
          start = null;
        }
      }
    }
    // 立柱：两头 + 每个开口两侧；开口上方过梁；门内黑。后仰时立柱在 fromM 处折成两段（下段竖直、上段后仰），两段首尾相接。
    const posts = new Set([prop.x0 + prop.postM / 2, prop.x1 - prop.postM / 2]);
    for (const o of opens) { posts.add(o.x0 - prop.postM / 2 + 0.02); posts.add(o.x1 + prop.postM / 2 - 0.02); }
    for (const x of posts) {
      const rz = (rnd() - 0.5) * 0.03, top = prop.heightM + 0.05;
      if (!lean) {
        sink.Add("WoodBeam", PlaceGeometry(MakeBox(prop.postM, prop.heightM + 0.1, prop.postM, TILE_METERS.wood, `${prop.id}p${x}`),
          { x, y: floorAt(x) + (prop.heightM + 0.1) / 2 - 0.05, z: z + 0.05, rz }));
        continue;
      }
      const lowH = lean.from + 0.05, upH = top - lean.from, mid = lean.from + upH / 2;
      sink.Add("WoodBeam", PlaceGeometry(MakeBox(prop.postM, lowH, prop.postM, TILE_METERS.wood, `${prop.id}p${x}`),
        { x, y: floorAt(x) + lowH / 2 - 0.05, z: z + 0.05, rz }));
      sink.Add("WoodBeam", PlaceGeometry(MakeBox(prop.postM, upH / Math.cos(lean.rad), prop.postM, TILE_METERS.wood, `${prop.id}pu${x}`),
        { x, y: floorAt(x) + mid, z: z + 0.05 + Back(mid), rx: -lean.rad, rz }));
    }
    const voidKey = "OpeningSetVoid";
    if (!materials.has(voidKey)) materials.set(voidKey, this.Own(new THREE.MeshStandardMaterial({ color: 0x050403, roughness: 1, metalness: 0 })));
    for (const o of opens) {
      const w = o.x1 - o.x0, x = (o.x0 + o.x1) / 2, lintelH = o.h + 0.1;
      sink.Add("WoodBeam", PlaceGeometry(MakeBox(w + prop.postM * 2, 0.2, 0.24, TILE_METERS.wood, `${prop.id}l${x}`),
        { x, y: floorAt(x) + lintelH, z: z + 0.04 + Back(lintelH), rx: Tilt(lintelH) }));
      if (!lean) sink.Add(voidKey, PlaceGeometry(MakeBox(w, o.h, 0.04, 1, `${prop.id}v${x}`), { x, y: floorAt(x) + o.h / 2, z: z - 0.1 }));
      else {
        // 后仰的门：门内黑贴着门框（退 3 cm），也折成两段——退 10 cm 的话，后仰那段整个埋进北壁坡面里，门洞里露出的是土。
        const upH = o.h - lean.from, mid = lean.from + upH / 2;
        sink.Add(voidKey, PlaceGeometry(MakeBox(w, lean.from, 0.04, 1, `${prop.id}v${x}`), { x, y: floorAt(x) + lean.from / 2, z: z - 0.03 }));
        sink.Add(voidKey, PlaceGeometry(MakeBox(w, upH / Math.cos(lean.rad), 0.04, 1, `${prop.id}vu${x}`),
          { x, y: floorAt(x) + mid, z: z - 0.03 + Back(mid), rx: -lean.rad }));
      }
      sink.Add("WoodBeam", PlaceGeometry(MakeBox(w, 0.06, 0.3, TILE_METERS.wood, `${prop.id}t${x}`), { x, y: floorAt(x) + 0.03, z: z - 0.02 }));   // 门槛
    }
  }

  BuildDuckboards(prop, sink) {
    const rnd = Rng(prop.id), paths = [prop.path, prop.path2].filter(Boolean);
    const cols = prop.columns || 1, pitch = prop.width + (prop.columnGapM || 0);
    for (const path of paths) for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], d = new THREE.Vector3(b.x - a.x, 0, b.z - a.z), len = d.length(); d.normalize();
      const n = new THREE.Vector3(d.z, 0, -d.x), ry = Math.atan2(d.x, d.z);
      for (let c = 0; c < cols; c++) {
        const off = (c - (cols - 1) / 2) * pitch;
        // 两根纵梁，分成 1.2 m 一段贴地。
        for (let s = 0; s < len - 0.05; s += 1.2) {
          const e = Math.min(len, s + 1.2);
          for (const side of [-0.36, 0.36]) {
            const P0 = (t) => new THREE.Vector3(a.x + d.x * t + n.x * (off + side * prop.width), 0, a.z + d.z * t + n.z * (off + side * prop.width));
            const p0 = P0(s), p1 = P0(e);
            p0.y = this.groundAt(p0.x, p0.z) + 0.025; p1.y = this.groundAt(p1.x, p1.z) + 0.025;
            sink.Add("WoodBeam", Beam(p0, p1, { w: 0.06, h: 0.05, seed: `${prop.id}${c}${s}${side}` }));
          }
        }
        for (let s = prop.slatM / 2; s < len; s += prop.slatM + prop.gapM) {
          if (rnd() < 0.04) continue;                                     // 偶尔缺一块
          const x = a.x + d.x * s + n.x * off, z = a.z + d.z * s + n.z * off;
          sink.Add("WoodBeam", PlaceGeometry(MakeBox(prop.width * (0.94 + rnd() * 0.08), 0.03, prop.slatM, TILE_METERS.wood, `${prop.id}${c}${s}`),
            { x, y: this.groundAt(x, z) + 0.066, z, ry: ry + (rnd() - 0.5) * 0.06, rz: (rnd() - 0.5) * 0.04 }));
        }
      }
    }
  }

  BuildRevetment(prop, sink) {
    const rnd = Rng(prop.id), lean = prop.leanDeg * DEG;
    for (const run of prop.runs) for (let i = 1; i < run.path.length; i++) {
      const heightM = run.heightM ?? prop.heightM;               // 一段自己的高（沟壁矮的那一段压到沟沿，不冒出地面）
      const a = run.path[i - 1], b = run.path[i], n = WallNormal(a, b, run.side);
      const d = new THREE.Vector3(b.x - a.x, 0, b.z - a.z), len = d.length(); d.normalize();
      const axis = new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3().crossVectors(UP, n).normalize(), -lean);   // 顶朝墙里斜
      if (axis.dot(n) < 0) axis.set(n.x * Math.sin(lean), Math.cos(lean), n.z * Math.sin(lean));
      const count = Math.max(2, Math.round(len / prop.postEveryM) + 1);
      const ground = [];
      for (let k = 0; k < count; k++) {
        const t = k / (count - 1), x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, y = this.groundAt(x, z);
        ground.push(y);
        sink.Add("WoodBeam", Post(new THREE.Vector3(x, y - 0.15, z), axis, heightM + 0.15 + rnd() * 0.12, 0.09, { round: true, seed: `${prop.id}${i}${k}` }));
      }
      const g0 = Math.min(...ground);
      for (let l = 0; l < prop.logs; l++) {
        const hy = (l + 0.5) / prop.logs * heightM * 0.92, back = Math.tan(lean) * hy - 0.07;
        const p0 = new THREE.Vector3(a.x + n.x * back - d.x * 0.1, g0 + hy, a.z + n.z * back - d.z * 0.1);
        const p1 = new THREE.Vector3(b.x + n.x * back + d.x * 0.1, g0 + hy + (rnd() - 0.5) * 0.04, b.z + n.z * back + d.z * 0.1);
        sink.Add("WoodBeam", Beam(p0, p1, { w: prop.round ? 0.14 : 0.12, h: 0.1, round: !!prop.round || l % 2 === 0, seed: `${prop.id}${i}l${l}` }));
      }
    }
  }

  BuildSandbagStakes(prop, sink) {
    const rnd = Rng(prop.id);
    for (const run of prop.runs) for (let i = 1; i < run.length; i++) {
      const a = run[i - 1], b = run[i], d = new THREE.Vector3(b.x - a.x, 0, b.z - a.z), len = d.length(); d.normalize();
      // 指向沟里：默认北（南沟沿的沙袋），inward 可写 east/west/south（缺口西沿的沙袋朝东）。
      const inward = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] }[prop.inward || "north"];
      const n = new THREE.Vector3(d.z, 0, -d.x); if (n.x * inward[0] + n.z * inward[1] < 0) n.negate();
      const ry = Math.atan2(d.x, d.z) - Math.PI / 2;
      for (let layer = 0; layer < prop.layers; layer++) {
        const stagger = layer % 2 ? prop.bagM / 2 : 0;
        for (let s = prop.bagM / 2 - stagger; s < len; s += prop.bagM) {
          if (s < 0.1) continue;
          const x = a.x + d.x * s - n.x * (prop.depthM * 0.25), z = a.z + d.z * s - n.z * (prop.depthM * 0.25);
          sink.Add("Sandbag", PlaceGeometry(MakeSandbag(prop.bagM * (0.93 + rnd() * 0.1), prop.layerM * 1.25, prop.depthM * 0.8, TILE_METERS.sandbag, `${prop.id}${i}${layer}${s}`),
            { x, y: this.groundAt(x, z) + prop.layerM * (layer + 0.5) - 0.03, z, ry: ry + (rnd() - 0.5) * 0.15, rz: (rnd() - 0.5) * 0.06 }));
        }
      }
      for (let s = 0.3; s < len; s += prop.stakeEveryM) {
        const x = a.x + d.x * s + n.x * (prop.depthM * 0.5 + 0.06), z = a.z + d.z * s + n.z * (prop.depthM * 0.5 + 0.06), y = this.groundAt(x, z);
        const axis = new THREE.Vector3(-n.x * 0.12, 1, -n.z * 0.12).normalize();
        sink.Add("WoodBeam", Post(new THREE.Vector3(x, y - prop.stakeBelowM, z), axis, prop.stakeBelowM + prop.stakeAboveM + rnd() * 0.1, 0.07, { round: true, seed: `${prop.id}st${s}` }));
      }
    }
  }

  BuildFlag(prop, sink) {
    const moving=Number.isFinite(prop.fallYawDeg),targetSink=moving?new BuildSink():sink;
    sink=targetSink;
    const y = this.groundAt(prop.x, prop.z) - 0.25;
    sink.Add("WoodBeam", Post(new THREE.Vector3(prop.x, y, prop.z), new THREE.Vector3(0.03, 1, 0.02).normalize(), prop.poleM + 0.25, 0.045, { round: true, seed: prop.id }));
    const [w, h] = prop.cloth, cloth = new THREE.PlaneGeometry(w, h, 10, 5), pos = cloth.attributes.position;
    // 旗面挂在杆顶，沿 fly 方向伸出；布自己往下耷、有两道褶。
    for (let i = 0; i < pos.count; i++) {
      const u = (pos.getX(i) + w / 2) / w;          // 0 在杆边，1 在旗尾
      pos.setZ(i, 0.06 * Math.sin(u * 7.5 + 0.6) * u + 0.02 * Math.sin(pos.getY(i) * 9) * u);
      pos.setY(i, pos.getY(i) - 0.1 * u * u);
    }
    cloth.translate(w / 2 + 0.03, 0, 0); cloth.computeVertexNormals();
    const key = `OpeningSetFlag_${prop.id}`;
    const material = this.Own(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0, side: THREE.DoubleSide }));
    const texture = this.FlagTexture(prop.id,prop.faction);
    if (texture) { material.map = texture; this.ownedTextures.push(texture); } else material.color.setHex(0xd8d0bf);
    this.sinkMaterials.set(key, material);
    sink.Add(key, PlaceGeometry(cloth, { x: prop.x + 0.03 * (prop.poleM + 0.25), y: y + 0.25 + prop.poleM - h / 2 - 0.04, z: prop.z + 0.02 * (prop.poleM + 0.25), ry: (prop.flyYawDeg + 90) * DEG }));

    if(moving){
      const group=new THREE.Group();group.name=`OpeningFlag_${prop.id}`;this.root.add(group);
      const base=new THREE.Vector3(prop.x,y+.25,prop.z);
      const meshes=sink.Flush(group,{}, {castShadow:true,receiveShadow:true,resolve:name=>this.sinkMaterials.get(name)||this.Lib(name)});
      for(const mesh of meshes)mesh.geometry.translate(-base.x,-base.y,-base.z);
      group.position.copy(base);(this.flags??=new Map()).set(prop.id,{group,spec:prop,progress:0});
    }
  }
  PoseFlag(id,progress){
    const flag=this.flags?.get(id);if(!flag||flag.progress===Clamp01(progress))return;
    const yaw=flag.spec.fallYawDeg*DEG,axis=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
    flag.progress=Clamp01(progress);
    flag.group.quaternion.setFromAxisAngle(axis,Math.PI*.49*flag.progress);
    flag.group.updateMatrixWorld(true);
  }
  /** 国军旗：红地、蓝色旗角与十二道白日光芒，叠加泥点与雨渍。 */
  FlagTexture(seed,faction="nra") {
    const canvas = this.makeCanvas?.(256, 168);
    const ctx = canvas?.getContext?.("2d");
    if (!ctx) return null;
    const rnd = Rng(seed), W = canvas.width, H = canvas.height;
    ctx.fillStyle = faction==="nra"?"#a52a23":"#d9d2c1"; ctx.fillRect(0, 0, W, H);
    if(faction==="nra"){
      ctx.fillStyle="#193b70";ctx.fillRect(0,0,W/2,H/2);
      const cx=W/4,cy=H/4,outer=H*.18,inner=outer*.5;
      ctx.fillStyle="#eee6d1";ctx.beginPath();
      for(let i=0;i<24;i++){const a=-Math.PI/2+i*Math.PI/12,r=i%2?inner:outer;const x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}
      ctx.closePath();ctx.fill();ctx.beginPath();ctx.arc(cx,cy,inner*.92,0,Math.PI*2);ctx.fill();
    }
    for (let k = 0; k < 900; k++) { ctx.fillStyle = `rgba(${90 + rnd() * 40},${70 + rnd() * 30},${50 + rnd() * 20},${0.03 + rnd() * 0.06})`; ctx.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 6, 1 + rnd() * 4); }
    if(faction!=="nra"){ctx.fillStyle = "#a3231d"; ctx.beginPath(); ctx.arc(W / 2, H / 2, H * 0.3, 0, Math.PI * 2); ctx.fill();}
    const grad = ctx.createLinearGradient(0, H * 0.55, 0, H);
    grad.addColorStop(0, "rgba(80,60,40,0)"); grad.addColorStop(1, "rgba(80,60,40,0.45)");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    for (let k = 0; k < 40; k++) { ctx.fillStyle = `rgba(60,45,30,${0.1 + rnd() * 0.25})`; ctx.beginPath(); ctx.arc(rnd() * W, H * (0.5 + rnd() * 0.5), 1 + rnd() * 5, 0, Math.PI * 2); ctx.fill(); }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  BuildPlanks(prop, sink) {
    for (const [k, p] of prop.planks.entries())
      sink.Add("WoodBeam", PlaceGeometry(MakeBox(p.w, p.t, p.len, TILE_METERS.wood, `${prop.id}${k}`),
        { x: p.x, y: this.groundAt(p.x, p.z) + p.lift, z: p.z, ry: (p.yawDeg || 0) * DEG, rx: (p.pitchDeg || 0) * DEG, rz: (p.rollDeg || 0) * DEG }));
  }

  /**
   * Space 体块的土皮（SB05 左半那块平的深褐方块）：选定的几面贴一层起伏的土（外鼓 0.015–bulgeM）、顶上压一层土，
   * 再钉几根护壁木桩、两道横板。体块本身（碰撞、掩体标签）不动；土皮只往外长，不会出现隐形墙。
   */
  BuildEarthSkin(prop, sink) {
    const block = MISSION_LAYOUT.scenario.states.find((s) => s.id === "BunkerCollapsed")?.blocks.find((b) => b.id === prop.block);
    if (!block) throw new Error(`OpeningSet: earthSkin block ${prop.block} is not in the collapsed scenario`);
    const rnd = Rng(`${prop.id}${prop.seed}`), bottom = block.y - block.h / 2 - 0.06, top = block.y + block.h / 2;
    const Noise = (a, b) => 0.5 + 0.28 * Math.sin(a * 5.1 + b * 2.3 + prop.seed) + 0.22 * Math.sin(a * 11.7 - b * 7.9 + 1.7 * prop.seed);
    const faces = {
      north: { o: new THREE.Vector3(block.x - block.w / 2, 0, block.z - block.d / 2), t: new THREE.Vector3(1, 0, 0), n: new THREE.Vector3(0, 0, -1), len: block.w },
      south: { o: new THREE.Vector3(block.x + block.w / 2, 0, block.z + block.d / 2), t: new THREE.Vector3(-1, 0, 0), n: new THREE.Vector3(0, 0, 1), len: block.w },
      west: { o: new THREE.Vector3(block.x - block.w / 2, 0, block.z + block.d / 2), t: new THREE.Vector3(0, 0, -1), n: new THREE.Vector3(-1, 0, 0), len: block.d },
      east: { o: new THREE.Vector3(block.x + block.w / 2, 0, block.z - block.d / 2), t: new THREE.Vector3(0, 0, 1), n: new THREE.Vector3(1, 0, 0), len: block.d },
    };
    const Grid = (nu, nv, at) => {
      const pos = [], uv = [], index = [];
      for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const [p, u, v] = at(i / nu, j / nv); pos.push(p.x, p.y, p.z); uv.push(u, v); }
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
        const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
        index.push(a, c, b, b, c, d);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(index); g.computeVertexNormals();
      return g;
    };
    for (const [key, dress] of Object.entries(prop.faces)) {
      const f = faces[key], h = top - bottom;
      // 面：沿面 0→len、竖直 bottom→top；最上一排往里收 0.12、往上 0.05，接住顶上的土。两端各多出 0.08 包住棱角。
      sink.Add("GroundRubble", Grid(Math.ceil(f.len / 0.12) + 2, Math.ceil(h / 0.12), (u, v) => {
        const s = -0.08 + u * (f.len + 0.16), y = bottom + v * h, lip = v > 0.97 ? 1 : 0;
        const out = 0.015 + (prop.bulgeM - 0.015) * Noise(s, y) * (0.6 + 0.4 * Math.sin(v * Math.PI));
        const p = f.o.clone().addScaledVector(f.t, s).addScaledVector(f.n, out - lip * 0.12);
        p.y = y + lip * 0.05;
        return [p, s / 1.2, y / 1.2];
      }));
      // 护壁木桩：贴着土皮外面，顶比体块高一点、微微往墙里斜。
      const st = dress.stakes;
      for (let s = 0.2; st && s < f.len - 0.1; s += st.everyM) {
        const base = f.o.clone().addScaledVector(f.t, s + (rnd() - 0.5) * 0.08).addScaledVector(f.n, prop.bulgeM + st.w / 2);
        base.y = bottom;
        const axis = new THREE.Vector3(-f.n.x * 0.06, 1, -f.n.z * 0.06).normalize();
        sink.Add("WoodBeam", Post(base, axis, h + st.aboveM + rnd() * 0.1, st.w, { round: true, seed: `${prop.id}${key}${s}` }));
      }
      // 横板：压在木桩外侧。
      for (const lift of st ? dress.planks || [] : []) {
        const y = bottom + 0.06 + lift, off = prop.bulgeM + st.w + 0.018;
        const a = f.o.clone().addScaledVector(f.t, 0.05).addScaledVector(f.n, off), b = f.o.clone().addScaledVector(f.t, f.len - 0.05).addScaledVector(f.n, off);
        a.y = y + (rnd() - 0.5) * 0.04; b.y = y + (rnd() - 0.5) * 0.04;
        sink.Add("WoodBeam", Beam(a, b, { w: 0.18, h: 0.035, seed: `${prop.id}${key}p${lift}` }));
      }
    }
    // 顶上的土：起伏的一层，四边垂到体块顶以下一点。
    sink.Add("GroundRubble", Grid(12, 12, (u, v) => {
      const x = block.x - block.w / 2 - 0.1 + u * (block.w + 0.2), z = block.z - block.d / 2 - 0.1 + v * (block.d + 0.2);
      const edge = Math.min(u, 1 - u, v, 1 - v), y = top + (edge < 0.05 ? -0.04 : 0.02 + 0.08 * Noise(x, z) * Math.min(1, edge * 6));
      return [new THREE.Vector3(x, y, z), x / 1.2, z / 1.2];
    }));
  }

  BuildMound(prop, sink) {
    const rnd = Rng(`${prop.id}${prop.seed}`), g = new THREE.SphereGeometry(1, 18, 7, 0, Math.PI * 2, 0, Math.PI / 2), pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), bump = 1 + (rnd() - 0.5) * (prop.bump ?? 0.22) * (0.4 + y);
      pos.setXYZ(i, x * prop.rx * bump, y * prop.peak * bump, z * prop.rz * bump);
    }
    g.computeVertexNormals();
    sink.Add("GroundRubble", PlaceGeometry(Normalize(g), { x: prop.x, y: this.groundAt(prop.x, prop.z) - (prop.sink ?? 0.04), z: prop.z }));
    for (let k = 0; k < 6; k++) {                      // 散落的土块
      const a = rnd() * Math.PI * 2, r = 0.9 + rnd() * 0.4;
      const x = prop.x + Math.cos(a) * prop.rx * r, z = prop.z + Math.sin(a) * prop.rz * r;
      sink.Add("GroundRubble", PlaceGeometry(Normalize(new THREE.DodecahedronGeometry(0.5, 0)), { x, y: this.groundAt(x, z) + 0.02, z, ry: rnd() * 6, rx: rnd() * 2, scale: 0.08 + rnd() * 0.1 }));
    }
  }

  // ---------------------------------------------------------------- 03 前沿布景（阵位破砖墙、缺口倒墙、护壁、弹药箱）
  BuildFront() {
    const root = new THREE.Group(); root.name = "OpeningSet0103_Front";
    const front = { root, ownedMaterials: [] };
    const sink = new BuildSink(), materials = new Map();
    sink.SetSector("OpeningSet_Front");
    // 砖：城墙灰砖染成土黄灰（契约：阵位白盒改成「土黄砖色」的破砖墙；参考概念图 04）。缺配方就抛（不静默退回）。
    materials.set("OpeningSetBrick", this.FrontLib(front, BRICK.recipe, { color: BRICK.color }));
    const resolve = (name) => materials.get(name) || this.FrontLib(front, name);
    const saved = { sinkMaterials: this.sinkMaterials, ownedMaterials: this.ownedMaterials };
    this.sinkMaterials = materials; this.ownedMaterials = front.ownedMaterials;
    // 能被打塌的体块：每一级一份砖壳，各自一个组（只有当前级那一组显示，见 SyncBreakables）。
    front.breakables = [];
    try {
      for (const prop of FRONT_PROPS) {
        const breakable = prop.kind === "brickShell" ? FRONT_BREAKABLES.find((b) => b.block === prop.block) : null;
        if (breakable) {
          const block = MISSION_LAYOUT.blocks.find((b) => b.id === prop.block), groups = [];
          for (const top of BreakableTops(block, breakable, this.groundAt)) {
            const variant = new BuildSink(), group = new THREE.Group();
            variant.SetSector("OpeningSet_Front");
            group.name = `OpeningSet0103_Front_${prop.id}_${groups.length}`;
            group.visible = groups.length === 0;
            this.BuildBrickShell(prop, variant, groups.length ? top : null);
            for (const mesh of variant.Flush(group, {}, { castShadow: true, receiveShadow: true, resolve })) mesh.name = `${group.name}_${mesh.name}`;
            root.add(group); groups.push(group);
          }
          front.breakables.push({ id: breakable.id, block: prop.block, groups, stage: 0 });
        } else if (prop.kind === "brickShell") this.BuildBrickShell(prop, sink);
        else if (prop.kind === "collapsedWall") this.BuildCollapsedWall(prop, sink);
        else this.BuildProp(prop, sink, materials);
      }
    } finally { this.sinkMaterials = saved.sinkMaterials; this.ownedMaterials = saved.ownedMaterials; }
    for (const mesh of sink.Flush(root, {}, { castShadow: true, receiveShadow: true, resolve })) mesh.name = `OpeningSet0103_Front_${mesh.name}`;
    this.scene.add(root);
    root.updateMatrixWorld(true);
    this.front = front;
  }

  /**
   * 砖壳跟着可破坏体块的当前级走（Script_FirstLevelFrontBreakables 由战车运行时在 04 前后建；没建之前按第 0 级）。
   * breakables：它的实例（有 items[].spec.block / stage）或 null。
   */
  SyncBreakables(breakables) {
    if (!this.front?.breakables?.length) return;
    for (const entry of this.front.breakables) {
      const item = breakables?.items?.find((it) => it.spec?.block === entry.block);
      const stage = Math.max(0, Math.min(entry.groups.length - 1, item?.stage ?? 0));
      if (stage === entry.stage) continue;
      entry.stage = stage;
      entry.groups.forEach((group, k) => { group.visible = k === stage; });
    }
  }

  /** 前沿组自己的库材质（缺配方时的纯色兜底归前沿组，随它 dispose）。 */
  FrontLib(front, name, options) {
    if (this.library?.Get) return this.library.Get(name, options);      // 真库在：缺配方原样抛出
    const material = new THREE.MeshStandardMaterial({ color: name.startsWith("Brick") ? 0x9a7a58 : 0x6b5a45, roughness: 0.95 });
    front.ownedMaterials.push(material);
    return material;
  }

  /**
   * 破砖墙壳：把阵位体块整个包进去（每面外扩 BRICK.skinM，墙头只往上长），墙头按整皮、整砖退台出锯齿。
   * 体块本身的碰撞、掩体、射界一个不动；壳子只比体块高，不会有「看着是缺口其实是墙」。
   */
  BuildBrickShell(prop, sink, brokenTop = null) {
    const block = MISSION_LAYOUT.blocks.find((b) => b.id === prop.block);
    if (!block) throw new Error(`OpeningSet: ${prop.id} wraps missing block ${prop.block}`);
    const rnd = Rng(`${prop.id}${prop.seed}${brokenTop ?? ""}`), skin = BRICK.skinM, course = BRICK.courseM;
    const alongX = block.w >= block.d, L = alongX ? block.w : block.d, T = (alongX ? block.d : block.w) + skin * 2;
    // 打塌以后（brokenTop：那一级的墙顶世界高度）墙头锯齿收到 1–2 皮碎砖。
    const top = (brokenTop ?? block.y + block.h / 2) + 0.02, base = block.y - block.h / 2;
    const extraM = brokenTop == null ? prop.extraM : Math.min(prop.extraM, 0.2);
    const ry = (block.ry || 0) + (alongX ? 0 : Math.PI / 2);
    const c = Math.cos(ry), s = Math.sin(ry);
    // 局部 u（沿墙，-L/2…L/2）→ 世界。ry 与 PlaceGeometry 同一约定（局部 +x 转到 (cos ry, 0, -sin ry)）。
    const At = (u, v = 0) => ({ x: block.x + u * c + v * s, z: block.z - u * s + v * c });
    sink.Add("OpeningSetBrick", PlaceGeometry(MakeBox(L + skin * 2, top - base, T, TILE_METERS.brick, `${prop.id}core`),
      { x: block.x, y: (top + base) / 2, z: block.z, ry }));
    const Extra = (u) => {
      const t = (u + L / 2) / L;
      let e = 0;
      for (const p of prop.peaks) e = Math.max(e, p.h * Math.max(0, 1 - Math.abs(t - p.s) / p.w));
      if (prop.breach) { const z = At(u).z, x = At(u).x, w = alongX ? x : z; if (w >= prop.breach.from && w <= prop.breach.to) e = 0; }
      return e * extraM;
    };
    const cols = Math.max(2, Math.round(L / BRICK.lengthM)), colW = L / cols;
    for (let k = 0; ; k++) {
      let any = false;
      const stagger = k % 2 ? colW / 2 : 0;
      for (let i = -1; i < cols; i++) {
        const u0 = Math.max(-L / 2, -L / 2 + i * colW + stagger), u1 = Math.min(L / 2, -L / 2 + (i + 1) * colW + stagger);
        if (u1 - u0 < 0.05) continue;
        const u = (u0 + u1) / 2, e = Extra(u) + (rnd() - 0.5) * course * 0.9;
        if (e < (k + 0.5) * course) continue;
        any = true;
        // 最上面一皮缺砖、错位，读得出是塌的不是砌的。
        const topmost = e < (k + 1.5) * course;
        if (topmost && rnd() < 0.22) continue;
        const inset = rnd() * 0.03, w = (u1 - u0) - 0.012 - (topmost ? rnd() * 0.06 : 0);
        const p = At(u, (rnd() - 0.5) * 0.02);
        sink.Add("OpeningSetBrick", PlaceGeometry(MakeBox(w, course - 0.012, T - inset, TILE_METERS.brick, `${prop.id}b${k}_${i}`),
          { x: p.x, y: top + k * course + course / 2, z: p.z, ry: ry + (topmost ? (rnd() - 0.5) * 0.12 : 0), rz: topmost ? (rnd() - 0.5) * 0.08 : 0 }));
      }
      if (!any || k > 40) break;
    }
    // 墙根的碎砖：两侧 0.2–0.7 m 内，贴地、矮（< 0.15 m），不挡人也不挡掩体。
    const count = Math.round(L * 1.6);
    for (let i = 0; i < count; i++) {
      const u = (rnd() - 0.5) * L, v = (rnd() < 0.5 ? -1 : 1) * (T / 2 + 0.2 + rnd() * 0.5), p = At(u, v), size = 0.08 + rnd() * 0.12;
      sink.Add("OpeningSetBrick", PlaceGeometry(MakeBox(size * 1.8, size * 0.6, size, TILE_METERS.brick, `${prop.id}r${i}`),
        { x: p.x, y: this.groundAt(p.x, p.z) + size * 0.2, z: p.z, ry: rnd() * 6.28, rx: (rnd() - 0.5) * 0.5, rz: (rnd() - 0.5) * 0.5 }));
    }
  }

  /**
   * 倒塌的砖墙（纯外观）：沿 a→b 按 profile 立着的残墙（整皮整砖退台）、倒在一侧地上的几片墙体、墙根碎砖。
   * 倒向 +法线侧（数据里是东边，远离缺口沟）。
   */
  BuildCollapsedWall(prop, sink) {
    const rnd = Rng(`${prop.id}${prop.seed}`), course = BRICK.courseM;
    const len = Math.hypot(prop.b.x - prop.a.x, prop.b.z - prop.a.z);
    const d = { x: (prop.b.x - prop.a.x) / len, z: (prop.b.z - prop.a.z) / len };
    let n = { x: d.z, z: -d.x }; if (n.x < 0) n = { x: -n.x, z: -n.z };          // 倒向东
    const ry = Math.atan2(d.x, d.z) - Math.PI / 2;                                   // 局部 +x 沿墙
    const At = (sAlong, off = 0) => ({ x: prop.a.x + d.x * sAlong + n.x * off, z: prop.a.z + d.z * sAlong + n.z * off });
    const cols = Math.max(2, Math.round(len / BRICK.lengthM)), colW = len / cols;
    // 墙脚埋进土里 0.12 m，按每一列自己的地面起砌。
    for (let i = -1; i < cols; i++) for (let k = 0; k < 24; k++) {
      const stagger = k % 2 ? colW / 2 : 0;
      const s0 = Math.max(0, i * colW + stagger), s1 = Math.min(len, (i + 1) * colW + stagger);
      if (s1 - s0 < 0.05) continue;
      const sm = (s0 + s1) / 2, h = ProfileAt(prop.profile, sm) + (rnd() - 0.5) * course;
      if (h < (k + 0.5) * course) continue;
      const topmost = h < (k + 1.5) * course;
      if (topmost && rnd() < 0.3) continue;
      const p = At(sm, (rnd() - 0.5) * 0.03), g = this.groundAt(p.x, p.z) - 0.12;
      sink.Add("OpeningSetBrick", PlaceGeometry(MakeBox(s1 - s0 - 0.012, course - 0.012, prop.thickM - rnd() * 0.04, TILE_METERS.brick, `${prop.id}b${k}_${i}`),
        { x: p.x, y: g + k * course + course / 2, z: p.z, ry: ry + (topmost ? (rnd() - 0.5) * 0.14 : 0), rz: topmost ? (rnd() - 0.5) * 0.1 : 0 }));
    }
    // 倒在地上的墙片：一整片砌体平躺、一头搭在碎砖上。
    for (const [i, f] of prop.fallen.entries()) {
      const p = At(f.s, f.off), g = this.groundAt(p.x, p.z), tilt = f.tiltDeg * DEG;
      sink.Add("OpeningSetBrick", PlaceGeometry(MakeBox(f.len, 0.24, f.w, TILE_METERS.brick, `${prop.id}f${i}`),
        { x: p.x, y: g + 0.1 + Math.sin(tilt) * f.w / 2, z: p.z, ry: ry + f.yawDeg * DEG, rx: tilt }));
    }
    // 墙根碎砖堆：东侧（倒下的那一侧）多、西侧沟沿少。prop.rubbleClear 那一段东侧的碎砖收在墙根 maxOffM 以内
    // （机位看缺口的视线在墙根外 0.9–1.5 m 只比地面高几厘米，SB08）；随机序列不变，只压偏移。
    const clear = prop.rubbleClear;
    for (let i = 0; i < Math.round(len * 5); i++) {
      const sAlong = rnd() * len;
      let off = rnd() < 0.8 ? 0.2 + rnd() * 1.8 : -(0.1 + rnd() * 0.3);
      if (clear && off > 0 && sAlong >= clear.fromS && sAlong <= clear.toS) off = 0.2 + (off - 0.2) * (clear.maxOffM - 0.2) / 1.8;
      const p = At(sAlong, off), size = 0.08 + rnd() * 0.16;
      sink.Add("OpeningSetBrick", PlaceGeometry(MakeBox(size * 1.8, size * 0.6, size, TILE_METERS.brick, `${prop.id}r${i}`),
        { x: p.x, y: this.groundAt(p.x, p.z) + size * 0.15, z: p.z, ry: rnd() * 6.28, rx: (rnd() - 0.5) * 0.6, rz: (rnd() - 0.5) * 0.6 }));
    }
  }

  // ---------------------------------------------------------------- 外部模型（枯树）：异步，烘进同一套分组
  async LoadExternals() {
    const specs = PROPS.filter((p) => p.kind === "external");
    if (!specs.length || !this.loadExternal) return;
    const generation = this.generation;
    try {
      const templates = new Map();
      await Promise.all([...new Set(specs.map((s) => s.asset))].map(async (id) => templates.set(id, await this.loadExternal(id))));
      if (generation !== this.generation || !this.root) return;
      const sink = new BuildSink(), materials = new Map();
      sink.SetSector("OpeningSet_External");
      for (const spec of specs) {
        const template = templates.get(spec.asset);
        if (!template) throw new Error(`missing external asset ${spec.asset}`);
        template.updateMatrixWorld(true);
        const matrix = new THREE.Matrix4().compose(new THREE.Vector3(spec.x, this.groundAt(spec.x, spec.z) - 0.1, spec.z),
          new THREE.Quaternion().setFromAxisAngle(UP, spec.yawDeg * DEG), new THREE.Vector3(spec.scale, spec.scale, spec.scale));
        template.traverse((mesh) => {
          if (!mesh.isMesh || Array.isArray(mesh.material)) return;
          const key = `OpeningSetExt_${mesh.material.uuid}`;
          materials.set(key, mesh.material);
          sink.Add(key, Normalize(mesh.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(matrix, mesh.matrixWorld))));
        });
      }
      for (const mesh of sink.Flush(this.root, {}, { castShadow: true, receiveShadow: true, resolve: (key) => materials.get(key) })) mesh.name = `OpeningSet0103_External_${mesh.name}`;
      this.root.updateMatrixWorld(true);
    } catch (error) {
      console.warn(`[OpeningSet] external props failed: ${error}`);
    }
  }
}
