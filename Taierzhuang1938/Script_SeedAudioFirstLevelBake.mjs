// 第一关对白烘焙。两种格式（契约 docs/Data_FirstLevel0105Refactor20260923Contract.md §2.2，VoiceSync §0）：
//
//   · 场景整段 → 切句（台词表里 perLine 的 cue，01–06；2026-09-23 用户口径「同一段对白尽量一次生成，
//     保证听起来像一个环境，少抽卡」）：一个场景 = 一次请求 = 一条干声整段录音。请求带最多 3 条定妆参考音
//     （references / @音频N 指派说话人），提示词写情境、远近、谁说哪句、表演与轮替节奏、稿中的笑与喘；
//     **不烘环境声与音效**。整段只做一次母带（统一电平、真峰值 ≤ −1 dBTP），再按 SeedAudio 的逐字时间戳
//     在句间静音处切成逐句片段，每句从自己说话人的位置播放。
//       整段 Audio/FirstLevel/AudioVoice_FirstLevel<Scene>.mp3（来源与回退），清单 manifest.scenes[<Scene>]
//       片段 Audio/FirstLevel/Lines/AudioVoice_FirstLevel<Scene>_<NN>.mp3，清单 manifest.lines[<Scene>.<NN>]
//       逐字时间 Audio/FirstLevel/Data_FirstLevelLineTimings.json（以片段 sha256 为键，给 Face 包的口型轨）
//     每场只生成 1 次；只有硬错误（漏句 / 多念 / 念错词 / 某句明显是别人的嗓子 / 削波）才整段重抽，同场最多
//     共 SCENE_CHECK.maxAttempts 次。仍有个别句子分错嗓子时才**单独补录那一句**（--patch，带本人参考，电平
//     对齐到整段里原来那一句），这是例外，清单里记 source: "patch"。
//   · 整段录音（其余 cue，07–18 与待下线的 09.21 旧 cue）：一段对白 = 一次请求 = 一条 mp3，行为不变。
//
//   node Taierzhuang1938/Script_SeedAudioFirstLevelBake.mjs [--only=A,B] [--jobs=2] [--dry] [--force] [--prune]
//        [--rescore] [--attempts=N] [--pick=Scene:n] [--patch=Scene.NN[,…]] [--takes=N]
//
//   --only=a,b      只处理这几条 cue          --dry        只列清单与要发的请求数，不发请求
//   --attempts=N    这次允许每场最多到第几次生成（默认 1；有硬错误的场景再跑一遍带 --attempts=2/3 才重抽）
//   --pick=S:n      人工指定场景用第几次生成（先逐句核过转写与嗓子）
//   --patch=S.NN    例外：单独补录这一句（带本人定妆音参考），替换整段切出来的那一片；--takes=N 每句几条（默认 1）
//   --rescore       不发请求，只对已有生成重新母带、切句、打分（whisper / 音色编码重跑）
//   --force         无视 promptHash 重新生成     --jobs=N     并发（默认 2，上限 2：本机还有别的包在调）
//   --prune         删掉台词表里已经不存在的 cue / 句的成品与清单条目
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
import { PROJECTION_DB, LINE_MASTER, LineDirection, FIRST_LEVEL_DIALOGUE_DIRECTION } from "./Data_FirstLevelDialogueDirection.mjs";
import { SeedAudioSpeak, MasterLine, MeasureVoice, SpeakerEmbed, CenteredCosine, Transcribe, Sha256, Pool, requestStats,
  SEED_AUDIO_MODEL, MasterSceneWav, EncodeSegment, FrameRms, ClipRuns, MapSubtitleToLines, SliceScene, TruePeakDb }
  from "./Script_SeedAudioVoiceKit.mjs";

const here = path.dirname(fileURLToPath(import.meta.url)),
  out = path.join(here, "Audio", "FirstLevel");
const manifestPath = path.join(out, "Data_FirstLevelVoiceManifest.json");
const castManifestPath = path.join(out, "Data_FirstLevelVoiceCastManifest.json");
const timingsPath = path.join(out, "Data_FirstLevelLineTimings.json");
const reviewPath = path.join(out, "Data_FirstLevelVoiceTranscriptReview.json");
const Arg = (name) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const selected = Arg("only")?.split(",").filter(Boolean);
const dry = process.argv.includes("--dry"),
  force = process.argv.includes("--force"),
  prune = process.argv.includes("--prune"),
  rescore = process.argv.includes("--rescore");
const jobs = Math.min(2, Math.max(1, Number.parseInt(Arg("jobs") ?? "2", 10) || 2));
const patchTakes = Math.min(3, Math.max(1, Number.parseInt(Arg("takes") ?? "1", 10) || 1));
const patchLines = Arg("patch")?.split(",").filter(Boolean) || [];
const forcedScenePicks = new Map((Arg("pick")?.split(",") || []).filter(Boolean).map((p) => {
  const at = p.lastIndexOf(":");
  return [p.slice(0, at), Number(p.slice(at + 1))];
}));
const model = SEED_AUDIO_MODEL,
  endpoint = "https://openspeech.bytedance.com/api/v3/tts/create";
const attempts = 3, backoffMs = [6000, 20000, 60000];
const Redact = (text, apiKey) => String(text ?? "").replaceAll(apiKey, "[redacted]");
class Retryable extends Error {}
const Hash = (text) => crypto.createHash("sha256").update(text).digest("hex");
const worktree = path.dirname(here);
const sceneWork = path.join(worktree, "tmp", "voice", "scenes");
const patchWork = path.join(worktree, "tmp", "voice", "patch");

