function DeepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach((child) => DeepFreeze(child));
  return Object.freeze(value);
}

export const historicalAtmosphereDefinition = DeepFreeze({
  period: "1941年秋",
  region: "太行山前虚构综合县域",
  framing:
    "故事表现封锁、征发与敌后交通工作的日常压力，但不借真实灾难做爽点，也不把一次小队行动包装成改变战争结局的传奇。",
  verifiedBoundaries: [
    "地点、人物、行动与敌军单位均为原创综合化设定，不冒充真实战例。",
    "1945年日本投降为不可改变的历史终点；玩家只改变当地群众、交通线与行动组付出的代价。",
    "不虚构历史人物名言，不让角色预知后世结论。",
    "敌后通信以手摇电话、架空线、交通员和书面传令为主；没有现代无线耳机、夜视设备或数字地图。",
    "乡村生产空间保持朴素：土坯房、石墙、打谷场、灌渠、木轮车、采石工棚，不使用旅游古镇式灯笼街景。",
    "种粮、牲口、民工工具和民居财物归群众所有，不作为可搜刮资源。",
  ],
  sensoryPalette: {
    signalStation: {
      colors: ["冷灰黎明", "土墙赭色", "绝缘瓷白", "煤油灯暗黄"],
      nearSounds: ["手摇磁石电话的短促铃声", "接线塞绳碰木台", "发电机皮带低鸣", "风吹架空线"],
      farSounds: ["山谷犬吠", "木轮车压过碎石", "远处鸡鸣"],
      props: ["木制总机台", "布包线路图", "粗木电杆", "白瓷绝缘子", "修线工具袋"],
    },
    northVillage: {
      colors: ["无月靛蓝", "湿土褐色", "窗纸暖灰", "芦苇青黑"],
      nearSounds: ["细雨落瓦", "水闸木轴吱响", "湿鞋踏泥", "压低的木梆声"],
      farSounds: ["河套流水", "牲口喷鼻", "巡夜铜锣试音"],
      props: ["油纸药包", "旧棉被包袱", "木制水闸", "草绳骡缰", "窗纸暗号"],
    },
    quarry: {
      colors: ["风化石灰", "铁锈褐", "干冷天青", "尘幕灰黄"],
      nearSounds: ["錾子敲石", "矿车轮缘摩擦", "木撑受力", "碎石沿坡滚落"],
      farSounds: ["盘山路汽车回声", "工棚木梆", "山口大风"],
      props: ["石匠錾锤", "木轨矿车", "军用雷管盒", "落石木撑", "粗布防尘巾"],
    },
  },
  languageGuide: {
    use: [
      "交通员、接应、换岗、封锁、查线、转移、民工、工棚、药箱、总机、接线柱",
      "短句、具体行动和地方生活经验；角色在危险中先说方位、时间与责任。",
    ],
    avoid: [
      "现代特种作战术语、电子战、红外、热成像、无人机、战术终端",
      "把群众称作资源点、诱饵或可牺牲单位",
      "胜利必然、单次行动决定全局、以击杀数证明贡献",
      "伪造方言腔调或使用难以核验的真实人物引语",
    ],
  },
});

export const storyCharacterDefinitions = DeepFreeze([
  {
    id: "auntLiu",
    name: "刘桂英",
    displayName: "刘婶",
    role: "北庄交通员",
    age: 43,
    description:
      "以走亲与替人缝补作掩护维持村间联系。她记得每户转移次序，但不会把群众推上最危险的近路。",
    boundary: "原创综合人物，不对应真实姓名或个体事迹。",
  },
  {
    id: "uncleFan",
    name: "范守山",
    displayName: "范伯",
    role: "被强征石匠",
    age: 52,
    description:
      "熟悉采石坡木撑和风化裂隙，主张先让最年轻与受伤的民工离开，再给出可控落石位置。",
    boundary: "原创综合人物；被强征劳动只呈现代价与处境，不转化为奖励。",
  },
  {
    id: "girlXiaoman",
    name: "小满",
    displayName: "小满",
    role: "北庄村民",
    age: 13,
    description:
      "替刘婶看窗纸记号，在封锁前把药箱藏进祠堂偏房。她只参与传递信息，不被安排进入战斗区域。",
    boundary: "原创人物；未成年人不作为可操控战斗单位或诱饵。",
  },
  {
    id: "charcoalCarrierZhou",
    name: "周成",
    displayName: "周炭夫",
    role: "槐树峪村民",
    age: 36,
    description:
      "按固定山路挑炭回村。他不知道行动计划，小队必须为他的经过留出安全窗口。",
    boundary: "原创人物；其路线用于约束交火，不提供侦察奖励。",
  },
]);

