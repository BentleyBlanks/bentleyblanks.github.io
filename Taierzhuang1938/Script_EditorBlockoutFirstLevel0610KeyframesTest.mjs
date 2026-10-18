// Script_EditorBlockoutFirstLevel0610KeyframesTest.mjs —— 06–10 白盒关键帧生成器的 node 回归（只给关键帧包自验用）
// 跑法：node Taierzhuang1938/Script_EditorBlockoutFirstLevel0610KeyframesTest.mjs
// 查：生成两次除 generatedAt 外逐字相同、过 ValidateBlockout 且无警告、摆位 / 走位问题为零（读 Blockout/FirstLevel0610.scene.json 连实心块与高差一起查）、
// 契约 §4 的 20 帧齐全、玩家点在场地内、next 不出现「掩护 / 清理 / 护送」、人物 id 稳定、castId 都是定妆表里的键；
// 所有人脚下都在地面上（站在高度场或 ≤1 m 的块顶上，身子不进实心块；房顶那个单独记）；
// 侧门一开玩家看得见撒尿的鬼子、门缝 / 墙缝里看得见窖口、村口看得见北窗、石碾后看得见东头；信号按拍起；后送队够多；冬瓜一直躺在自己的担架上。

import assert from "node:assert/strict";
import fs from "node:fs";
import { ValidateBlockout, NormalizeBlockout } from "./Script_EditorBlockoutConfig.mjs";
import { FIRST_LEVEL_SPEAKING_CAST } from "./Data_FirstLevelSpeakingCast.mjs";
import { BuildFirstLevel0610Config, StreetRoute, LoadSceneLayout, StandSampler, FirstLevel0610Issues } from "./Script_EditorBlockoutFirstLevel0610Keyframes.mjs";
import { BlockSight, SolidBlocks, BlockCenterY } from "./Script_EditorBlockoutFirstLevel0610Scene.mjs";
import { L0610_BOUNDS as B, L0610_PLACES as P, L0610_GENG as G, L0610_SIGNALS as SIG, L0610_STREETS as ST } from "./Data_EditorBlockoutFirstLevel0610Space.mjs";

const issues = [];
const a = await BuildFirstLevel0610Config({ commit: "test", generatedAt: "A", issues });
const b = await BuildFirstLevel0610Config({ commit: "test", generatedAt: "B" });
const Strip = (doc) => JSON.stringify({ ...doc, source: { ...doc.source, generatedAt: "" } });
assert.equal(Strip(a), Strip(b), "生成两次（除 generatedAt）要逐字相同");

const check = ValidateBlockout(a);
assert.ok(check.ok, check.errors.join("; "));
assert.deepEqual(check.warnings, [], "不该有校验警告");
assert.deepEqual(issues, [], `摆位 / 走位问题：\n  ${issues.join("\n  ")}`);

const IDS = ["06-1", "06-2", "06-3", "07-1", "07-2", "07-3", "07-4", "08-1", "08-2", "08-3", "09-1", "09-2", "09-3", "09-4", "09-5", "09-6", "10-1", "10-2", "10-3", "10-4"];
assert.deepEqual(a.keyframes.map((k) => k.id), IDS, "契约 §4 的 20 个关键帧按顺序齐全");
const TITLES = { 6: "回到集结处", 7: "沿着后送队往前走", 8: "村口", 9: "摸进老耿家", 10: "两面夹住机枪" };
for (const kf of a.keyframes) {
  assert.equal(kf.stage, Number(kf.id.split("-")[0]), `${kf.id} 的 stage`);
  assert.equal(kf.stageTitle, TITLES[kf.stage], `${kf.id} 的 stageTitle 用剧本标题`);
  assert.ok(kf.player.x >= B.minX && kf.player.x <= B.maxX && kf.player.z >= B.minZ && kf.player.z <= B.maxZ, `${kf.id} 玩家出界`);
  assert.ok(!/掩护|清理|护送/.test(kf.next?.text || ""), `${kf.id} next 用了禁词：${kf.next?.text}`);
  assert.ok(kf.what.length <= 80, `${kf.id} what 太长`);
  for (const u of kf.units) if (u.castId) assert.ok(Object.hasOwn(FIRST_LEVEL_SPEAKING_CAST, u.castId), `${kf.id} ${u.id} 的 castId ${u.castId} 不在定妆表里`);
}
// 单位 id 在关卡内稳定：同一个 id 不换阵营 / 种类
const identity = new Map();
for (const kf of a.keyframes) for (const u of kf.units) {
  const key = `${u.side}/${u.kind || "soldier"}`;
  if (identity.has(u.id)) assert.equal(identity.get(u.id), key, `${u.id} 在 ${kf.id} 换了阵营或种类`);
  else identity.set(u.id, key);
}
const KF = (id) => a.keyframes.find((k) => k.id === id);
const Unit = (id, uid) => KF(id).units.find((u) => u.id === uid);
const DistXZ = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
for (const id of IDS) { assert.ok(Unit(id, "Geng"), `${id} 老耿要在`); assert.ok(Unit(id, "Nier"), `${id} 妮儿要在`); }
for (const id of IDS.slice(0, 7)) assert.ok(Unit(id, "GengCart")?.kind === "cart", `${id} 驴车要在`);

