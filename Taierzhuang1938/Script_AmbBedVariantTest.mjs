// 战场远景床（2026-09-29）：选择逻辑、装载计划、清单与素材对账、引擎里「默认只阻塞装载 A、B/C/E 后台、不碰旧床」。纯 Node，不开浏览器。
//
// 用户原话（2026-09-29）：「整体A长期存在，B和C交替的随机叠加出现；E在玩家进入巷道/半室内阶段再播放（作为替换偶尔的B和C）」。
//
// 用法：node Taierzhuang1938/Script_AmbBedVariantTest.mjs
//
// 四组检查：
//   1. 纯函数（Script_AmbBedVariant）：?ambBed= 的解析、优先级（URL > Data_Tuning_Audio.BATTLE_BED_VARIANT > 默认 layered）、
//      认不出的值退回默认（不静音）、layered / legacy / none / A–E 各自的装载计划（只换 battleFar 一个床名）、
//      预取只含阻塞装载的文件（默认 = 底床 A + 其它床，不含旧床、不含 B/C/E/D）、后台文件 = B/C/E。
//   2. 清单与成品：bedVariants A–E 都在、不混进 beds、文件存在且哈希对得上、≥ 30 s 立体声、RMS 对齐现行 battleFar、
//      峰值有余量、人声筛查 clean、来源与许可写清；现行 beds.battleFar 一个字没动（legacy 仍可听）。
//   3. 素材表：每条提示词都先写「没有任何人声」并列全禁止项；撒播用的单发只来自登记过的无人声 cue
//      （绝不含 battleFar / crowdFar / moanFar 这三条人声素材）。
//   4. 引擎（Script_Audio.AudioEngine）：用桩 fetch 与桩 AudioContext 跑真的 PrefetchPacks / LoadAmbPack / LoadBattleOverlayBeds，
//      记下每一个被请求的 Audio/Amb/ 地址 —— 默认（开机预取 + 装载）只请求 A，不请求旧床与 B/C/D/E，ambReady 不等叠加素材；
//      后台装载才请求 B、C、E（且只这三条）；?ambBed=legacy 只请求旧床；?ambBed=B 只请求 B 且没有叠加；none 都不请求；
//      候选被登记成同名床 battleFar，所有预设不用改一个字。

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  ParseAmbBedParam, ResolveBattleBedChoice, BedLoadPlan, AmbFilesToFetch, OverlayFilesToFetch, REPLACED_BED,
} from "./Script_AmbBedVariant.mjs";
import { BATTLE_BED_VARIANT, BATTLE_BED_LAYERS } from "./Data_Tuning_Audio.mjs";
import { AMB_BED_STEMS, AMB_BED_VARIANTS, AMB_BED_TARGET } from "./Data_AmbSources.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AMB_DIR = path.join(HERE, "Audio", "Amb");
const manifest = JSON.parse(fs.readFileSync(path.join(AMB_DIR, "Data_AmbManifest.json"), "utf8"));
const KEYS = ["A", "B", "C", "D", "E"];

let failed = 0;
function Check(name, fn) {
  try { fn(); console.log(`ok   ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${name}\n     ${String(err.message || err).split("\n").join("\n     ")}`); }
}
async function CheckAsync(name, fn) {
  try { await fn(); console.log(`ok   ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${name}\n     ${String(err.message || err).split("\n").join("\n     ")}`); }
}

// ---------------------------------------------------------------------------
// 1. 纯函数
// ---------------------------------------------------------------------------
Check("?ambBed= 解析：大小写、编码、空值、夹在别的参数中间", () => {
  assert.equal(ParseAmbBedParam(""), null);
  assert.equal(ParseAmbBedParam("?whitebox=p012"), null);
  assert.equal(ParseAmbBedParam("?ambBed="), null);
  assert.equal(ParseAmbBedParam("?ambBed=B"), "B");
  assert.equal(ParseAmbBedParam("?whitebox=p012&ambBed=c&menu=0"), "c");
  assert.equal(ParseAmbBedParam("?ambBed=%20none%20"), "none");
  assert.equal(ParseAmbBedParam("?xambBed=B"), null, "别的参数名以 ambBed 结尾不算");
});

