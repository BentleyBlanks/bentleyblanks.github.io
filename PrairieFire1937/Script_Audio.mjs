// 《燎原 · 敌后1937》 —— WebAudio 现场合成音频层。
//
// 全项目没有任何音频文件：环境音乐与全部音效都在浏览器里用振荡器、噪声缓冲与滤波器实时合成。
//
// 设计要点：
//   1. 模块顶层零副作用 —— 不创建 AudioContext，不碰 document，不注册事件。
//      音频上下文只在 Start() 里创建（必须由用户手势触发），任何失败都静默降级为无声哑对象，绝不抛异常。
//   2. 环境音乐是生成式的：以五声音阶（宫商角徵羽）为骨架，五个时期各用一种调式、一套配器、一种织体。
//      乐句长度、休止、转位、速度都带确定性随机（种子经 Script_Hex 的 CreateRng 派生），可无限延续而无明显循环。
//   3. 音效在 Start() 时用 OfflineAudioContext 预渲染成 AudioBuffer 以降低开销；预渲染失败则退回实时合成，
//      两条路径共用同一份合成函数，音色一致。
//   4. 主音量之外音乐与音效分轨；同名音效有最小间隔与最大并发数节流，全局并发也有上限。
//
// 时期与织体：开辟期竹笛感长音 + 疏朗动机、留白多；发展期加拨弦短音型、节奏渐紧；
// 困难期低沉长音 + 小二度不谐和 + 大量留白；恢复期回暖并加入劳作般的规律律动；反攻期加厚低音与推进感。
import { CreateRng } from "./Script_Hex.mjs";

// ---------------------------------------------------------------------------
// 五声音阶与调式
// ---------------------------------------------------------------------------

/** 宫商角徵羽在十二平均律里的半音位置。 */
export const pentatonicSteps = Object.freeze([0, 2, 4, 7, 9]);
export const pentatonicNames = Object.freeze(["宫", "商", "角", "徵", "羽"]);

/** 五种调式：以五声音阶的第 n 音为主音重排出的半音序列。 */
export const modeDefinitions = Object.freeze({
  Gong: Object.freeze({ key: "Gong", name: "宫调式", offsets: Object.freeze([0, 2, 4, 7, 9]) }),
  Shang: Object.freeze({ key: "Shang", name: "商调式", offsets: Object.freeze([0, 2, 5, 7, 10]) }),
  Jue: Object.freeze({ key: "Jue", name: "角调式", offsets: Object.freeze([0, 3, 5, 8, 10]) }),
  Zhi: Object.freeze({ key: "Zhi", name: "徵调式", offsets: Object.freeze([0, 2, 5, 7, 9]) }),
  Yu: Object.freeze({ key: "Yu", name: "羽调式", offsets: Object.freeze([0, 3, 5, 7, 10]) }),
});

/** 五个时期的音乐参数。pulseDivisor 的单位是"步"，一步等于一个八分音符。 */
export const eraMusicProfiles = Object.freeze({
  Opening: Object.freeze({
    mode: "Zhi", rootMidi: 62, tempo: 64,
    leadDensity: 0.52, leadOctave: 1, leadLength: Object.freeze([2, 5]),
    pluckDensity: 0.12, bassDensity: 0.06, droneOctave: -1, pulseDivisor: 0,
    dissonance: 0, restBias: 0.15, restLength: Object.freeze([2, 5]),
    filterBase: 1500, filterRange: 700, lfoRate: 0.045, reverbSend: 0.36,
    phraseLengths: Object.freeze([12, 16, 20]),
    voiceGain: Object.freeze({ lead: 0.2, pluck: 0.1, drone: 0.075, bass: 0.06, drum: 0 }),
  }),
  Growth: Object.freeze({
    mode: "Gong", rootMidi: 55, tempo: 82,
    leadDensity: 0.5, leadOctave: 2, leadLength: Object.freeze([1, 4]),
    pluckDensity: 0.34, bassDensity: 0.16, droneOctave: -1, pulseDivisor: 0,
    dissonance: 0.04, restBias: 0.12, restLength: Object.freeze([2, 5]),
    filterBase: 1900, filterRange: 900, lfoRate: 0.06, reverbSend: 0.3,
    phraseLengths: Object.freeze([12, 16, 16, 24]),
    voiceGain: Object.freeze({ lead: 0.18, pluck: 0.15, drone: 0.07, bass: 0.09, drum: 0.05 }),
  }),
  Hardship: Object.freeze({
    mode: "Yu", rootMidi: 45, tempo: 46,
    leadDensity: 0.24, leadOctave: 1, leadLength: Object.freeze([4, 10]),
    pluckDensity: 0.05, bassDensity: 0.1, droneOctave: 0, pulseDivisor: 0,
    dissonance: 0.42, restBias: 0.42, restLength: Object.freeze([5, 14]),
    filterBase: 620, filterRange: 260, lfoRate: 0.028, reverbSend: 0.55,
    phraseLengths: Object.freeze([16, 20, 28]),
    voiceGain: Object.freeze({ lead: 0.14, pluck: 0.06, drone: 0.13, bass: 0.1, drum: 0 }),
  }),
  Recovery: Object.freeze({
    mode: "Shang", rootMidi: 53, tempo: 76,
    leadDensity: 0.46, leadOctave: 2, leadLength: Object.freeze([2, 5]),
    pluckDensity: 0.28, bassDensity: 0.2, droneOctave: -1, pulseDivisor: 4,
    dissonance: 0.02, restBias: 0.14, restLength: Object.freeze([2, 6]),
    filterBase: 1750, filterRange: 850, lfoRate: 0.05, reverbSend: 0.32,
    phraseLengths: Object.freeze([16, 16, 24]),
    voiceGain: Object.freeze({ lead: 0.18, pluck: 0.13, drone: 0.07, bass: 0.11, drum: 0.09 }),
  }),
  Counter: Object.freeze({
    mode: "Gong", rootMidi: 48, tempo: 96,
    leadDensity: 0.55, leadOctave: 2, leadLength: Object.freeze([1, 3]),
    pluckDensity: 0.4, bassDensity: 0.34, droneOctave: 0, pulseDivisor: 2,
    dissonance: 0.06, restBias: 0.07, restLength: Object.freeze([1, 3]),
    filterBase: 2400, filterRange: 1100, lfoRate: 0.075, reverbSend: 0.26,
    phraseLengths: Object.freeze([16, 16, 32]),
    voiceGain: Object.freeze({ lead: 0.19, pluck: 0.15, drone: 0.08, bass: 0.15, drum: 0.12 }),
  }),
});

