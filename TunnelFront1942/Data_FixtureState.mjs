// 渲染开发用固定状态夹具（与 AGENTS.md §三 状态契约同构）。
// 用途：`index.html?fixture=1` 与表现层自测在引擎未就绪时渲染本状态。
// 引擎落地后由 Script_PlayCli 重新生成覆盖本文件（保持导出名不变）。

export const fixtureState = {
  meta: { level: "L1", seed: 3, turn: 6, phase: "player" },
  wave: { status: "sweep", sweepTurn: 2, pool: 8, decay: 1, playerDrainThisTurn: 0,
          smokeCharges: 0, hardEndTurn: 10, withdrawAnnounced: false },
  rngState: 987654,
  map: {
    hexes: {
      "2,2": { terrain: "woods", road: false, roadBroken: false, bridge: false, villageId: null, traces: 0, searched: false, attackSite: false },
      "3,2": { terrain: "village", road: false, roadBroken: false, bridge: false, villageId: "v1", traces: 2, searched: false, attackSite: false },
      "4,2": { terrain: "village", road: true, roadBroken: false, bridge: false, villageId: "v1", traces: 0, searched: true, attackSite: false },
      "5,2": { terrain: "road", road: true, roadBroken: false, bridge: false, villageId: null, traces: 0, searched: false, attackSite: false },
      "6,2": { terrain: "road", road: true, roadBroken: true, bridge: false, villageId: null, traces: 0, searched: false, attackSite: false },
      "2,3": { terrain: "grave", road: false, roadBroken: false, bridge: false, villageId: null, traces: 3, searched: false, attackSite: true },
      "3,3": { terrain: "field", road: false, roadBroken: false, bridge: false, villageId: null, traces: 1, searched: false, attackSite: false },
      "4,3": { terrain: "open", road: false, roadBroken: false, bridge: false, villageId: null, traces: 0, searched: false, attackSite: false },
      "5,3": { terrain: "river", road: false, roadBroken: false, bridge: false, villageId: null, traces: 0, searched: false, attackSite: false },
      "5,1": { terrain: "river", road: true, roadBroken: false, bridge: true, villageId: null, traces: 0, searched: false, attackSite: false },
      "2,4": { terrain: "field", road: false, roadBroken: false, bridge: false, villageId: null, traces: 0, searched: false, attackSite: false },
      "3,4": { terrain: "open", road: false, roadBroken: false, bridge: false, villageId: null, traces: 0, searched: false, attackSite: false },
      "4,1": { terrain: "field", road: false, roadBroken: false, bridge: false, villageId: null, traces: 0, searched: false, attackSite: false },
      "3,1": { terrain: "woods", road: false, roadBroken: false, bridge: false, villageId: null, traces: 0, searched: false, attackSite: false },
    },
    villages: {
      v1: { name: "枣林庄", hexKeys: ["3,2", "4,2"], pop: 4, popStart: 4, grainOpen: 6,
            organize: 1, organizeProgress: 0, hasHq: true, burnedHexes: 0 },
    },
  },
  tunnels: {
    cells: {
      "3,2": { facility: "storage", grain: 4, civs: 0, smoke: 0 },
      "3,3": { facility: "shelter", grain: 0, civs: 2, smoke: 0 },
      "2,3": { facility: "fightpost", grain: 0, civs: 0, smoke: 0 },
      "2,2": { facility: "vent", grain: 0, civs: 0, smoke: 2 },
    },
    edges: {
      "3,2|3,3": { door: null },
      "2,3|3,3": { door: "closed" },
      "2,2|2,3": { door: null },
    },
    entrances: {
      "3,2": { conceal: 3, expose: 4, known: false, sealed: false },
      "2,3": { conceal: 3, expose: 9, known: true, sealed: false },
    },
    vents: { "2,2": { expose: 2, known: false, smoked: true } },
    digs: { d1: { kind: "segment", at: "3,3", edge: "3,3|3,4", need: 2, progress: 1 } },
  },
  units: {
    u1: { id: "u1", side: "ally", type: "militia", hp: 3, mp: 2, acted: false, layer: "surface",
          pos: "3,2", stance: "normal", breath: 0, revealed: false, columnId: null },
    u2: { id: "u2", side: "ally", type: "guerrilla", hp: 4, mp: 3, acted: false, layer: "under",
          pos: "2,3", stance: "ambush", breath: 1, revealed: false, columnId: null },
    u3: { id: "u3", side: "ally", type: "runner", hp: 2, mp: 4, acted: true, layer: "surface",
          pos: "3,1", stance: "hidden", breath: 0, revealed: false, columnId: null },
    e1: { id: "e1", side: "enemy", type: "inf", hp: 4, mp: 2, acted: false, layer: "surface",
          pos: "5,2", stance: "normal", breath: 0, revealed: false, columnId: "c1" },
    e2: { id: "e2", side: "enemy", type: "inf", hp: 1, mp: 2, acted: false, layer: "surface",
          pos: "4,2", stance: "normal", breath: 0, revealed: false, columnId: "c1" },
    e3: { id: "e3", side: "enemy", type: "puppet", hp: 3, mp: 2, acted: false, layer: "surface",
          pos: "5,1", stance: "normal", breath: 0, revealed: false, columnId: "c1" },
  },
  resources: { ammo: 5 },
  enemy: {
    columns: [
      { id: "c1", unitIds: ["e1", "e2", "e3"], role: "march", route: ["5,2", "4,2", "3,2"],
        routeIndex: 1, targetVillage: "v1", caution: 1, cautionTurns: 1, regroupTurns: 0, opInProgress: null },
    ],
    sightings: [{ pos: "2,3", turn: 5, confidence: 2 }],
    pendingOps: [{ kind: "seal", at: "2,3", turnsLeft: 1 }],
    memory: { ambushedVillages: [] },
  },
  wounded: { atVillage: {}, inCells: {}, delivered: 0 },
  ledger: { civCaptured: 0, civDead: 0, housesBurned: 0, grainSeized: 2 },
  score: { kills: { inf: 0, puppet: 1, spy: 0, sapper: 0 }, withdrewEarlyTurns: 0 },
  log: [
    { turn: 5, kind: "ambush", text: "坟地伏击：伪军队被歼", hex: "2,3", layer: "surface", visible: true },
    { turn: 6, kind: "telegraph", text: "敌军集结，准备封堵坟地入口", hex: "2,3", layer: "surface", visible: true },
  ],
  medals: null,
  result: null,
};
