/*
 * Taihang Letters 1942
 * Public historical framing for the interactive story 《纸上有家》.
 *
 * The two protagonists, the nineteen students, HuaiShuGou village and the
 * BeiGou temporary teaching point are fictional. Dates, place names and the wider
 * course of the war remain fixed.
 */

export const HistoricalFrame = Object.freeze({
  period: "1942年5月24日傍晚至25日清晨",
  place: "太行抗日根据地辽县境内的虚构支沟",
  presentName: "今山西省左权县",
  playerBoundary:
    "玩家只能影响两个虚构人物能否保存一份学生名册、家书与油印工具，不能改变反“扫荡”、十字岭突围、左权牺牲或抗日战争的真实进程。",
  namingBoundary:
    "故事发生时必须称“辽县”。辽县于1942年9月18日改名左权县；“左权县”只在尾声和史料说明中出现。",
  representationBoundary:
    "敌人主要通过合围压力、远处炮火、灯影和战争后果呈现。游戏没有击杀计分，也不把16岁的赵杏枝写成武装战斗员。",
});

export const HistoricalSources = Object.freeze([
  Object.freeze({
    id: "TaihangBreakout",
    organization: "中共邯郸市委党史研究室",
    title: "十字岭战斗",
    url: "https://www.handandangshi.gov.cn/dianxingzhanyi/627.html",
    usedFor:
      "1942年5月19日起太行北部反“扫荡”、24日晚偏城南艾铺一带合围形成、25日机关人员分路突围，以及地方群众参与疏散、隐蔽和救护的时间背景。",
  }),
  Object.freeze({
    id: "ZuoQuanLife",
    organization: "中国共产党新闻网／人民日报",
    title: "左权：太行浩气传千古（铭记历史 缅怀先烈·抗日英雄）",
    url: "https://cpc.people.com.cn/n1/2025/0625/c443712-40508668.html",
    usedFor:
      "左权于1942年5月25日在辽县十字岭一带掩护机关突围时牺牲，以及其在太行敌后战场的历史位置。",
  }),
  Object.freeze({
    id: "CountyRename",
    organization: "晋中市博物馆",
    title: "左权将军殉难处",
    url: "https://jzbwg.sxjz.gov.cn/jzwb/sxszdwwbhdw/content_452003",
    usedFor:
      "辽县于1942年9月18日更名左权县。故事正文因此使用当时名称“辽县”。",
  }),
  Object.freeze({
    id: "WartimeEducation",
    organization: "《安徽史学》／中国知网",
    title: "李常宝：抗战时期太行根据地的小学教育研究",
    url: "https://www.cnki.com.cn/Article/CJFDTotal-AFSX201805009.htm",
    usedFor:
      "太行根据地推进义务教育、识字教育并把抗日救国内容纳入课程的总体背景。",
  }),
  Object.freeze({
    id: "LiaoEducation",
    organization: "左权县人民政府",
    title: "辽县国难教育联合学校 培养抗日干部和教师",
    url: "http://www.jzzq.gov.cn/rwzq/hszq/content_1930",
    usedFor:
      "1938年辽县已有国难教育联合学校等战时教育实践；游戏据此虚构村学、识字课和教师兼文书工作。",
  }),
  Object.freeze({
    id: "NorthChinaPress",
    organization: "人民网／人民政协报",
    title: "红色武乡的抗战新闻往事",
    url: "http://dangshi.people.com.cn/n1/2016/0107/c85037-28025770.html",
    usedFor:
      "《新华日报》华北版在太行山区的出版、转移与前线油印实践。游戏中的小油印点为虚构复合场景，不冒充该报社印刷厂。",
  }),
  Object.freeze({
    id: "WomenSupport",
    organization: "山西省人民政府／中共山西省委党史研究院",
    title: "重温山西抗战历史 弘扬伟大抗战精神",
    url: "https://www.shanxi.gov.cn/ywdt/sxyw/202507/t20250708_9904276_slb.shtml",
    usedFor:
      "妇救会成员参与站岗、送情报、担架、护理和掩护伤员等群众工作。赵杏枝只是熟悉本地小路的村学生和临时领路人，不被写成正式干部。",
  }),
  Object.freeze({
    id: "TaihangChildren",
    organization: "新华网",
    title: "抗战影像记忆｜他们，这样长大",
    url: "https://www.news.cn/politics/20250531/dade1f1dd54d424bb0d0355745bbecd5/c.html",
    usedFor:
      "太行山区儿童上学、参加儿童团并在学习之外帮助站岗放哨的历史影像与说明；游戏不据此安排未成年人正面作战。",
  }),
  Object.freeze({
    id: "QingzhangGeography",
    organization: "新华网",
    title: "听风吹过十字岭——踏访左权将军殉国地",
    url: "https://www.xinhuanet.com/20250525/0ed20d1704ca46149a841f9711c334e0/c.html",
    usedFor:
      "麻田、十字岭与清漳河太行峡谷的地理背景。故事只写普通浅滩和支沟，不虚构当日洪水或大型炸桥。",
  }),
]);

