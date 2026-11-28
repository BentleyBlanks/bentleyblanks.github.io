// 遭遇设计多关卡与分段变体门禁：验证注册表、01–07 编排零重复共用、z<355 场景北段继承无缝拼接、
// 同场景 overrides 变体、独立草稿存储、08–13 单村合并版全链路 Play 过关与敌军遮挡生成规范。

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import { SCENE_IDS, ValidateScene, DecodeSceneHeights, BlockoutDocFromScene } from "./Script_SceneDoc.mjs";
import { SceneSurfaceSampler } from "./Script_SceneSurface.mjs";
import { TRAVERSAL } from "./Data_Traversal.mjs";
import { CompileSceneAirWalls, SceneAirWallObjects } from "./Script_SceneAirWalls.mjs";
import { ValidateBlockoutScene } from "./Script_EditorBlockoutConfig.mjs";
import { DecodeTrenchDatum, PrepareSceneTerrain, GridSampler } from "./Script_SceneTrenches.mjs";
import { ResolveInheritedScene, FetchResolvedScene } from "./Script_SceneInherit.mjs";
import {
  ENCOUNTER_DEFAULT_VARIANT_ID, ENCOUNTER_LEVELS, ENCOUNTER_VARIANTS, GetEncounterVariantSpec, CompileEncounterVariant,
} from "./Script_EncounterVariants.mjs";
import { EncounterPlayPlan, EncounterCanPlay, EncounterSceneSignals } from "./Script_EncounterPlayPlan.mjs";
import { EncounterDialogueLines } from "./Script_EncounterPlayDialogue.mjs";
import { EncounterDocument } from "./AdvancedTools/Script_LevelFlowDocument.mjs";
import { CompileEncounters, GroupPath } from "./Scenes/FirstLevelEncounter/Script_LevelFlowEncounter.mjs";
import { BuildEncounterMap } from "./AdvancedTools/Script_LevelFlowMap.mjs";
import { FlowPerspectiveView } from "./AdvancedTools/Script_LevelFlowPerspective.mjs";

const threeVendorUrl = new URL("./vendor/three/build/three.module.js", import.meta.url).href;
const threeHooks = registerHooks({
  resolve(id, context, next) {
    if (id === "three") return { url: threeVendorUrl, shortCircuit: true };
    return next(id, context);
  },
});
const { AiDirector } = await import("./Script_Ai.mjs");
const { EncounterArtilleryRuntime } = await import("./Script_EncounterArtilleryRuntime.mjs");
const { CombatSystem } = await import("./Script_Combat.mjs");
const THREE = await import("three");
threeHooks.deregister();

const dirHere = path.dirname(fileURLToPath(import.meta.url));

function ReadSceneFromDisk(id) {
  const sceneDir = path.join(dirHere, "Scenes", id);
  const doc = JSON.parse(fs.readFileSync(path.join(sceneDir, `Scene_${id}.json`), "utf8"));
  const heights = DecodeSceneHeights(fs.readFileSync(path.join(sceneDir, doc.terrain.file)), doc.terrain);
  const datum = doc.trenches?.datum?.file
    ? DecodeTrenchDatum(doc.trenches.datum, fs.readFileSync(path.join(sceneDir, doc.trenches.datum.file)))
    : [];
  return { doc, heights, datum };
}

function RayHitsOrientedBox(from, to, obj, groundAt) {
  if (!obj.pos || !obj.size || obj.solid === false || obj.layer === "backdrop" || obj.tag === "airWall") return false;
  if (obj.showOn) return false;
  const [cx, rawY, cz] = obj.pos, [w, h, d] = obj.size;
  const y0 = rawY === null ? groundAt(cx, cz) : rawY;
  const y1 = y0 + h;
  const rad = (obj.yawDeg || 0) * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const Local = ([x, y, z]) => {
    const dx = x - cx, dz = z - cz;
    return [dx * cos - dz * sin, y, dx * sin + dz * cos];
  };
  const a = Local(from), b = Local(to);
  const dVec = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const bounds = [[-w / 2, w / 2], [y0, y1], [-d / 2, d / 2]];
  let tMin = 0.02, tMax = 0.98;
  for (let axis = 0; axis < 3; axis++) {
    const [lo, hi] = bounds[axis];
    if (Math.abs(dVec[axis]) < 1e-8) {
      if (a[axis] < lo || a[axis] > hi) return false;
    } else {
      let t1 = (lo - a[axis]) / dVec[axis], t2 = (hi - a[axis]) / dVec[axis];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return false;
    }
  }
  return true;
}

function SegmentOccluded(fromXZ, toXZ, groundAt, solidObjects) {
  const from = [fromXZ[0], groundAt(fromXZ[0], fromXZ[1]) + 1.6, fromXZ[1]];
  const to = [toXZ[0], groundAt(toXZ[0], toXZ[1]) + 1.5, toXZ[1]];
  const dist = Math.hypot(to[0] - from[0], to[2] - from[2]);
  const steps = Math.max(8, Math.ceil(dist / 0.75));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = from[0] + (to[0] - from[0]) * t;
    const y = from[1] + (to[1] - from[1]) * t;
    const z = from[2] + (to[2] - from[2]) * t;
    if (groundAt(x, z) > y + 0.05) return { occluded: true, by: "terrain" };
  }
  for (const obj of solidObjects) {
    if (RayHitsOrientedBox(from, to, obj, groundAt)) return { occluded: true, by: obj.id };
  }
  return { occluded: false, by: null };
}

// 1. 注册表契约：关卡预留 + 两个初始变体（基线双村版 + 北沙河单村合并版）
assert.ok(ENCOUNTER_LEVELS.some((l) => l.id === "L1" && l.available === true), "第一关已开放选关");
assert.ok(ENCOUNTER_LEVELS.some((l) => l.id === "L2" && l.available === false), "第二关预留选关槽位");
assert.equal(ENCOUNTER_DEFAULT_VARIANT_ID, "L1_BeishaheMerged", "遭遇编辑器默认启动为北沙河单村合并版");
assert.equal(CompileEncounterVariant().id, "L1_BeishaheMerged", "未指定变体时默认编译北沙河单村合并版");
assert.equal(ENCOUNTER_VARIANTS.length, 2, "初始 UI 仅展示基线与单村合并两个变体");
assert.deepEqual(ENCOUNTER_VARIANTS.map((v) => v.id), ["L1_Original", "L1_BeishaheMerged"]);
for (const spec of ENCOUNTER_VARIANTS) {
  assert.ok(SCENE_IDS.includes(spec.scene), `变体 ${spec.id} 绑定的场景 ${spec.scene} 已在 SCENE_LIST 注册`);
}
assert.notEqual(ENCOUNTER_VARIANTS[0].storageKey, ENCOUNTER_VARIANTS[1].storageKey, "不同变体草稿存储键彼此隔离");

const original = CompileEncounterVariant("L1_Original");
const merged = CompileEncounterVariant("L1_BeishaheMerged");
assert.equal(original.duration, 3249, "基线双村版全程保持 54:09 不变");
assert.equal(merged.duration, 1926, "单村合并百户大村版全程 32:06（1926s）");

// 2. 01–07 共用段编排 100% 零分叉一致
const frontBeats = original.timeline.filter((b) => Number(b.stage) <= 7);
assert.equal(frontBeats.length, merged.timeline.filter((b) => Number(b.stage) <= 7).length, "01–07 节拍数一致");
for (const beat of frontBeats) {
  const mBeat = merged.BeatById(beat.id);
  assert.ok(mBeat, `合并版包含共用拍 ${beat.id}`);
  assert.equal(mBeat.start, beat.start, `${beat.id} 起始秒数一致`);
  assert.equal(mBeat.duration, beat.duration, `${beat.id} 时长一致`);
  for (const ratio of [0.05, 0.5, 0.95]) {
    const t = beat.start + beat.duration * ratio;
    const fOrig = original.evaluate(t);
    const fMerged = merged.evaluate(t);
    assert.deepEqual(fMerged.player, fOrig.player, `${beat.id}@${ratio} 玩家位置一致`);
    assert.deepEqual(
      fMerged.actors.map((a) => [a.id, a.p, a.pose, a.side]),
      fOrig.actors.map((a) => [a.id, a.p, a.pose, a.side]),
      `${beat.id}@${ratio} 单位状态一致`,
    );
    assert.deepEqual(fMerged.dialogue, fOrig.dialogue, `${beat.id}@${ratio} 对白一致`);
  }
}

// 3. 场景北段继承（FirstLevelMerged 继承 FirstLevelEncounter z<355）无缝缝合校验
const baseDisk = ReadSceneFromDisk("FirstLevelEncounter");
const mergedDisk = ReadSceneFromDisk("FirstLevelMerged");
assert.deepEqual(mergedDisk.doc.inherit, { scene: "FirstLevelEncounter", maxZ: 355 });
assert.equal(mergedDisk.doc.terrain.minZ, 355, "FirstLevelMerged 自身只存 z>=355 南段高度图");
const resolved = ResolveInheritedScene(mergedDisk.doc, mergedDisk.heights, mergedDisk.datum, baseDisk);
assert.equal(resolved.doc.inherit, undefined, "合成后的运行时场景不再残留 inherit 字段");
const validResolved = ValidateScene(resolved.doc);
assert.ok(validResolved.ok, `合成场景通过 ValidateScene：${validResolved.errors.join("；")}`);
assert.equal(resolved.doc.bounds.minZ, -480);
assert.equal(resolved.doc.bounds.maxZ, 990);

