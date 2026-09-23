// 第一关台词配音门禁（纯 Node）。
//
//   node Taierzhuang1938/Script_FirstLevelVoiceTest.mjs            数据侧：原文对账、导演表、播放器
//   node Taierzhuang1938/Script_FirstLevelVoiceTest.mjs --audio    再加录音资产（逐句干声指标 + 旧整段哈希/对齐）
//
// 两种格式并存（docs/Data_FirstLevel0105Refactor20260923Contract.md §2.2 / §5）：
//   · 逐句干声（perLine）：01–06。01–02 逐字对 09.23 新稿（「## 分镜参考」之前），03–05 对 09.22 稿，
//     06 对 09.19 稿；每句一条干声、带定妆参考音、导演时间轴、多声部播放器。
//   · 整段录音：07–18 与待 Opening 包下线的 09.21 旧 cue，旧断言原样保留。
//   · 班组战斗短句（SQUAD_BARK_*）：罗 / 幺娃 / 何 / 刘 / 老周 / 顺子各用自己的定妆音录一份，一人一次请求；
//     Script_Audio.Bark 认出是谁在喊就只在他的版本里挑（第 11 节；录音资产在 --audio 里验）。
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import {
  MISSION_DIALOGUE, MISSION_VOICE_CAST, MissionVoicePrompt, MissionVoiceSpoken,
  MissionVoiceSubtitle, MissionVoiceScriptJson, MissionVoiceSoundscape, MissionLineId, MissionLineFile,
} from "./Data_FirstLevelMissionDialogue.mjs";
import { JAPANESE_SPEECH } from "./Data_FirstLevelJapaneseSpeech.mjs";
import { MISSION_VOICE_ALIGNMENT } from "./Data_FirstLevelMissionVoiceAlignment.mjs";
import { MissionVoiceTimeline } from "./Data_FirstLevelMissionVoiceTiming.mjs";
import { FIRST_LEVEL_DIALOGUE_DIRECTION, PROJECTION_DB, DIALOGUE_DUCK, LineDirection, FALLBACK_GAP_S } from "./Data_FirstLevelDialogueDirection.mjs";
import { FIRST_LEVEL_VOICE_CAST, CastVoiceOwner, SQUAD_BARK_KEYS, SQUAD_BARK_CAST, SquadBarkEntries, SquadBarkKey }
  from "./Data_FirstLevelVoiceCast.mjs";
import { FirstLevelMissionVoice, BARK_SPEAKER_MATCH_M } from "./Script_FirstLevelMissionVoice.mjs";
import { AudioEngine } from "./Script_Audio.mjs";
import { VOICE_LINES } from "./Data_Voice.mjs";
import { DialoguePlayer } from "./Script_DialoguePlayer.mjs";
import { MISSION_VOICE_FACTS } from "./Data_FirstLevelMissionGates.mjs";
import { MISSION_STAGES } from "./Data_FirstLevelMission.mjs";
import { MISSION_LEADER_STAGES, MISSION_GUIDE_TRANSFERS } from "./Data_FirstLevelLeaderGuide.mjs";

const Read = (name) => fs.readFileSync(new URL(name, import.meta.url), "utf8");
const contract = Read("./docs/Data_FirstLevelRebuild20260919Contract.md");
const contract0923 = Read("./docs/Data_FirstLevel0105Refactor20260923Contract.md");
const previousSource = Read("./docs/Data_FirstLevelRebuildSource20260919.md");
const opening0921 = Read("./docs/Data_FirstLevelOpeningSource20260921.md");
const opening0923 = Read("./docs/Data_FirstLevelOpeningSource20260923.md");
const frontSource = Read("./docs/Data_FirstLevelFrontSource20260922.md");
const story = MISSION_DIALOGUE.filter((cue) => !cue.guidance);
const guide = MISSION_DIALOGUE.filter((cue) => cue.guidance);
const perLine = MISSION_DIALOGUE.filter((cue) => cue.perLine);
const byId = new Map(MISSION_DIALOGUE.map((cue) => [cue.id, cue]));
// 09.21 旧稿里、契约 §5.2 已宣布下线、但旧导演还在 Say 的整段 cue。Opening 包接新导演后删掉；**只许变短**。
const RETIRE_PENDING = ["BunkerKilling", "ShunziCurse", "RescueCall", "RescueLift", "RescueOut", "TrenchCurse", "CornerCheck"];

// 1. id 唯一、文件名推导一致、说话人都在演员表里；逐句 cue 每句有契约格式的 id 与文件名。
assert.equal(new Set(MISSION_DIALOGUE.map((cue) => cue.id)).size, MISSION_DIALOGUE.length, "cue id 去重");
for (const cue of MISSION_DIALOGUE) {
  assert.ok(cue.lines.length > 0, cue.id + " 至少一句");
  assert.equal(cue.file, `AudioVoice_FirstLevel${cue.id}.mp3`, cue.id + " 文件名由 id 推导");
  cue.lines.forEach((line, index) => {
    assert.ok(MISSION_VOICE_CAST[line.who], cue.id + " 的说话人不在演员表：" + line.who);
    if (!cue.perLine) return;
    assert.equal(line.id, MissionLineId(cue.id, index), cue.id + " 逐句 id 形如 <Scene>.<NN>");
    assert.equal(line.id, `${cue.id}.${String(index + 1).padStart(2, "0")}`);
    assert.equal(line.file, MissionLineFile(cue.id, index));
    assert.equal(line.file, `Lines/AudioVoice_FirstLevel${cue.id}_${String(index + 1).padStart(2, "0")}.mp3`, line.id + " 文件名按契约 §5.2");
    assert.ok(FIRST_LEVEL_VOICE_CAST[line.who], line.id + " 的说话人没有定妆条目：" + line.who);
  });
}
console.log(`ok ${MISSION_DIALOGUE.length} cues（剧情 ${story.length} + 带路 ${guide.length}；逐句 ${perLine.length} 场 ${perLine.reduce((n, c) => n + c.lines.length, 0)} 句）id 唯一、演员齐全`);

// 2a. 09.23 契约 §5.2：01–02 的 13 个场景、逐句说话人与句数。
const table0923 = contract0923.slice(contract0923.indexOf("### 5.2"), contract0923.indexOf("### 5.3"));
const scenes0923 = [...table0923.matchAll(/^\| `([A-Za-z]+)` \| (.+) \|$/gm)].map(([, id, body]) =>
  [id, [...body.matchAll(/(?<!\d)(\d\d) ([a-zA-Z]+)\s/g)].map(([, n, who]) => [Number(n), who])]);
assert.equal(scenes0923.length, 13, "契约 §5.2 解析出 13 个场景");
for (const [id, rows] of scenes0923) {
  const cue = byId.get(id);
  assert.ok(cue?.perLine, `契约 §5.2 的场景 ${id} 必须是逐句格式`);
  assert.deepEqual(rows.map(([n]) => n), rows.map((_, i) => i + 1), id + " 契约序号连续");
  assert.deepEqual(cue.lines.map((line) => line.who), rows.map(([, who]) => who), id + " 逐句说话人与契约一致");
}
const retired = [...table0923.matchAll(/下线：(.+?)（/g)][0]?.[1] || "";
const retiredIds = [...retired.matchAll(/`([A-Za-z]+)`/g)].map(([, id]) => id);
assert.deepEqual([...retiredIds].sort(), [...RETIRE_PENDING].sort(), "待下线名单就是契约 §5.2 的下线清单（Opening 包接上新导演后一并删掉）");
for (const id of RETIRE_PENDING) assert.ok(byId.has(id) && !byId.get(id).perLine, id + " 仍是旧整段 cue（旧导演还在用）");
const ORDER0923 = scenes0923.map(([id]) => id);
// 2b. 其余剧情 cue 对 09.19 契约 §5（01–02 的旧条目换成上面两张名单）。
const contractSection = contract.slice(contract.indexOf("## 5. 对白 cue"), contract.indexOf("## 6. 分包与文件归属"));
const contractCues = [...contractSection.matchAll(/`([A-Za-z]+)`\((\d+)[^)]*\)/g)].map(([, id, count]) => [id, Number(count)])
  .filter(([id]) => !ORDER0923.includes(id) && !RETIRE_PENDING.includes(id));
assert.ok(contractCues.length >= 55, "契约 §5 至少解析出 55 条 03 以后的 cue，实际 " + contractCues.length);
for (const [id, count] of contractCues) {
  const cue = byId.get(id);
  assert.ok(cue, "契约 §5 的 cue 不在台词表：" + id);
  assert.equal(cue.lines.length, count, id + " 句数应与契约一致");
}
const expectedStory = new Set([...ORDER0923, ...RETIRE_PENDING, ...contractCues.map(([id]) => id)]);
assert.deepEqual(story.map((cue) => cue.id).filter((id) => !expectedStory.has(id)), [], "剧情 cue 不许多出契约之外的条目");
assert.equal(story.length, expectedStory.size, "剧情 cue 总数与两份契约一致");
// 01–06 全部逐句；07 以后全部整段。
const ORDER0305 = ["FrontBlockade", "FrontApproach", "FrontAttack", "FrontWithdraw", "TakeOverGun", "TankRoadContact", "TankTerror",
  "BundleOrder", "BundleGo", "BundleProne", "BundleSupply", "BundleReturnCall", "BundleAttack", "BundleRetreat", "TankStopped", "FrontRelief"];
