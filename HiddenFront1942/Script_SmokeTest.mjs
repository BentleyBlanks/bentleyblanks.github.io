import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  difficultyDefinitions,
  gameConfig,
  historicalSources,
  historicalTerms,
  phaseDefinitions,
} from "./Data_History.mjs";
import {
  AdvanceGame,
  buildingDefinitions,
  CheckInvariants,
  CreateGameState,
  DeserializeGame,
  FindPath,
  GetBuildPreview,
  GetCampaignScore,
  GetMetric,
  GetObjectiveStatuses,
  GetPopulation,
  GetTile,
  GetTileAtWorld,
  IssueBuildCommand,
  IssueGatherCommand,
  IssueMoveCommand,
  IssueSabotageCommand,
  PlaceBuilding,
  QueueTraining,
  SerializeGame,
  unitDefinitions,
  worldConfig,
} from "./Script_Rules.mjs";

const currentDirectory = dirname(fileURLToPath(import.meta.url));

function AssertValid(state, label) {
  const check = CheckInvariants(state);
  assert.equal(check.valid, true, `${label}: ${check.errors.join(" | ")}`);
  for (const value of Object.values(state.resources)) assert.ok(Number.isFinite(value) && value >= 0, `${label}: invalid resource`);
  for (const unit of state.units) {
    for (const key of ["x", "y", "health", "maxHealth", "morale", "maxMorale"]) assert.ok(Number.isFinite(unit[key]), `${label}: ${unit.id}.${key}`);
  }
}

function Step(state, seconds, step = 0.1) {
  const iterations = Math.ceil(seconds / step);
  for (let index = 0; index < iterations; index += 1) AdvanceGame(state, step);
  return state;
}

function DisableEnemyPressure(state) {
  state.units.filter((unit) => unit.side === "enemy").forEach((unit) => { unit.alive = false; });
  state.sites.filter((site) => site.type === "garrison").forEach((site) => { site.spawnTimer = 99999; });
}

function FindBuildLocation(state, type, minimumX = 3, minimumY = 3) {
  for (let tileY = minimumY; tileY < worldConfig.mapHeight - 2; tileY += 1) {
    for (let tileX = minimumX; tileX < worldConfig.mapWidth - 2; tileX += 1) {
      const worldX = (tileX + 0.5) * worldConfig.tileSize;
      const worldY = (tileY + 0.5) * worldConfig.tileSize;
      const preview = GetBuildPreview(state, type, worldX, worldY);
      if (preview.valid) return { worldX, worldY };
    }
  }
  throw new Error(`No build location for ${type}`);
}

