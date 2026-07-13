export const designPrinciples = Object.freeze([
  {
    title: "统筹视角是教学性抽象",
    body: "玩家代表分散敌后工作网络的抽象统筹视角，并非历史上真实存在、能够即时指挥所有区域的单一机关。各根据地的隶属关系、形成时间和作战环境均有差异。",
  },
  {
    title: "节点不是领土",
    body: "区域等级只表示联络、群众工作与自我维持能力，不表示行政归属或领土占领。敌军控制的铁路、公路只能被暂时破袭，随后会被修复。",
  },
  {
    title: "群众安全不可消费",
    body: "游戏不把平民、伤亡或历史暴行设计成可兑换收益的资源。群众安全是必须保护的底线；反扫荡的首要目标是保存群众、交通与有生力量。",
  },
  {
    title: "宏观历史不会被改写",
    body: "百团大战、1942年敌后困难局面、1944年局部反攻和1945年日本投降等历史时点固定发生。玩家只能改变所统筹网络的保存与贡献，不能提前结束战争。",
  },
  {
    title: "全民族抗战",
    body: "中国共产党领导的八路军、新四军是敌后战场的中坚力量；国民政府军及其他抗日力量也付出了重大牺牲。胜利属于长期坚持抗战的全体中国人民，并与世界反法西斯战争进程相连。",
  },
]);

export const timelineEntries = Object.freeze([
  {
    year: "1931—1937 · 前史",
    title: "十四年抗战与全民族抗战",
    body: "九一八事变开启中国人民十四年抗战；1937年七七事变后，全民族抗战开始。游戏从1938年冬进入可玩阶段，并不把1937年误写成整个抗战的起点。",
    sourceIds: ["WarChronology", "EnemyRearOverview"],
  },
  {
    year: "1938 · 冬",
    title: "战争进入战略相持阶段",
    body: "武汉、广州失守后，中国抗日战争进入战略相持阶段。八路军、新四军等力量继续深入敌后，建立和发展抗日根据地。",
    sourceIds: ["WarChronology", "EnemyRearOverview"],
  },
  {
    year: "1939",
    title: "交通线封锁与“囚笼政策”",
    body: "侵华日军在华北依托铁路、公路、据点和碉堡加强分割封锁，敌后军民以破袭交通、建立交通站和群众掩护维持联系。",
    sourceIds: ["CagePolicy", "SecretTraffic"],
  },
  {
    year: "1940 · 8—12月",
    title: "百团大战",
    body: "八路军在华北发动大规模交通破袭和攻坚作战，重点破坏正太铁路等交通线。战役对日军交通体系造成冲击，也使敌后根据地随后承受更严酷的报复性“扫荡”。",
    sourceIds: ["WarChronology", "HundredRegiments"],
  },
  {
    year: "1941—1942",
    title: "敌后战场最困难时期",
    body: "侵华日军持续强化“治安战”、封锁、蚕食和反复“扫荡”；根据地同时面临物资紧缺与自然灾害等困难。精兵简政、生产自救、减租减息和群众防护成为坚持的重要工作。",
    sourceIds: ["HardYears", "ProductionCampaign", "WarChronology"],
  },
  {
    year: "1942 · 5月",
    title: "冀中“五一大扫荡”",
    body: "侵华日军对冀中抗日根据地发动大规模“扫荡”，依托据点、封锁沟墙与快速合围破坏根据地。军民以分散转移、地道和群众掩护等方式坚持斗争，付出重大牺牲。",
    sourceIds: ["WarChronology", "MaySweep"],
  },
  {
    year: "1943—1944",
    title: "恢复与局部反攻",
    body: "敌后军民逐步克服严重困难，根据地得到恢复和发展，并在多地展开攻势作战。1944年日军“一号作战”主要冲击正面战场，不应被表述为敌后战场单独决定战局。",
    sourceIds: ["WarChronology", "Counteroffensive"],
  },
  {
    year: "1945 · 8—9月",
    title: "抗日战争胜利",
    body: "8月15日，日本宣布接受《波茨坦公告》；9月2日，日本代表签署投降书。中国人民抗日战争与世界反法西斯战争取得伟大胜利。",
    sourceIds: ["SurrenderTimeline", "NationalArchives"],
  },
]);

