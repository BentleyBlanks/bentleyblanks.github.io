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

Check("配音全部解码成功（一条都不许静默丢）", r.size >= 30 && r.errors.length === 0,
  `载入 ${r.size} 条，错误 ${r.errors.length} 条${r.errors.length ? "：" + r.errors.join(" / ") : ""}`);
Check("六类口令齐全（kill 那一类已删：喊「打中了」等于把 hitmarker 用嘴说了一遍）",
  Object.keys(r.kinds).length >= 6, JSON.stringify(r.kinds));
Check("日语口令没有混进声库（中文模型读日文，日本兵说中文比不说更糟）", !r.hasIja,
  r.hasIja ? "混进来了" : "已排除");
Check("每句都在 0.3—2.6 s（太长的喊话在战场上读不完；太短的多半是模型只吐了半句）",
  r.durations.every((d) => d > 0.3 && d < 2.6),
  `最长 ${Math.max(...r.durations)}s，最短 ${Math.min(...r.durations)}s`);
Check("event 句被挡在随机挑选之外（滕县无战车，不许有人随口喊「战车碾拢来了」）",
  r.eventLeak === 0 && r.eventCount >= 5,
  "event 句 " + r.eventCount + " 条，泄漏进随机池 " + r.eventLeak + " 条");
Check("文本是四川话不是普通话（方言零件抽查）",
  r.dialectHits >= 20,
  "31 句里带方言零件（莫/咯/到起/遭/不得/匀/拢/弟兄伙…）的有 " + r.dialectHits + " 句");
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
