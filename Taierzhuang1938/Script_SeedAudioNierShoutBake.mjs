// 妮儿的叫声（第一关 06–11 耿家的聋女娃，Script_FirstLevelGengFamily）：Data_Voice 里 kind "nier" 的两条非词人声。
//
//   node Taierzhuang1938/Script_SeedAudioNierShoutBake.mjs [--takes=2] [--force] [--dry] [--score]
//
// 她听不见自己，所以叫出来从不收敛：又粗又响、直愣愣的女童嗓。免费素材库（Sonniss GDC 2016–2023）里的孩童喊叫都是
// 说词的或成年女声尖叫，没有合适的，所以按音效的写法（docs/Data_SeedAudioCombat.md：单次事件、开头立即发生、不要
// 环境 / 音乐 / 其他人声）用 seed-audio-1.0 生成。每条 --takes 条候选，按客观指标选（我们听不见）：
//   · 有声时长 0.3–1.4 s（一声就完）；基频中位 230–520 Hz（女童，不是大人）；信噪比 ≥ 30 dB；原始 take 不削波
//   · 转写出来的字不许是词（只许 啊 / 嗳 / 哎 / 呀 / 嘿 这类叹词，或转不出字）
// 成品母带与口令同一档：有声段 RMS −16.1 dBFS、真峰值 ≤ −1 dBTP（Data_Voice.VOICE_DELIVERY_MIX.shout），单声道 44.1 kHz。
// 候选留在 <worktree>/tmp/voice/nier/，成品 Audio/AudioVoice_NierShout_NN.mp3，记录 Audio/Data_NierShoutManifest.json，
// Data_Voice 里这两行的 dur 回写成品时长。密钥只从 VOLCENGINE_API_KEY 读。
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { VOICE_LINES, VOICE_DELIVERY_MIX } from "./Data_Voice.mjs";
import { SeedAudioSpeak, MasterLine, MeasureVoice, Transcribe, TruePeakDb, ClipRuns, Sha256, Pool, requestStats, SEED_AUDIO_MODEL }
  from "./Script_SeedAudioVoiceKit.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const worktree = path.dirname(here);
const work = path.join(worktree, "tmp", "voice", "nier");
const audioDir = path.join(here, "Audio");
const manifestPath = path.join(audioDir, "Data_NierShoutManifest.json");
const Arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const takes = Math.max(1, Number(Arg("takes") || 2));
const jobs = Math.min(2, Math.max(1, Number(Arg("jobs") || 2)));   // 本机还有别的烘焙在调（并发总上限 3）
const dry = process.argv.includes("--dry"), force = process.argv.includes("--force"), scoreOnly = process.argv.includes("--score");

export const NIER_SHOUT_LINES = VOICE_LINES.filter((line) => line.kind === "nier");
export const NIER_CHECK = Object.freeze({ voicedS: [0.3, 1.4], f0Hz: [230, 520], minSnrDb: 30, targetDb: VOICE_DELIVERY_MIX.shout.rms, ceilingDb: -1 });
const COMMON = "录音棚近讲干声，单声道，只有这一个孩子的声音：没有任何环境声、音效、音乐、混响和其他人声，开头立即发声，结尾不留长空白。"
  + "角色：一个十一岁的中国农村女孩，天生听不见、也不会说话，所以叫出来的声音从来不收敛：又粗又响、直愣愣的、不像正常孩子那样圆润；"
  + "是女童的嗓子（高、亮，不是大人的声音），但很野、很冲。";
const SHOUT_PROMPTS = Object.freeze({
  nier_shout_01: COMMON + "她隔着十几米看见了什么，冲着人用尽力气叫一声：一声短促、响亮、粗野的「啊——！」，大约半秒到一秒，"
    + "不是词、不是尖叫、不是哭、不是笑；只叫这一声，不重复，不念任何说明。",
  nier_shout_02: COMMON + "她高兴地冲着人叫了一声，带着笑意、嗓门很大：一声粗而响的「嗳——！」，大约半秒到一秒，"
    + "不是词、不是尖叫、不是哭；只叫这一声，不重复，不念任何说明。",
});
export const ShoutPrompt = (key) => SHOUT_PROMPTS[key];
const INTERJECTIONS = /^[啊嗳哎呀嘿哦噢欸嗨哈呃嗯]+$/u;

const ReadManifest = () => fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : { model: SEED_AUDIO_MODEL, cues: {} };
const RawOf = (key, n) => path.join(work, `${key}_${n}.raw.mp3`);

async function Generate() {
  fs.mkdirSync(work, { recursive: true });
  const list = NIER_SHOUT_LINES.flatMap((line) => Array.from({ length: takes }, (_, i) => ({ key: line.key, n: i + 1 })));
  const { errors } = await Pool(list, jobs, async ({ key, n }) => {
    if (fs.existsSync(RawOf(key, n)) && !force) return;
    const { bytes } = await SeedAudioSpeak({ prompt: ShoutPrompt(key), subtitle: false, label: `${key}#${n}` });
    fs.writeFileSync(RawOf(key, n), bytes);
    console.log(`${key}#${n}: ${bytes.length} bytes`);
  });
  for (const e of errors) console.error(e.message);
}

