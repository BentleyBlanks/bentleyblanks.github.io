// 战场口令的配音烘焙：Data_Voice 的文本 → 本机 MiniMax Hub → Audio/vo_*.mp3。
//
//   node Taierzhuang1938/Script_VoiceBake.mjs --missing        # 只烘没有音频的
//   node Taierzhuang1938/Script_VoiceBake.mjs spot_tank ...    # 指定 key
//   node Taierzhuang1938/Script_VoiceBake.mjs --all --force    # 全部重烘
//   node Taierzhuang1938/Script_VoiceBake.mjs --dry            # 只打要烘哪些，不花钱
//   ... --from-workspace                                       # 用上次生成的 wav 重转码
//   node Taierzhuang1938/Script_VoiceBake.mjs --normalize      # 只统一响度，不重新生成
//   node Taierzhuang1938/Script_VoiceBake.mjs --clean <key>…   # 只为降底噪重摇，不如旧的就留旧的
//
// 烘完把实测时长写回 Data_Voice.mjs 的 dur 字段（Script_VoiceTest 断言 0.3—2.6 s）。
//
// ## 为什么用 seedaudio 而不是 minimax_tts
// 整套声库是 seed-audio-1.0 出的。改几句就换引擎的话，同一个班里会有两种音质，
// 比句子本身不好听更出戏。**要改就整批换，不要混着来。**
//
// ## 这个模型没有方言参数
// 川味只能从**文本本身的方言词汇与语法**里读出来（见 Data_Voice 文件头的设计笔记）。
// 参数这一栏能管的只有音高与语速 —— 而这两个恰恰决定了「急不急」：
//   · pitch 往上抬 = 嗓子尖 = 听着轻快。**报敌情的句子最怕这个**：
//     新兵那句「战车」原本 pitch +2，喊出来像小孩看见花车游行。
//   · speed 往上提 = 急。报警句一律 1.1—1.15，督战句留在 1.0（班长要沉住气）。
// **不要把 speed 提到 1.35 以上** —— 实测那个档位模型频繁只吐半句。
//
// ## 三道闸（都是用户听出来之后补的）
//   1. **响度统一**（有声段 RMS 拉到同一档）。这一批声音在游戏里的音量应该只由
//      距离与遮挡决定 —— 文件本身有响有闷的话，玩家会以为「那个人离得远」，
//      其实只是那一条烘得轻。**别拿 loudnorm 量**：EBU R128 的积分响度要 3 秒以上
//      才可靠，这批全是 0.8—2.5 秒的喊话，量出来的数字自相矛盾（归一化之后反而更散）。
//   2. **底噪闸**（≤ -55 dB）。seedaudio 偶尔会自带一层环境音（风声/房间声），
//      同一句话重生成一次就没有了 —— 所以是「重试」而不是「降噪」：
//      降噪会把喊话的齿音一起削掉。实测「找掩护！躲到起！」那条底噪高到 -18.7 dB，
//      比人声只低 17 dB，听起来像在另一个场景里录的。
//   3. **有些句子根本不该走 TTS**。非语言的惨叫（「啊——！」）TTS 做不像，而且
//      模型的默认音色偏女声，pitch 压到 -6 也还是女的。这类行在 Data_Voice 里写
//      `sample: {...}`，改从免版税素材库取真人录音（与音效那一套同源，见
//      docs/Data_AudioAssets.md）。

import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { VOICE_LINES } from "./Data_Voice.mjs";
import { ArchiveUrl } from "./Data_SfxSources.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GATEWAY = process.env.MINIMAX_GATEWAY || "http://127.0.0.1:8001";
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const AUDIO_DIR = path.join(HERE, "Audio");
const VOICE_TABLE = path.join(HERE, "Data_Voice.mjs");
const UA = "TaierzhuangVoiceBake/1.0 (https://bentleyblanks.github.io)";

// **不要用 loudnorm（EBU R128）量这批声音**：积分响度要 3 秒以上才可靠，
// 而这里全是 0.8—2.5 秒的喊话。实测拿 loudnorm 归一化之后反而更散
// （目标 -18 LUFS，量回来 -23.1 / -19.9 / -18.3 都有）。
// 改量**有声段 RMS**：把高于「峰值 -20 dB」的格挑出来求 RMS，短句上稳定得多。
const TARGET_RMS = -16.1;     // dBFS，取现有 31 条的中位数，改动面最小
const PEAK_CEIL = -1.0;       // dBFS，抬音量不许把峰顶撞上去
const RMS_TOL = 0.4;          // 差这么点就别动了，省一代重编码
const FLOOR_MAX = -55;        // 底噪上限（dB），超了就重试
const TRIES = 3;

