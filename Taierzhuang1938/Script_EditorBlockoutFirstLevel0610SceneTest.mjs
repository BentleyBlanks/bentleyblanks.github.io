// Script_EditorBlockoutFirstLevel0610SceneTest.mjs —— 06–10 白盒场景生成器的 node 回归（只给场景包自验用）
// 跑法：node Taierzhuang1938/Script_EditorBlockoutFirstLevel0610SceneTest.mjs
// 查：生成两次逐字相同（generatedAt 固定）、过 ValidateBlockoutScene；与 0105 的北半截逐点接上（干沟沟底 / 坎顶 / 凹路口）；
// 凹路南段像沟（中段 ≥ 1.9 m 深、村口前约 1.2 m）；河汊子沟底宽约 6 m、深 ≥ 2.5 m、两壁陡；整村压平、窖深 2 m；
// 五条视线：侧门口看得见窖边的人（门关着看不见；门缝 / 墙缝里看得见窖口）、北窗顺主街看到村北口、石碾后顺东街看到东头；
// 狗洞大人钻不过；主街 / 东街净空、东街又直又长；随信号体块与五个信号齐全。

import assert from "node:assert/strict";
import { ValidateBlockoutScene } from "./Script_EditorBlockoutConfig.mjs";
import { HeightGridSampler } from "./Script_EditorBlockoutLevels.mjs";
import {
  BuildFirstLevel0610Scene, CompareWith0105, LaneDepthAt, RiverSectionAt, L0610SightChecks, BlockSight, BlockCenterY, SolidBlocks,
  RIVER_FLOOR_Y, CELLAR_FLOOR_Y,
} from "./Script_EditorBlockoutFirstLevel0610Scene.mjs";
import {
  L0610_PLACES as P, L0610_HEIGHTS as H, L0610_VILLAGE as V, L0610_GENG as G, L0610_STREETS as ST, L0610_SIGNALS as SIG, L0610_FROM_0105,
} from "./Data_EditorBlockoutFirstLevel0610Space.mjs";

const opts = { commit: "test", generatedAt: "2026-10-18T00:00:00.000Z" };
const a = await BuildFirstLevel0610Scene({ ...opts, notes: [] });
const b = await BuildFirstLevel0610Scene({ ...opts, notes: [] });
assert.equal(JSON.stringify(a), JSON.stringify(b), "生成两次要逐字相同");
const check = ValidateBlockoutScene(a);
assert.ok(check.ok, check.errors.join("; "));

const sample = HeightGridSampler(a.terrain);
const Near = (got, want, tol, what) => assert.ok(Math.abs(got - want) <= tol, `${what}: ${got.toFixed(2)} vs ${want}±${tol}`);

// --- 与 0105 接得上：干沟沟底、坎顶、凹路口都是 0105 的数；北半截抽样逐点一致 ---
const H0105 = L0610_FROM_0105.heights, G0105 = L0610_FROM_0105.gully;
Near(sample(P.assembly.x, P.assembly.z), H0105.assemblyFloor, 0.05, "干沟沟底");
Near(sample(P.assemblyEntry.x, P.assemblyEntry.z), H0105.assemblyFloor, 0.2, "交通沟坡道口");
Near(sample(P.laneHead.x, P.laneHead.z), H0105.assemblyFloor, 0.15, "凹路口接干沟沟底");
Near(sample(P.nierRim.x, P.nierRim.z) - sample(P.nierRim.x, P.nierRim.z + 5), H0105.gullyRim - H0105.assemblyFloor, 0.3, "妮儿蹲的北岸坎高");
for (const x of [20, 46, 55]) assert.ok(sample(x, G0105.northRimZ) - sample(x, G0105.northRimZ + 3) >= 2, `北岸坎不够陡 x${x}`);
const cmp = CompareWith0105(sample);
if (cmp) assert.ok(cmp.worst <= 0.02, `与 0105 场景文件在北半截不一致：最大差 ${cmp.worst} m（(${cmp.at.x},${cmp.at.z})）`);
else console.log("提示：没有 Blockout/FirstLevel0105.scene.json，跳过接缝比对");

// --- 凹路：像沟 ---
for (const [z, min, max] of [[199, 1.2, 1.7], [230, 1.6, 2.6], [260, 2.2, 3.0], [300, 1.9, 2.8], [340, 1.5, 2.3], [370, 1.0, 1.5]]) {
  const r = LaneDepthAt(sample, z);
  assert.ok(r.depth >= min && r.depth <= max, `凹路 z${z} 深 ${r.depth}（要 ${min}…${max}）`);
}
Near(sample(P.villageMouth.x, P.villageMouth.z), V.y - V.streetLowerM, 0.15, "村北口与村里地面齐");
assert.ok(sample(P.laneEnd.x, P.laneEnd.z) < V.y - 0.2, "凹路尽头 (100,380) 还在坡道里（比村里地面低）");

