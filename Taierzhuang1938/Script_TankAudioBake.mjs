// 战车音效烘焙：Data_SfxSources.TANK_SFX → Audio/Sfx/AudioSfx_Tank*.mp3 + 清单登记。
//
// 用法（从 worktree 根或任意目录，直接 node，别走 npm run）：
//   node Taierzhuang1938/Script_TankAudioBake.mjs                 # 缺素材就 curl 下载；SeedAudio 只用已存的 take
//   node Taierzhuang1938/Script_TankAudioBake.mjs --generate      # 缺的 SeedAudio take 才调接口（每条 3 个 take）
//   node Taierzhuang1938/Script_TankAudioBake.mjs --only=tankEngine
//   node Taierzhuang1938/Script_TankAudioBake.mjs --report        # 只量、不落文件（候选 take 也量）
//
// 为什么单独一只脚本、不塞进 Script_SfxBake：
//   · 三条常驻循环（发动机两层、履带、手摇炮塔）要**接缝交叉淡化**：切 durS + X 秒，尾巴那 X 秒
//     按等功率叠回开头。SfxBake 的切法是「头 3 ms 淡入、尾 120 ms 淡出」，拿去循环每圈掉一个坑。
//   · SeedAudio 那三条（履带尖啸、炮弹掠过、冷却滴答）要「生成若干 take → 量 → 选定一条」，
//     选定之后烘焙必须可重跑、不调接口（记忆「人工选定的 take 要跟可重跑的烘焙分开」）。
// SfxBake 全量重烘时按 SFX_SOURCES 末尾的 `prebaked` 组把这些成品原样重新登记，不会丢。
//
// 验收数字（每条都打，写进 _raw/Tank/Data_TankQc.json）：时长、有声段 RMS（对齐 −25 dBFS）、
// 真峰值（≤ −1 dBFS）、<500 Hz 能量占比、可闻带 aud dB（100 Hz–8 kHz ÷ 全带宽，低于 −6 dB 是废素材，
// 见记忆「量响度用真峰值」）、循环接缝的电平跳变（首尾 150 ms RMS 差）。
// 密钥只从环境变量 VOLCENGINE_API_KEY 读，绝不打印。
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { TANK_SFX, TankSfxFiles, SFX_LICENSES, ArchiveUrl } from "./Data_SfxSources.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(HERE, "Audio", "Sfx");
const RAW_DIR = path.join(OUT_DIR, "_raw", "Tank");
const MANIFEST = path.join(OUT_DIR, "Data_SfxManifest.json");
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const SR = 44100;
const TARGET_DBFS = -25;
const PEAK_CEILING_DBFS = -1;
const LIMIT_DBFS = -1.5;
const UA = "TaierzhuangSfxBake/1.0 (https://bentleyblanks.github.io)";
const SEED_TAKES = 3;

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith("--only="))?.slice(7);
const generate = args.includes("--generate");
const report = args.includes("--report");

// ---------------------------------------------------------------------------
function Download(item, filePath, rawFile) {
  const url = ArchiveUrl(item, filePath);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      execFileSync("curl", ["-sS", "-L", "--fail", "--retry", "3", "--max-time", "300", "-A", UA, "-o", rawFile, url],
        { stdio: ["ignore", "ignore", "inherit"] });
      if (fs.statSync(rawFile).size > 1024) return;
    } catch (error) { /* 镜像偶发 TLS 断连，重试 */ }
  }
  throw new Error(`下载失败：${url}`);
}

function Decode(file) {
  const raw = execFileSync(FFMPEG, ["-v", "error", "-i", file, "-ac", "1", "-ar", String(SR), "-f", "f32le", "-"],
    { maxBuffer: 1 << 29 });
  return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length));
}

