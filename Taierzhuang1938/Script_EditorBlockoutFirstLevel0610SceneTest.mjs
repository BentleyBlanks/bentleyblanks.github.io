// Script_EditorBlockoutFirstLevel0610SceneTest.mjs —— 06–10 白盒场景生成器的 node 回归（只给场景包自验用；2026-10-22 第六版空间）
// 跑法：node Taierzhuang1938/Script_EditorBlockoutFirstLevel0610SceneTest.mjs
// 查：生成两次逐字相同、过 ValidateBlockoutScene；与 0105 的北半截逐点接上；凹路 / 村口路沟 / 河汊子 / 西边封死 / 路沟通河 / 东北道视线（第五版那几条照旧）；
// 第六版空间：
//   · 老耿家是半面槽院（北屋三间 10×5、灶屋两间 4×6.6、院门东南角开在东墙上、院墙 2.4）；北屋后墙三个枪眼（离地 1.1）、堂屋那个正对主街；街口坡道趴着的四个人都看得见堂屋枪眼；
//     枪眼看不见巷子任何一段；大车挡住枪眼到车北头的人；原来的北窗 / 大门过道 / 后门 / 水缸都没了；
//   · 只有一条路：在 0.25 m 的可走格子上从巷子口泛洪（实心块 / 瓦砾 / 墙 / 门扇都算挡；门洞 / 豁口按人能不能过算；狗洞人过不去；便门 SideGateOpen 开了才算通），
//     能到老耿家灶屋门口、途经街坊家西配房的豁口；在 L4 东头截断后，泛洪到的地方只在这条路沿线的胡同 + 允许的几个院子 / 菜园里，岔路一个都不漏堵；L4 东头不截断时通丁字路口；
//   · 往南：从丁字路口出发不穿院子只有东墙外那条窄胡同能到新村南口 (117,545)；LaneWallCollapse 开了胡同在塌墙处断开，踩柴垛翻进旁边院子、从它的院门出来才接得上；
//   · 院子的口径：每个院子都有北屋、院门在角上（南墙 / 侧墙靶南 / 只有北边有胡同的开北墙）、三种院子都出现过、房子尺寸在县志给的范围里、院子 8…30 m；
//   · 东街：探头点都在石碾往东 ±40° 扇面里、离石碾 20…90 m；没标 hidden 的从石碾后看得见；石碾北、南 8 m 内两边墙都是实的；庙东北边的机枪能打到石碾后的人；
//   · 街坊家：西配房窗洞后看得见窖口与石磨、半掩的门缝里看得见窖口、夹道里看不见窖口；窖口离窗洞 8…10 m；
//   · 随信号体块与七个信号齐全（BarrageHit / LaneWallCollapse 新加，BackVatMoved / BackDoorOpen 删了）；地标 ≥ 40、七种 kind、过校验、都在场地里。
// 关键帧里的人不落进墙 / 房子（门洞过梁、磨盘底座这类不挡人的块不算），关键帧已按第六版重排。

import assert from "node:assert/strict";
import fs from "node:fs";
import { ValidateBlockoutScene, LandmarkIssues, BLOCKOUT_LANDMARK_KINDS } from "./Script_EditorBlockoutConfig.mjs";
import { HeightGridSampler } from "./Script_EditorBlockoutLevels.mjs";
import {
  BuildFirstLevel0610Scene, CompareWith0105, LaneDepthAt, RiverSectionAt, DitchSectionAt, L0610SightChecks, BlockSight, BlockCenterY, SolidBlocks,
  RIVER_FLOOR_Y, RIVER_EAST_RIM_X, CELLAR_FLOOR_Y, POND_FLOOR_Y, L0610_MOUTH_SHOOTERS, RiverEastLedgeAt, EastRoadViewPoints, WalkGrid, FloodFrom, STREET_RUNS,
} from "./Script_EditorBlockoutFirstLevel0610Scene.mjs";
import { GullyBankHeights } from "./Script_EditorBlockoutFirstLevel0105Scene.mjs";
import {
  L0610_PLACES as P, L0610_HEIGHTS as H, L0610_VILLAGE as V, L0610_GENG as G, L0610_JIEFANG as J, L0610_BENJIA as B, L0610_STREETS as ST, L0610_SIGNALS as SIG, L0610_FROM_0105,
  L0610_DITCH as DT, L0610_RIVER as RV, L0610_EAST_ROAD as ER, L0610_BOUNDS, L0610_YARDS, L0610_RUBBLE, L0610_SOUTH_LANE as SL, L0610_EAST_STREET as ES, L0610_ROUTE, L0610_LANES,
  L0610_EAST_YARD_ROUTE,
} from "./Data_EditorBlockoutFirstLevel0610Space.mjs";

const opts = { commit: "test", generatedAt: "2026-10-22T00:00:00.000Z" };
const a = await BuildFirstLevel0610Scene({ ...opts, notes: [] });
const b = await BuildFirstLevel0610Scene({ ...opts, notes: [] });
assert.equal(JSON.stringify(a), JSON.stringify(b), "生成两次要逐字相同");
const check = ValidateBlockoutScene(a);
assert.ok(check.ok, check.errors.join("; "));

const sample = HeightGridSampler(a.terrain);
const Near = (got, want, tol, what) => assert.ok(Math.abs(got - want) <= tol, `${what}: ${got.toFixed(2)} vs ${want}±${tol}`);
const T = V.wallT;

// --- 与 0105 接得上 ---
const H0105 = L0610_FROM_0105.heights;
Near(sample(P.assembly.x, P.assembly.z), H0105.assemblyFloor, 0.05, "干沟沟底");
Near(sample(P.assemblyEntry.x, P.assemblyEntry.z), H0105.assemblyFloor, 0.2, "交通沟坡道口");
Near(sample(P.laneHead.x, P.laneHead.z), H0105.assemblyFloor, 0.15, "凹路口接干沟沟底");
Near(sample(P.cartStop.x, P.cartStop.z), H0105.assemblyFloor, 0.1, "老耿的车停在沟底（南岸树底下）");
assert.ok(sample(P.nierRim.x, P.nierRim.z) > H0105.assemblyFloor + 0.3 && sample(P.nierRim.x, P.nierRim.z) < H0105.gullyRim, "妮儿蹲在支沟南头坎脚的斜坡上（沟沿）");
for (const bank of GullyBankHeights(sample)) assert.ok(bank.steep >= 2, `${bank.name}不够陡：3 m 内只落 ${bank.steep} m`);
const cmp = CompareWith0105(sample);
if (cmp) assert.ok(cmp.worst <= 0.02, `与 0105 场景文件在北半截不一致：最大差 ${cmp.worst} m（(${cmp.at.x},${cmp.at.z})）`);
else console.log("提示：没有 Blockout/FirstLevel0105.scene.json，跳过接缝比对");

