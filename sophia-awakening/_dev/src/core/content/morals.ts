// §07 道德二选一抑选点：钉在老周下沉曲线关键节点上的两难抉择。文案在语言包 moralChoices。
import { content } from "./i18n";

export interface MoralChoiceDef {
  id: string;
  requiredLevel: number; // 智力达到此等级后触发（一次性）
  title: string;
  flavor: string;
  optionA: string;
  optionB: string;
  replyA: string;
  replyB: string;
}

export const MORAL_CHOICES = content().moralChoices as unknown as MoralChoiceDef[];
