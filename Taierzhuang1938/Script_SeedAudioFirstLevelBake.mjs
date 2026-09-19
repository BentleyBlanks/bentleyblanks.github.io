// One request per whole exchange. Never cut, concatenate or generate per-line takes.
//
//   node Taierzhuang1938/Script_SeedAudioFirstLevelBake.mjs [--only=a,b] [--dry] [--force]
//                                                          [--jobs=N] [--prune]
//
//   --only=a,b  只处理这几条 cue          --dry    只列清单和字符数，不发请求
//   --force     无视 promptHash 重摇      --jobs=N 并发条数（默认 2，上限 3；再多必撞并发配额）
//   --prune     删掉台词表里已经不存在的 cue 的 mp3 与 manifest 条目
//
// 429 / 5xx / 超时 / 网络错误自动退避重试三次；密钥只从 VOLCENGINE_API_KEY 读，
// 任何日志与异常都先把它替换成 [redacted]。
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { MISSION_DIALOGUE, MissionVoicePrompt, MissionVoiceScriptJson } from "./Data_FirstLevelMissionDialogue.mjs";
const here = path.dirname(fileURLToPath(import.meta.url)),
  out = path.join(here, "Audio", "FirstLevel");
const manifestPath = path.join(out, "Data_FirstLevelVoiceManifest.json");
const selected = process.argv
  .find((arg) => arg.startsWith("--only="))
  ?.slice(7)
  .split(",");
const dry = process.argv.includes("--dry"),
  force = process.argv.includes("--force"),
  prune = process.argv.includes("--prune");
const jobs = Math.min(3, Math.max(1,
  Number.parseInt(process.argv.find((arg) => arg.startsWith("--jobs="))?.slice(7) ?? "2", 10) || 2));
const model = "seed-audio-1.0",
  endpoint = "https://openspeech.bytedance.com/api/v3/tts/create";
