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

function CutOne(pcm, hit, cut, tmpWav, outMp3) {
  const pre = Math.round(SR * 0.012);                    // 起音前留一点，别切掉冲头
  const start = cut.whole ? hit.at : Math.max(0, hit.at - pre);
  const len = Math.min(pcm.length - start, Math.round(SR * cut.tail));
  const seg = pcm.slice(start, start + len);

  let peak = 0;
  for (let i = 0; i < seg.length; i += 1) peak = Math.max(peak, Math.abs(seg[i]));
  const scale = peak > 1e-4 ? (cut.gain / peak) : 1;
  const fadeIn = Math.round(SR * 0.003);
  const fadeOut = Math.round(Math.min(seg.length * 0.4, SR * 0.12));
  for (let i = 0; i < seg.length; i += 1) {
    let g = scale;
    if (i < fadeIn) g *= i / fadeIn;
    const tail = seg.length - i;
    if (tail < fadeOut) g *= tail / fadeOut;
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
  const args = ["-y", "-v", "error", "-i", tmpWav];
  if (filters.length) args.push("-af", filters.join(","));
  args.push("-ac", "1", "-ar", String(SR), "-b:a", BITRATE, outMp3);
  execFileSync(FFMPEG, args);
  fs.rmSync(tmpWav, { force: true });

  const seconds = (seg.length / SR) / (cut.rate || 1);
  return { seconds, bytes: fs.statSync(outMp3).size, seg };
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

  let total = 0;
  for (const group of groups) {
    const ext = path.extname(new URL(SourceUrl(group)).pathname) || ".mp3";
    const rawFile = path.join(RAW_DIR, `${group.id}${ext}`);
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
    for (const cut of group.cuts) {
      const n = Math.max(1, cut.variants || 1);
      const prev = (cut.append && manifest.cues[cut.cue]?.files) || [];
      const files = prev.slice();
      let seconds = manifest.cues[cut.cue]?.seconds || 0;
      let tone = manifest.cues[cut.cue]?.toneHz || null;
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
          + `  ← 素材 ${hit.atS.toFixed(2)}s（衰减 ${hit.decayS.toFixed(2)}s）`);
        if (cut.whole) break;                       // 整段模式没有第二个变体可挑
      }
      if (!files.length) { console.log(`   ! ${cut.cue}：一个变体都没切出来`); continue; }
      manifest.cues[cut.cue] = {
        files,
        seconds: Number(seconds.toFixed(3)),
        ...(tone ? { toneHz: tone } : {}),
        credit: cut.append && manifest.cues[cut.cue]?.credit
          ? `${manifest.cues[cut.cue].credit} ／ ${group.credit}`
          : group.credit,
        license: group.license,
      };
    }
  }

  if (report) return;
  manifest.bakedAt = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  const count = Object.values(manifest.cues).reduce((s, c) => s + c.files.length, 0);
  console.log(`\n清单 ${path.relative(HERE, MANIFEST)}：`
    + `${Object.keys(manifest.cues).length} 个 cue / ${count} 个文件，本次新增 ${(total / 1024).toFixed(0)} KB`);
}

Main().catch((error) => { console.error(error.stack || error.message || error); process.exit(1); });
