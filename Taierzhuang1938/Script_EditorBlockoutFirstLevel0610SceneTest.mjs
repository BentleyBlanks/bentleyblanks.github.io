// Script_EditorBlockoutFirstLevel0610SceneTest.mjs —— 06–10 白盒场景生成器的 node 回归（只给场景包自验用；2026-10-19 第二版）
// 跑法：node Taierzhuang1938/Script_EditorBlockoutFirstLevel0610SceneTest.mjs
// 查：生成两次逐字相同（generatedAt 固定）、过 ValidateBlockoutScene；与 0105 的北半截逐点接上（干沟沟底 / 坎顶 / 凹路口）；
// 凹路南段像沟（中段 ≥ 1.9 m 深、末端约 1.1 m）并直接接进村口路沟；村口路沟沟底 −0.9、约 3 m 宽、两沿 +0.2 以上、街口南壁是驴车能上的坡道；
// 河汊子沟底宽约 6 m、深 ≥ 2.5 m、两壁陡；整村压平、窖深 2 m；
// 视线：侧门口看得见窖边的人（门关着看不见；门缝 / 墙缝里看得见窖口）、北窗顺主街看到村北口、石碾后顺东街看到东头、
//   街口坡道上趴着的四个人都看得见北窗机枪手、北窗看不见巷子口与巷子任何一段、侧门里几步透过前屋南门看得见机枪组的后背、大车挡住北窗到车北侧的人；
// 狗洞大人钻不过；主街 / 东街净空、东街又直又长；巷子不通主街；场院 / 麦秸垛 / 土地庙 / 北角 / 院子链三道门在；没有人能站的房顶要求（房顶块只是样子）；
// 随信号体块与六个信号齐全。

import assert from "node:assert/strict";
import { ValidateBlockoutScene } from "./Script_EditorBlockoutConfig.mjs";
import { HeightGridSampler } from "./Script_EditorBlockoutLevels.mjs";
import {
  BuildFirstLevel0610Scene, CompareWith0105, LaneDepthAt, RiverSectionAt, DitchSectionAt, L0610SightChecks, BlockSight, BlockCenterY, SolidBlocks,
  RIVER_FLOOR_Y, CELLAR_FLOOR_Y, L0610_MOUTH_SHOOTERS,
} from "./Script_EditorBlockoutFirstLevel0610Scene.mjs";
import {
  L0610_PLACES as P, L0610_HEIGHTS as H, L0610_VILLAGE as V, L0610_GENG as G, L0610_STREETS as ST, L0610_SIGNALS as SIG, L0610_FROM_0105,
  L0610_DITCH as DT, L0610_EAST_YARDS as EY, L0610_STREET_YARDS as SY,
} from "./Data_EditorBlockoutFirstLevel0610Space.mjs";

const opts = { commit: "test", generatedAt: "2026-10-19T00:00:00.000Z" };
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
Near(sample(P.cartStop.x, P.cartStop.z), H0105.assemblyFloor, 0.1, "老耿的车停在沟底（南岸树底下）");
assert.ok(sample(P.nierRim.x, P.nierRim.z) > H0105.assemblyFloor + 0.3 && sample(P.nierRim.x, P.nierRim.z) < H0105.gullyRim, "妮儿蹲在南岸坎脚的斜坡上（沟沿）");
assert.ok(Math.hypot(P.nierRim.x - P.laneHead.x, P.nierRim.z - P.laneHead.z) < 4, "妮儿挡在凹路口边上");
for (const x of [20, 46, 55]) assert.ok(sample(x, G0105.northRimZ) - sample(x, G0105.northRimZ + 3) >= 2, `北岸坎不够陡 x${x}`);
const cmp = CompareWith0105(sample);
if (cmp) assert.ok(cmp.worst <= 0.02, `与 0105 场景文件在北半截不一致：最大差 ${cmp.worst} m（(${cmp.at.x},${cmp.at.z})）`);
else console.log("提示：没有 Blockout/FirstLevel0105.scene.json，跳过接缝比对");

// --- 凹路：像沟，末端直接接进路沟 ---
for (const [z, min, max] of [[199, 1.2, 1.7], [230, 1.6, 2.6], [260, 2.2, 3.0], [300, 1.9, 2.8], [340, 1.5, 2.3], [370, 1.0, 1.5]]) {
  const r = LaneDepthAt(sample, z);
  assert.ok(r.depth >= min && r.depth <= max, `凹路 z${z} 深 ${r.depth}（要 ${min}…${max}）`);
}
Near(sample(100, 377), DT.floorY, 0.08, "凹路末端路底 = 路沟沟底");
Near(sample(P.villageMouth.x, P.villageMouth.z), V.y - V.streetLowerM, 0.15, "村北口（街口坡道顶）与村里地面齐");

