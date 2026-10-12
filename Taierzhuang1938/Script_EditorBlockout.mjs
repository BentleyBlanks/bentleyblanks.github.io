// 白盒关卡编辑器的总控（docs/Data_EditorBlockout.md §6.2）。
//
// 入口：index.html?editor=blockout&level=FirstLevel[&kf=03-2]。Script_Main 只加薄钩子
//（换表、跳过任务运行时 / 过场 / 撒兵、每帧调 Update、场景信号接 Signalled），其余都在这里：
//   读配置 → 校验（错误进状态点与提示条，配置坏了仍能走场景）→ 建界面 / 地图 / 标记 / 演员
//   → 跳到 kf 指定的关键帧；切关走现成的 JumpToLevel（整片拆除重建）；
//   页面可见时每 2 s 读一次配置原文，变了就按当前关键帧 id 重新摆（AI 改完 JSON、这里自动看到）；
//   「记下当前机位」把玩家现在的位置 / 朝向 / 姿态写回当前关键帧并保存。
//
// 界面（Script_EditorBlockoutUi）与纸面俯视图（Script_EditorBlockoutMap）只走 §4 / §4.1 的接口。
// 地形与水的样子（§6.3）在每次建关后补：顶点按真实高度上色、地面加米格线、水块铺成水面。

import * as THREE from "three";
import {
  BLOCKOUT_LEVELS, BLOCKOUT_PHASES, BlockoutTintColor, BlockoutWaterBlocks, BlockoutMapScene,
} from "./Script_EditorBlockoutLevels.mjs";
import {
  ValidateBlockout, NormalizeBlockout, KeyframeIndex, PlanTransition, DefaultArc, YawDegFromTo,
} from "./Script_EditorBlockoutConfig.mjs";
import { BlockoutPuppets } from "./Script_EditorBlockoutPuppets.mjs";
import { BlockoutMarkers } from "./Script_EditorBlockoutMarkers.mjs";
import { BlockoutStore } from "./Script_EditorBlockoutStore.mjs";
import { BlockoutUi } from "./Script_EditorBlockoutUi.mjs";
import { BlockoutMap } from "./Script_EditorBlockoutMap.mjs";
import { BuildWhiteboxWater } from "./Script_FirstLevelWhiteboxLooks.mjs";
import { ApplyPatches, MakePatch, PatchesOf } from "./Script_MaterialPatches.mjs";
import { MarkNoPrepass } from "./Script_Post.mjs";

const DEG = Math.PI / 180;
export const BLOCKOUT_EDITOR = Object.freeze({
  pollS: 2,
  mapHz: 8,
  miniPxPerM: 1.6,
  freeSpotM: 3,
  freeSpotRadius: 0.2,
  freeSpotHeight: 1.2,
  groundName: "FirstLevelWhitebox_Ground",
});

function WrapDeg(deg) { let d = ((deg + 180) % 360 + 360) % 360 - 180; if (d === -180) d = 180; return d; }
function Round(value, digits) { const k = 10 ** digits; return Math.round(value * k) / k; }

/** 地面米格线（1 m 细线、10 m 粗线），世界坐标 XZ。只挂在本关地面那份材质上。 */
const GRID_PATCH = MakePatch({
  key: "blockoutGrid1",
  vertex: [
    ["#include <common>", "varying vec3 vBlockoutWorld;"],
    ["#include <project_vertex>", "vBlockoutWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;"],
  ],
  fragment: [
    ["#include <common>", `
      varying vec3 vBlockoutWorld;
      float BlockoutGridLine(vec2 p, float size, float width) {
        vec2 cell = p / size;
        vec2 fw = max(fwidth(cell), vec2(0.00001));
        vec2 d = abs(fract(cell + 0.5) - 0.5);
        float halfWidth = width / size * 0.5;
        vec2 line = 1.0 - smoothstep(vec2(halfWidth), vec2(halfWidth) + fw, d);
        line *= 1.0 - smoothstep(vec2(0.25), vec2(0.5), fw);
        return max(line.x, line.y);
      }
    `],
    ["#include <color_fragment>", `
      float blockoutFine = BlockoutGridLine(vBlockoutWorld.xz, 1.0, 0.035);
      float blockoutCoarse = BlockoutGridLine(vBlockoutWorld.xz, 10.0, 0.09);
      diffuseColor.rgb *= 1.0 - 0.15 * blockoutFine - 0.2 * blockoutCoarse;
    `],
  ],
});

/** 空配置也要能走场景：一个关键帧，落在出生点。 */
function EmptyDoc(level, phase) {
  return NormalizeBlockout({
    schema: "tengxian-blockout/1", level: level.key, title: level.label, zones: [],
    keyframes: [{ id: "spawn", stage: 1, stageTitle: "", name: "出生点",
      player: { x: phase.spawn.x, z: phase.spawn.z, yawDeg: (phase.spawn.ry || 0) / DEG }, what: "", units: [], pois: [] }],
  });
}

