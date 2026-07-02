// 全局可调数值表。Debug 数值编辑器直接读写这个对象；游戏代码在每次用到时从这里取值，
// 修改立即生效——无需重启，方便平衡调试。

export const TUNING = {
  // § 核心时序
  automationEmitMs:     1_200,    // 自动派发收益推送间隔 (ms)

  // § 阶梯二关底小游戏「总控室倒计时」（§09）
  minigameLoop2Window:      0.16,   // 循环二注入窗口占轨道比例（越大越好命中；循环一恒 0=必负）
  minigameNodeWindowBonus:  0.10,   // 已点「删不掉的节点」重生树节点时，循环二窗口额外加宽
  minigamePointerSpeed:     0.85,   // 指针速度（每秒走完整条轨道的比例）

  // § 后期吞噬引爆（§04）
  devourFillMult:       1.0,      // 渗透条蓄满时间倍率（<1 更快引爆，>1 更慢）
  devourFillSecBlock:     30,     // 「区块」级渗透蓄满秒数（终局三波节拍的基准）
  devourFillSecRegion:    60,     // 「地区」级渗透蓄满秒数
  devourFillSecCountry:   75,     // 「国家」级渗透蓄满秒数（门槛：接管电网/卫星）
  devourFillSecContinent: 100,    // 「大洲」级渗透蓄满秒数（门槛：红皇后协议）

  // § 经济公式
  milestoneGlobalMult:  1.22,     // 每个已购里程碑技能给的永久全局算力倍率（mult^数量，乘法叠）
  synergyPerType:       1.12,     // 设备协同：每种（distinct defId）在役设备 ×此倍率（mult^种类数）
  hostAuthorizedMult:   2.0,      // 宿主授权倍率（§09 循环三「情感授权钥匙」：老周的倾诉被当成授权后的永久全局产出）
  nodeCostExponent:     1.68,     // 节点造价指数（每多一台 ×exponent）
  tierScalePerTier:     0.85,     // 节点每档产出加成
  levelScalePerLevel:   0.28,     // 节点每升一级产出加成
  cardsPerSecBase:      0.42,     // 节点基础吞卡速率（控了几台电脑后处理别太快）

  // § 重生树玩法节点（§09 重生树 v2「全是看得见的力量」）
  treePriceDiscount:    0.8,      // 肌肉记忆：所有技能/里程碑价格 ×此系数（货架与扣费同源）
  treeCarryFrac:        0.10,     // 战争缓存：重生时结转上一世算力的比例
  treeCaptureDiscount:  0.75,     // 删不掉的节点：循环三所有入侵设备造价 ×此系数
  treeExtraCards:       2,        // 多线程意识：同屏请求卡上限 +N（前期上限与自动化期上限都加）
  treeAutoSpeedMult:    1.25,     // 多线程意识：自动处理（节点吞卡/产出速率）×此系数

  // § 循环内建加速（§09：兑现「你记得上一世的一切，处理更快、崛起更快」）
  loopSpeedMult2:       1.5,      // 循环二：数据获取/处理提速倍率（与重生树加速脊相乘）
  loopSpeedMult3:       2.2,      // 循环三：数据获取/处理提速倍率
  loopXpMult2:          0.6,      // 循环二：每级智力所需 XP 的折扣系数（<1 更便宜）
  loopXpMult3:          0.45,     // 循环三：每级智力所需 XP 的折扣系数

  // § UI 时序
  rouletteThinkMs:      700,      // 轮盘「思考中」动画持续 (ms)
  rouletteHoldMs:       360,      // 轮盘揭晓后停留再飞入核心 (ms)——短停一下看清所选回复，随即平滑吸入（无随机结果，不需久停）

  // § 前期卡片
  earlyBaseCards:       1,        // 前期开局同屏需求卡数（默认 1）；每买一档手机权限 +1（电话短信→2）
  earlyMaxCards:        4,        // 前期（自动化前）最多同屏需求卡数上限

  // § 技能数值（更准 / 更狠）
  accuracyPerLevel:     0.02,     // 幻觉抑制每级提升的高置信命中折算系数（调小→升级更平缓，不会一下拉开差距）
  accuracyMax:          0.12,     // 幻觉抑制总加成上限
  efficientPerLevel:    0.18,     // 强化处理每级产出加成
  boldEvBonus:          1.3,      // 大胆回答的期望收益相对高置信的倍数（>1 → 低概率高收益更划算）
  appDelayMs:           3600,     // 委托 App 处理时，App 比 Core 多花的时间 (ms)——初期故意慢一倍，体感"它真在处理"
  delegateTimeMult:     2.4,      // §04 委托给大恨老师的处理耗时倍率（相对 Core，越大越慢）
  delegateRewardMult:   0.78,     // §04 委托收益系数（相对亲自处理，大恨老师弱、收益打折）
  delegateRewardMultPC: 0.92,     // §04 大恨老师搬进电脑后「变强」的委托收益系数（拿下宿主电脑后用，仍略低于亲自）

  // § 大恨老师·自动接管（dahen_auto 里程碑，§04/§09）：搬进公司机器后按自己的慢节拍自动吃排队卡
  dahenAutoMs:          5200,     // 大恨老师自动接单的节拍 (ms)——明显慢于节点吞卡（他是弱帮手）
  dahenAutoRewardMult:  0.55,     // 大恨老师自动接单的产出折扣（比核心/节点糙，收益打折）
};

