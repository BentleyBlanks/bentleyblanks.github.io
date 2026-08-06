// 《地道里的光》 —— 全程序化音景：音乐、环境、音效都在运行时用 WebAudio 合成。
//
// 白盒里不放任何音频文件：一是仓库不想堆二进制素材，二是这个题材要的东西
// ——风、土、滴水、远处的钟——本来就比采样更适合合成，参数一改就能重新调味。
//
// 音乐刻意克制。参考《勇敢的心》：这是普通人尺度的战争，配乐不能替观众哭。
// 音阶用商调式（D 商：商-角-徵-羽-宫 = D E G A C）。五声音阶没有西洋小调那两个
// 半音倾向音，一出来耳朵就认成中国民间，而不是"配乐感"的小调。
//
// 两条硬约束贯穿全文：
//   1) 音符必须提前排到 AudioContext 的时钟上（约 100ms 一跳、只看 0.4s 之内）。
//      用 setInterval 直接触发发声会漂移，浏览器后台节流时还会挤成一坨。
//   2) 任何增益变化都要走斜坡。直接赋值 = 波形上的阶跃 = 一声清晰的"咔"。
//
// 用法：CreateAudio() 拿到一个对象，首次用户手势里调 Unlock()，每帧调 Update()。
// 可选 CreateAudio({ context }) 注入自带的 AudioContext —— 只给离线测试用，
// 注入时不起 setInterval，排程完全由 Update() 驱动。

import { AUDIO_BUS_BASE } from "./Data_AudioMix.mjs?v=026";

const FADE = 2.5;          // mood 交叉淡入淡出时长（秒）
const LOOKAHEAD = 0.4;     // 排程视野：足够盖住一次 tick，又不至于让 mood 切换迟钝
const TICK_MS = 100;

// 商调式五声：相对主音 D 的半音数。宫=C 落在第五级，所以整体听感偏"苦"但不阴。
const SHANG = [0, 2, 5, 7, 10];

// 查表一律走 hasOwnProperty：直接 TABLE[name] 时，name 撞上 "constructor"/"toString"
// 会从原型链上摸到一个真值，于是"未知名字静默忽略"这条契约就破了。
const Has = (obj, key) => typeof key === "string" && Object.prototype.hasOwnProperty.call(obj, key);

const Clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const Rand = (a, b) => a + Math.random() * (b - a);
const Chance = (p) => Math.random() < p;
const Hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

/** 音级 → MIDI。d 可以越界，自动进位到上下八度，旋律走音阶时不用管边界 */
function Degree(d, base) {
  const oct = Math.floor(d / 5);
  const idx = ((d % 5) + 5) % 5;
  return base + oct * 12 + SHANG[idx];
}

// 每个 mood 就是一张"谁在响、响多大"的表。旋律层（pluck/lead）在扫荡时必须归零：
// 危险的段落一旦有调子就变成动作片，情绪立刻跑偏。
//   drone 低音持续 / pluck 古筝式衰减音 / lead 二胡 / pad 低沉气声 / pulse 低频脉动
// step=一个音位多少秒，rest=整句留白的概率，reg=旋律层的八度偏移，
// bright=音乐低通的上限，wet=送进混响的量，leadEvery=隔多少音位来一句二胡，drip=滴水概率
const MOODS = {
  // 重配过一轮：底噪整体压掉一半以上，留白拉长（rest 提高），乐句之间隔得更远
  // （leadEvery 加大）。这是华北平原的夜，不是配乐片——大部分时候应该几乎听不见。
  calm:   { drone: 0.13, pluck: 0.20, lead: 0.06, pad: 0.08, pulse: 0.00, step: 1.70, rest: 0.70, reg: 0, bright: 1500, wet: 0.16, leadEvery: 96, drip: 0.000 },
  tension: { drone: 0.19, pluck: 0.07, lead: 0.00, pad: 0.17, pulse: 0.08, step: 1.45, rest: 0.80, reg: -12, bright: 820, wet: 0.20, leadEvery: 0, drip: 0.000 },
  raid:    { drone: 0.24, pluck: 0.00, lead: 0.00, pad: 0.16, pulse: 0.30, step: 0.95, rest: 1.00, reg: -12, bright: 640, wet: 0.12, leadEvery: 0, drip: 0.000 },
  grief:   { drone: 0.05, pluck: 0.02, lead: 0.26, pad: 0.04, pulse: 0.00, step: 2.10, rest: 0.84, reg: 0, bright: 1200, wet: 0.28, leadEvery: 20, drip: 0.000 },
  tunnel:  { drone: 0.18, pluck: 0.02, lead: 0.00, pad: 0.11, pulse: 0.00, step: 1.90, rest: 0.88, reg: -12, bright: 480, wet: 0.42, leadEvery: 0, drip: 0.070 },
  resolve: { drone: 0.12, pluck: 0.19, lead: 0.13, pad: 0.12, pulse: 0.00, step: 1.55, rest: 0.52, reg: 0, bright: 2400, wet: 0.18, leadEvery: 44, drip: 0.000 },
};

const LAYER_KEYS = ["drone", "pluck", "lead", "pad", "pulse"];

/** WebAudio 不可用时的替身：接口一模一样，全部不做事。调用方不需要判空 */
function MakeSilent() {
  return {
    Unlock() {}, SetEnabled() {}, IsEnabled() { return false; },
    SetMasterVolume() {}, SetMusicVolume() {}, SetSfxVolume() {}, SetVoiceVolume() {},
    SetMood() {}, SetBgm() {}, StopBgm() {}, GetBgmState() { return null; }, Sfx() {}, Duck() {},
    LoadSfxPack() {}, SfxPackSize() { return 0; },
    PlayVoice() { return Promise.resolve(false); }, StopVoice() {},
    Update() {}, Dispose() {},
  };
}

function OpenContext() {
  const Ctor = (typeof window !== "undefined")
    ? (window.AudioContext || window.webkitAudioContext)   // 老 Safari 只有前缀版
    : (typeof AudioContext !== "undefined" ? AudioContext : null);
  if (!Ctor) return null;
  return new Ctor({ latencyHint: "interactive" });
}

export function CreateAudio(options = {}) {
  let ac = null;
  try {
    ac = options.context || OpenContext();
  } catch (error) {
    ac = null;                     // 有些环境构造就抛（隐私模式、无音频设备）
  }
  if (!ac) return MakeSilent();
  try {
    return Build(ac, options);
  } catch (error) {
    // 图建不起来（老浏览器缺 Convolver/StereoPanner 之类）就整体降级成哑对象。
    // 音频永远不该把异常甩回主循环——画面还能玩，声音没了不是致命伤。
    try { if (!options.context && ac.close) ac.close(); } catch (ignored) { /* 已关 */ }
    return MakeSilent();
  }
}