export const guideSections = Object.freeze([
  {
    title: "一季做什么",
    body: "每个季度有2次部署。先看敌情预判，再选择区域与骨干队，下达开辟联络、扎根建设、侦察交通、交通破袭、隐蔽转移或生产救护命令，最后结束本季并结算敌方行动。",
  },
  {
    title: "怎样扩展网络",
    body: "派相邻区域的骨干队开辟失联节点，再用扎根建设提升网络等级和群众信任。连得太快会增加暴露；高暴露区域更容易成为封锁和扫荡目标。",
  },
  {
    title: "怎样应对扫荡",
    body: "侦察能积累情报并提前看清目标。确认预警后，及时隐蔽转移可降低暴露、掩护群众；地形、隐蔽所和群众信任也会降低损失。正面硬扛通常不是最佳选择。",
  },
  {
    title: "怎样取得好结局",
    body: "1945年历史终点固定到来。结局按网络存续40%、群众安全30%、敌后贡献20%、跨区联络10%综合评分。不要只追求破袭：完整而有群众基础的网络更重要。",
  },
  {
    title: "自动保存与快捷键",
    body: "每次部署和季度结算后都会自动保存到当前浏览器。Esc关闭面板，H打开历史资料，M打开菜单，数字键1—6选择部署命令。",
  },
]);

