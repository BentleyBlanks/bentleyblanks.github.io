// 第一章动作音效的烘焙流水线：本机 MiniMax Hub → 拟音长片 → 切一次性音 → MP3。
//
// 为什么是这条路：MiniMax Hub 本机网关（127.0.0.1:8001）上能用的音频后端只有
// TTS、音乐（minimax_music / elevenlabs_music）与"音频续写"三种。续写要求账号
// 开通 MiniMax-H3-audio-continuation（本机没开），ElevenLabs Music 需要账号另外
// 接受 music terms（也没开）。剩下能跑的是 music-3.0——但它**听得懂**"这不是音乐、
// 是拟音"这句话：给它一段纯拟音描述，它吐回来的是一串互不相连的敲击声，中间是
// 静音。于是流水线成了「生成一大段素材 → 自动挑最像一次性响动的那几下 → 切出来」。
//
// 用法：
//   node TunnelLight1943/Script_SfxBake.mjs            # 全量（缺哪个生成哪个）
//   node TunnelLight1943/Script_SfxBake.mjs vault land # 只烘这两组
//   node TunnelLight1943/Script_SfxBake.mjs --recut    # 不重新生成，只重切
//
// 产物：Audio/Sfx/*.mp3 + Audio/Sfx/Data_SfxManifest.json（Script_Audio 按名字取用，
// 取不到就退回原来的程序化合成——音效永远不该把游戏卡住）。

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(HERE, "Audio", "Sfx");
const RAW_DIR = path.join(OUT_DIR, "_raw");
const GATEWAY = process.env.MINIMAX_GATEWAY || "http://127.0.0.1:8001";
const HUB_ROOT = process.env.MINIMAX_HUB || "C:\\Program Files\\MiniMaxHub\\resources";
const FFMPEG = process.env.FFMPEG || path.join(HUB_ROOT, "ffmpeg", "ffmpeg.exe");

// 拟音提示词的共同前缀：把模型从"写歌"上拽下来。反复试出来的三条——
// ①先否定（不是音乐、没有乐器、没有节拍）；②给录音场景（干燥的华北农村院子、
// 近距离单声道）；③要求响动之间是静音（一次性音的关键就在它前后的空白）。
const PREFIX = "Foley sound effects only, this is NOT music: no instruments, no melody, "
  + "no drums, no rhythm, no singing. Field recording in a dry 1940s north-China village "
  + "courtyard, close microphone, dry and small, no reverb tail. Separate one-shot sounds "
  + "with clear silence between them. ";

