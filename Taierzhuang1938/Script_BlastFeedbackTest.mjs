// Real shared combat -> camera and WebAudio acceptance. Artifacts remain local.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "Taierzhuang1938/_shots/BlastFeedback");
const server = process.env.BLAST_PREVIEW ? null : await ServeRoot(root, 0);
let browser;
try {
  await fs.mkdir(output, {recursive:true});
  browser = await LaunchBrowser();
  const page = await browser.newPage({viewport:{width:1280,height:720}});
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  const base = process.env.BLAST_PREVIEW || `http://127.0.0.1:${server.address().port}`;
  await page.goto(`${base}/Taierzhuang1938/?explosions=1&shot=1&manual=1&quality=medium`,
    {waitUntil:"domcontentloaded",timeout:180000});
  await page.waitForFunction(() => window.Tengxian?.state?.ready, null, {timeout:240000});
  console.log("SCENE ready");
  await page.evaluate(() => {
    const t = window.Tengxian;
    t.state.menu = false;
    t.player.Spawn(2600, 2640, Math.PI); t.player.pitch = 0;
    t.audio.enabled = true; t.audio.Unlock();
    t.StepFrames(3,1/60,true);
  });
  await page.screenshot({path:path.join(output,"Before.png")});
  const cases = [];
  for (const [name,distance,radius] of [["Grenade",4,4],["Shell",7,8],["Distant",90,8]]) {
    const result = await page.evaluate(({name,distance,radius}) => {
      const t = window.Tengxian, p = t.player;
      p.shake.Reset(); t.audio.ResetDeafen();
      const before = {yaw:p.yaw,pitch:p.pitch,position:p.position.toArray(),deafens:t.audio.stats.deafens};
      const at = p.position.clone(); at.x += distance; at.y += 0.2;
      if (name === "Grenade") t.combat.Detonate({position:at,kind:"Grenade",owner:"player",weapon:{radiusM:radius,damage:0}});
      else t.combat.Blast(at,radius,0,"shell");
      const event = p.shake.State();
      t.StepFrames(1,1/60,true);
      const first = {shake:p.shake.State(),rotation:p.camera.rotation.toArray(),yaw:p.yaw,pitch:p.pitch};
      const audio = {deafens:t.audio.stats.deafens-before.deafens,strength:t.audio.deafenStrength || 0};
      return {name,before,event,first,audio};
    },{name,distance,radius});
    if (name !== "Distant") {
      assert.ok(result.event.blastTrauma > .5, `${name} reaches the shared camera event`);
      assert.equal(result.first.yaw,result.before.yaw); assert.equal(result.first.pitch,result.before.pitch);
      assert.ok(Math.abs(result.first.rotation[0]-result.first.pitch) > .02, "rendered camera receives kick");
      assert.equal(result.audio.deafens,1, "one explosion requests one hearing response");
      assert.ok(result.audio.strength > .25);
      await page.screenshot({path:path.join(output,`${name}_Impact.png`)});
      await page.evaluate(() => window.Tengxian.StepFrames(36,1/60,true));
      result.tail = await page.evaluate(() => window.Tengxian.player.shake.State());
      assert.ok(result.tail.blastTrauma > .1, "blast retains its settling tail");
      await page.screenshot({path:path.join(output,`${name}_Tail.png`)});
    } else {
      assert.equal(result.event.blastTrauma,0); assert.equal(result.audio.deafens,0);
    }
    await page.evaluate(() => window.Tengxian.StepFrames(180,1/60,true));
    assert.equal(await page.evaluate(() => window.Tengxian.player.shake.Active),false);
    cases.push(result);
  }
  await page.screenshot({path:path.join(output,"Recovered.png")});
  // Real AudioNodes: a barrage refreshes one oscillator; user volume and reset own it.
  const repeated = await page.evaluate(async () => {
    const a = window.Tengxian.audio;
    a.ResetDeafen(); a.Deafen(1.6);
    const voice = a.deafenVoice;
    const before = a.liveNodes;
    for (let i=0;i<30;i++) a.Deafen(.4,.13,.2);
    const state = {sameVoice:voice===a.deafenVoice,nodeDelta:a.liveNodes-before,
      strength:a.deafenStrength,remaining:a.deafenUntil-a.ctx.currentTime};
    a.SetMasterVolume(0);
    await new Promise(resolve=>setTimeout(resolve,180));
    state.muted = voice.user.gain.value;
    a.SetMasterVolume(1); a.SetBusVolume("sfx",0);
    await new Promise(resolve=>setTimeout(resolve,180));
    state.sfxMuted = voice.user.gain.value;
    a.SetBusVolume("sfx",1);
    window.Tengxian.audioWiring.Reset();
    state.reset = !a.deafenVoice;
    await new Promise(resolve=>setTimeout(resolve,50));
    state.resetCutoff = a.deafFilter.frequency.value;
    a.Deafen(.05,0,1);
    await new Promise(resolve=>setTimeout(resolve,200));
    a.Deafen(.1,0,.1);
    state.tailStrength = a.deafenStrength;
    a.ResetDeafen();
    return state;
  });
  assert.equal(repeated.sameVoice,true); assert.equal(repeated.nodeDelta,0);
  assert.equal(repeated.strength,1); assert.ok(repeated.remaining > 1.4 && repeated.remaining < 2);
  assert.ok(repeated.muted < .001 && repeated.sfxMuted < .001); assert.equal(repeated.reset,true);
  assert.ok(repeated.resetCutoff > 19900, JSON.stringify(repeated));
  assert.ok(repeated.tailStrength > .7, "weak blast cannot cancel a strong blast's recovery tail");
  // Render PCM through the actual production Deafen method, not a copied filter formula.
  const dsp = await page.evaluate(async () => {
    const render = async (muted=false) => {
      const ctx = new OfflineAudioContext(1,48000*4.2,48000);
      const a = Object.create(Object.getPrototypeOf(window.Tengxian.audio));
      Object.assign(a,{ctx,liveNodes:0,nodeBudget:120,masterVolume:muted?0:1,mix:{sfx:1},
        timers:new Set(),pendingVoices:new Set(),activeVoices:new Set(),
        deafFilter:ctx.createBiquadFilter(),outGain:ctx.createGain()});
      a.deafFilter.type="lowpass"; a.deafFilter.frequency.value=20000;
      a.deafFilter.connect(a.outGain).connect(ctx.destination);
      for (const hz of [180,6000]) {
        const osc=ctx.createOscillator(),gain=ctx.createGain();
        osc.frequency.value=hz; gain.gain.value=.08;
        osc.connect(gain).connect(a.deafFilter); osc.start();
      }
      a.Deafen(1.6,.13,1);
      // Offline rendering runs faster than wall time; retire the owned timer explicitly below.
      const pcm=(await ctx.startRendering()).getChannelData(0);
      const amplitude=(hz,start,end)=>{
        let re=0,im=0; const first=Math.round(start*48000),last=Math.round(end*48000);
        for(let i=first;i<last;i++){re+=pcm[i]*Math.cos(2*Math.PI*hz*i/48000);im+=pcm[i]*Math.sin(2*Math.PI*hz*i/48000);}
        return Math.hypot(re,im)*2/(last-first);
      };
      const result={attack:amplitude(6000,.03,.1),muffled:amplitude(6000,.4,.6),
        body:amplitude(180,.4,.6),ring:amplitude(4000,.25,.45),recovered:amplitude(6000,3.8,4)};
      a.ResetDeafen();
      return result;
    };
    return {audible:await render(),muted:await render(true)};
  });
  assert.ok(dsp.audible.attack > .06, "initial explosion attack remains audible");
  assert.ok(dsp.audible.muffled < dsp.audible.attack*.03, "world high frequencies become muffled");
  assert.ok(dsp.audible.body > .05, "world low frequencies survive");
  assert.ok(dsp.audible.ring > .015, "post-filter 4 kHz ringing is present");
  assert.ok(dsp.audible.recovered > .06, "hearing recovers");
  assert.ok(dsp.muted.ring < .001, "ringing respects master mute");
  assert.deepEqual(errors,[]);
  const report={cases,repeated,dsp};
  await fs.writeFile(path.join(output,"Report.json"),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
  console.log("PASS BlastFeedback: grenade/shell camera, distance, settling, bounded ringing, volume, reset and actual PCM");
} finally {
  if (browser) await browser.close();
  if (server) await new Promise(resolve=>server.close(resolve));
}
