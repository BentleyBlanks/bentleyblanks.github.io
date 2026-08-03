export const actorProfiles = Object.freeze({
  leader: Object.freeze({ height: 1.72, shoulder: .30, waist: .105, limb: .038, head: .092, color: "#ded5bc", body: "#b9b39f", pants: "#48564e", accent: "#a64237", skin: "#c88d68", hair: "#302923", mark: "领", gait: .96, headwear: "cap", prop: "map" }),
  dog: Object.freeze({ height: .72, shoulder: .26, head: .15, color: "#a97750", body: "#a97750", pants: "#553b2d", accent: "#4f8791", skin: "#b9865e", hair: "#453028", mark: "犬", gait: 1.28, animal: true, prop: "bandana" }),
  student: Object.freeze({ height: 1.66, shoulder: .27, waist: .095, limb: .034, head: .095, color: "#6f9fbd", body: "#668fa8", pants: "#374a59", accent: "#d4b66d", skin: "#d39770", hair: "#29282a", mark: "镜", gait: 1.06, headwear: "hair", prop: "telescope" }),
  rescuer: Object.freeze({ height: 1.64, shoulder: .29, waist: .105, limb: .035, head: .094, color: "#6ca88b", body: "#65957e", pants: "#3f5149", accent: "#a94d43", skin: "#d09570", hair: "#302821", mark: "针", gait: .93, headwear: "scarf", prop: "clothRoll" }),
  blacksmith: Object.freeze({ height: 1.79, shoulder: .35, waist: .125, limb: .044, head: .09, color: "#c67552", body: "#a95f46", pants: "#443b37", accent: "#433b37", skin: "#bd7f5d", hair: "#30251f", mark: "锤", gait: .84, headwear: "headwrap", prop: "hammer" }),
  child: Object.freeze({ height: 1.38, shoulder: .24, waist: .085, limb: .032, head: .105, color: "#d4aa47", body: "#c69c44", pants: "#4f5344", accent: "#a7493d", skin: "#d79a73", hair: "#312820", mark: "信", gait: 1.22, headwear: "smallCap", prop: "satchel" }),
  scout: Object.freeze({ height: 1.70, shoulder: .29, waist: .105, limb: .036, head: .093, color: "#aeb4a2", body: "#849080", pants: "#3f4b46", accent: "#536e76", skin: "#c78d68", hair: "#2c2722", mark: "哨", gait: 1.04, headwear: "sideCap", prop: "binoculars" }),
  soldier: Object.freeze({ height: 1.76, shoulder: .31, waist: .112, limb: .039, head: .091, color: "#7b7755", body: "#66684f", pants: "#4d503d", accent: "#b39a61", skin: "#b77b5f", hair: "#352e25", mark: "日", gait: .98, headwear: "fieldCap", prop: "rifle" }),
  collaborator: Object.freeze({ height: 1.72, shoulder: .29, waist: .108, limb: .036, head: .094, color: "#59645f", body: "#4d5a58", pants: "#343e3f", accent: "#c4b489", skin: "#bd8264", hair: "#302d29", mark: "伪", gait: 1.04, headwear: "softCap", prop: "torch" })
});

export const roleDefinitions = Object.freeze({
  leader: Object.freeze({ id: "leader", name: "高传宝 · 民兵队长", skill: "调度群众 / 诱敌封闸", short: "传宝" }),
  dog: Object.freeze({ id: "dog", name: "阿土 · 流浪狗", skill: "听哨穿窄洞 / 嗅烟探水", short: "阿土" }),
  student: Object.freeze({ id: "student", name: "叶星 · 学生", skill: "望远镜标记巡逻规律", short: "叶星" }),
  rescuer: Object.freeze({ id: "rescuer", name: "赵禾 · 妇救会", skill: "缝补伪装与照护伤员", short: "赵禾" }),
  blacksmith: Object.freeze({ id: "blacksmith", name: "魏根生 · 铁匠", skill: "挖掘支护 / 布设机关", short: "根生" }),
  child: Object.freeze({ id: "child", name: "石头 · 小交通员", skill: "穿过狭口打开内闩", short: "石头" }),
  scout: Object.freeze({ id: "scout", name: "林青禾 · 武工队员", skill: "布置假象与地道声路", short: "青禾" })
});

const Cover = (id, x, width, kind, label, pose = "low", layer = "surface") => Object.freeze({ id, x, width, kind, label, pose, layer });