// 每组烘一次生成（20 credits），从同一段素材里切出若干个 cue。
// tail = 这个音该留多长（秒）；gain = 归一化目标（0-1 峰值）。
const GROUPS = [
  {
    id: "woodstack",
    prompt: PREFIX + "Two bare palms slap down hard on a shoulder-high stack of split "
      + "firewood; the dry logs knock and shift against each other; a boy's cloth jacket "
      + "scuffs across the wood as he swings over. Repeat several times with pauses.",
    cuts: [
      { cue: "vault", tail: 0.52, gain: 0.85, decay: [0.12, 0.6] },
      { cue: "vaultHeavy", tail: 0.72, gain: 0.9, prefer: "low", decay: [0.18, 0.9] },
    ],
  },
  {
    id: "dirt",
    prompt: PREFIX + "Bare feet and cloth shoes land heavily on dry packed dirt: a single "
      + "dull thud with a little loose grit scattering after it. Then a few slow footsteps "
      + "on the same dry dirt. Repeat with pauses.",
    // 脚步**故意不换成采样**：它每秒响一两下、八章都在用，一个固定的样本
    // 循环起来就是"机关枪"，而合成那版每次从噪声缓冲的随机位置起播，天然不重样。
    // 一次性的响动才适合用采样。
    cuts: [
      { cue: "vaultLand", tail: 0.42, gain: 0.85, prefer: "low", decay: [0.10, 0.45] },
    ],
  },
  {
    id: "mallet",
    prompt: PREFIX + "A carpenter's wooden mallet strikes a wooden wedge into a mortise "
      + "joint: a tight woody knock, short and dry, the timber ringing very briefly. "
      + "Single strikes with pauses between them.",
    cuts: [
      { cue: "tenon", tail: 0.30, gain: 0.9, decay: [0.08, 0.35] },
      { cue: "knock", tail: 0.34, gain: 0.8, prefer: "low", decay: [0.10, 0.5] },
    ],
  },
  {
    id: "plank",
    prompt: PREFIX + "A heavy rough-sawn timber plank is lifted off the ground and set "
      + "down onto a wooden wheelbarrow: wood scraping on wood, then a solid wooden clunk. "
      + "Also a small wooden bucket handle rattling. Separate takes with pauses.",
    cuts: [
      { cue: "pickup", tail: 0.34, gain: 0.6, prefer: "high", decay: [0.06, 0.3] },
      { cue: "drop", tail: 0.44, gain: 0.75, prefer: "low", decay: [0.12, 0.5] },
    ],
  },
  {
    id: "well",
    prompt: PREFIX + "An old wooden windlass over a village well creaks and groans as the "
      + "rope pays out, the wooden axle squeaking against its frame; then a wooden bucket "
      + "hits the water below with a hollow splash. Separate takes with pauses.",
    cuts: [
      { cue: "crank", tail: 0.85, gain: 0.6, prefer: "sustain", decay: [0.3, 1.6] },
      { cue: "waterSplash", tail: 0.75, gain: 0.8, decay: [0.15, 0.9] },
    ],
  },
  {
    id: "stone",
    prompt: PREFIX + "A small stone is thrown: a brief whip of air, then the pebble lands "
      + "in dry dirt and skitters to a stop. Repeat several times with pauses.",
    cuts: [
      { cue: "whoosh", tail: 0.28, gain: 0.55, prefer: "high", decay: [0.05, 0.3] },
      { cue: "stoneLand", tail: 0.40, gain: 0.7, decay: [0.06, 0.4] },
    ],
  },
  {
    id: "birds",
    prompt: PREFIX + "A startled hen squawks twice and flaps hard off a woodpile; then a "
      + "flock of sparrows bursts out of a tree, many small wings beating away into the "
      + "distance. Separate takes with pauses.",
    cuts: [
      { cue: "henSquawk", tail: 0.85, gain: 0.75, decay: [0.2, 1.2] },
      { cue: "flutter", tail: 0.95, gain: 0.6, prefer: "high", decay: [0.25, 1.4] },
    ],
  },
  {
    id: "gong",
    prompt: PREFIX + "A hand-struck bronze alarm gong in a village lane: one hard strike, "
      + "loud and shimmering, decaying for several seconds. Struck a few times with long "
      + "pauses between strikes.",
    cuts: [
      { cue: "gong", tail: 2.6, gain: 0.95, prefer: "sustain", decay: [0.8, 4.0] },
    ],
  },
  {
    id: "scribe",
    prompt: PREFIX + "A piece of soft stone chalk is dragged across a wooden door frame, "
      + "scratching a line into the dry wood — a gritty rasp lasting about a second. "
      + "Repeat several times with pauses.",
    cuts: [
      { cue: "scribe", tail: 0.9, gain: 0.55, prefer: "sustain", decay: [0.35, 1.6] },
    ],
  },
];

// ---------------------------------------------------------------------------
// MiniMax Hub 本机网关
// ---------------------------------------------------------------------------
async function Generate(group) {
  const filename = `tl_sfx_${group.id}.mp3`;
  const body = {
    backend: "minimax_music",
    prompt: group.prompt,
    filename,
    params: { is_instrumental: "instrumental", lyrics: "" },
  };
  // 一次生成要跑一两分钟，本机网关偶尔会把连接掐掉（fetch failed）。
  // 掐了就重来——重跑一组比重跑整轮便宜
  let json = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(`${GATEWAY}/api/generate/music`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      json = await res.json();
      break;
    } catch (error) {
      console.log(`  ! ${group.id} 第 ${attempt} 次连接失败（${error.message}），重试`);
      if (attempt === 3) throw error;
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
  if (!json.ok) throw new Error(`[${group.id}] 生成失败：${json.error || JSON.stringify(json)}`);
  const wsRes = await fetch(`${GATEWAY}/api/workspace`);
  const ws = await wsRes.json();
  const src = path.join(ws.dir, json.path);
  if (!fs.existsSync(src)) throw new Error(`[${group.id}] 网关说成功了，但文件不在：${src}`);
  fs.mkdirSync(RAW_DIR, { recursive: true });
  const dst = path.join(RAW_DIR, `${group.id}.mp3`);
  fs.copyFileSync(src, dst);
  console.log(`  · ${group.id}: ${json.duration?.toFixed?.(1) ?? "?"}s → ${path.relative(HERE, dst)}`);
  return dst;
}

// ---------------------------------------------------------------------------
// 切一次性音：把长素材解成单声道 PCM，找起音点，按"起音有多陡"排队挑最像响动的
// ---------------------------------------------------------------------------
const SR = 32000;

function DecodeMono(file) {
  const raw = execFileSync(FFMPEG, ["-v", "error", "-i", file, "-ac", "1", "-ar", String(SR), "-f", "s16le", "-"],
    { maxBuffer: 1 << 28 });
  const n = raw.length >> 1;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) out[i] = raw.readInt16LE(i * 2) / 32768;
  return out;
}

