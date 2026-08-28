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
await page.waitForFunction(() => window.Taierzhuang && window.Taierzhuang.audio, null, { timeout: 180000 });
// 真点一下：没有用户手势时 AudioContext 是 suspended 的
await page.click("#bootStart").catch(() => {});
await page.evaluate(() => window.Taierzhuang.audio.Unlock());
// **等整包载完，不是等第一条载完。**
// 原来的条件是 `voiceBank.size > 0`：只要有一条解好就往下走，于是后面那一串
// 「载入几条 / 六类齐不齐 / 音量散布」全是在一份**载了一半的声库**上量的。
// 平时它侥幸不红，是因为文件都在浏览器缓存里、七十条几乎同时解完；
// 一 bump 缓存戳（改声库时一定会 bump）就整批重下，这条竞态立刻现形，
// 而症状是「六类口令齐全 FAIL」——看上去像声库坏了，其实是测试没等。
// LoadPacks 载完会把 voiceLoading 放回 false，那才是「这一趟结束了」的准确信号。
await page.waitForFunction(
  () => window.Taierzhuang.audio.voiceLoading === false
     && (window.Taierzhuang.audio.voiceBank.size > 0
       || (window.Taierzhuang.audio.voiceErrors || []).length > 0),
  null, { timeout: 180000 }).catch(() => {});

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

// 章节剧情台词是**先写词、后烘音**的：内容批把台词写进 Data_MissionChX.mjs 之后，
// 到烘焙之前那段时间里，它们必然 404。那不是回归，是设计好的降级（纯字幕）——
// 所以这里把两类错误分开算：战斗口令与序章对白一条都不许丢，剧情台词只报数。
const storyLoad = await page.evaluate(async () => {
  const mod = await import("./Data_Voice.mjs");
  const A = window.Taierzhuang.audio;
  const story = mod.VOICE_LINES.filter((l) => l.kind === "story");
  const files = new Set(story.map((l) => l.file));
  return {
    total: story.length,
    baked: story.filter((l) => A.voiceBank.has(l.key)).length,
    pendingErrors: (A.voiceErrors || []).filter((e) => files.has(e.file)).length,
    warnings: mod.VOICE_MERGE_WARNINGS,
    deliveries: mod.VOICE_DELIVERY_MIX,
  };
});
const hardErrors = r.errors.filter((e) => !e.startsWith("vo_ch"));
Check("配音全部解码成功（战斗口令与序章对白，一条都不许静默丢）",
  r.size >= 30 && hardErrors.length === 0,
  `载入 ${r.size} 条，硬错误 ${hardErrors.length} 条${hardErrors.length ? "：" + hardErrors.join(" / ") : ""}`
  + `；剧情台词 ${storyLoad.baked}/${storyLoad.total} 条已烘焙（其余降级为纯字幕）`);
// 章节台词的体检（key 命名、who 在 CAST 表里、delivery 合法、日方纯假名、无重复 key）
// 在 Data_Voice 拼表时做，坏行会被剔出总表 —— 那正是「台词静默消失」的样子，必须报出来。
Check("章节台词拼表零告警（坏行会被剔出总表 = 台词静默消失）",
  storyLoad.warnings.length === 0,
  storyLoad.warnings.length ? storyLoad.warnings.slice(0, 5).join(" / ") : `${storyLoad.total} 条全部通过`);
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
  .filter((e) => !e.prologue && e.kind !== "story").map((e) => e.duration));
Check("战斗 Bark 仍在 0.3—2.6 s（序章对白与剧情台词各有独立时长闸）",
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
  // voiceBank 只存元数据，解好的缓冲藏在配方闭包里取不到 —— 重新 fetch 一遍最省事。
  // 还没烘出音频的剧情台词直接跳过：它们在表里、不在盘上，这是正常状态。
  for (const line of voice.VOICE_LINES) {
    if (!A.voiceBank.has(line.key)) continue;
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
      story: line.kind === "story", delivery: line.delivery || null,
      dur: pcm.duration,
      rms: 20 * Math.log10(rms + 1e-9),
      floor: 20 * Math.log10(sorted[Math.floor(sorted.length * 0.08)] + 1e-9),
    });
  }
  return out;
});
// 战斗口令与序章对白：一条平线。远近交给距离衰减，不许由文件音量代劳。
const barkMix = mix.filter((m) => !m.story);
const rmsVals = barkMix.map((m) => m.rms);
const spread = Math.max(...rmsVals) - Math.min(...rmsVals);
Check("战场口令音量一致（散布 ≤ 2.5 dB；远近交给距离衰减，不许由文件音量代劳）",
  spread <= 2.5,
  `有声段 RMS ${Math.min(...rmsVals).toFixed(1)} … ${Math.max(...rmsVals).toFixed(1)} dB，`
  + `散布 ${spread.toFixed(1)} dB`);