// --- 河汊子 ---
for (const z of [215, 260, 400, 500]) {
  const r = RiverSectionAt(sample, z);
  Near(r.floor, RIVER_FLOOR_Y, 0.05, `河汊子 z${z} 沟底`);
  assert.ok(Math.min(r.west, r.east) - r.floor >= 2.5, `河汊子 z${z} 不够深：${(Math.min(r.west, r.east) - r.floor).toFixed(2)}`);
  assert.ok(r.floorW >= 5.5 && r.floorW <= 7.5, `河汊子 z${z} 沟底宽 ${r.floorW}（要约 6 m）`);
  assert.ok(sample(16 - 3, z) - sample(16, z) >= 2.0, `河汊子 z${z} 西壁不够陡`);
}
assert.ok(a.blocks.filter((x) => x.semantic === "water").every((x) => x.solid === false && x.x === 19), "沟底水块：不实心、在中线上");

// --- 村子：整村压平、街面略低、窖深 ---
for (const [x, z] of [[70, 420], [125, 430], [100, 494], [160, 480], [200, 450], [80, 530]]) Near(sample(x, z), V.y, 0.08, `村里地面 (${x},${z})`);
for (const [x, z] of [[100, 420], [180, 465], [58.75, 440], [98, 530]]) Near(sample(x, z), V.y - V.streetLowerM, 0.06, `街面 (${x},${z})`);
Near(sample(P.cellar.x, P.cellar.z), CELLAR_FLOOR_Y, 0.08, "窖底");
Near(sample(100, 494) - sample(P.cellar.x, P.cellar.z), H.cellarDepth, 0.1, "窖深");

// --- 体块 ---
const all = [...a.blocks, ...a.gates];
const byId = new Map(all.map((x) => [x.id, x]));
assert.equal(byId.size, all.length, "块 id 全关唯一");
assert.ok(a.gates.every((g) => g.signal || g.appearSignal));
const signals = new Set(a.gates.flatMap((g) => [g.signal, g.appearSignal]).filter(Boolean));
for (const s of Object.values(SIG)) assert.ok(signals.has(s), `随信号体块缺信号 ${s}`);
assert.equal(byId.get("SideGateLeaf").signal, SIG.sideGateOpen);
assert.equal(byId.get("SideGateLeafOpen").appearSignal, SIG.sideGateOpen);
assert.equal(byId.get("CellarLid").signal, SIG.cellarBlast);
assert.equal(byId.get("CellarSmoke").appearSignal, SIG.cellarBlast);
assert.equal(byId.get("GengWindowMg").signal, SIG.mgSilenced);
assert.equal(byId.get("RollerMg").appearSignal, SIG.mgSilenced);
assert.equal(byId.get("BackVat").signal, SIG.backDoorOpen);
assert.equal(byId.get("BackDoorLeaf").signal, SIG.backDoorOpen);
assert.ok(all.filter((x) => x.signal === SIG.cartDeparted).length >= 2, "车上至少两箱弹药随 CartDeparted 收掉");
// 老耿家：前屋平顶 3.5 m 高、房顶北女墙、北窗窗台 0.9 / 窗洞到 2.0、大门过道 ≥ 2.4 m 宽
const gy = sample(100, 488);
const roof = byId.get("GengFrontRoof");
Near(BlockCenterY(roof, sample) + roof.h / 2, gy + G.frontRoom.roofH, 0.1, "前屋平顶高");
assert.ok(byId.get("GengRoofParapetNorth").y - byId.get("GengRoofParapetNorth").h / 2 >= gy + G.frontRoom.roofH - 0.05, "北女墙在房顶上");
Near(byId.get("GengWindowSill").h, G.window.sillH, 0.01, "窗台高");
const wl = byId.get("GengWindowLintel");
Near(BlockCenterY(wl, sample) - wl.h / 2, gy + G.window.topH, 0.1, "窗洞顶");
assert.ok(G.carriageGate.maxX - G.carriageGate.minX >= 2.4, "大门过道 ≥ 2.4 m（驴车要进后院）");
for (const id of ["KitchenRoof", "SideRoomRoof", "MillStone", "Roller", "CellarRimNorth", "GengHaystack", "OverturnedCart_S1", "NeighborHouse"]) assert.ok(byId.has(id), `缺体块 ${id}`);
assert.ok(all.filter((x) => /^DeadTree_/.test(x.id)).length === L0610_FROM_0105.gullyTrees.length, "干沟南岸的枯树照 0105 的表");

