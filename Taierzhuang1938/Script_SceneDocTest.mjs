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
import { GridSampler } from "./Script_SceneTrenches.mjs";

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
// Route-side houses must have real empty apertures. A dark rectangle on a
// solid facade would still block both observation and player movement.
const rooms=scene.objects.filter(object=>object.meta?.hollow&&object.meta.openings);
Check(rooms.length>=35,"玩家沿途房屋有空心结构与门窗记录");
for(const room of rooms) {
  const {openings,floorY}=room.meta;
  Check(openings.some(opening=>opening.kind==="door"&&opening.width>=1&&opening.topH>=2),`${room.id} 有可通行的房门`);
  Check(openings.some(opening=>opening.kind==="window"&&opening.width>=0.7&&opening.sillH<=1.2),`${room.id} 有可观察的窗洞`);
  for(const opening of openings) for(const fraction of [0.15,0.5,0.85]) {
    const point=[opening.center[0],floorY+opening.sillH+(opening.topH-opening.sillH)*fraction,opening.center[2]];
    const blocked=scene.objects.some(object=>{
      if(object.solid===false||!object.size||!Number.isFinite(object.pos[1])) return false;
      const [x,y,z]=object.pos,[w,h,d]=object.size,yaw=(object.yawDeg||0)*Math.PI/180;
      const dx=point[0]-x,dz=point[2]-z;
      return point[1]>y+0.01&&point[1]<y+h-0.01&&Math.abs(dx*Math.cos(yaw)-dz*Math.sin(yaw))<w/2-0.01&&Math.abs(dx*Math.sin(yaw)+dz*Math.cos(yaw))<d/2-0.01;
    });
    Check(!blocked,`${opening.id} 的门窗开口为空`);
  }
}
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
  const ambushIds = ["AmbushNorthDefense", "AmbushRearDefense", "AmbushWestGun"];
  Check(plan && plan.segments.length === 50 && wb.trenches.segments.length === 50 && formal.doc.trenches.segments.length === 28,
    "白盒 50 段样条沟，含集结处西侧联络沟；正式场景 28 段");
  const assemblyLink = plan.segments.find(segment => segment.id === "AssemblyWestLink");
  const sampleAssembly = GridSampler(wb.terrain, carved);
  Check(assemblyLink && assemblyLink.nominal.floorW >= 3.8, "西邻班到集结处保留担架双向通行宽度");
  const assemblyObstacles = wb.objects.filter(object => object.solid !== false && object.pos && object.size);
  for (const station of assemblyLink.stations) {
    for (const offset of [-0.95, 0, 0.95]) {
      const x = station.x + station.nx * offset, z = station.z + station.nz * offset;
      const floor = sampleAssembly(x, z);
      const expected = -1 + 0.76 * Math.max(0, 1 - station.s / 14);
      Check(Math.abs(floor - expected) < 0.15, `联络沟全宽连续下到集结处：${station.s.toFixed(1)} m / ${offset} m`);
      for (const object of assemblyObstacles) {
        const bottom = object.pos[1] ?? sampleAssembly(object.pos[0], object.pos[2]);
        if (bottom >= floor + 1.85 || bottom + object.size[1] <= floor + 0.1) continue;
        const angle = (object.yawDeg || 0) * Math.PI / 180;
        const dx = x - object.pos[0], dz = z - object.pos[2];
        const localX = dx * Math.cos(angle) - dz * Math.sin(angle);
        const localZ = dx * Math.sin(angle) + dz * Math.cos(angle);
        Check(Math.hypot(Math.max(0, Math.abs(localX) - object.size[0] / 2), Math.max(0, Math.abs(localZ) - object.size[2] / 2)) > 0.35,
          `联络沟不被旧空气墙或工事堵住：${station.s.toFixed(1)} m / ${object.id}`);
      }
    }
  }
  const assemblyBridge = wb.objects.find(object => object.id === "AssemblyWestRoadBridge");
  Check(assemblyBridge.pos[1] - sampleAssembly(assemblyBridge.pos[0], assemblyBridge.pos[2]) > 2,
    "田路桥下站立净空大于 2 m");
  for (const side of [-1, 1]) {
    const angle = assemblyBridge.yawDeg * Math.PI / 180;
    const x = assemblyBridge.pos[0] + Math.sin(angle) * assemblyBridge.size[2] / 2 * side;
    const z = assemblyBridge.pos[2] + Math.cos(angle) * assemblyBridge.size[2] / 2 * side;
    Check(Math.abs(sampleAssembly(x, z) - assemblyBridge.pos[1] - assemblyBridge.size[1]) < 0.35,
      "田路桥两端落在实地，车道无断口");
  }
  Check(["LmAssemblyEntry", "LmAssemblyWestEntry", "LmAssemblySouthExit", "LmAssemblyEastBay"].every(id => wb.markers.some(marker => marker.id === id)),
    "本班入口、西邻班入口、南侧装运出口、东侧封闭待命湾职责明确");
  Check(campIds.every(id => wb.trenches.segments.some(segment => segment.id === id)), "集结处北侧两条、东侧一条阻击壕齐全");
  Check(formal.doc.trenches.segments.every(segment => wb.trenches.segments.some(entry => entry.id === segment.id)), "白盒保留原有 28 段壕沟身份");
  Check(formal.doc.trenches.segments.filter(segment => /^11/.test(segment.group || "")).every(segment =>
    JSON.stringify(segment) === JSON.stringify(wb.trenches.segments.find(entry => entry.id === segment.id))), "后段壕沟仍与原场景逐项一致");
  Check(ambushIds.every(id => wb.trenches.segments.some(segment => segment.id === id)), "弯口北侧阻击壕、侧袭出发壕、西侧机枪浅壕齐全");
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
  Check(segs("FirstLevel0105").length === 45 && JSON.stringify(segs("FirstLevel1218")) === JSON.stringify(["VillageNorthWest", "VillageNorthEast"]), "01–05 那一块带 45 段、11–18 那一块只带村北两段");
}

