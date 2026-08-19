// 《血战台儿庄》通用交互：F 键。
//
// ER2 把 F 做成一个**按上下文分流**的键（拾取／开门／救人／拖人／接管重武器），
// 我们照这个结构做，但只接这一批真的有东西可接的两条分支：
//   · 拾枪拾弹 —— 2 m 内最近的尸体，捡它的枪与还没打完的桥夹；
//   · 分弹药   —— 2.5 m 内弹打光的弟兄，分一个桥夹过去（ER2 的 I 背包盘等价物，
//                中方没有弹药箱这种东西，所以做成 F 的一个分支）。
// 救人／拖人在第 5 批（伤势系统落地之后才有 Downed 可救），
// 接管固定武器在第 8 批（那时才有九二式重机的实例）。**这里不留空壳分支**。
//
// 为什么单独一个模块：F 的语义是"按优先级挑一件事做"，写进 Script_Main 就会变成
// 一串越长越乱的 if；而且它要被 HUD（提示语）、音效、弹药账三处读，
// 放在装配层里等于把规则写进装配层。
//
// 这一层**不碰玩家的状态结构**：拾到什么、给了谁，全部通过 hooks 回调交给装配层，
// 因为槽位与弹仓的账在 Script_Main 手里（state.slots / state.mags）。

import { WEAPONS } from "./Data_Weapons.mjs";

/** 够得着的距离。比 ER2 短一点 —— 巷战里两米开外的东西本来就不该"顺手"拿到。 */
const CORPSE_REACH_M = 2.0;
const MATE_REACH_M = 2.5;

export class InteractSystem {
  /**
   * @param {object} ctx { ai, audio, hud }
   * @param {object} hooks
   *   TakeWeapon(weaponId, clips, soldier) -> boolean   捡起一支枪（装配层改槽位与弹仓）
   *   SpareClips() -> number                            玩家手上还有几个桥夹
   *   GiveClip(soldier) -> boolean                      分一个桥夹给弟兄
   */
  constructor(ctx, hooks = {}) {
    this.ctx = ctx;
    this.hooks = hooks;
    this.lastLabel = null;      // 提示语只在变化时打一次，不然每帧一条
    this.pickups = 0;           // 捡了几次（运行时取证用）
    this.handouts = 0;          // 分了几次弹
  }

  /**
   * 现在按 F 会发生什么。返回 null 表示什么也不会发生 —— **那就真的什么也不发生**，
   * 不许弹"这里没有东西可以交互"之类的提示：一个键按下去老是弹废话比没反应更差。
   */
  Query(player) {
    if (!player || !player.Alive) return null;
    const px = player.position.x, pz = player.position.z;
    let best = null, bestDist = 1e9;

    for (const s of this.ctx.ai.soldiers) {
      const d = Math.hypot(s.position.x - px, s.position.z - pz);
      if (!s.alive) {
        // 尸体：身上有没有还没被拿走的东西
        if (!s.drop || s.drop.taken || d > CORPSE_REACH_M) continue;
        const name = WEAPONS[s.drop.weaponId]?.name || "枪";
        if (d < bestDist) {
          bestDist = d;
          best = { kind: "pickup", soldier: s, label: `拾起 ${name}`, dist: d };
        }
        continue;
      }
      // 活着的自己人：弹打光了就分一个桥夹过去
      if (s.side !== "nra" || d > MATE_REACH_M) continue;
      if (s.ammo > 0) continue;
      if ((this.hooks.SpareClips?.() ?? 0) < 2) continue;    // 自己只剩一个就不给了
      if (d < bestDist) {
        bestDist = d;
        best = { kind: "ammo", soldier: s, label: `分一个桥夹给 ${s.identity.name}`, dist: d };
      }
    }
    return best;
  }

  /** 真的按下去了。返回执行了的那一条，或者 null。 */
  Perform(player) {
    const candidate = this.Query(player);
    if (!candidate) return null;
    if (candidate.kind === "pickup") {
      const drop = candidate.soldier.drop;
      if (!this.hooks.TakeWeapon?.(drop.weaponId, drop.clips, candidate.soldier)) return null;
      drop.taken = true;
      this.pickups += 1;
      const w = WEAPONS[drop.weaponId];
      this.ctx.audio?.Play("magIn", { volume: 0.6 });
      // 缴获日械只有枪里那五发 —— 这句提示是这条规则唯一的说明书，别删
      this.ctx.hud?.Hint(drop.clips > 0
        ? `捡了一支${w?.name || "枪"}，还有 ${drop.clips} 个桥夹`
        : `捡了一支${w?.name || "枪"} —— 只有枪里这几发，我们没有这个口径`, 3.2);
      return candidate;
    }
    if (candidate.kind === "ammo") {
      if (!this.hooks.GiveClip?.(candidate.soldier)) return null;
      candidate.soldier.ammo = candidate.soldier.weapon.magazine || 5;
      this.handouts += 1;
      this.ctx.audio?.Play("stripperLoad", { volume: 0.55 });
      this.ctx.hud?.Say(candidate.soldier.identity.name, "接着！", 2.0);
      return candidate;
    }
    return null;
  }

  /**
   * 每帧的提示语。只在"能做的事"变了的时候打一次 ——
   * 每帧调一次 hud.Hint 会让提示条永远停在屏幕上闪。
   */
  UpdatePrompt(player) {
    const candidate = this.Query(player);
    const label = candidate ? candidate.label : null;
    if (label === this.lastLabel) return candidate;
    this.lastLabel = label;
    if (label) this.ctx.hud?.Hint(`F — ${label}`, 1.6);
    return candidate;
  }
}
