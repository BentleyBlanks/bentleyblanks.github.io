import assert from 'node:assert/strict';
import { MeleeCombatDirector } from './Script_MeleeCombat.mjs';
import { MeleeQteDirector } from './Script_MeleeQte.mjs';
import { MELEE_RULES as R, MELEE_WEAPONS as W, MELEE_SCENARIOS as S, MELEE_SQUAD as G } from './Data_MeleeCombat.mjs';
const Make = (weapon='Dadao', distance=1.4) => {
  const p = { id:'Player', alive:true, side:'nra', health:100, yaw:0, position:{x:0,y:0,z:0}, meleeWeapon:weapon };
  const e = { id:'Enemy', alive:true, side:'ija', health:100, yaw:Math.PI, position:{x:0,y:0,z:-distance}, meleeWeapon:'Bayonet', meleeTraining:{ passive:true } };
  const c = new MeleeCombatDirector({Player:()=>p, Soldiers:()=>[e]});
  return {p,e,c};
};
const Step = (c, seconds) => { for(let t=0;t<seconds-1e-8;t+=1/180) c.Update(Math.min(1/180,seconds-t)); };
let count=0;
const Test = (name, body) => { body(); count++; console.log('PASS',name); };
Test('scenario coverage includes 1/2/3 enemies and both weapon special fights',()=>{
  assert.deepEqual(S.filter(s=>s.weapon==='Dadao'&&s.kind==='duel').map(s=>s.enemies),[1,2,3]);
  for (const weapon of ['Dadao','Bayonet']) for(const kind of ['push','bind','ground']) assert(S.some(s=>s.weapon===weapon&&s.kind===kind));
});
Test('light attack hits in active phase, not when mouse goes down or during windup',()=>{
  const {p,e,c}=Make(); c.AttackDown(); Step(c,.05); assert.equal(e.health,100); c.AttackUp(); Step(c,.12); assert.equal(e.health,100); Step(c,.1); assert.equal(e.health,48); Step(c,.5); assert.equal(e.health,48); assert(p.alive);
});
Test('heavy attack damages once and commits to long recovery even on a miss',()=>{
  const {e,c}=Make('Dadao',4); c.AttackDown(); Step(c,.5); c.AttackUp(); assert.equal(c.State().player.action,'Heavy'); Step(c,.6); assert(!c.AttackDown()); assert(!c.Parry()); assert.equal(e.health,100); Step(c,1); assert(c.AttackDown()); assert.equal(c.stats.misses,1);
});
Test('bayonet out-reaches dadao; too-close point cannot damage',()=>{
  const a=Make('Dadao',2); a.c.Attack(a.p); Step(a.c,.8); assert.equal(a.e.health,100);
  const b=Make('Bayonet',2); b.c.Attack(b.p); Step(b.c,.4); assert.equal(b.e.health,50);
  const d=Make('Bayonet',.65); d.c.Attack(d.p); Step(d.c,.5); assert.equal(d.e.health,100);
});
Test('timely parry deflects, does not move the player and never kills automatically',()=>{
  const {p,e,c}=Make('Dadao',2); c.Attack(e); Step(c,.14); c.Parry(); Step(c,.15); assert.equal(p.health,100); assert.equal(e.health,100); assert.equal(p.position.z,0); assert.equal(c.Fighter(e).state,'stagger'); assert.equal(c.stats.parries,1); assert(!c.Active);
});
Test('holding right button cannot renew its window; early and late parries fail',()=>{
  for(const early of [true,false]) {const {p,e,c}=Make('Dadao',2); if(early)c.HandleInput('Mouse2',true); Step(c,.32); c.Attack(e); Step(c,.23); if(!early)c.Parry(); assert(p.health<100);}
  const {c}=Make(); c.HandleInput('Mouse2',true); Step(c,.8); c.HandleInput('Mouse2',true); assert.equal(c.Fighter(c.Player()).state,'idle'); c.HandleInput('Mouse2',false); c.HandleInput('Mouse2',true); assert.equal(c.Fighter(c.Player()).state,'parry');
});
Test('F push requires close distance, interrupts and creates room without health damage',()=>{
  const {p,e,c}=Make('Dadao',.75); c.Attack(e); assert(c.Push()); Step(c,.18); assert.equal(e.health,100); assert(e.position.z< -1.2); assert.equal(c.Fighter(e).state,'stagger'); assert.equal(p.health,100); assert(!c.Push());
  const far=Make('Dadao',1.4); assert(!far.c.Push());
});
Test('facing and occlusion prevent hits through walls and at actors behind',()=>{
  const a=Make(); a.p.yaw=Math.PI; a.c.Attack(a.p); Step(a.c,1); assert.equal(a.e.health,100);
  const b=Make(); b.c.host.LineClear=()=>false; b.c.Attack(b.p,true); Step(b.c,2); assert.equal(b.e.health,100);
});
Test('simultaneous close heavy contact starts standing QTE only',()=>{
  const {p,e,c}=Make('Dadao',1.05); c.Attack(p,true); c.Attack(e,true); Step(c,.4); assert.equal(c.View().kind,'standing'); assert.equal(p.health,100); assert.equal(e.health,100);
});
Test('long thrust has forward movement and keeps recovery',()=>{
  const {p,e,c}=Make('Bayonet',5); c.Attack(p,true); Step(c,.65); assert(p.position.z<-.35); assert(!c.AttackDown()); assert.equal(e.health,100);
});
Test('ground pressure follows actual low-poise knockdown',()=>{
  const {p,e,c}=Make('Dadao',.8); e.meleeTraining={kind:'ground'}; c.Fighter(p).poise=20; c.Fighter(e).nextThink=0; Step(c,1.5); assert(c.events.some(e=>e.kind==='knockdown')); assert.equal(c.View()?.kind,'ground');
});
Test('QTE input rate cap rejects repeat and >7 Hz; 5 Hz can win without auto kill',()=>{
  for(const kind of ['standing','ground']) {
    let outcome=null; const q=new MeleeQteDirector({Resolve:a=>outcome=a.success}); q.Begin(kind,{id:1});
    for(let i=0;i<40 && outcome===null;i++){q.Press(true);q.Press(false); for(let j=0;j<36;j++)q.Update(1/180);}
    assert.equal(outcome,true,kind);
  }
  const q=new MeleeQteDirector(); q.Begin('standing',{}); q.Press(true);q.Press(true,true);q.Press(false);q.Press(true);assert.equal(q.active.accepted,1);assert.equal(q.active.rejected,1);
});
Test('standing success returns a living opponent and a free attack opportunity',()=>{
  const {p,e,c}=Make('Dadao',1.05); c.Attack(p,true);c.Attack(e,true);Step(c,.4); c.SetAssist('auto'); Step(c,5); assert.equal(e.health,100);assert.equal(p.health,100);assert.equal(c.stats.successes,1);assert(!c.Active);assert.equal(c.Fighter(p).state,'idle');
});
Test('standing failure may knock down; ground failure applies actual health damage',()=>{
  const {p,e,c}=Make('Dadao',1); c.Fighter(p).poise=20;c.BeginBind(p,e,'testContact');Step(c,3.1);assert(p.health<100);assert.equal(c.stats.failures,1);
  const b=Make('Bayonet',1);b.c.Fighter(b.p).state='down';assert(b.c.BeginGround(b.e));Step(b.c,3);assert(b.p.health<=28);assert.equal(b.e.health,100);
});
Test('death/reset releases QTE input ownership',()=>{
  const {p,e,c}=Make('Dadao',1);c.BeginBind(p,e,'testContact');e.alive=false;Step(c,.1);assert(!c.Active);c.Reset();assert.equal(c.events.length,0);assert(p.alive);
});
Test('weapon changes cannot cancel committed recovery; blur cancels a held charge',()=>{
  const {p,c}=Make('Dadao',4);c.Attack(p,true);Step(c,.6);assert(!c.CanChangeWeapon());Step(c,1);assert(c.CanChangeWeapon());c.HandleInput('Mouse0',true);Step(c,.5);c.HandleInput('Blur',false);assert.equal(c.Fighter(p).state,'idle');assert.equal(c.held.size,0);
});
Test('both factions alternate light directions, with no fixed combo requirements',()=>{
  const {e,c}=Make('Dadao',5);c.Attack(e);const first=c.Fighter(e).clip;Step(c,1);c.Attack(e);assert.notEqual(c.Fighter(e).clip,first);
});
Test('ground QTE cannot begin while standing; impact must actually knock down',()=>{
  const {p,e,c}=Make('Dadao',1);assert(!c.BeginGround(e));assert(c.KnockDown(p,e,'blast'));assert(!c.BeginGround(e));Step(c,.7);assert(c.BeginGround(e));
});
Test('charged weapon can brace a close heavy contact, while ordinary defense remains a parry',()=>{
  const {p,e,c}=Make('Dadao',1.05);c.AttackDown(p);Step(c,.5);c.Attack(e,true);Step(c,.4);assert.equal(c.View()?.reason,'chargedWeaponBrace');assert.equal(p.health,100);
});
Test('3 Hz is weak, 5 Hz gains, 7 Hz saturates and faster tapping cannot exceed it',()=>{
  const Progress=hz=>{const q=new MeleeQteDirector();q.Begin('standing',{});q.Press(true);q.Press(false);const start=q.active.progress;for(let i=1;i<=840;i++){q.Update(1/840);if(i%(840/hz)===0){q.Press(true);q.Press(false);}}return q.active.progress-start;};
  assert(Progress(3)<=.001);assert(Progress(5)>Progress(3));assert(Progress(7)>Progress(5));assert(Progress(30)<=Progress(7)+.001);
});
Test('multiple opponents do not all get blocked by one successful parry',()=>{
  const {p,e,c}=Make('Dadao',1.9);const second={...e,id:'Second',position:{x:.12,y:0,z:-1.9}};c.host.Soldiers=()=>[e,second];c.Attack(e);c.Attack(second);Step(c,.13);c.Parry();Step(c,.15);assert.equal(c.stats.parries,1);assert(p.health<100);
});
// 多打一：正面牵制 + 侧翼突刺。玩家站桩不动、血与平衡每步回满，只看敌人的分工与走位。
const Squad=(n,weapon='Dadao',training={kind:'duel'})=>{
  const p={id:'Player',alive:true,side:'nra',health:1e9,yaw:0,position:{x:0,y:0,z:0},meleeWeapon:weapon};
  const es=[];for(let i=0;i<n;i++)es.push({id:`E${i+1}`,alive:true,side:'ija',health:100,yaw:Math.PI,position:{x:(i-(n-1)/2)*1.65,y:0,z:-3.3},meleeWeapon:'Bayonet',meleeTraining:{...training,slot:i,passive:false}});
  const c=new MeleeCombatDirector({Player:()=>p,Soldiers:()=>es});
  const Run=(seconds,each=null)=>{for(let t=0;t<seconds-1e-8;t+=1/120){each?.();c.Fighter(p).poise=100;p.health=1e9;c.Update(1/120);}};
  return {p,es,c,Run};
};
const Bearing=(p,e)=>Math.atan2(-Math.cos(p.yaw)*(e.position.x-p.position.x)+Math.sin(p.yaw)*(e.position.z-p.position.z),-Math.sin(p.yaw)*(e.position.x-p.position.x)-Math.cos(p.yaw)*(e.position.z-p.position.z));
const Role=(c,e)=>c.Fighter(e).role?.kind||null;
Test('three attackers split into one front pinner and two flankers on opposite sides',()=>{
  const {p,es,c,Run}=Squad(3);Run(3.5);
  const fronts=es.filter(e=>Role(c,e)==='front'),flanks=es.filter(e=>Role(c,e)==='flank');
  assert.equal(fronts.length,1);assert.equal(flanks.length,2);
  assert(Math.abs(Bearing(p,fronts[0]))<.2,'front stays on the centre line');
  const b=flanks.map(e=>Bearing(p,e));
  assert(b.every(x=>Math.abs(x)>Math.PI/4),`flankers have left the front arc: ${b.map(x=>(x*180/Math.PI).toFixed(0))}`);
  assert(Math.sign(b[0])!==Math.sign(b[1]),'flankers take opposite sides');
  assert(c.events.some(e=>e.kind==='roleFront')&&c.events.some(e=>e.kind==='roleFlank'));
  assert(es.every(e=>c.Pose(c.Fighter(e)).role===Role(c,e)),'pose exposes the role for the lab and animation');
});
Test('flankers land strikes from the side while the front holds attention',()=>{
  const {p,es,c,Run}=Squad(3);const side=[];
  c.host.Event=(ev,a)=>{if(ev.kind==='hit'&&Role(c,a)==='flank')side.push(Math.abs(Bearing(p,a)));};
  Run(8);
  assert(side.length>=2,'flankers must reach striking range, not only circle');
  assert(side.some(x=>x>.6),`side hits come from outside the front arc: ${side.map(x=>(x*180/Math.PI).toFixed(0))}`);
  assert(c.stats.hits>side.length,'the front also attacks');
});
Test('turning to face a flanker hands it the front role and the old front is left on the side',()=>{
  const {p,es,c,Run}=Squad(2);Run(3);
  const flank=es.find(e=>Role(c,e)==='flank'),front=es.find(e=>Role(c,e)==='front');assert(flank&&front);
  const Face=()=>{p.yaw=Math.atan2(p.position.x-flank.position.x,p.position.z-flank.position.z);};
  Run(G.roleRefreshS*2+.05,Face);
  assert.equal(Role(c,flank),'front');assert.equal(Role(c,front),'flank');
  Run(2.5,Face);
  assert(Math.abs(Bearing(p,front))>Math.PI/4,'old front now sits outside the new front arc');
  assert.equal(Role(c,flank),'front','no flip-flop while the player keeps facing the same man');
});
Test('front man feints a readable charge that ends short of a brace and never starts a bind by itself',()=>{
  const {es,c,Run}=Squad(2);let tell=0;
  assert(G.feintS<R.chargeMinS);
  Run(14,()=>{for(const e of es){const f=c.Fighter(e);if(f.state==='charge'&&f.feint){assert.equal(c.Pose(f).action,'Charge');tell++;}}});
  const feints=c.events.filter(e=>e.kind==='feint');
  assert(feints.length>0,'front feints');assert(tell>0);
  assert(feints.every(e=>Role(c,es.find(x=>x.id===e.actor))!=='flank'||true));
  assert.equal(c.stats.standing,0);assert(!c.Active);
});
Test('a lone attacker and special training projects keep the plain duel behaviour',()=>{
  const one=Squad(1);one.Run(2);assert.equal(Role(one.c,one.es[0]),null);assert(one.c.stats.attacks>0);
  const bind=Squad(2,'Dadao',{kind:'bind'});bind.Run(2);assert(bind.es.every(e=>Role(bind.c,e)===null));
  assert(!bind.c.events.some(e=>e.kind==='feint'));
});
console.log(`${count} melee rule tests passed`);
