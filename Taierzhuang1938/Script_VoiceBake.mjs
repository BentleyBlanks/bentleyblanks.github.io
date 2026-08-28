// 战场口令的配音烘焙：Data_Voice 的文本 → 火山引擎 SeedAudio 1.0 → Audio/*.mp3。
//
//   node Taierzhuang1938/Script_VoiceBake.mjs --missing        # 只烘没有音频的
//   node Taierzhuang1938/Script_VoiceBake.mjs spot_tank ...    # 指定 key
//   node Taierzhuang1938/Script_VoiceBake.mjs --all --force    # 全部重烘
//   node Taierzhuang1938/Script_VoiceBake.mjs --dry            # 只打要烘哪些，不花钱
//   ... --from-workspace                                       # 用系统临时目录里的上次原始音频重转码
//   node Taierzhuang1938/Script_VoiceBake.mjs --normalize      # 只统一响度，不重新生成
//   node Taierzhuang1938/Script_VoiceBake.mjs --clean <key>…   # 只为降底噪重摇，不如旧的就留旧的
//   ... --motivation-level=1|2|3                         # 连续动员强度；默认 3（最终定稿）
//   node Taierzhuang1938/Script_VoiceBake.mjs --story           # 七章剧情台词（kind:"story"）
//   node Taierzhuang1938/Script_VoiceBake.mjs --chapter=3       # 只烘第三关那一章
//
// 烘完把实测时长写回**行本体所在的文件**（战场口令在 Data_Voice.mjs，
// 章节台词在 Data_MissionChX.mjs）的 dur 字段；战斗 Bark 断言 0.3—2.6 s，
// 剧情台词按字数给上限（StoryMaxDur）。
//
// 旧序章那一档（`line.prologue` / `--prologue` / PROLOGUE_ROLE_PROMPTS）2026-08-29
// 随 11 条 `prologue_*` 行一起删了：新序章的车厢对白是 `kind:"story"` 的章节台词
// （Data_MissionCh0），走的是下面那条剧情分支。Data_Voice 里 `prologue` 为真的行
// 现在是 0 条，留着那三处只会让下一个人以为还有一条独立通道。
//
// ## 章节剧情台词（2026-08-28 任务流程重制）
// 与战场口令是两类活，后期参数也分开（见 CAST_VOICE_PROMPTS / EncodeOptionsFor）：
// 口令「谁喊都行、3—12 字、压到 2.35 s、齐平到 −16.1 dBFS」；
// 剧情台词「只能是那个人、整句、按字数给时长、按交付档给音量」。
// 耳语与虚弱句**必须比常态轻**，拉齐了就没有耳语这回事（Data_Voice.VOICE_DELIVERY_MIX）。
//
// ## 为什么用 seedaudio 而不是 minimax_tts
// 整套声库是 seed-audio-1.0 出的。改几句就换引擎的话，同一个班里会有两种音质，
// 比句子本身不好听更出戏。**要改就整批换，不要混着来。**
//
// ## 方言、角色与语气都写进提示词
// 火山引擎这条 SeedAudio 1.0 接口固定用原速、原调、原响度；四川话、年龄、声线和
// 情绪都在 SeedAudioPrompt 里约束。单句过长只在后期用 atempo 收紧，不换调。
//
// ## 三道闸（都是用户听出来之后补的）
//   1. **响度统一**（有声段 RMS 拉到同一档）。这一批声音在游戏里的音量应该只由
//      距离与遮挡决定 —— 文件本身有响有闷的话，玩家会以为「那个人离得远」，
//      其实只是那一条烘得轻。**别拿 loudnorm 量**：EBU R128 的积分响度要 3 秒以上
//      才可靠，这批全是 0.8—2.5 秒的喊话，量出来的数字自相矛盾（归一化之后反而更散）。
//   2. **底噪闸**（≤ -48 dB）。SeedAudio 偶尔会自带一层环境音（风声/房间声），
//      同一句话重生成一次就没有了 —— 所以是「重试」而不是「降噪」：
//      降噪会把喊话的齿音一起削掉。实测「找掩护！躲到起！」那条底噪高到 -18.7 dB，
//      比人声只低 17 dB，听起来像在另一个场景里录的。
//   3. **有些句子根本不该走 TTS**。非语言的惨叫（「啊——！」）TTS 做不像，而且
//      模型的默认音色偏女声，pitch 压到 -6 也还是女的。这类行在 Data_Voice 里写
//      `sample: {...}`，改从免版税素材库取真人录音（与音效那一套同源，见
//      docs/Data_AudioAssets.md）。

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { VOICE_LINES, VOICE_DELIVERY_MIX, STORY_CAST_IDS } from "./Data_Voice.mjs";
import { ArchiveUrl } from "./Data_SfxSources.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VOLCENGINE_URL = "https://openspeech.bytedance.com/api/v3/tts/create";
const VOLCENGINE_MODEL = "seed-audio-1.0";
const VOLCENGINE_TIMEOUT_MS = 360_000;
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const AUDIO_DIR = path.join(HERE, "Audio");
const RAW_DIR = path.join(os.tmpdir(), "Taierzhuang1938SeedAudio");
const VOICE_TABLE = path.join(HERE, "Data_Voice.mjs");
const UA = "TaierzhuangVoiceBake/1.0 (https://bentleyblanks.github.io)";

