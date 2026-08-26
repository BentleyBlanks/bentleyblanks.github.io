// 战场口令的配音烘焙：Data_Voice 的文本 → 火山引擎 SeedAudio 1.0 → Audio/*.mp3。
//
//   node Taierzhuang1938/Script_VoiceBake.mjs --missing        # 只烘没有音频的
//   node Taierzhuang1938/Script_VoiceBake.mjs spot_tank ...    # 指定 key
//   node Taierzhuang1938/Script_VoiceBake.mjs --all --force    # 全部重烘
//   node Taierzhuang1938/Script_VoiceBake.mjs --dry            # 只打要烘哪些，不花钱
//   ... --from-workspace                                       # 用系统临时目录里的上次原始音频重转码
//   node Taierzhuang1938/Script_VoiceBake.mjs --normalize      # 只统一响度，不重新生成
//   node Taierzhuang1938/Script_VoiceBake.mjs --clean <key>…   # 只为降底噪重摇，不如旧的就留旧的
//   node Taierzhuang1938/Script_VoiceBake.mjs --prologue --force # 序章只允许 SeedAudio 1.0
//   ... --motivation-level=1|2|3                         # 连续动员强度；默认 3（最终定稿）
//
// 烘完把实测时长写回 Data_Voice.mjs 的 dur 字段；战斗 Bark 断言 0.3—2.6 s，序章对白独立 0.45—4.8 s。
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
import { VOICE_LINES } from "./Data_Voice.mjs";
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
function Encode(src, dst, { maxDur = 2.35, maxTempo = 1.6, preFilter = "" } = {}) {
  const stage = dst + ".stage.wav";
  const trim = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02"
    + ",areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02,areverse";
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

/** --from-workspace：拿上一次火山引擎响应里解出的原始 MP3 重转码，不再发请求。 */
function WorkspaceTake(key) {
  const file = path.join(RAW_DIR, `AudioRaw_${key}.mp3`);
  return fs.existsSync(file) ? file : null;
}

const PROLOGUE_ROLE_PROMPTS = {
  "年轻传令兵": "十八九岁的四川男兵，嗓音年轻偏亮但已有长途行军后的疲惫；说话直率、带一点想家的憨气，川味自然，不卖弄方言。",
  "旧伤士兵": "四十岁上下的四川老兵，男中低音，嗓子略哑，慢而省力；见过伤亡，语气平静克制，不故作沧桑。",
  "机枪手": "三十岁上下的四川男兵，嗓音厚实、稳，嘴上爱打趣，底色是照应年轻人的老练和善意。",
  "擦枪士兵": "二十多岁的四川男兵，声音偏低而干，正被发涩的枪栓惹烦；只短促嘟囔，不喊叫。",
  "车外军官": "三十五岁上下的四川男性基层军官，中低音有穿透力；隔着车门发命令，急而清楚，不表演式咆哮。",
};

function SeedAudioPrompt(line) {
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
  if (line.prologue) {
    const character = PROLOGUE_ROLE_PROMPTS[line.role] || "四川男性军人，嗓音自然、克制，符合1938年长期行军后的疲惫状态。";
    return [
      "生成一条单句、干净、孤立的中文男性对白配音。",
      "使用自然四川话口音，不能说成普通话腔，也不要夸张模仿或喜剧化。",
      character,
      "不要音乐、不要旁白、不要环境声、不要音效、不要念角色名；开口前后只留极短静音。",
      `只说这一句原文：“${line.text}”`,
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

function WriteDurations(durations) {
  if (!durations.size) return;
  let table = fs.readFileSync(VOICE_TABLE, "utf8");
  for (const [key, dur] of durations) {
    const re = new RegExp(`(key: "${key}",[\\s\\S]{0,320}?dur: )([0-9.]+)`);
    if (!re.test(table)) { console.warn(`  ! ${key} 的 dur 没找到，没写回`); continue; }
    table = table.replace(re, (m, head) => head + dur.toFixed(2));
  }
  fs.writeFileSync(VOICE_TABLE, table);
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
else if (args.includes("--prologue")) lines = VOICE_LINES.filter((l) => l.prologue);
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
    const encodeOptions = line.promptMode === "continuousScene"
      ? { maxDur: 22.0, maxTempo: 1.25 }
      : (line.prologue ? { maxDur: 5.0, maxTempo: 1.35 } : undefined);
    const enc = Encode(src, dst, encodeOptions);
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
  console.log(`  ✓ ${line.key.padEnd(16)} ${String(line.role).padEnd(4)} ${best.dur.toFixed(2)}s  底噪 ${best.floor}dB`
    + (best.tempo > 1 ? `（原 ${best.raw.toFixed(2)}s，atempo ${best.tempo.toFixed(2)}）` : "")
    + `  ${line.text}`);
}

// 把实测时长写回 Data_Voice.mjs：只动 dur 那一列，其余一个字符不碰。
WriteDurations(durations);
console.log(`\n烘好 ${ok} / ${lines.length} 条，时长已写回 Data_Voice.mjs`);
process.exit(ok === lines.length ? 0 : 1);
