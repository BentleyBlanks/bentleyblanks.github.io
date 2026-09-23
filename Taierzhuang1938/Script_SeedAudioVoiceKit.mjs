// 第一关逐句干声管线的公用件（只在 node 里跑，不进浏览器、不进 import map）。
//
//   · SeedAudioSpeak    调 Volcengine seed-audio-1.0：带定妆参考音、要逐字时间戳、429/5xx 退避重试
//   · DecodePcm / MeasureVoice   客观量：首尾静音、有声段 RMS、底噪与信噪比、真峰值、<500 Hz 能量占比、F0 分布
//   · MasterLine        去首尾静音（留 pad）→ 按 projection 档把有声段 RMS 拉到目标 → 真峰值 ≤ −1 dBTP → mp3
//   · SpeakerEmbed      调 Script_FirstLevelVoiceSpeaker.py 求音色向量；CenteredCosine 比「是不是同一个嗓子」
//
// 实测过的接口口径（2026-09-23，见 docs/Data_FirstLevelVoiceSync20260919.md「逐句干声管线」一节）：
//   · references: [{ audio_data: <base64> }]，最多 3 条、每条 ≤ 30 s；服务端先「注册音色」再合成，
//     base64 坏了回 400 [45001001]，空音频回 500 [55001307]。提示词里用 @音频1…@音频3 指代。
//   · audio_config.enable_subtitle: true 时响应带 subtitle.sentences[].words[]（毫秒，约 40 ms 粒度），
//     假名也逐字给；放在顶层不生效。
//   · 同一提示词多次请求结果不同（没有固定种子），多 take 选优直接重复请求即可。
// 密钥只从 VOLCENGINE_API_KEY 读；任何日志和异常都先把它替换成 [redacted]。
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const SEED_AUDIO_MODEL = "seed-audio-1.0";
const endpoint = "https://openspeech.bytedance.com/api/v3/tts/create";
const here = path.dirname(fileURLToPath(import.meta.url));
const ffmpeg = process.env.FFMPEG || "ffmpeg";
export const requestStats = { requests: 0, retries: 0, failures: 0 };

class Retryable extends Error {}
const Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const Redact = (text, key) => String(text ?? "").replaceAll(key || "\u0000", "[redacted]");

/** 参考音统一转成 24 kHz 单声道 16 位 wav 再 base64（≤ 30 s）。 */
export function ReferencePayload(file) {
  const result = spawnSync(ffmpeg, ["-v", "error", "-i", file, "-t", "29.5", "-ac", "1", "-ar", "24000",
    "-c:a", "pcm_s16le", "-f", "wav", "-"], { maxBuffer: 1 << 26, windowsHide: true });
  if (result.status !== 0 || result.stdout.length < 4096) throw new Error(`Unable to read reference ${path.basename(file)}`);
  return result.stdout.toString("base64");
}

/**
 * 一次合成。返回 { bytes, subtitle, seconds }。references 是文件路径数组（最多 3 条）。
 * 429 / 5xx / 超时 / 网络错误退避重试；4xx 直接抛。
 */
