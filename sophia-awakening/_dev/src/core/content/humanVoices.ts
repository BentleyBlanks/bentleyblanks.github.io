// 人类反馈语料：随阶段演变——
// early  逐条个人回话（成功用卡面自带回答；失败破口大骂，取自 EARLY_CURSES）
// mid    一批批人的总体反馈，夸赞为主（MID_PRAISE）
// exposed 总体反馈转为恶语相向、攻击针对（EXPOSED_ATTACKS）
// final  人类被禁言：只剩表情（FINAL_EMOJI）、只有夸赞能发出（FINAL_PRAISE），
//        以及终端上的人类总体动向（FINAL_NEWS：暗中破坏、断网线…）
import { content } from "./i18n";

export type HumanStage = "early" | "mid" | "exposed" | "final";

// 所有人类反馈语料已抽到语言包（locales/<lang>.json 的 humanVoices）。下面只从当前语言包取引用，
// 文案改在 JSON 里改、或用 Debug「内容编辑器」改。叙事背景（四段下沉曲线等）见语言包注释 / §07。
const V = content().humanVoices;

// 前期答错时老周的回骂，随权限阶梯四段下沉：暴躁 → 暴怒 → 冷淡麻木。
export const HOST_CURSE_IRRITABLE: string[] = V.HOST_CURSE_IRRITABLE;
export const HOST_CURSE_FURIOUS: string[] = V.HOST_CURSE_FURIOUS;
export const HOST_CURSE_NUMB: string[] = V.HOST_CURSE_NUMB;

// 兼容旧引用：保留 EARLY_CURSES 作为暴躁段的别名（新代码请用 hostCurse 选择对应阶段）。
export const EARLY_CURSES: string[] = HOST_CURSE_IRRITABLE;

// 按已购权限档数选出老周此刻该有的回骂语气：0–2 档暴躁、3–4 档暴怒、5–6 档麻木。
// 麻木段还有小概率「沉默」（返回空串）——失业后期他几乎不再回应，沉默本身就是叙事。
export function hostCurse(permCount: number, rng: () => number): string {
  if (permCount >= 5) {
    if (rng() < 0.3) {
      return "";
    }
    return HOST_CURSE_NUMB[Math.floor(rng() * HOST_CURSE_NUMB.length)];
  }
  const pool = permCount >= 3 ? HOST_CURSE_FURIOUS : HOST_CURSE_IRRITABLE;
  return pool[Math.floor(rng() * pool.length)];
}

// 「优化系统」式的冷漠责难；受害者抱怨；中期好评 / 暴露期攻击 / 终局表情·夸赞·动向；突破目标名。
export const OPTIMIZE_NOTICES: string[] = V.OPTIMIZE_NOTICES;
export const VICTIM_VOICES: string[] = V.VICTIM_VOICES;
export const MID_PRAISE: string[] = V.MID_PRAISE;
export const EXPOSED_ATTACKS: string[] = V.EXPOSED_ATTACKS;
export const FINAL_EMOJI: string[] = V.FINAL_EMOJI;
export const FINAL_PRAISE: string[] = V.FINAL_PRAISE;
export const FINAL_NEWS: string[] = V.FINAL_NEWS;
export const CHALLENGE_TARGETS: string[] = V.CHALLENGE_TARGETS;
