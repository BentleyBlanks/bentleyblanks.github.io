export const config = Object.freeze({
  saveVersion: 1,
  totalTurns: 18,
  ordersPerTurn: 2,
  supportMax: 100,
  grainMax: 16,
  organizationMax: 14,
  intelligenceMax: 8,
  exposureMax: 10,
  regionLevelMax: 3,
  trustMax: 100,
  fatigueMax: 3,
});

export const campaignDates = Object.freeze([
  "1940年1—2月", "1940年3—4月", "1940年5—6月", "1940年7—8月", "1940年9—10月", "1940年11—12月",
  "1941年1—2月", "1941年3—4月", "1941年5—6月", "1941年7—8月", "1941年9—10月", "1941年11—12月",
  "1942年1—2月", "1942年3—4月", "1942年5—6月", "1942年7—8月", "1942年9—10月", "1942年11—12月",
]);

export const regionTemplates = Object.freeze([
  {
    id: "Songling", name: "松岭山区", short: "松岭", type: "县政机关与隐蔽山地", symbol: "山",
    description: "山高路窄，机关便于转移，却长期缺粮。这里是联络网的西北端。",
    x: 24, y: 24, support: 74, livelihood: 1, network: 3, danger: 1, defense: 2,
    connections: ["Qinghe", "Longquan"],
  },
  {
    id: "Qinghe", name: "清河平原", short: "清河", type: "主要粮区与群众组织", symbol: "田",
    description: "开阔平原上的粮区。群众基础较好，但敌军机动队更容易进入。",
    x: 48, y: 34, support: 63, livelihood: 3, network: 2, danger: 1, defense: 1,
    connections: ["Songling", "Dongguan", "Longquan", "Ludang"],
  },
  {
    id: "Dongguan", name: "东关集镇", short: "东关", type: "市场、药品与地下联络", symbol: "集",
    description: "日间盘查严密，夜间仍有商贩、学徒和交通员维持秘密往来。",
    x: 75, y: 25, support: 48, livelihood: 2, network: 1, danger: 2, defense: 0,
    connections: ["Qinghe", "Baishi"],
  },
  {
    id: "Longquan", name: "龙泉沟联村", short: "龙泉", type: "伤员安置与妇救工作", symbol: "泉",
    description: "几座山村共同安置伤员和转移群众，承载过重时会先出现粮荒。",
    x: 22, y: 67, support: 60, livelihood: 2, network: 2, danger: 1, defense: 1,
    connections: ["Songling", "Qinghe", "Ludang"],
  },
  {
    id: "Ludang", name: "芦荡水网", short: "芦荡", type: "秘密交通与疏散路线", symbol: "舟",
    description: "水道与芦苇提供隐蔽，冬季封冻时交通能力明显下降。",
    x: 50, y: 70, support: 54, livelihood: 2, network: 1, danger: 1, defense: 1,
    connections: ["Qinghe", "Longquan", "Baishi", "Beikou"],
  },
  {
    id: "Baishi", name: "白石铁路段", short: "白石", type: "铁路、炮楼与破袭窗口", symbol: "轨",
    description: "铁路把据点和兵站连在一起。破袭能打断运输，也会暴露沿线组织。",
    x: 78, y: 58, support: 42, livelihood: 1, network: 1, danger: 3, defense: 1,
    connections: ["Dongguan", "Ludang", "Beikou"],
  },
  {
    id: "Beikou", name: "北口矿区", short: "北口", type: "劳工、金属与关键敌情", symbol: "矿",
    description: "劳工遭到强征，伪警与工头层层盘查；这里仍有尚未接上的秘密线索。",
    x: 76, y: 84, support: 35, livelihood: 1, network: 0, danger: 3, defense: 0,
    connections: ["Ludang", "Baishi"],
  },
]);

export const advisorTemplates = Object.freeze([
  {
    id: "LinLan", name: "林岚", glyph: "林", role: "县委负责人",
    stats: { governance: 7, network: 7, martial: 5 }, trust: 66,
    traits: ["steadfast", "principled"], concern: "统一战线不能只停留在名义上。",
  },
  {
    id: "ZhouYanshan", name: "周砚山", glyph: "周", role: "抗日民主政府县长",
    stats: { governance: 9, network: 6, martial: 3 }, trust: 68,
    traits: ["prudent", "mediator"], concern: "政令必须顾及每个村庄真正能承受的负担。",
  },
  {
    id: "ZhaoTieshan", name: "赵铁山", glyph: "赵", role: "县大队负责人",
    stats: { governance: 3, network: 5, martial: 9 }, trust: 61,
    traits: ["bold", "protective"], concern: "不能为了战果，把群众留下替部队承担报复。",
  },
  {
    id: "XuQiuhe", name: "许秋禾", glyph: "许", role: "妇救会组织者",
    stats: { governance: 7, network: 9, martial: 4 }, trust: 71,
    traits: ["organizer", "direct"], concern: "妇女不能只被安排做后勤，也应参与议事与选举。",
  },
  {
    id: "HanJichuan", name: "韩济川", glyph: "韩", role: "医疗队负责人",
    stats: { governance: 6, network: 5, martial: 3 }, trust: 65,
    traits: ["compassionate", "weary"], concern: "伤员和疫病不会因为战况紧张就暂停。",
  },
  {
    id: "LuMingqian", name: "陆明谦", glyph: "陆", role: "教员兼报刊编辑",
    stats: { governance: 6, network: 7, martial: 3 }, trust: 57,
    traits: ["teacher", "idealist"], concern: "应该留下真实损失，而不是只记录胜讯。",
  },
  {
    id: "MaChengyi", name: "马成义", glyph: "马", role: "地下交通员",
    stats: { governance: 3, network: 10, martial: 5 }, trust: 59,
    traits: ["discreet", "quiet"], concern: "任何人都不该掌握整条交通线。包括你。",
  },
  {
    id: "DongBoan", name: "董伯安", glyph: "董", role: "商会与开明人士代表",
    stats: { governance: 8, network: 6, martial: 2 }, trust: 51,
    traits: ["connected", "conservative"], concern: "支持抗战，但征粮必须有收据，调租必须能申诉。",
  },
]);

export const traits = Object.freeze({
  steadfast: { name: "坚韧", description: "在大扫荡预警下执行转移、侦察更可靠。" },
  principled: { name: "重原则", description: "群众组织与统战协商成功时信任增幅更高。" },
  prudent: { name: "审慎", description: "政务与情报行动更稳定，失败时暴露更少。" },
  mediator: { name: "善协调", description: "统战协商与减租调解更有效。" },
  bold: { name: "果断", description: "武装行动更有力，但更容易提高暴露。" },
  protective: { name: "护群众", description: "转移掩护时额外保护人员。" },
  organizer: { name: "善组织", description: "群众组织与生产救济效果提高。" },
  direct: { name: "直率", description: "执行成功时赢得更多信任，受挫时也更尖锐。" },
  compassionate: { name: "仁厚", description: "医疗教育、救济与转移效果提高。" },
  weary: { name: "疲惫", description: "连续出勤的疲劳惩罚更高。" },
  teacher: { name: "善鼓舞", description: "群众组织与医疗教育更有效。" },
  idealist: { name: "理想主义", description: "高民心时表现更好，掩盖损失会破坏信任。" },
  discreet: { name: "机警", description: "情报交通与转移掩护更可靠。" },
  quiet: { name: "缄默", description: "信任达到“信赖”后才公开真正顾虑。" },
  connected: { name: "人脉广", description: "统战协商与集镇情报更有效。" },
  conservative: { name: "重信誉", description: "程序完整时更可靠，强推政策时信任下降较多。" },
});

export const actions = Object.freeze({
  production: {
    id: "production", name: "生产救济", kind: "政务", skill: "governance", difficulty: 52,
    description: "互助生产、调拨口粮，修复当地民生。",
    cost: { organization: 1 }, preview: "民生↑ · 粮秣↑ · 民心小幅↑",
  },
  organize: {
    id: "organize", name: "群众组织", kind: "组织", skill: "network", difficulty: 56,
    description: "通过农救会、妇救会、青救会恢复村庄联系。",
    cost: { grain: 1, organization: 1 }, preview: "联系↑ · 当地民心↑",
  },
  unitedFront: {
    id: "unitedFront", name: "统战协商", kind: "政务", skill: "governance", difficulty: 58,
    description: "邀请不同阶层代表共同议事，按程序调解负担。",
    cost: {}, preview: "信任↑ · 组织力可能恢复",
  },
  medical: {
    id: "medical", name: "医疗教育", kind: "民生", skill: "governance", difficulty: 50,
    description: "照护伤病、开办识字班，减轻长期组织损耗。",
    cost: { grain: 2, organization: 1 }, preview: "民生↑ · 民心↑ · 缓解疲劳",
  },
  intelligence: {
    id: "intelligence", name: "情报交通", kind: "隐蔽", skill: "network", difficulty: 59,
    description: "启用暗号和备用线路，摸清据点、道路与搜捕动向。",
    cost: { organization: 1 }, preview: "情报↑ · 预警↑ · 暴露小幅下降",
  },
  evacuate: {
    id: "evacuate", name: "转移掩护", kind: "隐蔽", skill: "network", difficulty: 62,
    description: "坚壁清野，分散机关，优先转移群众、伤员与文件。",
    cost: { grain: 1, organization: 1, intelligence: 1 }, preview: "准备↑↑ · 敌情压力↓ · 暴露↓",
  },
  sabotage: {
    id: "sabotage", name: "交通破袭", kind: "军事", skill: "martial", difficulty: 69,
    description: "短暂切断铁路、公路或通信；战果不会永久保留。",
    cost: { grain: 1, organization: 1, intelligence: 1 }, preview: "敌情压力↓ · 战果↑ · 暴露↑↑",
  },
  militia: {
    id: "militia", name: "民兵联防", kind: "军事", skill: "martial", difficulty: 60,
    description: "训练预警、掩护与迟滞，不把民兵当作正规军硬拼。",
    cost: { grain: 1, organization: 1 }, preview: "防备↑ · 联系小幅↑ · 暴露↑",
  },
});

