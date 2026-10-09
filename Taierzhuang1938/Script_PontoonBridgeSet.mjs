// ===========================================================================
// Script_PontoonBridgeSet.mjs —— 北沙河浮桥的模型与 18「奉令毁桥」的坍塌演出
//
// 口径：docs/Data_PontoonBridge.md。模型、坍塌关键帧与事件表都出自 Blender
//（_blender/Script_BuildPontoonBridge.py → Model/Model_PontoonBridge.glb + Model/Data_PontoonBridge.json）；
// 这里只负责：
//   · 把 GLB 装进场景：不动的岸栈 / 南截 / 药箱合批一份、完好桥身（北截 + 被炸段的船与板 + 下沉的邻船）合批一份、
//     坍塌末态合批一份，逐件节点（炸飞的船体碎块、桥面板簇、木屑、下沉的邻船、摆动的北截……）只在坍塌那几秒露面；
//   · 摘掉白盒桥的外观（碰撞与 RailBridgeDestroyed 的闸门生命周期一概不动）；
//   · 按事实同步完好 / 坍塌 / 残骸三态 —— 回跳、读档、阶段跳转都只看 bridgeDestroyed；
//   · 起爆时间线：分段药包、半空火球、水柱、木屑与火星、烟柱、入水水花与木件撞击声、之后一直烧着的两处断口。
//     全部往 Script_Vfx 现成的池里生，不新建材质、不新建网格，首次起爆不现编着色器。
//
// 判定（等人走净、看着桥、按下起爆器）与唯一一次共用爆炸感知（Combat.BlastFeedback）
// 在 Script_FirstLevelBridge；这里一声爆炸音都不另放（docs/Data_BlastFeedback.md），
// 只有木船折断 / 木件落水的撞击声（impactWood / debrisFall，走音频引擎的撞击音效，不是爆炸感知）。
// 模型加载失败时什么都不摘：白盒桥照旧完整可玩，Fire 退回一发普通爆炸。
// 结构照抄 Script_RailBridgeSet（钢桁架铁路桥，2026-09-30 退役），件表 JSON 的键名与它一致。
// ===========================================================================
import * as THREE from "three";
import { ManagedGLTFLoader as GLTFLoader } from "./Script_ModelImports.mjs";
import { MergeGeometries } from "./Script_Geo.mjs";
import { VFX_PALETTE, ResetVfxSpawn } from "./Script_Vfx.mjs";
import { PONTOON_BRIDGE_MODEL as M, PONTOON_BRIDGE_BLAST as FX } from "./Data_PontoonBridgeDemolition.mjs";
import { MISSION_PONTOON_BRIDGE } from "./Data_FirstLevelMissionTopology.mjs";

const CHARGE_STEPS = new Set(M.chargeSteps);
const EXPLODER_STEPS = new Set(M.exploderSteps);
// 北沙河是浑水：溅起来的不是白浪，是带土色的灰白水雾。
const Linear = (hex, k = 1) => { const c = new THREE.Color(hex); return [c.r * k, c.g * k, c.b * k]; };
const SPRAY_A = Linear(0xe6e3d8), SPRAY_B = Linear(0x9d9884);
const Smooth = (t) => { const k = Math.min(1, Math.max(0, t)); return k * k * (3 - 2 * k); };

export class PontoonBridgeSet {
  /**
   * @param {object} host scene、library（Script_Materials），可选 battlefield（摘白盒外观）、
   *   vfx、audio、player（震屏 / 听者距离）。
   */
  constructor({ scene, library, battlefield = null, vfx = null, audio = null, player = null } = {}) {
    Object.assign(this, { scene, library, battlefield, vfx, audio, player });
    this.state = "loading";
    this.root = null; this.data = null; this.loading = null; this.failed = null; this.disposed = false;
    this.t = 0; this.clock = 0; this.duration = 0;
    this.cues = []; this.cueIndex = 0;
    this.sources = [];
    this.detached = [];
    this.materials = new Map(); this.ownMaterials = [];
    this.pressT = null;
    this.stage = null;
    this.fovK = 1;
    this.splashPlays = 0;
    this.stats = { detonations: 0, cues: 0, splashes: 0, lands: 0, slams: 0, restoredWreck: 0, resets: 0 };
  }

  get Loaded() { return !!this.root; }