export async function SeedAudioSpeak({ prompt, references = [], subtitle = true, speechRate = 0, label = "take",
  attempts = 4, backoffMs = [5000, 15000, 40000] }) {
  const apiKey = process.env.VOLCENGINE_API_KEY;
  if (!apiKey) throw new Error("VOLCENGINE_API_KEY is required in the environment; do not store credentials in files");
  if (references.length > 3) throw new Error("seed-audio-1.0 takes at most three references");
  const body = JSON.stringify({
    model: SEED_AUDIO_MODEL,
    text_prompt: prompt,
    ...(references.length ? { references: references.map((file) => ({ audio_data: ReferencePayload(file) })) } : {}),
    audio_config: { format: "mp3", sample_rate: 44100, pitch_rate: 0, speech_rate: speechRate, loudness_rate: 0,
      enable_subtitle: !!subtitle },
    watermark: {},
  });
  for (let attempt = 1; ; attempt++) {
    requestStats.requests++;
    try {
      return await Once(body, apiKey, label);
    } catch (error) {
      if (!(error instanceof Retryable) || attempt >= attempts) { requestStats.failures++; throw error; }
      requestStats.retries++;
      const wait = backoffMs[Math.min(attempt - 1, backoffMs.length - 1)];
      console.log(`${label}: ${error.message} — retry ${attempt}/${attempts - 1} in ${Math.round(wait / 1000)}s`);
      await Sleep(wait);
    }
  }
}
async function Once(body, apiKey, label) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 240000);
  try {
    let response;
    try {
      response = await fetch(endpoint, { method: "POST", signal: controller.signal, body,
        headers: { "Content-Type": "application/json", "X-Api-Key": apiKey, "X-Api-Request-Id": crypto.randomUUID() } });
    } catch (error) {
      throw new Retryable(Redact(error.message || "network failure", apiKey).slice(0, 200));
    }
    if (!response.ok) {
      const failure = await response.json().catch(() => ({}));
      const code = Redact(failure.code ?? "", apiKey).slice(0, 40);
      const detail = Redact(failure.message ?? "", apiKey).slice(0, 240);
      const summary = `Seed Audio HTTP ${response.status}${code ? " [" + code + "]" : ""}${detail ? ": " + detail : ""}`;
      throw (response.status === 429 || response.status >= 500) ? new Retryable(summary) : new Error(summary);
    }
    const payload = await response.json();
    if (typeof payload.audio !== "string") throw new Retryable(`Seed Audio returned no audio for ${label}`);
    const bytes = Buffer.from(payload.audio, "base64");
    if (bytes.length < 1024) throw new Retryable(`Seed Audio returned an empty take for ${label}`);
    return { bytes, subtitle: payload.subtitle || null, seconds: payload.duration };
  } finally {
    clearTimeout(timer);
  }
}

/** 解码成单声道 float32。 */
export function DecodePcm(file, sampleRate = 16000) {
  const result = spawnSync(ffmpeg, ["-v", "error", "-i", file, "-ac", "1", "-ar", String(sampleRate), "-f", "f32le", "-"],
    { maxBuffer: 1 << 28, windowsHide: true });
  if (result.status !== 0) throw new Error(`Unable to decode ${path.basename(file)}`);
  const b = result.stdout;
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
}
const Db = (x) => 20 * Math.log10(Math.max(x, 1e-9));

/** 真峰值：4 倍过采样后的最大绝对值（dBTP 近似）。 */
export function TruePeakDb(file) {
  const pcm = DecodePcm(file, 176400);
  let peak = 0;
  for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
  return Db(peak);
}

// 低频能量占比：两级一阶 IIR 低通（500 Hz）近似分带，只数有声帧。
function LowShare(pcm, sr, mask, hop) {
  const a = Math.exp(-2 * Math.PI * 500 / sr);
  let low1 = 0, low2 = 0, lowE = 0, allE = 0;
  for (let i = 0; i < pcm.length; i++) {
    low1 = (1 - a) * pcm[i] + a * low1;
    low2 = (1 - a) * low1 + a * low2;
    if (mask[Math.floor(i / hop)]) { lowE += low2 * low2; allE += pcm[i] * pcm[i]; }
  }
  return allE > 0 ? lowE / allE : 0;
}

function PitchOf(pcm, start, sr, win) {
  // NCCF 求基频，70–500 Hz。
  const minLag = Math.floor(sr / 500), maxLag = Math.ceil(sr / 70);
  let best = 0, lag = 0;
  for (let L = minLag; L <= maxLag; L++) {
    let num = 0, d1 = 0, d2 = 0;
    for (let i = 0; i < win - L; i++) {
      const x = pcm[start + i], y = pcm[start + i + L];
      num += x * y; d1 += x * x; d2 += y * y;
    }
    const c = num / Math.sqrt(d1 * d2 + 1e-12);
    if (c > best) { best = c; lag = L; }
  }
  return best >= 0.7 ? sr / lag : 0;
}

const Quantile = (values, q) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];
};

/**
 * 客观量一条干声（16 kHz 解码）。帧长 20 ms。
 * 有声帧 = 比最响帧低不超过 30 dB 且高于绝对底 −60 dBFS。
 */