Check("选择优先级：URL > 调参口 > 默认；默认 = layered（A 底床 + B/C 偶尔叠加）", () => {
  const keys = KEYS;
  const base = ResolveBattleBedChoice({ search: "", tuning: null, keys });
  assert.deepEqual(base, { choice: "layered", source: "default", ignored: null });
  assert.deepEqual(ResolveBattleBedChoice({ search: "", tuning: "layered", keys }), { choice: "layered", source: "tuning", ignored: null });
  assert.equal(ResolveBattleBedChoice({ search: "", tuning: "C", keys }).choice, "C");
  assert.equal(ResolveBattleBedChoice({ search: "", tuning: "c", keys }).source, "tuning");
  const both = ResolveBattleBedChoice({ search: "?ambBed=E", tuning: "C", keys });
  assert.deepEqual([both.choice, both.source], ["E", "url"], "URL 优先于调参口");
  assert.equal(ResolveBattleBedChoice({ search: "?ambBed=none", tuning: "C", keys }).choice, "none");
  assert.equal(ResolveBattleBedChoice({ search: "", tuning: "none", keys }).choice, "none");
  assert.equal(ResolveBattleBedChoice({ search: "?ambBed=legacy", tuning: "layered", keys }).choice, "legacy", "legacy = 旧床，对比用");
  assert.equal(ResolveBattleBedChoice({ search: "?ambBed=LAYERED", tuning: "B", keys }).choice, "layered", "URL 显式要 layered");
  assert.equal(ResolveBattleBedChoice({ search: "", tuning: "Legacy", keys }).choice, "legacy");
});

Check("认不出的值退回下一级直到默认 layered，不静音，并回报 ignored", () => {
  const keys = KEYS;
  const badUrl = ResolveBattleBedChoice({ search: "?ambBed=Z", tuning: null, keys });
  assert.deepEqual([badUrl.choice, badUrl.source, badUrl.ignored], ["layered", "default", "Z"]);
  const badUrlGoodTuning = ResolveBattleBedChoice({ search: "?ambBed=Z", tuning: "B", keys });
  assert.deepEqual([badUrlGoodTuning.choice, badUrlGoodTuning.source, badUrlGoodTuning.ignored], ["B", "tuning", "Z"]);
  const badTuning = ResolveBattleBedChoice({ search: "", tuning: "Q", keys });
  assert.deepEqual([badTuning.choice, badTuning.ignored], ["layered", "Q"]);
  // 清单里没有候选（旧清单）时，合法字母也认不出 —— 退回默认 layered（BedLoadPlan 再退回旧床，见下）。
  assert.equal(ResolveBattleBedChoice({ search: "?ambBed=B", tuning: null, keys: [] }).choice, "layered");
});

Check("装载计划（layered，默认）：底床 A 顶替 battleFar 的位置；B / C / E 进后台 overlay 不进阻塞 beds；D 不用", () => {
  const def = Object.entries(manifest.beds).map(([k, v]) => [k, v.file]);
  const at = def.findIndex(([bed]) => bed === REPLACED_BED);
  for (const choice of [null, "layered"]) {
    const plan = BedLoadPlan(manifest, choice);
    assert.equal(plan.mode, "layered");
    assert.equal(plan.beds.length, def.length, "床的个数不变（替换而不是新增）");
    assert.deepEqual(plan.beds[at], { bed: REPLACED_BED, file: manifest.bedVariants.A.file, variant: "A" });
    assert.deepEqual(plan.beds.filter((_, i) => i !== at).map((b) => [b.bed, b.file]), def.filter((_, i) => i !== at), "其它床原样");
    assert.ok(!plan.beds.some((b) => b.file === manifest.beds.battleFar.file), "旧的英语战斗人群床不进计划");
    assert.deepEqual(plan.overlay.map((o) => [o.key, o.role, o.file]), [
      ["B", "open", manifest.bedVariants.B.file], ["C", "open", manifest.bedVariants.C.file], ["E", "enclosed", manifest.bedVariants.E.file]]);
    assert.ok(![...plan.beds, ...plan.overlay].some((x) => /ColdFrontline/.test(x.file)), "D 不用");
    assert.deepEqual([plan.variant, plan.replaced, plan.dropped, plan.fellBack], ["A", true, false, false]);
  }
  assert.equal(BATTLE_BED_LAYERS.base, "A");
});

