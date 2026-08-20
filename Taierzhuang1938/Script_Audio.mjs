// 《血战台儿庄》音频引擎 —— **合成打底 + 实录采样盖在上面**。
//
// 底层是 32 个 WebAudio 节点图配方（RECIPES），一个外部文件都不用；
// 上层是实录素材（Audio/Sfx/，免版税包与 PD/CC0 素材，见 Data_SfxSources.mjs），
// 由 LoadSfxPack 在解锁之后**逐条盖掉同名配方**，盖不上去就照旧用合成的。
//
// 为什么当初一路合成到底：整个项目的底线是「不加载任何外部资源」，而且枪声
// 一旦是采样，二十几个人同时开枪会立刻听出来是同一个 wav 在复读。
// 为什么最后还是换了：**枪声的瞬态是炸开的空气，不是包络** —— 噪声过带通再
// 削顶，出来永远是「啪」不是「炸」。复读的问题在采样层用多变体 + 逐发 ±3%
// 变调解掉（同一条思路：随机来自播放时，不是来自素材）。
//
// 信号链（顺序错一处味道就不对）：
//   源(osc/noise) → 声部 gain → [距离低通] → PannerNode(HRTF) ┐
//                 └→ 混响 send → Convolver(现场生成 IR) → 回声总线 ┤
//                                                   sfx/music/amb 三条总线 ┤
//                             → duck gain → master gain → 耳鸣低通 → 限幅 → 输出
//
// 三条踩过的坑，写在前面：
//   1) **混响必须在 Panner 之前分出去**。把 wet 也 HRTF 化的话，远处一枪的
//      尾巴会跟着头一起转，听起来像枪在你耳朵边上绕圈 —— 真实的混响是弥散的。
//   2) **exponentialRampToValueAtTime 不能收到 0**，WebAudio 会直接抛异常并
//      把那一路静音。所有包络的地板统一 1e-4。
//   3) **Panner 用 HRTF 很贵**。近处才值得，远处的零星枪声改用 StereoPanner，
//      同屏 24 人时这一条决定了音频线程会不会爆。
//
// 决定论：**不许 Math.random**。所有随机走 Mulberry32，种子 = 音效名哈希 ^ 播放序号，
// 这样同一场回放里第 N 次开枪永远是同一条枪声，逐轮截图/录音比对才有意义。

import { Mulberry32, HashString, Clamp, Clamp01 } from "./Script_Noise.mjs";
import { VOICE_BASE, VOICE_LINES } from "./Data_Voice.mjs";

// 包络地板。低于这个值当作静音（见文件头坑 2）。
const FLOOR = 1e-4;

// 同时存活的 WebAudio 节点上限。超了就丢掉新的低优先级声音 ——
// 宁可少响一枪，也不能让音频线程卡出爆音（爆音比缺一枪难听得多）。
const NODE_BUDGET = 120;

// 同名音效在这个时间窗内重复触发就合并成一次。
// 一排人同一帧齐射时，二十条一模一样的 rifleNra 叠在一起只会得到削顶的噪声，
// 而且瞬间吃掉全部节点预算。
const DEDUPE_S = 0.022;

// ---------------------------------------------------------------------------
// 噪声缓冲：白/粉/棕。按「种类 + 时长档」缓存，一次生成反复用。
// 变化靠播放时的随机 offset，而不是每次重新生成（生成 4 秒 48k 的噪声要 8ms，
// 开一枪卡 8ms 就是掉帧）。
// ---------------------------------------------------------------------------
function FillWhite(data, rng) {
  for (let i = 0; i < data.length; i += 1) data[i] = rng() * 2 - 1;
}

// Paul Kellet 的粉噪近似。粉噪比白噪更像「空气 / 远处的轰鸣」，
// 白噪听着永远像电视雪花。
function FillPink(data, rng) {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < data.length; i += 1) {
    const w = rng() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.96900 * b2 + w * 0.1538520;
    b3 = 0.86650 * b3 + w * 0.3104856;
    b4 = 0.55000 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.0168980;
    const out = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
    data[i] = out * 0.11;
  }
}

// 棕噪（-6 dB/oct）：风、远处炮火的底噪都靠它，粉噪还是太亮。
function FillBrown(data, rng) {
  let last = 0;
  for (let i = 0; i < data.length; i += 1) {
    const w = rng() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    data[i] = last * 3.2;
  }
}

// ---------------------------------------------------------------------------
// 卷积混响的脉冲响应，现场算。
// street（街巷）：早期反射密集且极短 —— 两侧墙相距几米，反射在 40ms 内就糊成一片。
// open（开阔地/运河边）：早期反射稀疏但拖得长，能听出「一枪在旷野里散开」。
// 这两条 IR 是「近枪声 vs 远枪声」之外，第二个让人分辨得出场景的线索。
// ---------------------------------------------------------------------------
function BuildImpulse(ctx, kind, seed) {
  const rng = Mulberry32(seed);
  const sr = ctx.sampleRate;
  const isOpen = kind === "open";
  const seconds = isOpen ? 2.6 : 0.95;
  const len = Math.floor(sr * seconds);
  const buffer = ctx.createBuffer(2, len, sr);
  // 稀疏度：开阔地只让一小部分样本非零，听感才是「一下一下的回声」而不是嘶声。
  const density = isOpen ? 0.22 : 1.0;
  const decay = isOpen ? 2.2 : 7.5;

  for (let ch = 0; ch < 2; ch += 1) {
    const data = buffer.getChannelData(ch);
    // 左右两声道用不同随机流，不然混响是「单声道贴在正中」，空间感全没了。
    const chRng = Mulberry32((seed ^ (ch * 0x9e3779b1)) >>> 0);
    for (let i = 0; i < len; i += 1) {
      const t = i / len;
      if (density < 1 && chRng() > density) { data[i] = 0; continue; }
      const env = Math.pow(1 - t, 1.6) * Math.exp(-decay * t);
      data[i] = (chRng() * 2 - 1) * env;
    }
    // 街巷的早期反射：几个离散的强反射钉在 6—38ms 上。
    // 没有这几下的话，卷积出来只是一团糊的 reverb，不像「墙就在旁边」。
    if (!isOpen) {
      const taps = [0.006, 0.011, 0.017, 0.023, 0.031, 0.038];
      for (let k = 0; k < taps.length; k += 1) {
        const idx = Math.floor(taps[k] * sr) + Math.floor(chRng() * 40);
        if (idx < len) data[idx] += (chRng() * 2 - 1) * (0.85 - k * 0.11);
      }
    } else {
      // 开阔地：一下很晚的「拍岸」回声（远处房子/河堤），给尾巴一个落点。
      const idx = Math.floor(0.34 * sr);
      if (idx < len) data[idx] += (chRng() * 2 - 1) * 0.5;
    }
  }
  return buffer;
}

// ---------------------------------------------------------------------------
// 波形整形曲线：给枪口爆音做软削顶。
// 纯噪声包络出来的「啪」是干净的，但真实枪声的瞬态是过载的 —— 削顶才有「炸」感。
// ---------------------------------------------------------------------------
/**
 * 母线软削顶曲线。
 *
 * **不能拿 BuildShaperCurve 当限幅器用** —— 它是 tanh(x*k)/tanh(k)，在小信号处
 * 斜率是 5 倍，接上母线整场音量直接失控（实拍时所有音效峰值一起跳到 1.0 以上，
 * 比不接还糟）。限幅要的是「阈值以下原样通过、阈值以上才弯」：
 *   |x| <= knee            y = x
 *   |x| >  knee            y = knee + (1-knee) * tanh((|x|-knee)/(1-knee))
 * **曲线表的定义域必须正好是 -1..1**：WaveShaper 是把输入的 -1..1 摊到整张表上的，
 * 表里存 -3..3 的话就等于把中间那段拉开三倍 —— 实拍时所有音效反而一起冲破 1.0，
 * 「限幅器」当场变成了三倍增益的失真器。超过 ±1 的输入由 WaveShaper 自己钳到
 * 端点值，也就是这里的天花板 0.93，所以永远削不出方波。
 */
function BuildSoftClipCurve(knee = 0.7) {
  const n = 2048;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + (1 - knee) * Math.tanh((a - knee) / (1 - knee));
    curve[i] = x < 0 ? -y : y;
  }
  return curve;
}

function BuildShaperCurve(amount) {
  const n = 1024;
  const curve = new Float32Array(n);
  const k = amount * 40 + 1;
  for (let i = 0; i < n; i += 1) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * k) / Math.tanh(k);
  }
  return curve;
}

