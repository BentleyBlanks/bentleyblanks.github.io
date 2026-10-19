// 白盒预演（FirstLevel0610）四条占位音效：火山引擎 SeedAudio 1.0 文生音效 → Audio/BlockoutPreviz/*.mp3。
// 契约：会话 scratchpad 的 Contract_FirstLevel0610_v4_RideCellarSfx.md §3（2026-10-20）。
// 运行时别名（代理 M 登记）：babyCry / cellarSob / gateSmash / jarShatter。
//
//   node Taierzhuang1938/_import/Script_BlockoutPrevizSfx.mjs                 # 用已选定的 take 重烘（不调接口）
//   node Taierzhuang1938/_import/Script_BlockoutPrevizSfx.mjs --generate      # 只补缺的候选 take（并发 2）
//   node Taierzhuang1938/_import/Script_BlockoutPrevizSfx.mjs --report        # 量全部候选 take（峰值 / RMS / 起音 / 主频段 / 响点）
//   node Taierzhuang1938/_import/Script_BlockoutPrevizSfx.mjs --overview      # 每条 cue 出一张「波形 + 频谱」总览图（候选 + 成品）
//   node Taierzhuang1938/_import/Script_BlockoutPrevizSfx.mjs --only=babyCry  # 只处理一条 cue
//   node Taierzhuang1938/_import/Script_BlockoutPrevizSfx.mjs --force         # 重新生成全部候选（会换掉已选定的音！）
//
// 密钥只从 VOLCENGINE_API_KEY 读，不打印、不落盘。网络走 curl（node 的 fetch 不认本机代理）。
// 候选 take、接口原始返回、总览图都落 Taierzhuang1938/tmp/BlockoutPrevizSfx/（根 .gitignore 的 tmp/ 挡着）；
// 只有 Audio/BlockoutPreviz/ 下四个成品 mp3 进仓库。重掷不可复现：默认不调接口，缺 take 就报错，--force 才重掷。
//
// ## 提示词怎么写
// 照 Script_SeedAudioOpeningFoleyBake 的经验：描述拟音师真会做的事、点名频段、给时长、给包络。
// 接口一次固定给 1.5—2.6 s，要 3—4 s 的（婴儿哭、窖里哭声）拿两条 take 交叉淡接。
//
// ## 电平（预演占位，不进游戏混音表）
// 先 volumedetect 量采样峰值，再精确归一到 −3 dBFS（mp3 编瞬态会过冲 1—3 dB，别设 −1）；编完成品再量一遍，
// 超了就按差值再压一刀。单声道、48 kHz、72 kbps。头 10 ms 淡入、尾按 cue 淡出（afade=t=out 的 st 必须是 dur − d）。
import fs from "node:fs";
import path from "node:path";
import { execFile, execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const outputDir = path.join(root, "Audio/BlockoutPreviz");
const tmpDir = path.join(root, "tmp/BlockoutPrevizSfx");
const ffmpeg = process.env.FFMPEG || "ffmpeg";
const curl = process.env.CURL || "curl";
const model = "seed-audio-1.0";
const endpoint = "https://openspeech.bytedance.com/api/v3/tts/create";
const args = process.argv.slice(2);
const Flag = (name) => args.includes(`--${name}`);
const Opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const SR = 48000;
const PEAK_TARGET_DBFS = -3;
const BITRATE = "80k";   // 48 kHz 的 mp3 只有 64 / 80 / 96 kbps 这几档，写 72k 会被 LAME 落到 64k
const MAX_TAKES = 5;   // 契约：每条最多重掷 5 次

const COMMON = "一条独立的音效，单声道近距离录音，无音乐，无旁白，无战场背景声。";

/**
 * 每条 cue 的候选提示词（一条提示词一个 take）。顺序就是 take 编号，**只许往后加**：
 * 已选定的 take 文件名带着编号，插在中间会让 PICKS 指错人。
 */
const CUES = {
  babyCry: {
    file: "Sfx_BabyCry.mp3",
    label: "婴儿哇哇大哭（09-3 / 09-4 窖里的娃）",
    prompts: [
      "一个几个月大的婴儿在屋里哇哇大哭，撕心裂肺地连哭几声，每声之间短促地吸气，哭声响亮刺耳，中高频为主，整段都在哭，不要停。",
      "近距离录音：一个两三个月大的小婴儿饿了在大哭，「哇——哇——」一声接一声，嗓子都哭哑了，带吸气和抽噎，响亮清楚，整段持续。",
      "一个小婴儿被惊醒后放声大哭，哭声尖而急，一声连一声，中间几乎没有停顿，整段都是哭声，没有大人的声音。",
      "婴儿哭声：几个月大的小孩在被子里嚎哭，声音响亮尖锐，每声约一秒，连哭两三声，带哽咽吸气，没有别的声音。",
      "只有一个婴儿在哭：持续、响亮的婴儿啼哭，每声拖得长长的「哇——」，然后猛吸一口气接着哭，从头哭到尾。",
    ],
  },
  cellarSob: {
    file: "Sfx_CellarSob.mp3",
    label: "窖里几个人压着嗓子哭（09-3，隔着土听）",
    prompts: [
      "两个女人压着嗓子在哭：一个年轻女人低声抽泣，一个老太太哽咽着小声啜泣，捂着嘴不敢哭出声的那种憋哭，带颤抖的吸气，没有说话，整段持续。",
      "近距离录音：几个女人躲在黑屋里捂着嘴小声哭，抽泣、哽咽、吸鼻子，声音压得很低但录得清楚，整段持续，没有台词。",
      "一个老太太和一个年轻媳妇紧紧抱着，压低声音断断续续地哭，颤抖的呼吸、抽噎、哽咽，不敢大声，没有说话，整段都在哭。",
      "压抑的女人哭声：细碎的抽泣和颤抖的吸气，很克制、一直在哭，中间夹一两声老太太的哽咽，录得清楚，没有话。",
      "一个年轻女人把脸埋在袖子里哭，闷闷的抽泣和哽咽，一声接一声，越哭越急又拼命忍住，整段持续，没有说话。",
    ],
  },
  gateSmash: {
    file: "Sfx_GateSmash.mp3",
    label: "枪托砸两下厚木门再一脚踹（10-4）",
    prompts: [
      "拟音：用步枪的硬木枪托全力砸一扇厚实的老木门，「咚！咚！」沉重的两下，木门整扇震颤、铁门闩哐啷，紧接着一只穿皮靴的脚狠狠踹门一脚「哐」，木板吱嘎颤动。三下都沉重低闷，中低频为主，约 2 秒。",
      "一个人用木棍粗的那头狠砸一扇厚木板门两下，每下都是沉实的「咚」，门框跟着震，铁门闩哐啷响；然后用脚使劲踹门一下，门板发出吱嘎的闷响。约 2 秒，没有人声。",
      "拟音：重木槌砸在厚木大门上两记沉闷的撞击，间隔半秒，木头的沉重低音加门闩金属轻响，第三记是皮靴踹门更重的一声，木门哐当颤动。整段约 2 秒，低频厚重。",
      "连续砸门三下：前两下是硬木砸厚木门的沉重「咚、咚」，最后一下是一脚踹上去的更重的「哐」，门闩和木板跟着哐啷颤响，约 2 秒。中低频为主，门没有开，没有人说话。",
      "拟音：一根粗木头的端头重重撞在一扇老式厚木院门上两下，门板闷响、门闩铁环哐啷，第三下换成一脚踹门，更重更闷，木门在门框里哐当震动。约 2 秒。",
    ],
  },
  jarShatter: {
    file: "Sfx_JarShatter.mp3",
    label: "小陶罐摔碎、弹壳撒一地（09-7）",
    prompts: [
      "拟音：一只巴掌大的小陶罐从一米高掉在院子里的硬土地上「啪」地摔碎，紧接着几十颗黄铜子弹壳哗啦啦撒落在硬地上，叮叮当当滚开，约 1.5 秒。先是陶片碎裂的脆响，后面是金属壳的细碎叮当。",
      "一只装满黄铜弹壳的小陶罐掉在石板地上摔碎：陶器碎裂的一声脆响，然后一把铜壳撒了一地叮叮当当乱滚，逐渐停下，约 1.5 秒。中高频为主，清脆。",
      "拟音：小瓦罐摔在硬地上「哐啷」碎成几块，罐里的几十个空弹壳哗啦一下子倒出来撒在地上，铜壳弹跳乱滚的细碎金属声，约 1.5 秒后安静。",
      "一个小陶罐摔碎加一堆黄铜弹壳撒在硬地上的声音：先是陶片砸碎的脆「啪」，紧跟着密集的金属叮当撒落声，滚动几下停住，整体约 1.5 秒，没有别的声音。",
      "拟音：把一个小陶壶摔在水泥地上，陶片四散的一声脆裂，同时一大把黄铜小弹壳从里面撒出来，叮叮当当在地上跳、滚，约 1.5 秒收住。",
    ],
  },
};

const Pascal = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const TakeFile = (cue, i) => `${Pascal(cue)}_take${String(i + 1).padStart(2, "0")}.mp3`;

/**
 * 选定的 take 与切点（候选量完、看过总览图之后定，理由写在每一行上面）。
 * 每条 cue：segments[]（按顺序交叉淡接，每段 take / atS / durS / 可选 gainDb）、post（拼接后的滤镜链，可空）、fadeInS / fadeOutS。
 * 段与段之间用 acrossfade（xfadeS）接；一段的就直接切。
 */
// 2026-10-19 第一轮 20 条（每条 cue 5 个提示词各掷一次），看 tmp/BlockoutPrevizSfx/Overview_*.png 定的。
// 接口给婴儿哭 / 哭声的是 5.5—21.5 s 的长段（不是固定 2.5 s），所以这两条是从一段里切窗口，不用拼两条。
const PICKS = {
  // take04（5.5 s）：三声完整的「哇——」（0.1—1.2 / 2.45—3.3 / 4.2—5.0 s）夹两口吸气，基频 400—500 Hz、
  // 1—2 kHz 占 77 %，谱图上是整齐的谐波梳 —— 几个月大的婴儿嚎哭就是这形状。切前两声 + 中间那口气（0.07—3.60 s，3.5 s）。
  // 落选：01 谱心 3.4 kHz、偏尖偏薄（像更大的孩子尖叫）；02 400—1k 占 27 %、基频偏低（像大人学哭）；
  // 03 前 1.8 s 空白、哭声断断续续；05 21.5 s 里哭得松散、电平低。
  babyCry: { segments: [{ take: "BabyCry_take04.mp3", atS: 0.07, durS: 3.53 }], fadeInS: 0.01, fadeOutS: 0.2 },
  // take04（13.5 s）：120—400 Hz 占 62 %、400—1k 33 %，谱心 470 Hz —— 女人压着嗓子的抽泣就落在这一段；
  // 9.2—13.2 s 那四秒抽泣最密（每 0.3—0.8 s 一下）。整条电平很低（峰 −23 dBFS，提示词里「压低声音」让模型把电平也压低了），
  // 归一化要抬 20 dB，底噪跟着抬，但这是占位音。后处理：高通 80、低通 900 做「隔着土」，再加一点几十毫秒的小空间回声。
  // 落选：01 / 02 更空（峰 −27 / −37，前几秒几乎没声）；03 和 04 同型但抽泣更稀；05 谱心 3 kHz，是吸鼻子的气声，低通后就没了。
  cellarSob: {
    segments: [{ take: "CellarSob_take04.mp3", atS: 9.2, durS: 3.95 }],
    post: "highpass=f=80,lowpass=f=900:p=2,aecho=0.85:0.5:19|31|53:0.32|0.24|0.16,lowpass=f=1500",
    fadeInS: 0.05, fadeOutS: 0.15,
  },
  // 两段拼：take01 的前两下（0.13 / 0.90 s，120—400 Hz 占 44 %、每下带 0.6 s 的门板余振 —— 硬木砸厚木门）
  // 接 take04 的第三下（2.23 s，全条最重、<120 Hz 占 70 %、像整扇门被踹得一震）当那一脚；第三下比前两下重 10 dB，压 6 dB。
  // 落选：01 后面第三、四下比前两下轻（砸门不会越砸越轻）；02 / 05 只有两下；03 第一下前有 0.3 s 空白、只有两下；
  // 04 单独用的话三下间隔 1 s、3.5 s 太拖，而且从头到尾都是 <120 Hz 的轰。
  gateSmash: {
    segments: [
      { take: "GateSmash_take01.mp3", atS: 0.05, durS: 1.62 },
      { take: "GateSmash_take04.mp3", atS: 2.12, durS: 0.75, gainDb: -6 },
    ],
    xfadeS: 0.04, post: "highpass=f=45", fadeInS: 0.005, fadeOutS: 0.2,
  },
  // 两段拼：take03 开头那一记落地的闷「啪」（0.35 s，120—400 Hz 占 45 %，陶罐砸到硬地的那一下）
  // 接 take04 整条（1.5 s，2—4 kHz 占 68 %，谱图上一排排水平亮线 = 几十个铜壳各自的振铃，0.1—0.8 s 密集叮当再滚散）。
  // 落选：01 / 02 谱心 5.7—6.5 kHz、>8k 占 29—34 %，是玻璃碎不是陶罐；03 单独用没有金属；05 前 0.77 s 空白、叮当太稀。
  jarShatter: {
    segments: [
      { take: "JarShatter_take03.mp3", atS: 0.28, durS: 0.2 },
      { take: "JarShatter_take04.mp3", atS: 0.07, durS: 1.38 },
    ],
    xfadeS: 0.05, fadeInS: 0.005, fadeOutS: 0.12,
  },
};

// ---------------------------------------------------------------- 生成（curl）
function GenerateOne(cue, i, rawFile) {
  const apiKey = process.env.VOLCENGINE_API_KEY;
  if (!apiKey) throw new Error("缺少 VOLCENGINE_API_KEY；密钥只能通过环境变量提供，禁止写进仓库。");
  const prompt = COMMON + CUES[cue].prompts[i];
  const bodyFile = rawFile + ".request.json";
  const respFile = rawFile + ".response.json";
  fs.writeFileSync(bodyFile, JSON.stringify({ model, text_prompt: prompt,
    audio_config: { format: "mp3", sample_rate: 48000, pitch_rate: 0, speech_rate: 0, loudness_rate: 0 }, watermark: {} }));
  return new Promise((resolve, reject) => {
    // 不打印响应头与响应体：可能带敏感信息。curl 认本机代理，node fetch 不认。
    execFile(curl, ["-sS", "--fail", "--max-time", "360", "-X", "POST", endpoint,
      "-H", "Content-Type: application/json", "-H", `X-Api-Key: ${apiKey}`,
      "--data-binary", `@${bodyFile}`, "-o", respFile], { stdio: "pipe" }, (error) => {
      if (error) return reject(new Error(`curl 失败：${error.message.split("\n")[0]}`));
      try {
        const payload = JSON.parse(fs.readFileSync(respFile, "utf8"));
        if (typeof payload.audio !== "string") return reject(new Error("SeedAudio 没有返回 audio"));
        const bytes = Buffer.from(payload.audio, "base64");
        if (bytes.length < 2048) return reject(new Error("SeedAudio 返回的 take 过小"));
        fs.writeFileSync(rawFile, bytes);
        fs.writeFileSync(rawFile + ".json", JSON.stringify({ model, cue, take: i + 1, prompt,
          duration: payload.duration, generatedAt: new Date().toISOString() }, null, 2));
        fs.rmSync(respFile, { force: true });   // 原始返回只剩 mp3 + 旁注（base64 那份没必要留两遍）
        console.log(`generated ${path.basename(rawFile)}: ${bytes.length} bytes, ${payload.duration} s`);
        resolve();
      } catch (e) { reject(e); }
    });
  });
}

async function Generate(cue, i, rawFile) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await GenerateOne(cue, i, rawFile); } catch (error) {
      if (attempt === 2) throw error;
      console.warn(`${path.basename(rawFile)}: ${error.message}，重试`);
    }
  }
}

