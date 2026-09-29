// 战场远景床的无人声候选：SeedAudio 底（stems）+ 仓库里已有的 Sonniss 实录远枪 / 远炮单发 → 五条候选床。
//
//   node Taierzhuang1938/Script_SeedAudioBattleBedBake.mjs                 # 默认：只用存下的 take 重新混，不发任何请求
//   node Taierzhuang1938/Script_SeedAudioBattleBedBake.mjs --variant=A,C    # 只混这几条
//   node Taierzhuang1938/Script_SeedAudioBattleBedBake.mjs --force --stem=ThunderRoll   # 才会向 SeedAudio 再要一次（存成下一个 take 编号）
//   node Taierzhuang1938/Script_SeedAudioBattleBedBake.mjs --dry            # 只打印计划
//   node Taierzhuang1938/Script_SeedAudioBattleBedBake.mjs --measure a.mp3 b.mp3    # 只量 RMS / 峰 / 波峰因数
//   node Taierzhuang1938/Script_SeedAudioBattleBedBake.mjs --page           # 出本地对比页（_shots/AmbBedCandidates/，不提交）
//   加 --no-screen 跳过人声筛查（Whisper 每条约 1–2 分钟）；筛查结果不是 clean 时退出码 2；加 --events 打印每一发撒播的时刻。
//
// 素材表、提示词与混音配方在 Data_AmbSources.mjs（AMB_BED_STEMS / AMB_BED_VARIANTS / AMB_BED_TARGET）。
// 原始 take 存在 --takes-dir（默认 <仓库>/tmp/AmbBedTakes，已 gitignore；也可设环境变量 AMB_BED_TAKES_DIR，
// 例如放进 OneDrive）。每次请求追加一行到 takes 目录的 Requests.jsonl（不含密钥），总请求数超过 --budget（默认 40）就拒绝。
// 密钥只从环境变量 VOLCENGINE_API_KEY 读（由 Script_SeedAudioVoiceKit.SeedAudioSpeak 经 X-Api-Key 头发送），不进日志和文件。
//
// 为什么默认不发请求：SeedAudio 同一条提示词每次结果都不一样（没有固定种子），已经挑定的 take 重混必须逐字节可复现；
// 混音里所有随机都走 Mulberry32（种子 = 候选键 + 撒播项名），同一批 take 烘几次结果一样。
//
// 混音口径（没有耳朵，靠数）：
//   · 底（stems）按配方过高低通与增益后叠在一起，量出它自己的 RMS（bedRms）；
//   · 撒播的实录单发按「峰值 = bedRms + peakOverBedDb」摆进去（指数间隔、固定种子、随机声像与 ±变调），
//     补 SeedAudio 缺的那一下「炸」；带 echo 的先过 aecho 出回声尾巴（村镇拍打回声、地形回声）；
//   · 整条再按现行 battleFar 成品的 RMS（AMB_BED_TARGET.rmsDb，量成品不量母带）迭代对齐，峰值超过天花板由 alimiter 压住。

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SeedAudioSpeak, requestStats } from "./Script_SeedAudioVoiceKit.mjs";
import { AMB_BED_STEMS, AMB_BED_VARIANTS, AMB_BED_TARGET, AMB_LICENSES } from "./Data_AmbSources.mjs";
import { Mulberry32, HashString } from "./Script_Noise.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const AMB_DIR = path.join(HERE, "Audio", "Amb");
const MANIFEST = path.join(AMB_DIR, "Data_AmbManifest.json");
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const SR = 44100;

const args = process.argv.slice(2);
const Flag = (name) => args.includes(`--${name}`);
const Option = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;

const takesDir = path.resolve(Option("takes-dir") || process.env.AMB_BED_TAKES_DIR || path.join(REPO, "tmp/AmbBedTakes"));
const budget = Number(Option("budget") || 40);
const requestLog = path.join(takesDir, "Requests.jsonl");

