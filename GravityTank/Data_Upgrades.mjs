/** Stage / run upgrade card pools for GravityTank. */

/** Normal clears: 本关有效 — applies only to the next stage you enter. */
export const STAGE_UPGRADES = [
  { id: "noSelfHit", title: "保险撞针", desc: "本关：自己的炮弹不再误伤自己", tag: "本关" },
  { id: "rapidFire", title: "速射齿轮", desc: "本关：开火冷却显著缩短", tag: "本关" },
  { id: "multiShot", title: "弹仓扩容", desc: "本关：同时可存弹 +1", tag: "本关" },
  { id: "bulletSpeed", title: "增压炮口", desc: "本关：炮弹初速提高", tag: "本关" },
  { id: "lightGravity", title: "轻弹涂层", desc: "本关：己方炮弹重力减弱", tag: "本关" },
  { id: "longerShield", title: "护盾电池", desc: "本关：出生护盾更久", tag: "本关" },
  { id: "bounceShell", title: "弹性弹头", desc: "本关：炮弹可弹跳 2 次", tag: "本关" },
  { id: "pierceShell", title: "破甲锥", desc: "本关：炮弹可穿透 1 名敌军", tag: "本关" },
];

/** Boss clear: permanent until the campaign run ends (通关结束). */
export const BOSS_UPGRADES = [
  { id: "mirrorShot", title: "镜影炮", desc: "永久：每次开火额外向反方向射一发", tag: "永久" },
  { id: "meteorPulse", title: "陨石协议", desc: "永久：每隔一段时间降下重力弹雨", tag: "永久" },
  { id: "phaseGhost", title: "相位坦克", desc: "永久：每关开场获得较长幽灵穿墙", tag: "永久" },
  { id: "enemyAnchor", title: "引力锚", desc: "永久：敌军炮弹更重、下落更快", tag: "永久" },
  { id: "overloadFan", title: "过载核心", desc: "永久：开火时概率触发扇形三连发", tag: "永久" },
  { id: "fortressWill", title: "堡垒意志", desc: "永久：每关开场总部钢墙加固一段时间", tag: "永久" },
  { id: "timeRift", title: "时间裂缝", desc: "永久：受击时短暂冻结敌军（有冷却）", tag: "永久" },
  { id: "huntMark", title: "猎杀标记", desc: "永久：己方炮弹轻微追踪敌军", tag: "永久" },
];

export function PickUpgradeCards(pool, count = 3) {
  const copy = pool.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(count, copy.length));
}

export function FindUpgrade(id) {
  return STAGE_UPGRADES.find((u) => u.id === id) || BOSS_UPGRADES.find((u) => u.id === id) || null;
}
