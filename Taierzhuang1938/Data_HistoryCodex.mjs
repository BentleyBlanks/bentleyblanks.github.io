// Player-facing archive. Contemporary sources, retrospective accounts and game diagrams remain distinct.
// Images are documentary reproductions; the approved Imagegen concepts are layout references only.
export const HISTORY_CODEX_VERSION = "2026101501";
const Image = name => `./Texture/Menu/History/Texture_History${name}Image.webp?v=${HISTORY_CODEX_VERSION}`;
export const HISTORY_CODEX_CATEGORIES = ["people", "history", "documents", "press", "photos"];
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
