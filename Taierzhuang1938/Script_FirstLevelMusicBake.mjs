// Package the seven user-approved takes; never regenerates or edits the source recordings.
// node Taierzhuang1938/Script_FirstLevelMusicBake.mjs --source-dir=<LevelOne_SevenCues>
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { FIRST_LEVEL_MUSIC_CUES, FIRST_LEVEL_MUSIC_VERSION } from "./Data_FirstLevelMissionMusic.mjs";
const sourceDir = process.argv.find(arg => arg.startsWith("--source-dir="))?.slice(13);
if (!sourceDir) throw new Error("Pass --source-dir with the approved seven-cue folder");
const here = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(here, "Audio/Music/FirstLevel");
const sources = JSON.parse(fs.readFileSync(path.join(sourceDir, "Data_Tracklist.json"), "utf8"));
const Hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
function Run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${command}: ${result.stderr.slice(-1200)}`);
  return result;
}
function Measure(file) {
  const output = Run("ffmpeg", ["-hide_banner", "-i", file, "-af", "volumedetect", "-f", "null", "-"]).stderr;
  return { rmsDbfs: Number(output.match(/mean_volume: ([-\d.]+)/)?.[1]), peakDbfs: Number(output.match(/max_volume: ([-\d.]+)/)?.[1]) };
}
fs.mkdirSync(outputDir, { recursive: true });
const manifest = { version: FIRST_LEVEL_MUSIC_VERSION, model: "seed-audio-1.0",
  provider: "Volcengine", storySource: "https://app.notion.com/p/3d360335331c81ea86f6f637ab92327c",
  terms: "Generated recordings are subject to Volcengine service terms", sampleRate: 44100,
  normalization: { metric: "rmsDbfs", targetDbfs: -27, peakCeilingDbfs: -3 }, cues: {} };
for (const [cue, spec] of Object.entries(FIRST_LEVEL_MUSIC_CUES)) {
  const id = cue.slice("firstLevel".length), source = sources.tracks.find(track => track.id === id);
  if (!source) throw new Error(`Missing approved take ${id}`);
  const sourceFile = path.join(sourceDir, path.basename(source.destination));
  const sourceHash = Hash(sourceFile);
  if (sourceHash !== source.sha256) throw new Error(`Approved source hash mismatch ${id}`);
  const measured = Measure(sourceFile), gainDb = Math.min(-27 - measured.rmsDbfs, -3 - measured.peakDbfs);
  const file = path.join(outputDir, path.basename(spec.file));
  Run("ffmpeg", ["-y", "-v", "error", "-i", sourceFile, "-map_metadata", "-1", "-af", `volume=${gainDb}dB`, "-ac", "2", "-ar", "44100", "-b:a", "112k", file]);
  const result = Measure(file);
  const duration = Number(Run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).stdout);
  if (Math.abs(result.rmsDbfs + 27) > 0.6 || result.peakDbfs > -2.5 || duration < 90) throw new Error(`Invalid packaged audio ${id}`);
  manifest.cues[cue] = { file: path.basename(file), title: source.title, scene: source.scene,
    seconds: duration, bytes: fs.statSync(file).size, sha256: Hash(file), sourceSha256: sourceHash,
    sourceGeneratedAt: source.generatedAt, prompt: source.prompt, gainDb, ...result };
  console.log(`${cue}: ${duration.toFixed(2)}s RMS ${result.rmsDbfs} peak ${result.peakDbfs}`);
}
fs.writeFileSync(path.join(outputDir, "Data_FirstLevelMusicManifest.json"), JSON.stringify(manifest, null, 2) + "\n");
