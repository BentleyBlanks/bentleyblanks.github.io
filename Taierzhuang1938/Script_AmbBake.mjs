// 环境床烘焙：实录长片 → 一段最平稳的立体声「床」+ 若干一次性音 → Audio/Amb/。
//
// 用法：
//   node Taierzhuang1938/Script_AmbBake.mjs                 # 全量（缺素材就下载）
//   node Taierzhuang1938/Script_AmbBake.mjs MeadowPlain     # 只烘这一组
//   node Taierzhuang1938/Script_AmbBake.mjs --recut         # 不下载，只重切
//   node Taierzhuang1938/Script_AmbBake.mjs --report        # 只打候选表，不落文件
//
// 素材表在 Data_AmbSources.mjs（含来源与许可）。原始长片落在 Audio/Amb/_raw/，
// 已 gitignore。
//
// ## 为什么不并进 Script_SfxBake
// 那一套的每一个环节都是为**单发**服务的：找起音点、按包络陡峭度打分、
// 掐掉尾巴、单声道。床要的东西正好相反 —— 要的是**最没有事件发生**的一段，
// 要立体声（宽度是「户外」最主要的线索），要按响度而不是峰值对齐。
// 两边只有「调 ffmpeg 解码」这三行是一样的，为这三行去抽公共层不划算。
//
// ## 床怎么挑：找「最无聊」的一段
// 打分是**负的**：电平方差越小越好、峰值离中位数越近越好（一段里混进一记关门声，
// 循环起来每 N 秒就砸你一下）、也不能挑到静音段。三条都是硬指标，能算，
// 所以不必靠听 —— 这一点很要紧，因为我听不见。
//
// ## 床不做无缝首尾
// 引擎侧是两条播放头从**随机位置**起播再互相交叉淡（Script_Audio 的 AmbLayer），
// 压根不会走到素材的接缝上。反过来说，烘一个「无缝 loop」在 MP3 上也做不到：
// 编码器要补零，解出来首尾各多十几毫秒静音，接缝处必咔一下。

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { AMB_SOURCES, AMB_LICENSES, ArchiveUrl } from "./Data_AmbSources.mjs";
import { Mulberry32, HashString } from "./Script_Noise.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(HERE, "Audio", "Amb");
const RAW_DIR = path.join(OUT_DIR, "_raw");
const MANIFEST = path.join(OUT_DIR, "Data_AmbManifest.json");

const FFMPEG = process.env.FFMPEG || "ffmpeg";
const SR = 44100;
// 床是弥散声场，码率给不高也听不出；被低通砍到 1.5 kHz 以下的那几条更是白给。
const BED_BITRATE = (lp) => (lp && lp <= 1500 ? "32k" : "56k");
const CUT_BITRATE = "64k";
const UA = "TaierzhuangAmbBake/1.0 (https://bentleyblanks.github.io)";

// ---------------------------------------------------------------------------
// 下载（走 curl，不走 fetch —— 这台机器出网要过代理，undici 不认环境变量）
// ---------------------------------------------------------------------------
function Download(group, rawFile) {
  const url = group.url || ArchiveUrl(group.item, group.path);
  execFileSync("curl", ["-sS", "-L", "--fail", "--max-time", "600",
    "-A", UA, "-o", rawFile, url], { stdio: ["ignore", "ignore", "inherit"] });
  const bytes = fs.statSync(rawFile).size;
  if (bytes < 4096) { fs.rmSync(rawFile, { force: true }); throw new Error(`素材太小，多半没下到：${url}`); }
  return bytes;
}

// ---------------------------------------------------------------------------
// 解码
// ---------------------------------------------------------------------------
/** 解成 [左, 右] 两条 Float32。素材是单声道时两条一样。 */
function DecodeStereo(file) {
  const raw = execFileSync(FFMPEG,
    ["-v", "error", "-i", file, "-ac", "2", "-ar", String(SR), "-f", "s16le", "-"],
    { maxBuffer: 1 << 30 });
  const frames = raw.length >> 2;
  const L = new Float32Array(frames);
  const R = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    L[i] = raw.readInt16LE(i * 4) / 32768;
    R[i] = raw.readInt16LE(i * 4 + 2) / 32768;
  }
  return [L, R];
}

