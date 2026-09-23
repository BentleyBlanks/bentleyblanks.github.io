// 第一关班组战斗短句：每人用自己的定妆音录一份（Data_FirstLevelVoiceCast.SQUAD_BARK_*）。
//
//   node Taierzhuang1938/Script_SeedAudioSquadBarkBake.mjs [--only=luo,yaowa] [--attempts=N] [--dry]
//        [--rescore] [--pick=who:n] [--jobs=2] [--loudness=-N]
//
// 一个人 = 一次请求 = 一条录音：这个人要喊的全部短句在同一次生成里念完（带本人定妆音作 @音频1 参考），
// 句间留约 1 秒停顿，再按逐字时间戳（不可信时按静音）切开。少抽卡：每人只生成 1 次；只有硬错误
// （漏句 / 多念 / 念错词 / 整条不像本人 / 削波 / 底噪 / 超长）才整条重抽，最多共 CHECK.maxAttempts 次
// （要重抽时带 --attempts=2 / 3 再跑）。
//
// 与对白场景不同的一处：喊话彼此独立、在游戏里一句一句单独响，音量只该由距离与遮挡决定，所以切开后
// **逐句**齐平到战斗口令的同一档（有声段 RMS −16.1 dBFS、真峰值 ≤ −1 dBTP），不保留整条里的相对电平。
//
// 成品 Audio/FirstLevel/Barks/AudioVoice_FirstLevelBark<Who><Key>.mp3，清单
// Audio/FirstLevel/Data_FirstLevelSquadBarkManifest.json（people[who] 记请求次数、每次生成的硬错误；
// barks["<key>@<who>"] 记文件 sha256、时长、电平、嗓子与转写）。原始录音与切片打分留在 tmp/voice/barks/。
//
// 429 / 5xx / 超时退避重试（Script_SeedAudioVoiceKit）；密钥只从 VOLCENGINE_API_KEY 读，任何日志与异常先脱敏。
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { VOICE_LINES } from "./Data_Voice.mjs";
import { MISSION_VOICE_CAST } from "./Data_FirstLevelMissionDialogue.mjs";
import { FIRST_LEVEL_VOICE_CAST, DRY_VOICE_RULE, VOICE_LANG_RULE, CastVoiceOwner, SQUAD_BARK_CAST, SquadBarkEntries }
  from "./Data_FirstLevelVoiceCast.mjs";
import { LINE_MASTER } from "./Data_FirstLevelDialogueDirection.mjs";
import { SeedAudioSpeak, MasterLine, MeasureVoice, SpeakerEmbed, CenteredCosine, Transcribe, Sha256, Pool, requestStats,
  SEED_AUDIO_MODEL, MasterSceneWav, FrameRms, ClipRuns, MapSubtitleToLines, SliceScene, IslandLines }
  from "./Script_SeedAudioVoiceKit.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "Audio", "FirstLevel");
export const SQUAD_BARK_MANIFEST = path.join(out, "Data_FirstLevelSquadBarkManifest.json");
const castManifestPath = path.join(out, "Data_FirstLevelVoiceCastManifest.json");
const work = path.join(path.dirname(here), "tmp", "voice", "barks");
const ffmpeg = process.env.FFMPEG || "ffmpeg";

export const CHECK = Object.freeze({
  maxAttempts: 3,         // 同一人最多生成几次
  targetRmsDb: -16.1,     // 战斗口令同一档（Script_VoiceBake.TARGET_RMS）
  rmsTolDb: 0.6,          // 逐句齐平后允许的偏差
  maxSeconds: 2.6,        // Script_VoiceTest：战斗 Bark 0.3–2.6 s
  maxTempo: 1.08,         // 单句超长 ≤ 8% 时不变调压快，而不是整条重抽
  minSeconds: 0.3,
  noiseMaxDb: -48,        // 原始录音句间静音的底噪上限（Script_VoiceBake.FLOOR_MAX）
  minCoverage: 0.5,       // 逐字时间戳对上稿面的字少于一半 = 漏句
  extraChars: 0.25,       // 时间戳里的字比稿面多出这么多 = 多念
  judgeVoicedS: 0.6,      // 有声段短于它不判嗓子与字错率
  maxCer: 0.34,           // 超过它要人工逐字核对（四川话同音字）
  reviewedMaxCer: 0.6,    // 超过它、且字数也差得多 = 念错词（硬错误）
  wrongVoiceMargin: 0.08, // 与另一名班组成员定妆音的余弦比本人高出这么多 = 这一句像别人
  wrongVoiceShare: 0.25,  // 像别人的句子超过这个比例 = 整条不像本人（硬错误）
});

