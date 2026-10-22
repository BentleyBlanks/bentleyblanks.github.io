// Script_EditorBlockoutFirstLevel1218SceneTest.mjs —— 11–18 白盒（第二版）场景生成器的 node 回归（只给场景包自验用）
// 跑法：node Taierzhuang1938/Script_EditorBlockoutFirstLevel1218SceneTest.mjs
// 钉住 10-23 契约「必须成立」的七条：
//   1 墙根小路从村南口到石板桥连续、宽 ≥ 2.5 m 没有挡路的块、与 0610 地面接缝差 0；
//   2 河汊子 1218 段横断面与 0610 一致（沟底 −2.7、宽约 6、两壁 ≥ 2.5 深、沟底有水块），连续通到北沙河；
//   3 石板桥面与两岸齐平、人站得上（站人取地 = 桥面）、桥下是水；
//   4 豁子上的机枪看得见石板桥西头和渡口人堆，看不见河堤底下趴着的人；
//   5 翻车处到河堤底下 ≤ 20 m、中间没有掩体；
//   6 浮桥头、接收院院门、散兵坑互相走得通；土坎西边蹲着的人桥头机枪看不见、离开土坎就看得见；
//   7 没有旧大路 / 排水沟 / 旧浮桥 / 旧院子的残留体块，块都在新 bounds 里。
// 另查：生成两次逐字相同、过 ValidateBlockoutScene；两道堤顶与口子；浮桥 14 段连续、每段有船、桥面离浅滩 ≤ 1.0、引道接桥面高差 ≤ 0.15；
// 接收院大门 / 厢房门与门槛；散兵坑深 0.8–1.0、土袋在东北沿；北门门洞与城墙；四个信号的随信号体块齐全；庄子西南角的豁子（0610 那几块不带、补的几截在）。

import assert from "node:assert/strict";
import { ValidateBlockoutScene } from "./Script_EditorBlockoutConfig.mjs";
import { HeightGridSampler } from "./Script_EditorBlockoutLevels.mjs";
import { BlockStandSampler } from "./Script_EditorBlockoutPrevizPlan.mjs";
import {
  BuildFirstLevel1218Scene, CompareWith0610, HechaSectionAtZ, LaneProfile, BlocksNearLine, RectDist, L1218SightChecks, BlockCenterY, SolidBlocks, HECHA_FLOOR_Y,
} from "./Script_EditorBlockoutFirstLevel1218Scene.mjs";
import {
  L1218_GROUND, L1218_HEIGHTS as H, L1218_LANE as LN, L1218_HECHA as HC, L1218_STONE_BRIDGE as SB, L1218_TROUGH as TG, L1218_BANK as BK, L1218_LEVEES as LV,
  L1218_RIVER as RV, L1218_BRIDGE as BR, L1218_FERRY as FY, L1218_TRENCH as TR, L1218_YARD as Y, L1218_BREACH as BCH, L1218_SOUTH as S, L1218_SIGNALS as SIG,
  L1218_PLACES as PL, L1218_BOUNDS as B, TrenchPoint,
} from "./Data_EditorBlockoutFirstLevel1218Space.mjs";

const opts = { commit: "test", generatedAt: "2026-10-23T00:00:00.000Z" };
const a = await BuildFirstLevel1218Scene({ ...opts, notes: [] });
const b = await BuildFirstLevel1218Scene({ ...opts, notes: [] });
assert.equal(JSON.stringify(a), JSON.stringify(b), "生成两次要逐字相同");
const check = ValidateBlockoutScene(a);
assert.ok(check.ok, check.errors.join("; "));
assert.ok(JSON.stringify(a).length < 2 * 1024 * 1024, "场景文件要在 2 MB 以内");

const sample = HeightGridSampler(a.terrain);
const stand = BlockStandSampler(a.blocks, a.gates, sample, () => false);
const Near = (got, want, tol, what) => assert.ok(Math.abs(got - want) <= tol, `${what}: ${got.toFixed(2)} vs ${want}±${tol}`);
const all = [...a.blocks, ...a.gates];
const byId = new Map(all.map((x) => [x.id, x]));
assert.equal(byId.size, all.length, "块 id 全关唯一");
assert.ok(a.blocks.every((x) => !x.signal && !x.appearSignal), "blocks 里不许带信号");

