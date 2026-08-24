// 序章列车专用音：火山引擎 SeedAudio 1.0 → 可部署的车轮床与汽笛。
//
//   node Taierzhuang1938/Script_SeedAudioTrainBake.mjs --dry
//   node Taierzhuang1938/Script_SeedAudioTrainBake.mjs --force
//
// 密钥只读 VOLCENGINE_API_KEY，原始 take 留在系统临时目录，不写入仓库。

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SFX_LICENSES } from "./Data_SfxSources.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const apiUrl = "https://openspeech.bytedance.com/api/v3/tts/create";
const model = "seed-audio-1.0";
const timeoutMs = 360_000;
const ffmpeg = process.env.FFMPEG || "ffmpeg";
const rawDir = path.join(os.tmpdir(), "Taierzhuang1938SeedAudioTrain");
const ambDir = path.join(here, "Audio", "Amb");
const sfxDir = path.join(here, "Audio", "Sfx");
const ambManifest = path.join(ambDir, "Data_AmbManifest.json");
const sfxManifest = path.join(sfxDir, "Data_SfxManifest.json");
const force = process.argv.includes("--force");
const dry = process.argv.includes("--dry");

const assets = [
  {
    id: "trainInterior",
    output: path.join(ambDir, "AudioAmb_TrainInterior.mp3"),
    raw: path.join(rawDir, "AudioRaw_TrainInterior.mp3"),
    prompt: "生成一条干净、没有人声和音乐的蒸汽军用列车车厢内环境音。1938年中国北方，木质闷罐车正在匀速行驶：近处有真实铁轮与钢轨的规律咔嗒、沉重转向架低频振动、木车厢轻微共振和极淡的风从窗缝掠过。声音贴近乘客座位，克制、连续、可循环；不要现代电气列车，不要汽笛，不要刹车尖叫，不要广播、人声、脚步、枪声、音乐或明显混响。",
    encode: ["-stream_loop", "-1", "-i"],
    filter: "highpass=f=35,lowpass=f=9000,volume=0.78,atrim=duration=30,afade=t=in:st=0:d=0.12,afade=t=out:st=29.88:d=0.12",
    args: ["-ac", "2", "-ar", "44100", "-b:a", "128k"],
    seconds: 30,
  },
  {
    id: "trainWhistle",
    output: path.join(sfxDir, "AudioSfx_TrainWhistle_01.mp3"),
    raw: path.join(rawDir, "AudioRaw_TrainWhistle.mp3"),
    prompt: "生成一声干净、孤立的1930年代蒸汽机车汽笛。中国北方乡间小站，低沉有重量的双音蒸汽汽笛，从远约三十米的站台外响起，约三秒，起音有少量蒸汽喷发，长音自然微颤后平顺收尾。不要现代电笛、不要船笛、不要口哨、人声、音乐、脚步、铁轨声或明显的山谷回声。",
    encode: ["-i"],
    filter: "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.10,areverse,atrim=duration=4.8,highpass=f=55,lowpass=f=6500,volume=0.86,afade=t=in:st=0:d=0.012,afade=t=out:st=4.55:d=0.20",
    args: ["-ac", "1", "-ar", "44100", "-b:a", "72k"],
  },
];

function duration(file) {
  const result = spawnSync(ffmpeg.replace(/ffmpeg(\.exe)?$/i, (value) => value.replace("ffmpeg", "ffprobe")), ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" });
  return Number.parseFloat(result.stdout) || 0;
}

async function generate(asset) {
  const apiKey = process.env.VOLCENGINE_API_KEY;
  if (!apiKey) throw new Error("缺少 VOLCENGINE_API_KEY；密钥只能通过环境变量提供，禁止写进仓库。");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
      body: JSON.stringify({ model, text_prompt: asset.prompt, audio_config: { format: "mp3", sample_rate: 48000, pitch_rate: 0, speech_rate: 0, loudness_rate: 0 }, watermark: {} }),
      signal: controller.signal,
    });
  } finally { clearTimeout(timer); }
  const body = await response.text();
  if (!response.ok) throw new Error(`火山引擎 HTTP ${response.status}：${body.slice(0, 240)}`);
  const payload = JSON.parse(body);
  if (typeof payload.audio !== "string") throw new Error(`火山引擎没有返回 audio：${String(payload.message || payload.error || "未知错误").slice(0, 240)}`);
  const audio = Buffer.from(payload.audio, "base64");
  if (audio.length < 2048) throw new Error(`火山引擎返回的音频过小（${audio.length} bytes）`);
  fs.mkdirSync(rawDir, { recursive: true });
  fs.writeFileSync(asset.raw, audio);
}

function encode(asset) {
  fs.mkdirSync(path.dirname(asset.output), { recursive: true });
  const tmp = asset.output + ".tmp.mp3";
  execFileSync(ffmpeg, ["-y", "-v", "error", ...asset.encode, asset.raw, "-af", asset.filter, ...asset.args, tmp]);
  fs.renameSync(tmp, asset.output);
  const result = { seconds: Number(duration(asset.output).toFixed(3)), bytes: fs.statSync(asset.output).size };
  if (!result.seconds || result.bytes < 2048) throw new Error(`${asset.id} 转码结果无效`);
  return result;
}

function writeManifests(results) {
  const amb = JSON.parse(fs.readFileSync(ambManifest, "utf8"));
  const sfx = JSON.parse(fs.readFileSync(sfxManifest, "utf8"));
  amb.generated = "Script_AmbBake.mjs + Script_SeedAudioTrainBake.mjs";
  amb.licenses.volcengine = SFX_LICENSES.volcengine;
  amb.beds.trainInterior = { file: "AudioAmb_TrainInterior.mp3", seconds: results.trainInterior.seconds, channels: 2 };
  amb.credits.trainInterior = { credit: "Volcengine SeedAudio 1.0 · 序章蒸汽列车车厢轮轨环境", license: "volcengine", source: "SeedAudio API generated" };
  sfx.licenses.volcengine = SFX_LICENSES.volcengine;
  sfx.cues.trainWhistle = { files: ["AudioSfx_TrainWhistle_01.mp3"], seconds: results.trainWhistle.seconds, credit: "Volcengine SeedAudio 1.0 · 序章蒸汽机车入站汽笛", license: "volcengine" };
  sfx.bakedAt = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(ambManifest, JSON.stringify(amb, null, 2) + "\n");
  fs.writeFileSync(sfxManifest, JSON.stringify(sfx, null, 2) + "\n");
}

async function main() {
  if (dry) { for (const asset of assets) console.log(`${asset.id}: ${asset.output}`); return; }
  const results = {};
  for (const asset of assets) {
    if (force || !fs.existsSync(asset.raw)) await generate(asset);
    results[asset.id] = encode(asset);
    console.log(`${asset.id}: ${results[asset.id].seconds}s ${(results[asset.id].bytes / 1024).toFixed(1)} KB`);
  }
  writeManifests(results);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
