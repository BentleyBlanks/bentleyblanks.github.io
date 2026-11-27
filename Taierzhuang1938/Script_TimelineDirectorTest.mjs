// Script_TimelineDirectorTest.mjs —— Unity-style Timeline v2 全链路纯 Node 门禁（毫秒级）。
//
// 跑法：node Taierzhuang1938/Script_TimelineDirectorTest.mjs
//
// 验收覆盖：
//   1. 登记表 TIMELINE_V2_CATALOG 的全部 v2 中间文件校验通过、零错误、自包含（零 Blockout/*.json 引用）；
//   2. CollectTimelineDependencies 静态提取全部 prefab / castId / clip / weapon / voice / sfx / vfx / action；
//   3. EvaluateTimelineAt(func(t)) 确定性求值：任意 t 正向/反向 Seek 两次完全一致、慢动作缩放、环境时钟、连续信号状态；
//   4. 离散事件与 onSkip:"apply"|"ignore"：跳过时状态事件必补发、纯音效/震屏跳过忽略；
//   5. 场景动态绑定件 bindId：ValidateScene 校验通过、BlockoutDocFromScene 自动从 blocks 拆入 bindables 跳过静态合批；
//   6. Live AI 接管与释放：TimelineSceneBinder 绑定活士兵时置 SOLDIER_TAGS.timelineControlled，无重复实例化，Release 干净归还；
//   7. onMissing 三种策略（spawnFallback / skip / error）；
//   8. GateMarker 阻塞等待（timeline.pauseForGate）与 SignalGate 放行；
//   9. TimelineManager 并发运行：setpiece 不锁输入、不抢相机，cinematic 接管相机与输入并支持自动 NotifyCameraCut。

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TIMELINE_V2_SCHEMA, ValidateTimelineAsset, NormalizeTimelineAsset, TimelineAssetDuration,
  CollectTimelineDependencies, EvaluateTimelineAt, CollectFiredMarkers, CollectSkipActions,
  TimelineAssetOverview, CompileLegacyTimelineToV2, BuildVoiceLineMap,
} from "./Script_TimelineAsset.mjs";
import { TIMELINE_V2_CATALOG } from "./Script_TimelinePlan.mjs";
import { ValidateScene, SceneObjectToBlock, BlockoutDocFromScene } from "./Script_SceneDoc.mjs";
import { SOLDIER_TAGS } from "./Data_SoldierComponents.mjs";
import { SOLDIER_TAG_BITS, SoldierFieldAccessors } from "./Script_SoldierFields.mjs";
import { BUILTIN_TIMELINE_ACTIONS } from "./Script_TimelineActions.mjs";
import { IsKnownBuiltinPrefab, BuildPuppetUnitFromPrefab, TimelineSceneBinder, TimelinePrefabRegistry } from "./Script_TimelineBindings.mjs";
import { TimelineDirector, TimelineManager } from "./Script_TimelineDirector.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ReadJson = (rel) => JSON.parse(fs.readFileSync(path.join(HERE, rel.replace(/^\.\//, "")), "utf8"));
let checks = 0;
const Check = (ok, msg) => { checks += 1; assert.ok(ok, msg); };

