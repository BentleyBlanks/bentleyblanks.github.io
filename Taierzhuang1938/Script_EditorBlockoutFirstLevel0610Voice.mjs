// 白盒关卡 FirstLevel0610 的占位配音：整段一次生成 → 母带 → 按逐字时间戳切句 → 写清单（只在 node 里跑）。
// 完全照 Script_EditorBlockoutFirstLevel0105Voice.mjs（那份不动），只换了台词表、路径与几处 0610 需要的口径（借嗓子的人设、
// 没有参考音的角色、按在场的人点名谁说北方官话、每句带关键帧 id）。
//
//   node Taierzhuang1938/Script_EditorBlockoutFirstLevel0610Voice.mjs [--dry-run] [--only=A,B] [--force=Scene[,Scene]]
//        [--pick=Scene:n] [--no-judge] [--face]
//
//   --dry-run      只打印每场的请求（提示词全文、参考音文件与 sha），不发请求、不含密钥
//   （缺省）       只生成还没有原始返回的场；已有原始返回的场直接重新母带、切句、核对、写清单（不发请求）
//   --force=S      重抽这一场：在已有生成之后再生成一次（每场最多 3 次 = 1 次 + 重抽 2 次），装最新那次
//   --pick=S:n     这一场装第 n 次生成（缺省装最新那次）
//   --no-judge     不跑 whisper 转写与音色核对（快；核对表里那两列留空）
//   --face         切好以后用 Script_FirstLevelFaceTrackBake.py 烘口型轨到 Audio/Blockout0610/Data_Blockout0610FaceTracks.json
//
// 台词：Data_EditorBlockoutFirstLevel0610Lines.mjs。定妆参考音只读复用 Audio/FirstLevel/Cast（Data_FirstLevelVoiceCastManifest.json），
// 游戏第一关的配音、cue 表、定妆表一律不改。做法与游戏 01–06 相同（docs/Data_FirstLevelVoiceSync20260919.md §0）：
// 最多 3 条定妆参考音、台词行以 @音频N 开头指派说话人、干声不烘环境、整段只做一次母带（按各句音量档字数加权的目标电平，
// 与 Data_FirstLevelDialogueDirection.PROJECTION_DB 同档）、切出来的片段不再单独归一。
//
// 产物：
//   Audio/Blockout0610/AudioVoice_Blockout0610<Scene>_<NN>.mp3       逐句片段
//   Blockout/FirstLevel0610.voice.json                               清单（schema tengxian-blockout-voice/1，每句多一个 keyframe）
//   Audio/Blockout0610/Data_Blockout0610FaceTracks.json              口型轨（--face；格式同 Script_FaceTrack，按 mp3 sha256 为键）
//   tmp/Blockout0610Voice/                                           原始返回、母带、切片、核对（git 忽略）
//
// 密钥只从 VOLCENGINE_API_KEY 读（Script_SeedAudioVoiceKit.SeedAudioSpeak 经 X-Api-Key 头发送），任何输出都不含密钥。
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { L0610_VOICE_SCENES, L0610_VOICE_PERSONAS } from "./Data_EditorBlockoutFirstLevel0610Lines.mjs";
import { FIRST_LEVEL_VOICE_CAST, CastVoiceOwner } from "./Data_FirstLevelVoiceCast.mjs";
import { PROJECTION_DB, LINE_MASTER } from "./Data_FirstLevelDialogueDirection.mjs";
import { SeedAudioSpeak, MeasureVoice, SpeakerEmbed, CenteredCosine, Transcribe, Sha256, requestStats, MasterSceneWav,
  EncodeSegment, FrameRms, ClipRuns, MapSubtitleToLines, SliceScene, IslandLines, TruePeakDb, StripLaughter }
  from "./Script_SeedAudioVoiceKit.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const castDir = path.join(here, "Audio", "FirstLevel");
const outDir = path.join(here, "Audio", "Blockout0610");
const manifestPath = path.join(here, "Blockout", "FirstLevel0610.voice.json");
const faceTracksPath = path.join(outDir, "Data_Blockout0610FaceTracks.json");
const work = path.join(here, "tmp", "Blockout0610Voice");
const MAX_ATTEMPTS = 3;

const Arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const Flag = (name) => process.argv.includes(`--${name}`);
const dry = Flag("dry-run"), judge = !Flag("no-judge"), face = Flag("face");
const only = Arg("only")?.split(",").filter(Boolean);
const forced = new Set(Arg("force")?.split(",").filter(Boolean) || []);
const picks = new Map((Arg("pick")?.split(",") || []).filter(Boolean).map((p) => { const [s, n] = p.split(":"); return [s, Number(n)]; }));
const Hash = (text) => crypto.createHash("sha256").update(text).digest("hex");
const ReadJson = (file, fallback = null) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback;
const Chars = (text) => [...String(text)].filter((c) => /[\p{L}\p{N}]/u.test(c));
const Rel = (file) => path.relative(here, file).replaceAll("\\", "/");

// ---------------------------------------------------------------------------
// 定妆参考音（只读）
// ---------------------------------------------------------------------------
const castManifest = ReadJson(path.join(castDir, "Data_FirstLevelVoiceCastManifest.json"), { cast: {} });
/** 不在定妆表里的角色（妮儿）返回 null：没有参考音，只按人设出声。 */
function CastReference(who) {
  const owner = CastVoiceOwner(who), entry = castManifest.cast[owner];
  return entry ? { owner, file: path.join(castDir, entry.file), sha256: entry.sha256 } : null;
}
/** 场上开口的人，台词字数多的在前。 */
function Speakers(scene) {
  const n = new Map();
  for (const line of scene.lines) n.set(line.who, (n.get(line.who) || 0) + Math.max(1, Chars(line.text).length));
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([who]) => who);
}
/** 按台词多少取前 3 个有定妆音的嗓子（共用嗓子的算同一条），再按第一次开口的先后排 @音频1…3。 */
function References(scene) {
  const refs = [];
  for (const who of Speakers(scene)) {
    const ref = CastReference(who);
    if (!ref) continue;
    const have = refs.find((r) => r.owner === ref.owner);
    if (have) { have.who.push(who); continue; }
    if (refs.length < 3) refs.push({ ...ref, who: [who] });
  }
  const first = (r) => Math.min(...r.who.map((who) => scene.lines.findIndex((l) => l.who === who)));
  return refs.sort((a, b) => first(a) - first(b));
}
const RefIndex = (refs, who) => refs.findIndex((r) => r.who.includes(who));

// ---------------------------------------------------------------------------
// 提示词（与 Script_SeedAudioFirstLevelBake.ScenePrompt 同一写法，人设取定妆表的前两段，省长度；借嗓子的人用 0610 自己的人设）
// ---------------------------------------------------------------------------
const PROJECTION_WORDS = Object.freeze({
  shout: "放开嗓子喊出来（是喊话，不是尖叫，不破成噪声）", normal: "正常说话的音量",
  low: "压低声音、贴近了说", breath: "很轻、带气声，几乎是喘出来的",
});
/** 同一个人在一场里只写一个显示名（同一定妆 id 有两个显示名时用第一个）。 */
const NameOf = (scene, who) => scene.lines.find((l) => l.who === who)?.speaker || who;
const ShortPersona = (who) => L0610_VOICE_PERSONAS[who] || String(FIRST_LEVEL_VOICE_CAST[who]?.persona || "").split("；").slice(0, 2).join("；");
const Names = (scene, whos) => [...new Set(whos.map((who) => NameOf(scene, who)))].join("、");

