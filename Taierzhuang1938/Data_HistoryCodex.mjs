// Player-facing archive. Contemporary sources, retrospective accounts and game diagrams remain distinct.
// Images are documentary reproductions; the approved Imagegen concepts are layout references only.
export const HISTORY_CODEX_VERSION = "2026101501";
const Image = name => `./Texture/Menu/History/Texture_History${name}Image.webp?v=${HISTORY_CODEX_VERSION}`;
export const HISTORY_CODEX_CATEGORIES = ["people", "history", "documents", "press", "photos", "creation"];
// Fact-and-invention marks, in reading order. Notion "待核" is shown to players as "出处待查", never as a fact.
export const HISTORY_CODEX_MARKS = ["recorded", "similar", "invented", "pending"];
export const HISTORY_CODEX_TUNING = Object.freeze({ zoomMin: 1, zoomMax: 4, zoomStep: .25, wheelStep: .15 });
export const HISTORY_BOOK_TUNING = Object.freeze({ pageWidth: 800, pageHeight: 1200, minPageWidth: 260, maxPageWidth: 1000, turnMs: 720, shadowOpacity: .38, warmRadius: 3, dragThreshold: 5, cornerFraction: .18, swipeCommitFraction: .35, zoomStep: .25, zoomMax: 4, doubleZoom: 2 });

