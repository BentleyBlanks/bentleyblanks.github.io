// Player-facing archive. Contemporary sources, retrospective accounts and game diagrams remain distinct.
// Images are documentary reproductions; the approved Imagegen concepts are layout references only.
export const HISTORY_CODEX_VERSION = "20261013233001";
const Image = name => `./Texture/Menu/History/Texture_History${name}Image.webp?v=${HISTORY_CODEX_VERSION}`;
export const HISTORY_CODEX_CATEGORIES = ["people", "history", "documents", "press", "photos"];
export const HISTORY_CODEX_TUNING = Object.freeze({ zoomMin: 1, zoomMax: 4, zoomStep: .25, wheelStep: .15 });

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
