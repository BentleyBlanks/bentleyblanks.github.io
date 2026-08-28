// 音效烘焙：免费实录素材 → 单个一次性音 → Audio/Sfx/*.mp3 + 清单。
//
// 用法：
//   node Taierzhuang1938/Script_SfxBake.mjs                 # 全量（缺素材就下载）
//   node Taierzhuang1938/Script_SfxBake.mjs K98k BAR        # 只烘这两组
//   node Taierzhuang1938/Script_SfxBake.mjs --recut         # 不下载，只重切
//   node Taierzhuang1938/Script_SfxBake.mjs --report        # 只打候选表，不落文件
//
// 素材表在 Data_SfxSources.mjs（含来源与许可）。原始长片落在 Audio/Sfx/_raw/，
// 已 gitignore —— 切完就没用了，仓库里只留成品。
//
// ## 为什么要「切」而不是直接用
// 这些免版税包里的东西是**录音棚原素材**，不是游戏用的一次性音：
// K98k 那条是 40 秒里打十几发，M1919A4 那条是三连发，走路那条是连着走十几步。
// 直接丢给引擎，玩家每开一枪要等 40 秒。所以要找起音点、按一发切出来。
//
// ## 三条切错过的坑，都写成了硬筛
//   1. **衰减区间**（cut.decay）。不加的话会挑出 0.05 秒的咔哒声当「落地声」——
//      枪管里的机械动作也是个陡起音，分数比真正的枪响还高。
//   2. **连发取末发**（pick:"last"）。三连发里第一发的尾巴糊在第二发上，
//      只有末发的尾巴是干净的；拿第一发去循环，连射时会听见「回声重叠」。
//   3. **尾巴必须淡干净**。硬切的尾巴每次触发都「咔」一下，比没有音效更糟。
//
// ## 2026-08-28（任务流程重制 · 音效缺口批 A2）加的四个字段
//   · `fadeInS` / `fadeOutS` —— 覆盖默认的 3 ms 进 / 120 ms 出。掐尾的惨叫要收得更快，
//     照明弹熄灭要 1.3 s 的长衰减，循环用的床两头只能各 20 ms（长淡入淡出在接缝上
//     就是每圈一个坑）。
//   · `alignDbfs` —— 烘完**量成品**、按差补增益、从同一份 stage.wav 重编，直到有声段
//     RMS 落在目标 ±0.3 dB 内（口径与 `Script_AudioNormalize.mjs` 的「一次性音」组
//     逐字相同：20 ms 帧、门限 10%、峰值上限 −1 dBFS）。**永远只有一代 mp3。**
//     不带这个字段的老 cue 一个字节都不碰 —— 它们的响度是 AudioNormalize 事后拉平的。
//   · `loop` —— 只写进清单当元数据，供接线时判断这条能不能循环。
//   · 组上的 `pending` —— 素材烘好了但 `Script_Audio.RECIPES` 里还没有同名配方，
//     写进 `manifest.pendingCues`（运行时看不见）。见 Main() 里那段注释。

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SFX_SOURCES, SFX_LICENSES, ArchiveUrl } from "./Data_SfxSources.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(HERE, "Audio", "Sfx");
const RAW_DIR = path.join(OUT_DIR, "_raw");
const MANIFEST = path.join(OUT_DIR, "Data_SfxManifest.json");

// ffmpeg：优先 PATH，其次 MiniMax Hub 自带的那份（这台机器两处都有）。
const FFMPEG = process.env.FFMPEG || "ffmpeg";

// 采样率 44.1k：枪口爆音的辨识度在 8—14 kHz 那一段，降到 32k 就开始发闷。
const SR = 44100;
const BITRATE = "72k";      // 单声道 72 kbps，一个 0.8 秒的音约 7 KB
const UA = "TaierzhuangSfxBake/1.0 (https://bentleyblanks.github.io)";

// ---------------------------------------------------------------------------
// 下载
// ---------------------------------------------------------------------------
function SourceUrl(group) {
  return group.url || ArchiveUrl(group.item, group.path);
}