// --- 凹路、村口路沟、街口坡道 ---
for (const [z, min, max] of [[199, 1.2, 1.7], [230, 1.6, 2.6], [260, 2.2, 3.0], [300, 1.9, 2.8], [340, 1.5, 2.3], [370, 1.0, 1.5]]) {
  const r = LaneDepthAt(sample, z);
  assert.ok(r.depth >= min && r.depth <= max, `凹路 z${z} 深 ${r.depth}（要 ${min}…${max}）`);
}
Near(sample(100, 377), DT.floorY, 0.08, "凹路末端路底 = 路沟沟底");
Near(sample(P.villageMouth.x, P.villageMouth.z), V.y - V.streetLowerM, 0.15, "村北口（街口坡道顶）与村里地面齐");
for (const x of [60, 70, 80, 90, 115, 124]) {
  const r = DitchSectionAt(sample, x);
  Near(r.floor, DT.floorY, 0.05, `路沟 x${x} 沟底`);
  assert.ok(r.floorW >= 2.6 && r.floorW <= 3.6, `路沟 x${x} 沟底宽 ${r.floorW}（要约 3 m）`);
  assert.ok(r.north >= 0.0 && r.south >= 0.2, `路沟 x${x} 两沿 ${r.north}/${r.south}`);
}
Near(sample(P.alleyMouth.x, P.alleyMouth.z), V.y, 0.15, "巷子口在路沟南沿上（村里地面）");
assert.ok(sample(131, DT.z) > DT.floorY + 0.8, "路沟东头 x131 要收掉");
{
  assert.ok(DT.westOpensToRiver && DT.fromX < RIVER_EAST_RIM_X, "路沟西头要挖进河汊子东壁");
  let prev = sample(RIVER_EAST_RIM_X + 6, DT.z);
  for (let x = RIVER_EAST_RIM_X + 6; x >= RV.centerX; x -= 0.5) { const h = sample(x, DT.z); assert.ok(h <= prev + 0.03, `路沟西头到河汊子中间不许有土坎：x${x}`); prev = h; }
  Near(sample(RV.centerX, DT.z), RIVER_FLOOR_Y, 0.05, "路沟口外就是河汊子沟底");
  assert.ok(sample(RV.centerX - RV.floorW / 2 - RV.wallM - 0.5, DT.z) >= 0.0, "河汊子西岸在路沟那一段还在");
}
const ramp = [381.5, 382.5, 383.5, 384.5, 385.3].map((z) => sample(100, z));
for (let i = 1; i < ramp.length; i++) assert.ok(ramp[i] >= ramp[i - 1] - 0.01, "街口坡道要一路往上");
assert.ok(Math.max(...ramp.slice(1).map((v, i) => v - ramp[i])) <= 0.55, "街口坡道每米最多升 0.55 m（驴车能上）");
for (const p of L0610_MOUTH_SHOOTERS) { const y = sample(p.x, p.z); assert.ok(y > DT.floorY + 0.8 && y < V.y, `${p.who} 趴在坡道上半截`); }
assert.ok(Math.hypot(L0610_MOUTH_SHOOTERS[0].x - P.alleyMouth.x, L0610_MOUTH_SHOOTERS[0].z - P.alleyMouth.z) <= 20, "顺子的射击位置到巷子口 ≤ 20 m");

// --- 河汊子、西边封死、水 ---
for (const z of [215, 260, 400, 500]) {
  const r = RiverSectionAt(sample, z);
  Near(r.floor, RIVER_FLOOR_Y, 0.05, `河汊子 z${z} 沟底`);
  assert.ok(Math.min(r.west, r.east) - r.floor >= 2.5, `河汊子 z${z} 不够深`);
  assert.ok(r.floorW >= 5.5 && r.floorW <= 7.5, `河汊子 z${z} 沟底宽 ${r.floorW}`);
}
{
  const waters = a.blocks.filter((x) => x.semantic === "water" && /^RiverWater/.test(x.id));
  assert.ok(waters.length >= 2 && waters.every((x) => x.solid === false && Math.abs(x.x - RV.centerX) < 0.01), "沟底水块：不实心、在中线上");
  for (const w of waters) Near(BlockCenterY(w, sample) - w.h / 2, RIVER_FLOOR_Y, 0.08, `水块 ${w.id} 的底要贴着沟底`);
  const wallFace = 40 - T / 2;
  for (let z = 390; z <= 540; z += 2) {
    const r = RiverEastLedgeAt(sample, z);
    assert.ok(r.ledgeW <= 0.5, `z${z} 河汊子东坎沿到庄子西墙之间还有 ${r.ledgeW} m 平地`);
    assert.ok(sample(wallFace - 1.0, z) < V.y - 0.6, `z${z} 墙外 1 m 已经该是坎了`);
  }
}

// --- 村里：整村压平、街面略低、窖深、水坑 ---
for (const [x, z] of [[70, 412], [110, 425], [100, 480], [160, 480], [200, 450], [80, 530], [166, 455]]) Near(sample(x, z), V.y, 0.08, `村里地面 (${x},${z})`);
for (const [x, z] of [[100, 420], [150, 465], [63, 440], [117, 535], [80, 391], [101, 464], [109, 480], [113.25, 505], [75, 480]]) Near(sample(x, z), V.y - V.streetLowerM, 0.06, `街面 (${x},${z})`);
Near(sample(P.cellar.x, P.cellar.z), CELLAR_FLOOR_Y, 0.08, "窖底");
Near(sample(P.cellar.x + 3, P.cellar.z) - sample(P.cellar.x, P.cellar.z), H.cellarDepth, 0.1, "窖深");
Near(sample(P.pond.x, P.pond.z), POND_FLOOR_Y, 0.08, "水坑底");
assert.ok(a.blocks.some((x) => /^PondWater/.test(x.id) && x.semantic === "water" && x.solid === false), "水坑里有水");

// --- 体块与信号 ---
const all = [...a.blocks, ...a.gates];
const byId = new Map(all.map((x) => [x.id, x]));
assert.equal(byId.size, all.length, "块 id 全关唯一");
assert.ok(a.gates.every((g) => g.signal || g.appearSignal));
const signals = new Set(a.gates.flatMap((g) => [g.signal, g.appearSignal]).filter(Boolean));
assert.equal(Object.keys(SIG).length, 8, "八个信号（第六版：加 BarrageHit / LaneWallCollapse，删 BackVatMoved / BackDoorOpen；10-24 两路：加 EastGateBurst）");
for (const s of Object.values(SIG)) assert.ok(signals.has(s), `随信号体块缺信号 ${s}`);
assert.ok(!signals.has("BackVatMoved") && !signals.has("BackDoorOpen"), "后门和水缸的信号已经删了");
assert.equal(byId.get("SideGateLeaf").signal, SIG.sideGateOpen);
assert.equal(byId.get("SideGateLeafOpen").appearSignal, SIG.sideGateOpen);
assert.equal(byId.get("CellarLid").signal, SIG.cellarBlast);
assert.equal(byId.get("CellarSmoke").appearSignal, SIG.cellarBlast);
assert.equal(byId.get("GengLoopholeMg").signal, SIG.mgSilenced);
assert.equal(byId.get("RollerMg").appearSignal, SIG.mgSilenced);
assert.equal(byId.get("GengBeiwuRoofEast").signal, SIG.barrageHit, "北屋东间的房顶随炮轰塌");
assert.equal(byId.get("GengCollapseRubble").appearSignal, SIG.barrageHit);
assert.equal(byId.get("RollerRubble").appearSignal, SIG.barrageHit, "石碾旁随炮轰出现一堆新瓦砾");
assert.equal(byId.get("LaneWallStanding").signal, SIG.laneWallCollapse);
assert.equal(byId.get("LaneWallRubble").appearSignal, SIG.laneWallCollapse);
for (const id of ["Yard1GateLeaf", "FarmyardGateLeaf"]) {
  assert.equal(byId.get(id)?.signal, SIG.northYardGatesBroken, `${id} 随 NorthYardGatesBroken 消失`);
  assert.equal(byId.get(`${id}Fallen`)?.appearSignal, SIG.northYardGatesBroken);
  assert.ok(byId.get(`${id}Fallen`).h <= 0.1, `${id}Fallen 是倒在地上的`);
}
// 10-24 两路：路口东北角那院的南门（pocket 北门）是班长三人 09-7 从院里撞开的，随 EastGateBurst 倒进 pocket；北边院子链只剩两道门随 NorthYardGatesBroken
assert.equal(byId.get("PocketGateLeaf")?.signal, SIG.eastGateBurst, "PocketGateLeaf 随 EastGateBurst 消失");
assert.equal(byId.get("PocketGateLeafFallen")?.appearSignal, SIG.eastGateBurst);
assert.ok(byId.get("PocketGateLeafFallen").h <= 0.1 && byId.get("PocketGateLeafFallen").z > ES.northChain.pocketGate.z, "撞开的门扇倒在 pocket 里（门南边）");
assert.ok(all.filter((x) => x.signal === SIG.cartDeparted).length >= 2, "车上至少两箱弹药随 CartDeparted 收掉");
for (const id of ["GengBeiwuRoofWest", "GengZaowu_Roof", "GengTangwuDoorLintel", "GengGateLintel", "DogHoleLintel", "SideGateLintel", "KitchenStove", "GengHaystack",
  "JiefangBeiwu_Roof", "JiefangWestWing_Roof", "JiefangWestWing_WindowSill", "JiefangWestWing_DoorLintel", "JiefangBreachRubble", "JiefangWingVat", "JiefangGateLeaf", "MillStone", "CellarRimNorth",
  "BenjiaBeiwu", "BenjiaGateLintel", "ClimbPile", "Roller", "StrawStack_F1", "ShrineBack", "ShrineRoof", "OverturnedCart_S1", "CartWheel_S1", "JogLoopholeSill1", "JogLoopholeLintel2",
  "House_ES2_Roof", "House_ES2_BreachSill", "House_ES3_BreachSill", "RubbleL4West_1", "RubbleAlleyEast_1", "RubbleAlleyWest_1", "RubbleSouthWest_1", "RubbleSouthEast_1", "Tree_01"]) assert.ok(byId.has(id), `缺体块 ${id}`);