// ============================================================================
// 场景整段 → 切句
// ============================================================================

/** 硬错误与提示的门槛（纯客观；我们听不见）。 */
export const SCENE_CHECK = Object.freeze({
  maxAttempts: 3,        // 同一场最多生成几次（1 次 + 最多重抽 2 次）
  maxCer: 0.34,          // 片段转写字错率超过它要人工逐字核对（四川话被 whisper 当普通话转写，同音字不算错）
  reviewedMaxCer: 0.6,   // 超过它、且片段够长（≥ judgeVoicedS），算念错词的硬错误
  judgeVoicedS: 0.6,     // 有声段短于它的片段不判嗓子也不判字错率（说话人编码与 whisper 在这么短的音上都不可靠）
  wrongVoiceMargin: 0.08,// 与另一名在场角色定妆音的余弦比与本人的高出这么多 = 分错嗓子（硬错误）
  minCoverage: 0.5,      // 逐字时间戳对上稿面的字少于一半 = 漏句
  extraChars: 0.25,      // 时间戳里的字比稿面多出这么多（比例）= 多念
});
/** 旧名兼容：补录单句的选优门槛。 */
export const LINE_PICK = Object.freeze({ maxCer: SCENE_CHECK.maxCer, reviewedMaxCer: SCENE_CHECK.reviewedMaxCer,
  minSpeakerCos: 0.35, minSnrDb: 30, clipDb: -0.3 });

const PROJECTION_WORDS = Object.freeze({
  shout: "放开嗓子喊出来（是喊话，不是尖叫，不破成噪声）",
  normal: "正常说话的音量",
  low: "压低声音、贴近了说",
  breath: "很轻、带气声，几乎是喘出来的",
});
const Name = (who) => MISSION_VOICE_CAST[who]?.[0] || who;

function ReadCastManifest() {
  return fs.existsSync(castManifestPath) ? JSON.parse(fs.readFileSync(castManifestPath, "utf8")) : { cast: {} };
}
export function CastReference(who) {
  const owner = CastVoiceOwner(who);
  const entry = ReadCastManifest().cast[owner];
  if (!entry) return null;
  return { owner, file: path.join(out, entry.file), sha256: entry.sha256 };
}

/** 场上开口的人，台词字数多的在前。 */
function SceneSpeakers(cue) {
  const chars = new Map();
  cue.lines.forEach((line, i) => chars.set(line.who, (chars.get(line.who) || 0) + MissionVoiceSpoken(cue, i).length));
  return [...chars.entries()].sort((a, b) => b[1] - a[1]).map(([who]) => who);
}
/** 这场挂的参考音：按台词多少取前 3 个有定妆音的嗓子（共用嗓子的龙套算同一条），再按在稿里第一次开口的先后排 @音频1…3。 */
export function SceneReferences(cue) {
  const refs = [];
  for (const who of SceneSpeakers(cue)) {
    const ref = CastReference(who);
    if (!ref) continue;
    const have = refs.find((r) => r.owner === ref.owner);
    if (have) { have.who.push(who); continue; }
    if (refs.length < 3) refs.push({ ...ref, who: [who] });
  }
  const first = (r) => Math.min(...r.who.map((who) => cue.lines.findIndex((line) => line.who === who)));
  return refs.sort((a, b) => first(a) - first(b));
}
const RefIndex = (refs, who) => refs.findIndex((r) => r.who.includes(who));

/** 整段母带目标：各句档位按字数加权（dB 域平均）。整段只拉这一次，句间的喊 / 低声差别原样保留。 */
export function SceneTargetDb(cue) {
  let sum = 0, weight = 0;
  cue.lines.forEach((line, i) => {
    const w = Math.max(1, MissionVoiceSpoken(cue, i).length);
    sum += (PROJECTION_DB[LineDirection(cue, i).projection] ?? PROJECTION_DB.normal) * w; weight += w;
  });
  return +(sum / weight).toFixed(2);
}

