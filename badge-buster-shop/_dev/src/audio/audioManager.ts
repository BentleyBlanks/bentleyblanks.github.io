import type { GameContext, GameModule } from '../types/module.types';

type OscType = OscillatorType;

export function createAudioModule(): GameModule {
  let ctx: GameContext;
  let audioCtx: AudioContext | null = null;
  let master: GainNode | null = null;
  let bgm: OscillatorNode | null = null;
  let muted = localStorage.getItem('badge-buster-muted') === '1';
  let clearStreak = 0;
  let lastClearAt = -Infinity;
  let lastSwipeAt = -Infinity;

  function ensureAudio(): AudioContext | null {
    if (muted) {
      return null;
    }
    if (!audioCtx) {
      audioCtx = new AudioContext();
      master = audioCtx.createGain();
      master.gain.value = 0.75;
      master.connect(audioCtx.destination);
      startBgm();
    }
    if (audioCtx.state === 'suspended') {
      void audioCtx.resume();
    }
    return audioCtx;
  }

  function playTone(freq: number, duration: number, gain = 0.07, type: OscType = 'sine', slide = 1): void {
    const ac = ensureAudio();
    if (!ac || !master) {
      return;
    }
    const osc = ac.createOscillator();
    const amp = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), ac.currentTime + duration);
    amp.gain.setValueAtTime(0.0001, ac.currentTime);
    amp.gain.exponentialRampToValueAtTime(gain, ac.currentTime + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duration);
    osc.connect(amp);
    amp.connect(master);
    osc.start();
    osc.stop(ac.currentTime + duration + 0.02);
  }

  function playChord(base: number, gain = 0.045): void {
    playTone(base, 0.16, gain, 'triangle', 1.15);
    window.setTimeout(() => playTone(base * 1.5, 0.18, gain * 0.9, 'triangle', 1.05), 70);
  }

  function playSkillHit(): void {
    playChord(246.94, 0.055);
    window.setTimeout(() => playTone(493.88, 0.2, 0.052, 'sawtooth', 1.4), 90);
    window.setTimeout(() => playTone(987.77, 0.16, 0.048, 'triangle', 1.12), 170);
  }

  function playSmash(): void {
    playTone(92, 0.28, 0.075, 'sawtooth', 0.55);
    window.setTimeout(() => playTone(370, 0.13, 0.055, 'square', 1.8), 70);
    window.setTimeout(() => playTone(740, 0.16, 0.05, 'triangle', 1.35), 150);
  }

  function startBgm(): void {
    if (!audioCtx || !master || bgm) {
      return;
    }
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    const gain = audioCtx.createGain();
    gain.gain.value = 0.018;
    bgm = audioCtx.createOscillator();
    bgm.type = 'triangle';
    bgm.frequency.value = ctx.state.queue.length >= ctx.state.queueCapacity - 1 ? 174 : 130.8;
    bgm.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    bgm.start();
  }

  function setMuted(nextMuted: boolean): void {
    muted = nextMuted;
    if (master) {
      master.gain.value = muted ? 0 : 0.75;
    }
    if (!muted) {
      ensureAudio();
    }
  }

  return {
    name: 'audio',
    init(context) {
      ctx = context;
      const unlock = () => ensureAudio();
      window.addEventListener('pointerdown', unlock, { once: true });
      window.addEventListener('keydown', unlock, { once: true });
      window.addEventListener('badge-buster-toggle-audio', ((event: CustomEvent<{ muted: boolean }>) => {
        setMuted(event.detail.muted);
      }) as EventListener);

      ctx.bus.on('BADGE_CLEARED', (event) => {
        if (event.amount <= 0) {
          return;
        }
        const now = performance.now();
        clearStreak = now - lastClearAt < 680 ? clearStreak + 1 : 1;
        lastClearAt = now;
        const pitch = 760 * Math.pow(1.045, Math.min(16, clearStreak));
        playTone(pitch, 0.075, 0.052, 'square', 1.32);
        if (clearStreak >= 4 && clearStreak % 4 === 0) {
          window.setTimeout(() => playTone(pitch * 1.5, 0.09, 0.04, 'triangle', 1.18), 36);
        }
      });
      ctx.bus.on('SWIPE', () => {
        const now = performance.now();
        if (now - lastSwipeAt < 92) {
          return;
        }
        lastSwipeAt = now;
        playTone(320, 0.13, 0.032, 'sawtooth', 1.85);
      });
      ctx.bus.on('LEVEL_UP', () => playChord(523.25));
      ctx.bus.on('PHONE_RETURNED', () => playChord(392));
      ctx.bus.on('PHONE_SMASHED', playSmash);
      ctx.bus.on('CUSTOMER_ARRIVED', () => playTone(660, 0.12, 0.045, 'triangle', 1.25));
      ctx.bus.on('CUSTOMER_LEFT', (event) => playTone(event.reason === 'overflow' ? 180 : 140, 0.22, 0.055, 'sawtooth', 0.7));
      ctx.bus.on('SKILL_USED', playSkillHit);
      ctx.bus.on('UPGRADE_PURCHASED', () => playTone(988, 0.12, 0.055, 'triangle', 1.2));
    },
    update() {
      if (bgm && audioCtx) {
        const target = ctx.state.queue.length >= Math.max(1, ctx.state.queueCapacity - 1) ? 174 : 130.8;
        bgm.frequency.setTargetAtTime(target, audioCtx.currentTime, 0.35);
      }
    },
  };
}
