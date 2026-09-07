// One request per whole exchange. Never cut, concatenate or generate per-line takes.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { MISSION_DIALOGUE, MissionVoicePrompt } from "./Data_FirstLevelMissionDialogue.mjs";
const here = path.dirname(fileURLToPath(import.meta.url)),
  out = path.join(here, "Audio", "FirstLevel");
const manifestPath = path.join(out, "Data_FirstLevelVoiceManifest.json");
const selected = process.argv
  .find((arg) => arg.startsWith("--only="))
  ?.slice(7)
  .split(",");
const dry = process.argv.includes("--dry"),
  force = process.argv.includes("--force");
const model = "seed-audio-1.0",
  endpoint = "https://openspeech.bytedance.com/api/v3/tts/create";
function Probe(file) {
  const result = spawnSync(
    process.env.FFPROBE || "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
    { encoding: "utf8", windowsHide: true },
  );
  const seconds = Number.parseFloat(result.stdout);
  if (result.status !== 0 || !(seconds > 0.5)) throw new Error("Invalid or undecodable generated audio");
  return seconds;
}
async function Main() {
  const manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    : { model, provider: "Volcengine", cues: {} };
  const raw = path.join(os.tmpdir(), "Taierzhuang1938FirstLevelSeedAudio");
  if (!dry) {
    fs.mkdirSync(out, { recursive: true });
    fs.mkdirSync(raw, { recursive: true });
  }
  for (const cue of MISSION_DIALOGUE.filter((cue) => !selected || selected.includes(cue.id))) {
    const prompt = MissionVoicePrompt(cue),
      hash = crypto.createHash("sha256").update(prompt).digest("hex");
    const output = path.join(out, cue.file);
    if (dry) {
      console.log(`${cue.id}: ${cue.lines.length} lines, ONE request, ${prompt.length} characters`);
      continue;
    }
    if (!force && manifest.cues[cue.id]?.promptHash === hash && fs.existsSync(output)) {
      Probe(output);
      console.log(`${cue.id}: verified existing whole cue`);
      continue;
    }
    const apiKey = process.env.VOLCENGINE_API_KEY;
    if (!apiKey)
      throw new Error("VOLCENGINE_API_KEY is required in the environment; do not store credentials in files");
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 360000);
    let payload;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
        body: JSON.stringify({
          model,
          text_prompt: prompt,
          audio_config: {
            format: "mp3",
            sample_rate: 48000,
            pitch_rate: 0,
            speech_rate: 0,
            loudness_rate: 0,
          },
          watermark: {},
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        const code = String(failure.code ?? failure.status_code ?? failure.error?.code ?? "")
          .replaceAll(apiKey, "[redacted]")
          .slice(0, 60);
        const message =
          failure.message ??
          failure.error?.message ??
          failure.error_msg ??
          failure.status_msg ??
          "";
        const detail = String(message)
          .replaceAll(apiKey, "[redacted]")
          .slice(0, 300);
        throw new Error(
          `Seed Audio returned HTTP ${response.status}${code ? " [" + code + "]" : ""}${detail ? ": " + detail : ""}`,
        );
      }
      payload = await response.json();
    } finally {
      clearTimeout(timer);
    }
    if (typeof payload.audio !== "string") throw new Error(`Seed Audio returned no audio for ${cue.id}`);
    const bytes = Buffer.from(payload.audio, "base64");
    if (bytes.length < 2048) throw new Error(`Seed Audio returned an empty take for ${cue.id}`);
    const rawFile = path.join(raw, cue.file);
    fs.writeFileSync(rawFile, bytes);
    Probe(rawFile);
    const temp = output + ".tmp.mp3";
    const encoded = spawnSync(
      process.env.FFMPEG || "ffmpeg",
      [
        "-y",
        "-v",
        "error",
        "-i",
        rawFile,
        "-map_metadata",
        "-1",
        "-af",
        "loudnorm=I=-19:TP=-2:LRA=10",
        "-ac",
        "1",
        "-ar",
        "44100",
        "-b:a",
        "96k",
        temp,
      ],
      { encoding: "utf8", windowsHide: true },
    );
    if (encoded.status !== 0) throw new Error(`Unable to encode ${cue.id}`);
    const seconds = Probe(temp);
    fs.renameSync(temp, output);
    manifest.cues[cue.id] = {
      file: cue.file,
      seconds: Number(seconds.toFixed(3)),
      bytes: fs.statSync(output).size,
      promptHash: hash,
      sha256: crypto.createHash("sha256").update(fs.readFileSync(output)).digest("hex"),
      lineCount: cue.lines.length,
      requests: 1,
      continuous: true,
    };
    manifest.updatedAt = new Date().toISOString();
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    console.log(`${cue.id}: ${seconds.toFixed(2)} seconds, continuous cue saved`);
  }
}
Main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