// 走 curl 而不是 node 的 fetch：这台机器的出网要经 HTTP_PROXY（127.0.0.1:7898），
// undici 默认不认代理环境变量，fetch 会直接 Connect Timeout；curl 认。
function Download(group, rawFile) {
  const url = SourceUrl(group);
  execFileSync("curl", ["-sS", "-L", "--fail", "--max-time", "300",
    "-A", UA, "-o", rawFile, url], { stdio: ["ignore", "ignore", "inherit"] });
  const bytes = fs.statSync(rawFile).size;
  if (bytes < 1024) { fs.rmSync(rawFile, { force: true }); throw new Error(`素材太小，多半没下到：${url}`); }
  return bytes;
}

// ---------------------------------------------------------------------------
// 解码 / 包络 / 找起音点
// ---------------------------------------------------------------------------
function DecodeMono(file) {
  const raw = execFileSync(FFMPEG,
    ["-v", "error", "-i", file, "-ac", "1", "-ar", String(SR), "-f", "s16le", "-"],
    { maxBuffer: 1 << 29 });
  const n = raw.length >> 1;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) out[i] = raw.readInt16LE(i * 2) / 32768;
  return out;
}

/** 5 ms 一格的 RMS 包络。 */
function Envelope(pcm, hop = Math.round(SR * 0.005)) {
  const frames = Math.floor(pcm.length / hop);
  const env = new Float32Array(frames);
  for (let f = 0; f < frames; f += 1) {
    let s = 0;
    for (let i = 0; i < hop; i += 1) { const v = pcm[f * hop + i]; s += v * v; }
    env[f] = Math.sqrt(s / hop);
  }
  return { env, hop };
}

/**
 * 候选起音点。打分 = 有多响 × 起得有多陡 × 前面有多静。
 * soft：远处的枪、闷响这类没有陡起音，门槛要降下来，否则一个都挑不出。
 */
function FindHits(pcm, { minGapS = 0.35, soft = false } = {}) {
  const { env, hop } = Envelope(pcm);
  const sorted = Float32Array.from(env).sort();
  const floor = sorted[Math.floor(sorted.length * 0.35)] || 1e-5;
  const peakAll = sorted[sorted.length - 1] || 1e-4;
  const thresh = soft
    ? Math.max(floor * 2.0, peakAll * 0.07)
    : Math.max(floor * 3.5, peakAll * 0.16);
  const minGap = Math.round(minGapS / 0.005);
  const hits = [];
  let last = -1e9;
  for (let f = 2; f < env.length - 4; f += 1) {
    if (env[f] < thresh) continue;
    if (env[f] <= env[f - 1]) continue;                 // 只认上升沿
    if (f - last < minGap) continue;
    // 回退到真起音格，但**最多退 24 格（120 ms）**。不封顶的话，连发里每一发都会
    // 一路退到整串的第一个起音上 —— 三连发挑出来的「三发」是同一份，
    // pick:"last" 拿到的还是第一发，切出来是整串三响（实测就是这么翻车的）。
    let s = f;
    const floorStop = Math.max(0, f - 24);
    while (s > floorStop + 1 && env[s - 1] > floor * 1.6 && env[s - 1] < env[s]) s -= 1;
    if (hits.length && hits[hits.length - 1].at === s * hop) continue;
    const pre = (env[Math.max(0, s - 6)] + env[Math.max(0, s - 12)]) / 2;
    let pk = 0, pkAt = s;
    for (let i = s; i < Math.min(env.length, s + 40); i += 1) if (env[i] > pk) { pk = env[i]; pkAt = i; }
    let dec = 1;
    for (let i = pkAt; i < env.length && env[i] > pk * 0.1; i += 1) dec = i - pkAt + 1;
    hits.push({
      at: s * hop,
      atS: (s * hop) / SR,
      peak: pk,
      attack: Math.max(1, pkAt - s),
      decayS: dec * 0.005,
      quiet: pre / (pk + 1e-9),
      score: (pk / peakAll) * (1 / Math.sqrt(Math.max(1, pkAt - s)))
        * (1 - Math.min(1, pre / (pk + 1e-9))),
    });
    last = f;
  }
  return { hits, floor, peakAll };
}

