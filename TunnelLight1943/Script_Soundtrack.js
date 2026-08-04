// 把游戏状态翻译成声音：旁白配音、音效触发、配乐情绪。
//
// 单独一层，是为了让 Script_Main 只管"发生了什么"，不必知道该放哪个文件；
// 也让 Script_Audio（纯合成器，不认识剧情）保持干净。
//
// 配音只有旁白与关键台词——剧本本身就几乎不写对白（117 条舞台提示对 18 句
// 台词），所以声音的主体是一个念舞台提示的旁白，跟《勇敢的心》一路。

import { CurrentBeatDef, SetVoiceDurations, VoiceLineId } from "./Script_Core.mjs";

// 每章的底色。第 7 章在据点地道底下，是全剧最暗的一段；第 8 章天亮回家，
// 是唯一允许暖起来的一章。
const CHAPTER_MOOD = [
  "calm",      // 一 门框上的刻痕
  "raid",      // 二 第一次失去
  "tension",   // 三 寻找妹妹
  "tunnel",    // 四 地道里的第一次光
  "tension",   // 五 反击地道
  "raid",      // 六 敌人的陷阱
  "tunnel",    // 七 地道里的光
  "resolve",   // 八 回家的路
];

export function CreateSoundtrack(audio) {
  let manifest = null;
  let ready = false;
  const base = new URL("./Audio/Voice/", import.meta.url).href;

  // 清单是烘焙产物；拿不到就静默降级成"只有音效和配乐"，不能让整个游戏卡住
  fetch(new URL("./Audio/Voice_Manifest.json", import.meta.url))
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { manifest = j; ready = !!j; SyncDurations(); })
    .catch(() => { ready = false; });

  // 只有真的在放声音时才让配音时长影响节奏
  function SyncDurations() {
    if (ready && audio.IsEnabled()) {
      SetVoiceDurations(new Map(manifest.lines.map((l) => [l.id, l.dur || 0])));
    } else SetVoiceDurations(null);
  }

  const prev = {
    chapter: -1, carry: null, level: null, lamp: false,
    captionKey: "", beatId: "", phase: "",
  };

  function VoiceUrlFor(caption) {
    if (!ready || !caption) return null;
    const text = caption.say || caption.stage;
    if (!text) return null;
    const id = VoiceLineId(caption.say ? (caption.who || "") : "", text);
    return manifest.lines.some((l) => l.id === id) ? base + id + ".mp3" : null;
  }

  function Step(state, dt) {
    if (!state) return;

    // —— 配乐情绪：按章定底色，抓捕/淹水这类段落临时压过去
    const chapterMood = CHAPTER_MOOD[state.chapterIndex] || "calm";
    const def = CurrentBeatDef(state);
    let mood = chapterMood;
    if (state.flags?.motherLost || def?.id?.includes("loss")) mood = "grief";
    else if (state.detection?.level > 0.55) mood = "raid";
    audio.SetMood(mood);

    if (state.chapterIndex !== prev.chapter) {
      prev.chapter = state.chapterIndex;
      prev.carry = null; prev.level = null;
    }

    const p = state.player;
    if (p) {
      // 环境与脚步交给 Script_Audio 自己按状态推，这里只喂状态
      audio.Update(dt, {
        moving: Math.abs(p.vx || 0) > 0.01 || !!state.moving,
        level: p.level === "under" ? "under" : "surface",
        crouch: !!p.crouch,
        detection: state.detection?.level || 0,
      });

      if (p.carry !== prev.carry) {
        if (p.carry) audio.Sfx("pickup");
        else if (prev.carry) audio.Sfx("drop");
        prev.carry = p.carry;
      }
      if (p.level !== prev.level) {
        if (prev.level !== null) audio.Sfx("ladder");
        prev.level = p.level;
      }
      if (!!p.lamp !== prev.lamp) {
        audio.Sfx(p.lamp ? "lampOn" : "lampOut");
        prev.lamp = !!p.lamp;
      }
    } else {
      audio.Update(dt, {});
    }

    // 施工/挖土：提示里带百分比就说明正在动手，按节奏敲
    if (state.prompt && state.prompt.includes("%")) {
      digT += dt;
      if (digT > 0.42) { digT = 0; audio.Sfx("dig"); }
    } else digT = 0;

    // —— 旁白：字幕换一行就念一行
    const inCine = def?.kind === "cinematic" || !!state.microCine;
    const cap = inCine ? state.caption : null;
    const key = cap ? (cap.who || "") + "|" + (cap.say || cap.stage || "") : "";
    if (key !== prev.captionKey) {
      prev.captionKey = key;
      const url = VoiceUrlFor(cap);
      if (url) audio.PlayVoice(url);
      else audio.StopVoice();
    }
  }
  let digT = 0;

  return {
    Step,
    // 声音开关变化时要重算节奏：静音就该回到剧本手写的停留时间
    SyncDurations,
    // 剧情里的一次性响动由 Main 直接点名
    Sfx: (name, opts) => audio.Sfx(name, opts),
    HasVoice: () => ready,
  };
}