// --- 1. 墙根小路：接缝差 0、沿线连续、宽 3 m 内没有挡路的块 ---
const cmp = CompareWith0610(sample);
assert.ok(cmp.worst <= 0.001, `接缝 z ${L1218_GROUND.seamZ}±1 与 0610 地面不一致：最大差 ${cmp.worst} m（(${cmp.at.x},${cmp.at.z})）`);
if (cmp.file) assert.ok(cmp.file.worst <= 0.02, `村南那一截与 0610 场景文件不一致：最大差 ${cmp.file.worst} m（(${cmp.file.at.x},${cmp.file.at.z})）`);
else console.log("提示：没有 Blockout/FirstLevel0610.scene.json，跳过与场景文件的比对");
assert.ok(LN.halfW * 2 >= 2.5, "墙根小路净宽 ≥ 2.5 m");
const lane = LaneProfile(sample);
assert.ok(lane.points.length > 150 && lane.maxStep <= 0.12, `墙根小路沿线每 0.5 m 落差最大 ${lane.maxStep}（要 ≤ 0.12，驴车过得去）`);
assert.ok(lane.maxLat <= 0.2, `墙根小路横向高差最大 ${lane.maxLat}（(${lane.at?.x},${lane.at?.z})）`);
Near(lane.end, H.bridgeDeckY, 0.03, "小路到桥东头与桥面齐平");
const laneBlocks = BlocksNearLine(a.blocks, LN.line.filter((p) => p.z >= 547), LN.halfW - 0.25);
assert.deepEqual(laneBlocks, [], `墙根小路离中线 ${LN.halfW - 0.25} m 内有挡路的块：${laneBlocks.join(",")}`);
Near(sample(PL.villageSouth.x, PL.villageSouth.z), 0.3 - 0.12, 0.08, "村南口（0610 的街面）");
// 0610 村南那一截带过来了（含开着的便门扇、塌进胡同的墙、村南的院子）
assert.ok(byId.has("GengHaystack") && byId.has("House_SW1_1") && byId.has("SideGateLeafOpen") && byId.has("LaneWallFallen"), "0610 村南那一截的块带过来了");
assert.ok(!byId.has("BackDoorLeaf") && !byId.has("SideGateLeaf") && !byId.has("CellarSmoke"), "0610 关着 / 原样的那一份与窖口冒烟不带");

// --- 2. 河汊子：横断面与 0610 一致、笔直通到北沙河、沟底有水 ---
for (const z of [560, 575, 590, 605, 620]) {
  const r = HechaSectionAtZ(sample, z);
  Near(r.floor, HECHA_FLOOR_Y, 0.05, `河汊子 z${z} 沟底`);
  assert.ok(Math.min(r.minus, r.plus) - r.floor >= 2.5, `河汊子 z${z} 不够深：${(Math.min(r.minus, r.plus) - r.floor).toFixed(2)}`);
  assert.ok(r.floorW >= 5.5 && r.floorW <= 8.5, `河汊子 z${z} 沟底宽 ${r.floorW}（要约 6 m）`);
}
Near(sample(HC.centerX, 556), HECHA_FLOOR_Y, 0.05, "河汊子直段在接缝处（中线跟 0610 的 L0610_RIVER.centerX 走）");
Near(sample(HC.centerX, LV.north.z), HECHA_FLOOR_Y, 0.05, "河汊子从北堤的口子里穿过去");
for (let z = 556; z <= 640; z += 2) if (z < SB.sill.fromZ - SB.sill.wallM || z > SB.sill.toZ + SB.sill.wallM) Near(sample(HC.centerX, z), HECHA_FLOOR_Y, 0.05, `河汊子 z${z} 沟底连续`);
assert.ok(sample(HC.centerX, 648) <= H.waterY && sample(HC.centerX, 655) <= H.waterY, "河汊子入河口通进北沙河（河边以下）");
const hechaWater = a.blocks.filter((x) => /^HechaWater_/.test(x.id)).sort((p, q) => p.z - q.z);
assert.ok(hechaWater.length === 2 && hechaWater.every((x) => x.solid === false && x.semantic === "water" && Math.abs(x.x - HC.centerX) < 0.01), "河汊子沟底的水块：两段、不实心、在中线上");
Near(hechaWater[0].z - hechaWater[0].d / 2, HC.waterFromZ, 0.02, "河汊子的水从 0610 的 RiverWater_2 末尾接上");
assert.ok(hechaWater[1].z + hechaWater[1].d / 2 >= HC.mouthZ - 2.5, "河汊子的水一直到入河口");
const river = byId.get("RiverWater");
assert.ok(river && river.d >= 50 && river.w >= B.maxX - B.minX - 1 && Math.abs(river.y + river.h / 2 - H.waterY) < 0.01, "北沙河的水面块盖住整条河、顶在水面高");