  // ---------------------------------------------------------------- loading
  Load() {
    if (this.loading) return this.loading;
    if (typeof document === "undefined" || typeof fetch !== "function") {
      this.failed = "no-browser";
      return (this.loading = Promise.resolve(false));
    }
    const json = fetch(M.dataUrl).then((response) => {
      if (!response.ok) throw new Error(`${M.dataUrl}: HTTP ${response.status}`);
      return response.json();
    });
    this.loading = Promise.all([new GLTFLoader().loadAsync(M.url), json])
      .then(([gltf, data]) => {
        if (this.disposed) return false;
        this.Build(gltf, data);
        return true;
      })
      .catch((error) => {
        this.failed = String(error?.message || error);
        console.warn("PontoonBridgeSet: bridge model unavailable, whitebox bridge stays.", error);
        return false;
      });
    return this.loading;
  }

  Material(key) {
    if (this.materials.has(key)) return this.materials.get(key);
    const spec = M.materials[key] || M.materials.Timber;
    // `tag` 只进材质库的缓存键：每种桥材一份自己的实例（色调要改它，不能改到别处共用的那份）。
    const options = { roughness: spec.roughness, metalness: spec.metalness, tag: `PontoonBridge${key}` };
    let material = null;
    for (const recipe of [spec.recipe, M.materials[M.fallbackRecipe]?.recipe]) {
      if (!recipe) continue;
      try { material = this.library?.Get?.(recipe, options) || null; } catch { material = null; }
      if (material) break;
    }
    if (material && spec.tint) material.color.setRGB(spec.tint[0], spec.tint[1], spec.tint[2]);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color: 0x6b5a45, roughness: 0.95, metalness: 0 });
      this.ownMaterials.push(material);
    }
    this.materials.set(key, material);
    return material;
  }

  Build(gltf, data) {
    this.data = data;
    this.duration = data.duration;
    this.kinds = new Map(data.pieces.map((piece) => [piece.name, piece.kind]));
    const scene = gltf.scene;
    scene.name = "PontoonBridgeSet_Pieces";
    // 导出时没带法线（每个面四个独立顶点，法线在这里按面现算：省掉三分之一体积）。
    // GLTF 导出器会把 UV 恰好相同的角点并掉，所以先拆成非索引再算，保证是平面法线。
    scene.traverse((object) => {
      if (!object.isMesh) return;
      const key = String(object.material?.name || "Timber").replace(/^PontoonBridge/, "");
      const original = object.material;
      object.material = this.Material(key);
      if (original && original !== object.material) original.dispose?.();
      const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry;
      if (geometry !== object.geometry) object.geometry.dispose();
      geometry.deleteAttribute("normal");
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      object.geometry = geometry;
      object.userData.materialKey = key;
      object.castShadow = true;
      object.receiveShadow = true;
    });
    this.nodes = new Map(scene.children.map((child) => [child.name, child]));
    // Blender 5.1 的 glTF 导出器按物体各出一段动画（「场景」模式并不合并）：每段都要挂上，
    // 只放第一段的话只有一块碎件在动，桥身原地不动（铁路桥 2026-09-28 实拍踩过）。
    this.mixer = new THREE.AnimationMixer(scene);
    // 不用 LoopOnce + clampWhenFinished：一旦摆到末帧（建残骸合批时就要摆一次），three 会把动作
    // 标成 paused，此后 setTime 一律按时间缩放 0 处理 —— 起爆时桥身钉在原地不动、残骸却是对的。
    // 这里只当采样器用：默认循环，时间自己夹在 [0, 末帧) 之内。
    this.actions = (gltf.animations || []).map((clip) => {
      const action = this.mixer.clipAction(clip);
      action.play();
      return action;
    });
    this.animatedNodes = new Set((gltf.animations || []).flatMap((clip) => clip.tracks.map((track) => track.name.split(".")[0])));
    this.clipDuration = Math.max(0, ...(gltf.animations || []).map((clip) => clip.duration));
    const root = this.root = new THREE.Group();
    root.name = "PontoonBridgeSet";
    root.position.set(M.origin.x, 0, M.origin.z);
    const Group = (name) => { const group = new THREE.Group(); group.name = `PontoonBridgeSet_${name}`; root.add(group); return group; };
    this.groups = {
      static: Group("Static"), intact: Group("Intact"), wreck: Group("Wreck"),
      charges: Group("Charges"), exploder: Group("Exploder"),
    };
    // 合批在把 gltf 场景挂到桥根之前做：此刻 scene 是单位变换，matrixWorld 就是桥局部坐标。
    const ofKind = (...kinds) => [...this.nodes.entries()].filter(([name]) => kinds.includes(this.kinds.get(name))).map(([, node]) => node);
    const moving = ofKind("span", "debris");
    const north = this.nodes.get("NorthSection") || null;
    this.Pose(0);
    const north0 = north?.matrixWorld.clone() || null;
    this.MergeInto(this.groups.static, ofKind("static"));
    this.MergeInto(this.groups.intact, moving);
    this.Pose(this.duration);
    const northEnd = north?.matrixWorld.clone() || null;
    this.MergeInto(this.groups.wreck, moving);
    this.Pose(0);
    this.BuildHullWaterMasks(north, north0, northEnd);
    for (const node of ofKind("static")) { scene.remove(node); node.traverse((o) => o.geometry?.dispose()); }
    for (const node of ofKind("charges")) this.groups.charges.add(node);
    for (const node of ofKind("cable", "exploder", "handle")) this.groups.exploder.add(node);
    this.handle = this.nodes.get("ExploderHandle") || null;
    this.handleRestY = this.handle ? this.handle.position.y : 0;
    this.pieces = scene;
    root.add(scene);
    // 18 之前藏着的两组：关卡预热强制出画一帧，贴图与 program 别留到 18 才传。
    this.groups.charges.userData.warmDraw = true;
    this.groups.exploder.userData.warmDraw = true;
    this.triangles = data.triangles;
    this.DetachWhitebox();
    this.scene.add(root);
    this.EnterIntact();
  }

  MergeInto(target, nodes) {
    const buckets = new Map();
    for (const node of nodes) {
      node.updateMatrixWorld(true);
      node.traverse((object) => {
        if (!object.isMesh) return;
        const key = object.userData.materialKey;
        const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(geometry);
      });
    }
    for (const [key, list] of buckets) {
      const mesh = new THREE.Mesh(MergeGeometries(list), this.Material(key));
      mesh.name = `${target.name}_${key}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      target.add(mesh);
    }
  }

  /**
   * 船舱里的水面遮挡片。河水（Script_Water）是一整片平面，从船底下穿过去：敞口船的舱底在水线下
   * 0.28 m，于是每条船舱里都露出一块水面（浑水半透明时更糟，看着像舱里灌了一层发亮的玻璃）。
   * 这里给每条完好的船按舱内壁在水线处的截面铺一片只写深度、不写颜色的面，摆在水面上
   * `hullWaterMask.lift`：它在不透明物之后画（renderOrder），已经画好的舱底、肋骨、芦苇不受影响，
   * 后画的水面在舱里过不了深度测试。藏出预通道（不然 SSAO / 雾 / 水深都会读到这片假面）。
   *
   * 三态各一份：南截（船 0…6）一直在；完好桥身（船 7…20）跟 intact 组；北截（船 16…）在残骸组按
   * 末帧位姿放一份、在坍塌那几秒挂在 NorthSection 节点上跟着摆。下沉 / 炸飞的船不遮 —— 它们进水了。
   * 北截末帧的高度不一定和完好时一样（Blender 里叠了起伏）：舱里的水线跟着挪，按落得最多的那个高度取截面
   *（坍塌途中遮挡片偏高一点无妨，它只写深度）。
   */
  BuildHullWaterMasks(north, north0, northEnd) {
    const hull = M.hullWaterMask, data = this.data, waterTop = data.water.top, boatSpec = MISSION_PONTOON_BRIDGE.boats;
    const halfL = data.layout.boatLength / 2, halfW = data.layout.boatBeam / 2;
    const yBot = waterTop - hull.draft, yGun = waterTop + boatSpec.freeboard;
    const Ramp = (ax, r) => { const t = Math.min(1, Math.max(0, (ax - r.from) / r.span)); return t * t; };
    // 舱内壁在高度 level 处离船中线多远（_blender/Script_BuildPontoonBridge.py 的 InnerPoint：
    // 内壁是从舱底面 y0 + floorT 的 BottomHalf 拉到舷缘 y1 的 HalfBeam 的直线，再往里收 wallIn）。
    const InnerHalf = (x, level) => {
      const ax = Math.abs(x);
      const halfBeam = halfW - hull.beamTaper.narrow * Ramp(ax, hull.beamTaper);
      const bottomHalf = halfBeam * hull.bottomRatio;
      const y0 = yBot + hull.floorRise.rise * Ramp(ax, hull.floorRise) + hull.floorT;
      const y1 = yGun + hull.gunwaleRise.rise * Ramp(ax, hull.gunwaleRise);
      const h = Math.min(1, Math.max(0, (level - y0) / (y1 - y0)));
      return bottomHalf + (halfBeam - bottomHalf) * h - hull.wallIn - hull.inset;
    };
    const xMax = halfL - hull.wallIn;
    const half = [...hull.stationsX.filter((x) => x > 0 && x < xMax), xMax];
    const stationXs = [...half.map((x) => -x).reverse(), ...(hull.stationsX.includes(0) ? [0] : []), ...half];
    const material = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, side: THREE.DoubleSide });
    material.name = "PontoonBridgeHullWaterMask";
    // MarkNoPrepass 的同一件事（这里不引 Script_Post：Node 门禁直接跑这个模块）；
    // 挂进场景之前设好，预通道的分类在 childadded 时现做。
    material.allowOverride = false;
    this.ownMaterials.push(material);
    const MaskMesh = (name, boats, level, matrix = null) => {
      const positions = [], indices = [];
      for (const boat of boats) {
        const base = positions.length / 3;
        for (const x of stationXs) {
          const inner = InnerHalf(x, level);
          positions.push(x, level, boat.z - inner, x, level, boat.z + inner);
        }
        for (let s = 0; s < stationXs.length - 1; s += 1) {
          const a = base + 2 * s;
          indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setIndex(indices);
      if (matrix) geometry.applyMatrix4(matrix);
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `PontoonBridgeSet_HullMask${name}`;
      mesh.renderOrder = 900;            // 不透明物里最后画：它身后的舱底必须先画完
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.userData.skipNormalDepth = true;
      mesh.userData.hullWaterMask = { boats: boats.map((boat) => boat.i), level };
      return mesh;
    };
    const boats = data.layout.boats;
    const sinkLo = Math.min(...boatSpec.sinking), sinkHi = Math.max(...boatSpec.sinking);
    const southBoats = boats.filter((boat) => boat.i < sinkLo);
    const northBoats = boats.filter((boat) => boat.i > sinkHi);
    const level = waterTop + hull.lift;
    this.hullMasks = {
      static: MaskMesh("Static", southBoats, level),
      intact: MaskMesh("Intact", boats.filter((boat) => boat.i >= sinkLo), level),
      wreck: null, pieces: null,
    };
    this.groups.static.add(this.hullMasks.static);
    this.groups.intact.add(this.hullMasks.intact);
    if (!north || !north0 || !northEnd || !northBoats.length) return;
    const delta = northEnd.clone().multiply(north0.clone().invert());
    // 北截末帧往下落了多少（只有偏航与下沉，没有横滚）：取几条船里落得最多的那条
    let drop = 0;
    for (const boat of northBoats) drop = Math.min(drop, new THREE.Vector3(0, waterTop, boat.z).applyMatrix4(delta).y - waterTop);
    this.hullMasks.wreck = MaskMesh("Wreck", northBoats, level - drop, delta);
    this.hullMasks.pieces = MaskMesh("Pieces", northBoats, level - drop, north0.clone().invert());
    this.groups.wreck.add(this.hullMasks.wreck);
    north.add(this.hullMasks.pieces);
  }

  DetachWhitebox() {
    const gates = this.battlefield?.gates;
    if (!gates) return;
    for (const id of M.replacesGates) {
      const mesh = gates.get(id)?.mesh;
      if (!mesh?.parent) continue;
      this.detached.push({ mesh, parent: mesh.parent });
      mesh.parent.remove(mesh);
    }
  }

  // ---------------------------------------------------------------- states
  Pose(t) {
    if (!this.mixer) return;
    const end = (this.clipDuration || this.duration) - 1e-4;
    this.mixer.setTime(Math.max(0, Math.min(t, end)));
    this.pieces?.updateMatrixWorld?.(true);
    if (!this.pieces && this.nodes) for (const node of this.nodes.values()) node.updateMatrixWorld(true);
  }

  EnterIntact() {
    this.state = "intact";
    this.t = 0; this.cues = []; this.cueIndex = 0; this.pressT = null; this.detonatedAt = null;
    this.Pose(0);
    this.pieces.visible = false;
    this.groups.intact.visible = true;
    this.groups.wreck.visible = false;
    this.ClearSources();
  }

  EnterWreck() {
    this.state = "wreck";
    this.pressT = null;
    this.pieces.visible = false;
    this.groups.intact.visible = false;
    this.groups.wreck.visible = true;
    this.groups.charges.visible = false;
  }

  /** 爆破手按下起爆器（真起爆在 Script_FirstLevelBridge 的压杆提前量之后）。 */
  Press() {
    if (!this.root || this.state !== "intact") return false;
    this.pressT = 0;
    return true;
  }

  /**
   * 起爆。模型没装好返回 false（调用方退回一发普通爆炸）。
   * 这之后的几秒由 Update 按烘焙时间线推进：件的位姿走 AnimationMixer，特效走 cues。
   */
  Detonate() {
    if (!this.root || this.state !== "intact") return false;
    this.state = "collapsing";
    this.t = 0;
    this.pressT = null;
    this.splashPlays = 0;
    this.groups.intact.visible = false;
    this.groups.wreck.visible = false;
    this.groups.charges.visible = false;
    this.pieces.visible = true;
    this.Pose(0);
    this.cues = this.BuildCues();
    this.cueIndex = 0;
    this.detonatedAt = this.clock;
    this.stats.detonations += 1;
    this.RunCues();
    return true;
  }

  /**
   * 每帧一次。`destroyed` 是事实 bridgeDestroyed；`night` 是夜景已落位（关尾黑屏之后，
   * 这边的烟火与玩家再没关系，收掉）。
   */
  Update(dt, stage, { destroyed = false, night = false } = {}) {
    this.stage = stage;
    this.clock += dt;
    if (!this.root) return;
    if (this.state === "collapsing") {
      this.t += dt;
      this.Pose(this.t);
      this.RunCues();
      if (this.t >= this.duration) this.EnterWreck();
    } else if (destroyed && this.state === "intact" && this.pressT == null) {
      // 读档 / 阶段跳转直接落在炸桥之后：不重演，直接是残骸。
      this.EnterWreck();
      this.stats.restoredWreck += 1;
    }
    if (!destroyed && this.state !== "intact" && this.state !== "loading") {
      this.EnterIntact();
      this.stats.resets += 1;
    }
    this.groups.charges.visible = this.state === "intact" && CHARGE_STEPS.has(stage);
    this.groups.exploder.visible = EXPLODER_STEPS.has(stage);
    if (this.handle) {
      const pressed = this.state !== "intact" ? 1 : this.pressT != null ? Smooth(this.pressT / 0.18) : 0;
      if (this.pressT != null) this.pressT += dt;
      this.handle.position.y = this.handleRestY - this.data.exploder.handleTravel * pressed;
    }
    if (night) this.ClearSources();
    for (const source of this.sources) {
      if (source.until <= this.clock && source.id != null) { this.vfx?.RemoveSmokeSource(source.id); source.id = null; }
    }
    this.sources = this.sources.filter((source) => source.id != null);
  }

  // ---------------------------------------------------------------- timeline
  World(x, y, z) { return new THREE.Vector3(M.origin.x + x, y, M.origin.z + z); }

  BuildCues() {
    const d = this.data, cues = [], waterY = d.water.top;
    const Add = (t, run, label) => cues.push({ t, run, label });
    for (const charge of d.charges) {
      Add(charge.t, () => this.vfx?.Explosion?.(this.World(charge.x, charge.y, charge.z), {
        radius: charge.main ? FX.mainRadiusM : charge.radius * FX.secondaryRadiusScale,
        kind: charge.main ? FX.mainKind : FX.secondaryKind,
        groundY: charge.groundY ?? waterY,
      }), charge.main ? "mainCharge" : "charge");
    }
    Add(FX.airburst.t, () => this.vfx?.Explosion?.(this.World(0, FX.airburst.rise, 0),
      { radius: FX.airburst.radiusM, kind: FX.airburst.kind, groundY: waterY }), "airburst");
    // 每个药包下面一根水柱（数据里有几个药包就几根，x 落在桥轴上、z 落在各船中心）。
    Add(FX.waterColumn.t, () => { for (const charge of d.charges) this.WaterColumn(charge.x, charge.z); }, "waterColumn");
    Add(0, () => this.Sparks(), "sparks");
    Add(FX.groundRing.t, () => this.GroundRings(), "groundRing");
    for (const hit of FX.woodBreak)
      Add(hit.t, () => this.audio?.Play?.(hit.cue, { position: this.World(0, 0.6, hit.z), volume: hit.volume, pitch: hit.pitch,
        sourceSizeM: hit.sizeM }), "woodBreak");
    for (const burst of FX.bursts) Add(burst.t, () => this.Burst(burst), "burst");
    for (const event of d.events) {
      if (event.type === "water") Add(event.t, () => this.Splash(event), "water");
      else if (event.type === "land") Add(event.t, () => this.Land(event), "land");
      else if (event.type === "slam") Add(event.t, () => this.Slam(event), "slam");
    }
    Add(FX.persistent.t, () => this.StartPersistent(), "persistent");
    cues.sort((a, b) => a.t - b.t);
    return cues;
  }

  RunCues() {
    while (this.cueIndex < this.cues.length && this.cues[this.cueIndex].t <= this.t + 1e-6) {
      const cue = this.cues[this.cueIndex++];
      try { cue.run(); } catch (error) { console.warn(`PontoonBridgeSet cue ${cue.label} failed`, error); }
      this.stats.cues += 1;
    }
  }

  Random(a, b) { return a + (b - a) * (this.vfx?.random ? this.vfx.random() : Math.random()); }
  Signed(k) { return this.Random(-k, k); }
  Count(n) { return Math.max(1, Math.round(n * (this.vfx?.spawnScale ?? 1))); }

  SmokeParticle(fill) {
    const v = this.vfx;
    if (!v?.pools?.smoke) return;
    const s = ResetVfxSpawn();
    fill(s);
    s.seed = v.random ? v.random() : Math.random();
    v.pools.smoke.Spawn(s, v.time);
  }

  Ring(x, y, z, radius, colors, { life = 1.6, opacity = 0.5 } = {}) {
    const v = this.vfx;
    if (!v?.pools?.ring) return;
    const s = ResetVfxSpawn();
    s.x = x; s.y = y; s.z = z; s.nx = 0; s.ny = 1; s.nz = 0;
    s.life = life; s.sizeStart = radius * 0.15; s.sizeEnd = radius;
    s.opacity = opacity; s.fadeIn = 0.04; s.angle = this.Random(0, 3.14);
    s.colorA = colors[0]; s.colorB = colors[1];
    s.seed = v.random ? v.random() : Math.random();
    v.pools.ring.Spawn(s, v.time);
  }

  /** 药包下面的河面被掀起来的水柱：往上冲、在十来米高处散开、再落回去。 */
  WaterColumn(x, z) {
    const P = FX.waterColumn, waterY = this.data.water.top, at = this.World(x, waterY, z);
    for (let i = 0, n = this.Count(P.count); i < n; i += 1) {
      this.SmokeParticle((s) => {
        s.x = at.x + this.Signed(P.spread * 0.35); s.y = waterY + this.Random(0, 0.6); s.z = at.z + this.Signed(P.spread * 0.35);
        const speed = this.Random(P.speed[0], P.speed[1]);
        s.vx = this.Signed(P.spread * 0.9); s.vy = speed; s.vz = this.Signed(P.spread * 0.9);
        s.ay = -9.8; s.drag = 0.55;
        s.life = this.Random(P.life[0], P.life[1]);
        s.sizeStart = this.Random(0.5, 1.2); s.sizeEnd = this.Random(P.size[0], P.size[1]);
        s.opacity = 0.82; s.fadeIn = 0.03;
        s.angle = this.Random(0, 6.283); s.spin = this.Signed(0.8);
        s.colorA = SPRAY_A; s.colorB = SPRAY_B;
      });
    }
    this.Ring(at.x, waterY + 0.05, at.z, P.ring, [SPRAY_A, SPRAY_B], { life: 2.0, opacity: 0.5 });
  }

  /** 船体折断的火星与碎木屑：沿被炸段撒开，比普通炮弹多几倍、落到水面前就熄。 */
  Sparks() {
    const v = this.vfx, P = FX.sparks;
    if (!v?.pools?.streak) return;
    const waterY = this.data.water.top;
    for (let i = 0, n = this.Count(P.count); i < n; i += 1) {
      const s = ResetVfxSpawn();
      const at = this.World(this.Signed(1.2), 0.1, this.Signed(P.halfLengthM));
      const a = this.Random(0, 6.2832), up = this.Random(0.2, 1.1), speed = this.Random(P.speed[0], P.speed[1]);
      s.x = at.x; s.y = at.y; s.z = at.z;
      s.vx = Math.cos(a) * speed * (1 - up * 0.5); s.vy = up * speed; s.vz = Math.sin(a) * speed * (1 - up * 0.5);
      s.ay = -9.8; s.drag = 0.7;
      s.life = this.Random(P.life[0], P.life[1]);
      s.sizeStart = 0.022; s.sizeEnd = 0.006; s.stretch = this.Random(0.3, 0.9);
      s.opacity = 1; s.fadeIn = 0.02; s.groundY = waterY;
      s.colorA = VFX_PALETTE.sparkHot; s.colorB = VFX_PALETTE.sparkCool;
      s.seed = v.random ? v.random() : Math.random();
      v.pools.streak.Spawn(s, v.time);
    }
  }

  /** 冲击波在河面上推出去的一圈水雾。 */
  GroundRings() {
    const P = FX.groundRing, d = this.data;
    const centre = this.World(0, d.water.top, 0);
    this.Ring(centre.x, d.water.top + 0.08, centre.z, P.radiusM, [SPRAY_A, SPRAY_B], { life: 2.4, opacity: 0.5 });
  }

  /** 起爆后的烟源（有湍流、会翻卷），到 untilS 自己停；已经出来的烟团按各自寿命散掉。 */
  Burst(spec) {
    const v = this.vfx;
    if (!v?.SmokeSource) return;
    const { at, t: _, untilS, ...options } = spec;
    const id = v.SmokeSource(this.World(at[0], at[1], at[2]), options);
    this.sources.push({ id, until: this.clock + untilS });
  }

  /** 一块东西砸进河里：大件是一堵水墙，小件是一簇水花 + 一圈涟漪；够大的再来一声落水的闷响。 */
  Splash(event) {
    const P = FX.splash, waterY = this.data.water.top, at = this.World(event.x, waterY, event.z);
    const big = event.size >= P.bigSize;
    const n = this.Count(Math.min(P.max, Math.max(P.min, event.size * P.perSize)));
    const scale = Math.min(1.6, 0.5 + event.size / 5);
    for (let i = 0; i < n; i += 1) {
      this.SmokeParticle((s) => {
        s.x = at.x + this.Signed(event.size * 0.35); s.y = waterY + 0.1; s.z = at.z + this.Signed(event.size * 0.2);
        s.vx = this.Signed(1.2 + event.size * 0.3); s.vz = this.Signed(1 + event.size * 0.25);
        s.vy = big ? this.Random(6, 12) : this.Random(2.5, 3 + event.size * 1.4);
        s.ay = -9.8; s.drag = 0.7;
        s.life = this.Random(1.1, big ? 2.4 : 1.8);
        s.sizeStart = this.Random(0.25, 0.6) * (big ? 1.6 : 1); s.sizeEnd = this.Random(1.2, 2.6) * scale * (big ? 1.6 : 1);
        s.opacity = 0.8; s.fadeIn = 0.02;
        s.angle = this.Random(0, 6.283); s.spin = this.Signed(1.2);
        s.colorA = SPRAY_A; s.colorB = SPRAY_B;
      });
    }
    this.Ring(at.x, waterY + 0.06, at.z, big ? 8 : Math.max(1.6, event.size * 1.5), [SPRAY_A, SPRAY_B],
      { life: big ? 2.4 : 1.5, opacity: 0.45 });
    // 木件落水的声音：够大的才响（声部预算），离得太远不出声。
    const A = FX.splashAudio, listener = this.player?.position;
    if (event.size >= A.minSize && this.splashPlays < A.maxPlays && (!listener || listener.distanceTo(at) <= A.maxDistanceM)) {
      this.splashPlays += 1;
      this.audio?.Play?.(A.cue, { position: at, volume: Math.min(2.2, A.volume + event.size * 0.15), pitch: event.size > 3 ? 0.8 : 1,
        sourceSizeM: Math.max(1, event.size) });
    }
    this.stats.splashes += 1;
  }

  /** 落在岸上：一小团土、按材质一声（离得太远就不出声，免得占声部）。 */
  Land(event) {
    const at = this.World(event.x, event.y, event.z);
    const n = this.Count(FX.landPuff.count * Math.min(1.6, 0.6 + event.size / 3));
    for (let i = 0; i < n; i += 1) {
      this.SmokeParticle((s) => {
        s.x = at.x + this.Signed(event.size * 0.3); s.y = at.y + 0.15; s.z = at.z + this.Signed(event.size * 0.3);
        s.vx = this.Signed(1.4); s.vy = this.Random(0.4, 2.2); s.vz = this.Signed(1.4);
        s.ay = -0.4; s.drag = 1.6;
        s.life = this.Random(1.6, 3.0);
        s.sizeStart = this.Random(0.3, 0.6); s.sizeEnd = this.Random(1.2, 1.8) + event.size * 0.45;
        s.opacity = 0.5; s.fadeIn = 0.04;
        s.angle = this.Random(0, 6.283); s.spin = this.Signed(0.9);
        s.colorA = VFX_PALETTE.soilAir; s.colorB = VFX_PALETTE.dustDense;
      });
    }
    const cue = FX.landAudio[event.material];
    const listener = this.player?.position;
    if (cue && (!listener || listener.distanceTo(at) <= FX.landAudio.maxDistanceM)) {
      this.audio?.Play?.(cue, { position: at, volume: Math.min(2.4, 0.5 + event.size * 0.35 + event.speed * 0.05),
        pitch: event.size > 2 ? 0.72 : 1, sourceSizeM: Math.max(1, event.size) });
    }
    this.stats.lands += 1;
  }

  /** 一件大东西一头扎进水里（可选事件）：一堵水墙、一记闷震、木头的撞击声。 */
  Slam(event) {
    const d = this.data, at = this.World(event.x, d.water.top + 0.6, event.z);
    this.Splash({ ...event, size: Math.max(event.size, 6) });
    const player = this.player;
    if (player?.shake?.Explosion && player.Alive !== false) {
      const eye = player.EyePosition || player.position;
      const toEye = new THREE.Vector3().subVectors(eye, at);
      const distance = toEye.length();
      toEye.divideScalar(distance || 1);
      const yaw = player.yaw || 0;
      const side = -(toEye.x * Math.cos(yaw) - toEye.z * Math.sin(yaw));
      player.shake.Explosion(distance, FX.slam.shakeReachM, false, side);
    }
    for (const layer of FX.slam.audio)
      this.audio?.Play?.(layer.cue, { position: at, volume: layer.volume, pitch: layer.pitch, sourceSizeM: 10 });
    this.stats.slams += 1;
  }

  StartPersistent() {
    const v = this.vfx, P = FX.persistent;
    if (!v?.SmokeSource) return;
    const Source = (spec, at, until = Infinity) => {
      const { at: _, untilS: __, ...options } = spec;
      const id = v.SmokeSource(this.World(at[0], at[1], at[2]), options);
      this.sources.push({ id, until });
    };
    for (const end of P.ends) Source(end, end.at);
    Source(P.haze, P.haze.at, this.clock + P.haze.untilS);
    // 漂在河面上的木件：挑几块干的（没沉底、材质是船板 / 桥板）各起一小堆火。
    const floating = this.data.pieces.filter((piece) => piece.kind === "debris" && piece.final.wet
      && (piece.materials.includes("Hull") || piece.materials.includes("Timber"))).slice(0, P.debrisFires);
    for (const piece of floating) {
      const [x, y, z] = piece.final.position;
      Source(P.debrisFire, [x, y + 0.1, z]);
    }
  }

  ClearSources() {
    for (const source of this.sources) if (source.id != null) this.vfx?.RemoveSmokeSource(source.id);
    this.sources = [];
  }

  /** 玩家视线与桥心的水平夹角是否在 halfAngleDeg 以内（yaw 0 朝 -Z）。 */
  PlayerFacing(halfAngleDeg) {
    const p = this.player;
    if (!p?.position || !Number.isFinite(p.yaw)) return false;
    const dx = M.origin.x - p.position.x, dz = M.origin.z - p.position.z, length = Math.hypot(dx, dz);
    if (length < 1) return true;
    return (-Math.sin(p.yaw) * dx - Math.cos(p.yaw) * dz) / length >= Math.cos(halfAngleDeg * Math.PI / 180);
  }

  /** 任务 FOV 的倍率：起爆后 holdS 秒内、玩家看着桥就慢慢收窄，其余时候回到 1。 */
  FovScale(dt) {
    const F = FX.focus;
    const since = this.detonatedAt == null ? Infinity : this.clock - this.detonatedAt;
    const want = since < F.holdS && this.PlayerFacing(F.halfAngleDeg) ? F.scale : 1;
    this.fovK += (want - this.fovK) * Math.min(1, dt * (want < this.fovK ? F.inRate : F.outRate));
    if (Math.abs(this.fovK - 1) < 1e-4) this.fovK = 1;
    return this.fovK;
  }

  // ---------------------------------------------------------------- misc
  State() {
    return {
      loaded: this.Loaded, failed: this.failed, state: this.state, t: Number(this.t.toFixed(3)),
      sinceDetonation: this.detonatedAt == null ? null : Number((this.clock - this.detonatedAt).toFixed(3)),
      cues: this.cues.length, cueIndex: this.cueIndex, sources: this.sources.length,
      detached: this.detached.length, triangles: this.triangles ?? 0, animatedNodes: this.animatedNodes?.size ?? 0,
      charges: !!this.groups?.charges.visible, exploder: !!this.groups?.exploder.visible,
      handleDown: this.handle ? Number((this.handleRestY - this.handle.position.y).toFixed(3)) : null,
      fovScale: Number(this.fovK.toFixed(3)),
      stats: { ...this.stats },
    };
  }

  Dispose() {
    this.disposed = true;
    this.ClearSources();
    for (const { mesh, parent } of this.detached) if (!mesh.parent) parent.add(mesh);
    this.detached = [];
    if (this.root) {
      this.root.parent?.remove(this.root);
      this.root.traverse((object) => { if (object.isMesh) object.geometry?.dispose(); });
      this.mixer?.stopAllAction();
    }
    for (const material of this.ownMaterials) material.dispose();
    this.ownMaterials = [];
    this.materials.clear();
    this.root = null;
  }
}