// **不要用 loudnorm（EBU R128）量这批声音**：积分响度要 3 秒以上才可靠，
// 而这里全是 0.8—2.5 秒的喊话。实测拿 loudnorm 归一化之后反而更散
// （目标 -18 LUFS，量回来 -23.1 / -19.9 / -18.3 都有）。
// 改量**有声段 RMS**：把高于「峰值 -20 dB」的格挑出来求 RMS，短句上稳定得多。
const TARGET_RMS = -16.1;     // dBFS，取现有 31 条的中位数，改动面最小
const PEAK_CEIL = -1.0;       // dBFS，抬音量不许把峰顶撞上去
const RMS_TOL = 0.4;          // 差这么点就别动了，省一代重编码
const FLOOR_MAX = -48;        // 火山引擎 SeedAudio 1.0 的底噪上限（dB），超了就重试
// 比这还短的成品里已经没有静音可量了（首尾都削掉了），底噪改从原始 take 上量。
// 见 Encode 里那段注释：短句上量成品 = 量到最轻的人声帧，会把干净的一条误判成脏的。
const FLOOR_MIN_S = 1.2;
const TRIES = 3;

const args = process.argv.slice(2);
const force = args.includes("--force");
const dry = args.includes("--dry");
const reuse = args.includes("--from-workspace");   // 拿系统临时目录里的原始 MP3 重转码，不再发请求
const normalizeOnly = args.includes("--normalize");
// --clean：只为降底噪重摇 take，**新的不如旧的就留旧的**。
// 模型的底噪是每次生成随机的：不做这道比较，一次「清理」可能把好好的一条换成更脏的
// （实测 spot_gap 从 -43 dB 被换成 -32.7 dB）。文本改过的行别用这个模式 —— 旧文件念的是旧词。
const cleanOnly = args.includes("--clean");
const motivationLevelArg = args.find((a) => a.startsWith("--motivation-level="));
const motivationLevel = Math.max(1, Math.min(3, Number(motivationLevelArg?.split("=")[1] || 3)));
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
function FrameRms(file) {
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
  frames.sort((a, b) => a - b);
  return frames;
}

function NoiseFloor(file) {
  const frames = FrameRms(file);
  if (!frames.length) return 0;
  return 20 * Math.log10(frames[Math.floor(frames.length * 0.08)] + 1e-9);
}

/**
 * 原始 take 的底噪。与 NoiseFloor 只差一件事：**先把数字静音扔掉**。
 *
 * 模型交回来的原始音频常常是「两头绝对零 + 中间垫一层 −60 dB 的房间声」。
 * 直接取第 8 百分位会落进那堆绝对零里，量出 −103 dB 的假干净，
 * 而真正会混进战场里被听见的正是那层 −60 dB。要的是**最轻的真实信号**。
 */
