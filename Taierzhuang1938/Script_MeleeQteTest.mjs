// Shared melee whitebox browser acceptance: real input, damage, actors and rendered frames.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LaunchBrowser } from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import { ServeRoot } from './Script_DevServer.mjs';
import { FPS_ARM_LIMITS } from './Data_FpsArmPoses.mjs';
const project=path.dirname(fileURLToPath(import.meta.url));
const server=await ServeRoot(path.resolve(project,'..'),0);
const browser=await LaunchBrowser();
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];
const posesOnly=process.argv.includes('--poses');
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error' && !/fonts|ERR_BLOCKED_BY_CLIENT/.test(m.text()))errors.push(m.text());});
try {
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//,route=>route.abort('blockedbyclient'));
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?shot=1&manual=1&melee=1&quality=medium&scale=small`,{waitUntil:'load',timeout:120000});
  await page.waitForFunction(()=>window.Taierzhuang?.state?.ready&&window.Taierzhuang?.state?.running&&window.Taierzhuang?.Debug?.MeleeCombat,null,{timeout:120000});
  console.log('PASS whitebox boot');
  if(!posesOnly){
  assert(await page.evaluate(()=>Taierzhuang.ai.soldiers.length===12&&Taierzhuang.ai.soldiers.every(s=>s.meleeDormant)),'field contains six dormant encounter groups');
  const field=await page.evaluate(()=>{
    const T=Taierzhuang,L=T.Debug.MeleeCombat,result=[];
    for(const [id,x,z,trigger,count] of [['AutoOne',1392,1450,'auto',1],['AutoTwo',1400,1450,'auto',2],['AutoThree',1408,1450,'auto',3],['UseOne',1392,1462,'interact',1],['UseTwo',1400,1462,'interact',2],['UseThree',1408,1462,'interact',3]]) {
      L.Select('EncounterField');
      const placed=L.State().targets.filter(t=>t.id.startsWith(id+'_'));
      const placementError=Math.max(...placed.map((t,i)=>Math.hypot(t.x-(x+(i-(count-1)/2)*1.2),t.z-z)));
      T.player.Spawn(x,z+6,0);T.Debug.Key('KeyW',true);
      for(let i=0;i<240 && !L.State().encounter && !L.State().nearby;i++)T.StepFrames(1,1/60,false);
      T.Debug.Key('KeyW',false);T.StepFrames(2,1/60,false);
      const before=L.State().encounter;
      if(trigger==='interact'){T.Debug.Key('KeyF',true);T.Debug.Key('KeyF',false);T.StepFrames(2,1/60,false);}
      const started={id,trigger,count,placementError,before,active:L.State().encounter,awake:T.ai.soldiers.filter(s=>!s.meleeDormant).length,dormant:T.ai.soldiers.filter(s=>s.meleeDormant).length};
      // Cross the actual arena with production input, physics, actors and damage.
      for(let frame=0;frame<60*45&&T.player.Alive&&L.State().encounter;frame++){
        const enemies=T.ai.soldiers.filter(s=>!s.meleeDormant&&s.alive).sort((a,b)=>a.position.distanceTo(T.player.position)-b.position.distanceTo(T.player.position));
        if(!enemies.length){T.StepFrames(2,1/60,false);break;}
        const e=enemies[0],d=e.position.distanceTo(T.player.position),f=T.meleeCombat.Fighter(T.player);
        T.player.yaw=Math.atan2(T.player.position.x-e.position.x,T.player.position.z-e.position.z);T.player.pitch=0;
        T.Debug.Key('KeyW',d>1.22);T.Debug.Key('KeyD',enemies.length>1&&d<2.5);
        if(L.State().active){if(frame%12===0){T.Debug.Key('KeyF',true);T.Debug.Key('KeyF',false);}}
        else if(f.state==='idle'){
          const incoming=enemies.find(s=>{const g=T.meleeCombat.Fighter(s);return g.attack&&g.t>g.attack.windup-.13&&g.t<g.attack.windup&&s.position.distanceTo(T.player.position)<g.attack.reach;});
          if(incoming){T.Debug.Mouse(2,true);T.Debug.Mouse(2,false);}
          else if(d<1.5){T.Debug.Mouse(0,true);T.Debug.Mouse(0,false);}
        }
        T.StepFrames(1,1/60,false);
      }
      T.Debug.Key('KeyW',false);T.Debug.Key('KeyD',false);T.StepFrames(2,1/60,false);
      const ended={...started,alive:T.player.Alive,health:T.player.health,completed:L.State().completed,remaining:T.ai.soldiers.filter(s=>!s.meleeDormant&&s.alive).length};
      if(id==='UseOne'){
        T.player.yaw=0;T.Debug.Key('KeyW',true);
        for(let i=0;i<300&&!L.State().encounter;i++)T.StepFrames(1,1/60,false);
        T.Debug.Key('KeyW',false);ended.next=L.State().encounter;ended.kept=L.State().completed.includes('UseOne');
      }
      result.push(ended);
    }
    L.Select('EncounterField');return result;
  });
  console.log('FIELD',JSON.stringify(field));
  for(const e of field){assert.equal(e.active,e.id,JSON.stringify(e));assert.equal(e.awake,e.count);assert.equal(e.dormant,12-e.count);assert(e.placementError<.25,`${e.id}: actor was clamped away from its arena`);assert(e.alive&&e.remaining===0&&e.completed.includes(e.id),`${e.id}: encounter must be fightable and completable`);if(e.trigger==='interact')assert.equal(e.before,null);}
  console.log('PASS six physical encounters: correct actor placement, real walking / F activation, combat and completion');
  assert(field.find(e=>e.id==='UseOne').next==='AutoOne'&&field.find(e=>e.id==='UseOne').kept,'walking to the next encounter retains the completed result');
  await page.evaluate(()=>{const T=Taierzhuang;T.Debug.MeleeCombat.Select('BayonetOne');T.Debug.MeleeCombat.Pause(true);T.StepFrames(2,1/60,false);});
  await page.keyboard.press('v');
  const fireStance=await page.evaluate(()=>{const T=Taierzhuang;T.StepFrames(2,1/60,false);return {fixed:T.state.bayonetFixed,canMelee:T.meleeCombat.CanUse(),stance:T.Debug.MeleeCombat.State().stance};});
  assert(fireStance.fixed&&!fireStance.canMelee&&fireStance.stance==='fire');
  await page.mouse.down({button:'right'});
  const aimed=await page.evaluate(()=>{Taierzhuang.StepFrames(35,1/60,false);return Taierzhuang.player.ads;});
  await page.mouse.up({button:'right'});assert(aimed>.5,'fixed bayonet still allows ADS in firing stance');
  await page.keyboard.press('v');
  assert(await page.evaluate(()=>{Taierzhuang.StepFrames(2,1/60,false);return Taierzhuang.meleeCombat.CanUse();}));
  console.log('PASS V changes stance while X installation and shooting remain independent');
  await page.getByLabel('独立战斗项目').selectOption('DadaoPush');
  await page.getByRole('button',{name:'开始／重开',exact:true}).click();
  await page.keyboard.press('f');
  const buttonInput=await page.evaluate(()=>{Taierzhuang.StepFrames(22,1/60,false);return {...Taierzhuang.Debug.MeleeCombat.State(),inputEvidence:{focus:document.activeElement?.tagName,canUse:Taierzhuang.meleeCombat.CanUse(),busy:Taierzhuang.viewmodel.IsBusy(),position:Taierzhuang.player.position.toArray(),foes:Taierzhuang.ai.soldiers.map(s=>s.position.toArray()),running:Taierzhuang.state.running}};});
  assert.equal(buttonInput.stats.pushes,1,'starting through the actual DOM button must return keyboard input to combat: '+JSON.stringify(buttonInput));
  assert.equal(buttonInput.targets[0].health,100);
  assert.match(await page.locator('.combatWeapon').textContent(),/大刀/,'HUD follows the scenario weapon');
  await page.getByRole('button',{name:'开始／重开',exact:true}).click();
  await page.keyboard.down('Alt');
  await page.getByRole('button',{name:'暂停对手',exact:true}).click();
  await page.keyboard.up('Alt');
  await page.keyboard.press('f');
  const panelInput=await page.evaluate(()=>{Taierzhuang.StepFrames(22,1/60,false);return {state:Taierzhuang.Debug.MeleeCombat.State(),panelFocused:!!document.activeElement?.closest('.meleeLab')};});
  assert.equal(panelInput.panelFocused,false,'releasing Alt leaves the focused panel control');
  assert.equal(panelInput.state.stats.pushes,1,'F works after using a panel control while holding Alt');
  const reloading=await page.evaluate(()=>{
    const T=Taierzhuang,L=T.Debug.MeleeCombat;L.Select('BayonetPush');L.Pause(true);T.StepFrames(2,1/60,false);
    T.state.ammo=0;T.state.clips=1;T.Debug.Key('KeyR');const busy=T.viewmodel.IsBusy();
    T.Debug.Key('KeyF');T.StepFrames(22,1/60,false);return {busy,pushes:L.State().stats.pushes,health:L.State().targets[0].health};
  });
  assert(reloading.busy,'reload fixture must enter the actual weapon action');
  assert.equal(reloading.pushes,0,'F cannot bypass the reload gate through the generic interaction handler');
  assert.equal(reloading.health,100);
  const result=await page.evaluate(()=>{
    const T=Taierzhuang,lab=T.Debug.MeleeCombat;
    const Step=(seconds)=>T.StepFrames(Math.round(seconds*60),1/60,false);
    const Select=(id)=>{lab.Select(id);T.StepFrames(2,1/60,false);};
    const Pause=()=>lab.Pause(true);
    const Place=(distance)=>{const s=T.ai.soldiers.find(s=>s.side==='ija');s.position.set(T.player.position.x,T.player.position.y,T.player.position.z-distance);s.yaw=Math.PI;s.body?.Teleport(s.position.x,s.position.y,s.position.z);return s;};
    Select('DadaoThree');const triple=lab.State();
    Select('DadaoOne');Pause();const s=Place(1.35);Step(.1);
    T.Debug.Mouse(0,true);Step(.05);const windHealth=s.health;T.Debug.Mouse(0,false);Step(.06);const beforeContact=s.health;Step(.15);const afterContact=s.health;
    const pose=s.actor.characterRig?.meleeAnimation?.lastClip;
    const fp=T.viewmodel?.lastMeleeClip;
    Select('BayonetOne');Pause();const b=Place(2);Step(.1);T.Debug.Mouse(0,true);Step(.05);T.Debug.Mouse(0,false);Step(.4);const stabHealth=b.health;
    Select('DadaoPush');Pause();Step(.1);const pushTarget=T.ai.soldiers[0];const z0=pushTarget.position.z;T.Debug.Key('KeyF');Step(.25);const push={health:pushTarget.health,moved:z0-pushTarget.position.z};
    Select('DadaoOne');Pause();Step(.2);
    const actor=T.ai.soldiers[0].actor;actor.root.updateMatrixWorld(true);
    const bones=actor.characterRig.bones;
    const height={};for(const name of ['pelvis','head','handR','handL','footR','footL']){const p=bones[name].getWorldPosition(actor.tmpVec?.clone?.()||T.player.position.clone());height[name]={x:p.x-actor.root.position.x,y:p.y-actor.root.position.y,z:p.z-actor.root.position.z};}
    return {boneCount:actor.characterRig.meleeAnimation.bones.length,triple:triple.targets.length,windHealth,beforeContact,afterContact,pose,fp,stabHealth,push,height,final:lab.State()};
  });
  console.log('CONTACT',JSON.stringify({...result,final:undefined}));
  fs.mkdirSync(path.join(project,'_shots'),{recursive:true});
  await page.evaluate(()=>Taierzhuang.StepFrames(2,1/60,true));
  await page.screenshot({path:path.join(project,'_shots','Scene_MeleeInitial.png')});
  assert.equal(result.boneCount,50,'all authored bones must be matched, including fingers');assert.equal(result.triple,3);assert.equal(result.windHealth,100);assert.equal(result.beforeContact,100);assert.equal(result.afterContact,48);assert.equal(result.stabHealth,50);assert.equal(result.push.health,100);assert(result.push.moved>.1&&result.push.moved<.3,'dadao F keeps the target close');
  assert(result.height.head.y>1.2&&result.height.head.y<1.9,'standing head must be human height');
  const routes=await page.evaluate(()=>{
    const T=Taierzhuang,L=T.Debug.MeleeCombat,C=T.meleeCombat,P=T.player,Step=s=>T.StepFrames(Math.round(s*60),1/60,false),out=[];
    const Place=(s,x,z)=>{s.position.set(x,0,z);s.yaw=Math.atan2(x-P.position.x,z-P.position.z);s.body.Teleport(x,0,z);};
    const play=T.audio.Play.bind(T.audio),sounds=[];T.audio.Play=(id,...args)=>{sounds.push(id);return play(id,...args);};
    try{
      for(const route of ['sidestep','beat','switch','miss','environment']){
        sounds.length=0;L.Select(route==='switch'?'DadaoTwo':route==='sidestep'?'ParryTiming':'DadaoOne');
        const es=[...T.ai.soldiers],e=es[0];
        if(route==='sidestep'){
          Place(e,P.position.x,P.position.z-1.9);Step(1);
          T.Debug.Key('KeyD',true);Step(.4);T.Debug.Key('KeyD',false);const afterDodge=P.health;
          P.yaw=Math.atan2(P.position.x-e.position.x,P.position.z-e.position.z);
          T.Debug.Key('KeyW',true);Step(.22);T.Debug.Key('KeyW',false);T.Debug.Mouse(0,true);T.Debug.Mouse(0,false);Step(.35);
          out.push({route,afterDodge,enemy:e.health,health:P.health,events:C.events.slice(),sounds:[...sounds]});
        }else if(route==='beat'){
          Place(e,P.position.x,P.position.z-1.5);Step(.05);T.Debug.Mouse(2,true);T.Debug.Mouse(2,false);Step(.08);
          T.Debug.Mouse(0,true);T.Debug.Mouse(0,false);Step(.5);
          out.push({route,enemy:e.health,health:P.health,events:C.events.slice(),sounds:[...sounds]});
        }else if(route==='switch'){
          es.forEach((s,i)=>Place(s,P.position.x+(i===0?-.7:.7),P.position.z-1.25));const pos=P.position.clone();
          P.yaw=Math.atan2(P.position.x-e.position.x,P.position.z-e.position.z);T.Debug.Mouse(0,true);T.Debug.Mouse(0,false);Step(.65);
          const first=es.map(e=>e.health),s=es[1];T.Debug.Key('KeyW',true);
          for(let i=0;i<14;i++){P.yaw=Math.atan2(P.position.x-s.position.x,P.position.z-s.position.z);Step(1/60);}
          T.Debug.Key('KeyW',false);T.Debug.Mouse(0,true);T.Debug.Mouse(0,false);
          for(let i=0;i<22;i++){P.yaw=Math.atan2(P.position.x-s.position.x,P.position.z-s.position.z);Step(1/60);}
          out.push({route,first,second:es.map(e=>e.health),health:P.health,moved:pos.distanceTo(P.position),events:C.events.slice()});
        }else{
          es.forEach(s=>T.ai.Remove(s));
          if(route==='environment')P.Spawn(1402.8,1462,-Math.PI/2);
          Step(.1);T.Debug.Mouse(0,true);T.Debug.Mouse(0,false);Step(route==='miss'?.75:.3);
          out.push({route,events:C.events.slice(),pose:L.State().player.action,sounds:[...sounds]});
        }
      }
    }finally{T.audio.Play=play;}
    return out;
  });
  console.log('ROUTES',JSON.stringify(routes));
  const dodge=routes[0],beat=routes[1],switched=routes[2],miss=routes[3],wall=routes[4];
  assert(dodge.afterDodge===100&&dodge.health===100&&dodge.enemy===48&&!dodge.events.some(e=>e.kind==='parryStart'),'real WASD can evade a committed stab and counter without parry');
  assert(beat.enemy===48&&beat.events.some(e=>e.kind==='weaponBeat')&&beat.sounds.includes('bayonetHit')&&beat.sounds.includes('dadaoHit'),'actual weapon beat buffers a damaging counter with distinct contact sounds');
  assert.deepEqual(switched.first,[48,100]);assert.deepEqual(switched.second,[48,48]);assert(switched.moved<1&&switched.health>0,'both enemies remain alive while the player switches within close combat');
  assert(miss.events.some(e=>e.kind==='miss')&&miss.sounds.includes('dadaoSwing')&&!miss.sounds.includes('dadaoHit'));
  assert(wall.pose==='Obstructed'&&wall.events.some(e=>e.kind==='environment')&&wall.sounds.includes('bodyFall')&&!wall.sounds.includes('dadaoHit'),'actual divider collision visibly rebounds with a separate sound');
  console.log('PASS movement entry / weapon beat entry / close target switching / four contact outcomes');
  const qtes = await page.evaluate(() => {
    const T=Taierzhuang,lab=T.Debug.MeleeCombat;
    let gripMax=0,wristMax=0,markerError=0;
    const Step=s=>{for(let i=0;i<Math.round(s*60);i++){
      T.StepFrames(1,1/60,false);
      if(lab.State().active){const r=T.viewmodel.riggedArms;gripMax=Math.max(gripMax,r.gripError.r,r.gripError.l);wristMax=Math.max(wristMax,r.wristBend.r,r.wristBend.l);markerError=Math.max(markerError,Math.abs(Number.parseFloat(document.querySelector('.mqProgress i').style.left)-(1-lab.State().active.progress)*100));}
    }};
    const Begin=id=>{
      lab.Select(id);Step(.75);
      if(id.endsWith('Bind')){T.Debug.Mouse(0,true);Step(.45);T.Debug.Mouse(0,false);}
      for(let i=0;i<50&&!lab.State().active;i++)Step(.05);
      return lab.State();
    };
    const report=[];
    for(const weapon of ['Dadao','Bayonet']) for(const kind of ['Bind','Ground']) for(const success of [true,false]) {
      gripMax=0;wristMax=0;markerError=0;
      const first=Begin(weapon+kind),beforeY=T.player.camera.position.y-T.player.position.y;
      const lowBodyVisible=T.viewmodel.body?.root.visible;
      if(first.active?.phase!=='input')throw new Error('No real QTE trigger '+weapon+kind+JSON.stringify(first));
      for(let i=0;i<40 && lab.State().active?.phase==='input';i++) {
        if(success){T.Debug.Key('KeyF',true);T.Debug.Key('KeyF',false);}
        Step(.2);
      }
      const resolution=lab.State();Step(1.8);
      const end=lab.State();
      report.push({weapon,kind,success,resolved:resolution.active?.success,health:end.health,enemy:end.targets[0].health,active:end.active,states:end.player.state,beforeY,afterY:T.player.camera.position.y-T.player.position.y,lowBodyVisible,gripMax,wristMax,markerError,stats:end.stats});
    }
    return report;
  });
  console.log('QTE',JSON.stringify(qtes));
  for(const q of qtes){assert.equal(q.resolved,q.success,`${q.weapon} ${q.kind}`);assert.equal(q.enemy,100);assert.equal(q.active,null);assert(q.success?q.health===100:q.health<100);if(q.kind==='Ground'){assert(q.beforeY<.7);assert(q.afterY>1.2);assert.equal(q.lowBodyVisible,false,'Standing torso must not occlude a supine camera');}}
  for(const q of qtes){assert(q.gripMax<=FPS_ARM_LIMITS.positionResidualM,`${q.weapon}${q.kind}: QTE grip drift ${q.gripMax}`);assert(q.wristMax<=FPS_ARM_LIMITS.wristBendDeg+.01,`${q.weapon}${q.kind}: QTE wrist ${q.wristMax}`);}
  for(const q of qtes)assert(q.markerError<=.501,'Control marker must move toward our side on the left');
  const pressure=await page.evaluate(()=>{
    const T=Taierzhuang,L=T.Debug.MeleeCombat,C=T.meleeCombat,out=[];
    for(const id of ['DadaoBind','BayonetGround']){
      L.Select(id);T.StepFrames(45,1/60,false);
      if(id.endsWith('Bind')){T.Debug.Mouse(0,true);T.StepFrames(28,1/60,false);T.Debug.Mouse(0,false);}
      for(let i=0;i<160&&!C.Active;i++)T.StepFrames(1,1/60,false);
      const actor=T.ai.soldiers[0].actor,points=[];
      for(const progress of [.85,.15]){
        C.qte.active.progress=progress;T.StepFrames(6,1/60,false);
        actor.root.updateWorldMatrix(true,true);
        points.push({head:actor.characterRig.bones.head.getWorldPosition(T.player.position.clone()).toArray(),
          muzzle:actor.weaponGroup.localToWorld(actor.weaponMuzzle.clone()).toArray(),fp:T.viewmodel.actionPivot.position.toArray()});
      }
      const Distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
      out.push({id,head:Distance(points[0].head,points[1].head),muzzle:Distance(points[0].muzzle,points[1].muzzle),fp:Distance(points[0].fp,points[1].fp)});
    }
    return out;
  });
  console.log('PRESSURE',JSON.stringify(pressure));
  assert(pressure[0].head>.04&&pressure.every(p=>p.muzzle>.04&&p.fp>.06),'QTE pressure must move actual body, enemy weapon and first person arms');
  // Each independent melee scenario really spawns and routes its advertised weapon/actors.
  const fights=await page.evaluate(()=>{
    const T=Taierzhuang,L=T.Debug.MeleeCombat;
    const results=[];
    for(const id of ['DadaoOne','DadaoTwo','DadaoThree','BayonetOne','BayonetTwo','AlliedDadao','AlliedBayonet']){
      L.Select(id);T.StepFrames(60*3,1/60,false);
      // 多打一分工在真实 Soldier/StepBody 上成形：三秒时一人正面、其余侧翼且已离开正面弧。
      const mid=L.State(),P=T.player;
      const Bearing=(t)=>Math.atan2(-Math.cos(P.yaw)*(t.x-P.position.x)+Math.sin(P.yaw)*(t.z-P.position.z),-Math.sin(P.yaw)*(t.x-P.position.x)-Math.cos(P.yaw)*(t.z-P.position.z))*180/Math.PI;
      const squad=mid.targets.filter(t=>t.side==='ija'&&t.alive).map(t=>({role:t.pose?.role||null,bearing:Math.round(Bearing(t)),distance:+t.distance.toFixed(2)}));
      T.StepFrames(60*6,1/60,false);const s=L.State();
      results.push({id,attacks:s.stats.attacks,hits:s.stats.hits,allies:s.targets.filter(t=>t.side==='nra').length,targets:s.targets.length,health:s.health,alive:s.alive,squad});
    }
    return results;
  });
  console.log('FIGHTS',JSON.stringify(fights));
  for(const f of fights){assert(f.attacks>0,f.id);assert(f.hits>0,f.id);
    const ija=f.squad.length;
    if(ija>=2){assert.equal(f.squad.filter(t=>t.role==='front').length,1,`${f.id}: one front pinner`);
      const flanks=f.squad.filter(t=>t.role==='flank');assert.equal(flanks.length,ija-1,`${f.id}: the rest flank`);
      assert(flanks.every(t=>Math.abs(t.bearing)>40),`${f.id}: flankers leave the front arc ${JSON.stringify(f.squad)}`);
      if(flanks.length===2)assert(Math.sign(flanks[0].bearing)!==Math.sign(flanks[1].bearing),`${f.id}: flankers take both sides`);}
    else assert(f.squad.every(t=>t.role===null),`${f.id}: no roles without a squad`);}
  const victories=await page.evaluate(()=>{
    const T=Taierzhuang,L=T.Debug.MeleeCombat,out=[];
    for(const id of ['DadaoOne','DadaoTwo','DadaoThree','BayonetOne']){
      L.Select(id);let forward=false,side=false;
      for(let frame=0;frame<60*45&&T.player.Alive;frame++){
        const enemies=T.ai.soldiers.filter(s=>s.side==='ija'&&s.alive).sort((a,b)=>a.position.distanceTo(T.player.position)-b.position.distanceTo(T.player.position));
        if(!enemies.length)break;
        const e=enemies[0],d=e.position.distanceTo(T.player.position),f=T.meleeCombat.Fighter(T.player);
        T.player.yaw=Math.atan2(T.player.position.x-e.position.x,T.player.position.z-e.position.z);T.player.pitch=0;
        const move=d>1.22,strafe=enemies.length>1&&d<2.5;
        if(move!==forward){forward=move;T.Debug.Key('KeyW',move);}
        if(strafe!==side){side=strafe;T.Debug.Key('KeyD',strafe);}
        if(L.State().active){if(frame%12===0){T.Debug.Key('KeyF',true);T.Debug.Key('KeyF',false);}}
        else if(f.state==='idle'){
          const incoming=enemies.find(s=>{const g=T.meleeCombat.Fighter(s);return g.attack&&g.t>g.attack.windup-.13&&g.t<g.attack.windup&&s.position.distanceTo(T.player.position)<g.attack.reach;});
          if(incoming){T.Debug.Mouse(2,true);T.Debug.Mouse(2,false);}
          else if(d<1.5){T.Debug.Mouse(0,true);T.Debug.Mouse(0,false);}
        }
        T.StepFrames(1,1/60,false);
      }
      T.Debug.Key('KeyW',false);T.Debug.Key('KeyD',false);
      const s=L.State();out.push({id,alive:s.alive,health:s.health,left:s.targets.filter(t=>t.alive&&t.side==='ija').length,stats:s.stats});
    }
    return out;
  });
  console.log('VICTORIES',JSON.stringify(victories));
  for(const v of victories){assert(v.alive&&v.left===0,`${v.id}: active movement/parry/light route must win`);}
  const edgeCases=await page.evaluate(()=>{
    const T=Taierzhuang,L=T.Debug.MeleeCombat,Step=s=>T.StepFrames(Math.round(s*60),1/60,false);
    const Begin=()=>{L.Select('DadaoGround');for(let i=0;i<160&&!L.State().active;i++)Step(1/60);};
    const assists=[];
    for(const mode of ['hold','auto']){
      L.SetAssist(mode);Begin();if(mode==='hold')T.Debug.Key('KeyF',true);
      Step(5);T.Debug.Key('KeyF',false);
      assists.push({mode,successes:L.State().stats.successes,health:T.player.health});
    }
    L.SetAssist('tap');Begin();T.player.health=40;Step(3);
    const death={alive:T.player.Alive,active:L.State().active,visible:T.viewmodel.root.visible};
    L.Select('DadaoOne');Step(.2);const reset={alive:T.player.Alive,health:T.player.health,visible:T.viewmodel.root.visible,hint:T.hud?.el?.hint?.textContent};
    T.Debug.Mouse(0,true);Step(.1);T.meleeCombat.HandleInput('Blur',false);T.Debug.Mouse(0,false);Step(.2);
    const blur=T.meleeCombat.State().player.state;
    return {assists,death,reset,blur};
  });
  console.log('EDGE',JSON.stringify(edgeCases));
  for(const a of edgeCases.assists){assert.equal(a.successes,1);assert.equal(a.health,100);}
  assert.equal(edgeCases.death.alive,false);assert.equal(edgeCases.death.active,null);assert.equal(edgeCases.death.visible,false);
  assert(edgeCases.reset.alive&&edgeCases.reset.visible);assert.equal(edgeCases.reset.health,100);assert.equal(edgeCases.blur,'idle');
  }
  fs.mkdirSync(path.join(project,'_shots'),{recursive:true});
  // Evidence frames use normal rendering and the same production actors, weapon mounts and FP hands.
  for(const entry of [
    ['Guard','DadaoOne',null],['Light','DadaoOne','Light'],['Heavy','DadaoOne','Heavy'],['Parry','DadaoOne','Parry'],
    ['Bayonet','BayonetOne',null],['Standing','DadaoBind',null],['Ground','DadaoGround',null],['Allied','AlliedDadao',null]
  ]) {
    const evidence=await page.evaluate(([name,id,clip])=>{
      const T=Taierzhuang,L=T.Debug.MeleeCombat;L.Select(id);
      if(name==='Standing'){T.StepFrames(45,1/60,false);T.Debug.Mouse(0,true);T.StepFrames(28,1/60,false);T.Debug.Mouse(0,false);T.StepFrames(22,1/60,false);}
      else if(name==='Ground'){for(let i=0;i<160&&!L.State().active;i++)T.StepFrames(1,1/60,false);T.StepFrames(5,1/60,false);}
      else{L.Pause(true);T.StepFrames(60,1/60,false);if(clip){L.Preview(clip);T.state.elapsed=0;T.StepFrames(20,1/60,false);}}
      // Diagnostic frames have skipped rendering during simulation; discard stale camera history.
      T.post.hasPrev=false;T.post.hasTaaHistory=false;
      T.StepFrames(1,1/60,true);
      const s=T.ai.soldiers[0],a=s.actor,r=a.characterRig;
      const V=()=>T.player.position.clone();
      return {name,clip:s.meleeCombat?.clip,lastClip:r.meleeAnimation.lastClip,hands:['weaponR','weaponL'].map(k=>r.Grip(k).getWorldPosition(V()).sub(s.position).toArray()),muzzle:a.weaponGroup.localToWorld(a.weaponMuzzle.clone()).sub(s.position).toArray(),player:T.player.position.clone().sub(s.position).toArray()};
    },entry);
    console.log('POSE',JSON.stringify(evidence));
    await page.screenshot({path:path.join(project,'_shots',`Scene_Melee${entry[0]}.png`)});
  }
  assert.equal(errors.length,0,errors.join('\n'));
  console.log(posesOnly?'PASS melee pose evidence':'PASS melee input / contact / push / retarget / rendering');
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