{
  const id = "DugoutAidOpenFields";
  const { doc, heights } = ReadSceneSync(id);
  const validation = ValidateScene(doc);
  Check(validation.ok, `${id} 场景与资产引用有效：${validation.errors.join("；")}`);
  const layout = LayoutFromSceneDoc(BlockoutDocFromScene(doc, heights, { level: id }));
  Check(layout.style === "formal" && layout.sceneProps.length === doc.objects.length, "独立正式场景的模型进入建场布局");
  Check(layout.proceduralDressing === false, "独立场景用自己布设的麦畦和碎石");
  assert.deepEqual(layout.camera, doc.camera, "场景机位透传到运行时");
  Check(!ValidateScene({ ...doc, camera: { ...doc.camera, nearFocusM: 0 } }).ok, "拒绝无效的近景焦距");
}

{
  const id = "GengjiazhuangFieldApproach";
  const { doc, heights } = ReadSceneSync(id);
  const layout = LayoutFromSceneDoc(BlockoutDocFromScene(doc, heights, { level: id }));
  Check(ValidateScene(doc).ok && layout.style === "formal", "耿家庄独立场景是可校验的正式场景");
  Check(!ValidateScene({ ...doc, camera: { ...doc.camera, fovDeg: 0 } }).ok, "拒绝无效的独立机位");
  Check(!ValidateScene({ ...doc, smokeColumns: [{ x: 0 }] }).ok, "拒绝未指定位置的局部烟源");
  assert.deepEqual(layout.camera, doc.camera);
  Check(layout.sceneProps.length === doc.objects.filter(obj => obj.asset.startsWith("Prop/")).length
    && layout.proceduralDressing === false, "独立场景使用自己布设的道具和植被");
  Check(layout.smokeColumns.length === 1 && layout.backdrop.shapes.every(shape => shape.kind === "hill"),
    "耿家庄保留屋后单烟源和远岗");
  const cart = layout.blocks.find(block => block.id === "CroppedLoadedCart");
  Check(cart.propAuthoredGrounding, "木车按指定沟底标高摆放");
  const [rut] = doc.paint.find(item => item.id === "FieldPathLeftRut").line.filter(point => point.z < -13);
  const layers = [0, 0, 0, 1];
  const color = layout.SampleGroundSurface(rut.x, rut.z, [1, 1, 1], layers);
  Check(layers[0] > 0.5 && color[0] > 1, "细土路的车辙权重和暖色倍率随场景载入");
}

