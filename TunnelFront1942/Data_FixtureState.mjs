// 渲染开发用固定状态夹具（与 AGENTS.md §三 状态契约同构）。
// 由 Script_PlayCli.mjs fixture 生成：A3 seed=3，Skilled bot 跑至 T6 的真实中盘状态。
// 用途：`index.html?fixture=1` 与表现层自测在引擎缺席时渲染本状态。重新生成请再跑同命令。

export const fixtureState = {
 "meta": {
  "level": "A3",
  "act": 3,
  "seed": 3,
  "turn": 6,
  "phase": "player",
  "nextUnitId": 5,
  "nextEnemyId": 5,
  "nextCivId": 6
 },
 "wave": {
  "status": "sweep",
  "sweepTurn": 4,
  "pool": 9,
  "decay": 0,
  "playerDrainThisTurn": 0,
  "smokeCharges": 0,
  "floodCharges": 0,
  "hardEndTurn": 10,
  "withdrawAnnounced": false,
  "sweepStartTurn": 3,
  "expelled": false,
  "roadCuts": 2,
  "doneTurn": null,
  "withdrawTurn": null,
  "garrison": false,
  "axisKills": {
   "north": 0,
   "south": 0
  },
  "schedule": [
   {
    "id": "A3scout",
    "kind": "scout",
    "turn": 3,
    "role": "scout",
    "entry": "10,-3",
    "exit": "10,-3",
    "units": [
     "puppet"
    ],
    "waypoints": [
     "8,-2",
     "6,-1",
     "4,-2",
     "2,-1",
     "2,1",
     "3,2",
     "5,0"
    ],
    "target": null,
    "telegraph": "内线电报：伪军斥候一队明日自 10,-3 入境，北环（先探树林一侧）",
    "seizeGoal": 0,
    "axisKillsNeed": 0,
    "spawned": true
   },
   {
    "id": "A3mainN",
    "kind": "march",
    "turn": 5,
    "role": "march",
    "entry": "10,-3",
    "exit": "10,-3",
    "units": [
     "inf",
     "inf"
    ],
    "waypoints": [
     "8,-2",
     "6,-1",
     "5,0",
     "4,0"
    ],
    "target": "v1",
    "telegraph": "内线电报：扫荡队（2 队）明日自 10,-3 入境——分成两股，一股走大车路，一股绕南土路，两面夹村",
    "seizeGoal": 0,
    "axisKillsNeed": 0,
    "spawned": true
   },
   {
    "id": "A3mainS",
    "kind": "march",
    "turn": 5,
    "role": "march",
    "entry": "10,1",
    "exit": "10,1",
    "units": [
     "inf",
     "puppet"
    ],
    "waypoints": [
     "9,2",
     "6,3",
     "4,2",
     "3,2"
    ],
    "target": "v1",
    "telegraph": "内线电报：扫荡队（2 队）明日自 10,1 入境——分成两股，一股走大车路，一股绕南土路，两面夹村",
    "seizeGoal": 0,
    "axisKillsNeed": 0,
    "spawned": true
   },
   {
    "id": "A3sapper",
    "kind": "sapper",
    "turn": 6,
    "role": "sapper",
    "entry": "10,-3",
    "exit": "10,-3",
    "units": [
     "sapper"
    ],
    "waypoints": [
     "8,-2",
     "6,-1",
     "5,0",
     "4,0"
    ],
    "target": "v1",
    "telegraph": "内线电报：敌工兵组携炸药随队而来，专撬暴露最高的地道口（明日自 10,-3 入境）",
    "seizeGoal": 0,
    "axisKillsNeed": 0,
    "spawned": false
   }
  ],
  "plan": {
   "axis": 4,
   "mix": 0,
   "arrive": 1,
   "scoutDir": 0,
   "revenge": 1,
   "axisId": "dual",
   "mixId": "heavy",
   "scoutId": "northLoop",
   "arriveTurn": 5,
   "sapperTurn": 6
  },
  "tieSalt": 479,
  "revenge": {
   "id": "A3revenge",
   "name": "追剿队",
   "casualtiesNeed": 2,
   "units": [
    "inf",
    "sapper"
   ],
   "role": "sapper",
   "entry": "10,1",
   "exit": "10,1",
   "target": "v1",
   "burnCount": 0,
   "telegraph": "内线电报：敌调一个班带工兵来追剿，明日自南土路进境，直奔已露头的地道口",
   "watch": "A3main",
   "casualties": 0,
   "spawnedTurn": null,
   "pending": false
  }
 },
 "rngState": 2399460289,
 "map": {
  "hexes": {
   "0,0": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "1,0": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "2,-1": {
    "terrain": "woods",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "3,-1": {
    "terrain": "woods",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "4,-2": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "5,-2": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "6,-3": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "7,-3": {
    "terrain": "river",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "8,-4": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "9,-4": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "10,-5": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "0,1": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "1,1": {
    "terrain": "field",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "2,0": {
    "terrain": "field",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "3,0": {
    "terrain": "village",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": "v1",
    "traces": 2,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "4,-1": {
    "terrain": "village",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": "v1",
    "traces": 2,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "5,-1": {
    "terrain": "field",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "6,-2": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "7,-2": {
    "terrain": "river",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "8,-3": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "9,-3": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "10,-4": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "0,2": {
    "terrain": "open",
    "road": true,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "1,2": {
    "terrain": "open",
    "road": true,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "2,1": {
    "terrain": "field",
    "road": true,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "3,1": {
    "terrain": "village",
    "road": true,
    "roadBroken": false,
    "bridge": false,
    "villageId": "v1",
    "traces": 2,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "4,0": {
    "terrain": "village",
    "road": true,
    "roadBroken": false,
    "bridge": false,
    "villageId": "v1",
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "5,0": {
    "terrain": "field",
    "road": true,
    "roadBroken": true,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "6,-1": {
    "terrain": "open",
    "road": true,
    "roadBroken": true,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "7,-1": {
    "terrain": "river",
    "road": true,
    "roadBroken": false,
    "bridge": true,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "8,-2": {
    "terrain": "open",
    "road": true,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "9,-2": {
    "terrain": "open",
    "road": true,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "10,-3": {
    "terrain": "open",
    "road": true,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "0,3": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "1,3": {
    "terrain": "grave",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "2,2": {
    "terrain": "field",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "3,2": {
    "terrain": "field",
    "road": true,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "4,1": {
    "terrain": "field",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "5,1": {
    "terrain": "field",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "6,0": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "7,0": {
    "terrain": "river",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "8,-1": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "9,-1": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "10,-2": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "0,4": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "1,4": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "2,3": {
    "terrain": "field",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "3,3": {
    "terrain": "field",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "4,2": {
    "terrain": "field",
    "road": true,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "5,2": {
    "terrain": "grave",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1,
    "ambushSetTurn": 4
   },
   "6,1": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "7,1": {
    "terrain": "river",
    "road": false,
    "roadBroken": false,
    "bridge": true,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "8,0": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "9,0": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "10,-1": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "0,5": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "1,5": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "2,4": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "3,4": {
    "terrain": "field",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "4,3": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "5,3": {
    "terrain": "open",
    "road": true,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "6,2": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "7,2": {
    "terrain": "river",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "8,1": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "9,1": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "10,0": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "0,6": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "1,6": {
    "terrain": "woods",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "2,5": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "3,5": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "4,4": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "5,4": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "6,3": {
    "terrain": "open",
    "road": true,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "7,3": {
    "terrain": "open",
    "road": true,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "8,2": {
    "terrain": "open",
    "road": true,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "9,2": {
    "terrain": "open",
    "road": true,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "10,1": {
    "terrain": "open",
    "road": true,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "0,7": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "1,7": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "2,6": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "3,6": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "4,5": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "5,5": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "6,4": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "7,4": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "8,3": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "9,3": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "10,2": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "0,8": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "1,8": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "2,7": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "3,7": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "4,6": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "5,6": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "6,5": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "7,5": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "8,4": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "9,4": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   },
   "10,3": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false,
    "alertedUntil": 0,
    "elev": 1
   }
  },
  "villages": {
   "v1": {
    "name": "高家庄",
    "hexKeys": [
     "3,0",
     "4,-1",
     "3,1",
     "4,0"
    ],
    "popStart": 6,
    "grainOpen": 0,
    "organize": 1,
    "organizeProgress": 1,
    "hasHq": true,
    "burnedHexes": 0,
    "seizedTurn": 0
   }
  }
 },
 "tunnels": {
  "cells": {
   "3,0": {
    "facility": "storage",
    "grain": 8,
    "smoke": 0,
    "water": 0,
    "trapReady": false,
    "fightpostHeat": 0,
    "fightpostLastTurn": 0,
    "fightpostKnown": false
   },
   "4,-1": {
    "facility": "fightpost",
    "grain": 0,
    "smoke": 0,
    "water": 0,
    "trapReady": false,
    "fightpostHeat": 0,
    "fightpostLastTurn": 0,
    "fightpostKnown": false
   },
   "4,0": {
    "facility": "shelter",
    "grain": 0,
    "smoke": 0,
    "water": 0,
    "trapReady": false,
    "fightpostHeat": 0,
    "fightpostLastTurn": 0,
    "fightpostKnown": false
   },
   "3,1": {
    "facility": "storage",
    "grain": 6,
    "smoke": 0,
    "water": 0,
    "trapReady": false,
    "fightpostHeat": 0,
    "fightpostLastTurn": 0,
    "fightpostKnown": false
   },
   "2,1": {
    "facility": "shelter",
    "grain": 0,
    "smoke": 0,
    "water": 0,
    "trapReady": false,
    "fightpostHeat": 0,
    "fightpostLastTurn": 0,
    "fightpostKnown": false
   }
  },
  "edges": {
   "3,0|4,-1": {
    "door": null
   },
   "4,-1|4,0": {
    "door": null
   },
   "3,1|4,0": {
    "door": null
   },
   "2,1|3,1": {
    "door": null
   },
   "2,1|3,0": {
    "door": null
   },
   "3,0|4,0": {
    "door": null
   }
  },
  "entrances": {
   "3,0": {
    "conceal": 3,
    "expose": 5,
    "known": false,
    "sealed": false,
    "disguise": "stove"
   },
   "2,1": {
    "conceal": 2,
    "expose": 5,
    "known": false,
    "sealed": false,
    "disguise": null
   }
  },
  "vents": {},
  "digs": {},
  "smokeOps": [],
  "floodOps": [],
  "nextSiteId": 6
 },
 "units": {
  "u1": {
   "id": "u1",
   "side": "ally",
   "type": "militia",
   "hp": 3,
   "mp": 2,
   "acted": false,
   "layer": "surface",
   "pos": "5,2",
   "stance": "ambush",
   "breath": 0,
   "revealed": false,
   "columnId": null,
   "attacked": false,
   "freeMove": false,
   "coverUses": 0,
   "ambushHex": "5,2",
   "ambushTurn": 4,
   "ambushStale": false
  },
  "u2": {
   "id": "u2",
   "side": "ally",
   "type": "militia",
   "hp": 2,
   "mp": 2,
   "acted": false,
   "layer": "surface",
   "pos": "8,-1",
   "stance": "normal",
   "breath": 0,
   "revealed": false,
   "columnId": null,
   "attacked": false,
   "freeMove": false,
   "coverUses": 0,
   "ambushHex": null,
   "ambushTurn": 0,
   "ambushStale": false
  },
  "u3": {
   "id": "u3",
   "side": "ally",
   "type": "militia",
   "hp": 3,
   "mp": 2,
   "acted": false,
   "layer": "under",
   "pos": "4,-1",
   "stance": "normal",
   "breath": 0,
   "revealed": false,
   "columnId": null,
   "attacked": false,
   "freeMove": false,
   "coverUses": 0,
   "ambushHex": null,
   "ambushTurn": 0,
   "ambushStale": false
  },
  "u4": {
   "id": "u4",
   "side": "ally",
   "type": "guerrilla",
   "hp": 4,
   "mp": 3,
   "acted": false,
   "layer": "under",
   "pos": "4,0",
   "stance": "normal",
   "breath": 0,
   "revealed": false,
   "columnId": null,
   "attacked": false,
   "freeMove": false,
   "coverUses": 0,
   "ambushHex": null,
   "ambushTurn": 0,
   "ambushStale": false
  },
  "u5": {
   "id": "u5",
   "side": "ally",
   "type": "runner",
   "hp": 2,
   "mp": 4,
   "acted": false,
   "layer": "surface",
   "pos": "4,-1",
   "stance": "hidden",
   "breath": 0,
   "revealed": false,
   "columnId": null,
   "attacked": false,
   "freeMove": false,
   "coverUses": 0,
   "ambushHex": null,
   "ambushTurn": 0,
   "ambushStale": false
  },
  "e2": {
   "id": "e2",
   "side": "enemy",
   "type": "inf",
   "hp": 4,
   "mp": 2,
   "acted": false,
   "layer": "surface",
   "pos": "8,-2",
   "stance": "normal",
   "breath": 0,
   "revealed": true,
   "columnId": "A3mainN",
   "attacked": false,
   "freeMove": false
  },
  "e3": {
   "id": "e3",
   "side": "enemy",
   "type": "inf",
   "hp": 4,
   "mp": 2,
   "acted": false,
   "layer": "surface",
   "pos": "8,-2",
   "stance": "normal",
   "breath": 0,
   "revealed": true,
   "columnId": "A3mainN",
   "attacked": false,
   "freeMove": false
  },
  "e4": {
   "id": "e4",
   "side": "enemy",
   "type": "inf",
   "hp": 4,
   "mp": 2,
   "acted": false,
   "layer": "surface",
   "pos": "9,2",
   "stance": "normal",
   "breath": 0,
   "revealed": true,
   "columnId": "A3mainS",
   "attacked": false,
   "freeMove": false
  },
  "e5": {
   "id": "e5",
   "side": "enemy",
   "type": "puppet",
   "hp": 3,
   "mp": 2,
   "acted": false,
   "layer": "surface",
   "pos": "9,2",
   "stance": "normal",
   "breath": 0,
   "revealed": true,
   "columnId": "A3mainS",
   "attacked": false,
   "freeMove": false
  }
 },
 "civs": {
  "c1": {
   "id": "c1",
   "kind": "old",
   "home": "v1",
   "loc": "cell",
   "at": "2,1",
   "panic": 1,
   "fate": null
  },
  "c2": {
   "id": "c2",
   "kind": "old",
   "home": "v1",
   "loc": "cell",
   "at": "2,1",
   "panic": 1,
   "fate": null
  },
  "c3": {
   "id": "c3",
   "kind": "young",
   "home": "v1",
   "loc": "cell",
   "at": "2,1",
   "panic": 1,
   "fate": null
  },
  "c4": {
   "id": "c4",
   "kind": "young",
   "home": "v1",
   "loc": "cell",
   "at": "2,1",
   "panic": 1,
   "fate": null
  },
  "c5": {
   "id": "c5",
   "kind": "young",
   "home": "v1",
   "loc": "cell",
   "at": "4,0",
   "panic": 0,
   "fate": null
  },
  "c6": {
   "id": "c6",
   "kind": "wounded",
   "home": "v1",
   "loc": "cell",
   "at": "2,1",
   "panic": 1,
   "fate": null
  }
 },
 "resources": {
  "ammo": 8
 },
 "enemy": {
  "columns": [
   {
    "id": "A3scout",
    "unitIds": [],
    "role": "scout",
    "route": [
     "8,-2",
     "6,-1",
     "4,-2",
     "2,-1",
     "2,1",
     "3,2",
     "5,0"
    ],
    "routeIndex": 1,
    "exit": "10,-3",
    "targetVillage": null,
    "seizeGoal": 0,
    "seized": 0,
    "caution": 0,
    "cautionTurns": 2,
    "regroupTurns": 0,
    "opInProgress": null,
    "withdrawing": true,
    "garrison": false,
    "plannedPath": [],
    "respondFresh": false,
    "incident": false,
    "casualties": 0,
    "burned": false,
    "done": true,
    "gained": false,
    "seals": 0,
    "axis": "north",
    "burnCount": 0
   },
   {
    "id": "A3mainN",
    "unitIds": [
     "e2",
     "e3"
    ],
    "role": "march",
    "route": [
     "8,-2",
     "6,-1",
     "5,0",
     "4,0"
    ],
    "routeIndex": 1,
    "exit": "10,-3",
    "targetVillage": "v1",
    "seizeGoal": 0,
    "seized": 0,
    "caution": 0,
    "cautionTurns": 1,
    "regroupTurns": 0,
    "opInProgress": null,
    "withdrawing": false,
    "garrison": false,
    "plannedPath": [],
    "respondFresh": false,
    "incident": false,
    "casualties": 0,
    "burned": false,
    "done": false,
    "gained": false,
    "seals": 0,
    "axis": "north",
    "burnCount": 0
   },
   {
    "id": "A3mainS",
    "unitIds": [
     "e4",
     "e5"
    ],
    "role": "march",
    "route": [
     "9,2",
     "6,3",
     "4,2",
     "3,2"
    ],
    "routeIndex": 1,
    "exit": "10,1",
    "targetVillage": "v1",
    "seizeGoal": 0,
    "seized": 0,
    "caution": 0,
    "cautionTurns": 1,
    "regroupTurns": 0,
    "opInProgress": null,
    "withdrawing": false,
    "garrison": false,
    "plannedPath": [],
    "respondFresh": false,
    "incident": false,
    "casualties": 0,
    "burned": false,
    "done": false,
    "gained": false,
    "seals": 0,
    "axis": "south",
    "burnCount": 0
   }
  ],
  "sightings": [
   {
    "pos": "8,-1",
    "turn": 4,
    "confidence": 2
   },
   {
    "pos": "8,-1",
    "turn": 5,
    "confidence": 2
   }
  ],
  "pendingOps": [],
  "memory": {
   "ambushedVillages": []
  },
  "lastSeen": {
   "e2": {
    "pos": "8,-2",
    "turn": 6
   },
   "e3": {
    "pos": "8,-2",
    "turn": 6
   }
  }
 },
 "ledger": {
  "civCaptured": 0,
  "civDead": 0,
  "housesBurned": 0,
  "grainSeized": 0
 },
 "score": {
  "kills": {
   "inf": 0,
   "puppet": 0,
   "spy": 0,
   "sapper": 0
  },
  "withdrewEarlyTurns": 0,
  "alliesLost": 0,
  "hqOccupiedTurns": 0,
  "fightpostsUsed": [],
  "civForcedOut": 0,
  "civGuidedTrips": 0
 },
 "log": [
  {
   "turn": 1,
   "kind": "brief",
   "text": "第三幕《能打的地道》——高家庄",
   "visible": true
  },
  {
   "turn": 1,
   "kind": "grain",
   "text": "粮秣入洞 3 担",
   "visible": true,
   "hex": "3,0"
  },
  {
   "turn": 1,
   "kind": "grain",
   "text": "粮秣入洞 3 担",
   "visible": true,
   "hex": "4,0"
  },
  {
   "turn": 1,
   "kind": "grain",
   "text": "粮秣入洞 2 担",
   "visible": true,
   "hex": "3,1"
  },
  {
   "turn": 1,
   "kind": "civs",
   "text": "群众 1 批转入地道（伤员）",
   "visible": true,
   "hex": "3,1"
  },
  {
   "turn": 1,
   "kind": "civs",
   "text": "群众 2 批转入地道（老弱、老弱）",
   "visible": true,
   "hex": "4,-1"
  },
  {
   "turn": 2,
   "kind": "civs",
   "text": "群众 2 批转入地道（青壮、青壮）",
   "visible": true,
   "hex": "3,0"
  },
  {
   "turn": 2,
   "kind": "civs",
   "text": "群众 1 批转入地道（青壮）",
   "visible": true,
   "hex": "4,0"
  },
  {
   "turn": 2,
   "kind": "move",
   "text": "民兵组移动",
   "visible": true,
   "hex": "2,1",
   "layer": "surface"
  },
  {
   "turn": 2,
   "kind": "enter",
   "text": "转入地下",
   "visible": true,
   "hex": "2,1",
   "layer": "under"
  },
  {
   "turn": 2,
   "kind": "dig",
   "text": "地道段贯通",
   "visible": true,
   "hex": "3,0",
   "layer": "under"
  },
  {
   "turn": 2,
   "kind": "expose",
   "text": "动土的响动传上去了：本气区各口暴露 +1",
   "visible": true,
   "hex": "3,0"
  },
  {
   "turn": 2,
   "kind": "move",
   "text": "游击班移动",
   "visible": true,
   "hex": "2,1",
   "layer": "surface"
  },
  {
   "turn": 2,
   "kind": "enter",
   "text": "转入地下",
   "visible": true,
   "hex": "2,1",
   "layer": "under"
  },
  {
   "turn": 2,
   "kind": "move",
   "text": "游击班移动",
   "visible": true,
   "hex": "3,1",
   "layer": "under"
  },
  {
   "turn": 2,
   "kind": "dig",
   "text": "施工推进（1/2）",
   "visible": true,
   "hex": "3,1"
  },
  {
   "turn": 2,
   "kind": "organize",
   "text": "组织工作推进（1/2）",
   "visible": true,
   "hex": "4,-1"
  },
  {
   "turn": 3,
   "kind": "banner",
   "text": "敌军扫荡开始",
   "visible": true
  },
  {
   "turn": 3,
   "kind": "move",
   "text": "民兵组移动",
   "visible": true,
   "hex": "5,0",
   "layer": "surface"
  },
  {
   "turn": 3,
   "kind": "road",
   "text": "大车路已破毁",
   "visible": true,
   "hex": "5,0"
  },
  {
   "turn": 3,
   "kind": "move",
   "text": "民兵组移动",
   "visible": true,
   "hex": "6,-1",
   "layer": "surface"
  },
  {
   "turn": 3,
   "kind": "road",
   "text": "大车路已破毁",
   "visible": true,
   "hex": "6,-1"
  },
  {
   "turn": 3,
   "kind": "move",
   "text": "民兵组移动",
   "visible": true,
   "hex": "3,1",
   "layer": "under"
  },
  {
   "turn": 3,
   "kind": "dig",
   "text": "修成储粮洞",
   "visible": true,
   "hex": "3,1",
   "layer": "under"
  },
  {
   "turn": 3,
   "kind": "expose",
   "text": "动土的响动传上去了：本气区各口暴露 +1",
   "visible": true,
   "hex": "3,1"
  },
  {
   "turn": 3,
   "kind": "move",
   "text": "游击班移动",
   "visible": true,
   "hex": "4,-1",
   "layer": "under"
  },
  {
   "turn": 3,
   "kind": "dig",
   "text": "施工推进（1/2）",
   "visible": true,
   "hex": "4,-1"
  },
  {
   "turn": 3,
   "kind": "grain",
   "text": "粮秣入洞 3 担",
   "visible": true,
   "hex": "4,-1"
  },
  {
   "turn": 3,
   "kind": "spawn",
   "text": "敌一部（1队）入境",
   "visible": false,
   "hex": "10,-3"
  },
  {
   "turn": 3,
   "kind": "enemyMove",
   "text": "敌一部行进",
   "visible": true,
   "hex": "8,-2"
  },
  {
   "turn": 4,
   "kind": "move",
   "text": "民兵组移动",
   "visible": true,
   "hex": "5,2",
   "layer": "surface"
  },
  {
   "turn": 4,
   "kind": "ambush",
   "text": "民兵组设伏",
   "visible": true,
   "hex": "5,2"
  },
  {
   "turn": 4,
   "kind": "move",
   "text": "民兵组移动",
   "visible": true,
   "hex": "8,-1",
   "layer": "surface"
  },
  {
   "turn": 4,
   "kind": "rest",
   "text": "民兵组原地待命",
   "visible": false,
   "hex": "8,-1",
   "layer": "surface"
  },
  {
   "turn": 4,
   "kind": "move",
   "text": "民兵组移动",
   "visible": true,
   "hex": "2,1",
   "layer": "under"
  },
  {
   "turn": 4,
   "kind": "rest",
   "text": "民兵组原地待命",
   "visible": false,
   "hex": "2,1",
   "layer": "under"
  },
  {
   "turn": 4,
   "kind": "move",
   "text": "游击班移动",
   "visible": true,
   "hex": "4,0",
   "layer": "under"
  },
  {
   "turn": 4,
   "kind": "rest",
   "text": "游击班原地待命",
   "visible": false,
   "hex": "4,0",
   "layer": "under"
  },
  {
   "turn": 4,
   "kind": "grain",
   "text": "粮秣入洞 3 担",
   "visible": true,
   "hex": "4,-1"
  },
  {
   "turn": 4,
   "kind": "combat",
   "text": "伪军队接火民兵组：伤 1",
   "visible": true,
   "hex": "8,-1"
  },
  {
   "turn": 4,
   "kind": "combat",
   "text": "民兵组还击：伤 1",
   "visible": true,
   "hex": "8,-2"
  },
  {
   "turn": 4,
   "kind": "panic",
   "text": "有人在跟前守着，人心定下来了",
   "visible": false,
   "hex": "2,1",
   "layer": "under"
  },
  {
   "turn": 4,
   "kind": "panic",
   "text": "有人在跟前守着，人心定下来了",
   "visible": false,
   "hex": "2,1",
   "layer": "under"
  },
  {
   "turn": 4,
   "kind": "panic",
   "text": "有人在跟前守着，人心定下来了",
   "visible": false,
   "hex": "2,1",
   "layer": "under"
  },
  {
   "turn": 4,
   "kind": "panic",
   "text": "有人在跟前守着，人心定下来了",
   "visible": false,
   "hex": "2,1",
   "layer": "under"
  },
  {
   "turn": 4,
   "kind": "panic",
   "text": "有人在跟前守着，人心定下来了",
   "visible": false,
   "hex": "4,0",
   "layer": "under"
  },
  {
   "turn": 4,
   "kind": "panic",
   "text": "有人在跟前守着，人心定下来了",
   "visible": false,
   "hex": "2,1",
   "layer": "under"
  },
  {
   "turn": 5,
   "kind": "rest",
   "text": "民兵组原地待命",
   "visible": false,
   "hex": "5,2",
   "layer": "surface"
  },
  {
   "turn": 5,
   "kind": "rest",
   "text": "民兵组原地待命",
   "visible": false,
   "hex": "8,-1",
   "layer": "surface"
  },
  {
   "turn": 5,
   "kind": "move",
   "text": "民兵组移动",
   "visible": true,
   "hex": "4,-1",
   "layer": "under"
  },
  {
   "turn": 5,
   "kind": "dig",
   "text": "修成射击孔",
   "visible": true,
   "hex": "4,-1",
   "layer": "under"
  },
  {
   "turn": 5,
   "kind": "expose",
   "text": "动土的响动传上去了：本气区各口暴露 +1",
   "visible": true,
   "hex": "4,-1"
  },
  {
   "turn": 5,
   "kind": "dig",
   "text": "地道段贯通",
   "visible": true,
   "hex": "3,0",
   "layer": "under"
  },
  {
   "turn": 5,
   "kind": "expose",
   "text": "动土的响动传上去了：本气区各口暴露 +1",
   "visible": true,
   "hex": "3,0"
  },
  {
   "turn": 5,
   "kind": "hide",
   "text": "联络员隐蔽",
   "visible": true,
   "hex": "4,-1"
  },
  {
   "turn": 5,
   "kind": "spawn",
   "text": "敌一部（2队）入境",
   "visible": true,
   "hex": "10,-3"
  },
  {
   "turn": 5,
   "kind": "spawn",
   "text": "敌一部（2队）入境",
   "visible": false,
   "hex": "10,1"
  },
  {
   "turn": 5,
   "kind": "enemyMove",
   "text": "敌一部行进",
   "visible": true,
   "hex": "8,-2"
  },
  {
   "turn": 5,
   "kind": "enemyMove",
   "text": "敌一部行进",
   "visible": false,
   "hex": "9,2"
  },
  {
   "turn": 5,
   "kind": "enemy",
   "text": "受创斥候回撤报信",
   "visible": true,
   "hex": "8,-2"
  },
  {
   "turn": 5,
   "kind": "enemyMove",
   "text": "敌一部行进",
   "visible": true,
   "hex": "10,-3"
  },
  {
   "turn": 5,
   "kind": "enemyMove",
   "text": "敌一部退出本区",
   "visible": true,
   "hex": "10,-3"
  }
 ],
 "medals": null,
 "result": null
};
