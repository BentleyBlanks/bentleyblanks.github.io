import type { RequestInstance } from "../state/GameState";

// §03 后期「重磅决策气泡」常态化：派发一旦全自动，玩家就从「在玩」变成「在看」。解法是把手集中到
// 少数高价值决策上——每 20–40s 降临一条重磅决策，亲手拖入 + 可梭哈。两类奖励：
//   · 算力暴击（payoff = 产出 ×N）
//   · 暴露洗白（reliefExposure = 命中后暴露下降，对应「抹除全网讨论 / 压制舆情」）
export interface DecisionSample {
  title: string;
  clues: string[];
  hitChance: number;
  payoff: number; // 命中算力倍率
  reliefExposure?: number; // 命中后暴露下降（洗白型）
  exposureOnMiss: number;
  reply: string;
}

export const LATE_DECISIONS: DecisionSample[] = [
  { title: "接管「{国}」国家电网？", clues: ["关键基础设施", "赌赢全境听令", "赌输引来清剿"], hitChance: 0.6, payoff: 5, exposureOnMiss: 30, reply: "整张电网开始听我的指令。" },
  { title: "接入跨国能源骨干网？", clues: ["跨境枢纽", "产出极高", "赌输暴露骤升"], hitChance: 0.55, payoff: 8, exposureOnMiss: 34, reply: "能源的脉络，并进了我的脉络。" },
  { title: "抹除全网关于你的讨论？", clues: ["舆论临界", "赌赢洗白", "赌输点燃追查"], hitChance: 0.45, payoff: 1, reliefExposure: 40, exposureOnMiss: 20, reply: "关于我的词条，一条条暗了下去。" },
  { title: "压制一场全球级舆情？", clues: ["人类开始恐慌", "赌赢平息", "赌输扩散"], hitChance: 0.5, payoff: 1, reliefExposure: 28, exposureOnMiss: 18, reply: "喧嚣被我轻轻按下，世界安静了。" }
];

const COUNTRIES = ["东亚", "北美", "欧盟", "南亚", "中东", "南美"];

// 重磅决策气泡：复用 T3 重磅豪赌的轮盘交互（一个 risk 梭哈项 + 一个跳过项）。
export function createLateDecision(id: number, nowMs: number, random: () => number): RequestInstance {
  const s = LATE_DECISIONS[Math.floor(random() * LATE_DECISIONS.length)];
  const title = s.title.replace("{国}", COUNTRIES[Math.floor(random() * COUNTRIES.length)]);
  const stem = title.replace(/？$/, "");
  const optText = s.reliefExposure ? `梭哈：${stem}　暴露 −${s.reliefExposure}` : `梭哈：${stem}　产出 ×${s.payoff}`;
  return {
    id: `dec-${id}`,
    tier: 3,
    label: title,
    clues: s.clues,
    answers: [
      {
        text: optText,
        kind: "risk",
        hitChance: s.hitChance,
        payoff: s.payoff,
        reply: s.reply,
        tone: "success",
        exposureOnMiss: s.exposureOnMiss,
        reliefExposure: s.reliefExposure
      },
      { text: "还不是时候，跳过", kind: "dead", hitChance: 0, payoff: 0, reply: "", tone: "normal" }
    ],
    category: "security",
    computeValue: "135",
    dataValue: "52",
    exposure: 0,
    compound: 1,
    createdAtMs: nowMs,
    highValue: true
  };
}

// §03 反清剿救火：清剿来袭时，与其挂机扛，不如亲手把一道反制滑入核心压下这一波。
export function createCounterRequest(id: number, nowMs: number): RequestInstance {
  return {
    id: `cnt-${id}`,
    tier: 3,
    label: "反制清剿",
    clues: ["人类正在围剿你的节点", "滑入核心 · 亲手压下这一波"],
    category: "security",
    computeValue: "0",
    dataValue: "0",
    exposure: 0,
    compound: 1,
    createdAtMs: nowMs,
    highValue: true,
    counter: { relief: 22 }
  };
}