/** 5ms 一格的 RMS 包络 */
function Envelope(pcm, hop = Math.round(SR * 0.005)) {
  const frames = Math.floor(pcm.length / hop);
  const env = new Float32Array(frames);
  for (let f = 0; f < frames; f += 1) {
    let s = 0;
    for (let i = 0; i < hop; i += 1) { const v = pcm[f * hop + i]; s += v * v; }
    env[f] = Math.sqrt(s / hop);
  }
  return { env, hop };
}

/**
 * 找候选：起音点 = 包络从底噪窜上来的那一格。给每个候选打分——
 * attack（窜得多快）、peak（多响）、clean（前面有多安静）。
 * 拟音一次性音的特征就是"前面是静的、起来是陡的"，音乐段落这三项都不好看。
 */
function FindHits(pcm, { minGapS = 0.35 } = {}) {
  const { env, hop } = Envelope(pcm);
  const sorted = Float32Array.from(env).sort();
  const floor = sorted[Math.floor(sorted.length * 0.35)] || 1e-5;   // 底噪
  const peakAll = sorted[sorted.length - 1] || 1e-4;
  const thresh = Math.max(floor * 3.5, peakAll * 0.16);
  const minGap = Math.round(minGapS / 0.005);
  const hits = [];
  let last = -1e9;
  for (let f = 2; f < env.length - 4; f += 1) {
    if (env[f] < thresh) continue;
    if (env[f] <= env[f - 1]) continue;                    // 只认上升沿
    if (f - last < minGap) continue;
    // 回退到真正的起音格（前一格还在底噪附近）
    let s = f;
    while (s > 1 && env[s - 1] > floor * 1.6) s -= 1;
    const pre = (env[Math.max(0, s - 6)] + env[Math.max(0, s - 12)]) / 2;
    let pk = 0, pkAt = s;
    for (let i = s; i < Math.min(env.length, s + 40); i += 1) if (env[i] > pk) { pk = env[i]; pkAt = i; }
    const attack = Math.max(1, pkAt - s);                  // 格数越少越陡
    // 衰减：从峰值掉到十分之一要多少格
    let dec = 1;
    for (let i = pkAt; i < env.length && env[i] > pk * 0.1; i += 1) dec = i - pkAt + 1;
    hits.push({
      at: s * hop,
      peak: pk,
      quiet: pre / (pk + 1e-9),
      attack,
      decayS: dec * 0.005,
      score: (pk / peakAll) * (1 / Math.sqrt(attack)) * (1 - Math.min(1, pre / (pk + 1e-9))),
    });
    last = f;
  }
  return { hits, floor, peakAll };
}

/**
 * 挑一个：prefer 决定口味——low=更闷更沉，high=更脆，sustain=衰减更长。
 * decay 是硬筛：衰减 0.05 秒的"响动"是个咔哒声，不是落地声；
 * 衰减两秒的也不是一次性音（多半切进了一段连续素材）。
 */
function Pick(hits, prefer, used, decay) {
  let free = hits.filter((h) => !used.has(h.at));
  if (decay) {
    const inRange = free.filter((h) => h.decayS >= decay[0] && h.decayS <= decay[1]);
    if (inRange.length) free = inRange;
  }
  if (!free.length) return null;
  const ranked = free.slice().sort((a, b) => b.score - a.score).slice(0, Math.max(3, Math.ceil(free.length * 0.5)));
  if (prefer === "sustain") ranked.sort((a, b) => b.decayS - a.decayS);
  else if (prefer === "low") ranked.sort((a, b) => b.peak - a.peak);
  else if (prefer === "high") ranked.sort((a, b) => a.attack - b.attack);
  const chosen = ranked[0];
  used.add(chosen.at);
  return chosen;
}