export const operationStorylets = DeepFreeze({
  signalBriefing: {
    phase: "briefing",
    lines: [
      { speakerId: "qinSuqiu", text: "总机设在槐树峪旧院里。拿到线路图，先认清哪一根线通南哨，别剪错村里的旧线。" },
      { speakerId: "hanShilei", text: "我能让电话停，也能让灯停。两样都停，值勤兵就会出来查，院里不会凭空变空。" },
      { speakerId: "weiShouyi", text: "我们来取情报、断联络。路一开就走，不为多打几个人多停一分钟。" },
    ],
  },
  signalRavineWhisper: {
    phase: "field",
    trigger: "enterZone:dryRavine",
    once: true,
    lines: [
      { speakerId: "qinSuqiu", text: "沟底碎石会响，贴西边湿土走。炭夫再过一会儿从北坡下来，先给他让路。" },
      { speakerId: "luLanzhi", text: "他不知道我们在这里。枪声离他越远越好。" },
    ],
  },
  signalLedgerChoice: {
    phase: "field",
    trigger: "interactable:returnSeedRegister",
    once: true,
    lines: [
      { speakerId: "qinSuqiu", text: "这是几村的征粮名册。带回去只为提前通知，不算我们缴到的物资。" },
      { speakerId: "weiShouyi", text: "记在责任里，不记在战果里。" },
    ],
  },
  signalDebrief: {
    phase: "debrief",
    variants: [
      {
        when: "flag:seedRegisterSecuredForReturn",
        lines: [{ speakerId: "qinSuqiu", text: "线路图交情报组，征粮名册送各交通站。两份纸，去处不能混。" }],
      },
      {
        when: "always",
        lines: [{ speakerId: "weiShouyi", text: "电话会修，换岗也会改。今晚争来的只是一个窗口，下一次还得重新侦察。" }],
      },
    ],
  },
  rendezvousBriefing: {
    phase: "briefing",
    lines: [
      { speakerId: "qinSuqiu", text: "刘婶的窗纸左下角缺一块，敲门是三短一长。别只凭一张脸认人。" },
      { speakerId: "luLanzhi", text: "药箱在祠堂偏房。先接人，再决定村民走西场还是东渠，不能让两队挤在一个口子。" },
      { speakerId: "weiShouyi", text: "村里每一条巷子都有人住。需要开火时先看清弹道后面是什么。" },
    ],
  },
  rendezvousPassword: {
    phase: "field",
    trigger: "interactable:contactLiu",
    once: true,
    lines: [
      { speakerId: "auntLiu", text: "窗纸记号对了，话也对了。西边三户已经收拾好，东边两户要等水渠开闸才走。" },
      { speakerId: "qinSuqiu", text: "西边先沿墙，东边听水声。我们不催，巡逻窗口到了再动。" },
    ],
  },
  rendezvousMedicine: {
    phase: "field",
    trigger: "objective:clinicSatchel",
    once: true,
    lines: [
      { speakerId: "luLanzhi", text: "封口没破。药箱由我背也行，但谁背都要活着带出去，留在这里不算取回。" },
      { speakerId: "girlXiaoman", text: "我只把它藏到这里。外面的路，我听刘婶的。" },
    ],
  },
  rendezvousDeparture: {
    phase: "field",
    trigger: "flag:eastHouseholdsMoving",
    once: true,
    lines: [
      { speakerId: "auntLiu", text: "东巷五个人，过桥后不回头；西巷七个人，在麦秸垛等第二声木梆。" },
      { speakerId: "weiShouyi", text: "素秋看前路，兰枝跟后队。石磊和我只压住追兵，不追出去。" },
    ],
  },
  rendezvousDebrief: {
    phase: "debrief",
    variants: [
      {
        when: "ledger:harm=0",
        lines: [{ speakerId: "auntLiu", text: "人都点过名。房子能再收拾，药也能再找，人不能拿来换快。" }],
      },
      {
        when: "always",
        lines: [{ speakerId: "luLanzhi", text: "伤、险和被迫离村都单列。谁也不能拿药箱把这笔账抹掉。" }],
      },
    ],
  },
  quarryBriefing: {
    phase: "briefing",
    lines: [
      { speakerId: "hanShilei", text: "采石坡有三层：北脊、盘山路、采坑。木撑能落石，矿车能堵路，都要先看民工在哪。" },
      { speakerId: "luLanzhi", text: "范伯知道收工木梆。他确认最后一组离开危险圈，我们才动木撑。" },
      { speakerId: "weiShouyi", text: "封路是目的，巨响只是代价。电话先断，撤路先留。" },
    ],
  },
  quarryWorkerMeeting: {
    phase: "field",
    trigger: "interactable:workerForeman",
    once: true,
    lines: [
      { speakerId: "uncleFan", text: "两短一长是收工具，三短才是塌方。先敲两短一长，我带人分三拨走西沟。" },
      { speakerId: "hanShilei", text: "等你最后一拨过了石灰线，我再拆东坡木撑。" },
    ],
  },
  quarrySafetyChoice: {
    phase: "field",
    trigger: "interactable:rockfallTimber",
    once: true,
    variants: [
      {
        when: "flag:quarryWorkersClear",
        lines: [{ speakerId: "luLanzhi", text: "最后一组已经出危险圈。现在落石只封路，不压人。" }],
      },
      {
        when: "always",
        lines: [
          { speakerId: "luLanzhi", text: "人还在坡下。现在动木撑，道会封，人也会被埋。" },
          { speakerId: "weiShouyi", text: "战果不能抵这条命。等，或者改用矿车。" },
        ],
      },
    ],
  },
  quarryRoadBlocked: {
    phase: "field",
    trigger: "objective:blockMountainRoad",
    once: true,
    lines: [
      { speakerId: "hanShilei", text: "尘幕最多撑一小会儿。东坡能走，但电话没断的话，南哨会从另一头来。" },
      { speakerId: "qinSuqiu", text: "不看热闹。按原撤路走，掉队的人报名字。" },
    ],
  },
  quarryDebrief: {
    phase: "debrief",
    variants: [
      {
        when: "flag:rockfallTriggeredSafely",
        lines: [{ speakerId: "uncleFan", text: "路封住了，人也都在。木撑怎么拆我记下，别让下一队摸黑猜。" }],
      },
      {
        when: "ledger:harm>0",
        lines: [{ speakerId: "luLanzhi", text: "路是封了，代价账本也写清了。受害不能被任务完成四个字盖过去。" }],
      },
      {
        when: "always",
        lines: [{ speakerId: "weiShouyi", text: "敌人会清路。我们争到的是时间，不是把这条公路从地图上抹掉。" }],
      },
    ],
  },
});

export function GetStoryCharacter(characterId) {
  return storyCharacterDefinitions.find((character) => character.id === characterId) ?? null;
}

export function GetOperationStorylet(storyletId) {
  return operationStorylets[storyletId] ?? null;
}

export function GetAtmospherePalette(operationId) {
  const paletteByOperation = {
    infiltrateSignalStation: "signalStation",
    cutline: "signalStation",
    nightRendezvous: "northVillage",
    northVillageRelief: "northVillage",
    quarryInterdiction: "quarry",
  };
  return historicalAtmosphereDefinition.sensoryPalette[paletteByOperation[operationId]] ?? null;
}
