import assert from "node:assert/strict";
import { CONTROL_GUIDE } from "./Script_Input.mjs";
import { AmmoReadout, ContextualActionPrompts, CrosshairGeometry } from "./Script_Hud.mjs";
import { IdentifySystem, TargetCard, IDENTIFY } from "./Script_Identify.mjs";
import { InteractSystem } from "./Script_Interact.mjs";
import { CarrySystem, CARRY_KINDS } from "./Script_Carry.mjs";

const guideText = CONTROL_GUIDE.flatMap((group) => group.rows)
  .map((row) => `${row.keys} ${row.label}`).join("\n");
assert.match(guideText, /1 \/ 2 \/ 3 \/ 4/);
assert.match(guideText, /F 拾枪、换枪/);
assert.match(guideText, /B 有绷带且流血时包扎止血/);

assert.deepEqual(ContextualActionPrompts(), []);
assert.deepEqual(ContextualActionPrompts({ bleeding: 1, bandages: 0 }), []);
assert.deepEqual(ContextualActionPrompts({ bleeding: 0, bandages: 2 }), []);

assert.deepEqual(AmmoReadout({ ammo: 5, clips: 6, magazine: 5 }), {
  current: "05", reserve: "30", low: false, empty: false,
});
assert.deepEqual(AmmoReadout({ ammo: 1, clips: 2, magazine: 5 }), {
  current: "01", reserve: "10", low: true, empty: false,
});
assert.deepEqual(AmmoReadout({ ammo: 0, clips: 0, magazine: 5 }), {
  current: "00", reserve: "00", low: false, empty: true,
});
assert.deepEqual(AmmoReadout({ ammo: 0, clips: 0, magazine: 0, armed: false }), {
  current: "—", reserve: "—", low: false, empty: false,
});

const bandageOnly = ContextualActionPrompts({ bleeding: 0.2, bandages: 1 });
assert.deepEqual(bandageOnly.map((prompt) => prompt.kind), ["bandage"]);
assert.equal(bandageOnly[0].keys, "B");

const oneGun = ContextualActionPrompts({ slots: { primary: "HanYang", secondary: null } });
assert.equal(oneGun.some((prompt) => prompt.kind === "switchWeapon"), false);
const twoGuns = ContextualActionPrompts({
  slots: { primary: "HanYang", secondary: "Mauser96" },
});
assert.deepEqual(twoGuns[0], {
  keys: "1 / 2", label: "切换长枪 / 短枪", kind: "switchWeapon",
});

const soldier = {
  alive: false,
  position: { x: 1, z: 0 },
  drop: { weaponId: "Type38", clips: 0, taken: false },
};
const player = { Alive: true, position: { x: 0, z: 0 } };
const system = new InteractSystem({ ai: { soldiers: [soldier] } }, {
  HasPrimary: () => false,
});
assert.match(system.Query(player).label, /^拾起 /);
system.hooks.HasPrimary = () => true;
const swap = system.Query(player);
assert.match(swap.label, /^换上 /);

const stacked = ContextualActionPrompts({
  interaction: swap,
  bleeding: 0.5,
  bandages: 2,
  slots: { primary: "HanYang", secondary: "Mauser96" },
});
assert.deepEqual(stacked.map((prompt) => prompt.kind), ["pickup", "bandage", "switchWeapon"]);

console.log("ok  操作说明与情境 HUD 提示条件通过");

// --- 负重时提示条被接管：只剩「怎么把它放下」 --------------------------------
// 规则那一侧（状态机本身）在 Script_CarryTest；这里只验 HUD 的读法。
// 判据现取 CARRY_KINDS 的时长，不抄数（AGENTS 硬规矩 12）。
const CarryAt = (kindId, opts = {}) => {
  const carry = new CarrySystem({ Time: () => 0 });
  const dummy = { Alive: true, yaw: 0, position: { x: 0, y: 0, z: 0 }, carrySpeedScale: 1 };
  carry.Begin(kindId, opts);
  if (opts.lifted !== false) {
    for (let t = 0; t < CARRY_KINDS[kindId].liftS + 0.1; t += 0.05) carry.Update(0.05, dummy);
  }
  return carry.View();
};

