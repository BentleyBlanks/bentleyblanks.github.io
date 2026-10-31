// Script_SceneDocTest.mjs —— 场景文件（docs/Data_Scene.md）的 node 回归
// 跑法：node Taierzhuang1938/Script_SceneDocTest.mjs
// 查：FirstLevelWhitebox 过校验、资产 / 材质编号都在目录里、高度图字节数对得上；高度图编解码往返；按范围裁高度图逐点等于整张；
// 物件 → 体块（落地 / 指定高度 / 角度 / 信号）；priorSignals 的两种处理；三段各自取出来的一块过白盒场景校验、能建布局；
// 关卡注册表的 priorSignals 等于前面段落配置里出现过的全部信号；旧的三份 Blockout/*.scene.json 不许再出现。

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { SCENE_ASSETS, SCENE_MATERIALS, WhiteboxMaterialFor } from "./Data_SceneAssets.mjs";
import { WHITEBOX_LOOKS } from "./Data_FirstLevelWhiteboxMaterials.mjs";
import {
  ValidateScene, DecodeSceneHeights, EncodeSceneHeights, CropSceneHeights, SceneObjectToBlock, BlockoutDocFromScene,
} from "./Script_SceneDoc.mjs";
import { ValidateBlockoutScene } from "./Script_EditorBlockoutConfig.mjs";
import { BLOCKOUT_LEVELS, HeightGridSampler, LayoutFromSceneDoc } from "./Script_EditorBlockoutLevels.mjs";
import { PROJECT_DIR, ReadSceneSync, ReadBlockoutSceneDocSync, SceneFilePath } from "./Script_SceneNode.mjs";

let checks = 0;
const Check = (ok, what) => { assert.ok(ok, what); checks++; };

// --- 1. 场景文件 ---
const { doc: scene, heights } = ReadSceneSync("FirstLevelWhitebox");
const v = ValidateScene(scene);
Check(v.ok, `FirstLevelWhitebox 过校验：${v.errors.slice(0, 5).join("；")}`);
Check(heights.length === (scene.terrain.cols + 1) * (scene.terrain.rows + 1), "高度图格点数 = (cols+1)×(rows+1)");
Check(scene.objects.every(o => SCENE_ASSETS[o.asset]) && scene.objects.every(o => o.material === undefined || SCENE_MATERIALS[o.material]), "资产 / 材质编号都在目录里");
Check(Object.entries(SCENE_MATERIALS).filter(([id]) => id.startsWith("Whitebox/")).every(([id, m]) => WhiteboxMaterialFor(m.semantic) === id), "语义 ↔ 白盒材质一一对应");
// 正式场景的外观材质（Look/*，2026-11-01）：语义都有白盒对应（换回白盒有去处），外观在现行第一关的外观表里（水与隐形墙没有外观）
Check(Object.entries(SCENE_MATERIALS).filter(([id]) => id.startsWith("Look/"))
  .every(([, m]) => WhiteboxMaterialFor(m.semantic) && (m.look === null || WHITEBOX_LOOKS[m.look])), "Look/* 的语义有白盒对应、外观在 WHITEBOX_LOOKS 里");
Check(fs.readFileSync(SceneFilePath("FirstLevelWhitebox"), "utf8").indexOf("\r") < 0, "场景 JSON 是 LF");
for (const level of ["FirstLevel0105", "FirstLevel0610", "FirstLevel1218"]) {
  Check(!fs.existsSync(path.join(PROJECT_DIR, "Blockout", `${level}.scene.json`)), `旧的 Blockout/${level}.scene.json 不该再出现（以 Scenes/FirstLevelWhitebox 为准）`);
}

// --- 2. 高度图 ---
const sample = new Float32Array([0, 1.23, -4.56, 12.34, -0.01]);
const back = DecodeSceneHeights(EncodeSceneHeights(sample), { cols: 4, rows: 0 });
Check([...back].every((h, i) => Math.abs(h - sample[i]) < 0.0051), "高度图编解码往返（厘米）");
const region = { minX: -20, maxX: 40, minZ: 100, maxZ: 180 };
const crop = CropSceneHeights(scene.terrain, heights, region);
const whole = HeightGridSampler({ ...scene.terrain, heights }), part = HeightGridSampler({ ...crop.terrain, heights: crop.heights });
let worst = 0;
for (let x = region.minX; x <= region.maxX; x += 0.5) for (let z = region.minZ; z <= region.maxZ; z += 0.5) worst = Math.max(worst, Math.abs(whole(x, z) - part(x, z)));
Check(worst < 1e-6, `裁出来的高度图逐点等于整张（最大差 ${worst}）`);
Check(crop.terrain.minX === region.minX && crop.terrain.minZ === region.minZ, "裁的范围对齐到格点");