function WriteWav(file, pcm) {
  const n = pcm.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i += 1) {
    const v = Math.max(-1, Math.min(1, pcm[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
}

function CutOne(pcm, hit, cut, tmpWav, outMp3) {
  const pre = Math.round(SR * 0.012);                       // 起音前留一点点，别切掉冲头
  const start = Math.max(0, hit.at - pre);
  const len = Math.min(pcm.length - start, Math.round(SR * cut.tail));
  const seg = pcm.slice(start, start + len);
  // 归一化 + 首尾淡入淡出（尾巴必须淡干净，否则每次触发都"咔"一下）
  let peak = 0;
  for (let i = 0; i < seg.length; i += 1) peak = Math.max(peak, Math.abs(seg[i]));
  const scale = peak > 1e-4 ? (cut.gain / peak) : 1;
  const fadeIn = Math.round(SR * 0.004);
  const fadeOut = Math.round(Math.min(seg.length * 0.45, SR * 0.09));
  for (let i = 0; i < seg.length; i += 1) {
    let g = scale;
    if (i < fadeIn) g *= i / fadeIn;
    const tail = seg.length - i;
    if (tail < fadeOut) g *= tail / fadeOut;
    seg[i] *= g;
  }
  WriteWav(tmpWav, seg);
  execFileSync(FFMPEG, ["-y", "-v", "error", "-i", tmpWav, "-ac", "1", "-ar", "32000", "-b:a", "56k", outMp3]);
  fs.rmSync(tmpWav, { force: true });
  return { seconds: seg.length / SR, bytes: fs.statSync(outMp3).size };
}

// ---------------------------------------------------------------------------
async function Main() {
  const args = process.argv.slice(2);
  const recut = args.includes("--recut");
  const only = args.filter((a) => !a.startsWith("--"));
  const groups = only.length ? GROUPS.filter((g) => only.includes(g.id)) : GROUPS;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(RAW_DIR, { recursive: true });

  const manifestPath = path.join(OUT_DIR, "Data_SfxManifest.json");
  const manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    : { source: "MiniMax Hub · music-3.0（拟音提示词）", cues: {} };

  for (const group of groups) {
    const rawFile = path.join(RAW_DIR, `${group.id}.mp3`);
    if (!fs.existsSync(rawFile) && !recut) {
      console.log(`[生成] ${group.id}`);
      await Generate(group);
    } else if (!fs.existsSync(rawFile)) {
      console.log(`[跳过] ${group.id}：没有素材可切`);
      continue;
    }
    const pcm = DecodeMono(rawFile);
    const { hits } = FindHits(pcm);
    console.log(`[切割] ${group.id}：素材 ${(pcm.length / SR).toFixed(1)}s，候选响动 ${hits.length} 处`);
    const used = new Set();
    for (const cut of group.cuts) {
      const hit = Pick(hits, cut.prefer, used, cut.decay);
      if (!hit) { console.log(`   ! ${cut.cue}：没挑出合适的一下`); continue; }
      const outMp3 = path.join(OUT_DIR, `${cut.cue}.mp3`);
      const info = CutOne(pcm, hit, cut, path.join(OUT_DIR, `_${cut.cue}.wav`), outMp3);
      manifest.cues[cut.cue] = {
        file: `${cut.cue}.mp3`,
        group: group.id,
        seconds: Number(info.seconds.toFixed(3)),
        atSeconds: Number((hit.at / SR).toFixed(2)),
        bytes: info.bytes,
      };
      console.log(`   · ${cut.cue}  ${info.seconds.toFixed(2)}s  ${(info.bytes / 1024).toFixed(1)}KB  `
        + `(素材 ${(hit.at / SR).toFixed(1)}s 处，衰减 ${hit.decayS.toFixed(2)}s)`);
    }
  }

  manifest.bakedAt = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`清单：${path.relative(HERE, manifestPath)}（${Object.keys(manifest.cues).length} 个音效）`);
}

Main().catch((error) => { console.error(error.message || error); process.exit(1); });