// ---------------------------------------------------------------------------
// 纯数学工具
// ---------------------------------------------------------------------------

function Clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

function Clamp01(value) {
  return Clamp(Number(value) || 0, 0, 1);
}

function MidiToFrequency(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** 调式内的第 degree 级（可为负、可跨八度），返回 MIDI 音高。 */
function ScaleMidi(modeKey, rootMidi, degree) {
  const mode = modeDefinitions[modeKey] || modeDefinitions.Gong;
  const size = mode.offsets.length;
  const octave = Math.floor(degree / size);
  let index = degree % size;
  if (index < 0) index += size;
  return rootMidi + mode.offsets[index] + octave * 12;
}

function HashText(text) {
  let hash = 2166136261;
  const value = String(text);
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function PickRange(range, roll) {
  if (!Array.isArray(range)) return Number(range) || 0;
  const high = range.length > 1 ? range[1] : range[0];
  return range[0] + Math.floor(Clamp01(roll) * (high - range[0] + 1));
}

/** 音频层的所有异常都在这里被吞掉：出不出声绝不影响游戏循环。 */
function Safe(action) {
  try {
    action();
  } catch (error) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// 通用音频构件（在线 AudioContext 与 OfflineAudioContext 通用）
// ---------------------------------------------------------------------------

const noiseCache = new WeakMap();

/** 每个 context 缓存一段 2.5 秒的确定性白噪声，避免反复生成。 */
function GetNoiseBuffer(ctx) {
  const cached = noiseCache.get(ctx);
  if (cached) return cached;
  const length = Math.max(1, Math.floor(ctx.sampleRate * 2.5));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const rng = CreateRng(0x5f3a17);
  for (let index = 0; index < length; index += 1) data[index] = rng() * 2 - 1;
  noiseCache.set(ctx, buffer);
  return buffer;
}

/** 程序化混响脉冲响应：指数衰减噪声，前 30 毫秒抬高一点做早期反射。 */
function CreateImpulseResponse(ctx, seconds, decay) {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  const rng = CreateRng(0x2b91d7);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      const envelope = Math.pow(1 - index / length, decay);
      data[index] = (rng() * 2 - 1) * envelope * (index < ctx.sampleRate * 0.03 ? 1.6 : 1);
    }
  }
  return buffer;
}

function CreateNoiseSource(ctx, time, duration) {
  const source = ctx.createBufferSource();
  source.buffer = GetNoiseBuffer(ctx);
  source.loop = true;
  const offset = (Math.abs(Math.sin(time * 12.9898)) * 2.4) % 2.4;
  source.start(time, offset, Math.max(0.02, duration) + 0.02);
  return source;
}

function CreateOscillator(ctx, type, frequency, time, duration, detuneCents) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(8, frequency), time);
  if (detuneCents) osc.detune.setValueAtTime(detuneCents, time);
  osc.start(time);
  osc.stop(time + Math.max(0.02, duration) + 0.05);
  return osc;
}

/** 打击式包络：极快起音 + 指数衰减。exponentialRamp 不能到 0，统一收到 0.0001。 */
function CreatePercussiveGain(ctx, time, peak, attack, decay) {
  const gain = ctx.createGain();
  const level = Math.max(0.0002, peak);
  const attackTime = Math.max(0.0008, attack || 0.002);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(level, time + attackTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + attackTime + Math.max(0.02, decay));
  return gain;
}

/** 吹奏式包络：柔起音 + 保持 + 柔收。 */
function CreateSustainGain(ctx, time, peak, attack, hold, release) {
  const gain = ctx.createGain();
  const level = Math.max(0.0002, peak);
  const rise = Math.max(0.005, attack);
  const flat = Math.max(0, hold);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.linearRampToValueAtTime(level, time + rise);
  gain.gain.setValueAtTime(level, time + rise + flat);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + rise + flat + Math.max(0.03, release));
  return gain;
}

function CreateFilter(ctx, type, frequency, q) {
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = Math.max(20, frequency);
  if (q !== undefined) filter.Q.value = q;
  return filter;
}

/** 把一串节点顺序连起来，最后一个通常是目的地或 AudioParam。 */
function Chain(nodes) {
  for (let index = 0; index < nodes.length - 1; index += 1) nodes[index].connect(nodes[index + 1]);
  return nodes[nodes.length - 1];
}

/** 给某个 AudioParam 挂一个低频振荡器：颤音、抖动、滤波扫动都用它。 */
function AttachLfo(ctx, param, time, duration, rate, depth, type) {
  const lfo = CreateOscillator(ctx, type || "sine", rate, time, duration);
  const gain = ctx.createGain();
  gain.gain.value = depth;
  lfo.connect(gain);
  gain.connect(param);
  return { lfo, gain };
}

/** 一段经滤波的噪声脉冲，是绝大多数打击/摩擦/气声音效的基本积木。 */
function RenderNoiseBurst(ctx, destination, time, type, frequency, q, level, attack, decay, extraLength) {
  const noise = CreateNoiseSource(ctx, time, extraLength === undefined ? decay : extraLength);
  const filter = CreateFilter(ctx, type, frequency, q);
  Chain([noise, filter, CreatePercussiveGain(ctx, time, level, attack, decay), destination]);
  return filter;
}

function RenderSimpleTone(ctx, destination, time, type, frequency, level, attack, decay) {
  const osc = CreateOscillator(ctx, type, frequency, time, decay);
  Chain([osc, CreatePercussiveGain(ctx, time, level, attack, decay), destination]);
}

// ---------------------------------------------------------------------------
// 音效合成
// 每个音效是 Render(ctx, destination, time)，既可实时跑，也可在 OfflineAudioContext 里预渲染。
// ---------------------------------------------------------------------------