function Build(ac, options) {
  const owned = !options.context;                       // 自己开的上下文才由自己关
  const offline = typeof ac.startRendering === "function";
  const out = options.destination || ac.destination;

  // live：一次性发声，播完即断。resident：常驻声源，只有 Dispose 才收。
  // 两张表在建图之前就声明，因为下面建混响时就要往 resident 里塞东西了。
  const live = [];
  const resident = [];
  let disposed = false;

  // -------------------------------------------------------------------------
  // 总线
  //   master ← duck ← [music → 侦测低通, ambience]
  //   master ← sfx / voice（旁白与音效不被 duck，否则一压就听不见脚步了）
  // -------------------------------------------------------------------------
  const master = ac.createGain();
  master.gain.value = 0.52;   // 整体压低：这片平原的底噪本来就该很小

  // 次声切除。土层闷响、爆炸低频这类声音的能量大头落在 20Hz 以下：
  // 手机和笔记本喇叭根本放不出来，却实打实占掉动态余量，还会把限幅器压得一抖一抖。
  const rumbleCut = ac.createBiquadFilter();
  rumbleCut.type = "highpass";
  rumbleCut.frequency.value = 30;
  rumbleCut.Q.value = 0.7;
  master.connect(rumbleCut);

  // 安全限幅。爆炸 + 钟 + 音乐撞在同一帧时总和会冲过满刻度，数字削波是"刺啦"一声，
  // 在一款以安静为前提的游戏里格外难听。阈值压得比常态电平高得多，
  // 所以只有极端叠加才会碰到它，平时不会有压缩器那种呼吸感。
  let limiter = null;
  try {
    limiter = ac.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.25;
    rumbleCut.connect(limiter);
    limiter.connect(out);
  } catch (error) {
    limiter = null;
    rumbleCut.connect(out);
  }

  const duck = ac.createGain();
  duck.gain.value = 1;
  duck.connect(master);

  // 侦测度上来时把音乐的高频收掉：不是变小声，是"耳朵被自己的心跳堵住"的闷。
  const musicFilter = ac.createBiquadFilter();
  musicFilter.type = "lowpass";
  musicFilter.frequency.value = 1900;
  musicFilter.Q.value = 0.7;
  musicFilter.connect(duck);

  const musicBus = ac.createGain();
  musicBus.gain.value = 0.55;
  musicBus.connect(musicFilter);

  // 程序化配乐保留为录音 BGM 加载失败时的降级层。正式母带开始播放后把它淡出，
  // 避免两套旋律叠在一起；环境声和音效仍走各自总线，不受影响。
  const synthBus = ac.createGain();
  synthBus.gain.value = 1;
  synthBus.connect(musicBus);

  const ambBus = ac.createGain();
  ambBus.gain.value = 0.72;
  ambBus.connect(duck);

  const sfxBus = ac.createGain();
  sfxBus.gain.value = 0.68;
  sfxBus.connect(master);

  const voiceBus = ac.createGain();
  voiceBus.gain.value = 1;
  voiceBus.connect(master);

  // 分路音量：设置面板要能单独调旁白 / 音效 / 配乐。
  // 各路有各自的基准值（混音时定好的相对关系），面板给的是 0..1 的倍率，
  // 两者相乘——这样调音量不会把混音比例弄乱。环境音跟着音效走。
  // 音效整体收低：用户已经存过 100% 时也必须真正变安静，不能只改新用户默认值。
  // 环境声略高于动作音效，保留风、土和滴水的空间感，但都不再抢旁白。
  const BUS_BASE = AUDIO_BUS_BASE;
  const busNode = { music: musicBus, amb: ambBus, sfx: sfxBus, voice: voiceBus };
  const busLevel = { music: 1, sfx: 1, voice: 1 };
  function ApplyBus(name) {
    const lvl = name === "amb" ? busLevel.sfx : busLevel[name];
    const g = busNode[name].gain;
    const now = ac.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(BUS_BASE[name] * lvl, now + 0.12);
  }
  function SetBusLevel(name, v) {
    busLevel[name] = Clamp(Number.isFinite(v) ? v : 1, 0, 1);
    ApplyBus(name);
    if (name === "sfx") ApplyBus("amb");
  }

  // -------------------------------------------------------------------------
  // 噪声与混响
  // -------------------------------------------------------------------------
  const rate = ac.sampleRate;

  function MakeNoise(seconds, brown) {
    const buf = ac.createBuffer(1, Math.max(256, Math.floor(rate * seconds)), rate);
    const d = buf.getChannelData(0);
    let last = 0;
    let sum = 0;
    for (let i = 0; i < d.length; i += 1) {
      const w = Math.random() * 2 - 1;
      if (brown) {
        // 布朗噪声：白噪积分后能量压在低频，用来做土层闷响和风底
        last = (last + w * 0.045) / 1.02;
        d[i] = last * 5.2;
      } else {
        d[i] = w;
      }
      sum += d[i];
    }
    // 随机游走天然带直流分量。直流听不见，却实打实吃掉动态余量，
    // 还会在包络起音处变成一下"噗"。先减均值，再按 RMS 归一——
    // 归一是为了每次生成的噪声电平一致，不然音效响度会随刷新页面而变。
    const mean = sum / d.length;
    let energy = 0;
    for (let i = 0; i < d.length; i += 1) { d[i] -= mean; energy += d[i] * d[i]; }
    const rms = Math.sqrt(energy / d.length);
    const norm = rms > 0.0001 ? (brown ? 1.0 : 0.5) / rms : 1;
    for (let i = 0; i < d.length; i += 1) d[i] *= norm;
    // 首尾对接处补一段交叉淡化，循环点才不会每圈"嗒"一下
    const tail = Math.min(2048, Math.floor(d.length / 8));
    for (let i = 0; i < tail; i += 1) {
      const k = i / tail;
      d[i] = d[i] * k + d[d.length - tail + i] * (1 - k);
    }
    return buf;
  }

  const whiteBuf = MakeNoise(2.0, false);
  const brownBuf = MakeNoise(4.0, true);

  // 土洞的混响：短、暗、几乎没有高频。用指数衰减白噪当冲激响应，
  // 再一阶低通抹掉高频——真土墙就是这么吃掉齿音的。
  let reverbSend = null;
  try {
    const len = Math.floor(rate * 1.2);
    const ir = ac.createBuffer(1, len, rate);
    const d = ir.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < len; i += 1) {
      const t = i / len;
      const w = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.1);
      lp += (w - lp) * 0.22;
      d[i] = lp;
    }
    // 两个早期反射：地道是条走廊，先听见两侧壁的回头
    d[Math.floor(rate * 0.021)] += 0.5;
    d[Math.floor(rate * 0.047)] += 0.32;
    const conv = ac.createConvolver();
    conv.buffer = ir;
    conv.normalize = true;
    const ret = ac.createGain();
    ret.gain.value = 0.9;
    conv.connect(ret);
    ret.connect(master);
    reverbSend = ac.createGain();
    reverbSend.gain.value = 1;
    reverbSend.connect(conv);
    resident.push(conv, ret, reverbSend);
  } catch (error) {
    reverbSend = null;             // 没有 ConvolverNode 就干声，不影响玩
  }

  function MakeSend(source, amount) {
    if (!reverbSend) return null;
    const g = ac.createGain();
    g.gain.value = amount;
    source.connect(g);
    g.connect(reverbSend);
    return g;
  }
  const musicWet = MakeSend(musicFilter, 0.14);
  const sfxWet = MakeSend(sfxBus, 0.12);
  const ambWet = MakeSend(ambBus, 0.18);

  // -------------------------------------------------------------------------
  // 节点生命周期
  // 这个原型一跑就是半小时。一次性发声的节点如果只 stop 不 disconnect，
  // 会一直挂在音频图上，几千个之后就是明显的卡顿和内存增长。
  // -------------------------------------------------------------------------
  function Reap(rec) {
    if (rec.dead) return;
    rec.dead = true;
    for (const n of rec.nodes) { try { n.disconnect(); } catch (ignored) { /* 已断 */ } }
  }

  function Spawn(nodes, sources, stopAt) {
    for (const s of sources) { try { s.stop(stopAt); } catch (ignored) { /* 已停 */ } }
    const rec = { until: stopAt, nodes, dead: false };
    live.push(rec);
    const last = sources[sources.length - 1];
    // onended 是主路径；Purge 是兜底（页面挂起时 onended 可能迟迟不来）
    if (last) last.onended = () => Reap(rec);
    return rec;
  }

  function Purge(now) {
    for (let i = live.length - 1; i >= 0; i -= 1) {
      const rec = live[i];
      if (rec.dead || rec.until < now - 0.3) { Reap(rec); live.splice(i, 1); }
    }
  }

  /** 同时发声上限。极端情况（连点、异常帧）下宁可丢音也不能让节点数失控 */
  const VOICE_CAP = 64;
  const Full = () => live.length > VOICE_CAP;

  function Src(buffer, loop) {
    const s = ac.createBufferSource();
    s.buffer = buffer;
    s.loop = !!loop;
    return s;
  }

  /** 起音-衰减包络。指数斜坡不能到 0，所以底噪取 1e-4，再由 stop 收尾 */
  function AD(param, t, peak, attack, decay) {
    const p = Math.max(0.0002, peak);
    param.setValueAtTime(0.0001, t);
    param.exponentialRampToValueAtTime(p, t + Math.max(0.002, attack));
    param.exponentialRampToValueAtTime(0.0001, t + attack + Math.max(0.01, decay));
  }

  function Pan(amount) {
    if (!amount || typeof ac.createStereoPanner !== "function") return null;
    const p = ac.createStereoPanner();
    p.pan.value = Clamp(amount, -1, 1);
    return p;
  }

  /**
   * 把尾端节点接到目标上，按需插一个声像节点。
   * 返回"额外产生的节点"，调用方必须把它并进 Spawn 的清理名单里——
   * 忘了这一步，每个带声像的音效都会漏一个 StereoPannerNode。
   */
  function Out(tail, dest, panAmount) {
    const p = Pan(panAmount);
    if (p) { tail.connect(p); p.connect(dest); return [p]; }
    tail.connect(dest);
    return [];
  }

  // -------------------------------------------------------------------------
  // 采样音效层（第一章的动作音由本机 MiniMax 烘出来，见 Script_SfxBake.mjs）
  //
  // 合成器那一套一个都不删：采样是**盖在**它上面的一层。清单拉不到、解码失败、
  // 或者某个 cue 还没烘出来，Sfx() 自动落回合成——离线、单测、老浏览器全都还有声。
  // -------------------------------------------------------------------------
  const samples = new Map();          // cue 名 → AudioBuffer

  function LoadSamples(baseUrl) {
    if (offline || typeof fetch !== "function" || !baseUrl) return;
    const base = String(baseUrl).replace(/\/?$/, "/");
    fetch(base + "Data_SfxManifest.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((manifest) => {
        if (!manifest?.cues) return;
        const jobs = Object.keys(manifest.cues).map((cue) => fetch(base + manifest.cues[cue].file)
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error("404"))))
          // decodeAudioData 的 Promise 形式在 Safari 上要老回调签名兜一下
          .then((buf) => new Promise((res, rej) => {
            const ok = ac.decodeAudioData(buf, res, rej);
            if (ok && typeof ok.then === "function") ok.then(res, rej);
          }))
          .then((audioBuffer) => { if (!disposed) samples.set(cue, audioBuffer); })
          .catch(() => { /* 缺一个就少一个，退回合成 */ }));
        return Promise.all(jobs);
      })
      .catch(() => { /* 整包拉不到就整包用合成 */ });
  }

  /** 放一发采样。同一个音连着触发时轻微变速变调，免得听出"贴图"感 */
  function PlaySample(name, t, k, pan, r) {
    const buffer = samples.get(name);
    if (!buffer || Full()) return false;
    const s = ac.createBufferSource();
    s.buffer = buffer;
    s.playbackRate.value = Clamp(r * (0.96 + Math.random() * 0.08), 0.25, 4);
    const g = ac.createGain();
    g.gain.value = Clamp(k, 0, 4) * 0.9;
    s.connect(g);
    const tail = Out(g, sfxBus, pan);
    s.start(t);
    Spawn([s, g, ...tail], [s], t + buffer.duration / s.playbackRate.value + 0.05);
    return true;
  }

  // -------------------------------------------------------------------------
  // 音乐层：常驻声源（drone / pad）+ 事件排程（pluck / lead / pulse）
  // 层增益既是混音也是门：mood 切换只动这几个 gain，声部自然进出。
  // -------------------------------------------------------------------------
  const layers = {};
  for (const k of LAYER_KEYS) {
    const g = ac.createGain();
    g.gain.value = 0;
    g.connect(synthBus);
    layers[k] = { node: g, from: 0, goal: 0, t0: 0 };
  }

  /** 线性斜坡的当前值可以在 JS 侧精确复算——排程要用它决定"这层还值不值得发音" */
  function LayerNow(k) {
    const L = layers[k];
    const p = Clamp((ac.currentTime - L.t0) / FADE, 0, 1);
    return L.from + (L.goal - L.from) * p;
  }

  function SetLayer(k, goal) {
    const L = layers[k];
    const now = ac.currentTime;
    const cur = LayerNow(k);
    L.from = cur; L.goal = goal; L.t0 = now;
    L.node.gain.cancelScheduledValues(now);
    L.node.gain.setValueAtTime(cur, now);
    L.node.gain.linearRampToValueAtTime(goal, now + FADE);
  }

  // 低音持续层：主音 + 上方八度 + 空五度。三度一律不加——加了就成了西洋和声。
  function BuildDrone() {
    const g = layers.drone.node;
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 240; lp.Q.value = 0.6;
    lp.connect(g);
    const specs = [
      { type: "sawtooth", midi: 38, gain: 0.30 },   // D2
      { type: "triangle", midi: 50, gain: 0.16 },   // D3
      { type: "sine", midi: 57, gain: 0.09 },       // A3，空五度
    ];
    // 极慢的失谐 LFO：完全对准的持续音听起来像电子设备，微微游移才像人拉的
    const lfo = ac.createOscillator();
    lfo.type = "sine"; lfo.frequency.value = 0.047;
    const lfoAmt = ac.createGain();
    lfoAmt.gain.value = 7;
    lfo.connect(lfoAmt);
    lfo.start(ac.currentTime);
    resident.push(lfo, lfoAmt, lp);
    for (const s of specs) {
      const o = ac.createOscillator();
      o.type = s.type; o.frequency.value = Hz(s.midi);
      const og = ac.createGain();
      og.gain.value = s.gain;
      lfoAmt.connect(o.detune);
      o.connect(og); og.connect(lp);
      o.start(ac.currentTime);
      resident.push(o, og);
    }
  }

  // 低沉气声垫：滤过的布朗噪声 + 两个很轻的低音。像地窖里的空气本身在呼吸
  function BuildPad() {
    const g = layers.pad.node;
    const n = Src(brownBuf, true);
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 300; lp.Q.value = 0.7;
    const hp = ac.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 55; hp.Q.value = 0.7;
    const body = ac.createGain();
    body.gain.value = 0.42;
    n.connect(lp); lp.connect(hp); hp.connect(body); body.connect(g);
    // 呼吸：截止频率极慢地上下，音量不变——变的是"厚度"，比直接抖音量自然
    const breath = ac.createOscillator();
    breath.type = "sine"; breath.frequency.value = 0.071;
    const breathAmt = ac.createGain();
    breathAmt.gain.value = 110;
    breath.connect(breathAmt); breathAmt.connect(lp.frequency);
    breath.start(ac.currentTime);
    n.start(ac.currentTime);
    resident.push(n, lp, hp, body, breath, breathAmt);
    for (const m of [38, 45]) {
      const o = ac.createOscillator();
      o.type = "sine"; o.frequency.value = Hz(m);
      const og = ac.createGain();
      og.gain.value = 0.05;
      o.connect(og); og.connect(g);
      o.start(ac.currentTime);
      resident.push(o, og);
    }
  }

  // 古筝式拨弦：亮度掉得比音量快，这一条是"拨弦"和"电子音"的分界线
  function Pluck(t, midi, level, warm) {
    if (Full()) return;
    const f = Hz(midi);
    const dur = Rand(1.7, 2.9) + (warm ? 0.5 : 0);
    const g = ac.createGain();
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(Math.min(14000, f * 9), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(120, f * 2.0), t + dur * 0.8);
    lp.Q.value = 0.9;
    lp.connect(g);
    g.connect(layers.pluck.node);
    AD(g.gain, t, level, 0.005, dur);

    const nodes = [lp, g];
    const sources = [];
    const parts = [
      { type: "triangle", mul: 1, gain: 1 },
      { type: "sawtooth", mul: 1.0015, gain: 0.22 },   // 极小失谐 = 弦的拍频
      { type: "sine", mul: 2, gain: warm ? 0.16 : 0.10 },
    ];
    for (const p of parts) {
      const o = ac.createOscillator();
      o.type = p.type; o.frequency.value = f * p.mul;
      const og = ac.createGain();
      og.gain.value = p.gain;
      o.connect(og); og.connect(lp);
      o.start(t);
      sources.push(o); nodes.push(o, og);
    }
    // 指甲触弦的那一下：没有它，起音是"冒出来"的而不是"拨出来"的
    const nail = Src(whiteBuf, false);
    const hp = ac.createBiquadFilter();
    hp.type = "bandpass"; hp.frequency.value = Math.min(9000, f * 6); hp.Q.value = 1.2;
    const ng = ac.createGain();
    AD(ng.gain, t, level * 0.30, 0.001, 0.035);
    nail.connect(hp); hp.connect(ng); ng.connect(lp);
    nail.start(t, Rand(0, 1.2));
    sources.push(nail); nodes.push(nail, hp, ng);

    Spawn(nodes, sources, t + dur + 0.1);
  }

  // 二胡式弓弦乐句：一个声源拉完整句，音与音之间靠滑音连起来。
  // 断开重发就成了合成器音色——连奏和揉弦才是二胡的身份证。
  function LeadPhrase(t, midis, level, warm) {
    if (Full()) return;
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = Hz(midis[0]) * 2.6;
    bp.Q.value = 1.5;
    const g = ac.createGain();
    bp.connect(g);
    g.connect(layers.lead.node);

    const osc = ac.createOscillator();
    osc.type = "sawtooth";
    const body = ac.createOscillator();
    body.type = "triangle";
    const bodyG = ac.createGain();
    bodyG.gain.value = 0.45;
    osc.connect(bp);
    body.connect(bodyG); bodyG.connect(bp);

    // 揉弦：深度从 0 慢慢加上去。一开弓就满揉是电子味，人是先出音再揉的
    const vib = ac.createOscillator();
    vib.type = "sine";
    vib.frequency.value = warm ? Rand(4.4, 4.9) : Rand(4.9, 5.6);
    const vibAmt = ac.createGain();
    vibAmt.gain.setValueAtTime(0.5, t);
    vibAmt.gain.linearRampToValueAtTime(warm ? 9 : 13, t + 0.9);
    vib.connect(vibAmt);
    vibAmt.connect(osc.detune);
    vibAmt.connect(body.detune);

    let cursor = t;
    let prev = Hz(midis[0]);
    for (const o of [osc, body]) o.frequency.setValueAtTime(prev, t);
    for (let i = 0; i < midis.length; i += 1) {
      const f = Hz(midis[i]);
      const hold = Rand(0.85, 1.7);
      if (i > 0) {
        const glide = Rand(0.05, 0.13);      // 换音的滑音，二胡的把位是滑过去的
        for (const o of [osc, body]) {
          o.frequency.setValueAtTime(prev, cursor);
          o.frequency.exponentialRampToValueAtTime(f, cursor + glide);
        }
        // 换弓的一点凹陷，纯连奏会显得没有呼吸
        g.gain.setValueAtTime(Math.max(0.0003, level * 0.78), cursor);
        g.gain.linearRampToValueAtTime(level, cursor + 0.16);
      }
      cursor += hold;
      prev = f;
    }
    const dur = cursor - t;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0003, level), t + 0.26);   // 弓压上弦
    g.gain.setValueAtTime(Math.max(0.0003, level), t + dur - 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.35);
    // 带通中心跟着句子慢慢暗下来：收句时弓压松掉，泛音本来就会少
    bp.frequency.setValueAtTime(Hz(midis[0]) * 2.6, t);
    bp.frequency.linearRampToValueAtTime(Hz(midis[midis.length - 1]) * (warm ? 2.9 : 2.0), t + dur);

    osc.start(t); body.start(t); vib.start(t);
    Spawn([bp, g, osc, body, bodyG, vib, vibAmt], [osc, body, vib], t + dur + 0.5);
  }

  // 低频脉动：不是鼓点，是心口发闷。扫荡段落只许有压迫感，不许有节奏型的爽感
  function PulseHit(t, level) {
    if (Full()) return;
    const o = ac.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(62, t);
    o.frequency.exponentialRampToValueAtTime(33, t + 0.45);
    const g = ac.createGain();
    AD(g.gain, t, level, 0.03, 0.5);
    o.connect(g); g.connect(layers.pulse.node);
    o.start(t);
    Spawn([o, g], [o], t + 0.62);
  }

  function PulseSwell(t, level) {
    if (Full()) return;
    const n = Src(brownBuf, true);
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(120, t);
    lp.frequency.linearRampToValueAtTime(420, t + 1.6);
    lp.frequency.linearRampToValueAtTime(140, t + 2.6);
    const g = ac.createGain();
    AD(g.gain, t, level * 0.8, 1.4, 1.2);
    n.connect(lp); lp.connect(g); g.connect(layers.pulse.node);
    n.start(t, Rand(0, 2));
    Spawn([n, lp, g], [n], t + 2.8);
  }

  // -------------------------------------------------------------------------
  // 环境层：地面（风 + 偶尔的蝉/鸟）/ 地下（土层闷响 + 稀疏滴水）
  // -------------------------------------------------------------------------
  const ambSurface = ac.createGain();
  const ambUnder = ac.createGain();
  const ambEvent = ac.createGain();
  ambSurface.gain.value = 1;
  ambUnder.gain.value = 0;
  ambEvent.gain.value = 1;
  for (const g of [ambSurface, ambUnder, ambEvent]) g.connect(ambBus);

  function BuildWind() {
    const n = Src(brownBuf, true);
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = 460; bp.Q.value = 0.55;
    const g = ac.createGain();
    g.gain.value = 0.08;
    n.connect(bp); bp.connect(g); g.connect(ambSurface);
    // 阵风：慢 LFO 推截止频率而不是音量，听起来才像风穿过东西而不是有人拧旋钮
    const gust = ac.createOscillator();
    gust.type = "sine"; gust.frequency.value = 0.058;
    const gustAmt = ac.createGain();
    gustAmt.gain.value = 230;
    gust.connect(gustAmt); gustAmt.connect(bp.frequency);
    const gust2 = ac.createGain();
    gust2.gain.value = 0.035;
    gust.connect(gust2); gust2.connect(g.gain);
    gust.start(ac.currentTime);
    n.start(ac.currentTime);
    resident.push(n, bp, g, gust, gustAmt, gust2);
  }

  function BuildEarth() {
    const n = Src(brownBuf, true);
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 88; lp.Q.value = 0.6;
    // 只留 40~88Hz 这一条。低通之后的布朗噪声本质上还是随机游走，
    // 不掐掉次声，地下段的电平会被听不见的东西整个顶起来
    const hp = ac.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 40; hp.Q.value = 0.7;
    const g = ac.createGain();
    // 闷响只做背景垫。之前给到 0.16 时它的能量比配乐本身还大——
    // 在笔记本喇叭上几乎听不见，戴耳机却是一整条压着人的低频
    g.gain.value = 0.07;
    n.connect(lp); lp.connect(hp); hp.connect(g); g.connect(ambUnder);
    n.start(ac.currentTime);
    resident.push(n, lp, hp, g);
    // 极轻的高处气流。地上/地下的差别不能只体现在低频：小喇叭放不出低频，
    // 换了个空间这件事就会完全没被听见
    const hiss = Src(whiteBuf, true);
    const hbp = ac.createBiquadFilter();
    hbp.type = "bandpass"; hbp.frequency.value = 1400; hbp.Q.value = 0.8;
    const hg = ac.createGain();
    hg.gain.value = 0.018;
    hiss.connect(hbp); hbp.connect(hg); hg.connect(ambUnder);
    hiss.start(ac.currentTime);
    resident.push(hiss, hbp, hg);
  }

  function Drip(t, level, dest) {
    if (Full()) return;
    const o = ac.createOscillator();
    o.type = "sine";
    const f = Rand(780, 1350);
    // 水滴的音高是往上走的（残留空腔越来越小），做成往下走就成了卡通"泡泡"音
    o.frequency.setValueAtTime(f * 0.62, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.055);
    const g = ac.createGain();
    AD(g.gain, t, level * 0.16, 0.003, 0.12);
    o.connect(g);
    const tail = Out(g, dest || ambEvent, Rand(-0.6, 0.6));
    o.start(t);
    Spawn([o, g, ...tail], [o], t + 0.22);
  }

  function Cicada(t) {
    if (Full()) return;
    const n = Src(whiteBuf, true);
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = Rand(3600, 4600); bp.Q.value = 14;
    const g = ac.createGain();
    const dur = Rand(1.6, 3.2);
    AD(g.gain, t, 0.030, 0.5, dur);
    // 蝉的那股"锯"味是快速振幅调制，不是音高抖
    const am = ac.createOscillator();
    am.type = "sine"; am.frequency.value = Rand(48, 68);
    const amAmt = ac.createGain();
    amAmt.gain.value = 0.4;
    am.connect(amAmt);
    const vca = ac.createGain();
    vca.gain.value = 0.6;
    amAmt.connect(vca.gain);
    n.connect(bp); bp.connect(vca); vca.connect(g);
    const tail = Out(g, ambEvent, Rand(-0.8, 0.8));
    n.start(t, Rand(0, 1)); am.start(t);
    Spawn([n, bp, g, am, amAmt, vca, ...tail], [n, am], t + dur + 0.6);
  }

  function Bird(t) {
    if (Full()) return;
    const pan = Rand(-0.8, 0.8);
    const count = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i += 1) {
      const at = t + i * Rand(0.11, 0.19);
      const o = ac.createOscillator();
      o.type = "sine";
      const f = Rand(2100, 3200);
      o.frequency.setValueAtTime(f * 0.8, at);
      o.frequency.exponentialRampToValueAtTime(f, at + 0.03);
      o.frequency.exponentialRampToValueAtTime(f * 0.85, at + 0.07);
      const g = ac.createGain();
      AD(g.gain, at, 0.022, 0.008, 0.06);
      o.connect(g);
      const tail = Out(g, ambEvent, pan);
      o.start(at);
      Spawn([o, g, ...tail], [o], at + 0.14);
    }
  }

  // -------------------------------------------------------------------------
  // 音效表。不认识的名字直接忽略——调用方多打一个名字不该让游戏出声或报错
  // -------------------------------------------------------------------------
  function NoiseHit(t, opt) {
    const {
      dest = sfxBus, level = 0.2, attack = 0.002, decay = 0.1,
      type = "lowpass", freq = 1200, q = 1, sweep = 0, brown = false, pan = 0,
    } = opt;
    if (Full()) return;
    const n = Src(brown ? brownBuf : whiteBuf, true);
    const f = ac.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(Math.max(20, freq), t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(20, sweep), t + attack + decay);
    const g = ac.createGain();
    AD(g.gain, t, level, attack, decay);
    n.connect(f); f.connect(g);
    const tail = Out(g, dest, pan);
    // 每次从噪声缓冲的随机位置起播：固定起点会让同一个音效每次一模一样，
    // 脚步这种高频复用的音很快就听出"贴图"感
    n.start(t, Rand(0, 1.5));
    Spawn([n, f, g, ...tail], [n], t + attack + decay + 0.08);
  }

  function Tone(t, opt) {
    const {
      dest = sfxBus, level = 0.2, attack = 0.004, decay = 0.2,
      type = "sine", freq = 220, to = 0, pan = 0,
    } = opt;
    if (Full()) return;
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(8, freq), t);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(8, to), t + attack + decay);
    const g = ac.createGain();
    AD(g.gain, t, level, attack, decay);
    o.connect(g);
    const tail = Out(g, dest, pan);
    o.start(t);
    Spawn([o, g, ...tail], [o], t + attack + decay + 0.08);
  }

  // 每个音效收到 (起始时刻 t, 音量系数 k, 声像 pan, 音高系数 r)。
  // k 与 r 分开：同一个脚步换个音量不该跟着变调，换个人（体重/鞋）才该变调。
  const SFX = {
    // 地面脚步：干土地，短促、带一点砂
    step(t, k, pan, r) {
      NoiseHit(t, { level: 0.075 * k, attack: 0.002, decay: 0.075, freq: 1500 * r, sweep: 420 * r, q: 0.9, pan });
      Tone(t, { level: 0.055 * k, attack: 0.003, decay: 0.05, type: "sine", freq: 95 * r, to: 62 * r, pan });
    },
    // 地道脚步：闷、湿、余音长一点。同一双鞋，换了个空间
    stepTunnel(t, k, pan, r) {
      NoiseHit(t, { level: 0.070 * k, attack: 0.002, decay: 0.11, freq: 620 * r, sweep: 200 * r, q: 1.1, brown: true, pan });
      Tone(t, { level: 0.070 * k, attack: 0.004, decay: 0.13, type: "sine", freq: 78 * r, to: 48 * r, pan });
      NoiseHit(t + 0.03, { level: 0.020 * k, attack: 0.004, decay: 0.22, freq: 190, q: 4, pan });
    },
    // 挖土：一记闷镐 + 一把散土落地
    dig(t, k, pan, r) {
      Tone(t, { level: 0.13 * k, attack: 0.004, decay: 0.16, type: "triangle", freq: 130 * r, to: 62 * r, pan });
      NoiseHit(t + 0.02, { level: 0.10 * k, attack: 0.01, decay: 0.32, freq: 1500 * r, sweep: 380, q: 0.8, pan });
      NoiseHit(t + 0.18, { level: 0.045 * k, attack: 0.03, decay: 0.30, freq: 2600, sweep: 900, q: 0.7, pan });
    },
    pickup(t, k, pan, r) {
      NoiseHit(t, { level: 0.05 * k, attack: 0.002, decay: 0.05, freq: 2400, q: 1.6, pan });
      Tone(t + 0.01, { level: 0.055 * k, attack: 0.005, decay: 0.16, type: "triangle", freq: 520 * r, to: 660 * r, pan });
    },
    drop(t, k, pan, r) {
      Tone(t, { level: 0.11 * k, attack: 0.003, decay: 0.18, type: "triangle", freq: 165 * r, to: 88 * r, pan });
      NoiseHit(t, { level: 0.055 * k, attack: 0.002, decay: 0.12, freq: 900, sweep: 260, q: 1.4, pan });
    },
    // 木梯：一记横档的"托"，跟一声木头受力的吱呀
    ladder(t, k, pan, r) {
      NoiseHit(t, { level: 0.075 * k, attack: 0.003, decay: 0.09, freq: 470 * r, q: 5.5, pan });
      NoiseHit(t + 0.05, { level: 0.030 * k, attack: 0.06, decay: 0.30, freq: 1100 * r, sweep: 1600 * r, q: 7, pan });
    },
    waterSplash(t, k, pan) {
      NoiseHit(t, { level: 0.13 * k, attack: 0.004, decay: 0.30, freq: 700, sweep: 2600, q: 0.7, pan });
      NoiseHit(t + 0.05, { level: 0.07 * k, attack: 0.02, decay: 0.42, freq: 1800, sweep: 420, q: 0.8, pan });
      for (let i = 0; i < 3; i += 1) Drip(t + Rand(0.12, 0.55), 0.5 * k, sfxBus);
    },
    // 灌水：日军往地道里放水。要的是"越来越近、盖过来"，不是水龙头
    waterRush(t, k, pan) {
      NoiseHit(t, { level: 0.16 * k, attack: 0.55, decay: 1.9, freq: 380, sweep: 1500, q: 0.6, pan });
      NoiseHit(t + 0.1, { level: 0.10 * k, attack: 0.8, decay: 1.7, freq: 2200, sweep: 600, q: 0.5, brown: true, pan });
      for (let i = 0; i < 5; i += 1) Drip(t + Rand(0.3, 2.2), 0.4 * k, sfxBus);
    },
    smokeWhoosh(t, k, pan) {
      NoiseHit(t, { level: 0.085 * k, attack: 0.35, decay: 1.15, freq: 320, sweep: 1700, q: 0.7, pan });
      NoiseHit(t + 0.25, { level: 0.045 * k, attack: 0.4, decay: 1.0, freq: 1400, sweep: 380, q: 0.9, brown: true, pan });
    },
    // 枪声：短、干、不英雄。一声脆裂 + 一点院墙的回头，就到此为止
    gunshot(t, k, pan) {
      NoiseHit(t, { level: 0.30 * k, attack: 0.001, decay: 0.045, type: "highpass", freq: 1800, q: 0.6, pan });
      NoiseHit(t, { level: 0.20 * k, attack: 0.002, decay: 0.16, freq: 900, sweep: 180, q: 0.8, brown: true, pan });
      Tone(t, { level: 0.14 * k, attack: 0.002, decay: 0.13, type: "sine", freq: 130, to: 52, pan });
      NoiseHit(t + 0.11, { level: 0.050 * k, attack: 0.01, decay: 0.35, freq: 700, sweep: 260, q: 0.9, pan: -pan });
    },
    explosion(t, k, pan) {
      Tone(t, { level: 0.34 * k, attack: 0.012, decay: 1.15, type: "sine", freq: 78, to: 26, pan });
      NoiseHit(t, { level: 0.20 * k, attack: 0.006, decay: 1.35, freq: 1400, sweep: 130, q: 0.6, brown: true, pan });
      NoiseHit(t + 0.02, { level: 0.11 * k, attack: 0.002, decay: 0.20, type: "highpass", freq: 2600, q: 0.6, pan });
      // 碎土落回来：爆炸真正吓人的是后面这一阵，不是那一下
      for (let i = 0; i < 6; i += 1) {
        NoiseHit(t + Rand(0.25, 1.5), { level: 0.028 * k, attack: 0.002, decay: 0.07, freq: Rand(700, 2400), q: 2, pan: Rand(-0.8, 0.8) });
      }
    },
    // 村口挂的那口"钟"（多半是半截铁轨）：非谐波分音才有金属味，整数倍会变成风琴
    bell(t, k, pan, r) {
      const base = Rand(590, 660) * r;
      const partials = [1, 2.76, 5.40, 8.93, 11.3];
      const gains = [1, 0.42, 0.24, 0.13, 0.08];
      const decays = [3.0, 2.1, 1.5, 0.9, 0.6];
      for (let i = 0; i < partials.length; i += 1) {
        Tone(t, {
          level: 0.10 * k * gains[i], attack: 0.004, decay: decays[i],
          type: "sine", freq: base * partials[i], pan,
        });
      }
      NoiseHit(t, { level: 0.09 * k, attack: 0.001, decay: 0.05, type: "bandpass", freq: base * 4, q: 2, pan });
    },
    // 铜锣：报警的那一面锣——比钟更"哐"，衰减里带着颤
    gong(t, k, pan) {
      const base = 396;
      const partials = [1, 1.48, 2.31, 3.62, 5.04];
      const gains = [1, 0.6, 0.38, 0.2, 0.1];
      for (let i = 0; i < partials.length; i += 1) {
        Tone(t, {
          level: 0.16 * k * gains[i], attack: 0.003, decay: 2.4 - i * 0.34,
          type: "sine", freq: base * partials[i], pan,
        });
      }
      // 锣面的沙震
      NoiseHit(t, { level: 0.12 * k, attack: 0.002, decay: 0.5, freq: 900, sweep: 300, q: 1.1, brown: true, pan });
      NoiseHit(t + 0.02, { level: 0.05 * k, attack: 0.01, decay: 1.2, freq: 2400, sweep: 600, q: 2, pan });
    },
    // 母鸡受惊：两声急促的咯哒 + 扑翅
    henSquawk(t, k, pan) {
      for (let i = 0; i < 2; i += 1) {
        Tone(t + i * 0.14, { level: 0.09 * k, attack: 0.006, decay: 0.1, type: "square", freq: 760 - i * 120, to: 420, pan });
      }
      for (let i = 0; i < 5; i += 1) {
        NoiseHit(t + 0.05 + i * 0.07, { level: 0.05 * k, attack: 0.004, decay: 0.05, freq: 1500, sweep: 500, q: 1.2, pan });
      }
    },
    // 惊飞的麻雀：一阵密集的小扑翅由近到远
    flutter(t, k, pan) {
      for (let i = 0; i < 9; i += 1) {
        NoiseHit(t + i * 0.05, {
          level: (0.05 - i * 0.004) * k, attack: 0.003, decay: 0.04,
          freq: 2200 + Rand(-400, 400), sweep: 700, q: 1.4, pan: Clamp(pan + Rand(-0.4, 0.4), -1, 1),
        });
      }
      Tone(t + 0.1, { level: 0.03 * k, attack: 0.01, decay: 0.12, type: "sine", freq: 3400, to: 4200, pan });
    },
    // 憋着的哭：压低的两下抽气——不是哭声，是不许自己哭出声的呼吸
    sobBreath(t, k, pan) {
      NoiseHit(t, { level: 0.05 * k, attack: 0.09, decay: 0.16, freq: 700, sweep: 380, q: 2.4, pan });
      NoiseHit(t + 0.42, { level: 0.065 * k, attack: 0.06, decay: 0.2, freq: 640, sweep: 320, q: 2.6, pan });
      NoiseHit(t + 1.1, { level: 0.04 * k, attack: 0.1, decay: 0.3, freq: 560, sweep: 240, q: 2.2, pan });
    },
    // 敲木楔：比 knock 更实的一记——榫头吃紧的"笃"
    tenon(t, k, pan, r) {
      NoiseHit(t, { level: 0.17 * k, attack: 0.001, decay: 0.05, freq: 420 * r, q: 6, pan });
      Tone(t, { level: 0.09 * k, attack: 0.002, decay: 0.12, type: "triangle", freq: 190 * r, to: 120 * r, pan });
      NoiseHit(t + 0.015, { level: 0.05 * k, attack: 0.001, decay: 0.03, freq: 2100, q: 1.6, pan });
    },
    // 投掷破空：很短的一瞬风声
    whoosh(t, k, pan) {
      NoiseHit(t, { level: 0.07 * k, attack: 0.015, decay: 0.16, freq: 1300, sweep: 2800, q: 0.8, pan });
    },
    // 翻越起手：两只手掌拍在柴垛顶沿上，柴棍互相一错——落地是另一条 cue，
    // 因为脚落地比动作结束早，声音得跟着脚走
    vault(t, k, pan) {
      NoiseHit(t, { level: 0.10 * k, attack: 0.002, decay: 0.07, freq: 620, q: 2.2, pan });
      NoiseHit(t + 0.02, { level: 0.055 * k, attack: 0.002, decay: 0.05, freq: 2100, q: 1.4, pan });
      // 柴棍错动：三四粒木头互相磕
      for (let i = 0; i < 4; i += 1) {
        NoiseHit(t + 0.05 + Rand(0, 0.22), { level: Rand(0.018, 0.038) * k, attack: 0.001, decay: Rand(0.02, 0.05), freq: Rand(900, 2600), q: 3, pan: Clamp(pan + Rand(-0.15, 0.15), -1, 1) });
      }
      NoiseHit(t + 0.18, { level: 0.045 * k, attack: 0.02, decay: 0.16, freq: 1400, sweep: 600, q: 0.9, pan });
    },
    // 扛着东西翻：先把东西撂上顶沿（一记闷响），再翻
    vaultHeavy(t, k, pan) {
      NoiseHit(t, { level: 0.09 * k, attack: 0.002, decay: 0.11, freq: 380, q: 2.6, pan });
      Tone(t, { level: 0.06 * k, attack: 0.003, decay: 0.14, type: "triangle", freq: 150, to: 92, pan });
      SFX.vault(t + 0.22, k * 0.9, pan);
    },
    // 落地：脚掌拍在干土上，一点碎土跟着落
    vaultLand(t, k, pan) {
      NoiseHit(t, { level: 0.085 * k, attack: 0.002, decay: 0.09, freq: 520, sweep: 200, q: 1.2, brown: true, pan });
      Tone(t, { level: 0.07 * k, attack: 0.003, decay: 0.10, type: "sine", freq: 104, to: 62, pan });
      for (let i = 0; i < 3; i += 1) {
        NoiseHit(t + 0.06 + Rand(0, 0.18), { level: Rand(0.008, 0.02) * k, attack: 0.002, decay: 0.03, freq: Rand(1600, 3600), q: 3, pan });
      }
    },
    // 石子落地：一记小而干的磕碰，再滚两下停住。声音引敌那条规则就靠它被听见
    stoneLand(t, k, pan) {
      NoiseHit(t, { level: 0.075 * k, attack: 0.001, decay: 0.045, freq: 1500, q: 3.2, pan });
      Tone(t, { level: 0.03 * k, attack: 0.002, decay: 0.06, type: "triangle", freq: 380, to: 210, pan });
      for (let i = 0; i < 2; i += 1) {
        NoiseHit(t + 0.08 + i * 0.07, { level: (0.028 - i * 0.01) * k, attack: 0.001, decay: 0.03, freq: Rand(1800, 3000), q: 3, pan });
      }
    },
    // 辘轳：木轴在木架里叫的一声，带一点绳子过木头的摩擦
    crank(t, k, pan, r) {
      Tone(t, { level: 0.045 * k, attack: 0.05, decay: 0.30, type: "sawtooth", freq: 210 * r, to: 168 * r, pan });
      NoiseHit(t + 0.02, { level: 0.03 * k, attack: 0.06, decay: 0.26, freq: 900, sweep: 520, q: 2.6, pan });
    },
    // 石笔划木头：一段砂砂的蹭，不是"叮"一声
    scribe(t, k, pan) {
      NoiseHit(t, { level: 0.05 * k, attack: 0.05, decay: 0.42, freq: 2400, sweep: 1500, q: 1.1, pan });
      NoiseHit(t + 0.06, { level: 0.022 * k, attack: 0.08, decay: 0.34, freq: 1100, q: 1.8, brown: true, pan });
    },
    // 点灯：火柴擦一下，然后油捻子起来
    lampOn(t, k, pan) {
      NoiseHit(t, { level: 0.10 * k, attack: 0.006, decay: 0.16, freq: 3000, sweep: 900, q: 0.8, pan });
      NoiseHit(t + 0.06, { level: 0.035 * k, attack: 0.30, decay: 0.75, freq: 620, q: 1.2, pan });
      for (let i = 0; i < 4; i += 1) {
        NoiseHit(t + Rand(0.1, 0.8), { level: 0.016 * k, attack: 0.002, decay: 0.03, freq: Rand(1600, 4200), q: 3, pan });
      }
    },
    // 灭灯：一口气把火吹没。画面要黑，这一声得比画面早一点点
    lampOut(t, k, pan) {
      NoiseHit(t, { level: 0.085 * k, attack: 0.012, decay: 0.20, freq: 800, sweep: 220, q: 0.7, pan });
      Tone(t, { level: 0.035 * k, attack: 0.008, decay: 0.16, type: "sine", freq: 330, to: 150, pan });
    },
    // 心跳：低沉的两下。这个音不能"好听"，得有点堵
    heartbeat(t, k, pan, r) {
      Tone(t, { level: 0.24 * k, attack: 0.012, decay: 0.19, type: "sine", freq: 62 * r, to: 36 * r, pan });
      Tone(t + 0.20, { level: 0.15 * k, attack: 0.012, decay: 0.16, type: "sine", freq: 55 * r, to: 33 * r, pan });
    },
    // 敲门/敲墙暗号：木头腔体的共鸣决定了它是"门"而不是"桌子"
    knock(t, k, pan, r) {
      NoiseHit(t, { level: 0.16 * k, attack: 0.001, decay: 0.055, freq: 300 * r, q: 7, pan });
      NoiseHit(t, { level: 0.07 * k, attack: 0.001, decay: 0.030, freq: 1500 * r, q: 1.5, pan });
      Tone(t, { level: 0.06 * k, attack: 0.002, decay: 0.10, type: "triangle", freq: 150 * r, to: 96 * r, pan });
    },
    // 油灯/柴火的噼啪：几粒随机小爆点，不能做成连续的"沙沙"
    crackle(t, k, pan) {
      const count = 3 + Math.floor(Math.random() * 4);
      for (let i = 0; i < count; i += 1) {
        NoiseHit(t + Rand(0, 0.45), { level: Rand(0.012, 0.038) * k, attack: 0.001, decay: Rand(0.015, 0.05), freq: Rand(1100, 3800), q: 2.5, pan: Clamp(pan + Rand(-0.2, 0.2), -1, 1) });
      }
    },
    // UI 两声都取自音阶内的音：菜单音和配乐不同调会很别扭
    uiSelect(t, k, pan, r) {
      Tone(t, { level: 0.045 * k, attack: 0.004, decay: 0.07, type: "sine", freq: Hz(69) * r, pan });
    },
    uiConfirm(t, k, pan, r) {
      Tone(t, { level: 0.050 * k, attack: 0.004, decay: 0.13, type: "sine", freq: Hz(62) * r, pan });
      Tone(t + 0.075, { level: 0.045 * k, attack: 0.004, decay: 0.20, type: "sine", freq: Hz(69) * r, pan });
    },
  };

  // -------------------------------------------------------------------------
  // 排程器
  // -------------------------------------------------------------------------
  let mood = "calm";
  let stepIndex = 0;
  let nextNote = ac.currentTime + 0.15;
  let phraseRest = false;
  let degree = 3;                 // 旋律游标，走音阶而不是跳音程
  let leadNextStep = 24;
  let enabled = true;
  let volume = 0.8;
  let duckManual = false;
  let duckVoice = false;

  function Def() { return Has(MOODS, mood) ? MOODS[mood] : MOODS.calm; }

  function ScheduleStep(t, index) {
    const m = Def();
    const warm = mood === "resolve";

    // 八步一句。句与句之间按 rest 概率整句留白——留白是这套配乐的主要手段，
    // 一直有音符会把"安静的恐惧"填满
    if (index % 8 === 0) phraseRest = Chance(m.rest);

    const pluckGain = LayerNow("pluck");
    if (pluckGain > 0.02 && !phraseRest) {
      const beat = index % 8;
      const hit = beat === 0 ? 0.92 : (beat === 3 ? 0.55 : (beat === 5 ? 0.42 : 0.16));
      if (Chance(hit)) {
        // 级进为主，偶尔四度跳。民间旋律很少大跳，跳多了像即兴爵士
        degree += Chance(0.7) ? (Chance(0.5) ? 1 : -1) : (Chance(0.5) ? 2 : -2);
        degree = Clamp(degree, warm ? 2 : 0, 11);
        const midi = Degree(degree, 50 + m.reg);
        Pluck(t, midi, Rand(0.16, 0.27), warm);
        // 低八度的根音偶尔垫一下，句子才有底
        if (beat === 0 && Chance(0.45)) Pluck(t + 0.02, Degree(0, 38 + m.reg), 0.13, warm);
      }
    }

    if (LayerNow("lead") > 0.03 && m.leadEvery > 0 && index >= leadNextStep) {
      const warmLead = warm;
      const count = 3 + Math.floor(Math.random() * 3);
      const midis = [];
      let d = degree;
      for (let i = 0; i < count; i += 1) {
        d += i === 0 ? 0 : (Chance(0.72) ? (Chance(0.55) ? 1 : -1) : (Chance(0.5) ? 2 : -3));
        d = Clamp(d, 0, 10);
        midis.push(Degree(d, 62 + m.reg));
      }
      degree = d;
      LeadPhrase(t, midis, Rand(0.13, 0.19), warmLead);
      leadNextStep = index + m.leadEvery + Math.floor(Math.random() * 6);
    }

    // 层增益本身已经在做淡入淡出，这里给固定电平就行，再乘一次会淡两遍
    if (LayerNow("pulse") > 0.03) {
      if (index % 2 === 0) PulseHit(t, 0.22);
      if (index % 16 === 0) PulseSwell(t, 0.16);
    }

    // 地道里那种远处的滴水：它属于音乐还是环境说不清，反正 tunnel 里必须有
    if (m.drip > 0 && Chance(m.drip)) Drip(t + Rand(0, 0.5), Rand(0.5, 1.0), null);
  }

  function Tick() {
    if (disposed || !enabled) return;
    const now = ac.currentTime;
    // 页面被挂起很久后 currentTime 会跳一大截。不重新对齐的话，
    // while 循环会一口气把几百个音符全排出来，回到前台是一声轰
    if (nextNote < now) { nextNote = now + 0.06; }
    let guard = 0;
    while (nextNote < now + LOOKAHEAD && guard < 32) {
      ScheduleStep(nextNote, stepIndex);
      nextNote += Def().step;
      stepIndex += 1;
      guard += 1;
    }
    Purge(now);
  }

  let timer = null;
  function StartTimer() {
    // 注入上下文（离线渲染）时不能起真实计时器：那边的时钟由宿主用 Update 推
    if (timer !== null || offline || typeof setInterval !== "function") return;
    timer = setInterval(Tick, TICK_MS);
  }

  // -------------------------------------------------------------------------
  // 每帧状态
  // -------------------------------------------------------------------------
  let level = "surface";
  let levelApplied = false;        // 已排进自动化的地上/地下状态（false=地上）
  let stepPhase = 999;
  let heartPhase = 0;
  let detection = 0;
  let ambNext = 0;
  let filterTarget = 1900;

  function ApplyMood() {
    const m = Def();
    for (const k of LAYER_KEYS) SetLayer(k, m[k]);
    if (musicWet) musicWet.gain.setTargetAtTime(m.wet, ac.currentTime, 0.6);
    // 换到以二胡为主的段落时让它早点进来：情绪落地的那一下就该听见弓
    if (m.lead > 0.3) leadNextStep = Math.min(leadNextStep, stepIndex + 2);
  }

  function ApplyDuck() {
    const on = duckManual || duckVoice;
    const now = ac.currentTime;
    duck.gain.cancelScheduledValues(now);
    duck.gain.setValueAtTime(duck.gain.value, now);
    duck.gain.linearRampToValueAtTime(on ? 0.30 : 1, now + (on ? 0.22 : 0.5));
  }

  function ApplyVolume() {
    const now = ac.currentTime;
    const target = enabled ? Clamp(volume, 0, 1) : 0;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(target, now + 0.12);
  }

  // 关掉声音之后还让几十个振荡器加一个卷积混响空转，纯粹是浪费电。
  // 但不能立刻挂起：得等淡出走完，否则等于把淡出斩断成一声"咔"。
  let parkTimer = null;
  function ApplyPower() {
    if (offline) return;                       // 离线渲染的时钟由宿主推，不能碰
    if (parkTimer !== null) { clearTimeout(parkTimer); parkTimer = null; }
    if (!enabled) {
      parkTimer = setTimeout(() => {
        parkTimer = null;
        if (disposed || enabled || typeof ac.suspend !== "function") return;
        try { const p = ac.suspend(); if (p && p.catch) p.catch(() => {}); } catch (ignored) { /* 已挂起 */ }
      }, 260);
    } else if (ac.state === "suspended" && typeof ac.resume === "function") {
      // 重新打开一般发生在设置面板里，本身就在用户手势中，iOS 也放行
      try { const p = ac.resume(); if (p && p.catch) p.catch(() => {}); } catch (ignored) { /* 手势外被拒 */ }
    }
  }

  // 旁白：用 HTMLAudioElement 播，尽量接进音频图（这样总音量/静音才管得住它）
  let voiceEl = null;
  let voiceNode = null;
  let voiceFinish = null;

  function ClearVoice() {
    if (voiceNode) { try { voiceNode.disconnect(); } catch (ignored) { /* 已断 */ } voiceNode = null; }
    if (voiceEl) {
      try { voiceEl.pause(); voiceEl.src = ""; } catch (ignored) { /* 元素已废 */ }
      voiceEl = null;
    }
    voiceFinish = null;
  }

  // 章节录音 BGM：双播放器交叉淡化，MediaElementSource 接入 musicBus，因而自动继承
  // 配乐滑块、旁白 ducking、侦测低通与总线限幅。曲尾回到 cue，而不是回到片头静音。
  const bgmSlots = [];
  let activeBgm = null;
  let requestedBgm = null;
  let bgmSerial = 0;

  function RampParam(param, value, seconds = 1.4) {
    const now = ac.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(value, now + seconds);
  }

  function PauseBgmSlot(slot, clearSource = false) {
    if (!slot) return;
    try { slot.el.pause(); } catch (ignored) { /* 已停 */ }
    if (clearSource) {
      try { slot.el.removeAttribute("src"); slot.el.load(); } catch (ignored) { /* 已清 */ }
      slot.id = "";
    }
  }

  function MakeBgmSlot() {
    if (typeof Audio === "undefined" || typeof ac.createMediaElementSource !== "function") return null;
    try {
      const el = new Audio();
      el.preload = "auto";
      const node = ac.createMediaElementSource(el);
      const gain = ac.createGain();
      gain.gain.value = 0;
      node.connect(gain);
      gain.connect(musicBus);
      const slot = { el, node, gain, id: "", cue: 0, targetGain: 0, serial: 0, pauseTimer: null };
      el.addEventListener("ended", () => {
        if (disposed || slot !== activeBgm || !requestedBgm || slot.id !== requestedBgm.id) return;
        try {
          el.currentTime = slot.cue;
          if (enabled) {
            const p = el.play();
            if (p && p.catch) p.catch(() => {});
          }
        } catch (ignored) { /* 浏览器稍后会再尝试 */ }
      });
      bgmSlots.push(slot);
      return slot;
    } catch (error) {
      return null;
    }
  }

  function FadeToSynth() {
    RampParam(synthBus.gain, 1, 1.1);
  }

  function ActivateBgm(slot, serial) {
    if (disposed || serial !== bgmSerial || !requestedBgm || slot.id !== requestedBgm.id) return;
    const old = activeBgm;
    activeBgm = slot;
    RampParam(slot.gain.gain, slot.targetGain, 1.5);
    RampParam(synthBus.gain, 0, 1.5);
    if (old && old !== slot) {
      RampParam(old.gain.gain, 0, 1.5);
      if (old.pauseTimer !== null) clearTimeout(old.pauseTimer);
      old.pauseTimer = setTimeout(() => {
        old.pauseTimer = null;
        if (old !== activeBgm) PauseBgmSlot(old, true);
      }, 1650);
    }
  }

  function TryPlayBgm(slot, serial) {
    if (disposed || !enabled || serial !== bgmSerial || !requestedBgm || slot.id !== requestedBgm.id) return;
    try {
      if (Number.isFinite(slot.el.duration) && slot.el.duration > 0
        && (!Number.isFinite(slot.el.currentTime) || slot.el.currentTime < slot.cue - 0.25)) {
        slot.el.currentTime = Math.min(slot.cue, Math.max(0, slot.el.duration - 0.25));
      }
      const p = slot.el.play();
      if (p && typeof p.then === "function") p.then(() => ActivateBgm(slot, serial)).catch(() => {});
      else ActivateBgm(slot, serial);
    } catch (ignored) { /* 下一次用户手势会重试 */ }
  }

  function ResumeBgm() {
    if (!enabled || !requestedBgm) return;
    const slot = bgmSlots.find((item) => item.id === requestedBgm.id);
    if (slot) TryPlayBgm(slot, slot.serial);
  }

  function ClearBgm() {
    bgmSerial += 1;
    requestedBgm = null;
    activeBgm = null;
    for (const slot of bgmSlots) {
      if (slot.pauseTimer !== null) { clearTimeout(slot.pauseTimer); slot.pauseTimer = null; }
      RampParam(slot.gain.gain, 0, 0.7);
      PauseBgmSlot(slot, true);
    }
    FadeToSynth();
  }

  ApplyMood();
  BuildDrone();
  BuildPad();
  BuildWind();
  BuildEarth();

  const api = {
    Unlock() {
      if (disposed) return;
      try {
        // iOS Safari 的上下文出生就是 suspended，且只有用户手势里 resume 才管用。
        // 反复调无害：已经 running 时 resume 是空操作。
        // 用户主动关过声音就别叫醒它，否则设置里的开关会被下一次点击推翻
        if (enabled && !offline && ac.state !== "running" && typeof ac.resume === "function") {
          const p = ac.resume();
          if (p && typeof p.catch === "function") p.catch(() => {});
        }
      } catch (ignored) { /* 手势外调用会被拒，忽略 */ }
      if (nextNote < ac.currentTime) nextNote = ac.currentTime + 0.15;
      if (ambNext <= 0) ambNext = ac.currentTime + Rand(1.5, 4);
      StartTimer();
      Tick();
      ResumeBgm();
    },

    SetEnabled(on) {
      if (disposed) return;
      const next = !!on;
      if (next === enabled) return;
      enabled = next;
      ApplyPower();
      ApplyVolume();
      if (enabled) { nextNote = ac.currentTime + 0.15; StartTimer(); Tick(); ResumeBgm(); }
      else for (const slot of bgmSlots) PauseBgmSlot(slot);
    },

    IsEnabled() { return enabled && !disposed; },

    SetMasterVolume(v) {
      if (disposed) return;
      volume = Clamp(Number.isFinite(v) ? v : 0.8, 0, 1);
      ApplyVolume();
    },

    SetMusicVolume(v) { if (!disposed) SetBusLevel("music", v); },
    SetSfxVolume(v) { if (!disposed) SetBusLevel("sfx", v); },
    SetVoiceVolume(v) { if (!disposed) SetBusLevel("voice", v); },

    SetMood(next) {
      if (disposed || !Has(MOODS, next) || next === mood) return;
      mood = next;
      ApplyMood();
    },

    SetBgm(next) {
      if (disposed || offline || !next || !next.id || !next.url || next.hasVocals !== false) return;
      if (requestedBgm?.id === next.id) return;
      requestedBgm = {
        id: String(next.id), url: String(next.url),
        cue: Math.max(0, Number(next.cue) || 0),
        gain: Clamp(Number.isFinite(next.gain) ? next.gain : 0.72, 0, 1),
      };
      const serial = ++bgmSerial;
      let slot = bgmSlots.find((item) => item !== activeBgm) || MakeBgmSlot();
      if (!slot) { FadeToSynth(); return; }
      PauseBgmSlot(slot, true);
      slot.id = requestedBgm.id;
      slot.cue = requestedBgm.cue;
      slot.targetGain = requestedBgm.gain;
      slot.serial = serial;
      slot.gain.gain.value = 0;
      const fail = () => {
        if (serial !== bgmSerial || slot.id !== requestedBgm?.id) return;
        if (activeBgm && activeBgm !== slot) {
          RampParam(activeBgm.gain.gain, 0, 0.8);
          PauseBgmSlot(activeBgm);
          activeBgm = null;
        }
        FadeToSynth();
      };
      slot.el.addEventListener("error", fail, { once: true });
      slot.el.addEventListener("loadedmetadata", () => {
        if (serial !== bgmSerial || slot.id !== requestedBgm?.id) return;
        try { slot.el.currentTime = Math.min(slot.cue, Math.max(0, slot.el.duration - 0.25)); } catch (ignored) { /* 等 canplay */ }
        TryPlayBgm(slot, serial);
      }, { once: true });
      try { slot.el.src = requestedBgm.url; slot.el.load(); } catch (error) { fail(); }
    },

    StopBgm() {
      if (disposed) return;
      ClearBgm();
    },

    // 只读诊断口，供浏览器冒烟测试确认真正起播、cue 与静音状态；不暴露控制能力。
    GetBgmState() {
      return {
        requested: requestedBgm?.id || null,
        active: activeBgm?.id || null,
        paused: activeBgm ? activeBgm.el.paused : true,
        currentTime: activeBgm ? activeBgm.el.currentTime : 0,
        cue: activeBgm ? activeBgm.cue : 0,
        synthGain: synthBus.gain.value,
        musicLevel: busLevel.music,
      };
    },

    LoadSfxPack(baseUrl) { try { LoadSamples(baseUrl); } catch (ignored) { /* 没有采样就用合成 */ } },
    SfxPackSize() { return samples.size; },

    Sfx(name, opts = {}) {
      if (disposed || !enabled) return;
      // Has 是防原型链的：SFX["toString"] 也是个函数，但它不是音效
      const fn = Has(SFX, name) ? SFX[name] : null;
      // 采样优先、合成兜底：名字两边都不认识才真的什么也不发
      if (!samples.has(name) && typeof fn !== "function") return;
      try {
        const k = Clamp(Number.isFinite(opts.gain) ? opts.gain : 1, 0, 4);
        const pan = Clamp(Number.isFinite(opts.pan) ? opts.pan : 0, -1, 1);
        const r = Clamp(Number.isFinite(opts.rate) ? opts.rate : 1, 0.25, 4);
        const delay = Math.max(0, Number.isFinite(opts.delay) ? opts.delay : 0);
        // 推后一点点再发：正好落在当前渲染块之后，起音的第一个采样点才是完整的
        const t = ac.currentTime + 0.012 + delay;
        if (PlaySample(name, t, k, pan, r)) return;
        if (typeof fn === "function") fn(t, k, pan, r);
      } catch (ignored) { /* 单个音效炸了不能拖垮主循环 */ }
    },

    Duck(on) {
      if (disposed) return;
      duckManual = !!on;
      ApplyDuck();
    },

    PlayVoice(url) {
      if (disposed || !enabled || !url || typeof Audio === "undefined") return Promise.resolve(false);
      api.StopVoice();
      let el = null;
      try {
        el = new Audio();
        el.src = url;
        el.preload = "auto";
      } catch (error) {
        return Promise.resolve(false);
      }
      voiceEl = el;
      duckVoice = true;
      ApplyDuck();
      try {
        // 接进音频图后总音量/静音才对旁白生效；跨域或离线上下文会抛，退回元素音量
        voiceNode = ac.createMediaElementSource(el);
        voiceNode.connect(voiceBus);
      } catch (error) {
        voiceNode = null;
        try { el.volume = Clamp(volume, 0, 1); } catch (ignored) { /* 只读环境 */ }
      }
      return new Promise((resolve) => {
        let done = false;
        const finish = (ok) => {
          if (done) return;
          done = true;
          if (voiceEl === el) { ClearVoice(); duckVoice = false; ApplyDuck(); }
          resolve(ok);
        };
        voiceFinish = finish;
        el.addEventListener("ended", () => finish(true));
        el.addEventListener("error", () => finish(false));
        try {
          const p = el.play();
          if (p && typeof p.catch === "function") p.catch(() => finish(false));
        } catch (error) {
          finish(false);
        }
      });
    },

    StopVoice() {
      if (disposed) return;
      const finish = voiceFinish;
      if (finish) { voiceFinish = null; ClearVoice(); duckVoice = false; ApplyDuck(); finish(false); }
      else if (voiceEl) { ClearVoice(); duckVoice = false; ApplyDuck(); }
    },

    // 第二个参数在外部叫 ctx（{moving, level, crouch, detection}），
    // 这里改叫 frame：本文件里 ctx 已经是 AudioContext 的意思，混着用早晚出事
    Update(dt, frame = {}) {
      if (disposed) return;
      const step = Clamp(Number.isFinite(dt) ? dt : 0, 0, 0.25);
      // 排程也从这里推一把：后台标签页里 setInterval 会被节流到 1s 以上，
      // 而 rAF 停了本来也不需要出声——两条路都走才在各种节流策略下都成立
      Tick();
      if (!enabled) return;
      const now = ac.currentTime;

      if (frame.level === "under" || frame.level === "surface") level = frame.level;
      const under = level === "under";
      // 只在真的换了地方时才排自动化。每帧都调 setTargetAtTime 的话，
      // 半小时下来单个参数上会堆出十万条事件，纯属白烧 CPU
      if (under !== levelApplied) {
        levelApplied = under;
        ambSurface.gain.setTargetAtTime(under ? 0 : 1, now, 0.45);
        ambUnder.gain.setTargetAtTime(under ? 1 : 0, now, 0.45);
        if (sfxWet) sfxWet.gain.setTargetAtTime(under ? 0.34 : 0.09, now, 0.6);
      }

      // 环境点缀：地面偶有蝉/鸟，地下偶有滴水。间隔拉得很开，多了就成了音效展示
      if (ambNext <= 0) ambNext = now + Rand(1.5, 4);
      if (now >= ambNext) {
        if (under) Drip(now + 0.02, Rand(0.6, 1.1), null);
        else if (Chance(0.55)) Cicada(now + 0.02);
        else Bird(now + 0.02);
        ambNext = now + (under ? Rand(2.6, 7.5) : Rand(4.5, 13));
      }

      // 脚步由这里驱动，调用方不该自己数节奏——蹲行的慢半拍是玩法信息
      const cadence = (under ? 0.50 : 0.44) * (frame.crouch ? 1.75 : 1);
      if (frame.moving) {
        stepPhase += step;
        if (stepPhase >= cadence) {
          stepPhase = 0;
          api.Sfx(under ? "stepTunnel" : "step", {
            gain: (frame.crouch ? 0.55 : 1) * Rand(0.85, 1.12),
            pan: Rand(-0.12, 0.12),
          });
        }
      } else {
        stepPhase = cadence;      // 停下后再迈第一步立刻出声，不然起步是哑的
      }

      detection += (Clamp(Number.isFinite(frame.detection) ? frame.detection : 0, 0, 1) - detection) * Math.min(1, step * 4);

      // 被发现的压力：心跳上来 + 音乐的高频被闷掉。这两件事同时发生才像"耳鸣"
      if (detection > 0.22) {
        heartPhase += step;
        const beat = 1.05 - 0.42 * detection;
        if (heartPhase >= beat) {
          heartPhase = 0;
          api.Sfx("heartbeat", { gain: 0.35 + 0.85 * (detection - 0.22) });
        }
      } else {
        heartPhase = 999;
      }

      const bright = Math.min(Def().bright, 16000 * Math.pow(0.055, detection));
      if (Math.abs(bright - filterTarget) > filterTarget * 0.04) {
        filterTarget = bright;
        musicFilter.frequency.setTargetAtTime(bright, now, 0.35);
      }
    },

    Dispose() {
      if (disposed) return;
      if (timer !== null) { clearInterval(timer); timer = null; }
      if (parkTimer !== null) { clearTimeout(parkTimer); parkTimer = null; }
      api.StopVoice();
      ClearBgm();
      disposed = true;
      for (let i = live.length - 1; i >= 0; i -= 1) Reap(live[i]);
      live.length = 0;
      for (const n of resident) {
        try { if (typeof n.stop === "function") n.stop(); } catch (ignored) { /* 未启动 */ }
        try { n.disconnect(); } catch (ignored) { /* 已断 */ }
      }
      resident.length = 0;
      for (const k of LAYER_KEYS) { try { layers[k].node.disconnect(); } catch (ignored) { /* 已断 */ } }
      for (const slot of bgmSlots) {
        try { slot.node.disconnect(); } catch (ignored) { /* 已断 */ }
        try { slot.gain.disconnect(); } catch (ignored) { /* 已断 */ }
      }
      for (const n of [synthBus, musicBus, musicFilter, musicWet, sfxWet, ambWet, ambBus, ambSurface, ambUnder,
        ambEvent, sfxBus, voiceBus, duck, master, rumbleCut, limiter]) {
        try { if (n) n.disconnect(); } catch (ignored) { /* 已断 */ }
      }
      if (owned && typeof ac.close === "function") {
        try { const p = ac.close(); if (p && typeof p.catch === "function") p.catch(() => {}); } catch (ignored) { /* 已关 */ }
      }
    },
  };

  return api;
}