function DecodeMono(file) {
  const raw = execFileSync(FFMPEG,
    ["-v", "error", "-i", file, "-ac", "1", "-ar", String(SR), "-f", "s16le", "-"],
    { maxBuffer: 1 << 30 });
  const n = raw.length >> 1;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) out[i] = raw.readInt16LE(i * 2) / 32768;
  return out;
}

// ---------------------------------------------------------------------------
// 包络与选段
// ---------------------------------------------------------------------------
const HOP_S = 0.05;                       // 床看的是「几十毫秒尺度上平不平」，不看瞬态

function EnvelopeDb(pcm, hopS = HOP_S) {
  const hop = Math.round(SR * hopS);
  const frames = Math.floor(pcm.length / hop);
  const db = new Float32Array(frames);
  for (let f = 0; f < frames; f += 1) {
    let s = 0;
    for (let i = 0; i < hop; i += 1) { const v = pcm[f * hop + i]; s += v * v; }
    db[f] = 20 * Math.log10(Math.sqrt(s / hop) + 1e-9);
  }
  return { db, hop };
}

const Median = (arr) => {
  const a = Float32Array.from(arr).sort();
  return a.length ? a[Math.floor(a.length / 2)] : 0;
};

/**
 * 给一个窗口打分（越大越好）。三项全是负分，挑的是「最无聊的一段」：
 *   · 电平方差    —— 一段里有渐强渐弱，循环起来就是有人在推推子
 *   · 峰值突出度  —— 混进一记关门声，每 N 秒砸你一下
 *   · 离整条素材的中位电平太低 —— 挑到了段间的静音
 */
function ScoreWindow(db, from, to, fileMed) {
  const seg = db.slice(from, to);
  let mean = 0;
  for (let i = 0; i < seg.length; i += 1) mean += seg[i];
  mean /= seg.length;
  let varsum = 0;
  for (let i = 0; i < seg.length; i += 1) { const d = seg[i] - mean; varsum += d * d; }
  const std = Math.sqrt(varsum / seg.length);
  const sorted = Float32Array.from(seg).sort();
  const med = sorted[Math.floor(sorted.length / 2)];
  const p98 = sorted[Math.floor(sorted.length * 0.98)];
  const crest = p98 - med;
  const silence = Math.max(0, (fileMed - 6) - med);
  return {
    score: -(std) - 0.7 * Math.max(0, crest - 14) - 1.2 * silence,
    std, crest, med,
  };
}

/** 在整条素材上滑窗，挑分最高的一段。atS 给了就直接用。 */
function PickWindow(mono, bed, report) {
  const need = Math.round(bed.durS * SR);
  if (mono.length < need + SR) throw new Error(`素材只有 ${(mono.length / SR).toFixed(1)} s，装不下 ${bed.durS} s 的床`);
  const { db, hop } = EnvelopeDb(mono);
  const fileMed = Median(db);
  const winFrames = Math.round(bed.durS / HOP_S);
  const step = Math.max(1, Math.round(1.0 / HOP_S));     // 1 秒一挪
  const cands = [];
  for (let f = 0; f + winFrames <= db.length; f += step) {
    const s = ScoreWindow(db, f, f + winFrames, fileMed);
    cands.push({ atS: (f * hop) / SR, ...s });
  }
  cands.sort((a, b) => b.score - a.score);
  if (report) {
    console.log(`    候选（共 ${cands.length}，整条中位 ${fileMed.toFixed(1)} dB）：`);
    for (const c of cands.slice(0, 6)) {
      console.log(`      ${c.atS.toFixed(1).padStart(6)}s  分 ${c.score.toFixed(2).padStart(7)}  方差 ${c.std.toFixed(2)}  峰突 ${c.crest.toFixed(1)}  中位 ${c.med.toFixed(1)}`);
    }
  }
  if (bed.atS != null) {
    const at = bed.atS;
    const found = cands.find((c) => Math.abs(c.atS - at) < 0.75) || { atS: at, std: NaN, crest: NaN, med: NaN };
    return found;
  }
  return cands[0];
}