function TestDefinitions() {
  assert.equal(gameConfig.id, "hiddenFront1942");
  assert.deepEqual(gameConfig.estimatedMinutes, [60, 100]);
  assert.match(gameConfig.playerRole, /虚构/);
  assert.match(gameConfig.historyBoundary, /不会改写/);
  assert.match(gameConfig.respectNote, /不以击杀计分/);
  assert.deepEqual(Object.keys(difficultyDefinitions), ["story", "standard", "pressure"]);
  assert.equal(phaseDefinitions.length, 5);
  assert.deepEqual(phaseDefinitions.map((phase) => phase.id), ["foothold", "network", "breakBlockade", "counterSweep", "withdrawal"]);
  assert.ok(phaseDefinitions.every((phase) => phase.objectives.length >= 3));
  assert.equal(historicalSources.length >= 4, true);
  assert.ok(historicalSources.every((source) => /^https:\/\//.test(source.url) && source.organization && source.usedFor));
  assert.ok(historicalTerms.some((item) => item.term.includes("扫荡")));
  assert.deepEqual(Object.keys(unitDefinitions), ["work", "scout", "militia", "guerrilla", "enemyPatrol", "enemySquad"]);
  assert.deepEqual(Object.keys(buildingDefinitions), ["headquarters", "granary", "workshop", "shelter", "clinic", "watchpost"]);
  assert.equal(worldConfig.mapWidth * worldConfig.mapHeight, 2016);
  assert.ok(Object.values(unitDefinitions).every((definition) => definition.name && definition.glyph && definition.maxHealth > 0));
  assert.ok(Object.values(buildingDefinitions).every((definition) => definition.name && definition.glyph && definition.maxHealth > 0));
}

function TestInitialStateAndMap() {
  const state = CreateGameState({ seed: 19420501, difficultyId: "standard" });
  AssertValid(state, "initial state");
  assert.equal(state.phaseIndex, 0);
  assert.equal(state.units.filter((unit) => unit.side === "player" && unit.type === "work").length, 4);
  assert.equal(state.buildings.filter((building) => building.type === "headquarters").length, 1);
  assert.equal(state.villages.length, 3);
  assert.equal(state.sites.length, 5);
  assert.ok(state.nodes.length >= 10);
  assert.ok(state.explored.some(Boolean));
  assert.ok(state.visible.some(Boolean));
  assert.equal(GetTile(state, -1, 0), null);
  assert.equal(GetTile(state, 0, 0).tileX, 0);
  assert.ok(state.tiles.some((tile) => tile.terrain === "water"));
  assert.ok(state.tiles.some((tile) => tile.terrain === "bridge"));
  assert.ok(state.tiles.some((tile) => tile.terrain === "rail"));
  const headquarters = state.buildings.find((building) => building.type === "headquarters");
  const path = FindPath(state, headquarters.x, headquarters.y, state.exitZone.x, state.exitZone.y);
  assert.ok(path.length > 0, "headquarters must connect to extraction zone");
  const population = GetPopulation(state);
  assert.deepEqual(population, { used: 8, capacity: 10 });
}

function TestDeterminismAndSerialization() {
  const left = CreateGameState({ seed: 42, difficultyId: "story" });
  const right = CreateGameState({ seed: 42, difficultyId: "story" });
  assert.equal(SerializeGame(left), SerializeGame(right));
  const restored = DeserializeGame(SerializeGame(left));
  assert.deepEqual(restored, left);
  restored.resources.grain += 1;
  assert.notEqual(restored.resources.grain, left.resources.grain);
  assert.throws(() => DeserializeGame("not json"), /无法解析/);
  const wrongVersion = JSON.parse(SerializeGame(left));
  wrongVersion.saveVersion = 999;
  assert.throws(() => DeserializeGame(JSON.stringify(wrongVersion)), /版本/);

  const leftWorkers = left.units.filter((unit) => unit.side === "player").map((unit) => unit.id);
  const rightWorkers = right.units.filter((unit) => unit.side === "player").map((unit) => unit.id);
  IssueMoveCommand(left, leftWorkers, 420, 510);
  IssueMoveCommand(right, rightWorkers, 420, 510);
  Step(left, 18);
  Step(right, 18);
  assert.equal(SerializeGame(left), SerializeGame(right), "same seed and commands must remain deterministic");
}

function TestEconomyBuildingAndTraining() {
  const state = CreateGameState({ seed: 55, difficultyId: "story" });
  state.units.filter((unit) => unit.side === "enemy").forEach((unit) => { unit.alive = false; });
  state.sites.filter((site) => site.type === "garrison").forEach((site) => { site.spawnTimer = 99999; });
  const workers = state.units.filter((unit) => unit.side === "player" && unit.type === "work");
  const field = state.nodes.find((node) => node.type === "field");
  const grainBefore = state.resources.grain;
  assert.equal(IssueGatherCommand(state, workers.slice(0, 2).map((unit) => unit.id), field.id).valid, true);
  Step(state, 120);
  assert.ok(state.resources.grain > grainBefore + 40, "workers must gather grain over time");
  assert.ok(state.statistics.grainGathered > 40);

  state.resources.grain = 2000;
  state.resources.timber = 2000;
  state.resources.materiel = 2000;
  state.resources.intel = 2000;
  const granaryPoint = FindBuildLocation(state, "granary");
  const placedGranary = PlaceBuilding(state, "granary", granaryPoint.worldX, granaryPoint.worldY, workers.map((unit) => unit.id));
  assert.equal(placedGranary.valid, true);
  Step(state, 110);
  assert.equal(placedGranary.building.completed, true);
  assert.ok(GetPopulation(state).capacity >= 18);

  const workshopPoint = FindBuildLocation(state, "workshop", 12, 7);
  const placedWorkshop = PlaceBuilding(state, "workshop", workshopPoint.worldX, workshopPoint.worldY, workers.map((unit) => unit.id));
  assert.equal(placedWorkshop.valid, true);
  Step(state, 140);
  assert.equal(placedWorkshop.building.completed, true);
  const militiaCountBefore = state.units.filter((unit) => unit.alive && unit.type === "militia").length;
  assert.equal(QueueTraining(state, placedWorkshop.building.id, "militia").valid, true);
  Step(state, unitDefinitions.militia.trainSeconds + 2);
  assert.equal(state.units.filter((unit) => unit.alive && unit.type === "militia").length, militiaCountBefore + 1);
  AssertValid(state, "economy/build/training");
}

function TestVillageContactAndSabotage() {
  const state = CreateGameState({ seed: 77, difficultyId: "story" });
  state.units.filter((unit) => unit.side === "enemy").forEach((unit) => { unit.alive = false; });
  state.sites.filter((site) => site.type === "garrison").forEach((site) => { site.spawnTimer = 99999; });
  state.resources.grain = 3000;
  state.resources.timber = 3000;
  state.resources.materiel = 3000;
  state.resources.intel = 3000;
  const headquarters = state.buildings.find((building) => building.type === "headquarters");
  assert.equal(QueueTraining(state, headquarters.id, "scout").valid, true);
  Step(state, unitDefinitions.scout.trainSeconds + 2);
  const scout = state.units.find((unit) => unit.alive && unit.type === "scout");
  assert.ok(scout);
  const village = state.villages[0];
  scout.x = village.x;
  scout.y = village.y;
  Step(state, 0.2);
  assert.equal(village.contacted, true);
  assert.equal(state.statistics.villagesContacted, 1);

  state.phaseIndex = 2;
  const workers = state.units.filter((unit) => unit.alive && unit.type === "work");
  const workshopPoint = FindBuildLocation(state, "workshop", 12, 7);
  const workshop = PlaceBuilding(state, "workshop", workshopPoint.worldX, workshopPoint.worldY, workers.map((unit) => unit.id));
  Step(state, 140);
  assert.equal(workshop.building.completed, true);
  const granaryPoint = FindBuildLocation(state, "granary", 8, 6);
  const granary = PlaceBuilding(state, "granary", granaryPoint.worldX, granaryPoint.worldY, workers.map((unit) => unit.id));
  Step(state, 110);
  assert.equal(granary.building.completed, true);
  assert.equal(QueueTraining(state, workshop.building.id, "guerrilla").valid, true);
  Step(state, unitDefinitions.guerrilla.trainSeconds + 2);
  const guerrilla = state.units.find((unit) => unit.alive && unit.type === "guerrilla");
  assert.ok(guerrilla);
  const site = state.sites.find((candidate) => candidate.type === "checkpoint");
  guerrilla.x = site.x - 22;
  guerrilla.y = site.y;
  assert.equal(IssueSabotageCommand(state, [guerrilla.id], site.id).valid, true);
  Step(state, 40);
  assert.equal(site.sabotaged, true);
  assert.equal(state.statistics.sitesSabotaged, 1);
  assert.match(state.eventLog[0].text, /立即离开/);
  AssertValid(state, "village/sabotage");
}

function TestPathingAndQueuedCommands() {
  const state = CreateGameState({ seed: 120, difficultyId: "story" });
  DisableEnemyPressure(state);
  const worker = state.units.find((unit) => unit.alive && unit.type === "work");
  const waterTile = state.tiles.find((tile) => tile.terrain === "water" && [
    [1, 0], [-1, 0], [0, 1], [0, -1],
  ].some(([offsetX, offsetY]) => GetTile(state, tile.tileX + offsetX, tile.tileY + offsetY)?.passable));
  const waterX = (waterTile.tileX + 0.5) * worldConfig.tileSize;
  const waterY = (waterTile.tileY + 0.5) * worldConfig.tileSize;
  const adjustedPath = FindPath(state, worker.x, worker.y, waterX, waterY);
  assert.ok(adjustedPath.length > 0);
  const adjustedDestination = adjustedPath.at(-1);
  assert.equal(GetTileAtWorld(state, adjustedDestination.x, adjustedDestination.y).passable, true, "water clicks must resolve to land");
  assert.equal(IssueMoveCommand(state, [worker.id], waterX, waterY).valid, true);
  Step(state, 180);
  assert.equal(worker.order.type, "idle");
  assert.equal(GetTileAtWorld(state, worker.x, worker.y).passable, true);

  const firstPoint = state.nodes.find((node) => node.id === "fieldWest");
  const secondPoint = state.nodes.find((node) => node.id === "groveBase");
  assert.equal(IssueMoveCommand(state, [worker.id], firstPoint.x, firstPoint.y).valid, true);
  assert.equal(IssueMoveCommand(state, [worker.id], secondPoint.x, secondPoint.y, { queue: true }).valid, true);
  assert.equal(worker.queue.length, 1);
  assert.deepEqual(worker.queue[0].path, [], "queued waypoint paths must be calculated when activated");
  for (let index = 0; index < 2400 && worker.order.x !== secondPoint.x; index += 1) AdvanceGame(state, 0.1);
  assert.equal(worker.order.x, secondPoint.x, "second waypoint must activate");
  assert.ok(worker.path.length > 0);
  assert.ok(Math.hypot(worker.path[0].x - firstPoint.x, worker.path[0].y - firstPoint.y) < 80, "queued path must start from the first waypoint");
  Step(state, 120);
  assert.equal(worker.order.type, "idle");
  assert.ok(Math.hypot(worker.x - secondPoint.x, worker.y - secondPoint.y) < 2);
}

function TestRecoveryAndContinuity() {
  const state = CreateGameState({ seed: 121, difficultyId: "story" });
  DisableEnemyPressure(state);
  Object.assign(state.resources, { grain: 3000, timber: 3000, materiel: 3000, intel: 3000 });
  const workers = state.units.filter((unit) => unit.alive && unit.type === "work");
  const shelterPoint = FindBuildLocation(state, "shelter");
  const shelter = PlaceBuilding(state, "shelter", shelterPoint.worldX, shelterPoint.worldY, [workers[0].id]).building;
  IssueMoveCommand(state, [workers[0].id], state.buildings[0].x, state.buildings[0].y);
  Step(state, 1);
  assert.ok(shelter.progress < 1, "interrupted construction must remain unfinished");
  assert.equal(IssueBuildCommand(state, workers.slice(1).map((unit) => unit.id), shelter.id).valid, true);
  Step(state, 90);
  assert.equal(shelter.completed, true, "another work team must be able to resume construction");

  const village = state.villages[0];
  village.contacted = true;
  village.safety = 82;
  village.pressure = 0;
  shelter.x = village.x;
  shelter.y = village.y;
  state.resources.support = 30;
  Step(state, 120);
  assert.ok(state.resources.support > 30, "a safe sheltered village must gradually restore support");

  const headquarters = state.buildings.find((building) => building.type === "headquarters");
  const militia = workers[0];
  Object.assign(militia, {
    type: "militia",
    x: headquarters.x,
    y: headquarters.y,
    health: unitDefinitions.militia.maxHealth,
    maxHealth: unitDefinitions.militia.maxHealth,
    morale: 0,
    maxMorale: unitDefinitions.militia.maxMorale,
    order: { type: "idle" },
    path: [],
  });
  const eventSerialBefore = state.messageSerial;
  Step(state, 10);
  const retreatEvents = state.eventLog.filter((event) => event.id > `event${eventSerialBefore}` && event.title.includes("正在脱离"));
  assert.ok(retreatEvents.length <= 1, "low morale must not emit an event every frame");
  Step(state, 60);
  assert.equal(militia.retreatingForMorale, false);

  const workerLossState = CreateGameState({ seed: 122, difficultyId: "story" });
  DisableEnemyPressure(workerLossState);
  workerLossState.units.filter((unit) => unit.side === "player" && unit.type === "work").forEach((unit) => { unit.alive = false; });
  Step(workerLossState, 0.2);
  const emergencyWorker = workerLossState.units.find((unit) => unit.alive && unit.type === "work");
  assert.ok(emergencyWorker?.populationExempt, "one emergency work team must prevent an economy soft lock");
  emergencyWorker.alive = false;
  Step(workerLossState, 0.2);
  assert.equal(workerLossState.status, "lost", "repeated total worker loss must end clearly instead of soft locking");
}

function TestTrainingAndArchiveRecovery() {
  const state = CreateGameState({ seed: 123, difficultyId: "story" });
  DisableEnemyPressure(state);
  Object.assign(state.resources, { grain: 3000, timber: 3000, materiel: 3000, intel: 3000 });
  const workers = state.units.filter((unit) => unit.alive && unit.type === "work");
  workers.at(-1).alive = false;
  let riverbankPoint = null;
  for (let tileY = 2; tileY < worldConfig.mapHeight - 2 && !riverbankPoint; tileY += 1) {
    for (let tileX = 2; tileX < worldConfig.mapWidth - 2; tileX += 1) {
      if (GetTile(state, tileX + 1, tileY + 1)?.terrain !== "water") continue;
      const worldX = (tileX + 0.5) * worldConfig.tileSize;
      const worldY = (tileY + 0.5) * worldConfig.tileSize;
      if (GetBuildPreview(state, "workshop", worldX, worldY).valid) {
        riverbankPoint = { worldX, worldY };
        break;
      }
    }
  }
  assert.ok(riverbankPoint, "test map must expose a valid riverbank workshop site");
  const workshop = PlaceBuilding(state, "workshop", riverbankPoint.worldX, riverbankPoint.worldY, [workers[0].id]).building;
  workshop.completed = true;
  workshop.progress = 1;
  workshop.health = workshop.maxHealth;
  const headquarters = state.buildings.find((building) => building.type === "headquarters");
  workshop.rallyPoint = { x: headquarters.x, y: headquarters.y };
  assert.equal(QueueTraining(state, workshop.id, "militia").valid, true);
  Step(state, unitDefinitions.militia.trainSeconds + 2);
  const trainedMilitia = state.units.find((unit) => unit.alive && unit.type === "militia");
  assert.ok(trainedMilitia);
  assert.equal(GetTileAtWorld(state, trainedMilitia.x, trainedMilitia.y).passable, true, "trained units must never spawn into water");

  const archiveState = CreateGameState({ seed: 124, difficultyId: "story" });
  archiveState.phaseIndex = 4;
  archiveState.sites.filter((site) => site.type === "garrison").forEach((site) => { site.spawnTimer = 99999; });
  const carrier = archiveState.units.find((unit) => unit.side === "player" && unit.type === "work");
  Object.assign(carrier, {
    type: "scout",
    carriesArchive: true,
    health: 1,
    maxHealth: unitDefinitions.scout.maxHealth,
    morale: unitDefinitions.scout.maxMorale,
    maxMorale: unitDefinitions.scout.maxMorale,
  });
  archiveState.units.filter((unit) => unit.side === "player" && unit !== carrier).forEach((unit) => {
    unit.x = 260;
    unit.y = 260;
  });
  const attacker = archiveState.units.find((unit) => unit.side === "enemy");
  archiveState.units.filter((unit) => unit.side === "enemy" && unit !== attacker).forEach((unit) => { unit.alive = false; });
  attacker.x = carrier.x + 8;
  attacker.y = carrier.y;
  attacker.attackTimer = 0;
  attacker.order = { type: "attack", targetId: carrier.id };
  AdvanceGame(archiveState, 0.1);
  assert.equal(carrier.alive, false);
  const replacement = archiveState.units.find((unit) => unit.alive && unit.type === "scout" && unit.carriesArchive);
  assert.ok(replacement?.populationExempt, "the final archive must receive one capacity-safe emergency courier");
  assert.ok(GetPopulation(archiveState).used <= GetPopulation(archiveState).capacity);
}

function TestObjectivesAndScore() {
  const state = CreateGameState({ seed: 88, difficultyId: "standard" });
  const objectives = GetObjectiveStatuses(state);
  assert.equal(objectives.length, 4);
  assert.ok(objectives.every((objective) => Number.isFinite(objective.value) && objective.ratio >= 0 && objective.ratio <= 1));
  assert.equal(GetMetric(state, "headquartersAlive"), 1);
  const score = GetCampaignScore(state);
  assert.ok(score.total >= 0 && score.total <= 100);
  assert.deepEqual(Object.keys(score.components), ["civilians", "network", "forces", "restraint"]);
  assert.equal(score.nationalOutcomeFixed, true);
  assert.match(score.nationalOutcome, /1945年/);
  assert.doesNotMatch(JSON.stringify(score), /击杀|歼敌/);
}

function TestCampaignProgression() {
  const state = CreateGameState({ seed: 99, difficultyId: "story" });
  state.units.filter((unit) => unit.side === "enemy").forEach((unit) => { unit.alive = false; });
  state.sites.filter((site) => site.type === "garrison").forEach((site) => { site.spawnTimer = 99999; });
  const headquarters = state.buildings.find((building) => building.type === "headquarters");
  const AddCompletedBuilding = (id, type, tileX, tileY) => {
    state.buildings.push({
      ...headquarters,
      id,
      type,
      tileX,
      tileY,
      x: (tileX + 0.5) * worldConfig.tileSize,
      y: (tileY + 0.5) * worldConfig.tileSize,
      health: buildingDefinitions[type].maxHealth,
      maxHealth: buildingDefinitions[type].maxHealth,
      progress: 1,
      completed: true,
      queue: [],
      rallyPoint: { x: (tileX + 0.5) * worldConfig.tileSize, y: (tileY + 0.5) * worldConfig.tileSize },
    });
  };
  AddCompletedBuilding("testGranary", "granary", 11, 27);
  AddCompletedBuilding("testWorkshop", "workshop", 12, 28);
  state.statistics.grainGathered = 300;
  state.statistics.timberGathered = 300;
  Step(state, 3);
  assert.equal(state.phaseIndex, 1, "foothold objectives should advance to network phase");

  state.villages.forEach((village) => {
    village.contacted = true;
    village.safety = 90;
    village.protectedCivilians = village.population;
  });
  state.statistics.villagesContacted = 3;
  state.statistics.protectedCivilians = 103;
  state.units[0].type = "scout";
  state.units[0].maxHealth = unitDefinitions.scout.maxHealth;
  state.units[0].health = unitDefinitions.scout.maxHealth;
  state.units[0].maxMorale = unitDefinitions.scout.maxMorale;
  state.units[0].morale = unitDefinitions.scout.maxMorale;
  AddCompletedBuilding("testShelterA", "shelter", 14, 21);
  AddCompletedBuilding("testShelterB", "shelter", 34, 27);
  AddCompletedBuilding("testShelterC", "shelter", 40, 13);
  state.resources.support = 80;
  Step(state, 3);
  assert.equal(state.phaseIndex, 2, "network objectives should advance to break blockade phase");

  state.resources.intel = 100;
  state.statistics.sitesSabotaged = 2;
  state.units.slice(1, 4).forEach((unit) => {
    unit.type = "militia";
    unit.maxHealth = unitDefinitions.militia.maxHealth;
    unit.health = unitDefinitions.militia.maxHealth;
    unit.maxMorale = unitDefinitions.militia.maxMorale;
    unit.morale = unitDefinitions.militia.maxMorale;
  });
  Step(state, 3);
  assert.equal(state.phaseIndex, 3, "break blockade objectives should advance to sweep phase");

  state.sweepSeconds = worldConfig.sweepDurationSeconds;
  state.statistics.protectedCivilians = 103;
  state.resources.support = 75;
  Step(state, 3);
  assert.equal(state.phaseIndex, 4, "sweep objectives should advance to withdrawal phase");
  const courier = state.units.find((unit) => unit.alive && unit.type === "scout" && unit.carriesArchive);
  assert.ok(courier, "withdrawal phase must prepare an archive courier");
  courier.x = state.exitZone.x;
  courier.y = state.exitZone.y;
  Step(state, 3);
  assert.equal(state.status, "won", "courier reaching exit with network intact should win");
  AssertValid(state, "completed campaign");
}

function TestLongRunningSimulation() {
  const startTime = Date.now();
  let totalUnits = 0;
  for (let seed = 1; seed <= 20; seed += 1) {
    const state = CreateGameState({ seed, difficultyId: seed % 3 === 0 ? "pressure" : "standard" });
    const workers = state.units.filter((unit) => unit.side === "player" && unit.type === "work");
    const node = state.nodes[seed % state.nodes.length];
    if (node.type === "field" || node.type === "grove" || node.type === "salvage" || node.type === "contact") {
      IssueGatherCommand(state, [workers[0].id], node.id);
    }
    const destinationX = 180 + (seed % 8) * 120;
    const destinationY = 180 + (seed % 5) * 120;
    IssueMoveCommand(state, workers.slice(1).map((unit) => unit.id), destinationX, destinationY);
    Step(state, 180);
    AssertValid(state, `simulation seed ${seed}`);
    totalUnits += state.units.length;
  }
  return { elapsedMilliseconds: Date.now() - startTime, totalUnits };
}

function TestStaticPageContract() {
  const html = readFileSync(join(currentDirectory, "index.html"), "utf8");
  const css = readFileSync(join(currentDirectory, "Style_Game.css"), "utf8");
  const gameScript = readFileSync(join(currentDirectory, "Script_Game.mjs"), "utf8");
  assert.match(html, /lang="zh-CN"/);
  assert.match(html, /Script_Game\.mjs/);
  assert.match(html, /Style_Game\.css/);
  assert.match(html, /约 60–100 分钟/);
  assert.match(html, /全民族抗战/);
  assert.match(html, /群众安全先于歼敌数字/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /pointer: coarse/);
  assert.match(css, /modalLayer\.blocking/);
  assert.match(gameScript, /localStorage/);
  assert.match(gameScript, /requestAnimationFrame/);
  assert.match(gameScript, /pointerdown/);
  assert.match(gameScript, /visibilitychange/);
}

function RunSmokeTest() {
  TestDefinitions();
  TestInitialStateAndMap();
  TestDeterminismAndSerialization();
  TestEconomyBuildingAndTraining();
  TestVillageContactAndSabotage();
  TestPathingAndQueuedCommands();
  TestRecoveryAndContinuity();
  TestTrainingAndArchiveRecovery();
  TestObjectivesAndScore();
  TestCampaignProgression();
  const simulation = TestLongRunningSimulation();
  TestStaticPageContract();
  console.log("HiddenFront1942 smoke test passed.");
  console.log(`Validated ${phaseDefinitions.length} phases, ${Object.keys(unitDefinitions).length} unit types, ${Object.keys(buildingDefinitions).length} buildings, and ${historicalSources.length} cited sources.`);
  console.log(`Long simulation: 20 seeds, ${simulation.totalUnits} total entities observed, ${simulation.elapsedMilliseconds} ms.`);
}

RunSmokeTest();
