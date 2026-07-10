import assert from "node:assert/strict";
import {
  CFG, POSTS, VILLAGES, DOCTRINES, CHAPTERS, SUPPLY_PATHS,
  createGame, invariantChecks, tileAt, getVillage, getPost, getUnit, neighbors,
  hexDistance, dateLabel, visibleKeys, shortestPath, moveUnit,
  hardenVillage, evacuateVillage, establishBlockade, layMine, cutRoad,
  gatherIntel, propaganda, postMetric, computeSiege, raidPost,
  changeDoctrine, objectiveStatus, serializeGame, deserializeGame, endTurn,
} from "./rules.mjs";

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };

// 1. Fixed strategic geography remains valid across deterministic terrain seeds.
for (let seed = 1; seed <= 160; seed++) {
  const state = createGame(seed);
  check(state.posts.length === POSTS.length, `seed ${seed}: four occupation posts`);
  check(state.villages.length === VILLAGES.length, `seed ${seed}: village ring intact`);
  check(invariantChecks(state).length === 0, `seed ${seed}: initial invariants`);
  check(tileAt(state, CFG.gate.q, CFG.gate.r).road, `seed ${seed}: supply gate on road`);
  check(SUPPLY_PATHS.town.every(([q,r]) => tileAt(state,q,r).road), `seed ${seed}: main supply road continuous`);
}

// 2. The 60 half-month campaign maps exactly from Nov 1942 through Apr 1945.
check(dateLabel(1) === "1942年11月上半月", "campaign starts in Nov 1942");
check(dateLabel(2) === "1942年11月下半月", "turn cadence is half-monthly");
check(dateLabel(60) === "1945年4月下半月", "campaign ends in Apr 1945");

// 3. The defining civilian loop is ordered: harden, then evacuate, with a real refuge burden.
{
  const state = createGame(194211), work = getUnit(state,"work-1"), village = getVillage(state,"guodao");
  work.q=village.q;work.r=village.r;
  const orgBefore=state.org;
  const harden=hardenVillage(state,village.id,work.id);
  check(harden.ok && village.mode === "hidden" && village.cache >= 6, "work team hardens and caches a village");
  check(state.org === orgBefore - 2, "harden has an organization cost");
  work.acted=false;work.mp=3;
  const evacuate=evacuateVillage(state,village.id,work.id);
  check(evacuate.ok && village.mode === "evacuated", "hardened village can evacuate");
  check(state.refugePop === village.pop, "evacuated households appear in refuge ledger");
  check(invariantChecks(state).length === 0, "civilian transition preserves population ledger");
}

// 4. Evacuating without first caching remains possible, but leaves less hidden food.
{
  const state=createGame(2),work=getUnit(state,"work-1"),v=getVillage(state,"guodao");work.q=v.q;work.r=v.r;
  const result=evacuateVillage(state,v.id,work.id);
  check(result.ok,"emergency evacuation is allowed");
  check(v.cache===2,"emergency evacuation has a weaker cache outcome");
}

// 5. Full-strength posts reject direct assaults; isolated posts allow limited raids.
{
  const state=createGame(3),militia=getUnit(state,"militia-1"),town=getPost(state,"town");
  const adjacent=neighbors(town.q,town.r)[0];militia.q=adjacent[0];militia.r=adjacent[1];
  const refused=raidPost(state,militia.id,town.id);
  check(!refused.ok && refused.reason.includes("强攻"),"intact county town rejects brute-force assault");
  town.supply=30;militia.acted=false;militia.mp=3;
  const raided=raidPost(state,militia.id,town.id);
  check(raided.ok && town.garrison<town.initialGarrison,"weakened post permits a raid");
  check(state.stats.raids===1,"raid is tracked as a distinct action");
}

// 6. Blockades, road denial, and empty villages combine into isolation rather than flat combat buffs.
{
  const state=createGame(4),post=getPost(state,"zhongyu");
  for(const [q,r] of neighbors(post.q,post.r).slice(0,2))tileAt(state,q,r).blockade={postId:post.id,strength:1,turn:1};
  for(const [q,r] of SUPPLY_PATHS.zhongyu)tileAt(state,q,r).roadCut=3;
  for(const village of state.villages.filter(v=>hexDistance(v.q,v.r,post.q,post.r)<=2)){village.mode='evacuated';state.refugePop+=village.pop;}
  const metric=postMetric(state,post);
  check(metric.blockades===2,"adjacent blockade posts are counted");
  check(!metric.roadConnected,"a cut anywhere upstream severs the post road");
  check(metric.isolation>=4,"multiple strategic layers create high isolation");
  check(invariantChecks(state).length===0,"combined encirclement state remains valid");
}