const fetchedViaUrl = await FetchResolvedScene(
  "http://localhost/Taierzhuang1938/Scenes/FirstLevelMerged/Scene_FirstLevelMerged.json",
  {
    fetchFn: async (reqUrl) => {
      const u = new URL(reqUrl, "http://localhost/Taierzhuang1938/index.html");
      const rel = u.pathname.replace(/^\/Taierzhuang1938\//, "");
      const full = path.join(dirHere, rel);
      if (!fs.existsSync(full)) return { ok: false, status: 404 };
      const buf = fs.readFileSync(full);
      return {
        ok: true,
        status: 200,
        json: async () => JSON.parse(buf.toString("utf8")),
        arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      };
    },
  },
);
assert.equal(fetchedViaUrl.doc.bounds.minZ, -480);
assert.equal(fetchedViaUrl.doc.bounds.maxZ, 990);
assert.ok(fetchedViaUrl.heightBytes.byteLength > 1_000_000, "FetchResolvedScene 解析正确相对路径并输出完整二进制字节");

const width = resolved.doc.terrain.cols + 1;
const splitRow = Math.round((355 - (-480)) / 0.5);
for (let row = 0; row <= splitRow; row += 17) {
  for (let col = 0; col < width; col += 29) {
    const idx = row * width + col;
    assert.equal(resolved.heights[idx], baseDisk.heights[idx], `北段及 z=355 切口格点 (${row},${col}) 高度零误差`);
  }
}
for (let col = 0; col < width; col++) {
  const idx = splitRow * width + col;
  assert.equal(resolved.heights[idx], baseDisk.heights[idx], `切口行 z=355 第 ${col} 列高度零台阶`);
}
const expectedNorthObjects = baseDisk.doc.objects.filter((o) => !o.pos || o.pos[2] < 355).length;
const actualNorthObjects = resolved.doc.objects.filter((o) => !o.pos || o.pos[2] < 355).length;
assert.equal(actualNorthObjects, expectedNorthObjects, "北段继承物件数量与基线 100% 一致");
assert.ok(resolved.doc.objects.some((o) => o.id === "DugoutRoofTimber" && o.pos[2] < 355), "合成场景包含北段继承物件");
assert.ok(resolved.doc.objects.some((o) => o.id === "MA3_SideGate_Door" && o.hideOn === "SideGateOpen"), "合成场景包含西巷老耿家夹壁便门");
for (const landmarkId of ["Merged_House_TempleHall_Roof", "Merged_RoadShrineRoof", "Merged_WatchTower", "Merged_BigLocust", "Merged_MillStone"]) {
  assert.ok(resolved.doc.objects.some((o) => o.id === landmarkId), `合成场景包含鲁南特色建筑地标 ${landmarkId}`);
}
// 验证村落建筑多样性改造与 1938.3.14 鲁南田野真实构筑、桥圈六区地标、时代红线纠偏与无重叠多角度条田
assert.ok(resolved.doc.objects.some((o) => o.id.endsWith("_ThatchCrown")), "村落包含陡坡草顶土坯农舍");
assert.ok(resolved.doc.objects.some((o) => o.id.endsWith("_Ridge") || o.id.endsWith("_HighRidge")), "村落包含双坡灰瓦高脊院落");
assert.ok(resolved.doc.objects.some((o) => o.id.endsWith("_Chimney")), "村落包含砖砌灶台烟囱");
assert.ok(resolved.doc.objects.some((o) => o.id.endsWith("_Pigsty_W")), "鲁南院落包含连茅圈猪厕生活细节");
assert.ok(resolved.doc.objects.some((o) => o.id.endsWith("_ShopAwning")), "官道沿街包含挑檐铺面/大车店");
assert.ok(resolved.doc.objects.some((o) => o.id === "Church_Spire_2"), "圣言会德国教堂具备陡坡礼拜堂与尖顶钟楼");
assert.ok(resolved.doc.objects.some((o) => o.id === "Pond_Mid_Water"), "村心保留真实取土坑塘打破僵硬网格");
assert.ok(resolved.doc.objects.some((o) => o.id.startsWith("Merged_Rick_")), "外围田野包含残半冬麦秸垛");
assert.ok(resolved.doc.objects.some((o) => o.id.startsWith("Merged_Mound_")), "外围田野包含鲁南田间坟头与孤树");
assert.ok(resolved.doc.objects.some((o) => o.id.startsWith("Merged_FieldTree_")), "外围田野包含地头枯榆与沟边旱柳");
// 时代红线与历史 Bug 纠偏：禁止 3 月看青棚与浮空假墙，火线改接桥南西侧
assert.ok(!resolved.doc.objects.some((o) => o.id.startsWith("Merged_Hut_")), "3 月 14 日农田严禁残留七八月看青草棚");
assert.ok(!resolved.doc.objects.some((o) => o.id === "Encounter_BeishaheBridgeRushScreen"), "浮空遮挡假墙已由德式砖石巡道房取代");
for (const reqId of [
  "RailSec_Body", "RailSemaphore_Mast", "RailAbutN_WingW", "RailPier_1_Cutwater", "RailRefuge_W_Deck",
  "Detonation_ExploderBox", "WoundedAlcove_WallW", "SouthEast_DugoutRoof", "SouthHam_1_House1_Body",
  "Merged_Well_ChurchGarden_Fulcrum", "Merged_Grove_BridgeWest_Stele", "Merged_Kiln_East_Dome1",
  "Merged_Kiln_NorthBank_Dome1", "Merged_FieldShrine_West_BrickSeal", "Merged_DitchBridge_WestMid_Slab",
  "Merged_Manure_1_1B", "Merged_StoneWall_1",
]) {
  assert.ok(resolved.doc.objects.some((o) => o.id === reqId), `合成场景包含桥圈六区/三月农田核心构筑 ${reqId}`);
}
const railFuseBridge = resolved.doc.objects.find((o) => o.id === "RailFuse_Bridge");
const railFuseBank = resolved.doc.objects.find((o) => o.id === "RailFuse_Bank");
assert.ok(railFuseBridge && railFuseBridge.pos[0] < -80.5, "起爆引线沿西侧钢梁布置");
assert.ok(railFuseBank && railFuseBank.pos[0] < -81.0, "桥南起爆引线已修正接入桥西工兵与起爆所，不再错拉向桥东");
for (const walkId of ["RailWalk_S1", "RailWalk_S2"]) {
  const walkObj = resolved.doc.objects.find((o) => o.id === walkId);
  assert.equal(walkObj?.hideOn, "BridgeBlown", `${walkId} 在 BridgeBlown 炸毁后同步隐藏，避免桥面悬空穿帮`);
}
// 校验先期轰炸弹坑残垣、烟柱特效与玩家动线收束空气墙走廊
assert.ok(resolved.doc.objects.some((o) => o.id.startsWith("BombCrater_")), "村内及村北具备先期轰炸弹坑与碎砖残垣");
assert.ok((resolved.doc.smokeColumns?.length || 0) >= 6, `场景配置 >=6 处先期轰炸烟柱与阴燃火光，实测：${resolved.doc.smokeColumns?.length || 0}`);
// 校验北沙河村半环形多向野战防线（东西翼折回战壕、联络壕、纵深折线铁丝网、侧翼机枪窝与二营/三营守备兵力）
const segIds = new Set((resolved.doc.trenches?.segments || []).map((s) => s.id));
for (const reqSeg of ["VillageNorthWest", "VillageNorthEast", "VillageWestFlankN", "VillageWestFlankS", "VillageEastFlankN", "VillageEastFlankS", "VillageSouthEastGuard", "VillageCommW", "VillageCommE"]) {
  assert.ok(segIds.has(reqSeg), `北沙河村环形防御包含战壕段 ${reqSeg}`);
}
for (const reqDef of ["BshWireOuterW_01", "BshWireOuterE_01", "BshWireNE_01", "BshWireEastN_01", "BshWireWestN_01", "BshFlankMgE_Front", "BshFlankMgW_Front", "RoadMouth_HedgehogW", "FelledStump_1"]) {
  assert.ok(resolved.doc.objects.some((o) => o.id === reqDef), `北沙河防线包含纵深障碍/侧翼工事 ${reqDef}`);
}
const f08cDef = merged.evaluate(merged.BeatById("08c").start + 30);
for (const defId of ["bn2_mgWest", "bn2_mgEast", "bn2_westFlank", "bn2_eastFlank1", "bn2_reserve1", "bn2_seGuard"]) {
  assert.ok(f08cDef.actors.some((a) => a.id === defId && a.side === "friend"), `08c 北沙河全向防线部署二营守备兵力 ${defId}`);
}
const f13cDef = merged.evaluate(merged.BeatById("13c").start + 10);
assert.ok(f13cDef.actors.some((a) => a.id === "bn3_mgEast" && a.side === "friend"), "13c 桥南阵地部署三营东翼掩护机枪组");
assert.ok(Array.isArray(baseDisk.doc.airWalls) && baseDisk.doc.airWalls.length >= 17,
  `FirstLevelEncounter 的 01–05 沟沿空气墙已迁移为样条 airWalls（实测 ${baseDisk.doc.airWalls?.length || 0} 条）`);
assert.ok(!baseDisk.doc.objects.some((o) => o.tag === "airWall"), "FirstLevelEncounter.objects 不再保留手摆碎块空气墙");
assert.ok(Array.isArray(mergedDisk.doc.airWalls) && mergedDisk.doc.airWalls.length >= 10,
  `FirstLevelMerged 的 08–13 空气墙与门禁已迁移为样条 airWalls（实测 ${mergedDisk.doc.airWalls?.length || 0} 条）`);
assert.ok(!mergedDisk.doc.objects.some((o) => o.tag === "airWall"), "FirstLevelMerged.objects 不再保留手摆碎块空气墙");
assert.equal(
  resolved.doc.airWalls?.length,
  baseDisk.doc.airWalls.filter((w) => w.points.every((p) => p[1] < 355)).length + mergedDisk.doc.airWalls.length,
  "北段继承正确合并基线 z<355 与合并版南段的 airWalls 样条",
);
const resolvedAirWalls = SceneAirWallObjects(resolved.doc);
const mergedKeepIn = resolvedAirWalls.filter((o) => o.id.startsWith("Merged_KeepIn_"));
assert.ok(mergedKeepIn.length >= 25, `08–13 可玩走廊配置完整玩家专用空气墙收束（实测 ${mergedKeepIn.length} 段）`);
for (const aw of mergedKeepIn) {
  assert.equal(aw.tag, "airWall");
  assert.equal(aw.material, "Whitebox/AirWall");
  assert.equal(aw.visual, false);
}
const mergedStageGates = resolvedAirWalls.filter((o) => o.id.startsWith("Merged_StageGate_"));
assert.ok(mergedStageGates.length >= 7, `08–13 配置阶段动态空气墙门禁以防止跨阶段自由乱逛（实测 ${mergedStageGates.length} 段）`);
for (const gate of mergedStageGates) {
  assert.equal(gate.tag, "airWall", `阶段空气墙 ${gate.id} 必须使用 tag="airWall"`);
  assert.equal(gate.material, "Whitebox/AirWall", `阶段空气墙 ${gate.id} 必须使用 Whitebox/AirWall`);
  assert.equal(gate.visual, false, `阶段空气墙 ${gate.id} 必须 visual=false（游戏内不可见）`);
  assert.equal(gate.noClimb, true, `阶段空气墙 ${gate.id} 必须禁止翻越`);
  assert.ok(gate.hideOn || gate.showOn, `阶段空气墙 ${gate.id} 必须绑定 hideOn 或 showOn 信号`);
}
const mergedBlocks = resolved.doc.objects.filter((o) => o.id.startsWith("Merged_Block_"));
assert.ok(mergedBlocks.length >= 200, `08–13 沟口两翼、北田路标与村落外缘配置可见白盒路障/倒塌残墙（实测 ${mergedBlocks.length} 块）`);
for (const blk of mergedBlocks) {
  assert.equal(blk.noClimb, true, `动线封堵路障 ${blk.id} 必须禁止翻越`);
  assert.notEqual(blk.visual, false, `动线封堵路障 ${blk.id} 为可见实体白盒`);
  assert.ok(!blk.meta?.planning && blk.material !== "Whitebox/Cover", `动线封堵路障 ${blk.id} 不得混标为战术掩体`);
}
// 确保 08a–13e 玩家主线每一步都不撞到任何 KeepIn 或当拍生效中的 StageGate 空气墙
const keepInCheckGround = () => 0;
const stageGateActive = (gate, signals) => !(gate.hideOn && signals.includes(gate.hideOn)) && !(gate.showOn && !signals.includes(gate.showOn));
for (const beat of merged.timeline.filter((b) => Number(b.stage) >= 8)) {
  const activeSignals = merged.evaluate(beat.start + 0.01, merged.defaultDocument).signals || [];
  const activeAirWalls = [...mergedKeepIn, ...mergedStageGates.filter((g) => stageGateActive(g, activeSignals))];
  for (let i = 1; i < beat.p.length; i++) {
    const a = [beat.p[i - 1][0], 1.0, beat.p[i - 1][1]];
    const b = [beat.p[i][0], 1.0, beat.p[i][1]];
    for (const aw of activeAirWalls) {
      const boxObj = { ...aw, tag: undefined, showOn: undefined };
      assert.ok(!RayHitsOrientedBox(a, b, boxObj, keepInCheckGround), `玩家主线 ${beat.id} 不得被生效中的空气墙 ${aw.id} 阻断`);
    }
  }
}
// 核对 7 道阶段空气墙在对应信号前/后的真实阻断与放行语义，以及 Blockout 转换后保留不可见空气墙属性
const stageGateChecks = [
  { id: "Merged_StageGate_NorthVillageEntry", from: [106, 488], to: [106, 502], lockedBeat: "08c", openBeat: "09a" },
  { id: "Merged_StageGate_PlankBridgeCut", from: [106, 480], to: [106, 470], lockedBeat: "09a", openBeat: "08c" },
  { id: "Merged_StageGate_MidStPreFlank", from: [120, 559], to: [128, 559], lockedBeat: "09b", openBeat: "10a" },
  { id: "Merged_StageGate_GengFrontGate", from: [131.5, 560], to: [131.5, 565], lockedBeat: "09d", openBeat: "10a" },
  { id: "Merged_StageGate_PreShelterExit", from: [118, 746], to: [118, 753], lockedBeat: "10b", openBeat: "11c" },
  { id: "Merged_StageGate_SouthLeveeHold", from: [-80, 890], to: [-80, 900], lockedBeat: "13b", openBeat: "13e" },
  { id: "Merged_StageGate_BridgeSpanCut", from: [-80, 860], to: [-80, 845], lockedBeat: "13e", openBeat: "13b" },
];
for (const chk of stageGateChecks) {
  const gate = mergedStageGates.find((g) => g.id === chk.id);
  assert.ok(gate, `缺少阶段门禁空气墙 ${chk.id}`);
  const lockedSigs = merged.evaluate(merged.BeatById(chk.lockedBeat).start + 0.01, merged.defaultDocument).signals || [];
  const openSigs = merged.evaluate(merged.BeatById(chk.openBeat).start + 0.01, merged.defaultDocument).signals || [];
  assert.ok(stageGateActive(gate, lockedSigs), `${chk.id} 在 ${chk.lockedBeat} 应处于关闭封堵状态`);
  assert.ok(!stageGateActive(gate, openSigs), `${chk.id} 在 ${chk.openBeat} 应处于放行状态`);
  assert.ok(RayHitsOrientedBox([chk.from[0], 1, chk.from[1]], [chk.to[0], 1, chk.to[1]], { ...gate, tag: undefined, showOn: undefined }, keepInCheckGround),
    `${chk.id} 的包围盒须实际拦截越界路径 ${JSON.stringify(chk.from)}->${JSON.stringify(chk.to)}`);
}
// 核对 08 沟北开阔麦田：外推空气墙不再在平地 x=82 / x=120 卡住玩家，且完整包住东翼日军火力组与西侧绕行空间；
// 局部可见物理路障（Merged_Block_NorthField*）示意战场外沿形状且不阻断玩家或敌军行动路线。
{
  const openFieldFlankChecks = [
    { label: "官道西侧绕行", from: [100, 428], to: [66, 422] },
    { label: "官道直扑东翼 MergedRifles 阵地", from: [100, 428], to: [134, 412] },
    { label: "东翼外侧绕后包抄", from: [134, 412], to: [152, 415] },
    { label: "MergedRifles 出生点至前沿掩体", from: [134, 390], to: [130, 437.3] },
  ];
  for (const probe of openFieldFlankChecks) {
    const a = [probe.from[0], 1.0, probe.from[1]];
    const b = [probe.to[0], 1.0, probe.to[1]];
    for (const aw of mergedKeepIn) {
      assert.ok(!RayHitsOrientedBox(a, b, { ...aw, tag: undefined, showOn: undefined }, keepInCheckGround),
        `08 沟北 ${probe.label} 不得被平地空气墙 ${aw.id} 阻断`);
    }
  }
  const northFieldMarkers = mergedBlocks.filter((o) => o.id.startsWith("Merged_Block_NorthField"));
  assert.ok(northFieldMarkers.length >= 8, `08 沟北东西外沿配置局部可见物理路障示意形状（实测 ${northFieldMarkers.length} 块）`);
  for (const wire of resolved.doc.objects.filter((o) => /^BshWireOuter[WE]_\d+$/.test(o.id))) {
    assert.equal(wire.noClimb, true, `外圈铁丝网 ${wire.id} 禁止翻越`);
  }
}
const mergedBlockout = BlockoutDocFromScene(resolved.doc, resolved.heights, { level: "FirstLevelMerged" });
for (const gate of mergedStageGates) {
  const bg = (mergedBlockout.gates || []).find((g) => g.id === gate.id);
  assert.ok(bg, `BlockoutDocFromScene 须导出动态空气墙 ${gate.id}`);
  assert.equal(bg.visual, false, `Blockout gate ${gate.id} 保留 visual=false`);
  assert.equal(bg.tag, "airWall", `Blockout gate ${gate.id} 保留 tag=airWall`);
  assert.equal(bg.noClimb, true, `Blockout gate ${gate.id} 保留 noClimb=true`);
}
const villagePaint = resolved.doc.paint.find((p) => p.id === "Village");
assert.equal(villagePaint?.color, "#c6b99c", "村庄地基色保持鲁南夯实黄土");
assert.ok(!resolved.doc.paint.some((p) => /^Wheat_/.test(p.id || "") && p.z >= 355), "合并村外围不再残留突兀绿方块麦田矩形");

const mergedMap = BuildEncounterMap(resolved.doc, { sceneId: "FirstLevelMerged", variantSpec: GetEncounterVariantSpec("L1_BeishaheMerged") });
assert.deepEqual(mergedMap.bounds, [-160, 320, -480, 990]);
assert.ok(Array.isArray(mergedMap.airWalls) && mergedMap.airWalls.length >= mergedKeepIn.length + mergedStageGates.length,
  `Encounter 地图导出全部空气墙供 2D/3D 预览（实测 ${mergedMap.airWalls?.length || 0}）`);
assert.ok(mergedKeepIn.every((aw) => mergedMap.airWalls.some((entry) => entry.id === aw.id)), "所有静态走廊空气墙进入 map.airWalls");
assert.ok(mergedStageGates.every((g) => mergedMap.airWalls.some((entry) => entry.id === g.id)), "所有阶段门禁空气墙进入 map.airWalls");
assert.ok(!mergedMap.objects.some((o) => o.tag === "airWall"), "空气墙不混入常规 2D/3D 实体物件数组");
const s2Yards = new Set(resolved.doc.objects.filter((o) => /^S2_[A-Za-z0-9]+_[A-Za-z0-9]+_/.test(o.id)).map((o) => o.id.match(/^(S2_[A-Za-z0-9]+_[A-Za-z0-9]+)_/)[1]));
assert.ok(s2Yards.size >= 30, `S2 有机重构包含至少 30 座鲁南分型宗族院落/商铺，实测：${s2Yards.size}`);
assert.ok(!resolved.doc.objects.some((o) => /^Exp_[WE]\d/.test(o.id)), "已撤除超标 2.4 倍的东西方盒外扩翼");
const lmVillage = resolved.doc.markers.find((m) => m.id === "LmVillage");
assert.ok(lmVillage && lmVillage.w >= 165 && lmVillage.w <= 195 && lmVillage.d >= 250, `北沙河村回归 1938 年 500 余口史料尺度（实测 ${lmVillage?.w}×${lmVillage?.d}m）`);

const mergedOnlyFields = mergedMap.fields.filter((f) => f.zone.startsWith("Merged"));
assert.ok(mergedOnlyFields.length >= 60, `合并村外围具备多角度细碎鲁南条田（实测 ${mergedOnlyFields.length} 块）`);
const fieldAngles = new Set(mergedOnlyFields.map((f) => f.angleDeg));
assert.ok(fieldAngles.size >= 4, `鲁南条田包含 >=4 种片区垄向倾角以破除 0° 方格表（实测：${[...fieldAngles].join(",")}）`);
// 校验同片区旋转局部坐标下绝对零重叠
const fieldsByZone = new Map();
for (const f of mergedOnlyFields) {
  if (!fieldsByZone.has(f.zone)) fieldsByZone.set(f.zone, []);
  fieldsByZone.get(f.zone).push(f);
}
for (const [zoneId, list] of fieldsByZone) {
  const rad = (list[0].angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      assert.equal(a.angleDeg, b.angleDeg, `同片区 ${zoneId} 内条田保持一致垄向避免交叉堆叠`);
      const dx = b.x - a.x, dz = b.z - a.z;
      const du = Math.abs(dx * cos - dz * sin), dv = Math.abs(dx * sin + dz * cos);
      assert.ok(!(du < (a.w + b.w) / 2 - 0.1 && dv < (a.d + b.d) / 2 - 0.1), `同片区 ${zoneId} 条田 (${i},${j}) 严禁互相重叠`);
    }
  }
}
// 校验各 Merged* 农田裁剪片区彼此不重叠（跨片区零像素堆叠）
const mergedZones = mergedMap.fieldZones.filter((z) => z.id.startsWith("Merged"));
const SegsIntersect = (a, b, c, d) => {
  const Cross = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const c1 = Cross(a, b, c), c2 = Cross(a, b, d), c3 = Cross(c, d, a), c4 = Cross(c, d, b);
  return ((c1 > 1e-6 && c2 < -1e-6) || (c1 < -1e-6 && c2 > 1e-6)) && ((c3 > 1e-6 && c4 < -1e-6) || (c3 < -1e-6 && c4 > 1e-6));
};
for (let i = 0; i < mergedZones.length; i++) {
  const pA = mergedZones[i].poly;
  for (let j = i + 1; j < mergedZones.length; j++) {
    const pB = mergedZones[j].poly;
    for (let ea = 0; ea < pA.length; ea++) {
      const a1 = pA[ea], a2 = pA[(ea + 1) % pA.length];
      for (let eb = 0; eb < pB.length; eb++) {
        const b1 = pB[eb], b2 = pB[(eb + 1) % pB.length];
        assert.ok(!SegsIntersect(a1, a2, b1, b2), `农田片区 ${mergedZones[i].id} 与 ${mergedZones[j].id} 边界相交`);
      }
    }
  }
}
for (const expectedLabel of ["防炮洞", "小土地庙", "土炮楼", "关帝庙（兼村塾）", "大槐树", "石碾", "老耿家（中街西头）", "夹壁便门", "德式巡道房", "桥南小庄", "村东砖窑"]) {
  assert.ok(mergedMap.labels.some((l) => l.name === expectedLabel), `合并版底图包含地标：${expectedLabel}`);
}
assert.ok(!mergedMap.labels.some((l) => l.name === "西巷" && l.p[0] < 50), "不再残留错位漂在村外的西巷标注");