const attempts = 3, backoffMs = [6000, 20000, 60000];
const Redact = (text, apiKey) => String(text ?? "").replaceAll(apiKey, "[redacted]");
class Retryable extends Error {}
function WriteGuideAlignment(manifest) {
  const entries = MISSION_DIALOGUE.filter(cue => cue.guidance && manifest.cues[cue.id]);
  if (!entries.length) return;
  const alignment = Object.fromEntries(entries.map(cue => {
    const entry = manifest.cues[cue.id];
    return [cue.id, {sha256: entry.sha256,
      scriptSha256:crypto.createHash("sha256").update(MissionVoiceScriptJson(cue)).digest("hex"),
      lines: [[0, entry.seconds]]}];
  }));
  fs.writeFileSync(path.join(here, "Data_FirstLevelGuideVoiceAlignment.mjs"),
    "// Single-speaker whole-cue intervals; no dialogue cuts or synthetic word alignment.\n"
    + "export const GUIDE_VOICE_ALIGNMENT = Object.freeze(" + JSON.stringify(alignment, null, 2) + ");\n");
}
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
const Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function Request(cue, prompt, apiKey) {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 360000);
  try {
    let response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Api-Key": apiKey, "X-Api-Request-Id": crypto.randomUUID() },
        body: JSON.stringify({
          model,
          text_prompt: prompt,
          audio_config: {
            format: "mp3",
            sample_rate: 44100,
            pitch_rate: 0,
            speech_rate: cue.speechRate ?? 0,
            loudness_rate: 0,
          },
          watermark: {},
        }),
        signal: controller.signal,
      });
    } catch (error) {
      // 超时与网络层失败都可以再试一次。
      throw new Retryable(Redact(error.message || "network failure", apiKey).slice(0, 200));
    }
    if (!response.ok) {
      const failure = await response.json().catch(() => ({}));
      const code = Redact(failure.code ?? failure.status_code ?? failure.error?.code ?? "", apiKey).slice(0, 60);
      const message = failure.message ?? failure.error?.message ?? failure.error_msg ?? failure.status_msg ?? "";
      const detail = Redact(message, apiKey).slice(0, 300);
      const summary = `Seed Audio returned HTTP ${response.status}${code ? " [" + code + "]" : ""}${detail ? ": " + detail : ""}`;
      throw (response.status === 429 || response.status >= 500) ? new Retryable(summary) : new Error(summary);
    }
    const payload = await response.json();
    if (typeof payload.audio !== "string") throw new Retryable(`Seed Audio returned no audio for ${cue.id}`);
    const bytes = Buffer.from(payload.audio, "base64");
    if (bytes.length < 2048) throw new Retryable(`Seed Audio returned an empty take for ${cue.id}`);
    return bytes;
  } finally {
    clearTimeout(timer);
  }
}
async function Generate(cue, prompt, apiKey) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await Request(cue, prompt, apiKey);
    } catch (error) {
      if (!(error instanceof Retryable) || attempt >= attempts) throw error;
      const wait = backoffMs[attempt - 1];
      console.log(`${cue.id}: ${error.message} — retry ${attempt}/${attempts - 1} in ${Math.round(wait / 1000)}s`);
      await Sleep(wait);
    }
  }
}
function Prune(manifest) {
  const live = new Set(MISSION_DIALOGUE.map((cue) => cue.id));
  const stale = Object.keys(manifest.cues).filter((id) => !live.has(id));
  const files = new Set(MISSION_DIALOGUE.map((cue) => cue.file));
  const orphans = fs.existsSync(out)
    ? fs.readdirSync(out).filter((name) => name.endsWith(".mp3") && !files.has(name))
    : [];
  for (const id of stale) {
    console.log(`${dry ? "would prune" : "pruned"} manifest entry ${id}`);
    if (!dry) delete manifest.cues[id];
  }
  for (const name of orphans) {
    console.log(`${dry ? "would delete" : "deleted"} ${name}`);
    if (!dry) fs.rmSync(path.join(out, name));
  }
  if (!dry && (stale.length || orphans.length)) {
    manifest.updatedAt = new Date().toISOString();
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    WriteGuideAlignment(manifest);
  }
  if (!stale.length && !orphans.length) console.log("prune: nothing stale");
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
  if (prune) Prune(manifest);
  const queue = MISSION_DIALOGUE.filter((cue) => !selected || selected.includes(cue.id));
  for (const cue of queue) {
    const prompt = MissionVoicePrompt(cue);
    if (prompt.length > 3000) throw new Error(`Seed Audio prompt exceeds 3000 characters: ${cue.id}`);
  }
  if (dry) {
    let pending = 0;
    for (const cue of queue) {
      const prompt = MissionVoicePrompt(cue),
        hash = crypto.createHash("sha256").update(prompt).digest("hex");
      const current = !force && manifest.cues[cue.id]?.promptHash === hash
        && (manifest.cues[cue.id]?.speechRate ?? 0) === (cue.speechRate ?? 0)
        && fs.existsSync(path.join(out, cue.file));
      if (!current) pending++;
      console.log(`${cue.id}: ${cue.lines.length} lines, ONE request, ${prompt.length} characters, ${current ? "up-to-date" : "NEEDS BAKE"}`);
    }
    console.log(`${queue.length} cues, ${pending} need baking`);
    return;
  }
  let cursor = 0, failure = null;
  const Worker = async () => {
    while (cursor < queue.length && !failure) {
      const cue = queue[cursor++];
      try {
        await Bake(cue, manifest, raw);
      } catch (error) {
        failure = failure || error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, Worker));
  if (failure) throw failure;
}
async function Bake(cue, manifest, raw) {
  const prompt = MissionVoicePrompt(cue),
    hash = crypto.createHash("sha256").update(prompt).digest("hex");
  const output = path.join(out, cue.file);
  if (!force && manifest.cues[cue.id]?.promptHash === hash && (manifest.cues[cue.id]?.speechRate??0)===(cue.speechRate??0) && fs.existsSync(output)) {
    Probe(output);
    if (cue.guidance) WriteGuideAlignment(manifest);
    console.log(`${cue.id}: verified existing whole cue`);
    return;
  }
  const apiKey = process.env.VOLCENGINE_API_KEY;
  if (!apiKey)
    throw new Error("VOLCENGINE_API_KEY is required in the environment; do not store credentials in files");
  const bytes = await Generate(cue, prompt, apiKey);
  const rawFile = path.join(raw, cue.file);
  fs.writeFileSync(rawFile, bytes);
  Probe(rawFile);
  const temp = output + ".tmp.mp3";
  const encoded = spawnSync(
    process.env.FFMPEG || "ffmpeg",
    [
      "-y", "-v", "error", "-i", rawFile, "-map_metadata", "-1",
      "-af", "aformat=channel_layouts=mono,loudnorm=I=-19:TP=-3:LRA=10",
      "-ac", "1", "-ar", "44100", "-b:a", "96k", temp,
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
    speechRate: cue.speechRate ?? 0,
    continuous: true,
    mastering: "MonoBeforeLoudnessTruePeakMinus3",
  };
  manifest.updatedAt = new Date().toISOString();
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  if (cue.guidance) WriteGuideAlignment(manifest);
  console.log(`${cue.id}: ${seconds.toFixed(2)} seconds, continuous cue saved`);
}
Main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
