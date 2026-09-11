// EarSpa3D 运行时音频 —— 采耳游戏的「耳朵」这一半。
//
// ## 三层结构，各自取法不同
//
//   1. **BGM 采样层**：火山引擎生成的四条曲子，WebAudio 双缓冲交叉淡化无缝循环。
//      AI 生成的曲子首尾不可能天然对齐，所以接缝不在素材里解决，在播放器里解决：
//      播放位置走到「循环长度 − 交叉淡化长度」时开一路新源淡入、老源淡出。
//      这样换素材、改淡化长度都不用重烘。
//
//   2. **单次音效层**：一次性事件的采样（刮、挑、滴、碰、奖励音…）。
//      每次播放都在 ±4% 内抖动播放速率、增益也抖，并按 cue 设最小重触发间隔——
//      同一段采样连打也不会变成机关枪。
//
//   3. **连续接触声层**（这一层是这个项目最重要的部分）：**不采样、现场合成**。
//      刮耳屎的声音必须随手指速度**连续**变化：速度上去了颗粒变密、中心频率上移；
//      压力上去了增益与低频成分一起涨；粗糙度上去了过载更深、颗粒更硬。
//      采样做不了这件事——循环一个 0.5 秒的刮擦采样，三次就能听出是复读机，
//      而且它永远不会因为玩家手快了一点而变样。所以 contact 整套是振荡器与噪声
//      实时跑出来的，所有参数都走 setTargetAtTime 平滑，不会有 zipper noise。
//
// ## 无资产也能跑（契约 §4 的硬要求）
//
// 加载不到 mp3（离线、404、解码失败、浏览器不给解码器）时**不抛异常、不卡住游戏**：
//   · BGM 退到程序化和声垫（振荡器 + 轻噪声，同样是「舒缓、无词、低动态」）；
//   · 单次音效退到按 cue 合成的版本（见 RECIPES，19 条 cue 每条都有配方）。
// contact 层本来就不依赖资产，永远可用。
//
// ## 移动端
//
// `unlock()` 在首次用户手势里建/恢复 AudioContext（iOS 的 webkitAudioContext 也认），
// `visibilitychange` 与 context 的 statechange 回来时自动 resume；总输出过一道柔和
// 限制器（DynamicsCompressorNode）防止叠音爆音。渲染循环没调 Update 也照样出声：
// 内部有一个 200 ms 的轻量调度定时器兜着。

