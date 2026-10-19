// 白盒关卡编辑器的总控（docs/Data_EditorBlockout.md §6.2）。
//
// 入口：index.html?editor=blockout&level=FirstLevel[&kf=03-2]。Script_Main 只加薄钩子
//（换表、跳过任务运行时 / 过场 / 撒兵、每帧调 Update、场景信号接 Signalled），其余都在这里：
//   读配置 → 校验（错误进状态点与提示条，配置坏了仍能走场景）→ 建界面 / 地图 / 标记 / 演员
//   → 跳到 kf 指定的关键帧；切关走现成的 JumpToLevel（整片拆除重建）；
//   页面可见时每 2 s 读一次配置原文，变了就按当前关键帧 id 重新摆（AI 改完 JSON、这里自动看到）；
//   外面改到一半（文件暂时没了、JSON 写了一半、校验不过）不换掉已经载入的配置，只亮红点报原因；
//   玩家留在原地，只有当前关键帧的 player 改了才挪过去；
//   「记下当前机位」把玩家现在的位置 / 朝向 / 姿态写回当前关键帧并保存（带上读配置时的版本号，§7）；
//   「复制当前位置」（P）把关卡 / 关键帧 / 机位 / 准星落点 / 附近的人整理成一段文字放进剪贴板，贴给 agent 用（§4.2）；
//   地址栏带 pose=x,z,朝向,俯仰,姿态 时，落到关键帧后再把玩家摆到这个机位（那段文字里的「重现」链接就是它）。
//   预演（§14，Script_EditorBlockoutPreviz）：读 Blockout/<Level>.previz.json（404 = 没有），卡片上的「预演」按钮或 N 播，
//   播放中相机经 ApplyCamera 归预演、鼠标与 WASD 归预演（CapturesMouse / CapturesInput）、3D 标记与头顶标签藏起来、
//   导航栏与翻关键帧的键不响应；N / Esc 中断，播完 / 中断按 then 跳关键帧。
//
// 界面（Script_EditorBlockoutUi）与纸面俯视图（Script_EditorBlockoutMap）只走 §4 / §4.1 的接口；
// 全关总图上的鼠标（滚轮缩放、拖动平移、双击看全图、点关键帧）归地图模块，点选经 onMapPick 回到这里。
// 地形与水的样子（§6.3）在每次建关后补：顶点按真实高度上色、地面加米格线、水块铺成水面。

import * as THREE from "three";
import {
  BLOCKOUT_LEVELS, BLOCKOUT_PHASES, BlockoutTintColor, BlockoutWaterBlocks, BlockoutMapScene,
} from "./Script_EditorBlockoutLevels.mjs";
import {
  ValidateBlockout, NormalizeBlockout, KeyframeIndex, PlanTransition, DefaultArc, YawDegFromTo, BlockoutConfigPath,
} from "./Script_EditorBlockoutConfig.mjs";
import { BuildBlockoutSnapshot, FormatBlockoutSnapshot, ParsePoseParam } from "./Script_EditorBlockoutSnapshot.mjs";
import { BlockoutPuppets } from "./Script_EditorBlockoutPuppets.mjs";
import { BlockoutTrees } from "./Script_EditorBlockoutTrees.mjs";
import { BlockoutMarkers } from "./Script_EditorBlockoutMarkers.mjs";
import { BlockoutStore } from "./Script_EditorBlockoutStore.mjs";
import { BlockoutUi } from "./Script_EditorBlockoutUi.mjs";
import { BlockoutMap } from "./Script_EditorBlockoutMap.mjs";
import { BlockoutPreviz, PREVIZ_KEY } from "./Script_EditorBlockoutPreviz.mjs";
import { BlockStandSampler } from "./Script_EditorBlockoutPrevizPlan.mjs";
import { BuildWhiteboxWater } from "./Script_FirstLevelWhiteboxLooks.mjs";
import { ApplyPatches, MakePatch, PatchesOf } from "./Script_MaterialPatches.mjs";
import { MarkNoPrepass } from "./Script_Post.mjs";
import { STANCE } from "./Data_Tuning_Player.mjs";

const DEG = Math.PI / 180;
/** 打开全关总图时短边大约看多少米（玩家附近一片，不是全图）。 */
const MAP_FOCUS_SPAN_M = 220;
/** 「复制当前位置」里准星射线打多远。 */
const AIM_RAY_M = 300;

export const BLOCKOUT_EDITOR = Object.freeze({
  pollS: 2,
  mapHz: 8,
  miniPxPerM: 1.6,
  freeSpotM: 3,
  freeSpotRadius: 0.2,
  freeSpotHeight: 1.2,
  // 关键帧摆的蹲 / 趴是给那一帧机位看的：离开机位走出这么远就自动站起来，
  // 否则自由走动时一直是蹲着的眼高（1.05 m）和蹲走速度，像半蹲着走（用户 2026-10-20）。
  // 头顶这一截（脚底往上 standClearFromM 起、高 standClearHeightM）有东西就先不站（洞里、桌下）。
  standUpAfterM: 0.35,
  standClearFromM: 1.0,
  standClearHeightM: 0.8,
  groundName: "FirstLevelWhitebox_Ground",
  // 第一次烘纸面地图要等加载画面收掉、再跑够这么久的游戏帧：开机那阵子一起烘会卡出一帧约 290 ms
  //（C 包实测；延后 1.5 s 就没有了）。之后切关建完就烘。
  firstBakeDelayMs: 1500,
  firstBakeMinFrames: 30,
});

function WrapDeg(deg) { let d = ((deg + 180) % 360 + 360) % 360 - 180; if (d === -180) d = 180; return d; }
function Round(value, digits) { const k = 10 ** digits; return Math.round(value * k) / k; }