export function ScenePrompt(scene) {
  const refs = References(scene), speakers = Speakers(scene);
  const dry = speakers.length > 1
    ? "录音棚近讲干声，单声道，只有下面这几个角色的人声（含稿中写明的喘、闷哼、痛叫、呜咽）：没有任何环境声、战场声、脚步、枪炮、爆炸、音效、音乐和混响，开头和结尾不留长空白。"
    : "录音棚近讲干声，单声道，只有这一个人的声音：没有任何环境声、战场声、脚步、枪炮、爆炸、音效、音乐、混响和其他人声，开头和结尾不留长空白。";
  const refText = refs.length
    ? refs.map((r, i) => `@音频${i + 1} 是${r.who.map((w) => NameOf(scene, w)).join("、")}的声音`).join("，")
      + (refs.length > 1 ? "；每个角色严格保持自己那条参考音的音色、年龄感和口音，谁的句子就用谁的嗓子，绝不串嗓。" : "；严格保持参考音的音色、年龄感和口音。")
    : "";
  const unref = speakers.filter((who) => RefIndex(refs, who) < 0);
  const unrefText = unref.length
    ? refs.length
      ? `${Names(scene, unref)}没有参考音：照下面的人设用他自己的嗓子，和 @音频1${refs.length > 1 ? `–@音频${refs.length}` : ""} 每一个都必须明显不是同一个人，绝不借用参考音的嗓子。`
      : `${Names(scene, unref)}没有参考音：严格照下面的人设出声。`
    : "";
  const cast = speakers.map((who) => `${NameOf(scene, who)}：${ShortPersona(who)}`).join("；");
  const by = (lang) => [...new Set(scene.lines.filter((l) => l.lang === lang && !l.vocal).map((l) => l.who))];
  const zh = by("zh"), north = by("zhNorth"), ja = [...new Set(scene.lines.filter((l) => l.lang === "ja").map((l) => l.who))];
  const langRules = [
    zh.length ? `${Names(scene, zh)}是川军，讲地道四川话，用四川方言的语调、声调与发音，不是普通话加几个四川词` : "",
    north.length ? `${Names(scene, north)}是鲁南本地人，讲鲁南北方官话（山东口音），绝不说四川话` : "",
    ja.length ? `${Names(scene, ja)}是日语母语者，只说给出的日语（假名照日语念），不说中文` : "",
  ].filter(Boolean).join("；");
  const notes = scene.lines.map((l, i) => `第${i + 1}句（${l.speaker}）：${l.direction.replace(/（占位改写[^）]*）/, "")}，${PROJECTION_WORDS[l.projection] || PROJECTION_WORDS.normal}`).join("；");
  const script = scene.lines.map((l) => {
    const k = RefIndex(refs, l.who);
    return `${k >= 0 ? `@音频${k + 1} ` : ""}${l.speaker}：“${l.text}”`;
  }).join("\n");
  const together = scene.lines.length > 1
    ? "这是同一场戏一次录完：人物在同一个地方、彼此对着说话，听得见对方；按下面的表演说明接话、停顿，喊的就喊、低声的就低声。" : "";
  return `${dry}${refText}${unrefText}场景：${scene.context}。人物：${cast}。${langRules ? langRules + "。" : ""}${together}`
    + `逐句表演（只照着演，不要念出来）：${notes}。`
    + `台词如下，每行开头的 @音频N 就是这一句该用的嗓子；按顺序念，不念 @音频N、角色名和编号，不加、不删、不改字：\n${script}`;
}
/** 整段母带目标：各句音量档按字数加权平均（dB 域）。 */
function TargetDb(scene) {
  let sum = 0, w = 0;
  for (const l of scene.lines) { const k = Math.max(1, Chars(l.text).length); sum += (PROJECTION_DB[l.projection] ?? PROJECTION_DB.normal) * k; w += k; }
  return +(sum / w).toFixed(2);
}

// ---------------------------------------------------------------------------
// 生成
// ---------------------------------------------------------------------------
const RawFile = (scene, n) => path.join(work, `${scene.id}_${n}.raw.mp3`);
const MetaFile = (scene, n) => path.join(work, `${scene.id}_${n}.json`);
const CutDir = (scene, n) => path.join(work, `${scene.id}_${n}`);
function Attempts(scene) {
  const list = [];
  for (let n = 1; n <= 9; n++) if (fs.existsSync(RawFile(scene, n)) && fs.existsSync(MetaFile(scene, n))) list.push(n);
  return list;
}
async function Generate(scene, n) {
  const prompt = ScenePrompt(scene), refs = References(scene);
  if (prompt.length > 3000) throw new Error(`${scene.id}: prompt exceeds 3000 characters (${prompt.length})`);
  const result = await SeedAudioSpeak({ prompt, references: refs.map((r) => r.file), label: `${scene.id}#${n}` });
  fs.writeFileSync(RawFile(scene, n), result.bytes);
  fs.writeFileSync(MetaFile(scene, n), JSON.stringify({ promptHash: Hash(prompt),
    references: refs.map((r) => ({ who: r.who, owner: r.owner, castSha256: r.sha256 })), subtitle: result.subtitle,
    seconds: result.seconds, generatedAt: new Date().toISOString() }, null, 1));
  console.log(`${scene.id}#${n}: ${result.bytes.length} bytes`);
}

