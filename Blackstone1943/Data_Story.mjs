/**
 * Data_Story.mjs — 全部叙事文本 / 对白 / 章节数据
 * Owner: AgentStory
 *
 * ⚠ 本文件目前是 **AgentBoot 铺设的可运行占位**：结构、字段名与 AGENTS.md 第 5.4 / 第八节
 *   完全一致，三幕骨架与目标 id 已按契约写死，AgentStory 接管后**整体替换内容**即可，
 *   不需要改动任何调用方。
 *
 * 纪律：零 import。纯数据 + 纯查表函数。禁止副作用、禁止 Math.random。
 * 台词纪律：克制、具体、有生活质感。禁止口号腔、禁止说教、禁止爽台词。
 */

/* ================================================================== *
 * 一、对白
 * ================================================================== */

function Line(id, speaker, text, emotion, duration) {
  return { id: id, speaker: speaker, text: text, emotion: emotion || 'Flat', duration: duration };
}

export const Dialogue = Object.freeze({
  /* —— 第一幕 · 雪窖 —— */
  LineWakeCold: Line('LineWakeCold', 'ShenTie', '……腿还在。先把鞋绑紧。', 'Low'),
  LineWakeLook: Line('LineWakeLook', 'ShenTie', '房梁还在冒烟。人是三天前走的。', 'Flat'),
  LineScavengeStart: Line('LineScavengeStart', 'ShenTie', '缸底、灶膛、炕洞。能翻的都翻一遍。', 'Flat'),
  LineScavengeDone: Line('LineScavengeDone', 'ShenTie', '够走一段了。不够走十里。', 'Low'),
  LineCellarKnock: Line('LineCellarKnock', 'ShenTie', '底下有动静。', 'Tense'),
  LineCellarGirl: Line('LineCellarGirl', 'Xiaoman', '你别过来。我有刀。', 'Sharp'),
  LineCellarReply: Line('LineCellarReply', 'ShenTie', '刀拿反了。出来吧，这儿冷。', 'Flat'),
  LineCellarName: Line('LineCellarName', 'Xiaoman', '冯小满。儿童团的。……你是队伍上的？', 'Low'),
  LinePatrolWarn: Line('LinePatrolWarn', 'Xiaoman', '来人了。走大路的那伙。', 'Tense'),
  LinePatrolHide: Line('LinePatrolHide', 'ShenTie', '跟紧我，踩我的脚印。', 'Flat'),
  LineLeaveVillage: Line('LineLeaveVillage', 'Xiaoman', '我娘说过，出村往北，别回头看。', 'Broken'),

  /* —— 第二幕 · 断谷 —— */
  LineRoadAhead: Line('LineRoadAhead', 'ShenTie', '前面是公路。白天走公路的都不是自己人。', 'Flat'),
  LineDogHoleOffer: Line('LineDogHoleOffer', 'Xiaoman', '那个洞我钻得过去。你钻不过去。', 'Warm'),
  LineDogHoleDone: Line('LineDogHoleDone', 'Xiaoman', '门开了。别夸我，快走。', 'Warm'),
  LineCheckpoint: Line('LineCheckpoint', 'ShenTie', '碉堡上有两个人。绕。', 'Tense'),
  LineGunTeach: Line('LineGunTeach', 'ShenTie', '一颗子弹换一条命，你换不起。拉栓、屏气、再扣。', 'Flat'),
  LineValleyExit: Line('LineValleyExit', 'Xiaoman', '过了这道口子，就剩垭口了。', 'Low'),

  /* —— 第三幕 · 风雪垭口 —— */
  LinePassWind: Line('LinePassWind', 'ShenTie', '风顶着走。低头，别喘大气。', 'Low'),
  LinePassSearch: Line('LinePassSearch', 'Xiaoman', '狗……是狗的声音。', 'Broken'),
  LinePassProtect: Line('LinePassProtect', 'ShenTie', '蹲下，别动。我数三下你就往那块石头跑。', 'Tense'),
  LineChoicePrompt: Line('LineChoicePrompt', 'ShenTie', '交通站在坡下第三棵树后面。说出来，她能活；说出来，那儿就完了。', 'Broken'),
  LineChoiceReveal: Line('LineChoiceReveal', 'ShenTie', '……往下走，第三棵树。就说我让你来的。', 'Broken'),
  LineChoiceWalk: Line('LineChoiceWalk', 'ShenTie', '剩下的路你自己走。别回头，别跑。', 'Broken'),

  /* —— 情境 bark —— */
  LineBarkHurt: Line('LineBarkHurt', 'Xiaoman', '你在流血。……我这儿有布。', 'Low'),
  LineBarkKill: Line('LineBarkKill', 'Xiaoman', '……', 'Broken'),
  LineBarkCold: Line('LineBarkCold', 'Xiaoman', '手指头没知觉了。生个火行不行。', 'Low'),
  LineBarkSpotted: Line('LineBarkSpotted', 'Xiaoman', '他们看见了！', 'Sharp'),
  LineBarkFound: Line('LineBarkFound', 'Xiaoman', '这个能用。装上。', 'Warm'),
});

