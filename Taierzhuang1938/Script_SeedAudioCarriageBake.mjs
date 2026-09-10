// Two bounded, continuous crowd performances. Existing main dialogue/rail bed stay intact.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";
import {CARRIAGE_SOUND_ASSETS} from "./Data_FirstLevelCarriageSound.mjs";
import {AMB_LICENSES} from "./Data_AmbSources.mjs";
const here=path.dirname(fileURLToPath(import.meta.url)), out=path.join(here,"Audio/Amb");
const manifestPath=path.join(out,"Data_AmbManifest.json");
const raw=path.join(out,"_raw/CarriageCrowd");
const dry=process.argv.includes("--dry"),force=process.argv.includes("--force");
const selected=process.argv.find(a=>a.startsWith("--only="))?.slice(7).split(",");
const Hash=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
const mastering="ChannelsBeforeLoudnessV2";
function Run(command,args){
  const r=spawnSync(command,args,{encoding:"utf8",windowsHide:true});
  if(r.status!==0)throw new Error(`${command} failed: ${r.stderr?.slice(0,250)}`);
  return r.stdout;
}
async function Main(){
 const manifest=JSON.parse(fs.readFileSync(manifestPath,"utf8"));
 for(const asset of CARRIAGE_SOUND_ASSETS.filter(a=>!selected||selected.includes(a.id))){
  const promptHash=Hash(asset.prompt),file=path.join(out,asset.file);
  if(dry){console.log(`${asset.id}: ONE continuous request, ${asset.prompt.length} characters`);continue;}
  const previous=manifest.carriageSources?.[asset.id];
  if(!force&&previous?.mastering===mastering&&previous?.promptHash===promptHash&&fs.existsSync(file)&&Hash(fs.readFileSync(file))===previous.sha256){console.log(`${asset.id}: existing verified`);continue;}
  const source=path.join(raw,asset.file);
  if(force||previous?.promptHash!==promptHash||!fs.existsSync(source)){
  const key=process.env.VOLCENGINE_API_KEY;
  if(!key)throw new Error("VOLCENGINE_API_KEY is required in the environment");
  const response=await fetch("https://openspeech.bytedance.com/api/v3/tts/create",{
   method:"POST",headers:{"Content-Type":"application/json","X-Api-Key":key,"X-Api-Request-Id":crypto.randomUUID()},
   body:JSON.stringify({model:"seed-audio-1.0",text_prompt:asset.prompt,audio_config:{format:"mp3",sample_rate:44100,pitch_rate:0,speech_rate:0,loudness_rate:0},watermark:{}}),
   signal:AbortSignal.timeout(360000),
  });
  if(!response.ok)throw new Error(`Seed Audio HTTP ${response.status}`);
  const payload=await response.json();
  if(typeof payload.audio!=="string")throw new Error("Seed Audio returned no audio");
  const bytes=Buffer.from(payload.audio,"base64");
  if(bytes.length<2048)throw new Error("Seed Audio returned an empty take");
  fs.mkdirSync(raw,{recursive:true});
  fs.writeFileSync(source,bytes);
  }
  const temp=file+".tmp.mp3";
  Run(process.env.FFMPEG||"ffmpeg",["-y","-v","error","-i",source,"-map_metadata","-1","-af",
   `aformat=channel_layouts=${asset.kind==="bed"?"stereo":"mono"},highpass=f=160,lowpass=f=${asset.kind==="bed"?3800:4600},loudnorm=I=${asset.targetLufs}:TP=-4:LRA=9`,
   "-ac",asset.kind==="bed"?"2":"1","-ar","44100","-b:a","128k",temp]);
  const seconds=Number(Run(process.env.FFPROBE||"ffprobe",["-v","error","-show_entries","format=duration","-of","csv=p=0",temp]).trim());
  if(!(seconds>(asset.kind==="bed"?8:2)))throw new Error(`${asset.id}: generated take too short`);
  fs.renameSync(temp,file);
  const info={file:asset.file,seconds:Number(seconds.toFixed(3)),channels:asset.kind==="bed"?2:1};
  if(asset.kind==="bed")manifest.beds[asset.id]=info;
  else manifest.cues[asset.id]={files:[asset.file],seconds:info.seconds,credit:"Volcengine SeedAudio 1.0 · 车厢后排集体起哄",license:"volcengine"};
  manifest.licenses.volcengine=AMB_LICENSES.volcengine;
  manifest.credits[asset.id]={credit:"Volcengine SeedAudio 1.0 · 车厢多人环境",license:"volcengine",source:"SeedAudio API generated"};
  manifest.carriageSources??={};
  manifest.carriageSources[asset.id]={...info,model:"seed-audio-1.0",requests:1,continuous:true,promptHash,mastering,sha256:Hash(fs.readFileSync(file)),bytes:fs.statSync(file).size};
  fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+"\n");
  console.log(`${asset.id}: ${seconds.toFixed(3)}s saved`);
 }
}
Main().catch(error=>{console.error(error.message);process.exitCode=1;});