// ---------------------------------------------------------------------------
// 母带 + 对字 + 切句
// ---------------------------------------------------------------------------
function Cut(scene, n) {
  const dir = CutDir(scene, n);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const meta = ReadJson(MetaFile(scene, n)), raw = RawFile(scene, n), wav = path.join(dir, "scene.wav");
  const spoken = scene.lines.map((l) => l.text);
  const mapped = MapSubtitleToLines(spoken, meta.subtitle);
  const hard = [], flags = [];
  const clip = ClipRuns(raw);
  if (clip >= 3) hard.push(`削波 ${clip} 处`);
  const rawSeconds = meta.seconds || MeasureVoice(raw).seconds;
  // 非词人声（吼、惨叫、呜咽）：时间戳对不上字不算漏句；夹在两句中间就占上一句末字到下一句首字的空当。
  mapped.forEach((m, i) => {
    if (!scene.lines[i].vocal || (m.start != null && m.coverage >= 0.5)) return;
    const prev = mapped.slice(0, i).reverse().find((x) => x.end != null), next = mapped.slice(i + 1).find((x) => x.start != null);
    Object.assign(m, { start: prev ? prev.end : 0, end: next ? next.start : rawSeconds, chars: [], vocalGap: true });
    flags.push(`${scene.lines[i].id} 非词人声，时间戳对不上字，占相邻两句之间的空当`);
  });
  const subChars = mapped.reduce((t, m) => t + m.chars.length, 0), scriptChars = mapped.reduce((t, m) => t + m.total, 0);
  if (!meta.subtitle?.sentences?.length && !scene.lines.every((l) => l.vocal)) hard.push("没有逐字时间戳");
  if (subChars > scriptChars * 1.25 + 2) hard.push(`多念（时间戳 ${subChars} 字 / 稿 ${scriptChars} 字）`);
  mapped.forEach((m, i) => { if (!m.vocalGap && !scene.lines[i].vocal && (m.start == null || m.coverage < 0.5)) hard.push(`漏句 ${scene.lines[i].id}（对上 ${m.matched}/${m.total} 字）`); });
  if (hard.some((h) => h.startsWith("漏句") || h === "没有逐字时间戳")) return { scene, n, hard, flags, slices: null };
  let extraDb = 0, master, slices, files, cutMethod;
  for (let round = 0; round < 3; round++) {
    master = MasterSceneWav(raw, wav, { targetDb: TargetDb(scene), ceilingDb: LINE_MASTER.ceilingDb, extraDb });
    const measure = MeasureVoice(wav), shift = master.trimStartS, framesInfo = FrameRms(wav);
    const lines = mapped.map((m) => ({ start: m.start - shift, end: m.end - shift }));
    slices = SliceScene(framesInfo, lines, { activeRmsDb: measure.activeRmsDb, padS: LINE_MASTER.padS });
    cutMethod = "subtitle";
    const tooFast = mapped.some((m) => !m.vocalGap && ((m.total >= 3 && (m.end - m.start) < 0.06 * m.total) || (m.total === 2 && m.end - m.start < 0.2)));
    const tooShort = slices.some((s, i) => s.endS - s.startS < Math.min(0.35, 0.1 + 0.05 * mapped[i].total));
    if (scene.lines.length > 1 && (tooFast || tooShort)) {
      const weights = scene.lines.map((l) => Math.max(0.25, Chars(l.text).length / (l.lang === "ja" ? 7.5 : 4.6)));
      const islands = IslandLines(framesInfo, weights, { activeRmsDb: measure.activeRmsDb });
      if (islands) {
        slices = SliceScene(framesInfo, islands, { activeRmsDb: measure.activeRmsDb, padS: LINE_MASTER.padS });
        cutMethod = "silence";
        flags.push(`逐字时间戳不可信（${tooFast ? "字速过快" : "切出过短的片段"}），改按静音与预计时长切`);
      } else hard.push("逐字时间戳不可信，静音段也不够切");
    }
    const sceneMp3 = EncodeSegment(wav, path.join(dir, "scene.mp3"), { fadeS: 0 });
    files = slices.map((s, i) => EncodeSegment(wav, path.join(dir, `line_${String(i + 1).padStart(2, "0")}.mp3`),
      { startS: s.startS, endS: s.endS, fadeS: LINE_MASTER.crossfadeS }));
    const peaks = [sceneMp3, ...files].map(TruePeakDb), worst = Math.max(...peaks);
    master.measure = { ...measure, truePeakDb: +peaks[0].toFixed(2) };
    master.slicePeaks = peaks.slice(1).map((p) => +p.toFixed(2));
    if (worst <= LINE_MASTER.ceilingDb) break;
    extraDb -= worst - LINE_MASTER.ceilingDb + 0.2;
  }
  Object.assign(master, { targetDb: TargetDb(scene), cutMethod });
  slices.forEach((s, i) => {
    if (s.tightStart || s.tightEnd) flags.push(`${scene.lines[i].id} 与邻句贴着，在能量最低处切`);
    s.file = files[i];
    const len = s.endS - s.startS, Clamp = (t) => Math.min(len, Math.max(0, t - master.trimStartS - s.startS));
    s.chars = mapped[i].chars.map(([c, a, b]) => [c, +Clamp(a).toFixed(3), +Clamp(b).toFixed(3)]);
    s.charSource = "seedaudio-subtitle";
    s.coverage = mapped[i].coverage;
  });
  return { scene, n, hard, flags, slices, master };
}