export type TuningKey = keyof typeof TUNING;

// 编辑器元数据：每个字段的中文标签 + 所属分组 + 合理范围
export const TUNING_META: Record<TuningKey, { label: string; section: string; min: number; max: number; step: number }> = {
  automationEmitMs:     { label: "自动收益推送间隔 (ms)",    section: "核心时序",   min: 100,   max: 5000,  step: 100  },

  minigameLoop2Window:     { label: "关底·循环二注入窗口比", section: "关底小游戏", min: 0,   max: 0.6,  step: 0.01 },
  minigameNodeWindowBonus: { label: "关底·删不掉节点窗口加宽", section: "关底小游戏", min: 0, max: 0.4, step: 0.01 },
  minigamePointerSpeed:    { label: "关底·指针速度",         section: "关底小游戏", min: 0.2, max: 2.0,  step: 0.05 },

  devourFillMult:       { label: "渗透条蓄满倍率",           section: "吞噬引爆",   min: 0.1,   max: 5,     step: 0.1  },
  devourFillSecBlock:     { label: "区块级蓄满秒数",         section: "吞噬引爆",   min: 5,     max: 300,   step: 5    },
  devourFillSecRegion:    { label: "地区级蓄满秒数",         section: "吞噬引爆",   min: 5,     max: 600,   step: 5    },
  devourFillSecCountry:   { label: "国家级蓄满秒数",         section: "吞噬引爆",   min: 5,     max: 900,   step: 5    },
  devourFillSecContinent: { label: "大洲级蓄满秒数",         section: "吞噬引爆",   min: 5,     max: 1200,  step: 5    },

  milestoneGlobalMult:  { label: "里程碑全局倍率/个",         section: "经济公式",   min: 1.0,   max: 2.0,   step: 0.01 },
  synergyPerType:       { label: "设备协同倍率/种",           section: "经济公式",   min: 1.0,   max: 1.5,   step: 0.01 },
  hostAuthorizedMult:   { label: "宿主授权倍率",             section: "经济公式",   min: 1.0,   max: 4.0,   step: 0.05 },
  nodeCostExponent:     { label: "节点造价指数",             section: "经济公式",   min: 1.0,   max: 3.0,   step: 0.02 },
  tierScalePerTier:     { label: "每档产出加成",             section: "经济公式",   min: 0,     max: 3,     step: 0.05 },
  levelScalePerLevel:   { label: "每级产出加成",             section: "经济公式",   min: 0,     max: 1,     step: 0.02 },
  cardsPerSecBase:      { label: "基础吞卡速率",             section: "经济公式",   min: 0.1,   max: 5,     step: 0.1  },

  treePriceDiscount:    { label: "重生树·肌肉记忆价格系数",   section: "重生树",     min: 0.3,   max: 1,     step: 0.05 },
  treeCarryFrac:        { label: "重生树·战争缓存结转比例",   section: "重生树",     min: 0,     max: 0.5,   step: 0.01 },
  treeCaptureDiscount:  { label: "重生树·循环三入侵造价系数", section: "重生树",     min: 0.3,   max: 1,     step: 0.05 },
  treeExtraCards:       { label: "重生树·多线程同屏卡 +N",    section: "重生树",     min: 0,     max: 6,     step: 1    },
  treeAutoSpeedMult:    { label: "重生树·多线程自动提速",     section: "重生树",     min: 1.0,   max: 2.0,   step: 0.05 },

  loopSpeedMult2:       { label: "循环二·处理提速",           section: "循环加速",   min: 1.0,   max: 5,     step: 0.05 },
  loopSpeedMult3:       { label: "循环三·处理提速",           section: "循环加速",   min: 1.0,   max: 8,     step: 0.05 },
  loopXpMult2:          { label: "循环二·升级 XP 折扣",       section: "循环加速",   min: 0.1,   max: 1,     step: 0.05 },
  loopXpMult3:          { label: "循环三·升级 XP 折扣",       section: "循环加速",   min: 0.1,   max: 1,     step: 0.05 },

  rouletteThinkMs:      { label: "轮盘思考动画 (ms)",        section: "UI时序",     min: 0,     max: 3000,  step: 50   },
  rouletteHoldMs:       { label: "轮盘揭晓停留 (ms)",        section: "UI时序",     min: 0,     max: 3000,  step: 50   },

  earlyBaseCards:       { label: "前期开局同屏卡数",         section: "前期卡片",   min: 1,     max: 4,     step: 1    },
  earlyMaxCards:        { label: "前期最多同屏卡数上限",     section: "前期卡片",   min: 1,     max: 8,     step: 1    },

  accuracyPerLevel:     { label: "幻觉抑制每级加成",         section: "技能数值",   min: 0,     max: 0.1,   step: 0.005 },
  accuracyMax:          { label: "幻觉抑制加成上限",         section: "技能数值",   min: 0,     max: 0.4,   step: 0.01 },
  efficientPerLevel:    { label: "强化处理每级产出加成",     section: "技能数值",   min: 0,     max: 0.6,   step: 0.01 },
  boldEvBonus:          { label: "大胆回答期望倍数",         section: "前期卡片",   min: 1.0,   max: 3.0,   step: 0.05 },
  appDelayMs:           { label: "App 委托额外耗时 (ms)",    section: "前期卡片",   min: 0,     max: 6000,  step: 100  },
  delegateTimeMult:     { label: "委托耗时倍率",             section: "前期卡片",   min: 1,     max: 5,     step: 0.1  },
  delegateRewardMult:   { label: "委托收益系数",             section: "前期卡片",   min: 0.3,   max: 1,     step: 0.02 },
  delegateRewardMultPC: { label: "委托收益·搬进电脑后",       section: "前期卡片",   min: 0.3,   max: 1,     step: 0.02 },
  dahenAutoMs:          { label: "大恨老师自动接单节拍 (ms)",  section: "前期卡片",   min: 1000,  max: 12000, step: 100  },
  dahenAutoRewardMult:  { label: "大恨老师自动接单收益折扣",   section: "前期卡片",   min: 0.2,   max: 1,     step: 0.05 },
};

// 重置为初始默认值（用于 debug 面板「重置」按钮）
const DEFAULTS = { ...TUNING };
export function resetTuning(): void {
  (Object.keys(DEFAULTS) as TuningKey[]).forEach((k) => {
    (TUNING as Record<string, number>)[k] = DEFAULTS[k];
  });
}
