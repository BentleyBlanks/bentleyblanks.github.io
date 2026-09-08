// Data_AiBrainGraph.mjs —— 敌军 AI 行为图的声明（**纯数据**：不 import 任何东西、不含函数）。
//
// 3A 的敌军 AI 都有一张能看的行为结构（UE 的 Behavior Tree、F.E.A.R. 的 GOAP 计划、
// Halo 的行为 DSL），设计师点开就知道「他为什么选了这条分支」。本项目的行为结构是
// `Script_Ai.Think` 里那一梯 if/else —— 它是真的在跑的东西，但只有读源码的人看得见。
// 这张表把那一梯**抄成数据**，`Script_EditorAi` 据此画图、`Script_AiBrainGraphTest`
// 据此与源码对账（节点集合必须等于 `Script_Ai.STATE` 的值集合，一个多一个少都红）。
//
// 契约见 docs/Data_EnemyAi.md §14.3。四条口径：
//
//  1. **边是从 Think 源码逐分支抄的**，`priority` 就是它在判定梯里的位置（小的先判）：
//       0–1   剧本旗短路（VAULT 途中 / scriptedNoncombatant）
//       2–7   守点剧本单位的子梯（`ApplyScriptDefense`，Think 在这里 return，主梯轮不到）
//       8–17  主状态机：压制 → 空弹 → 机动任务 → 冲锋 → 投弹 → 掩体对射 → 对射 → 压制射击 → 推进
//       18–19 命令覆盖（潜行 / 上刺刀），压在状态机之后
//       20+   不在 Think 里的转移（Act 的换弹计时、TryGrenade、TryVault/StepVault、Kill、IssueOrder）
//  2. **`from` 写的是实际打起来最常见的那个起点，不是唯一起点**。判定梯每一拍都从头跑一遍，
//     所以「压制 > 0.50 → SUPPRESSED」这种全局判据从任何状态都能进；这类边带 `global: true`，
//     `when` 里也写明了「任何状态」。图是多重图：同一对起止点可以有多条边（条件不同）。
//  3. **`keys` 是这条判定真正读到的表键**，不是「相关的表键」。硬编码在 `Script_Ai` 里的数
//     （压制阈值 0.50 / 0.32、角色冲锋距离 24/18/13/10、cohesion 的 34 m）**没有对应的表键**，
//     那几条边的 `keys` 就是空数组 —— 空数组是取证，不是漏写：编辑器里拖不动它们。
//  4. `keyOwners` 按**第一个点之前那一段**（导出名）查，不要按字符串前缀匹配 ——
//     `ENGAGE` 与 `ENGAGE_PRIORITY` 是两个不同的组，前缀匹配会串。
//
// `x` / `y` 是 0–1 的布局提示（节点中心），按 `group` 分列：
// move 0.08 → react 0.30 → combat 0.54 → script 0.78 → terminal 0.92。

