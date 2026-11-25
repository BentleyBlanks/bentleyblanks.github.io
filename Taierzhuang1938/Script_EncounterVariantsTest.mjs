// 遭遇设计多关卡与分段变体门禁：验证注册表、01–07 编排零重复共用、z<355 场景北段继承无缝拼接、
// 同场景 overrides 变体、独立草稿存储、08–13 单村合并版全链路 Play 过关与敌军遮挡生成规范。

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import { SCENE_IDS, ValidateScene, DecodeSceneHeights, BlockoutDocFromScene } from "./Script_SceneDoc.mjs";
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
const mergedKeepIn = resolved.doc.objects.filter((o) => o.id.startsWith("Merged_KeepIn_"));
assert.ok(mergedKeepIn.length >= 25, `08–13 可玩走廊配置完整玩家专用空气墙收束（实测 ${mergedKeepIn.length} 段）`);
for (const aw of mergedKeepIn) {
  assert.equal(aw.tag, "airWall");
  assert.equal(aw.material, "Whitebox/AirWall");
  assert.equal(aw.visual, false);
}
// 确保 08a–13e 玩家主线每一步都不撞到任何 KeepIn 空气墙（至少留出 1.2m 安全余量）
const keepInCheckGround = () => 0;
for (const beat of merged.timeline.filter((b) => Number(b.stage) >= 8)) {
  for (let i = 1; i < beat.p.length; i++) {
    const a = [beat.p[i - 1][0], 1.0, beat.p[i - 1][1]];
    const b = [beat.p[i][0], 1.0, beat.p[i][1]];
    for (const aw of mergedKeepIn) {
      const boxObj = { ...aw, tag: undefined };
      assert.ok(!RayHitsOrientedBox(a, b, boxObj, keepInCheckGround), `玩家主线 ${beat.id} 不得被空气墙 ${aw.id} 阻断`);
    }
  }
}
const villagePaint = resolved.doc.paint.find((p) => p.id === "Village");
assert.equal(villagePaint?.color, "#c6b99c", "村庄地基色保持鲁南夯实黄土");
assert.ok(!resolved.doc.paint.some((p) => /^Wheat_/.test(p.id || "") && p.z >= 355), "合并村外围不再残留突兀绿方块麦田矩形");

const mergedMap = BuildEncounterMap(resolved.doc, { sceneId: "FirstLevelMerged", variantSpec: GetEncounterVariantSpec("L1_BeishaheMerged") });
assert.deepEqual(mergedMap.bounds, [-160, 320, -480, 990]);
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
oldSearch.area.center = [68, 516];
oldSearch.route = [[68, 516], [80, 516], [84, 516], [76, 516], [68, 516]];
oldSearch.lifetime = 14;
const oldSearchTrigger = oldDraft.triggers.find(trigger => trigger.id === oldSearch.triggerId);
oldSearchTrigger.delay = 34;
const ReloadMerged = () => {
  fakeStore.set(merged.spec.storageKey, JSON.stringify(oldDraft));
  return new EncounterDocument(merged.defaultDocument, merged.timeline, mockStorage, {
    storageKey: merged.spec.storageKey, legacyStorageKey: null,
  }).value;
};
const upgradedDraft = ReloadMerged();
assert.equal(upgradedDraft.revision, merged.defaultDocument.revision);
assert.deepEqual(upgradedDraft.groups.find(group => group.id === oldSearch.id),
  merged.defaultDocument.groups.find(group => group.id === oldSearch.id));
assert.equal(upgradedDraft.triggers.find(trigger => trigger.id === oldSearch.triggerId).delay, 30);
assert.equal(upgradedDraft.groups.find(group => group.id === "MergedBoards").count, 6);
oldSearch.route[1] = [79, 516];
oldSearchTrigger.delay = 35;
const customizedDraft = ReloadMerged();
assert.deepEqual(customizedDraft.groups.find(group => group.id === oldSearch.id), oldSearch);
assert.deepEqual(customizedDraft.triggers.find(trigger => trigger.id === oldSearchTrigger.id), oldSearchTrigger);