/** 木质轻叩：窄带噪声的"哒" + 一点木头共鸣。UI 点击的基础音。 */
function RenderWoodTap(ctx, destination, time, level) {
  RenderNoiseBurst(ctx, destination, time, "bandpass", 1900, 8, 0.55 * level, 0.001, 0.045);
  RenderSimpleTone(ctx, destination, time, "sine", 386, 0.3 * level, 0.001, 0.07);
  RenderSimpleTone(ctx, destination, time, "triangle", 1180, 0.16 * level, 0.001, 0.03);
}

function RenderTone(ctx, destination, time, frequency, duration, level, type, cutoff) {
  const osc = CreateOscillator(ctx, type || "triangle", frequency, time, duration);
  const filter = CreateFilter(ctx, "lowpass", cutoff || frequency * 5, 0.9);
  Chain([osc, filter, CreateSustainGain(ctx, time, level, 0.012, duration * 0.4, duration * 0.7), destination]);
}

/** 闷响：低通噪声 + 一条向下滑的正弦，是爆破与夯土共同的底子。 */
function RenderThud(ctx, destination, time, level, lowHz, decay) {
  RenderNoiseBurst(ctx, destination, time, "lowpass", 340, 0.8, 0.5 * level, 0.003, decay);
  const sub = ctx.createOscillator();
  sub.type = "sine";
  sub.frequency.setValueAtTime(lowHz * 2.4, time);
  sub.frequency.exponentialRampToValueAtTime(Math.max(20, lowHz), time + decay * 0.6);
  sub.start(time);
  sub.stop(time + decay + 0.08);
  Chain([sub, CreatePercussiveGain(ctx, time, 0.75 * level, 0.004, decay), destination]);
}

/** 金属条状波形：一组非谐分音，用于锣、铃与钢轨断裂。 */
function RenderMetallic(ctx, destination, time, base, ratios, decays, level, detune) {
  for (let index = 0; index < ratios.length; index += 1) {
    const frequency = base * ratios[index];
    if (frequency > 18000) continue;
    const decay = decays[index] === undefined ? 0.5 : decays[index];
    const osc = CreateOscillator(ctx, "sine", frequency, time, decay, detune ? (index % 2 ? detune : -detune) : 0);
    Chain([osc, CreatePercussiveGain(ctx, time, (level * 0.9) / (1 + index * 0.8), 0.002, decay), destination]);
  }
}

/** 带扫频的带通噪声：翻页的"刷"与钢轨的刮擦。 */
function RenderSweptNoise(ctx, destination, time, fromHz, toHz, q, level, length) {
  const noise = CreateNoiseSource(ctx, time, length + 0.05);
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.setValueAtTime(fromHz, time);
  band.frequency.exponentialRampToValueAtTime(toHz, time + length);
  band.Q.value = q;
  Chain([noise, band, CreatePercussiveGain(ctx, time, level, 0.006, length), destination]);
}