/** 转写与音色核对（一批一起跑：一次 whisper、一次音色编码）。只记录，不自动重抽。 */
function Judge(results) {
  const jobs = results.filter((r) => r.slices).flatMap((r) => r.slices.map((s, i) => ({ r, s, i, line: r.scene.lines[i] })));
  const castFiles = [...new Set(jobs.map((j) => CastReference(j.line.who)?.file).filter(Boolean))];
  const vectors = SpeakerEmbed([...jobs.map((j) => j.s.file), ...castFiles]);
  const texts = Transcribe(jobs.map((j) => ({ file: j.s.file, lang: j.line.lang === "ja" ? "ja" : "zh", text: j.line.text,
    reference: j.line.kanji || j.line.text })));
  if (!vectors) console.warn("音色编码不可用：嗓子一列留空");
  if (!texts) console.warn("whisper 不可用：转写一列留空");
  for (const { r, s, i, line } of jobs) {
    s.measure = MeasureVoice(s.file);
    s.cer = texts?.[s.file]?.cer ?? null;
    s.transcript = texts?.[s.file]?.text ?? null;
    if (r.master.cutMethod === "silence" && texts?.[s.file]?.chars?.length) { s.chars = texts[s.file].chars; s.charSource = "whisper-forced"; }
    if (line.vocal && !s.chars.length && texts?.[s.file]?.chars?.length) { s.chars = texts[s.file].chars; s.charSource = "whisper-forced"; }
    const own = CastReference(line.who);
    s.speakerCos = own && vectors?.[s.file] && vectors[own.file] ? +CenteredCosine(vectors[s.file], vectors[own.file]).toFixed(3) : null;
    const refs = References(r.scene);
    const others = [...new Set(r.scene.lines.map((l) => l.who))].filter((w) => w !== line.who)
      .map((w) => [w, CastReference(w)]).filter(([, ref]) => ref && ref.owner !== own?.owner && vectors?.[ref.file])
      .map(([w, ref]) => [w, +CenteredCosine(vectors[s.file], vectors[ref.file]).toFixed(3), RefIndex(refs, w) >= 0]).sort((a, b) => b[1] - a[1]);
    s.nearestOther = others[0] || null;
    const judged = s.measure.voicedS >= 0.6;
    const want = Chars(line.text).length, got = Chars(StripLaughter(s.transcript || "", line.text + (line.kanji || ""))).length;
    s.lengthDiff = got - want;
    const issues = [];
    if (!judged) issues.push(`有声 ${s.measure.voicedS} s，太短不判嗓子`);
    if (judged && s.speakerCos != null && s.nearestOther && s.nearestOther[1] - s.speakerCos > 0.08)
      issues.push(`更像${NameOf(r.scene, s.nearestOther[0])}（本人 ${s.speakerCos} / ${s.nearestOther[1]}${s.nearestOther[2] ? "" : "，对方没挂参考音"}）`);
    if (!line.vocal && s.cer != null && s.cer > 0.6 && Math.abs(got - want) > Math.max(2, 0.3 * want)) issues.push(`疑似念错（字错率 ${s.cer}）`);
    else if (!line.vocal && s.cer != null && s.cer > 0.34) issues.push(`字错率 ${s.cer} 待人耳核对`);
    s.issues = issues;
  }
  for (const r of results) {
    if (r.slices) for (const s of r.slices) if (s.issues?.some((x) => x.startsWith("更像") && !x.includes("没挂参考音")) || s.issues?.some((x) => x.startsWith("疑似念错"))) r.hard.push(`${r.scene.lines[r.slices.indexOf(s)].id} ${s.issues.join("；")}`);
    fs.writeFileSync(path.join(CutDir(r.scene, r.n), "judge.json"), JSON.stringify({ hard: r.hard, flags: r.flags,
      lines: r.slices?.map(({ file, ...s }) => s) || null, master: r.master || null }, null, 1));
  }
}

