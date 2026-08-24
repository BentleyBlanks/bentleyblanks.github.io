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
    const probe = Probe(file);
    const before = Measure(file, probe);
    const metric = before[group.target.metric];
    const gainDb = group.target.targetDbfs - metric;
    const needsWrite = Math.abs(gainDb) > group.target.toleranceDb || before.peakDbfs > PEAK_CEILING_DBFS + 0.1;
    if (write && needsWrite) Encode(file, probe, gainDb, group.target);
    const after = write ? Measure(file) : before;
    const level = after[group.target.metric];
    const error = level - group.target.targetDbfs;
    const good = Math.abs(error) <= group.target.toleranceDb && after.peakDbfs <= PEAK_CEILING_DBFS + 0.1;
    if (!good && !write) failed = true;
    if (!good && write) failed = true;
    rows.push({ file: path.basename(file), before: metric, after: level, peak: after.peakDbfs, error, good });
  }
  const levels = rows.map((row) => row.after);
  const min = Math.min(...levels);
  const max = Math.max(...levels);
  console.log(`${group.name}: ${rows.length} files, ${group.target.metric} ${min.toFixed(2)}..${max.toFixed(2)} dBFS, spread ${(max - min).toFixed(2)} dB, target ${group.target.targetDbfs} dBFS`);
  if (report || write) {
    for (const row of rows) {
      console.log(`  ${row.good ? "OK" : "FAIL"} ${row.file.padEnd(40)} ${row.before.toFixed(2).padStart(7)} -> ${row.after.toFixed(2).padStart(7)} dBFS  peak ${row.peak.toFixed(2).padStart(6)}`);
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
