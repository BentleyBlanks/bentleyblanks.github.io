// 把配音 WAV 压成 MP3，并把每条的时长写回清单。
//
// 为什么是 MP3 而不是 Opus/WebM：这游戏要在 iOS Safari 上跑，MP3 是唯一
// 各端都稳的选择。语音是 16kHz 单声道，40kbps 已经听不出差别，121 条
// 从 20MB 压到 1MB 出头，才好放在 GitHub Pages 上。
//
// 顺便记下时长：过场是按行推进的，有了真实时长就能让字幕停留时间跟着
// 念完的时间走，而不是剧本里手写的 d 值。
//
// 依赖 @breezystack/lamejs —— 只在烘焙时用，不进游戏运行时，所以装在
// 仓库外的临时目录，用 --lame 指过来。
//
// 运行：node Script_VoiceEncode.mjs --wav <目录> --lame <lamejs路径> [--kbps 40]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const Arg = (name, dflt) => {
  const i = argv.indexOf("--" + name);
  return i >= 0 ? argv[i + 1] : dflt;
};
const wavDir = path.resolve(Arg("wav", ""));
const lamePath = Arg("lame", "");
const kbps = parseInt(Arg("kbps", "40"), 10);
const outDir = path.join(projectDir, "Audio", "Voice");
const manifestPath = path.join(projectDir, "Audio", "Voice_Manifest.json");

if (!wavDir || !fs.existsSync(wavDir)) throw new Error("--wav 目录不存在：" + wavDir);
const lameMod = await import(pathToFileURL(lamePath).href);
const lamejs = lameMod.default ?? lameMod;

fs.mkdirSync(outDir, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

function ReadWav(buf) {
  if (buf.toString("ascii", 0, 4) !== "RIFF") throw new Error("不是 WAV");
  const channels = buf.readUInt16LE(22);
  const rate = buf.readUInt32LE(24);
  const bits = buf.readUInt16LE(34);
  if (bits !== 16) throw new Error("只处理 16bit，拿到 " + bits);
  // data 块不一定紧跟 fmt（OneCore 会插 LIST/fact），得扫过去找
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "data") {
      const n = Math.floor(size / 2);
      const pcm = new Int16Array(n);
      for (let i = 0; i < n; i += 1) pcm[i] = buf.readInt16LE(off + 8 + i * 2);
      return { channels, rate, pcm };
    }
    off += 8 + size + (size % 2);
  }
  throw new Error("WAV 里没有 data 块");
}

// 掐掉首尾静音：合成器每条都留一段空白，121 条加起来是白扔的体积和延迟
function TrimSilence(pcm, rate) {
  const thresh = 380;                       // 16bit 满幅 32768，约 -39dB
  const pad = Math.round(rate * 0.06);
  let a = 0, b = pcm.length - 1;
  while (a < b && Math.abs(pcm[a]) < thresh) a += 1;
  while (b > a && Math.abs(pcm[b]) < thresh) b -= 1;
  a = Math.max(0, a - pad);
  b = Math.min(pcm.length - 1, b + pad);
  return pcm.subarray(a, b + 1);
}

let total = 0, count = 0;
for (const line of manifest.lines) {
  const src = path.join(wavDir, line.id + ".wav");
  if (!fs.existsSync(src)) { console.warn("缺 WAV：" + line.id); continue; }
  const { channels, rate, pcm } = ReadWav(fs.readFileSync(src));
  const trimmed = TrimSilence(pcm, rate);
  const enc = new lamejs.Mp3Encoder(channels, rate, kbps);
  const chunks = [];
  const BLOCK = 1152;
  for (let i = 0; i < trimmed.length; i += BLOCK) {
    const buf = enc.encodeBuffer(trimmed.subarray(i, Math.min(i + BLOCK, trimmed.length)));
    if (buf.length) chunks.push(Buffer.from(buf));
  }
  const tail = enc.flush();
  if (tail.length) chunks.push(Buffer.from(tail));
  const mp3 = Buffer.concat(chunks);
  fs.writeFileSync(path.join(outDir, line.id + ".mp3"), mp3);
  line.dur = +(trimmed.length / rate / channels).toFixed(2);
  total += mp3.length;
  count += 1;
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
console.log(`编码 ${count} 条 → ${(total / 1024 / 1024).toFixed(2)} MB（${kbps}kbps）`);
console.log(`总时长 ${manifest.lines.reduce((n, l) => n + (l.dur || 0), 0).toFixed(0)} 秒`);