/** 整段提示词。参考音本身不进哈希（另记 castSha256）。 */
export function ScenePrompt(cue) {
  const refs = SceneReferences(cue);
  const speakers = SceneSpeakers(cue);
  const scene = FIRST_LEVEL_DIALOGUE_DIRECTION[cue.id];
  const langs = new Set(speakers.map((who) => FIRST_LEVEL_VOICE_CAST[who]?.lang || "zh"));
  const interpreterJa = cue.lines.some((line) => line.who === "interpreter" && line.lang === "ja");
  const dry = speakers.length > 1
    ? "录音棚近讲干声，单声道，只有下面这几个角色的人声（含稿中写明的笑、喘、闷哼）：没有任何环境声、战场声、脚步、枪炮、爆炸、音效、音乐和混响，开头和结尾不留长空白。"
    : DRY_VOICE_RULE;
  const refText = refs.length
    ? refs.map((r, i) => `@音频${i + 1} 是${r.who.map(Name).join("、")}的声音`).join("，")
      + (refs.length > 1 ? "；每个角色严格保持自己那条参考音的音色、年龄感和口音，谁的句子就用谁的嗓子，绝不串嗓。" : "；严格保持参考音的音色、年龄感和口音。")
    : "";
  const cast = speakers.map((who) => `${Name(who)}：${FIRST_LEVEL_VOICE_CAST[who].persona}`).join("；");
  const langRules = [
    langs.has("zh") ? "川军都讲地道四川话，用四川方言的语调、声调与发音，不是普通话加几个四川词" : "",
    langs.has("zh-north") ? `翻译讲鲁南北方官话（山东口音），绝不说四川话${interpreterJa ? "；他说日语时带很重的中国北方口音，发音生硬" : ""}` : "",
    langs.has("ja") ? "日兵是日语母语者，只说给出的日语（假名照日语念），不说中文" : "",
  ].filter(Boolean).join("；");
  const notes = cue.lines.map((line, i) => {
    const d = LineDirection(cue, i);
    const bits = [
      d.pauseBeforeS ? `开口前停约 ${d.pauseBeforeS} 秒` : "",
      d.effort?.before ? `开口前${d.effort.before}` : "",
      d.context || "", d.delivery || "",
      PROJECTION_WORDS[d.projection] || PROJECTION_WORDS.normal,
      `情绪 ${Math.round((d.intensity ?? 0.5) * 10)}/10`,
      d.effort?.after || "",
    ].filter(Boolean);
    return `第${i + 1}句（${Name(line.who)}）：${bits.join("，")}`;
  }).join("；");
  const script = cue.lines.map((line, i) => {
    const k = RefIndex(refs, line.who);
    return `${k >= 0 ? `@音频${k + 1} ` : ""}${Name(line.who)}：“${MissionVoiceSpoken(cue, i)}”`;
  }).join("\n");
  const together = cue.lines.length > 1
    ? "这是同一场戏一次录完：人物在同一个地方、彼此对着说话，听得见对方；按下面的表演说明接话、停顿、抢话，喊的就喊、低声的就低声。"
    : "";
  return `${dry}${refText}场景：${scene?.context || cue.delivery || ""}。人物：${cast}。${langRules}。${together}`
    + `逐句表演（只照着演，不要念出来）：${notes}。`
    + `台词如下，每行开头的 @音频N 就是这一句该用的嗓子；按顺序念，不念 @音频N、角色名和编号，不加、不删、不改字：\n${script}`;
}

function SceneJobs() {
  return MISSION_DIALOGUE.filter((cue) => cue.perLine && (!selected || selected.includes(cue.id)));
}
const AttemptRaw = (cue, n) => path.join(sceneWork, `${cue.id}_${n}.raw.mp3`);
const AttemptMeta = (cue, n) => path.join(sceneWork, `${cue.id}_${n}.json`);
const AttemptDir = (cue, n) => path.join(sceneWork, `${cue.id}_${n}`);
const ReadJson = (file, fallback = null) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback;

/** 已有的、提示词与参考音都对得上的生成次数（1..n）。 */
function ValidAttempts(cue) {
  const promptHash = Hash(ScenePrompt(cue)), castKey = SceneReferences(cue).map((r) => r.sha256).join(",");
  const list = [];
  for (let n = 1; n <= 9; n++) {
    const meta = ReadJson(AttemptMeta(cue, n));
    if (!meta || !fs.existsSync(AttemptRaw(cue, n))) continue;
    if (meta.promptHash === promptHash && meta.castKey === castKey) list.push(n);
  }
  return list;
}

function SceneUpToDate(cue, manifest) {
  const entry = manifest.scenes?.[cue.id];
  return !force && entry && entry.promptHash === Hash(ScenePrompt(cue))
    && entry.castKey === SceneReferences(cue).map((r) => r.sha256).join(",")
    && fs.existsSync(path.join(out, cue.file)) && cue.lines.every((line) => fs.existsSync(path.join(out, line.file)));
}

/** 生成一次整段。 */
async function GenerateAttempt(cue, n) {
  const prompt = ScenePrompt(cue), refs = SceneReferences(cue);
  if (prompt.length > 3000) throw new Error(`${cue.id}: scene prompt exceeds 3000 characters (${prompt.length})`);
  const result = await SeedAudioSpeak({ prompt, references: refs.map((r) => r.file), label: `${cue.id}#${n}` });
  fs.writeFileSync(AttemptRaw(cue, n), result.bytes);
  fs.writeFileSync(AttemptMeta(cue, n), JSON.stringify({ promptHash: Hash(prompt), castKey: refs.map((r) => r.sha256).join(","),
    references: refs.map((r) => ({ who: r.who, owner: r.owner, castSha256: r.sha256 })), subtitle: result.subtitle,
    seconds: result.seconds, generatedAt: new Date().toISOString() }, null, 1));
  console.log(`${cue.id}#${n}: ${result.bytes.length} bytes`);
}