// --- 信号按拍起 ---
const From = (sig, firstId) => IDS.forEach((id, i) => assert.equal(KF(id).signals.includes(sig), i >= IDS.indexOf(firstId), `${id} 的 ${sig}`));
From(SIG.cartDeparted, "06-3"); From(SIG.cellarBlast, "09-3"); From(SIG.sideGateOpen, "09-4"); From(SIG.mgSilenced, "10-1"); From(SIG.backDoorOpen, "10-4");

// --- 后送队：够多、停在凹路里；冬瓜一直躺在自己的担架上 ---
for (const id of ["07-1", "07-2", "07-3", "07-4"]) {
  const litters = KF(id).units.filter((u) => u.kind === "litter");
  const walkers = KF(id).units.filter((u) => u.role === "walkingWounded");
  assert.ok(litters.length >= 10 && litters.length <= 14, `${id} 担架 ${litters.length} 副（要 10–14）`);
  assert.ok(walkers.length >= 15 && walkers.length <= 24, `${id} 走着的伤员 ${walkers.length}（要 15–20 上下）`);
  for (const u of [...litters, ...walkers]) assert.ok(u.z >= 180 && u.z <= 380 && Math.abs(u.x - 90) < 20, `${id} ${u.id} 不在凹路里 (${u.x},${u.z})`);
}
for (const id of IDS.slice(3)) {
  const l = Unit(id, "LitterDonggua"), d = Unit(id, "Donggua");
  assert.ok(l && d && d.state === "down" && DistXZ(l, d) < 0.05, `${id} 冬瓜要躺在自己的担架上`);
  assert.equal(l.bearers, id.startsWith("10-3") || id.startsWith("10-4") ? 2 : 0, `${id} 冬瓜担架的 bearers`);
}
assert.ok(Math.abs(Unit("07-2", "LitterDonggua").z - 232) < 3, "冬瓜的担架在 z≈232");
assert.ok(Unit("07-2", "Medic").stance === "crouch" && DistXZ(Unit("07-2", "Medic"), Unit("07-2", "LitterDonggua")) < 1.6, "07-2 卫生兵蹲在冬瓜担架边");