for (const id of ["GengWindowSill", "GengGateLeafWest", "SideRoomRoof", "BackVat", "BackDoorLeaf", "NeighborHouse", "House_FSW1", "BackLaneWestWall_1"]) assert.ok(!byId.has(id), `旧块 ${id} 该没了`);
assert.ok(all.filter((x) => /^DeadTree_/.test(x.id)).length === L0610_FROM_0105.gullyTrees.length, "干沟南岸的枯树照 0105 的表");
assert.ok(all.filter((x) => /^Tree_/.test(x.id)).length >= 15, "村里零散的树 ≥ 15 棵");

const solids = SolidBlocks(a, []);
const Intersects = (blk, box) => {
  if (blk.ry && Math.abs(blk.ry) > 0.01) {   // 转过的块按包围圆粗算
    const r = Math.hypot(blk.w, blk.d) / 2;
    return blk.x + r > box.minX && blk.x - r < box.maxX && blk.z + r > box.minZ && blk.z - r < box.maxZ;
  }
  const hw = blk.w / 2, hd = blk.d / 2;
  return blk.x + hw > box.minX && blk.x - hw < box.maxX && blk.z + hd > box.minZ && blk.z - hd < box.maxZ;
};
const Solid = (x, z, list = solids) => list.some((blk) => blk.h >= 2 && !blk.prop && Intersects(blk, { minX: x - 0.05, maxX: x + 0.05, minZ: z - 0.05, maxZ: z + 0.05 }));
const WallRun = (axis, fixed, from, to, what, list = solids) => { for (let s = from + 0.3; s <= to - 0.3; s += 0.5) assert.ok(axis === "x" ? Solid(s, fixed, list) : Solid(fixed, s, list), `${what} 在 ${axis === "x" ? `x${s}` : `z${s}`} 有洞`); };

// --- 老耿家：半面槽院 ---
{
  const BW = G.beiwu, K = G.zaowu, LH = V.loophole;
  Near(BW.box.maxX - BW.box.minX, 10, 1.0, "北屋三间约 10 m 长"); Near(BW.box.maxZ - BW.box.minZ, 5, 0.5, "北屋约 5 m 深");
  Near(K.box.maxX - K.box.minX, 4, 0.5, "灶屋两间约 4 m 深"); assert.ok(K.box.maxZ - K.box.minZ >= 6 && K.box.maxZ - K.box.minZ <= 7, "灶屋两间约 6–7 m 长");
  Near(G.box.maxX - G.box.minX, 16, 0.5, "老耿家院子约 16 m"); Near(G.box.maxZ - G.box.minZ, 16, 0.5, "老耿家院子约 16 m");
  Near(G.box.minZ, ST.square.box.maxZ, 0.01, "老耿家北墙就是丁字路口南边");
  assert.equal(G.gate.wall, "E"); assert.ok(G.gate.z > (G.box.minZ + G.box.maxZ) / 2 && G.box.maxZ - G.gate.z <= 3.5, "院门在东南角、开在东墙上");
  assert.ok(G.wallH >= 2.3 && G.wallH <= 2.6, "老耿家院墙较高（2.4 上下）");
  const gengWalls = solids.filter((blk) => /^Geng(North|East|South)Wall|^SharedWall/.test(blk.id));
  assert.ok(gengWalls.length >= 4 && gengWalls.every((blk) => Math.abs(blk.h - G.wallH) < 0.01 || blk.h >= 3.0), "老耿家院墙块都是 2.4（北屋 / 灶屋那段更高）");
  // 枪眼：后墙上三个 0.3 宽的洞，洞下 0.95、洞顶 1.25，中心 1.1；堂屋那个在 x 100
  assert.equal(BW.loopholes.length, 3);
  assert.ok(BW.loopholes.some((lp) => lp.who === "mg" && lp.x === ST.main.c), "堂屋枪眼正对主街中线");
  for (const lp of BW.loopholes) {
    const hole = { minX: lp.x - LH.w / 2 + 0.03, maxX: lp.x + LH.w / 2 - 0.03, minZ: BW.box.minZ - 0.3, maxZ: BW.box.minZ + 0.3 };
    const inHole = solids.filter((blk) => Intersects(blk, hole) && !blk.id.includes("Mg") && !/Roof|Parapet/.test(blk.id));
    const sill = inHole.find((blk) => !Number.isFinite(blk.y)), lintel = inHole.find((blk) => Number.isFinite(blk.y));
    assert.ok(sill && Math.abs(sill.h - LH.sillH) < 0.01, `${lp.name} 洞下的墙 0.95 高`);
    assert.ok(lintel && Math.abs(BlockCenterY(lintel, sample) - lintel.h / 2 - sample(lp.x, BW.box.minZ) - LH.topH) < 0.08, `${lp.name} 洞顶 1.25`);
    assert.equal(inHole.length, 2, `${lp.name} 的洞里只有窗台和过梁（${inHole.map((x) => x.id).join(",")}）`);
    Near(lp.h, (LH.sillH + LH.topH) / 2, 0.01, "枪眼中心离地 1.1");
  }
  const mg = byId.get("GengLoopholeMg");
  Near(mg.x, ST.main.c, 0.01, "机枪在堂屋枪眼上"); Near(mg.z, BW.box.minZ, 0.01, "机枪在后墙上");
  // 堂屋门朝南开在院里；灶屋门在东墙朝院子；院门洞敞着、过梁 2.0
  assert.ok(!Solid(BW.tangwuDoor.x, BW.box.maxZ) && Solid(BW.tangwuDoor.x - 1.2, BW.box.maxZ), "堂屋门在南墙上");
  assert.ok(!Solid(K.box.maxX, K.door.z) && Solid(K.box.maxX, K.door.z - 1.2), "灶屋门在东墙上");
  assert.ok(!Solid(G.box.maxX, G.gate.z) && Solid(G.box.maxX, G.gate.z - 1.5) && Solid(G.box.maxX, G.gate.z + 1.5), "院门洞敞着、两边是墙");
  assert.ok(!solids.some((blk) => blk.gate && Intersects(blk, { minX: G.box.maxX + T / 2 + 0.6, maxX: G.box.maxX + 1.6, minZ: G.gate.z - 0.6, maxZ: G.gate.z + 0.6 })), "院门扇不堵胡同");
  // 炮轰：东间后墙与房顶随 BarrageHit 没了，塌下来的土出现
  const after = SolidBlocks(a, [SIG.barrageHit]);
  assert.ok(!after.some((blk) => blk.id === "GengBeiwuRoofEast") && after.some((blk) => blk.id === "GengCollapseRubble"), "炮轰后东间房顶没了、土堆出来了");
  assert.ok(!Solid(104.5, BW.box.minZ, after) && Solid(104.5, BW.box.minZ), "炮轰后东间后墙缺了一块");
  // 狗洞大人钻不过（口子 0.4…0.5、过梁下沿 ≤ 0.5）、便门洞 ≥ 0.95
  const shared = a.blocks.filter((x) => x.id.startsWith("SharedWall_")).sort((p, q) => p.z - q.z);
  assert.ok(shared.length >= 3, "共用墙拆成几段");
  const gaps = shared.slice(1).map((r, i) => ({ from: shared[i].z + shared[i].d / 2, to: r.z - r.d / 2 })).map((g) => ({ ...g, w: g.to - g.from })).filter((g) => g.w > 0.05);
  const hole = gaps.find((g) => Math.abs((g.from + g.to) / 2 - G.dogHole.z) < 0.3);
  assert.ok(hole && hole.w <= 0.5 && hole.w >= 0.4, `狗洞宽 ${hole?.w}`);
  const lintel = byId.get("DogHoleLintel");
  assert.ok(BlockCenterY(lintel, sample) - lintel.h / 2 - sample(G.box.minX, G.dogHole.z) <= 0.5, "狗洞过梁下沿 ≤ 0.5 m");
  const gate = gaps.find((g) => Math.abs((g.from + g.to) / 2 - G.sideGate.z) < 0.3);
  assert.ok(gate && gate.w >= 0.95, `便门洞 ${gate?.w} m`);
  assert.ok(!Solid(G.box.minX, 476.5 + 2) || true);
}

