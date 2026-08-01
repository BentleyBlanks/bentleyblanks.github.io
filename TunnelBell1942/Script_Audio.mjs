// 《地道战 · 钟声》—— 音频层。三层结构：环境 / 紧张 / 母题。
//
// 全部 WebAudio 现场合成，不加载任何音频文件，不 import three.js。
// 唯一依赖是 Data_Contract.mjs（纯数值），所以这个文件也能在纯 Node 里被 import。
//
// 设计立场（AGENTS.md 第 7.2 节）：
//   · 没有旋律性 BGM。这个题材配不上罐头进行曲，留白比配乐有力。
//   · 静音是工具：钟响前的那一拍、幕落、反击得手，都靠"突然的静"来立仪式感。
//   · 地表与地下是两个世界，耳朵必须能分得出来——不是换个音色，是换整套空间。
//   · 被发现的瞬间要有一记"刺"，那是玩家唯一的听觉警报，不许做成渐变。
//
// 工程红线：
//   · 不许 Math.random()（噪声用固定种子预生成的 buffer，随机化用固定抖动表）。
//   · Sync 每帧不许分配对象（声部链路是预分配的池，参数写入有节流）。
//   · 浏览器不支持 WebAudio → 静默返回空壳，绝不让游戏起不来。

import { Approach, Clamp } from "./Data_Contract.mjs";

// ───────────────────────────── 常量表（模块级，只分配一次）─────────────────────────────

/** 钟——全作的音乐母题。三次敲钟必须能听出区别，区别做在四个地方：
 *  基频、分音权重与余韵长度、有没有"敲击的脆"（strike）、以及回声。
 *
 *  partials 每项 = [频率比, 权重, 余韵秒数, 失谐音分]。
 *  比值刻意不是整数倍——铁钟是不谐和的，整数倍会立刻听成"乐器"而不是"铁"。 */
const BELL_VARIANTS = {
  // 第一幕 · 示警：高老忠用命换的三下。尖、急，高分音全开，余韵短促。
  alert: {
    root: 524,
    spacing: 0.76,
    gain: 1.0,
    attack: 0.004,
    highpass: 210,
    lowpass: 9000,
    strike: 0.85,          // 木槌砸在铁上的"脆"
    strikeHz: 3400,
    echoSend: 0.10,
    echoTime: 0.13,
    echoFeedback: 0.16,
    echoLowpass: 3200,
    subGain: 0.0,
    padGain: 0.026,
    padDecay: 9.0,
    preSilence: 0.26,      // 敲响之前的那一拍静
    hold: 1.5,
    partials: [
      [0.50, 0.16, 1.6, 0],
      [1.00, 1.00, 2.3, 0],
      [1.19, 0.58, 2.0, 7],
      [1.56, 0.42, 1.7, -9],
      [2.00, 0.66, 1.5, 5],
      [2.66, 0.46, 1.1, 12],
      [3.01, 0.32, 0.85, -15],
      [4.07, 0.22, 0.55, 10],
    ],
  },

  // 第二幕 · 集合：人在地道里，钟在地面上，中间隔着几米土。
  // 关键区别不是"音量小"，是**敲击的脆传不过土层**——strike 为 0、起音软化、
  // 强低通把 400Hz 以上全吃掉。听起来像"从很远的上面压下来的一团声音"。
  rally: {
    root: 392,
    spacing: 1.52,
    gain: 0.66,
    attack: 0.048,
    highpass: 34,
    lowpass: 430,
    strike: 0.0,
    strikeHz: 0,
    echoSend: 0.24,
    echoTime: 0.27,
    echoFeedback: 0.34,
    echoLowpass: 620,
    subGain: 0.18,
    padGain: 0.032,
    padDecay: 13.0,
    preSilence: 0.34,
    hold: 2.0,
    partials: [
      [0.50, 0.92, 3.8, 0],
      [1.00, 1.00, 3.1, -4],
      [1.19, 0.34, 2.3, 6],
      [1.56, 0.15, 1.7, -7],
      [2.00, 0.09, 1.2, 3],
    ],
  },

  // 第三幕 · 反击：低一个八度，余韵拉到 7 秒，重回声。
  // 这一下不是"通知"，是"落锤"——所以要沉、要长、要在村子里荡开。
  strike: {
    root: 262,
    spacing: 2.15,
    gain: 1.0,
    attack: 0.008,
    highpass: 28,
    lowpass: 6200,
    strike: 0.52,
    strikeHz: 1500,
    echoSend: 0.48,
    echoTime: 0.345,
    echoFeedback: 0.52,
    echoLowpass: 1900,
    subGain: 0.34,
    padGain: 0.040,
    padDecay: 16.0,
    preSilence: 0.42,
    hold: 2.6,
    partials: [
      [0.50, 0.72, 7.0, 0],
      [1.00, 1.00, 6.2, -2],
      [1.19, 0.50, 4.6, 8],
      [1.56, 0.34, 3.4, -10],
      [2.00, 0.40, 2.8, 4],
      [2.66, 0.22, 1.9, 13],
      [3.01, 0.14, 1.3, -16],
    ],
  },
};

/** 幕序号 → 钟的音色。反击的钟属于第三幕。 */
const BELL_BY_ACT = ["alert", "rally", "strike"];

/** 一次性音效的元数据。
 *  maxDist 超过这个距离就整个丢掉（省声部）；ref 是衰减参考距离；
 *  cool 是同 id 最短重触发间隔（秒），防止脚步声打成机关枪；
 *  send 是送进空间回声的量（0 = 干声）；prio 见 chains 的优先支路。
 *
 *  gain 是**实测配平系数，不是直觉值**：这些音效大多要过很窄的滤波器
 *  （340Hz 的低通吃掉白噪声九成以上的幅度），所以合成器里写的包络峰值
 *  跟耳朵听到的响度差一个数量级。这一列是把每个音效离线渲染出来、
 *  跟环境层量能量比之后配平的结果。改音色之后要重新配。 */
const SHOT_META = {
  step_dirt: { maxDist: 26, ref: 5.0, cool: 0.055, send: 0.10, gain: 3.8 },
  step_stone: { maxDist: 30, ref: 5.5, cool: 0.055, send: 0.20, gain: 5.6 },
  boot: { maxDist: 46, ref: 9.0, cool: 0.05, send: 0.26, gain: 4.1 },
  ladder: { maxDist: 22, ref: 4.5, cool: 0.07, send: 0.14, gain: 10.5 },
  cloth: { maxDist: 14, ref: 3.0, cool: 0.06, send: 0.05, gain: 8.0 },
  breath: { maxDist: 10, ref: 2.5, cool: 0.18, send: 0.04, gain: 9.5 },
  heartbeat: { maxDist: 8, ref: 2.5, cool: 0.20, send: 0.0, gain: 1.6 },
  dig: { maxDist: 34, ref: 6.0, cool: 0.10, send: 0.18, gain: 5.2 },
  hatch_open: { maxDist: 38, ref: 7.0, cool: 0.14, send: 0.22, gain: 3.3 },
  lever: { maxDist: 34, ref: 6.5, cool: 0.10, send: 0.20, gain: 4.9 },
  push: { maxDist: 34, ref: 6.5, cool: 0.18, send: 0.20, gain: 2.9 },
  pickup: { maxDist: 16, ref: 3.5, cool: 0.10, send: 0.06, gain: 7.0 },
  land: { maxDist: 30, ref: 5.5, cool: 0.08, send: 0.18, gain: 1.9 },
  water: { maxDist: 46, ref: 11.0, cool: 0.22, send: 0.24, gain: 4.4 },
  gas: { maxDist: 46, ref: 11.0, cool: 0.30, send: 0.16, gain: 11.0 },
  shout: { maxDist: 70, ref: 14.0, cool: 0.12, send: 0.36, gain: 6.4 },
  dog: { maxDist: 80, ref: 16.0, cool: 0.15, send: 0.34, gain: 4.9 },
  signal: { maxDist: 30, ref: 7.0, cool: 0.12, send: 0.28, gain: 6.7 },
  rifle: { maxDist: 130, ref: 26.0, cool: 0.05, send: 0.42, gain: 5.2 },
  mine: { maxDist: 160, ref: 34.0, cool: 0.12, send: 0.50, gain: 1.2 },
  // prio:true = 绕开 duck 直连总线（见 chains 的 prio 支路）
  alarm: { maxDist: 999, ref: 999, cool: 0.35, send: 0.16, gain: 2.2, prio: true },
  death: { maxDist: 999, ref: 999, cool: 0.6, send: 0.10, gain: 1.3, prio: true },
};

/** 别名：契约里同一件事有几种叫法，都要接住。 */
const SHOT_ALIAS = {
  spot: "alarm",
  bell: "bell_ring",
  step: "step_dirt",
  footstep: "step_dirt",
  lost: "death",
  hatch: "hatch_open",
};

/** 各 phase 下世界层（环境+紧张+音效）的总电平。
 *  won / chapterEnd 掉到 0.10 —— 这就是"幕落时的突然安静"，a1_close 靠它。 */
const PHASE_WORLD = {
  play: 1.0,
  panel: 0.84,
  cutscene: 0.70,
  won: 0.10,
  chapterEnd: 0.10,
  lost: 0.26,
};

/** 确定性抖动表。代替 Math.random()：脚步/滴水靠它取得"不完全一样"。 */
const VARY = [1.0, 1.062, 0.947, 1.108, 0.981, 1.043, 0.918, 1.079, 0.965, 1.021, 0.934, 1.095];

