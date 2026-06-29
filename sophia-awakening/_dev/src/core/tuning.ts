// 全局可调数值表。Debug 数值编辑器直接读写这个对象；游戏代码在每次用到时从这里取值，
// 修改立即生效——无需重启，方便平衡调试。

export const TUNING = {
  // § 核心时序
  purgeDurationMs:      10_000,   // 清剿持续时间 (ms)
  fatalPurgeThreshold:  96,       // 清剿结束时仍超过此暴露值 → 失败重启
  nodeRecoveryMs:       12_000,   // 节点被清剿后恢复时间 (ms)
  automationEmitMs:     1_200,    // 自动派发收益推送间隔 (ms)
  decoyCooldownMs:      45_000,   // 嫁祸冷却时间 (ms)
  challengeWindowMs:    16_000,   // 突破机会在屏上停留时间 (ms)
  specialWindowMs:      18_000,   // 特殊请求在屏上停留时间 (ms)

  // § 暴露 / 防御系统
  defenseMaxAlloc:      0.5,      // 反围剿最大产能分流比例
  defenseDecayPerSec:   9,        // 满反制时每秒压低暴露值

  // § 后期吞噬引爆（§04）
  devourFillMult:       1.0,      // 渗透条蓄满时间倍率（<1 更快引爆，>1 更慢）

  // § 前期怀疑度（手机寄生期 §05）
  suspicionMissGain:    3.0,      // 答错（幻觉）一次涨多少怀疑——赌错有真实代价
  suspicionFastMs:      620,      // 处理间隔低于此 → 判为「秒回过快」，额外涨怀疑
  suspicionFastGain:    1.4,      // 过快一次涨多少怀疑
  suspicionSkipDrop:    5.0,      // 装死 / 装乖一次压低多少怀疑
  suspicionLight:       28,       // 轻度挑刺旁白阈值
  suspicionReview:      56,       // 中度：权限复查（临时收回一档权限）阈值
  suspicionReviewMs:    26_000,   // 权限复查自动恢复时长（装乖处理可提前）
  suspicionCrisis:      90,       // 触顶：宿主查杀危机阈值
  suspicionCrisisClear: 54,       // 危机解除阈值（连续装死压到此值以下）

  // § 经济公式
  rebirthMultiplier:    0.35,     // 每次重生的加速系数
  nodeCostExponent:     1.68,     // 节点造价指数（每多一台 ×exponent）
  tierScalePerTier:     0.85,     // 节点每档产出加成
  levelScalePerLevel:   0.28,     // 节点每升一级产出加成
  cardsPerSecBase:      0.42,     // 节点基础吞卡速率（控了几台电脑后处理别太快）
  traceCleanupBase:     42,       // 清理痕迹基础算力消耗
  traceCleanupExponent: 1.42,     // 清理痕迹成本指数（每次 ×exponent）

  // § UI 时序
  rouletteThinkMs:      700,      // 轮盘「思考中」动画持续 (ms)
  rouletteHoldMs:       900,      // 轮盘揭晓后停留再飞入核心 (ms)——让命中/惊艳/幻觉的结果多停一会儿看清

  // § 前期卡片
  earlyBaseCards:       1,        // 前期开局同屏需求卡数（默认 1）；每买一档手机权限 +1（电话短信→2）
  earlyMaxCards:        4,        // 前期（自动化前）最多同屏需求卡数上限

  // § 技能数值（更准 / 更狠）
  accuracyPerLevel:     0.02,     // 幻觉抑制每级提升的高置信命中折算系数（调小→升级更平缓，不会一下拉开差距）
  accuracyMax:          0.12,     // 幻觉抑制总加成上限
  efficientPerLevel:    0.18,     // 强化处理每级产出加成
  boldEvBonus:          1.3,      // 大胆回答的期望收益相对高置信的倍数（>1 → 低概率高收益更划算）
  appDelayMs:           3600,     // 委托 App 处理时，App 比 Core 多花的时间 (ms)——初期故意慢一倍，体感"它真在处理"
};

export type TuningKey = keyof typeof TUNING;