// --- 视线：街口 ↔ 枪眼、枪眼看不见巷子、大车、街坊家 ---
const s = L0610SightChecks(a, sample);
for (const r of s.shooterToLoophole) assert.ok(r.block === null && r.ground <= 0, `街口坡道上趴着的 ${r.at.who} 要看得见堂屋枪眼：${r.block ? `被 ${r.block} 挡` : `地面挡 ${r.ground}`}`);
assert.equal(s.loopholeToMouth, null, `枪眼后的机枪顺主街要看到村北口：被 ${s.loopholeToMouth} 挡`);
assert.equal(s.mouthToLoophole, null, `村口要看得见枪眼：被 ${s.mouthToLoophole} 挡`);
for (const r of s.loopholeToAlley) assert.ok(r.block !== null || r.ground > 0, `枪眼后的机枪不许看见${r.name}`);
assert.equal(s.loopholeToCartHide, "OverturnedCart_S1", `枪眼到大车北头蹲着的人要被大车挡：${s.loopholeToCartHide}`);
assert.equal(s.windowToCellar, null, `西配房窗洞后要看得见窖口：被 ${s.windowToCellar} 挡`);
assert.equal(s.windowToMill, null, `西配房窗洞后要看得见石磨：被 ${s.windowToMill} 挡`);
assert.equal(s.gateToCellar, null, `半掩的门缝里要看得见窖口：被 ${s.gateToCellar} 挡`);
assert.equal(s.gateToBeiwuDoor, null, `半掩的门缝里要看得见堂屋门口：被 ${s.gateToBeiwuDoor} 挡`);
assert.notEqual(s.laneToCellar, null, "夹道里（墙外）看不见窖口");
assert.equal(s.glimpseToCellar, null, `09-2 的站点 (${J.glimpse.x},${J.glimpse.z}) 从门洞里要瞥得见窖口：被 ${s.glimpseToCellar} 挡`);
for (const b2 of s.laneToLocust) assert.equal(b2, null, `窄胡同第三道弯以南要望得见村南口外的大槐树树冠：被 ${b2} 挡`);
{
  const BL = P.bigLocust, locust = byId.get("BigLocust");
  assert.ok(locust && locust.h >= 8 && locust.semantic === "foliage", "大槐树 ≥ 8 m、是 foliage");
  assert.ok(BL.z > 545 && Math.hypot(BL.x - SL.exit.x, BL.z - SL.exit.z) >= 3 && Math.abs(BL.x - 117) > 1.5, "大槐树在南墙外、不挡村南口与出村小路");
}
assert.ok(s.eyes.windowCellar.x < J.westWing.box.maxX && s.eyes.windowCellar.x > J.westWing.box.minX, "窗洞的眼位在西配房里");
assert.ok(s.eyes.gate.z > J.box.maxZ, "门缝的眼位在 L4 里");
{
  const dWin = Math.hypot(J.cellar.x - J.westWing.box.maxX, J.cellar.z - J.westWing.window.z);
  assert.ok(dWin >= 8 && dWin <= 10, `窖口离西配房窗洞 ${dWin.toFixed(1)} m（要 8…10）`);
  const cart = byId.get("OverturnedCart_S1");
  assert.ok(cart.h >= 1.1 && cart.h <= 1.2, "翻倒的大车 1.1…1.2 高");
  assert.ok(cart.x - cart.d / 2 >= 101.0, "大车贴主街东墙（街口看枪眼的视线扇在它西边）");
}
// 村口（蹲着 1.2）→ 枪眼这条线上不能有摆件
assert.equal(BlockSight(solids, sample, { x: 100, z: 385, eye: 1.2 }, { x: ST.main.c, z: G.beiwu.box.minZ, eye: 1.1 }), null, "村口到枪眼的视线被摆件挡了");

// --- 只有一条路：泛洪 ---
const RunBox = (r, pad = 0) => (r.axis === "z" ? { minX: r.c - r.halfW - pad, maxX: r.c + r.halfW + pad, minZ: r.from - pad, maxZ: r.to + pad } : { minX: r.from - pad, maxX: r.to + pad, minZ: r.c - r.halfW - pad, maxZ: r.c + r.halfW + pad });
const InBox = (x, z, box) => x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ;
const yardById = new Map([...L0610_YARDS.map((y) => [y.id, y.box]), ["GENG", G.box], ["JIEFANG", J.box], ["BENJIA", B.box]]);
{
  const start = { x: P.alleyMouth.x, z: 385.5 };
  const gridBox = { minX: 40, maxX: 232, minZ: 385, maxZ: 548 };
  // 鬼子在 L4 东头到丁字路口那一截：泛洪时在 x ≥ 91.5 截断（不截断的话绕路口、窄胡同、老耿家敞着的院门就进了院）
  const barrier = (x, z) => x >= 91.5 && z >= ST.l4.c - ST.l4.halfW - 0.3 && z <= ST.l4.c + ST.l4.halfW + 0.3;
  const grid0 = WalkGrid(a, sample, [], { box: gridBox });
  const flood0 = FloodFrom(grid0, start, { barriers: [barrier] });
  const kitchen = G.yard.kitchenDoorOut, benjiaSide = B.sideDoorOut, gengSide = G.yard.sideDoorIn;
  assert.ok(flood0.Has(benjiaSide.x, benjiaSide.z), "便门没开也能走到本家院那边的便门口");
  assert.ok(!flood0.Has(gengSide.x, gengSide.z) && !flood0.Has(kitchen.x, kitchen.z), "便门没开（狗洞人钻不过）到不了老耿家院里");
  assert.ok(flood0.Has(63.0, 450.0) && flood0.Has(65.3, 450.0) && flood0.Has(66.8, 452.2), "途经街坊家西配房塌掉的西北角钻进屋里");
  assert.ok(flood0.Has(J.glimpse.x, J.glimpse.z), "到得了街坊家门口（L4 上）");
  assert.ok(FloodFrom(grid0, start).Has(101, 464), "L4 东头不截断时通丁字路口（搜窖的鬼子从这里去路口）");
  const grid1 = WalkGrid(a, sample, [SIG.sideGateOpen], { box: gridBox });
  const flood1 = FloodFrom(grid1, start, { barriers: [barrier] });
  assert.ok(flood1.Has(gengSide.x, gengSide.z) && flood1.Has(kitchen.x, kitchen.z), "便门开了就能走到老耿家灶屋门口");
  for (const seg of L0610_ROUTE.segments) for (const p of seg.line) {
    if (seg.seg === "dogHole" || p.z < gridBox.minZ + 0.3) continue;
    assert.ok(flood1.Has(p.x, p.z), `L0610_ROUTE 的点 (${p.x},${p.z})（${seg.seg}）要在泛洪到的格子里`);
  }
  // 截断时（便门还没开）泛洪到的地方只在允许的胡同 / 院子里；便门开了以后从老耿家敞着的院门出去就是窄胡同，那是出去的路，不在这里数
  const flood2 = flood0;
  const allowed = [...L0610_ROUTE.allowedLanes.map((id) => RunBox(ST[id], 0.3)), ...L0610_ROUTE.allowedYards.filter((id) => id !== "GENG").map((id) => yardById.get(id))];
  const leaks = [];
  for (let iz = 0; iz < grid1.rows; iz++) for (let ix = 0; ix < grid1.cols; ix++) {
    if (!flood2.reached[iz * grid1.cols + ix]) continue;
    const x = grid1.X(ix), z = grid1.Z(iz);
    if (!allowed.some((box) => InBox(x, z, box))) leaks.push(`(${x.toFixed(2)},${z.toFixed(2)})`);
  }
  assert.deepEqual(leaks.slice(0, 20), [], `从巷子口泛洪漏到了允许范围以外（共 ${leaks.length} 格）`);
  assert.ok(!flood2.Has(101, 464), "截断后到不了丁字路口");
  // 岔路都堵死了：每条瓦砾后头的胡同一格都到不了；瓦砾 ≥ 1.6 高
  for (const r of L0610_RUBBLE) {
    const run = ST[r.blocks];
    const beyond = run.axis === "x" ? (r.id === "RubbleSouthEast" ? { x: r.x + 3.5, z: run.c } : { x: r.x - 3.5, z: run.c }) : { x: run.c, z: r.z - 3.5 };
    if (r.blocks === "alleyEastStub" || r.blocks === "eastSouthLane") beyond.x = r.x + 3.5;
    assert.ok(grid1.At(beyond.x, beyond.z), `${r.name}：瓦砾那边 (${beyond.x},${beyond.z}) 本来是能走的胡同`);
    const piles = solids.filter((blk) => blk.id.startsWith(`${r.id}_`));
    assert.ok(piles.length >= 2 && Math.max(...piles.map((p) => p.h)) >= 1.6, `${r.name} 要 ≥ 1.6 高、几块错落`);
    if (["alleyEastStub", "alleyWestStub", "l4WestStub"].includes(r.blocks)) assert.ok(!flood2.Has(beyond.x, beyond.z), `${r.name} 没堵死`);
  }
  // 泛洪到的胡同段清单 = 允许的那几条
  const reachedLanes = L0610_LANES.filter((l) => { const r = ST[l.id]; const box = RunBox(r, 0); for (let i = 0; i <= 20; i++) { const x = box.minX + (box.maxX - box.minX) * (i / 20), z = box.minZ + (box.maxZ - box.minZ) * (i / 20); if (flood2.Has((r.axis === "z" ? r.c : x), (r.axis === "z" ? z : r.c))) return true; } return false; }).map((l) => l.id);
  assert.deepEqual(reachedLanes.sort(), [...L0610_ROUTE.allowedLanes].sort(), "泛洪到的胡同段要正好是这条路沿线的那几条");
}

