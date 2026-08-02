export const actorProfiles = Object.freeze({
  leader: Object.freeze({ height: 1.72, shoulder: .35, head: .105, color: "#e5e7df" }),
  dog: Object.freeze({ height: .72, shoulder: .26, head: .15, color: "#b79068", animal: true }),
  student: Object.freeze({ height: 1.66, shoulder: .32, head: .107, color: "#78a7c5" }),
  rescuer: Object.freeze({ height: 1.64, shoulder: .32, head: .106, color: "#7db89d" }),
  blacksmith: Object.freeze({ height: 1.76, shoulder: .38, head: .102, color: "#d08b67" }),
  child: Object.freeze({ height: 1.42, shoulder: .28, head: .115, color: "#d8b75f" }),
  scout: Object.freeze({ height: 1.70, shoulder: .34, head: .105, color: "#dedfd9" }),
  soldier: Object.freeze({ height: 1.76, shoulder: .37, head: .103, color: "#d66f61" })
});

export const roleDefinitions = Object.freeze({
  leader: Object.freeze({ id: "leader", name: "民兵队长", skill: "组织 / 施工 / 闸门", short: "队长" }),
  dog: Object.freeze({ id: "dog", name: "流浪狗 · 阿土", skill: "嗅出暗路与危险气味", short: "阿土" }),
  student: Object.freeze({ id: "student", name: "学生 · 叶星", skill: "望远镜标记巡逻规律", short: "学生" }),
  rescuer: Object.freeze({ id: "rescuer", name: "妇救会 · 赵禾", skill: "缝补伪装与照护伤员", short: "妇救会" }),
  blacksmith: Object.freeze({ id: "blacksmith", name: "铁匠 · 魏根生", skill: "拉动重门与搬运粮袋", short: "铁匠" }),
  child: Object.freeze({ id: "child", name: "小交通员 · 石头", skill: "穿过狭口打开内闩", short: "石头" }),
  scout: Object.freeze({ id: "scout", name: "武工队员 · 林青禾", skill: "布置假象与地道声路", short: "武工队" })
});

export const buildOptions = Object.freeze([
  Object.freeze({ id: "flipGate", name: "翻板分割闸", cost: Object.freeze({ wood: 2, iron: 1 }), defense: 2, ventilation: 0, note: "分割敌队最强，但会截断一段风路。" }),
  Object.freeze({ id: "floodGate", name: "引水回流闸", cost: Object.freeze({ wood: 1, iron: 2 }), defense: 1, ventilation: 1, note: "能迟滞推进，同时保留一条窄风路。" }),
  Object.freeze({ id: "smokeBaffle", name: "防烟导流板", cost: Object.freeze({ wood: 2, iron: 0 }), defense: 1, ventilation: 2, note: "把烟导回空支洞，保护群众呼吸。" })
]);

const Action = (id, x, layer, title, verb, options = {}) => Object.freeze({ id, x, layer, title, verb, ...options });

