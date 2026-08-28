// Align the native level of every deployed non-dialogue audio asset.
//
//   node Taierzhuang1938/Script_AudioNormalize.mjs --report
//   node Taierzhuang1938/Script_AudioNormalize.mjs --write
//   node Taierzhuang1938/Script_AudioNormalize.mjs
//
// Short one-shots use 20 ms active RMS so leading/trailing silence and decay length do not
// make an otherwise identical impact look quieter. Continuous beds and music use whole-file
// RMS. Runtime distance, cue importance, ambience layers and music levels remain in
// Script_Audio.mjs; source files must not carry those mix decisions.
//
// EXEMPTIONS (see the table below) carry a per-file target for takes whose level is a human
// decision rather than a missing pass. They are still verified — against their own metric and
// target — but never rewritten, not even under --write.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ffmpeg = process.env.FFMPEG || "ffmpeg";
const ffprobe = process.env.FFPROBE || ffmpeg.replace(/ffmpeg(?:\.exe)?$/i, (value) => value.replace(/ffmpeg/i, "ffprobe"));
const write = process.argv.includes("--write");
const report = process.argv.includes("--report");

const TARGETS = Object.freeze({
  oneShot: { metric: "activeRmsDbfs", targetDbfs: -25, toleranceDb: 0.5 },
  continuous: { metric: "rmsDbfs", targetDbfs: -27, toleranceDb: 0.5 },
});

// 逐文件豁免：**这几条成品的响度是人工定的，不许被这只脚本拉平。**
//
// 白刃三音（挥空 3 变体 + 砍中 + 刺中）是 2026-08-26 人工试听选定的 SeedAudio take，
// 由 Script_SeedAudioMeleeBake.mjs 单独烘，烘焙期就按它自己的一套口径压过一道：
// **整段 RMS −28.5 dBFS**（TARGET_RMS_DB）外加一道 −6 dBFS 的峰值保险。
// 那不是漏掉的一步，是一条设计决定（docs/Data_AudioAssets.md
// 「白刃三音为什么是生成的，不是实录的」）：
//   · 这几条 take 从模型出来就比库里其它音「实」得多 —— 波峰因数 13—17 dB，
//     而实录冲击音是 19—27。按同一条平线对齐的话，**白刃一出手就盖住整场枪声**；
//   · 而 `Script_Audio.SAMPLE_MIX` 里那几个数是照旧素材（Sonniss 顶包）调的。
//     压到全库中位 −28.5 之后 SAMPLE_MIX 一个数都不用动，运行时配平原样成立。
// 换句话说：库线（有声段 RMS −25）管的是「没人挑过的音」；挑过的音走人工那一档。
// 这与 `SAMPLE_CYCLE`（挑过的变体按顺序轮播、不做逐发变调）是同一条规矩：
// **不许拿概率或平均值去糊人工选定的东西。**
//
// 注意豁免换的是**两件事**：目标从 −25 换成 −28.5，量法从「有声段 RMS（20 ms 帧、
// 门限取最响帧的 10%）」换成「整段 RMS」。只换目标不换量法是量错的 ——
// 白刃这几条是短促冲击音，两种量法在它们身上差 2—3 dB（实测有声段 −25.5…−28.5、
// 整段 −28.40…−28.56），拿有声段去对 −28.5 会把三条本来合格的判成红。
//
// 豁免不等于不验：容差 ±0.5 与 −1 dBFS 的峰值上限照旧走，五条现在落在
// −28.40…−28.56，散布 0.16 dB —— 谁把它们重烘成别的响度，这只脚本照样红。
// 要撤销豁免，先撤销 docs 里那条设计决定，别从这张表下手。
const EXEMPT_DBFS_MELEE = -28.5;
const MELEE_EXEMPT_WHY = "人工选定的白刃 take：整段 RMS −28.5 dBFS（Script_SeedAudioMeleeBake 的口径）";
const EXEMPTIONS = new Map([
  "AudioSfx_DadaoSwing_01.mp3", "AudioSfx_DadaoSwing_02.mp3", "AudioSfx_DadaoSwing_03.mp3",
  "AudioSfx_DadaoHit_01.mp3", "AudioSfx_BayonetHit_01.mp3",
].map((file) => [file, { metric: "rmsDbfs", targetDbfs: EXEMPT_DBFS_MELEE, why: MELEE_EXEMPT_WHY }]));

const PEAK_CEILING_DBFS = -1;
const PROCESS_LIMIT_DBFS = -1.5; // Leave MP3 reconstruction headroom for the -1 dBFS decoded ceiling.
const MAX_BUFFER = 384 * 1024 * 1024;

function Run(command, args, options = {}) {
  const result = spawnSync(command, args, { ...options, maxBuffer: MAX_BUFFER });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString("utf8") : String(result.stderr || "");
    throw new Error(`${path.basename(command)} failed (${result.status}): ${stderr.slice(-1200)}`);
  }
  return result;
}