/** 母带到口令档、量指标、转写；越小越好的分数（硬门槛不过的排到最后）。 */
function Score() {
  const rows = [];
  for (const line of NIER_SHOUT_LINES) for (let n = 1; ; n++) {
    const raw = RawOf(line.key, n);
    if (!fs.existsSync(raw)) break;
    const file = raw.replace(/\.raw\.mp3$/, ".mp3");
    const { measure, gainDb } = MasterLine(raw, file, { targetDb: NIER_CHECK.targetDb, padS: 0.06, ceilingDb: NIER_CHECK.ceilingDb });
    rows.push({ key: line.key, n, raw, file, measure: { ...measure, truePeakDb: +TruePeakDb(file).toFixed(2) }, gainDb: +gainDb.toFixed(2), clipRuns: ClipRuns(raw) });
  }
  const texts = Transcribe(rows.map((r) => ({ file: r.file, lang: "zh", text: NIER_SHOUT_LINES.find((l) => l.key === r.key).text })));
  for (const r of rows) {
    const m = r.measure, why = [];
    let score = 0;
    const [lo, hi] = NIER_CHECK.voicedS;
    if (m.voicedS < lo) { score += 5 + (lo - m.voicedS) * 10; why.push(`有声 ${m.voicedS} s 太短`); }
    if (m.voicedS > hi) { score += 5 + (m.voicedS - hi) * 5; why.push(`有声 ${m.voicedS} s 太长`); }
    const f0 = m.f0?.median || 0, [flo, fhi] = NIER_CHECK.f0Hz;
    if (!(f0 >= flo && f0 <= fhi)) { score += 5 + Math.min(10, Math.abs(f0 - (f0 < flo ? flo : fhi)) / 20); why.push(`基频 ${f0} Hz 不在 ${flo}–${fhi}`); }
    if (m.snrDb < NIER_CHECK.minSnrDb) { score += (NIER_CHECK.minSnrDb - m.snrDb) / 3; why.push(`信噪比 ${m.snrDb} dB`); }
    if (r.clipRuns) { score += 5; why.push(`原始 take 削波 ${r.clipRuns} 处`); }
    r.transcript = texts?.[r.file]?.text ?? null;
    const letters = [...(r.transcript || "")].filter((c) => /\p{Script=Han}/u.test(c)).join("");
    if (letters && !INTERJECTIONS.test(letters)) { score += 4; why.push(`转写像词「${r.transcript}」`); }
    r.score = +score.toFixed(2); r.why = why;
    console.log(`${r.key}#${r.n} score ${r.score} | ${m.seconds}s voiced ${m.voicedS}s F0 ${f0} (${m.f0?.p10}-${m.f0?.p90}) low ${m.lowShare} SNR ${m.snrDb} rms ${m.activeRmsDb} tp ${m.truePeakDb} clip ${r.clipRuns} 「${r.transcript}」 ${why.join("; ")}`);
  }
  fs.writeFileSync(path.join(work, "Data_NierShoutCandidates.json"), JSON.stringify(rows.map((r) => ({ ...r, raw: path.relative(worktree, r.raw), file: path.relative(worktree, r.file) })), null, 2));
  return rows;
}

function Install(rows) {
  const manifest = ReadManifest();
  let source = fs.readFileSync(path.join(here, "Data_Voice.mjs"), "utf8");
  for (const line of NIER_SHOUT_LINES) {
    const best = rows.filter((r) => r.key === line.key).sort((a, b) => (a.score - b.score) || (a.n - b.n))[0];
    if (!best) { console.warn(`${line.key}: no candidate`); continue; }
    const dst = path.join(audioDir, line.file);
    fs.copyFileSync(best.file, dst);
    manifest.cues[line.key] = { file: line.file, sha256: Sha256(dst), bytes: fs.statSync(dst).size, seconds: best.measure.seconds,
      prompt: ShoutPrompt(line.key), promptHash: crypto.createHash("sha256").update(ShoutPrompt(line.key)).digest("hex"), candidate: best.n,
      takes: rows.filter((r) => r.key === line.key).length, score: best.score, why: best.why, measure: best.measure, gainDb: best.gainDb,
      clipRuns: best.clipRuns, transcript: best.transcript, targetDb: NIER_CHECK.targetDb, mastering: "ActiveRmsToShoutBandTruePeakMinus1" };
    // Data_Voice 这一行的 dur 回写（与 Script_VoiceBake 同一个约定：实测成品时长）。
    const re = new RegExp(`(key: "${line.key}",[^\\n]*?dur: )([0-9.]+)`);
    if (!re.test(source)) throw new Error(`${line.key}: dur field not found in Data_Voice.mjs`);
    source = source.replace(re, `$1${best.measure.seconds.toFixed(2)}`);
    console.log(`installed ${line.key} <- candidate ${best.n} (${best.measure.seconds}s, F0 ${best.measure.f0.median} Hz)`);
  }
  fs.writeFileSync(path.join(here, "Data_Voice.mjs"), source);
  manifest.updatedAt = new Date().toISOString();
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}

async function Main() {
  if (!NIER_SHOUT_LINES.length) throw new Error("Data_Voice has no kind \"nier\" lines");
  if (dry) { for (const line of NIER_SHOUT_LINES) console.log(`${line.key}: ${takes} takes, prompt ${ShoutPrompt(line.key).length} chars`); return; }
  if (!scoreOnly) await Generate();
  Install(Score());
  console.log(`requests ${requestStats.requests}, retries ${requestStats.retries}, failures ${requestStats.failures}`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) Main().catch((e) => { console.error(e.message); process.exitCode = 1; });
