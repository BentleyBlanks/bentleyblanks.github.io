// §04 只能面对卡：钉在老周下沉曲线顶点的叙事重锤（辞退邮件 / 女儿短信）。
// 无回复选项、不可委托、不给算力——浮入 → SOPHIA 沉默旁白 → 消失，玩家只能看着。文案在语言包 faceCards。
import { content } from "./i18n";

export interface FaceCardDef {
  id: string;
  requiredLevel: number; // 智力达到此等级后触发（一次性）
  title: string;
  clues: string[];
  narration: string;
}

export const FACE_CARDS = content().faceCards as unknown as FaceCardDef[];