async function Pool(tasks, jobs) {
  let next = 0;
  const errors = [];
  async function Worker() {
    while (next < tasks.length) {
      const task = tasks[next++];
      try { await task(); } catch (error) { errors.push(error.message); console.error(error.message); }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, jobs) }, Worker));
  if (errors.length) throw new Error(`${errors.length} 条候选没生成出来`);
}

// ---------------------------------------------------------------- 量
function Decode(file, filter, sr = SR) {
  const raw = execFileSync(ffmpeg, ["-v", "error", "-i", file, ...(filter ? ["-af", filter] : []),
    "-ac", "1", "-ar", String(sr), "-f", "f32le", "-"], { maxBuffer: 256 * 1024 * 1024 });
  return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length));
}

const Db = (v) => 20 * Math.log10(Math.max(1e-12, v));

/** 原位基 2 FFT（re / im 等长，长度为 2 的幂）。 */
function Fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k += 1) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

const BANDS = [[0, 120], [120, 400], [400, 1000], [1000, 2000], [2000, 4000], [4000, 8000], [8000, 24000]];
const BandName = (b) => (b[1] >= 24000 ? ">8k" : `${b[0] >= 1000 ? b[0] / 1000 + "k" : b[0]}-${b[1] >= 1000 ? b[1] / 1000 + "k" : b[1]}`);

