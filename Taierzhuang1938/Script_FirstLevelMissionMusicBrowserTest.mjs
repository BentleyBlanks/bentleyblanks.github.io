// Diagnostic stage jumps verify music wiring; they are not a normal campaign completion claim.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(await fs.readFile(path.join(here, "Audio/Music/FirstLevel/Data_FirstLevelMusicManifest.json"), "utf8"));
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
  // 【2026-09-26】01 开场过场有配乐（原来不放乐）：开机后只拉这一段，别的不预载。2026-10-21 起是用户选的「炮后余震」。
  await page.waitForFunction(() => window.Tengxian.audio.ctx?.state === "running" && !!window.Tengxian.audio.musicLayer, null, { timeout: 60000 });
  assert.ok(requests.length > 0 && requests.every(url => /AudioBgm_ShellShock\.mp3/.test(url)),
    "the opening loads only its own score: " + JSON.stringify(requests));
  await page.screenshot({ path: path.join(output, "Scene_CarriageMusic.png") });
  // 2026.09.20 第二波（End 包）：夹具按新 27 步重写。旧的 Shelter / FinalCarry / Exit
  // 三个内部步骤随采用稿下线，换成现役的 BunkerRescue / WallPath / NightMarch；
  // 15A 与 17 是静的，18 的桥头回到紧张、爆破那一步是「南路断了」。
  // 2026-10-21 用户选曲：01 炮后余震、03 壕沟脉冲（到前沿前）、05 支沟、13 / 14 空袭。
  const starts = [[1,"ShellShock"],[2,"NorthGate","BunkerRescue"],[3,"NorthGate","RearTrench"],
    [3,"TrenchPulse","Support"],[4,"CornerByCorner"],[5,"SapTrench"],
    [6,"Night"],[7,"Dusk"],[8,"IronSiege"],[9,"Witness"],[10,"OpenTheWay"],
    [11,"TheRoadSouth"],[12,"CloseQuartersPressure"],[13,"AirRaid"],[14,"AirRaid"],
    [15,null],[15,"TheLivingStillNeedUs","WallPath"],[15,"TheLivingStillNeedUs","ReceptionGate"],
    [16,"KeepYourEyesOpen"],[17,null],
    [18,"TheFrontClosesIn"],[18,"CloseQuartersPressure","BridgeCover"],
    [18,"TheSouthRoadBreaks","BridgeWithdraw"],[18,"TheLivingStillNeedUs","NightMarch"]];
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
        // 量让位时把「是否在说话」钉住：进 04 等步骤时前沿对白（frontScenes）可能正好在播，只改 voice.current 盖不住它。
        const Speaking = on => { Object.defineProperty(r, "StorySpeaking", { configurable: true, get: () => on }); r.UpdateMusic(); };
        Speaking(true); sample.dialogueScale = a.musicLayer.levelScale;
        Speaking(false); sample.normalScale = a.musicLayer.levelScale;
        delete r.StorySpeaking; r.UpdateMusic();
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
      // 解码出来的时长对得上清单（90 s、120 s，夜里入城 52 s 都有）
      assert.ok(row.heads>0 && Math.abs(row.bufferSeconds-manifest.cues[cue].seconds)<0.15 && row.signalPeak>0.00001, JSON.stringify(row));
      assert.ok(row.dialogueScale<row.normalScale && row.paused && row.resumed, JSON.stringify(row));
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
  // 每首用到的曲子只下载一次：张数 = 上面阶段表里出现过的不同 cue（2026-10-21 起 11 首）。
  const activeCues = new Set(starts.map(([, id]) => id).filter(Boolean));
  assert.equal(new Set(requests.map(url=>url.split("?")[0])).size, activeCues.size, JSON.stringify([...activeCues]));
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(output,"Data_MusicVerification.json"),JSON.stringify({rows,races,requests,errors},null,2));
  console.log(`PASS silent carriage and ${activeCues.size} active audible cues, both battle recordings, story transitions, dialogue, pause/resume, cache and late-load races`);
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