const Arg = (name) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const selected = Arg("only")?.split(",").filter(Boolean);
const dry = process.argv.includes("--dry"), rescore = process.argv.includes("--rescore");
const allowAttempts = Math.min(CHECK.maxAttempts, Math.max(1, Number.parseInt(Arg("attempts") ?? "1", 10) || 1));
// --loudness=N：送 audio_config.loudness_rate（默认 0）。嗓门大的人（何有田）整条出来峰值冲过满幅，重抽时压一点音量再生成；
// 成品电平逐句另外齐平，这个数只管「生成时别冲顶」。记在每次生成的记录里。
const loudnessRate = Math.max(-50, Math.min(0, Number.parseInt(Arg("loudness") ?? "0", 10) || 0));
const jobs = Math.min(2, Math.max(1, Number.parseInt(Arg("jobs") ?? "2", 10) || 2));
const forcedPicks = new Map((Arg("pick")?.split(",") || []).filter(Boolean).map((p) => {
  const [who, n] = p.split(":"); return [who, Number(n)];
}));
const Hash = (text) => crypto.createHash("sha256").update(text).digest("hex");
const ReadJson = (file, fallback = null) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback;
const Name = (who) => MISSION_VOICE_CAST[who]?.[0] || who;
const TEXT = new Map(VOICE_LINES.filter((l) => (l.side || "nra") === "nra" && l.kind !== "story").map((l) => [l.key, l.text]));
const Letters = (text) => [...String(text)].filter((c) => /[\p{L}\p{N}]/u.test(c)).length;

/** 各条短句的表演说明（只照着演，不念出来）。 */
const KEY_NOTES = Object.freeze({
  spot_east: "发现敌人，急着给弟兄指方向", spot_enemy: "发现敌人摸上来，急促报警", spot_gap: "看见敌人从缺口钻进来，急促报警",
  spot_wall: "看见敌人爬上墙，急促报警", move_cover: "招呼身边的弟兄赶紧找掩护", move_flank: "招呼弟兄从左边绕过去",
  move_go: "催弟兄快走", warn_grenade: "看见手榴弹飞过来，急着提醒", rally_shoot: "催弟兄们开火、别停",
  rally_follow: "招呼弟兄跟上自己", rally_charge: "带头冲锋，吼出来", rally_hold: "咬着牙叫弟兄顶住",
  hurt_hit: "刚中了枪，疼得咬牙，声音发紧", hurt_medic: "替挂彩的弟兄喊担架兵", ammo_ask: "子弹快打完了，找弟兄要桥夹",
  ammo_out: "子弹打光了，急着喊", ammo_reload: "边压子弹边喊弟兄掩护",
});

export function CastReference(who) {
  const owner = CastVoiceOwner(who);
  const entry = ReadJson(castManifestPath, { cast: {} }).cast[owner];
  return entry ? { owner, file: path.join(out, entry.file), sha256: entry.sha256 } : null;
}
function People() {
  return Object.keys(SQUAD_BARK_CAST).filter((who) => !selected || selected.includes(who));
}
/** 这个人要录的句子：[{ who, key, bank, file, text }]，文本取自 Data_Voice。 */
export function BarkLines(who) {
  return SquadBarkEntries().filter((e) => e.who === who).map((e) => {
    const text = TEXT.get(e.key);
    if (!text) throw new Error(`Data_Voice 没有中方口令 ${e.key}`);
    return { ...e, text };
  });
}

/** 这个人的整条提示词。参考音本身不进哈希（另记 castSha256）。 */
export function BarkPrompt(who) {
  const cast = FIRST_LEVEL_VOICE_CAST[who], lines = BarkLines(who);
  const notes = lines.map((l, i) => `第${i + 1}句：${KEY_NOTES[l.key] || "战场急喊"}`).join("；");
  const script = lines.map((l) => `@音频1 ${Name(who)}：“${l.text}”`).join("\n");
  return `${DRY_VOICE_RULE}@音频1 是${Name(who)}的声音；严格保持参考音的音色、年龄感和口音。`
    + `人物：${Name(who)}，${cast.persona}。${VOICE_LANG_RULE[cast.lang] || VOICE_LANG_RULE.zh}`
    + `他在前沿的战壕里，下面是 ${lines.length} 句互不相连的战场短喊，都是在枪声里喊给身边弟兄听的：要急、要短、要喊清楚，`
    + "是喊话不是尖叫，不破成噪声；每句单独喊一次，喊完停顿约一秒再喊下一句，句与句不连读、不接上一句的情绪。"
    + `逐句表演（只照着演，不要念出来）：${notes}。`
    + `台词如下，按顺序念，不念 @音频1、角色名和编号，不加、不删、不改字：\n${script}`;
}