function Probe(file) {
  const result = Run(ffprobe, ["-v", "error", "-select_streams", "a:0", "-show_entries",
    "stream=sample_rate,channels,bit_rate:format=duration,bit_rate", "-of", "json", file], { encoding: "utf8" });
  const parsed = JSON.parse(result.stdout);
  const stream = parsed.streams?.[0] || {};
  return {
    sampleRate: Number(stream.sample_rate) || 44100,
    channels: Number(stream.channels) || 1,
    bitRate: Number(stream.bit_rate) || Number(parsed.format?.bit_rate) || 72000,
    duration: Number(parsed.format?.duration) || 0,
  };
}

function Measure(file, probe = Probe(file)) {
  const decoded = Run(ffmpeg, ["-v", "error", "-i", file, "-map", "0:a:0", "-f", "f32le", "-acodec", "pcm_f32le", "-"]);
  const pcm = decoded.stdout;
  const sampleCount = Math.floor(pcm.length / 4);
  if (!sampleCount) throw new Error(`No decoded samples: ${file}`);

  let sum = 0;
  let peak = 0;
  const frameSamples = Math.max(probe.channels, Math.round(probe.sampleRate * 0.02) * probe.channels);
  const frameRms = [];
  for (let frameStart = 0; frameStart < sampleCount; frameStart += frameSamples) {
    const frameEnd = Math.min(sampleCount, frameStart + frameSamples);
    let frameSum = 0;
    for (let i = frameStart; i < frameEnd; i += 1) {
      const value = pcm.readFloatLE(i * 4);
      const square = value * value;
      sum += square;
      frameSum += square;
      peak = Math.max(peak, Math.abs(value));
    }
    frameRms.push(Math.sqrt(frameSum / Math.max(1, frameEnd - frameStart)));
  }
  // Gate against the loudest 20 ms frame, not a single-sample peak. A dropped shell casing can
  // have a one-sample transient far above every frame RMS; using that spike as the gate would
  // classify the entire clip as silence.
  const loudestFrame = Math.max(...frameRms);
  const active = frameRms.filter((value) => value >= loudestFrame * 0.1);
  const activeSquare = active.reduce((total, value) => total + value * value, 0);
  const Db = (value) => 20 * Math.log10(Math.max(1e-12, value));
  return {
    rmsDbfs: Db(Math.sqrt(sum / sampleCount)),
    activeRmsDbfs: Db(Math.sqrt(activeSquare / Math.max(1, active.length))),
    peakDbfs: Db(peak),
    activeFrames: active.length,
  };
}

function ManifestFiles(manifestPath, section, key) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const directory = path.dirname(manifestPath);
  const files = [];
  for (const entry of Object.values(manifest[section] || {})) {
    for (const file of entry.files || (entry.file ? [entry.file] : [])) files.push(path.join(directory, file));
  }
  return { manifestPath, manifest, key, files: [...new Set(files)] };
}

const sfxManifest = path.join(here, "Audio", "Sfx", "Data_SfxManifest.json");
const ambManifest = path.join(here, "Audio", "Amb", "Data_AmbManifest.json");
const musicManifest = path.join(here, "Audio", "Music", "Data_MusicManifest.json");
const ambCues = ManifestFiles(ambManifest, "cues", "ambCues");
const ambBeds = ManifestFiles(ambManifest, "beds", "ambBeds");
// Both groups stamp the same in-memory manifest. Parsing twice and keeping the last object would
// silently discard the cue normalization metadata when the beds are written.
ambBeds.manifest = ambCues.manifest;
const groups = [
  { name: "SFX", target: TARGETS.oneShot, ...ManifestFiles(sfxManifest, "cues", "sfx") },
  { name: "Ambience cues", target: TARGETS.oneShot, ...ambCues },
  { name: "Ambience beds", target: TARGETS.continuous, ...ambBeds },
  { name: "Music", target: TARGETS.continuous, ...ManifestFiles(musicManifest, "cues", "music") },
];