export const DialogueSets = Object.freeze({
  SetOpening: ['LineWakeCold', 'LineWakeLook'],
  SetCellarMeet: ['LineCellarKnock', 'LineCellarGirl', 'LineCellarReply', 'LineCellarName'],
  SetPatrol: ['LinePatrolWarn', 'LinePatrolHide'],
  SetDogHole: ['LineDogHoleOffer', 'LineDogHoleDone'],
  SetFinalChoice: ['LineChoicePrompt'],
});

export const BarkTables = Object.freeze({
  BarkPlayerHurt: ['LineBarkHurt'],
  BarkPlayerKilled: ['LineBarkKill'],
  BarkCold: ['LineBarkCold'],
  BarkSpotted: ['LineBarkSpotted'],
  BarkItemFound: ['LineBarkFound'],
});

/* ================================================================== *
 * 二、节拍
 * ================================================================== */

function Beat(id, chapterId, trigger, lines, extra) {
  const beat = {
    id: id, chapterId: chapterId, trigger: trigger, once: true,
    lines: lines || [], cinematic: null, companionMode: null,
    objectiveId: null, musicState: null, choiceId: null, ledger: [],
  };
  if (extra) { for (const key of Object.keys(extra)) beat[key] = extra[key]; }
  return beat;
}

export const StoryBeats = Object.freeze({
  BeatVillageWake: Beat('BeatVillageWake', 'ChapterSnowCellar', { kind: 'Manual' }, ['LineWakeCold', 'LineWakeLook'], { musicState: 'Unease' }),
  BeatScavengeHint: Beat('BeatScavengeHint', 'ChapterSnowCellar', { kind: 'Objective', objectiveId: 'ObjectiveScavengeVillage' }, ['LineScavengeStart']),
  BeatScavengeDone: Beat('BeatScavengeDone', 'ChapterSnowCellar', { kind: 'Objective', objectiveId: 'ObjectiveScavengeVillage' }, ['LineScavengeDone']),
  BeatCellarMeet: Beat('BeatCellarMeet', 'ChapterSnowCellar', { kind: 'Objective', objectiveId: 'ObjectivePryCellar' }, ['LineCellarKnock', 'LineCellarGirl', 'LineCellarReply', 'LineCellarName'], { companionMode: 'Follow', musicState: 'Grief' }),
  BeatPatrolEnters: Beat('BeatPatrolEnters', 'ChapterSnowCellar', { kind: 'Objective', objectiveId: 'ObjectiveEvadePatrol' }, ['LinePatrolWarn', 'LinePatrolHide'], { musicState: 'Tension' }),
  BeatVillageLeft: Beat('BeatVillageLeft', 'ChapterSnowCellar', { kind: 'Objective', objectiveId: 'ObjectiveLeaveVillage' }, ['LineLeaveVillage'], { ledger: ['CostVillageBurned'] }),

  BeatRoadSighted: Beat('BeatRoadSighted', 'ChapterBrokenValley', { kind: 'Objective', objectiveId: 'ObjectiveReachRoad' }, ['LineRoadAhead']),
  BeatDogHole: Beat('BeatDogHole', 'ChapterBrokenValley', { kind: 'Objective', objectiveId: 'ObjectiveCompanionDogHole' }, ['LineDogHoleOffer', 'LineDogHoleDone'], { companionMode: 'Squeeze' }),
  BeatCheckpoint: Beat('BeatCheckpoint', 'ChapterBrokenValley', { kind: 'Objective', objectiveId: 'ObjectiveCrossCheckpoint' }, ['LineCheckpoint'], { musicState: 'Tension' }),
  BeatGunTeach: Beat('BeatGunTeach', 'ChapterBrokenValley', { kind: 'Objective', objectiveId: 'ObjectiveGunneryTutorial' }, ['LineGunTeach']),
  BeatValleyLeft: Beat('BeatValleyLeft', 'ChapterBrokenValley', { kind: 'Objective', objectiveId: 'ObjectiveEnterValleyExit' }, ['LineValleyExit']),

  BeatPassClimb: Beat('BeatPassClimb', 'ChapterWindPass', { kind: 'Objective', objectiveId: 'ObjectiveClimbPass' }, ['LinePassWind'], { musicState: 'Unease' }),
  BeatPassSearch: Beat('BeatPassSearch', 'ChapterWindPass', { kind: 'Objective', objectiveId: 'ObjectiveEvadeSearch' }, ['LinePassSearch'], { musicState: 'Chase' }),
  BeatPassProtect: Beat('BeatPassProtect', 'ChapterWindPass', { kind: 'Objective', objectiveId: 'ObjectiveProtectCompanion' }, ['LinePassProtect']),
  BeatFinalChoice: Beat('BeatFinalChoice', 'ChapterWindPass', { kind: 'Objective', objectiveId: 'ObjectiveFinalChoice' }, ['LineChoicePrompt'], { choiceId: 'ChoiceStationReveal', musicState: 'Grief', cinematic: { seconds: 4, letterbox: true, lockInput: true } }),
});