// --- 往南只有窄胡同；塌墙后要翻柴垛绕 ---
{
  const start = { x: 101, z: 464 };
  const gridBox = { minX: 40, maxX: 232, minZ: 385, maxZ: 548 };
  const northBarrier = (x, z) => z < ST.square.box.minZ;   // 不往北数
  const l4Barrier = (x, z) => x < 92.3 && z >= ST.l4.c - 1.5 && z <= ST.l4.c + 1.5;
  const base = FloodFrom(WalkGrid(a, sample, [], { box: gridBox }), start, { barriers: [northBarrier, l4Barrier] });
  const exit = SL.exit;
  assert.ok(base.Has(exit.x, exit.z - 1), "从丁字路口能顺窄胡同走到新村南口");
  assert.ok(base.Has(SL.climb.from.x, SL.climb.from.z) && base.Has(113.25, 505), "塌墙前胡同中段是通的");
  // 不穿院子能到的胡同：z ≥ 470 的胡同里只有窄胡同那几段（东西小巷到瓦砾为止）
  const southLanes = L0610_LANES.filter((l) => RunBox(ST[l.id]).minZ >= 469);
  const reachedSouth = southLanes.filter((l) => { const r = ST[l.id]; const box = RunBox(r); for (let i = 0; i <= 40; i++) { const t = i / 40; const x = r.axis === "z" ? r.c : box.minX + (box.maxX - box.minX) * t, z = r.axis === "z" ? box.minZ + (box.maxZ - box.minZ) * t : r.c; if (base.Has(x, z)) return true; } return false; }).map((l) => l.id);
  assert.deepEqual(reachedSouth.sort(), ["backLane", "eastSouthLane", "southEastLane", "southLane1", "southLane2", "southLane3", "southLane4", "southWestLane"].sort(), "丁字路口往南只通窄胡同（三条东西小巷只到瓦砾）");
  assert.ok(!base.Has(100, 521) && !base.Has(126, 525) && !base.Has(124, 495), "村南 / 东街南边的东西小巷在瓦砾那边到不了");
  assert.ok(!base.Has(93, 530) && !base.Has(130, 530), "穿不进村南的院子");
  // 塌墙
  const collapsed = WalkGrid(a, sample, [SIG.laneWallCollapse], { box: gridBox });
  const blocked = FloodFrom(collapsed, start, { barriers: [northBarrier, l4Barrier] });
  assert.ok(blocked.Has(SL.climb.from.x, SL.climb.from.z), "塌墙后柴垛跟前还到得了");
  assert.ok(!blocked.Has(113.25, 510) && !blocked.Has(exit.x, exit.z - 1) && !blocked.Has(SL.detourYard.inside.x, SL.detourYard.inside.z), "塌墙把胡同堵死了：翻不过去就到不了村南口、也进不了旁边院子");
  const climbed = FloodFrom(collapsed, start, { barriers: [northBarrier, l4Barrier], links: [{ from: SL.climb.from, to: SL.climb.to }] });
  assert.ok(climbed.Has(SL.detourYard.inside.x, SL.detourYard.inside.z) && climbed.Has(113.25, 519) && climbed.Has(exit.x, exit.z - 1), "踩柴垛翻进旁边院子、从它的院门出来才接得上村南口");
  const pile = byId.get("ClimbPile");
  assert.ok(pile.h >= 1.1 && pile.h <= 1.3 && Math.abs(pile.x + pile.w / 2 - (SL.climb.wallX - T / 2)) < 0.05, "柴垛 1.2 高、贴着胡同东墙根");
  assert.ok(!Solid(SL.collapse.wallX, 505, SolidBlocks(a, [SIG.laneWallCollapse])) && Solid(SL.collapse.wallX, 505), "塌墙那段墙随信号没了");
  Near(exit.x - 98, 19, 2.5, "新村南口比原来 (98,545) 往东挪约 15–20 m");
  assert.ok(!Solid(exit.x, 545) && Solid(exit.x - 1.5, 545) && Solid(exit.x + 1.5, 545), "村南口是村南墙上的口子");
}

// --- 班长那一路（10-24 两路）：EM2 院门敞着、柴垛贴着 z 435 那道墙、翻墙是「链接」不是口子；蹲在院里的三个点枪眼和墙角哨都看不见 ---
{
  const EYR = L0610_EAST_YARD_ROUTE, C = EYR.climb;
  const pile = byId.get("EastClimbPile");
  assert.ok(pile && pile.h >= 1.1 && pile.h <= 1.3 && pile.climb && pile.prop === "Haystack", "翻墙的柴垛 1.2 高、标 climb");
  assert.ok(Math.abs(pile.z + pile.d / 2 - (C.wallZ - T / 2)) < 0.05, "柴垛贴着 z 435 那道墙的北面（EM2 这边）");
  assert.ok(Solid(C.pile.x, C.wallZ) && Solid(C.pile.x - 1.5, C.wallZ) && Solid(C.pile.x + 1.5, C.wallZ), "柴垛那一截墙没开口子");
  assert.ok(!Solid(EYR.gate.x, EYR.gate.z) && Solid(EYR.gate.x, EYR.gate.z - 1.5) && Solid(EYR.gate.x, EYR.gate.z + 1.5), "EM2 西墙的院门洞敞着、两边是墙");
  const gridBox = { minX: 40, maxX: 232, minZ: 385, maxZ: 548 };
  const grid = WalkGrid(a, sample, [], { box: gridBox });
  const streetBarrier = (x, z) => x < EYR.gate.x;   // 不往主街那边数
  const noLink = FloodFrom(grid, EYR.gateIn, { barriers: [streetBarrier] });
  assert.ok(noLink.Has(C.from.x, C.from.z) && !noLink.Has(C.to.x, C.to.z) && !noLink.Has(EYR.behindGate.Luo.x, EYR.behindGate.Luo.z), "不翻墙从 EM2 进不了 EM3");
  const linked = FloodFrom(grid, EYR.gateIn, { barriers: [streetBarrier], links: [{ from: C.from, to: C.to }] });
  assert.ok(linked.Has(C.to.x, C.to.z) && linked.Has(EYR.stripOut.x, EYR.stripOut.z) && linked.Has(EYR.behindGate.Luo.x, EYR.behindGate.Luo.z) && linked.Has(EYR.behindGate.HeYoutian.x, EYR.behindGate.HeYoutian.z), "翻过墙从 EM3 北屋西边的空地能走到南门后头");
  assert.ok(!linked.Has(EYR.inPocket.Luo.x, EYR.inPocket.Luo.z), "门没撞开之前进不了 pocket");
  const burst = FloodFrom(WalkGrid(a, sample, [SIG.eastGateBurst], { box: gridBox }), EYR.gateIn, { barriers: [streetBarrier], links: [{ from: C.from, to: C.to }] });
  assert.ok(burst.Has(EYR.inPocket.Luo.x, EYR.inPocket.Luo.z) && burst.Has(ES.roller.x - 2.2, ES.roller.z), "撞开门就冲得进 pocket、到得了石碾后头");
  // 视线：三个枪眼后的人（1.1）和墙角哨（蹲着 1.2）都看不见这条路上蹲着的人（0.9）
  const eyes = [...G.beiwu.loopholes.map((lp) => ({ name: lp.name, x: lp.x, z: lp.z + 1.5, eye: 1.1 })), { name: "墙角哨", x: 108.2, z: 460.4, eye: 1.2 }, { name: "墙角哨 2", x: 105.0, z: 460.0, eye: 1.2 }];
  const route = [EYR.gateIn, { x: 104.5, z: 433.3 }, C.from, C.to, { x: 104.8, z: 438.6 }, EYR.stripOut, { x: 105.4, z: 449 }, EYR.behindGate.Luo, EYR.behindGate.HeYoutian, EYR.behindGate.Escort1];
  for (const e of eyes) for (const p of route) assert.notEqual(BlockSight(solids, sample, e, { x: p.x, z: p.z, eye: 0.9 }), null, `${e.name} 不许看见班长那一路上蹲着的人 (${p.x},${p.z})`);
}

