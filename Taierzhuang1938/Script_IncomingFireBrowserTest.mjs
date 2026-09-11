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
  // Decode the actual production images: a CSS URL alone does not prove pixels render.
  const textures = await page.evaluate(async () => {
    const arc = document.querySelector(".hudHitTexture").getAttribute("href");
    const blood = getComputedStyle(document.querySelector(".hudDamage"), "::before")
      .backgroundImage.match(/url\(["']?([^"')]+)/)[1];
    return await Promise.all([arc, blood].map(async src => {
      const image = new Image(); image.src = src; await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
      const data = ctx.getImageData(0,0,image.width,image.height).data;
      let opaque = 0, clear = 0, centerMax = 0;
      for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
        const alpha = data[(y * image.width + x) * 4 + 3];
        if (alpha > 128) opaque++;
        if (alpha < 3) clear++;
        if (x > image.width*.25 && x < image.width*.75 && y > image.height*.43 && y < image.height*.65)
          centerMax = Math.max(centerMax, alpha);
      }
      return {src,width:image.width,height:image.height,opaque,clear,centerMax};
    }));
  });
  for (const texture of textures) {
    assert.ok(texture.width >= 1000 && texture.opaque > 2000, "Real texture decoded");
    assert.ok(texture.clear > texture.width * texture.height * .5, "Clear sight area");
    assert.ok(texture.centerMax <= 2, "Alpha center does not cover aiming");
  }
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
    const texture = el?.querySelector(".hudHitTexture"), crest = el?.querySelector(".hudNearCrest");
    return {hp:T.player.health,flash:T.player.hitFlash,kind:T.player.hitMarks[0]?.kind,
      angle:el?.getAttribute("transform"),opacity:el && +getComputedStyle(el).opacity,
      textureOpacity:texture && +getComputedStyle(texture).opacity,
      crestDisplay:crest && getComputedStyle(crest).display,fill:crest && getComputedStyle(crest).fill};
  });
  assert.equal(near.hp,100); assert.equal(near.flash,0); assert.equal(near.kind,"near");
  assert.equal(near.angle,"rotate(90.0)"); assert.ok(near.opacity>.7); assert.equal(near.fill,"none");
  assert.equal(near.crestDisplay,"block"); assert.ok(near.textureOpacity < .5);
  await page.screenshot({path:path.join(output,"NearRight.png")});
  const hit = await page.evaluate(() => {
    const T = window.Tengxian, p = T.player;
    const from = p.position.clone().add({x:12,y:0,z:0});
    p.TakeHit(24,"torso",null,{bullet:true,from});
    for (let i=0;i<50;i++) p.Suppress(.01,"bullet",from);
    T.hud.SetHurt({health:p.health,flash:p.hitFlash,marks:p.hitMarks,yaw:p.yaw});
    const el = document.querySelector(".hudHitDir.hit");
    return {hp:p.health,flash:p.hitFlash,marks:p.hitMarks.map(m=>({...m})),
      opacity:+getComputedStyle(el).opacity,
      textureOpacity:+getComputedStyle(el.querySelector(".hudHitTexture")).opacity,
      crestDisplay:getComputedStyle(el.querySelector(".hudNearCrest")).display};
  });
  assert.ok(hit.hp<100 && hit.flash>.5); assert.equal(hit.marks.length,1);
  assert.equal(hit.marks[0].kind,"hit"); assert.ok(hit.opacity>.8);
  assert.equal(hit.textureOpacity,1); assert.equal(hit.crestDisplay,"none");
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
  // Injury grading, heartbeat and recovery use the same production SetHurt path.
  const healthStates = [];
  for (const health of [100,60,22]) {
    await page.evaluate(health => window.Tengxian.hud.SetHurt({health}), health);
    await page.waitForTimeout(160);
    healthStates.push(await page.evaluate(() => {
      const el = document.querySelector(".hudDamage");
      return {opacity:+getComputedStyle(el).opacity,low:el.classList.contains("low"),
        pulse:getComputedStyle(el,"::before").animationName};
    }));
    await page.screenshot({path:path.join(output,`Health${health}.png`)});
  }
  assert.equal(healthStates[0].opacity,0);
  assert.ok(healthStates[1].opacity > 0 && healthStates[1].opacity < healthStates[2].opacity);
  assert.equal(healthStates[1].low,false); assert.equal(healthStates[2].pulse,"hudPulse");
  await page.emulateMedia({reducedMotion:"reduce"});
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".hudDamage"),"::before").animationName),"none");
  await page.emulateMedia({reducedMotion:"no-preference"});
  await page.evaluate(() => window.Tengxian.hud.SetHurt({health:100}));
  await page.waitForTimeout(160);
  assert.equal(await page.evaluate(() => +getComputedStyle(document.querySelector(".hudDamage")).opacity),0);
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".hudDamage"),"::before").animationName),"none");
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
  await page.evaluate(() => window.Tengxian.hud.SetHurt({health:22}));
  await page.waitForTimeout(160);
  await page.screenshot({path:path.join(output,"CompactCritical.png")});
  assert.deepEqual(errors,[]);
  const report={textures,near,hit,rotation,sectors,lifecycle,healthStates};
  await fs.writeFile(path.join(output,"Report.json"),JSON.stringify(report,null,2));
  console.log("IncomingFireBrowserTest OK",JSON.stringify(report));
} finally {
  await browser?.close();
  server?.close();
}
