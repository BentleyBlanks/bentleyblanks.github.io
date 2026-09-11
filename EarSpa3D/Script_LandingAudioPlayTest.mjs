import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here);
const common=path.resolve(root,execFileSync('git',['rev-parse','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim());
const require=createRequire(path.join(path.dirname(common),'package.json')),{chromium}=require('playwright-core');
const browser=await chromium.launch({executablePath:process.env.EARSPA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const page=await browser.newPage(),errors=[],requests=[];
page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.url());});page.on('request',r=>requests.push(r.url()));
try{
 const url=process.argv.find(a=>a.startsWith('--url='))?.slice(6)||'http://127.0.0.1:8107/EarSpa3D/';
 await page.goto(url+'?debug=1');await page.waitForFunction(()=>window.__EarSpaDebug);
 await page.locator('#ear-start').click();
 const report=await page.evaluate(async()=>{
  const a=__EarSpaDebug.audio;await a.ready;a.setBgmVolume(0);a.setAmbienceVolume(0);
  const wait=ms=>new Promise(r=>setTimeout(r,ms));await wait(3300);
  const signals=[];
  for(const [cue,gain] of [['waxLandSmall',.45],['waxLandMedium',.6],['waxLandLarge',.72]]){
   if(!a.debug().sfxLoaded.includes(cue+'×1'))throw Error('Missing approved clip '+cue);
   const analyser=a.analyser(),data=new Float32Array(analyser.fftSize);let peak=0,sum=0,n=0;
   const timer=setInterval(()=>{analyser.getFloatTimeDomainData(data);for(const v of data){peak=Math.max(peak,Math.abs(v));sum+=v*v;n++;}},4);
   const duration=a.playSfx(cue,{gain});await wait(350);clearInterval(timer);
   const playback=a.debug().recentPlayback.at(-1);
   if(duration>.22||duration<.08||playback.truncated||playback.gain!==gain)throw Error('Selected transient changed '+cue);
   if(peak<.001||peak>=.99)throw Error('Output missing or clipping '+cue);
   signals.push({cue,peak,rms:Math.sqrt(sum/n),playback});
  }
  const before=a.debug().live.sfxStarted;
  for(const cue of ['customerPain','customerStop','customerComfort','customerClear','relaxSigh']){if(a.playSfx(cue)!==0)throw Error('Retired voice played');}
  if(a.debug().live.sfxStarted!==before)throw Error('Retired voice fallback');
  a.setMaster(0);await wait(150);a.playSfx('waxLandLarge');await wait(70);
  const data=new Float32Array(a.analyser().fftSize);a.analyser().getFloatTimeDomainData(data);
  if(data.some(v=>Math.abs(v)>.00001))throw Error('Mute not silent');
  return {signals,noVoice:true,muted:true,version:__EarSpaProbe().version};
 });
 if(requests.some(r=>/AudioSfx_(Customer|RelaxSigh|ChunkLand)/.test(r)))throw Error('Retired asset requested');
 if(errors.length)throw Error(errors.join('\n'));
 await fs.mkdir(path.join(here,'_dev'),{recursive:true});
 await fs.writeFile(path.join(here,'_dev/Data_LandingAudioPlayReport.json'),JSON.stringify({...report,errors,clean:true},null,2));
 console.log('PASS three approved transients, gain preservation, measured output, retired voice silence, mute and no resource errors');
}finally{await browser.close();}