/** 峰值 / 整段 RMS / 有声段 RMS / 起音时间 / 分段能量占比 / 谱心 / 响点列表。 */
function Measure(file) {
  const pcm = Decode(file);
  const hop = Math.round(SR * 0.01);
  let peak = 0, sumAll = 0;
  const frames = [];
  for (let s = 0; s < pcm.length; s += hop) {
    let sum = 0;
    const e = Math.min(pcm.length, s + hop);
    for (let i = s; i < e; i += 1) { const v = Math.abs(pcm[i]); if (v > peak) peak = v; sum += pcm[i] * pcm[i]; }
    sumAll += sum;
    frames.push(Math.sqrt(sum / Math.max(1, e - s)));
  }
  const loud = Math.max(...frames);
  const gate = loud * 0.1;   // 最响帧 −20 dB
  const active = frames.filter((v) => v >= gate);
  const activeRms = Math.sqrt(active.reduce((a, v) => a + v * v, 0) / Math.max(1, active.length));
  const onsetFrame = frames.findIndex((v) => v >= gate);
  const lastFrame = frames.length - 1 - [...frames].reverse().findIndex((v) => v >= gate);
  // 响点：10 ms 帧 RMS 的局部极大，≥ 最响帧 −14 dB，相邻响点至少隔 80 ms
  const events = [];
  for (let i = 1; i < frames.length - 1; i += 1) {
    if (frames[i] >= loud * 0.2 && frames[i] >= frames[i - 1] && frames[i] > frames[i + 1]) {
      const last = events[events.length - 1];
      if (last && i - last.frame < 8) { if (frames[i] > last.rms) { last.frame = i; last.rms = frames[i]; } continue; }
      events.push({ frame: i, rms: frames[i] });
    }
  }
  // 频谱：2048 点 Hann、hop 1024，只统计有声帧
  const N = 2048;
  const hann = new Float32Array(N);
  for (let i = 0; i < N; i += 1) hann[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  const power = new Float64Array(N / 2);
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let s = 0; s + N <= pcm.length; s += N / 2) {
    let energy = 0;
    for (let i = 0; i < N; i += 1) energy += pcm[s + i] * pcm[s + i];
    if (Math.sqrt(energy / N) < gate) continue;
    for (let i = 0; i < N; i += 1) { re[i] = pcm[s + i] * hann[i]; im[i] = 0; }
    Fft(re, im);
    for (let k = 0; k < N / 2; k += 1) power[k] += re[k] * re[k] + im[k] * im[k];
  }
  let total = 0, centroidNum = 0;
  const bandEnergy = BANDS.map(() => 0);
  for (let k = 1; k < N / 2; k += 1) {
    const f = k * SR / N;
    total += power[k]; centroidNum += f * power[k];
    const b = BANDS.findIndex((band) => f >= band[0] && f < band[1]);
    if (b >= 0) bandEnergy[b] += power[k];
  }
  const bands = BANDS.map((b, i) => ({ name: BandName(b), pct: total ? 100 * bandEnergy[i] / total : 0 }));
  const main = bands.reduce((a, b) => (b.pct > a.pct ? b : a), bands[0]);
  return {
    seconds: pcm.length / SR, peakDbfs: Db(peak), rmsDbfs: Db(Math.sqrt(sumAll / Math.max(1, pcm.length))),
    activeRmsDbfs: Db(activeRms), onsetS: onsetFrame < 0 ? null : onsetFrame * hop / SR,
    endS: onsetFrame < 0 ? null : (lastFrame + 1) * hop / SR,
    centroidHz: total ? centroidNum / total : 0, bands, main,
    events: events.map((e) => ({ atS: e.frame * hop / SR, dbfs: Db(e.rms) })),
  };
}