export class EditorBlockout {
  /**
   * @param {object} options
   *   host      EditorSuite.editorHost（scene / camera / post / actorFactory / game 取值器…）
   *   params    URLSearchParams
   *   PointerLocked / RequestPointerLock / ReleasePointerLock  Script_Main 的指针锁三件
   */
  constructor({ host, params, PointerLocked, RequestPointerLock, ReleasePointerLock }) {
    this.host = host;
    this.game = host.game;
    this.params = params || new URLSearchParams(location.search);
    this.PointerLocked = PointerLocked || (() => false);
    this.RequestPointerLock = RequestPointerLock || (() => {});
    this.ReleasePointerLock = ReleasePointerLock || (() => {});
    this.levelIndex = this.game.state?.phaseIndex ?? 0;
    this.levelKey = BLOCKOUT_LEVELS[this.levelIndex]?.key || BLOCKOUT_LEVELS[0].key;
    this.store = new BlockoutStore();
    this.layers = { arcs: "default", intents: true, labels: true, xray: true };
    this.doc = null;
    this.rawDoc = null;
    this.configText = null;
    this.configState = "loading";
    this.configMessage = "";
    this.validation = null;
    this.index = -1;
    this.signals = null;
    this.unitData = new Map();
    this.liveUnits = [];
    this.pending = null;
    this.switching = null;
    this.started = false;
    this.ready = false;
    this.mapOpen = false;
    this.locked = null;
    this.mapTimer = 0;
    this.cardKey = "";
    this.writable = null;
    this.saveReason = "";
    this._cam = new THREE.Vector3();
    this.groundAt = (x, z) => {
      const field = this.game.battlefield;
      if (!field) return 0;
      return field.BaseGroundHeight ? field.BaseGroundHeight(x, z) : field.GroundHeight(x, z);
    };

    this.root = document.createElement("div");
    this.root.id = "blockoutRoot";
    document.body.appendChild(this.root);
    this.labelRoot = document.createElement("div");
    this.labelRoot.className = "blockoutLabels";
    this.labelRoot.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:30;overflow:hidden;";
    this.root.appendChild(this.labelRoot);

    this.puppets = new BlockoutPuppets({ scene: host.scene, actorFactory: host.actorFactory, groundAt: this.groundAt });
    this.markers = new BlockoutMarkers({ post: host.post, camera: host.camera, groundAt: this.groundAt, labelRoot: this.labelRoot });
    this.map = new BlockoutMap();
    this.ui = new BlockoutUi(this.root, {
      onPrev: () => { this.Prev(); },
      onNext: () => { this.Next(); },
      onSeek: (index) => { this.GoTo(index, { animate: index === this.index + 1 }); },
      onLevel: (key) => { this.SwitchLevel(key); },
      onLayer: (name, on) => { this.SetLayers({ [name]: on }); },
      onSavePose: () => { this.SavePose(); },
      onReplay: () => { this.Replay(); },
      onOpenMap: () => { this.ToggleMap(true); },
      onCloseMap: () => { this.ToggleMap(false); },
      onMapPick: (index) => { this.GoTo(index, { animate: false }); },
    });
    this.BindKeys();
    this.BindFullMap();

    this.api = {
      State: () => this.State(),
      GoTo: (idOrIndex, options) => this.GoTo(idOrIndex, options),
      Next: () => this.Next(),
      Prev: () => this.Prev(),
      Replay: () => this.Replay(),
      SwitchLevel: (key) => this.SwitchLevel(key),
      Reload: () => this.Reload(),
      Units: () => this.puppets.Live(),
      ToggleMap: (open) => this.ToggleMap(open),
      SetLayers: (partial) => this.SetLayers(partial),
      Config: () => (this.doc ? JSON.parse(JSON.stringify(this.doc)) : null),
      SavePose: () => this.SavePose(),
      Stats: () => this.Stats(),
      // 取证 / 出图用：把玩家摆到任意机位（{x,z,yawDeg,pitchDeg?,stance?}），不改关键帧。
      PlacePlayer: (pose) => { this.PlacePlayer(pose); return { x: this.game.player.position.x, z: this.game.player.position.z }; },
    };
  }

  get phase() { return BLOCKOUT_PHASES[this.levelIndex]; }
  get level() { return BLOCKOUT_LEVELS[this.levelIndex]; }
  get keyframe() { return this.doc?.keyframes[this.index] || null; }

  // -------------------------------------------------------------------------
  // 启动 / 切关

