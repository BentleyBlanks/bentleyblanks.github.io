// 航空炸弹下落啸声（空袭 01–06，Data_FirstLevelAirRaid.audio.whistle）。
// 默认：只拿已选定的 take 重新切、归一、编码，不调接口（人工选定的 take 不能靠重掷复现）。
//   node Taierzhuang1938/Script_SeedAudioBombWhistleBake.mjs --generate   缺的候选 take 才调接口（密钥只从 VOLCENGINE_API_KEY 读）
//   node Taierzhuang1938/Script_SeedAudioBombWhistleBake.mjs --force      重新生成全部候选
//   node Taierzhuang1938/Script_SeedAudioBombWhistleBake.mjs --report     只量候选（音高轨迹 / 时长 / 电平），不落成品
// 候选与 QC 落 Audio/Sfx/_raw/SeedAudioBombWhistle（已忽略）；只有成品 mp3 与清单条目进仓库。
//
// 选 take 的判据（听不见，靠量）：主音高要是一条**单调往下滑**的线（电影里那一声「呜——」），
// 起点 1.2–2.6 kHz、终点比起点低一个八度以上；电平一路涨、最响处在后三分之一；只有一个事件、结尾没有爆炸。
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SFX_LICENSES } from "./Data_SfxSources.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(here, "Audio/Sfx");
const rawDir = path.join(outputDir, "_raw/SeedAudioBombWhistle");
const ffmpeg = process.env.FFMPEG || "ffmpeg";
const model = "seed-audio-1.0";
const args = process.argv.slice(2);
const SR = 44100;

const common = "用于写实二战第一人称战争游戏的一条独立音效，单声道，无音乐，无人声，无旁白，无其他战场背景声，无电子合成或科幻质感。只有一次事件，不重复。";
const takes = [
  "老战争电影里航空炸弹从高空落下时的那一声长长的下滑尖啸：一条像口哨一样清楚的音调，从很高处平滑地一路往下滑到低沉处，同时由远而近、由弱渐强，约三秒半，最响时戛然而止。不要爆炸，不要飞机引擎，不要枪声。",
  "拟音师对着麦克风用滑哨吹出一条缓慢、平滑、不间断的下滑长音，模仿炸弹从天上落下来：开头又高又细又轻，越往下越低沉越响，约三秒半后在最响处突然停住。音色是带一点气声的口哨，不是警报，不是笛子旋律。不要爆炸，不要其他声音。",
  "一颗炸弹从头顶高空呼啸落下：尖细的哨音带着空气撕裂的嘶声，音调持续平滑下降，音量越来越大，像越来越近，约三秒，在最响处戛然而止，紧接着是一片寂静。只有下落的啸声，不要落地爆炸，不要引擎，不要音乐。",
  "高速气流吹过一根细长金属管口发出的尖锐哨鸣，音高从两千赫兹左右平稳地一路下滑到五六百赫兹，整个过程约三秒半，由轻到重越来越响，末尾在最响处干脆地切断。像二战纪录片里俯冲轰炸时炸弹落下的啸叫。不要爆炸，不要飞机，不要人声。",
  "二战电影音效：炸弹下落的呼啸声。单一一条纯净的高音哨声缓慢往下滑落，中间没有断开，没有颤音，由远及近、渐强，约三秒，最后在最高音量时突然结束。之后没有爆炸声。",
  "一枚航空炸弹带着尾翼哨子从几百米高空落下：先是远处细细的高音呼哨，音调稳定地一路往下降，越降越粗越响，夹着风声，约三秒半，然后在最响的一瞬间干脆停止。只要下落的呼啸，不要撞击、爆炸、引擎、音乐。",
  "二战电影音效：炸弹下落的呼啸声。一条纯净的哨音，从很高很细的尖音开始，平滑不间断地一路往下滑，滑过一个多八度，一直滑到低沉粗重的呜声；音量从很轻一路涨到最响，约三秒半，在最低、最响的那一刻突然停止。之后没有爆炸，没有别的声音。",
  "拟音师用滑哨模仿炸弹落下：一口气吹出一条又长又慢的下滑音，从尖细的高音一直滑到低沉的低音，降了一个多八度，越往下越响、越粗，约三秒半，在最响处干脆停住。只有这一条下滑哨声，没有旋律，没有颤音，不要爆炸。",
  "老电影里炸弹从高空落下的经典啸声：「咻——呜——」，音调从高处持续下滑到低处，滑得很深，结尾明显比开头低沉得多，音量越来越大，好像正朝听者头顶落下，约三秒，最响时戛然而止。不要落地爆炸，不要引擎，不要音乐。",
  "炸弹尾翼上的哨子在下落时发出的长啸：开头远而尖细，音调一路平稳往下降，降得很深，到后面变成低沉响亮的呜呜声，越来越近越来越响，约三秒半后在最响处突然切断。带一点风声。不要撞击、爆炸、飞机、人声。",
].map((prompt, i) => ({ file: `BombWhistle_take${String(i + 1).padStart(2, "0")}.mp3`, prompt: common + prompt }));

