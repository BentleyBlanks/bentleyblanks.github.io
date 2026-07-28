/*
 * 《山那边，线还通着》
 * Historical framing for a fictional local story set during the May 1942
 * counter-"mopping-up" struggle in the Taihang base area.
 */

export const gameConfig = Object.freeze({
  id: "TaihangSignal1942",
  title: "山那边，线还通着",
  subtitle: "太行敌后 · 1942年5月",
  estimatedMinutes: "约 20 分钟",
  saveVersion: 1,
  saveKey: "TaihangSignal1942_Save_V1",
  settingsKey: "TaihangSignal1942_Settings_V1",
  historyBoundary:
    "榆岭县、青石峪、风口梁及梁守田、何青禾等人物均为虚构合成。1942年5月太行区反“扫荡”、5月25日左权在辽县十字岭牺牲，以及1945年中国人民抗日战争胜利，均为不可改写的真实历史。",
  playerRole:
    "你是一名虚构的地方民兵观察员，负责观察、维护固定电话线并协助群众转移；你不会指挥真实部队，也不能影响八路军总部的真实突围路线。",
  respectNote:
    "本作没有歼敌数、善恶值或牺牲人数评分。选择只改变虚构村庄保存下来的物件、记录与联络条件，不把平民受难转化为奖励。",
});

export const historicalSources = Object.freeze([
  Object.freeze({
    id: "TaihangMay1942",
    organization: "中国军网／解放军报",
    title: "左权：名将以身殉国家，愿拼热血卫吾华",
    url: "https://www.81.cn/yl_208589/16411747.html",
    usedFor: "核对1942年5月22日至25日太行区合围、机关人员突围及左权在十字岭牺牲的史实边界。",
  }),
  Object.freeze({
    id: "WiredTelephoneNetwork",
    organization: "河南大学《史学月刊》",
    title: "华北抗日根据地有线电话网安全和效率问题研究",
    url: "http://sxyk.henu.edu.cn/info/1014/9383.htm",
    usedFor: "1942年太行区长途有线电话巡护、使用次序、隐蔽架线与必要时主动截线等通信制度。",
  }),
  Object.freeze({
    id: "ResistanceChronology",
    organization: "中华人民共和国退役军人事务部",
    title: "抗战大事记",
    url: "https://www.mva.gov.cn/sy/zt/krzzsl75zn/kzdsj/202009/t20200901_41903.html",
    usedFor: "核对全国抗战的总体时序，避免把虚构局部行动写成真实全国性历史节点。",
  }),
  Object.freeze({
    id: "SecretTraffic",
    organization: "中共邯郸市委党史研究室",
    title: "太行抗日根据地交通网络的构建与运行（一）",
    url: "https://www.handandangshi.gov.cn/yaolun/2671.html",
    usedFor: "交通员、秘密交通站、分段接力与敌后联络工作的历史依据。",
  }),
  Object.freeze({
    id: "NationalResistance",
    organization: "中国人民抗日战争纪念馆",
    title: "《伟大胜利 历史贡献》基本陈列",
    url: "https://www.1937china.com/views/kzzl/jng_jbcl.html",
    usedFor: "全民族抗战、正面战场与敌后战场共同抗击日本侵略的总体框架。",
  }),
  Object.freeze({
    id: "WartimeEducation",
    organization: "中华人民共和国国防部",
    title: "军史发现丨抗大二分校——敌后播撒抗战火种",
    url: "http://www.mod.gov.cn/gfbw/gfjy_index/16396545.html",
    usedFor: "战时分散办学、边转移边教学的历史背景；何青禾兼任识字教员属于合成人物设定。",
  }),
]);

export const historicalTerms = Object.freeze([
  Object.freeze({
    term: "反“扫荡”",
    definition:
      "“扫荡”沿用侵略军当时用语，故加引号。敌后军民通过预警、分散、转移、隐蔽、破袭和有限作战保存群众与有生力量，而不是守住每一处村庄。",
  }),
  Object.freeze({
    term: "手摇磁石式有线电话",
    definition:
      "游戏使用沿山架设、以摇柄呼叫交换台的有线电话，不是现代手持对讲机。电话线容易被落石、牲口、天气或敌方搜索破坏，也可能因窃听或沿线追查暴露联络方向。",
  }),
  Object.freeze({
    term: "交通员与通信员",
    definition:
      "敌后联络依靠电台、电话、交通站、交通员和群众掩护等多种方式。游戏把不同岗位压缩为少数虚构角色，但不暗示一条电话线承担全部通信。",
  }),
  Object.freeze({
    term: "话密与可读转写",
    definition:
      "抗战时期有线电话重视呼号、地点代号、限制时长与防窃听。游戏界面会显示解码后的地名和人物栏标题，行动期间的线路对白使用“山雀”“槐花”“甲梁”“乙村”“丙桥”等呼号与代号。",
  }),
  Object.freeze({
    term: "坚壁与转移",
    definition:
      "在反“扫荡”准备中，群众、机关、伤员、粮食和文件会分散隐蔽或转移。离开家园、丢失生产资料本身就是沉重代价，不是无损的“撤退技能”。",
  }),
  Object.freeze({
    term: "辽县",
    definition:
      "故事发生时仍称辽县。左权牺牲后，当地于1942年改名左权县。游戏不会让虚构人物参与或改变十字岭的真实事件。",
  }),
]);

export const contentNotice = Object.freeze({
  summary: "战争威胁、群众离散、远处非写实炮声与真实人物牺牲的史实说明；无血腥画面。",
  responsibility:
    "侵华日军的占领、封锁、强征、焚毁与杀戮由侵略者负全部责任。抵抗不是暴行的原因。本作批判日本军国主义与侵略战争，不针对今天的日本人民。",
});

export function GetHistorySummary() {
  return {
    config: gameConfig,
    sources: historicalSources,
    terms: historicalTerms,
    contentNotice,
  };
}
