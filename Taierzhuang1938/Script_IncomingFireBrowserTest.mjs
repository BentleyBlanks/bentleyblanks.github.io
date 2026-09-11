// Real campaign HUD: near fire differs from injury, bearings rotate, bounded cues expire.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "Taierzhuang1938/_shots/IncomingFire");
const server = process.env.INCOMING_FIRE_PREVIEW ? null : await ServeRoot(root, 0);
let browser;
try {
  await fs.mkdir(output, {recursive:true});
  browser = await LaunchBrowser();
  const page = await browser.newPage({viewport:{width:1280,height:720}});
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  const base = process.env.INCOMING_FIRE_PREVIEW || `http://127.0.0.1:${server.address().port}`;
  await page.goto(`${base}/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&quality=low`,
    {waitUntil:"domcontentloaded",timeout:240000});
  await page.waitForFunction(() => window.Tengxian?.state?.ready, null, {timeout:300000});
  await page.evaluate(async () => {
    const T = window.Tengxian;
    await T.Debug.FirstLevelJump(4);
    T.state.menu = false;
    T.StepFrames(2,1/60,false);
    // Freeze unrelated combat while exercising the real player/HUD objects.
    for (const s of T.ai.soldiers) s.scriptedNoncombatant = true;
    T.player.spawnGrace = 0;
    T.player.debug.invincible = false;
    T.player.health = 100;
    T.player.hitFlash = 0;
    T.player.hitMarks.length = 0;
    T.player.wounds.length = 0;
    T.player.bleeding = 0;
    T.player.yaw = 0;
    T.player.pitch = 0;
    T.player.Suppress(.2,"bullet",T.player.position.clone().add({x:12,y:0,z:0}));
    T.StepFrames(1,1/60,true);
  });
  const near = await page.evaluate(() => {
    const T = window.Tengxian, el = document.querySelector(".hudHitDir.near");
    return {hp:T.player.health,flash:T.player.hitFlash,kind:T.player.hitMarks[0]?.kind,
      angle:el?.getAttribute("transform"),opacity:el && +getComputedStyle(el).opacity,
      fill:el && getComputedStyle(el).fill,stroke:el && getComputedStyle(el).stroke};
  });
  assert.equal(near.hp,100); assert.equal(near.flash,0); assert.equal(near.kind,"near");
  assert.equal(near.angle,"rotate(90.0)"); assert.ok(near.opacity>.7); assert.equal(near.fill,"none");
  await page.screenshot({path:path.join(output,"NearRight.png")});
  const hit = await page.evaluate(() => {
    const T = window.Tengxian, p = T.player;
    const from = p.position.clone().add({x:12,y:0,z:0});
    p.TakeHit(24,"torso",null,{bullet:true,from});
    for (let i=0;i<50;i++) p.Suppress(.01,"bullet",from);
    T.hud.SetHurt({health:p.health,flash:p.hitFlash,marks:p.hitMarks,yaw:p.yaw});
    const el = document.querySelector(".hudHitDir.hit");
    return {hp:p.health,flash:p.hitFlash,marks:p.hitMarks.map(m=>({...m})),
      opacity:+getComputedStyle(el).opacity,fill:getComputedStyle(el).fill};
  });
  assert.ok(hit.hp<100 && hit.flash>.5); assert.equal(hit.marks.length,1);
  assert.equal(hit.marks[0].kind,"hit"); assert.ok(hit.opacity>.8); assert.notEqual(hit.fill,near.fill);
  await page.waitForTimeout(150); // Let the existing damage-vignette CSS transition settle.
  await page.screenshot({path:path.join(output,"HitRight.png")});
  const rotation = await page.evaluate(() => {
    const T = window.Tengxian;
    // Looking right turns the remembered +X source from right to front.
    T.player.yaw = -Math.PI/2;
    T.hud.SetHurt({health:T.player.health,flash:T.player.hitFlash,marks:T.player.hitMarks,yaw:T.player.yaw});
    return document.querySelector(".hudHitDir.hit").getAttribute("transform");
  });
  assert.equal(rotation,"rotate(0.0)");
  const sectors = await page.evaluate(() => {
    const T = window.Tengxian, p=T.player;
    p.hitMarks.length=0; p.hitFlash=0; p.yaw=0;
    for (const [x,z] of [[0,-12],[12,0],[0,12],[-12,0]]) {
      p.RecordIncomingFire(p.position.clone().add({x,y:0,z}),"near");
    }
    T.hud.SetHurt({health:100,flash:0,marks:p.hitMarks,yaw:p.yaw});
    return [...document.querySelectorAll(".hudHitDir")].filter(e=>+e.style.opacity>.1)
      .map(e=>+e.getAttribute("transform").match(/-?[\d.]+/)[0]);
  });
  assert.deepEqual(sectors,[0,90,180,-90]);
  await page.screenshot({path:path.join(output,"FourBearings.png")});
  const lifecycle = await page.evaluate(() => {
    const T=window.Tengxian,p=T.player;
    p.hitMarks.length=0;
    for(let i=0;i<5;i++) {
      const angle=i*Math.PI*2/5;
      p.RecordIncomingFire(p.position.clone().add({x:12*Math.sin(angle),y:0,z:-12*Math.cos(angle)}),"hit");
    }
    for(let i=0;i<60;i++) {
      const angle=i*.7;
      p.RecordIncomingFire(p.position.clone().add({x:12*Math.sin(angle),y:0,z:-12*Math.cos(angle)}),"near");
    }
    const count=p.hitMarks.length, hits=p.hitMarks.filter(m=>m.kind==="hit").length;
    // The actual player update owns expiration; prevent mission/AI mutation here.
    for(let i=0;i<180;i++) p.Update(1/60,{lookX:0,lookY:0},{});
    T.hud.SetHurt({health:p.health,flash:p.hitFlash,marks:p.hitMarks,yaw:p.yaw});
    const expired=p.hitMarks.length;
    const visible=[...document.querySelectorAll(".hudHitDir")].filter(e=>+e.style.opacity>0).length;
    p.RecordIncomingFire({x:NaN,z:0},"near");
    const invalid=p.hitMarks.length;
    p.RecordIncomingFire(p.position.clone().add({x:12,y:0,z:0}),"hit");
    p.Spawn(p.position.x,p.position.z,0);
    return {count,hits,expired,visible,invalid,respawn:p.hitMarks.length};
  });
  assert.deepEqual(lifecycle,{count:5,hits:5,expired:0,visible:0,invalid:0,respawn:0});
  // Narrow viewport uses the same center and readable vmin geometry.
  await page.setViewportSize({width:745,height:377});
  await page.evaluate(() => {
    const T=window.Tengxian,p=T.player;
    T.StepFrames(1,1/60,true); // Resize clears the WebGL canvas; render the actual scene again.
    p.RecordIncomingFire(p.position.clone().add({x:-12,y:0,z:-12}),"hit");
    T.hud.SetHurt({health:76,flash:.65,marks:p.hitMarks,yaw:0});
  });
  await page.waitForTimeout(150);
  await page.screenshot({path:path.join(output,"CompactHit.png")});
  assert.deepEqual(errors,[]);
  const report={near,hit,rotation,sectors,lifecycle};
  await fs.writeFile(path.join(output,"Report.json"),JSON.stringify(report,null,2));
  console.log("IncomingFireBrowserTest OK",JSON.stringify(report));
} finally {
  await browser?.close();
  server?.close();
}