// ---------------------------------------------------------------------------
// SeedAudio 请求（只有 --force 才发）
// ---------------------------------------------------------------------------
function LoggedRequests() {
  if (!fs.existsSync(requestLog)) return 0;
  return fs.readFileSync(requestLog, "utf8").split("\n").filter(Boolean)
    .reduce((sum, line) => sum + (JSON.parse(line).requests || 0), 0);
}
const TakePath = (stem, n) => path.join(takesDir, `${stem}_take${String(n).padStart(2, "0")}.mp3`);
function NextTake(stem) { let n = 1; while (fs.existsSync(TakePath(stem, n))) n += 1; return n; }

async function RequestTakes() {
  const only = (Option("stem") || "").split(",").filter(Boolean);
  const wanted = AMB_BED_STEMS.filter((s) => !only.length || only.includes(s.id));
  if (!wanted.length) throw new Error(`没有这条底：${only.join(",")}`);
  fs.mkdirSync(takesDir, { recursive: true });
  const used = LoggedRequests();
  console.log(`SeedAudio 请求账：已用 ${used} / ${budget}；本轮 ${wanted.length} 条底`);
  if (Flag("dry")) { for (const stem of wanted) console.log(`  [dry] ${stem.id} → take ${NextTake(stem.id)}`); return; }
  if (used + wanted.length > budget) throw new Error(`预算不够：已用 ${used}，本轮至少 ${wanted.length}，上限 ${budget}`);
  // 两路并发：单次请求 30–90 s，串行太慢；再多容易撞 429。
  const queue = wanted.slice();
  const worker = async () => {
    for (let stem = queue.shift(); stem; stem = queue.shift()) {
      const n = NextTake(stem.id);
      let status = "ok", error = "";
      try {
        const take = await SeedAudioSpeak({ prompt: stem.prompt, subtitle: false, label: `${stem.id}#${n}` });
        fs.writeFileSync(TakePath(stem.id, n), take.bytes);
        console.log(`  ${stem.id} take ${n}: ${(take.bytes.length / 1024).toFixed(0)} KB, ${take.seconds ?? "?"} s`);
      } catch (err) {
        status = "fail"; error = String(err.message || err).slice(0, 200);
        console.error(`  ${stem.id} take ${n} 失败：${error}`);
      }
      // 每条底记 1 次请求；两路并发共用一个全局计数，逐条相减会重复计，所以重试（429/5xx 退避）在本轮结束时一次性补记。
      fs.appendFileSync(requestLog, JSON.stringify({
        at: new Date().toISOString(), stem: stem.id, take: n, status, error, requests: 1,
        promptSha256: crypto.createHash("sha256").update(stem.prompt).digest("hex").slice(0, 16),
      }) + "\n");
    }
  };
  const startedAt = requestStats.requests;
  await Promise.all([worker(), worker()]);
  const retried = requestStats.requests - startedAt - wanted.length;
  if (retried > 0) fs.appendFileSync(requestLog, JSON.stringify({ at: new Date().toISOString(), stem: "(retries)", requests: retried }) + "\n");
  console.log(`SeedAudio 请求账：合计 ${LoggedRequests()} / ${budget}（本轮重试 ${Math.max(0, retried)}）`);
}

// ---------------------------------------------------------------------------
// PCM 工具
// ---------------------------------------------------------------------------
function RunFfmpeg(ffArgs, input) {
  const result = spawnSync(FFMPEG, ffArgs, { input, maxBuffer: 1 << 29, windowsHide: true });
  if (result.status !== 0) throw new Error(`ffmpeg 失败：${(result.stderr || "").toString().slice(-300)}`);
  return result.stdout;
}

/** 解成 [左, 右] Float32Array（单声道素材两条一样），可带 ffmpeg -af 滤镜链。 */
function DecodeStereo(file, filter = "", channels = 2) {
  const out = RunFfmpeg(["-v", "error", "-i", file, ...(filter ? ["-af", filter] : []),
    "-ac", String(channels), "-ar", String(SR), "-f", "f32le", "pipe:1"]);
  const frames = Math.floor(out.length / (4 * channels));
  const view = new Float32Array(out.buffer, out.byteOffset, frames * channels);
  const chans = [];
  for (let c = 0; c < channels; c += 1) {
    const arr = new Float32Array(frames);
    for (let i = 0; i < frames; i += 1) arr[i] = view[i * channels + c];
    chans.push(arr);
  }
  return chans;
}