// --- 3. 物件 → 体块 ---
const box = { id: "T", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [1, 2, 150], yawDeg: 90, size: [2, 4, 6], noClimb: true, meta: { prop: "Desk" } };
const b1 = SceneObjectToBlock(box);
Check(b1.y === 4 && b1.w === 2 && b1.h === 4 && b1.d === 6 && Math.abs(b1.ry - Math.PI / 2) < 1e-12 && b1.semantic === "timber" && b1.noClimb && b1.prop === "Desk" && b1.solid, "指定高度：y = 底面 + h/2，角度换弧度，meta 摊开");
const b2 = SceneObjectToBlock({ ...box, pos: [1, null, 150], solid: false });
Check(!("y" in b2) && b2.solid === false, "y 为 null = 落地（不写 y）");
const tiny = {
  ...scene, objects: [
    { ...box, id: "Gone", hideOn: "A" }, { ...box, id: "Shown", showOn: "A" }, { ...box, id: "Later", showOn: "B" },
    { ...box, id: "Both", showOn: "A", hideOn: "B" }, { ...box, id: "Far", pos: [9999, null, 9999] },
  ],
};
const t1 = BlockoutDocFromScene(tiny, heights, { level: "Tiny", region, priorSignals: ["A"] });
const ids = (list) => (list || []).map(b => b.id).sort();
Check(JSON.stringify(ids(t1.blocks)) === JSON.stringify(["Shown"]), "priorSignals：showOn 已发生 → 常驻块；hideOn 已发生 → 不要；范围外的不要");
Check(JSON.stringify(ids(t1.gates)) === JSON.stringify(["Both", "Later"]) && t1.gates.find(g => g.id === "Both").signal === "B" && !t1.gates.find(g => g.id === "Both").appearSignal, "先出现后消失的块：出现的信号已发生 → 只剩消失信号");

// --- 4. 三段各自取一块 ---
const SIGNALS = {};
for (const level of ["FirstLevel0105", "FirstLevel0610", "FirstLevel1218"]) {
  const config = JSON.parse(fs.readFileSync(path.join(PROJECT_DIR, "Blockout", `${level}.json`), "utf8"));
  SIGNALS[level] = [...new Set(config.keyframes.flatMap(k => k.signals || []))].sort();
  const slice = ReadBlockoutSceneDocSync(level);
  const sv = ValidateBlockoutScene(slice);
  Check(sv.ok, `${level} 取出来的一块过白盒场景校验：${sv.errors.slice(0, 3).join("；")}`);
  const layout = LayoutFromSceneDoc(slice);
  Check(layout.blocks.length > 500 && layout.gates.length < 80 && layout.bounds.minX === slice.bounds.minX, `${level} 能建布局（${layout.blocks.length} 块、${layout.gates.length} 个随信号的块）`);
}
const spec = (key) => BLOCKOUT_LEVELS.find(l => l.key === key).scene;
// Stage0105Done：01–05 演完（KeepIn_* 隐形墙随它消失），关键帧里不写，只在后两段的 priorSignals 里
const DONE = "Stage0105Done";
Check(JSON.stringify([...spec("FirstLevel0610").priorSignals].sort()) === JSON.stringify([...SIGNALS.FirstLevel0105, DONE].sort()), "06–10 的 priorSignals = 01–05 出现过的全部信号 + Stage0105Done");
Check(JSON.stringify([...spec("FirstLevel1218").priorSignals].sort()) === JSON.stringify([...SIGNALS.FirstLevel0105, DONE, ...SIGNALS.FirstLevel0610].sort()), "11–18 的 priorSignals = 01–05 与 06–10 出现过的全部信号 + Stage0105Done");
Check(scene.objects.filter(o => /^KeepIn_/.test(o.id)).every(o => o.hideOn === DONE), "KeepIn_* 隐形墙都随 Stage0105Done 消失");
Check(!ReadBlockoutSceneDocSync("FirstLevel0610").blocks.some(b => /^KeepIn_/.test(b.id)), "06–10 那一块里没有 01–05 的 KeepIn 隐形墙");
{ const s0105 = ReadBlockoutSceneDocSync("FirstLevel0105");
  Check(s0105.blocks.filter(b => /^KeepIn_/.test(b.id)).length > 1000 && !(s0105.gates || []).some(g => /^KeepIn_/.test(g.id)), "01–05 那一块里 KeepIn 照旧是常驻块（futureSignals，不做成随信号的块）"); }
const t2 = BlockoutDocFromScene(tiny, heights, { level: "Tiny", region, futureSignals: ["A", "B"] });
Check(JSON.stringify(ids(t2.blocks)) === JSON.stringify(["Gone"]) && !(t2.gates || []).length, "futureSignals：hideOn 它的当常驻块，showOn 它的不要");
Check(spec("FirstLevel0105").priorSignals.length === 0, "01–05 没有 priorSignals");

console.log(`场景文件测试全过（${checks} 项）`);
