// Diagnostic stage jumps verify music wiring; they are not a normal campaign completion claim.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(here, "_shots/FirstLevelMusic");
await fs.mkdir(output, { recursive: true });
const server = await ServeRoot(path.resolve(here, ".."), 0), browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [], requests = [], rows = [];
page.on("pageerror", error => errors.push(String(error)));
page.on("request", request => { if (/Audio\/Music\/FirstLevel\/.*\.mp3/.test(request.url())) requests.push(request.url()); });
page.on("response", response => { if (/Audio\/Music\//.test(response.url()) && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&menu=0&manual=1&quality=low&scale=small`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready, null, { timeout: 180000 });
  await page.locator("#bootStart").click();
  await page.waitForFunction(() => window.Tengxian.audio.musicLayer && window.Tengxian.audio.ctx?.state === "running", null, { timeout: 60000 });
  assert.ok(requests.every(url => url.includes("LeavingHome")), "boot must request only the current first-level recording");
  await page.screenshot({ path: path.join(output, "Scene_CarriageMusic.png") });
  const starts = [[1,"LeavingHome"],[3,"CloseQuartersPressure"],[3,null,"Shelter"],
    [3,"IronSiege","Support"],[4,"IronSiege"],[5,"IronSiege"],
    [6,"TheFrontClosesIn"],[7,"TheRoadSouth"],[8,"CloseQuartersPressure"],[9,"CloseQuartersPressure"],[10,"CloseQuartersPressure"],
    [11,"TheRoadSouth"],[12,"IronSiege"],[13,"IronSiege"],[14,"TheSouthRoadBreaks"],
    [15,"CloseQuartersPressure"],[16,"CloseQuartersPressure"],[16,"KeepYourEyesOpen","FinalCarry"],
    [17,null],[18,"IronSiege"],[18,"TheLivingStillNeedUs","Exit"]];
  for (const [number, id, step] of starts) {
    if (number !== 1) await page.evaluate(number => window.Tengxian.Debug.FirstLevelJump(number), number);
    // Internal story boundaries share public starts; this remains a wiring diagnostic.
    if (step) await page.evaluate(async step => {
      const r = window.Tengxian.Debug.FirstLevelMissionRuntime();
      const { MISSION_STAGES } = await import("./Data_FirstLevelMission.mjs");
      r.flow.index = MISSION_STAGES.findIndex(stage => stage.id === step);
      r.UpdateMusic();
    }, step);
    const cue = id ? `firstLevel${id}` : null;
    await page.waitForFunction(cue => {
      const g = window.Tengxian;
      return g.audio.musicCue === cue && (cue ? !!g.audio.musicLayer : !g.audio.musicLayer);
    }, cue, { timeout: 60000 });
    const row = await page.evaluate(async ({number,cue}) => {
      const g = window.Tengxian, a = g.audio, r = g.Debug.FirstLevelMissionRuntime();
      const before = a.musicLayer;
      r.UpdateMusic(); r.UpdateMusic();
      const held = before === a.musicLayer;
      const sample = { number, cue, stage:r.flow.stage.id, actual:r.State().music,
        held, heads:a.musicLayer?.heads.size||0,
        bufferSeconds:a.musicBuffers.get(cue)?.duration||0,
        cached:[...a.musicBuffers.keys()].filter(key=>key.startsWith("firstLevel")), errors:[...a.musicErrors] };
      if (cue) {
        const current = r.voice.current;
        r.voice.current = {phase:"playing"}; r.UpdateMusic();
        sample.dialogueScale = a.musicLayer.levelScale;
        r.voice.current = null; r.UpdateMusic();
        sample.normalScale = a.musicLayer.levelScale;
        r.voice.current = current;
        a.SetPaused(true); sample.paused = !a.musicLayer;
        a.SetPaused(false); sample.resumed = a.musicCue === cue && !!a.musicLayer;
        // Observe actual WebAudio output from this music group, before the user/master controls.
        const meter = a.ctx.createAnalyser(); meter.fftSize=2048;
        a.musicLayer.group.connect(meter);
        sample.signalPeak=0;
        for(let i=0;i<12;i++) {
          await new Promise(resolve=>setTimeout(resolve,250));
          const pcm=new Float32Array(meter.fftSize); meter.getFloatTimeDomainData(pcm);
          sample.signalPeak=Math.max(sample.signalPeak,...pcm.map(Math.abs));
        }
        a.musicLayer.group.disconnect(meter); meter.disconnect();
      }
      return sample;
    }, {number,cue});
    assert.ok(row.held); assert.equal(row.errors.length,0);
    assert.ok(row.cached.length<=3);
    if(cue) {
      const isBattleCue = ["CloseQuartersPressure", "IronSiege"].includes(id);
      assert.ok(row.heads>0 && (isBattleCue ? Math.abs(row.bufferSeconds-90)<0.1 : row.bufferSeconds>90) && row.signalPeak>0.00001, JSON.stringify(row));
      assert.ok(row.dialogueScale<row.normalScale && row.paused && row.resumed);
    }
    rows.push(row); console.log("MUSIC_STAGE",JSON.stringify(row));
  }
  const races = await page.evaluate(async () => {
    const {AudioEngine}=await import("./Script_Audio.mjs");
    const a=new AudioEngine(); a.CreateContext(); await a.ctx.resume();
    const first="firstLevelLeavingHome", second="firstLevelTheRoadSouth";
    const buffer=a.ctx.createBuffer(2,a.ctx.sampleRate*10,a.ctx.sampleRate);
    const waiting=new Map();
    a.LoadMusicCue=cue=>new Promise(resolve=>waiting.set(cue,()=>{a.musicBuffers.set(cue,buffer);resolve(buffer);}));
    a.Music(first); a.Music(second); waiting.get(first)(); await Promise.resolve();
    const staleIgnored=a.musicCue===second&&!a.musicLayer;
    a.SetPaused(true); waiting.get(second)(); await Promise.resolve();
    const pauseHeld=!a.musicLayer;
    a.SetPaused(false); const resumesLatest=a.musicCue===second&&!!a.musicLayer;
    a.Music(null,{fadeOut:0}); a.musicBuffers.delete(first); a.Music(first); a.Music(null,{fadeOut:0});
    waiting.get(first)(); await Promise.resolve();
    const silenceHeld=a.musicCue===null&&!a.musicLayer;
    a.Dispose(); return {staleIgnored,pauseHeld,resumesLatest,silenceHeld};
  });
  assert.ok(Object.values(races).every(Boolean),JSON.stringify(races));
  assert.equal(new Set(requests.map(url=>url.split("?")[0])).size,8);
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(output,"Data_MusicVerification.json"),JSON.stringify({rows,races,requests,errors},null,2));
  console.log("PASS eight active audible cues, both battle recordings, story transitions, dialogue, pause/resume, cache and late-load races");
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