export const coverDefinitions = Object.freeze({
  undergroundWall: Object.freeze([
    Cover("westStable", -9.35, 1.8, "brush", "倒棚与荆条"),
    Cover("brokenCart", -4.85, 1.55, "cart", "废车草帘"),
    Cover("gateWall", -3.15, 1.45, "wall", "假门残墙"),
    Cover("bellWall", 1.3, 2.6, "wall", "钟架土墙"),
    Cover("ashStack", .35, 1.5, "hay", "柴垛"),
    Cover("fieldWall", 3.75, 1.45, "wall", "断墙"),
    Cover("supplyStack", 6.85, 1.7, "hay", "口粮草垛"),
    Cover("eastBrush", 9.55, 1.5, "brush", "东沟灌木")
  ]),
  ensemble: Object.freeze([
    Cover("westReeds", -9.9, 1.65, "brush", "沟边芦苇"),
    Cover("surveyHay", -6.7, 1.55, "hay", "晒场草垛"),
    Cover("camoWall", -3.35, 1.5, "wall", "破院墙"),
    Cover("hatchCart", -.45, 1.55, "cart", "磨盘车架"),
    Cover("courtyardBrush", 3.1, 1.5, "brush", "院角荆条"),
    Cover("transferHay", 6.15, 1.65, "hay", "转移草垛"),
    Cover("eastWall", 9.45, 1.55, "wall", "东翻口矮墙")
  ]),
  mindGame: Object.freeze([
    Cover("helmetBrush", -9.25, 1.8, "brush", "空院蒿草"),
    Cover("crackerCart", -5.1, 2.2, "cart", "铁桶车架"),
    Cover("falseWall", -1.15, 1.4, "wall", "假入口断墙"),
    Cover("wellCurb", 4.2, 1.5, "well", "井台矮墙"),
    Cover("shoeHay", 7.95, 1.65, "hay", "井边草垛"),
    Cover("eastReeds", 10.1, 1.45, "brush", "东坡芦苇")
  ]),
  rooftopBattle: Object.freeze([
    Cover("cellarWall", -7.15, 1.9, "wall", "地窖厚墙", "low", "interior"),
    Cover("brickStove", -2.25, 1.55, "stove", "砖灶与柴堆", "low", "interior"),
    Cover("westChimney", -5.65, 1.45, "chimney", "西屋烟囱", "low", "roof"),
    Cover("roofRidge", -2.3, 1.85, "ridge", "正房屋脊", "low", "roof"),
    Cover("bridgeParapet", 1.75, 1.45, "parapet", "连屋矮墙", "low", "roof"),
    Cover("eastChimney", 5.2, 1.5, "chimney", "东厢烟囱", "low", "roof"),
    Cover("hayScreen", 8.25, 1.65, "hay", "屋顶晒草架", "low", "roof")
  ])
});

export const buildOptions = Object.freeze([
  Object.freeze({ id: "flipGate", name: "翻板分割闸", cost: Object.freeze({ wood: 2, iron: 1 }), defense: 2, ventilation: 0, mechanism: "地板闸面绕铁轴翻起，立成一堵分隔墙。", motion: "平放通行 → 翻立封路", bestUse: "直道截队", note: "分割敌队最强，但会截断一段风路。" }),
  Object.freeze({ id: "floodGate", name: "引水回流闸", cost: Object.freeze({ wood: 1, iron: 2 }), defense: 1, ventilation: 1, mechanism: "木闸沿双柱槽升降，底部接入低位返水沟。", motion: "抬闸通水 → 落闸回流", bestUse: "低洼水路", note: "能迟滞推进，同时保留一条窄风路。" }),
  Object.freeze({ id: "smokeBaffle", name: "防烟导流板", cost: Object.freeze({ wood: 2, iron: 0 }), defense: 1, ventilation: 2, mechanism: "顶棚双片导流叶由侧绳改变夹角，把烟抬进空支洞。", motion: "平送主道 → 斜导排烟", bestUse: "风口与烟道", note: "把烟导回空支洞，保护群众呼吸。" })
]);

const Action = (id, x, layer, title, verb, options = {}) => Object.freeze({ id, x, layer, title, verb, ...options });
const Prop = (kind, label, support, mode = "take", options = {}) => Object.freeze({ kind, label, support, mode, ...options });

