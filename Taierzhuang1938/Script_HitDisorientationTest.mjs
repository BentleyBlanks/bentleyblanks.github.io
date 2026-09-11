// Shared bullet injury: actual campaign player, composite GPU output and WebAudio graph.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "Taierzhuang1938/_shots/HitDisorientation");
const server = process.env.HIT_PREVIEW ? null : await ServeRoot(root, 0);
let browser;
try {
  await fs.mkdir(output, {recursive:true});
  browser = await LaunchBrowser();
  const page = await browser.newPage({viewport:{width:1280,height:720}});
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error" && /shader|WebGL/i.test(m.text())) errors.push(m.text()); });
  const base = process.env.HIT_PREVIEW || `http://127.0.0.1:${server.address().port}`;
  await page.goto(`${base}/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&quality=${process.env.HIT_QUALITY || "low"}`,
    {waitUntil:"domcontentloaded",timeout:240000});
  await page.waitForFunction(() => window.Tengxian?.state?.ready, null, {timeout:300000});
  await page.evaluate(async () => {
    const T = window.Tengxian;
    await T.Debug.FirstLevelJump(4);
    T.state.menu = false;
    for (const s of T.ai.soldiers) s.scriptedNoncombatant = true;
    T.player.SetDebugOptions({invincible:false});
    T.player.spawnGrace = 0;
    T.player.health = 100;
    T.player.wounds.length = 0;
    T.player.bleeding = 0;
    T.audio.enabled = true;
    T.audio.Unlock();
    T.StepFrames(2, 1/60, true);
  });
  const sample = () => page.evaluate(() => {
    const T = window.Tengxian;
    return {strength:T.player.HitDisorientation, time:T.player.hitDisorientationTime,
      visual:T.post.uniformsComposite.uHitDisorientation.value,
      audio:T.audio.hitDisorientation, cutoff:T.audio.hitFilter.frequency.value,
      gain:T.audio.hitGain.gain.value, hp:T.player.health,
      master:T.audio.masterVolume, mix:{...T.audio.mix}};
  });
  const before = await sample();
  assert.equal(before.strength, 0);
  await page.screenshot({path:path.join(output,"Before.png")});
  const ignored = await page.evaluate(() => {
    const T = window.Tengxian, p = T.player;
    p.Suppress(.3, "bullet", p.position.clone().add({x:5,y:0,z:0}));
    const near = p.HitDisorientation;
    p.spawnGrace = 1; p.TakeHit(24,"torso",null,{bullet:true});
    const grace = p.HitDisorientation;
    p.spawnGrace = 0; p.SetDebugOptions({invincible:true});
    p.TakeHit(24,"torso",null,{bullet:true});
    const invincible = p.HitDisorientation;
    p.SetDebugOptions({invincible:false}); p.TakeHit(1,"torso");
    return {near,grace,invincible,other:p.HitDisorientation};
  });
  assert.deepEqual(ignored,{near:0,grace:0,invincible:0,other:0});
  await page.evaluate(() => {
    const T = window.Tengxian;
    T.player.TakeHit(24,"torso",null,{bullet:true});
    T.StepFrames(1,1/60,true);
  });
  await page.waitForTimeout(120);
  const peak = await sample();
  assert.ok(peak.strength > .85 && peak.strength <= 1);
  assert.equal(peak.audio,peak.strength); assert.equal(peak.visual,peak.strength);
  assert.ok(peak.cutoff < 2000 && peak.gain < .75);
  assert.equal(peak.master,before.master); assert.deepEqual(peak.mix,before.mix);
  await page.screenshot({path:path.join(output,"Hit.png")});
  await page.evaluate(() => window.Tengxian.StepFrames(36,1/60,true));
  const recovering = await sample();
  assert.ok(recovering.strength > 0 && recovering.strength < peak.strength);
  await page.screenshot({path:path.join(output,"Recovering.png")});
  await page.evaluate(() => window.Tengxian.StepFrames(45,1/60,true));
  await page.waitForTimeout(150);
  const recovered = await sample();
  assert.equal(recovered.strength,0); assert.equal(recovered.visual,0); assert.equal(recovered.audio,0);
  assert.ok(recovered.cutoff > 19900 && recovered.gain > .999);
  await page.screenshot({path:path.join(output,"Recovered.png")});
  const bounded = await page.evaluate(() => {
    const T = window.Tengxian, p = T.player;
    for (let i=0;i<40;i++) { p.health=100; p.TakeHit(24,"torso",null,{bullet:true}); }
    const max = p.HitDisorientation, time = p.hitDisorientationTime;
    p.wounds.length=0; p.bleeding=0;
    T.StepFrames(75,1/60,true);
    return {max,time,after:p.HitDisorientation};
  });
  assert.ok(bounded.max <= 1 && bounded.time < 1.5); assert.equal(bounded.after,0);
  await page.evaluate(() => {
    const T=window.Tengxian; T.player.health=100;
    T.player.TakeHit(12,"torso",null,{bullet:true}); T.state.menu=true;
    T.StepFrames(1,0,true);
  });
  const paused = await sample();
  assert.equal(paused.audio,0); assert.equal(paused.visual,0);
  await page.evaluate(() => { const T=window.Tengxian; T.state.menu=false;
    T.player.SetDebugOptions({invincible:true}); T.StepFrames(1,0,true); });
  assert.equal((await sample()).strength,0);
  await page.evaluate(async () => {
    const T=window.Tengxian; T.player.SetDebugOptions({invincible:false});
    T.player.spawnGrace=0; T.player.TakeHit(12,"torso",null,{bullet:true});
    await T.Debug.FirstLevelJump(4); T.StepFrames(1,0,true);
  });
  assert.equal((await sample()).strength,0,"stage rebuild clears old injury");
  const projectile = await page.evaluate(() => {
    const T=window.Tengxian, p=T.player;
    p.SetDebugOptions({invincible:false}); p.spawnGrace=0; p.health=100;
    p.TakeHit(80,"torso",null,{projectile:true});
    const result={strength:p.HitDisorientation,hp:p.health};
    p.SetDebugOptions({invincible:true});
    return result;
  });
  assert.equal(projectile.strength,1,"heavy projectile shares sensory feedback");
  assert.ok(projectile.hp < 38,"sensory-only flag does not apply the small-arms damage cap");
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.evaluate(() => {
    const T=window.Tengxian; T.state.menu=false; T.player.SetDebugOptions({invincible:false});
    T.player.spawnGrace=0; T.player.TakeHit(12,"torso",null,{bullet:true}); T.StepFrames(1,0,true);
  });
  const reduced = await sample();
  assert.ok(reduced.audio > 0); assert.equal(reduced.visual,0);
  assert.deepEqual(errors,[]);
  // Render actual PCM through the production injury method. Compare low speech/body
  // frequencies against sharp high frequencies, then verify the cleared graph recovers.
  const dsp = await page.evaluate(async () => {
    const render = async (amount, reset = false) => {
      const ctx = new OfflineAudioContext(1, 24000, 48000);
      const host = {ctx,hitDisorientation:0,hitFilter:ctx.createBiquadFilter(),hitGain:ctx.createGain()};
      host.hitFilter.type="lowpass"; host.hitFilter.frequency.value=20000; host.hitFilter.Q.value=.7;
      host.hitFilter.connect(host.hitGain).connect(ctx.destination);
      window.Tengxian.audio.SetHitDisorientation.call(host,amount);
      if(reset) window.Tengxian.audio.SetHitDisorientation.call(host,0);
      for (const hz of [150,5000]) {
        const osc=ctx.createOscillator(), gain=ctx.createGain();
        osc.frequency.value=hz;gain.gain.value=.1;
        osc.connect(gain).connect(host.hitFilter);osc.start();
      }
      const pcm=(await ctx.startRendering()).getChannelData(0);
      const amplitude = hz => {
        let re=0,im=0;
        for(let i=12000;i<24000;i++){re+=pcm[i]*Math.cos(2*Math.PI*hz*i/48000);im+=pcm[i]*Math.sin(2*Math.PI*hz*i/48000);}
        return Math.hypot(re,im)*2/12000;
      };
      return {low:amplitude(150),high:amplitude(5000)};
    };
    return {clear:await render(0),hit:await render(1),reset:await render(1,true)};
  });
  assert.ok(dsp.hit.high < dsp.clear.high*.05,"high-frequency PCM becomes muffled");
  assert.ok(dsp.hit.low > dsp.clear.low*.5 && dsp.hit.low < dsp.clear.low*.7,"low frequencies remain audible");
  assert.ok(Math.abs(dsp.reset.high-dsp.clear.high)<.001,"clearing restores PCM");
  const report={before,peak,recovering,recovered,ignored,bounded,paused,reduced,projectile,dsp};
  await fs.writeFile(path.join(output,"Report.json"),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
  console.log("PASS HitDisorientation: injury gate, GPU, audio graph, decay, bounded repeats, lifecycle, reduced motion");
} finally { if (browser) await browser.close(); if (server) await new Promise(resolve=>server.close(resolve)); }
