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
      if(command.status==='resting')assert.equal(o.speedMps,0,'rest means a real stop');
    }
    return output;
  };
  const Run=seconds=>{for(let i=0;i<seconds*60;i++)Tick();};
  return {march,observations,Tick,Run};
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
const wait=Simulation(3);wait.Run(2);const lead=wait.observations[0];wait.Tick(1/60,{player:{x:lead.position.x,z:lead.position.z+40}});assert.equal(wait.march.outputs.get(lead.id).status,'waiting');
wait.Tick(1/60,{player:{x:lead.position.x,z:lead.position.z+3}});assert.notEqual(wait.march.outputs.get(lead.id).status,'waiting');
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