function NoiseFloorRaw(file) {
  const frames = FrameRms(file).filter((v) => v > 1e-5);   // −100 dB 以下当作数字静音
  if (frames.length < 3) return -99;                       // 真就是干净的
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

/**
 * 要加多少 dB 才落到目标 RMS；抬不动就以峰值天花板为准（宁可轻一点也不削顶）。
 * target 分档给：耳语与虚弱句**必须比常态轻**，拉齐了就没有耳语这回事了
 *（见 Data_Voice.VOICE_DELIVERY_MIX 的头注）。
 */
function GainDb(stats, target = TARGET_RMS) {
  return Math.min(target - stats.rmsDb, PEAK_CEIL - stats.peakDb);
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
function Encode(src, dst, { maxDur = 2.35, maxTempo = 1.6, preFilter = "",
  targetRms = TARGET_RMS, trimDb = -45 } = {}) {
  const stage = dst + ".stage.wav";
  // 削静音的阈值也要分档：−45 dB 是按「站着喊」定的，拿它去削耳语会把
  // 前半句气声当静音切掉（症状是「他好像从第二个字才开始说」）。
  const trim = `silenceremove=start_periods=1:start_threshold=${trimDb}dB:start_silence=0.02`
    + `,areverse,silenceremove=start_periods=1:start_threshold=${trimDb}dB:start_silence=0.02,areverse`;
  let r = spawnSync(FFMPEG, ["-y", "-v", "error", "-i", src, "-af", preFilter ? `${trim},${preFilter}` : trim, stage], { encoding: "utf8" });
  if (r.status !== 0) return { error: (r.stderr || "").slice(-160) };
  const raw = Duration(stage);
  const tempo = raw > maxDur ? Math.min(maxTempo, raw / maxDur) : 1;
  if (tempo > 1) {
    const fast = dst + ".fast.wav";
    r = spawnSync(FFMPEG, ["-y", "-v", "error", "-i", stage, "-af", `atempo=${tempo.toFixed(3)}`, fast],
      { encoding: "utf8" });
    fs.rmSync(stage, { force: true });
    if (r.status !== 0) return { error: (r.stderr || "").slice(-160) };
    fs.renameSync(fast, stage);
  }
  // --- 响度：**量成品，不量中间产物** ------------------------------------
  // 【2026-08-28 短句复查】原来只量 stage.wav 就一次性写死增益，成品从不回看。
  // 实测「晓得。」（0.60 s）目标 −16.1 dBFS，出来是 −13.4 —— 高了 2.7 dB。
  // 病根不是 mp3：**有声段 RMS 在短句上本来就不稳**，20 ms 的帧格与句子起点
  // 对不齐时，30 个帧里换掉一两个就是好几分贝（loudnorm 在短句上不准是同一个道理，
  // 这一版只是把同一个坑换了个量法重踩）。
  // 修法不是换更复杂的算法，是**闭环**：按成品的实测值补差、从同一份 stage 重编，
  // 所以永远只有一代 mp3，不叠代。
  const stageStats = SpeechStats(stage);
  let gain = GainDb(stageStats, targetRms);
  let out = null;
  for (let pass = 0; pass < 3; pass += 1) {
    r = spawnSync(FFMPEG, ["-y", "-v", "error", "-i", stage, "-af", `volume=${gain.toFixed(2)}dB`,
      "-ac", "1", "-ar", "24000", "-b:a", "40k", dst], { encoding: "utf8" });
    if (r.status !== 0) { fs.rmSync(stage, { force: true }); return { error: (r.stderr || "").slice(-160) }; }
    out = SpeechStats(dst);
    const err = targetRms - out.rmsDb;
    if (Math.abs(err) <= RMS_TOL) break;
    const next = Math.min(gain + err, PEAK_CEIL - stageStats.peakDb);
    if (Math.abs(next - gain) < 0.05) break;       // 顶到峰值天花板了，再补也补不动
    gain = next;
  }
  const dur = Math.round(Duration(dst) * 100) / 100;
  // --- 底噪：短句要量**原始 take**，不能量削完静音的成品 ------------------
  // 削掉首尾静音之后，一句 0.6 s 的短话里一格静音都不剩，第 8 百分位量到的
  // 是最轻的那个人声帧（实测 −32 dB），于是干干净净的一条被判成「有房间声」，
  // 白重摇两次还差点被 afftdn 削掉齿音。原始 take 里那段真静音才是底噪所在，
  // 按施加的增益折算回成品的电平即可。
  const floorRaw = dur < FLOOR_MIN_S ? NoiseFloorRaw(src) + gain : NoiseFloor(dst);
  fs.rmSync(stage, { force: true });
  return {
    dur, raw: Math.round(raw * 100) / 100, tempo,
    rms: Math.round((out ? out.rmsDb : 0) * 10) / 10,
    floor: Math.round(Math.max(floorRaw, -99) * 10) / 10,
    floorFromRaw: dur < FLOOR_MIN_S,
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

/**
 * 剧情台词的时长上限：**按字数给预算，不给一个死数**。
 *
 * 战场口令那条 2.35 s 的红线是「喊出来的话超过 2.5 秒在战场上读不完」定的，
 * 对整句对白完全不适用：一句「他们连这个也打？」被压到 2.35 s 就是快进。
 * 中文正常语速约每秒 4 字，seedaudio 念得偏郑重，按 3.2 字/秒 给预算再加一点
 * 起落的余量 —— 也就是说 **atempo 只在模型明显拖沓时才介入**，正常句一次都不压。
 */
function StoryMaxDur(text) {
  const chars = String(text || "").replace(/[\s，。！？、…—「」“”"'’,.!?~-]/g, "").length;
  return Math.min(14, Math.max(2.6, chars / 3.2 + 0.9));
}

/** 这一行该用哪套后期参数。序章两档保持原样，剧情台词按交付档分。 */
function EncodeOptionsFor(line) {
  if (line.kind === "story") {
    const mix = VOICE_DELIVERY_MIX[line.delivery] || VOICE_DELIVERY_MIX.normal;
    const soft = line.delivery === "whisper" || line.delivery === "weak";
    return {
      maxDur: StoryMaxDur(line.text),
      maxTempo: mix.tempo,
      targetRms: mix.rms,
      trimDb: soft ? -55 : -45,
    };
  }
  if (line.promptMode === "continuousScene") return { maxDur: 22.0, maxTempo: 1.25 };
  return undefined;
}

/** --from-workspace：拿上一次火山引擎响应里解出的原始 MP3 重转码，不再发请求。 */
function WorkspaceTake(key) {
  const file = path.join(RAW_DIR, `AudioRaw_${key}.mp3`);
  return fs.existsSync(file) ? file : null;
}

// ---------------------------------------------------------------------------
// 章节剧情台词的音色表（docs/Data_MissionRemake.md §8 人物速查 → 提示词）
//
// SeedAudio 这条接口**没有音色 id、没有情绪参数**：pitch/speech/loudness 三个 rate
// 全固定为 0，音色、年龄、方言、情绪一律靠提示词的描述词约束（见文件头）。
// 所以这张表就是「演员表」：一个人一条，key 是 CAST id（beats 的 who）。
//
// 写法上守三条（前一批序章五个匿名音色踩出来的）：
//   1. **先给年龄与声区，再给性格**。模型对「二十出头 / 四十岁 / 男中低音」这类
//      硬描述最听话；「木讷」「油滑」这种性格词是往上加的味道，单独给它会漂。
//   2. **写「不要什么」和写「要什么」一样重要**。四川话最容易翻车成两种：
//      普通话腔 + 几个方言词，或者小品式的夸张川普。两条都要点名否掉。
//   3. **不写标点式的情绪指令**（「愤怒地！！」），改写生理状态
//      （气息短、喉咙发紧、胸腔发不出力）—— 模型对状态的还原比对形容词稳。
//
// 交付档（delivery）在 DELIVERY_PROMPTS 里另给一层，与音色正交：
// 同一个顺子要能压着嗓子说、也要能在最后一条街上吼。
// ---------------------------------------------------------------------------
const CAST_VOICE_PROMPTS = {
  shunzi: "顺子，二十出头的四川男兵，被抓壮丁来的，不是自愿从军。嗓音年轻、偏干、不亮，"
    + "有一点被生活磨过的粗粒感。说话短，警惕，习惯先看人脸色再开口，本能地不把话说满；"
    + "平时是木讷的、压着的，不油滑也不讨好。**不要**少爷腔、不要播音腔、不要故作沧桑。",
  luo: "罗班长，三十五到四十岁的四川老兵班长，带兵多年。男中低音，嗓子被烟和喊哑过，"
    + "粗、糙、有胸腔底子；命令短促、不容置疑，骂人是日常语气不是表演。"
    + "疲惫压在底下，但话一出口仍然把人按得住。**不要**电视剧式的怒吼，不要拖长音。",
  yaowa: "幺娃，十六七岁的四川少年兵。已经变声但还很年轻的男声，偏亮、偏细，气息浅；"
    + "情绪藏不住——新鲜、害怕、愤怒都直接挂在声音上，学老兵骂人时有一点用力过猛的生涩。"
    + "**不要**处理成儿童声或女声，也不要成年男性的厚重。",
  heyoutian: "何有田，三十上下的四川男兵，全班最爱吹牛说笑的那个。嗓门大、位置靠前、"
    + "尾音爱上扬，说话带笑意和一点油滑的江湖气，习惯用玩笑把场面撑起来。"
    + "**不要**做成滑稽小品腔：他是真在跟弟兄扯淡，不是在逗观众笑。",
  liuwencai: "刘文财，二十五到三十岁的四川男兵，什么都要数一遍、什么都怕吃亏。"
    + "嗓子偏紧、位置偏高，语速快，咬字碎，像在心里同时算着账；语气里常有被人占了便宜的不满。"
    + "**不要**尖利做作，不要娘娘腔——他是精明，不是滑稽。",
  xiaoqin: "小秦，二十出头的四川通信兵。声音清亮、干净、咬字清楚，天生适合在电话和噪音里"
    + "把话送出去；语速偏快，报话时一板一眼，急起来会往上飘一点但从不含糊。"
    + "**不要**播音员的圆润，他是个在墙角护电话线的年轻兵。",
  zhaodegui: "赵德贵，四十岁上下的四川老兵，老成持重。男中低音，胸腔厚，语速慢，"
    + "话不多但落地；管弹药纪律时是压着说的，不吼；接年轻人想家的话头时带一点长辈的钝。"
    + "**不要**苍老到发抖，他还在能扛枪的年纪。",
  paizhang: "负伤排长，三十多岁的四川基层军官，腹背带伤仍在指挥。中低音，底子是有威信的，"
    + "但气息明显不够用：一句话中间要换气，句尾往下掉，偶尔带一点忍痛的气音。"
    + "命令本身仍然清楚、干脆、不含糊。**不要**做成濒死的呻吟，他还站着。",
  junyi: "军医（兼卫生兵），三十多岁的四川男性，连续几昼夜没合眼。语速快、句子短、"
    + "永远是一边动手一边说话的口吻，注意力不在对方脸上；疲惫到情绪已经磨平，"
    + "说「没得脉了」时不带感情色彩，那是他今天第几十次说这句话。**不要**温柔安慰的腔调。",
  s124: "第124师的伤兵，二十五到三十岁的四川男兵，建制被打散、自己也挂了彩。"
    + "嗓音正常男中音但气力不足，语速慢半拍，带着说不清自己团还在不在的茫然；"
    + "谈起打机枪时会短暂地清醒起来。**不要**做成外省口音，124 师同属川军。",
  danjiayuan: "担架员，二十多岁的四川男兵，正在出力抬人。说话夹在喘气里，句子被呼吸切断，"
    + "音量不小但托不住，尾音总被下一口气顶掉；一心在脚下的路，不在对话上。"
    + "**不要**平稳录音棚式的念白——听不出他在使劲就全错了。",
  shangbing: "伤员，二十到三十岁的四川男兵，重伤躺在担架上。声音轻、位置靠后、气息断续，"
    + "疼痛压着每一个字，说话是从牙缝里挤出来的；他在忍，不在喊。"
    + "**不要**做成惨叫或哭嚎（那类走实录素材，不走这条管线）。",
  junguan: "兵站军官，三十五岁上下的四川男性军官，隔着车门和货堆发命令。"
    + "中低音有穿透力，急而清楚，习惯一句话把事说完；训人时是压着火的，不是失控的。"
    + "**不要**表演式的咆哮。",
  canmou: "通信参谋，四十岁上下的四川男性军官。声音沉稳、咬字清楚、节奏均匀，"
    + "复诵电文时是职业化的、逐字确认的口吻，情绪收在里面不外露；"
    + "在炮声里也保持这份稳。**不要**悲壮的朗诵腔。",
  wangmingzhang: "王铭章，四十五到五十岁的四川男性将领，师长。沉毅、克制、话少，"
    + "男中低音，语速不快，每句话都像已经想清楚了才说；"
    + "问战况时是冷静的追问，不是激昂的动员。**不要**慷慨陈词、不要哽咽、不要拔高。",
  ija_gunso: "日本陆军军曹，三十岁上下的成年日本男性。声音硬、方正、带操典训练出来的"
    + "断句节奏，命令短促，情绪压在纪律下面；逼问俘虏时是冷的，不是狂躁的。"
    + "**不要**抗日神剧式的夸张咆哮或滑稽腔。",
};

/**
 * 交付档：与音色正交的那一层「他现在是怎么说话的」。
 *
 * 数值那一半（RMS 目标、atempo 上限）在 Data_Voice.VOICE_DELIVERY_MIX，
 * 这里只写给模型看的话。两边共读一张表见 EncodeOptionsFor。
 */
const DELIVERY_PROMPTS = {
  normal: "常态对话音量，近距离说给身边的人听。语气可信、不舞台化。",
  shout: "战场上的急喊：胸腔发力、气息短促、咬字仍要清楚。是在枪炮声里把话送出去，"
    + "不是抒情，也不是拖长的怒吼。",
  whisper: "**压低到耳语**：贴着对方耳朵说，几乎全是气声，声带只带一点点，音量很小。"
    + "紧张、克制、随时会被听见的那种小声。绝对不许喊，也不许用「压低声音地大声说」"
    + "那种舞台耳语——真的要轻。",
  weak: "负伤脱力：气息不够，一句话中间要换气，句尾往下掉，音量比常态低。"
    + "人还清醒，话还说得完整，只是托不住。不是呻吟，也不是临终气音。",
};

/**
 * 章节剧情台词的提示词：音色（谁）× 交付档（怎么说）× 台词原文。
 *
 * 与战场口令那条通用分支的差别不只是多了一层描述：
 *   · 口令是「谁喊都行」，剧情台词是「只能是他」——音色必须逐人固定，
 *     否则第三关的顺子和第五关的顺子会是两个人（玩家一定听得出来）。
 *   · 口令是 3—12 字的喊话，剧情台词有整句、有半句、有带省略号的迟疑，
 *     所以要显式交代「按原文的标点停顿，不要补语气词、不要改写」。
 *     SeedAudio 会自作主张地把「按稳。」念成「按稳一点。」——改词就穿帮了。
 */
function StoryPrompt(line) {
  const cast = CAST_VOICE_PROMPTS[line.who]
    || "四川男性军人，嗓音自然、克制，符合1938年连续作战后的疲惫状态。";
  const delivery = DELIVERY_PROMPTS[line.delivery] || DELIVERY_PROMPTS.normal;
  if (line.who === "ija_gunso" || line.side === "ija") {
    return [
      "生成一条单句、干净、孤立的1938年日本陆军男性对白配音。严格使用台词本身的日语假名，不要改词，也不要读成中文。",
      `角色：${cast}`,
      delivery,
      "不要音乐、不要旁白、不要环境声、不要音效、不要念角色名；开口前后只留极短静音。",
      `只说这一句原文：“${line.text}”`,
    ].join("\n");
  }
  return [
    "生成一条单句、干净、孤立的中文男性对白配音，1938年山东滕县战场。",
    "使用自然四川话口音（川渝腔），不能说成普通话腔，也不要夸张模仿、不要喜剧化的川普。",
    `角色：${cast}`,
    delivery,
    "严格按原文的字与标点说，不要增删字、不要补语气词、不要改写成更通顺的说法；"
      + "省略号按迟疑处理，感叹号按情绪强度处理，不要机械加重。",
    "不要音乐、不要旁白、不要环境声、不要音效、不要念角色名或括号说明；开口前后只留极短静音。",
    `只说这一句原文：“${line.text}”`,
  ].join("\n");
}

function SeedAudioPrompt(line) {
  if (line.kind === "story") return StoryPrompt(line);
  if (line.promptMode === "continuousScene") {
    const profiles = {
      1: [
        "强度一级：有血性、可信的战前动员。班长比上一版再强一层，嗓门洪亮、有威压，不能只是沉稳说话。车厢里有十二名左右成年川军男兵回应，不是四个人，也绝不是单人代读。",
        "所有士兵回答都必须听成许多不同男性声线真正叠在一起的齐声。“我们晓得”坚定整齐，“打日本”明显抬高并齐喊；“不怕”必须短、齐、响亮、有冲击力；“我们要保护我们的国家”全员以宣誓般的饱满声音喊出。",
      ],
      2: [
        "强度二级：高燃的临战动员。班长粗砺洪亮、步步紧逼，像要在几十秒内把全排的血性全部逼出来，每次发问都比上一次更有力。车厢里有十八名左右成年川军男兵回应，必须是能听见多人叠层的真正群体齐声。",
        "群体回答要像一堵声音迎面砸来。“我们晓得”已经有力，“打日本”全员同时高喊；“不怕”要突然爆发、异口同声、响彻车厢，绝不低沉、绝不压嗓；“我们要保护我们的国家”用更大的胸腔力量齐喊，成为全段最高峰。",
      ],
      3: [
        "强度三级：打鸡血般的最高强度战前宣誓。班长从第一句就声如洪钟，越问越狠，最后近乎战吼，但仍要咬字清楚、像真实老兵而不是播音员。车厢里严格只有十到十二名十七八岁的川军男兵回应；每个人都必须是已经变声完成、声音年轻明亮但有男性力量的少年兵，不能混入三四十岁的厚重成年男声，也不能像儿童或女声。听感必须是一个近距离年轻小队，绝不能像几十人、上百人或群众集会。",
        "把这十来名年轻士兵的气势推到极限，但绝不能像排练好的合唱：“我们晓得。打日本！”、“不怕！”和“我们要保护我们的国家！”三次回答都由两三名情绪最冲的年轻士兵先开口，其余人在约八十到二百五十毫秒内自然跟上。整体仍是一群人同时回应，不能拆成一人一句，也不能拖成回声。“不怕！”必须是全段最突然、最炸裂的一声。要听见十到十二个不同的十七八岁男性声线、不同气口、轻微抢拍和参差尾音，像临上战场时被班长真正激起来，而不是录音棚里按节拍演戏。冲击力来自年轻人的满腔热血，不靠增加人数、远处附和、百人大合唱感、广场回响或夸张长混响。不要低沉含糊，不要克制，不要单人代读；可以疯狂高燃，但不能削波失真。",
      ],
    };
    const motivationText = [
      "班长（洪亮有威压，逐句升温）：这次你们去啊。出川，晓不晓得啊？",
      "众人（十到十二名十七八岁男兵前后自然错开一点，斗志昂扬）：我们晓得。打日本！",
      "班长（短促有力，把生死砸到众人面前）：去死，怕不怕？",
      "众人（两三名年轻士兵先爆出声，其余人在下一瞬间压上，短促大喊）：不怕！",
      "班长（继续逼问，气势再抬一层）：为啥子不怕？",
      "众人（十到十二名十七八岁男兵带轻微抢拍和自然重叠，满腔热血地高喊）：我们要保护我们的国家！",
      "班长（被弟兄们的回答打动，哽咽一瞬但气势不泄）：好样的。",
      "班长（立刻收住哽咽，用洪亮坚决的出发命令收尾）：都把东西带好。前头就是滕县。",
    ].join("\n");
    return [
      "生成一条完整、连续、不可拆分的22秒中文对白音频。1938年3月，一列停下来的军用车厢内，一名川军班长面对身边十到十二名十七八岁的年轻男兵，用自然四川话完成出发上战场前的动员问答。",
      "只输出干净对白：不要音乐、不要旁白、不要念角色名或括号说明、不要额外台词，也不要添加火车声、炮声、脚步或其他环境音。",
      "班长固定为三十五岁左右四川男性，粗砺厚实、胸腔共鸣强的洪亮男中音，疲惫但有压住整节车厢的威信。全段必须是同一空间里的真实出发动员，不是朗诵、播音或演员式喊口号。",
      ...profiles[motivationLevel],
      "回答者必须始终是同一群十到十二名十七八岁的年轻四川男兵，人数感、年轻男性声线、距离与空间连续一致。群体起声允许约八十到二百五十毫秒的自然先后、轻微抢话、不同气口和参差尾音，让人听出是真人在临场回应；不能采样级完全对齐，也不能把同一条单人录音机械复制叠加。严禁把回答拆成轮流喊或拖成长回声，严禁把群体台词做成一个人低声回答，严禁低沉含糊，严禁中年厚重男声、女声或儿童声。",
      "严格按下列顺序和原文说完，并让最后一句在22秒内自然收住：",
      motivationText,
    ].join("\n");
  }
  if (line.side === "ija") {
    const delivery = line.delivery === "assault"
      ? "这是正面突击、贴脸交火中的口令：声音必须有胸腔爆发和压上去的狠劲，气息短、急、强，像在枪火里冲刺时喊出；接近战吼但咬字仍清楚。不是克制的操典朗读，不是平静报话，也不是拖长、沙哑或影视反派式咆哮。"
      : "语气短促、可信、有战场压力，但不舞台化。";
    return [
      "生成一条单句、干净、孤立的1938年日本陆军战场男性口令配音。严格使用台词本身的日语，不要改词，也不要读成中文。",
      `角色：${line.role || "兵"}。自然的成年日本男性嗓音。${delivery}`,
      "不要音乐、不要旁白、不要环境声、不要音效、不要念角色名；开口前后只留极短静音。",
      `只说这一句原文：“${line.text}”`,
    ].join("\n");
  }
  return [
    "生成一条单句、干净、孤立的战场男性口令配音。严格使用台词本身的语言，不要改词。",
    `角色：${line.role || "士兵"}。语气短促、可信，不舞台化。`,
    "不要音乐、不要旁白、不要环境声、不要音效、不要念角色名；开口前后只留极短静音。",
    `只说这一句原文：“${line.text}”`,
  ].join("\n");
}

async function GenerateSeedAudio(line, rawFile) {
  const apiKey = process.env.VOLCENGINE_API_KEY;
  if (!apiKey) throw new Error("缺少 VOLCENGINE_API_KEY；密钥只能通过环境变量提供，禁止写进仓库。");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VOLCENGINE_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(VOLCENGINE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
      body: JSON.stringify({
        model: VOLCENGINE_MODEL,
        text_prompt: SeedAudioPrompt(line),
        audio_config: { format: "mp3", sample_rate: 48000, pitch_rate: 0, speech_rate: 0, loudness_rate: 0 },
        watermark: {},
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`火山引擎请求超过 ${VOLCENGINE_TIMEOUT_MS / 1000}s`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
  const rawBody = await response.text();
  if (!response.ok) throw new Error(`火山引擎 HTTP ${response.status}：${rawBody.slice(0, 240)}`);
  let payload;
  try { payload = JSON.parse(rawBody); }
  catch { throw new Error(`火山引擎返回了非 JSON 响应（${rawBody.length} bytes）`); }
  if (!payload.audio || typeof payload.audio !== "string") {
    throw new Error(`火山引擎没有返回 audio：${String(payload.message || payload.error || "未知错误").slice(0, 240)}`);
  }
  const audio = Buffer.from(payload.audio, "base64");
  if (audio.length < 2048) throw new Error(`火山引擎返回的音频过小（${audio.length} bytes）`);
  fs.mkdirSync(path.dirname(rawFile), { recursive: true });
  fs.writeFileSync(rawFile, audio);
  return { duration: Number(payload.duration) || 0, originalDuration: Number(payload.original_duration) || 0 };
}

/**
 * 时长写回**行本体所在的那个文件**。
 *
 * 战场口令写在 Data_Voice.mjs；章节台词写在 Data_MissionChX.mjs（章节内容批的文件），
 * Data_Voice 只是把它们拼进总表。写回时按 key 的章号找源文件 ——
 * 找不到就退回 Data_Voice.mjs（临时试验行会直接写在总表里）。
 * 一个 key 只写一处：先命中哪个文件就写哪个，绝不两边都改。
 */
function SourceFileOf(key) {
  const m = /^ch([0-6])_/.exec(key);
  const files = [VOICE_TABLE];
  if (m) files.unshift(path.join(HERE, `Data_MissionCh${m[1]}.mjs`));
  return files.filter((f) => fs.existsSync(f));
}

function WriteDurations(durations) {
  if (!durations.size) return;
  const cache = new Map();      // 文件 → 内容（一个文件里可能有很多条要写）
  const dirty = new Set();
  for (const [key, dur] of durations) {
    const re = new RegExp(`(key: "${key}",[\\s\\S]{0,320}?dur: )([0-9.]+)`);
    let written = false;
    for (const file of SourceFileOf(key)) {
      if (!cache.has(file)) cache.set(file, fs.readFileSync(file, "utf8"));
      const text = cache.get(file);
      if (!re.test(text)) continue;
      cache.set(file, text.replace(re, (m, head) => head + dur.toFixed(2)));
      dirty.add(file);
      written = true;
      break;
    }
    if (!written) console.warn(`  ! ${key} 的 dur 没找到，没写回`);
  }
  for (const file of dirty) fs.writeFileSync(file, cache.get(file));
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
    const target = line.kind === "story"
      ? (VOICE_DELIVERY_MIX[line.delivery] || VOICE_DELIVERY_MIX.normal).rms : TARGET_RMS;
    const st = SpeechStats(file);
    const gain = GainDb(st, target);
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
// 演员表体检：CAST id 与音色提示词必须一一对上。缺一条的后果不是报错，
// 而是**那个人被换成通用四川男兵**——听得出来，但没人查得到原因，所以在这里挡住。
{
  const missing = STORY_CAST_IDS.filter((id) => !CAST_VOICE_PROMPTS[id]);
  const extra = Object.keys(CAST_VOICE_PROMPTS).filter((id) => !STORY_CAST_IDS.includes(id));
  if (missing.length) { console.error(`音色表缺人：${missing.join(" ")}`); process.exit(2); }
  if (extra.length) console.warn(`音色表多出（STORY_CAST_IDS 里没有）：${extra.join(" ")}`);
}

let lines;
const chapterArg = args.find((a) => a.startsWith("--chapter="));
if (picks.length) lines = VOICE_LINES.filter((l) => picks.includes(l.key));
else if (chapterArg) {
  const n = Number(chapterArg.split("=")[1]);
  lines = VOICE_LINES.filter((l) => l.kind === "story" && l.chapter === n);
}
else if (args.includes("--story")) lines = VOICE_LINES.filter((l) => l.kind === "story");
else if (args.includes("--missing")) lines = VOICE_LINES.filter((l) => !Has(l));
else if (args.includes("--all")) lines = VOICE_LINES.slice();
else { console.log("要指定 key，或 --missing / --all / --story / --chapter=N / --normalize"); process.exit(0); }
if (!force && !args.includes("--missing")) lines = lines.filter((l) => !Has(l) || picks.includes(l.key));

if (!lines.length) { console.log("没有要烘的行（加 --force 可以重烘）"); process.exit(0); }
console.log(`要烘 ${lines.length} 条 → ${path.relative(HERE, AUDIO_DIR)}`);
if (dry) {
  for (const l of lines) {
    const opt = EncodeOptionsFor(l) || {};
    const gate = l.kind === "story"
      ? `[${l.delivery} ≤${opt.maxDur.toFixed(1)}s @${opt.targetRms}dB]` : "";
    console.log(`  · ${l.key.padEnd(20)} ${String(l.who || l.role || "").padEnd(14)}`
      + ` ${l.sample ? "[实录]" : gate} ${String(l.text).split("\n")[0]}`);
  }
  process.exit(0);
}

fs.mkdirSync(AUDIO_DIR, { recursive: true });
fs.mkdirSync(RAW_DIR, { recursive: true });

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
    // 短句除外：一条 0.4 s 的音里没有可供建模的噪声段，afftdn 只会啃掉辅音。
    if (enc.floor > FLOOR_MAX && !enc.floorFromRaw) {
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
      src = WorkspaceTake(line.key);
      if (!src) { console.warn(`  ✗ ${line.key} — 系统临时目录里没有上一次火山引擎原始音频`); break; }
    } else {
      src = path.join(RAW_DIR, `AudioRaw_${line.key}.mp3`);
      try {
        const result = await GenerateSeedAudio(line, src);
        console.log(`    ↳ 火山引擎 ${VOLCENGINE_MODEL} 原始时长 ${result.originalDuration || result.duration || "?"}s`);
      } catch (error) {
        console.warn(`  ✗ ${line.key} — ${error.message}`);
        break;
      }
    }
    const enc = Encode(src, dst, EncodeOptionsFor(line));
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
  if (best.floor > FLOOR_MAX && best.floorFromRaw) {
    // 短句：底噪是从原始 take 上量的（成品里已经没有静音可量，见 Encode）。
    // 这时候不能再走 Denoise —— 它按成品重新量一遍，量到的是最轻的人声帧，
    // 于是既报出一个假数字，又要拿 afftdn 去啃一条 0.4 s 短话的辅音。
    // 留最干净的那一条就是最好的结果。
    console.log(`    ! ${line.key} 三次都带一层底噪（${best.floor}dB，量自原始 take）；短句不降噪，留最干净的一条`);
  } else if (best.floor > FLOOR_MAX) {
    const dn = Denoise(dst);
    if (dn.applied) { console.log(`    ~ ${line.key} 重试仍有底噪，轻降一次 ${best.floor} → ${dn.floor}dB`); }
    best = { ...best, floor: Math.round(dn.floor * 10) / 10, dur: Math.round(Duration(dst) * 100) / 100 };
  }
  durations.set(line.key, best.dur);
  ok += 1;
  console.log(`  ✓ ${line.key.padEnd(16)} ${String(line.who || line.role).padEnd(4)} ${best.dur.toFixed(2)}s`
    + `  ${best.rms ?? "?"}dB  底噪 ${best.floor}dB${best.floorFromRaw ? "(原始 take)" : ""}`
    + (best.tempo > 1 ? `（原 ${best.raw.toFixed(2)}s，atempo ${best.tempo.toFixed(2)}）` : "")
    + `  ${line.text}`);
}

// 把实测时长写回 Data_Voice.mjs：只动 dur 那一列，其余一个字符不碰。
WriteDurations(durations);
console.log(`\n烘好 ${ok} / ${lines.length} 条，时长已写回 Data_Voice.mjs`);
process.exit(ok === lines.length ? 0 : 1);