// --- 狗洞大人钻不过：口子 ≤ 0.5 宽、过梁下沿 ≤ 0.5 高 ---
const shared = a.blocks.filter((x) => x.id.startsWith("SharedWall_")).sort((p, q) => p.z - q.z);
const gaps = shared.slice(1).map((r, i) => ({ from: shared[i].z + shared[i].d / 2, to: r.z - r.d / 2 })).map((g) => ({ ...g, w: g.to - g.from }));
const hole = gaps.find((g) => Math.abs((g.from + g.to) / 2 - G.dogHole.z) < 0.3);
assert.ok(hole && hole.w <= 0.5 && hole.w >= 0.4, `狗洞宽 ${hole?.w}（要 0.4…0.5：大人钻不过、小孩钻得过）`);
const lintel = byId.get("DogHoleLintel");
assert.ok(BlockCenterY(lintel, sample) - lintel.h / 2 - sample(G.sharedWall.x, G.dogHole.z) <= 0.5, "狗洞过梁下沿 ≤ 0.5 m");
const crack = gaps.find((g) => Math.abs((g.from + g.to) / 2 - G.crack.z) < 0.3);
assert.ok(crack && crack.w <= 0.25, `墙缝 ${crack?.w} m（一指宽）`);
const gate = gaps.find((g) => Math.abs((g.from + g.to) / 2 - G.sideGate.z) < 0.3);
assert.ok(gate && gate.w >= 0.95, `侧门洞 ${gate?.w} m`);

// --- 视线 ---
const s = L0610SightChecks(a, sample);
assert.equal(s.sideGateToCellar.block, null, `侧门口看不见窖边的人：被 ${s.sideGateToCellar.block} 挡`);
assert.ok(s.sideGateToCellar.ground <= 0, "侧门口到窖边的人地面不挡");
assert.equal(s.gateClosedBlocks, "SideGateLeaf", "门关着时门扇要挡住");
assert.equal(s.throughGateCrack, null, `门缝里要看得见窖口：被 ${s.throughGateCrack} 挡`);
assert.equal(s.throughCrack, null, `墙缝里要看得见窖口：被 ${s.throughCrack} 挡`);
assert.equal(s.windowToMouth, null, `北窗顺着主街要看到村北口：被 ${s.windowToMouth} 挡`);
assert.equal(s.mouthToWindow, null, `村口要看得见北窗：被 ${s.mouthToWindow} 挡`);
assert.equal(s.rollerToEast, null, `石碾后要顺着东街看到东头：被 ${s.rollerToEast} 挡`);
assert.ok(s.rollerGround <= 0, "石碾后到东头地面不挡");
// 门缝视线用来凑数的眼位必须在门外（x < 墙）
assert.ok(s.eyes.gateCrack.x < G.sharedWall.x - 0.5 && s.eyes.crack.x < G.sharedWall.x - 0.5);

// --- 街：东街又窄又直、净空 3.5；主街净空 6（翻倒的大车是故意摆的） ---
const solids = SolidBlocks(a, []);
const Intersects = (blk, box) => {
  const hw = blk.w / 2, hd = blk.d / 2; // 街墙 / 房子都不转
  return blk.x + hw > box.minX && blk.x - hw < box.maxX && blk.z + hd > box.minZ && blk.z - hd < box.maxZ;
};
const eastStrip = { minX: ST.east.fromX + 0.5, maxX: ST.east.toX - 0.5, minZ: ST.east.z - ST.east.halfW, maxZ: ST.east.z + ST.east.halfW };
const eastHits = solids.filter((blk) => !blk.prop && Intersects(blk, eastStrip));
assert.deepEqual(eastHits.map((x) => x.id), [], "东街 3.5 m 净空里不能有墙 / 房子");
const eastWalls = solids.filter((x) => /^EastStreet(North|South)Wall/.test(x.id));
assert.ok(eastWalls.length >= 8 && eastWalls.every((x) => Math.abs(x.z - (ST.east.z - ST.east.halfW - 0.25)) < 0.01 || Math.abs(x.z - (ST.east.z + ST.east.halfW + 0.25)) < 0.01), "东街两边的墙在一条直线上");
assert.ok(ST.east.toX - ST.east.fromX >= 100, "东街长 ≥ 100 m");
const mainStrip = { minX: ST.main.x - ST.main.halfW + 0.3, maxX: ST.main.x + ST.main.halfW - 0.3, minZ: ST.main.fromZ + 1, maxZ: ST.square.box.minZ - 1 };
const mainHits = solids.filter((blk) => !blk.prop && Intersects(blk, mainStrip));
assert.deepEqual(mainHits.map((x) => x.id), [], "主街 6 m 净空里不能有墙 / 房子");
// 村口（蹲着 1.2）→ 北窗里的机枪手（1.0）这条线上只能有石碾以外的摆件挡；翻倒的大车在主街东半边，不挡
assert.equal(BlockSight(solids, sample, { x: 100, z: 385, eye: 1.2 }, { x: G.mgPost.x, z: G.mgPost.z, eye: 1.0 }), null, "村口到北窗的视线被摆件挡了");

console.log(`ok：${a.blocks.length} 块 + ${a.gates.length} 随信号块，${a.terrain.cols}×${a.terrain.rows} 网格；与 0105 接缝最大差 ${cmp ? cmp.worst : "—"} m；`
  + `凹路 z260 深 ${LaneDepthAt(sample, 260).depth} m、z370 深 ${LaneDepthAt(sample, 370).depth} m；河汊子 z400 底 ${RiverSectionAt(sample, 400).floor} 宽 ${RiverSectionAt(sample, 400).floorW} m；狗洞 ${hole.w} m`);