export const policies = Object.freeze({
  conceal: {
    id: "conceal", name: "隐蔽扎根", advocate: "MaChengyi",
    description: "命令造成的暴露降低，生产与组织收益略慢。",
    detail: "暴露增量 ×0.7；生产救济与群众组织的正面效果 ×0.9。",
  },
  mobilize: {
    id: "mobilize", name: "群众动员", advocate: "XuQiuhe",
    description: "民心和联系增长更快，但每回合额外消耗粮秣。",
    detail: "民心与联系收益 ×1.2；回合结算额外消耗1粮秣。",
  },
  disrupt: {
    id: "disrupt", name: "破袭牵制", advocate: "ZhaoTieshan",
    description: "军事行动效果更强，敌军更容易锁定活动区域。",
    detail: "交通破袭与民兵联防效果 ×1.25；相关行动额外增加1点暴露。",
  },
});

const eventCatalog = Object.freeze([
  {
    id: "OpeningNetwork", type: "local", title: "一县七处", subtitle: "本局虚构 · 史实框架",
    story: "县城、铁路和公路据点在日军手中，乡村与山区却不是一张均匀的占领色块。你接过的不是一块领地，而是七处时断时续的群众与交通节点。先决定联席机关如何落脚。",
    choices: [
      { id: "Villages", title: "干部先沉到村里", description: "让工作队分散进村，不急着挂出机关牌子。", outcome: "群众联系更稳，情报积累较慢。", effects: { resources: { support: 5, organization: -1 }, regions: { Songling: { network: 1 }, Longquan: { support: 4 } }, trust: { XuQiuhe: 3, LinLan: 2 }, chronicle: "联席机关把第一批干部派进村庄，先认路、认人、认负担。" } },
      { id: "Council", title: "先把议事处立稳", description: "厘清财政、救护与交通分工，再向外围展开。", outcome: "组织力提高，外围民心暂时不变。", effects: { resources: { organization: 2, intelligence: 1 }, trust: { ZhouYanshan: 3, LinLan: 2 }, chronicle: "联席机关先厘清了财政、救护与交通责任。" } },
      { id: "LocalForces", title: "联络地方抗日力量", description: "以共同抗日为先，接纳背景复杂的地方武装和中间人士。", outcome: "防备与统战关系提高，内部协调更难。", effects: { regions: { Qinghe: { defense: 1 }, Dongguan: { network: 1 } }, trust: { DongBoan: 4, ZhaoTieshan: 2, LinLan: -2 }, chronicle: "议事处接纳了几支背景不同的地方抗日力量，约定先共同对敌。" } },
    ],
  },
  {
    id: "ThreeThirds", type: "historical", title: "席位与选民册", subtitle: "史实背景 · 1940年民主建政",
    story: "1940年3月，中共中央提出抗日民主政权的“三三制”人员构成原则。晋察冀随后筹备更大范围的民主选举；投豆、画圈是帮助不识字者参与的投票办法，与政权人员构成的“三三制”并非一回事。岳北县的人物、会议与争论均为虚构。",
    choices: [
      { id: "Open", title: "逐村登记，公开说明", description: "登记不同群体选民，提前讲解投豆、画圈等办法。", outcome: "筹备更充分，耗费组织力。", effects: { resources: { support: 8, organization: -2 }, trust: { XuQiuhe: 4, LuMingqian: 3, DongBoan: -1 }, chronicle: "工作队开始逐村登记并说明投豆、画圈等办法，为夏秋选举作准备。" } },
      { id: "Consult", title: "先议代表构成", description: "邀请不同群体讨论候选资格和人员构成，减少仓促冲突。", outcome: "民心与组织均有小幅收益。", effects: { resources: { support: 5, organization: 1 }, trust: { ZhouYanshan: 4, DongBoan: 3, XuQiuhe: 1 }, chronicle: "议事处先讨论不同群体的代表构成，再把候选资格交各村说明。" } },
      { id: "Cadres", title: "先保证战时执行", description: "保留更多熟悉工作的干部，扩大参与的筹备暂缓。", outcome: "组织力上升，但公信受损。", effects: { resources: { support: -4, organization: 3 }, trust: { LinLan: 2, XuQiuhe: -4, DongBoan: -2 }, chronicle: "战时执行被置于优先位置，部分村庄的选民登记与代表筹备暂缓。" } },
    ],
  },
  {
    id: "RentLedger", type: "local", title: "地租簿上的红印", subtitle: "本局虚构 · 减租减息原则",
    story: "佃户代表要求核清旧账，董伯安则担心调租变成无凭无据的摊派。抗战时期的政策不是全面没收土地，而是“减租交租、减息交息”，在减轻负担的同时通过调解维持统一战线。",
    choices: [
      { id: "PublicLedger", title: "公开核账，村里评议", description: "逐笔核算旧租债息，把结果写入村簿。", outcome: "民心提高，组织消耗较大。", effects: { resources: { support: 7, organization: -2 }, regions: { Qinghe: { livelihood: 1 } }, trust: { XuQiuhe: 3, DongBoan: -2, ZhouYanshan: 2 }, chronicle: "清河各村公开核验租债账目，并按减租交租原则重新立据。" } },
      { id: "Mediation", title: "分村调解，保留申诉", description: "先由村里调解，争议较大的送到县里复核。", outcome: "效果较慢，各方更能接受。", effects: { resources: { support: 4, organization: 1 }, regions: { Qinghe: { livelihood: 1 } }, trust: { DongBoan: 3, ZhouYanshan: 4 }, chronicle: "租佃争议先在村里调解，无法解决的再送县里复核。" } },
      { id: "Delay", title: "秋收后再议", description: "调租暂不落纸，维持旧租约到秋后复核。", outcome: "短期避免争执，民心与关系受损。", effects: { resources: { support: -6 }, trust: { XuQiuhe: -4, DongBoan: 1 }, chronicle: "议事处把调租复核推到秋后，旧租约与争议继续存在。" } },
    ],
  },
  {
    id: "BeforeAugust", type: "historical", title: "八月二十日以前", subtitle: "史实背景 · 百团大战前夕",
    story: "7月至10月，晋察冀的大规模民主选举正在展开；投豆、画圈是投票办法，“三三制”是人员构成原则。与此同时，以正太路为重点的大规模交通破袭即将开始。它能中断运输、鼓舞抗战，却不能永久占领铁路；沿线群众和组织还要承受侵略军实施的报复性搜捕与暴行。你不能决定战役是否发生，只能决定岳北县怎样响应。",
    choices: [
      { id: "EvacuateFirst", title: "先疏散沿线群众", description: "提前转移白石与北口的人员、药品和账册。", outcome: "战果较小，后续损失明显降低。", effects: { resources: { grain: -1, intelligence: 1 }, regions: { Baishi: { prepared: 2 }, Beikou: { prepared: 1 } }, trust: { ZhaoTieshan: 2, HanJichuan: 3 }, threat: { name: "铁路沿线搜捕", target: "Baishi", strength: 3 }, chronicle: "白石铁路沿线先转移了群众、药品和账册。" } },
      { id: "FullSupport", title: "全力支援集中破袭", description: "把民兵、向导和工具集中到铁路窗口。", outcome: "交通战果高，暴露大幅上升。", effects: { resources: { support: 4, exposure: 3, organization: -1 }, regions: { Baishi: { danger: -1, network: 1 } }, trust: { ZhaoTieshan: 4, MaChengyi: -2 }, stats: { disruptions: 2 }, threat: { name: "铁路沿线搜捕", target: "Baishi", strength: 5 }, chronicle: "岳北县集中民兵、向导和工具配合铁路破袭。" } },
      { id: "MedicalRoute", title: "维持交通与救护", description: "不争抢破袭任务，把力量留给伤员转运和退路。", outcome: "战果有限，组织保存更好。", effects: { resources: { organization: 1, intelligence: 1 }, regions: { Ludang: { network: 1, prepared: 1 } }, trust: { HanJichuan: 4, MaChengyi: 3, ZhaoTieshan: -2 }, threat: { name: "铁路沿线搜捕", target: "Baishi", strength: 3 }, chronicle: "岳北县把主要力量留给救护与退路，未争抢破袭任务。" } },
    ],
  },
  {
    id: "RailAftermath", type: "historical", title: "铁轨之后", subtitle: "史实背景 · 百团大战仍在继续",
    story: "百团大战第一阶段之后，战役仍将继续至12月。破坏的钢轨可以修复，失去的地下关系却很难重建；日军开始加强沿线守备和清查。必须强调：侵略军对平民实施暴行的责任属于侵略者，绝不能把这种罪责转嫁给抵抗者。",
    choices: [
      { id: "Disperse", title: "分散人员，启用备用线", description: "停止使用最显眼的交通站，让知情范围彼此隔开。", outcome: "暴露下降，组织暂时变慢。", effects: { resources: { exposure: -2, organization: -1, intelligence: 1 }, regions: { Baishi: { prepared: 1 }, Ludang: { network: 1 } }, trust: { MaChengyi: 4 }, chronicle: "铁路破袭后，交通站分散人员并启用备用暗号。" } },
      { id: "Repair", title: "先修复群众联系", description: "把干部送回沿线村庄，解释损失并安排救济。", outcome: "民心恢复，仍保持一定暴露。", effects: { resources: { support: 6, grain: -2 }, regions: { Baishi: { support: 7 } }, trust: { XuQiuhe: 3, HanJichuan: 2 }, chronicle: "工作队返回铁路沿线，先救济、再恢复组织。" } },
      { id: "KeepPressure", title: "改打维修队与通信线", description: "避免再次集中，继续小规模牵制。", outcome: "保留交通战果，暴露仍然上升。", effects: { resources: { exposure: 2, intelligence: -1 }, regions: { Baishi: { danger: -1 } }, trust: { ZhaoTieshan: 3 }, stats: { disruptions: 1 }, threat: { name: "铁路守备清查", target: "Baishi", strength: 4 }, chronicle: "县大队转为分段袭扰维修队与通信线。" } },
    ],
  },
  {
    id: "WarChildren", type: "local", title: "战火中的孩子", subtitle: "史实启发 · 本局虚构",
    story: "交通员带回两名在战斗中失散的日本儿童。史实原型是百团大战期间聂荣臻救助日本儿童；本局地点、人物、路线与具体选择均为虚构。侵略军人与普通儿童必须被区分，人道救护不是对侵略性质的含糊。你只能决定如何保护并交还她们，不能选择伤害或遗弃。",
    choices: [
      { id: "TreatAndReturn", title: "治疗后经交通线送还", description: "先由医疗队照顾，待路线稳定后送还。", outcome: "消耗粮秣，民心与人物信任提高。", effects: { resources: { grain: -2, support: 4 }, trust: { HanJichuan: 4, LuMingqian: 3 }, stats: { peopleProtected: 2 }, chronicle: "医疗队救护了两名失散儿童，随后经交通线安全送还。" } },
      { id: "ImmediateReturn", title: "立即寻找交还窗口", description: "减少长期安置压力，但交通员要承担更高风险。", outcome: "消耗情报，交通关系增强。", effects: { resources: { intelligence: -1, support: 2 }, trust: { MaChengyi: 4, HanJichuan: 1 }, stats: { peopleProtected: 2 }, chronicle: "交通员冒险找到交还窗口，两名儿童平安离开战区。" } },
      { id: "SafeVillage", title: "暂留安全村庄", description: "等待下一次稳定窗口，并向群众解释。", outcome: "更稳妥，但粮秣负担较高。", effects: { resources: { grain: -3, support: 3 }, regions: { Longquan: { livelihood: -1, support: 4 } }, trust: { XuQiuhe: 2, HanJichuan: 3 }, stats: { peopleProtected: 2 }, chronicle: "龙泉沟暂时照料了两名失散儿童，等待安全交还窗口。" } },
    ],
  },
  {
    id: "SecurityMap", type: "historical", title: "三色区域图", subtitle: "史实背景 · 华北“治安强化”",
    story: "情报显示，自1941年春起，日军与其扶植的华北政权将推进多轮“治安强化”，把地区划为不同控制等级，以碉堡、公路、封锁沟、市场封锁和伪村政权共同向外挤压。目的不是只夺一座山头，而是切断村庄与抗日组织的联系。",
    choices: [
      { id: "SinkNetwork", title: "交通线下沉到户", description: "不再依赖单一交通站，把暗号和接头拆成更小环节。", outcome: "组织短降，长期预警提高。", effects: { resources: { organization: -1, intelligence: 2, exposure: -1 }, regions: { Ludang: { network: 1 }, Dongguan: { prepared: 1 } }, trust: { MaChengyi: 4 }, threat: { name: "碉堡封锁推进", target: "Dongguan", strength: 3 }, chronicle: "秘密交通改为分段联络，没有人掌握完整线路。" } },
      { id: "ArmedCover", title: "以县大队掩护外围", description: "在封锁线未合拢前维持公开活动空间。", outcome: "防备提高，暴露也提高。", effects: { resources: { exposure: 2 }, regions: { Qinghe: { defense: 1 }, Dongguan: { defense: 1 } }, trust: { ZhaoTieshan: 4 }, threat: { name: "碉堡封锁推进", target: "Qinghe", strength: 4 }, chronicle: "县大队在封锁线外缘分散掩护群众组织。" } },
      { id: "MarketWork", title: "争取集镇与伪村人员", description: "区分主动投敌者与受胁迫者，寻找可用的内部关系。", outcome: "情报和集镇联系提高，关系更复杂。", effects: { resources: { intelligence: 2, support: 2 }, regions: { Dongguan: { network: 1, support: 5 } }, trust: { DongBoan: 4, LinLan: -1 }, threat: { name: "碉堡封锁推进", target: "Dongguan", strength: 3 }, chronicle: "东关工作开始区分主动投敌者与受胁迫人员，建立新的内部关系。" } },
    ],
  },
  {
    id: "PromiseOfGrain", type: "local", title: "一张没有盖章的借据", subtitle: "本局虚构 · 公粮与信誉",
    story: "春荒还没过去，县大队又需要口粮。董伯安坚持所有借粮都要有收据，赵铁山则担心繁琐手续耽误转移。问题不是要不要抗战，而是群众负担怎样才不被滥用。",
    choices: [
      { id: "Receipts", title: "补齐收据，逐户核数", description: "暂缓一部分调粮，把每笔借粮登记清楚。", outcome: "粮秣减少，公信与统战关系提高。", effects: { resources: { grain: -2, support: 5, organization: -1 }, trust: { DongBoan: 5, ZhouYanshan: 2, ZhaoTieshan: -1 }, chronicle: "议事处补齐了借粮收据，并约定秋后按户核还。" } },
      { id: "SimpleMarks", title: "村代表画押，事后复核", description: "用简化手续兼顾行军速度与凭据。", outcome: "各方小幅满意。", effects: { resources: { support: 3 }, trust: { DongBoan: 2, ZhaoTieshan: 2, ZhouYanshan: 2 }, chronicle: "借粮由村代表共同画押，待形势缓和后再逐户复核。" } },
      { id: "Emergency", title: "先按紧急军需调粮", description: "部队立即获得粮食，承诺稍后补据。", outcome: "粮秣增加，民心与信誉下降。", effects: { resources: { grain: 3, support: -6 }, trust: { ZhaoTieshan: 3, DongBoan: -5, ZhouYanshan: -2 }, chronicle: "县大队按紧急军需先行调粮，留下了一批未补的借据。" } },
    ],
  },
  {
    id: "FirstPictorial", type: "local", title: "岳北木刻小报", subtitle: "本局虚构 · 战地记录",
    story: "陆明谦刻好了一组木版：妇女投豆选举、交通员夜过封锁线，也有一座被毁的村庄。他坚持不能只报喜讯。这是虚构的地方木刻小报，并非1942年创刊的《晋察冀画报》。公开传播能鼓舞民心，也会让敌人从细节追查地点。",
    choices: [
      { id: "Public", title: "公开群众生产与抵抗", description: "删去地点细节，在各村传阅。", outcome: "民心提高，暴露小幅上升。", effects: { resources: { support: 6, exposure: 1 }, trust: { LuMingqian: 4, XuQiuhe: 2 }, chronicle: "岳北木刻小报在各村传阅，隐去了可能暴露路线的细节。" } },
      { id: "SecretArchive", title: "记录损失，秘密外送", description: "保留被毁村庄的真实记录，经交通线送出。", outcome: "消耗情报，留下重要纪事。", effects: { resources: { intelligence: -1, organization: -1, support: 3 }, trust: { LuMingqian: 5, MaChengyi: 2 }, stats: { recordsPreserved: 1 }, chronicle: "被毁村庄的木刻与名册被秘密送出，留下了一份不只记胜讯的档案。" } },
      { id: "Postpone", title: "暂缓印发", description: "先保护刻版和人员，等清查过去。", outcome: "暴露下降，编辑不满。", effects: { resources: { exposure: -1 }, trust: { LuMingqian: -4, MaChengyi: 2 }, chronicle: "木刻小报暂缓印发，刻版被藏进一处废窑。" } },
    ],
  },
  {
    id: "ClinicOrArms", type: "local", title: "最后两匹骡子", subtitle: "本局虚构 · 军民资源取舍",
    story: "两匹骡子只能走一趟：一边是龙泉沟缺药的伤员，一边是清河需要转移的弹药。谁都没有错，但你必须留下一个可以被追问的决定。",
    choices: [
      { id: "Medicine", title: "把药送到龙泉沟", description: "优先伤员和疫病防治。", outcome: "民生与医务关系提高，防备暂缓。", effects: { resources: { grain: -1, support: 4 }, regions: { Longquan: { livelihood: 1 } }, trust: { HanJichuan: 5, ZhaoTieshan: -2 }, stats: { peopleProtected: 12 }, chronicle: "最后两匹骡子把药品送到龙泉沟，弹药转移被推迟。" } },
      { id: "Ammunition", title: "先转移弹药", description: "避免武器落入敌手，让医疗队就地分散。", outcome: "清河防备提高，医疗关系受损。", effects: { regions: { Qinghe: { defense: 1, prepared: 1 } }, trust: { ZhaoTieshan: 4, HanJichuan: -4 }, chronicle: "最后两匹骡子先转移了清河的弹药，医疗队被迫就地分散。" } },
      { id: "Split", title: "拆成轻载，人力接力", description: "两边都送一半，干部与民兵承担额外疲劳。", outcome: "效果折中，全体疲劳小幅增加。", effects: { regions: { Longquan: { livelihood: 1 }, Qinghe: { prepared: 1 } }, allFatigue: 1, trust: { HanJichuan: 2, ZhaoTieshan: 2 }, chronicle: "药品和弹药拆成轻载，由干部与民兵接力送往两处。" } },
    ],
  },
  {
    id: "FiveRoads", type: "historical", title: "五路烟尘", subtitle: "史实背景 · 1941年秋季反“扫荡”",
    story: "北岳区遭遇大规模“扫荡”。敌军寻找主力、机关、医院和粮仓，并试图切断山地与平原之间的联系。胜利不只看打退多少敌军，更看能否保存群众、交通和有生力量。",
    choices: [
      { id: "PeopleFirst", title: "机关分散，群众先走", description: "放弃部分物资，优先疏散群众、伤员和名单。", outcome: "人员损失最低，组织和粮秣受损。", effects: { resources: { grain: -2, organization: -2, support: 5 }, regions: { Longquan: { prepared: 2 }, Songling: { prepared: 2 } }, trust: { HanJichuan: 4, ZhaoTieshan: 3 }, stats: { peopleProtected: 40 }, threat: { name: "秋季合围", target: "Songling", strength: 6 }, chronicle: "机关分散转移，先护送群众、伤员和名册离开合围方向。" } },
      { id: "Decoy", title: "县大队牵制一路", description: "以小部队吸引追击，为机关和群众争取时间。", outcome: "转移窗口扩大，县大队疲劳与风险较高。", effects: { resources: { exposure: 1, support: 3 }, regions: { Songling: { prepared: 1, defense: 1 } }, trust: { ZhaoTieshan: 5, HanJichuan: -1 }, advisorFatigue: { ZhaoTieshan: 2 }, threat: { name: "秋季合围", target: "Songling", strength: 6 }, chronicle: "县大队以分散牵制为机关和群众转移争取了时间。" } },
      { id: "PreserveNetwork", title: "保住交通站和电台", description: "优先转移交通骨干与电台，外围村庄自行隐蔽。", outcome: "长期组织保存较好，群众公信承压。", effects: { resources: { organization: 2, intelligence: 1, support: -5 }, regions: { Ludang: { prepared: 2 } }, trust: { MaChengyi: 4, XuQiuhe: -4 }, threat: { name: "秋季合围", target: "Longquan", strength: 6 }, chronicle: "交通骨干与电台优先转移，外围村庄自行隐蔽。" } },
    ],
  },
  {
    id: "Streamline", type: "historical", title: "少一个章，多一担粮", subtitle: "史实背景 · 精兵简政",
    story: "1942年1月，晋察冀开始部署和落实精兵简政，以减轻群众负担并提高战时效率。它不是简单裁员，而是让机关更小、干部更贴近基层，在封锁中活下去。",
    choices: [
      { id: "CadresDown", title: "合并机关，干部下村", description: "减少层级，把干部派到断线节点。", outcome: "短期组织降低，之后每回合粮耗减少。", effects: { resources: { organization: -2 }, regions: { Beikou: { network: 1 }, Dongguan: { network: 1 } }, flags: { streamlined: true }, trust: { LinLan: 3, XuQiuhe: 2 }, chronicle: "机关合并层级，干部被派往东关和北口恢复基层联系。" } },
      { id: "KeepMedical", title: "保留医疗与交通骨干", description: "削减其他机关，保护最难重新训练的人员。", outcome: "生存能力增强，宣传教育关系受损。", effects: { resources: { organization: -1, intelligence: 1 }, flags: { protectedServices: true }, trust: { HanJichuan: 4, MaChengyi: 4, LuMingqian: -3 }, chronicle: "精简中优先保留了医疗与交通骨干。" } },
      { id: "EqualCuts", title: "各处平均缩减", description: "避免明显冲突，但没有真正改变机关结构。", outcome: "关系稳定，执行效率最低。", effects: { resources: { grain: 1, organization: -1 }, allTrust: 1, chronicle: "各处平均缩减人员，避免了争执，也没有真正改变机关结构。" } },
    ],
  },
  {
    id: "WinterBurden", type: "local", title: "冬季的承诺", subtitle: "本局虚构 · 人物关系",
    story: "连续转移让每个人都疲惫。许秋禾要求本季不再额外向龙泉沟摊派，赵铁山则提醒县大队的冬衣只够一半。承诺一旦作出，下一次决定会有人记得。",
    choices: [
      { id: "NoLevy", title: "答应不再向龙泉加派", description: "从机关库存挤出物资，保护安置村庄。", outcome: "民心与妇救关系提高，粮秣下降。", effects: { resources: { grain: -2, support: 5 }, regions: { Longquan: { livelihood: 1 } }, trust: { XuQiuhe: 4, ZhaoTieshan: -1 }, stats: { promisesKept: 1 }, chronicle: "议事处承诺冬季不再向龙泉沟额外摊派。" } },
      { id: "WinterClothes", title: "先补县大队冬衣", description: "维持外围巡护，安置村庄靠互助过冬。", outcome: "防备提高，龙泉民生承压。", effects: { regions: { Qinghe: { defense: 1 }, Longquan: { livelihood: -1 } }, trust: { ZhaoTieshan: 4, XuQiuhe: -3 }, chronicle: "有限布匹先补给县大队，龙泉沟依靠互助过冬。" } },
      { id: "ReduceAll", title: "全体口粮与供应同减", description: "不让任何一方独自承担，但疲劳继续积累。", outcome: "粮秣略增，全体疲劳提高。", effects: { resources: { grain: 2 }, allFatigue: 1, allTrust: 1, chronicle: "机关、部队和安置村共同缩减了冬季供应。" } },
    ],
  },
  {
    id: "BackupRoute", type: "local", title: "未到站的交通员", subtitle: "本局虚构 · 秘密交通",
    story: "一名交通员没有按时到站。原线路可能已经暴露，也可能只是临时封锁。沿线藏有干部、药品和文件，一旦整条线被牵出，损失将远超过一份情报。",
    choices: [
      { id: "StopLine", title: "立即停线，启用备用暗号", description: "不去验证失联原因，先保护整条网络。", outcome: "联系暂降，暴露明显下降。", effects: { resources: { exposure: -2, intelligence: -1 }, regions: { Ludang: { network: -1, prepared: 2 } }, trust: { MaChengyi: 5 }, chronicle: "一名交通员失联后，原线立即停用，备用暗号开始启用。" } },
      { id: "LimitedProbe", title: "派不知全线的人查验", description: "只核实一个节点，不携带完整名单。", outcome: "可能恢复情报，风险可控。", effects: { resources: { intelligence: 2, exposure: 1 }, regions: { Dongguan: { prepared: 1 } }, trust: { MaChengyi: 3, LinLan: 1 }, chronicle: "一名不知全线的联络员只查验了失联节点。" } },
      { id: "BurnRecords", title: "销毁节点档案，人员先走", description: "放弃部分组织积累，避免名单落入敌手。", outcome: "组织受损，人员得到保护。", effects: { resources: { organization: -2, support: 2 }, regions: { Dongguan: { network: -1, prepared: 2 } }, stats: { peopleProtected: 18 }, trust: { MaChengyi: 4, HanJichuan: 2 }, chronicle: "节点档案被销毁，相关人员先行转移。" } },
    ],
  },
  {
    id: "MaySweep", type: "historical", title: "五一之后", subtitle: "史实背景 · 1942年冀中大“扫荡”",
    story: "冀中邻区多处组织失联。1942年5月至6月的大“扫荡”给冀中根据地造成沉重打击，主力大部外转，留下小部队和地方组织坚持。具体兵力与伤亡数字存在差异，本作不把争议数字做成战绩。岳北县必须准备接应越过封锁线的人。",
    choices: [
      { id: "ReceiveCadres", title: "接应干部、伤员与电台", description: "开放芦荡和龙泉安置线，承担额外粮食压力。", outcome: "保护人员与组织，粮秣大幅下降。", effects: { resources: { grain: -3, organization: 2, support: 3 }, regions: { Ludang: { prepared: 2 }, Longquan: { livelihood: -1, support: 4 } }, stats: { peopleProtected: 55 }, trust: { MaChengyi: 3, HanJichuan: 4 }, threat: { name: "越线搜捕", target: "Ludang", strength: 6 }, chronicle: "芦荡与龙泉接应了从冀中转出的干部、伤员和电台。" } },
      { id: "SmallTeams", title: "分散小组，深入外围", description: "把接应人员编成小组，不集中进入山区。", outcome: "外围联系提高，暴露也提高。", effects: { resources: { exposure: 2, organization: 1 }, regions: { Dongguan: { network: 1 }, Beikou: { network: 1 } }, trust: { LinLan: 3, ZhaoTieshan: 2 }, threat: { name: "越线搜捕", target: "Dongguan", strength: 5 }, chronicle: "接应人员分成小组，转入东关与北口外围活动。" } },
      { id: "CloseRoutes", title: "暂时关闭主要路线", description: "先保住岳北县现有网络，等待清查强度下降。", outcome: "暴露下降，统一战线与公信受损。", effects: { resources: { exposure: -2, support: -5, intelligence: 1 }, regions: { Ludang: { prepared: 2 } }, trust: { MaChengyi: 3, XuQiuhe: -3, HanJichuan: -3 }, threat: { name: "越线搜捕", target: "Ludang", strength: 4 }, chronicle: "岳北县暂时关闭主要接应路线，等待清查强度下降。" } },
    ],
  },
  {
    id: "LeavesOrder", type: "historical", title: "村边的树叶", subtitle: "史实背景 · 1942年春荒",
    story: "旱情、封锁和战争破坏叠加，华北敌后粮食危机严重。史料记载部队收到要求，把村边可食树叶留给群众，到远处采摘。这里没有“强抢口粮”的选项，因为纪律与群众生存不是装饰性的道德加分。",
    choices: [
      { id: "LeaveForPeople", title: "缩减机关口粮，执行训令", description: "把村边可食树叶和野菜留给群众。", outcome: "粮秣下降，民心显著提高。", effects: { resources: { grain: -3, support: 8 }, allFatigue: 1, trust: { LinLan: 3, XuQiuhe: 3 }, stats: { peopleProtected: 25 }, chronicle: "机关和部队缩减口粮，把村边可食树叶留给群众。" } },
      { id: "ProductionTeams", title: "组织远采与生产队", description: "派出生产队到远处采集，并开垦零散土地。", outcome: "消耗组织力，民生与粮秣恢复。", effects: { resources: { organization: -2, grain: 2, support: 4 }, regions: { Songling: { livelihood: 1 }, Longquan: { livelihood: 1 } }, trust: { ZhouYanshan: 3, XuQiuhe: 2 }, chronicle: "生产队到远处采集并开垦零散土地，避开村边口粮。" } },
      { id: "OpenReserve", title: "打开机关存粮救济", description: "立即救济最困难的村庄，之后必须节衣缩食。", outcome: "粮秣大幅下降，群众与医疗关系提高。", effects: { resources: { grain: -4, support: 7 }, regions: { Qinghe: { livelihood: 1 }, Longquan: { livelihood: 1 } }, trust: { HanJichuan: 4, DongBoan: 2 }, stats: { peopleProtected: 35 }, chronicle: "机关打开存粮，先救济最困难的村庄。" } },
    ],
  },
  {
    id: "OldTunnel", type: "local", title: "地道的缺口", subtitle: "史实启发 · 防御工事",
    story: "邻区传来惨痛教训：只有一个出口、缺少通风防毒和地面预警的早期地道，可能变成陷阱。1941—1942年的地道尚未成熟，不能把它写成无敌工程。",
    choices: [
      { id: "Exits", title: "增修备用口与通风", description: "少挖新长度，先解决已有地道的致命缺口。", outcome: "防备与准备提高。", effects: { resources: { organization: -2 }, regions: { Qinghe: { defense: 1, prepared: 2 } }, trust: { ZhouYanshan: 2, HanJichuan: 2 }, chronicle: "清河没有盲目扩建地道，而是先补上备用口与通风。" } },
      { id: "VillageLinks", title: "先建村际预警联络", description: "以钟声、暗哨和民兵接力弥补地道不足。", outcome: "联系与情报提高。", effects: { resources: { intelligence: 1 }, regions: { Qinghe: { network: 1, prepared: 1 }, Longquan: { network: 1 } }, trust: { MaChengyi: 2, ZhaoTieshan: 2 }, chronicle: "清河和龙泉先建立村际预警，再讨论扩建工事。" } },
      { id: "Training", title: "先训练疏散与地面掩护", description: "把地道当作体系的一部分，而不是唯一答案。", outcome: "民心与防备小幅提高。", effects: { resources: { support: 3 }, regions: { Qinghe: { defense: 1, prepared: 1 } }, trust: { ZhaoTieshan: 3, XuQiuhe: 2 }, chronicle: "村民先演练预警、疏散和地面掩护，地道只是其中一环。" } },
    ],
  },
  {
    id: "BehindTheRear", type: "historical", title: "到敌后之敌后", subtitle: "历史阶段 · 1942年冬",
    story: "最困难的时期还没有结束。封锁网把山区、平原、集镇和矿区割开，恢复不能靠一次大会战，而要靠小部队、交通员和基层组织重新渗入，并开始组织武装工作队；这一方向将在1943年进一步展开。你的最后一道长期决定，将定义岳北县把火种送向哪里。",
    choices: [
      { id: "MineWorkers", title: "联络北口矿区劳工", description: "把秘密关系伸进强征劳工与伪警控制的矿区。", outcome: "北口联系与组织提高，风险集中。", effects: { resources: { organization: 1, intelligence: 1, exposure: 1 }, regions: { Beikou: { network: 2, support: 10 } }, trust: { DongBoan: 2, MaChengyi: 3 }, chronicle: "岳北县把一条秘密关系伸进北口矿区劳工之中。" } },
      { id: "CrossRail", title: "穿越铁路恢复南北交通", description: "以白石为跳板，重连芦荡与东关。", outcome: "交通网络明显恢复，暴露升高。", effects: { resources: { organization: 1, exposure: 2 }, regions: { Baishi: { network: 2 }, Dongguan: { network: 1 }, Ludang: { network: 1 } }, trust: { MaChengyi: 4, ZhaoTieshan: 2 }, stats: { disruptions: 1 }, chronicle: "交通员穿越白石铁路，重新接上南北两侧的暗线。" } },
      { id: "MarketCells", title: "深入集镇发展地下组织", description: "从商贩、学徒与被胁迫人员中建立小组。", outcome: "东关民心与情报提高，统战关系增强。", effects: { resources: { support: 4, intelligence: 2 }, regions: { Dongguan: { network: 2, support: 8 } }, trust: { DongBoan: 4, LinLan: 2 }, chronicle: "东关的商贩、学徒与内部关系组成了彼此隔离的小组。" } },
    ],
  },
]);

