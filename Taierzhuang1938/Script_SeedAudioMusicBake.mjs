// 三段关卡音乐：火山引擎 SeedAudio 1.0 → 可部署的循环音乐包。
//
//   node Taierzhuang1938/Script_SeedAudioMusicBake.mjs --dry
//   node Taierzhuang1938/Script_SeedAudioMusicBake.mjs --force
//
// 密钥仅从 VOLCENGINE_API_KEY 读取；原始 take 始终留在系统临时目录。

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { MUSIC_SOURCES } from "./Data_MusicSources.mjs";
import { SFX_LICENSES } from "./Data_SfxSources.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const apiUrl = "https://openspeech.bytedance.com/api/v3/tts/create";
const model = "seed-audio-1.0";
const timeoutMs = 360_000;
const ffmpeg = process.env.FFMPEG || "ffmpeg";
const rawDir = path.join(os.tmpdir(), "Taierzhuang1938SeedAudioMusic");
const musicDir = path.join(here, "Audio", "Music");
const manifestFile = path.join(musicDir, "Data_MusicManifest.json");
const force = process.argv.includes("--force");
const dry = process.argv.includes("--dry");

const byId = new Map(MUSIC_SOURCES.map((source) => [source.id, source]));
const assets = [
  { id: "Night", file: "AudioMusic_Night.mp3", cue: "tension", volume: 0.60 },
  { id: "Aftermath", file: "AudioMusic_Aftermath.mp3", cue: "aftermath", volume: 0.64 },
  { id: "WallPressure", file: "AudioMusic_WallPressure.mp3", cue: "wallPressure", volume: 0.48 },
].map((entry) => {
  const source = byId.get(entry.id);
  if (!source?.seedAudio) throw new Error(`缺少 ${entry.id} 的 SeedAudio 提示词`);
  return {
    ...entry,
    source,
    output: path.join(musicDir, entry.file),
    raw: path.join(rawDir, `AudioRaw_${entry.id}.mp3`),
  };
});

function Duration(file) {
  const ffprobe = ffmpeg.replace(/ffmpeg(\.exe)?$/i, (value) => value.replace("ffmpeg", "ffprobe"));
  const result = spawnSync(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" });
  return Number.parseFloat(result.stdout) || 0;
}

async function Generate(asset) {
  const apiKey = process.env.VOLCENGINE_API_KEY;
  if (!apiKey) throw new Error("缺少 VOLCENGINE_API_KEY；密钥只能通过环境变量提供，禁止写进仓库。");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
      body: JSON.stringify({
        model,
        text_prompt: asset.source.seedAudio.prompt,
        audio_config: { format: "mp3", sample_rate: 48000, pitch_rate: 0, speech_rate: 0, loudness_rate: 0 },
        watermark: {},
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  const body = await response.text();
  if (!response.ok) throw new Error(`火山引擎 HTTP ${response.status}：${body.slice(0, 240)}`);
  const payload = JSON.parse(body);
  if (typeof payload.audio !== "string") throw new Error(`火山引擎没有返回 audio：${String(payload.message || payload.error || "未知错误").slice(0, 240)}`);
  const audio = Buffer.from(payload.audio, "base64");
  if (audio.length < 2048) throw new Error(`火山引擎返回的音频过小（${audio.length} bytes）`);
  fs.mkdirSync(rawDir, { recursive: true });
  fs.writeFileSync(asset.raw, audio);
}

function Encode(asset) {
  fs.mkdirSync(path.dirname(asset.output), { recursive: true });
  const tmp = asset.output + ".tmp.mp3";
  const duration = asset.source.durS;
  const fade = asset.source.fadeS;
  const filter = [
    "highpass=f=35",
    "lowpass=f=12000",
    `volume=${asset.volume}`,
    `atrim=duration=${duration}`,
    `afade=t=in:st=0:d=${fade}`,
    `afade=t=out:st=${(duration - fade).toFixed(3)}:d=${fade}`,
  ].join(",");
  execFileSync(ffmpeg, ["-y", "-v", "error", "-stream_loop", "-1", "-i", asset.raw, "-af", filter, "-ac", "2", "-ar", "44100", "-b:a", "72k", tmp]);
  fs.renameSync(tmp, asset.output);
  const result = { seconds: Number(Duration(asset.output).toFixed(3)), bytes: fs.statSync(asset.output).size };
  if (Math.abs(result.seconds - duration) > 0.2 || result.bytes < 2048) throw new Error(`${asset.id} 转码结果无效`);
  return result;
}

function WriteManifest(results) {
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  manifest.generated = "Script_MusicBake.mjs + Script_SeedAudioMusicBake.mjs";
  manifest.license = {
    name: "逐曲授权（见 cues[].source）",
    terms: "SeedAudio 生成曲受火山引擎服务条款约束；其余曲目按来源页授权",
    via: "Data_MusicSources.mjs",
  };
  for (const asset of assets) {
    manifest.cues[asset.cue] = {
      file: asset.file,
      seconds: results[asset.id].seconds,
      source: {
        title: asset.source.seedAudio.credit,
        author: SFX_LICENSES.volcengine.name,
        license: SFX_LICENSES.volcengine.terms,
        page: SFX_LICENSES.volcengine.via,
      },
    };
  }
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 1) + "\n");
}

async function Main() {
  if (dry) {
    for (const asset of assets) console.log(`${asset.id}: ${asset.output}`);
    return;
  }
  const results = {};
  for (const asset of assets) {
    if (force || !fs.existsSync(asset.raw)) await Generate(asset);
    results[asset.id] = Encode(asset);
    console.log(`${asset.id}: ${results[asset.id].seconds}s ${(results[asset.id].bytes / 1024).toFixed(1)} KB`);
  }
  WriteManifest(results);
}

Main().catch((error) => { console.error(error.message); process.exitCode = 1; });