Check("装载计划（legacy / 单选 A–E / none）：只换 battleFar 一个床名，单选与 legacy 没有叠加", () => {
  const def = BedLoadPlan(manifest, "legacy");
  assert.equal(def.mode, "legacy");
  assert.deepEqual(def.beds.map((b) => [b.bed, b.file]), Object.entries(manifest.beds).map(([k, v]) => [k, v.file]), "legacy = 清单 beds 原样");
  assert.deepEqual([def.overlay.length, def.replaced, def.variant], [0, false, null]);
  const at = def.beds.findIndex((b) => b.bed === REPLACED_BED);
  for (const key of KEYS) {
    const plan = BedLoadPlan(manifest, key);
    assert.equal(plan.mode, "variant");
    assert.equal(plan.beds.length, def.beds.length, `${key}：床的个数不变`);
    assert.deepEqual(plan.beds[at], { bed: REPLACED_BED, file: manifest.bedVariants[key].file, variant: key });
    assert.deepEqual(plan.beds.filter((_, i) => i !== at), def.beds.filter((_, i) => i !== at), `${key}：其它床原样`);
    assert.equal(plan.overlay.length, 0, `${key}：单选一条不叠加`);
    assert.equal(plan.replaced, true);
  }
  const none = BedLoadPlan(manifest, "none");
  assert.equal(none.mode, "none");
  assert.equal(none.beds.length, def.beds.length - 1);
  assert.ok(!none.beds.some((b) => b.bed === REPLACED_BED) && none.dropped && none.overlay.length === 0);
});

Check("装载计划：清单里没有要的候选（旧清单）退回旧床、不静音；只缺一条叠加素材就少一条叠加、底床照常", () => {
  const def = BedLoadPlan(manifest, "legacy");
  for (const choice of ["layered", null, "B"]) {
    const missing = BedLoadPlan({ beds: manifest.beds, bedVariants: {} }, choice);
    assert.deepEqual(missing.beds, def.beds, `${choice}：退回旧床`);
    assert.equal(missing.fellBack, true);
    assert.equal(missing.overlay.length, 0);
  }
  const noE = { beds: manifest.beds, bedVariants: { A: manifest.bedVariants.A, B: manifest.bedVariants.B, C: manifest.bedVariants.C } };
  const plan = BedLoadPlan(noE, "layered");
  assert.deepEqual(plan.overlay.map((o) => o.key), ["B", "C"]);
  assert.equal(plan.beds.find((b) => b.bed === REPLACED_BED).variant, "A");
  assert.equal(plan.fellBack, false);
});

Check("预取清单：默认阻塞下载 = 底床 A + 其它床 + 一次性音，不含旧床与 B/C/D/E；文件数与旧默认相同", () => {
  const variantFiles = new Set(Object.values(manifest.bedVariants).map((v) => v.file));
  const legacy = AmbFilesToFetch(manifest, "legacy");
  assert.ok(legacy.includes("AudioAmb_BattleFar.mp3"));
  assert.ok(legacy.every((f) => !variantFiles.has(f)), "legacy 不带任何候选");
  for (const choice of [null, "layered"]) {
    const files = AmbFilesToFetch(manifest, choice);
    assert.equal(files.length, legacy.length, "开机阻塞下载的文件数不增加");
    assert.ok(!files.includes("AudioAmb_BattleFar.mp3"), "默认不请求旧床");
    assert.deepEqual(files.filter((f) => variantFiles.has(f)), [manifest.bedVariants.A.file], "候选里只有 A 在阻塞下载里");
    assert.deepEqual(OverlayFilesToFetch(manifest, choice), [manifest.bedVariants.B.file, manifest.bedVariants.C.file, manifest.bedVariants.E.file], "后台下载 = B / C / E");
    assert.ok(!OverlayFilesToFetch(manifest, choice).some((f) => files.includes(f)), "后台文件不在阻塞清单里");
  }
  for (const key of KEYS) {
    const files = AmbFilesToFetch(manifest, key);
    assert.equal(files.length, legacy.length, `${key}：文件数与旧默认相同`);
    assert.ok(!files.includes("AudioAmb_BattleFar.mp3"), `${key}：被顶替的旧床不下载`);
    assert.deepEqual(files.filter((f) => variantFiles.has(f)), [manifest.bedVariants[key].file], `${key}：只下载被选中的那一条`);
    assert.deepEqual(OverlayFilesToFetch(manifest, key), [], `${key}：单选没有后台下载`);
  }
  assert.equal(AmbFilesToFetch(manifest, "none").length, legacy.length - 1);
  assert.deepEqual(OverlayFilesToFetch(manifest, "legacy"), []);
});