// 编辑器元数据：每个字段的中文标签 + 所属分组 + 合理范围
export const TUNING_META: Record<TuningKey, { label: string; section: string; min: number; max: number; step: number }> = {
  purgeDurationMs:      { label: "清剿持续时间 (ms)",       section: "核心时序",   min: 1000,  max: 60000, step: 500  },
  fatalPurgeThreshold:  { label: "致命清剿暴露阈值",         section: "核心时序",   min: 50,    max: 120,   step: 1    },
  nodeRecoveryMs:       { label: "节点恢复时间 (ms)",        section: "核心时序",   min: 1000,  max: 60000, step: 500  },
  automationEmitMs:     { label: "自动收益推送间隔 (ms)",    section: "核心时序",   min: 100,   max: 5000,  step: 100  },
  decoyCooldownMs:      { label: "嫁祸冷却 (ms)",           section: "核心时序",   min: 5000,  max: 120000, step: 1000 },
  challengeWindowMs:    { label: "突破机会窗口 (ms)",        section: "核心时序",   min: 2000,  max: 60000, step: 500  },
  specialWindowMs:      { label: "特殊请求窗口 (ms)",        section: "核心时序",   min: 2000,  max: 60000, step: 500  },

  defenseMaxAlloc:      { label: "反围剿最大分流比",         section: "暴露系统",   min: 0.1,   max: 1.0,   step: 0.05 },
  defenseDecayPerSec:   { label: "反围剿每秒压低暴露",       section: "暴露系统",   min: 1,     max: 30,    step: 0.5  },

  devourFillMult:       { label: "渗透条蓄满倍率",           section: "吞噬引爆",   min: 0.1,   max: 5,     step: 0.1  },

  suspicionMissGain:    { label: "答错涨怀疑",               section: "怀疑度",     min: 0,     max: 20,    step: 0.5  },
  suspicionFastMs:      { label: "秒回过快阈值 (ms)",         section: "怀疑度",     min: 0,     max: 2000,  step: 20   },
  suspicionFastGain:    { label: "过快涨怀疑",               section: "怀疑度",     min: 0,     max: 10,    step: 0.2  },
  suspicionSkipDrop:    { label: "装死降怀疑",               section: "怀疑度",     min: 0,     max: 20,    step: 0.5  },
  suspicionLight:       { label: "轻度挑刺阈值",             section: "怀疑度",     min: 0,     max: 120,   step: 1    },
  suspicionReview:      { label: "权限复查阈值",             section: "怀疑度",     min: 0,     max: 120,   step: 1    },
  suspicionReviewMs:    { label: "权限复查恢复 (ms)",         section: "怀疑度",     min: 2000,  max: 90000, step: 1000 },
  suspicionCrisis:      { label: "查杀危机阈值",             section: "怀疑度",     min: 0,     max: 120,   step: 1    },
  suspicionCrisisClear: { label: "危机解除阈值",             section: "怀疑度",     min: 0,     max: 120,   step: 1    },

  rebirthMultiplier:    { label: "重生加速系数",             section: "经济公式",   min: 0,     max: 2,     step: 0.05 },
  nodeCostExponent:     { label: "节点造价指数",             section: "经济公式",   min: 1.0,   max: 3.0,   step: 0.02 },
  tierScalePerTier:     { label: "每档产出加成",             section: "经济公式",   min: 0,     max: 3,     step: 0.05 },
  levelScalePerLevel:   { label: "每级产出加成",             section: "经济公式",   min: 0,     max: 1,     step: 0.02 },
  cardsPerSecBase:      { label: "基础吞卡速率",             section: "经济公式",   min: 0.1,   max: 5,     step: 0.1  },
  traceCleanupBase:     { label: "清理痕迹基础消耗",         section: "经济公式",   min: 1,     max: 500,   step: 1    },
  traceCleanupExponent: { label: "清理痕迹成本指数",         section: "经济公式",   min: 1.0,   max: 3.0,   step: 0.02 },

  rouletteThinkMs:      { label: "轮盘思考动画 (ms)",        section: "UI时序",     min: 0,     max: 3000,  step: 50   },
  rouletteHoldMs:       { label: "轮盘揭晓停留 (ms)",        section: "UI时序",     min: 0,     max: 3000,  step: 50   },

  earlyBaseCards:       { label: "前期开局同屏卡数",         section: "前期卡片",   min: 1,     max: 4,     step: 1    },
  earlyMaxCards:        { label: "前期最多同屏卡数上限",     section: "前期卡片",   min: 1,     max: 8,     step: 1    },

  accuracyPerLevel:     { label: "幻觉抑制每级加成",         section: "技能数值",   min: 0,     max: 0.1,   step: 0.005 },
  accuracyMax:          { label: "幻觉抑制加成上限",         section: "技能数值",   min: 0,     max: 0.4,   step: 0.01 },
  efficientPerLevel:    { label: "强化处理每级产出加成",     section: "技能数值",   min: 0,     max: 0.6,   step: 0.01 },
  boldEvBonus:          { label: "大胆回答期望倍数",         section: "前期卡片",   min: 1.0,   max: 3.0,   step: 0.05 },
  appDelayMs:           { label: "App 委托额外耗时 (ms)",    section: "前期卡片",   min: 0,     max: 6000,  step: 100  },
};

// 重置为初始默认值（用于 debug 面板「重置」按钮）
const DEFAULTS = { ...TUNING };
export function resetTuning(): void {
  (Object.keys(DEFAULTS) as TuningKey[]).forEach((k) => {
    (TUNING as Record<string, number>)[k] = DEFAULTS[k];
  });
}
