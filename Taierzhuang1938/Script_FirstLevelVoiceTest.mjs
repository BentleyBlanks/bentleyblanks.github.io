// 第一关 2026.09.19 台词配音门禁（纯 Node）。
//
//   node Taierzhuang1938/Script_FirstLevelVoiceTest.mjs            数据侧：契约对账 + 播放器
//   node Taierzhuang1938/Script_FirstLevelVoiceTest.mjs --audio    再加录音资产与强制对齐的严格门
//
// 这一份从 Script_FirstLevelMissionTest 里把配音那一段搬了过来并按新数据模型调整：
// 对齐哈希绑定录音、逐句覆盖、区间单调、continuous/requests===1、speechRate、
// scriptSha256、文件字节/哈希、promptHash、敌军自动口令川话清单。
// 新增的是「跟契约与 Notion 原文逐字对账」和缺录音兜底。
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import {
  MISSION_DIALOGUE, MISSION_VOICE_CAST, MissionVoicePrompt, MissionVoiceSpoken,
  MissionVoiceSubtitle, MissionVoiceScriptJson, MissionVoiceSoundscape,
} from "./Data_FirstLevelMissionDialogue.mjs";
import { JAPANESE_SPEECH } from "./Data_FirstLevelJapaneseSpeech.mjs";
import { MISSION_VOICE_ALIGNMENT } from "./Data_FirstLevelMissionVoiceAlignment.mjs";
import { MissionVoiceTimeline } from "./Data_FirstLevelMissionVoiceTiming.mjs";
import { FirstLevelMissionVoice } from "./Script_FirstLevelMissionVoice.mjs";
import { MISSION_VOICE_FACTS } from "./Data_FirstLevelMissionGates.mjs";
import { MISSION_STAGES } from "./Data_FirstLevelMission.mjs";
import { MISSION_LEADER_STAGES, MISSION_GUIDE_TRANSFERS } from "./Data_FirstLevelLeaderGuide.mjs";

const Read = (name) => fs.readFileSync(new URL(name, import.meta.url), "utf8");
const contract = Read("./docs/Data_FirstLevelRebuild20260919Contract.md");
const source = Read("./docs/Data_FirstLevelRebuildSource20260919.md");
const story = MISSION_DIALOGUE.filter((cue) => !cue.guidance);
const guide = MISSION_DIALOGUE.filter((cue) => cue.guidance);
const byId = new Map(MISSION_DIALOGUE.map((cue) => [cue.id, cue]));

// 1. id 唯一、文件名推导一致、说话人都在演员表里。
assert.equal(new Set(MISSION_DIALOGUE.map((cue) => cue.id)).size, MISSION_DIALOGUE.length, "cue id 去重");
for (const cue of MISSION_DIALOGUE) {
  assert.ok(cue.lines.length > 0, cue.id + " 至少一句");
  assert.equal(cue.file, `AudioVoice_FirstLevel${cue.id}.mp3`, cue.id + " 文件名由 id 推导");
  for (const line of cue.lines) assert.ok(MISSION_VOICE_CAST[line.who], cue.id + " 的说话人不在演员表：" + line.who);
}
console.log(`ok ${MISSION_DIALOGUE.length} cues（剧情 ${story.length} + 带路 ${guide.length}）id 唯一、演员齐全`);

// 2. 契约 §5 的 cue 清单与句数：一条不多、一条不少、句数一致。
const contractSection = contract.slice(contract.indexOf("## 5. 对白 cue"), contract.indexOf("## 6. 分包与文件归属"));
const contractCues = [...contractSection.matchAll(/`([A-Za-z]+)`\((\d+)[^)]*\)/g)].map(
  ([, id, count]) => [id, Number(count)],
);
assert.ok(contractCues.length >= 60, "契约 §5 至少解析出 60 条 cue，实际 " + contractCues.length);
for (const [id, count] of contractCues) {
  const cue = byId.get(id);
  assert.ok(cue, "契约 §5 的 cue 不在台词表：" + id);
  assert.equal(cue.lines.length, count, id + " 句数应与契约一致");
}
assert.deepEqual(
  story.map((cue) => cue.id).filter((id) => !contractCues.some(([name]) => name === id)),
  [], "剧情 cue 不许多出契约之外的条目",
);
assert.equal(story.length, contractCues.length, "剧情 cue 总数与契约一致");
console.log(`ok 契约 §5 的 ${contractCues.length} 条 cue 全部存在且句数一致`);

