// 渲染开发用固定状态夹具（与 AGENTS.md §三 状态契约同构）。
// 由 Script_PlayCli.mjs fixture 生成：L1 seed=3，Skilled bot 跑至 T6 的真实中盘状态。
// 用途：`index.html?fixture=1` 与表现层自测在引擎缺席时渲染本状态。重新生成请再跑同命令。

export const fixtureState = {
 "meta": {
  "level": "L1",
  "seed": 3,
  "turn": 6,
  "phase": "player",
  "nextUnitId": 4,
  "nextEnemyId": 4
 },
 "wave": {
  "status": "sweep",
  "sweepTurn": 4,
  "pool": 5,
  "decay": 1,
  "playerDrainThisTurn": 0,
  "smokeCharges": 0,
  "hardEndTurn": 10,
  "withdrawAnnounced": false,
  "sweepStartTurn": 3,
  "expelled": false,
  "roadCuts": 1,
  "doneTurn": null,
  "withdrawTurn": null,
  "garrison": false,
  "axisKills": {
   "north": 0,
   "south": 0
  },
  "schedule": [
   {
    "id": "w1scout",
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
     "5,1",
     "3,3",
     "2,2",
     "2,0",
     "3,-1",
     "5,-1",
     "6,-1"
    ],
    "target": null,
    "seizeGoal": 0,
    "axisKillsNeed": 0,
    "spawned": true
   },
   {
    "id": "w1grain",
    "kind": "march",
    "turn": 5,
    "role": "march",
    "entry": "10,-3",
    "exit": "10,-3",
    "units": [
     "inf",
     "inf",
     "puppet"
    ],
    "waypoints": [
     "8,-2",
     "4,0"
    ],
    "target": "v1",
    "seizeGoal": 8,
    "axisKillsNeed": 0,
    "spawned": true
   }
  ],
  "plan": {
   "scoutDir": 1
  },
  "tieSalt": 38,
  "revenge": {
   "id": "w1revenge",
   "watch": "w1grain",
   "casualtiesNeed": 2,
   "units": [
    "inf",
    "inf"
   ],
   "entry": "10,-3",
   "exit": "10,-3",
   "role": "mobile",
   "target": "v1",
   "burnCount": 1,
   "casualties": 0,
   "spawnedTurn": null,
   "pending": false
  }
 },
 "rngState": 3663131629,
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
    "attackSite": false
   },
   "1,0": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "2,-1": {
    "terrain": "woods",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "3,-1": {
    "terrain": "woods",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "4,-2": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "5,-2": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "6,-3": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "7,-3": {
    "terrain": "river",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "8,-4": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "9,-4": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "10,-5": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "0,1": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "1,1": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "2,0": {
    "terrain": "woods",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "3,0": {
    "terrain": "woods",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "4,-1": {
    "terrain": "field",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "5,-1": {
    "terrain": "field",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "6,-2": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "7,-2": {
    "terrain": "river",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "8,-3": {
    "terrain": "field",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "9,-3": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "10,-4": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "0,2": {
    "terrain": "open",
    "road": true,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "1,2": {
    "terrain": "open",
    "road": true,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "2,1": {
    "terrain": "open",
    "road": true,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "3,1": {
    "terrain": "village",
    "road": true,
    "roadBroken": false,
    "bridge": false,
    "villageId": "v1",
    "traces": 1,
    "searched": false,
    "attackSite": false
   },
   "4,0": {
    "terrain": "village",
    "road": true,
    "roadBroken": false,
    "bridge": false,
    "villageId": "v1",
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "5,0": {
    "terrain": "open",
    "road": true,
    "roadBroken": true,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "6,-1": {
    "terrain": "open",
    "road": true,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "7,-1": {
    "terrain": "river",
    "road": true,
    "roadBroken": false,
    "bridge": true,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "8,-2": {
    "terrain": "open",
    "road": true,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "9,-2": {
    "terrain": "open",
    "road": true,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "10,-3": {
    "terrain": "open",
    "road": true,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "0,3": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "1,3": {
    "terrain": "field",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "2,2": {
    "terrain": "grave",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "3,2": {
    "terrain": "village",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": "v1",
    "traces": 1,
    "searched": false,
    "attackSite": false
   },
   "4,1": {
    "terrain": "field",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "5,1": {
    "terrain": "field",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "6,0": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "7,0": {
    "terrain": "river",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "8,-1": {
    "terrain": "field",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "9,-1": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "10,-2": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "0,4": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "1,4": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "2,3": {
    "terrain": "field",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "3,3": {
    "terrain": "field",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "4,2": {
    "terrain": "field",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "5,2": {
    "terrain": "grave",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "6,1": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "7,1": {
    "terrain": "river",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "8,0": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "9,0": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "10,-1": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "0,5": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "1,5": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "2,4": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "3,4": {
    "terrain": "field",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "4,3": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "5,3": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "6,2": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "7,2": {
    "terrain": "river",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "8,1": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "9,1": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "10,0": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "0,6": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "1,6": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "2,5": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "3,5": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "4,4": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "5,4": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "6,3": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "7,3": {
    "terrain": "river",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "8,2": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "9,2": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "10,1": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "0,7": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "1,7": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "2,6": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "3,6": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "4,5": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "5,5": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "6,4": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "7,4": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "8,3": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "9,3": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "10,2": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "0,8": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "1,8": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "2,7": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "3,7": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "4,6": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "5,6": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "6,5": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "7,5": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "8,4": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "9,4": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   },
   "10,3": {
    "terrain": "open",
    "road": false,
    "roadBroken": false,
    "bridge": false,
    "villageId": null,
    "traces": 0,
    "searched": false,
    "attackSite": false
   }
  },
  "villages": {
   "v1": {
    "name": "枣林庄",
    "hexKeys": [
     "3,1",
     "4,0",
     "3,2"
    ],
    "pop": 4,
    "popStart": 4,
    "grainOpen": 6,
    "organize": 2,
    "organizeProgress": 0,
    "hasHq": true,
    "burnedHexes": 0
   }
  }
 },
 "tunnels": {
  "cells": {
   "3,1": {
    "facility": "storage",
    "grain": 8,
    "civs": 0,
    "smoke": 0,
    "civBreath": 0,
    "fightpostKnown": false
   },
   "3,2": {
    "facility": null,
    "grain": 0,
    "civs": 0,
    "smoke": 0,
    "civBreath": 0,
    "fightpostKnown": false
   }
  },
  "edges": {
   "3,1|3,2": {
    "door": null
   }
  },
  "entrances": {
   "3,1": {
    "conceal": 3,
    "expose": 2,
    "known": false,
    "sealed": false
   }
  },
  "vents": {},
  "digs": {
   "s4": {
    "kind": "roadBreak",
    "at": "4,0",
    "edge": null,
    "facility": null,
    "need": 2,
    "progress": 1,
    "workedTurn": 5
   }
  },
  "smokeOps": [],
  "nextSiteId": 4
 },
 "units": {
  "u1": {
   "id": "u1",
   "side": "ally",
   "type": "militia",
   "hp": 3,
   "mp": 2,
   "acted": false,
   "layer": "under",
   "pos": "3,1",
   "stance": "normal",
   "breath": 0,
   "revealed": false,
   "columnId": null,
   "attacked": false,
   "freeMove": false
  },
  "u2": {
   "id": "u2",
   "side": "ally",
   "type": "militia",
   "hp": 3,
   "mp": 2,
   "acted": false,
   "layer": "under",
   "pos": "3,1",
   "stance": "normal",
   "breath": 0,
   "revealed": false,
   "columnId": null,
   "attacked": false,
   "freeMove": false
  },
  "u3": {
   "id": "u3",
   "side": "ally",
   "type": "guerrilla",
   "hp": 4,
   "mp": 3,
   "acted": false,
   "layer": "surface",
   "pos": "4,0",
   "stance": "normal",
   "breath": 0,
   "revealed": false,
   "columnId": null,
   "attacked": false,
   "freeMove": false
  },
  "u4": {
   "id": "u4",
   "side": "ally",
   "type": "runner",
   "hp": 2,
   "mp": 4,
   "acted": false,
   "layer": "surface",
   "pos": "3,1",
   "stance": "hidden",
   "breath": 0,
   "revealed": false,
   "columnId": null,
   "attacked": false,
   "freeMove": false
  },
  "e1": {
   "id": "e1",
   "side": "enemy",
   "type": "puppet",
   "hp": 3,
   "mp": 2,
   "acted": false,
   "layer": "surface",
   "pos": "5,1",
   "stance": "normal",
   "breath": 0,
   "revealed": true,
   "columnId": "w1scout",
   "attacked": false,
   "freeMove": false
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
   "columnId": "w1grain",
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
   "columnId": "w1grain",
   "attacked": false,
   "freeMove": false
  },
  "e4": {
   "id": "e4",
   "side": "enemy",
   "type": "puppet",
   "hp": 3,
   "mp": 2,
   "acted": false,
   "layer": "surface",
   "pos": "8,-2",
   "stance": "normal",
   "breath": 0,
   "revealed": true,
   "columnId": "w1grain",
   "attacked": false,
   "freeMove": false
  }
 },
 "resources": {
  "ammo": 6
 },
 "enemy": {
  "columns": [
   {
    "id": "w1scout",
    "unitIds": [
     "e1"
    ],
    "role": "scout",
    "route": [
     "8,-2",
     "6,-1",
     "5,1",
     "3,3",
     "2,2",
     "2,0",
     "3,-1",
     "5,-1",
     "6,-1"
    ],
    "routeIndex": 3,
    "exit": "10,-3",
    "targetVillage": null,
    "seizeGoal": 0,
    "seized": 0,
    "caution": 0,
    "cautionTurns": 3,
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
    "axis": null,
    "burnCount": 0
   },
   {
    "id": "w1grain",
    "unitIds": [
     "e2",
     "e3",
     "e4"
    ],
    "role": "march",
    "route": [
     "8,-2",
     "4,0"
    ],
    "routeIndex": 1,
    "exit": "10,-3",
    "targetVillage": "v1",
    "seizeGoal": 8,
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
    "axis": null,
    "burnCount": 0
   }
  ],
  "sightings": [
   {
    "pos": "5,0",
    "turn": 4,
    "confidence": 2
   },
   {
    "pos": "5,0",
    "turn": 5,
    "confidence": 2
   }
  ],
  "pendingOps": [],
  "memory": {
   "ambushedVillages": []
  },
  "lastSeen": {
   "e1": {
    "pos": "5,1",
    "turn": 6
   }
  }
 },
 "wounded": {
  "atVillage": {},
  "inCells": {},
  "delivered": 0
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
  "hqOccupiedTurns": 0
 },
 "log": [
  {
   "turn": 1,
   "kind": "brief",
   "text": "第▲区队进驻枣林庄，护粮任务开始",
   "visible": true
  },
  {
   "turn": 1,
   "kind": "enter",
   "text": "转入地下",
   "visible": true,
   "hex": "3,1",
   "layer": "under"
  },
  {
   "turn": 1,
   "kind": "dig",
   "text": "修成储粮洞",
   "visible": true,
   "hex": "3,1",
   "layer": "under"
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
   "text": "粮秣入洞 3 担",
   "visible": true,
   "hex": "3,2"
  },
  {
   "turn": 1,
   "kind": "grain",
   "text": "粮秣入洞 2 担",
   "visible": true,
   "hex": "3,1"
  },
  {
   "turn": 2,
   "kind": "dig",
   "text": "地道段贯通",
   "visible": true,
   "hex": "3,2",
   "layer": "under"
  },
  {
   "turn": 2,
   "kind": "move",
   "text": "民兵组移动",
   "visible": true,
   "hex": "3,1",
   "layer": "surface"
  },
  {
   "turn": 2,
   "kind": "enter",
   "text": "转入地下",
   "visible": true,
   "hex": "3,1",
   "layer": "under"
  },
  {
   "turn": 2,
   "kind": "rest",
   "text": "民兵组原地待命",
   "visible": false,
   "hex": "3,1",
   "layer": "under"
  },
  {
   "turn": 2,
   "kind": "organize",
   "text": "组织工作推进（1/2）",
   "visible": true,
   "hex": "3,2"
  },
  {
   "turn": 2,
   "kind": "organize",
   "text": "枣林庄组织度升至 2",
   "visible": true,
   "hex": "3,1"
  },
  {
   "turn": 3,
   "kind": "banner",
   "text": "敌军扫荡开始",
   "visible": true
  },
  {
   "turn": 3,
   "kind": "rest",
   "text": "民兵组原地待命",
   "visible": false,
   "hex": "3,1",
   "layer": "under"
  },
  {
   "turn": 3,
   "kind": "rest",
   "text": "民兵组原地待命",
   "visible": false,
   "hex": "3,1",
   "layer": "under"
  },
  {
   "turn": 3,
   "kind": "move",
   "text": "游击班移动",
   "visible": true,
   "hex": "5,0",
   "layer": "surface"
  },
  {
   "turn": 3,
   "kind": "dig",
   "text": "施工推进（1/2）",
   "visible": true,
   "hex": "5,0"
  },
  {
   "turn": 3,
   "kind": "hide",
   "text": "联络员隐蔽",
   "visible": true,
   "hex": "3,1"
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
   "kind": "spawn",
   "text": "敌一部（1队）入境",
   "visible": false,
   "hex": "10,-3"
  },
  {
   "turn": 3,
   "kind": "enemyMove",
   "text": "敌一部行进",
   "visible": false,
   "hex": "8,-2"
  },
  {
   "turn": 4,
   "kind": "rest",
   "text": "民兵组原地待命",
   "visible": false,
   "hex": "3,1",
   "layer": "under"
  },
  {
   "turn": 4,
   "kind": "rest",
   "text": "民兵组原地待命",
   "visible": false,
   "hex": "3,1",
   "layer": "under"
  },
  {
   "turn": 4,
   "kind": "rest",
   "text": "游击班原地待命",
   "visible": false,
   "hex": "5,0",
   "layer": "surface"
  },
  {
   "turn": 4,
   "kind": "rest",
   "text": "联络员原地待命",
   "visible": false,
   "hex": "3,1",
   "layer": "surface"
  },
  {
   "turn": 4,
   "kind": "enemyMove",
   "text": "敌一部行进",
   "visible": true,
   "hex": "6,-1"
  },
  {
   "turn": 5,
   "kind": "rest",
   "text": "民兵组原地待命",
   "visible": false,
   "hex": "3,1",
   "layer": "under"
  },
  {
   "turn": 5,
   "kind": "rest",
   "text": "民兵组原地待命",
   "visible": false,
   "hex": "3,1",
   "layer": "under"
  },
  {
   "turn": 5,
   "kind": "move",
   "text": "游击班移动",
   "visible": true,
   "hex": "4,0",
   "layer": "surface"
  },
  {
   "turn": 5,
   "kind": "dig",
   "text": "施工推进（1/2）",
   "visible": true,
   "hex": "4,0"
  },
  {
   "turn": 5,
   "kind": "rest",
   "text": "联络员原地待命",
   "visible": false,
   "hex": "3,1",
   "layer": "surface"
  },
  {
   "turn": 5,
   "kind": "spawn",
   "text": "敌一部（3队）入境",
   "visible": false,
   "hex": "10,-3"
  },
  {
   "turn": 5,
   "kind": "enemyMove",
   "text": "敌一部行进",
   "visible": false,
   "hex": "8,-2"
  },
  {
   "turn": 5,
   "kind": "enemyMove",
   "text": "敌一部行进",
   "visible": true,
   "hex": "5,1"
  }
 ],
 "medals": null,
 "result": null
};
