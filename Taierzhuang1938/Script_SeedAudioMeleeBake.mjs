// 白刃三音：火山引擎 SeedAudio 1.0 的 take → 可部署的挥空 / 砍中 / 刺中。
//
//   node Taierzhuang1938/Script_SeedAudioMeleeBake.mjs          # 用已有 take 重烘
//   node Taierzhuang1938/Script_SeedAudioMeleeBake.mjs --dry    # 只看要写哪些文件
//   node Taierzhuang1938/Script_SeedAudioMeleeBake.mjs --force  # 重新调接口（会换掉已验收的音！）
//
// 密钥只读 VOLCENGINE_API_KEY。原始 take 落在 Audio/Sfx/_raw/（.gitignore 挡着，不进仓库），
// 另有一份归档在 OneDrive\Sync\饮河\FPS\音频提取\刀具相关\。
//
// ## 为什么这三条不走 Script_SfxBake
// SfxBake 是「下载素材 → 按包络挑一下 → 切」；这三条是**人工试听选出来的 take**，
// 不是从一段长素材里挑出来的。同一个提示词重掷会给完全不同的音，所以：
//   · 默认**不调接口**，只拿 _raw 里已验收的 take 重新转码；
//   · `--force` 才重新生成，而且会明说这一步会换掉已验收的音；
//   · take 缺失时**拒绝覆盖**已经烘好的成品，避免一次手滑把选好的音洗掉。
//
// ## 切点是怎么定的
// 模型常在一段里给两三下、或者前面一长段低噪真正的那一下在末尾。挥空三条的切点是
// 按包络找峰、往两边退到 6% 峰值量出来的（`--force` 之后要重新量，见 header 注释）；
// 砍中与刺中两条整段就是一次动作，用 silenceremove 掐头尾即可。
//
// ## 音量对齐的是**响度**，不是峰值
// 这几条 take 从模型出来就比库里其它音"实"得多（波峰因数 13—17 dB，实录冲击音是 19—27），
// 按峰值归一会比 Sonniss 那批**响 13 dB**，白刃一出手就盖住整场枪声 —— 而
// `SAMPLE_MIX` 里 dadaoSwing 0.5 / dadaoHit 0.78 那几个数是照旧素材调的，不能白废。
// 所以这里对齐 **RMS**：把每条压到全库的中位响度 −28.5 dBFS（实测 8 条 −26.8—−31.8），
// 再留一道峰值保险。归一一律先量后调，不要用「限幅完再推增益」那一套，那是硬削。

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

const TARGET_RMS_DB = -28.5;               // 全库中位响度（实测 8 条 −26.8—−31.8）
const PEAK_CEIL_DB = -6.0;                 // 峰值保险：留够 mp3 编码对瞬态的 1—3 dB 过冲
const ENCODE = ["-ac", "1", "-ar", "44100", "-b:a", "72k"];   // 与 Script_SfxBake 同档
/** 掐头尾静音（整段就是一次动作的用这个）。 */
const TRIM_SILENCE = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03,"
  + "areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.10,areverse,"
  + "atrim=duration=4,highpass=f=50";
/** 按量好的切点取一次挥击。 */
const Span = (from, to) => `atrim=start=${from}:end=${to},asetpts=PTS-STARTPTS,highpass=f=50`;

const NEG = "不要命中声或入肉声、不要金属兵器碰撞、不要人声呼喝、不要脚步、不要衣料摩擦、不要音乐、不要回声或混响尾巴。";
const DRY = "单声道近距离干录，只有这一下，前后是安静的。";

// 挥空提示词里一律不提「大刀」：直接说大刀，模型两次都塌成两个极端 ——
// 要么全是 7 kHz 的嘶嘶（像喷气罐），要么全是 300 Hz 以下的低吼（像一阵闷风）。
// 描述拟音师真会做的事（竹竿 / 木棍抽过空气）才出得来一记挥击的包络。
const assets = [
  {
    id: "dadaoSwingA",
    file: "AudioSfx_DadaoSwing_01.mp3",
    raw: "SeedAudioMelee_dadaoSwingA.mp3",
    label: "挥空·木质厚实",
    prompt: `生成一声干净、孤立的破风音效：一根结实的木棍被人全力挥过空气。纯粹的风声，完全没有金属味，中低频为主但收得很快，整体约 0.35 秒。${DRY}${NEG}`,
    filter: Span(0.09, 0.31),
  },
  {
    id: "dadaoSwingB",
    file: "AudioSfx_DadaoSwing_02.mp3",
    raw: "SeedAudioMelee_dadaoSwingB.mp3",
    label: "挥空·长嘶",
    prompt: `生成一声干净、孤立的挥空破风音效：一把厚背的中国大刀由上向下全力劈空。中频的风声为主体，最响的那一瞬带一丝薄钢刃口切开空气的细微嘶鸣，随后干净收住，整体约 0.45 秒，起音有分量。${DRY}${NEG}`,
    filter: Span(0.03, 0.45),
  },
  {
    id: "dadaoSwingC",
    file: "AudioSfx_DadaoSwing_03.mp3",
    raw: "SeedAudioMelee_dadaoSwingC.mp3",
    label: "挥空·刃嘶明亮",
    // 这一条 take 里有两下，取的是第二下（前面那下低频重、没有刃）。
    prompt: `生成一声干净、孤立的破风音效：一把薄钢长刀高速划过空气，刃口切风带出明显的金属嘶鸣，明亮锐利但仍有中频的风体托着，整体约 0.35 秒，收尾干净。${DRY}${NEG}`,
    filter: Span(1.03, 1.58),
  },
  {
    id: "dadaoHit",
    file: "AudioSfx_DadaoHit_01.mp3",
    raw: "SeedAudioMelee_dadaoHit.mp3",
    label: "大刀砍入人体",
    prompt: "生成一声干净、孤立的利刃砍进人体的音效。沉重的大刀一记劈进躯干：短促湿润的入肉闷响，中间带一丝骨头被斩到的脆响，整体半秒到一秒，冲击感强、收尾干净。不要惨叫或任何人声、不要挥舞破风声、不要金属碰撞、不要滴血或流水声、不要音乐、不要回声混响。",
    filter: TRIM_SILENCE,
  },
  {
    id: "bayonetHit",
    file: "AudioSfx_BayonetHit_01.mp3",
    raw: "SeedAudioMelee_bayonetHit.mp3",
    label: "刺刀刺入拔出",
    prompt: "生成一声干净、孤立的窄刃利器急速刺入身体的音效。细长的刺刀全力前捅刺穿布料与躯体：布料被戳破的瞬间加上湿润的刺入声，随后快速拔出，动作干脆凶狠，整体不到一秒。不要惨叫或任何人声、不要枪声、不要音乐、不要脚步、不要回声混响。",
    filter: TRIM_SILENCE,
  },
];