// ---------------------------------------------------------------------------
// 周期波形（PeriodicWave）。
// 为什么不用加法合成的一堆 OscillatorNode：冲锋号一次要吹八九个音，每个音四五个
// 泛音就是四十个节点，直接吃掉三分之一预算。PeriodicWave 把整条泛音列塞进
// **一个** 振荡器，音色一样，节点数除以五。
// ---------------------------------------------------------------------------
function HarmonicWave(ctx, amps) {
  const real = new Float32Array(amps.length + 1);
  const imag = new Float32Array(amps.length + 1);
  for (let i = 0; i < amps.length; i += 1) imag[i + 1] = amps[i];
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

// 铜管：泛音列在 3—8 次上有明显的「铜」共振峰（brass formant）。
// 不做这个包，出来的就是方波军号 —— 廉价合成器味，正是要避开的东西。
const BRASS_PARTIALS = [1.0, 0.62, 0.48, 0.42, 0.46, 0.40, 0.30, 0.22, 0.15, 0.10, 0.06, 0.04];
// 弓弦/胡琴：奇偶都有但衰减快，靠共振峰做音色，波形本身别太亮。
const STRING_PARTIALS = [1.0, 0.55, 0.36, 0.20, 0.14, 0.09, 0.06, 0.03];
// 低音提琴：几乎只有低次泛音，高次留给滤波器去决定。
const BASS_PARTIALS = [1.0, 0.42, 0.22, 0.11, 0.06, 0.03];

// ---------------------------------------------------------------------------
// 包络工具
// ---------------------------------------------------------------------------
/** 冲击型包络：极快起音 + 指数衰减。枪声/撞击全靠它。 */
function Hit(param, t, peak, attack, decay) {
  param.setValueAtTime(FLOOR, t);
  param.linearRampToValueAtTime(Math.max(peak, FLOOR * 2), t + attack);
  param.exponentialRampToValueAtTime(FLOOR, t + attack + decay);
}

/** 有保持段的包络：哨子、号、乐音用。 */
function Swell(param, t, peak, attack, hold, release) {
  param.setValueAtTime(FLOOR, t);
  param.linearRampToValueAtTime(Math.max(peak, FLOOR * 2), t + attack);
  param.setValueAtTime(Math.max(peak, FLOOR * 2), t + attack + hold);
  param.exponentialRampToValueAtTime(FLOOR, t + attack + hold + release);
}

/** 频率下滑（指数，听感才是线性的）。 */
function Glide(param, t, from, to, seconds) {
  param.setValueAtTime(Math.max(from, 1), t);
  param.exponentialRampToValueAtTime(Math.max(to, 1), t + seconds);
}

// ===========================================================================
// Voice：一次发声的节点作用域。
// 所有节点都必须经它的工厂方法创建，这样才有统一的计数与回收 —— 手工 new 出来的
// 节点没人 disconnect，几分钟就泄漏满了（Chrome 不会替你收还在 connect 的节点）。
// ===========================================================================
class Voice {
  constructor(engine, startTime, pitch, rng) {
    this.engine = engine;
    this.ctx = engine.ctx;
    this.t = startTime;
    this.pitch = pitch;
    this.rng = rng;
    this.nodes = [];
    this.life = 0.6;          // 秒；配方可以往上抬
    this.out = null;          // 由 Play 建好后塞进来
    this.wetGain = null;      // 混响 send，配方可调
    this.wetScale = 1;        // 距离对混响占比的加成，Play 在配方跑完后乘上去
  }

  /** 登记节点，纳入预算与回收。 */
  Own(node) {
    this.nodes.push(node);
    this.engine.liveNodes += 1;
    return node;
  }

  /** 声明这个 voice 要活多久（用于回收计时）。 */
  Live(seconds) {
    if (seconds > this.life) this.life = seconds;
    return seconds;
  }

  /** 应用音高倍率。所有写死的 Hz 都要过这里。 */
  F(hz) { return hz * this.pitch; }

  /** 随机区间（确定性）。 */
  R(lo, hi) { return lo + (hi - lo) * this.rng(); }

  Gain(value = 1) {
    const n = this.ctx.createGain();
    n.gain.value = value;
    return this.Own(n);
  }

  Filter(type, freq, q = 1) {
    const n = this.ctx.createBiquadFilter();
    n.type = type;
    n.frequency.value = freq;
    n.Q.value = q;
    return this.Own(n);
  }

  Osc(type, freq) {
    const n = this.ctx.createOscillator();
    if (typeof type === "string") n.type = type; else n.setPeriodicWave(type);
    n.frequency.value = freq;
    return this.Own(n);
  }

  Delay(seconds) {
    const n = this.ctx.createDelay(Math.max(0.05, seconds * 2));
    n.delayTime.value = seconds;
    return this.Own(n);
  }

  Shaper(amount) {
    const n = this.ctx.createWaveShaper();
    n.curve = this.engine.ShaperCurve(amount);
    n.oversample = "2x";
    return this.Own(n);
  }

  /** 噪声源。offset 用确定性随机取，同一段缓冲反复用也不会听出复读。 */
  Noise(kind, seconds) {
    const buffer = this.engine.NoiseBuffer(kind);
    const n = this.ctx.createBufferSource();
    n.buffer = buffer;
    const maxOffset = Math.max(0, buffer.duration - seconds - 0.01);
    n.__offset = maxOffset * this.rng();
    n.__dur = seconds;
    return this.Own(n);
  }

  /** 启动一个源节点（Osc / BufferSource），并把 voice 寿命推到它之后。 */
  Start(node, at, duration) {
    const t = at ?? this.t;
    if (node.buffer) node.start(t, node.__offset || 0, duration ?? node.__dur ?? node.buffer.duration);
    else node.start(t);
    const stop = t + (duration ?? node.__dur ?? 1);
    if (node.stop) node.stop(stop + 0.02);
    this.Live(stop - this.t + 0.05);
    return node;
  }
}

// ===========================================================================
// 冲锋号的动机。**合成版与采样版共用同一张谱**：
// 换成实录军号之后，音色是美军军乐队的，调子仍然必须是中方的这一条 ——
// 直接播一段美军 Charge 号，听着就是另一支军队在冲锋。
// 泛音列 3、4、5、6 次 = sol、do、mi、sol；军号没有活塞，只有这四个音能吹。
// 三连音一层层往上冲、落在长音上 —— 冲锋号的骨架是「催」，不是旋律。
// ===========================================================================
const BUGLE_G4 = 392.0, BUGLE_C5 = 523.25, BUGLE_E5 = 659.25, BUGLE_G5 = 783.99;
const BUGLE_CHARGE = [
  [0.00, BUGLE_G4, 0.10], [0.12, BUGLE_C5, 0.10], [0.24, BUGLE_E5, 0.10], [0.36, BUGLE_G5, 0.30],
  [0.70, BUGLE_E5, 0.09], [0.81, BUGLE_G5, 0.09], [0.92, BUGLE_E5, 0.09], [1.03, BUGLE_C5, 0.24],
  [1.32, BUGLE_G4, 0.09], [1.43, BUGLE_C5, 0.09], [1.54, BUGLE_E5, 0.09], [1.65, BUGLE_G5, 0.62],
];

// ===========================================================================
// 声音配方
// 每个配方签名 (A: AudioEngine, v: Voice)，把节点接到 v.out。
// ===========================================================================

/**
 * 枪声通用骨架 —— 近距离。三段式，缺一段都会退化成「啪」一下的塑料音：
 *   1) 爆音瞬态：宽带噪声过削顶 + 一记低频冲击（火药气体推出来的那一下）
 *   2) 机械声  ：枪机/枪管的金属共振，比爆音晚 15—25ms
 *   3) 环境尾  ：低电平噪声 + 大量混响 send，尾巴的长短就是「这是巷子还是旷野」
 */
function GunNear(A, v, p) {
  const t = v.t;
  const out = v.out;

  // --- 1) 低频冲击 ---------------------------------------------------------
  const thump = v.Osc("sine", v.F(p.thumpHi));
  Glide(thump.frequency, t, v.F(p.thumpHi), v.F(p.thumpLo), p.thumpDur);
  const thumpGain = v.Gain(FLOOR);
  Hit(thumpGain.gain, t, p.thumpLevel, 0.001, p.thumpDur);
  thump.connect(thumpGain).connect(out);
  v.Start(thump, t, p.thumpDur + 0.03);

  // --- 1b) 爆音（削顶的宽带噪声）------------------------------------------
  const blastSrc = v.Noise("white", 0.16);
  const blastBand = v.Filter("bandpass", v.F(p.blastFreq), p.blastQ);
  const shaper = v.Shaper(p.drive);
  const blastGain = v.Gain(FLOOR);
  Hit(blastGain.gain, t, p.blastLevel, 0.0008, p.blastDecay);
  // 爆音的频心在头 20ms 内往下掉（气体膨胀），固定频心听着像打火机。
  blastBand.frequency.setValueAtTime(v.F(p.blastFreq * 1.7), t);
  blastBand.frequency.exponentialRampToValueAtTime(v.F(p.blastFreq * 0.7), t + 0.03);
  blastSrc.connect(blastBand).connect(shaper).connect(blastGain).connect(out);
  v.Start(blastSrc, t, 0.16);

  // --- 2) 机械共振 ---------------------------------------------------------
  const mechSrc = v.Noise("white", 0.07);
  const mechBand = v.Filter("bandpass", v.F(p.mechFreq * v.R(0.94, 1.07)), 9);
  const mechGain = v.Gain(FLOOR);
  Hit(mechGain.gain, t + 0.018, p.mechLevel, 0.002, 0.055);
  mechSrc.connect(mechBand).connect(mechGain).connect(out);
  v.Start(mechSrc, t + 0.018, 0.07);

  // --- 3) 环境尾 -----------------------------------------------------------
  // 拥挤时（同屏一排人在打）砍掉这一层：混响 send 还在，尾巴不会真的消失，
  // 只是少一条噪声垫。让第八条枪响不出来，比让它响得完整重要得多。
  if (A.liveNodes > NODE_BUDGET * 0.55) {
    v.wetGain.gain.value = p.wet * 1.25;   // 少了噪声垫，用混响补回来一点
    v.Live(0.5);
    return;
  }
  const tailSrc = v.Noise("pink", p.tailDur);
  const tailLp = v.Filter("lowpass", v.F(1600), 0.7);
  Glide(tailLp.frequency, t, v.F(1600), v.F(280), p.tailDur * 0.8);
  const tailGain = v.Gain(FLOOR);
  Hit(tailGain.gain, t + 0.01, p.tailLevel, 0.008, p.tailDur);
  tailSrc.connect(tailLp).connect(tailGain).connect(out);
  v.Start(tailSrc, t + 0.01, p.tailDur);

  v.wetGain.gain.value = p.wet;
  v.Live(p.tailDur + 0.4);
}

/**
 * 枪声 —— 远距离。**不是把近枪声调小**，是另一种声音：
 * 空气把低频以外的东西吃掉（几百米上高频衰减是低频的十几倍），
 * 剩下的是一记扁的「啪」，紧跟一下墙面反射回来的「嗒」，然后是很长的尾。
 * 玩家判断「这枪打的是不是我」全靠这个差别。
 */
function GunFar(A, v, p) {
  const t = v.t;
  const out = v.out;

  const crackSrc = v.Noise("white", 0.09);
  const band = v.Filter("bandpass", v.F(p.farFreq), 1.1);
  const hp = v.Filter("highpass", v.F(240), 0.7);
  const crackGain = v.Gain(FLOOR);
  Hit(crackGain.gain, t, 0.55, 0.001, 0.035);
  crackSrc.connect(band).connect(hp).connect(crackGain).connect(out);
  v.Start(crackSrc, t, 0.09);

  // 反射回来的「嗒」：延迟 55—120ms，比头音闷。
  // 这一下是「远」的关键线索 —— 只有远处的枪，直达声和反射声才分得开。
  const slapDelay = v.Delay(v.R(0.055, 0.12));
  const slapLp = v.Filter("lowpass", v.F(900), 0.6);
  const slapGain = v.Gain(0.45);
  crackGain.connect(slapDelay).connect(slapLp).connect(slapGain).connect(out);

  const tailSrc = v.Noise("brown", 1.5);
  const tailLp = v.Filter("lowpass", v.F(700), 0.5);
  const tailGain = v.Gain(FLOOR);
  Hit(tailGain.gain, t + 0.02, 0.16, 0.03, 1.4);
  tailSrc.connect(tailLp).connect(tailGain).connect(out);
  v.Start(tailSrc, t + 0.02, 1.5);

  v.wetGain.gain.value = 0.85;   // 远枪声几乎全是混响
  v.Live(2.0);
}

/** 金属机件的「咔哒」：一记极短的带通共振。栓、保险、扳机都用它。 */
function MetalClick(v, at, freq, level, decay = 0.045, q = 14) {
  const src = v.Noise("white", 0.05);
  const band = v.Filter("bandpass", v.F(freq), q);
  const g = v.Gain(FLOOR);
  Hit(g.gain, at, level, 0.001, decay);
  src.connect(band).connect(g).connect(v.out);
  v.Start(src, at, 0.05);
}

/** 金属摩擦：带通噪声 + 频心缓升，像钢件在钢件里蹭过去。 */
function MetalScrape(v, at, dur, fromHz, toHz, level) {
  const src = v.Noise("white", dur);
  const band = v.Filter("bandpass", v.F(fromHz), 3.2);
  Glide(band.frequency, at, v.F(fromHz), v.F(toHz), dur);
  const g = v.Gain(FLOOR);
  Swell(g.gain, at, level, 0.01, dur * 0.55, dur * 0.4);
  src.connect(band).connect(g).connect(v.out);
  v.Start(src, at, dur);
}

/** 闷响低频冲击。爆炸、脚步、倒地共用。 */
function Thud(v, at, hiHz, loHz, dur, level, lp = 260) {
  const osc = v.Osc("sine", v.F(hiHz));
  Glide(osc.frequency, at, v.F(hiHz), v.F(loHz), dur);
  const filter = v.Filter("lowpass", v.F(lp), 0.9);
  const g = v.Gain(FLOOR);
  Hit(g.gain, at, level, 0.002, dur);
  osc.connect(filter).connect(g).connect(v.out);
  v.Start(osc, at, dur + 0.05);
}

/**
 * 一串极短的颗粒（碎屑撒落、桥夹里互相磕碰的弹壳、抛壳）。
 *
 * **一条噪声链打 N 个包络钉，不是 N 条链**。早先每颗粒各建 noise+band+gain，
 * 一次爆炸光碎屑就 27 个节点，占掉四分之一预算；合成一条之后是 3 个。
 * 听感没有损失 —— 这些颗粒本来就不需要各自独立的音色。
 */
function Ticks(v, at, count, spread, freqLo, freqHi, level, decay = 0.025, q = 7) {
  const dur = spread + decay + 0.06;
  const src = v.Noise("white", dur);
  const band = v.Filter("bandpass", v.F(freqHi), q);
  const g = v.Gain(FLOOR);
  src.connect(band).connect(g).connect(v.out);
  for (let i = 0; i < count; i += 1) {
    // 时间点必须严格递增：自动化事件是按时间排的，往回插会把前一段的衰减硬截断
    // （听上去就是一记「咔」）。所以用「均分槽 + 槽内抖动」而不是纯随机再排序。
    const t = at + spread * (i + v.rng() * 0.85) / count;
    band.frequency.setValueAtTime(v.F(v.R(freqLo, freqHi)), t);
    Hit(g.gain, t, level * v.R(0.5, 1), 0.001, decay);
  }
  v.Start(src, at, dur);
  return dur;
}

/** 碎屑撒落 —— Ticks 的语义别名，读配方时更直观。 */
function Grains(v, at, count, spread, freqLo, freqHi, level) {
  return Ticks(v, at, count, spread, freqLo, freqHi, level, 0.022, 6);
}

/**
 * 连发。**整条点射共用一套发声链**，只在包络上打 N 个钉子 ——
 * 一挺机枪物理上就是一个声源，逐发各建一套 GunNear 的话，一梭子四发实测吃掉
 * 64 个节点（半个预算）。合成之后不到 15 个，而且听感更连贯：
 * 环境尾本来就该是连续的一条，不是四条尾巴叠在一起。
 */
function GunAuto(A, v, p, shots, interval) {
  const t0 = v.t;
  const span = interval * (shots - 1);
  const srcDur = span + 0.25;

  // 爆音层
  const blast = v.Noise("white", srcDur);
  const band = v.Filter("bandpass", v.F(p.blastFreq), p.blastQ);
  const shaper = v.Shaper(p.drive);
  const blastGain = v.Gain(FLOOR);
  blast.connect(band).connect(shaper).connect(blastGain).connect(v.out);

  // 低频冲击层
  const thump = v.Osc("sine", v.F(p.thumpHi));
  const thumpGain = v.Gain(FLOOR);
  thump.connect(thumpGain).connect(v.out);

  // 机械层：抛壳、供弹机构。自动武器的「哒哒」有一半是这一层给的。
  const mech = v.Noise("white", srcDur);
  const mechBand = v.Filter("bandpass", v.F(p.mechFreq), 8);
  const mechGain = v.Gain(FLOOR);
  mech.connect(mechBand).connect(mechGain).connect(v.out);

  for (let i = 0; i < shots; i += 1) {
    const at = t0 + i * interval;
    // 逐发的微小抖动：机枪连发每一发的膛压其实不一样，全等的话像鼓机。
    Hit(blastGain.gain, at, p.blastLevel * v.R(0.88, 1.06), 0.0008, p.blastDecay);
    band.frequency.setValueAtTime(v.F(p.blastFreq * v.R(1.5, 1.8)), at);
    band.frequency.exponentialRampToValueAtTime(v.F(p.blastFreq * 0.72), at + Math.min(0.03, interval * 0.4));
    Glide(thump.frequency, at, v.F(p.thumpHi * v.R(0.96, 1.04)), v.F(p.thumpLo), p.thumpDur);
    Hit(thumpGain.gain, at, p.thumpLevel, 0.001, p.thumpDur);
    Hit(mechGain.gain, at + p.mechDelay, p.mechLevel * v.R(0.75, 1.1), 0.002, 0.05);
  }
  v.Start(blast, t0, srcDur);
  v.Start(mech, t0, srcDur);
  v.Start(thump, t0, srcDur);

  // 环境尾：整条点射一条，跟着停火一起收。
  const tail = v.Noise("pink", span + p.tailDur + 0.1);
  const tailLp = v.Filter("lowpass", v.F(1500), 0.7);
  Glide(tailLp.frequency, t0, v.F(1500), v.F(300), span + p.tailDur * 0.8);
  const tailGain = v.Gain(FLOOR);
  Swell(tailGain.gain, t0 + 0.01, p.tailLevel, 0.02, span, p.tailDur);
  tail.connect(tailLp).connect(tailGain).connect(v.out);
  v.Start(tail, t0 + 0.01, span + p.tailDur + 0.1);

  v.wetGain.gain.value = p.wet;
  v.Live(span + p.tailDur + 0.45);
}

const RECIPES = {
  // --- 步枪 ---------------------------------------------------------------
  // 中正式/汉阳造：7.92×57，弹头重、装药多，爆音低沉，胸口能感觉到那一下。
  rifleNra(A, v) {
    GunNear(A, v, {
      thumpHi: 128, thumpLo: 52, thumpDur: 0.11, thumpLevel: 0.85,
      blastFreq: 1500, blastQ: 0.55, blastLevel: 0.95, blastDecay: 0.075, drive: 0.55,
      mechFreq: 3600, mechLevel: 0.10,
      tailDur: 0.9, tailLevel: 0.10, wet: 0.42,
    });
  },
  rifleNraFar(A, v) { GunFar(A, v, { farFreq: 820 }); },

  // 三八式：6.5×50 是小口径长弹，膛压高而药量小 —— 中方老兵记它「又尖又脆」，
  // 所以频心整体上抬，低频冲击砍掉一半，衰减更快。这条是敌我辨识的听觉线索。
  rifleIja(A, v) {
    GunNear(A, v, {
      thumpHi: 165, thumpLo: 78, thumpDur: 0.065, thumpLevel: 0.44,
      blastFreq: 2700, blastQ: 0.75, blastLevel: 0.92, blastDecay: 0.045, drive: 0.68,
      mechFreq: 5200, mechLevel: 0.14,
      tailDur: 0.68, tailLevel: 0.075, wet: 0.38,
    });
  },
  rifleIjaFar(A, v) { GunFar(A, v, { farFreq: 1250 }); },

  // --- 自动火器 -----------------------------------------------------------
  // 捷克式 ZB26：500 rpm = 0.12 s 一发。上方弹匣，抛壳口在下 —— 每发后面挂一记
  // 弹壳落地的叮，是这挺枪最好认的细节。
  zb26(A, v) {
    const shots = Clamp(v.burst ?? 3, 1, 12);
    GunAuto(A, v, {
      thumpHi: 120, thumpLo: 54, thumpDur: 0.07, thumpLevel: 0.6,
      blastFreq: 1700, blastQ: 0.6, blastLevel: 0.8, blastDecay: 0.05, drive: 0.6,
      mechFreq: 3900, mechLevel: 0.16, mechDelay: 0.022,
      tailDur: 0.55, tailLevel: 0.07, wet: 0.35,
    }, shots, 60 / 500);
    // 抛壳口在下方，弹壳一颗颗掉在砖地上 —— 捷克式最好认的细节。
    if (shots > 1) Ticks(v, v.t + 0.16, shots, shots * 0.12, 3800, 6400, 0.055, 0.045, 9);
  },

  // 十一年式：同样 500 rpm，但漏斗供弹机构松散，机械噪声比捷克式重得多。
  type11(A, v) {
    const shots = Clamp(v.burst ?? 4, 1, 12);
    GunAuto(A, v, {
      thumpHi: 150, thumpLo: 74, thumpDur: 0.05, thumpLevel: 0.34,
      blastFreq: 2900, blastQ: 0.8, blastLevel: 0.72, blastDecay: 0.035, drive: 0.66,
      // 漏斗供弹的压弹板一路拍打，机械噪声比捷克式重得多，delay 也更靠前。
      mechFreq: 5600, mechLevel: 0.22, mechDelay: 0.012,
      tailDur: 0.45, tailLevel: 0.055, wet: 0.32,
    }, shots, 60 / 500);
  },

  // 九二式重机枪：**实际射速约 200 发/分 = 0.30 s 一发**。
  // 这个慢节奏是它的身份证，中方回忆里就叫它「啄木鸟」。做快了就成了 MG42，
  // 整场战斗的听感年代都会错。7.7 mm 弹加上 55 kg 的枪架，每发还要带一记
  // 三脚架的金属余振。
  type92(A, v) {
    const shots = Clamp(v.burst ?? 4, 1, 14);
    const interval = 60 / 200;            // 200 发/分 = 0.30 s，「啄木鸟」的间隔
    GunAuto(A, v, {
      thumpHi: 140, thumpLo: 60, thumpDur: 0.1, thumpLevel: 0.8,
      blastFreq: 2100, blastQ: 0.6, blastLevel: 0.9, blastDecay: 0.06, drive: 0.7,
      mechFreq: 4400, mechLevel: 0.24, mechDelay: 0.03,
      tailDur: 0.75, tailLevel: 0.09, wet: 0.4,
    }, shots, interval);
    // 55 kg 的三脚架被每一发顶得嗡一下。这条金属余振是「重机枪」和「轻机枪」
    // 在听感上真正的分界 —— 只靠射速慢的话，会被当成有人在慢慢点射。
    const ring = v.Osc("triangle", v.F(470));
    const ringGain = v.Gain(FLOOR);
    ring.connect(ringGain).connect(v.out);
    for (let i = 0; i < shots; i += 1) {
      const at = v.t + i * interval;
      ring.frequency.setValueAtTime(v.F(v.R(430, 520)), at);
      Hit(ringGain.gain, at + 0.012, 0.05, 0.003, Math.min(0.2, interval * 0.7));
    }
    v.Start(ring, v.t, (shots - 1) * interval + 0.25);
  },

  // --- 操作音 -------------------------------------------------------------
  // 拉栓：抬柄的一记轻响 → 拉到底的金属摩擦 → 推回闭锁的「咔哒」。
  // 三段之间的间隔就是 boltTimeS 里那 1.05 秒的手感来源。
  bolt(A, v) {
    MetalClick(v, v.t, 2900, 0.16, 0.03);
    MetalScrape(v, v.t + 0.03, 0.15, 1400, 2600, 0.13);
    MetalClick(v, v.t + 0.22, 3400, 0.2, 0.05, 16);
    MetalScrape(v, v.t + 0.26, 0.13, 2400, 1300, 0.10);
    MetalClick(v, v.t + 0.42, 2200, 0.26, 0.06, 11);   // 闭锁
    v.wetGain.gain.value = 0.14;
    v.Live(0.6);
  },

  // 桥夹压弹：黄铜弹壳互相磕碰，五发一串的碎响 + 拇指压下去的一记闷。
  stripperLoad(A, v) {
    MetalClick(v, v.t, 2400, 0.13, 0.05, 9);
    Ticks(v, v.t + 0.06, 5, 0.17, 3200, 5400, 0.07, 0.028, 8);   // 五发弹壳互相磕碰
    MetalScrape(v, v.t + 0.22, 0.11, 2000, 3200, 0.09);
    Thud(v, v.t + 0.3, 190, 120, 0.08, 0.13, 500);
    MetalClick(v, v.t + 0.36, 1800, 0.14, 0.05, 12);
    v.wetGain.gain.value = 0.12;
    v.Live(0.55);
  },

  // 弹匣入位：一记闷的到位 + 卡笋的脆响 + 弹簧余音。
  magIn(A, v) {
    MetalScrape(v, v.t, 0.08, 1200, 1900, 0.1);
    Thud(v, v.t + 0.06, 240, 140, 0.09, 0.22, 600);
    MetalClick(v, v.t + 0.115, 2600, 0.26, 0.05, 15);
    const spring = v.Osc("triangle", v.F(1750));
    Glide(spring.frequency, v.t + 0.12, v.F(1750), v.F(1300), 0.12);
    const sg = v.Gain(FLOOR);
    Hit(sg.gain, v.t + 0.12, 0.045, 0.002, 0.12);
    spring.connect(sg).connect(v.out);
    v.Start(spring, v.t + 0.12, 0.14);
    v.wetGain.gain.value = 0.12;
    v.Live(0.4);
  },

  // 拉弦（木柄手榴弹是拉火不是拔销，但沿用契约名）：细金属的一声「叮」+ 火帽的嘶。
  grenadePin(A, v) {
    MetalClick(v, v.t, 3900, 0.2, 0.07, 20);
    MetalClick(v, v.t + 0.05, 5200, 0.12, 0.05, 22);
    const hiss = v.Noise("white", 0.12);
    const hp = v.Filter("highpass", v.F(5200), 0.8);
    const g = v.Gain(FLOOR);
    Hit(g.gain, v.t + 0.07, 0.06, 0.01, 0.1);
    hiss.connect(hp).connect(g).connect(v.out);
    v.Start(hiss, v.t + 0.07, 0.12);
    v.wetGain.gain.value = 0.1;
    v.Live(0.3);
  },

  // 投掷：袖子/棉衣带起的风声，中间夹一记木柄离手的轻响。
  grenadeThrow(A, v) {
    const src = v.Noise("pink", 0.36);
    const band = v.Filter("bandpass", v.F(600), 1.1);
    band.frequency.setValueAtTime(v.F(420), v.t);
    band.frequency.exponentialRampToValueAtTime(v.F(1500), v.t + 0.16);
    band.frequency.exponentialRampToValueAtTime(v.F(500), v.t + 0.34);
    const g = v.Gain(FLOOR);
    Swell(g.gain, v.t, 0.3, 0.09, 0.06, 0.18);
    src.connect(band).connect(g).connect(v.out);
    v.Start(src, v.t, 0.36);
    MetalClick(v, v.t + 0.15, 900, 0.08, 0.04, 5);
    v.wetGain.gain.value = 0.15;
    v.Live(0.45);
  },

  // --- 爆炸 ---------------------------------------------------------------
  // 近炸四层：次声冲击（20—60 Hz，胸口那一下）+ 宽带爆音 + 碎片撒落 + 长尾。
  // 层数少一层都会变成「网页游戏的爆炸」。
  explosionNear(A, v) {
    const t = v.t;
    // 1) 次声：58 → 22 Hz。低于 30 Hz 小喇叭放不出来，但耳机上就是「压」的来源。
    const sub = v.Osc("sine", v.F(58));
    Glide(sub.frequency, t, v.F(58), v.F(22), 0.55);
    const subGain = v.Gain(FLOOR);
    Hit(subGain.gain, t, 1.0, 0.006, 0.65);
    sub.connect(subGain).connect(v.out);
    v.Start(sub, t, 0.75);

    // 2) 爆音主体：削顶的宽带噪声，频心快速下滑（火球膨胀）。
    const body = v.Noise("white", 0.9);
    const lp = v.Filter("lowpass", v.F(4200), 0.7);
    Glide(lp.frequency, t, v.F(4200), v.F(420), 0.5);
    const drive = v.Shaper(0.75);
    const bodyGain = v.Gain(FLOOR);
    Hit(bodyGain.gain, t, 0.9, 0.003, 0.55);
    body.connect(lp).connect(drive).connect(bodyGain).connect(v.out);
    v.Start(body, t, 0.9);

    // 3) 碎片：砖屑瓦片在 0.15—1.0 s 之间稀稀拉拉落回地面。
    Grains(v, t + 0.12, 9, 0.85, 2600, 7000, 0.075);

    // 4) 长尾：轰鸣从街两头返回来。
    const tail = v.Noise("brown", 1.8);
    const tailLp = v.Filter("lowpass", v.F(600), 0.5);
    Glide(tailLp.frequency, t, v.F(600), v.F(150), 1.6);
    const tailGain = v.Gain(FLOOR);
    Hit(tailGain.gain, t + 0.05, 0.3, 0.05, 1.7);
    tail.connect(tailLp).connect(tailGain).connect(v.out);
    v.Start(tail, t + 0.05, 1.8);

    v.wetGain.gain.value = 0.7;
    v.Live(2.4);
    A.Deafen(0.42);            // 耳鸣，见 Deafen 的注释
    A.Duck(1.1, 0.55);
  },

  // 远炸：只剩低频。高频在几百米上被空气吃干净了，听到的是闷的一记 + 很长的滚。
  explosionFar(A, v) {
    const t = v.t;
    const sub = v.Osc("sine", v.F(46));
    Glide(sub.frequency, t, v.F(46), v.F(20), 0.9);
    const sg = v.Gain(FLOOR);
    Hit(sg.gain, t, 0.5, 0.02, 1.0);
    sub.connect(sg).connect(v.out);
    v.Start(sub, t, 1.1);

    const body = v.Noise("brown", 1.6);
    const lp = v.Filter("lowpass", v.F(380), 0.6);
    Glide(lp.frequency, t, v.F(380), v.F(120), 1.4);
    const bg = v.Gain(FLOOR);
    Hit(bg.gain, t, 0.42, 0.03, 1.5);
    body.connect(lp).connect(bg).connect(v.out);
    v.Start(body, t, 1.6);

    v.wetGain.gain.value = 0.9;
    v.Live(2.2);
  },

  // 炮弹啸声：由远及近的下滑 + 音量渐强。
  // 掷弹筒的 warnLeadS 是 1.5 秒，玩家就靠这一声半决定往哪儿滚。
  shellIncoming(A, v) {
    const t = v.t;
    const dur = 1.7;
    const osc = v.Osc("triangle", v.F(1700));
    Glide(osc.frequency, t, v.F(1700), v.F(320), dur);
    // 第二条稍微失谐，出「呜——」的拍频；单条振荡器太干净，像防空警报。
    const osc2 = v.Osc("sine", v.F(1700 * 1.012));
    Glide(osc2.frequency, t, v.F(1700 * 1.012), v.F(320 * 1.03), dur);
    const g = v.Gain(FLOOR);
    g.gain.setValueAtTime(FLOOR, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + dur * 0.85);
    g.gain.exponentialRampToValueAtTime(FLOOR, t + dur);
    const band = v.Filter("bandpass", v.F(1200), 1.4);
    Glide(band.frequency, t, v.F(1800), v.F(400), dur);
    osc.connect(band); osc2.connect(band);
    band.connect(g).connect(v.out);
    v.Start(osc, t, dur); v.Start(osc2, t, dur);

    // 破空的风噪，跟着一起近。
    const air = v.Noise("pink", dur);
    const ab = v.Filter("bandpass", v.F(2200), 0.9);
    Glide(ab.frequency, t, v.F(2600), v.F(700), dur);
    const ag = v.Gain(FLOOR);
    ag.gain.setValueAtTime(FLOOR, t);
    ag.gain.exponentialRampToValueAtTime(0.16, t + dur * 0.9);
    ag.gain.exponentialRampToValueAtTime(FLOOR, t + dur);
    air.connect(ab).connect(ag).connect(v.out);
    v.Start(air, t, dur);

    v.wetGain.gain.value = 0.5;
    v.Live(dur + 0.3);
  },

  // 落点：比 explosionNear 更「土」—— 泥土吸收高频，多一层被掀起来的土块。
  shellImpact(A, v) {
    const t = v.t;
    Thud(v, t, 90, 30, 0.5, 1.0, 180);
    const body = v.Noise("white", 0.7);
    const lp = v.Filter("lowpass", v.F(2200), 0.7);
    Glide(lp.frequency, t, v.F(2200), v.F(260), 0.4);
    const drive = v.Shaper(0.6);
    const bg = v.Gain(FLOOR);
    Hit(bg.gain, t, 0.75, 0.004, 0.45);
    body.connect(lp).connect(drive).connect(bg).connect(v.out);
    v.Start(body, t, 0.7);
    Grains(v, t + 0.18, 7, 0.7, 900, 3200, 0.09);
    const tail = v.Noise("brown", 1.4);
    const tg = v.Gain(FLOOR);
    Hit(tg.gain, t + 0.04, 0.24, 0.04, 1.3);
    const tlp = v.Filter("lowpass", v.F(400), 0.5);
    tail.connect(tlp).connect(tg).connect(v.out);
    v.Start(tail, t + 0.04, 1.4);
    v.wetGain.gain.value = 0.65;
    v.Live(1.9);
    A.Deafen(0.3);
    A.Duck(0.8, 0.45);
  },

  // 掷弹筒发射：**闷响**，不是炮声。50 mm 短筒、装药少，出膛就是「咚」的一下，
  // 高频几乎没有 —— 这也是为什么被打的人往往先听见啸声、没听见发射。
  launcherPop(A, v) {
    const t = v.t;
    Thud(v, t, 170, 62, 0.22, 0.75, 420);
    const body = v.Noise("white", 0.16);
    const lp = v.Filter("lowpass", v.F(900), 0.8);
    const g = v.Gain(FLOOR);
    Hit(g.gain, t, 0.4, 0.002, 0.14);
    body.connect(lp).connect(g).connect(v.out);
    v.Start(body, t, 0.16);
    v.wetGain.gain.value = 0.45;
    v.Live(0.7);
  },

  // --- 白刃 ---------------------------------------------------------------
  // 大刀挥空：带通频心先升后落，是刀身过耳的多普勒。
  dadaoSwing(A, v) {
    const t = v.t, dur = 0.34;
    const src = v.Noise("pink", dur);
    const band = v.Filter("bandpass", v.F(500), 2.2);
    band.frequency.setValueAtTime(v.F(430), t);
    band.frequency.exponentialRampToValueAtTime(v.F(1900), t + dur * 0.55);
    band.frequency.exponentialRampToValueAtTime(v.F(620), t + dur);
    const g = v.Gain(FLOOR);
    Swell(g.gain, t, 0.34, 0.12, 0.04, 0.16);
    src.connect(band).connect(g).connect(v.out);
    v.Start(src, t, dur);
    v.wetGain.gain.value = 0.2;
    v.Live(0.45);
  },

  // 大刀劈中：厚背刀是砍不是刺，主体是钝的一记，刀身余振被肉体压住，很短。
  dadaoHit(A, v) {
    const t = v.t;
    Thud(v, t, 140, 55, 0.16, 0.7, 320);
    const wet = v.Noise("white", 0.12);
    const lp = v.Filter("lowpass", v.F(1100), 0.9);
    const wg = v.Gain(FLOOR);
    Hit(wg.gain, t, 0.4, 0.002, 0.1);
    wet.connect(lp).connect(wg).connect(v.out);
    v.Start(wet, t, 0.12);
    const ring = v.Osc("triangle", v.F(1650));
    const rg = v.Gain(FLOOR);
    Hit(rg.gain, t + 0.004, 0.07, 0.002, 0.22);
    ring.connect(rg).connect(v.out);
    v.Start(ring, t + 0.004, 0.25);
    v.wetGain.gain.value = 0.28;
    v.Live(0.5);
  },

  // 刺刀相交：钢对钢，两个高 Q 共振峰互相打拍子。
  bayonetHit(A, v) {
    const t = v.t;
    const freqs = [v.R(2200, 2600), v.R(3400, 3900), v.R(5100, 5800)];
    for (let i = 0; i < freqs.length; i += 1) {
      const osc = v.Osc("triangle", v.F(freqs[i]));
      const g = v.Gain(FLOOR);
      Hit(g.gain, t, 0.28 / (i + 1), 0.001, 0.38 - i * 0.09);
      osc.connect(g).connect(v.out);
      v.Start(osc, t, 0.4);
    }
    MetalClick(v, t, 4200, 0.3, 0.03, 18);
    Thud(v, t, 220, 130, 0.08, 0.2, 500);
    v.wetGain.gain.value = 0.4;
    v.Live(0.6);
  },

  // --- 弹着 ---------------------------------------------------------------
  // 砖：脆裂 + 砖粉。台儿庄的墙大多是青砖，打上去会掉一小片。
  impactBrick(A, v) {
    const t = v.t;
    const src = v.Noise("white", 0.1);
    const band = v.Filter("bandpass", v.F(v.R(1500, 2100)), 1.6);
    const g = v.Gain(FLOOR);
    Hit(g.gain, t, 0.65, 0.001, 0.07);
    src.connect(band).connect(g).connect(v.out);
    v.Start(src, t, 0.1);
    Thud(v, t, 300, 170, 0.06, 0.22, 700);
    Grains(v, t + 0.03, 4, 0.22, 3000, 6500, 0.05);
    v.wetGain.gain.value = 0.32;
    v.Live(0.5);
  },

  // 土：钝、闷，几乎没有高频。也是沙袋的声音。
  impactDirt(A, v) {
    const t = v.t;
    Thud(v, t, 190, 90, 0.11, 0.5, 240);
    const src = v.Noise("brown", 0.14);
    const lp = v.Filter("lowpass", v.F(700), 0.8);
    const g = v.Gain(FLOOR);
    Hit(g.gain, t, 0.34, 0.002, 0.12);
    src.connect(lp).connect(g).connect(v.out);
    v.Start(src, t, 0.14);
    v.wetGain.gain.value = 0.18;
    v.Live(0.35);
  },

  // 木：空腔共鸣。门板、梁、家具 —— 巷战里挡在前面的多半是这些。
  impactWood(A, v) {
    const t = v.t;
    const modes = [v.R(320, 400), v.R(720, 880), v.R(1350, 1600)];
    for (let i = 0; i < modes.length; i += 1) {
      const osc = v.Osc("triangle", v.F(modes[i]));
      const g = v.Gain(FLOOR);
      Hit(g.gain, t, 0.32 / (i + 1), 0.001, 0.17 - i * 0.04);
      osc.connect(g).connect(v.out);
      v.Start(osc, t, 0.2);
    }
    const src = v.Noise("white", 0.06);
    const band = v.Filter("bandpass", v.F(1800), 1.2);
    const g = v.Gain(FLOOR);
    Hit(g.gain, t, 0.3, 0.001, 0.045);
    src.connect(band).connect(g).connect(v.out);
    v.Start(src, t, 0.06);
    v.wetGain.gain.value = 0.25;
    v.Live(0.4);
  },

  // 金属：钢板一记 + **跳弹的「啾——」**。
  // 跳弹是变形的弹头翻着走产生的哨音，所以频率一路下滑还带颤 —— 频率不滑
  // 就成了电子音效，颤音不加就像口哨。这一声是战场音效里最有辨识度的东西之一。
  impactMetal(A, v) {
    const t = v.t;
    const clang = v.Osc("triangle", v.F(v.R(1700, 2300)));
    const cg = v.Gain(FLOOR);
    Hit(cg.gain, t, 0.35, 0.001, 0.14);
    clang.connect(cg).connect(v.out);
    v.Start(clang, t, 0.16);
    MetalClick(v, t, 5200, 0.22, 0.03, 16);

    const whineDur = v.R(0.55, 0.95);
    const whine = v.Osc("sawtooth", v.F(2800));
    Glide(whine.frequency, t + 0.012, v.F(v.R(2400, 3200)), v.F(v.R(700, 1000)), whineDur);
    // 颤：弹头翻滚造成的调制。7—12 Hz，深度几十个音分。
    const lfo = v.Osc("sine", v.R(7, 12));
    const lfoGain = v.Gain(v.R(45, 90));
    lfo.connect(lfoGain).connect(whine.detune);
    v.Start(lfo, t, whineDur + 0.05);
    const band = v.Filter("bandpass", v.F(2200), 7);
    Glide(band.frequency, t + 0.012, v.F(2600), v.F(850), whineDur);
    const wg = v.Gain(FLOOR);
    Hit(wg.gain, t + 0.012, 0.2, 0.006, whineDur);
    whine.connect(band).connect(wg).connect(v.out);
    v.Start(whine, t + 0.012, whineDur);

    v.wetGain.gain.value = 0.5;
    v.Live(whineDur + 0.5);
  },

  // 命中人体：湿、闷、没有回响。棉军装还会吃掉一部分高频。
  impactFlesh(A, v) {
    const t = v.t;
    Thud(v, t, 160, 70, 0.1, 0.55, 200);
    const src = v.Noise("white", 0.09);
    const lp = v.Filter("lowpass", v.F(850), 1.4);
    const g = v.Gain(FLOOR);
    Hit(g.gain, t, 0.32, 0.001, 0.07);
    src.connect(lp).connect(g).connect(v.out);
    v.Start(src, t, 0.09);
    v.wetGain.gain.value = 0.08;   // 打在人身上是「不响」的，别给混响
    v.Live(0.3);
  },

  // --- 人体动作 -----------------------------------------------------------
  // 土路脚步：一记闷的落地 + 一点扬尘的沙沙。
  footstepDirt(A, v) {
    const t = v.t;
    Thud(v, t, v.R(95, 125), 55, 0.07, 0.3, 260);
    const src = v.Noise("pink", 0.1);
    const band = v.Filter("bandpass", v.F(v.R(750, 1050)), 1.1);
    const g = v.Gain(FLOOR);
    Hit(g.gain, t + 0.005, 0.12, 0.004, 0.08);
    src.connect(band).connect(g).connect(v.out);
    v.Start(src, t + 0.005, 0.1);
    v.wetGain.gain.value = 0.14;
    v.Live(0.28);
  },

  // 瓦砾脚步：同样一记落地，外加碎砖被踩得滑动 —— 满城废墟里全程都是这个声音。
  footstepRubble(A, v) {
    const t = v.t;
    Thud(v, t, v.R(100, 130), 58, 0.06, 0.26, 300);
    Grains(v, t, 5, 0.13, 1800, 5200, 0.075);
    const slide = v.Noise("white", 0.14);
    const band = v.Filter("bandpass", v.F(2400), 2.0);
    const g = v.Gain(FLOOR);
    Hit(g.gain, t + 0.01, 0.09, 0.008, 0.12);
    slide.connect(band).connect(g).connect(v.out);
    v.Start(slide, t + 0.01, 0.14);
    v.wetGain.gain.value = 0.2;
    v.Live(0.35);
  },

  // 倒地：不是一下，是三下 —— 膝、髋、头/肩，间隔越来越短、力度越来越小。
  // 只做一记闷响的话，永远像麻袋掉地上。
  bodyFall(A, v) {
    const t = v.t;
    Thud(v, t, 130, 60, 0.12, 0.45, 220);
    Thud(v, t + 0.085, 105, 48, 0.14, 0.55, 190);
    Thud(v, t + 0.19, 90, 42, 0.16, 0.3, 170);
    // 棉军装/装具的窸窣。
    const cloth = v.Noise("pink", 0.3);
    const band = v.Filter("bandpass", v.F(1600), 0.9);
    const g = v.Gain(FLOOR);
    Swell(g.gain, t, 0.1, 0.02, 0.08, 0.18);
    cloth.connect(band).connect(g).connect(v.out);
    v.Start(cloth, t, 0.3);
    MetalClick(v, t + 0.2, v.R(2200, 3400), 0.06, 0.05, 10);   // 枪磕在地上
    v.wetGain.gain.value = 0.22;
    v.Live(0.6);
  },

  // 中弹的闷哼：锯齿基频过两个共振峰当元音，加一层气声。
  // 不做共振峰的话就是纯电子音；这两个 band 才让它像人发出来的。
  hurt(A, v) {
    const t = v.t;
    const f0 = v.F(v.R(112, 138));
    const src = v.Osc(A.Wave("string"), f0);
    Glide(src.frequency, t, f0, f0 * 0.78, 0.26);
    const f1 = v.Filter("bandpass", 640, 5.5);
    const f2 = v.Filter("bandpass", 1180, 7);
    const g1 = v.Gain(0.6), g2 = v.Gain(0.35);
    const bus = v.Gain(FLOOR);
    Swell(bus.gain, t, 0.32, 0.02, 0.08, 0.2);
    src.connect(f1).connect(g1).connect(bus);
    src.connect(f2).connect(g2).connect(bus);
    bus.connect(v.out);
    v.Start(src, t, 0.32);

    const breath = v.Noise("pink", 0.3);
    const bh = v.Filter("bandpass", v.F(2000), 1.0);
    const bg = v.Gain(FLOOR);
    Swell(bg.gain, t, 0.08, 0.03, 0.06, 0.18);
    breath.connect(bh).connect(bg).connect(v.out);
    v.Start(breath, t, 0.3);
    v.wetGain.gain.value = 0.18;
    v.Live(0.5);
  },

  // 濒死心跳：lub-dub 两下，第二下更闷更近。
  // 频率压到 30—60 Hz 是刻意的 —— 这一段要让人「感觉到」而不是「听到」。
  heartbeat(A, v) {
    const t = v.t;
    Thud(v, t, 62, 30, 0.16, 0.85, 110);
    Thud(v, t + 0.27, 54, 26, 0.2, 0.6, 95);
    v.wetGain.gain.value = 0.0;    // 心跳在颅内，不该有房间的混响
    v.Live(0.65);
  },

  // --- 信号 ---------------------------------------------------------------
  // 冲锋号。军号没有活塞，**只能吹泛音列上的音**（3、4、5、6 次泛音 = 中音 sol、
  // 高音 do、mi、sol），所以这条动机只用这四个音 —— 这是形制决定的，
  // 随便写个旋律就不是号声了。音色走铜管泛音包，不是方波。
  bugleCharge(A, v) {
    A.BugleLine(v, BUGLE_CHARGE, 0.3);
    v.wetGain.gain.value = 0.55;   // 号是在街上吹的，尾巴要能撞上墙再回来
    v.Live(2.6);
  },

  // 哨子：主音 + 「豆」造成的快速颤振。没有那个 18 Hz 的颤就是纯音测试信号。
  whistle(A, v) {
    const t = v.t, dur = 0.5;
    const osc = v.Osc("sine", v.F(2350));
    const warble = v.Osc("sine", 18);
    const warbleGain = v.Gain(110);
    warble.connect(warbleGain).connect(osc.detune);
    v.Start(warble, t, dur + 0.1);
    const g = v.Gain(FLOOR);
    Swell(g.gain, t, 0.3, 0.02, dur * 0.75, 0.07);
    osc.connect(g).connect(v.out);
    v.Start(osc, t, dur + 0.1);
    // 吹哨的气声，让它有「人在吹」的质感。
    const air = v.Noise("white", dur);
    const band = v.Filter("bandpass", v.F(3200), 3);
    const ag = v.Gain(FLOOR);
    Swell(ag.gain, t, 0.05, 0.02, dur * 0.7, 0.06);
    air.connect(band).connect(ag).connect(v.out);
    v.Start(air, t, dur);
    v.wetGain.gain.value = 0.45;
    v.Live(0.75);
  },
};

/** 对外暴露的音效名清单，给冒烟测试与关卡编辑器用。 */
export const SOUND_NAMES = Object.keys(RECIPES);

// 连发武器的默认点射长度。游戏逻辑若逐发驱动，传 { burst: 1 } 即可。
const BURST_DEFAULT = { zb26: 3, type11: 4, type92: 3 };

// 低优先级音效：节点预算紧张时先丢它们（丢一记脚步没人发现，丢一发爆炸就穿帮）。
// 低优先级的门槛按 NODE_BUDGET * LOW_PRIORITY_HEADROOM 算，给要紧的声音留位置。
// 【2026-08-20】rifleNraFar / rifleIjaFar 从这张表里**拿掉**了。
// 它们原来只是环境床上的幽灵枪声（可丢），现在是 PlayGunshot 里「一百米外那一枪」
// 的**主声**——把主声列进「预算紧张先丢」，等于交火最激烈的时候远处全体静音。
const LOW_PRIORITY = new Set([
  "footstepDirt", "footstepRubble", "impactDirt", "impactBrick",
  "impactWood",
]);
const LOW_PRIORITY_HEADROOM = 0.62;

/**
 * 近射 → 远射的配方映射。**两段不同的录音**，不是同一段做滤波。
 *
 * DICE 明确说过滤波做不出距离感：远处那一枪之所以是「咚——」而不是「啪」，
 * 是因为声音在空气和地形里滚过几百米之后**波形本身变了**（直达声的瞬态被吃掉、
 * 地面反射与回声接在后面拖成一条尾巴），低通只能把高频削掉，削不出那条尾巴。
 * 我们原来正是滤波路线（Play() 里那条 airHz = 18000/(1+d×0.09)）——
 * 实测把 30 个日兵摆到 15/120/300 m 三档跑 900 帧，63 次开枪里 Far 出现 **0 次**，
 * 最远 120 m 处播的仍是近场 rifleNra。资产早就做完了，线一直没接。
 *
 * 素材（Data_SfxSources.mjs）：
 *   rifleNraFar = FLYSOUND 莫辛纳甘 50 m 外实录
 *   rifleIjaFar = Watson Wu「来弹视角」实录（弹头掠过在前、枪声后到）
 * 捷克式/十一年式/九二式没有对应的远场实录，就**不做**这层 —— 拿步枪的远场去配
 * 机枪只会把两种枪的辨识度一起毁掉，宁可少一层。
 */
const FAR_CUE = { rifleNra: "rifleNraFar", rifleIja: "rifleIjaFar" };

// 交叉淡入区间。近场素材是 1 m 近距录音、远场素材录于 50 m 外，
// 所以纯近场只留到 45 m，45—130 m 两层同时在（等功率），130 m 外只剩远场。
const GUN_NEAR_M = 45;
const GUN_FAR_M = 130;

/**
 * 每个配方的节点开销（实测值，见 scratchpad 的 Measure 脚本）。
 * 拿它做**发声前**的准入判断，比「先播了再看超没超」准得多 ——
 * 后者一旦超标只能眼看着，WebAudio 没有「撤销一个已排程的音」这回事。
 * 配方改了要重新量；宁可写大不写小。
 */
const NODE_COST = {
  zb26: 19, bolt: 19, stripperLoad: 19, shellImpact: 19, bodyFall: 19,
  type92: 18, explosionNear: 18,
  rifleNra: 16, rifleIja: 16, type11: 16, bayonetHit: 16, magIn: 15,
  rifleNraFar: 14, rifleIjaFar: 14, impactMetal: 14,
  grenadePin: 13, impactBrick: 13, impactWood: 13, footstepRubble: 13, hurt: 13,
  dadaoHit: 12, shellIncoming: 11, whistle: 11,
  grenadeThrow: 10, launcherPop: 10, impactDirt: 10, impactFlesh: 10,
  footstepDirt: 10, heartbeat: 10,
  explosionFar: 9, dadaoSwing: 7, bugleCharge: 7,
};
const DEFAULT_COST = 19;

/**
 * 混音表：每个音效的最终配平系数。
 *
 * 数值不是拍脑袋来的 —— 是把每个音效在 OfflineAudioContext 里实拍一遍、量出
 * 峰值之后配的（见 scratchpad/Offline.mjs）。配方里的那些 level 管的是「这一层
 * 在这个声音内部占多少」，混音表管的是「这个声音在整场里站多高」，两件事分开，
 * 改音色的时候才不会顺手把平衡也改掉。
 *
 * 两条实拍才发现的问题，就靠这张表修的：
 *   · 连发的多层叠加冲到 1.16（削顶）—— 单发不会，因为没有连续的尾巴垫着。
 *   · 拉栓 / 拉弦 / 挥刀实拍只有 0.05，比枪声低 20 dB 多。这几个是**玩法反馈**
 *     （换没换弹、刀挥空没有），听不见等于没有。
 */
const MIX_GAIN = {
  zb26: 0.71, type11: 0.70, type92: 0.67,
  bolt: 3.9, grenadePin: 3.9, hurt: 3.6, dadaoSwing: 3.0,
  rifleNraFar: 2.2, rifleIjaFar: 2.2,
  impactMetal: 1.75, grenadeThrow: 1.5, impactBrick: 1.5,
  bayonetHit: 1.4, explosionNear: 1.25,
  bodyFall: 0.65,   // 实拍能量比步枪声还高，一个人倒下不该比开枪响
};

// ===========================================================================
// 实录采样层
//
// 2026-08-19 起，上面那 32 个合成配方**全部被实录采样盖住**（素材来源与切割
// 参数见 Data_SfxSources.mjs / Script_SfxBake.mjs）。合成那套一行没删，理由：
//   · 采样是 fetch 来的，会 404、会被离线、会在没网的本地文件协议下失败；
//     盖不上去就自动退回合成，**没有音效的战场也仍然是能打的战场**。
//   · 出图模式（?shot=1）根本不建 AudioContext，那条路上采样从来不参与。
//
// 为什么不是「直接把 wav 塞进去播」：
//   1. **连发的射速不能由素材决定**。素材是三连发的录音，射速就被钉死在录音里了；
//      九二式「啄木鸟」200 rpm 的身份证会当场作废。所以采样只切**单发**，
//      射速仍由这张表按史实排（与合成版同一组数字）。
//   2. **同一个样本连播二十次会听出复读**。所以逐发 ±3% 变调 + 多变体随机挑，
//      与合成版靠随机种子取噪声偏移是同一个道理。
//   3. **混音表要重配**。合成版的 MIX_GAIN 是拿合成峰值配的；采样在烘焙时统一
//      归一化过，峰值都在 0.85—0.97，直接用的话一记脚步和一发炮弹一样响。
// ===========================================================================
export const SFX_BASE = "Audio/Sfx/";

/** 连发武器的射速（秒/发），与合成版 GunAuto 用的是同一组史实数字。 */
const SAMPLE_BURST = {
  zb26: 60 / 500,      // 捷克式 500 rpm
  type11: 60 / 500,    // 十一年式 500 rpm
  type92: 60 / 200,    // 九二式 200 rpm ——「啄木鸟」的间隔
};

/**
 * 采样版混音表：素材已归一化，这张表定的是「这个声音在战场上站多高」。
 * 与合成版的 MIX_GAIN 是两套数，不能混用。
 * 几条不直观的：
 *   · 操作音（拉栓/压弹/弹匣）录得极干净但很轻，要往上提 —— 它们是**玩法反馈**，
 *     听不见等于没有。
 *   · 脚步压到 0.3 以下：它每秒响一两下，与枪声同一个量级的话整场只剩脚步声。
 *   · 远射两条压到 0.45 上下：环境床按概率一直在撒，撒得太响玩家就分不出
 *     「远处在打」和「打到我头上了」。
 */
const SAMPLE_MIX = {
  explosionNear: 1.0, shellImpact: 0.95, launcherPop: 0.72,
  rifleNra: 0.88, rifleIja: 0.86, type92: 0.8, zb26: 0.76, type11: 0.72,
  explosionFar: 0.5, rifleNraFar: 0.42, rifleIjaFar: 0.46, shellIncoming: 0.62,
  bolt: 0.95, stripperLoad: 1.0, magIn: 1.0, grenadePin: 0.7, grenadeThrow: 0.5,
  dadaoSwing: 0.5, dadaoHit: 0.78, bayonetHit: 0.8,
  impactBrick: 0.55, impactDirt: 0.45, impactWood: 0.5, impactMetal: 0.55, impactFlesh: 0.72,
  footstepDirt: 0.26, footstepRubble: 0.28, bodyFall: 0.55, hurt: 0.8, heartbeat: 0.75,
  bugleCharge: 0.7, whistle: 0.6,
};

/** 混响 send。远的、开阔的给多，贴身的小动作几乎不给。 */
const SAMPLE_WET = {
  rifleNra: 0.42, rifleIja: 0.38, rifleNraFar: 0.55, rifleIjaFar: 0.55,
  zb26: 0.36, type11: 0.32, type92: 0.42,
  explosionNear: 0.45, explosionFar: 0.55, shellImpact: 0.45, shellIncoming: 0.3,
  launcherPop: 0.35, bugleCharge: 0.55, whistle: 0.45,
  bolt: 0.08, stripperLoad: 0.08, magIn: 0.08,
  footstepDirt: 0.12, footstepRubble: 0.12,
};

/**
 * 把一组 AudioBuffer 包成配方。
 * 走 RECIPES 而不是另开一条播放路径 —— 去重、预算闸、Panner、空气低通、
 * 混响 send、距离湿度加成这一整套原封不动地免费复用（与人声采样同一个理由）。
 */
function SampleRecipe(buffers, name) {
  const interval = SAMPLE_BURST[name] || 0;
  const wet = SAMPLE_WET[name];
  return (A, v) => {
    const shots = interval ? Clamp(v.burst ?? 1, 1, 14) : 1;
    for (let i = 0; i < shots; i += 1) {
      const buf = buffers.length === 1
        ? buffers[0]
        : buffers[Math.min(buffers.length - 1, Math.floor(v.rng() * buffers.length))];
      const src = v.Own(A.ctx.createBufferSource());
      src.buffer = buf;
      // 逐发 ±3%：连打二十发不会听出是同一个 wav 在复读。
      const rate = v.pitch * (0.97 + v.rng() * 0.06);
      src.playbackRate.value = rate;
      src.connect(v.out);
      v.Start(src, v.t + i * interval, buf.duration / Math.max(0.1, rate));
    }
    if (wet !== undefined && v.wetGain) v.wetGain.gain.value = wet;
  };
}

/**
 * 冲锋号：一个实录长音 + playbackRate 排出中方的动机。
 * toneHz 是烘焙时量出来的基频（Last Post 里那个持续音，实测 495.5 Hz）——
 * 量错了整段就跑调，所以烘焙侧要求自相关置信度 > 0.5 才写进清单。
 */
function BugleSampleRecipe(buffer, toneHz) {
  return (A, v) => {
    for (const [dt, hz, dur] of BUGLE_CHARGE) {
      const src = v.Own(A.ctx.createBufferSource());
      src.buffer = buffer;
      const rate = (hz / toneHz) * v.pitch;
      src.playbackRate.value = rate;
      const g = v.Gain(FLOOR);
      src.connect(g).connect(v.out);
      const at = v.t + dt;
      // 包络整个装进这个音的时长里（与合成版 BugleLine 同一条约束）
      Swell(g.gain, at, 0.9, dur * 0.2, dur * 0.48, dur * 0.32);
      v.Start(src, at, Math.min(dur + 0.14, buffer.duration / Math.max(0.1, rate)));
    }
    if (v.wetGain) v.wetGain.gain.value = SAMPLE_WET.bugleCharge;
    v.Live(2.6);
  };
}

// ===========================================================================
// 环境床与音乐的编排表
// ===========================================================================
export const AMBIENCE_PRESETS = {
  silence: { wind: 0, windCut: 300, space: "street", events: [] },
  day: {
    wind: 0.055, windCut: 420, space: "street",
    events: [
      { name: "rifleNraFar", chance: 0.05, volume: 0.16 },
      { name: "explosionFar", chance: 0.012, volume: 0.14 },
    ],
  },
  // 战斗：远处零星枪声（间隔随机）+ 远处炮的闷响 + 风。
  // 关键是**别太密**：一直响的话，玩家分不出「远处在打」和「打到我头上了」。
  battle: {
    wind: 0.075, windCut: 520, space: "street",
    events: [
      { name: "rifleNraFar", chance: 0.24, volume: 0.24 },
      { name: "rifleIjaFar", chance: 0.20, volume: 0.22 },
      { name: "explosionFar", chance: 0.075, volume: 0.34 },
      { name: "type92", chance: 0.045, volume: 0.13, burst: 4 },
      { name: "zb26", chance: 0.05, volume: 0.12, burst: 5 },
    ],
  },
  night: {
    wind: 0.07, windCut: 340, space: "open", crickets: 0.055,
    events: [
      { name: "rifleIjaFar", chance: 0.045, volume: 0.13 },
      { name: "explosionFar", chance: 0.02, volume: 0.16 },
    ],
  },
  dawn: {
    wind: 0.05, windCut: 480, space: "open", birds: 0.5,
    events: [
      { name: "rifleNraFar", chance: 0.02, volume: 0.1 },
    ],
  },
};

// 音乐。四个 cue 全是合成音色，**不做电影配乐**：
// 这场仗的声音本体是枪炮，音乐只负责在缝隙里给一个情绪的落点。
export const MUSIC_CUES = {
  // 菜单：一条不动的低音 + 极稀的单音，像空屋子里的余响。
  menu: { bpm: 52, bass: [0, null, 0, null], motif: [7, null, null, 5], solo: null, drum: false, level: 0.5 },
  // 紧张：低音提琴式持续音 + 一个反复回来的小二度动机（最省的「不安」）。
  tension: { bpm: 46, bass: [0, 0, -5, -5], motif: [null, 1, null, 0], solo: null, drum: false, level: 0.55 },
  // 反攻：进行曲的**节奏骨架**（强弱 强弱，附点在前）+ 四度五度的上行走向。
  // 只借《大刀进行曲》那类军歌的律动与音程方向，不写它的旋律。
  charge: { bpm: 112, bass: [0, 0, 5, 5], motif: [0, 5, 7, 12], solo: null, drum: true, level: 0.62 },
  // 战后：一件独奏乐器的长音，别的什么都不加。
  aftermath: { bpm: 40, bass: [0, null, null, null], motif: null, solo: [0, 3, 5, 3], drum: false, level: 0.5 },
};

// D 小调五声骨架的半音偏移基准（以 D2 = 73.42 Hz 为根）。
const MUSIC_ROOT = 73.42;
const SemiToHz = (semi) => MUSIC_ROOT * Math.pow(2, semi / 12);

// ===========================================================================
// AudioEngine
// ===========================================================================
export class AudioEngine {
  constructor({ enabled = true } = {}) {
    this.enabled = enabled;
    this.ctx = null;
    this.liveNodes = 0;
    this.playCounter = 0;
    this.space = "street";
    this.masterVolume = 1;
    // 玩家的音量设置。ctx 还没建的时候也能设，BuildGraph 会照着这份摆节点。
    this.mix = { sfx: 1, music: 1, ambience: 1 };
    this.voiceMute = false;
    // 「暂停时静音背景」。默认开 —— 暂停了背景还在打枪是个 bug，不是特性。
    this.pauseSilence = true;
    this.paused = false;
    this.pausedState = null;
    this.lastPlayAt = new Map();
    // --- 外部人声采样（战场口令）。加载失败不影响任何其他功能 ---
    this.voiceBank = new Map();      // key -> {key, text, kind, file, duration}
    this.voicesReady = false;
    this.voiceErrors = [];
    // --- 实录音效采样。盖不上去就用合成的那套，同样不影响任何其他功能 ---
    this.sampleCues = new Set();     // 已经被采样盖住的配方名
    this.sfxErrors = [];
    this.sfxReady = false;
    this.sfxManifest = null;
    this.lastBarkAt = -99;
    this.lastBarkKindAt = new Map();
    this.barkCounter = 0;      // 名字 → 上次触发时间（去重用）
    this.noiseCache = new Map();
    this.shaperCache = new Map();
    this.waveCache = new Map();
    this.timers = new Set();          // 所有 setTimeout 句柄，Dispose 要清干净
    this.pendingVoices = new Set();   // 还没到回收点的 voice，Dispose 要顺手拆掉
    this.lastError = null;            // 最近一次配方异常，给调试用（正常一直是 null）
    this.errorCount = 0;
    this.ambienceNodes = [];
    this.musicNodes = [];
    this.ambiencePreset = "silence";
    this.musicCue = null;
    this.musicStep = 0;
    this.musicNextTime = 0;
    this.disposed = false;
    // 听者位姿的缓存：Play 里要按距离算低通与 HRTF 开关，每次读 camera 太贵。
    this.listenerPos = { x: 0, y: 1.6, z: 0 };
    // 环境/音乐调度各自一条随机流，互不干扰 —— 共用一条的话，改了音乐就会
    // 连带改掉环境事件的时序，逐轮比对全废。
    this.ambienceRng = Mulberry32(HashString("ambience@taierzhuang"));
    this.musicRng = Mulberry32(HashString("music@taierzhuang"));

    if (!enabled) return;
    this.CreateContext();
  }

  // --- 生命周期 -----------------------------------------------------------

  /**
   * 建 AudioContext。
   * 无音频环境（Node、被策略禁用、老 Safari 没手势）下必须安全失败：
   * 这个类的所有方法都得能在 ctx === null 时空转，不能抛。
   */
  CreateContext() {
    if (this.ctx || this.disposed) return;
    try {
      const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor({ latencyHint: "interactive" });
    } catch (err) {
      this.ctx = null;
      return;
    }
    this.BuildGraph();
  }

  BuildGraph() {
    const ctx = this.ctx;
    // 限幅在最后一环。同屏二十几条枪叠起来必然过 0 dBFS，不限幅就是削顶爆音。
    // 母线末端的软削顶。压缩器的 3 ms 起控时间拦不住枪声那种微秒级瞬态 ——
    // 实拍时连发能冲到 1.16，直接在声卡上削出爆音。tanh 曲线把超出的部分弯回来，
    // 代价是一点谐波失真，而那点失真叠在枪声上根本听不出来。
    this.softClip = ctx.createWaveShaper();
    this.softClip.curve = BuildSoftClipCurve(0.7);
    this.softClip.oversample = "2x";
    this.softClip.connect(ctx.destination);

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -8;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.22;
    this.limiter.connect(this.softClip);

    // 耳鸣段落用的低通：平时开到 20 kHz 等于不存在，爆炸时压到几百 Hz。
    // 放在 master 之后、限幅之前，这样连混响尾巴一起闷掉，才像鼓膜被震了。
    this.outGain = ctx.createGain();
    this.outGain.connect(this.limiter);
    this.deafFilter = ctx.createBiquadFilter();
    this.deafFilter.type = "lowpass";
    this.deafFilter.frequency.value = 20000;
    this.deafFilter.Q.value = 0.7;
    this.deafFilter.connect(this.outGain);

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.masterVolume;
    this.masterGain.connect(this.deafFilter);

    // 三条声部总线。duck 只压音乐与环境，音效不压 —— 台词/爆炸时把枪声也压掉
    // 会让人以为战斗停了。
    //
    // 每条总线后面再挂一个 *User 节点，专门给玩家的音量滑杆用。
    // **不许让滑杆直接写 xxxBus.gain** —— 那几个是系统自己的配平：
    // musicBus 会被 Music() 按 cue 的 level 重写，duck 会把 duckGain 压下去再放回来。
    // 滑杆写在同一个参数上，下一次换 cue 就把玩家的设置抹掉了。
    this.sfxBus = ctx.createGain();
    this.sfxUser = ctx.createGain();
    this.sfxUser.gain.value = this.mix.sfx;
    this.sfxBus.connect(this.sfxUser).connect(this.masterGain);
    this.duckGain = ctx.createGain();
    this.duckGain.connect(this.masterGain);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.5;
    this.musicUser = ctx.createGain();
    this.musicUser.gain.value = this.mix.music;
    this.musicBus.connect(this.musicUser).connect(this.duckGain);
    this.ambienceBus = ctx.createGain();
    this.ambienceBus.gain.value = 0.8;
    this.ambienceUser = ctx.createGain();
    this.ambienceUser.gain.value = this.mix.ambience;
    this.ambienceBus.connect(this.ambienceUser).connect(this.duckGain);

    // 两套空间的卷积混响，常驻。回声统一并到 sfx 总线。
    this.reverbs = {};
    this.reverbReturns = [];
    for (const kind of ["street", "open"]) {
      const conv = ctx.createConvolver();
      conv.buffer = BuildImpulse(ctx, kind, HashString(`ir:${kind}`));
      const ret = ctx.createGain();
      ret.gain.value = kind === "open" ? 0.7 : 0.85;
      conv.connect(ret).connect(this.sfxBus);
      this.reverbs[kind] = conv;
      this.reverbReturns.push(ret);   // 留着引用，不然 Dispose 断不掉它
    }
  }

  /** 首次用户手势后调用。有些浏览器只有在手势里 new AudioContext 才能出声。 */
  Unlock() {
    if (!this.enabled || this.disposed) return;
    if (!this.ctx) this.CreateContext();
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") {
      const p = this.ctx.resume();
      if (p && typeof p.catch === "function") p.catch(() => {});
    }
    // 解锁前设过的环境/音乐是「挂起」状态，这里补跑一次。
    if (this.ambiencePreset && this.ambiencePreset !== "silence") this.Ambience(this.ambiencePreset);
    if (this.musicCue) this.Music(this.musicCue);
    // 人声采样在这儿载入而不是在构造里：解锁之前根本没有 AudioContext，
    // decodeAudioData 无处可去。放在手势之后也顺带避免了"页面一开就拉 300 KB"。
    // 失败不影响任何其他功能 —— 没有配音的战场仍然是能打的战场。
    if (!this.voicesReady && !this.voiceLoading) {
      this.voiceLoading = true;
      this.LoadVoices(VOICE_BASE, VOICE_LINES).catch(() => {});
    }
    // 实录音效同理：解锁之后才有 ctx 可以 decode。约 350 KB，与人声并行拉。
    if (!this.sfxReady && !this.sfxLoading) {
      this.sfxLoading = true;
      this.LoadSfxPack(SFX_BASE).catch(() => {});
    }
  }

  get Ready() {
    return !!this.ctx && this.ctx.state === "running" && !this.disposed;
  }

  Dispose() {
    this.disposed = true;
    for (const id of this.timers) clearTimeout(id);
    this.timers.clear();
    // 清定时器把「到点回收」也一起清了，所以还在飞的 voice 必须在这儿手动拆 ——
    // 不拆的话它们一直挂在总线上，close() 之后引用还在，GC 收不掉整张图。
    for (const v of Array.from(this.pendingVoices)) this.FreeVoice(v);
    this.pendingVoices.clear();
    this.StopAmbience();
    this.StopMusic();
    if (!this.ctx) return;
    // 必须先把常驻节点断开，否则 close() 之后引用还挂着，GC 收不掉。
    try {
      for (const key of Object.keys(this.reverbs || {})) this.reverbs[key].disconnect();
      for (const ret of this.reverbReturns || []) ret.disconnect();
      this.sfxBus.disconnect();
      this.sfxUser.disconnect();
      this.musicBus.disconnect();
      this.musicUser.disconnect();
      this.ambienceBus.disconnect();
      this.ambienceUser.disconnect();
      this.duckGain.disconnect();
      this.masterGain.disconnect();
      this.deafFilter.disconnect();
      this.outGain.disconnect();
      this.limiter.disconnect();
      this.softClip.disconnect();
    } catch (err) { /* 已经断开就算了 */ }
    const ctx = this.ctx;
    this.ctx = null;
    try {
      const p = ctx.close();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch (err) { /* 某些实现重复 close 会抛 */ }
  }

  // --- 缓存 ---------------------------------------------------------------

  /** 4 秒的噪声缓冲，按种类缓存一份。所有变化靠播放 offset。 */
  NoiseBuffer(kind) {
    let buf = this.noiseCache.get(kind);
    if (buf) return buf;
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * 4);
    buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    const rng = Mulberry32(HashString(`noise:${kind}`));
    if (kind === "pink") FillPink(data, rng);
    else if (kind === "brown") FillBrown(data, rng);
    else FillWhite(data, rng);
    this.noiseCache.set(kind, buf);
    return buf;
  }

  ShaperCurve(amount) {
    const key = Math.round(amount * 20);
    let c = this.shaperCache.get(key);
    if (!c) { c = BuildShaperCurve(key / 20); this.shaperCache.set(key, c); }
    return c;
  }

  Wave(kind) {
    let w = this.waveCache.get(kind);
    if (w) return w;
    const table = kind === "brass" ? BRASS_PARTIALS : kind === "bass" ? BASS_PARTIALS : STRING_PARTIALS;
    w = HarmonicWave(this.ctx, table);
    this.waveCache.set(kind, w);
    return w;
  }

  // --- 听者 ---------------------------------------------------------------

  /**
   * 每帧同步听者位姿。
   * 用 matrixWorld 直接取基向量，不走 getWorldDirection —— 那个会分配临时 Vector3，
   * 每帧一次不多，但这是 60 fps 下的热路径，能不分配就不分配。
   */
  /**
   * 载入外部人声采样（战场口令）。
   *
   * 在这之前整个引擎是**纯合成**的，一个外部音源都没有 —— 这是它最大的长处
   * （零加载、零 404、完全确定性），也是它做不了人嗓的原因：喊话不是能算出来的。
   *
   * 接入方式刻意选了「注册成配方」而不是另开一条播放路径：
   * 采样一旦进了 RECIPES，去重、预算闸、Panner、空气低通、混响 send、距离湿度加成
   * 这一整套就**原封不动地免费复用**了。另开一条路的话，这些全要再写一遍，
   * 而且必然会漂（远处的喊声混响不对、预算不计入、齐喊时不去重）。
   *
   * 失败一律吞掉并计数，绝不抛：**没有配音的战场仍然是能打的战场**，
   * 但静默失败要留痕迹（this.voiceErrors），不然没人会发现口令没响。
   *
   * @param {string} base    目录前缀，例如 "Audio/"
   * @param {Array}  entries Data_Voice.VOICE_LINES
   * @returns {Promise<number>} 真正解码成功的条数
   */
  async LoadVoices(base, entries) {
    if (!this.ctx || this.disposed || !Array.isArray(entries)) return 0;
    this.voiceErrors = this.voiceErrors || [];
    let ok = 0;
    await Promise.all(entries.map(async (e) => {
      try {
        const res = await fetch(base + e.file);
        if (!res.ok) throw new Error("HTTP " + res.status);
        const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
        const name = "voice." + e.key;
        RECIPES[name] = (A, v) => {
          const src = v.Own(A.ctx.createBufferSource());
          src.buffer = buf;
          // 变调用 playbackRate：喊话的音高与语速一起变，正是"另一个人"的听感。
          // 只有 6 个标准普通话音色，靠 ±4% 的变调把一个班喊出不同的人来。
          src.playbackRate.value = v.pitch;
          src.connect(v.out);
          v.Start(src, v.t, buf.duration / Math.max(0.1, v.pitch));
        };
        MIX_GAIN[name] = e.gain ?? 1;
        NODE_COST[name] = 2;
        this.voiceBank.set(e.key, { ...e, duration: buf.duration });
        ok += 1;
      } catch (err) {
        this.voiceErrors.push({ file: e.file, message: err && err.message });
      }
    }));
    this.voicesReady = ok > 0;
    return ok;
  }

  /**
   * 载入实录音效包，**逐条盖掉同名的合成配方**。
   *
   * 清单由 Script_SfxBake.mjs 生成（Audio/Sfx/Data_SfxManifest.json），
   * 一个 cue 可以有好几个变体文件（脚步、砖屑这类每秒都在响的必须多变体）。
   *
   * 三条刻意的设计：
   *   1. **逐 cue 失败**。一条载不到只丢那一条，其余照盖 —— 半套采样 + 半套合成
   *      仍然是完整的一场仗；整包 all-or-nothing 才是真的会静音。
   *   2. **盖不上去不留痕迹是不行的**。失败计入 sfxErrors，编辑器那一栏会显示，
   *      不然「怎么听着还是合成的」这种问题没人查得出来。
   *   3. **NODE_COST 要跟着改**。采样版一发只有 1—2 个节点（合成版十几个），
   *      不改的话预算闸会按合成版的开销白白丢掉大量声音。
   *
   * @returns {Promise<number>} 成功盖住的 cue 数
   */
  async LoadSfxPack(base = SFX_BASE) {
    if (!this.ctx || this.disposed) return 0;
    let manifest = null;
    try {
      const res = await fetch(base + "Data_SfxManifest.json");
      if (!res.ok) throw new Error("HTTP " + res.status);
      manifest = await res.json();
    } catch (err) {
      this.sfxErrors.push({ file: "Data_SfxManifest.json", message: err && err.message });
      return 0;
    }
    this.sfxManifest = manifest;
    const entries = Object.entries(manifest.cues || {});
    let ok = 0;
    await Promise.all(entries.map(async ([cue, entry]) => {
      const files = entry.files || (entry.file ? [entry.file] : []);
      try {
        const buffers = await Promise.all(files.map(async (file) => {
          const res = await fetch(base + file);
          if (!res.ok) throw new Error(file + " HTTP " + res.status);
          return this.ctx.decodeAudioData(await res.arrayBuffer());
        }));
        if (!buffers.length) throw new Error("清单里没有文件");
        if (cue === "bugleTone") {
          // 军号是**一个音**，不是一条音效：拿它排 BUGLE_CHARGE 的动机去盖 bugleCharge。
          RECIPES.bugleCharge = BugleSampleRecipe(buffers[0], entry.toneHz || 495.5);
          MIX_GAIN.bugleCharge = SAMPLE_MIX.bugleCharge ?? 1;
          NODE_COST.bugleCharge = BUGLE_CHARGE.length * 2 + 2;
          this.sampleCues.add("bugleCharge");
        } else {
          if (!RECIPES[cue]) throw new Error("没有同名配方，盖不上去");
          RECIPES[cue] = SampleRecipe(buffers, cue);
          MIX_GAIN[cue] = SAMPLE_MIX[cue] ?? 1;
          NODE_COST[cue] = SAMPLE_BURST[cue] ? 8 : 2;
          this.sampleCues.add(cue);
        }
        ok += 1;
      } catch (err) {
        this.sfxErrors.push({ file: files[0] || cue, message: err && err.message });
      }
    }));
    this.sfxReady = ok > 0;
    return ok;
  }

  /**
   * 喊一句。按 kind 从声库里挑，自带节流。
   *
   * 节流不是性能考虑，是**听感**考虑：一条街上五十个人，不加闸门就会出现
   * 二十个人同时喊"卧倒"的滑稽场面。两层闸：
   *   · 全局 0.55 s —— 任何时刻场上最多一句人声压着另一句的尾巴
   *   · 同类 4.5 s  —— 同一句话不会连着来第二遍
   * 玩家自己那句（priority）不受全局闸限制，但仍受同类闸限制。
   */
  Bark(kind, { position = null, volume = 1, priority = false, seed = 0, key = null,
    side = "nra" } = {}) {
    if (!this.ctx || this.disposed || !this.voicesReady || this.voiceMute) return null;
    const now = this.ctx.currentTime;
    if (!priority && now - this.lastBarkAt < 0.55) return null;
    // 同类闸的键带上阵营：中国兵刚喊过「鬼子摸拢来了」，不该把日本兵的
    // 「てきだ！」一起闸掉 —— 那是两个人在对喊，不是同一句复读。
    const kindKey = side + ":" + kind;
    if (now - (this.lastBarkKindAt.get(kindKey) || -99) < 4.5) return null;

    const pool = [];
    for (const e of this.voiceBank.values()) {
      // 阵营先过滤。声库里中日两套并存，挑错阵营就是日本兵喊中文（或反过来），
      // 那比没有配音更糟。未标 side 的一律按中方处理（旧条目的兼容默认）。
      if ((e.side || "nra") !== side) continue;
      // 指定了 key 就只认那一句（下命令要喊对应的那句，不能"从 rally 里随便挑一句"）
      if (key) { if (e.key === key) pool.push(e); continue; }
      // event 句**有前提条件**，不许被同类随机抽中 —— 只能由知道前提的调用方用 key 点名。
      // 滕县攻城日军无战车（34 辆九四式全配属给打临城的第 63 联队，见 docs/Data_TengxianCity.md），
      // 一个兵随机喊出「战车！战车碾拢来了！」就是穿帮；同理，手里还有子弹的兵不该喊
      // 「手榴弹！莫得了！」，全班有枪时不该被喊「莫得枪的，跟到走」。
      // 这道闸比在每个关卡里挨个屏蔽可靠：漏配的默认行为是**不喊**，而不是乱喊。
      if (e.event) continue;
      if (e.kind === kind) pool.push(e);
    }
    if (!pool.length) return null;
    // 确定性挑选：种子给调用方（通常是士兵 id），同一个人倾向于喊同样的话，
    // 但不同的人不一样 —— 这比纯随机更像一个班。
    const rng = Mulberry32((HashString(kind) ^ Math.imul(seed + this.barkCounter, 2654435761)) >>> 0);
    this.barkCounter += 1;
    const pick = pool[Math.floor(rng() * pool.length) % pool.length];
    // ±4% 变调：把 6 个音色摊成一个班。种子固定 => 同一个兵的嗓子是稳定的。
    const pitch = 0.96 + Mulberry32((seed * 2654435761) >>> 0)() * 0.08;

    this.lastBarkAt = now;
    this.lastBarkKindAt.set(kindKey, now);
    return this.Play("voice." + pick.key, { position, volume, pitch, priority });
  }

  SetListener(camera) {
    if (!this.ctx || !camera || !camera.matrixWorld) return;
    const e = camera.matrixWorld.elements;
    const px = e[12], py = e[13], pz = e[14];
    // three 的相机看向自身 -Z，所以 forward 是第三列取反。
    const fx = -e[8], fy = -e[9], fz = -e[10];
    const ux = e[4], uy = e[5], uz = e[6];
    this.listenerPos.x = px; this.listenerPos.y = py; this.listenerPos.z = pz;

    const L = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (L.positionX) {
      // setTargetAtTime 而不是 setValueAtTime：玩家快速转身时硬跳会「咔」一下。
      const tau = 0.012;
      L.positionX.setTargetAtTime(px, t, tau);
      L.positionY.setTargetAtTime(py, t, tau);
      L.positionZ.setTargetAtTime(pz, t, tau);
      L.forwardX.setTargetAtTime(fx, t, tau);
      L.forwardY.setTargetAtTime(fy, t, tau);
      L.forwardZ.setTargetAtTime(fz, t, tau);
      L.upX.setTargetAtTime(ux, t, tau);
      L.upY.setTargetAtTime(uy, t, tau);
      L.upZ.setTargetAtTime(uz, t, tau);
    } else if (L.setPosition) {
      // 老 Safari 只有这套废弃 API。
      L.setPosition(px, py, pz);
      L.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  // --- 播放 ---------------------------------------------------------------

  /**
   * 播放一个音效。
   * @param {string} name        RECIPES 里的名字
   * @param {object} opts
   *        position {x,y,z}     世界坐标，给 PannerNode；null = 非空间化（UI/第一人称）
   *        pan      -1..1       非空间化时的立体声位置（环境床用，比 HRTF 便宜得多）
   *        volume   增益倍率
   *        pitch    频率倍率（同一把枪逐发做 ±3% 抖动，二十条枪才不像一条）
   *        delay    延后多少秒开始
   *        burst    连发武器的点射发数
   */
  /**
   * 开一枪：按距离在**两段不同录音**之间等功率交叉淡入（见 FAR_CUE 的注释）。
   *
   * 为什么等功率（cos/sin）而不是线性（t / 1−t）：交叉带中点上线性淡入的两路
   * 各 0.5，功率和是 0.5²+0.5² = 0.5 —— 走到 87 m 会**塌下去 3 dB**，
   * 听感是「远处那一枪走到半路声音先小了一下再回来」。cos/sin 的平方和恒为 1。
   *
   * 没有远场素材的枪（zb26/type11/type92）原样落回 Play()，行为不变。
   * 玩家自己那一枪 distance = 0，永远纯近场。
   *
   * 注意这里**不加声速延迟**（300 m 该晚 0.87 s 到）。那是另一件事，
   * 会动到所有「开枪→听见」的时序断言，这一轮不碰；rifleIjaFar 那条素材本身
   * 就是来弹视角录的，弹头掠过在前、枪声后到，先靠素材把这层意思带出来。
   */
  PlayGunshot(name, opts = {}) {
    const far = FAR_CUE[name];
    if (!far || !opts.position) return this.Play(name, opts);
    const dx = opts.position.x - this.listenerPos.x;
    const dy = opts.position.y - this.listenerPos.y;
    const dz = opts.position.z - this.listenerPos.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const t = Clamp((d - GUN_NEAR_M) / (GUN_FAR_M - GUN_NEAR_M), 0, 1);
    const base = opts.volume ?? 1;
    const nearGain = Math.cos(t * Math.PI * 0.5);
    const farGain = Math.sin(t * Math.PI * 0.5);
    let voice = null;
    // 0.02 的门槛是省节点：低于这个增益的那一路在混音里听不见，
    // 但仍然要占满一条链的预算（rifleNra 一条 16 个节点）。
    if (nearGain > 0.02) voice = this.Play(name, { ...opts, volume: base * nearGain });
    if (farGain > 0.02) {
      const v = this.Play(far, { ...opts, volume: base * farGain });
      voice = voice || v;
    }
    return voice;
  }

  Play(name, { position = null, volume = 1, pitch = 1, delay = 0, pan = 0, burst = null, priority = false } = {}) {
    // priority：玩家自己的枪永远要响。实测 59 个兵在打时 liveNodes 峰值 118/120，
    // AI 枪声丢 40.4%，**玩家自己的枪也丢了 8.3%** —— 因为玩家和 59 个兵共用
    // "rifleNra" 这一个去重 key，22 ms 窗口内谁先谁得。
    // 开出一枪完全没有声音是最伤沉浸感的一类 bug：玩家会以为自己没打出去。
    if (!this.ctx || this.disposed) return null;
    const recipe = RECIPES[name];
    if (!recipe) return null;

    const ctx = this.ctx;
    const now = ctx.currentTime;

    // 同帧齐射去重（见文件头 DEDUPE_S 的注释）。
    const last = this.lastPlayAt.get(name);
    if (last !== undefined && now - last < DEDUPE_S && delay === 0) return null;
    this.lastPlayAt.set(name, now);

    // 预算闸门：按实测开销**发声前**判断。连发的开销随点射长度涨一点。
    // 连发的开销与点射长度无关（整条点射共用一套链，见 GunAuto），所以查表就够。
    const cost = NODE_COST[name] ?? DEFAULT_COST;
    const ceiling = LOW_PRIORITY.has(name) ? NODE_BUDGET * LOW_PRIORITY_HEADROOM : NODE_BUDGET;
    if (this.liveNodes + cost > ceiling) return null;

    // 距离：决定 HRTF 开不开、空气低通压多狠、混响给多少。
    let distance = 0;
    if (position) {
      const dx = position.x - this.listenerPos.x;
      const dy = position.y - this.listenerPos.y;
      const dz = position.z - this.listenerPos.z;
      distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    const t = now + Math.max(0, delay) + 0.005;   // 留 5 ms 调度余量，免得首音被吃
    // 种子 = 名字哈希 ^ 播放序号：确定性，但同一个音效每次不一样。
    const rng = Mulberry32((HashString(name) ^ Math.imul(this.playCounter += 1, 2654435761)) >>> 0);
    const v = new Voice(this, t, pitch, rng);
    v.burst = burst ?? BURST_DEFAULT[name] ?? null;

    // 源 gain（干声起点）。混音表在这儿乘进去，配方里不必关心整体平衡。
    const src = v.Gain(volume * (MIX_GAIN[name] ?? 1));
    v.out = src;

    // 混响 send 在 Panner **之前**分出去（文件头坑 1）。
    // 干湿比是两层：配方定「这个声音本身有多少尾巴」，距离定「离得远尾巴占比更高」。
    // 早先是让距离直接写 wet.gain，结果被配方后写的值覆盖掉了 —— 远处的枪和
    // 眼前的枪混响一样多，「远」就完全听不出来。改成事后乘一个 wetScale。
    const wet = v.Gain(0.25);
    v.wetGain = wet;
    src.connect(wet);
    wet.connect(this.reverbs[this.space] || this.reverbs.street);

    if (position) {
      // 空气吸收：距离越远高频掉得越快。20 m 上还有 8 kHz，200 m 上只剩 1 kHz 出头。
      const airHz = Clamp(18000 / (1 + distance * 0.09), 700, 20000);
      const air = v.Filter("lowpass", airHz, 0.7);
      src.connect(air);
      const panner = v.Own(ctx.createPanner());
      // HRTF 很贵，25 m 以外听不出方位差别，改用 equalpower（文件头坑 3）。
      panner.panningModel = distance < 25 ? "HRTF" : "equalpower";
      panner.distanceModel = "inverse";
      panner.refDistance = 3.5;
      panner.maxDistance = 600;
      panner.rolloffFactor = 0.9;
      if (panner.positionX) {
        panner.positionX.value = position.x;
        panner.positionY.value = position.y;
        panner.positionZ.value = position.z;
      } else if (panner.setPosition) {
        panner.setPosition(position.x, position.y, position.z);
      }
      air.connect(panner).connect(this.sfxBus);
      // 远处的声音混响占比更高（直达声按距离衰减，混响场基本不衰减）。
      v.wetScale = 1 + Clamp(distance * 0.03, 0, 1.6);
    } else if (pan !== 0 && ctx.createStereoPanner) {
      const sp = v.Own(ctx.createStereoPanner());
      sp.pan.value = Clamp(pan, -1, 1);
      src.connect(sp).connect(this.sfxBus);
    } else {
      src.connect(this.sfxBus);
    }

    try {
      recipe(this, v);
    } catch (err) {
      // 配方里一个参数越界不该让整局静音，吞掉就是了。但**必须留下痕迹**：
      // 静默失败的音效是最难查的 bug —— 听不见的东西没人会去看调用栈。
      this.lastError = { name, message: err && err.message, at: now };
      this.errorCount += 1;
      this.FreeVoice(v);
      return null;
    }
    wet.gain.value = Clamp01(wet.gain.value * v.wetScale);
    this.ReleaseVoice(v, v.life);
    return v;
  }

  /** 到点断开所有节点并归还预算。**唯一的防泄漏出口**。 */
  ReleaseVoice(v, seconds) {
    this.pendingVoices.add(v);
    const ms = Math.max(0, seconds * 1000) + 220;
    const id = setTimeout(() => {
      this.timers.delete(id);
      this.FreeVoice(v);
    }, ms);
    this.timers.add(id);
  }

  FreeVoice(v) {
    this.pendingVoices.delete(v);
    for (let i = 0; i < v.nodes.length; i += 1) {
      try { v.nodes[i].disconnect(); } catch (err) { /* 已断开 */ }
    }
    this.liveNodes = Math.max(0, this.liveNodes - v.nodes.length);
    v.nodes.length = 0;
  }

  /** 延后执行，句柄统一登记，Dispose 时一次清掉。 */
  Later(ms, fn) {
    const id = setTimeout(() => { this.timers.delete(id); if (!this.disposed) fn(); }, ms);
    this.timers.add(id);
    return id;
  }

  // --- 总线控制 -----------------------------------------------------------

  SetMasterVolume(value) {
    this.masterVolume = Clamp01(value);
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // 20 ms 斜坡：直接赋值会在正在响的声音上留一道「咔」。
    this.masterGain.gain.setTargetAtTime(this.masterVolume, t, 0.02);
  }

  /**
   * 玩家的分路音量。kind: "sfx" | "music" | "ambience"。
   * 写的是各自的 *User 节点，与系统自己的配平（cue level、duck）互不干扰。
   */
  SetBusVolume(kind, value) {
    const v = Clamp01(value);
    if (!(kind in this.mix)) return;
    this.mix[kind] = v;
    const node = { sfx: this.sfxUser, music: this.musicUser, ambience: this.ambienceUser }[kind];
    if (!node || !this.ctx) return;
    node.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  /** 把背景层（环境床 + 音乐）就地停掉。暂停与「退出音效编辑器时游戏还停着」都走它。 */
  StopBackground() {
    this.StopAmbience();
    this.StopMusic();
  }

  /**
   * 暂停 / 恢复**背景层**。
   *
   * 为什么非得有这一条：暂停玩法（Frame() 提前返回）**一点也拦不住声音**。
   * 环境床是一张自己在跑的 WebAudio 节点图 + 一个 400 ms 的 setTimeout 调度器，
   * 每一轮按概率撒远处的枪炮；音乐同理。玩法停了它们照响 ——
   * 表现就是「我暂停了，背景里的枪声还在」。
   *
   * 这里只停背景层，**不 suspend 整个 AudioContext**：音效编辑器要在暂停时试听，
   * 过场编辑器要听得见过场自己的音效。已经在飞的一次性音（最长两秒的尾巴）
   * 让它自己响完，硬掐会「咔」一声。
   */
  SetPaused(on) {
    const next = !!on && this.pauseSilence !== false;
    if (next === this.paused) return this.paused;
    this.paused = next;
    if (next) {
      this.pausedState = { ambience: this.ambiencePreset, music: this.musicCue };
      this.StopBackground();
    } else {
      const saved = this.pausedState || {};
      this.pausedState = null;
      if (saved.ambience && saved.ambience !== "silence") this.Ambience(saved.ambience);
      if (saved.music) this.Music(saved.music);
    }
    return this.paused;
  }

  /** 台词/爆炸时压低音乐与环境。amount = 压掉的比例（0.6 就是只剩四成）。 */
  Duck(seconds = 1.0, amount = 0.6) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const g = this.duckGain.gain;
    const level = Clamp01(1 - amount);
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(g.value, FLOOR), t);
    g.linearRampToValueAtTime(Math.max(level, FLOOR), t + 0.06);   // 快压
    g.setValueAtTime(Math.max(level, FLOOR), t + Math.max(0.1, seconds));
    g.linearRampToValueAtTime(1, t + Math.max(0.1, seconds) + 0.55); // 慢放（快放会「呼」一下）
  }

  /**
   * 爆炸后的耳鸣/闷响。
   * 两件事同时发生：主总线低通掉到几百 Hz（外界一下子变闷），
   * 同时脑子里留一条 4 kHz 的正弦慢慢衰减。缺任何一半都不像被震过。
   * 正弦接在耳鸣低通**之后**，不然它自己也会被压掉。
   */
  Deafen(seconds = 0.4) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const f = this.deafFilter.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(Math.max(f.value, 200), t);
    f.exponentialRampToValueAtTime(520, t + 0.03);
    f.setValueAtTime(520, t + seconds);
    f.exponentialRampToValueAtTime(20000, t + seconds + 0.9);

    if (this.liveNodes + 4 > NODE_BUDGET) return;   // 预算紧就只做闷响
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 4000;
    const g = ctx.createGain();
    const total = seconds + 1.4;
    g.gain.setValueAtTime(FLOOR, t);
    g.gain.linearRampToValueAtTime(0.055, t + 0.02);
    g.gain.exponentialRampToValueAtTime(FLOOR, t + total);
    // 接在耳鸣低通**之后** —— 接在前面的话它自己也被压掉，就没有「脑子里那声」了。
    osc.connect(g).connect(this.outGain);
    osc.start(t);
    osc.stop(t + total + 0.05);
    this.liveNodes += 2;
    // 借 voice 的账本回收：这样 Dispose 里的 pendingVoices 也能把它拆掉，
    // 否则爆炸声正响着退出关卡，这两个节点就永远挂在总线上了。
    this.ReleaseVoice({ nodes: [osc, g] }, total);
  }

  // --- 环境床 -------------------------------------------------------------

  /**
   * 切环境。风是常驻的循环层，零星事件由一个 0.4 秒粒度的调度器随机撒 ——
   * **不许贴循环样本**：三十秒的战场循环听两遍就露馅，玩家会开始记「那声炮响
   * 又来了」。撒出来的每一发都是现算的枪声，永远不重复。
   */
  Ambience(preset) {
    const name = AMBIENCE_PRESETS[preset] ? preset : "silence";
    this.ambiencePreset = name;
    if (!this.ctx) return;
    this.StopAmbience();
    const cfg = AMBIENCE_PRESETS[name];
    this.space = cfg.space || "street";
    if (name === "silence") return;

    const ctx = this.ctx;
    const t = ctx.currentTime;
    const own = (n) => { this.ambienceNodes.push(n); this.liveNodes += 1; return n; };

    // --- 风：棕噪 + 缓慢移动的低通。频率不动的话就是「白噪声开着」，不是风。
    if (cfg.wind > 0) {
      const src = own(ctx.createBufferSource());
      src.buffer = this.NoiseBuffer("brown");
      src.loop = true;
      const lp = own(ctx.createBiquadFilter());
      lp.type = "lowpass";
      lp.frequency.value = cfg.windCut;
      lp.Q.value = 0.6;
      const lfo = own(ctx.createOscillator());
      lfo.type = "sine";
      lfo.frequency.value = 0.07;                    // 十几秒一次的呼吸
      const lfoGain = own(ctx.createGain());
      lfoGain.gain.value = cfg.windCut * 0.45;
      lfo.connect(lfoGain).connect(lp.frequency);
      const g = own(ctx.createGain());
      g.gain.setValueAtTime(FLOOR, t);
      g.gain.linearRampToValueAtTime(cfg.wind, t + 1.8);   // 淡入，别硬切
      src.connect(lp).connect(g).connect(this.ambienceBus);
      src.start(t);
      lfo.start(t);
    }

    // --- 虫声：两条高频振荡器被一条 ~30 Hz 的方波门断成「唧唧唧」。
    // 逐只虫去调度太贵（一片虫要几十个 voice），做成床最划算。
    if (cfg.crickets) {
      // 慢门（一阵一阵地叫，不是一直响）两层共用一条 —— 夜景的环境床是常驻开销，
      // 省下来的每个节点都直接变成能同时响的枪声。
      const slow = own(ctx.createOscillator());
      slow.type = "sine";
      slow.frequency.value = 0.11;
      slow.start(t);
      for (let i = 0; i < 2; i += 1) {
        const osc = own(ctx.createOscillator());
        osc.type = "sine";
        osc.frequency.value = 4300 + i * 620;
        const trill = own(ctx.createOscillator());
        trill.type = "square";
        trill.frequency.value = 27 + i * 5;
        const trillGain = own(ctx.createGain());
        trillGain.gain.value = 0.5;
        const vca = own(ctx.createGain());
        vca.gain.value = 0.5;
        trill.connect(trillGain).connect(vca.gain);
        const slowGain = own(ctx.createGain());
        slowGain.gain.value = cfg.crickets * (0.6 - i * 0.15);   // 两层深度不同才不同步
        const out = own(ctx.createGain());
        out.gain.value = cfg.crickets * 0.4;
        slow.connect(slowGain).connect(out.gain);
        osc.connect(vca).connect(out).connect(this.ambienceBus);
        osc.start(t); trill.start(t);
      }
    }

    this.ScheduleAmbienceEvent();
  }

  /** 环境事件调度：每 0.4 秒掷一次骰子。间隔的不规则性就是「零星」的来源。 */
  ScheduleAmbienceEvent() {
    const cfg = AMBIENCE_PRESETS[this.ambiencePreset];
    if (!cfg || !this.ctx) return;
    this.ambienceTimer = this.Later(400, () => {
      const c = AMBIENCE_PRESETS[this.ambiencePreset];
      if (!c) return;
      for (let i = 0; i < c.events.length; i += 1) {
        const ev = c.events[i];
        if (this.ambienceRng() >= ev.chance) continue;
        this.Play(ev.name, {
          volume: ev.volume * (0.7 + this.ambienceRng() * 0.6),
          // 远处的声音在立体声里撒开，别都堆在正中。
          pan: this.ambienceRng() * 2 - 1,
          pitch: 0.9 + this.ambienceRng() * 0.2,
          delay: this.ambienceRng() * 0.35,
          burst: ev.burst ?? undefined,
        });
      }
      // 鸟：黎明专属，一小段上滑的啾。
      if (c.birds && this.ambienceRng() < 0.09) this.Bird();
      this.ScheduleAmbienceEvent();
    });
  }

  /** 一声鸟叫：两三个快速上滑的短音。用振荡器扫频比噪声更像鸟。 */
  Bird() {
    if (!this.ctx || this.liveNodes + 8 > NODE_BUDGET) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + this.ambienceRng() * 0.2;
    const nodes = [];
    const count = 2 + Math.floor(this.ambienceRng() * 2);
    const base = 2400 + this.ambienceRng() * 1600;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) { pan.pan.value = this.ambienceRng() * 2 - 1; pan.connect(this.ambienceBus); nodes.push(pan); }
    for (let i = 0; i < count; i += 1) {
      const at = t + i * 0.11;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      const f0 = base * (0.9 + this.ambienceRng() * 0.3);
      osc.frequency.setValueAtTime(f0, at);
      osc.frequency.exponentialRampToValueAtTime(f0 * 1.5, at + 0.05);
      osc.frequency.exponentialRampToValueAtTime(f0 * 1.1, at + 0.09);
      const g = ctx.createGain();
      Hit(g.gain, at, 0.045, 0.008, 0.08);
      osc.connect(g).connect(pan || this.ambienceBus);
      osc.start(at); osc.stop(at + 0.14);
      nodes.push(osc, g);
    }
    this.liveNodes += nodes.length;
    // 同 Deafen：挂进 pendingVoices，否则黎明关卡切场时这一串鸟会留在总线上。
    this.ReleaseVoice({ nodes }, 0.7);
  }

  StopAmbience() {
    if (this.ambienceTimer) { clearTimeout(this.ambienceTimer); this.timers.delete(this.ambienceTimer); this.ambienceTimer = 0; }
    for (const n of this.ambienceNodes) {
      try { if (n.stop) n.stop(); } catch (err) { /* 没 start 过 */ }
      try { n.disconnect(); } catch (err) { /* ok */ }
    }
    this.liveNodes = Math.max(0, this.liveNodes - this.ambienceNodes.length);
    this.ambienceNodes.length = 0;
  }

  // --- 音乐 ---------------------------------------------------------------

  /**
   * 切音乐 cue。null = 停。
   * 用「前瞻调度」：定时器只负责把未来 0.6 秒内的音排进 WebAudio 的时钟，
   * 真正的发声时间由 ctx.currentTime 决定 —— setTimeout 的抖动有十几毫秒，
   * 直接拿它触发的话，节奏会一直晃。
   */
  Music(cue) {
    const name = MUSIC_CUES[cue] ? cue : null;
    this.musicCue = name;
    if (!this.ctx) return;
    this.StopMusic();
    if (!name) return;
    this.musicStep = 0;
    this.musicNextTime = this.ctx.currentTime + 0.15;
    this.musicBus.gain.cancelScheduledValues(this.ctx.currentTime);
    this.musicBus.gain.setValueAtTime(FLOOR, this.ctx.currentTime);
    this.musicBus.gain.linearRampToValueAtTime(MUSIC_CUES[name].level, this.ctx.currentTime + 2.0);
    this.MusicTick();
  }

  MusicTick() {
    if (!this.ctx || !this.musicCue) return;
    const cfg = MUSIC_CUES[this.musicCue];
    const beat = 60 / cfg.bpm;
    const horizon = this.ctx.currentTime + 0.6;
    while (this.musicNextTime < horizon) {
      this.MusicStep(cfg, this.musicStep, this.musicNextTime, beat);
      this.musicStep += 1;
      this.musicNextTime += beat;
    }
    this.musicTimer = this.Later(180, () => this.MusicTick());
  }

  MusicStep(cfg, step, t, beat) {
    const bar = cfg.bass.length;
    const i = step % bar;
    // 每四小节换一次和声底：一直不动会腻，动太多就成了配乐。
    const phrase = Math.floor(step / (bar * 4)) % 2;
    const shift = phrase === 0 ? 0 : -2;

    if (cfg.bass[i] !== null && cfg.bass[i] !== undefined) {
      this.BassNote(t, SemiToHz(cfg.bass[i] + shift), beat * (cfg.drum ? 0.9 : 3.4));
    }
    if (cfg.motif && cfg.motif[i] !== null && cfg.motif[i] !== undefined) {
      const hz = SemiToHz(cfg.motif[i] + shift + 24);
      this.BrassSimple(t + beat * 0.02, hz, beat * (cfg.drum ? 0.55 : 1.6), cfg.drum ? 0.16 : 0.09);
    }
    if (cfg.solo && cfg.solo[i] !== null && cfg.solo[i] !== undefined) {
      this.SoloNote(t, SemiToHz(cfg.solo[i] + shift + 24), beat * 3.2);
    }
    if (cfg.drum) {
      // 进行曲骨架：重拍在 1、3，附点前置的小军鼓在 2、4 的后半拍。
      if (i % 2 === 0) this.MusicDrum(t, "low");
      else this.MusicDrum(t, "high");
      if (i % 2 === 1) this.MusicDrum(t + beat * 0.5, "high", 0.5);
    }
  }

  /** 低音提琴式持续低音：泛音少的波 + 低通 + 慢起慢收。 */
  BassNote(t, hz, dur) {
    if (!this.ctx || this.liveNodes + 5 > NODE_BUDGET) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(this.Wave("bass"));
    osc.frequency.value = hz;
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = hz * 0.5;         // 低八度衬底，给「弓压在弦上」的重量
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(hz * 6, t);
    lp.frequency.exponentialRampToValueAtTime(hz * 2.2, t + dur * 0.7);
    lp.Q.value = 0.9;
    const g = ctx.createGain();
    Swell(g.gain, t, 0.34, dur * 0.22, dur * 0.4, dur * 0.5);
    osc.connect(lp); osc2.connect(lp);
    lp.connect(g).connect(this.musicBus);
    osc.start(t); osc2.start(t);
    osc.stop(t + dur + 0.6); osc2.stop(t + dur + 0.6);
    this.TrackMusicNodes([osc, osc2, lp, g], dur + 0.9);
  }

  /** 单音动机用的简化铜管（一个振荡器 + 亮度包络）。 */
  BrassSimple(t, hz, dur, level) {
    if (!this.ctx || this.liveNodes + 4 > NODE_BUDGET) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(this.Wave("brass"));
    osc.frequency.value = hz;
    const bp = ctx.createBiquadFilter();
    bp.type = "lowpass";
    // 铜管的「亮」是起音时冲上去再回落，恒定亮度听着就是电子管风琴。
    bp.frequency.setValueAtTime(hz * 2, t);
    bp.frequency.linearRampToValueAtTime(hz * 8, t + 0.06);
    bp.frequency.exponentialRampToValueAtTime(hz * 3, t + dur);
    bp.Q.value = 1.1;
    const g = ctx.createGain();
    Swell(g.gain, t, level, 0.035, dur * 0.5, dur * 0.5);
    osc.connect(bp).connect(g).connect(this.musicBus);
    osc.start(t); osc.stop(t + dur + 0.4);
    this.TrackMusicNodes([osc, bp, g], dur + 0.7);
  }

  /** 独奏长音（战后）：弦色 + 慢揉弦，一件乐器，别的什么都不加。 */
  SoloNote(t, hz, dur) {
    if (!this.ctx || this.liveNodes + 6 > NODE_BUDGET) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(this.Wave("string"));
    osc.frequency.value = hz;
    const vib = ctx.createOscillator();
    vib.type = "sine";
    vib.frequency.value = 4.6;
    const vibGain = ctx.createGain();
    // 揉弦要**延后**进来：一上来就抖是合成器，人是先出音再揉。
    vibGain.gain.setValueAtTime(0, t);
    vibGain.gain.linearRampToValueAtTime(14, t + dur * 0.35);
    vib.connect(vibGain).connect(osc.detune);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = hz * 2.6;
    bp.Q.value = 1.6;
    const g = ctx.createGain();
    Swell(g.gain, t, 0.3, dur * 0.3, dur * 0.25, dur * 0.6);
    osc.connect(bp).connect(g).connect(this.musicBus);
    osc.start(t); vib.start(t);
    osc.stop(t + dur + 0.8); vib.stop(t + dur + 0.8);
    this.TrackMusicNodes([osc, vib, vibGain, bp, g], dur + 1.1);
  }

  /** 进行曲的鼓骨架。低 = 大鼓，高 = 小鼓（噪声）。 */
  MusicDrum(t, kind, scale = 1) {
    if (!this.ctx || this.liveNodes + 4 > NODE_BUDGET) return;
    const ctx = this.ctx;
    if (kind === "low") {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(110, t);
      osc.frequency.exponentialRampToValueAtTime(44, t + 0.14);
      const g = ctx.createGain();
      Hit(g.gain, t, 0.34 * scale, 0.003, 0.2);
      osc.connect(g).connect(this.musicBus);
      osc.start(t); osc.stop(t + 0.3);
      this.TrackMusicNodes([osc, g], 0.4);
    } else {
      const src = ctx.createBufferSource();
      src.buffer = this.NoiseBuffer("white");
      const hp = ctx.createBiquadFilter();
      hp.type = "bandpass";
      hp.frequency.value = 1900;
      hp.Q.value = 0.8;
      const g = ctx.createGain();
      Hit(g.gain, t, 0.13 * scale, 0.002, 0.11);
      src.connect(hp).connect(g).connect(this.musicBus);
      src.start(t, 0.5, 0.2); src.stop(t + 0.2);
      this.TrackMusicNodes([src, hp, g], 0.35);
    }
  }

  TrackMusicNodes(nodes, seconds) {
    this.liveNodes += nodes.length;
    this.musicNodes.push(...nodes);
    this.Later(seconds * 1000 + 200, () => {
      // **只扣还在册的那些**。切 cue 时 StopMusic 已经把整批扣过一次了，
      // 这里再按 nodes.length 扣一遍，liveNodes 会一路飘向 0 ——
      // 预算闸门随之失效，切几次音乐之后同屏音效就无限制了。
      let freed = 0;
      for (const n of nodes) {
        const idx = this.musicNodes.indexOf(n);
        if (idx < 0) continue;
        this.musicNodes.splice(idx, 1);
        try { n.disconnect(); } catch (err) { /* ok */ }
        freed += 1;
      }
      this.liveNodes = Math.max(0, this.liveNodes - freed);
    });
  }

  StopMusic() {
    if (this.musicTimer) { clearTimeout(this.musicTimer); this.timers.delete(this.musicTimer); this.musicTimer = 0; }
    for (const n of this.musicNodes) {
      try { if (n.stop) n.stop(); } catch (err) { /* 没 start 过 */ }
      try { n.disconnect(); } catch (err) { /* ok */ }
    }
    this.liveNodes = Math.max(0, this.liveNodes - this.musicNodes.length);
    this.musicNodes.length = 0;
  }

  /**
   * 整条号声。**军号是单声部乐器，所以整条只用一个振荡器**，音高、亮度、包络
   * 全部排在同一组自动化事件上 —— 逐音各建一套是 40 个节点，这样是 3 个。
   * 号嘴的特征在两处：起音亮度的过冲（那一下「破」），以及起音时几个音分的
   * 不稳（吹号的人不是节拍器）。少了这两样就是萨克斯风或者合成器方波。
   */
  BugleLine(v, notes, level) {
    const t0 = v.t;
    const osc = v.Osc(this.Wave("brass"), v.F(notes[0][1]));
    const lp = v.Filter("lowpass", v.F(notes[0][1] * 2), 1.2);
    const g = v.Gain(FLOOR);
    osc.connect(lp).connect(g).connect(v.out);
    let end = 0;
    for (let i = 0; i < notes.length; i += 1) {
      const dt = notes[i][0], hz = v.F(notes[i][1]), dur = notes[i][2];
      const at = t0 + dt;
      osc.frequency.setValueAtTime(hz, at);
      lp.frequency.setValueAtTime(hz * 1.6, at);
      lp.frequency.linearRampToValueAtTime(hz * 9, at + Math.min(0.045, dur * 0.4));
      lp.frequency.exponentialRampToValueAtTime(hz * 4, at + dur);
      osc.detune.setValueAtTime(v.R(-12, 12), at);
      osc.detune.linearRampToValueAtTime(0, at + Math.min(0.09, dur * 0.7));
      // 包络必须整个装进这个音的时长里：越界的话下一个音的 setValueAtTime 会
      // 从中间截断上一条斜坡，出来是一串「咔」。
      Swell(g.gain, at, level, dur * 0.22, dur * 0.45, dur * 0.32);
      end = Math.max(end, dt + dur);
    }
    v.Start(osc, t0, end + 0.12);
  }
}

export default AudioEngine;
