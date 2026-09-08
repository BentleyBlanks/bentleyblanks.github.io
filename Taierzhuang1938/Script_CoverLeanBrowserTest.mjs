import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
const project = path.dirname(fileURLToPath(import.meta.url));
const server = await ServeRoot(path.resolve(project,".."),0);
const browser = await LaunchBrowser();
const page = await browser.newPage({viewport:{width:1280,height:720}});
const errors=[]; page.on("pageerror",e=>errors.push(String(e)));
const outDir=path.join(project,"_shots","CoverLean");mkdirSync(outDir,{recursive:true});
try {
  await page.goto("http://127.0.0.1:"+server.address().port+"/Taierzhuang1938/?range=1&shot=1&quality=medium&scale=small&audio=0",{waitUntil:"load",timeout:120000});
  await page.waitForFunction(()=>window.Taierzhuang?.state?.ready,null,{timeout:180000});
  await page.evaluate(async()=>{
    const T=window.Taierzhuang, three=await import("three");
    const fixture=window.LeanFixture={handles:[],meshes:[]};
    fixture.Setup=(side=1,yaw=0,mode="edge")=>{
      for(const h of fixture.handles)T.physics.RemoveSolid(h);
      for(const m of fixture.meshes){m.removeFromParent();m.geometry.dispose();m.material.dispose();}
      fixture.handles=[];fixture.meshes=[];
      if(fixture.target)T.ai.Remove(fixture.target);
      T.Debug.Mouse(2,false);for(const key of ["KeyQ","KeyE","KeyW","KeyS","ShiftLeft"])T.Debug.Key(key,false);
      T.viewmodel.action=null;T.viewmodel.pendingBoltAt=-1;T.player.carrySpeedScale=1;
      const rx=Math.cos(yaw),rz=-Math.sin(yaw),fx=-Math.sin(yaw),fz=-Math.cos(yaw);
      fixture.yaw=yaw;fixture.side=side;
      const Add=(x,z,hx,hz)=>{
        const c=[1470+rx*x+fx*z,1.4,1400+rz*x+fz*z],h=[hx,1.4,hz];
        const box={c,h,ry:yaw,tag:"testCover",min:[c[0]-hx,0,c[2]-hz],max:[c[0]+hx,2.8,c[2]+hz]};
        fixture.handles.push(T.physics.AddSolid(box));
        const mesh=new three.Mesh(new three.BoxGeometry(hx*2,2.8,hz*2),new three.MeshStandardMaterial({color:0x8b8e8a,roughness:1}));
        mesh.position.fromArray(c);mesh.rotation.y=yaw;T.scene.add(mesh);fixture.meshes.push(mesh);
      };
      if(mode!=="open")Add(mode==="solid"?0:-side*1.425,.75,mode==="solid"?3:1.575,.25);
      if(mode==="blocked")Add(side*.53,-.05,.025,.24);
      T.physics.RefreshStaticQueries();T.player.Spawn(1470,1400,yaw);
      fixture.target=T.ai.Spawn("ija",1470+rx*side*.42+fx*10,1400+rz*side*.42+fz*10,{weapon:"Type38",squadId:"LeanTarget"});
      fixture.target.dummy=true;fixture.target.order="hold";fixture.target.yaw=yaw+Math.PI;
      T.StepFrames(20);
      T.player.pitch=0;T.player.aimPitch=0;T.player.aimYaw=0;
      T.state.ammo=5;T.state.clips=10;
    };
    fixture.State=()=>({side:T.player.autoLean,lean:T.player.lean,offset:T.player.LeanOffsetM,
      position:T.player.position.toArray(),eye:T.player.EyePosition.toArray(),camera:T.camera.position.toArray(),roll:T.camera.rotation.z,
      ads:T.player.ads});
    fixture.Setup();
  });
  const Check=async(name,fn)=>{const result=await page.evaluate(fn);assert.ok(result.ok,name+" "+JSON.stringify(result));console.log("ok "+name+" "+JSON.stringify(result));return result;};
  await page.screenshot({path:path.join(outDir,"CoverLean_Before.png")});
  await Check("wall edge stays upright without ADS",()=>({ok:Taierzhuang.player.autoLean===0&&Taierzhuang.player.lean===0}));
  await Check("right ADS leans camera and eye together, feet stay",()=>{const T=Taierzhuang,p=T.player,start=p.position.clone();T.Debug.Mouse(2,true);T.StepFrames(65);return {ok:p.autoLean===1&&p.LeanOffsetM>.4&&p.position.distanceTo(start)<.01&&Math.abs(T.camera.position.x-p.EyePosition.x)<.01,state:LeanFixture.State()};});
  await page.screenshot({path:path.join(outDir,"CoverLean_Right.png")});
  await Check("exposed barrel fires past edge",()=>{const T=Taierzhuang,n=T.state.playerShots,target=LeanFixture.target,hp=target.health;T.player.pitch=-.045;T.StepFrames(2);T.Debug.Fire();T.StepFrames(2);return {ok:T.state.playerShots===n+1&&!T.Debug.LastShot().muzzleBlocked&&T.Debug.LastShot().hitKind==="soldier"&&target.health<hp,healthBefore:hp,healthAfter:target.health,shot:T.Debug.LastShot()};});
  await Check("release ADS returns to cover",()=>{Taierzhuang.Debug.Mouse(2,false);Taierzhuang.StepFrames(65);return {ok:Math.abs(Taierzhuang.player.lean)<.002,state:LeanFixture.State()};});
  await Check("left ADS mirrors right",()=>{LeanFixture.Setup(-1);Taierzhuang.Debug.Mouse(2,true);Taierzhuang.StepFrames(65);return {ok:Taierzhuang.player.autoLean===-1&&Taierzhuang.player.LeanOffsetM<-.4,state:LeanFixture.State()};});
  await page.screenshot({path:path.join(outDir,"CoverLean_Left.png")});
  await Check("rotated wall uses world-facing basis",()=>{LeanFixture.Setup(1,Math.PI/3);Taierzhuang.Debug.Mouse(2,true);Taierzhuang.StepFrames(65);const p=Taierzhuang.player;return {ok:p.autoLean===1&&p.EyePosition.z<p.position.z-.3,state:LeanFixture.State()};});
  await Check("Q overrides automatic right lean",()=>{LeanFixture.Setup();const T=Taierzhuang;T.Debug.Mouse(2,true);T.StepFrames(65);T.Debug.Key("KeyQ",true);T.StepFrames(65);return {ok:T.player.autoLean===0&&T.player.lean<-.9,state:LeanFixture.State()};});
  await Check("solid wall blocks auto lean and barrel tunnelling",()=>{LeanFixture.Setup(1,0,"solid");const T=Taierzhuang;T.Debug.Mouse(2,true);T.StepFrames(65);T.Debug.Fire();T.StepFrames(2);return {ok:T.player.autoLean===0&&T.Debug.LastShot().muzzleBlocked&&T.Debug.LastShot().hitKind==="wall",state:LeanFixture.State()};});
  await Check("open ground has no automatic lean",()=>{LeanFixture.Setup(1,0,"open");Taierzhuang.Debug.Mouse(2,true);Taierzhuang.StepFrames(65);return {ok:Taierzhuang.player.autoLean===0};});
  await Check("crouched ADS uses crouched eye height",()=>{LeanFixture.Setup();const T=Taierzhuang;T.Debug.Key("KeyC");T.Debug.Mouse(2,true);T.StepFrames(65);return {ok:T.player.stance==="crouch"&&T.player.autoLean===1,state:LeanFixture.State()};});
  await Check("reload retracts even with right mouse held",()=>{const T=Taierzhuang;T.state.ammo=2;T.Debug.Key("KeyR");T.StepFrames(35);return {ok:T.viewmodel.action?.kind==="reload"&&T.player.autoLean===0&&Math.abs(T.player.lean)<.02,state:LeanFixture.State()};});
  await Check("walking away releases cover",()=>{LeanFixture.Setup();const T=Taierzhuang;T.Debug.Mouse(2,true);T.StepFrames(65);T.Debug.Key("KeyS",true);T.StepFrames(100);T.Debug.Key("KeyS",false);return {ok:T.player.autoLean===0&&Math.abs(T.player.lean)<.01,state:LeanFixture.State()};});
  await Check("prone disables automatic lean",()=>{LeanFixture.Setup();const T=Taierzhuang;T.player.SetStance("prone");T.Debug.Mouse(2,true);T.StepFrames(65);return {ok:T.player.autoLean===0&&T.player.lean===0};});
  await Check("nearby side wall prevents head penetration",()=>{LeanFixture.Setup(1,0,"blocked");const T=Taierzhuang;T.Debug.Mouse(2,true);T.StepFrames(65);return {ok:T.player.autoLean===0&&Math.abs(T.player.LeanOffsetM)<.01,state:LeanFixture.State()};});
  await Check("lean exposes the head to AI and retract hides it without stale LOS",()=>{
    LeanFixture.Setup();const T=Taierzhuang,p=T.player;
    const s={position:p.position.clone().set(1470.42,0,1390),stance:0,losCache:[{},{},{}],losSlot:0};
    const target={id:-1,isPlayer:true,ref:p,position:p.position,stance:0};
    const before=T.ai.HasLineOfSight(s,target);
    T.Debug.Mouse(2,true);T.StepFrames(65);const exposed=T.ai.HasLineOfSight(s,target);
    T.Debug.Mouse(2,false);T.StepFrames(65);const hidden=T.ai.HasLineOfSight(s,target);
    return {ok:!before&&exposed&&!hidden,before,exposed,hidden};
  });
  await Check("jump cancels automatic lean",()=>{
    LeanFixture.Setup();const T=Taierzhuang;T.Debug.Mouse(2,true);T.StepFrames(65);
    T.player.TryJump();T.StepFrames(1);return {ok:!T.player.grounded&&T.player.autoLean===0};
  });
  await Check("manual E is clipped by a side wall",()=>{
    LeanFixture.Setup(1,0,"blocked");const T=Taierzhuang;T.Debug.Key("KeyE",true);T.StepFrames(65);
    return {ok:T.player.LeanOffsetM>0&&T.player.LeanOffsetM<.38,offset:T.player.LeanOffsetM};
  });
  await Check("spawn clears lean state",()=>{LeanFixture.Setup();const T=Taierzhuang;T.Debug.Mouse(2,true);T.StepFrames(65);T.player.Spawn(1470,1403,0);return {ok:T.player.lean===0&&T.player.autoLean===0};});
  assert.deepEqual(errors,[]);writeFileSync(path.join(outDir,"Data_CoverLeanResult.json"),JSON.stringify({errors,passed:true},null,2));
  console.log("CoverLeanBrowserTest OK");
} finally { await browser.close();await new Promise(resolve=>server.close(resolve)); }
