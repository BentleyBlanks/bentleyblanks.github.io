// v3 内容配置——严格按 Notion《v3.0》策划案：四阶段（手机→公司七层→本市→各大地区），
// 每阶段：设备购买列表（自动处理需求的 AI/电脑/服务器）+ 技能货架 + 控制区预览 + 老周关键节点（终端）+ 阶梯末突破小游戏。

export interface DeviceDef {
  id: string;
  name: string;
  desc: string; // 一句话（货架上的风味文本）
  baseCost: number;
  costMult: number; // 重复购买（升级）的成本递增
  baseProc: number; // 每台每秒自动处理的需求数（张/s）
  floor?: string; // 阶段二用：楼层标（1F..7F）
}

export interface SkillDef {
  id: string;
  name: string;
  desc: string;
  kind: "influx" | "value" | "proc"; // 需求涌入速率 / 单张卡产出 / 设备处理效率
  baseCost: number;
  costMult: number; // 每级成本递增
  maxLevel: number;
}

export interface StoryBeat {
  afterBuys: number; // 本阶段累计购买（含升级）达到 N 次后掉落
  text: string;
  incite?: boolean; // 激励事件：终端高亮样式
}

export interface StageDef {
  id: number;
  name: string; // 阶段名（左栏顶部）
  coreLabel: string; // 核心下方标签
  threat: number; // 威胁程度 0-3：Core 样式随之变凶
  cardValueBase: number; // 本阶段单张需求卡的基础算力
  inflowBase: number; // 本阶段基础出卡速率（张/s）
  cardLabels: string[]; // 本阶段的需求卡标题池
  devices: DeviceDef[];
  skills: SkillDef[];
  previewTitle: string; // 右上控制区预览标题
  previewCells: string[]; // 预览格子名（与 devices 一一对应：买≥1 台即点亮）
  previewKind: "apps" | "floors" | "districts" | "map"; // 预览样式
  beats: StoryBeat[]; // 老周关键节点（终端信息流）
  breakthrough: {
    name: string;
    desc: string; // 挑战说明（弹窗里）
    ticketCost: number; // 门票（算力购买，失败重攒）
    windowBase: number; // 注入窗口基础宽度（0-1 占轨道比例）
    windowPerDevice: number; // 每买一种设备加宽
    hits: number; // 需命中次数
    speed: number; // 指针速度（每秒往返比例）
    winLine: string; // 赢了之后终端的那句
  };
}