// --- 08–10 的鬼子与百姓 ---
for (const id of ["08-1", "08-2", "08-3", "09-1", "09-2", "09-3", "09-4", "09-5"]) {
  const mg = Unit(id, "MgGunner");
  assert.ok(mg.weapon === "Type11" && mg.aim && mg.arc && DistXZ(mg, G.mgPost) < 0.1, `${id} 北窗机枪组`);
  assert.ok(Unit(id, "RoofIja") && DistXZ(Unit(id, "RoofIja"), G.roofPost) < 0.1, `${id} 房顶的鬼子`);
}
for (const id of ["10-1", "10-2", "10-3", "10-4"]) for (const uid of ["MgGunner", "MgLoader", "RoofIja", "KitchenIja"]) assert.equal(Unit(id, uid).state, "down", `${id} ${uid} 该倒了`);
assert.ok(KF("08-1").units.filter((u) => u.id.startsWith("Villager")).length === 5 && KF("08-1").units.filter((u) => u.id.startsWith("Villager") && u.state === "down").length === 2, "08-1 村民 5 个、倒 2 个");
assert.ok(["CellarMan", "CellarWife", "CellarGranny"].every((uid) => Unit("09-2", uid)) && Unit("09-2", "CellarMan").state === "down", "09-2 一家人出窖、汉子倒下");
assert.ok(Unit("09-3", "CellarGranny").state === "down" && DistXZ(Unit("09-3", "CellarGranny"), P.cellar) < 1, "09-3 老太太炸在窖里");
assert.ok(Unit("09-4", "CellarIja2") && DistXZ(Unit("09-4", "CellarIja2"), P.cellar) < 5 && DistXZ(Unit("09-4", "CellarIja2"), Unit("09-4", "CellarMan")) < 2.5, "09-4 撒尿的鬼子在汉子尸体边");
for (const id of IDS.slice(7)) assert.ok(Unit(id, "MillOldMan")?.state === "down" && DistXZ(Unit(id, "MillOldMan"), P.mill) < 1.5, `${id} 石磨上绑着的老汉`);
assert.ok(KF("10-2").units.filter((u) => u.group === "east" && u.side === "ija").length >= 8, "10-2 东头的鬼子 6–8 人 + 掷弹筒");
assert.ok(DistXZ(Unit("10-2", "Mortar1"), P.mortarHide) < 0.5, "掷弹筒躲在东头的院墙后");
assert.equal(Unit("10-3", "HeYoutian").weapon, "Type11", "10-3 何有田接过机枪");

// --- 走位：妮儿 08-3→09-1 走巷子（不穿院墙）、09-3 从狗洞钻进来 ---
const nier91 = Unit("09-1", "Nier");
assert.ok(nier91.path && nier91.path.some((p) => Math.abs(p.x - ST.alleySouth.x) < 0.1 && Math.abs(p.z - ST.alleyWest.z) < 0.1), "妮儿进巷子要经过巷子拐角");
const nier93 = Unit("09-3", "Nier");
assert.ok(nier93.path && nier93.path.some((p) => Math.abs(p.z - G.dogHole.z) < 0.1 && p.x > G.sharedWall.x), "09-3 妮儿从狗洞钻进后院");
const toKitchen = StreetRoute({ x: 88, z: 496 }, { x: 86, z: 484.4 });
assert.ok(toKitchen.some((p) => Math.abs(p.z - G.kitchen.door.z) < 0.1 && p.x > G.kitchen.box.maxX), "进灶屋要走灶屋门");