/**
 * 每句的合成参数。pitch 是**这一句该用多高的嗓子**，speed 是**多急**。
 * 缺省按 role 取；行里写了就以行为准（Data_Voice 的 pitch / speed 字段）。
 * 值一律是字符串 —— 传数字网关报 `value?.trim is not a function`。
 */
const ROLE_DEFAULT = {
  班长: { pitch: -2, speed: 1.0 },
  老兵: { pitch: -4, speed: 1.0 },
  普通兵: { pitch: 0, speed: 1.0 },
  新兵: { pitch: 0, speed: 1.1 },
};

const args = process.argv.slice(2);
const force = args.includes("--force");
const dry = args.includes("--dry");
const reuse = args.includes("--from-workspace");   // 拿上次生成的 wav 重转码，不花积分
const normalizeOnly = args.includes("--normalize");
// --clean：只为降底噪重摇 take，**新的不如旧的就留旧的**。
// 模型的底噪是每次生成随机的：不做这道比较，一次「清理」可能把好好的一条换成更脏的
// （实测 spot_gap 从 -43 dB 被换成 -32.7 dB）。文本改过的行别用这个模式 —— 旧文件念的是旧词。
const cleanOnly = args.includes("--clean");
const picks = args.filter((a) => !a.startsWith("--"));
const Has = (line) => fs.existsSync(path.join(AUDIO_DIR, line.file));

// ---------------------------------------------------------------------------
// 度量与转码
// ---------------------------------------------------------------------------
const Ffprobe = () => FFMPEG.replace(/ffmpeg(\.exe)?$/i, (m) => m.replace("ffmpeg", "ffprobe"));

function Duration(file) {
  const p = spawnSync(Ffprobe(), ["-v", "error", "-show_entries", "format=duration",
    "-of", "csv=p=0", file], { encoding: "utf8" });
  return parseFloat(p.stdout || "0") || 0;
}

/**
 * 底噪：20 ms 一格的 RMS，取第 8 百分位。
 * 自己解 PCM 算，不去 parse ffmpeg 的 astats 文本 —— 那玩意的字段名跨版本会变。
 */
function NoiseFloor(file) {
  const sr = 16000;
  const raw = execFileSync(FFMPEG, ["-v", "error", "-i", file, "-ac", "1", "-ar", String(sr),
    "-f", "s16le", "-"], { maxBuffer: 1 << 26 });
  const n = Math.round(sr * 0.02);
  const frames = [];
  for (let f = 0; f * n * 2 + n * 2 <= raw.length; f += 1) {
    let s = 0;
    for (let i = 0; i < n; i += 1) { const v = raw.readInt16LE((f * n + i) * 2) / 32768; s += v * v; }
    frames.push(Math.sqrt(s / n));
  }
  if (!frames.length) return 0;
  frames.sort((a, b) => a - b);
  return 20 * Math.log10(frames[Math.floor(frames.length * 0.08)] + 1e-9);
}

/**
 * 峰值与**有声段 RMS**（dBFS）。有声 = 高于「峰值 -20 dB」的 20 ms 格 ——
 * 只统计真正在喊的那部分，句子里的停顿不参与，短句上比积分响度稳。
 */
function SpeechStats(file) {
  const sr = 16000;
  const raw = execFileSync(FFMPEG, ["-v", "error", "-i", file, "-ac", "1", "-ar", String(sr),
    "-f", "s16le", "-"], { maxBuffer: 1 << 26 });
  const count = raw.length >> 1;
  let peak = 0;
  for (let i = 0; i < count; i += 1) peak = Math.max(peak, Math.abs(raw.readInt16LE(i * 2) / 32768));
  const n = Math.round(sr * 0.02);
  const frames = [];
  for (let f = 0; (f + 1) * n <= count; f += 1) {
    let s = 0;
    for (let i = 0; i < n; i += 1) { const v = raw.readInt16LE((f * n + i) * 2) / 32768; s += v * v; }
    frames.push(Math.sqrt(s / n));
  }
  const gate = peak * 0.1;
  const voiced = frames.filter((v) => v >= gate);
  const rms = voiced.length ? Math.sqrt(voiced.reduce((a, v) => a + v * v, 0) / voiced.length) : 0;
  return { peakDb: 20 * Math.log10(peak + 1e-9), rmsDb: 20 * Math.log10(rms + 1e-9) };
}

