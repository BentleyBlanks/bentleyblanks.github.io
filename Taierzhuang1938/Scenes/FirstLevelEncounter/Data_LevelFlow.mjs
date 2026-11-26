// Narrative source is the 2026-11-11 Notion script. Coordinates reuse the
// FirstLevelWhitebox space drawings. Timing, cover offsets and wave intervals
// describe this planning preview and have not been validated by gameplay.
import { BEISHAHE_STAGES, BEISHAHE_BEATS, BEISHAHE_DIALOGUE, BEISHAHE_WAVES } from "./Data_LevelFlowBeishahe.mjs";
export const FLOW_SOURCE = {
  url: "https://app.notion.com/p/3fb60335331c81faa38dfe84c25d29f0",
  revision: "01–07 2026-11-11；11–18 第五版 2026-11-16",
  coordinateSource: "FirstLevelEncounter (forked from FirstLevelWhitebox / L1Map0107 / L0610Space)",
  notice: "调度预演 · 点位与时刻为演示值",
};

// Restore the existing 08A screenplay beat. Seconds are relative to 08A,
// after the squad reaches the village mouth. Bodies remain on the same street.
export const FLOW_VILLAGE_STEALTH = {
  fromBeat: "08f", attackBeat: "09j", checkpointBeat: "09a",
  pullBeat: "09b", pullSeconds: 1.8, pullLeadSeconds: 0.3, patrolClearSeconds: 32,
  exposureGraceSeconds: 1.25, alarmSeconds: 2.5,
  detectionRangeM: 24, detectionHalfAngleDeg: 60, enemyEyeM: 1.45, lookAt: [84.5,429.5],
  playerCover: [80,426.7], liuCover: [80.9,426.9], nierCover: [79.8,427.2],
  objective: "隐蔽绕到枪眼后方，途中禁止开火",
  failure: "绕后行动暴露，后送通道被封锁",
  tether: [107.9,380], cart: [104.6,379.3],
  shelters: [[45,48.5,52,55.5],[63,66.5,70,73.5],[112,115.5,119,122.5]],
  patrol: {
    id: "TempleSearch", label: "关帝庙搜巷兵", beat: "09a", endBeat: "09b",
    side: "enemy", target: "none", enabled: true,
    area: {shape:"rect",center:[94.5,433.5],size:[1,1]},
    route: [[94.5,433.5],[92,433.5],[88,435],[84.5,429.5],[88,435],[92,433.5],[94.5,433.5]],
    count: 2, maxAlive: 2, interval: 0, lifetime: 1000, speed: 2.2,
    behavior: "withdraw", deployDelay: 60, spawnOffsets: [[0,0],[1,0.6]],
    afterRouteLookAt: [96.75,442.5],
    memberPlans: [
      {delay:4,route:[[92,433.5],[88,435],[84.5,429.5],[88,435],[92,433.5],[94.5,433.5]],waitSeconds:[0,0,0,4,0,0,0]},
      {delay:7,route:[[92,434.1],[89.8,435],[89.8,431],[92,435],[95.5,434.1]],waitSeconds:[0,0,0,5,0,0]}
    ],
    note: "进庙前预置在院墙后，进入庙院搜查、门前停步张望后回院口警戒；不因预演寿命自动死亡"
  }
};

export const FLOW_VILLAGE_CASUALTIES = {
  beat: "08a",
  gunGroup: "VillageGun",
  burstLeadSeconds: 0.65,
  fallSeconds: 0.85,
  members: [
    {id: "villager2", name: "逃出院门的村民", keys: [
      [20,104.8,432.5], [20.7,103.25,432.5], [21.4,101.2,432.5], [26,101.2,419],
    ]},
    {id: "villager3", name: "跟着逃上主街的村民", keys: [
      [21.4,105.2,432.5], [22.2,103.25,432.5], [23.2,99.8,432.5], [28.4,99.8,417.8],
    ]},
  ],
};

// Street defense is deterministic encounter blocking. Reloads, cover changes,
// warning times and stretcher batches are creative staging values.
export const FLOW_STREET_DEFENSE = {
  reloadCycleSeconds: 14, reloadSeconds: 3.5,
  statuses: {moving:"沿掩体转移",reload:"低姿态换弹",east:"封东街，掩护担架过口",north:"守北院门，阻断包抄"},
  sectors: {
    EastStreet:{groups:["EastStreet","TempleGun"],area:{shape:"rect",center:[145,465],size:[69,3]}},
    NorthYard:{groups:["NorthYard"],area:{shape:"rect",center:[106.5,459.5],size:[3,3]}},
  },
  stretcherBatches: [
    {beat:"10b",delay:15,interval:6},
    {beat:"10c",delay:18,interval:6},
    {beat:"10e",delay:3,interval:5},
  ],
  warning: {beat:"10d",delay:0,seconds:12,text:"北院砸门声接近，班长指向左院门"},
  defenders: [
    {id:"luo",sector:"NorthYard",offset:1,keys:[["10a",0,106.5,460.5],["10a",1,105.5,462],["10e",1,105.5,462],["10f",1,108.5,467]]},
    {id:"he",sector:"NorthYard",offset:5,keys:[["10a",0,107.5,461.7],["10a",1,105.5,460.5],["10d",0,105.5,460.5],["10d",0.6,104.5,463.2],["10e",1,104.5,463.2],["10f",1,107.8,467.5]]},
    {id:"liu",sector:"EastStreet",offset:8,keys:[["10a",0,99.3,477],["10a",0.3,101,480.5],["10a",0.5,106.6,483.5],["10a",0.6,109,483.5],["10a",1,109,465.8],["10e",1,109,465.8],["10f",1,109,469]]},
    {id:"yao",sector:"EastStreet",offset:3.5,keys:[["10a",0,100,462],["10a",1,110.8,464.7],["10e",1,110.8,464.7],["10f",1,110.8,467]]},
  ],
  groups: [
    {id:"EastStreet",label:"东街交替推进组",beat:"10b",endBeat:"10e",area:{shape:"rect",center:[193,449],size:[2,2]},
      route:[[193,449],[192.4,449],[192.4,454.8],[194,455],[194,458],[180,458],[180,465],[166,465],[148,465],[130,465]],
      count:8,maxAlive:4,interval:0,lifetime:220,speed:3.2,behavior:"bounds",coverWaitSeconds:4,standoffMetres:12,
      spawnOffsets:[[-0.3,-0.3],[0.3,0.3],[-0.3,0.3],[0.3,-0.3]],
      memberPlans:[
        {delay:0,lifetime:70,route:[[192.2,448.6],[192.2,454.8],[193.8,455],[193.8,457.8],[180,458],[180,464.4],[166,464.4],[148,464.4],[130,464.4]]},
        {delay:0.7,lifetime:120,route:[[192.4,449.2],[192.4,454.2],[194.2,455],[194.2,458.2],[180,458],[180,465.6],[166,465.6],[148,465.6],[130,465.6]]},
        {delay:3,lifetime:155,route:[[191.8,447.8],[192.1,453.3],[193.7,455],[193.6,457.5],[180,458],[180,464.4],[166,464.4],[148,464.4],[132,464.4]]},
        {delay:3.7,lifetime:200,route:[[192.4,447.6],[192.4,452.5],[194.3,455],[194.5,458.5],[180,458],[180,465.6],[166,465.6],[148,465.6],[132,465.6]]},
      ],
      firingArea:{shape:"rect",center:[145,465],size:[69,3]},fireCycle:{seconds:8,active:5,offset:0},withdrawAlongRoute:true,
      note:"两对步兵从折街后的院门接近，绕实墙后交替跃进；占住近处墙角，哨响后撤"},
    {id:"NorthYard",label:"北院包抄组",beat:"10c",endBeat:"10e",area:{shape:"rect",center:[169,448],size:[2,3]},
      route:[[169,448],[167,448],[167,455.5],[151,455.5],[151,450],[149,450],[149,456],[123.5,456],[123.5,455],[118.25,455],[112,455],[106.5,455],[106.5,458.6]],
      count:3,maxAlive:3,interval:0,lifetime:180,speed:2.8,behavior:"flank",deployDelay:57,
      spawnOffsets:[[0,0],[0.6,0],[1.2,0]],
      memberPlans:[
        {delay:0,route:[[167,448],[167,455.5],[151,455.5],[151,450],[149,450],[149,456],[123.5,456],[123.5,455],[118.25,455],[112,455],[106.5,455],[106.5,458.6]]},
        {delay:1.8,route:[[167,448],[167,455.5],[151,455.5],[151,450],[149,450],[149,456],[123.5,456],[123.5,455],[118.25,455],[112,455],[106.5,455],[107.3,457.2]]},
        {delay:3.6,route:[[167,448],[167,455.5],[151,455.5],[151,450],[149,450],[149,456],[123.5,456],[123.5,455],[118.25,455],[112,455],[106.5,455],[105.7,456.5]]},
      ],
      firingArea:{shape:"rect",center:[106.5,459.5],size:[3,3]},fireCycle:{seconds:7,active:3.5,offset:1},withdrawAlongRoute:true,
      note:"场院墙后集结；10D先砸门预警，十二秒后起行，经三处真实门洞绕向石碾西北"},
    {id:"TempleGun",label:"土地庙压制组",beat:"10c",endBeat:"10e",area:{shape:"rect",center:[193,451.4],size:[1.4,1]},
      route:[[193,451.4],[194,455],[194,458],[180,458],[180,465],[172.8,465.3]],spawnOffsets:[[0,0],[0.5,0]],count:2,maxAlive:2,interval:1,lifetime:170,speed:2.6,behavior:"advance",weapon:"machineGun",
      memberPlans:[
        {delay:0,route:[[193.8,455],[193.8,458],[180,458],[180,465],[172.8,465.3]]},
        {delay:0.8,route:[[194.2,455],[194.2,458.3],[180,458.3],[180,465.6],[173.5,465.6]]},
      ],
      firingArea:{shape:"rect",center:[172.8,465.3],size:[2,1.5]},
      fireCycle:{seconds:8,active:4.5,offset:0},withdrawAlongRoute:true,note:"短点射压住石碾，停火和换弹时留下还击窗口"},
    {id:"MortarTeam",label:"麦秸垛后掷弹筒",beat:"10c",endBeat:"10e",area:{shape:"rect",center:[164,449],size:[1.5,1]},
      route:[[164,449]],spawnOffsets:[[-0.4,0],[0.4,0]],count:2,maxAlive:2,interval:0,lifetime:170,speed:2.2,behavior:"guard",target:"none",
      withdrawAlongRoute:true,note:"麦秸垛北侧隐蔽，沿用10C逐发校射"},
  ],
};

export const FLOW_STAGES = [
  { id: "01", title: "防炮洞", status: "定稿", bounds: [0, 90, -15, 100] },
  { id: "02", title: "刺刀", status: "定稿", bounds: [12, 83, 37, 90] },
  { id: "03", title: "拖冬瓜", status: "定稿", bounds: [8, 77, 38, 146] },
  { id: "04", title: "干沟集结处", status: "定稿", bounds: [25, 85, 128, 170] },
  { id: "05", title: "凹路行军", status: "定稿", bounds: [65, 108, 154, 242] },
  { id: "06", title: "坦克车", status: "定稿", bounds: [68, 110, 180, 319] },
  { id: "07", title: "喘口气", status: "定稿", bounds: [75, 238, 288, 390] },
  { id: "08", title: "村口", status: "草稿", bounds: [52, 155, 360, 484] },
  { id: "09", title: "摸进老耿家", status: "草稿", bounds: [60, 130, 395, 496] },
  { id: "10", title: "守路口，撤出庄子", status: "草稿", bounds: [87, 245, 430, 555] },
  ...BEISHAHE_STAGES,
];

// User-directed opening blocking. Counts, speeds and routes are preview values.
export const FLOW_OPENING = {
  retreatCount: 12, retreatSpeed: 1.8, departureInterval: 0.35, retreatSpacing: 2,
  retreatRoute: [[63,64.5],[60,65.6],[46,65.6],[30,66.8],[23.5,67.2],[26,75],[30,86],[32.5,101],[35,114],[35,129]],
  gunSpeed: 3, gunInterval: 0.5,
  gunRoute: [[63,64.5],[60,65.6],[46,65.6],[30,66.8],[23.5,67.2],[22,66],[12,44],[13,21],[0,11],[0,0],[0,-7]],
  enemySpeed: 3,
  enemyEntryBendIndex: 4, enemyInterval: 0.4,
  enemyRoutes: [
    [[74,23],[72,36],[65,49],[59,57]],
    [[92,26],[87,40],[77,50],[62,55.5],[61,60.5],[60,65.6]],
    [[109,39],[104,53],[91,64],[76,70],[64,70],[60,65.6]],
  ],
  enemyPositions: [[54.5,61.4],[57.5,61.2],[59,65],[59.8,64],[56,65],[51,65.3],[45,66],[42,66],[39,66]],
};