/** 这一轮之后 dadaoSwing 有三个变体；旧的第二个砍中变体（Sonniss 双手斧）要清掉。 */
const ORPHANS = ["AudioSfx_DadaoHit_02.mp3"];

const CREDITS = {
  dadaoSwing: "Volcengine SeedAudio 1.0 · 大刀挥空（三变体：木质厚实 / 长嘶 / 刃嘶明亮）",
  dadaoHit: "Volcengine SeedAudio 1.0 · 大刀砍入人体",
  bayonetHit: "Volcengine SeedAudio 1.0 · 刺刀刺入拔出",
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
function outputLevels(file) {
  const result = spawnSync(ffmpeg, ["-v", "info", "-i", file, "-af", "astats=measure_perchannel=none", "-f", "null", "-"], { encoding: "utf8" });
  const log = (result.stderr || "") + (result.stdout || "");
  const peak = /Peak level dB:\s*(-?[\d.]+)/.exec(log);
  const rms = /RMS level dB:\s*(-?[\d.]+)/.exec(log);
  if (peak === null || rms === null) throw new Error("量不出成品电平，ffmpeg 的 astats 没有输出");
  return { peak: Number(peak[1]), rms: Number(rms[1]) };
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
  // 72 kbps 单声道编宽带噪声，解出来的 RMS 会比编码前高 2—3 dB（挥空那种噪声爆
  // 最明显）。所以量**成品自己**再补一刀 —— 一次就够，第二刀的残差在 0.1 dB 量级。
  const measured = outputLevels(tmp);
  const trim = Math.min(TARGET_RMS_DB - measured.rms, PEAK_CEIL_DB - measured.peak);
  if (Math.abs(trim) > 0.3) { gain += trim; render(asset, rawFile, gain, tmp); }
  fs.renameSync(tmp, out);
  const final = outputLevels(out);
  const seconds = Number(probe(out).toFixed(3));
  const bytes = fs.statSync(out).size;
  if (!seconds || bytes < 1024) throw new Error(`${asset.id} 转码结果无效`);
  if (final.peak > 0) throw new Error(`${asset.id} 峰值 ${final.peak.toFixed(1)} dBFS —— 削顶了`);
  return { seconds, bytes, gain, peak: final.peak, rms: final.rms };
}

function writeManifest(results) {
  const sfx = JSON.parse(fs.readFileSync(sfxManifest, "utf8"));
  sfx.licenses.volcengine = SFX_LICENSES.volcengine;
  const swing = ["dadaoSwingA", "dadaoSwingB", "dadaoSwingC"];
  sfx.cues.dadaoSwing = {
    files: swing.map((id) => assets.find((a) => a.id === id).file),
    seconds: Number(Math.max(...swing.map((id) => results[id].seconds)).toFixed(3)),
    credit: CREDITS.dadaoSwing, license: "volcengine",
  };
  for (const id of ["dadaoHit", "bayonetHit"]) {
    sfx.cues[id] = {
      files: [assets.find((a) => a.id === id).file],
      seconds: results[id].seconds, credit: CREDITS[id], license: "volcengine",
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
      console.log(`[重新生成] ${asset.id} —— 已验收的那条会被换掉`);
      await generate(asset, rawFile);
    } else if (!fs.existsSync(rawFile)) {
      // 拒绝在没有 take 的情况下动成品：宁可这一条不烘，也不能把选好的音洗掉。
      throw new Error(`${asset.id} 缺少 take：${path.relative(here, rawFile)}\n`
        + "  从 OneDrive\\Sync\\饮河\\FPS\\音频提取\\刀具相关\\ 取回，或用 --force 重新生成（音会变）。");
    }
    results[asset.id] = encode(asset, rawFile);
    const r = results[asset.id];
    console.log(`${asset.id.padEnd(14)} ${asset.label.padEnd(14)} ${r.seconds.toFixed(2)}s  ${(r.bytes / 1024).toFixed(1)} KB`
      + `  归一 ${r.gain >= 0 ? "+" : ""}${r.gain.toFixed(1)} dB → 峰 ${r.peak.toFixed(1)} / RMS ${r.rms.toFixed(1)} dBFS`);
  }
  for (const orphan of ORPHANS) {
    const p = path.join(sfxDir, orphan);
    if (fs.existsSync(p)) { fs.rmSync(p); console.log(`[清理] ${orphan}（已被替换的旧变体）`); }
  }
  writeManifest(results);
  console.log("Data_SfxManifest.json 已更新");
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