/** 母带 + 对字 + 切句（不打分）。真峰值超了整段统一再降，最多三轮。 */
function Cut(cue, n) {
  const dir = AttemptDir(cue, n);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const meta = ReadJson(AttemptMeta(cue, n));
  const raw = AttemptRaw(cue, n), wav = path.join(dir, "scene.wav");
  const spoken = cue.lines.map((_, i) => MissionVoiceSpoken(cue, i));
  const mapped = MapSubtitleToLines(spoken, meta.subtitle);
  const hard = [], flags = [];
  const clip = ClipRuns(raw);
  if (clip) hard.push(`削波 ${clip} 处`);
  const subtitleChars = mapped.reduce((t, m) => t + m.chars.length, 0), scriptChars = mapped.reduce((t, m) => t + m.total, 0);
  if (!meta.subtitle?.sentences?.length) hard.push("没有逐字时间戳");
  if (subtitleChars > scriptChars * (1 + SCENE_CHECK.extraChars) + 2) hard.push(`多念（时间戳 ${subtitleChars} 字 / 稿 ${scriptChars} 字）`);
  mapped.forEach((m, i) => { if (m.start == null || m.coverage < SCENE_CHECK.minCoverage) hard.push(`漏句 ${cue.lines[i].id}（对上 ${m.matched}/${m.total} 字）`); });
  if (hard.some((h) => h.startsWith("漏句") || h === "没有逐字时间戳")) return { cue, n, hard, flags, mapped, slices: null };
  let extraDb = 0, master, slices, files;
  for (let round = 0; round < 3; round++) {
    master = MasterSceneWav(raw, wav, { targetDb: SceneTargetDb(cue), ceilingDb: LINE_MASTER.ceilingDb, extraDb });
    const measure = MeasureVoice(wav);
    const shift = master.trimStartS;
    const lines = mapped.map((m, i) => ({ start: m.start - shift, end: m.end - shift,
      effortBefore: !!LineDirection(cue, i).effort?.before, effortAfter: !!LineDirection(cue, i).effort?.after }));
    slices = SliceScene(FrameRms(wav), lines, { activeRmsDb: measure.activeRmsDb, padS: LINE_MASTER.padS });
    const sceneMp3 = EncodeSegment(wav, path.join(dir, "scene.mp3"), { fadeS: 0 });
    files = slices.map((s, i) => EncodeSegment(wav, path.join(dir, `line_${String(i + 1).padStart(2, "0")}.mp3`),
      { startS: s.startS, endS: s.endS, fadeS: LINE_MASTER.crossfadeS }));
    const peaks = [sceneMp3, ...files].map(TruePeakDb);
    const worst = Math.max(...peaks);
    master.measure = { ...measure, truePeakDb: +peaks[0].toFixed(2) };
    master.slicePeaks = peaks.slice(1).map((p) => +p.toFixed(2));
    if (worst <= LINE_MASTER.ceilingDb) break;
    extraDb -= worst - LINE_MASTER.ceilingDb + 0.2;
  }
  master.targetDb = SceneTargetDb(cue);
  slices.forEach((s, i) => {
    if (s.tightStart || s.tightEnd) flags.push(`${cue.lines[i].id} 与邻句贴着，在能量最低处切（10 ms 淡入淡出）`);
    s.file = files[i];
    s.chars = mapped[i].chars.map(([c, a, b]) => [c, +Math.max(0, a - master.trimStartS - s.startS).toFixed(3),
      +Math.min(s.endS - s.startS, Math.max(0, b - master.trimStartS - s.startS)).toFixed(3)]);
    s.coverage = mapped[i].coverage;
  });
  return { cue, n, hard, flags, mapped, slices, master, sceneFile: path.join(dir, "scene.mp3") };
}