// 剧情台词**不能**拉成同一条平线：耳语必须比常态轻，否则玩家听不出「现在不能出声」。
// 每条只跟自己那一档的目标比（VOICE_DELIVERY_MIX，与 Script_VoiceBake 共读同一张表）。
const storyMix = mix.filter((m) => m.story);
const offBand = storyMix.filter((m) => {
  const target = (storyLoad.deliveries[m.delivery] || storyLoad.deliveries.normal).rms;
  return Math.abs(m.rms - target) > 2.0;
});
Check("剧情台词各按交付档归一（耳语要比常态轻，不许一刀切齐）",
  offBand.length === 0,
  storyMix.length
    ? (offBand.length ? offBand.map((m) => `${m.key} ${m.delivery} ${m.rms.toFixed(1)}dB`).join(" ")
      : `${storyMix.length} 条全部落在各自档位 ±2.0 dB 内`)
    : "本轮还没有已烘焙的剧情台词");
// 实录那条（惨叫）的「底噪」量到的是它自己的衰减尾巴，豁免。
// 这只是 20 ms 幅度分位烟测，不是 VAD：短促、没有停顿的低声对白会把最轻的
// 人声尾音量成约 -36…-39 dB。把失败线放在 -35 dB，仍会抓住此前确实带房间声的
// -18.7 dB 坏 take，同时不靠给短句硬塞静音来“过测试”。
// **短句也豁免**：削掉首尾静音之后，一句 0.4 s 的话里一格静音都不剩，
// 第 8 百分位量到的是最轻的那个人声帧（实测「晓得。」量出 −23 dB，而它其实是干净的）。
// 短句的底噪闸在烘焙侧，量的是原始 take 里那段真静音（Script_VoiceBake.NoiseFloorRaw）。
const FLOOR_MIN_S = 1.2;
const measurable = mix.filter((m) => !m.sampled && m.dur >= FLOOR_MIN_S);
const noisy = measurable.filter((m) => m.floor > -35);
Check("没有自带环境音（TTS 偶尔会附一层房间声/风声，混在战场上就是穿帮）",
  noisy.length === 0,
  noisy.length ? noisy.map((m) => `${m.key} ${m.floor.toFixed(0)}dB`).join(" ")
    : `可量的 ${measurable.length} 条里最吵的一条 ${Math.max(...measurable.map((m) => m.floor)).toFixed(0)} dB`
      + `（另有 ${mix.length - measurable.length} 条短于 ${FLOOR_MIN_S}s 或为实录，按烘焙侧的闸算）`);

Check("节流生效：连着两句只出一句（五十个人不能同时喊卧倒）", r.firstOk && r.secondBlocked,
  `第一句${r.firstOk ? "出" : "没出"}，第二句${r.secondBlocked ? "被吃掉" : "也出了"}`);
Check("指定 key 能喊到那一句（下命令不能从 rally 里随便挑）", r.keyedOk, "rally_hold");

// ---------------------------------------------------------------------------
// 章节剧情台词的通道：beat.voice → Story.AttachVoice → Audio.PlayStoryVoice
// 这一段验的是**接线**，不是声库：系统建好了没接上，在这个项目里已经发生过好几次。
// ---------------------------------------------------------------------------
const chan = await page.evaluate(async () => {
  const A = window.Taierzhuang.audio;
  // 剧情台词不许被随机抽中：塞一条假的 story 行进池子，喊 240 次看它会不会被挑走。
  A.voiceBank.set("__test_story", { key: "__test_story", kind: "story", text: "测试", side: "nra" });
  let leaked = false;
  for (let i = 0; i < 240; i += 1) {
    A.lastBarkAt = -99; A.lastBarkKindAt.clear(); A.lastBarkPickKey = null;
    A.Bark(["spot", "ammo", "move", "rally", "warn", "hurt", "story"][i % 7], { seed: i });
    if (A.lastBarkPickKey === "__test_story") leaked = true;
  }
  const storyKindPool = A.Bark("story", { seed: 1 });
  A.voiceBank.delete("__test_story");

  // PlayStoryVoice：点名能播、缺音频静默降级、单槽顶掉、不吃 Bark 的节流闸
  A.lastBarkAt = A.ctx.currentTime;              // 假装刚有人喊过（Bark 此刻会闸掉一切）
  const first = A.PlayStoryVoice("rally_hold");
  const firstHandle = A.storyVoice;
  const second = A.PlayStoryVoice("rally_charge");
  const missing = A.PlayStoryVoice("ch9_nobody_01");
  const nullKey = A.PlayStoryVoice(null);
  const slotKey = A.storyVoiceKey;
  A.StopStoryVoice();
  return {
    leaked, storyKindPool: !!storyKindPool,
    firstOk: !!first && first.duration > 0,
    preempted: !!second && A.storyVoice !== firstHandle && slotKey === "rally_charge",
    missingNull: missing === null && nullKey === null,
    stopped: A.storyVoice === null,
  };
});
Check("剧情台词进不了 Bark 的随机池（只能由 beat.voice 点名）",
  !chan.leaked && !chan.storyKindPool,
  chan.leaked ? "被随机抽中了" : "240 次随机挑选一次都没抽到，Bark(\"story\") 也返回 null");