/* ================================================================== *
 * 三、章节
 * ================================================================== */

function Objective(id, text, kind, target, extra) {
  const objective = {
    id: id, text: text, hint: null, optional: false, kind: kind,
    target: target || {}, beatOnStart: null, beatOnComplete: null,
    failOn: [], failText: null,
  };
  if (extra) { for (const key of Object.keys(extra)) objective[key] = extra[key]; }
  return objective;
}

export const StoryChapters = Object.freeze([
  Object.freeze({
    id: 'ChapterSnowCellar',
    index: 1,
    title: '雪窖',
    subtitle: '一九四三年十二月十七日 · 拂晓',
    timeOfDay: 'Dawn',
    weather: 'LightSnow',
    worldPreset: 'Village',
    worldSeed: 19431217,
    enemyProfile: 'PuppetPatrol',
    companionPresent: true,
    ammoGrant: 2,
    ambience: 'VillageDawn',
    musicState: 'Unease',
    introBeatId: 'BeatVillageWake',
    outroBeatId: 'BeatVillageLeft',
    nextChapterId: 'ChapterBrokenValley',
    beats: ['BeatVillageWake', 'BeatScavengeHint', 'BeatScavengeDone', 'BeatCellarMeet', 'BeatPatrolEnters', 'BeatVillageLeft'],
    objectives: [
      Objective('ObjectiveWakeUp', '站起来，看看还剩下什么', 'Reach',
        { anchorId: 'AnchorVillageCenter', radius: 3 },
        { hint: 'WASD 走动，C 蹲下', beatOnStart: 'BeatVillageWake' }),
      Objective('ObjectiveScavengeVillage', '在废墟里翻出三样能用的东西', 'Collect',
        { count: 3 },
        { hint: '缸底、灶膛、炕洞', beatOnStart: 'BeatScavengeHint', beatOnComplete: 'BeatScavengeDone' }),
      Objective('ObjectivePryCellar', '撬开磨坊的地窖门', 'Interact',
        { interactableId: 'InteractableCellarDoor' },
        { beatOnComplete: 'BeatCellarMeet' }),
      Objective('ObjectiveEvadePatrol', '别让搜村的人看见你们', 'Avoid',
        { count: 1, radius: 12 },
        { beatOnStart: 'BeatPatrolEnters', failOn: ['CompanionCaptured'], failText: '小满被带走了' }),
      Objective('ObjectiveLeaveVillage', '从村北的豁口离开黑石峪', 'Reach',
        { anchorId: 'AnchorVillageExit', radius: 3.5 },
        { beatOnComplete: 'BeatVillageLeft' }),
    ],
  }),

  Object.freeze({
    id: 'ChapterBrokenValley',
    index: 2,
    title: '断谷',
    subtitle: '同日 · 正午 · 谷口公路',
    timeOfDay: 'Noon',
    weather: 'Overcast',
    worldPreset: 'Valley',
    worldSeed: 19431218,
    enemyProfile: 'Checkpoint',
    companionPresent: true,
    ammoGrant: 4,
    ambience: 'ValleyNoon',
    musicState: 'Tension',
    introBeatId: 'BeatRoadSighted',
    outroBeatId: 'BeatValleyLeft',
    nextChapterId: 'ChapterWindPass',
    beats: ['BeatRoadSighted', 'BeatDogHole', 'BeatCheckpoint', 'BeatGunTeach', 'BeatValleyLeft'],
    objectives: [
      Objective('ObjectiveReachRoad', '摸到谷口的公路边', 'Reach',
        { anchorId: 'AnchorRoadEdge', radius: 3 },
        { beatOnStart: 'BeatRoadSighted' }),
      Objective('ObjectiveCompanionDogHole', '让小满钻狗洞，从里面开门', 'Interact',
        { interactableId: 'InteractableDogHole' },
        { beatOnComplete: 'BeatDogHole' }),
      Objective('ObjectiveCrossCheckpoint', '越过哨卡', 'Reach',
        { anchorId: 'AnchorCheckpointPast', radius: 3 },
        { beatOnStart: 'BeatCheckpoint', hint: '绕过去比打过去便宜' }),
      Objective('ObjectiveGunneryTutorial', '（可选）学会用那支中正式', 'Interact',
        { interactableId: 'InteractableRifleRack' },
        { optional: true, beatOnStart: 'BeatGunTeach' }),
      Objective('ObjectiveEnterValleyExit', '进入通往垭口的岔道', 'Reach',
        { anchorId: 'AnchorValleyExit', radius: 3.5 },
        { beatOnComplete: 'BeatValleyLeft' }),
    ],
  }),

  Object.freeze({
    id: 'ChapterWindPass',
    index: 3,
    title: '风雪垭口',
    subtitle: '同日 · 黄昏转夜 · 暴风雪',
    timeOfDay: 'Dusk',
    weather: 'Blizzard',
    worldPreset: 'Pass',
    worldSeed: 19431219,
    enemyProfile: 'JapaneseSearch',
    companionPresent: true,
    ammoGrant: 6,
    ambience: 'PassDusk',
    musicState: 'Chase',
    introBeatId: 'BeatPassClimb',
    outroBeatId: 'BeatFinalChoice',
    nextChapterId: null,
    beats: ['BeatPassClimb', 'BeatPassSearch', 'BeatPassProtect', 'BeatFinalChoice'],
    objectives: [
      Objective('ObjectiveClimbPass', '顶着风爬上垭口', 'Reach',
        { anchorId: 'AnchorPassTop', radius: 4 },
        { beatOnStart: 'BeatPassClimb', hint: '低温会要命，找背风处' }),
      Objective('ObjectiveEvadeSearch', '躲开搜山的人和狗', 'Survive',
        { seconds: 90 },
        { beatOnStart: 'BeatPassSearch' }),
      Objective('ObjectiveProtectCompanion', '把小满带到坡下', 'Escort',
        { anchorId: 'AnchorSlopeBottom', radius: 4 },
        { beatOnStart: 'BeatPassProtect', failOn: ['CompanionCaptured'], failText: '她没能跟上来' }),
      Objective('ObjectiveFinalChoice', '决定告诉她多少', 'Choice',
        { choiceId: 'ChoiceStationReveal' },
        { beatOnStart: 'BeatFinalChoice' }),
    ],
  }),
]);

