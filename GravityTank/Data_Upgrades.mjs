/** Stage / run upgrade card pools for GravityTank. */

function IconPath(id) {
  return `./assets/Icon_Upgrade${id[0].toUpperCase()}${id.slice(1)}.png`;
}

/** Tutorial clear: basic starter cards — 本关有效 into stage 1. */
export const TUTORIAL_UPGRADES = [
  { id: "rapidFire", title: "速射入门", desc: "本关：开火冷却缩短", tag: "入门", icon: IconPath("rapidFire") },
  { id: "doubleShield", title: "护盾加倍", desc: "本关：出生护盾时间延长一倍", tag: "入门", icon: IconPath("doubleShield"), recommend: true },
  { id: "baseArmor", title: "钢墙护垒", desc: "本关：开场总部钢墙加固更久、更耐打", tag: "入门", icon: IconPath("baseArmor") },
  { id: "multiShot", title: "双弹入门", desc: "本关：同时可存弹 +1", tag: "入门", icon: IconPath("multiShot") },
  { id: "bulletSpeed", title: "初速入门", desc: "本关：炮弹飞得更快", tag: "入门", icon: IconPath("bulletSpeed") },
  { id: "noSelfHit", title: "安全撞针", desc: "本关：己方炮弹不误伤自己", tag: "入门", icon: IconPath("noSelfHit"), recommend: true },
  { id: "hitPlates", title: "叠甲入门", desc: "本关：开场获得 2 层装甲，可抵挡致命一击", tag: "入门", icon: IconPath("hitPlates"), recommend: true },
  { id: "moveSpeed", title: "履带入门", desc: "本关：移速明显加快", tag: "入门", icon: IconPath("moveSpeed"), recommend: true },
];

/** Normal clears: 本关有效 — applies only to the next stage you enter. */
export const STAGE_UPGRADES = [
  { id: "noSelfHit", title: "保险撞针", desc: "本关：自己的炮弹不再误伤自己", tag: "本关", icon: IconPath("noSelfHit"), recommend: true },
  { id: "rapidFire", title: "速射齿轮", desc: "本关：开火冷却显著缩短", tag: "本关", icon: IconPath("rapidFire") },
  { id: "multiShot", title: "弹仓扩容", desc: "本关：同时可存弹 +1", tag: "本关", icon: IconPath("multiShot"), recommend: true },
  { id: "bulletSpeed", title: "增压炮口", desc: "本关：炮弹初速提高", tag: "本关", icon: IconPath("bulletSpeed") },
  { id: "lightGravity", title: "轻弹涂层", desc: "本关：己方炮弹重力减弱", tag: "本关", icon: IconPath("lightGravity"), recommend: true },
  { id: "longerShield", title: "护盾电池", desc: "本关：出生护盾更久", tag: "本关", icon: IconPath("longerShield"), recommend: true },
  { id: "bounceShell", title: "弹性弹头", desc: "本关：炮弹可弹跳 2 次", tag: "本关", icon: IconPath("bounceShell") },
  { id: "pierceShell", title: "破甲锥", desc: "本关：炮弹可穿透 1 名敌军", tag: "本关", icon: IconPath("pierceShell") },
  { id: "hitPlates", title: "反应装甲", desc: "本关：开场 +2 层装甲，抵挡致命伤害", tag: "本关", icon: IconPath("hitPlates"), recommend: true },
  { id: "moveSpeed", title: "履带调校", desc: "本关：移速 +28%，机动更灵活", tag: "本关", icon: IconPath("moveSpeed"), recommend: true },
  { id: "turboTreads", title: "涡轮履带", desc: "本关：移速 +38%，疾走清场", tag: "本关", icon: IconPath("turboTreads"), recommend: true },
];

/** Boss clear: permanent until the campaign run ends (通关结束). */
export const BOSS_UPGRADES = [
  { id: "mirrorShot", title: "镜影炮", desc: "永久：每次开火额外向反方向射一发", tag: "永久", icon: IconPath("mirrorShot") },
  { id: "meteorPulse", title: "陨石协议", desc: "永久：每隔一段时间降下重力弹雨", tag: "永久", icon: IconPath("meteorPulse") },
  { id: "phaseGhost", title: "穿墙坦克", desc: "永久：每关开场获得较长穿墙时间", tag: "永久", icon: IconPath("phaseGhost") },
  { id: "enemyAnchor", title: "引力锚", desc: "永久：敌军炮弹更重、下落更快", tag: "永久", icon: IconPath("enemyAnchor") },
  { id: "overloadFan", title: "过载核心", desc: "永久：开火时概率触发扇形三连发", tag: "永久", icon: IconPath("overloadFan") },
  { id: "fortressWill", title: "堡垒意志", desc: "永久：每关开场总部钢墙加固一段时间", tag: "永久", icon: IconPath("fortressWill"), recommend: true },
  { id: "timeRift", title: "时间裂缝", desc: "永久：受击时短暂冻结敌军（有冷却）", tag: "永久", icon: IconPath("timeRift"), recommend: true },
  { id: "huntMark", title: "猎杀标记", desc: "永久：己方炮弹轻微追踪敌军", tag: "永久", icon: IconPath("huntMark"), recommend: true },
  { id: "ironHide", title: "钢铁外皮", desc: "永久：每关开场 +1 层装甲，可叠层抵挡伤害", tag: "永久", icon: IconPath("ironHide"), recommend: true },
  { id: "swiftChassis", title: "轻量底盘", desc: "永久：移速 +22%，可与本关履带卡叠加", tag: "永久", icon: IconPath("swiftChassis"), recommend: true },
];

/** Extra highlight when the next stage is a boss fight. */
const BEFORE_BOSS_IDS = new Set([
  "noSelfHit", "moveSpeed", "turboTreads", "hitPlates", "longerShield", "pierceShell", "lightGravity",
]);

/** Extra highlight before trap / barricade stages. */
const BEFORE_TRAP_IDS = new Set([
  "noSelfHit", "moveSpeed", "turboTreads", "pierceShell", "hitPlates", "bounceShell", "multiShot",
]);

/** Peek the stage the pending perk will apply to. */
export function PeekNextStageId(current) {
  if (current === 0 || current === "tutorial") return 1;
  if (current === "barricadeTeach" || current === "teach" || current === -1) return 7;
  if (typeof current === "number") {
    if (current === 6) return "barricadeTeach";
    if (current >= 9) return null;
    return current + 1;
  }
  return null;
}

/**
 * Simple recommend badge for cards that pay off on the upcoming stage.
 * ctx: { special, tutorial, nextStage }
 */
export function IsUpgradeRecommended(card, ctx = {}) {
  if (!card) return false;
  if (ctx.special) return !!card.recommend;
  if (ctx.tutorial) return !!card.recommend;
  const next = ctx.nextStage;
  if (next === 3 || next === 6 || next === 9) return BEFORE_BOSS_IDS.has(card.id);
  if (next === 7 || next === 8 || next === "barricadeTeach") return BEFORE_TRAP_IDS.has(card.id);
  return !!card.recommend;
}

export function PickUpgradeCards(pool, count = 3) {
  const copy = pool.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(count, copy.length));
}

export function FindUpgrade(id) {
  return (
    STAGE_UPGRADES.find((u) => u.id === id) ||
    TUTORIAL_UPGRADES.find((u) => u.id === id) ||
    BOSS_UPGRADES.find((u) => u.id === id) ||
    null
  );
}
