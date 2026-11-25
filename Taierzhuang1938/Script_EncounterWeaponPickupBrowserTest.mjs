// Encounter Designer Play: picking up and swapping guns with F inside a beat action area.
// 08d (撤门板桥) keeps F for removePlanks around the plank bridge; a gun the player is looking straight at
// must still be picked up / swapped there (same aimed-pickup rule as the main game), while F without an
// aimed gun still performs the beat action. Input goes through the real key path (Debug.Key → Capture → OnAction).
import assert from "node:assert/strict";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {LaunchBrowser} from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import {ServeRoot} from "./Script_DevServer.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const server=process.env.ENCOUNTER_TEST_BASE?null:await ServeRoot(root,0),browser=await LaunchBrowser();
const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
const errors=[];page.on("pageerror",e=>errors.push(e.message));
await page.addInitScript(()=>{
  localStorage.setItem("tengxian1938_audio_v1",JSON.stringify({master:0}));
  localStorage.setItem("tengxian1938_tools_volume_v1",JSON.stringify({volume:0,muted:true}));
});
try {
  const base=process.env.ENCOUNTER_TEST_BASE||`http://127.0.0.1:${server.address().port}`;
  await page.goto(`${base}/Taierzhuang1938/AdvancedTools/Tool_LevelFlow.html?beat=08d`);
  await page.waitForFunction(()=>window.LevelFlow,null,{timeout:180000});
  await page.locator("#playGame").click();
  await page.waitForFunction(()=>{const g=document.querySelector(".lfPlayHost iframe")?.contentWindow.Tengxian;return g?.state.running&&g.Debug.EncounterPlay.State().ready;},null,{timeout:540000});
  const frame=page.frames().find(f=>f.url().includes("encounterPlay=1"));
  const result=await frame.evaluate(async()=>{
    const g=Tengxian,D=g.Debug,api=D.EncounterPlay,out={};
    g.player.SetDebugOptions({invincible:true});
    const Step=async n=>{for(let i=0;i<n;i++)await new Promise(requestAnimationFrame);};
    const TapF=async()=>{D.Key("KeyF",true);await Step(1);D.Key("KeyF",false);await Step(8);};
    for(let i=0;i<600&&!api.State().hints?.hint;i++)await Step(1);
    const p=g.player.position,yaw=g.player.yaw,fx=-Math.sin(yaw),fz=-Math.cos(yaw);
    out.beat=api.State().beat;out.baseHint=api.State().hints.hint;
    out.start={...D.Slots().slots,active:D.Slots().active};
    // 1) gun on the ground right in front: F picks it up even though the plank action is available here.
    const ahead=D.DropWeapon("Type38",{x:p.x+fx*0.8,z:p.z+fz*0.8,yaw:yaw+Math.PI/2,ammo:5});
    await Step(8);
    out.aimed={query:D.Interact().kind,label:D.Interact().label,hint:api.State().hints.hint,prompts:D.Prompts().map(x=>x.kind)};
    await TapF();
    out.afterPickup={active:D.Slots().active,weapon:g.viewmodel.weaponId,secondary:D.Slots().slots.secondary,
      ground:D.Interact().groundWeapons.map(w=>w.id),hint:api.State().hints.hint};
    // 2) another gun in front: both gun slots are full, so F swaps the held one and leaves it on the ground.
    D.DropWeapon("ZhongZheng",{x:p.x+fx*0.8,z:p.z+fz*0.8,yaw:yaw+Math.PI/2,ammo:3});
    await Step(8);
    out.swapLabel=D.Interact().label;
    await TapF();
    out.afterSwap={slots:{...D.Slots().slots},active:D.Slots().active,weapon:g.viewmodel.weaponId,
      ground:D.Interact().groundWeapons.map(w=>w.weaponId)};
    // 3) turn away (the swapped-out gun is still within reach, just not aimed): F performs the beat action again.
    g.player.yaw=yaw+Math.PI;await Step(8);
    out.awayHint=api.State().hints.hint;out.awayPrompts=D.Prompts().map(x=>x.kind);out.awayQuery=D.Interact().kind;
    const before={...D.Slots().slots};
    await TapF();await Step(8);
    out.afterAction={slots:{...D.Slots().slots},hint:api.State().hints.hint,before};
    out.ahead=ahead;
    return out;
  });
  console.log(JSON.stringify(result,null,1));
  assert.equal(result.beat,"08d");
  assert.equal(result.aimed.query,"pickup","aimed gun must be the F candidate");
  assert.ok(!result.aimed.hint.startsWith(result.baseHint),"HUD must not advertise the beat action while a gun is aimed");
  assert.ok(result.aimed.prompts.includes("pickup"),"aimed gun shows the F pickup prompt");
  assert.equal(result.afterPickup.secondary,"Type38","F must pick the aimed gun into the free slot");
  assert.equal(result.afterPickup.weapon,"Type38","picked gun is held immediately");
  assert.match(result.swapLabel,/换上/,"full gun slots offer a swap");
  assert.ok(result.afterSwap.ground.includes("Type38"),"swapped-out gun stays on the ground");
  assert.equal(result.afterSwap.weapon,"ZhongZheng");assert.equal(result.afterSwap.slots.secondary,"ZhongZheng","swap replaces the held slot");
  assert.ok(result.awayHint.startsWith(result.baseHint),"without an aimed gun the beat action hint is back");
  assert.equal(result.awayQuery,"pickup","the swapped-out gun is still within reach");
  assert.ok(!result.awayPrompts.includes("pickup"),"while F belongs to the beat action the bar shows no F pickup prompt");
  assert.ok(!result.afterAction.hint.startsWith(result.baseHint),"F without an aimed gun performs the beat action");
  assert.deepEqual(result.afterAction.slots,result.afterAction.before,"beat action does not touch weapon slots");
  await page.locator("#stopGame").click();
  assert.deepEqual(errors,[]);
  console.log("ok  Encounter Play: aimed F pickup/swap inside a beat action area, F beat action otherwise");
} finally {await browser.close();if(server)await new Promise(r=>server.close(r));}