// 6. 单村合并版 08–13 单向动线、完整敌军渗入路径与全链路 Play 过关验证
const f08d = merged.evaluate(merged.BeatById("08d").start + 28);
assert.ok(f08d.dialogue.some((d) => d.actorId === "liu" && d.text.includes("关帝庙")), "08d 顺视线转向关帝庙绕后");
const f09b = merged.evaluate(merged.BeatById("09b").start + 26);
assert.ok(f09b.stealth.noFire, "09b 处于关帝庙西巷禁火潜行态");
const b09a = merged.BeatById("09a");
assert.ok(b09a.p[0][1] < f09b.stealth.armMinZ && b09a.p.at(-1)[1] >= f09b.stealth.armMinZ, "09a 从沟口前线出发时禁火未生效，进村后才生效");
for (const id of ["09b", "09c"]) assert.ok(merged.BeatById(id).p.every((p) => p[1] >= f09b.stealth.armMinZ), `${id} 全程处于禁火区`);
assert.ok(f09b.dialogue.some((d) => d.actorId === "player" && d.text.includes("老子是救你")), "09b 包含妮儿咬手误解冲突");
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
assert.equal(mergedEnemyGroups.length, 8, "检查全部 8 组新增合并版敌军波次");
for (const group of mergedEnemyGroups) {
  const beat = merged.BeatById(group.beat);
  const playerAtEntry = beat.p[0];
  const check = SegmentOccluded(playerAtEntry, group.area.center, groundAt, solidObjects);
  assert.ok(
    check.occluded,
    `敌军波次 ${group.id}（${group.beat}）在玩家进拍点 [${playerAtEntry}] 处未遮挡！生成中心 [${group.area.center}]`,
  );
}

// 玩家在出生时的实际视点与附件位置，以及接近庙院的沿途余量。
const westSearch = CompileEncounters(merged.defaultDocument, merged.timeline).groups.find(group => group.id === "MergedWestSearch");
const searchWalls = solidObjects.filter(({ pos: [x, , z] }) => x >= 55 && x <= 112 && z >= 494 && z <= 538);
const Eyes = (xz, eyeHeight) => [xz[0], groundAt(...xz) + eyeHeight, xz[1]];
const observationPoints = [merged.evaluate(1287.1698).player];
for (let elapsed = 27; elapsed <= b09a.duration; elapsed += 0.5) {
  const [x, z] = merged.evaluate(b09a.start + elapsed).player;
  observationPoints.push([x, z], [x - 0.6, z], [x + 0.6, z], [x, z - 0.6], [x, z + 0.6]);
}
for (const [index, { born }] of westSearch.lives.entries()) {
  const preview = merged.evaluate(born).actors.find(actor => actor.id === `MergedWestSearch_${index}`);
  const route = GroupPath(westSearch, index);
  const views = [merged.evaluate(born).player, ...observationPoints];
  for (const player of views) {
    for (const eyeHeight of [1.15, 1.7]) {
      const origin = Eyes(player, eyeHeight);
      for (const spawn of [preview.p, route[0]]) {
        for (const [dx, height] of [[0, 0.4], [0, 1.1], [0, 1.7], [-0.35, 1.4], [0.35, 1.4]]) {
          const target = Eyes([spawn[0] + dx, spawn[1]], height);
          assert.ok(searchWalls.some(wall => RayHitsOrientedBox(origin, target, wall, groundAt)),
            `09A 西翼搜兵 ${index + 1} 的生成点 ${spawn} 从玩家位置 ${player} 可见`);
        }
      }
    }
  }
  for (const [step, end] of route.slice(1).entries()) {
    const start = route[step];
    const dx = end[0] - start[0], dz = end[1] - start[1];
    const length = Math.hypot(dx, dz);
    for (const offset of [-0.32, 0, 0.32]) {
      const Track = ([x, z]) => Eyes([x - dz * offset / length, z + dx * offset / length], 1);
      assert.ok(!searchWalls.some(wall => RayHitsOrientedBox(Track(start), Track(end), wall, groundAt)),
        `09A 西翼搜兵第 ${step + 1} 段路线须有通行净空`);
    }
  }
}
const westSearchAtReport = merged.evaluate(1287.1698).actors.filter(actor => actor.groupId === westSearch.id);
assert.equal(westSearchAtReport.length, 3, "原标注帧的三名搜兵仍沿北街经过");
assert.ok(westSearchAtReport.every(actor => actor.pose === "run" && actor.p[1] > 515 && actor.p[0] < 76));

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

console.log("[EncounterVariantsTest] PASS: registry, 01-07 shared parity, z<355 scene inheritance, overrides, isolated storage, 08-13 playable gates, enemy occlusion & full zero-clip/zero-LOS/fire-line audit");
