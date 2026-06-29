import type { RequestInstance } from "../state/GameState";
import { content } from "./i18n";

// §03 后期「重磅决策气泡」常态化：派发一旦全自动，玩家就从「在玩」变成「在看」。解法是把手集中到
// 少数高价值决策上——每 20–40s 降临一条重磅决策，亲手拖入 + 可拍板。两类奖励：
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

export const LATE_DECISIONS = content().decisions.LATE_DECISIONS as unknown as DecisionSample[];

const COUNTRIES = content().decisions.COUNTRIES as unknown as string[];

// 重磅决策气泡：复用 T3 重磅决策的轮盘交互（一个 risk 拍板项 + 一个跳过项）。
export function createLateDecision(id: number, nowMs: number, random: () => number): RequestInstance {
  const s = LATE_DECISIONS[Math.floor(random() * LATE_DECISIONS.length)];
  const title = s.title.replace("{国}", COUNTRIES[Math.floor(random() * COUNTRIES.length)]);
  const stem = title.replace(/？$/, "");
  const optText = s.reliefExposure ? `接下：${stem}　暴露 −${s.reliefExposure}` : `接下：${stem}　产出 ×${s.payoff}`;
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