// ---------------------------------------------------------------------------
// 装上 + 清单
// ---------------------------------------------------------------------------
const LineFile = (scene, i) => path.join(outDir, `AudioVoice_Blockout0610${scene.id}_${String(i + 1).padStart(2, "0")}.mp3`);
function Install(r, manifest, timings) {
  const entry = { id: r.scene.id, beat: r.scene.beat, keyframe: r.scene.keyframe, label: r.scene.label, attempt: r.n, attempts: Attempts(r.scene).length,
    references: References(r.scene).map((ref) => ({ who: ref.who, owner: ref.owner, castSha256: ref.sha256 })),
    targetDb: r.master.targetDb, cutMethod: r.master.cutMethod, hard: r.hard, flags: r.flags, lines: [] };
  r.slices.forEach((s, i) => {
    const line = r.scene.lines[i], dest = LineFile(r.scene, i);
    fs.copyFileSync(s.file, dest);
    const sha256 = Sha256(dest), durationS = +MeasureVoice(dest).seconds.toFixed(3);
    entry.lines.push({ id: line.id, keyframe: line.keyframe, who: line.who, speaker: line.speaker, lang: line.lang, subtitle: line.subtitle, text: line.text,
      ...(line.vocal ? { vocal: true } : {}),
      file: `./Audio/Blockout0610/${path.basename(dest)}`, durationS, gapBeforeS: s.gapBeforeS, sha256,
      ...(s.speakerCos != null ? { speakerCos: s.speakerCos } : {}), ...(s.cer != null ? { cer: s.cer, transcript: s.transcript } : {}),
      ...(s.issues?.length ? { issues: s.issues } : {}) });
    if (s.chars?.length) timings[sha256] = { lineId: line.id, who: line.who, lang: line.lang === "ja" ? "ja" : "zh", seconds: durationS,
      source: s.charSource, chars: s.chars };
  });
  manifest.scenes = manifest.scenes.filter((x) => x.id !== entry.id);
  manifest.scenes.push(entry);
}