const ORDER06 = ["Volunteer", "BorrowLight", "ZhouLift"];
assert.deepEqual(perLine.map((cue) => cue.id).sort(), [...new Set([...ORDER0923, ...ORDER0305, ...ORDER06])].sort(),
  "01–06 的剧情 cue 全部是逐句格式，07 以后没有");
console.log(`ok 契约对账：01–02 新 13 场、03 以后 ${contractCues.length} 条、待下线旧 cue ${RETIRE_PENDING.length} 条`);

// 3. 台词逐字对账。
// 3a. 09.23 新稿：> **名字：**“中文” / > **名字：**「日语」 + > **中文：**“译文”；切到「## 分镜参考」为止。
const NAME = { 顺子: "shunzi", 幺娃: "yaowa", 川军: "comrade", 传令兵: "runner", 罗班长: "luo", 洞外士兵: "shouter", 日兵甲: "ijaA",
  日兵乙: "ijaB", 日兵丙: "ijaC", 日兵丁: "ijaD", 翻译: "interpreter", 守军: "guard" };
const new0923 = [];
for (const raw of opening0923.slice(0, opening0923.indexOf("## 分镜参考")).split(/\r?\n/)) {
  const m = /^> \*\*(.+?)：\*\*(.*)$/.exec(raw);
  if (!m) continue;
  const name = m[1].replace(/（.*?）/g, ""), body = m[2].trim();
  if (name === "中文") { const zh = /^“([^”]*)”$/.exec(body); assert.ok(zh && new0923.at(-1)?.lang === "ja", "「中文：」只跟在日语行后面"); new0923.at(-1).translation = zh[1]; continue; }
  const ja = /^「([^」]*)」$/.exec(body), zh = /^“([^”]*)”$/.exec(body);
  assert.ok(ja || zh, "09.23 新稿台词行格式：" + raw);
  assert.ok(NAME[name], "09.23 新稿出现未登记的说话人：" + name);
  new0923.push({ who: NAME[name], text: (ja || zh)[1], lang: ja ? "ja" : "zh" });
}
const authored0923 = ORDER0923.flatMap((id) => byId.get(id).lines.map((line, index) => ({ cue: byId.get(id), line, index })));
assert.equal(authored0923.length, new0923.length, `01–02 台词句数与 09.23 新稿一致（表 ${authored0923.length}，稿 ${new0923.length}）`);
let japanese = 0;
authored0923.forEach(({ cue, line, index }, i) => {
  const entry = new0923[i], where = line.id;
  assert.equal(line.who, entry.who, where + " 说话人与新稿一致");
  assert.equal(line.lang || "zh", entry.lang, where + " 语言与新稿一致");
  if (entry.lang === "ja") {
    japanese++;
    const speech = JAPANESE_SPEECH[line.id];
    assert.ok(speech, where + " 日语行缺少假名/汉字写法");
    assert.equal(speech.kanji, entry.text, where + " 日语汉字写法与新稿一致");
    assert.equal(line.text, entry.translation, where + " 字幕是新稿「中文：」那一行");
    assert.equal(MissionVoiceSpoken(cue, index), speech.kana, where + " 送 TTS 的是纯假名");
    assert.ok(!/[一-鿿]/.test(speech.kana), where + " 假名里不许残留汉字");
  } else {
    assert.equal(line.text, entry.text, where + " 台词与新稿逐字一致");
    assert.equal(MissionVoiceSpoken(cue, index), line.text, where + " 中文行送 TTS 的就是原文");
  }
  assert.equal(MissionVoiceSubtitle(cue, index), line.text, where + " 字幕默认取 line.text");
});
assert.equal(japanese, 18, "01–02 新稿日语 18 句");
// 3b. 03–05 对 09.22 稿、06 以后对 09.19 稿（旧口径：带中文引号的 > 行）。
const Quoted = (text) => text.split(/\r?\n/).filter((raw) => raw.startsWith("> ")).map((raw) => /“([^”]*)”(?:（([^）]*)）)?/.exec(raw))
  .filter(Boolean).map((m) => ({ text: m[1], translation: m[2] }));
const rest = [...Quoted(frontSource), ...Quoted(previousSource.slice(previousSource.indexOf("# 06｜")))];
const restAuthored = story.filter((cue) => !ORDER0923.includes(cue.id) && !RETIRE_PENDING.includes(cue.id))
  .flatMap((cue) => cue.lines.map((line, index) => ({ cue, line, index })));
assert.equal(restAuthored.length, rest.length, `03 以后台词句数与原文一致（表 ${restAuthored.length}，原文 ${rest.length}）`);
restAuthored.forEach(({ cue, line, index }, i) => {
  assert.equal(line.text, rest[i].text, `${cue.id}[${index}] 台词与原文逐字不一致`);
  assert.equal(MissionVoiceSpoken(cue, index), line.text);
});
// 3c. 待下线的 09.21 旧 cue：每条都是 09.21 稿里连续的一段。
const old0921 = Quoted(opening0921.slice(0, opening0921.indexOf("# 03｜")));
for (const id of RETIRE_PENDING) {
  const cue = byId.get(id);
  const texts = cue.lines.map((line, index) => line.lang === "ja" ? JAPANESE_SPEECH[`${id}:${index}`]?.kanji : line.text);
  const start = old0921.findIndex((entry, i) => texts.every((text, k) => old0921[i + k]?.text === text));
  assert.ok(start >= 0, id + " 是 09.21 稿里连续的一段");
  cue.lines.forEach((line, index) => { if (line.lang === "ja") assert.equal(line.text, old0921[start + index].translation, `${id}[${index}] 字幕是译文`); });
}
const legacyJa = RETIRE_PENDING.flatMap((id) => byId.get(id).lines.map((line, index) => line.lang === "ja" ? `${id}:${index}` : null)).filter(Boolean);
assert.deepEqual(Object.keys(JAPANESE_SPEECH).sort(), [...authored0923.filter(({ line }) => line.lang === "ja").map(({ line }) => line.id), ...legacyJa].sort(),
  "假名侧表与日语行一一对应");
console.log(`ok 台词逐字对账：01–02 ${authored0923.length} 句（日语 ${japanese}）、03 以后 ${restAuthored.length} 句、旧 cue ${RETIRE_PENDING.length} 条`);

// 4. 假名不许出现在会被界面字表扫到的台词表里。
const dialogueSource = Read("./Data_FirstLevelMissionDialogue.mjs");
assert.ok(!/[぀-ヿ]/.test(dialogueSource), "假名只能待在 Data_FirstLevelJapaneseSpeech.mjs（Font/Script_FontChars 会扫台词表）");
const fontChars = Read("./Font/Script_FontChars.mjs");
assert.ok(!fontChars.includes("Data_FirstLevelJapaneseSpeech"), "假名侧表不许登记进 UI 字表");
assert.ok(!fontChars.includes("Data_FirstLevelVoiceCast") && !fontChars.includes("Data_FirstLevelDialogueDirection"),
  "定妆表与导演表是提示词数据，不进 UI 字表");
console.log("ok 假名留在侧表，界面字表不受影响");

// 5. 提示词。旧整段：逐句覆盖、单次请求、要环境声（旧口径）。
//    01–06 场景整段：一场一次请求、干声不烘环境、最多 3 条参考音按 @音频N 绑定说话人、每句原文都在、谁说哪句写明。
const { ScenePrompt, SceneReferences } = await import("./Script_SeedAudioFirstLevelBake.mjs");
for (const cue of MISSION_DIALOGUE) {
  if (cue.perLine) {
    const prompt = ScenePrompt(cue), refs = SceneReferences(cue);
    assert.ok(prompt.length <= 3000, cue.id + " 整段提示词超过 3000 字符");
    assert.ok(refs.length >= 1 && refs.length <= 3, cue.id + " 挂 1–3 条定妆参考音");
    assert.ok(prompt.includes("没有任何环境声") && !prompt.includes("环境声必须录进"), cue.id + " 整段干声禁止烘环境声");
    refs.forEach((ref, k) => assert.ok(prompt.includes(`@音频${k + 1} 是`), cue.id + " 交代 @音频" + (k + 1) + " 是谁"));
    cue.lines.forEach((line, index) => {
      assert.ok(prompt.includes(`“${MissionVoiceSpoken(cue, index)}”`), line.id + " 整段提示词里有这句要念的原文");
      const k = refs.findIndex((ref) => ref.who.includes(line.who));
      if (k >= 0) assert.ok(prompt.includes(`@音频${k + 1} ${MISSION_VOICE_CAST[line.who][0]}：“${MissionVoiceSpoken(cue, index)}”`), line.id + " 这句标明用哪条参考音的嗓子");
      if (line.lang !== "ja" && FIRST_LEVEL_VOICE_CAST[line.who].lang === "zh") assert.ok(prompt.includes("四川话"), line.id + " 川军说四川话");
      if (FIRST_LEVEL_VOICE_CAST[line.who].lang === "zh-north") assert.ok(prompt.includes("北方"), line.id + " 翻译是北方口音");
      if (line.lang === "ja") assert.ok(prompt.includes(line.who === "interpreter" ? "说日语时带很重的中国北方口音" : "只说给出的日语"), line.id + " 日语行口径");
    });
    continue;
  }
  const prompt = MissionVoicePrompt(cue);
  assert.ok(prompt.length <= 3000, cue.id + " 提示词超过 3000 字符");
  cue.lines.forEach((line, index) => assert.ok(prompt.includes(MissionVoiceSpoken(cue, index)), cue.id + " 提示词缺少第 " + index + " 句"));
  assert.ok(prompt.includes("四川"), cue.id + " 提示词要写明四川话表演");
  if (cue.lines.some((line) => line.lang === "ja")) assert.ok(prompt.includes("日军角色只念稿中给出的日语"), cue.id + " 混合语言段要交代日语口径");
}
console.log("ok 提示词：旧整段逐句覆盖；01–06 场景整段一次请求、带参考音绑定说话人、禁环境声");

