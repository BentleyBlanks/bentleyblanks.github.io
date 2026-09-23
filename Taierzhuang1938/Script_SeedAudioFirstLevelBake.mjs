// 第一关对白烘焙。两种格式（契约 docs/Data_FirstLevel0105Refactor20260923Contract.md §2.2）：
//
//   · 逐句干声（台词表里 perLine 的 cue，01–06）：每句单独请求，带说话人的定妆音作参考（references /
//     @音频1），提示词禁止任何环境声与音效；每句多 take，按客观指标选优（转写字错率、与定妆音的音色
//     余弦、无削波、信噪比），按 projection 档把有声段 RMS 拉到目标、真峰值 ≤ −1 dBTP、首尾留 40–80 ms。
//     成品 Audio/FirstLevel/Lines/AudioVoice_FirstLevel<Scene>_<NN>.mp3，清单 manifest.lines[<Scene>.<NN>]，
//     逐字时间 Audio/FirstLevel/Data_FirstLevelLineTimings.json（以成品 sha256 为键）。
//   · 整段录音（其余 cue，07–18 与待下线的 09.21 旧 cue）：一段对白 = 一次请求 = 一条 mp3，行为不变。
//
//   node Taierzhuang1938/Script_SeedAudioFirstLevelBake.mjs [--only=A,B] [--lines=A.01,B.03] [--takes=3]
//        [--jobs=2] [--dry] [--force] [--prune] [--rescore]
//
//   --only=a,b    只处理这几条 cue          --lines=...  只处理这几句（逐句格式）
//   --takes=N     逐句每句生成几条 take（默认 3）        --rescore  不发请求，只对已有 take 重新打分选优
//                 选中 take 带扣分项的句子，--takes 大于已有条数时只补抽缺的那几条
//   --dry         只列清单，不发请求          --force      无视 promptHash 重摇
//   --jobs=N      并发（默认 2，上限 2：本机还有别的包在调）
//   --prune       删掉台词表里已经不存在的 cue / 句的成品与清单条目；逐句录齐的 cue 删掉旧整段
//
// 429 / 5xx / 超时 / 网络错误自动退避重试；密钥只从 VOLCENGINE_API_KEY 读，任何日志与异常都先脱敏。
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { MISSION_DIALOGUE, MISSION_VOICE_CAST, MissionVoicePrompt, MissionVoiceScriptJson, MissionVoiceSpoken }
  from "./Data_FirstLevelMissionDialogue.mjs";
import { JAPANESE_SPEECH } from "./Data_FirstLevelJapaneseSpeech.mjs";
import { FIRST_LEVEL_VOICE_CAST, DRY_VOICE_RULE, VOICE_LANG_RULE, CastVoiceOwner } from "./Data_FirstLevelVoiceCast.mjs";
import { PROJECTION_DB, LINE_MASTER, LineDirection } from "./Data_FirstLevelDialogueDirection.mjs";
import { SeedAudioSpeak, MasterLine, MeasureVoice, SpeakerEmbed, CenteredCosine, Transcribe, Sha256, Pool, requestStats, SEED_AUDIO_MODEL }
  from "./Script_SeedAudioVoiceKit.mjs";

const here = path.dirname(fileURLToPath(import.meta.url)),
  out = path.join(here, "Audio", "FirstLevel");
const manifestPath = path.join(out, "Data_FirstLevelVoiceManifest.json");
const castManifestPath = path.join(out, "Data_FirstLevelVoiceCastManifest.json");
const timingsPath = path.join(out, "Data_FirstLevelLineTimings.json");
const Arg = (name) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const selected = Arg("only")?.split(",").filter(Boolean);
const selectedLines = Arg("lines")?.split(",").filter(Boolean);
const dry = process.argv.includes("--dry"),
  force = process.argv.includes("--force"),
  prune = process.argv.includes("--prune"),
  rescore = process.argv.includes("--rescore");
const jobs = Math.min(2, Math.max(1, Number.parseInt(Arg("jobs") ?? "2", 10) || 2));
const takesPerLine = Math.min(6, Math.max(1, Number.parseInt(Arg("takes") ?? "3", 10) || 3));
const model = SEED_AUDIO_MODEL,
  endpoint = "https://openspeech.bytedance.com/api/v3/tts/create";
const attempts = 3, backoffMs = [6000, 20000, 60000];
const Redact = (text, apiKey) => String(text ?? "").replaceAll(apiKey, "[redacted]");
class Retryable extends Error {}
const Hash = (text) => crypto.createHash("sha256").update(text).digest("hex");
const workDir = path.join(path.dirname(here), "tmp", "voice", "lines");

