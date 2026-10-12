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
//        [--rescore] [--attempts=N] [--pick=Scene:n] [--patch=Scene.NN[,…]] [--takes=N] [--remaster=Scene.NN[,…]]
//
//   --only=a,b      只处理这几条 cue          --dry        只列清单与要发的请求数，不发请求
//   --attempts=N    这次允许每场最多到第几次生成（默认 1；有硬错误的场景再跑一遍带 --attempts=2/3 才重抽）
//   --pick=S:n      人工指定场景用第几次生成（先逐句核过转写与嗓子）；--pick=S.NN:n 跟 --patch 一起用：这一句补录装第几条
//   --patch=S.NN    例外：单独补录这一句（带本人定妆音参考），替换整段切出来的那一片；--takes=N 这一句一共几条候选（默认 1；
//                   盘上已有的不重发），末字后隔着静音的杂音（爆音、咔嗒）母带时剪掉
//   --remaster=S.NN 已装上的补录片重新母带（原始 take 不在这个工作区时，拿装上的那一片当原始录音）：剪末字后的杂音、电平重新对齐，不发请求；
//                   整段切出来的片段（source: "scene"）只把首字前 / 末字后静音里孤立的咔嗒静音掉，长度、电平、逐字时间不动（清单 remastered.muted）
//   补录写法看导演表这一句的 patch（不进整段提示词）：delivery 换表演说明、refLines 带本人本场别的句子当参考、span 把相邻几句当小戏
//                   一次生成只取这一句；导演表 f0Hz 是基频中位的目标范围（补录选条时不在范围里的排后面，门禁照它核）
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
  SEED_AUDIO_MODEL, MasterSceneWav, EncodeSegment, FrameRms, ClipRuns, MapSubtitleToLines, SliceScene, IslandLines, TruePeakDb, StripLaughter,
  IsolatedBursts, MuteRanges, PitchShiftWav, EncodeLevelMatched, LoopSpan, PITCH_SHIFT_METHOD }
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
const remasterLines = Arg("remaster")?.split(",").filter(Boolean) || [];
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

/** 这一场里 who 用哪条定妆音（导演表 scene.voices：同一个嗓子的另一种状态；缺省就是本人）。 */
export function SceneVoice(cue, who) {
  return FIRST_LEVEL_DIALOGUE_DIRECTION[cue.id]?.voices?.[who] || who;
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
    const ref = CastReference(SceneVoice(cue, who));
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
    const d = LineDirection(cue, i);
    sum += (d.masterDb ?? PROJECTION_DB[d.projection] ?? PROJECTION_DB.normal) * w; weight += w;
  });
  return +(sum / weight).toFixed(2);
}

/**
 * 整段提示词。参考音本身不进哈希（另记 castSha256）。
 * only（补录用，2026-10-12 R3-Voice）：只演这几句（原句号下标，按顺序）当一场小戏；delivery：{ 原下标: 这一句换用的表演说明 }。
 * 两个都不给时与以前逐字相同（门禁按它核整段录音的 promptHash）。
 */