// 6. 环境声分区只管整段录音；带路短命令统一落默认那条。
const fallback = MissionVoiceSoundscape("GuideFollow");
for (const cue of guide) assert.equal(MissionVoiceSoundscape(cue.id), fallback, cue.id + " 带路命令用默认环境声");
for (const cue of story.filter((c) => !c.perLine))
  assert.ok(cue.soundscape || MissionVoiceSoundscape(cue.id) !== fallback, cue.id + " 缺少分区环境声");
console.log("ok 整段录音的环境声分区不变");

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

// 8. MISSION_VOICE_FACTS 对 09.19 契约的映射清单。
const factPairs = [...contractSection.matchAll(/`([A-Za-z]+)→([A-Za-z]+)`/g)].map(([, cue, fact]) => [cue, fact]);
assert.ok(factPairs.length >= 20, "契约 §5 的播完记事实清单可解析，实际 " + factPairs.length);
for (const [cue, fact] of factPairs) {
  assert.ok(byId.has(cue), `MISSION_VOICE_FACTS 的 cue 不存在：${cue}（→${fact}）`);
  assert.equal(MISSION_VOICE_FACTS[cue], fact, `${cue} 播完应记 ${fact}`);
}
for (const cue of Object.keys(MISSION_VOICE_FACTS)) assert.ok(byId.has(cue), "编排表引用了不存在的 cue：" + cue);
assert.deepEqual(Object.keys(MISSION_VOICE_FACTS).filter((cue) => !factPairs.some(([id]) => id === cue)),
  ["ZhouLift"], "编排表比契约多出来的「播完记事实」只有 ZhouLift 这一条");
console.log(`ok MISSION_VOICE_FACTS 的 ${Object.keys(MISSION_VOICE_FACTS).length} 条与契约逐条对上`);