// --- 村口路沟（第二版）：沟底 −0.9、约 3 m 宽、两沿 ≥ +0.2；街口南壁是坡道（单调上升、驴车能上）；两头收掉 ---
for (const x of [60, 70, 80, 90, 115, 124]) {
  const r = DitchSectionAt(sample, x);
  Near(r.floor, DT.floorY, 0.05, `路沟 x${x} 沟底`);
  assert.ok(r.floorW >= 2.6 && r.floorW <= 3.6, `路沟 x${x} 沟底宽 ${r.floorW}（要约 3 m）`);
  assert.ok(r.north >= 0.0 && r.south >= 0.2, `路沟 x${x} 两沿 ${r.north}/${r.south}（北沿是麦地 ≥ 0、南沿是村口地面 ≥ 0.2）`);
  assert.ok(sample(x, DT.z + DT.floorW / 2 + DT.wallM + 0.2) - r.floor >= 1.0, `路沟 x${x} 南壁 1.3 m 内要升到沿上`);
}
Near(sample(P.alleyMouth.x, P.alleyMouth.z), V.y, 0.15, "巷子口在路沟南沿上（村里地面）");
for (const x of [50, 131]) assert.ok(sample(x, DT.z) > DT.floorY + 0.8, `路沟两头 x${x} 要收掉`);
const ramp = [381.5, 382.5, 383.5, 384.5, 385.3].map((z) => sample(100, z));
for (let i = 1; i < ramp.length; i++) assert.ok(ramp[i] >= ramp[i - 1] - 0.01, `街口坡道要一路往上 ${ramp.map((v) => v.toFixed(2)).join(" → ")}`);
assert.ok(ramp[0] <= DT.floorY + 0.1 && ramp[ramp.length - 1] >= V.y - V.streetLowerM - 0.1, "街口坡道从沟底升到街面");
assert.ok(Math.max(...ramp.slice(1).map((v, i) => v - ramp[i])) <= 0.55, "街口坡道每米最多升 0.55 m（驴车能上）");
for (const p of L0610_MOUTH_SHOOTERS) {
  const y = sample(p.x, p.z);
  assert.ok(y > DT.floorY + 0.8 && y < V.y, `${p.who} 趴在坡道上半截（${y.toFixed(2)}：眼刚高过街面）`);
}
assert.ok(Math.hypot(L0610_MOUTH_SHOOTERS[0].x - P.alleyMouth.x, L0610_MOUTH_SHOOTERS[0].z - P.alleyMouth.z) <= 20, "顺子的射击位置到巷子口 ≤ 20 m");

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
for (const [x, z] of [[70, 420], [110, 430], [100, 494], [160, 480], [200, 450], [80, 530], [166, 458]]) Near(sample(x, z), V.y, 0.08, `村里地面 (${x},${z})`);
for (const [x, z] of [[100, 420], [180, 465], [58.75, 440], [98, 530], [80, 391], [107, 456]]) Near(sample(x, z), V.y - V.streetLowerM, 0.06, `街面 (${x},${z})`);
Near(sample(P.cellar.x, P.cellar.z), CELLAR_FLOOR_Y, 0.08, "窖底");
Near(sample(100, 494) - sample(P.cellar.x, P.cellar.z), H.cellarDepth, 0.1, "窖深");

