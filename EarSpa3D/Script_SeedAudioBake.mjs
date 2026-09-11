// EarSpa3D 音频烘焙：火山引擎 SeedAudio 1.0 → 可部署的 BGM / 音效。
//
//   node EarSpa3D/Script_SeedAudioBake.mjs --dry                # 只打印计划，不调 API、不写文件
//   node EarSpa3D/Script_SeedAudioBake.mjs                      # 只补缺的（已有成品就跳过）
//   node EarSpa3D/Script_SeedAudioBake.mjs --only=scrapeSoft     # 只做这一条 cue
//   node EarSpa3D/Script_SeedAudioBake.mjs --force               # 全部重生成
//   node EarSpa3D/Script_SeedAudioBake.mjs --keep-raw            # 保留原始 take（默认删）
//
// ## 与 Taierzhuang1938 那两个 baker 的唯一实质差别：没有 ffmpeg
//
// 本机没有 ffmpeg，也不装。范例里的 `execFileSync(ffmpeg, ...)` 那一段**不能照抄**，
// 所以这个脚本的分工是：
//
//   · **API 侧的 mp3 直接就是成品**（48 kHz 单声道，格式由 audio_config 指定），
//     不做转码、不做重采样——转码本来只会再掉一层质量。
//   · **时长用纯 JS 解析 MPEG 音频帧头算**（同步字 0xFFE、version/layer/bitrate/
//     samplerate 表、每帧 1152 采样）。这比 ffprobe 还准一点：它是按帧累加的，
//     不受容器头影响。顺带用帧长序列的起伏判断有没有跑成静音段。
//   · **裁剪 / 淡入淡出 / 循环接缝全部放到浏览器运行时用 WebAudio 做**
//     （Script_Audio.js：解码成 AudioBuffer 后按采样点切，双缓冲交叉淡化）。
//     这样素材换了也不用重烘，接缝长度还能跟着玩家设备的延迟调。
//
// 另外做了两件范例没有的事，都是因为「一条坏了不能拖累整批」：
//   · 单条失败只记错误并继续跑完整批（一次几十秒到几分钟，中断重来太贵）；
//   · 清单是「读旧表 → 只覆盖本轮成功的那几条 → 写回」，所以分批烘焙不会丢别的 cue。
//
// 密钥只从 VOLCENGINE_API_KEY 环境变量读；**绝不打印密钥、绝不打印响应体**
// （响应体里可能有账户信息），出错只报 HTTP 状态码。

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AUDIO_CONFIG, AUDIO_LICENSES, BGM_SOURCES, SFX_SOURCES } from "./Data_AudioSources.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const bgmDir = path.join(here, "Audio", "Bgm");
const sfxDir = path.join(here, "Audio", "Sfx");
const manifestFile = path.join(here, "Audio", "Data_AudioManifest.json");
// 原始 take 进系统临时目录，不进仓库：仓库里只放已经过 QC 的成品。
const rawRoot = path.join(os.tmpdir(), "EarSpa3DSeedAudio");

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const force = args.includes("--force");
const keepRaw = args.includes("--keep-raw");
const only = args.find((arg) => arg.startsWith("--only="))?.slice("--only=".length);

// ── 资产表 ──

// 词干用 PascalCase（仓库命名规范：AudioSfx_<DescriptivePascalCase>[_NN]）。
function Pascal(text) {
  return text[0].toUpperCase() + text.slice(1);
}

function SfxFileName(cue, index, count) {
  const base = `AudioSfx_${Pascal(cue)}`;
  return count === 1 ? `${base}.mp3` : `${base}_${String(index + 1).padStart(2, "0")}.mp3`;
}

const assets = [
  ...BGM_SOURCES.map((source) => ({
    kind: "bgm", cue: source.cue, name: source.name, seconds: source.seconds,
    dir: bgmDir, file: source.file, prompt: source.prompt, variant: 0,
  })),
  ...SFX_SOURCES.flatMap((source) => source.variants.map((variantText, index) => ({
    kind: "sfx", cue: source.cue, name: source.name, seconds: source.seconds,
    dir: sfxDir, file: SfxFileName(source.cue, index, source.variants.length),
    // 变体做法沿用 Combat baker：公共规范段 + 事件描述 + 这一条的差异句。
    prompt: source.variants.length > 1 ? `${source.prompt}${variantText}` : source.prompt,
    variant: index, variantText,
  }))),
].map((asset) => ({
  ...asset,
  output: path.join(asset.dir, asset.file),
  raw: path.join(rawRoot, asset.kind === "bgm" ? "Bgm" : "Sfx", asset.file),
}));