const sfxDefinitions = Object.freeze({
  Click: { duration: 0.16, gain: 0.6, minInterval: 0.035, maxVoices: 4,
    Render(ctx, destination, time) {
      RenderWoodTap(ctx, destination, time, 1);
    } },
  Confirm: { duration: 0.6, gain: 0.55, minInterval: 0.08, maxVoices: 3,
    Render(ctx, destination, time) {
      RenderWoodTap(ctx, destination, time, 0.6);
      RenderTone(ctx, destination, time + 0.02, MidiToFrequency(69), 0.16, 0.3, "triangle", 2600);
      RenderTone(ctx, destination, time + 0.14, MidiToFrequency(76), 0.3, 0.26, "triangle", 3000);
    } },
  Cancel: { duration: 0.5, gain: 0.5, minInterval: 0.08, maxVoices: 3,
    Render(ctx, destination, time) {
      RenderWoodTap(ctx, destination, time, 0.4);
      RenderTone(ctx, destination, time + 0.02, MidiToFrequency(69), 0.16, 0.26, "triangle", 1400);
      RenderTone(ctx, destination, time + 0.13, MidiToFrequency(64), 0.26, 0.24, "triangle", 1100);
    } },
  March: { duration: 1.7, gain: 0.5, minInterval: 0.5, maxVoices: 2,
    Render(ctx, destination, time) {
      // 六步脚步：沙沙声是高通再低通的噪声，落地的闷音是一下很短的低频正弦
      for (let step = 0; step < 6; step += 1) {
        const at = time + step * 0.255 + (step % 2 ? 0.018 : 0);
        const level = step % 2 ? 0.34 : 0.46;
        const noise = CreateNoiseSource(ctx, at, 0.11);
        const high = CreateFilter(ctx, "highpass", 210, 0.7);
        const low = CreateFilter(ctx, "lowpass", 980, 0.7);
        Chain([noise, high, low, CreatePercussiveGain(ctx, at, level, 0.006, 0.09), destination]);
        RenderSimpleTone(ctx, destination, at, "sine", 72, level * 0.5, 0.003, 0.055);
      }
    } },
  Ambush: { duration: 1, gain: 0.62, minInterval: 0.25, maxVoices: 2,
    Render(ctx, destination, time) {
      RenderNoiseBurst(ctx, destination, time, "highpass", 2600, 0.8, 0.34, 0.012, 0.16, 0.2);
      RenderThud(ctx, destination, time + 0.13, 0.7, 68, 0.42);
    } },
  Blast: { duration: 1.6, gain: 0.8, minInterval: 0.18, maxVoices: 3,
    Render(ctx, destination, time) {
      const noise = CreateNoiseSource(ctx, time, 1);
      const low = CreateFilter(ctx, "lowpass", 1400, 0.9);
      low.frequency.setValueAtTime(1400, time);
      low.frequency.exponentialRampToValueAtTime(170, time + 0.7);
      Chain([noise, low, CreatePercussiveGain(ctx, time, 0.85, 0.004, 0.85), destination]);
      const sub = ctx.createOscillator();
      sub.type = "sine";
      sub.frequency.setValueAtTime(132, time);
      sub.frequency.exponentialRampToValueAtTime(31, time + 0.55);
      sub.start(time);
      sub.stop(time + 0.9);
      Chain([sub, CreatePercussiveGain(ctx, time, 0.9, 0.004, 0.6), destination]);
      RenderNoiseBurst(ctx, destination, time, "bandpass", 2400, 2, 0.3, 0.001, 0.05);
    } },
  Rail: { duration: 1.3, gain: 0.6, minInterval: 0.15, maxVoices: 3,
    Render(ctx, destination, time) {
      RenderMetallic(ctx, destination, time, 520, [1, 1.83, 2.71, 3.94, 5.36, 7.12], [0.85, 0.6, 0.45, 0.32, 0.24, 0.16], 0.5, 6);
      RenderSweptNoise(ctx, destination, time, 820, 3100, 6, 0.4, 0.22);
      RenderThud(ctx, destination, time + 0.05, 0.35, 88, 0.3);
    } },
  Alarm: { duration: 3, gain: 0.62, minInterval: 1.2, maxVoices: 1,
    Render(ctx, destination, time) {
      // 锣：槌击噪声起振 + 八条非谐分音，起振后整体略微下滑，再叠一层拍频颤动
      RenderNoiseBurst(ctx, destination, time, "bandpass", 2900, 1.6, 0.36, 0.001, 0.045);
      const ratios = [1, 1.42, 2.03, 2.66, 3.31, 4.13, 5.02, 6.24];
      const decays = [2.6, 2.1, 1.7, 1.3, 1, 0.8, 0.6, 0.45];
      for (let index = 0; index < ratios.length; index += 1) {
        const end = 196 * ratios[index];
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(end * 1.012, time);
        osc.frequency.exponentialRampToValueAtTime(end, time + 0.45);
        osc.detune.setValueAtTime(index % 2 ? 7 : -7, time);
        osc.start(time);
        osc.stop(time + decays[index] + 0.1);
        const level = 0.4 / (1 + index * 0.55);
        const gain = CreatePercussiveGain(ctx, time, level, 0.006, decays[index]);
        AttachLfo(ctx, gain.gain, time, decays[index], 5.5 + index * 0.31, level * 0.3);
        Chain([osc, gain, destination]);
      }
    } },
  Build: { duration: 0.95, gain: 0.55, minInterval: 0.2, maxVoices: 3,
    Render(ctx, destination, time) {
      // 夯土：三下，最后一下最重
      for (let hit = 0; hit < 3; hit += 1) {
        const at = time + hit * 0.26;
        const level = hit === 2 ? 0.75 : 0.55;
        RenderThud(ctx, destination, at, level, 66, 0.2);
        RenderNoiseBurst(ctx, destination, at, "lowpass", 620, 0.9, 0.28 * level, 0.002, 0.075);
      }
    } },
  Harvest: { duration: 1.8, gain: 0.42, minInterval: 0.6, maxVoices: 2,
    Render(ctx, destination, time) {
      // 纺车吱呀：锯齿波经窄带共振，音高与音量同步做 3.1Hz 颤动，再叠一层木屑般的高频噪声
      const osc = CreateOscillator(ctx, "sawtooth", 232, time, 1.5);
      AttachLfo(ctx, osc.frequency, time, 1.5, 3.1, 46);
      const tremolo = ctx.createGain();
      tremolo.gain.value = 0.62;
      AttachLfo(ctx, tremolo.gain, time, 1.5, 3.1, 0.34);
      const band = CreateFilter(ctx, "bandpass", 720, 13);
      Chain([osc, band, CreateSustainGain(ctx, time, 0.3, 0.16, 0.9, 0.4), tremolo, destination]);
      const dust = CreateNoiseSource(ctx, time, 1.4);
      const dustFilter = CreateFilter(ctx, "highpass", 3400, 0.7);
      Chain([dust, dustFilter, CreateSustainGain(ctx, time, 0.05, 0.2, 0.8, 0.4), destination]);
    } },
  Wind: { duration: 3.4, gain: 0.4, minInterval: 1.5, maxVoices: 1,
    Render(ctx, destination, time) {
      const noise = CreateNoiseSource(ctx, time, 3.3);
      const low = CreateFilter(ctx, "lowpass", 420, 1.4);
      AttachLfo(ctx, low.frequency, time, 3.4, 0.17, 280);
      const resonance = CreateFilter(ctx, "bandpass", 640, 2.2);
      Chain([noise, low, resonance, CreateSustainGain(ctx, time, 0.42, 0.8, 1.2, 1.2), destination]);
    } },
  Snow: { duration: 3.4, gain: 0.32, minInterval: 1.5, maxVoices: 1,
    Render(ctx, destination, time) {
      const noise = CreateNoiseSource(ctx, time, 3.3);
      const high = CreateFilter(ctx, "highpass", 4200, 0.7);
      const tremolo = ctx.createGain();
      tremolo.gain.value = 0.7;
      AttachLfo(ctx, tremolo.gain, time, 3.4, 0.63, 0.28);
      Chain([noise, high, CreateSustainGain(ctx, time, 0.16, 1, 1, 1.3), tremolo, destination]);
      const rng = CreateRng(0x51e0);
      for (let grain = 0; grain < 10; grain += 1) {
        RenderNoiseBurst(ctx, destination, time + rng() * 3, "bandpass", 5200 + rng() * 2600, 9, 0.07, 0.001, 0.02);
      }
    } },
  Turn: { duration: 0.55, gain: 0.5, minInterval: 0.12, maxVoices: 2,
    Render(ctx, destination, time) {
      RenderSweptNoise(ctx, destination, time, 1700, 5200, 1.6, 0.34, 0.14);
      RenderSweptNoise(ctx, destination, time + 0.16, 2300, 3900, 1.6, 0.24, 0.11);
      RenderWoodTap(ctx, destination, time + 0.3, 0.35);
    } },
  Unlock: { duration: 1.3, gain: 0.5, minInterval: 0.2, maxVoices: 2,
    Render(ctx, destination, time) {
      RenderMetallic(ctx, destination, time, 2350, [1, 1.51, 2.21, 3.02], [0.95, 0.7, 0.5, 0.34], 0.34, 4);
      RenderTone(ctx, destination, time + 0.03, MidiToFrequency(72), 0.14, 0.2, "triangle", 4000);
      RenderTone(ctx, destination, time + 0.11, MidiToFrequency(76), 0.14, 0.19, "triangle", 4400);
      RenderTone(ctx, destination, time + 0.19, MidiToFrequency(79), 0.4, 0.2, "triangle", 4800);
    } },
  Good: { duration: 1.2, gain: 0.5, minInterval: 0.25, maxVoices: 2,
    Render(ctx, destination, time) {
      RenderTone(ctx, destination, time, MidiToFrequency(62), 0.2, 0.24, "triangle", 2400);
      RenderTone(ctx, destination, time + 0.12, MidiToFrequency(66), 0.2, 0.23, "triangle", 2600);
      RenderTone(ctx, destination, time + 0.24, MidiToFrequency(69), 0.46, 0.25, "triangle", 3000);
      RenderMetallic(ctx, destination, time + 0.3, 1760, [1, 1.48], [0.55, 0.36], 0.14, 3);
    } },
  Bad: { duration: 1.1, gain: 0.52, minInterval: 0.25, maxVoices: 2,
    Render(ctx, destination, time) {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(322, time);
      osc.frequency.exponentialRampToValueAtTime(188, time + 0.38);
      osc.start(time);
      osc.stop(time + 0.8);
      const filter = CreateFilter(ctx, "lowpass", 900, 1.1);
      Chain([osc, filter, CreateSustainGain(ctx, time, 0.26, 0.02, 0.2, 0.42), destination]);
      const rumble = CreateNoiseSource(ctx, time, 0.7);
      const rumbleFilter = CreateFilter(ctx, "lowpass", 240, 0.8);
      Chain([rumble, rumbleFilter, CreateSustainGain(ctx, time, 0.16, 0.05, 0.2, 0.42), destination]);
    } },
});