/** 地表 / 地道两套空间的回声参数。听觉上的"我在哪儿"主要靠这个，不靠音量。 */
const SPACE_SURFACE = { time: 0.192, feedback: 0.16, lowpass: 2400, wet: 0.30 };
const SPACE_TUNNEL = { time: 0.108, feedback: 0.44, lowpass: 1450, wet: 0.62 };

const LAYER_FADE_SEC = 0.9;   // 地表 ⇄ 地道交叉淡入淡出（契约要求 0.6–1.2 秒）
const MAX_CHAINS = 24;        // 同时在响的一次性音效上限
const EPS = 0.0001;

// ───────────────────────────── 空壳（降级路径）─────────────────────────────

/** 没有 WebAudio、或者建图过程中出了任何岔子时返回这个。
 *  所有方法可调用、都不抛错、都什么也不做。宁可没声音，不能白屏。 */
function MakeStub(reason) {
  return {
    available: false,
    reason: reason || "no-webaudio",
    Unlock() {},
    Play() {},
    Sync() {},
    SetMuted() {},
    SetVolume() {},
    Dispose() {},
  };
}

// ───────────────────────────── 主体 ─────────────────────────────

/**
 * 建立音频句柄。
 *
 * @param {object} [options]
 * @param {number} [options.volume=0.85]   初始音量（0..1，乘在总线上）
 * @param {boolean} [options.muted=false]
 * @param {AudioContext} [options.context]  外部注入的 context（测试用）
 * @returns 契约第 7.2 节的 handle
 */
export function CreateAudio(options) {
  const opts = options || {};

  let ctx = null;
  try {
    if (opts.context) ctx = opts.context;
    else {
      const Ctor = (typeof globalThis !== "undefined")
        && (globalThis.AudioContext || globalThis.webkitAudioContext);
      if (typeof Ctor !== "function") return MakeStub("no-webaudio");
      ctx = new Ctor();
    }
    if (!ctx || typeof ctx.createGain !== "function") return MakeStub("bad-context");
  } catch (error) {
    return MakeStub("ctor-failed");
  }

  try {
    return Build(ctx, opts, !opts.context);
  } catch (error) {
    // 建图失败：把已经建出来的 context 关掉，退回空壳。
    try { if (!opts.context && typeof ctx.close === "function") ctx.close(); } catch { /* 忽略 */ }
    return MakeStub("build-failed");
  }
}