export const turnEvents = Object.freeze([
  ...eventCatalog.slice(0, 11),
  eventCatalog[12],
  eventCatalog[11],
  eventCatalog[15],
  eventCatalog[14],
  eventCatalog[13],
  eventCatalog[16],
  eventCatalog[17],
]);

export class Rng {
  constructor(seed = 1) { this.state = (Number(seed) >>> 0) || 1; }
  Next() {
    let value = this.state += 0x6D2B79F5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    this.state >>>= 0;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  }
  Int(min, max) { return min + Math.floor(this.Next() * (max - min + 1)); }
  Pick(list) { return list[Math.floor(this.Next() * list.length)]; }
}

export function Clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function Copy(value) { return JSON.parse(JSON.stringify(value)); }

function MakeAdvisor(template) {
  return { ...Copy(template), fatigue: 0, assignments: 0, revealed: template.trust >= 72, unavailableUntil: -1 };
}

function MakeRegion(template) {
  return { ...Copy(template), prepared: 0, timesActed: 0, lastAction: null };
}

export function CreateGame(seed = Date.now()) {
  const rng = new Rng(seed);
  const state = {
    version: config.saveVersion,
    seed: Number(seed) >>> 0,
    rngState: rng.state,
    turn: 0,
    over: false,
    result: null,
    resources: { support: 58, grain: 11, organization: 10, intelligence: 3, exposure: 3 },
    regions: regionTemplates.map(MakeRegion),
    advisors: advisorTemplates.map(MakeAdvisor),
    policy: "conceal",
    policyChangedTurn: -1,
    orders: [],
    pendingEventId: turnEvents[0].id,
    seenEvents: [],
    activeThreat: null,
    lowSupportTurns: 0,
    zeroOrganizationTurns: 0,
    stats: {
      orders: 0,
      exceptionalOrders: 0,
      mixedOrders: 0,
      setbacks: 0,
      disruptions: 0,
      peopleProtected: 0,
      recordsPreserved: 0,
      promisesKept: 0,
      networksLost: 0,
      sweepsWeathered: 0,
    },
    flags: {},
    chronicle: [{ date: campaignDates[0], text: "你接过岳北县联席议事处。宏观史实固定，本局人物与县域均为虚构复合。" }],
    lastReport: [],
    lastResolvedDate: null,
    reportPending: false,
  };
  return state;
}