/** 要加多少 dB 才落到目标 RMS；抬不动就以峰值天花板为准（宁可轻一点也不削顶）。 */
function GainDb(stats) {
  return Math.min(TARGET_RMS - stats.rmsDb, PEAK_CEIL - stats.peakDb);
}

/**
 * 转码成 40 kbps 单声道，路上做三件必须做的事：
 *   1. 削掉首尾静音 —— 不削就是「喊之前先愣一下」。
 *   2. 超长就 atempo 压回来 —— seedaudio 念得慢，七个字能念 3.3 秒，而喊话
 *      超过 2.5 秒在战场上读不完。**不能靠把 speed 提上去**（>1.35 会只吐半句），
 *      atempo 变速不变调，嗓子不会变成花栗鼠。压缩比封在 1.6。
 *   3. 归一化到统一的有声段 RMS —— 整批音量必须一致，**远近交给游戏里的距离
 *      衰减与遮挡去管**；文件本身有响有闷的话，玩家会以为「那个人离得远」。
 */
function Encode(src, dst, { maxDur = 2.35 } = {}) {
  const stage = dst + ".stage.wav";
  const trim = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02"
    + ",areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02,areverse";
  let r = spawnSync(FFMPEG, ["-y", "-v", "error", "-i", src, "-af", trim, stage], { encoding: "utf8" });
  if (r.status !== 0) return { error: (r.stderr || "").slice(-160) };
  const raw = Duration(stage);
  const tempo = raw > maxDur ? Math.min(1.6, raw / maxDur) : 1;
  if (tempo > 1) {
    const fast = dst + ".fast.wav";
    r = spawnSync(FFMPEG, ["-y", "-v", "error", "-i", stage, "-af", `atempo=${tempo.toFixed(3)}`, fast],
      { encoding: "utf8" });
    fs.rmSync(stage, { force: true });
    if (r.status !== 0) return { error: (r.stderr || "").slice(-160) };
    fs.renameSync(fast, stage);
  }
  const gain = GainDb(SpeechStats(stage));
  r = spawnSync(FFMPEG, ["-y", "-v", "error", "-i", stage, "-af", `volume=${gain.toFixed(2)}dB`,
    "-ac", "1", "-ar", "24000", "-b:a", "40k", dst], { encoding: "utf8" });
  fs.rmSync(stage, { force: true });
  if (r.status !== 0) return { error: (r.stderr || "").slice(-160) };
  return {
    dur: Math.round(Duration(dst) * 100) / 100,
    raw: Math.round(raw * 100) / 100, tempo,
    floor: Math.round(NoiseFloor(dst) * 10) / 10,
  };
}

/**
 * 兜底降噪。**只在重试若干次都下不去时才用** —— 换一条 take 永远优于修一条 take：
 * 降噪修的是频谱，喊话的齿音与爆破音就在被修的那一带上。
 * nr=12 dB 是刻意留手的量：够把房间声压到听不见，不至于把「趴倒」的 p 削平。
 * 改善不到 6 dB 就当没发生（宁可留一点底噪，也不要一条发闷的喊话）。
 */
function Denoise(file) {
  const before = NoiseFloor(file);
  const tmp = file + ".dn.mp3";
  const r = spawnSync(FFMPEG, ["-y", "-v", "error", "-i", file, "-af", "afftdn=nr=12:nf=-40",
    "-ac", "1", "-ar", "24000", "-b:a", "40k", tmp], { encoding: "utf8" });
  if (r.status !== 0) { fs.rmSync(tmp, { force: true }); return { floor: before, applied: false }; }
  const after = NoiseFloor(tmp);
  if (after > before - 6) { fs.rmSync(tmp, { force: true }); return { floor: before, applied: false }; }
  fs.renameSync(tmp, file);
  return { floor: Math.round(after * 10) / 10, applied: true };
}

/** --from-workspace：拿上一次生成留在工作区的 wav 重新转码，不再花积分。 */
function WorkspaceTake(dir, key) {
  const files = fs.readdirSync(dir)
    .filter((f) => f.startsWith(`tzvoice_${key}`) && /\.(wav|mp3)$/i.test(f))
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  return files.length ? path.join(dir, files[0].f) : null;
}

