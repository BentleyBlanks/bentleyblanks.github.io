// Generate exactly three local review takes; install only with --install-reviewed.
// node Taierzhuang1938/Script_SeedAudioTrainSfxBake.mjs [--dry]
// node Taierzhuang1938/Script_SeedAudioTrainSfxBake.mjs --install-reviewed
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { SFX_LICENSES } from "./Data_SfxSources.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(here, "../tmp/TrainSfxPreview");
const ffmpeg = process.env.FFMPEG || "ffmpeg";
const ffprobe = process.env.FFPROBE || "ffprobe";
const assets = [
  { id: "trainBrake", name: "TrainBrake", minSeconds: 1, maxSeconds: 12,
    prompt: "生成一条独立的真实电影拟音音效：1938年老式蒸汽军列减速制动，听点在木质车厢内。约五秒，一次完整的刹车过程：先是沉重车轮低频滚动逐渐放慢，闸瓦与钢轮摩擦发出粗粝、略带尖锐的金属吱鸣，音高自然下滑，最后车体轻轻顿一下，短促泄压嘶声随即消散。起音直接，过程连续，尾音完整自然停止。克制写实、有机械重量，不要恐怖片音效。只要这一件制动音，不要汽笛，不要现代电车提示音、汽车刹车、撞车、说话、旁白、音乐或长段静音。" },
  { id: "trainWhistle", name: "TrainWhistle", minSeconds: 1, maxSeconds: 10,
    prompt: "生成一条独立的真实蒸汽机车汽笛音效。1930年代中国北方的蒸汽火车，距离听者约三十米，一声低沉厚实、略带沙哑气流质感的双音蒸汽汽笛，持续约三秒，起音有短促蒸汽涌出，持续音自然微颤，末尾蒸汽压力下降后完整收住，整条约四秒。一次长鸣，不要重复。户外小站只有很短的自然空间尾音。不要现代电子电笛、船笛、警笛、口哨、汽车喇叭、铁轨节奏、人声、广播、音乐和夸张回声。" },
  { id: "carriageRattle", name: "CarriageRattle", minSeconds: 0.35, maxSeconds: 6,
    prompt: "生成一条独立短促的老式木质火车车厢结构震响音效，约一秒半。听者坐在1938年军列木车厢内部，车轮刚越过一处钢轨接缝：两下相连的沉闷咯噔，厚木板与木凳短促吱嘎共振，松动铁扣随之细碎哐啷两三下，然后自然衰减停止。有重量但不是猛烈撞击，近处真实录音质感。这是一次经过接缝引起的短震响，不是连续火车环境底，不要循环，不要长段轮轨轰鸣。不要汽笛、刹车、人声、喘息、脚步、枪炮、音乐或旁白。" },
];
const Hash = value => crypto.createHash("sha256").update(value).digest("hex");
function Run(command, args) {
  return execFileSync(command, args, { windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
}
function Measure(file) {
  const pcm = Run(ffmpeg, ["-v", "error", "-i", file, "-ac", "1", "-ar", "44100", "-f", "f32le", "pipe:1"]);
  const frames = []; let peak = 0;
  for (let start = 0; start < pcm.length; start += 882 * 4) {
    const end = Math.min(pcm.length, start + 882 * 4); let sum = 0;
    for (let i = start; i < end; i += 4) { const v = pcm.readFloatLE(i); sum += v * v; peak = Math.max(peak, Math.abs(v)); }
    frames.push(Math.sqrt(sum / ((end - start) / 4)));
  }
  const gate = Math.max(...frames) * 0.1;
  const active = frames.filter(v => v >= gate);
  return { activeRmsDbfs: 20 * Math.log10(Math.sqrt(active.reduce((s, v) => s + v * v, 0) / active.length)), peakDbfs: 20 * Math.log10(peak) };
}
function InstallReviewed() {
  const report = JSON.parse(fs.readFileSync(path.join(outputDir, "Data_TrainSfxPreview.json"), "utf8"));
  // Validate every selected take before copying any of them; no generation or re-encoding.
  const takes = assets.map(asset => {
    const reviewed = report.assets[asset.id];
    const source = path.join(outputDir, `AudioSfx_${asset.name}_SeedAudioPreview.mp3`);
    const bytes = fs.readFileSync(source);
    if (!reviewed || Hash(bytes) !== reviewed.sha256) throw new Error(`${asset.id}: reviewed SHA-256 mismatch`);
    return { asset, reviewed, bytes, file: `AudioSfx_${asset.name}_01.mp3` };
  });
  const manifestPath = path.join(here, "Audio/Sfx/Data_SfxManifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.licenses.volcengine = SFX_LICENSES.volcengine;
  manifest.trainSources ??= {};
  for (const {asset, reviewed, bytes, file} of takes) {
    fs.writeFileSync(path.join(here, "Audio/Sfx", file), bytes);
    manifest.cues[asset.id] = { files: [file], seconds: Number(reviewed.seconds.toFixed(3)), credit: `Volcengine SeedAudio 1.0 · ${asset.id} · 2026-09-11 approved take`, license: "volcengine" };
    const {file: localFile, raw, ...provenance} = reviewed;
    manifest.trainSources[asset.id] = { ...provenance, file, model: report.model, approvedOn: "2026-09-11" };
    console.log(`${asset.id}: installed reviewed take unchanged (${reviewed.sha256})`);
  }
  manifest.bakedAt = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}
async function Main() {
  if (process.argv.includes("--dry")) { console.log(JSON.stringify({ outputDir, assets }, null, 2)); return; }
  if (process.argv.includes("--install-reviewed")) { InstallReviewed(); return; }
  const key = process.env.VOLCENGINE_API_KEY;
  if (!key) throw new Error("VOLCENGINE_API_KEY is required in the environment");
  fs.mkdirSync(path.join(outputDir, "Raw"), { recursive: true });
  const reportPath = path.join(outputDir, "Data_TrainSfxPreview.json");
  const report = fs.existsSync(reportPath) ? JSON.parse(fs.readFileSync(reportPath, "utf8")) : { model: "seed-audio-1.0", status: "local review, not deployed", assets: {} };
  for (const asset of assets) {
    const raw = path.join(outputDir, "Raw", `AudioRaw_${asset.name}_${Hash(asset.prompt).slice(0, 12)}.mp3`);
    const output = path.join(outputDir, `AudioSfx_${asset.name}_SeedAudioPreview.mp3`);
    if (!fs.existsSync(raw)) {
      console.log(`${asset.id}: requesting one SeedAudio take`);
      const response = await fetch("https://openspeech.bytedance.com/api/v3/tts/create", {
        method: "POST", headers: { "Content-Type": "application/json", "X-Api-Key": key, "X-Api-Request-Id": crypto.randomUUID() },
        body: JSON.stringify({ model: "seed-audio-1.0", text_prompt: asset.prompt, audio_config: { format: "mp3", sample_rate: 44100, pitch_rate: 0, speech_rate: 0, loudness_rate: 0 }, watermark: {} }),
        signal: AbortSignal.timeout(360000),
      });
      if (!response.ok) throw new Error(`SeedAudio HTTP ${response.status}`);
      const payload = await response.json();
      if (typeof payload.audio !== "string") throw new Error("SeedAudio returned no audio");
      const bytes = Buffer.from(payload.audio, "base64");
      if (bytes.length < 2048) throw new Error("SeedAudio returned an empty take");
      fs.writeFileSync(raw, bytes);
    }
    const prepared = path.join(outputDir, "Raw", `${asset.name}_Prepared.wav`);
    Run(ffmpeg, ["-y", "-v", "error", "-i", raw, "-map_metadata", "-1", "-ac", "1", "-ar", "44100", "-af", "highpass=f=35,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.025,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.12,areverse,afade=t=in:d=0.008", prepared]);
    const measured = Measure(prepared);
    const gainDb = Math.min(-25 - measured.activeRmsDbfs, -1.5 - measured.peakDbfs);
    if (!Number.isFinite(gainDb)) throw new Error(`${asset.id}: silent/invalid audio`);
    Run(ffmpeg, ["-y", "-v", "error", "-i", prepared, "-map_metadata", "-1", "-af", `volume=${gainDb}dB`, "-ac", "1", "-ar", "44100", "-b:a", "128k", output]);
    const seconds = Number(Run(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", output]).toString().trim());
    const final = Measure(output);
    if (!(seconds >= asset.minSeconds && seconds <= asset.maxSeconds) || Math.abs(final.activeRmsDbfs + 25) > 0.5 || final.peakDbfs > -1) throw new Error(`${asset.id}: quality check failed ${JSON.stringify({ seconds, ...final })}`);
    report.assets[asset.id] = { file: output, raw, prompt: asset.prompt, generatedAt: new Date().toISOString(), seconds, ...final, sha256: Hash(fs.readFileSync(output)) };
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
    console.log(`${asset.id}: ${seconds.toFixed(3)}s, active RMS ${final.activeRmsDbfs.toFixed(2)} dBFS, peak ${final.peakDbfs.toFixed(2)} dBFS, ${output}`);
  }
}
Main().catch(error => { console.error(error.message); process.exitCode = 1; });