/** 一批生成一起打分：一次 whisper、一次音色编码（各自起一次 python）。 */
function Judge(results) {
  const cut = results.filter((r) => r.slices);
  const lineJobs = cut.flatMap((r) => r.slices.map((s, i) => ({ r, s, i, line: r.cue.lines[i] })));
  const castFiles = [...new Set(lineJobs.map((j) => CastReference(j.line.who)?.file).filter(Boolean))];
  const vectors = SpeakerEmbed([...lineJobs.map((j) => j.s.file), ...castFiles]);
  const texts = Transcribe(lineJobs.map((j) => ({ file: j.s.file, lang: j.line.lang === "ja" ? "ja" : "zh",
    text: MissionVoiceSpoken(j.r.cue, j.i),
    reference: j.line.lang === "ja" ? JAPANESE_SPEECH[j.line.id]?.kanji : MissionVoiceSpoken(j.r.cue, j.i) })));
  if (!texts || !vectors) {
    console.error(`scene judge aborted: ${!texts ? "whisper transcription" : "speaker embedding"} unavailable; rerun with --rescore`);
    process.exitCode = 1;
    return false;
  }
  for (const { r, s, i, line } of lineJobs) {
    s.measure = MeasureVoice(s.file);
    s.measure.truePeakDb = r.master.slicePeaks[i];
    s.cer = texts[s.file]?.cer ?? null;
    s.transcript = texts[s.file]?.text ?? null;
    const own = CastReference(line.who);
    s.speakerCos = own && vectors[s.file] && vectors[own.file] ? +CenteredCosine(vectors[s.file], vectors[own.file]).toFixed(3) : null;
    const others = [...new Set(r.cue.lines.map((l) => l.who))].filter((who) => CastVoiceOwner(who) !== CastVoiceOwner(line.who))
      .map((who) => [who, CastReference(who)]).filter(([, ref]) => ref && vectors[ref.file])
      .map(([who, ref]) => [who, +CenteredCosine(vectors[s.file], vectors[ref.file]).toFixed(3)]).sort((a, b) => b[1] - a[1]);
    s.nearestOther = others[0] || null;
    // 分错嗓子只跟本场挂了参考音的人比：没挂参考音的人（第 4 个说话人）这场里的嗓子本来就不是他的定妆音。
    const refs = SceneReferences(r.cue);
    const referencedOther = others.find(([who]) => RefIndex(refs, who) >= 0) || null;
    s.referencedOther = referencedOther;
    const judged = s.measure.voicedS >= SCENE_CHECK.judgeVoicedS;
    if (!judged) r.flags.push(`${line.id} 有声 ${s.measure.voicedS} s，太短不判嗓子与字错率`);
    if (judged && s.speakerCos != null && referencedOther && referencedOther[1] - s.speakerCos > SCENE_CHECK.wrongVoiceMargin)
      r.hard.push(`${line.id} 像${Name(referencedOther[0])}的嗓子（本人 ${s.speakerCos} / ${referencedOther[0]} ${referencedOther[1]}）`);
    else if (s.speakerCos != null && s.nearestOther && s.nearestOther[1] - s.speakerCos > SCENE_CHECK.wrongVoiceMargin)
      r.flags.push(`${line.id} 与${Name(s.nearestOther[0])}的定妆音更近（本人 ${s.speakerCos} / ${s.nearestOther[1]}；${judged ? "对方本场没挂参考音" : "片段太短"}）`);
    // 字错率高但字数对得上 = 四川话被 whisper 写成普通话同音字（人工逐字核对）；字数也差得多才算念错 / 漏词。
    const want = [...MissionVoiceSpoken(r.cue, i)].filter((c) => /[\p{L}\p{N}]/u.test(c)).length;
    const got = [...(s.transcript || "")].filter((c) => /[\p{L}\p{N}]/u.test(c)).length;
    s.lengthDiff = got - want;
    if (judged && s.cer != null && s.cer > SCENE_CHECK.reviewedMaxCer && Math.abs(got - want) > Math.max(2, 0.3 * want)) r.hard.push(`${line.id} 字错率 ${s.cer}「${s.transcript}」`);
    else if (s.cer != null && s.cer > SCENE_CHECK.maxCer) r.flags.push(`${line.id} 字错率 ${s.cer} 待逐字核对「${s.transcript}」`);
  }
  for (const r of results) {
    fs.writeFileSync(path.join(AttemptDir(r.cue, r.n), "judge.json"), JSON.stringify({ hard: r.hard, flags: r.flags,
      lines: r.slices?.map(({ file, ...s }) => s) || null, master: r.master || null }, null, 1));
  }
  return true;
}

function Report(r) {
  const tag = r.hard.length ? `HARD ${r.hard.join("；")}` : "ok";
  console.log(`${r.cue.id}#${r.n}: ${tag}${r.flags.length ? ` | ${r.flags.length} flags` : ""}`);
  for (const s of r.slices || []) {
    const i = r.slices.indexOf(s);
    console.log(`   ${r.cue.lines[i].id} ${r.cue.lines[i].who.padEnd(11)} ${String(s.measure?.seconds).padStart(6)}s gap ${String(s.gapBeforeS).padStart(6)} own ${s.speakerCos} other ${s.nearestOther?.join(":")} cer ${s.cer} 「${s.transcript}」`);
  }
}

async function BakeScenes(manifest) {
  const cues = SceneJobs();
  if (!cues.length) return;
  const maxAttempt = Math.min(SCENE_CHECK.maxAttempts, Math.max(1, Number.parseInt(Arg("attempts") ?? "1", 10) || 1));
  const missingCast = [...new Set(cues.flatMap((cue) => cue.lines.map((l) => l.who)).filter((who) => !CastReference(who)))];
  if (dry) {
    for (const cue of cues) {
      const refs = SceneReferences(cue);
      console.log(`${cue.id}: ${cue.lines.length} lines, refs ${refs.map((r) => r.owner).join("/") || "none"}, prompt ${ScenePrompt(cue).length} chars, `
        + `${SceneUpToDate(cue, manifest) ? "up-to-date" : `NEEDS BAKE (attempts on disk: ${ValidAttempts(cue).join(",") || "none"})`}`);
    }
    console.log(`cast missing: ${missingCast.join(",") || "none"}`);
    return;
  }
  if (missingCast.length) console.warn(`cast voice missing for ${missingCast.join(",")}: those speakers go in by persona only`);
  fs.mkdirSync(sceneWork, { recursive: true });
  const pending = cues.filter((cue) => !SceneUpToDate(cue, manifest) || rescore || forcedScenePicks.has(cue.id));
  // 1) 生成：每场只补到「最新一次生成有硬错误、且还没到 maxAttempt」为止。
  if (!rescore) {
    const todo = [];
    for (const cue of pending) {
      const have = ValidAttempts(cue);
      if (force && have.length) { for (const n of have) fs.rmSync(AttemptMeta(cue, n), { force: true }); have.length = 0; }
      const last = have.at(-1);
      const lastHard = last ? ReadJson(path.join(AttemptDir(cue, last), "judge.json"))?.hard : null;
      if (!last) todo.push({ cue, n: 1 });
      else if (lastHard?.length && last < maxAttempt) todo.push({ cue, n: last + 1 });
    }
    console.log(`${todo.length} SeedAudio scene requests`);
    const { errors } = await Pool(todo, jobs, ({ cue, n }) => GenerateAttempt(cue, n));
    for (const error of errors) console.error(error.message);
  }
  // 2) 母带、切句、打分（只对还没打过分的生成跑 whisper / 音色编码，--rescore 全部重跑）。
  const results = [];
  for (const cue of pending) for (const n of ValidAttempts(cue)) {
    const judged = ReadJson(path.join(AttemptDir(cue, n), "judge.json"));
    if (judged && !rescore && fs.existsSync(path.join(AttemptDir(cue, n), "scene.wav"))) {
      results.push({ cue, n, hard: judged.hard, flags: judged.flags, master: judged.master, cached: true,
        slices: judged.lines?.map((s, i) => ({ ...s, file: path.join(AttemptDir(cue, n), `line_${String(i + 1).padStart(2, "0")}.mp3`) })) || null,
        sceneFile: path.join(AttemptDir(cue, n), "scene.mp3") });
      continue;
    }
    try { results.push(Cut(cue, n)); } catch (error) { console.warn(`${cue.id}#${n}: unusable take (${String(error.message).slice(0, 160)})`); }
  }
  const fresh = results.filter((r) => !r.cached);
  if (fresh.length && !Judge(fresh)) return;
  // 3) 选：人工指定 > 无硬错误里提示最少 > 硬错误最少。有硬错误的场景照样装上（先有声音），报告里列出来。
  const manifestLines = (manifest.lines ||= {});
  const scenes = (manifest.scenes ||= {});
  const timings = ReadJson(timingsPath, {});
  for (const cue of pending) {
    const mine = results.filter((r) => r.cue === cue && r.slices);
    for (const r of results.filter((x) => x.cue === cue)) Report(r);
    if (!mine.length) { console.warn(`${cue.id}: no usable attempt`); continue; }
    const forced = forcedScenePicks.has(cue.id) ? mine.find((r) => r.n === forcedScenePicks.get(cue.id)) : null;
    const best = forced || [...mine].sort((a, b) => (a.hard.length - b.hard.length) || (a.flags.length - b.flags.length) || (a.n - b.n))[0];
    Install(cue, best, results.filter((r) => r.cue === cue), manifestLines, scenes, timings, manifest, forced ? "manual" : "check");
  }
  manifest.updatedAt = new Date().toISOString();
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  WriteTimings(timings);
}

