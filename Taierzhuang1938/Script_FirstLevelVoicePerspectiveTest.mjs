// 真 WebAudio 的对白视角回归（2026-09-23 逐句干声管线）。
//
// 用仓库里已烘好的逐句干声（Audio/FirstLevel/Lines）在无头浏览器里跑真 AudioEngine + FirstLevelMissionVoice：
//   1. 顺子（第一人称）那句走居中干声：左右声道几乎一样、无混响；
//   2. 别人的句子是世界声源：挂在各自头上，左右能听出方向，一句从头到尾不在两路之间切；
//   3. 一场对白里两句可以同时响，各是各的 BufferSource（插话/压尾音），字幕同时两行；
//   4. 对白窗口里侧链：环境床/音乐那一路 −6 dB、远处战斗 −3 dB，说完 holdS 后放回；非 priority 自主喊话让路；
//   5. 震荡低通（SetConcussion）在有人说话时保住 4.2 kHz 辅音，没人说话时回到 650 Hz。
// 证据：_shots/FirstLevelVoicePerspective/ 下的 JSON、重叠那一刻的字幕截图、整段输出录音（webm）。
//
//   node Taierzhuang1938/Script_FirstLevelVoicePerspectiveTest.mjs [--scene=<重叠场景 id>]
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LaunchBrowser } from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import { ServeRoot } from './Script_DevServer.mjs';
import { MISSION_DIALOGUE } from './Data_FirstLevelMissionDialogue.mjs';
import { FIRST_LEVEL_DIALOGUE_DIRECTION, DIALOGUE_DUCK } from './Data_FirstLevelDialogueDirection.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const manifest=JSON.parse(fss.readFileSync(path.join(here,'Audio/FirstLevel/Data_FirstLevelVoiceManifest.json'),'utf8'));
const Recorded=cue=>cue.perLine&&cue.lines.every(line=>manifest.lines?.[line.id]);
const HasOverlap=cue=>Object.values(FIRST_LEVEL_DIALOGUE_DIRECTION[cue.id]?.lines||{}).some(d=>d.after==='prev'&&d.offsetS<0);
const wanted=process.argv.find(a=>a.startsWith('--scene='))?.slice(8);
const selfScene=MISSION_DIALOGUE.find(cue=>Recorded(cue)&&cue.lines.some(line=>line.who==='shunzi')&&cue.lines.some(line=>line.who!=='shunzi'));
const overlapScene=MISSION_DIALOGUE.find(cue=>(wanted?cue.id===wanted:HasOverlap(cue))&&Recorded(cue));
assert.ok(selfScene,'至少要有一场录齐逐句干声、既有顺子又有别人的场景（先跑 Script_SeedAudioFirstLevelBake 逐句模式）');
assert.ok(overlapScene,'至少要有一场录齐逐句干声、导演表里有压尾音重叠的场景');
const out=path.join(here,'_shots','FirstLevelVoicePerspective');await fs.mkdir(out,{recursive:true});
const server=await ServeRoot(path.resolve(here,'..'),0);
const browser=await LaunchBrowser(),page=await browser.newPage({viewport:{width:1280,height:720}});
try {
 await page.route('**/_check_VoicePerspective.html',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8">
 <style>body{margin:0;background:#1b1a17;color:#eee;font:22px/1.5 sans-serif}#sub{position:absolute;left:0;right:0;bottom:70px;text-align:center}
 .row{margin:4px}.row .who{color:#e8c77a;margin-right:.6em}.row.aside{opacity:.72;font-size:18px}#info{position:absolute;left:16px;top:12px;font:13px monospace;white-space:pre;color:#9c9}</style>
 <button id="start">Start</button><div id="info"></div><div id="sub"></div><script type="module">
 import {AudioEngine} from './Script_Audio.mjs';
 import {FirstLevelMissionVoice} from './Script_FirstLevelMissionVoice.mjs';
 const hud={spoken:[],SayLines(rows){const sub=document.querySelector('#sub');sub.replaceChildren();
   for(const r of [...rows].sort((a,b)=>(a.emphasis==='aside'?0:1)-(b.emphasis==='aside'?0:1))){const d=document.createElement('div');d.className='row '+r.emphasis;
   const w=document.createElement('span'),t=document.createElement('span');w.className='who';t.className='txt';w.textContent=r.speaker;t.textContent=r.text;d.append(w,t);sub.append(d);
   if(r.started)hud.spoken.push(r.text);}
   window.maxRows=Math.max(window.maxRows||0,rows.length);},Say(){}};
 window.audio=new AudioEngine();window.hud=hud;window.FirstLevelMissionVoice=FirstLevelMissionVoice;
 document.querySelector('#start').onclick=()=>audio.ctx.resume();window.ready=true;
 </script>`}));
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/_check_VoicePerspective.html`);
 await page.waitForFunction(()=>window.ready);await page.locator('#start').click();
 // 第一段：顺子那一场（视角、侧链、喊话让路）。整段采样放在同一个 evaluate 里。
 const first=await page.evaluate(async({selfId,holdMs})=>{
  const a=window.audio,Wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  a.SetListener({matrixWorld:{elements:[1,0,0,0,0,1,0,0,0,0,1,0,0,1.6,0,1]}});
  const voice=new window.FirstLevelMissionVoice({audio:a,hud:window.hud,Clock:()=>a.ctx.currentTime,
    Listener:()=>({x:0,y:1.6,z:0}),Position:()=>({x:0,y:1.6,z:-4}),Event(){},Done(){}});
  window.voice=voice;
  await voice.Load();
  const split=a.ctx.createChannelSplitter(2);a.softClip.connect(split);
  const meters=[0,1].map(i=>{const meter=a.ctx.createAnalyser();meter.fftSize=2048;split.connect(meter,i);return meter;});
  const buffers=meters.map(m=>new Float32Array(m.fftSize));
  window.Meter=()=>{meters.forEach((m,i)=>m.getFloatTimeDomainData(buffers[i]));let e=0,d=0;for(let i=0;i<buffers[0].length;i++){const l=buffers[0][i],r=buffers[1][i];e+=(l*l+r*r)/2;d+=(l-r)**2;}
    return {e,d,n:buffers[0].length};};
  const dest=a.ctx.createMediaStreamDestination();a.softClip.connect(dest);
  window.chunks=[];window.recorder=new MediaRecorder(dest.stream);window.recorder.ondataavailable=e=>window.chunks.push(e.data);window.recorder.start();
  window.pumping=true;(async()=>{let last=performance.now();while(window.pumping){await Wait(16);const now=performance.now();voice.Update(Math.min(.05,(now-last)/1000));last=now;}})();
  const left={x:-6,y:1.6,z:-1};
  const handle=voice.PlayScene(selfId,{speakers:new Proxy({},{get:()=>left})});
  const own={e:0,d:0,n:0},world={e:0,d:0,n:0};let ownRoute=null,worldRoute=null,duckDuring=null,farDuring=null,barkDuring=null,routeSwitch=false;
  const firstRoute=new Map();let lastWorld=-1e9;
  while(!handle.done){await Wait(12);
    const live=[...a.activeVoices].filter(v=>v.dialogueLine&&!v.stopping);
    for(const v of live){const fp=v.storySelfGain.gain.value>.5;if(firstRoute.has(v)&&firstRoute.get(v)!==fp)routeSwitch=true;firstRoute.set(v,fp);}
    const m=window.Meter();
    // 别人那句的混响尾巴会拖进紧接着的顺子那句：世界声源停了 0.8 s 以后才量「居中」。
    if(live.some(v=>!v.storySpeakerFirstPerson))lastWorld=a.ctx.currentTime;
    if(live.length===1&&live[0].storySpeakerFirstPerson&&a.ctx.currentTime-lastWorld>.8){own.e+=m.e;own.d+=m.d;own.n+=m.n;ownRoute??={self:live[0].storySelfGain.gain.value,world:live[0].storyWorldGain.gain.value,wet:live[0].wetGain?.gain.value??0};}
    if(live.length===1&&!live[0].storySpeakerFirstPerson){world.e+=m.e;world.d+=m.d;world.n+=m.n;worldRoute??={self:live[0].storySelfGain.gain.value,world:live[0].storyWorldGain.gain.value,distance:live[0].distance};}
    if(live.length&&duckDuring==null){await Wait(300);duckDuring=a.dialogueDuck.gain.value;farDuring=a.dialogueFarDuck.gain.value;
      const before=a.drops.dialogue;a.voicesReady=true;a.Bark('rally',{position:{x:3,y:0,z:-3},seed:1});barkDuring=a.drops.dialogue-before;}
  }
  await Wait(holdMs+700);
  const R=x=>({rms:Math.sqrt(x.e/Math.max(1,x.n)),diff:Math.sqrt(x.d/Math.max(1,x.n))});
  return {own:R(own),world:R(world),ownRoute,worldRoute,routeSwitch,duckDuring,farDuring,duckAfter:a.dialogueDuck.gain.value,
    farAfter:a.dialogueFarDuck.gain.value,barkDuring,yieldAfter:a.dialogueYield,availableLines:voice.State().availableLines,
    errors:voice.State().errors,voiceErrors:a.voiceErrors};
 },{selfId:selfScene.id,holdMs:DIALOGUE_DUCK.holdS*1000});
 // 第二段：重叠那一场。页面里跑、node 在两句同时响的那一刻截图。
 await page.evaluate(({overlapId})=>{
  const a=window.audio,voice=window.voice,Wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const spots=[{x:-5,y:1.6,z:-3},{x:5,y:1.6,z:-3},{x:0,y:1.6,z:-6},{x:-3,y:1.6,z:-5}],heads={};let k=0;
  const handle=voice.PlayScene(overlapId,{speakers:new Proxy(heads,{get:(t,who)=>t[who]??=spots[k++%spots.length]})});
  a.SetConcussion(1,650);
  window.second={done:false,maxLive:0,sourcesDistinct:true,floorSpeaking:null,overlapNow:false,positions:[]};
  (async()=>{const s=window.second;
   while(!handle.done){await Wait(10);
    const live=[...a.activeVoices].filter(v=>v.dialogueLine&&!v.stopping);
    if(live.length>s.maxLive){s.maxLive=live.length;const srcs=live.map(v=>v.nodes.find(n=>n.buffer));s.sourcesDistinct=new Set(srcs).size===srcs.length;
      s.positions=live.map(v=>v.panner?[+v.panner.positionX.value.toFixed(2),+v.panner.positionZ.value.toFixed(2)]:null);}
    if(live.length>=2)s.overlapNow=true;
    if(live.length&&s.floorSpeaking==null){await Wait(40);s.floorSpeaking=a.concussionFilter.frequency.value;}
   }
   await Wait(400);s.floorSilent=a.concussionFilter.frequency.value;s.done=true;})();
 },{overlapId:overlapScene.id});
 await page.waitForFunction(()=>window.second.overlapNow||window.second.done,null,{timeout:120000});
 await page.waitForTimeout(120);
 await page.screenshot({path:path.join(out,'Shot_OverlapSubtitles.png')});
 await page.waitForFunction(()=>window.second.done,null,{timeout:180000});
 const second=await page.evaluate(async()=>{
  window.pumping=false;window.recorder.stop();await new Promise(r=>window.recorder.onstop=r);
  const bytes=new Uint8Array(await new Blob(window.chunks,{type:'audio/webm'}).arrayBuffer());
  let bin='';for(let i=0;i<bytes.length;i+=0x8000)bin+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
  const state=window.voice.State();window.audio.Dispose();
  return {...window.second,maxRows:window.maxRows,spoken:window.hud.spoken,stats:state.dialogue.stats,webm:btoa(bin)};
 });
 await fs.writeFile(path.join(out,'Audio_DialogueOutput.webm'),Buffer.from(second.webm,'base64'));
 delete second.webm;
 const result={selfScene:selfScene.id,overlapScene:overlapScene.id,first,second};
 await fs.writeFile(path.join(out,'Data_VoicePerspective.json'),JSON.stringify(result,null,2));
 assert.ok(first.availableLines>0&&!first.errors.length&&!first.voiceErrors.length,'逐句干声清单与录音都加载了');
 assert.ok(first.own.rms>.005,'顺子那句真的到了输出');
 assert.ok(first.own.diff<first.own.rms*.02,'顺子的句子居中（第一人称干声）');
 assert.ok(first.ownRoute.self>.999&&first.ownRoute.world<.001&&first.ownRoute.wet<.001,'第一人称只走干声那一路');
 assert.ok(first.world.rms>.005&&first.world.diff>first.world.rms*.03,'别人的句子听得出方向（在听者左边）');
 assert.ok(first.worldRoute.self<.001&&first.worldRoute.world>.999&&first.worldRoute.distance>4,'别人的句子只走世界声源那一路');
 assert.ok(!first.routeSwitch,'一句从头到尾不在两路之间切换');
 assert.ok(Math.abs(first.duckDuring-10**(DIALOGUE_DUCK.ambienceDb/20))<.03,`说话时环境/音乐那一路压到 ${DIALOGUE_DUCK.ambienceDb} dB（实测 ${first.duckDuring}）`);
 assert.ok(Math.abs(first.farDuring-10**(DIALOGUE_DUCK.farDb/20))<.03,`说话时远处战斗压到 ${DIALOGUE_DUCK.farDb} dB（实测 ${first.farDuring}）`);
 assert.ok(first.duckAfter>.97&&first.farAfter>.97&&!first.yieldAfter,'说完 holdS 之后放回、喊话恢复');
 assert.equal(first.barkDuring,1,'对白窗口里非 priority 的自主喊话被让掉');
 assert.ok(second.maxLive>=2&&second.sourcesDistinct,'重叠时两句同时响、各是各的 BufferSource');
 assert.ok(second.maxRows>=2,'重叠时字幕同时两行');
 assert.equal(second.floorSpeaking,4200,'有人说话时震荡低通保住辅音');
 assert.equal(second.floorSilent,650,'没人说话时回到震荡曲线');
 console.log('ok real per-line dialogue output:',JSON.stringify({selfScene:selfScene.id,overlapScene:overlapScene.id,
   own:first.own,world:first.world,duck:[first.duckDuring,first.farDuring,first.duckAfter],bark:first.barkDuring,
   maxLive:second.maxLive,maxRows:second.maxRows,floor:[second.floorSpeaking,second.floorSilent],stats:second.stats}));
 console.log('evidence:',out);
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