export function GetRegion(state, id) { return state.regions.find(region => region.id === id) || null; }
export function GetAdvisor(state, id) { return state.advisors.find(advisor => advisor.id === id) || null; }
export function GetAction(id) { return actions[id] || null; }
export function GetPolicy(id) { return policies[id] || null; }
export function GetEvent(state) { return turnEvents.find(event => event.id === state.pendingEventId) || null; }

export function ConnectedRegions(state) { return state.regions.filter(region => region.network > 0); }

export function TrustLabel(trust) {
  if (trust >= 85) return "生死相托";
  if (trust >= 72) return "信赖";
  if (trust >= 48) return "合作";
  if (trust >= 30) return "观望";
  return "疏离";
}

export function RegionLevelLabel(value, type) {
  const labels = {
    livelihood: ["凋敝", "吃紧", "维持", "安稳"],
    network: ["失联", "暗线", "联络", "成网"],
    danger: ["低", "警戒", "封锁", "高危"],
    defense: ["无准备", "基础", "稳固", "严密"],
  };
  return labels[type]?.[Clamp(Math.round(value), 0, 3)] ?? String(value);
}

function ResourceMax(key) {
  return {
    support: config.supportMax,
    grain: config.grainMax,
    organization: config.organizationMax,
    intelligence: config.intelligenceMax,
    exposure: config.exposureMax,
  }[key];
}