function WriteTimings(timings) {
  const sorted = Object.fromEntries(Object.entries(timings).sort((a, b) => a[1].lineId.localeCompare(b[1].lineId)));
  fs.writeFileSync(timingsPath, JSON.stringify(sorted, null, 1) + "\n");
}

function Install(cue, best, all, manifestLines, scenes, timings, manifest, pickedBy) {
  const sceneTarget = path.join(out, cue.file);
  fs.copyFileSync(best.sceneFile, sceneTarget);
  const sceneSha = Sha256(sceneTarget);
  const refs = SceneReferences(cue);
  // 这一场旧的逐字时间（以旧片段 sha 为键）全部作废。
  for (const [sha, t] of Object.entries(timings)) if (cue.lines.some((l) => l.id === t.lineId)) delete timings[sha];
  cue.lines.forEach((line, i) => {
    const s = best.slices[i];
    const target = path.join(out, line.file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(s.file, target);
    const sha256 = Sha256(target);
    const d = LineDirection(cue, i);
    const own = CastReference(line.who);
    manifestLines[line.id] = {
      file: line.file, scene: cue.id, index: i, who: line.who, lang: line.lang || "zh", projection: d.projection,
      seconds: s.measure.seconds, bytes: fs.statSync(target).size, sha256, source: "scene",
      sceneSha256: sceneSha, sceneStartS: s.startS, sceneEndS: s.endS, gapBeforeS: s.gapBeforeS,
      tight: [!!s.tightStart, !!s.tightEnd], edgeDb: s.edgeDb,
      castOwner: CastVoiceOwner(line.who), castSha256: own?.sha256 || null, referenced: RefIndex(refs, line.who) >= 0,
      metrics: { activeRmsDb: s.measure.activeRmsDb, truePeakDb: s.measure.truePeakDb, snrDb: s.measure.snrDb,
        voicedS: s.measure.voicedS, lowShare: s.measure.lowShare, f0: s.measure.f0, cer: s.cer, transcript: s.transcript,
        speakerCos: s.speakerCos, nearestOther: s.nearestOther, referencedOther: s.referencedOther ?? null,
        lengthDiff: s.lengthDiff ?? null, subtitleCoverage: s.coverage, sceneGainDb: best.master.gainDb },
      mastering: "SliceOfWholeSceneMaster",
    };
    timings[sha256] = { lineId: line.id, who: line.who, lang: line.lang || "zh", seconds: s.measure.seconds,
      source: "seedaudio-subtitle", chars: s.chars };
  });
  delete manifest.cues?.[cue.id];   // 旧的带环境声整段（03–06）作废
  const requests = all.length;
  scenes[cue.id] = {
    file: cue.file, sha256: sceneSha, seconds: best.master.measure.seconds, bytes: fs.statSync(sceneTarget).size,
    promptHash: Hash(ScenePrompt(cue)), castKey: refs.map((r) => r.sha256).join(","),
    references: refs.map((r) => ({ who: r.who, owner: r.owner, castSha256: r.sha256 })),
    lines: cue.lines.map((l) => l.id), attempt: best.n, pickedBy, requests,
    attempts: all.map((r) => ({ n: r.n, hard: r.hard, flags: r.flags.length })),
    hard: best.hard, flags: best.flags,
    targetDb: best.master.targetDb, gainDb: best.master.gainDb, trimStartS: best.master.trimStartS,
    measure: { activeRmsDb: best.master.measure.activeRmsDb, truePeakDb: best.master.measure.truePeakDb, snrDb: best.master.measure.snrDb },
    mastering: "WholeSceneOnceRmsTruePeakMinus1",
  };
  console.log(`${cue.id}: installed attempt ${best.n} (${pickedBy})${best.hard.length ? " WITH HARD ERRORS" : ""}`);
}

// ============================================================================
// 例外：单独补录一句（带本人定妆音），电平对齐到整段里原来那一片
// ============================================================================

/** 补录单句的提示词（旧逐句口径）。 */
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
    previous ? `上一句是${Name(previous.who)}说的（不要念）：“${MissionVoiceSpoken(cue, index - 1)}”。` : "",
  ].join("");
  const spoken = MissionVoiceSpoken(cue, index);
  return DRY_VOICE_RULE
    + "@音频1 是这个角色本人的声音：严格保持 @音频1 的音色、年龄感和口音，只按下面的表演改变情绪和音量。"
    + `角色：${cast.persona}。${lang}${context}`
    + `表演：${direction.delivery || "自然、口语化，不是播音腔"}；${PROJECTION_WORDS[direction.projection] || PROJECTION_WORDS.normal}；`
    + `情绪强度 ${Math.round((direction.intensity ?? 0.5) * 10)}/10。`
    + `只说这一句，一个字都不加、不删、不念角色名：“${spoken}”`;
}

