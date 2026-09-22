import assert from 'node:assert/strict';
import { SquadMarch,ValidateSquadMarchConfig } from './Script_SquadMarch.mjs';

function Simulation(count=6,seed=17,extra={}){
  const march=new SquadMarch({count,seed,route:[{x:0,z:0},{x:0,z:-500}],...extra});
  const observations=[...march.members.values()].map(m=>({id:m.id,position:{...m.route[0]},yaw:0,speedMps:0,alive:true,canPause:true}));
  const Tick=(dt=1/60,context={})=>{
    const output=march.Update(dt,observations,context);
    if(context.paused)return output;
    for(const o of observations){
      const command=output.get(o.id);if(!command.controlled)continue;
      const dx=command.goal.x-o.position.x,dz=command.goal.z-o.position.z,d=Math.hypot(dx,dz);
      const step=Math.min(d,command.speedMps*dt);
      assert.ok(step<=8*dt,'no teleport or exceptional catchup speed');
      if(d){o.position.x+=dx/d*step;o.position.z+=dz/d*step;
        const delta=Math.atan2(Math.sin(Math.atan2(-dx,-dz)-o.yaw),Math.cos(Math.atan2(-dx,-dz)-o.yaw));
        o.yaw+=Math.max(-3.6*dt,Math.min(3.6*dt,delta));}
      o.speedMps=command.speedMps;
      if(command.status==='resting'||command.status==='pausing'||command.status==='starting')assert.equal(o.speedMps,0,'rest means a real stop');
    }
    return output;
  };
  const Run=seconds=>{for(let i=0;i<seconds*60;i++)Tick();};
  return {march,observations,Tick,Run};
}
// Mean pairwise correlation of follower speed traces: 1 means the column moves in lockstep.
function SpeedCorrelation(sim,seconds){
  const traces=new Map([...sim.march.members.values()].filter(m=>!m.leader).map(m=>[m.id,[]]));
  for(let i=0;i<seconds*60;i++){const output=sim.Tick();if(i%30===0)for(const [id,trace] of traces)trace.push(output.get(id).speedMps);}
  const series=[...traces.values()],pairs=[];
  for(let a=0;a<series.length;a++)for(let b=a+1;b<series.length;b++){
    const x=series[a],y=series[b],mx=x.reduce((p,q)=>p+q,0)/x.length,my=y.reduce((p,q)=>p+q,0)/y.length;
    let xy=0,xx=0,yy=0;for(let k=0;k<x.length;k++){xy+=(x[k]-mx)*(y[k]-my);xx+=(x[k]-mx)**2;yy+=(y[k]-my)**2;}
    pairs.push(xx&&yy?xy/Math.sqrt(xx*yy):1);
  }
  return pairs.reduce((p,q)=>p+q,0)/pairs.length;
}