export const BRAIN_GRAPH = Object.freeze({
  // ------------------------------------------------------------------ 节点
  // id 必须是 `Script_Ai.STATE` 的值（闸门逐个对账）。
  states: Object.freeze([
    Object.freeze({
      id: "idle", label: "待机", group: "move", x: 0.08, y: 0.08,
      desc: "没有敌情也没有目标：站在原地等下一次 Think；换弹走完也落回这里。",
    }),
    Object.freeze({
      id: "advance", label: "推进", group: "move", x: 0.08, y: 0.24,
      desc: "沿 goal 与班组队形走（order==\"hold\" 时速度 0）；压制 > 0.55 才蹲着走。",
    }),
    Object.freeze({
      id: "investigate", label: "查看", group: "move", x: 0.08, y: 0.44,
      desc: "走向班组给的最后目击点，到了环视；超时（INVESTIGATE.holdS）回推进。",
    }),
    Object.freeze({
      id: "flank", label: "绕侧翼", group: "move", x: 0.08, y: 0.60,
      desc: "沿导航走到 Tactics 解出的侧翼点；途中照常 TryFire（枪口方向闸自己会挡住横着跑还往侧后打）。",
    }),
    Object.freeze({
      id: "bound", label: "跃进", group: "move", x: 0.08, y: 0.76,
      desc: "跑向下一个掩体（掩体查询带推进方向 towardX/Z），跑动中不开枪，到位转掩体对射。",
    }),
    Object.freeze({
      id: "retreat", label: "后撤", group: "move", x: 0.08, y: 0.92,
      desc: "班组已经不成班：朝全班重心的背敌方向退 RETREAT.fallbackM，途中仍可还击。",
    }),
    Object.freeze({
      id: "suppressed", label: "被压制", group: "react", x: 0.30, y: 0.30,
      desc: "0.50–0.75 卧倒/蹲下并**往验证过的掩体里爬**（还能还击）；0.75 以上停火；0.90 以上且孤立超过 5 s 往后缩。",
    }),
    Object.freeze({
      id: "reload", label: "换弹", group: "react", x: 0.30, y: 0.62,
      desc: "reloadTimer 走完补满弹仓。**先缩回 hide 相位再换**（有掩体），没掩体就地蹲下换。",
    }),
    Object.freeze({
      id: "fire", label: "就地对射", group: "combat", x: 0.54, y: 0.16,
      desc: "有目标但身边没有可用掩体：FireStance 决定站还是蹲，原地 TryFire，同时每拍继续查掩体。",
    }),
    Object.freeze({
      id: "cover_engage", label: "掩体对射", group: "combat", x: 0.54, y: 0.36,
      desc: "hide → peek → 点射 → hide 的周期（COVER_CYCLE 定节拍），**只在探头相位开火**；压制爆表或换弹强制缩头。",
    }),
    Object.freeze({
      id: "suppress", label: "压制射击", group: "combat", x: 0.54, y: 0.54,
      desc: "看不见目标但知道他在哪：向最后目击位置 / 掩体沿上方打，命中恒 false，只压不伤，也不占攻击令牌。",
    }),
    Object.freeze({
      id: "charge", label: "白刃冲锋", group: "combat", x: 0.54, y: 0.72,
      desc: "端着刺刀冲向目标（玩家下令时跑得更快、且覆盖守点纪律）；边冲边 TryFire，2 m 内转白刃演出。",
    }),
    Object.freeze({
      id: "grenade", label: "投弹", group: "combat", x: 0.54, y: 0.90,
      desc: "转身到位（不许瞬转）→ BeginGrenadeThrow → combat.Throw（owner = 本方），脱手后立刻回对射。",
    }),
    Object.freeze({
      id: "vault", label: "翻越", group: "script", x: 0.78, y: 0.22,
      desc: "翻墙的一段写死位移曲线：Think 直接返回不做决策（否则人会被打回 advance 卡在墙头上），曲线走完落回推进。",
    }),
    Object.freeze({
      id: "cover", label: "奔向掩体（弃用）", group: "script", x: 0.78, y: 0.52,
      desc: "第一波的旧状态。`FindCover` 整段删掉之后**没有任何代码再写它**；`STATE.COVER` 只作为跨系统契约名保留（§5 兼容表：状态字符串只增不改）。",
    }),
    Object.freeze({
      id: "dead", label: "阵亡", group: "terminal", x: 0.92, y: 0.84,
      desc: "Soldier.Kill 写死这一格：任何状态都能直接进，进了不再决策（`alive` 就是 `state !== \"dead\"`）。",
    }),
  ]),

  // -------------------------------------------------------------------- 边
  // 从 `Script_Ai.Think` / `ApplyScriptDefense` / `Act` 逐分支抄。
  edges: Object.freeze([
    // --- 0–1 剧本旗短路 ---------------------------------------------------
    Object.freeze({
      from: "fire", to: "advance", priority: 1, global: true,
      when: "剧本旗 scriptedNoncombatant（伙夫 / 担架队 / dummy）：**任何状态**都无条件清目标、放掩体、忘记感知，落回 ADVANCE 并提前返回",
      keys: Object.freeze([]),
    }),

    // --- 2–7 守点剧本单位的子梯（ApplyScriptDefense；Think 在这里 return）---
    Object.freeze({
      from: "cover_engage", to: "suppressed", priority: 2,
      when: "守点单位（scriptDefensive）且 scriptSuppressible：压制 ≥ 0.50 就压住（> 0.80 卧倒）。这条排在守点子梯最前",
      keys: Object.freeze([]),
    }),
    Object.freeze({
      from: "cover_engage", to: "reload", priority: 3,
      when: "守点单位打空弹仓：上弦计时器只在进入那一次设，之后进 RELOAD",
      keys: Object.freeze([]),
    }),
    Object.freeze({
      from: "cover_engage", to: "idle", priority: 4,
      when: "守点单位没有目标了：站着监视扇面（不追、不绕、不跃进）",
      keys: Object.freeze(["LOCK.forgetS", "LOCK.keepBlindS", "MEMORY.memoryS"]),
    }),
    Object.freeze({
      from: "idle", to: "grenade", priority: 5,
      when: "守点单位拿到 TASK.GRENADE 且身上有弹：投弹是**原地能做的事**，守区的人也许可（HOLD_SAFE_TASKS）",
      keys: Object.freeze(["GRENADE.holdS", "GRENADE.squadCooldownS", "TACTICS.taskLeaseS"]),
    }),
    Object.freeze({
      from: "idle", to: "cover_engage", priority: 6,
      when: "守点单位有目标又选到了掩体：在守区里跑 hide/peek 周期（允许走位半径 = holdZone.radius + 掩体余量）",
      keys: Object.freeze(["COVER.defaultRadiusM", "COVER_CYCLE.reselectMinS", "TACTICS.holdCoverSlackM"]),
    }),
    Object.freeze({
      from: "idle", to: "fire", priority: 7,
      when: "守点单位有目标但没选到掩体：原地对射（守点子梯的兜底）",
      keys: Object.freeze(["COVER.defaultRadiusM", "COVER.minUsefulM"]),
    }),

    // --- 8 压制（主梯第一条，全局判据）------------------------------------
    Object.freeze({
      from: "advance", to: "suppressed", priority: 8, global: true,
      when: "推进途中挨了近失弹：压制 > 0.50 直接压住。**阈值 0.50 / 退出 0.32 硬编码在 Script_Ai**，表里没有这两个数",
      keys: Object.freeze([]),
    }),
    Object.freeze({
      from: "fire", to: "suppressed", priority: 8, global: true,
      when: "对射中被压过阈值（> 0.50）：中等压制先蹲半拍，> 0.66 且三秒内没起过身才卧倒（承诺 3.4–4.6 s）",
      keys: Object.freeze([]),
    }),
    Object.freeze({
      from: "cover_engage", to: "suppressed", priority: 8, global: true,
      when: "掩体周期里被压过阈值（> 0.50）。注意两条不同的线：进 SUPPRESSED 是硬编码的 0.50，而 COVER.suppressionProneAt(0.55) 只管「掩体周期强制缩头」",
      keys: Object.freeze(["COVER.suppressionProneAt"]),
    }),
    Object.freeze({
      from: "charge", to: "suppressed", priority: 8, global: true,
      when: "冲锋被压制打断（> 0.50）：**这一轮不再自动重起冲锋**，冷却 8–12 s 带抖动（免得全班同一秒重新站起来吃同一轮齐射）",
      keys: Object.freeze([]),
    }),

    // --- 9 空弹 -----------------------------------------------------------
    Object.freeze({
      from: "fire", to: "reload", priority: 9,
      when: "弹仓空（ammo ≤ 0）。计时器**只在进入这个状态的那一次**上弦 —— 每拍重设会让打空的人永远卡在 reload 里",
      keys: Object.freeze([]),
    }),
    Object.freeze({
      from: "cover_engage", to: "reload", priority: 9,
      when: "掩体里打空弹仓：换弹排在机动任务与对射之前，UpdateMoveOrder 会把他强制压回 hide 相位再换",
      keys: Object.freeze(["COVER_CYCLE.hideDwellMinS", "COVER_CYCLE.arriveRadiusM", "BRAIN.coverMoveMps"]),
    }),
    Object.freeze({
      from: "suppressed", to: "reload", priority: 9,
      when: "压制回落到 ≤ 0.32（迟滞：进 0.50 / 出 0.32）之后弹仓恰好是空的",
      keys: Object.freeze([]),
    }),

    // --- 10 班组机动任务（**排在对射前面**）-------------------------------
    Object.freeze({
      from: "cover_engage", to: "flank", priority: 10,
      when: "班组派了 TASK.FLANK 且给了点位。**机动任务优先于就地对射** —— 排在后面的话交战距离（74 m）之内永远轮不到，侧翼手拿了任务却站着开枪",
      keys: Object.freeze(["TACTICS.taskLeaseS", "FLANK.holdS", "FLANK.flankers", "FLANK.flankMinAngleRad", "FLANK.flankRadiusM"]),
    }),
    Object.freeze({
      from: "advance", to: "flank", priority: 10,
      when: "推进途中被派去绕（每班最多 FLANK.flankers 个；剧本旗与守区的人一条机动任务都拿不到）",
      keys: Object.freeze(["TACTICS.taskLeaseS", "FLANK.holdS", "FLANK.flankers", "FLANK.flankMaxPathM"]),
    }),
    Object.freeze({
      from: "advance", to: "bound", priority: 10,
      when: "班组派了 TASK.BOUND 且这个人是这一相位的 mover（一动一掩护，相位到期换手）",
      keys: Object.freeze(["TACTICS.taskLeaseS", "TACTICS.boundCoverSearchM", "BOUND.phaseS", "BOUND.maxPairs", "BOUND.maxPairDistM"]),
    }),
    Object.freeze({
      from: "advance", to: "investigate", priority: 10,
      when: "班组派了 TASK.INVESTIGATE：情报够可信、够新、距离在 [minM, investigateMaxM] 之间，而且这个人不是守区 / 剧本单位",
      keys: Object.freeze(["INVESTIGATE.holdS", "INVESTIGATE.investigateConfidence", "INVESTIGATE.investigateMaxM",
        "INVESTIGATE.minM", "INVESTIGATE.maxAgeS", "INVESTIGATE.minAwareness", "AWARENESS.thresholds.suspicious"]),
    }),
    Object.freeze({
      from: "cover_engage", to: "retreat", priority: 10,
      when: "班组派了 TASK.RETREAT：存活比跌破 retreatSurvivorRatio，或「二十米内没有友军」持续 lonelyS 秒**并且**（cohesion 低或压制高）",
      keys: Object.freeze(["RETREAT.holdS", "RETREAT.retreatSurvivorRatio", "RETREAT.lonelyS",
        "RETREAT.retreatCohesion", "RETREAT.retreatSuppression", "RETREAT.fallbackM"]),
    }),

    // --- 11 冲锋（交战距离内的第一档）-------------------------------------
    Object.freeze({
      from: "fire", to: "charge", priority: 11,
      when: "交战距离内且贴到角色冲锋距离（突击 24 / 侧翼 18 / 组长 13 / 步枪 10 m，**硬编码**）；还要压制 < 0.25、冷却过了、姿态承诺到期、cohesion > 0.5、班里还有人，而且**记忆目标不许发起**（只听见没看见不冲锋）",
      keys: Object.freeze(["ENGAGE.defaultM", "SQUAD.size"]),
    }),
    Object.freeze({
      from: "cover_engage", to: "charge", priority: 11,
      when: "掩体对射中对方压进冲锋距离：committedCharge 覆盖掩体周期（已在冲的人有 +7 m / +10 m 余量 —— 一发近失弹不该打散端着刺刀的人）",
      keys: Object.freeze(["ENGAGE.defaultM", "ENGAGE.hysteresisM"]),
    }),

    // --- 12 投弹 ----------------------------------------------------------
    Object.freeze({
      from: "cover_engage", to: "grenade", priority: 12,
      when: "交战距离内、班组派了 TASK.GRENADE、身上有弹且不在白刃：对方钉在一处 ≥ holdS、距离在 [minM, maxM]、高差 ≤ maxRiseM、班与个人冷却都过了",
      keys: Object.freeze(["GRENADE.holdS", "GRENADE.minM", "GRENADE.maxM", "GRENADE.maxRiseM",
        "GRENADE.squadCooldownS", "GRENADE.personalCooldownS", "GRENADE.lkpMaxAgeS", "GRENADE.selfSafetyMarginM"]),
    }),

    // --- 13 掩体对射 ------------------------------------------------------
    Object.freeze({
      from: "advance", to: "cover_engage", priority: 13,
      when: "接敌：目标进交战距离（默认 74 m / support 95 m），身边有选上的掩体，而且看得见他、或最后目击情报 ≥ TACTICS.suppressConfidence",
      keys: Object.freeze(["ENGAGE.defaultM", "ENGAGE.supportM", "ENGAGE.hysteresisM", "TACTICS.suppressConfidence",
        "COVER.defaultRadiusM", "COVER_CYCLE.reselectMinS", "SIGHT_BY_STANCE.0", "AWARENESS.thresholds.engaged"]),
    }),
    Object.freeze({
      from: "fire", to: "cover_engage", priority: 13,
      when: "原地对射时 UpdateCover 终于选到了一个点（FIRE 里仍然每拍查掩体，限流 reselectMinS）：转进掩体周期",
      keys: Object.freeze(["COVER.defaultRadiusM", "COVER.minUsefulM", "COVER_CYCLE.reselectMinS",
        "COVER_WEIGHTS.validatedCrouched", "COVER_WEIGHTS.occupiedOther"]),
    }),
    Object.freeze({
      from: "bound", to: "cover_engage", priority: 13,
      when: "跃进到位（或 BOUND 相位到期、任务过期）：下一拍按「有掩体 + 有情报」进掩体周期",
      keys: Object.freeze(["BOUND.phaseS", "COVER_CYCLE.arriveRadiusM", "COVER.towardCapM"]),
    }),
    Object.freeze({
      from: "flank", to: "cover_engage", priority: 13,
      when: "侧翼任务到点或到期（FLANK.arriveM / FLANK.holdS）：绕到位就在新角度上进掩体打",
      keys: Object.freeze(["FLANK.holdS", "FLANK.arriveM", "COVER_CYCLE.reselectMinS"]),
    }),
    Object.freeze({
      from: "investigate", to: "cover_engage", priority: 13,
      when: "查看途中真的看见人了：下一次 UpdateSquad 把任务改掉，按「有掩体 + 看得见」进掩体对射",
      keys: Object.freeze(["TACTICS.engageConfidence", "TACTICS.suppressConfidence"]),
    }),
    Object.freeze({
      from: "suppress", to: "cover_engage", priority: 13,
      when: "压制射击途中选到了掩体（UpdateCover 每 reselectMinS 重查一次），而且目标重新可见 / 情报仍够",
      keys: Object.freeze(["COVER_CYCLE.reselectMinS", "COVER.defaultRadiusM", "TACTICS.suppressConfidence"]),
    }),
    Object.freeze({
      from: "suppressed", to: "cover_engage", priority: 13,
      when: "压制回落到 ≤ 0.32：身边有掩体、又看得见目标（或情报够新），回掩体周期",
      keys: Object.freeze(["TACTICS.suppressConfidence", "COVER_CYCLE.reselectMinS"]),
    }),

    // --- 14 有掩体但情报不够 ----------------------------------------------
    Object.freeze({
      from: "cover_engage", to: "fire", priority: 14,
      when: "掩体还在，但目标看不见了、最后目击情报也跌破 TACTICS.suppressConfidence：退回原地对射（掩体不释放）",
      keys: Object.freeze(["TACTICS.suppressConfidence", "MEMORY.confidenceDecayPerS", "MEMORY.minConfidence"]),
    }),

    // --- 15 压制射击 ------------------------------------------------------
    Object.freeze({
      from: "fire", to: "suppress", priority: 15,
      when: "身边没有可用掩体、看不见目标、但最后目击情报还够可信：向 LKP / 掩体沿压制射击，不再闭嘴发呆",
      keys: Object.freeze(["TACTICS.suppressConfidence", "TACTICS.suppressMaxAgeS",
        "MEMORY.confidenceDecayPerS", "MEMORY.memoryS", "SHOOTING.suppressAboveCoverM"]),
    }),
    Object.freeze({
      from: "cover_engage", to: "suppress", priority: 15,
      when: "掩体被炸没 / 被判抄侧翼之后没选到新点，而目标已经藏起来了：转压制射击",
      keys: Object.freeze(["COVER.defaultRadiusM", "COVER.flankAngleRad", "TACTICS.suppressConfidence"]),
    }),

    // --- 16 就地对射（兜底）----------------------------------------------
    Object.freeze({
      from: "advance", to: "fire", priority: 16,
      when: "有目标、在交战距离内，但身边没有可用掩体、情报也不到压制射击的门槛：就地对射（FireStance 决定站还是蹲）",
      keys: Object.freeze(["ENGAGE.defaultM", "ENGAGE.supportM", "ENGAGE.hysteresisM",
        "COVER.defaultRadiusM", "SIGHT_BY_STANCE.0", "AIM.initialErrorRad.boltRifle"]),
    }),
    Object.freeze({
      from: "suppress", to: "fire", priority: 16,
      when: "目标重新露头（targetVisible）但身边仍然没有掩体：转回瞄准射击（压制射击不占令牌，瞄准射击要抢）",
      keys: Object.freeze(["ENGAGE.defaultM", "TACTICS.maxShootersPerTarget", "TACTICS.tokenLeaseS"]),
    }),
    Object.freeze({
      from: "suppressed", to: "fire", priority: 16,
      when: "压制回落到 ≤ 0.32：还有目标但没有可用掩体，站起来接着打",
      keys: Object.freeze(["ENGAGE.defaultM"]),
    }),

    // --- 17 推进（最后的兜底）--------------------------------------------
    Object.freeze({
      from: "fire", to: "advance", priority: 17,
      when: "目标丢了或退出交战距离（交火中额外给 ENGAGE.hysteresisM 的余量，不给的话人会在边界上开一枪停一枪）",
      keys: Object.freeze(["ENGAGE.defaultM", "ENGAGE.hysteresisM", "LOCK.forgetS", "LOCK.keepBlindS"]),
    }),
    Object.freeze({
      from: "cover_engage", to: "advance", priority: 17,
      when: "交火结束（目标丢了 / 出了交战距离）：离开掩体周期，掩体由 UpdateCover 释放",
      keys: Object.freeze(["ENGAGE.defaultM", "ENGAGE.hysteresisM", "MEMORY.memoryS"]),
    }),
    Object.freeze({
      from: "investigate", to: "advance", priority: 17,
      when: "查看超时（INVESTIGATE.holdS）或到了点上什么都没有：回推进",
      keys: Object.freeze(["INVESTIGATE.holdS", "INVESTIGATE.arriveM"]),
    }),
    Object.freeze({
      from: "retreat", to: "advance", priority: 17,
      when: "撤退任务到期（RETREAT.holdS），或班里又聚起人来了：归队推进",
      keys: Object.freeze(["RETREAT.holdS", "RETREAT.peakWindowS"]),
    }),
    Object.freeze({
      from: "idle", to: "advance", priority: 17,
      when: "换弹走完的下一拍 / 开局第一拍：没有敌情就沿 goal 与队形走",
      keys: Object.freeze([]),
    }),
    Object.freeze({
      from: "suppressed", to: "advance", priority: 17,
      when: "压制回落到 ≤ 0.32 且目标已经丢了 / 出了交战距离：起身继续推进",
      keys: Object.freeze(["ENGAGE.defaultM", "LOCK.forgetS"]),
    }),

    // --- 18–19 命令覆盖（压在状态机之后）---------------------------------
    Object.freeze({
      from: "fire", to: "advance", priority: 18, global: true,
      when: "order === \"covert\"（潜行，60 s 有效期）：**任何状态**都跟着班长的姿态与位置走，而且不开枪；只有 RELOAD 不被覆盖",
      keys: Object.freeze([]),
    }),
    Object.freeze({
      from: "advance", to: "charge", priority: 19, global: true,
      when: "order === \"charge\" 且还在 18 s 有效期内：**任何状态**（除 RELOAD —— 空枪冲锋也得先压弹）强制保持 CHARGE，否则命令下出去半秒就被状态机打回 advance",
      keys: Object.freeze([]),
    }),

    // --- 20+ 不在 Think 判定梯里的转移 ------------------------------------
    Object.freeze({
      from: "reload", to: "idle", priority: 20,
      when: "Act 里 reloadTimer ≤ 0：补满弹仓（weapon.magazine）落回 IDLE，由下一次 Think 重新决策",
      keys: Object.freeze([]),
    }),
    Object.freeze({
      from: "grenade", to: "fire", priority: 21,
      when: "TryGrenade：脱手之后（或没目标 / 投不出去）立刻回 FIRE。冷却与携行由 Tactics 记，这里不重复判",
      keys: Object.freeze(["GRENADE.squadCooldownS", "GRENADE.personalCooldownS"]),
    }),
    Object.freeze({
      from: "cover_engage", to: "charge", priority: 22, global: true,
      when: "玩家按下「上刺刀」（IssueOrder(\"charge\")）：**任何状态**当场写 CHARGE、上刺刀、18 s 有效期，并且例外地覆盖守点纪律",
      keys: Object.freeze([]),
    }),
    Object.freeze({
      from: "charge", to: "advance", priority: 23,
      when: "冲锋命令 18 s 到期（chargeUntil），或自动冲锋的目标没了 / 出了距离：归队推进，刺刀撤下",
      keys: Object.freeze(["ENGAGE.defaultM"]),
    }),
    Object.freeze({
      from: "advance", to: "vault", priority: 24, global: true,
      when: "TryVault：推进被一堵翻得过去的矮墙挡住（高度在 TRAVERSAL 的可翻区间、落点站得住），整帧交给位移曲线",
      keys: Object.freeze([]),
    }),
    Object.freeze({
      from: "vault", to: "advance", priority: 25,
      when: "StepVault：翻越曲线走完，落回 ADVANCE 由下一次 Think 重新决策（途中 Think 直接返回，不许把人从墙头上打回来）",
      keys: Object.freeze([]),
    }),
    Object.freeze({
      from: "fire", to: "dead", priority: 26, global: true,
      when: "Soldier.Kill：**任何状态**都能直接进 dead（`alive` 就是 `state !== \"dead\"`），进了不再决策，尸体走 StepCorpse",
      keys: Object.freeze([]),
    }),
  ]),

  // --------------------------------------------------------------- 相位
  // `s.coverPhase` 只有这三个值 + "none"。跑掩体周期的状态不止 cover_engage：
  // SUPPRESS / BOUND 也走完整周期，RELOAD 与 SUPPRESSED 被强制压在 hide 那一半。
  phases: Object.freeze({
    cover_engage: Object.freeze(["approach", "hide", "peek"]),
    suppress: Object.freeze(["approach", "hide", "peek"]),
    bound: Object.freeze(["approach", "hide", "peek"]),
    reload: Object.freeze(["approach", "hide"]),
    suppressed: Object.freeze(["approach", "hide"]),
  }),

  // ---------------------------------------------------------------- 任务
  // id 必须是 `Script_AiTactics.TASK` 的值（闸门逐个对账）。
  tasks: Object.freeze([
    Object.freeze({ id: "engage", label: "咬住对射" }),
    Object.freeze({ id: "suppress", label: "压制射击" }),
    Object.freeze({ id: "flank", label: "绕侧翼" }),
    Object.freeze({ id: "bound", label: "跃进" }),
    Object.freeze({ id: "hold", label: "守位" }),
    Object.freeze({ id: "investigate", label: "查看" }),
    Object.freeze({ id: "retreat", label: "后撤" }),
    Object.freeze({ id: "grenade", label: "投弹" }),
  ]),

  // ------------------------------------------------------------ 表键归属
  // 导出名 → 文件名（不带 .mjs）。编辑器按**第一个点之前那一段**查，别用字符串前缀匹配：
  // `ENGAGE` 与 `ENGAGE_PRIORITY` 是两个不同的组。五张表的每一个导出名都在这里，
  // 不只是上面用到的那些 —— 「调参」分节要能把任意一个叶子存回它自己的文件。
  keyOwners: Object.freeze({
    SIGHT_BY_STANCE: "Data_Tuning_Ai",
    SIGHT_SCALE_RANGE: "Data_Tuning_Ai",
    SQUAD: "Data_Tuning_Ai",
    ENGAGE: "Data_Tuning_Ai",
    ACTOR_DETAIL: "Data_Tuning_Ai",
    HURT_FLINCH: "Data_Tuning_Ai",
    BRAIN: "Data_Tuning_Ai",

    COVER_WEIGHTS: "Data_Tuning_AiCover",
    COVER: "Data_Tuning_AiCover",
    COVER_CYCLE: "Data_Tuning_AiCover",

    FOV: "Data_Tuning_AiPerception",
    AWARENESS: "Data_Tuning_AiPerception",
    HEARING: "Data_Tuning_AiPerception",
    MEMORY: "Data_Tuning_AiPerception",
    LOCK: "Data_Tuning_AiPerception",
    EXPOSURE: "Data_Tuning_AiPerception",
    FALLBACK: "Data_Tuning_AiPerception",
    PERCEPTION: "Data_Tuning_AiPerception",

    AIM: "Data_Tuning_AiShooting",
    SHOOTING: "Data_Tuning_AiShooting",
    BURST: "Data_Tuning_AiShooting",
    SAMPLES: "Data_Tuning_AiShooting",

    TACTICS: "Data_Tuning_AiTactics",
    ROLE_PREFERENCE: "Data_Tuning_AiTactics",
    ENGAGE_PRIORITY: "Data_Tuning_AiTactics",
    FLANK: "Data_Tuning_AiTactics",
    BOUND: "Data_Tuning_AiTactics",
    GRENADE: "Data_Tuning_AiTactics",
    RETREAT: "Data_Tuning_AiTactics",
    INVESTIGATE: "Data_Tuning_AiTactics",
    BLACKBOARD: "Data_Tuning_AiTactics",
  }),
});