// --- 3. 石板桥：桥面与两岸齐平、站得上、桥下是水 ---
const deck = byId.get("StoneDeck");
assert.ok(deck && Math.abs(deck.x - deck.w / 2 - SB.fromX) < 0.01 && Math.abs(deck.x + deck.w / 2 - SB.toX) < 0.01 && deck.d >= 2.6 && Math.abs(deck.z - SB.z) < 0.01, "石板桥桥面板盖住沟顶宽");
const deckTop = deck.y + deck.h / 2;
Near(deckTop, H.bridgeDeckY, 0.01, "桥面顶");
Near(sample(SB.eastHead.x, SB.eastHead.z), deckTop, 0.03, "桥东头地面与桥面齐平");
Near(sample(SB.westHead.x, SB.westHead.z), deckTop, 0.03, "桥西头地面与桥面齐平");
for (let x = SB.fromX + 0.2; x <= SB.toX - 0.2; x += 0.5) {
  const t = sample(x, SB.z);
  assert.ok(deckTop - t <= 1.0 && deckTop - t >= 0, `桥面 x${x.toFixed(1)} 离底下地面 ${(deckTop - t).toFixed(2)} m（演员只能站 ≤ 1 m 的块顶）`);
  for (const dz of [-1.0, 0, 1.0]) Near(stand(x, SB.z + dz), deckTop, 0.01, `桥面 (${x.toFixed(1)},${(SB.z + dz).toFixed(1)}) 站上去的高度`);
}
const pool = byId.get("BridgeWater");
assert.ok(pool && pool.semantic === "water" && pool.solid === false && pool.z - pool.d / 2 <= SB.z - SB.deckW / 2 && pool.z + pool.d / 2 >= SB.z + SB.deckW / 2, "桥下那一汪水盖住桥面底下");
assert.ok(pool.y + pool.h / 2 > sample(HC.centerX, SB.z) + 0.1 && pool.y + pool.h / 2 < deckTop - 0.5, "桥下是水：水面在石滩上头、桥面底下");
assert.ok(a.blocks.filter((x) => /^StonePier_/.test(x.id)).length === SB.piersAtX.length && a.blocks.filter((x) => /^StonePier_/.test(x.id)).every((x) => x.y + x.h / 2 <= deck.y - deck.h / 2 + 0.01), "两个石墩顶在桥面板底下");
assert.ok(!all.some((x) => /^(Post_|Rail)/.test(x.id) && Math.abs(x.z - SB.z) < 3 && x.x > 20 && x.x < 48), "石板桥没有栏杆");