export const HISTORY_CODEX_ENTRIES = [
  {
    id: "WangMingzhang", category: "people", title: "王铭章", subtitle: "1893—1938 · 四川新都",
    summary: "第122师师长。1937年率部出川抗日，1938年3月17日在滕县殉国。",
    image: Image("WangMingzhang"), imageAlt: "1938年《悲壮的滕县之役》刊载的王铭章遗像",
    caption: "1938年原刊遗像 · 拍摄时间未详", role: "第122师师长",
    sections: [
      { title: "生平", text: "王铭章，字之钟，四川新都人。1914年军校毕业后进入川军，历任基层军官与部队主官。1937年率部出川抗日，先在山西作战，后转赴鲁南。" },
      { title: "滕县保卫战", text: "1938年3月，王铭章参与组织滕县防御。3月17日在战斗中殉国。" },
    ],
    timeline: [
      { date: "1893", title: "生于新都" }, { date: "1914", title: "军校毕业" },
      { date: "1937", title: "出川抗日" }, { date: "1938", title: "滕县殉国" },
    ],
    related: ["ZhangMemoir", "WuhanMemorial"],
    sources: [
      { title: "新华社：王铭章——以身殉国为民族争光", url: "https://www.xinhuanet.com/politics/2018-11/04/c_1123659735.htm", note: "人物生平与殉国日期。关于牺牲的具体地点和经过，不同史料仍有分歧，正文保留共同可确认的事实。" },
      { title: "《悲壮的滕县之役》1938年原刊", url: "https://commons.wikimedia.org/wiki/File:NLC416-07jh008596-3580_悲壯的滕縣之役.pdf", note: "文件第10页“王师长遗像”。出版年不等于肖像拍摄年。" },
    ],
  },
  {
    id: "TengxianBattle", category: "history", title: "滕县保卫战始末", subtitle: "1938.03.14—03.18",
    summary: "外围阻击、东关争夺、城内巷战与突围。", imageAlt: "界河至徐州的铁路与城镇关系示意",
    caption: "态势示意 · 不作精确测绘", mapLabels: ["界河", "滕县", "临城", "徐州"],
    sections: [
      { title: "起因", text: "日军沿津浦铁路南进。中国军队在滕县及外围组织防御，阻击日军并掩护后方部署。滕县位于徐州北方通路，铁路关系部队与物资调动。" },
      { title: "经过", text: "战斗由外围阻击转入东关争夺，继而发展为城内巷战。部分守军于夜间突围，零散抵抗延续到18日。" },
      { title: "结果", text: "3月18日，滕县失守。守军付出重大牺牲，部分官兵突围生还。其抵抗对后续战役部署的作用，宜结合整个鲁南战局理解。" },
    ],
    timeline: [
      { date: "3.14", title: "外围阻击", text: "日军攻击外围阵地，并实施迂回，守军的正面防御与后方道路同时受到威胁。" },
      { date: "3.15", title: "城防部署", text: "战斗逼近县城，守军调集部队、修筑工事，将弹药送往城门与预想的突破口。" },
      { date: "3.16", title: "东关争夺", text: "东关缺口与街巷成为反复争夺的重点。守军依托寨墙、民房与院落继续抵抗。" },
      { date: "3.17", title: "城破突围", text: "城防被突破，战斗转入城内。王铭章等将领殉国，部分守军于夜间突围。" },
      { date: "3.18", title: "滕县失守", text: "城内残余抵抗结束，滕县失守。不同资料对局部时刻及人数的记载存在差异。" },
    ],
    sources: [
      { title: "山东地方志：滕县保卫战", url: "https://shandong-chorography.org/database/a/section/17/article/418/", note: "省级地情数据库的公开存档。用于战役整体经过，具体细节与亲历者记述互核。" },
      { title: "张宣武：台儿庄会战的前奏", url: "https://ks3-cn-beijing.ksyun.com/attachment/b1a9f551fb36af74de7926b2ba283874", note: "印刷页61—77，属于亲历者事后回忆。" },
    ],
  },
  {
    id: "ZhangMemoir", category: "documents", title: "台儿庄会战的前奏", subtitle: "张宣武 · 亲历者回忆",
    summary: "守城部署、东关战斗与突围经历。", caption: "印刷页 61—77", image: Image("ZhangMemoir01"),
    imageAlt: "张宣武《台儿庄会战的前奏》扫描原页", firstPrintedPage: 61,
    pages: Array.from({length: 17}, (_, index) => Image(`ZhangMemoir${String(index + 1).padStart(2, "0")}`)),
    sections: [
      { title: "回到守城者的叙述", text: "张宣武时任第727团团长，并兼任滕县城防司令。本文回顾参战部队、守城部署、东关战斗与突围经过。" },
    ],
    contents: [
      { title: "敌我双方的作战兵力", page: 0 }, { title: "守城部署与准备", page: 5 },
      { title: "东关战斗", page: 8 }, { title: "突围经历", page: 15 },
    ],
    sourceNote: "回忆材料 · 与同期档案互核",
    sources: [{ title: "张宣武回忆录扫描原件", url: "https://ks3-cn-beijing.ksyun.com/attachment/b1a9f551fb36af74de7926b2ba283874", note: "印刷页61—77；扫描文件共17页，不把回忆文章标作1938年同期文件。" }],
  },
  {
    id: "SichuanConscription", category: "history", title: "四川征兵与“抓壮丁”", subtitle: "1938—1945 · 战时社会背景",
    summary: "征兵制度、强拉现象与纠弊记录。", image: Image("ConscriptionProcedure"),
    imageAlt: "《四川省志·军事志》第550页的常备兵征送程序图", caption: "地方志整理图 · 非战时原件",
    sections: [
      { title: "入伍并非同一种经历", text: "抗战中，四川向前线输送大量兵员。自愿参军、依法征集和非法强拉同时存在；“壮丁”一词本身不能说明一个人是怎样入伍的。" },
      { title: "制度与执行", text: "《四川省志·军事志》记载了壮丁调查、体检、抽签及交接程序，也记录了强拉、买卖和徇私等弊病。1940年3月的档案目录另载禁止虐待壮丁、严防差役勒索的命令。" },
      { title: "放回各自的年代", text: "四川军管区及统一征募办法在1938年中陆续建立，后续规定仍在变化。此处1940—1945年的材料用于介绍战争期间的社会背景，不代表1938年某位滕县守军的个人经历；征兵总数也不能当作被抓人数。" },
    ],
    timeline: [
      { date: "1938.06", title: "兵役机构", text: "四川军管区于6月1日成立，师、团管区随后设置。地方志所载机构和程序不能不加区别地用于更早的时期。" },
      { date: "1940.03", title: "纠弊记录", text: "3月19日《事略稿本》的馆藏目录记载，蒋中正电贺国光要求改善四川役政，禁止虐待壮丁并防止差役勒索。目录可证这一记录存在，不能据此断言命令已落实。" },
      { date: "1944.04", title: "征集程序", text: "4月12日院字第2676号解释回应四川法院疑问，指出未依法抽签，或已中签而尚未受征集者，也在“不应征集之壮丁”范围内。这是1944年的解释。" },
    ],
    related: ["LeshanConscription1943", "ZhongjiangConscription1945"],
    sources: [
      { title: "《四川省志·军事志》：兵役", url: "https://www.scdfz.org.cn/upload/main/contentmanage/article/file/201702232017118370.pdf", note: "第544、547—550页。图取第550页；地方志为事后整理，原图保留页码。" },
      { title: "国史馆藏《事略稿本》1940年3月19日记录", url: "https://catalog.digitalarchives.tw/item/00/69/51/b9.html", note: "典藏号002-060100-00138-019，数位典藏联合目录。本条依据目录著录，不假称取得电报手稿或完整逐字原文。" },
      { title: "司法院院字第2676号解释：公开转录", url: "https://zh.wikisource.org/wiki/司法院院字第2676號解釋", note: "1944年4月12日；转录所据《司法院解释汇编》第4册第2336页。与国史馆015-010305-0021卷的日期和主题互核，未取得原刊影印。" },
    ],
  },
  {
    id: "LeshanConscription1943", category: "documents", title: "乐山县请求缓征公文", subtitle: "1943年背景 · 四川乐山",
    summary: "旱灾、地方困难与补兵任务。", caption: "战时公文照片 · 晚于滕县战役", image: Image("LeshanConscription1943"),
    imageAlt: "乐山县政府请求暂缓征兵的公文照片", pages: [Image("LeshanConscription1943")],
    sections: [
      { title: "名额与农时", text: "地方文史资料介绍，1943年乐山县面临旱灾和治安困难，县长易民苏曾请求暂缓征兵，第五区也提出核减配额。材料反映兵员需求与地方承受能力之间的矛盾。" },
      { title: "怎样读这张影像", text: "原网页将此图注为乐山县政府延缓征兵的请求。图中文字较小，不能凭它可靠复原全部正文；缓征申请也不能证明所涉兵员都由强拉而来。" },
    ],
    contents: [], sourceNote: "档案照片 · 未确认完整档号与具体发文日",
    sources: [{ title: "魏奕雄：抗战期间乐山向前线输送兵员情况", url: "https://m.krzzjn.com/show-924-92518.html", note: "2019年3月1日公开资料，包含公文照片与1943年缓征叙述。原图400×599像素；未放大补字。" }],
  },
  {
    id: "ZhongjiangConscription1945", category: "documents", title: "中江壮丁待遇代电", subtitle: "1945年5月18日 · 四川中江",
    summary: "关于捆绑押交与新兵生活的战时报告。", caption: "中国第二历史档案馆藏 · 代电局部", image: Image("ZhongjiangConscription1945"),
    imageAlt: "1945年5月18日成都行辕政治部反映中江壮丁待遇的代电局部", pages: [Image("ZhongjiangConscription1945")],
    sections: [
      { title: "公文中的强制与虐待", text: "这份成都行辕政治部致军事委员会政治部的代电，反映四川中江县所驻部队接收壮丁后的处境。档案报道记有捆绑押交、拥挤、疾病及照护不足等问题。" },
      { title: "个案的范围", text: "公开影像只是代电的一部分，不能代替完整卷宗。这是抗战末期的一份地方报告，不据此推定全体川军的入伍经历，也不把它当作1938年滕县战场的现场记录。" },
    ],
    contents: [], sourceNote: "原载《中国档案报》2019年7月26日 · 公开影像未列完整档号",
    sources: [{ title: "童玉汝：抗战时期国民政府征兵黑幕", url: "https://m.krzzjn.com/show-897-132654.html", note: "原载《中国档案报》总第3404期第2版；刊出中国第二历史档案馆藏代电局部。保留原图299×369像素，不将它标为抓丁现场照片。" }],
  },
  {
    id: "XinhuaDaily", category: "press", title: "新华日报", subtitle: "1938年4月8日",
    summary: "《庆祝台儿庄胜利！》", caption: "同期报刊 · 后续战局", image: Image("XinhuaDaily19380408"),
    imageAlt: "1938年4月8日《新华日报》社论版面", headline: "庆祝台儿庄胜利！",
    excerpt: "我们还应该清楚的了解，在军事上我们的胜利，不过是局部的开端，敌人的损失和挫折，也不过是部分的开始。",
    sections: [{ title: "阅读提示", text: "社论在庆祝胜利的同时，提醒读者保持警惕、继续抗战。这份报纸属于台儿庄胜利后的报道，可与滕县战役的后续背景对照阅读。战时报道中的战果数字不直接作为精确统计。" }],
    sourceNote: "影像来源：新华网资料页",
    sources: [{ title: "新华网：同期报纸影像", url: "https://www.xinhuanet.com/mil/2015-06/28/c_127959205_6.htm", note: "网页图注标为1938年4月8日《新华日报》社论；版面影像保留原样。" }],
  },
  {
    id: "WuhanMemorial", category: "photos", title: "武汉公祭王铭章", subtitle: "1938年5月 · 武汉",
    summary: "迎灵与公祭中的举像队伍。", image: Image("WuhanMemorial"),
    imageAlt: "武汉迎灵与公祭期间，队伍举着王铭章遗像", caption: "网络转载影像",
    description: "王铭章殉国后，社会各界参加迎灵与公祭。照片中的队伍举着王铭章遗像。",
    metadata: [{ title: "地点", text: "武汉（汉口）" }, { title: "时间", text: "1938年5月" }, { title: "摄影者", text: "未详" }, { title: "版本", text: "网络转载影像" }],
    sourceNote: "举像者据转载图注记为战地服务童子军，具体摄日与街段仍待考。此图属于身后纪念活动。",
    related: ["WangMingzhang"],
    sources: [
      { title: "抗日战争纪念网：1938年武汉公祭殉国将领王铭章", url: "https://www.krzzjn.com/show-1209-76894.html", note: "网络转载图集，并非原底片扫描；具体摄日、摄影者尚未确认。" },
      { title: "新华社人物报道（国防部转载）", url: "https://www.mod.gov.cn/2018gfbztlbmb/2018-11/04/content_4828585.htm", note: "互证王铭章殉国后，灵柩返乡途中汉口举行公祭的事件性质。" },
    ],
  },
  // The game's own ledger, from the Notion pages 史实与创作 / 史实与创作对照表 (2026-10-18). Item refs index entry.sources;
  // a mark changes only with a checked source. Links that did not hold up when checked were left out, and the item moved down a mark.
  {
    id: "HistoryAndCreation", category: "creation", title: "史实与创作对照", subtitle: "游戏里哪些来自史料，哪些是创作",
    summary: "按四种标注逐条说明，附查到的出处。", caption: "制作说明 · 本作整理，不是史料", imageAlt: "四种标注及各自的条数",
    sections: [
      { title: "取材", text: "本作取材于1938年3月14日至18日的滕县保卫战。战役的时间、地点和大的经过，以史料为准；顺子、冬瓜、罗班长、幺娃、刘文财、何有田、老耿、妮儿、小秦这些人物和他们的经历，都是虚构的。" },
      { title: "怎么标", text: "每一条只按查到的出处标注；查不到的标「创作」或「出处待查」，不往史实那边靠。游戏不在每个场景里自我辩解，想知道某一段的出处，就在这里查。" },
    ],
    marks: [
      { id: "recorded", title: "有记载", text: "查到了出处，附链接。", items: [
        { title: "战役时间线", text: "日军沿津浦铁路南下，外围阻击、东关争夺、城内巷战，3月18日滕县失守。", refs: [0, 1] },
        { title: "南门、北门堵死", text: "王铭章下令把南、北两门堵死，东、西两门暂留通路、随时准备封闭；“没有我的手令，谁也不准出城”。下这道命令的人，另有孙震一说。", refs: [2, 3] },
        { title: "东关城墙被炸开", text: "3月16日10时半，东关城墙被炸开一二十米的缺口。", refs: [1] },
        { title: "西城门楼失守，王铭章殉国", text: "3月17日17时，日军夺取西城门楼，师长王铭章在西关中弹殉国。牺牲的具体地点和经过，各家说法不一。", refs: [1] },
        { title: "北沙河铁路大桥奉令炸毁", text: "3月14日，王铭章令北沙河的七二七团赶到滕县布防，并下令炸毁北沙河铁路大桥，以免日军利用；出处是后世的史述。游戏里炸的是一座浮桥，全班守在桥头等最后一个人过河再炸，是创作。", refs: [14] },
        { title: "出川时的随身装备", text: "川军出川时，每人只有粗布单衣两套、单被一条、草席一张、草鞋两双、斗笠一顶，身背大刀、斗笠和背包。四川博物院的出川照片里，士兵背的是鼓起来的软包裹，拍摄时间不详，捆法也看不清。", refs: [4, 12] },
        { title: "川军的武器", text: "川军装备很差：维基百科说只有轻武器和手榴弹，百度百科说主要武器是四川造的七九步枪、大刀和手榴弹。", refs: [1, 3] },
        { title: "十一年式轻机枪", text: "日军的十一年式轻机枪用弹斗供弹，一次装六个五发桥夹，共三十发；中国军队缴获过不少，掉过头来用。第一关里顺子缴来一挺守路口，是创作。", refs: [13] },
        { title: "八九式掷弹筒", text: "发射时一声“嘭”，筒身固定45度，专用榴弹最远约670米。这些多是太平洋战场美军的说法和普及文章；有效射程，各家说法差得远。", refs: [6, 7] },
      ] },
      { id: "similar", title: "创作，有类似记载", text: "滕县没查到，但同一时期别处有记载，附那条记载。", items: [
        { title: "救护点处决伤兵", text: "日军在前沿救护点处决走不动的伤兵和救护人员，是本作有意保留的创作性还原，滕县本地没查到记载。日军在南京凭头上的帽箍印、手上的老茧辨认中国军人并屠杀，有大量记载；伤兵那句“日本人看手，看脑壳上的帽子印”，台词是创作，背景出自这类记载。", refs: [8] },
        { title: "冬瓜的伤口只塞一条毛巾", text: "冬瓜肚子上只塞着一条毛巾、天黑前送不到军医手里，是创作。川军老兵的回忆里有同类的事：伤兵后送途中找不到救助站，腹部重伤的人只拿毛巾塞住伤口赶路；说的是1939年的江西前线，不是滕县。", refs: [5] },
        { title: "被保长用绳子捆来当兵", text: "顺子和冬瓜是被保长用一根绳子捆来当兵的，这是人物设定。四川强拉壮丁有记载：《四川省志·军事志》记了强拉、买卖等弊病，1945年中江的一份代电记有捆绑押交；但这些多是1938年以后的材料，不能说成出川川军的普遍经历。详见「四川征兵与“抓壮丁”」。", refs: [10, 11] },
        { title: "耿家庄地瓜窖里的屠杀", text: "耿家庄里日军屠杀从地瓜窖里爬出来的一家、刺死襁褓里的孩子，是创作，滕县没查到这样的记载。南京大屠杀幸存者常志强讲过，他还没断奶的小弟弟被日军用刺刀挑起（1937年）。往藏身处扔手榴弹、拿老百姓练刺刀的同类记载，还没核对。", refs: [15] },
      ] },
      { id: "invented", title: "创作", text: "虚构，或没找到任何记载。", items: [
        { title: "人物与对白", text: "顺子、冬瓜、罗班长、幺娃、刘文财、何有田、老耿、妮儿、小秦、排长等人物，他们的经历和对白都是虚构的，包括顺子想回家、冬瓜他舅的船、欠下的八个铜板、顺子包里那件准备逃跑时换上的老百姓短褂。王铭章是真实人物，他在终章里的问话是创作。" },
        { title: "日机扫射白布担架", text: "日机认出盖着白布的担架、医护人员和百姓后仍然扫射，是本作有意保留的创作性还原。滕县没查到这样的记载；别处的类似记载，出处还在核对。" },
        { title: "东关夜战的照明弹", text: "东关夜战里日军打照明弹、敌我突然暴露，是本作有意保留的创作性还原。滕县本地没查到记载，别处的类似记载也还没找到。" },
        { title: "欠租拿人抵债", text: "顺子家欠租，东家要拿他十二岁的妹妹抵过去当丫头，是创作，四川的具体记载没查到。这里附的是周而复长篇小说《上海的早晨》里无锡农家被逼拿女儿抵租债的情节，那是文学作品，不算史料记载。", refs: [9] },
        { title: "第一关前沿的地形", text: "一折一折的前沿沟、唯一的交通沟、沟口外的机枪坑、支沟尽头的防炮洞，坡后那道两岸陡坎、南岸一排树、往东南接一条凹路的干沟（集结处），是关卡的空间设计，参考了一战西线的堑壕做法（Waldron《Elements of Trench Warfare》1917年的插图），不是滕县某处阵地的复原。壕里的弹药箱、土袋垛、门板、水缸是按常见做法推断的日常摆设，顺带给人当掩体。", refs: [16] },
        { title: "撤退与反冲", text: "东段失守后日军沿沟往西清、顺路绕到背后，全线往后撤，是战术上的推演；滕县外围各阵地的具体经过，没能对到这么细。幺娃替顺子去坑里传令、冬瓜和顺子商量跑路、班长留何有田几个在台阶上压住机枪、自己带人贴着支沟南沿外的土垄绕过去反冲、坡顶别的班接应，都是创作。集结处人多担架少、交通沟一次只过一个人、伤员一趟一趟往后抬，也是按剧情写的。" },
        { title: "日军清沟与审问", text: "日军先头部队摸进支沟清洞、沿沟补刀、拿尸体垫机枪，翻译逼问、新兵拿俘虏练刺刀，都是创作。日军拿俘虏练刺刀的同类记载，还没核对。" },
        { title: "用单被拖冬瓜", text: "顺子和何有田并排揪着冬瓜那床单被往后拖，追兵一露头，就把被子拽到弹药箱垛、台阶拐角这些掩体后头，松手回身打。单被是有记载的随身装备，拿它拖人、怎么拖，都是创作。" },
        { title: "单被背包的样子", text: "游戏里的背包是一床单被折成方块，灰布条横竖各捆两道，挂着草席和草鞋，包口露出那件短褂的一角。尺寸、捆法和补丁是按设计做的，不是1938年的实测规格。" },
        { title: "沟里伏击战车", text: "路口交通沟上给驴车、担架过路的板桥（几根横木铺门板），顺子和班长趴在桥下沟底让战车从头顶碾过去，再用一捆手榴弹炸车尾，战车瘫在桥头堵住后面的日军，都是创作。用门板搭桥是推断；“沟太宽，战车只能走桥”是按剧情定的，八九式能跨多宽的沟还没查到；用集束手榴弹炸战车，滕县的记载还没查。抱着一捆手榴弹死在坑沿外的弟兄，也是创作。" },
        { title: "日军战车和飞机的型号", text: "第一关追上来的是八九式中战车，空袭用的是九七式轻爆击机（Ki-30）的模型，这两样都是本作选的。维基百科记濑谷支队编有两个独立轻装甲车中队，攻城的步兵第十联队没有战车，飞机只用于侦察；第一关这一线当时开来的是什么车、什么飞机，还没查清。", refs: [1] },
        { title: "掷弹筒落地前的几秒", text: "听到“嘭”到炮弹落地的那几秒，是按物理估算的，不是史料。" },
        { title: "往南的路", text: "全班跟着后送队往南、班长派顺子和刘文财跟着驴车护送伤员，老耿一家和被征来拉弹药的驴车，北沙河浮桥和桥头接收伤兵的院子，守在桥头等最后一个人过河再炸桥，都是创作。没找到一个班全程武装护送伤员的规定；北沙河铁路大桥奉令炸毁见「有记载」。" },
        { title: "耿家庄的巷战", text: "西边的河汊子、妮儿钻狗洞拔侧门闩、两面夹住窗口的机枪、缴来的机枪守路口、何有田在后门卡手榴弹，都是创作。1938年滕县川军拿手榴弹做诱雷，没查到。" },
        { title: "后几关的情节", text: "第二关南门前罗班长放过换了便衣的顺子、老耿推沙土车；第三关的救护所和后送名额、往木条上写名字、顺子解下绑腿止血；第四关班长口述的家信；第五关报出大名、城门口的回头，视角交给炊事兵、卫生兵和电话兵；终章由玩家亲手发报：都是创作。" },
      ] },
      { id: "pending", title: "出处待查", text: "还没查实，或几种说法对不上。查实之前不当作史实；查不到，就改标「创作」。", items: [
        { title: "王铭章最后的电报", text: "网上多有转述电文“决以死拼，以报国家，以报知遇”，还没找到原件或可靠史料集里的原文。" },
        { title: "八九式中战车", text: "越野每小时约10—15公里、炮塔靠手摇转动，出处还没附上；它能跨多宽的沟，没查到。" },
        { title: "武器与编制的细节", text: "剧本按每个分队一挺轻机枪来写日军，木柄手榴弹拉火绳点火也按有记载来写，出处都还没附上。掷弹筒配到哪一级：资料多说每个小队（排）配2—3具，剧本里另有配到分队一级的写法，两边对不上，还没核实。" },
        { title: "东关守城的细节", text: "百姓推独轮车运沙土、挖交通壕，老乡挑大饼和开水送上城墙，冒着枪弹上来抬伤员：按有史料来写，出处还没附上。集中投弹时“再近点”“甩！”的口令和第一次白刃战，细节还没查。" },
        { title: "日军的投降传单", text: "滕县有没有投过传单、写了什么，还没查。" },
      ] },
    ],
    related: ["TengxianBattle", "WangMingzhang", "SichuanConscription"],
    sources: [
      { title: "山东地方志：滕县保卫战", url: "https://shandong-chorography.org/database/a/section/17/article/418/", note: "战役时间线：3月14日开始攻击，18日滕县城陷落。" },
      { title: "维基百科：滕县保卫战", url: "https://zh.wikipedia.org/zh-cn/%E6%BB%95%E5%8E%BF%E4%BF%9D%E5%8D%AB%E6%88%98", note: "战役时间线、3月16日东关缺口、3月17日西城门楼失守与王铭章殉国；守军“装备十分落后”，只有轻武器和手榴弹；濑谷支队编有两个独立轻装甲车中队，攻城的步兵第十联队没有战车，飞机只用于侦察。百科条目，宜与地方志、亲历者回忆互核。" },
      { title: "共产党员网：王铭章——以身殉国为民族争光", url: "https://www.12371.cn/2018/11/04/ARTI1541314073032534.shtml", note: "王铭章命令堵死南门、北门，东、西城门暂留通路。" },
      { title: "百度百科：滕县保卫战", url: "https://baike.baidu.com/item/%E6%BB%95%E5%8E%BF%E4%BF%9D%E5%8D%AB%E6%88%98/2591237", note: "“没有我的手令，谁也不准出城”记作王铭章对张宣武所说；川军主要武器是四川造的七九步枪、大刀和手榴弹。百科条目；下令者另有孙震一说。" },
      { title: "中新网：川军踏草鞋背大刀抗战", url: "https://www.chinanews.com/cul/2014/09-03/6558063.shtml", note: "转载《成都商报》2014年9月3日报道，记者探访建川博物馆的馆藏川军装备。" },
      { title: "出川抗战亲历记", url: "http://sxmgwyh.cn/htm/news_507_3160.htm", note: "陕西民革网站刊载的川军老兵回忆：新编第14师，1939年江西前线。事后回忆，不是滕县战场的记录。" },
      { title: "Wikipedia：Type 89 grenade discharger", url: "https://en.wikipedia.org/wiki/Type_89_grenade_discharger", note: "45度固定射角、专用榴弹最大射程670米、发射时的声响；多据美军战时资料。" },
      { title: "网易：八九式掷弹筒普及文章", url: "https://www.163.com/dy/article/H0E06NR00552C4OU.html", note: "普及文章，射程写作有效260米、最大700米，与其他资料不一。" },
      { title: "维基百科：南京大屠杀", url: "https://zh.wikipedia.org/zh-hans/%E5%8D%97%E4%BA%AC%E5%A4%A7%E5%B1%A0%E6%AE%BA", note: "日军搜捕“便衣兵”时，凭头上帽箍、手上老茧判断是否军人。" },
      { title: "周而复《上海的早晨》第一部第3章", url: "https://www.marxists.org/chinese/reference-books/shanghaidezaochen/1-03.htm", note: "长篇小说，文学作品，不是史料记载。" },
      { title: "《四川省志·军事志》：兵役", url: "https://www.scdfz.org.cn/upload/main/contentmanage/article/file/201702232017118370.pdf", note: "第544、547—550页，记有壮丁征集程序，也记录了强拉、买卖和徇私等弊病；地方志为事后整理。" },
      { title: "童玉汝：抗战时期国民政府征兵黑幕", url: "https://m.krzzjn.com/show-897-132654.html", note: "原载《中国档案报》2019年7月26日，刊出1945年5月中江壮丁待遇代电局部，记有捆绑押交。抗战末期的地方报告。" },
      { title: "四川在线：从抗战大后方到国家战略腹地，何以四川", url: "https://sichuan.scol.com.cn/ggxw/202509/83113537.html", note: "2025年9月报道；配图“川军将士出川”注明图据四川博物院，拍摄时间未注明。" },
      { title: "Wikipedia：Type 11 light machine gun", url: "https://en.wikipedia.org/wiki/Type_11_light_machine_gun", note: "弹斗最多装六个五发桥夹，共三十发；许多被中国军队缴获，用来打日军。" },
      { title: "刘晓焕：王铭章（山东省情网，抗日战争纪念网转载）", url: "https://m.krzzjn.com/show-1013-69888.html", note: "3月14日下午5时，王铭章令七二七团团长张宣武率部速到滕县布防，并下令炸毁北沙河铁路大桥。后世史述，不是当时的档案。" },
      { title: "人民政协网：真相与死亡赛跑——南京大屠杀幸存者减至100多人", url: "https://www.rmzxw.com.cn/c/2014-12-12/418041.shtml", note: "2014年12月12日，署名新华社、人民网；转述幸存者常志强：还没断奶的小弟弟被日军用刺刀挑起。" },
      { title: "Waldron《Elements of Trench Warfare》（1917）第14图", url: "https://gutenberg.org/files/61330/old/61330-h/images/i_025.jpg", note: "一战西线手册里的锯齿形火力壕平面图（古腾堡计划电子版）；本作前沿沟的参考，不是1938年中国战场的阵地。" },
    ],
  },
];

// Stable content ids shared by the renderer and translation collector; URLs and asset paths are not text.
export function HistoryCodexContent() {
  const rows = [];
  function Walk(value, key) {
    if (typeof value === "string") {
      if (/[\u3400-\u9fff]/u.test(value) && !/^(https?:|\.\/)/u.test(value)) rows.push({id: `historyCodex.${key}`, text: value});
    } else if (Array.isArray(value)) value.forEach((item, i) => Walk(item, `${key}.${i}`));
    else if (value && typeof value === "object") for (const [field, item] of Object.entries(value)) Walk(item, `${key}.${field}`);
  }
  HISTORY_CODEX_ENTRIES.forEach(entry => Walk(entry, entry.id));
  return rows;
}