// ---------------------------------------------------------------------------
// 一次性音：找起音点（与 Script_SfxBake 同一套判据，参数按环境音放宽）
// ---------------------------------------------------------------------------
function FindHits(pcm, { minGapS = 0.5, soft = false } = {}) {
  const hop = Math.round(SR * 0.005);
  const frames = Math.floor(pcm.length / hop);
  const env = new Float32Array(frames);
  for (let f = 0; f < frames; f += 1) {
    let s = 0;
    for (let i = 0; i < hop; i += 1) { const v = pcm[f * hop + i]; s += v * v; }
    env[f] = Math.sqrt(s / hop);
  }
  const sorted = Float32Array.from(env).sort();
  const floor = sorted[Math.floor(sorted.length * 0.35)] || 1e-5;
  const peakAll = sorted[sorted.length - 1] || 1e-4;
  const thresh = soft ? Math.max(floor * 2.0, peakAll * 0.06) : Math.max(floor * 3.2, peakAll * 0.14);
  const minGap = Math.round(minGapS / 0.005);
  const hits = [];
  let last = -1e9;
  for (let f = 2; f < env.length - 4; f += 1) {
    if (env[f] < thresh) continue;
    if (env[f] <= env[f - 1]) continue;
    if (f - last < minGap) continue;
    // 回退到真起音格，最多退 24 格（120 ms）—— 不封顶的话连响的素材会一路退到头。
    let s = f;
    const stop = Math.max(0, f - 24);
    while (s > stop + 1 && env[s - 1] > floor * 1.6 && env[s - 1] < env[s]) s -= 1;
    const pre = (env[Math.max(0, s - 6)] + env[Math.max(0, s - 12)]) / 2;
    let pk = 0, pkAt = s;
    for (let i = s; i < Math.min(env.length, s + 60); i += 1) if (env[i] > pk) { pk = env[i]; pkAt = i; }
    let dec = 1;
    for (let i = pkAt; i < env.length && env[i] > pk * 0.1; i += 1) dec = i - pkAt + 1;
    hits.push({
      at: s * hop, atS: (s * hop) / SR, peak: pk, decayS: dec * 0.005,
      score: (pk / peakAll) * (1 / Math.sqrt(Math.max(1, pkAt - s))) * (1 - Math.min(1, pre / (pk + 1e-9))),
    });
    last = f;
  }
  return { hits, peakAll };
}

function PickHit(hits, cut, used) {
  let free = hits.filter((h) => !used.has(h.at));
  if (cut.atS != null && free.length) {
    let best = free[0];
    for (const h of free) if (Math.abs(h.atS - cut.atS) < Math.abs(best.atS - cut.atS)) best = h;
    used.add(best.at);
    return best;
  }
  if (cut.decay) {
    const inRange = free.filter((h) => h.decayS >= cut.decay[0] && h.decayS <= cut.decay[1]);
    if (inRange.length) free = inRange;
  }
  if (!free.length) return null;
  const ranked = free.slice().sort((a, b) => b.score - a.score);
  const chosen = ranked[0];
  used.add(chosen.at);
  return chosen;
}