// 4. 同场景遭遇微调变体（spec.overrides）支持验证
const customOverrideVariant = CompileEncounterVariant({
  ...GetEncounterVariantSpec("L1_Original"),
  id: "L1_TestOverride",
  overrides: {
    groups: { RearPursuit: { count: 7 } },
    triggers: { Trigger_RearPursuit: { delay: 2.5 } },
  },
});
assert.equal(customOverrideVariant.defaultDocument.groups.find((g) => g.id === "RearPursuit").count, 7);
assert.equal(customOverrideVariant.defaultDocument.triggers.find((t) => t.id === "Trigger_RearPursuit").delay, 2.5);
assert.notEqual(original.defaultDocument.groups.find((g) => g.id === "RearPursuit").count, 7, "overrides 不污染基线默认文档");

// 5. 各变体草稿存储键严格隔离
const fakeStore = new Map();
const mockStorage = {
  getItem: (k) => fakeStore.get(k) ?? null,
  setItem: (k, v) => { fakeStore.set(k, v); },
};
const docOrig = new EncounterDocument(original.defaultDocument, original.timeline, mockStorage, {
  storageKey: original.spec.storageKey, legacyStorageKey: null,
});
const docMerged = new EncounterDocument(merged.defaultDocument, merged.timeline, mockStorage, {
  storageKey: merged.spec.storageKey, legacyStorageKey: null,
});
docMerged.Change((d) => { d.groups.find((g) => g.id === "MergedBoards").count = 6; });
assert.equal(JSON.parse(fakeStore.get(merged.spec.storageKey)).groups.find((g) => g.id === "MergedBoards").count, 6);
assert.equal(fakeStore.get(original.spec.storageKey), undefined, "修改合并版草稿不写入基线存储键");
assert.equal(docOrig.value.groups[0].count, original.defaultDocument.groups[0].count);