export function ScenePrompt(cue, { only = null, delivery = {} } = {}) {
  const idx = only || cue.lines.map((_, i) => i);
  const view = only ? { ...cue, lines: idx.map((i) => cue.lines[i]) } : cue;
  const Spoken = (k) => MissionVoiceSpoken(cue, idx[k]);
  const Dir = (k) => ({ ...LineDirection(cue, idx[k]), ...(delivery[idx[k]] ? { delivery: delivery[idx[k]] } : {}) });
  const refs = SceneReferences(view);
  const speakers = SceneSpeakers(view);
  const scene = FIRST_LEVEL_DIALOGUE_DIRECTION[cue.id];
  const langs = new Set(speakers.map((who) => FIRST_LEVEL_VOICE_CAST[who]?.lang || "zh"));
  const interpreterJa = view.lines.some((line) => line.who === "interpreter" && line.lang === "ja");
  const dry = speakers.length > 1
    ? "录音棚近讲干声，单声道，只有下面这几个角色的人声（含稿中写明的笑、喘、闷哼）：没有任何环境声、战场声、脚步、枪炮、爆炸、音效、音乐和混响，开头和结尾不留长空白。"
    : DRY_VOICE_RULE;
  const refText = refs.length
    ? refs.map((r, i) => `@音频${i + 1} 是${r.who.map(Name).join("、")}的声音`).join("，")
      + (refs.length > 1 ? "；每个角色严格保持自己那条参考音的音色、年龄感和口音，谁的句子就用谁的嗓子，绝不串嗓。" : "；严格保持参考音的音色、年龄感和口音。")
    : "";
  // 说话人多于 3 个（参考音上限）时，没挂参考音的人只能照人设出嗓子；2026-10-11 BunkerBanter 五个人，第一次生成里没挂参考音的
  // 幺娃、何有田借了刘文财、冬瓜的嗓子。这句只在有这种人时才加（其余场景的提示词逐字不变）。
  const unreferenced = refs.length ? speakers.filter((who) => RefIndex(refs, who) < 0) : [];
  const unrefText = unreferenced.length
    ? `${unreferenced.map(Name).join("、")}没有参考音：照下面的人设用他自己的嗓子，和 @音频1${refs.length > 1 ? `–@音频${refs.length}` : ""} 每一个都必须明显不是同一个人，绝不借用参考音的嗓子。`
    : "";
  const cast = speakers.map((who) => `${Name(who)}：${FIRST_LEVEL_VOICE_CAST[SceneVoice(cue, who)].persona}`).join("；");
  const langRules = [
    langs.has("zh") ? "川军都讲地道四川话，用四川方言的语调、声调与发音，不是普通话加几个四川词" : "",
    langs.has("zh-north") ? `翻译讲鲁南北方官话（山东口音），绝不说四川话${interpreterJa ? "；他说日语时带很重的中国北方口音，发音生硬" : ""}` : "",
    langs.has("ja") ? "日兵是日语母语者，只说给出的日语（假名照日语念），不说中文" : "",
  ].filter(Boolean).join("；");
  const notes = view.lines.map((line, i) => {
    const d = Dir(i);
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
  const script = view.lines.map((line, i) => {
    const k = RefIndex(refs, line.who);
    return `${k >= 0 ? `@音频${k + 1} ` : ""}${Name(line.who)}：“${Spoken(i)}”`;
  }).join("\n");
  const together = view.lines.length > 1
    ? "这是同一场戏一次录完：人物在同一个地方、彼此对着说话，听得见对方；按下面的表演说明接话、停顿、抢话，喊的就喊、低声的就低声。"
    : "";
  return `${dry}${refText}${unrefText}场景：${scene?.context || cue.delivery || ""}。人物：${cast}。${langRules}。${together}`
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
    && fs.existsSync(path.join(out, cue.file)) && cue.lines.every((line) => fs.existsSync(path.join(out, line.file)))
    && cue.lines.every((line, i) => manifest.lines?.[line.id]?.source === "patch"
      || ((manifest.lines?.[line.id]?.tempo ?? 1) === (LineDirection(cue, i).tempo ?? 1) && SameCut(manifest.lines?.[line.id], cue, i)));
}

/** 切句时的变调（pitchShift）与循环句首尾（loop）和导演表一致：改了导演表这两项，切好的片段作废、重切（不用重新生成）。 */
function SameCut(s, cue, i) {
  const d = LineDirection(cue, i);
  return (s?.pitchShift?.semitones ?? 0) === (d.pitchShift?.semitones ?? 0) && !!s?.loop === !!d.loop;
}

/** 生成一次整段。 */
async function GenerateAttempt(cue, n) {
  const prompt = ScenePrompt(cue), refs = SceneReferences(cue);
  if (prompt.length > 3000) throw new Error(`${cue.id}: scene prompt exceeds 3000 characters (${prompt.length})`);
  const result = await SeedAudioSpeak({ prompt, references: refs.map((r) => r.file), label: `${cue.id}#${n}` });
  // 同号旧生成（旧提示词）挪到带旧提示词哈希的名字下留档，不覆盖（2026-10-12 R3-Voice：改了提示词再生成，第 1 次就把
  // 上一种写法的第 1 条原始 take 盖掉了，没法再拿来比、再装）。
  const old = ReadJson(AttemptMeta(cue, n));
  if (old && old.promptHash !== Hash(prompt)) {
    const tag = String(old.promptHash).slice(0, 8);
    for (const [from, to] of [[AttemptRaw(cue, n), AttemptRaw(cue, n).replace(/\.raw\.mp3$/, `.${tag}.raw.mp3`)],
      [AttemptMeta(cue, n), AttemptMeta(cue, n).replace(/\.json$/, `.${tag}.json`)], [AttemptDir(cue, n), `${AttemptDir(cue, n)}.${tag}`]])
      if (fs.existsSync(from)) { fs.rmSync(to, { recursive: true, force: true }); fs.renameSync(from, to); }
  }
  fs.rmSync(AttemptDir(cue, n), { recursive: true, force: true });   // 同号旧生成的切片与打分作废
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
  // 满幅连续 ≥ 3 个采样算一处削波；一两处是单个峰顶碰了满幅（母带限幅后已压到 −1 dBTP 以下），三处以上才算爆音。
  if (clip >= 3) hard.push(`削波 ${clip} 处`);
  else if (clip) flags.push(`原始 take 有 ${clip} 处满幅峰顶（母带已限幅）`);
  // 句首多念的半句（2026-10-11 BunkerBanter#2：刘文财先嘟囔了一遍「多的没得」，停了半秒才念整句「一人三夹，多的没得。」）。
  // 第一句前面没有别的句子，多出来的字全归给它。逐字时间戳里从第 k 个字起能一字不差地对上整句稿面、前面那几个字都是稿里
  // 本来有的字、且与整句之间隔着 ≥ 0.25 s 的停顿时，把前面那几个字剪掉（切句从整句开头起，整段录音不动），记一条提示。
  {
    const m0 = mapped[0], want = [...spoken[0]].filter((c) => /[\p{L}\p{N}]/u.test(c)).join("");
    for (let k = 1; m0?.chars && k + want.length <= m0.chars.length; k++) {
      const head = m0.chars.slice(0, k), rest = m0.chars.slice(k);
      if (rest.slice(0, want.length).map(([c]) => c).join("") !== want || rest[0][1] - head.at(-1)[2] < 0.25
        || !head.every(([c]) => want.includes(c))) continue;
      Object.assign(m0, { chars: rest, start: rest[0][1], headTrimmed: true });
      flags.push(`${cue.lines[0].id} 句首多念了「${head.map(([c]) => c).join("")}」，切句从整句开头起`);
      break;
    }
  }
  const subtitleChars = mapped.reduce((t, m) => t + m.chars.length, 0), scriptChars = mapped.reduce((t, m) => t + m.total, 0);
  // 非词的人声（台词表 vocal：嚎、憋住的痛叫、冲锋时逼出来的喊，2026-10-11）：稿面那几个「啊」「呃」只是给 TTS 的提示，
  // 时间戳对不上字、多出几个「啊」都不算漏句 / 多念。只给单句场景用：整段就是这一句，按有声段切。
  const vocalScene = cue.lines.length === 1 && cue.lines[0].vocal;
  if (vocalScene && (mapped[0].start == null || mapped[0].coverage < SCENE_CHECK.minCoverage)) {
    Object.assign(mapped[0], { start: 0, end: meta.seconds || MeasureVoice(raw).seconds, vocalWhole: true });
    flags.push(`${cue.lines[0].id} 是非词人声，时间戳对不上字，整段按有声段切`);
  }
  if (!meta.subtitle?.sentences?.length && !vocalScene) hard.push("没有逐字时间戳");
  if (subtitleChars > scriptChars * (1 + SCENE_CHECK.extraChars) + 2 && !vocalScene) hard.push(`多念（时间戳 ${subtitleChars} 字 / 稿 ${scriptChars} 字）`);
  mapped.forEach((m, i) => { if (!m.vocalWhole && (m.start == null || m.coverage < SCENE_CHECK.minCoverage)) hard.push(`漏句 ${cue.lines[i].id}（对上 ${m.matched}/${m.total} 字）`); });
  if (hard.some((h) => h.startsWith("漏句") || h === "没有逐字时间戳")) return { cue, n, hard, flags, mapped, slices: null };
  let extraDb = 0, master, slices, files, cutMethod = "subtitle";
  for (let round = 0; round < 3; round++) {
    master = MasterSceneWav(raw, wav, { targetDb: SceneTargetDb(cue), ceilingDb: LINE_MASTER.ceilingDb, extraDb });
    const measure = MeasureVoice(wav);
    const shift = master.trimStartS;
    const effort = (i) => ({ effortBefore: !!LineDirection(cue, i).effort?.before, effortAfter: !!LineDirection(cue, i).effort?.after });
    const framesInfo = FrameRms(wav);
    const lines = mapped.map((m, i) => ({ start: m.start - shift, end: m.end - shift, ...effort(i) }));
    slices = SliceScene(framesInfo, lines, { activeRmsDb: measure.activeRmsDb, padS: LINE_MASTER.padS });
    // 逐字时间戳偶尔不可信（后几句的字被挤进一两百毫秒）：任何一句切出来太短、或时间戳给的字速快得不像人话，
    // 就改用「只看静音 + 预计时长占比」的切法；切得对不对由后面的逐句转写与嗓子检查兜底。
    // 两个字的短句（「たて」）也算：2026-09-29 CaptiveDragged 两次生成都把它挤进 0.12 s，按它切会把「立」切进上一句。
    const tooFast = mapped.some((m) => (m.total >= 3 && (m.end - m.start) < 0.06 * m.total) || (m.total === 2 && m.end - m.start < 0.2));
    const tooShort = slices.some((s, i) => s.endS - s.startS < Math.min(0.35, 0.1 + 0.05 * mapped[i].total));
    cutMethod = "subtitle";
    // 句首多念剪掉的第一句：片段从整句第一个字前 padS 起（SliceScene 的第一片缺省从整段开头起）。
    if (mapped[0].headTrimmed) slices[0].startS = +Math.max(slices[0].startS, lines[0].start - LINE_MASTER.padS).toFixed(3);
    if (tooFast || tooShort) {
      const weights = cue.lines.map((line, i) => Math.max(0.25, [...MissionVoiceSpoken(cue, i)].filter((c) => /[\p{L}\p{N}]/u.test(c)).length / (line.lang === "ja" ? 7.5 : 4.6)));
      const pauses = cue.lines.map((_, i) => LineDirection(cue, i).pauseBeforeS || 0);
      const islands = IslandLines(framesInfo, weights, { activeRmsDb: measure.activeRmsDb, pauses });
      if (islands) {
        slices = SliceScene(framesInfo, islands.map((l, i) => ({ ...l, ...effort(i) })), { activeRmsDb: measure.activeRmsDb, padS: LINE_MASTER.padS });
        cutMethod = "silence";
        flags.push(`逐字时间戳不可信（${tooFast ? "字速过快" : "切出过短的片段"}），改按静音与预计时长切`);
      } else hard.push("逐字时间戳不可信，静音段也不够切");
    }
    // 导演循环播放的句子（loop）：首尾都退到静音里、各淡 loopFadeS（2026-10-12 R4-Voice CaptiveHowl 接缝）；邻句间隔跟着重算。
    slices.forEach((s, i) => {
      if (!LineDirection(cue, i).loop) return;
      const span = LoopSpan(framesInfo, s, { activeRmsDb: measure.activeRmsDb, fadeS: LINE_MASTER.loopFadeS,
        minS: i ? slices[i - 1].endS : 0, maxS: i + 1 < slices.length ? slices[i + 1].startS : framesInfo.seconds });
      Object.assign(s, { startS: span.startS, endS: span.endS, edgeDb: span.edgeDb,
        loop: { fadeS: LINE_MASTER.loopFadeS, ...(span.cutTailS ? { cutTailS: span.cutTailS } : {}), ...(span.cutHeadS ? { cutHeadS: span.cutHeadS } : {}) } });
    });
    slices.forEach((s, i) => { s.gapBeforeS = i ? +(s.startS - slices[i - 1].endS).toFixed(3) : 0; });
    const sceneMp3 = EncodeSegment(wav, path.join(dir, "scene.mp3"), { fadeS: 0 });
    files = slices.map((s, i) => EncodeLine(cue, i, s, wav, path.join(dir, `line_${String(i + 1).padStart(2, "0")}.mp3`)));
    const peaks = [sceneMp3, ...files].map(TruePeakDb);
    const worst = Math.max(...peaks);
    master.measure = { ...measure, truePeakDb: +peaks[0].toFixed(2) };
    master.slicePeaks = peaks.slice(1).map((p) => +p.toFixed(2));
    if (worst <= LINE_MASTER.ceilingDb) break;
    extraDb -= worst - LINE_MASTER.ceilingDb + 0.2;
  }
  master.targetDb = SceneTargetDb(cue);
  master.cutMethod = cutMethod;
  slices.forEach((s, i) => {
    if (s.tightStart || s.tightEnd) flags.push(`${cue.lines[i].id} 与邻句贴着，在能量最低处切（10 ms 淡入淡出）`);
    s.file = files[i];
    // 压快过的句子：逐字时间跟着缩（片段里的秒 = 整段区间里的秒 / tempo）。
    const tempo = LineDirection(cue, i).tempo ?? 1;
    if (tempo !== 1) s.tempo = tempo;
    // 首尾两头都夹进片段：末字的时间戳可能落在切点之后（2026-09-29 CaptiveInterrogation.09 的「す」起点比片段长 0.01 s）。
    const len = s.endS - s.startS, Clamp = (t) => Math.min(len, Math.max(0, t - master.trimStartS - s.startS)) / tempo;
    s.chars = mapped[i].chars.map(([c, a, b]) => [c, +Clamp(a).toFixed(3), +Clamp(b).toFixed(3)]);
    s.coverage = mapped[i].coverage;
  });
  return { cue, n, hard, flags, mapped, slices, master, sceneFile: path.join(dir, "scene.mp3") };
}

/**
 * 编一句切片：缺省就是整段母带 wav 的 [startS, endS]（两头 crossfadeS，循环句 loopFadeS）。导演表写了 pitchShift 的句子
 * （2026-10-12 R4-Voice CaptiveWoundTwist）从整段保共振峰变调后的 wav 上切同一段，电平补回不变调那一片（片段不单独归一的
 * 口径不破：补的只是 rubberband 吃掉的那几 dB），s.pitchShift 记半音数、方法、补的增益与渲染延迟。
 */
function EncodeLine(cue, i, s, wav, output) {
  const d = LineDirection(cue, i);
  const options = { startS: s.startS, endS: s.endS, fadeS: d.loop ? LINE_MASTER.loopFadeS : LINE_MASTER.crossfadeS, tempo: d.tempo ?? 1 };
  EncodeSegment(wav, output, options);
  if (!d.pitchShift) return output;
  const plain = MeasureVoice(output).activeRmsDb, shifted = output.replace(/\.mp3$/, `.pitch${d.pitchShift.semitones}.wav`);
  const { lagS } = PitchShiftWav(wav, shifted, d.pitchShift.semitones);
  const { gainDb } = EncodeLevelMatched(shifted, output, options, plain);
  fs.rmSync(shifted, { force: true });
  s.pitchShift = { semitones: d.pitchShift.semitones, method: PITCH_SHIFT_METHOD, gainDb, lagS, plainActiveRmsDb: plain };
  return output;
}

/** 一批生成一起打分：一次 whisper、一次音色编码（各自起一次 python）。 */
function Judge(results) {
  const cut = results.filter((r) => r.slices);
  const lineJobs = cut.flatMap((r) => r.slices.map((s, i) => ({ r, s, i, line: r.cue.lines[i] })));
  const castFiles = [...new Set(lineJobs.map((j) => CastReference(SceneVoice(j.r.cue, j.line.who))?.file).filter(Boolean))];
  // 句前句后写了笑/喘（effort）的句子：嗓子只量念台词那一段（逐字时间首字前 0.1 s 到末字后 0.2 s）。
  // 狂笑、怪笑跟定妆独白的音色向量本来就远，整片去量会把本人的句子判成「像别人」。
  for (const j of lineJobs) {
    const effort = LineDirection(j.r.cue, j.i).effort;
    j.laugh = !!(effort?.before || effort?.after);
    const chars = j.s.chars || [];
    if (!j.laugh || chars.length < 2) continue;
    const startS = Math.max(0, chars[0][1] - 0.1), endS = Math.min(j.s.endS - j.s.startS, chars.at(-1)[2] + 0.2);
    if (endS - startS < 0.6 || endS - startS > 0.85 * (j.s.endS - j.s.startS)) continue;
    j.s.speakerSpanS = [+startS.toFixed(3), +endS.toFixed(3)];
    j.embedFile = EncodeSegment(j.s.file, j.s.file.replace(/\.mp3$/, ".span.mp3"), { startS, endS });
  }
  const vectors = SpeakerEmbed([...lineJobs.map((j) => j.embedFile || j.s.file), ...castFiles]);
  const texts = Transcribe(lineJobs.map((j) => ({ file: j.s.file, lang: j.line.lang === "ja" ? "ja" : "zh",
    text: MissionVoiceSpoken(j.r.cue, j.i), ...(j.laugh ? { extraTokens: 64 } : {}),
    reference: j.line.lang === "ja" ? JAPANESE_SPEECH[j.line.id]?.kanji : MissionVoiceSpoken(j.r.cue, j.i) })));
  if (!texts || !vectors) {
    console.error(`scene judge aborted: ${!texts ? "whisper transcription" : "speaker embedding"} unavailable; rerun with --rescore`);
    process.exitCode = 1;
    return false;
  }
  for (const { r, s, i, line, embedFile } of lineJobs) {
    const voiceFile = embedFile || s.file;
    s.measure = MeasureVoice(s.file);
    s.measure.truePeakDb = r.master.slicePeaks[i];
    s.cer = texts[s.file]?.cer ?? null;
    s.transcript = texts[s.file]?.text ?? null;
    if ((r.master.cutMethod === "silence" || r.mapped[i]?.vocalWhole) && texts[s.file]?.chars?.length) { s.chars = texts[s.file].chars; s.charSource = "whisper-forced"; }
    const own = CastReference(SceneVoice(r.cue, line.who));
    s.speakerCos = own && vectors[voiceFile] && vectors[own.file] ? +CenteredCosine(vectors[voiceFile], vectors[own.file]).toFixed(3) : null;
    const others = [...new Set(r.cue.lines.map((l) => l.who))].filter((who) => who !== line.who)
      .map((who) => [who, CastReference(SceneVoice(r.cue, who))]).filter(([, ref]) => ref && ref.owner !== own?.owner).filter(([, ref]) => ref && vectors[ref.file])
      .map(([who, ref]) => [who, +CenteredCosine(vectors[voiceFile], vectors[ref.file]).toFixed(3)]).sort((a, b) => b[1] - a[1]);
    s.nearestOther = others[0] || null;
    // 分错嗓子只跟本场挂了参考音的人比：没挂参考音的人（第 4 个说话人）这场里的嗓子本来就不是他的定妆音。
    const refs = SceneReferences(r.cue);
    const referencedOther = others.find(([who]) => RefIndex(refs, who) >= 0) || null;
    s.referencedOther = referencedOther;
    const judged = s.measure.voicedS >= SCENE_CHECK.judgeVoicedS;
    const maxSeconds = LineDirection(r.cue, i).maxSeconds;
    if (maxSeconds && s.measure.seconds > maxSeconds) r.hard.push(`${line.id} 片段 ${s.measure.seconds} s 超过导演表上限 ${maxSeconds} s`);
    // 导演表 f0Hz：片段基频中位（MeasureVoice）不在范围里算硬错误重抽（2026-10-12 R3-Voice：CaptiveWoundTwist 那条 340 Hz 像呜咽）。
    const f0Hz = LineDirection(r.cue, i).f0Hz;
    if (f0Hz && !(s.measure.f0?.median >= f0Hz[0] && s.measure.f0?.median <= f0Hz[1])) r.hard.push(`${line.id} 基频中位 ${s.measure.f0?.median} Hz 不在导演表 ${f0Hz[0]}–${f0Hz[1]} Hz`);
    if (!judged) r.flags.push(`${line.id} 有声 ${s.measure.voicedS} s，太短不判嗓子与字错率`);
    if (judged && s.speakerCos != null && referencedOther && referencedOther[1] - s.speakerCos > SCENE_CHECK.wrongVoiceMargin)
      r.hard.push(`${line.id} 像${Name(referencedOther[0])}的嗓子（本人 ${s.speakerCos} / ${referencedOther[0]} ${referencedOther[1]}）`);
    else if (s.speakerCos != null && s.nearestOther && s.nearestOther[1] - s.speakerCos > SCENE_CHECK.wrongVoiceMargin)
      r.flags.push(`${line.id} 与${Name(s.nearestOther[0])}的定妆音更近（本人 ${s.speakerCos} / ${s.nearestOther[1]}；${judged ? "对方本场没挂参考音" : "片段太短"}）`);
    // 字错率高但字数对得上 = 四川话被 whisper 写成普通话同音字（人工逐字核对）；字数也差得多才算念错 / 漏词。
    const want = [...MissionVoiceSpoken(r.cue, i)].filter((c) => /[\p{L}\p{N}]/u.test(c)).length;
    const got = [...StripLaughter(s.transcript || "", MissionVoiceSpoken(r.cue, i) + (JAPANESE_SPEECH[line.id]?.kanji || ""))]
      .filter((c) => /[\p{L}\p{N}]/u.test(c)).length;
    s.lengthDiff = got - want;
    // 太短不判的片段也不能一个字都对不上：2026-09-29 CaptiveDragged 逐字时间把「たて」挤成 0.12 s，
    // 「立」切进了上一句、这一片只剩「て」（0.24 s，转写「ヘッ」），原来的检查全放过去了。
    // 非词人声（line.vocal）没有「念错词」这回事：字错率照量、超门槛照样要人工核对记录，但不算硬错误。
    if (line.vocal) { if (s.cer != null && s.cer > SCENE_CHECK.maxCer) r.flags.push(`${line.id} 非词人声，字错率 ${s.cer} 待人工核对「${s.transcript}」`); continue; }
    if (!judged && want >= 2 && s.cer != null && s.cer >= 1) r.hard.push(`${line.id} 只切到 ${s.measure.voicedS} s 且转写对不上「${s.transcript}」，切句错位`);
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
  const missingCast = [...new Set(cues.flatMap((cue) => cue.lines.map((l) => SceneVoice(cue, l.who))).filter((who) => !CastReference(who)))];
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
  // 装上的整段还带没处理的硬错误、且这次允许再多生成一次的场景，也要重抽。
  const unresolved = (cue) => (manifest.scenes?.[cue.id]?.hard || []).some((why) => !(manifest.scenes[cue.id].patched || []).some((id) => why.startsWith(id)))
    && (manifest.scenes[cue.id].attempts?.length || 0) < maxAttempt;
  const pending = cues.filter((cue) => !SceneUpToDate(cue, manifest) || unresolved(cue) || rescore || forcedScenePicks.has(cue.id));
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
    // 导演表的 tempo 改过：切好的片段作废，重切重打分（不用重新生成）。
    const sameTempo = judged?.lines?.every((s, i) => (s.tempo ?? 1) === (LineDirection(cue, i).tempo ?? 1) && SameCut(s, cue, i)) ?? true;
    if (judged && sameTempo && !rescore && fs.existsSync(path.join(AttemptDir(cue, n), "scene.wav"))) {
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
  // 已经单独补录过、且补录替换的正是这次这一片的句子：补录保留（重新打分不会把补录冲掉）。
  const kept = new Set(cue.lines.filter((line, i) => {
    const old = manifestLines[line.id];
    return old?.source === "patch" && old.patch?.replacedSha256 === Sha256(best.slices[i].file);
  }).map((line) => line.id));
  // 这一场旧的逐字时间（以旧片段 sha 为键）作废；保留的补录句除外。
  for (const [sha, t] of Object.entries(timings)) if (cue.lines.some((l) => l.id === t.lineId && !kept.has(l.id))) delete timings[sha];
  cue.lines.forEach((line, i) => {
    const s = best.slices[i];
    if (kept.has(line.id)) { Object.assign(manifestLines[line.id], { sceneSha256: sceneSha }); return; }
    const target = path.join(out, line.file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(s.file, target);
    const sha256 = Sha256(target);
    const d = LineDirection(cue, i);
    const own = CastReference(SceneVoice(cue, line.who));
    manifestLines[line.id] = {
      file: line.file, scene: cue.id, index: i, who: line.who, lang: line.lang || "zh", projection: d.projection,
      seconds: s.measure.seconds, bytes: fs.statSync(target).size, sha256, source: "scene",
      sceneSha256: sceneSha, sceneStartS: s.startS, sceneEndS: s.endS, gapBeforeS: s.gapBeforeS,
      tight: [!!s.tightStart, !!s.tightEnd], edgeDb: s.edgeDb, cutMethod: best.master.cutMethod || "subtitle",
      ...(s.tempo ? { tempo: s.tempo } : {}), ...(s.pitchShift ? { pitchShift: s.pitchShift } : {}), ...(s.loop ? { loop: s.loop } : {}),
      castOwner: own?.owner || CastVoiceOwner(SceneVoice(cue, line.who)), castSha256: own?.sha256 || null, referenced: RefIndex(refs, line.who) >= 0,
      metrics: { activeRmsDb: s.measure.activeRmsDb, truePeakDb: s.measure.truePeakDb, snrDb: s.measure.snrDb,
        voicedS: s.measure.voicedS, lowShare: s.measure.lowShare, f0: s.measure.f0, cer: s.cer, transcript: s.transcript,
        speakerCos: s.speakerCos, nearestOther: s.nearestOther, referencedOther: s.referencedOther ?? null,
        lengthDiff: s.lengthDiff ?? null, subtitleCoverage: s.coverage, sceneGainDb: best.master.gainDb,
        ...(s.speakerSpanS ? { speakerSpanS: s.speakerSpanS } : {}) },
      mastering: "SliceOfWholeSceneMaster",
    };
    timings[sha256] = { lineId: line.id, who: line.who, lang: line.lang || "zh", seconds: s.measure.seconds,
      source: s.charSource || "seedaudio-subtitle", chars: s.chars };
  });
  delete manifest.cues?.[cue.id];   // 旧的带环境声整段（03–06）作废
  const requests = all.length + [...kept].reduce((n, id) => n + (manifestLines[id].patch?.takes || 0), 0);
  scenes[cue.id] = {
    file: cue.file, sha256: sceneSha, seconds: best.master.measure.seconds, bytes: fs.statSync(sceneTarget).size,
    promptHash: Hash(ScenePrompt(cue)), castKey: refs.map((r) => r.sha256).join(","),
    references: refs.map((r) => ({ who: r.who, owner: r.owner, castSha256: r.sha256 })),
    lines: cue.lines.map((l) => l.id), attempt: best.n, pickedBy, requests, ...(kept.size ? { patched: [...kept] } : {}),
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

/**
 * 补录单句的提示词（旧逐句口径）。导演表这一句的 patch（只进补录、不进整段提示词，2026-10-12 R3-Voice）：
 *   delivery  补录时换用的表演说明（整段录音里那句的说明不动）
 *   refLines  ["NN", …]：本场这几句装上的片段一起当参考音送（@音频2…；同一个人前面刚说过的句子，对准嗓子用，不念）
 * 没写 patch 的句子提示词与以前逐字相同。
 */
export function LinePrompt(cue, index) {
  const line = cue.lines[index], cast = FIRST_LEVEL_VOICE_CAST[SceneVoice(cue, line.who)];
  if (!cast) throw new Error(`${cue.id}: ${line.who} has no cast entry in Data_FirstLevelVoiceCast`);
  const direction = LineDirection(cue, index), patch = direction.patch || {};
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
  const refText = PatchRefLines(cue, index).map(({ i }, k) =>
    `@音频${k + 2} 是他本人在这场戏里刚说过的“${MissionVoiceSpoken(cue, i)}”：同一个人、同一个嗓子、同一次录音里的状态，只用来对准嗓子，不要念它。`).join("");
  const spoken = MissionVoiceSpoken(cue, index);
  return DRY_VOICE_RULE
    + "@音频1 是这个角色本人的声音：严格保持 @音频1 的音色、年龄感和口音，只按下面的表演改变情绪和音量。"
    + refText
    + `角色：${cast.persona}。${lang}${context}`
    + `表演：${patch.delivery || direction.delivery || "自然、口语化，不是播音腔"}；${PROJECTION_WORDS[direction.projection] || PROJECTION_WORDS.normal}；`
    + `情绪强度 ${Math.round((direction.intensity ?? 0.5) * 10)}/10。`
    + `只说这一句，一个字都不加、不删、不念角色名：“${spoken}”`;
}

/** 导演表 patch.refLines 指的本场句子（同一个人说的），{ i: 下标, id }。 */
function PatchRefLines(cue, index) {
  const refLines = LineDirection(cue, index).patch?.refLines || [];
  return refLines.map((nn) => ({ i: cue.lines.findIndex((l) => l.id === `${cue.id}.${nn}`), id: `${cue.id}.${nn}` })).map((r) => {
    if (r.i < 0 || cue.lines[r.i].who !== cue.lines[index].who) throw new Error(`${cue.lines[index].id}: patch.refLines ${r.id} 不是本人在本场说的句子`);
    return r;
  });
}

/**
 * 一句补录怎么请求。缺省 = 单句（LinePrompt，本人定妆音 + patch.refLines 的片段）；导演表 patch.span = ["NN", "MM"]：
 * 把本场 NN…MM 这几句当一场小戏一次生成（ScenePrompt only，参考音照这几句的说话人挂），只取要补的那一句（2026-10-12 R3-Voice：
 * BunkerBanter.09 三次单句补录都是 108–127 Hz，比顺子本场其它句低三成多，试「带着上下文一起演」）。
 */
function PatchPlan(cue, index) {
  const patch = LineDirection(cue, index).patch || {};
  if (patch.span) {
    const [a, b] = patch.span.map((nn) => cue.lines.findIndex((l) => l.id === `${cue.id}.${nn}`));
    if (a < 0 || b < a || index < a || index > b) throw new Error(`${cue.lines[index].id}: patch.span ${patch.span.join("–")} 要包住这一句`);
    const only = Array.from({ length: b - a + 1 }, (_, k) => a + k);
    const prompt = ScenePrompt(cue, { only, delivery: patch.delivery ? { [index]: patch.delivery } : {} });
    const refs = SceneReferences({ ...cue, lines: only.map((i) => cue.lines[i]) });
    return { mode: `span ${patch.span.join("–")}`, prompt, references: refs.map((r) => ({ file: r.file, sha256: r.sha256 })), only, k: only.indexOf(index) };
  }
  const own = CastReference(SceneVoice(cue, cue.lines[index].who));
  const extra = PatchRefLines(cue, index).map(({ id }) => {
    const entry = ReadJson(manifestPath)?.lines?.[id];
    if (!entry) throw new Error(`${cue.lines[index].id}: patch.refLines ${id} 还没有录音`);
    return { file: path.join(out, entry.file), sha256: entry.sha256, line: id };
  });
  return { mode: extra.length ? `line+${extra.map((r) => r.line).join(",")}` : "line", prompt: LinePrompt(cue, index),
    references: [{ file: own.file, sha256: own.sha256 }, ...extra] };
}
const PlanHash = (plan) => Hash(plan.prompt + "\n" + plan.references.map((r) => r.sha256).join(","));

/** 小戏生成里切出要补的那一句，写成这一条补录的原始 take（逐字时间平移到切出来的这段）。 */
function CutSpanTake(spanRaw, raw, plan, cue, subtitle) {
  const mapped = MapSubtitleToLines(plan.only.map((i) => MissionVoiceSpoken(cue, i)), subtitle);
  const m = mapped[plan.k];
  if (m.start == null || m.coverage < SCENE_CHECK.minCoverage) throw new Error(`span take: ${cue.lines[plan.only[plan.k]].id} 没对上（${m.matched}/${m.total} 字）`);
  const prevEnd = plan.k > 0 ? mapped[plan.k - 1].end ?? 0 : 0, next = mapped[plan.k + 1]?.start ?? null;
  const startS = Math.max(0, Math.min(m.start - 0.05, Math.max(prevEnd + 0.05, m.start - 0.3)));
  const endS = next != null ? Math.max(m.end + 0.05, Math.min(next - 0.05, m.end + 0.4)) : null;
  const cut = spawnSync(process.env.FFMPEG || "ffmpeg", ["-y", "-v", "error", "-i", spanRaw, "-af",
    `atrim=start=${startS.toFixed(3)}${endS != null ? `:end=${endS.toFixed(3)}` : ""},asetpts=PTS-STARTPTS`, "-ac", "1", "-ar", "44100", "-q:a", "2", raw],
  { encoding: "utf8", windowsHide: true });
  if (cut.status !== 0) throw new Error(`span take: cut failed ${cut.stderr?.slice(0, 160)}`);
  return { sentences: [{ words: m.chars.map(([c, a, b]) => ({ text: c, start_time: Math.round((a - startS) * 1000), end_time: Math.round((b - startS) * 1000) })) }],
    span: { startS: +startS.toFixed(3), endS: endS != null ? +endS.toFixed(3) : null, lines: mapped.map((x) => ({ start: x.start, end: x.end, coverage: x.coverage })) } };
}

/**
 * --remaster 循环句 / 变调句（导演表 loop / pitchShift，2026-10-12 R4-Voice）：整段母带 wav 不在这个工作区时，拿装上的整段 mp3
 * 解码重切这一句（不发请求）。loop：首尾退到静音里、各淡 loopFadeS；pitchShift：从整段保共振峰变调后的 wav 上切同一段。
 * 电平：变调句对回原清单值（不变调那一片的有声段电平），循环句对回整段 mp3 解码出来的同一段（只补多编那一遍的 0.45 dB）。
 * 结果挂在 job.reslice，由 PatchLines 后面统一转写、量嗓子、装上。
 */
function ResliceFromScene(job, entry, d, manifest) {
  const sceneFile = path.join(out, job.cue.file), wav = path.join(patchWork, `${job.line.id}_scene.wav`);
  const decoded = spawnSync(process.env.FFMPEG || "ffmpeg", ["-y", "-v", "error", "-i", sceneFile, "-ac", "1", "-ar", "44100", "-c:a", "pcm_f32le", wav],
    { encoding: "utf8", windowsHide: true });
  if (decoded.status !== 0) throw new Error(`--remaster ${job.line.id}: 解不开整段 ${decoded.stderr?.slice(0, 160)}`);
  const framesInfo = FrameRms(wav), activeRmsDb = MeasureVoice(wav).activeRmsDb, lines = job.cue.lines;
  const prev = job.index ? manifest.lines[lines[job.index - 1].id] : null, next = job.index + 1 < lines.length ? manifest.lines[lines[job.index + 1].id] : null;
  let span = { startS: entry.sceneStartS, endS: entry.sceneEndS, edgeDb: entry.edgeDb }, loop = null;
  if (d.loop) {
    span = LoopSpan(framesInfo, span, { activeRmsDb, fadeS: LINE_MASTER.loopFadeS, minS: prev?.sceneEndS ?? 0, maxS: next?.sceneStartS ?? framesInfo.seconds });
    loop = { fadeS: LINE_MASTER.loopFadeS, ...(span.cutTailS ? { cutTailS: span.cutTailS } : {}), ...(span.cutHeadS ? { cutHeadS: span.cutHeadS } : {}) };
  }
  const options = { startS: span.startS, endS: span.endS, fadeS: d.loop ? LINE_MASTER.loopFadeS : LINE_MASTER.crossfadeS, tempo: d.tempo ?? 1 };
  job.file = path.join(patchWork, `${job.line.id}_reslice.mp3`);
  let targetDb = entry.metrics.activeRmsDb, source = wav, pitchShift = null;
  if (!d.pitchShift) {
    // 不编码的同一段（两头同样淡）当电平基准：多出来的这一遍 96k 编码的损失补回来，片段仍是整段里那一段。
    const ref = path.join(patchWork, `${job.line.id}_reslice.ref.wav`);
    const fade = options.fadeS > 0 ? `,afade=t=in:d=${options.fadeS},areverse,afade=t=in:d=${options.fadeS},areverse` : "";
    const rendered = spawnSync(process.env.FFMPEG || "ffmpeg", ["-y", "-v", "error", "-i", wav, "-af",
      `atrim=start=${options.startS.toFixed(4)}:end=${options.endS.toFixed(4)},asetpts=PTS-STARTPTS${fade}`, "-c:a", "pcm_f32le", ref], { encoding: "utf8", windowsHide: true });
    if (rendered.status !== 0) throw new Error(`--remaster ${job.line.id}: ${rendered.stderr?.slice(0, 160)}`);
    targetDb = MeasureVoice(ref).activeRmsDb;
    fs.rmSync(ref, { force: true });
  } else {
    source = path.join(patchWork, `${job.line.id}_scene.pitch${d.pitchShift.semitones}.wav`);
    pitchShift = { semitones: d.pitchShift.semitones, method: PITCH_SHIFT_METHOD, lagS: PitchShiftWav(wav, source, d.pitchShift.semitones).lagS };
  }
  const level = EncodeLevelMatched(source, job.file, options, targetDb);
  if (pitchShift) Object.assign(pitchShift, { gainDb: level.gainDb, targetDb, fromF0Hz: entry.metrics.f0?.median ?? null });
  const why = [d.pitchShift ? `基频中位 ${entry.metrics.f0?.median} Hz 不在导演表 f0Hz ${d.f0Hz?.join("–")} Hz，保共振峰变 ${d.pitchShift.semitones} 半音、电平对回原清单值 ${targetDb} dBFS` : "",
    d.loop ? `导演循环播放：首尾退到静音里、各淡 ${LINE_MASTER.loopFadeS} s${loop?.cutTailS ? `（片尾 ${loop.cutTailS.join("–")} s 是被截断的半声，切掉）` : ""}` : ""].filter(Boolean).join("；");
  job.reslice = { startS: span.startS, endS: span.endS, edgeDb: span.edgeDb, pitchShift, loop, why };
  console.log(`${job.line.id}: 重切 ${span.startS}–${span.endS} s（原 ${entry.sceneStartS}–${entry.sceneEndS}）${pitchShift ? `，变调 ${pitchShift.semitones} 半音 补 ${level.gainDb} dB` : ""} → ${level.activeRmsDb} dBFS`);
}

async function PatchLines(manifest) {
  if (!patchLines.length && !remasterLines.length) return;
  fs.mkdirSync(patchWork, { recursive: true });
  const Job = (id, remaster) => {
    const cue = MISSION_DIALOGUE.find((c) => c.perLine && c.lines.some((l) => l.id === id));
    if (!cue) throw new Error(`--${remaster ? "remaster" : "patch"}: unknown line ${id}`);
    const index = cue.lines.findIndex((l) => l.id === id);
    if (!manifest.lines?.[id] || manifest.lines[id].scene !== cue.id) throw new Error(`--patch ${id}: bake the scene first`);
    return { cue, index, line: cue.lines[index], remaster, slice: remaster && manifest.lines[id].source === "scene" };
  };
  const jobsList = [...patchLines.map((id) => Job(id, false)), ...remasterLines.map((id) => Job(id, true))];
  const timings = ReadJson(timingsPath, {});
  // --remaster 整段切出来的片段（source: "scene"）：只把首字前 / 末字后静音里孤立的咔嗒、爆音静音掉（IsolatedBursts），
  // 长度、电平（编码补偿到 ±0.05 dB）、逐字时间、在整段里的区间都不动；门禁比对整段时同样把这几段置零（清单 remastered.muted）。
  const sliceJobs = jobsList.filter((j) => j.slice);
  for (const job of sliceJobs) {
    const entry = manifest.lines[job.line.id], file = path.join(out, entry.file);
    const d = LineDirection(job.cue, job.index);
    if (d.pitchShift || d.loop) { ResliceFromScene(job, entry, d, manifest); continue; }
    const chars = (timings[entry.sha256]?.chars || []).filter(([, a, b]) => b >= a);
    if (!chars.length) throw new Error(`--remaster ${job.line.id}: 没有逐字时间，找不到首字 / 末字`);
    const bursts = IsolatedBursts(file, { speechStartS: chars[0][1], speechEndS: chars.at(-1)[2] });
    if (!bursts.length) { console.log(`${job.line.id}: 首字前 / 末字后没有孤立的咔嗒，不动`); job.skip = true; continue; }
    job.file = path.join(patchWork, `${job.line.id}_remaster.mp3`);
    job.muted = bursts;
    job.gainDb = MuteRanges(file, job.file, bursts).gainDb;
    console.log(`${job.line.id}: 静音 ${bursts.map(([a, b]) => `${a}–${b} s`).join("、")}（编码补偿 ${job.gainDb} dB）`);
  }
  const patchJobs = jobsList.filter((j) => !j.slice);
  for (const job of patchJobs) {
    if (job.remaster && manifest.lines[job.line.id].source !== "patch") throw new Error(`--remaster ${job.line.id}: only installed patch or scene clips can be remastered`);
    if (!job.remaster) { job.plan = PatchPlan(job.cue, job.index); job.tag = PlanHash(job.plan).slice(0, 8); }
  }
  const takes = patchJobs.flatMap((job) => job.remaster ? [{ ...job, n: "remaster" }] : Array.from({ length: patchTakes }, (_, k) => ({ ...job, n: k + 1 })));
  // 原始 take 的文件名带提示词 + 参考音的哈希：换了补录写法（单句 / 带上一句 / 小戏）之后，旧写法的 take 还留在盘上可比、可 --pick。
  const Raw = (t) => path.join(patchWork, t.remaster ? `${t.line.id}_remaster.raw.mp3` : `${t.line.id}_${t.tag}_${t.n}.raw.mp3`);
  const Meta = (t) => Raw(t).replace(/\.raw\.mp3$/, ".json");
  // 这次真发出去的请求（按句记）：补录条数 = 以前记下的 + 这次新发的。旧的补录 take 可能不在这个工作区（换了 worktree），
  // 不能按盘上的 take 数重算（2026-10-12 前按盘上数，换 worktree 再补录会把以前的请求数抹掉）。
  const sent = new Map();
  if (!dry && !rescore) {
    const todo = takes.filter((t) => !t.remaster && (force || !fs.existsSync(Raw(t)) || ReadJson(Meta(t))?.planHash !== PlanHash(t.plan)));
    console.log(`${todo.length} SeedAudio patch requests`);
    const { errors } = await Pool(todo, jobs, async (t) => {
      const result = await SeedAudioSpeak({ prompt: t.plan.prompt, references: t.plan.references.map((r) => r.file), label: `patch ${t.line.id}#${t.n} (${t.plan.mode})` });
      sent.set(t.line.id, (sent.get(t.line.id) || 0) + 1);
      let subtitle = result.subtitle, span = null;
      if (t.plan.only) {
        const spanRaw = Raw(t).replace(/\.raw\.mp3$/, ".span.mp3");
        fs.writeFileSync(spanRaw, result.bytes);
        ({ span, ...subtitle } = CutSpanTake(spanRaw, Raw(t), t.plan, t.cue, result.subtitle));
      } else fs.writeFileSync(Raw(t), result.bytes);
      fs.writeFileSync(Meta(t), JSON.stringify({ promptHash: Hash(t.plan.prompt), planHash: PlanHash(t.plan), mode: t.plan.mode,
        references: t.plan.references.map((r) => r.sha256), subtitle, ...(span ? { span, spanSubtitle: result.subtitle } : {}) }));
    });
    for (const e of errors) console.error(e.message);
  }
  if (dry) {
    for (const job of patchJobs.filter((j) => !j.remaster)) console.log(`${job.line.id}: ${job.plan.mode}, ${job.plan.references.length} refs, prompt ${job.plan.prompt.length} chars\n${job.plan.prompt}`);
    console.log(`${takes.filter((t) => !t.remaster).length} patch requests would be sent`); return;
  }
  // --remaster：装上的补录片原始 take 不在这个工作区时，拿装上的那一片当原始录音重新母带（剪末字后的杂音、电平重新对齐）。
  // 逐字时间从清单里那一片的逐字时间来（已经是片内的秒）。
  for (const t of takes.filter((x) => x.remaster)) {
    const entry = manifest.lines[t.line.id];
    fs.copyFileSync(path.join(out, entry.file), Raw(t));
    const chars = timings[entry.sha256]?.chars || [];
    fs.writeFileSync(Meta(t), JSON.stringify({ promptHash: entry.patch?.promptHash, remasteredFrom: entry.sha256,
      subtitle: { sentences: [{ words: chars.map(([c, a, b]) => ({ text: c, start_time: Math.round(a * 1000), end_time: Math.round(b * 1000) })) }] } }));
  }
  const ready = takes.filter((t) => fs.existsSync(Raw(t)) && (t.remaster || ReadJson(Meta(t))?.planHash === PlanHash(t.plan)));
  // 补录的目标电平：导演表 patch.masterDb（整段里原来那一片本身就比邻句响太多时用）> 以前记下的 > 原来那一片。
  const TargetDb = (t) => LineDirection(t.cue, t.index).patch?.masterDb ?? manifest.lines[t.line.id].patch?.targetDb ?? manifest.lines[t.line.id].metrics.activeRmsDb;
  for (const t of ready) {
    const entry = manifest.lines[t.line.id];
    t.file = Raw(t).replace(/\.raw\.mp3$/, ".mp3");
    t.meta = ReadJson(Meta(t));
    const words = (t.meta.subtitle?.sentences || []).flatMap((s) => s.words || []).filter((w) => /[\p{L}\p{N}]/u.test(w.text));
    t.words = words;
    const speechEndS = words.length ? Math.max(...words.map((w) => w.end_time)) / 1000 : null;
    const speechStartS = words.length ? Math.min(...words.map((w) => w.start_time)) / 1000 : null;
    // 原始 take 首字前 / 末字后静音里孤立的咔嗒（2026-10-12 BunkerBanter.09 补录 take 片头 25 ms 处一下 −24 dBFS）：先静音掉再母带，
    // 不然 MeasureVoice 把它当成开口，片头那 0.3 s 静音剪不掉、整句往后拖。
    let source = Raw(t);
    if (!t.remaster && speechStartS != null) {
      t.mutedRaw = IsolatedBursts(source, { speechStartS, speechEndS });
      if (t.mutedRaw.length) {
        source = Raw(t).replace(/.raw.mp3$/, ".clean.mp3");
        MuteRanges(Raw(t), source, t.mutedRaw);
        console.log(`${t.line.id}#${t.n}: 原始 take 静音里有咔嗒，母带前静音掉 ${t.mutedRaw.map(([a, b]) => `${a}–${b} s`).join("、")}`);
      }
    }
    t.master = MasterLine(source, t.file, { targetDb: TargetDb(t), padS: LINE_MASTER.padS, ceilingDb: LINE_MASTER.ceilingDb,
      speechEndS, speechStartS });
    if (t.master.tailCutS != null) console.log(`${t.line.id}#${t.n}: 末字后有杂音，剪在原始 take ${t.master.tailCutS} s`);
    if (t.master.leadCutS != null) console.log(`${t.line.id}#${t.n}: 首字前的哼声 / 杂音太长，从原始 take ${t.master.leadCutS} s 起`);
  }
  const judged = [...ready, ...sliceJobs.filter((j) => !j.skip)];
  const castFiles = [...new Set(judged.flatMap((t) => [...new Set(t.cue.lines.map((l) => CastReference(SceneVoice(t.cue, l.who))?.file))]).filter(Boolean))];
  const vectors = SpeakerEmbed([...judged.map((t) => t.file), ...castFiles]);
  const texts = Transcribe(judged.map((t) => ({ file: t.file, lang: t.line.lang === "ja" ? "ja" : "zh", text: MissionVoiceSpoken(t.cue, t.index),
    reference: t.line.lang === "ja" ? JAPANESE_SPEECH[t.line.id]?.kanji : MissionVoiceSpoken(t.cue, t.index) })));
  if (!vectors || !texts) { console.error("patch judge unavailable"); process.exitCode = 1; return; }
  const Voice = (t) => {
    const own = CastReference(SceneVoice(t.cue, t.line.who));
    t.speakerCos = +CenteredCosine(vectors[t.file], vectors[own.file]).toFixed(3);
    const others = [...new Set(t.cue.lines.map((l) => l.who))].filter((w) => w !== t.line.who)
      .map((w) => [w, CastReference(SceneVoice(t.cue, w))]).filter(([, r]) => r && r.owner !== own.owner && vectors[r.file])
      .map(([w, r]) => [w, +CenteredCosine(vectors[t.file], vectors[r.file]).toFixed(3)]).sort((a, b) => b[1] - a[1]);
    t.nearestOther = others[0] || null;
    const refs = SceneReferences(t.cue);
    t.referencedOther = others.find(([who]) => RefIndex(refs, who) >= 0) || null;
    t.cer = texts[t.file]?.cer ?? null; t.transcript = texts[t.file]?.text ?? null; t.whisperChars = texts[t.file]?.chars || null;
  };
  for (const job of sliceJobs.filter((j) => !j.skip)) {
    Voice(job);
    const entry = manifest.lines[job.line.id], target = path.join(out, job.line.file), oldSha = entry.sha256;
    fs.copyFileSync(job.file, target);
    const sha256 = Sha256(target), m = MeasureVoice(target);
    const timing = timings[oldSha];
    delete timings[oldSha];
    if (job.reslice) {
      const r = job.reslice, moved = entry.sceneStartS - r.startS, len = r.endS - r.startS;
      timings[sha256] = { ...timing, seconds: m.seconds,
        chars: timing.chars.map(([c, a, b]) => [c, +Math.min(len, Math.max(0, a + moved)).toFixed(3), +Math.min(len, Math.max(0, b + moved)).toFixed(3)]) };
      const lines = job.cue.lines, next = job.index + 1 < lines.length ? manifest.lines[lines[job.index + 1].id] : null;
      if (next) next.gapBeforeS = +(next.sceneStartS - r.endS).toFixed(3);
      const prev = job.index ? manifest.lines[lines[job.index - 1].id] : null;
      delete entry.pitchShift; delete entry.loop;
      Object.assign(entry, { sha256, bytes: fs.statSync(target).size, seconds: m.seconds, sceneStartS: r.startS, sceneEndS: r.endS,
        gapBeforeS: prev ? +(r.startS - prev.sceneEndS).toFixed(3) : 0, edgeDb: r.edgeDb,
        ...(r.pitchShift ? { pitchShift: r.pitchShift } : {}), ...(r.loop ? { loop: r.loop } : {}),
        resliced: { fromSha256: oldSha, from: "installed scene mp3", why: r.why },
        metrics: { ...entry.metrics, activeRmsDb: m.activeRmsDb, truePeakDb: +TruePeakDb(target).toFixed(2), snrDb: m.snrDb, voicedS: m.voicedS,
          lowShare: m.lowShare, f0: m.f0, cer: job.cer, transcript: job.transcript, speakerCos: job.speakerCos, nearestOther: job.nearestOther,
          referencedOther: job.referencedOther } });
      console.log(`${job.line.id}: resliced ${oldSha.slice(0, 8)} → ${sha256.slice(0, 8)} ${r.startS}–${r.endS} s rms ${m.activeRmsDb} f0 ${m.f0.median} cos ${job.speakerCos} cer ${job.cer} 「${job.transcript}」`);
      continue;
    }
    timings[sha256] = { ...timing, seconds: m.seconds };
    Object.assign(entry, { sha256, bytes: fs.statSync(target).size, seconds: m.seconds,
      remastered: { fromSha256: oldSha, muted: job.muted, gainDb: job.gainDb,
        why: "整段原始 take 在这一片首字前 / 末字后的静音里带了一下孤立的咔嗒（15–20 ms），只把那几毫秒静音掉，长度、电平、逐字时间、整段区间都不动" },
      metrics: { ...entry.metrics, activeRmsDb: m.activeRmsDb, truePeakDb: +TruePeakDb(target).toFixed(2), snrDb: m.snrDb, voicedS: m.voicedS,
        lowShare: m.lowShare, f0: m.f0, cer: job.cer, transcript: job.transcript, speakerCos: job.speakerCos, nearestOther: job.nearestOther,
        referencedOther: job.referencedOther } });
    console.log(`${job.line.id}: remastered slice ${oldSha.slice(0, 8)} → ${sha256.slice(0, 8)} rms ${m.activeRmsDb} cos ${job.speakerCos} other ${job.nearestOther?.join(":")} cer ${job.cer} 「${job.transcript}」`);
  }
  for (const job of patchJobs) {
    const mine = ready.filter((t) => t.line.id === job.line.id && !!t.remaster === job.remaster).map((t) => {
      Voice(t);
      // 电平对不齐整段里原来那一片（峰值太尖、压到 −1 dBTP 以下就够不着目标）的排到后面：门禁只容 1.5 dB。
      const targetDb = TargetDb(t);
      t.levelOff = Math.abs(t.master.measure.activeRmsDb - targetDb) > 1.5;
      // 比本场任何另一个人的定妆音更像别人的 take 排到后面（2026-10-12：BunkerBanter 五个人里三个嗓子本来就近）。
      t.wrongVoice = !!(t.nearestOther && t.nearestOther[1] >= t.speakerCos);
      // 导演表 f0Hz：基频中位不在范围里的排到后面（2026-10-12 R3-Voice：BunkerBanter.09 补录总比本人别的句子低三成）。
      const f0Hz = LineDirection(t.cue, t.index).f0Hz, f0 = t.master.measure.f0?.median;
      t.f0Off = !!(f0Hz && !(f0 >= f0Hz[0] && f0 <= f0Hz[1]));
      t.score = (t.cer ?? 0.5) * 10 + (1 - t.speakerCos) * 6 + (t.levelOff ? 100 : 0) + (t.wrongVoice ? 50 : 0) + (t.f0Off ? 30 : 0);
      console.log(`   ${t.line.id}#${t.n}${t.meta?.mode ? ` (${t.meta.mode})` : ""} cos ${t.speakerCos} other ${t.nearestOther?.join(":")} cer ${t.cer} f0 ${f0} level ${t.master.measure.activeRmsDb}/${targetDb} 「${t.transcript}」`);
      return t;
    }).sort((a, b) => a.score - b.score);
    if (!mine.length) continue;
    // --pick=Scene.NN:n：人工指定装第几条（例：同一个人两句补录的基频要对得上，打分器不看这个）。
    const forced = forcedScenePicks.has(job.line.id) ? mine.find((t) => String(t.n) === String(forcedScenePicks.get(job.line.id))) : null;
    if (forcedScenePicks.has(job.line.id) && !forced) throw new Error(`--pick ${job.line.id}: take ${forcedScenePicks.get(job.line.id)} not on disk`);
    const best = forced || mine[0], entry = manifest.lines[job.line.id];
    const target = path.join(out, job.line.file);
    for (const [sha, t] of Object.entries(timings)) if (t.lineId === job.line.id) delete timings[sha];
    fs.copyFileSync(best.file, target);
    const sha256 = Sha256(target);
    const m = best.master.measure;
    // 同一句再补录一次（加候选）时：被替换的仍是整段切出来的那一片；请求数 = 以前记下的 + 这次新发的。
    const previous = entry.source === "patch" ? entry.patch : null;
    const newTakes = sent.get(job.line.id) || 0;
    const totalTakes = (previous?.takes || 0) + newTakes;
    Object.assign(entry, { sha256, seconds: m.seconds, bytes: fs.statSync(target).size, source: "patch",
      patch: { reason: previous?.reason || "整段里这一句分错了嗓子 / 念错，单独补录（带本人定妆音），有声段电平对齐到整段里原来那一片",
        replacedSha256: previous?.replacedSha256 ?? entry.sha256, targetDb: TargetDb(best), sliceDb: previous?.sliceDb ?? previous?.targetDb ?? entry.metrics.activeRmsDb,
        ...(LineDirection(job.cue, job.index).patch?.masterDb != null ? { targetFrom: "导演表 patch.masterDb" } : {}), takes: totalTakes,
        take: job.remaster ? previous?.take : best.n,
        promptHash: job.remaster ? previous?.promptHash : Hash(job.plan.prompt),
        ...(job.remaster ? (previous?.mode ? { mode: previous.mode } : {}) : { mode: job.plan.mode }),
        ...(job.remaster ? { remastered: { fromSha256: best.meta.remasteredFrom, tailCutS: best.master.tailCutS ?? null,
          why: "补录片末字后有与台词无关的爆音 / 杂音（原始 take 不在这个工作区），拿装上的那一片重新母带：剪掉杂音、有声段电平重新对齐" } }
          : previous?.remastered && newTakes === 0 ? { remastered: previous.remastered } : {}),
        ...(best.master.tailCutS != null && !job.remaster ? { tailCutS: best.master.tailCutS } : {}),
        ...(best.meta?.span ? { span: best.meta.span } : {}), ...(best.mutedRaw?.length ? { mutedRaw: best.mutedRaw } : {}) },
      metrics: { ...entry.metrics, activeRmsDb: m.activeRmsDb, truePeakDb: m.truePeakDb, snrDb: m.snrDb, voicedS: m.voicedS,
        lowShare: m.lowShare, f0: m.f0, cer: best.cer, transcript: best.transcript, speakerCos: best.speakerCos, nearestOther: best.nearestOther } });
    // 逐字时间：SeedAudio 时间戳平移到成品上；平移、夹进片段后有字变成 0 长（时间戳整体偏早 / 拖到片尾之后，2026-10-12 BunkerBanter.09
    // 补录 take 的「滚」「你」比真开口早 0.17 s、「的」给到 2.16 s），改用 whisper 对原文的强制对齐（同整段切句 cutMethod silence 的口径）。
    const subChars = best.words.map((w) => [w.text, +Math.min(m.seconds, Math.max(0, w.start_time / 1000 - best.master.trimStartS)).toFixed(3),
      +Math.min(m.seconds, Math.max(0, w.end_time / 1000 - best.master.trimStartS)).toFixed(3)]);
    const whisperTimed = subChars.some(([, a, b]) => b - a <= 0) && best.whisperChars?.length;
    timings[sha256] = { lineId: job.line.id, who: job.line.who, lang: job.line.lang || "zh", seconds: m.seconds, source: whisperTimed ? "whisper-forced" : "seedaudio-subtitle",
      chars: whisperTimed ? best.whisperChars : subChars };
    const scene = manifest.scenes?.[job.cue.id];
    if (scene) { scene.requests = (scene.requests || 0) + newTakes; (scene.patched ||= []).includes(job.line.id) || scene.patched.push(job.line.id); }
    console.log(`${job.line.id}: ${job.remaster ? "remastered" : `patched take ${best.n}`} cos ${best.speakerCos} other ${best.nearestOther?.join(":")} cer ${best.cer} 「${best.transcript}」`);
  }
  // 只发了请求、没装上的补录（例：所有候选都被 --pick 指到别的写法）也要记进请求数。
  for (const [id, n] of sent) {
    if (patchJobs.some((j) => j.line.id === id && ready.some((t) => t.line.id === id))) continue;
    const entry = manifest.lines[id];
    if (entry.source === "patch") entry.patch.takes = (entry.patch.takes || 0) + n;
    const scene = manifest.scenes?.[entry.scene];
    if (scene) scene.requests = (scene.requests || 0) + n;
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
  // 逐字时间（以片段 sha256 为键）：清单里已经没有的片段一起删（2026-10-11 下线 CaptiveTaunt / BunkerSearch 时它们被留下了，
  // 口型轨烘焙的 --prune 又把它们当作还在用的录音）。
  const timings = ReadJson(timingsPath, {}), liveSha = new Set(Object.values(manifest.lines || {}).map((entry) => entry.sha256));
  for (const id of staleLines) liveSha.delete(manifest.lines?.[id]?.sha256);
  const staleTimings = Object.keys(timings).filter((sha) => !liveSha.has(sha));
  for (const sha of staleTimings) { console.log(`${dry ? "would prune" : "pruned"} timings ${timings[sha].lineId}`); if (!dry) delete timings[sha]; }
  if (!dry && staleTimings.length) WriteTimings(timings);
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
  if (patchLines.length || remasterLines.length) { await PatchLines(manifest); console.log(`requests ${requestStats.requests}, retries ${requestStats.retries}, failures ${requestStats.failures}`); return; }
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
