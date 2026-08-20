// 音乐烘焙：生成的整首曲子 → 一段可循环的 → Audio/Music/*.mp3 + 清单。
//
// 用法：
//   node Taierzhuang1938/Script_MusicBake.mjs           # 切（原曲要在 Audio/Music/_raw/）
//   node Taierzhuang1938/Script_MusicBake.mjs --gen     # 缺的生成曲先去本机网关生成再切
//   node Taierzhuang1938/Script_MusicBake.mjs --fetch   # 缺的 CC0 下载曲先从登记地址下载再切
//   node Taierzhuang1938/Script_MusicBake.mjs --report  # 只打候选段落表，不落文件
//   node Taierzhuang1938/Script_MusicBake.mjs Charge    # 只烘这一条
//
// 提示词与选段规则在 Data_MusicSources.mjs。--gen 要 MiniMax Hub 那个应用开着
// （网关是跟着它活的），一条 20 credits。
//
// ## 为什么要切
// 生成回来的是一整首 80—420 秒、有起承转合的曲子；游戏里要的是**一段能一直
// 循环下去的**。直接整首放进去有两个问题：一是文件大（一首 4—13 MB），
// 二是曲子走到高潮时玩家可能正在装弹 —— 音乐的情绪和玩家的处境对不上，
// 比没有音乐更出戏。切一段稳定的循环，把「什么时候起、什么时候停」交给游戏。
//
// ## 怎么挑
//   sparse —— 峰值比中位高得多（留白多）、起音少。独奏、菜单、结局用。
//   steady —— 电平方差最小。要垫在枪炮底下、不能有起伏的那两条用。
// 两种打分都只看包络，不看内容 —— 我听不见，能算的才作数。

import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { MUSIC_SOURCES, MUSIC_LICENSE } from "./Data_MusicSources.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(HERE, "Audio", "Music");
const RAW_DIR = path.join(OUT_DIR, "_raw");
const MANIFEST = path.join(OUT_DIR, "Data_MusicManifest.json");

const FFMPEG = process.env.FFMPEG || "ffmpeg";
const SR = 44100;
// 音乐是这三个包里最占体积的一份。72k 立体声：一段 50 秒约 450 KB，
// 五段合起来 2 MB 出头 —— 再高就该考虑按关卡懒加载了。
const BITRATE = "72k";
const GATEWAY = process.env.MINIMAX_HUB || "http://127.0.0.1:8001";
const HOP_S = 0.05;

// ---------------------------------------------------------------------------
function Generate(src, rawFile) {
  const body = path.join(RAW_DIR, `_req_${src.id}.json`);
  fs.writeFileSync(body, JSON.stringify({
    backend: "minimax_music",
    filename: `tzz_bake_${src.id}`,
    prompt: src.prompt,
    params: { is_instrumental: "instrumental" },
  }));
  const out = execFileSync("curl", ["-sS", "-m", "900", "-X", "POST",
    GATEWAY + "/api/generate/music", "-H", "Content-Type: application/json",
    "-d", "@" + body], { encoding: "utf8", maxBuffer: 1 << 24 });
  fs.rmSync(body, { force: true });
  let res;
  try { res = JSON.parse(out); } catch (err) { throw new Error("网关返回的不是 JSON：" + out.slice(0, 200)); }
  if (!res.ok) throw new Error(res.error || res.user_message || "生成失败");
  // 网关把文件落在自己的工作区，拿它的路径拷回 _raw/。
  const ws = JSON.parse(execFileSync("curl", ["-sS", "-m", "20", GATEWAY + "/api/workspace"], { encoding: "utf8" }));
  const from = path.join(ws.dir, res.path);
  fs.copyFileSync(from, rawFile);
  return res.duration;
}

