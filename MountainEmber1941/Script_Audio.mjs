function CreateNoiseBuffer(context, duration = 0.6) {
  const frameCount = Math.max(1, Math.floor(context.sampleRate * duration));
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 1941;
  for (let index = 0; index < frameCount; index += 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[index] = ((seed / 4294967296) * 2 - 1) * (1 - index / frameCount);
  }
  return buffer;
}

export function CreateAudioSystem() {
  let context = null;
  let master = null;
  let ambience = null;
  let noiseBuffer = null;
  let muted = false;
  let started = false;

  function EnsureContext() {
    if (context) return context;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    context = new AudioContextClass();
    master = context.createGain();
    master.gain.value = muted ? 0 : 0.32;
    master.connect(context.destination);
    noiseBuffer = CreateNoiseBuffer(context);
    return context;
  }

  function Start() {
    const audioContext = EnsureContext();
    if (!audioContext) return false;
    audioContext.resume();
    if (started) return true;
    started = true;
    const oscillator = audioContext.createOscillator();
    const filter = audioContext.createBiquadFilter();
    ambience = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 48;
    filter.type = "lowpass";
    filter.frequency.value = 180;
    ambience.gain.value = 0.035;
    oscillator.connect(filter);
    filter.connect(ambience);
    ambience.connect(master);
    oscillator.start();
    return true;
  }

  function Tone(frequency, duration, gainValue, type = "sine", destination = master) {
    if (!context || !destination) return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainValue), now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.03);
  }

  function Noise(duration, gainValue, lowpass = 2200, highpass = 80) {
    if (!context || !noiseBuffer || !master) return;
    const now = context.currentTime;
    const source = context.createBufferSource();
    const lowFilter = context.createBiquadFilter();
    const highFilter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = noiseBuffer;
    lowFilter.type = "lowpass";
    lowFilter.frequency.value = lowpass;
    highFilter.type = "highpass";
    highFilter.frequency.value = highpass;
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(lowFilter);
    lowFilter.connect(highFilter);
    highFilter.connect(gain);
    gain.connect(master);
    source.start(now);
    source.stop(now + duration);
  }

  function Play(kind) {
    if (!context || muted) return;
    if (kind === "select") {
      Tone(520, 0.055, 0.035, "triangle");
    } else if (kind === "command") {
      Tone(360, 0.07, 0.04, "triangle");
      window.setTimeout(() => Tone(470, 0.055, 0.025, "triangle"), 45);
    } else if (kind === "pause") {
      Tone(245, 0.12, 0.05, "sine");
    } else if (kind === "objective") {
      Tone(294, 0.24, 0.055, "sine");
      window.setTimeout(() => Tone(392, 0.28, 0.05, "sine"), 130);
      window.setTimeout(() => Tone(494, 0.34, 0.04, "sine"), 260);
    } else if (kind === "alert") {
      Tone(152, 0.22, 0.07, "sawtooth");
      window.setTimeout(() => Tone(128, 0.28, 0.06, "sawtooth"), 210);
    } else if (kind === "footstep") {
      Noise(0.06, 0.022, 420, 45);
    } else if (kind === "stone") {
      Noise(0.11, 0.07, 1250, 160);
    } else if (kind === "gunshot") {
      Noise(0.18, 0.22, 4100, 180);
      Tone(82, 0.16, 0.08, "triangle");
    } else if (kind === "enemyShot") {
      Noise(0.16, 0.16, 3200, 160);
      Tone(72, 0.14, 0.06, "triangle");
    } else if (kind === "explosion") {
      Noise(0.52, 0.34, 1800, 35);
      Tone(48, 0.7, 0.14, "sine");
    } else if (kind === "interaction") {
      Tone(650, 0.05, 0.025, "square");
    }
  }

  function SetMuted(value) {
    muted = Boolean(value);
    if (master && context) {
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.linearRampToValueAtTime(muted ? 0 : 0.32, context.currentTime + 0.08);
    }
  }

  function IsMuted() {
    return muted;
  }

  function Dispose() {
    context?.close?.();
    context = null;
    master = null;
    ambience = null;
    noiseBuffer = null;
  }

  return { Start, Play, SetMuted, IsMuted, Dispose };
}