const selected = only ? assets.filter((asset) => asset.cue === only) : assets;
if (!selected.length) {
  console.error(`未知 cue：${only}。可用：${[...new Set(assets.map((asset) => asset.cue))].join(", ")}`);
  process.exit(2);
}

// ── 纯 JS 的 MPEG 音频帧解析（没有 ffmpeg 时的时长与健康度来源）──

// 每帧采样数：Layer I 恒为 384；Layer II 为 1152；Layer III 在 MPEG-1 下 1152，
// 在 MPEG-2 / 2.5（低采样率）下只有 576。表选错时长会差一倍，这里按 version 分。
const BITRATE_V1 = {
  1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
};
const BITRATE_V2 = {
  1: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  3: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const SAMPLE_RATE = { 1: [44100, 48000, 32000], 2: [22050, 24000, 16000], 2.5: [11025, 12000, 8000] };

export function AnalyzeMpeg(buffer) {
  let offset = 0;
  // ID3v2：头 10 字节，size 是 synchsafe（每字节只用低 7 位）
  if (buffer.length > 10 && buffer.toString("latin1", 0, 3) === "ID3") {
    const size = ((buffer[6] & 0x7f) << 21) | ((buffer[7] & 0x7f) << 14) | ((buffer[8] & 0x7f) << 7) | (buffer[9] & 0x7f);
    offset = 10 + size;
  }
  const frames = [];
  let scanned = 0;
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff || (buffer[offset + 1] & 0xe0) !== 0xe0) {
      // 失步：逐字节找回同步字。ID3v1 尾巴与尾部填充都会走到这里。
      offset += 1;
      scanned += 1;
      if (scanned > 1_000_000) break;
      continue;
    }
    const header = buffer.readUInt32BE(offset);
    const versionBits = (header >>> 19) & 0b11;
    const layerBits = (header >>> 17) & 0b11;
    const bitrateIndex = (header >>> 12) & 0b1111;
    const rateIndex = (header >>> 10) & 0b11;
    const padding = (header >>> 9) & 1;
    const version = versionBits === 3 ? 1 : versionBits === 2 ? 2 : versionBits === 0 ? 2.5 : 0;
    const layer = layerBits === 3 ? 1 : layerBits === 2 ? 2 : layerBits === 1 ? 3 : 0;
    if (!version || !layer || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) {
      offset += 1; scanned += 1; continue;
    }
    const bitrate = (version === 1 ? BITRATE_V1 : BITRATE_V2)[layer][bitrateIndex] * 1000;
    const sampleRate = SAMPLE_RATE[version][rateIndex];
    const samples = layer === 1 ? 384 : layer === 2 ? 1152 : version === 1 ? 1152 : 576;
    const frameLength = layer === 1
      ? Math.floor((12 * bitrate) / sampleRate + padding) * 4
      : Math.floor((samples / 8) * bitrate / sampleRate) + padding;
    if (frameLength < 24 || offset + frameLength > buffer.length) { offset += 1; scanned += 1; continue; }
    frames.push({ offset, length: frameLength, bitrate, samples });
    offset += frameLength;
  }
  const totalSamples = frames.reduce((sum, frame) => sum + frame.samples, 0);
  const rate = frames.length ? DetectSampleRate(buffer, frames[0].offset) : 0;
  return {
    frames: frames.length,
    seconds: rate ? totalSamples / rate : 0,
    sampleRate: rate,
    meanBitrateKbps: frames.length ? Math.round(frames.reduce((sum, frame) => sum + frame.bitrate, 0) / frames.length / 1000) : 0,
    // 帧长分布只能描述码率。CBR 有声素材也会恒定，静音必须解码 PCM 后判断。
    lengthSpread: frames.length > 2
      ? Number((Math.max(...frames.map((f) => f.length)) / Math.min(...frames.map((f) => f.length))).toFixed(2))
      : 0,
    tailBytes: buffer.length - (frames.length ? frames.at(-1).offset + frames.at(-1).length : 0),
  };
}