// 举起段还没抬稳：那一下按 F 也没用，所以先不给提示。
assert.deepEqual(ContextualActionPrompts({ carry: CarryAt("ammoCrate", { lifted: false }) }), []);
// 抬稳之后：空手时会出的那五条（拾枪/包扎/空枪白刃/刺刀/换枪）**一条都不许出现**。
const hauling = ContextualActionPrompts({
  carry: CarryAt("ammoCrate"),
  interaction: { label: "拾起 三八式步枪", kind: "pickup" },
  bleeding: 0.5, bandages: 2,
  slots: { primary: "HanYang", secondary: "Mauser96" },
  bayonet: { fixed: false }, ammoEmpty: true,
});
assert.deepEqual(hauling.map((prompt) => prompt.kind), ["carry", "carry"]);
assert.deepEqual(hauling.map((prompt) => prompt.keys), ["F", "左键"]);
assert.match(hauling[0].label, /放下/);
assert.match(hauling[1].label, /扔下/);
// 担架摔不掉（那是个人，不是麻袋）→ 没有「左键扔下」那一条。
assert.deepEqual(ContextualActionPrompts({ carry: CarryAt("stretcher") })
  .map((prompt) => prompt.keys), ["F"]);
// 第四关抬罗班长「拒绝松手」：一条提示都不给 —— 不许给玩家一个假的出口。
assert.deepEqual(ContextualActionPrompts({ carry: CarryAt("stretcher", { canDrop: false }) }), []);
// 空手时一切照旧（老行为的护栏）。
assert.deepEqual(ContextualActionPrompts({ carry: null }), []);
assert.deepEqual(ContextualActionPrompts({
  carry: null, interaction: { label: "拾起 三八式步枪", kind: "pickup" },
}).map((prompt) => prompt.kind), ["pickup"]);

console.log("ok  负重时提示条只剩放下/扔下，担架不给扔、拒绝松手不给出口");

// --- 动态准心：缝必须是真实散布角的投影，不是手感常数 -----------------------
// 55° 竖直视场、900 px 视口：半高 450，tan(27.5°) = 0.520567。
const Gap = (spreadDeg, extra = {}) =>
  CrosshairGeometry({ spreadDeg, fovDeg: 55, viewportHeight: 900, ...extra }).gap;
const Expect = (spreadDeg) =>
  Math.tan(spreadDeg * Math.PI / 360) / Math.tan(55 * Math.PI / 360) * 450;

// 中正式腰射 2.6°：19.6 px。改口径就该改这个数，改不动说明准心没接上散布。
assert.ok(Math.abs(Gap(2.6) - Expect(2.6)) < 0.01, `2.6° -> ${Gap(2.6).toFixed(2)}px`);
assert.ok(Math.abs(Gap(2.6) - 19.61) < 0.05, `2.6° 应是 19.6 px，实得 ${Gap(2.6).toFixed(2)}`);
// 跑起来（散布 ×1.85，见 Player.SpreadDeg）缝也跟着涨 —— 这一条是这次返工的全部诉求。
assert.ok(Gap(2.6 * 1.85) > Gap(2.6) * 1.8, "跑动散布撑开准心");
// 蹲下/屏息把散布收小，缝跟着收。
assert.ok(Gap(2.6 * 0.66) < Gap(2.6) * 0.7, "蹲下收窄准心");
// 视场变窄（开镜过渡/屏息）时同一个角占更多像素。
assert.ok(Gap(2.6, { fovDeg: 40 }) > Gap(2.6), "窄视场上同一散布画得更大");
// 分辨率无关：缝按视口高度等比缩放。
const tall = CrosshairGeometry({ spreadDeg: 2.6, fovDeg: 55, viewportHeight: 1800 }).gap;
assert.ok(Math.abs(tall - Gap(2.6) * 2) < 0.01, "缝随视口高度等比缩放");
// 冲刺再撑一截（那一段根本打不出去），中心点由 CSS 收掉。
assert.ok(Gap(5.6, { sprint: 1 }) > Gap(5.6) * 1.4, "冲刺额外扩散");
// 散布为 0 也要留一条缝，否则四条线糊成一个点。
assert.ok(Gap(0) >= 5 && Gap(0) < 6, "零散布仍留最小缝");
// 再大的散布也不许越出半屏高的 34%。
assert.ok(Gap(80) <= 450 * 0.34 + 0.001, "极端散布被夹在画面内");
// 大刀/手榴弹没有散布，给固定小十字而不是步枪的锥。
assert.equal(CrosshairGeometry({ spreadDeg: 3, armed: false }).gap, 7);
console.log("ok  准心缝 = 真实散布角的屏幕投影");