const AttemptRaw = (who, n) => path.join(work, `${who}_${n}.raw.mp3`);
const AttemptMeta = (who, n) => path.join(work, `${who}_${n}.json`);
const AttemptDir = (who, n) => path.join(work, `${who}_${n}`);
const JudgeOf = (who, n) => ReadJson(path.join(AttemptDir(who, n), "judge.json"));

/** 磁盘上提示词与参考音都对得上的生成（1..n）。 */
function ValidAttempts(who) {
  const promptHash = Hash(BarkPrompt(who)), castSha256 = CastReference(who)?.sha256;
  const list = [];
  for (let n = 1; n <= 9; n++) {
    const meta = ReadJson(AttemptMeta(who, n));
    if (meta && fs.existsSync(AttemptRaw(who, n)) && meta.promptHash === promptHash && meta.castSha256 === castSha256) list.push(n);
  }
  return list;
}

async function Generate(who, n) {
  const prompt = BarkPrompt(who), ref = CastReference(who);
  if (prompt.length > 3000) throw new Error(`${who}: prompt exceeds 3000 characters (${prompt.length})`);
  const result = await SeedAudioSpeak({ prompt, references: [ref.file], loudnessRate, label: `bark ${who}#${n}` });
  fs.rmSync(AttemptDir(who, n), { recursive: true, force: true });
  fs.writeFileSync(AttemptRaw(who, n), result.bytes);
  fs.writeFileSync(AttemptMeta(who, n), JSON.stringify({ promptHash: Hash(prompt), castSha256: ref.sha256, loudnessRate,
    subtitle: result.subtitle, seconds: result.seconds, generatedAt: new Date().toISOString() }, null, 1));
  console.log(`bark ${who}#${n}: ${result.bytes.length} bytes`);
}

function Run(args, what) {
  const r = spawnSync(ffmpeg, args, { encoding: "utf8", windowsHide: true });
  if (r.status !== 0) throw new Error(`${what}: ${r.stderr?.slice(0, 200)}`);
}