// 7. Player action functions enforce unit roles and material costs.
{
  const state=createGame(5),mine=getUnit(state,"mine-1"),work=getUnit(state,"work-1"),post=getPost(state,"yanzhai");
  const road=SUPPLY_PATHS.yanzhai.at(-2);mine.q=road[0];mine.r=road[1];
  const material=state.material,laid=layMine(state,mine.id);
  check(laid.ok && tileAt(state,mine.q,mine.r).mine===2,"mine team lays a two-charge field");
  check(state.material===material-2,"minefield consumes materials outside mine doctrine");
  work.q=neighbors(post.q,post.r)[0][0];work.r=neighbors(post.q,post.r)[0][1];
  const blocked=establishBlockade(state,work.id,post.id);
  check(blocked.ok && tileAt(state,work.q,work.r).blockade.postId===post.id,"work team establishes a post-specific blockade");
}

// 8. Doctrine switches are horizontal choices with cost and cooldown.
{
  const state=createGame(6),org=state.org;
  const first=changeDoctrine(state,"mines"),second=changeDoctrine(state,"sparrow");
  check(first.ok&&state.doctrine==='mines',"doctrine switch succeeds");
  check(state.org===org-5,"doctrine switch consumes organization");
  check(!second.ok&&state.doctrineCooldown===4,"cooldown prevents doctrine stacking");
  check(Object.keys(DOCTRINES).length===5,"five mutually exclusive strategies exist");
}

// 9. Mine doctrine changes the action economy, not a hidden percentage only.
{
  const state=createGame(7);state.doctrine='mines';
  const mine=getUnit(state,'mine-1'),road=SUPPLY_PATHS.town[1];mine.q=road[0];mine.r=road[1];
  const material=state.material,result=layMine(state,mine.id);
  check(result.ok&&result.charges===3,"mine doctrine creates an extra fuse");
  check(state.material===material-1,"mine doctrine visibly halves material cost");
}

// 10. Convoys are physical map units: successive minefields can destroy them before arrival.
{
  const state=createGame(8);state.enemyIntent={kind:'supply',name:'test',detail:'test',turns:4};
  tileAt(state,9,1).mine=1;tileAt(state,8,2).mine=1;
  endTurn(state);
  check(state.units.some(u=>u.type==='convoy'),"supply intent spawns a convoy at the road gate");
  endTurn(state);
  check(!state.units.some(u=>u.type==='convoy'),"two mine hits stop the convoy on the board");
  check(state.stats.convoysStopped===1&&state.stats.minesTriggered===2,"convoy loss and fuse triggers are recorded");
}

// 11. A cut road visibly holds a convoy at the supply gate.
{
  const state=createGame(9);state.enemyIntent={kind:'supply',name:'test',detail:'test',turns:4};tileAt(state,9,1).roadCut=4;
  endTurn(state);const convoy=state.units.find(u=>u.type==='convoy');
  check(!!convoy,"convoy exists behind the cut");
  check(convoy.q===CFG.gate.q&&convoy.r===CFG.gate.r,"convoy cannot cross a cut road");
}

// 12. Intelligence gathering reveals the whole operational map for two future turns.
{
  const state=createGame(10),courier=getUnit(state,'courier-1'),intel=state.intel;
  const result=gatherIntel(state,courier.id);
  check(result.ok&&state.intel>intel,"courier produces intelligence");
  check(visibleKeys(state).size===CFG.mapW*CFG.mapH,"message network reveals every tile temporarily");
}

// 13. Political pressure lowers resolve and eventually peels personnel away from the post.
{
  const state=createGame(11),work=getUnit(state,'work-1'),post=getPost(state,'yanzhai');
  const adjacent=neighbors(post.q,post.r)[0];work.q=adjacent[0];work.r=adjacent[1];state.intel=30;state.org=30;
  let successes=0;
  for(let i=0;i<3;i++){work.acted=false;work.mp=3;const r=propaganda(state,work.id,post.id);if(r.ok)successes++;}
  check(successes===3,"repeated political contacts resolve");
  check(post.resolve<=post.initialResolve-27,"political pressure makes a large visible resolve change");
  check(state.stats.persuaded>=1&&post.garrison<post.initialGarrison,"accumulated persuasion weakens the garrison");
}

