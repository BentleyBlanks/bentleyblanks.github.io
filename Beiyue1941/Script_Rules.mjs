/*
 * 北岳烽火：1941—1942
 * Pure deterministic rules. Player-facing historical copy is Chinese; source
 * identifiers remain English so this module can be tested without the UI.
 */

const resourceKeys = Object.freeze(["supply", "organization", "intelligence", "trust"]);
const regionValueKeys = Object.freeze([
  "network",
  "safety",
  "enemyControl",
  "exposure",
  "devastation",
  "protection",
  "corridorRelevance",
  "railRelevance",
]);

export const gameConfig = Object.freeze({
  id: "beiyue1941",
  title: "北岳烽火：1941—1942",
  subtitle: "晋察冀北岳区敌后抗战协调推演",
  saveVersion: 1,
  turnCount: 18,
  ordersPerTurn: 3,
  estimatedMinutes: Object.freeze([70, 100]),
  defaultSeed: 19410707,
  resourceMinimum: 0,
  resourceMaximum: 100,
  regionValueMinimum: 0,
  regionValueMaximum: 100,
  playerRole: "玩家操作的是虚构的北岳区军政民协调界面，它综合抽象了多类真实机构的工作，并非任何真实人物或历史上同名组织。",
  historyBoundary: "全国抗战的历史进程与结局固定；玩家只能影响本战区群众保护、组织存续和机构保存的程度。",
  nationalOutcome: "全国抗战的历史进程与结局不由本局改写：中国人民抗日战争最终于1945年取得胜利。",
  scoreWeights: Object.freeze({
    safety: 0.4,
    network: 0.25,
    institutions: 0.2,
    resistance: 0.1,
    trust: 0.05,
  }),
});

const regionDefinitionMap = Object.freeze({
  fuping: Object.freeze({
    id: "fuping",
    name: "阜平",
    historicalName: "阜平县",
    terrain: "太行山地",
    terrainId: "mountain",
    adjacentIds: Object.freeze(["wutai", "laiyuan", "yixian", "tangxian", "quyang", "pingshan"]),
    network: 64,
    safety: 58,
    enemyControl: 30,
    exposure: 38,
    devastation: 24,
    protection: 48,
    corridorRelevance: 95,
    railRelevance: 5,
  }),
  wutai: Object.freeze({
    id: "wutai",
    name: "五台",
    historicalName: "五台县",
    terrain: "高山峡谷",
    terrainId: "mountain",
    adjacentIds: Object.freeze(["lingqiu", "laiyuan", "fuping", "pingshan"]),
    network: 56,
    safety: 55,
    enemyControl: 38,
    exposure: 34,
    devastation: 28,
    protection: 45,
    corridorRelevance: 88,
    railRelevance: 12,
  }),
  lingqiu: Object.freeze({
    id: "lingqiu",
    name: "灵丘",
    historicalName: "灵丘县",
    terrain: "山间盆地",
    terrainId: "foothills",
    adjacentIds: Object.freeze(["wutai", "laiyuan", "yixian"]),
    network: 42,
    safety: 45,
    enemyControl: 58,
    exposure: 46,
    devastation: 34,
    protection: 34,
    corridorRelevance: 72,
    railRelevance: 48,
  }),
  laiyuan: Object.freeze({
    id: "laiyuan",
    name: "涞源",
    historicalName: "涞源县",
    terrain: "山地河谷",
    terrainId: "mountain",
    adjacentIds: Object.freeze(["lingqiu", "wutai", "fuping", "yixian"]),
    network: 46,
    safety: 48,
    enemyControl: 52,
    exposure: 42,
    devastation: 31,
    protection: 37,
    corridorRelevance: 78,
    railRelevance: 20,
  }),
  yixian: Object.freeze({
    id: "yixian",
    name: "易县",
    historicalName: "易县",
    terrain: "山地与丘陵",
    terrainId: "foothills",
    adjacentIds: Object.freeze(["lingqiu", "laiyuan", "fuping", "tangxian"]),
    network: 48,
    safety: 43,
    enemyControl: 56,
    exposure: 44,
    devastation: 36,
    protection: 38,
    corridorRelevance: 82,
    railRelevance: 24,
  }),
  tangxian: Object.freeze({
    id: "tangxian",
    name: "唐县",
    historicalName: "唐县",
    terrain: "山前丘陵",
    terrainId: "foothills",
    adjacentIds: Object.freeze(["yixian", "fuping", "quyang"]),
    network: 51,
    safety: 49,
    enemyControl: 48,
    exposure: 40,
    devastation: 29,
    protection: 41,
    corridorRelevance: 90,
    railRelevance: 14,
  }),
  quyang: Object.freeze({
    id: "quyang",
    name: "曲阳",
    historicalName: "曲阳县",
    terrain: "山前丘陵",
    terrainId: "foothills",
    adjacentIds: Object.freeze(["fuping", "tangxian", "pingshan", "xingtang", "xinle"]),
    network: 49,
    safety: 46,
    enemyControl: 52,
    exposure: 43,
    devastation: 32,
    protection: 39,
    corridorRelevance: 92,
    railRelevance: 22,
  }),
  pingshan: Object.freeze({
    id: "pingshan",
    name: "平山",
    historicalName: "平山县",
    terrain: "太行东麓",
    terrainId: "foothills",
    adjacentIds: Object.freeze(["wutai", "fuping", "quyang", "lingshou", "jingxing"]),
    network: 55,
    safety: 52,
    enemyControl: 44,
    exposure: 39,
    devastation: 27,
    protection: 43,
    corridorRelevance: 89,
    railRelevance: 26,
  }),
  lingshou: Object.freeze({
    id: "lingshou",
    name: "灵寿",
    historicalName: "灵寿县",
    terrain: "丘陵平原交界",
    terrainId: "foothills",
    adjacentIds: Object.freeze(["pingshan", "jingxing", "xingtang"]),
    network: 44,
    safety: 44,
    enemyControl: 55,
    exposure: 43,
    devastation: 33,
    protection: 36,
    corridorRelevance: 70,
    railRelevance: 38,
  }),
  jingxing: Object.freeze({
    id: "jingxing",
    name: "井陉",
    historicalName: "井陉县",
    terrain: "关隘与铁路河谷",
    terrainId: "railPass",
    adjacentIds: Object.freeze(["pingshan", "lingshou", "xingtang"]),
    network: 35,
    safety: 36,
    enemyControl: 72,
    exposure: 52,
    devastation: 38,
    protection: 29,
    corridorRelevance: 80,
    railRelevance: 100,
  }),
  xingtang: Object.freeze({
    id: "xingtang",
    name: "行唐",
    historicalName: "行唐县",
    terrain: "滹沱河平原",
    terrainId: "plain",
    adjacentIds: Object.freeze(["quyang", "lingshou", "jingxing", "xinle"]),
    network: 39,
    safety: 40,
    enemyControl: 63,
    exposure: 48,
    devastation: 35,
    protection: 31,
    corridorRelevance: 75,
    railRelevance: 54,
  }),
  xinle: Object.freeze({
    id: "xinle",
    name: "新乐",
    historicalName: "新乐县",
    terrain: "平汉铁路沿线平原",
    terrainId: "railPlain",
    adjacentIds: Object.freeze(["quyang", "xingtang"]),
    network: 29,
    safety: 32,
    enemyControl: 78,
    exposure: 55,
    devastation: 40,
    protection: 24,
    corridorRelevance: 68,
    railRelevance: 100,
  }),
});

const regionRoles = Object.freeze({
  fuping: "核心协调与山地交通",
  wutai: "北部山地联络",
  lingqiu: "北部入口与交通节点",
  laiyuan: "北部山地走廊",
  yixian: "狼牙山方向与东部屏障",
  tangxian: "东部交通与接应",
  quyang: "冀中接应走廊",
  pingshan: "南部根据地联络",
  lingshou: "山前联络地带",
  jingxing: "正太铁路关隘",
  xingtang: "平汉路西侧联络",
  xinle: "平汉铁路边缘",
});

export const regionDefinitions = Object.freeze(Object.values(regionDefinitionMap).map((definition) => Object.freeze({
  ...definition,
  terrainName: definition.terrain,
  role: regionRoles[definition.id],
})));

const regionDefinitionsById = Object.freeze(Object.fromEntries(
  regionDefinitions.map((definition) => [definition.id, definition]),
));

export const actionDefinitions = Object.freeze({
  massWork: Object.freeze({
    id: "massWork",
    name: "群众工作",
    icon: "民",
    shortName: "群众工作",
    description: "依靠村级组织恢复联络、预警与互助。群众不是可消耗资源，工作成效取决于长期信任。",
    costs: Object.freeze({ supply: 4, organization: 4, intelligence: 0, trust: 0 }),
    baseChanges: Object.freeze({ network: 8, safety: 3, enemyControl: 0, exposure: 2, devastation: 0, protection: 4 }),
    resourceChanges: Object.freeze({ trust: 2 }),
    evidence: 3,
  }),
  relief: Object.freeze({
    id: "relief",
    name: "生产救济",
    icon: "济",
    shortName: "生产救济",
    description: "调拨粮秣、药品和生产工具，优先缓解群众处境与村庄破坏。",
    costs: Object.freeze({ supply: 10, organization: 3, intelligence: 0, trust: 0 }),
    baseChanges: Object.freeze({ network: 1, safety: 10, enemyControl: 0, exposure: 1, devastation: -6, protection: 3 }),
    resourceChanges: Object.freeze({ trust: 2 }),
    evidence: 2,
  }),
  contact: Object.freeze({
    id: "contact",
    name: "秘密联络",
    icon: "联",
    shortName: "秘密联络",
    description: "建立交通站、联络点和分散通信，维系相邻地区的抗日网络。",
    costs: Object.freeze({ supply: 4, organization: 5, intelligence: 3, trust: 0 }),
    baseChanges: Object.freeze({ network: 9, safety: 1, enemyControl: 0, exposure: 3, devastation: 0, protection: 2 }),
    resourceChanges: Object.freeze({ intelligence: 2, trust: 1 }),
    evidence: 6,
  }),
  recon: Object.freeze({
    id: "recon",
    name: "侦察敌情",
    icon: "察",
    shortName: "侦察",
    description: "以村哨、交通员和观察点核对道路动向；只改善判断，不揭示敌军并不知道的秘密。",
    costs: Object.freeze({ supply: 3, organization: 3, intelligence: 0, trust: 0 }),
    baseChanges: Object.freeze({ network: 0, safety: 3, enemyControl: 0, exposure: 1, devastation: 0, protection: 5 }),
    resourceChanges: Object.freeze({ intelligence: 10 }),
    evidence: 1,
  }),
  evacuate: Object.freeze({
    id: "evacuate",
    name: "转移疏散",
    icon: "转",
    shortName: "转移疏散",
    description: "分散群众与机构，利用相邻山路转移一处受威胁机构；短期会削弱原地网络。",
    costs: Object.freeze({ supply: 6, organization: 4, intelligence: 2, trust: 0 }),
    baseChanges: Object.freeze({ network: -3, safety: 9, enemyControl: 0, exposure: -8, devastation: 0, protection: 12 }),
    resourceChanges: Object.freeze({ trust: 1 }),
    evidence: -4,
  }),
  sabotage: Object.freeze({
    id: "sabotage",
    name: "交通破袭",
    icon: "破",
    shortName: "交通破袭",
    description: "破坏铁路、公路或封锁设施以迟滞占领体系；不以歼敌或伤亡数字计分。",
    costs: Object.freeze({ supply: 7, organization: 4, intelligence: 4, trust: 0 }),
    baseChanges: Object.freeze({ network: 0, safety: 0, enemyControl: -9, exposure: 7, devastation: 1, protection: 0 }),
    resourceChanges: Object.freeze({ intelligence: 1 }),
    evidence: 10,
  }),
  ambush: Object.freeze({
    id: "ambush",
    name: "伏击袭扰",
    icon: "袭",
    shortName: "伏击袭扰",
    description: "袭扰孤立搜索队并争取转移时间；战报只记录迟滞与风险，不设置击杀分数。",
    costs: Object.freeze({ supply: 9, organization: 5, intelligence: 5, trust: 0 }),
    baseChanges: Object.freeze({ network: 0, safety: -1, enemyControl: -11, exposure: 9, devastation: 1, protection: 2 }),
    resourceChanges: Object.freeze({ intelligence: 1 }),
    evidence: 12,
  }),
});