// --- 4. 豁子上的机枪：看得见石板桥西头和渡口人堆、看不见河堤底下趴着的人 ---
for (const id of BCH.removes0610) assert.ok(!byId.has(id), `0610 的 ${id} 在 1218 里不该带（豁子）`);
for (const id of ["VillageWestEdge_N", "VillageSouthEdge_E", "Wall_SW1_SouthE", "Fence_SW1b_NE", "BreachRubble", "BreachRubbleWest"]) assert.ok(byId.has(id), `缺豁子的块 ${id}`);
assert.ok(byId.get("VillageWestEdge_N").z + byId.get("VillageWestEdge_N").d / 2 <= BCH.westWall.fromZ + 0.01 && byId.get("Wall_SW1_SouthE").x - byId.get("Wall_SW1_SouthE").w / 2 >= BCH.southWall.toX - 0.01, "村西边墙到 z 533 为止、SW1 南墙从 x 46 起");
const rubble = byId.get("BreachRubble");
assert.ok(rubble.h <= 1.0 && stand(BCH.mgPost.x, BCH.mgPost.z) - sample(BCH.mgPost.x, BCH.mgPost.z) >= 0.85, "机枪手趴的瓦砾堆 ≤ 1 m、站得上去");
assert.equal(byId.get("BreachRubbleBlast").appearSignal, SIG.breachBlasted, "14 末炸塌的那堆随 BreachBlasted 出现");
const s = L1218SightChecks(a, sample, stand);
const Clear = (r, what) => assert.ok(r.block === null && r.ground <= 0, `${what}：${r.block ? `被 ${r.block} 挡` : `地面挡 ${r.ground}`}`);
const Blocked = (r, what) => assert.ok(r.ground > 0.1 || r.block, `${what}（地面挡 ${r.ground}）`);
Clear(s.mgToBridge, "豁子上的机枪要看得见石板桥西头");
Clear(s.mgToCrowd, "豁子上的机枪要看得见渡口人堆");
Blocked(s.mgToTrough, "豁子上的机枪要看不见河堤底下趴着的人");
assert.ok(s.mgToBridge.distM >= 25 && s.mgToBridge.distM <= 45 && s.mgToCrowd.distM >= 80 && s.mgToCrowd.distM <= 110, `机枪位到桥西头 ${s.mgToBridge.distM} m、到人堆 ${s.mgToCrowd.distM} m（契约约 30 / 90）`);
Clear(s.villageToBridge, "站在村南口往西要看得见石板桥西头");
// 河汊子西坎上甩手榴弹的位置：在西坎顶、离豁子 ≤ 20 m、不在沟里
for (const p of BCH.grenadeFrom) { assert.ok(sample(p.x, p.z) > -0.2 && Math.hypot(p.x - BCH.mgPost.x, p.z - BCH.mgPost.z) <= 20, `甩手榴弹的位置 (${p.x},${p.z}) 要在西坎顶、离豁子 ≤ 20 m`); }

// --- 5. 翻车处到河堤底下 ≤ 20 m、中间没有掩体 ---
const toTrough = { x: Math.max(TG.box.minX, Math.min(TG.box.maxX, PL.cartRaidAt.x)), z: Math.max(TG.box.minZ, Math.min(TG.box.maxZ, PL.cartRaidAt.z)) };
const dragM = Math.hypot(toTrough.x - PL.cartRaidAt.x, toTrough.z - PL.cartRaidAt.z);
assert.ok(dragM <= 20 && dragM >= 8, `翻车处到河堤底下 ${dragM.toFixed(1)} m（要 ≤ 20）`);
Near(sample(PL.troughAt.x, PL.troughAt.z), TG.floorY, 0.05, "河堤底下的低洼底");
assert.ok(sample(PL.troughAt.x, PL.troughAt.z - 6) - sample(PL.troughAt.x, PL.troughAt.z) >= 0.8, "低洼比河滩低 ≥ 0.8");
const dragCover = BlocksNearLine(a.blocks, [PL.cartRaidAt, PL.troughAt], 1.5, 0.4).filter((id) => !/^OverturnedCart/.test(id));
assert.deepEqual(dragCover, [], `翻车处到河堤底下中间有掩体：${dragCover.join(",")}`);
let step = 0;
for (let t = 0; t < 1; t += 0.02) {
  const p = { x: PL.cartRaidAt.x + (PL.troughAt.x - PL.cartRaidAt.x) * t, z: PL.cartRaidAt.z + (PL.troughAt.z - PL.cartRaidAt.z) * t };
  const q = { x: PL.cartRaidAt.x + (PL.troughAt.x - PL.cartRaidAt.x) * (t + 0.02), z: PL.cartRaidAt.z + (PL.troughAt.z - PL.cartRaidAt.z) * (t + 0.02) };
  step = Math.max(step, Math.abs(sample(q.x, q.z) - sample(p.x, p.z)));
}
assert.ok(step <= 0.35, `拖人那条线上每 0.35 m 落差最大 ${step.toFixed(2)}（低洼的坡要拖得下去）`);

