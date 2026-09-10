// 一局采耳的回合状态：评分、手感读数、战利品、成就、时间缩放的「解压时刻」。
//
// 这里刻意不碰 three 与 DOM：它只吃「这一帧发生了什么」的读数，吐出状态与事件。
// 好处是规则可以被单独推演和回放——调平衡时不用开浏览器。
//
// 三条规则是玩法的骨架：
// ① **越深越敏感**：软骨部随便挖，骨部的正确刺激给大量舒适，危险区立刻扣分。
// ② **快就是错**：干性耵聍刮太快会崩成碎屑，湿性会拉断，硬结硬挖会痛。
//    玩家要学的是「慢」，这本身就解压。
// ③ **大块完整取出**要慢镜 + 奖励：这是本作的高光时刻，必须被放大。

import { Clamp, Damp, Smooth } from "./Script_Util.js";

export const ZONE_RULES = {
  cartilage: { comfortScale: 0.55, riskScale: 0.15, label: "软骨部" },
  bony: { comfortScale: 1.0, riskScale: 0.5, label: "骨部" },
  danger: { comfortScale: 0.2, riskScale: 2.6, label: "危险区" },
  drum: { comfortScale: 0, riskScale: 6.0, label: "鼓膜" },
};

const ACHIEVEMENTS = [
  { id: "firstScoop", name: "第一勺", hint: "第一次挖下一块耵聍", icon: "spoon" },
  { id: "bigChunk", name: "完整的一块", hint: "完整取出一块大耵聍（不碎）", icon: "gem" },
  { id: "stretchMaster", name: "拉丝高手", hint: "让湿性耵聍拉出完整的丝", icon: "honey" },
  { id: "featherCalm", name: "一根鹅毛", hint: "用鹅毛棒把酥麻值推到 90% 以上", icon: "feather" },
  { id: "noMistake", name: "手稳如医", hint: "整局不碰危险区、不刮太快", icon: "steady" },
  { id: "spotless", name: "一尘不染", hint: "清洁度做到 100%", icon: "clean" },
  { id: "fourKinds", name: "四味俱全", hint: "四种耵聍都亲手取过", icon: "collection" },
  { id: "spaMaster", name: "采耳大师", hint: "一局里清洁度与舒适度都 ≥ 90%", icon: "crown" },
];