/** 可播放的音效名清单，UI 可直接拿去做设置面板与调试页。 */
export const sfxNames = Object.freeze(Object.keys(sfxDefinitions));

// ---------------------------------------------------------------------------
// 无声哑对象与环境探测
// ---------------------------------------------------------------------------

const silentMethodNames = [
  "Play", "SetEra", "SetIntensity", "SetMuted", "SetVolume", "SetMusicVolume", "SetSfxVolume", "Update", "Dispose",
];

/** 不支持 WebAudio、被浏览器拒绝或初始化失败时返回它，接口与真实句柄完全一致。 */
function CreateSilentAudio(reason) {
  const silent = {
    reason: reason || "unavailable",
    Start() {
      return Promise.resolve(false);
    },
    IsReady() {
      return false;
    },
    GetState() {
      return { ready: false, muted: true, eraKey: null, intensity: 0, reason: reason || "unavailable" };
    },
  };
  for (const name of silentMethodNames) silent[name] = function NoOperation() {};
  return silent;
}

/** 取 AudioContext / OfflineAudioContext 构造器，带 webkit 前缀回退；取不到返回 null。 */
function ResolveContextClass(names) {
  try {
    const scope = typeof globalThis !== "undefined" ? globalThis : null;
    if (!scope) return null;
    for (const name of names) {
      if (typeof scope[name] === "function") return scope[name];
    }
  } catch (error) {
    return null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 主工厂
// ---------------------------------------------------------------------------

/**
 * 创建音频句柄。本函数不创建 AudioContext —— 必须在用户手势里调用返回对象的 Start()。
 * options = { seed, eraKey, volume, musicVolume, sfxVolume, muted, intensity, prerender, lookahead }
 */
export function CreateAudio(options = {}) {
  const settings = options && typeof options === "object" ? options : {};
  const ContextClass = ResolveContextClass(["AudioContext", "webkitAudioContext"]);
  if (!ContextClass) return CreateSilentAudio("no-webaudio");

  const seed = settings.seed === undefined ? 0x9e3779b9 : Number(settings.seed) >>> 0;
  const lookahead = Clamp(Number(settings.lookahead) || 0.65, 0.15, 2);
  const wantPrerender = settings.prerender !== false;
  const maxTotalVoices = 20;

  let ctx = null;
  let ready = false;
  let disposed = false;
  let masterGain = null;
  let musicGain = null;
  let musicFilter = null;
  let musicLfo = null;
  let musicLfoDepth = null;
  let musicSend = null;
  let sfxGain = null;
  let volume = Clamp01(settings.volume === undefined ? 0.8 : settings.volume);
  let musicVolume = Clamp01(settings.musicVolume === undefined ? 0.7 : settings.musicVolume);
  let sfxVolume = Clamp01(settings.sfxVolume === undefined ? 0.9 : settings.sfxVolume);
  let muted = Boolean(settings.muted);
  let intensity = Clamp01(settings.intensity === undefined ? 0.3 : settings.intensity);

  let eraKey = eraMusicProfiles[settings.eraKey] ? settings.eraKey : "Opening";
  let profile = eraMusicProfiles[eraKey];
  let pendingEraKey = null;

  // 生成式音乐的调度状态
  let nextStepTime = 0;
  let stepIndex = 0;
  let phraseIndex = 0;
  let phraseStep = 0;
  let phraseLength = 16;
  let phraseTranspose = 0;
  let phraseRegister = 0;
  let degreeCursor = 0;
  let restUntil = -1;
  let tempoDrift = 1;
  let phraseRng = CreateRng(seed);
  const buffers = Object.create(null);
  const lastPlayed = Object.create(null);
  const activeVoices = Object.create(null);
  const releaseTimers = [];
  let totalVoices = 0;

  function CurrentTime() {
    return ctx ? ctx.currentTime : 0;
  }

  function StepDuration() {
    return 60 / (profile.tempo * tempoDrift) / 2;
  }

  function ApplyGains(rampSeconds) {
    if (!ctx || !musicGain || !sfxGain) return;
    const now = CurrentTime();
    const ramp = Math.max(0.01, rampSeconds || 0.08);
    const targets = [
      [musicGain, muted ? 0 : volume * musicVolume],
      [sfxGain, muted ? 0 : volume * sfxVolume],
    ];
    Safe(function RampBuses() {
      for (const entry of targets) {
        entry[0].gain.cancelScheduledValues(now);
        entry[0].gain.setValueAtTime(entry[0].gain.value, now);
        entry[0].gain.linearRampToValueAtTime(entry[1], now + ramp);
      }
    });
  }

  function BuildGraph() {
    masterGain = ctx.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(ctx.destination);

    let reverb = ctx.createConvolver();
    const impulseOk = Safe(() => { reverb.buffer = CreateImpulseResponse(ctx, 2.2, 3.2); });
    if (!impulseOk) reverb = null;
    if (reverb) {
      const reverbReturn = ctx.createGain();
      reverbReturn.gain.value = 0.5;
      Chain([reverb, reverbReturn, masterGain]);
    }

    musicFilter = CreateFilter(ctx, "lowpass", profile.filterBase, 0.8);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0;
    Chain([musicFilter, musicGain, masterGain]);

    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0;
    sfxGain.connect(masterGain);

    if (reverb) {
      musicSend = ctx.createGain();
      musicSend.gain.value = profile.reverbSend;
      Chain([musicGain, musicSend, reverb]);
      const sfxSend = ctx.createGain();
      sfxSend.gain.value = 0.16;
      Chain([sfxGain, sfxSend, reverb]);
    }

    // 极低频 LFO 缓慢推动音乐滤波器，制造"呼吸"，避免织体听起来是死的
    musicLfo = ctx.createOscillator();
    musicLfo.type = "sine";
    musicLfo.frequency.value = profile.lfoRate;
    musicLfoDepth = ctx.createGain();
    musicLfoDepth.gain.value = profile.filterRange;
    Chain([musicLfo, musicLfoDepth, musicFilter.frequency]);
    musicLfo.start();
  }

  /** 每个乐句重新播一次种：长度、转位、八度、速度微偏移都在这里定，是不产生循环感的主要手段。 */
  function StartPhrase() {
    phraseRng = CreateRng((seed ^ HashText(eraKey)) + phraseIndex * 7919);
    phraseLength = profile.phraseLengths[Math.floor(phraseRng() * profile.phraseLengths.length)] || 16;
    phraseStep = 0;
    const transposeRoll = phraseRng();
    phraseTranspose = transposeRoll < 0.45 ? 0 : transposeRoll < 0.72 ? 2 : transposeRoll < 0.9 ? 3 : -2;
    phraseRegister = phraseRng() < 0.3 ? 1 : phraseRng() < 0.12 ? -1 : 0;
    tempoDrift = 0.96 + phraseRng() * 0.08;
    degreeCursor = Math.round((phraseRng() - 0.5) * 4);
    restUntil = -1;
    phraseIndex += 1;
  }

  /** 以级进为主的随机游走，并轻微拉回中心，听感接近民歌旋律。 */
  function NextDegree() {
    const roll = phraseRng();
    let move;
    if (roll < 0.34) move = 1;
    else if (roll < 0.62) move = -1;
    else if (roll < 0.76) move = 2;
    else if (roll < 0.87) move = -2;
    else if (roll < 0.95) move = 0;
    else move = phraseRng() < 0.5 ? 4 : -4;
    degreeCursor += move;
    if (degreeCursor > 7) degreeCursor -= 5;
    if (degreeCursor < -6) degreeCursor += 5;
    return degreeCursor;
  }

  /** 竹笛感主奏：两条微失谐三角波 + 颤音 + 气声噪声。 */
  function ScheduleFlute(time, midi, duration, level) {
    const frequency = MidiToFrequency(midi);
    const osc = CreateOscillator(ctx, "triangle", frequency, time, duration);
    const shade = CreateOscillator(ctx, "triangle", frequency, time, duration, 5);
    const vibrato = AttachLfo(ctx, osc.frequency, time, duration + 0.3, 4.8 + (midi % 5) * 0.2, frequency * 0.006);
    vibrato.gain.connect(shade.frequency);
    const tone = CreateFilter(ctx, "lowpass", frequency * 4.2, 1.1);
    osc.connect(tone);
    shade.connect(tone);
    Chain([tone, CreateSustainGain(ctx, time, level, 0.075, duration * 0.62, duration * 0.55 + 0.2), musicFilter]);
    const breath = CreateNoiseSource(ctx, time, duration + 0.1);
    const breathFilter = CreateFilter(ctx, "bandpass", frequency * 2.1, 3.2);
    Chain([breath, breathFilter, CreateSustainGain(ctx, time, level * 0.16, 0.06, duration * 0.5, 0.18), musicFilter]);
  }

  /** 拨弦式短音型：快起音的锯齿波经带通，加一点指甲触弦的高频噪声。 */
  function SchedulePluck(time, midi, level) {
    const frequency = MidiToFrequency(midi);
    const osc = CreateOscillator(ctx, "sawtooth", frequency, time, 0.6);
    const band = CreateFilter(ctx, "bandpass", frequency * 2.3, 4.5);
    Chain([osc, band, CreatePercussiveGain(ctx, time, level, 0.003, 0.42), musicFilter]);
    RenderNoiseBurst(ctx, musicFilter, time, "highpass", 2600, 0.8, level * 0.4, 0.001, 0.025);
  }

  function ScheduleDrone(time, midi, duration, level) {
    const frequency = MidiToFrequency(midi);
    const osc = CreateOscillator(ctx, "triangle", frequency, time, duration, -4);
    const pair = CreateOscillator(ctx, "sine", frequency, time, duration, 6);
    const low = CreateFilter(ctx, "lowpass", frequency * 3, 0.7);
    osc.connect(low);
    pair.connect(low);
    Chain([low, CreateSustainGain(ctx, time, level, duration * 0.28, duration * 0.35, duration * 0.5), musicFilter]);
  }

  function ScheduleBass(time, midi, duration, level) {
    const osc = CreateOscillator(ctx, "triangle", MidiToFrequency(midi), time, duration);
    const low = CreateFilter(ctx, "lowpass", 260, 0.9);
    Chain([osc, low, CreateSustainGain(ctx, time, level, 0.02, duration * 0.4, duration * 0.6), musicFilter]);
  }

  /** 软鼓：低通噪声 + 一下鼓皮的下滑正弦，用作恢复期与反攻期的劳作/推进律动。 */
  function ScheduleDrum(time, level) {
    RenderNoiseBurst(ctx, musicFilter, time, "lowpass", 420, 0.9, level, 0.003, 0.1);
    const skin = ctx.createOscillator();
    skin.type = "sine";
    skin.frequency.setValueAtTime(126, time);
    skin.frequency.exponentialRampToValueAtTime(62, time + 0.1);
    skin.start(time);
    skin.stop(time + 0.2);
    Chain([skin, CreatePercussiveGain(ctx, time, level * 1.2, 0.003, 0.12), musicFilter]);
  }

  function ScheduleStep(time) {
    const gains = profile.voiceGain;
    const intensityScale = 0.75 + intensity * 0.5;
    const stepSeconds = StepDuration();

    if (phraseStep === 0) {
      // 乐句开头铺一条持续低音，作为整段的调性支点
      const droneMidi = ScaleMidi(profile.mode, profile.rootMidi, 0) + profile.droneOctave * 12;
      ScheduleDrone(time, droneMidi, stepSeconds * phraseLength * 0.9, gains.drone);
      if (profile.dissonance > 0 && phraseRng() < profile.dissonance) {
        // 困难期的小二度：只叠在低音上，很轻，但足以让整段发闷
        ScheduleDrone(time + stepSeconds, droneMidi + 1, stepSeconds * phraseLength * 0.6, gains.drone * 0.55);
      }
    }

    if (stepIndex <= restUntil) return;
    if (phraseRng() < profile.restBias * (1.25 - intensity * 0.5)) {
      restUntil = stepIndex + PickRange(profile.restLength, phraseRng());
      return;
    }

    if (phraseRng() < profile.leadDensity * intensityScale) {
      const degree = NextDegree() + phraseTranspose;
      const midi = ScaleMidi(profile.mode, profile.rootMidi, degree) + (profile.leadOctave + phraseRegister) * 12;
      const length = PickRange(profile.leadLength, phraseRng()) * stepSeconds;
      ScheduleFlute(time, midi, length, gains.lead * (0.85 + phraseRng() * 0.3));
    }

    if (gains.pluck > 0 && phraseRng() < profile.pluckDensity * intensityScale) {
      const degree = (degreeCursor + (phraseRng() < 0.5 ? 0 : 2)) % 5;
      const midi = ScaleMidi(profile.mode, profile.rootMidi, degree) + (profile.leadOctave + 1) * 12;
      SchedulePluck(time, midi, gains.pluck * (0.8 + phraseRng() * 0.4));
    }

    if (gains.bass > 0 && phraseStep % 4 === 0 && phraseRng() < profile.bassDensity + intensity * 0.25) {
      const midi = ScaleMidi(profile.mode, profile.rootMidi, phraseRng() < 0.6 ? 0 : 3) - 12;
      ScheduleBass(time, midi, stepSeconds * 3, gains.bass);
    }

    if (gains.drum > 0 && profile.pulseDivisor > 0 && stepIndex % profile.pulseDivisor === 0) {
      const accent = stepIndex % (profile.pulseDivisor * 4) === 0 ? 1.25 : 0.8;
      ScheduleDrum(time, gains.drum * accent * (0.7 + intensity * 0.6));
    }
  }

  /** 换调式发生在乐句边界，避免把正在响的乐句切断。 */
  function ApplyPendingEra() {
    const nextKey = pendingEraKey;
    pendingEraKey = null;
    if (!nextKey || !eraMusicProfiles[nextKey]) return;
    eraKey = nextKey;
    profile = eraMusicProfiles[eraKey];
    phraseIndex = 0;
    StartPhrase();
    if (!ctx) return;
    const now = CurrentTime();
    const ramp = 2.6;
    Safe(function CrossfadeEra() {
      musicFilter.frequency.cancelScheduledValues(now);
      musicFilter.frequency.setValueAtTime(musicFilter.frequency.value, now);
      musicFilter.frequency.linearRampToValueAtTime(profile.filterBase + intensity * 700, now + ramp);
      musicLfo.frequency.setValueAtTime(profile.lfoRate, now);
      musicLfoDepth.gain.linearRampToValueAtTime(profile.filterRange, now + ramp);
      if (musicSend) musicSend.gain.linearRampToValueAtTime(profile.reverbSend, now + ramp);
    });
  }

  /** 前瞻调度：一次性把未来 lookahead 秒内的音符全部排进 WebAudio 的时钟。 */
  function AdvanceScheduler() {
    const horizon = CurrentTime() + lookahead;
    let guard = 0;
    while (nextStepTime < horizon && guard < 96) {
      guard += 1;
      if (phraseStep >= phraseLength) StartPhrase();
      const at = nextStepTime;
      Safe(() => { ScheduleStep(at); });
      nextStepTime += StepDuration();
      stepIndex += 1;
      phraseStep += 1;
      if (pendingEraKey && phraseStep >= phraseLength) ApplyPendingEra();
    }
  }

  function ReleaseVoice(name, bus) {
    if (!bus || bus.releasedByHandle) return;
    bus.releasedByHandle = true;
    totalVoices = Math.max(0, totalVoices - 1);
    activeVoices[name] = Math.max(0, (activeVoices[name] || 1) - 1);
    Safe(() => { bus.disconnect(); });
  }

  function ReleaseVoiceLater(name, bus, milliseconds) {
    if (typeof setTimeout !== "function") return;
    const timer = setTimeout(function HandleTimeout() {
      ReleaseVoice(name, bus);
      const at = releaseTimers.indexOf(timer);
      if (at >= 0) releaseTimers.splice(at, 1);
    }, Math.max(40, milliseconds));
    releaseTimers.push(timer);
  }

  function TakeVoice(name, level) {
    const bus = ctx.createGain();
    bus.gain.value = level;
    bus.connect(sfxGain);
    totalVoices += 1;
    activeVoices[name] = (activeVoices[name] || 0) + 1;
    return bus;
  }

  function PlayBuffer(name, params) {
    const definition = sfxDefinitions[name];
    const rate = Clamp(Number(params.rate) || 1, 0.5, 2);
    const bus = TakeVoice(name, definition.gain * Clamp01(params.gain === undefined ? 1 : params.gain));
    const source = ctx.createBufferSource();
    source.buffer = buffers[name];
    source.playbackRate.value = rate;
    source.connect(bus);
    source.start(CurrentTime() + 0.004);
    source.onended = function HandleEnded() {
      ReleaseVoice(name, bus);
    };
    ReleaseVoiceLater(name, bus, (definition.duration / rate) * 1000 + 600);
  }

  function RenderRealtime(name, params) {
    const definition = sfxDefinitions[name];
    const bus = TakeVoice(name, definition.gain * Clamp01(params.gain === undefined ? 1 : params.gain));
    definition.Render(ctx, bus, CurrentTime() + 0.005, params);
    ReleaseVoiceLater(name, bus, (definition.duration + 0.3) * 1000);
  }

  /** 用 OfflineAudioContext 把重复播放的音效预渲染成 AudioBuffer；单个失败只影响它自己。 */
  async function PrerenderAll() {
    const OfflineClass = ResolveContextClass(["OfflineAudioContext", "webkitOfflineAudioContext"]);
    if (!OfflineClass || !wantPrerender) return;
    const sampleRate = ctx.sampleRate || 44100;
    for (const name of sfxNames) {
      const definition = sfxDefinitions[name];
      try {
        const frames = Math.max(64, Math.ceil(sampleRate * (definition.duration + 0.12)));
        const offline = new OfflineClass(1, frames, sampleRate);
        definition.Render(offline, offline.destination, 0, {});
        // eslint-disable-next-line no-await-in-loop
        const rendered = await offline.startRendering();
        if (!disposed) buffers[name] = rendered;
      } catch (error) {
        delete buffers[name];
      }
    }
  }

  return {
    /** 必须在用户手势里调用。返回 Promise<boolean>，永不 reject。 */
    async Start() {
      if (disposed) return false;
      if (ready) {
        if (ctx.state === "suspended") await ctx.resume().catch(function Ignore() {});
        return ctx.state === "running";
      }
      const opened = Safe(() => { ctx = new ContextClass({ latencyHint: "interactive" }); });
      if (!opened) {
        Safe(() => { ctx = new ContextClass(); });
      }
      if (!ctx) return false;
      try {
        if (ctx.state === "suspended") await ctx.resume();
        BuildGraph();
        StartPhrase();
        nextStepTime = CurrentTime() + 0.12;
        stepIndex = 0;
        ready = true;
        ApplyGains(1.5);
        await PrerenderAll();
        return true;
      } catch (error) {
        Safe(() => { ctx.close(); });
        ctx = null;
        ready = false;
        return false;
      }
    },

    /** 播放音效。params = { gain, rate }。名字不存在、未就绪、静音或被节流时静默返回。 */
    Play(name, params = {}) {
      if (!ready || disposed || muted || !ctx) return;
      const definition = sfxDefinitions[name];
      if (!definition) return;
      const now = CurrentTime();
      // 注意不能写 lastPlayed[name] || -999：currentTime 恰好为 0 时会被当成未播放过
      const last = lastPlayed[name] === undefined ? -999 : lastPlayed[name];
      if (now - last < definition.minInterval) return;
      if ((activeVoices[name] || 0) >= definition.maxVoices) return;
      if (totalVoices >= maxTotalVoices) return;
      lastPlayed[name] = now;
      const resolved = params && typeof params === "object" ? params : {};
      Safe(function PlayOne() {
        if (buffers[name]) PlayBuffer(name, resolved);
        else RenderRealtime(name, resolved);
      });
    },

    /** 切换时期。为不切断当前乐句，实际换调式发生在下一个乐句开头。 */
    SetEra(nextEraKey) {
      if (disposed || !eraMusicProfiles[nextEraKey] || nextEraKey === eraKey) return;
      if (!ready) {
        eraKey = nextEraKey;
        profile = eraMusicProfiles[eraKey];
        return;
      }
      pendingEraKey = nextEraKey;
    },

    /** 0..1，越高织体越密、滤波越开。战斗、扫荡、反攻时抬高。 */
    SetIntensity(value) {
      if (disposed) return;
      intensity = Clamp01(value);
      if (!ready || !ctx) return;
      const now = CurrentTime();
      Safe(function RampFilter() {
        musicFilter.frequency.cancelScheduledValues(now);
        musicFilter.frequency.setValueAtTime(musicFilter.frequency.value, now);
        musicFilter.frequency.linearRampToValueAtTime(profile.filterBase + intensity * 700, now + 1.2);
      });
    },

    SetMuted(value) {
      if (disposed) return;
      muted = Boolean(value);
      ApplyGains(0.25);
    },

    SetVolume(value) {
      if (disposed) return;
      volume = Clamp01(value);
      ApplyGains(0.12);
    },

    SetMusicVolume(value) {
      if (disposed) return;
      musicVolume = Clamp01(value);
      ApplyGains(0.12);
    },

    SetSfxVolume(value) {
      if (disposed) return;
      sfxVolume = Clamp01(value);
      ApplyGains(0.12);
    },

    /** 每帧调用，推进生成式音乐的前瞻调度。dt 单位为秒。 */
    Update(dt) {
      if (!ready || disposed || !ctx) return;
      if (typeof dt === "number" && dt > 1.5) {
        // 长时间掉帧或标签页切回来：把调度指针拉回当前时间，避免一次性倾泻大量音符
        nextStepTime = Math.max(nextStepTime, CurrentTime() + 0.05);
      }
      Safe(AdvanceScheduler);
    },

    IsReady() {
      return Boolean(ready && ctx && ctx.state === "running");
    },

    GetState() {
      return {
        ready: Boolean(ready), muted, eraKey, pendingEraKey, intensity,
        volume, musicVolume, sfxVolume,
        prerendered: Object.keys(buffers).length,
        contextState: ctx ? ctx.state : "none",
      };
    },

    Dispose() {
      if (disposed) return;
      disposed = true;
      ready = false;
      for (const timer of releaseTimers.splice(0)) {
        Safe(() => { clearTimeout(timer); });
      }
      Safe(() => { musicLfo.stop(); });
      for (const name of Object.keys(buffers)) delete buffers[name];
      Safe(() => { ctx.close(); });
      ctx = null;
      masterGain = null;
      musicGain = null;
      musicFilter = null;
      musicSend = null;
      sfxGain = null;
    },
  };
}
