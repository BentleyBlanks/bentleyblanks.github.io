/**
 * Script_SmokeTest.mjs — node 冒烟测试（退出码即成败）
 * Owner: AgentBoot
 *
 * 纪律：只许 import 项目内的 Config / Math / Event / Rules / Data_Story（外加 node 内置模块）。
 *       禁止 import three、禁止碰 DOM。
 *
 * 跑法：node Blackstone1943/Script_SmokeTest.mjs
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Config, GetTuning } from './Script_Config.mjs';
import * as MathUtil from './Script_Math.mjs';
import { CreateEventBus, EventNames } from './Script_Event.mjs';
import {
  CreateRules, MissionStatus, ComputeDetection, ComputeNoiseAudibility,
  ResolveCraft, SerializeProgress, DeserializeProgress, SaveKey, SaveVersion,
} from './Script_Rules.mjs';
import {
  StoryChapters, StoryBeats, Dialogue, DialogueSets, BarkTables,
  RecipeCatalog, EndingCatalog, FindChapter, GetLine, ListChapterIds,
} from './Data_Story.mjs';

const ProjectRoot = dirname(fileURLToPath(import.meta.url));

/* ================================================================== *
 * 断言外壳
 * ================================================================== */

const results = [];

function Check(name, body) {
  try {
    body();
    results.push({ name: name, ok: true, message: '' });
  } catch (error) {
    results.push({ name: name, ok: false, message: (error && error.message) || String(error) });
  }
}

function Assert(condition, message) {
  if (!condition) throw new Error(message || '断言失败');
}

function AssertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error((message || '值不相等') + '：期望 ' + String(expected) + '，实得 ' + String(actual));
  }
}

function AssertBetween(value, min, max, message) {
  Assert(Number.isFinite(value), (message || '值') + ' 不是有限数：' + String(value));
  Assert(value >= min && value <= max, (message || '值') + ' 越界：' + value + ' 不在 [' + min + ',' + max + ']');
}

/* ================================================================== *
 * 一、页面外壳与模块语法
 * ================================================================== */

const RequiredDomIds = [
  'GameRoot', 'GameCanvas', 'HudRoot', 'HudVitals', 'HudAmmo', 'HudObjective', 'HudSubtitle',
  'HudSoundCaption', 'HudPrompt', 'HudProgress', 'HudToast', 'HudCrosshair', 'HudAlert',
  'HudCompanion', 'HudChapterTitle', 'HudTouch', 'HudTouchStick', 'HudTouchButtons',
  'HudMenu', 'HudInventory', 'HudChoice', 'HudEnding', 'HudFade', 'HudLetterbox',
  'HudLoading', 'HudDebug',
];

function ReadIndexHtml() {
  const path = join(ProjectRoot, 'index.html');
  Assert(existsSync(path), '缺少 index.html');
  return readFileSync(path, 'utf8');
}

Check('index.html 含固定 importmap', () => {
  const html = ReadIndexHtml();
  Assert(html.includes('"three": "./vendor/three/build/three.module.js"')
    || html.includes('"three":"./vendor/three/build/three.module.js"'), 'importmap 缺少 three 映射');
  Assert(html.includes('"three/addons/": "./vendor/three/examples/jsm/"')
    || html.includes('"three/addons/":"./vendor/three/examples/jsm/"'), 'importmap 缺少 three/addons/ 映射');
  Assert(html.includes('type="importmap"'), '缺少 importmap 脚本标签');
});

Check('index.html 含全部关键 DOM id', () => {
  const html = ReadIndexHtml();
  const missing = RequiredDomIds.filter((id) => !html.includes('id="' + id + '"'));
  Assert(missing.length === 0, '缺少 DOM id：' + missing.join(', '));
});

Check('index.html 引导 Script_Boot.mjs', () => {
  const html = ReadIndexHtml();
  Assert(html.includes('./Script_Boot.mjs'), 'index.html 没有引导 Script_Boot.mjs');
  Assert(html.includes('<noscript>'), '缺少 noscript 中文提示');
});

Check('全部 .mjs 语法可解析', () => {
  const files = readdirSync(ProjectRoot).filter((name) => name.endsWith('.mjs')).sort();
  Assert(files.length >= 10, '模块数量异常：' + files.length);
  const broken = [];
  for (const file of files) {
    try {
      execFileSync(process.execPath, ['--check', join(ProjectRoot, file)], { stdio: 'pipe' });
    } catch (error) {
      broken.push(file + '（' + String(error.stderr || error.message).split('\n')[0] + '）');
    }
  }
  Assert(broken.length === 0, '语法错误：' + broken.join('; '));
});

