// Real WebAudio perspective regression. The full opening mix is reviewed by the
// campaign run; this small fixture isolates stereo image, continuity and filters.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LaunchBrowser } from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import { ServeRoot } from './Script_DevServer.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),server=await ServeRoot(path.resolve(here,'..'),0);
const browser=await LaunchBrowser(),page=await browser.newPage();
try {
 await page.route('**/_check_VoicePerspective.html',route=>route.fulfill({contentType:'text/html',body:`<button id="start">Start</button><script type="module">
 import {AudioEngine} from './Script_Audio.mjs';
 window.audio=new AudioEngine(); document.querySelector('#start').onclick=()=>audio.ctx.resume();window.ready=true;
 </script>`}));
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/_check_VoicePerspective.html`);
 await page.waitForFunction(()=>window.ready);await page.locator('#start').click();
 const result=await page.evaluate(async()=>{
  const a=window.audio;
  await a.LoadVoices(new URL('./Audio/FirstLevel/',location.href).href,[
   {key:'PerspectiveBanter',file:'AudioVoice_FirstLevelBunkerBanter.mp3',kind:'story',gain:1},
   {key:'PerspectiveJapanese',file:'AudioVoice_FirstLevelBunkerSearch.mp3',kind:'story',gain:1},
  ]);
  const split=a.ctx.createChannelSplitter(2);a.softClip.connect(split);
  const meters=[0,1].map(i=>{const meter=a.ctx.createAnalyser();meter.fftSize=2048;split.connect(meter,i);return meter;});
  const buffers=meters.map(m=>new Float32Array(m.fftSize));
  const Wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function Measure(seconds){let energy=0,difference=0,count=0,peak=0;const until=a.ctx.currentTime+seconds;
   while(a.ctx.currentTime<until){meters.forEach((m,i)=>m.getFloatTimeDomainData(buffers[i]));
    for(let i=0;i<buffers[0].length;i++){const l=buffers[0][i],r=buffers[1][i];energy+=(l*l+r*r)/2;difference+=(l-r)**2;peak=Math.max(peak,Math.abs(l),Math.abs(r));count++;}await Wait(8);}
   return {rms:Math.sqrt(energy/count),stereoDifference:Math.sqrt(difference/count),peak};
  }
  const {voice}=a.PlayStoryVoice('PerspectiveBanter',{dialogue:true,firstPerson:true,
    position:{x:8,y:1.6,z:-3},offset:3.55,maxDuration:8});
  const source=voice.nodes.find(node=>node.buffer),count=voice.nodes.length;
  await Wait(200);const own=await Measure(.6);
  const ownRoute={self:voice.storySelfGain.gain.value,world:voice.storyWorldGain.gain.value,wet:voice.wetGain.gain.value,distance:voice.distance};
  a.SetStoryVoiceSpeaker(voice,{position:{x:-8,y:1.6,z:-3},who:'runner'});
  await Wait(220);const world=await Measure(.6);
  const worldRoute={self:voice.storySelfGain.gain.value,world:voice.storyWorldGain.gain.value,wet:voice.wetGain.gain.value,distance:voice.distance};
  a.SetStoryVoiceSpeaker(voice,{position:{x:80,y:30,z:70},who:'shunzi',firstPerson:true});
  await Wait(220);
  const continuity=source===voice.nodes.find(node=>node.buffer)&&voice.nodes.length===count&&a.storyVoice===voice;
  a.StopStoryVoice();a.SetConcussion(1,650);await Wait(30);
  const japanese=a.PlayStoryVoice('PerspectiveJapanese',{dialogue:true,position:{x:0,y:1.6,z:-8}}).voice;
  await Wait(30);
  const speechFloor=a.concussionFilter.frequency.value;
  await Wait(100);const japaneseOutput=await Measure(1.1);
  a.SetStoryVoiceSpeaker(japanese,{position:{x:0,y:1.6,z:-8},speaking:false});
  await Wait(30);
  const silenceFloor=a.concussionFilter.frequency.value;
  a.SetStoryVoiceSpeaker(japanese,{position:{x:0,y:1.6,z:-8},speaking:true});
  a.StopStoryVoice();await Wait(30);const stoppedFloor=a.concussionFilter.frequency.value;
  a.Dispose();return {own,world,ownRoute,worldRoute,continuity,speechFloor,silenceFloor,stoppedFloor,japaneseOutput};
 });
 assert.ok(result.continuity,'routing must retain the same source and node set');
 assert.ok(result.own.rms>.01,'own recorded line reaches actual output');
 assert.ok(result.own.stereoDifference<result.own.rms*.015,'own speech stays centred');
 assert.ok(result.ownRoute.self>.999&&result.ownRoute.world<.001&&result.ownRoute.wet<.001&&result.ownRoute.distance===0);
 assert.ok(result.world.rms>.01&&result.world.stereoDifference>result.world.rms*.03,'other speakers retain audible spatial direction');
 assert.ok(result.worldRoute.self<.001&&result.worldRoute.world>.999&&result.worldRoute.distance>8);
 assert.ok(result.speechFloor===4200&&result.japaneseOutput.rms>.01,'Japanese speech survives concussion filtering at output');
 assert.equal(result.silenceFloor,650);assert.equal(result.stoppedFloor,650);
 const out=path.join(here,'_shots','FirstLevelVoicePerspective');await fs.mkdir(out,{recursive:true});
 await fs.writeFile(path.join(out,'Data_VoicePerspective.json'),JSON.stringify(result,null,2));
 console.log('ok real dialogue output: centred self, spatial NPC, intact source, audible concussion speech',JSON.stringify(result));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
