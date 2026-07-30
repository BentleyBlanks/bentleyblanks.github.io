export const MissionConfig = Object.freeze({
  title: "地火线",
  subtitle: "冀中平原 · 一九四二年五月",
  maxTurns: 11,
  sweepTurn: 5,
  evacuationTurn: 4,
  requiredEvacuees: 8,
  totalEvacuees: 8,
  startingTools: 15,
  startingOrganization: 6,
  startingIntel: 0,
  startingExposure: 12,
  startingPeopleSafety: 100,
});

export const TerrainCatalog = Object.freeze({
  field: {
    label: "麦田",
    color: 0x8b8153,
    moveCost: 1,
    cover: 0,
  },
  orchard: {
    label: "枣林",
    color: 0x536b45,
    moveCost: 1,
    cover: 2,
  },
  village: {
    label: "村落",
    color: 0x9a7350,
    moveCost: 1,
    cover: 1,
  },
  road: {
    label: "封锁路",
    color: 0x766e61,
    moveCost: 1,
    cover: 0,
  },
  ditch: {
    label: "干沟",
    color: 0x5b6f67,
    moveCost: 2,
    cover: 2,
  },
  reed: {
    label: "苇塘",
    color: 0x4c6d63,
    moveCost: 2,
    cover: 3,
  },
});

export const SoilCatalog = Object.freeze({
  packed: {
    label: "夯土",
    digCost: 1,
    stability: 3,
    noise: 4,
    risk: "稳固，适合主干道",
  },
  clay: {
    label: "黏土",
    digCost: 2,
    stability: 4,
    noise: 3,
    risk: "费工具，但能显著减缓烟流",
  },
  root: {
    label: "树根层",
    digCost: 1,
    stability: 3,
    noise: 8,
    risk: "开挖声大，容易留下地表证据",
  },
  loose: {
    label: "返沙层",
    digCost: 1,
    stability: 1,
    noise: 6,
    risk: "下回合开裂，必须支护",
  },
});

const terrainRows = [
  ["orchard", "orchard", "field", "road", "road", "road", "road", "road"],
  ["orchard", "field", "field", "field", "road", "field", "field", "field"],
  ["ditch", "field", "village", "field", "road", "field", "village", "field"],
  ["ditch", "field", "field", "orchard", "road", "field", "village", "field"],
  ["reed", "reed", "field", "orchard", "field", "field", "field", "field"],
  ["reed", "reed", "reed", "field", "field", "field", "field", "field"],
];

const soilRows = [
  ["root", "root", "loose", "packed", "packed", "packed", "packed", "packed"],
  ["root", "loose", "packed", "loose", "packed", "root", "root", "packed"],
  ["packed", "packed", "clay", "loose", "clay", "packed", "packed", "packed"],
  ["packed", "packed", "packed", "root", "clay", "packed", "packed", "packed"],
  ["clay", "clay", "packed", "packed", "packed", "loose", "packed", "packed"],
  ["clay", "packed", "packed", "packed", "packed", "packed", "packed", "packed"],
];

const namedTiles = Object.freeze({
  "6,2": {
    name: "赵庄东院",
    kind: "origin",
    hasEntrance: true,
    entranceKnownByEnemy: false,
    description: "八户乡亲正在这里等待分批撤离。院内已有一段短地道。",
  },
  "2,1": {
    name: "北枣窖",
    kind: "safeExit",
    hasEntrance: true,
    entranceKnownByEnemy: false,
    description: "最短的撤离出口，但靠近封锁路和巡逻线。",
  },
  "0,5": {
    name: "西南苇井",
    kind: "safeExit",
    hasEntrance: true,
    entranceKnownByEnemy: false,
    description: "路线较长而隐蔽，黏土层费工具，但能减缓烟流并远离主要巡逻线。",
  },
  "3,2": {
    name: "废弃菜窖",
    kind: "emergencyExit",
    hasEntrance: true,
    entranceKnownByEnemy: true,
    description: "敌军已注意到的旧洞口，可作诱饵、伏击点或高代价应急出口。",
  },
  "4,0": {
    name: "北路岗亭",
    kind: "enemyPost",
    description: "巡逻从这里出发，扫荡开始后工兵沿路进入。",
  },
  "4,3": {
    name: "石桥封锁点",
    kind: "enemyPost",
    description: "中央封锁点；调兵去查洞后，这里会短暂变薄。",
  },
});

export function TileKey(q, r) {
  return `${q},${r}`;
}

export function ParseTileKey(tileKey) {
  const [q, r] = String(tileKey).split(",").map(Number);
  return { q, r };
}

export function CreateMissionTiles() {
  const tiles = [];
  for (let r = 0; r < terrainRows.length; r += 1) {
    for (let q = 0; q < terrainRows[r].length; q += 1) {
      const tileKey = TileKey(q, r);
      const special = namedTiles[tileKey] ?? {};
      tiles.push({
        tileKey,
        q,
        r,
        terrainId: terrainRows[r][q],
        soilId: soilRows[r][q],
        soilRevealed: special.kind === "origin",
        name: special.name ?? TerrainCatalog[terrainRows[r][q]].label,
        kind: special.kind ?? "normal",
        hasEntrance: Boolean(special.hasEntrance),
        entranceKnownByEnemy: Boolean(special.entranceKnownByEnemy),
        description: special.description ?? "",
      });
    }
  }
  return tiles;
}