// User-drawn rescue approaches, 2026-11-13. Each lane has two loose trios.
// Arrival offsets and short observation halts are creative preview blocking.
export const FLOW_OPENING_RESCUE = {
  gunfire: {beat: "02a", delay: 18},
  friendlyCry: {beat: "02b", delay: 20},
  memberArrivalInterval: 0.75,
  memberResponseInterval: 0.4,
  memberLaneOffsets: [-0.65,0.1,0.75],
  haltSeconds: [0.7, 1.2, 1.7],
  groups: [
    { id: "SouthLead", lane: "south", members: [0,2,3], responseDelay: 0, arrivalOffset: -2.8,
      route: [[30,86],[35,85],[41,84.7],[47,81.5],[51,77.5]],
      positions: [[58,72.4],[55.4,74.5],[52.8,72.8]],
      landings: [[60,65.3],[57.2,66.5],[54.6,65.5]] },
    { id: "SouthFollow", lane: "south", members: [4,5,6], responseDelay: 4.5, arrivalOffset: -0.4,
      route: [[30,86],[35,86.2],[41,85.7],[46,82.5]],
      positions: [[49.2,74.4],[46.5,76],[44,74.2]],
      landings: [[52,66.8],[49.5,65.8],[47,67]] },
    { id: "BranchLead", lane: "branch", members: [1,7,8], responseDelay: 1.8, arrivalOffset: -3.6,
      route: [[30,86],[26,75],[23.5,67.2],[26,66.9],[29,66.5]],
      positions: [[35,66.5],[32.6,65.7],[30.2,67.2]],
      landings: [[45,65.5],[42.5,66.5],[40,65.7]] },
    { id: "BranchFollow", lane: "branch", members: [9,10,11], responseDelay: 7.5, arrivalOffset: -0.8,
      route: [[30,86],[26,75],[23.5,67.2],[24,67]],
      positions: [[27.7,66.5],[25.3,65.7],[23,67.4]],
      landings: [[37.7,66],[35.3,67],[33,65.7]] },
  ],
};

// The three surviving opening actors keep their identities across 02 and 03.
// They meet the northeastern relief at point 1, then block point 2 together.
export const FLOW_OPENING_RETREAT = {
  meleeBeat: "02g", contactDelay: 0.8, contactSeconds: 1.3, memberInterval: 0.25,
  approachSeconds: 4, escapeSpeed: 3.6, meleeDistance: 1.2,
  meleeAllies: [9,10,11], meleePositions: [[40.4,66],[37.8,67],[35.5,65.7]],
  rallyBeat: "02i", blockBeat: "03a", endBeat: "03b",
  rally: [12,44], junction: [21.9,67.1], block: [26,66.8],
  fallFractions: [0.76,0.86,0.96],
};

export const FLOW_OPENING_DEFENSE = {
  delay: 3, memberInterval: 0.25, speed: 3.4,
  positions: [[39,65.5],[41.4,66.7],[43.8,65.5],[37,66.7],[34.6,65.6],[32.2,67],[29.8,65.7],[27.4,66.5],[25,65.7]],
};

// Return from the gun pit is shared by Yaowa and three surviving wounded men.
// Counts, timing and spacing are user-directed creative preview blocking.
export const FLOW_YAOWA_RETURN = {
  startBeat: "03d", joinBeat: "03h", exitBeat: "05b", speed: 1.65, retreatInterval: 1.2,
  route: [[0,-7],[0,11],[13,21],[12,44],[22,66],[24,73]],
  retreatKeys: [["03h",4/44,26,76.6],["03h",9/44,30,86],["03h",17/44,32.5,101],
    ["03h",26/44,35,116],["03h",35/44,35,131]],
  survivors: [
    {id:"openingGun0",name:"传令兵（负伤）",gap:3,offset:0.45,origin:[0.65,-7],
      evacuationKeys:[["04a",1,42,146],["04d",0,42,146],["04d",1,58,161],["05a",1,80,210]]},
    {id:"openingGun2",name:"机枪副手（负伤）",gap:5.5,offset:-0.45,origin:[1.95,-7],
      evacuationKeys:[["04a",1,44.2,146],["04d",0,44.2,146],["04d",1,59.2,161],["05a",1,80.5,212.5]]},
    {id:"pitRifleman",name:"川军伤兵",gap:8,offset:0.4,origin:[2.8,-8.8],
      evacuationKeys:[["04a",1,46.4,146],["04d",0,46.4,146],["04d",1,60.4,161],["05a",1,81,215]]},
  ],
};

export const FLOW_WOUNDED_EVACUATION = {
  startBeat: "03a", exitBeat: "05b", speed: 0.85, departureInterval: 2,
  members: [10,11],
  route: [[30,66.8],[23.5,67.2],[26,76.6],[30,86],[32.5,101],[35,116],[35,131],[35,141.5],[42,146]],
  evacuationKeys: [["04d",0,42,146],["04d",1,58,161],["05a",1,80,210]],
  leaderKeys: [["03a",1,46,65.6],["03b",0.25,30,66.8],["03b",0.4,23.5,67.2],
    ["03b",0.6,25,74],["03g",0.8,25,74],["03h",0,22,69.5]],
};

// 04B–04D user-directed defense while the camp loads ammunition and casualties.
// Keys use [beat, fraction, x, z]. The last keys rejoin after the 05A rear guard.
export const FLOW_CAMP_DEFENSE = [
  { id: "luo", readyFraction: 0.52, keys: [["04b",0,57,150],["04b",0.14,65,153],["04b",0.32,72,149],["04b",0.43,72,137],["04b",0.52,66,129],["04d",0,66,129],["04d",0.35,72,137],["04d",0.8,65,153],["05a",0.12,76,157],["05a",0.55,76,157],["05a",0.72,81.6,171],["05a",0.84,81.6,171],["05a",1,78.6,196.5]] },
  { id: "he", readyFraction: 0.7, keys: [["04b",0,49,152],["04b",0.2,48,150],["04b",0.35,42,153],["04b",0.55,45,140],["04b",0.7,57,127],["04d",0,57,127],["04d",0.35,45,140],["04d",0.8,48,150],["05a",0.12,74.5,158],["05a",0.55,74.5,158],["05a",0.72,82.8,172],["05a",0.84,82.8,172],["05a",1,81.1,199]] },
  { id: "liu", readyFraction: 0.52, keys: [["04b",0,52,150],["04b",0.18,65,153],["04b",0.4,72,149],["04b",0.52,84,145],["05a",0.22,84,145],["05a",0.32,72,149],["05a",0.42,65,153],["05a",0.55,77,157],["05a",0.8,77,157],["05a",1,79.3,195]] },
  { id: "yao", readyFraction: 0.6, keys: [["04b",0,50,149],["04b",0.2,65,153],["04b",0.42,79,147],["04b",0.6,86.4,143.2],["05a",0.22,86.4,143.2],["05a",0.32,79,147],["05a",0.42,65,153],["05a",0.55,75.5,158],["05a",0.8,75.5,158],["05a",1,78,200]], heavy: true },
];

export const FLOW_CAMP_LOADING = {
  startBeat: "04b", finishBeat: "04d", cycleSeconds: 32, memberDelaySeconds: 7, finishSeconds: 8,
  members: [
    {id:"geng",name:"老耿",route:[[50,136.8],[47.5,143],[50,149],[54,153.5]],end:[54,154]},
    {id:"ammoCarrier1",name:"运弹药的老乡",route:[[50.8,136.8],[48.1,143],[50.8,149],[54.5,153.5]],end:[54.8,154]},
    {id:"ammoCarrier2",name:"运弹药的老乡",route:[[51.6,136.8],[48.7,143],[51.6,149],[55,153.5]],end:[55.6,154]},
  ],
};

// User-directed rear-guard losses during 03. Ordinary covering soldiers keep
// their positions after falling. Counts and hit times are creative blocking.
export const FLOW_DRAG_REARGUARD = [
  {id:"dragGuard1",name:"殿后川军一",fallBeat:"03c",fallFraction:0.68,
    keys:[["03a",0,57,66.6],["03a",1,49.5,66.6],["03b",1,49.5,66.6],["03c",0.45,42.5,66.3],["03c",1,42.5,66.3]]},
  {id:"dragGuard2",name:"殿后川军二",fallBeat:"03e",fallFraction:0.48,
    keys:[["03a",0,54,65.4],["03a",1,43,65.4],["03c",0,43,65.4],["03c",1,36.5,66.8],["03e",1,36.5,66.8]]},
];

// Authored encounter staging. Heights are relative to the planning trench floor.
// These placements and timings are creative blocking for the design tool.
export const FLOW_GROUND = {
  bounds: [0, 160, 0, 315], height: 2,
  tankMoveS: 6, tankWaitS: 6, coverWaitS: 4,
  road: [[175,-40],[142,44],[132,62],[138,84],[113,104],[110,118],[108,154],[106,186],[103,216],[101,244],[101,278]],
  pockets: [
    {name:"凹路旧避弹凹口",box:[86,95,238,245]},
    {name:"担架后送凹口",box:[88,95,278,283]},
    {name:"第一捆凹口",box:[84,95,254,260]},
    {name:"弯前射击凹口",box:[88,97,273,278]},
  ],
  ramps: [
    {id:"DugoutPressureRamp",points:[[60,65.6],[61,60.5],[62,55.5]],width:2.6},
    {id:"NorthPursuitRamp",points:[[12,44],[14.5,40],[17,36]],width:2.6},
    {id:"TrafficFlankRamp",points:[[26,76.6],[20,76.8],[14,77]],width:2.6},
    {id:"DragWestRamp",points:[[30,86],[23,88],[18,90]],width:2.6},
    {id:"CrestEastRamp",points:[[35,117],[42,118],[48,120]],width:3},
    {id:"CampWestRamp",points:[[48,150],[42,153],[36,155]],width:3},
    {id:"CampEastRamp",points:[[65,153],[72,149],[79,147]],width:3},
    {id:"LaneNorthRamp",points:[[83,181],[90,183],[96,185]],width:3},
    {id:"LaneMiddleRamp",points:[[85,222],[92,224],[97,226]],width:3},
    {id:"LitterRamp",points:[[91,243],[95,247],[98,250]],width:3},
    {id:"TankRearRamp",points:[[90,269],[95,269],[99,269]],width:3},
    {id:"TankFrontRamp",points:[[94.5,284],[96.5,286],[98.5,287]],width:3},
    {id:"BendGunRamp",points:[[89,276],[85,275],[83,275]],width:2.4},
  ],
  // [id, x, z, width, height, depth, material]
  cover: [
    ["TankApproachScreen",116,78,34,3.4,1.6,"Earth"],
    ["NorthSpawnWall",70.5,40.8,1.2,2.8,13,"Earth"],
    ["EastSpawnWall",72.3,63.8,1.6,2.8,20,"Stone"],
    ["DugoutDoorBags",59,63.9,2.4,1.05,0.7,"Sandbag"],
    ["DugoutDoorReturn",57.4,67.45,0.65,1.1,2.1,"Stone"],
    ["DugoutInnerCrates",53.8,64,2.4,0.95,0.8,"Wood"],
    ["DragFirstShield",48.2,63.9,3.2,1.05,0.8,"Sandbag"],
    ["DragCornerShield",29,64.5,2.8,1.05,0.7,"Sandbag"],
    ["PursuitRearCrates",64.5,64.4,0.65,1.05,1.2,"Wood"],
    ["PursuitForwardBags",53,65.4,0.65,1.05,1.4,"Sandbag"],
    ["TrafficFlankBags",21,79.2,3,0.95,0.8,"Sandbag"],
    ["DragWestBerm",20,94,5,0.9,2,"Earth"],
    ["PitPursuitScreen",-6,-13,12,2.8,1.2,"Earth"],
    ["NorthPursuitSpawnScreen",24,37.5,12,3.2,1.4,"Earth"],
    ["NorthPursuitSpawnReturn",30,31,1.4,3.2,14.4,"Earth"],
    ["WestPursuitScreen",11.5,75.5,1.4,3.2,12,"Earth"],
    ["WestPursuitReturn",3.5,81.5,17,2.6,1.2,"Earth"],
    ["NorthPursuitBags",11.5,52,2.2,1.05,0.7,"Sandbag"],
    ["NorthPursuitFrontBags",13.8,55.8,4.4,1.1,0.8,"Sandbag"],
    ["NorthPursuitSideBags",10.8,53.8,0.7,1.1,4,"Sandbag"],
    ["BendPursuitFrontBags",23.5,86.6,6.6,1.1,0.8,"Sandbag"],
    ["CrestWestSandbags",27.5,126.5,5,1,1,"Sandbag"],
    ["CrestEastSandbags",43,127.5,5,1,1,"Sandbag"],
    ["CampWestGun",41,135.5,5,1.1,1,"Sandbag"],
    ["CampEastGun",74,137,5,1.1,1,"Sandbag"],
    ["RoadWestRubble",103,118.4,3,1.1,1.8,"Stone"],
    ["RoadWestBags",96,113.6,2.6,1,0.9,"Sandbag"],
    ["RoadWestBagsEnd",94.3,112.4,0.9,1,2.2,"Sandbag"],
    ["RoadWestCratesSouth",92.2,120.2,1.9,1.1,1.5,"Wood"],
    ["RoadWestCratesWest",91,118.4,1,1.1,2.6,"Wood"],
    ["RoadWestMound",98.6,106.8,5,1.2,1.7,"Earth"],
    ["RoadEastWall",119.9,115.2,0.8,0.95,3.6,"Stone"],
    ["RoadEastWallFoot",121,117.4,2.8,0.95,0.9,"Stone"],
    ["RoadEastBagsWest",123.9,103.2,1,1,2.6,"Sandbag"],
    ["RoadEastBagsFoot",124.8,105.1,2.2,1,0.9,"Sandbag"],
    ["RoadEastCratesSouth",130.6,115.8,2,1.1,1.5,"Wood"],
    ["RoadEastCratesWest",129.8,113.8,0.9,1.1,2.4,"Wood"],
    ["RoadEastBerm",135,111.5,4.4,1.2,1.6,"Earth"],
    ["RoadEastBermEnd",132.9,110,0.9,1.1,2.2,"Earth"],
    ["FieldWestBags",95,158,5,1,1,"Sandbag"],
    ["FieldEastBerm",123,162,5,0.9,2.2,"Earth"],
    ["LaneWestRubble",95,194,5,1.1,1.7,"Stone"],
    ["LaneEastBags",118,191,5,1,1,"Sandbag"],
    ["LaneWestBerm",96,220,6,1.1,2.4,"Earth"],
    ["LaneEastWall",118,224,5,1.2,0.8,"Stone"],
    ["LitterShield",94,241,3,1,1,"Sandbag"],
    ["TankWestBags",95,253,5,1,1,"Sandbag"],
    ["TankEastBerm",118,255,5,1,2.2,"Earth"],
    ["BendWestGun",80,277,5,1,1,"Sandbag"],
    ["BendWestBerm",97,280,4,1.2,8,"Earth"],
    ["BendEastBerm",105,280,4,1.2,8,"Earth"],
    ["AmbushNorthLip",90,262,7,1.05,0.8,"Sandbag"],
    ["AmbushGunLip",81,276.6,5,1,0.8,"Sandbag"],
    ["AmbushRearTraverse",92,285,1,1.2,3,"Earth"],
    ["AmbushFrontShield",97,292,1,1.05,3,"Sandbag"],
    ["EvacuationScreen",100,302,1.6,2.4,9,"Earth"],
  ],
};