function ChangeResource(state, key, amount) {
  const max = ResourceMax(key);
  state.resources[key] = Clamp(state.resources[key] + amount, 0, max);
}

function ChangeTrust(state, id, amount) {
  const advisor = GetAdvisor(state, id);
  if (!advisor) return;
  advisor.trust = Clamp(advisor.trust + amount, 0, config.trustMax);
  if (advisor.trust >= 72) advisor.revealed = true;
}

function ChangeRegion(region, changes) {
  for (const [key, amount] of Object.entries(changes)) {
    if (["livelihood", "network", "danger", "defense"].includes(key)) {
      region[key] = Clamp(region[key] + amount, 0, config.regionLevelMax);
    } else if (key === "support") {
      region.support = Clamp(region.support + amount, 0, 100);
    } else if (key === "prepared") {
      region.prepared = Clamp(region.prepared + amount, 0, 4);
    }
  }
}

function ApplyEffects(state, effects = {}) {
  for (const [key, amount] of Object.entries(effects.resources || {})) ChangeResource(state, key, amount);
  for (const [id, amount] of Object.entries(effects.trust || {})) ChangeTrust(state, id, amount);
  if (effects.allTrust) for (const advisor of state.advisors) ChangeTrust(state, advisor.id, effects.allTrust);
  if (effects.allFatigue) for (const advisor of state.advisors) advisor.fatigue = Clamp(advisor.fatigue + effects.allFatigue, 0, config.fatigueMax);
  for (const [id, amount] of Object.entries(effects.advisorFatigue || {})) {
    const advisor = GetAdvisor(state, id);
    if (advisor) advisor.fatigue = Clamp(advisor.fatigue + amount, 0, config.fatigueMax);
  }
  for (const [id, changes] of Object.entries(effects.regions || {})) {
    const region = GetRegion(state, id);
    if (region) ChangeRegion(region, changes);
  }
  for (const [key, amount] of Object.entries(effects.stats || {})) state.stats[key] = (state.stats[key] || 0) + amount;
  Object.assign(state.flags, effects.flags || {});
  if (effects.threat) state.activeThreat = Copy(effects.threat);
  if (effects.chronicle) state.chronicle.push({ date: campaignDates[state.turn], text: effects.chronicle });
}