// 由史实卡使用的来源 ID 与公开网页。所有链接均指向机构或学术来源，
// 不将合成情境冒充为具体历史个案。
export const sourceLinks = Object.freeze([
  {
    id: "WarChronology",
    title: "《中国共产党一百年大事记》抗战时期条目",
    institution: "国家发展和改革委员会转载",
    url: "https://www.ndrc.gov.cn/fggz/fgjh/djzc/202107/t20210702_1285248.html",
    note: "用于核对1931—1945年关键时间点与政策沿革",
  },
  {
    id: "EnemyRearOverview",
    title: "抗日战争大事记",
    institution: "中华人民共和国退役军人事务部",
    url: "https://www.mva.gov.cn/sy/zt/krzzsl75zn/kzdsj/202009/t20200901_41903.html",
    note: "用于交叉核对全民族抗战、敌后展开与胜利时间线",
  },
  {
    id: "NationalArchives",
    title: "中国受降档案专题",
    institution: "国家档案局",
    url: "https://www.saac.gov.cn/zt/sxda/qy.html",
    note: "用于核对1945年8月接受投降与9月签字的区别",
  },
  {
    id: "EighthRouteArmy",
    title: "八路军改称第十八集团军的番号沿革",
    institution: "中共中央党史和文献研究院",
    url: "https://www.dswxyjy.org.cn/n/2014/0814/c244514-25463549.html",
    note: "用于核对1937年改编与常用称谓",
  },
  {
    id: "CagePolicy",
    title: "白晋战役：围绕交通线的破袭作战",
    institution: "中国军网",
    url: "https://www.81.cn/js_208592/jdt_208593/16448160.html",
    note: "用于理解华北铁路、公路、碉堡与据点网的分割封锁",
  },
  {
    id: "HundredRegiments",
    title: "抗战大事记中的百团大战条目",
    institution: "中华人民共和国退役军人事务部",
    url: "https://www.mva.gov.cn/sy/zt/krzzsl75zn/kzdsj/202009/t20200901_41903.html",
    note: "用于核对1940年交通破袭及其历史位置",
  },
  {
    id: "HardYears",
    title: "晋冀鲁豫根据地严重困难局面研究",
    institution: "邯郸党史网",
    url: "https://www.handandangshi.gov.cn/zongheng/905.html",
    note: "涉及财政、贸易、生产与物资困难",
  },
  {
    id: "ProductionCampaign",
    title: "根据地军民开展生产自救",
    institution: "国家发展和改革委员会转载大事记",
    url: "https://www.ndrc.gov.cn/fggz/fgjh/djzc/202107/t20210702_1285248.html",
    note: "用于核对精兵简政、减租减息与生产工作时序",
  },
  {
    id: "MaySweep",
    title: "1942年敌后反“扫荡”相关大事记",
    institution: "中华人民共和国退役军人事务部",
    url: "https://www.mva.gov.cn/sy/zt/krzzsl75zn/kzdsj/202009/t20200901_41903.html",
    note: "用于核对冀中1942年5—6月的高压阶段",
  },
  {
    id: "Counteroffensive",
    title: "正面战场与敌后战场相互配合综述",
    institution: "国家林业和草原局党史学习资料",
    url: "https://www.forestry.gov.cn/c/www/xxyd/641323.jhtml",
    note: "用于避免把全民族抗战简化为单一战场",
  },
  {
    id: "ThreeThirds",
    title: "“三三制”抗日民主政权的制度实践",
    institution: "中国人大网",
    url: "https://www.npc.gov.cn/npc/c2/c30834/202111/t20211118_314824.html",
    note: "用于政策卡与群众工作说明",
  },
  {
    id: "ArmedForcesStructure",
    title: "主力军、地方军和民兵三结合组织体制",
    institution: "中国军网",
    url: "https://www.81.cn/js_208592/16392190.html",
    note: "用于避免把所有敌后武装设计成同质部队",
  },
  {
    id: "SecretTraffic",
    title: "太行秘密交通网络研究",
    institution: "邯郸党史网",
    url: "https://www.handandangshi.gov.cn/yaolun/2671.html",
    note: "用于交通员、秘密交通站和分段接力机制",
  },
  {
    id: "RepairWorkshop",
    title: "大官亭修械所",
    institution: "中国军网",
    url: "https://www.81.cn/bq_208581/9909354.html?big=fan",
    note: "用于军需短缺、缴获修复与根据地自制机制",
  },
  {
    id: "MedicalProduction",
    title: "抗战时期根据地制药工作研究",
    institution: "邯郸党史网",
    url: "https://www.handandangshi.gov.cn/dangshishijian/2683.html",
    note: "用于药品、卫生器材和生产救护事件",
  },
  {
    id: "DisciplineHistory",
    title: "人民军队纪律沿革资料",
    institution: "中华人民共和国国防部",
    url: "https://www.mod.gov.cn/gfbw/gfjy_index/js_214151/4914040.html?big=fan",
    note: "用于避免把1947年统一定型文本无说明地放入1938年",
  },
  {
    id: "JapaneseAntiwar",
    title: "敌后战场中的日本反战人士",
    institution: "中共中央党史和文献研究院",
    url: "https://www.dswxyjy.org.cn/n/2015/0906/c218998-27549120.html",
    note: "用于区分日本军国主义、侵略军与普通日本民众",
  },
  {
    id: "SurrenderTimeline",
    title: "中国人民抗日战争胜利时间线",
    institution: "国家档案局与退役军人事务部资料交叉核对",
    url: "https://www.saac.gov.cn/zt/sxda/qy.html",
    note: "8月15日宣布接受投降，9月2日签署投降书，9月3日为胜利纪念日",
  },
]);

export const situationalNotes = Object.freeze([
  "交通员失联、粮站暴露、伤员转运等随机卡均标注为“情境合成”，用于呈现史实机制，不对应未经核实的具体人物或事件。",
  "游戏中的概率只描述当前行动风险，不代表对真实历史行动成败的量化判断。",
  "“日军”在本文中特指侵华日军；“伪军”指由日本侵略者控制的伪政权武装，二者不是同一组织。",
  "游戏不使用针对民族或普通民众的蔑称；批判对象是日本军国主义与侵略战争。",
]);
