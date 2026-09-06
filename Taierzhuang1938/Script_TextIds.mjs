// Script_TextIds.mjs — 内容文本 id 的**唯一口径**。纯规则：不 import three、不 import 数据表。
//
// 为什么单独一个模块：`Localize(id, text)` 的 id 有两个消费者 ——
//   · 运行时（Script_Story / Script_Cutscene）：显示那一刻按 id 查译文；
//   · 翻译清单（Script_TextGather）：离线遍历内容数据、按同一套 id 导出。
// 两处各写一份 id 生成，第一次改口径就会分叉，而分叉的表现是「译文静默不生效」——
// 画面上是原文，控制台干净，没有任何报错。所以口径只许写在这里，两边都 import 它。
//
// 口径（docs/Data_TextAndTuning.md §3）：
//   章节 beat   `beat.voice`（有语音的行本来就有 key），否则 `<levelId>.beat.<index>`
//               index 是**该关 beats 数组的原始下标**，不是过滤/重排之后的队列下标。
//   说话人      `cast.<who>.short`
//   过场字幕    `<cutId>.<shotN>.sub.<i>`（附注 `…​.note`）
//   过场台词    `<cutId>.<shotN>.line.<i>`
//   过场地图标  `<cutId>.<shotN>.map.<i>`
//   过场标题    `<cutId>.title`
//   卡片        `<cutId>.<card>.title` / `<cutId>.<card>.line.<i>`（附注 `….note`），
//               card ∈ { skipCard, epilogueCard, tallyCard }
//   结算行      `<cutId>.tally.row.<i>.label` / `.value` / `.note`，收尾 `<cutId>.tally.closing.<i>`
//
// **段名（sub / line / map / row …）不能省。** 同一镜里 subs[0] 与 lines[0] 都存在是常态，
// 少了段名两条内容就会共用一个 id：译文互相顶掉，而 Gather 的唯一性自检才会发现。
//
// id 只许用 ASCII：译文表里它是 `content.<id>` 键，Script_TextTest 的键名正则
// （`^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_\-]+)+$`）不认汉字。内容数据里恰好是汉字的
// 枚举值（tier 那种）因此**不做 id**，见 Script_Cutscene.TierTag 上的账。

/** 一条章节 beat 的内容 id。index 必须是该关 beats 数组里的原始下标。 */
export const FirstLevelStageTextId = id => `mission.firstLevel.stage.${id}`;
export const FirstLevelVoiceTextId = (id, index) => `mission.firstLevel.${id}.${index}`;
export const FirstLevelCastTextId = id => `mission.firstLevel.cast.${id}`;
export function BeatTextId(levelId, beat, index) {
  if (beat && beat.voice) return beat.voice;
  return `${levelId}.beat.${index}`;
}

/** title 型 beat 底下那一行副标题（`beat.sub`）。 */
export function BeatSubId(beatTextId) {
  return `${beatTextId}.sub`;
}

/** 关卡目标链（`level.objectives`）的一条。 */
export function LevelObjectiveStepId(levelId, index) {
  return `${levelId}.objectives.${index}`;
}

/**
 * 关卡开局那一条任务文本（`level.objective`，不由任何 beat 派发）。
 * 它**就是** `objectives[0]`（Data_TengxianScript 是这么组的），所以共用一个 id ——
 * 同一句话给两个 id，翻译要翻两遍，还会翻出两种说法。
 */
export function LevelObjectiveId(levelId) {
  return LevelObjectiveStepId(levelId, 0);
}

/** 说话人显示名。CAST 的 key 是 ASCII id，正合适做 id。 */
export function CastNameId(who) {
  return `cast.${who}.short`;
}

/** 过场里一条内容的 id：`<cutId>.<shotN>.<part>.<index>`，part ∈ sub / line / map。 */
export function ShotTextId(cutId, shotN, part, index) {
  return `${cutId}.${shotN}.${part}.${index}`;
}

/** 过场标题（黑场字卡与卡片抬头共用同一句）。 */
export function CutsceneTitleId(cutId) {
  return `${cutId}.title`;
}

/**
 * 补出卡片里的一行。`card` 是卡片在过场数据上的字段名（skipCard / epilogueCard /
 * tallyCard），**不是卡片对象本身** —— 跳过卡与结算卡走同一套 UI，只有字段名分得开它们。
 */
export function CardTextId(cutId, card, index) {
  return `${cutId}.${card}.line.${index}`;
}

/**
 * 卡片自己的抬头。**与 `<cutId>.title` 不是一条**：跳过卡的抬头常常比分镜标题长
 *（CS_Chuchuan 是「出川」，它的跳过卡是「序章 · 出川」），共用一个 id 会互相顶掉。
 */
export function CardTitleId(cutId, card) {
  return `${cutId}.${card}.title`;
}

/** 结算面板一行的某一栏（label / value / note）。 */
export function TallyRowId(cutId, index, field) {
  return `${cutId}.tally.row.${index}.${field}`;
}

/** 结算面板底下那两行收尾。 */
export function TallyClosingId(cutId, index) {
  return `${cutId}.tally.closing.${index}`;
}

/** 附注（字幕的 small 小字、卡片行的 small 小字、结算行的 note）统一加一段后缀。 */
export function NoteTextId(baseId) {
  return `${baseId}.note`;
}

// ---------------------------------------------------------------------------
// 下面这几条口径由 docs/Data_TextAndTuning.md §3 写死，但**显示它们的代码不在本包里**
//（史料卡在 Script_Main、菜单史实行与鸣谢在 Script_Menu、口令在 Script_Audio 的 Bark，
// 简报与目标行在 Script_Hud）。先把 id 定下来，Script_TextGather 照它导出清单；
// 各自的 Localize 钩子由拥有那些文件的人接（见提交说明的「集成请求」）。
// ---------------------------------------------------------------------------

/** 史料注记卡的一栏（title / body / source）。 */
export function HistoryCardId(cardId, field) {
  return `history.${cardId}.${field}`;
}

/** 战役时间线的一条（field 为 date / text）。 */
export function TimelineId(index, field) {
  return `history.timeline.${index}.${field}`;
}

/** 结束语的一行。 */
export function EpilogueLineId(index) {
  return `history.epilogue.${index}`;
}

/** 一条语音行的台词（战场口令与章节台词共用一张表，key 全局唯一）。 */
export function VoiceLineId(key) {
  return `voice.${key}`;
}

/** 主菜单上那几行史实。 */
export function MenuLineId(index) {
  return `menu.lines.${index}`;
}

/** 鸣谢的一行。 */
export function CreditsLineId(index) {
  return `credits.${index}`;
}

/** 关卡简报（`level.brief`）的一行。 */
export function LevelBriefId(levelId, index) {
  return `${levelId}.brief.${index}`;
}

/** 关卡的标量字段（label / date / place）：选章、简报卡、暂停菜单都显示它们。 */
export function LevelFieldId(levelId, field) {
  return `${levelId}.${field}`;
}

/** 武器名（HUD、拾取提示、靶场长桌都显示它）。 */
export function WeaponNameId(weaponId) {
  return `weapon.${weaponId}.name`;
}
