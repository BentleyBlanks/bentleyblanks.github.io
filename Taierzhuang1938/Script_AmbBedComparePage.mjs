// 战场远景床候选对比页生成器（本地用，产物在已忽略的 _shots/ 下，不提交）。
//   node Taierzhuang1938/Script_SeedAudioBattleBedBake.mjs --page
//
// 出：Taierzhuang1938/_shots/AmbBedCandidates/index.html + 现行 battleFar 与五条候选的 mp3 副本 + 各自一张频谱图。
// 数字全部现量（RMS / 峰值 / 波峰因数量成品文件），人声筛查读 takes 目录里的 VoiceScreen.json（--bake 时写的）。
//
// 频谱图用 ffmpeg showspectrumpic，上下两块：0–1 kHz（看炮声与闷雷的低频）和 0–8 kHz（看枪声与回声尾巴），都是线性频率。
// 不用 fscale=log：showspectrumpic 的对数频率轴会在 500–900 Hz 附近画一条假的亮带（纯粉噪声也有），会被误读成一条持续的音调。

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { AMB_BED_STEMS, AMB_BED_VARIANTS, AMB_BED_TARGET } from "./Data_AmbSources.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AMB_DIR = path.join(HERE, "Audio", "Amb");
const OUT_DIR = path.join(HERE, "_shots", "AmbBedCandidates");
const FFMPEG = process.env.FFMPEG || "ffmpeg";

const Esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function Spectrogram(mp3, png) {
  const graph = "[0:a]asplit[a][b];"
    + "[a]showspectrumpic=s=1000x190:legend=1:scale=log:fscale=lin:color=intensity:stop=1000:drange=90:limit=0[x];"
    + "[b]showspectrumpic=s=1000x250:legend=1:scale=log:fscale=lin:color=intensity:stop=8000:drange=90:limit=0[y];"
    + "[x][y]vstack[o]";
  const r = spawnSync(FFMPEG, ["-y", "-v", "error", "-i", mp3, "-filter_complex", graph, "-map", "[o]", "-frames:v", "1", png], { windowsHide: true });
  if (r.status !== 0) throw new Error(`频谱图失败：${(r.stderr || "").toString().slice(-200)}`);
}

export async function BuildComparePage({ takesDir, MeasureFile }) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(AMB_DIR, "Data_AmbManifest.json"), "utf8"));
  const screenFile = path.join(takesDir, "VoiceScreen.json");
  const screen = fs.existsSync(screenFile) ? JSON.parse(fs.readFileSync(screenFile, "utf8")) : {};
  const stemPrompt = Object.fromEntries(AMB_BED_STEMS.map((s) => [s.id, s.prompt]));

  const rows = [{
    key: "现行", file: "AudioAmb_BattleFar.mp3", label: "现行 battleFar（Coll Anderson 战斗人群录音）",
    style: "英语战斗人群录音低通到 1.1 kHz：听不清词，但听得出是一群人在喊。用户说的「奇奇怪怪的人声」多半就是它（审计结论见 docs/Data_AudioAssets.md）。",
    credit: "Coll Anderson · 持续交火中的人群 · Sonniss GDC 2015", prompts: [], sources: [], url: "",
  }];
  for (const v of AMB_BED_VARIANTS) {
    const entry = manifest.bedVariants?.[v.key];
    if (!entry) continue;
    rows.push({
      key: v.key, file: entry.file, label: `${v.key} · ${v.label}`, style: v.style, credit: entry.credit,
      prompts: [...new Set(v.stems.map((s) => s.id))].map((id) => ({ id, text: stemPrompt[id] })),
      sources: entry.scatter, stems: entry.stems, url: `?whitebox=p012&ambBed=${v.key}`,
    });
  }

  for (const row of rows) {
    const src = path.join(AMB_DIR, row.file);
    fs.copyFileSync(src, path.join(OUT_DIR, row.file));
    row.m = MeasureFile(src);
    row.png = row.file.replace(/\.mp3$/, ".png");
    Spectrogram(src, path.join(OUT_DIR, row.png));
    row.screen = screen[row.file] || null;
    row.bytes = fs.statSync(src).size;
  }

  const verdictText = { clean: "clean（没有人声）", suspect: "suspect（有提示，需复核）", voice: "voice（有人声）" };
  const card = (row) => {
    const s = row.screen;
    const screenHtml = s ? `<b class="v-${s.verdict}">${Esc(verdictText[s.verdict] || s.verdict)}</b>
      <span>Silero VAD 0.5：${s.vad.t50.speechS} s ／ 0.3：${s.vad.t30.speechS} s ／ 基频连续段合计 ${s.pitch.runS ?? 0} s ／ Whisper 可信转写词 ${s.asr ? s.asr.zh.words.length + s.asr.en.words.length : "—"} 个</span>`
      : "<span>（未筛查）</span>";
    const prompts = row.prompts.map((p) => `<details><summary>SeedAudio 提示词：${Esc(p.id)}</summary><p>${Esc(p.text)}</p></details>`).join("");
    const sources = row.sources.length ? `<details><summary>混入的实录单发（${row.sources.length} 组）</summary><ul>${row.sources.map((x) =>
      `<li>${Esc(x.id)} × ${x.events}：${Esc(x.credit)}（${Esc(x.license)}）</li>`).join("")}</ul></details>` : "";
    const link = row.url ? `<a href="../../index.html${row.url}">只放这一条进游戏试听（?ambBed=${row.key}）</a>` : `<a href="../../index.html?whitebox=p012&ambBed=legacy">用旧床进游戏（?ambBed=legacy）</a>`;
    return `<section id="v${Esc(row.key)}">
  <h2>${Esc(row.label)}</h2>
  <p class="style">${Esc(row.style)}</p>
  <audio controls loop preload="none" src="${Esc(row.file)}"></audio>
  <table>
    <tr><th>时长</th><td>${row.m.seconds.toFixed(1)} s</td><th>RMS</th><td>${row.m.rmsDb.toFixed(2)} dBFS</td><th>峰值</th><td>${row.m.peakDb.toFixed(2)} dBFS</td><th>波峰因数</th><td>${row.m.crestDb.toFixed(1)} dB</td><th>体积</th><td>${(row.bytes / 1024).toFixed(0)} KB</td></tr>
  </table>
  <p class="screen">人声筛查：${screenHtml}</p>
  <img src="${Esc(row.png)}" alt="${Esc(row.label)} 频谱图（上：0–1 kHz，下：0–8 kHz，线性频率）">
  <p class="credit">${Esc(row.credit)}</p>
  ${prompts}${sources}
  <p>${link}</p>
</section>`;
  };

  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>战场远景床候选对比</title>
