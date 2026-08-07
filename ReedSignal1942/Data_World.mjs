export const GameMetadata = Object.freeze({
  id: "ReedSignal1942",
  title: "苇声：1942",
  subtitle: "最后一次点名",
  date: "1942年6月 · 冀中敌后",
  estimatedMinutes: "18—25 分钟",
  saveKey: "reedsignal1942_campaign_v1",
  historyBoundary:
    "苇河县、石桥村及全部人物均为虚构复合创作。故事取材于1942年冀中“五一大扫荡”及其后的封锁环境；玩家只能影响一次虚构的局部转移，不能改写真实战役与历史结局。",
  responsibility:
    "作品明确呈现侵华日军实施封锁、搜捕、抢掠与暴力的历史责任；平民苦难不计分，也不把侵略军罪行转化为对现实民族群体的仇恨。",
});

export const HistoricalSources = Object.freeze([
  Object.freeze({
    organization: "中国人民抗日战争纪念馆",
    title: "《伟大胜利 历史贡献》基本陈列",
    url: "https://www.1937china.com/views/kzzl/jng_jbcl.html",
    usedFor: "全国抗战、正面战场与敌后战场共同抗击日本侵略的总体历史框架。",
  }),
  Object.freeze({
    organization: "中共邯郸市委党史研究室",
    title: "抗战时期中共冀中地道战的战术演进与策略运用",
    url: "https://www.handandangshi.gov.cn/yaolun/2463.html",
    usedFor: "1942年冀中“五一大扫荡”、封锁沟墙与据点网络，以及早期地道主要用于隐蔽、保存和防御的历史边界。",
  }),
  Object.freeze({
    organization: "中共邯郸市委党史研究室",
    title: "太行抗日根据地交通网络的构建与运行（一）",
    url: "https://www.handandangshi.gov.cn/yaolun/2671.html",
    usedFor: "交通员、秘密交通站、分段接力与群众共同维持敌后联络的历史依据。",
  }),
  Object.freeze({
    organization: "中华人民共和国国防部",
    title: "军史发现丨抗大二分校——敌后播撒抗战火种",
    url: "http://www.mod.gov.cn/gfbw/gfjy_index/16396545.html",
    usedFor: "战时分散办学、在转移中继续教育的历史背景；本作乡村教师与学童仍为虚构复合人物。",
  }),
]);

const SharedNames = Object.freeze(["麦子", "杏花", "小锁", "春妮", "石头", "栓儿"]);