Check('纯逻辑模块不依赖 three / DOM', () => {
  const pure = ['Script_Rules.mjs', 'Script_Math.mjs', 'Script_Event.mjs', 'Script_Config.mjs', 'Data_Story.mjs'];
  for (const file of pure) {
    const path = join(ProjectRoot, file);
    Assert(existsSync(path), '缺少 ' + file);
    const source = readFileSync(path, 'utf8');
    Assert(!/from\s+['"]three['"]/.test(source), file + ' 不许 import three');
    Assert(!/from\s+['"]three\/addons\//.test(source), file + ' 不许 import three/addons');
    Assert(!/\bdocument\s*\./.test(source), file + ' 不许碰 DOM');
    Assert(!/\bwindow\s*\./.test(source), file + ' 不许碰 window');
  }
  const dataSource = readFileSync(join(ProjectRoot, 'Data_Story.mjs'), 'utf8');
  Assert(!/^\s*import\s/m.test(dataSource), 'Data_Story.mjs 必须零 import');
  Assert(!/Math\.random\s*\(/.test(dataSource), 'Data_Story.mjs 不许出现 Math.random');
});

Check('无外链资源（CDN / 字体 / 图片 / 音频）', () => {
  const files = readdirSync(ProjectRoot)
    .filter((name) => /\.(mjs|html|css)$/.test(name));
  const offenders = [];
  const externalPattern = /https?:\/\/(?!(?:www\.)?(?:w3\.org|bentleyblanks\.github\.io))/;
  const assetPattern = /\.(png|jpe?g|gif|webp|mp3|ogg|wav|woff2?|ttf|glb|gltf|fbx)\b/i;
  for (const file of files) {
    const source = readFileSync(join(ProjectRoot, file), 'utf8');
    const lines = source.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      if (externalPattern.test(lines[i]) || assetPattern.test(lines[i])) {
        offenders.push(file + ':' + (i + 1));
      }
    }
  }
  Assert(offenders.length === 0, '出现外链或素材文件引用：' + offenders.slice(0, 6).join(', '));
});

/* ================================================================== *
 * 二、Foundation：随机 / 噪声 / 缓动 / 事件总线
 * ================================================================== */

Check('随机源逐位可复现', () => {
  const a = MathUtil.CreateRandom('BlackstoneSeed');
  const b = MathUtil.CreateRandom('BlackstoneSeed');
  for (let i = 0; i < 64; i += 1) AssertEqual(a.Next(), b.Next(), '第 ' + i + ' 个随机数不一致');
  const c = MathUtil.CreateRandom(7);
  const d = MathUtil.CreateRandom(7);
  AssertEqual(c.Int(0, 100), d.Int(0, 100), 'Int 不一致');
  AssertEqual(JSON.stringify(c.Shuffle([1, 2, 3, 4, 5])), JSON.stringify(d.Shuffle([1, 2, 3, 4, 5])), 'Shuffle 不一致');
});

Check('随机源值域正确', () => {
  const random = MathUtil.CreateRandom(11);
  for (let i = 0; i < 500; i += 1) {
    AssertBetween(random.Next(), 0, 0.9999999999, 'Next');
    AssertBetween(random.Range(-3, 5), -3, 5, 'Range');
    const value = random.Int(0, 4);
    Assert(Number.isInteger(value) && value >= 0 && value < 4, 'Int 越界：' + value);
    Assert(Math.abs(random.Sign()) === 1, 'Sign 必须是 ±1');
  }
});

Check('噪声值域与确定性', () => {
  for (let i = 0; i < 400; i += 1) {
    const x = i * 0.37;
    const z = i * 0.91;
    AssertBetween(MathUtil.Hash1(x), 0, 1, 'Hash1');
    AssertBetween(MathUtil.Hash2(x, z), 0, 1, 'Hash2');
    AssertBetween(MathUtil.Noise2(x, z), -1.0001, 1.0001, 'Noise2');
    AssertBetween(MathUtil.Worley2(x, z), 0, 1.0001, 'Worley2');
    Assert(Number.isFinite(MathUtil.Fbm2(x, z, 4)), 'Fbm2 必须有限');
    Assert(Number.isFinite(MathUtil.Ridge2(x, z, 3)), 'Ridge2 必须有限');
  }
  AssertEqual(MathUtil.Noise2(1.5, 2.5), MathUtil.Noise2(1.5, 2.5), 'Noise2 必须无状态');
});

Check('缓动边界', () => {
  const easings = ['EaseInQuad', 'EaseOutQuad', 'EaseInOutQuad', 'EaseInCubic', 'EaseOutCubic', 'EaseInOutCubic'];
  for (const name of easings) {
    const fn = MathUtil[name];
    Assert(typeof fn === 'function', '缺少缓动 ' + name);
    Assert(Math.abs(fn(0) - 0) < 1e-6, name + '(0) 必须为 0');
    Assert(Math.abs(fn(1) - 1) < 1e-6, name + '(1) 必须为 1');
  }
  AssertEqual(MathUtil.Clamp01(-2), 0, 'Clamp01 下界');
  AssertEqual(MathUtil.Clamp01(2), 1, 'Clamp01 上界');
  AssertBetween(MathUtil.WrapAngle(7 * Math.PI), -Math.PI, Math.PI, 'WrapAngle');
});

Check('事件总线：退订 / once / 重入安全', () => {
  const bus = CreateEventBus({ historyLimit: 8 });
  let count = 0;
  const off = bus.On('TestA', () => { count += 1; });
  bus.Emit('TestA');
  off();
  bus.Emit('TestA');
  AssertEqual(count, 1, '退订后不应再收到');

  let onceCount = 0;
  bus.Once('TestB', () => { onceCount += 1; });
  bus.Emit('TestB');
  bus.Emit('TestB');
  AssertEqual(onceCount, 1, 'Once 只应触发一次');

  /* 重入：handler 内部 On/Off/Emit 不得破坏本次遍历 */
  let reentrant = 0;
  const offC = bus.On('TestC', () => {
    reentrant += 1;
    bus.On('TestC', () => { reentrant += 100; });
    if (reentrant < 5) bus.Emit('TestD');
  });
  bus.On('TestD', () => { reentrant += 10; });
  bus.Emit('TestC');
  offC();
  Assert(reentrant >= 11, '重入派发异常：' + reentrant);

  /* 订阅者抛错不许冒泡（这一段会故意触发一次内部报错，先把噪音收掉） */
  bus.On('TestE', () => { throw new Error('订阅者故意抛错'); });
  let survived = false;
  bus.On('TestE', () => { survived = true; });
  const originalConsoleError = console.error;
  console.error = () => {};
  try { bus.Emit('TestE'); } finally { console.error = originalConsoleError; }
  Assert(survived, '一个订阅者抛错不该中断其他订阅者');

  /* EmitLater 必须等 Flush */
  let deferred = 0;
  bus.On('TestF', () => { deferred += 1; });
  bus.EmitLater('TestF');
  AssertEqual(deferred, 0, 'EmitLater 不该立即派发');
  bus.Flush();
  AssertEqual(deferred, 1, 'Flush 后必须派发');
  bus.Dispose();
});

Check('EventNames 覆盖契约事件', () => {
  const required = [
    'NoiseEmitted', 'GunFired', 'MeleeHit', 'StealthKill', 'ThrowLanded',
    'EnemyAlertChanged', 'EnemySpotted', 'EnemyDown', 'SquadAlerted',
    'PlayerDamaged', 'PlayerDowned', 'HealthChanged', 'StaminaChanged', 'WarmthChanged',
    'ItemPicked', 'ItemCrafted', 'AmmoChanged', 'InteractPrompt',
    'ObjectiveChanged', 'StoryBeat', 'Subtitle', 'CompanionState',
    'WeatherChanged', 'ChapterChanged', 'GameOver', 'CostRecorded',
    'RequestTimeScale', 'PauseChanged', 'SaveWritten',
  ];
  const missing = required.filter((name) => EventNames[name] !== name);
  Assert(missing.length === 0, 'EventNames 缺少或值不同名：' + missing.join(', '));
});

/* ================================================================== *
 * 三、Config
 * ================================================================== */

Check('Config 顶层分组齐全', () => {
  const groups = ['Loop', 'Render', 'Camera', 'Player', 'Stealth', 'Enemy', 'Combat',
    'Survival', 'World', 'Weather', 'Audio', 'Hud', 'Save', 'Debug'];
  for (const group of groups) Assert(Config[group], 'Config 缺少分组 ' + group);
  AssertEqual(GetTuning('Stealth.Noise.gunshotRifle', -1), 40, 'GetTuning 点路径读取');
  AssertEqual(GetTuning('Nope.Nothing.Here', 'fallback'), 'fallback', 'GetTuning 缺省值');
  AssertEqual(Config.Save.key, SaveKey, 'Save.key 必须与 Rules.SaveKey 一致');
  AssertEqual(Config.Save.version, SaveVersion, 'Save.version 必须与 Rules.SaveVersion 一致');
});

/* ================================================================== *
 * 四、Rules：任务状态机
 * ================================================================== */

Check('任务状态机能从第一幕跑到结局', () => {
  const rules = CreateRules({ chapters: StoryChapters });
  const firstChapter = StoryChapters[0];
  rules.StartChapter(firstChapter.id, firstChapter);
  AssertEqual(rules.GetChapterId(), firstChapter.id, '第一幕未启动');
  Assert(rules.GetActiveObjective() !== null, '第一幕没有激活目标');

  const visited = [];
  let guard = 0;
  while (rules.GetStatus() !== MissionStatus.Ended && guard < 12) {
    guard += 1;
    visited.push(rules.GetChapterId());
    const objectives = rules.GetObjectives();
    Assert(objectives.length > 0, rules.GetChapterId() + ' 没有目标');
    for (let i = 0; i < objectives.length; i += 1) {
      if (objectives[i].optional) continue;
      rules.CompleteObjective(objectives[i].id);
    }
    Assert(rules.IsChapterComplete(), rules.GetChapterId() + ' 完成全部主线目标后仍未标记章节完成');
    rules.AdvanceChapter();
  }
  AssertEqual(rules.GetStatus(), MissionStatus.Ended, '三幕没跑到结局');
  AssertEqual(visited.length, StoryChapters.length, '走过的章节数不对：' + visited.join(' → '));
  AssertEqual(visited[0], 'ChapterSnowCellar', '第一幕 id 不对');
  AssertEqual(visited[visited.length - 1], 'ChapterWindPass', '最后一幕 id 不对');

  const ending = rules.EvaluateEnding();
  Assert(EndingCatalog[ending.endingId], '结局 id 不在 EndingCatalog 中：' + ending.endingId);
});

Check('目标完成 / 失败 / 进度', () => {
  const chapter = {
    id: 'ChapterTest', index: 1, title: '测试', subtitle: '', nextChapterId: null,
    objectives: [
      { id: 'ObjectiveA', text: '甲', kind: 'Collect', target: { count: 3 }, optional: false, failOn: [] },
      { id: 'ObjectiveB', text: '乙', kind: 'Reach', target: {}, optional: true, failOn: [] },
      { id: 'ObjectiveC', text: '丙', kind: 'Reach', target: {}, optional: false, failOn: [] },
    ],
  };
  const rules = CreateRules({ chapters: [chapter] });
  rules.StartChapter('ChapterTest', chapter);
  AssertEqual(rules.GetActiveObjective().id, 'ObjectiveA', '首个非可选目标应被激活');
  rules.ReportProgress('ObjectiveA', 1);
  AssertEqual(rules.IsObjectiveDone('ObjectiveA'), false, '进度未满不应完成');
  rules.ReportProgress('ObjectiveA', 2);
  AssertEqual(rules.IsObjectiveDone('ObjectiveA'), true, '进度满应自动完成');
  AssertEqual(rules.GetActiveObjective().id, 'ObjectiveC', '可选目标不应阻塞推进');

  const failRules = CreateRules({ chapters: [chapter] });
  failRules.StartChapter('ChapterTest', chapter);
  AssertEqual(failRules.FailObjective('ObjectiveA', 'Detected'), true, '失败应生效');
  AssertEqual(failRules.GetStatus(), MissionStatus.GameOver, '非可选目标失败应进入 GameOver');
});

Check('代价记录只记不计分', () => {
  const chapter = StoryChapters[0];
  const clean = CreateRules({ chapters: StoryChapters });
  clean.StartChapter(chapter.id, chapter);
  const costly = CreateRules({ chapters: StoryChapters });
  costly.StartChapter(chapter.id, chapter);
  costly.RecordCost('CostVillageBurned', '烧了三天');
  costly.RecordCost('CostCivilianLost', '');

  AssertEqual(costly.GetLedger().length, 2, '代价记录未写入');
  AssertEqual(JSON.stringify(clean.GetStats()), JSON.stringify(costly.GetStats()), '代价记录不得改变任何统计');
  AssertEqual(clean.EvaluateEnding().endingId, costly.EvaluateEnding().endingId, '代价记录不得改变结局判定');
  const ledger = costly.GetLedger();
  for (const entry of ledger) {
    Assert(typeof entry.key === 'string', '代价条目缺 key');
    Assert(!('score' in entry) && !('points' in entry) && !('rating' in entry), '代价条目不许带分数字段');
  }
});

Check('存档 round-trip', () => {
  const chapter = StoryChapters[1];
  const rules = CreateRules({ chapters: StoryChapters });
  rules.StartChapter(chapter.id, chapter);
  rules.MarkBeat('BeatRoadSighted');
  rules.SetFlag('CompanionMet', true);
  rules.RecordChoice('ChoiceStationReveal', 'OptionLetHerWalk');
  rules.Tally('shotsFired', 2);
  rules.RecordCost('CostFirstKill', '');

  const raw = rules.Serialize({ inventory: [{ id: 'Bandage', count: 1 }], ammo: { rifle: 2, pistol: 0, granted: 2 } });
  AssertEqual(raw.version, SaveVersion, '存档版本不对');
  const restored = DeserializeProgress(JSON.stringify(raw));
  Assert(restored, '存档还原失败');
  AssertEqual(restored.chapterId, chapter.id, '章节没还原');
  Assert(restored.beatsDone.indexOf('BeatRoadSighted') >= 0, '节拍没还原');
  AssertEqual(restored.flags.CompanionMet, true, '旗标没还原');
  AssertEqual(restored.choices.ChoiceStationReveal, 'OptionLetHerWalk', '选择没还原');
  AssertEqual(restored.tally.shotsFired, 2, '统计没还原');
  AssertEqual(restored.ledger.length, 1, '代价记录没还原');

  AssertEqual(DeserializeProgress('{ 坏掉的 json'), null, '坏存档必须返回 null 而不是抛错');
  AssertEqual(DeserializeProgress({ version: 999, chapterId: 'X' }), null, '版本不符必须返回 null');
  AssertEqual(DeserializeProgress(null), null, 'null 输入必须返回 null');
  Assert(SerializeProgress(null) !== null, 'SerializeProgress(null) 不该抛错');
});

/* ================================================================== *
 * 五、Rules：纯数学单调性
 * ================================================================== */

function DetectionParams(overrides) {
  return Object.assign({
    distance: 10, viewRange: 22, coneFalloff: 1, lineOfSight: true,
    lightLevel: 1, concealment: 0, targetSpeed: 1.8,
    crouched: false, prone: false, inCover: false, weather: 0, alert: 0,
  }, overrides || {});
}

Check('探测公式单调性', () => {
  const near = ComputeDetection(DetectionParams({ distance: 4 }));
  const far = ComputeDetection(DetectionParams({ distance: 18 }));
  Assert(near > far, '距离越近应越容易被发现：' + near + ' vs ' + far);

  const open = ComputeDetection(DetectionParams({}));
  const hidden = ComputeDetection(DetectionParams({ concealment: 0.8 }));
  Assert(hidden < open, '藏匿度越高应越难被发现');

  const standing = ComputeDetection(DetectionParams({}));
  const crouched = ComputeDetection(DetectionParams({ crouched: true }));
  const prone = ComputeDetection(DetectionParams({ prone: true }));
  Assert(crouched < standing, '蹲伏必须更难被发现');
  Assert(prone < standing, '伏地必须更难被发现');

  const bright = ComputeDetection(DetectionParams({ lightLevel: 1 }));
  const dark = ComputeDetection(DetectionParams({ lightLevel: 0 }));
  Assert(dark < bright, '越黑越难被发现');

  const still = ComputeDetection(DetectionParams({ targetSpeed: 0 }));
  const running = ComputeDetection(DetectionParams({ targetSpeed: 4.4 }));
  Assert(running > still, '跑动必须更容易被发现');

  const blocked = ComputeDetection(DetectionParams({ lineOfSight: false }));
  Assert(blocked < 0, '没视线必须回落（不许隔墙感知）：' + blocked);
  const outOfRange = ComputeDetection(DetectionParams({ distance: 999 }));
  Assert(outOfRange < 0, '超出视距必须回落');

  for (let i = 0; i < 40; i += 1) {
    const value = ComputeDetection(DetectionParams({ distance: i, alert: (i % 10) / 10 }));
    AssertBetween(value, -1, 1, 'ComputeDetection 返回值');
  }
});

Check('噪音衰减单调性', () => {
  AssertEqual(ComputeNoiseAudibility(40, 40, 0), 0, '距离等于半径应听不见');
  AssertEqual(ComputeNoiseAudibility(60, 40, 0), 0, '超出半径应听不见');
  let previous = Infinity;
  for (let distance = 0; distance < 40; distance += 2) {
    const value = ComputeNoiseAudibility(distance, 40, 0);
    AssertBetween(value, 0, 1, '可听度');
    Assert(value <= previous, '距离越远可听度必须不增：' + distance);
    previous = value;
  }
  const clear = ComputeNoiseAudibility(10, 40, 0);
  const muffled = ComputeNoiseAudibility(10, 40, 0.8);
  Assert(muffled < clear, '遮挡越强越听不见');
});

Check('合成消耗正确', () => {
  const inventory = [{ id: 'Cloth', count: 2 }, { id: 'Liquor', count: 1 }];
  const ok = ResolveCraft('RecipeBandage', inventory, RecipeCatalog, {});
  Assert(ok.ok, '材料齐全时应能合成：' + ok.reason);
  AssertEqual(ok.produced.id, 'Bandage', '产物不对');
  let clothConsumed = 0;
  let liquorConsumed = 0;
  for (const entry of ok.consumed) {
    if (entry.id === 'Cloth') clothConsumed = entry.count;
    if (entry.id === 'Liquor') liquorConsumed = entry.count;
  }
  AssertEqual(clothConsumed, 1, '破布消耗数量不对');
  AssertEqual(liquorConsumed, 1, '烧酒消耗数量不对');

  const poor = ResolveCraft('RecipeBandage', [{ id: 'Cloth', count: 1 }], RecipeCatalog, {});
  Assert(!poor.ok, '材料不足时不许合成');
  const missing = ResolveCraft('RecipeNotExist', inventory, RecipeCatalog, {});
  Assert(!missing.ok, '不存在的配方必须失败而不是抛错');
});

Check('弹药总量不超预算', () => {
  const budget = Config.Combat.AmmoBudget;
  let granted = 0;
  for (const chapter of StoryChapters) {
    Assert(Number.isFinite(chapter.ammoGrant), chapter.id + ' 缺少 ammoGrant');
    granted += chapter.ammoGrant;
  }
  Assert(granted <= budget.total, '三章弹药合计 ' + granted + ' 超过预算 ' + budget.total);
  Assert(budget.total <= 12, '全流程弹药不得超过 12 发（红线四）');
});

/* ================================================================== *
 * 六、Data_Story 完整性
 * ================================================================== */

Check('章节数据完整性', () => {
  AssertEqual(StoryChapters.length, 3, '必须是三幕');
  const ids = ListChapterIds();
  for (let i = 0; i < StoryChapters.length; i += 1) {
    const chapter = StoryChapters[i];
    AssertEqual(chapter.index, i + 1, chapter.id + ' 的 index 不对');
    Assert(chapter.title && chapter.subtitle, chapter.id + ' 缺标题或副标题');
    Assert(Array.isArray(chapter.objectives) && chapter.objectives.length > 0, chapter.id + ' 目标为空');
    Assert(chapter.worldPreset === 'Village' || chapter.worldPreset === 'Valley' || chapter.worldPreset === 'Pass',
      chapter.id + ' worldPreset 非法');
    Assert(['Dawn', 'Noon', 'Dusk', 'Night'].indexOf(chapter.timeOfDay) >= 0, chapter.id + ' timeOfDay 非法');
    Assert(['LightSnow', 'Overcast', 'Blizzard', 'Clear'].indexOf(chapter.weather) >= 0, chapter.id + ' weather 非法');

    const seen = new Set();
    for (const objective of chapter.objectives) {
      Assert(objective.id && objective.text, chapter.id + ' 有目标缺 id 或 text');
      Assert(!seen.has(objective.id), '目标 id 重复：' + objective.id);
      seen.add(objective.id);
      Assert(['Reach', 'Interact', 'Collect', 'Survive', 'Escort', 'Avoid', 'Choice', 'Escape']
        .indexOf(objective.kind) >= 0, objective.id + ' kind 非法：' + objective.kind);
      if (objective.beatOnStart) Assert(StoryBeats[objective.beatOnStart], objective.id + ' 的 beatOnStart 不存在');
      if (objective.beatOnComplete) Assert(StoryBeats[objective.beatOnComplete], objective.id + ' 的 beatOnComplete 不存在');
    }

    if (i < StoryChapters.length - 1) {
      AssertEqual(chapter.nextChapterId, StoryChapters[i + 1].id, chapter.id + ' 的 nextChapterId 断链');
      Assert(ids.indexOf(chapter.nextChapterId) >= 0, chapter.id + ' 指向不存在的章节');
    } else {
      AssertEqual(chapter.nextChapterId, null, '最后一幕的 nextChapterId 必须为 null');
    }
    Assert(FindChapter(chapter.id) === chapter, 'FindChapter 找不到 ' + chapter.id);
  }
});

Check('全部 lineId 引用可解析', () => {
  const unresolved = [];
  for (const beatId of Object.keys(StoryBeats)) {
    const beat = StoryBeats[beatId];
    AssertEqual(beat.id, beatId, '节拍 id 与键名不一致：' + beatId);
    Assert(FindChapter(beat.chapterId), beatId + ' 指向不存在的章节 ' + beat.chapterId);
    for (const lineId of (beat.lines || [])) {
      if (!GetLine(lineId)) unresolved.push(beatId + ' → ' + lineId);
    }
  }
  for (const setId of Object.keys(DialogueSets)) {
    for (const lineId of DialogueSets[setId]) {
      if (!GetLine(lineId)) unresolved.push(setId + ' → ' + lineId);
    }
  }
  for (const barkId of Object.keys(BarkTables)) {
    for (const lineId of BarkTables[barkId]) {
      if (!GetLine(lineId)) unresolved.push(barkId + ' → ' + lineId);
    }
  }
  Assert(unresolved.length === 0, '无法解析的台词引用：' + unresolved.join(', '));

  for (const lineId of Object.keys(Dialogue)) {
    const line = Dialogue[lineId];
    AssertEqual(line.id, lineId, '台词 id 与键名不一致：' + lineId);
    Assert(typeof line.text === 'string' && line.text.length > 0, lineId + ' 台词为空');
    Assert(['ShenTie', 'Xiaoman', 'Radio', 'Narrator', 'Enemy'].indexOf(line.speaker) >= 0,
      lineId + ' speaker 非法：' + line.speaker);
  }
});

Check('结局目录与终局抉择', () => {
  const required = ['EndingLetHerWalk', 'EndingRevealStation', 'EndingAlone'];
  for (const id of required) {
    const ending = EndingCatalog[id];
    Assert(ending, '缺少结局 ' + id);
    Assert(Array.isArray(ending.lines) && ending.lines.length > 0, id + ' 结局文本为空');
    Assert(['Bitter', 'Quiet', 'Costly'].indexOf(ending.tone) >= 0, id + ' tone 非法');
  }
  const finalChapter = StoryChapters[StoryChapters.length - 1];
  const choiceObjective = finalChapter.objectives.filter((o) => o.kind === 'Choice')[0];
  Assert(choiceObjective, '第三幕缺少终局抉择目标');
  AssertEqual(choiceObjective.target.choiceId, 'ChoiceStationReveal', '终局抉择 choiceId 不对');
});

/* ================================================================== *
 * 汇总
 * ================================================================== */

export function RunSmokeTests() {
  let passed = 0;
  let failed = 0;
  for (const result of results) {
    if (result.ok) passed += 1; else failed += 1;
  }
  return { passed: passed, failed: failed, results: results.slice() };
}

const summary = RunSmokeTests();
const isCli = process.argv[1] && process.argv[1].endsWith('Script_SmokeTest.mjs');
if (isCli) {
  for (const result of summary.results) {
    console.log((result.ok ? '  ok   ' : '  FAIL ') + result.name + (result.ok ? '' : ' —— ' + result.message));
  }
  console.log('');
  console.log('冒烟测试：' + summary.passed + ' 通过 / ' + summary.failed + ' 失败');
  process.exit(summary.failed === 0 ? 0 : 1);
}

export default RunSmokeTests;
