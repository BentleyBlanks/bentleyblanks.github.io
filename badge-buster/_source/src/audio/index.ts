// audio —— Web Audio 合成音 + 事件映射（Agent 11）
import type { GameContext, GameModule } from '../types/module.types';

const MUTE_KEY = 'bb-muted';
const MAX_POPS_PER_FRAME = 8; // throttle rapid BADGE_CLEARED pops

type OscType = OscillatorType;

export function createAudioModule(): GameModule {
  let ctx!: GameContext;

  // --- audio graph ---
  let ac: AudioContext | null = null;
  let master: GainNode | null = null;
  let sfxBus: GainNode | null = null;
  let bgmBus: GainNode | null = null;
  let noiseBuffer: AudioBuffer | null = null;

  // --- bgm scheduling ---
  let bgmTimer: number | null = null;
  let bgmNextTime = 0;
  let bgmStep = 0;
  const bgmActiveNodes = new Set<AudioNode>();

  // --- state ---
  let muted = false;
  let destroyed = false;
  let popsThisFrame = 0;

  const unsubs: Array<() => void> = [];
  let muteBtn: HTMLButtonElement | null = null;
  let gestureHandler: (() => void) | null = null;

  // ---------- helpers ----------

  function loadMuted(): boolean {
    try {
      return localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      return false;
    }
  }

  function saveMuted(v: boolean): void {
    try {
      localStorage.setItem(MUTE_KEY, v ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  function ensureContext(): AudioContext | null {
    if (destroyed) return null;
    if (ac) return ac;
    try {
      const Ctor: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ac = new Ctor();
    } catch {
      ac = null;
      return null;
    }

    master = ac.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ac.destination);

    sfxBus = ac.createGain();
    sfxBus.gain.value = 0.85;
    sfxBus.connect(master);

    bgmBus = ac.createGain();
    bgmBus.gain.value = 0.12;
    bgmBus.connect(master);

    // pre-build a short white-noise buffer for sweeps/thuds
    const len = Math.floor(ac.sampleRate * 0.5);
    noiseBuffer = ac.createBuffer(1, len, ac.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    startBgm();
    return ac;
  }

  function tryResume(): void {
    if (ac && ac.state === 'suspended') {
      void ac.resume().catch(() => {});
    }
  }

  function now(): number {
    return ac ? ac.currentTime : 0;
  }

  // A short oscillator blip with attack/exp-release envelope. Optional pitch glide.
  function blip(
    freq: number,
    dur: number,
    type: OscType = 'triangle',
    gain = 0.5,
    glideTo?: number,
    delay = 0
  ): void {
    if (!ac || !sfxBus) return;
    const t0 = now() + delay;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), t0 + dur);
    }
    const peak = Math.max(0.0001, gain);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.012, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
    osc.onended = () => {
      try {
        osc.disconnect();
        g.disconnect();
      } catch {
        /* ignore */
      }
    };
  }

  // Filtered noise burst — for swipes / sweeps / thuds.
  function noiseBurst(
    dur: number,
    filterFreq: number,
    gain = 0.4,
    sweepTo?: number,
    filterType: BiquadFilterType = 'bandpass',
    delay = 0
  ): void {
    if (!ac || !sfxBus || !noiseBuffer) return;
    const t0 = now() + delay;
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer;
    const filt = ac.createBiquadFilter();
    filt.type = filterType;
    filt.frequency.setValueAtTime(filterFreq, t0);
    if (sweepTo !== undefined) {
      filt.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t0 + dur);
    }
    filt.Q.value = 0.9;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), t0 + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(sfxBus);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
    src.onended = () => {
      try {
        src.disconnect();
        filt.disconnect();
        g.disconnect();
      } catch {
        /* ignore */
      }
    };
  }

  // Sequence of blips spaced by `step` seconds.
  function arpeggio(
    freqs: number[],
    step: number,
    type: OscType = 'triangle',
    gain = 0.45,
    noteDur?: number
  ): void {
    const d = noteDur ?? step * 1.6;
    for (let i = 0; i < freqs.length; i++) {
      blip(freqs[i], d, type, gain, undefined, i * step);
    }
  }

  // ---------- event-mapped SFX ----------

  function sfxBadgeCleared(): void {
    // 硬性每帧上限：popsThisFrame 由 TICK 事件归零（bus 同步派发，TICK 每帧一次）
    if (popsThisFrame >= MAX_POPS_PER_FRAME) return;
    if (!ensureContext()) return;
    tryResume();
    popsThisFrame++;
    const base = 660 + Math.random() * 220;
    blip(base, 0.09, 'triangle', 0.35, base * 1.7);
  }

  function sfxSwipe(): void {
    if (!ensureContext()) return;
    tryResume();
    noiseBurst(0.18, 1400, 0.28, 4200, 'bandpass');
  }

  function sfxLevelUp(): void {
    if (!ensureContext()) return;
    tryResume();
    // cheerful major arpeggio C5 E5 G5 C6
    arpeggio([523.25, 659.25, 783.99, 1046.5], 0.085, 'triangle', 0.42, 0.22);
  }

  function sfxPhoneReturned(): void {
    if (!ensureContext()) return;
    tryResume();
    // two-note "done" chime + coin tick
    blip(784, 0.16, 'triangle', 0.4, undefined, 0);
    blip(1175, 0.22, 'triangle', 0.42, undefined, 0.1);
    blip(2200, 0.05, 'square', 0.18, 2600, 0.18); // coin tick
  }

  function sfxCustomerArrived(): void {
    if (!ensureContext()) return;
    tryResume();
    // gentle two-note door chime (descending, soft)
    blip(880, 0.18, 'sine', 0.3, undefined, 0);
    blip(659, 0.24, 'sine', 0.3, undefined, 0.12);
  }

  function sfxCustomerLeft(reason: 'angry' | 'overflow'): void {
    if (!ensureContext()) return;
    tryResume();
    if (reason === 'angry') {
      // short descending buzzer
      blip(330, 0.12, 'sawtooth', 0.32, 220, 0);
      blip(220, 0.16, 'sawtooth', 0.3, 150, 0.1);
    } else {
      // soft low thud
      blip(120, 0.22, 'sine', 0.42, 70);
      noiseBurst(0.12, 220, 0.18, 90, 'lowpass');
    }
  }

  function sfxUseSkill(): void {
    if (!ensureContext()) return;
    tryResume();
    // magical shimmer: rising blip + filtered-noise whoosh
    blip(660, 0.28, 'sine', 0.26, 1760);
    blip(990, 0.26, 'triangle', 0.2, 2640, 0.04);
    noiseBurst(0.3, 800, 0.16, 5000, 'bandpass');
  }

  function sfxUpgradePurchased(): void {
    if (!ensureContext()) return;
    tryResume();
    // bright coin "cha-ching": two quick high blips
    blip(1568, 0.07, 'square', 0.26, undefined, 0);
    blip(2093, 0.14, 'square', 0.28, 2350, 0.07);
    blip(1046, 0.1, 'triangle', 0.2, undefined, 0.0);
  }

  function sfxSkillUnlocked(): void {
    if (!ensureContext()) return;
    tryResume();
    // small triumphant flourish
    arpeggio([659.25, 880, 1108.73, 1318.5], 0.07, 'triangle', 0.4, 0.18);
    blip(1760, 0.2, 'sine', 0.18, undefined, 0.28);
  }

  // ---------- BGM: very soft slow pad loop ----------
  // Schedules one ambient chord every ~4s. Cleanly loops, never stacks.

  const BGM_CHORDS: number[][] = [
    [130.81, 196.0, 261.63], // C
    [146.83, 220.0, 293.66], // Dm-ish
    [174.61, 261.63, 349.23], // F
    [196.0, 293.66, 392.0], // G
  ];
  const BGM_INTERVAL = 4.0; // seconds per chord

  function scheduleBgmChord(when: number): void {
    if (!ac || !bgmBus) return;
    const chord = BGM_CHORDS[bgmStep % BGM_CHORDS.length];
    bgmStep++;
    for (const f of chord) {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      const dur = BGM_INTERVAL * 1.1;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(0.5, when + 1.2); // slow swell (relative within bgmBus)
      g.gain.linearRampToValueAtTime(0.0001, when + dur);
      osc.connect(g);
      g.connect(bgmBus);
      bgmActiveNodes.add(osc);
      bgmActiveNodes.add(g);
      osc.start(when);
      osc.stop(when + dur + 0.05);
      osc.onended = () => {
        bgmActiveNodes.delete(osc);
        bgmActiveNodes.delete(g);
        try {
          osc.disconnect();
          g.disconnect();
        } catch {
          /* ignore */
        }
      };
    }
  }

  function bgmTick(): void {
    if (!ac || destroyed) return;
    // schedule slightly ahead to keep gapless
    while (bgmNextTime < ac.currentTime + 1.0) {
      scheduleBgmChord(bgmNextTime);
      bgmNextTime += BGM_INTERVAL;
    }
  }

  function startBgm(): void {
    if (!ac || bgmTimer !== null) return;
    bgmNextTime = ac.currentTime + 0.3;
    bgmStep = 0;
    bgmTick();
    bgmTimer = window.setInterval(bgmTick, 1000);
  }

  function stopBgm(): void {
    if (bgmTimer !== null) {
      clearInterval(bgmTimer);
      bgmTimer = null;
    }
    for (const n of bgmActiveNodes) {
      try {
        if ('stop' in n && typeof (n as OscillatorNode).stop === 'function') {
          (n as OscillatorNode).stop();
        }
        n.disconnect();
      } catch {
        /* ignore */
      }
    }
    bgmActiveNodes.clear();
  }

  // ---------- mute UI ----------

  function applyMute(): void {
    if (master && ac) {
      master.gain.setValueAtTime(muted ? 0 : 1, ac.currentTime);
    }
    if (muteBtn) muteBtn.textContent = muted ? '🔇' : '🔊';
  }

  function buildMuteButton(): void {
    const btn = document.createElement('button');
    btn.className = 'bb-audio-mute';
    btn.type = 'button';
    btn.textContent = muted ? '🔇' : '🔊';
    btn.setAttribute('aria-label', 'Toggle sound');
    btn.style.cssText = [
      'position:absolute',
      'top:8px',
      'right:8px',
      'z-index:50',
      'pointer-events:auto',
      'width:36px',
      'height:36px',
      'border-radius:50%',
      'border:none',
      'cursor:pointer',
      'font-size:18px',
      'line-height:36px',
      'text-align:center',
      'padding:0',
      'background:#FBF7F0',
      'color:#2B2B33',
      'box-shadow:0 2px 6px rgba(43,43,51,0.18)',
      'user-select:none',
    ].join(';');
    btn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
    });
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      muted = !muted;
      saveMuted(muted);
      ensureContext();
      tryResume();
      applyMute();
    });
    ctx.uiRoot.appendChild(btn);
    muteBtn = btn;
  }

  // ---------- module ----------

  return {
    name: 'audio',
    init(c) {
      ctx = c;
      muted = loadMuted();
      buildMuteButton();

      // one-time user-gesture unlock
      gestureHandler = () => {
        ensureContext();
        tryResume();
        if (gestureHandler) {
          window.removeEventListener('pointerdown', gestureHandler);
          window.removeEventListener('keydown', gestureHandler);
          window.removeEventListener('touchstart', gestureHandler);
          gestureHandler = null;
        }
      };
      window.addEventListener('pointerdown', gestureHandler, { passive: true });
      window.addEventListener('keydown', gestureHandler);
      window.addEventListener('touchstart', gestureHandler, { passive: true });

      const bus = ctx.bus;
      unsubs.push(bus.on('TICK', () => { popsThisFrame = 0; }));
      unsubs.push(bus.on('BADGE_CLEARED', () => sfxBadgeCleared()));
      unsubs.push(bus.on('SWIPE', () => sfxSwipe()));
      unsubs.push(bus.on('LEVEL_UP', () => sfxLevelUp()));
      unsubs.push(bus.on('PHONE_RETURNED', () => sfxPhoneReturned()));
      unsubs.push(bus.on('CUSTOMER_ARRIVED', () => sfxCustomerArrived()));
      unsubs.push(bus.on('CUSTOMER_LEFT', (e) => sfxCustomerLeft(e.reason)));
      unsubs.push(bus.on('USE_SKILL', () => sfxUseSkill()));
      unsubs.push(bus.on('UPGRADE_PURCHASED', () => sfxUpgradePurchased()));
      unsubs.push(bus.on('SKILL_UNLOCKED', () => sfxSkillUnlocked()));
    },

    destroy() {
      destroyed = true;

      for (const u of unsubs) {
        try {
          u();
        } catch {
          /* ignore */
        }
      }
      unsubs.length = 0;

      if (gestureHandler) {
        window.removeEventListener('pointerdown', gestureHandler);
        window.removeEventListener('keydown', gestureHandler);
        window.removeEventListener('touchstart', gestureHandler);
        gestureHandler = null;
      }

      stopBgm();

      if (muteBtn && muteBtn.parentNode) {
        muteBtn.parentNode.removeChild(muteBtn);
      }
      muteBtn = null;

      try {
        sfxBus?.disconnect();
        bgmBus?.disconnect();
        master?.disconnect();
      } catch {
        /* ignore */
      }

      if (ac) {
        void ac.close().catch(() => {});
        ac = null;
      }
      master = null;
      sfxBus = null;
      bgmBus = null;
      noiseBuffer = null;
    },
  };
}