export const HistoricalNotes = Object.freeze([
  Object.freeze({
    id: "TaihangSweep",
    label: "史实",
    title: "五月太行反“扫荡”",
    summary:
      "1942年5月19日起，侵华日军对太行北部发动大规模“扫荡”。至24日晚，偏城南艾铺一带的合围逐渐收紧；25日，八路军总部、北方局等机关人员分路突围。",
    boundary:
      "本作把两位虚构人物放在外围支沟，不让她们参与或改变真实突围。画面中的远方炮火只是同一轮合围行动的远景提示。",
    sourceIds: Object.freeze(["TaihangBreakout", "ZuoQuanLife"]),
  }),
  Object.freeze({
    id: "LiaoCounty",
    label: "史实",
    title: "当时仍叫辽县",
    summary:
      "故事在5月25日东方发白时结束。约十二小时后的当日17时左右，左权在辽县十字岭一带牺牲；同年9月18日，辽县才更名为左权县。",
    boundary:
      "正文只称“辽县”。尾声提到后来改名，是帮助玩家辨认今天的地名，并非让人物提前知道未来。",
    sourceIds: Object.freeze(["TaihangBreakout", "ZuoQuanLife", "CountyRename"]),
  }),
  Object.freeze({
    id: "WartimeSchool",
    label: "史实＋复合创作",
    title: "战火里的学校与识字课",
    summary:
      "太行根据地在战时推进乡村教育和识字工作，抗日救国内容进入课程。辽县较早便有战时学校与教育组织。",
    boundary:
      "槐树沟村学、十九名学生和沈兰贞均为虚构；她兼任教员、文书和油印工作的设定，是对基层人手紧张的复合创作。",
    sourceIds: Object.freeze(["WartimeEducation", "LiaoEducation"]),
  }),
  Object.freeze({
    id: "CivilianEvacuation",
    label: "史实＋复合创作",
    title: "分组疏散，而不是整齐撤军",
    summary:
      "合围形成时，尚未转出的机关、学校、报社与群众需要分散隐蔽、分路转移。地方群众熟悉地形，也参与掩护、救护和引路。",
    boundary:
      "游戏只表现两个人走一段短程山路，不把虚构小队写成指挥大规模撤离，也不宣称每个山村都已被占领。预先分组与复查慢脚住户是槐树沟的虚构民防安排，不冒充全区统一制度。",
    sourceIds: Object.freeze(["TaihangBreakout", "WomenSupport"]),
  }),
  Object.freeze({
    id: "LocalGuide",
    label: "史实＋虚构人物",
    title: "她是领路人，不是“小战士”",
    summary:
      "太行儿童和青少年在学习之外可能帮助站岗放哨；妇救会成员也承担情报、护理、担架和掩护等工作。",
    boundary:
      "16岁的赵杏枝是熟悉羊肠小路的村学生，只为教员和几户转移群众临时领一段路。是否涉水、怎样探路和如何安排次序均由成年人负责；她不持枪、不暗杀敌人，也不被塑造成正式军事指挥员。",
    sourceIds: Object.freeze(["TaihangChildren", "WomenSupport"]),
  }),
  Object.freeze({
    id: "Mimeograph",
    label: "史实＋复合创作",
    title: "钢板、铁笔与蜡纸",
    summary:
      "大型《新华日报》华北版拥有铅印条件；前线与小型刊物则常使用钢板、铁笔刻蜡纸，再以油墨滚印。轻便工具更适合在“扫荡”中分散转移。",
    boundary:
      "故事中的小油印点和它的工具包均为虚构，是依据当时通行油印工序所作的审慎复原，不对应《新华日报》印刷厂。本作没有把普通村校写成拥有大型铅印设备。",
    sourceIds: Object.freeze(["NorthChinaPress"]),
  }),
  Object.freeze({
    id: "MountainRoute",
    label: "地理＋创作边界",
    title: "清漳河谷里的支沟与浅滩",
    summary:
      "辽县麻田、十字岭一带位于清漳河太行峡谷地带。沟谷、坡路、石滩和本地人熟悉的短程绕行符合当地地貌。",
    boundary:
      "游戏的槐树沟、石门河滩及沿途支沟均为虚构，不声称5月24日发生过洪水、断桥或某次有案可查的追逐。",
    sourceIds: Object.freeze(["QingzhangGeography"]),
  }),
  Object.freeze({
    id: "NamesAndRecords",
    label: "创作说明",
    title: "名单为何只写“待寻”",
    summary:
      "战争与转移会让档案残缺、亲人失散。游戏让角色在无法确认时写“待寻”或“待核”，而不替虚构人物编造确定的死亡或团聚。",
    boundary:
      "十九个姓名、所有家书与四种结局完全虚构。它们不借用烈士名录，也不把虚构页面当作历史档案。",
    sourceIds: Object.freeze(["WartimeEducation", "TaihangBreakout"]),
  }),
  Object.freeze({
    id: "CreativeBoundary",
    label: "总说明",
    title: "什么是真实，什么是虚构",
    summary:
      "1942年5月太行反“扫荡”、故事结束约十二小时后的5月25日傍晚左权牺牲、9月18日辽县改名等宏观节点固定不变。玩家保存的是一个虚构村庄里普通人的姓名与来信。",
    boundary:
      "好结局不等于敌军被彻底击退；坏结局也不改写全国抗战。游戏只让玩家承担一夜之内、两个人力所能及的选择。",
    sourceIds: Object.freeze(["TaihangBreakout", "ZuoQuanLife", "CountyRename"]),
  }),
]);

export const HistoricalTerms = Object.freeze([
  Object.freeze({
    term: "“扫荡”",
    definition:
      "沿用侵略军当时用语，因此加引号。本作表现的是合围、搜索、封锁和破坏造成的压力，不把它写成普通的“关卡波次”。",
  }),
  Object.freeze({
    term: "太行根据地",
    definition:
      "辽县属于太行抗日根据地和晋冀鲁豫敌后体系。它不是冀中平原，也不属于“晋察冀辽县”。",
  }),
  Object.freeze({
    term: "五月反“扫荡”",
    definition:
      "本作用这个说法指1942年5月太行根据地的反“扫荡”。“五一大扫荡”常特指冀中平原行动，故不混用。",
  }),
]);

export const HistoryById = Object.freeze(
  Object.fromEntries(HistoricalNotes.map((note) => [note.id, note])),
);

export const SourceById = Object.freeze(
  Object.fromEntries(HistoricalSources.map((source) => [source.id, source])),
);