// ============================================================================
// 逐句干声
// ============================================================================

/** 逐句选优的门槛（纯客观；我们听不见）。 */
export const LINE_PICK = Object.freeze({
  maxCer: 0.34,          // 转写字错率上限（四川话被 whisper 当普通话转写，天然有误差）
  minSpeakerCos: 0.35,   // 与本人定妆音的音色余弦下限（去中心后；同一嗓子的不同句一般 0.5–0.9）
  minSnrDb: 30,          // 干声信噪比下限
  clipDb: -0.3,          // 原始 take 峰值高于这个就算削波
});

const PROJECTION_WORDS = Object.freeze({
  shout: "放开嗓子喊出来（是喊话，不是尖叫，不破成噪声）",
  normal: "正常说话的音量",
  low: "压低声音、贴近了说",
  breath: "很轻、带气声，几乎是喘出来的",
});

function ReadCastManifest() {
  return fs.existsSync(castManifestPath) ? JSON.parse(fs.readFileSync(castManifestPath, "utf8")) : { cast: {} };
}
export function CastReference(who) {
  const owner = CastVoiceOwner(who);
  const entry = ReadCastManifest().cast[owner];
  if (!entry) return null;
  return { owner, file: path.join(out, entry.file), sha256: entry.sha256 };
}

/** 逐句提示词（不含参考音本身；参考音的 sha 另记在清单里）。 */
export function LinePrompt(cue, index) {
  const line = cue.lines[index], cast = FIRST_LEVEL_VOICE_CAST[line.who];
  if (!cast) throw new Error(`${cue.id}: ${line.who} has no cast entry in Data_FirstLevelVoiceCast`);
  const direction = LineDirection(cue, index);
  const ja = line.lang === "ja";
  const lang = ja
    ? (cast.lang === "ja" ? VOICE_LANG_RULE.ja
      : "只说给出的日语，不说中文。他是中国北方人，日语是后学的，带很重的中国北方口音，发音生硬。")
    : VOICE_LANG_RULE[cast.lang];
  const previous = index > 0 ? cue.lines[index - 1] : null;
  const context = [
    direction.context ? `此刻：${direction.context}。` : "",
    previous ? `上一句是${MISSION_VOICE_CAST[previous.who]?.[0] || "别人"}说的（不要念）：“${MissionVoiceSpoken(cue, index - 1)}”。` : "",
  ].join("");
  const spoken = MissionVoiceSpoken(cue, index);
  return DRY_VOICE_RULE
    + "@音频1 是这个角色本人的声音：严格保持 @音频1 的音色、年龄感和口音，只按下面的表演改变情绪和音量。"
    + `角色：${cast.persona}。${lang}${context}`
    + `表演：${direction.delivery || "自然、口语化，不是播音腔"}；${PROJECTION_WORDS[direction.projection] || PROJECTION_WORDS.normal}；`
    + `情绪强度 ${Math.round((direction.intensity ?? 0.5) * 10)}/10。`
    + `只说这一句，一个字都不加、不删、不念角色名：“${spoken}”`;
}

function PerLineJobs() {
  const cues = MISSION_DIALOGUE.filter((cue) => cue.perLine && (!selected || selected.includes(cue.id)));
  return cues.flatMap((cue) => cue.lines.map((line, index) => ({ cue, line, index })))
    .filter((job) => !selectedLines || selectedLines.includes(job.line.id));
}

function LineUpToDate(job, manifest) {
  const entry = manifest.lines?.[job.line.id];
  const ref = CastReference(job.line.who);
  // 选中的 take 带扣分项、且已有 take 少于这次要的条数：补抽（已有 take 复用，只发缺的那几条）。
  const shortOfTakes = entry?.flagged?.length > 0 && (entry.takes?.length ?? 0) < takesPerLine;
  return !force && !shortOfTakes && entry && ref && entry.promptHash === Hash(LinePrompt(job.cue, job.index))
    && entry.castSha256 === ref.sha256 && fs.existsSync(path.join(out, job.line.file));
}

