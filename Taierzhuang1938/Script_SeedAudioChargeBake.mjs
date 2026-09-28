// 02 反冲锋的「杀喊声四起」（2026-09-27 开场改稿，docs/Data_OpeningPinnedRescue20260927.md）：一整片四川口音的
// 喊杀声铺底，罗班长、何有田、刘文才本人与公用的四川话冲锋口令（Data_Voice rally_*）从各人位置叠在上面。
//
//   node Taierzhuang1938/Script_SeedAudioChargeBake.mjs              # 用缓存的原始录音重切（不调接口）
//   node Taierzhuang1938/Script_SeedAudioChargeBake.mjs --generate   # 缺的 take 才生成（VOLCENGINE_API_KEY）
//   node Taierzhuang1938/Script_SeedAudioChargeBake.mjs --dry        # 只打印计划
//
// 原始录音留在 Audio/Sfx/_raw/SeedAudioCharge20260927/（gitignore）；成品 Audio/Sfx/AudioSfx_SeedAudioChargeCrowd_01.mp3，
// 由 Data_SfxSources 的 ChargeCrowdSeedAudio 组在全量 SfxBake 时登记进清单。选定的 take 记在 PICK（人不在场时按
// 转写与频谱选：faster-whisper 转成「杀 杀 杀」、整段是连续的一片人声、没有音乐或枪炮）。
// 密钥只从环境变量读，不打印、不落盘。
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, "Audio", "Sfx");
const rawDir = path.join(outDir, "_raw", "SeedAudioCharge20260927");
const ffmpeg = process.env.FFMPEG || "ffmpeg";
const args = process.argv.slice(2), Has = (k) => args.includes(`--${k}`);
export const CHARGE_CROWD_PROMPTS = [
  "战场录音：二三十个四川籍士兵在战壕里同时拼命呐喊冲锋，齐声嘶吼「杀——！杀——！」，粗野嘶哑的成年男声，此起彼伏、层层叠叠的一大片喊杀声，中间夹着有人用四川话吼「砍死这些狗日的！」「弟兄伙冲啊！」。声音突然爆发、越喊越响。只有人的呐喊，没有音乐，没有枪声爆炸。",
  "一大群中国士兵举着大刀冲出战壕时的集体呐喊，几十个男人同时用四川话怒吼「杀——！」，声音嘶哑、拼命、此起彼伏，像潮水一样涌起来，远近都有人在喊。只有呐喊人声，没有音乐和枪炮。",
  "战壕里突然爆发的一片喊杀声：很多四川口音的男人同时嘶吼「杀啊——！」「冲——！」，有的近有的远，声音互相盖过，带着喘息和怒骂，整体持续约三秒，越来越响。纯人声呐喊，不要音乐。",
];
// Take 2（5.6 s，转写「杀 杀 杀」）。take 0 是 7 s 一口气的「杀」再接几句骂；take 1 转成一串「啊」。
export const PICK = 2;
const OUTPUT = "AudioSfx_SeedAudioChargeCrowd_01.mp3";

async function Generate(take, file) {
  const key = process.env.VOLCENGINE_API_KEY;
  if (!key) throw new Error("Missing VOLCENGINE_API_KEY");
  const res = await fetch("https://openspeech.bytedance.com/api/v3/tts/create", {
    method: "POST", signal: AbortSignal.timeout(360000),
    headers: { "Content-Type": "application/json", "X-Api-Key": key },
    body: JSON.stringify({ model: "seed-audio-1.0", text_prompt: CHARGE_CROWD_PROMPTS[take],
      audio_config: { format: "mp3", sample_rate: 48000, pitch_rate: 0, speech_rate: 0, loudness_rate: 0 }, watermark: {} }),
  });
  const json = await res.json().catch(() => null);
  const audio = json?.payload?.audio || json?.data?.audio;
  if (!audio) throw new Error(`SeedAudio take ${take}: HTTP ${res.status}, no audio`);
  fs.writeFileSync(file, Buffer.from(audio, "base64"));
}

fs.mkdirSync(rawDir, { recursive: true });
const raw = (take) => path.join(rawDir, `ChargeCrowd_take${take}.mp3`);
if (Has("dry")) { console.log(JSON.stringify({ pick: PICK, raw: raw(PICK), out: path.join(outDir, OUTPUT) }, null, 2)); process.exit(0); }
if (Has("generate")) for (let take = 0; take < CHARGE_CROWD_PROMPTS.length; take++) if (!fs.existsSync(raw(take))) await Generate(take, raw(take));
if (!fs.existsSync(raw(PICK))) throw new Error(`missing ${raw(PICK)} (run with --generate)`);
// 去掉 120 Hz 以下的轰声和 9 kHz 以上的毛刺，头 20 ms 淡入、尾 0.6 s 淡出，单声道，峰值归一到 −3 dBFS（先量峰值再精确归一，
// 不做「限幅后再推增益」）。
const seconds = Number(execFileSync(process.env.FFPROBE || "ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", raw(PICK)], { encoding: "utf8" }).trim());
const detect = spawnSync(ffmpeg, ["-hide_banner", "-nostats", "-i", raw(PICK), "-af", "highpass=f=120,lowpass=f=9000,volumedetect", "-f", "null", "-"], { encoding: "utf8" }).stderr || "";
const peak = Number(/max_volume:\s*(-?[\d.]+) dB/.exec(detect)?.[1]);
if (!Number.isFinite(peak)) throw new Error("volumedetect failed");
const gain = -3 - peak;
execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-i", raw(PICK), "-af",
  `highpass=f=120,lowpass=f=9000,afade=t=in:st=0:d=0.02,afade=t=out:st=${Math.max(0, seconds - 0.6).toFixed(3)}:d=0.6,volume=${gain.toFixed(2)}dB`,
  "-ac", "1", "-ar", "44100", "-b:a", "72k", path.join(outDir, OUTPUT)]);
console.log(`${OUTPUT}: take ${PICK}, ${seconds.toFixed(2)} s, peak ${peak} dB -> gain ${gain.toFixed(2)} dB`);