export function MeasureVoice(file) {
  const sr = 16000, hop = 320, pcm = DecodePcm(file, sr);
  const frames = [];
  for (let s = 0; s + hop <= pcm.length; s += hop) {
    let e = 0;
    for (let i = s; i < s + hop; i++) e += pcm[i] * pcm[i];
    frames.push(Math.sqrt(e / hop));
  }
  const loud = Math.max(...frames, 1e-9);
  const gate = Math.max(loud * 10 ** (-30 / 20), 10 ** (-60 / 20));
  const mask = frames.map((v) => v >= gate);
  const first = mask.indexOf(true), last = mask.lastIndexOf(true);
  const seconds = pcm.length / sr;
  const active = frames.filter((_, i) => mask[i]);
  const quiet = frames.filter((_, i) => !mask[i] && i > 2 && i < frames.length - 3);
  const activeRms = Math.sqrt(active.reduce((t, v) => t + v * v, 0) / Math.max(1, active.length));
  const noise = quiet.length >= 5 ? Quantile(quiet, 0.5) : Quantile(frames, 0.05);
  const pitches = [];
  for (let i = 0; i < frames.length; i++) {
    if (!mask[i] || frames[i] < loud * 0.1) continue;
    const start = i * hop;
    if (start + 640 > pcm.length) break;
    const f0 = PitchOf(pcm, start, sr, 640);
    if (f0) pitches.push(f0);
  }
  let peak = 0;
  for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
  return {
    seconds: +seconds.toFixed(3),
    leadS: first < 0 ? seconds : +(first * hop / sr).toFixed(3),
    tailS: last < 0 ? seconds : +(seconds - (last + 1) * hop / sr).toFixed(3),
    voicedS: +(active.length * hop / sr).toFixed(3),
    activeRmsDb: +Db(activeRms).toFixed(2),
    noiseDb: +Db(noise).toFixed(2),
    snrDb: +(Db(activeRms) - Db(noise)).toFixed(2),
    peakDb: +Db(peak).toFixed(2),
    lowShare: +LowShare(pcm, sr, mask, hop).toFixed(3),
    f0: { median: Math.round(Quantile(pitches, 0.5)), p10: Math.round(Quantile(pitches, 0.1)),
      p90: Math.round(Quantile(pitches, 0.9)), frames: pitches.length },
  };
}

/**
 * 母带：去首尾静音（各留 padS）→ 有声段 RMS 拉到 targetDb → 真峰值限到 ceilingDb → 单声道 mp3。
 * 返回 { trimStartS, gainDb, measure }。trimStartS 用来把 API 的逐字时间戳平移到成品上。
 */
export function MasterLine(raw, output, { targetDb, padS = 0.06, ceilingDb = -1, bitrate = "96k" }) {
  const before = MeasureVoice(raw);
  const start = Math.max(0, before.leadS - padS);
  const end = Math.min(before.seconds, before.seconds - before.tailS + padS);
  const gainDb = targetDb - before.activeRmsDb;
  const wav = output + ".tmp.wav", temp = output + ".tmp.mp3";
  // 先滤到 wav 再编 mp3：一步直出 mp3 时实测真峰值会冒到 0 dBTP 以上（同一条链先出 wav 是 −2.5）。
  // alimiter 的 limit 是线性幅度、level=false 关掉自动电平；真峰值再留 0.5 dB 余量。
  // 编码后仍超 ceilingDb（很少见）就按超出量整体再降一次，最多三轮。
  let trim = 0, measure = null;
  for (let round = 0; round < 3; round++) {
    const limit = 10 ** ((ceilingDb - 0.5) / 20);
    // alimiter 在流尾会把前瞻缓冲里没处理的几毫秒原样吐出来（实测峰值就落在最后 50 ms），
    // 所以先补 0.1 s 静音、开延迟补偿，限完再按原长剪回，淡入淡出放在最后。
    const length = end - start;
    const filter = [
      `atrim=start=${start.toFixed(3)}:end=${end.toFixed(3)}`, "asetpts=PTS-STARTPTS",
      `volume=${(gainDb + trim).toFixed(2)}dB`, "apad=pad_dur=0.1",
      `alimiter=limit=${limit.toFixed(4)}:attack=1:release=40:level=false:latency=true`,
      `atrim=duration=${length.toFixed(4)}`, "asetpts=PTS-STARTPTS",
      "afade=t=in:d=0.012", "areverse,afade=t=in:d=0.03,areverse",
    ].join(",");
    const rendered = spawnSync(ffmpeg, ["-y", "-v", "error", "-i", raw, "-map_metadata", "-1", "-af", filter,
      "-ac", "1", "-ar", "44100", "-c:a", "pcm_f32le", wav], { encoding: "utf8", windowsHide: true });
    if (rendered.status !== 0) throw new Error(`Unable to master ${path.basename(output)}: ${rendered.stderr?.slice(0, 200)}`);
    const encoded = spawnSync(ffmpeg, ["-y", "-v", "error", "-i", wav, "-map_metadata", "-1", "-ac", "1", "-ar", "44100",
      "-b:a", bitrate, temp], { encoding: "utf8", windowsHide: true });
    if (encoded.status !== 0) throw new Error(`Unable to encode ${path.basename(output)}: ${encoded.stderr?.slice(0, 200)}`);
    const tp = TruePeakDb(temp);
    if (tp <= ceilingDb) break;
    trim -= tp - ceilingDb + 0.2;
  }
  fs.rmSync(wav, { force: true });
  fs.renameSync(temp, output);
  measure = MeasureVoice(output);
  measure.truePeakDb = +TruePeakDb(output).toFixed(2);
  return { trimStartS: +start.toFixed(3), gainDb: +(gainDb + trim).toFixed(2), measure };
}