function WriteWav(file, pcm) {
  const n = pcm.length, buf = Buffer.alloc(44 + n * 4);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(3, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(32, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i += 1) buf.writeFloatLE(pcm[i], 44 + i * 4);
  fs.writeFileSync(file, buf);
}

/** 先滤波（hp/lp/rate）再切：滤波器的起振不许落进成品。 */
function Filtered(rawFile, spec) {
  const filters = [];
  if (spec.rate && spec.rate !== 1) filters.push(`asetrate=${Math.round(SR * spec.rate)}`, `aresample=${SR}`);
  if (spec.hp) filters.push(`highpass=f=${spec.hp}`, `highpass=f=${spec.hp}`);
  if (spec.lp) filters.push(`lowpass=f=${spec.lp}`);
  if (!filters.length) return Decode(rawFile);
  const tmp = path.join(RAW_DIR, "_filtered.wav");
  execFileSync(FFMPEG, ["-y", "-v", "error", "-i", rawFile, "-af", filters.join(","), "-ac", "1", "-ar", String(SR), "-c:a", "pcm_f32le", tmp]);
  const pcm = Decode(tmp);
  fs.rmSync(tmp, { force: true });
  return pcm;
}

/**
 * 循环边距：成品 = 一整圈 L 再接上 L 的开头 LOOP_MARGIN_S × 2，运行时只在 [LOOP_MARGIN_S, LOOP_MARGIN_S + 一圈)
 * 之间循环（清单里的 loopStartS / loopEndS）。
 * 为什么不直接首尾相接：MP3 编码在文件两头各垫一段编码器延迟 / 补齐（约 25 ms），解码器剥不剥、剥多少各家不同，
 * 首尾那几毫秒永远对不上 —— 循环一圈「咔」一下。L 是严格周期的，所以在中间任取一整圈都是无缝的；
 * 就算解码整体错位了 d 毫秒，[m, m+n) 仍然是完整一圈（只要 d < m）。
 */
const LOOP_MARGIN_S = 0.1;
function WithLoopMargin(loop) {
  const m = Math.round(LOOP_MARGIN_S * SR), out = new Float32Array(loop.length + 2 * m);
  out.set(loop, 0);
  for (let i = 0; i < 2 * m; i += 1) out[loop.length + i] = loop[i % loop.length];
  return out;
}

/** 循环：切 durS + x，尾巴 x 秒等功率叠回开头 —— 成品首尾天然接得上。 */
function LoopCut(pcm, atS, durS, xS) {
  const a = Math.round(atS * SR), n = Math.round(durS * SR), x = Math.round(xS * SR);
  if (a + n + x > pcm.length) throw new Error(`循环段超出素材：${atS}+${durS}+${xS}s > ${(pcm.length / SR).toFixed(2)}s`);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) out[i] = pcm[a + i];
  for (let i = 0; i < x; i += 1) {
    const t = i / x;
    out[i] = pcm[a + i] * Math.sin(t * Math.PI / 2) + pcm[a + n + i] * Math.cos(t * Math.PI / 2);
  }
  return out;
}

function OneShotCut(pcm, atS, durS, fadeOutS = 0.12, fadeInS = 0.003) {
  const a = Math.max(0, Math.round(atS * SR));
  const n = Math.min(pcm.length - a, Math.round(durS * SR));
  const out = pcm.slice(a, a + n);
  const fi = Math.round(fadeInS * SR), fo = Math.min(Math.round(fadeOutS * SR), Math.floor(n * 0.9));
  for (let i = 0; i < n; i += 1) {
    let g = 1;
    if (i < fi) g *= i / fi;
    if (n - i < fo) g *= (n - i) / fo;
    out[i] *= g;
  }
  return out;
}

/** SeedAudio take：找包络峰，往两边退到峰值 6%（记忆「SeedAudio 常在前面给一段低噪」）。 */
function SeedCut(pcm, durS, fadeOutS) {
  const hop = Math.round(SR * 0.01), frames = Math.floor(pcm.length / hop), env = new Float32Array(frames);
  for (let f = 0; f < frames; f += 1) { let s = 0; for (let i = 0; i < hop; i += 1) s += pcm[f * hop + i] ** 2; env[f] = Math.sqrt(s / hop); }
  let peak = 0, at = 0;
  for (let f = 0; f < frames; f += 1) if (env[f] > peak) { peak = env[f]; at = f; }
  let s = at; while (s > 0 && env[s - 1] > peak * 0.06) s -= 1;
  let e = at; while (e < frames - 1 && env[e + 1] > peak * 0.06) e += 1;
  const startS = Math.max(0, s * hop / SR - 0.008);
  const len = Math.min(durS, (e + 1) * hop / SR - startS + 0.05);
  return { pcm: OneShotCut(pcm, startS, len, Math.min(fadeOutS, len * 0.5), 0.008), startS };
}