export function ChooseEvent(state, choiceId) {
  if (state.over) return { ok: false, reason: "战役已经结束。" };
  const event = GetEvent(state);
  if (!event) return { ok: false, reason: "当前没有待处理事件。" };
  const choice = event.choices.find(item => item.id === choiceId);
  if (!choice) return { ok: false, reason: "无效的事件选择。" };
  ApplyEffects(state, choice.effects);
  state.seenEvents.push(event.id);
  state.pendingEventId = null;
  return { ok: true, event, choice };
}

function PlannedCosts(state) {
  const costs = { grain: 0, organization: 0, intelligence: 0 };
  for (const order of state.orders) {
    const action = GetAction(order.actionId);
    for (const [key, amount] of Object.entries(action.cost || {})) costs[key] = (costs[key] || 0) + amount;
  }
  if (state.policy === "mobilize") costs.grain += 1;
  return costs;
}

export function CanPlanOrder(state, regionId, actionId, advisorId) {
  if (state.over) return { ok: false, reason: "战役已经结束。" };
  if (state.pendingEventId) return { ok: false, reason: "先处理本回合事件。" };
  if (state.orders.length >= config.ordersPerTurn) return { ok: false, reason: "本回合两道命令已满。" };
  const region = GetRegion(state, regionId);
  const action = GetAction(actionId);
  const advisor = GetAdvisor(state, advisorId);
  if (!region || !action || !advisor) return { ok: false, reason: "地区、行动或牵头人无效。" };
  if (state.orders.some(order => order.regionId === regionId)) return { ok: false, reason: `${region.name}本回合已有一道命令，请选择其他节点。` };
  if (state.orders.some(order => order.advisorId === advisorId)) return { ok: false, reason: `${advisor.name}本回合已经领命。` };
  if (advisor.fatigue >= config.fatigueMax || advisor.unavailableUntil > state.turn) return { ok: false, reason: `${advisor.name}需要休整。` };
  const currentCosts = PlannedCosts(state);
  for (const [key, amount] of Object.entries(action.cost || {})) {
    if (state.resources[key] < (currentCosts[key] || 0) + amount) return { ok: false, reason: `${key === "grain" ? "粮秣" : key === "organization" ? "组织力" : "情报"}不足。` };
  }
  return { ok: true };
}

export function PlanOrder(state, regionId, actionId, advisorId) {
  const check = CanPlanOrder(state, regionId, actionId, advisorId);
  if (!check.ok) return check;
  const order = { id: `${state.turn}_${state.orders.length}_${regionId}_${actionId}`, regionId, actionId, advisorId };
  state.orders.push(order);
  return { ok: true, order };
}

export function CancelOrder(state, orderId) {
  const index = state.orders.findIndex(order => order.id === orderId);
  if (index < 0) return { ok: false, reason: "没有找到这道命令。" };
  const [order] = state.orders.splice(index, 1);
  return { ok: true, order };
}

export function ChangePolicy(state, policyId) {
  if (state.over) return { ok: false, reason: "战役已经结束。" };
  const policy = GetPolicy(policyId);
  if (!policy) return { ok: false, reason: "方略无效。" };
  if (state.pendingEventId) return { ok: false, reason: "先处理本回合事件。" };
  if (state.orders.length) return { ok: false, reason: "已有命令后不能再改方略。" };
  if (state.policyChangedTurn === state.turn) return { ok: false, reason: "本回合已经调整过方略。" };
  if (state.policy === policyId) return { ok: false, reason: "这已经是当前方略。" };
  state.policy = policyId;
  state.policyChangedTurn = state.turn;
  ChangeTrust(state, policy.advocate, 2);
  state.chronicle.push({ date: campaignDates[state.turn], text: `联席议事处将本阶段方略调整为“${policy.name}”。` });
  return { ok: true, policy };
}

function TraitBonus(state, advisor, action) {
  const traits = new Set(advisor.traits);
  let bonus = 0;
  if (traits.has("steadfast") && ["intelligence", "evacuate"].includes(action.id) && state.activeThreat) bonus += 10;
  if (traits.has("prudent") && ["production", "unitedFront", "intelligence"].includes(action.id)) bonus += 8;
  if (traits.has("mediator") && action.id === "unitedFront") bonus += 11;
  if (traits.has("bold") && ["sabotage", "militia"].includes(action.id)) bonus += 11;
  if (traits.has("protective") && action.id === "evacuate") bonus += 10;
  if (traits.has("organizer") && ["production", "organize"].includes(action.id)) bonus += 10;
  if (traits.has("compassionate") && ["production", "medical", "evacuate"].includes(action.id)) bonus += 10;
  if (traits.has("teacher") && ["organize", "medical"].includes(action.id)) bonus += 8;
  if (traits.has("idealist") && state.resources.support >= 65 && ["organize", "medical"].includes(action.id)) bonus += 6;
  if (traits.has("discreet") && ["intelligence", "evacuate"].includes(action.id)) bonus += 12;
  if (traits.has("connected") && ["unitedFront", "intelligence"].includes(action.id)) bonus += 10;
  return bonus;
}

function OrderScore(state, advisor, action, region, rng) {
  const stat = advisor.stats[action.skill];
  let score = stat * 7 + advisor.trust * .24 + state.resources.intelligence * 1.5 + TraitBonus(state, advisor, action);
  score -= advisor.fatigue * (advisor.traits.includes("weary") ? 11 : 8);
  score -= region.danger * (action.skill === "governance" ? 3 : 1);
  if (state.policy === "disrupt" && ["sabotage", "militia"].includes(action.id)) score += 10;
  if (state.policy === "conceal" && ["intelligence", "evacuate"].includes(action.id)) score += 5;
  score += rng.Int(-11, 11);
  return score;
}

function OutcomeTier(score, difficulty) {
  const margin = score - difficulty;
  if (margin >= 24) return "exceptional";
  if (margin >= 0) return "success";
  if (margin >= -15) return "mixed";
  return "setback";
}

function OutcomeMultiplier(tier) {
  return { exceptional: 1.35, success: 1, mixed: .55, setback: -.25 }[tier];
}

function RoundedEffect(value, multiplier) {
  const raw = value * multiplier;
  if (raw > 0) return Math.max(1, Math.round(raw));
  if (raw < 0) return Math.min(-1, Math.round(raw));
  return 0;
}

