/**
 * Script_Boot.mjs — 装配、ctx 创建、主循环、生命周期
 * Owner: AgentBoot
 *
 * 职责（AGENTS.md 5.16）：
 *  1. 按第四节的 P0 → P1 → P2 → P3 顺序装配 ctx。
 *  2. 跑第七节固定顺序的主循环（逻辑固定步长 + 表现可变步长）。
 *  3. resize / visibilitychange / 首次手势解锁音频 / 存档 / 换章。
 *  4. 处理 RequestTimeScale 与 hitstop。
 *  5. 捕获一切异常并降级到**可读的中文错误页**——绝不允许白屏。
 *
 * 依赖 DAG：three + 全部模块。Hud 用可选动态 import（AgentInterface 尚未接管时不阻塞开机）。
 */

import * as THREE from 'three';
import { Config, ApplyChapterOverrides, ApplyQualityPreset } from './Script_Config.mjs';
import * as MathUtil from './Script_Math.mjs';
import { CreateEventBus, EventNames } from './Script_Event.mjs';
import { CreateRules } from './Script_Rules.mjs';
import { StoryChapters, FindChapter, ListChapterIds } from './Data_Story.mjs';
import { CreateArt } from './Script_Art.mjs';
import { CreateWorld } from './Script_World.mjs';
import { CreateCharacterFactory } from './Script_Character.mjs';
import { CreateInput, CreatePlayer } from './Script_Player.mjs';
import { CreateEnemyDirector } from './Script_EnemyAi.mjs';
import { CreateCombat } from './Script_Combat.mjs';
import { CreateSurvival } from './Script_Survival.mjs';
import { CreateStory } from './Script_Story.mjs';
import { CreateAudio } from './Script_Audio.mjs';

const BuildVersion = Config.Meta.version + '+' + Config.Meta.buildDate;

/* ================================================================== *
 * 一、可读错误页（绝不白屏）
 * ================================================================== */

const ErrorPanelId = 'BootErrorPanel';

function ShowFatalError(mount, title, detail) {
  if (typeof document === 'undefined') return;
  let panel = document.getElementById(ErrorPanelId);
  if (!panel) {
    panel = document.createElement('div');
    panel.id = ErrorPanelId;
    panel.setAttribute('role', 'alert');
    panel.style.cssText = [
      'position:absolute', 'left:0', 'right:0', 'bottom:0', 'z-index:9999',
      'max-height:46vh', 'overflow:auto', 'padding:14px 18px',
      'background:rgba(10,14,19,0.94)', 'border-top:1px solid rgba(180,69,58,0.55)',
      'color:#e6ebf1', 'font:400 13px/1.6 system-ui,sans-serif',
      'letter-spacing:0.02em', 'white-space:pre-wrap', 'pointer-events:auto',
    ].join(';');
    (mount || document.body).appendChild(panel);
  }
  const stamp = new Date().toLocaleTimeString('zh-CN');
  const block = document.createElement('p');
  block.style.cssText = 'margin:0 0 8px;';
  block.textContent = '[' + stamp + '] ' + title + (detail ? '\n' + detail : '');
  panel.appendChild(block);
  while (panel.childElementCount > 8) panel.removeChild(panel.firstChild);
}

function DescribeError(error) {
  if (!error) return '未知错误';
  if (typeof error === 'string') return error;
  const message = error.message || String(error);
  const stack = error.stack ? String(error.stack).split('\n').slice(0, 4).join('\n') : '';
  return stack || message;
}

/* ================================================================== *
 * 二、P0 上下文
 * ================================================================== */

function GuessMobile() {
  if (typeof window === 'undefined') return false;
  const touch = ('ontouchstart' in window) || (navigator && navigator.maxTouchPoints > 0);
  const narrow = window.innerWidth <= 820;
  return !!(touch && narrow);
}

function GuessQuality(isMobile) {
  if (typeof window === 'undefined') return 'medium';
  if (isMobile) return 'low';
  const cores = (navigator && navigator.hardwareConcurrency) || 4;
  const ratio = window.devicePixelRatio || 1;
  if (cores >= 8 && ratio <= 2) return 'high';
  if (cores >= 4) return 'medium';
  return 'low';
}