async function BakeLines(manifest) {
  const all = PerLineJobs();
  if (!all.length) return;
  const missingCast = [...new Set(all.map((j) => j.line.who).filter((who) => !CastReference(who)))];
  const pending = all.filter((j) => !LineUpToDate(j, manifest));
  if (dry) {
    for (const j of all) console.log(`${j.line.id} ${j.line.who}: ${LineUpToDate(j, manifest) ? "up-to-date" : "NEEDS BAKE"}${CastReference(j.line.who) ? "" : " (no cast voice yet)"}`);
    console.log(`${all.length} lines, ${pending.length} need baking, ${pending.length * takesPerLine} requests; cast missing: ${missingCast.join(",") || "none"}`);
    return;
  }
  const bakeable = pending.filter((j) => CastReference(j.line.who));
  if (missingCast.length) console.warn(`skipping lines of ${missingCast.join(",")}: pick their cast voice first (Script_SeedAudioCastBake.mjs)`);
  fs.mkdirSync(workDir, { recursive: true });
  // 1) 生成 take（已有的 raw 复用，除非 --force）
  if (!rescore) {
    const requests = bakeable.flatMap((job) => Array.from({ length: takesPerLine }, (_, i) => ({ job, n: i + 1 })));
    const todo = requests.filter(({ job, n }) => force || !fs.existsSync(TakeRaw(job, n))
      || JSON.parse(fs.readFileSync(TakeMeta(job, n), "utf8")).promptHash !== Hash(LinePrompt(job.cue, job.index)));
    console.log(`${todo.length} SeedAudio requests for ${bakeable.length} lines`);
    const { errors } = await Pool(todo, jobs, async ({ job, n }) => {
      const prompt = LinePrompt(job.cue, job.index), ref = CastReference(job.line.who);
      const result = await SeedAudioSpeak({ prompt, references: [ref.file], label: `${job.line.id}#${n}` });
      fs.writeFileSync(TakeRaw(job, n), result.bytes);
      fs.writeFileSync(TakeMeta(job, n), JSON.stringify({ promptHash: Hash(prompt), castSha256: ref.sha256,
        subtitle: result.subtitle, generatedAt: new Date().toISOString() }));
      console.log(`${job.line.id}#${n}: ${result.bytes.length} bytes`);
    });
    for (const error of errors) console.error(error.message);
  }
  // 2) 母带 + 打分 + 选优
  const takes = [];
  for (const job of bakeable) for (let n = 1; n <= takesPerLine; n++) {
    if (!fs.existsSync(TakeRaw(job, n))) continue;
    const meta = JSON.parse(fs.readFileSync(TakeMeta(job, n), "utf8"));
    if (meta.promptHash !== Hash(LinePrompt(job.cue, job.index))) continue;
    const direction = LineDirection(job.cue, job.index);
    const mastered = TakeRaw(job, n).replace(/\.raw\.mp3$/, ".mp3");
    const rawPeak = PeakDb(TakeRaw(job, n));
    const rawMeasure = MeasureVoice(TakeRaw(job, n));
    const master = MasterLine(TakeRaw(job, n), mastered, { targetDb: PROJECTION_DB[direction.projection] ?? PROJECTION_DB.normal,
      padS: LINE_MASTER.padS, ceilingDb: LINE_MASTER.ceilingDb });
    takes.push({ job, n, meta, file: mastered, rawPeak, rawTailS: rawMeasure.tailS, ...master });
  }
  if (!takes.length) return;
  const refs = [...new Set(takes.map((t) => CastReference(t.job.line.who).file))];
  const vectors = SpeakerEmbed([...takes.map((t) => t.file), ...refs]);
  const texts = Transcribe(takes.map((t) => ({ file: t.file, lang: t.job.line.lang === "ja" ? "ja" : "zh",
    text: MissionVoiceSpoken(t.job.cue, t.job.index),
    reference: t.job.line.lang === "ja" ? JAPANESE_SPEECH[t.job.line.id]?.kanji : MissionVoiceSpoken(t.job.cue, t.job.index) })));
  for (const t of takes) {
    const ref = CastReference(t.job.line.who);
    t.speakerCos = vectors?.[t.file] && vectors?.[ref.file] ? +CenteredCosine(vectors[t.file], vectors[ref.file]).toFixed(3) : null;
    t.cer = texts?.[t.file]?.cer ?? null;
    t.transcript = texts?.[t.file]?.text ?? null;
    t.whisperChars = texts?.[t.file]?.chars ?? null;
    const m = t.measure, why = [];
    let score = 0;
    if (t.cer != null) { score += t.cer * 10; if (t.cer > LINE_PICK.maxCer) why.push(`CER ${t.cer}`); }
    if (t.speakerCos != null) { score += (1 - t.speakerCos) * 6; if (t.speakerCos < LINE_PICK.minSpeakerCos) why.push(`音色 ${t.speakerCos}`); }
    if (t.rawPeak > LINE_PICK.clipDb) { score += 3; why.push(`削波 ${t.rawPeak.toFixed(2)} dBFS`); }
    if (m.snrDb < LINE_PICK.minSnrDb) { score += (LINE_PICK.minSnrDb - m.snrDb) / 5; why.push(`SNR ${m.snrDb}`); }
    if (m.truePeakDb > LINE_MASTER.ceilingDb + 0.05) { score += 3; why.push(`真峰值 ${m.truePeakDb} dBTP`); }
    // 生成的 take 尾静音 < 30 ms：句尾可能被截掉。很常见，只扣分不否决。
    if (t.rawTailS < 0.03) score += 0.5;
    t.score = +score.toFixed(3); t.why = why;
  }
  const manifestLines = (manifest.lines ||= {});
  const timings = fs.existsSync(timingsPath) ? JSON.parse(fs.readFileSync(timingsPath, "utf8")) : {};
  for (const job of bakeable) {
    const mine = takes.filter((t) => t.job === job).sort((a, b) => (a.why.length - b.why.length) || (a.score - b.score));
    if (!mine.length) { console.warn(`${job.line.id}: no usable take`); continue; }
    const best = mine[0];
    const target = path.join(out, job.line.file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(best.file, target);
    const sha256 = Sha256(target);
    const direction = LineDirection(job.cue, job.index);
    manifestLines[job.line.id] = {
      file: job.line.file, scene: job.cue.id, index: job.index, who: job.line.who, lang: job.line.lang || "zh",
      projection: direction.projection, seconds: best.measure.seconds, bytes: fs.statSync(target).size, sha256,
      promptHash: Hash(LinePrompt(job.cue, job.index)), castSha256: best.meta.castSha256, castOwner: CastVoiceOwner(job.line.who),
      take: best.n, flagged: best.why,
      metrics: { activeRmsDb: best.measure.activeRmsDb, truePeakDb: best.measure.truePeakDb, snrDb: best.measure.snrDb,
        leadS: best.measure.leadS, tailS: best.measure.tailS, lowShare: best.measure.lowShare, f0: best.measure.f0,
        cer: best.cer, speakerCos: best.speakerCos, transcript: best.transcript, gainDb: best.gainDb },
      takes: mine.map((t) => ({ n: t.n, score: t.score, cer: t.cer, speakerCos: t.speakerCos, snrDb: t.measure.snrDb,
        rawPeakDb: +t.rawPeak.toFixed(2), seconds: t.measure.seconds, flagged: t.why })),
      mastering: "PerLineDryProjectionRmsTruePeakMinus1",
    };
    timings[sha256] = { lineId: job.line.id, who: job.line.who, lang: job.line.lang || "zh", seconds: best.measure.seconds,
      ...LineCharTimes(best) };
    console.log(`${job.line.id}: take ${best.n} score ${best.score} cer ${best.cer} cos ${best.speakerCos} ${best.measure.seconds}s${best.why.length ? " FLAGGED " + best.why.join("; ") : ""}`);
  }
  manifest.updatedAt = new Date().toISOString();
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  const sorted = Object.fromEntries(Object.entries(timings).sort((a, b) => a[1].lineId.localeCompare(b[1].lineId)));
  fs.writeFileSync(timingsPath, JSON.stringify(sorted, null, 1) + "\n");
}
const TakeRaw = (job, n) => path.join(workDir, `${job.line.id}_${n}.raw.mp3`);
const TakeMeta = (job, n) => path.join(workDir, `${job.line.id}_${n}.json`);

function PeakDb(file) {
  const r = spawnSync(process.env.FFMPEG || "ffmpeg", ["-v", "error", "-i", file, "-ac", "1", "-f", "f32le", "-"], { maxBuffer: 1 << 27 });
  const pcm = new Float32Array(r.stdout.buffer.slice(r.stdout.byteOffset, r.stdout.byteOffset + r.stdout.length));
  let peak = 0;
  for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
  return 20 * Math.log10(Math.max(peak, 1e-9));
}

/**
 * 逐字时间（给 Face 包做口型轨）：优先 SeedAudio 自带的逐字时间戳（毫秒，平移掉母带剪掉的开头），
 * 没有就用 whisper 对意图文本的强制对齐。只留有字形的字，标点丢掉。
 */
function LineCharTimes(take) {
  const words = (take.meta.subtitle?.sentences || []).flatMap((s) => s.words || [])
    .filter((w) => /[\p{L}\p{N}]/u.test(w.text));
  if (words.length) {
    const shift = take.trimStartS;
    return { source: "seedaudio-subtitle", chars: words.map((w) => [w.text,
      +Math.max(0, w.start_time / 1000 - shift).toFixed(3), +Math.max(0, w.end_time / 1000 - shift).toFixed(3)]) };
  }
  if (take.whisperChars?.length) return { source: "whisper-forced", chars: take.whisperChars };
  return { source: "none", chars: [] };
}

// ============================================================================
// 整段录音（旧格式，07–18 与待下线的 09.21 旧 cue）—— 行为不变
// ============================================================================

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
      requestStats.requests++;
      return await Request(cue, prompt, apiKey);
    } catch (error) {
      if (!(error instanceof Retryable) || attempt >= attempts) { requestStats.failures++; throw error; }
      requestStats.retries++;
      const wait = backoffMs[attempt - 1];
      console.log(`${cue.id}: ${error.message} — retry ${attempt}/${attempts - 1} in ${Math.round(wait / 1000)}s`);
      await Sleep(wait);
    }
  }
}
function Prune(manifest) {
  const live = new Set(MISSION_DIALOGUE.map((cue) => cue.id));
  // 逐句录齐的 cue：旧整段录音作废（运行时也不再加载它）。
  const superseded = MISSION_DIALOGUE.filter((cue) => cue.perLine && cue.lines.every((line) => manifest.lines?.[line.id]))
    .map((cue) => cue.id);
  const stale = Object.keys(manifest.cues).filter((id) => !live.has(id) || superseded.includes(id));
  const files = new Set(MISSION_DIALOGUE.filter((cue) => !superseded.includes(cue.id)).map((cue) => cue.file));
  const orphans = fs.existsSync(out)
    ? fs.readdirSync(out).filter((name) => name.endsWith(".mp3") && !files.has(name))
    : [];
  const liveLines = new Set(MISSION_DIALOGUE.flatMap((cue) => cue.perLine ? cue.lines.map((line) => line.id) : []));
  const staleLines = Object.keys(manifest.lines || {}).filter((id) => !liveLines.has(id));
  const lineDir = path.join(out, "Lines");
  const lineFiles = new Set(MISSION_DIALOGUE.flatMap((cue) => cue.perLine ? cue.lines.map((line) => path.basename(line.file)) : []));
  const lineOrphans = fs.existsSync(lineDir) ? fs.readdirSync(lineDir).filter((name) => name.endsWith(".mp3") && !lineFiles.has(name)) : [];
  for (const id of stale) { console.log(`${dry ? "would prune" : "pruned"} manifest entry ${id}`); if (!dry) delete manifest.cues[id]; }
  for (const id of staleLines) { console.log(`${dry ? "would prune" : "pruned"} line ${id}`); if (!dry) delete manifest.lines[id]; }
  for (const name of orphans) { console.log(`${dry ? "would delete" : "deleted"} ${name}`); if (!dry) fs.rmSync(path.join(out, name)); }
  for (const name of lineOrphans) { console.log(`${dry ? "would delete" : "deleted"} Lines/${name}`); if (!dry) fs.rmSync(path.join(lineDir, name)); }
  if (!dry && (stale.length || orphans.length || staleLines.length || lineOrphans.length)) {
    manifest.updatedAt = new Date().toISOString();
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    WriteGuideAlignment(manifest);
  }
  if (!stale.length && !orphans.length && !staleLines.length && !lineOrphans.length) console.log("prune: nothing stale");
}
async function Main() {
  const manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    : { model, provider: "Volcengine", cues: {}, lines: {} };
  manifest.lines ||= {};
  const raw = path.join(os.tmpdir(), "Taierzhuang1938FirstLevelSeedAudio");
  if (!dry) {
    fs.mkdirSync(out, { recursive: true });
    fs.mkdirSync(raw, { recursive: true });
  }
  if (prune) { Prune(manifest); return; }
  await BakeLines(manifest);
  if (selectedLines) { console.log(`requests ${requestStats.requests}, retries ${requestStats.retries}, failures ${requestStats.failures}`); return; }
  const queue = MISSION_DIALOGUE.filter((cue) => !cue.perLine && (!selected || selected.includes(cue.id)));
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
    console.log(`${queue.length} whole cues, ${pending} need baking`);
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
  console.log(`requests ${requestStats.requests}, retries ${requestStats.retries}, failures ${requestStats.failures}`);
  if (failure) throw failure;
}
async function Bake(cue, manifest, raw) {
  const prompt = MissionVoicePrompt(cue),
    hash = crypto.createHash("sha256").update(prompt).digest("hex");
  const output = path.join(out, cue.file);
  if (!force && manifest.cues[cue.id]?.promptHash === hash && (manifest.cues[cue.id]?.speechRate??0)===(cue.speechRate??0) && fs.existsSync(output)) {
    Probe(output);
    if (cue.guidance) WriteGuideAlignment(manifest);
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
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  Main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