async function PatchLines(manifest) {
  if (!patchLines.length) return;
  fs.mkdirSync(patchWork, { recursive: true });
  const jobsList = patchLines.map((id) => {
    const cue = MISSION_DIALOGUE.find((c) => c.perLine && c.lines.some((l) => l.id === id));
    if (!cue) throw new Error(`--patch: unknown line ${id}`);
    const index = cue.lines.findIndex((l) => l.id === id);
    if (!manifest.lines?.[id] || manifest.lines[id].scene !== cue.id) throw new Error(`--patch ${id}: bake the scene first`);
    return { cue, index, line: cue.lines[index] };
  });
  const takes = jobsList.flatMap((job) => Array.from({ length: patchTakes }, (_, k) => ({ ...job, n: k + 1 })));
  const Raw = (t) => path.join(patchWork, `${t.line.id}_${t.n}.raw.mp3`), Meta = (t) => path.join(patchWork, `${t.line.id}_${t.n}.json`);
  if (!dry && !rescore) {
    const todo = takes.filter((t) => force || !fs.existsSync(Raw(t)) || ReadJson(Meta(t))?.promptHash !== Hash(LinePrompt(t.cue, t.index)));
    console.log(`${todo.length} SeedAudio patch requests`);
    const { errors } = await Pool(todo, jobs, async (t) => {
      const prompt = LinePrompt(t.cue, t.index), ref = CastReference(t.line.who);
      const result = await SeedAudioSpeak({ prompt, references: [ref.file], label: `patch ${t.line.id}#${t.n}` });
      fs.writeFileSync(Raw(t), result.bytes);
      fs.writeFileSync(Meta(t), JSON.stringify({ promptHash: Hash(prompt), castSha256: ref.sha256, subtitle: result.subtitle }));
    });
    for (const e of errors) console.error(e.message);
  }
  if (dry) { console.log(`${takes.length} patch requests would be sent`); return; }
  const ready = takes.filter((t) => fs.existsSync(Raw(t)));
  for (const t of ready) {
    const entry = manifest.lines[t.line.id];
    t.file = Raw(t).replace(/\.raw\.mp3$/, ".mp3");
    t.master = MasterLine(Raw(t), t.file, { targetDb: entry.patch?.targetDb ?? entry.metrics.activeRmsDb, padS: LINE_MASTER.padS, ceilingDb: LINE_MASTER.ceilingDb });
    t.meta = ReadJson(Meta(t));
  }
  const castFiles = [...new Set(ready.flatMap((t) => [...new Set(t.cue.lines.map((l) => CastReference(l.who)?.file))]).filter(Boolean))];
  const vectors = SpeakerEmbed([...ready.map((t) => t.file), ...castFiles]);
  const texts = Transcribe(ready.map((t) => ({ file: t.file, lang: t.line.lang === "ja" ? "ja" : "zh", text: MissionVoiceSpoken(t.cue, t.index),
    reference: t.line.lang === "ja" ? JAPANESE_SPEECH[t.line.id]?.kanji : MissionVoiceSpoken(t.cue, t.index) })));
  if (!vectors || !texts) { console.error("patch judge unavailable"); process.exitCode = 1; return; }
  const timings = ReadJson(timingsPath, {});
  for (const job of jobsList) {
    const mine = ready.filter((t) => t.line.id === job.line.id).map((t) => {
      const own = CastReference(t.line.who);
      t.speakerCos = +CenteredCosine(vectors[t.file], vectors[own.file]).toFixed(3);
      t.nearestOther = [...new Set(t.cue.lines.map((l) => l.who))].filter((w) => CastVoiceOwner(w) !== CastVoiceOwner(t.line.who))
        .map((w) => [w, CastReference(w)]).filter(([, r]) => r && vectors[r.file])
        .map(([w, r]) => [w, +CenteredCosine(vectors[t.file], vectors[r.file]).toFixed(3)]).sort((a, b) => b[1] - a[1])[0] || null;
      t.cer = texts[t.file]?.cer ?? null; t.transcript = texts[t.file]?.text ?? null;
      t.score = (t.cer ?? 0.5) * 10 + (1 - t.speakerCos) * 6;
      return t;
    }).sort((a, b) => a.score - b.score);
    if (!mine.length) continue;
    const best = mine[0], entry = manifest.lines[job.line.id];
    const target = path.join(out, job.line.file);
    for (const [sha, t] of Object.entries(timings)) if (t.lineId === job.line.id) delete timings[sha];
    fs.copyFileSync(best.file, target);
    const sha256 = Sha256(target);
    const m = best.master.measure;
    Object.assign(entry, { sha256, seconds: m.seconds, bytes: fs.statSync(target).size, source: "patch",
      patch: { reason: "整段里这一句分错了嗓子 / 念错，单独补录（带本人定妆音），有声段电平对齐到整段里原来那一片",
        replacedSha256: entry.sha256, targetDb: entry.patch?.targetDb ?? entry.metrics.activeRmsDb, takes: mine.length, take: best.n,
        promptHash: Hash(LinePrompt(job.cue, job.index)) },
      metrics: { ...entry.metrics, activeRmsDb: m.activeRmsDb, truePeakDb: m.truePeakDb, snrDb: m.snrDb, voicedS: m.voicedS,
        lowShare: m.lowShare, f0: m.f0, cer: best.cer, transcript: best.transcript, speakerCos: best.speakerCos, nearestOther: best.nearestOther } });
    const words = (best.meta.subtitle?.sentences || []).flatMap((s) => s.words || []).filter((w) => /[\p{L}\p{N}]/u.test(w.text));
    timings[sha256] = { lineId: job.line.id, who: job.line.who, lang: job.line.lang || "zh", seconds: m.seconds, source: "seedaudio-subtitle",
      chars: words.map((w) => [w.text, +Math.max(0, w.start_time / 1000 - best.master.trimStartS).toFixed(3),
        +Math.max(0, w.end_time / 1000 - best.master.trimStartS).toFixed(3)]) };
    const scene = manifest.scenes?.[job.cue.id];
    if (scene) { scene.requests = (scene.requests || 0) + mine.length; (scene.patched ||= []).includes(job.line.id) || scene.patched.push(job.line.id); }
    console.log(`${job.line.id}: patched take ${best.n} cos ${best.speakerCos} other ${best.nearestOther?.join(":")} cer ${best.cer} 「${best.transcript}」`);
  }
  manifest.updatedAt = new Date().toISOString();
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  WriteTimings(timings);
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
  // 逐句场景的整段录音（AudioVoice_FirstLevel<Scene>.mp3）现在是切句的来源，文件保留。
  const files = new Set(MISSION_DIALOGUE.map((cue) => cue.file));
  const orphans = fs.existsSync(out)
    ? fs.readdirSync(out).filter((name) => name.endsWith(".mp3") && !files.has(name))
    : [];
  const liveLines = new Set(MISSION_DIALOGUE.flatMap((cue) => cue.perLine ? cue.lines.map((line) => line.id) : []));
  const staleLines = Object.keys(manifest.lines || {}).filter((id) => !liveLines.has(id));
  const lineDir = path.join(out, "Lines");
  const lineFiles = new Set(MISSION_DIALOGUE.flatMap((cue) => cue.perLine ? cue.lines.map((line) => path.basename(line.file)) : []));
  const lineOrphans = fs.existsSync(lineDir) ? fs.readdirSync(lineDir).filter((name) => name.endsWith(".mp3") && !lineFiles.has(name)) : [];
  const staleScenes = Object.keys(manifest.scenes || {}).filter((id) => !MISSION_DIALOGUE.some((cue) => cue.perLine && cue.id === id));
  for (const id of staleScenes) { console.log(`${dry ? "would prune" : "pruned"} scene ${id}`); if (!dry) delete manifest.scenes[id]; }
  for (const id of stale) { console.log(`${dry ? "would prune" : "pruned"} manifest entry ${id}`); if (!dry) delete manifest.cues[id]; }
  for (const id of staleLines) { console.log(`${dry ? "would prune" : "pruned"} line ${id}`); if (!dry) delete manifest.lines[id]; }
  for (const name of orphans) { console.log(`${dry ? "would delete" : "deleted"} ${name}`); if (!dry) fs.rmSync(path.join(out, name)); }
  for (const name of lineOrphans) { console.log(`${dry ? "would delete" : "deleted"} Lines/${name}`); if (!dry) fs.rmSync(path.join(lineDir, name)); }
  if (!dry && (stale.length || orphans.length || staleLines.length || lineOrphans.length || staleScenes.length)) {
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
  manifest.scenes ||= {};
  const raw = path.join(os.tmpdir(), "Taierzhuang1938FirstLevelSeedAudio");
  if (!dry) {
    fs.mkdirSync(out, { recursive: true });
    fs.mkdirSync(raw, { recursive: true });
  }
  if (prune) { Prune(manifest); return; }
  if (patchLines.length) { await PatchLines(manifest); console.log(`requests ${requestStats.requests}, retries ${requestStats.retries}, failures ${requestStats.failures}`); return; }
  await BakeScenes(manifest);
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