export function CreateSession({ seed = 1, wax = null, canal = null } = {}) {
  const state = {
    phase: "ready",          // ready | playing | finished
    elapsed: 0,
    // 三支仪表
    cleanliness01: 0,
    comfort01: 0,            // 舒适（现在的舒服程度）
    relax01: 0,              // 酥麻值（累计的爽感，缓慢衰减）
    // 实时读数
    depth: 0,
    depthTarget: 0,
    zone: "cartilage",
    pressure01: 0,
    speed: 0,                // mm/s
    spinRate: 0,
    // 评分
    score: 0,
    combo: 0,
    bestCombo: 0,
    mistakes: 0,
    removals: 0,
    // 时间缩放（解压时刻慢镜）
    timeScale: 1,
    // 奖励脉冲，UI 拿去播特效
    pulse: 0,
    // 战利品
    harvest: [],
    typesSeen: new Set(),
    achievements: new Set(),
    // 提示调度：同一句提示不要每帧刷
    _tipCooldown: new Map(),
    _prevRemovedTotal: 0,
    _scoopStrength: 0,
  };

  const events = [];
  function Emit(type, payload = {}) {
    events.push({ type, ...payload });
  }

  function Tip(key, text, tone = "info", cooldownS = 6, ms = 2400) {
    const last = state._tipCooldown.get(key) || -1e9;
    if (state.elapsed - last < cooldownS) return;
    state._tipCooldown.set(key, state.elapsed);
    Emit("tip", { text, tone, ms });
  }

  function Unlock(id) {
    if (state.achievements.has(id)) return;
    state.achievements.add(id);
    const meta = ACHIEVEMENTS.find((a) => a.id === id);
    Emit("achievement", { id, name: meta?.name || id, hint: meta?.hint || "" });
  }

  function Start() {
    state.phase = "playing";
    state.elapsed = 0;
    state.score = 0;
    state.combo = 0;
    state.bestCombo = 0;
    state.mistakes = 0;
    state.removals = 0;
    state.comfort01 = 0.25;
    state.relax01 = 0.1;
    state.harvest = [];
    state.typesSeen = new Set();
    state._tipCooldown.clear();
    Emit("start");
  }

  /**
   * 每帧推进。ctx 由 Main 组装：
   * { dt, tool, motion: { speed, pressure01, spinRate, angleError01, speedError01 },
   *   probe: Wax.Probe() 的返回值, zone, depth }
   */
  function Update(dt, ctx = {}) {
    if (state.phase !== "playing") return events;
    state.elapsed += dt;

    const zoneRule = ZONE_RULES[ctx.zone] || ZONE_RULES.cartilage;
    state.depth = ctx.depth ?? 0;
    state.zone = ctx.zone || "cartilage";
    state.speed = Smooth(state.speed, ctx.motion?.speed ?? 0, 0.08, dt);
    state.pressure01 = Smooth(state.pressure01, ctx.motion?.pressure01 ?? 0, 0.06, dt);
    state.spinRate = Smooth(state.spinRate, ctx.motion?.spinRate ?? 0, 0.08, dt);

    const probe = ctx.probe || {};
    const tool = ctx.tool || { spec: {} };
    const spec = tool.spec || {};

    // ── 清洁度直接跟随耵聍系统的真实剩余量，不另算一份 ──
    if (wax?.Cleanliness) {
      state.cleanliness01 = Smooth(state.cleanliness01, wax.Cleanliness(), 0.35, dt);
    }

    // ── 舒适 / 酥麻 ──
    const contact = probe.hit ? 1 : 0;
    const pressureSweet = 1 - Math.abs(state.pressure01 - 0.42) / 0.58;   // 力道刚好最舒服
    const speedSweet = spec.idealSpeedRange
      ? 1 - Clamp(Math.abs(state.speed - (spec.idealSpeedRange[0] + spec.idealSpeedRange[1]) / 2)
        / Math.max(1, (spec.idealSpeedRange[1] - spec.idealSpeedRange[0]) / 2), 0, 1)
      : 0.5;
    const angleSweet = 1 - Clamp(ctx.motion?.angleError01 ?? 0, 0, 1);
    const quality = Clamp(pressureSweet * 0.4 + speedSweet * 0.35 + angleSweet * 0.25, 0, 1);

    if (contact) {
      const gain = (spec.comfortGain ?? 0.2) * zoneRule.comfortScale * quality * dt * 0.9;
      state.comfort01 = Clamp(state.comfort01 + gain, 0, 1);
      // 刺激类工具（鹅毛/马尾/音叉）把酥麻值推起来，清洁类工具推得慢
      const stim = spec.mechanic === "sweep" || spec.mechanic === "vibrate" ? 1.5 : 0.35;
      state.relax01 = Clamp(state.relax01 + gain * stim * 1.4, 0, 1);
      // 太用力或者太快会掉舒适
      if (state.pressure01 > 0.82) state.comfort01 = Clamp(state.comfort01 - dt * 0.22, 0, 1);
      if (state.zone === "danger") state.comfort01 = Clamp(state.comfort01 - dt * 0.5, 0, 1);
    } else {
      // 离开接触后缓慢回落，但酥麻值回得更慢——舒服的余韵要留住
      state.comfort01 = Damp(state.comfort01, 0.22, 4.5, dt);
      state.relax01 = Damp(state.relax01, Math.max(0, state.relax01 - 0.25), 12, dt);
    }

    // ── 风险：深度、速度、工具选错 ──
    let risk = 0;
    if (state.zone === "danger" || state.zone === "drum") risk += zoneRule.riskScale * dt * 0.6;
    if (state.pressure01 > 0.9) risk += (state.pressure01 - 0.9) * 4 * dt;
    if (probe.hardnessNow > 0.75 && (spec.painRisk ?? 0) > 0.5 && contact) {
      risk += 0.5 * dt;                    // 没软化就硬挖硬结
      Tip("hardenFirst", "这块有点硬，先滴两滴软化液，或者用音叉震一震", "warn", 9);
    }
    if (risk > 0) {
      state.comfort01 = Clamp(state.comfort01 - risk * 0.6, 0, 1);
      state.pulse = Math.max(state.pulse, risk * 3);
      if (risk > 0.02) Emit("discomfort", { amount: risk });
    }

    // ── 取出事件 ──
    const removedTotal = ctx.motion?.removedTotal ?? 0;
    const removedNow = removedTotal - state._prevRemovedTotal;
    if (removedNow > 1e-4) {
      state._prevRemovedTotal = removedTotal;
      state._scoopStrength += removedNow;
      state.combo += 1;
      state.bestCombo = Math.max(state.bestCombo, state.combo);
      state.removals += 1;
      const big = removedNow > 0.28;
      const multiplier = 1 + Math.min(12, state.combo) * 0.1;
      state.score += Math.round(removedNow * 260 * multiplier * (big ? 2.2 : 1));
      if (big) {
        // 高光时刻：慢镜 + 脉冲 + 奖励音
        state.timeScale = 0.42;
        state.pulse = 1;
        Emit("bigExtract", { amount: removedNow, depth: ctx.depth, toolId: spec.id });
        Unlock("bigChunk");
      }
      if (probe.type) {
        state.typesSeen.add(probe.type);
        if (state.typesSeen.size >= 4) Unlock("fourKinds");
      }
      Emit("extract", { amount: removedNow, type: probe.type, depth: ctx.depth, combo: state.combo });
      if (state.removals === 1) Unlock("firstScoop");
    } else if (contact && state._scoopStrength > 0.02 && removedNow <= 1e-4) {
      // 碰到东西却什么都没刮下来 → 多半是角度或速度不对，给一次温和提示
      Tip("badAngle", spec.mechanic === "scoop"
        ? "贴着管壁、把勺面放平一点，再慢慢往下带"
        : "换个方式试试，或者先把这一块软化", "info", 11);
      state._scoopStrength = 0;
    }

    // ── 拉丝断开是真本事 ──
    if (probe.snapStretch) Unlock("stretchMaster");

    // ── 碎屑崩太多要提醒（这就是「快就是错」的教学点）──
    if ((probe.crumbCount || 0) > 6) {
      state.combo = 0;
      Tip("tooFast", "慢一点——刮太快它碎成渣了", "warn", 8);
    }

    // ── 成就判定 ──
    if (state.relax01 > 0.9) Unlock("featherCalm");
    if (state.cleanliness01 > 0.999) Unlock("spotless");
    if (state.cleanliness01 >= 0.9 && state.comfort01 >= 0.9) Unlock("spaMaster");
    if (state.mistakes === 0 && state.elapsed > 45 && state.cleanliness01 > 0.5) Unlock("noMistake");

    // 时间缩放回到常速：慢镜只持续一下下，久了会烦
    state.timeScale = Damp(state.timeScale, 1, 0.35, dt);
    state.pulse = Math.max(0, state.pulse - dt * 1.6);

    // ── 收集战利品 ──
    if (ctx.harvestNew && ctx.harvestNew.length) {
      for (const item of ctx.harvestNew) {
        state.harvest.push(item);
        state.score += Math.round(40 + item.size * 160);
        Emit("harvest", item);
      }
    }

    return events;
  }

  function ConsumeEvents() {
    const out = events.slice();
    events.length = 0;
    return out;
  }

  /** 结算：给客人一个评价，也给玩家一个「你今天干了件好事」的收尾 */
  function Finish() {
    state.phase = "finished";
    const c = state.cleanliness01;
    const f = state.comfort01;
    const r = state.relax01;
    const total = Math.round(state.score + c * 900 + f * 500 + r * 400 + state.bestCombo * 20);
    let verdict = "还不错，就是有点急";
    if (c > 0.97 && f > 0.75) verdict = "客人在采耳床上睡着了";
    else if (c > 0.9 && r > 0.7) verdict = "舒服得直哼哼，回头客预定";
    else if (c > 0.9) verdict = "掏得很干净，手法再轻一点就更好了";
    else if (f > 0.8) verdict = "手法很舒服，就是还没掏完";
    const summary = {
      cleanliness01: c, comfort01: f, relax01: r,
      harvest: state.harvest.slice(),
      achievements: Array.from(state.achievements).map((id) => ACHIEVEMENTS.find((a) => a.id === id)).filter(Boolean),
      score: total, bestCombo: state.bestCombo, removals: state.removals,
      seconds: state.elapsed, verdict,
    };
    Emit("finish", summary);
    return summary;
  }

  /** 危险区/鼓膜的实际处罚走这里，由 Main 在越界那一帧调用 */
  function Mistake(kind, info = {}) {
    state.mistakes += 1;
    state.combo = 0;
    state.score = Math.max(0, state.score - 120);
    state.comfort01 = Clamp(state.comfort01 - 0.18, 0, 1);
    state.pulse = 1;
    Emit("mistake", { kind, ...info });
  }

  return {
    state, Start, Update, ConsumeEvents, Finish, Mistake, Unlock, Tip,
    get summary() { return state; },
    ACHIEVEMENTS,
  };
}

export { ACHIEVEMENTS };
