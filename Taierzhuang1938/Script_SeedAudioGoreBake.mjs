// 断肢两音：火山引擎 SeedAudio 1.0 的 take → 可部署的「卸掉一段」与「肢块落地」。
//
//   node Taierzhuang1938/Script_SeedAudioGoreBake.mjs          # 用已有 take 重烘
//   node Taierzhuang1938/Script_SeedAudioGoreBake.mjs --dry    # 只看要写哪些文件
//   node Taierzhuang1938/Script_SeedAudioGoreBake.mjs --force  # 重新调接口（会换掉已选定的音！）
//
// 密钥只读 VOLCENGINE_API_KEY。原始 take 落在 Audio/Sfx/_raw/（.gitignore 挡着，不进仓库），
// 另有一份归档在 OneDrive\Sync\饮河\FPS\音频提取\断肢音效_20260911\。
//
// ## 与 Script_SeedAudioMeleeBake 同一条路子
// 这几条同样是**挑出来的 take**，不是从一段长素材里切的，所以：默认不调接口、
// 只拿 _raw 里选定的 take 重新转码；take 缺失且成品已经在仓库里时**拒绝覆盖**
//（一次手滑就能把选好的音洗掉，而重掷不可复现）；`--force` 才重新生成。
//
// ## 这四条是怎么挑出来的（12 条候选，量出来的）
// 听不见的时候判据只有数（见 memory: audio-level-measure-peak-not-rms）。每条量
// 「包络峰两边退到 6% 的那一段」的时长、真峰值、五段能量占比，以及
// `aud dB`（100 Hz—8 kHz 的 RMS ÷ 全带宽 RMS，低于 −6 就是能量全在听不见的地方）。
//
//   goreSeverA ← severChop3   0.48 s  <40 23% / 40—120 36% / 120—400 11% / 400—2k 18% / >2k 13%
//     「重斧劈进带骨的猪腿」那一路。**两层俱全**：低频是肉的分量，18+13% 的中高频
//     就是骨断那一下。同路的 severChop1 是 40—120 占 55%、中高频只剩 12% ——
//     那是一记闷雷不是断肢，弃。
//   goreSeverB ← severRip2    0.34 s  <40 10% / 40—120 22% / 120—400 9% / 400—2k 19% / >2k 39%
//     「撕开 + 折断」那一路里唯一**又有身子又有脆响**的一条。severRip3 高频占 92%
//    （撕纸，没有肉），severRip1 前 0.3 s 是 61% 的次低频轰鸣、真正的两下脆响在
//     1.01 s 之后 —— 都不是一次干净的动作，弃。
//   goreLimbLandA ← landWet1  0.29 s  40—120 33% / 120—400 23% / 400—2k 25%
//     湿、有分量、不弹跳。landWet2 的能量 27% 在 40 Hz 以下、aud −4.3，
//     高通完就几乎不剩什么，弃。
//   goreLimbLandB ← landBone1 0.28 s  120—400 47% / 400—2k 34% / >2k 5%  aud −0.4
//     带一点骨头磕地的钝响，比 A 亮 —— 两条摆在一起才不像同一块肉摔两回。
//
// 四条一律 `highpass=38`：40 Hz 以下的能量听不见却会把归一化电平整个偷走
//（`AudioSfx_ExplosionFar_01` 那次的账），而 severChop3 有 23% 在那儿。
//
// ## 音量对齐的是**响度**，不是峰值
// 与白刃那一轮同一条：生成音的波峰因数只有 13—17 dB，按峰值归一会比 Sonniss 那批
// 响十几个 dB。这里同样把每条压到全库中位响度 −28.5 dBFS，再留一道峰值保险，
// 并且量**成品自己**再补一刀（72 kbps 单声道编宽带噪声，解出来的 RMS 会偏高 2—3 dB）。

import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SFX_LICENSES } from "./Data_SfxSources.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const apiUrl = "https://openspeech.bytedance.com/api/v3/tts/create";
const model = "seed-audio-1.0";
const timeoutMs = 360_000;
const ffmpeg = process.env.FFMPEG || "ffmpeg";
const sfxDir = path.join(here, "Audio", "Sfx");
const rawDir = path.join(sfxDir, "_raw");
const sfxManifest = path.join(sfxDir, "Data_SfxManifest.json");
const force = process.argv.includes("--force");
const dry = process.argv.includes("--dry");

const TARGET_RMS_DB = -28.5;               // 全库中位响度（与白刃那一轮同一个数）
const PEAK_CEIL_DB = -6.0;                 // 峰值保险：留够 mp3 编码对瞬态的 1—3 dB 过冲
const ENCODE = ["-ac", "1", "-ar", "44100", "-b:a", "72k"];   // 与 Script_SfxBake 同档
/** 按量好的切点取一次动作。38 Hz 高通见头注最后一段。 */
const Span = (from, to) => `atrim=start=${from}:end=${to},asetpts=PTS-STARTPTS,highpass=f=38`;