// --- 场景：脚下都在地面上、视线 ---
const scene = await LoadSceneLayout();
assert.ok(scene && !scene.error, `读不到场景文件：${scene?.error}`);
const sceneDoc = JSON.parse(fs.readFileSync(new URL("./Blockout/FirstLevel0610.scene.json", import.meta.url), "utf8"));
const PEOPLE = new Set(["soldier", "officer", "civilian", "child"]);
let roofChecked = 0;
for (const kf of NormalizeBlockout(a).keyframes) {
  const stand = StandSampler(scene, kf.signals);
  const solids = SolidBlocks(sceneDoc, kf.signals);
  for (const u of kf.units) {
    if (!PEOPLE.has(u.kind)) continue;
    const terrain = scene.terrainSampler(u.x, u.z), y = stand(u.x, u.z);
    assert.ok(y >= terrain - 1e-6 && y - terrain <= 1.0, `${kf.id} ${u.id} 脚下 ${y.toFixed(2)}（地形 ${terrain.toFixed(2)}）`);
    if (u.id === "RoofIja") {
      // 房顶的鬼子：设计上站在前屋平顶上（运行时站不上去，先记着）
      const roof = solids.find((blk) => blk.id === "GengFrontRoof");
      const top = BlockCenterY(roof, scene.terrainSampler) + roof.h / 2;
      assert.ok(Math.abs(u.x - roof.x) <= roof.w / 2 && Math.abs(u.z - roof.z) <= roof.d / 2 && top - terrain > 3, `${kf.id} 房顶的鬼子要在前屋平顶范围里`);
      roofChecked++;
      continue;
    }
    // 身子（0.3 m 半径、离脚 0.5…1.4 m）不进任何高过 0.9 m 的实心块
    for (const blk of solids) {
      if (blk.h <= 0.9) continue;
      const c = Math.cos(blk.ry || 0), s = Math.sin(blk.ry || 0), dx = u.x - blk.x, dz = u.z - blk.z;
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      const ex = Math.abs(lx) - blk.w / 2, ez = Math.abs(lz) - blk.d / 2;
      const pen = ex <= 0 && ez <= 0 ? 0.3 + Math.min(-ex, -ez) : 0.3 - Math.hypot(Math.max(ex, 0), Math.max(ez, 0));
      if (pen <= 0.08) continue;
      const cy = BlockCenterY(blk, scene.terrainSampler);
      if (cy + blk.h / 2 < y + 0.5 || cy - blk.h / 2 > y + 1.4) continue;
      if (pen >= 0.3 && cy + blk.h / 2 <= y + 0.75) continue;
      assert.fail(`${kf.id} ${u.id} 埋进 ${blk.id}`);
    }
  }
  const pl = kf.player, ps = stand(pl.x, pl.z);
  assert.ok(ps - scene.terrainSampler(pl.x, pl.z) <= 1.0, `${kf.id} 玩家脚下`);
}
assert.ok(roofChecked >= 10, "房顶的鬼子每帧都查到了");
const EYE = { stand: 1.6, crouch: 1.2, prone: 0.5 };
const Sight = (kfId, target, targetEye) => {
  const kf = KF(kfId), solids = SolidBlocks(sceneDoc, kf.signals);
  return BlockSight(solids, scene.terrainSampler, { x: kf.player.x, z: kf.player.z, eye: EYE[kf.player.stance] }, { x: target.x, z: target.z, eye: targetEye });
};
assert.equal(Sight("09-4", Unit("09-4", "CellarIja2"), 1.5), null, "09-4 门开了，玩家要看得见撒尿的鬼子");
assert.equal(Sight("09-3", P.cellar, 1.0), null, "09-3 门缝里要看得见窖口");
assert.equal(Sight("09-2", P.cellar, 1.0), null, "09-2 墙缝里要看得见窖口");
assert.equal(Sight("08-1", Unit("08-1", "MgGunner"), 1.0), null, "08-1 村口要看得见北窗里的机枪手");
assert.equal(Sight("10-2", { x: 230, z: ST.east.z }, 1.0), null, "10-2 石碾后要顺着东街看到东头");
assert.equal(Sight("10-2", Unit("10-2", "EastIja1"), 0.5), null, "10-2 石碾后要看得见街上趴着的鬼子");
assert.ok(KF("09-4").player.stance === "crouch" && DistXZ(KF("09-4").player, P.sideGate) < 2.2 && KF("09-4").player.x > G.sharedWall.x, "09-4 玩家蹲在侧门口里侧");
assert.ok(KF("09-6").player.stance === "prone" && KF("09-6").player.pitchDeg > 20, "09-6 倒地仰视");
assert.ok(KF("10-2").player.stance === "prone" && Math.abs(KF("10-2").player.yawDeg + 90) < 1, "10-2 趴着朝东");

const file = new URL("./Blockout/FirstLevel0610.json", import.meta.url);
if (fs.existsSync(file)) {
  const onDisk = JSON.parse(fs.readFileSync(file, "utf8"));
  if (Strip({ ...onDisk, source: { ...onDisk.source, commit: "test" } }) !== Strip(a)) console.log("提示：Blockout/FirstLevel0610.json 与生成器输出不同（手改过，或没重新 export）");
  // 盘上的 JSON 没有生成器的内部标记（躺在担架上 / 爬坎 / 钻狗洞 / 房顶），按手改的口径查只该多报这几类
  const known = /RoofIja|Donggua 站在 LitterDonggua|Cellar(Man|Wife|Granny) 的走位在|Nier 的走位穿过 (DogHoleLintel|SharedWall)|Geng 的走位在|Nier 的走位在/;
  const extra = FirstLevel0610Issues(onDisk, { scene }).filter((line) => !known.test(line));
  assert.deepEqual(extra, [], `盘上的 JSON 多报了：\n  ${extra.join("\n  ")}`);
}
console.log(`FirstLevel0610 关键帧：${a.keyframes.length} 帧、${a.keyframes.reduce((s, k) => s + k.units.length, 0)} 个单位位次，校验、摆位、视线全过`);
