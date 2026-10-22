// Script_EditorBlockoutFirstLevel1218SceneTest.mjs —— 12–18 白盒场景生成器的 node 回归（只给场景包自验用）
// 跑法：node Taierzhuang1938/Script_EditorBlockoutFirstLevel1218SceneTest.mjs
// 查：生成两次逐字相同（generatedAt 固定）、过 ValidateBlockoutScene；接缝 z = seamZ 两侧与 0610 地面逐点一致（差 ≤ 0.03）；
// 河汊子拐弯后离大路中线 ≥ 15 m、沟底 −2.7；排水沟直段深 ≥ 2.0、沟底宽 ≥ 1.4、沟口坡不陡于 1:2.5、沟底眼高低于两岸（沟比人深）；
// 两道堤顶 1.5 且浮桥处有口子；浮桥 14 段连续、桥面顶 −0.95±0.02、每段底下有船、桥面离底下浅滩 ≤ 1.0、两头引道接桥面高差 ≤ 0.15；
// 厢房门洞 ≥ 1.1 宽、有门槛；接收院大门 ≥ 1.6 宽；散兵坑深 0.8–1.0；北门门洞宽 4、城墙高 8；三个信号的随信号体块齐全；五条视线。

import assert from "node:assert/strict";
import { ValidateBlockoutScene } from "./Script_EditorBlockoutConfig.mjs";
import { HeightGridSampler } from "./Script_EditorBlockoutLevels.mjs";
import { BlockStandSampler } from "./Script_EditorBlockoutPrevizPlan.mjs";
import {
  BuildFirstLevel1218Scene, CompareWith0610, HechaSectionAt, DitchSectionAt, DitchMouthSlope, L1218SightChecks, BlockCenterY, SolidBlocks, HECHA_FLOOR_Y,
} from "./Script_EditorBlockoutFirstLevel1218Scene.mjs";
import {
  L1218_GROUND, L1218_HEIGHTS as H, L1218_ROAD as RD, L1218_DITCH as DT, L1218_LEVEES as LV, L1218_BRIDGE as BR, L1218_BRIDGEHEAD as BH, L1218_YARD as Y,
  L1218_SOUTH as S, L1218_SIGNALS as SIG, L1218_PLACES as PL, L1218_BOUNDS as B, L1218_HECHA as HC,
} from "./Data_EditorBlockoutFirstLevel1218Space.mjs";

const opts = { commit: "test", generatedAt: "2026-10-19T00:00:00.000Z" };
const a = await BuildFirstLevel1218Scene({ ...opts, notes: [] });
const b = await BuildFirstLevel1218Scene({ ...opts, notes: [] });
assert.equal(JSON.stringify(a), JSON.stringify(b), "生成两次要逐字相同");
const check = ValidateBlockoutScene(a);
assert.ok(check.ok, check.errors.join("; "));
assert.ok(JSON.stringify(a).length < 2 * 1024 * 1024, "场景文件要在 2 MB 以内");

const sample = HeightGridSampler(a.terrain);
const Near = (got, want, tol, what) => assert.ok(Math.abs(got - want) <= tol, `${what}: ${got.toFixed(2)} vs ${want}±${tol}`);
const all = [...a.blocks, ...a.gates];
const byId = new Map(all.map((x) => [x.id, x]));
assert.equal(byId.size, all.length, "块 id 全关唯一");

// --- 与 0610 接得上：接缝两侧逐点一致，村南那一截与 0610 场景文件逐点一致 ---
const cmp = CompareWith0610(sample);
assert.ok(cmp.worst <= 0.03, `接缝 z ${L1218_GROUND.seamZ}±1 与 0610 地面不一致：最大差 ${cmp.worst} m（(${cmp.at.x},${cmp.at.z})）`);
if (cmp.file) assert.ok(cmp.file.worst <= 0.02, `村南那一截与 0610 场景文件不一致：最大差 ${cmp.file.worst} m（(${cmp.file.at.x},${cmp.file.at.z})）`);
else console.log("提示：没有 Blockout/FirstLevel0610.scene.json，跳过与场景文件的比对");
Near(sample(PL.villageSouth.x, PL.villageSouth.z), 0.3 - 0.12, 0.08, "村南口（0610 的街面）");
// 2026-10-22 跟着 0610 第六版：后门没了，带过来的是便门开着的那扇（SideGateLeafOpen）、窄胡同塌下的墙（LaneWallFallen）、村南的院子（House_SW1_1）
assert.ok(a.blocks.some((x) => x.id === "GengHaystack") && a.blocks.some((x) => x.id === "House_SW1_1") && a.blocks.some((x) => x.id === "SideGateLeafOpen") && a.blocks.some((x) => x.id === "LaneWallFallen"), "0610 村南那一截的块带过来了（含开着的便门扇、塌进胡同的墙）");
assert.ok(!byId.has("BackDoorLeaf") && !byId.has("BackVat") && !byId.has("SideGateLeaf") && !byId.has("CellarSmoke"), "0610 关着 / 原样的那一份与窖口冒烟不带");
assert.ok(a.blocks.every((x) => !x.signal && !x.appearSignal), "blocks 里不许带信号");