// Ground pursuit blocking. Separate lanes and staggered depth are authored
// preview choices. Bounds groups advance in two mutually covering pairs.
export const FLOW_FRIEND_REINFORCEMENTS = [
  {id:"DragGround",center:[48,153],delay:0,
    route:[[48,153],[42,153],[36,155],[24,144],[20,120],[20,96]],
    previous:{beat:"03a",area:{shape:"rect",center:[20,96],size:[3,3]},route:[[20,96]],interval:2,lifetime:800,speed:2.2,behavior:"guard",note:"关卡调度布设"}},
  {id:"CrestWest",center:[51,156],delay:2,
    route:[[51,156],[48,150],[42,153],[36,155],[29,142],[28.5,129]],
    previous:{beat:"03g",area:{shape:"rect",center:[27.5,128],size:[3,3]},route:[[27.5,128],[28.5,129]],interval:2,lifetime:160,speed:2.2,behavior:"guard",note:"关卡调度布设"}},
  {id:"FieldGround",center:[56,154],delay:4,
    route:[[56,154],[65,153],[72,149],[79,147],[64,132],[54,126],[48,122]],
    previous:{beat:"03a",area:{shape:"rect",center:[48,122],size:[3,3]},route:[[48,122]],interval:2,lifetime:800,speed:2.2,behavior:"guard",note:"关卡调度布设"}},
];

export const FLOW_GROUND_FORMATIONS = [
  {id:"GroundWest", previousAreaSize:[3,3], areaSize:[10,22],
    holdUntil:{beat:"05a",fraction:0.8},
    weapon:"machineGun",
    fireCycle:{seconds:8,active:5,offset:0},
    offsets:[[-4.5,-0.5],[-3.3,-3.5],[-4.5,-5.5],[-3.3,-10]], delays:[0,0.8,0,0.8],
    routes:[
      [[104.4,116.7],[106.4,117.4],[92.0,156.4],[92.0,192.0],[92.2,217.6],[92.2,231.0],[92.0,250.8]],
      [[92.8,118.6],[95.3,119],[89.6,157.4],[89.6,193.0],[89.8,219.0],[90.6,234.0],[89.8,252.2]],
      [[100.4,105],[103,105.6],[91.8,151.8],[91.8,187.4],[92.1,213.2],[92.0,226.0],[96.8,243.5]],
      [[96.6,111.6],[98.8,112.8],[89.8,147.0],[89.8,181.0],[90.0,210.0],[90.5,227.0],[90.5,245.5]],
    ]},
  {id:"GroundEast", previousAreaSize:[3,3], areaSize:[10,22],
    holdUntil:{beat:"05a",fraction:0.8},
    weapon:"machineGun",
    fireCycle:{seconds:8,active:5,offset:1.5},
    routes:[
      [[131.4,114],[133.6,114.3],[119.6,160.0],[119.4,168.0],[114.8,189.6],[114.8,222.6],[116.5,252.6]],
      [[121.4,115.6],[123.8,115.9],[126.4,160.0],[126.4,168.0],[121.2,189.6],[121.2,222.6],[119.8,252.6]],
      [[135.2,109.6],[138.6,110],[119.6,155.5],[119.4,165.0],[114.8,185.2],[114.8,218.2],[116.2,248.5]],
      [[125.4,103],[128,103.6],[126.4,155.5],[126.4,165.0],[121.2,185.2],[121.2,218.2],[119.8,248.5]],
    ],
    offsets:[[4.5,-0.5],[3.3,-3.5],[4.5,-7],[3.3,-10]], delays:[0.5,1.3,0.5,1.3]},
  {id:"TankEscort", previousAreaSize:[2.4,3], areaSize:[10,22],
    engageOn:"06a",
    fireCycle:{seconds:7.5,active:4.5,offset:0.5},
    offsets:[[-1.6,-3.5],[2.1,-4.5],[-2.5,-8.0],[3.5,-9.5],[-0.8,-13.5]], delays:[0,0.5,1.0,1.5,2.0]},
  {id:"TankRearScreen", previousAreaSize:[3,3], areaSize:[10,18],
    weapon:"machineGun",
    engageOn:"06a",
    fireCycle:{seconds:8.5,active:5.0,offset:1.5},
    offsets:[[2.2,-3.5],[4.0,-6.5],[-2.2,-5.5],[0.8,-11.0]], delays:[0.4,1,1.6,2.2]},
  {id:"TankReinforce", previousAreaSize:[2.4,3], areaSize:[18,12],
    areaCenter:[112,217],
    behavior:"bounds",
    weapon:"machineGun",
    interval:0,
    coverWaitSeconds:2.5,
    fireCycle:{seconds:7.5,active:4.5,offset:0.5},
    offsets:[[2.5,2.0],[9.5,1.0],[-5.0,-1.0],[-1.0,0.5],[-7.0,-4.5]], delays:[0,0.6,1.2,1.8,2.4],
    routes:[
      [[113.5,236.0],[113.2,253.5]],
      [[122.2,236.0],[122.4,252.0]],
      [[105.5,236.0],[104.5,254.0],[104.2,267.0]],
      [[107.8,234.0],[106.5,252.0],[105.5,261.0]],
      [[104.2,230.0],[99.2,248.0],[97.8,266.0]],
    ]},
];

export const FLOW_TANK_TRACKS = {
  tank1: [
    ["05a",0,132,62],["05a",1,110,118],["05b",1,108.5,146],["05c",1,107,174],
    ["06a",0,107,174],["06a",1,101.6,238],["06b",1,101,256],
    ["06c",1,101,266],["06d",1,101,275],["06e",1,101,275],["06f",0.7,101,278],["06i",1,101,278],
  ],
  tank2: [
    ["05a",0,147,35],["05a",1,123,96],["05b",1,110,118],["05c",1,108.5,146],
    ["06a",0,108.5,146],["06a",1,103.5,211],["06b",1,101.8,233],["06c",1,101,244],
    ["06d",1,101,254],["06e",1,101,256],["06f",1,101,258],
    ["06g",1,101,262],["06h",1,101,262],["06i",1,101,262],
  ],
};

export const FLOW_AMBUSH_DEFENSE = [
  {id:"luo", keys:[["06a",0,84.6,222.5],["06a",1,88,262.8],["06h",1,88,262.8],["06i",1,94.6,308.5]]},
  {id:"he", keys:[["06a",0,87.1,225],["06a",1,92,264],["06h",1,92,264],["06i",1,97.1,311]]},
  {id:"liu", keys:[["06a",0,85.3,221],["06a",1,89,277],["06h",1,89,277],["06i",1,95.3,307]]},
  {id:"yao", heavy:true, keys:[["06a",0,84,226],["06a",1,89,276],["06b",1,81,275],["06h",1,81,275],["06i",1,94,312]]},
];