function DetectSampleRate(buffer, frameOffset) {
  const header = buffer.readUInt32BE(frameOffset);
  const versionBits = (header >>> 19) & 0b11;
  const rateIndex = (header >>> 10) & 0b11;
  const version = versionBits === 3 ? 1 : versionBits === 2 ? 2 : 2.5;
  return SAMPLE_RATE[version][rateIndex] || 0;
}

// ── 生成 ──

async function Generate(asset) {
  const apiKey = process.env.VOLCENGINE_API_KEY;
  if (!apiKey) {
    throw new Error("缺少 VOLCENGINE_API_KEY；密钥只能通过环境变量提供（User 级变量需先取到当前进程）。");
  }
  const timeout = AbortSignal.timeout(AUDIO_CONFIG.timeoutMs);
  let response;
  try {
    response = await fetch(AUDIO_CONFIG.apiUrl, {
      method: "POST",
      signal: timeout,
      headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
      body: JSON.stringify({
        model: AUDIO_CONFIG.model,
        text_prompt: asset.prompt,
        audio_config: {
          format: AUDIO_CONFIG.format,
          sample_rate: AUDIO_CONFIG.sampleRate,
          pitch_rate: AUDIO_CONFIG.pitchRate,
          speech_rate: AUDIO_CONFIG.speechRate,
          loudness_rate: AUDIO_CONFIG.loudnessRate,
        },
        watermark: {},
      }),
    });
  } catch (error) {
    // AbortSignal.timeout 抛的是 TimeoutError/AbortError，不含响应体，安全。
    throw new Error(`${asset.file}: 请求失败（${error?.name || "网络错误"}）`);
  }
  // 只报状态码：响应体属于账户数据，不进日志。
  if (!response.ok) throw new Error(`${asset.file}: SeedAudio HTTP ${response.status}`);
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`${asset.file}: 响应不是 JSON`);
  }
  if (typeof payload?.audio !== "string" || payload.audio.length < 1024) {
    throw new Error(`${asset.file}: 响应里没有有效 audio 字段`);
  }
  const bytes = Buffer.from(payload.audio, "base64");
  if (bytes.length < 4096) throw new Error(`${asset.file}: 返回音频过小（${bytes.length} bytes）`);
  if (bytes[0] !== 0xff && bytes.toString("latin1", 0, 3) !== "ID3") {
    throw new Error(`${asset.file}: 返回的不是 MPEG 音频（首字节不是帧同步字）`);
  }
  fs.mkdirSync(path.dirname(asset.raw), { recursive: true });
  fs.writeFileSync(asset.raw, bytes);
  return bytes.length;
}

// ── 清单 ──

function ReadManifest() {
  if (!fs.existsSync(manifestFile)) return { version: 1, cues: {} };
  try {
    return JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  } catch {
    return { version: 1, cues: {} };
  }
}

function WriteManifest(manifest) {
  manifest.version = 1;
  manifest.model = AUDIO_CONFIG.model;
  manifest.sampleRate = AUDIO_CONFIG.sampleRate;
  manifest.channels = AUDIO_CONFIG.channels;
  manifest.nominalBitrate = AUDIO_CONFIG.bitrate;
  manifest.generatedAt = new Date().toISOString().slice(0, 10);
  manifest.bakedBy = "Script_SeedAudioBake.mjs";
  manifest.notes = [
    "时长由纯 JS 解析 MPEG 帧头累加得到（本机无 ffmpeg，不做转码）。",
    "淡入淡出与循环接缝在浏览器运行时用 WebAudio 完成，见 Script_Audio.js。",
    "contact.* 连续接触声不入库，由 Script_Audio.js 现场合成。",
  ];
  manifest.licenses = AUDIO_LICENSES;
  fs.mkdirSync(path.dirname(manifestFile), { recursive: true });
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 1) + "\n");
}

// ── 主流程 ──