/* ================================================================== *
 * 四、物品 / 配方 / 结局 / 文案
 * ================================================================== */

export const ItemCatalog = Object.freeze({
  Bandage: { name: '绷带', description: '烧酒泡过的粗布条。能止住血，不能长肉。', stack: 4, weight: 0.1, kind: 'Consumable' },
  Cloth: { name: '破布', description: '从谁家的被面上撕的。', stack: 6, weight: 0.1, kind: 'Material' },
  Liquor: { name: '烧酒', description: '半瓶。喝也行，洗伤口更值。', stack: 2, weight: 0.4, kind: 'Material' },
  Match: { name: '火柴', description: '七根，受了潮。', stack: 12, weight: 0.02, kind: 'Material' },
  PineBranch: { name: '松枝', description: '带油脂，好烧。', stack: 6, weight: 0.5, kind: 'Material' },
  Firewood: { name: '柴火', description: '够一堆火烧半个钟头。', stack: 3, weight: 1.2, kind: 'Material' },
  Ration: { name: '炒面', description: '一小把。掺了糠。', stack: 4, weight: 0.3, kind: 'Consumable' },
  Herb: { name: '草药', description: '小满认得的，止血用。', stack: 5, weight: 0.05, kind: 'Material' },
  RifleAmmo: { name: '步枪子弹', description: '七九尖弹。数得清。', stack: 12, weight: 0.03, kind: 'Ammo' },
  PistolAmmo: { name: '手枪子弹', description: '驳壳枪用的。', stack: 12, weight: 0.02, kind: 'Ammo' },
  Grenade: { name: '手榴弹', description: '自制的，木柄裂了一道缝。', stack: 2, weight: 0.6, kind: 'Weapon' },
  Stone: { name: '石头', description: '扔出去能把人引到别处。', stack: 6, weight: 0.3, kind: 'Material' },
  Knife: { name: '匕首', description: '刃口卷了。', stack: 1, weight: 0.3, kind: 'Weapon' },
  Crowbar: { name: '撬棍', description: '撬门用，响。', stack: 1, weight: 1.5, kind: 'Weapon' },
  RadioPart: { name: '电台振荡线圈', description: '缴获的。不能丢，也不能让人看见。', stack: 1, weight: 0.5, kind: 'Story' },
  Letter: { name: '一张纸', description: '小满娘留下的，字迹被雪水泡开了。', stack: 1, weight: 0.01, kind: 'Story' },
  PaddedCoat: { name: '棉衣', description: '右襟烧穿了一块。', stack: 1, weight: 1.8, kind: 'Consumable' },
  Rope: { name: '麻绳', description: '两丈。', stack: 1, weight: 0.7, kind: 'Material' },
  Lantern: { name: '马灯', description: '有油。点了就等于告诉别人你在哪。', stack: 1, weight: 0.9, kind: 'Weapon' },
});