function Build(ctx, opts, ownsContext) {
  const rate = ctx.sampleRate || 48000;
  const hasPanner = typeof ctx.createStereoPanner === "function";
  const hasComp = typeof ctx.createDynamicsCompressor === "function";
  // OfflineAudioContext 在 startRendering 之前一直是 suspended，但它的时间是自己走的，
  // 所以不能套用"没 running 就别排声音"那条规则（那条是防止解锁瞬间把攒下的声音一起炸开）。
  const isOffline = typeof ctx.startRendering === "function";

  // ── 噪声源：固定种子预生成，全程复用。绝不用 Math.random ──
  const bufWhite = MakeNoise(ctx, rate, 2.0, "white", 0x1a2b3c4d);
  const bufPink = MakeNoise(ctx, rate, 4.5, "pink", 0x5f6a7b8c);
  const bufBrown = MakeNoise(ctx, rate, 5.0, "brown", 0x2c9d4e10);

  // ── 总线 ──
  //   sfx / amb / tension → duck → worldLp → worldGain ─┐
  //   motif ─────────────────────────────────────────────┼→ comp → master → out
  //
  // 钟绕开 duck，因为"钟响时把世界压掉"这一招必须由钟自己发出，
  // 不能把钟自己也压掉。
  const master = ctx.createGain();
  const comp = hasComp ? ctx.createDynamicsCompressor() : null;
  if (comp) {
    // 只当安全限幅用，不当电平均衡器。
    // 阈值压得太低（试过 -14/3.2）会把整个动态范围压平：实测脚步声和环境层
    // 会被压到同一个峰值，"安静的地方真的安静"就没了。所以只在大事件上工作。
    comp.threshold.value = -6;
    comp.knee.value = 10;
    comp.ratio.value = 4.0;
    comp.attack.value = 0.004;
    comp.release.value = 0.24;
  }
  master.connect(ctx.destination);
  const preMaster = comp || master;
  if (comp) comp.connect(master);

  const worldGain = ctx.createGain();     // phase 驱动（幕落的静）
  const worldLp = ctx.createBiquadFilter(); // timeScale 驱动（慢镜头时世界变闷）
  worldLp.type = "lowpass";
  worldLp.frequency.value = 20000;
  worldLp.Q.value = 0.4;
  const duck = ctx.createGain();          // 钟 / 爆炸 / 刺 驱动的瞬时压低
  duck.connect(worldLp);
  worldLp.connect(worldGain);
  worldGain.connect(preMaster);

  const sfxBus = ctx.createGain();
  const ambBus = ctx.createGain();
  const tenBus = ctx.createGain();
  const motifBus = ctx.createGain();
  sfxBus.gain.value = 1.0;
  ambBus.gain.value = 0.30;
  tenBus.gain.value = 0.44;
  motifBus.gain.value = 0.80;
  sfxBus.connect(duck);
  ambBus.connect(duck);
  tenBus.connect(duck);
  motifBus.connect(preMaster);

  // ── 空间回声：不是"声音发生在哪儿"的混响，是"我站在哪儿"的混响。
  //    地表是村里的墙面拍打（短、干、亮），地道是土洞的闷回（更短、更黏、暗）。
  //    切层时这套参数一起走，所以耳朵会立刻知道"我下去了"。 ──
  const spaceIn = ctx.createGain();
  const spaceDelay = ctx.createDelay(1.0);
  const spaceFb = ctx.createGain();
  const spaceLp = ctx.createBiquadFilter();
  const spaceWet = ctx.createGain();
  spaceLp.type = "lowpass";
  spaceIn.gain.value = 1.0;
  spaceDelay.delayTime.value = SPACE_SURFACE.time;
  spaceFb.gain.value = SPACE_SURFACE.feedback;
  spaceLp.frequency.value = SPACE_SURFACE.lowpass;
  spaceWet.gain.value = SPACE_SURFACE.wet;
  spaceIn.connect(spaceDelay);
  spaceDelay.connect(spaceLp);
  spaceLp.connect(spaceFb);
  spaceFb.connect(spaceDelay);
  spaceLp.connect(spaceWet);
  spaceWet.connect(sfxBus);

  // ═══════════ 1. 环境层 ═══════════
  //
  // 地表和地道各是一整套常驻的合成器，永远在跑，只靠两个总 gain 交叉淡入淡出。
  // 「地表的声音在地道里要闷」这条不是靠关掉地表层实现的——地表层在地道里
  // 会保留一点点并被强低通吃掉，那才是"隔着土听见外面的风"。

  const ambSurface = ctx.createGain();
  const ambSurfaceLp = ctx.createBiquadFilter();
  ambSurfaceLp.type = "lowpass";
  ambSurfaceLp.frequency.value = 18000;
  ambSurfaceLp.Q.value = 0.3;
  ambSurface.connect(ambSurfaceLp);
  ambSurfaceLp.connect(ambBus);
  ambSurface.gain.value = 1.0;

  const ambTunnel = ctx.createGain();
  ambTunnel.connect(ambBus);
  ambTunnel.gain.value = EPS;

  const loops = [];  // 所有常驻的 BufferSource / Oscillator，Dispose 时统一停掉

  // —— 地表：夜风 ——
  // 三条带：低频的"旷"（土坡上的风）、中频的"扫"（土墙拐角）、高频的"叶"（老槐树）。
  // 每条各自被一个极慢的 LFO 推着走，互相不同频，所以永远不会听出循环。
  const wind = ctx.createBufferSource();
  wind.buffer = bufPink;
  wind.loop = true;
  const windLp = ctx.createBiquadFilter();
  windLp.type = "lowpass";
  windLp.frequency.value = 320;
  windLp.Q.value = 0.7;
  const windGain = ctx.createGain();
  windGain.gain.value = 0.50;
  wind.connect(windLp);
  windLp.connect(windGain);
  windGain.connect(ambSurface);
  Lfo(ctx, loops, 0.047, 170, windLp.frequency);
  Lfo(ctx, loops, 0.031, 0.22, windGain.gain);
  wind.start();
  loops.push(wind);

  const gust = ctx.createBufferSource();
  gust.buffer = bufPink;
  gust.loop = true;
  gust.playbackRate.value = 0.83;
  const gustBp = ctx.createBiquadFilter();
  gustBp.type = "bandpass";
  gustBp.frequency.value = 1050;
  gustBp.Q.value = 0.8;
  const gustGain = ctx.createGain();
  gustGain.gain.value = 0.11;
  gust.connect(gustBp);
  gustBp.connect(gustGain);
  gustGain.connect(ambSurface);
  Lfo(ctx, loops, 0.019, 0.085, gustGain.gain);
  Lfo(ctx, loops, 0.026, 420, gustBp.frequency);
  gust.start();
  loops.push(gust);

  const leaves = ctx.createBufferSource();
  leaves.buffer = bufWhite;
  leaves.loop = true;
  leaves.playbackRate.value = 0.61;
  const leavesBp = ctx.createBiquadFilter();
  leavesBp.type = "highpass";
  leavesBp.frequency.value = 2600;
  const leavesGain = ctx.createGain();
  leavesGain.gain.value = 0.030;
  leaves.connect(leavesBp);
  leavesBp.connect(leavesGain);
  leavesGain.connect(ambSurface);
  Lfo(ctx, loops, 0.013, 0.026, leavesGain.gain);
  leaves.start();
  loops.push(leaves);

  // —— 地表：虫声 ——
  // 两组蟋蟀，频率与鸣叫速率互质，再挂一个 27 秒周期的"潮汐"总门。
  // 虫声一停，玩家立刻感到"有东西过来了"——这是免费的紧张感来源。
  const cricketBus = ctx.createGain();
  cricketBus.gain.value = 0.5;
  cricketBus.connect(ambSurface);
  Lfo(ctx, loops, 0.037, 0.46, cricketBus.gain);
  MakeCrickets(ctx, loops, bufWhite, cricketBus, 4300, 18.2, 0.055, -0.35, hasPanner);
  MakeCrickets(ctx, loops, bufWhite, cricketBus, 5170, 22.7, 0.038, 0.42, hasPanner);

  // —— 地道：土层的压迫 ——
  // 两条极低的正弦（42 / 43.35 Hz）互相打拍，约 1.35 秒一次。
  // 这个拍不是"音乐"，是"头顶上有几米土"的身体感觉。
  const earthA = ctx.createOscillator();
  const earthB = ctx.createOscillator();
  const earthGain = ctx.createGain();
  earthA.type = "sine";
  earthB.type = "sine";
  earthA.frequency.value = 42.0;
  earthB.frequency.value = 43.35;
  earthGain.gain.value = 0.22;
  earthA.connect(earthGain);
  earthB.connect(earthGain);
  earthGain.connect(ambTunnel);
  earthA.start();
  earthB.start();
  loops.push(earthA, earthB);
  Lfo(ctx, loops, 0.023, 0.11, earthGain.gain);

  const rumble = ctx.createBufferSource();
  rumble.buffer = bufBrown;
  rumble.loop = true;
  const rumbleLp = ctx.createBiquadFilter();
  rumbleLp.type = "lowpass";
  rumbleLp.frequency.value = 115;
  rumbleLp.Q.value = 0.6;
  const rumbleGain = ctx.createGain();
  rumbleGain.gain.value = 0.40;
  rumble.connect(rumbleLp);
  rumbleLp.connect(rumbleGain);
  rumbleGain.connect(ambTunnel);
  Lfo(ctx, loops, 0.011, 0.20, rumbleGain.gain);
  rumble.start();
  loops.push(rumble);

  // 地道的"房间音"：一层很窄的中低频底噪，让地道不是死寂（死寂听起来像 bug）。
  const roomTone = ctx.createBufferSource();
  roomTone.buffer = bufPink;
  roomTone.loop = true;
  roomTone.playbackRate.value = 0.71;
  const roomHp = ctx.createBiquadFilter();
  roomHp.type = "highpass";
  roomHp.frequency.value = 70;
  const roomLp = ctx.createBiquadFilter();
  roomLp.type = "lowpass";
  roomLp.frequency.value = 640;
  roomLp.Q.value = 0.5;
  const roomGain = ctx.createGain();
  roomGain.gain.value = 0.10;
  roomTone.connect(roomHp);
  roomHp.connect(roomLp);
  roomLp.connect(roomGain);
  roomGain.connect(ambTunnel);
  roomTone.start();
  loops.push(roomTone);

  // ═══════════ 2. 紧张层 ═══════════
  //
  // 挂在 hud.suspicion 上，全部常驻，只推 gain。
  // 0 时确实听不见（gain 都在 1e-4）；涨起来先是低音层加厚，
  // 再进不谐和的小二度，最后是心跳与呼吸。
  const tenLow = ctx.createOscillator();      // 55 Hz 基底
  const tenLowGain = ctx.createGain();
  tenLow.type = "sine";
  tenLow.frequency.value = 55;
  tenLowGain.gain.value = EPS;
  tenLow.connect(tenLowGain);
  tenLowGain.connect(tenBus);
  tenLow.start();
  loops.push(tenLow);

  // 小二度：55 vs 58.27 Hz。两个音差半音，低八度上会打出很脏的拍频——
  // 这是"不对劲"最省力的写法，不需要任何旋律。
  const tenSecond = ctx.createOscillator();
  const tenSecondGain = ctx.createGain();
  tenSecond.type = "sine";
  tenSecond.frequency.value = 58.27;
  tenSecondGain.gain.value = EPS;
  tenSecond.connect(tenSecondGain);
  tenSecondGain.connect(tenBus);
  tenSecond.start();
  loops.push(tenSecond);

  // 高八度那对，只在 suspicion 很高时进来，给出"咬人"的边缘。
  const tenBite = ctx.createOscillator();
  const tenBite2 = ctx.createOscillator();
  const tenBiteGain = ctx.createGain();
  tenBite.type = "triangle";
  tenBite2.type = "triangle";
  tenBite.frequency.value = 220;
  tenBite2.frequency.value = 233.08;
  tenBiteGain.gain.value = EPS;
  tenBite.connect(tenBiteGain);
  tenBite2.connect(tenBiteGain);
  tenBiteGain.connect(tenBus);
  tenBite.start();
  tenBite2.start();
  loops.push(tenBite, tenBite2);

  // 高处的一层"耳鸣"，接近被抓时才出现。
  const tenAir = ctx.createBufferSource();
  tenAir.buffer = bufWhite;
  tenAir.loop = true;
  const tenAirBp = ctx.createBiquadFilter();
  tenAirBp.type = "bandpass";
  tenAirBp.frequency.value = 3150;
  tenAirBp.Q.value = 6;
  const tenAirGain = ctx.createGain();
  tenAirGain.gain.value = EPS;
  tenAir.connect(tenAirBp);
  tenAirBp.connect(tenAirGain);
  tenAirGain.connect(tenBus);
  tenAir.start();
  loops.push(tenAir);

  // 危害床（毒烟的嘶 / 灌水的流）。按最近的 active hazard 与玩家距离推。
  // 这条同时兼任"危害前摇"的听觉预警——契约要求所有危害都要有前摇。
  const hazBed = ctx.createBufferSource();
  hazBed.buffer = bufPink;
  hazBed.loop = true;
  const hazBp = ctx.createBiquadFilter();
  hazBp.type = "bandpass";
  hazBp.frequency.value = 900;
  hazBp.Q.value = 0.9;
  const hazGain = ctx.createGain();
  hazGain.gain.value = EPS;
  hazBed.connect(hazBp);
  hazBp.connect(hazGain);
  hazGain.connect(ambBus);
  hazBed.start();
  loops.push(hazBed);

  // 爆炸后的耳鸣（mine 触发）。常驻一个正弦，只推 gain。
  const earRing = ctx.createOscillator();
  const earRingGain = ctx.createGain();
  earRing.type = "sine";
  earRing.frequency.value = 3180;
  earRingGain.gain.value = EPS;
  earRing.connect(earRingGain);
  earRingGain.connect(preMaster);   // 绕开 duck：耳鸣就该在"静"里孤零零地响
  earRing.start();
  loops.push(earRing);

  // ═══════════ 3. 母题层 ═══════════
  //
  // 钟自己的回声网络（跟世界的空间回声分开，因为三种钟的回声差别就是母题的差别）。
  const bellEchoIn = ctx.createGain();
  const bellDelay = ctx.createDelay(1.2);
  const bellFb = ctx.createGain();
  const bellLp = ctx.createBiquadFilter();
  bellLp.type = "lowpass";
  bellEchoIn.gain.value = 1.0;
  bellDelay.delayTime.value = 0.3;
  bellFb.gain.value = 0.3;
  bellLp.frequency.value = 3000;
  bellEchoIn.connect(bellDelay);
  bellDelay.connect(bellLp);
  bellLp.connect(bellFb);
  bellFb.connect(bellDelay);
  bellLp.connect(motifBus);

  const bellSend = ctx.createGain();   // 每次敲钟按 variant 设送量
  bellSend.gain.value = 0;
  bellSend.connect(bellEchoIn);

  const bellOut = ctx.createGain();    // 钟的干声出口（每次敲钟重设滤波）
  const bellHp = ctx.createBiquadFilter();
  const bellLpOut = ctx.createBiquadFilter();
  bellHp.type = "highpass";
  bellLpOut.type = "lowpass";
  bellHp.frequency.value = 30;
  bellLpOut.frequency.value = 18000;
  bellLpOut.Q.value = 0.5;
  bellOut.connect(bellHp);
  bellHp.connect(bellLpOut);
  bellLpOut.connect(motifBus);
  bellLpOut.connect(bellSend);

  // 「配乐」：钟的分音在敲完之后单独延续下去的一段极简持续音。
  // 这是全作唯一接近 BGM 的东西，而它本质上还是钟——所以不算罐头进行曲。
  const padGain = ctx.createGain();
  padGain.gain.value = EPS;
  const padLp = ctx.createBiquadFilter();
  padLp.type = "lowpass";
  padLp.frequency.value = 1400;
  padLp.Q.value = 0.4;
  padGain.connect(padLp);
  padLp.connect(motifBus);
  const padOscs = [];
  const padRatios = [1.0, 1.19, 2.0];
  for (let i = 0; i < padRatios.length; i += 1) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = i === 0 ? "sine" : "triangle";
    o.frequency.value = BELL_VARIANTS.alert.root * padRatios[i];
    g.gain.value = i === 0 ? 1.0 : 0.42 / i;
    o.connect(g);
    g.connect(padGain);
    o.start();
    loops.push(o);
    padOscs.push(o);
  }

  // ── 一次性音效的链路池 ──
  // GainNode / BiquadFilter / StereoPanner 是可复用的（不像 BufferSource 一次性），
  // 所以整条链路预分配 MAX_CHAINS 份，跑起来之后只有振荡器与噪声源是新建的。
  const chains = [];
  for (let i = 0; i < MAX_CHAINS; i += 1) {
    const head = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    const pan = hasPanner ? ctx.createStereoPanner() : null;
    const send = ctx.createGain();
    // 优先支路：绕开 duck 直接进总线。
    // 「刺」与死亡音必须走这条——它们自己会把世界压掉，如果还走 duck，
    // 就等于自己把自己掐了，玩家唯一的听觉警报会消失在它制造的静里。
    const prio = ctx.createGain();
    lp.type = "lowpass";
    lp.Q.value = 0.5;
    lp.frequency.value = 18000;
    head.gain.value = 1;
    send.gain.value = 0;
    prio.gain.value = 0;
    head.connect(lp);
    const tap = pan || lp;
    if (pan) lp.connect(pan);
    tap.connect(sfxBus);
    tap.connect(send);
    tap.connect(prio);
    send.connect(spaceIn);
    prio.connect(preMaster);
    chains.push({ head, lp, pan, send, prio, busyUntil: -1 });
  }

  // ── 运行期状态（全部是预分配的标量/对象，Sync 里不再 new）──
  let disposed = false;
  let muted = !!opts.muted;
  let userVolume = typeof opts.volume === "number" ? Clamp(opts.volume, 0, 1) : 0.85;
  const baseVolume = 0.40;   // 留出动态余量：安静的地方要真的安静

  let now = 0;               // 每帧刷新一次的 ctx.currentTime 缓存
  let playerX = 0;
  let playerY = 0;
  let halfWidth = 12;        // 屏幕在 z=0 上的可视半宽，声像归一化用
  let layer = "surface";
  let lastLayer = "surface";
  let suspicion = 0;         // 平滑后的
  let rawSuspicion = 0;
  let phase = "play";
  let lastPhase = "play";
  let actIndex = 0;
  let bellVariantName = "alert";

  let paramClock = 0;        // 参数写入节流
  let dripTimer = 2.4;
  let thudTimer = 9.0;
  let heartTimer = 0;
  let breathTimer = 0;
  let lanternTimer = 0;
  let varyIndex = 0;
  let syncFaults = 0;
  let bellNextSlot = -1;     // 连续 bell_ring 事件的排队水位
  let padHold = 0;
  let padTarget = 0;
  let lastTimeScale = 1;

  // 参数节流盒（预分配，避免每帧比较时产生临时对象）
  const boxAmbS = { v: 1 };
  const boxAmbT = { v: EPS };
  const boxAmbSLp = { v: 18000 };
  const boxLow = { v: EPS };
  const boxSecond = { v: EPS };
  const boxBite = { v: EPS };
  const boxAir = { v: EPS };
  const boxHaz = { v: EPS };
  const boxHazHz = { v: 900 };
  const boxWorld = { v: 1 };
  const boxPad = { v: EPS };
  const boxMaster = { v: 0 };
  const cool = Object.create(null);  // id → 上次触发时间

  master.gain.value = muted ? 0 : userVolume * baseVolume;
  boxMaster.v = master.gain.value;
  worldGain.gain.value = 1;
  duck.gain.value = 1;

  // ───────────── 小工具 ─────────────

  function Vary() {
    varyIndex = (varyIndex + 1) % VARY.length;
    return VARY[varyIndex];
  }

  /** 指数包络。WebAudio 的 exponentialRamp 不接受 0，所以下限一律 EPS。 */
  function Shape(param, t, peak, attack, dur) {
    const p = Math.max(EPS, peak);
    param.setValueAtTime(EPS, t);
    param.exponentialRampToValueAtTime(p, t + Math.max(0.002, attack));
    param.exponentialRampToValueAtTime(EPS, t + Math.max(attack + 0.01, dur));
  }

  /** 一个振荡器声部。返回 void；节点结束后浏览器自行回收。 */
  function ToneShot(dest, type, hz, t, dur, peak, attack, sweepTo, detune) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(8, hz), t);
    if (sweepTo && sweepTo > 8 && sweepTo !== hz) {
      o.frequency.exponentialRampToValueAtTime(sweepTo, t + dur * 0.92);
    }
    if (detune) o.detune.setValueAtTime(detune, t);
    Shape(g.gain, t, peak, attack, dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.06);
    o.__g = g;
    o.__f = null;
    o.onended = Detach;
  }

  /** 一个噪声声部。filterType 传 null 表示不滤。 */
  function NoiseShot(dest, buf, t, dur, peak, attack, filterType, hz, q, sweepTo, rateScale) {
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    if (rateScale) s.playbackRate.setValueAtTime(rateScale, t);
    const g = ctx.createGain();
    Shape(g.gain, t, peak, attack, dur);
    let f = null;
    if (filterType) {
      f = ctx.createBiquadFilter();
      f.type = filterType;
      f.frequency.setValueAtTime(Math.max(20, hz), t);
      if (sweepTo && sweepTo > 20 && sweepTo !== hz) {
        f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur * 0.9);
      }
      f.Q.value = q || 1;
      s.connect(f);
      f.connect(g);
    } else {
      s.connect(g);
    }
    g.connect(dest);
    s.start(t);
    s.stop(t + dur + 0.04);
    s.__g = g;
    s.__f = f;
    s.onended = Detach;
  }

  /** onended 回调：声部结束后把它自己和随身的 gain / filter 一起从图上摘掉。
   *  写成具名函数而不是每次新建箭头函数，省一次分配；
   *  摘干净是为了让引擎能及时回收，长时间游玩不会攒出一坨僵尸节点。 */
  function Detach() {
    try { this.disconnect(); } catch { /* 忽略 */ }
    try { if (this.__f) this.__f.disconnect(); } catch { /* 忽略 */ }
    try { if (this.__g) this.__g.disconnect(); } catch { /* 忽略 */ }
    this.__g = null;
    this.__f = null;
  }

  /** 取一条空闲链路并按空间参数配置好。返回 head 节点，没位置就返回 null。 */
  function AcquireChain(x, y, meta, srcLayer, dur) {
    let slot = null;
    for (let i = 0; i < chains.length; i += 1) {
      if (chains[i].busyUntil <= now) { slot = chains[i]; break; }
    }
    if (!slot) return null;

    const dx = x - playerX;
    const dist = Math.sqrt(dx * dx + (y - playerY) * (y - playerY));
    const ref = meta.ref;
    // 距离衰减：1/(1+(d/ref)^1.6)。比线性衰减更"有空气"，也不会远处直接消失。
    const atten = 1 / (1 + Math.pow(dist / ref, 1.6));
    const gain = meta.gain * atten;

    // 声像：按屏幕半宽归一化，最多推到 0.82（推满会让人觉得声音跑出画面）。
    const pan = Clamp(dx / Math.max(3, halfWidth), -1, 1) * 0.82;

    // 「地表的声音在地道里要闷」：跨层就是隔着几米土，强低通。
    // 同层则只做距离带来的空气吸收。
    let cutoff;
    if (srcLayer !== layer) cutoff = 340 + 90 * atten;
    else cutoff = 18000 - Math.min(15200, dist * 430);

    slot.head.gain.setValueAtTime(Math.max(EPS, gain), now);
    slot.lp.frequency.setValueAtTime(Math.max(120, cutoff), now);
    if (slot.pan) slot.pan.pan.setValueAtTime(pan, now);
    // 越远回声越多，这是最有效的距离线索。
    slot.send.gain.setValueAtTime(meta.send * (0.35 + 0.9 * (1 - atten)), now);
    slot.prio.gain.setValueAtTime(meta.prio ? 1 : 0, now);
    slot.busyUntil = now + dur;
    return slot.head;
  }

  /** 世界层的瞬时压低。at 可以在未来（钟是提前排的，所以能做出"敲之前先静"）。 */
  function Duck(at, depth, hold, release) {
    const p = duck.gain;
    const t = Math.max(now, at);
    try {
      if (typeof p.cancelAndHoldAtTime === "function") p.cancelAndHoldAtTime(t);
      else p.cancelScheduledValues(t);
    } catch { /* 忽略 */ }
    p.setValueAtTime(Math.max(EPS, p.value), t);
    p.linearRampToValueAtTime(Math.max(EPS, depth), t + 0.035);
    p.setValueAtTime(Math.max(EPS, depth), t + hold);
    p.linearRampToValueAtTime(1, t + hold + release);
  }

  /** 节流写参数：变化不显著就不写，显著才用 setTargetAtTime 平滑过去。 */
  function Ramp(param, box, value, tc) {
    if (Math.abs(value - box.v) < 0.006) return;
    box.v = value;
    param.setTargetAtTime(value, now, tc);
  }

  function RampHz(param, box, value, tc) {
    if (Math.abs(value - box.v) < value * 0.06) return;
    box.v = value;
    param.setTargetAtTime(value, now, tc);
  }

  // ───────────── 钟 ─────────────

  /** 敲一下钟。t 是绝对时间（可以排在未来）。 */
  function RingBellAt(v, t, scale) {
    const g = v.gain * scale;

    // 回声网络按 variant 重设。因为 t 在未来，用 setValueAtTime 精确落点。
    bellSend.gain.setValueAtTime(v.echoSend, Math.max(now, t - 0.02));
    bellDelay.delayTime.setValueAtTime(v.echoTime, Math.max(now, t - 0.02));
    bellFb.gain.setValueAtTime(v.echoFeedback, Math.max(now, t - 0.02));
    bellLp.frequency.setValueAtTime(v.echoLowpass, Math.max(now, t - 0.02));
    bellHp.frequency.setValueAtTime(v.highpass, Math.max(now, t - 0.02));
    bellLpOut.frequency.setValueAtTime(v.lowpass, Math.max(now, t - 0.02));

    // 分音。每个分音独立余韵——这是"钟"和"合成器音"的分界线。
    let longest = 0;
    for (let i = 0; i < v.partials.length; i += 1) {
      const p = v.partials[i];
      const hz = v.root * p[0];
      const decay = p[2];
      if (decay > longest) longest = decay;
      // 金属被敲的一瞬间会有很小的向下弯音，弯完才稳住。
      ToneShot(bellOut, i < 2 ? "sine" : "triangle", hz * 1.006, t, decay,
        g * p[1] * 0.30, v.attack, hz, p[3]);
    }

    // 敲击的"脆"。第二幕没有——隔着土层，脆的部分传不过来。
    if (v.strike > 0) {
      NoiseShot(bellOut, bufWhite, t, 0.09, g * v.strike * 0.22, 0.001,
        "bandpass", v.strikeHz, 1.6, v.strikeHz * 0.45, 1.0);
      ToneShot(bellOut, "square", v.root * 5.2, t, 0.045, g * v.strike * 0.06, 0.001,
        v.root * 3.1, 0);
    }

    // 第三幕的底：一记低八度的推力，让"落锤"有身体重量。
    if (v.subGain > 0) {
      ToneShot(bellOut, "sine", v.root * 0.25, t, longest * 0.7,
        g * v.subGain * 0.5, 0.03, v.root * 0.245, 0);
    }

    // 静音是工具：敲之前先把世界压掉，敲完再慢慢放回来。
    Duck(t - v.preSilence, 0.06, v.preSilence + v.hold, 1.6);

    // 分音延续成的持续音
    padTarget = v.padGain;
    padHold = v.padDecay;
    for (let i = 0; i < padOscs.length; i += 1) {
      padOscs[i].frequency.setValueAtTime(v.root * padRatios[i], Math.max(now, t));
    }
    return longest;
  }

  /** bell_ring 事件排队。Rules 会在同一帧连发 3 个 bell_ring，
   *  这里用一个水位把它们摊开成有节奏的三下，而不是叠成一声轰。 */
  function QueueBell(variantName, count) {
    const v = BELL_VARIANTS[variantName] || BELL_VARIANTS.alert;
    const n = Math.max(1, Math.min(6, count | 0));
    // 第一下往后挪一点点：不是延迟，是给"敲之前那一拍静"腾位置。
    // 再长就会跟画面上钟的摆动对不上，所以只取 0.14 秒。
    const lead = Math.min(0.14, v.preSilence);
    for (let i = 0; i < n; i += 1) {
      const t = bellNextSlot < 0 ? now + lead : Math.max(now + lead, bellNextSlot);
      RingBellAt(v, t, 1);
      bellNextSlot = t + v.spacing;
    }
  }

  // ───────────── 一次性音效 ─────────────
  //
  // 每个渲染函数只负责"音色本身"，空间化（声像/衰减/跨层低通/回声）
  // 已经由 AcquireChain 配好，渲染函数把声部接到 d 上就行。

  const SHOTS = {
    // 泥土地上的脚：一记低频身体重量 + 一层沙砾。刻意做得钝。
    step_dirt(d, t, k) {
      NoiseShot(d, bufWhite, t, 0.055, 0.55, 0.001, "lowpass", 260 * k, 0.9, 150 * k, 0.9);
      NoiseShot(d, bufWhite, t + 0.006, 0.075, 0.20, 0.002, "bandpass", 1150 * k, 1.1, 780 * k, 1.2);
      ToneShot(d, "sine", 92 * k, t, 0.07, 0.22, 0.002, 58 * k, 0);
    },
    // 石板/屋顶：短、亮、带一点点尾巴。
    step_stone(d, t, k) {
      NoiseShot(d, bufWhite, t, 0.042, 0.42, 0.001, "bandpass", 2100 * k, 1.8, 1400 * k, 1.1);
      NoiseShot(d, bufWhite, t, 0.09, 0.12, 0.001, "highpass", 4200 * k, 0.7, 0, 1.0);
      ToneShot(d, "triangle", 168 * k, t, 0.05, 0.14, 0.002, 120 * k, 0);
    },
    // 军靴：这是敌人的脚步，必须和玩家的脚步一耳朵分开。
    // 皮子的闷 + 掌钉的金属尖，节奏上比村民重。
    boot(d, t, k) {
      NoiseShot(d, bufWhite, t, 0.075, 0.50, 0.001, "lowpass", 340 * k, 1.1, 170, 0.85);
      ToneShot(d, "triangle", 78 * k, t, 0.13, 0.34, 0.002, 46, 0);
      NoiseShot(d, bufWhite, t + 0.012, 0.045, 0.16, 0.001, "bandpass", 3300 * k, 5.0, 2600, 1.0);
    },
    // 木梯：吱呀。带一点点弯音才像木头受力。
    ladder(d, t, k) {
      ToneShot(d, "sawtooth", 380 * k, t, 0.16, 0.055, 0.02, 320 * k, 0);
      NoiseShot(d, bufWhite, t, 0.11, 0.16, 0.004, "bandpass", 900 * k, 3.2, 640 * k, 1.0);
    },
    // 衣料摩擦：极轻。它在潜行游戏里是"我在动"的确认音，不该抢戏。
    cloth(d, t, k) {
      NoiseShot(d, bufWhite, t, 0.13, 0.13, 0.03, "highpass", 1600 * k, 0.7, 0, 0.8);
      NoiseShot(d, bufWhite, t + 0.05, 0.09, 0.06, 0.02, "bandpass", 2900 * k, 0.9, 0, 1.1);
    },
    // 呼吸：鼻腔出气。紧张时会更急、更高。
    breath(d, t, k) {
      const hot = 1 + suspicion * 0.5;
      NoiseShot(d, bufWhite, t, 0.30 / hot, 0.20, 0.06, "bandpass", 520 * k * hot, 0.8, 340 * k, 0.7);
      NoiseShot(d, bufWhite, t + 0.02, 0.24 / hot, 0.07, 0.05, "highpass", 1900 * k, 0.6, 0, 0.9);
    },
    // 心跳：两下。低频是身体，中频那点"闷"是胸腔。
    heartbeat(d, t, k) {
      ToneShot(d, "sine", 56 * k, t, 0.15, 0.55, 0.006, 38, 0);
      NoiseShot(d, bufWhite, t, 0.06, 0.10, 0.003, "lowpass", 190, 1.2, 90, 0.8);
      ToneShot(d, "sine", 50 * k, t + 0.185, 0.18, 0.34, 0.008, 34, 0);
    },
    // 挖：铁锨切进土里，再把土掀开。两段式。
    dig(d, t, k) {
      NoiseShot(d, bufWhite, t, 0.14, 0.48, 0.002, "lowpass", 1500 * k, 0.8, 260, 0.95);
      ToneShot(d, "triangle", 96 * k, t, 0.12, 0.26, 0.003, 54, 0);
      NoiseShot(d, bufWhite, t + 0.13, 0.30, 0.16, 0.02, "bandpass", 620 * k, 0.7, 300, 0.85);
    },
    // 开地道口：木板被顶起 + 土渣落下 + 底下那口气。
    hatch_open(d, t, k) {
      ToneShot(d, "sawtooth", 132 * k, t, 0.26, 0.09, 0.03, 88, 0);
      NoiseShot(d, bufWhite, t, 0.34, 0.30, 0.01, "lowpass", 700 * k, 0.9, 200, 0.9);
      NoiseShot(d, bufWhite, t + 0.16, 0.42, 0.13, 0.03, "highpass", 2400, 0.6, 0, 1.0);
      ToneShot(d, "sine", 62, t + 0.06, 0.32, 0.20, 0.02, 40, 0);
    },
    // 铁闸：三下棘轮咬合。
    lever(d, t, k) {
      for (let i = 0; i < 3; i += 1) {
        const tt = t + i * 0.062;
        NoiseShot(d, bufWhite, tt, 0.035, 0.34, 0.001, "bandpass", (1700 + i * 260) * k, 6, 0, 1.0);
        ToneShot(d, "square", (210 + i * 34) * k, tt, 0.05, 0.06, 0.001, 0, 0);
      }
      ToneShot(d, "triangle", 118 * k, t + 0.15, 0.20, 0.14, 0.006, 70, 0);
    },
    // 推碾盘：石头蹭土地。慢、重、有摩擦的颗粒。
    push(d, t, k) {
      NoiseShot(d, bufWhite, t, 0.62, 0.34, 0.09, "lowpass", 480 * k, 1.4, 210, 0.8);
      NoiseShot(d, bufWhite, t, 0.58, 0.10, 0.12, "bandpass", 1400 * k, 0.9, 900, 1.05);
      ToneShot(d, "sine", 52, t, 0.5, 0.18, 0.08, 40, 0);
    },
    // 拿起东西：1942 年的村子里没有"叮"。只有布、木头和手。
    pickup(d, t, k) {
      NoiseShot(d, bufWhite, t, 0.10, 0.15, 0.006, "bandpass", 1250 * k, 1.2, 800, 0.9);
      ToneShot(d, "triangle", 300 * k, t, 0.07, 0.10, 0.003, 230, 0);
      NoiseShot(d, bufWhite, t + 0.05, 0.11, 0.06, 0.02, "highpass", 2600, 0.6, 0, 0.85);
    },
    // 落地：身体砸在地上 + 尘土。
    land(d, t, k) {
      ToneShot(d, "sine", 74 * k, t, 0.20, 0.60, 0.003, 36, 0);
      NoiseShot(d, bufWhite, t, 0.11, 0.40, 0.001, "lowpass", 420 * k, 1.0, 160, 0.9);
      NoiseShot(d, bufWhite, t + 0.04, 0.28, 0.11, 0.02, "bandpass", 1600, 0.7, 700, 1.0);
    },
    // 水：灌进地道的流水。
    water(d, t, k) {
      NoiseShot(d, bufPink, t, 0.85, 0.34, 0.14, "bandpass", 520 * k, 0.55, 380, 1.0);
      NoiseShot(d, bufWhite, t + 0.05, 0.70, 0.10, 0.16, "bandpass", 2100, 0.8, 1500, 0.9);
      ToneShot(d, "sine", 88, t, 0.6, 0.05, 0.15, 62, 0);
    },
    // 毒烟：慢慢起来的嘶声。它必须先响、后到，这是危害的前摇。
    gas(d, t, k) {
      NoiseShot(d, bufWhite, t, 1.25, 0.24, 0.42, "bandpass", 1750 * k, 0.55, 2600, 1.0);
      NoiseShot(d, bufPink, t, 1.15, 0.13, 0.38, "lowpass", 700, 0.7, 420, 0.85);
    },
    // 喊：日语口令/村民呼应都走这个。三条共振峰 + 气声，不做成滑稽的"哇"。
    shout(d, t, k) {
      const base = 172 * k;
      ToneShot(d, "sawtooth", base, t, 0.34, 0.14, 0.012, base * 0.82, 0);
      ToneShot(d, "triangle", base * 3.6, t, 0.30, 0.055, 0.012, base * 2.9, 0);
      ToneShot(d, "triangle", base * 7.1, t, 0.24, 0.024, 0.012, base * 6.2, 0);
      NoiseShot(d, bufWhite, t, 0.30, 0.055, 0.02, "bandpass", 1500, 0.8, 900, 1.0);
    },
    // 军犬：两声，第二声更急。低频的胸腔 + 中频的口腔。
    dog(d, t, k) {
      for (let i = 0; i < 2; i += 1) {
        const tt = t + i * 0.185;
        const p = i ? 1.11 : 1.0;
        ToneShot(d, "sawtooth", 205 * k * p, tt, 0.12, 0.26, 0.004, 118 * k, 0);
        ToneShot(d, "square", 640 * k * p, tt, 0.09, 0.07, 0.004, 380, 0);
        NoiseShot(d, bufWhite, tt, 0.10, 0.13, 0.003, "bandpass", 1250, 1.2, 700, 1.0);
      }
    },
    // 传令：地道里压着嗓子递口令 + 敲两下木头。是全作最"人"的声音之一。
    signal(d, t, k) {
      ToneShot(d, "triangle", 186 * k, t, 0.17, 0.10, 0.02, 168 * k, 0);
      ToneShot(d, "triangle", 610 * k, t, 0.15, 0.035, 0.02, 540, 0);
      NoiseShot(d, bufWhite, t, 0.16, 0.05, 0.03, "bandpass", 1100, 0.9, 800, 0.9);
      for (let i = 0; i < 2; i += 1) {
        const tt = t + 0.24 + i * 0.14;
        ToneShot(d, "sine", 372 * k, tt, 0.07, 0.09, 0.002, 300, 0);
        NoiseShot(d, bufWhite, tt, 0.03, 0.09, 0.001, "bandpass", 2100, 4, 0, 1.0);
      }
    },
    // 民兵的冷枪：从枪眼里打出去的一发。
    // 关键是"炸裂的一瞬 + 村墙之间来回的两记拍打"，不是持续的枪响。
    rifle(d, t, k) {
      NoiseShot(d, bufWhite, t, 0.028, 1.0, 0.0008, "highpass", 1500, 0.7, 0, 1.0);
      NoiseShot(d, bufWhite, t, 0.09, 0.55, 0.001, "bandpass", 780 * k, 0.6, 320, 0.95);
      ToneShot(d, "square", 190 * k, t, 0.06, 0.20, 0.001, 92, 0);
      // 墙面拍回来的两下（回声送量之外再补两记明确的 slap，村子的"窄"就出来了）
      NoiseShot(d, bufWhite, t + 0.185, 0.06, 0.16, 0.002, "bandpass", 900, 1.3, 480, 0.9);
      NoiseShot(d, bufWhite, t + 0.42, 0.10, 0.075, 0.006, "lowpass", 700, 0.8, 340, 0.85);
    },
    // 地雷：拉响的一记。低频塌下去 + 中频的土 + 高频的碎屑。
    // 引爆之后世界要"聋"一下（见 Play 里的善后）。
    mine(d, t, k) {
      ToneShot(d, "sine", 94, t, 0.85, 1.0, 0.004, 24, 0);
      ToneShot(d, "triangle", 62, t, 0.62, 0.55, 0.006, 20, 0);
      NoiseShot(d, bufWhite, t, 0.045, 0.85, 0.0008, "highpass", 2200, 0.7, 0, 1.0);
      NoiseShot(d, bufBrown, t, 0.95, 0.80, 0.004, "lowpass", 1800, 0.9, 110, 1.0);
      // 落下来的土和碎石
      for (let i = 0; i < 5; i += 1) {
        NoiseShot(d, bufWhite, t + 0.14 + i * 0.085 * VARY[i], 0.09, 0.08 / (1 + i * 0.5), 0.004,
          "bandpass", 1800 + i * 520, 2.4, 900, 1.0);
      }
    },
    // 被发现的那一记"刺"。全作唯一的听觉警报，必须是切进来的，不是渐变。
    // 结构：金属的三个不谐和高分音（跟钟同源，所以听起来仍是这部作品的声音）
    //       + 一记向下掉的 sub + 一条快速下扫的噪声。
    alarm(d, t, k) {
      ToneShot(d, "square", 1860, t, 0.16, 0.30, 0.0015, 1840, 0);
      ToneShot(d, "sawtooth", 2790, t, 0.13, 0.16, 0.0015, 2760, 7);
      ToneShot(d, "square", 4130, t, 0.10, 0.09, 0.0015, 4080, -11);
      NoiseShot(d, bufWhite, t, 0.28, 0.30, 0.001, "bandpass", 5200, 1.1, 700, 1.0);
      ToneShot(d, "sine", 138, t, 0.50, 0.55, 0.004, 34, 0);
      // 余下的一小截金属衰减，让"刺"有形状而不是一个爆音
      ToneShot(d, "triangle", 930, t + 0.02, 0.9, 0.05, 0.01, 900, 0);
    },
    // 失败：不是"游戏结束音"。是一次下沉。
    death(d, t, k) {
      ToneShot(d, "sine", 110, t, 1.4, 0.32, 0.02, 27, 0);
      ToneShot(d, "triangle", 58.27, t, 1.8, 0.16, 0.05, 30, 0);
      NoiseShot(d, bufBrown, t, 1.2, 0.18, 0.06, "lowpass", 420, 0.7, 90, 1.0);
    },
  };

  // ───────────── 公开：Play ─────────────

  function Play(id, playOpts) {
    if (disposed || !id) return;
    try {
      // 没解锁就别排任何东西，免得解锁瞬间攒下的一堆声音一起炸开
      if (!isOffline && ctx.state !== "running") return;
      now = ctx.currentTime;

      let key = SHOT_ALIAS[id] || id;

      // 钟单独走母题层：它不吃 sfx 的空间化，它自己就是空间。
      if (key === "bell_ring") {
        const variant = (playOpts && playOpts.variant) || bellVariantName;
        const rings = playOpts && typeof playOpts.rings === "number" ? playOpts.rings : 1;
        QueueBell(variant, rings);
        return;
      }

      const render = SHOTS[key];
      if (!render) return;                   // 未知 id：静默忽略，不抛错
      const meta = SHOT_META[key];
      if (!meta) return;

      // 同 id 冷却：脚步事件在跑动时会很密，没有冷却会变成噪声墙
      const last = cool[key];
      if (last !== undefined && now - last < meta.cool) return;
      cool[key] = now;

      const x = playOpts && typeof playOpts.x === "number" ? playOpts.x : playerX;
      const y = playOpts && typeof playOpts.y === "number" ? playOpts.y : playerY;
      const dx = x - playerX;
      const dy = y - playerY;
      if (dx * dx + dy * dy > meta.maxDist * meta.maxDist) return;   // 太远，整个丢掉

      const srcLayer = (playOpts && playOpts.layer)
        || (y < -1 ? "tunnel" : "surface");
      const head = AcquireChain(x, y, meta, srcLayer, 2.2);
      if (!head) return;                     // 声部满了：丢掉比爆音好

      const k = Vary();
      render(head, now, k);

      // ── 善后：几个特殊 id 会改变整个世界的状态 ──
      if (key === "alarm") {
        // 「刺」之前先把世界切掉 0.1 秒。那 0.1 秒的空白才是让人心里一沉的东西。
        Duck(now, 0.03, 0.30, 0.9);
      } else if (key === "mine") {
        // 引爆之后耳朵会聋一下：世界被压掉，只剩一条耳鸣慢慢退。
        Duck(now + 0.06, 0.05, 0.75, 1.8);
        earRingGain.gain.cancelScheduledValues(now);
        earRingGain.gain.setValueAtTime(EPS, now + 0.05);
        earRingGain.gain.exponentialRampToValueAtTime(0.030, now + 0.14);
        earRingGain.gain.exponentialRampToValueAtTime(EPS, now + 2.9);
      } else if (key === "death") {
        Duck(now, 0.18, 1.0, 2.0);
      }
    } catch (error) { /* 音效永远不许把玩法带下水 */ }
  }

  // ───────────── 公开：Sync ─────────────

  function Sync(state, dt) {
    if (disposed) return;
    try {
      const step = typeof dt === "number" && dt > 0 ? Math.min(0.1, dt) : 1 / 60;
      now = ctx.currentTime;

      // ── 从 state 取值。任何字段缺失都必须能活下去（并行开发中字段会迟到）──
      if (state) {
        const p = state.player;
        if (p) {
          if (typeof p.x === "number") playerX = p.x;
          if (typeof p.y === "number") playerY = p.y;
          layer = p.layer === "tunnel" || playerY < -1 ? "tunnel" : "surface";
        }
        const cam = state.camera;
        if (cam && typeof cam.viewHeight === "number") {
          const aspect = typeof cam.aspect === "number" && cam.aspect > 0 ? cam.aspect : 16 / 9;
          halfWidth = Math.max(4, cam.viewHeight * aspect * 0.5);
        }
        if (state.hud && typeof state.hud.suspicion === "number") {
          rawSuspicion = Clamp(state.hud.suspicion, 0, 1);
        }
        if (typeof state.phase === "string") phase = state.phase;
        if (typeof state.levelIndex === "number") {
          const idx = Clamp(state.levelIndex | 0, 0, 2);
          if (idx !== actIndex) {
            actIndex = idx;
            bellVariantName = BELL_BY_ACT[idx] || "alert";
            bellNextSlot = -1;
          }
        }
      }

      // suspicion 平滑：上升要快（危险来得快），下降要慢（心还在跳）。
      suspicion = Approach(suspicion, rawSuspicion,
        rawSuspicion > suspicion ? 7.0 : 1.1, step);

      // ── 层切换：交叉淡入淡出 + 空间回声整套换掉 ──
      if (layer !== lastLayer) {
        lastLayer = layer;
        const toTunnel = layer === "tunnel";
        const t = now;
        const fade = LAYER_FADE_SEC;
        // 地表层在地道里不是关掉，是被土层吃掉高频、只剩一层远远的风。
        LinearTo(ambSurface.gain, toTunnel ? 0.16 : 1.0, t, fade);
        LinearTo(ambSurfaceLp.frequency, toTunnel ? 300 : 18000, t, fade);
        LinearTo(ambTunnel.gain, toTunnel ? 1.0 : 0.05, t, fade);
        boxAmbS.v = toTunnel ? 0.16 : 1.0;
        boxAmbT.v = toTunnel ? 1.0 : 0.05;
        boxAmbSLp.v = toTunnel ? 300 : 18000;
        const sp = toTunnel ? SPACE_TUNNEL : SPACE_SURFACE;
        LinearTo(spaceDelay.delayTime, sp.time, t, fade);
        LinearTo(spaceFb.gain, sp.feedback, t, fade);
        LinearTo(spaceLp.frequency, sp.lowpass, t, fade);
        LinearTo(spaceWet.gain, sp.wet, t, fade);
        // 换层时重排一次滴水，别让玩家一下去就正好赶上
        dripTimer = 1.1;
      }

      // ── 参数节流：20Hz 足够，60Hz 写 AudioParam 是白烧 CPU ──
      paramClock += step;
      if (paramClock >= 0.05) {
        paramClock = 0;

        // 紧张层。曲线刻意不是线性的：
        //   0.00–0.20  几乎什么都没有（安静的地方要真的安静）
        //   0.20–0.55  低音层加厚
        //   0.45–1.00  小二度进来，开始"不对劲"
        //   0.70–1.00  高八度与耳鸣，逼近被抓
        const s = suspicion;
        const low = s < 0.06 ? 0 : Math.pow(Clamp((s - 0.06) / 0.94, 0, 1), 1.4) * 0.42;
        const second = Math.pow(Clamp((s - 0.30) / 0.70, 0, 1), 1.5) * 0.30;
        const bite = Math.pow(Clamp((s - 0.62) / 0.38, 0, 1), 2.0) * 0.10;
        const air = Math.pow(Clamp((s - 0.74) / 0.26, 0, 1), 2.0) * 0.045;
        Ramp(tenLowGain.gain, boxLow, Math.max(EPS, low), 0.22);
        Ramp(tenSecondGain.gain, boxSecond, Math.max(EPS, second), 0.30);
        Ramp(tenBiteGain.gain, boxBite, Math.max(EPS, bite), 0.20);
        Ramp(tenAirGain.gain, boxAir, Math.max(EPS, air), 0.35);

        // phase：幕落的"突然的静"就落在这里。
        if (phase !== lastPhase) lastPhase = phase;
        const world = PHASE_WORLD[phase] !== undefined ? PHASE_WORLD[phase] : 1.0;
        Ramp(worldGain.gain, boxWorld, Math.max(EPS, world), phase === "play" ? 0.35 : 0.28);

        // 母题的持续音：敲过钟之后留一段，过场里留得更久一点。
        if (padHold > 0) {
          padHold -= 0.05;
          const stage = phase === "cutscene" || phase === "chapterEnd" ? 1.45 : 1.0;
          Ramp(padGain.gain, boxPad, Math.max(EPS, padTarget * stage), 1.2);
        } else {
          Ramp(padGain.gain, boxPad, EPS, 2.4);
        }

        // 危害床：找最近的一个 active hazard，按距离推嘶声/水声。
        let hazLevel = 0;
        let hazHz = 900;
        if (state && Array.isArray(state.hazards)) {
          for (let i = 0; i < state.hazards.length; i += 1) {
            const h = state.hazards[i];
            if (!h || !h.active) continue;
            const x0 = typeof h.x0 === "number" ? h.x0 : playerX;
            const x1 = typeof h.x1 === "number" ? h.x1 : x0;
            const d = playerX < x0 ? x0 - playerX : (playerX > x1 ? playerX - x1 : 0);
            const near = Clamp(1 - d / 26, 0, 1);
            const lv = near * (0.35 + 0.65 * Clamp(typeof h.level === "number" ? h.level : 1, 0, 1));
            if (lv > hazLevel) {
              hazLevel = lv;
              hazHz = h.kind === "gas" ? 1850 : (h.kind === "water" ? 520 : 240);
            }
          }
        }
        Ramp(hazGain.gain, boxHaz, Math.max(EPS, hazLevel * 0.30), 0.45);
        RampHz(hazBp.frequency, boxHazHz, hazHz, 0.5);

        // timeScale（慢镜头）：世界变闷、变远。渲染那边同时在拉时间，
        // 耳朵跟上去才有"子弹时间"的仪式感。
        const ts = state && typeof state.timeScale === "number"
          ? Clamp(state.timeScale, 0.2, 1) : 1;
        if (Math.abs(ts - lastTimeScale) > 0.02) {
          lastTimeScale = ts;
          worldLp.frequency.setTargetAtTime(700 + (20000 - 700) * Math.pow(ts, 2.2), now, 0.12);
        }

        // 音量（外部可能随时改）
        const target = muted ? 0 : userVolume * baseVolume;
        Ramp(master.gain, boxMaster, target, 0.05);
      }

      // ── 定时发声：地道滴水 / 头顶闷响 / 心跳 / 呼吸 / 马灯 ──
      // 全部用确定性抖动表，不用 Math.random。

      if (layer === "tunnel" && phase === "play") {
        dripTimer -= step;
        if (dripTimer <= 0) {
          const k = Vary();
          dripTimer = 2.1 + 3.4 * k;
          Drip(k);
        }
        thudTimer -= step;
        if (thudTimer <= 0) {
          const k = Vary();
          thudTimer = 13 + 11 * k;
          Thud(k);
        }
      }

      // 心跳：suspicion > 0.28 才有。速率 50 → 108 BPM。
      if (suspicion > 0.28 && phase === "play") {
        heartTimer -= step;
        if (heartTimer <= 0) {
          const bpm = 50 + suspicion * 58;
          heartTimer = 60 / bpm;
          const g = Math.pow((suspicion - 0.28) / 0.72, 1.2) * 0.55;
          HeartThump(g);
        }
      } else if (heartTimer < 0.2) heartTimer = 0.2;

      // 呼吸：更晚才进来，而且只在玩家自己周围（不做空间化）。
      if (suspicion > 0.5 && phase === "play") {
        breathTimer -= step;
        if (breathTimer <= 0) {
          breathTimer = 1.9 - suspicion * 0.85;
          Play("breath", undefined);
        }
      } else if (breathTimer < 0.5) breathTimer = 0.5;

      // 马灯：拎着马灯走路时提梁会响。极小的一声，但"手里有东西"的感觉全靠它。
      if (state && state.player && state.player.carrying === "lantern"
          && state.player.onGround && Math.abs(state.player.vx || 0) > 0.4
          && phase === "play") {
        lanternTimer -= step;
        if (lanternTimer <= 0) {
          const k = Vary();
          lanternTimer = 0.55 + 0.5 * k;
          LanternCreak(k);
        }
      }

      // ── 链路池回收：只是把 busyUntil 过期的标回空闲，不分配任何东西 ──
      for (let i = 0; i < chains.length; i += 1) {
        if (chains[i].busyUntil > 0 && chains[i].busyUntil <= now) chains[i].busyUntil = -1;
      }

      if (bellNextSlot > 0 && bellNextSlot < now - 6) bellNextSlot = -1;
      syncFaults = 0;
    } catch (error) {
      // 连续出错就自我放弃，绝不拖累主循环。
      syncFaults += 1;
      if (syncFaults > 30) disposed = true;
    }
  }

  // ── Sync 内部用到的几个小发声器（都不在每帧路径上）──

  function Drip(k) {
    const slot = FindFreeChainRaw(1.2);
    if (!slot) return;
    slot.head.gain.setValueAtTime(0.16 + 0.08 * k, now);
    slot.lp.frequency.setValueAtTime(9000, now);
    if (slot.pan) slot.pan.pan.setValueAtTime((k - 1) * 3.2, now);
    slot.send.gain.setValueAtTime(0.55, now);
    const hz = 1180 * (0.72 + 0.5 * k);
    ToneShot(slot.head, "sine", hz, now, 0.16, 0.55, 0.001, hz * 0.55, 0);
    NoiseShot(slot.head, bufWhite, now, 0.035, 0.20, 0.001, "bandpass", hz * 1.7, 4, 0, 1.0);
  }

  function Thud(k) {
    // 头顶上的闷响：不知道是炮还是塌方，正因为不知道才有压迫感。
    const slot = FindFreeChainRaw(1.8);
    if (!slot) return;
    slot.head.gain.setValueAtTime(0.24 + 0.14 * k, now);
    slot.lp.frequency.setValueAtTime(220, now);
    if (slot.pan) slot.pan.pan.setValueAtTime((k - 1) * 2.4, now);
    slot.send.gain.setValueAtTime(0.42, now);
    ToneShot(slot.head, "sine", 58 * k, now, 0.85, 0.7, 0.02, 26, 0);
    NoiseShot(slot.head, bufBrown, now, 1.0, 0.35, 0.03, "lowpass", 190, 0.8, 70, 1.0);
  }

  function HeartThump(g) {
    const slot = FindFreeChainRaw(0.5);
    if (!slot) return;
    slot.head.gain.setValueAtTime(Math.max(EPS, g), now);
    slot.lp.frequency.setValueAtTime(600, now);
    if (slot.pan) slot.pan.pan.setValueAtTime(0, now);
    slot.send.gain.setValueAtTime(0, now);
    ToneShot(slot.head, "sine", 56, now, 0.14, 0.85, 0.005, 38, 0);
    ToneShot(slot.head, "sine", 50, now + 0.17, 0.17, 0.52, 0.007, 33, 0);
  }

  function LanternCreak(k) {
    const slot = FindFreeChainRaw(0.4);
    if (!slot) return;
    slot.head.gain.setValueAtTime(0.055 + 0.03 * k, now);
    slot.lp.frequency.setValueAtTime(6000, now);
    if (slot.pan) slot.pan.pan.setValueAtTime(0, now);
    slot.send.gain.setValueAtTime(0.10, now);
    const hz = 820 * (0.8 + 0.4 * k);
    ToneShot(slot.head, "sawtooth", hz, now, 0.13, 0.05, 0.02, hz * 0.86, 0);
    NoiseShot(slot.head, bufWhite, now, 0.06, 0.05, 0.004, "bandpass", hz * 2.1, 5, 0, 1.0);
  }

  function FindFreeChainRaw(dur) {
    for (let i = 0; i < chains.length; i += 1) {
      if (chains[i].busyUntil <= now) {
        chains[i].busyUntil = now + dur;
        chains[i].prio.gain.setValueAtTime(0, now);   // 上一次可能是「刺」用过的
        return chains[i];
      }
    }
    return null;
  }

  // ───────────── 公开：其余 ─────────────

  function Unlock() {
    if (disposed) return;
    try {
      if (ctx.state === "suspended" && typeof ctx.resume === "function") {
        const p = ctx.resume();
        if (p && typeof p.catch === "function") p.catch(() => {});
      }
      now = ctx.currentTime;
      // 解锁后总音量从 0 抬起来，避免第一帧一整块环境层直接砸出来。
      const target = muted ? 0 : userVolume * baseVolume;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(EPS, master.gain.value * 0.001 + EPS), now);
      master.gain.linearRampToValueAtTime(target, now + 1.1);
      boxMaster.v = target;
    } catch { /* 忽略 */ }
  }

  /** 把总音量停在"此刻的实际值"上，再交给新的自动化。
   *  不这么做的话，Unlock 那条 1.1 秒的淡入会被 cancelScheduledValues 抹成
   *  参数的固有值（满音量），静音反而先窜一下。 */
  function RetargetMaster(target, tc) {
    const p = master.gain;
    try {
      if (typeof p.cancelAndHoldAtTime === "function") p.cancelAndHoldAtTime(now);
      else { const v = p.value; p.cancelScheduledValues(now); p.setValueAtTime(v, now); }
    } catch { /* 忽略 */ }
    p.setTargetAtTime(target, now, tc);
    boxMaster.v = target;
  }

  function SetMuted(on) {
    if (disposed) return;
    muted = !!on;
    try {
      now = ctx.currentTime;
      RetargetMaster(muted ? 0 : userVolume * baseVolume, 0.04);
    } catch { /* 忽略 */ }
  }

  function SetVolume(v) {
    if (disposed) return;
    userVolume = Clamp(typeof v === "number" ? v : 0.85, 0, 1);
    try {
      now = ctx.currentTime;
      RetargetMaster(muted ? 0 : userVolume * baseVolume, 0.06);
    } catch { /* 忽略 */ }
  }

  function Dispose() {
    if (disposed) return;
    disposed = true;
    try {
      for (let i = 0; i < loops.length; i += 1) {
        try { loops[i].stop(); } catch { /* 已经停了 */ }
        try { loops[i].disconnect(); } catch { /* 忽略 */ }
      }
      loops.length = 0;
      for (let i = 0; i < chains.length; i += 1) {
        try { chains[i].head.disconnect(); } catch { /* 忽略 */ }
        try { chains[i].lp.disconnect(); } catch { /* 忽略 */ }
        if (chains[i].pan) { try { chains[i].pan.disconnect(); } catch { /* 忽略 */ } }
        try { chains[i].send.disconnect(); } catch { /* 忽略 */ }
        try { chains[i].prio.disconnect(); } catch { /* 忽略 */ }
      }
      chains.length = 0;
      try { master.disconnect(); } catch { /* 忽略 */ }
      if (ownsContext && typeof ctx.close === "function") {
        const p = ctx.close();
        if (p && typeof p.catch === "function") p.catch(() => {});
      }
    } catch { /* 忽略 */ }
  }

  return { available: true, reason: "", Unlock, Play, Sync, SetMuted, SetVolume, Dispose };
}