function Plan() {
  console.log(`计划：${selected.length} 项（BGM ${selected.filter((a) => a.kind === "bgm").length} / 音效 ${selected.filter((a) => a.kind === "sfx").length}）`);
  console.log(`模型 ${AUDIO_CONFIG.model} · ${AUDIO_CONFIG.sampleRate} Hz · ${AUDIO_CONFIG.channels}ch · 超时 ${AUDIO_CONFIG.timeoutMs / 1000}s`);
  for (const asset of selected) {
    const exists = fs.existsSync(asset.output);
    const action = force ? "重生成" : exists ? "跳过（已有成品）" : "生成";
    console.log(`  [${action}] ${asset.kind} ${asset.cue} v${asset.variant + 1} → Audio/${asset.kind === "bgm" ? "Bgm" : "Sfx"}/${asset.file}`);
    console.log(`      目标 ${asset.seconds}s · 提示词 ${asset.prompt.length} 字：${asset.prompt.slice(0, 72)}…`);
  }
}

async function Main() {
  if (!process.env.VOLCENGINE_API_KEY && !dry) {
    console.error("缺少 VOLCENGINE_API_KEY：先 $env:VOLCENGINE_API_KEY = [Environment]::GetEnvironmentVariable('VOLCENGINE_API_KEY','User')");
    process.exitCode = 2;
    return;
  }
  if (dry) { Plan(); return; }

  const todo = selected.filter((asset) => force || !fs.existsSync(asset.output));
  if (!todo.length) { console.log("没有需要生成的：全部成品已在磁盘上（要重生成加 --force）。"); return; }

  const manifest = ReadManifest();
  const ok = [];
  const failed = [];
  let calls = 0;
  for (const asset of todo) {
    const started = Date.now();
    try {
      // 没有 raw 就直接生成；有 raw 而要求重生成时也重新调用一次（take 覆盖）。
      calls += 1;
      await Generate(asset);
      const bytes = fs.readFileSync(asset.raw);
      const info = AnalyzeMpeg(bytes);
      if (!info.frames) throw new Error(`${asset.file}: 解析不到任何 MPEG 帧`);
      fs.mkdirSync(asset.dir, { recursive: true });
      fs.writeFileSync(asset.output, bytes);
      const warnings = [];
      if (asset.kind === "sfx" && info.seconds > AUDIO_CONFIG.sfxSecondsCap) warnings.push(`时长 ${info.seconds.toFixed(2)}s 超出上限 ${AUDIO_CONFIG.sfxSecondsCap}s`);
      if (asset.kind === "bgm" && info.seconds < AUDIO_CONFIG.bgmSeconds[0] * 0.6) warnings.push(`BGM 偏短（${info.seconds.toFixed(1)}s）`);
      ok.push({ asset, info, warnings });
      manifest.cues[`${asset.cue}#${asset.variant + 1}`] = {
        cue: asset.cue,
        kind: asset.kind,
        variant: asset.variant + 1,
        name: asset.name,
        file: path.relative(here, asset.output).split(path.sep).join("/"),
        seconds: Number(info.seconds.toFixed(3)),
        bytes: bytes.length,
        sampleRate: info.sampleRate,
        meanBitrateKbps: info.meanBitrateKbps,
        frames: info.frames,
        targetSeconds: asset.seconds,
        promptSummary: asset.prompt.slice(0, 160),
        promptChars: asset.prompt.length,
        model: AUDIO_CONFIG.model,
        generatedAt: new Date().toISOString().slice(0, 10),
        license: "volcengine",
        credit: `Volcengine SeedAudio 1.0 · ${asset.cue}${asset.variant ? ` v${asset.variant + 1}` : ""} · ${new Date().toISOString().slice(0, 10)}`,
      };
      console.log(`✓ ${asset.file} ${info.seconds.toFixed(2)}s ${(bytes.length / 1024).toFixed(1)} KB ${info.meanBitrateKbps}kbps (${((Date.now() - started) / 1000).toFixed(0)}s)`
        + (warnings.length ? `  ⚠ ${warnings.join("；")}` : ""));
    } catch (error) {
      failed.push(error.message);
      console.error(`✗ ${error.message}`);
    }
    if (!keepRaw && fs.existsSync(asset.raw)) fs.rmSync(asset.raw, { force: true });
  }

  WriteManifest(manifest);
  console.log(`\n本轮 API 调用 ${calls} 次；成功 ${ok.length}，失败 ${failed.length}。清单：${path.relative(process.cwd(), manifestFile)}`);
  if (failed.length) {
    console.log("失败项（可单独重试）：");
    for (const message of failed) console.log(`  · ${message}`);
    process.exitCode = 1;
  }
}

Main().catch((error) => { console.error(error.message); process.exitCode = 1; });