  async Start() {
    this.ui.SetLevels(BLOCKOUT_LEVELS.map(({ key, label }) => ({ key, label })), this.levelKey);
    this.ui.SetLayers(this.layers);
    this.ui.SetStatus({ state: "loading", message: "正在读配置", writable: false, saveReason: "" });
    this.started = true;
    await this.LoadConfig();
    this.SetupLevel();
    const kf = this.params.get("kf");
    let index = kf != null ? KeyframeIndex(this.doc, kf) : 0;
    if (index < 0) index = 0;
    await this.GoTo(index, { animate: false });
    this.ready = true;
    this.pollTimer = setInterval(() => { this.Poll(); }, BLOCKOUT_EDITOR.pollS * 1000);
    // 存档口只问一次：界面要写明「这里能不能直接存」。
    this.store.Status().then(status => {
      this.writable = status.writable;
      this.saveReason = status.reason;
      this.PushStatus();
    });
    return true;
  }

  /** 读当前关卡的配置（原文 + 校验 + 归一化）。坏了也给一个能走的空配置。 */
  async LoadConfig() {
    const result = await this.store.Load(this.levelKey);
    this.ApplyLoaded(result);
  }

  ApplyLoaded(result) {
    this.configText = result.text;
    this.validation = null;
    if (result.state !== "ok") {
      this.rawDoc = null;
      this.doc = EmptyDoc(this.level, this.phase);
      this.configState = "error";
      this.configMessage = result.message;
      this.PushStatus();
      return;
    }
    const check = ValidateBlockout(result.doc);
    this.validation = check;
    this.rawDoc = result.doc;
    const normalized = NormalizeBlockout(result.doc);
    this.doc = normalized.keyframes.length ? normalized : EmptyDoc(this.level, this.phase);
    if (!check.ok) {
      this.configState = "error";
      this.configMessage = `配置有 ${check.errors.length} 处错误：${check.errors.slice(0, 2).join("；")}`;
    } else {
      this.configState = "ok";
      this.configMessage = check.warnings.length ? `已载入（${check.warnings.length} 条提醒）` : "已载入";
    }
    const sceneError = this.phase.blockout?.sceneError;
    if (sceneError) { this.configState = "error"; this.configMessage = `${sceneError}（场景退回空地）`; }
    this.PushStatus();
  }

  PushStatus(state = this.configState, message = this.configMessage) {
    this.ui.SetStatus({ state, message, writable: !!this.writable, saveReason: this.saveReason || "" });
  }

  /** 建关之后：补地形与水的样子，交给地图，摆 POI。 */
  SetupLevel() {
    const layout = this.phase.whitebox.layout;
    this.DressWorld(layout);
    this.map.SetScene({ levelKey: this.levelKey, ...BlockoutMapScene(layout, this.groundAt) });
    this.map.Bake()?.then?.(() => { this.mapTimer = 0; });
    this.map.FitBounds();
    this.ui.SetKeyframes(this.KeyframeList(), Math.max(0, this.index));
    this.map.SetKeyframes(this.doc.keyframes.map(kf => ({ id: kf.id, stage: kf.stage, player: { x: kf.player.x, z: kf.player.z } })), Math.max(0, this.index));
  }

  /** §6.3：地面按真实高度的色带上色 + 米格线；水块铺成水面（白盒画质认网格名里的 water）。 */
  DressWorld(layout) {
    const field = this.game.battlefield;
    if (!field || !layout) return;
    const tint = layout.heightTint || { lo: -4, hi: 6 };
    // 色带查表：256 档，线性空间。
    const lut = new Float32Array(256 * 3), rgb = [0, 0, 0], color = new THREE.Color();
    for (let i = 0; i < 256; i++) {
      BlockoutTintColor(tint.lo + (tint.hi - tint.lo) * i / 255, tint, rgb);
      color.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
      lut[i * 3] = color.r; lut[i * 3 + 1] = color.g; lut[i * 3 + 2] = color.b;
    }
    const span = Math.max(0.5, tint.hi - tint.lo);
    for (const mesh of field.meshes || []) {
      if (mesh.name !== BLOCKOUT_EDITOR.groundName || !mesh.geometry) continue;
      const position = mesh.geometry.getAttribute("position");
      let colors = mesh.geometry.getAttribute("color");
      if (!colors) {
        colors = new THREE.BufferAttribute(new Float32Array(position.count * 3), 3);
        mesh.geometry.setAttribute("color", colors);
      }
      for (let i = 0; i < position.count; i++) {
        const k = Math.max(0, Math.min(255, Math.round((position.getY(i) - tint.lo) / span * 255))) * 3;
        colors.setXYZ(i, lut[k], lut[k + 1], lut[k + 2]);
      }
      colors.needsUpdate = true;
      const material = mesh.material;
      if (material && !Array.isArray(material)) {
        material.vertexColors = true;
        material.color?.setHex?.(0xffffff);
        const patches = PatchesOf(material) || [];
        if (!patches.some(patch => patch.key === GRID_PATCH.key)) { ApplyPatches(material, [...patches, GRID_PATCH]); material.needsUpdate = true; }
      }
    }
    if (!field.waterMesh) {
      const blocks = BlockoutWaterBlocks(layout);
      if (blocks.length) {
        const mesh = layout.id === "BlockoutFirstLevel"
          ? BuildWhiteboxWater(blocks, this.host.scene, { name: "BlockoutWater" })
          : this.BuildWaterTops(blocks);
        if (mesh) { field.waterMesh = mesh; field.meshes.push(mesh); }
      }
    }
  }