const DRY = "单声道近距离干录，只有这一下，前后是安静的。";
const NEG = "不要惨叫、喘息或任何人声，不要枪声爆炸，不要音乐，不要脚步，不要回声或混响尾巴。";

// 提示词一律**不提「断肢」「人的胳膊」**：说人体部位时模型会往惨叫和血浆音效上塌。
// 描述拟音师真会做的事（劈猪腿、摔生肉）才出得来这一记，与白刃那一轮「说大刀不行、
// 说竹竿抽空气才行」是同一条经验。
const assets = [
  {
    id: "goreSeverA",
    file: "AudioSfx_GoreSever_01.mp3",
    raw: "SeedAudioGore_severChop3.mp3",
    label: "卸肢·重",
    prompt: `生成一声干净、孤立的音效：一把重斧全力劈进一整块带骨的猪腿肉，骨头当场被斩断，肉随之分开。一记沉重湿闷的入肉声打底，中间夹一下清脆的断骨，尾巴上有一点点湿肉分离的黏响。整体约 0.6 秒，收尾干净。${DRY}${NEG}`,
    filter: Span(0.10, 0.64),
  },
  {
    id: "goreSeverB",
    file: "AudioSfx_GoreSever_02.mp3",
    raw: "SeedAudioGore_severRip2.mp3",
    label: "卸肢·撕裂",
    prompt: `生成一声干净、孤立的音效：一大块带筋膜的生肉被两只手猛地撕扯断开，同时里面一根粗骨被折断。开头是短促湿润的撕裂声，紧接着一记干脆的骨头断裂脆响，随后立刻收住。整体约 0.5 秒，主体是中低频的湿响，骨裂那一下在中高频。${DRY}${NEG}`,
    filter: Span(0.01, 0.44),
  },
  {
    id: "goreLimbLandA",
    file: "AudioSfx_GoreLimbLand_01.mp3",
    raw: "SeedAudioGore_landWet1.mp3",
    label: "落地·湿闷",
    prompt: `生成一声干净、孤立的音效：一大块湿冷的生肉从半米高摔在夯实的土地上。沉闷厚重的湿响，不弹跳，一下就停，几乎没有高频。整体约 0.4 秒。${DRY}${NEG}`,
    filter: Span(0.10, 0.45),
  },
  {
    id: "goreLimbLandB",
    file: "AudioSfx_GoreLimbLand_02.mp3",
    raw: "SeedAudioGore_landBone1.mp3",
    label: "落地·带骨磕",
    prompt: `生成一声干净、孤立的音效：一整只带骨的猪腿摔落在砖地上。湿闷的一记里带一点骨头磕在砖上的钝响，随后是很短的一点滑蹭，立刻停住。整体不到 0.5 秒。${DRY}${NEG}`,
    filter: Span(0.10, 0.44),
  },
];

const CREDITS = {
  goreSever: "Volcengine SeedAudio 1.0 · 断肢（两变体：重 / 撕裂）",
  goreLimbLand: "Volcengine SeedAudio 1.0 · 肢块落地（两变体：湿闷 / 带骨磕）",
};

