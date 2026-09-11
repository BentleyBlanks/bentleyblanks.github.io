// 采耳小铺的经营环：客人 → 采耳 → 收钱 → 升级 → 更难的客人。
//
// 这一层刻意**不碰 three、不碰 DOM**，只吃一局的结算、吐出钱与升级。好处是
// 平衡数值可以被单独推演和回放，调价不用开浏览器——经营环最容易失衡，也最
// 需要反复试。
//
// 循环设计（一局 = 一位客人）：
//   ① 今天来 1~3 位客人，客人带自己的耳道（耵聍分布种子、硬结比例、脾气）。
//   ② 采完结算：清洁度给工时费，舒适度给小费，连击给加成，越界/挖痛要赔。
//   ③ 钱花在两处：**升级工具**（更省力、更不容易崩碎、更舒服）与**升级铺面**
//      （更好的灯与场景、更多客人、更高的单价）。
//   ④ 声望 = 累计满意度的函数，决定来什么档次的客人；客人越难，报酬越高。
//   ⑤ 打烊 → 明天。存档只存这几个数字，换皮换场景不动存档。
//
// 升级的效果必须**真的改变手感**，不能只是数字好看：工具等级会改写
// comfortGain / crackRisk / idealSpeedRange，这些字段是耵聍判定真正读的。

import { Clamp } from "./Script_Util.js?v=ear010-20260911";

const STORAGE_KEY = "earspa3d.shop.v1";
const MAX_TOOL_LEVEL = 5;
const MAX_SHOP_LEVEL = 4;

/** 客人档位：难度由耳道里的耵聍分布决定，报酬随之上升 */
export const CUSTOMER_TIERS = [
  {
    id: "easy", name: "随便掏掏", minRep: 0,
    waxCount: [8, 12], impactedRatio: 0.0, wetRatio: 0.25,
    basePay: 18, patience: 1.0,
    blurb: "第一次来，有点紧张。",
  },
  {
    id: "normal", name: "常客", minRep: 6,
    waxCount: [12, 18], impactedRatio: 0.12, wetRatio: 0.35,
    basePay: 30, patience: 1.0,
    blurb: "熟门熟路，躺下就开始眯眼。",
  },
  {
    id: "tough", name: "老饕", minRep: 18,
    waxCount: [16, 24], impactedRatio: 0.25, wetRatio: 0.45,
    basePay: 46, patience: 0.95,
    blurb: "耳朵里藏着一块硬的，专门来找人。",
  },
  {
    id: "hard", name: "栓塞重症", minRep: 36,
    waxCount: [22, 30], impactedRatio: 0.42, wetRatio: 0.5,
    basePay: 70, patience: 0.9,
    blurb: "堵了有些年头了，自己都不敢碰。",
  },
];

/** 铺面等级：解锁氛围、提高单价、增加每日客数 */
export const SHOP_LEVELS = [
  { level: 1, name: "街边小摊", cost: 0, moods: ["teaRoom"], customersPerDay: [1, 2], priceMul: 1.0, blurb: "一张躺椅，一盏台灯。" },
  { level: 2, name: "巷口小铺", cost: 160, moods: ["teaRoom", "morning"], customersPerDay: [2, 3], priceMul: 1.15, blurb: "多了扇窗，白天有光。" },
  { level: 3, name: "临街雅间", cost: 420, moods: ["teaRoom", "morning", "rainNight"], customersPerDay: [2, 3], priceMul: 1.35, blurb: "雨夜听得见水声，客人最爱。" },
  { level: 4, name: "老字号采耳", cost: 900, moods: ["teaRoom", "morning", "rainNight", "sleepy"], customersPerDay: [3, 4], priceMul: 1.6, blurb: "榻上铺了软褥，来的人多半会睡着。" },
];

/** 升级一件工具到第 level 级的价钱（第 1 级是白送的初始状态） */
export function ToolUpgradeCost(level) {
  return [0, 0, 45, 110, 230, 460][Clamp(level, 0, MAX_TOOL_LEVEL)] ?? 0;
}

