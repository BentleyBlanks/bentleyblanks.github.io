// 第一关配乐重配候选：火山引擎 SeedAudio 1.0 生成 → 与现行九首同一电平口径打包（Data_FirstLevelScoreRedesign）。
//
//   node Taierzhuang1938/Script_FirstLevelScoreRedesignBake.mjs                 只打包已有原始 take（缺的才生成）
//   node Taierzhuang1938/Script_FirstLevelScoreRedesignBake.mjs --only=AirRaid --force   重掷指定曲目
//   node Taierzhuang1938/Script_FirstLevelScoreRedesignBake.mjs --dry           只列计划
//
// 密钥只从 VOLCENGINE_API_KEY 读；原始 take 留在系统临时目录（重掷不可复现，打包默认只拿存下的 take）。
// 电平与现行九首一致：RMS −27 dBFS、峰值不过 −3 dBFS，44.1 kHz 双声道；编码 128 kbps。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SCORE_REDESIGN_CUES, SCORE_REDESIGN_VERSION, SCORE_REDESIGN_DIR } from "./Data_FirstLevelScoreRedesign.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const apiUrl = "https://openspeech.bytedance.com/api/v3/tts/create";
const model = "seed-audio-1.0";
const rawDir = path.join(os.tmpdir(), "Taierzhuang1938ScoreRedesign");
const outputDir = path.join(here, SCORE_REDESIGN_DIR);
const manifestFile = path.join(outputDir, "Data_ScoreRedesignManifest.json");
const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const force = process.argv.includes("--force"), dry = process.argv.includes("--dry");
const only = arg("only")?.split(",");
const concurrency = Math.max(1, Number(arg("concurrency")) || 3);
if (only?.some(id => !SCORE_REDESIGN_CUES[id])) throw new Error(`未知曲目：${only.filter(id => !SCORE_REDESIGN_CUES[id]).join(",")}`);
const cues = Object.values(SCORE_REDESIGN_CUES).filter(cue => !only || only.includes(cue.id));
const Hash = data => crypto.createHash("sha256").update(data).digest("hex");
const RawFile = cue => path.join(rawDir, `AudioRaw_${cue.id}.mp3`);
const RawMeta = cue => path.join(rawDir, `AudioRaw_${cue.id}.json`);

function Run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${command}: ${result.stderr.slice(-1200)}`);
  return result;
}
function Measure(file) {
  const out = Run("ffmpeg", ["-hide_banner", "-i", file, "-af", "volumedetect", "-f", "null", "-"]).stderr;
  return { rmsDbfs: Number(out.match(/mean_volume: ([-\d.]+)/)?.[1]), peakDbfs: Number(out.match(/max_volume: ([-\d.]+)/)?.[1]) };
}
const Duration = file => Number(Run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).stdout);

async function Generate(cue) {
  const apiKey = process.env.VOLCENGINE_API_KEY;
  if (!apiKey) throw new Error("缺少 VOLCENGINE_API_KEY；密钥只能通过环境变量提供，禁止写进仓库。");
  for (let attempt = 1; ; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 600_000);
      let response;
      try {
        response = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
          body: JSON.stringify({ model, text_prompt: cue.prompt, watermark: {},
            audio_config: { format: "mp3", sample_rate: 48000, pitch_rate: 0, speech_rate: 0, loudness_rate: 0 } }),
          signal: controller.signal,
        });
      } finally { clearTimeout(timer); }
      const body = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}：${body.slice(0, 240)}`);
      const payload = JSON.parse(body);
      if (typeof payload.audio !== "string") throw new Error(`没有返回 audio：${String(payload.message || payload.error || "").slice(0, 240)}`);
      const audio = Buffer.from(payload.audio, "base64");
      if (audio.length < 64 * 1024) throw new Error(`返回的音频过小（${audio.length} bytes）`);
      fs.mkdirSync(rawDir, { recursive: true });
      fs.writeFileSync(RawFile(cue), audio);
      fs.writeFileSync(RawMeta(cue), JSON.stringify({ generatedAt: new Date().toISOString(), promptSha256: Hash(cue.prompt) }));
      return;
    } catch (error) {
      if (attempt >= 3) throw new Error(`${cue.id} 生成失败：${error.message}`);
      console.warn(`${cue.id} 第 ${attempt} 次失败（${error.message}），重试`);
    }
  }
}

function Package(cue) {
  const raw = RawFile(cue), source = fs.readFileSync(raw);
  const measured = Measure(raw), gainDb = Math.min(-27 - measured.rmsDbfs, -3 - measured.peakDbfs);
  const file = path.join(here, cue.file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  Run("ffmpeg", ["-y", "-v", "error", "-i", raw, "-map_metadata", "-1", "-af", `volume=${gainDb.toFixed(2)}dB`,
    "-ac", "2", "-ar", "44100", "-b:a", "128k", file]);
  const result = Measure(file), seconds = Duration(file);
  if (seconds < 30) throw new Error(`${cue.id} 只有 ${seconds.toFixed(1)} s，不像一首曲子`);
  const meta = fs.existsSync(RawMeta(cue)) ? JSON.parse(fs.readFileSync(RawMeta(cue), "utf8")) : {};
  return { file: path.basename(file), title: cue.title, role: cue.role, refs: cue.refs, scene: cue.scene,
    bpm: cue.bpm, key: cue.key, seconds, bytes: fs.statSync(file).size, sha256: Hash(fs.readFileSync(file)),
    sourceSha256: Hash(source), sourceGeneratedAt: meta.generatedAt ?? null,
    promptMatches: meta.promptSha256 ? meta.promptSha256 === Hash(cue.prompt) : null,
    prompt: cue.prompt, gainDb: Number(gainDb.toFixed(2)), ...result };
}

async function Main() {
  if (dry) { for (const cue of cues) console.log(`${cue.id} 《${cue.title}》 ${fs.existsSync(RawFile(cue)) ? "有原始 take" : "需要生成"} → ${cue.file}`); return; }
  const queue = cues.filter(cue => force || !fs.existsSync(RawFile(cue)));
  const failed = [];
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    for (let cue; (cue = queue.shift());) {
      const t0 = Date.now();
      try { await Generate(cue); console.log(`生成 ${cue.id} ${((Date.now() - t0) / 1000).toFixed(0)} s`); }
      catch (error) { failed.push(cue.id); console.error(error.message); }
    }
  }));
  const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, "utf8"))
    : { model, provider: "Volcengine", terms: "Generated recordings are subject to Volcengine service terms",
      sampleRate: 44100, normalization: { metric: "rmsDbfs", targetDbfs: -27, peakCeilingDbfs: -3 }, cues: {} };
  manifest.version = SCORE_REDESIGN_VERSION;
  for (const cue of cues) {
    if (!fs.existsSync(RawFile(cue))) continue;
    manifest.cues[cue.id] = Package(cue);
    const c = manifest.cues[cue.id];
    console.log(`打包 ${cue.id}《${cue.title}》 ${c.seconds.toFixed(1)} s RMS ${c.rmsDbfs} peak ${c.peakDbfs}`);
  }
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
  if (failed.length) { console.error(`失败：${failed.join(",")}`); process.exitCode = 1; }
}

Main().catch(error => { console.error(error.message); process.exitCode = 1; });