export function CreateAudio() {
  // ── 常量 ──

  // ── 资产路径：全项目唯一入口 ──
  //
  // 铁律：**所有** fetch / decodeAudioData 的 URL 都必须经过 AssetUrl() 拼，
  // 不许在任何别处再写一次 `new URL(..., 某个基准)`。
  // 为什么要有这条铁律：这里曾经真实出过一次事故——清单里的 `file` 写的是
  // **相对项目根**的路径（`Audio/Bgm/x.mp3`），而解析时对着 `Audio/` 目录，
  // 拼出 `Audio/Audio/Bgm/x.mp3`，24 条音频全部 404，而日志里只看到「资产缺失」。
  // 一个入口就只可能有一种拼法，分叉才会重复加前缀。
  const PROJECT_ROOT = new URL("./", import.meta.url);
  const AssetUrl = (relativePath) => {
    const url = new URL(relativePath, PROJECT_ROOT);
    url.searchParams.set('v', new URL(import.meta.url).searchParams.get('v') || 'ear011-20260911');
    return url.href;
  };
  const MANIFEST_URL = AssetUrl("Audio/Data_AudioManifest.json");
  const BGM_LOOP_CROSSFADE = 2.5;   // 秒：循环接缝交叉淡化长度
  const BGM_SWITCH_FADE = 3.0;      // 秒：换曲交叉淡化长度
  const AMB_LOOP_CROSSFADE = 4.0;
  const CONTACT_SMOOTH = 0.08;      // 秒：接触声参数的平滑时间常数
  // 主输出标定。seed-audio 的 take 都归一化到约 -3 dBFS 峰值，所以总电平只要比 1 稍小
  // 就能落在「正常游戏音量」上，剩下的交给限制器。
  // （这里原本写的是 0.0016，实测在无头环境里量出来只有 -36 dBFS：链路本身是通的，
  //   纯粹是把音量压掉了 50 多 dB，而且听感上「完全没声音」。标定值必须实测过。）
  const ACTIVATION_GAIN = 0.25;
  const RETRIGGER_MS = 45;          // 同一 cue 的最小重触发间隔

  // 没有清单时的兜底文件表（与 Data_AudioSources.mjs 一一对应）。
  // 为什么运行时也写一份：清单可能拿不到，而 404 不该让整个音频层瘫掉。
  // 注意路径统一写「相对项目根」，交给 AssetUrl() 解析。
  const SFX_FILES = {
    waxLandSmall:['Audio/Sfx/AudioSfx_WaxLandSmall.wav'],
    waxLandMedium:['Audio/Sfx/AudioSfx_WaxLandMedium.wav'],
    waxLandLarge:['Audio/Sfx/AudioSfx_WaxLandLarge.wav'],
    peelDry:['Audio/Sfx/AudioSfx_PeelDry.mp3'],peelSticky:['Audio/Sfx/AudioSfx_PeelSticky.mp3'],
    scrapeSoft: ["Audio/Sfx/AudioSfx_ScrapeSoft.mp3"],
    scrapeGritty: ["Audio/Sfx/AudioSfx_ScrapeGritty.mp3"],
    scoopLift: ["Audio/Sfx/AudioSfx_ScoopLift.mp3"],
    stretchWax: ["Audio/Sfx/AudioSfx_StretchWax.mp3"],
    snapWax: ["Audio/Sfx/AudioSfx_SnapWax.mp3"],
    crumbFall: ["Audio/Sfx/AudioSfx_CrumbFall.mp3"],
    tickleFeather: ["Audio/Sfx/AudioSfx_TickleFeather.mp3"],
    tickleHair: ["Audio/Sfx/AudioSfx_TickleHair.mp3"],
    vibrateHum: ["Audio/Sfx/AudioSfx_VibrateHum.mp3"],
    waterPour: ["Audio/Sfx/AudioSfx_WaterPour.mp3"],
    dropLiquid: ["Audio/Sfx/AudioSfx_DropLiquid.mp3"],
    vacuumSuck: ["Audio/Sfx/AudioSfx_VacuumSuck.mp3"],
    metalTick: ["Audio/Sfx/AudioSfx_MetalTick.mp3"],
    blink: ["Audio/Sfx/AudioSfx_Blink.mp3"],
    shiver: ["Audio/Sfx/AudioSfx_Shiver.mp3"],
    sparkle: ["Audio/Sfx/AudioSfx_Sparkle.mp3"],
    uiTap: ["Audio/Sfx/AudioSfx_UiTap.mp3"],
    uiConfirm: ["Audio/Sfx/AudioSfx_UiConfirm.mp3"],
  };
  const BGM_FILES = {
    rainNight: "Audio/Bgm/AudioBgm_RainNight.mp3",
    teaRoom: "Audio/Bgm/AudioBgm_TeaRoom.mp3",
    morning: "Audio/Bgm/AudioBgm_Morning.mp3",
    sleepy: "Audio/Bgm/AudioBgm_Sleepy.mp3",
  };
  // 环境层**没有素材**：`Audio/Amb/` 目录不存在，所以这里刻意不列任何文件——
  // 引用一个不存在的路径只会白送 404，而 setAmbience 本来就有程序化兜底（见 AmbientLayer）。
  const AMBIENCE_IDS = ["roomTone", "breath"];

  // 生成回来的 take 普遍比目标时长长（SeedAudio 的尾巴），运行时按 cue 裁一下：
  // 不裁的话「挑起来的一记啵」会拖着两秒尾巴，跟下一个动作叠在一起。
  const SFX_MAX_SECONDS = {
    peelDry:1.15,peelSticky:1.4,
    scrapeSoft: 1.3, scrapeGritty: 1.4, scoopLift: 0.9, stretchWax: 1.6, snapWax: 0.6,
    crumbFall: 2.2, tickleFeather: 2.0, tickleHair: 1.8, vibrateHum: 3.4, waterPour: 3.0,
    dropLiquid: 0.9, vacuumSuck: 2.6, metalTick: 0.6, blink: 0.8,
    shiver: 1.8, sparkle: 2.2, uiTap: 0.35, uiConfirm: 1.6,
  };
  const LANDING_CUES = new Set(['waxLandSmall','waxLandMedium','waxLandLarge']);
  const SFX_FADE_OUT = 0.12;        // 秒：裁剪处的淡出，避免咔一声

  // contact 的 kind 别名：游戏里的工具 id 直说自己的材质，运行时不猜。
  const KIND_ALIAS = {
    scrape: "scrape", dry: "scrape", gritty: "gritty", sand: "gritty",
    sweep: "sweep", feather: "sweep", tickle: "tickle", hair: "tickle", horsehair: "tickle",
    vibrate: "vibrate", fork: "vibrate", tuningFork: "vibrate",
    wipe: "wipe", cotton: "wipe", swab: "wipe",
    water: "water", irrigate: "water", wash: "water", vacuum: "water",
  };

  // ── 状态 ──

  let ctx = null;
  let bus = null;
  let disposed = false;
  let unlocked = false;
  let gestureBound = false;
  let readyResolved = false;
  let readyResolve = null;
  let assetsPromise = null;
  const readyPromise = new Promise((resolve) => { readyResolve = resolve; });

  // 注意没有 amb：环境层是程序化合成的，不存在「加载不到的环境素材」。
  const buffers = { bgm: {}, sfx: {} };
  const missing = { bgm: {}, sfx: {} };
  const noiseBuffers = {};
  const gainCache = new WeakMap();  // AudioBuffer → 归一化增益（避免每次播放都扫一遍样点）
  const windowCache = new WeakMap();
  const recentPlayback = [];
  // 旧入口或旧清单仍可能请求客人语音；一律静默，不加载、不合成。
  const DISABLED_VOICE_CUES = new Set(['customerPain','customerStop','customerComfort','customerClear','relaxSigh']);

  let currentBgmId = null;
  const bgmVoices = new Map();
  const ambVoices = new Map();
  const contact = new Map();
  const lastPlay = new Map();
  const volumes = { master: 0.9, sfx: 0.9, bgm: 0.55, amb: 0.3 };
  let tickTimer = 0;
  let updateTick = 0;
  const loadLog = [];   // 资产加载的逐条结果，只给 debug() 用（排查「为什么没声音」）
  // 现役节点计数：只在 debug() 里读。排查「节点造了但没接上」这类问题时，
  // 光看 fetch 成功与 playSfx 返回值是查不出来的（实测被这个坑过一次）。
  const live = { sfxStarted: 0, contactStarted: 0, bgmSlots: 0 };
  const assetInfo = { source: "none", generatedAt: "", model: "" };

  const warn = (message) => {
    if (typeof console !== "undefined" && console.warn) console.warn(`[Script_Audio] ${message}`);
  };
  const Clamp01 = (v) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));

  // ── 基础设施 ──

  function EnsureContext() {
    if (ctx || disposed) return ctx;
    const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctor) { warn("这个环境没有 WebAudio，音频层静默。"); return null; }
    try {
      ctx = new Ctor({ latencyHint: "interactive" });
    } catch {
      try { ctx = new Ctor(); } catch { warn("AudioContext 创建失败，音频层静默。"); return null; }
    }
    const master = ctx.createGain();
    master.gain.value = volumes.master * ACTIVATION_GAIN;
    // 柔和限制器：叠音、连点、冲洗 + 音叉同时响的时候防止爆音。
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 12;
    limiter.ratio.value = 3.5;
    limiter.attack.value = 0.006;
    limiter.release.value = 0.25;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.72;
    const bgm = ctx.createGain();
    const sfx = ctx.createGain();
    const amb = ctx.createGain();
    bgm.gain.value = volumes.bgm;
    sfx.gain.value = volumes.sfx * 2.4;
    amb.gain.value = volumes.amb;
    bgm.connect(master); sfx.connect(master); amb.connect(master);
    master.connect(limiter);
    limiter.connect(analyser);
    analyser.connect(ctx.destination);
    bus = { master, limiter, analyser, bgm, sfx, amb };
    BindContextRecovery();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  }

  // iOS 切回前台、来电打断之后 AudioContext 会变成 suspended/interrupted，
  // 这里在可见性变化与状态变化时都试着拉回来。
  function BindContextRecovery() {
    if (typeof document === "undefined" || BindContextRecovery.done) return;
    BindContextRecovery.done = true;
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && ctx && ctx.state !== "running") ctx.resume().catch(() => {});
    });
    if (ctx && typeof ctx.addEventListener === "function") {
      ctx.addEventListener("statechange", () => {
        if (ctx.state === "suspended" && !document.hidden) ctx.resume().catch(() => {});
      });
    }
  }

  function UnlockHandler() { api.unlock(); }

  function BindUnlockGesture() {
    if (gestureBound || typeof document === "undefined") return;
    gestureBound = true;
    const opts = { passive: true };
    for (const name of ["pointerdown", "touchstart", "mousedown", "keydown"]) {
      document.addEventListener(name, UnlockHandler, opts);
    }
  }

  function UnbindUnlockGesture() {
    if (!gestureBound || typeof document === "undefined") return;
    gestureBound = false;
    for (const name of ["pointerdown", "touchstart", "mousedown", "keydown"]) {
      document.removeEventListener(name, UnlockHandler);
    }
  }

  function MakeNoiseBuffer(kind) {
    if (noiseBuffers[kind]) return noiseBuffers[kind];
    const length = Math.floor(ctx.sampleRate * 2);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    if (kind === "pink") {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.16;
        b6 = white * 0.115926;
      }
    } else if (kind === "brown") {
      let last = 0;
      for (let i = 0; i < length; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        data[i] = last * 3.2;
      }
    } else {
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    noiseBuffers[kind] = buffer;
    return buffer;
  }

  function NoiseSource(kind = "white") {
    const source = ctx.createBufferSource();
    source.buffer = MakeNoiseBuffer(kind);
    source.loop = true;
    source.playbackRate.value = 0.85 + Math.random() * 0.3; // 别让同一段噪声听出周期性
    return source;
  }

  function ShaperCurve(drive) {
    // tanh 型软过载：做出刮擦的「砂」感。drive 越大越硬。
    const n = 1024;
    const curve = new Float32Array(n);
    const k = 1 + drive * 8;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(k * x) / Math.tanh(k);
    }
    return curve;
  }

  const Smooth = (param, value, time = CONTACT_SMOOTH, at = null) => {
    if (!param) return;
    try {
      param.setTargetAtTime(value, at == null ? ctx.currentTime : at, time);
    } catch {
      param.value = value;
    }
  };

  // ── 连续接触声合成器 ──
  //
  // 每种材质一条独立链，统一由 { speed01, pressure01, roughness01 } 驱动。
  // 参数含义（都是 0..1）：speed01 手指划动速度，pressure01 压向管壁的力道，
  // roughness01 耵聍表面的粗糙/阻力。

  function CreateContactEngine(kind) {
    const gateGain = ctx.createGain();
    gateGain.gain.value = 0;
    gateGain.connect(bus.sfx);
    const nodes = [];
    const track = (node) => { nodes.push(node); return node; };
    const p = { speed: 0, pressure: 0, rough: 0, pending: null };

    // 噪声底：所有材质都有，只是滤波与过载不同。
    const noiseKind = (kind === "scrape" || kind === "gritty" || kind === "water") ? "brown" : kind === "wipe" ? "pink" : "white";
    const noise = track(NoiseSource(noiseKind));
    const band = track(ctx.createBiquadFilter());
    band.type = "bandpass";
    const pre = track(ctx.createBiquadFilter());
    pre.type = "highpass";
    pre.frequency.value = 120;
    const shaper = track(ctx.createWaveShaper());
    shaper.curve = ShaperCurve(0.12);
    shaper.oversample = "2x";
    const noiseGain = track(ctx.createGain());
    noiseGain.gain.value = 0;
    noise.connect(pre); pre.connect(band); band.connect(shaper); shaper.connect(noiseGain); noiseGain.connect(gateGain);

    // 低频「黏」成分（湿性耵聍、棉签、流水都要）
    const lowOsc = track(ctx.createOscillator());
    lowOsc.type = "sine";
    lowOsc.frequency.value = 90;
    const lowGain = track(ctx.createGain());
    lowGain.gain.value = 0;
    lowOsc.connect(lowGain); lowGain.connect(gateGain);

    // 共鸣（滤波噪声，用于湿性拉丝 / 管腔共鸣）
    const reso = track(ctx.createBiquadFilter());
    reso.type = "peaking";
    reso.Q.value = 9;
    reso.gain.value = 10;
    const resoGain = track(ctx.createGain());
    resoGain.gain.value = 0;
    reso.connect(resoGain); resoGain.connect(gateGain);

    // 高频「丝」成分（马尾、鹅毛）
    const silk = track(NoiseSource("white"));
    const silkHp = track(ctx.createBiquadFilter());
    silkHp.type = "highpass";
    silkHp.frequency.value = 9000;
    const silkPeak = track(ctx.createBiquadFilter());
    silkPeak.type = "peaking";
    silkPeak.frequency.value = 6500;
    silkPeak.Q.value = 2.5;
    silkPeak.gain.value = 6;
    const silkGain = track(ctx.createGain());
    silkGain.gain.value = 0;
    silk.connect(silkHp); silkHp.connect(silkPeak); silkPeak.connect(silkGain); silkGain.connect(gateGain);

    // 音叉：正弦 440 Hz + 三角 880 Hz，另加一条 442 Hz 造成 2 Hz 拍频（「活」的感觉）。
    // 采耳店用的振动音叉取标准音 A4 = 440 Hz 一档；与 Data_AudioSources 的提示词一致。
    const forkA = track(ctx.createOscillator());
    forkA.type = "sine";
    forkA.frequency.value = 440;
    const forkB = track(ctx.createOscillator());
    forkB.type = "triangle";
    forkB.frequency.value = 880;
    const forkC = track(ctx.createOscillator());
    forkC.type = "sine";
    forkC.frequency.value = 442;
    const forkGain = track(ctx.createGain());
    forkGain.gain.value = 0;
    const forkMixB = track(ctx.createGain());
    forkMixB.gain.value = 0.32;
    forkA.connect(forkGain); forkB.connect(forkMixB); forkMixB.connect(forkGain); forkC.connect(forkGain);
    forkGain.connect(gateGain);

    // 颤音 LFO（音叉轻微颤音、鹅毛缓慢起伏、马尾细颤）
    const lfo = track(ctx.createOscillator());
    lfo.type = "sine";
    lfo.frequency.value = 5.5;
    const lfoDepth = track(ctx.createGain());
    lfoDepth.gain.value = 0;
    lfo.connect(lfoDepth);
    lfoDepth.connect(band.frequency);

    // 颗粒 / 气泡脉冲总线
    const grainBus = track(ctx.createGain());
    grainBus.connect(gateGain);
    let grainAt = 0;

    function Grain(at, spec) {
      if (spec.sine) {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(spec.freq, at);
        osc.frequency.exponentialRampToValueAtTime(Math.max(60, spec.freq * 0.45), at + spec.decay);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, at);
        g.gain.linearRampToValueAtTime(Math.max(0.0002, spec.gain), at + spec.decay * 0.12);
        g.gain.exponentialRampToValueAtTime(0.0001, at + spec.decay);
        osc.connect(g); g.connect(grainBus);
        osc.start(at); osc.stop(at + spec.decay + 0.02);
        return;
      }
      const src = ctx.createBufferSource();
      src.buffer = MakeNoiseBuffer("white");
      src.loop = true;
      src.playbackRate.value = 0.8 + Math.random() * 0.6;
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = spec.freq;
      f.Q.value = spec.q || 6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(Math.max(0.0002, spec.gain), at + 0.0015);
      g.gain.exponentialRampToValueAtTime(0.0001, at + spec.decay);
      src.connect(f); f.connect(g); g.connect(grainBus);
      src.start(at); src.stop(at + spec.decay + 0.02);
    }

    // 颗粒调度：速率随速度连续变化，是「沙沙」而不是「哒哒」的关键。
    function ScheduleGrains(now, window, spec) {
      const rate = spec.min + (spec.max - spec.min) * p.speed;
      if (rate <= 0.01) { grainAt = Math.max(grainAt, now); return; }
      const interval = 1 / rate;
      if (grainAt < now) grainAt = now;
      while (grainAt < now + window) {
        const at = Math.max(now, grainAt);
        Grain(at, {
          freq: spec.freq[0] + Math.random() * (spec.freq[1] - spec.freq[0]),
          decay: spec.decay * (0.7 + Math.random() * 0.6),
          gain: spec.gain * (0.2 + p.pressure * 0.95) * (0.55 + Math.random() * 0.75),
          q: spec.q,
          sine: spec.sine,
        });
        grainAt += interval * (1 + (Math.random() - 0.5) * (spec.spread || 0.4));
      }
    }

    // 每种材质的基准参数与颗粒配方
    const profiles = {
      // 干性刮擦：棕噪声 → 带通（中心频率随速度上移）→ 软过载（砂感）→ 增益（随压力），
      // 叠加随机短促颗粒脉冲（密度随速度上升）。
      scrape: {
        base: { band: 1500, q: 0.9, hp: 200, noise: 0.5, drive: 0.18, low: 0, reso: 0, resoF: 800, silk: 0, fork: 0, lfo: 0 },
        grains: { min: 7, max: 55, freq: [1800, 5200], decay: 0.012, gain: 0.16, spread: 0.5, q: 6 },
      },
      // 砂质粗刮：同 scrape，但 Q 更低、过载更深、颗粒更密更硬。
      gritty: {
        base: { band: 2600, q: 0.6, hp: 300, noise: 0.62, drive: 0.5, low: 0.02, reso: 0, resoF: 800, silk: 0.05, fork: 0, lfo: 0 },
        grains: { min: 14, max: 110, freq: [2200, 7000], decay: 0.009, gain: 0.2, spread: 0.35, q: 5 },
      },
      // 鹅毛扫拂：高频细腻噪声，低频几乎清零；缓慢起伏。
      sweep: {
        base: { band: 3400, q: 0.45, hp: 900, noise: 0.42, drive: 0.02, low: 0, reso: 0, resoF: 1200, silk: 0.3, fork: 0, lfo: 9 },
        grains: null,
      },
      // 马尾细痒：比鹅毛更细更尖，多一层 6–7 kHz 窄带金属丝感。
      tickle: {
        base: { band: 6200, q: 1.4, hp: 2600, noise: 0.34, drive: 0.01, low: 0, reso: 0.08, resoF: 6600, silk: 0.55, fork: 0, lfo: 12 },
        grains: { min: 3, max: 26, freq: [5000, 11000], decay: 0.03, gain: 0.05, spread: 0.5, q: 4 },
      },
      // 音叉嗡鸣：双音 + 轻微颤音 + 长衰减。
      vibrate: {
        base: { band: 1200, q: 0.5, hp: 400, noise: 0.05, drive: 0, low: 0.06, reso: 0.05, resoF: 1320, silk: 0, fork: 0.55, lfo: 0.5 },
        grains: null,
      },
      // 棉签擦拭：中频摩擦噪声，无颗粒。
      wipe: {
        base: { band: 1300, q: 1.1, hp: 350, noise: 0.42, drive: 0.06, low: 0.03, reso: 0.05, resoF: 900, silk: 0.06, fork: 0, lfo: 0 },
        grains: null,
      },
      // 冲洗水流：带通噪声 + 随机气泡脉冲。
      water: {
        base: { band: 900, q: 0.7, hp: 250, noise: 0.5, drive: 0.03, low: 0.1, reso: 0.06, resoF: 620, silk: 0.04, fork: 0, lfo: 0 },
        grains: { min: 5, max: 34, freq: [420, 1500], decay: 0.05, gain: 0.12, spread: 0.7, sine: true },
      },
    };
    const profile = profiles[kind] || profiles.scrape;
    const bounds = profile.base;
    lfo.frequency.value = bounds.lfo || 5.5;
    lowOsc.frequency.value = 78;

    function Apply(at) {
      const { speed, pressure, rough } = p;
      Smooth(band.frequency, Math.min(15000, bounds.band * (0.55 + speed * 1.5) * (1 + rough * 0.25)), CONTACT_SMOOTH, at);
      Smooth(band.Q, bounds.q + rough * 0.9, CONTACT_SMOOTH, at);
      Smooth(pre.frequency, bounds.hp * (0.7 + pressure * 0.6), CONTACT_SMOOTH, at);
      Smooth(noiseGain.gain, bounds.noise * (0.25 + pressure * 0.85) * (0.75 + speed * 0.35), CONTACT_SMOOTH, at);
      shaper.curve = ShaperCurve(bounds.drive + rough * 0.5);
      Smooth(lowGain.gain, bounds.low * (0.4 + pressure), CONTACT_SMOOTH, at);
      Smooth(lowOsc.frequency, 66 + speed * 60, CONTACT_SMOOTH, at);
      Smooth(resoGain.gain, bounds.reso * (0.4 + pressure * 0.8), CONTACT_SMOOTH, at);
      Smooth(reso.frequency, bounds.resoF * (0.7 + speed * 0.8), CONTACT_SMOOTH, at);
      Smooth(silkGain.gain, bounds.silk * (0.2 + pressure * 0.9), CONTACT_SMOOTH, at);
      Smooth(forkGain.gain, bounds.fork * (0.35 + pressure * 0.75), CONTACT_SMOOTH, at);
      Smooth(lfoDepth.gain, bounds.lfo ? bounds.lfo * 0.15 * (0.3 + rough) : 0, CONTACT_SMOOTH, at);
    }

    return {
      kind,
      p,
      start(at) {
        for (const node of nodes) {
          if (typeof node.start === "function") { try { node.start(at); } catch { /* 已启动 */ } }
        }
        grainAt = at;
        gateGain.gain.cancelScheduledValues(at);
        gateGain.gain.setValueAtTime(0.0001, at);
        // 音叉起振要快（敲一下就是一下），噪声类要 soft 一点免得「咔」
        gateGain.gain.linearRampToValueAtTime(1, at + (kind === "vibrate" ? 0.015 : 0.07));
        Apply(at);
        live.contactStarted += 1;
      },
      frame(dt, at) {
        Apply(at);
        if (profile.grains) ScheduleGrains(at, dt + 0.06, profile.grains);
      },
      stop(at, release) {
        const g = gateGain.gain;
        try { g.cancelScheduledValues(at); } catch { /* 无所谓 */ }
        const current = Math.max(g.value, 0.0001);
        g.setValueAtTime(current, at);
        g.exponentialRampToValueAtTime(0.0001, at + release);
        g.setValueAtTime(0, at + release + 0.002);
        const end = at + release + 0.05;
        for (const node of nodes) {
          if (typeof node.stop === "function") { try { node.stop(end); } catch { /* 已停止 */ } }
        }
      },
      dispose() {
        for (const node of nodes) {
          try { if (typeof node.stop === "function") node.stop(); } catch { /* 无所谓 */ }
          try { node.disconnect(); } catch { /* 无所谓 */ }
        }
        try { gateGain.disconnect(); } catch { /* 无所谓 */ }
      },
    };
  }

  // ── 采样播放 ──

  function NormalizeGain(buffer) {
    if (gainCache.has(buffer)) return gainCache.get(buffer);
    let peak = 0;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const data = buffer.getChannelData(c);
      const step = Math.max(1, Math.floor(data.length / 20000));
      for (let i = 0; i < data.length; i += step) peak = Math.max(peak, Math.abs(data[i]));
    }
    // 目标峰值 0.72：既不削顶，也不会因为 SeedAudio 的响度差异忽大忽小。
    // 上限给到 +24 dB：实测有几条（tickleHair −39.9 dBFS、relaxSigh −37.5 dBFS）
    // 本身就录得很轻，上限卡在 +15 dB 时它们会明显听不见；AI 生成的干声没有底噪，
    // 拉起来很干净。
    const gain = peak > 0.001 ? Math.min(16, 0.72 / peak) : 1;
    gainCache.set(buffer, gain);
    return gain;
  }

  function SoundWindow(buffer) {
    if (windowCache.has(buffer)) return windowCache.get(buffer);
    const data = buffer.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
    const threshold = Math.max(.0001, peak * .025);
    let first = 0, last = data.length - 1;
    while (first < last && Math.abs(data[first]) < threshold) first++;
    while (last > first && Math.abs(data[last]) < threshold) last--;
    // SeedAudio 单次拟音有约 0.25 秒前置静音。按信号起点播放，保留 8ms 起音保护。
    const result = { offset: Math.max(0, first / buffer.sampleRate - .008), end: Math.min(buffer.duration, last / buffer.sampleRate + .07) };
    if (peak < .0001) { result.offset = 0; result.end = buffer.duration; }
    windowCache.set(buffer, result); return result;
  }

  function PlayBuffer(buffer, { cue = null, gain = 1, rate = 1, pan = 0, delay = 0, dest = null } = {}) {
    const at = ctx.currentTime + Math.max(0, delay);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain * (LANDING_CUES.has(cue) ? 1 : NormalizeGain(buffer));
    let tail = g;
    if (pan && typeof ctx.createStereoPanner === "function") {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(panner);
      tail = panner;
    }
    src.connect(g);
    tail.connect(dest || bus.sfx);
    live.sfxStarted += 1;
    const window = cue ? SoundWindow(buffer) : { offset: 0, end: buffer.duration };
    const natural = (window.end - window.offset) / rate;
    const cap = cue ? (SFX_MAX_SECONDS[cue] || natural) : natural;
    const played = Math.min(natural, cap);
    recentPlayback.push({ cue, offset: +window.offset.toFixed(4), seconds: +played.toFixed(4), naturalSeconds:+natural.toFixed(4), truncated:played<natural-.01, gain: +g.gain.value.toFixed(3) });
    if (recentPlayback.length > 24) recentPlayback.shift();
    if (played < natural - 0.01) {
      const stopAt = at + Math.max(0.02, played - SFX_FADE_OUT);
      g.gain.setValueAtTime(g.gain.value, stopAt);
      g.gain.linearRampToValueAtTime(0.0001, stopAt + SFX_FADE_OUT);
      src.start(at, window.offset);
      src.stop(at + played);
    } else {
      src.start(at, window.offset);
      src.stop(at + natural + 0.02);
    }
    return played;
  }

  // ── 单次音效的程序化配方（无资产兜底）──
  //
  // 19 条 cue 每条都有配方，目的不是 1:1 复刻采样，而是在资源缺失时仍然给出
  // **能被认出来**的那一下。零依赖、零加载。

  const RECIPES = {
    scrapeSoft: { parts: [{ type: "noise", filter: "bandpass", from: 1500, to: 2600, q: 1.2, gain: 0.5, attack: 0.02, hold: 0.25, release: 0.35, wobble: 26 }] },
    scrapeGritty: { parts: [{ type: "noise", filter: "bandpass", from: 2400, to: 3400, q: 0.7, gain: 0.6, attack: 0.01, hold: 0.3, release: 0.4, wobble: 44 }] },
    scoopLift: { parts: [{ type: "tone", wave: "sine", from: 220, to: 420, gain: 0.45, attack: 0.004, hold: 0.05, release: 0.2 }, { type: "noise", filter: "lowpass", from: 800, to: 400, q: 0.8, gain: 0.22, attack: 0.003, hold: 0.03, release: 0.12 }] },
    stretchWax: { parts: [{ type: "tone", wave: "sawtooth", from: 70, to: 240, gain: 0.16, attack: 0.08, hold: 0.45, release: 0.4, filter: { type: "lowpass", freq: 700 } }, { type: "noise", filter: "bandpass", from: 500, to: 1800, q: 8, gain: 0.3, attack: 0.1, hold: 0.4, release: 0.45 }] },
    snapWax: { parts: [{ type: "tone", wave: "sine", from: 1800, to: 300, gain: 0.5, attack: 0.001, hold: 0.01, release: 0.14 }, { type: "noise", filter: "highpass", from: 3000, to: 2000, q: 0.8, gain: 0.2, attack: 0.001, hold: 0.01, release: 0.06 }] },
    crumbFall: { parts: [{ type: "grains", count: 9, spread: 0.85, from: 2600, to: 5200, q: 5, gain: 0.3, decay: 0.035 }] },
    tickleFeather: { parts: [{ type: "noise", filter: "highpass", from: 3200, to: 5200, q: 0.5, gain: 0.34, attack: 0.25, hold: 0.7, release: 0.6, wobble: 7 }] },
    tickleHair: { parts: [{ type: "noise", filter: "highpass", from: 6500, to: 9500, q: 1.6, gain: 0.26, attack: 0.15, hold: 0.6, release: 0.45, wobble: 12, peak: 6800 }] },
    vibrateHum: { parts: [{ type: "tone", wave: "sine", from: 440, to: 440, gain: 0.4, attack: 0.01, hold: 0.9, release: 2.3, vibrato: 5.5 }, { type: "tone", wave: "triangle", from: 880, to: 880, gain: 0.14, attack: 0.01, hold: 0.8, release: 2.0 }, { type: "tone", wave: "sine", from: 442, to: 442, gain: 0.22, attack: 0.01, hold: 0.9, release: 2.3 }] },
    waterPour: { parts: [{ type: "noise", filter: "bandpass", from: 700, to: 1500, q: 0.8, gain: 0.42, attack: 0.2, hold: 1.5, release: 0.9 }, { type: "grains", count: 16, spread: 2.2, from: 500, to: 1600, q: 7, gain: 0.22, decay: 0.06, sine: true }] },
    dropLiquid: { parts: [{ type: "tone", wave: "sine", from: 900, to: 260, gain: 0.5, attack: 0.002, hold: 0.02, release: 0.22 }, { type: "noise", filter: "bandpass", from: 2400, to: 1200, q: 3, gain: 0.16, attack: 0.001, hold: 0.01, release: 0.05 }] },
    vacuumSuck: { parts: [{ type: "noise", filter: "bandpass", from: 400, to: 1100, q: 3, gain: 0.4, attack: 0.25, hold: 1.2, release: 0.6, peak: 620 }, { type: "noise", filter: "highpass", from: 3500, to: 3500, q: 0.7, gain: 0.08, attack: 0.2, hold: 1.1, release: 0.5 }] },
    metalTick: { parts: [{ type: "tone", wave: "sine", from: 1850, to: 1800, gain: 0.4, attack: 0.001, hold: 0.008, release: 0.12 }, { type: "tone", wave: "sine", from: 3250, to: 3200, gain: 0.24, attack: 0.001, hold: 0.006, release: 0.08 }, { type: "noise", filter: "highpass", from: 4000, to: 4000, q: 0.8, gain: 0.12, attack: 0.001, hold: 0.004, release: 0.03 }] },
    blink: { parts: [{ type: "noise", filter: "lowpass", from: 300, to: 700, q: 1.6, gain: 0.3, attack: 0.05, hold: 0.12, release: 0.3 }] },
    shiver: { parts: [{ type: "tone", wave: "sine", from: 660, to: 630, gain: 0.18, attack: 0.05, hold: 0.3, release: 1.0, vibrato: 11 }, { type: "tone", wave: "sine", from: 990, to: 950, gain: 0.1, attack: 0.06, hold: 0.25, release: 0.9, vibrato: 13 }, { type: "tone", wave: "triangle", from: 1320, to: 1240, gain: 0.06, attack: 0.08, hold: 0.2, release: 0.8, vibrato: 9 }] },
    sparkle: { parts: [{ type: "tone", wave: "sine", from: 1180, to: 1180, gain: 0.26, attack: 0.005, hold: 0.05, release: 0.6 }, { type: "tone", wave: "sine", from: 1560, to: 1560, gain: 0.22, attack: 0.005, at: 0.13, hold: 0.05, release: 0.6 }, { type: "tone", wave: "sine", from: 1980, to: 1980, gain: 0.18, attack: 0.005, at: 0.26, hold: 0.05, release: 0.8 }] },
    uiTap: { parts: [{ type: "tone", wave: "sine", from: 620, to: 420, gain: 0.3, attack: 0.002, hold: 0.012, release: 0.09 }, { type: "noise", filter: "lowpass", from: 1800, to: 900, q: 1, gain: 0.12, attack: 0.001, hold: 0.006, release: 0.04 }] },
    uiConfirm: { parts: [{ type: "tone", wave: "triangle", from: 520, to: 520, gain: 0.22, attack: 0.006, hold: 0.08, release: 0.3 }, { type: "tone", wave: "triangle", from: 780, to: 780, gain: 0.2, attack: 0.006, at: 0.18, hold: 0.09, release: 0.45 }, { type: "tone", wave: "sine", from: 1040, to: 1040, gain: 0.14, attack: 0.006, at: 0.36, hold: 0.1, release: 0.6 }] },
  };

  function Tone(at, part, dest) {
    const { from, to, attack, hold, release } = part;
    const osc = ctx.createOscillator();
    osc.type = part.wave || "sine";
    osc.frequency.setValueAtTime(from, at);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(30, to), at + attack + hold + release);
    let node = osc;
    if (part.filter) {
      const f = ctx.createBiquadFilter();
      f.type = part.filter.type;
      f.frequency.value = part.filter.freq;
      osc.connect(f);
      node = f;
    }
    const g = ctx.createGain();
    const total = attack + hold + release;
    const peak = Math.max(0.0002, part.gain);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + Math.max(0.001, attack));
    g.gain.setValueAtTime(peak, at + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, at + total);
    if (part.vibrato) {
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = part.vibrato;
      const depth = ctx.createGain();
      depth.gain.value = from * 0.004;
      lfo.connect(depth); depth.connect(osc.frequency);
      lfo.start(at); lfo.stop(at + total + 0.05);
    }
    node.connect(g); g.connect(dest);
    osc.start(at); osc.stop(at + total + 0.05);
  }

  function SynthSfx(cue, { gain = 1, pan = 0, delay = 0, dest = null, rate = 1 } = {}) {
    const recipe = RECIPES[cue];
    if (!recipe) return false;
    const base = ctx.currentTime + Math.max(0, delay);
    const out = ctx.createGain();
    out.gain.value = gain;
    let tail = out;
    if (pan && typeof ctx.createStereoPanner === "function") {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      out.connect(panner);
      tail = panner;
    }
    tail.connect(dest || bus.sfx);
    for (const part of recipe.parts) {
      const at = base + (part.at || 0) / rate;
      if (part.type === "grains") {
        for (let i = 0; i < part.count; i++) {
          const t = at + (i / part.count) * (part.spread / rate) * (0.6 + Math.random() * 0.8);
          const freq = part.from + Math.random() * (part.to - part.from);
          const decay = part.decay / rate;
          if (part.sine) {
            Tone(t, { wave: "sine", from: freq, to: freq * 0.4, gain: part.gain * (0.6 + Math.random() * 0.6), attack: 0.003, hold: decay * 0.3, release: decay }, out);
            continue;
          }
          const src = ctx.createBufferSource();
          src.buffer = MakeNoiseBuffer("white");
          src.loop = true;
          const f = ctx.createBiquadFilter();
          f.type = "bandpass";
          f.frequency.value = freq;
          f.Q.value = part.q || 5;
          const g = ctx.createGain();
          const peak = Math.max(0.0002, part.gain * (0.5 + Math.random() * 0.8));
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(peak, t + 0.002);
          g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
          src.connect(f); f.connect(g); g.connect(out);
          src.start(t); src.stop(t + decay + 0.02);
        }
        continue;
      }
      if (part.type === "tone") { Tone(at, part, out); continue; }
      // 噪声段
      const src = ctx.createBufferSource();
      src.buffer = MakeNoiseBuffer("white");
      src.loop = true;
      src.playbackRate.value = 0.85 + Math.random() * 0.3;
      const f = ctx.createBiquadFilter();
      f.type = part.filter;
      f.Q.value = part.q || 1;
      f.frequency.setValueAtTime(part.from, at);
      f.frequency.exponentialRampToValueAtTime(Math.max(60, part.to), at + Math.max(0.02, part.attack + part.hold));
      let node = f;
      if (part.peak) {
        const pk = ctx.createBiquadFilter();
        pk.type = "peaking";
        pk.frequency.value = part.peak;
        pk.Q.value = 6;
        pk.gain.value = 9;
        f.connect(pk);
        node = pk;
      }
      const g = ctx.createGain();
      const attack = part.attack / rate;
      const hold = part.hold / rate;
      const release = part.release / rate;
      const total = attack + hold + release;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(part.gain, at + attack);
      g.gain.setValueAtTime(part.gain, at + attack + hold);
      g.gain.exponentialRampToValueAtTime(0.0001, at + total);
      if (part.wobble) {
        const lfo = ctx.createOscillator();
        lfo.type = "sine";
        lfo.frequency.value = part.wobble * 0.35;
        const depth = ctx.createGain();
        depth.gain.value = part.gain * 0.5;
        lfo.connect(depth); depth.connect(g.gain);
        lfo.start(at); lfo.stop(at + total + 0.05);
      }
      node.connect(g); g.connect(out);
      src.start(at); src.stop(at + total + 0.05);
    }
    return true;
  }

  // ── BGM 循环声部：双缓冲交叉淡化 ──

  function CreateLoopVoice({ fade = BGM_LOOP_CROSSFADE, destination = null } = {}) {
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(destination || bus.bgm);
    const voice = { gain, buffer: null, slots: [], loopDur: 0, fade, nextAt: null, disposed: false };

    function SpawnSlot(at, startOffset, fadeIn, fadeOutAt) {
      const src = ctx.createBufferSource();
      src.buffer = voice.buffer;
      src.loop = false;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, at);
      env.gain.linearRampToValueAtTime(1, at + Math.max(0.02, fadeIn));
      if (fadeOutAt != null && fadeOutAt > at) {
        env.gain.setValueAtTime(1, fadeOutAt);
        env.gain.linearRampToValueAtTime(0.0001, fadeOutAt + voice.fade);
      }
      src.connect(env); env.connect(gain);
      const endAt = at + (fadeOutAt == null ? voice.loopDur - startOffset : (fadeOutAt - at) + voice.fade);
      const slot = { src, env, endAt };
      src.onended = () => {
        try { src.disconnect(); env.disconnect(); } catch { /* 无所谓 */ }
        const index = voice.slots.indexOf(slot);
        if (index >= 0) voice.slots.splice(index, 1);
      };
      src.start(at, startOffset);
      src.stop(endAt + 0.25);  // 兜底停止：onended 没触发也不会堆积
      voice.slots.push(slot);
      return slot;
    }

    // 一次迭代 = 从头播到「循环长度 − 交叉淡化」并淡出，同时下一路从该点淡入。
    // 两路的淡化窗完全重叠，所以接缝处能量恒定，听不到台阶。
    function NextIteration(at) {
      SpawnSlot(at, 0, voice.fade, at + voice.loopDur - voice.fade);
      const tail = SpawnSlot(at + voice.loopDur - voice.fade, voice.loopDur - voice.fade, voice.fade, null);
      voice.nextAt = tail.endAt - voice.fade;
    }

    return {
      get fallback() { return !voice.buffer; },
      Attach(buffer) {
        voice.buffer = buffer;
        voice.loopDur = Math.max(1, buffer.duration - 0.005);
        voice.fade = Math.min(voice.fade, voice.loopDur * 0.3);
        return true;
      },
      Start(at) {
        if (voice.disposed || !voice.buffer) return;
        voice.slots.length = 0;
        gain.gain.cancelScheduledValues(at);
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.linearRampToValueAtTime(1, at + BGM_SWITCH_FADE);
        NextIteration(at);
      },
      Schedule() {
        if (voice.disposed || !voice.buffer || voice.nextAt == null) return;
        const now = ctx.currentTime;
        if (voice.nextAt <= now + 0.8) NextIteration(Math.max(voice.nextAt, now + 0.05));
      },
      FadeOut(at, seconds) {
        try {
          gain.gain.cancelScheduledValues(at);
          gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), at);
          gain.gain.linearRampToValueAtTime(0.0001, at + seconds);
        } catch { /* 无所谓 */ }
      },
      StopAll(at) {
        voice.nextAt = null;
        for (const slot of voice.slots.slice()) {
          try { slot.src.stop(at); } catch { /* 已停 */ }
        }
      },
      Dispose() {
        voice.disposed = true;
        voice.nextAt = null;
        for (const slot of voice.slots.slice()) { try { slot.src.stop(); } catch { /* 无所谓 */ } }
        voice.slots.length = 0;
        try { gain.disconnect(); } catch { /* 无所谓 */ }
      },
    };
  }

  // ── 程序化 BGM 兜底：缓慢的和声垫 + 轻噪声 ──

  const PAD_CHORDS = {
    rainNight: [[130.81, 196.00, 246.94, 329.63], [146.83, 220.00, 261.63, 349.23]],
    teaRoom: [[174.61, 261.63, 329.63, 392.00], [196.00, 293.66, 349.23, 440.00]],
    morning: [[196.00, 293.66, 392.00, 493.88], [220.00, 329.63, 440.00, 554.37]],
    sleepy: [[110.00, 164.81, 220.00, 277.18], [98.00, 146.83, 196.00, 246.94]],
  };

  function CreatePadVoice(id) {
    const chords = PAD_CHORDS[id] || PAD_CHORDS.rainNight;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(bus.bgm);
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 1800;
    lowpass.Q.value = 0.4;
    lowpass.connect(out);
    const voices = [];
    const timers = new Set();
    let index = 0;
    let nextAt = null;

    function Lfo(rate, depth, target, at) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = rate;
      const g = ctx.createGain();
      g.gain.value = depth;
      osc.connect(g); g.connect(target);
      osc.start(at);
      return { osc, g };
    }

    function PlayChord(at, chord, seconds) {
      const token = `chord-${at.toFixed(3)}-${Math.random().toString(36).slice(2, 7)}`;
      for (const freq of chord) {
        for (const [detune, level, wave] of [[-4, 0.5, "sine"], [4, 0.35, "triangle"], [0, 0.3, "sine"]]) {
          const osc = ctx.createOscillator();
          osc.type = wave;
          osc.frequency.value = freq;
          osc.detune.value = detune + (Math.random() - 0.5) * 3;
          const g = ctx.createGain();
          const peak = 0.05 * level;
          g.gain.setValueAtTime(0.0001, at);
          g.gain.linearRampToValueAtTime(peak, at + seconds * 0.35);
          g.gain.linearRampToValueAtTime(0.0001, at + seconds);
          const trem = Lfo(0.07 + Math.random() * 0.12, peak * 0.35, g.gain, at);
          osc.connect(g); g.connect(lowpass);
          osc.start(at);
          osc.stop(at + seconds + 0.2);
          voices.push({ osc, g, trem, token });
        }
      }
      // 轻噪声：给垫子一点空气感，音量压到几乎听不出
      const noise = ctx.createBufferSource();
      noise.buffer = MakeNoiseBuffer("brown");
      noise.loop = true;
      const nf = ctx.createBiquadFilter();
      nf.type = "lowpass";
      nf.frequency.value = 520;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, at);
      ng.gain.linearRampToValueAtTime(0.02, at + seconds * 0.4);
      ng.gain.linearRampToValueAtTime(0.0001, at + seconds);
      noise.connect(nf); nf.connect(ng); ng.connect(out);
      noise.start(at); noise.stop(at + seconds + 0.2);
      voices.push({ osc: noise, g: ng, token });
      const timer = setTimeout(() => {
        timers.delete(timer);
        for (let i = voices.length - 1; i >= 0; i--) {
          if (voices[i].token !== token) {
            if (voices[i].trem) { try { voices[i].trem.osc.stop(); } catch { /* 无所谓 */ } }
            voices.splice(i, 1);
          }
        }
      }, (seconds + 1.5) * 1000);
      timers.add(timer);
    }

    function Step(at) {
      const chord = chords[index % chords.length];
      index += 1;
      const seconds = 14;
      PlayChord(at, chord, seconds);
      return at + seconds * 0.75; // 提前换和弦，形成交叠
    }

    return {
      fallback: true,
      Attach() { return true; },
      Start(at) {
        out.gain.cancelScheduledValues(at);
        out.gain.setValueAtTime(0.0001, at);
        out.gain.linearRampToValueAtTime(1, at + BGM_SWITCH_FADE);
        let t = at;
        for (let i = 0; i < 3; i++) t = Step(t);
        nextAt = t;
      },
      Schedule() {
        if (nextAt == null) return;
        const now = ctx.currentTime;
        while (nextAt < now + 2) nextAt = Step(Math.max(nextAt, now + 0.05));
      },
      FadeOut(at, seconds) {
        try {
          out.gain.cancelScheduledValues(at);
          out.gain.setValueAtTime(Math.max(out.gain.value, 0.0001), at);
          out.gain.linearRampToValueAtTime(0.0001, at + seconds);
        } catch { /* 无所谓 */ }
      },
      StopAll(at) {
        nextAt = null;
        for (const v of voices) { try { v.osc.stop(at + BGM_SWITCH_FADE + 0.1); } catch { /* 无所谓 */ } }
      },
      Dispose() {
        nextAt = null;
        for (const timer of timers) clearTimeout(timer);
        timers.clear();
        for (const v of voices) {
          try { v.osc.stop(); } catch { /* 无所谓 */ }
          if (v.trem) { try { v.trem.osc.stop(); } catch { /* 无所谓 */ } }
        }
        voices.length = 0;
        try { out.disconnect(); } catch { /* 无所谓 */ }
      },
    };
  }

  // ── 环境层：程序化合成（没有素材，也就不可能 404）──
  //
  // `setAmbience` 在契约里是「可叠在 BGM 上的环境层」。仓库里没有 Audio/Amb/ 素材，
  // 所以这一层刻意做成纯合成：一层极轻的噪声床 + 每档一个很低的音心 + 缓慢起伏。
  // 好处是它永远可用、永远不占请求，也不需要为它维护一份文件清单。
  function CreateAmbientLayer(id) {
    // 电平按「能听见但听不出是什么」定：默认 amb 音量 0.3 时应当隐约压在 BGM 之下。
    // （第一版写成 0.055，实测 timePeak 只有 2/128 ≈ −36 dBFS，等于没有。）
    const profile = id === "breath"
      ? { lfo: 0.22, lowpass: 900, level: 0.19, tone: 82.4, toneLevel: 0.06 }
      : { lfo: 0.07, lowpass: 700, level: 0.22, tone: 110, toneLevel: 0.05 };
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(bus.amb);
    const nodes = [];
    const track = (node) => { nodes.push(node); return node; };

    const noise = track(NoiseSource("pink"));
    const lowpass = track(ctx.createBiquadFilter());
    lowpass.type = "lowpass";
    lowpass.frequency.value = profile.lowpass;
    lowpass.Q.value = 0.5;
    const noiseGain = track(ctx.createGain());
    noiseGain.gain.value = profile.level;
    noise.connect(lowpass); lowpass.connect(noiseGain); noiseGain.connect(out);

    const tone = track(ctx.createOscillator());
    tone.type = "sine";
    tone.frequency.value = profile.tone;
    const toneGain = track(ctx.createGain());
    toneGain.gain.value = profile.toneLevel;
    tone.connect(toneGain); toneGain.connect(out);

    // 缓慢起伏：让「房间在呼吸」，但不能听出周期
    const lfo = track(ctx.createOscillator());
    lfo.type = "sine";
    lfo.frequency.value = profile.lfo;
    const lfoDepth = track(ctx.createGain());
    lfoDepth.gain.value = profile.level * 0.45;
    lfo.connect(lfoDepth); lfoDepth.connect(noiseGain.gain);

    return {
      fallback: true,
      Attach() { return true; },
      Start(at) {
        for (const node of nodes) {
          if (typeof node.start === "function") { try { node.start(at); } catch { /* 已启动 */ } }
        }
        out.gain.cancelScheduledValues(at);
        out.gain.setValueAtTime(0.0001, at);
        out.gain.linearRampToValueAtTime(1, at + AMB_LOOP_CROSSFADE);
      },
      Schedule() { /* 合成层不需要排程：振荡器一直在跑 */ },
      FadeOut(at, seconds) {
        try {
          out.gain.cancelScheduledValues(at);
          out.gain.setValueAtTime(Math.max(out.gain.value, 0.0001), at);
          out.gain.linearRampToValueAtTime(0.0001, at + seconds);
        } catch { /* 无所谓 */ }
      },
      StopAll(at) {
        for (const node of nodes) {
          if (typeof node.stop === "function") { try { node.stop(at + 0.1); } catch { /* 已停止 */ } }
        }
      },
      Dispose() {
        for (const node of nodes) {
          try { if (typeof node.stop === "function") node.stop(); } catch { /* 无所谓 */ }
          try { node.disconnect(); } catch { /* 无所谓 */ }
        }
        try { out.disconnect(); } catch { /* 无所谓 */ }
      },
    };
  }

  // ── 资产加载 ──

  // 提示：URL 一律走 AssetUrl()。清单里取回来的 `entry.file` 本来就是「相对项目根」的，
  // 和兜底表同一个口径，所以两条来源共用同一种拼法——这是不重复加前缀的关键。
  async function LoadBuffer(relative) {
    const note = (state, detail = "") => {
      loadLog.push(`${relative} ${state}${detail ? " · " + detail : ""}`);
      if (loadLog.length > 200) loadLog.shift();
    };
    try {
      const url = AssetUrl(relative);
      const response = await fetch(url);
      if (!response.ok) { note(`HTTP ${response.status}`); return null; }
      const bytes = await response.arrayBuffer();
      if (!bytes.byteLength) { note("空响应"); return null; }
      const buffer = await new Promise((resolve) => {
        // 老浏览器的回调式写法也要接住；两种都失败就 resolve(null)，绝不 reject。
        let settled = false;
        const done = (value) => { if (!settled) { settled = true; resolve(value || null); } };
        try {
          const maybe = ctx.decodeAudioData(bytes, done, () => done(null));
          if (maybe && typeof maybe.then === "function") maybe.then(done, () => done(null));
        } catch {
          done(null);
        }
      });
      if (!buffer) { note(`解码失败（${bytes.byteLength} bytes，ctx=${ctx.state}）`); return null; }
      note(`OK ${buffer.duration.toFixed(2)}s`);
      return buffer;
    } catch (error) {
      note(`异常 ${error?.name || "Error"}`);
      return null;
    }
  }

  async function LoadManifestFiles() {
    try {
      const response = await fetch(MANIFEST_URL);
      if (!response.ok) return null;
      const manifest = await response.json();
      const sfx = {};
      const bgm = {};
      for (const entry of Object.values(manifest.cues || {})) {
        if (!entry || !entry.file || !entry.cue) continue;
        if (entry.kind === "bgm") bgm[entry.cue] = entry.file;
        else if (entry.kind === "sfx") (sfx[entry.cue] = sfx[entry.cue] || []).push(entry.file);
      }
      return { bgm, sfx, generatedAt: manifest.generatedAt, model: manifest.model };
    } catch {
      return null;
    }
  }

  async function LoadAssets() {
    const fromManifest = await LoadManifestFiles();
    const bgmFiles = fromManifest?.bgm && Object.keys(fromManifest.bgm).length ? fromManifest.bgm : BGM_FILES;
    const sfxFiles = fromManifest?.sfx && Object.keys(fromManifest.sfx).length ? fromManifest.sfx : SFX_FILES;
    assetInfo.source = fromManifest ? "manifest" : "builtin-list";
    assetInfo.generatedAt = fromManifest?.generatedAt || "";
    assetInfo.model = fromManifest?.model || "";
    const jobs = [];
    for (const [cue, file] of Object.entries(bgmFiles)) {
      jobs.push(LoadBuffer(file).then((buffer) => {
        if (buffer) { buffers.bgm[cue] = buffer; delete missing.bgm[cue]; } else missing.bgm[cue] = file;
      }));
    }
    for (const [cue, files] of Object.entries(sfxFiles)) {
      if(DISABLED_VOICE_CUES.has(cue))continue;
      buffers.sfx[cue] = buffers.sfx[cue] || [];
      for (const file of (Array.isArray(files) ? files : [files])) {
        jobs.push(LoadBuffer(file).then((buffer) => {
          if (buffer) buffers.sfx[cue].push(buffer);
          else (missing.sfx[cue] = missing.sfx[cue] || []).push(file);
        }));
      }
    }
    // 环境层没有素材可加载：它是程序化合成的（见 AmbientLayer），
    // 所以这里刻意不发任何请求——指向不存在的文件只会白送 404。
    await Promise.all(jobs);
    // 采样到位后，正在播的兜底声部要换成采样版
    for (const id of bgmVoices.keys()) {
      if (currentBgmId === id && buffers.bgm[id]) ApplyBgm(id, true);
    }
  }

  function StartAssetLoad() {
    if (assetsPromise || !ctx) return;
    assetsPromise = LoadAssets()
      .then(() => { ResolveReady(); })
      .catch((error) => { warn(`资产加载失败：${error?.message || error}`); ResolveReady(); });
  }

  // ── 循环调度 ──

  function Tick() {
    if (disposed || !ctx) return;
    for (const voice of bgmVoices.values()) voice.Schedule();
    for (const voice of ambVoices.values()) voice.Schedule();
  }

  function StartTicking() {
    if (tickTimer || typeof setInterval !== "function") return;
    tickTimer = setInterval(() => {
      try { Tick(); } catch (error) { warn(`循环调度失败：${error?.message || error}`); }
    }, 200);
  }

  function ResolveReady() {
    if (readyResolved) return;
    readyResolved = true;
    readyResolve(true);
  }

  function ApplyBgm(id, immediate) {
    if (!ctx) return;
    if (bgmVoices.has(id) && !(immediate && bgmVoices.get(id).fallback && buffers.bgm[id])) return;
    for (const [otherId, other] of bgmVoices) {
      if (otherId === id) continue;
      other.FadeOut(ctx.currentTime, BGM_SWITCH_FADE);
      other.StopAll(ctx.currentTime + BGM_SWITCH_FADE + 0.1);
      bgmVoices.delete(otherId);
      setTimeout(() => other.Dispose(), (BGM_SWITCH_FADE + 1) * 1000);
    }
    const outgoing = bgmVoices.get(id);
    if (outgoing) {
      outgoing.FadeOut(ctx.currentTime, BGM_SWITCH_FADE);
      outgoing.StopAll(ctx.currentTime + BGM_SWITCH_FADE + 0.1);
      bgmVoices.delete(id);
      setTimeout(() => outgoing.Dispose(), (BGM_SWITCH_FADE + 1) * 1000);
    }
    const buffer = buffers.bgm[id];
    if (!buffer) {
      missing.bgm[id] = missing.bgm[id] || BGM_FILES[id] || "（无文件）";
      const pad = CreatePadVoice(id);
      bgmVoices.set(id, pad);
      pad.Start(ctx.currentTime + 0.05);
      return;
    }
    const voice = CreateLoopVoice({ fade: BGM_LOOP_CROSSFADE });
    voice.Attach(buffer);
    bgmVoices.set(id, voice);
    voice.Start(ctx.currentTime + 0.05);
  }

  // ── 对外 API（契约 §5.7）──

  const api = {
    ready: readyPromise,

    unlock() {
      const context = EnsureContext();
      if (!context) { ResolveReady(); return false; }
      unlocked = true;
      if (context.state !== "running") context.resume().catch(() => {});
      UnbindUnlockGesture();
      StartAssetLoad();
      StartTicking();
      return true;
    },

    setBgm(id) {
      currentBgmId = id;
      if (!ctx || !unlocked) return;
      ApplyBgm(id, false);
    },

    setAmbience(id) {
      if (!ctx || !unlocked) return;
      if (!AMBIENCE_IDS.includes(id)) return;
      if (ambVoices.has(id)) return;
      for (const [otherId, other] of ambVoices) {
        other.FadeOut(ctx.currentTime, BGM_SWITCH_FADE);
        other.StopAll(ctx.currentTime + BGM_SWITCH_FADE + 0.1);
        ambVoices.delete(otherId);
        setTimeout(() => other.Dispose(), (BGM_SWITCH_FADE + 1) * 1000);
      }
      // 环境层是程序化合成的：没有素材文件，所以不可能 404（见 AmbientLayer 的说明）。
      const voice = CreateAmbientLayer(id);
      ambVoices.set(id, voice);
      voice.Start(ctx.currentTime + 0.05);
    },

    playSfx(cue, { gain = 1, rate = 1, pan = 0, delay = 0 } = {}) {
      if(cue==='chunkLand')cue='waxLandMedium'; // 旧入口兼容，不再使用金属感旧素材。
      if (!ctx || !unlocked || ctx.state === "closed") return 0;
      if(DISABLED_VOICE_CUES.has(cue))return 0;
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      if (now - (lastPlay.get(cue) || 0) < RETRIGGER_MS) return 0;   // 连点保护
      lastPlay.set(cue, now);
      const jitterRate = LANDING_CUES.has(cue) ? 1 : rate * (1 + (Math.random() - 0.5) * 0.08);
      const jitterGain = LANDING_CUES.has(cue) ? gain : gain * (1 + (Math.random() - 0.5) * 0.35);
      const takes = buffers.sfx[cue];
      if (takes && takes.length) {
        const buffer = takes[Math.floor(Math.random() * takes.length)];
        const played=PlayBuffer(buffer, { cue, gain: jitterGain, rate: jitterRate, pan, delay });
        return played;
      }
      if(LANDING_CUES.has(cue))return 0;
      // 兜底：合成版本（失败就真的静默，绝不抛）
      SynthSfx(cue==='peelDry'?'snapWax':cue==='peelSticky'?'stretchWax':cue, { gain: jitterGain, pan, delay, rate: jitterRate });
      return 0;
    },

    contact: {
      begin(kind) {
        if (!ctx || !unlocked) return;
        const id = KIND_ALIAS[kind] || kind;
        const existing = contact.get(id);
        if (existing) { existing.p.pressure = Math.max(existing.p.pressure, 0.25); return; }
        const engine = CreateContactEngine(id);
        contact.set(id, engine);
        engine.start(ctx.currentTime + 0.02);
      },
      update(kind, { speed01 = 0.3, pressure01 = 0.5, roughness01 = 0.2, dt = 0.016 } = {}) {
        if (!ctx || !unlocked) return;
        const engine = contact.get(KIND_ALIAS[kind] || kind);
        if (!engine) return;
        engine.p.speed = Clamp01(speed01);
        engine.p.pressure = Clamp01(pressure01);
        engine.p.rough = Clamp01(roughness01);
        engine.p.pending = Math.min(0.12, Math.max(0.004, Number.isFinite(dt) ? dt : 0.016));
      },
      end(kind, { release = 0.22 } = {}) {
        if (!ctx) return;
        const id = KIND_ALIAS[kind] || kind;
        const engine = contact.get(id);
        if (!engine) return;
        engine.stop(ctx.currentTime + 0.01, Math.max(0.05, release));
        contact.delete(id);
      },
      kinds() { return [...new Set(Object.values(KIND_ALIAS))]; },
      aliases() { return Object.keys(KIND_ALIAS); },
      active() { return [...contact.keys()]; },
    },

    setMaster(v) {
      volumes.master=Clamp01(v);if(!bus)return;
      const gain=bus.master.gain,now=ctx.currentTime;
      gain.cancelScheduledValues(now);gain.setValueAtTime(gain.value,now);
      gain.linearRampToValueAtTime(volumes.master*ACTIVATION_GAIN,now+.04);
    },
    setSfxVolume(v) { volumes.sfx = Clamp01(v); if (bus) Smooth(bus.sfx.gain, volumes.sfx * 2.4, 0.05); },
    setBgmVolume(v) { volumes.bgm = Clamp01(v); if (bus) Smooth(bus.bgm.gain, volumes.bgm, 0.05); },
    setAmbienceVolume(v) { volumes.amb = Clamp01(v); if (bus) Smooth(bus.amb.gain, volumes.amb, 0.05); },
    volumes() { return { ...volumes }; },

    // 渲染循环每帧调一次。不调也能出声（内部有 200 ms 的调度定时器），
    // 调了能让接触声的参数更新更顺、颗粒排得更准。
    Update(dt) {
      if (!ctx || disposed) return;
      const step = Math.min(0.1, Math.max(0.001, dt || 0.016));
      const at = ctx.currentTime + 0.02;
      for (const engine of contact.values()) {
        engine.frame(engine.p.pending ?? step, at);
        engine.p.pending = null;
      }
      updateTick += 1;
      if (updateTick % 10 === 0) Tick();
    },

    cues() { return Object.keys(SFX_FILES); },
    bgmIds() { return Object.keys(BGM_FILES); },

    // 自测台用的诊断口（不是契约的一部分，但暴露出来方便 lead 排查）
    debug() {
      return {
        unlocked,
        contextState: ctx ? ctx.state : "none",
        sampleRate: ctx ? ctx.sampleRate : 0,
        assetSource: assetInfo.source,
        model: assetInfo.model,
        generatedAt: assetInfo.generatedAt,
        bgmLoaded: Object.keys(buffers.bgm),
        bgmMissing: Object.keys(missing.bgm),
        sfxLoaded: Object.entries(buffers.sfx).filter(([, list]) => list.length).map(([cue, list]) => `${cue}×${list.length}`),
        sfxMissing: Object.keys(missing.sfx),
        currentBgmId,
        activeContacts: [...contact.keys()],
        live: { ...live, busCounts: bus ? { master: 1, sfx: 1, bgm: 1, amb: 1 } : null },
        loadLog: [...loadLog],
        recentPlayback: recentPlayback.map(item => ({ ...item })),
      };
    },

    analyser() { return bus ? bus.analyser : null; },

    dispose() {
      disposed = true;
      if (tickTimer) { clearInterval(tickTimer); tickTimer = 0; }
      for (const engine of contact.values()) engine.dispose();
      contact.clear();
      for (const voice of bgmVoices.values()) voice.Dispose();
      bgmVoices.clear();
      for (const voice of ambVoices.values()) voice.Dispose();
      ambVoices.clear();
      try { if (ctx && ctx.state !== "closed") ctx.close(); } catch { /* 无所谓 */ }
      ctx = null; bus = null;
    },
  };

  // 顶层：绑好解锁手势，能建上下文就先建（桌面浏览器允许），然后立刻返回，不阻塞游戏启动。
  BindUnlockGesture();
  EnsureContext();
  if (ctx) { StartTicking(); StartAssetLoad(); } else { ResolveReady(); }

  return api;
}

export default CreateAudio;