function FaceBake(manifest) {
  // 现成烘焙器（Script_FirstLevelFaceTrackBake.py --lines）只认 <lines-dir>/AudioVoice_FirstLevel<Scene>_<NN>.mp3：
  // 把片段按这个名字复制进临时目录（字节不变、sha256 不变），口型轨写到我们自己的文件，再把 file 改回真文件名。
  const timings = ReadJson(path.join(work, "LineTimings.json"), {});
  const dir = path.join(work, "FaceLines");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const real = new Map();
  for (const scene of manifest.scenes) for (const line of scene.lines) {
    if (!timings[line.sha256]) continue;
    const [sid, nn] = line.id.split(".");
    fs.copyFileSync(path.join(here, line.file), path.join(dir, `AudioVoice_FirstLevel${sid}_${nn}.mp3`));
    real.set(line.sha256, path.basename(line.file));
  }
  const live = Object.fromEntries(Object.entries(timings).filter(([sha]) => real.has(sha)));
  const liveFile = path.join(work, "LineTimings.live.json");
  fs.writeFileSync(liveFile, JSON.stringify(live, null, 1));
  // 每次整份重烘（旧轨按 sha 键，重录后自然作废）。
  fs.rmSync(faceTracksPath, { force: true });
  const result = spawnSync("py", ["-3.13", path.join(here, "Script_FirstLevelFaceTrackBake.py"), "--lines", liveFile, "--lines-dir", dir,
    "--output", faceTracksPath], { encoding: "utf8", windowsHide: true, maxBuffer: 1 << 26, env: { ...process.env, PYTHONUTF8: "1" } });
  console.log((result.stdout || "").split("\n").filter((l) => /MISSING|SKIP|wrote/.test(l)).join("\n"));
  if (!fs.existsSync(faceTracksPath)) { console.warn(`口型轨没烘出来（status ${result.status}）：${(result.stderr || "").slice(-400)}`); return; }
  const body = JSON.parse(fs.readFileSync(faceTracksPath, "utf8"));
  for (const [sha, track] of Object.entries(body.tracks)) if (real.has(sha)) track.file = real.get(sha);
  body.generator = "Script_FirstLevelFaceTrackBake.py（由 Script_EditorBlockoutFirstLevel0610Voice.mjs --face 调用）";
  const text = "{\n" + Object.entries(body).filter(([k]) => k !== "tracks").map(([k, v]) => ` ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(",\n")
    + ',\n "tracks": {\n' + Object.entries(body.tracks).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(",\n") + "\n }\n}\n";
  fs.writeFileSync(faceTracksPath, text);
  console.log(`口型轨 ${Object.keys(body.tracks).length} 条 → ${Rel(faceTracksPath)}（烘焙器退出码 ${result.status}）`);
}

async function Main() {
  const scenes = L0610_VOICE_SCENES.filter((s) => !only || only.includes(s.id));
  if (dry) {
    for (const scene of scenes) {
      const refs = References(scene), prompt = ScenePrompt(scene);
      console.log(`\n=== ${scene.id}（${scene.beat} / ${scene.keyframe}，${scene.lines.length} 句，提示词 ${prompt.length} 字，已有生成 ${Attempts(scene).length} 次）`);
      refs.forEach((r, i) => console.log(`  @音频${i + 1} = ${r.who.join("/")} ← ${Rel(r.file)} sha ${r.sha256.slice(0, 12)}`));
      console.log(prompt);
    }
    return;
  }
  fs.mkdirSync(work, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });
  for (const scene of scenes) {
    const have = Attempts(scene);
    if (!have.length) await Generate(scene, 1);
    else if (forced.has(scene.id)) {
      if (have.length >= MAX_ATTEMPTS) console.warn(`${scene.id}: 已生成 ${have.length} 次，到上限，不再重抽`);
      else await Generate(scene, Math.max(...have) + 1);
    }
  }
  const results = scenes.map((scene) => {
    const have = Attempts(scene), n = picks.get(scene.id) ?? Math.max(...have);
    return Cut(scene, n);
  });
  if (judge) Judge(results);
  const manifest = ReadJson(manifestPath, null) || { schema: "tengxian-blockout-voice/1", level: "FirstLevel0610", scenes: [] };
  const timings = ReadJson(path.join(work, "LineTimings.json"), {});
  for (const r of results) {
    console.log(`\n${r.scene.id}#${r.n}: ${r.hard.length ? "HARD " + r.hard.join("；") : "ok"}${r.flags.length ? " | " + r.flags.join("；") : ""}`);
    if (!r.slices) continue;
    r.slices.forEach((s, i) => console.log(`  ${r.scene.lines[i].id} ${r.scene.lines[i].speaker.padEnd(4, "　")} ${(s.endS - s.startS).toFixed(2)}s gap ${s.gapBeforeS} cos ${s.speakerCos ?? "-"} cer ${s.cer ?? "-"}「${s.transcript ?? ""}」${s.issues?.length ? " ← " + s.issues.join("；") : ""}`));
    Install(r, manifest, timings);
  }
  const order = L0610_VOICE_SCENES.map((s) => s.id);
  manifest.scenes.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  manifest.generatedAt = new Date().toISOString();
  manifest.requests = (manifest.requests || 0) + requestStats.requests;
  const ordered = { schema: manifest.schema, level: manifest.level, generatedAt: manifest.generatedAt, requests: manifest.requests,
    note: "占位配音（SeedAudio seed-audio-1.0，整段一次生成后按逐字时间戳切句）。file 相对 Taierzhuang1938/index.html；gapBeforeS 是录音里与上一句的原始间隔；keyframe 是契约 §4 的关键帧 id。",
    scenes: manifest.scenes };
  fs.writeFileSync(manifestPath, JSON.stringify(ordered, null, 1) + "\n");
  fs.writeFileSync(path.join(work, "LineTimings.json"), JSON.stringify(timings, null, 1));
  console.log(`\n清单 → ${Rel(manifestPath)}；本次请求 ${requestStats.requests} 次（重试 ${requestStats.retries}，失败 ${requestStats.failures}）`);
  if (face) FaceBake(ordered);
}

Main().catch((error) => { console.error(String(error?.message || error).replaceAll(process.env.VOLCENGINE_API_KEY || "\u0000", "[redacted]")); process.exitCode = 1; });
