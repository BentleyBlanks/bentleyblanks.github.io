// 配音自检闸门：真浏览器、真 decodeAudioData、真 Bark 节流、真打六十秒看有没有人喊。
//
// 单独成文件而不是并进 Script_PlayTest：那一趟要跑十几分钟，而配音这几条一分半就跑完 ——
// 改声库的时候没人愿意为了验一句喊话等十五分钟。
//   node Taierzhuang1938/Script_VoiceTest.mjs
//
// 注意 URL **不能带 ?shot=1**：出图模式下 AudioEngine 是 enabled:false 的，
// 整个 AudioContext 都不会建，六条断言会全部以「载入 0 条」的形式假失败。
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const server = await ServeRoot(path.resolve(projectDir, ".."), 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

let pass = 0, fail = 0;
const Check = (name, ok, note = "") => {
  console.log((ok ? "ok   " : "FAIL ") + name + (note ? "  — " + note : ""));
  ok ? (pass += 1) : (fail += 1);
};
page.on("console", (m) => { if (m.type() === "error") console.log("  [console] " + m.text()); });
page.on("pageerror", (e) => console.log("  [pageerror] " + String(e).slice(0, 200)));

// menu=0：跳过主菜单，进页面就是这一关（菜单会盖住 #bootStart，而这一节要点它）
await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?phase=0&quality=medium&scale=small&menu=0`,
  { waitUntil: "load", timeout: 120000 });
await page.waitForFunction(() => window.Taierzhuang && window.Taierzhuang.audio, { timeout: 180000 });
// 真点一下：没有用户手势时 AudioContext 是 suspended 的
await page.click("#bootStart").catch(() => {});
await page.evaluate(() => window.Taierzhuang.audio.Unlock());
await page.waitForFunction(
  () => window.Taierzhuang.audio.voiceBank.size > 0
     || (window.Taierzhuang.audio.voiceErrors || []).length > 0,
  { timeout: 180000 }).catch(() => {});

const r = await page.evaluate(() => {
  const A = window.Taierzhuang.audio;
  const bank = [...A.voiceBank.values()];
  // 先清闸：页面已经在跑，场上 AI 随时可能刚喊过一句把全局闸占住，
  // 不清零的话这条用例会随机红 —— 测的是节流逻辑，不是运气。
  A.lastBarkAt = -99; A.lastBarkKindAt.clear();
  const first = A.Bark("rally", { seed: 1 });        // 连着两句，第二句必须被吃掉
  const second = A.Bark("rally", { seed: 2 });
  A.lastBarkAt = -99; A.lastBarkKindAt.clear();
  const keyed = A.Bark("rally", { key: "rally_hold", priority: true });
  return {
    size: A.voiceBank.size,
    errors: (A.voiceErrors || []).map((e) => e.file + ": " + e.message).slice(0, 5),
    kinds: bank.reduce((m, e) => (m[e.kind] = (m[e.kind] || 0) + 1, m), {}),
    durations: bank.map((e) => +e.duration.toFixed(2)),
    hasIja: bank.some((e) => e.kind === "ija"),
    // 阵营两套并存：中方 side 缺省（兼容默认 nra），日方显式 side:"ija"
    nra: bank.filter((e) => (e.side || "nra") === "nra").length,
    ija: bank.filter((e) => e.side === "ija").length,
    // 日方 text 必须是纯假名。写成汉字的「突撃！」会被 seed-audio 当中文读 ——
    // 实测出来是中文的两个音节，而假名版是四拍日语。
    ijaWithHanzi: bank.filter((e) => e.side === "ija" && /[一-鿿]/.test(e.text))
      .map((e) => e.key),
    ijaKinds: bank.filter((e) => e.side === "ija")
      .reduce((a, e) => { a[e.kind] = (a[e.kind] || 0) + 1; return a; }, {}),
    // 神剧红线：一句「バカヤロー」都不许有
    ijaBaka: bank.filter((e) => e.side === "ija" && /バカ|ばか|やろ|ヤロ/.test(e.text))
      .map((e) => e.key),
    firstOk: !!first, secondBlocked: !second, keyedOk: !!keyed,
    ctxState: A.ctx && A.ctx.state,
  };
});
// event 句有前提条件（滕县日军无战车、有枪的兵不该喊"手榴弹！莫得了！"），
// 不许被同类随机抽中 —— 这道闸的价值是「漏配就不喊」而不是「漏配就乱喊」。
// 方言抽查用零件表而不是逐句比对：改一句文本不该让用例红掉，
// 但整批退回普通话必须红。
Object.assign(r, await page.evaluate(() => {
  const A = window.Taierzhuang.audio;
  const bank = [...A.voiceBank.values()];
  const evKeys = new Set(bank.filter((e) => e.event).map((e) => e.key));
  let leaked = 0;
  for (const kind of ["spot", "ammo", "move", "rally", "warn", "hurt"]) {
    for (const e of bank) if (e.kind === kind && !e.event && evKeys.has(e.key)) leaked += 1;
  }
  // 真跑一遍 Bark：event 句一次都不该出现在随机挑选的结果里
  const picked = new Set();
  for (let i = 0; i < 240; i += 1) {
    A.lastBarkAt = -99; A.lastBarkKindAt.clear();
    const kind = ["spot", "ammo", "move", "rally"][i % 4];
    const before = A.playCounter;
    const v = A.Bark(kind, { seed: i });
    if (v) picked.add(A.lastBarkPickKey || "");
  }
  // 零件表里**语法件**（补语「起」「到起」「到」、否定「莫」、被动「遭」）比词汇件更要紧：
  // 光换词、语法还是普通话骨架的话，出来就是「普通话演员念台词本」。
  const zh = /莫|咯|到起|遭|不得|匀|拢|弟兄伙|哪个|挂彩|龟儿|一哈|歇气|手边|爬上|钻进|上起|躲起|跟到/;
  return {
    eventLeak: leaked,
    dialectHits: bank.filter((e) => zh.test(e.text)).length,
    eventCount: evKeys.size,
  };
}));

// 序章配音资产是时间轴契约：18 句对白只占 11 个 cue；1:08—1:30 的八句必须
// 由一个连续 SeedAudio 1.0 场景文件承载，不能被误拆成八条独立 TTS。
const PROLOGUE_EXPECTED = [
  ["prologue_young_dispatch_01", "年轻传令兵", "AudioSfx_PrologueVoiceYoungDispatch_01.mp3", "我们出川好久了哦。"],
  ["prologue_old_wound_01", "旧伤士兵", "AudioSfx_PrologueVoiceOldWound_01.mp3", "路莫问，跟到走就是。"],
  ["prologue_young_dispatch_02", "年轻传令兵", "AudioSfx_PrologueVoiceYoungDispatch_02.mp3", "我都忘了屋头腊肉是啥味道了。"],
  ["prologue_machine_gunner_01", "机枪手", "AudioSfx_PrologueVoiceMachineGunner_01.mp3", "你娃儿还惦记腊肉。"],
  ["prologue_young_dispatch_03", "年轻传令兵", "AudioSfx_PrologueVoiceYoungDispatch_03.mp3", "不惦记吃的惦记啥子嘛。"],
  ["prologue_machine_gunner_02", "机枪手", "AudioSfx_PrologueVoiceMachineGunner_02.mp3", "到了前头，有热水喝你就谢天谢地。"],
  ["prologue_rifleman_01", "擦枪士兵", "AudioSfx_PrologueVoiceRifleman_01.mp3", "又卡。"],
  ["prologue_old_wound_02", "旧伤士兵", "AudioSfx_PrologueVoiceOldWound_02.mp3", "你少骂两句，它兴许听话点。"],
  ["prologue_old_wound_03", "旧伤士兵", "AudioSfx_PrologueVoiceOldWound_03.mp3", "近咯。"],
  ["prologue_motivation_01", "班长与众人", "AudioSfx_PrologueVoiceMotivation_04.mp3", "班长（洪亮、逐句升温）：这次你们去啊。出川，晓不晓得啊？\n众人（十到十二名十七八岁男兵自然错拍、斗志昂扬）：我们晓得。打日本！\n班长（短促有力）：去死，怕不怕？\n众人（两三人先起、其余瞬间压上）：不怕！\n班长（继续逼问）：为啥子不怕？\n众人（年轻声线自然重叠、满腔热血）：我们要保护我们的国家！\n班长（哽咽一瞬）：好样的。\n班长（洪亮坚决地命令）：都把东西带好。前头就是滕县。"],
  ["prologue_external_officer_01", "车外军官", "AudioSfx_PrologueVoiceExternalOfficer_01.mp3", "通信排，下车！线盘背起，搞快！"],
];
const prologue = await page.evaluate(async () => {
  const mod = await import("./Data_Voice.mjs");
  const cutMod = await import("./Data_CutsceneChuchuan.mjs");
  const bank = new Map([...window.Taierzhuang.audio.voiceBank.values()].map((e) => [e.key, e]));
  const assets = mod.VOICE_LINES.filter((e) => e.prologue).map((e) => {
    const loaded = bank.get(e.key) || {};
    return { key: e.key, role: e.role, file: e.file, text: e.text, duration: loaded.duration || 0,
      backend: e.backend, provider: e.provider, promptMode: e.promptMode, lineCount: e.lineCount || 1 };
  });
  const dialogue = cutMod.CS_Chuchuan.shots.flatMap((shot) => (shot.lines || []).map((line) => ({ shot: shot.n, ...line })));
  const motivation = dialogue.filter((line) => line.shot === 6);
  return { assets, dialogueCount: dialogue.length, motivation: motivation.map((line) => ({ who: line.who, voiceCue: line.voiceCue || null, text: line.text })) };
});
const assets = prologue.assets;
const prologueShape = assets.length === PROLOGUE_EXPECTED.length
  && assets.every((e, i) => e.key === PROLOGUE_EXPECTED[i][0] && e.role === PROLOGUE_EXPECTED[i][1]
    && e.file === PROLOGUE_EXPECTED[i][2] && e.text === PROLOGUE_EXPECTED[i][3]);
const prologueDurOk = assets.every((e) => e.duration >= 0.45
  && (e.promptMode === "continuousScene" ? e.duration <= 22.5 : e.duration <= 5.2));
Check("序章 18 句对白恰好映射为 11 个 cue，且 cue/file/角色/文本逐条匹配", prologueShape && prologue.dialogueCount === 18,
  `资产 ${assets.length} 个 / 对白 ${prologue.dialogueCount} 句${prologueShape ? "" : "，期望顺序或字段不匹配"}`);
Check("序章单句 cue 在 0.45—5.2 s，连续动员 cue 不超过 22.5 s", prologueDurOk,
  `时长 ${assets.map((e) => e.duration.toFixed(2)).join("/")}`);
const seedOnly = assets.every((e) => e.backend === "seedaudio1.0" && e.provider === "volcengine");
Check("序章全部配音资产锁定火山引擎 SeedAudio 1.0，不允许 Lovart、Qwen 或系统朗读回退", seedOnly,
  assets.map((e) => `${e.key}:${e.provider || "缺失"}/${e.backend || "缺失"}`).join(" "));
const motivationContinuous = prologue.motivation.length === 8
  && prologue.motivation[0].voiceCue === "prologue_motivation_01"
  && prologue.motivation.slice(1).every((line) => line.voiceCue === null)
  && assets.find((e) => e.key === "prologue_motivation_01")?.promptMode === "continuousScene"
  && assets.find((e) => e.key === "prologue_motivation_01")?.lineCount === 8;
Check("1:08—1:30 八句只触发一个连续音频 cue", motivationContinuous,
  prologue.motivation.map((line) => `${line.who}:${line.voiceCue || "字幕"}`).join(" / "));

Check("配音全部解码成功（一条都不许静默丢）", r.size >= 30 && r.errors.length === 0,
  `载入 ${r.size} 条，错误 ${r.errors.length} 条${r.errors.length ? "：" + r.errors.join(" / ") : ""}`);
Check("六类口令齐全（kill 那一类已删：喊「打中了」等于把 hitmarker 用嘴说了一遍）",
  Object.keys(r.kinds).length >= 6, JSON.stringify(r.kinds));
// 这条断言原来是「日语不许混进来」—— 那是还没有日方声库时的写法，
// 而且它查的是 kind === "ija"，现在日方是 side 不是 kind，等于恒真。
// 日方声库已经做好了（20 句纯假名），该验的变成了三件事：两边都在、不串味、不神剧。
Check("中日两套声库都在，且按 side 分开",
  r.nra >= 30 && r.ija >= 18, `中方 ${r.nra} 条 / 日方 ${r.ija} 条`);
Check("日方文本是纯假名（写成汉字会被 seed-audio 当中文读）",
  r.ijaWithHanzi.length === 0,
  r.ijaWithHanzi.length ? "含汉字：" + r.ijaWithHanzi.join(" ") : "零汉字，正确");
Check("日方六类齐全（少一类就会复读）",
  Object.keys(r.ijaKinds).length >= 6, JSON.stringify(r.ijaKinds));
Check("没有「バカヤロー」及其变体（抗日神剧的头号标志，黑名单第一条）",
  r.ijaBaka.length === 0, r.ijaBaka.length ? "命中：" + r.ijaBaka.join(" ") : "干净");
const battleDurations = await page.evaluate(() => [...window.Taierzhuang.audio.voiceBank.values()]
  .filter((e) => !e.prologue).map((e) => e.duration));
Check("战斗 Bark 仍在 0.3—2.6 s（序章对白使用独立时长闸）",
  battleDurations.every((d) => d > 0.3 && d < 2.6),
  `战斗最长 ${Math.max(...battleDurations).toFixed(2)}s，最短 ${Math.min(...battleDurations).toFixed(2)}s`);
const cross = await page.evaluate(() => {
  const A = window.Taierzhuang.audio;
  const bank = [...A.voiceBank.values()];
  const sideOf = new Map(bank.map((e) => [e.key, e.side || "nra"]));
  const KINDS = ["rally", "spot", "warn", "ammo", "hurt", "move"];
  let nraPicks = 0, nraOk = 0, ijaPicks = 0, ijaOk = 0, bad = 0;
  const samples = [];
  for (let i = 0; i < 60; i += 1) {
    for (const side of ["nra", "ija"]) {
      A.lastBarkAt = -99; A.lastBarkKindAt.clear();
      const before = new Set(A.lastPlayAt ? [...A.lastPlayAt.keys()] : []);
      const v = A.Bark(KINDS[i % KINDS.length], { seed: i * 7 + 1, side });
      if (!v) continue;
      // 找出这一次新播的那条 voice.*
      let picked = null;
      if (A.lastPlayAt) {
        for (const k of A.lastPlayAt.keys()) {
          if (k.startsWith("voice.") && !before.has(k)) picked = k.slice(6);
        }
      }
      if (!picked) continue;
      const got = sideOf.get(picked) || "nra";
      if (side === "nra") { nraPicks += 1; if (got === "nra") nraOk += 1; }
      else { ijaPicks += 1; if (got === "ija") ijaOk += 1; }
      if (got !== side) { bad += 1; if (samples.length < 4) samples.push(`${side}->${picked}`); }
    }
  }
  return { nraPicks, nraOk, ijaPicks, ijaOk, bad, samples };
});
// 挑错阵营 = 日本兵喊中文（或反过来），比没有配音更糟。
// 这条直接查 Bark 的挑选池，不靠随机抽样撞运气。
// 挑错阵营 = 日本兵喊中文（或反过来），比没有配音更糟。
// 不查池子的静态属性，直接**调 Bark 六十次看实际播出来的是谁** ——
// 上一版我按池子的静态判据写，写出了一个恒假的表达式，测了个寂寞。
Check("Bark 按阵营挑，不串味（两边各喊 60 次，看实际播出来的那条属于谁）",
  cross.bad === 0,
  `中方喊 ${cross.nraPicks} 次全是中方 ${cross.nraOk}、日方喊 ${cross.ijaPicks} 次全是日方 ${cross.ijaOk}`
  + (cross.bad ? `　串味 ${cross.bad} 次：${cross.samples.join(" ")}` : ""));
Check("event 句被挡在随机挑选之外（滕县无战车，不许有人随口喊「战车碾拢来了」）",
  r.eventLeak === 0 && r.eventCount >= 5,
  "event 句 " + r.eventCount + " 条，泄漏进随机池 " + r.eventLeak + " 条");
Check("文本是四川话不是普通话（方言零件抽查）",
  r.dialectHits >= 20,
  "31 句里带方言零件（莫/咯/到起/遭/不得/匀/拢/弟兄伙…）的有 " + r.dialectHits + " 句");
// 响度与底噪：直接量**引擎解出来的那份 AudioBuffer**，不是量磁盘上的文件 ——
// 要管的就是「播出来一样响吗」。这两条是用户听出来之后补的闸：
//   · 音量不齐，玩家会把「那一条烘得轻」听成「那个人离得远」，
//     而远近**只该由距离衰减与遮挡决定**。
//   · seedaudio 偶尔自带一层房间声/风声，混在战场上就是有人在别的场景里喊话。
const mix = await page.evaluate(async () => {
  const A = window.Taierzhuang.audio;
  const voice = await import("./Data_Voice.mjs");
  const sampled = new Set(voice.VOICE_LINES.filter((l) => l.sample).map((l) => l.key));
  const out = [];
  // voiceBank 只存元数据，解好的缓冲藏在配方闭包里取不到 —— 重新 fetch 一遍最省事
  for (const line of voice.VOICE_LINES) {
    const res = await fetch(voice.VOICE_BASE + line.file);
    const pcm = await A.ctx.decodeAudioData(await res.arrayBuffer());
    const d = pcm.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < d.length; i += 1) peak = Math.max(peak, Math.abs(d[i]));
    const n = Math.round(pcm.sampleRate * 0.02);
    const frames = [];
    for (let f = 0; (f + 1) * n <= d.length; f += 1) {
      let s = 0;
      for (let i = 0; i < n; i += 1) { const v = d[f * n + i]; s += v * v; }
      frames.push(Math.sqrt(s / n));
    }
    const voiced = frames.filter((v) => v >= peak * 0.1);
    const rms = voiced.length ? Math.sqrt(voiced.reduce((a, v) => a + v * v, 0) / voiced.length) : 0;
    const sorted = frames.slice().sort((a, b) => a - b);
    out.push({
      key: line.key, sampled: sampled.has(line.key),
      rms: 20 * Math.log10(rms + 1e-9),
      floor: 20 * Math.log10(sorted[Math.floor(sorted.length * 0.08)] + 1e-9),
    });
  }
  return out;
});
const rmsVals = mix.map((m) => m.rms);
const spread = Math.max(...rmsVals) - Math.min(...rmsVals);
Check("整批音量一致（散布 ≤ 2.5 dB；远近交给距离衰减，不许由文件音量代劳）",
  spread <= 2.5,
  `有声段 RMS ${Math.min(...rmsVals).toFixed(1)} … ${Math.max(...rmsVals).toFixed(1)} dB，`
  + `散布 ${spread.toFixed(1)} dB`);
// 实录那条（惨叫）的「底噪」量到的是它自己的衰减尾巴，豁免。
// 这只是 20 ms 幅度分位烟测，不是 VAD：短促、没有停顿的低声对白会把最轻的
// 人声尾音量成约 -36…-39 dB。把失败线放在 -35 dB，仍会抓住此前确实带房间声的
// -18.7 dB 坏 take，同时不靠给短句硬塞静音来“过测试”。
const noisy = mix.filter((m) => !m.sampled && m.floor > -35);
Check("没有自带环境音（TTS 偶尔会附一层房间声/风声，混在战场上就是穿帮）",
  noisy.length === 0,
  noisy.length ? noisy.map((m) => `${m.key} ${m.floor.toFixed(0)}dB`).join(" ")
    : `最吵的一条 ${Math.max(...mix.filter((m) => !m.sampled).map((m) => m.floor)).toFixed(0)} dB`);

Check("节流生效：连着两句只出一句（五十个人不能同时喊卧倒）", r.firstOk && r.secondBlocked,
  `第一句${r.firstOk ? "出" : "没出"}，第二句${r.secondBlocked ? "被吃掉" : "也出了"}`);
Check("指定 key 能喊到那一句（下命令不能从 rally 里随便挑）", r.keyedOk, "rally_hold");

// 真打起来会不会喊 —— 上面几条只证明「声库能放」，不证明「战场上真的接上了」。
// 这是最容易漏的一段：系统建好了但没接线，这个项目里已经发生过好几次
// （Data_Script 没被 import、拉栓音效的配方从没被播过、LOADOUTS 整张表是死的）。
const live = await page.evaluate(() => {
  const T = window.Taierzhuang, A = T.audio;
  const heard = new Set();
  const orig = A.Play.bind(A);
  A.Play = (name, opts) => { if (String(name).startsWith("voice.")) heard.add(name); return orig(name, opts); };
  for (let i = 0; i < 3600; i += 1) T.StepFrames(1);   // 六十秒真战斗
  A.Play = orig;
  return { heard: [...heard], alive: T.ai.soldiers.filter((s) => s.alive).length };
});
const kindsHeard = new Set(live.heard.map((n) => n.split(".")[1].split("_")[0]));
Check("真打起来会喊：六十秒战斗里至少响过三类口令", kindsHeard.size >= 3,
  `响过 ${live.heard.length} 句 / ${kindsHeard.size} 类：`
  + `${live.heard.map((n) => n.slice(6)).join(" ")}（场上 ${live.alive} 人）`);

console.log(`\n配音自检：${pass}/${pass + fail} 过（AudioContext=${r.ctxState}）`);
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