const Fmt = (m) => `${m.seconds.toFixed(2)}s  peak ${m.peakDbfs.toFixed(1)}  rms ${m.rmsDbfs.toFixed(1)}`
  + `  active ${m.activeRmsDbfs.toFixed(1)}  onset ${m.onsetS === null ? "-" : m.onsetS.toFixed(2) + "s"}`
  + `  main ${m.main.name} ${m.main.pct.toFixed(0)}%  centroid ${(m.centroidHz / 1000).toFixed(2)}k`;
const FmtBands = (m) => m.bands.map((b) => `${b.name} ${b.pct.toFixed(0)}%`).join("  ");
const FmtEvents = (m, max = Infinity) => m.events.slice(0, max).map((e) => `${e.atS.toFixed(2)}s(${e.dbfs.toFixed(0)})`).join(" ")
  + (m.events.length > max ? ` +${m.events.length - max}` : "");

// ---------------------------------------------------------------- 总览图（ffmpeg showwavespic + showspectrumpic）
const ROW_W = 1000;
function RenderRow(file, label, pngFile) {
  // 波形用立方根刻度（安静的 take 也看得见形状，绝对电平看标题里的数）；
  // 频谱：幅度对数（dB）、频率线性 0–10 kHz —— 不用 fscale=log，它会在 500–900 Hz 画一条假亮带（Script_AmbBedComparePage 的教训）。
  const text = label.replace(/\\/g, "\\\\").replace(/'/g, "’").replace(/:/g, "\\:");
  execFileSync(ffmpeg, ["-y", "-v", "error", "-i", file, "-filter_complex",
    `color=c=0x1e1e1e:s=${ROW_W}x40:d=1,drawtext=fontfile='C\\:/Windows/Fonts/consola.ttf':expansion=none:text='${text}':fontsize=13:fontcolor=white:x=6:y=4:line_spacing=3[t];`
    + `[0:a]aformat=channel_layouts=mono,asplit[a][b];[a]showwavespic=s=${ROW_W}x110:colors=0x9fd3ff:scale=cbrt[w];`
    + `[b]showspectrumpic=s=${ROW_W}x180:legend=0:scale=log:fscale=lin:stop=10000:color=fiery:drange=70:limit=0[s];`
    + "[t][w][s]vstack=inputs=3", "-frames:v", "1", "-update", "1", pngFile]);
}

function RenderSheet(rows, sheetFile) {
  const inputs = rows.flatMap((r) => ["-i", r]);
  const chain = rows.map((_, i) => `[${i}]`).join("");
  execFileSync(ffmpeg, ["-y", "-v", "error", ...inputs, "-filter_complex",
    rows.length > 1 ? `${chain}vstack=inputs=${rows.length}` : "[0]copy", "-frames:v", "1", "-update", "1", sheetFile]);
}

// ---------------------------------------------------------------- 烘
function SegmentFilter(seg, idx) {
  const gain = seg.gainDb ? `,volume=${seg.gainDb}dB` : "";
  return `[${idx}:a]aformat=channel_layouts=mono:sample_rates=${SR},atrim=start=${seg.atS}:duration=${seg.durS},asetpts=PTS-STARTPTS${gain}[s${idx}]`;
}

/** 拼接 + 后处理 + 淡入淡出，输出 f32 wav 到 staged（归一化在下一步）。 */
function Assemble(pick, wavFile) {
  const segs = pick.segments;
  const inputs = segs.flatMap((s) => ["-i", path.join(tmpDir, s.take)]);
  const parts = segs.map(SegmentFilter);
  let last = "[s0]";
  const xfade = pick.xfadeS ?? 0.12;
  for (let i = 1; i < segs.length; i += 1) {
    parts.push(`${last}[s${i}]acrossfade=d=${xfade}:c1=tri:c2=tri[x${i}]`);
    last = `[x${i}]`;
  }
  const total = segs.reduce((a, s) => a + s.durS, 0) - xfade * (segs.length - 1);
  const fadeIn = pick.fadeInS ?? 0.01, fadeOut = pick.fadeOutS ?? 0.05;
  const post = pick.post ? `${pick.post},` : "";
  parts.push(`${last}${post}afade=t=in:d=${fadeIn},afade=t=out:st=${(total - fadeOut).toFixed(3)}:d=${fadeOut}[out]`);
  execFileSync(ffmpeg, ["-y", "-v", "error", ...inputs, "-filter_complex", parts.join(";"), "-map", "[out]",
    "-ac", "1", "-ar", String(SR), "-c:a", "pcm_f32le", wavFile]);
  return total;
}

/** ffmpeg volumedetect 的采样峰值（dBFS）；结果打在 stderr。 */
function VolumeDetect(file) {
  const r = spawnSync(ffmpeg, ["-i", file, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" });
  const hit = /max_volume:\s*(-?[\d.]+) dB/.exec(r.stderr || "");
  if (!hit) throw new Error(`volumedetect 没量到峰值：${path.basename(file)}`);
  return Number(hit[1]);
}

function BakeOne(cue, pick) {
  const outFile = path.join(outputDir, CUES[cue].file);
  const staged = path.join(tmpDir, "Staged");
  fs.mkdirSync(staged, { recursive: true });
  for (const seg of pick.segments) {
    if (!fs.existsSync(path.join(tmpDir, seg.take))) {
      throw new Error(`缺少选定的 take ${seg.take}（tmp/BlockoutPrevizSfx/）。这是人工选定的音，重掷不可复现：--force 重新生成并重新选。`);
    }
  }
  const wav = path.join(staged, `${Pascal(cue)}.wav`);
  const total = Assemble(pick, wav);
  // 先 volumedetect 量峰值，再精确归一到 −3 dBFS；成品 mp3 再量一遍，过冲就补压（最多 4 轮）
  let gain = PEAK_TARGET_DBFS - VolumeDetect(wav);
  let measured = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    execFileSync(ffmpeg, ["-y", "-v", "error", "-i", wav, "-af", `volume=${gain.toFixed(3)}dB`,
      "-ac", "1", "-ar", String(SR), "-c:a", "libmp3lame", "-b:a", BITRATE, outFile]);
    measured = Measure(outFile);
    if (measured.peakDbfs <= PEAK_TARGET_DBFS + 0.1 && measured.peakDbfs >= PEAK_TARGET_DBFS - 0.3) break;
    gain += (PEAK_TARGET_DBFS - measured.peakDbfs) * (attempt >= 2 ? 0.5 : 1);
  }
  if (measured.peakDbfs > PEAK_TARGET_DBFS + 0.1) throw new Error(`${CUES[cue].file}：峰值 ${measured.peakDbfs.toFixed(2)} 压不到 −3 dBFS`);
  return { ...measured, totalS: total, gainDb: gain };
}

// ---------------------------------------------------------------- 入口
async function Main() {
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });
  const only = Opt("only", "").split(",").filter(Boolean);
  const cues = Object.keys(CUES).filter((cue) => !only.length || only.includes(cue));
  const unknown = only.filter((cue) => !CUES[cue]);
  if (unknown.length) throw new Error(`没有这条 cue：${unknown.join(" ")}`);
  for (const cue of cues) if (CUES[cue].prompts.length > MAX_TAKES) throw new Error(`${cue} 超过 ${MAX_TAKES} 次重掷上限`);

  if (Flag("generate") || Flag("force")) {
    const jobs = Math.min(2, Number(Opt("jobs", "2")) || 2);   // 火山引擎并发 ≤ 2
    const tasks = [];
    for (const cue of cues) {
      CUES[cue].prompts.forEach((_, i) => {
        const rawFile = path.join(tmpDir, TakeFile(cue, i));
        if (Flag("force") || !fs.existsSync(rawFile)) tasks.push(() => Generate(cue, i, rawFile));
      });
    }
    console.log(`生成 ${tasks.length} 条候选（并发 ${jobs}）`);
    await Pool(tasks, jobs);
    return;
  }

  if (Flag("report")) {
    for (const cue of cues) {
      console.log(`## ${cue}  ${CUES[cue].label}`);
      CUES[cue].prompts.forEach((_, i) => {
        const rawFile = path.join(tmpDir, TakeFile(cue, i));
        if (!fs.existsSync(rawFile)) { console.log(`${TakeFile(cue, i)}  （没生成）`); return; }
        const m = Measure(rawFile);
        console.log(`${TakeFile(cue, i).padEnd(24)} ${Fmt(m)}\n${"".padEnd(24)} ${FmtBands(m)}\n${"".padEnd(24)} 响点 ${FmtEvents(m)}`);
      });
      const outFile = path.join(outputDir, CUES[cue].file);
      if (fs.existsSync(outFile)) {
        const m = Measure(outFile);
        console.log(`${CUES[cue].file.padEnd(24)} ${Fmt(m)}\n${"".padEnd(24)} ${FmtBands(m)}\n${"".padEnd(24)} 响点 ${FmtEvents(m)}`);
      }
    }
    return;
  }

  if (Flag("overview")) {
    const rowsDir = path.join(tmpDir, "Rows");
    fs.mkdirSync(rowsDir, { recursive: true });
    const finalRows = [];
    for (const cue of cues) {
      const rows = [];
      const Row = (file, name) => {
        const m = Measure(file);
        const png = path.join(rowsDir, `${path.basename(file, ".mp3")}.png`);
        RenderRow(file, `${name}  ${Fmt(m)}\n${FmtBands(m)}   hits ${FmtEvents(m, 12)}`, png);
        rows.push(png);
      };
      CUES[cue].prompts.forEach((_, i) => {
        const rawFile = path.join(tmpDir, TakeFile(cue, i));
        if (fs.existsSync(rawFile)) Row(rawFile, TakeFile(cue, i));
      });
      const outFile = path.join(outputDir, CUES[cue].file);
      if (fs.existsSync(outFile)) { Row(outFile, `FINAL ${CUES[cue].file}`); finalRows.push(rows[rows.length - 1]); }
      if (!rows.length) { console.log(`${cue}: 没有可画的文件`); continue; }
      const sheet = path.join(tmpDir, `Overview_${Pascal(cue)}.png`);
      RenderSheet(rows, sheet);
      console.log(`overview ${sheet}`);
    }
    if (finalRows.length) {
      const sheet = path.join(tmpDir, "Overview_Finals.png");
      RenderSheet(finalRows, sheet);
      console.log(`overview ${sheet}`);
    }
    return;
  }

  const qc = {};
  for (const cue of cues) {
    const pick = PICKS[cue];
    if (!pick) throw new Error(`${cue} 还没有选定 take（PICKS）`);
    const m = BakeOne(cue, pick);
    qc[cue] = { file: CUES[cue].file, segments: pick.segments, post: pick.post || null, ...m };
    console.log(`baked ${CUES[cue].file.padEnd(22)} ${Fmt(m)}  gain ${m.gainDb.toFixed(2)} dB`);
    console.log(`${"".padEnd(28)} ${FmtBands(m)}`);
  }
  fs.writeFileSync(path.join(tmpDir, "Data_Qc.json"), JSON.stringify(qc, null, 2) + "\n");
}

Main().catch((error) => { console.error(error.message); process.exitCode = 1; });