{
  const id = "GengjiazhuangEastSmoke";
  const { doc, heights } = ReadSceneSync(id);
  const layout = LayoutFromSceneDoc(BlockoutDocFromScene(doc, heights, { level: id }));
  Check(ValidateScene(doc).ok && layout.style === "formal", "庄东烟景是可校验的独立正式场景");
  assert.deepEqual(layout.camera, doc.camera);
  Check(layout.sceneProps.length === doc.objects.length && layout.blocks.some(block =>
    block.id === "EvacuationCart" && block.propAuthoredGrounding), "木车、铺盖、院墙和田野道具保留作者布设");
  Check(layout.smokeColumns.filter(column => column.options.fire > 0).length === 1 &&
    layout.smokeColumns.some(column => column.options.backdrop?.driftX > 0),
    "庄东只有一处明火，烟沿画面右侧漂移");
  Check(["CartPallet", "RoadsideAid", "PackTrain"].every(id => doc.markers.some(marker => marker.id === id)),
    "车板、沟沿、远端驮队的留空位置被保存");
  Check(layout.terrainSampler(-1.2, -5.5) - layout.terrainSampler(4, -5.5) > .55,
    "凹路保留沟沿到车辙的高差");
}

{
  const id = "TanketteAdvanceEastTrack";
  const { doc, heights, pre, plan } = ReadSceneSync(id);
  const layout = LayoutFromSceneDoc(BlockoutDocFromScene(doc, heights, { level: id, trenchPlan: plan }));
  const ground = GridSampler(doc.terrain, heights);
  const uncut = GridSampler(doc.terrain, pre);
  const wounded = doc.markers.find(marker => marker.id === "WoundedPosition");
  const floor = ground(wounded.x, wounded.z);
  Check(ValidateScene(doc).ok && layout.style === "formal" && plan.segments[0].id === "EastTrackDitch",
    "东侧战车道作为正式场景加载可编辑撤离沟样条");
  Check(uncut(wounded.x, wounded.z) - floor > .45, "伤员地标位于实际挖出的下层沟底");
  const tanks = doc.objects.filter(obj => obj.asset === "Prop/type94Tankette");
  Check(tanks.length === 2 && tanks[0].pos[2] > tanks[1].pos[2] && tanks.every(({ pos: [x, y, z] }) =>
    y - floor > .60 && Math.abs(y - ground(x, z)) < .025 && Math.abs(y - uncut(x, z)) < .025),
    "两辆九四式以前后距离落在未挖过的上层车道");
  Check(layout.camera.fovDeg === doc.camera.fovDeg && layout.smokeColumns.length === 5
    && layout.landmarks.some(marker => marker.id === "RoadsideSoilBurst"),
    "固定机位、分层烟源与路缘扬土地标进入游戏布局");
}

{
  const id = "AircraftEvacuationDitch";
  const { doc, heights } = ReadSceneSync(id);
  const slice = BlockoutDocFromScene(doc, heights, { level: id });
  const layout = LayoutFromSceneDoc(slice);
  assert.deepEqual(layout.camera, doc.camera);
  Check(ValidateScene(doc).ok && ValidateBlockoutScene(slice).ok
    && layout.style === "formal", "沟底仰视三机可通过正式场景与游戏布局校验");
  const aircraft = layout.blocks.filter(block => block.propModel === "ditchDistantAircraft");
  Check(aircraft.length === 3 && aircraft.every(block => block.y > 100 && block.propAuthoredGrounding && !block.solid),
    "三架飞机保留编辑器标高，处于布局边界内且不生成碰撞");
  Check(layout.sceneProps.length === doc.objects.length && layout.smokeColumns.some(source => source.options.fire > 0)
    && slice.landmarks.length === 5, "沟底撤运道具、火源与五个站位完整进入预览");
}

console.log(`场景文件测试全过（${checks} 项）`);