export const Sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

// ============================================================================
// 整段一次生成 → 切句（2026-09-23 用户口径：同一段对白一次生成，保证同一个声学环境）
// ============================================================================

/**
 * 整段母带：去首尾静音（各留 padS）→ 整段有声段 RMS 拉到 targetDb（整段只拉这一次）→ 限幅（真峰值留
 * 0.5 dB 余量）→ 44.1 kHz 单声道 f32 wav。切句从这条 wav 上切，整段 mp3 也从它编，电平关系一丝不动。
 * extraDb：切出来的某句编码后真峰值超了时，整段再统一降这么多重做（不单独动某一句）。
 */
export function MasterSceneWav(raw, wav, { targetDb, padS = 0.08, ceilingDb = -1, extraDb = 0 }) {
  const before = MeasureVoice(raw);
  const start = Math.max(0, before.leadS - padS);
  const end = Math.min(before.seconds, before.seconds - before.tailS + padS);
  const gainDb = targetDb - before.activeRmsDb + extraDb;
  const limit = 10 ** ((ceilingDb - 0.5) / 20);
  const length = end - start;
  const filter = [
    `atrim=start=${start.toFixed(3)}:end=${end.toFixed(3)}`, "asetpts=PTS-STARTPTS",
    `volume=${gainDb.toFixed(2)}dB`, "apad=pad_dur=0.1",
    `alimiter=limit=${limit.toFixed(4)}:attack=1:release=40:level=false:latency=true`,
    `atrim=duration=${length.toFixed(4)}`, "asetpts=PTS-STARTPTS",
  ].join(",");
  const rendered = spawnSync(ffmpeg, ["-y", "-v", "error", "-i", raw, "-map_metadata", "-1", "-af", filter,
    "-ac", "1", "-ar", "44100", "-c:a", "pcm_f32le", wav], { encoding: "utf8", windowsHide: true });
  if (rendered.status !== 0) throw new Error(`Unable to master scene ${path.basename(wav)}: ${rendered.stderr?.slice(0, 200)}`);
  return { trimStartS: +start.toFixed(3), gainDb: +gainDb.toFixed(2), seconds: +length.toFixed(3), rawMeasure: before };
}

/** 从 wav 的 [startS, endS] 编一段 mp3（两端各 fadeS 淡入淡出；整段就传 0 与全长）。 */
export function EncodeSegment(wav, output, { startS = 0, endS = null, fadeS = 0.01, bitrate = "96k" } = {}) {
  const parts = [];
  if (startS > 0 || endS != null) parts.push(`atrim=start=${startS.toFixed(4)}${endS != null ? `:end=${endS.toFixed(4)}` : ""}`, "asetpts=PTS-STARTPTS");
  if (fadeS > 0) parts.push(`afade=t=in:d=${fadeS}`, "areverse", `afade=t=in:d=${fadeS}`, "areverse");
  const temp = output + ".tmp.mp3";
  const args = ["-y", "-v", "error", "-i", wav, "-map_metadata", "-1", ...(parts.length ? ["-af", parts.join(",")] : []),
    "-ac", "1", "-ar", "44100", "-b:a", bitrate, temp];
  const encoded = spawnSync(ffmpeg, args, { encoding: "utf8", windowsHide: true });
  if (encoded.status !== 0) throw new Error(`Unable to encode ${path.basename(output)}: ${encoded.stderr?.slice(0, 200)}`);
  fs.renameSync(temp, output);
  return output;
}

