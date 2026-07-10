import assert from "node:assert/strict";
import {
  CFG, BUILDINGS, POLICIES, TECHS, CHAPTERS,
  createGame, invariantChecks, allVillages, playerVillages, enemyStructures, computeNetwork, neighbors, tileAt,
  startBuild, changePolicy, buyTech, serializeGame, deserializeGame, endTurn, objectiveStatus,
  attackUnit, attemptDefection, shortestPath, moveUnit, suppressionAt, hexDistance,
} from "./rules.mjs";

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };

// 1. Procedural maps remain valid across a useful seed spread.
for (let seed = 1; seed <= 120; seed++) {
  const state = createGame(seed);
  check(allVillages(state).length === CFG.villageCount, `seed ${seed}: village count`);
  check(enemyStructures(state).some(x => x.structure.kind === "town"), `seed ${seed}: town exists`);
  check(invariantChecks(state).length === 0, `seed ${seed}: invariants`);
}

// 2. A nearby liberated village joins the HQ traffic network.
{
  const state = createGame(1941);
  const hq = playerVillages(state)[0];
  const candidate = allVillages(state).find(x => x.village.owner === "neutral");
  const destination = neighbors(hq.q, hq.r).map(([q,r]) => tileAt(state,q,r)).find(t => t && !t.village && !t.structure);
  check(!!destination, "HQ has a neighboring network test tile");
  candidate.tile.village = null; destination.village = candidate.village; candidate.village.owner = "player"; candidate.village.support = 80;
  computeNetwork(state);
  check(state.network.connectedIds.includes(hq.village.id), "HQ is always a network source");
  check(state.network.connectedIds.includes(candidate.village.id), "nearby liberated village joins the network");
}

// 3. A simple work-team heuristic can complete the expansion loop before the May crisis.
{
  const state=createGame(1941); state.org=100; changePolicy(state,"mobilize");
  for(let i=0;i<32&&!state.over;i++){
    const work=state.units.find(u=>u.type==="work"&&u.side==="player");
    if(work){
      const current=tileAt(state,work.q,work.r);
      if(!(current.village&&current.village.owner==="neutral")){
        const targets=allVillages(state).filter(x=>x.village.owner==="neutral"&&suppressionAt(state,x.q,x.r)===0).sort((a,b)=>hexDistance(work.q,work.r,a.q,a.r)-hexDistance(work.q,work.r,b.q,b.r));
        const path=targets[0]&&shortestPath(state,work,targets[0].q,targets[0].r,99);
        if(path?.path[1]) moveUnit(state,work.id,path.path[1][0],path.path[1][1]);
      }
    }
    endTurn(state); const hq=tileAt(state,state.hq.q,state.hq.r).village; hq.owner="player"; hq.support=100;
  }
  check(playerVillages(state).length>=2,"work-team loop can add villages before the main crisis");
  check(state.stats.joined>=1,"expansion is recorded in campaign statistics");
}

// 4. Construction is monthly, respects costs and completes deterministically.
{
  const state = createGame(77); state.grain = 999; state.org = 999;
  const hq = playerVillages(state)[0];
  const result = startBuild(state, hq.village.id, "farm");
  check(result.ok, "farm construction starts");
  for (let i = 0; i < BUILDINGS.farm.months * CFG.turnsPerMonth; i++) endTurn(state);
  check(hq.village.buildings.includes("farm"), "farm completes after monthly settlements");
}

// 5. Policy switching has an opportunity cost and cooldown.
{
  const state = createGame(11); state.org = 100;
  const first = changePolicy(state, "mobilize"), second = changePolicy(state, "mainforce");
  check(first.ok && state.policy === "mobilize", "first policy switch succeeds");
  check(!second.ok, "policy cooldown blocks immediate stacking");
  check(Object.keys(POLICIES).length >= 5, "policy set has horizontal choices");
}

