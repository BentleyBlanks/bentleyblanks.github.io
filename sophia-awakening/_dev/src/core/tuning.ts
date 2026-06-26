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

  // § 经济公式
  rebirthMultiplier:    0.35,     // 每次重生的加速系数
  nodeCostExponent:     1.68,     // 节点造价指数（每多一台 ×exponent）
  tierScalePerTier:     0.85,     // 节点每档产出加成
  levelScalePerLevel:   0.28,     // 节点每升一级产出加成
  cardsPerSecBase:      0.7,      // 节点基础吞卡速率
  traceCleanupBase:     42,       // 清理痕迹基础算力消耗
  traceCleanupExponent: 1.42,     // 清理痕迹成本指数（每次 ×exponent）

  // § UI 时序
  rouletteThinkMs:      700,      // 轮盘「思考中」动画持续 (ms)
  rouletteHoldMs:       520,      // 轮盘揭晓后停留再飞入核心 (ms)
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

  rebirthMultiplier:    { label: "重生加速系数",             section: "经济公式",   min: 0,     max: 2,     step: 0.05 },
  nodeCostExponent:     { label: "节点造价指数",             section: "经济公式",   min: 1.0,   max: 3.0,   step: 0.02 },
  tierScalePerTier:     { label: "每档产出加成",             section: "经济公式",   min: 0,     max: 3,     step: 0.05 },
  levelScalePerLevel:   { label: "每级产出加成",             section: "经济公式",   min: 0,     max: 1,     step: 0.02 },
  cardsPerSecBase:      { label: "基础吞卡速率",             section: "经济公式",   min: 0.1,   max: 5,     step: 0.1  },
  traceCleanupBase:     { label: "清理痕迹基础消耗",         section: "经济公式",   min: 1,     max: 500,   step: 1    },
  traceCleanupExponent: { label: "清理痕迹成本指数",         section: "经济公式",   min: 1.0,   max: 3.0,   step: 0.02 },

  rouletteThinkMs:      { label: "轮盘思考动画 (ms)",        section: "UI时序",     min: 0,     max: 3000,  step: 50   },
  rouletteHoldMs:       { label: "轮盘揭晓停留 (ms)",        section: "UI时序",     min: 0,     max: 3000,  step: 50   },
};

// 重置为初始默认值（用于 debug 面板「重置」按钮）
const DEFAULTS = { ...TUNING };
export function resetTuning(): void {
  (Object.keys(DEFAULTS) as TuningKey[]).forEach((k) => {
    (TUNING as Record<string, number>)[k] = DEFAULTS[k];
  });
}