function probe(file) {
  const ffprobe = ffmpeg.replace(/ffmpeg(\.exe)?$/i, (value) => value.replace("ffmpeg", "ffprobe"));
  const result = spawnSync(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" });
  return Number.parseFloat(result.stdout) || 0;
}

/** 过完滤镜之后的峰值与 RMS（dBFS）—— 归一化靠量，不靠限幅器猜。 */
function levels(file, filter) {
  const result = spawnSync(ffmpeg, ["-v", "info", "-i", file, "-af", `${filter},volumedetect`, "-f", "null", "-"], { encoding: "utf8" });
  const log = (result.stderr || "") + (result.stdout || "");
  const peak = /max_volume:\s*(-?[\d.]+) dB/.exec(log);
  const rms = /mean_volume:\s*(-?[\d.]+) dB/.exec(log);
  if (peak === null || rms === null) throw new Error("量不出电平，ffmpeg 的 volumedetect 没有输出");
  return { peak: Number(peak[1]), rms: Number(rms[1]) };
}

/** 量成品自己的电平（astats 比 volumedetect 精确，后者是 256 桶直方图）。 */
function outputLevels(file, filter = "") {
  const chain = filter ? `${filter},astats=measure_perchannel=none` : "astats=measure_perchannel=none";
  const result = spawnSync(ffmpeg, ["-v", "info", "-i", file, "-af", chain, "-f", "null", "-"], { encoding: "utf8" });
  const log = (result.stderr || "") + (result.stdout || "");
  const peak = /Peak level dB:\s*(-?[\d.]+)/.exec(log);
  const rms = /RMS level dB:\s*(-?[\d.]+)/.exec(log);
  if (peak === null || rms === null) throw new Error("量不出成品电平，ffmpeg 的 astats 没有输出");
  return { peak: Number(peak[1]), rms: Number(rms[1]) };
}

/** 听得见的那一段占多少（100 Hz—8 kHz 的 RMS 减全带宽 RMS，dB）。低于 −6 就是废素材。 */
function audibleDb(file) {
  const full = outputLevels(file);
  const band = outputLevels(file, "highpass=f=100,lowpass=f=8000");
  return band.rms - full.rms;
}

/** 按响度对齐，峰值兜底：响度到位但峰值顶上去了就整条让开。 */
function GainFor(file, filter) {
  const { peak, rms } = levels(file, filter);
  return Math.min(TARGET_RMS_DB - rms, PEAK_CEIL_DB - peak);
}

async function generate(asset, rawFile) {
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
  fs.writeFileSync(rawFile, audio);
}

function render(asset, rawFile, gain, outFile) {
  execFileSync(ffmpeg, ["-y", "-v", "error", "-i", rawFile, "-af",
    `${asset.filter},volume=${gain.toFixed(2)}dB,afade=t=in:st=0:d=0.008,areverse,afade=t=in:st=0:d=0.02,areverse`,
    ...ENCODE, outFile]);
}

function encode(asset, rawFile) {
  const out = path.join(sfxDir, asset.file);
  const tmp = out + ".tmp.mp3";
  let gain = GainFor(rawFile, asset.filter);
  render(asset, rawFile, gain, tmp);
  // 量**成品自己**再补一刀（见头注最后一段）。一次就够，第二刀的残差在 0.1 dB 量级。
  const measured = outputLevels(tmp);
  const trim = Math.min(TARGET_RMS_DB - measured.rms, PEAK_CEIL_DB - measured.peak);
  if (Math.abs(trim) > 0.3) { gain += trim; render(asset, rawFile, gain, tmp); }
  fs.renameSync(tmp, out);
  const final = outputLevels(out);
  const seconds = Number(probe(out).toFixed(3));
  const bytes = fs.statSync(out).size;
  const aud = audibleDb(out);
  if (!seconds || bytes < 1024) throw new Error(`${asset.id} 转码结果无效`);
  if (final.peak > 0) throw new Error(`${asset.id} 峰值 ${final.peak.toFixed(1)} dBFS —— 削顶了`);
  if (aud < -6) throw new Error(`${asset.id} aud ${aud.toFixed(1)} dB —— 能量全在听不见的地方`);
  return { seconds, bytes, gain, peak: final.peak, rms: final.rms, aud };
}

function writeManifest(results) {
  const sfx = JSON.parse(fs.readFileSync(sfxManifest, "utf8"));
  sfx.licenses.volcengine = SFX_LICENSES.volcengine;
  const groups = { goreSever: ["goreSeverA", "goreSeverB"], goreLimbLand: ["goreLimbLandA", "goreLimbLandB"] };
  for (const [cue, ids] of Object.entries(groups)) {
    sfx.cues[cue] = {
      files: ids.map((id) => assets.find((a) => a.id === id).file),
      // 轮播的多变体记**最长**那条（清单里的 seconds 只是元数据，与白刃 dadaoSwing 同写法）
      seconds: Number(Math.max(...ids.map((id) => results[id].seconds)).toFixed(3)),
      credit: CREDITS[cue], license: "volcengine",
    };
  }
  sfx.bakedAt = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(sfxManifest, JSON.stringify(sfx, null, 2) + "\n");
}

async function main() {
  if (dry) {
    for (const asset of assets) console.log(`${asset.id}  ${asset.raw} → Audio/Sfx/${asset.file}`);
    return;
  }
  const results = {};
  for (const asset of assets) {
    const rawFile = path.join(rawDir, asset.raw);
    if (force) {
      console.log(`[重新生成] ${asset.id} —— 已选定的那条会被换掉（切点也要重新量）`);
      await generate(asset, rawFile);
    } else if (!fs.existsSync(rawFile)) {
      // 成品已经在仓库里而 take 没了：宁可这一条不烘，也不能把选好的音洗掉。
      if (fs.existsSync(path.join(sfxDir, asset.file))) {
        throw new Error(`${asset.id} 缺少 take：${path.relative(here, rawFile)}\n`
          + "  从 OneDrive\\Sync\\饮河\\FPS\\音频提取\\断肢音效_20260911\\ 取回，或用 --force 重新生成（音会变）。");
      }
      // 头一回烘（成品还不存在）：没有什么可以洗掉的，直接掷。
      console.log(`[首次生成] ${asset.id}`);
      await generate(asset, rawFile);
    }
    results[asset.id] = encode(asset, rawFile);
    const r = results[asset.id];
    console.log(`${asset.id.padEnd(14)} ${asset.label.padEnd(12)} ${r.seconds.toFixed(2)}s  ${(r.bytes / 1024).toFixed(1)} KB`
      + `  归一 ${r.gain >= 0 ? "+" : ""}${r.gain.toFixed(1)} dB → 峰 ${r.peak.toFixed(1)} / RMS ${r.rms.toFixed(1)} dBFS`
      + `  aud ${r.aud.toFixed(1)} dB`);
  }
  writeManifest(results);
  console.log("Data_SfxManifest.json 已更新");
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