// --- 体块 ---
const all = [...a.blocks, ...a.gates];
const byId = new Map(all.map((x) => [x.id, x]));
assert.equal(byId.size, all.length, "块 id 全关唯一");
assert.ok(a.gates.every((g) => g.signal || g.appearSignal));
const signals = new Set(a.gates.flatMap((g) => [g.signal, g.appearSignal]).filter(Boolean));
assert.equal(Object.keys(SIG).length, 6, "六个信号");
for (const s of Object.values(SIG)) assert.ok(signals.has(s), `随信号体块缺信号 ${s}`);
assert.equal(byId.get("SideGateLeaf").signal, SIG.sideGateOpen);
assert.equal(byId.get("SideGateLeafOpen").appearSignal, SIG.sideGateOpen);
assert.equal(byId.get("CellarLid").signal, SIG.cellarBlast);
assert.equal(byId.get("CellarSmoke").appearSignal, SIG.cellarBlast);
assert.equal(byId.get("GengWindowMg").signal, SIG.mgSilenced);
assert.equal(byId.get("RollerMg").appearSignal, SIG.mgSilenced);
assert.equal(byId.get("BackVat").signal, SIG.backDoorOpen);
assert.equal(byId.get("BackDoorLeaf").signal, SIG.backDoorOpen);
for (const id of ["PocketGateLeaf", "Yard1GateLeaf", "FarmyardGateLeaf"]) {
  assert.equal(byId.get(id)?.signal, SIG.northYardGatesBroken, `${id} 随 NorthYardGatesBroken 消失`);
  assert.equal(byId.get(`${id}Fallen`)?.appearSignal, SIG.northYardGatesBroken, `${id}Fallen 随 NorthYardGatesBroken 出现`);
  assert.ok(byId.get(`${id}Fallen`).h <= 0.1, `${id}Fallen 是倒在地上的`);
}
assert.ok(all.filter((x) => x.signal === SIG.cartDeparted).length >= 2, "车上至少两箱弹药随 CartDeparted 收掉");
// 老耿家：前屋平顶 3.5 m 高（只是样子，没人上去）、北窗窗台 0.9 / 窗洞到 2.0、大门过道 ≥ 2.4 m 宽；灶屋收成 x 82…90、z 480…486
const gy = sample(100, 488);
const roof = byId.get("GengFrontRoof");
Near(BlockCenterY(roof, sample) + roof.h / 2, gy + G.frontRoom.roofH, 0.1, "前屋平顶高");
Near(byId.get("GengWindowSill").h, G.window.sillH, 0.01, "窗台高");
const wl = byId.get("GengWindowLintel");
Near(BlockCenterY(wl, sample) - wl.h / 2, gy + G.window.topH, 0.1, "窗洞顶");
assert.ok(G.carriageGate.maxX - G.carriageGate.minX >= 2.4, "大门过道 ≥ 2.4 m（驴车要进后院）");
assert.ok(G.kitchen.box.maxX <= 90 && G.kitchen.box.maxZ <= 486, "灶屋收到 x ≤ 90、z ≤ 486（09-6 视线要从它东南角外头过）");
for (const id of ["KitchenRoof", "SideRoomRoof", "MillStone", "Roller", "CellarRimNorth", "GengHaystack", "OverturnedCart_S1", "CartWheel_S1", "NeighborHouse",
  "StrawStack_F1", "ShrineBack", "ShrineWest", "ShrineEast", "ShrineRoof", "PocketNorthWall_1", "PocketEastWall", "AlleyPassageWest", "AlleyPassageEast", "House_NA1", "House_NA2"]) assert.ok(byId.has(id), `缺体块 ${id}`);
assert.ok(!byId.has("House_EN2"), "场院里不盖房");
assert.ok(all.filter((x) => /^DeadTree_/.test(x.id)).length === L0610_FROM_0105.gullyTrees.length, "干沟南岸的枯树照 0105 的表");
// 翻倒的大车：横在主街偏东、1.1–1.2 m 高、车轮立在车身上
const cart = byId.get("OverturnedCart_S1");
assert.ok(cart.h >= 1.1 && cart.h <= 1.2, `翻倒的大车高 ${cart.h}（要 1.1…1.2，3–4 个人蹲它北侧）`);
assert.ok(cart.x - cart.w / 2 >= 99.3 && cart.x + cart.w / 2 <= ST.main.x + ST.main.halfW - 0.5, `大车 x ${cart.x - cart.w / 2}…${cart.x + cart.w / 2} 要在主街东半边（西边留给街口看北窗的视线扇）`);
assert.ok(cart.w >= 2.5 && Math.abs(cart.ry) < 0.01, "大车横在街上（长边沿 x）");
const wheel = byId.get("CartWheel_S1");
assert.ok(BlockCenterY(wheel, sample) - wheel.h / 2 >= BlockCenterY(cart, sample) + cart.h / 2 - 0.05, "车轮立在车身上");
// 麦秸垛、土地庙
const straw = byId.get("StrawStack_F1");
assert.ok(straw.w >= 4 && straw.h >= 3 && Math.abs(straw.x - EY.strawStack.x) < 0.01 && Math.abs(straw.z - EY.strawStack.z) < 0.01, "麦秸垛约 4 m 宽 3 m 高");
assert.ok(straw.x > EY.farmyard.minX && straw.x < EY.farmyard.maxX && straw.z > EY.north.box.minZ && straw.z < ST.east.z - ST.east.halfW, "麦秸垛在场院里");
const shrineBack = byId.get("ShrineBack");
assert.ok(shrineBack.z + shrineBack.d / 2 <= ST.east.z + ST.east.halfW + 0.3 && shrineBack.h >= 1.7, "土地庙贴着东街南侧院墙、开口朝北");
assert.ok(byId.get("ShrineWest").z < shrineBack.z && byId.get("ShrineRoof").y > sample(EY.shrine.x, EY.shrine.z) + 1.5, "土地庙三面墙 + 顶");

