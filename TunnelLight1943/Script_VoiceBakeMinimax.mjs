// 配音烘焙（本机 MiniMax Hub 网关这条路）。
//
// 项目原本只有一条配音流水线：Qwen3-TTS 克隆（Script_VoiceBakeQwen.py），要
// CUDA venv、要参考声线 flac，只在装了那套环境的机器上跑得动。序章那八句台词
// （伪军 1、娘 6、旁白 1）一直是**静默出字幕**的状态。
//
// 这条是补位的：本机 MiniMax Hub 起着的时候，网关 127.0.0.1:8001 免鉴权，
// 直接 POST 就出音频（配方见项目记忆 minimax-hub-local-gateway）。音色表在
// `Data_VoiceCast.json` 的 `minimaxVoices`——**别在这儿写死 voice_id**。
//
//   node TunnelLight1943/Script_VoiceBakeMinimax.mjs --prologue     # 序那八句
//   node TunnelLight1943/Script_VoiceBakeMinimax.mjs <id> <id> ...  # 指定行
//   node TunnelLight1943/Script_VoiceBakeMinimax.mjs --missing      # 所有还没音频的
//   ... --force                                                    # 已有的也重烘
//
// 三个坑（都是踩过的）：
//   ① **网关跟着 GUI 应用活**，平时没在跑：先起 MiniMax Hub.exe 再等它应答，
//      别把 connection refused 当成"这台机器没这个能力"。
//   ② **voice_id 不能瞎写**：`Chinese_*_nv1` 那一族里只有 gravelly_storyteller
//      是真的，别的报 code=2054。能用的是 `Chinese (Mandarin)_*` 一族。
//   ③ params 的值一律是**字符串**，传数字报 `value?.trim is not a function`。
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const GATEWAY = process.env.MINIMAX_HUB || "http://127.0.0.1:8001";
const FFMPEG = process.env.FFMPEG || "C:\\Program Files\\MiniMaxHub\\resources\\ffmpeg\\ffmpeg.exe";
const manifestPath = path.join(projectDir, "Audio", "Voice_Manifest.json");
const voiceDir = path.join(projectDir, "Audio", "Voice");
const castPath = path.join(projectDir, "Data_VoiceCast.json");

// 序 · 那天 的全部台词（Notion 第八稿清点：真旁白 1、角色对白 7）
const PROLOGUE_TEXTS = [
  "出来！都出来！", "柱子。", "抱她。", "快。",
  "下去！", "搂紧她。", "不叫你们，别上来。", "没人来叫。",
];

const args = process.argv.slice(2);
const force = args.includes("--force");
const picks = args.filter((a) => !a.startsWith("--"));

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const cast = JSON.parse(fs.readFileSync(castPath, "utf8"));
const voices = cast.minimaxVoices || {};
const workspace = await (await fetch(`${GATEWAY}/api/workspace`)).json();

const Has = (id) => fs.existsSync(path.join(voiceDir, `${id}.mp3`));
let lines;
if (picks.length) lines = manifest.lines.filter((l) => picks.includes(l.id));
else if (args.includes("--missing")) lines = manifest.lines.filter((l) => !Has(l.id));
else lines = manifest.lines.filter((l) => PROLOGUE_TEXTS.includes(l.text));
if (!force) lines = lines.filter((l) => !Has(l.id));

if (!lines.length) { console.log("没有要烘的行（加 --force 可以重烘）"); process.exit(0); }
console.log(`要烘 ${lines.length} 条 → ${voiceDir}`);

fs.mkdirSync(voiceDir, { recursive: true });
let ok = 0;
for (const line of lines) {
  const v = voices[line.voice];
  if (!v) { console.warn(`  跳过 ${line.id}：Data_VoiceCast.minimaxVoices 里没有 ${line.voice}`); continue; }
  const params = { voice_id: v.voice_id, speed: String(v.speed ?? "1") };
  if (v.emotion) params.emotion = v.emotion;
  const body = {
    backend: "minimax_tts",
    prompt: line.text,
    filename: `tlvoice_${line.id}`,
    params,
  };
  const res = await fetch(`${GATEWAY}/api/generate/speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const out = await res.json();
  if (!out.ok) { console.warn(`  ✗ ${line.id} ${line.text} — ${out.user_message || out.error}`); continue; }
  const src = path.join(workspace.dir, out.path);
  const dst = path.join(voiceDir, `${line.id}.mp3`);
  // 转 40kbps 单声道：整批音频要跟着网页发出去，跟老流水线（lamejs）同一档
  const enc = spawnSync(FFMPEG, ["-y", "-i", src, "-ac", "1", "-ar", "24000", "-b:a", "40k", dst], { encoding: "utf8" });
  if (enc.status !== 0) { console.warn(`  ✗ ${line.id} ffmpeg 失败：${(enc.stderr || "").slice(-200)}`); continue; }
  line.dur = Math.round(out.duration * 1000) / 1000;
  ok += 1;
  console.log(`  ✓ ${line.id} ${String(line.voice).padEnd(9)} ${line.dur.toFixed(2)}s  ${line.text}`);
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
console.log(`烘好 ${ok} 条，时长已写回 Voice_Manifest.json`);