export const policyDefinitions = Object.freeze({
  protect: Object.freeze({
    id: "protect",
    name: "保护群众",
    icon: "护",
    description: "把预警、坚壁与疏散置于优先位置。每回合改善最危险地区的安全与掩护。",
    effectText: "每回合改善三个最低安全地区，另消耗少量物资。",
    switchCost: 8,
    cooldownTurns: 2,
  }),
  guerrilla: Object.freeze({
    id: "guerrilla",
    name: "游击牵制",
    icon: "牵",
    description: "增强破袭与袭扰的迟滞效果，但行动留下的迹象也更明显。",
    effectText: "破袭与伏击更能迟滞敌方控制，但会增加暴露。",
    switchCost: 10,
    cooldownTurns: 2,
  }),
  network: Object.freeze({
    id: "network",
    name: "秘密网络",
    icon: "网",
    description: "优先恢复交通站和村级联络，强化群众工作与秘密联络。",
    effectText: "每回合恢复三个薄弱网络，相关行动组织成本略降。",
    switchCost: 8,
    cooldownTurns: 2,
  }),
  production: Object.freeze({
    id: "production",
    name: "生产自救",
    icon: "产",
    description: "组织节约与生产，稳定获得少量综合物资并提高救济效率。",
    effectText: "每回合补充综合物资，生产救济消耗降低。",
    switchCost: 9,
    cooldownTurns: 2,
  }),
});

