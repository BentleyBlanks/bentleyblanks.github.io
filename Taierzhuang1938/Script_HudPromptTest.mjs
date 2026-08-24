import assert from "node:assert/strict";
import { CONTROL_GUIDE } from "./Script_Input.mjs";
import { AmmoReadout, ContextualActionPrompts, CrosshairGeometry } from "./Script_Hud.mjs";
import { IdentifySystem, TargetCard, IDENTIFY } from "./Script_Identify.mjs";
import { InteractSystem } from "./Script_Interact.mjs";

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

// --- 动态准心：缝必须是真实散布角的投影，不是手感常数 -----------------------
// 55° 竖直视场、900 px 视口：半高 450，tan(27.5°) = 0.520567。
const Gap = (spreadDeg, extra = {}) =>
  CrosshairGeometry({ spreadDeg, fovDeg: 55, viewportHeight: 900, ...extra }).gap;
const Expect = (spreadDeg) =>
  Math.tan(spreadDeg * Math.PI / 360) / Math.tan(55 * Math.PI / 360) * 450;

// 中正式腰射 2.6°：19.6 px。改口径就该改这个数，改不动说明准心没接上散布。
assert.ok(Math.abs(Gap(2.6) - Expect(2.6)) < 0.01, `2.6° -> ${Gap(2.6).toFixed(2)}px`);
assert.ok(Math.abs(Gap(2.6) - 19.61) < 0.05, `2.6° 应是 19.6 px，实得 ${Gap(2.6).toFixed(2)}`);
// 跑起来（散布 ×2.8）缝也跟着涨 —— 这一条就是这次返工的全部诉求。
assert.ok(Gap(2.6 * 2.8) > Gap(2.6) * 2.7, "跑动散布撑开准心");
// 蹲下/屏息把散布收小，缝跟着收。
assert.ok(Gap(2.6 * 0.66) < Gap(2.6) * 0.7, "蹲下收窄准心");
// 视场变窄（开镜过渡/屏息）时同一个角占更多像素。
assert.ok(Gap(2.6, { fovDeg: 40 }) > Gap(2.6), "窄视场上同一散布画得更大");
// 分辨率无关：缝按视口高度等比缩放。
const tall = CrosshairGeometry({ spreadDeg: 2.6, fovDeg: 55, viewportHeight: 1800 }).gap;
assert.ok(Math.abs(tall - Gap(2.6) * 2) < 0.01, "缝随视口高度等比缩放");
// 冲刺再撑一截（那一段根本打不出去），中心点由 CSS 收掉。
assert.ok(Gap(7.3, { sprint: 1 }) > Gap(7.3) * 1.5, "冲刺额外扩散");
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

const enemy = MakeSoldier({ id: 7 });
const idAll = new IdentifySystem();
const card = idAll.Update(0.016, { eye, dir: ahead, soldiers: [enemy] });
assert.equal(card.title, "日军 步兵");
assert.equal(card.meta, "三八式 · 30m");
assert.equal(card.faction, "ija");
assert.equal(card.health, null, "标准档不给血条");

// 体验档才给血条；标准档只用"负伤"两个字，不外泄数字。
assert.equal(TargetCard(MakeSoldier({ health: 40 }), 30, "full").health, 0.4);
assert.match(TargetCard(MakeSoldier({ health: 40 }), 30, "basic").meta, /负伤/);
assert.doesNotMatch(TargetCard(MakeSoldier({ health: 90 }), 30, "basic").meta, /负伤/);

// 兵种按他手里那支枪读
assert.match(TargetCard(MakeSoldier({ weaponId: "Type11", weapon: { kind: "lmg" } }), 12).title, /机枪手/);
assert.match(TargetCard(MakeSoldier({ weaponId: "Type92Hmg", weapon: { kind: "hmg" } }), 12).title, /重机枪组/);
assert.match(TargetCard(MakeSoldier({ tacticalRole: "leader" }), 12).title, /分队长/);

// 自己人给姓名（这是巷战里不误伤的唯一依据），敌人不给。
const mate = MakeSoldier({ id: 9, side: "nra", weaponId: "HanYang" });
assert.equal(TargetCard(mate, 12).title, "李长顺");
assert.equal(TargetCard(mate, 12).kind, "friend");
assert.match(TargetCard(mate, 12).meta, /^汉阳造 · 12m$/);

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

// 雾外的人不认（130 m 上限，见 IDENTIFY.rangeM 的账）。
assert.equal(new IdentifySystem().Update(0.016,
  { eye, dir: ahead, soldiers: [MakeSoldier({ z: -160 })] }), null);
assert.ok(IDENTIFY.rangeM <= 140, "识别距离必须留在雾还读得出人的范围内");

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
assert.match(onlyCorpse.meta, /四川三台 · 汉阳造 2 桥夹 · 8m/);
const farCorpse = MakeSoldier({ id: 5, alive: false, z: -60 });
const farDir = (() => {
  const dy = 0.30 - eye.y, dz = -60;
  const len = Math.hypot(dy, dz);
  return { x: 0, y: dy / len, z: dz / len };
})();
assert.equal(new IdentifySystem().Update(0.016,
  { eye, dir: farDir, soldiers: [farCorpse] }), null, "远处尸体不认");

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

console.log("ok  目标识别：兵种/姓名/距离、锥宽随散布、穿墙与雾外一律不认");
