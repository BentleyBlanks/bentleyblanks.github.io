function Clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export class GameAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.enabled = true;
    this.noiseBuffer = null;
  }

  SetEnabled(enabled) {
    this.enabled = Boolean(enabled);
  }

  EnsureContext() {
    if (!this.enabled) return null;
    const AudioContextConstructor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextConstructor) return null;
    if (!this.context) {
      this.context = new AudioContextConstructor();
      this.master = this.context.createGain();
      this.master.gain.value = .4;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === "suspended") this.context.resume().catch(() => {});
    return this.context;
  }

  CreateNoiseBuffer() {
    const context = this.EnsureContext();
    if (!context) return null;
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === context.sampleRate) return this.noiseBuffer;
    const frameCount = Math.floor(context.sampleRate * .65);
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const channel = buffer.getChannelData(0);
    let previous = 0;
    for (let index = 0; index < frameCount; index += 1) {
      const white = Math.random() * 2 - 1;
      previous = previous * .78 + white * .22;
      channel[index] = previous;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  Tone(frequency, duration, options = {}) {
    const context = this.EnsureContext();
    if (!context) return;
    const startTime = context.currentTime + (options.delay ?? 0);
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    oscillator.type = options.type ?? "triangle";
    oscillator.frequency.setValueAtTime(Math.max(20, frequency), startTime);
    if (options.endFrequency) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, options.endFrequency), startTime + duration);
    }
    filter.type = options.filterType ?? "lowpass";
    filter.frequency.value = options.filterFrequency ?? 3500;
    gain.gain.setValueAtTime(.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(options.volume ?? .07, startTime + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, startTime + duration);
    oscillator.connect(filter).connect(gain).connect(this.master);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration + .02);
  }

  Noise(duration, options = {}) {
    const context = this.EnsureContext();
    const buffer = this.CreateNoiseBuffer();
    if (!context || !buffer) return;
    const startTime = context.currentTime + (options.delay ?? 0);
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    filter.type = options.filterType ?? "bandpass";
    filter.frequency.value = options.frequency ?? 900;
    filter.Q.value = options.q ?? .8;
    gain.gain.setValueAtTime(options.volume ?? .08, startTime);
    gain.gain.exponentialRampToValueAtTime(.0001, startTime + duration);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(startTime, 0, Math.min(duration, buffer.duration));
  }

  Ui() {
    this.Tone(510, .05, { endFrequency: 660, volume: .035, type: "sine" });
  }

  Deploy() {
    this.Tone(180, .18, { endFrequency: 420, volume: .07, type: "sawtooth", filterFrequency: 1200 });
    this.Tone(520, .13, { delay: .12, endFrequency: 760, volume: .045, type: "triangle" });
  }

  Shot(weaponId = "PulseCarbine") {
    const profile = {
      PulseCarbine: { frequency: 135, noise: .085, tone: .07 },
      RivetSmg: { frequency: 190, noise: .055, tone: .045 },
      ScoutRifle: { frequency: 92, noise: .15, tone: .11 },
    }[weaponId] ?? { frequency: 150, noise: .07, tone: .06 };
    this.Noise(profile.noise, { frequency: profile.frequency * 9, q: .65, volume: .12 });
    this.Tone(profile.frequency, profile.tone, { endFrequency: 45, volume: .11, type: "sawtooth", filterFrequency: 1100 });
  }

  Hit() {
    this.Tone(910, .045, { endFrequency: 580, volume: .035, type: "square", filterFrequency: 1900 });
  }

  Hurt() {
    this.Noise(.16, { frequency: 280, q: .5, volume: .08 });
    this.Tone(72, .19, { endFrequency: 44, volume: .085, type: "sine" });
  }

  Pickup() {
    this.Tone(440, .06, { endFrequency: 660, volume: .035, type: "sine" });
    this.Tone(690, .07, { delay: .05, endFrequency: 880, volume: .025, type: "sine" });
  }

  Jump() {
    this.Noise(.28, { frequency: 720, q: .45, volume: .045 });
    this.Tone(170, .22, { endFrequency: 105, volume: .035, type: "triangle" });
  }

  Land() {
    this.Noise(.12, { frequency: 150, q: .65, volume: .09 });
    this.Tone(58, .14, { endFrequency: 38, volume: .085, type: "sine" });
  }

  Eliminate() {
    this.Tone(320, .1, { endFrequency: 210, volume: .05, type: "square", filterFrequency: 1250 });
    this.Tone(520, .14, { delay: .08, endFrequency: 780, volume: .055, type: "triangle" });
  }

  Zone() {
    this.Tone(170, .3, { endFrequency: 120, volume: .032, type: "sine" });
    this.Tone(225, .24, { delay: .08, endFrequency: 160, volume: .024, type: "sine" });
  }

  Result(won) {
    if (won) {
      for (const [index, frequency] of [330, 440, 550, 740].entries()) {
        this.Tone(frequency, .22, { delay: index * .12, endFrequency: frequency * 1.04, volume: .055, type: "triangle" });
      }
    } else {
      this.Tone(210, .35, { endFrequency: 105, volume: .07, type: "triangle" });
      this.Tone(146, .42, { delay: .14, endFrequency: 78, volume: .055, type: "sine" });
    }
  }

  SetMasterVolume(volume) {
    if (!this.master) return;
    this.master.gain.value = Clamp(volume, 0, 1);
  }
}

export default GameAudio;
