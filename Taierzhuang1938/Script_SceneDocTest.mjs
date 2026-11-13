// Script_SceneDocTest.mjs —— 场景文件（docs/Data_Scene.md）的 node 回归
// 跑法：node Taierzhuang1938/Script_SceneDocTest.mjs
// 查：FirstLevelWhitebox 过校验、资产 / 材质编号都在目录里、高度图字节数对得上；高度图编解码往返；按范围裁高度图逐点等于整张；
// 物件 → 体块（落地 / 指定高度 / 角度 / 信号）；priorSignals 的两种处理；三段各自取出来的一块过白盒场景校验、能建布局；
// 关卡注册表的 priorSignals 等于前面段落配置里出现过的全部信号；旧的三份 Blockout/*.scene.json 不许再出现。

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { SCENE_ASSETS, SCENE_MATERIALS, WhiteboxMaterialFor } from "./Data_SceneAssets.mjs";
import { SCENE_EVENTS } from "./Data_SceneEvents.mjs";
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
Check(Object.values(SCENE_MATERIALS).every(m => WhiteboxMaterialFor(m.semantic) && SCENE_MATERIALS[WhiteboxMaterialFor(m.semantic)] === m), "语义 ↔ 白盒材质一一对应");
Check(fs.readFileSync(SceneFilePath("FirstLevelWhitebox"), "utf8").indexOf("\r") < 0, "场景 JSON 是 LF");
// 两个场景（2026-11-01）：剧情事件都有中文名；物件都分了层级（段落 / 类别……），没有只差大小写的两个文件夹
for (const id of ["FirstLevelWhitebox", "FirstLevel"]) {
  const objects = ReadSceneSync(id).doc.objects;
  const events = [...new Set(objects.flatMap(o => [o.hideOn, o.showOn]).filter(Boolean))];
  Check(events.every(e => SCENE_EVENTS[e]), `${id}：剧情事件都在 Data_SceneEvents 里有名字：${events.filter(e => !SCENE_EVENTS[e]).join("、")}`);
  Check(objects.every(o => String(o.group || "").split("/").length >= 2), `${id}：每个物件的分组至少两层（段落 / 类别）`);
  const folders = [...new Set(objects.map(o => o.group))], lower = new Set(folders.map(f => f.toLowerCase()));
  Check(lower.size === folders.length, `${id}：没有只差大小写的文件夹`);
}
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
  // 随信号的块是一个一个单独的模型（不合批）：11–18 第四版七个剧情事件（炸桥两座、弹坑、空袭过后的席子……）共 115 个，上限放到 140
  Check(layout.blocks.length > 500 && layout.gates.length < 140 && layout.bounds.minX === slice.bounds.minX, `${level} 能建布局（${layout.blocks.length} 块、${layout.gates.length} 个随信号的块）`);
}
const spec = (key) => BLOCKOUT_LEVELS.find(l => l.key === key).scene;
// Stage0105Done：01–05 演完（KeepIn_* 空气墙随它消失），关键帧里不写，只在后两段的 priorSignals 里
const DONE = "Stage0105Done";
Check(JSON.stringify([...spec("FirstLevel0610").priorSignals].sort()) === JSON.stringify([...SIGNALS.FirstLevel0105, DONE].sort()), "06–10 的 priorSignals = 01–05 出现过的全部信号 + Stage0105Done");
Check(JSON.stringify([...spec("FirstLevel1218").priorSignals].sort()) === JSON.stringify([...SIGNALS.FirstLevel0105, DONE, ...SIGNALS.FirstLevel0610].sort()), "11–18 的 priorSignals = 01–05 与 06–10 出现过的全部信号 + Stage0105Done");
Check(scene.objects.filter(o => /^KeepIn_/.test(o.id)).every(o => o.hideOn === DONE), "KeepIn_* 空气墙都随 Stage0105Done 消失");
Check(!ReadBlockoutSceneDocSync("FirstLevel0610").blocks.some(b => /^KeepIn_/.test(b.id)), "06–10 那一块里没有 01–05 的 KeepIn 空气墙");
{ const s0105 = ReadBlockoutSceneDocSync("FirstLevel0105");
  Check(s0105.blocks.filter(b => /^KeepIn_/.test(b.id)).length > 1000 && !(s0105.gates || []).some(g => /^KeepIn_/.test(g.id)), "01–05 那一块里 KeepIn 照旧是常驻块（futureSignals，不做成随信号的块）"); }