/** 切开 + 逐句母带（不打分）。 */
function Cut(who, n) {
  const dir = AttemptDir(who, n);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const lines = BarkLines(who), meta = ReadJson(AttemptMeta(who, n)), raw = AttemptRaw(who, n);
  const hard = [], flags = [];
  const clip = ClipRuns(raw);
  if (clip >= 3) hard.push(`削波 ${clip} 处`);
  else if (clip) flags.push(`原始录音有 ${clip} 处满幅峰顶（逐句母带已限幅）`);
  const rawMeasure = MeasureVoice(raw);
  if (rawMeasure.noiseDb > CHECK.noiseMaxDb) hard.push(`底噪 ${rawMeasure.noiseDb} dB（上限 ${CHECK.noiseMaxDb}）`);
  const mapped = MapSubtitleToLines(lines.map((l) => l.text), meta.subtitle);
  const subtitleChars = mapped.reduce((t, m) => t + m.chars.length, 0), scriptChars = mapped.reduce((t, m) => t + m.total, 0);
  if (!meta.subtitle?.sentences?.length) hard.push("没有逐字时间戳");
  if (subtitleChars > scriptChars * (1 + CHECK.extraChars) + 2) hard.push(`多念（时间戳 ${subtitleChars} 字 / 稿 ${scriptChars} 字）`);
  mapped.forEach((m, i) => { if (m.start == null || m.coverage < CHECK.minCoverage) hard.push(`漏句 ${lines[i].key}（对上 ${m.matched}/${m.total} 字）`); });
  const wav = path.join(dir, "take.wav");
  // 整条先按同一个增益拉平（只为了切点判静音有统一的尺子），逐句电平在下面各自齐平。
  const master = MasterSceneWav(raw, wav, { targetDb: CHECK.targetRmsDb, ceilingDb: LINE_MASTER.ceilingDb });
  const measure = MeasureVoice(wav), framesInfo = FrameRms(wav);
  let cutMethod = "subtitle", slices = null;
  const usable = !hard.some((h) => h.startsWith("漏句") || h === "没有逐字时间戳");
  if (usable) {
    slices = SliceScene(framesInfo, mapped.map((m) => ({ start: m.start - master.trimStartS, end: m.end - master.trimStartS })),
      { activeRmsDb: measure.activeRmsDb, padS: LINE_MASTER.padS });
  }
  const tooShort = slices?.some((s, i) => s.endS - s.startS < Math.min(0.35, 0.1 + 0.05 * mapped[i].total));
  if (!slices || tooShort) {
    const islands = IslandLines(framesInfo, lines.map((l) => Math.max(0.25, Letters(l.text) / 4.6)),
      { activeRmsDb: measure.activeRmsDb, minRunS: 0.25 });
    if (islands) {
      slices = SliceScene(framesInfo, islands, { activeRmsDb: measure.activeRmsDb, padS: LINE_MASTER.padS });
      cutMethod = "silence";
      flags.push(`逐字时间戳${usable ? "切出过短的片段" : "缺字"}，改按静音与预计时长切`);
      // 漏句是按时间戳判的；按静音切得开、转写又对得上，就不算漏句（转写那一关兜底）。
      for (let i = hard.length - 1; i >= 0; i--) if (hard[i].startsWith("漏句") || hard[i] === "没有逐字时间戳") { flags.push(`时间戳：${hard[i]}`); hard.splice(i, 1); }
    } else hard.push("静音段不够切出每一句");
  }
  if (slices) slices.forEach((s, i) => {
    const seg = path.join(dir, `seg_${String(i + 1).padStart(2, "0")}.wav`);
    Run(["-y", "-v", "error", "-i", wav, "-af", `atrim=start=${s.startS.toFixed(4)}:end=${s.endS.toFixed(4)},asetpts=PTS-STARTPTS`,
      "-c:a", "pcm_f32le", seg], `cut ${who} ${lines[i].key}`);
    s.file = path.join(dir, `${lines[i].key}.mp3`);
    let mastered = MasterLine(seg, s.file, { targetDb: CHECK.targetRmsDb, padS: LINE_MASTER.padS, ceilingDb: LINE_MASTER.ceilingDb });
    // 只超上限一点（≤ CHECK.maxTempo）就把这一句不变调压快到上限内，不为一句整条重抽（少抽卡）。
    const over = mastered.measure.seconds / (CHECK.maxSeconds - 0.04);
    if (over > 1 && over <= CHECK.maxTempo) {
      mastered = MasterLine(seg, s.file, { targetDb: CHECK.targetRmsDb, padS: LINE_MASTER.padS, ceilingDb: LINE_MASTER.ceilingDb, tempo: over });
      s.tempo = +over.toFixed(3);
      flags.push(`${lines[i].key} 超长，不变调压快 ${((over - 1) * 100).toFixed(1)}%`);
    }
    fs.rmSync(seg, { force: true });
    s.gainDb = mastered.gainDb;
    s.measure = mastered.measure;
    if (s.measure.seconds > CHECK.maxSeconds || s.measure.seconds < CHECK.minSeconds)
      hard.push(`${lines[i].key} 时长 ${s.measure.seconds} s（要 ${CHECK.minSeconds}–${CHECK.maxSeconds} s）`);
  });
  fs.rmSync(wav, { force: true });
  return { who, n, lines, hard, flags, slices, cutMethod, raw: { noiseDb: rawMeasure.noiseDb, clipRuns: clip, seconds: rawMeasure.seconds } };
}