const historicalTurnDefinitions = Object.freeze([
  Object.freeze({
    id: "turn01",
    date: "1941-07-07",
    displayDate: "1941年7月7日",
    title: "华北占领政策进一步强化",
    context: "冈村宁次在这一天就任日军华北方面军司令官。北岳区面对的据点、道路和机动搜索压力将继续上升。",
    fact: Object.freeze({ label: "历史事实", text: "日军华北方面军指挥更替，以及针对敌后根据地的持续军事与占领行动。" }),
    abstraction: Object.freeze({ label: "游戏抽象", text: "把数周的预警准备压缩为一次协调选择；它不代表真实存在的统一指挥机关。" }),
    intensity: 1,
    pressureRegions: Object.freeze(["fuping", "wutai", "jingxing"]),
    choices: Object.freeze([
      Object.freeze({ id: "stores", label: "分散粮库与药品", description: "减轻集中物资被发现后的损失。", effects: Object.freeze({ resources: { supply: -3 }, allRegions: { devastation: -1 }, regions: { fuping: { protection: 7 }, pingshan: { protection: 5 } } }) }),
      Object.freeze({ id: "watch", label: "扩充村哨预警", description: "改善山区预警与群众转移窗口。", effects: Object.freeze({ resources: { intelligence: 7, organization: -2 }, regions: { fuping: { safety: 4, protection: 5 }, wutai: { safety: 4, protection: 5 } } }) }),
      Object.freeze({ id: "records", label: "转移档案和医疗点", description: "保护政权档案和卫生骨干，短期消耗组织力。", effects: Object.freeze({ resources: { organization: -4 }, institutions: { government: { health: 6 }, hospital: { health: 7 } }, regions: { tangxian: { exposure: -4 } } }) }),
    ]),
  }),
  Object.freeze({
    id: "turn02",
    date: "1941-08-12",
    displayDate: "1941年8月12日",
    title: "秋季大规模“扫荡”展开",
    context: "日军开始华北秋季行动。部分史料以8月12日记总体行动展开，北岳方向明确攻势则多记为8月14日。",
    fact: Object.freeze({ label: "历史事实", text: "侵略军从多方向展开行动，北岳和平西等地进入持续反“扫荡”。" }),
    abstraction: Object.freeze({ label: "游戏抽象", text: "引号中的“扫荡”为侵略军用语沿用；游戏把多支部队的机动抽象为区域压力。" }),
    intensity: 4,
    pressureRegions: Object.freeze(["lingqiu", "wutai", "laiyuan"]),
    choices: Object.freeze([
      Object.freeze({ id: "innerScreen", label: "内线掩护群众", description: "加强村庄疏散，但主干交通联络承受压力。", effects: Object.freeze({ resources: { organization: -3 }, regions: { wutai: { safety: 7, protection: 5, network: -2 }, fuping: { safety: 5, protection: 4 } } }) }),
      Object.freeze({ id: "outerManeuver", label: "主力向外线机动", description: "降低核心区暴露，消耗粮秣与情报。", effects: Object.freeze({ resources: { supply: -5, intelligence: -2 }, regions: { fuping: { exposure: -8 }, wutai: { exposure: -6 }, pingshan: { exposure: 3 } } }) }),
      Object.freeze({ id: "layered", label: "分层配置力量", description: "在保护与机动间保持余地，收益较均衡。", effects: Object.freeze({ resources: { organization: -2, intelligence: 2 }, regions: { fuping: { safety: 3, exposure: -3 }, wutai: { safety: 3, protection: 3 } } }) }),
    ]),
  }),
  Object.freeze({
    id: "turn03",
    date: "1941-08-14",
    displayDate: "1941年8月14日",
    title: "北岳方向纵向分割",
    context: "日军由灵丘、五台等方向推进，企图以道路和山口切断北岳各地联系。",
    fact: Object.freeze({ label: "历史事实", text: "北岳区遭到多路进攻，山区交通线和机关转移受到严重威胁。" }),
    abstraction: Object.freeze({ label: "游戏抽象", text: "两条“优先线”是地理与交通关系的压缩，不等于当时固定存在的单一路线。" }),
    intensity: 5,
    pressureRegions: Object.freeze(["lingqiu", "laiyuan", "wutai", "fuping"]),
    choices: Object.freeze([
      Object.freeze({ id: "northRoute", label: "保五台—阜平山路", description: "维系北部山区联系。", effects: Object.freeze({ resources: { supply: -3 }, regions: { wutai: { network: 7, protection: 5 }, fuping: { network: 4 }, laiyuan: { exposure: 3 } } }) }),
      Object.freeze({ id: "southRoute", label: "保平山—灵寿联系", description: "维系南部外线和地图外策应方向。", effects: Object.freeze({ resources: { supply: -3 }, regions: { pingshan: { network: 7, protection: 5 }, lingshou: { network: 5 }, fuping: { network: 2 } } }) }),
    ]),
  }),
  Object.freeze({
    id: "turn04",
    date: "1941-08-23",
    displayDate: "1941年8月23日",
    title: "多向合击逼近",
    context: "前期佯动转为对北岳、平西等地的多向合击。机关、部队与群众必须错开行动，避免集中暴露。",
    fact: Object.freeze({ label: "历史事实", text: "侵略军转入合击与分割，抗日军民以分散、转移和外线机动应对。" }),
    abstraction: Object.freeze({ label: "游戏抽象", text: "玩家只决定协调重点，不能控制真实人物，也不改写既定突围史实。" }),
    intensity: 5,
    pressureRegions: Object.freeze(["fuping", "yixian", "tangxian"]),
    choices: Object.freeze([
      Object.freeze({ id: "disperseOffices", label: "分散军政机关", description: "机关短暂降效，降低集中损失风险。", effects: Object.freeze({ resources: { organization: -5 }, institutions: { government: { health: 8 }, radio: { health: 5 } }, regions: { fuping: { exposure: -7, network: -2 } } }) }),
      Object.freeze({ id: "coverVillages", label: "加派力量掩护群众", description: "提升高危村庄转移能力，但暴露更多行动迹象。", effects: Object.freeze({ resources: { supply: -5 }, regions: { yixian: { safety: 8, exposure: 4, protection: 6 }, tangxian: { safety: 6, exposure: 3 } } }) }),
      Object.freeze({ id: "breakEncirclement", label: "优先保持外线机动", description: "保存组织完整，局部群众保护压力上升。", effects: Object.freeze({ resources: { organization: 5, intelligence: -3 }, regions: { fuping: { exposure: -4 }, yixian: { safety: -3 }, tangxian: { safety: -2 } } }) }),
    ]),
  }),
  Object.freeze({
    id: "turn05",
    date: "1941-08-28",
    displayDate: "1941年8月下旬",
    title: "抗大二分校分散转移",
    context: "抗大二分校在反“扫荡”中成为重点搜索目标，教学与行军必须结合，学员和资料分散转移。",
    fact: Object.freeze({ label: "历史事实", text: "抗大二分校在1941年秋季反“扫荡”中分散行动并坚持教学与地方工作。" }),
    abstraction: Object.freeze({ label: "游戏抽象", text: "学校被合并为一项可移动机构，路线与停课代价是战略层抽象。" }),
    intensity: 4,
    pressureRegions: Object.freeze(["wutai", "fuping", "pingshan"]),
    choices: Object.freeze([
      Object.freeze({ id: "mobileSchool", label: "编成移动教学队", description: "学校迁往阜平山区并保持基本活动。", effects: Object.freeze({ resources: { organization: -3 }, institutions: { school: { regionId: "fuping", health: 3 } }, regions: { fuping: { exposure: 3, network: 2 } } }) }),
      Object.freeze({ id: "disperseClasses", label: "分散到地方工作队", description: "学校迁向平山，教学暂受影响，地方网络得到帮助。", effects: Object.freeze({ institutions: { school: { regionId: "pingshan", health: -5 } }, regions: { pingshan: { network: 7, exposure: 3 } }, resources: { trust: 2 } }) }),
      Object.freeze({ id: "hideArchives", label: "先隐蔽师生与资料", description: "学校留在五台一带并暂时停课，显著降低暴露。", effects: Object.freeze({ institutions: { school: { health: 5 } }, regions: { wutai: { exposure: -8, network: -2, protection: 4 } }, resources: { organization: -2 } }) }),
    ]),
  }),
  Object.freeze({
    id: "turn06",
    date: "1941-09-02",
    displayDate: "1941年9月1—2日",
    title: "雷堡—台峪危局与机关转移",
    context: "雷堡一带局势危急，小分队携电台在台峪方向诱敌，领导机关随后转移。真实突围结果固定，玩家只安排机构行军次序。",
    fact: Object.freeze({ label: "历史事实", text: "部队以机动和诱敌掩护机关脱离危险地区，电台与领导机关得以转移。" }),
    abstraction: Object.freeze({ label: "游戏抽象", text: "不提供改变真实突围结局的选项；机构次序只影响本局停摆和保护代价。" }),
    intensity: 5,
    pressureRegions: Object.freeze(["fuping", "wutai", "laiyuan"]),
    fixedHistoricalOutcome: true,
    choices: Object.freeze([
      Object.freeze({ id: "hospitalFirst", label: "医院与伤员先行", description: "医疗机构得到优先掩护，印刷工作暂时停顿。", effects: Object.freeze({ institutions: { hospital: { regionId: "tangxian", health: 7 }, press: { health: -6 } }, resources: { supply: -4 }, regions: { tangxian: { exposure: 3 } } }) }),
      Object.freeze({ id: "schoolFirst", label: "学校与学员先行", description: "保护教育骨干，医院行军负担增加。", effects: Object.freeze({ institutions: { school: { regionId: "pingshan", health: 6 }, hospital: { health: -4 } }, resources: { organization: -3 } }) }),
      Object.freeze({ id: "radioFirst", label: "电台与通信先行", description: "保持跨区通信，其他机构需进一步分散。", effects: Object.freeze({ institutions: { radio: { regionId: "pingshan", health: 8 }, government: { health: -2 } }, resources: { intelligence: 6, supply: -3 } }) }),
    ]),
  }),
  Object.freeze({
    id: "turn07",
    date: "1941-09-05",
    displayDate: "1941年9月上旬",
    title: "地图外部队展开策应",
    context: "第120师、第129师和冀中部队在外线进行策应，为北岳区带来短暂调整窗口。",
    fact: Object.freeze({ label: "历史事实", text: "邻近根据地和八路军部队通过外线行动牵制侵略军，支援北岳反“扫荡”。" }),
    abstraction: Object.freeze({ label: "游戏抽象", text: "地图外策应被压缩为一次机会选择，不表现为玩家指挥其他部队。" }),
    intensity: 3,
    pressureRegions: Object.freeze(["jingxing", "xingtang", "xinle"]),
    choices: Object.freeze([
      Object.freeze({ id: "routeDisruption", label: "利用窗口破袭交通", description: "短暂压低铁路沿线控制，但提高暴露。", effects: Object.freeze({ resources: { intelligence: -3, supply: -3 }, regions: { jingxing: { enemyControl: -7, exposure: 7 }, xinle: { enemyControl: -5, exposure: 6 } } }) }),
      Object.freeze({ id: "moveSupplies", label: "抢运与分散粮秣", description: "补充综合物资并加强沿线掩护。", effects: Object.freeze({ resources: { supply: 10, organization: -2 }, regions: { pingshan: { protection: 4 }, lingshou: { protection: 3 } } }) }),
      Object.freeze({ id: "reorganize", label: "调整主力与地方组织", description: "恢复组织力，暂不扩大行动痕迹。", effects: Object.freeze({ resources: { organization: 8 }, allRegions: { exposure: -1 } }) }),
    ]),
  }),
  Object.freeze({
    id: "turn08",
    date: "1941-09-07",
    displayDate: "1941年9月7—25日",
    title: "分散搜索与村庄危机",
    context: "日伪军转入分散搜索和所谓“梳篦清剿”，多地群众遭杀害、拘捕，村庄和物资遭破坏。",
    fact: Object.freeze({ label: "历史事实", text: "侵略军暴力造成严重平民灾难；责任属于实施暴力的占领政策。" }),
    abstraction: Object.freeze({ label: "游戏抽象", text: "游戏不展示伤亡数字或暴行场面，只让玩家争取预警、掩护和救助空间。" }),
    intensity: 5,
    pressureRegions: Object.freeze(["yixian", "tangxian", "quyang", "fuping"]),
    choices: Object.freeze([
      Object.freeze({ id: "moveVillagers", label: "优先转移村民", description: "扩大疏散与堡垒户掩护。", effects: Object.freeze({ resources: { supply: -7, organization: -3 }, regions: { yixian: { safety: 10, exposure: -4, protection: 8 }, tangxian: { safety: 7, protection: 6 } } }) }),
      Object.freeze({ id: "hideStaff", label: "隐蔽伤员与干部", description: "保护医院和政权骨干，同时压低本地网络活动。", effects: Object.freeze({ institutions: { hospital: { health: 8 }, government: { health: 5 } }, regions: { fuping: { exposure: -6, network: -3 }, tangxian: { exposure: -5 } }, resources: { organization: -2 } }) }),
      Object.freeze({ id: "delaySearch", label: "袭扰孤立搜索队", description: "争取转移时间，但不把军事结果转化为击杀奖励。", effects: Object.freeze({ resources: { supply: -6, intelligence: -4 }, regions: { quyang: { enemyControl: -5, safety: 3, exposure: 8 }, yixian: { safety: 3, exposure: 5 } } }) }),
    ]),
  }),
  Object.freeze({
    id: "turn09",
    date: "1941-09-18",
    displayDate: "1941年9月中下旬",
    title: "秋收与种粮保卫",
    context: "持续行动严重破坏秋收，粮秣、群众口粮与次年种粮之间的矛盾愈发尖锐。",
    fact: Object.freeze({ label: "历史事实", text: "1941年秋季作战破坏生产和储粮，边区军民面临长期供给困难。" }),
    abstraction: Object.freeze({ label: "游戏抽象", text: "综合物资只表示粮食、药品和基本器材；群众口粮不能被玩家强征为最优解。" }),
    intensity: 4,
    pressureRegions: Object.freeze(["quyang", "xingtang", "lingshou"]),
    choices: Object.freeze([
      Object.freeze({ id: "nightHarvest", label: "组织夜间抢收", description: "增加物资但留下更多活动迹象。", effects: Object.freeze({ resources: { supply: 12, organization: -4 }, regions: { quyang: { exposure: 6, safety: 2 }, lingshou: { exposure: 5, safety: 2 } } }) }),
      Object.freeze({ id: "hiddenStores", label: "分散坚壁粮食", description: "收获有限，但降低粮库集中损失。", effects: Object.freeze({ resources: { supply: 7 }, regions: { fuping: { protection: 6 }, pingshan: { protection: 5 }, quyang: { exposure: -3 } } }) }),
      Object.freeze({ id: "seedGrain", label: "优先保存种粮", description: "当前物资更紧，但降低来春生产压力。", effects: Object.freeze({ resources: { supply: -3, trust: 5 }, allRegions: { devastation: -1 }, flags: { seedGrainProtected: true } }) }),
    ]),
  }),
  Object.freeze({
    id: "turn10",
    date: "1941-09-25",
    displayDate: "1941年9月25日",
    title: "狼牙山五壮士纪念",
    context: "马宝玉、葛振林、宋学义、胡德林、胡福才在狼牙山掩护群众和部队转移。五人的史实经历与结局不由玩家操纵。",
    fact: Object.freeze({ label: "历史事实", text: "五名战士将敌军引向险要方向，完成掩护任务；事件按史实纪念，不设置架空分支。" }),
    abstraction: Object.freeze({ label: "纪念说明", text: "本事件没有死亡奖励、战斗增益或替代命运；继续保护群众才是玩家可承担的责任。" }),
    intensity: 4,
    pressureRegions: Object.freeze(["yixian", "tangxian"]),
    memorial: Object.freeze({ fixed: true, noAlternateFate: true, noGameplayReward: true }),
    choices: Object.freeze([
      Object.freeze({ id: "remember", label: "铭记并继续转移群众", description: "肃穆记录史实。本选项不提供任何数值奖励。", effects: Object.freeze({}) }),
    ]),
  }),
  Object.freeze({
    id: "turn11",
    date: "1941-09-26",
    displayDate: "1941年9月26日",
    title: "日伪军开始撤退",
    context: "侵略军主力陆续撤退，但道路、据点和掉队搜索力量仍构成威胁。救助群众与避免冒进同样重要。",
    fact: Object.freeze({ label: "历史事实", text: "秋季行动后期，日伪军逐步撤退，抗日力量开展恢复、救助和有限截击。" }),
    abstraction: Object.freeze({ label: "游戏抽象", text: "追击不是唯一或必然最优选择，军事行动不按歼敌数量奖励。" }),
    intensity: 3,
    pressureRegions: Object.freeze(["laiyuan", "lingqiu", "jingxing"]),
    choices: Object.freeze([
      Object.freeze({ id: "clearRoads", label: "清理道路并救助群众", description: "优先恢复通行和救济。", effects: Object.freeze({ resources: { supply: -5, trust: 5 }, regions: { yixian: { safety: 6, devastation: -4 }, tangxian: { safety: 5, devastation: -4 } } }) }),
      Object.freeze({ id: "cautiousInterdict", label: "谨慎迟滞撤退交通", description: "压低沿线控制，但增加行动暴露。", effects: Object.freeze({ resources: { supply: -5, intelligence: -3 }, regions: { jingxing: { enemyControl: -6, exposure: 7 }, lingqiu: { enemyControl: -4, exposure: 5 } } }) }),
      Object.freeze({ id: "preserveForces", label: "保存组织停止追击", description: "集中整顿和补充，不扩大接触。", effects: Object.freeze({ resources: { organization: 9 }, allRegions: { exposure: -2 } }) }),
    ]),
  }),
  Object.freeze({
    id: "turn12",
    date: "1941-10-16",
    displayDate: "1941年10月16日",
    title: "秋季反“扫荡”告一段落",
    context: "北岳区秋季反“扫荡”阶段结束，村庄、交通、医疗和基层政权都亟待恢复。",
    fact: Object.freeze({ label: "历史事实", text: "持续两月有余的秋季反“扫荡”结束，但占领军据点和封锁压力并未消失。" }),
    abstraction: Object.freeze({ label: "游戏抽象", text: "一次选择代表数周的恢复优先次序，其他机构不会因此被历史抹去。" }),
    intensity: 2,
    pressureRegions: Object.freeze(["jingxing", "xinle"]),
    choices: Object.freeze([
      Object.freeze({ id: "restoreHospital", label: "优先恢复医院", description: "恢复医疗收治和基层卫生联络。", effects: Object.freeze({ resources: { supply: -6 }, institutions: { hospital: { health: 12 } }, regions: { tangxian: { safety: 5 }, fuping: { safety: 3 } } }) }),
      Object.freeze({ id: "restoreGovernment", label: "优先恢复村政权与粮库", description: "改善组织与分散供给。", effects: Object.freeze({ resources: { organization: 6, supply: 4 }, institutions: { government: { health: 8 } }, regions: { fuping: { network: 4 }, quyang: { network: 3 } } }) }),
      Object.freeze({ id: "restoreStations", label: "优先恢复交通站", description: "重接跨区网络并改善情报。", effects: Object.freeze({ resources: { intelligence: 8 }, regions: { fuping: { network: 5 }, pingshan: { network: 5 }, tangxian: { network: 5 } } }) }),
    ]),
  }),
  Object.freeze({
    id: "turn13",
    date: "1941-12-01",
    displayDate: "1941年冬",
    title: "据点、封锁沟与持续“蚕食”",
    context: "大规模行动之后，据点、公路、封锁沟和基层控制仍持续压缩根据地活动空间。",
    fact: Object.freeze({ label: "历史事实", text: "侵略军依托交通线和据点体系长期封锁、分割抗日根据地。" }),
    abstraction: Object.freeze({ label: "游戏抽象", text: "区域控制值合并表示据点、警戒和道路通行，不等于完整领土所有权。" }),
    intensity: 3,
    pressureRegions: Object.freeze(["jingxing", "xinle", "xingtang", "lingqiu"]),
    choices: Object.freeze([
      Object.freeze({ id: "secretRebuild", label: "秘密重建组织", description: "低调恢复薄弱地区网络。", effects: Object.freeze({ resources: { organization: -4 }, regions: { xingtang: { network: 8, exposure: -2 }, xinle: { network: 7, exposure: -1 } } }) }),
      Object.freeze({ id: "breakBlockade", label: "破坏封锁设施", description: "打开局部通道，暴露风险升高。", effects: Object.freeze({ resources: { supply: -6, intelligence: -3 }, regions: { jingxing: { enemyControl: -7, exposure: 8 }, xingtang: { enemyControl: -5, exposure: 6 } } }) }),
      Object.freeze({ id: "politicalContact", label: "开展基层政治工作", description: "争取被胁迫人员和中间力量，不把协从人员同质化。", effects: Object.freeze({ resources: { intelligence: -3, trust: 5 }, regions: { lingshou: { enemyControl: -4, network: 4 }, xingtang: { enemyControl: -3, network: 3 } } }) }),
    ]),
  }),
  Object.freeze({
    id: "turn14",
    date: "1942-01-15",
    displayDate: "1942年1月15日",
    title: "精兵简政与地方力量调整",
    context: "晋察冀军区开始推进精兵简政，压缩机关层级，加强地方武装和基层组织，以适应更艰苦的环境。",
    fact: Object.freeze({ label: "历史事实", text: "1942年初晋察冀根据地贯彻精兵简政，调整主力、机关和地方力量。" }),
    abstraction: Object.freeze({ label: "游戏抽象", text: "政策效果合并了长期整编过程，不对应某一支真实部队的具体编制。" }),
    intensity: 2,
    pressureRegions: Object.freeze(["fuping", "pingshan"]),
    choices: Object.freeze([
      Object.freeze({ id: "leanOffices", label: "精简机关层级", description: "降低日常消耗，政权机构短期承压。", effects: Object.freeze({ resources: { organization: 9, supply: 5 }, institutions: { government: { health: -4 } }, allRegions: { exposure: -1 } }) }),
      Object.freeze({ id: "localForces", label: "加强地方组织", description: "把更多骨干分配到县、区和村级网络。", effects: Object.freeze({ resources: { organization: -3, trust: 3 }, allRegions: { network: 2 }, regions: { fuping: { network: 2 }, pingshan: { network: 2 } } }) }),
      Object.freeze({ id: "protectSpecialists", label: "保留医疗通信骨干", description: "机构健康提高，精简获得的物资较少。", effects: Object.freeze({ resources: { supply: 2 }, institutions: { hospital: { health: 7 }, radio: { health: 7 }, press: { health: 4 } } }) }),
    ]),
  }),
  Object.freeze({
    id: "turn15",
    date: "1942-02-15",
    displayDate: "1942年初",
    title: "疾疫与基层卫生",
    context: "战乱、迁徙和物资匮乏加重疾疫威胁。边区逐步建立卫生行政、报告和宣传制度。",
    fact: Object.freeze({ label: "历史事实", text: "晋察冀边区长期应对传染病，通过卫生组织、报告、宣传和有限医疗展开防疫。" }),
    abstraction: Object.freeze({ label: "游戏抽象", text: "“机构健康”和区域安全合并表示医疗能力与疾病风险，不模拟具体患者或死亡数字。" }),
    intensity: 2,
    pressureRegions: Object.freeze(["tangxian", "quyang", "lingshou"]),
    choices: Object.freeze([
      Object.freeze({ id: "villageHealth", label: "培训村级卫生员", description: "扩大基层预防与报告网络。", effects: Object.freeze({ resources: { supply: -5, organization: -3, trust: 4 }, allRegions: { safety: 2 }, institutions: { hospital: { health: 4 } } }) }),
      Object.freeze({ id: "medicineFocus", label: "集中有限药品", description: "优先维持医院与高危地区收治。", effects: Object.freeze({ resources: { supply: -8 }, institutions: { hospital: { health: 10 } }, regions: { tangxian: { safety: 7 }, fuping: { safety: 4 } } }) }),
      Object.freeze({ id: "waterCampaign", label: "开展饮水与环境卫生", description: "以宣传和群众协作降低广泛风险。", effects: Object.freeze({ resources: { organization: -4, trust: 3 }, allRegions: { safety: 2, devastation: -1 } }) }),
    ]),
  }),
  Object.freeze({
    id: "turn16",
    date: "1942-03-20",
    displayDate: "1942年3月20日",
    title: "《时事专刊》编印",
    context: "《时事专刊》开始编印，后来成为《晋察冀画报》的前身。有限纸张与设备必须服务最紧迫的传播任务。",
    fact: Object.freeze({ label: "历史事实", text: "晋察冀敌后新闻与摄影工作在艰苦环境中保存报道、开展宣传并记录侵略证据。" }),
    abstraction: Object.freeze({ label: "游戏抽象", text: "报刊内容由一次方向选择概括，不虚构真实人物引语，也不把生成图像冒充史料。" }),
    intensity: 2,
    pressureRegions: Object.freeze(["fuping", "pingshan"]),
    choices: Object.freeze([
      Object.freeze({ id: "warNews", label: "刊载战况与政策说明", description: "改善跨区信息与组织协调。", effects: Object.freeze({ resources: { intelligence: 6, organization: 3 }, institutions: { press: { health: 6 } }, regions: { fuping: { exposure: 2 } } }) }),
      Object.freeze({ id: "documentCrimes", label: "保存侵略证据", description: "提高史料保存和群众信任，需额外隐蔽设备。", effects: Object.freeze({ resources: { intelligence: 4, trust: 5, supply: -3 }, institutions: { press: { health: 5 } }, regions: { fuping: { protection: 3 } }, flags: { evidencePreserved: true } }) }),
      Object.freeze({ id: "healthLiteracy", label: "编印卫生识字材料", description: "配合基层防疫与识字工作。", effects: Object.freeze({ resources: { trust: 4, supply: -2 }, institutions: { press: { health: 4 }, hospital: { health: 3 } }, allRegions: { safety: 1 } }) }),
    ]),
  }),
  Object.freeze({
    id: "turn17",
    date: "1942-04-15",
    displayDate: "1942年春",
    title: "春旱、粮荒与《树叶训令》",
    context: "春旱和粮荒加剧，边区发布有关采食树叶的纪律要求，强调部队不得与群众争夺可食资源。",
    fact: Object.freeze({ label: "历史事实", text: "困难时期军民以代食品和生产自救渡荒，禁止部队与群众争食是固定纪律。" }),
    abstraction: Object.freeze({ label: "游戏抽象", text: "玩家不能选择抢粮；三个方案只决定节约、外购或生产自救的附加重点。" }),
    intensity: 3,
    pressureRegions: Object.freeze(["quyang", "pingshan", "wutai"]),
    fixedDiscipline: true,
    choices: Object.freeze([
      Object.freeze({ id: "strictRation", label: "进一步节约粮秣", description: "以组织力维持纪律，优先保障群众口粮。", effects: Object.freeze({ resources: { supply: -5, organization: 3, trust: 7 }, allRegions: { safety: 2 }, flags: { leafDirectiveHonored: true } }) }),
      Object.freeze({ id: "distantPurchase", label: "组织远距离采购", description: "消耗情报与组织力换取综合物资。", effects: Object.freeze({ resources: { supply: 10, organization: -6, intelligence: -4, trust: 4 }, regions: { pingshan: { exposure: 3 }, wutai: { exposure: 2 } }, flags: { leafDirectiveHonored: true } }) }),
      Object.freeze({ id: "productionTeams", label: "组织生产互助队", description: "当前见效较慢，但减轻村庄破坏并巩固信任。", effects: Object.freeze({ resources: { supply: 4, organization: -4, trust: 6 }, allRegions: { devastation: -2 }, flags: { leafDirectiveHonored: true } }) }),
    ]),
  }),
  Object.freeze({
    id: "turn18",
    date: "1942-06-20",
    displayDate: "1942年5月1日—6月20日",
    title: "接应冀中突围人员",
    context: "冀中“五一”大“扫荡”造成严重危机。经安国、定南、曲阳至唐县等秘密交通线，干部、伤员和卫生人员向北岳区转移。接应是固定责任。",
    fact: Object.freeze({ label: "历史事实", text: "北岳与冀中之间的秘密交通线承担转移、接应干部和卫生人员等任务。侵略军暴力造成的灾难不被改写。" }),
    abstraction: Object.freeze({ label: "游戏抽象", text: "危机主要发生在地图外；玩家不能拒绝接应，只选择分散隐蔽或武装护送的协调方式。" }),
    intensity: 5,
    pressureRegions: Object.freeze(["xinle", "xingtang", "quyang", "tangxian"]),
    fixedSupportDuty: true,
    choices: Object.freeze([
      Object.freeze({ id: "safeHouses", label: "分散堡垒户接应", description: "依靠群众网络分段隐蔽，消耗物资但减少集中暴露。", effects: Object.freeze({ resources: { supply: -9, organization: -5, trust: 6 }, regions: { xinle: { network: 5, exposure: 5 }, xingtang: { network: 6, exposure: 4 }, quyang: { safety: 6, protection: 7 }, tangxian: { safety: 6, protection: 7 } }, institutions: { hospital: { health: 5 } }, flags: { finalSupportCompleted: true, finalSupportMethod: "safeHouses" } }) }),
      Object.freeze({ id: "armedEscort", label: "组织分段武装护送", description: "提高路线通过能力，但沿线暴露与物资消耗更高。", effects: Object.freeze({ resources: { supply: -12, organization: -6, intelligence: -5, trust: 4 }, regions: { xinle: { enemyControl: -4, exposure: 9 }, xingtang: { enemyControl: -5, exposure: 8 }, quyang: { safety: 5, exposure: 6 }, tangxian: { safety: 7, protection: 5 } }, institutions: { hospital: { health: 4 }, radio: { health: 3 } }, flags: { finalSupportCompleted: true, finalSupportMethod: "armedEscort" } }) }),
    ]),
  }),
]);