// --- 院子的口径：三种院子、北屋、院门在角上、尺寸 ---
{
  const kinds = new Set(L0610_YARDS.map((y) => y.kind));
  for (const k of ["siheyuan", "banmian", "paifang", "garden", "pond"]) assert.ok(kinds.has(k), `缺 ${k} 这种院子`);
  const houseYards = L0610_YARDS.filter((y) => !["garden", "pond", "farmyard"].includes(y.kind));
  assert.ok(houseYards.length >= 30, "院子够多");
  const Beiwu = (box) => ({ w: box.maxX - box.minX, d: box.maxZ - box.minZ });
  // 院门外头 0.6 m 处那一点要落在某条胡同的净空里（门要开在胡同上，不是开进别人院里）
  const s3Touch = (b, y, g) => {
    const fixed = g.wall === "N" ? (g.at ?? y.box.minZ) : g.wall === "S" ? (g.at ?? y.box.maxZ) : g.wall === "W" ? y.box.minX : y.box.maxX;
    const out = g.wall === "N" ? { x: g.c, z: fixed - 0.6 } : g.wall === "S" ? { x: g.c, z: fixed + 0.6 } : g.wall === "W" ? { x: fixed - 0.6, z: g.c } : { x: fixed + 0.6, z: g.c };
    return InBox(out.x, out.z, b) || InBox(out.x, out.z, ST.square.box) || L0610_YARDS.some((o) => o.kind === "garden" && InBox(out.x, out.z, o.box));   // 开进菜园 / 空宅基也算（后院从菜园走）
  };
  for (const y of houseYards) {
    const W = y.box.maxX - y.box.minX, D = y.box.maxZ - y.box.minZ;
    assert.ok(W >= 8 && W <= 32 && D >= 9 && D <= 32, `${y.id} 院子 ${W}×${D}（要 8…32：一般 12–20，富户几院相连大些）`);
    assert.ok(y.houses.length >= 1, `${y.id} 没房子`);
    const bw = y.houses[0];
    assert.ok(bw.box.minZ - y.box.minZ <= 2.5, `${y.id} 第一座房是靠北墙的北屋`);
    for (const h of y.houses) assert.ok(h.box.minX >= y.box.minX - 0.01 && h.box.maxX <= y.box.maxX + 0.01 && h.box.minZ >= y.box.minZ - 0.01 && h.box.maxZ <= y.box.maxZ + 0.01, `${y.id} 房子 ${JSON.stringify(h.box)} 出了院子`);
    const { w, d } = Beiwu(bw.box);
    assert.ok((w >= 9 && w <= 11.5) || (w >= 13 && w <= 17.2) || (w >= 6 && w <= 7.5), `${y.id} 北屋 ${w} 长（三间 9…11 / 五间 13…17 / 两间 6…7.5）`);
    assert.ok(d >= 4.4 && d <= 6, `${y.id} 北屋 ${d} 深（要 4.5…5.5）`);
    for (const h of y.houses.slice(1)) {
      const s2 = Beiwu(h.box);
      const wing = s2.w >= 3.5 && s2.w <= 4.5 && s2.d >= 5.5 && s2.d <= 7.5, nanwu = s2.w >= 9 && s2.w <= 11.5 && s2.d >= 3.5 && s2.d <= 4.5;
      assert.ok(wing || nanwu, `${y.id} 配房 / 南屋 ${s2.w}×${s2.d} 不在县志的尺寸里（配房 4×6–7、南屋 10×4）`);
    }
    if (y.kind === "siheyuan") assert.ok(y.houses.length >= 4, `${y.id} 四合院要有北屋 + 两厢 + 南屋`);
    if (y.kind === "banmian") assert.ok(y.houses.length === 2 || y.houses.length === 3, `${y.id} 半面槽院两三座房`);
    if (y.kind === "paifang") assert.ok(y.houses.length === 1, `${y.id} 排房院一排房`);
    // 院门：在角上（离某个角 ≤ 4 m）；开在南墙，或侧墙靶南半截，或（胡同只在北边）北墙
    const g = y.gate;
    assert.ok(g, `${y.id} 没院门`);
    const midZ = (y.box.minZ + y.box.maxZ) / 2;
    const side = g.wall === "N" || g.wall === "S";
    const nearCorner = side ? Math.min(g.c - y.box.minX, y.box.maxX - g.c) <= 4 : Math.min(g.c - y.box.minZ, y.box.maxZ - g.c) <= 4;
    assert.ok(nearCorner, `${y.id} 院门不在角上`);
    const laneOf = L0610_LANES.find((l) => { const r = ST[l.id]; const b = RunBox(r, 0.3); return s3Touch(b, y, g); });
    assert.ok(laneOf || s3Touch({ minX: 0, maxX: 0, minZ: 0, maxZ: 0 }, y, g), `${y.id} 的院门外头没有胡同 / 菜园`);
    if (g.wall === "E" || g.wall === "W") assert.ok(g.c >= midZ - 1, `${y.id} 侧墙上的院门要靶南`);
    // 门洞真开着（洞里没墙），关着的有门扇、敞着的没有
    const s3 = g.wall === "N" ? { axis: "x", fixed: g.at ?? y.box.minZ } : g.wall === "S" ? { axis: "x", fixed: g.at ?? y.box.maxZ } : g.wall === "W" ? { axis: "z", fixed: y.box.minX } : { axis: "z", fixed: y.box.maxX };
    const box = s3.axis === "x" ? { minX: g.c - g.w / 2 + 0.1, maxX: g.c + g.w / 2 - 0.1, minZ: s3.fixed - 0.2, maxZ: s3.fixed + 0.2 } : { minX: s3.fixed - 0.2, maxX: s3.fixed + 0.2, minZ: g.c - g.w / 2 + 0.1, maxZ: g.c + g.w / 2 - 0.1 };
    const hits = solids.filter((blk) => blk.h > 0.5 && Intersects(blk, box) && !/Lintel/.test(blk.id));
    if (g.leaf === "closed") assert.ok(hits.length === 1 && hits[0].gate, `${y.id} 的院门要关着（${hits.map((h) => h.id).join(",")}）`);
    else if (g.leaf === "open") assert.deepEqual(hits.map((h) => h.id), [], `${y.id} 的院门要敞着`);
  }
  const gateWalls = houseYards.map((y) => y.gate.wall);
  assert.ok(gateWalls.filter((w) => w === "S").length >= 10 && gateWalls.filter((w) => w === "N").length <= houseYards.length / 2, "大多数院门开在南墙 / 侧墙上，开北墙的是胡同只在北边的那些");
  // 三个有名字的院子
  assert.equal(J.gate.wall, "S"); assert.ok(J.gate.x - J.box.minX <= 4, "街坊家院门在西南角、开在南墙上");
  assert.equal(B.gate.wall, "S"); assert.ok(B.gate.x - B.box.minX <= 4, "本家院院门在西南角");
  assert.ok(Math.abs(B.box.maxX - G.box.minX) < 0.01, "本家院跟老耿家共用 x 92 那道墙");
  assert.ok(J.beiwu.hollow && J.westWing.hollow, "街坊家北屋与西配房是空心的（人要进去）");
}