export const levelDefinitions = Object.freeze([
  Object.freeze({
    id: "undergroundWall",
    number: "关卡一",
    title: "地下长城",
    subtitle: "建造与防御循环",
    thesis: "把村庄改造成能呼吸、能转移、能分割敌队的地下网络。",
    roleIds: Object.freeze(["leader"]),
    startRole: "leader",
    startX: -10,
    phases: Object.freeze([
      Object.freeze({ id: "collect", label: "夜间收集", objective: "避开巡逻，带回施工与救护物资", layer: "surface" }),
      Object.freeze({ id: "build", label: "白天挖建", objective: "完成三处机关，并保持通风值至少为 3", layer: "tunnel" }),
      Object.freeze({ id: "defense", label: "扫荡防御", objective: "诱导、分割并逐处触发地道机关", layer: "surface" }),
      Object.freeze({ id: "outcome", label: "缴获与扩展", objective: "清点缴获，决定下一轮扩建方向", layer: "tunnel" })
    ]),
    actions: Object.freeze([
      Action("collectWood", -9.2, "surface", "从倒塌牲口棚拆下整根木料", "拆木", { phase: "collect", crouch: true, resource: { wood: 6 }, dialogue: "这根是干的。轻点，别把棚顶弄响。" }),
      Action("collectIron", -4.8, "surface", "从废车轴上取下铁箍和销钉", "取铁", { phase: "collect", crouch: true, resource: { iron: 4 }, dialogue: "销子别丢，闸门就靠它卡住。" }),
      Action("collectPowder", .4, "surface", "收回鞭炮作坊留下的硝灰罐", "收罐", { phase: "collect", resource: { powder: 2 }, dialogue: "盖紧。撒一路味儿，巡逻队鼻子再笨也能闻见。" }),
      Action("collectSupplies", 6.8, "surface", "把药布和两袋口粮送进备用口", "转运", { phase: "collect", resource: { medicine: 1, grain: 2 }, dialogue: "药包给我。粮食贴墙放，给担架留条路。" }),
      Action("buildSlotA", -7, "tunnel", "西支洞机关位", "施工", { phase: "build", buildSlot: 0 }),
      Action("buildSlotB", 0, "tunnel", "中央短湾机关位", "施工", { phase: "build", buildSlot: 1 }),
      Action("buildSlotC", 7, "tunnel", "东翻口机关位", "施工", { phase: "build", buildSlot: 2 }),
      Action("startDefense", 9.2, "tunnel", "确认风路与群众出口后迎接扫荡", "迎敌", { phase: "build", phaseGate: true }),
      Action("placeDecoyCart", -8.7, "surface", "在空院留下向西的重车辙", "诱导", { phase: "defense", defenseStep: "lure", dialogue: "车印往西压。让他们离家门越远越好。" }),
      Action("closeSurfaceGate", -3.2, "surface", "等敌队过半后关闭地表假门", "分割", { phase: "defense", requires: ["placeDecoyCart"], defenseStep: "split", dialogue: "后半队还没进来……再等。好，关！" }),
      Action("triggerSlotA", -7, "tunnel", "触发西支洞机关", "扳闸", { phase: "defense", requires: ["closeSurfaceGate"], triggerSlot: 0 }),
      Action("triggerSlotB", 0, "tunnel", "触发中央短湾机关", "扳闸", { phase: "defense", requires: ["triggerSlotA"], triggerSlot: 1 }),
      Action("triggerSlotC", 7, "tunnel", "触发东翻口机关", "扳闸", { phase: "defense", requires: ["triggerSlotB"], triggerSlot: 2 }),
      Action("inventoryCapture", 9.2, "tunnel", "清点弃下的地图、口粮和工具", "清点", { phase: "outcome", outcome: true, dialogue: "先看有没有药。粮也收好，枪最后再算。" })
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
      Action("sniffRoute", -9, "surface", "嗅出草垛后没有机油味的窄路", "嗅闻", { phase: "survey", role: "dog", dialogue: "呜……（阿土停在草垛后，回头等人。）" }),
      Action("markPatrol", -6.2, "surface", "记录探照灯每次转回的间隔", "标记", { phase: "survey", role: "student", requires: ["sniffRoute"], dialogue: "我数过了，灯一过去，够咱们跑到东墙。跟紧我。" }),
      Action("repairCamo", -3.4, "surface", "补好被风撕开的秸秆伪装网", "缝补", { phase: "cooperate", role: "rescuer", requires: ["markPatrol"], dialogue: "别拉太紧，风一吹就不像真的了。这样，刚好。" }),
      Action("liftHatch", -.6, "surface", "拉开压着石磨的重暗门", "抬门", { phase: "cooperate", role: "blacksmith", requires: ["repairCamo"], dialogue: "扶住磨盘。门一响，咱们谁都走不了。" }),
      Action("crawlGap", .2, "surface", "从磨盘侧面的狭口钻入地道", "钻入", { phase: "cooperate", role: "child", requires: ["liftHatch"], effect: "enterTunnel", dialogue: "绳子给我。我瘦，能过去。" }),
      Action("unbarGate", 3.1, "tunnel", "从内侧抽出双木门闩", "开闩", { phase: "cooperate", role: "child", requires: ["crawlGap"], dialogue: "第一根出来了……你们托住门，我拔第二根。" }),
      Action("findLetter", 4.7, "tunnel", "找回交通员藏在瓦罐后的家书", "收信", { phase: "transfer", role: "dog", requires: ["unbarGate"], memory: "一封没有寄出的家书", optional: true, dialogue: "瓦罐后头有封信。是老周的字……先收好，出去再看。" }),
      Action("findThimble", 6.2, "tunnel", "拾起牺牲缝纫员留下的铜顶针", "拾取", { phase: "transfer", role: "rescuer", requires: ["unbarGate"], memory: "磨亮的铜顶针", optional: true, dialogue: "是小安的顶针。带上吧，别让它留这儿。" }),
      Action("moveWounded", 5.2, "tunnel", "给伤员重新固定夹板并通过窄弯", "转移", { phase: "transfer", role: "rescuer", requires: ["unbarGate"], rescue: "wounded", dialogue: "叔，疼就抓我胳膊。前头那个弯，慢一点就能过。" }),
      Action("moveGrain", 7.4, "tunnel", "把粮袋分成能通过低梁的小包", "搬粮", { phase: "transfer", role: "blacksmith", requires: ["moveWounded"], rescue: "grain", dialogue: "大袋过不去，拆成小包。我多跑两趟。" }),
      Action("freeCourier", 8.5, "tunnel", "辨认联络员留下的敲击暗号", "回应", { phase: "transfer", role: "student", requires: ["moveGrain"], rescue: "courier", dialogue: "听，三长一短。是咱们的人，他还醒着！" }),
      Action("escortExit", 10, "tunnel", "让五名伙伴与转移队逐名通过东翻口", "离开", { phase: "outcome", role: "child", requires: ["moveWounded", "moveGrain", "freeCourier"], outcome: true, dialogue: "赵姨，老周出来了。阿土也在。人齐了，我关门。" })
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
      Action("placeHelmet", -9, "surface", "在空院墙头留下会晃动的旧军帽", "布疑", { phase: "harass", trick: true, alert: 12, morale: -10, dialogue: "风一吹它就动。够他们盯半天了。" }),
      Action("fireCracker", -4.8, "surface", "把鞭炮声通过铁桶压向西坡", "引声", { phase: "harass", trick: true, alert: 24, morale: -18, dialogue: "隔一会儿再响第二串。别让他们听出是鞭炮。" }),
      Action("routeHorn", -.5, "tunnel", "把铁皮喇叭接入通往敌后的声孔", "传声", { phase: "harass", trick: true, alert: 10, morale: -20, dialogue: "喇叭口对准后墙。喊一声就走，别等他们回头。" }),
      Action("hideWellRope", 4.2, "surface", "趁取水队离开时收走井绳", "撤绳", { phase: "harass", trick: true, alert: 16, morale: -12, crouch: true, dialogue: "绳子收走。看他们拿什么打水。" }),
      Action("leaveShoe", 8.1, "tunnel", "把落单哨兵困在安全支洞，只留下军鞋", "消失", { phase: "harass", trick: true, alert: 20, morale: -22, crouch: true, dialogue: "人锁在空洞里了。把鞋搁井边，咱们撤。" }),
      Action("misdirectSquad", -5.8, "surface", "让两组灯影同时出现在相反院墙", "错判", { phase: "panic", panicStep: true, morale: -12, dialogue: "西墙一盏，东墙一盏。让他们自己猜。" }),
      Action("closeFalseGate", 1, "tunnel", "关闭假入口后方的空闸门", "断路", { phase: "panic", requires: ["misdirectSquad"], panicStep: true, morale: -14, dialogue: "他们进来了。关空闸，让前后都听见。" }),
      Action("finalSignal", 7.2, "surface", "在远离群众的空坡打出最后一声土枪", "送客", { phase: "panic", requires: ["closeFalseGate"], panicStep: true, morale: -20, dialogue: "等他们跑到空坡……现在，放一枪。" }),
      Action("captureIntel", 8.8, "tunnel", "收取撤退时遗下的地图和电台", "收报", { phase: "outcome", requires: ["finalSignal"], outcome: true, dialogue: "地图在这儿。电台别碰旋钮，回去让叶星听。" })
    ])
  })
]);

export const levelById = Object.freeze(Object.fromEntries(levelDefinitions.map((level) => [level.id, level])));
