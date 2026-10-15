// Production mouse/key routes and actual decoded audio sources. Local evidence only.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const project = path.dirname(fileURLToPath(import.meta.url)), root = path.dirname(project);
const out = path.join(project, "_shots", "FirearmResponse"); fs.mkdirSync(out, { recursive: true });
const server = process.env.FIREARM_PREVIEW_URL ? null : await ServeRoot(root, 0);
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [], checks = [];
page.on("pageerror", e => errors.push(String(e)));
function Check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name} ${JSON.stringify(detail ?? "")}`);
}
let report;
try {
  const base = process.env.FIREARM_PREVIEW_URL || `http://127.0.0.1:${server.address().port}`;
  await page.goto(`${base}/Taierzhuang1938/?shot=1&weapons=1&manual=1&quality=high&scale=small`, {waitUntil:"load",timeout:120000});
  await page.waitForFunction(() => window.Tengxian?.state?.ready, null, { timeout:240000 });
  console.log("SCENE firearm range ready");
  report = await page.evaluate(async () => {
    const g=window.Tengxian,D=g.Debug,range=D.WeaponRange;
    const { WEAPONS }=await import("./Data_Weapons.mjs");
    const { PlayerController }=await import("./Script_Player.mjs");
    const { RELOAD_EVENTS }=await import("./Data_Tuning_FirearmActions.mjs");
    const Step=(n,dt=1/60,render=false)=>g.StepFrames(n,dt,render);
    const Click=()=>{D.Mouse(0,true);Step(1);D.Mouse(0,false);Step(1);};
    const Equip=id=>{
      D.Mouse(0,false);D.Mouse(2,false);D.Key("KeyW",false);D.Key("ShiftLeft",false);Step(400);
      range.GoTo("table",id);Step(15);D.Key("KeyF");Step(120);range.GoTo("firing");range.SetMoving(false);range.SetAmmoMode("infinite");Step(150);
      if(D.Slots().weapon!==id)throw new Error(`Equip failed: ${id}`);
    };
    const events=[],voices=[],images=[];
    const originalPlay=g.audio.Play.bind(g.audio), originalGunshot=g.audio.PlayGunshot.bind(g.audio);
    g.audio.enabled=true;g.audio.CreateContext();await g.audio.LoadSfxPack();
    g.audio.Play=(cue,options={})=>{
      const voice=originalPlay(cue,options);
      if(/^(rifle|zb26|type11|type92)/.test(cue))voices.push({cue,firstPerson:!!options.firstPerson,burst:voice?.burst??null,
        sources:voice?.nodes.filter(n=>n.constructor.name==="AudioBufferSourceNode").length??0});
      return voice;
    };
    const data={audioReady:g.audio.sfxReady,audioErrors:g.audio.sfxErrors,firearms:[],mounted:[],cadence:[],reloads:[],images};
    const starts=[],createSource=g.audio.ctx.createBufferSource.bind(g.audio.ctx);
    g.audio.ctx.createBufferSource=()=>{const source=createSource(),start=source.start.bind(source);
      source.start=(at,offset,duration)=>{starts.push({offset,duration});return start(at,offset,duration);};return source;};
    originalPlay("bolt",{firstPerson:true,priority:true,offset:.50,maxDuration:.26});
    g.audio.ctx.createBufferSource=createSource;
    data.audioSlice=starts;
    for(const id of ["ZhongZheng","HanYang","Type38","Zb26","Type11","Type92Hmg"]){
      Equip(id);Step(2,1/60,true);g.audio.SetListener(g.camera);voices.length=0;
      const before=g.state.playerShots;D.Mouse(2,true);D.Mouse(0,true);Step(3);D.Mouse(0,false);
      data.firearms.push({id,shots:g.state.playerShots-before,voices:voices.slice(),expectedCue:WEAPONS[id].shotCue});
    }
    for(const kindId of ["Zb26Nest","Type92Hmg"]){
      Equip("HanYang");const id=`Response_${kindId}`;
      D.Emplacement.Create({id,kindId,side:"nra",position:{x:2400,y:0,z:2458},belts:5});
      if(!D.Emplacement.Occupy(id))throw new Error(`Mount failed ${kindId}`);
      Step(100);Step(2,1/60,true);g.audio.SetListener(g.camera);voices.length=0;
      const gun=g.emplacement.Emplacement(id),before=gun.rounds;
      D.Emplacement.Fire(true);Step(1);D.Emplacement.Fire(false);
      const row={kindId,rounds:before-gun.rounds,voices:voices.slice()};
      D.Key("KeyR");row.reloadBefore=gun.rounds;Step(1);row.reloadStarted=g.viewmodel.action?.kind;
      const sheet=document.createElement("canvas");sheet.width=1280;sheet.height=720;const c=sheet.getContext("2d");
      for(const [index,t] of [.35,.58,.73,.90].entries()){
        while(g.viewmodel.action?.kind==="reload"&&g.viewmodel.action.t<t)Step(1);
        Step(1,1/60,true);const source=document.getElementById("view"),x=index%2*640,y=Math.floor(index/2)*360;
        c.drawImage(source,0,0,source.width,source.height,x,y,640,360);c.fillStyle="rgba(0,0,0,.8)";c.fillRect(x+4,y+4,430,25);
        c.fillStyle="#fff";c.font="15px sans-serif";c.fillText(`${kindId} reload ${t}`,x+12,y+22);
      }
      row.reloadAfter=gun.rounds;row.family=g.viewmodel.actionSpec.reload.family;
      row.stripVisible=g.viewmodel.feedStripProp.visible;
      images.push({id:kindId,png:sheet.toDataURL("image/png")});
      D.Emplacement.Vacate("test");Step(360);data.mounted.push(row);
    }
    // Timing stress runs need no real-time sound graph. The production calls
    // remain observed while hundreds of simulated frames are advanced at once.
    g.audio.Play=(cue,options={})=>{events.push({cue,t:g.state.elapsed,options});return null;};
    g.audio.PlayGunshot=(cue,options={})=>g.audio.Play(cue,options);
    for(const id of ["HanYang","Zb26","Type11","Type92Hmg"])for(const startingAmmo of id==="Type11"?[0,1]:[1]){
      Equip(id);range.SetAmmoMode("reload");g.state.ammo=startingAmmo;events.length=0;
      const start=g.state.elapsed;D.Key("KeyR");const immediate=g.state.ammo;
      let commitS=null,maxOperatingTravelM=0;
      for(let n=0;n<Math.ceil((WEAPONS[id].reloadTimeS+.2)*60);n++){
        Step(1);if(commitS===null&&g.state.ammo>startingAmmo)commitS=g.state.elapsed-start;
        maxOperatingTravelM=Math.max(maxOperatingTravelM,g.viewmodel.rig.parts.operatingHandle?.position.z||0);
      }
      data.reloads.push({id,startingAmmo,immediate,commitS,maxOperatingTravelM,expectedCommitS:RELOAD_EVENTS[WEAPONS[id].reloadKind].find(e=>e.id==="loaded").at*WEAPONS[id].reloadTimeS,
        ammo:g.state.ammo,capacity:WEAPONS[id].magazine,complete:!g.viewmodel.action,sounds:events.filter(e=>/bolt|magIn|stripperLoad/.test(e.cue)).map(e=>({cue:e.cue,at:e.t-start}))});
    }
    Equip("HanYang");range.SetAmmoMode("reload");g.state.ammo=1;D.Key("KeyR");Step(20);D.Key("Digit3");Step(15);
    const early={slot:D.Slots().active,ammo:g.state.mags.primary.ammo};D.Key("Digit1");Step(100);
    D.Key("KeyR");Step(155);const inserted=g.state.ammo;D.Key("Digit3");Step(15);
    data.cancel={early,late:{slot:D.Slots().active,ammo:g.state.mags.primary.ammo,inserted}};
    Equip("HanYang");range.SetAmmoMode("reload");Click();Step(24);const before=g.state.ammo;D.Key("KeyR");Step(75);
    data.queuedReload={before,action:g.viewmodel.action?.kind,ammo:g.state.ammo};Step(300);
    Equip("HanYang");range.SetAmmoMode("reload");g.state.ammo=2;Click();Step(100);
    const penultimate={ammo:g.state.ammo,boltOpen:g.viewmodel.boltOpen};Click();Step(100);
    data.lastRound={penultimate,last:{ammo:g.state.ammo,boltOpen:g.viewmodel.boltOpen}};
    for(const id of ["Zb26","Type11"])for(const fps of [30,60,120]){
      Equip(id);const times=[];let old=g.state.playerShots;const start=g.state.elapsed;
      D.Mouse(0,true);for(let i=0;i<fps*4;i++){Step(1,1/fps);if(g.state.playerShots!==old){times.push(g.state.elapsed-start);old=g.state.playerShots;}}D.Mouse(0,false);
      data.cadence.push({id,fps,shots:times.length,maxPhaseError:Math.max(...times.map((t,i)=>Math.abs(t-times[0]-i*WEAPONS[id].fireIntervalS)))});
    }
    Equip("Zb26");D.Mouse(0,true);Step(180);const peak=g.player.pitch;D.Look(0,80);Step(1);
    const pulled=g.player.pitch;Step(60);const continued=g.player.pitch;D.Mouse(0,false);Step(240);
    data.recoil={peak,pulled,continued,recovered:g.player.pitch,pending:g.player.recoilPending.pitch};
    Equip("Zb26");D.Key("Digit0");const semiBefore=g.state.playerShots;Click();Step(3);Click();Step(30);
    data.semi={mode:g.state.fireMode,shots:g.state.playerShots-semiBefore};
    Equip("Zb26");D.Key("KeyW",true);D.Key("ShiftLeft",true);Step(90);D.Key("ShiftLeft",false);D.Mouse(0,true);
    const sprintStart=g.state.elapsed,times=[];let old=g.state.playerShots;
    for(let n=0;n<60;n++){Step(1);if(g.state.playerShots>old){times.push(g.state.elapsed-sprintStart);old=g.state.playerShots;}}
    D.Mouse(0,false);D.Key("KeyW",false);data.sprint=times;
    Equip("Zb26");D.Key("KeyW",true);D.Key("ShiftLeft",true);Step(90);D.Key("ShiftLeft",false);
    const tapBefore=g.state.playerShots;D.Mouse(0,true);Step(3);D.Mouse(0,false);Step(60);D.Key("KeyW",false);
    data.sprintTap=g.state.playerShots-tapBefore;
    data.shoulder=[];
    for(const id of ["Zb26","Type11"]){
      const p=new PlayerController(g.camera,g.player.world);p.grounded=true;p.position.set(2400,0,2460);
      for(let i=0;i<150;i++)p.Update(1/60,{ads:true,forward:0,strafe:0,lookX:0,lookY:0},WEAPONS[id],{allowUndeployedAds:false});
      const unsupported=p.SpreadDeg(WEAPONS[id]);p.bipod=true;
      const supported=p.SpreadDeg(WEAPONS[id]);
      p.Update(1/60,{ads:true,forward:1,strafe:0,lookX:0,lookY:0},WEAPONS[id]);
      data.shoulder.push({id,ads:p.ads,unsupported,supported,hasBipod:!!WEAPONS[id].bipod,movingReleased:!p.bipod});
    }
    Equip("HanYang");g.player.Spawn(2351.8,2460,Math.PI/2);Step(150);Step(1,1/60,true);
    const shots0=g.state.playerShots;Click();Step(1,1/60,true);
    data.cover={blocked:g.player.gunClearance.blocked,shots:g.state.playerShots-shots0,reticle:D.Reticle()};
    g.player.yaw=-Math.PI/2;Step(150);const shots1=g.state.playerShots;Click();data.cover.restored=g.state.playerShots-shots1;
    Step(150);g.player.Spawn(2351.3,2460,Math.PI/2);Step(150);
    const blockedTapBefore=g.state.playerShots;Click();g.player.yaw=-Math.PI/2;Step(60);
    data.cover.blockedTapDidNotQueue=g.state.playerShots===blockedTapBefore;
    g.player.Spawn(2351.3,2460,Math.PI/2);Step(150);g.player.yaw=-Math.PI/2;
    const clearTapBefore=g.state.playerShots;Click();Step(60);data.cover.clearTap=g.state.playerShots-clearTapBefore;
    g.audio.Play=originalPlay;g.audio.PlayGunshot=originalGunshot;
    return data;
  });
  for(const item of report.images){fs.writeFileSync(path.join(out,`Scene_${item.id}Reload.png`),Buffer.from(item.png.split(",")[1],"base64"));}
  delete report.images;
  Check("Decoded production audio is ready",report.audioReady&&report.audioErrors.length===0,report.audioErrors);
  Check("Reload mechanics use the requested recording segment",report.audioSlice.some(s=>Math.abs(s.offset-.50)<1e-6&&s.duration>.15&&s.duration<=.260001),report.audioSlice);
  for(const row of report.firearms){
    const voice=row.voices.find(v=>v.cue===row.expectedCue);
    Check(`${row.id}: simultaneous ADS tap fires one round with one correct sample`,row.shots===1&&voice?.sources===1&&voice.firstPerson,row);
  }
  for(const row of report.mounted){
    Check(`${row.kindId}: mounted fire uses one first-person sample`,row.rounds===1&&row.voices.some(v=>v.sources===1&&v.firstPerson&&v.burst===1),row);
    Check(`${row.kindId}: reload inserts ammo during the mechanical action`,row.reloadBefore<row.reloadAfter&&row.reloadStarted==="reload",row);
    if(row.kindId==="Type92Hmg")Check("Type92 uses a visible lateral feed strip",row.family==="stripFeed"&&row.stripVisible,row);
  }
  for(const row of report.reloads){
    Check(`${row.id}: ammo and sounds wait for reload events`,row.immediate===row.startingAmmo&&Math.abs(row.commitS-row.expectedCommitS)<.04
      &&row.ammo===row.capacity&&row.complete&&row.sounds.length>0&&row.sounds.every(s=>s.at>0),row);
    if(row.id==="Type11")Check(`Type11/${row.startingAmmo}: operating handle uses the original ammo snapshot`,
      row.startingAmmo?row.maxOperatingTravelM===0:row.maxOperatingTravelM>.108,row);
  }
  Check("Cancel before insertion keeps old ammo; after insertion keeps loaded rounds",report.cancel.early.slot==="melee"&&report.cancel.early.ammo===1
    &&report.cancel.late.slot==="melee"&&report.cancel.late.ammo===5,report.cancel);
  Check("R during the bolt action starts reload when the bolt finishes",report.queuedReload.action==="reload"&&report.queuedReload.ammo===report.queuedReload.before,report.queuedReload);
  Check("Only the final round leaves the bolt open",report.lastRound.penultimate.ammo===1&&!report.lastRound.penultimate.boltOpen
    &&report.lastRound.last.ammo===0&&report.lastRound.last.boltOpen,report.lastRound);
  for(const row of report.cadence)Check(`${row.id}: phase stays within one frame at ${row.fps} FPS`,Math.abs(row.shots-4/.12)<=1&&row.maxPhaseError<=1/row.fps+1e-6,row);
  Check("Counter-steering makes room for fresh automatic recoil",report.recoil.peak>.15&&report.recoil.pulled<report.recoil.peak-.05
    &&report.recoil.continued>report.recoil.pulled+.02&&Math.abs(report.recoil.pending)<.001,report.recoil);
  Check("A rapid second semi-auto tap is retained until ready",report.semi.mode==="semi"&&report.semi.shots===2,report.semi);
  Check("Sprint release has one readiness window then regular cadence",report.sprint[0]>=.22&&report.sprint[0]<.28
    &&report.sprint.slice(1).every((t,i)=>Math.abs(t-report.sprint[i]-.12)<.025),report.sprint);
  Check("A short tap on sprint release survives the raising animation",report.sprintTap===1,report.sprintTap);
  for(const row of report.shoulder)Check(`${row.id}: campaign-rule standing ADS and bipod benefit`,row.ads>.99&&row.hasBipod
    &&row.supported<row.unsupported*.5&&row.movingReleased,row);
  Check("Cover uses the same blocked state and recovers after turning away",report.cover.blocked&&report.cover.shots===0
    &&report.cover.restored===1&&report.cover.blockedTapDidNotQueue&&report.cover.clearTap===1,report.cover);
  Check("No browser errors",errors.length===0,errors);
  assert.ok(checks.every(c=>c.ok),`${checks.filter(c=>!c.ok).length} firearm response checks failed`);
} finally {
  fs.writeFileSync(path.join(out,"Data_FirearmResponse.json"),JSON.stringify({checks,report,errors},null,2));
  await browser.close();server?.close();
}
