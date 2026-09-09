// SeedAudio bullet replacements. Approved explosions use Script_SeedAudioExplosionBake.mjs. Default: rebake cached takes without API calls.
// --generate: generate missing takes; --force: regenerate selected takes.
// --generate-only: keep raw takes for inspection; --only=<cue>: select one group.
// --dry: print the exact generation plan without writing or calling the API.
// Raw takes and QC reports are ignored; only validated MP3s and manifest deploy.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SFX_LICENSES } from "./Data_SfxSources.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(here, "Audio/Sfx");
const rawDir = path.join(outputDir, "_raw/SeedAudioCombat20260909");
const ffmpeg = process.env.FFMPEG || "ffmpeg";
const model = "seed-audio-1.0";
const args = process.argv.slice(2);
const only = args.find((arg) => arg.startsWith("--only="))?.slice(7);
const common = "用于写实第一人称战争游戏的独立单次音效，单声道。只有一次事件，开头立即发生，结尾自然衰减至安静。不要重复、连发、音乐、人声、口令、背景战场或录音底噪。";
const groups = [
  { cue: "bulletCrack", count: 4, duration: 0.32, hp: 250, lp: 14000,
    prompt: "一颗超音速步枪子弹从听者耳边极近处飞过产生的一记短促音爆，像空气被突然撕裂的尖脆啪嗒，约零点一秒后迅速结束，仅有极短擦风尾音。不是枪口发射声，不是爆炸，不是鞭子挥动，不要长啸、金属反弹、激光或命中声。",
    variants: ["非常干脆的一记空气脆裂。", "略厚实的一记短啪声。", "偏尖锐的一记空气撕裂。", "带极短砂质空气尾音的一记脆响。"] },
  { cue: "bulletWhizz", count: 4, duration: 0.65, hp: 300, lp: 12000,
    prompt: "单颗高速步枪子弹擦着耳边掠过的短促破风呼啸。声音极快靠近、瞬间擦耳、立即远离，音高快速下降，核心是紧凑尖锐的咻嗖和粗糙空气撕裂，整个动作约零点三秒。单声道不预制左右声像。不要枪口声、爆炸、弹着、反弹、持续口哨、吹口哨、鸟鸣、飞机或激光音。",
    variants: ["偏尖锐而极短的一声咻。", "偏沙哑空气质感的一声嗖。", "略低沉且迅速下滑的一声掠过。", "轻微嘶鸣接极短破风尾音的一次掠过。"] },
];
const assets = groups.filter((group) => !only || group.cue === only).flatMap((group) =>
  Array.from({ length: group.count }, (_, index) => ({ ...group,
    file: `AudioSfx_${group.cue[0].toUpperCase()}${group.cue.slice(1)}_${String(index + 1).padStart(2, "0")}.mp3`,
    prompt: common + group.prompt + group.variants[index],
  })));

async function Generate(asset, rawFile) {
  const apiKey = process.env.VOLCENGINE_API_KEY;
  if (!apiKey) throw new Error("Missing VOLCENGINE_API_KEY environment variable");
  const response = await fetch("https://openspeech.bytedance.com/api/v3/tts/create", {
    method: "POST", signal: AbortSignal.timeout(360000),
    headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
    body: JSON.stringify({ model, text_prompt: asset.prompt,
      audio_config: { format: "mp3", sample_rate: 48000, pitch_rate: 0, speech_rate: 0, loudness_rate: 0 }, watermark: {} }),
  });
  // Never print API response bodies or headers: they may contain sensitive data.
  if (!response.ok) throw new Error(`SeedAudio HTTP ${response.status}`);
  const payload = await response.json();
  if (typeof payload.audio !== "string") throw new Error("SeedAudio returned no audio");
  const bytes = Buffer.from(payload.audio, "base64");
  if (bytes.length < 2048) throw new Error("SeedAudio returned an empty/invalid take");
  fs.writeFileSync(rawFile, bytes);
  fs.writeFileSync(rawFile + ".json", JSON.stringify({ model, prompt: asset.prompt, generatedAt: new Date().toISOString() }, null, 2));
  console.log(`generated ${asset.file}: ${bytes.length} bytes`);
}

function Decode(file, filter) {
  return execFileSync(ffmpeg, ["-v", "error", "-i", file, ...(filter ? ["-af", filter] : []),
    "-ac", "1", "-ar", "44100", "-f", "f32le", "-"], { maxBuffer: 32 * 1024 * 1024 });
}

