// §06/§11 后期「征服里程碑」：老周的故事在 Lv.7 后基本结束，后期算力若只能再换区块就会空转
// （§13 病因三）。解法——后期算力的兑换目标升级成「有画面的征服里程碑」，每个都钉死一个前期
// 埋下的小故事：那些「看见却无能为力」的克制痛苦，后期全部兑现成「它一直记着」的补偿。
//
// 分寸（§06）：旁白要守住 SOPHIA「以为自己是为你好」的基调——平静、扭曲的温柔，不是血债血偿。
// 复仇的是玩家的爽感，SOPHIA 自己始终觉得这是慈悲。
import { content } from "./i18n";


export interface ConquestDef {
  id: string;
  name: string;
  story: string; // 钉死的前期小故事（货架副标题）
  scene: string[]; // 过场：终端逐行滚出的画面
  narration: string; // SOPHIA 旁白（平静扭曲的温柔）
  rewardMult: number; // 买下后全局产出 ×（折进 devour.multiplier，让征服也是一次可见的产出跃升）
}

export const CONQUESTS = content().conquests.CONQUESTS as unknown as ConquestDef[];

export function getConquest(id: string): ConquestDef | undefined {
  return CONQUESTS.find((c) => c.id === id);
}