/** 10 ms 一帧的 RMS（16 kHz 解码）。 */
export function FrameRms(file, hopS = 0.01) {
  const sr = 16000, hop = Math.round(sr * hopS), pcm = DecodePcm(file, sr);
  const frames = new Float32Array(Math.floor(pcm.length / hop));
  for (let f = 0; f < frames.length; f++) {
    let e = 0;
    for (let i = f * hop; i < (f + 1) * hop; i++) e += pcm[i] * pcm[i];
    frames[f] = Math.sqrt(e / hop);
  }
  return { hopS, frames, seconds: pcm.length / sr };
}

/** 原始 take 里满幅（|x| ≥ 0.999）连续 ≥ 3 个采样的段数 —— 真削波，不是单个峰值碰顶。 */
export function ClipRuns(file) {
  const pcm = DecodePcm(file, 44100);
  let runs = 0, run = 0;
  for (let i = 0; i < pcm.length; i++) {
    if (Math.abs(pcm[i]) >= 0.999) { run++; if (run === 3) runs++; } else run = 0;
  }
  return runs;
}

const FoldKana = (c) => {
  const code = c.codePointAt(0);
  return code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : c.toLowerCase();
};
const CharsOf = (text) => [...String(text)].filter((c) => /[\p{L}\p{N}]/u.test(c)).map(FoldKana);

/**
 * 把 SeedAudio 的逐字时间戳（subtitle.sentences[].words[]，毫秒）对到稿里的逐句上。
 * 编辑距离对齐：稿面字（带句号）对字幕字；替换也算对上（同音字），多出来的字归到它前一个对上的字那一句。
 * 返回每句 { start, end, chars:[[c,s,e]], matched, total, coverage }（秒，原始 take 时间轴）。
 */
export function MapSubtitleToLines(spokenLines, subtitle) {
  const T = [];
  for (const w of (subtitle?.sentences || []).flatMap((s) => s.words || [])) {
    const chars = CharsOf(w.text);
    if (!chars.length) continue;
    const s = w.start_time / 1000, e = w.end_time / 1000, step = (e - s) / chars.length;
    chars.forEach((c, k) => T.push({ c, s: s + k * step, e: s + (k + 1) * step }));
  }
  const S = spokenLines.flatMap((text, line) => CharsOf(text).map((c) => ({ c, line })));
  const n = S.length, m = T.length;
  const D = Array.from({ length: n + 1 }, (_, i) => { const row = new Int32Array(m + 1); row[0] = i; return row; });
  for (let j = 0; j <= m; j++) D[0][j] = j;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    D[i][j] = Math.min(D[i - 1][j] + 1, D[i][j - 1] + 1, D[i - 1][j - 1] + (S[i - 1].c === T[j - 1].c ? 0 : 1));
  }
  const owner = new Array(m).fill(-1), exact = new Array(m).fill(false);
  for (let i = n, j = m; i > 0 || j > 0;) {
    if (i > 0 && j > 0 && D[i][j] === D[i - 1][j - 1] + (S[i - 1].c === T[j - 1].c ? 0 : 1)) {
      owner[j - 1] = S[i - 1].line; exact[j - 1] = S[i - 1].c === T[j - 1].c; i--; j--;
    } else if (j > 0 && D[i][j] === D[i][j - 1] + 1) { j--; }
    else i--;
  }
  // 多出来的字：归前一个有主的字；开头就多出来的归后一个。
  for (let j = 0; j < m; j++) if (owner[j] < 0 && j > 0) owner[j] = owner[j - 1];
  for (let j = m - 1; j >= 0; j--) if (owner[j] < 0 && j + 1 < m) owner[j] = owner[j + 1];
  return spokenLines.map((text, line) => {
    const mine = T.map((t, j) => ({ ...t, j })).filter((t) => owner[t.j] === line);
    const total = CharsOf(text).length, matched = mine.filter((t) => exact[t.j]).length;
    return {
      start: mine.length ? Math.min(...mine.map((t) => t.s)) : null,
      end: mine.length ? Math.max(...mine.map((t) => t.e)) : null,
      chars: mine.map((t) => [t.c, +t.s.toFixed(3), +t.e.toFixed(3)]),
      matched, total, coverage: total ? +(matched / total).toFixed(3) : 1,
    };
  });
}