export const PlayerUnitTemplates = Object.freeze([
  {
    unitId: "Scout",
    name: "交通员 · 林岚",
    shortName: "交通员",
    role: "Scout",
    layer: "Surface",
    tileKey: "5,3",
    actionPoints: 2,
    maxActionPoints: 2,
    health: 3,
    maxHealth: 3,
    attack: 0,
    color: 0x7fc6c4,
    description: "侦察地表、土层与敌军下一步意图；适合开路和引导疏散。",
  },
  {
    unitId: "WorkTeam",
    name: "地道队 · 魏青山",
    shortName: "地道队",
    role: "Digger",
    layer: "Surface",
    tileKey: "6,2",
    actionPoints: 2,
    maxActionPoints: 2,
    health: 3,
    maxHealth: 3,
    attack: 0,
    color: 0xd3b268,
    description: "唯一能挖掘、支护和抢通洞口的单位；被困或负伤会直接拖慢全局。",
  },
  {
    unitId: "Militia",
    name: "民兵组 · 韩梅",
    shortName: "民兵组",
    role: "Militia",
    layer: "Surface",
    tileKey: "6,3",
    actionPoints: 2,
    maxActionPoints: 2,
    health: 3,
    maxHealth: 3,
    attack: 1,
    ammo: 2,
    color: 0x91b86e,
    description: "布置假迹、洞口陷阱与伏击；正面硬拼能力有限。",
  },
  {
    unitId: "Guerrilla",
    name: "游击小组 · 赵河",
    shortName: "游击组",
    role: "Guerrilla",
    layer: "Surface",
    tileKey: "5,2",
    actionPoints: 2,
    maxActionPoints: 2,
    health: 4,
    maxHealth: 4,
    attack: 2,
    color: 0x6e9b76,
    description: "掩护洞口、牵制工兵并制造撤离窗口；弹药只够两次有效射击。",
    ammo: 2,
  },
]);

export const EnemyTemplates = Object.freeze([
  {
    enemyId: "NorthPatrol",
    name: "北路巡逻组",
    role: "Patrol",
    tileKey: "4,0",
    health: 3,
    maxHealth: 3,
    attack: 1,
    vision: 2,
    color: 0xbe5548,
    route: ["4,0", "4,1", "3,1", "4,1"],
  },
  {
    enemyId: "BridgePatrol",
    name: "石桥搜索组",
    role: "Patrol",
    tileKey: "3,3",
    health: 3,
    maxHealth: 3,
    attack: 1,
    vision: 2,
    digNoiseRange: 2,
    digNoiseMinRow: 3,
    color: 0xc2654e,
    route: ["3,3", "4,3", "5,3", "4,2"],
  },
  {
    enemyId: "Sapper",
    name: "工兵封锁组",
    role: "Sapper",
    tileKey: "5,0",
    health: 4,
    maxHealth: 4,
    attack: 1,
    vision: 1,
    sweepMove: 2,
    color: 0xe07855,
    route: ["5,0", "5,1", "6,1", "6,2"],
    inactiveUntilTurn: 5,
  },
]);

export const CivilianGroupTemplates = Object.freeze([
  {
    groupId: "Wounded",
    name: "伤员与担架队",
    people: 3,
    moveSteps: 1,
    trafficLoad: 2,
    pressureWeight: 2,
    logisticsNote: "担架重载；支护咽喉可与轻队并行",
  },
  {
    groupId: "Families",
    name: "两户乡亲",
    people: 2,
    moveSteps: 2,
    trafficLoad: 1,
    pressureWeight: 4,
    logisticsNote: "轻载稳行；留村时最怕封锁逼近",
  },
  {
    groupId: "Contacts",
    name: "交通站骨干",
    people: 3,
    moveSteps: 3,
    trafficLoad: 2,
    pressureWeight: 1,
    logisticsNote: "快速重队；易追上前批形成拥堵",
  },
]);

export const BriefingPages = Object.freeze([
  {
    eyebrow: "任务 · 转移赵庄群众",
    title: "先选主出口，再比较两条走廊",
    body: "敌军会在第 5 回合发动扫荡，第 4 回合转移信号才生效。交通员首次侦察时选择北枣窖或西南苇井作为主出口，地图会投影该方向的快掘与静掘走廊，并给出工具、噪音、返沙与最近敌情。主出口接通后仍可补挖备用支线。",
  },
  {
    eyebrow: "地道不是传送门",
    title: "接通出口，还要争取地面窗口",
    body: "群众到达出口下方后会等待交通员的安全信号。让交通员从出口上浮并复查地面；若工兵或巡逻正在占压，先用假迹、压制、陷阱、伏击或第二出口争取窗口。工兵扫荡时机动 2 格，但封洞与灌烟仍会提前一整回合预告。",
  },
  {
    eyebrow: "胜利条件",
    title: "十一回合内护送全部八人",
    body: "至少完成一次规划侦察、新挖一段地道，并让三批共 8 人全部在新鲜的出口安全信号中完成转移。三批速度与负载不同：生土地道容量 2，支护段容量 3，发车顺序和咽喉支护都会改变到达时机。杀敌不是任务目标。",
  },
]);