function Encode(file, probe, initialGainDb, target) {
  const extension = path.extname(file).toLowerCase();
  if (extension !== ".mp3") throw new Error(`Unsupported deployed audio format: ${file}`);
  const temp = `${file}.normalized.mp3`;
  const bitRateK = Math.max(32, Math.round(probe.bitRate / 1000));
  let gainDb = initialGainDb;
  let lastAfter = null;
  try {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const limit = Math.pow(10, PROCESS_LIMIT_DBFS / 20).toFixed(8);
      const filter = `volume=${gainDb.toFixed(4)}dB,alimiter=limit=${limit}:attack=2:release=50:level=false`;
      Run(ffmpeg, ["-y", "-v", "error", "-i", file, "-map_metadata", "0", "-af", filter,
        "-ac", String(probe.channels), "-ar", String(probe.sampleRate), "-b:a", `${bitRateK}k`, temp]);
      const afterProbe = Probe(temp);
      if (Math.abs(afterProbe.duration - probe.duration) > 0.08) {
        throw new Error(`${path.basename(file)} duration changed ${probe.duration.toFixed(3)} -> ${afterProbe.duration.toFixed(3)}s`);
      }
      const after = Measure(temp, afterProbe);
      lastAfter = after;
      const error = target.targetDbfs - after[target.metric];
      if (Math.abs(error) <= target.toleranceDb && after.peakDbfs <= PEAK_CEILING_DBFS + 0.1) {
        fs.renameSync(temp, file);
        return;
      }
      // Always render the next attempt from the untouched source, so retries never stack lossy
      // MP3 generations. The correction compensates for energy removed by the peak limiter.
      gainDb += Math.max(-4, Math.min(4, error));
    }
    throw new Error(`${path.basename(file)} could not reach ${target.targetDbfs} dBFS without exceeding the peak ceiling`
      + ` (last ${lastAfter?.[target.metric].toFixed(2)} dBFS, peak ${lastAfter?.peakDbfs.toFixed(2)} dBFS)`);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

function StampManifests() {
  const now = new Date();
  const normalizedAt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  const common = { normalizedAt, tool: "Script_AudioNormalize.mjs", peakCeilingDbfs: PEAK_CEILING_DBFS };
  const Meta = (target) => ({ ...common, metric: target.metric, targetDbfs: target.targetDbfs, toleranceDb: target.toleranceDb });
  for (const group of groups) {
    const manifest = group.manifest;
    if (group.key === "sfx") manifest.normalization = Meta(group.target);
    else if (group.key === "music") manifest.normalization = Meta(group.target);
    else {
      manifest.normalization ||= {};
      manifest.normalization[group.key === "ambCues" ? "cues" : "beds"] = Meta(group.target);
    }
  }
  const unique = new Map(groups.map((group) => [group.manifestPath, group.manifest]));
  for (const [manifestPath, manifest] of unique) {
    const original = fs.readFileSync(manifestPath, "utf8");
    const indent = /^\{\r?\n( +)"/.exec(original)?.[1] || "  ";
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, indent) + "\n");
  }
}

let failed = false;
for (const group of groups) {
  const rows = [];
  for (const file of group.files) {
    if (!fs.existsSync(file)) throw new Error(`Manifest file is missing: ${file}`);
    // 豁免只换目标，不换量法：同一条有声段 RMS、同一道峰值上限。
    // 它把「已经是对的」和「还没对齐」分开，而不是把这几条移出验收。
    const exempt = EXEMPTIONS.get(path.basename(file)) || null;
    const target = exempt
      ? { ...group.target, metric: exempt.metric || group.target.metric, targetDbfs: exempt.targetDbfs }
      : group.target;
    const probe = Probe(file);
    const before = Measure(file, probe);
    const metric = before[target.metric];
    const gainDb = target.targetDbfs - metric;
    const needsWrite = Math.abs(gainDb) > target.toleranceDb || before.peakDbfs > PEAK_CEILING_DBFS + 0.1;
    // **豁免的文件一个字节都不碰**：它们的电平是人工定的，--write 也不许覆盖。
    if (write && needsWrite && !exempt) Encode(file, probe, gainDb, target);
    const after = write && !exempt ? Measure(file) : before;
    const level = after[target.metric];
    const error = level - target.targetDbfs;
    const good = Math.abs(error) <= target.toleranceDb && after.peakDbfs <= PEAK_CEILING_DBFS + 0.1;
    if (!good) failed = true;
    rows.push({ file: path.basename(file), before: metric, after: level, peak: after.peakDbfs, error, good,
      exempt, target: target.targetDbfs, metric: target.metric });
  }
  // 统计只算走库线的那些：把人工那一档混进来的话，「散布」量的是两条平线的间距，
  // 不是任何一条线自己有多齐 —— 那个数没有意义，还会掩盖真正的走样。
  const onLine = rows.filter((row) => !row.exempt);
  const levels = (onLine.length ? onLine : rows).map((row) => row.after);
  const min = Math.min(...levels);
  const max = Math.max(...levels);
  const exemptCount = rows.length - onLine.length;
  console.log(`${group.name}: ${rows.length} files, ${group.target.metric} ${min.toFixed(2)}..${max.toFixed(2)} dBFS, spread ${(max - min).toFixed(2)} dB, target ${group.target.targetDbfs} dBFS`
    + (exemptCount ? `（另有 ${exemptCount} 个按人工档验收，不计入散布）` : ""));
  if (report || write) {
    for (const row of rows) {
      const flag = row.good ? (row.exempt ? "EXEM" : "OK  ") : "FAIL";
      console.log(`  ${flag} ${row.file.padEnd(40)} ${row.before.toFixed(2).padStart(7)} -> ${row.after.toFixed(2).padStart(7)} dBFS  peak ${row.peak.toFixed(2).padStart(6)}`
        + (row.exempt ? `  ← 人工档 ${row.metric} ${row.target} dBFS：${row.exempt.why}` : ""));
    }
  }
}

if (write && !failed) StampManifests();
if (failed) {
  console.error(write ? "Audio normalization verification failed." : "Audio assets are not normalized. Run with --write.");
  process.exitCode = 1;
} else {
  console.log(write ? "Audio assets normalized and manifests stamped." : "Audio native levels are aligned.");
}