const oldDraft = structuredClone(docMerged.value);
oldDraft.revision = "2026-11-22-beishahe-merged-1";
const oldSearch = oldDraft.groups.find(group => group.id === "MergedWestSearch");
delete oldSearch.memberPlans;
oldSearch.beat = "09a";
oldSearch.endBeat = "09b";
oldSearch.area = { shape: "rect", center: [68, 516], size: [0.9, 0.9] };
oldSearch.route = [[68, 516], [80, 516], [84, 516], [76, 516], [68, 516]];
oldSearch.lifetime = 14;
const oldSearchTrigger = oldDraft.triggers.find(trigger => trigger.id === oldSearch.triggerId);
oldSearchTrigger.beat = "09a";
oldSearchTrigger.endBeat = "09b";
oldSearchTrigger.delay = 34;
oldDraft.groups = oldDraft.groups.filter(g => !["MergedMainStFlank", "MergedYardAtrocity", "MergedYardStraggler"].includes(g.id));
oldDraft.triggers = oldDraft.triggers.filter(t => !["Trigger_MergedMainStFlank", "Trigger_MergedYardAtrocity", "Trigger_MergedYardStraggler"].includes(t.id));
const ReloadMerged = (draft = oldDraft) => {
  fakeStore.set(merged.spec.storageKey, JSON.stringify(draft));
  return new EncounterDocument(merged.defaultDocument, merged.timeline, mockStorage, {
    storageKey: merged.spec.storageKey, legacyStorageKey: null,
  }).value;
};
const upgradedDraft = ReloadMerged();
assert.equal(upgradedDraft.revision, merged.defaultDocument.revision);
assert.deepEqual(upgradedDraft.groups.find(group => group.id === oldSearch.id),
  merged.defaultDocument.groups.find(group => group.id === oldSearch.id));
const upgradedSearchTrigger = upgradedDraft.triggers.find(trigger => trigger.id === oldSearch.triggerId);
assert.equal(upgradedSearchTrigger.beat, "08d");
assert.equal(upgradedSearchTrigger.delay, 31);
assert.ok(["MergedMainStFlank", "MergedYardAtrocity", "MergedYardStraggler"].every(id => upgradedDraft.groups.some(g => g.id === id)),
  "旧草稿自动补齐东翼掩护、街坊院暴行与邻院落单兵三组");
assert.equal(upgradedDraft.groups.find(group => group.id === "MergedBoards").count, 6);

// 同样兼容从 2026-11-25-west-search-cover-1 升级到方案 A
const codexDraft = structuredClone(oldDraft);
codexDraft.revision = "2026-11-25-west-search-cover-1";
const codexSearch = codexDraft.groups.find(group => group.id === "MergedWestSearch");
codexSearch.area.center = [67.75, 499.2];
codexSearch.route = [[67.75, 499.2], [67.03, 510.2], [66.65, 516], [75, 516], [84, 516], [75, 516], [66, 516], [67.03, 510.2], [67.75, 499.2]];
codexDraft.triggers.find(trigger => trigger.id === codexSearch.triggerId).delay = 30;
const upgradedFromCodex = ReloadMerged(codexDraft);
assert.deepEqual(upgradedFromCodex.groups.find(group => group.id === "MergedWestSearch"),
  merged.defaultDocument.groups.find(group => group.id === "MergedWestSearch"));

oldSearch.route[1] = [79, 516];
oldSearchTrigger.delay = 35;
const customizedDraft = ReloadMerged();
assert.deepEqual(customizedDraft.groups.find(group => group.id === oldSearch.id), oldSearch);
assert.deepEqual(customizedDraft.triggers.find(trigger => trigger.id === oldSearchTrigger.id), oldSearchTrigger);

const prevBoardsDraft = structuredClone(merged.defaultDocument);
prevBoardsDraft.revision = "2026-11-26-east-flank-plan-a-1";
const prevBoards = prevBoardsDraft.groups.find(group => group.id === "MergedBoards");
prevBoards.endBeat = "08d";
prevBoards.lifetime = 54;
prevBoards.lastFall = 62;
const prevBoardsTrigger = prevBoardsDraft.triggers.find(trigger => trigger.id === prevBoards.triggerId);
prevBoardsTrigger.endBeat = "08d";
fakeStore.set(merged.spec.storageKey, JSON.stringify(prevBoardsDraft));
const upgradedBoardsDraft = new EncounterDocument(merged.defaultDocument, merged.timeline, mockStorage, {
  storageKey: merged.spec.storageKey, legacyStorageKey: null,
}).value;
assert.equal(upgradedBoardsDraft.revision, merged.defaultDocument.revision);
assert.equal(upgradedBoardsDraft.groups.find(group => group.id === "MergedBoards").endBeat, "08c");
assert.equal(upgradedBoardsDraft.groups.find(group => group.id === "MergedBoards").lifetime, 48);
assert.equal(upgradedBoardsDraft.triggers.find(trigger => trigger.id === prevBoards.triggerId).endBeat, "08c");

// 08d 撤桥起手与撤桥转 09a 瞬间不得在沟口脸上残留或补刷 MergedBoards / MergedRifles
const plan08d = new EncounterPlayPlan(merged.defaultDocument, merged.BeatById("08d").start, merged);
assert.equal(
  plan08d.initial.filter((a) => a.groupId === "MergedBoards").length,
  0,
  "08d 以清完垫沟兵为前提，起手不应在沟口近距刷出存活的 MergedBoards",
);
const alive08d = new Set(plan08d.initial.map((a) => a.id));
plan08d.Interact();
plan08d.Step(0.016, merged.BeatById("08d").p.at(-1), alive08d);
assert.equal(plan08d.beat.id, "09a", "08d 撤桥交互后立即转入 09a");
const transitionSpawns = plan08d.Spawns(alive08d).filter((a) => ["MergedBoards", "MergedRifles"].includes(a.groupId));
assert.equal(transitionSpawns.length, 0, "08d 撤桥转入 09a 瞬间不得补刷已结束的沟口敌军");