// p = player route. Optional pace keys mark pauses during combat withdrawal.
// Encounter regions are compiled from this route and edited in the workbench.
export const FLOW_BEATS = [
  { id: "01a", stage: "01", duration: 8, title: "炮响，洞内亮起", p: [[66.5,64.5]], pose: "look",
    passage: "黑场里一声炮响，土往下掉。亮起来，洞里挤着一个班，玩家能转头看。", task: "转头看", threat: "洞外炮击", gate: "开场", exit: "玩家能看清洞内", fx: "collapse" },
  { id: "01b", stage: "01", duration: 9, title: "传令兵报信", p: [[66.5,64.5]], pose: "look",
    passage: "传令兵撞进洞口：「东边漏了！鬼子顺沟摸进来了！连长喊往后沟撤！」", task: "听撤退命令", threat: "东边缺口 → 支沟", gate: "传令兵进洞口", exit: "撤退命令说完" },
  { id: "01c", stage: "01", duration: 10, title: "幺娃去机枪坑，班长先撤", p: [[66.5,64.5]], pose: "look",
    passage: "幺娃跟传令兵、机枪手和副手一起去机枪坑。班长带刘文财、何有田和其他士兵沿撤退路线往后沟走。", task: "留在洞内", threat: "东面清沟", gate: "收到命令", exit: "洞里只剩顺子和冬瓜", planning: "幺娃随传令兵、机枪手和副手成队去西边机枪坑。班长一队共十二人沿支沟向西，经支沟口转向南面的后沟，继续沿后续拖冬瓜的撤退路线离开。人数与速度为预演布设。" },
  { id: "01d", stage: "01", duration: 30, title: "把短褂塞进背包", p: [[66.5,64.5]], pose: "pack",
    passage: "任务字：收拾背包。玩家按键，顺子把一件老百姓的短褂塞进包里。", task: "收拾背包", threat: "炮声逼近", gate: "按键收拾背包", exit: "短褂已装进包" },
  { id: "01e", stage: "01", duration: 3, title: "洞口塌下", p: [[66.5,64.5],[63,64.5]], pose: "down",
    passage: "冬瓜：「趴下——！」洞口塌了。黑场。", task: "趴下", threat: "塌洞冲击", gate: "收拾背包完成", exit: "黑场接被俘", fx: "collapse" },
  { id: "02a", stage: "02", duration: 24, title: "被按在沟底", p: [[63,64.5],[61.8,65.6]], pose: "kneel",
    passage: "顺子被拖出洞，按着跪在沟底，冬瓜在左边一步远。玩家只能转头。日军先静默包抄，北沿机枪架好后仍不开火；随后才朝后沟打，枪声引来班长等人。", task: "只能转头", threat: "先静默包抄，后北沿机枪开火；西边捷克式还击", gate: "被拖出洞", exit: "枪声引来班长等人，翻译开始审问", fire: "crossfire", planning: "九个日军从前一拍起分三路从北面、东北面与东面绕到后方，尽量不开枪。机枪组登上北沿，其余经门外坡道和东侧沟沿下到支沟。02A 第18秒北沿机枪才开火，西边捷克式随后还击；班长一队听见枪声才分路折返，此时尚不知道沟里有自己人。" },
  { id: "02b", stage: "02", duration: 42, title: "冬瓜引开注意，挨刺刀", p: [[61.8,65.6]], pose: "kneel",
    passage: "冬瓜扯起嗓子骂，把鬼子的眼睛拉回自己身上。新兵丁第一刀扎偏。第二刀捅进去，冬瓜惨叫。已经循枪声接近的班长等人这才知道沟里有自己人，没有直接手榴弹开路。", task: "看冬瓜和南沿", threat: "近身刺刀；援兵辨出自己人，暂缓投弹", gate: "审问持续，冬瓜受刺惨叫", exit: "丁转向玩家", fire: "crossfire", planning: "班长一队已被北沿机枪声引来，并非被喊骂召回。02B 第20秒冬瓜受刺惨叫，援兵确认沟里有自己人，收住直接向沟内投弹的打算。两路各六人、每路两组三人继续疏开接近；到南沿观察清楚后，02F 只向北沿机枪阵位投弹，再跳沟救人。" },
  { id: "02c", stage: "02", duration: 10, title: "西边的枪停了", p: [[61.8,65.6]], pose: "kneel",
    passage: "西边的捷克式打着打着停了，没有再响。", task: "辨认西面的变化", threat: "西边机枪坑失守", gate: "冬瓜受伤", exit: "只剩后沟枪声", fire: "north" },
  { id: "02d", stage: "02", duration: 9, title: "刀尖对着脸", p: [[61.8,65.6]], pose: "kneel",
    passage: "丁拔出刀，转过来，刀尖对着玩家的脸。", task: "只能看", threat: "丁在面前两步", gate: "丁拔刀", exit: "后沟停火", fire: "north" },
  { id: "02e", stage: "02", duration: 3, title: "沟里突然静下", p: [[61.8,65.6]], pose: "kneel",
    passage: "后沟的枪声停了。甲抬手：「撃ち方やめ。」（停火。）沟里静了一两秒。", task: "等", threat: "火力停止，反击将至", gate: "班长到达南沿", exit: "两颗手榴弹飞出" },
  { id: "02f", stage: "02", duration: 7, title: "南沿投弹，跳沟反击", p: [[61.8,65.6]], pose: "down",
    passage: "两颗手榴弹从南沿翻过去，落在北沿机枪组身上。十几个人跳下来，班长的大刀把丁砍翻。", task: "趴在沟底", threat: "南 → 北投弹；南沿跳下反击", gate: "南沿齐射信号", exit: "枪被踢到玩家手边", fx: "rescue" },
  { id: "02g", stage: "02", duration: 15, title: "第一枪，救班长", p: [[61.8,65.6]], pose: "shoot",
    passage: "三步外丙跪着举枪瞄班长的背。任务字：打。玩家捡枪开这一枪；打慢了，班长肩上挨一下，回身把丙砍倒。", task: "捡枪，打丙", threat: "丙 → 班长后背", gate: "枪在手边", exit: "丙倒下；慢打走班长补刀分支", fire: "player", planning: "西侧三名日军与后排三名川军短促近战，交手后立即沿支沟向西脱离，再向北退到标记 1。三组交手略微错开，157–158 秒起撤离，本拍中段三人已离开人群。近战配对、时长和速度为预演布设。" },
  { id: "02h", stage: "02", duration: 15, title: "三个日军退向岔口", p: [[61.8,65.6]], pose: "look",
    passage: "鬼子九个倒下六个，三个从岔口退走；泥里躺着七个川军，两个挂彩。刘文财：「跑了三个！往岔口去了！」", task: "找冬瓜", threat: "三个逃兵 → 北沟 → 会合绕后日军", gate: "近战结束", exit: "班长找到冬瓜", planning: "三个逃兵已在上一拍近战后脱离，继续沿支沟向西、再向北退到标记 1。东北绕来的两名日军经北侧坡道下沟，双方在北沟会合。" },
  { id: "02i", stage: "02", duration: 15, title: "勒住伤口，找被子", p: [[61.8,65.6],[61,64.6]], pose: "kneel",
    passage: "班长：「莫追！那三个要喊人回来的。何有田，被子！」", task: "准备拖冬瓜", threat: "逃兵会合绕后日军 → 南压路口", gate: "冬瓜止血", exit: "单被兜住冬瓜", planning: "标记 1 会合的三名逃兵与两名绕后日军沿交通沟南下，在标记 2 路口转向东侧支沟，阻击准备拖冬瓜撤退的顺子一行。" },
  { id: "03a", stage: "03", duration: 18, title: "顺子和何有田揪被角", p: [[61,64.6],[46,65.6]], pose: "drag",
    passage: "顺子和何有田揪被角拖冬瓜，班长在前带路，刘文财殿后看岔口。按住键拖，松开键举枪。", task: "把冬瓜拖到坡顶", threat: "会合后的日军从西侧路口阻击", gate: "按住拖拽", exit: "单被进入箱垛后", zone: [46,65.6,3], winter: "drag", planning: "五名日军已由北沟抵达路口，朝东侧支沟阻击。班长与刘文财交替压住路口，掩护顺子和何有田拖冬瓜。" },
  { id: "03b", stage: "03", duration: 55, title: "第一回，箱垛后松手射击", p: [[46,65.6]], pose: "shoot",
    passage: "第一拨日军从北侧地面压到防炮洞门口，朝沟内射击。玩家把被子拽到箱垛后头，利用门口沙包与折墙逐段退开，松手回身打。", task: "借箱垛压住北侧门口来的五个", threat: "① 北侧地面 → 防炮洞门外 → 沟内", gate: "冬瓜进箱垛后", exit: "五个追兵解除，接着拖", zone: [46,65.6,3], wave: "Fork", winter: "ground", fire: "player", cover: true, planning: "① 北侧五人在叉位整批生成，集结后两人分别到沙包与箱垛后掩护，三人错峰从坡道下沟前压；东侧六人在断墙后集结，再分组绕北端下沟。门外沙包、折墙和箱垛继续掩护玩家。" },
  { id: "03c", stage: "03", duration: 22, title: "再拖，接近支沟拐角", p: [[46,65.6],[30,66.8]], pose: "drag",
    passage: "第一拨被压住后，东侧来敌绕到门外坡道，下沟沿支沟追赶。玩家把冬瓜拖到下一处拐角掩体。", task: "拖到拐角掩体", threat: "② 东侧地面 → 门外坡道 → 支沟追击", planning: "② 六名追兵分组交替掩护下沟，后组守箱垛、前组守沙包，与撤退队保持距离。两名普通川军交替殿后，其中一人在箱垛向拐角转移后中弹牺牲。", gate: "第一拨解除", exit: "手榴弹滚到单被旁", winter: "drag", zone: [30,66.8,3] },
  { id: "03d", stage: "03", duration: 12, title: "捡起脚边手榴弹，甩回去", p: [[30,66.8]], pose: "throw",
    passage: "何有田：「手榴弹！」玩家捡起甩回去。", task: "捡雷，甩回拐角", threat: "冬瓜脚边近爆", gate: "手榴弹到冬瓜脚边", exit: "甩回并爆炸", winter: "ground", fx: "returnGrenade", grenadeFrom: [48,65.6], planning: "坡道下沟的追兵向拐角投弹，捡起甩回后马上处理烟里的近敌。" },
  { id: "03e", stage: "03", duration: 25, title: "烟里两个敌人冲出来", p: [[30,66.8]], pose: "shoot",
    passage: "沿坡道下沟的两个鬼子从东侧烟里追近，玩家借拐角沙包回身打。", task: "借拐角掩体打追近的敌人", threat: "② 坡道下沟追兵 → 东侧支沟 → 玩家", gate: "手榴弹爆炸", exit: "近敌两人解除", winter: "ground", wave: "Corner", fire: "player", cover: true, planning: "② 六名追兵停在箱垛和沙包后射击，前组两人探头、后组继续掩护。另一名殿后川军在拐角掩护时中弹牺牲。压住这拨追兵后再拖向支沟口。" },
  { id: "03f", stage: "03", duration: 24, title: "到支沟口，幺娃扛枪赶来", p: [[30,66.8],[23.5,67.2]], pose: "drag",
    passage: "幺娃从交通沟北头连滚带爬下来，扛着捷克式：「班长！机枪手死在坑头了，后头跟起来了！」", task: "拖到支沟口，准备南拐", threat: "交通沟北头追兵", gate: "单被进入支沟口", exit: "班长接过捷克式", winter: "drag", zone: [23.5,67.2,3], planning: "幺娃带传令兵、机枪副手和一名川军伤兵从机枪坑沿北沟撤回；三人均负伤存活，错开距离跟随。追兵已在后方沿同一来路推进，在北沟沙包后停步射击，保持交战距离。" },
  { id: "03g", stage: "03", duration: 40, title: "班长压北面，玩家打北沿", p: [[23.5,67.2],[25,71]], pose: "shoot",
    passage: "班长把机枪架在拐角朝北压。追兵从北侧坡道分两波下沟，沿交通沟追到岔口，玩家与班长交替掩护，把冬瓜向南拖。", task: "挡住北坡下沟的第一波，准备南撤", threat: "③ 北侧坡道 → 北沟 → 岔口", gate: "单被准备往南拐", exit: "北坡第一波解除，第二波接上，班长继续压北", planning: "③ 从标记 1 的北侧坡道先来两波，每波三人。第二波在第一波之后接入，迫使玩家从岔口向南撤。后方集结处的八名援兵听到枪声后分三路赶来：三人沿西侧外沿去拖行段，两人去坡顶西侧，三人经东侧坡道去东侧地面；途中不开火，到位后阻击。", winter: "ground", wave: "Rim", fire: "north" },
  { id: "03h", stage: "03", duration: 44, title: "边打边撤，拖过坡顶", p: [[25,71],[26,76.6],[30,86],[30,86],[32.5,101],[32.5,101],[35,116],[35,131],[35,141.5]], pace: [0,0.1,0.22,0.32,0.5,0.6,0.68,0.86,1], pose: "drag",
    passage: "班长边打边退：「拖！往坡上拖！」翻过坡顶，别的班在沟沿上接应：「这边！快过来！」", task: "翻坡顶，进干沟", threat: "北侧追兵与两翼步兵追击，坡顶机枪接应", gate: "北沟两波追兵接上", exit: "单被过坡顶，前沿三回结束", planning: "玩家到达标记 2 的拐弯处 X30、Z86 后，西侧追兵从土墙后绕行下沟。北侧第二波与西坡追兵分守弯口沙包北侧，向我军阻击阵地还击；阻击步兵或集结处西侧机枪仍在有效射击时不再向南硬冲。玩家借接应火力拖冬瓜过坡顶；未安排接应机枪手牺牲。", winter: "drag", zone: [35,131,4] },
  { id: "04a", stage: "04", duration: 20, title: "下干沟，伤员等担架", p: [[35,141.5],[46,149]], pose: "walk",
    passage: "满地伤号，老乡两人抬一副担架往南送。老耿的驴车停在树下，妮儿站在车边。冬瓜躺在单被上等担架。", task: "跟到集结处", threat: "前沿在坡顶另一边", gate: "过坡顶", exit: "勤务兵叫住顺子" },
  { id: "04b", stage: "04", duration: 35, title: "先抬营长的皮箱", p: [[46,149],[52,151],[55,154]], pose: "carry",
    passage: "任务字：把箱子抬上车。玩家自己去抬。何有田小声：「日你妈，人还不如箱子。」", task: "把箱子抬上车", threat: "班长带队前出阻击，冬瓜仍在地上等", gate: "拾起皮箱", exit: "箱子在车上", prop: "case", planning: "班长带何有田、刘文财和幺娃分路进入北侧两处射击壕与东侧折线阻击壕。老耿与两名老乡在后方弹药堆和驴车之间搬运弹药。" },
  { id: "04c", stage: "04", duration: 20, title: "老乡抬担架，顺子前出阻击", p: [[55,154],[65,153],[72,149],[72,137],[68.6,128.6],[68.6,128.6]], pace: [0,0.1,0.2,0.32,0.4,1], pose: "shoot",
    passage: "两个老乡把冬瓜抬上担架，顺子交接后跑到班长身边参加阻击。", task: "前出射击壕，掩护伤员与弹药装运", threat: "北、东两面仍在交火，顺子与班长并肩阻击", gate: "担架到达，伤员交给老乡", exit: "冬瓜上担架，顺子在前沿阻击", planning: "顺子沿东侧通路跑入班长身旁的北侧射击壕，停稳后射击，不留在车后等候。罗班长、何有田守北侧两处射击壕；刘文财、幺娃守东侧折线壕。老耿等人继续搬弹药，另两名老乡抬冬瓜；此时尚无战车。" },
  { id: "04d", stage: "04", duration: 15, title: "三班跟车殿后", p: [[68.6,128.6],[72,137],[72,149],[65,153],[58.2,156.8]], pose: "walk",
    passage: "班长：「听到没得？跟到车屁股，压住后头！」任务字：跟着后送队，压住后头。", task: "跟着后送队，压住后头", threat: "前出小队交替撤回，北面与东侧攻势仍在", gate: "后送命令", exit: "队伍拐进凹路", planning: "车和担架先起行，北侧两人先撤、东侧两人多压一阵，再沿各自来路收回车后，接入凹路殿后队形。" },
  { id: "05a", stage: "05", duration: 55, title: "担架、驴车、小队依次行军", p: [[58.2,156.8],[70,158.6],[80,158.6],[83,161],[83,175],[80,199]], pose: "walk",
    passage: "担架在前，老耿的车居中，殿后的班跟在车屁股后头；冬瓜的担架先行拉开，老耿和运弹药的老乡继续往南弯后撤。", task: "跟着冬瓜的担架", threat: "班长小队交替阻击，牵制敌军，后送队先撤", gate: "进入凹路", exit: "远处飞机出现", planning: "老耿和两名搬运老乡装车后立即随车后撤，不再返回弹药堆。班长、何有田在干沟口接替火力，刘文财、幺娃再从东侧阵位撤回；两组轮流停步阻击，吸引敌军射击。东西两翼日军含轻机枪基准火力组，被压在集结处北面的散落掩体后，不在搬运队旁抢先南下；05A 后段后送队拉开距离后，两翼先导步兵才恢复掩体间两两交互跃进，同时两辆九四式与双翼护卫在北侧土垄后集结绕出，严格保持在先导步兵后方纵深跟进。" },
  { id: "05b", stage: "05", duration: 18, title: "三架飞机高高向南飞过", p: [[80,199],[84,214]], pose: "look",
    passage: "幺娃：「飞机！」三架日机高高往南飞过。班长：「莫抬头，它不下来。」", task: "继续跟队", threat: "高空北 → 南，无俯冲", gate: "飞机进入视野", exit: "飞机远去", fx: "planes" },
  { id: "05c", stage: "05", duration: 17, title: "身后传来车声", p: [[84,214],[86,225]], pose: "look",
    passage: "何有田：「……后头啥子声音？」班长：「车。坦克车。」", task: "回头辨认北面的车声", threat: "北面先导步兵沿两翼掩体跃进，双车与双翼护卫纵深跟进", gate: "步兵阻击完成、后送队先行", exit: "远处两辆九四式连同护卫继续向南追来", planning: "东西两翼先导步兵已交互跃进至田埂沙包与凹路东沿掩体；两辆九四式在步兵后方约 15–25 m 纵深内沿地面车道交错短停跟进，双翼护卫与后车轻机枪组随车警戒、接战前严守射击纪律；本拍车声靠近，回头能看见步坦编队，06A 连续接战。老耿和后送老乡先过南侧弯口，班长带队利用弯北射击壕殿后。" },
  { id: "06a", stage: "06", duration: 45, title: "两辆九四式追上来", p: [[86,225],[88,238],[85.5,258],[91.5,270]], pose: "retreat",
    passage: "每辆车后跟四五个步兵，战车沿东侧地面车道走走停停，等护卫跟上，两翼步兵借土埂和残墙跃进，机枪从坎上压向沟内。一个凹口一个凹口往后退！玩家边退边打跟车的，子弹打在车上只冒火星。", task: "拖住它，让车过弯", threat: "两翼掩体轻机枪跃进＋双车交错短停压制＋双翼近距护卫与投弹", gate: "前段步兵阻击完成，两辆战车在06A追入", exit: "班长小队退入弯北壕，老乡与妮儿继续南撤", wave: "TankEscort", fire: "tank", zone: [91.5,270,3], planning: "日军采用专业步坦协同：东西两翼各四名步兵（各配一挺十一年式轻机枪）在前方土埂与残墙间两两交互跃进，先行压住凹路两侧射界；头车与后车以 12 秒周期交错短停交互跃进（一车短停架枪掩护、另一车机动前出），绝不孤车甩开步兵；每辆车后翼呈左右梯次双翼展开近距反伏击护卫（后车另配轻机枪基准火力）。两名运弹药老乡带妮儿沿凹路撤到后方沟弯隐蔽等车；老耿短程护送后折回照看冬瓜和陷车、备好第二捆。罗班长与何有田守弯北射击壕；刘文财守后轮侧袭口；幺娃经西坡上浅壕。" },
  { id: "06b", stage: "06", duration: 35, title: "老乡倒下，拖担架进凹口", p: [[91.5,270],[92,280],[94,280]], pose: "drag",
    passage: "抬冬瓜的两个老乡被打倒。玩家顶着机枪把担架拖进凹口。", task: "把冬瓜拖进凹口", threat: "坦克机枪压住担架落地点", gate: "担架落地", exit: "担架进凹口", winter: "dragStretcher", fire: "tank", zone: [94,280,3] },
  { id: "06c", stage: "06", duration: 25, title: "老兵扑车，被步兵击倒", p: [[94,280]], pose: "shoot",
    passage: "老兵抱着一捆手榴弹扑出去，被跟车的步兵打倒。那捆没拉火，滚进靠坦克车那边的凹口。", task: "记住第一捆的位置", threat: "步兵封住靠车路线", gate: "老兵离开凹口", exit: "未拉火的捆滚进凹口", fire: "tank", prop: "bundle" },
  { id: "06d", stage: "06", duration: 45, title: "车陷了，皮箱垫进车辙", p: [[94,280],[94.5,284],[96,288]], pose: "carry",
    passage: "一个轮子陷进车辙。玩家把营长的皮箱掀下来塞进车辙底下，箱子底下的弹药箱露出来。", task: "用皮箱垫轮，找弹药", threat: "前面车陷，后面坦克逼近", gate: "玩家退到驴车旁", exit: "箱底露出第二捆，退路仍被堵", fire: "tank", prop: "case", zone: [96,288,4] },
  { id: "06e", stage: "06", duration: 55, title: "清掉头车后面的步兵", p: [[96,288],[94.5,276]], pose: "shoot",
    passage: "班长：「跟车的不打掉，挨不到它！」没清完之前，靠近车不出放的按键。", task: "清跟车的", threat: "机枪塔＋头车后护卫", gate: "头车护卫清零才开放放捆", exit: "头车后五名护卫解除", fire: "tank" },
  { id: "06f", stage: "06", duration: 50, title: "捡第一捆，追到后轮放下", p: [[94.5,276],[94,257],[94.5,269],[101,269],[101,273],[94.5,269],[94.5,276]], pose: "plant", planning: "按本次用户修订：第一捆不仅炸断履带，还引燃并炸毁头车；第二捆留给后车。",
    passage: "沿后侧坡道上到地面，趁头车停下，从车后把第一捆塞进后轮旁的车体下方，拉火后退回凹口。爆炸掀断履带并引燃车体，头车烧毁，停在弯北地面车道上。", task: "第一捆炸毁头车，退回凹口", threat: "先清护卫，借车体遮挡接近", gate: "护卫清零＋拾取第一捆＋到后轮", exit: "头车焚毁，建立存档", fx: "engineBlast", blastTarget: "tank1", zone: [101,273,3], prop: "bundle" },
  { id: "06g", stage: "06", duration: 80, title: "第二车护卫摸上来", p: [[94.5,276],[88.5,266],[94.5,276]], pose: "shoot", planning: "头车已经焚毁。第二车停在北侧掩护，五人护卫反击组（东翼轻机枪基准火力组＋三人借头车残骸与车体侧翼交替跃进摸进）分路前压；幺娃从西坎牵制后车炮塔，清完后车护卫再接近。",
    passage: "头车燃烧封住地面车道，后车停在北侧，护卫借残车掩护摸上来。班长等人压住护卫，幺娃从西坎向后车机枪塔射击，吸引它转向。迟迟清不掉，后车火力封死接近路，任务失败，从第一捆存档重来。", task: "清第二拨，借幺娃引开后车机枪塔", threat: "后车护卫轻机枪压制＋借残车两翼摸进；后车炮塔转向西坎", gate: "头车炸毁后放第二拨", exit: "援兵清零；超时回第一捆存档", wave: "TankReinforce", fire: "tank", checkpoint: "06f" },
  { id: "06h", stage: "06", duration: 55, title: "老耿递第二捆，炸毁后车", p: [[94.5,276],[96,288],[96,288],[91,280],[88.25,269],[90,269],[95,269],[99,269],[101,265],[99,269],[95,269],[90,269],[91,280],[94.5,280],[94.5,289]], pace: [0,0.12,0.23,0.30,0.4,0.44,0.49,0.54,0.62,0.67,0.71,0.75,0.87,0.91,1], pose: "plant", planning: "本次修订：第二捆不再补炸头车，而是由老耿在驴车旁递出，顺子沿沟北返炸毁后车；幺娃持续牵制后车炮塔，顺子拉火后原路退回沟内。归档原文保留供对照。",
    passage: "老耿已折回照看冬瓜和陷住的驴车，从车箱递来第二捆。顺子沿凹路北返，经后侧坡道接近停在北面的后车，避开头车残骸；趁后车炮塔朝西，把第二捆塞进后车车头下方，拉火后沿原坡道退回沟里。后车爆炸起火，两辆战车都被炸毁。", task: "第二捆炸毁后车，原路退回沟里", threat: "后车炮塔被幺娃牵制，护卫已清", gate: "第二拨清零＋第二捆到手＋后车车头交互", exit: "后车焚毁，两车火力全部停止", fx: "engineBlast", blastTarget: "tank2", prop: "bundle", zone: [101,265,3] },
  { id: "06i", stage: "06", duration: 30, title: "双车焚毁，推车撤过南弯", p: [[94.5,289],[97.5,300],[96,311]], pose: "run", planning: "用户本次修订替代归档原文的倒车结局：两辆战车都已炸毁，残骸原地保留；众人推驴车脱困后南撤，与先撤老乡和妮儿会合。",
    passage: "两辆战车的残骸留在弯北地面车道，不能再追击；剩余步兵被阻击火力压住。众人借这个空隙，用皮箱垫轮，把驴车推出车辙，带冬瓜沿沟撤过南弯，与先撤到后方沟弯的老乡和妮儿会合。", task: "推车脱困，跟班长撤过南弯", threat: "残余步兵仍在北侧，不能逗留", gate: "两辆战车焚毁＋驴车脱困", exit: "后送车与小队向后方会合", fx: "burn" },
  { id: "07a", stage: "07", duration: 20, title: "报数，喘一口气", p: [[96,311],[95,322]], pose: "look",
    passage: "弯南边，班长：「报数。」幺娃：「一。」何有田：「二。」刘文财：「三。」顺子：「四。」", task: "跟车，报数", threat: "追车被弯口残车挡住", gate: "全班过弯", exit: "确认四个人都在" },
  { id: "07b", stage: "07", duration: 22, title: "一根绳子上的", p: [[95,322],[96,332]], pose: "walk",
    passage: "何有田：「保长拿绳子捆来的，还给他们卖命。」冬瓜（车上）：「……一根绳子上的。」", task: "跟着车继续向南", threat: "暂时脱离近敌", gate: "报数结束", exit: "注意转向东北" },
  { id: "07c", stage: "07", duration: 18, title: "东北大队扬土，庄东冒烟", p: [[96,332],[98.5,344]], pose: "look",
    passage: "东北远处一长溜大队带着骡驮山炮扬土，耿家庄东头冒烟。班长：「耿家庄。走。」", task: "看东北，再向耿家庄走", threat: "东北大队 → 庄东；为村战建立方向", gate: "大队进入远景", exit: "接村口枪眼", fx: "column" },
  { id: "08a", stage: "08", duration: 35, title: "村口，主街正对枪眼", p: [[98.5,344],[101.5,362],[100,378],[100,383],[100,383]], pace: [0,0.23,0.45,0.55,1], pose: "crouch",
    passage: "主街笔直，正对着枪眼，上了街就没处躲；活下来的都是走岔路出来的。枪眼里又打出一梭。", task: "进路沟，伏在坡道", threat: "南面枪眼沿主街向北打", gate: "队伍进入村口路沟", exit: "后送队藏到东半截", fire: "loophole", zone: [100,380,4] },
  { id: "08b", stage: "08", duration: 35, title: "藏车拴驴，担架分散隐蔽", p: [[100,383]], pose: "crouch",
    passage: "老耿牵驴沿沟往东挪，拴在背坡木桩上，垫住车轮。担架分三处靠沟南沿放下，抬担架的老乡留在旁边。班长：“车藏好，伤号都靠里！枪眼没哑，哪个都表出来！”", task: "隐蔽伤员，等班长分路", threat: "主街枪眼未除，后送队留在遮挡后", gate: "驴拴好、车轮垫住、担架分散隐蔽", exit: "战斗人员前出探路", planning: "按本次用户定稿安顿后送队。驴车停在路沟东半截，驴仍套车；十二副担架分三组沿沟底藏在南沿后，老乡守在担架旁。枪眼端掉后解绳、抬架起行。" },
  { id: "08c", stage: "08", duration: 45, title: "隐蔽观察枪眼，不暴露友军", p: [[100,383]], pose: "crouch",
    passage: "玩家与幺娃伏在路沟内观察枪眼，不探头、不还击。日军仍在封锁主街，尚未发现沟内的我方人员。", task: "低姿观察，保持静默", threat: "枪眼封街，探头会暴露", gate: "保持隐蔽", exit: "确认绕后路线" },
  { id: "08d", stage: "08", duration: 20, title: "日军向东联络，友军继续隐蔽", p: [[100,383]], pose: "crouch",
    passage: "墙角一个鬼子穿过路口往东联络，尚未发现沟内友军。幺娃压低声音：“跑了一个！往东边跑了！”", task: "隐蔽观察联络兵去向", threat: "路口 → 东街 → 东北来路", gate: "观察敌军联络", exit: "班长准备分路", fx: "runner" },
  { id: "08e", stage: "08", duration: 30, title: "三路分工", p: [[100,383],[96,382]], pose: "crouch",
    passage: "班长：“有田跟老子。文财跟顺儿，摸到后头再打！”刘文财：“表放枪。把这条路惊了，后头的伤号咋个走？”", task: "隐蔽绕到枪眼后方，途中禁止开火", threat: "西巷暴露会引来搜查，封死后送通道", gate: "禁枪命令已交代，伤员原地隐蔽", exit: "幺娃与一名士兵守入口，两路前出", planning: "从08F起到09J就位前禁止开枪、投弹。举枪观察允许；短暂露头先引起怀疑，持续被发现并示警才失败。失败返回进庙前检查点，原因是绕后暴露、后送通道被封锁。" },
  { id: "08f", stage: "08", duration: 25, title: "班长穿东院，玩家爬向西巷", p: [[96,382],[80,382]], pose: "crouch",
    passage: "班长带何有田和后送队一个兵，猫腰钻进那道后门。幺娃和后送队另一个兵伏在坡道内侧，不开枪，等班长先打。", task: "沿沟南沿向西爬", threat: "保持隐蔽，不能提前惊动搜屋日军", gate: "两路开始绕后", exit: "进入巷子口", zone: [80,382,3] },
  { id: "08g", stage: "08", duration: 20, title: "进巷十来米，妮儿溜出路沟", p: [[80,382],[80,394]], pose: "crouch",
    passage: "两个人钻进巷子十来米，交还操作。身后听见老耿压着嗓子喊：“妮儿！妮儿——！”", task: "沿西巷往南摸", threat: "友军仍隐蔽，尚未交火", gate: "转入巷子", exit: "妮儿追到玩家身后" },
  { id: "09a", stage: "09", duration: 60, title: "西巷搜掠痕迹，借关帝庙绕行", p: [[80,394],[80,400],[71,400],[71,407],[71,416],[71,423.8],[76.7,423.8],[76.7,424.8],[80,424.8],[80,426]], pose: "crouch",
    passage: "门闩断在地上，包袱被翻开；后窗敞着，三人蹲着挪过。右手夹道被塌墙堵死，妮儿指着左侧庙墙缺口，文财先钻进去探。殿里神龛积灰，香案前摆着几张旧课桌，练字纸散在脚下。", task: "右侧塌墙不通，保持隐蔽从左侧缺口借庙绕行", threat: "日军已经搜过这条巷子，前面可能还有人", gate: "沿真实缺口进入庙殿", exit: "文财在殿边发现搜巷兵", planning: "进庙前右侧夹道在X67、Z423被实体塌墙封死，必须从左侧缺口借庙绕行；不是空气墙或临时封路。西墙北侧缺口通殿西侧小门，南侧缺口接回街坊家方向，出庙后的南巷保持畅通。妮儿只通过手势和熟路引导；进庙前存检查点。" },
  { id: "09b", stage: "09", duration: 64, title: "文财拉低顺子，庙里避过搜查", p: [[80,426],[80,426],[80,426.7],[80,426.7],[80,424.8],[84.5,424.8],[84.5,429.3],[76.5,429.3],[76.5,431],[71,431],[63,431],[63,442]], pace: [0,0.0046875,0.028125,0.5,0.522,0.57,0.65,0.76,0.79,0.85,0.92,1], pose: "crouch",
    passage: "文财：“有人。蹲下。”他伸手拽住顺子的肩膀，把人拉到门侧墙后，落稳便还操作。两个搜巷兵走进庙院，一个停在殿门外张望，另一个盯院口。脚步远去后，文财先探出去，三人经南侧缺口接回窄巷。", task: "蹲在侧墙后，等搜查兵走远再出庙", threat: "门外日军近距离搜查，提前开火会暴露后送路线", gate: "只接管拉低身体1.8秒，随后自行隐蔽通过", exit: "接回街坊家西北豁口", zone: [80,426.7,1.2], planning: "一次短接管，眼位随身体降低，玩家能看见文财的手。枪仍可瞄准；短露头有回避余地，确认示警或开枪、投弹才失败。两名日军预先在院墙后生成，经正常移动露面，不原地刷出。" },
  { id: "09c", stage: "09", duration: 30, title: "窄夹道，隔墙听见搜人", p: [[63,442],[63,448],[63,450],[65.2,450],[66.6,451.6]], pose: "crouch",
    passage: "妮儿拽着他们从豁口钻进黑屋。", task: "从西北豁口进西配房", threat: "左墙后院里搜人，右窗里有日军", gate: "到西配房塌角", exit: "进入窗下观察点", zone: [71,443,2], fire: "loophole" },
  { id: "09d", stage: "09", duration: 40, title: "窗下看院子，捂住妮儿", p: [[66.6,451.6]], pose: "hold",
    passage: "顺子捂住她的嘴：屏幕上只亮一个按住的键，第一人称看得见自己的手指，上面露着她瞪大的眼睛。两只手都在她脸上，枪在背上。", task: "按住，别让妮儿哭出声", threat: "院内四人，隔壁两人", gate: "妮儿开始呜咽", exit: "东街哨声催援，搜人组离院", fire: "loophole" },
  { id: "09e", stage: "09", duration: 30, title: "日军催援，五名搜屋兵离院", p: [[66.6,451.6]], pose: "hold",
    passage: "东街传来催援的哨声，三个拎起枪出院门，隔壁那两个也跟着往路口跑。文财按住枪口，等他们走远。", task: "等五人走远，继续保持隐蔽", threat: "后院五人 → 丁字路口", gate: "日军哨声催援，搜人组离院", exit: "门房只剩一人", wave: "YardTransfer", planning: "催援来自日军一侧；班长与幺娃仍等09J背后就位信号，不提前暴露绕后路线。" },
  { id: "09f", stage: "09", duration: 22, title: "门房背后一刀，文财补刺", p: [[66.6,451.6],[66.6,455],[68.8,455],[68.8,461.8],[73,462],[73,465.5]], pose: "melee",
    passage: "顺子从背后抡大刀，砍偏了，砍在肩膀上；那个鬼子嚎了一声扭过身来，两个人扭在一起，刘文财扑上来补了一刺刀。", task: "近身解决门房，保持安静", threat: "开枪会招回刚走的五个", gate: "五人离院后接近门房", exit: "门房解除，继续隐蔽接近枪眼", zone: [83,451,2] },
  { id: "09g", stage: "09", duration: 20, title: "牵走妮儿，穿本家院", p: [[73,465.5],[73,462],[68.8,462],[68.8,466.3],[66.5,466.3],[66.5,468.75],[75,468.75],[75,491],[78.5,491]], pose: "walk",
    passage: "三个人穿过院子，妮儿在窖口僵住，顺子拽着她走。出院门往西，顺着夹道到本家院子。", task: "把妮儿带到便门边", threat: "东头哨声和脚步越来越近", gate: "门房解除", exit: "到达闩死的便门", fire: "loophole" },
  { id: "09h", stage: "09", duration: 23, title: "妮儿钻狗洞，拔开门闩", p: [[78.5,491],[78.5,488.4],[84.5,484.6],[90.7,484.6]], pose: "crouch",
    passage: "妮儿推开他，自己钻过去，从那边拔开了门闩。她知道他们钻不过，是特意去开门的。", task: "贴墙等妮儿开门", threat: "胡同脚步在墙外停了一下", gate: "妮儿从狗洞到门另一侧", exit: "便门打开", zone: [91,486,2], fire: "loophole" },
  { id: "09i", stage: "09", duration: 25, title: "灶屋守卫，背刺或倒地解围", p: [[90.7,484.6],[93.3,484.6],[97.2,479.3]], pose: "melee",
    passage: "玩家自己摸过去，从背后一刀；走快了、靠太近被他听见，他就扭身扑上来，把顺子撞翻在灶台边。", task: "解决灶屋看后院的守卫", threat: "灶屋守卫可转身扑倒玩家", gate: "便门打开后经过灶屋", exit: "守卫解除，妮儿咬手只发生一次", zone: [97,480,2] },
  { id: "09j", stage: "09", duration: 35, title: "从背后端枪眼，班长同步冲墙角", p: [[97.2,479.3],[99,477],[100,476]], pose: "shoot",
    passage: "从背后开打。机枪还在往街上扫的那两三秒里，先撂倒机枪手和压子弹的那个。同一时刻，班长从东院开火，幺娃随即从坡道接战，墙外路口“轰、轰”两声。", task: "清北屋，端掉枪眼", threat: "北屋三间；班长从东院冲墙角", gate: "绕后就位，班长开火为两路同步信号", exit: "机枪哑；残敌从东窗退到东街", wave: "GengHouse", fx: "yardBlast", fire: "player", zone: [100,476,3] },
  { id: "10a", stage: "10", duration: 30, title: "两路会合，把机枪拖到石碾", p: [[100,476],[101,480.5],[106.6,483.5],[109,483.5],[109,465.65],[111.2,464.2],[112.5,464.2]], pose: "carry",
    passage: "枪眼端掉，班长招手：“调过来！朝东打！担架过胡同！”老耿解开拴绳，踢开垫轮木，老乡抬起担架分批起行。顺子把缴来的十一年式轻机枪拖到石碾后朝东压住东街。", task: "石碾后朝东守路口", threat: "东街新援兵；伤员从背后向南过", gate: "枪眼机枪停止", exit: "建立路口射位，后送队开始过", zone: [112.5,464.2,3] },
  { id: "10b", stage: "10", duration: 50, title: "点射，换弹时门洞跃进", p: [[112.5,464.2]], pose: "shoot",
    passage: "我们一换弹，他们就两三个一组从街北边的院门里冲出来，跑几步扑进下一个门洞。每换一次弹，他们就近一个门洞。", task: "守东街，掩护第一批四副担架过口", threat: "东口 → 门洞链；南墙枪眼打冷枪", gate: "守路口开始；换弹开放跃进窗口", exit: "第一批担架过胡同", wave: "EastStreet", fire: "street", zone:[112.5,464.2,2], planning:"两对日军从折街后的院门起行，绕街角交替跃进，停稳后短点射。幺娃补换弹空当，班长与何有田警戒北院，刘文财守担架出口。前三批各四副担架，后队在街墙遮挡后等待。" },
  { id: "10c", stage: "10", duration: 45, title: "土地庙机枪压，掷弹筒校射", p: [[112.5,464.2],[111.3,464.2],[111.3,466.23],[111.15,466.23],[111.15,466.23]], pace:[0,0.07,0.23,0.27,1], pose: "shoot",
    passage: "土地庙后头一挺轻机枪压过来；场院麦秸垛后头“嘭”一声，掷弹筒开始找石碾：第一发落在十几米外，下一发近一点。", task: "沿石碾西侧向南换位，接第二批四副担架", threat: "东南庙后机枪；东北场院曲射", gate: "东街推进受阻", exit: "换到石碾另一侧", fx: "mortar", fire: "street", zone:[111.15,466.23,2], planning:"机枪组从折街后实际跑到土地庙，停步架枪后间歇压制。掷弹筒在麦秸垛北侧校射石碾原射位，顺子沿石碾西侧向南换位；第二批担架通过后，北院的砸门声接近。" },
  { id: "10d", stage: "10", duration: 45, title: "北院砸门，从西北抄后路", p: [[111.15,466.23],[111.15,466.23],[105.5,464],[105.5,464]], pace:[0,0.27,0.5,1], pose: "shoot",
    passage: "一伙人一个院子一个院子往西挪，要从石碾背后西北角钻出来抄后路。班长：“左手院子！”", task: "移到路口西侧，协助班长封北院门", threat: "北院 → 西北背后；东街同时前拱", gate: "砸门声接近、院门破开", exit: "北侧包抄解除，东街又近一段", wave: "NorthYard", fire: "street", zone: [105.5,464,2], planning:"先给十二秒砸门预警，北院三人才从场院出发，经场院西门、第一个院西门、路口北门依次绕来。班长与何有田守门，幺娃维持东街火力，顺子只转向当前北院缺口。最后四副担架继续在墙后等待。" },
  { id: "10e", stage: "10", duration: 25, title: "守住出口，最后担架过", p: [[105.5,464],[108.5,466],[108.5,466]], pace:[0,0.25,1], pose: "shoot",
    passage: "一组人趁着烟冲路口空地，被扫倒在街当中。后送队一副一副从路口拐进窄胡同。", task: "守南巷出口，接最后四副担架", threat: "东街冲锋；过胡同口的人暴露", gate: "最后一批担架转进胡同", exit: "十二副全部通过", fire: "street", zone:[108.5,466,2], planning:"顺子回到南巷出口接最后一批，班长与何有田继续封北门。东街步兵已经占到近处墙角，双方仍有射击与换弹间隙；最后一副担架完全进入南巷后，哨声才响，日军沿接近路线撤回。" },
  { id: "10f", stage: "10", duration: 20, title: "哨子响，敌人退，街上静下", p: [[108.5,466]], pose: "look",
    passage: "东街那头一声哨子，门洞里的枪口火一下子全停了，鬼子往东缩回去。街上静了两三秒。", task: "辨认步兵撤下的信号", threat: "东北大队炮即将接替步兵", gate: "步兵攻不下＋后送队过完", exit: "炮击开始，停止补充步兵" },
  { id: "10g", stage: "10", duration: 15, title: "近炮掀翻，班长拉起顺子", p: [[108.5,466],[109,468]], pose: "down",
    passage: "第一发炮落在石碾边上。顺子被掀出去好几步，枪从手里飞出去。枪就在脚边，按 F 弯腰捡回来。", task: "被拉起，捡回脚边的枪", threat: "第一发落石碾，近爆耳鸣与白闪", gate: "步兵火力停止后炮落", exit: "捡枪，向南巷撤", fx: "artillery" },
  { id: "10h", stage: "10", duration: 25, title: "卸枪栓，门框设雷，跑进胡同", p: [[109,468],[109,495],[113.25,495],[113.25,500]], pose: "run",
    passage: "幺娃把机枪的枪栓卸下来，路过院门扔进门里的水缸。何有田胳膊上缠着布，蹲在院门框边往门缝里卡手榴弹。", task: "跟班长跑，别堵胡同口", threat: "炮一排一排往南追", gate: "小队撤入南巷", exit: "前面院墙塌下堵路", fx: "artillery" },
  // Approach the pile, step up, clear the east wall, then leave through the side gate at z=518.
  { id: "10i", stage: "10", duration: 20, title: "院墙堵路，踩柴垛翻墙",
    p: [[113.25,500],[112.94,500],[112.94,501.3],[112.94,501.3],[113.85,501.3],[113.85,501.3],[115.22,501.3],[115.5,502.5],[118.5,513],[115.3,518],[113.25,518],[113.25,519]],
    pace: [0,0.05,0.16,0.185,0.225,0.25,0.31,0.37,0.68,0.85,0.945,1],
    elevations: [0,0,0,1.24,1.24,2.26,2.26,0,0,0,0,0], pose: "vault",
    passage: "班长：“过不去！翻墙！”他先踩着墙根那垛柴爬上墙头，翻进旁边的院子，回身把人一个个拽上去。", task: "翻进旁院，从院门接回胡同", threat: "前方塌墙封路；后方落炮", gate: "炮击造成塌墙", exit: "全队穿过旁院接回路线", fx: "artillery", zone: [106,506,3] },
  { id: "10j", stage: "10", duration: 25, title: "架起排长，过槐树到村南口", p: [[113.25,519],[113.25,521],[117,521],[117,545],[117,552]], pose: "run",
    passage: "幺娃和刘文财一边一个架起他跑。班长：“往那棵大槐树跑！过了槐树就是村口！”", task: "等人跟上，撤到南口后送队", threat: "落炮向后方滚进", gate: "过翻墙院出口", exit: "全队到南口，接 11", fx: "artillery", zone: [117,545,4] },
  ...BEISHAHE_BEATS,
];