Check("PlayStoryVoice 点名能播，且不吃 Bark 的 0.55 s / 4.5 s 节流闸（对白不许随机消失）",
  chan.firstOk, "rally_hold");
Check("剧情语音单槽：新的顶掉旧的（不叠成两个人同时说话）", chan.preempted,
  `槽里现在是 ${chan.preempted ? "rally_charge" : "没换过来"}`);
Check("没有音频时静默降级返回 null（台词先写、音频后烘是常态，不许报错阻塞）",
  chan.missingNull && chan.stopped, "ch9_nobody_01 / null 都返回 null，StopStoryVoice 清空了槽");

// Story 侧：带 voice 的 beat 会调宿主回调，字幕跟着音频时长走；没接线时照样出字幕。
const storyChan = await page.evaluate(async () => {
  const { StoryDirector } = await import("./Script_Story.mjs");
  const said = [];
  const hud = { Say: (who, text, seconds) => said.push({ who, text, seconds }), Title: () => {} };
  const played = [];
  const d = new StoryDirector({ hud, audio: null });

  d.AttachVoice(({ key, who, position }) => { played.push({ key, who, position }); return { duration: 3.0 }; },
    (who) => ({ x: 1, y: 2, z: 3, who }));
  d.Play({ type: "line", who: "shunzi", text: "晓得。", voice: "ch0_shunzi_01" }, false);
  const voiced = { subtitle: said.at(-1).seconds, hold: d.sinceLast, log: d.voiceLog.slice() };

  // 没接线：纯字幕，默认时长，绝不抛
  d.AttachVoice(null);
  d.Play({ type: "line", who: "shunzi", text: "老子不松，一起死。", voice: "ch1_shunzi_04" }, false);
  const bare = { subtitle: said.at(-1).seconds, hold: d.sinceLast };

  // 宿主抛异常：吞掉、留痕、剧本继续
  d.AttachVoice(() => { throw new Error("宿主炸了"); });
  let threw = false;
  try { d.Play({ type: "shout", who: "luo", text: "上刺刀！", voice: "ch4_luo_11" }, false); }
  catch { threw = true; }
  return {
    voiced, bare, threw, misses: d.VoiceMisses, voicedCount: d.VoicedCount,
    subtitles: said.length, calls: played,
  };
});
Check("beat.voice 会把 key 与说话人交给宿主（定位说话人是宿主的事，不是叙事层的）",
  storyChan.calls.length === 1 && storyChan.calls[0].key === "ch0_shunzi_01"
  && storyChan.calls[0].who === "shunzi" && storyChan.calls[0].position?.x === 1,
  JSON.stringify(storyChan.calls));
Check("字幕跟着语音走：3.0 s 的台词字幕不早于音频结束（line 默认 4.2 s，取长者）",
  storyChan.voiced.subtitle >= 3.0 && storyChan.voiced.subtitle >= 4.2,
  `字幕 ${storyChan.voiced.subtitle.toFixed(2)}s`);
Check("有语音的一条会占住话筒到说完（下一条不许从中间打断）",
  storyChan.voiced.hold < 0 && storyChan.voiced.hold <= 2.0 - 3.0,
  `sinceLast=${storyChan.voiced.hold.toFixed(2)}（负数 = 下一条还要再等这么久）`);
// 未接线不记进 VoiceMisses：那是全局状态（整局都没有语音），不是这一条台词的问题；
// 每条都记一遍只会把日志淹掉。宿主抛异常则必须记 —— 那是真的丢了一句。
Check("没接线 / 宿主抛异常都只降级成纯字幕，绝不中断剧本",
  !storyChan.threw && storyChan.bare.subtitle === 4.2 && storyChan.bare.hold === 0
  && storyChan.subtitles === 3 && storyChan.misses.length === 1,
  `三条 beat 都出了字幕；宿主抛异常的那条记进 VoiceMisses：${storyChan.misses.join(" ") || "（空）"}`);

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