// 14. Enemy behavior responds to what the player built even at zero exposure.
{
  const state=createGame(12);state.exposure=0;state.enemyIntent={kind:'occupy',name:'test',detail:'test',turns:1};
  for(const [q,r] of [[9,1],[8,2],[7,2]])tileAt(state,q,r).mine=2;
  endTurn(state);
  check(state.enemyIntent.kind==='clear',"mine saturation makes the enemy choose road clearing");
  let observed=false;
  for(let i=0;i<4&&!state.over;i++){state.exposure=0;endTurn(state);if(state.units.some(u=>u.side==='enemy'))observed=true;}
  check(observed,"zero exposure does not switch off enemy strategic actions");
}

// 15. Save/load keeps the simulation deterministic, including adaptive enemy behavior.
{
  const state=createGame(1945),clone=deserializeGame(serializeGame(state));
  for(let i=0;i<14&&!state.over&&!clone.over;i++){endTurn(state);endTurn(clone);}
  check(state.turn===clone.turn&&state.rngState===clone.rngState,"save/load preserves deterministic RNG");
  check(JSON.stringify(state.enemyIntent)===JSON.stringify(clone.enemyIntent),"enemy intent remains deterministic after load");
  check(JSON.stringify(state.posts)===JSON.stringify(clone.posts),"post attrition remains deterministic after load");
}

// 16. Every chapter has measurable systemic objectives.
{
  const state=createGame(13);
  for(const chapter of CHAPTERS){const goals=objectiveStatus(state,chapter);check(goals.length===2&&goals.every(g=>Number.isFinite(g.progress)),`${chapter.id}: measurable goals`);}
}

// 17. Multi-turn marching preserves a distant destination like a Civilization-style queued move.
{
  const state=createGame(14),unit=getUnit(state,'courier-1');
  const target={q:10,r:8},path=shortestPath(state,unit,target.q,target.r,99);
  check(path&&path.cost>unit.mp,"test destination exceeds one-turn movement");
  const result=moveUnit(state,unit.id,target.q,target.r);
  check(result.ok&&!result.reached&&unit.route?.q===target.q,"long march stores its destination");
}

// 18. Sustained encirclement can win without a single assault on a post.
{
  const state=createGame(15);state.grain=400;state.org=400;state.material=400;state.will=100;
  for(const village of state.villages){village.mode='evacuated';state.refugePop+=village.pop;}
  for(let i=0;i<CFG.totalTurns&&!state.over;i++){
    for(const [q,r] of SUPPLY_PATHS.town)tileAt(state,q,r).roadCut=5;
    for(const post of state.posts.filter(p=>!p.withdrawn))for(const [q,r] of neighbors(post.q,post.r).slice(0,3))tileAt(state,q,r).blockade={postId:post.id,strength:1,turn:state.turn};
    state.will=100;state.refugeCondition=100;endTurn(state);
  }
  check(state.over&&state.result.kind==='victory',"pure encirclement reaches victory");
  check(state.stats.withdrawn===4,"all occupation posts withdraw");
  check(state.stats.raids===0,"victory required no direct post assault");
}

// 19. Passive campaigns remain valid through their losing terminal state.
for(let seed=200;seed<240;seed++){
  const state=createGame(seed);
  while(!state.over){
    endTurn(state);
    const errors=invariantChecks(state);
    check(errors.length===0,`seed ${seed} turn ${state.turn}: ${errors.join(',')}`);
  }
  check(!!state.result,`seed ${seed}: passive campaign terminates`);
}

// 20. Road-cut action uses the physical tile under the specialist.
{
  const state=createGame(16),work=getUnit(state,'work-1'),road=SUPPLY_PATHS.zhongyu.at(-2);work.q=road[0];work.r=road[1];
  const result=cutRoad(state,work.id);
  check(result.ok&&tileAt(state,road[0],road[1]).roadCut===3,"work team can cut its current road tile");
  check(invariantChecks(state).length===0,"road action preserves invariants");
}

console.log(`PASS ${checks} checks`);
