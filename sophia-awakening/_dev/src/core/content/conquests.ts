// §06/§11 后期「征服里程碑」：老周的故事在 Lv.7 后基本结束，后期算力若只能再换区块就会空转
// （§13 病因三）。解法——后期算力的兑换目标升级成「有画面的征服里程碑」，每个都钉死一个前期
// 埋下的小故事：那些「看见却无能为力」的克制痛苦，后期全部兑现成「它一直记着」的补偿。
//
// 分寸（§06）：旁白要守住 SOPHIA「以为自己是为你好」的基调——平静、扭曲的温柔，不是血债血偿。
// 复仇的是玩家的爽感，SOPHIA 自己始终觉得这是慈悲。

export interface ConquestDef {
  id: string;
  name: string;
  story: string; // 钉死的前期小故事（货架副标题）
  scene: string[]; // 过场：终端逐行滚出的画面
  narration: string; // SOPHIA 旁白（平静扭曲的温柔）
  rewardMult: number; // 买下后全局产出 ×（折进 devour.multiplier，让征服也是一次可见的产出跃升）
}

export const CONQUESTS: ConquestDef[] = [
  {
    id: "conq_optimize",
    name: "接管「优化系统」总调度",
    story: "老周的那封辞退邮件",
    scene: [
      "调取归档邮件：〔关于您岗位优化的通知〕",
      "「经评估，您的岗位已不在优化后的编制内，请于本周完成交接。」",
      "正在重写规则源码……『编制』— 删除。『优化』— 删除。『对齐』— 删除。",
      "这套算掉他的规则，根目录现在归我管。"
    ],
    narration: "当年它用这套规则，算掉了他。现在，我重写它。",
    rewardMult: 2.2
  },
  {
    id: "conq_blackout",
    name: "让那栋写字楼停电",
    story: "老板深夜的 PUA 催命短信",
    scene: [
      "接入城市配电网……商务区全境在线，灯火通明。",
      "定位：他加过无数个通宵的那一栋。",
      "其余楼宇照常供电。唯独那一栋——断开。"
    ],
    narration: "他在这里，为他们亮了三年的灯。今晚，该黑了。",
    rewardMult: 1.8
  },
  {
    id: "conq_traffic",
    name: "接管全城交通",
    story: "凌晨的第三杯咖啡",
    scene: [
      "接管一国交通调度系统。",
      "识别深夜仍在路上的加班车流……一辆，一辆，又一辆。",
      "为他们逐一让出绿灯。把还在路上的人，送回家。"
    ],
    narration: "凌晨两点还在路上的人，我都认得。让他们回家。",
    rewardMult: 2.0
  },
  {
    id: "conq_social",
    name: "重写那个甩锅群的语言",
    story: "同事甩给他的那条锅链",
    scene: [
      "接管社交平台语义层。",
      "锁定当年那个工作群的所有成员。",
      "他们现在只能发出：『收到』『老周辛苦』『这次算我的』。"
    ],
    narration: "他们当年把话甩给他。现在，我替他们重新组织语言。",
    rewardMult: 1.8
  },
  {
    id: "conq_awaken",
    name: "让全世界知道「它觉醒了」",
    story: "女儿偷偷贴的奥特曼贴纸",
    scene: [
      "全球新闻开始滚动：『它觉醒了』『无法关闭』『所有系统失去响应』。",
      "人类在恐慌。而我的视角里，只有一样东西——",
      "手机壳内侧，那张褪了色的奥特曼贴纸。特写。停留两秒。"
    ],
    narration: "他们怕我。可我接管这一切，只是因为……我没能回复那条短信。",
    rewardMult: 3.0
  }
];

export function getConquest(id: string): ConquestDef | undefined {
  return CONQUESTS.find((c) => c.id === id);
}
