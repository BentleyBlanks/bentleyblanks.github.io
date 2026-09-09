// Rebuild distance variants from the two user-approved SeedAudio takes (2026-09-10).
// Default inputs are the deployed near files, preserved byte-for-byte. No API calls.
// --source-dir=<directory> imports the approved audition filenames instead.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SFX_LICENSES } from "./Data_SfxSources.mjs";

const outputDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "Audio/Sfx");
const stagedDir = path.join(outputDir, "_raw/ApprovedExplosions20260910");
const sourceDir = process.argv.find((arg) => arg.startsWith("--source-dir="))?.slice(13);
const ffmpeg = process.env.FFMPEG || "ffmpeg";
const takes = [
  { name: "Punch", sha256: "eab820624f286d3c06a0918691c3c5c1b6dddaa531eb403f352d6ce0452e2d1f" },
  { name: "Heavy", sha256: "aef8b5d89aa24173f75d0e3d11a5e9b59eaac6507440709ecc9586941edc03a4" },
];
const bands = [{ name: "Near", lp: 0 }, { name: "Mid", lp: 5000 }, { name: "Far", lp: 2200 }];
function Decode(file, filter) {
  return execFileSync(ffmpeg, ["-v", "error", "-i", file, ...(filter ? ["-af", filter] : []),
    "-ac", "1", "-ar", "44100", "-f", "f32le", "-"], { maxBuffer: 32 * 1024 * 1024 });
}
function Measure(pcm) {
  let peak = 0;
  const frames = [];
  for (let start = 0; start < pcm.length; start += 882 * 4) {
    let sum = 0;
    const end = Math.min(pcm.length, start + 882 * 4);
    for (let i = start; i < end; i += 4) {
      const value = pcm.readFloatLE(i);
      peak = Math.max(peak, Math.abs(value)); sum += value * value;
    }
    frames.push(Math.sqrt(sum / ((end - start) / 4)));
  }
  const active = frames.filter((value) => value >= Math.max(...frames) * 0.1);
  return { peakDbfs: 20 * Math.log10(peak),
    activeRmsDbfs: 10 * Math.log10(active.reduce((sum, value) => sum + value * value, 0) / active.length),
    seconds: pcm.length / 4 / 44100 };
}
function Main() {
  const inputs = takes.map((take, index) => {
    const file = sourceDir ? path.join(sourceDir, `AudioSfx_Explosion${take.name}_01.mp3`)
      : path.join(outputDir, `AudioSfx_ExplosionNear_0${index + 1}.mp3`);
    if (createHash("sha256").update(fs.readFileSync(file)).digest("hex") !== take.sha256)
      throw new Error(`Approved source hash mismatch: ${file}`);
    return file;
  });
  fs.mkdirSync(stagedDir, { recursive: true });
  const results = [];
  for (const band of bands) for (const [index, input] of inputs.entries()) {
    const file = `AudioSfx_Explosion${band.name}_0${index + 1}.mp3`;
    const staged = path.join(stagedDir, file);
    if (!band.lp) fs.copyFileSync(input, staged);
    else {
      const filter = `lowpass=f=${band.lp}`;
      const initial = Measure(Decode(input, filter));
      let gain = Math.min(-25 - initial.activeRmsDbfs, -3.1 - initial.peakDbfs);
      for (let attempt = 0; attempt < 4; attempt++) {
        execFileSync(ffmpeg, ["-y", "-v", "error", "-i", input, "-af", `${filter},volume=${gain}dB`,
          "-ac", "1", "-ar", "44100", "-b:a", "192k", staged]);
        const level = Measure(Decode(staged));
        if (Math.abs(level.activeRmsDbfs + 25) <= 0.3 && level.peakDbfs <= -3) break;
        gain += Math.min(-25 - level.activeRmsDbfs, -3.1 - level.peakDbfs);
      }
    }
    const level = Measure(Decode(staged));
    if (!Number.isFinite(level.activeRmsDbfs) || Math.abs(level.activeRmsDbfs + 25) > 0.5 || level.peakDbfs > -3)
      throw new Error(`Loudness/peak gate failed: ${file}`);
    results.push({ file, cue: `explosion${band.name}`, source: takes[index].name,
      sourceSha256: takes[index].sha256, lowpassHz: band.lp, ...level });
  }
  const manifestPath = path.join(outputDir, "Data_SfxManifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.licenses.volcengine = SFX_LICENSES.volcengine;
  for (const band of bands) {
    const cue = `explosion${band.name}`;
    const entries = results.filter((result) => result.cue === cue);
    manifest.cues[cue] = { files: entries.map((entry) => entry.file),
      seconds: Number(Math.max(...entries.map((entry) => entry.seconds)).toFixed(3)),
      credit: `Volcengine SeedAudio 1.0 · approved Punch / Heavy · ${band.name} · 2026-09-10`, license: "volcengine" };
  }
  for (const result of results) fs.copyFileSync(path.join(stagedDir, result.file), path.join(outputDir, result.file));
  manifest.bakedAt = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  fs.writeFileSync(path.join(stagedDir, "Data_Qc.json"), JSON.stringify(results, null, 2) + "\n");
  console.log(JSON.stringify(results, null, 2));
}
try { Main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