// ───────────────────────────── 建图辅助（模块级）─────────────────────────────

/** 挂一个极慢的 LFO 到某个 AudioParam 上。返回的振荡器登记进 loops 供 Dispose。 */
function Lfo(ctx, loops, hz, depth, param) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.value = hz;
  g.gain.value = depth;
  o.connect(g);
  g.connect(param);
  o.start();
  loops.push(o);
  return o;
}

/** 一组蟋蟀。
 *  锯齿波当包络：WebAudio 的 sawtooth 从 -1 线性升到 +1 再瞬回，
 *  乘上负增益就变成"瞬间起音 + 线性衰减"，正好是虫鸣的形状。
 *  不需要任何采样，也不需要 Math.random。 */
function MakeCrickets(ctx, loops, buf, dest, hz, rate, level, pan, hasPanner) {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.playbackRate.value = 0.93;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = hz;
  bp.Q.value = 16;
  const bp2 = ctx.createBiquadFilter();
  bp2.type = "bandpass";
  bp2.frequency.value = hz;
  bp2.Q.value = 16;
  const chirp = ctx.createGain();
  chirp.gain.value = 0.5;
  const out = ctx.createGain();
  out.gain.value = level;

  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.type = "sawtooth";
  lfo.frequency.value = rate;
  lfoGain.gain.value = -0.5;      // 负号 = 瞬起慢落
  lfo.connect(lfoGain);
  lfoGain.connect(chirp.gain);
  lfo.start();
  loops.push(lfo);

  src.connect(bp);
  bp.connect(bp2);
  bp2.connect(chirp);
  chirp.connect(out);
  if (hasPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    out.connect(p);
    p.connect(dest);
  } else {
    out.connect(dest);
  }
  src.start();
  loops.push(src);
}

