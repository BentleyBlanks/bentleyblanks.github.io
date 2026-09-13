import { CHARACTER_SPEECH as C } from './Data_Tuning_CharacterSpeech.mjs';
const Clamp01 = value => Math.min(1, Math.max(0, value));

/** Analyze a decoded, unmixed voice once. Gunfire, distance and other speakers
 * cannot open this actor's mouth. Only the compact envelope is retained here. */
export function BuildSpeechEnvelope(buffer) {
  const stride = Math.max(1, Math.round(buffer.sampleRate / C.samplesPerSecond));
  const channels = Array.from({length: buffer.numberOfChannels}, (_, i) => buffer.getChannelData(i));
  const count = Math.ceil(buffer.length / stride), rms = new Float32Array(count), brightness = new Float32Array(count);
  for (let frame = 0; frame < count; frame++) {
    const start = frame * stride, end = Math.min(buffer.length, start + stride);
    let energy = 0, difference = 0;
    for (const samples of channels) for (let i = start; i < end; i++) {
      energy += samples[i] ** 2;
      difference += (samples[i] - samples[Math.max(0, i - 1)]) ** 2;
    }
    rms[frame] = Math.sqrt(energy / Math.max(1, (end - start) * channels.length));
    brightness[frame] = Clamp01(Math.sqrt(difference / Math.max(1e-12, energy)) * C.brightnessScale);
  }
  const sorted = Array.from(rms).sort((a, b) => a - b);
  const reference = Math.max(C.minimumReference, sorted[Math.floor((count - 1) * C.referencePercentile)] || 0);
  const levels = Float32Array.from(rms, value => {
    const signal = Clamp01((value / reference - C.silenceRatio) / (1 - C.silenceRatio));
    return signal ** .7;
  });
  return {stepS: stride / buffer.sampleRate, duration: buffer.duration, levels, brightness};
}

export function SampleSpeechEnvelope(envelope, seconds, target = {}) {
  target.level = 0; target.brightness = 0;
  if (!envelope || !Number.isFinite(seconds) || seconds < 0 || seconds >= envelope.duration) return target;
  const cursor = seconds / envelope.stepS, index = Math.floor(cursor), fraction = cursor - index;
  const last = envelope.levels.length - 1;
  for (const [key, values] of [['level', envelope.levels], ['brightness', envelope.brightness]]) {
    const a = values[Math.min(index, last)] || 0, b = values[Math.min(index + 1, last)] || 0;
    target[key] = a + (b - a) * fraction;
  }
  return target;
}