/** 稀疏的一串（冷却滴答）：不找单峰，只削掉首尾低于峰值 3% 的静音。 */
function SeedWhole(pcm, durS, fadeOutS) {
  let peak = 0; for (const v of pcm) peak = Math.max(peak, Math.abs(v));
  let s = 0; while (s < pcm.length && Math.abs(pcm[s]) < peak * 0.03) s += 1;
  let e = pcm.length - 1; while (e > s && Math.abs(pcm[e]) < peak * 0.03) e -= 1;
  const startS = Math.max(0, s / SR - 0.01);
  const len = Math.min(durS, e / SR - startS + 0.12);
  return { pcm: OneShotCut(pcm, startS, len, Math.min(fadeOutS, len * 0.4), 0.004), startS };
}

// ---------------------------------------------------------------------------
function Measure(pcm, loopSpan = null) {
  const loop = loopSpan ? { start: Math.round(loopSpan[0] * SR), end: Math.min(pcm.length, Math.round(loopSpan[1] * SR)) } : { start: 0, end: pcm.length };
  const frame = Math.round(SR * 0.02), frames = [];
  let peak = 0;
  for (let s = 0; s < pcm.length; s += frame) {
    const e = Math.min(pcm.length, s + frame);
    let sum = 0;
    for (let i = s; i < e; i += 1) { sum += pcm[i] * pcm[i]; peak = Math.max(peak, Math.abs(pcm[i])); }
    frames.push(Math.sqrt(sum / Math.max(1, e - s)));
  }
  const loudest = Math.max(...frames), active = frames.filter((v) => v >= loudest * 0.1);
  const Db = (v) => 20 * Math.log10(Math.max(1e-12, v));
  // 频带：整条做一次 FFT 太大，按 0.5 s 窗累加功率谱。
  const N = 16384, band = { total: 0, low500: 0, aud: 0 };
  for (let s = 0; s + N <= pcm.length || s === 0; s += N) {
    const seg = new Float32Array(N);
    for (let i = 0; i < N && s + i < pcm.length; i += 1) seg[i] = pcm[s + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
    const P = PowerSpectrum(seg);
    for (let k = 1; k < P.length; k += 1) {
      const f = k * SR / N;
      band.total += P[k];
      if (f < 500) band.low500 += P[k];
      if (f >= 100 && f <= 8000) band.aud += P[k];
    }
    if (s + N > pcm.length) break;
  }
  const edge = Math.round(SR * 0.15);   // 接缝两侧各 150 ms（30 ms 会量到点火脉冲的相位）
  const Rms = (from, to) => { let s = 0; for (let i = from; i < to; i += 1) s += pcm[i] * pcm[i]; return Math.sqrt(s / Math.max(1, to - from)); };
  return {
    seconds: Number((pcm.length / SR).toFixed(3)),
    activeRmsDbfs: Number(Db(Math.sqrt(active.reduce((t, v) => t + v * v, 0) / active.length)).toFixed(2)),
    peakDbfs: Number(Db(peak).toFixed(2)),
    low500: Number((band.low500 / (band.total || 1)).toFixed(3)),
    audDb: Number((10 * Math.log10((band.aud || 1e-20) / (band.total || 1))).toFixed(2)),
    seamDb: Number((Db(Rms(loop.end - edge, loop.end)) - Db(Rms(loop.start, loop.start + edge))).toFixed(2)),
    seamJump: Number(Math.abs(pcm[loop.end - 1] - pcm[loop.start]).toFixed(4)),
  };
}

/** 迭代 radix-2 FFT 的功率谱（N 为 2 的幂）。 */
function PowerSpectrum(x) {
  const n = x.length, re = Float64Array.from(x), im = new Float64Array(n);
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j += 1) {
        const ur = re[i + j], ui = im[i + j];
        const vr = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci, vi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
        re[i + j] = ur + vr; im[i + j] = ui + vi; re[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
  const P = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k += 1) P[k] = re[k] * re[k] + im[k] * im[k];
  return P;
}

/** 编码 + 把有声段 RMS 对到 −25 dBFS（量成品 mp3，与 AudioNormalize 同口径）。 */
function EncodeAligned(pcm, outMp3, bitrate, loopSpan = null) {
  const stage = path.join(RAW_DIR, "_stage.wav");
  WriteWav(stage, pcm);
  let gainDb = TARGET_DBFS - Measure(pcm).activeRmsDbfs, last = null;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const limit = Math.pow(10, LIMIT_DBFS / 20).toFixed(8);
    execFileSync(FFMPEG, ["-y", "-v", "error", "-i", stage, "-af",
      `volume=${gainDb.toFixed(4)}dB,alimiter=limit=${limit}:attack=2:release=50:level=false`,
      "-ac", "1", "-ar", String(SR), "-b:a", bitrate, outMp3]);
    last = Measure(Decode(outMp3), loopSpan);
    const error = TARGET_DBFS - last.activeRmsDbfs;
    if (Math.abs(error) <= 0.3 && last.peakDbfs <= PEAK_CEILING_DBFS + 0.05) break;
    gainDb += Math.max(-6, Math.min(6, error));
  }
  fs.rmSync(stage, { force: true });
  return last;
}