export const historicalTurns = Object.freeze(historicalTurnDefinitions.map((historicalTurn) => Object.freeze({
  ...historicalTurn,
  prompt: historicalTurn.prompt || "在史实进程不被改写的前提下，本回合优先协调哪项工作？",
  choices: Object.freeze(historicalTurn.choices.map((choice) => Object.freeze({
    ...choice,
    name: choice.name || choice.label,
    preview: choice.preview || choice.description,
  }))),
})));

const institutionDefinitions = Object.freeze({
  government: Object.freeze({ id: "government", name: "边区政务机关", regionId: "fuping", health: 84, active: true }),
  hospital: Object.freeze({ id: "hospital", name: "卫生与医院系统", regionId: "tangxian", health: 78, active: true }),
  school: Object.freeze({ id: "school", name: "抗大二分校", regionId: "wutai", health: 80, active: true }),
  press: Object.freeze({ id: "press", name: "印刷与报刊机构", regionId: "fuping", health: 72, active: true }),
  radio: Object.freeze({ id: "radio", name: "电台与通信机构", regionId: "fuping", health: 76, active: true }),
});

function CloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function Clamp(value, minimum = 0, maximum = 100) {
  if (!Number.isFinite(value)) {
    return minimum;
  }
  return Math.min(maximum, Math.max(minimum, value));
}