// ---------------------------------------------------------------------------
// --normalize：只把已有文件的响度拉齐，不重新生成
// ---------------------------------------------------------------------------
if (normalizeOnly) {
  const lines = picks.length ? VOICE_LINES.filter((l) => picks.includes(l.key)) : VOICE_LINES;
  let done = 0;
  for (const line of lines) {
    const file = path.join(AUDIO_DIR, line.file);
    if (!fs.existsSync(file)) { console.warn(`  ✗ ${line.key} 没有文件`); continue; }
    // 已经在目标附近就别动：每过一遍就多一代 40 kbps 重编码，
    // 为了 0.2 dB 去糟蹋音质不划算。
    const st = SpeechStats(file);
    const gain = GainDb(st);
    if (Math.abs(gain) <= RMS_TOL) {
      console.log(`  · ${line.key.padEnd(16)} 已是 ${st.rmsDb.toFixed(1)} dB，跳过`);
      continue;
    }
    const tmp = file + ".norm.mp3";
    const r = spawnSync(FFMPEG, ["-y", "-v", "error", "-i", file, "-af", `volume=${gain.toFixed(2)}dB`,
      "-ac", "1", "-ar", "24000", "-b:a", "40k", tmp], { encoding: "utf8" });
    if (r.status !== 0) { console.warn(`  ✗ ${line.key} ${(r.stderr || "").slice(-120)}`); continue; }
    fs.renameSync(tmp, file);
    done += 1;
    console.log(`  ✓ ${line.key.padEnd(16)} ${st.rmsDb.toFixed(1)} → ${TARGET_RMS} dB`
      + `（${gain > 0 ? "+" : ""}${gain.toFixed(2)} dB）`);
  }
  console.log(`\n统一响度 ${done} / ${lines.length} 条`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 生成
// ---------------------------------------------------------------------------
let lines;
if (picks.length) lines = VOICE_LINES.filter((l) => picks.includes(l.key));
else if (args.includes("--missing")) lines = VOICE_LINES.filter((l) => !Has(l));
else if (args.includes("--all")) lines = VOICE_LINES.slice();
else { console.log("要指定 key，或 --missing / --all / --normalize"); process.exit(0); }
if (!force && !args.includes("--missing")) lines = lines.filter((l) => !Has(l) || picks.includes(l.key));

if (!lines.length) { console.log("没有要烘的行（加 --force 可以重烘）"); process.exit(0); }
console.log(`要烘 ${lines.length} 条 → ${path.relative(HERE, AUDIO_DIR)}`);
if (dry) {
  for (const l of lines) console.log(`  · ${l.key.padEnd(16)} ${l.role} ${l.sample ? "[实录]" : ""} ${l.text}`);
  process.exit(0);
}

const workspace = await (await fetch(`${GATEWAY}/api/workspace`)).json();
fs.mkdirSync(AUDIO_DIR, { recursive: true });

const durations = new Map();
let ok = 0;
for (const line of lines) {
  const dst = path.join(AUDIO_DIR, line.file);

  // --- 实录行：从免版税素材库下载，不走 TTS ---------------------------------
  if (line.sample) {
    const url = ArchiveUrl(line.sample.item, line.sample.path);
    const raw = path.join(AUDIO_DIR, `_${line.key}.src`);
    // archive.org 偶尔对单个文件回 500，隔几秒再要就好了 —— 重试三次再认输
    let got = false;
    for (let t = 0; t < 3 && !got; t += 1) {
      try {
        execFileSync("curl", ["-sS", "-L", "--fail", "--retry", "2", "--retry-delay", "3",
          "--max-time", "180", "-A", UA, "-o", raw, url], { stdio: ["ignore", "ignore", "inherit"] });
        got = fs.existsSync(raw) && fs.statSync(raw).size > 2048;
      } catch { got = false; }
    }
    if (!got) { console.warn(`  ✗ ${line.key} 下载失败 ${url}`); continue; }
    const enc = Encode(raw, dst, { maxDur: line.sample.maxDur || 2.4 });
    fs.rmSync(raw, { force: true });
    if (enc.error) { console.warn(`  ✗ ${line.key} ffmpeg：${enc.error}`); continue; }
    // 实录素材没有「再摇一条」这回事（就这一条录音），底噪高只能降 —— 这里是
    // 降噪唯一合理的场合：录音棚的房间声是常态噪声，afftdn 的模型正对得上。
    if (enc.floor > FLOOR_MAX) {
      const dn = Denoise(dst);
      if (dn.applied) console.log(`    ~ ${line.key} 实录带房间声，轻降一次 ${enc.floor} → ${dn.floor}dB`);
      enc.floor = Math.round(dn.floor * 10) / 10;
      enc.dur = Math.round(Duration(dst) * 100) / 100;
    }
    durations.set(line.key, enc.dur);
    ok += 1;
    console.log(`  ✓ ${line.key.padEnd(16)} 实录  ${enc.dur.toFixed(2)}s  底噪 ${enc.floor}dB`
      + `  ${line.sample.credit}`);
    continue;
  }

  // --- TTS 行：底噪不过关就重试（seedaudio 偶尔自带一层环境音）--------------
  const preset = ROLE_DEFAULT[line.role] || ROLE_DEFAULT.普通兵;
  const pitch = line.pitch ?? preset.pitch;
  const speed = line.speed ?? preset.speed;
  const body = {
    backend: "seedaudio", prompt: line.text, filename: `tzvoice_${line.key}`,
    params: { speed: String(speed), volume: "1", pitch: String(pitch), sample_rate: "32000" },
  };
  let best = null;
  const keep = dst + ".best.mp3";
  // --clean：先把现有文件收进候选，新 take 干不过它就原样留着
  if (cleanOnly && fs.existsSync(dst)) {
    fs.copyFileSync(dst, keep);
    best = { dur: Math.round(Duration(dst) * 100) / 100, raw: 0, tempo: 1,
      floor: Math.round(NoiseFloor(dst) * 10) / 10, kept: true };
  }
  for (let attempt = 1; attempt <= (reuse ? 1 : TRIES); attempt += 1) {
    let src;
    if (reuse) {
      src = WorkspaceTake(workspace.dir, line.key);
      if (!src) { console.warn(`  ✗ ${line.key} — 工作区里没有上一次生成的 wav`); break; }
    } else {
      const res = await fetch(`${GATEWAY}/api/generate/speech`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const out = await res.json();
      if (!out.ok) { console.warn(`  ✗ ${line.key} — ${out.user_message || out.error}`); break; }
      src = path.join(workspace.dir, out.path);
    }
    const enc = Encode(src, dst);
    if (enc.error) { console.warn(`  ✗ ${line.key} ffmpeg：${enc.error}`); break; }
    // **留最干净那一条**：不留的话盘上是最后一次的结果，而日志报的是最好的一次，
    // 两者对不上 —— 这种「日志说没事、听起来有事」的偏差最难查。
    if (!best || enc.floor < best.floor) {
      best = enc;
      fs.copyFileSync(dst, keep);
    } else if (best.kept) {
      console.log(`    ↩ ${line.key} 新 take 底噪 ${enc.floor}dB，不如原来的 ${best.floor}dB`);
    }
    if (enc.floor <= FLOOR_MAX) break;
    if (attempt < TRIES && !reuse) {
      console.log(`    ↻ ${line.key} 第 ${attempt} 次底噪 ${enc.floor}dB（要 ≤ ${FLOOR_MAX}），重生成`);
    }
  }
  if (!best) { fs.rmSync(keep, { force: true }); continue; }
  fs.copyFileSync(keep, dst);
  fs.rmSync(keep, { force: true });
  if (best.floor > FLOOR_MAX) {
    const dn = Denoise(dst);
    if (dn.applied) { console.log(`    ~ ${line.key} 重试仍有底噪，轻降一次 ${best.floor} → ${dn.floor}dB`); }
    best = { ...best, floor: Math.round(dn.floor * 10) / 10, dur: Math.round(Duration(dst) * 100) / 100 };
  }
  durations.set(line.key, best.dur);
  ok += 1;
  console.log(`  ✓ ${line.key.padEnd(16)} ${String(line.role).padEnd(4)} pitch ${String(pitch).padStart(2)}`
    + ` speed ${speed}  ${best.dur.toFixed(2)}s  底噪 ${best.floor}dB`
    + (best.tempo > 1 ? `（原 ${best.raw.toFixed(2)}s，atempo ${best.tempo.toFixed(2)}）` : "")
    + `  ${line.text}`);
}

// 把实测时长写回 Data_Voice.mjs：只动 dur 那一列，其余一个字符不碰。
if (durations.size) {
  let table = fs.readFileSync(VOICE_TABLE, "utf8");
  for (const [key, dur] of durations) {
    const re = new RegExp(`(key: "${key}",[\\s\\S]{0,320}?dur: )([0-9.]+)`);
    if (!re.test(table)) { console.warn(`  ! ${key} 的 dur 没找到，没写回`); continue; }
    table = table.replace(re, (m, head) => head + dur.toFixed(2));
  }
  fs.writeFileSync(VOICE_TABLE, table);
}
console.log(`\n烘好 ${ok} / ${lines.length} 条，时长已写回 Data_Voice.mjs`);
process.exit(ok === lines.length ? 0 : 1);
