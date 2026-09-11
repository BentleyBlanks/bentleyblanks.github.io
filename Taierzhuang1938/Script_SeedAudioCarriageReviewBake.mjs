// Exactly seven user-requested takes (2026-09-11); raw audio and review page stay local.
// node Taierzhuang1938/Script_SeedAudioCarriageReviewBake.mjs [--dry] [--only=PlaneEngine,...]
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { SFX_LICENSES } from "./Data_SfxSources.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(here, "../tmp/AudioCarriageReview");
const musicBrief = "原创纯器乐车厢背景配乐，完整约一分四十秒。1938年开往前线的木质军列，年轻战友闲聊、互相打趣，窗外前途未卜。整体不紧张，七成松弛、两成隐约压迫、一成克制幽默；不做喜剧，轻微俏皮来自错拍和乐器间短小问答。音符稀疏，给对白留出空间，音量平稳，中段不升级成战斗高潮。必须全新旋律，不引用任何现成主题。没有人声、合唱、对白、火车拟音、枪炮、警报、突然巨响，没有预告片冲击和恐怖音效。开头轻柔进入，结尾自然收束。";
const assets = [
  { id: "PlaneEngine", title: "日机活塞引擎 · 新录音", kind: "sfx", min: 5, max: 30,
    prompt: "生成一条约十二秒的写实电影拟音：二战1930年代双发螺旋桨飞机在稳定巡航功率下的活塞发动机声音。固定相对距离三十米录音，沉厚但不刺耳的径向发动机轰隆，桨叶轻微扑扑脉动，两个真实机械发动机之间缓慢自然的拍频，少量柔和空气气流。整段转速和响度稳定，适合游戏作为移动飞机持续声源的循环素材；不要预先做飞过或多普勒，不要加速、启动和熄火。开始和结束均有平稳可衔接的纹理。只要真实机械声，不要电子振荡器、电锯、蜂鸣、合成锯齿波感、喷气机、直升机、汽笛、音乐、说话、枪炮和长段静音。" },
  { id: "ExplosionNearReplacement", title: "近距爆炸 · 冲击与碎土", kind: "sfx", min: 1, max: 12,
    prompt: "生成一条独立的真实战争电影近距离爆炸音效，整条约四秒，仅一次爆炸。户外土路上七八米外一枚迫击炮弹炸开：第一瞬间干脆短促的高压爆裂，紧跟一记结实有空气推动感的低中频闷冲，极短的宽频炸响；随后少量泥土与碎石落地哗啦噼啪，空间尾声自然迅速衰减并完整停止。沉重、有实体冲击但不做夸张低音轰炸，起音利落不拖沓。不要引信飞啸，不要重复爆炸、连续炮战、耳鸣、尖锐长鸣、激光、科幻音效、音乐、人声、旁白和长段静音。" },
  { id: "ExplosionToTinnitus", title: "爆炸 → 闷听 → 耳鸣 · 独立连续音效", kind: "sfx", min: 4, max: 22,
    prompt: "一次性生成一条完整连续约九秒的电影主观听觉音效，不分段、不插播旁白。0秒近处突然一次真实炮弹爆炸，短而厚重的空气冲击加碎土；约0.3秒冲击之后外界声音骤然压低成遥远低通闷响，过渡连续；0.6秒起缓缓浮出一根细而轻的主观耳鸣，轻微颤动，不能尖厉刺耳，响度明显低于爆炸；2至6秒耳鸣悬着、底下是很轻的模糊余响，最后3秒耳鸣逐渐消退、听觉缓慢恢复，完整安静结束。只有第一下爆炸，不要第二下爆炸，不要心跳、喘气、台词、尖叫、配乐、恐怖音效、警笛、节奏和循环。" },
  { id: "CarriageMilitaryDryWit", title: "车厢 01 · 军旅冷幽默", kind: "music", min: 45, max: 180,
    prompt: musicBrief + "风格方向参考COD4、COD5、COD14中安静叙事过场的军事电影质感，弱化战斗节奏。速度约78BPM，低音弦乐稀疏八分脉冲、极轻的刷奏军鼓、温暖圆号短句，拨弦小提琴与单簧管偶尔一问一答，轻微错拍像战友挤眉打趣。低弦保持一层隐约未解决和声，但旋律有温度、随性、不催促。" },
  { id: "CarriageMilitaryWindow", title: "车厢 02 · 窗边闲话", kind: "music", min: 45, max: 180,
    prompt: musicBrief + "风格方向参考COD4、COD5、COD14的安静战友叙事与二战行军间歇氛围。速度约70BPM，以低音吉他柔和断奏、很轻的框鼓和木质打击、低音单簧管搭配中提琴为主，短短的拨弦音型有一点悠闲摇摆，圆号只在句末温和回应。远处柔暗弦乐维持轻微压力，上层小调旋律带一丝干巴巴的幽默，绝不热血冲锋。" },
  { id: "CarriageCinematicQuietSmile", title: "车厢 03 · 暗流里的笑意", kind: "music", min: 45, max: 180,
    prompt: musicBrief + "汉斯季默式克制的电影配乐方向：宽而温暖的低弦和声、极轻柔的低频电子底色，钢琴三音小动机，拨弦大提琴与木管形成轻巧错拍问答。速度约72BPM，慢速和声变化、细密织体和微小动态，不用巨型铜管号角，不用持续轰鸣低音。阴影像窗外远景，人物间则温暖，轻轻扬眉般的一点幽默，不卖弄、不催泪，不发展成动作场面。" },
  { id: "CarriageCinematicCompanions", title: "车厢 04 · 同车的年轻人", kind: "music", min: 45, max: 180,
    prompt: musicBrief + "汉斯季默式叙事电影配乐方向，与钢琴版本有明显区别：中提琴温暖长音、低音拨弦缓慢步态、巴松管两三音含蓄调侃，柔和圆号远远呼应，极轻的马林巴偶尔落在弱拍。速度约82BPM，舒展留白、和声有一点悬念又不过分悲伤，隐约压迫之中有年轻战友的轻松和乐观。没有尖弦颤音、没有急促固定音型、没有巨大打击高潮。" },
];
const Hash = value => crypto.createHash("sha256").update(value).digest("hex");
const Run = (command, args) => execFileSync(command, args, { windowsHide: true, maxBuffer: 96 * 1024 * 1024 });
function Measure(file) {
  const pcm = Run(process.env.FFMPEG || "ffmpeg", ["-v", "error", "-i", file, "-ac", "1", "-ar", "44100", "-f", "f32le", "pipe:1"]);
  const frames = []; let peak = 0, total = 0;
  for (let start = 0; start < pcm.length; start += 882 * 4) {
    const end = Math.min(pcm.length, start + 882 * 4); let sum = 0;
    for (let i = start; i < end; i += 4) { const v = pcm.readFloatLE(i); sum += v * v; peak = Math.max(peak, Math.abs(v)); }
    frames.push(Math.sqrt(sum / ((end - start) / 4))); total += sum;
  }
  const gate = Math.max(...frames) * 0.1, active = frames.filter(value => value >= gate);
  return { rmsDbfs: 10 * Math.log10(total / (pcm.length / 4)), activeRmsDbfs: 10 * Math.log10(active.reduce((sum, v) => sum + v * v, 0) / active.length), peakDbfs: 20 * Math.log10(peak) };
}
function WriteReview(report) {
  const cards = assets.filter(a => report.assets[a.id]).map(a => {
    const r = report.assets[a.id];
    const direction = a.id.startsWith("CarriageMilitary") ? "COD4 / 5 / 14 方向" : a.kind === "music" ? "汉斯季默电影配乐方向" : "独立音效";
    return `<article><h2>${a.title}</h2><p>${r.seconds.toFixed(1)} 秒 · ${direction}</p><audio controls preload="metadata" src="${r.file}"></audio><a href="${r.file}" download>下载 MP3</a></article>`;
  }).join("\n");
  fs.writeFileSync(path.join(outputDir, "index.html"), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>车厢配乐与音效试听</title><style>body{background:#171b1c;color:#eee9dd;font:16px system-ui;margin:0 auto;padding:36px;max-width:1080px}h1{font-size:30px}p{color:#b8b9b3;line-height:1.7}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}article{background:#242b2c;padding:24px;border-radius:12px;border:1px solid #424c49}h2{font-size:19px;margin-top:0}audio{width:100%;margin:8px 0 18px}a{color:#d8ba77}button{position:sticky;top:12px;padding:12px 24px;background:#d8ba77;border:0;border-radius:8px;font:inherit;cursor:pointer;margin-bottom:24px}</style><h1>车厢配乐与音效 · 新版试听</h1><p>4 首车厢配乐、3 条音效。轻微压迫，留白与一点战友间的幽默。<br>点击播放；每次只播放一条，均可暂停、拖动和下载，不自动循环。</p><button id="stop">■ 全部停止</button><div class="grid">${cards}</div><script>const players=[...document.querySelectorAll('audio')];for(const p of players){p.volume=.65;p.addEventListener('play',()=>players.forEach(q=>{if(q!==p)q.pause()}))}function Stop(){players.forEach(p=>{p.pause();p.currentTime=0})}document.getElementById('stop').onclick=Stop;window.addEventListener('pagehide',Stop);</script></html>`);
}
async function Main() {
  if (process.argv.includes("--review-only")) {
    WriteReview(JSON.parse(fs.readFileSync(path.join(outputDir,"Data_AudioReview.json"),"utf8")));
    return;
  }
  if (process.argv.includes("--install-sfx")) {
    const report = JSON.parse(fs.readFileSync(path.join(outputDir, "Data_AudioReview.json"), "utf8"));
    const manifestPath = path.join(here, "Audio/Sfx/Data_SfxManifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const selected = [["PlaneEngine", "planeDrone"], ["ExplosionNearReplacement", "explosionNear"]].map(([id, cue]) => {
      const take = report.assets[id], bytes = fs.readFileSync(path.join(outputDir, take.file));
      if (Hash(bytes) !== take.sha256) throw new Error(`${id}: SHA-256 mismatch`);
      return {take, bytes, cue};
    });
    manifest.licenses.volcengine = SFX_LICENSES.volcengine;
    manifest.carriageReviewSources ??= {};
    for (const {take, bytes, cue} of selected) {
      fs.writeFileSync(path.join(here, "Audio/Sfx", take.file), bytes);
      manifest.cues[cue] = {files:[take.file], seconds:Number(take.seconds.toFixed(3)), credit:`Volcengine SeedAudio 1.0 · ${take.title} · 2026-09-11`,license:"volcengine"};
      manifest.carriageReviewSources[cue] = {...take, model:report.model};
      console.log(`${cue}: installed ${take.file} (${take.sha256})`);
    }
    fs.writeFileSync(manifestPath, JSON.stringify(manifest,null,2)+"\n");
    return;
  }
  const only = process.argv.find(a => a.startsWith("--only="))?.slice(7).split(",");
  if (only?.some(id => !assets.some(a => a.id === id))) throw new Error("Unknown --only id");
  const selected = assets.filter(a => !only || only.includes(a.id));
  if (process.argv.includes("--dry")) { console.log(JSON.stringify({outputDir, assets: selected}, null, 2)); return; }
  const key = process.env.VOLCENGINE_API_KEY;
  if (!key) throw new Error("VOLCENGINE_API_KEY is required in the environment");
  fs.mkdirSync(path.join(outputDir, "Raw"), {recursive:true});
  const reportPath = path.join(outputDir, "Data_AudioReview.json");
  const report = fs.existsSync(reportPath) ? JSON.parse(fs.readFileSync(reportPath, "utf8")) : {provider:"Volcengine",model:"seed-audio-1.0",assets:{}};
  for (const asset of selected) {
    const raw = path.join(outputDir, "Raw", `AudioRaw_${asset.id}_${Hash(asset.prompt).slice(0,12)}.mp3`);
    const file = `Audio${asset.kind === "music" ? "Bgm" : "Sfx"}_${asset.id}.mp3`, output = path.join(outputDir,file);
    if (!fs.existsSync(raw)) {
      console.log(`${asset.id}: requesting ONE continuous take`);
      const response = await fetch("https://openspeech.bytedance.com/api/v3/tts/create", {
        method:"POST",headers:{"Content-Type":"application/json","X-Api-Key":key,"X-Api-Request-Id":crypto.randomUUID()},
        body:JSON.stringify({model:"seed-audio-1.0",text_prompt:asset.prompt,audio_config:{format:"mp3",sample_rate:44100,pitch_rate:0,speech_rate:0,loudness_rate:0},watermark:{}}),
        signal:AbortSignal.timeout(360000),
      });
      if (!response.ok) throw new Error(`SeedAudio HTTP ${response.status}`);
      const payload = await response.json();
      if (typeof payload.audio !== "string") throw new Error("SeedAudio returned no audio");
      const bytes=Buffer.from(payload.audio,"base64");
      if(bytes.length<2048)throw new Error("SeedAudio returned an empty take");
      fs.writeFileSync(raw,bytes);
    }
    const seconds=Number(Run(process.env.FFPROBE||"ffprobe",["-v","error","-show_entries","format=duration","-of","csv=p=0",raw]).toString());
    if (!(seconds >= asset.min && seconds <= asset.max)) throw new Error(`${asset.id}: unexpected duration ${seconds}; raw retained`);
    const prepared = path.join(outputDir,"Raw",`${asset.id}_Prepared.wav`);
    const fade = asset.kind === "music" ? 1.2 : 0.025;
    if (asset.id === "PlaneEngine") {
      // Move the seam into a 350 ms tail/head overlap; no silent gap on each revolution.
      const pcm = Run(process.env.FFMPEG||"ffmpeg",["-v","error","-i",raw,"-ac","1","-ar","44100","-af","highpass=f=30","-f","f32le","pipe:1"]);
      const count = pcm.length / 4, overlap = Math.round(.35 * 44100);
      const loop = Buffer.alloc((count - overlap) * 4);
      pcm.copy(loop, 0, overlap * 4, (count - overlap) * 4);
      for (let i=0;i<overlap;i++) {
        const t = i / (overlap - 1);
        const sample = pcm.readFloatLE((count-overlap+i)*4)*Math.cos(t*Math.PI/2)+pcm.readFloatLE(i*4)*Math.sin(t*Math.PI/2);
        loop.writeFloatLE(sample,(count-2*overlap+i)*4);
      }
      const loopFile=path.join(outputDir,"Raw","PlaneEngine_Loop.pcm"); fs.writeFileSync(loopFile,loop);
      Run(process.env.FFMPEG||"ffmpeg",["-y","-v","error","-f","f32le","-ar","44100","-ac","1","-i",loopFile,prepared]);
    } else {
      Run(process.env.FFMPEG||"ffmpeg",["-y","-v","error","-i",raw,"-map_metadata","-1","-ac",asset.kind==="music"?"2":"1","-ar","44100","-af",`highpass=f=30,afade=t=in:d=${fade},afade=t=out:st=${Math.max(0,seconds-fade-.05)}:d=${fade}`,prepared]);
    }
    const metric=asset.kind==="music"?"rmsDbfs":"activeRmsDbfs", target=asset.kind==="music"?-27:-25;
    const before=Measure(prepared), gainDb=Math.min(target-before[metric],-3-before.peakDbfs);
    if(!Number.isFinite(gainDb))throw new Error(`${asset.id}: silent/invalid audio`);
    Run(process.env.FFMPEG||"ffmpeg",["-y","-v","error","-i",prepared,"-map_metadata","-1","-af",`volume=${gainDb}dB`,"-ar","44100","-b:a","160k",output]);
    const level=Measure(output);
    if(Math.abs(level[metric]-target)>.5||level.peakDbfs>-1)throw new Error(`${asset.id}: level QC failed ${JSON.stringify(level)}`);
    const outputSeconds=Number(Run(process.env.FFPROBE||"ffprobe",["-v","error","-show_entries","format=duration","-of","csv=p=0",output]).toString());
    report.assets[asset.id]={title:asset.title,file,seconds:outputSeconds,...level,sha256:Hash(fs.readFileSync(output)),prompt:asset.prompt,rawSha256:Hash(fs.readFileSync(raw)),generatedAt:new Date().toISOString()};
    fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+"\n"); WriteReview(report);
    console.log(`${asset.id}: ${seconds.toFixed(2)}s, ${metric} ${level[metric].toFixed(2)}, peak ${level.peakDbfs.toFixed(2)} dBFS; ${output}`);
  }
}
Main().catch(error=>{console.error(error.message);process.exitCode=1;});