// --- 6. 浮桥头、院门、散兵坑互相走得通；土坎 ---
const Walkable = (line, what) => {
  const hits = BlocksNearLine(a.blocks, line, 0.4, 0.6).filter((id) => !/^(TrenchSandbags|Boat_)/.test(id));   // 船在桥板底下，不挡桥面上的人
  assert.deepEqual(hits, [], `${what} 被块挡住：${hits.join(",")}`);
  for (let i = 1; i < line.length; i++) {
    const p = line[i - 1], q = line[i], n = Math.ceil(Math.hypot(q.x - p.x, q.z - p.z) / 0.5);
    for (let k = 1; k <= n; k++) {
      const a0 = { x: p.x + (q.x - p.x) * (k - 1) / n, z: p.z + (q.z - p.z) * (k - 1) / n }, a1 = { x: p.x + (q.x - p.x) * k / n, z: p.z + (q.z - p.z) * k / n };
      assert.ok(Math.abs(stand(a1.x, a1.z) - stand(a0.x, a0.z)) <= 0.5, `${what} 在 (${a1.x.toFixed(1)},${a1.z.toFixed(1)}) 一步高差 ${Math.abs(stand(a1.x, a1.z) - stand(a0.x, a0.z)).toFixed(2)}`);
    }
  }
};
const gateOut = { x: Y.box.maxX + 1.3, z: Y.gate.z }, squareMid = { x: -8, z: 620 }, slot = TrenchPoint(TR.slots[1]), slotBack = TrenchPoint(TR.slots[1], -1.6);
Walkable([PL.ferryHead, squareMid, gateOut], "浮桥头 → 空场 → 接收院院门");
Walkable([gateOut, { x: Y.box.maxX - 1.3, z: Y.gate.z }, { x: Y.xiang.door.x, z: Y.xiang.box.minZ - 1.3 }], "院门 → 院里 → 厢房门口");
Walkable([squareMid, { x: 4, z: 616 }, slotBack, slot], "空场 → 散兵坑");
Walkable([PL.ferryHead, { x: BR.x, z: BR.northFootZ }, { x: BR.x, z: 680 }], "浮桥头 → 浮桥");
Blocked(s.mg18ToCover, "石板桥头趴着的机枪要看不见土坎西边蹲着的最后一拨人");
Clear(s.mg18ToExposed, "离开土坎往渡口跑的人机枪要看得见");
assert.ok(sample((BK.box.minX + BK.box.maxX) / 2, 583) >= H.bankTopY - 0.05 && sample((BK.box.minX + BK.box.maxX) / 2, 583) - sample(PL.lastGroupCover.x, PL.lastGroupCover.z) >= 1.2, "土坎顶 1.7、比坎西边高 ≥ 1.2");
Clear(s.trenchToBridge, "散兵坑里站着越过土袋要看得见石板桥西头");

// --- 7. 没有旧东西的残留 ---
for (const x of all) if (x.z >= 548) assert.ok(x.x >= B.minX && x.x <= B.maxX && x.z <= B.maxZ, `${x.id} 在场地外 (${x.x},${x.z})`);   // z < 548 是 0610 的村子（东头出界的院子照旧带着）
assert.ok(!all.some((x) => /^(YardNorth(House|North|South|West|East)|YardWest(House|North|South|West|East)|HandCart_R|Bundle_R|AmmoBox_R|AmmoBox_Q)/.test(x.id)), "旧的桥头院子 / 大路摆件不该还在");
assert.ok(!all.some((x) => x.x < -62 && x.z > 580 && x.z < 760), "x < −62、河边那一片不该有块（旧浮桥 / 旧院子 / 旧铁路桥的地方）");
assert.ok(a.ways.trenches.length === TR.segments.length && a.ways.roads.length === 6 && !a.ways.roads.some((r) => r.some((p) => Math.abs(p.z - 612) < 0.01 && p.x < 0)), "ways 里只有散兵坑两段，没有旧大路 / 排水沟");
for (const x of [-40, 0, 20, 60, 100]) assert.ok(Math.abs(sample(x, 612) - sample(x, 611)) < 0.3 || x < 6, `(${x},612) 旧大路的槽不该还在`);
assert.ok(byId.get("RailGirder").x >= B.maxX - 12 && byId.has("RailPier_1"), "远处的铁路桥在东边远处");

// --- 两道堤：顶 1.5、浮桥 / 河汊子处有口子 ---
for (const x of [-110, -60, -30, 10, 60, 120]) {
  Near(sample(x, LV.north.z), H.leveeCrestY, 0.05, `北堤顶 x${x}`);
  Near(sample(x, LV.south.z), H.leveeCrestY, 0.05, `南堤顶 x${x}`);
}
assert.ok(sample(BR.x, LV.north.z) < 0.5 && sample(BR.x, LV.south.z) < 0.6, "浮桥处两道堤都留了口子");
for (const x of [-100, -40, 60, 120]) Near(sample(x, 675), H.riverBedY, 0.05, `河底 x${x}`);
Near(sample(BR.x, 675), H.bridgeBarY, 0.03, "桥底浅滩");