function CreateSaveApi(key) {
  function Available() {
    try { return typeof window !== 'undefined' && !!window.localStorage; } catch (error) { return false; }
  }
  return {
    key: key,
    Load() {
      if (!Available()) return null;
      try {
        const raw = window.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch (error) { return null; }
    },
    Save(data) {
      if (!Available()) return false;
      try { window.localStorage.setItem(key, JSON.stringify(data)); return true; } catch (error) { return false; }
    },
    Clear() {
      if (!Available()) return;
      try { window.localStorage.removeItem(key); } catch (error) { /* 静默降级 */ }
    },
  };
}

/** 只造 P0 字段，便于在无 WebGL 环境下做装配测试。 */
export function CreateContext(options) {
  const settings = options || {};
  const mount = settings.mount || (typeof document !== 'undefined' ? document.getElementById('GameRoot') : null);
  const canvas = settings.canvas || (typeof document !== 'undefined' ? document.getElementById('GameCanvas') : null);
  const isMobile = settings.isMobile === undefined ? GuessMobile() : settings.isMobile;
  const quality = settings.quality || GuessQuality(isMobile);
  const bus = CreateEventBus({ debug: !!settings.debug, historyLimit: 96 });

  const gizmos = new THREE.Group();
  gizmos.name = 'GroupDebugGizmos';
  gizmos.visible = false;

  const debug = {
    enabled: !!settings.debug || Config.Debug.enabled,
    flags: new Set(),
    watch: {},
    gizmos: gizmos,
    Log(tag) {
      if (!debug.enabled) return;
      const rest = Array.prototype.slice.call(arguments, 1);
      console.info('[Blackstone1943][' + tag + ']', ...rest);
    },
    Watch(key, value) { debug.watch[key] = value; },
  };

  const ctx = {
    THREE: THREE,
    version: BuildVersion,
    config: Config,
    bus: bus,
    random: MathUtil.CreateRandom(settings.seed === undefined ? 19431217 : settings.seed),
    clock: new THREE.Clock(false),
    canvas: canvas,
    mount: mount,
    isMobile: isMobile,
    quality: quality,
    debug: debug,
    save: CreateSaveApi(Config.Save.key),

    renderer: null, scene: null, camera: null, art: null, rules: null,
    world: null, characters: null, audio: null,
    input: null, player: null, survival: null, combat: null,
    enemies: null, story: null, companion: null, hud: null,

    dt: 0, rawDt: 0, elapsed: 0, frame: 0, timeScale: 1, paused: false,
  };
  return ctx;
}

/* ================================================================== *
 * 三、Hud 兜底（AgentInterface 接管前的静默替身）
 * ================================================================== */

function HudRootElement(ctx) {
  if (typeof document === 'undefined') return null;
  return document.getElementById('HudRoot') || ctx.mount;
}

function CreateHudFallback(ctx) {
  const noop = function Noop() {};
  const resolved = function Resolved() { return Promise.resolve(); };
  return {
    root: HudRootElement(ctx),
    isFallback: true,
    SetVisible: noop, ShowSubtitle: noop, ClearSubtitle: noop, ShowSoundCaption: noop,
    ShowPrompt: noop, HidePrompt: noop, ShowInteractProgress: noop, HideInteractProgress: noop,
    ShowToast: noop, ShowObjective: noop, SetObjectiveList: noop,
    ShowChapterTitle: resolved,
    SetVitals: noop, SetAmmo: noop, SetStealthState: noop, SetCrosshair: noop,
    SetThrowArc: noop, SetCompanionState: noop,
    OpenInventory: noop, CloseInventory: noop, ToggleInventory: noop,
    OpenMenu: noop, CloseMenu: noop, IsMenuOpen() { return false; },
    ShowChoice() { return Promise.resolve(null); },
    ShowEnding: resolved,
    ShowGameOver() { return Promise.resolve('Retry'); },
    FadeTo: resolved, SetLetterbox: noop, SetLoading: noop,
    SetTouchVisible: noop, BindTouchControls: noop,
    GetSettings() { return {}; }, ApplySettings: noop,
    SetDebugText: noop, Update: noop, Dispose: noop,
  };
}

async function LoadHud(ctx) {
  try {
    const module = await import('./Script_Hud.mjs');
    if (module && typeof module.CreateHud === 'function') {
      /* root 必须是 #HudRoot（HUD 层），不是 #GameRoot（挂载根）：
         传错的话 Hud 会把「显示自己」的操作打到 GameRoot 上，HUD 永远不出来。 */
      const hud = module.CreateHud(ctx, { root: HudRootElement(ctx) });
      if (hud) return hud;
    }
  } catch (error) {
    ctx.debug.Log('Boot', 'Script_Hud.mjs 尚未就绪，使用静默替身', error && error.message);
  }
  return CreateHudFallback(ctx);
}

/* ================================================================== *
 * 四、Boot
 * ================================================================== */

export async function Boot(options) {
  const settings = options || {};
  const ctx = CreateContext(settings);
  const bus = ctx.bus;
  const loopConfig = Config.Loop;

  /* —— QA 探针读这一份；必须是可 JSON 序列化的纯对象 —— */
  const publicDebug = {
    version: BuildVersion,
    ready: false,
    fps: 0,
    frameMs: 0,
    drawCalls: 0,
    triangles: 0,
    programs: 0,
    frame: 0,
    elapsed: 0,
    quality: ctx.quality,
    paused: false,
    chapterId: null,
    objectiveId: null,
    hudFallback: false,
    characters: 0,
    enemies: 0,
    playerPosition: { x: 0, y: 0, z: 0 },
    cameraPosition: { x: 0, y: 0, z: 0 },
    timings: {},
    watch: ctx.debug.watch,
    errors: [],
  };

  if (typeof window !== 'undefined') {
    window.__Blackstone = { ctx: ctx, debug: publicDebug, version: BuildVersion };
  }

  /* —— 全局异常兜底：绝不白屏 —— */
  const globalHandlers = [];
  function BindGlobal(type, handler) {
    if (typeof window === 'undefined') return;
    window.addEventListener(type, handler);
    globalHandlers.push(() => window.removeEventListener(type, handler));
  }
  BindGlobal('error', (event) => {
    ShowFatalError(ctx.mount, '运行时错误：' + (event.message || '未知'),
      event.filename ? (event.filename + ':' + event.lineno) : '');
    publicDebug.errors.push(String(event.message || 'error'));
  });
  BindGlobal('unhandledrejection', (event) => {
    ShowFatalError(ctx.mount, '未捕获的异步错误', DescribeError(event.reason));
    publicDebug.errors.push(DescribeError(event.reason).slice(0, 200));
    if (event.preventDefault) event.preventDefault();
  });

  /* ---------------------------------------------------------------- *
   * P1 渲染栈 + 纯逻辑
   * ---------------------------------------------------------------- */
  ApplyQualityPreset(ctx.quality);
  ctx.art = CreateArt(ctx, { canvas: ctx.canvas, quality: ctx.quality });
  ctx.renderer = ctx.art.renderer;
  ctx.scene = ctx.art.scene;
  ctx.camera = ctx.art.camera;
  ctx.scene.add(ctx.debug.gizmos);
  ctx.rules = CreateRules({ config: Config, chapters: StoryChapters });

  /* ---------------------------------------------------------------- *
   * P2 世界 / 角色 / 音频
   * ---------------------------------------------------------------- */
  const startChapterId = settings.chapterId || ListChapterIds()[0];
  let chapter = FindChapter(startChapterId) || StoryChapters[0];
  ApplyChapterOverrides(chapter.id);
  ctx.random = MathUtil.CreateRandom(chapter.worldSeed);

  ctx.characters = CreateCharacterFactory(ctx, {});
  ctx.audio = CreateAudio(ctx, {});
  ctx.world = CreateWorld(ctx, { chapterId: chapter.id, preset: chapter.worldPreset, seed: chapter.worldSeed });
  ctx.scene.add(ctx.world.group);
  ctx.art.SetTimeOfDay(chapter.timeOfDay);
  ctx.art.SetWeather(chapter.weather);

  /* ---------------------------------------------------------------- *
   * P3 玩法与表现
   * ---------------------------------------------------------------- */
  ctx.input = CreateInput(ctx, { element: ctx.canvas });
  ctx.player = CreatePlayer(ctx, { spawn: ctx.world.spawns.playerStart });
  ctx.survival = CreateSurvival(ctx, {});
  ctx.combat = CreateCombat(ctx, {});
  ctx.enemies = CreateEnemyDirector(ctx, { profile: chapter.enemyProfile });
  ctx.story = CreateStory(ctx, { chapterId: chapter.id });
  ctx.hud = await LoadHud(ctx);
  publicDebug.hudFallback = ctx.hud.isFallback === true;

  ctx.enemies.SetChapterProfile(chapter.enemyProfile);
  ctx.enemies.SpawnFromWorld();
  ctx.rules.StartChapter(chapter.id, chapter);
  ctx.story.StartChapter(chapter.id);
  ctx.companion = ctx.story.companion;

  /* 装配完成：把 HUD 打开、载入遮罩撤掉（对静默替身也是安全调用） */
  ctx.hud.SetLoading(false);
  ctx.hud.SetVisible(true);
  ctx.hud.SetTouchVisible(ctx.isMobile);
  if (ctx.input) ctx.input.SetTouchEnabled(ctx.isMobile);

  /* ---------------------------------------------------------------- *
   * 尺寸自适应（含 DPR 上限）
   * ---------------------------------------------------------------- */
  function CurrentPixelRatio() {
    const raw = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const cap = ctx.quality === 'low' ? 1.5 : Config.Render.pixelRatioCap;
    return Math.min(cap, raw);
  }

  function Resize() {
    const width = ctx.mount ? (ctx.mount.clientWidth || window.innerWidth) : 1280;
    const height = ctx.mount ? (ctx.mount.clientHeight || window.innerHeight) : 720;
    ctx.art.Resize(width, height, CurrentPixelRatio());
  }
  Resize();
  BindGlobal('resize', Resize);
  BindGlobal('orientationchange', Resize);

  /* ---------------------------------------------------------------- *
   * 暂停 / 可见性 / 首次手势解锁音频
   * ---------------------------------------------------------------- */
  let running = false;
  let pauseReasons = new Set();

  function SetPaused(paused, reason) {
    const wasPaused = ctx.paused;
    ctx.paused = paused;
    if (wasPaused !== paused) bus.Emit(EventNames.PauseChanged, { paused: paused, reason: reason || '' });
    publicDebug.paused = paused;
  }

  function Pause(reason) {
    pauseReasons.add(reason || 'Manual');
    SetPaused(true, reason);
  }

  function Resume(reason) {
    pauseReasons.delete(reason || 'Manual');
    if (pauseReasons.size === 0) {
      ctx.clock.getDelta();
      SetPaused(false, reason);
    }
  }

  function OnVisibilityChange() {
    if (typeof document === 'undefined') return;
    if (document.hidden) Pause('Hidden');
    else Resume('Hidden');
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', OnVisibilityChange);
    globalHandlers.push(() => document.removeEventListener('visibilitychange', OnVisibilityChange));
  }

  let audioUnlockBound = true;
  function UnlockAudioOnce() {
    if (!audioUnlockBound) return;
    audioUnlockBound = false;
    const promise = ctx.audio.Unlock();
    if (promise && typeof promise.catch === 'function') promise.catch(() => {});
  }
  if (typeof window !== 'undefined') {
    const unlockTypes = ['pointerdown', 'keydown', 'touchstart'];
    for (let i = 0; i < unlockTypes.length; i += 1) {
      window.addEventListener(unlockTypes[i], UnlockAudioOnce, { once: true, passive: true });
    }
  }
  UnlockAudioOnce();

  /* ---------------------------------------------------------------- *
   * 时间缩放 / hitstop
   * ---------------------------------------------------------------- */
  let timeScaleSeconds = 0;
  let timeScaleTarget = 1;
  const unsubscribers = [];
  unsubscribers.push(bus.On(EventNames.RequestTimeScale, (payload) => {
    timeScaleTarget = MathUtil.Clamp(payload && payload.scale !== undefined ? payload.scale : 1, 0.02, 3);
    timeScaleSeconds = Math.min(loopConfig.hitstopMaxSeconds * 4, (payload && payload.seconds) || 0.1);
  }));
  unsubscribers.push(bus.On(EventNames.RequestCameraShake, (payload) => {
    if (!payload) return;
    ctx.art.ShakeCamera(payload.strength || 0.2, payload.seconds || 0.2, payload.frequency);
  }));

  /* ---------------------------------------------------------------- *
   * 存档
   * ---------------------------------------------------------------- */
  let autosaveSeconds = 0;
  function SaveNow() {
    const data = ctx.rules.Serialize({
      stats: ctx.survival ? {
        health: ctx.survival.stats.health, stamina: ctx.survival.stats.stamina,
        warmth: ctx.survival.stats.warmth, hunger: ctx.survival.stats.hunger,
      } : null,
      inventory: ctx.survival ? ctx.survival.inventory.slice() : [],
      ammo: ctx.survival
        ? { rifle: ctx.survival.ammo.rifle, pistol: ctx.survival.ammo.pistol, granted: ctx.survival.GetTotalAmmoGranted() }
        : { rifle: 0, pistol: 0, granted: 0 },
    });
    const ok = ctx.save.Save(data);
    bus.Emit(EventNames.SaveWritten, { key: ctx.save.key, chapterId: ctx.rules.GetChapterId(), ok: ok });
    return ok;
  }

  /* ---------------------------------------------------------------- *
   * 换章
   * ---------------------------------------------------------------- */
  let chapterSwitchPending = null;

  async function LoadChapter(chapterId) {
    const next = FindChapter(chapterId);
    if (!next) return;
    chapter = next;
    ApplyChapterOverrides(chapter.id);
    ctx.hud.SetLoading(true, '正在铺开' + chapter.title + '的雪…');

    if (ctx.enemies) ctx.enemies.Dispose();
    if (ctx.world) ctx.world.Dispose();
    ctx.art.ClearTransient();

    ctx.random = MathUtil.CreateRandom(chapter.worldSeed);
    ctx.world = CreateWorld(ctx, { chapterId: chapter.id, preset: chapter.worldPreset, seed: chapter.worldSeed });
    ctx.scene.add(ctx.world.group);
    ctx.art.SetTimeOfDay(chapter.timeOfDay);
    ctx.art.SetWeather(chapter.weather);

    ctx.enemies = CreateEnemyDirector(ctx, { profile: chapter.enemyProfile });
    ctx.enemies.SpawnFromWorld();
    if (ctx.player) ctx.player.Teleport(ctx.world.spawns.playerStart.position, ctx.world.spawns.playerStart.yaw);
    if (ctx.audio) ctx.audio.SetAmbience(chapter.ambience);

    ctx.story.StartChapter(chapter.id);
    ctx.companion = ctx.story.companion;
    publicDebug.chapterId = chapter.id;
    ctx.hud.SetLoading(false);
    SaveNow();
  }

  function ConsumeEffects(effects) {
    for (let i = 0; i < effects.length; i += 1) {
      const effect = effects[i];
      const payload = effect.payload || {};
      if (effect.kind === 'ObjectiveChanged') {
        bus.Emit(EventNames.ObjectiveChanged, payload);
        publicDebug.objectiveId = payload.objectiveId || publicDebug.objectiveId;
        SaveNow();
      } else if (effect.kind === 'ChapterChanged') {
        bus.Emit(EventNames.ChapterChanged, payload);
        if (payload.complete) chapterSwitchPending = payload.nextChapterId || null;
      } else if (effect.kind === 'GameOver') {
        if (payload.reason === 'Ended') {
          const ending = ctx.rules.EvaluateEnding();
          bus.Emit(EventNames.GameEnded, ending);
        } else {
          bus.Emit(EventNames.GameOver, payload);
        }
      } else if (effect.kind === 'StoryBeat') {
        if (ctx.story) ctx.story.TriggerBeat(payload.id);
      } else if (effect.kind === 'Toast') {
        if (payload.kind === 'Cost') {
          bus.Emit(EventNames.CostRecorded, { key: payload.key, label: payload.key, note: payload.note || '' });
        }
      }
    }
  }

  /* ---------------------------------------------------------------- *
   * 主循环
   * ---------------------------------------------------------------- */
  const timings = {
    input: 0, player: 0, story: 0, enemies: 0, combat: 0, survival: 0,
    rules: 0, world: 0, characters: 0, art: 0, render: 0, hud: 0, audio: 0,
  };
  const timingKeys = Object.keys(timings);
  let accumulator = 0;
  let fpsAccumulator = 0;
  let fpsFrames = 0;
  let frameHandle = 0;

  const Now = (typeof performance === 'object' && performance && performance.now)
    ? () => performance.now()
    : () => Date.now();

  function Measure(key, start) {
    const spent = Now() - start;
    timings[key] = timings[key] * 0.9 + spent * 0.1;
  }

  function BuildRulesSnapshot() {
    const survivalStats = ctx.survival ? ctx.survival.stats : null;
    const playerPosition = ctx.player ? ctx.player.position : { x: 0, y: 0, z: 0 };
    return {
      chapterId: chapter.id,
      elapsed: ctx.elapsed,
      playerPosition: { x: playerPosition.x, y: playerPosition.y, z: playerPosition.z },
      playerHealth: survivalStats ? survivalStats.health : Config.Survival.maxHealth,
      playerWarmth: survivalStats ? survivalStats.warmth : Config.Survival.maxWarmth,
      playerStamina: survivalStats ? survivalStats.stamina : Config.Survival.maxStamina,
      bleeding: survivalStats ? survivalStats.bleeding : false,
      ammoTotal: ctx.survival ? (ctx.survival.ammo.rifle + ctx.survival.ammo.pistol) : 0,
      alertLevel: ctx.enemies ? ctx.enemies.GetAlertLevel() : 0,
      enemiesAlive: ctx.enemies ? ctx.enemies.AliveCount() : 0,
      companionMode: ctx.companion ? ctx.companion.mode : 'None',
      indoors: ctx.player ? ctx.player.state.indoors : false,
    };
  }

  /** 固定步长段：契约主循环的 1—8 步（input 已在帧头跑过一次）。 */
  function StepLogic(step) {
    ctx.dt = step;

    let mark = Now();
    ctx.player.Update(step, ctx);
    Measure('player', mark);

    mark = Now();
    ctx.story.Update(step, ctx);
    ctx.companion = ctx.story.companion;
    Measure('story', mark);

    mark = Now();
    ctx.enemies.Update(step, ctx);
    Measure('enemies', mark);

    mark = Now();
    ctx.combat.Update(step, ctx);
    Measure('combat', mark);

    mark = Now();
    ctx.survival.Update(step, ctx);
    Measure('survival', mark);

    mark = Now();
    const effects = ctx.rules.Update(step, BuildRulesSnapshot());
    if (effects.length > 0) ConsumeEffects(effects);
    Measure('rules', mark);

    mark = Now();
    ctx.world.Update(step, ctx);
    Measure('world', mark);

    ctx.elapsed += step;
  }

  function Frame() {
    frameHandle = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame(Frame) : 0;
    if (!running) return;
    const frameStart = Now();

    /* 契约第四节：ctx.rawDt 是**未缩放的真实帧时间**，不许 clamp。
       clamp 只发生在给模拟用的 ctx.dt 上——否则卡顿时 HUD 的字幕与章节卡会跟着变慢动作。 */
    const realDt = ctx.clock.getDelta();
    const rawDt = Math.min(realDt, loopConfig.maxDeltaSeconds * 4);
    ctx.rawDt = realDt;

    /* hitstop 优先于 RequestTimeScale：命中要有停顿感 */
    if (ctx.combat && ctx.combat.hitstop > 0) ctx.timeScale = 0.06;
    else if (timeScaleSeconds > 0) {
      ctx.timeScale = timeScaleTarget;
      timeScaleSeconds -= rawDt;
      if (timeScaleSeconds <= 0) { ctx.timeScale = 1; timeScaleTarget = 1; }
    } else ctx.timeScale = 1;

    const frameDt = Math.min(rawDt, loopConfig.maxDeltaSeconds) * ctx.timeScale;
    ctx.dt = frameDt;
    ctx.frame += 1;

    try {
      if (!ctx.paused) {
        let mark = Now();
        ctx.input.Update(rawDt, ctx);
        Measure('input', mark);

        accumulator += frameDt;
        const maxSubSteps = 4;
        let steps = 0;
        while (accumulator >= loopConfig.fixedStep && steps < maxSubSteps) {
          StepLogic(loopConfig.fixedStep);
          accumulator -= loopConfig.fixedStep;
          steps += 1;
        }
        /* 落后太多就丢掉欠账，绝不「追帧螺旋」 */
        if (accumulator > loopConfig.fixedStep * maxSubSteps) accumulator = 0;

        mark = Now();
        ctx.characters.Update(frameDt, ctx);
        Measure('characters', mark);
      }

      bus.Flush();

      if (!ctx.paused) {
        const mark = Now();
        ctx.art.Update(frameDt, ctx);
        Measure('art', mark);
      }

      let mark = Now();
      ctx.art.Render(ctx);
      Measure('render', mark);

      /* HUD 与音频吃**真实帧时间**，不吃被 clamp/timeScale 缩过的游戏时间：
         字幕、章节卡、淡入淡出不该因为卡顿或 hitstop 跟着放慢。暂停时按契约传 0。 */
      const presentationDt = ctx.paused ? 0 : Math.min(realDt, 0.5);

      mark = Now();
      ctx.hud.Update(presentationDt, ctx);
      Measure('hud', mark);

      mark = Now();
      ctx.audio.Update(presentationDt, ctx);
      Measure('audio', mark);

      if (!ctx.paused) {
        autosaveSeconds += frameDt;
        if (autosaveSeconds >= loopConfig.autosaveSeconds) { autosaveSeconds = 0; SaveNow(); }
      }

      if (chapterSwitchPending) {
        const nextId = chapterSwitchPending;
        chapterSwitchPending = null;
        ctx.rules.AdvanceChapter();
        LoadChapter(nextId).catch((error) => {
          ShowFatalError(ctx.mount, '换章失败：' + nextId, DescribeError(error));
        });
      }
    } catch (error) {
      running = false;
      ShowFatalError(ctx.mount, '主循环中断，已停帧以保留现场', DescribeError(error));
      publicDebug.errors.push(DescribeError(error).slice(0, 300));
      console.error('[Blackstone1943] frame error', error);
    }

    /* —— 调试快照 —— */
    const frameMs = Now() - frameStart;
    fpsAccumulator += rawDt;
    fpsFrames += 1;
    if (fpsAccumulator >= 0.5) {
      publicDebug.fps = Math.round(fpsFrames / fpsAccumulator);
      fpsAccumulator = 0;
      fpsFrames = 0;
    }
    publicDebug.frameMs = Math.round(frameMs * 100) / 100;
    publicDebug.drawCalls = ctx.art.stats.drawCalls;
    publicDebug.triangles = ctx.art.stats.triangles;
    publicDebug.programs = ctx.art.stats.programs;
    publicDebug.frame = ctx.frame;
    publicDebug.elapsed = Math.round(ctx.elapsed * 100) / 100;
    publicDebug.chapterId = ctx.rules.GetChapterId();
    publicDebug.characters = ctx.characters.count;
    publicDebug.enemies = ctx.enemies.AliveCount();
    if (ctx.player) {
      publicDebug.playerPosition.x = Math.round(ctx.player.position.x * 100) / 100;
      publicDebug.playerPosition.y = Math.round(ctx.player.position.y * 100) / 100;
      publicDebug.playerPosition.z = Math.round(ctx.player.position.z * 100) / 100;
    }
    publicDebug.cameraPosition.x = Math.round(ctx.camera.position.x * 100) / 100;
    publicDebug.cameraPosition.y = Math.round(ctx.camera.position.y * 100) / 100;
    publicDebug.cameraPosition.z = Math.round(ctx.camera.position.z * 100) / 100;
    for (let i = 0; i < timingKeys.length; i += 1) {
      const key = timingKeys[i];
      publicDebug.timings[key] = Math.round(timings[key] * 100) / 100;
    }
  }

  /* ---------------------------------------------------------------- *
   * 手柄
   * ---------------------------------------------------------------- */
  const handle = {
    ctx: ctx,
    Start() {
      if (running) return;
      running = true;
      ctx.clock.start();
      ctx.clock.getDelta();
      if (typeof requestAnimationFrame === 'function' && !frameHandle) frameHandle = requestAnimationFrame(Frame);
      publicDebug.ready = true;
    },
    Pause(reason) { Pause(reason || 'Manual'); },
    Resume(reason) { Resume(reason || 'Manual'); },
    IsRunning() { return running && !ctx.paused; },
    LoadChapter(chapterId) { return LoadChapter(chapterId); },
    async Restart(chapterId) {
      ctx.rules.Reset();
      await LoadChapter(chapterId || chapter.id);
      ctx.rules.StartChapter(chapter.id, chapter);
    },
    SaveNow: SaveNow,
    Dispose() {
      running = false;
      if (frameHandle && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frameHandle);
      for (let i = 0; i < unsubscribers.length; i += 1) unsubscribers[i]();
      for (let i = 0; i < globalHandlers.length; i += 1) globalHandlers[i]();
      if (ctx.hud) ctx.hud.Dispose();
      if (ctx.story) ctx.story.Dispose();
      if (ctx.enemies) ctx.enemies.Dispose();
      if (ctx.combat) ctx.combat.Dispose();
      if (ctx.survival) ctx.survival.Dispose();
      if (ctx.player) ctx.player.Dispose();
      if (ctx.input) ctx.input.Dispose();
      if (ctx.world) ctx.world.Dispose();
      if (ctx.characters) ctx.characters.Dispose();
      if (ctx.audio) ctx.audio.Dispose();
      if (ctx.art) ctx.art.Dispose();
      bus.Dispose();
      if (typeof window !== 'undefined' && window.__Blackstone) delete window.__Blackstone;
    },
  };

  /* ---------------------------------------------------------------- *
   * Hud 的系统请求（RequestPause / RequestRestart / RequestTitle）
   * 契约第六节没有这三条，但 Hud 只能通过总线够到生命周期；见第十节的偏差记录。
   * ---------------------------------------------------------------- */
  unsubscribers.push(bus.On('RequestPause', (payload) => {
    const reason = (payload && payload.reason) || 'Menu';
    if (payload && payload.paused === false) Resume(reason);
    else Pause(reason);
  }));
  unsubscribers.push(bus.On('RequestRestart', (payload) => {
    const reason = (payload && payload.reason) || 'Menu';
    /* 重开先把所有暂停理由清干净，否则新一章一起手就是停帧的。 */
    pauseReasons.clear();
    SetPaused(false, reason);
    const chapterIds = ListChapterIds();
    const target = reason === 'Ending' ? (chapterIds[0] || chapter.id) : chapter.id;
    handle.Restart(target).catch((error) => {
      ShowFatalError(ctx.mount, '重新开始失败', DescribeError(error));
    });
  }));
  unsubscribers.push(bus.On('RequestTitle', () => {
    /* 回标题 = 存盘后重载页面：外壳的 booted 闭包无法从这里复位，重载是唯一干净的路。 */
    try { SaveNow(); } catch (error) { /* 存不上也要能回去 */ }
    if (typeof window !== 'undefined' && window.location && typeof window.location.reload === 'function') {
      window.location.reload();
    }
  }));

  /* 存档续玩 */
  if (settings.fromSave) {
    const saved = ctx.save.Load();
    if (saved && saved.chapterId && saved.chapterId !== chapter.id) {
      await LoadChapter(saved.chapterId);
      ctx.rules.Restore(saved);
    }
  }

  if (typeof window !== 'undefined') {
    window.__Blackstone.handle = handle;
  }

  if (settings.autoStart !== false) handle.Start();
  return handle;
}

export default Boot;
