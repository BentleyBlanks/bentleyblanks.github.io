// Data_Tuning_Story.mjs — 叙事层（Script_Story.StoryDirector）的节奏数值。纯数据，不 import 任何东西。
//
// 口径见 docs/Data_TextAndTuning.md §4：一个系统一张表、导出分组的冻结对象、
// **注释跟着数走**（原来写在 Script_Story 常量旁的账整段搬到这里，代码里不留孤儿注释）、
// 消费方 import 读表不复制到本地常量。
//
// 这里只放「节奏」：等多久、间隔多久、字幕停多久。**不放**内容（台词在 Data_Mission*）、
// 不放编排（触发式语义在 beats 的 at 字段）、不放规则（谁先谁后是 Script_Story 的链）。

/**
 * 各类触发式等不到时的兜底上限（秒）。等超了就直接播 ——
 * 没有这一条，剧本链会卡在某一条上，后面整本被静默吞掉（最难查的一类 bug）。
 *
 * zone 给得最宽 —— 走到某个路标是玩家自己的事；event 次之；
 * delay/start 本来就是时间条件，兜底等于它自己（after: 0 表示不额外兜底）。
 * end 给 1e9 = 实际上不兜底：收场那一条只在关卡真的要结束时播。
 * 表里没有的 kind 用 fallbackS。
 */
export const MAX_WAIT = Object.freeze({
  after: 0, zone: 95, event: 80, fight: 70, fightEnd: 85, end: 1e9,
  /** ParseAt 认不出的 kind 落到这里（不该发生，但不许因此把链挂死）。 */
  fallbackS: 60,
});

/** 台词节奏。 */
export const PACING = Object.freeze({
  /** 两条台词之间的最小间隔（秒），不然会叠成一团。开场也先垫这么久，让 brief 先说完。 */
  minGapS: 2.0,
  /**
   * `sameAsPrev`（连着几条写同一个 at）的第二条只等这么久。
   * 不标出来的话每一条都要各等一遍自己的兜底 —— 实测 L0 那 12 条里有 6 条是成对的
   * 同 at，各等 95 s 的结果是一关跑到头也播不完（冒烟里表现为「剧本被吞了」，
   * 而其实只是排在后面）。
   */
  sameAsPrevS: 0.25,
  /** SetFighting 判「又一次交火」的冷却（秒）：这段时间内的再次开火算同一次。 */
  fightCooldownS: 6,
  /** end 触发式的时间兜底：关卡时长走到这个比例就算「要结束了」。 */
  endTimeRatio: 0.9,
  /** FlushTail 默认倒几条；扫描预算是它的 8 倍（跳过的对白也计进预算）。 */
  flushLimit: 4,
  flushScanFactor: 8,
});

/**
 * 带语音的那一条要**占住话筒直到自己说完**。
 *
 * 字幕的默认停留（3.4—5.4 s）跟音频长度没有关系，按默认间隔放行下一条的话，
 * 长句子会被下一句从中间打断。
 * holdMaxS 是保险丝：真有一条 20 s 的连续场景（序章动员那种）也不至于把整条剧本链
 * 卡在那儿 —— 超时兜底虽然照常在走，但那要等到 MAX_WAIT。
 */
export const VOICE_HOLD = Object.freeze({
  maxS: 8.0,
  /** 说完之后再留一点，别话音未落就下一句。 */
  tailS: 0.35,
});

/**
 * 字幕跟着语音走：有音频时字幕至少陪到人说完（取长者）。
 * 反过来不成立 —— 音频短不代表字幕可以更短，字幕有自己的可读下限（下面 DEFAULT_SECONDS）。
 */
export const SUBTITLE = Object.freeze({
  tailS: 0.6,
  maxS: 9.0,
});

/**
 * 各类 beat 的字幕默认停留（秒）。这是「读得完就行」的下限，与音频时长无关。
 * env 比 narration 长一点：环境描写没有说话的人，语气也不是旁白点评，读起来更慢。
 */
export const BEAT_SECONDS = Object.freeze({
  line: 4.2,
  shout: 3.4,
  narration: 4.8,
  env: 5.4,
  /** system（机制播报）走字幕而不是 Hint —— 这几条是**剧本里的一句**。 */
  system: 3.6,
  /** hint 型 beat 当前被抑制（见 Script_Story.Play 的 case "hint"），留数备用。 */
  hint: 5.5,
});

/** ParseAt 的默认秒数：`start` 与写不出秒数的 `delay:` / 认不出的触发式。 */
export const PARSE_AT = Object.freeze({
  startS: 0.8,
  delayFallbackS: 2,
  unknownS: 3,
});

/** 没有配音时 shout 型 beat 用哨子替身，音量。 */
export const WHISTLE = Object.freeze({ volume: 0.35 });