export const RecipeCatalog = Object.freeze({
  RecipeBandage: { id: 'RecipeBandage', name: '包扎用的布条', inputs: [{ id: 'Cloth', count: 1 }, { id: 'Liquor', count: 1 }], output: { id: 'Bandage', count: 1 }, seconds: 2.2, noiseRadius: 2 },
  RecipeFire: { id: 'RecipeFire', name: '一堆火', inputs: [{ id: 'Match', count: 1 }, { id: 'PineBranch', count: 2 }], output: { id: 'Firewood', count: 1 }, seconds: 3.4, noiseRadius: 3 },
  RecipeHerbBandage: { id: 'RecipeHerbBandage', name: '草药敷布', inputs: [{ id: 'Cloth', count: 1 }, { id: 'Herb', count: 2 }], output: { id: 'Bandage', count: 1 }, seconds: 2.8, noiseRadius: 1 },
});

export const CostLedgerLabels = Object.freeze({
  CostVillageBurned: '黑石峪，烧了三天',
  CostCivilianLost: '有人没能等到我们来',
  CostFirstKill: '你第一次杀人的时候，她在看',
  CostCompanionScared: '她开始怕黑，也怕你',
  CostStationRevealed: '交通站的位置，多了一个人知道',
  CostWalkedAlone: '最后一段路，她一个人走',
});