// Speech references quoted lines in the current beat passage, in reading order.
// Offsets/durations are preview blocking in seconds, independent of voice audio.
// Sound effects in quotes deliberately have no speech cue.
export const FLOW_DIALOGUE = {
  ...BEISHAHE_DIALOGUE,
  "01b": [{actor:"openingGun0", quote:0, at:1, duration:8}],
  "01e": [{actor:"winter", quote:0, at:0, duration:2.5}],
  "02e": [{actor:"opening2", name:"日军甲", quote:0, at:0, duration:2, text:"停火。"}],
  "02h": [{actor:"liu", quote:0, at:1, duration:5}],
  "02i": [{actor:"luo", quote:0, at:1, duration:9}],
  "03d": [{actor:"he", quote:0, at:0, duration:3}],
  "03f": [{actor:"yao", quote:0, at:12, duration:9}],
  "03h": [{actor:"luo", quote:0, at:1, duration:5}, {group:"FieldGround", quote:1, at:34, duration:5}],
  "04b": [{actor:"he", quote:0, at:3, duration:6}],
  "04d": [{actor:"luo", quote:0, at:0, duration:7}],
  "05b": [{actor:"yao", quote:0, at:1, duration:3}, {actor:"luo", quote:1, at:4, duration:5}],
  "05c": [{actor:"he", quote:0, at:1, duration:5}, {actor:"luo", quote:1, at:6, duration:4}],
  "06e": [{actor:"luo", quote:0, at:1, duration:6}],
  "07a": [{actor:"luo", quote:0, at:1, duration:3}, {actor:"yao", quote:1, at:4, duration:2},
    {actor:"he", quote:2, at:6, duration:2}, {actor:"liu", quote:3, at:8, duration:2}, {actor:"player", quote:4, at:10, duration:2}],
  "07b": [{actor:"he", quote:0, at:1, duration:8}, {actor:"winter", quote:1, at:10, duration:5}],
  "07c": [{actor:"luo", quote:0, at:3, duration:4}],
  "08d": [{actor:"yao", quote:0, at:2, duration:5}],
  "08b": [{actor:"luo", text:"车藏好，伤号都靠里！枪眼没哑，哪个都表出来！", at:4, duration:7}],
  "08e": [{actor:"luo", text:"有田跟老子。文财跟顺儿，摸到后头再打！", at:1, duration:6}, {actor:"liu", text:"表放枪。把这条路惊了，后头的伤号咋个走？", at:9, duration:6}],
  "09b": [{actor:"liu", text:"有人。蹲下。", at:0, duration:1.8}],
  "08g": [{actor:"geng", quote:0, at:3, duration:5}],
  "10a": [{actor:"luo", quote:0, at:1, duration:6}],
  "10d": [{actor:"luo", quote:0, at:4, duration:3}],
  "10i": [{actor:"luo", quote:0, at:1, duration:4}],
  "10j": [{actor:"luo", quote:0, at:1, duration:7}],
};

