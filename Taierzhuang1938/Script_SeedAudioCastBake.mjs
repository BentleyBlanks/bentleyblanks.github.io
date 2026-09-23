// 定妆音：每个开口角色先生成几条 15–25 s 的干声独白候选，按客观指标打分，选定一条作为
// 之后所有剧情句的参考音（references）。
//
//   node Taierzhuang1938/Script_SeedAudioCastBake.mjs --only=luo,yaowa [--takes=3] [--jobs=2]
//        生成候选到 <worktree>/tmp/voice/cast/<who>_<n>.mp3 并打分（不动仓库文件）
//   node Taierzhuang1938/Script_SeedAudioCastBake.mjs --score [--only=...]
//        只重新打分已有候选
//   node Taierzhuang1938/Script_SeedAudioCastBake.mjs --pick=luo:2,yaowa:1 [--note=luo:"..."]
//        把选中的候选拷到 Audio/FirstLevel/Cast/AudioVoiceCast_<Who>.mp3，写进
//        Audio/FirstLevel/Data_FirstLevelVoiceCastManifest.json（sha256、指标、理由）
//   --auto   对 --only 里每个角色按打分自动选第一名（理由写「auto: 指标」）
//
// 打分（越小越好，全是客观量，我们听不见）：
//   · F0 中位数落在 FIRST_LEVEL_VOICE_CAST[who].f0 区间外：每差 10 Hz 罚 1
//   · 信噪比 < 30 dB 罚（干声应该很干净）；首尾静音 > 0.4 s 罚
//   · 转写字错率（faster-whisper medium，Script_FirstLevelVoiceAlign.py --transcribe）
//   · 与同阵营已选定角色的音色向量余弦 > 0.55 罚（撞嗓）
// 密钥只从 VOLCENGINE_API_KEY 读；并发默认 2（本机还有别的包在调）。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FIRST_LEVEL_VOICE_CAST, DRY_VOICE_RULE, VOICE_LANG_RULE, CastVoiceOwner } from "./Data_FirstLevelVoiceCast.mjs";
import { SeedAudioSpeak, MasterLine, MeasureVoice, SpeakerEmbed, CenteredCosine, Sha256, Pool, requestStats, SEED_AUDIO_MODEL, Transcribe }
  from "./Script_SeedAudioVoiceKit.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const worktree = path.dirname(here);
const work = path.join(worktree, "tmp", "voice", "cast");
const castDir = path.join(here, "Audio", "FirstLevel", "Cast");
const manifestPath = path.join(here, "Audio", "FirstLevel", "Data_FirstLevelVoiceCastManifest.json");
const Arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const only = Arg("only")?.split(",").filter(Boolean);
const takes = Math.max(1, Number(Arg("takes") || 3));
const jobs = Math.min(2, Math.max(1, Number(Arg("jobs") || 2)));
export const CAST_TARGET_DB = -20;

export function CastFile(who) {
  return `Cast/AudioVoiceCast_${who[0].toUpperCase()}${who.slice(1)}.mp3`;
}
export function CastPrompt(who) {
  const c = FIRST_LEVEL_VOICE_CAST[who];
  return `${DRY_VOICE_RULE}角色：${c.persona}。${VOICE_LANG_RULE[c.lang]}`
    + "这是用来固定角色嗓音的定妆录音：按这个人物自己的性格自然地说话，情绪平稳、带一点性格色彩，"
    + "不要喊叫也不要耳语，语速自然，一口气念完，不念任何说明。台词：“" + c.sample + "”";
}
const ReadManifest = () => fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : { model: SEED_AUDIO_MODEL, cast: {} };

async function Generate(roles) {
  fs.mkdirSync(work, { recursive: true });
  const jobsList = roles.flatMap((who) => Array.from({ length: takes }, (_, i) => ({ who, n: i + 1 })));
  const { errors } = await Pool(jobsList, jobs, async ({ who, n }) => {
    const raw = path.join(work, `${who}_${n}.raw.mp3`);
    if (fs.existsSync(raw) && !process.argv.includes("--force")) return;
    const { bytes, subtitle } = await SeedAudioSpeak({ prompt: CastPrompt(who), label: `cast ${who}#${n}` });
    fs.writeFileSync(raw, bytes);
    fs.writeFileSync(raw.replace(/\.raw\.mp3$/, ".subtitle.json"), JSON.stringify(subtitle || null));
    console.log(`cast ${who}#${n}: ${bytes.length} bytes`);
  });
  for (const e of errors) console.error(e.message);
}

