// 战场口令的配音烘焙：Data_Voice 的文本 → 本机 MiniMax Hub → Audio/vo_*.mp3。
//
//   node Taierzhuang1938/Script_VoiceBake.mjs --missing        # 只烘没有音频的
//   node Taierzhuang1938/Script_VoiceBake.mjs spot_tank ...    # 指定 key
//   node Taierzhuang1938/Script_VoiceBake.mjs --all --force    # 全部重烘
//   node Taierzhuang1938/Script_VoiceBake.mjs --dry            # 只打要烘哪些，不花钱
//   ... --from-workspace                                       # 用上次生成的 wav 重转码
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

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { VOICE_LINES } from "./Data_Voice.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GATEWAY = process.env.MINIMAX_GATEWAY || "http://127.0.0.1:8001";
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const AUDIO_DIR = path.join(HERE, "Audio");
const VOICE_TABLE = path.join(HERE, "Data_Voice.mjs");

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
const picks = args.filter((a) => !a.startsWith("--"));
const Has = (line) => fs.existsSync(path.join(AUDIO_DIR, line.file));

let lines;
if (picks.length) lines = VOICE_LINES.filter((l) => picks.includes(l.key));
else if (args.includes("--missing")) lines = VOICE_LINES.filter((l) => !Has(l));
else if (args.includes("--all")) lines = VOICE_LINES.slice();
else { console.log("要指定 key，或 --missing / --all"); process.exit(0); }
if (!force && !args.includes("--missing")) lines = lines.filter((l) => !Has(l) || picks.includes(l.key));

if (!lines.length) { console.log("没有要烘的行（加 --force 可以重烘）"); process.exit(0); }
console.log(`要烘 ${lines.length} 条 → ${path.relative(HERE, AUDIO_DIR)}`);
if (dry) {
  for (const l of lines) console.log(`  · ${l.key.padEnd(16)} ${l.role} ${l.text}`);
  process.exit(0);
}

const workspace = await (await fetch(`${GATEWAY}/api/workspace`)).json();
fs.mkdirSync(AUDIO_DIR, { recursive: true });

const Ffprobe = () => FFMPEG.replace(/ffmpeg(\.exe)?$/i, (m) => m.replace("ffmpeg", "ffprobe"));
const Duration = (file) => {
  const p = spawnSync(Ffprobe(), ["-v", "error", "-show_entries", "format=duration",
    "-of", "csv=p=0", file], { encoding: "utf8" });
  return parseFloat(p.stdout || "0") || 0;
};

/**
 * 转码成 40 kbps 单声道，顺手做两件**必须做**的事：
 *
 *   1. **削掉首尾静音**。模型给的 wav 前后各挂着一小截空白，直接编码进去，
 *      战场上就是「喊之前先愣一下」。
 *   2. **超长就 atempo 压回来**。seedaudio 念得慢：七个字能念到 3.3 秒，
 *      而喊话超过 2.5 秒在战场上根本读不完（Script_VoiceTest 的闸门是 2.6 s）。
 *      **不能靠把 speed 参数提上去解决** —— 实测 1.35 以上模型频繁只吐半句，
 *      要提速就走后期 atempo（它变速不变调，嗓子不会变成花栗鼠）。
 *      压缩比封在 1.6：再快就不像喊话像快进了，那种情况该改短句子。
 */
function Encode(src, dst, maxDur = 2.35) {
  const trimmed = dst + ".trim.wav";
  const trim = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02"
    + ",areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02,areverse";
  let r = spawnSync(FFMPEG, ["-y", "-v", "error", "-i", src, "-af", trim, trimmed], { encoding: "utf8" });
  if (r.status !== 0) return { error: (r.stderr || "").slice(-160) };
  const raw = Duration(trimmed);
  const tempo = raw > maxDur ? Math.min(1.6, raw / maxDur) : 1;
  const filters = tempo > 1 ? ["-af", `atempo=${tempo.toFixed(3)}`] : [];
  r = spawnSync(FFMPEG, ["-y", "-v", "error", "-i", trimmed, ...filters,
    "-ac", "1", "-ar", "24000", "-b:a", "40k", dst], { encoding: "utf8" });
  fs.rmSync(trimmed, { force: true });
  if (r.status !== 0) return { error: (r.stderr || "").slice(-160) };
  return { dur: Math.round(Duration(dst) * 100) / 100, raw: Math.round(raw * 100) / 100, tempo };
}

/** --from-workspace：拿上一次生成留在工作区的 wav 重新转码，不再花积分。 */
function WorkspaceTake(key) {
  const files = fs.readdirSync(workspace.dir)
    .filter((f) => f.startsWith(`tzvoice_${key}`) && /\.(wav|mp3)$/i.test(f))
    .map((f) => ({ f, t: fs.statSync(path.join(workspace.dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  return files.length ? path.join(workspace.dir, files[0].f) : null;
}

const durations = new Map();
let ok = 0;
for (const line of lines) {
  const preset = ROLE_DEFAULT[line.role] || ROLE_DEFAULT.普通兵;
  const pitch = line.pitch ?? preset.pitch;
  const speed = line.speed ?? preset.speed;
  const body = {
    backend: "seedaudio",
    prompt: line.text,
    filename: `tzvoice_${line.key}`,
    params: {
      speed: String(speed), volume: "1",
      pitch: String(pitch), sample_rate: "32000",
    },
  };
  let src;
  if (reuse) {
    src = WorkspaceTake(line.key);
    if (!src) { console.warn(`  ✗ ${line.key} — 工作区里没有上一次生成的 wav`); continue; }
  } else {
    const res = await fetch(`${GATEWAY}/api/generate/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const out = await res.json();
    if (!out.ok) { console.warn(`  ✗ ${line.key} — ${out.user_message || out.error}`); continue; }
    src = path.join(workspace.dir, out.path);
  }
  const dst = path.join(AUDIO_DIR, line.file);
  const enc = Encode(src, dst);
  if (enc.error) { console.warn(`  ✗ ${line.key} ffmpeg：${enc.error}`); continue; }
  // 时长以**转码后的成品**为准，不用网关报的 duration —— 两者能差几十毫秒，
  // 而 Data_Voice 的 dur 是给 Script_VoiceTest 的 0.3—2.6 s 闸门用的。
  durations.set(line.key, enc.dur);
  ok += 1;
  console.log(`  ✓ ${line.key.padEnd(16)} ${String(line.role).padEnd(4)} pitch ${String(pitch).padStart(2)}`
    + ` speed ${speed}  ${enc.dur.toFixed(2)}s`
    + (enc.tempo > 1 ? `（原 ${enc.raw.toFixed(2)}s，atempo ${enc.tempo.toFixed(2)}）` : "")
    + `  ${line.text}`);
}

// 把实测时长写回 Data_Voice.mjs：只动 dur 那一列，其余一个字符不碰。
if (durations.size) {
  let table = fs.readFileSync(VOICE_TABLE, "utf8");
  for (const [key, dur] of durations) {
    const re = new RegExp(`(key: "${key}",[\\s\\S]{0,220}?dur: )([0-9.]+)`);
    if (!re.test(table)) { console.warn(`  ! ${key} 的 dur 没找到，没写回`); continue; }
    table = table.replace(re, (m, head) => head + dur.toFixed(2));
  }
  fs.writeFileSync(VOICE_TABLE, table);
}
console.log(`\n烘好 ${ok} / ${lines.length} 条，时长已写回 Data_Voice.mjs`);
process.exit(ok === lines.length ? 0 : 1);