export const FLOW_WAVES = [
  ...BEISHAHE_WAVES,
  { id: "ForkRelief", beat: "02g", until: "03b", count: 2, source: [67,30], route: [[67,30],[40,28],[17,36],[14.5,40],[12,44],[21.9,67.1],[23,67.1]], label: "绕后日军路口阻击", interval: 0, lastFall: 116, speed: 2.2, target: "player", trigger: {mode:"time",delay:2}, repeat: "东北绕行两人经北坡下沟，与三名逃兵在标记 1 会合，再南下标记 2 路口阻击" },
  { id: "Fork", beat: "03b", count: 5, source: [75,44], areaSize: [24,24], deployDelay: 10, spawnOffsets: [[2.3,-9.9],[10.3,-3.5],[1.2,-5],[5.5,3.8],[2.4,1.8]],
    memberPlans: [
      {delay:0, route:[[72,51.5],[69,51],[62,57.5],[59,62.8]]},
      {delay:2, route:[[74,51.5],[70,53.5],[62,59.5],[60.8,64.7],[60,65.0],[58.8,64.9]]},
      {delay:0, route:[[74,49.5],[69,51.5],[62,53],[55,60],[53.5,62.8]]},
      {delay:9, route:[[75,51.5],[70,51.5],[63,60.5],[61,66],[57.7,65.6],[55.5,64.9]]},
      {delay:13, route:[[74.8,52.5],[69.8,52.5],[62,55.5],[61,60.5],[60.8,65.8],[60,66],[51.5,66]]},
    ], route: [[75,44],[72,51.5],[69,51],[62,57.5],[54,60.5]], label: "① 北侧地面门口压制", interval: 0, lastFall: 54, target: "player", repeat: "第一回五人分散集结，两人到洞口沙包与箱垛后掩护，三人错峰经坡道下沟前压，各守独立位置" },
  { id: "Corner", beat: "03c", until: "03e", count: 6, source: [77,58], areaSize: [8,8],
    spawnOffsets: [[0,-2.5],[2,-1],[0,1],[2,2.5],[4,-2.5],[4,1.5]],
    memberPlans: [
      {delay:0,route:[[75,51.5],[69,51.5],[62,55.5],[61,60.5],[63.5,62.5],[65.5,64.4]]},
      {delay:0.6,route:[[76,52.5],[69,52.5],[62.8,55.5],[61.8,60.5],[67,63.5],[67,66.7]]},
      {delay:0.4,route:[[75.5,51.5],[69.5,51.5],[62.4,55.5],[61.4,60.5],[60.8,65.9],[57,66.9],[54,65.4]]},
      {delay:1,route:[[76.5,52.5],[70,52.5],[63.2,55.5],[62.2,60.5],[61.6,66.2],[57.8,66.8],[55,67]]},
      {delay:1.2,route:[[77.5,51.5],[70.5,51.5],[63.6,55.5],[62.6,60.5],[62.4,65.8],[59,66.9],[56.2,66.2]]},
      {delay:1.8,route:[[78,52.5],[71,52.5],[64,55.5],[63,60.5],[63.2,65.8],[60,66.9],[57.4,67.2]]},
    ], behavior:"bounds", standoffMetres:12, spacingMetres:0.8, coverWaitSeconds:0.8,
    route: [[77,58],[75,52],[69,52],[62,55.5],[61,60.5],[60,65.6],[54,65.4]],
    label: "② 门外坡道下沟追兵", interval: 0, lastFall: 58, speed: 3, target: "player", repeat: "第二回六人在东侧断墙后集结，分组交替掩护下沟；后组守箱垛，前组停在支沟沙包东侧射击，与撤退队保持距离" },
  { id: "Rim", beat: "03d", until: "03g", count: 3, source: [-8,-20],
    route: [[-8,-20],[2,-20],[2,-10],[0,-7],[0,11],[13,21],[17,36],[14.5,40],[12,44],[13.8,50.7],[13.8,53.4]],
    label: "③ 追着幺娃来的日军", interval: 2, lifetime: 82, speed: 1.7, standoffMetres: 16, target: "player",
    trigger: {mode:"time",delay:10}, repeat: "从机枪坑北侧土墙后跟进，经北坡进入交通沟，停在北沟正面沙包北侧射击，不越过掩体追向班长" },
  { id: "TrafficFlank", beat: "03h", until: "04a", count: 6, maxAlive: 3, reinforceAfterClear: true,
    source: [-2,70], areaSize: [3,5], route: [[-2,70],[8,68],[14,68],[14,77],[20,76.8],[26,76.6],[22,80],[22,83.8],[29,83.8],[29,89],[30,91],[32.5,101],[34,117]],
    suppressedBy: ["DragGround","CrestWest","CampWestGun"], suppressionStop: [22,83.8],
    label: "西坡土墙后追兵", interval: 2, lifetime: 30, speed: 3.4, standoffMetres: 16, grenadeInterval: 10, target: "player",
    trigger: {area:{shape:"rect",center:[30,86],size:[4,4]}}, repeat: "玩家到标记 2 后，西坡两批各三人从土墙后绕行进入；我军阻击线仍在射击时停在弯口沙包北侧还击，只有阻击失效才绕出推进" },
  { id: "TankEscort", beat: "06a", until: "06e", count: 5, source: [105,187], route: [[105,187],[103,212],[101,240],[101,269]], label: "头车护卫", interval: 2.2, lastFall: 195, target: "player", repeat: "步兵阻击后才随两辆战车追入，头车护卫五人" },
  { id: "TankReinforce", beat: "06g", count: 5, source: [103,222], route: [[103,222],[101,238],[101,253],[101,269]], label: "第二车护卫", interval: 3, lastFall: 70, target: "player", repeat: "第一捆后增援一拨五人，清完才放第二捆" },
  { id: "YardTransfer", beat: "09e", count: 5, source: [74,459], route: [[74,459],[68.8,459],[66.5,467.5],[66.5,468.75],[99,468.75],[106.5,465],[106.5,460]], label: "搜院组转援", interval: 1.2, lastFall: 80, target: "front", transfer: true, repeat: "原有六人中五人转去路口，门房留一人" },
  { id: "GengHouse", beat: "09j", count: 6, source: [100,473], route: [[100,473],[103,472]], label: "北屋守军", interval: 0, lastFall: 28, target: "player", repeat: "预置北屋六人，倒四人，两人从东窗逃" },
  { id: "EastStreet", beat: "10b", until: "10e", count: 15, source: [232,465], route: [[232,465],[207,458],[178,461],[166,461],[147,461],[133,465]], label: "东街援兵", interval: 10, lastFall: 172, target: "player", cyclic: true, repeat: "提议每 30 秒补三人；同时前排最多五人；12 副担架过完、哨响即停" },
  { id: "NorthYard", beat: "10d", count: 3, source: [166,449], route: [[166,449],[146,449],[128,450],[123,457]], label: "北院包抄", interval: 2.5, lastFall: 39, target: "player", repeat: "一次三人，先有砸门声，再从西北破门" },
];