/** 线性过渡一个 AudioParam（用于层切换这种一次性的、要精确控时的过渡）。 */
function LinearTo(param, value, t, sec) {
  try {
    if (typeof param.cancelAndHoldAtTime === "function") param.cancelAndHoldAtTime(t);
    else param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    param.linearRampToValueAtTime(value, t + sec);
  } catch {
    try { param.value = value; } catch { /* 忽略 */ }
  }
}

/**
 * 预生成固定种子的噪声 buffer。
 *
 * 为什么必须预生成：契约禁止 Math.random（确定性），也禁止加载音频文件。
 * 循环点会咔哒一下，所以生成 len+fade 个采样，再把尾巴交叉淡进头部——
 * 之后这个 buffer 可以无限循环而听不出接缝。
 */
function MakeNoise(ctx, rate, seconds, kind, seed) {
  const len = Math.max(1024, Math.floor(rate * seconds));
  const fade = Math.min(Math.floor(rate * 0.25), Math.floor(len / 4));
  const raw = new Float32Array(len + fade);

  let s = seed >>> 0;
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let brown = 0;
  for (let i = 0; i < raw.length; i += 1) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const w = s / 2147483648 - 1;   // -1 .. 1
    if (kind === "pink") {
      // Paul Kellet 的经济型粉噪声滤波器
      b0 = 0.99765 * b0 + w * 0.0990460;
      b1 = 0.96300 * b1 + w * 0.2965164;
      b2 = 0.57000 * b2 + w * 1.0526913;
      raw[i] = (b0 + b1 + b2 + w * 0.1848) * 0.16;
    } else if (kind === "brown") {
      brown = (brown + 0.022 * w) / 1.022;
      raw[i] = brown * 3.4;
    } else {
      raw[i] = w * 0.5;
    }
  }

  const buffer = ctx.createBuffer(1, len, rate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < fade; i += 1) {
    const t = i / fade;
    data[i] = raw[i] * t + raw[len + i] * (1 - t);
  }
  for (let i = fade; i < len; i += 1) data[i] = raw[i];
  return buffer;
}