/**
 * 按口味挑一个没用过的候选。decay 是硬筛，不是偏好。
 * cut.atS 指定素材里的秒数时，直接吸附到最近的候选起音点 —— 连发/机械音这类
 * 自动挑法挑不准的，看过候选表之后钉死一个位置比再调阈值可靠。
 */
function Pick(hits, cut, used) {
  // 连发实录的尾音可能高过下一发的起音，自动包络会把整串合成一个候选。
  // 评审确认过具体哪一发后，用 exactAtS 按波形时间直接落刀，不再吸附候选。
  if (cut.exactAtS != null) {
    const at = Math.max(0, Math.round(cut.exactAtS * SR));
    return { at, atS: at / SR, decayS: cut.tail, peak: 1, attack: 1, score: 1 };
  }
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
  let chosen;
  if (cut.pick === "last") {
    chosen = free[free.length - 1];
  } else {
    const ranked = free.slice().sort((a, b) => b.score - a.score)
      .slice(0, Math.max(3, Math.ceil(free.length * 0.5)));
    if (cut.prefer === "sustain") ranked.sort((a, b) => b.decayS - a.decayS);
    else if (cut.prefer === "loud") ranked.sort((a, b) => b.peak - a.peak);
    chosen = ranked[0];
  }
  used.add(chosen.at);
  return chosen;
}

/**
 * 整段模式：素材本身就是一次性音（大多数弹着点、倒地、闷哼都是），
 * 只把首尾的静音削掉。fromEnd 用于「越来越近」的啸声 —— 要的是最后那一截。
 */
function WholeSpan(pcm, cut) {
  const { env, hop } = Envelope(pcm);
  const sorted = Float32Array.from(env).sort();
  const floor = sorted[Math.floor(sorted.length * 0.2)] || 1e-5;
  const peak = sorted[sorted.length - 1] || 1e-4;
  const gate = Math.max(floor * 2.2, peak * 0.03);
  let s = 0, e = env.length - 1;
  while (s < env.length && env[s] < gate) s += 1;
  while (e > s && env[e] < gate) e -= 1;
  const startPad = Math.round(SR * 0.008);
  let start = Math.max(0, s * hop - startPad);
  const maxLen = Math.round(SR * cut.tail);
  const bodyEnd = Math.min(pcm.length, (e + 12) * hop);
  if (cut.fromEnd && bodyEnd - start > maxLen) start = bodyEnd - maxLen;
  return { at: start, atS: start / SR, decayS: (bodyEnd - start) / SR, peak, attack: 1, score: 1 };
}

/** 基频（自相关）。军号那一条要靠它算 playbackRate，估错了就吹跑调。 */
function Fundamental(seg) {
  const from = Math.round(SR / 900);      // 900 Hz
  const to = Math.round(SR / 120);        // 120 Hz
  const n = Math.min(seg.length, Math.round(SR * 0.25));
  const start = Math.round(n * 0.15);
  let best = 0, bestLag = 0;
  for (let lag = from; lag <= to; lag += 1) {
    let sum = 0, e0 = 0, e1 = 0;
    for (let i = start; i + lag < n; i += 1) {
      sum += seg[i] * seg[i + lag];
      e0 += seg[i] * seg[i];
      e1 += seg[i + lag] * seg[i + lag];
    }
    const r = sum / (Math.sqrt(e0 * e1) + 1e-9);
    if (r > best) { best = r; bestLag = lag; }
  }
  return bestLag ? { hz: SR / bestLag, confidence: best } : null;
}

