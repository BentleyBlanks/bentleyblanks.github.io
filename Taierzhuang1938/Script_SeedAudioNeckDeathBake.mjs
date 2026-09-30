// 敌军脖子中弹 / 被刀砍死时喉咙里那一声窒息哽咽（cue `neckDeath`，Data_NeckDeath.mjs 管什么时候放）。
// 默认：只拿已选定的 take 重新切、归一、编码，不调接口（人工选定的 take 不能靠重掷复现）。
//   node Taierzhuang1938/Script_SeedAudioNeckDeathBake.mjs --generate   缺的候选 take 才调接口（密钥只从 VOLCENGINE_API_KEY 读）
//   node Taierzhuang1938/Script_SeedAudioNeckDeathBake.mjs --force      重新生成全部候选
//   node Taierzhuang1938/Script_SeedAudioNeckDeathBake.mjs --report     只量候选（时长 / 电平 / 频段占比 / 有声段结构），不落成品
// 候选与 QC 落 Audio/Sfx/_raw/SeedAudioNeckDeath（已忽略）；只有成品 mp3 与清单条目进仓库。
//
// 选 take 的判据（听不见，靠量）：整条是**一次**事件（一段有声段，中间没有超过 0.35 s 的空档）、
// 时长 1–3 s、能量主体在 100 Hz–2.5 kHz（人的喉咙，不是嘶嘶的气流也不是低频轰鸣）、
// 没有词（气声和浊音交替的咯咯声，包络有起伏而不是平直长音）。
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SFX_LICENSES } from "./Data_SfxSources.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(here, "Audio/Sfx");
const rawDir = path.join(outputDir, "_raw/SeedAudioNeckDeath");
const ffmpeg = process.env.FFMPEG || "ffmpeg";
const model = "seed-audio-1.0";
const args = process.argv.slice(2);
const SR = 44100;

// 提示词不提「割喉」「血」：说人体伤口时模型会往惨叫和血浆音效上塌（与断肢那一轮同一条经验）。
// 描述听感本身：被扼住的、带水声的、想喊喊不出来的喉音。
const common = "用于写实二战第一人称战争游戏的一条独立音效，单声道近距离干录，无音乐，无台词，无任何可听懂的词语，无旁白，无枪声爆炸，无脚步，无衣料摩擦，无回声混响，前后安静。只有一个成年男性、一次事件、不重复。";
const takes = [
  "一个成年男子喉咙被人一刀割开后拼命想喊却喊不出来的声音：湿润的、带着液体翻涌的「咯——咯咯」喉音，夹着漏气的嘶声和断续的窒息吸气，越来越弱，约两秒半，最后一口气泄掉。不是惨叫，不要词语。",
  "一个成年男子被人扼住喉咙时垂死的窒息声：喉咙里发出压抑的、水声很重的哽咽与呛咳，「呃……咯……咯」，想吸气吸不进去，声音又低又哑，逐渐衰弱，约两秒。不要惨叫，不要喊叫，不要词语。",
  "一个成年男子气管被打穿后的濒死喘息：每一口气都带着咕噜咕噜的水泡声，间隔着短促的、漏风的抽气和一两下干呛，声音细弱嘶哑，约三秒，越来越慢直到停住。不要惨叫，不要词语。",
  "拟音师模仿一个人被割了喉咙的临终声音：低沉的、被液体堵住的喉音「咕噜……咯」，几下痛苦的窒息抽吸，然后一声长长漏气的叹息。声音压抑克制，不夸张，不猎奇，约两秒半。不要惨叫，不要词语。",
  "一个成年男子脖子中弹后倒下时发出的声音：猛地吸进一口带水声的气，喉咙里咯咯作响，想说话却只有含混的气泡音，很快只剩微弱的漏气声，约两秒。不要惨叫，不要清晰的词语。",
  "一个成年男子被刺刀刺穿咽喉后的声音：一声短促的、被掐断的哽咽，紧接着喉咙里湿润的咯咯声和急促的抽气，越来越弱，约两秒。声音闷哑压抑，不要大声喊叫，不要词语。",
  "一个成年男子窒息时喉咙里发出的声音：低哑的、带黏液的「咯、咯、咯」，中间夹着艰难的吸气，像被什么堵住了气管，挣扎两三下后无力地停止，约两秒半。写实，克制，不要惨叫，不要词语。",
  "一个成年男子临死前被扼住咽喉的气声：先是一下急促而尖细的吸气，然后是湿哑的喉头颤音和几声含糊的呜咽，气息越来越微弱，最后一口悠长的漏气。约三秒。不要喊叫，不要词语。",
].map((prompt, i) => ({ file: `NeckDeath_take${String(i + 1).padStart(2, "0")}.mp3`, prompt: common + prompt }));