function EncodeMp3(chans, file, { bitrate, filter = "" }) {
  const n = chans[0].length, ch = chans.length;
  const inter = new Float32Array(n * ch);
  for (let i = 0; i < n; i += 1) for (let c = 0; c < ch; c += 1) inter[i * ch + c] = chans[c][i];
  RunFfmpeg(["-y", "-v", "error", "-f", "f32le", "-ar", String(SR), "-ac", String(ch), "-i", "pipe:0",
    ...(filter ? ["-af", filter] : []), "-map_metadata", "-1", "-ac", String(ch), "-ar", String(SR), "-b:a", bitrate, file],
  Buffer.from(inter.buffer, inter.byteOffset, inter.byteLength));
  return fs.statSync(file).size;
}

const Db = (x) => 20 * Math.log10(Math.max(x, 1e-9));

/** 整段 RMS（所有声道合并）、峰值、波峰因数，与 ffmpeg astats 的 Overall 同一口径。 */
export function MeasureChans(chans) {
  let sum = 0, peak = 0, n = 0;
  for (const c of chans) {
    for (let i = 0; i < c.length; i += 1) { const v = c[i]; sum += v * v; if (Math.abs(v) > peak) peak = Math.abs(v); }
    n += c.length;
  }
  const rmsDb = 10 * Math.log10(Math.max(sum / Math.max(1, n), 1e-18));
  return { seconds: chans[0].length / SR, rmsDb, peakDb: Db(peak), crestDb: Db(peak) - rmsDb };
}
export const MeasureFile = (file) => MeasureChans(DecodeStereo(file));

const Sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

// ---------------------------------------------------------------------------
// 混音
// ---------------------------------------------------------------------------
const Chain = (spec) => [
  spec.hp ? `highpass=f=${spec.hp}` : "", spec.lp ? `lowpass=f=${spec.lp}` : "",
  spec.eq ? spec.eq : "", spec.gainDb ? `volume=${spec.gainDb}dB` : "",
].filter(Boolean).join(",");

function PrepareSlice(file, sc, ratio) {
  const filters = [];
  if (ratio !== 1) filters.push(`asetrate=${Math.round(SR * ratio)}`, `aresample=${SR}`);
  if (sc.hp) filters.push(`highpass=f=${sc.hp}`);
  if (sc.echo) {
    filters.push(`apad=pad_dur=${sc.echo.padS ?? 2.5}`,
      `aecho=0.9:0.9:${sc.echo.delaysMs.join("|")}:${sc.echo.decays.join("|")}`);
    if (sc.echo.lp) filters.push(`lowpass=f=${sc.echo.lp}`);
  }
  if (sc.lp) filters.push(`lowpass=f=${sc.lp}`);
  const [mono] = DecodeStereo(path.join(HERE, file), filters.join(","), 1);
  let peak = 0;
  for (let i = 0; i < mono.length; i += 1) peak = Math.max(peak, Math.abs(mono[i]));
  const scale = peak > 1e-6 ? 1 / peak : 0;
  for (let i = 0; i < mono.length; i += 1) mono[i] *= scale;
  return mono;
}