export const levelDefinitions = Object.freeze([
  Object.freeze({
    id: "undergroundWall",
    number: "关卡一",
    title: "地下长城",
    subtitle: "建造与防御循环",
    thesis: "把村庄改造成能呼吸、能转移、能分割敌队的地下网络。",
    roleIds: Object.freeze(["leader", "blacksmith", "dog"]),
    startRole: "leader",
    startX: -10,
    phases: Object.freeze([
      Object.freeze({ id: "collect", label: "夜间准备", objective: "三人分工带回材料；地道里的乡亲正在等", layer: "surface" }),
      Object.freeze({ id: "build", label: "限时挖建", objective: "吹哨让阿土钻风孔，安置乡亲并完成三处机关", layer: "tunnel" }),
      Object.freeze({ id: "defense", label: "扫荡生存", objective: "地表敲钟、扔炮仗调敌；地下封闸并转移群众", layer: "surface" }),
      Object.freeze({ id: "outcome", label: "缴获与扩展", objective: "清点缴获，决定下一轮扩建方向", layer: "tunnel" })
    ]),
    actions: Object.freeze([
      Action("collectWood", -9.2, "surface", "倒棚边码着三根可用的干木梁", "拆取", { phase: "collect", role: "blacksmith", cover: "westStable", prop: Prop("timberStack", "三根干木梁", "ground", "take", { offsetX: .5, front: true }), resource: { wood: 6 }, dialogue: "这三根没受潮。你扶棚，我一根根抽。" }),
      Action("collectIron", -4.8, "surface", "废车脚边木盘里放着铁箍和四枚销钉", "收起", { phase: "collect", role: "blacksmith", cover: "brokenCart", prop: Prop("ironFittings", "铁箍与四枚销钉", "tray", "take", { offsetX: .42, front: true }), resource: { iron: 4 }, dialogue: "四枚销子都在。闸门能锁牢。" }),
      Action("collectPowder", .4, "surface", "柴垛边矮箱上放着封口硝灰罐", "嗅查", { phase: "collect", role: "dog", cover: "ashStack", prop: Prop("powderJar", "封口硝灰罐", "lowCrate", "take", { offsetX: .42, front: true }), resource: { powder: 2 }, dialogue: "阿土没叫，罐子也没漏。传宝把它抱走。" }),
      Action("collectSupplies", 6.8, "surface", "草垛前木案上摆着药布包和两袋口粮", "搬走", { phase: "collect", role: "leader", cover: "supplyStack", prop: Prop("reliefBundle", "药布包与两袋口粮", "plankTable", "take", { offsetX: .45, front: true }), resource: { medicine: 1, grain: 2 }, dialogue: "药布给担架边。粮靠干墙放，别堵住孩子们的路。" }),
      Action("inspectWestSeep", -8.4, "tunnel", "把陶碗放进西井低洼段，辨清渗水来向与最低回流点", "验水", { phase: "build", role: "blacksmith", prop: Prop("seepBowl", "接水陶碗与湿土刻痕", "ground", "inspect"), puzzleSet: Object.freeze({ path: "survey.waterKnown", value: true }), dialogue: "水线从西井压过来，最低点就在脚下。这里不做回流闸，水会先淹老人。" }),
      Action("whistleDraftGap", -3.4, "tunnel", "吹两短一长，让阿土钻进人过不去的低风孔", "吹哨", { phase: "build", role: "leader", prop: Prop("draftRibbon", "低风孔前的麻布风向条", "wallNiche", "inspect"), dogCommand: Object.freeze({ targetX: -5.85, targetLayer: "tunnel", label: "西侧低风孔", task: "叼回风向布条", workTime: 1.2 }), puzzleSet: Object.freeze({ path: "survey.windKnown", value: true }), dialogue: "布条往东飘。东翻口进烟时，只能把烟抬进上方空支洞。" }),
      Action("probeCenterSoil", -.75, "tunnel", "用探钎敲出中央直道两侧的实土与空腔", "探土", { phase: "build", role: "blacksmith", prop: Prop("soilProbe", "探土铁钎与三处敲击记号", "wallNiche", "inspect"), puzzleSet: Object.freeze({ path: "survey.centerKnown", value: true }), dialogue: "左边是实土，右边有回身湾。分割闸要横在直道，不能堵死避难湾。" }),
      Action("digWestRefuge", -7.7, "tunnel", "沿回流高线挖出可容老人侧卧的西支洞", "挖掘", { phase: "build", role: "blacksmith", puzzleRequires: Object.freeze([{ path: "survey.waterKnown", value: true, label: "先在西井低洼段验明水线" }]), excavate: "west", puzzleSet: Object.freeze({ path: "links.west", value: true }), dialogue: "支洞抬高一掌，返水沟留在脚边。木撑跟着我往前走。" }),
      Action("buildSlotA", -7, "tunnel", "西支洞机关位", "施工", { phase: "build", role: "blacksmith", requires: ["digWestRefuge"], buildSlot: 0 }),
      Action("digCenterBypass", -.7, "tunnel", "避开实土柱，掘开中央避难湾与回身短道", "挖掘", { phase: "build", role: "blacksmith", puzzleRequires: Object.freeze([{ path: "survey.centerKnown", value: true, label: "先用探钎辨清实土与空腔" }]), excavate: "center", puzzleSet: Object.freeze({ path: "links.center", value: true }), dialogue: "实土柱不能动。担架从右边回身，分割闸留在直道。" }),
      Action("buildSlotB", 0, "tunnel", "中央短湾机关位", "施工", { phase: "build", role: "blacksmith", requires: ["digCenterBypass"], buildSlot: 1 }),
      Action("briefCivilians", 3.2, "tunnel", "把老人、担架与孩子分到三条已挖通的避险支路", "分组", { phase: "build", role: "leader", puzzleRequires: Object.freeze([{ path: "links.west", value: true, label: "西支洞还没有与主道连通" }, { path: "links.center", value: true, label: "中央回身湾还没有连通" }, { path: "links.east", value: true, label: "东侧空支洞还没有连通" }]), puzzleSet: Object.freeze({ path: "routes.civiliansBriefed", value: true }), dialogue: "老人走西边高支洞，担架留中湾，孩子去东侧高窝。听见两下钟，再换路。" }),
      Action("digEastPocket", 7.7, "tunnel", "顺着上升风路挖出东侧空支洞与高位藏身窝", "挖掘", { phase: "build", role: "blacksmith", puzzleRequires: Object.freeze([{ path: "survey.windKnown", value: true, label: "先让阿土带回低风孔的风向证据" }]), excavate: "east", puzzleSet: Object.freeze({ path: "links.east", value: true }), dialogue: "空支洞要高过主道，导烟板一抬，烟就会越过乡亲往这里走。" }),
      Action("buildSlotC", 7, "tunnel", "东翻口机关位", "施工", { phase: "build", role: "blacksmith", requires: ["digEastPocket"], buildSlot: 2 }),
      Action("startDefense", 9.2, "tunnel", "沿地道网逐段复核水路、风路、分割闸和群众去向", "迎敌", { phase: "build", role: "leader", requires: ["inspectWestSeep", "whistleDraftGap", "probeCenterSoil", "briefCivilians"], phaseGate: true }),
      Action("placeDecoyCart", -8.7, "surface", "躲在倒棚后，把重车辙压向西边空院", "诱导", { phase: "defense", role: "leader", cover: "westStable", defenseStep: "lure", dialogue: "车印往西压。让他们离真入口越远越好。" }),
      Action("ringAlarmBell", 1.85, "surface", "贴着钟架土墙拉动长绳敲响警钟，把东口敌兵引向钟楼", "敲钟", { phase: "defense", role: "leader", cover: "bellWall", requires: ["placeDecoyCart"], diversion: Object.freeze({ kind: "bell", targetX: .75, duration: 14, label: "警钟回声", weakens: "smoke" }), dialogue: "当——当——！他们离开东翻口了。趁现在关导烟板。" }),
      Action("closeSurfaceGate", -3.15, "surface", "等敌队过半后，在假门残墙后关闭地表假门", "分割", { phase: "defense", role: "leader", cover: "gateWall", requires: ["placeDecoyCart"], defenseStep: "split", dialogue: "后半队还没进来……再等。好，关！" }),
      Action("throwFirecrackers", 9.35, "surface", "从东沟灌木后把一串炮仗扔进远沟，引走西井灌水队", "扔炮仗", { phase: "defense", role: "leader", cover: "eastBrush", requires: ["ringAlarmBell"], consume: Object.freeze({ powder: 1 }), diversion: Object.freeze({ kind: "crackers", targetX: 10.65, duration: 14, label: "东沟炮仗", weakens: "water" }), dialogue: "响在东沟，人会往东追。西井那边一下少了三个。" }),
      Action("warnWater", -8.3, "tunnel", "让阿土确认西井渗水声", "听水", { phase: "defense", role: "dog", hazardScout: "water", dialogue: "西边土里响了。不是雨，是他们往井里灌水。" }),
      Action("triggerSlotA", -7, "tunnel", "触发西支洞机关", "扳闸", { phase: "defense", role: "blacksmith", requires: ["closeSurfaceGate"], triggerSlot: 0 }),
      Action("triggerSlotB", 0, "tunnel", "触发中央短湾机关", "扳闸", { phase: "defense", role: "blacksmith", requires: ["triggerSlotA"], triggerSlot: 1 }),
      Action("whistleSmokeLatch", 4.85, "tunnel", "隔着低梁吹哨，让阿土穿过烟道侧孔拉下导烟绳", "吹哨", { phase: "defense", role: "leader", requires: ["closeSurfaceGate"], dogCommand: Object.freeze({ targetX: 8.95, targetLayer: "tunnel", label: "东翻口烟道侧孔", task: "咬住麻绳拉开侧闸", workTime: 1.45 }), hazardScout: "smoke", dogRelief: "smoke", dialogue: "绳落了！侧闸已经开了，烟会先走空支洞。" }),
      Action("triggerSlotC", 7, "tunnel", "等阿土拉开烟道侧闸后，触发东翻口机关", "扳闸", { phase: "defense", role: "blacksmith", requires: ["triggerSlotB", "whistleSmokeLatch"], triggerSlot: 2 }),
      Action("inventoryCapture", 9.2, "tunnel", "支洞口散着敌人弃下的地图、口粮箱和工具", "清点", { phase: "outcome", prop: Prop("capturePile", "遗留地图、口粮箱与工具", "ground"), outcome: true, dialogue: "先看有没有药。粮也收好，枪最后再算。" })
    ])
  }),
  Object.freeze({
    id: "ensemble",
    number: "关卡二",
    title: "烽火群像",
    subtitle: "多角色生存解谜循环",
    thesis: "没有人能独自通过封锁；每一种平凡能力都是队伍的一段路。",
    roleIds: Object.freeze(["dog", "student", "rescuer", "blacksmith", "child"]),
    startRole: "dog",
    startX: -10,
    phases: Object.freeze([
      Object.freeze({ id: "survey", label: "观察与情报", objective: "用嗅觉和望远镜找出巡逻空隙", layer: "surface" }),
      Object.freeze({ id: "cooperate", label: "能力接力", objective: "修网、抬门、钻洞并打开内闩", layer: "surface" }),
      Object.freeze({ id: "transfer", label: "转移与记忆", objective: "带走伤员、粮食和联络员，找回两件记忆物", layer: "tunnel" }),
      Object.freeze({ id: "outcome", label: "新区域联通", objective: "让全员从东翻口离开", layer: "tunnel" })
    ]),
    actions: Object.freeze([
      Action("sniffRoute", -9, "surface", "藏在沟边芦苇里，让阿土嗅出巡逻犬没有走过的低风孔", "钻风孔", { phase: "survey", role: "dog", cover: "westReeds", prop: Prop("draftRibbon", "低风孔边沾泥的草叶", "ground", "inspect"), effect: "enterTunnel", puzzleSet: Object.freeze({ path: "transfer.dogRouteKnown", value: true }), dialogue: "阿土从草根下钻进去了。那条孔通地道，守兵的狗没闻到。" }),
      Action("markPatrol", -6.2, "surface", "借晒场草垛遮挡，把探照灯十一秒回转窗画在土墙上", "标记", { phase: "survey", role: "student", cover: "surveyHay", puzzleRequires: Object.freeze([{ path: "transfer.dogRouteKnown", value: true, label: "先让阿土确认低风孔没有巡逻犬气味" }]), prop: Prop("routeMarker", "土墙上的灯影刻度", "wallNiche", "inspect"), puzzleSet: Object.freeze({ path: "transfer.patrolWindowKnown", value: true }), dialogue: "灯扫到井台再转回来，一共十一下。每个人只走一段，别挤在同一片空地。" }),
      Action("repairCamo", -3.4, "surface", "躲在破院墙后，把地道口的秸秆伪装补成自然下垂", "缝补", { phase: "cooperate", role: "rescuer", cover: "camoWall", requires: ["markPatrol"], prop: Prop("camoNet", "破损的秸秆伪装网", "wallNiche", "inspect"), puzzleSet: Object.freeze({ path: "transfer.camoReady", value: true }), dialogue: "边沿留松一点。根生从下头托门时，外面只会像风吹过。" }),
      Action("braceHatchBelow", -1.1, "tunnel", "从地道一侧把叉木顶进磨盘暗门的承重槽", "支门", { phase: "cooperate", role: "blacksmith", requires: ["repairCamo"], prop: Prop("supportBrace", "暗门下方的叉木与承重槽", "ground", "operate"), puzzleSet: Object.freeze({ path: "transfer.hatchBraced", value: true }), dialogue: "叉木吃上劲了。上面抬磨盘，门不会猛地落下来。" }),
      Action("liftHatch", -.6, "surface", "隔着磨盘车架抬起由地下叉木承住的重暗门", "抬门", { phase: "cooperate", role: "blacksmith", cover: "hatchCart", requires: ["repairCamo", "braceHatchBelow"], puzzleSet: Object.freeze({ path: "transfer.hatchOpen", value: true }), dialogue: "地下托住了。门抬到一掌高就停，石头从侧边进去。" }),
      Action("crawlGap", .2, "surface", "从磨盘暗门只够孩子通过的侧缝钻入地道", "钻入", { phase: "cooperate", role: "child", cover: "hatchCart", requires: ["liftHatch"], effect: "enterTunnel", puzzleSet: Object.freeze({ path: "transfer.childInside", value: true }), dialogue: "别再抬了，我过去了。听见我敲两下，再松叉木。" }),
      Action("unbarGate", 3.1, "tunnel", "石头从内侧先托门、再依次抽出两根横木门闩", "开闩", { phase: "cooperate", role: "child", requires: ["crawlGap"], prop: Prop("innerLatch", "双木门闩与内侧拉绳", "wallNiche", "operate"), puzzleSet: Object.freeze({ path: "transfer.innerGateOpen", value: true }), dialogue: "第一根出来了。外头先别推……好，第二根也松了。" }),
      Action("inspectForkClearance", -8.35, "tunnel", "让阿土分别钻过高支洞与低梁孔，带回两条路的净空和积水", "探岔", { phase: "transfer", role: "dog", prop: Prop("routeMarker", "西岔口两侧的爪印与水痕", "ground", "inspect"), puzzleSet: Object.freeze({ path: "transfer.forkKnown", value: true }), dialogue: "高支洞宽，顶土松；低梁孔窄，底下有水。担架和粮不能走同一条路。" }),
      Action("shoreWideBranch", -6.55, "tunnel", "给西侧高支洞补上双柱横梁，让担架能平着通过", "支护", { phase: "transfer", role: "blacksmith", puzzleRequires: Object.freeze([{ path: "transfer.forkKnown", value: true, label: "先让阿土探清两条支洞的净空" }]), prop: Prop("supportBrace", "高支洞的双柱横梁", "ground", "operate"), puzzleSet: Object.freeze({ path: "transfer.wideSupported", value: true }), dialogue: "横梁压住松土了。担架走这里，不用把伤员立起来。" }),
      Action("openLowDrain", 2.85, "tunnel", "让石头钻到中央低梁孔另一端，拔开贴地排水小闸", "排水", { phase: "transfer", role: "child", puzzleRequires: Object.freeze([{ path: "transfer.forkKnown", value: true, label: "先探清低梁孔的积水位置" }]), prop: Prop("drainSluice", "低梁孔的贴地排水闸", "ground", "operate"), puzzleSet: Object.freeze({ path: "transfer.lowDrainOpen", value: true }), dialogue: "水往沟里走了。人还是过不去，大粮袋拆小以后能贴地递过去。" }),
      Action("markWoundedLow", -5.55, "tunnel", "把担架路线误画进低梁孔", "改线", { phase: "transfer", role: "student", repeatable: true, prop: Prop("routeMarker", "担架岔路木牌：低梁孔", "ground", "operate"), puzzleChoice: Object.freeze({ path: "transfer.woundedRoute", value: "low", label: "担架 → 低梁孔" }) }),
      Action("markWoundedWide", -4.05, "tunnel", "把担架路线画进已支护的高支洞", "改线", { phase: "transfer", role: "student", repeatable: true, prop: Prop("routeMarker", "担架岔路木牌：高支洞", "ground", "operate"), puzzleChoice: Object.freeze({ path: "transfer.woundedRoute", value: "wide", label: "担架 → 高支洞" }) }),
      Action("markGrainWide", -.65, "tunnel", "把粮袋路线误画进只供担架通行的高支洞", "改线", { phase: "transfer", role: "student", repeatable: true, prop: Prop("routeMarker", "粮袋岔路木牌：高支洞", "ground", "operate"), puzzleChoice: Object.freeze({ path: "transfer.grainRoute", value: "wide", label: "粮袋 → 高支洞" }) }),
      Action("markGrainLow", 1.05, "tunnel", "把拆小的粮包路线画进排水后的低梁孔", "改线", { phase: "transfer", role: "student", repeatable: true, prop: Prop("routeMarker", "粮袋岔路木牌：低梁孔", "ground", "operate"), puzzleChoice: Object.freeze({ path: "transfer.grainRoute", value: "low", label: "粮袋 → 低梁孔" }) }),
      Action("findLetter", -9.35, "tunnel", "家书压在西岔口壁龛的瓦罐旁", "收信", { phase: "transfer", role: "dog", prop: Prop("hiddenLetter", "瓦罐旁的折角家书", "lowCrate"), memory: "一封没有寄出的家书", optional: true, dialogue: "瓦罐旁边有封信。是老周的字……先收好，出去再看。" }),
      Action("findThimble", 4.25, "tunnel", "铜顶针立在低梁孔出口的蓝布木案上", "拾取", { phase: "transfer", role: "rescuer", prop: Prop("thimble", "蓝布木案上的铜顶针", "plankTable"), memory: "磨亮的铜顶针", optional: true, dialogue: "是小安的顶针。带上吧，别让它留这儿。" }),
      Action("moveWounded", -2.65, "tunnel", "按木牌把伤员担架送入选定支洞", "送担架", { phase: "transfer", role: "rescuer", puzzleRequires: Object.freeze([{ path: "transfer.wideSupported", value: true, label: "高支洞还没有支护，担架不能进入" }]), puzzleCommit: Object.freeze({ id: "woundedRoute", expected: Object.freeze([{ path: "transfer.woundedRoute", value: "wide" }]), failText: "低梁孔连担架把手都过不去。伤员不能侧翻，回岔口重画路线。" }), prop: Prop("woundedStretcher", "岔口前的伤员担架", "ground", "take", { offsetX: .15 }), rescue: "wounded", dialogue: "叔，别动。高支洞已经撑牢，担架能平着过去。" }),
      Action("moveGrain", 5.85, "tunnel", "把大粮袋拆成小包，再按木牌从选定支洞递送", "拆包递粮", { phase: "transfer", role: "blacksmith", puzzleRequires: Object.freeze([{ path: "transfer.lowDrainOpen", value: true, label: "低梁孔仍在积水，先从另一端打开排水闸" }]), puzzleCommit: Object.freeze({ id: "grainRoute", expected: Object.freeze([{ path: "transfer.grainRoute", value: "low" }]), failText: "高支洞要留给担架转身，大粮袋也会刮坏支撑。拆成小包，改走排水后的低梁孔。" }), prop: Prop("grainSacks", "待拆分的两只大粮袋", "pallet"), rescue: "grain", dialogue: "绳口解开，分成六小包。石头在低梁那头接，一包一包递。" }),
      Action("traceCourierKnock", 8.55, "tunnel", "让阿土贴着三处分岔土壁，找出敲击声最清楚的一面", "听墙", { phase: "transfer", role: "dog", prop: Prop("soilProbe", "三处敲击记号与回声土壁", "wallNiche", "inspect"), puzzleSet: Object.freeze({ path: "transfer.courierBearingKnown", value: true }), dialogue: "阿土停在东墙。声音不是前头传来的，联络员在隔壁空支洞。" }),
      Action("freeCourier", 9.25, "tunnel", "按三长一短回应东墙，并从侧闩打开联络员所在支洞", "回应开闩", { phase: "transfer", role: "student", puzzleRequires: Object.freeze([{ path: "transfer.courierBearingKnown", value: true, label: "先让阿土沿土壁找出敲击声的真实方向" }]), rescue: "courier", dialogue: "三长一短回过去了。老周，再敲一下……是他，他还醒着！" }),
      Action("escortExit", 10.4, "tunnel", "让五名伙伴与转移队逐名通过东翻口", "离开", { phase: "outcome", role: "child", requires: ["moveWounded", "moveGrain", "freeCourier"], outcome: true, dialogue: "赵姨，老周出来了。阿土也在。人齐了，我关门。" })
    ])
  }),
  Object.freeze({
    id: "mindGame",
    number: "关卡三",
    title: "兵民诡道",
    subtitle: "非对称潜行与心理战循环",
    thesis: "让敌人不断追逐错误，让警觉变成疲惫，让恐惧瓦解扫荡队形。",
    roleIds: Object.freeze(["scout", "dog"]),
    startRole: "scout",
    startX: -10,
    phases: Object.freeze([
      Object.freeze({ id: "recon", label: "听声辨路", objective: "在地表读脚印，在地下敲墙，找出敌军来向与空支洞", layer: "surface" }),
      Object.freeze({ id: "compose", label: "编织假情报", objective: "反复调整可见诱饵、地下声路和假翻口，制造三处矛盾", layer: "tunnel" }),
      Object.freeze({ id: "execute", label: "误导入网", objective: "依次露出西院痕迹、从东后方传声，再落下空支洞闸", layer: "surface" }),
      Object.freeze({ id: "outcome", label: "战果转化", objective: "收取地图与电台，预判下一轮扫荡", layer: "tunnel" })
    ]),
    actions: Object.freeze([
      Action("readSurfaceTraces", -9, "surface", "藏在蒿草后分辨鞋印、刺刀鞘划痕和巡逻回身方向", "读痕", { phase: "recon", role: "scout", cover: "helmetBrush", prop: Prop("routeMarker", "空院泥地里的两组鞋印", "ground", "inspect"), puzzleSet: Object.freeze({ path: "deception.approachKnown", value: true }), dialogue: "他们从中院进，先看西墙，再朝东井转。要让第一眼和第一声对不上。" }),
      Action("sniffEchoNetwork", -.65, "tunnel", "让阿土沿三只声孔嗅风，找出能把声音送到敌军身后的东声道", "探声孔", { phase: "recon", role: "dog", prop: Prop("hornValve", "三路铁皮声孔与麻绳风标", "wallNiche", "inspect"), puzzleSet: Object.freeze({ path: "deception.echoKnown", value: true }), dialogue: "东声孔有回风。人在中院时，声音会从他们背后冒出来。" }),
      Action("tapEmptyBranch", 6.6, "tunnel", "沿东支洞敲墙，确认尽头为空腔且没有乡亲藏身", "验空洞", { phase: "recon", role: "scout", prop: Prop("soilProbe", "空支洞的敲击记号", "wallNiche", "inspect"), puzzleSet: Object.freeze({ path: "deception.emptyBranchKnown", value: true }), dialogue: "回声空，土顶也稳。假翻口把人引到这边，落闸后不会伤着乡亲。" }),

      Action("chooseDecoyWest", -9, "surface", "把假鞋印和半截井绳留在敌军第一眼会看见的西空院", "改诱饵", { phase: "compose", role: "scout", cover: "helmetBrush", repeatable: true, prop: Prop("decoyBundle", "西空院的假鞋印与半截井绳", "ground", "operate"), puzzleChoice: Object.freeze({ path: "deception.visibleDecoy", value: "west", label: "可见痕迹 → 西空院" }) }),
      Action("chooseDecoyEast", 8.05, "surface", "把假鞋印留在声音将出现的东井旁", "改诱饵", { phase: "compose", role: "scout", cover: "shoeHay", repeatable: true, prop: Prop("decoyBundle", "东井旁的假鞋印与军鞋", "ground", "operate"), puzzleChoice: Object.freeze({ path: "deception.visibleDecoy", value: "east", label: "可见痕迹 → 东井" }) }),
      Action("routeHornWest", -1.75, "tunnel", "把铁皮喇叭接入西墙正面的短声道", "转声门", { phase: "compose", role: "scout", repeatable: true, prop: Prop("hornValve", "西墙正面声门", "wallNiche", "operate"), puzzleChoice: Object.freeze({ path: "deception.acousticRoute", value: "westFront", label: "声音 → 西墙正面" }) }),
      Action("routeHornEastRear", .55, "tunnel", "把铁皮喇叭接入绕到巡逻队身后的东声道", "转声门", { phase: "compose", role: "scout", repeatable: true, prop: Prop("hornValve", "东后方回折声门", "wallNiche", "operate"), puzzleChoice: Object.freeze({ path: "deception.acousticRoute", value: "eastRear", label: "声音 → 东后方" }) }),
      Action("openWestFalseEntrance", 4.15, "tunnel", "打开西侧假翻口，让它与西院痕迹连成一条太顺的线索", "改假口", { phase: "compose", role: "scout", repeatable: true, prop: Prop("falseHatch", "西侧敞开的假翻口", "ground", "operate"), puzzleChoice: Object.freeze({ path: "deception.falseEntrance", value: "westOpen", label: "假翻口 → 西侧敞开" }) }),
      Action("sealCenterFalseEntrance", 6.65, "tunnel", "封住中院假翻口，只留一道新土缝把敌军引向东空支洞", "改假口", { phase: "compose", role: "scout", repeatable: true, prop: Prop("falseHatch", "中院封闭假口与东向土缝", "ground", "operate"), puzzleChoice: Object.freeze({ path: "deception.falseEntrance", value: "centerSealed", label: "假翻口 → 中封东引" }) }),
      Action("testDeception", 2.15, "tunnel", "敲响试音木梆，检查地表痕迹、地下声路和假翻口是否互相矛盾", "试局", { phase: "compose", role: "scout", prop: Prop("routeMarker", "三路试音木梆与敌情草图", "plankTable", "operate"), puzzleCommit: Object.freeze({ id: "deception", expected: Object.freeze([{ path: "deception.visibleDecoy", value: "west" }, { path: "deception.acousticRoute", value: "eastRear" }, { path: "deception.falseEntrance", value: "centerSealed" }]), failAlert: 14, failText: "三条线索还指向同一处，敌军顺着查就会识破。要让西边有痕迹、东后方有声音、中口封住却留下东向土缝。" }), dialogue: "西边看见人走过，声音却从东后方来；中口是新封土，土缝又往东。三条线索互相打架了。" }),

      Action("springWestDecoy", -9, "surface", "等敌军进入中院后，从蒿草后挑动西院假鞋印旁的井绳", "露痕", { phase: "execute", role: "scout", cover: "helmetBrush", prop: Prop("decoyBundle", "西空院的活动假痕迹", "ground", "operate"), puzzleRequires: Object.freeze([{ path: "deception.solved", value: true, label: "先在地下完成三路假情报试局" }]), trick: true, alert: 6, morale: -12, dialogue: "他们看见西院痕迹了。别再动，等前排转过去。" }),
      Action("pulseEastHorn", .55, "tunnel", "在敌军面朝西院时，敲一次东后方声道的铁皮喇叭", "传声", { phase: "execute", role: "scout", requires: ["springWestDecoy"], prop: Prop("hornValve", "东后方声道铁皮喇叭", "wallNiche", "operate"), trick: true, alert: 5, morale: -18, dialogue: "声音落在他们背后。前后两排都回头了，队形已经散开。" }),
      Action("dropEmptyBranchGate", 6.65, "tunnel", "等最后两人追进东空支洞，落下隔离闸并打开原路出口", "落闸", { phase: "execute", role: "scout", requires: ["pulseEastHorn"], prop: Prop("falseHatch", "东空支洞分流闸", "ground", "operate"), puzzleSet: Object.freeze({ path: "deception.enemyBelief", value: "eastEmptyBranch" }), panicStep: true, morale: -28, dialogue: "前队进了空支洞，后队听见闸响只敢往外退。别追，让他们自己带着错地图走。" }),
      Action("captureIntel", 8.8, "tunnel", "东空支洞木箱上分开放着撤退时遗下的地图和电台", "收取", { phase: "outcome", requires: ["dropEmptyBranchGate"], prop: Prop("fieldRadioMap", "分开放置的地图与电台", "crate", "take", { offsetX: 1.05 }), outcome: true, dialogue: "地图在这儿。电台别碰旋钮，回去让叶星听。" })
    ])
  }),
  Object.freeze({
    id: "rooftopBattle",
    number: "关卡四",
    title: "屋脊火线",
    subtitle: "地道入室与有限火力战",
    thesis: "从地道钻进民居、由暗梯登上屋脊；每一发子弹都要替一条撤离路争时间。",
    roleIds: Object.freeze(["leader"]),
    startRole: "leader",
    startX: -10,
    phases: Object.freeze([
      Object.freeze({ id: "infiltrate", label: "地道入室", objective: "沿支洞找到西屋地窖翻板，从屋内暗口上行", layer: "tunnel" }),
      Object.freeze({ id: "arm", label: "屋内取械", objective: "从实物枪架、弹盒和布包中取得有限武器，打开屋顶暗梯", layer: "interior" }),
      Object.freeze({ id: "engage", label: "屋脊火线", objective: "借烟囱与屋脊隐蔽，射击、投雷或从背后无声制服敌兵", layer: "roof" }),
      Object.freeze({ id: "secure", label: "打开撤离线", objective: "确认屋脊安全，在东厢房顶放下通往后巷的绳梯", layer: "roof" })
    ]),
    actions: Object.freeze([
      Action("unboltCellarHatch", -7.15, "tunnel", "木撑后藏着通往西屋地窖的双栓翻板", "拔栓", { phase: "infiltrate", role: "leader", dialogue: "上头就是西屋地窖。先托住翻板，再拔木栓，别让它砸响。" }),
      Action("takeRifle", -5.7, "interior", "墙上旧枪架挂着一支缴获步枪", "取枪", { phase: "arm", role: "leader", prop: Prop("combatRifle", "枪架上的缴获步枪", "rifleRack", "take", { offsetX: .25, front: true }), combatPickup: Object.freeze({ kind: "rifle", amount: 1 }), dialogue: "枪机还能用。不到看清目标，别扣扳机。" }),
      Action("takeAmmo", -3.65, "interior", "方桌上的木弹盒只剩四发步枪弹", "装弹", { phase: "arm", role: "leader", requires: ["takeRifle"], prop: Prop("ammoBox", "桌上的四发木弹盒", "plankTable", "take", { offsetX: .25, front: true }), combatPickup: Object.freeze({ kind: "ammo", amount: 4 }), dialogue: "就四发。屋顶上有多少人，心里先数清楚。" }),
      Action("takeGrenade", -1.65, "interior", "砖灶旁的旧布包里压着一枚手榴弹", "收起", { phase: "arm", role: "leader", requires: ["takeAmmo"], prop: Prop("combatGrenade", "砖灶旁的一枚手榴弹", "lowCrate", "take", { offsetX: .22, front: true }), combatPickup: Object.freeze({ kind: "grenade", amount: 1 }), dialogue: "只有一枚。真被堵死再用，别往民房里扔。" }),
      Action("openRoofHatch", .75, "interior", "房梁后的木梯通向瓦面暗口", "推开", { phase: "arm", role: "leader", requires: ["takeRifle", "takeAmmo", "takeGrenade"], dialogue: "我先把瓦片托起来。上去以后，烟囱和屋脊都能挡枪。" }),
      Action("lowerEscapeLadder", 9.25, "roof", "东厢屋檐下捆着通往后巷的麻绳梯", "放梯", { phase: "secure", role: "leader", outcome: true, dialogue: "绳梯到底了。伤员先走，最后一个人把屋顶暗口盖回去。" })
    ])
  })
]);

export const levelById = Object.freeze(Object.fromEntries(levelDefinitions.map((level) => [level.id, level])));