// Corner defaults before the user-requested six-person covering pursuit.
export const FLOW_PREVIOUS_CORNER = {
  count:2,maxAlive:2,area:{shape:"rect",center:[77,58],size:[6,6]},
  spawnOffsets:[[0,-1.5],[2,1.5]],
  route:[[77,58],[75,52],[69,52],[62,55.5],[61,60.5],[60,65.6],[50,65.6],[38,66],[33,66.8]],
  behavior:"advance",speed:2.1,
  note:"第二回两人在东侧断墙后整批生成，经门外坡道下沟，投弹后追到拐角",
};

// West-ramp defaults before the user-requested second batch.
export const FLOW_PREVIOUS_FLANK = {
  group: {count:3,maxAlive:3,endBeat:"03h",route:[[5,74],[14,77],[20,76.8],[26,76.6],[28,81]],note:"玩家进入标记 2 拐弯处才从西坡下沟一波三人"},
  trigger: {endBeat:"03h"},
};

// Baseline for a field-wise upgrade of existing v2 browser drafts.
export const FLOW_PREVIOUS_ENCOUNTER = {
  revision: "2026-11-12",
  groups: [
    {"id":"Fork"},
    {"id":"Corner"},
    {"id":"Rim"},
    {"id":"TankEscort","beat":"06a","area":{"shape":"rect","center":[83,181],"size":[2.4,3]},"route":[[83,181],[80,211],[85,239],[87,259]],"lifetime":186.2,"speed":2.5},
    {"id":"TankReinforce","area":{"shape":"rect","center":[83,220],"size":[2.4,3]},"route":[[83,220],[86,246],[88,262],[89,270]],"speed":2.5},
    {"id":"YardTransfer"},
    {"id":"GengHouse"},
    {"id":"EastStreet"},
    {"id":"NorthYard"},
    {"id":"RearPursuit","behavior":"advance"},
    {"id":"CrestWest"},
    {"id":"CrestEast"},
    {"id":"VillageGun"},
    {"id":"VillageRifles"},
    {"id":"SearchYard"},
    {"id":"SearchNeighbor"},
    {"id":"GateGuard"},
    {"id":"KitchenGuard"},
    {"id":"TempleGun"},
    {"id":"MortarTeam"},
  ],
  triggers: [
    {"id":"Arrival_03a"},
    {"id":"Arrival_03b"},
    {"id":"Arrival_03c"},
    {"id":"Arrival_03f"},
    {"id":"Arrival_03h"},
    {"id":"Arrival_06a"},
    {"id":"Arrival_06b"},
    {"id":"Arrival_06d"},
    {"id":"Arrival_06f","area":{"shape":"circle","center":[90,274],"size":[6,6]}},
    {"id":"Arrival_06h","area":{"shape":"circle","center":[92,280],"size":[6,6]}},
    {"id":"Arrival_08a"},
    {"id":"Arrival_08f"},
    {"id":"Arrival_09b"},
    {"id":"Arrival_09c"},
    {"id":"Arrival_09f"},
    {"id":"Arrival_09h"},
    {"id":"Arrival_09i"},
    {"id":"Arrival_09j"},
    {"id":"Arrival_10a"},
    {"id":"Arrival_10d"},
    {"id":"Arrival_10i"},
    {"id":"Arrival_10j"},
    {"id":"Trigger_Fork"},
    {"id":"Trigger_Corner"},
    {"id":"Trigger_Rim"},
    {"id":"Trigger_TankEscort","beat":"06a","area":{"shape":"rect","center":[86,225],"size":[6,6]}},
    {"id":"Trigger_TankReinforce"},
    {"id":"Trigger_YardTransfer"},
    {"id":"Trigger_GengHouse"},
    {"id":"Trigger_EastStreet"},
    {"id":"Trigger_NorthYard"},
    {"id":"Trigger_RearPursuit"},
    {"id":"Trigger_CrestWest"},
    {"id":"Trigger_CrestEast"},
    {"id":"Trigger_VillageGun"},
    {"id":"Trigger_VillageRifles"},
    {"id":"Trigger_SearchYard"},
    {"id":"Trigger_SearchNeighbor"},
    {"id":"Trigger_GateGuard"},
    {"id":"Trigger_KitchenGuard"},
    {"id":"Trigger_TempleGun"},
    {"id":"Trigger_MortarTeam"},
  ],
};