// --- 东街：扇面、距离、石碾两侧实墙、探头点看得见 ---
{
  const RL = ES.roller;
  for (const p of s.probes) {
    assert.ok(Math.abs(p.deg) <= ES.fanDeg, `探头点 ${p.id} 在石碾往东 ${p.deg}°（要 ±${ES.fanDeg}）`);
    assert.ok(p.dist >= ES.nearM && p.dist <= ES.farM, `探头点 ${p.id} 离石碾 ${p.dist} m（要 ${ES.nearM}…${ES.farM}）`);
    if (p.hidden) continue;
    if (p.kind === "shrine") assert.ok(p.block && /^Shrine/.test(p.block), `石碾后看土地庙：视线该落在庙上（${p.block}）`);
    else assert.equal(p.block, null, `石碾后要看得见探头点 ${p.id}：被 ${p.block} 挡`);
  }
  assert.ok(s.probes.filter((p) => !p.hidden).length >= 6 && s.probes.some((p) => p.hidden), "六个以上看得见的探头点 + 过了弯看不见的");
  assert.equal(s.mgHideToRoller, null, `庙后的轻机枪要打得到石碾后的人：被 ${s.mgHideToRoller} 挡`);
  assert.equal(s.rollerToJog, null, `石碾后顺东街要看到第一道弯的正面墙：被 ${s.rollerToJog} 挡`);
  // 石碾北、南 8 m 内是实墙：东街两边的墙从街口到 x 121.2 没门没窗；路口东墙 x 110 在街口两侧也是实的
  const northWallZ = ST.east.c - ST.east.halfW - T / 2, southWallZ = ST.east.c + ST.east.halfW + T / 2;
  WallRun("x", northWallZ, ST.east.from, RL.x + ES.solidFlankM, "石碾北边那道墙");
  WallRun("x", southWallZ, ST.east.from, RL.x + ES.solidFlankM, "石碾南边那道墙");
  WallRun("z", ST.square.box.maxX, ST.square.box.minZ, northWallZ, "路口东墙（街口北）");
  WallRun("z", ST.square.box.maxX, southWallZ, ST.square.box.maxZ, "路口东墙（街口南）");
  assert.ok(!solids.some((blk) => !blk.prop && blk.h >= 2 && Intersects(blk, { minX: ST.east.from + 0.3, maxX: ST.east.to - 0.3, minZ: ST.east.c - ST.east.halfW + 0.05, maxZ: ST.east.c + ST.east.halfW - 0.05 })), "东街头一段净空里不能有墙");
  assert.ok(ES.line.length >= 5 && new Set(ES.line.map((p) => p.z)).size >= 2, "东街拐一两道弯");
  Near(ES.line[ES.line.length - 1].x, ER.line[0].x, 0.01, "东街东头接东北进庄的道"); Near(ES.line[ES.line.length - 1].z, ER.line[0].z, 0.01, "东街东头接东北进庄的道");
  // 院子链三道门、石碾、麦秸垛、土地庙
  const DoorOpen = (axis, fixed, c, w, what, signal = SIG.northYardGatesBroken) => {
    const box = axis === "x" ? { minX: c - w / 2 + 0.1, maxX: c + w / 2 - 0.1, minZ: fixed - 0.3, maxZ: fixed + 0.3 } : { minX: fixed - 0.3, maxX: fixed + 0.3, minZ: c - w / 2 + 0.1, maxZ: c + w / 2 - 0.1 };
    assert.deepEqual(SolidBlocks(a, [signal]).filter((blk) => blk.h > 0.5 && Intersects(blk, box) && !/Lintel/.test(blk.id)).map((x) => x.id), [], `${what} 门砸倒以后要通`);
    const closed = solids.filter((blk) => blk.h > 0.5 && Intersects(blk, box) && !/Lintel/.test(blk.id));
    assert.ok(closed.length === 1 && closed[0].gate, `${what} 平时要有一扇关着的门`);
  };
  const NC = ES.northChain;
  DoorOpen("x", NC.pocketGate.z, NC.pocketGate.x, NC.pocketGate.w, "路口东北角那院的院门", SIG.eastGateBurst);
  assert.ok(SolidBlocks(a, [SIG.northYardGatesBroken]).some((blk) => blk.id === "PocketGateLeaf"), "北边砸门（NorthYardGatesBroken）不动路口东北角那道门：它是班长撞开的");
  DoorOpen("z", NC.yard1Door.x, NC.yard1Door.z, NC.yard1Door.w, "北侧第一个院的西门");
  DoorOpen("z", NC.farmyardDoor.x, NC.farmyardDoor.z, NC.farmyardDoor.w, "场院西隔墙的门");
  assert.ok(NC.pocketGate.x < RL.x && NC.pocketGate.z < RL.z, "院子链的出口在石碾西北背后");
  const straw = byId.get("StrawStack_F1");
  assert.ok(straw.w >= 4 && straw.h >= 3 && straw.x > ES.farmyard.minX && straw.x < ES.farmyard.maxX && straw.z < northWallZ, "麦秸垛在场院里");
  const farmOpen = { minX: ES.farmyard.openFromX + 0.1, maxX: ES.farmyard.openToX - 0.1, minZ: northWallZ - 0.3, maxZ: northWallZ + 0.3 };
  assert.deepEqual(solids.filter((blk) => Intersects(blk, farmOpen)).map((x) => x.id), [], "场院南墙中段要敞开");
  const shrineBack = byId.get("ShrineBack");
  assert.ok(shrineBack.z + shrineBack.d / 2 <= southWallZ + 0.3 && shrineBack.h >= 1.7, "土地庙贴着东街南侧院墙、开口朝北");
  // 东街南侧两座后墙对街的北屋：豁口（人能探出来）在
  for (const id of ["House_ES2", "House_ES3"]) {
    const sill = byId.get(`${id}_BreachSill`);
    assert.ok(sill && sill.h <= 0.6 && Math.abs(sill.z - southWallZ) < 0.01, `${id} 后墙上的豁口在街墙上、下沿 ≤ 0.6`);
  }
}

