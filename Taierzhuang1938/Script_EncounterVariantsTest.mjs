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
  const rad = -(obj.yawDeg || 0) * Math.PI / 180;
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
// 验证村落建筑多样性改造与鲁南田野乡土景物、底色提亮与无重叠麦田地块
assert.ok(resolved.doc.objects.some((o) => o.id.endsWith("_ThatchCrown")), "村落包含草顶土坯农舍差异化屋顶");
assert.ok(resolved.doc.objects.some((o) => o.id.endsWith("_Ridge") || o.id.endsWith("_HighRidge")), "村落包含双坡灰瓦高脊院落");
assert.ok(resolved.doc.objects.some((o) => o.id.endsWith("_Chimney")), "村落包含砖砌灶台烟囱");
assert.ok(resolved.doc.objects.some((o) => o.id.startsWith("Merged_Rick_")), "外围田野包含麦秸垛");
assert.ok(resolved.doc.objects.some((o) => o.id.startsWith("Merged_Mound_")), "外围田野包含鲁南田间坟头与孤树");
assert.ok(resolved.doc.objects.some((o) => o.id.startsWith("Merged_FieldTree_")), "外围田野包含沿田埂水沟的榆柳树排");
const villagePaint = resolved.doc.paint.find((p) => p.id === "Village");
assert.equal(villagePaint?.color, "#c6b99c", "村庄地基色提亮为鲁南夯实黄土，避免巷道与打麦场周围像黑色阴影");
assert.ok(!resolved.doc.paint.some((p) => /^Wheat_/.test(p.id || "") && p.z >= 355), "合并村外围不再残留突兀绿方块麦田矩形");

const mergedMap = BuildEncounterMap(resolved.doc, { sceneId: "FirstLevelMerged", variantSpec: GetEncounterVariantSpec("L1_BeishaheMerged") });
assert.deepEqual(mergedMap.bounds, [-160, 320, -480, 990]);
const expYards = new Set(resolved.doc.objects.filter((o) => /^Exp_[A-Z0-9]+_[A-Z0-9]+_/.test(o.id)).map((o) => o.id.match(/^(Exp_[A-Z0-9]+_[A-Z0-9]+)_/)[1]));
assert.ok(expYards.size >= 60, `方案 A 扩建加密至少新增 60 座鲁南合院，实测：${expYards.size}`);
const lmVillage = resolved.doc.markers.find((m) => m.id === "LmVillage");
assert.ok(lmVillage && lmVillage.w >= 240 && lmVillage.d >= 260, `北沙河村规模已扩建至鲁南百户大村尺度（实测 ${lmVillage?.w}×${lmVillage?.d}m）`);
const mergedOnlyFields = mergedMap.fields.filter((f) => f.zone.startsWith("Merged"));
assert.ok(mergedOnlyFields.length >= 40, "合并村外围具备完整无重叠农田地块网格");
for (let i = 0; i < mergedOnlyFields.length; i++) {
  const a = mergedOnlyFields[i];
  assert.equal(a.angleDeg, 0, "合并村农田地块不再旋转堆叠");
  for (let j = i + 1; j < mergedOnlyFields.length; j++) {
    const b = mergedOnlyFields[j];
    const overlapX = Math.abs(a.x - b.x) < (a.w + b.w) / 2 - 0.1;
    const overlapZ = Math.abs(a.z - b.z) < (a.d + b.d) / 2 - 0.1;
    assert.ok(!(overlapX && overlapZ), `农田地块 (${i},${j}) 严禁互相重叠堆叠`);
  }
}
for (const expectedLabel of ["防炮洞", "小土地庙", "土炮楼", "关帝庙（兼村塾）", "大槐树", "石碾", "老耿家（中街西头）", "夹壁便门"]) {
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