// --- 目标识别：准心指着谁 ---------------------------------------------------
const MakeSoldier = (over = {}) => ({
  id: over.id ?? 1,
  side: over.side ?? "ija",
  alive: over.alive ?? true,
  health: over.health ?? 100,
  weaponId: over.weaponId ?? "Type38",
  weapon: over.weapon ?? { kind: "boltRifle" },
  tacticalRole: over.tacticalRole ?? "rifleman",
  identity: over.identity ?? { name: "李长顺", origin: "四川三台", age: 19 },
  towel: over.towel ?? false,
  stance: over.stance ?? 0,
  drop: over.drop ?? null,
  position: { x: over.x ?? 0, y: over.y ?? 0, z: over.z ?? -30 },
});
const eye = { x: 0, y: 1.62, z: 0 };
const ahead = { x: 0, y: 0, z: -1 };                 // 玩家默认朝 -Z

const enemy = MakeSoldier({ id: 7, z: -18 });
const idAll = new IdentifySystem();
const card = idAll.Update(0.016, { eye, dir: ahead, soldiers: [enemy] });
// 日军这一行是**军衔 + 部队番号**，不报枪：日军步兵人手一支三八式，报枪等于没报。
assert.equal(card.title, "日军 二等兵");
assert.equal(card.meta, "步兵第10联队 · 18m");   // id 7 → 第 10 联队（按 id 定死）
assert.equal(card.faction, "ija");
assert.equal(card.health, null, "标准档不给血条");
assert.doesNotMatch(card.meta, /三八式/, "不报日军手里那支枪");

// 体验档才给血条；标准档只用"负伤"两个字，不外泄数字。
assert.equal(TargetCard(MakeSoldier({ health: 40 }), 20, "full").health, 0.4);
assert.match(TargetCard(MakeSoldier({ health: 40 }), 20, "basic").meta, /负伤/);
assert.doesNotMatch(TargetCard(MakeSoldier({ health: 90 }), 20, "basic").meta, /负伤/);

// 军衔按战术角色与手里那件家伙给。**1938 年没有"兵长"**（1940 年才加的一级）。
assert.match(TargetCard(MakeSoldier({ weaponId: "Type11", weapon: { kind: "lmg" } }), 12).title, /上等兵/);
assert.match(TargetCard(MakeSoldier({ weaponId: "Type92Hmg", weapon: { kind: "hmg" } }), 12).title, /伍长/);
assert.match(TargetCard(MakeSoldier({ tacticalRole: "leader" }), 12).title, /军曹/);
for (const id of [1, 2, 3, 4, 5, 6]) {
  assert.doesNotMatch(TargetCard(MakeSoldier({ id }), 12).title, /兵长/, "1938 年没有兵长这一级");
}
// 番号是滕县这一仗真打进来的那两支（濑谷支队的步兵骨干），而且按 id 定死不随帧变。
assert.match(TargetCard(MakeSoldier({ id: 2 }), 12).meta, /^步兵第(63|10)联队 · 12m$/);
assert.equal(TargetCard(MakeSoldier({ id: 2 }), 12).meta, TargetCard(MakeSoldier({ id: 2 }), 12).meta);
assert.match(TargetCard(MakeSoldier({ weaponId: "Type92Hmg", weapon: { kind: "hmg" } }), 12).meta, /^机关枪中队/);

// 出了 detailRangeM 就只报阵营与距离：军衔要看领章、番号要认得出部队，三十米外读不出来。
const far = TargetCard(MakeSoldier({ id: 7 }), 45);
assert.equal(far.title, "日军");
assert.equal(far.meta, "45m");
assert.equal(far.distant, true);
assert.equal(far.kind, "enemy", "远处也要保住敌我色");
assert.equal(TargetCard(MakeSoldier({ side: "nra" }), 45).title, "川军");
assert.equal(TargetCard(MakeSoldier({ side: "nra" }), 45).kind, "friend", "远处的自己人仍然让准心转蓝");
assert.equal(TargetCard(MakeSoldier({ health: 40 }), 45, "full").health, null, "三十米外看不出他伤没伤");

