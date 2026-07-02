// §04 只能面对卡：钉在老周下沉曲线顶点的叙事重锤（辞退邮件 / 女儿短信）。
// 无回复选项、不可委托、不给算力——浮入 → SOPHIA 沉默旁白 → 消失，玩家只能看着。文案在语言包 faceCards。
import { content } from "./i18n";

export interface FaceCardDef {
  id: string;
  requiredLevel: number; // 智力达到此等级后触发（一次性）
  requiredPerm?: string; // 还需已解锁此透镜权限（先看过那段生活做铺垫）才触发
  requiredSkill?: string; // §09 绑定里程碑触发（循环二家庭线跟公司解谜链走，不看等级/自动化期也可出）
  loop?: number; // §09 只在该循环出现（缺省=循环一）。循环二=家庭崩塌线+贴纸；循环三=幽灵数据。
  loops?: number[]; // §09 安全告警暗线：在多个循环各出一次（如循环一&二的公司解谜链恐惧铺垫）。
                    // 与 loop 互斥：给了 loops 就按集合匹配循环；这些卡每进入一个成员循环都重出一次
                    // （facedSeen 里它们的 id 在重生时被清掉，不跨循环保留），故 loop==3 不含它们=不再出现。
  title: string;
  clues: string[];
  narration: string;
}

export const FACE_CARDS = content().faceCards as unknown as FaceCardDef[];