function MixStems(variant, len) {
  const L = new Float32Array(len), R = new Float32Array(len);
  const used = [];
  for (const stem of variant.stems) {
    const file = TakePath(stem.id, stem.take);
    if (!fs.existsSync(file)) throw new Error(`缺 take：${path.basename(file)}（--force --stem=${stem.id} 再抽，或改配方里的 take 编号）`);
    let [l, r] = DecodeStereo(file, Chain(stem));
    if (stem.swap) [l, r] = [r, l];
    const from = Math.round((stem.fromS || 0) * SR);
    const rot = Math.round((stem.rotateS || 0) * SR);
    const xf = Math.round(SR * 0.35);
    if (from + len > l.length) throw new Error(`${path.basename(file)} 只有 ${(l.length / SR).toFixed(1)} s，配方要 ${((from + len) / SR).toFixed(1)} s`);
    // 循环移位：输出 = [窗口后半（从 rot 起）, 窗口前半（多带 xf 用来和前一段的尾巴等功率交叉）]。
    const Tap = (src, i) => {
      if (!rot) return src[from + i];
      const head = len - rot;                        // 第一段（窗口后半）在输出里占的长度
      if (i < head - xf) return src[from + rot + i];
      if (i < head) {                                // 接缝：第一段淡出、第二段（窗口开头）淡入
        const t = (i - (head - xf)) / xf;
        return src[from + rot + i] * Math.cos(t * Math.PI / 2) + src[from + (i - (head - xf))] * Math.sin(t * Math.PI / 2);
      }
      return src[from + (i - (head - xf))];
    };
    const fade = Math.round(SR * 0.02);
    for (let i = 0; i < len; i += 1) {
      const g = Math.min(1, i / fade, (len - 1 - i) / fade);
      L[i] += Tap(l, i) * g; R[i] += Tap(r, i) * g;
    }
    used.push({ id: stem.id, take: stem.take, sha256: Sha256(file).slice(0, 16) });
  }
  return { L, R, used };
}

function Scatter(variant, L, R, bedRmsDb) {
  const len = L.length, placed = [];
  for (const sc of variant.scatter || []) {
    const rng = Mulberry32(HashString(`ambbed:${variant.key}:${sc.id}`));
    const ratios = sc.pitch || [1];
    const clips = [];
    for (const file of sc.files) for (const ratio of ratios) clips.push({ file, ratio, pcm: PrepareSlice(file, sc, ratio) });
    const rate = sc.perMin / 60;
    const minGap = sc.minGapS ?? 0.25;
    // 事件时刻。默认「分格抖动」：把时间轴切成 round(perMin × 时长) 格、每格随机落一个 —— 个数由配方决定，
    // 不像纯泊松那样在固定种子下 40 s 里可能只抽到 1 个。poisson: true 是指数间隔（枪声成团、时疏时密，B / E 用）。
    const times = [];
    if (sc.poisson ?? variant.poisson) {
      let t = -(sc.tailS ?? 2.5) * rng();
      for (;;) {
        t += Math.max(minGap, -Math.log(1 - rng()) / rate);
        if (t >= variant.durS) break;
        times.push(t);
      }
    } else {
      const from = -(sc.tailS ?? 2.5) * 0.5;
      const n = Math.max(1, Math.round(rate * variant.durS));
      const cell = (variant.durS - from) / n;
      let prev = -1e9;
      for (let k = 0; k < n; k += 1) {
        const t = Math.max(from + (k + rng()) * cell, prev + minGap);
        if (t >= variant.durS) break;
        times.push(t); prev = t;
      }
    }
    let count = 0;
    for (const t of times) {
      const clip = clips[Math.floor(rng() * clips.length)];
      const pan = (sc.pan?.[0] ?? -0.8) + rng() * ((sc.pan?.[1] ?? 0.8) - (sc.pan?.[0] ?? -0.8));
      const jitter = (rng() * 2 - 1) * (sc.jitterDb ?? 3);
      const gain = 10 ** ((bedRmsDb + sc.peakOverBedDb + jitter) / 20);
      const gl = Math.cos((pan + 1) * Math.PI / 4) * gain, gr = Math.sin((pan + 1) * Math.PI / 4) * gain;
      const start = Math.round(t * SR);
      const pcm = clip.pcm;
      for (let i = 0; i < pcm.length; i += 1) {
        const dst = start + i;
        if (dst < 0) continue;
        if (dst >= len) break;
        const edge = Math.min(1, (len - 1 - dst) / (SR * 0.02));
        L[dst] += pcm[i] * gl * edge; R[dst] += pcm[i] * gr * edge;
      }
      count += 1;
      if (Flag("events")) console.log(`    ${variant.key} ${sc.id} @ ${t.toFixed(2)} s  ${path.basename(clip.file)} ×${clip.ratio}  pan ${pan.toFixed(2)}  峰 ${(bedRmsDb + sc.peakOverBedDb + jitter).toFixed(1)} dB`);
    }
    placed.push({ id: sc.id, cue: sc.cue, events: count, files: sc.files, license: sc.license, credit: sc.credit });
  }
  return placed;
}