function Measure(pcm) {
  let peak = 0;
  const frames = [];
  for (let start = 0; start < pcm.length; start += 882 * 4) {
    let sum = 0;
    const end = Math.min(pcm.length, start + 882 * 4);
    for (let i = start; i < end; i += 4) {
      const value = pcm.readFloatLE(i);
      peak = Math.max(peak, Math.abs(value)); sum += value * value;
    }
    frames.push(Math.sqrt(sum / ((end - start) / 4)));
  }
  const loudest = Math.max(...frames);
  const active = frames.filter((value) => value >= loudest * 0.1);
  const rms = Math.sqrt(active.reduce((sum, value) => sum + value * value, 0) / active.length);
  return { frames, peakDbfs: 20 * Math.log10(peak), activeRmsDbfs: 20 * Math.log10(rms), seconds: pcm.length / 4 / 44100 };
}

function Bake(asset) {
  const rawFile = path.join(rawDir, asset.file);
  const band = `highpass=f=${asset.hp},lowpass=f=${asset.lp}`;
  const raw = Measure(Decode(rawFile, band));
  if (!Number.isFinite(raw.activeRmsDbfs) || raw.activeRmsDbfs < -55) throw new Error(`${asset.file}: silent take`);
  // Find the first audible event relative to its own 20 ms envelope, keeping pre-roll.
  const threshold = Math.max(...raw.frames) * 0.1;
  const onset = raw.frames.findIndex((value) => value >= threshold);
  const start = Math.max(0, onset * 0.02 - 0.02);
  const duration = Math.min(asset.duration, raw.seconds - start);
  if (duration < 0.08) throw new Error(`${asset.file}: too short`);
  const filter = `${band},atrim=start=${start}:duration=${duration},asetpts=PTS-STARTPTS,afade=t=in:d=0.002,afade=t=out:st=${Math.max(0, duration - 0.045)}:d=0.045`;
  const initial = Measure(Decode(rawFile, filter));
  let gain = Math.min(-25 - initial.activeRmsDbfs, -3.1 - initial.peakDbfs);
  const staged = path.join(rawDir, "Staged", asset.file);
  fs.mkdirSync(path.dirname(staged), { recursive: true });
  let measured;
  for (let attempt = 0; attempt < 4; attempt++) {
    execFileSync(ffmpeg, ["-y", "-v", "error", "-i", rawFile, "-af", `${filter},volume=${gain}dB`,
      "-ac", "1", "-ar", "44100", "-b:a", "112k", staged]);
    measured = Measure(Decode(staged));
    if (Math.abs(measured.activeRmsDbfs + 25) <= 0.3 && measured.peakDbfs <= -3) break;
    gain += Math.min(-25 - measured.activeRmsDbfs, -3.1 - measured.peakDbfs);
  }
  if (Math.abs(measured.activeRmsDbfs + 25) > 0.5 || measured.peakDbfs > -3) {
    throw new Error(`${asset.file}: failed loudness/peak gate (${measured.activeRmsDbfs}, ${measured.peakDbfs})`);
  }
  const { frames, ...levels } = measured;
  console.log(`baked ${asset.file}: ${levels.seconds.toFixed(3)}s, active ${levels.activeRmsDbfs.toFixed(2)} dBFS, peak ${levels.peakDbfs.toFixed(2)} dBFS`);
  return { file: asset.file, cue: asset.cue, start, ...levels };
}

async function Main() {
  if (!assets.length) throw new Error(`Unknown cue: ${only}`);
  if (args.includes("--dry")) { console.log(JSON.stringify(assets, null, 2)); return; }
  fs.mkdirSync(rawDir, { recursive: true });
  for (const asset of assets) {
    const rawFile = path.join(rawDir, asset.file);
    if (args.includes("--force") || (args.includes("--generate") && !fs.existsSync(rawFile))) await Generate(asset, rawFile);
    if (!fs.existsSync(rawFile)) throw new Error(`Missing raw take: ${asset.file}; use --generate explicitly`);
  }
  if (args.includes("--generate-only")) return;
  const results = assets.map(Bake);
  // All selected takes must pass before any deployed file or manifest changes.
  const manifestPath = path.join(outputDir, "Data_SfxManifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.licenses.volcengine = SFX_LICENSES.volcengine;
  for (const group of groups.filter((group) => !only || group.cue === only)) {
    const entries = results.filter((result) => result.cue === group.cue);
    manifest.cues[group.cue] = { files: entries.map((entry) => entry.file),
      seconds: Number(Math.max(...entries.map((entry) => entry.seconds)).toFixed(3)),
      credit: `Volcengine SeedAudio 1.0 · ${group.cue} · 2026-09-09`, license: "volcengine" };
  }
  for (const result of results) fs.copyFileSync(path.join(rawDir, "Staged", result.file), path.join(outputDir, result.file));
  manifest.bakedAt = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  fs.writeFileSync(path.join(rawDir, `Data_Qc${only || "All"}.json`), JSON.stringify(results, null, 2) + "\n");
}
Main().catch((error) => { console.error(error.message); process.exitCode = 1; });