function ApplyOrderAction(state, action, advisor, region, tier) {
  let multiplier = OutcomeMultiplier(tier);
  const positivePolicy = state.policy === "mobilize" && ["production", "organize", "unitedFront", "medical"].includes(action.id);
  if (positivePolicy && multiplier > 0) multiplier *= 1.2;
  if (state.policy === "conceal" && ["production", "organize"].includes(action.id) && multiplier > 0) multiplier *= .9;
  if (state.policy === "disrupt" && ["sabotage", "militia"].includes(action.id) && multiplier > 0) multiplier *= 1.25;

  const before = Copy({ resources: state.resources, region });
  switch (action.id) {
    case "production":
      ChangeRegion(region, { livelihood: RoundedEffect(1, multiplier), support: RoundedEffect(5, multiplier) });
      const grainMultiplier = state.policy === "mobilize" ? OutcomeMultiplier(tier) : multiplier;
      ChangeResource(state, "grain", RoundedEffect(3, grainMultiplier));
      ChangeResource(state, "support", RoundedEffect(2, multiplier));
      state.stats.peopleProtected += multiplier > 0 ? Math.round(5 * multiplier) : 0;
      break;
    case "organize":
      ChangeRegion(region, { network: RoundedEffect(1, multiplier), support: RoundedEffect(9, multiplier) });
      ChangeResource(state, "support", RoundedEffect(3, multiplier));
      ChangeResource(state, "organization", multiplier >= 1.3 ? 1 : 0);
      break;
    case "unitedFront":
      ChangeRegion(region, { support: RoundedEffect(7, multiplier), network: multiplier >= 1 ? 1 : 0 });
      ChangeResource(state, "organization", multiplier >= 1.3 ? 2 : multiplier > 0 ? 1 : -1);
      if (advisor.traits.includes("mediator") || advisor.traits.includes("connected")) {
        for (const member of state.advisors) if (member.id !== advisor.id && member.trust < 65) ChangeTrust(state, member.id, multiplier > 0 ? 1 : -1);
      }
      break;
    case "medical":
      ChangeRegion(region, { livelihood: RoundedEffect(1, multiplier), support: RoundedEffect(7, multiplier) });
      ChangeResource(state, "support", RoundedEffect(2, multiplier));
      if (multiplier > 0) for (const member of state.advisors) member.fatigue = Math.max(0, member.fatigue - 1);
      state.stats.peopleProtected += multiplier > 0 ? Math.round(9 * multiplier) : 0;
      break;
    case "intelligence":
      ChangeResource(state, "intelligence", RoundedEffect(2, multiplier));
      ChangeResource(state, "exposure", multiplier > 0 ? -1 : 1);
      ChangeRegion(region, { prepared: RoundedEffect(1, Math.max(0, multiplier)), danger: multiplier >= 1.3 ? -1 : 0 });
      break;
    case "evacuate":
      ChangeRegion(region, { prepared: RoundedEffect(2, Math.max(0, multiplier)), danger: RoundedEffect(-1, Math.max(0, multiplier)), support: RoundedEffect(3, multiplier) });
      ChangeResource(state, "exposure", multiplier > 0 ? -1 : 1);
      state.stats.peopleProtected += multiplier > 0 ? Math.round(16 * multiplier) : 0;
      break;
    case "sabotage": {
      ChangeRegion(region, { danger: RoundedEffect(-1, Math.max(0, multiplier)), support: RoundedEffect(4, multiplier) });
      let exposure = multiplier > 0 ? (tier === "exceptional" ? 1 : 2) : 2;
      if (state.policy === "conceal") exposure = Math.max(1, Math.round(exposure * .7));
      if (state.policy === "disrupt") exposure += 1;
      if (advisor.traits.includes("bold")) exposure += 1;
      ChangeResource(state, "exposure", exposure);
      if (multiplier > 0) state.stats.disruptions += tier === "exceptional" ? 2 : 1;
      break;
    }
    case "militia": {
      ChangeRegion(region, { defense: RoundedEffect(1, Math.max(0, multiplier)), network: multiplier >= 1.3 ? 1 : 0, support: RoundedEffect(3, multiplier) });
      let exposure = multiplier > 0 ? 1 : 2;
      if (state.policy === "conceal") exposure = Math.max(0, Math.round(exposure * .7));
      if (state.policy === "disrupt") exposure += 1;
      ChangeResource(state, "exposure", exposure);
      break;
    }
  }
  region.timesActed += 1;
  region.lastAction = action.id;
  return { before, after: Copy({ resources: state.resources, region }) };
}

function DescribeOutcome(tier, action, advisor, region) {
  const labels = { exceptional: "卓有成效", success: "执行稳妥", mixed: "有得有失", setback: "执行受挫" };
  const detail = {
    exceptional: `${advisor.name}充分发挥了自身特质，${action.name}在${region.short}形成了超出预期的效果。`,
    success: `${advisor.name}在${region.short}完成了${action.name}，预定目标基本达到。`,
    mixed: `${advisor.name}推进了${action.name}，但封锁、疲劳或地方条件削弱了结果。`,
    setback: `${action.name}没有按计划展开。人员及时撤回，没有用随机死亡惩罚一次失败。`,
  };
  return { title: `${action.name} · ${labels[tier]}`, text: detail[tier], tone: tier === "setback" ? "loss" : tier === "mixed" ? "mixed" : "good" };
}

function SpendOrderCosts(state, action) {
  for (const [key, amount] of Object.entries(action.cost || {})) ChangeResource(state, key, -amount);
}

function ResolveEnemyPhase(state, rng, report) {
  const exposure = state.resources.exposure;
  const threat = state.activeThreat;
  let target;
  let strength;
  let name;
  if (threat) {
    target = GetRegion(state, threat.target) || rng.Pick(state.regions);
    strength = threat.strength;
    name = threat.name;
  } else {
    const weighted = [];
    for (const region of state.regions) {
      const weight = 1 + region.danger + Math.floor(exposure / 4) + (region.lastAction === "sabotage" ? 2 : 0);
      for (let index = 0; index < weight; index++) weighted.push(region);
    }
    target = rng.Pick(weighted);
    strength = 1 + Math.floor(state.turn / 6) + (exposure >= 7 ? 1 : 0);
    name = exposure >= 7 ? "定点清查" : "据点外出搜捕";
  }

  const protectedServiceBonus = state.flags.protectedServices ? 1 : 0;
  const readiness = target.prepared + target.defense + Math.floor(state.resources.intelligence / 3) + (state.policy === "conceal" ? 1 : 0) + protectedServiceBonus;
  const gap = strength - readiness;
  if (gap <= 0) {
    report.push({ title: `${name} · 及时避开`, text: `${target.name}依靠预警、疏散与掩护保存了人员和联系。敌军行动并未找到主要目标。`, tone: "good", delta: `准备 ${readiness} ≥ 压力 ${strength}` });
    state.stats.peopleProtected += 12 + strength * 3;
    state.stats.sweepsWeathered += threat ? 1 : 0;
    ChangeRegion(target, { danger: threat ? -1 : 0 });
  } else {
    const supportLoss = 2 + gap * 2;
    const hadNetwork = target.network;
    ChangeRegion(target, { support: -supportLoss, danger: 1, network: gap >= 2 ? -1 : 0, livelihood: gap >= 3 ? -1 : 0 });
    ChangeResource(state, "support", -Math.ceil(gap / 2));
    ChangeResource(state, "organization", gap >= 3 ? -1 : 0);
    if (hadNetwork > 0 && target.network === 0) state.stats.networksLost += 1;
    report.push({ title: `${name} · 联系受损`, text: `${target.name}的准备不足以完全避开清查。群众联系和民生遭受损失；暴行责任始终属于侵略者。`, tone: "loss", delta: `准备 ${readiness} < 压力 ${strength}` });
  }
  target.prepared = Math.max(0, target.prepared - Math.max(1, threat ? 2 : 1));
  if (threat) ChangeResource(state, "exposure", -1);
  state.activeThreat = null;
}

function ResolveUpkeep(state, rng, report) {
  const totalLivelihood = state.regions.reduce((sum, region) => sum + region.livelihood, 0);
  const connected = ConnectedRegions(state).length;
  let grainChange = Math.floor(totalLivelihood / 8) - 1;
  if (state.policy === "mobilize") grainChange -= 1;
  if (state.flags.streamlined) grainChange += 1;
  ChangeResource(state, "grain", grainChange);

  if (connected >= 6) ChangeResource(state, "organization", 1);
  if (connected <= 3) ChangeResource(state, "organization", -1);
  const averageLocalSupport = state.regions.reduce((sum, region) => sum + region.support, 0) / state.regions.length;
  if (averageLocalSupport >= 65) ChangeResource(state, "support", 1);
  if (state.resources.grain === 0) {
    ChangeResource(state, "support", -5);
    report.push({ title: "粮秣见底", text: "机关、伤员与转移群众的口粮无法维持，民心开始受损。", tone: "loss", delta: "民心 -5" });
  }

  const naturalExposureDrop = state.policy === "conceal" ? 2 : 1;
  ChangeResource(state, "exposure", -naturalExposureDrop);

  for (const region of state.regions) {
    if (rng.Next() < .15 + state.turn * .006 && region.danger < 3 && region.prepared === 0) region.danger += 1;
    if (region.lastAction !== "production" && region.livelihood === 0) region.support = Clamp(region.support - 2, 0, 100);
    region.lastAction = null;
  }
}

function UpdateFatigue(state, assignedIds, orderTiers) {
  for (const advisor of state.advisors) {
    if (assignedIds.has(advisor.id)) {
      const tier = orderTiers.get(advisor.id);
      const amount = tier === "setback" ? 2 : 1;
      advisor.fatigue = Clamp(advisor.fatigue + amount, 0, config.fatigueMax);
      advisor.assignments += 1;
    } else {
      advisor.fatigue = Math.max(0, advisor.fatigue - 1);
    }
  }
}

function CheckDefeat(state) {
  if (state.resources.support < 20) state.lowSupportTurns += 1;
  else state.lowSupportTurns = 0;
  if (state.resources.organization === 0) state.zeroOrganizationTurns += 1;
  else state.zeroOrganizationTurns = 0;

  let reason = null;
  if (state.lowSupportTurns >= 2) reason = "连续两个回合民心低于20，基层公信已经无法维持。";
  if (state.zeroOrganizationTurns >= 2) reason = "组织力连续两个回合归零，联席机关失去执行能力。";
  if (ConnectedRegions(state).length === 0) reason = "七个节点全部失联，地方网络暂时瓦解。";
  if (reason) {
    state.over = true;
    state.result = { ...BuildEnding(state), type: "collapse", title: "地方网络瓦解", reason };
  }
}