const t2 = BlockoutDocFromScene(tiny, heights, { level: "Tiny", region, futureSignals: ["A", "B"] });
Check(JSON.stringify(ids(t2.blocks)) === JSON.stringify(["Gone"]) && !(t2.gates || []).length, "futureSignals：hideOn 它的当常驻块，showOn 它的不要");
Check(spec("FirstLevel0105").priorSignals.length === 0, "01–05 没有 priorSignals");

// --- 5. 场景壕沟（docs/Data_Scene.md §9）---
{
  const { doc: wb, heights: carved, pre, plan } = ReadSceneSync("FirstLevelWhitebox");
  const formal = ReadSceneSync("FirstLevel");
  const campIds = ["CampNorthWestDefense", "CampNorthCenterDefense", "CampEastDefense"];
  Check(plan && plan.segments.length === 31 && wb.trenches.segments.length === 31 && formal.doc.trenches.segments.length === 28,
    "白盒 31 段样条沟，含集结处新增三条阻击壕；正式场景 28 段");
  const sharedTrenches = {...wb.trenches, segments: wb.trenches.segments.filter(segment => !campIds.includes(segment.id))};
  Check(campIds.every(id => wb.trenches.segments.some(segment => segment.id === id)), "集结处北侧两条、东侧一条阻击壕齐全");
  Check(JSON.stringify(formal.doc.trenches).replace(/FirstLevel\.trench/g, "X") === JSON.stringify(sharedTrenches).replace(/FirstLevelWhitebox\.trench/g, "X"), "白盒与正式场景原有 28 段壕沟逐项一致");
  // 高度图是没挖的；现挖之后沟底在基准面下约一个沟深
  const t = wb.terrain, at = (h, x, z) => h[Math.round((z - t.minZ) / t.cellM) * (t.cols + 1) + Math.round((x - t.minX) / t.cellM)];
  const fm = plan.segments.find((s) => s.id === "FrontMid"), st = fm.stations[Math.floor(fm.stations.length / 2)];
  const floor = at(carved, st.x, st.z), ground = at(pre, st.x, st.z);
  Check(ground - floor > 1.6 && ground - floor < 2.3, `前沿中段沟底比没挖的地面低 1.6–2.3 m（实测 ${(ground - floor).toFixed(2)}）`);
  Check(carved !== pre && at(carved, 200, 400) === at(pre, 200, 400), "离沟远的地方挖前挖后一样");
  // 套餐：旧阵地是弃置旧沟、前沿 / 交通沟是裸土沟（不摆构件）、村北战壕是临时掘壕
  const look = (id) => wb.trenches.segments.find((s) => s.id === id).look;
  Check(look("OldSap") === "abandoned" && look("FrontMid") === "bare" && look("VillageNorthEast") === "scrape", "01–05 旧阵地 abandoned、前沿 bare、11–18 村北 scrape");
  Check(plan.segments.find((s) => s.id === "OldSap").details.roots.chance === 0.9 && !plan.segments.find((s) => s.id === "FrontMid").details.bays.on, "套餐解析到每段的细节（旧沟草根概率 0.9、裸土沟不摆射击位）");
  Check(wb.trenches.segments.find((s) => s.id === "Traffic").datumAlong?.length > 2 && wb.trenches.segments.find((s) => s.id === "OldSap").collapses?.length === 3,
    "交通沟坡道写成 datumAlong、旧交通沟三处塌方写成 collapses");
  // 校验认得出写错的细节
  const bad = JSON.parse(JSON.stringify(wb));
  bad.trenches.segments[0].details = { roots: { chance: 3 }, mystery: true };
  bad.trenches.segments[1].look = "shiny";
  const bv = ValidateScene(bad);
  Check(!bv.ok && bv.errors.some((e) => /roots\.chance 超出/.test(e)) && bv.errors.some((e) => /mystery 不认识/.test(e)) && bv.errors.some((e) => /look 要是/.test(e)), `校验报出细节写错：${bv.errors.slice(0, 3).join("；")}`);
  // 每一段只带自己范围里的沟
  const segs = (k) => ReadBlockoutSceneDocSync(k).trenchPlan?.segments.map((s) => s.id) || [];
  Check(segs("FirstLevel0105").length === 29 && JSON.stringify(segs("FirstLevel1218")) === JSON.stringify(["VillageNorthWest", "VillageNorthEast"]), "01–05 那一块带 29 段、11–18 那一块只带村北两段");
}

console.log(`场景文件测试全过（${checks} 项）`);