// 6. 单村合并版 08–13 单向动线、完整敌军渗入路径与全链路 Play 过关验证
const f08d = merged.evaluate(merged.BeatById("08d").start + 28);
assert.ok(f08d.dialogue.some((d) => d.actorId === "liu" && d.text.includes("关帝庙")), "08d 顺视线转向关帝庙绕后");
const f09b = merged.evaluate(merged.BeatById("09b").start + 26);
assert.ok(f09b.stealth.noFire, "09b 处于关帝庙西巷禁火潜行态");
const b09a = merged.BeatById("09a");
assert.ok(b09a.p[0][1] < f09b.stealth.armMinZ && b09a.p.at(-1)[1] >= f09b.stealth.armMinZ, "09a 从沟口前线出发时禁火未生效，进村后才生效");
for (const id of ["09b", "09c"]) assert.ok(merged.BeatById(id).p.every((p) => p[1] >= f09b.stealth.armMinZ), `${id} 全程处于禁火区`);
assert.ok(f09b.dialogue.some((d) => d.actorId === "player" && d.text.includes("老子是救你")), "09b 包含妮儿咬手误解冲突");
// 验证妮儿方案B因果闭环：08b 老耿埋半路拿干粮伏笔 → 08c 妮儿半路拐进老耿家灶屋后被东翼日军逼退西巷 → 09a→09b 平滑碰头（零提前干等与瞬移）→ 09b/09d 对白说破并闭环
const f08bPlanB = merged.evaluate(merged.BeatById("08b").start + 20);
assert.ok(f08bPlanB.dialogue.some((d) => d.actorId === "geng" && d.text.includes("干粮")), "08b 老耿提前交代妮儿半路拐回中街家拿干粮");
const n08cKitchen = merged.evaluate(merged.BeatById("08c").start + 22).actors.find((a) => a.id === "nier");
assert.ok(n08cKitchen && Math.hypot(n08cKitchen.p[0] - 127.5, n08cKitchen.p[1] - 568.2) < 1.0, "08c 妮儿实际半路拐回老耿家西厢灶屋");
const n09aWait = merged.evaluate(merged.BeatById("09a").start + 25).actors.find((a) => a.id === "nier");
assert.ok(n09aWait && n09aWait.p[1] > 545, "09a 中段妮儿尚未提前在庙南门外干等");
const n09aEnd = merged.evaluate(merged.BeatById("09a").end - 0.1).actors.find((a) => a.id === "nier");
const n09bStart = merged.evaluate(merged.BeatById("09b").start + 0.1).actors.find((a) => a.id === "nier");
assert.ok(Math.hypot(n09bStart.p[0] - n09aEnd.p[0], n09bStart.p[1] - n09aEnd.p[1]) < 0.8, "09a→09b 切拍妮儿走位连续无瞬移");
const f09bExplain = merged.evaluate(merged.BeatById("09b").start + 14);
assert.ok(f09bExplain.dialogue.some((d) => d.actorId === "liu" && d.text.includes("拿干粮")), "09b 刘文财明确点破妮儿拐回家拿干粮撞见鬼子才躲进西巷");
const f09dPayoff = merged.evaluate(merged.BeatById("09d").start + 26);
assert.ok(f09dPayoff.dialogue.some((d) => d.actorId === "liu" && d.text.includes("干粮包袱")), "09d 清灶屋后收回妮儿干粮包袱形成闭环");
const f10b = merged.evaluate(merged.BeatById("10b").start + 10);
assert.ok(f10b.dialogue.some((d) => d.actorId === "batman" && d.text.includes("营长的箱子")), "10b 包含营部勤务兵抢车位冲突");
const f10c = merged.evaluate(merged.BeatById("10c").start + 18);
assert.ok(f10c.signals.includes("RaidAftermath") && f10c.signals.includes("AidCartBurned"), "10c 处于空袭单向突围信号态");
const f13d = merged.evaluate(merged.BeatById("13d").start + 15);
assert.ok(f13d.signals.includes("BridgeBlown"), "13d 后半拍触发炸毁铁路桥高潮信号");

// 验证老耿家日军真实沿东翼侧包行进到位（behavior=flank 且 08c 末进入老耿家），且直跳 09d Play 时自动落位屋中
const houseGun = merged.defaultDocument.groups.find((g) => g.id === "MergedHouseGun");
const kitchenGuard = merged.defaultDocument.groups.find((g) => g.id === "MergedKitchenGuard");
assert.equal(houseGun.behavior, "flank", "老耿家封街机枪组以专业侧包行为沿中街东段实际行进");
assert.equal(kitchenGuard.behavior, "flank", "老耿家灶屋警戒兵随东翼侧包实际行进");
assert.ok(houseGun.route.length >= 6 && houseGun.route[0][0] > 200, "老耿家封街机枪组具备村东沿中街完整渗入路径");
assert.ok(kitchenGuard.route.length >= 6 && kitchenGuard.route[0][0] > 200, "老耿家灶屋守卫具备村东沿中街完整渗入路径");
const f08cEnd = merged.evaluate(merged.BeatById("08c").end - 1);
assert.ok(f08cEnd.actors.some((a) => a.groupId === "MergedHouseGun" && a.p[0] < 135 && a.p[1] > 570), "东翼侧包机枪组在 08c 末实际渗入老耿家正房");
assert.ok(f08cEnd.actors.some((a) => a.groupId === "MergedKitchenGuard" && a.p[0] < 130 && a.p[1] > 565), "东翼侧包灶屋警戒兵在 08c 末实际渗入西厢灶屋");
const latePlan09d = new EncounterPlayPlan(merged.defaultDocument, merged.BeatById("09d").start, merged);
latePlan09d.Step(0.2, latePlan09d.beat.p[0], new Set());
const lateSpawns09d = latePlan09d.Spawns(new Set());
const lateGunSpawn = lateSpawns09d.find((s) => s.groupId === "MergedHouseGun");
assert.ok(lateGunSpawn && lateGunSpawn.p[0] < 140 && lateGunSpawn.p[1] > 570, "直跳 09d Play 时老耿家机枪组直接就位正房室内");

// 验证编辑器 3D 视口气泡不半透明遮挡，第一人称 eye 视角仍尊重遮挡
const fakeViewScene = { type: "scene", freeCamera: false, ActorLabelOpacity: () => 0.22 };
const fakeViewChase = { type: "chase", freeCamera: false, ActorLabelOpacity: () => 0.22 };
const fakeViewEye = { type: "eye", freeCamera: false, ActorLabelOpacity: () => 0 };
assert.equal(FlowPerspectiveView.prototype.SpeechOpacity.call(fakeViewScene, {}), 1, "3D 场景编辑器视口气泡保持 100% 不透明");
assert.equal(FlowPerspectiveView.prototype.SpeechOpacity.call(fakeViewChase, {}), 1, "3D 追随视口气泡保持 100% 不透明");
assert.equal(FlowPerspectiveView.prototype.SpeechOpacity.call(fakeViewEye, {}), 0, "第一人称视角气泡仍遵守建筑遮挡");