// 6. Technology prerequisites, save determinism, and long passive stability.
{
  const state = createGame(202507); state.org = 999;
  check(!buyTech(state, "counter").ok, "late tech requires prerequisites");
  for (const key of ["network","sabotage","mines","regular","counter"]) {
    const result = buyTech(state, key); check(result.ok, `tech ${key} unlocks in valid order`);
  }
  const clone = deserializeGame(serializeGame(state));
  for (let i = 0; i < 16 && !state.over && !clone.over; i++) { endTurn(state); endTurn(clone); }
  check(state.turn === clone.turn && state.rngState === clone.rngState, "save/load preserves RNG state");
  check(JSON.stringify(state.operation) === JSON.stringify(clone.operation), "enemy operation remains deterministic after load");
}

// 7. Combat and graded defection actions mutate state without violating invariants.
{
  const state = createGame(606); state.org = 100; state.techs.enemywork = true;
  const militia = state.units.find(u => u.type === "militia"), work = state.units.find(u => u.type === "work");
  const enemyTile = neighbors(militia.q,militia.r).map(([q,r])=>tileAt(state,q,r)).find(t=>t&&!t.structure&&!state.units.some(u=>u.q===t.q&&u.r===t.r));
  const puppet = { id:state.nextUnitId++,type:"puppet",side:"enemy",layer:"mil",q:enemyTile.q,r:enemyTile.r,hp:100,mp:2,acted:false,fortified:false,xp:0,level:0,defection:0,wavering:false,name:"伪军小队" };
  state.units.push(puppet);
  const combat = attackUnit(state,militia.id,puppet.id); check(combat.ok,"adjacent combat resolves"); check(invariantChecks(state).length===0,"combat preserves invariants");

  // Recreate a puppet next to the work team and apply two enemy-work contacts.
  const dt = neighbors(work.q,work.r).map(([q,r])=>tileAt(state,q,r)).find(t=>t&&!t.structure&&!state.units.some(u=>u.q===t.q&&u.r===t.r));
  const target = { id:state.nextUnitId++,type:"puppet",side:"enemy",layer:"mil",q:dt.q,r:dt.r,hp:100,mp:2,acted:false,fortified:false,xp:0,level:0,defection:0,wavering:false,name:"伪军小队" };
  state.units.push(target);
  const first=attemptDefection(state,work.id,target.id); work.acted=false; work.mp=2; const second=attemptDefection(state,work.id,target.id);
  check(first.ok&&second.ok,"enemy-work contacts resolve"); check(target.defection>=65||!state.units.includes(target),"defection creates intelligence or surrender outcome");
}

// 8. Enemy operations occur even if exposure is kept at zero.
{
  const state = createGame(888); state.exposure = 0;
  let observed = false;
  for (let i = 0; i < 16 && !state.over; i++) { endTurn(state); state.exposure = 0; if (state.operation) observed = true; }
  check(observed, "low exposure does not remove enemy strategic pressure");
}

// 9. The fixed May 1942 crisis is scheduled even if another operation was active.
{
  const state=createGame(1942); state.exposure=0;
  while(state.turn<=CFG.bigSweepTurn&&!state.over){endTurn(state); const hq=tileAt(state,state.hq.q,state.hq.r).village; hq.support=100; hq.owner="player";}
  check(state.stats.bigSweepTriggered,"May sweep was triggered");
  check(state.stats.bigSweepsSurvived>0||state.operation?.big,"May sweep reached active or completed state");
}

// 10. Full passive campaigns never corrupt state even when the player loses.
for (let seed = 300; seed < 330; seed++) {
  const state = createGame(seed);
  for (let i = 0; i <= CFG.totalTurns + 5 && !state.over; i++) {
    endTurn(state);
    const errors = invariantChecks(state);
    check(errors.length === 0, `seed ${seed} turn ${state.turn}: ${errors.join(",")}`);
  }
  check(!!state.result, `seed ${seed}: passive campaign reaches a terminal result`);
}

// 11. Every campaign chapter exposes measurable objectives.
{
  const state = createGame(42);
  for (const chapter of CHAPTERS) {
    const goals = objectiveStatus(state, chapter);
    check(goals.length >= 2 && goals.every(x => Number.isFinite(x.progress)), `${chapter.id}: measurable goals`);
  }
  check(Object.keys(TECHS).length >= 8, "strategic progression remains broad enough for a campaign");
}

console.log(`PASS ${checks} checks`);