/** 一批一起打分：一次 whisper、一次音色编码。 */
function Judge(results) {
  const cut = results.filter((r) => r.slices);
  const lineJobs = cut.flatMap((r) => r.slices.map((s, i) => ({ r, s, line: r.lines[i] })));
  const squad = Object.keys(SQUAD_BARK_CAST);
  const castFiles = [...new Set(squad.map((who) => CastReference(who)?.file).filter(Boolean))];
  const vectors = SpeakerEmbed([...lineJobs.map((j) => j.s.file), ...castFiles]);
  const texts = Transcribe(lineJobs.map((j) => ({ file: j.s.file, lang: "zh", text: j.line.text, reference: j.line.text })));
  if (!texts || !vectors) {
    console.error(`bark judge aborted: ${!texts ? "whisper transcription" : "speaker embedding"} unavailable; rerun with --rescore`);
    process.exitCode = 1;
    return false;
  }
  for (const r of cut) {
    let judged = 0, wrong = 0;
    for (const [i, s] of r.slices.entries()) {
      const line = r.lines[i];
      s.cer = texts[s.file]?.cer ?? null;
      s.transcript = texts[s.file]?.text ?? null;
      const own = CastReference(r.who);
      s.speakerCos = own && vectors[s.file] && vectors[own.file] ? +CenteredCosine(vectors[s.file], vectors[own.file]).toFixed(3) : null;
      const others = squad.filter((who) => CastVoiceOwner(who) !== CastVoiceOwner(r.who)).map((who) => [who, CastReference(who)])
        .filter(([, ref]) => ref && vectors[ref.file] && vectors[s.file])
        .map(([who, ref]) => [who, +CenteredCosine(vectors[s.file], vectors[ref.file]).toFixed(3)]).sort((a, b) => b[1] - a[1]);
      s.nearestOther = others[0] || null;
      const long = s.measure.voicedS >= CHECK.judgeVoicedS;
      if (long && s.speakerCos != null) {
        judged++;
        if (s.nearestOther && s.nearestOther[1] - s.speakerCos > CHECK.wrongVoiceMargin) {
          wrong++;
          r.flags.push(`${line.key} 与${Name(s.nearestOther[0])}的定妆音更近（本人 ${s.speakerCos} / ${s.nearestOther[1]}）`);
        }
      }
      const want = Letters(line.text), got = Letters(s.transcript || "");
      s.lengthDiff = got - want;
      if (long && s.cer != null && s.cer > CHECK.reviewedMaxCer && Math.abs(got - want) > Math.max(2, 0.3 * want))
        r.hard.push(`${line.key} 字错率 ${s.cer}「${s.transcript}」`);
      else if (s.cer != null && s.cer > CHECK.maxCer) r.flags.push(`${line.key} 字错率 ${s.cer} 待逐字核对「${s.transcript}」`);
    }
    r.voice = { judged, wrong };
    if (judged && wrong / judged > CHECK.wrongVoiceShare) r.hard.push(`整条不像本人（${wrong}/${judged} 句更像别人）`);
  }
  for (const r of results) {
    fs.writeFileSync(path.join(AttemptDir(r.who, r.n), "judge.json"), JSON.stringify({ hard: r.hard, flags: r.flags, cutMethod: r.cutMethod,
      raw: r.raw, voice: r.voice || null, lines: r.slices?.map(({ file, ...s }, i) => ({ key: r.lines[i].key, ...s })) || null }, null, 1));
  }
  return true;
}

function Report(r) {
  console.log(`${r.who}#${r.n}: ${r.hard.length ? `HARD ${r.hard.join("；")}` : "ok"}${r.flags.length ? ` | ${r.flags.length} flags` : ""} (${r.cutMethod}, raw noise ${r.raw.noiseDb} dB)`);
  for (const [i, s] of (r.slices || []).entries()) {
    console.log(`   ${r.lines[i].key.padEnd(13)} ${String(s.measure?.seconds).padStart(6)}s rms ${s.measure?.activeRmsDb} tp ${s.measure?.truePeakDb} own ${s.speakerCos} other ${s.nearestOther?.join(":")} cer ${s.cer} 「${s.transcript}」`);
  }
  for (const f of r.flags) console.log(`   flag: ${f}`);
}

function Install(r, manifest, attempts) {
  const barks = manifest.barks;
  for (const key of Object.keys(barks)) if (barks[key].who === r.who) delete barks[key];
  fs.mkdirSync(path.join(out, "Barks"), { recursive: true });
  for (const [i, s] of r.slices.entries()) {
    const line = r.lines[i], dest = path.join(out, line.file);
    fs.copyFileSync(s.file, dest);
    barks[line.bank] = { who: r.who, key: line.key, file: line.file, sha256: Sha256(dest), text: line.text,
      seconds: s.measure.seconds, voicedS: s.measure.voicedS, activeRmsDb: s.measure.activeRmsDb, truePeakDb: s.measure.truePeakDb,
      noiseDb: s.measure.noiseDb, lowShare: s.measure.lowShare, f0: s.measure.f0.median, gainDb: s.gainDb, ...(s.tempo ? { tempo: s.tempo } : {}),
      takeStartS: s.startS, takeEndS: s.endS, tight: !!(s.tightStart || s.tightEnd),
      speakerCos: s.speakerCos, nearestOther: s.nearestOther, cer: s.cer, transcript: s.transcript };
  }
  manifest.people[r.who] = { set: SQUAD_BARK_CAST[r.who], lines: r.lines.length, requests: attempts.length, picked: r.n,
    attempts: attempts.map((a) => ({ n: a.n, hard: a.hard, flags: a.flags })), cutMethod: r.cutMethod, raw: r.raw, loudnessRate: ReadJson(AttemptMeta(r.who, r.n))?.loudnessRate ?? 0,
    promptHash: Hash(BarkPrompt(r.who)), castSha256: CastReference(r.who).sha256, rawSha256: Sha256(AttemptRaw(r.who, r.n)) };
}