Check("调参口默认 layered；值域合法（layered / legacy / none / A–E）", () => {
  assert.equal(BATTLE_BED_VARIANT, "layered");
  const v = String(BATTLE_BED_VARIANT);
  assert.ok(["layered", "legacy", "none"].includes(v.toLowerCase()) || KEYS.includes(v.toUpperCase()), `BATTLE_BED_VARIANT = ${JSON.stringify(BATTLE_BED_VARIANT)} 不在取值范围里`);
});

// ---------------------------------------------------------------------------
// 2. 清单与成品
// ---------------------------------------------------------------------------
const Sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

function RmsPeak(file) {
  const result = spawnSync(process.env.FFMPEG || "ffmpeg", ["-v", "error", "-i", file, "-ac", "2", "-ar", "44100", "-f", "f32le", "pipe:1"],
    { maxBuffer: 1 << 28, windowsHide: true });
  if (result.status !== 0 || !result.stdout?.length) return null;
  const b = result.stdout;
  const view = new Float32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4));
  let sum = 0, peak = 0;
  for (let i = 0; i < view.length; i += 1) { sum += view[i] * view[i]; peak = Math.max(peak, Math.abs(view[i])); }
  return { rmsDb: 10 * Math.log10(sum / view.length), peakDb: 20 * Math.log10(peak), seconds: view.length / 2 / 44100 };
}

Check("bedVariants：A–E 齐全，不混进 beds，文件存在、哈希对得上、命名规范", () => {
  assert.deepEqual(Object.keys(manifest.bedVariants).sort(), KEYS);
  assert.deepEqual(AMB_BED_VARIANTS.map((v) => v.key).sort(), KEYS, "配方表与清单一一对应");
  const bedFiles = new Set(Object.values(manifest.beds).map((b) => b.file));
  for (const key of KEYS) {
    const v = manifest.bedVariants[key];
    assert.match(v.file, /^AudioAmb_BattleFar[A-Z][A-Za-z]+\.mp3$/, `${key} 文件名 AudioAmb_BattleFar<PascalCase>.mp3`);
    assert.ok(!bedFiles.has(v.file), `${key} 不许出现在 beds 里（否则开机会下载五条）`);
    const file = path.join(AMB_DIR, v.file);
    assert.ok(fs.existsSync(file), `${key} 文件不存在：${v.file}`);
    assert.equal(Sha(file), v.sha256, `${key} 哈希与清单不符 —— 重烘后没写清单，或文件被重新编码过`);
    assert.ok(v.label && v.style, `${key} 要有一句话风格说明`);
    assert.equal(manifest.beds.battleFar.file, "AudioAmb_BattleFar.mp3", "现行 battleFar 不能动");
  }
});

Check("成品：≥ 30 s 立体声，RMS 对齐现行 battleFar，峰值有余量（量文件本身，不信清单里的数）", () => {
  const current = RmsPeak(path.join(AMB_DIR, "AudioAmb_BattleFar.mp3"));
  if (!current) { console.log("     （没有 ffmpeg，跳过量文件）"); return; }
  for (const key of KEYS) {
    const v = manifest.bedVariants[key];
    assert.ok(v.seconds >= 30 && v.channels === 2, `${key} 长度/声道：${v.seconds} s ${v.channels} ch`);
    const m = RmsPeak(path.join(AMB_DIR, v.file));
    assert.ok(Math.abs(m.seconds - v.seconds) < 0.1, `${key} 实际时长 ${m.seconds.toFixed(2)} s 与清单 ${v.seconds} 不符`);
    assert.ok(Math.abs(m.rmsDb - AMB_BED_TARGET.rmsDb) <= AMB_BED_TARGET.rmsTolDb + 0.3, `${key} RMS ${m.rmsDb.toFixed(2)} 偏离目标 ${AMB_BED_TARGET.rmsDb}`);
    assert.ok(Math.abs(m.rmsDb - current.rmsDb) <= 0.8, `${key} RMS ${m.rmsDb.toFixed(2)} 与现行 battleFar ${current.rmsDb.toFixed(2)} 差太多`);
    assert.ok(m.peakDb <= -1, `${key} 峰值 ${m.peakDb.toFixed(2)} dBFS 没有余量`);
    assert.ok(Math.abs(m.rmsDb - v.rmsDbfs) <= 0.05, `${key} 清单 rmsDbfs ${v.rmsDbfs} 与文件 ${m.rmsDb.toFixed(2)} 不符`);
  }
});