function Download(src, rawFile) {
  execFileSync("curl", ["-L", "--fail", "--silent", "--show-error", "--max-time", "180",
    "-o", rawFile, src.downloadUrl], { maxBuffer: 1 << 24 });
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

function Envelope(pcm) {
  const hop = Math.round(SR * HOP_S);
  const frames = Math.floor(pcm.length / hop);
  const rms = new Float32Array(frames);
  for (let f = 0; f < frames; f += 1) {
    let s = 0;
    for (let i = 0; i < hop; i += 1) { const v = pcm[f * hop + i]; s += v * v; }
    rms[f] = Math.sqrt(s / hop);
  }
  const db = new Float32Array(frames);
  for (let f = 0; f < frames; f += 1) db[f] = 20 * Math.log10(rms[f] + 1e-9);
  // 起音：包络的正向差分，够陡才算
  const onset = new Uint8Array(frames);
  const sorted = Float32Array.from(rms).sort();
  const peak = sorted[sorted.length - 1] || 1e-4;
  for (let f = 2; f < frames; f += 1) {
    if (rms[f] > peak * 0.12 && rms[f] > rms[f - 1] * 1.6 && rms[f - 1] >= rms[f - 2]) onset[f] = 1;
  }
  return { db, onset, hop, frames };
}

function ScoreWindow(db, onset, from, to, mood) {
  const n = to - from;
  let mean = 0;
  for (let i = from; i < to; i += 1) mean += db[i];
  mean /= n;
  let varsum = 0;
  for (let i = from; i < to; i += 1) { const d = db[i] - mean; varsum += d * d; }
  const std = Math.sqrt(varsum / n);
  const seg = Float32Array.from(db.slice(from, to)).sort();
  const med = seg[Math.floor(n / 2)];
  const p95 = seg[Math.floor(n * 0.95)];
  let hits = 0;
  for (let i = from; i < to; i += 1) hits += onset[i];
  const perMin = hits / (n * HOP_S / 60);
  const crest = p95 - med;
  const score = mood === "steady"
    ? -std
    // 留白多 = 峰值比中位高、起音少。两项都归一到 dB 量级再加，权重是试出来的：
    // 只看 crest 会挑到「一记大声 + 一片静音」，只看起音会挑到整段最弱的地方。
    : crest * 0.5 - perMin * 0.05;
  return { score, std, crest, med, perMin };
}

function PickWindow(mono, src, report) {
  const { db, onset, hop, frames } = Envelope(mono);
  const winFrames = Math.round(src.durS / HOP_S);
  if (frames <= winFrames + 20) throw new Error(`原曲只有 ${(mono.length / SR).toFixed(1)} s，装不下 ${src.durS} s`);
  const step = Math.max(1, Math.round(1.0 / HOP_S));
  const cands = [];
  for (let f = 0; f + winFrames <= frames; f += step) {
    cands.push({ atS: (f * hop) / SR, ...ScoreWindow(db, onset, f, f + winFrames, src.mood) });
  }
  cands.sort((a, b) => b.score - a.score);
  if (report) {
    console.log(`    候选（共 ${cands.length}，挑法 ${src.mood}）：`);
    for (const c of cands.slice(0, 6)) {
      console.log(`      ${c.atS.toFixed(1).padStart(6)}s  分 ${c.score.toFixed(2).padStart(7)}  方差 ${c.std.toFixed(2)}  峰突 ${c.crest.toFixed(1)}  起音/分 ${c.perMin.toFixed(0)}`);
    }
  }
  if (src.atS != null) return cands.find((c) => Math.abs(c.atS - src.atS) < 0.75) || { atS: src.atS };
  return cands[0];
}

// ---------------------------------------------------------------------------
async function Main() {
  const argv = process.argv.slice(2);
  const report = argv.includes("--report");
  const gen = argv.includes("--gen");
  const fetchExternal = argv.includes("--fetch");
  const only = argv.filter((a) => !a.startsWith("--"));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(RAW_DIR, { recursive: true });

  const manifest = { generated: "Script_MusicBake.mjs", sampleRate: SR, cues: {}, license: MUSIC_LICENSE };
  const list = MUSIC_SOURCES.filter((s) => !only.length || only.includes(s.id));
  let bytes = 0;
  const failures = [];

  for (const src of list) {
    const rawFile = path.join(RAW_DIR, `${src.id}.${src.rawExt || "mp3"}`);
    console.log(`\n[${src.id}] → ${src.cue}`);
    try {
      if (!fs.existsSync(rawFile)) {
        if (src.downloadUrl) {
          if (!fetchExternal) { console.log("  跳过（_raw 里没有下载曲；要下载加 --fetch）"); continue; }
          Download(src, rawFile);
          console.log(`  下载 ${src.source && src.source.title ? src.source.title : src.id}`);
        } else {
          if (!gen) { console.log("  跳过（_raw 里没有生成曲；要生成加 --gen）"); continue; }
          const d = Generate(src, rawFile);
          console.log(`  生成 ${d.toFixed(1)} s`);
        }
      }
      const mono = DecodeMono(rawFile);
      const win = PickWindow(mono, src, report);
      console.log(`  取 ${win.atS.toFixed(1)}s + ${src.durS}s`
        + (win.std != null ? `（方差 ${win.std.toFixed(2)} dB，峰突 ${win.crest.toFixed(1)} dB，起音 ${win.perMin.toFixed(0)}/分）` : ""));
      if (report) continue;

      const file = `AudioMusic_${src.id}.mp3`;
      const outFile = path.join(OUT_DIR, file);
      // 切、淡入淡出、按响度对齐，一趟 ffmpeg 走完。
      // afade 的淡出要用 st= 指定绝对起点（相对切完之后的时间轴）。
      const fade = src.fadeS;
      const filters = [
        `afade=t=in:st=0:d=${fade}`,
        `afade=t=out:st=${(src.durS - fade).toFixed(3)}:d=${fade}`,
        // loudnorm 太慢且会改动态；音乐这边按 RMS 对齐就够，用 volumedetect 的替代品：
        // 先测再乘一次（下面单独跑一趟 volumedetect）。
      ];
      // 量一下这一段的平均电平，好算要推多少。
      // volumedetect 把结果写在 **stderr** 上，不是 stdout；
      // 拿 execFileSync 接回来的是空串，正则匹不上就会静静地退到默认值
      // （第一版就是这么翻的：五段全报「原段 -20.0 dBFS」）。
      const probe = spawnSync(FFMPEG, ["-v", "info", "-ss", String(win.atS), "-t", String(src.durS),
        "-i", rawFile, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 1 << 24 });
      const mean = /mean_volume:\s*(-?[\d.]+) dB/.exec(probe.stderr || "");
      if (!mean) throw new Error("volumedetect 没读到平均电平，不能带着默认值往下走");
      const meanDb = Number(mean[1]);
      const gainDb = src.rms - meanDb;
      filters.unshift(`volume=${gainDb.toFixed(2)}dB`);

      execFileSync(FFMPEG, ["-y", "-v", "error", "-ss", String(win.atS), "-t", String(src.durS),
        "-i", rawFile, "-af", filters.join(","), "-ac", "2", "-ar", String(SR), "-b:a", BITRATE, outFile]);
      const size = fs.statSync(outFile).size;
      bytes += size;
      manifest.cues[src.cue] = {
        file, seconds: +src.durS.toFixed(2),
        source: src.source || { title: src.id, license: MUSIC_LICENSE.name },
      };
      console.log(`    → ${file}  ${(size / 1024).toFixed(1)} KB  推了 ${gainDb.toFixed(1)} dB（原段 ${meanDb.toFixed(1)} dBFS）`);
    } catch (err) {
      console.error(`  失败：${err.message}`);
      failures.push({ id: src.id, message: err.message });
    }
  }

  if (report) return;
  if (only.length && fs.existsSync(MANIFEST)) {
    const old = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
    manifest.cues = { ...old.cues, ...manifest.cues };
  }
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
  console.log(`\n清单：${Object.keys(manifest.cues).length} 段，共 ${(bytes / 1024).toFixed(0)} KB`);
  if (failures.length) {
    console.log("\n失败：");
    for (const f of failures) console.log(`  ${f.id}：${f.message}`);
    process.exitCode = 1;
  }
}

Main().catch((err) => { console.error(err); process.exit(1); });