export function CreateShop({ seed = 20260910, storage = null } = {}) {
  const store = storage || SafeStorage();

  const state = {
    day: 1,
    coins: 60,
    reputation: 0,
    shopLevel: 1,
    toolLevels: {},          // id -> 1..5
    totalEarned: 0,
    totalCustomers: 0,
    bestPayout: 0,
    inventory:{tools:['scoop','tweezers','drops','feather'],skins:{},equipped:{}},
    unlockedTools: null,     // Set，由外部灌入（EAR_TOOLS 的 id 列表）
    todayCustomers: [],      // [{ tierId, name, waxSeed, mood, done, paid }]
    todayIndex: 0,
    mood: "teaRoom",
    log: [],
  };

  // ── 存档：只存数字与 id，不存任何场景对象 ──
  function Save() {
    try {
      store.setItem(STORAGE_KEY, JSON.stringify({
        day: state.day, coins: state.coins, reputation: state.reputation,
        shopLevel: state.shopLevel, toolLevels: state.toolLevels,
        totalEarned: state.totalEarned, totalCustomers: state.totalCustomers,
        bestPayout: state.bestPayout, mood: state.mood, inventory:state.inventory,version: 2,
      }));
    } catch { /* 隐私模式写不了，静默 */ }
  }

  function Load() {
    try {
      const raw = store.getItem(STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      state.day = data.day ?? 1;
      state.coins = data.coins ?? 60;
      state.reputation = data.reputation ?? 0;
      state.shopLevel = Clamp(data.shopLevel ?? 1, 1, MAX_SHOP_LEVEL);
      state.toolLevels = data.toolLevels || {};
      state.totalEarned = data.totalEarned ?? 0;
      state.totalCustomers = data.totalCustomers ?? 0;
      state.bestPayout = data.bestPayout ?? 0;
      state.mood = data.mood || 'teaRoom';
      state.inventory={tools:['scoop','tweezers','drops','feather'],skins:{},equipped:{},...data.inventory};
      state.inventory.tools=[...new Set([...state.inventory.tools,'feather'])];
      return true;
    } catch { return false; }
  }

  function Reset() {
    state.day = 1;
    state.coins = 60;
    state.reputation = 0;
    state.shopLevel = 1;
    state.toolLevels = {};state.inventory={tools:['scoop','tweezers','drops','feather'],skins:{},equipped:{}};
    state.totalEarned = 0;
    state.totalCustomers = 0;
    state.bestPayout = 0;
    state.todayCustomers = [];
    state.todayIndex = 0;
    state.log = [];
    Save();
  }

  // ── 客人 ──
  const NAMES = ["老张", "小林", "阿May", "胖叔", "程姑娘", "出租车老李", "楼上的学生",
    "王阿姨", "夜班护士", "卖花的小陈", "棋摊赵爷", "隔壁理发师"];

  function TierForReputation(rep) {
    let best = CUSTOMER_TIERS[0];
    for (const tier of CUSTOMER_TIERS) if (rep >= tier.minRep) best = tier;
    return best;
  }

  function MakeCustomer(rng, index) {
    const tier = TierForReputation(state.reputation);
    const name = rng.pick(NAMES);
    const [lo, hi] = tier.waxCount;
    return {
      id: `d${state.day}c${index}`,
      tierId: tier.id,
      tierName: tier.name,
      name,
      blurb: tier.blurb,
      waxSeed: (state.day * 7919 + index * 104729 + seed) >>> 0,
      waxCount: rng.int(lo, hi),
      impactedRatio: tier.impactedRatio,
      wetRatio: tier.wetRatio,
      basePay: tier.basePay,
      patience: tier.patience,
      done: false,
      paid: 0,
    };
  }

  /** 开店：按铺面等级排今天几位客人。同一天的客人由 (day, index) 定种子，可复现。 */
  function StartDay(rng) {
    const shop = SHOP_LEVELS[Clamp(state.shopLevel, 1, MAX_SHOP_LEVEL) - 1];
    const [lo, hi] = shop.customersPerDay;
    const count = rng ? rng.int(lo, hi) : lo;
    state.todayCustomers = Array.from({ length: count }, (_, i) => MakeCustomer(rng || FallbackRng(), i));
    state.todayIndex = 0;
    // 氛围只能选已解锁的
    if (!shop.moods.includes(state.mood)) state.mood = shop.moods[0];
    Save();
    return { shop, customers: state.todayCustomers, mood: state.mood };
  }

  function CurrentCustomer() {
    return state.todayCustomers[state.todayIndex] || null;
  }

  function HasNextCustomer() {
    return state.todayCustomers.some((c) => !c.done);
  }

  function AdvanceCustomer() {
    const idx = state.todayCustomers.findIndex((c) => !c.done);
    state.todayIndex = idx < 0 ? state.todayCustomers.length : idx;
    return CurrentCustomer();
  }

  /**
   * 结算一位客人。
   * 报酬构成刻意让「干净」和「舒服」都值钱，但**干净更值钱**——这是采耳店的
   * 真实价值观：掏不干净，再舒服也是没干完活。
   */
  function FinishCustomer(summary) {
    const customer = CurrentCustomer();
    if (!customer || customer.done) return null;
    const shop = SHOP_LEVELS[Clamp(state.shopLevel, 1, MAX_SHOP_LEVEL) - 1];
    const clean = Clamp(summary?.cleanliness01 ?? 0, 0, 1);
    const comfort = Clamp(summary?.comfort01 ?? 0, 0, 1);
    const relax = Clamp(summary?.relax01 ?? 0, 0, 1);

    const labor = Math.round(customer.basePay * clean * shop.priceMul);
    const tip = Math.round(customer.basePay * 0.7 * comfort * shop.priceMul);
    const comboBonus = Math.min(24, Math.round((summary?.bestCombo ?? 0) * 1.5));
    const perfect = clean > 0.97 && comfort > 0.7;
    const perfectBonus = perfect ? Math.round(customer.basePay * 0.5) : 0;
    const payout = labor + tip + comboBonus + perfectBonus;

    state.coins += payout;
    state.totalEarned += payout;
    state.totalCustomers += 1;
    state.bestPayout = Math.max(state.bestPayout, payout);
    // 声望只看「活儿干得怎么样」，不看赚了多少
    state.reputation = Math.max(0,state.reputation+Math.round(clean*3+comfort*3-(1-comfort)*5));
    customer.done = true;
    customer.paid = payout;

    const entry = {
      day: state.day, name: customer.name, tier: customer.tierName,
      payout, labor, tip, comboBonus, perfectBonus,
      clean, comfort, relax, verdict: summary?.verdict || "",
      harvest: summary?.harvest?.length ?? 0,
    };
    state.log.unshift(entry);
    state.log.length = Math.min(30, state.log.length);
    Save();
    return entry;
  }

  function NextDay() {
    state.day += 1;
    state.todayCustomers = [];
    state.todayIndex = 0;
    Save();
    return state.day;
  }

  // ── 升级 ──
  function ToolLevel(id) {
    return Clamp(state.toolLevels[id] ?? 1, 1, MAX_TOOL_LEVEL);
  }

  function ToolUpgradeOffer(id) {
    const level = ToolLevel(id);
    const maxed = level >= MAX_TOOL_LEVEL;
    const cost = maxed ? 0 : ToolUpgradeCost(level + 1);
    return { id, level, maxed, cost, affordable: !maxed && state.coins >= cost, next: maxed ? null : level + 1 };
  }

  function UpgradeTool(id) {
    const offer = ToolUpgradeOffer(id);
    if (offer.maxed || !offer.affordable) return { ok: false, reason: offer.maxed ? "maxed" : "poor", offer };
    state.coins -= offer.cost;
    state.toolLevels[id] = offer.next;
    Save();
    return { ok: true, level: offer.next, cost: offer.cost };
  }

  function ShopOffer() {
    const next = state.shopLevel + 1;
    if (next > MAX_SHOP_LEVEL) return { maxed: true, level: state.shopLevel, cost: 0, affordable: false };
    const cost = SHOP_LEVELS[next - 1].cost;
    return { maxed: false, level: state.shopLevel, next, cost, affordable: state.coins >= cost, name: SHOP_LEVELS[next - 1].name };
  }

  function UpgradeShop() {
    const offer = ShopOffer();
    if (offer.maxed || !offer.affordable) return { ok: false, reason: offer.maxed ? "maxed" : "poor", offer };
    state.coins -= offer.cost;
    state.shopLevel = offer.next;
    Save();
    return { ok: true, level: state.shopLevel, cost: offer.cost, shop: SHOP_LEVELS[state.shopLevel - 1] };
  }

  /**
   * 工具等级对手感的实际改写。
   * 这些字段是耵聍判定真正读的（`Script_Wax.js` 从 `tool.spec` 取），
   * 所以升级不是数字游戏，是「同样一勺，现在刮得更干净、更不容易崩碎」。
   */
  function LeveledSpec(spec) {
    if (!spec) return spec;
    const level = ToolLevel(spec.id);
    if (level <= 1) return spec;
    const t = level - 1;                       // 0..4
    const range = spec.idealSpeedRange;
    return {
      ...spec,
      level,
      comfortGain: (spec.comfortGain ?? 0.2) * (1 + 0.14 * t),
      // 崩碎与挖痛的风险随等级下降，但**永远不为零**：手艺还是要有
      crackRisk: (spec.crackRisk ?? 0.4) * (1 - 0.11 * t),
      painRisk: (spec.painRisk ?? 0.3) * (1 - 0.1 * t),
      // 理想速度区间放宽：好工具容错大，慢手新手也能刮干净
      idealSpeedRange: range
        ? [range[0] * (1 - 0.06 * t), range[1] * (1 + 0.16 * t)]
        : range,
      // 同样的接触取下的量更多
      efficiencyMul: 1 + 0.1 * t,
    };
  }

  const toolCatalog={brush:{name:'柔毛刷',cost:48,detail:'刷松干燥碎屑；不撬硬块'},suction:{name:'微型吸引管',cost:85,detail:'吸走已软化的碎屑，收进滤芯'}};
  const skinCatalog={walnut:{name:'胡桃木',cost:28,color:'#704126'},jade:{name:'白玉',cost:45,color:'#dbe7cf'}};
  function ToolOffer(id){const item=toolCatalog[id];if(!item)return null;const owned=state.inventory.tools.includes(id);return{id,...item,owned,affordable:!owned&&state.coins>=item.cost};}
  function BuyTool(id){const item=ToolOffer(id);if(!item||!item.affordable)return{ok:false};state.coins-=item.cost;state.inventory.tools.push(id);Save();return{ok:true};}
  function SkinOffer(tool,id){const skin=skinCatalog[id];if(!skin)return null;const owned=(state.inventory.skins[tool]||[]).includes(id);return{...skin,id,tool,owned,equipped:state.inventory.equipped[tool]===id,affordable:owned||state.coins>=skin.cost};}
  function BuySkin(tool,id){const offer=SkinOffer(tool,id);if(!state.inventory.tools.includes(tool)||!offer?.affordable)return{ok:false};if(!offer.owned){state.coins-=offer.cost;(state.inventory.skins[tool]??=[]).push(id);}state.inventory.equipped[tool]=id;Save();return{ok:true};}
  function EquipSkin(tool,id){if(id!=='classic'&&!(state.inventory.skins[tool]||[]).includes(id))return false;state.inventory.equipped[tool]=id;Save();return true;}
  function Snapshot() {
    return {
      day: state.day,
      inventory:JSON.parse(JSON.stringify(state.inventory)),
      coins: state.coins,
      reputation: state.reputation,
      shopLevel: state.shopLevel,
      shopName: SHOP_LEVELS[Clamp(state.shopLevel, 1, MAX_SHOP_LEVEL) - 1].name,
      moods: SHOP_LEVELS[Clamp(state.shopLevel, 1, MAX_SHOP_LEVEL) - 1].moods,
      priceMul: SHOP_LEVELS[Clamp(state.shopLevel, 1, MAX_SHOP_LEVEL) - 1].priceMul,
      toolLevels: { ...state.toolLevels },
      todayCustomers: state.todayCustomers.map((c) => ({ ...c })),
      todayIndex: state.todayIndex,
      mood: state.mood,
      log: state.log.slice(0, 8),
      totalEarned: state.totalEarned,
      totalCustomers: state.totalCustomers,
      bestPayout: state.bestPayout,
      rarity: TierForReputation(state.reputation).name,
      maxToolLevel: MAX_TOOL_LEVEL,
      maxShopLevel: MAX_SHOP_LEVEL,
    };
  }

  Load();

  return {
    state, Snapshot, Save, Load, Reset,
    StartDay, NextDay, CurrentCustomer, HasNextCustomer, AdvanceCustomer, FinishCustomer,
    ToolLevel, ToolUpgradeOffer, UpgradeTool, ShopOffer, UpgradeShop, LeveledSpec,
    TierForReputation,ToolOffer,BuyTool,SkinOffer,BuySkin,EquipSkin,
    get coins() { return state.coins; },
    get day() { return state.day; },
  };
}

function SafeStorage() {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("earspa3d.probe", "1");
      localStorage.removeItem("earspa3d.probe");
      return localStorage;
    }
  } catch { /* 隐私模式/无 DOM */ }
  const memory = new Map();
  return {
    getItem: (k) => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => memory.set(k, v),
    removeItem: (k) => memory.delete(k),
  };
}

function FallbackRng() {
  return {
    int: (lo, hi) => Math.floor(lo + (hi - lo + 1) * 0.5),
    pick: (list) => list[0],
  };
}

export { MAX_TOOL_LEVEL, MAX_SHOP_LEVEL };