function Round(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function NormalizeSeed(seed) {
  const numericSeed = Number(seed);
  if (!Number.isFinite(numericSeed)) {
    return gameConfig.defaultSeed >>> 0;
  }
  const normalizedSeed = Math.trunc(numericSeed) >>> 0;
  return normalizedSeed === 0 ? 0x6d2b79f5 : normalizedSeed;
}

function NextRandom(game) {
  let rngState = game.rngState >>> 0;
  rngState ^= rngState << 13;
  rngState ^= rngState >>> 17;
  rngState ^= rngState << 5;
  game.rngState = rngState >>> 0;
  game.rngCalls += 1;
  return (game.rngState >>> 0) / 4294967296;
}

function RandomInteger(game, minimum, maximum) {
  return minimum + Math.floor(NextRandom(game) * (maximum - minimum + 1));
}

function GetCurrentHistoricalTurn(game) {
  return game.turnIndex >= 0 && game.turnIndex < historicalTurns.length ? historicalTurns[game.turnIndex] : null;
}

function GetEmptyResourceDelta() {
  return { supply: 0, organization: 0, intelligence: 0, trust: 0 };
}

function GetEmptyRegionDelta() {
  return { network: 0, safety: 0, enemyControl: 0, exposure: 0, devastation: 0, protection: 0 };
}

function AddResourceDelta(target, delta) {
  for (const resourceKey of resourceKeys) {
    target[resourceKey] = (target[resourceKey] || 0) + Number(delta?.[resourceKey] || 0);
  }
}

function AddRegionDelta(target, delta) {
  for (const regionKey of Object.keys(GetEmptyRegionDelta())) {
    target[regionKey] = (target[regionKey] || 0) + Number(delta?.[regionKey] || 0);
  }
}

function ApplyResourceDelta(game, delta) {
  for (const resourceKey of resourceKeys) {
    const value = game.resources[resourceKey] + Number(delta?.[resourceKey] || 0);
    game.resources[resourceKey] = Clamp(value);
  }
}

function ApplyRegionDelta(game, regionId, delta) {
  const region = game.regions[regionId];
  if (!region) {
    return;
  }
  for (const regionKey of Object.keys(GetEmptyRegionDelta())) {
    if (delta?.[regionKey] !== undefined) {
      region[regionKey] = Clamp(region[regionKey] + Number(delta[regionKey]));
    }
  }
}

function ApplyInstitutionDelta(game, institutionId, delta, changes) {
  const institution = game.institutions[institutionId];
  if (!institution || !delta) {
    return;
  }
  const before = CloneValue(institution);
  if (delta.regionId && game.regions[delta.regionId]) {
    institution.regionId = delta.regionId;
  }
  if (delta.health !== undefined) {
    institution.health = Clamp(institution.health + Number(delta.health));
  }
  if (delta.active !== undefined) {
    institution.active = Boolean(delta.active);
  }
  if (institution.health <= 0) {
    institution.health = 0;
    institution.active = false;
  }
  if (JSON.stringify(before) !== JSON.stringify(institution) && changes) {
    changes.push({ institutionId, name: institution.name, before, after: CloneValue(institution) });
  }
}

function ApplyEffectBundle(game, effects, institutionChanges) {
  if (!effects) {
    return;
  }
  ApplyResourceDelta(game, effects.resources || {});
  if (effects.allRegions) {
    for (const regionId of Object.keys(game.regions)) {
      ApplyRegionDelta(game, regionId, effects.allRegions);
    }
  }
  if (effects.regions) {
    for (const [regionId, delta] of Object.entries(effects.regions)) {
      ApplyRegionDelta(game, regionId, delta);
    }
  }
  if (effects.institutions) {
    for (const [institutionId, delta] of Object.entries(effects.institutions)) {
      ApplyInstitutionDelta(game, institutionId, delta, institutionChanges);
    }
  }
  if (effects.enemySuspicion) {
    for (const [regionId, amount] of Object.entries(effects.enemySuspicion)) {
      if (game.enemy.suspicionByRegion[regionId] !== undefined) {
        game.enemy.suspicionByRegion[regionId] = Clamp(game.enemy.suspicionByRegion[regionId] + Number(amount));
      }
    }
  }
  if (effects.flags) {
    Object.assign(game.flags, CloneValue(effects.flags));
  }
}

function GetActionCosts(game, actionId) {
  const action = actionDefinitions[actionId];
  if (!action) {
    return GetEmptyResourceDelta();
  }
  const costs = CloneValue(action.costs);
  if (game.policyId === "production" && actionId === "relief") {
    costs.supply = Math.max(0, costs.supply - 2);
  }
  if (game.policyId === "network" && (actionId === "contact" || actionId === "massWork")) {
    costs.organization = Math.max(0, costs.organization - 1);
  }
  if (game.policyId === "protect" && actionId === "evacuate") {
    costs.organization = Math.max(0, costs.organization - 1);
  }
  return costs;
}

function GetQueuedCosts(game) {
  const totalCosts = GetEmptyResourceDelta();
  for (const order of game.queuedOrders) {
    AddResourceDelta(totalCosts, GetActionCosts(game, order.actionId));
  }
  return totalCosts;
}

function GetPlanningResources(game) {
  const resources = CloneValue(game.resources);
  const historicalTurn = GetCurrentHistoricalTurn(game);
  const selectedChoice = historicalTurn?.choices.find((choice) => choice.id === game.selectedEventOptionId);
  for (const resourceKey of resourceKeys) {
    resources[resourceKey] = Clamp(resources[resourceKey] + Number(selectedChoice?.effects?.resources?.[resourceKey] || 0));
  }
  return resources;
}

function FindEvacuationDestination(game, regionId) {
  const region = game.regions[regionId];
  if (!region || !region.adjacentIds.length) {
    return null;
  }
  return [...region.adjacentIds].sort((leftId, rightId) => {
    const left = game.regions[leftId];
    const right = game.regions[rightId];
    const leftScore = left.safety + left.protection - left.exposure - left.enemyControl * 0.25;
    const rightScore = right.safety + right.protection - right.exposure - right.enemyControl * 0.25;
    return rightScore - leftScore || leftId.localeCompare(rightId);
  })[0];
}

function NormalizeOrderArguments(actionIdOrOrder, regionId, destinationRegionId) {
  if (actionIdOrOrder && typeof actionIdOrOrder === "object") {
    return {
      actionId: actionIdOrOrder.actionId,
      regionId: actionIdOrOrder.regionId,
      destinationRegionId: actionIdOrOrder.destinationRegionId ?? null,
    };
  }
  return { actionId: actionIdOrOrder, regionId, destinationRegionId: destinationRegionId ?? null };
}

function AssertPlanning(game) {
  if (!game || game.phase !== "planning" || game.turnIndex >= historicalTurns.length) {
    throw new Error("当前战役不在可下令的规划阶段。");
  }
}

export function CreateGame(seed = gameConfig.defaultSeed) {
  const normalizedSeed = NormalizeSeed(seed);
  const regions = {};
  const suspicionByRegion = {};
  for (const [regionId, definition] of Object.entries(regionDefinitionsById)) {
    regions[regionId] = CloneValue(definition);
    suspicionByRegion[regionId] = Clamp(
      definition.exposure * 0.55 + definition.corridorRelevance * 0.18 + definition.railRelevance * 0.12,
    );
  }
  const institutions = CloneValue(institutionDefinitions);
  return {
    saveVersion: gameConfig.saveVersion,
    seed: normalizedSeed,
    rngState: normalizedSeed,
    rngCalls: 0,
    turnIndex: 0,
    phase: "planning",
    policyId: "protect",
    policyCooldown: 0,
    resources: { supply: 68, organization: 72, intelligence: 46, trust: 58 },
    regions,
    institutions,
    enemy: { suspicionByRegion, lastTargets: [] },
    queuedOrders: [],
    orderSequence: 0,
    selectedEventOptionId: null,
    lastResolution: null,
    history: [],
    logs: [],
    flags: {},
    outcome: null,
  };
}

export function QueueOrder(game, actionIdOrOrder, regionId, destinationRegionId = null) {
  AssertPlanning(game);
  const orderInput = NormalizeOrderArguments(actionIdOrOrder, regionId, destinationRegionId);
  if (!actionDefinitions[orderInput.actionId]) {
    throw new Error(`未知行动：${String(orderInput.actionId)}`);
  }
  if (!regionDefinitionsById[orderInput.regionId]) {
    throw new Error(`未知地区：${String(orderInput.regionId)}`);
  }
  if (game.queuedOrders.length >= gameConfig.ordersPerTurn) {
    throw new Error(`每回合最多下达${gameConfig.ordersPerTurn}项命令。`);
  }
  if (game.queuedOrders.some((order) => order.regionId === orderInput.regionId)) {
    throw new Error("同一回合每个地区只能安排一项命令。");
  }
  let normalizedDestination = orderInput.destinationRegionId;
  if (orderInput.actionId === "evacuate") {
    normalizedDestination = normalizedDestination || FindEvacuationDestination(game, orderInput.regionId);
    if (!normalizedDestination || !game.regions[orderInput.regionId].adjacentIds.includes(normalizedDestination)) {
      throw new Error("转移疏散的目的地必须与出发地区相邻。");
    }
  } else {
    normalizedDestination = null;
  }
  const nextGame = CloneValue(game);
  const order = {
    id: `order_${nextGame.turnIndex}_${nextGame.orderSequence}`,
    actionId: orderInput.actionId,
    regionId: orderInput.regionId,
    destinationRegionId: normalizedDestination,
  };
  nextGame.orderSequence += 1;
  nextGame.queuedOrders.push(order);
  const queuedCosts = GetQueuedCosts(nextGame);
  const planningResources = GetPlanningResources(nextGame);
  for (const resourceKey of resourceKeys) {
    if (queuedCosts[resourceKey] > planningResources[resourceKey]) {
      throw new Error(`资源不足：${GetResourceName(resourceKey)}无法支持全部已排命令。`);
    }
  }
  return nextGame;
}

export function RemoveOrder(game, orderIdOrRegionId) {
  AssertPlanning(game);
  const nextGame = CloneValue(game);
  const index = nextGame.queuedOrders.findIndex(
    (order) => order.id === orderIdOrRegionId || order.regionId === orderIdOrRegionId,
  );
  if (index >= 0) {
    nextGame.queuedOrders.splice(index, 1);
  }
  return nextGame;
}

export function ClearOrders(game) {
  AssertPlanning(game);
  const nextGame = CloneValue(game);
  nextGame.queuedOrders = [];
  return nextGame;
}

export function ChangePolicy(game, policyId) {
  AssertPlanning(game);
  const policy = policyDefinitions[policyId];
  if (!policy) {
    throw new Error(`未知方针：${String(policyId)}`);
  }
  if (game.policyId === policyId) {
    return CloneValue(game);
  }
  if (game.policyCooldown > 0) {
    throw new Error(`方针调整仍需等待${game.policyCooldown}回合。`);
  }
  const availableOrganization = Math.min(game.resources.organization, GetPlanningResources(game).organization);
  if (availableOrganization < policy.switchCost) {
    throw new Error("组织力不足，无法调整方针。");
  }
  const nextGame = CloneValue(game);
  nextGame.resources.organization -= policy.switchCost;
  nextGame.policyId = policyId;
  nextGame.policyCooldown = policy.cooldownTurns;
  const queuedCosts = GetQueuedCosts(nextGame);
  const planningResources = GetPlanningResources(nextGame);
  for (const resourceKey of resourceKeys) {
    if (queuedCosts[resourceKey] > planningResources[resourceKey]) {
      throw new Error(`调整方针后${GetResourceName(resourceKey)}不足，请先撤回部分命令。`);
    }
  }
  return nextGame;
}

export function ChooseEventOption(game, optionId) {
  AssertPlanning(game);
  const historicalTurn = GetCurrentHistoricalTurn(game);
  if (!historicalTurn.choices.some((choice) => choice.id === optionId)) {
    throw new Error(`当前史实节点没有选项：${String(optionId)}`);
  }
  const nextGame = CloneValue(game);
  nextGame.selectedEventOptionId = optionId;
  const queuedCosts = GetQueuedCosts(nextGame);
  const planningResources = GetPlanningResources(nextGame);
  for (const resourceKey of resourceKeys) {
    if (queuedCosts[resourceKey] > planningResources[resourceKey]) {
      throw new Error(`选择该方案后${GetResourceName(resourceKey)}不足，请先撤回部分命令。`);
    }
  }
  return nextGame;
}

function GetResourceName(resourceKey) {
  const names = { supply: "物资", organization: "组织力", intelligence: "情报", trust: "群众信任" };
  return names[resourceKey] || resourceKey;
}

function GetTerrainModifier(region, actionId) {
  if (["mountain", "foothills"].includes(region.terrainId) && ["evacuate", "ambush", "contact"].includes(actionId)) {
    return 7;
  }
  if (["railPass", "railPlain"].includes(region.terrainId) && actionId === "sabotage") {
    return 8;
  }
  if (["railPlain", "plain"].includes(region.terrainId) && actionId === "evacuate") {
    return -8;
  }
  if (region.terrainId === "mountain" && actionId === "relief") {
    return -3;
  }
  return 0;
}

function GetActionReadiness(game, actionId, regionId) {
  const region = game.regions[regionId];
  const terrain = GetTerrainModifier(region, actionId);
  const localSupport = region.network * 0.22 + region.protection * 0.12;
  const information = game.resources.intelligence * 0.16;
  const organization = game.resources.organization * 0.12;
  const opposition = region.enemyControl * (["sabotage", "ambush"].includes(actionId) ? 0.22 : 0.1);
  return Clamp(38 + terrain + localSupport + information + organization - opposition);
}

function GetSuccessBand(readiness) {
  if (readiness >= 72) {
    return "可靠";
  }
  if (readiness >= 52) {
    return "有把握";
  }
  return "冒险";
}

function GetRiskLabel(game, actionId, regionId) {
  const action = actionDefinitions[actionId];
  const region = game.regions[regionId];
  const risk = region.exposure + action.evidence + region.enemyControl * 0.25 - region.protection * 0.25;
  if (risk >= 82) {
    return "很高";
  }
  if (risk >= 62) {
    return "较高";
  }
  if (risk >= 42) {
    return "中等";
  }
  return "较低";
}

export function GetActionPreview(game, actionId, regionId, destinationRegionId = null) {
  const emptyPreview = {
    valid: false,
    actionId: actionId ?? null,
    regionId: regionId ?? null,
    destinationRegionId: destinationRegionId ?? null,
    costs: GetEmptyResourceDelta(),
    projected: GetEmptyRegionDelta(),
    successBand: "冒险",
    riskLabel: "未知",
    summary: "无法预览这项行动。",
    warnings: [],
  };
  if (!game || game.phase !== "planning") {
    emptyPreview.warnings.push("战役不在规划阶段。");
    return emptyPreview;
  }
  const action = actionDefinitions[actionId];
  const region = game.regions?.[regionId];
  if (!action || !region) {
    emptyPreview.warnings.push(!action ? "行动不存在。" : "地区不存在。");
    return emptyPreview;
  }
  const normalizedDestination = actionId === "evacuate"
    ? destinationRegionId || FindEvacuationDestination(game, regionId)
    : null;
  const projected = CloneValue(action.baseChanges);
  if (game.policyId === "network" && ["massWork", "contact"].includes(actionId)) {
    projected.network += 2;
  }
  if (game.policyId === "protect" && ["relief", "evacuate", "recon"].includes(actionId)) {
    projected.safety += 2;
    projected.protection += 2;
  }
  if (game.policyId === "guerrilla" && ["sabotage", "ambush"].includes(actionId)) {
    projected.enemyControl -= 2;
    projected.exposure += 2;
  }
  if (game.policyId === "production" && actionId === "relief") {
    projected.devastation -= 2;
  }
  const costs = GetActionCosts(game, actionId);
  const readiness = GetActionReadiness(game, actionId, regionId);
  const warnings = [];
  if (game.queuedOrders.some((order) => order.regionId === regionId)) {
    warnings.push("本地区已有一项排队命令。");
  }
  if (game.queuedOrders.length >= gameConfig.ordersPerTurn) {
    warnings.push("本回合命令槽已满。");
  }
  const queuedCosts = GetQueuedCosts(game);
  const planningResources = GetPlanningResources(game);
  for (const resourceKey of resourceKeys) {
    if (queuedCosts[resourceKey] + costs[resourceKey] > planningResources[resourceKey]) {
      warnings.push(`${GetResourceName(resourceKey)}不足。`);
    }
  }
  if (actionId === "evacuate" && (!normalizedDestination || !region.adjacentIds.includes(normalizedDestination))) {
    warnings.push("需要选择相邻的转移目的地。");
  }
  if (["sabotage", "ambush"].includes(actionId) && region.safety < 38) {
    warnings.push("当地群众安全已很脆弱，扩大接触可能压缩转移窗口。");
  }
  if (region.exposure >= 70 && action.evidence > 5) {
    warnings.push("当地暴露已高，行动迹象可能提高敌军怀疑。 ");
  }
  return {
    valid: warnings.every((warning) => !warning.includes("不足") && !warning.includes("已有") && !warning.includes("已满") && !warning.includes("需要选择")),
    actionId,
    regionId,
    destinationRegionId: normalizedDestination,
    costs,
    projected,
    successBand: GetSuccessBand(readiness),
    riskLabel: GetRiskLabel(game, actionId, regionId),
    summary: `${action.name}预计${GetSuccessBand(readiness)}；主要风险为${GetRiskLabel(game, actionId, regionId)}。数值为规划估计，结算会受小幅确定性波动影响。`,
    warnings,
  };
}

function GetEnemyTargetScore(game, regionId, historicalTurn) {
  const region = game.regions[regionId];
  const suspicion = game.enemy.suspicionByRegion[regionId];
  const pressureBonus = historicalTurn?.pressureRegions?.includes(regionId) ? 8 : 0;
  return Round(
    suspicion * 0.42
      + region.exposure * 0.28
      + region.corridorRelevance * 0.17
      + region.railRelevance * 0.08
      + region.enemyControl * 0.05
      + pressureBonus,
    2,
  );
}

function GetEnemyReasons(game, regionId, historicalTurn) {
  const region = game.regions[regionId];
  const reasons = [];
  if (game.enemy.suspicionByRegion[regionId] >= 55) {
    reasons.push("敌军怀疑度偏高");
  }
  if (region.exposure >= 55) {
    reasons.push("近期活动迹象较明显");
  }
  if (region.corridorRelevance >= 80) {
    reasons.push("位于重要山地交通走廊");
  }
  if (region.railRelevance >= 70) {
    reasons.push("邻近侵略军依赖的铁路节点");
  }
  if (historicalTurn?.pressureRegions?.includes(regionId)) {
    reasons.push("本期史实态势指向该方向");
  }
  if (!reasons.length) {
    reasons.push("道路与据点活动出现一般征候");
  }
  return reasons;
}

export function GetEnemyForecast(game) {
  const historicalTurn = GetCurrentHistoricalTurn(game);
  if (!game || !historicalTurn) {
    return {
      turnIndex: game?.turnIndex ?? historicalTurns.length,
      date: null,
      certainty: "有限",
      summary: "战役已结束，没有新的敌情预测。",
      targets: [],
    };
  }
  const rankedTargets = Object.keys(game.regions)
    .map((regionId) => ({
      regionId,
      regionName: game.regions[regionId].name,
      score: GetEnemyTargetScore(game, regionId, historicalTurn),
      reasons: GetEnemyReasons(game, regionId, historicalTurn),
    }))
    .sort((left, right) => right.score - left.score || left.regionId.localeCompare(right.regionId))
    .slice(0, 3)
    .map((target, index) => ({ ...target, likelihood: index === 0 ? "高" : index === 1 ? "中" : "低" }));
  const certainty = game.resources.intelligence >= 65 ? "清晰" : game.resources.intelligence >= 35 ? "有限" : "模糊";
  return {
    turnIndex: game.turnIndex,
    date: historicalTurn.date,
    certainty,
    summary: `${certainty}情报：敌军可能优先沿${rankedTargets.map((target) => target.regionName).join("、")}方向行动。预测只依据敌方可观察的怀疑、活动迹象和交通价值。`,
    targets: rankedTargets,
  };
}

function CanAfford(game, costs) {
  return resourceKeys.every((resourceKey) => game.resources[resourceKey] >= costs[resourceKey]);
}

function ResolveOrder(game, order, institutionChanges) {
  const action = actionDefinitions[order.actionId];
  const region = game.regions[order.regionId];
  const costs = GetActionCosts(game, order.actionId);
  if (!CanAfford(game, costs)) {
    return {
      orderId: order.id,
      actionId: order.actionId,
      regionId: order.regionId,
      title: `${region.name} · ${action.name}`,
      tone: "warn",
      outcome: "未能展开",
      summary: `${region.name}的${action.name}因结算时资源不足而缩减，未产生地区效果。`,
      resourceCosts: GetEmptyResourceDelta(),
      changes: { region: GetEmptyRegionDelta(), resources: GetEmptyResourceDelta() },
    };
  }
  const negativeCosts = GetEmptyResourceDelta();
  for (const resourceKey of resourceKeys) {
    negativeCosts[resourceKey] = -costs[resourceKey];
  }
  ApplyResourceDelta(game, negativeCosts);
  const readiness = GetActionReadiness(game, order.actionId, order.regionId);
  const roll = RandomInteger(game, -10, 10);
  const outcomeScore = readiness + roll;
  const effectScale = outcomeScore >= 76 ? 1.2 : outcomeScore >= 52 ? 1 : 0.75;
  const outcome = outcomeScore >= 76 ? "成效显著" : outcomeScore >= 52 ? "稳步推进" : "部分完成";
  const regionChanges = CloneValue(action.baseChanges);
  for (const regionKey of Object.keys(regionChanges)) {
    if (regionChanges[regionKey] > 0) {
      regionChanges[regionKey] = Math.round(regionChanges[regionKey] * effectScale);
    } else if (regionChanges[regionKey] < 0 && ["network", "enemyControl", "exposure", "devastation"].includes(regionKey)) {
      regionChanges[regionKey] = Math.round(regionChanges[regionKey] * effectScale);
    }
  }
  if (game.policyId === "network" && ["massWork", "contact"].includes(order.actionId)) {
    regionChanges.network += 2;
  }
  if (game.policyId === "protect" && ["relief", "evacuate", "recon"].includes(order.actionId)) {
    regionChanges.safety += 2;
    regionChanges.protection += 2;
  }
  if (game.policyId === "guerrilla" && ["sabotage", "ambush"].includes(order.actionId)) {
    regionChanges.enemyControl -= 2;
    regionChanges.exposure += 2;
  }
  if (game.policyId === "production" && order.actionId === "relief") {
    regionChanges.devastation -= 2;
  }
  ApplyRegionDelta(game, order.regionId, regionChanges);
  const resourceChanges = GetEmptyResourceDelta();
  AddResourceDelta(resourceChanges, action.resourceChanges);
  ApplyResourceDelta(game, action.resourceChanges);
  game.enemy.suspicionByRegion[order.regionId] = Clamp(
    game.enemy.suspicionByRegion[order.regionId] + action.evidence + Math.max(0, regionChanges.exposure) * 0.35,
  );

  if (order.actionId === "contact") {
    for (const adjacentId of region.adjacentIds) {
      ApplyRegionDelta(game, adjacentId, { network: 1 });
    }
  }
  if (order.actionId === "recon") {
    game.enemy.suspicionByRegion[order.regionId] = Clamp(game.enemy.suspicionByRegion[order.regionId] - 2);
  }
  let movedInstitutionName = null;
  if (order.actionId === "evacuate" && order.destinationRegionId) {
    const movableInstitutions = Object.values(game.institutions)
      .filter((institution) => institution.active && institution.regionId === order.regionId)
      .sort((left, right) => left.health - right.health || left.id.localeCompare(right.id));
    const institution = movableInstitutions[0];
    if (institution) {
      movedInstitutionName = institution.name;
      ApplyInstitutionDelta(game, institution.id, { regionId: order.destinationRegionId, health: 2 }, institutionChanges);
    }
  }
  const actionPhrase = {
    massWork: "村级预警与互助得到恢复",
    relief: "救济与生产物资送达部分村庄",
    contact: "秘密交通站重新接通相邻地区",
    recon: "道路动向和据点征候得到核对",
    evacuate: movedInstitutionName ? `${movedInstitutionName}分散转往${game.regions[order.destinationRegionId].name}` : "群众与物资完成分散转移",
    sabotage: "交通设施受到迟滞，未统计歼敌数字",
    ambush: "搜索行动受到迟滞，未设置击杀奖励",
  }[order.actionId];
  return {
    orderId: order.id,
    actionId: order.actionId,
    regionId: order.regionId,
    title: `${region.name} · ${action.name}`,
    tone: outcomeScore >= 52 ? "good" : "neutral",
    outcome,
    summary: `${region.name}：${actionPhrase}。`,
    resourceCosts: costs,
    changes: { region: regionChanges, resources: resourceChanges },
  };
}

function GetEnemyOperationName(region, historicalTurn) {
  if (region.railRelevance >= 70) {
    return historicalTurn.intensity >= 4 ? "铁路沿线封锁搜索" : "交通线修复与巡查";
  }
  if (historicalTurn.intensity >= 4) {
    return region.terrainId === "mountain" ? "山地合围搜索" : "据点出动与分散搜索";
  }
  return "据点蚕食与道路巡查";
}

function SelectEnemyTargets(game, historicalTurn) {
  const targetCount = historicalTurn.intensity >= 5 ? 3 : historicalTurn.intensity >= 3 ? 2 : 1;
  const candidates = Object.keys(game.regions).map((regionId) => ({
    regionId,
    score: Math.max(1, GetEnemyTargetScore(game, regionId, historicalTurn)),
  }));
  const selected = [];
  while (selected.length < targetCount && candidates.length) {
    const sortedCandidates = [...candidates].sort((left, right) => right.score - left.score || left.regionId.localeCompare(right.regionId));
    const selectionPool = sortedCandidates.slice(0, Math.min(5, sortedCandidates.length));
    const totalWeight = selectionPool.reduce((sum, candidate) => sum + candidate.score, 0);
    let threshold = NextRandom(game) * totalWeight;
    let chosen = selectionPool[selectionPool.length - 1];
    for (const candidate of selectionPool) {
      threshold -= candidate.score;
      if (threshold <= 0) {
        chosen = candidate;
        break;
      }
    }
    selected.push(chosen.regionId);
    candidates.splice(candidates.findIndex((candidate) => candidate.regionId === chosen.regionId), 1);
  }
  return selected;
}

function ResolveEnemyOperation(game, regionId, historicalTurn, institutionChanges) {
  const region = game.regions[regionId];
  const operation = GetEnemyOperationName(region, historicalTurn);
  const pressure = historicalTurn.intensity + RandomInteger(game, 0, 4);
  const mitigation = Math.floor(region.protection / 18);
  const safetyLoss = Math.max(1, pressure + 2 - mitigation);
  const networkLoss = Math.max(0, Math.floor(pressure / 2) - Math.floor(region.protection / 32));
  const changes = {
    network: -networkLoss,
    safety: -safetyLoss,
    enemyControl: Math.max(1, Math.floor(pressure / 2)),
    exposure: Math.max(1, Math.floor(pressure / 3)),
    devastation: Math.max(1, Math.floor((pressure + 1) / 2)),
    protection: -Math.max(1, Math.floor(pressure / 3)),
  };
  ApplyRegionDelta(game, regionId, changes);
  game.enemy.suspicionByRegion[regionId] = Clamp(game.enemy.suspicionByRegion[regionId] - 8);
  for (const institution of Object.values(game.institutions)) {
    if (!institution.active || institution.regionId !== regionId) {
      continue;
    }
    const concealment = region.protection + (100 - region.exposure) * 0.35;
    if (RandomInteger(game, 0, 100) + concealment * 0.35 < 45 + historicalTurn.intensity * 4) {
      ApplyInstitutionDelta(game, institution.id, { health: -(2 + Math.floor(pressure / 2)) }, institutionChanges);
    }
  }
  return {
    regionId,
    title: `${region.name} · ${operation}`,
    operation,
    summary: `${region.name}出现${operation}，群众转移窗口和地方网络承受压力。侵略暴力的责任不归因于玩家行动。`,
    changes,
    rationale: GetEnemyReasons(game, regionId, historicalTurn),
  };
}

function ApplyPolicyTurn(game) {
  if (game.policyId === "protect") {
    const targets = Object.values(game.regions)
      .sort((left, right) => left.safety - right.safety || left.id.localeCompare(right.id))
      .slice(0, 3);
    for (const region of targets) {
      ApplyRegionDelta(game, region.id, { safety: 2, protection: 2 });
    }
    ApplyResourceDelta(game, { supply: -2 });
    return "保护群众方针加强了三个高危地区的预警与掩护。";
  }
  if (game.policyId === "guerrilla") {
    const targets = Object.values(game.regions)
      .filter((region) => region.corridorRelevance >= 75)
      .sort((left, right) => right.enemyControl - left.enemyControl || left.id.localeCompare(right.id))
      .slice(0, 2);
    for (const region of targets) {
      ApplyRegionDelta(game, region.id, { enemyControl: -1, exposure: 1 });
    }
    return "游击牵制方针在交通走廊维持压力，同时留下少量活动迹象。";
  }
  if (game.policyId === "network") {
    const targets = Object.values(game.regions)
      .sort((left, right) => left.network - right.network || left.id.localeCompare(right.id))
      .slice(0, 3);
    for (const region of targets) {
      ApplyRegionDelta(game, region.id, { network: 2, exposure: 1 });
    }
    return "秘密网络方针恢复了三个薄弱地区的联络。";
  }
  ApplyResourceDelta(game, { supply: 8 });
  const recoveryTarget = Object.values(game.regions)
    .sort((left, right) => right.devastation - left.devastation || left.id.localeCompare(right.id))[0];
  ApplyRegionDelta(game, recoveryTarget.id, { devastation: -2 });
  return "生产自救方针补充综合物资，并减轻一个重灾地区的生产破坏。";
}

function ApplyPassiveTurn(game) {
  ApplyResourceDelta(game, { supply: 5, organization: 4, intelligence: 2 });
  for (const region of Object.values(game.regions)) {
    ApplyRegionDelta(game, region.id, {
      exposure: -2,
      devastation: region.enemyControl < 55 ? -1 : 0,
      protection: region.network >= 45 ? 1 : 0,
    });
    game.enemy.suspicionByRegion[region.id] = Clamp(game.enemy.suspicionByRegion[region.id] - 2);
  }
}

function GetResourceDifference(before, after) {
  const difference = GetEmptyResourceDelta();
  for (const resourceKey of resourceKeys) {
    difference[resourceKey] = after[resourceKey] - before[resourceKey];
  }
  return difference;
}

function BuildWarnings(game) {
  const warnings = [];
  const lowestSafety = Object.values(game.regions).sort((left, right) => left.safety - right.safety)[0];
  const highestExposure = Object.values(game.regions).sort((left, right) => right.exposure - left.exposure)[0];
  if (lowestSafety.safety < 30) {
    warnings.push(`${lowestSafety.name}群众安全已处于严重压力。`);
  }
  if (highestExposure.exposure > 75) {
    warnings.push(`${highestExposure.name}活动暴露很高，宜考虑侦察或疏散。`);
  }
  if (game.resources.supply < 18) {
    warnings.push("综合物资紧张，下一回合可用行动将受限。 ");
  }
  const damagedInstitution = Object.values(game.institutions).find((institution) => institution.active && institution.health < 35);
  if (damagedInstitution) {
    warnings.push(`${damagedInstitution.name}运转能力已很脆弱。`);
  }
  return warnings;
}

export function CommitTurn(game) {
  AssertPlanning(game);
  const invariantCheck = CheckInvariants(game);
  if (!invariantCheck.valid) {
    throw new Error(`状态不合法，无法结算：${invariantCheck.errors.join("；")}`);
  }
  const nextGame = CloneValue(game);
  const resourcesBefore = CloneValue(nextGame.resources);
  const historicalTurn = GetCurrentHistoricalTurn(nextGame);
  const selectedChoice = historicalTurn.choices.find((choice) => choice.id === nextGame.selectedEventOptionId)
    || historicalTurn.choices[0];
  const institutionChanges = [];
  ApplyEffectBundle(nextGame, selectedChoice.effects, institutionChanges);

  const orderReports = [];
  for (const order of nextGame.queuedOrders) {
    orderReports.push(ResolveOrder(nextGame, order, institutionChanges));
  }
  const policySummary = ApplyPolicyTurn(nextGame);
  const enemyTargetIds = SelectEnemyTargets(nextGame, historicalTurn);
  const enemyReports = enemyTargetIds.map((regionId) => ResolveEnemyOperation(nextGame, regionId, historicalTurn, institutionChanges));
  nextGame.enemy.lastTargets = enemyTargetIds;
  ApplyPassiveTurn(nextGame);
  if (nextGame.policyCooldown > 0) {
    nextGame.policyCooldown -= 1;
  }

  const resolution = {
    turnIndex: nextGame.turnIndex,
    date: historicalTurn.date,
    title: historicalTurn.title,
    event: { optionId: selectedChoice.id, label: selectedChoice.label },
    orders: orderReports,
    enemy: enemyReports,
    policySummary,
    institutionChanges,
    resourceChanges: GetResourceDifference(resourcesBefore, nextGame.resources),
    warnings: BuildWarnings(nextGame),
    summary: `史实节点按既定进程发生；协调组选择“${selectedChoice.label}”，各项命令与敌军行动已同步结算。`,
  };
  nextGame.history.push(CloneValue(resolution));
  nextGame.logs.push({ text: `${historicalTurn.displayDate}：${selectedChoice.label}。`, tone: "neutral" });
  for (const warning of resolution.warnings) {
    nextGame.logs.push({ text: warning, tone: "warn" });
  }
  nextGame.logs = nextGame.logs.slice(-24);
  nextGame.lastResolution = resolution;
  nextGame.turnIndex += 1;
  nextGame.queuedOrders = [];
  nextGame.selectedEventOptionId = null;
  if (nextGame.turnIndex >= historicalTurns.length) {
    nextGame.phase = "ended";
    nextGame.outcome = {
      nationalOutcomeFixed: true,
      nationalOutcome: gameConfig.nationalOutcome,
      localAssessment: "本局只评估北岳区群众、网络和机构的保存情况。",
    };
  }
  return nextGame;
}

function GetAverage(values) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function HasOpenCorridor(game) {
  const destinations = new Set(["wutai", "pingshan", "yixian"]);
  const visited = new Set();
  const pending = ["fuping"];
  while (pending.length) {
    const regionId = pending.shift();
    if (visited.has(regionId)) {
      continue;
    }
    visited.add(regionId);
    const region = game.regions[regionId];
    if (!region || region.network < 30 || region.enemyControl > 85) {
      continue;
    }
    if (regionId !== "fuping" && destinations.has(regionId)) {
      return true;
    }
    for (const adjacentId of region.adjacentIds) {
      if (!visited.has(adjacentId)) {
        pending.push(adjacentId);
      }
    }
  }
  return false;
}

export function GetCampaignScore(game) {
  const safetyValue = Round(GetAverage(Object.values(game.regions).map((region) => region.safety)), 1);
  const networkValue = Round(GetAverage(Object.values(game.regions).map((region) => region.network)), 1);
  const institutionValue = Round(
    GetAverage(Object.values(game.institutions).map((institution) => institution.active ? institution.health : 0)),
    1,
  );
  const resistanceValue = Round(100 - GetAverage(Object.values(game.regions).map((region) => region.enemyControl)), 1);
  const trustValue = Round(game.resources.trust, 1);
  const componentValues = {
    safety: safetyValue,
    network: networkValue,
    institutions: institutionValue,
    resistance: resistanceValue,
    trust: trustValue,
  };
  const components = {};
  let total = 0;
  for (const [componentId, weight] of Object.entries(gameConfig.scoreWeights)) {
    const weighted = Round(componentValues[componentId] * weight, 2);
    total += weighted;
    components[componentId] = { value: componentValues[componentId], weight, weighted };
  }
  total = Round(Clamp(total), 1);
  const effectiveNetworkRegions = Object.values(game.regions).filter((region) => region.network >= 35).length;
  const institutionSurvivors = Object.values(game.institutions).filter((institution) => institution.active && institution.health >= 35).length;
  const corridorOpen = HasOpenCorridor(game);
  let grade = "fractured";
  let label = "网络受创";
  if (total >= 64 && effectiveNetworkRegions >= 10 && institutionSurvivors >= 4 && corridorOpen) {
    grade = "consolidated";
    label = "在困境中巩固";
  } else if (total >= 56 && effectiveNetworkRegions >= 8 && institutionSurvivors >= 3 && corridorOpen) {
    grade = "preserved";
    label = "保存元气";
  } else if (total >= 44) {
    grade = "endured";
    label = "坚持下来";
  }
  return {
    total,
    grade,
    label,
    components,
    requirements: { effectiveNetworkRegions, institutionSurvivors, corridorOpen },
    nationalOutcomeFixed: true,
    nationalOutcome: gameConfig.nationalOutcome,
    summary: `${label}：群众安全${safetyValue}，抗日网络${networkValue}，机构存续${institutionValue}，战场牵制${resistanceValue}。不统计击杀，也不改变全国抗战的史实结局。`,
  };
}

export function SerializeGame(game) {
  const check = CheckInvariants(game);
  if (!check.valid) {
    throw new Error(`无法保存不合法状态：${check.errors.join("；")}`);
  }
  return JSON.stringify(game);
}

function MigrateState(rawState) {
  const state = CloneValue(rawState);
  if (state.saveVersion === undefined && state.version === 0) {
    state.saveVersion = 1;
    delete state.version;
  }
  return state;
}

export function DeserializeGame(serialized) {
  let rawState;
  try {
    rawState = typeof serialized === "string" ? JSON.parse(serialized) : CloneValue(serialized);
  } catch (error) {
    throw new Error(`存档无法解析：${error.message}`);
  }
  const state = MigrateState(rawState);
  if (state.saveVersion !== gameConfig.saveVersion) {
    throw new Error(`不支持的存档版本：${String(state.saveVersion)}`);
  }
  const check = CheckInvariants(state);
  if (!check.valid) {
    throw new Error(`存档校验失败：${check.errors.join("；")}`);
  }
  return state;
}

function IsFiniteRange(value, minimum = 0, maximum = 100) {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

export function CheckInvariants(game) {
  const errors = [];
  const warnings = [];
  if (!game || typeof game !== "object") {
    return { valid: false, errors: ["状态必须是对象。"], warnings };
  }
  if (game.saveVersion !== gameConfig.saveVersion) {
    errors.push("存档版本不匹配。 ");
  }
  if (!Number.isInteger(game.turnIndex) || game.turnIndex < 0 || game.turnIndex > historicalTurns.length) {
    errors.push("回合索引越界。 ");
  }
  if (!["planning", "ended"].includes(game.phase)) {
    errors.push("阶段字段无效。 ");
  }
  if (game.phase === "ended" && game.turnIndex !== historicalTurns.length) {
    errors.push("结束状态与回合索引不一致。 ");
  }
  if (game.phase === "planning" && game.turnIndex >= historicalTurns.length) {
    errors.push("规划状态不能位于战役结束之后。 ");
  }
  if (!Number.isInteger(game.rngState) || game.rngState < 0 || game.rngState > 0xffffffff) {
    errors.push("随机数状态无效。 ");
  }
  if (!Number.isInteger(game.rngCalls) || game.rngCalls < 0) {
    errors.push("随机数调用计数无效。 ");
  }
  if (!policyDefinitions[game.policyId]) {
    errors.push("方针不存在。 ");
  }
  if (!Number.isInteger(game.policyCooldown) || game.policyCooldown < 0 || game.policyCooldown > 20) {
    errors.push("方针冷却无效。 ");
  }
  for (const resourceKey of resourceKeys) {
    if (!IsFiniteRange(game.resources?.[resourceKey])) {
      errors.push(`${GetResourceName(resourceKey)}不在0至100范围内。`);
    }
  }
  const expectedRegionIds = Object.keys(regionDefinitionsById);
  if (!game.regions || Object.keys(game.regions).length !== expectedRegionIds.length) {
    errors.push("地区数量不正确。 ");
  }
  for (const regionId of expectedRegionIds) {
    const region = game.regions?.[regionId];
    if (!region) {
      errors.push(`缺少地区${regionId}。`);
      continue;
    }
    for (const regionKey of regionValueKeys) {
      if (!IsFiniteRange(region[regionKey])) {
        errors.push(`${region.name || regionId}的${regionKey}越界。`);
      }
    }
    if (!Array.isArray(region.adjacentIds)) {
      errors.push(`${region.name || regionId}缺少相邻地区。`);
    } else {
      for (const adjacentId of region.adjacentIds) {
        if (!regionDefinitionsById[adjacentId] || !game.regions?.[adjacentId]?.adjacentIds?.includes(regionId)) {
          errors.push(`${region.name || regionId}与${adjacentId}的相邻关系不对称。`);
        }
      }
    }
    if (!IsFiniteRange(game.enemy?.suspicionByRegion?.[regionId])) {
      errors.push(`${region.name || regionId}的敌军怀疑度越界。`);
    }
  }
  for (const institutionId of Object.keys(institutionDefinitions)) {
    const institution = game.institutions?.[institutionId];
    if (!institution) {
      errors.push(`缺少机构${institutionId}。`);
      continue;
    }
    if (!game.regions?.[institution.regionId]) {
      errors.push(`${institution.name || institutionId}所在地区不存在。`);
    }
    if (!IsFiniteRange(institution.health)) {
      errors.push(`${institution.name || institutionId}健康值越界。`);
    }
    if (typeof institution.active !== "boolean") {
      errors.push(`${institution.name || institutionId}启用状态无效。`);
    }
    if (!institution.active && institution.health > 0) {
      warnings.push(`${institution.name || institutionId}已停摆但仍保留健康值。`);
    }
  }
  if (!Array.isArray(game.queuedOrders) || game.queuedOrders.length > gameConfig.ordersPerTurn) {
    errors.push("排队命令数量无效。 ");
  } else {
    const usedRegions = new Set();
    const orderIds = new Set();
    for (const order of game.queuedOrders) {
      if (!actionDefinitions[order.actionId] || !game.regions?.[order.regionId]) {
        errors.push("排队命令引用未知行动或地区。 ");
      }
      if (usedRegions.has(order.regionId)) {
        errors.push("同一地区出现多项排队命令。 ");
      }
      if (orderIds.has(order.id)) {
        errors.push("排队命令编号重复。 ");
      }
      usedRegions.add(order.regionId);
      orderIds.add(order.id);
      if (order.actionId === "evacuate" && !game.regions?.[order.regionId]?.adjacentIds?.includes(order.destinationRegionId)) {
        errors.push("转移命令目的地不相邻。 ");
      }
    }
    const queuedCosts = GetQueuedCosts(game);
    const planningResources = GetPlanningResources(game);
    for (const resourceKey of resourceKeys) {
      if (queuedCosts[resourceKey] > planningResources[resourceKey]) {
        errors.push(`排队命令超出${GetResourceName(resourceKey)}。`);
      }
    }
  }
  const currentTurn = GetCurrentHistoricalTurn(game);
  if (game.selectedEventOptionId && !currentTurn?.choices.some((choice) => choice.id === game.selectedEventOptionId)) {
    errors.push("史实事件选项与当前回合不匹配。 ");
  }
  if (!Array.isArray(game.history) || game.history.length !== game.turnIndex) {
    errors.push("历史记录长度与回合索引不一致。 ");
  }
  if (!Array.isArray(game.logs)) {
    errors.push("局势日志必须是数组。 ");
  }
  if (!Number.isInteger(game.orderSequence) || game.orderSequence < 0) {
    errors.push("命令序号无效。 ");
  }
  return { valid: errors.length === 0, errors, warnings };
}

function GetAutoEventOption(game, historicalTurn) {
  if (historicalTurn.choices.length === 1) {
    return historicalTurn.choices[0].id;
  }
  const index = (game.seed + game.turnIndex * 17) % historicalTurn.choices.length;
  return historicalTurn.choices[index].id;
}

function GetAutoActionCandidates(game) {
  const candidates = [];
  for (const region of Object.values(game.regions)) {
    candidates.push({ actionId: "relief", regionId: region.id, score: (100 - region.safety) * 1.25 + region.devastation * 0.8 });
    candidates.push({ actionId: "massWork", regionId: region.id, score: (100 - region.network) * 1.05 + (100 - region.protection) * 0.35 });
    candidates.push({ actionId: "contact", regionId: region.id, score: (100 - region.network) * 0.9 + region.corridorRelevance * 0.35 - region.exposure * 0.25 });
    candidates.push({ actionId: "recon", regionId: region.id, score: (100 - game.resources.intelligence) * 0.8 + region.exposure * 0.45 + region.corridorRelevance * 0.2 });
    candidates.push({ actionId: "evacuate", regionId: region.id, score: region.exposure * 0.8 + (100 - region.safety) * 0.7 + (100 - region.protection) * 0.4 });
    candidates.push({ actionId: "sabotage", regionId: region.id, score: region.railRelevance * 0.65 + region.enemyControl * 0.45 - region.exposure * 0.5 });
    candidates.push({ actionId: "ambush", regionId: region.id, score: region.enemyControl * 0.5 + region.corridorRelevance * 0.35 - region.exposure * 0.55 - (50 - region.safety) * 0.5 });
  }
  return candidates.sort((left, right) => {
    const leftVariation = (((game.seed ^ (game.turnIndex * 131) ^ HashString(`${left.actionId}${left.regionId}`)) >>> 0) % 100) / 100;
    const rightVariation = (((game.seed ^ (game.turnIndex * 131) ^ HashString(`${right.actionId}${right.regionId}`)) >>> 0) % 100) / 100;
    return (right.score + rightVariation) - (left.score + leftVariation)
      || left.actionId.localeCompare(right.actionId)
      || left.regionId.localeCompare(right.regionId);
  });
}

function HashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function MaybeChangeAutoPolicy(game) {
  if (game.policyCooldown > 0 || game.turnIndex === 0) {
    return game;
  }
  let desiredPolicy = game.policyId;
  const averageSafety = GetAverage(Object.values(game.regions).map((region) => region.safety));
  const averageNetwork = GetAverage(Object.values(game.regions).map((region) => region.network));
  if (game.resources.supply < 28) {
    desiredPolicy = "production";
  } else if (averageSafety < 42) {
    desiredPolicy = "protect";
  } else if (averageNetwork < 43) {
    desiredPolicy = "network";
  } else if (game.turnIndex % 5 === 3) {
    desiredPolicy = "guerrilla";
  }
  const policy = policyDefinitions[desiredPolicy];
  if (desiredPolicy !== game.policyId && game.resources.organization >= policy.switchCost + 18) {
    return ChangePolicy(game, desiredPolicy);
  }
  return game;
}

export function AutoPlayTurn(game) {
  if (game.phase === "ended") {
    return CloneValue(game);
  }
  let nextGame = MaybeChangeAutoPolicy(CloneValue(game));
  const historicalTurn = GetCurrentHistoricalTurn(nextGame);
  nextGame.selectedEventOptionId = GetAutoEventOption(nextGame, historicalTurn);
  nextGame.queuedOrders = [];
  const usedRegions = new Set();
  for (const candidate of GetAutoActionCandidates(nextGame)) {
    if (nextGame.queuedOrders.length >= gameConfig.ordersPerTurn) {
      break;
    }
    if (usedRegions.has(candidate.regionId)) {
      continue;
    }
    const preview = GetActionPreview(nextGame, candidate.actionId, candidate.regionId);
    if (!preview.valid) {
      continue;
    }
    nextGame.queuedOrders.push({
      id: `order_${nextGame.turnIndex}_${nextGame.orderSequence}`,
      actionId: candidate.actionId,
      regionId: candidate.regionId,
      destinationRegionId: candidate.actionId === "evacuate" ? preview.destinationRegionId : null,
    });
    nextGame.orderSequence += 1;
    usedRegions.add(candidate.regionId);
  }
  return CommitTurn(nextGame);
}

export function GetCurrentTurn(game) {
  return GetCurrentHistoricalTurn(game);
}

export function GetInstitutionDefinitions() {
  return CloneValue(institutionDefinitions);
}
