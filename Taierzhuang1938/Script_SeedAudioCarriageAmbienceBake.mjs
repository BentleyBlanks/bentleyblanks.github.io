// One train-only ambience take; --raw reuses an existing take without generation.
// node Taierzhuang1938/Script_SeedAudioCarriageAmbienceBake.mjs --raw=<absolute.mp3>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const here=path.dirname(fileURLToPath(import.meta.url));
const raw=process.argv.find(a=>a.startsWith('--raw='))?.slice(6);
if(!raw||!path.isAbsolute(raw))throw Error('Supply --raw=<absolute SeedAudio take>; this installer never generates another take');
const prompt="生成一条约四十秒的连续写实火车车厢环境录音，纯机械自然噪声，不是音乐。1938年老式蒸汽军列在钢轨接缝的铁路上中低速匀速前行，听者坐在中间的木质敞口兵员车厢，机车在很前方。主要声音是脚下沉厚柔和的车轮与轨道滚动轰隆，以及轮对经过轨缝时自然不完全整齐的咯噔、咔哒咔哒。近处厚木地板与木板凳偶尔轻微吱嘎，车厢连接铁扣和松动螺栓细碎颤响，车帮外有少量柔和风声。声音具有真实机械重量，接缝轻震，空间贴近坐在车厢里的耳朵；全程速度、距离和整体响度稳定，低频充实但不轰耳，高频柔和不过分尖锐，没有明显节拍配乐感，不能把火车节奏变成打击乐。开头与结尾均保持同样的持续行进纹理，不进站、不停车、不减速，适合作为可循环环境床。绝对没有音乐、旋律、和弦、乐器、鼓点、电子持续音、人声、闲聊、笑声、脚步、广播、汽笛、刹车、枪声、炮声、爆炸和动物。只要行驶列车本身、木车厢和少量穿堂风的真实噪声。";
const ffmpeg=process.env.FFMPEG||'ffmpeg';
const Run=args=>execFileSync(ffmpeg,args,{windowsHide:true,maxBuffer:64*1024*1024});
const pcm=Run(['-v','error','-i',raw,'-ac','2','-ar','44100','-af','highpass=f=35,lowpass=f=9000','-f','f32le','pipe:1']);
const frames=pcm.length/8, overlap=Math.round(.4*44100);
if(frames<44100*20||frames>44100*80)throw Error('Unexpected duration');
const count=frames-overlap, loop=Buffer.alloc(count*8);
pcm.copy(loop,0,overlap*8,(frames-overlap)*8);
for(let i=0;i<overlap;i++){const t=i/overlap;for(let c=0;c<2;c++){const v=pcm.readFloatLE((frames-overlap+i)*8+c*4)*(1-t)+pcm.readFloatLE(i*8+c*4)*t;loop.writeFloatLE(v,(count-overlap+i)*8+c*4);}}
let sum=0,peak=0;for(let i=0;i<loop.length;i+=4){const v=loop.readFloatLE(i);sum+=v*v;peak=Math.max(peak,Math.abs(v));}
const rms=Math.sqrt(sum/(loop.length/4));const gain=Math.min(10**(-27/20)/rms,10**(-3/20)/peak);
if(!Number.isFinite(gain)||!rms)throw Error('Silent take');
const file='AudioAmb_TrainCarriageOnly.mp3', output=path.join(here,'Audio/Amb',file);
execFileSync(ffmpeg,['-y','-v','error','-f','f32le','-ar','44100','-ac','2','-i','pipe:0','-af','volume='+gain,'-map_metadata','-1','-b:a','128k',output],{input:loop,windowsHide:true});
const final=Run(['-v','error','-i',output,'-f','f32le','pipe:1']);sum=0;peak=0;for(let i=0;i<final.length;i+=4){const v=final.readFloatLE(i);sum+=v*v;peak=Math.max(peak,Math.abs(v));}
const bytes=fs.readFileSync(output), Hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const entry={file,seconds:count/44100,channels:2,model:'seed-audio-1.0',prompt,sourceSha256:Hash(fs.readFileSync(raw)),sha256:Hash(bytes),bytes:bytes.length,rmsDbfs:10*Math.log10(sum/(final.length/4)),peakDbfs:20*Math.log10(peak),loopOverlapS:.4};
if(Math.abs(entry.rmsDbfs+27)>.6||entry.peakDbfs> -1)throw Error('Final level failed');
const manifestFile=path.join(here,'Audio/Amb/Data_AmbManifest.json');const manifest=JSON.parse(fs.readFileSync(manifestFile));
manifest.beds.trainCarriageOnly={file,seconds:entry.seconds,channels:2};manifest.credits.trainCarriageOnly={credit:'Volcengine SeedAudio 1.0 · train and carriage mechanics only',license:'volcengine',source:'Script_SeedAudioCarriageAmbienceBake.mjs'};manifest.carriageSources.trainCarriageOnly=entry;
fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(entry));