Check("人声筛查记录：五条都是 clean，并写明用了什么工具", () => {
  for (const key of KEYS) {
    const s = manifest.bedVariants[key].voiceScreen;
    assert.ok(s, `${key} 没有筛查记录`);
    assert.equal(s.verdict, "clean", `${key} 筛查结果 ${s.verdict}`);
    assert.equal(s.vad50S, 0, `${key} VAD 0.5 判语音 ${s.vad50S} s`);
    assert.ok(s.vad30S <= 0.3, `${key} VAD 0.3 判语音 ${s.vad30S} s`);
    assert.equal(s.confidentWords, 0);
    assert.match(s.tool, /Silero VAD/);
  }
});

Check("来源与许可：SeedAudio 底 + Sonniss 单发逐项写清，许可 mixed", () => {
  assert.ok(manifest.licenses.mixed, "licenses.mixed");
  for (const key of KEYS) {
    const v = manifest.bedVariants[key];
    assert.equal(v.license, "mixed");
    assert.deepEqual(v.licenses, ["volcengine", "sonniss"]);
    assert.ok(v.stems.length >= 1 && v.stems.every((s) => s.id && s.take >= 1 && /^[0-9a-f]{16}$/.test(s.sha256)), `${key} 底的来源`);
    assert.ok(v.scatter.length >= 1 && v.scatter.every((s) => s.credit && s.license && s.files.length && s.events >= 1), `${key} 撒播的来源`);
    for (const s of v.scatter) for (const f of s.files) assert.ok(fs.existsSync(path.join(HERE, f)), `${key} 撒播素材不存在：${f}`);
  }
});

// ---------------------------------------------------------------------------
// 3. 素材表
// ---------------------------------------------------------------------------
Check("每条提示词先写「没有任何人声」并列全禁止项，且只描述战场声", () => {
  assert.ok(AMB_BED_STEMS.length >= 5);
  for (const stem of AMB_BED_STEMS) {
    assert.match(stem.prompt.slice(0, 90), /没有任何人声/, `${stem.id} 开头要先写没有人声`);
    for (const word of ["喊叫", "说话", "口哨", "音乐", "笑声", "动物叫声"]) assert.ok(stem.prompt.includes(word), `${stem.id} 缺禁止项「${word}」`);
    if (/枪|机枪/.test(stem.prompt.slice(0, 60))) assert.ok(stem.prompt.includes("惨叫"), `${stem.id} 是交火场面，要禁惨叫`);
    assert.ok(stem.prompt.length > 200 && stem.prompt.length < 900, `${stem.id} 提示词长度 ${stem.prompt.length}`);
  }
});

Check("撒播单发只来自登记过的无人声 cue；配方引用的底与 take 编号都存在", () => {
  const allowed = new Set(["ambCannonFar", "rifleNraFar", "rifleIjaFar", "zb26Far", "type92Far"]);
  const stemIds = new Set(AMB_BED_STEMS.map((s) => s.id));
  for (const v of AMB_BED_VARIANTS) {
    assert.ok(v.durS >= 30, `${v.key} 时长 ${v.durS}`);
    for (const stem of v.stems) assert.ok(stemIds.has(stem.id) && stem.take >= 1, `${v.key} 引用了没有的底 ${stem.id}`);
    for (const sc of v.scatter) {
      assert.ok(allowed.has(sc.cue), `${v.key} 撒播 ${sc.id} 用了没登记的 cue ${sc.cue}`);
      assert.ok(!/crowd|moan|battleFar/i.test(sc.cue + sc.files.join()), `${v.key} 撒播里混进了人声素材`);
      assert.ok(sc.files.every((f) => fs.existsSync(path.join(HERE, f))), `${v.key} 撒播文件缺失`);
    }
  }
});

// ---------------------------------------------------------------------------
// 4. 引擎：桩 fetch + 桩 AudioContext
// ---------------------------------------------------------------------------
const { AudioEngine, AmbBedChoice, AMB_PACK_VERSION, AMBIENCE_PRESETS } = await import("./Script_Audio.mjs");
const sha1 = (bytes) => crypto.createHash("sha1").update(Buffer.from(bytes)).digest("hex");
const fileByHash = new Map();
for (const f of fs.readdirSync(AMB_DIR).filter((n) => n.endsWith(".mp3"))) fileByHash.set(sha1(fs.readFileSync(path.join(AMB_DIR, f))), f);