// 验证 2D/3D 视口在关闭「生成」图层时，开启「路线」仍独立绘制敌军来源与推进路线
const viewSource = fs.readFileSync(path.join(dirHere, "AdvancedTools", "Script_LevelFlowView.mjs"), "utf8");
assert.ok(!/if\s*\(\s*layers\.spawns\s*\)\s*for\s*\(\s*const\s+group\s+of\s+frame\.groups/.test(viewSource),
  "Script_LevelFlowView 须将路线图层与生成区图层解耦，关闭「生成」也能看到敌军路线");

// 验证所有 08–13 可玩节点都有在场的指令发言人
for (const beat of merged.timeline.filter((b) => Number(b.stage) >= 8 && EncounterCanPlay(b.start, merged))) {
  const bPlan = new EncounterPlayPlan(merged.defaultDocument, beat.start, merged);
  const bLines = EncounterDialogueLines(bPlan, bPlan.Frame(), { interact: true });
  assert.ok(bLines.some((l) => l.order && l.actorId), `${beat.id} 指令引导存在在场发言人`);
}

const plan = new EncounterPlayPlan(merged.defaultDocument, merged.BeatById("08a").start, merged);
assert.equal(plan.State().variant, "L1_BeishaheMerged");
assert.equal(plan.State().scene, "FirstLevelMerged");
assert.equal(plan.beat.id, "08a");

const lines10b = EncounterDialogueLines(
  new EncounterPlayPlan(merged.defaultDocument, merged.BeatById("10b").start, merged),
  merged.evaluate(merged.BeatById("10b").start + 2),
  { interact: true },
);
assert.ok(lines10b.some((l) => l.order && l.text.includes("推开勤务兵")), "EncounterDialogueLines 读取变体专属指令引导");

let safety = 0;
while (!plan.completed && safety++ < 200) {
  assert.ok(EncounterCanPlay(plan.beat.start, merged), `当前可玩拍合法：${plan.beat.id}`);
  const gate = plan.gate;
  const target = gate.area || gate.action ? plan.Area().center : plan.beat.p.at(-1);
  plan.Step(0.5, target, new Set());
  if (gate.action && plan.CanInteract(target)) {
    plan.Interact();
    for (const sig of gate.signals || []) {
      assert.ok(EncounterSceneSignals(plan.Frame(), plan.facts, merged).has(sig), `${plan.beat.id} 交互写入信号 ${sig}`);
    }
  }
  for (const groupId of gate.clear || []) {
    for (let step = 0; step < 30; step++) {
      const spawns = plan.Spawns(new Set());
      for (const s of spawns) {
        plan.Spawned(s);
        plan.Kill(s.id);
      }
      plan.Step(1.0, target, new Set());
      if (plan.beat.id !== merged.timeline[plan.beatIndex]?.id) break;
    }
  }
  plan.Step(0.5, target, new Set());
}
assert.ok(plan.completed, `单村合并版 08a→13d 全可玩节点顺畅通关，已完成：${plan.completedBeats.join(",")}`);
assert.ok(!plan.completedBeats.includes("13e"), "结尾过场动画拍 13e 自动跳过");
assert.ok(plan.completedBeats.includes("13d"), "终局高潮 13d 实玩完成");

// 7. 敌军生成默认避开玩家视线（AGENTS.md 2026-11-14 规范校验）与实机白盒场景切片校验
const { heights: carvedHeights, plan: carvedPlan } = PrepareSceneTerrain(resolved.doc, resolved.heights, null);
const sliceDoc = BlockoutDocFromScene(resolved.doc, carvedHeights, {
  level: "FirstLevelEncounter",
  region: { minX: -160, maxX: 320, minZ: -480, maxZ: 990 },
  priorSignals: ["Stage0105Done"],
  trenchPlan: carvedPlan,
});
const sliceCheck = ValidateBlockoutScene(sliceDoc);
assert.ok(sliceCheck.ok, `合成场景转实机 Blockout 切片通过校验：${sliceCheck.errors.join("；")}`);
const coverBlocks = sliceDoc.blocks.filter((b) => b.id?.startsWith("Merged_Cover_") && b.cover);
assert.equal(coverBlocks.length, 15, "全部 15 处战术掩体块携带显式 cover 法线进入实机 CoverRegistry");
for (const b of coverBlocks) {
  assert.ok(b.d <= 0.55, `掩体 ${b.id} 厚度 ${b.d}m 超过 0.55m，会令 standoffM(0.65)-半厚 < hitSlackM(0.30) 导致射线校验失败`);
  assert.ok((b.cover.points?.length || 0) >= 2, `双人掩体 ${b.id} 须登记 >=2 个隐蔽点供两两跃进小组同掩体躲藏`);
}

// 验证时间轴预览中敌军具备真实缩头/探头（kneel/shoot）掩体节奏，且 DirectActor 放行实机自动寻掩体与被压制躲掩体
const riflesPoses = new Set();
for (let dt = 12; dt < 52; dt += 1.0) {
  const fr = merged.evaluate(merged.BeatById("08c").start + dt);
  for (const a of fr.actors) if (a.groupId === "MergedRifles" && a.pose !== "dead") riflesPoses.add(a.pose);
}
assert.ok(riflesPoses.has("kneel") && riflesPoses.has("shoot") && riflesPoses.has("run"),
  `08c 沟北日军须同时呈现掩体缩头(kneel)、探头射击(shoot)与掩体跃进(run)，实测：${[...riflesPoses].join(",")}`);

// 验证 AiDirector.DirectActor 在 allowCover=true 时不把正在躲掩体的敌军强掰回站姿，并开放 coverSlackM 与接敌/受压制自由找掩体
const mockAi = {
  ctx: { battlefield: { GroundHeight: () => 0 } },
  stanceCalls: 0,
  SetStance(s, stance) { this.stanceCalls++; s.stance = stance; },
};
const holdEnemy = { alive: true, position: { x: 130, z: 437 }, goal: { set() {} }, stance: 1, suppression: 0 };
AiDirector.prototype.DirectActor.call(mockAi, holdEnemy, {
  x: 130, z: 437, yaw: 0, stance: null, combat: true, moving: false, allowCover: true, coverSlackM: 8.5, suppressible: true,
});
assert.equal(holdEnemy.scriptDefensive, true);
assert.equal(holdEnemy.scriptCoverSlackM, 8.5, "守点与跃进停顿敌军放开 8.5m 掩体搜寻余量");
assert.equal(holdEnemy.scriptSuppressible, true, "战斗敌军允许受压制缩头/卧倒");
assert.equal(mockAi.stanceCalls, 0, "allowCover 守点时不强行覆写 AI 蹲/卧掩体姿态");
assert.equal(holdEnemy.stance, 1);

const inContactRunner = { alive: true, position: { x: 108, z: 433 }, goal: { set() {} }, stance: 1, suppression: 0, target: { id: 1 } };
AiDirector.prototype.DirectActor.call(mockAi, inContactRunner, {
  x: 100, z: 466, yaw: 0, stance: 0, combat: true, moving: true, allowCover: true, coverSlackM: 8.5, suppressible: true,
});
assert.equal(inContactRunner.p012Guided, false, "行进中敌军一旦接敌或受压制立即解除死板直线引导，交还给 AiDirector/TacticsDirector 自主寻掩体与掩护跃进");
assert.equal(inContactRunner.scriptDefensive, false);
assert.equal(inContactRunner.order, "advance");
assert.equal(mockAi.stanceCalls, 0, "接敌推进时不强掰站姿");

const approachRunner = { alive: true, position: { x: 205, z: 571 }, goal: { set() {} }, stance: 0, suppression: 0, target: null };
AiDirector.prototype.DirectActor.call(mockAi, approachRunner, {
  x: 182, z: 552, yaw: 0, stance: 0, combat: true, moving: true, allowCover: true, coverSlackM: 8.5, suppressible: true,
});
assert.equal(approachRunner.p012Guided, true, "尚未接敌且未受压制的绕后部队沿设定路线静音到位");
const groundAt = GridSampler(resolved.doc.terrain, carvedHeights);
const solidObjects = resolved.doc.objects.filter((o) =>
  o.pos && o.size && o.solid !== false && o.layer !== "backdrop" && o.tag !== "airWall" && !o.showOn);

const mergedEnemyGroups = merged.defaultDocument.groups.filter((g) => g.side === "enemy" && g.id.startsWith("Merged"));
assert.equal(mergedEnemyGroups.length, 11, "检查全部 11 组新增合并版敌军波次（含东翼掩护、街坊院暴行、邻院落单兵）");
for (const group of mergedEnemyGroups) {
  const beat = merged.BeatById(group.beat);
  const playerAtEntry = beat.p[0];
  const check = SegmentOccluded(playerAtEntry, group.area.center, groundAt, solidObjects);
  assert.ok(
    check.occluded,
    `敌军波次 ${group.id}（${group.beat}）在玩家进拍点 [${playerAtEntry}] 处未遮挡！生成中心 [${group.area.center}]`,
  );
}

// 方案 A：北街搜兵由东翼突破口分流沿东胡同北上再自东向西扫街，出生遮挡、全程无穿墙净空、炸雷后向东回援老耿家且不原地倒死。
const compiledMerged = CompileEncounters(merged.defaultDocument, merged.timeline);
const westSearch = compiledMerged.groups.find(group => group.id === "MergedWestSearch");
const atrocityGroup = compiledMerged.groups.find(group => group.id === "MergedYardAtrocity");
const Eyes = (xz, eyeHeight) => [xz[0], groundAt(...xz) + eyeHeight, xz[1]];
const searchWalls = solidObjects.filter(({ pos: [x, , z] }) => x >= 55 && x <= 265 && z >= 494 && z <= 585);
const observationPoints = [merged.BeatById("08d").p[0], merged.evaluate(1283.36).player, merged.evaluate(1287.17).player];
for (let elapsed = 0; elapsed <= b09a.duration; elapsed += 2) {
  observationPoints.push(merged.evaluate(b09a.start + elapsed).player);
}
for (const [index, { born }] of westSearch.lives.entries()) {
  const preview = merged.evaluate(born).actors.find(actor => actor.id === `MergedWestSearch_${index}`);
  const route = GroupPath(westSearch, index);
  assert.ok(route[0][0] > 200, `方案 A 搜兵 ${index + 1} 须从东翼突破口出发而非二营背后民房`);
  const views = [merged.evaluate(born).player, ...observationPoints];
  for (const player of views) {
    for (const eyeHeight of [1.15, 1.7]) {
      const origin = Eyes(player, eyeHeight);
      for (const spawn of [preview.p, route[0]]) {
        const target = Eyes(spawn, 1.4);
        assert.ok(searchWalls.some(wall => RayHitsOrientedBox(origin, target, wall, groundAt)),
          `09A 东翼分流搜兵 ${index + 1} 的生成点 ${spawn} 从玩家位置 ${player} 可见`);
      }
    }
  }
  for (const [step, end] of route.slice(1).entries()) {
    const start = route[step];
    const dx = end[0] - start[0], dz = end[1] - start[1];
    const length = Math.hypot(dx, dz);
    if (length < 1e-4) continue;
    for (const offset of [-0.32, 0, 0.32]) {
      const Track = ([x, z]) => Eyes([x - dz * offset / length, z + dx * offset / length], 1);
      assert.ok(!searchWalls.some(wall => RayHitsOrientedBox(Track(start), Track(end), wall, groundAt)),
        `09A 北街搜兵第 ${step + 1} 段路线 (${start}->${end}) 须有通行净空`);
    }
  }
}
const b09b = merged.BeatById("09b");
const b09c = merged.BeatById("09c");
// 1287.17s：三名搜兵已自东向西扫上北街
const westSearchAtReport = merged.evaluate(1287.17).actors.filter(actor => actor.groupId === westSearch.id);
assert.equal(westSearchAtReport.length, 3, "原标注帧三名搜兵沿北街自东向西行进");
assert.ok(westSearchAtReport.every(actor => actor.pose === "run" && actor.p[1] >= 515 && actor.p[1] <= 522 && actor.p[0] > 95 && actor.p[0] < 145));
// 炸雷因果：罗班长第一颗雷 09b+7.7s (1298.7s) 爆响前，搜兵仍在庙北未提前东撤；爆响后 09b+11s 才向东回援，且进入 09d 后在老耿家东侧存活
const searchBeforeBlast = merged.evaluate(b09b.start + 7.5).actors.find(a => a.id === "MergedWestSearch_0");
const searchAfterBlast = merged.evaluate(b09b.start + 12.0).actors.find(a => a.id === "MergedWestSearch_0");
const searchAt09d = merged.evaluate(merged.BeatById("09d").start + 2).actors.filter(a => a.groupId === westSearch.id);
assert.ok(searchBeforeBlast && searchBeforeBlast.p[0] <= 77, "炸雷前北街搜兵停在庙北墙外张望，不提前掉头");
assert.ok(searchAfterBlast && searchAfterBlast.p[0] > searchBeforeBlast.p[0] + 5, "炸雷后北街搜兵按军哨向东回援");
assert.ok(searchAt09d.length === 3 && searchAt09d.every(a => a.pose !== "dead" && a.p[0] > 142 && a.p[1] > 560),
  "北街搜兵不原地倒死，完整东撤至老耿家东侧增援");
// MA2 街坊院暴行与撤回增援：09b+5.5s 院内爆响、老人遇害，09b+9s 炸雷后撤回 MA4 前院
const fAtrocityBlast = merged.evaluate(b09b.start + 5.6);
assert.ok(fAtrocityBlast.effects.some(e => e.kind === "blast" && e.side === "enemy" && e.p[0] > 100 && e.p[0] < 114 && e.p[1] > 563),
  "09b 街坊院 MA2 呈现克制手榴弹暴行烟尘与爆炸");
const fAtrocityAfter = merged.evaluate(b09b.start + 6.5);
assert.equal(fAtrocityAfter.actors.find(a => a.id === "neighborElder")?.pose, "dead", "街坊老人在暴行爆炸后倒地");
const atrocityAt09d = merged.evaluate(merged.BeatById("09d").start + 2).actors.filter(a => a.groupId === atrocityGroup.id);
assert.ok(atrocityAt09d.length === 2 && atrocityAt09d.every(a => a.pose !== "dead" && a.p[0] >= 126 && a.p[0] <= 138 && a.p[1] >= 563 && a.p[1] <= 573),
  "街坊院暴行组在班长甩雷后撤回老耿家前院增援");
// 09c 邻院落单兵：顺子大刀无声解决
const f09cMelee = merged.evaluate(b09c.start + 6.5);
assert.equal(f09cMelee.actors.find(a => a.id === "player")?.pose, "melee", "09c 顺子以大刀近战无声解决邻院落单搜屋兵");
const f09cAfterMelee = merged.evaluate(b09c.start + 8.0);
assert.equal(f09cAfterMelee.actors.find(a => a.id === "MergedYardStraggler_0")?.pose, "dead", "邻院落单搜屋兵在 09c 被无声放倒");

// 08c 垫沟兵全部 4 个生成点从沟南战壕各观察位均须完全被土坎掩体遮挡，防止 VisibleSpawn 误卡或转头后突刷。
const boardsGroup = CompileEncounters(merged.defaultDocument, merged.timeline).groups.find(group => group.id === "MergedBoards");
const boardsScreens = solidObjects.filter(({ pos: [x, , z] }) => x >= 88 && x <= 112 && z >= 408 && z <= 476);
for (let index = 0; index < boardsGroup.count; index++) {
  const spawn = GroupPath(boardsGroup, index)[0];
  for (const player of [[104, 478], [112, 478], [99, 475.5], [101, 476]]) {
    const origin = Eyes(player, 1.7);
    for (const [dx, height] of [[0, 0.4], [0, 1.1], [0, 1.7], [-0.35, 1.4], [0.35, 1.4]]) {
      const target = Eyes([spawn[0] + dx, spawn[1]], height);
      assert.ok(boardsScreens.some(wall => RayHitsOrientedBox(origin, target, wall, groundAt)),
        `08C 垫沟兵 ${index + 1} 的生成点 ${spawn} 从战壕位置 ${player} 可见`);
    }
  }
}

// 8. 全员 0 穿墙、潜行/平民零照面穿帮、合理近距交火线回归审计（按 1s 步进扫完整个 08a–13e）
const solidWalls = solidObjects.filter((o) => o.size[1] >= 0.45 && o.meta?.obstacle !== "barbedWire");
const prevActorMap = new Map();
for (let t = merged.BeatById("08a").start; t < merged.duration; t += 1.0) {
  const fr = merged.evaluate(t);
  const sigs = fr.signals || [];
  const livingEnemies = fr.actors.filter((a) => a.side === "enemy" && a.pose !== "dead" && a.kind !== "tank");
  for (const actor of fr.actors) {
    if (actor.pose === "dead" || actor.kind === "quilt") continue;
    const prev = prevActorMap.get(actor.id);
    if (prev && prev.stage === fr.beat.stage) {
      const stepDist = Math.hypot(actor.p[0] - prev.p[0], actor.p[1] - prev.p[1]);
      if (stepDist >= 0.05 && stepDist <= 15) {
        const pA = [prev.p[0], (prev.sy ?? groundAt(prev.p[0], prev.p[1])) + 1.0, prev.p[1]];
        const pB = [actor.p[0], (actor.surfaceY ?? groundAt(actor.p[0], actor.p[1])) + 1.0, actor.p[1]];
        for (const wall of solidWalls) {
          if (wall.hideOn && sigs.includes(wall.hideOn)) continue;
          assert.ok(!RayHitsOrientedBox(pA, pB, wall, groundAt), `角色 ${actor.id} 在 ${fr.beat.id} 穿墙：${wall.id}`);
        }
      }
    }
    prevActorMap.set(actor.id, { p: actor.p, sy: actor.surfaceY, stage: fr.beat.stage });
  }
  if (["09a", "09b", "09c"].includes(fr.beat.id)) {
    for (const id of ["player", "liu", "nier"]) {
      const friendly = fr.actors.find((a) => a.id === id);
      if (!friendly) continue;
      for (const enemy of livingEnemies) {
        if (fr.beat.id === "09c" && enemy.groupId === "MergedYardStraggler") continue;
        const d = Math.hypot(friendly.p[0] - enemy.p[0], friendly.p[1] - enemy.p[1]);
        if (d > 42) continue;
        const occ = SegmentOccluded(friendly.p, enemy.p, groundAt, solidWalls.filter((w) => !(w.hideOn && sigs.includes(w.hideOn))));
        assert.ok(occ.occluded, `潜行拍 ${fr.beat.id} 中 ${id} 与 ${enemy.groupId} 无遮挡照面 (dist=${d.toFixed(1)}m)`);
      }
    }
  }
  for (const eff of fr.effects) {
    if (eff.kind !== "fire") continue;
    const dist = Math.hypot(eff.a[0] - eff.b[0], eff.a[1] - eff.b[1]);
    const cap = fr.beat.id.startsWith("13") ? 125 : 95;
    assert.ok(dist <= cap, `异常超距跨村火线 ${fr.beat.id}: ${eff.sourceId} -> ${eff.targetId} (${dist.toFixed(1)}m)`);
    if (eff.groupId === "MergedHouseGun") {
      assert.ok(eff.a[0] <= 140, `老耿家封街机枪组未到位前不得隔村乱射 (${eff.a})`);
    }
  }
}

// Play 的钟点只在离开日间预设后才转黄昏：日间兜底预设的 18 点外观未调成可玩画面（曝光过高、浓雾吞掉地面）。
for (const spec of ENCOUNTER_VARIANTS) {
  const variant = CompileEncounterVariant(spec.id);
  const config = variant.playConfig.environment;
  const zones = JSON.parse(fs.readFileSync(path.join(dirHere, "Scenes", spec.scene, `Environment_${spec.scene}.json`), "utf8"))
    .volumes.filter((v) => v.shape === "box" && v.preset !== "FirstLevelEncounter");
  for (const beat of variant.timeline) {
    if (beat.id < config.duskBeat) continue;
    const [x, z] = variant.evaluate(beat.start + 0.01, variant.defaultDocument).player;
    assert.ok(zones.some((v) => Math.abs(x - v.center[0]) <= v.size[0] / 2 && Math.abs(z - v.center[2]) <= v.size[2] / 2),
      `${spec.id} ${beat.id} 已按黄昏钟点开局，但玩家 (${x.toFixed(0)}, ${z.toFixed(0)}) 不在黄昏环境区域内`);
  }
}

// 01–05 壕沟斜坡白盒封堵校验：所有不可上坡的壕沟坡道须配真实实体土堆/断木（noClimb 且不误标 planning/Cover），
// 自动随 z<355 继承进合并版、不阻断玩家 01–07 主线，且敌军单向下沟坡道保持上坡跨步 ≤ stepMax、下坡陡坎 > jumpRiseMax。
{
  const baseSlopeBlocks = baseDisk.doc.objects.filter((o) => o.id.startsWith("SlopeBlock_"));
  const mergedSlopeBlocks = resolved.doc.objects.filter((o) => o.id.startsWith("SlopeBlock_"));
  assert.ok(baseSlopeBlocks.length >= 40, `01–05 壕沟斜坡封堵应包含完整土堆与断木构件（实测 ${baseSlopeBlocks.length}）`);
  assert.equal(mergedSlopeBlocks.length, baseSlopeBlocks.length, "全部壕沟斜坡封堵（z<355）均须无缝继承进 FirstLevelMerged");
  for (const cluster of [
    "DugoutNorth", "NorthPursuit", "TrafficFlank", "DragWest", "CrestEast",
    "CampWest", "LaneNorth", "LaneMiddle",
    "EastBreach", "WestRailAnchor", "SupportWestEnd", "CrestWestEnd",
  ]) {
    assert.ok(baseSlopeBlocks.some((o) => o.id.startsWith(`SlopeBlock_${cluster}_`)), `缺少斜坡封堵簇 SlopeBlock_${cluster}_*`);
  }
  for (const sb of baseSlopeBlocks) {
    assert.equal(sb.solid, true, `${sb.id} 必须为实体碰撞`);
    assert.equal(sb.noClimb, true, `${sb.id} 必须禁止玩家攀爬（noClimb: true）`);
    assert.ok(!sb.meta?.planning && sb.material !== "Whitebox/Cover", `${sb.id} 属于封坡土堆/断木，不得混标为战术掩体`);
  }
  const baseDatumBytes = fs.readFileSync(path.join(dirHere, "Scenes/FirstLevelEncounter", baseDisk.doc.trenches.datum.file));
  const baseTerrain = PrepareSceneTerrain(baseDisk.doc, baseDisk.heights, baseDatumBytes);
  const baseSurface = SceneSurfaceSampler(baseDisk.doc.surface, GridSampler(baseDisk.doc.terrain, baseTerrain.heights));
  for (const beat of original.timeline.filter((b) => Number(b.stage) <= 7)) {
    for (let i = 1; i < beat.p.length; i++) {
      const a = [beat.p[i - 1][0], baseSurface(...beat.p[i - 1]) + 0.9, beat.p[i - 1][1]];
      const b = [beat.p[i][0], baseSurface(...beat.p[i]) + 0.9, beat.p[i][1]];
      for (const sb of baseSlopeBlocks) {
        assert.ok(!RayHitsOrientedBox(a, b, sb, baseSurface), `玩家主线 ${beat.id} 不得被斜坡封堵 ${sb.id} 阻断`);
      }
    }
  }
  for (const [prefix, rampId] of [
    ["DugoutNorth", "DugoutPressureRamp"],
    ["NorthPursuit", "NorthPursuitRamp"],
    ["TrafficFlank", "TrafficFlankRamp"],
  ]) {
    const mound = baseSlopeBlocks.find((o) => o.id === `SlopeBlock_${prefix}_Mound`);
    const ramp = baseDisk.doc.surface.ramps.find((r) => r.id === rampId);
    assert.ok(mound && ramp, `缺少单向斜坡土堆 ${prefix} / ${rampId}`);
    const p0 = ramp.points[0], p2 = ramp.points.at(-1);
    const len = Math.hypot(p2[0] - p0[0], p2[1] - p0[1]);
    const ux = (p2[0] - p0[0]) / len, uz = (p2[1] - p0[1]) / len;
    const halfD = mound.size[2] / 2;
    const yUp = baseSurface(mound.pos[0] + ux * halfD, mound.pos[2] + uz * halfD);
    const yDown = baseSurface(mound.pos[0] - ux * halfD, mound.pos[2] - uz * halfD);
    const topY = mound.pos[1] + mound.size[1];
    assert.ok(topY - yUp <= TRAVERSAL.stepMax - 0.1, `${mound.id} 坡顶侧高差 ${(topY - yUp).toFixed(2)}m 须 ≤ stepMax，确保敌军顺畅下沟`);
    assert.ok(topY - yDown >= TRAVERSAL.jumpRiseMax + 0.25, `${mound.id} 沟底侧陡坎 ${(topY - yDown).toFixed(2)}m 须高于玩家跳跃上限`);
  }
}

// 08–13 沟口两翼/村落外缘围封与 10a 村内多路贯通校验：
// 1) 沟口东西两翼、北村口东缘、庙西与村西/救护所外缘均配可见白盒封堵；
// 2) 10a 从老耿家/大槐树 (140, 560) 到救护所 (121, 722) 同时贯通东主街 (x>=155)、村内中街 (x<=142) 与西巷 (x<=102)。
{
  for (const prefix of [
    "Merged_Block_DitchFlankWN", "Merged_Block_DitchFlankWS", "Merged_Block_DitchFlankEN", "Merged_Block_DitchFlankES",
    "Merged_Block_NorthEntryE", "Merged_Block_TempleWest", "Merged_Block_WestOuter", "Merged_Block_AidEast",
  ]) {
    assert.ok(mergedBlocks.some((b) => b.id.startsWith(prefix)), `缺少外缘白盒封堵簇 ${prefix}*`);
  }
  const sigs10a = merged.evaluate(merged.BeatById("10a").start + 0.01, merged.defaultDocument).signals || [];
  const activeBlocks10a = [
    ...solidObjects.filter((o) => {
      if (o.hideOn && sigs10a.includes(o.hideOn)) return false;
      if (o.showOn && !sigs10a.includes(o.showOn)) return false;
      if (!o.pos || !o.size || o.size[1] < 0.45) return false;
      const g = groundAt(o.pos[0], o.pos[2]);
      const baseY = o.pos[1] ?? g;
      return baseY <= g + 1.5 && baseY + o.size[1] >= g + 0.35;
    }),
    ...mergedKeepIn,
    ...mergedStageGates.filter((g) => stageGateActive(g, sigs10a)),
  ].filter((o) => o.pos[0] >= 60 && o.pos[0] <= 200 && o.pos[2] >= 540 && o.pos[2] <= 750);

  const cellBlocked = (x, z, r = 0.45) => {
    for (const o of activeBlocks10a) {
      const dx = x - o.pos[0], dz = z - o.pos[2];
      if (Math.abs(dx) > 25 || Math.abs(dz) > 25) continue;
      const rad = ((o.yawDeg || 0) * Math.PI) / 180;
      const c = Math.cos(rad), s = Math.sin(rad);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) <= o.size[0] / 2 + r && Math.abs(lz) <= o.size[2] / 2 + r) return true;
    }
    return false;
  };
  const bfsReach = (allowed) => {
    const start = [140, 560], goal = [121, 722];
    const key = (x, z) => `${x},${z}`;
    const q = [start];
    const seen = new Set([key(...start)]);
    let qi = 0;
    while (qi < q.length) {
      const [x, z] = q[qi++];
      if (Math.hypot(x - goal[0], z - goal[1]) <= 2.5) return true;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (nx < 72 || nx > 182 || nz < 552 || nz > 730) continue;
        if (!allowed(nx, nz)) continue;
        const k = key(nx, nz);
        if (seen.has(k) || cellBlocked(nx, nz)) continue;
        seen.add(k);
        q.push([nx, nz]);
      }
    }
    return false;
  };
  assert.ok(bfsReach((x, z) => (z < 600 || z > 675) || x >= 155), "10a 老耿家至救护所应保留东主街路线 (x>=155)");
  assert.ok(bfsReach((x, z) => (z < 610 || z > 685) || x <= 142), "10a 老耿家至救护所应同时贯通村内中街/西巷路线 (x<=142)");
  assert.ok(bfsReach((x, z) => (z < 610 || z > 685) || x <= 102), "10a 老耿家至救护所应同时贯通西巷外侧路线 (x<=102)");
}