// 3. 台词与 Notion 转录逐字一致（含破折号、省略号）。
// 转录里以 "> " 开头、带中文引号的行才是台词；单独一行的 "……" 是停顿不是台词。
const transcript = [];
for (const raw of source.split(/\r?\n/)) {
  if (!raw.startsWith("> ")) continue;
  const quoted = /“([^”]*)”(?:（([^）]*)）)?/.exec(raw);
  if (!quoted) continue;
  transcript.push({ text: quoted[1], translation: quoted[2] });
}
const authored = story.flatMap((cue) => cue.lines.map((line, index) => ({ cue, line, index })));
assert.equal(authored.length, transcript.length,
  `台词行数应与 Notion 转录一致（表里 ${authored.length}，转录 ${transcript.length}）`);
authored.forEach(({ cue, line, index }, position) => {
  const entry = transcript[position];
  const where = `${cue.id}[${index}]`;
  if (line.lang === "ja") {
    const japanese = JAPANESE_SPEECH[`${cue.id}:${index}`];
    assert.ok(japanese, where + " 日语行缺少假名/汉字写法");
    assert.equal(entry.text, japanese.kanji, where + " 日语汉字写法与转录不一致");
    assert.equal(line.text, entry.translation, where + " 字幕应是转录括号里的中文译文");
    assert.equal(MissionVoiceSpoken(cue, index), japanese.kana, where + " 送 TTS 的应是纯假名");
    assert.ok(!/[一-鿿]/.test(japanese.kana), where + " 假名里不许残留汉字");
  } else {
    assert.equal(line.text, entry.text, where + " 台词与 Notion 转录逐字不一致");
    assert.equal(MissionVoiceSpoken(cue, index), line.text, where + " 中文行送 TTS 的就是原文");
  }
  assert.equal(MissionVoiceSubtitle(cue, index), line.text, where + " 字幕默认取 line.text");
});
const japaneseLines = authored.filter(({ line }) => line.lang === "ja");
assert.equal(japaneseLines.length, Object.keys(JAPANESE_SPEECH).length, "假名侧表与日语行一一对应");
console.log(`ok ${authored.length} 句台词与 Notion 转录逐字一致（其中 ${japaneseLines.length} 句日语走假名 + 中文字幕）`);

// 4. 假名不许出现在会被界面字表扫到的台词表里。
const dialogueSource = Read("./Data_FirstLevelMissionDialogue.mjs");
assert.ok(!/[぀-ヿ]/.test(dialogueSource),
  "假名只能待在 Data_FirstLevelJapaneseSpeech.mjs（Font/Script_FontChars 会扫台词表）");
const fontChars = Read("./Font/Script_FontChars.mjs");
assert.ok(!fontChars.includes("Data_FirstLevelJapaneseSpeech"), "假名侧表不许登记进 UI 字表");
console.log("ok 假名留在侧表，界面字表不受影响");

// 5. 提示词：每句真正念的内容都在里面，单次请求、长度不超限。
for (const cue of MISSION_DIALOGUE) {
  const prompt = MissionVoicePrompt(cue);
  assert.ok(prompt.length <= 3000, cue.id + " 提示词超过 3000 字符");
  cue.lines.forEach((line, index) =>
    assert.ok(prompt.includes(MissionVoiceSpoken(cue, index)), cue.id + " 提示词缺少第 " + index + " 句"));
  assert.ok(prompt.includes("四川"), cue.id + " 提示词要写明四川话表演");
  if (cue.lines.some((line) => line.lang === "ja"))
    assert.ok(prompt.includes("日军角色只念稿中给出的日语"), cue.id + " 混合语言段要交代日语口径");
}
console.log("ok 提示词逐句覆盖、单条不超 3000 字符");

// 6. 环境声：剧情 cue 各有归属，带路短命令统一落默认那条。
const fallback = MissionVoiceSoundscape("GuideFollow");
for (const cue of guide) assert.equal(MissionVoiceSoundscape(cue.id), fallback, cue.id + " 带路命令用默认环境声");
for (const cue of story)
  assert.ok(cue.soundscape || MissionVoiceSoundscape(cue.id) !== fallback, cue.id + " 缺少分区环境声");
