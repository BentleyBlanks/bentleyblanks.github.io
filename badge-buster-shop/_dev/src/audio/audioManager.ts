import type { GameContext, GameModule } from '../types/module.types';

type OscType = OscillatorType;

export function createAudioModule(): GameModule {
  let ctx: GameContext;
  let audioCtx: AudioContext | null = null;
  let master: GainNode | null = null;
  let bgm: OscillatorNode | null = null;
  let muted = localStorage.getItem('badge-buster-muted') === '1';

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

  function playChord(base: number): void {
    playTone(base, 0.16, 0.045, 'triangle', 1.15);
    window.setTimeout(() => playTone(base * 1.5, 0.18, 0.04, 'triangle', 1.05), 70);
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
        if (event.amount > 0) playTone(820, 0.08, 0.055, 'square', 1.35);
      });
      ctx.bus.on('SWIPE', () => playTone(320, 0.18, 0.04, 'sawtooth', 1.8));
      ctx.bus.on('LEVEL_UP', () => playChord(523.25));
      ctx.bus.on('PHONE_RETURNED', () => playChord(392));
      ctx.bus.on('CUSTOMER_ARRIVED', () => playTone(660, 0.12, 0.045, 'triangle', 1.25));
      ctx.bus.on('CUSTOMER_LEFT', (event) => playTone(event.reason === 'overflow' ? 180 : 140, 0.22, 0.055, 'sawtooth', 0.7));
      ctx.bus.on('SKILL_USED', () => playChord(246.94));
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