/**
 * 选定的那一条（候选量完之后定）：take 文件、从哪儿切、切多长。
 * 切法：保留下滑的后段，结尾在最响处硬停（6 ms 淡出只防咔哒）——啸声的终点就是落地那一刻，
 * 后面是爆炸本体；运行时按 durS 往回推起播时刻（Data_FirstLevelAirRaid.audio.whistle.leadS）。
 */
// 2026-09-30 十条候选（两轮提示词）量完选 take09：主音高 2.0 kHz → 1.24 kHz 一条连续下滑（0.7 个八度；十条里
// 没有一条滑满一个八度，SeedAudio 在这件事上就到这儿），有声段电平 −27 → −11 dB 一路涨，后半段宽带风噪越来越重
//（「越来越近」的来源），2.90 s 处在最响时硬停，后面没有爆炸。落选的：02 / 04 是平直长音（没有下滑），
// 03 / 08 是噪声团里断续的音调，01 / 06 / 07 结尾自己带了一声爆炸，05 起点 3.5 kHz 太尖，10 滑得最浅。
// 切 0.11–2.89 s：头上 0.6 s 淡入（原片 0.115 s 处是 −26 dB 的硬起音，淡入让它从远处浮出来）；
// 高通 300 Hz 滤掉全片垫着的一条 230 Hz 底噪线。
const BOMB_WHISTLE_PICK = { take: "BombWhistle_take09.mp3", atS: 0.11, durS: 2.78, hp: 300, fadeInS: 0.6 };
const outputFile = "AudioSfx_BombWhistle_01.mp3";

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

/** 有声段 RMS（≥ 最响 20 ms 帧的 10 %）与峰值。 */
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
  return { frames, peakDbfs: 20 * Math.log10(peak), activeRmsDbfs: 20 * Math.log10(rms), seconds: pcm.length / SR };
}

function Bake(pick) {
  const rawFile = path.join(rawDir, pick.take);
  if (!fs.existsSync(rawFile)) throw new Error(`Missing raw take ${pick.take}; run --generate`);
  const fadeIn = pick.fadeInS;
  const filter = `highpass=f=${pick.hp ?? 250},atrim=start=${pick.atS}:duration=${pick.durS},asetpts=PTS-STARTPTS,`
    + `afade=t=in:d=${fadeIn},afade=t=out:st=${(pick.durS - 0.006).toFixed(3)}:d=0.006`;
  const staged = path.join(rawDir, "Staged", outputFile);
  fs.mkdirSync(path.dirname(staged), { recursive: true });
  let gain = 0, measured = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    execFileSync(ffmpeg, ["-y", "-v", "error", "-i", rawFile, "-af", `${filter},volume=${gain.toFixed(2)}dB`,
      "-ac", "1", "-ar", String(SR), "-b:a", "112k", staged]);
    measured = Levels(Decode(staged));
    if (Math.abs(measured.activeRmsDbfs + 25) <= 0.3 && measured.peakDbfs <= -3) break;
    gain += Math.min(-25 - measured.activeRmsDbfs, -3.1 - measured.peakDbfs);
  }
  if (measured.peakDbfs > -3 || measured.activeRmsDbfs > -24.5) {
    throw new Error(`${outputFile}: loudness/peak gate failed (${measured.activeRmsDbfs.toFixed(2)}, ${measured.peakDbfs.toFixed(2)})`);
  }
  const { frames, ...levels } = measured;
  console.log(`baked ${outputFile}: ${levels.seconds.toFixed(3)} s, active ${levels.activeRmsDbfs.toFixed(2)} dBFS, peak ${levels.peakDbfs.toFixed(2)} dBFS`);
  const manifestPath = path.join(outputDir, "Data_SfxManifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.licenses.volcengine = SFX_LICENSES.volcengine;
  manifest.cues.bombWhistle = { files: [outputFile], seconds: Number(levels.seconds.toFixed(3)),
    credit: `Volcengine SeedAudio 1.0 · 航空炸弹下落啸声（${pick.take}） · 2026-09-30`, license: "volcengine" };
  fs.copyFileSync(staged, path.join(outputDir, outputFile));
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  fs.writeFileSync(path.join(rawDir, "Data_Qc.json"), JSON.stringify({ pick, ...levels }, null, 2) + "\n");
}

async function Main() {
  fs.mkdirSync(rawDir, { recursive: true });
  for (const take of takes) {
    const rawFile = path.join(rawDir, take.file);
    if (args.includes("--force") || (args.includes("--generate") && !fs.existsSync(rawFile))) await Generate(take, rawFile);
  }
  if (args.includes("--generate") || args.includes("--force") || args.includes("--report")) return;
  if (!BOMB_WHISTLE_PICK) throw new Error("No take picked yet (BOMB_WHISTLE_PICK)");
  Bake(BOMB_WHISTLE_PICK);
}
Main().catch((error) => { console.error(error.message); process.exitCode = 1; });