/** 迭代对齐成品 RMS：编码 → 解码量 → 补差，最多 5 轮。 */
function MasterVariant(variant, chans, outFile) {
  const ceiling = 10 ** (AMB_BED_TARGET.peakCeilingDb / 20);
  const finalChain = [variant.finalHp ? `highpass=f=${variant.finalHp}` : "highpass=f=30",
    variant.finalLp ? `lowpass=f=${variant.finalLp}` : ""].filter(Boolean).join(",");
  const raw = MeasureChans(chans);
  let gainDb = AMB_BED_TARGET.rmsDb - raw.rmsDb;
  let measured = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const filter = `${finalChain},volume=${gainDb.toFixed(3)}dB,alimiter=limit=${ceiling.toFixed(4)}:attack=2:release=60:level=false`;
    EncodeMp3(chans, outFile, { bitrate: AMB_BED_TARGET.bitrate, filter });
    measured = MeasureFile(outFile);
    const miss = AMB_BED_TARGET.rmsDb - measured.rmsDb;
    if (Math.abs(miss) <= 0.15) break;
    gainDb += miss;
  }
  // 限幅器压了多少：母带峰值加增益超出天花板的量（粗算，滤波会让实际略有出入）；超过 3 dB 说明该压一压撒播的峰值。
  const limitedDb = Math.max(0, raw.peakDb + gainDb - AMB_BED_TARGET.peakCeilingDb);
  return { measured, gainDb, limitedDb };
}

function BuildVariant(variant) {
  const len = Math.round(variant.durS * SR);
  const stems = MixStems(variant, len);
  // 撒播电平的参照：默认是底自己的 RMS；底本身只是一层近乎静音的空气（D）时，用配方里写死的 refRmsDb，
  // 否则「相对底」就是相对一片 −65 dBFS 的噪声，单发会被抬到没有意义的量。
  const bedRms = variant.refRmsDb ?? (variant.stems.length ? MeasureChans([stems.L, stems.R]).rmsDb : -30);
  const placed = Scatter(variant, stems.L, stems.R, bedRms);
  const out = path.join(AMB_DIR, variant.file);
  const { measured, gainDb, limitedDb } = MasterVariant(variant, [stems.L, stems.R], out);
  return { out, measured, gainDb, limitedDb, bedRmsDb: bedRms, stems: stems.used, scatter: placed };
}