// --- 场院对东街敞开：南墙 x 156…176 没有墙；北角、院子链三道门洞 ---
const solids = SolidBlocks(a, []);
const Intersects = (blk, box) => {
  const hw = blk.w / 2, hd = blk.d / 2; // 街墙 / 房子都不转
  return blk.x + hw > box.minX && blk.x - hw < box.maxX && blk.z + hd > box.minZ && blk.z - hd < box.maxZ;
};
const farmOpen = { minX: EY.farmyard.openFromX + 0.1, maxX: EY.farmyard.openToX - 0.1, minZ: ST.east.z - ST.east.halfW - 0.6, maxZ: ST.east.z - ST.east.halfW };
assert.deepEqual(solids.filter((blk) => Intersects(blk, farmOpen)).map((x) => x.id), [], "场院南墙中段要敞开");
const pocket = { minX: SY.eastOfMain.box.minX + 0.3, maxX: ST.pocket.box.maxX - 0.3, minZ: ST.pocket.box.minZ + 0.3, maxZ: ST.pocket.box.maxZ + 0.6 };
assert.deepEqual(solids.filter((blk) => !blk.prop && Intersects(blk, pocket)).map((x) => x.id), [], "小空地北角里没有墙（主街东侧最南那院的西南角收掉了）");
const DoorOpen = (axis, fixed, c, w, what) => {
  const box = axis === "x" ? { minX: c - w / 2 + 0.1, maxX: c + w / 2 - 0.1, minZ: fixed - 0.3, maxZ: fixed + 0.3 } : { minX: fixed - 0.3, maxX: fixed + 0.3, minZ: c - w / 2 + 0.1, maxZ: c + w / 2 - 0.1 };
  const hits = SolidBlocks(a, [SIG.northYardGatesBroken]).filter((blk) => blk.h > 0.5 && Intersects(blk, box) && !/Lintel/.test(blk.id));
  assert.deepEqual(hits.map((x) => x.id), [], `${what} 门砸倒以后要通`);
  const closed = SolidBlocks(a, []).filter((blk) => blk.h > 0.5 && Intersects(blk, box) && !/Lintel/.test(blk.id));
  assert.ok(closed.length === 1 && closed[0].gate, `${what} 平时要有一扇关着的门`);
};
const NC = EY.northChain;
DoorOpen("x", NC.pocketGate.z, NC.pocketGate.x, NC.pocketGate.w, "北角的院门");
DoorOpen("z", NC.yard1Door.x, NC.yard1Door.z, NC.yard1Door.w, "北侧第一个院的西门");
DoorOpen("z", NC.farmyardDoor.x, NC.farmyardDoor.z, NC.farmyardDoor.w, "场院西隔墙的门");

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
// 邻院西墙的小门敞着（没有门扇）
const neighborDoor = { minX: 59.5, maxX: 60.5, minZ: 489.6, maxZ: 490.4 };
assert.deepEqual(solids.filter((blk) => blk.h > 0.5 && Intersects(blk, neighborDoor) && !/Lintel/.test(blk.id)).map((x) => x.id), [], "邻院西墙的小门要敞着");

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
for (const r of s.shooterToWindow) assert.ok(r.block === null && r.ground <= 0, `街口坡道上趴着的 ${r.at.who} 要看得见北窗机枪手：${r.block ? `被 ${r.block} 挡` : `地面挡 ${r.ground}`}`);
for (const r of s.windowToAlley) assert.ok(r.block !== null || r.ground > 0, `北窗机枪不许看见${r.name}`);
assert.ok(s.sideToMgBacks.some((r) => r.block === null), `09-6 侧门里几步透过前屋南门要看得见机枪组至少一人的后背：${s.sideToMgBacks.map((r) => `${r.who} 被 ${r.block} 挡`).join("、")}`);
assert.ok(Math.hypot(s.eyes.side09_6.x - P.sideGate.x, s.eyes.side09_6.z - P.sideGate.z) <= 6, "09-6 的站点离侧门 ≤ 6 m");
assert.equal(s.windowToCartHide, "OverturnedCart_S1", `北窗到大车北侧蹲着的人要被大车挡：${s.windowToCartHide}`);
// 门缝视线用来凑数的眼位必须在门外（x < 墙）
assert.ok(s.eyes.gateCrack.x < G.sharedWall.x - 0.5 && s.eyes.crack.x < G.sharedWall.x - 0.5);