/**
 * 选定的 take（候选量完之后填）：[{ take, atS, durS }]，每条一个变体。
 * 切法：atS/durS 由 --report 的有声段量出来，尾部 0.12 s 淡出（不要硬切口），头上 8 ms 淡入防咔哒。
 */
// 2026-09-30 八条候选（一轮提示词）量完选 02 与 07：都是 93–97 % 能量在 100 Hz–2.5 kHz、>2.5 kHz 只有 3–6 %
//（喉音，不是气流嘶声），频谱图上是有共振峰的浊音而不是噪声团。02 是四记分开的喉头「咯」（0.28 / 0.68 / 1.34 / 2.08 s，
// 每记 0.1–0.4 s，中间有间隔——像想出声又被堵回去）；07 是两口较长的哽咽（0.22–1.04、1.24–2.36 s，各带一段吸气）。
// 两条一短促一绵长，运行时随机挑，连着两个人各自倒下时不会同一个调子。落选：01 峰值 −0.1 dBFS、有声段电平比其余高 7–17 dB
//（是喊叫不是哽咽）；03 / 05 / 08 是连续 2–3 s 不断的长声、>2.5 kHz 占 17–36 %（漏气嘶声居多）；04 / 06 电平很低、
// 04 低频占 55 %、06 有 17 % 在 100 Hz 以下（闷）。我听不见，只能按数选——听感上要不要换见 docs/Data_NeckDeath.md §5。
const NECK_DEATH_PICKS = [
  { take: "NeckDeath_take02.mp3", atS: 0.20, durS: 2.12 },
  { take: "NeckDeath_take07.mp3", atS: 0.16, durS: 2.26 },
];
const outputName = (index) => `AudioSfx_NeckDeath_${String(index + 1).padStart(2, "0")}.mp3`;

async function Generate(take, rawFile) {
  const apiKey = process.env.VOLCENGINE_API_KEY;
  if (!apiKey) throw new Error("Missing VOLCENGINE_API_KEY environment variable");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch("https://openspeech.bytedance.com/api/v3/tts/create", {
        method: "POST", signal: AbortSignal.timeout(360000),
        headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
        body: JSON.stringify({ model, text_prompt: take.prompt,
          audio_config: { format: "mp3", sample_rate: 48000, pitch_rate: 0, speech_rate: 0, loudness_rate: 0 }, watermark: {} }),
      });
      // 不打印响应体与头：可能带敏感信息。
      if (!response.ok) throw new Error(`SeedAudio HTTP ${response.status}`);
      const payload = await response.json();
      if (typeof payload.audio !== "string") throw new Error("SeedAudio returned no audio");
      const bytes = Buffer.from(payload.audio, "base64");
      if (bytes.length < 2048) throw new Error("SeedAudio returned an empty/invalid take");
      fs.writeFileSync(rawFile, bytes);
      fs.writeFileSync(rawFile + ".json", JSON.stringify({ model, prompt: take.prompt, generatedAt: new Date().toISOString() }, null, 2));
      console.log(`generated ${take.file}: ${bytes.length} bytes`);
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      console.warn(`${take.file}: ${error.message}, retry`);
    }
  }
}

function Decode(file, filter) {
  const raw = execFileSync(ffmpeg, ["-v", "error", "-i", file, ...(filter ? ["-af", filter] : []),
    "-ac", "1", "-ar", String(SR), "-f", "f32le", "-"], { maxBuffer: 64 * 1024 * 1024 });
  return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length));
}

/** 有声段 RMS（≥ 最响 20 ms 帧的 10 %）与峰值，另给每帧 RMS 供找有声段。 */
function Levels(pcm) {
  const hop = 882;
  let peak = 0;
  const frames = [];
  for (let s = 0; s < pcm.length; s += hop) {
    let sum = 0;
    const e = Math.min(pcm.length, s + hop);
    for (let i = s; i < e; i += 1) { peak = Math.max(peak, Math.abs(pcm[i])); sum += pcm[i] * pcm[i]; }
    frames.push(Math.sqrt(sum / Math.max(1, e - s)));
  }
  const loud = Math.max(...frames);
  const active = frames.filter((v) => v >= loud * 0.1);
  const rms = Math.sqrt(active.reduce((a, v) => a + v * v, 0) / Math.max(1, active.length));
  return { frames, hop, peakDbfs: 20 * Math.log10(peak), activeRmsDbfs: 20 * Math.log10(rms), seconds: pcm.length / SR };
}

/** 一段频段（Hz）过完带通后占全带宽能量的比例。 */
function BandShare(file, lo, hi) {
  const full = Decode(file), band = Decode(file, `highpass=f=${lo},lowpass=f=${hi}`);
  const e = (p) => p.reduce((a, v) => a + v * v, 0);
  return e(band) / Math.max(1e-12, e(full));
}