// --- 浮桥：14 段连续、桥面顶 −0.95±0.02、每段底下有船、离浅滩 ≤ 1.0、引道接桥面高差 ≤ 0.15 ---
const decks = all.filter((x) => x.deck).sort((p, q) => p.z - q.z);
const boats = all.filter((x) => x.boat);
assert.equal(decks.length, 14, "桥面板 14 段");
assert.equal(boats.length, 14, "每段底下一条船");
decks.forEach((d, i) => {
  Near(d.y + d.h / 2, H.deckTopY, 0.02, `桥面板 ${d.id} 顶`);
  assert.ok(Math.abs(d.x - BR.x) < 0.01, `${d.id} 在浮桥中线 x ${BR.x}`);
  if (i) { const lap = decks[i - 1].z + decks[i - 1].d / 2 - (d.z - d.d / 2); assert.ok(lap >= -0.001 && lap <= 0.04, `桥面板 ${d.id} 与前一段要接上（搭 ${lap.toFixed(3)} m，不许留缝）`); }
  const boat = boats.find((x) => Math.abs(x.z - d.z) < 0.05);
  assert.ok(boat && Math.abs(boat.y + boat.h / 2 - (d.y - d.h / 2)) < 0.02, `${d.id} 底下的船顶要贴桥面板底`);
  for (const dz of [-d.d / 2 + 0.2, 0, d.d / 2 - 0.2]) {
    const t = sample(d.x, d.z + dz), top = d.y + d.h / 2;
    assert.ok(top - t <= 1.0 && top - t >= 0, `${d.id} 桥面离底下地面 ${(top - t).toFixed(2)} m（演员只能站 ≤ 1 m 的块顶）`);
    Near(stand(d.x, d.z + dz), H.deckTopY, 0.02, `${d.id} 站上去的高度`);
  }
});
Near(decks[0].z - decks[0].d / 2, BR.northFootZ, 0.02, "北头桥脚"); Near(decks[13].z + decks[13].d / 2, BR.southFootZ, 0.02, "南头桥脚");
assert.ok(Math.abs(sample(BR.x, BR.northFootZ - 0.3) - H.deckTopY) <= 0.15 && Math.abs(sample(BR.x, BR.southFootZ + 0.3) - H.deckTopY) <= 0.15, "引道接桥面那一下高差 ≤ 0.15");
assert.ok(sample(BR.x, BR.northRampFromZ) > -0.1 && sample(BR.x, BR.southRampToZ) > -0.1, "引道两头在平地高");
for (let z = BR.northRampFromZ; z < BR.northFootZ; z += 0.5) assert.ok(Math.abs(sample(BR.x, z + 0.5) - sample(BR.x, z)) <= 0.25, `北引道 z${z} 太陡`);
for (let z = BR.southFootZ + 0.5; z < BR.southRampToZ; z += 0.5) assert.ok(Math.abs(sample(BR.x, z + 0.5) - sample(BR.x, z)) <= 0.25, `南引道 z${z} 太陡`);
assert.ok(all.filter((x) => /^Post_/.test(x.id)).length >= 12 && all.filter((x) => /^BridgeLantern_/.test(x.id)).length === 3, "栏杆桩与三盏马灯");

// --- 渡口：空场压平、土台子、渡口人家在院东边 ---
assert.ok(byId.get("FerryPlatform")?.h <= 1.0 && stand(FY.soldierPost.x, FY.soldierPost.z) - sample(FY.soldierPost.x, FY.soldierPost.z) >= 0.5, "兵站的土台子站得上去");
assert.ok(a.blocks.filter((x) => /^FerryHouse_/.test(x.id)).length === FY.houses.length && a.blocks.filter((x) => /^FerryHouse_/.test(x.id)).every((x) => x.x > Y.box.maxX - 2 && x.z < FY.square.minZ + 0.5), "两三间渡口人家在接收院东边、空场北边");
for (const [x, z] of [[-18, 610], [-8, 626], [2, 616]]) Near(sample(x, z), H.plain, 0.05, `空场 (${x},${z}) 压平`);