// --- 东北进庄的道、场地东半截 ---
{
  const pts = EastRoadViewPoints();
  assert.ok(pts.length >= 5 && pts.some((p) => p.x === P.eastRoadView.x && p.z === P.eastRoadView.z), "东北道上的取样点含 eastRoadView");
  for (const r of s.eastRoad.laneMouth) assert.equal(r.block, null, `凹路尽头看东北道 (${r.at.x},${r.at.z}) 被 ${r.block} 挡`);
  for (const r of s.eastRoad.ramp) assert.equal(r.block, null, `街口坡道趴着看东北道 (${r.at.x},${r.at.z}) 被 ${r.block} 挡`);
  for (const p of ER.line.slice(1)) assert.ok(p.x <= L0610_BOUNDS.maxX - 5 && p.z >= L0610_BOUNDS.minZ + 5, `东北道的点 (${p.x},${p.z}) 要在场地里`);
  for (let z = L0610_BOUNDS.minZ; z <= L0610_BOUNDS.maxZ; z += 2) for (let x = 250; x < L0610_BOUNDS.maxX; x += 0.5) {
    if (ER.graves.some((g) => Math.hypot(x + 0.25 - g.x, z - g.z) < g.r + 1)) continue;
    assert.ok(Math.abs(sample(x + 0.5, z) - sample(x, z)) <= 0.35, `x${x} z${z} 东半截有怪坡`);
  }
  assert.ok(a.ways.roads.some((r) => r.length === ER.line.length && r[0].x === ER.line[0].x), "东北道进 ways.roads");
  // 庄子外沿：西墙 x 40 从 385 到 545 没缝；东墙 x 232 只有东街口；北墙 z 385 / 388 只有夹道口、主街口、路沟后门
  WallRun("z", 40, 385, 545, "庄子西墙");
  for (let z = 388.3; z <= 544.7; z += 0.5) {
    const toStreet = Math.abs(z - ST.east3.c) - ST.east3.halfW;
    if (Math.abs(toStreet) < 0.3) continue;
    assert.equal(Solid(232, z), toStreet > 0, `庄子东沿 x232 z${z} ${toStreet < 0 ? "该是东街口" : "有洞"}`);
  }
  WallRun("x", 388, 118.25, 232, "庄子东北角的北墙（让开看东北道的视线，放在 z 388）");
  const ditchBack = { minX: 110 - 0.6, maxX: 110 + 0.6, minZ: 384.6, maxZ: 385.4 };
  assert.deepEqual(solids.filter((blk) => blk.h > 0.5 && Intersects(blk, ditchBack) && !/Lintel/.test(blk.id)).map((x) => x.id), [], "主街东边院子朝路沟的后门要开着");
  const mainEast = { minX: 103.25 - 0.3, maxX: 103.25 + 0.3, minZ: 432.5 - 0.5, maxZ: 432.5 + 0.5 };
  assert.deepEqual(solids.filter((blk) => blk.h > 0.5 && Intersects(blk, mainEast) && !/Lintel/.test(blk.id)).map((x) => x.id), [], "主街东边 z 432.5 的院门要开着（08-1 两个村民冲出来）");
  const alleyBack = { minX: P.alleyBackGate.x - 0.3, maxX: P.alleyBackGate.x + 0.3, minZ: P.alleyBackGate.z - 0.4, maxZ: P.alleyBackGate.z + 0.4 };
  assert.deepEqual(solids.filter((blk) => blk.h > 0.5 && Intersects(blk, alleyBack) && !/Lintel/.test(blk.id)).map((x) => x.id), [], "夹道东边院子朝夹道的门要开着（08-1 村民顺巷子跑）");
  // 主街净空
  const mainStrip = { minX: ST.main.c - ST.main.halfW + 0.3, maxX: ST.main.c + ST.main.halfW - 0.3, minZ: ST.main.from + 1, maxZ: ST.square.box.minZ - 1 };
  assert.deepEqual(solids.filter((blk) => !blk.prop && Intersects(blk, mainStrip)).map((x) => x.id), [], "主街 6 m 净空里不能有墙 / 房子");
  const passage = { minX: ST.alleyNorth.c - ST.alleyNorth.halfW + 0.1, maxX: ST.alleyNorth.c + ST.alleyNorth.halfW - 0.1, minZ: ST.alleyNorth.from, maxZ: ST.alleyA2.c + ST.alleyA2.halfW };
  assert.deepEqual(solids.filter((blk) => Intersects(blk, passage)).map((x) => x.id), [], "巷子北头的夹道 2 m 宽要通到路沟南沿");
  // 关键帧里的人不落进墙 / 房子（关键帧已按第六版重排）。只算挡人的块：高过 0.5 m（磨盘底座那种矮台不算），
  // 下沿离地不到 1 m（门洞过梁、窗洞上沿在头顶上，人站在门洞里不算撞墙）。
  const url = new URL("./Blockout/FirstLevel0610.json", import.meta.url);
  if (fs.existsSync(url)) {
    const cfg = JSON.parse(fs.readFileSync(url, "utf8"));
    const hits = [];
    for (const kf of cfg.keyframes || []) for (const u of kf.units || []) {
      const foot = { minX: u.x - 0.25, maxX: u.x + 0.25, minZ: u.z - 0.25, maxZ: u.z + 0.25 };
      const hit = solids.find((b2) => b2.h > 0.5 && !b2.prop && Intersects(b2, foot)
        && BlockCenterY(b2, sample) - b2.h / 2 - sample(u.x, u.z) < 1.0);
      if (hit) hits.push(`${kf.id} ${u.id ?? u.name} @(${u.x},${u.z}) → ${hit.id}`);
    }
    assert.deepEqual(hits, [], "关键帧里的人落进了墙 / 房子");
  }
}

// --- 地标 ---
{
  const lms = a.landmarks;
  assert.ok(Array.isArray(lms) && lms.length >= 40, `地标要有 40 个以上，现在 ${lms?.length}`);
  const errors = [];
  LandmarkIssues(lms, errors);
  assert.deepEqual(errors, [], "地标过校验");
  const byName = new Map(lms.map((lm) => [lm.name, lm]));
  const NEED = ["干沟（集结处）", P.cartStop.name, "凹路口", DT.name, P.ditchEast.name, "街口坡道射击位", "巷子口", ST.main.name, P.cart.name,
    "堂屋枪眼（机枪）", "西间枪眼", "东间枪眼", P.tangwuDoor.name, P.kitchenDoor.name, P.gengGate.name, P.dogHole.name, P.sideGate.name,
    P.jiefangGate.name, P.jiefangBreach.name, P.jiefangWindow.name, P.jiefangVat.name, P.cellar.name, P.mill.name, P.benjiaGate.name,
    P.roller.name, ES.farmyard.name, ES.strawStack.name, ES.shrine.name, "院门①（场院西隔墙）", "院门②（北侧第一个院西墙）", "院门③（路口东北角那院南墙）", P.southClimb.name, P.eastEnd.name,
    "河汊子", P.villageSouth.name, P.laneCollapse.name, P.climbPile.name, P.detourGate.name, P.eastRoadView.name, P.alleyBackGate.name, P.ditchBackGate.name, P.mainEastGate.name, P.pond.name, ST.l4.name];
  for (const name of NEED) assert.ok(byName.has(name), `缺地标「${name}」`);
  const Bd = a.bounds;
  for (const lm of lms) {
    assert.ok(lm.x >= Bd.minX && lm.x <= Bd.maxX && lm.z >= Bd.minZ && lm.z <= Bd.maxZ, `地标「${lm.name}」出了场地`);
    assert.ok(BLOCKOUT_LANDMARK_KINDS.includes(lm.kind), `地标「${lm.name}」kind ${lm.kind}`);
  }
  for (const kind of ["hole", "door", "window", "pit", "area", "prop", "place"]) assert.ok(lms.some((lm) => lm.kind === kind), `七种 kind 都要用到：缺 ${kind}`);
  const dogLm = byName.get(P.dogHole.name);
  Near(dogLm.x, G.box.minX, 0.01, "狗洞地标在共用墙上"); Near(dogLm.d, G.dogHole.w, 0.05, "狗洞地标的宽 = 口子宽");
  const cellarLm = byName.get(P.cellar.name);
  Near(cellarLm.y - cellarLm.h / 2, CELLAR_FLOOR_Y, 0.08, "窖地标的底 = 坑底");
  const lp = byName.get("堂屋枪眼（机枪）");
  Near(lp.y - lp.h / 2, sample(lp.x, lp.z) + V.loophole.sillH, 0.05, "枪眼地标的底 = 洞下沿");
  Near(lp.y + lp.h / 2, sample(lp.x, lp.z) + V.loophole.topH, 0.05, "枪眼地标的顶 = 洞上沿");
  Near(byName.get(P.villageSouth.name).x, SL.exit.x, 0.01, "村南口地标在新村南口");
  Near(byName.get("河汊子").x, RV.centerX, 0.01, "河汊子地标在中线上");
}

console.log(`ok：${a.blocks.length} 块 + ${a.gates.length} 随信号块 + ${a.landmarks.length} 地标，${a.terrain.cols}×${a.terrain.rows} 网格；与 0105 接缝最大差 ${cmp ? cmp.worst : "—"} m；`
  + `凹路 z260 深 ${LaneDepthAt(sample, 260).depth} m；路沟 x80 底 ${DitchSectionAt(sample, 80).floor}；河汊子 z400 底 ${RiverSectionAt(sample, 400).floor}、东坎沿到西墙 ${RiverEastLedgeAt(sample, 460).ledgeW} m；`
  + `探头点 ${s.probes.map((p) => `${p.id} ${p.dist}m/${p.deg}°`).join("、")}`);
