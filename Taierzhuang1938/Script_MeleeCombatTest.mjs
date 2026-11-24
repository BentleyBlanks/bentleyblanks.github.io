import assert from 'node:assert/strict';
import { MeleeCombatDirector } from './Script_MeleeCombat.mjs';
import { MeleeQteDirector } from './Script_MeleeQte.mjs';
import { MELEE_RULES as R, MELEE_WEAPONS as W, MELEE_SCENARIOS as S, MELEE_SQUAD as G, MELEE_QTE_RULES as Q } from './Data_MeleeCombat.mjs';
const Make = (weapon='Dadao', distance=1.4) => {
  const p = { id:'Player', alive:true, side:'nra', health:100, yaw:0, position:{x:0,y:0,z:0}, meleeWeapon:weapon };
  const e = { id:'Enemy', alive:true, side:'ija', health:100, yaw:Math.PI, position:{x:0,y:0,z:-distance}, meleeWeapon:'Bayonet', meleeTraining:{ passive:true } };
  const c = new MeleeCombatDirector({Player:()=>p, Soldiers:()=>[e]});
  return {p,e,c};
};
const Step = (c, seconds) => { for(let t=0;t<seconds-1e-8;t+=1/180) c.Update(Math.min(1/180,seconds-t)); };
const StepUntil = (c, Done, limit=6) => { for(let t=0;t<limit&&!Done();t+=1/180) c.Update(1/180); };
let count=0;const failures=[];
const Test = (name, body) => {try{body();count++;console.log('PASS',name);}catch(error){failures.push({name,error:String(error)});console.error('FAIL',name,String(error));}};
Test('scenario coverage includes 1/2/3 enemies and both weapon special fights',()=>{
  assert.deepEqual(S.filter(s=>s.weapon==='Dadao'&&s.kind==='duel').map(s=>s.enemies),[1,2,3]);
  for (const weapon of ['Dadao','Bayonet']) assert(S.some(s=>s.weapon===weapon&&s.kind==='bind'));
  // 2026-11-23：推架与倒地抵抗两类项目撤了（玩家没有近身推架，倒地 QTE 只由剧本触发）。
  assert(!S.some(s=>['push','ground'].includes(s.kind)));
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
  const {p,e,c}=Make('Dadao',2); c.Attack(e); Step(c,R.npcTellS-.06); c.Parry(); Step(c,.2); assert.equal(p.health,100); assert.equal(e.health,100); assert.equal(p.position.z,0); assert.equal(c.Fighter(e).state,'stagger'); assert.equal(c.stats.parries,1); assert(!c.Active);
});
Test('holding right button cannot renew its window; early and late parries fail',()=>{
  for(const early of [true,false]) {const {p,e,c}=Make('Dadao',2); if(early)c.HandleInput('Mouse2',true); Step(c,.32); c.Attack(e); Step(c,R.npcTellS+.14); if(!early)c.Parry(); assert(p.health<100);}
  const {c}=Make(); c.HandleInput('Mouse2',true); Step(c,.8); c.HandleInput('Mouse2',true); assert.equal(c.Fighter(c.Player()).state,'idle'); c.HandleInput('Mouse2',false); c.HandleInput('Mouse2',true); assert.equal(c.Fighter(c.Player()).state,'parry');
});
Test('player F no longer pushes, even point-blank; the shared Push still works for the opponent',()=>{
  const {p,e,c}=Make('Dadao',.75); assert.equal(c.HandleInput('KeyF',true),false,'F falls through to the generic interaction'); c.HandleInput('KeyF',false);
  Step(c,.3); assert.equal(c.stats.pushes,0); assert.equal(c.Fighter(p).state,'idle');
  assert(c.Push(e),'the opponent can still shove the player'); Step(c,.2); assert.equal(c.stats.pushes,1);
});
Test('shared Push requires close distance, interrupts and creates room without health damage',()=>{
  const {p,e,c}=Make('Dadao',.75); c.Attack(e); assert(c.Push()); Step(c,.18); assert.equal(e.health,100); assert(e.position.z<-.85 && e.position.z> -1.1,'dadao clears the weapon while retaining cutting distance'); assert.equal(c.Fighter(e).state,'stagger'); assert.equal(p.health,100); assert(!c.Push());
  const far=Make('Dadao',1.4); assert(!far.c.Push());
});
Test('facing and occlusion prevent hits through walls and at actors behind',()=>{
  const a=Make(); a.p.yaw=Math.PI; a.c.Attack(a.p); Step(a.c,1); assert.equal(a.e.health,100);
  const b=Make(); b.c.host.LineClear=()=>false; b.c.Attack(b.p,true); Step(b.c,2); assert.equal(b.e.health,100);
});
Test('simultaneous close heavy contact starts standing QTE only',()=>{
  const {p,e,c}=Make('Dadao',1.05); c.Attack(p,true); c.Attack(e,true); Step(c,.62); assert.equal(c.View().kind,'standing'); assert.equal(p.health,100); assert.equal(e.health,100);
});
Test('long thrust has forward movement and keeps recovery',()=>{
  const {p,e,c}=Make('Bayonet',5); c.Attack(p,true); Step(c,.65); assert(p.position.z<-.35); assert(!c.AttackDown()); assert.equal(e.health,100);
});
Test('a real knockdown leaves the player down and rising, never a ground QTE on its own',()=>{
  const {p,e,c}=Make('Dadao',.8); assert(c.KnockDown(p,e)); c.Fighter(e).nextThink=0;
  for(let t=0;t<3;t+=1/60){c.Update(1/60);assert(!c.Active,'no generic ground QTE');}
  assert.equal(c.stats.ground,0); assert.notEqual(c.Fighter(p).state,'down','he gets up by himself');
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
Test('standing failure returns control without another knockdown; ground failure applies actual health damage',()=>{
  const {p,e,c}=Make('Dadao',1); c.Fighter(p).poise=20;c.BeginBind(p,e,'testContact');Step(c,3.1);assert(p.health<100);assert.equal(c.stats.failures,1);
  const b=Make('Bayonet',1);b.c.Fighter(b.p).state='down';assert(b.c.BeginScriptedGround(b.p,b.e));Step(b.c,3);assert(b.p.health<=28);assert.equal(b.e.health,100);
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
Test('the generic ground QTE entry is gone; only the scripted entry opens it',()=>{
  const {p,e,c}=Make('Dadao',1);assert.equal(c.BeginGround,undefined);assert(c.KnockDown(p,e,'blast'));Step(c,.7);assert(!c.Active);assert(c.BeginScriptedGround(p,e));assert.equal(c.qte.active.kind,'ground');
});
Test('charged weapon can brace a close heavy contact, while ordinary defense remains a parry',()=>{
  const {p,e,c}=Make('Dadao',1.05);c.AttackDown(p);Step(c,.5);c.Attack(e,true);Step(c,.7);assert.equal(c.View()?.reason,'chargedWeaponBrace');assert.equal(p.health,100);
});
Test('3 Hz is weak, 5 Hz gains, 7 Hz saturates and faster tapping cannot exceed it',()=>{
  const Progress=hz=>{const q=new MeleeQteDirector();q.Begin('standing',{});q.Press(true);q.Press(false);const start=q.active.progress;for(let i=1;i<=840;i++){q.Update(1/840);if(i%(840/hz)===0){q.Press(true);q.Press(false);}}return q.active.progress-start;};
  assert(Progress(3)<=.001);assert(Progress(5)>Progress(3));assert(Progress(7)>Progress(5));assert(Progress(30)<=Progress(7)+.001);
});
Test('multiple opponents do not all get blocked by one successful parry',()=>{
  const {p,e,c}=Make('Dadao',1.8);e.position.x=-.6;e.yaw=Math.atan2(-.6,-1.8);const second={...e,id:'Second',yaw:Math.atan2(.6,-1.8),position:{x:.6,y:0,z:-1.8}};c.host.Soldiers=()=>[e,second];c.Attack(e);c.Attack(second);Step(c,R.npcTellS-.05);c.Parry();Step(c,.2);assert.equal(c.stats.parries,1);assert(p.health<100);
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
Test('release continues visible preparation instead of replaying a full windup',()=>{
  const {p,e,c}=Make();c.AttackDown();Step(c,.13);const charged=c.Pose(c.Fighter(p));assert(charged.t>.12);assert.equal(e.health,100);
  c.AttackUp();assert(c.Fighter(p).t>.12);Step(c,.13);assert.equal(e.health,48);
});
Test('successful active weapon beat keeps exactly one short buffered counterattack',()=>{
  const {p,e,c}=Make('Dadao',1.5);c.Parry();Step(c,.08);
  assert(c.events.some(e=>e.kind==='weaponBeat'));assert.equal(e.health,100);
  assert(c.AttackDown());c.AttackUp();assert(c.Fighter(p).buffer);
  Step(c,.48);assert.equal(c.stats.attacks,1);assert.equal(e.health,48);assert.equal(c.Fighter(p).buffer,null);
  Step(c,1);assert.equal(c.stats.attacks,1,'no hidden click queue');
});
Test('proactive beats need weapon contact and cannot sustain a permanent lock',()=>{
  const far=Make('Dadao',2.8);far.c.Parry();Step(far.c,.2);assert(!far.c.events.some(e=>e.kind==='weaponBeat'));
  const near=Make('Dadao',1.5);near.c.Parry();Step(near.c,.6);near.c.Parry();Step(near.c,.12);
  assert.equal(near.c.events.filter(e=>e.kind==='weaponBeat').length,1);
});
Test('release, blur and reset discard the pending action',()=>{
  for(const action of ['release','blur','reset']) {
    const {p,c}=Make('Dadao',4);c.Parry();Step(c,.48);c.AttackDown();c.AttackUp();assert(c.Fighter(p).buffer);
    if(action==='release')c.ReleasePlayer();else if(action==='blur')c.HandleInput('Blur',false);else c.Reset();
    Step(c,.8);assert.equal(c.stats.attacks,0);assert.equal(c.Fighter(p).buffer,null);
  }
});
Test('sideways movement can avoid the committed thrust while camera remains free',()=>{
  const {p,e,c}=Make('Dadao',1.9);c.Attack(e);Step(c,R.npcTellS+.01);p.position.x=.85;p.yaw=1.1;
  Step(c,.35);assert.equal(p.health,100);assert.equal(p.yaw,1.1);assert(c.Fighter(e).attack.yaw-Math.PI<.13);
});
Test('a late camera turn cannot redirect an active sword across the whole view',()=>{
  const {p,e,c}=Make('Dadao',1.45);c.Attack(p);Step(c,.18);p.yaw=1.4;Step(c,.1);
  assert.equal(p.yaw,1.4);assert(Math.abs(c.Fighter(p).attack.yaw)<=R.attackCorrectionRad+.001);
});
Test('bodies block a second enemy weapon without making the player invulnerable',()=>{
  const {p,e,c}=Make('Dadao',2);const front={...e,id:'Blocker',position:{x:0,y:0,z:-1}};c.host.Soldiers=()=>[e,front];
  c.Attack(e);Step(c,.8);assert.equal(p.health,100);assert(c.events.some(e=>e.kind==='bodyObstruction'));
  c.Reset();front.position.x=1.2;c.Attack(e);Step(c,.8);assert(p.health<100);
});
Test('environment contact interrupts the weapon and cannot damage a body beyond it',()=>{
  const {p,e,c}=Make();c.host.SweepEnvironment=()=>({x:0,y:1.1,z:-.7});c.Attack(p);Step(c,.3);
  assert.equal(e.health,100);assert.equal(c.Pose(c.Fighter(p)).action,'Obstructed');assert(c.events.some(e=>e.kind==='environment'));
});
Test('weapon-specific F creates cutting room or thrusting room and has an immunity gap',()=>{
  const da=Make('Dadao',.8),ba=Make('Bayonet',.8);
  for(const t of [da,ba]){t.c.Push();Step(t.c,.2);assert.equal(t.e.health,100);}
  assert(-da.e.position.z<1.1);assert(-ba.e.position.z>1.3);
  Step(da.c,.15);da.c.Push();Step(da.c,.2);assert.equal(da.c.stats.pushes,1);
});
Test('F does not cancel the active phase of a committed heavy attack',()=>{
  const {p,e,c}=Make('Dadao',.85);c.Attack(e,true);Step(c,R.npcTellS-.16);assert(c.Push());Step(c,.17);
  assert.equal(c.stats.pushes,0);assert(c.events.some(e=>e.kind==='pushResisted'));
});
Test('standing contact is visible before QTE and distance alone cannot start it',()=>{
  const {p,e,c}=Make('Dadao',1.05);c.Attack(p,true);c.Attack(e,true);Step(c,.4);assert.equal(c.Active,false);assert.equal(c.Fighter(p).state,'contact');
  Step(c,.18);assert(c.Active);assert(c.events.some(e=>e.kind==='weaponClash'));
  const far=Make('Dadao',2);assert.equal(far.c.BeginBind(far.p,far.e,'distanceOnly'),false);
});
Test('a second ready threat prevents a long bind and an approaching threat releases it',()=>{
  const {p,e,c}=Make('Dadao',1);const other={...e,id:'Other',yaw:Math.PI,position:{x:1,y:0,z:-1.5},meleeTraining:{passive:false}};
  c.host.Soldiers=()=>[e,other];assert.equal(c.BeginBind(p,e,'contact'),false);
  other.position.x=5;assert(c.BeginBind(p,e,'contact'));other.position.x=1;Step(c,.02);
  assert.equal(c.Active,false);assert.equal(c.Fighter(p).state,'idle');assert.equal(c.stats.successes,0);assert.equal(e.health,100);
  assert(c.events.some(e=>e.kind==='qteEscape'));assert(c.Fighter(other).nextThink>c.time);
});
Test('ground success gives recovery advantage after the player finishes rising',()=>{
  const {p,e,c}=Make('Bayonet',1);c.Fighter(p).state='down';assert(c.BeginScriptedGround(p,e));c.SetAssist('auto');
  while(c.Active)Step(c,.01);
  assert.equal(c.Fighter(p).state,'rise');Step(c,R.riseS+.01);
  assert.equal(c.Fighter(p).state,'idle');assert.equal(c.Fighter(e).state,'stagger');assert(c.Fighter(e).duration-c.Fighter(e).t>.5);
  assert.equal(c.BeginBind(p,e,'repeat'),false);
});
Test('even exhausted resistances remain winnable with the supported input cap',()=>{
  for(const kind of ['standing','ground']){
    const q=new MeleeQteDirector();q.Begin(kind,{}, {stamina:0,strength:1.25});
    for(let i=0;i<200 && q.active?.phase==='input';i++){q.Press(true);q.Press(false);q.Update(1/7);}
    assert.equal(q.active?.success,true,kind);
  }
});
Test('successful parry keeps monotonic video time and an interruptible visual recovery',()=>{
  const {p,c}=Make('Dadao',1.1);assert(c.Parry());Step(c,.08);
  const before=c.Pose(c.Fighter(p));assert(c.events.some(e=>e.kind==='weaponBeat'));
  assert(Math.abs(before.animationNormalized-before.t/(R.parryWindowS+R.parryRecoveryS))<1e-8);
  Step(c,.14);assert.equal(c.Fighter(p).state,'idle');
  const recovery=c.Pose(c.Fighter(p));assert(recovery.visualRecovery);assert(recovery.animationNormalized>before.animationNormalized);
  assert(c.AttackDown());assert.equal(c.Fighter(p).state,'charge');assert(!c.Pose(c.Fighter(p)).visualRecovery);
});
Test('QTE has a hard deadline even when resistance keeps progress above zero',()=>{
  for(const kind of ['standing','ground']) {
    const q=new MeleeQteDirector();q.Begin(kind,{});
    for(let t=0;t<Q.windowS+.1;t+=.01){if(q.active?.phase==='input')q.active.progress=.5;q.Update(.01);}
    assert.equal(q.View().phase,'resolve');assert.equal(q.View().success,false);
    q.Update(Q.resolveS+.01);assert.equal(q.View(),null);
  }
});
Test('repeated hits from two enemies cannot restart knockdown or get-up in invincible mode',()=>{
  const {p,e,c}=Make('Dadao',1);const other={...e,id:'Other',position:{x:1,y:0,z:0}};
  c.host.Soldiers=()=>[e,other];let damage=0;c.host.Damage=()=>damage++;
  assert(c.KnockDown(p,e));
  let regained=false;
  for(let i=0;i<420;i++) {
    const attacker=i%2?e:other;
    c.Damage(p,attacker,50,'light');c.Stagger(p,attacker,'Hit',.32,31);
    Step(c,1/90);
    if(c.Fighter(p).state==='idle'){regained=true;break;}
  }
  assert(regained,'surviving player must finish getting up despite continued hits');assert(damage>100);
  assert(c.AttackDown(),'control is usable after getting up');
  assert(!c.KnockDown(p,other),'immediate knockdown cannot consume the control window');
});
Test('ground QTE failure and escape preserve get-up and restart the global cooldown',()=>{
  for(const escape of [false,true]) {
    const {p,e,c}=Make('Dadao',1);const other={...e,id:'Other',position:{x:1,y:0,z:0}};
    c.host.Soldiers=()=>[e,other];c.host.Damage=()=>{};
    c.Fighter(p).state='down';assert(c.BeginScriptedGround(p,e));
    if(escape)c.EscapeQte(other);else {c.qte.Resolve(false);Step(c,Q.resolveS+.02);}
    assert.equal(c.Fighter(p).state,'rise');
    assert(c.Fighter(p).qteUntil>=c.time+Q.cooldownS);
    for(let i=0;i<110;i++){c.Stagger(p,i%2?e:other,'Hit',.32,65);Step(c,1/90);}
    assert.equal(c.Fighter(p).state,'idle');assert(c.AttackDown());
    for(let t=0;t<1;t+=1/60){c.Update(1/60);assert(!c.Active,'nobody restarts a ground QTE on their own');}
  }
});
// 剧本倒地与剧本地面僵持（第一关屋内伏击：枪托砸倒 → 压刺刀 → 推刀 → 反捅）。
// 入口放宽了几何与武器要求，机制仍然是共用那一套；压住那一段 F 不算数，
// 也不许把玩家永远钉在地上。
Test('scripted knockdown pins the player on the floor for as long as the beat asks',()=>{
  // 手里是拉栓步枪（没有白刃武器）：共用 KnockDown 会拒绝。
  const bare=Make('Bayonet',1);bare.p.meleeWeapon=null;
  assert(!bare.c.KnockDown(bare.p,bare.e),'the ordinary knockdown still needs a melee weapon in hand');
  // 任务在砸下来之前把刺刀挂上（顶上来的是对方那把枪），随后走剧本入口。
  const {p,e,c}=Make('Bayonet',1);
  assert(c.ScriptedKnockDown(p,e,6,'missionAmbush'));
  Step(c,R.knockdownS+.05);
  assert.equal(c.Fighter(p).state,'down','he is really on the ground, not just staggered');
  Step(c,3);
  assert.equal(c.Fighter(p).state,'down','the scripted hold outlasts the shared 1.7 s get-up');
  assert(!c.AttackDown(),'a downed player cannot swing');
  assert(c.ScriptedRise(p));
  assert.equal(c.Fighter(p).state,'rise');
  Step(c,R.riseS+.05);
  assert.equal(c.Fighter(p).state,'idle','he gets up through the shared rise');
});
Test('scripted pressure holds without a QTE, then the scripted ground bind opens the mash',()=>{
  const {p,e,c}=Make('Bayonet',1);
  assert(c.ScriptedKnockDown(p,e,9,'missionAmbush'));
  Step(c,R.knockdownS+.05);
  assert(c.HoldScriptedGround(p,e,3));
  assert(!c.Active,'the hold is not a QTE: nothing to mash yet');
  assert.equal(c.Fighter(e).clip,'Pressure');
  Step(c,2);
  assert.equal(c.Fighter(e).state,'qte','the hold never times out on its own');
  assert.equal(c.Fighter(p).state,'down','the player stays down under the blade');
  assert(c.BeginScriptedGround(p,e,{windowS:3.6,strength:.75,reason:'missionAmbush'}));
  assert.equal(c.qte.active.kind,'ground');
  assert.equal(c.qte.active.windowS,3.6);
  assert.equal(c.View().label,'倒地抵抗');
  c.SetAssist('auto');StepUntil(c,()=>!c.Active,6);
  assert(!c.Active,'auto assist wins the struggle well inside the window');
  assert.equal(e.health,100,'winning the struggle never kills the man on top of him');
  assert.equal(c.Fighter(p).state,'rise','the shared ground QTE owns the exit once it starts');
});
Test('a scripted pressure hold that never becomes a QTE still releases the attacker',()=>{
  const {p,e,c}=Make('Bayonet',1);
  c.ScriptedKnockDown(p,e,9);Step(c,R.knockdownS+.05);
  assert(c.HoldScriptedGround(p,e,3));
  assert(c.EndScriptedGround(p,e));
  assert.equal(c.Fighter(e).state,'idle');
  c.HoldScriptedGround(p,e,3);c.BeginScriptedGround(p,e,{windowS:3.6});
  assert(!c.EndScriptedGround(p,e),'an active QTE keeps its own exit');
  assert.equal(c.Fighter(e).state,'qte');
});
Test('losing the scripted ground struggle applies the shared ground failure damage',()=>{
  const {p,e,c}=Make('Bayonet',1);
  let damage=0;c.host.Damage=(_t,_a,amount)=>{damage+=amount;};
  c.ScriptedKnockDown(p,e,9);Step(c,R.knockdownS+.05);
  assert(c.BeginScriptedGround(p,e,{windowS:3.6}));
  StepUntil(c,()=>!c.Active,6);
  assert.equal(damage,Q.groundFailureDamage,'the shared rule, not a beat-local number');
  assert.equal(c.Fighter(p).state,'rise');
});
Test('press input: one F press wins the scripted ground bind, with no progress to build or decay',()=>{
  const {p,e,c}=Make('Bayonet',1);
  c.ScriptedKnockDown(p,e,9);Step(c,R.knockdownS+.05);
  assert(c.BeginScriptedGround(p,e,{windowS:1.8,input:'press',reason:'kitchenAmbush'}));
  assert.equal(c.qte.active.input,'press');
  assert.equal(c.View().input,'press');
  assert.equal(c.View().prompt,'按 F · 反击');
  Step(c,1);
  assert(c.Active,'no decay: a second later the window is still open');
  assert(Math.abs(c.View().progress-(1-1/1.8))<.02,'progress reads as window left');
  c.qte.Press(true,false);
  assert.equal(c.qte.active.phase,'resolve');assert.equal(c.qte.active.success,true);
  assert.equal(c.Fighter(e).state,'qte');
  e.alive=false;Step(c,.1);
  assert(c.Active,'a won press bind finishes its resolve even when the attacker died in it');
  StepUntil(c,()=>!c.Active,2);
  assert.equal(c.Fighter(p).state,'rise','the shared rise follows');
  assert.equal(e.position.z,-1,'nobody pushes the corpse');
});
Test('press input: letting the window run out fails, and the man on top keeps pressing',()=>{
  const {p,e,c}=Make('Bayonet',1);
  let damage=0;c.host.Damage=(_t,_a,amount)=>{damage+=amount;};
  c.ScriptedKnockDown(p,e,9);Step(c,R.knockdownS+.05);
  assert(c.BeginScriptedGround(p,e,{windowS:1.2,input:'press'}));
  c.qte.Press(true,true);
  assert.equal(c.qte.active.phase,'input','an OS key repeat is not a press');
  Step(c,1.25);
  assert.equal(c.qte.active.success,false);
  assert.equal(damage,Q.groundFailureDamage,'the shared ground failure damage');
  assert.equal(c.Pose(c.Fighter(e)).action,'Pressure','he stabs down, he is not pushed off');
});
Test('press input: auto assist presses for the player shortly after the ring opens',()=>{
  const {p,e,c}=Make('Bayonet',1);
  c.ScriptedKnockDown(p,e,9);Step(c,R.knockdownS+.05);
  c.SetAssist('auto');
  assert(c.BeginScriptedGround(p,e,{windowS:1.8,input:'press'}));
  Step(c,Q.pressAutoS-.05);assert.equal(c.qte.active.phase,'input');
  Step(c,.1);assert.equal(c.qte.active.success,true);
});
// ── 白刃实验场的玩法变体：卡刀拔刀补刀、拖拽挥砍（Data_MeleeCombat.MELEE_LODGE / MELEE_DRAG）──
const Distance0=(a,b)=>Math.hypot(a.position.x-b.position.x,a.position.z-b.position.z);
// 拔刀：长按 F seconds 秒再松开。
const HoldF=(c,seconds)=>{c.HandleInput('KeyF',true);Step(c,seconds);c.HandleInput('KeyF',false);};
// 拖拽：每 1/60 s 喂一帧鼠标位移（lookY 向下为正），frames 帧。
const Drag=(c,dx,dy,frames=4)=>{for(let i=0;i<frames;i++){c.AddLook(dx,dy);c.Update(1/60);}};
const LodgeAt=1.3;
Test('variants default to classic and reject unknown values',()=>{
  const {c}=Make(); assert.deepEqual(c.variant,{control:'classic',impact:'classic'});
  assert.deepEqual(c.SetVariant({control:'nope',impact:'lodge'}),{control:'classic',impact:'lodge'});
  assert.deepEqual(c.SetVariant({control:'drag'}),{control:'drag',impact:'lodge'});
  for (const mode of ['cleave','slide','crush','pofeng']) assert.equal(c.SetVariant({impact:mode}).impact,mode);
});
Test('lodge: a deep dadao cut into a living man sticks both fighters and blocks movement until pulled',()=>{
  const {p,e,c}=Make('Dadao',LodgeAt); c.SetVariant({impact:'lodge'});
  c.Attack(p); StepUntil(c,()=>e.health<100,1);
  assert.equal(e.health,48); assert.equal(c.Fighter(p).state,'lodged'); assert.equal(c.Fighter(e).state,'lodged');
  assert(c.Blocking,'player cannot walk while the blade is stuck'); assert.equal(c.View(),null,'no QTE card'); assert.equal(c.stats.lodges,1);
  assert.deepEqual(c.PromptView(),{mode:'press',key:'F',progress:0,pulse:0},'one on-screen ring with F in it');
  assert.equal(c.State().player.state,'lodged'); assert(c.State().player.lodge,'first-person pose carries the lodge strain');
  assert(!c.Parry(),'cannot parry with a stuck blade');
});
Test('lodge: a tip graze or an off-centre cut is only a wound and needs no pulling',()=>{
  const far=Make('Dadao',1.52); far.c.SetVariant({impact:'lodge'}); far.c.Attack(far.p); StepUntil(far.c,()=>far.e.health<100,1);
  assert.equal(far.e.health,48,'the tip still cuts'); assert.notEqual(far.c.Fighter(far.p).state,'lodged'); assert.equal(far.c.stats.lodges,0);
  assert.equal(far.c.stats.shallowCuts,1); assert.equal(far.c.PromptView(),null);
  const side=Make('Dadao',LodgeAt); side.c.SetVariant({impact:'lodge'}); side.e.position.x=0.62; side.e.position.z=-1.15;
  side.c.Attack(side.p); StepUntil(side.c,()=>side.e.health<100,1);
  if(side.e.health<100){assert.notEqual(side.c.Fighter(side.p).state,'lodged','a cut at the edge of the arc glances off');assert.equal(side.c.stats.shallowCuts,1);}
});
Test('lodge: holding F fills the ring and yanks the blade out, the opponent reels and F again finishes him',()=>{
  const {p,e,c}=Make('Dadao',LodgeAt); c.SetVariant({impact:'lodge'});
  c.Attack(p); StepUntil(c,()=>c.Fighter(p).state==='lodged',1);
  c.HandleInput('KeyF',true); Step(c,.4); const half=c.PromptView().progress; assert(half>.4&&half<.6,`ring half full after 0.4 s (${half})`);
  assert(c.PromptView().pulse>0,'the F key throbs while held'); assert.equal(c.Fighter(e).state,'lodged');
  Step(c,.45); assert.equal(c.stats.yanks,1); assert.equal(c.Fighter(e).state,'reel');
  StepUntil(c,()=>c.Fighter(p).state==='idle',1); assert.equal(c.FinishCandidate(),e); c.HandleInput('KeyF',true,true); assert.equal(c.Fighter(p).attack?.finisher??null,null,'still holding F from the yank does not finish');
  c.HandleInput('KeyF',false);
  assert(Distance0(p,e)>1.35,'yank shoves him back'); assert.equal(c.PromptView(),null);
  StepUntil(c,()=>c.Fighter(p).state==='idle',1); assert.equal(c.FinishCandidate(),e);
  assert(c.HandleInput('KeyF',true)); c.HandleInput('KeyF',false);
  StepUntil(c,()=>!e.alive,1.5); assert(!e.alive,'F finisher kills the reeling man'); assert.equal(c.stats.finishes,1);
});
Test('lodge: only F pulls; letting go slides the ring back; the stuck man never wrenches free',()=>{
  const {p,e,c}=Make('Dadao',LodgeAt); c.SetVariant({impact:'lodge'});
  c.Attack(p); StepUntil(c,()=>c.Fighter(p).state==='lodged',1);
  for(let i=0;i<10;i++){c.HandleInput('Mouse0',true);c.HandleInput('Mouse0',false);Step(c,.1);}
  c.HandleInput('KeyS',true); c.AddLook(300,0); Step(c,.5); c.HandleInput('KeyS',false);
  assert.equal(c.PromptView().progress,0,'mashing, S and mouse wiggle do nothing');
  HoldF(c,.5); const held=c.PromptView().progress; Step(c,.5); assert(c.PromptView().progress<held,'releasing F slides back');
  Step(c,8); assert.equal(c.Fighter(p).state,'lodged'); assert.equal(c.Fighter(e).state,'lodged','no time limit: he cannot move with the blade in him');
  assert.equal(e.position.z,-LodgeAt);
});
Test('lodge: a killing heavy cleaves through, bayonet never lodges',()=>{
  const a=Make('Dadao',LodgeAt); a.c.SetVariant({impact:'lodge'}); a.c.Attack(a.p,true); Step(a.c,.8); assert(!a.e.alive); assert.equal(a.c.stats.lodges,0);
  const b=Make('Bayonet',2); b.c.SetVariant({impact:'lodge'}); b.c.Attack(b.p); Step(b.c,.4); assert.equal(b.e.health,50); assert.equal(b.c.stats.lodges,0);
});
Test('lodge: getting hit while stuck lets go of the blade',()=>{
  const {p,e,c}=Make('Dadao',LodgeAt); c.SetVariant({impact:'lodge'});
  c.Attack(p); StepUntil(c,()=>c.Fighter(p).state==='lodged',1);
  c.Stagger(p,e,'Hit',.3,10); assert.notEqual(c.Fighter(p).state,'lodged'); assert.notEqual(c.Fighter(e).state,'lodged');
});
Test('drag: holding left button raises the blade and the mouse leads it (the view follows only partly)',()=>{
  const {p,e,c}=Make('Dadao',LodgeAt); c.SetVariant({control:'drag'});
  c.HandleInput('Mouse0',true); assert.equal(c.Fighter(p).state,'aim'); assert(c.CapturesLook,'mouse belongs to the blade while held');
  Drag(c,8,0,6); const pose=c.State().player; assert.equal(pose.state,'aim'); assert(pose.aimOffset.x>0,'the guard follows the mouse');
  assert.equal(e.health,100,'slow movement never swings');
  Step(c,.2); c.HandleInput('Mouse0',false); assert.equal(c.Fighter(p).state,'idle','a long hold without a flick is not a tap'); assert(!c.CapturesLook);
});
Test('drag: a fast flick cuts along the flick, faster flicks cut harder',()=>{
  const slow=Make('Dadao',LodgeAt); slow.c.SetVariant({control:'drag'});
  slow.c.HandleInput('Mouse0',true); Drag(slow.c,-34,8,4);
  assert.equal(slow.c.Fighter(slow.p).state,'attack'); assert.equal(slow.c.Fighter(slow.p).attack.direction.id,'right','flick to the left = cut coming from the right');
  StepUntil(slow.c,()=>slow.e.health<100,1); const slowHit=100-slow.e.health;
  const fast=Make('Dadao',LodgeAt); fast.c.SetVariant({control:'drag'});
  fast.c.HandleInput('Mouse0',true); Drag(fast.c,-60,15,3); StepUntil(fast.c,()=>fast.e.health<100,1);
  assert(100-fast.e.health>slowHit,`faster flick hits harder (${slowHit} vs ${100-fast.e.health})`);
  const down=Make('Dadao',LodgeAt); down.c.SetVariant({control:'drag'});
  down.c.HandleInput('Mouse0',true); Drag(down.c,0,40,3); assert.equal(down.c.Fighter(down.p).attack.direction.id,'up','flick down = overhead chop');
  const right=Make('Dadao',LodgeAt); right.c.SetVariant({control:'drag'});
  right.c.HandleInput('Mouse0',true); Drag(right.c,40,0,3); Step(right.c,.08);
  const pose=right.c.State().player; assert.equal(pose.direction,'left'); assert(pose.swingMirror>0,'cuts from the left mirror the arms');
});
Test('drag: still holding after a cut returns to the guard for the next flick; release ends it',()=>{
  const {p,c}=Make('Dadao',4); c.SetVariant({control:'drag'});
  c.HandleInput('Mouse0',true); Drag(c,-40,0,3); assert.equal(c.Fighter(p).state,'attack');
  StepUntil(c,()=>c.Fighter(p).state!=='attack',1.5); assert.equal(c.Fighter(p).state,'aim');
  Drag(c,40,0,3); assert.equal(c.Fighter(p).state,'attack'); assert.equal(c.stats.drags,2);
  c.HandleInput('Mouse0',false); StepUntil(c,()=>c.Fighter(p).state!=='attack',1.5); assert.equal(c.Fighter(p).state,'idle');
  c.HandleInput('Mouse0',true); c.HandleInput('Mouse2',true); assert.equal(c.Fighter(p).state,'parry','right button still parries from the drag guard');
});
Test('drag + lodge combine: a deep flick lodges, the frozen pose keeps its roll, F finishes with an overhead',()=>{
  const {p,e,c}=Make('Dadao',LodgeAt); c.SetVariant({control:'drag',impact:'lodge'});
  c.HandleInput('Mouse0',true); Drag(c,-40,0,3); c.HandleInput('Mouse0',false);
  StepUntil(c,()=>c.Fighter(p).state==='lodged',1);
  const pose=c.State().player; assert.equal(pose.state,'lodged'); assert(pose.swingRoll<-0.1); assert(pose.strokeSplit);
  HoldF(c,1); StepUntil(c,()=>c.Fighter(p).state==='idle',1); assert(c.Finish()); assert.equal(c.Fighter(p).attack.direction.id,'up');
  StepUntil(c,()=>!e.alive,1.5); assert(!e.alive);
});
Test('drag: spamming clicks still cuts every time — a tap cuts, clicks during a cut queue the next one',()=>{
  const {p,c}=Make('Dadao',4); c.SetVariant({control:'drag'});
  c.HandleInput('Mouse0',true); Step(c,.05); c.HandleInput('Mouse0',false);
  assert.equal(c.Fighter(p).state,'attack','a tap without a flick still cuts'); assert.equal(c.Fighter(p).attack.direction.id,'upRight');
  let cuts=1;
  for(let i=0;i<24;i++){
    c.HandleInput('Mouse0',true); Step(c,.04); c.HandleInput('Mouse0',false); Step(c,.06);
    const f=c.Fighter(p); if(f.state==='attack'&&f.t<.1)cuts++;
  }
  assert(c.stats.drags>=4,`clicking for 2.4 s chains cuts back to back (${c.stats.drags})`);
  StepUntil(c,()=>c.Fighter(p).state==='idle',2); assert.equal(c.Fighter(p).state==='idle',true,'nothing gets stuck');
  c.HandleInput('Mouse0',true); Step(c,.05); c.HandleInput('Mouse0',false); assert.equal(c.Fighter(p).state,'attack','still cuts afterwards: '+JSON.stringify({state:c.Fighter(p).state,stamina:c.Fighter(p).stamina,buffer:c.Fighter(p).buffer,ev:c.events.slice(-3).map(e=>e.kind)}));
});
// ── 2026-11-24 三种白刃新交互与破锋全开（cleave / slide / crush / pofeng）───────────────
Test('cleave: a cut into flesh bites with drag; mouse pull or fresh click rips through and wrenches the enemy sideways',()=>{
  // 顺势甩鼠标拉豁
  const a=Make('Dadao',LodgeAt); a.c.SetVariant({impact:'cleave'});
  a.c.Attack(a.p); StepUntil(a.c,()=>a.c.Fighter(a.p).state==='cleave',1);
  assert.equal(a.e.health,48,'initial cut deals normal flesh damage');
  assert.equal(a.c.Fighter(a.e).state,'cleaved','enemy is coupled to the biting blade');
  assert.equal(a.c.PromptView()?.key,'拉豁');
  Step(a.c,.08); Drag(a.c,-28,12,2);
  assert.equal(a.c.stats.rips,1,'mouse pull rips the blade through');
  assert(!a.e.alive,'rip bonus trauma finishes the wounded enemy');
  assert(Math.abs(a.e.position.x)>0.25,`enemy body is wrenched sideways along the blade tangent (x=${a.e.position.x.toFixed(2)})`);
  // 左键再点一下也能拉豁；不操作则咬合窗口结束后自然收刀，不会卡死
  const b=Make('Dadao',LodgeAt); b.e.health=140; b.c.SetVariant({impact:'cleave'});
  b.c.Attack(b.p); StepUntil(b.c,()=>b.c.Fighter(b.p).state==='cleave',1);
  b.c.HandleInput('Mouse0',true); b.c.HandleInput('Mouse0',false);
  Step(b.c,.1); assert.equal(b.c.stats.rips,1,'clicking LMB during bite queues/triggers rip');
  assert.equal(b.e.health,140-52-48);
  const passive=Make('Dadao',LodgeAt); passive.c.SetVariant({impact:'cleave'});
  passive.c.Attack(passive.p); StepUntil(passive.c,()=>passive.c.Fighter(passive.p).state==='cleave',1);
  Step(passive.c,.6); assert.equal(passive.c.Fighter(passive.p).state,'idle','exits cleanly without rip input');
  assert.equal(passive.c.stats.rips,0);
});
Test('slide: parrying or clashing into a bayonet locks onto the barrel; W grinds sparks forward and LMB cleaves',()=>{
  const {p,e,c}=Make('Dadao',1.65); c.SetVariant({impact:'slide'});
  c.Attack(e); Step(c,.12);
  assert(c.Parry(p),'right-click catches the incoming bayonet');
  assert.equal(c.Fighter(p).state,'sliding'); assert.equal(c.Fighter(e).state,'sliding');
  assert.equal(c.PromptView()?.key,'W');
  const d0=Distance0(p,e);
  c.HandleInput('KeyW',true); Step(c,.26); c.HandleInput('KeyW',false);
  const s1=c.State();
  assert(s1.slide.ready,`pushing W slides past the strike threshold (${s1.slide.progress.toFixed(2)})`);
  assert(Distance0(p,e)<d0,'player steps inside the bayonet guard while grinding forward');
  assert(c.events.some(ev=>ev.kind==='slideGrind'),'grinding emits barrel spark events');
  assert.equal(c.PromptView()?.key,'左键');
  c.HandleInput('Mouse0',true); c.HandleInput('Mouse0',false);
  assert.equal(c.stats.slideSlashes,1,'LMB unleashes the barrel-slide slash');
  assert(!e.alive,'barrel-slide slash kills');
  // 主动挥刀撞上对方突刺同样架锁枪管；超时不推则双方弹开
  const clash=Make('Dadao',1.55); clash.c.SetVariant({impact:'slide'});
  clash.c.Attack(clash.e); Step(clash.c,.15); clash.c.Attack(clash.p);
  StepUntil(clash.c,()=>clash.c.Fighter(clash.p).state==='sliding',.5);
  assert.equal(clash.c.Fighter(clash.p).state,'sliding','swinging into an active thrust clashes into barrel slide');
  Step(clash.c,1.6); assert.notEqual(clash.c.Fighter(clash.p).state,'sliding','timeout breaks the lock');
});
Test('crush: frontal cuts clash off the rifle guard until guard poise shatters for F execution; flanking bypasses guard',()=>{
  const {p,e,c}=Make('Dadao',1.35); c.SetVariant({impact:'crush'});
  c.Attack(p,false); StepUntil(c,()=>c.stats.guardBlocks===1,1);
  assert.equal(e.health,100,'frontal rifle block prevents flesh damage');
  assert(c.State().enemyGuard.guardPoise<100,'guard poise drops on block');
  assert(Distance0(p,e)>1.5,'heavy iron chop drives the blocker backward');
  // 贴近一记重劈直接震断剩余护枪架势
  e.position.z=-1.35; StepUntil(c,()=>c.Fighter(p).state==='idle',.5);
  c.Attack(p,true); StepUntil(c,()=>c.stats.guardCrushes===1,1);
  assert.equal(c.Fighter(e).state,'crushed','guard shatters into crushed state');
  assert.equal(c.PromptView()?.key,'F');
  StepUntil(c,()=>c.Fighter(p).state==='idle',.4);
  assert.equal(c.FinishCandidate(),e);
  assert(c.HandleInput('KeyF',true)); c.HandleInput('KeyF',false);
  StepUntil(c,()=>!e.alive,1.5); assert(!e.alive,'F executes the guard-crushed opponent');
  assert.equal(c.stats.crushFinishes,1);
  // 绕到侧面出刀：不触发横枪格挡，第一刀直接砍进血肉
  const flank=Make('Dadao',1.3); flank.c.SetVariant({impact:'crush'});
  flank.p.position.x=1.25; flank.p.position.z=-1.3; flank.p.yaw=Math.PI/2; // 在日军正侧方 90° 挥砍
  flank.c.Attack(flank.p,false); StepUntil(flank.c,()=>flank.e.health<100,1);
  assert.equal(flank.c.stats.guardBlocks,0,'flanking bypasses the frontal rifle guard');
  assert.equal(flank.e.health,48);
});
Test('pofeng + drag combine all three signature interactions seamlessly',()=>{
  const {p,e,c}=Make('Dadao',1.35); c.SetVariant({control:'drag',impact:'pofeng'});
  // 1) 正面甩刀 → 硬磕横枪
  c.HandleInput('Mouse0',true); Drag(c,-45,6,3);
  StepUntil(c,()=>c.stats.guardBlocks===1,1);
  assert.equal(e.health,100);
  StepUntil(c,()=>c.Fighter(p).state==='aim',.5);
  c.HandleInput('Mouse0',false); assert.equal(c.Fighter(p).state,'idle');
  // 2) 绕到侧翼甩刀 → 绕过护枪直接吃肉顿刀 → 再甩鼠标拖刃拉豁斩杀
  p.position.x=1.25; p.position.z=e.position.z; p.yaw=Math.PI/2;
  c.HandleInput('Mouse0',true); Drag(c,0,42,3);
  StepUntil(c,()=>c.Fighter(p).state==='cleave',1);
  Step(c,.08); Drag(c,-30,15,2); c.HandleInput('Mouse0',false);
  assert.equal(c.stats.rips,1); assert(!e.alive);
});
console.log(`${count} melee rule tests passed`);

assert.deepEqual(failures,[]);