// Defaults before the annotated three-direction drag encounter.
export const FLOW_PREVIOUS_DRAG_ENCOUNTER = {
  revision: "2026-11-12-ground-1",
  groups: [
    {"id":"Fork","label":"岔口追兵","area":{"shape":"rect","center":[12,44],"size":[2.4,3]},"route":[[12,44],[18,58],[23,66],[35,66]],"lifetime":41.8,"note":"一拨五人，三名逃兵带回两人"},
    {"id":"Corner","label":"烟里近敌","beat":"03e","area":{"shape":"rect","center":[15,51],"size":[2.4,3]},"route":[[15,51],[20,59],[24,65]],"interval":1.3,"lifetime":18.7,"speed":2.5,"note":"一次两人"},
    {"id":"Rim","label":"支沟北沿","target":"winter","area":{"shape":"rect","center":[27,56],"size":[2.4,3]},"route":[[27,56],[26,61.8]],"count":2,"interval":1.4,"maxAlive":2,"lifetime":31.6,"speed":2.5,"note":"一次两人，由玩家击倒"},
    {"id":"TankEscort"},
    {"id":"TankReinforce"},
    {"id":"YardTransfer"},
    {"id":"GengHouse"},
    {"id":"EastStreet"},
    {"id":"NorthYard"},
    {"id":"RearPursuit","label":"北沟追兵","area":{"shape":"rect","center":[12,44],"size":[3,3]},"route":[[12,44],[21.9,67.1],[26,76.6],[30,86],[32.5,101],[34,117]],"count":6,"interval":7,"lifetime":34},
    {"id":"TankRearScreen"},
    {"id":"GroundWest"},
    {"id":"GroundEast"},
    {"id":"DragGround"},
    {"id":"FieldGround"},
    {"id":"CampWestGun"},
    {"id":"CampEastGun"},
    {"id":"LaneGround"},
    {"id":"BendGround"},
    {"id":"CrestWest"},
    {"id":"CrestEast"},
    {"id":"VillageGun"},
    {"id":"VillageRifles"},
    {"id":"SearchYard"},
    {"id":"SearchNeighbor"},
    {"id":"GateGuard"},
    {"id":"KitchenGuard"},
    {"id":"TempleGun"},
    {"id":"MortarTeam"},
  ],
  triggers: [
    {"id":"Arrival_03a"},
    {"id":"Arrival_03b"},
    {"id":"Arrival_03c"},
    {"id":"Arrival_03f"},
    {"id":"Arrival_03h"},
    {"id":"Arrival_06a"},
    {"id":"Arrival_06b"},
    {"id":"Arrival_06d"},
    {"id":"Arrival_06f"},
    {"id":"Arrival_06h"},
    {"id":"Arrival_08a"},
    {"id":"Arrival_08f"},
    {"id":"Arrival_09b"},
    {"id":"Arrival_09c"},
    {"id":"Arrival_09f"},
    {"id":"Arrival_09h"},
    {"id":"Arrival_09i"},
    {"id":"Arrival_09j"},
    {"id":"Arrival_10a"},
    {"id":"Arrival_10d"},
    {"id":"Arrival_10i"},
    {"id":"Arrival_10j"},
    {"id":"Trigger_Fork","label":"岔口追兵"},
    {"id":"Trigger_Corner","label":"烟里近敌","beat":"03e","area":{"shape":"rect","center":[30,66.8],"size":[6,6]}},
    {"id":"Trigger_Rim","label":"支沟北沿"},
    {"id":"Trigger_TankEscort"},
    {"id":"Trigger_TankReinforce"},
    {"id":"Trigger_YardTransfer"},
    {"id":"Trigger_GengHouse"},
    {"id":"Trigger_EastStreet"},
    {"id":"Trigger_NorthYard"},
    {"id":"Trigger_RearPursuit","label":"北沟追兵","delay":0},
    {"id":"Trigger_GroundWest"},
    {"id":"Trigger_GroundEast"},
    {"id":"Trigger_DragGround"},
    {"id":"Trigger_FieldGround"},
    {"id":"Trigger_CampWestGun"},
    {"id":"Trigger_CampEastGun"},
    {"id":"Trigger_LaneGround"},
    {"id":"Trigger_BendGround"},
    {"id":"Trigger_CrestWest"},
    {"id":"Trigger_CrestEast"},
    {"id":"Trigger_VillageGun"},
    {"id":"Trigger_VillageRifles"},
    {"id":"Trigger_SearchYard"},
    {"id":"Trigger_SearchNeighbor"},
    {"id":"Trigger_GateGuard"},
    {"id":"Trigger_KitchenGuard"},
    {"id":"Trigger_TempleGun"},
    {"id":"Trigger_MortarTeam"},
  ],
};

// Defaults before the annotated simultaneous, dispersed spawn revision.
export const FLOW_PREVIOUS_BATCH_ENCOUNTER = {
  revision: "2026-11-13-drag-1",
  groups: [
    {"id":"Fork","area":{"shape":"rect","center":[75,44],"size":[2.4,3]},"route":[[75,44],[69,51],[62,57.5],[54,60.5]],"count":5,"interval":1.8,"maxAlive":5,"lifetime":46.8,"note":"第一回五人压住洞口，玩家借沙包与箱垛后撤"},
    {"id":"Corner","route":[[77,58],[69,56],[62,55.5],[61,60.5],[60,65.6],[50,65.6],[38,66],[33,66.8]],"area":{"shape":"rect","center":[77,58],"size":[2.4,3]},"interval":2.2,"lifetime":55.8,"note":"第二回两人从东侧经门外坡道下沟，投弹后追到拐角"},
    {"id":"Rim"},
    {"id":"TrafficFlank"},
    {"id":"TankEscort"},
    {"id":"TankReinforce"},
    {"id":"YardTransfer"},
    {"id":"GengHouse"},
    {"id":"EastStreet"},
    {"id":"NorthYard"},
    {"id":"RearPursuit"},
    {"id":"TankRearScreen"},
    {"id":"GroundWest"},
    {"id":"GroundEast"},
    {"id":"DragGround"},
    {"id":"FieldGround"},
    {"id":"CampWestGun"},
    {"id":"CampEastGun"},
    {"id":"LaneGround"},
    {"id":"BendGround"},
    {"id":"CrestWest"},
    {"id":"CrestEast"},
    {"id":"VillageGun"},
    {"id":"VillageRifles"},
    {"id":"SearchYard"},
    {"id":"SearchNeighbor"},
    {"id":"GateGuard"},
    {"id":"KitchenGuard"},
    {"id":"TempleGun"},
    {"id":"MortarTeam"},
  ],
  triggers: [
    {"id":"Arrival_03a"},
    {"id":"Arrival_03b"},
    {"id":"Arrival_03c"},
    {"id":"Arrival_03f"},
    {"id":"Arrival_03h"},
    {"id":"Arrival_06a"},
    {"id":"Arrival_06b"},
    {"id":"Arrival_06d"},
    {"id":"Arrival_06f"},
    {"id":"Arrival_06h"},
    {"id":"Arrival_08a"},
    {"id":"Arrival_08f"},
    {"id":"Arrival_09b"},
    {"id":"Arrival_09c"},
    {"id":"Arrival_09f"},
    {"id":"Arrival_09h"},
    {"id":"Arrival_09i"},
    {"id":"Arrival_09j"},
    {"id":"Arrival_10a"},
    {"id":"Arrival_10d"},
    {"id":"Arrival_10i"},
    {"id":"Arrival_10j"},
    {"id":"Trigger_Fork"},
    {"id":"Trigger_Corner"},
    {"id":"Trigger_Rim"},
    {"id":"Trigger_TrafficFlank"},
    {"id":"Trigger_TankEscort"},
    {"id":"Trigger_TankReinforce"},
    {"id":"Trigger_YardTransfer"},
    {"id":"Trigger_GengHouse"},
    {"id":"Trigger_EastStreet"},
    {"id":"Trigger_NorthYard"},
    {"id":"Trigger_RearPursuit"},
    {"id":"Trigger_GroundWest"},
    {"id":"Trigger_GroundEast"},
    {"id":"Trigger_DragGround"},
    {"id":"Trigger_FieldGround"},
    {"id":"Trigger_CampWestGun"},
    {"id":"Trigger_CampEastGun"},
    {"id":"Trigger_LaneGround"},
    {"id":"Trigger_BendGround"},
    {"id":"Trigger_CrestWest"},
    {"id":"Trigger_CrestEast"},
    {"id":"Trigger_VillageGun"},
    {"id":"Trigger_VillageRifles"},
    {"id":"Trigger_SearchYard"},
    {"id":"Trigger_SearchNeighbor"},
    {"id":"Trigger_GateGuard"},
    {"id":"Trigger_KitchenGuard"},
    {"id":"Trigger_TempleGun"},
    {"id":"Trigger_MortarTeam"},
  ],
};

// Previous pursuit defaults for field-wise upgrades of saved drafts.
export const FLOW_PREVIOUS_PURSUIT = {
  "groups": [
    {
      "id": "Rim",
      "label": "③ 北坡下沟第一波",
      "beat": "03g",
      "endBeat": "03g",
      "triggerId": "Trigger_Rim",
      "enabled": true,
      "side": "enemy",
      "target": "player",
      "area": {
        "shape": "rect",
        "center": [
          20,
          33
        ],
        "size": [
          2.4,
          3
        ]
      },
      "route": [
        [
          20,
          33
        ],
        [
          17,
          36
        ],
        [
          14.5,
          40
        ],
        [
          12,
          44
        ],
        [
          21.9,
          67.1
        ],
        [
          25,
          72
        ]
      ],
      "count": 3,
      "interval": 1.8,
      "maxAlive": 3,
      "lifetime": 26.4,
      "speed": 2.3,
      "grenadeInterval": 0,
      "behavior": "advance",
      "note": "标记 1 北坡第一波三人，沿交通沟压到岔口"
    },
    {
      "id": "TrafficFlank",
      "label": "西坡增援（到2再触发）",
      "beat": "03h",
      "endBeat": "04a",
      "triggerId": "Trigger_TrafficFlank",
      "enabled": true,
      "side": "enemy",
      "target": "player",
      "area": {
        "shape": "rect",
        "center": [
          5,
          74
        ],
        "size": [
          2.4,
          3
        ]
      },
      "route": [
        [
          5,
          74
        ],
        [
          14,
          77
        ],
        [
          20,
          76.8
        ],
        [
          26,
          76.6
        ],
        [
          28,
          81
        ],
        [
          30,
          86
        ],
        [
          32.5,
          101
        ],
        [
          34,
          117
        ]
      ],
      "reinforceAfterClear": true,
      "count": 6,
      "interval": 2,
      "maxAlive": 3,
      "lifetime": 30,
      "speed": 2.4,
      "grenadeInterval": 10,
      "behavior": "advance",
      "note": "玩家到标记 2 后从西坡下沟三人，首批全部倒下再补三人，沿交通沟追向坡顶"
    },
    {
      "id": "RearPursuit",
      "label": "③ 北坡下沟第二波",
      "beat": "03g",
      "endBeat": "03h",
      "triggerId": "Trigger_RearPursuit",
      "enabled": true,
      "side": "enemy",
      "target": "player",
      "area": {
        "shape": "rect",
        "center": [
          20,
          33
        ],
        "size": [
          3,
          3
        ]
      },
      "route": [
        [
          20,
          33
        ],
        [
          17,
          36
        ],
        [
          14.5,
          40
        ],
        [
          12,
          44
        ],
        [
          21.9,
          67.1
        ],
        [
          26,
          76.6
        ],
        [
          30,
          86
        ],
        [
          32.5,
          101
        ],
        [
          34,
          117
        ]
      ],
      "count": 3,
      "interval": 2.5,
      "maxAlive": 3,
      "lifetime": 54,
      "speed": 2.2,
      "behavior": "bounds",
      "note": "关卡调度布设",
      "grenadeInterval": 11
    }
  ],
  "triggers": [
    {
      "id": "Trigger_Rim",
      "label": "③ 北坡下沟第一波",
      "beat": "03g",
      "endBeat": "03g",
      "mode": "area",
      "delay": 0,
      "area": {
        "shape": "rect",
        "center": [
          23.5,
          67.2
        ],
        "size": [
          6,
          6
        ]
      }
    },
    {
      "id": "Trigger_TrafficFlank",
      "label": "西坡增援（到2再触发）",
      "beat": "03h",
      "endBeat": "04a",
      "mode": "area",
      "delay": 0,
      "area": {
        "shape": "rect",
        "center": [
          30,
          86
        ],
        "size": [
          4,
          4
        ]
      }
    },
    {
      "id": "Trigger_RearPursuit",
      "label": "③ 北坡下沟第二波",
      "beat": "03g",
      "endBeat": "03h",
      "mode": "time",
      "delay": 34,
      "area": {
        "shape": "rect",
        "center": [
          23.5,
          67.2
        ],
        "size": [
          6,
          6
        ]
      }
    }
  ]
};