// --- 接收院：大门 ≥ 1.6、厢房门洞 ≥ 1.1 且有门槛、厢房空心 + 平顶；院门朝东对着河滩 ---
const east = a.blocks.filter((x) => x.id.startsWith("YardEast")).sort((p, q) => p.z - q.z);
const gateW = east[1].z - east[1].d / 2 - (east[0].z + east[0].d / 2);
assert.ok(gateW >= 1.6 && Math.abs(east[0].x - Y.box.maxX) < 0.01, `接收院大门 ${gateW.toFixed(2)} m（要 ≥ 1.6）、开在东墙`);
const xn = a.blocks.filter((x) => x.id.startsWith("XiangNorth")).sort((p, q) => p.x - q.x);
const doorW = xn[1].x - xn[1].w / 2 - (xn[0].x + xn[0].w / 2);
assert.ok(doorW >= 1.1, `厢房门洞 ${doorW.toFixed(2)} m（要 ≥ 1.1）`);
const th = byId.get("XiangThreshold");
assert.ok(th && th.h >= 0.12 && th.h <= 0.2 && Math.abs(th.x - Y.xiang.door.x) < 0.01 && Math.abs(th.z - Y.xiang.box.minZ) < 0.01, "厢房门槛");
Near(stand(Y.xiang.door.x, Y.xiang.box.minZ) - sample(Y.xiang.door.x, Y.xiang.box.minZ), th.h, 0.01, "门槛站上去抬高");
const lintel = byId.get("XiangDoorLintel");
assert.ok(BlockCenterY(lintel, sample) - lintel.h / 2 - sample(Y.xiang.door.x, Y.xiang.box.minZ) >= 1.95, "厢房门洞高 ≥ 1.95");
assert.ok(byId.has("XiangRoof") && byId.has("YardMainHouse") && byId.has("YardKitchen") && byId.has("YardGateLamp") && byId.has("YardGateLampPost"), "接收院的房子、平顶、灯桩");
assert.ok(!a.blocks.some((x) => x.house && x.x > Y.xiang.box.minX && x.x < Y.xiang.box.maxX && x.z > Y.xiang.box.minZ && x.z < Y.xiang.box.maxZ), "厢房是空心的");
Near(sample(Y.dongguaInside.x, Y.dongguaInside.z), H.plain, 0.05, "厢房里地面");
assert.ok(a.blocks.filter((x) => /^Straw_/.test(x.id)).length >= 6 && byId.has("WaterVat_Y1") && byId.has("DoorBoard_Y1"), "院里的麦秸、水缸、门板");
Clear(s.southToNorth, "南堤后要看得见北岸堤上的人");
Clear(s.southToLamp, "南堤后要看得见院门灯桩上的马灯");
assert.ok(s.southToInnerLamp.block !== null, "院里地上那盏马灯从南岸看不见（被院墙 / 厢房挡），所以才在灯桩上挂一盏");

// --- 散兵坑：朝东北、两段、深 0.8–1.0、土袋在东北沿 ---
for (const u of TR.slots) {
  const p = TrenchPoint(u), back = TrenchPoint(u, -1.6), front = TrenchPoint(u, 1.6);
  const depth = Math.max(sample(back.x, back.z), sample(front.x, front.z)) - sample(p.x, p.z);
  assert.ok(depth >= 0.8 && depth <= 1.0, `散兵坑站位 u${u} 深 ${depth.toFixed(2)}（要 0.8…1.0）`);
}
const mid = TrenchPoint(0);
assert.ok(sample(mid.x, mid.z) > sample(TrenchPoint(TR.slots[1]).x, TrenchPoint(TR.slots[1]).z) + 0.6, "两段散兵坑中间留口子");
const bags = all.filter((x) => /^TrenchSandbags_/.test(x.id));
assert.ok(bags.length === 2 && bags.every((x) => x.h === TR.sandbagH), "散兵坑两段各一溜土袋");
for (const bag of bags) { const f = { x: bag.x - TR.x, z: bag.z - TR.z }; assert.ok(f.x > 0 && f.z < 0 || Math.hypot(f.x, f.z) < 0.1 || (f.x - f.z) > 0, `土袋 ${bag.id} 要在坑的东北沿`); }
for (const bag of bags) assert.ok(RectDist(bag, TrenchPoint(TR.slots[1], TR.sandbagOffM).x, TrenchPoint(TR.slots[1], TR.sandbagOffM).z) < 0.4 || RectDist(bag, TrenchPoint(TR.slots[6], TR.sandbagOffM).x, TrenchPoint(TR.slots[6], TR.sandbagOffM).z) < 0.4, `土袋 ${bag.id} 顺着坑向立在东北沿`);