<style>
  :root { --bg:#f6f4ef; --fg:#1d1b17; --muted:#6b665c; --card:#fff; --line:#d9d4c7; --ok:#1c6b3a; --warn:#9a5b00; --bad:#a3271b; }
  @media (prefers-color-scheme: dark) { :root { --bg:#151412; --fg:#ece8df; --muted:#a29b8c; --card:#1f1d1a; --line:#38342d; --ok:#6fcf97; --warn:#e0a84a; --bad:#ef7d6f; } }
  body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.6 system-ui,"Microsoft YaHei",sans-serif; }
  main { max-width:1080px; margin:0 auto; padding:24px 16px 64px; }
  h1 { font-size:22px; } h2 { font-size:18px; margin:0 0 4px; }
  section { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:16px; margin:18px 0; }
  .style { margin:4px 0 10px; } .credit, .note { color:var(--muted); font-size:13px; }
  audio { width:100%; } img { max-width:100%; height:auto; border-radius:6px; margin:8px 0 2px; background:#000; }
  table { border-collapse:collapse; margin:8px 0; font-size:14px; } th { color:var(--muted); font-weight:500; text-align:left; padding:2px 8px 2px 0; } td { padding:2px 18px 2px 0; }
  .v-clean { color:var(--ok); } .v-suspect { color:var(--warn); } .v-voice { color:var(--bad); }
  details { margin:6px 0; font-size:13px; } summary { cursor:pointer; color:var(--muted); } details p { white-space:pre-wrap; }
  a { color:inherit; }
</style></head><body><main>
<h1>战场远景床候选对比</h1>
<p class="note">2026-09-29 · 本页只在本地，不提交。用户原话：「当前默认游戏的环境音里有太多奇奇怪怪的人声，参考COD这类的操作给我重新生成几条给我选择」。
五条候选全程没有人声（喊叫、说话、口哨、惨叫、音乐），COD（WaW / WWII）式「只有仗、没有人群」的远方战场；
响度按现行 battleFar 成品的 RMS（${AMB_BED_TARGET.rmsDb} dBFS）对齐，量的是成品文件。
用户已选定（2026-09-29 原话：「整体A长期存在，B和C交替的随机叠加出现；E在玩家进入巷道/半室内阶段再播放（作为替换偶尔的B和C）」）：
默认档 <code>layered</code> = A 当长期底床，B 与 C 交替、随机时刻偶尔叠在 A 上面，听者在巷道 / 半室内时这层改用 E，D 不用（见 docs/Data_AudioEngine.md §15）。
现场试听在游戏地址后加 <code>?ambBed=layered</code>（默认，可不写）、<code>?ambBed=A|B|C|D|E</code>（只放这一条、不叠加）、<code>?ambBed=legacy</code>（旧的英语战斗人群床）或 <code>?ambBed=none</code>；
下面每张卡片的链接就是「只放这一条」。
游戏里这一层还会被战场强度、远声组增益和防炮洞低通（480 / 1500 Hz）改变，单听文件与进游戏听会不同。</p>
<p class="note">频谱图说明：ffmpeg showspectrumpic，线性频率；不用对数轴是因为它会在 500–900 Hz 附近画一条假的亮带。</p>
${rows.map(card).join("\n")}
</main></body></html>
`;
  fs.writeFileSync(path.join(OUT_DIR, "index.html"), html);
  console.log(`对比页：${path.join(OUT_DIR, "index.html")}`);
}