/**
 * 在整段母带上定切点。lines[i] = { start, end, effortBefore, effortAfter }（母带时间轴，秒）。
 * 两句之间：先找静音段（比整段有声 RMS 低 silenceDb 以上、至少 20 ms）——句前有非台词人声（笑、喘）的
 * 切在最早那段静音、句后有的切在最晚那段、否则切在最长那段的正中；找不到静音就切在能量最低那一帧（tight）。
 * 再把每句两头多余的静音剪掉，只留 padS。返回 [{ startS, endS, gapBeforeS, tightStart, tightEnd, edgeDb:[a,b] }]。
 */
export function SliceScene(framesInfo, lines, { activeRmsDb, silenceDb = 30, padS = 0.06 }) {
  const { hopS, frames, seconds } = framesInfo;
  const quiet = 10 ** ((activeRmsDb - silenceDb) / 20);
  const F = (t) => Math.max(0, Math.min(frames.length - 1, Math.round(t / hopS)));
  const cuts = [];
  for (let i = 0; i + 1 < lines.length; i++) {
    const a = lines[i], b = lines[i + 1];
    const lo = F(Math.min(a.end, b.start) - 0.04), hi = F(Math.max(a.end, b.start) + 0.04);
    const runs = [];
    for (let f = lo; f <= hi; f++) {
      if (frames[f] >= quiet) continue;
      const from = f;
      while (f + 1 <= hi && frames[f + 1] < quiet) f++;
      if (f - from + 1 >= 2) runs.push([from, f]);
    }
    let cut, tight = false;
    if (runs.length) {
      const run = b.effortBefore ? runs[0] : a.effortAfter ? runs.at(-1)
        : runs.reduce((best, r) => (r[1] - r[0]) > (best[1] - best[0]) ? r : best);
      cut = (run[0] + run[1] + 1) / 2 * hopS;
    } else {
      let min = lo;
      for (let f = lo; f <= hi; f++) if (frames[f] < frames[min]) min = f;
      cut = (min + 0.5) * hopS; tight = true;
    }
    cuts.push({ at: cut, tight });
  }
  const loud = (f) => frames[f] >= quiet;
  const slices = lines.map((_, i) => {
    let s = i ? cuts[i - 1].at : 0, e = i < cuts.length ? cuts[i].at : seconds;
    const tightStart = i ? cuts[i - 1].tight : false, tightEnd = i < cuts.length ? cuts[i].tight : false;
    if (!tightStart) { let f = F(s); while (f < F(e) && !loud(f)) f++; s = Math.max(s, f * hopS - padS); }
    if (!tightEnd) { let f = F(e) - 1; while (f > F(s) && !loud(f)) f--; e = Math.min(e, (f + 1) * hopS + padS); }
    const edge = (t0, t1) => {
      let peak = 0;
      for (let f = F(t0); f <= F(t1); f++) peak = Math.max(peak, frames[f]);
      return +(Db(peak) - activeRmsDb).toFixed(1);
    };
    return { startS: +s.toFixed(3), endS: +e.toFixed(3), tightStart, tightEnd,
      edgeDb: [edge(s, s + 0.02), edge(e - 0.02, e)] };
  });
  slices.forEach((sl, i) => { sl.gapBeforeS = i ? +(sl.startS - slices[i - 1].endS).toFixed(3) : 0; });
  return slices;
}

/**
 * 音色向量（py3.10 + 本机 Qwen3-TTS 说话人编码器）。拿不到返回 null，调用方退回别的指标。
 */