export const EndingCatalog = Object.freeze({
  EndingLetHerWalk: {
    id: 'EndingLetHerWalk', tone: 'Quiet', title: '最后一段路',
    lines: ['她走到坡下，回头看了一眼。', '你没有招手。', '零件送到了。报告里没有她。'],
  },
  EndingRevealStation: {
    id: 'EndingRevealStation', tone: 'Costly', title: '第三棵树',
    lines: ['她记住了那句话。', '交通站收下了她，也收下了那枚线圈。', '你在报告里漏写了一行。这一行，你自己记着。'],
  },
  EndingAlone: {
    id: 'EndingAlone', tone: 'Bitter', title: '雪把脚印填平了',
    lines: ['坡下只剩下风。', '零件送到了。', '这一趟的代价，写在下面。'],
  },
});

export const UiStrings = Object.freeze({
  ObjectiveNew: '新目标',
  ObjectiveUpdated: '目标更新',
  ObjectiveDone: '完成',
  ObjectiveFailed: '失败',
  PromptInteract: '交互',
  PromptSearch: '翻找',
  PromptPry: '撬开',
  PromptCompanion: '让小满去',
  AlertCalm: '隐蔽',
  AlertSuspicious: '起疑',
  AlertCombat: '暴露',
  LedgerTitle: '代价记录',
  LedgerEmpty: '还没有需要记下的事。',
  LedgerNotScore: '只记，不计分。',
  GameOverShot: '你没能走出去。',
  GameOverCold: '冻在半路上了。',
  GameOverBleed: '血流干了。',
  GameOverCompanion: '她被带走了。',
  LoadingText: '正在铺开黑石峪的雪…',
  ChapterPrefix: '第',
  ChapterSuffix: '章',
});

/* ================================================================== *
 * 五、查表（纯函数）
 * ================================================================== */

export function FindChapter(chapterId) {
  for (let i = 0; i < StoryChapters.length; i += 1) {
    if (StoryChapters[i].id === chapterId) return StoryChapters[i];
  }
  return null;
}

export function FindBeat(beatId) {
  return Object.prototype.hasOwnProperty.call(StoryBeats, beatId) ? StoryBeats[beatId] : null;
}

export function GetLine(lineId) {
  return Object.prototype.hasOwnProperty.call(Dialogue, lineId) ? Dialogue[lineId] : null;
}

export function GetBarks(barkId) {
  return Object.prototype.hasOwnProperty.call(BarkTables, barkId) ? BarkTables[barkId] : [];
}

export function GetItem(itemId) {
  return Object.prototype.hasOwnProperty.call(ItemCatalog, itemId) ? ItemCatalog[itemId] : null;
}

export function GetText(key, fallback) {
  if (Object.prototype.hasOwnProperty.call(UiStrings, key)) return UiStrings[key];
  return fallback === undefined ? key : fallback;
}

export function ListChapterIds() {
  const out = [];
  for (let i = 0; i < StoryChapters.length; i += 1) out.push(StoryChapters[i].id);
  return out;
}

export function GetEnding(endingId) {
  return Object.prototype.hasOwnProperty.call(EndingCatalog, endingId) ? EndingCatalog[endingId] : null;
}

export function GetCostLabel(key) {
  return Object.prototype.hasOwnProperty.call(CostLedgerLabels, key) ? CostLedgerLabels[key] : key;
}

export default StoryChapters;