// ---------------------------------------------------------------------------
async function GenerateSeed(prompt, rawFile) {
  const apiKey = process.env.VOLCENGINE_API_KEY;
  if (!apiKey) throw new Error("缺 VOLCENGINE_API_KEY 环境变量");
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch("https://openspeech.bytedance.com/api/v3/tts/create", {
      method: "POST", signal: AbortSignal.timeout(360000),
      headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
      body: JSON.stringify({ model: "seed-audio-1.0", text_prompt: prompt,
        audio_config: { format: "mp3", sample_rate: 48000, pitch_rate: 0, speech_rate: 0, loudness_rate: 0 }, watermark: {} }),
    }).catch((error) => ({ ok: false, status: String(error?.name || "fetch failed") }));
    // 不打印响应体与头（可能带敏感信息）。429 / 配额：退避重试。
    if (!response.ok) {
      console.log(`  SeedAudio ${response.status}，${(attempt + 1) * 8} s 后重试`);
      await new Promise((r) => setTimeout(r, (attempt + 1) * 8000));
      continue;
    }
    const payload = await response.json();
    if (typeof payload.audio !== "string") throw new Error("SeedAudio 没有返回音频");
    const bytes = Buffer.from(payload.audio, "base64");
    if (bytes.length < 2048) throw new Error("SeedAudio 返回的 take 太小");
    fs.writeFileSync(rawFile, bytes);
    fs.writeFileSync(rawFile + ".json", JSON.stringify({ model: "seed-audio-1.0", prompt, generatedAt: new Date().toISOString() }, null, 2));
    return;
  }
  throw new Error("SeedAudio 连续失败");
}

