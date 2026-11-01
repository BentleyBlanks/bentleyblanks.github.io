// Data_FirstLevelMissionDialogue.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。

import { JAPANESE_SPEECH } from "./Data_FirstLevelJapaneseSpeech.mjs";
import { MISSION_DIALOGUE, MISSION_VOICE_CAST, NORTHERN_SPEAKERS, SOUNDSCAPES, SOUNDSCAPE_DEFAULT, SOUNDSCAPE_ZONES } from "./Data_FirstLevelMissionDialogue.mjs";

/** 送 TTS 的写法：日语行取假名侧表，其余取 line.tts ?? line.text。 */
export function MissionVoiceSpoken(cue, index) {
  const line = cue.lines[index];
  return JAPANESE_SPEECH[line.id]?.kana ?? JAPANESE_SPEECH[`${cue.id}:${index}`]?.kana ?? line.tts ?? line.text;
}

/** 屏幕字幕文本（日语行显示中文译文）。 */
export const MissionVoiceSubtitle = (cue, index) => cue.lines[index].subtitle ?? cue.lines[index].text;

/**
 * 对齐与清单绑定用的「当前台词」规范串。baker、门禁与 Script_FirstLevelVoiceAlign.py
 * 三处共用同一口径：只取 who 与 text，逐行字段（tts/subtitle/lang）不进哈希。
 */
export const MissionVoiceScriptJson = (cue) =>
  "[" + cue.lines.map((line) =>
    '{"who": ' + JSON.stringify(line.who) + ', "text": ' + JSON.stringify(line.text) + "}").join(", ") + "]";

/** 强制对齐脚本读这个：每行给出真正念出来的文本与语言（函数形态，不会被界面字表扫到）。 */
export function MissionVoiceAlignmentCues() {
  return MISSION_DIALOGUE.map((cue) => ({
    id: cue.id,
    file: cue.file,
    guidance: !!cue.guidance,
    scriptJson: MissionVoiceScriptJson(cue),
    lines: cue.lines.map((line, index) => ({
      who: line.who, text: MissionVoiceSpoken(cue, index), lang: line.lang || "zh",
    })),
  }));
}

export function MissionVoicePrompt(cue) {
  const cast = [...new Set(cue.lines.map((line) => line.who))]
    .map((who) => MISSION_VOICE_CAST[who].join("："))
    .join("；");
  const environment = cue.soundscape || MissionVoiceSoundscape(cue.id);
  // 日语段单独交代口径；纯中文 cue 的提示词逐字保持旧模板，沿用的录音才不会白白重烘。
  const bilingual = cue.lines.some((line) => line.lang === "ja");
  // 鲁南本地人（翻译 / 老耿 / 庄稼人）说北方官话。只有翻译时句子逐字保持旧写法（沿用的录音才不会白白重烘）；
  // 2026-10-12 03–11 重构加了老耿与庄稼人，有他们在场时点名谁说北方官话，否则「所有中国人物必须讲四川话」会把老耿念成川军。
  const northerners = [...new Set(cue.lines.filter((line) => NORTHERN_SPEAKERS.has(line.who)).map((line) => MISSION_VOICE_CAST[line.who][0]))];
  const northern = northerners.length > 0;
  const onlyInterpreter = northerners.length === 1 && northerners[0] === "翻译";
  const northText = onlyInterpreter ? "翻译只说北方官话，川军角色只说四川话。" : `${northerners.join("、")}只说北方官话，川军角色只说四川话。`;
  const rule = bilingual
    ? `日军角色只念稿中给出的日语，用日语发音，不说中文；${northern ? northText : "中国角色只说稿中四川话。"}`
    : "日军角色只说稿中日语。";
  const accent = !northern ? "1938年四川军人，所有中国人物必须讲地道四川话，使用四川方言语调与发音，不能仅四川词汇配普通话播音。"
    : onlyInterpreter ? "1938年战场：翻译必须说鲁南北方官话，川军角色必须说地道四川话，两者口音明显不同。"
    : `1938年战场：${northerners.join("、")}是鲁南本地人，必须说鲁南一带的北方官话（山东口音），绝不说四川话；川军角色必须说地道四川话，使用四川方言语调与发音，两者口音明显不同。`;
  return `生成游戏战场剧情的整段连续多人对白和同场环境声，一个完整音频，一次演完。${accent}${cast}。${cue.delivery || "自然接话、短停顿、呼吸，角色声音明确不同且稳定。"}环境声必须录进本次完整录音：${environment}环境声保持在对白下方，整段连续不突兀截断；不加音乐，不念角色名和动作说明，不删词改词，不添加其他可辨识台词。${rule}完整对白如下：\n${cue.lines.map((line, index) => `${MISSION_VOICE_CAST[line.who][0]}：“${MissionVoiceSpoken(cue, index)}”`).join("\n")}`;
}

export function MissionVoiceSoundscape(id) {
  return SOUNDSCAPES[SOUNDSCAPE_ZONES[id]] || SOUNDSCAPE_DEFAULT;
}