// --- 河汊子：拐弯后一直在大路北边、离路中线 ≥ 15 m、沟底 −2.7、够深 ---
for (const x of [-40, -80, -120, -160, -200, -240]) {
  const r = HechaSectionAt(sample, x);
  assert.ok(RD.line[0].z - r.z >= 15, `河汊子 x${x} 离大路中线只有 ${(RD.line[0].z - r.z).toFixed(1)} m`);
  Near(r.floor, HECHA_FLOOR_Y, 0.05, `河汊子 x${x} 沟底`);
  assert.ok(Math.min(r.minus, r.plus) - r.floor >= 2.5, `河汊子 x${x} 不够深：${(Math.min(r.minus, r.plus) - r.floor).toFixed(2)}`);
  assert.ok(r.floorW >= 5.5 && r.floorW <= 8.5, `河汊子 x${x} 沟底宽 ${r.floorW}（要约 6 m）`);
}
Near(sample(HC.line[0].x, 556), HECHA_FLOOR_Y, 0.05, "河汊子直段在接缝处（中线跟 0610 的 L0610_RIVER.centerX 走）");
assert.ok(HC.line[0].x === HC.line[1].x && HC.line[1].z >= L1218_GROUND.seamZ + 4, "河汊子头两点在直段上、直到接缝以南 4 m 才拐（接缝两边才接得上）");
for (let i = 2; i < HC.line.length; i++) {   // 拐弯平顺：相邻两段转角 ≤ 50°
  const a = HC.line[i - 2], b = HC.line[i - 1], c = HC.line[i];
  const t1 = Math.atan2(b.x - a.x, b.z - a.z), t2 = Math.atan2(c.x - b.x, c.z - b.z);
  const turn = Math.abs(((t2 - t1 + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI) * 180 / Math.PI;
  assert.ok(turn <= 50, `河汊子在 (${b.x},${b.z}) 拐 ${turn.toFixed(0)}°，太急`);
}
assert.ok(a.blocks.filter((x) => /^HechaWater_/.test(x.id)).length >= 5 && a.blocks.filter((x) => x.semantic === "water").every((x) => x.solid === false), "河汊子沟底的水块：不实心、顺着折线");
const river = byId.get("RiverWater");
assert.ok(river && river.d >= 50 && river.w >= B.maxX - B.minX - 1 && Math.abs(river.y + river.h / 2 - H.waterY) < 0.01, "北沙河的水面块盖住整条河、顶在水面高");

// --- 排水沟：直段深 ≥ 2.0、沟底宽 ≥ 1.4、沟口不陡于 1:2.5、出口抬到 −1.4；沟底眼高低于两岸 ---
for (const x of [-50, -60, -80, -100, -115, -130]) {
  const r = DitchSectionAt(sample, x);
  assert.ok(r.floor <= DT.floorY + 0.05 && r.floor >= DT.floorY - 0.4, `排水沟 x${x} 沟底 ${r.floor}（要 −1.9，平地低的地方再低一点）`);
  assert.ok(Math.min(r.minus, r.plus) - r.floor >= 2.0, `排水沟 x${x} 不够深：${(Math.min(r.minus, r.plus) - r.floor).toFixed(2)}`);
  assert.ok(r.floorW >= 1.4, `排水沟 x${x} 沟底宽 ${r.floorW}（要 ≥ 1.4）`);
  assert.ok(r.floor + 1.62 < Math.min(r.minus, r.plus), `排水沟 x${x} 沟底站着眼睛露出岸了`);
}
assert.ok(DitchMouthSlope(sample) <= 1 / 2.5 + 0.01, `沟口坡度 1:${(1 / DitchMouthSlope(sample)).toFixed(2)}，比 1:2.5 还陡`);
Near(sample(PL.ditchOutlet.x, PL.ditchOutlet.z), DT.outletY, 0.1, "排水沟出口");
assert.ok(sample(PL.ditchHalt.x, PL.ditchHalt.z) <= DT.floorY + 0.05, "歇脚处在沟底");
assert.ok(sample(-146, LV.north.z) <= DT.floorY + 0.1, "排水沟穿过北堤的口子");

// --- 两道堤：顶 1.5、浮桥处有口子 ---
for (const x of [-230, -180, -120, -60, 0, 60, 120]) {
  Near(sample(x, LV.north.z), H.leveeCrestY, 0.05, `北堤顶 x${x}`);
  Near(sample(x, LV.south.z), H.leveeCrestY, 0.05, `南堤顶 x${x}`);
}
assert.ok(sample(BR.x, LV.north.z) < 0.5 && sample(BR.x, LV.south.z) < 0.6, "浮桥处两道堤都留了口子");
// 北沙河：水面 −1.6 以下、河底 −2.6、桥底下浅滩 −1.85
for (const x of [-200, -100, 0, 100]) Near(sample(x, 675), H.riverBedY, 0.05, `河底 x${x}`);
Near(sample(BR.x, 675), H.bridgeBarY, 0.03, "桥底浅滩");

// --- 浮桥：14 段连续、桥面顶 −0.95±0.02、每段底下有船、离浅滩 ≤ 1.0、引道接桥面高差 ≤ 0.15 ---
const decks = all.filter((x) => x.deck).sort((p, q) => p.z - q.z);
const boats = all.filter((x) => x.boat);
assert.equal(decks.length, 14, "桥面板 14 段");
assert.equal(boats.length, 14, "每段底下一条船");
const stand = BlockStandSampler(a.blocks, a.gates, sample, () => false);
decks.forEach((d, i) => {
  Near(d.y + d.h / 2, H.deckTopY, 0.02, `桥面板 ${d.id} 顶`);
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
assert.ok(sample(BR.x, BR.northRampFromZ) > 0 && sample(BR.x, BR.southRampToZ) > 0, "引道两头在平地高");
for (let z = BR.northRampFromZ; z < BR.northFootZ; z += 0.5) assert.ok(Math.abs(sample(BR.x, z + 0.5) - sample(BR.x, z)) <= 0.25, `北引道 z${z} 太陡`);
for (let z = BR.southFootZ + 0.5; z < BR.southRampToZ; z += 0.5) assert.ok(Math.abs(sample(BR.x, z + 0.5) - sample(BR.x, z)) <= 0.25, `南引道 z${z} 太陡`);
assert.ok(all.filter((x) => /^Post_/.test(x.id)).length >= 12 && all.filter((x) => /^BridgeLantern_/.test(x.id)).length === 3, "栏杆桩与三盏马灯");

// --- 接收院：大门 ≥ 1.6、厢房门洞 ≥ 1.1 且有门槛、厢房空心 + 平顶 ---
const east = a.blocks.filter((x) => x.id.startsWith("YardEast")).sort((p, q) => p.z - q.z);
const gateW = east[1].z - east[1].d / 2 - (east[0].z + east[0].d / 2);
assert.ok(gateW >= 1.6, `接收院大门 ${gateW.toFixed(2)} m（要 ≥ 1.6）`);
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
for (const id of ["YardNorthHouse", "YardWestHouse", "WaterVat_Y1", "DoorBoard_Y1"]) assert.ok(byId.has(id), `缺体块 ${id}`);
assert.ok(a.blocks.filter((x) => /^Straw_/.test(x.id)).length >= 6, "院里的麦秸");

// --- 散兵坑：深 0.8–1.0、大路处留口子、东沿有土袋 ---
for (const z of [600, 604, 608, 617, 621]) {
  const floor = sample(BH.trench.x, z), side = Math.max(sample(BH.trench.x - 1.5, z), sample(BH.trench.x + 1.5, z));
  assert.ok(side - floor >= 0.8 && side - floor <= 1.0, `散兵坑 z${z} 深 ${(side - floor).toFixed(2)}（要 0.8…1.0）`);
}
assert.ok(sample(BH.trench.x, RD.line[0].z) > sample(BH.trench.x, 604) + 0.6, "散兵坑在大路处留口子");
assert.ok(all.filter((x) => /^TrenchSandbags_/.test(x.id)).length === 2 && byId.get("TrenchSandbags_1").h === BH.trench.sandbagH, "散兵坑东沿的土袋");
// 土坎：顶 1.7，比两边高 ≥ 1.2
assert.ok(sample(-74.8, 603.3) >= H.bankTopY - 0.05 && sample(-74.8, 603.3) - sample(-80, 603.3) >= 1.2, "土坎");

// --- 北门：门洞宽 4、城墙高 8、门洞上方封住 ---
const wall = a.blocks.filter((x) => x.id.startsWith("CityWall")).sort((p, q) => p.x - q.x);
assert.equal(wall.length, 2, "城墙两段");
Near(wall[1].x - wall[1].w / 2 - (wall[0].x + wall[0].w / 2), S.gate.w, 0.01, "北门门洞宽");
assert.ok(wall.every((x) => x.h === S.wall.h && x.d === S.wall.t), "城墙高 8、厚 6");
const top = byId.get("CityGateTop");
assert.ok(top && Math.abs(top.y - top.h / 2 - (sample(S.gate.x, S.wall.z) + S.gate.h)) < 0.05, "门洞上方从 4.5 m 起封住");
assert.ok(a.blocks.filter((x) => /^GateHouse_/.test(x.id)).length === 4 && byId.has("Torch_1") && byId.has("HandCart_G1"), "门内的房子、火把、小车");
assert.ok(byId.has("RailGirder") && byId.has("RailPier_1") && byId.get("RailGirder").x <= B.minX + 8, "远处的铁路桥贴着西界");

// --- 随信号体块：三个信号齐全 ---
assert.ok(a.gates.every((g) => g.signal || g.appearSignal));
const signals = new Set(a.gates.flatMap((g) => [g.signal, g.appearSignal]).filter(Boolean));
for (const s of Object.values(SIG)) assert.ok(signals.has(s), `随信号体块缺信号 ${s}`);
assert.equal(byId.get("OverturnedCart").appearSignal, SIG.cartOverturned);
assert.ok(a.gates.filter((g) => /^Charge_/.test(g.id) && g.appearSignal === SIG.chargesSet).length === 4 && byId.get("Fuse").appearSignal === SIG.chargesSet, "四条船上的炸药包 + 引线");
assert.ok(BR.blownSegments.every((i) => byId.get(`Deck_${String(i + 1).padStart(2, "0")}`).signal === SIG.bridgeBlown && byId.get(`Boat_${String(i + 1).padStart(2, "0")}`).signal === SIG.bridgeBlown), "北头四段桥面与船随 BridgeBlown 消失");
assert.ok(a.gates.filter((g) => /^Debris/.test(g.id) && g.appearSignal === SIG.bridgeBlown).length === BR.debris.length, "碎桥面与歪着的船在下游出现");
assert.ok(a.gates.filter((g) => /^Debris/.test(g.id)).every((g) => g.x < BR.x - 5 && g.z >= 650 && g.z <= 700), "碎片在桥西边（下游）的水面上");
assert.ok(decks.filter((d) => !d.signal).length === 10, "桥炸了还剩 10 段");

// --- 视线 ---
const s = L1218SightChecks(a, sample);
assert.ok(s.laneToYard.block === null && s.laneToYard.ground <= 0, `①小路口往西要看得见接收院的房顶：${s.laneToYard.block ?? `地面挡 ${s.laneToYard.ground}`}`);
assert.ok(s.trenchToMg.block === null && s.trenchToMg.ground <= 0, `②散兵坑里越过土袋要看得见鬼子机枪：${s.trenchToMg.block ?? `地面挡 ${s.trenchToMg.ground}`}`);
assert.ok(s.mgToLast.ground > 0.1 || s.mgToLast.block, `③机枪要看不到土坎西边蹲着的人（地面挡 ${s.mgToLast.ground}）`);
assert.ok(s.southToNorth.block === null && s.southToNorth.ground <= 0, `④南堤后要看得见北岸堤上的人：${s.southToNorth.block ?? `地面挡 ${s.southToNorth.ground}`}`);
assert.ok(s.southToLamp.block === null && s.southToLamp.ground <= 0, `⑤南堤后要看得见院门灯桩上的马灯：${s.southToLamp.block ?? `地面挡 ${s.southToLamp.ground}`}`);
assert.ok(s.southToInnerLamp.block !== null, "院里地上那盏马灯从南岸看不见（被院墙 / 厢房挡），所以才在灯桩上挂一盏");

console.log(`ok：${a.blocks.length} 块 + ${a.gates.length} 随信号块，${a.terrain.cols}×${a.terrain.rows} 网格，${(JSON.stringify(a).length / 1024 / 1024).toFixed(2)} MB；接缝最大差 ${cmp.worst} m；`
  + `河汊子 x−100 底 ${HechaSectionAt(sample, -100).floor}；排水沟 x−100 底 ${DitchSectionAt(sample, -100).floor} 宽 ${DitchSectionAt(sample, -100).floorW}、沟口 1:${(1 / DitchMouthSlope(sample)).toFixed(1)}；大门 ${gateW.toFixed(2)}、厢房门 ${doorW.toFixed(2)}`);