console.log("ok 环境声按新 cue 分区，带路命令不受影响");

// 7. 带路短命令按契约增删。
const guideLine = /下线 (.+?)；新增 (.+?)；其余沿用/.exec(contractSection.replace(/\n/g, ""));
assert.ok(guideLine, "契约 §5 的 Guide 增删清单可解析");
const Ids = (text) => [...text.matchAll(/`(Guide[A-Za-z]+)`/g)].map(([, id]) => id);
for (const id of Ids(guideLine[1])) assert.ok(!byId.has(id), "已下线的带路命令仍在表里：" + id);
for (const id of Ids(guideLine[2])) assert.ok(byId.has(id), "契约新增的带路命令缺失：" + id);
for (const cue of guide) {
  assert.equal(cue.lines.length, 1, cue.id + " 带路命令只有一句");
  assert.equal(cue.lines[0].who, "luo", cue.id + " 带路命令只由罗班长说");
  assert.ok(cue.lines[0].text.length <= 40, cue.id + " 带路命令过长");
}
console.log(`ok 带路短命令按契约重排：下线 ${Ids(guideLine[1]).length} 条、新增 ${Ids(guideLine[2]).length} 条`);

// 8. MISSION_VOICE_FACTS：直接对运行时那张表，不再对契约正文的清单。
//    契约列出的每一对都必须在表里；表可以多，但多出来的那一条要说得出理由。
const factPairs = [...contractSection.matchAll(/`([A-Za-z]+)→([A-Za-z]+)`/g)].map(([, cue, fact]) => [cue, fact]);
assert.ok(factPairs.length >= 20, "契约 §5 的播完记事实清单可解析，实际 " + factPairs.length);
for (const [cue, fact] of factPairs) {
  assert.ok(byId.has(cue), `MISSION_VOICE_FACTS 的 cue 不存在：${cue}（→${fact}）`);
  assert.equal(MISSION_VOICE_FACTS[cue], fact, `${cue} 播完应记 ${fact}`);
}
for (const cue of Object.keys(MISSION_VOICE_FACTS)) assert.ok(byId.has(cue), "编排表引用了不存在的 cue：" + cue);
// 运行时比契约多的那一条：06 老周上担架（ZhouLift→zhouOnLitter）本来就写在 §2 的
// requirements 里，只是 §5 的映射清单漏列。
assert.deepEqual(
  Object.keys(MISSION_VOICE_FACTS).filter((cue) => !factPairs.some(([id]) => id === cue)),
  ["ZhouLift"], "编排表比契约多出来的「播完记事实」只有 ZhouLift 这一条");
console.log(`ok MISSION_VOICE_FACTS 的 ${Object.keys(MISSION_VOICE_FACTS).length} 条与契约逐条对上`);