// ---------------------------------------------------------------------------
// 写盘
// ---------------------------------------------------------------------------
function WriteWav(file, chans) {
  const ch = chans.length;
  const n = chans[0].length;
  const buf = Buffer.alloc(44 + n * ch * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * ch * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(ch, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * ch * 2, 28); buf.writeUInt16LE(ch * 2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * ch * 2, 40);
  for (let i = 0; i < n; i += 1) {
    for (let c = 0; c < ch; c += 1) {
      const v = Math.max(-1, Math.min(1, chans[c][i]));
      buf.writeInt16LE(Math.round(v * 32767), 44 + (i * ch + c) * 2);
    }
  }
  fs.writeFileSync(file, buf);
}

function Encode(tmpWav, outMp3, { hp, lp, bitrate, channels }) {
  const filters = [];
  if (hp) filters.push(`highpass=f=${hp}`);
  if (lp) filters.push(`lowpass=f=${lp}`);
  const args = ["-y", "-v", "error", "-i", tmpWav];
  if (filters.length) args.push("-af", filters.join(","));
  args.push("-ac", String(channels), "-ar", String(SR), "-b:a", bitrate, outMp3);
  execFileSync(FFMPEG, args);
  fs.rmSync(tmpWav, { force: true });
  return fs.statSync(outMp3).size;
}

// 序章车厢床的本地确定性生成：低频车体、轮轨重复节奏、空气摩擦和木结构轻响。
// 不依赖网络或第三方素材；30 秒母带由引擎侧双头交叉淡化，运行时不会直接撞 MP3 首尾。
function GenerateTrainInterior(rawFile) {
  execFileSync(FFMPEG, ["-y", "-v", "error",
    "-f", "lavfi", "-i", "anoisesrc=color=brown:amplitude=0.22:duration=31",
    "-f", "lavfi", "-i", "anoisesrc=color=white:amplitude=0.08:duration=31",
    "-f", "lavfi", "-i", "sine=frequency=72:duration=31",
    "-f", "lavfi", "-i", "sine=frequency=290:duration=31",
    "-filter_complex",
    "[0:a]lowpass=f=160,volume=0.78[h];"
      + "[1:a]highpass=f=1500,lowpass=f=7000,volume=0.25, tremolo=f=5.6:d=0.65[a];"
      + "[2:a]tremolo=f=2.8:d=0.9,volume=0.42[w];"
      + "[3:a]tremolo=f=5.6:d=0.7,volume=0.16[c];"
      + "[h][a][w][c]amix=inputs=4:duration=longest:normalize=0,"
      + "alimiter=limit=0.86,afade=t=in:st=0:d=0.15,afade=t=out:st=30.85:d=0.15[out]",
    "-map", "[out]", "-ac", "2", "-ar", String(SR), "-c:a", "pcm_s16le", rawFile], { stdio: "inherit" });
}

/** 按目标 RMS 对齐响度，峰值超了再统一压回来（**不**做限幅，压的是整段）。 */
function Normalize(chans, targetDb) {
  let sum = 0, n = 0, peak = 0;
  for (const c of chans) {
    for (let i = 0; i < c.length; i += 1) { sum += c[i] * c[i]; peak = Math.max(peak, Math.abs(c[i])); }
    n += c.length;
  }
  const rms = Math.sqrt(sum / Math.max(1, n));
  let gain = Math.pow(10, targetDb / 20) / (rms + 1e-9);
  let clipped = false;
  if (peak * gain > 0.94) { gain = 0.94 / (peak + 1e-9); clipped = true; }
  for (const c of chans) for (let i = 0; i < c.length; i += 1) c[i] *= gain;
  const outRms = 20 * Math.log10(rms * gain + 1e-9);
  return { gain, outRms, outPeak: peak * gain, clipped };
}

/** 两端各 20 ms 淡入淡出：素材是从中间切的，硬边在解码后是一声咔。 */
function EdgeFade(chans, ms = 20) {
  const k = Math.round(SR * ms / 1000);
  for (const c of chans) {
    for (let i = 0; i < k && i < c.length; i += 1) {
      c[i] *= i / k;
      c[c.length - 1 - i] *= i / k;
    }
  }
}

/**
 * 叠出来的床：没有哪条实录是「连成一片的远方炮火」——
 * 炮就是一响一响的，中间是空的（滕县那条素材整段方差 31 dB 就是这么来的）。
 * 电影里那层连绵的闷雷是**混出来的**：几十记真炮响错开时间叠在一起，
 * 尾巴互相搭上，才成为一片。所以这里也照做，只是在烘焙期做完，运行时不花钱。
 *
 * 随机走 Mulberry32（种子 = cue 名），与引擎里「不许 Math.random」是同一条规矩：
 * 同一份素材烘几次结果必须一样，不然没法比对波形。
 */
function StackBed(mono, hits, bed) {
  const rng = Mulberry32(HashString("ambstack@" + bed.cue));
  const len = Math.round(bed.durS * SR);
  const L = new Float32Array(len);
  const R = new Float32Array(len);
  const cfg = bed.stack;
  const tail = Math.round(SR * (cfg.tailS || 3.0));
  const pool = hits.slice().sort((a, b) => b.score - a.score).slice(0, Math.max(3, cfg.pool || 8));
  if (!pool.length) throw new Error("素材里一个炮响都没找到，叠不出床");
  for (let k = 0; k < cfg.count; k += 1) {
    const hit = pool[Math.floor(rng() * pool.length)];
    // 起点整段随机（**不是等间距**）：等间距叠出来是节拍器，不是炮击。
    const at = Math.floor(rng() * len);
    const gain = (cfg.minGain ?? 0.35) + rng() * (1 - (cfg.minGain ?? 0.35));
    const pan = rng() * 2 - 1;                       // 左右撒开，炮位不在一个点上
    const gl = gain * Math.sqrt((1 - pan) / 2) * 1.41;
    const gr = gain * Math.sqrt((1 + pan) / 2) * 1.41;
    const from = hit.at;
    const n = Math.min(tail, mono.length - from);
    for (let i = 0; i < n; i += 1) {
      const dst = at + i;
      if (dst >= len) break;                          // 越过尾巴就丢掉，不折回开头
      const s = mono[from + i] * (i < 64 ? i / 64 : 1);
      L[dst] += s * gl;
      R[dst] += s * gr;
    }
  }
  return [L, R];
}

const Pascal = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------------------------------------------------------------------
async function Main() {
  const argv = process.argv.slice(2);
  const report = argv.includes("--report");
  const recut = argv.includes("--recut");
  const only = argv.filter((a) => !a.startsWith("--"));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(RAW_DIR, { recursive: true });

  const manifest = { generated: "Script_AmbBake.mjs", sampleRate: SR, beds: {}, cues: {}, credits: {}, licenses: AMB_LICENSES };
  const groups = AMB_SOURCES.filter((g) => !only.length || only.includes(g.id));
  let files = 0, bytes = 0;
  const failures = [];

  for (const group of groups) {
    const rawFile = path.join(RAW_DIR, group.id + (group.path ? path.extname(group.path) : ".wav"));
    console.log(`\n[${group.id}] ${group.credit}`);
    try {
      if (group.generated) {
        if (recut && !fs.existsSync(rawFile)) { console.log("  跳过（--recut，本地没有生成母带）"); continue; }
        if (group.generated === "trainInterior") GenerateTrainInterior(rawFile);
      } else if (!fs.existsSync(rawFile)) {
        if (recut) { console.log("  跳过（--recut，本地没有原始素材）"); continue; }
        const n = Download(group, rawFile);
        console.log(`  下载 ${(n / 1e6).toFixed(2)} MB`);
      }
    } catch (err) {
      console.error(`  下载失败：${err.message}`);
      failures.push({ id: group.id, stage: "download", message: err.message });
      continue;
    }

    // --- 床 ---------------------------------------------------------------
    for (const bed of group.beds || []) {
      try {
        const mono = DecodeMono(rawFile);
        let chans;
        if (bed.stack) {
          const { hits } = FindHits(mono, { soft: true, minGapS: 0.6 });
          console.log(`  床 ${bed.cue}：叠 ${bed.stack.count} 记（素材里找到 ${hits.length} 记）`);
          if (report) continue;
          chans = StackBed(mono, hits, bed);
        } else {
          const win = PickWindow(mono, bed, report);
          console.log(`  床 ${bed.cue}：取 ${win.atS.toFixed(1)}s + ${bed.durS}s`
            + (Number.isFinite(win.std) ? `（方差 ${win.std.toFixed(2)} dB，峰突 ${win.crest.toFixed(1)} dB）` : "（手钉位置）"));
          if (report) continue;
          const [L, R] = DecodeStereo(rawFile);
          const from = Math.round(win.atS * SR);
          const len = Math.round(bed.durS * SR);
          chans = bed.mono
            ? [Float32Array.from(mono.slice(from, from + len))]
            : [Float32Array.from(L.slice(from, from + len)), Float32Array.from(R.slice(from, from + len))];
        }
        EdgeFade(chans);
        const norm = Normalize(chans, bed.rms);
        const tmp = path.join(OUT_DIR, `_tmp_${bed.cue}.wav`);
        WriteWav(tmp, chans);
        const file = `AudioAmb_${Pascal(bed.cue)}.mp3`;
        const size = Encode(tmp, path.join(OUT_DIR, file), {
          hp: bed.hp, lp: bed.lp, bitrate: BED_BITRATE(bed.lp), channels: chans.length,
        });
        manifest.beds[bed.cue] = { file, seconds: +bed.durS.toFixed(2), channels: chans.length };
        manifest.credits[bed.cue] = { credit: group.credit, license: group.license, source: group.path };
        files += 1; bytes += size;
        console.log(`    → ${file}  ${(size / 1024).toFixed(1)} KB  RMS ${norm.outRms.toFixed(1)} dBFS 峰 ${norm.outPeak.toFixed(2)}`
          + (norm.clipped ? "（峰值封顶，响度未到目标）" : ""));
      } catch (err) {
        console.error(`  床 ${bed.cue} 失败：${err.message}`);
        failures.push({ id: group.id, stage: "bed:" + bed.cue, message: err.message });
      }
    }

    // --- 一次性音 ---------------------------------------------------------
    for (const cut of group.cuts || []) {
      try {
        const mono = DecodeMono(rawFile);
        let { hits, peakAll } = FindHits(mono, { soft: cut.soft });
        // whole：素材本身就是一条一次性音（公鸡打鸣这种）。
        // 拿起音检测去切它只会切到第一个音节，后面几声全丢——
        // 直接削掉首尾静音用整条。
        if (cut.whole) {
          const hop = Math.round(SR * 0.005);
          let s0 = 0, e0 = mono.length - 1;
          const gate = peakAll * 0.06;
          while (s0 < mono.length && Math.abs(mono[s0]) < gate) s0 += 1;
          while (e0 > s0 && Math.abs(mono[e0]) < gate) e0 -= 1;
          hits = [{ at: Math.max(0, s0 - hop), atS: Math.max(0, s0 - hop) / SR, peak: peakAll, decayS: (e0 - s0) / SR, score: 1 }];
        }
        if (report) {
          console.log(`  音 ${cut.cue}：候选 ${hits.length} 个（整条峰 ${peakAll.toFixed(3)}）`);
          for (const h of hits.slice(0, 10)) {
            console.log(`      ${h.atS.toFixed(2).padStart(7)}s  峰 ${h.peak.toFixed(3)}  衰减 ${h.decayS.toFixed(2)}s  分 ${h.score.toFixed(3)}`);
          }
          continue;
        }
        const used = new Set();
        const outFiles = [];
        for (let v = 0; v < (cut.variants || 1); v += 1) {
          // 切完还要验一道：**冲头必须落在开头**。起音回退会认错前面一个轻微的
          // 上升沿，切出来就是「前面一秒无关声 + 真正的炮响」——
          // 实测远处火炮三个变体里两个峰值在 1.2 s 之后，丢进游戏就是「响得晚了一拍」。
          // peakBy 是占 tail 的比例；飞机通场这种本来就是慢慢涨上来的，单独放宽。
          const peakBy = Math.round(SR * cut.tail * (cut.peakBy ?? 0.3));
          let hit = null, seg = null, peak = 0;
          for (let tries = 0; tries < 14; tries += 1) {
            hit = PickHit(hits, cut, used);
            if (!hit) break;
            const pre = Math.round(SR * 0.015);
            const start = Math.max(0, hit.at - pre);
            const len = Math.min(mono.length - start, Math.round(SR * cut.tail));
            seg = Float32Array.from(mono.slice(start, start + len));
            peak = 0;
            let peakAt = 0;
            for (let i = 0; i < seg.length; i += 1) {
              const a = Math.abs(seg[i]);
              if (a > peak) { peak = a; peakAt = i; }
            }
            if (peakAt <= peakBy) break;
            hit = null;                                  // 冲头太晚，换下一个候选
          }
          if (!hit) { console.error(`    变体 ${v + 1} 没挑到合格候选（衰减区间 ${cut.decay}，冲头要在 ${(cut.tail * (cut.peakBy ?? 0.3)).toFixed(2)}s 以内）`); break; }
          const scale = peak > 1e-4 ? cut.gain / peak : 1;
          const fadeIn = Math.round(SR * 0.004);
          const fadeOut = Math.round(Math.min(seg.length * 0.45, SR * 0.25));
          for (let i = 0; i < seg.length; i += 1) {
            let g = scale;
            if (i < fadeIn) g *= i / fadeIn;
            const tail = seg.length - i;
            if (tail < fadeOut) g *= tail / fadeOut;
            seg[i] *= g;
          }
          const tmp = path.join(OUT_DIR, `_tmp_${cut.cue}${v}.wav`);
          WriteWav(tmp, [seg]);
          const file = `AudioAmb_${Pascal(cut.cue)}_${String(v + 1).padStart(2, "0")}.mp3`;
          const size = Encode(tmp, path.join(OUT_DIR, file), {
            hp: cut.hp, lp: cut.lp, bitrate: CUT_BITRATE, channels: 1,
          });
          outFiles.push(file);
          files += 1; bytes += size;
          console.log(`    → ${file}  ${(size / 1024).toFixed(1)} KB  @${hit.atS.toFixed(2)}s 衰减 ${hit.decayS.toFixed(2)}s`);
        }
        if (!outFiles.length) throw new Error("一个变体都没切出来");
        manifest.cues[cut.cue] = { files: outFiles, seconds: +cut.tail.toFixed(2) };
        manifest.credits[cut.cue] = { credit: group.credit, license: group.license, source: group.path };
      } catch (err) {
        console.error(`  音 ${cut.cue} 失败：${err.message}`);
        failures.push({ id: group.id, stage: "cut:" + cut.cue, message: err.message });
      }
    }
  }

  if (report) return;
  // 只烘了一部分时不许覆盖清单里别的条目 —— 合并再写。
  if (only.length && fs.existsSync(MANIFEST)) {
    const old = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
    manifest.beds = { ...old.beds, ...manifest.beds };
    manifest.cues = { ...old.cues, ...manifest.cues };
    manifest.credits = { ...old.credits, ...manifest.credits };
  }
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
  console.log(`\n清单：${Object.keys(manifest.beds).length} 条床 / ${Object.keys(manifest.cues).length} 条音`);
  console.log(`本轮落盘 ${files} 个文件，共 ${(bytes / 1024).toFixed(0)} KB`);
  if (failures.length) {
    console.log("\n失败：");
    for (const f of failures) console.log(`  ${f.id} ${f.stage}：${f.message}`);
    process.exitCode = 1;
  }
}

Main().catch((err) => { console.error(err); process.exit(1); });