for(const count of [1,3,6,9,12,24]){
  const sim=Simulation(count);sim.Run(90);
  const members=[...sim.march.members.values()];
  assert.equal(members[0].cycles,0,'leader does not perform optional rest');
  assert.ok(members.slice(1).every(m=>m.cycles>=3),`${count}: every ordinary member completes several cycles`);
  assert.ok(sim.observations.every(o=>o.position.z<-80),`${count}: the entire squad advances`);
  const stops=sim.march.events.filter(e=>e.type==='brake');
  assert.ok(stops.every(e=>e.id!==members[0].id));
  console.log(`ok ${count} people: shared route, completed personal cycles, steady leader, actual movement`);
}
const a=Simulation(),b=Simulation();a.Run(20);b.Run(20);
assert.deepEqual(a.march.Snapshot(),b.march.Snapshot(),'seeded replay is deterministic');
const other=Simulation(6,91);other.Run(20);assert.notDeepEqual(a.march.events,other.march.events,'different seed changes behavior');
const frozen=a.march.Snapshot();a.Tick(1/60,{paused:true});assert.deepEqual(a.march.Snapshot(),frozen,'pause retains individual clocks');
const remembered=a.march.members.get('Member2').runLeft;
const recruit=a.march.AddMember('Reinforcement');
assert.equal(a.march.members.get('Member2').runLeft,remembered,'joining does not reset the squad clocks');
assert.equal(recruit.cycles,0);a.march.RemoveMember('Reinforcement');assert.equal(a.march.members.size,6);
const rest=a.observations[2];rest.busy=true;a.Tick();assert.equal(a.march.outputs.get(rest.id).controlled,false,'combat releases movement');
rest.busy=false;rest.alive=false;a.Tick();assert.equal(a.march.outputs.get(rest.id).status,'dead');
const leader=a.observations[1];a.march.SetLeader(leader.id);const before=a.march.time;a.Run(5);
assert.ok(!a.march.events.some(e=>e.id===leader.id&&e.type==='brake'&&e.time>before),'new leader inherits role exception');
leader.alive=false;a.Tick();assert.ok([...a.march.members.values()].find(m=>m.leader).id!==leader.id,'surviving member takes over after leader death');
const narrow=Simulation(6);for(const o of narrow.observations)o.canPause=false;narrow.Run(20);assert.equal(narrow.march.events.filter(e=>e.type==='stop').length,0,'narrow unsafe areas forbid optional rests');
const urgent=Simulation(6,17,{preset:'urgent'});urgent.Run(20);assert.equal(urgent.march.events.filter(e=>e.type==='stop').length,0,'urgent transfer has no optional rests');
// User 2026-09-23: walking and urgent transfer are staggered too, not only guided rests.
for(const [preset,type] of [['walk','stop'],['urgent','ease']]){
  const sim=Simulation(6,17,{preset});const correlation=SpeedCorrelation(sim,90);
  const members=[...sim.march.members.values()],events=sim.march.events.filter(e=>e.type===type);
  assert.ok(members.every(m=>m.leader?!events.some(e=>e.id===m.id):events.filter(e=>e.id===m.id).length>=3),`${preset}: every follower staggers several times, the leader never`);
  assert.ok(correlation<.6,`${preset}: followers no longer move in lockstep (speed correlation ${correlation.toFixed(2)})`);
  assert.ok(sim.observations.every(o=>o.position.z<(preset==='walk'?-80:-250)),`${preset}: the whole squad keeps advancing`);
  if(preset==='urgent')assert.equal(sim.march.events.filter(e=>e.type==='stop').length,0,'urgent staggering eases the pace but never stops');
  console.log(`ok ${preset}: staggered ${type}s, speed correlation ${correlation.toFixed(2)}`);
}
// User 2026-09-23: a stop is breathing; only a low-chance stop is a slight left/right alert scan.
{
  const sim=Simulation(24,17),rests=new Map(),T=sim.march.tuning;
  for(let i=0;i<90*60;i++){
    for(const [id,o] of sim.Tick()){
      if(o.status!=='resting')continue;
      const key=`${id}:${sim.march.members.get(id).cycles}`,rest=rests.get(key)??{alert:false,min:0,max:0};
      rest.alert||=o.alert===1;rest.min=Math.min(rest.min,o.lookYaw);rest.max=Math.max(rest.max,o.lookYaw);rests.set(key,rest);
    }
  }
  const all=[...rests.values()],alerts=all.filter(r=>r.alert),share=alerts.length/all.length;
  assert.ok(all.length>60&&share>.05&&share<.4,`alert scans are a low-chance subset of stops (${alerts.length}/${all.length})`);
  assert.ok(alerts.every(r=>r.min<-.15&&r.max>.15&&Math.max(-r.min,r.max)<=T.lookYawRad+1e-9),'an alert looks both left and right, slightly');
  assert.ok(all.filter(r=>!r.alert).every(r=>Math.max(-r.min,r.max)<=T.restGlanceRad+1e-9),'an ordinary stop keeps the eyes on the route');
  console.log(`ok alert scans on ${alerts.length}/${all.length} stops`);
}
{
  const arrived=Simulation(3,17,{route:[{x:0,z:0},{x:0,z:-8}],tuning:{alertChance:1}});arrived.Run(20);
  assert.ok([...arrived.march.outputs.values()].every(o=>o.status==='arrived'));
  assert.ok(arrived.march.events.filter(e=>e.type==='alert').length>=3,'people standing at the destination re-roll alert scans');
}
// User 2026-09-23: the start is random too. Followers standing still set off at different moments.
{
  const sim=Simulation(9,17),started=new Map();
  for(let i=0;i<3*60;i++)for(const [id,o] of sim.Tick())if(o.speedMps>0&&!started.has(id))started.set(id,sim.march.time);
  const leader=[...sim.march.members.values()].find(m=>m.leader),times=[...started.entries()].filter(([id])=>id!==leader.id).map(([,t])=>t);
  assert.ok(started.get(leader.id)<.05,'the leader sets off at once');
  assert.equal(times.length,8);assert.ok(Math.max(...times)-Math.min(...times)>.5,'followers set off at staggered moments');
  const lanes=[...sim.march.members.values()].filter(m=>!m.leader).map(m=>m.route[0].x);
  const lateral=lanes.map(x=>x-Math.round(x/sim.march.tuning.spreadM)*sim.march.tuning.spreadM);
  assert.ok(Math.max(...lateral.map(Math.abs))>.2,'lanes are loose, not a ruled grid');
  const moving=Simulation(6,17);for(const o of moving.observations)o.speedMps=3.2;
  moving.Tick();assert.ok([...moving.march.outputs.values()].every(o=>o.status!=='starting'&&o.speedMps>0),'a mid-march rebuild never inserts a start delay');
}
const wait=Simulation(3);wait.Run(2);const lead=wait.observations[0];wait.Tick(1/60,{player:{x:lead.position.x,z:lead.position.z+40}});assert.equal(wait.march.outputs.get(lead.id).status,'waiting');
wait.Tick(1/60,{player:{x:lead.position.x,z:lead.position.z+3}});assert.notEqual(wait.march.outputs.get(lead.id).status,'waiting');
const straggler=wait.observations[2];straggler.position.z=lead.position.z+55;
wait.Tick(1/60,{player:{x:lead.position.x,z:lead.position.z+30}});
assert.equal(wait.march.outputs.get(lead.id).status,'waiting');
assert.equal(wait.march.outputs.get(straggler.id).status,'catchup','a distant member keeps rejoining while the leader waits for the player');
// A player who runs ahead must not leave the whole squad throttled by leader pace
// and backward-looking combat yaw. The real AI independently owns body facing.
const pursuing=Simulation(4,17,{tuning:{speedMps:3.05,catchupScale:4.5/3.05}});
for(const o of pursuing.observations){o.turnLimited=false;o.maxSpeed=4.5;}
for(let i=0;i<30*60;i++){
  for(const o of pursuing.observations)o.yaw=Math.PI;
  pursuing.Tick(1/60,{player:{x:0,z:-180}});
}
assert.ok(pursuing.observations.every(o=>o.position.z<-100),'every squadmate catches up with an advanced player while watching behind');
assert.ok(!pursuing.march.events.some(e=>e.type==='stop'),'catching up takes priority over optional recovery');
const bend=Simulation(3,17,{route:[{x:0,z:0},{x:0,z:-30},{x:40,z:-30},{x:40,z:20}]});
bend.Tick(1/60,{player:{x:40,z:10}});
assert.equal(bend.march.waiting,false,'a player farther around a bend is ahead even behind the immediate heading');
const playerInPath=Simulation(3),playerPoint={x:0,z:-4};
for(let i=0;i<12*60;i++){
  playerInPath.Tick(1/60,{player:playerPoint});
  assert.ok(playerInPath.observations.every(o=>Math.hypot(o.position.x-playerPoint.x,o.position.z-playerPoint.z)>=.79),'members keep physical clearance from a stationary player');
}
const config={count:6,route:[{x:0,z:0},{x:0,z:10}]};
for(const invalid of [{...config,count:0},{...config,count:25},{...config,leaderIndex:6},{...config,route:[{x:0,z:0}]},{...config,tuning:{runMinS:8,runMaxS:2}},
  {...config,tuning:{catchupM:0}},{...config,goal:{x:1e7,z:0}},{...config,members:[{}, {}, {}, {}, {}, {}]},
  {...config,count:1,members:[{id:'A',route:[null]}]},
  {...config,route:Array.from({length:128},(_,i)=>({x:i,z:0})),goal:{x:999,z:0}}])assert.throws(()=>ValidateSquadMarchConfig(invalid));
for(const [name,route] of Object.entries({
  corners:[{x:-12,z:10},{x:-12,z:-12},{x:12,z:-12},{x:12,z:10}],
  narrow:[{x:0,z:16},{x:0,z:4,width:2},{x:0,z:-4,width:2},{x:4,z:-20}],
}))for(const count of Array.from({length:24},(_,i)=>i+1)){
  const sim=Simulation(count,count*91,{route});sim.Run(180);
  const states=[...sim.march.outputs.values()];
  assert.ok(states.every(o=>o.status==='arrived'),`${name} ${count}: all members complete route; ${JSON.stringify(states.filter(o=>o.status!=='arrived'))}`);
  console.log(`ok ${name} ${count}: every member reaches its formation destination`);
}
console.log('ok deterministic variants, pause, threat/death release, role handoff, safe stops, urgent mode, player wait and import validation');