/** 写剪贴板：先走 navigator.clipboard，被拒（非安全上下文、没焦点、宿主不给权限）再走 execCommand。→ 用上的方法名 | null。 */
async function WriteClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return "clipboard"; }
  } catch (error) { /* 落到下面 */ }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;";
  const active = document.activeElement;
  document.body.appendChild(area);
  let ok = false;
  try { area.select(); ok = document.execCommand("copy"); } catch (error) { ok = false; }
  area.remove();
  if (active && active !== document.body && typeof active.focus === "function") active.focus({ preventScroll: true });
  return ok ? "execCommand" : null;
}

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
    // 读配置时按原始字节算的 sha1（§7）：保存时原样带上；null = 文件当时不存在；undefined = 不知道
    this.revision = undefined;
    // 盘上的配置现在是坏的 / 没了，手里拿的是上一次好的：不许拿它去盖盘上的文件
    this.staleConfig = false;
    this.configState = "loading";
    this.configMessage = "";
    this.validation = null;
    this.index = -1;
    this.signals = null;
    this.unitData = new Map();
    this.toUnitData = null;
    this.liveUnits = [];
    this.pending = null;
    this.switching = null;
    this.started = false;
    this.ready = false;
    this.mapOpen = false;
    this.locked = null;
    this.mapTimer = 0;
    this.cardKey = "";
    this.transitionKey = "";
    this.writable = null;
    this.saveReason = "";
    // 轮询与保存的先后：每次开始 / 结束保存都 +1，轮询读回来时代数变了就丢掉这次读到的
    this.saving = false;
    this.saveGen = 0;
    this.syncCount = 0;
    this.syncRejected = 0;
    this.lastSyncMs = null;
    // 第一次烘纸面地图：等加载画面收掉、再跑一阵游戏帧（见 BLOCKOUT_EDITOR.firstBakeDelayMs）
    this.firstBakeDone = false;
    this.bakeWait = null;
    this.bake = { startedAt: null, doneAt: null, levelKey: null };
    this._cam = new THREE.Vector3();
    this.groundAt = (x, z) => {
      const field = this.game.battlefield;
      if (!field) return 0;
      return field.BaseGroundHeight ? field.BaseGroundHeight(x, z) : field.GroundHeight(x, z);
    };
    // 站人的地面（演员、预演镜头、倒地）：高度场 + 能一步踩上去（≤ 1 m）的实心块顶面（射击台、台阶），
    // gates 只算此刻还在场上的。地图、地形上色、水面仍用纯高度场 groundAt。
    this.standAt = (x, z) => {
      const layout = this.game.battlefield?.layout;
      if (!layout) return this.groundAt(x, z);
      if (this.standLayout !== layout) {
        this.standLayout = layout;
        this.standSampler = BlockStandSampler(layout.blocks, layout.gates, this.groundAt, (name) => this.Signalled(name));
      }
      return this.standSampler(x, z);
    };

    this.root = document.createElement("div");
    this.root.id = "blockoutRoot";
    document.body.appendChild(this.root);
    this.labelRoot = document.createElement("div");
    this.labelRoot.className = "blockoutLabels";
    this.labelRoot.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:30;overflow:hidden;";
    this.root.appendChild(this.labelRoot);

    this.puppets = new BlockoutPuppets({ scene: host.scene, actorFactory: host.actorFactory, library: host.library, groundAt: this.standAt });
    // 树：布局里标 blockoutTree 的块种游戏里的枯树模型（2026-10-20，§5.7）
    this.trees = new BlockoutTrees({ scene: host.scene, groundAt: this.groundAt });
    this.markers = new BlockoutMarkers({ post: host.post, camera: host.camera, groundAt: this.standAt, labelRoot: this.labelRoot });
    this.map = new BlockoutMap();
    this.ui = new BlockoutUi(this.root, {
      onPrev: () => { if (!this.previz?.playing) this.Prev(); },
      onNext: () => { if (!this.previz?.playing) this.Next(); },
      onSeek: (index) => { if (!this.previz?.playing) this.GoTo(index, { animate: index === this.index + 1 }); },
      onLevel: (key) => { this.SwitchLevel(key); },
      onLayer: (name, on) => { this.SetLayers({ [name]: on }); },
      onSavePose: () => { this.SavePose(); },
      onCopy: () => { this.CopySnapshot(); },
      onReplay: () => { if (!this.previz?.playing) this.Replay(); },
      onOpenMap: () => { this.ToggleMap(true); },
      onCloseMap: () => { this.ToggleMap(false); },
      onMapPick: (index) => { if (!this.previz?.playing) this.GoTo(index, { animate: false }); },
      onPreviz: () => { this.previz.Toggle(); },
    });
    this.previz = new BlockoutPreviz(this);
    this.previzSignals = null;
    this.BindKeys();

    this.api = {
      State: () => this.State(),
      GoTo: (idOrIndex, options) => { this.previz?.Stop({ restore: false }); return this.GoTo(idOrIndex, options); },
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
      // 「复制当前位置」（§4.2）：Snapshot() 是快照对象，SnapshotText() 是贴给 agent 的那段文字，
      // CopySnapshot() 真去写剪贴板（→ { ok, method, text }）。
      Snapshot: () => this.Snapshot(),
      SnapshotText: () => { const snap = this.Snapshot(); return snap ? FormatBlockoutSnapshot(snap) : null; },
      CopySnapshot: () => this.CopySnapshot(),
      Stats: () => this.Stats(),
      // 取证 / 出图用：把玩家摆到任意机位（{x,z,yawDeg,pitchDeg?,stance?}），不改关键帧。
      PlacePlayer: (pose) => { this.PlacePlayer(pose); return { x: this.game.player.position.x, z: this.game.player.position.z }; },
      // 测试用：全关总图的视图，与某个关键帧点在屏幕上的位置（客户区像素；图没开时 null）。
      MapView: () => this.MapView(),
      MapPoint: (idOrIndex) => this.MapPoint(idOrIndex),
      // 测试用：标记层与俯视图正在用的单位（演员现场位置 + 关键帧数据）。
      Marked: () => this.liveUnits.map(u => ({ id: u.id, name: u.name, side: u.side, kind: u.kind, x: u.x, z: u.z, arc: !!u.arc })),
      // 取证用：某个演员此刻的样子（播的动作、姿态、脚下高度、定妆身体、骨盆离地）。
      Probe: (id) => this.puppets.Probe(id),
      // 取证用（2026-10-18 第三轮）：站人的地面（高度场 + 一步能踩上的块顶，§5.6）
      StandAt: (x, z) => this.standAt(x, z),
    };
    // 预演（§14.2）：Has / Play / Stop / Seek / Resume / State；Reload 重读预演文件，CameraPose 取某一秒的机位。
    this.api.Previz = {
      Has: (idOrIndex) => this.previz.Has(idOrIndex),
      Play: (idOrIndex) => this.previz.Play(idOrIndex),
      Stop: () => this.previz.Stop(),
      Seek: (t) => this.previz.Seek(t),
      Resume: () => this.previz.Resume(),
      State: () => this.previz.State(),
      Reload: () => this.previz.Load({ force: true }),
      CameraPose: (t) => this.previz.CameraPose(t),
    };
  }

  get phase() { return BLOCKOUT_PHASES[this.levelIndex]; }
  get level() { return BLOCKOUT_LEVELS[this.levelIndex]; }
  get keyframe() { return this.doc?.keyframes[this.index] || null; }

  // -------------------------------------------------------------------------
  // 启动 / 切关

  async Start() {
    this.ui.SetLevels(BLOCKOUT_LEVELS.map(({ key: k, label, era, badge, note, short }) => ({ key: k, label, era, badge, note, short })), this.levelKey);
    this.ui.SetLayers(this.layers);
    this.ui.SetStatus({ state: "loading", message: "正在读配置", writable: false, saveReason: "" });
    this.started = true;
    await this.LoadConfig();
    this.SetupLevel();
    await this.previz.Load({ force: true });
    const kf = this.params.get("kf");
    // 「重现」链接带来的机位：落到关键帧之后再摆（地址栏里的 pose 由 ReplaceUrl 去掉，之后翻关键帧不再套用）
    const pose = ParsePoseParam(this.params.get("pose"));
    let index = kf != null ? KeyframeIndex(this.doc, kf) : 0;
    if (index < 0) index = 0;
    await this.GoTo(index, { animate: false });
    if (pose) { this.PlacePlayer(pose); this.UpdateCard(true); }
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

  /** 读当前关卡的配置（原文 + 校验 + 归一化）。这一关第一次读：坏了也给一个能走的空配置。 */
  async LoadConfig() {
    const result = await this.store.Load(this.levelKey);
    this.ApplyLoaded(result, { keepOnError: false });
    await this.PrepareCasts();
  }

  /** 这一关用到的、要按需下载的定妆模型（翻译的 NRA06）先下完，否则造出来是方块占位人。 */
  PrepareCasts() {
    return this.puppets.PrepareCasts((this.doc?.keyframes || []).flatMap(kf => kf.units || []));
  }

  /**
   * 换上读到的配置。→ true = 换上了；false = 没换（keepOnError 且读到的是坏的）。
   * keepOnError：已经有一份载入的配置时（外部同步、重读），文件暂时没了 / JSON 写了一半 /
   * 校验不过 / 一个关键帧都没有，**不换**：留着手里的配置、序号、演员与信号，只亮红点写原因，
   * 记下这份坏原文（下一次轮询读到同一份就不再提示）。空配置只在这一关第一次读时给。
   */
  ApplyLoaded(result, { keepOnError = false } = {}) {
    let check = null, normalized = null;
    if (result.state === "ok") {
      check = ValidateBlockout(result.doc);
      normalized = NormalizeBlockout(result.doc);
    }
    const usable = !!normalized && normalized.keyframes.length > 0;
    if (keepOnError && this.doc && (!usable || !check.ok)) {
      this.configText = result.text ?? null;
      this.staleConfig = true;
      this.configState = "error";
      const reason = result.state !== "ok" ? result.message
        : !check.ok ? `配置有 ${check.errors.length} 处错误：${check.errors.slice(0, 2).join("；")}`
          : "配置里一个关键帧都没有";
      this.configMessage = `${reason}（先保留上一次读到的配置）`;
      this.PushStatus();
      return false;
    }
    this.configText = result.text ?? null;
    this.revision = result.revision;
    this.staleConfig = false;
    this.validation = check;
    if (result.state !== "ok") {
      this.rawDoc = null;
      this.doc = EmptyDoc(this.level, this.phase);
      this.configState = "error";
      this.configMessage = result.message;
      this.PushStatus();
      return true;
    }
    this.rawDoc = result.doc;
    this.doc = usable ? normalized : EmptyDoc(this.level, this.phase);
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
    return true;
  }

  PushStatus(state = this.configState, message = this.configMessage) {
    this.ui.SetStatus({ state, message, writable: !!this.writable, saveReason: this.saveReason || "" });
  }

  /** 建关之后：补地形与水的样子，交给地图，摆 POI。 */
  SetupLevel() {
    const layout = this.phase.whitebox.layout;
    this.DressWorld(layout);
    // 文件场景每次进关都重读（可能被生成器改过），块数不变时地图的缓存认不出来：先丢掉
    if (this.level.scene?.kind === "file") this.map.ClearCache?.(this.levelKey);
    this.map.SetScene({ levelKey: this.levelKey, ...BlockoutMapScene(layout, this.groundAt) });
    if (this.firstBakeDone) this.StartBake();
    else this.bakeWait = { frames: 0, since: null };
    this.map.FitBounds();
    this.ui.SetKeyframes(this.KeyframeList(), Math.max(0, this.index));
    this.map.SetKeyframes(this.doc.keyframes.map(kf => ({ id: kf.id, stage: kf.stage, stageLabel: kf.stageLabel, player: { x: kf.player.x, z: kf.player.z } })), Math.max(0, this.index));
  }

  /** 烘这一关的纸面静态层（空闲分块；同一关已经烘过直接回来）。 */
  StartBake() {
    this.firstBakeDone = true;
    this.bakeWait = null;
    const levelKey = this.levelKey;
    this.bake = { startedAt: performance.now(), doneAt: null, levelKey };
    Promise.resolve(this.map.Bake()).then(() => {
      if (this.bake.levelKey === levelKey) this.bake.doneAt = performance.now();
      this.mapTimer = 0;
    }).catch((error) => console.warn("[Blockout] map bake failed", error));
  }

  /** 第一次烘：等加载画面收掉，再跑够 firstBakeDelayMs 的游戏帧（开机那阵子一起烘会卡一大帧）。 */
  UpdateFirstBake() {
    const wait = this.bakeWait;
    if (!wait) return;
    const boot = typeof document !== "undefined" ? document.getElementById("boot") : null;
    if ((boot && !boot.classList.contains("gone")) || !this.game.state?.running) { wait.frames = 0; wait.since = null; return; }
    const now = performance.now();
    if (wait.since === null) wait.since = now;
    wait.frames += 1;
    if (now - wait.since >= BLOCKOUT_EDITOR.firstBakeDelayMs && wait.frames >= BLOCKOUT_EDITOR.firstBakeMinFrames) this.StartBake();
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
      this.previz.Stop({ restore: false });
      this.ui.SetStatus({ state: "loading", message: "正在切换关卡", writable: !!this.writable, saveReason: this.saveReason || "" });
      this.puppets.Apply([]);
      this.markers.SetUnits([]);
      this.markers.SetPois([]);
      this.markers.SetNext(null);
      this.unitData = new Map();
      this.toUnitData = null;
      this.liveUnits = [];
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
      await this.previz.Load({ force: true });
      this.ui.SetLevels(BLOCKOUT_LEVELS.map(({ key: k, label, era, badge, note, short }) => ({ key: k, label, era, badge, note, short })), this.levelKey);
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
      url.searchParams.delete("pose");
      history.replaceState(history.state, "", url);
    } catch (error) { /* 地址栏改不了不影响编辑 */ }
  }

  /** 重读配置（不重建场景），按当前关键帧 id 重新摆。 */
  async Reload({ holdPlayer = false, quiet = false } = {}) {
    const result = await this.store.Load(this.levelKey);
    if (result.state === "error") {
      if (!quiet) this.ui.Toast(result.message, "error");
      return false;
    }
    const applied = await this.Resync(result, { external: false, holdPlayer, quiet });
    await this.previz.Load({ force: true });
    this.UpdateCard(true);
    return applied;
  }

  /**
   * 换上新读到的配置：按当前关键帧 id 重新摆（id 没了就停在原序号上）。→ true = 换上了。
   * 读到的是坏的（文件没了、JSON 半截、校验不过）就不换，见 ApplyLoaded 的 keepOnError。
   * 玩家留在原地；只有当前关键帧的 player 改了（或换到了别的关键帧）才挪过去。holdPlayer = 无论如何不挪。
   */
  async Resync(result, { external, holdPlayer = false, quiet = false }) {
    const before = this.keyframe;
    const id = before?.id;
    const playerBefore = before ? JSON.stringify(before.player) : null;
    const applied = this.ApplyLoaded(result, { keepOnError: true });
    if (!applied) {
      this.syncRejected += 1;
      if (!quiet) this.ui.Toast(this.configMessage, "error");
      return false;
    }
    let index = id != null ? KeyframeIndex(this.doc, id) : -1;
    const sameKeyframe = index >= 0;
    if (!sameKeyframe) index = Math.min(Math.max(0, this.index), this.doc.keyframes.length - 1);
    const keepPlayer = holdPlayer || (sameKeyframe && JSON.stringify(this.doc.keyframes[index].player) === playerBefore);
    await this.PrepareCasts();
    this.index = -1;
    this.SetupLevelLists();
    await this.GoTo(index, { animate: false, keepPlayer });
    if (quiet) return true;
    if (this.configState === "error") { this.ui.Toast(this.configMessage, "error"); return true; }
    if (!external) { this.ui.Toast("已重新读取配置", "info"); return true; }
    this.PushStatus("synced", "配置已在外部修改，已同步");
    this.ui.Toast("配置已在外部修改，已同步", "info");
    clearTimeout(this.syncedTimer);
    this.syncedTimer = setTimeout(() => this.PushStatus(), 2500);
    return true;
  }

  SetupLevelLists() {
    this.ui.SetKeyframes(this.KeyframeList(), Math.max(0, this.index));
    this.map.SetKeyframes(this.doc.keyframes.map(kf => ({ id: kf.id, stage: kf.stage, stageLabel: kf.stageLabel, player: { x: kf.player.x, z: kf.player.z } })), Math.max(0, this.index));
  }

  /**
   * 外部修改同步：页面可见时每 2 s 读一次原文，原文变了才动（先比原文，不变就不解析、不算 sha1）。
   * 保存进行中不读；读的途中开始或做完了一次保存（saveGen 变了），读回来的可能是存之前的旧文，丢掉。
   */
  async Poll() {
    if (this.polling || this.switching || this.saving || !this.ready) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    this.polling = true;
    const gen = this.saveGen, levelKey = this.levelKey;
    try {
      const result = await this.store.Load(levelKey, { knownText: this.configText ?? undefined });
      // 网络抖一下不算「外部修改」；切关途中读到的是上一关的；读的时候存过档，读到的可能是旧文
      if (this.switching || this.saving || gen !== this.saveGen || levelKey !== this.levelKey) return;
      if (result.state === "error" || result.state === "same" || (result.text ?? null) === this.configText) { this.previz.Poll(); return; }
      this.previz.Poll({ configChanged: true });
      const t0 = performance.now();
      if (await this.Resync(result, { external: true })) {
        this.syncCount += 1;
        this.lastSyncMs = performance.now() - t0;
      }
    } catch (error) {
      console.warn("[Blockout] poll failed", error);
    } finally {
      this.polling = false;
    }
  }

  // -------------------------------------------------------------------------
  // 关键帧

  KeyframeList() {
    return (this.doc?.keyframes || []).map(kf => ({ id: kf.id, stage: kf.stage, stageTitle: kf.stageTitle, stageLabel: kf.stageLabel, name: kf.name }));
  }

  ResolvePending(value) {
    const pending = this.pending;
    this.pending = null;
    pending?.(value);
  }

  /**
   * 跳到某个关键帧。玩家立即传送（保留武器弹药）；animate 只在「第 i 个到第 i+1 个」时生效，
   * 其余一律直接到位。返回的 Promise 在过渡结束时 resolve。
   * keepPlayer：玩家不动（外部同步时当前关键帧的 player 没改）。
   */
  GoTo(idOrIndex, { animate = false, keepPlayer = false } = {}) {
    if (!this.doc || this.rebuilding) return Promise.resolve(false);
    const index = KeyframeIndex(this.doc, idOrIndex);
    if (index < 0) return Promise.resolve(false);
    // 预演播放中别处要跳关键帧（外部同步重摆等）：先中断预演（不再按 then 跳）
    if (this.previz?.playing) this.previz.Stop({ restore: false });
    const prevIndex = this.index;
    const prevKf = this.doc.keyframes[prevIndex] || null;
    const kf = this.doc.keyframes[index];
    this.ResolvePending(false);
    // 被打断的过渡留下的「到站后的单位数据」作废：否则下一帧会把它盖到这一帧的单位上
    this.toUnitData = null;
    this.index = index;
    this.ApplySignals(kf);
    if (!keepPlayer) this.PlacePlayer(kf.player);
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
    this.map.SetKeyframes(this.doc.keyframes.map(k => ({ id: k.id, stage: k.stage, stageLabel: k.stageLabel, player: { x: k.player.x, z: k.player.z } })), index);
    // 地图开着时跳关键帧：图跟着挪到新站位（比例不变）
    if (this.mapOpen) this.FocusMapOnPlayer();
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
    this.toUnitData = null;
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
    // 「快进 ×n」由导航栏显示（Update 里按 puppets 的计划喂 ui.SetTransition）
    this.lastPlan = { durationS: plan.durationS, playbackRate: plan.playbackRate, wallS: plan.wallS, units: plan.units.length };
    if (!this.puppets.transitioning) { this.unitData = this.toUnitData; this.toUnitData = null; return Promise.resolve(true); }
    return new Promise(resolve => { this.pending = resolve; });
  }

  /** §5.4：当前关键帧的信号视为已发生。集合变了就整份还原一次场景态与门，再刷导航。 */
  ApplySignals(kf) {
    this.previzSignals = null;
    this.previzSignalsKey = "";
    this.ApplySignalSet(new Set(kf.signals || []));
  }

  /** 预演改过的信号（Map name → on；null = 回到关键帧的信号）。 */
  SetPrevizSignals(overrides) {
    const kf = this.keyframe;
    if (!kf) return;
    const key = overrides ? [...overrides].map(([n, on]) => n + ":" + (on ? 1 : 0)).sort().join("|") : "";
    if (key === (this.previzSignalsKey || "")) return;
    this.previzSignalsKey = key;
    this.previzSignals = overrides;
    const next = new Set(kf.signals || []);
    for (const [name, on] of overrides || []) { if (on) next.add(name); else next.delete(name); }
    this.ApplySignalSet(next);
  }

  ApplySignalSet(next) {
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
    // 先按 0.1 m 一圈往外挪（贴墙站的机位只差几厘米，FindFreeSpot 一步就是 0.8 m），找不到再交给它。
    const { freeSpotRadius: radius, freeSpotHeight: height, freeSpotM } = BLOCKOUT_EDITOR;
    if (physics?.Overlaps && physics.Overlaps(x, y + 0.35, z, radius, height)) {
      const near = this.NudgeFree(physics, x, z);
      const free = near || (physics.FindFreeSpot ? physics.FindFreeSpot(x, z, radius, height, freeSpotM) : null);
      if (free) {
        if (free.moved >= 0) { x = free.x; z = free.z; }
        y = free.y;
      }
    }
    player.position.set(x, y, z);
    player.body?.Teleport?.(x, y, z);
    player.yaw = (pose.yawDeg || 0) * DEG;
    player.pitch = (pose.pitchDeg || 0) * DEG;
    player.aimYaw = 0;
    player.aimPitch = 0;
    player.velocity?.set?.(0, 0, 0);
    // 关键帧机位是设计者写死的：姿态直接到位（卧姿的坡度闸在这里不拦；眼高、身宽不再从上一个姿态慢慢收过去，
    // 否则跳关键帧后头几帧镜头还是站着的眼高，关键帧截图就拍成站着的）
    const stance = STANCE[pose.stance] ? pose.stance : "stand";
    if (player.SetStance && !player.SetStance(stance) && player.alive !== false) { player.bipod = false; player.stance = stance; }
    if (player.stance === stance) {
      player.eyeHeight = STANCE[stance].eye;
      player.radius = STANCE[stance].radius;
      if (player.stanceBlend) { player.stanceBlend.crouch = stance === "crouch" ? 1 : 0; player.stanceBlend.prone = stance === "prone" ? 1 : 0; }
    }
    this.posed = player.stance !== "stand" ? { stance: player.stance, x, z } : null;
  }

  /** 关键帧摆的蹲 / 趴，玩家一迈步就站起来；玩家自己按过 C / Z（姿态变了）就不再管。 */
  UpdatePosedStance() {
    const posed = this.posed, player = this.game.player;
    if (!posed || !player) return;
    if (player.stance !== posed.stance) { this.posed = null; return; }
    if (this.previz?.playing) return;
    const { standUpAfterM, standClearFromM, standClearHeightM, freeSpotRadius } = BLOCKOUT_EDITOR;
    const p = player.position;
    if (Math.hypot(p.x - posed.x, p.z - posed.z) < standUpAfterM) return;
    if (player.physics?.Overlaps?.(p.x, p.y + standClearFromM, p.z, freeSpotRadius, standClearHeightM)) return;
    if (player.SetStance?.("stand")) this.posed = null;
  }

  /** 机位埋进墙里时就近挪：0.1 m 一圈、每圈 16 个方向，最多 0.7 m。→ {x,y,z,moved} | null */
  NudgeFree(physics, x, z) {
    const { freeSpotRadius: radius, freeSpotHeight: height } = BLOCKOUT_EDITOR;
    const At = (px, pz) => {
      const ground = this.groundAt(px, pz);
      return physics.GroundProbe ? physics.GroundProbe(px, pz, ground + 0.3, 1.2, 4).y : ground;
    };
    for (let step = 1; step <= 7; step++) {
      const ring = step * 0.1;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const px = x + Math.cos(a) * ring, pz = z + Math.sin(a) * ring, py = At(px, pz);
        if (!physics.Overlaps(px, py + 0.35, pz, radius, height)) return { x: px, y: py, z: pz, moved: ring };
      }
    }
    return null;
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
    // 预演先摆这一帧的演员状态，演员层再按它出姿势；慢动作里演员的动画 dt 跟预演时钟一起缩（TimeScale < 1）
    this.previz.Update(dt);
    this.UpdatePosedStance();
    this.trees.Sync(game.battlefield.layout);
    this.puppets.Update(dt * (this.previz.TimeScale?.() ?? 1), this._cam);
    if (!this.puppets.transitioning && this.toUnitData) { this.unitData = this.toUnitData; this.toUnitData = null; }
    if (this.pending && !this.puppets.transitioning) this.ResolvePending(true);
    this.UpdateTransitionBadge();
    this.UpdateFirstBake();
    this.liveUnits = this.LiveUnits();
    this.markers.SetUnits(this.liveUnits);
    this.markers.Update(dt);
    this.UpdateCard(false);
    this.mapTimer -= dt;
    if (this.mapTimer <= 0) { this.mapTimer = 1 / BLOCKOUT_EDITOR.mapHz; this.PaintMaps(); }
  }

  /** 导航栏的「快进 ×n」（§5.2）：只在过渡状态或倍率变了时碰 DOM。 */
  UpdateTransitionBadge() {
    const active = this.puppets.transitioning;
    const rate = active ? (this.puppets.plan?.playbackRate || 1) : 1;
    const key = active ? `on|${rate.toFixed(2)}` : "off";
    if (key === this.transitionKey) return;
    this.transitionKey = key;
    this.ui.SetTransition?.({ active, rate });
  }

  /** 演员现场位置 + 关键帧数据（标记层与俯视图都读这一份）。 */
  LiveUnits() {
    const out = [];
    for (const live of this.puppets.Live()) {
      const unit = this.unitData.get(live.id);
      if (!unit) continue;
      let arc = null;
      // 倒地的人不画射界（俯视图同样不画）
      if (unit.state !== "down" && this.layers.arcs !== "off" && this.layers.arcs !== false) {
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
    const seq = this.previz?.Sequence(this.index);
    this.ui.SetPreviz?.({ available: !!seq, title: seq?.title || "" });
    this.ui.SetCard({
      stage: kf.stage, stageTitle: kf.stageTitle, stageLabel: kf.stageLabel, name: kf.name, what: kf.what,
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
    this.map.SetLayers({ arcs: this.layers.arcs, intents: this.layers.intents, labels: this.layers.labels });
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
      // 打开时看的是玩家附近，不是全图（全图双击就有）；上次手动调过的比例留着
      this.FocusMapOnPlayer();
    } else if (this.map.view && this.map.viewTouched) {
      this.mapZoom = this.map.view.pxPerM;
    }
    this.mapTimer = 0;
    return this.mapOpen;
  }

  /** Script_Main 问：鼠标现在是不是归编辑器（全关总图开着时游戏不转头、不开枪、不抢锁、滚轮不换枪）。 */
  CapturesMouse() { return this.mapOpen || !!this.previz?.playing; }

  /** Script_Main 问：走动 / 姿态 / 开火的键是不是归编辑器（预演播放中玩家站在原地）。 */
  CapturesInput() { return !!this.previz?.playing; }

  /** Script_Main 在玩家相机写完之后调：预演播放中相机归预演。→ true = 这一帧接管了。 */
  ApplyCamera(camera) { return this.previz?.ApplyCamera(camera) || false; }

  // ---- 预演的界面钩子（Script_EditorBlockoutPreviz 调） ----
  OnPrevizStart(run) {
    this.ToggleMap(false);
    this.markers.SetHidden?.(true);
    this.labelRoot.style.display = "none";
    this.previzProgressKey = "";
    this.ui.SetPrevizPlaying({ active: true, title: run.seq.title || run.seq.keyframe, t: 0, durationS: run.durationS });
  }
  OnPrevizProgress(run) {
    const rate = run.timeScale ?? 1;
    const key = run.t.toFixed(1) + "|" + (run.paused ? 1 : 0) + "|" + rate.toFixed(2);
    if (key === this.previzProgressKey) return;
    this.previzProgressKey = key;
    this.ui.SetPrevizPlaying({ active: true, title: run.seq.title || run.seq.keyframe, t: run.t, durationS: run.durationS, paused: run.paused, rate });
  }
  OnPrevizEnd() {
    this.previzProgressKey = "";
    this.markers.SetHidden?.(false);
    this.labelRoot.style.display = "";
    this.ui.SetPrevizPlaying({ active: false });
    this.UpdateCard(true);
  }
  OnPrevizStatus() { this.UpdateCard(true); }

  /** 全关总图对准玩家当前位置：比例用上次留下的，没有就让短边看到约 MAP_FOCUS_SPAN_M 米。 */
  FocusMapOnPlayer() {
    const p = this.game.player?.position;
    if (!p) { this.map.FitBounds(); return; }
    const canvas = this.ui.fullCanvas;
    const short = Math.min(canvas?.clientWidth || 1000, canvas?.clientHeight || 700);
    const zoom = this.map.viewTouched && this.map.view ? this.map.view.pxPerM
      : (this.mapZoom ?? Math.min(8, Math.max(1.5, short / MAP_FOCUS_SPAN_M)));
    this.map.FocusOn(p.x, p.z, zoom);
  }

  BindKeys() {
    this.onKeyDown = (event) => {
      if (!this.ready || event.repeat) return;
      const target = event.target;
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName || "")) return;
      if (this.host.launcherOpen) return;
      // 预演：N 播 / 中断，Esc 中断；播放中翻关键帧、重播、复制位置、地图的键都不理
      if (event.code === PREVIZ_KEY && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (this.previz.playing || this.previz.Has()) { event.preventDefault(); this.previz.Toggle(); }
        return;
      }
      if (this.previz.playing) {
        if (event.code === "Escape") { event.preventDefault(); this.previz.Stop(); }
        return;
      }
      if (event.code === "Period") { event.preventDefault(); this.Next(); }
      else if (event.code === "Comma") { event.preventDefault(); this.Prev(); }
      else if (event.code === "KeyY") { event.preventDefault(); this.Replay(); }
      else if (event.code === "KeyP" && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); this.CopySnapshot(); }
      else if (event.code === "Escape" && this.mapOpen) { event.preventDefault(); this.ToggleMap(false); }
    };
    document.addEventListener("keydown", this.onKeyDown);
  }

  // 全关总图的鼠标（滚轮缩放、拖动平移、双击看全图、点关键帧）归地图模块（§4.1）：
  // 它在第一次 PaintFull 时挂到 ui.fullCanvas 上，点中关键帧经 blockoutmappick → BlockoutUi → onMapPick 回来。
  // 这里不再挂第二套监听（两套并存时滚轮一格缩放两次）。

  /** 测试用：全关总图的视图（没画过时 null）。 */
  MapView() {
    const view = this.map.view;
    return view ? { cx: view.cx, cz: view.cz, pxPerM: view.pxPerM, open: this.mapOpen, kfIndex: this.map.kfIndex } : null;
  }

  /** 测试用：某个关键帧点在全关总图上的客户区坐标（图没开时 null）。 */
  MapPoint(idOrIndex) {
    const canvas = this.ui.fullCanvas;
    if (!this.mapOpen || !canvas || !this.doc) return null;
    const index = KeyframeIndex(this.doc, idOrIndex);
    if (index < 0) return null;
    const kf = this.doc.keyframes[index], rect = canvas.getBoundingClientRect();
    const p = this.map.WorldToScreen(kf.player.x, kf.player.z);
    return { index, x: rect.left + p.x, y: rect.top + p.y, rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } };
  }

  // -------------------------------------------------------------------------
  // 存档

  /**
   * 「记下当前机位」：把玩家现在的位置 / 朝向 / 姿态写进当前关键帧的 player 并保存。
   * 带上读配置时的版本号（§7）：盘上的文件在这之间被人或 AI 改过，端点回 409，
   * 这里重读一次（玩家不挪）并请用户再记一次。没存成（校验不过、存档口拒绝）就把 player 还原。
   */
  async SavePose() {
    const kf = this.keyframe, player = this.game.player;
    if (!this.rawDoc || !kf || !player) { this.ui.Toast("没有可写的配置（先修好配置文件）", "error"); return { ok: false }; }
    if (this.staleConfig) {
      const reason = `配置文件现在有错，先修好再记机位：${this.configMessage}`;
      this.ui.Toast(reason, "error");
      return { ok: false, reason };
    }
    if (this.saving) return { ok: false, reason: "正在保存上一次的机位" };
    const raw = this.rawDoc.keyframes?.find(item => item?.id === kf.id);
    if (!raw) { this.ui.Toast("配置里找不到这个关键帧", "error"); return { ok: false }; }
    const hadPlayer = Object.prototype.hasOwnProperty.call(raw, "player");
    const before = hadPlayer ? JSON.stringify(raw.player) : null;
    const Restore = () => { if (hadPlayer) raw.player = JSON.parse(before); else delete raw.player; };
    raw.player = {
      ...(raw.player && typeof raw.player === "object" ? raw.player : {}),
      x: Round(player.position.x, 2), z: Round(player.position.z, 2),
      yawDeg: Round(WrapDeg(player.yaw / DEG), 1), pitchDeg: Round(player.pitch / DEG, 1),
      stance: ["stand", "crouch", "prone"].includes(player.stance) ? player.stance : "stand",
    };
    delete raw.player.faceTo;
    const check = ValidateBlockout(this.rawDoc);
    if (!check.ok) {
      Restore();
      this.ui.Toast(`配置有错误，没有保存：${check.errors[0]}`, "error");
      return { ok: false, errors: check.errors };
    }
    this.saving = true;
    this.saveGen += 1;
    const levelKey = this.levelKey, rawDoc = this.rawDoc;
    let result;
    try {
      result = await this.store.Save(levelKey, rawDoc, this.revision);
    } catch (error) {
      result = { ok: false, mode: "server", reason: `保存失败：${error?.message || error}` };
    } finally {
      this.saving = false;
      this.saveGen += 1;
    }
    // 存的途中切了关 / 换了配置：结果只报，不再碰手里的这一份
    if (levelKey !== this.levelKey || rawDoc !== this.rawDoc) return result;
    if (result.ok && result.mode === "server") {
      this.configText = `${JSON.stringify(this.rawDoc, null, 2)}\n`;
      this.revision = result.revision;   // 端点按写下去的字节算的；没给就是不知道，下次保存先重读
      this.writable = true; this.saveReason = "";
      this.ui.Toast("机位已保存", "ok");
    } else if (result.ok && result.mode === "local") {
      // 本地草稿：盘上的文件没变，手里这份带着新机位（草稿里也是它），并给一份下载
      this.writable = false; this.saveReason = result.reason || "";
      this.store.Download(this.levelKey, this.rawDoc);
      this.ui.Toast(`机位存成了本地草稿并下载了配置：${result.reason || ""}`, "warn");
    } else if (result.conflict) {
      Restore();
      const reloaded = await this.Reload({ holdPlayer: true, quiet: true });
      this.ui.Toast(reloaded
        ? "配置文件刚在外面被改过，已经重新读取；人还在原地，请再点一次「记下当前机位」"
        : "配置文件刚在外面被改过，重新读取没成功；等编辑器读到好的配置后再记一次机位", "warn");
      this.PushStatus();
      return result;
    } else {
      Restore();
      this.ui.Toast(result.reason || "保存失败", "error");
      this.PushStatus();
      return result;
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
  // 复制当前位置（§4.2）

  /** 准星正前方打一条射线（连地表）：打到体块 → 体块 id（从本关布局里按中心与尺寸认回来）。 */
  AimHit(eye, dir) {
    const field = this.game.battlefield;
    if (!field?.Raycast) return { kind: "none" };
    let hit = null;
    try { hit = field.Raycast(eye, dir, AIM_RAY_M, { terrain: true }); } catch (error) { hit = null; }
    if (!hit || !(hit.t >= 0)) return { kind: "none" };
    const at = { x: eye.x + dir.x * hit.t, y: eye.y + dir.y * hit.t, z: eye.z + dir.z * hit.t, distM: hit.t };
    const box = hit.box;
    // 地表两种记录：高度场瓦片（terrain: true）与解析地表（Script_Physics 的 TERRAIN_RECORD：tag dirt、没有中心 c）
    if (!box || box.terrain || (box.tag === "dirt" && !Array.isArray(box.c))) return { kind: "ground", ...at };
    const block = this.BlockOfCollider(box);
    return { kind: "block", ...at, id: block?.id || "", semantic: block?.semantic || "", tag: box.tag || "" };
  }

  /** 碰撞盒（c 中心、h 半尺寸）→ 本关布局里的那一块（按 x / z / 宽 / 深认，厘米取整）。 */
  BlockOfCollider(box) {
    const layout = this.game.battlefield?.layout;
    if (!layout?.blocks || !Array.isArray(box?.c) || !Array.isArray(box?.h)) return null;
    const Key = (x, z, w, d) => [x, z, w, d].map(v => Math.round(v * 100)).join("|");
    if (this.blockIndex?.layout !== layout) {
      const map = new Map();
      for (const b of layout.blocks) if (b?.id) map.set(Key(b.x, b.z, b.w, b.d), b);
      this.blockIndex = { layout, map };
    }
    return this.blockIndex.map.get(Key(box.c[0], box.c[2], box.h[0] * 2, box.h[2] * 2)) || null;
  }

  /** 现场 → 快照对象（Script_EditorBlockoutSnapshot.BuildBlockoutSnapshot）。没有玩家时 null。 */
  Snapshot() {
    const player = this.game.player, kf = this.keyframe;
    if (!player || !this.doc) return null;
    const camera = this.host.camera;
    const eye = camera.getWorldPosition(new THREE.Vector3());
    const dir = camera.getWorldDirection(new THREE.Vector3());
    const canvas = this.ui.fullCanvas, view = this.map.view;
    return BuildBlockoutSnapshot({
      level: { key: this.levelKey, label: this.level?.label || this.doc.title || "", configPath: BlockoutConfigPath(this.levelKey) },
      keyframe: kf ? {
        id: kf.id, index: this.index, count: this.doc.keyframes.length, stage: kf.stage, stageTitle: kf.stageTitle,
        name: kf.name, what: kf.what, next: kf.next || null, player: kf.player,
      } : null,
      player: {
        x: player.position.x, y: player.position.y, z: player.position.z, eyeY: eye.y,
        yawDeg: player.yaw / DEG, pitchDeg: player.pitch / DEG, stance: player.stance,
      },
      aim: this.AimHit(eye, dir),
      units: this.liveUnits.filter(u => u.visible !== false),
      pois: kf?.pois || [],
      map: this.mapOpen && view ? { open: true, cx: view.cx, cz: view.cz, spanM: (canvas?.clientWidth || 0) / view.pxPerM } : null,
      url: location.href,
    });
  }

  /** P / 复制按钮：快照文字写进剪贴板；写不进去就弹一个选好文字的框让人按 Ctrl+C。 */
  async CopySnapshot() {
    const snap = this.Snapshot();
    if (!snap) { this.ui.Toast("还没进场景，没有可复制的位置", "error"); return { ok: false, method: null, text: "" }; }
    const text = FormatBlockoutSnapshot(snap);
    this.lastSnapshotText = text;
    const method = await WriteClipboard(text);
    const where = (snap.keyframe?.id ? snap.keyframe.id + "，" : "") + "x " + snap.player.x.toFixed(1) + "  z " + snap.player.z.toFixed(1);
    if (method) {
      this.ui.Toast("已复制当前位置（" + where + "），直接粘贴给 agent", "ok");
    } else {
      this.ReleasePointerLock();
      this.ui.ShowCopyText(text);
      this.ui.Toast("这个窗口不让写剪贴板：文字已经选好，按 Ctrl+C 复制", "warn");
    }
    return { ok: !!method, method, text };
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
      layers: { ...this.layers }, signals: [...(this.signals || [])], syncCount: this.syncCount,
      syncRejected: this.syncRejected, lastSyncMs: this.lastSyncMs, staleConfig: this.staleConfig,
      revision: this.revision ?? null, saving: this.saving,
      lastPlan: this.lastPlan || null, writable: this.writable, previz: !!this.previz?.playing,
    };
  }

  Stats() {
    return {
      puppets: this.puppets.puppets.size, actors: this.puppets.actorCount, warning: this.puppets.warning,
      trees: this.trees.Stats(),
      markers: { ...this.markers.stats },
      fans: this.markers.FanInfo(),
      map: {
        baking: !!this.map.baking, baked: !!this.map.baked, waiting: !!this.bakeWait,
        startedAt: this.bake.startedAt, doneAt: this.bake.doneAt, levelKey: this.bake.levelKey,
        stats: this.map.bakeStats ? { ...this.map.bakeStats } : null,
      },
    };
  }

  Dispose() {
    clearInterval(this.pollTimer);
    clearTimeout(this.syncedTimer);
    document.removeEventListener("keydown", this.onKeyDown);
    this.previz.Dispose();
    this.ResolvePending(false);
    this.puppets.Dispose();
    this.trees.Dispose();
    this.markers.Dispose();
    this.map.Dispose();
    this.ui.Dispose();
    this.root.remove();
  }
}