/** 桩：按 URL 从磁盘读文件；记下每一个请求。 */
function InstallStubs(search) {
  const requests = [];
  globalThis.fetch = async (url) => {
    const clean = String(url).split("?")[0];
    requests.push(String(url));
    const file = path.join(HERE, clean);
    if (!fs.existsSync(file)) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
    const buf = fs.readFileSync(file);
    return { ok: true, status: 200, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  };
  globalThis.location = { search, href: `http://127.0.0.1/Taierzhuang1938/index.html${search}` };
  return requests;
}
const decoded = (bytes) => ({ duration: 40, file: fileByHash.get(sha1(bytes)) || null });
const ambUrls = (requests) => requests.filter((u) => u.startsWith("Audio/Amb/")).map((u) => u.replace(/^Audio\/Amb\//, "").split("?")[0]);
const variantFiles = new Set(Object.values(manifest.bedVariants).map((v) => v.file));
const OLD = "AudioAmb_BattleFar.mp3";
const fileOf = (key) => manifest.bedVariants[key].file;

async function Scenario(search, { prefetch }) {
  const requests = InstallStubs(search);
  const engine = new AudioEngine({ enabled: true });
  engine.bedOverlayAutoLoad = false;                       // 后台装载由用例自己触发，好把「开机阻塞」与「后台」的请求分开记
  if (prefetch) await engine.PrefetchPacks();
  engine.ctx = { decodeAudioData: async (bytes) => decoded(bytes), currentTime: 0, state: "running" };
  const before = requests.length;
  await engine.LoadAmbPack("Audio/Amb/");
  const loadRequests = requests.slice(before);
  const beforeBackground = requests.length;
  const backgroundLoaded = await engine.LoadBattleOverlayBeds("Audio/Amb/");
  return { engine, requests, loadRequests, backgroundLoaded, backgroundRequests: requests.slice(beforeBackground) };
}

for (const prefetch of [false, true]) {
  const flavor = prefetch ? "开机预取后装载" : "只装载";
  await CheckAsync(`引擎（${flavor}）：默认只阻塞请求底床 A（不请求旧床、B/C/D/E）；ambReady 不等叠加素材；后台才拉 B、C、E`, async () => {
    const { engine, requests, loadRequests, backgroundLoaded, backgroundRequests } = await Scenario("", { prefetch });
    // 阻塞阶段 = 开机预取 + 解锁后装载：候选里只有 A（后台装载的请求排在最后）
    const blockingUrls = ambUrls(requests.slice(0, requests.length - backgroundRequests.length));
    assert.ok(blockingUrls.includes(fileOf("A")), "默认要请求底床 A");
    assert.ok(!blockingUrls.includes(OLD), "默认不请求旧的英语战斗人群床");
    assert.deepEqual(blockingUrls.filter((u) => variantFiles.has(u)), [fileOf("A")], `阻塞阶段请求了 ${blockingUrls.filter((u) => variantFiles.has(u))}`);
    assert.equal(engine.ambBuffers.get("battleFar")?.file, fileOf("A"), "battleFar 这个床名解码自 A");
    assert.equal(engine.ambReady, true);
    assert.deepEqual([engine.ambBedChoice.choice, engine.ambBedChoice.source, engine.ambBedChoice.mode, engine.ambBedChoice.variant],
      ["layered", "tuning", "layered", "A"]);
    assert.deepEqual(engine.ambBedChoice.overlay, ["B", "C", "E"]);
    assert.ok(engine.bedOverlaySched, "layered 有调度器");
    // 装载阶段本身一条叠加素材都没碰
    assert.ok(ambUrls(loadRequests).every((u) => !["B", "C", "E"].map(fileOf).includes(u)), "LoadAmbPack 不该装叠加素材");
    // 后台：只这三条，且各一次
    assert.equal(backgroundLoaded, 3);
    assert.deepEqual(ambUrls(backgroundRequests).sort(), ["B", "C", "E"].map(fileOf).sort(), "后台只拉 B / C / E");
    assert.deepEqual([...engine.bedOverlayBuffers.keys()].sort(), ["B", "C", "E"]);
    assert.equal(engine.bedOverlayBuffers.get("B").file, fileOf("B"), "叠加素材按键存放，内容对得上");
    assert.equal(engine.ambErrors.length, 0);
    // 其它床与一次性音一个不少
    for (const bed of Object.keys(manifest.beds).filter((b) => b !== "battleFar")) assert.ok(engine.ambBuffers.has(bed), `少了床 ${bed}`);
  });

  await CheckAsync(`引擎（${flavor}）：?ambBed=legacy 只请求旧 battleFar、一条候选都不碰、没有叠加`, async () => {
    const { engine, requests, backgroundLoaded, backgroundRequests } = await Scenario("?ambBed=legacy", { prefetch });
    const urls = ambUrls(requests);
    assert.ok(urls.includes(OLD));
    assert.ok(urls.every((u) => !variantFiles.has(u)), `legacy 请求了候选：${urls.filter((u) => variantFiles.has(u))}`);
    assert.equal(engine.ambBuffers.get("battleFar")?.file, OLD);
    assert.equal(engine.ambBedChoice.mode, "legacy");
    assert.equal(engine.bedOverlaySched, null);
    assert.equal(backgroundLoaded, 0);
    assert.deepEqual(backgroundRequests, []);
  });

  for (const key of KEYS) {
    await CheckAsync(`引擎（${flavor}）：?ambBed=${key} 只请求 ${key}、不请求旧的，登记成同名床 battleFar，没有叠加`, async () => {
      const { engine, requests, backgroundRequests } = await Scenario(`?whitebox=p012&ambBed=${key.toLowerCase()}`, { prefetch });
      const urls = ambUrls(requests);
      const want = fileOf(key);
      assert.ok(urls.includes(want), `没请求 ${want}`);
      assert.ok(!urls.includes(OLD), "旧 battleFar 被顶替后不该再请求");
      assert.deepEqual(urls.filter((u) => variantFiles.has(u)), [want], "只许请求被选中的那一条候选");
      assert.equal(engine.ambBuffers.get("battleFar")?.file, want, "battleFar 这个床名应当解码自候选");
      assert.equal(engine.ambBedChoice.variant, key);
      assert.equal(engine.ambBedChoice.mode, "variant");
      assert.equal(engine.ambBedChoice.file, want);
      assert.equal(engine.bedOverlaySched, null, "单选不叠加");
      assert.deepEqual(backgroundRequests, []);
      for (const bed of Object.keys(manifest.beds).filter((b) => b !== "battleFar")) assert.ok(engine.ambBuffers.has(bed), `少了床 ${bed}`);
    });
  }

  await CheckAsync(`引擎（${flavor}）：?ambBed=none 旧床与候选都不请求，其余床照常`, async () => {
    const { engine, requests } = await Scenario("?ambBed=none", { prefetch });
    const urls = ambUrls(requests);
    assert.ok(!urls.includes(OLD) && urls.every((u) => !variantFiles.has(u)));
    assert.equal(engine.ambBuffers.has("battleFar"), false);
    assert.equal(engine.ambBedChoice.dropped, true);
    assert.equal(engine.bedOverlaySched, null);
    for (const bed of Object.keys(manifest.beds).filter((b) => b !== "battleFar")) assert.ok(engine.ambBuffers.has(bed), `少了床 ${bed}`);
  });

  await CheckAsync(`引擎（${flavor}）：?ambBed=Z 认不出 → 退回默认 layered，不静音、不回旧床`, async () => {
    const warn = console.warn; const warned = [];
    console.warn = (...a) => warned.push(a.join(" "));
    try {
      const { engine, requests } = await Scenario("?ambBed=Z", { prefetch });
      assert.ok(ambUrls(requests).includes(fileOf("A")));
      assert.ok(!ambUrls(requests).includes(OLD));
      assert.equal(engine.ambBuffers.get("battleFar")?.file, fileOf("A"));
      assert.equal(engine.ambBedChoice.mode, "layered");
    } finally { console.warn = warn; }
    assert.ok(warned.some((w) => /ambBed/.test(w)), "认不出要吭一声");
  });
}

await CheckAsync("引擎：预取与装载用同一份计划（预取过的字节被装载用掉，不重复请求）", async () => {
  const { loadRequests } = await Scenario("?ambBed=C", { prefetch: true });
  // 装载阶段只应再要清单（清单预取后留在表里也可能被用掉），不应再去要床文件
  assert.ok(ambUrls(loadRequests).every((u) => !/\.mp3$/.test(u)), `装载阶段又请求了 mp3：${ambUrls(loadRequests)}`);
  const layered = await Scenario("", { prefetch: true });
  assert.ok(ambUrls(layered.loadRequests).every((u) => !/\.mp3$/.test(u)), `layered 装载阶段又请求了 mp3：${ambUrls(layered.loadRequests)}`);
});

await CheckAsync("引擎：默认装载完排了一次后台装载（不在 LoadAmbPack 里拉），排的是 ambReady 之后；B / C / E 没到之前 ambReady 已经是 true", async () => {
  const requests = InstallStubs("");
  const engine = new AudioEngine({ enabled: true });
  engine.ctx = { decodeAudioData: async (bytes) => decoded(bytes), currentTime: 0, state: "running" };
  assert.equal(engine.bedOverlayAutoLoad, true);
  const n = await engine.LoadAmbPack("Audio/Amb/");
  assert.ok(n > 0 && engine.ambReady);
  assert.equal(engine.bedOverlayQueued, true, "排了一次后台装载");
  assert.equal(engine.bedOverlayBuffers.size, 0, "LoadAmbPack 返回时叠加素材还没装");
  assert.ok(ambUrls(requests).every((u) => !["B", "C", "E"].map(fileOf).includes(u)), "排队期间没有请求叠加素材");
  assert.equal(engine.QueueBedOverlayLoad(), false, "已经排了不重复排");
  for (const t of engine.timers) clearTimeout(t);         // 不真等 loadDelayS
  engine.timers.clear();
  // 已经装齐就不再排
  await engine.LoadBattleOverlayBeds("Audio/Amb/");
  engine.bedOverlayQueued = false;
  assert.equal(engine.BedOverlayIncomplete(), false);
  assert.equal(engine.QueueBedOverlayLoad(), false);
});

await CheckAsync("引擎：后台装载失败只进 ambErrors、不抛、不影响底床；补拉只补没装成的", async () => {
  const requests = InstallStubs("");
  const engine = new AudioEngine({ enabled: true });
  engine.bedOverlayAutoLoad = false;
  engine.ctx = { decodeAudioData: async (bytes) => decoded(bytes), currentTime: 0, state: "running" };
  await engine.LoadAmbPack("Audio/Amb/");
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => (String(url).includes(fileOf("C")) ? { ok: false, status: 503, arrayBuffer: async () => new ArrayBuffer(0) } : realFetch(url));
  const got = await engine.LoadBattleOverlayBeds("Audio/Amb/");
  assert.equal(got, 2);
  assert.deepEqual([...engine.bedOverlayBuffers.keys()].sort(), ["B", "E"]);
  assert.ok(engine.ambErrors.some((e) => e.file === fileOf("C")), "失败记进 ambErrors");
  assert.equal(engine.ambReady, true);
  assert.equal(engine.BedOverlayIncomplete(), true);
  globalThis.fetch = realFetch;
  const before = requests.length;
  assert.equal(await engine.LoadBattleOverlayBeds("Audio/Amb/"), 1);
  assert.deepEqual(ambUrls(requests.slice(before)), [fileOf("C")], "补拉只请求没装成的那一条");
});

Check("环境预设一个字没改：所有 battleFar 层仍是 { bed: \"battleFar\" }（没有 overlay / 候选床名），叠加靠宿主层 + 调度器", () => {
  let layers = 0;
  for (const [name, cfg] of Object.entries(AMBIENCE_PRESETS)) {
    for (const layer of cfg.layers || []) {
      assert.ok(!/^battleFar[A-Z]/.test(layer.bed), `${name} 引用了候选床名 ${layer.bed}`);
      assert.ok(!("overlay" in layer), `${name} 的 ${layer.bed} 层不该写 overlay（默认全带，写 false 才是排除）`);
      if (layer.bed === "battleFar") layers += 1;
    }
  }
  assert.ok(layers >= 8, `battleFar 层只有 ${layers} 条，预设被改过？`);
  assert.equal(AmbBedChoice(manifest, "?ambBed=A").choice, "A");
  assert.equal(AmbBedChoice(manifest, "").choice, "layered");
  assert.equal(AmbBedChoice(manifest, "?ambBed=legacy").choice, "legacy");
  assert.match(AMB_PACK_VERSION, /battlebeds/, "清单加了 bedVariants，缓存戳要抬");
});

console.log(failed ? `\n${failed} 项失败` : "\n全部通过");
process.exit(failed ? 1 : 0);