export async function Score(roles) {
  const candidates = [];
  for (const who of roles) for (let n = 1; ; n++) {
    const raw = path.join(work, `${who}_${n}.raw.mp3`);
    if (!fs.existsSync(raw)) break;
    const file = path.join(work, `${who}_${n}.mp3`);
    const { measure } = MasterLine(raw, file, { targetDb: CAST_TARGET_DB, padS: 0.08 });
    candidates.push({ who, n, file, measure });
  }
  const manifest = ReadManifest();
  const chosen = Object.entries(manifest.cast).map(([who, e]) => ({ who, file: path.join(here, "Audio", "FirstLevel", e.file) }))
    .filter((e) => fs.existsSync(e.file));
  const vectors = SpeakerEmbed([...candidates.map((c) => c.file), ...chosen.map((c) => c.file)]);
  const texts = Transcribe(candidates.map((c) => ({ file: c.file, lang: FIRST_LEVEL_VOICE_CAST[c.who].lang === "ja" ? "ja" : "zh",
    text: FIRST_LEVEL_VOICE_CAST[c.who].sample, reference: FIRST_LEVEL_VOICE_CAST[c.who].sampleRef })));
  for (const c of candidates) {
    const cast = FIRST_LEVEL_VOICE_CAST[c.who], m = c.measure;
    const f0 = m.f0.median, [lo, hi] = cast.f0;
    let score = 0; const why = [];
    const off = f0 < lo ? lo - f0 : f0 > hi ? f0 - hi : 0;
    if (off) { score += off / 10; why.push(`F0 ${f0} Hz 出区间 ${lo}–${hi}`); }
    if (m.snrDb < 30) { score += (30 - m.snrDb) / 5; why.push(`SNR ${m.snrDb} dB`); }
    if (m.seconds < 12 || m.seconds > 30) { score += 3; why.push(`时长 ${m.seconds} s`); }
    c.cer = texts?.[c.file]?.cer ?? null;
    c.transcript = texts?.[c.file]?.text ?? null;
    if (c.cer != null) score += c.cer * 10;
    c.clash = [];
    if (vectors) for (const other of chosen) {
      if (other.who === c.who || FIRST_LEVEL_VOICE_CAST[other.who]?.faction !== cast.faction) continue;
      const sim = CenteredCosine(vectors[c.file], vectors[other.file]);
      c.clash.push([other.who, +sim.toFixed(3)]);
      if (sim > 0.55) { score += (sim - 0.55) * 20; why.push(`与 ${other.who} 撞嗓 ${sim.toFixed(2)}`); }
    }
    c.score = +score.toFixed(2); c.why = why;
    c.vector = vectors?.[c.file] || null;
  }
  // 同一角色候选之间的相互余弦：看模型给这个人设抽出来的嗓子有多分散。
  for (const who of roles) {
    const mine = candidates.filter((c) => c.who === who && c.vector);
    for (const c of mine) c.siblings = mine.filter((o) => o !== c).map((o) => [o.n, +CenteredCosine(c.vector, o.vector).toFixed(3)]);
  }
  const report = candidates.map(({ vector, ...rest }) => ({ ...rest, file: path.relative(worktree, rest.file).replaceAll("\\", "/") }));
  fs.writeFileSync(path.join(work, "Data_CastCandidates.json"), JSON.stringify(report, null, 2));
  for (const c of report) console.log(`${c.who}#${c.n} score ${c.score} | ${c.measure.seconds}s F0 ${c.measure.f0.median} (${c.measure.f0.p10}-${c.measure.f0.p90}) SNR ${c.measure.snrDb} CER ${c.cer} ${c.why.join("; ")}`);
  return report;
}

function Pick(pairs, notes, report) {
  const manifest = ReadManifest();
  fs.mkdirSync(castDir, { recursive: true });
  for (const [who, n] of pairs) {
    if (CastVoiceOwner(who) !== who) throw new Error(`${who} shares a cast voice with ${CastVoiceOwner(who)}`);
    const src = path.join(work, `${who}_${n}.mp3`);
    if (!fs.existsSync(src)) throw new Error(`No candidate ${who}#${n}`);
    const rel = CastFile(who), dst = path.join(here, "Audio", "FirstLevel", rel);
    fs.copyFileSync(src, dst);
    const row = report?.find((c) => c.who === who && c.n === n);
    manifest.cast[who] = { file: rel, sha256: Sha256(dst), candidate: n, prompt: CastPrompt(who),
      measure: row?.measure || MeasureVoice(dst), cer: row?.cer ?? null, transcript: row?.transcript ?? null,
      score: row?.score ?? null, note: notes[who] || (row ? `auto: 候选 ${n}，得分 ${row.score}${row.why.length ? "（" + row.why.join("；") + "）" : "，无扣分项"}` : "") };
    console.log(`picked ${who}#${n} -> ${rel}`);
  }
  manifest.updatedAt = new Date().toISOString();
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}

async function Main() {
  const roles = (only || Object.keys(FIRST_LEVEL_VOICE_CAST)).filter((who) => CastVoiceOwner(who) === who);
  for (const who of roles) if (!FIRST_LEVEL_VOICE_CAST[who]) throw new Error(`Unknown cast id ${who}`);
  const pick = Arg("pick");
  const notes = Object.fromEntries((process.argv.filter((a) => a.startsWith("--note=")).map((a) => a.slice(7).split(/:(.*)/s).slice(0, 2))));
  if (pick) {
    const report = fs.existsSync(path.join(work, "Data_CastCandidates.json")) ? JSON.parse(fs.readFileSync(path.join(work, "Data_CastCandidates.json"), "utf8")) : null;
    Pick(pick.split(",").map((p) => { const [w, n] = p.split(":"); return [w, Number(n)]; }), notes, report);
    return;
  }
  if (!process.argv.includes("--score")) await Generate(roles);
  const report = await Score(roles);
  if (process.argv.includes("--auto")) {
    const best = roles.map((who) => report.filter((c) => c.who === who).sort((a, b) => a.score - b.score)[0]).filter(Boolean);
    Pick(best.map((c) => [c.who, c.n]), notes, report);
  }
  console.log(`requests ${requestStats.requests}, retries ${requestStats.retries}, failures ${requestStats.failures}`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) Main().catch((e) => { console.error(e.message); process.exitCode = 1; });