// --- 北门：门洞宽 4、城墙高 8、门洞上方封住、与浮桥对齐 ---
const wall = a.blocks.filter((x) => x.id.startsWith("CityWall")).sort((p, q) => p.x - q.x);
assert.equal(wall.length, 2, "城墙两段");
Near(wall[1].x - wall[1].w / 2 - (wall[0].x + wall[0].w / 2), S.gate.w, 0.01, "北门门洞宽");
assert.ok(wall.every((x) => x.h === S.wall.h && x.d === S.wall.t), "城墙高 8、厚 6");
assert.equal(S.gate.x, BR.x, "北门与浮桥对齐");
const top = byId.get("CityGateTop");
assert.ok(top && Math.abs(top.y - top.h / 2 - (sample(S.gate.x, S.wall.z) + S.gate.h)) < 0.05, "门洞上方从 4.5 m 起封住");
assert.ok(a.blocks.filter((x) => /^GateHouse_/.test(x.id)).length === 4 && byId.has("Torch_1") && byId.has("HandCart_G1"), "门内的房子、火把、小车");

// --- 随信号体块：四个信号齐全 ---
assert.ok(a.gates.every((g) => g.signal || g.appearSignal));
const signals = new Set(a.gates.flatMap((g) => [g.signal, g.appearSignal]).filter(Boolean));
for (const sg of Object.values(SIG)) assert.ok(signals.has(sg), `随信号体块缺信号 ${sg}`);
assert.equal(byId.get("OverturnedCart").appearSignal, SIG.cartOverturned);
assert.ok(Math.hypot(byId.get("OverturnedCart").x - PL.cartRaidAt.x, byId.get("OverturnedCart").z - PL.cartRaidAt.z) < 1 && byId.get("OverturnedCart").x > FY.square.minX && byId.get("OverturnedCart").x < 8, "翻倒的车在翻车处（渡口空场东沿）");
assert.ok(a.gates.filter((g) => /^Charge_/.test(g.id) && g.appearSignal === SIG.chargesSet).length === 4 && byId.get("Fuse").appearSignal === SIG.chargesSet, "四条船上的炸药包 + 引线");
assert.ok(BR.blownSegments.every((i) => byId.get(`Deck_${String(i + 1).padStart(2, "0")}`).signal === SIG.bridgeBlown && byId.get(`Boat_${String(i + 1).padStart(2, "0")}`).signal === SIG.bridgeBlown), "北头四段桥面与船随 BridgeBlown 消失");
assert.ok(a.gates.filter((g) => /^Debris/.test(g.id) && g.appearSignal === SIG.bridgeBlown).length === BR.debris.length, "碎桥面与歪着的船在下游出现");
assert.ok(a.gates.filter((g) => /^Debris/.test(g.id)).every((g) => g.x < BR.x - 5 && g.z >= 650 && g.z <= 700), "碎片在桥西边（下游）的水面上");
assert.ok(decks.filter((d) => !d.signal).length === 10, "桥炸了还剩 10 段");
assert.ok(SolidBlocks(a, [SIG.breachBlasted]).some((x) => x.id === "BreachRubbleBlast") && !SolidBlocks(a, []).some((x) => x.id === "BreachRubbleBlast"), "BreachBlasted 起豁子里多一堆");

console.log(`ok：${a.blocks.length} 块 + ${a.gates.length} 随信号块，${a.terrain.cols}×${a.terrain.rows} 网格，${(JSON.stringify(a).length / 1024 / 1024).toFixed(2)} MB；接缝最大差 ${cmp.worst} m；`
  + `小路最陡 ${lane.maxStep}；河汊子 z590 底 ${HechaSectionAtZ(sample, 590).floor}；桥面 ${deckTop}；机枪→桥西头 ${s.mgToBridge.distM} m / →人堆 ${s.mgToCrowd.distM} m；翻车→河堤底下 ${dragM.toFixed(1)} m；大门 ${gateW.toFixed(2)}、厢房门 ${doorW.toFixed(2)}`);