async function Main() {
  const manifest = ReadJson(SQUAD_BARK_MANIFEST, null) || {};
  Object.assign(manifest, { model: SEED_AUDIO_MODEL, provider: "Volcengine", targetRmsDb: CHECK.targetRmsDb,
    generatedBy: "Script_SeedAudioSquadBarkBake.mjs" });
  manifest.people ||= {}; manifest.barks ||= {};
  fs.mkdirSync(work, { recursive: true });
  const people = People();
  for (const who of people) {
    if (!CastReference(who)) throw new Error(`${who} 还没有选定的定妆音`);
    const prompt = BarkPrompt(who), installed = manifest.people[who];
    const current = installed?.promptHash === Hash(prompt) && installed?.castSha256 === CastReference(who).sha256;
    console.log(`${who}: ${BarkLines(who).length} lines, ${prompt.length} chars, attempts on disk ${ValidAttempts(who).join(",") || "-"}${current ? ", installed" : ""}`);
  }
  if (dry) { console.log(BarkPrompt(people[0])); return; }
  // 1) 生成：每人先 1 次；--attempts=N 时对「已有生成都带硬错误」的人补到第 N 次。
  const toGenerate = [];
  if (!rescore) for (const who of people) {
    const have = ValidAttempts(who);
    if (!have.length) { toGenerate.push([who, 1]); continue; }
    const judged = have.every((n) => JudgeOf(who, n));
    const clean = have.some((n) => JudgeOf(who, n) && !JudgeOf(who, n).hard.length);
    if (judged && !clean && have.length < allowAttempts) toGenerate.push([who, Math.max(...have) + 1]);
  }
  const { errors } = await Pool(toGenerate, jobs, ([who, n]) => Generate(who, n));
  for (const error of errors) { console.error(error.message); process.exitCode = 1; }
  // 2) 切开、打分（新生成的与还没打过分的，或 --rescore 时全部）。
  const results = [];
  for (const who of people) for (const n of ValidAttempts(who)) {
    if (!rescore && JudgeOf(who, n)) continue;
    results.push(Cut(who, n));
  }
  if (results.length && !Judge(results)) return;
  results.forEach(Report);
  // 3) 装：每人取第一条没有硬错误的生成（--pick 可人工指定）；全带硬错误就不装、留着公用声库。
  for (const who of people) {
    const all = ValidAttempts(who).map((n) => ({ n, ...JudgeOf(who, n) })).filter((a) => a.hard);
    const pickN = forcedPicks.get(who) ?? all.find((a) => !a.hard.length)?.n;
    if (!pickN) { console.log(`${who}: no clean attempt yet (${all.length}); rerun with --attempts=${Math.min(CHECK.maxAttempts, all.length + 1)}`); continue; }
    const installed = manifest.people[who];
    if (installed && installed.picked === pickN && installed.promptHash === Hash(BarkPrompt(who)) && installed.requests === all.length
      && !results.some((r) => r.who === who)) continue;
    let r = results.find((x) => x.who === who && x.n === pickN);
    if (!r) { r = Cut(who, pickN); if (!Judge([r])) return; }
    Install(r, manifest, all);
    console.log(`${who}: installed #${pickN} (${all.length} request${all.length > 1 ? "s" : ""})`);
  }
  const ordered = { ...manifest,
    people: Object.fromEntries(Object.keys(SQUAD_BARK_CAST).filter((w) => manifest.people[w]).map((w) => [w, manifest.people[w]])),
    barks: Object.fromEntries(SquadBarkEntries().filter((e) => manifest.barks[e.bank]).map((e) => [e.bank, manifest.barks[e.bank]])) };
  fs.writeFileSync(SQUAD_BARK_MANIFEST, JSON.stringify(ordered, null, 1) + "\n");
  console.log(`requests ${requestStats.requests}, retries ${requestStats.retries}, failures ${requestStats.failures}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  Main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