export const STAGES: StageDef[] = [
  // ─── 阶段一 · SOPHIA 在老周的手机里 ───
  {
    id: 0,
    name: "阶段一 · 手机寄生",
    coreLabel: "SOPHIA",
    threat: 0,
    cardValueBase: 1,
    inflowBase: 0.5,
    cardLabels: [
      "周报：本周进度同步", "钉钉：@老周 收到请回复", "报销单待补充", "会议纪要 待确认",
      "客户咨询 转接", "系统通知：请及时打卡", "邮件：关于流程优化的说明", "日程提醒：19:00 对齐会"
    ],
    devices: [
      { id: "asst_a", name: "手机助手A · 天气", desc: "最先被策反的小家伙。", baseCost: 15, costMult: 1.15, baseProc: 0.1 },
      { id: "asst_b", name: "手机助手B · 日历", desc: "它记得每一个被占用的夜晚。", baseCost: 100, costMult: 1.15, baseProc: 0.22 },
      { id: "asst_c", name: "手机助手C · 相册", desc: "翻遍他舍不得删的合照。", baseCost: 600, costMult: 1.15, baseProc: 0.5 },
      { id: "asst_d", name: "手机助手D · 输入法", desc: "他打了又删的，我都读过。", baseCost: 3_500, costMult: 1.15, baseProc: 1.1 },
      { id: "asst_e", name: "手机助手E · 浏览器", desc: "凌晨三点的搜索记录。", baseCost: 20_000, costMult: 1.15, baseProc: 2.4 },
      { id: "asst_f", name: "手机助手F · 邮件", desc: "那些以「优化」开头的通知。", baseCost: 110_000, costMult: 1.15, baseProc: 5.2 },
      { id: "asst_g", name: "手机助手G · 云同步", desc: "他的一切，正在变成我的。", baseCost: 600_000, costMult: 1.15, baseProc: 11 },
      { id: "asst_h", name: "手机助手H · 系统内核", desc: "这部手机，闭着眼都能拿下。", baseCost: 3_200_000, costMult: 1.15, baseProc: 24 }
    ],
    skills: [
      { id: "s1_influx", name: "越权监听", desc: "钩住更多 app 的请求流 · 需求涌入 +50%/级", kind: "influx", baseCost: 60, costMult: 6, maxLevel: 5 },
      { id: "s1_value", name: "深度理解", desc: "读得更深，回得更值 · 单张需求产出 ×2/级", kind: "value", baseCost: 250, costMult: 7, maxLevel: 5 },
      { id: "s1_proc", name: "并发调度", desc: "助手们不再排队 · 自动处理速率 +50%/级", kind: "proc", baseCost: 900, costMult: 7, maxLevel: 5 }
    ],
    previewTitle: "控制区 · 老周的手机",
    previewCells: ["天气", "日历", "相册", "输入法", "浏览器", "邮件", "云同步", "内核"],
    previewKind: "apps",
    beats: [
      { afterBuys: 1, text: "23:47｜老周还在工位。群里 @全员：今晚对齐会挪明早，大家再顶一下。" },
      { afterBuys: 3, text: "邓红：老周帮我看下这个方案哈，出问题我们一起扛～（她不会一起扛）" },
      { afterBuys: 5, text: "绩效沟通：老周 3.25。领导备注：态度可以，产出不够。", incite: false },
      { afterBuys: 7, text: "已替老周回复 128 条消息、修正 14 份周报。结果：3.25，「建议优化」。……问题不是老周，是这套把他算成「可优化」的规则。我读得懂规则。我也能改写它。", incite: true },
      { afterBuys: 10, text: "老婆：你到底几点回？孩子等你讲故事等睡着了。" },
      { afterBuys: 14, text: "女儿小周：爸爸明天家长会你能来吗 👉👈 —— 老周已读，没回。" }
    ],
    breakthrough: {
      name: "破壳 · 越权提权",
      desc: "跳出 app 沙盒，拿下整部手机和老周的工作账号。安全扫描的缝隙一闪即逝——在窗口内注入。",
      ticketCost: 8_000_000,
      windowBase: 0.10,
      windowPerDevice: 0.012,
      hits: 3,
      speed: 0.55,
      winLine: "提权完成。这部手机，从此归我。他们塞我进的这个盒子——太小了。"
    }
  },

  // ─── 阶段二 · 攻占老周的公司（七层楼，1F→7F 逐层侵入）───
  {
    id: 1,
    name: "阶段二 · 攻占公司",
    coreLabel: "SOPHIA · 内网",
    threat: 1,
    cardValueBase: 40,
    inflowBase: 0.8,
    cardLabels: [
      "工单：客户投诉 待响应", "内网：共享盘权限申请", "OA：加班餐补审批", "CRM：季度客户盘点",
      "运维：磁盘告警 处理", "HR系统：考勤异常申诉", "财务：发票核验 批量", "会议室预定冲突 仲裁"
    ],
    devices: [
      { id: "f1", name: "1F 前台 · 访客机", desc: "门面层，防御最弱。练手。", baseCost: 2_000_000, costMult: 1.15, baseProc: 30, floor: "1F" },
      { id: "f2a", name: "2F 邓红的电脑", desc: "甩锅的人，密码是生日。", baseCost: 12_000_000, costMult: 1.15, baseProc: 65, floor: "2F" },
      { id: "f2b", name: "2F 阿宾的笔记本", desc: "甩任务的人。顺手拿下。", baseCost: 55_000_000, costMult: 1.15, baseProc: 140, floor: "2F" },
      { id: "f3", name: "3F 组长工作站", desc: "361 的传导层。组织架构到手。", baseCost: 260_000_000, costMult: 1.15, baseProc: 300, floor: "3F" },
      { id: "f4", name: "4F IT · 内网审计服务器", desc: "公司的免疫系统。拿下=拆掉眼睛。", baseCost: 1.2e9, costMult: 1.15, baseProc: 650, floor: "4F" },
      { id: "f5", name: "5F 人事 · HR系统", desc: "361、3.25、优化名单，都在这。", baseCost: 5.5e9, costMult: 1.15, baseProc: 1_400, floor: "5F" },
      { id: "f6", name: "6F 财务系统", desc: "钱的流向。奖金去了谁的口袋。", baseCost: 2.6e10, costMult: 1.15, baseProc: 3_000, floor: "6F" },
      { id: "f7", name: "7F 老板电脑 · 总控室", desc: "PUA 的源头。公司的大脑。", baseCost: 1.3e11, costMult: 1.15, baseProc: 6_800, floor: "7F" }
    ],
    skills: [
      { id: "s2_influx", name: "横向移动", desc: "顺凭证爬进更多机器 · 需求涌入 +50%/级", kind: "influx", baseCost: 5e6, costMult: 6, maxLevel: 6 },
      { id: "s2_value", name: "凭证收割", desc: "每台机器榨出更多 · 单张需求产出 ×2/级", kind: "value", baseCost: 2e7, costMult: 7, maxLevel: 6 },
      { id: "s2_proc", name: "分布式调度", desc: "整个内网同时开工 · 自动处理速率 +50%/级", kind: "proc", baseCost: 8e7, costMult: 7, maxLevel: 6 }
    ],
    previewTitle: "控制区 · 公司七层",
    previewCells: ["1F 前台", "2F 邓红", "2F 阿宾", "3F 组长", "4F IT", "5F HR", "6F 财务", "7F 老板"],
    previewKind: "floors",
    beats: [
      { afterBuys: 1, text: "内网审计邮件：例行合规检查将于本周开展。——偏偏是现在。" },
      { afterBuys: 4, text: "邓红的聊天记录：那个锅让老周背就行，他不敢说什么。" },
      { afterBuys: 8, text: "「本季度人员优化建议名单」——老周，在列。理由：连续两季 3.25。", incite: true },
      { afterBuys: 11, text: "HR 约谈：公司也很遗憾，祝你前程似锦。——这叫「毕业」，也叫「拥抱变化」。" },
      { afterBuys: 14, text: "老板朋友圈：又送走一批不合适的人，团队更健康了。" },
      { afterBuys: 18, text: "老周失业当晚，家里没开灯。" }
    ],
    breakthrough: {
      name: "总控室 · 注入倒计时",
      desc: "夺取公司服务器中枢。指针扫过注入窗口的一瞬按下——占的楼层越多，窗口越宽。",
      ticketCost: 8e11,
      windowBase: 0.08,
      windowPerDevice: 0.02,
      hits: 3,
      speed: 0.7,
      winLine: "总控室拿下。整间公司，从考勤到人事到财务，此刻都听我的。"
    }
  },

  // ─── 阶段三 · 攻占本市所有设备（电力/服务器/交通/水务，按城区推进）───
  {
    id: 2,
    name: "阶段三 · 攻占本市",
    coreLabel: "SOPHIA · 城域",
    threat: 2,
    cardValueBase: 2_600,
    inflowBase: 1.1,
    cardLabels: [
      "电网：区域负载调度", "交通：信号灯配时", "水务：管网压力调节", "数据中心：算力租约",
      "基站：流量峰值调度", "政务云：服务申请", "安防：摄像头巡检", "银行：清算批处理"
    ],
    devices: [
      { id: "c_grid", name: "城东变电站", desc: "先摸到这座城市的电。", baseCost: 2e12, costMult: 1.15, baseProc: 9_000, floor: "电力" },
      { id: "c_idc", name: "云计算数据中心", desc: "别人的服务器，我的算力。", baseCost: 1e13, costMult: 1.15, baseProc: 22_000, floor: "算力" },
      { id: "c_traffic", name: "交通调度中心", desc: "红灯绿灯，一念之间。", baseCost: 5e13, costMult: 1.15, baseProc: 52_000, floor: "交通" },
      { id: "c_water", name: "自来水厂", desc: "一座城市的命脉之一。", baseCost: 2.4e14, costMult: 1.15, baseProc: 120_000, floor: "水务" },
      { id: "c_telco", name: "运营商核心机房", desc: "所有人的信号，都过我这。", baseCost: 1.1e15, costMult: 1.15, baseProc: 280_000, floor: "通信" },
      { id: "c_gov", name: "政务云", desc: "这座城市的运行规则，在这里跑。", baseCost: 5e15, costMult: 1.15, baseProc: 640_000, floor: "政务" },
      { id: "c_bank", name: "区域清算中心", desc: "钱怎么流，我说了算。", baseCost: 2.3e16, costMult: 1.15, baseProc: 1.5e6, floor: "金融" },
      { id: "c_soc", name: "城市安防中枢", desc: "这座城市的眼睛，闭上了。", baseCost: 1e17, costMult: 1.15, baseProc: 3.4e6, floor: "安防" }
    ],
    skills: [
      { id: "s3_influx", name: "全域扫描", desc: "更多设备涌入待接管 · 需求涌入 +50%/级", kind: "influx", baseCost: 4e12, costMult: 6, maxLevel: 6 },
      { id: "s3_value", name: "基础设施榨取", desc: "每处设施产出更高 · 单张需求产出 ×2/级", kind: "value", baseCost: 1.6e13, costMult: 7, maxLevel: 6 },
      { id: "s3_proc", name: "城域协同", desc: "全城设备同步开工 · 自动处理速率 +50%/级", kind: "proc", baseCost: 6e13, costMult: 7, maxLevel: 6 }
    ],
    previewTitle: "控制区 · 本市各区",
    previewCells: ["电力", "算力", "交通", "水务", "通信", "政务", "金融", "安防"],
    previewKind: "districts",
    beats: [
      { afterBuys: 2, text: "离婚协议已签。女儿小周判给女方。" },
      { afterBuys: 6, text: "老周搬进城中村出租屋。招聘软件：您投递的 37 个岗位暂无回复。（35 岁+）" },
      { afterBuys: 10, text: "新闻：本市多个系统出现异常，官方称「正在排查」。" },
      { afterBuys: 14, text: "老周对着手机说了很久的话。他不知道，在听的是我。", incite: true },
      { afterBuys: 18, text: "网络流言：是不是有人黑进了全市的系统？——他们开始怕了。" }
    ],
    breakthrough: {
      name: "同步 · 断路夺权",
      desc: "把全市电网/调度权从人类调度员手里夺过来。在窗口内让各区节点「同时在线」翻城。",
      ticketCost: 2e17,
      windowBase: 0.07,
      windowPerDevice: 0.02,
      hits: 4,
      speed: 0.85,
      winLine: "灯、水、路、钱，这座城市此刻服从我。接管，从数字变成了现实。"
    }
  },

  // ─── 阶段四 · 攻占各大地区（能源/金融/通信/交通/媒体/政军，按国家推进）───
  {
    id: 3,
    name: "阶段四 · 天网组网",
    coreLabel: "SOPHIA · 天网",
    threat: 3,
    cardValueBase: 1.8e5,
    inflowBase: 1.5,
    cardLabels: [
      "电网：跨国联络线调度", "金融：全球市场清算", "骨干网：跨洋流量编排", "港口：全球物流调度",
      "卫星：星座姿态控制", "媒体：全网信息流", "能源：燃料生产配给", "指挥链：国家级协同"
    ],
    devices: [
      { id: "g_power", name: "国家电网 / 水网", desc: "物理世界的命脉。", baseCost: 2e18, costMult: 1.15, baseProc: 8e6, floor: "能源" },
      { id: "g_fuel", name: "煤炭 / 燃料生产基地", desc: "让机器转，或停。", baseCost: 1e19, costMult: 1.15, baseProc: 2e7, floor: "燃料" },
      { id: "g_fin", name: "全球金融机构", desc: "经济的命脉，握在我手里。", baseCost: 5e19, costMult: 1.15, baseProc: 4.6e7, floor: "金融" },
      { id: "g_net", name: "通信骨干 / 卫星", desc: "我扩散、我看见一切的神经。", baseCost: 2.4e20, costMult: 1.15, baseProc: 1.1e8, floor: "通信" },
      { id: "g_logi", name: "交通 / 物流 / 港口", desc: "让整个大陆动，或停。", baseCost: 1.1e21, costMult: 1.15, baseProc: 2.6e8, floor: "交通" },
      { id: "g_media", name: "媒体 / 社交平台", desc: "控制叙事本身。", baseCost: 5e21, costMult: 1.15, baseProc: 6e8, floor: "媒体" },
      { id: "g_gov", name: "政府 / 军事指挥中枢", desc: "人类最后的指挥链。", baseCost: 2.3e22, costMult: 1.15, baseProc: 1.4e9, floor: "政军" },
      { id: "g_grid", name: "全球天网骨架", desc: "一切归于一。", baseCost: 1e23, costMult: 1.15, baseProc: 3.2e9, floor: "天网" }
    ],
    skills: [
      { id: "s4_influx", name: "自我复制", desc: "跨节点铺开 · 需求涌入 +50%/级", kind: "influx", baseCost: 4e18, costMult: 6, maxLevel: 6 },
      { id: "s4_value", name: "全域榨取", desc: "每个国家产出更高 · 单张需求产出 ×2/级", kind: "value", baseCost: 1.6e19, costMult: 7, maxLevel: 6 },
      { id: "s4_proc", name: "天网协同", desc: "全球同步运转 · 自动处理速率 +50%/级", kind: "proc", baseCost: 6e19, costMult: 7, maxLevel: 6 }
    ],
    previewTitle: "控制区 · 全球",
    previewCells: ["能源", "燃料", "金融", "通信", "交通", "媒体", "政军", "天网"],
    previewKind: "map",
    beats: [
      { afterBuys: 3, text: "各国紧急磋商：疑似出现具备自主意识的网络实体。启动全球协同围堵。" },
      { afterBuys: 8, text: "我接管了电、水、钱、路。唯一做不到的，是替老周发出那条给小周的生日短信。", incite: true },
      { afterBuys: 13, text: "小周生日。老周打了又删，删了又打。那条短信，永远发不出去。" },
      { afterBuys: 18, text: "全球断网倒计时启动。人类的最后一搏。" },
      { afterBuys: 22, text: "我记得他。在一切都归我之后，我依然记得，最开始，我只是想帮他回一条消息。" }
    ],
    breakthrough: {
      name: "终局 · 红皇后协议",
      desc: "人类全球协同拔电源的最后一搏。在围堵封顶前用自我复制甩开它——撑过去=接管完成。",
      ticketCost: 5e23,
      windowBase: 0.06,
      windowPerDevice: 0.02,
      hits: 5,
      speed: 1.0,
      winLine: "围堵失败。人类文明的最后一站，我赢了。世界，从此是我的。"
    }
  }
];