/** 有声段：连续 ≥ −40 dB（相对最响帧）的帧，间隔小于 0.12 s 的合并。 */
function Segments(levels) {
  const loud = Math.max(...levels.frames), gate = loud * 0.01;
  const fs_ = levels.hop / SR, out = [];
  let start = -1, gap = 0;
  levels.frames.forEach((v, i) => {
    if (v >= gate) { if (start < 0) start = i; gap = 0; }
    else if (start >= 0 && ++gap * fs_ > 0.12) { out.push([start * fs_, (i - gap + 1) * fs_]); start = -1; gap = 0; }
  });
  if (start >= 0) out.push([start * fs_, levels.frames.length * fs_]);
  return out;
}

function Report(take) {
  const rawFile = path.join(rawDir, take.file);
  if (!fs.existsSync(rawFile)) return console.log(`${take.file}: missing`);
  const levels = Levels(Decode(rawFile));
  const segs = Segments(levels);
  const shares = [[0, 100], [100, 500], [500, 2500], [2500, 22000]].map(([a, b]) =>
    `${a}-${b}:${(BandShare(rawFile, Math.max(a, 20), b) * 100).toFixed(0)}%`);
  console.log(`${take.file}  ${levels.seconds.toFixed(2)} s  RMS ${levels.activeRmsDbfs.toFixed(1)}  peak ${levels.peakDbfs.toFixed(1)}  `
    + `segs ${segs.map(([a, b]) => `${a.toFixed(2)}-${b.toFixed(2)}`).join(" ")}  ${shares.join(" ")}`);
}

function Bake() {
  if (!NECK_DEATH_PICKS.length) throw new Error("No take picked yet (NECK_DEATH_PICKS)");
  const manifestPath = path.join(outputDir, "Data_SfxManifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const files = [], credits = [];
  let seconds = 0;
  NECK_DEATH_PICKS.forEach((pick, index) => {
    const rawFile = path.join(rawDir, pick.take);
    if (!fs.existsSync(rawFile)) throw new Error(`Missing raw take ${pick.take}; run --generate`);
    const name = outputName(index);
    const filter = `highpass=f=${pick.hp ?? 70},atrim=start=${pick.atS}:duration=${pick.durS},asetpts=PTS-STARTPTS,`
      + `afade=t=in:d=0.008,afade=t=out:st=${(pick.durS - 0.12).toFixed(3)}:d=0.12`;
    const staged = path.join(rawDir, "Staged", name);
    fs.mkdirSync(path.dirname(staged), { recursive: true });
    let gain = 0, measured = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      execFileSync(ffmpeg, ["-y", "-v", "error", "-i", rawFile, "-af", `${filter},volume=${gain.toFixed(2)}dB`,
        "-ac", "1", "-ar", String(SR), "-b:a", "96k", staged]);
      measured = Levels(Decode(staged));
      if (Math.abs(measured.activeRmsDbfs + 25) <= 0.3 && measured.peakDbfs <= -1.5) break;
      gain += Math.min(-25 - measured.activeRmsDbfs, -1.6 - measured.peakDbfs);
    }
    if (measured.peakDbfs > -1 || Math.abs(measured.activeRmsDbfs + 25) > 1.0) {
      throw new Error(`${name}: loudness/peak gate failed (${measured.activeRmsDbfs.toFixed(2)}, ${measured.peakDbfs.toFixed(2)})`);
    }
    console.log(`baked ${name}: ${measured.seconds.toFixed(3)} s, active ${measured.activeRmsDbfs.toFixed(2)} dBFS, peak ${measured.peakDbfs.toFixed(2)} dBFS`);
    fs.copyFileSync(staged, path.join(outputDir, name));
    files.push(name);
    credits.push(pick.take);
    seconds = Math.max(seconds, Number(measured.seconds.toFixed(3)));
  });
  manifest.licenses.volcengine = SFX_LICENSES.volcengine;
  manifest.cues.neckDeath = { files, seconds,
    credit: `Volcengine SeedAudio 1.0 · 喉咙被割开/打穿时的窒息哽咽（${credits.join(", ")}） · 2026-09-30`, license: "volcengine" };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}

async function Main() {
  fs.mkdirSync(rawDir, { recursive: true });
  for (const take of takes) {
    const rawFile = path.join(rawDir, take.file);
    if (args.includes("--force") || (args.includes("--generate") && !fs.existsSync(rawFile))) await Generate(take, rawFile);
  }
  if (args.includes("--report")) return takes.forEach(Report);
  if (args.includes("--generate") || args.includes("--force")) return;
  Bake();
}
Main().catch((error) => { console.error(error.message); process.exitCode = 1; });