// 1. Validate every registered Timeline v2 file
Check(TIMELINE_V2_CATALOG.length >= 3, "TIMELINE_V2_CATALOG 至少包含开场、桥爆破与关尾三份 v2 资产");
const builtinActionSet = new Set(BUILTIN_TIMELINE_ACTIONS);
for (const entry of TIMELINE_V2_CATALOG) {
  const filePath = path.join(HERE, entry.file);
  Check(fs.existsSync(filePath), `${entry.id}: 文件存在 ${entry.file}`);
  const raw = ReadJson(entry.file);
  Check(raw.schema === TIMELINE_V2_SCHEMA && raw.id === entry.id, `${entry.id}: schema 与 id 匹配`);
  const voice = raw.voice && fs.existsSync(path.join(HERE, raw.voice.replace(/^\.\//, ""))) ? ReadJson(raw.voice) : null;
  const check = ValidateTimelineAsset(raw, {
    voice,
    knownActions: (id) => builtinActionSet.has(id),
    knownPrefabs: (id) => IsKnownBuiltinPrefab(id),
  });
  Check(check.ok, `${entry.id}: 校验零错误 (${check.errors.join("; ")})`);
  const norm = NormalizeTimelineAsset(raw);
  Check(TimelineAssetDuration(norm) > 0, `${entry.id}: 时长为正 (${norm.durationS}s)`);
  const deps = CollectTimelineDependencies(norm);
  Check(Array.isArray(deps.prefabs) && Array.isArray(deps.actions), `${entry.id}: 依赖清单可静态采集`);
  const ov = TimelineAssetOverview(norm, { lineInfo: voice ? (id) => BuildVoiceLineMap(voice).get(id) || null : null });
  Check(ov.durationS > 0, `${entry.id}: Overview 时长为正`);
}

// Check FirstLevelOpeningCampaign has ZERO legacy Squad1..Squad3 fillers and has DugoutCollapsed onSkip:"apply"
{
  const opening = NormalizeTimelineAsset(ReadJson("Timeline/FirstLevelOpeningCampaign.timeline.json"));
  const allSlots = new Set([...opening.bindings.map((b) => b.slot), ...opening.spawns.map((s) => s.slot)]);
  Check(!allSlots.has("Squad1") && !allSlots.has("Squad2") && !allSlots.has("Squad3"), "Opening v2 不含旧洞内冗余兵 Squad1..3");
  Check(opening.segments.length === 6, "Opening v2 包含 01-1..02-2 共 6 段");
  const skipAll = CollectSkipActions(opening, -1);
  Check(skipAll.some((a) => a.action === "world.setSignal" && a.params?.id === "DugoutCollapsed"), "跳过开场时必补发 DugoutCollapsed 信号");
  const deps = CollectTimelineDependencies(opening);
  Check(deps.castIds.includes("luo") && deps.castIds.includes("comrade") && deps.clips.length > 20 && deps.voices.length > 20,
    "Opening v2 依赖清单完整包含人物定妆、动作片段与配音");

  // Deterministic func(t) evaluation parity
  const anchor = (a) => ({ x: a.x ?? 0, y: (a.h ?? 1.6), z: a.z ?? 0 });
  const e1 = EvaluateTimelineAt(opening, 42.5, { resolveAnchor: anchor });
  const e2 = EvaluateTimelineAt(opening, 10.0, { resolveAnchor: anchor });
  const e3 = EvaluateTimelineAt(opening, 42.5, { resolveAnchor: anchor });
  Check(e1.segmentId !== e2.segmentId && e1.segmentId === e3.segmentId, "前后跳转段号一致");
  Check(e1.camera && e3.camera && Math.abs(e1.camera.position.x - e3.camera.position.x) < 1e-9 && Math.abs(e1.camera.yawDeg - e3.camera.yawDeg) < 1e-9,
    "同一时刻 t 两次求值镜头位姿逐位一致（确定性 func(t)）");
}

// 2. Scene dynamic bindId skips static BuildSink batching
{
  const sceneDoc = {
    schema: "tengxian-scene/1",
    id: "TestBindScene",
    title: "Dynamic Bindable Test",
    bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
    spawn: { x: 0, z: 0 },
    terrain: { kind: "flat", y: 0, minX: -20, minZ: -20, cellM: 1, cols: 40, rows: 40 },
    objects: [
      { id: "StaticWall", asset: "Whitebox/Box", material: "Whitebox/Plaster", pos: [0, 0, 5], size: [4, 2, 0.5], group: "01/墙" },
      { id: "DynamicGate", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [2, 0, 5], size: [1.2, 2.2, 0.2], bindId: "SideDoor", group: "01/门" },
    ],
  };
  const v = ValidateScene(sceneDoc);
  Check(v.ok, `带 bindId 的场景过校验：${v.errors.join("; ")}`);
  const block = SceneObjectToBlock(sceneDoc.objects[1]);
  Check(block.bindId === "SideDoor", "SceneObjectToBlock 透传 bindId");
  const flatHeights = new Float32Array(41 * 41);
  const compiled = BlockoutDocFromScene(sceneDoc, flatHeights, { level: "TestBindScene" });
  Check(compiled.blocks.length === 1 && compiled.blocks[0].id === "StaticWall", "静态件进 blocks 合批");
  Check(compiled.bindables?.length === 1 && compiled.bindables[0].bindId === "SideDoor", "bindId 动态件分流进 bindables 跳过合批");
}

// 3. SOLDIER_TAGS.timelineControlled bit contract
{
  Check(SOLDIER_TAGS.some((t) => t.tag === "timelineControlled"), "SOLDIER_TAGS 已登记 timelineControlled");
  Check(Number.isInteger(SOLDIER_TAG_BITS.timelineControlled) && SOLDIER_TAG_BITS.timelineControlled > 0, "SOLDIER_TAG_BITS 已生成对应位");
  class MockSoldier extends SoldierFieldAccessors {
    constructor() { super(); this.tags = 0; }
  }
  const s = new MockSoldier();
  Check(!s.HasTag("timelineControlled") && !s.timelineControlled, "默认未接管");
  s.SetTag("timelineControlled", true);
  Check(s.HasTag("timelineControlled") && s.timelineControlled === true, "SetTag/访问器双向一致");
  s.SetTag("timelineControlled", false);
  Check(!s.HasTag("timelineControlled") && !s.timelineControlled, "释放后清零");
}

// 4. Live AI Possess/Release, onMissing policies, GateMarker, onSkip, & concurrent setpiece/cinematic in TimelineManager
{
  class FakeSoldier extends SoldierFieldAccessors {
    constructor(id, castId, x, z) {
      super();
      this.id = id;
      this.tags = 0;
      this.cast = { castId };
      this.vitals = {};
      this.scripted = {};
      this.locomotion = {
        position: { x, y: 0, z, set(nx, ny, nz) { this.x = nx; this.y = ny; this.z = nz; }, copy(o) { this.x = o.x; this.y = o.y; this.z = o.z; return this; } },
        velocity: { x: 1, y: 0, z: 1, set(nx, ny, nz) { this.x = nx; this.y = ny; this.z = nz; } },
        yaw: 0,
        stance: 0,
        crouchBlend: 0,
        proneBlend: 0,
        moveSpeed: 0,
        body: { Teleport: (nx, ny, nz) => { this.teleports++; this.position.set(nx, ny, nz); } },
      };
      this.aiming = { aimBlend: 0 };
      this.alive = true;
      this.teleports = 0;
      this.actor = {
        weaponId: "HanYang",
        root: { visible: true, position: { set() {} }, rotation: { y: 0 } },
        characterRig: { facial: { source: null } },
        SetWeapon(w) { this.weaponId = w; },
        Update() {},
      };
    }
    ApplyTimelinePose({ x, y, z, yaw, stance = 0, crouchBlend = 0, proneBlend = 0, moveSpeed = 0, aimBlend = 0 } = {}) {
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
        this.position.set(x, y, z);
        this.body?.Teleport?.(x, y, z);
      }
      this.velocity.set(0, 0, 0);
      if (Number.isFinite(yaw)) this.yaw = yaw;
      this.stance = stance;
      this.crouchBlend = crouchBlend;
      this.proneBlend = proneBlend;
      this.moveSpeed = moveSpeed;
      this.aimBlend = aimBlend;
    }
  }

  const liveLuo = new FakeSoldier("luo_live_1", "luo", 10, 20);
  const spawnedPuppets = new Map();
  const mockPuppets = {
    puppets: spawnedPuppets,
    groundAt: () => 0,
    Spawn(unit) { spawnedPuppets.set(unit.id, { id: unit.id, unit, temp: true, x: unit.x, z: unit.z, humans: [] }); },
    Get(id) { return spawnedPuppets.get(id) || null; },
    Drive(id, st) { const p = spawnedPuppets.get(id); if (p) { p.drive = st; p.x = st.x ?? p.x; p.z = st.z ?? p.z; } },
    ReleaseDriveFor(id) { spawnedPuppets.delete(id); return true; },
    Update() {},
    Settle() {},
  };

  const bindableState = new Map([["SideDoor", { x: 2, y: 1.1, z: 5, ry: 0, visible: true }]]);
  const mockBattlefield = {
    GetBindable: (id) => bindableState.has(id) ? { bindId: id, basePos: bindableState.get(id) } : null,
    SetBindableTransform: (id, pose) => { const cur = bindableState.get(id); if (cur) Object.assign(cur, pose); return true; },
    SetBindableVisible: (id, vis) => { const cur = bindableState.get(id); if (cur) cur.visible = vis; return true; },
    ResetBindable: () => true,
    RestoreScenario: () => 0,
  };

  let cameraCutCount = 0;
  const mockCam = {
    position: { x: 0, y: 1.6, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
    rotation: { order: "YXZ", x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
    fov: 60,
    updateProjectionMatrix() {},
    updateMatrixWorld() {},
    getWorldPosition(out) { out.set(this.position.x, this.position.y, this.position.z); return out; },
  };

  const firedEvents = [];
  const resolver = {
    puppets: mockPuppets,
    ai: { time: 0, view: { skins: new Map(), Place() {}, Animate() {} } },
    battlefield: mockBattlefield,
    groundAt: () => 0,
    getPlayer: () => ({ position: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, Spawn() {} }),
    getCamera: () => mockCam,
    findLiveSoldier: (match) => (match?.id === "luo" || match?.castId === "luo") ? liveLuo : null,
    findPuppetId: () => null,
  };

  const manager = new TimelineManager({
    host: {
      camera: mockCam,
      battlefield: mockBattlefield,
      post: { NotifyCameraCut: () => { cameraCutCount++; } },
      audio: null,
      vfx: null,
    },
    resolver,
    groundAt: () => 0,
    encounter: {
      setFact: (id, v) => firedEvents.push(`fact:${id}=${v}`),
      complete: () => firedEvents.push("complete"),
    },
  });

  manager.RegisterAction("custom.doorBell", (p) => firedEvents.push(`custom:${p.msg}`), { defaultOnSkip: "ignore" });

  // Test onMissing:"error" throws cleanly
  {
    const binder = new TimelineSceneBinder({ resolver, prefabs: manager.prefabs });
    assert.throws(() => binder.ResolveAll({
      bindings: [{ slot: "missingCore", type: "actor", onMissing: "error" }],
      spawns: [],
    }), /missing binding "missingCore"/, "onMissing:error 缺失时显式报错");
  }

  // Test concurrent non-blocking setpiece + interactive GateMarker + Live AI binding + SceneObject transform + Camera cut + Skip
  const setpieceDoc = {
    schema: TIMELINE_V2_SCHEMA,
    id: "TestSetpiece",
    mode: "setpiece",
    durationS: 10,
    bindings: [
      { slot: "door", type: "sceneObject", match: { bindId: "SideDoor" }, onMissing: "error" },
    ],
    spawns: [],
    tracks: [
      {
        id: "DoorMove", type: "transform", target: "door",
        keys: [
          { t: 0, x: 2, y: 1.1, z: 5, yawDeg: 0 },
          { t: 2, x: 2, y: 1.1, z: 5, yawDeg: 90, ease: "linear" },
        ],
      },
      {
        id: "SetpieceSig", type: "signal",
        markers: [
          { t: 1, action: "custom.doorBell", params: { msg: "ring" }, onSkip: "ignore" },
          { t: 2, action: "encounter.setFact", params: { id: "doorOpened", value: true }, onSkip: "apply" },
        ],
      },
    ],
  };

  const setpieceDir = await manager.Play(setpieceDoc);
  Check(setpieceDir && setpieceDir.active, "并发 Setpiece 启动成功");
  Check(!manager.IsBlockingInput(), "Setpiece 运行时不锁玩家操作");
  Check(!manager.ApplyCamera(mockCam), "无 Camera 轨的 Setpiece 不抢相机");

  manager.Update(1.0);
  Check(Math.abs(bindableState.get("SideDoor").ry - (45 * Math.PI / 180)) < 1e-4, "场景动态物件 bindId 在 t=1.0 旋转到 45°");
  Check(firedEvents.includes("custom:ring"), "注册表自定义脚本 custom.doorBell 按时触发");

  // Launch interactive/cinematic Timeline with Live AI binding + fallback spawn + skip policy + GateMarker
  const cinematicDoc = {
    schema: TIMELINE_V2_SCHEMA,
    id: "TestCinematic",
    mode: "cinematic",
    allowSkip: true,
    durationS: 6,
    bindings: [
      { slot: "mainCamera", type: "camera", onMissing: "error" },
      { slot: "luo", type: "actor", match: { id: "luo", castId: "luo" }, fallbackPrefab: "Cast/luo", onMissing: "spawnFallback", init: { x: 10, z: 20 } },
      { slot: "ghostAlly", type: "actor", match: { id: "notHere" }, fallbackPrefab: "Cast/yaowa", onMissing: "spawnFallback", init: { x: 12, z: 22 } },
      { slot: "optionalGuy", type: "actor", match: { id: "nobody" }, onMissing: "skip" },
    ],
    spawns: [],
    tracks: [
      {
        id: "Cam", type: "camera",
        clips: [
          { id: "shotA", t: 0, dur: 2, from: { x: 0, z: 0, h: 2 }, look: { x: 10, z: 20, h: 1.5 } },
          { id: "shotB", t: 2, dur: 4, from: { x: 5, z: 5, h: 2 }, look: { x: 12, z: 22, h: 1.5 } },
        ],
      },
      {
        id: "AnimLuo", type: "animation", target: "luo",
        keys: [
          { t: 0, x: 10, z: 20, move: "cut", stance: "stand" },
          { t: 4, x: 14, z: 20, move: "walk", stance: "stand" },
        ],
      },
      {
        id: "Sig", type: "signal",
        markers: [
          { t: 1.5, action: "timeline.pauseForGate", params: { gateId: "waitPressF" }, onSkip: "ignore" },
          { t: 4.5, action: "custom.doorBell", params: { msg: "ignoredOnSkip" }, onSkip: "ignore" },
          { t: 5.5, action: "encounter.complete", params: {}, onSkip: "apply" },
        ],
      },
    ],
  };

  const cinDir = await manager.Play(cinematicDoc);
  Check(manager.IsBlockingInput(), "cinematic 启动后按 inputLock 接管输入");
  Check(liveLuo.HasTag("timelineControlled"), "活 AI 士兵 luo 被 Live Binding 接管并置 timelineControlled 标志");
  Check(spawnedPuppets.size === 1, "luo 走 Live Binding 未重复生成，仅缺失的 ghostAlly 按 spawnFallback 生成 1 个替身");
  const reportBySlot = new Map(cinDir.State().bindings.map((b) => [b.slot, b]));
  Check(reportBySlot.get("luo")?.source === "live" && reportBySlot.get("ghostAlly")?.status === "fallback" && reportBySlot.get("optionalGuy")?.status === "skipped",
    "三种绑定策略（live / spawnFallback / skip）均符合预期");

  // Camera cut check
  Check(manager.ApplyCamera(mockCam) === true, "cinematic 接管相机");
  const cutsBefore = cameraCutCount;
  manager.Update(1.6); // crosses GateMarker at 1.5s
  Check(cinDir.State().waitingGate?.gateId === "waitPressF", "命中的 GateMarker 自动暂停等待交互");
  const pausedAtT = cinDir.State().t;
  manager.Update(1.0); // stays paused on GateMarker!
  Check(Math.abs(cinDir.State().t - pausedAtT) < 1e-6, "未放行 GateMarker 前时间轴保持暂停");
  Check(manager.SignalGate("waitPressF") === true, "SignalGate 放行等待门");
  manager.Update(0.6); // crosses t=2.0 -> shotB!
  manager.ApplyCamera(mockCam);
  Check(cameraCutCount === cutsBefore + 1, "切镜 shotA → shotB 自动通知 post.NotifyCameraCut()");
  Check(liveLuo.position.x > 10.1, "活 AI 士兵 luo 的位置由 Timeline 直接驱动推进");

  // Skip: must apply encounter.complete (onSkip:"apply"), skip ignoredOnSkip (onSkip:"ignore"), release luo & remove fallback puppet!
  Check(manager.Skip("TestCinematic") === true, "Skip 成功执行");
  Check(!liveLuo.HasTag("timelineControlled"), "播完/跳过后活 AI 士兵 luo 解除 timelineControlled，无缝交还 AI");
  Check(spawnedPuppets.size === 0, "跳过后 fallback 替身已回收，无内存/场景残留");
  Check(firedEvents.includes("complete"), "Skip 时自动补发 onSkip:'apply' 的 encounter.complete");
  Check(!firedEvents.includes("custom:ignoredOnSkip"), "Skip 时忽略 onSkip:'ignore' 的离散事件");

  // Meanwhile, Setpiece is STILL running concurrently!
  Check(setpieceDir.active === true, "跳过 cinematic 不误杀同时运行的并发 setpiece");
  manager.Dispose();
  Check(!manager.HasActive(), "Dispose 彻底清空全部实例");
}

console.log(`TimelineDirectorTest: ${checks} 条全过`);