async function Main() {
  fs.mkdirSync(RAW_DIR, { recursive: true });
  const entries = TANK_SFX.filter((e) => !only || e.cue === only);
  if (!entries.length) throw new Error(`没有这个 cue：${only}`);

  // SeedAudio 先把缺的 take 生成齐（并发 ≤ 2）。
  if (generate) {
    const jobs = [];
    for (const e of entries) for (const f of e.files) if (f.seedAudio) {
      for (let k = 1; k <= SEED_TAKES; k += 1) {
        const raw = path.join(RAW_DIR, `${f.seedAudio.take}_take${k}.mp3`);
        if (!fs.existsSync(raw)) jobs.push({ prompt: f.seedAudio.prompt, raw });
      }
    }
    const Worker = async () => { while (jobs.length) { const j = jobs.shift(); console.log(`[生成] ${path.basename(j.raw)}`); await GenerateSeed(j.prompt, j.raw); } };
    await Promise.all([Worker(), Worker()]);
  }

  const qc = {};
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  const staged = [];
  for (const e of entries) {
    const names = TankSfxFiles(e);
    const results = [];
    for (let i = 0; i < e.files.length; i += 1) {
      const f = e.files[i];
      let pcm, from;
      if (f.seedAudio) {
        // 候选 take 全量一遍（--report 看这张表选 pick），成品用 pick。
        const pick = f.seedAudio.pick || 1;
        for (let k = 1; k <= SEED_TAKES; k += 1) {
          const raw = path.join(RAW_DIR, `${f.seedAudio.take}_take${k}.mp3`);
          if (!fs.existsSync(raw)) continue;
          const cut = (f.seedAudio.whole ? SeedWhole : SeedCut)(Filtered(raw, f), f.durS, f.fadeOutS ?? 0.2);
          const m = Measure(cut.pcm);
          console.log(`  候选 ${path.basename(raw)}：${m.seconds}s 峰 ${m.peakDbfs} <500Hz ${(m.low500 * 100).toFixed(0)}% aud ${m.audDb} dB${k === pick ? "  ← 选定" : ""}`);
          if (k === pick) { pcm = cut.pcm; from = `${path.basename(raw)} @${cut.startS.toFixed(2)}s`; }
        }
        if (!pcm) throw new Error(`${e.cue}：缺 SeedAudio take（先 --generate）`);
      } else {
        const raw = path.join(RAW_DIR, `${path.basename(f.source.path).replace(/[^\w.-]+/g, "_")}`);
        if (!fs.existsSync(raw)) { console.log(`[下载] ${path.basename(f.source.path)}`); Download(f.source.item, f.source.path, raw); }
        const src = Filtered(raw, f);
        const atS = f.atS / (f.rate || 1), durS = f.durS / (f.rate || 1);
        pcm = f.loopXfadeS ? WithLoopMargin(LoopCut(src, atS, durS, f.loopXfadeS)) : OneShotCut(src, atS, durS, f.fadeOutS ?? 0.12);
        from = `${path.basename(f.source.path)} @${f.atS}s`;
      }
      const loopSpan = f.loopXfadeS ? [LOOP_MARGIN_S, LOOP_MARGIN_S + f.durS / (f.rate || 1)] : null;
      if (report) { results.push({ file: names[i], from, loopSpan, ...Measure(pcm, loopSpan) }); continue; }
      const out = path.join(RAW_DIR, "Staged_" + names[i]);
      const level = EncodeAligned(pcm, out, e.bitrate || "96k", loopSpan);
      results.push({ file: names[i], from, loopSpan, ...level });
      staged.push({ from: out, to: path.join(OUT_DIR, names[i]) });
    }
    for (const r of results) {
      console.log(`${e.cue.padEnd(16)} ${r.file.padEnd(32)} ${String(r.seconds).padStart(6)}s  有声段 ${r.activeRmsDbfs} dBFS  峰 ${r.peakDbfs}`
        + `  <500Hz ${(r.low500 * 100).toFixed(0)}%  aud ${r.audDb} dB` + (e.loop ? `  接缝 ${r.seamDb} dB／跳 ${r.seamJump}` : "") + `  ← ${r.from}`);
    }
    qc[e.cue] = results;
    if (!report) {
      manifest.cues[e.cue] = {
        files: names,
        seconds: Number(Math.max(...results.map((r) => r.seconds)).toFixed(3)),
        // 循环区间（秒）逐文件给：[loopStartS, loopEndS)。见 LOOP_MARGIN_S。
        ...(e.loop ? { loop: true, loopSpans: results.map((r) => r.loopSpan) } : {}),
        credit: e.credit, license: e.license,
      };
    }
  }
  fs.writeFileSync(path.join(RAW_DIR, "Data_TankQc.json"), JSON.stringify(qc, null, 2) + "\n");
  if (report) return;
  // 全部过门才落成品：有声段 −25 ±0.5、峰值 ≤ −1、aud ≥ −6 dB。
  const bad = Object.entries(qc).flatMap(([cue, rs]) => rs.filter((r) => Math.abs(r.activeRmsDbfs - TARGET_DBFS) > 0.5
    || r.peakDbfs > PEAK_CEILING_DBFS + 0.05 || r.audDb < -6).map((r) => `${cue}/${r.file}`));
  if (bad.length) throw new Error(`没过门：${bad.join(" ")}（成品未落盘）`);
  for (const s of staged) fs.renameSync(s.from, s.to);
  manifest.licenses = SFX_LICENSES;
  manifest.bakedAt = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`\n落盘 ${staged.length} 个文件，清单 ${Object.keys(manifest.cues).length} 个 cue。`);
}

Main().catch((error) => { console.error(error.stack || error.message || error); process.exitCode = 1; });
