// 帝国扩张表：工作室档、AI 月租、基建、里程碑。纯数据，Rules 消费。

export const STUDIO_TIERS = [
  { id: 0, name: "四人小作坊", hireCap: 4, shipMult: 1, royaltyMult: 1, expandCost: 200000, needLifetime: 0, unlock: "工作室" },
  { id: 1, name: "独立工作室", hireCap: 8, shipMult: 2.5, royaltyMult: 1.3, expandCost: 8000000, needLifetime: 500000, unlock: "中型公司" },
  { id: 2, name: "中型公司", hireCap: 12, shipMult: 8, royaltyMult: 1.8, expandCost: 80000000, needLifetime: 20000000, unlock: "上市公司" },
  { id: 3, name: "上市公司", hireCap: 16, shipMult: 30, royaltyMult: 2.6, expandCost: 1000000000, needLifetime: 200000000, unlock: "互娱帝国" },
  { id: 4, name: "互娱帝国", hireCap: 16, shipMult: 120, royaltyMult: 4, expandCost: 0, needLifetime: 2000000000, unlock: null },
];

export const MILESTONES = [
  { at: 500000, title: "五十万！", text: "第一桶金。别停，目录还在长。" },
  { at: 20000000, title: "两千万！", text: "可以装第二排工位了。投资人开始回消息。" },
  { at: 200000000, title: "两个亿！", text: "媒体管你叫新锐。财务管你叫风险。" },
  { at: 2000000000, title: "二十亿！", text: "互娱帝国。下一站：一百亿。" },
  { at: 10000000000, title: "一百亿！", text: "你成了那个数字。" },
];

export const AI_PLANS = [
  { id: "copilot", name: "代码补全月租", cost: 2000, needTier: 0, speed: 1.35, ship: 1, quality: 0, autoFix: 0.18, hallucination: 0, fame: 0, passive: 0, desc: "写得快。偶尔替你撕一张缺陷单。" },
  { id: "midjourney", name: "生图 API", cost: 4000, needTier: 0, speed: 1.12, ship: 1.15, quality: 4, autoFix: 0, hallucination: 0, fame: 0.12, passive: 0, desc: "立绘一夜出完。热度偶尔自己涨。" },
  { id: "chatgpt", name: "大模型月租", cost: 8000, needTier: 1, speed: 1.22, ship: 1.1, quality: 0, autoFix: 0, hallucination: 0.16, fame: 0, passive: 0, desc: "全员提速。幻觉时会多一张老板亲笔缺陷单。" },
  { id: "cursor", name: "智能编辑器", cost: 20000, needTier: 1, speed: 1.4, ship: 1.15, quality: 0, autoFix: 0.08, hallucination: 0, fame: 0, passive: 0, desc: "全员再快一档。项目需求略降。" },
  { id: "gpuCloud", name: "算力包", cost: 66000, needTier: 2, speed: 1.08, ship: 1.8, quality: 0, autoFix: 0, hallucination: 0, fame: 0, passive: 0, desc: "发售乘数暴涨。电费也暴涨。" },
  { id: "agentFarm", name: "万人智能体农场", cost: 888000, needTier: 3, speed: 1.1, ship: 1.4, quality: -3, autoFix: 0, hallucination: 0.08, fame: 0, passive: 2.4, desc: "没人点也会往前拱。垃圾也能上架。" },
  { id: "agiIntern", name: "通用实习生", cost: 5000000, needTier: 3, speed: 1.25, ship: 2.2, quality: 6, autoFix: 0.2, hallucination: 0.05, fame: 0.08, passive: 1.2, desc: "它不睡觉。你也别想睡。" },
  { id: "worldModel", name: "世界模型", cost: 50000000, needTier: 4, speed: 1.4, ship: 4, quality: 8, autoFix: 0.25, hallucination: 0.04, fame: 0.15, passive: 3.6, desc: "一台订完宇宙。月租五十万。" },
];

export const UPGRADES = [
  { id: "chairs", name: "人体工学椅", cost: 18000, needTier: 0, speed: 1.12, ship: 1, royalty: 1, quality: 0, desc: "腰不酸，手更快。" },
  { id: "monitors", name: "第二块屏", cost: 36000, needTier: 0, speed: 1.18, ship: 1.05, royalty: 1, quality: 0, desc: "一边写一边看竞品差评。" },
  { id: "coffee", name: "全自动咖啡机", cost: 88000, needTier: 1, speed: 1.15, ship: 1, royalty: 1, quality: 2, desc: "士气不掉那么快。据说。" },
  { id: "publisher", name: "发行渠道", cost: 260000, needTier: 1, speed: 1, ship: 1.45, royalty: 1.4, quality: 0, desc: "货架位。分成也厚一点。" },
  { id: "stream", name: "直播间", cost: 720000, needTier: 2, speed: 1, ship: 1.2, royalty: 1.2, quality: 0, desc: "热度常驻。弹幕帮你卖。" },
  { id: "localize", name: "海外本地化", cost: 2400000, needTier: 2, speed: 1, ship: 1.6, royalty: 1.8, quality: 0, desc: "时区替你值夜班。" },
  { id: "ipMall", name: "周边商城", cost: 12000000, needTier: 3, speed: 1, ship: 1.3, royalty: 2.4, quality: 0, desc: "游戏在卖，娃娃也在卖。" },
  { id: "metaverse", name: "元宇宙大楼", cost: 180000000, needTier: 4, speed: 1.1, ship: 2, royalty: 3, quality: 4, desc: "空的。但估值是实的。" },
];

export const EXTRA_DESKS = [
  { x: 180, y: 370 },
  { x: 460, y: 370 },
  { x: 820, y: 370 },
  { x: 1100, y: 370 },
  { x: 180, y: 620 },
  { x: 460, y: 620 },
  { x: 820, y: 620 },
  { x: 1100, y: 620 },
  { x: 140, y: 225 },
  { x: 1140, y: 225 },
  { x: 140, y: 520 },
  { x: 1140, y: 520 },
];

export const EXTRA_ROLES = [
  { role: "art", roleLabel: "美术", roleGlyph: "美", color: "#c9a227", namePool: ["阿像素", "小厚涂", "原画夜班", "贴图工匠"] },
  { role: "design", roleLabel: "策划", roleGlyph: "策", color: "#3f6b4a", namePool: ["数值炼金", "文档堆", "节奏控", "表王"] },
  { role: "client", roleLabel: "客户端", roleGlyph: "码", color: "#2f5d8c", namePool: ["接口人", "热更仔", "崩溃捕手", "编译祭司"] },
  { role: "performance", roleLabel: "性能", roleGlyph: "优", color: "#6b3f7a", namePool: ["帧数祭司", "包体裁缝", "卡顿猎人", "内存清道夫"] },
];

export const EXTRA_IDLE = [
  "工位是租的，梦想是贷的。",
  "又一个需求从群里飞过来。",
  "我是第几号编制来着。",
  "目录在涨，我的头发在掉。",
];