// ---------------------------------------------------------------------------
// 切 + 编码
// ---------------------------------------------------------------------------
function WriteWav(file, pcm) {
  const n = pcm.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i += 1) {
    const v = Math.max(-1, Math.min(1, pcm[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
}

/**
 * 量**成品** mp3 的有声段 RMS 与峰值，口径与 `Script_AudioNormalize.mjs` 逐字相同
 * （20 ms 帧、门限取最响帧的 10%、单声道）。
 *
 * 为什么必须量成品：72 kbps 单声道编宽带噪声，**解出来的 RMS 会比编码前高 2—3 dB**，
 * 而短音的有声段 RMS 本来就对帧格敏感 —— 只量编码前的 stage.wav 会稳定偏亮
 * （对白那一轮「晓得。」的教训，见 docs/Data_AudioAssets.md）。
 */
function MeasureMp3(file) {
  const raw = execFileSync(FFMPEG, ["-v", "error", "-i", file, "-map", "0:a:0",
    "-ac", "1", "-f", "f32le", "-acodec", "pcm_f32le", "-"], { maxBuffer: 1 << 29 });
  const n = Math.floor(raw.length / 4);
  if (!n) throw new Error(`解不出采样：${file}`);
  const frame = Math.round(SR * 0.02);
  const frames = [];
  let peak = 0;
  for (let s = 0; s < n; s += frame) {
    const e = Math.min(n, s + frame);
    let sum = 0;
    for (let i = s; i < e; i += 1) {
      const v = raw.readFloatLE(i * 4);
      sum += v * v;
      peak = Math.max(peak, Math.abs(v));
    }
    frames.push(Math.sqrt(sum / Math.max(1, e - s)));
  }
  const loudest = Math.max(...frames);
  const active = frames.filter((v) => v >= loudest * 0.1);
  const square = active.reduce((t, v) => t + v * v, 0);
  const Db = (v) => 20 * Math.log10(Math.max(1e-12, v));
  return { activeRmsDbfs: Db(Math.sqrt(square / Math.max(1, active.length))), peakDbfs: Db(peak) };
}

/** 把 filters 与 stage.wav 编成成品 mp3。每次都从**同一份 stage.wav** 重编，永远只有一代 mp3。 */
function EncodeMp3(tmpWav, outMp3, filters) {
  const args = ["-y", "-v", "error", "-i", tmpWav];
  if (filters.length) args.push("-af", filters.join(","));
  args.push("-ac", "1", "-ar", String(SR), "-b:a", BITRATE, outMp3);
  execFileSync(FFMPEG, args);
}

// 与 Script_AudioNormalize 同一组常数：SFX 属于「一次性音」组，目标 −25 dBFS 有声段 RMS，
// 峰值上限 −1 dBFS，容差 ±0.5 dB。烘焙期就对齐的话，成品搬进 manifest.cues 之后
// `Script_AudioNormalize.mjs`（只读验收）立刻就是绿的，不必再过一遍有损重编。
const ALIGN_TOLERANCE_DB = 0.3;
const ALIGN_PEAK_CEILING_DBFS = -1;
const ALIGN_LIMIT_DBFS = -1.5;   // 给 mp3 重建留余量，与 AudioNormalize 的 PROCESS_LIMIT 同值

/**
 * 把成品对齐到 `cut.alignDbfs`。老 cue 不带这个字段 —— 它们的响度是
 * `Script_AudioNormalize.mjs --write` 事后拉平的，这里一个字节都不碰。
 */
function AlignLoudness(tmpWav, outMp3, filters, targetDbfs) {
  let gainDb = 0;
  let last = MeasureMp3(outMp3);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const error = targetDbfs - last.activeRmsDbfs;
    if (Math.abs(error) <= ALIGN_TOLERANCE_DB && last.peakDbfs <= ALIGN_PEAK_CEILING_DBFS + 0.1) return last;
    gainDb += Math.max(-6, Math.min(6, error));
    const limit = Math.pow(10, ALIGN_LIMIT_DBFS / 20).toFixed(8);
    EncodeMp3(tmpWav, outMp3, [...filters,
      `volume=${gainDb.toFixed(4)}dB`,
      `alimiter=limit=${limit}:attack=2:release=50:level=false`]);
    last = MeasureMp3(outMp3);
  }
  return last;
}

function CutOne(pcm, hit, cut, tmpWav, outMp3) {
  const pre = Math.round(SR * 0.012);                    // 起音前留一点，别切掉冲头
  const start = cut.whole ? hit.at : Math.max(0, hit.at - pre);
  const len = Math.min(pcm.length - start, Math.round(SR * cut.tail));
  const seg = pcm.slice(start, start + len);

  let peak = 0;
  for (let i = 0; i < seg.length; i += 1) peak = Math.max(peak, Math.abs(seg[i]));
  const scale = peak > 1e-4 ? (cut.gain / peak) : 1;
  // fadeInS / fadeOutS 覆盖默认值。默认那两个数是给「冲击音」定的：3 ms 进、120 ms 出。
  // 掐尾的惨叫要更短的收（0.15 s 内收干净才是「掐」），照明弹熄灭要长得多（1.3 s），
  // 循环用的床两头都只要 20 ms —— 长淡入淡出在循环接缝上就是每圈一个坑。
  const fadeIn = Math.round(SR * (cut.fadeInS ?? 0.003));
  // 默认那道「不许超过整段 40%」的封顶是给冲击音兜底的；**显式写了 fadeOutS 就是
  // 要那个长度**（照明弹熄灭那条 1.3 s 的衰减本来就该占掉大半条音），放宽到 90%。
  const fadeOutCap = seg.length * (cut.fadeOutS != null ? 0.9 : 0.4);
  const fadeOut = Math.round(Math.min(fadeOutCap, SR * (cut.fadeOutS ?? 0.12)));
  for (let i = 0; i < seg.length; i += 1) {
    let g = scale;
    if (fadeIn > 0 && i < fadeIn) g *= i / fadeIn;
    const tail = seg.length - i;
    if (fadeOut > 0 && tail < fadeOut) g *= tail / fadeOut;
    seg[i] *= g;
  }
  WriteWav(tmpWav, seg);

  // rate 走重采样：音高与长度一起变，这正是「同一把枪换了口径」的听感。
  const filters = [];
  // notch 在**变速之前**：写的是素材原始的那个频率。
  // 弹壳那条素材（SculpTunes）整库都有一记 9 kHz 的电子啸叫烘在里面 ——
  // 单听在 −70 dB 上，但归一化会把它抬起来，而这一声每开一枪响一次，
  // 稳态纯音正是耳朵最容易从噪声里拎出来的东西。
  if (cut.notch) filters.push(`bandreject=f=${cut.notch}:width_type=h:w=${cut.notchWidth || 220}`);
  if (cut.rate && cut.rate !== 1) filters.push(`asetrate=${Math.round(SR * cut.rate)}`, `aresample=${SR}`);
  if (cut.hp) filters.push(`highpass=f=${cut.hp}`);
  if (cut.lp) filters.push(`lowpass=f=${cut.lp}`);
  EncodeMp3(tmpWav, outMp3, filters);
  const level = cut.alignDbfs != null ? AlignLoudness(tmpWav, outMp3, filters, cut.alignDbfs) : null;
  fs.rmSync(tmpWav, { force: true });

  const seconds = (seg.length / SR) / (cut.rate || 1);
  return { seconds, bytes: fs.statSync(outMp3).size, seg, level };
}

// 序章专用音的确定性程序合成。每个 cue 都是独立短音，使用固定 LCG 噪声与衰减正弦，
// 便于离线重烘、审计峰值并在外部采样不可用时稳定回退。
function GenerateSyntheticSfx(cue, durS, tmpWav, outMp3) {
  const n = Math.max(1, Math.round(SR * durS));
  const pcm = new Float32Array(n);
  let seed = 0x9e3779b9 ^ cue.split("").reduce((a, c) => (a * 33 + c.charCodeAt(0)) | 0, 0);
  const noise = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return ((seed >>> 0) / 2147483648) - 1; };
  for (let i = 0; i < n; i += 1) {
    const t = i / SR;
    const x = t / durS;
    let v = 0;
    if (cue === "trainBrake") {
      const e = Math.exp(-2.1 * t) * (0.72 + 0.28 * x);
      v = e * (0.42 * Math.sin(2 * Math.PI * (210 - 105 * x) * t) + 0.30 * noise());
    } else if (cue === "carriageRattle") {
      const e = Math.exp(-6.5 * t);
      v = e * (0.30 * noise() + 0.28 * Math.sin(2 * Math.PI * 1180 * t));
    } else if (cue === "stretcherWood") {
      const e = Math.exp(-4.8 * t);
      v = e * (0.62 * Math.sin(2 * Math.PI * 145 * t) + 0.16 * noise());
    } else if (cue === "coughLow") {
      const e = Math.exp(-3.5 * t) * (0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, x)));
      v = e * (0.52 * noise() + 0.25 * Math.sin(2 * Math.PI * 92 * t));
    } else if (cue === "gearRustle") {
      const e = Math.exp(-7.5 * t);
      v = e * (0.32 * noise() + 0.20 * Math.sin(2 * Math.PI * 2400 * t));
    } else if (cue === "carriageDoorSlide") {
      const e = Math.sin(Math.PI * Math.min(1, x));
      v = e * (0.38 * noise() + 0.28 * Math.sin(2 * Math.PI * (480 + 850 * x) * t));
    } else if (cue === "stepBallast") {
      const e = Math.exp(-9 * t);
      v = e * (0.66 * Math.sin(2 * Math.PI * 86 * t) + 0.22 * noise());
    }
    const edge = Math.min(1, i / Math.max(1, Math.round(SR * 0.008)),
      (n - i) / Math.max(1, Math.round(SR * 0.025)));
    pcm[i] = v * Math.max(0, edge);
  }
  let peak = 0;
  for (const v of pcm) peak = Math.max(peak, Math.abs(v));
  const scale = peak > 0 ? Math.min(0.82 / peak, 1) : 1;
  for (let i = 0; i < pcm.length; i += 1) pcm[i] *= scale;
  WriteWav(tmpWav, pcm);
  execFileSync(FFMPEG, ["-y", "-v", "error", "-i", tmpWav, "-ac", "1", "-ar", String(SR), "-b:a", BITRATE, outMp3]);
  fs.rmSync(tmpWav, { force: true });
  return { seconds: durS, bytes: fs.statSync(outMp3).size };
}

