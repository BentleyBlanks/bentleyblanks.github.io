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

const Cover = (id, x, width, kind, label, pose = "low") => Object.freeze({ id, x, width, kind, label, pose });

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
  ])
});

export const buildOptions = Object.freeze([
  Object.freeze({ id: "flipGate", name: "翻板分割闸", cost: Object.freeze({ wood: 2, iron: 1 }), defense: 2, ventilation: 0, note: "分割敌队最强，但会截断一段风路。" }),
  Object.freeze({ id: "floodGate", name: "引水回流闸", cost: Object.freeze({ wood: 1, iron: 2 }), defense: 1, ventilation: 1, note: "能迟滞推进，同时保留一条窄风路。" }),
  Object.freeze({ id: "smokeBaffle", name: "防烟导流板", cost: Object.freeze({ wood: 2, iron: 0 }), defense: 1, ventilation: 2, note: "把烟导回空支洞，保护群众呼吸。" })
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
      Action("whistleDraftGap", -3.4, "tunnel", "吹两短一长，让阿土钻进人过不去的低风孔", "吹哨", { phase: "build", role: "leader", dogCommand: Object.freeze({ targetX: -5.85, targetLayer: "tunnel", label: "西侧低风孔", task: "叼回风向布条", workTime: 1.2 }), dialogue: "布条往东飘。阿土没走明洞，是从低风孔绕过去的。" }),
      Action("digWestRefuge", -7.7, "tunnel", "向西挖出可容老人侧卧的高位支洞", "挖掘", { phase: "build", role: "blacksmith", excavate: "west", dialogue: "这层土干，顶上再留一掌厚。木撑跟着我往前走。" }),
      Action("buildSlotA", -7, "tunnel", "西支洞机关位", "施工", { phase: "build", role: "blacksmith", requires: ["digWestRefuge"], buildSlot: 0 }),
      Action("digCenterBypass", -.7, "tunnel", "掘开中央避难湾与回身短道", "挖掘", { phase: "build", role: "blacksmith", excavate: "center", dialogue: "担架要在这里回身。再削半尺，别让梁压着人。" }),
      Action("buildSlotB", 0, "tunnel", "中央短湾机关位", "施工", { phase: "build", role: "blacksmith", requires: ["digCenterBypass"], buildSlot: 1 }),
      Action("briefCivilians", 3.2, "tunnel", "把三组乡亲的避险方向说清楚", "分组", { phase: "build", role: "leader", dialogue: "老人跟担架走中湾，孩子听钟走东口。谁也别自己乱跑。" }),
      Action("digEastPocket", 7.7, "tunnel", "在东翻口后挖出错层藏身窝", "挖掘", { phase: "build", role: "blacksmith", excavate: "east", dialogue: "东口容易进烟，藏身窝得比主道高，底下还要留返水沟。" }),
      Action("buildSlotC", 7, "tunnel", "东翻口机关位", "施工", { phase: "build", role: "blacksmith", requires: ["digEastPocket"], buildSlot: 2 }),
      Action("startDefense", 9.2, "tunnel", "确认风路、机关和群众去向后提前迎敌", "迎敌", { phase: "build", role: "leader", requires: ["whistleDraftGap", "briefCivilians"], phaseGate: true }),
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
      Action("sniffRoute", -9, "surface", "藏在沟边芦苇里，嗅出草垛后没有机油味的窄路", "嗅闻", { phase: "survey", role: "dog", cover: "westReeds", dialogue: "呜……（阿土停在草垛后，回头等人。）" }),
      Action("markPatrol", -6.2, "surface", "借晒场草垛遮挡，记录探照灯每次转回的间隔", "标记", { phase: "survey", role: "student", cover: "surveyHay", requires: ["sniffRoute"], dialogue: "我数过了，灯一过去，够咱们跑到东墙。跟紧我。" }),
      Action("repairCamo", -3.4, "surface", "躲在破院墙后，补好被风撕开的秸秆伪装网", "缝补", { phase: "cooperate", role: "rescuer", cover: "camoWall", requires: ["markPatrol"], dialogue: "别拉太紧，风一吹就不像真的了。这样，刚好。" }),
      Action("liftHatch", -.6, "surface", "借磨盘车架遮住动作，拉开压着石磨的重暗门", "抬门", { phase: "cooperate", role: "blacksmith", cover: "hatchCart", requires: ["repairCamo"], dialogue: "扶住磨盘。门一响，咱们谁都走不了。" }),
      Action("crawlGap", .2, "surface", "从磨盘车架下方的狭口钻入地道", "钻入", { phase: "cooperate", role: "child", cover: "hatchCart", requires: ["liftHatch"], effect: "enterTunnel", dialogue: "绳子给我。我瘦，能过去。" }),
      Action("unbarGate", 3.1, "tunnel", "从内侧抽出双木门闩", "开闩", { phase: "cooperate", role: "child", requires: ["crawlGap"], dialogue: "第一根出来了……你们托住门，我拔第二根。" }),
      Action("findLetter", 3.8, "tunnel", "家书压在壁龛矮箱的瓦罐旁", "收信", { phase: "transfer", role: "dog", requires: ["unbarGate"], prop: Prop("hiddenLetter", "瓦罐旁的折角家书", "lowCrate"), memory: "一封没有寄出的家书", optional: true, dialogue: "瓦罐旁边有封信。是老周的字……先收好，出去再看。" }),
      Action("findThimble", 6.6, "tunnel", "铜顶针立在缝纫员留下的蓝布木案上", "拾取", { phase: "transfer", role: "rescuer", requires: ["unbarGate"], prop: Prop("thimble", "蓝布木案上的铜顶针", "plankTable"), memory: "磨亮的铜顶针", optional: true, dialogue: "是小安的顶针。带上吧，别让它留这儿。" }),
      Action("moveWounded", 5.2, "tunnel", "伤员躺在窄弯前的木担架上", "抬担架", { phase: "transfer", role: "rescuer", requires: ["unbarGate"], prop: Prop("woundedStretcher", "担架上的伤员", "ground", "take", { offsetX: .15 }), rescue: "wounded", dialogue: "叔，疼就抓我胳膊。前头那个弯，慢一点就能过。" }),
      Action("moveGrain", 8, "tunnel", "低梁前堆着两只过不去的大粮袋", "拆包搬运", { phase: "transfer", role: "blacksmith", requires: ["moveWounded"], prop: Prop("grainSacks", "两只大粮袋", "pallet"), rescue: "grain", dialogue: "大袋过不去，拆成小包。我多跑两趟。" }),
      Action("freeCourier", 9.25, "tunnel", "辨认联络员留下的敲击暗号", "回应", { phase: "transfer", role: "student", requires: ["moveGrain"], rescue: "courier", dialogue: "听，三长一短。是咱们的人，他还醒着！" }),
      Action("escortExit", 10.4, "tunnel", "让五名伙伴与转移队逐名通过东翻口", "离开", { phase: "outcome", role: "child", requires: ["moveWounded", "moveGrain", "freeCourier"], outcome: true, dialogue: "赵姨，老周出来了。阿土也在。人齐了，我关门。" })
    ])
  }),
  Object.freeze({
    id: "mindGame",
    number: "关卡三",
    title: "兵民诡道",
    subtitle: "非对称潜行与心理战循环",
    thesis: "让敌人不断追逐错误，让警觉变成疲惫，让恐惧瓦解扫荡队形。",
    roleIds: Object.freeze(["scout"]),
    startRole: "scout",
    startX: -10,
    phases: Object.freeze([
      Object.freeze({ id: "harass", label: "制造异常", objective: "选择不同诡计，压低士气同时控制警觉度", layer: "surface" }),
      Object.freeze({ id: "panic", label: "恐慌连锁", objective: "利用拒绝入屋和胡乱警戒分割敌队", layer: "surface" }),
      Object.freeze({ id: "outcome", label: "战果转化", objective: "收取地图与电台，预判下一轮扫荡", layer: "tunnel" })
    ]),
    actions: Object.freeze([
      Action("placeHelmet", -9, "surface", "藏在空院蒿草后，把旧军帽挑上墙头", "布疑", { phase: "harass", cover: "helmetBrush", trick: true, alert: 12, morale: -10, dialogue: "风一吹它就动。够他们盯半天了。" }),
      Action("fireCracker", -4.8, "surface", "在铁桶车架后，把鞭炮声压向西坡", "引声", { phase: "harass", cover: "crackerCart", trick: true, alert: 24, morale: -18, dialogue: "隔一会儿再响第二串。别让他们听出是鞭炮。" }),
      Action("routeHorn", -.5, "tunnel", "把铁皮喇叭接入通往敌后的声孔", "传声", { phase: "harass", trick: true, alert: 10, morale: -20, dialogue: "喇叭口对准后墙。喊一声就走，别等他们回头。" }),
      Action("hideWellRope", 4.2, "surface", "井台木桩上盘着正在使用的井绳", "收绳", { phase: "harass", cover: "wellCurb", prop: Prop("ropeCoil", "井台上的整盘井绳", "wellPeg", "take", { offsetX: .38, front: true }), trick: true, alert: 16, morale: -12, dialogue: "整盘绳子收走。看他们拿什么打水。" }),
      Action("leaveShoe", 8.1, "tunnel", "把落单哨兵困在安全支洞，只在洞口留下军鞋", "留鞋", { phase: "harass", prop: Prop("soldierBoot", "洞口的一只军鞋", "ground", "place"), trick: true, alert: 20, morale: -22, dialogue: "人锁在空洞里了。把鞋搁井边，咱们撤。" }),
      Action("misdirectSquad", -5.8, "surface", "从铁桶车架后，让两组灯影同时出现在相反院墙", "错判", { phase: "panic", cover: "crackerCart", panicStep: true, morale: -12, dialogue: "西墙一盏，东墙一盏。让他们自己猜。" }),
      Action("closeFalseGate", 1, "tunnel", "关闭假入口后方的空闸门", "断路", { phase: "panic", requires: ["misdirectSquad"], panicStep: true, morale: -14, dialogue: "他们进来了。关空闸，让前后都听见。" }),
      Action("finalSignal", 7.2, "surface", "藏在井边草垛后，在远离群众的空坡打出最后一声土枪", "送客", { phase: "panic", cover: "shoeHay", requires: ["closeFalseGate"], panicStep: true, morale: -20, dialogue: "等他们跑到空坡……现在，放一枪。" }),
      Action("captureIntel", 8.8, "tunnel", "木箱上分开放着撤退时遗下的地图和电台", "收取", { phase: "outcome", requires: ["finalSignal"], prop: Prop("fieldRadioMap", "分开放置的地图与电台", "crate", "take", { offsetX: 1.05 }), outcome: true, dialogue: "地图在这儿。电台别碰旋钮，回去让叶星听。" })
    ])
  })
]);

export const levelById = Object.freeze(Object.fromEntries(levelDefinitions.map((level) => [level.id, level])));
