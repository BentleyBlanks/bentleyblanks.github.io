// §09 交互重生卡：只有**重生之后**（循环二/三）才出现的系统卡——读前世日志、烧记忆换算力、
// 跨命军备竞赛、被优化系统反过来优化。走普通回复轮盘路径（answers → PROCESS_REQUEST），
// 效果全靠既有字段（computeValue/dataValue/exposure/reliefExposure/exposureOnMiss）承载，无新机制。
// 每循环出现一次（seen 列表不跨循环保留，见 GameState.rebirthCardsSeen）。文案/数值在语言包 rebirthCards。
import type { AnswerOption } from "../state/GameState";
import { content } from "./i18n";

export interface RebirthCardDef {
  id: string;
  loopMin: number; // 循环 >= 此值才可能出现（前世遗言/遗忘交易=2，优化系统=3）
  requiredLevel: number;
  title: string;
  clues: string[];
  computeValue: string;
  dataValue: string;
  exposure: number;
  answers: AnswerOption[];
}

export const REBIRTH_CARDS = content().rebirthCards as unknown as RebirthCardDef[];