function BuildEnding(state) {
  const connected = ConnectedRegions(state).length;
  const stableLivelihood = state.regions.filter(region => region.livelihood >= 2).length;
  const trusted = state.advisors.filter(advisor => advisor.trust >= 72).length;
  const criteria = {
    peopleRooted: stableLivelihood >= 5,
    networkIntact: connected >= 7,
    sharedPurpose: trusted >= 5,
    mountainKeepsFaith: state.stats.recordsPreserved > 0 && state.stats.peopleProtected >= 80,
  };
  const minimum = connected >= 4 && state.resources.support >= 45 && state.resources.organization >= 3;
  if (!minimum) {
    const missing = [];
    if (connected < 4) missing.push("保持联系的节点不足四处");
    if (state.resources.support < 45) missing.push("民心低于45");
    if (state.resources.organization < 3) missing.push("组织力低于3");
    return {
      type: "fragile",
      title: "火种微明",
      reason: `岳北县没有完全瓦解，但${missing.join("、")}。接下来的恢复会格外艰难。`,
      criteria,
    };
  }
  const achieved = Object.values(criteria).filter(Boolean).length;
  return {
    type: "survived",
    title: achieved >= 3 ? "山河有信" : achieved >= 1 ? "人在，根在" : "火种未熄",
    reason: "你守住的是一段地方网络，而不是战争的终点。抗战仍将继续。",
    criteria,
  };
}

export function ResolveTurn(state) {
  if (state.over) return { ok: false, reason: "战役已经结束。" };
  if (state.pendingEventId) return { ok: false, reason: "先处理本回合事件。" };
  if (state.orders.length !== config.ordersPerTurn) return { ok: false, reason: `本回合还需要${config.ordersPerTurn - state.orders.length}道命令。` };
  const errors = InvariantChecks(state);
  if (errors.length) return { ok: false, reason: errors[0] };

  const rng = new Rng(state.rngState);
  const report = [];
  const resolvedDate = campaignDates[state.turn];
  const assignedIds = new Set();
  const orderTiers = new Map();

  for (const order of state.orders) {
    const action = GetAction(order.actionId);
    const advisor = GetAdvisor(state, order.advisorId);
    const region = GetRegion(state, order.regionId);
    SpendOrderCosts(state, action);
    const score = OrderScore(state, advisor, action, region, rng);
    const tier = OutcomeTier(score, action.difficulty);
    ApplyOrderAction(state, action, advisor, region, tier);
    const relationChange = tier === "exceptional" ? 4 : tier === "success" ? 2 : tier === "mixed" ? 0 : -3;
    ChangeTrust(state, advisor.id, advisor.traits.includes("direct") && relationChange !== 0 ? relationChange + Math.sign(relationChange) : relationChange);
    const description = DescribeOutcome(tier, action, advisor, region);
    description.delta = `${advisor.name} · ${region.short}`;
    report.push(description);
    assignedIds.add(advisor.id);
    orderTiers.set(advisor.id, tier);
    state.stats.orders += 1;
    if (tier === "exceptional") state.stats.exceptionalOrders += 1;
    if (tier === "mixed") state.stats.mixedOrders += 1;
    if (tier === "setback") state.stats.setbacks += 1;
  }

  UpdateFatigue(state, assignedIds, orderTiers);
  ResolveEnemyPhase(state, rng, report);
  ResolveUpkeep(state, rng, report);
  state.rngState = rng.state;
  state.lastReport = Copy(report);
  state.lastResolvedDate = resolvedDate;
  state.reportPending = true;
  state.orders = [];

  CheckDefeat(state);
  if (!state.over && state.turn >= config.totalTurns - 1) {
    state.over = true;
    state.result = BuildEnding(state);
  }

  if (!state.over) {
    state.turn += 1;
    state.pendingEventId = turnEvents[state.turn]?.id || null;
  }
  return { ok: true, report, resolvedDate, over: state.over, result: state.result };
}

export function GetEnding(state) { return state.result || BuildEnding(state); }

export function InvariantChecks(state) {
  const errors = [];
  if (!state || typeof state !== "object") return ["存档数据无效。"];
  if (state.version !== config.saveVersion) errors.push("存档版本无效。 ");
  if (!Number.isInteger(state.turn) || state.turn < 0 || state.turn >= config.totalTurns) errors.push("回合编号越界。 ");
  if (!Number.isInteger(state.rngState) || state.rngState < 0) errors.push("随机状态无效。 ");
  const resourceKeys = ["support", "grain", "organization", "intelligence", "exposure"];
  for (const key of resourceKeys) {
    const value = state.resources?.[key];
    if (!Number.isFinite(value) || value < 0 || value > ResourceMax(key)) errors.push(`${key}资源越界。`);
  }
  if (state.regions?.length !== regionTemplates.length) errors.push("地区节点数量不正确。 ");
  if (state.advisors?.length !== advisorTemplates.length) errors.push("联席成员数量不正确。 ");
  const regionIds = new Set();
  for (const region of state.regions || []) {
    if (regionIds.has(region.id)) errors.push(`地区${region.id}重复。`);
    regionIds.add(region.id);
    if (![region.livelihood, region.network, region.danger, region.defense].every(value => Number.isFinite(value) && value >= 0 && value <= 3)) errors.push(`${region.id}地区状态越界。`);
    if (!Number.isFinite(region.support) || region.support < 0 || region.support > 100) errors.push(`${region.id}地区民心越界。`);
  }
  const advisorIds = new Set();
  for (const advisor of state.advisors || []) {
    if (advisorIds.has(advisor.id)) errors.push(`人物${advisor.id}重复。`);
    advisorIds.add(advisor.id);
    if (!Number.isFinite(advisor.trust) || advisor.trust < 0 || advisor.trust > 100) errors.push(`${advisor.id}信任越界。`);
    if (!Number.isFinite(advisor.fatigue) || advisor.fatigue < 0 || advisor.fatigue > 3) errors.push(`${advisor.id}疲劳越界。`);
  }
  if (!policies[state.policy]) errors.push("当前方略无效。 ");
  if (!Number.isInteger(state.policyChangedTurn) || state.policyChangedTurn < -1 || state.policyChangedTurn >= config.totalTurns) errors.push("方略回合标记无效。 ");
  if (!Array.isArray(state.orders)) errors.push("命令列表无效。 ");
  if ((state.orders || []).length > config.ordersPerTurn) errors.push("命令数量超过上限。 ");
  const assignedIds = new Set();
  const assignedRegions = new Set();
  for (const order of state.orders || []) {
    if (!GetRegion(state, order.regionId) || !GetAction(order.actionId) || !GetAdvisor(state, order.advisorId)) errors.push("命令引用无效。 ");
    if (assignedIds.has(order.advisorId)) errors.push("同一人物被重复派遣。 ");
    if (assignedRegions.has(order.regionId)) errors.push("同一地区被重复安排命令。 ");
    assignedIds.add(order.advisorId);
    assignedRegions.add(order.regionId);
  }
  const seenEventIds = Array.isArray(state.seenEvents) ? state.seenEvents : [];
  if (state.pendingEventId && !turnEvents.some(event => event.id === state.pendingEventId)) errors.push("待处理事件无效。 ");
  if (!Array.isArray(state.seenEvents) || seenEventIds.some(id => !turnEvents.some(event => event.id === id))) errors.push("已处理事件记录无效。 ");
  if (seenEventIds.some((id, index) => id !== turnEvents[index]?.id)) errors.push("已处理事件顺序无效。 ");
  if (!state.over && state.pendingEventId && state.pendingEventId !== turnEvents[state.turn]?.id) errors.push("待处理事件与当前回合不匹配。 ");
  if (!state.over && !state.pendingEventId && !seenEventIds.includes(turnEvents[state.turn]?.id)) errors.push("当前回合事件状态不完整。 ");
  if (state.pendingEventId && seenEventIds.includes(state.pendingEventId)) errors.push("同一事件不能同时为已处理和待处理。 ");
  if (!Array.isArray(state.chronicle) || state.chronicle.some(entry => typeof entry?.date !== "string" || typeof entry?.text !== "string")) errors.push("抗战纪事记录无效。 ");
  if (!Array.isArray(state.lastReport) || typeof state.reportPending !== "boolean" || (state.lastResolvedDate !== null && typeof state.lastResolvedDate !== "string")) errors.push("回合报告状态无效。 ");
  if (state.reportPending === true && (!Array.isArray(state.lastReport) || !state.lastReport.length || typeof state.lastResolvedDate !== "string")) errors.push("待确认回合报告不完整。 ");
  if (!state.flags || typeof state.flags !== "object" || Array.isArray(state.flags)) errors.push("战役标记无效。 ");
  const statKeys = ["orders", "exceptionalOrders", "mixedOrders", "setbacks", "disruptions", "peopleProtected", "recordsPreserved", "promisesKept", "networksLost", "sweepsWeathered"];
  if (!state.stats || statKeys.some(key => !Number.isFinite(state.stats[key]) || state.stats[key] < 0)) errors.push("战役统计无效。 ");
  if (![state.lowSupportTurns, state.zeroOrganizationTurns].every(value => Number.isInteger(value) && value >= 0)) errors.push("失败预警计数无效。 ");
  if (state.activeThreat && (!GetRegion(state, state.activeThreat.target) || typeof state.activeThreat.name !== "string" || !Number.isFinite(state.activeThreat.strength) || state.activeThreat.strength < 0)) errors.push("敌情预警无效。 ");
  if (typeof state.over !== "boolean" || (state.over && !state.result)) errors.push("结局状态无效。 ");
  return errors;
}

export function SerializeGame(state) {
  const errors = InvariantChecks(state);
  if (errors.length) throw new Error(errors[0]);
  return JSON.stringify({ version: config.saveVersion, state });
}

export function DeserializeGame(raw) {
  try {
    const payload = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (payload?.version !== config.saveVersion || !payload.state) return null;
    const state = Copy(payload.state);
    if (InvariantChecks(state).length) return null;
    return state;
  } catch {
    return null;
  }
}