export const Chapters = Object.freeze([
  Object.freeze({
    id: "school",
    number: "第一章",
    title: "空教室",
    date: "1942年6月7日 · 黄昏",
    location: "苇河县 · 石桥村",
    thesis: "先把名字带上，再把人带走。",
    intro: Object.freeze([
      "五月的合围过去了，封锁线却留了下来。",
      "周禾老师把失散孩子的名字写在一册薄薄的点名簿上。",
      "她对阿苇说：簿子丢了还能再写，人不能少一个。",
    ]),
    width: 2920,
    startX: 150,
    exitX: 2750,
    terrain: Object.freeze([
      Object.freeze({ x0: 0, x1: 860, y: 0 }),
      Object.freeze({ x0: 860, x1: 1420, y: 34 }),
      Object.freeze({ x0: 1420, x1: 2140, y: 0 }),
      Object.freeze({ x0: 2140, x1: 2920, y: -22 }),
    ]),
    covers: Object.freeze([
      Object.freeze({ x0: 80, x1: 720, kind: "schoolWall" }),
      Object.freeze({ x0: 760, x1: 1040, kind: "reedBlind", requires: "dropBlind" }),
      Object.freeze({ x0: 1840, x1: 2180, kind: "collapsedWall" }),
      Object.freeze({ x0: 2320, x1: 2540, kind: "ditch" }),
    ]),
    hazards: Object.freeze([
      Object.freeze({ id: "towerLight", kind: "searchlight", sourceX: 1710, x0: 1010, x1: 1840, sweep: 310, period: 6.8, width: 145, phase: 0.35 }),
    ]),
    cart: Object.freeze({ startX: 1120, targetX: 1515, minX: 1050, maxX: 1550 }),
    gates: Object.freeze([
      Object.freeze({ x: 1650, requires: "cartPlaced", hint: "墙豁口太高——把独轮车推到墙根。" }),
      Object.freeze({ x: 2640, requires: "openDrain", hint: "排水洞还压着石板。" }),
    ]),
    actions: Object.freeze([
      Object.freeze({ id: "takeRegister", x: 330, label: "收起点名簿", seconds: 0.7, story: "周禾：纸会湿，名字要记在心里。", checkpoint: true }),
      Object.freeze({ id: "findMizi", x: 620, label: "牵起麦子", seconds: 0.5, requires: Object.freeze(["takeRegister"]), story: "麦子没有哭，只把手攥得更紧。", effect: "addMizi" }),
      Object.freeze({ id: "dropBlind", x: 820, label: "放下苇帘", seconds: 1.1, requires: Object.freeze(["findMizi"]), story: "旧苇帘落下来，灯光第一次有了挡头。", checkpoint: true }),
      Object.freeze({ id: "cartPlaced", x: 1515, label: "把车抵住墙根", seconds: 0, requires: Object.freeze(["dropBlind"]), story: "车轮陷进土里，刚好够两双脚翻过残墙。", special: "cart" }),
      Object.freeze({ id: "openDrain", x: 2545, label: "抬开排水洞石板", seconds: 1.3, requires: Object.freeze(["cartPlaced"]), story: "阿苇先把麦子送进去，自己最后钻过。", checkpoint: true }),
    ]),
    objectiveGroups: Object.freeze([
      Object.freeze({ label: "带上点名簿与麦子", ids: Object.freeze(["takeRegister", "findMizi"]) }),
      Object.freeze({ label: "用苇帘和独轮车穿过探照灯", ids: Object.freeze(["dropBlind", "cartPlaced"]) }),
      Object.freeze({ label: "从排水洞离村", ids: Object.freeze(["openDrain"]) }),
    ]),
    endingLine: "点名簿里有六个名字。现在，阿苇身边只有一个孩子。",
  }),
  Object.freeze({
    id: "blockade",
    number: "第二章",
    title: "风过封锁沟",
    date: "1942年6月7日 · 入夜",
    location: "封锁沟外 · 水闸",
    thesis: "风不是空窗；风是你亲手等来的掩护。",
    intro: Object.freeze([
      "沟墙把村与村切开，水路检查得比白天更紧。",
      "干苇一响，巡逻船就会把灯转过来。",
      "阿苇记得母亲教的办法：看苇梢，不看自己。",
    ]),
    width: 3340,
    startX: 140,
    exitX: 3180,
    terrain: Object.freeze([
      Object.freeze({ x0: 0, x1: 1840, y: 0 }),
      Object.freeze({ x0: 1840, x1: 2240, y: -8, dynamic: "sluiceBridge" }),
      Object.freeze({ x0: 2240, x1: 3340, y: 10 }),
    ]),
    covers: Object.freeze([
      Object.freeze({ x0: 100, x1: 430, kind: "bank" }),
      Object.freeze({ x0: 470, x1: 760, kind: "tallReeds" }),
      Object.freeze({ x0: 920, x1: 1120, kind: "boatShed" }),
      Object.freeze({ x0: 1500, x1: 1810, kind: "sluiceWall" }),
      Object.freeze({ x0: 2300, x1: 2530, kind: "reedStack" }),
      Object.freeze({ x0: 2850, x1: 3110, kind: "willows" }),
    ]),
    soundZones: Object.freeze([
      Object.freeze({ x0: 420, x1: 1040, kind: "dryReeds", label: "干苇" }),
      Object.freeze({ x0: 2470, x1: 2860, kind: "shallowWater", label: "浅水" }),
    ]),
    hazards: Object.freeze([
      Object.freeze({ id: "boatLight", kind: "searchlight", sourceX: 1380, x0: 700, x1: 1570, sweep: 360, period: 7.4, width: 135, phase: 1.2, distractBy: "releaseBoat" }),
      Object.freeze({ id: "farLight", kind: "searchlight", sourceX: 2740, x0: 2260, x1: 3050, sweep: 280, period: 5.8, width: 130, phase: 2.3 }),
    ]),
    gates: Object.freeze([
      Object.freeze({ x: 1810, requires: "raiseSluice", hint: "水太低，浮桥够不到对岸。" }),
      Object.freeze({ x: 3090, requires: "markRoute", hint: "先给后面的乡亲留下安全记号。" }),
    ]),
    actions: Object.freeze([
      Object.freeze({ id: "readWind", x: 360, label: "摸清风的间隔", seconds: 0.8, story: "苇梢连续压低时，脚步会被整片风声吃掉。", checkpoint: true }),
      Object.freeze({ id: "releaseBoat", x: 1110, label: "解开空船缆绳", seconds: 1.0, requires: Object.freeze(["readWind"]), story: "空船顺流擦过木桩，巡逻灯追着那声响转开。", effect: "distractLight", checkpoint: true }),
      Object.freeze({ id: "raiseSluice", x: 1735, label: "压下水闸长杆", seconds: 1.8, requires: Object.freeze(["releaseBoat"]), story: "水托起旧门板。它不是桥，只够人一个个过去。", effect: "raiseWater", checkpoint: true }),
      Object.freeze({ id: "markRoute", x: 2960, label: "折下三根苇梢", seconds: 0.7, requires: Object.freeze(["raiseSluice"]), story: "三根朝北的苇梢，是交通线上约好的‘此路能走’。", checkpoint: true }),
    ]),
    objectiveGroups: Object.freeze([
      Object.freeze({ label: "借风穿过干苇", ids: Object.freeze(["readWind"]) }),
      Object.freeze({ label: "放空船引灯，升起浮桥", ids: Object.freeze(["releaseBoat", "raiseSluice"]) }),
      Object.freeze({ label: "为后队留下路标", ids: Object.freeze(["markRoute"]) }),
    ]),
    endingLine: "风把记号留在苇梢上，也把远处的一声咳嗽送了过来。还有人在等。",
  }),
  Object.freeze({
    id: "tunnel",
    number: "第三章",
    title: "井下有六口气",
    date: "1942年6月8日 · 子夜",
    location: "废砖窑 · 早期隐蔽洞",
    thesis: "洞能藏人，却不会替人呼吸。",
    intro: Object.freeze([
      "砖窑下的隐蔽洞还很浅，只有一个出口。",
      "搜捕队在地面点起湿柴，烟正沿裂缝往下沉。",
      "阿苇听见黑暗里有人小声报了四个名字。",
    ]),
    width: 3020,
    startX: 120,
    exitX: 2860,
    terrain: Object.freeze([
      Object.freeze({ x0: 0, x1: 3020, y: -70 }),
    ]),
    covers: Object.freeze([
      Object.freeze({ x0: 0, x1: 3020, kind: "underground" }),
    ]),
    lowCeilings: Object.freeze([
      Object.freeze({ x0: 410, x1: 760 }),
      Object.freeze({ x0: 1120, x1: 1420 }),
      Object.freeze({ x0: 1830, x1: 2190 }),
    ]),
    smoke: Object.freeze({ startX: 2850, safeUntil: 44, speed: 19 }),
    gates: Object.freeze([
      Object.freeze({ x: 800, requires: "openWellVent", hint: "烟往这边压来——先找更高的出气口。" }),
      Object.freeze({ x: 1480, requires: "sealEastCrack", hint: "东侧裂缝还在进烟。" }),
      Object.freeze({ x: 2380, requires: "handShuanUp", hint: "抱着栓儿爬不过窄井，先把他递上去。" }),
    ]),
    actions: Object.freeze([
      Object.freeze({ id: "openWellVent", x: 590, label: "顶开枯井通风板", seconds: 1.3, story: "井口一开，烟终于有了向上走的路。", effect: "ventSmoke", checkpoint: true }),
      Object.freeze({ id: "sealEastCrack", x: 1320, label: "用湿苇席封住裂缝", seconds: 1.6, requires: Object.freeze(["openWellVent"]), story: "不是把洞封死，是逼烟去走那口已经打开的井。", effect: "stopSmoke", checkpoint: true }),
      Object.freeze({ id: "findChildren", x: 1620, label: "回应黑暗里的点名", seconds: 0.7, requires: Object.freeze(["sealEastCrack"]), story: "杏花、小锁、春妮、石头——四声轻轻的‘到’。加上麦子，是五个。", effect: "addChildren" }),
      Object.freeze({ id: "liftShuan", x: 1980, label: "抱起发烧的栓儿", seconds: 0.8, requires: Object.freeze(["findChildren"]), story: "第六个孩子没有应声。他烧得厉害，却还记得把手举起来。", effect: "carryShuan" }),
      Object.freeze({ id: "handShuanUp", x: 2290, label: "把栓儿递上窄井", seconds: 1.4, requires: Object.freeze(["liftShuan"]), story: "上面伸下来一双手。没有人问这孩子是哪一家的。", effect: "releaseShuan", checkpoint: true }),
      Object.freeze({ id: "openReedExit", x: 2740, label: "推开苇根下的出口", seconds: 1.1, requires: Object.freeze(["handShuanUp"]), story: "七个孩子重新站到夜风里。", checkpoint: true }),
    ]),
    objectiveGroups: Object.freeze([
      Object.freeze({ label: "给烟找一条向上的路", ids: Object.freeze(["openWellVent", "sealEastCrack"]) }),
      Object.freeze({ label: "找到失散的四个孩子", ids: Object.freeze(["findChildren"]) }),
      Object.freeze({ label: "把栓儿递过窄井", ids: Object.freeze(["liftShuan", "handShuanUp", "openReedExit"]) }),
    ]),
    endingLine: "点名簿里的六个名字都有了回应。周禾老师还守在封锁线另一边。",
  }),
  Object.freeze({
    id: "ferry",
    number: "第四章",
    title: "最后一次点名",
    date: "1942年6月8日 · 黎明前",
    location: "白苇洼 · 北汊渡口",
    thesis: "必须有人把灯引开，也必须有人继续向前。",
    intro: Object.freeze([
      "北汊的木船只能再撑一趟。",
      "周禾从另一条交通线赶来，身后也亮起了巡逻灯。",
      "她没问阿苇怕不怕，只接过点名簿看了一眼。",
    ]),
    width: 3660,
    startX: 120,
    exitX: 3450,
    terrain: Object.freeze([
      Object.freeze({ x0: 0, x1: 3200, y: 0 }),
      Object.freeze({ x0: 3200, x1: 3660, y: -24 }),
    ]),
    covers: Object.freeze([
      Object.freeze({ x0: 80, x1: 610, kind: "reedBank" }),
      Object.freeze({ x0: 720, x1: 1010, kind: "haystack" }),
      Object.freeze({ x0: 1180, x1: 1510, kind: "reedScreen", requires: "raiseScreen" }),
      Object.freeze({ x0: 1690, x1: 2020, kind: "dike" }),
      Object.freeze({ x0: 2360, x1: 2620, kind: "willows" }),
      Object.freeze({ x0: 2980, x1: 3290, kind: "ferryShade" }),
    ]),
    hazards: Object.freeze([
      Object.freeze({ id: "nearLight", kind: "searchlight", sourceX: 1320, x0: 610, x1: 1720, sweep: 430, period: 6.2, width: 150, phase: 0.7 }),
      Object.freeze({ id: "finalLight", kind: "searchlight", sourceX: 2710, x0: 2020, x1: 3140, sweep: 450, period: 5.4, width: 150, phase: 1.9, distractBy: "motherSignal" }),
    ]),
    soundZones: Object.freeze([
      Object.freeze({ x0: 1540, x1: 2060, kind: "looseBoards", label: "松木板" }),
    ]),
    gates: Object.freeze([
      Object.freeze({ x: 1080, requires: "raiseScreen", hint: "先让孩子们留在草垛后，再独自去升苇障。" }),
      Object.freeze({ x: 2190, requires: "motherSignal", hint: "前面的巡逻灯没有移开。" }),
      Object.freeze({ x: 3370, requires: "boardFerry", hint: "还有人没有上船。" }),
    ]),
    actions: Object.freeze([
      Object.freeze({ id: "countChildren", x: 360, label: "低声点一次名", seconds: 0.7, story: `${SharedNames.join("、")}。六个名字，六声回应。`, checkpoint: true }),
      Object.freeze({ id: "raiseScreen", x: 1040, label: "升起旧苇障", seconds: 1.7, requires: Object.freeze(["countChildren"]), condition: "followersWaiting", story: "阿苇独自穿过灯下，把旧苇障一寸寸拉起来。", checkpoint: true }),
      Object.freeze({ id: "meetMother", x: 1840, label: "把点名簿交给周禾", seconds: 0.8, requires: Object.freeze(["raiseScreen"]), story: "周禾：你带他们走。过河以后，再点一次。" }),
      Object.freeze({ id: "motherSignal", x: 2070, label: "放下白布信号", seconds: 0.9, requires: Object.freeze(["meetMother"]), story: "周禾把白布挂上枯树，自己提着马灯走向南汊。巡逻灯跟着她转了过去。", effect: "distractFinal", checkpoint: true }),
      Object.freeze({ id: "boardFerry", x: 3260, label: "让六个孩子依次上船", seconds: 2.0, requires: Object.freeze(["motherSignal"]), condition: "followersTogether", story: "最后一个孩子上船后，阿苇才松开缆绳。", effect: "finishStory", checkpoint: true }),
    ]),
    objectiveGroups: Object.freeze([
      Object.freeze({ label: "确认六个孩子都在", ids: Object.freeze(["countChildren"]) }),
      Object.freeze({ label: "让队伍等在遮蔽后，独自升起苇障", ids: Object.freeze(["raiseScreen"]) }),
      Object.freeze({ label: "接过周禾留下的时间", ids: Object.freeze(["meetMother", "motherSignal"]) }),
      Object.freeze({ label: "带所有孩子登船", ids: Object.freeze(["boardFerry"]) }),
    ]),
    endingLine: "河面亮起来以前，阿苇翻开了那本已经湿透的点名簿。",
  }),
]);

export function GetAllChildNames() {
  return [...SharedNames];
}

export function GetChapter(chapterIndex) {
  return Chapters[Math.max(0, Math.min(Chapters.length - 1, chapterIndex))];
}