// 9. 回撤路线北方远距零星炮击编排、规避、回拖确定性与 Play 运行时门禁
{
  const frontArt = original.artillery || [];
  const mergedArt = merged.artillery || [];
  assert.equal(frontArt.length, 11, "01-07 共用段编排 11 发北方远距炮弹");
  assert.equal(mergedArt.length, 19, "L1_BeishaheMerged 全程编排 19 发北方远距炮弹（前 11 + 合并段 8）");
  assert.deepEqual(
    mergedArt.slice(0, 11).map((item) => [item.id, item.beat, item.impactAt, item.p, item.role]),
    frontArt.map((item) => [item.id, item.beat, item.impactAt, item.p, item.role]),
    "01-07 共用段炮击时间表在原版与单村合并版间完全一致",
  );

  const forbiddenBeats = new Set([
    "01a", "01b", "01c", "01d", "01e", "02a", "02b", "02c", "02d", "02e", "02f", "02g", "02h", "02i",
    "03d", "06b", "06c", "06d", "06e", "06f", "06g", "06h", "07a", "07b", "07c",
    "09a", "09b", "09c", "09d", "10b", "10c", "11a", "11b", "11c", "13c", "13d", "13e",
  ]);
  let dodgeCount = 0, suppressCount = 0;
  for (const strike of mergedArt) {
    assert.ok(!forbiddenBeats.has(strike.beat), `${strike.id} 不得落在静默/近战/潜行/空袭拍 ${strike.beat}`);
    assert.ok(strike.from[1] < strike.p[1] - 100, `${strike.id} 必须来自北侧远方 (-Z)`);
    assert.ok(strike.warnS >= 2.5 && strike.radius >= 5.0, `${strike.id} 预警时长与爆炸半径须合理`);
    assert.ok(strike.warnAt > strike.beatStart + 1.0 && strike.evadeEndAt < strike.beatEnd, `${strike.id} 须完整留在所属节拍内`);
    if (strike.role === "dodge") dodgeCount++;
    else if (strike.role === "suppress") suppressCount++;

    // 预警、爆炸、留坑及回拖确定性
    const midWarnT = strike.impactAt - strike.warnS * 0.45;
    const warnFrame = merged.evaluate(midWarnT);
    const warnEff = warnFrame.effects.find((e) => e.kind === "artilleryWarn" && e.id === strike.id);
    assert.ok(warnEff && warnEff.progress > 0.3 && warnEff.remainingS > 0.5, `${strike.id} 在预警窗内输出 artilleryWarn`);
    const blastFrame = merged.evaluate(strike.impactAt + 0.2);
    assert.ok(blastFrame.effects.some((e) => e.kind === "artilleryBlast" && e.id === strike.id), `${strike.id} 起爆时输出 artilleryBlast`);
    const craterFrame = merged.evaluate(strike.impactAt + 2.5);
    assert.ok(craterFrame.effects.some((e) => e.kind === "artilleryCrater" && e.id === strike.id), `${strike.id} 爆后保留 artilleryCrater`);
    merged.evaluate(0);
    assert.deepEqual(merged.evaluate(midWarnT), warnFrame, `${strike.id} 任意回拖保持完全确定`);

    if (strike.role === "dodge") {
      const peakFrame = merged.evaluate(strike.impactAt - 0.15);
      const pActor = peakFrame.actors.find((a) => a.id === "player");
      assert.ok(pActor?.evadingArtillery && pActor.pose === "crouch" && !pActor.firing, `${strike.id} 预警末期顺子伏低避弹且暂停射击`);
      assert.deepEqual(peakFrame.player, pActor.p, `${strike.id} frame.player 与 actors[0].p 保持同步`);
    }
  }
  assert.equal(dodgeCount, 9, "全程含 9 处需主动躲避的迫近炮弹");
  assert.equal(suppressCount, 10, "全程含 10 处侧翼/北沿/河滩压制炮弹");

  // 08c 掷弹筒与何有田对白「掷弹筒砸过来了！缩沟底！」(08c+33s) 严格同步
  const mortar08c = mergedArt.find((s) => s.id === "Art_08c_TrenchDodge");
  assert.ok(mortar08c && Math.abs((mortar08c.warnAt - mortar08c.beatStart) - 33.2) < 0.05, "08c 掷弹筒在何有田喊话后 0.2s 立即亮出落点预警");

  // 实时 Play 运行时：触发真实 FireShell + IncomingMarker、潜行静默、越过跳过、友军避弹向量与 Reset
  const firedShells = [], incomingMarkers = [], playedAudio = [];
  const fakeHost = {
    battlefield: { GroundHeight: () => 0, Raycast: () => null },
    combat: {
      PredictShellImpact: (_from, target) => target.clone(),
      FireShell: (from, target, opts) => { firedShells.push({ from, target, opts }); return {}; },
    },
    vfx: { IncomingMarker: (pos, flight, opts) => { incomingMarkers.push({ pos, flight, opts }); } },
    audio: { Play: (cue, opts) => { playedAudio.push({ cue, opts }); } },
  };
  const artRt = new EncounterArtilleryRuntime(fakeHost, merged, { groundAt: () => 0 });
  const frame08a = merged.evaluate(merged.BeatById("08a").start + 1);
  // 潜行激活时不触发
  artRt.Update(20, frame08a, { playerPos: { x: 105, z: 412 }, stealthActive: true });
  assert.equal(firedShells.length, 0, "潜行态不得触发远距炮击");
  // 正常接近 08a 官道触发 dodge 炮弹
  artRt.Update(9.5, frame08a, { playerPos: { x: 105, z: 412 }, stealthActive: false });
  assert.equal(firedShells.length, 1, "08a 推进至官道触发北方远距炮弹");
  assert.equal(firedShells[0].opts.warn, true, "dodge 炮弹开启 HUD 预警标志");
  assert.ok(firedShells[0].from.z < firedShells[0].target.z - 100, "实时炮弹从北侧高空飞来");
  assert.equal(incomingMarkers.length, 1, "同步投影地面落点提示圈");
  assert.equal(artRt.State().length, 1, "State 暴露在途预警给 2D 试玩小地图");
  const evadeVec = artRt.EvasionFor({ x: 105, z: 414 });
  assert.ok(evadeVec && evadeVec.away[0] < -0.5, "近旁友军收到背离落点的避弹方向");
  artRt.Reset();
  assert.equal(artRt.State().length, 0, "Reset 后彻底清空在途炮击与触发记录");

  // 玩家已大幅南撤甩开该落点时直接跳过
  artRt.Update(12, frame08a, { playerPos: { x: 105, z: 445 }, stealthActive: false });
  assert.equal(firedShells.length, 1, "已大幅越过落点时跳过陈旧炮弹");

  // Combat.GrenadeThreats 接管 warn:true 炮弹并忽略普通炮弹
  const stubCombatHost = {
    battlefield: { GroundHeight: () => 0, Raycast: () => null },
    ai: { soldiers: [] },
    scene: { add() {}, remove() {} },
    library: { Get: () => new THREE.MeshBasicMaterial() },
    player: { Alive: true, position: new THREE.Vector3(106, 0, 414) },
  };
  const combat = new CombatSystem(stubCombatHost);
  combat.FireShell(new THREE.Vector3(108, 48, 250), new THREE.Vector3(107.8, 0, 414.5), {
    flight: 3.1, kind: "Shell75", radius: 5.8, damage: 52, warn: true, warnRadius: 8.4,
  });
  combat.FireShell(new THREE.Vector3(108, 48, 250), new THREE.Vector3(107.8, 0, 414.5), {
    flight: 3.1, kind: "Shell75", radius: 5.8, damage: 34, warn: false,
  });
  const threats = combat.GrenadeThreats(new THREE.Vector3(106, 0, 414));
  assert.equal(threats.length, 1, "GrenadeThreats 仅上报带 warn:true 的来袭炮弹");
  assert.equal(threats[0].kind, "ArtilleryShell");
  assert.equal(threats[0].returnable, false);
  combat.Dispose();
}

console.log("[EncounterVariantsTest] PASS: registry, 01-07 shared parity, z<355 scene inheritance, overrides, isolated storage, 08-13 playable gates, enemy occlusion, artillery bombardment & full zero-clip/zero-LOS/fire-line audit");