// 自己人给姓名（这是巷战里不误伤的唯一依据），敌人不给。
// 自己人那一行是**岁数 + 距离**，不报枪：他拿什么枪既不改变我要做的事，也不改变他能做的事。
const mate = MakeSoldier({ id: 9, side: "nra", weaponId: "HanYang" });
assert.equal(TargetCard(mate, 12).title, "李长顺");
assert.equal(TargetCard(mate, 12).kind, "friend");
assert.match(TargetCard(mate, 12).meta, /^19 岁 · 12m$/);
assert.doesNotMatch(TargetCard(mate, 12).meta, /汉阳造/, "自己人卡片不报枪");
assert.match(TargetCard(MakeSoldier({ id: 9, side: "nra", towel: true }), 12).meta,
  /^敢死队 · 19 岁 · 12m$/);
// 岁数缺了就整段不出现，不留一个空的 "岁"。
assert.match(TargetCard(MakeSoldier({ id: 9, side: "nra", identity: { name: "王二" } }), 12).meta,
  /^12m$/);

// 锥外的人不认：30 m 上偏 4 m 已经远超 2.4° 锥（1.26 m）与 2.2 m 上限。
assert.equal(new IdentifySystem().Update(0.016,
  { eye, dir: ahead, soldiers: [MakeSoldier({ x: 4 })] }), null);
// 人按胶囊算而不是按球：平视时眼位比躯干高 0.67 m，按球算三十米外一个都认不到。
assert.ok(new IdentifySystem().Update(0.016,
  { eye, dir: ahead, soldiers: [MakeSoldier({ z: -30 })] }), "平视也认得到三十米外的人");
// 贴脸时按肩宽够得着，不必像素级对准。
assert.ok(new IdentifySystem().Update(0.016,
  { eye, dir: ahead, soldiers: [MakeSoldier({ x: 0.3, z: -3 })] }), "近处按肩宽识别");
// 卧倒的人只有一条线那么高，同一条平视射线认不到 —— 这一条是姿态该换来的收益。
assert.equal(new IdentifySystem().Update(0.016,
  { eye, dir: ahead, soldiers: [MakeSoldier({ z: -30, stance: 2 })] }), null, "卧倒的人更难被认出");
// 散布撑大，锥跟着撑大 —— 准心画多大就认多宽。
assert.equal(new IdentifySystem().Update(0.016,
  { eye, dir: ahead, soldiers: [MakeSoldier({ x: 1.6 })] }), null);
assert.ok(new IdentifySystem().Update(0.016,
  { eye, dir: ahead, soldiers: [MakeSoldier({ x: 1.6 })], spreadDeg: 8 }), "散布撑大后同一个人进锥");

// 太远的人不认（60 m 上限，见 IDENTIFY.rangeM 的账：七十米上雾已经把敌我差
// 吃到噪声水平，那一段玩家自己都分不出敌我，名牌更不该替他分）。
assert.equal(new IdentifySystem().Update(0.016,
  { eye, dir: ahead, soldiers: [MakeSoldier({ z: -95 })] }), null, "九十五米外一律不认");
assert.ok(IDENTIFY.rangeM <= 70, "识别距离必须留在雾还读得出人的范围内");
assert.ok(IDENTIFY.detailRangeM < IDENTIFY.rangeM, "详细档必须严格短于识别上限");

// 被墙挡死就不认 —— 名牌不许穿墙。
const blocked = new IdentifySystem({ Clear: () => false });
assert.equal(blocked.Update(0.016, { eye, dir: ahead, soldiers: [MakeSoldier()] }), null);
assert.equal(blocked.stats.rays, 1, "只对排名第一的候选投射线");
// 第一名被挡住时，锥内看得见的第二名仍然认得到。
let asked = 0;
const twoDeep = new IdentifySystem({ Clear: () => { asked += 1; return asked > 1; } });
const second = twoDeep.Update(0.016, {
  eye, dir: ahead, soldiers: [MakeSoldier({ id: 1, x: 0.05 }), MakeSoldier({ id: 2, x: 0.3, side: "nra" })],
});
assert.equal(second.key, "s2", "第一名被挡住时退到第二名");