  /** 文件场景的水块：顶面铺一层淡蓝半透明（名字带 water，白盒画质照水面画）。 */
  BuildWaterTops(blocks) {
    const positions = [], indices = [];
    for (const b of blocks) {
      const c = Math.cos(b.ry || 0), s = Math.sin(b.ry || 0), y = (b.y ?? this.groundAt(b.x, b.z)) + (b.h || 0) / 2;
      const base = positions.length / 3;
      for (const [lx, lz] of [[-b.w / 2, -b.d / 2], [b.w / 2, -b.d / 2], [b.w / 2, b.d / 2], [-b.w / 2, b.d / 2]]) {
        positions.push(b.x + lx * c + lz * s, y, b.z - lx * s + lz * c);
      }
      indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = MarkNoPrepass(new THREE.MeshStandardMaterial({ color: 0x86b8d8, roughness: 0.15, metalness: 0,
      transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide }));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "BlockoutWater";
    mesh.userData.whiteboxWater = true;
    this.host.scene.add(mesh);
    return mesh;
  }

  /** 换关：回收演员与标记 → JumpToLevel（整片重建）→ 读新配置 → 地图重烘 → 改地址栏。 */
  async SwitchLevel(key) {
    const index = BLOCKOUT_LEVELS.findIndex(level => level.key === key);
    if (index < 0) return false;
    if (this.switching) await this.switching.catch(() => {});
    const run = (async () => {
      this.ResolvePending(false);
      this.ui.SetStatus({ state: "loading", message: "正在切换关卡", writable: !!this.writable, saveReason: this.saveReason || "" });
      this.puppets.Apply([]);
      this.markers.SetUnits([]);
      this.markers.SetPois([]);
      this.markers.SetNext(null);
      this.unitData = new Map();
      // 重建期间旧配置与旧场地对不上：按键、导航栏、地图点选一律不理
      this.rebuilding = true;
      try {
        await this.game.JumpToLevel(index);
        this.levelIndex = index;
        this.levelKey = key;
        this.index = -1;
        this.signals = null;
        await this.LoadConfig();
      } finally {
        this.rebuilding = false;
      }
      this.ReplaceUrl();
      this.SetupLevel();
      this.ui.SetLevels(BLOCKOUT_LEVELS.map(({ key: k, label }) => ({ key: k, label })), this.levelKey);
      await this.GoTo(0, { animate: false });
      this.ui.Toast(`已切到${this.level.label}`, "info");
      return true;
    })();
    this.switching = run;
    try { return await run; }
    finally { if (this.switching === run) this.switching = null; }
  }

  ReplaceUrl() {
    try {
      const url = new URL(location.href);
      url.searchParams.set("level", this.levelKey);
      const id = this.keyframe?.id;
      if (id) url.searchParams.set("kf", id); else url.searchParams.delete("kf");
      history.replaceState(history.state, "", url);
    } catch (error) { /* 地址栏改不了不影响编辑 */ }
  }

  /** 重读配置（不重建场景），按当前关键帧 id 重新摆。 */
  async Reload() {
    const result = await this.store.Load(this.levelKey);
    await this.Resync(result, { external: false });
    return true;
  }

  /** 换上新读到的配置：按当前关键帧 id 重新摆（id 没了就停在原序号上）。 */
  async Resync(result, { external }) {
    const id = this.keyframe?.id;
    this.ApplyLoaded(result);
    let index = id != null ? KeyframeIndex(this.doc, id) : -1;
    if (index < 0) index = Math.min(Math.max(0, this.index), this.doc.keyframes.length - 1);
    this.index = -1;
    this.SetupLevelLists();
    await this.GoTo(index, { animate: false });
    if (this.configState === "error") { this.ui.Toast(this.configMessage, "error"); return; }
    if (!external) { this.ui.Toast("已重新读取配置", "info"); return; }
    this.PushStatus("synced", "配置已在外部修改，已同步");
    this.ui.Toast("配置已在外部修改，已同步", "info");
    clearTimeout(this.syncedTimer);
    this.syncedTimer = setTimeout(() => this.PushStatus(), 2500);
  }

  SetupLevelLists() {
    this.ui.SetKeyframes(this.KeyframeList(), Math.max(0, this.index));
    this.map.SetKeyframes(this.doc.keyframes.map(kf => ({ id: kf.id, stage: kf.stage, player: { x: kf.player.x, z: kf.player.z } })), Math.max(0, this.index));
  }

  /** 外部修改同步：页面可见时每 2 s 读一次原文，原文变了才动。 */
  async Poll() {
    if (this.polling || this.switching || !this.ready) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    this.polling = true;
    try {
      const result = await this.store.Load(this.levelKey);
      // 网络抖一下不算「外部修改」；切关途中读到的是上一关的
      if (this.switching || result.state === "error") return;
      if ((result.text ?? null) === this.configText) return;
      await this.Resync(result, { external: true });
      this.syncCount = (this.syncCount || 0) + 1;
    } catch (error) {
      console.warn("[Blockout] poll failed", error);
    } finally {
      this.polling = false;
    }
  }

  // -------------------------------------------------------------------------
  // 关键帧

  KeyframeList() {
    return (this.doc?.keyframes || []).map(kf => ({ id: kf.id, stage: kf.stage, stageTitle: kf.stageTitle, name: kf.name }));
  }

  ResolvePending(value) {
    const pending = this.pending;
    this.pending = null;
    pending?.(value);
  }

  /**
   * 跳到某个关键帧。玩家立即传送（保留武器弹药）；animate 只在「第 i 个到第 i+1 个」时生效，
   * 其余一律直接到位。返回的 Promise 在过渡结束时 resolve。
   */
  GoTo(idOrIndex, { animate = false } = {}) {
    if (!this.doc || this.rebuilding) return Promise.resolve(false);
    const index = KeyframeIndex(this.doc, idOrIndex);
    if (index < 0) return Promise.resolve(false);
    const prevIndex = this.index;
    const prevKf = this.doc.keyframes[prevIndex] || null;
    const kf = this.doc.keyframes[index];
    this.ResolvePending(false);
    this.index = index;
    this.ApplySignals(kf);
    this.PlacePlayer(kf.player);
    this.host.camera.getWorldPosition(this._cam);
    let promise = Promise.resolve(true);
    if (animate && prevKf && index === prevIndex + 1) {
      promise = this.StartTransition(prevKf, kf);
    } else {
      this.unitData = new Map(kf.units.map(u => [u.id, u]));
      this.puppets.Apply(kf.units, this._cam);
    }
    if (this.puppets.warning) this.ui.Toast(this.puppets.warning, "warn");
    this.markers.SetPois(kf.pois);
    this.markers.SetNext(kf.next && Number.isFinite(kf.next.x) ? kf.next : null);
    this.ui.SetKeyframes(this.KeyframeList(), index);
    this.map.SetKeyframes(this.doc.keyframes.map(k => ({ id: k.id, stage: k.stage, player: { x: k.player.x, z: k.player.z } })), index);
    this.cardKey = "";
    this.UpdateCard(true);
    this.mapTimer = 0;
    this.ReplaceUrl();
    return promise;
  }

  Next() {
    if (!this.doc || this.index + 1 >= this.doc.keyframes.length) return Promise.resolve(false);
    return this.GoTo(this.index + 1, { animate: true });
  }

  Prev() {
    if (!this.doc || this.index <= 0) return Promise.resolve(false);
    return this.GoTo(this.index - 1, { animate: false });
  }

  /** Y：先把单位摆回上一关键帧，再播进入当前关键帧的过渡（玩家不动）。 */
  Replay() {
    if (!this.doc || this.rebuilding || this.index <= 0) return Promise.resolve(false);
    const prevKf = this.doc.keyframes[this.index - 1], kf = this.doc.keyframes[this.index];
    this.ResolvePending(false);
    this.host.camera.getWorldPosition(this._cam);
    this.puppets.Apply(prevKf.units, this._cam);
    return this.StartTransition(prevKf, kf);
  }

  /** 播 prevKf → kf 的过渡（§5.2）；返回过渡结束时 resolve 的 Promise。 */
  StartTransition(prevKf, kf) {
    const plan = PlanTransition(prevKf, kf);
    this.unitData = new Map([...prevKf.units.map(u => [u.id, u]), ...kf.units.map(u => [u.id, u])]);
    this.toUnitData = new Map(kf.units.map(u => [u.id, u]));
    this.puppets.Transition(plan, prevKf.units, kf.units, this._cam);
    // 原地出现 / 一开始就消失的人：地环闪一下
    for (const entry of plan.units) {
      if ((entry.mode === "appear" && !entry.walkIn) || (entry.mode === "vanish" && !entry.walkOut)) {
        this.markers.Flash(entry.from.x, entry.from.z, (entry.unitTo || entry.unitFrom)?.side);
      }
    }
    this.lastPlan = { durationS: plan.durationS, playbackRate: plan.playbackRate, wallS: plan.wallS, units: plan.units.length };
    if (plan.playbackRate > 1.01) this.ui.Toast(`快进 ×${plan.playbackRate.toFixed(1)}`, "info");
    if (!this.puppets.transitioning) { this.unitData = this.toUnitData; this.toUnitData = null; return Promise.resolve(true); }
    return new Promise(resolve => { this.pending = resolve; });
  }

  /** §5.4：当前关键帧的信号视为已发生。集合变了就整份还原一次场景态与门，再刷导航。 */
  ApplySignals(kf) {
    const next = new Set(kf.signals || []);
    const prev = this.signals;
    this.signals = next;
    if (prev && prev.size === next.size && [...prev].every(name => next.has(name))) return;
    const field = this.game.battlefield;
    try {
      const changed = field?.RestoreScenario?.({ signalled: (name) => next.has(name) }) || 0;
      if (changed > 0) this.game.nav?.Refresh?.(field, { spread: true });
    } catch (error) {
      console.warn("[Blockout] scenario restore failed", error);
    }
  }

  Signalled(name) { return !!this.signals?.has(name); }

  /** 传送玩家，保留武器弹药（不走 player.Spawn 的整套复位）。 */
  PlacePlayer(pose) {
    const player = this.game.player;
    if (!player || !pose) return;
    let x = pose.x, z = pose.z, y = this.groundAt(x, z);
    const physics = player.physics;
    if (physics?.GroundProbe) y = physics.GroundProbe(x, z, y + 0.3, 1.2, 4).y;
    // 机位是设计者写死的（常常站在射击台阶上、贴着沙袋）：只在膝盖以上真埋进墙里时才挪，
    // 探针取细一点、矮一点的身子，脚下的矮台阶不算。
    const { freeSpotRadius: radius, freeSpotHeight: height, freeSpotM } = BLOCKOUT_EDITOR;
    if (physics?.Overlaps && physics.FindFreeSpot && physics.Overlaps(x, y + 0.35, z, radius, height)) {
      const free = physics.FindFreeSpot(x, z, radius, height, freeSpotM);
      if (free.moved >= 0) { x = free.x; z = free.z; }
      y = free.y;
    }
    player.position.set(x, y, z);
    player.body?.Teleport?.(x, y, z);
    player.yaw = (pose.yawDeg || 0) * DEG;
    player.pitch = (pose.pitchDeg || 0) * DEG;
    player.aimYaw = 0;
    player.aimPitch = 0;
    player.velocity?.set?.(0, 0, 0);
    player.SetStance?.(pose.stance || "stand");
  }

  // -------------------------------------------------------------------------
  // 每帧

  Update(dt) {
    if (!this.started || this.switching || !this.doc) return;
    const game = this.game;
    if (!game.state?.ready || !game.battlefield) return;
    const camera = this.host.camera;
    camera.getWorldPosition(this._cam);
    const locked = !!this.PointerLocked();
    if (locked !== this.locked) { this.locked = locked; this.ui.SetInteractive(!locked); }
    this.puppets.Update(dt, this._cam);
    if (!this.puppets.transitioning && this.toUnitData) { this.unitData = this.toUnitData; this.toUnitData = null; }
    if (this.pending && !this.puppets.transitioning) this.ResolvePending(true);
    this.liveUnits = this.LiveUnits();
    this.markers.SetUnits(this.liveUnits);
    this.markers.Update(dt);
    this.UpdateCard(false);
    this.mapTimer -= dt;
    if (this.mapTimer <= 0) { this.mapTimer = 1 / BLOCKOUT_EDITOR.mapHz; this.PaintMaps(); }
  }

  /** 演员现场位置 + 关键帧数据（标记层与俯视图都读这一份）。 */
  LiveUnits() {
    const out = [];
    for (const live of this.puppets.Live()) {
      const unit = this.unitData.get(live.id);
      if (!unit) continue;
      let arc = null;
      if (this.layers.arcs !== "off" && this.layers.arcs !== false) {
        const source = unit.arc || (this.layers.arcs === "all" ? DefaultArc(unit, "all") : null);
        if (source) arc = { halfDeg: source.halfDeg, rangeM: source.rangeM,
          yawDeg: source.source === "data" ? source.yawDeg : live.yawDeg };
      }
      out.push({ id: unit.id, side: unit.side, kind: unit.kind, name: unit.name, weapon: unit.weapon, role: unit.role,
        x: live.x, z: live.z, yawDeg: live.yawDeg, stance: live.stance, moving: live.moving, visible: live.visible,
        arc, intent: unit.intent, guess: unit.guess, state: unit.state, aim: unit.aim });
    }
    return out;
  }

  NextView() {
    const kf = this.keyframe, player = this.game.player;
    if (!kf?.next) return null;
    if (!Number.isFinite(kf.next.x) || !player) return { text: kf.next.text, distanceM: null, relYawDeg: null };
    const p = player.position;
    const distanceM = Math.hypot(kf.next.x - p.x, kf.next.z - p.z);
    const relYawDeg = WrapDeg(YawDegFromTo({ x: p.x, z: p.z }, kf.next) - player.yaw / DEG);
    return { text: kf.next.text, distanceM, relYawDeg };
  }

  UpdateCard(force) {
    const kf = this.keyframe;
    if (!kf) return;
    const next = this.NextView();
    const key = `${this.index}|${next ? `${Math.round(next.distanceM ?? -1)}|${Math.round((next.relYawDeg ?? 0) / 3)}` : "-"}`;
    if (!force && key === this.cardKey) return;
    this.cardKey = key;
    this.ui.SetCard({
      stage: kf.stage, stageTitle: kf.stageTitle, name: kf.name, what: kf.what,
      next, how: kf.how, notes: kf.notes, guessCount: kf.units.filter(u => u.guess).length,
    });
  }

  PaintMaps() {
    const kf = this.keyframe, player = this.game.player;
    if (!kf || !player) return;
    this.map.SetDynamic({
      player: { x: player.position.x, z: player.position.z, yawDeg: player.yaw / DEG },
      units: this.liveUnits,
      pois: kf.pois,
      next: kf.next && Number.isFinite(kf.next.x) ? kf.next : null,
    });
    const mini = this.ui.miniCanvas;
    if (mini) this.map.PaintMini(mini, { pxPerM: BLOCKOUT_EDITOR.miniPxPerM });
    if (this.mapOpen && this.ui.fullCanvas) this.map.PaintFull(this.ui.fullCanvas);
  }

  // -------------------------------------------------------------------------
  // 图层 / 地图 / 输入

  SetLayers(partial = {}) {
    for (const [name, value] of Object.entries(partial)) {
      if (!(name in this.layers)) continue;
      if (name === "arcs") this.layers.arcs = value === true ? "default" : value === false ? "off" : ["all", "default", "off"].includes(value) ? value : this.layers.arcs;
      else this.layers[name] = !!value;
    }
    this.markers.SetLayers(this.layers);
    this.map.SetLayers({ arcs: this.layers.arcs !== "off", intents: this.layers.intents, labels: this.layers.labels });
    this.ui.SetLayers(this.layers);
    this.mapTimer = 0;
    return { ...this.layers };
  }

  ToggleMap(open) {
    const next = open === undefined ? !this.mapOpen : !!open;
    if (next === this.mapOpen) return this.mapOpen;
    this.mapOpen = next;
    this.ui.SetMapOpen(next);
    if (next) {
      // 要能在图上缩放、点选：把鼠标还给用户
      this.ReleasePointerLock();
      this.map.FitBounds();
    }
    this.mapTimer = 0;
    return this.mapOpen;
  }

  BindKeys() {
    this.onKeyDown = (event) => {
      if (!this.ready || event.repeat) return;
      const target = event.target;
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName || "")) return;
      if (this.host.launcherOpen) return;
      if (event.code === "Period") { event.preventDefault(); this.Next(); }
      else if (event.code === "Comma") { event.preventDefault(); this.Prev(); }
      else if (event.code === "KeyY") { event.preventDefault(); this.Replay(); }
      else if (event.code === "Escape" && this.mapOpen) { event.preventDefault(); this.ToggleMap(false); }
    };
    document.addEventListener("keydown", this.onKeyDown);
  }

  /** 全关总图：滚轮以光标为中心缩放、拖动平移、双击回到全图、点关键帧点跳转（图保持打开）。只挂在这块 canvas 上。 */
  BindFullMap() {
    const canvas = this.ui.fullCanvas;
    if (!canvas) return;
    const Local = (event) => { const r = canvas.getBoundingClientRect(); return [event.clientX - r.left, event.clientY - r.top]; };
    let drag = null;
    this.mapListeners = {
      wheel: (event) => { event.preventDefault(); event.stopPropagation(); const [x, y] = Local(event); this.map.ZoomAt(x, y, event.deltaY < 0 ? 1.2 : 1 / 1.2); this.mapTimer = 0; },
      mousedown: (event) => { event.stopPropagation(); if (event.button !== 0) return; drag = { x: event.clientX, y: event.clientY, moved: 0 }; },
      mousemove: (event) => {
        if (!drag) return;
        const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
        drag.x = event.clientX; drag.y = event.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
        this.map.PanBy(dx, dy); this.mapTimer = 0;
      },
      mouseup: (event) => {
        if (!drag) return;
        const click = drag.moved < 4;
        drag = null;
        if (!click) return;
        const [x, y] = Local(event);
        const index = this.map.PickKeyframe(x, y);
        if (index >= 0) this.GoTo(index, { animate: false });
      },
      mouseleave: () => { drag = null; },
      dblclick: (event) => { event.preventDefault(); this.map.FitBounds(); this.mapTimer = 0; },
    };
    for (const [name, fn] of Object.entries(this.mapListeners)) canvas.addEventListener(name, fn, name === "wheel" ? { passive: false } : undefined);
  }

  // -------------------------------------------------------------------------
  // 存档

  /** 「记下当前机位」：把玩家现在的位置 / 朝向 / 姿态写进当前关键帧的 player 并保存。 */
  async SavePose() {
    const kf = this.keyframe, player = this.game.player;
    if (!this.rawDoc || !kf || !player) { this.ui.Toast("没有可写的配置（先修好配置文件）", "error"); return { ok: false }; }
    const raw = this.rawDoc.keyframes?.find(item => item?.id === kf.id);
    if (!raw) { this.ui.Toast("配置里找不到这个关键帧", "error"); return { ok: false }; }
    const before = JSON.stringify(raw.player);
    raw.player = {
      ...(raw.player && typeof raw.player === "object" ? raw.player : {}),
      x: Round(player.position.x, 2), z: Round(player.position.z, 2),
      yawDeg: Round(WrapDeg(player.yaw / DEG), 1), pitchDeg: Round(player.pitch / DEG, 1),
      stance: ["stand", "crouch", "prone"].includes(player.stance) ? player.stance : "stand",
    };
    delete raw.player.faceTo;
    const check = ValidateBlockout(this.rawDoc);
    if (!check.ok) {
      raw.player = JSON.parse(before);
      this.ui.Toast(`配置有错误，没有保存：${check.errors[0]}`, "error");
      return { ok: false, errors: check.errors };
    }
    const result = await this.store.Save(this.levelKey, this.rawDoc);
    if (result.ok && result.mode === "server") {
      this.configText = `${JSON.stringify(this.rawDoc, null, 2)}\n`;
      this.writable = true; this.saveReason = "";
      this.ui.Toast("机位已保存", "ok");
    } else if (result.ok && result.mode === "local") {
      this.writable = false; this.saveReason = result.reason || "";
      this.store.Download(this.levelKey, this.rawDoc);
      this.ui.Toast(`机位存成了本地草稿并下载了配置：${result.reason || ""}`, "warn");
    } else {
      this.ui.Toast(result.reason || "保存失败", "error");
    }
    // 卡片、地图与之后的跳转按新机位走
    const id = kf.id;
    this.doc = NormalizeBlockout(this.rawDoc);
    this.index = KeyframeIndex(this.doc, id);
    this.SetupLevelLists();
    this.PushStatus();
    return result;
  }

  // -------------------------------------------------------------------------
  // 取证

  State() {
    const kf = this.keyframe;
    return {
      ready: this.ready, level: this.levelKey, index: this.index, id: kf?.id ?? null,
      count: this.doc?.keyframes.length ?? 0, transitioning: this.puppets.transitioning,
      units: this.puppets.puppets.size, configState: this.configState, configMessage: this.configMessage,
      mapOpen: this.mapOpen, pointerLocked: !!this.PointerLocked(), switching: !!this.switching,
      layers: { ...this.layers }, signals: [...(this.signals || [])], syncCount: this.syncCount || 0,
      lastPlan: this.lastPlan || null, writable: this.writable,
    };
  }

  Stats() {
    return {
      puppets: this.puppets.puppets.size, actors: this.puppets.actorCount, warning: this.puppets.warning,
      markers: { ...this.markers.stats },
    };
  }

  Dispose() {
    clearInterval(this.pollTimer);
    clearTimeout(this.syncedTimer);
    document.removeEventListener("keydown", this.onKeyDown);
    const canvas = this.ui.fullCanvas;
    if (canvas && this.mapListeners) for (const [name, fn] of Object.entries(this.mapListeners)) canvas.removeEventListener(name, fn);
    this.ResolvePending(false);
    this.puppets.Dispose();
    this.markers.Dispose();
    this.map.Dispose();
    this.ui.Dispose();
    this.root.remove();
  }
}