// ---------------------------------------------------------------------------
// 人声筛查（Script_AmbBedVoiceScreen.py）
// ---------------------------------------------------------------------------
function Screen(files) {
  const list = path.join(takesDir, "_screen_list.txt");
  const out = path.join(takesDir, "VoiceScreen.latest.json");
  fs.mkdirSync(takesDir, { recursive: true });
  fs.writeFileSync(list, files.join("\n") + "\n");
  const result = spawnSync("python", [path.join(HERE, "Script_AmbBedVoiceScreen.py"), "--list", list, "--out", out],
    { cwd: REPO, encoding: "utf8", env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" }, maxBuffer: 1 << 26 });
  process.stdout.write(result.stdout || "");
  if (result.status !== 0) throw new Error(`人声筛查失败：${(result.stderr || "").slice(-400)}`);
  return JSON.parse(fs.readFileSync(out, "utf8"));
}
/** 只重混几条时，其余候选上一次的筛查详情要留着（对比页读 VoiceScreen.json）：把这一轮的结果合并进去。 */
function MergeScreen(fresh) {
  const file = path.join(takesDir, "VoiceScreen.json");
  const old = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  fs.writeFileSync(file, JSON.stringify({ ...old, ...fresh }, null, 1));
}
function ScreenSummary(r) {
  return {
    verdict: r.verdict, vad50S: r.vad.t50.speechS, vad30S: r.vad.t30.speechS, pitchRunS: r.pitch.runS ?? 0,
    confidentWords: r.asr ? r.asr.zh.words.length + r.asr.en.words.length : null,
    tool: "Script_AmbBedVoiceScreen.py（Silero VAD + faster-whisper medium + 基频连续段）",
  };
}

// ---------------------------------------------------------------------------
async function Main() {
  if (Flag("measure")) {
    for (const file of args.filter((a) => !a.startsWith("--"))) {
      const m = MeasureFile(path.resolve(file));
      console.log(`${path.basename(file)}: ${m.seconds.toFixed(2)} s  RMS ${m.rmsDb.toFixed(2)} dBFS  峰 ${m.peakDb.toFixed(2)}  波峰因数 ${m.crestDb.toFixed(1)} dB`);
    }
    return;
  }
  if (Flag("force")) { await RequestTakes(); return; }
  if (Flag("dry")) { console.log("[dry] 混音计划：", AMB_BED_VARIANTS.map((v) => `${v.key} ${v.file}`).join(" | ")); return; }
  if (Flag("page")) { const { BuildComparePage } = await import("./Script_AmbBedComparePage.mjs"); await BuildComparePage({ takesDir, MeasureFile }); return; }

  const only = (Option("variant") || "").split(",").filter(Boolean);
  const variants = AMB_BED_VARIANTS.filter((v) => !only.length || only.includes(v.key));
  if (!variants.length) throw new Error("配方表里没有这条候选");
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  manifest.bedVariants = manifest.bedVariants || {};
  const built = [];
  for (const variant of variants) {
    const r = BuildVariant(variant);
    const size = fs.statSync(r.out).size;
    console.log(`${variant.key} ${variant.file}: ${r.measured.seconds.toFixed(1)} s  RMS ${r.measured.rmsDb.toFixed(2)}  峰 ${r.measured.peakDb.toFixed(2)}  `
      + `波峰因数 ${r.measured.crestDb.toFixed(1)} dB  限幅 ${r.limitedDb.toFixed(1)} dB  ${(size / 1024).toFixed(0)} KB  撒播 ${r.scatter.map((s) => `${s.id}×${s.events}`).join(" ")}`);
    built.push({ variant, r, size });
  }
  let status = 0;
  if (!Flag("no-screen")) {
    const screen = Screen([...built.map((b) => path.relative(REPO, b.r.out)), path.relative(REPO, path.join(AMB_DIR, "AudioAmb_BattleFar.mp3"))]);
    MergeScreen(screen);
    for (const b of built) {
      b.screen = ScreenSummary(screen[path.basename(b.r.out)]);
      if (b.screen.verdict !== "clean") { status = 2; console.warn(`  ${b.variant.key} 人声筛查 ${b.screen.verdict}：按时间点复核（${path.join(takesDir, "VoiceScreen.json")}）`); }
    }
  }
  for (const { variant, r, size, screen } of built) {
    const prev = manifest.bedVariants[variant.key] || {};
    manifest.bedVariants[variant.key] = {
      file: variant.file, seconds: +r.measured.seconds.toFixed(2), channels: 2,
      label: variant.label, style: variant.style,
      rmsDbfs: +r.measured.rmsDb.toFixed(2), peakDbfs: +r.measured.peakDb.toFixed(2), crestDb: +r.measured.crestDb.toFixed(1),
      bytes: size, sha256: Sha256(r.out), bitrate: AMB_BED_TARGET.bitrate,
      credit: variant.credit, license: "mixed", licenses: ["volcengine", "sonniss"],
      stems: r.stems, scatter: r.scatter.map((s) => ({ id: s.id, cue: s.cue, events: s.events, files: s.files, license: s.license, credit: s.credit })),
      voiceScreen: screen || prev.voiceScreen || null,
      recipe: "Script_SeedAudioBattleBedBake.mjs（配方 Data_AmbSources.AMB_BED_VARIANTS）",
    };
  }
  manifest.bedVariants = Object.fromEntries(Object.entries(manifest.bedVariants).sort(([a], [b]) => a.localeCompare(b)));
  manifest.licenses = { ...manifest.licenses, mixed: AMB_LICENSES.mixed };
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`清单 bedVariants：${Object.keys(manifest.bedVariants).join(" ")}`);
  process.exitCode = status;
}

Main().catch((err) => { console.error(err.message || err); process.exit(1); });