// --- 街：东街又窄又直、净空 3.5（土地庙是故意贴墙放的摆件）；主街净空 6（翻倒的大车是故意摆的）；巷子不通主街 ---
const eastStrip = { minX: ST.east.fromX + 0.5, maxX: ST.east.toX - 0.5, minZ: ST.east.z - ST.east.halfW, maxZ: ST.east.z + ST.east.halfW };
const eastHits = solids.filter((blk) => !blk.prop && Intersects(blk, eastStrip));
assert.deepEqual(eastHits.map((x) => x.id), [], "东街 3.5 m 净空里不能有墙 / 房子");
const eastWalls = solids.filter((x) => /^EastStreet(North|South)Wall/.test(x.id));
assert.ok(eastWalls.length >= 8 && eastWalls.every((x) => Math.abs(x.z - (ST.east.z - ST.east.halfW - 0.25)) < 0.01 || Math.abs(x.z - (ST.east.z + ST.east.halfW + 0.25)) < 0.01), "东街两边的墙在一条直线上");
assert.ok(ST.east.toX - ST.east.fromX >= 100, "东街长 ≥ 100 m");
const mainStrip = { minX: ST.main.x - ST.main.halfW + 0.3, maxX: ST.main.x + ST.main.halfW - 0.3, minZ: ST.main.fromZ + 1, maxZ: ST.square.box.minZ - 1 };
const mainHits = solids.filter((blk) => !blk.prop && Intersects(blk, mainStrip));
assert.deepEqual(mainHits.map((x) => x.id), [], "主街 6 m 净空里不能有墙 / 房子");
const alleyToStreet = { minX: SY.westOfMain.box.maxX - 0.3, maxX: SY.westOfMain.box.maxX + 0.3, minZ: ST.alleyWest.z - 0.8, maxZ: ST.alleyWest.z + 0.8 };
assert.ok(solids.some((blk) => /^MainWestWall/.test(blk.id) && Intersects(blk, alleyToStreet)), "巷子东西那截在主街那头要封死");
const passage = { minX: ST.alleyNorth.x - ST.alleyNorth.halfW + 0.1, maxX: ST.alleyNorth.x + ST.alleyNorth.halfW - 0.1, minZ: ST.alleyNorth.fromZ, maxZ: ST.alleyWest.z + ST.alleyWest.halfW };
assert.deepEqual(solids.filter((blk) => Intersects(blk, passage)).map((x) => x.id), [], "巷子北头的夹道 2 m 宽要通到路沟南沿");
// 村口（蹲着 1.2）→ 北窗里的机枪手（1.0）这条线上不能有摆件
assert.equal(BlockSight(solids, sample, { x: 100, z: 385, eye: 1.2 }, { x: G.mgPost.x, z: G.mgPost.z, eye: 1.0 }), null, "村口到北窗的视线被摆件挡了");

console.log(`ok：${a.blocks.length} 块 + ${a.gates.length} 随信号块，${a.terrain.cols}×${a.terrain.rows} 网格；与 0105 接缝最大差 ${cmp ? cmp.worst : "—"} m；`
  + `凹路 z260 深 ${LaneDepthAt(sample, 260).depth} m、z370 深 ${LaneDepthAt(sample, 370).depth} m；路沟 x80 底 ${DitchSectionAt(sample, 80).floor} 宽 ${DitchSectionAt(sample, 80).floorW} m；`
  + `河汊子 z400 底 ${RiverSectionAt(sample, 400).floor} 宽 ${RiverSectionAt(sample, 400).floorW} m；狗洞 ${hole.w.toFixed(2)} m`);