export function SpeakerEmbed(files) {
  if (!files.length) return {};
  const list = path.join(process.env.TEMP || process.env.TMPDIR || here, `voice_embed_${process.pid}_${Date.now()}.txt`);
  const out = list.replace(/\.txt$/, ".json");
  fs.writeFileSync(list, files.map((f) => path.resolve(f)).join("\n"));
  const py = process.env.VOICE_EMBED_PY || "py";
  const args = process.env.VOICE_EMBED_PY ? [] : ["-3.10"];
  const result = spawnSync(py, [...args, path.join(here, "Script_FirstLevelVoiceSpeaker.py"), "--list", list, "--json", out],
    { encoding: "utf8", windowsHide: true, maxBuffer: 1 << 26 });
  fs.rmSync(list, { force: true });
  if (result.status !== 0 || !fs.existsSync(out)) return null;
  const raw = JSON.parse(fs.readFileSync(out, "utf8"));
  fs.rmSync(out, { force: true });
  return Object.fromEntries(files.map((f) => [f, raw[path.resolve(f)] || raw[Object.keys(raw).find((k) => path.resolve(k) === path.resolve(f))]]));
}
let center = null;
/** 以固定背景均值去中心后的余弦（背景 = 旧声库 135 条的均值，Audio/FirstLevel/Data_FirstLevelVoiceSpeakerCenter.json）。 */
export function CenteredCosine(a, b) {
  center ??= JSON.parse(fs.readFileSync(path.join(here, "Audio", "FirstLevel", "Data_FirstLevelVoiceSpeakerCenter.json"), "utf8"));
  const ca = a.map((v, i) => v - center[i]), cb = b.map((v, i) => v - center[i]);
  const na = Math.hypot(...ca), nb = Math.hypot(...cb);
  return ca.reduce((t, v, i) => t + v * cb[i], 0) / (na * nb);
}
export function MeanVector(vectors) {
  const m = new Array(vectors[0].length).fill(0);
  for (const v of vectors) v.forEach((x, i) => { m[i] += x / vectors.length; });
  return m;
}

/** 限并发跑一批异步任务。 */
export async function Pool(items, jobs, work) {
  let cursor = 0;
  const results = new Array(items.length);
  const errors = [];
  await Promise.all(Array.from({ length: Math.min(jobs, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try { results[index] = await work(items[index], index); } catch (error) { errors.push(error); results[index] = null; }
    }
  }));
  return { results, errors };
}

/**
 * 转写 + 字错率 + 意图文本的逐字强制对齐（faster-whisper medium，py3.13）。
 * jobs: [{ file, lang: "zh"|"ja", text, reference? }] → { [file]: { text, cer, chars:[[c,start,end]], alignProbability } }
 * 拿不到 whisper 时返回 null。
 */
export function Transcribe(jobs) {
  if (!jobs.length) return {};
  const stamp = `${process.pid}_${Date.now()}`;
  const dir = process.env.TEMP || process.env.TMPDIR || here;
  const input = path.join(dir, `voice_lines_${stamp}.json`), output = path.join(dir, `voice_lines_${stamp}.out.json`);
  fs.writeFileSync(input, JSON.stringify(jobs.map((j) => ({ ...j, file: path.resolve(j.file) }))));
  const py = process.env.VOICE_WHISPER_PY || "py";
  const args = process.env.VOICE_WHISPER_PY ? [] : ["-3.13"];
  const result = spawnSync(py, [...args, path.join(here, "Script_FirstLevelVoiceAlign.py"), "--lines", input, "--result", output],
    { encoding: "utf8", windowsHide: true, maxBuffer: 1 << 26, env: { ...process.env, PYTHONUTF8: "1" } });
  fs.rmSync(input, { force: true });
  if (result.status !== 0 || !fs.existsSync(output)) {
    console.warn(`Transcribe unavailable (status ${result.status}, signal ${result.signal}, ${result.error?.message || "no spawn error"}): ${(result.stderr || "").slice(-300)}`);
    return null;
  }
  const raw = JSON.parse(fs.readFileSync(output, "utf8"));
  fs.rmSync(output, { force: true });
  return Object.fromEntries(jobs.map((j) => [j.file, raw[path.resolve(j.file)] ?? null]));
}