const Pascal = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------------------------------------------------------------------
async function Main() {
  const args = process.argv.slice(2);
  const recut = args.includes("--recut");
  const report = args.includes("--report");
  const only = args.filter((a) => !a.startsWith("--"));
  const groups = only.length ? SFX_SOURCES.filter((g) => only.includes(g.id)) : SFX_SOURCES;
  if (!groups.length) throw new Error(`没有匹配的素材组：${only.join(" ")}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(RAW_DIR, { recursive: true });

  // 部分重烘时要保住其它 cue 的记录，全量重烘则从头来过
  const partial = only.length > 0;
  const manifest = partial && fs.existsSync(MANIFEST)
    ? JSON.parse(fs.readFileSync(MANIFEST, "utf8"))
    : { note: "由 Script_SfxBake.mjs 生成；来源与许可见 Data_SfxSources.mjs", licenses: SFX_LICENSES, cues: {} };
  manifest.licenses = SFX_LICENSES;
  manifest.cues = manifest.cues || {};

  // pendingCues：**素材已经烘好、但 Script_Audio 里还没有同名合成配方**的 cue。
  // `AudioEngine.LoadSfxPack` 对没有同名配方的 cue 是直接抛错的（「没有同名配方，
  // 盖不上去」），所以把它们放进 `cues` 会让每次开机多出十几条 sfxErrors，
  // 并把 `Script_AudioTest` 的三条计数断言一起顶红 —— 素材还没接线，先红一片测试
  // 不是交付。放这儿：运行时看不见（LoadSfxPack 只遍历 cues），
  // `Script_AudioNormalize` 也不会去动它们（它只读 cues）。
  // 集成批加完配方后，把 Data_SfxSources 里对应组的 `pending: true` 删掉重烘即可。
  // 每次运行都从空表开始（不像 cues 那样带着上一轮的记录）：待接线的 cue 还在调，
  // 重烘一遍就该是重新来过。代价是**共用同一个 cue 的 pending 组必须一起烘**
  // （execScream 的两个变体分属两组），全量烘焙与照组名一起点名都满足这一条。
  const pendingCues = {};
  const CueTable = (group) => (group.pending ? pendingCues : manifest.cues);

  let total = 0;
  for (const group of groups) {
    // SeedAudio 那几条（序章汽笛、白刃三音）是**人工试听选定**的成品，不由这个程序
    // 合成或重切；但每次重烘其他音效仍必须重新登记它们，否则全量 SfxBake 会悄悄把
    // cue 从 manifest 丢掉。一个 cue 可以挂多个变体文件（挥空就是三条）。
    if (group.seedAudio) {
      for (const cut of group.cuts) {
        const files = cut.files || [cut.file || `AudioSfx_${Pascal(cut.cue)}_01.mp3`];
        const missing = files.filter((f) => !fs.existsSync(path.join(OUT_DIR, f)));
        if (missing.length) {
          console.error(`  SeedAudio 成品缺失：${missing.join(" ")}`
            + (group.bake ? `（先运行 ${group.bake}）` : ""));
          continue;
        }
        if (!report) {
          manifest.cues[cut.cue] = { files, seconds: cut.durS,
            credit: cut.credit || group.credit, license: group.license };
        }
        console.log(`  SeedAudio · ${cut.cue} ${cut.durS}s`
          + (files.length > 1 ? `（${files.length} 变体）` : ""));
      }
      continue;
    }
    const ext = group.generated ? ".wav" : (path.extname(new URL(SourceUrl(group)).pathname) || ".mp3");
    const rawFile = path.join(RAW_DIR, `${group.id}${ext}`);
    if (group.generated) {
      console.log(`[生成] ${group.id}（本地确定性程序合成）`);
      if (report) { for (const cut of group.cuts) console.log(`   · ${cut.cue} ${cut.durS}s`); continue; }
      for (const cut of group.cuts) {
        const name = `AudioSfx_${Pascal(cut.cue)}_01.mp3`;
        const out = path.join(OUT_DIR, name);
        const info = GenerateSyntheticSfx(cut.cue, cut.durS, path.join(OUT_DIR, `_${cut.cue}.wav`), out);
        manifest.cues[cut.cue] = { files: [name], seconds: Number(info.seconds.toFixed(3)),
          credit: group.credit, license: group.license };
        total += info.bytes;
        console.log(`   · ${name} ${info.seconds.toFixed(2)}s ${(info.bytes / 1024).toFixed(1)} KB`);
      }
      continue;
    }
    if (!fs.existsSync(rawFile)) {
      if (recut) { console.log(`[跳过] ${group.id}：--recut 但本地没有素材`); continue; }
      process.stdout.write(`[下载] ${group.id} … `);
      const bytes = Download(group, rawFile);
      console.log(`${(bytes / 1024).toFixed(0)} KB`);
    }
    const pcm = DecodeMono(rawFile);
    const wholeOnly = group.cuts.every((c) => c.whole);
    const minGap = Math.min(...group.cuts.map((c) => c.minGap || 0.35));
    const soft = group.cuts.some((c) => c.soft);
    const found = wholeOnly ? { hits: [] } : FindHits(pcm, { minGapS: minGap, soft });
    console.log(`[切割] ${group.id}  素材 ${(pcm.length / SR).toFixed(1)}s`
      + (wholeOnly ? "（整段）" : `  候选 ${found.hits.length} 处`));
    if (report) {
      for (const h of found.hits.slice(0, 24)) {
        console.log(`    ${h.atS.toFixed(2)}s  peak ${h.peak.toFixed(3)}  attack ${h.attack}`
          + `  decay ${h.decayS.toFixed(2)}s  score ${h.score.toFixed(3)}`);
      }
      continue;
    }

    const used = new Set();
    const table = CueTable(group);
    for (const cut of group.cuts) {
      const n = Math.max(1, cut.variants || 1);
      const prev = (cut.append && table[cut.cue]?.files) || [];
      const files = prev.slice();
      let seconds = table[cut.cue]?.seconds || 0;
      let tone = table[cut.cue]?.toneHz || null;
      for (let v = 0; v < n; v += 1) {
        const hit = cut.whole ? WholeSpan(pcm, cut) : Pick(found.hits, cut, used);
        if (!hit) { console.log(`   ! ${cut.cue}：第 ${v + 1} 个变体没挑出合适的一下`); break; }
        const idx = files.length + 1;
        const name = `AudioSfx_${Pascal(cut.cue)}_${String(idx).padStart(2, "0")}.mp3`;
        const info = CutOne(pcm, hit, cut, path.join(OUT_DIR, `_${cut.cue}.wav`), path.join(OUT_DIR, name));
        files.push(name);
        if (!seconds || idx === 1) seconds = info.seconds;
        if (cut.tone) {
          const f = Fundamental(info.seg);
          if (f && f.confidence > 0.5) tone = Number(f.hz.toFixed(2));
          console.log(`     基频 ${f ? `${f.hz.toFixed(1)} Hz（置信 ${f.confidence.toFixed(2)}）` : "测不出"}`);
        }
        total += info.bytes;
        console.log(`   · ${name}  ${info.seconds.toFixed(2)}s  ${(info.bytes / 1024).toFixed(1)} KB`
          + `  ← 素材 ${hit.atS.toFixed(2)}s（衰减 ${hit.decayS.toFixed(2)}s）`
          + (info.level ? `  有声段 ${info.level.activeRmsDbfs.toFixed(2)} dBFS`
            + `／峰值 ${info.level.peakDbfs.toFixed(2)} dBFS` : ""));
        if (cut.whole) break;                       // 整段模式没有第二个变体可挑
      }
      if (!files.length) { console.log(`   ! ${cut.cue}：一个变体都没切出来`); continue; }
      table[cut.cue] = {
        files,
        seconds: Number(seconds.toFixed(3)),
        ...(tone ? { toneHz: tone } : {}),
        ...(cut.loop ? { loop: true } : {}),
        credit: cut.append && table[cut.cue]?.credit
          ? `${table[cut.cue].credit} ／ ${group.credit}`
          : group.credit,
        license: group.license,
      };
    }
  }

  if (report) return;
  // 部分重烘时保住上一轮已经登记的 pendingCues（与 cues 同一条理由）。
  if (Object.keys(pendingCues).length || (partial && manifest.pendingCues)) {
    manifest.pendingCues = partial ? { ...(manifest.pendingCues || {}), ...pendingCues } : pendingCues;
    manifest.pendingNote = "素材已烘好，但 Script_Audio.RECIPES 里还没有同名配方，"
      + "运行时不会加载（LoadSfxPack 只遍历 cues）。配方补齐后把 Data_SfxSources 对应组的 pending 去掉重烘。";
  }
  manifest.bakedAt = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  const count = Object.values(manifest.cues).reduce((s, c) => s + c.files.length, 0);
  const pendingCount = Object.values(manifest.pendingCues || {}).reduce((s, c) => s + c.files.length, 0);
  console.log(`\n清单 ${path.relative(HERE, MANIFEST)}：`
    + `${Object.keys(manifest.cues).length} 个 cue / ${count} 个文件，本次新增 ${(total / 1024).toFixed(0)} KB`
    + (pendingCount ? `；待接线 ${Object.keys(manifest.pendingCues).length} 个 cue / ${pendingCount} 个文件` : ""));
}

Main().catch((error) => { console.error(error.stack || error.message || error); process.exit(1); });
