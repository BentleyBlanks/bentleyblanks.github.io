// 遭遇设计多关卡与分段变体门禁：验证注册表、01–07 编排零重复共用、z<355 场景北段继承无缝拼接、
// 同场景 overrides 变体、独立草稿存储、08–13 单村合并版全链路 Play 过关与敌军遮挡生成规范。

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SCENE_IDS, ValidateScene, DecodeSceneHeights, BlockoutDocFromScene } from "./Script_SceneDoc.mjs";
import { ValidateBlockoutScene } from "./Script_EditorBlockoutConfig.mjs";
import { DecodeTrenchDatum, PrepareSceneTerrain, GridSampler } from "./Script_SceneTrenches.mjs";
import { ResolveInheritedScene, FetchResolvedScene } from "./Script_SceneInherit.mjs";
import {
  ENCOUNTER_LEVELS, ENCOUNTER_VARIANTS, GetEncounterVariantSpec, CompileEncounterVariant,
} from "./Script_EncounterVariants.mjs";
import { EncounterPlayPlan, EncounterCanPlay, EncounterSceneSignals } from "./Script_EncounterPlayPlan.mjs";
import { EncounterDialogueLines } from "./Script_EncounterPlayDialogue.mjs";
import { EncounterDocument } from "./AdvancedTools/Script_LevelFlowDocument.mjs";
import { BuildEncounterMap } from "./AdvancedTools/Script_LevelFlowMap.mjs";

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
assert.equal(ENCOUNTER_VARIANTS.length, 2, "初始 UI 仅展示基线与单村合并两个变体");
assert.deepEqual(ENCOUNTER_VARIANTS.map((v) => v.id), ["L1_Original", "L1_BeishaheMerged"]);
for (const spec of ENCOUNTER_VARIANTS) {
  assert.ok(SCENE_IDS.includes(spec.scene), `变体 ${spec.id} 绑定的场景 ${spec.scene} 已在 SCENE_LIST 注册`);
}
assert.notEqual(ENCOUNTER_VARIANTS[0].storageKey, ENCOUNTER_VARIANTS[1].storageKey, "不同变体草稿存储键彼此隔离");

const original = CompileEncounterVariant("L1_Original");
const merged = CompileEncounterVariant("L1_BeishaheMerged");
assert.equal(original.duration, 3249, "基线双村版全程保持 54:09 不变");
assert.equal(merged.duration, 2140, "单村合并版全程压缩至 35:40（2140s）");

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
assert.equal(resolved.doc.bounds.maxZ, 910);

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
assert.equal(fetchedViaUrl.doc.bounds.maxZ, 910);
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

const mergedMap = BuildEncounterMap(resolved.doc, { sceneId: "FirstLevelMerged", variantSpec: GetEncounterVariantSpec("L1_BeishaheMerged") });
assert.deepEqual(mergedMap.bounds, [-160, 320, -480, 910]);
assert.ok(!mergedMap.labels.some((l) => l.name === "关帝庙" || l.name === "土地庙"), "单村合并版底图不混入耿家庄专属地标");
assert.ok(mergedMap.labels.some((l) => l.name === "防炮洞") && mergedMap.labels.some((l) => l.name === "老耿家（中街西头）"), "共用段与合并村地标齐全");

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

// 6. 单村合并版 08–13 核心人物弧光与全链路 Play 过关验证
const f08f = merged.evaluate(merged.BeatById("08f").start + 10);
assert.ok(f08f.dialogue.some((d) => d.actorId === "batman" && d.text.includes("营长的东西")), "08f 包含营部勤务兵抢车位冲突");
const f09e = merged.evaluate(merged.BeatById("09e").start + 37);
assert.ok(f09e.stealth.noFire, "09e 处于西巷禁火潜行态");
assert.ok(f09e.dialogue.some((d) => d.actorId === "player" && d.text.includes("老子是救你")), "09e 包含妮儿咬手误解冲突");
const f10b = merged.evaluate(merged.BeatById("10b").start + 3);
assert.ok(f10b.signals.includes("RaidAftermath") && f10b.signals.includes("AidCartBurned"), "10b 已处于救护所空袭场景信号态");
const f13e = merged.evaluate(merged.BeatById("13e").start + 15);
assert.ok(f13e.signals.includes("BridgeBlown"), "13e 后半拍触发炸毁铁路桥高潮信号");

const plan = new EncounterPlayPlan(merged.defaultDocument, merged.BeatById("08a").start, merged);
assert.equal(plan.State().variant, "L1_BeishaheMerged");
assert.equal(plan.State().scene, "FirstLevelMerged");
assert.equal(plan.beat.id, "08a");

const lines08f = EncounterDialogueLines(
  new EncounterPlayPlan(merged.defaultDocument, merged.BeatById("08f").start, merged),
  merged.evaluate(merged.BeatById("08f").start + 2),
  { interact: true },
);
assert.ok(lines08f.some((l) => l.order && l.text.includes("推开勤务兵")), "EncounterDialogueLines 读取变体专属指令引导");

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
assert.ok(plan.completed, `单村合并版 08a→13e 全可玩节点顺畅通关，已完成：${plan.completedBeats.join(",")}`);
assert.ok(!plan.completedBeats.includes("13f"), "结尾过场动画拍 13f 自动跳过");
assert.ok(plan.completedBeats.includes("13e"), "终局高潮 13e 实玩完成");

// 7. 敌军生成默认避开玩家视线（AGENTS.md 2026-11-14 规范校验）与实机白盒场景切片校验
const { heights: carvedHeights, plan: carvedPlan } = PrepareSceneTerrain(resolved.doc, resolved.heights, null);
const sliceDoc = BlockoutDocFromScene(resolved.doc, carvedHeights, {
  level: "FirstLevelEncounter",
  region: { minX: -160, maxX: 320, minZ: -480, maxZ: 910 },
  priorSignals: ["Stage0105Done"],
  trenchPlan: carvedPlan,
});
const sliceCheck = ValidateBlockoutScene(sliceDoc);
assert.ok(sliceCheck.ok, `合成场景转实机 Blockout 切片通过校验：${sliceCheck.errors.join("；")}`);
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

console.log("[EncounterVariantsTest] PASS: registry, 01-07 shared parity, z<355 scene inheritance, overrides, isolated storage, 08-13 playable gates & enemy occlusion");