// 活人优先于尸体；没有活人时近处的尸体才认，而且带上他身上还剩什么。
// 尸体贴着地（0.30 m），得真的低头才看得到 —— 所以这一组用一条压低的射线。
const corpse = MakeSoldier({ id: 3, side: "nra", alive: false, z: -8,
  drop: { weaponId: "HanYang", clips: 2, taken: false } });
const down = (() => {
  const dx = 0, dy = 0.30 - eye.y, dz = -8;
  const len = Math.hypot(dx, dy, dz);
  return { x: dx / len, y: dy / len, z: dz / len };
})();
const mixed = new IdentifySystem().Update(0.016,
  { eye, dir: down, soldiers: [corpse, MakeSoldier({ id: 4, z: -8.5 })] });
assert.equal(mixed.key, "s4", "活人排在尸体前面");
const onlyCorpse = new IdentifySystem().Update(0.016, { eye, dir: down, soldiers: [corpse] });
assert.equal(onlyCorpse.title, "阵亡 李长顺");
// 地上那具是个物件了：籍贯、岁数、距离，不报他的枪（能不能捡由 F 的提示语说）。
assert.match(onlyCorpse.meta, /^四川三台 · 19 岁 · 8m$/);
assert.doesNotMatch(onlyCorpse.meta, /汉阳造|桥夹/, "尸体卡片不报缴获");
const farCorpse = MakeSoldier({ id: 5, alive: false, z: -60 });
const farDir = (() => {
  const dy = 0.30 - eye.y, dz = -60;
  const len = Math.hypot(dy, dz);
  return { x: 0, y: dy / len, z: dz / len };
})();
assert.equal(new IdentifySystem().Update(0.016,
  { eye, dir: farDir, soldiers: [farCorpse] }), null, "远处尸体不认");
// 日军的尸体**一张卡片都不给**：「日军 阵亡 · 2m」两样都是废话（见 TargetCard 的账）。
// 连扫都不扫，所以这一帧一条通视射线也不该投。
const ijaCorpse = MakeSoldier({ id: 6, alive: false, z: -8 });
const deadIja = new IdentifySystem({ Clear: () => true });
assert.equal(deadIja.Update(0.016, { eye, dir: down, soldiers: [ijaCorpse] }), null, "日军尸体不给卡片");
assert.equal(deadIja.stats.rays, 0, "日军尸体连通视都不查");
assert.equal(TargetCard(ijaCorpse, 2), null, "TargetCard 对日军尸体直接返回 null");
// 日军的尸体压在自己人身上时，认出来的仍然是自己人（尸体不该占候选名额）。
assert.equal(new IdentifySystem().Update(0.016,
  { eye, dir: down, soldiers: [ijaCorpse, corpse] }).key, "s3", "日军尸体不挤掉自己人");

// 写实档：整条链短路，不扫不投射。
const off = new IdentifySystem({ Clear: () => true });
assert.equal(off.Update(0.016, { eye, dir: ahead, soldiers: [MakeSoldier()], detail: false }), null);
assert.equal(off.stats.rays, 0);

// 目标掉出锥外之后卡片留 holdS 秒再收 —— 没有它，人一动卡片就闪。
const held = new IdentifySystem();
held.Update(0.016, { eye, dir: ahead, soldiers: [enemy] });
assert.ok(held.Update(0.2, { eye, dir: ahead, soldiers: [] }), "刚失去目标时卡片还在");
assert.equal(held.Update(0.5, { eye, dir: ahead, soldiers: [] }), null, "超过 holdS 之后收掉");

// 载具/固定火力点按同一套字段挂进 extras，识别层不必改（战车系统落地时用这条）。
const tank = { kind: "vehicle", id: 21, side: "ija", title: "八九式中战车",
  meta: "装甲 17mm", x: 0, y: 1.2, z: -40, radiusM: 2.1, health01: 0.55 };
const armour = new IdentifySystem().Update(0.016, { eye, dir: ahead, soldiers: [], extras: [tank] });
assert.equal(armour.title, "八九式中战车");
assert.equal(armour.meta, "装甲 17mm · 40m");
assert.equal(TargetCard(tank, 40, "full").health, 0.55);

console.log("ok  目标识别：军衔/番号/姓名/距离、远近分级、锥宽随散布、穿墙与太远一律不认");