// 8b. 运行时源码里引用的每一个 cue id 都必须在台词表里。
{
  const RUNTIME_SOURCES = [
    "./Script_FirstLevelMissionRuntime.mjs", "./Script_FirstLevelOpening.mjs",
    "./Script_FirstLevelLeaderGuide.mjs", "./Data_FirstLevelLeaderGuide.mjs",
    "./Data_FirstLevelMission.mjs", "./Data_FirstLevelMissionGates.mjs",
    "./Script_FirstLevelVillageBlock.mjs", "./Script_FirstLevelTransferCart.mjs",
    "./Script_FirstLevelQuietMarch.mjs", "./Script_FirstLevelReception.mjs",
    "./Script_FirstLevelBridge.mjs", "./Script_FirstLevelNightGate.mjs",
    "./Script_OpeningStoryboards.mjs", "./Script_FirstLevelCollection.mjs",
    "./Script_FirstLevelFrontShow.mjs", "./Script_FirstLevelFrontBattle.mjs",
  ];
  const referenced = new Map();
  for (const name of RUNTIME_SOURCES) {
    if (!fs.existsSync(new URL(name, import.meta.url))) continue;
    const text = Read(name);
    for (const [, id] of text.matchAll(/\b(?:Say|Enqueue|Replay|Guidance|PlayScene)\(\s*["']([A-Za-z][A-Za-z0-9]*)["']/g))
      referenced.set(id, name);
    for (const [, id] of text.matchAll(/\bPlayLine\(\s*["']([A-Za-z][A-Za-z0-9]*)\.\d\d["']/g)) referenced.set(id, name);
    for (const [, list] of text.matchAll(/\bCancel\(\s*\[([^\]]*)\]/g))
      for (const [, id] of list.matchAll(/["']([A-Za-z][A-Za-z0-9]*)["']/g)) referenced.set(id, name);
    for (const [, id] of text.matchAll(/voice\.(?:played|finished)\.has\(\s*["']([A-Za-z][A-Za-z0-9]*)["']/g))
      referenced.set(id, name);
  }
  for (const stage of MISSION_STAGES) if (stage.cue) referenced.set(stage.cue, "MISSION_STAGES");
  for (const spec of [...Object.values(MISSION_LEADER_STAGES), ...Object.values(MISSION_GUIDE_TRANSFERS)])
    referenced.set(spec.cue, "MISSION_LEADER_STAGES");
  assert.ok(referenced.size >= 40, "静态扫描至少应找到 40 个 cue 引用，实际 " + referenced.size);
  const missing = [...referenced].filter(([id]) => !byId.has(id));
  assert.deepEqual(missing, [], "运行时引用了台词表里没有的 cue：" + JSON.stringify(missing));
  // 09.23 新场景的触发点由第二波 Opening 包（新 01–02 导演）接上。**只许变短**。
  const SECOND_WAVE_UNWIRED = new Set([
    "BunkerOrders", "BunkerIncoming", "CaptiveDragged", "CaptiveInterrogation", "CaptiveTaunt", "ShunziFound",
    "RescueInterrogation", "RescueFlee", "RescueCheck", "CollectionMeet",
  ]);
  const unwired = story.map((cue) => cue.id).filter((id) => !referenced.has(id));
  for (const id of unwired) assert.ok(SECOND_WAVE_UNWIRED.has(id), "这条剧情 cue 没有任何触发点：" + id);
  console.log(`ok 运行时 ${referenced.size} 处 cue 引用全部落在台词表里（还有 ${unwired.length} 场等 Opening 包接触发点）`);
}

// 9. 导演表：每个逐句场景都有、每句都有、字段合法；具名事件齐全。
{
  const AFTER = /^(prev|start|gate|event:[A-Za-z]+)$/;
  const overrides = [];
  for (const cue of MISSION_DIALOGUE) {
    const scene = FIRST_LEVEL_DIALOGUE_DIRECTION[cue.id];
    if (!cue.perLine) { assert.ok(!scene, cue.id + " 整段录音不进逐句导演表"); continue; }
    assert.ok(scene, cue.id + " 缺导演时间轴");
    assert.deepEqual(Object.keys(scene.lines).sort(), cue.lines.map((_, i) => String(i + 1).padStart(2, "0")), cue.id + " 导演表逐句覆盖");
    cue.lines.forEach((line, index) => {
      const d = LineDirection(cue, index);
      assert.match(d.after, AFTER, line.id + " after 合法");
      assert.ok(d.offsetS === null || (Number.isFinite(d.offsetS) && d.offsetS >= -1.2 && d.offsetS <= 4), line.id + " offsetS 缺省沿用录音间隔，写了就在 −1.2–4 s");
      if (index && d.offsetS !== null) overrides.push(line.id);
      assert.ok(PROJECTION_DB[d.projection] != null, line.id + " projection 合法");
      assert.ok(d.intensity >= 0 && d.intensity <= 1, line.id + " intensity 0–1");
      assert.ok(["self", "head", "offscreen"].includes(d.spatial), line.id + " spatial 合法");
      if (line.who === "shunzi") assert.equal(d.spatial, "self", line.id + " 顺子是第一人称");
      if (index === 0) assert.ok(d.after !== "prev", line.id + " 第一句不能等上一句");
    });
  }
  for (const id of Object.keys(FIRST_LEVEL_DIALOGUE_DIRECTION)) assert.ok(byId.get(id)?.perLine, "导演表里有不存在或非逐句的场景：" + id);
  const Emits = (id) => Object.values(FIRST_LEVEL_DIALOGUE_DIRECTION[id].lines).flatMap((d) => [...(d.emit || []).map((e) => e.id), d.cutEvent].filter(Boolean));
  assert.deepEqual(Emits("BunkerIncoming"), ["BunkerBlast"], "「炮弹！趴下——！」被爆炸截断的那一刻发 BunkerBlast");
  assert.ok(LineDirection(byId.get("BunkerIncoming"), 0).cutAtS < 0, "截断点在句尾之前");
  assert.deepEqual(Emits("BorrowLight"), ["BorrowLightMatchesPocketed", "BorrowLightCigaretteOffered"], "借火两处动作空当各有事件");
  assert.ok(LineDirection(byId.get("BorrowLight"), 5).offsetS >= 1.8 && LineDirection(byId.get("BorrowLight"), 6).offsetS >= 2.8, "借火两处空当约 2 s 与 3 s");
  assert.ok(LineDirection(byId.get("BunkerSearch"), 1).offsetS < 0, "日兵丁压住丙的尾音（重叠）");
  assert.ok(LineDirection(byId.get("CaptiveInterrogation"), 5).offsetS < 0, "日兵乙压着翻译的话骂进来（重叠）");
  assert.equal(LineDirection(byId.get("CaptiveTaunt"), 0).after, "event:ThroatCut", "割喉后才嘲弄");
  assert.equal(LineDirection(byId.get("RescueInterrogation"), 5).after, "gate", "「说话！」等导演");
  // 默认沿用整段录音里的原始间隔：导演只覆盖稿里要等动作（gate / 事件 / 借火两处空当）与压尾音的几句。
  assert.deepEqual(overrides.sort(), ["BorrowLight.06", "BorrowLight.07", "BundleAttack.02", "BundleProne.02", "BunkerSearch.02",
    "CaptiveInterrogation.06", "FrontApproach.02", "RescueInterrogation.06"], "覆盖录音间隔的句子只有这几处");
  {
    const probe = new FirstLevelMissionVoice({ audio: { voiceBank: new Map() } });
    probe.manifest = { cues: {}, lines: { "BorrowLight.02": { gapBeforeS: 0.42 }, "BorrowLight.06": { gapBeforeS: 0.3 } } };
    const built = probe.BuildScene(byId.get("BorrowLight"));
    assert.equal(built.lines[1].direction.offsetS, 0.42, "没写覆盖的句子沿用录音里的间隔");
    assert.equal(built.lines[5].direction.offsetS, 2.0, "写了覆盖的以导演表为准（借火动作空当）");
    assert.equal(built.lines[2].direction.offsetS, FALLBACK_GAP_S, "缺录音时兜底间隔");
  }
  // 旧整段 cue 的事件照旧（07 以后与待下线的旧 cue）。
  const Events = (id, seconds) => (MissionVoiceTimeline(byId.get(id), seconds).segments[0].events || []).map((event) => event.id);
  assert.ok(Events("AircraftReturn", 8).includes("AircraftDiveOrder"), "AircraftReturn 要沿用 AircraftDiveOrder");
  assert.ok(Events("ZhouDeath", 30).includes("ZhouNoAnswer"), "ZhouDeath 的「……」要有事件");
  for (const cue of MISSION_DIALOGUE.filter((c) => !c.perLine)) {
    const plan = MissionVoiceTimeline(cue, Math.max(2, cue.lines.length * 2));
    assert.equal(plan.segments.length, 1, cue.id + " 一条录音只有一个区间，不许拆段");
    assert.equal(plan.lines.length, cue.lines.length, cue.id + " 每句一个区间");
  }
  console.log("ok 导演表逐句覆盖、字段合法；截断/重叠/等事件/等 gate 各有实例；整段录音不拆段");
}

// 10. 多声部播放器（假音频引擎：只记账）。
const FakeAudio = () => {
  const audio = {
    plays: [], stops: [], moves: [], duck: [], voiceBank: new Map(), t: 0,
    PlayDialogueLine(key, opts) { const voice = { key, ...opts, t: audio.t }; audio.plays.push(voice); return voice; },
    MoveVoice(voice, at) { audio.moves.push({ key: voice.key, at }); },
    StopVoice(voice) { audio.stops.push(voice.key); return true; },
    SetDialogueDuck(active, duck) { audio.duck.push({ active, at: audio.t, ...duck }); audio.dialogueYield = active; },
    PlayStoryVoice() { throw new Error("逐句场景不许走整段单槽"); }, StopStoryVoice() {},
  };
  return audio;
};
{
  // 10a. 一场有录音的对白：每句一个声源、各挂各的头、顺子居中、日兵丁压丙的尾音、侧链与让路。
  const audio = FakeAudio(), rows = [], events = [];
  for (const [i, s] of [[1, 1.3], [2, 1.0]]) audio.voiceBank.set(`MissionBunkerSearch_0${i}`, { duration: s, speechEnvelope: null });
  const voice = new FirstLevelMissionVoice({ audio, hud: { SayLines: (r) => rows.push(r.map((x) => x.text)), Say() {} },
    Event: (id, cue, detail) => events.push({ id, cue, ...detail }), Clock: () => audio.t });
  voice.manifest = { cues: {}, lines: { "BunkerSearch.01": { sha256: "a", seconds: 1.3 }, "BunkerSearch.02": { sha256: "b", seconds: 1.0 } } };
  const heads = { ijaC: { x: 10, y: 1.6, z: 0 }, ijaD: { x: 14, y: 1.6, z: 3 } };
  const handle = voice.PlayScene("BunkerSearch", { speakers: heads });
  const Step = (seconds) => { for (let i = 0; i < Math.round(seconds * 60); i++) { audio.t += 1 / 60; voice.Update(1 / 60); } };
  Step(0.05);
  assert.deepEqual(audio.plays.map((p) => p.key), ["MissionBunkerSearch_01"], "第一句单独起播");
  assert.deepEqual(audio.plays[0].position, heads.ijaC, "丙的声音挂在丙头上");
  assert.ok(audio.duck.at(-1).active && audio.dialogueYield, "开口即侧链压低、自主喊话让路");
  assert.equal(audio.duck.at(-1).ambienceDb, DIALOGUE_DUCK.ambienceDb);
  Step(1.1);
  assert.equal(audio.plays.length, 2, "丁在丙说完前 0.3 s 开口（重叠）");
  assert.deepEqual(audio.plays[1].position, heads.ijaD, "丁的声音挂在丁头上，不跟着丙跳");
  assert.ok(handle.playing.length === 2, "两句同时在响");
  assert.ok(rows.some((r) => r.length === 2), "重叠时两行字幕同时在");
  assert.deepEqual(events.filter((e) => e.id === "Line").map((e) => e.lineId), ["BunkerSearch.01", "BunkerSearch.02"]);
  Step(0.95);
  assert.ok(handle.done && voice.finished.has("BunkerSearch"), "场景走完记 Done");
  assert.ok(audio.duck.at(-1).active, "句间与句尾 holdS 内不放");
  Step(DIALOGUE_DUCK.holdS + 0.1);
  assert.equal(audio.duck.at(-1).active, false, "说完 holdS 后侧链放回、喊话恢复");
  console.log("ok 多声部：每句独立声源挂各自头上、可重叠、逐句字幕、侧链与喊话让路");
}
{
  // 10b. 截断事件、等事件、等 gate、顺子第一人称、暂停续播偏移、Skip。
  const audio = FakeAudio(), events = [];
  const player = new DialoguePlayer({ audio, Event: (id, scene, detail) => events.push(id), Clock: () => audio.t });
  const L = (id, who, duration, direction) => ({ id, index: Number(id.slice(-2)) - 1, who, key: "K" + id, duration, speaker: who, text: id, direction });
  const scene = { id: "T", priority: true, lines: [
    L("T.01", "shunzi", 1, { after: "start", offsetS: 0, spatial: "self" }),
    L("T.02", "shouter", 2, { after: "prev", offsetS: 0.2, spatial: "offscreen", cutAtS: -0.5, cutEvent: "Boom" }),
    L("T.03", "ijaA", 1, { after: "event:Cut", offsetS: 0.5, spatial: "head" }),
    L("T.04", "ijaB", 1, { after: "gate", offsetS: 0, spatial: "head" }),
  ] };
  let gateOpen = false;
  const handle = player.Play(scene, { speakers: { ijaA: () => ({ x: 1, y: 1.5, z: 1 }), ijaB: { position: { x: 2, y: 0, z: 2 } } }, gate: () => gateOpen });
  const Step = (seconds) => { for (let i = 0; i < Math.round(seconds * 60); i++) { audio.t += 1 / 60; player.Update(1 / 60); } };
  Step(0.02);
  assert.equal(audio.plays[0].firstPerson, true, "顺子走第一人称居中干声");
  assert.equal(audio.plays[0].position, null);
  Step(1.3);
  assert.equal(audio.plays[1].key, "KT.02");
  assert.ok(audio.plays[1].volume < 1 && audio.plays[1].position == null, "视线外解析不到位置的人：非定位 + 降电平");
  handle.Pause(); const paused = handle.lines[1].t; Step(3);
  assert.equal(handle.lines[1].t, paused, "暂停不推进句内时间");
  handle.Resume();
  assert.ok(Math.abs(audio.plays.at(-1).offset - paused) < 1e-9, "续播从保留的源偏移接上");
  Step(1.6);
  assert.ok(events.includes("Boom"), "截断点到了发 cutEvent");
  assert.equal(handle.lines[1].reason, "cut");
  Step(2);
  assert.equal(handle.lines[2].state, "pending", "等事件的句子不会自己开口");
  handle.Signal("Cut"); Step(0.4);
  assert.equal(handle.lines[2].state, "pending", "事件后还要等 offsetS");
  Step(0.2);
  assert.equal(handle.lines[2].state, "playing");
  assert.deepEqual(audio.plays.at(-1).position, { x: 1, y: 1.5, z: 1 }, "说话人可以是返回坐标的函数");
  Step(1.2);
  assert.equal(handle.lines[3].state, "pending", "gate 关着就等");
  gateOpen = true; Step(0.05);
  assert.equal(handle.lines[3].state, "playing");
  assert.deepEqual(audio.plays.at(-1).position, { x: 2, y: 1.5, z: 2 }, "演员没有头骨时退到脚底 + 1.5 m");
  handle.Skip(); Step(0.05);
  assert.ok(handle.done, "Skip 掐掉最后一句，场景结束");
  // Speech：只有正在说话的人张嘴。
  audio.voiceBank.set("KS.01", { speechEnvelope: { duration: 2 } });
  const speaking = player.Play({ id: "S", priority: true, lines: [L("S.01", "luo", 2, { after: "start", offsetS: 0 })] }, {});
  Step(0.5);
  assert.equal(player.Speech("luo", () => ({ level: 0.7, brightness: 0.5 })).active, true);
  assert.equal(player.Speech("luo", () => ({ level: 0.7, brightness: 0.5 })).jaw, 0.7);
  assert.equal(player.Speech("yaowa", () => ({ level: 1 })), null, "不说话的人不张嘴");
  player.faceTrackSampler = (line, t) => ({ jaw: 0.25, wide: 0.1, round: 0.2, close: 0.3, stress: 1 });
  assert.equal(player.Speech("luo").jaw, 0.25, "注入口型轨后优先读口型轨");
  speaking.Stop(); Step(0.1);
  console.log("ok 截断事件、等事件、等 gate、第一人称、视线外降电平、暂停续播、Skip、口型只给说话人");
}
{
  // 10c. 缺录音：逐句场景按估时走字幕与 Line 事件并 Done；旧整段 cue 照旧；未知 cue 只警告。
  const lines = [], done = [], warnings = [], said = [];
  const original = console.warn;
  console.warn = (message) => warnings.push(message);
  let voice;
  try {
    voice = new FirstLevelMissionVoice({
      audio: { PlayStoryVoice() { throw new Error("缺录音时不许碰音频引擎"); }, StopStoryVoice() {}, SetDialogueDuck() {} },
      hud: { Say: (speaker, text) => said.push(`${speaker}：${text}`) },
      Done: (id) => done.push(id),
      Event: (id, cue, detail) => { if (id === "Line") lines.push({ cue, ...detail }); },
    });
    voice.manifest = { cues: {}, lines: {} };
    assert.equal(voice.Enqueue("NoSuchCueAtAll"), false, "未知 cue 不入队");
    voice.Guidance("NoSuchCueAtAll"); voice.Cancel(["NoSuchCueAtAll"]); voice.Replay("NoSuchCueAtAll");
    for (const id of ["BorrowLight", "CaptiveInterrogation", "BunkerKilling"]) {
      assert.ok(voice.Enqueue(id), id + " 入队");
      for (let i = 0; i < 9000 && !done.includes(id); i++) voice.Update(1 / 60);
    }
  } finally { console.warn = original; }
  assert.deepEqual(done, ["BorrowLight", "CaptiveInterrogation", "BunkerKilling"], "缺录音的 cue 也要走完并 Done");
  assert.deepEqual(lines.filter((l) => l.cue === "BorrowLight").map((l) => l.index), [0, 1, 2, 3, 4, 5, 6, 7, 8], "借火九句按句序发 Line");
  assert.ok(lines.filter((l) => l.cue === "BorrowLight").every((l) => l.lineId?.startsWith("BorrowLight.")), "逐句 Line 事件带 lineId");
  assert.deepEqual(lines.filter((l) => l.cue === "BunkerKilling").map((l) => l.index), [0, 1, 2, 3, 4, 5], "旧整段审问仍逐句发 Line");
  assert.ok(said.includes("日兵甲：他们的部队往哪儿撤了！问他！"), "日语行字幕是中文译文");
  assert.ok(said.includes("日兵甲：别动，混蛋！"), "旧整段的日语行也是译文");
  assert.ok(said.every((row) => !/[぀-ヿ]/.test(row)), "字幕里不许出现假名");
  assert.ok(warnings.some((text) => text.includes("NoSuchCueAtAll")), "未知 cue 警告一次");
  assert.deepEqual(voice.State().unknown, ["NoSuchCueAtAll"]);
  console.log("ok 缺录音兜底：逐句按估时、旧整段照旧，字幕/Line/Done 齐全，未知 cue 只警告");
}
{
  // 10c'. 排队播放的逐句场景给旧读法的 current.plan.lines / sourceTime / index（开场分镜按它找「谁在说」）。
  const voice = new FirstLevelMissionVoice({ audio: { PlayStoryVoice() {}, StopStoryVoice() {}, SetDialogueDuck() {} }, hud: { Say() {} } });
  voice.manifest = { cues: {}, lines: {} };
  voice.Enqueue("SupportOrder");
  const seen = new Set();
  for (let i = 0; i < 3000 && !voice.finished.has("SupportOrder"); i++) {
    voice.Update(1 / 60);
    const current = voice.current;
    if (!current) continue;
    const index = current.plan.lines.findIndex(([start, end]) => current.sourceTime >= start && current.sourceTime < end);
    if (index >= 0) { assert.equal(index, current.index, "plan.lines 与 index 指向同一句"); seen.add(current.cue.lines[index].who); }
  }
  assert.deepEqual([...seen].sort(), ["guard", "luo", "shunzi"], "按 plan.lines 找得到每个说话人");
  console.log("ok 排队的逐句场景兼容旧读法：current.plan.lines / sourceTime / index");
}
{
  // 10d. 旧整段录音的说话人路由不变（待下线的 09.21 cue）。
  const routes = [], plays = [];
  const audio = {
    PlayStoryVoice(key, options) { const voice = { key }; this.storyVoice = voice; plays.push({ key, options, voice }); return { voice }; },
    StopStoryVoice() { this.storyVoice = null; },
    SetStoryVoiceSpeaker(voice, options) { routes.push({ voice, ...options }); },
  };
  const voice = new FirstLevelMissionVoice({ audio, hud: { Say() {} }, Position: () => ({ x: 8, y: 1.6, z: 0 }) });
  voice.manifest = { cues: { RescueCall: { seconds: 10.8 } }, lines: {} };
  voice.Enqueue("RescueCall");
  for (let i = 0; i < 700; i++) voice.Update(1 / 60);
  assert.equal(plays.length, 1, "整段录音换说话人不拆条");
  assert.ok(plays[0].options.dialogue);
  assert.ok(routes.some((row) => row.who === "shunzi" && row.firstPerson), "顺子走第一人称");
  assert.ok(routes.some((row) => row.who === "interpreter" && !row.firstPerson), "翻译是世界声源");
  const gap = { cue: byId.get("RescueCall"), plan: MissionVoiceTimeline(byId.get("RescueCall"), 10.8), sourceTime: 8.5 };
  assert.equal(voice.Speaker(gap).who, "shunzi");
  console.log("ok 旧整段录音的说话人路由不变");
}
{
  // 11. 班组战斗短句用各人自己的嗓子。
  // 11a. 录哪些句子由运行时真会从这个人嘴里出来的那几条决定：直接从 Script_Ai 的源码里读，Script_Ai 改了喊法这里就红。
  const aiSource = Read("./Script_Ai.mjs");
  const table = aiSource.slice(aiSource.indexOf("const BARK_LINES"), aiSource.indexOf("});", aiSource.indexOf("const BARK_LINES")));
  const nraPicks = [...table.matchAll(/nra: \{ kind: "(\w+)"(?:, key: "(\w+)")? \}/g)].map(([, kind, key]) => ({ kind, key }));
  for (const kind of [...aiSource.matchAll(/\.Bark\("(\w+)", \{ position: [^}]*side: (?:s|this)\.side \}\)/g)].map(([, kind]) => kind)) nraPicks.push({ kind });
  const nra = VOICE_LINES.filter((line) => (line.side || "nra") === "nra" && line.kind !== "story");
  // hurt_down（「班长哦！班长！」）是旁人喊阵亡的人（Script_Ai.Kill 用阵亡处的位置），不归喊话的这个人；真人素材句不分人。
  const expectedSquad = new Set(nraPicks.flatMap(({ kind, key }) => key ? [key]
    : nra.filter((line) => line.kind === kind && !line.event && !line.sample && line.key !== "hurt_down").map((line) => line.key)));
  assert.deepEqual([...SQUAD_BARK_KEYS.squad].sort(), [...expectedSquad].sort(), "班组 AI 会喊的中方口令每条都有本人版本");
  const orders = aiSource.slice(aiSource.indexOf("const ORDER_LINE"), aiSource.indexOf("};", aiSource.indexOf("const ORDER_LINE")));
  assert.deepEqual([...SQUAD_BARK_KEYS.player].sort(), [...new Set([...orders.matchAll(/: "(\w+)"/g)].map(([, key]) => key))].sort(),
    "玩家（顺子）下令喊的每条都有本人版本");
  for (const { key } of SquadBarkEntries()) assert.ok(nra.some((line) => line.key === key && !line.event), key + " 是 Data_Voice 里的中方非 event 口令（文本一字不改）");
  for (const who of Object.keys(SQUAD_BARK_CAST)) assert.ok(FIRST_LEVEL_VOICE_CAST[who] && !FIRST_LEVEL_VOICE_CAST[who].sharesWith, who + " 有自己的定妆音");
  assert.equal(new Set(SquadBarkEntries().map((e) => e.file)).size, SquadBarkEntries().length, "文件名不撞");

  // 11b. 认人：喊话位置对上某人现在的位置（≤ BARK_SPEAKER_MATCH_M，取最近），玩家下令对顺子；找不到的人退回玩家那一点，不算数。
  const V = (x, y, z) => ({ x, y, z, distanceTo(o) { return Math.hypot(x - o.x, y - o.y, z - o.z); } });
  const heads = { luo: V(5, 1.5, 0), yaowa: V(5.9, 1.5, 0), zhou: null };
  const probe = new FirstLevelMissionVoice({ audio: { voiceBank: new Map() },
    Position: (cue, line) => { assert.equal(cue.id, "SquadBark"); return line.who in heads ? heads[line.who] : V(0, 1.5, 0); },
    Listener: () => V(0.1, 1.6, 0) });
  assert.equal(probe.BarkSpeaker({ seed: 12, side: "nra", position: V(5.2, 0, 0.1) }), "luo", "脚底对头：认出罗班长");
  assert.equal(probe.BarkSpeaker({ seed: 13, side: "nra", position: V(5.6, 0, 0) }), "yaowa", "两人都在范围内取最近的");
  assert.equal(probe.BarkSpeaker({ seed: 12, side: "nra", position: V(5 + BARK_SPEAKER_MATCH_M + 0.95, 0, 3) }), null, "离谁都远：公用声库");
  assert.equal(probe.BarkSpeaker({ seed: 12, side: "ija", position: V(5, 0, 0) }), null, "日军不认");
  assert.equal(probe.BarkSpeaker({ seed: 12, side: "nra", position: V(0, 0, 0) }), null, "找不到的人退回玩家那一点，不许把玩家身边的兵认成他");
  assert.equal(probe.BarkSpeaker({ seed: 0, priority: true, side: "nra", position: V(0, 0, 0) }), "shunzi", "玩家下令是顺子");
  assert.equal(probe.BarkSpeaker({ seed: 0, priority: true, side: "nra", position: V(4, 0, 0) }), null, "不在玩家脚下的无种子喊话不算顺子");
  assert.equal(new FirstLevelMissionVoice({ audio: {}, Position: () => { throw new Error("boom"); } })
    .BarkSpeaker({ seed: 3, side: "nra", position: V(0, 0, 0) }), null, "认人出错只退回公用声库");
  {
    const audio = { voiceBank: new Map() };
    const disposed = new FirstLevelMissionVoice({ audio, Position: () => null });
    disposed.dialogue.StopAll = () => {}; audio.StopStoryVoice = () => {};
    disposed.barkSpeakerHook = () => "luo"; audio.barkSpeaker = disposed.barkSpeakerHook;
    disposed.Dispose();
    assert.equal(audio.barkSpeaker, null, "离开第一关摘掉认人钩子");
  }

  // 11c. Script_Audio.Bark：认出是谁只在他自己的版本里挑，不变调；没有本人版本的 TTS 句不说，真人素材照常；
  //      本人版本不进公用池子；认不出、或这个人一条本人版本都没有，照旧用公用声库。
  const bank = new Map(nra.map((line) => [line.key, { ...line }]));
  for (const key of ["spot_enemy", "spot_gap", "hurt_hit", "rally_hold"]) {
    const who = key === "rally_hold" ? "shunzi" : "luo";
    bank.set(SquadBarkKey(key, who), { key: SquadBarkKey(key, who), kind: nra.find((l) => l.key === key).kind, side: "nra", barkOf: who, base: key });
  }
  const played = [];
  const engine = { ctx: { currentTime: 0 }, disposed: false, voicesReady: true, voiceMute: false, listenerPos: { x: 0, y: 0, z: 0 },
    lastBarkAt: -99, lastBarkKindAt: new Map(), voiceBank: bank, barkCounter: 0, drops: { dialogue: 0, distance: 0 },
    Play(name, options) { played.push({ name, pitch: options.pitch }); return {}; },
    barkSpeaker: ({ seed, priority }) => seed === 7 ? "luo" : seed === 0 && priority ? "shunzi" : seed === 9 ? "yaowa" : null };
  const Bark = (kind, options) => { engine.lastBarkAt = -99; engine.lastBarkKindAt.clear(); played.length = 0;
    AudioEngine.prototype.Bark.call(engine, kind, options); return played[0]; };
  const Many = (kind, options, n = 40) => Array.from({ length: n }, () => Bark(kind, options));
  const luoSpot = Many("spot", { seed: 7 });
  assert.ok(luoSpot.every((p) => ["voice.spot_enemy@luo", "voice.spot_gap@luo"].includes(p.name) && p.pitch === 1),
    "罗班长喊 spot 只挑他自己的版本、不变调：" + [...new Set(luoSpot.map((p) => p.name))]);
  assert.ok(Many("hurt", { seed: 7 }).every((p) => ["voice.hurt_hit@luo", "voice.hurt_scream"].includes(p.name)), "中弹：本人版本或真人素材，不说别人嗓子的 TTS");
  const generic = Many("spot", { seed: 3 });
  assert.ok(generic.every((p) => !p.name.includes("@")) && generic.some((p) => p.pitch !== 1), "认不出的兵：公用声库、照旧 ±4% 变调");
  assert.ok(Many("spot", { seed: 9 }).every((p) => !p.name.includes("@")), "认出的人一条本人版本都没有：退回公用声库");
  assert.equal(Bark("spot", { seed: 3, who: "luo" }).name.includes("@luo"), true, "调用方直接给 who 也认");
  assert.equal(Bark("rally", { key: "rally_hold", priority: true }).name, "voice.rally_hold@shunzi", "玩家下令点名的那句用顺子自己的版本");
  assert.equal(Bark("rally", { key: "rally_follow", priority: true }).name, "voice.rally_follow", "点名的句子顺子没有本人版本：用公用那条");
  engine.barkSpeaker = null;
  assert.ok(Many("spot", { seed: 7 }).every((p) => !p.name.includes("@")), "没装认人钩子（07 以后）：本人版本不进公用池子");
  console.log(`ok 班组战斗短句：${SquadBarkEntries().length} 条本人版本覆盖 AI 会喊的与玩家下令的每一句；按位置认人；Bark 只在本人版本里挑、不变调`);
}

if (process.argv.includes("--audio")) {
  const { MeasureVoice, TruePeakDb, FrameRms, DecodePcm } = await import("./Script_SeedAudioVoiceKit.mjs");
  const { ScenePrompt, SceneReferences, SCENE_CHECK } = await import("./Script_SeedAudioFirstLevelBake.mjs");
  const Local = (url) => decodeURIComponent(url.pathname).replace(/^\/([A-Za-z]:)/, "$1");
  // 片段与整段同一段的波形相关（±20 ms 找对齐）与电平差。
  const CompareToScene = (slice, scene, startS, endS) => {
    const sr = 16000, a = DecodePcm(slice, sr), whole = DecodePcm(scene, sr);
    const s0 = Math.round(startS * sr), n = Math.min(a.length, Math.round((endS - startS) * sr));
    let best = -1, bestLevel = 0;
    for (let lag = -320; lag <= 320; lag += 4) {
      let xy = 0, xx = 0, yy = 0;
      for (let i = 160; i < n - 160; i++) { const y = whole[s0 + i + lag] || 0, x = a[i]; xy += x * y; xx += x * x; yy += y * y; }
      const c = xy / Math.sqrt(xx * yy + 1e-12);
      if (c > best) { best = c; bestLevel = 10 * Math.log10((xx + 1e-12) / (yy + 1e-12)); }
    }
    return { correlation: +best.toFixed(3), levelDb: +bestLevel.toFixed(2) };
  };
  let requestsTotal = 0, sceneCount = 0;
  const patchedLines = [];
  const manifest = JSON.parse(Read("./Audio/FirstLevel/Data_FirstLevelVoiceManifest.json"));
  const timings = fs.existsSync(new URL("./Audio/FirstLevel/Data_FirstLevelLineTimings.json", import.meta.url))
    ? JSON.parse(Read("./Audio/FirstLevel/Data_FirstLevelLineTimings.json")) : {};
  const reviews = fs.existsSync(new URL("./Audio/FirstLevel/Data_FirstLevelVoiceTranscriptReview.json", import.meta.url))
    ? JSON.parse(Read("./Audio/FirstLevel/Data_FirstLevelVoiceTranscriptReview.json")).lines || {} : {};
  const usedReviews = new Set();
  manifest.lines ||= {};
  // 逐句录音还没烘的 01–06 场景（Step 2 全量生成后清空）。**只许变短**。
  const PENDING_PER_LINE_BAKE = new Set(perLine.map((cue) => cue.id).filter((id) => !byId.get(id).lines.every((line) => manifest.lines[line.id])));
  const Hash = (text) => crypto.createHash("sha256").update(text).digest("hex");
  let seconds = 0, lineCount = 0;
  for (const cue of MISSION_DIALOGUE) {
    const recorded = cue.perLine && cue.lines.every((line) => manifest.lines[line.id]);
    if (recorded) {
      assert.ok(!manifest.cues[cue.id], cue.id + " 切句录齐后旧的带环境声整段条目要去掉");
      // 整段：一个场景 = 一次请求 = 一条干声录音（用户 2026-09-23：同一段对白一次生成，保证是同一个环境）。
      const scene = manifest.scenes?.[cue.id];
      assert.ok(scene, cue.id + " 缺整段录音条目 manifest.scenes");
      const sceneUrl = new URL("./Audio/FirstLevel/" + cue.file, import.meta.url), scenePath = Local(sceneUrl);
      assert.ok(fs.existsSync(sceneUrl), cue.id + " 整段录音文件保留（切句的来源与回退）");
      const sceneBytes = fs.readFileSync(sceneUrl);
      assert.equal(sceneBytes.length, scene.bytes, cue.id + " 整段字节数");
      assert.equal(Hash(sceneBytes), scene.sha256, cue.id + " 整段内容哈希");
      assert.equal(scene.promptHash, Hash(ScenePrompt(cue)), cue.id + " 整段录音对应当前提示词");
      assert.equal(scene.castKey, SceneReferences(cue).map((r) => r.sha256).join(","), cue.id + " 整段用的是当前选定的定妆参考音");
      assert.ok(SceneReferences(cue).length <= 3, cue.id + " 参考音最多 3 条");
      assert.deepEqual(scene.lines, cue.lines.map((line) => line.id), cue.id + " 整段覆盖本场每一句");
      const patched = new Set(scene.patched || []);
      assert.equal(scene.requests, scene.attempts.length + cue.lines.reduce((n, line) => n + (manifest.lines[line.id].patch?.takes || 0), 0),
        cue.id + " 请求次数 = 整段生成次数 + 单句补录次数");
      assert.ok(scene.attempts.length >= 1 && scene.attempts.length <= SCENE_CHECK.maxAttempts, cue.id + " 整段最多生成 " + SCENE_CHECK.maxAttempts + " 次");
      assert.ok(scene.attempts.some((a) => a.n === scene.attempt), cue.id + " 选中的那次生成在记录里");
      // 选中的那次生成若有硬错误，只许是「某句分错嗓子 / 念错」且那句已经单独补录。
      for (const why of scene.hard) {
        const id = /^([A-Za-z]+\.\d\d) /.exec(why)?.[1];
        assert.ok(id && patched.has(id), cue.id + " 装上的整段带着没处理的硬错误：" + why);
      }
      // 整段只拉一次电平；个别场景原始 take 有尖刺（句尾咔嗒、喊到满幅），为守住真峰值 −1 dBTP 整段统一再降过几 dB，所以只许比目标低、最多低 5 dB。
      assert.ok(scene.measure.activeRmsDb <= scene.targetDb + 1.5 && scene.measure.activeRmsDb >= scene.targetDb - 5, `${cue.id} 整段有声段 ${scene.measure.activeRmsDb} 与目标 ${scene.targetDb}（+1.5 / −5 dB）`);
      assert.ok(TruePeakDb(scenePath) <= -0.9, cue.id + " 整段真峰值 ≤ −1 dBTP");
      // 底噪看整段（同一条录音同一个底噪）；片段里的静音多是喘气、气声，不拿来当底噪。
      assert.ok(scene.measure.snrDb >= 30, `${cue.id} 整段信噪比 ${scene.measure.snrDb} dB（干声不许带底噪/环境声）`);
      requestsTotal += scene.requests; sceneCount++;
      const frames = FrameRms(scenePath);
      let previousEnd = null;
      cue.lines.forEach((line, index) => {
        const entry = manifest.lines[line.id], url = new URL("./Audio/FirstLevel/" + line.file, import.meta.url), file = Local(url);
        assert.ok(fs.existsSync(url), line.id + " 片段文件存在");
        const bytes = fs.readFileSync(url);
        assert.equal(bytes.length, entry.bytes, line.id + " 字节数");
        assert.equal(Hash(bytes), entry.sha256, line.id + " 内容哈希");
        assert.equal(entry.sceneSha256, scene.sha256, line.id + " 片段来自当前这条整段录音");
        assert.ok(entry.sceneStartS >= 0 && entry.sceneEndS > entry.sceneStartS && entry.sceneEndS <= scene.seconds + 0.02, line.id + " 片段区间落在整段里");
        if (previousEnd != null) {
          assert.ok(entry.sceneStartS >= previousEnd - 0.002, line.id + " 片段按句序、互不重叠");
          assert.ok(Math.abs(entry.gapBeforeS - (entry.sceneStartS - previousEnd)) < 0.002, line.id + " gapBeforeS = 整段里与上一句的原始间隔");
        }
        previousEnd = entry.sceneEndS;
        // 切点落在静音里（两句贴着说的才允许在能量最低处切，清单标 tight）。
        const Edge = (t0, t1) => {
          let peak = 0;
          for (let f = Math.round(t0 / frames.hopS); f <= Math.round(t1 / frames.hopS) && f < frames.frames.length; f++) peak = Math.max(peak, frames.frames[f]);
          return 20 * Math.log10(Math.max(peak, 1e-9)) - scene.measure.activeRmsDb;
        };
        if (index && !entry.tight[0]) assert.ok(Edge(entry.sceneStartS, entry.sceneStartS + 0.02) <= -24, `${line.id} 句首切点在静音里（${Edge(entry.sceneStartS, entry.sceneStartS + 0.02).toFixed(1)} dB）`);
        if (index < cue.lines.length - 1 && !entry.tight[1]) assert.ok(Edge(entry.sceneEndS - 0.02, entry.sceneEndS) <= -24, `${line.id} 句尾切点在静音里`);
        const m = MeasureVoice(file), tp = TruePeakDb(file);
        assert.ok(tp <= -0.9, `${line.id} 真峰值 ${tp.toFixed(2)} dBTP ≤ −1`);
        assert.ok(timings[entry.sha256]?.lineId === line.id && timings[entry.sha256].chars.length > 0, line.id + " 有逐字时间（以片段 sha256 为键）");
        assert.ok(timings[entry.sha256].chars.every(([, a, b]) => a >= 0 && b >= a && b <= entry.seconds + 0.05), line.id + " 逐字时间落在片段里");
        if (entry.source === "patch") {
          // 例外：这一句在整段里分错了嗓子 / 念错，单独补录；电平对齐到整段里原来那一片。
          assert.ok(patched.has(line.id) && entry.patch?.reason && entry.patch.replacedSha256, line.id + " 补录要有记录");
          assert.ok(Math.abs(m.activeRmsDb - entry.patch.targetDb) <= 1.5, `${line.id} 补录电平 ${m.activeRmsDb} 对齐整段里原来那一片 ${entry.patch.targetDb}`);
          patchedLines.push(line.id);
        } else {
          assert.equal(entry.source, "scene", line.id + " 来源");
          assert.equal(entry.metrics.sceneGainDb, scene.gainDb, line.id + " 电平是整段一次母带的结果（片段不单独归一）");
          // 片段就是整段里那一段：同一段解码出来波形相关 ≥ 0.98、电平差 ≤ 0.5 dB。
          const same = CompareToScene(file, scenePath, entry.sceneStartS, entry.sceneEndS);
          assert.ok(same.correlation >= 0.98 && Math.abs(same.levelDb) <= 0.5, `${line.id} 片段与整段 ${entry.sceneStartS}–${entry.sceneEndS} s 对不上（相关 ${same.correlation}、电平差 ${same.levelDb} dB）`);
        }
        // 嗓子：够长的片段与本场挂了参考音的其他人比，不许明显更像别人。
        const judged = entry.metrics.voicedS >= SCENE_CHECK.judgeVoicedS;
        const other = entry.metrics.referencedOther;
        if (judged && other && entry.source === "scene")
          assert.ok(other[1] - entry.metrics.speakerCos <= SCENE_CHECK.wrongVoiceMargin, `${line.id} 更像${other[0]}的嗓子（本人 ${entry.metrics.speakerCos} / ${other[1]}）`);
        // 字错率：超门槛要有绑定这条片段的人工核对记录；字数都差得多的算念错（不许放行）。
        assert.ok(Number.isFinite(entry.metrics.cer), line.id + " 转写量过");
        const review = reviews[line.id];
        if (entry.metrics.cer > SCENE_CHECK.maxCer) {
          assert.ok(review && review.sha256 === entry.sha256 && review.transcript === entry.metrics.transcript && review.note,
            `${line.id} 字错率 ${entry.metrics.cer} 超门槛，又没有绑定这条录音的人工核对记录（Data_FirstLevelVoiceTranscriptReview.json）`);
          usedReviews.add(line.id);
          const want = [...MissionVoiceSpoken(cue, index)].filter((c) => /[\p{L}\p{N}]/u.test(c)).length;
          if (judged && entry.metrics.cer > SCENE_CHECK.reviewedMaxCer)
            assert.ok(Math.abs(entry.metrics.lengthDiff ?? 99) <= Math.max(2, 0.3 * want), `${line.id} 字错率 ${entry.metrics.cer} 且字数差 ${entry.metrics.lengthDiff}：念错 / 漏词不许核对放行`);
        }
        seconds += entry.seconds; lineCount++;
      });
      continue;
    }
    if (cue.perLine && !manifest.cues[cue.id]) { assert.ok(PENDING_PER_LINE_BAKE.has(cue.id)); continue; }
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
    assert.equal(aligned.scriptSha256, Hash(MissionVoiceScriptJson(cue)), cue.id + " 对齐用的是当前完整台词");
    const bytes = fs.readFileSync(new URL("./Audio/FirstLevel/" + cue.file, import.meta.url));
    assert.equal(bytes.length, entry.bytes, cue.id + " 字节数");
    assert.equal(Hash(bytes), entry.sha256, cue.id + " 内容哈希");
    if (!cue.perLine) assert.equal(Hash(MissionVoicePrompt(cue)), entry.promptHash, cue.id + " 录音对应的是当前提示词");
    seconds += entry.seconds;
  }
  for (const id of Object.keys(manifest.cues)) assert.ok(byId.has(id), "清单里有已下线的 cue：" + id);
  for (const id of Object.keys(manifest.lines)) assert.ok(perLine.some((cue) => cue.lines.some((line) => line.id === id)), "清单里有已下线的句：" + id);
  for (const id of Object.keys(reviews)) assert.ok(usedReviews.has(id), "转写核对记录已过期（录音换了或不再超门槛），删掉：" + id);
  const files = new Set(MISSION_DIALOGUE.filter((cue) => manifest.cues[cue.id] || manifest.scenes?.[cue.id]).map((cue) => cue.file));
  for (const name of fs.readdirSync(new URL("./Audio/FirstLevel/", import.meta.url)))
    if (name.endsWith(".mp3")) assert.ok(files.has(name), "Audio/FirstLevel 里有已下线的录音：" + name);
  const lineDir = new URL("./Audio/FirstLevel/Lines/", import.meta.url);
  if (fs.existsSync(lineDir)) {
    const lineFiles = new Set(Object.values(manifest.lines).map((entry) => entry.file.replace(/^Lines\//, "")));
    for (const name of fs.readdirSync(lineDir)) assert.ok(lineFiles.has(name), "Lines 里有清单外的录音：" + name);
  }
  const death = manifest.cues.ZhouDeath;
  assert.ok(death.seconds >= 12 && death.seconds <= 34, `整段确认死亡的录音应在 12—34 秒，实际 ${death.seconds}`);
  console.log(`ok 录音：整段生成切句 ${sceneCount} 场 ${lineCount} 句（请求 ${requestsTotal} 次，单句补录 ${patchedLines.length} 句${patchedLines.length ? "：" + patchedLines.join(",") : ""}）+ 旧整段 ${Object.keys(manifest.cues).length} 条，总长 ${seconds.toFixed(1)} 秒；待烘场景 ${PENDING_PER_LINE_BAKE.size} 个：${[...PENDING_PER_LINE_BAKE].join(",")}`);

  const { VOICE_LINES } = await import("./Data_Voice.mjs");
  // 日军自主喊话：日语纯假名、3 个固定日本兵嗓子（契约 §2.3），录音绑定定妆音 sha。
  const barks = VOICE_LINES.filter((line) => line.side === "ija" && line.kind !== "story");
  const barkManifest = JSON.parse(Read("./Audio/Data_IjaBarkManifest.json"));
  const castManifest = JSON.parse(Read("./Audio/FirstLevel/Data_FirstLevelVoiceCastManifest.json"));
  const sichuanBarks = JSON.parse(Read("./Audio/Data_SichuanBarkManifest.json"));
  assert.equal(barkManifest.model, "seed-audio-1.0");
  const VOICE_BY_ROLE = { "分隊長": "ijaA", "古兵": "ijaB", "兵": "ijaD" };
  for (const line of barks) {
    const entry = barkManifest.cues[line.key];
    assert.ok(!line.dialect && /^[ぁ-ヿ！？、。]+$/.test(line.text), line.key + " 日军口令是日语纯假名（不再是四川话）");
    assert.equal(line.voice, VOICE_BY_ROLE[line.role], line.key + " 按角色固定嗓子");
    assert.ok(entry, line.key + " 有日语重录记录");
    assert.equal(entry.text, line.text); assert.equal(entry.version, line.version); assert.equal(entry.voice, line.voice);
    assert.equal(entry.castSha256, castManifest.cast[line.voice].sha256, line.key + " 用的是当前选定的定妆音");
    assert.equal(entry.seconds, line.dur);
    assert.equal(entry.sha256, Hash(fs.readFileSync(new URL("./Audio/" + line.file, import.meta.url))), line.key + " 录音哈希");
    assert.ok(!sichuanBarks.cues[line.key], line.key + " 的四川话旧记录要删掉");
  }
  for (const key of ["ija_spot_roof", "ija_spot_wall"]) assert.ok(barks.find((line) => line.key === key)?.event, key + " 只能点名触发（event）");
  console.log(`ok ${barks.length} 条日军自主喊话：日语纯假名、${new Set(barks.map((l) => l.voice)).size} 个固定嗓子、录音与定妆音绑定`);

  // 班组战斗短句：一人一次请求（只有硬错误才整条重抽，最多 3 次），逐句齐平到战斗口令同一档，嗓子是本人的。
  const { BarkPrompt, CHECK: BARK_CHECK } = await import("./Script_SeedAudioSquadBarkBake.mjs");
  const squad = JSON.parse(Read("./Audio/FirstLevel/Data_FirstLevelSquadBarkManifest.json"));
  assert.equal(squad.model, "seed-audio-1.0");
  let squadRequests = 0, judged = 0, own = 0, flagged = 0;
  for (const who of Object.keys(SQUAD_BARK_CAST)) {
    const person = squad.people[who];
    assert.ok(person, who + " 的本人版本还没录（Script_SeedAudioSquadBarkBake.mjs）");
    assert.equal(person.promptHash, Hash(BarkPrompt(who)), who + " 录音对应当前提示词");
    assert.equal(person.castSha256, castManifest.cast[who].sha256, who + " 用的是当前选定的定妆音");
    assert.ok(person.requests >= 1 && person.requests <= BARK_CHECK.maxAttempts && person.requests === person.attempts.length, who + " 请求次数 1–3 且与生成记录一致");
    assert.deepEqual(person.attempts.find((a) => a.n === person.picked)?.hard, [], who + " 装上的那次生成没有硬错误");
    squadRequests += person.requests;
    let wrong = 0, long = 0;
    for (const entry of SquadBarkEntries().filter((e) => e.who === who)) {
      const bark = squad.barks[entry.bank], url = new URL("./Audio/FirstLevel/" + entry.file, import.meta.url);
      assert.ok(bark && fs.existsSync(url), entry.bank + " 录音存在");
      assert.equal(bark.sha256, Hash(fs.readFileSync(url)), entry.bank + " 录音哈希");
      assert.equal(bark.text, VOICE_LINES.find((line) => line.key === entry.key && (line.side || "nra") === "nra").text, entry.bank + " 念的是 Data_Voice 里那句");
      const m = MeasureVoice(Local(url)), tp = TruePeakDb(Local(url));
      assert.ok(m.seconds >= BARK_CHECK.minSeconds && m.seconds <= BARK_CHECK.maxSeconds, `${entry.bank} 时长 ${m.seconds} s（战斗 Bark 0.3–2.6 s）`);
      assert.ok(tp <= -0.9, `${entry.bank} 真峰值 ${tp.toFixed(2)} dBTP ≤ −1`);
      // 逐句齐平到 −16.1；喊得很冲的句子峰均比大，限幅先到，只许比目标低（最多 2.5 dB）。
      assert.ok(m.activeRmsDb <= BARK_CHECK.targetRmsDb + BARK_CHECK.rmsTolDb && m.activeRmsDb >= BARK_CHECK.targetRmsDb - 2.5,
        `${entry.bank} 有声段 ${m.activeRmsDb} dB（目标 ${BARK_CHECK.targetRmsDb}）`);
      assert.ok(m.snrDb >= 30, `${entry.bank} 信噪比 ${m.snrDb} dB`);
      assert.ok(Number.isFinite(bark.cer) && Number.isFinite(bark.speakerCos), entry.bank + " 转写与嗓子量过");
      const want = [...bark.text].filter((c) => /[\p{L}\p{N}]/u.test(c)).length, got = [...(bark.transcript || "")].filter((c) => /[\p{L}\p{N}]/u.test(c)).length;
      if (bark.voicedS >= BARK_CHECK.judgeVoicedS && bark.cer > BARK_CHECK.reviewedMaxCer)
        assert.ok(Math.abs(got - want) <= Math.max(2, 0.3 * want), `${entry.bank} 字错率 ${bark.cer} 且字数差 ${got - want}：念错 / 漏词`);
      if (bark.cer > BARK_CHECK.maxCer) flagged++;
      if (bark.voicedS >= BARK_CHECK.judgeVoicedS) {
        long++; judged++;
        const closer = bark.nearestOther && bark.nearestOther[1] - bark.speakerCos > BARK_CHECK.wrongVoiceMargin;
        if (closer) wrong++; else own++;
      }
    }
    assert.ok(!long || wrong / long <= BARK_CHECK.wrongVoiceShare, `${who} 有 ${wrong}/${long} 句更像别人的定妆音`);
  }
  for (const bank of Object.keys(squad.barks)) assert.ok(SquadBarkEntries().some((e) => e.bank === bank), "清单里有已下线的本人版本：" + bank);
  const barkDir = new URL("./Audio/FirstLevel/Barks/", import.meta.url);
  const barkFiles = new Set(SquadBarkEntries().map((e) => e.file.replace(/^Barks\//, "")));
  for (const name of fs.readdirSync(barkDir)) assert.ok(barkFiles.has(name), "Barks 里有清单外的录音：" + name);
  console.log(`ok 班组战斗短句本人版本 ${SquadBarkEntries().length} 条，${Object.keys(SQUAD_BARK_CAST).length} 人共请求 ${squadRequests} 次；够长的 ${judged} 句里 ${own} 句离本人定妆音最近；字错率超 ${BARK_CHECK.maxCer} 待人工试听 ${flagged} 句（字数对得上，多是四川话被写成普通话同音字）`);
} else {
  console.log("ok 台词数据侧全绿；录音资产需要 --audio 验收");
}