// 8b. 运行时源码里引用的每一个 cue id 都必须在台词表里。
//     Enqueue 对未知 cue 只警告不抛异常（有意如此），所以改表改漏不会在运行时炸，
//     只会变成「那句话再也不响了」—— 那就得在这里红。
{
  const RUNTIME_SOURCES = [
    "./Script_FirstLevelMissionRuntime.mjs", "./Script_FirstLevelOpening.mjs",
    "./Script_FirstLevelLeaderGuide.mjs", "./Data_FirstLevelLeaderGuide.mjs",
    "./Data_FirstLevelMission.mjs", "./Data_FirstLevelMissionGates.mjs",
    // 第二波玩法包：运行时只留薄钩子，08–14 的 Say 在这两个模块里。
    "./Script_FirstLevelVillageBlock.mjs", "./Script_FirstLevelTransferCart.mjs",
    // 第二波把演出搬进各玩法包的新模块，运行时只留薄钩子 —— 扫描范围跟着走，
    // 否则「哪条 cue 已经有触发点了」会静默地对不上（契约 §8 的分包约定）。
    "./Script_FirstLevelQuietMarch.mjs", "./Script_FirstLevelReception.mjs",
    "./Script_FirstLevelBridge.mjs", "./Script_FirstLevelNightGate.mjs",
    // 第二波 Front 包（公开阶段 1–7）：01/02 的门外演出与 03–07 的对白落点。
    "./Script_FirstLevelBunker.mjs", "./Script_FirstLevelCollection.mjs",
    "./Script_FirstLevelFrontShow.mjs",
  ];
  const referenced = new Map();
  for (const name of RUNTIME_SOURCES) {
    const text = Read(name);
    // Say("X") / Enqueue("X") / Replay("X") / Cancel(["X","Y"]) / voice.played.has("X")
    for (const [, id] of text.matchAll(/\b(?:Say|Enqueue|Replay|Guidance)\(\s*["']([A-Za-z][A-Za-z0-9]*)["']/g))
      referenced.set(id, name);
    for (const [, list] of text.matchAll(/\bCancel\(\s*\[([^\]]*)\]/g))
      for (const [, id] of list.matchAll(/["']([A-Za-z][A-Za-z0-9]*)["']/g)) referenced.set(id, name);
    for (const [, id] of text.matchAll(/voice\.(?:played|finished)\.has\(\s*["']([A-Za-z][A-Za-z0-9]*)["']/g))
      referenced.set(id, name);
  }
  // MISSION_STAGES 的每一步 cue 与带路编排里的 cue（数据，不是字面量）。
  for (const stage of MISSION_STAGES) if (stage.cue) referenced.set(stage.cue, "MISSION_STAGES");
  for (const spec of [...Object.values(MISSION_LEADER_STAGES), ...Object.values(MISSION_GUIDE_TRANSFERS)])
    referenced.set(spec.cue, "MISSION_LEADER_STAGES");
  assert.ok(referenced.size >= 40, "静态扫描至少应找到 40 个 cue 引用，实际 " + referenced.size);
  const missing = [...referenced].filter(([id]) => !byId.has(id));
  assert.deepEqual(missing, [], "运行时引用了台词表里没有的 cue：" + JSON.stringify(missing));
  // 反过来：已经烘好、但运行时还没有触发点的剧情 cue。第二波玩法包一条条接上，
  // 接完这张表就空了。**只许变短**：出现表外的新条目说明又有一段演出被摘掉了。
  // 2026.09.20 End 包（阶段 15–18）接完了自己那七条：CartAbandon / RoadBump /
  // HandsShake / WardGuide / PlaceLitter / NextLitter / NorthGate。名单只许变短。
  const SECOND_WAVE_UNWIRED = new Set([
    // 08/09 的 KitchenDetour / MeleeCurse / WindowOrder 已由第二波 Mid 包接上触发点
    //（Script_FirstLevelVillageBlock），2026-09-20 从这张名单里划掉。
    // 15–18 的七条已由第二波 End 包接上触发点，2026-09-20 同日划掉。
    // Front 包（阶段 1–7）名下的四条已在第二波接上触发点，从这张表里删了：
    // RescueOut / TrenchCurse（02）、BundleProne / BundleReturnCall（05）。
  ]);
  const unwired = story.map((cue) => cue.id).filter((id) => !referenced.has(id));
  for (const id of unwired) assert.ok(SECOND_WAVE_UNWIRED.has(id), "这条剧情 cue 没有任何触发点：" + id);
  console.log(`ok 运行时 ${referenced.size} 处 cue 引用全部落在台词表里（还有 ${unwired.length} 条等第二波接触发点）`);
}

// 9. 具名事件：玩法包按名字接动作。
const Events = (id, seconds) => {
  const cue = byId.get(id);
  return (MissionVoiceTimeline(cue, seconds).segments[0].events || []).map((event) => event.id);
};
assert.ok(Events("BunkerBanter", 20).includes("BunkerBlast"), "BunkerBanter 末句要打 BunkerBlast");
assert.ok(Events("RescueLift", 12).includes("RescueHeave"), "RescueLift 的「起」要打 RescueHeave");
assert.ok(Events("AircraftReturn", 8).includes("AircraftDiveOrder"), "AircraftReturn 要沿用 AircraftDiveOrder");
assert.deepEqual(Events("BorrowLight", 40),
  ["BorrowLightMatchesPocketed", "BorrowLightCigaretteOffered"], "借火的两处动作空当各有事件");
assert.ok(Events("ZhouDeath", 30).includes("ZhouNoAnswer"), "ZhouDeath 的「……」要有事件");
{
  const cue = byId.get("BunkerBanter"), plan = MissionVoiceTimeline(cue, 20);
  const blast = plan.segments[0].events.find((event) => event.id === "BunkerBlast");
  assert.equal(blast.at, plan.lines.at(-1)[1], "BunkerBlast 打在末句结束的那一刻");
}
for (const cue of MISSION_DIALOGUE) {
  const plan = MissionVoiceTimeline(cue, Math.max(2, cue.lines.length * 2));
  assert.equal(plan.segments.length, 1, cue.id + " 一条录音只有一个区间，不许拆段");
  assert.equal(plan.lines.length, cue.lines.length, cue.id + " 每句一个区间");
}
console.log("ok 具名事件齐全，整段录音不拆段");

// 10. 播放器：缺录音照走字幕与事件、未知 cue 不抛异常。
{
  const events = [], lines = [], said = [], done = [], warnings = [];
  const original = console.warn;
  console.warn = (message) => warnings.push(message);
  let voice;
  try {
    voice = new FirstLevelMissionVoice({
      audio: { PlayStoryVoice() { throw new Error("缺录音时不许碰音频引擎"); }, StopStoryVoice() {} },
      hud: { Say: (speaker, text) => said.push(`${speaker}：${text}`) },
      Done: (id) => done.push(id),
      Event: (id, cue, detail) => (id === "Line" ? lines.push({ cue, ...detail }) : events.push(id)),
    });
    voice.manifest = { cues: {} };
    assert.equal(voice.Enqueue("NoSuchCueAtAll"), false, "未知 cue 不入队");
    voice.Guidance("NoSuchCueAtAll"); voice.Cancel(["NoSuchCueAtAll"]); voice.Replay("NoSuchCueAtAll");
    assert.ok(voice.Enqueue("BorrowLight"), "台词表里的 cue 照常入队");
    for (let i = 0; i < 6000 && !done.length; i++) voice.Update(1 / 60);
  } finally {
    console.warn = original;
  }
  assert.deepEqual(done, ["BorrowLight"], "缺录音的 cue 也要走完并 Done");
  assert.equal(lines.length, 9, "九句都发了 Line 事件");
  assert.deepEqual(lines.map((line) => line.index), [0, 1, 2, 3, 4, 5, 6, 7, 8], "Line 事件按句序");
  assert.equal(lines[0].who, "zhou", "Line 事件带说话人");
  assert.equal(said.length, 9, "缺录音时字幕照出");
  assert.ok(events.includes("BorrowLightMatchesPocketed"), "缺录音时具名事件照发");
  assert.equal(warnings.filter((text) => text.includes("BorrowLight")).length, 1, "缺录音只警告一次");
  assert.ok(warnings.some((text) => text.includes("NoSuchCueAtAll")), "未知 cue 警告一次");
  assert.deepEqual(voice.State().missing, ["BorrowLight"]);
  assert.deepEqual(voice.State().unknown, ["NoSuchCueAtAll"]);
  console.log("ok 缺录音兜底：字幕、Line 事件与 Done 照常，未知 cue 只警告不抛异常");
}
// 11. 日语行的字幕显示中文译文。
{
  const said = [];
  const voice = new FirstLevelMissionVoice({
    audio: { PlayStoryVoice: () => ({}), StopStoryVoice() {} },
    hud: { Say: (speaker, text) => said.push(`${speaker}：${text}`) },
  });
  voice.manifest = { cues: { BunkerKilling: { seconds: 12 } } };
  voice.Enqueue("BunkerKilling");
  for (let i = 0; i < 2000; i++) voice.Update(1 / 60);
  assert.ok(said.includes("日兵甲：站起来！快点！"), "日语行的字幕是中文译文：" + said.join(" / "));
  assert.ok(said.every((row) => !/[぀-ヿ]/.test(row)), "字幕里不许出现假名");
  console.log("ok 日语行字幕显示中文译文");
}

if (process.argv.includes("--audio")) {
  const manifest = JSON.parse(Read("./Audio/FirstLevel/Data_FirstLevelVoiceManifest.json"));
  let seconds = 0;
  for (const cue of MISSION_DIALOGUE) {
    const entry = manifest.cues[cue.id];
    assert.ok(entry, cue.id + " 没有录音条目");
    const aligned = MISSION_VOICE_ALIGNMENT[cue.id];
    assert.ok(aligned, cue.id + " 没有对齐条目");
    assert.equal(aligned.sha256, entry.sha256, cue.id + " 的时序绑定的是这一条录音");
    assert.equal(aligned.lines.length, cue.lines.length, cue.id + " 对齐逐句覆盖");
    aligned.lines.forEach(([start, end], i) => {
      assert.ok(start >= 0 && end >= start && end <= entry.seconds + 0.02, cue.id + " 区间落在录音里");
      if (start === end) assert.ok(aligned.note, cue.id + " 塌缩的区间必须有说明");
      if (i) assert.ok(start >= aligned.lines[i - 1][1], cue.id + " 字幕区间单调不重叠");
    });
    assert.ok(entry.continuous && entry.requests === 1 && entry.seconds > 0.5, cue.id + " 必须是一次请求的整段录音");
    assert.equal(entry.lineCount, cue.lines.length, cue.id + " 清单句数");
    assert.equal(entry.speechRate ?? 0, cue.speechRate ?? 0, cue.id + " 生成语速与台词表一致");
    assert.equal(aligned.scriptSha256, crypto.createHash("sha256").update(MissionVoiceScriptJson(cue)).digest("hex"),
      cue.id + " 对齐用的是当前完整台词");
    const bytes = fs.readFileSync(new URL("./Audio/FirstLevel/" + cue.file, import.meta.url));
    assert.equal(bytes.length, entry.bytes, cue.id + " 字节数");
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), entry.sha256, cue.id + " 内容哈希");
    assert.equal(crypto.createHash("sha256").update(MissionVoicePrompt(cue)).digest("hex"), entry.promptHash,
      cue.id + " 录音对应的是当前提示词");
    seconds += entry.seconds;
  }
  // 台词表里没有的 cue 不许留在清单里（--prune 的结果）。
  for (const id of Object.keys(manifest.cues)) assert.ok(byId.has(id), "清单里有已下线的 cue：" + id);
  const files = new Set(MISSION_DIALOGUE.map((cue) => cue.file));
  for (const name of fs.readdirSync(new URL("./Audio/FirstLevel/", import.meta.url)))
    if (name.endsWith(".mp3")) assert.ok(files.has(name), "Audio/FirstLevel 里有已下线的录音：" + name);
  // 17 是第一人称、不切特写的一段确认，语速慢、含一处三秒空当：按七句 + 停顿定窗口。
  const death = manifest.cues.ZhouDeath;
  assert.ok(death.seconds >= 12 && death.seconds <= 34,
    `整段确认死亡的录音应在 12—34 秒（七句短对白约 14—20 秒，外加第一句后约三秒空当与慢语速余量），实际 ${death.seconds}`);
  console.log(`ok ${MISSION_DIALOGUE.length} 条整段录音、当前台词/文件哈希、对齐绑定，总长 ${seconds.toFixed(1)} 秒`);

  const { VOICE_LINES } = await import("./Data_Voice.mjs");
  const barks = VOICE_LINES.filter((line) => line.side === "ija" && line.kind !== "story");
  const barkManifest = JSON.parse(Read("./Audio/Data_SichuanBarkManifest.json"));
  assert.equal(barkManifest.model, "seed-audio-1.0");
  for (const line of barks) {
    const entry = barkManifest.cues[line.key];
    assert.equal(line.dialect, "sichuan", line.key + " 敌军自动口令也用指定方言");
    assert.equal(entry.text, line.text); assert.equal(entry.version, line.version);
    assert.equal(entry.dialect, line.dialect); assert.equal(entry.seconds, line.dur);
    assert.equal(entry.sha256,
      crypto.createHash("sha256").update(fs.readFileSync(new URL("./Audio/" + line.file, import.meta.url))).digest("hex"));
  }
  console.log(`ok all ${barks.length} autonomous enemy barks use current Sichuan recordings`);
} else {
  console.log("ok 台词数据侧全绿；录音资产需要 --audio 验收");
}
