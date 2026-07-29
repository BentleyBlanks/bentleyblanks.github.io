// Script_Hud.mjs — HUD / 菜单 / 字幕 / 无障碍 / 触屏控件绑定
// Owner: AgentInterface。DOM 骨架在 index.html，样式在 Style_Game.css。
// 纪律：不 import three；DOM 写入只在值变化时执行，禁止每帧 innerHTML。

import * as ConfigModule from './Script_Config.mjs';
import * as EventModule from './Script_Event.mjs';
import * as StoryData from './Data_Story.mjs';

/* ============================ 常量与小工具 ============================ */

const SpeakerLabels = {
  ShenTie: '沈铁',
  Xiaoman: '冯小满',
  FengXiaoman: '冯小满',
  Radio: '电台',
  Narrator: '',
  Enemy: '敌兵',
  Companion: '冯小满',
};

const CompanionModeLabels = {
  Follow: '跟着你',
  Stay: '在原地等',
  Hide: '藏起来了',
  Lead: '在前面带路',
  Squeeze: '正在钻过去',
  Watch: '在放风',
  Distract: '在引开他们',
  Carry: '抱着东西',
  Captured: '被抓走了',
  Comfort: '缓一缓',
  Scripted: '——',
};

const ToastKindOrder = { Info: 0, Item: 1, Warning: 2, Cost: 3 };

const StatLabels = {
  shotsFired: '开过的枪',
  detections: '被发现',
  reloads: '装填',
  crafted: '做出来的东西',
  firesLit: '生过的火',
  playSeconds: '走了多久',
};

const FallbackBindings = [
  { action: 'move', key: 'W A S D', label: '移动' },
  { action: 'sprint', key: 'Shift', label: '奔跑' },
  { action: 'crouch', key: 'C', label: '蹲伏' },
  { action: 'prone', key: 'Z', label: '伏地' },
  { action: 'interact', key: 'F', label: '交互 / 搜刮' },
  { action: 'aim', key: '鼠标右键', label: '瞄准' },
  { action: 'fire', key: '鼠标左键', label: '射击 / 攻击' },
  { action: 'melee', key: 'V', label: '近战' },
  { action: 'throw', key: 'Q', label: '投掷石块 / 手榴弹' },
  { action: 'reload', key: 'R', label: '拉栓 / 装填' },
  { action: 'command', key: 'E', label: '指令冯小满' },
  { action: 'flashlight', key: 'L', label: '火柴 / 提灯' },
  { action: 'peekLeft', key: 'Q（贴墙时）', label: '左探身' },
  { action: 'peekRight', key: 'E（贴墙时）', label: '右探身' },
  { action: 'menu', key: 'Tab', label: '背包' },
  { action: 'pause', key: 'Esc', label: '暂停菜单' },
];

const DefaultSettings = {
  fontScale: 1,
  subtitlesOn: true,
  soundCaptionsOn: true,
  directionArrows: true,
  cameraShake: true,
  flashEffects: true,
  highContrast: false,
  sensitivity: 1,
  invertY: false,
  holdToAim: true,
  masterVolume: 0.8,
  musicVolume: 0.55,
  sfxVolume: 0.9,
};

function Clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function Clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function Tune(path, fallback) {
  try {
    if (typeof ConfigModule.GetTuning === 'function') {
      const found = ConfigModule.GetTuning(path, fallback);
      if (found !== undefined && found !== null) return found;
    }
    const tree = ConfigModule.Config;
    if (!tree) return fallback;
    let node = tree;
    for (const part of String(path).split('.')) {
      if (node === null || node === undefined) return fallback;
      node = node[part];
    }
    return node === undefined || node === null ? fallback : node;
  } catch (error) {
    return fallback;
  }
}

function EventName(key) {
  const table = EventModule.EventNames;
  return (table && table[key]) || key;
}

function StoryText(key, fallback) {
  try {
    if (typeof StoryData.GetText === 'function') {
      const found = StoryData.GetText(key, fallback);
      if (typeof found === 'string' && found.length > 0) return found;
    }
    const strings = StoryData.UiStrings;
    if (strings && typeof strings[key] === 'string') return strings[key];
  } catch (error) { /* 数据缺失时退回默认文案 */ }
  return fallback;
}

function LedgerLabel(key) {
  try {
    const table = StoryData.CostLedgerLabels;
    if (table && typeof table[key] === 'string') return table[key];
  } catch (error) { /* 忽略 */ }
  return key;
}

function SpeakerLabel(speaker) {
  if (!speaker) return '';
  if (Object.prototype.hasOwnProperty.call(SpeakerLabels, speaker)) return SpeakerLabels[speaker];
  return String(speaker);
}

function EstimateDuration(text) {
  const minimum = Number(Tune('Hud.subtitleMinSeconds', 1.6)) || 1.6;
  const base = Number(Tune('Hud.subtitleSeconds', 3.2)) || 3.2;
  const length = text ? String(text).length : 0;
  return Math.max(minimum, Math.min(9, base * 0.45 + length * 0.135));
}

// —— DOM 写入包装：全部带脏检查，值不变就一个字节也不写 ——

function SetText(element, value) {
  if (!element) return false;
  const text = value === null || value === undefined ? '' : String(value);
  if (element.__hudText === text) return false;
  element.__hudText = text;
  element.textContent = text;
  return true;
}

function SetAttr(element, name, value) {
  if (!element) return false;
  const key = '__hudAttr_' + name;
  const text = value === null || value === undefined ? '' : String(value);
  if (element[key] === text) return false;
  element[key] = text;
  if (text === '') element.removeAttribute(name);
  else element.setAttribute(name, text);
  return true;
}

function SetVar(element, name, value) {
  if (!element) return false;
  const key = '__hudVar_' + name;
  const text = String(value);
  if (element[key] === text) return false;
  element[key] = text;
  element.style.setProperty(name, text);
  return true;
}

function SetHidden(element, hidden) {
  if (!element) return false;
  const next = hidden === true;
  if (element.hidden === next) return false;
  element.hidden = next;
  return true;
}

function SetClass(element, name, on) {
  if (!element) return false;
  const has = element.classList.contains(name);
  if (has === (on === true)) return false;
  element.classList.toggle(name, on === true);
  return true;
}

function ReadStore(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function WriteStore(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    return false;
  }
}

function MakeDeferred() {
  const box = { promise: null, resolve: null };
  box.promise = new Promise((resolve) => { box.resolve = resolve; });
  return box;
}

/* ============================ 主体 ============================ */

/**
 * @param {object} ctx 共享上下文
 * @param {{ root?: HTMLElement }} [options]
 */
export function CreateHud(ctx, options) {
  const opts = options || {};

  if (typeof document === 'undefined') return CreateHeadlessHud();

  const doc = document;
  const gameRoot = doc.getElementById('GameRoot') || doc.body;
  const root = opts.root || doc.getElementById('HudRoot');
  if (!root) return CreateHeadlessHud();

  const el = {};
  function El(id) {
    if (!(id in el)) el[id] = doc.getElementById(id);
    return el[id];
  }

  const bus = ctx && ctx.bus ? ctx.bus : null;
  const unsubscribers = [];
  const domBindings = [];
  const settingsKey = String(Tune('Save.settingsKey', 'blackstone1943_settings_v1'));

  function On(eventKey, handler) {
    if (!bus || typeof bus.On !== 'function') return;
    try {
      const off = bus.On(EventName(eventKey), handler);
      if (typeof off === 'function') unsubscribers.push(off);
    } catch (error) { /* 总线不可用时静默降级 */ }
  }

  function Emit(eventKey, payload) {
    if (!bus || typeof bus.Emit !== 'function') return;
    try { bus.Emit(EventName(eventKey), payload || {}); } catch (error) { /* 忽略 */ }
  }

  function Bind(element, type, handler, listenOptions) {
    if (!element) return;
    element.addEventListener(type, handler, listenOptions);
    domBindings.push([element, type, handler, listenOptions]);
  }

  /* ---------------------------- 内部状态 ---------------------------- */

  const settings = Object.assign({}, DefaultSettings, ReadStore(settingsKey) || {});

  const vitals = {
    health: 100, maxHealth: 100,
    stamina: 100, maxStamina: 100,
    warmth: 100, maxWarmth: 100,
    bleeding: false,
  };

  const ammo = { weapon: 'None', label: '', loaded: 0, reserve: 0, chambered: false };

  const stealth = { level: 0, concealed: false, noiseRadius: 0, threatDirection: null, alert: 0 };

  const objectives = [];
  let objectiveChapterText = '';
  let chapterIndexText = '';
  let chapterSpanHold = 3.6;

  const subtitleQueue = [];
  let subtitleCurrent = null;
  let subtitleTimer = 0;

  const soundCaptions = [];
  let soundCaptionTimer = 0;
  let lastCaptionStamp = 0;

  const toasts = [];

  let promptVisible = false;
  let progressTimer = 0;
  let progressSpan = 0;
  let progressAuto = false;

  let chapterDeferred = null;
  let chapterTimer = 0;
  let chapterPhase = 'Idle';

  let choiceDeferred = null;
  let choiceTimer = 0;
  let choiceSpan = 0;

  let endingDeferred = null;
  let gameOverDeferred = null;

  let fadeDeferred = null;
  let fadeTimer = 0;

  let menuOpen = false;
  let menuId = 'Pause';
  let inventoryOpen = false;

  let touchBound = false;
  let touchVisible = false;
  const touchButtonState = {};
  const lookDelta = { x: 0, y: 0 };
  let stickPointerId = null;
  let lookPointerId = null;
  const stickOrigin = { x: 0, y: 0 };
  let stickRadius = 54;

  let calmSeconds = 0;
  let pollTimer = 0;
  let usesInputPause = false;
  let disposed = false;

  /* ---------------------------- 设置 ---------------------------- */

  function ApplySettings(next) {
    if (next && typeof next === 'object') {
      for (const key of Object.keys(DefaultSettings)) {
        if (next[key] !== undefined) settings[key] = next[key];
      }
    }
    settings.fontScale = Clamp(Number(settings.fontScale) || 1, 0.85, 1.6);
    settings.sensitivity = Clamp(Number(settings.sensitivity) || 1, 0.2, 3);
    settings.masterVolume = Clamp01(Number(settings.masterVolume));
    settings.musicVolume = Clamp01(Number(settings.musicVolume));
    settings.sfxVolume = Clamp01(Number(settings.sfxVolume));

    SetVar(gameRoot, '--HudFontScale', String(settings.fontScale));
    SetClass(gameRoot, 'Style_HighContrast', settings.highContrast === true);
    SetClass(gameRoot, 'Style_NoFlash', settings.flashEffects === false);
    SetClass(gameRoot, 'Style_NoSubtitles', settings.subtitlesOn === false);
    SetClass(gameRoot, 'Style_NoSoundCaption', settings.soundCaptionsOn === false);

    SyncSettingControls();
    WriteStore(settingsKey, settings);

    const input = ctx && ctx.input;
    if (input) {
      if (typeof input.SetSensitivity === 'function') input.SetSensitivity(settings.sensitivity);
      if (typeof input.SetInvertY === 'function') input.SetInvertY(settings.invertY === true);
    }
    const player = ctx && ctx.player;
    if (player && typeof player.SetCameraShakeEnabled === 'function') {
      player.SetCameraShakeEnabled(settings.cameraShake !== false);
    }
    const audio = ctx && ctx.audio;
    if (audio) {
      if (typeof audio.SetMasterVolume === 'function') audio.SetMasterVolume(settings.masterVolume);
      if (typeof audio.SetBusVolume === 'function') {
        audio.SetBusVolume('music', settings.musicVolume);
        audio.SetBusVolume('sfx', settings.sfxVolume);
      }
    }

    Emit('SettingsChanged', { settings: Object.assign({}, settings), changed: Object.keys(settings) });
  }

  function SyncSettingControls() {
    const menu = El('HudMenu');
    if (!menu) return;
    const controls = menu.querySelectorAll('[dataSetting]');
    for (let i = 0; i < controls.length; i += 1) {
      const control = controls[i];
      const key = control.getAttribute('dataSetting');
      if (!key || !(key in settings)) continue;
      if (control.type === 'checkbox') {
        const wanted = settings[key] === true;
        if (control.checked !== wanted) control.checked = wanted;
      } else if (control.type === 'range') {
        const wanted = String(Math.round(Number(settings[key]) * 100));
        if (control.value !== wanted) control.value = wanted;
      }
    }
  }

  function OnSettingInput(event) {
    const control = event.target;
    if (!control || typeof control.getAttribute !== 'function') return;
    const key = control.getAttribute('dataSetting');
    if (!key || !(key in DefaultSettings)) return;
    let value;
    if (control.type === 'checkbox') value = control.checked === true;
    else value = Number(control.value) / 100;
    if (typeof value === 'number' && !Number.isFinite(value)) return;
    ApplySettings({ [key]: value });
  }

  /* ---------------------------- 生存状态 ---------------------------- */

  function SetVitals(next) {
    if (next && typeof next === 'object') Object.assign(vitals, next);
    const rows = El('HudVitals');
    if (!rows) return;
    const health = Clamp01(vitals.health / Math.max(1, vitals.maxHealth));
    const stamina = Clamp01(vitals.stamina / Math.max(1, vitals.maxStamina));
    const warmth = Clamp01(vitals.warmth / Math.max(1, vitals.maxWarmth));

    let changed = false;
    changed = SetVar(El('HudVitalsHealthFill'), '--Fill', health.toFixed(3)) || changed;
    changed = SetVar(El('HudVitalsStaminaFill'), '--Fill', stamina.toFixed(3)) || changed;
    changed = SetVar(El('HudVitalsWarmthFill'), '--Fill', warmth.toFixed(3)) || changed;

    const rowList = rows.querySelectorAll('.Style_VitalRow');
    const levels = { Health: health, Stamina: stamina, Warmth: warmth };
    for (let i = 0; i < rowList.length; i += 1) {
      const row = rowList[i];
      const kind = row.getAttribute('dataVital');
      const level = levels[kind];
      if (level === undefined) continue;
      changed = SetAttr(row, 'dataLow', level < 0.32 ? '1' : '') || changed;
    }
    changed = SetHidden(El('HudVitalsBleed'), vitals.bleeding !== true) || changed;
    changed = SetHidden(El('HudVitalsCold'), warmth > 0.3) || changed;
    if (changed) MarkActivity();
  }

  /* ---------------------------- 弹药 ---------------------------- */

  function SetAmmo(next) {
    if (next && typeof next === 'object') Object.assign(ammo, next);
    const panel = El('HudAmmo');
    if (!panel) return;
    const hasWeapon = ammo.weapon && ammo.weapon !== 'None';
    SetHidden(panel, !hasWeapon);
    if (!hasWeapon) return;

    SetText(El('HudAmmoLabel'), ammo.label || ammo.weapon);
    const loaded = Math.max(0, Math.floor(ammo.loaded || 0));
    const reserve = Math.max(0, Math.floor(ammo.reserve || 0));
    const budget = Number(Tune('Combat.AmmoBudget.total', 12)) || 12;
    const total = Math.min(budget, Math.max(1, loaded + reserve));

    const pips = El('HudAmmoPips');
    if (pips) {
      if (pips.__hudPipCount !== total) {
        pips.__hudPipCount = total;
        pips.textContent = '';
        for (let i = 0; i < total; i += 1) {
          const pip = doc.createElement('i');
          pip.className = 'Style_AmmoPip';
          pips.appendChild(pip);
        }
      }
      const children = pips.children;
      for (let i = 0; i < children.length; i += 1) {
        SetAttr(children[i], 'dataLoaded', i < loaded ? '1' : '');
        SetAttr(children[i], 'dataReserve', i >= loaded && i < loaded + reserve ? '1' : '');
      }
    }
    SetText(El('HudAmmoCount'), loaded + ' / ' + reserve);
    SetHidden(El('HudAmmoChamber'), ammo.chambered !== false);
    MarkActivity();
  }

  /* ---------------------------- 潜行状态 ---------------------------- */

  function SetStealthState(next) {
    if (next && typeof next === 'object') Object.assign(stealth, next);
    const panel = El('HudAlert');
    if (!panel) return;
    const level = Clamp(Math.round(stealth.level || 0), 0, 2);
    SetAttr(panel, 'dataLevel', String(level));
    SetAttr(panel, 'dataConcealed', stealth.concealed ? '1' : '');
    const fill = stealth.alert !== undefined && stealth.alert !== null
      ? Clamp01(Number(stealth.alert))
      : level / 2;
    SetVar(panel, '--AlertFill', fill.toFixed(3));
    SetVar(panel, '--NoiseScale', Clamp01((stealth.noiseRadius || 0) / 45).toFixed(3));

    const labels = ['隐蔽', '被怀疑', '暴露'];
    SetText(El('HudAlertLabel'), StoryText('HudAlertLevel' + level, labels[level]));

    const threat = El('HudAlertThreat');
    if (threat) {
      const direction = stealth.threatDirection;
      if (direction === null || direction === undefined || !Number.isFinite(direction)) {
        SetHidden(threat, true);
      } else {
        SetHidden(threat, false);
        SetVar(threat, '--ThreatAngle', (RelativeAngleDegrees(direction)).toFixed(1) + 'deg');
      }
    }
    if (level > 0) MarkActivity();
  }

  function ViewYaw() {
    const player = ctx && ctx.player;
    if (player && Number.isFinite(player.yaw)) return player.yaw;
    const camera = ctx && ctx.camera;
    if (camera && camera.rotation && Number.isFinite(camera.rotation.y)) return camera.rotation.y;
    return 0;
  }

  function RelativeAngleDegrees(worldRadians) {
    let delta = worldRadians - ViewYaw();
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    return delta * (180 / Math.PI);
  }

  /* ---------------------------- 伴随状态 ---------------------------- */

  function SetCompanionState(state) {
    const panel = El('HudCompanion');
    if (!panel) return;
    if (!state) { SetHidden(panel, true); return; }
    SetHidden(panel, false);
    const mode = String(state.mode || 'Follow');
    SetAttr(panel, 'dataMode', mode);
    SetText(El('HudCompanionName'), StoryText('CompanionName', '冯小满'));
    const label = state.hidden ? '藏起来了' : (CompanionModeLabels[mode] || mode);
    SetText(El('HudCompanionMode'), label);
    const distance = Number(state.distance);
    SetText(El('HudCompanionDistance'), Number.isFinite(distance) ? Math.round(distance) + ' 米' : '');
    const scare = El('HudCompanionScare');
    const scared = Clamp01(Number(state.scared) || 0);
    SetHidden(scare, scared < 0.15);
    SetVar(scare, '--ScareLevel', scared.toFixed(2));
    MarkActivity();
  }

  /* ---------------------------- 目标 ---------------------------- */

  function SetObjectiveList(list) {
    objectives.length = 0;
    if (Array.isArray(list)) {
      for (const item of list) {
        if (!item || !item.id) continue;
        objectives.push({
          id: String(item.id),
          text: String(item.text || ''),
          done: item.done === true,
          failed: item.failed === true,
          optional: item.optional === true,
        });
      }
    }
    RenderObjectives();
  }

  function RenderObjectives() {
    const list = El('HudObjectiveList');
    if (!list) return;
    const signature = objectives.map((o) => o.id + ':' + o.text + ':' + (o.failed ? 'F' : o.done ? 'D' : 'A')).join('|');
    if (list.__hudSignature === signature) return;
    list.__hudSignature = signature;
    list.textContent = '';
    let activeMarked = false;
    for (const objective of objectives) {
      const node = doc.createElement('li');
      node.textContent = objective.text;
      let state = 'Pending';
      if (objective.failed) state = 'Failed';
      else if (objective.done) state = 'Done';
      else if (!activeMarked) { state = 'Active'; activeMarked = true; }
      node.setAttribute('dataState', state);
      if (objective.optional) node.setAttribute('dataOptional', '1');
      list.appendChild(node);
    }
    const panel = El('HudObjective');
    if (panel) {
      panel.classList.remove('Style_ObjectiveFlash');
      void panel.offsetWidth;
      panel.classList.add('Style_ObjectiveFlash');
    }
    MarkActivity();
  }

  function ShowObjective(text, kind) {
    const state = kind || 'New';
    const stateLabels = { New: '新目标', Update: '目标更新', Done: '已完成', Failed: '失败' };
    SetText(El('HudObjectiveState'), stateLabels[state] || '');
    if (state === 'Done' || state === 'Failed') {
      const found = objectives.find((o) => o.text === text);
      if (found) { found.done = state === 'Done'; found.failed = state === 'Failed'; }
      RenderObjectives();
    } else if (text) {
      const existing = objectives.find((o) => o.text === text);
      if (!existing) objectives.push({ id: 'Objective' + objectives.length, text: String(text), done: false, failed: false, optional: false });
      RenderObjectives();
    }
    ShowToast(text, state === 'Failed' ? 'Warning' : 'Info');
  }

  /* ---------------------------- 字幕 ---------------------------- */

  function ShowSubtitle(speaker, text, durationSeconds) {
    if (!text) return;
    if (settings.subtitlesOn === false) return;
    const duration = Number(durationSeconds) > 0 ? Number(durationSeconds) : EstimateDuration(text);
    subtitleQueue.push({ speaker: speaker || '', text: String(text), duration, emotion: '' });
    if (!subtitleCurrent) AdvanceSubtitle();
  }

  function AdvanceSubtitle() {
    const panel = El('HudSubtitle');
    subtitleCurrent = subtitleQueue.shift() || null;
    if (!subtitleCurrent) {
      SetHidden(panel, true);
      subtitleTimer = 0;
      return;
    }
    subtitleTimer = subtitleCurrent.duration;
    SetHidden(panel, false);
    SetAttr(panel, 'dataSpeaker', subtitleCurrent.speaker || '');
    SetAttr(panel, 'dataEmotion', subtitleCurrent.emotion || '');
    const label = SpeakerLabel(subtitleCurrent.speaker);
    const speakerNode = El('HudSubtitleSpeaker');
    SetText(speakerNode, label);
    SetHidden(speakerNode, label.length === 0);
    SetText(El('HudSubtitleText'), subtitleCurrent.text);
    UpdateSubtitleDirection();
    MarkActivity();
  }

  function UpdateSubtitleDirection() {
    const arrow = El('HudSubtitleDirection');
    if (!arrow) return;
    if (!subtitleCurrent || settings.directionArrows === false) { SetHidden(arrow, true); return; }
    const speaker = subtitleCurrent.speaker;
    const companion = ctx && ctx.companion;
    const player = ctx && ctx.player;
    if ((speaker !== 'Xiaoman' && speaker !== 'FengXiaoman' && speaker !== 'Companion') ||
        !companion || !companion.position || !player || !player.position) {
      SetHidden(arrow, true);
      return;
    }
    const dx = companion.position.x - player.position.x;
    const dz = companion.position.z - player.position.z;
    if (Math.abs(dx) + Math.abs(dz) < 2.2) { SetHidden(arrow, true); return; }
    SetHidden(arrow, false);
    SetVar(arrow, '--SubtitleAngle', RelativeAngleDegrees(Math.atan2(dx, dz)).toFixed(1) + 'deg');
  }

  function ClearSubtitle() {
    subtitleQueue.length = 0;
    subtitleCurrent = null;
    subtitleTimer = 0;
    SetHidden(El('HudSubtitle'), true);
  }

  /* ---------------------------- 声音方向字幕 ---------------------------- */

  function ShowSoundCaption(text, directionRadians, distance) {
    if (!text || settings.soundCaptionsOn === false) return;
    soundCaptions.push({
      text: String(text),
      direction: Number.isFinite(directionRadians) ? directionRadians : 0,
      distance: Number(distance) || 0,
    });
    if (soundCaptions.length > 3) soundCaptions.shift();
    if (soundCaptionTimer <= 0) AdvanceSoundCaption();
  }

  function AdvanceSoundCaption() {
    const panel = El('HudSoundCaption');
    const item = soundCaptions.shift();
    if (!item) {
      SetHidden(panel, true);
      soundCaptionTimer = 0;
      return;
    }
    soundCaptionTimer = 2.1;
    SetHidden(panel, false);
    SetText(El('HudSoundCaptionText'), item.text);
    const degrees = RelativeAngleDegrees(item.direction);
    SetVar(El('HudSoundCaptionArrow'), '--CaptionAngle', degrees.toFixed(1) + 'deg');
    const compass = CompassWord(degrees);
    const meta = item.distance > 0 ? compass + ' · 约 ' + Math.round(item.distance) + ' 米' : compass;
    SetText(El('HudSoundCaptionMeta'), meta);
    MarkActivity();
  }

  function CompassWord(degrees) {
    let value = degrees % 360;
    if (value > 180) value -= 360;
    if (value < -180) value += 360;
    const abs = Math.abs(value);
    if (abs <= 25) return '正前方';
    if (abs >= 155) return '身后';
    if (abs <= 70) return value > 0 ? '右前方' : '左前方';
    if (abs <= 110) return value > 0 ? '右侧' : '左侧';
    return value > 0 ? '右后方' : '左后方';
  }

  /* ---------------------------- 交互提示与进度 ---------------------------- */

  function ShowPrompt(text, keyLabel, kind) {
    const panel = El('HudPrompt');
    if (!panel || !text) return;
    promptVisible = true;
    SetHidden(panel, false);
    SetAttr(panel, 'dataKind', kind || 'Interact');
    SetText(El('HudPromptKey'), keyLabel || 'F');
    SetText(El('HudPromptText'), text);
    MarkActivity();
  }

  function HidePrompt() {
    if (!promptVisible) return;
    promptVisible = false;
    SetHidden(El('HudPrompt'), true);
  }

  function ShowInteractProgress(progress01, label) {
    const panel = El('HudProgress');
    if (!panel) return;
    SetHidden(panel, false);
    const value = Clamp01(Number(progress01) || 0);
    SetVar(panel, '--ProgressFill', value.toFixed(3));
    SetAttr(panel, 'aria-valuenow', String(Math.round(value * 100)));
    if (label) SetText(El('HudProgressLabel'), label);
  }

  function HideInteractProgress() {
    progressAuto = false;
    progressTimer = 0;
    progressSpan = 0;
    SetHidden(El('HudProgress'), true);
  }

  /* ---------------------------- 浮条 ---------------------------- */

  function ShowToast(text, kind, durationSeconds) {
    const holder = El('HudToast');
    if (!holder || !text) return;
    const node = doc.createElement('div');
    node.className = 'Style_ToastItem';
    node.setAttribute('dataKind', kind || 'Info');
    node.textContent = String(text);
    holder.appendChild(node);
    toasts.push({
      node,
      remaining: Number(durationSeconds) > 0 ? Number(durationSeconds) : Number(Tune('Hud.toastSeconds', 2.4)) || 2.4,
      order: ToastKindOrder[kind] || 0,
    });
    while (toasts.length > 4) {
      const dropped = toasts.shift();
      if (dropped && dropped.node && dropped.node.parentNode) dropped.node.parentNode.removeChild(dropped.node);
    }
    MarkActivity();
  }

  /* ---------------------------- 准星与投掷弧 ---------------------------- */

  function SetCrosshair(mode, spread) {
    const panel = El('HudCrosshair');
    if (!panel) return;
    SetAttr(panel, 'dataMode', mode || 'Hidden');
    const pixels = Clamp(4 + (Number(spread) || 0) * 620, 3, 40);
    SetVar(panel, '--Spread', pixels.toFixed(1) + 'px');
  }

  function SetThrowArc(points) {
    const svg = El('HudThrowArc');
    const line = El('HudThrowArcLine');
    const mark = El('HudThrowArcMark');
    if (!svg || !line) return;
    if (!points || !points.length) {
      SetHidden(svg, true);
      return;
    }
    const width = Math.max(1, window.innerWidth || 1);
    const height = Math.max(1, window.innerHeight || 1);
    let text = '';
    let lastX = -10;
    let lastY = -10;
    for (const point of points) {
      if (!point) continue;
      let x = Number(point.x);
      let y = Number(point.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (Math.abs(x) > 1.5 || Math.abs(y) > 1.5) { x /= width; y /= height; }
      lastX = x * 100;
      lastY = y * 100;
      text += (text ? ' ' : '') + lastX.toFixed(2) + ',' + lastY.toFixed(2);
    }
    if (!text) { SetHidden(svg, true); return; }
    SetHidden(svg, false);
    if (line.__hudPoints !== text) {
      line.__hudPoints = text;
      line.setAttribute('points', text);
    }
    if (mark) {
      SetAttr(mark, 'cx', lastX.toFixed(2));
      SetAttr(mark, 'cy', lastY.toFixed(2));
    }
  }

  /* ---------------------------- 章节卡 ---------------------------- */

  function ShowChapterTitle(title, subtitle, durationSeconds) {
    const panel = El('HudChapterTitle');
    if (!panel) return Promise.resolve();
    if (chapterDeferred) chapterDeferred.resolve();
    chapterDeferred = MakeDeferred();
    SetText(El('HudChapterIndex'), chapterIndexText);
    SetHidden(El('HudChapterIndex'), chapterIndexText.length === 0);
    SetText(El('HudChapterName'), title || '');
    SetText(El('HudChapterSubtitle'), subtitle || '');
    SetHidden(panel, false);
    chapterPhase = 'In';
    chapterTimer = 0.05;
    chapterSpanHold = Number(durationSeconds) > 0 ? Number(durationSeconds) : 3.6;
    return chapterDeferred.promise;
  }

  function StepChapterCard(step) {
    if (chapterPhase === 'Idle') return;
    const panel = El('HudChapterTitle');
    chapterTimer -= step;
    if (chapterTimer > 0) return;
    if (chapterPhase === 'In') {
      SetClass(panel, 'Style_CardVisible', true);
      chapterPhase = 'Hold';
      chapterTimer = chapterSpanHold;
    } else if (chapterPhase === 'Hold') {
      SetClass(panel, 'Style_CardVisible', false);
      chapterPhase = 'Out';
      chapterTimer = 0.75;
    } else {
      SetHidden(panel, true);
      chapterPhase = 'Idle';
      if (chapterDeferred) { chapterDeferred.resolve(); chapterDeferred = null; }
    }
  }

  /* ---------------------------- 菜单 ---------------------------- */

  function OpenMenu(id) {
    const menu = El('HudMenu');
    if (!menu) return;
    menuId = id || 'Pause';
    menuOpen = true;
    SetHidden(menu, false);
    SetAttr(menu, 'dataPanel', menuId);
    const panels = menu.querySelectorAll('.Style_MenuPanel');
    for (let i = 0; i < panels.length; i += 1) {
      SetHidden(panels[i], panels[i].getAttribute('dataMenu') !== menuId);
    }
    const tabs = menu.querySelectorAll('.Style_MenuTab');
    for (let i = 0; i < tabs.length; i += 1) {
      SetClass(tabs[i], 'Style_TabActive', tabs[i].getAttribute('dataMenu') === menuId);
    }
    if (menuId === 'Controls') RenderControls();
    if (menuId === 'Ledger') RenderLedger();
    const chapter = ctx && ctx.rules && typeof ctx.rules.GetChapterId === 'function' ? ctx.rules.GetChapterId() : '';
    SetText(El('HudMenuChapterLine'), objectiveChapterText || chapter || '黑石峪');
    SyncSettingControls();
    if (ctx && ctx.input && typeof ctx.input.SetEnabled === 'function') ctx.input.SetEnabled(false, 'Menu');
    if (ctx && ctx.input && typeof ctx.input.ExitPointerLock === 'function') ctx.input.ExitPointerLock();
    Emit('RequestPause', { paused: true, reason: 'Menu' });
  }

  function CloseMenu() {
    if (!menuOpen) return;
    menuOpen = false;
    SetHidden(El('HudMenu'), true);
    if (ctx && ctx.input && typeof ctx.input.SetEnabled === 'function') ctx.input.SetEnabled(true, 'Menu');
    Emit('RequestPause', { paused: false, reason: 'Menu' });
  }

  function RenderControls() {
    const holder = El('HudControlsList');
    if (!holder) return;
    let bindings = FallbackBindings;
    const input = ctx && ctx.input;
    if (input && typeof input.GetBindingsText === 'function') {
      try {
        const provided = input.GetBindingsText();
        if (Array.isArray(provided) && provided.length) bindings = provided;
      } catch (error) { /* 用兜底键位表 */ }
    }
    const signature = bindings.map((b) => b.action + b.key).join('|');
    if (holder.__hudSignature === signature) return;
    holder.__hudSignature = signature;
    holder.textContent = '';
    for (const binding of bindings) {
      const row = doc.createElement('div');
      row.className = 'Style_ControlRow';
      const label = doc.createElement('span');
      label.textContent = binding.label || binding.action;
      const key = doc.createElement('kbd');
      key.textContent = binding.key || '—';
      row.appendChild(label);
      row.appendChild(key);
      holder.appendChild(row);
    }
  }

  function RenderLedger() {
    const holder = El('HudLedgerList');
    if (!holder) return;
    let entries = [];
    const rules = ctx && ctx.rules;
    if (rules && typeof rules.GetLedger === 'function') {
      try { entries = rules.GetLedger() || []; } catch (error) { entries = []; }
    }
    RenderLedgerInto(holder, entries);
  }

  function RenderLedgerInto(holder, entries) {
    if (!holder) return;
    const signature = entries.map((e) => e.key + ':' + (e.note || '')).join('|');
    if (holder.__hudSignature === signature) return;
    holder.__hudSignature = signature;
    holder.textContent = '';
    if (!entries.length) {
      const empty = doc.createElement('li');
      empty.className = 'Style_LedgerEmpty';
      empty.textContent = '还没有需要记下的事。';
      holder.appendChild(empty);
      return;
    }
    for (const entry of entries) {
      const node = doc.createElement('li');
      node.textContent = LedgerLabel(entry.key);
      if (entry.note) {
        const note = doc.createElement('small');
        note.textContent = entry.note;
        node.appendChild(note);
      }
      holder.appendChild(node);
    }
  }

  /* ---------------------------- 背包 ---------------------------- */

  function OpenInventory() {
    const panel = El('HudInventory');
    if (!panel) return;
    inventoryOpen = true;
    SetHidden(panel, false);
    RenderInventory();
    if (ctx && ctx.input && typeof ctx.input.SetEnabled === 'function') ctx.input.SetEnabled(false, 'Inventory');
    Emit('RequestPause', { paused: true, reason: 'Inventory' });
  }

  function CloseInventory() {
    if (!inventoryOpen) return;
    inventoryOpen = false;
    SetHidden(El('HudInventory'), true);
    if (ctx && ctx.input && typeof ctx.input.SetEnabled === 'function') ctx.input.SetEnabled(true, 'Inventory');
    Emit('RequestPause', { paused: false, reason: 'Inventory' });
  }

  function RenderInventory() {
    const list = El('HudInventoryList');
    const survival = ctx && ctx.survival;
    let items = [];
    if (survival && typeof survival.ListInventory === 'function') {
      try { items = survival.ListInventory() || []; } catch (error) { items = []; }
    }
    if (list) {
      const signature = items.map((i) => i.id + 'x' + i.count).join('|');
      if (list.__hudSignature !== signature) {
        list.__hudSignature = signature;
        list.textContent = '';
        if (!items.length) {
          const empty = doc.createElement('li');
          empty.className = 'Style_InventoryEmpty';
          empty.textContent = '身上什么也没有。';
          list.appendChild(empty);
        }
        for (const item of items) {
          const node = doc.createElement('li');
          const copy = doc.createElement('div');
          const name = doc.createElement('b');
          /* Survival 只保证给出 id；名字与描述以 Data_Story.ItemCatalog 为准，玩家不该看见英文 id。 */
          name.textContent = item.name && item.name !== item.id ? item.name : ItemName(item.id);
          const description = doc.createElement('small');
          description.textContent = item.description || ItemDescription(item.id);
          copy.appendChild(name);
          copy.appendChild(description);
          const count = doc.createElement('em');
          count.textContent = '×' + item.count;
          node.appendChild(copy);
          node.appendChild(count);
          list.appendChild(node);
        }
      }
    }
    if (survival && typeof survival.GetCapacity === 'function') {
      try {
        const capacity = survival.GetCapacity();
        SetText(El('HudInventoryCapacity'), capacity.used + ' / ' + capacity.max);
      } catch (error) { /* 忽略 */ }
    }
    RenderRecipes();
  }

  function RenderRecipes() {
    const holder = El('HudInventoryRecipes');
    const survival = ctx && ctx.survival;
    if (!holder || !survival || typeof survival.GetRecipes !== 'function') return;
    let recipes = [];
    try { recipes = survival.GetRecipes() || []; } catch (error) { recipes = []; }
    const states = recipes.map((recipe) => {
      let ok = false;
      if (typeof survival.CanCraft === 'function') {
        try { ok = survival.CanCraft(recipe.id).ok === true; } catch (error) { ok = false; }
      }
      return { recipe, ok };
    });
    const signature = states.map((s) => s.recipe.id + (s.ok ? '1' : '0')).join('|');
    if (holder.__hudSignature === signature) return;
    holder.__hudSignature = signature;
    holder.textContent = '';
    for (const state of states) {
      const item = doc.createElement('li');
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'Style_RecipeButton';
      button.disabled = !state.ok;
      const name = doc.createElement('span');
      name.textContent = state.recipe.name || state.recipe.id;
      const detail = doc.createElement('small');
      detail.textContent = (state.recipe.inputs || []).map((i) => ItemName(i.id) + '×' + i.count).join(' + ');
      button.appendChild(name);
      button.appendChild(detail);
      button.addEventListener('click', () => {
        if (typeof survival.Craft === 'function') {
          try { survival.Craft(state.recipe.id); } catch (error) { /* 忽略 */ }
        }
        RenderInventory();
      });
      item.appendChild(button);
      holder.appendChild(item);
    }
  }

  /* ---------------------------- 抉择 ---------------------------- */

  function ShowChoice(prompt, choiceOptions, seconds) {
    const panel = El('HudChoice');
    const holder = El('HudChoiceOptions');
    if (!panel || !holder || !Array.isArray(choiceOptions) || !choiceOptions.length) {
      return Promise.resolve('');
    }
    if (choiceDeferred) choiceDeferred.resolve('');
    choiceDeferred = MakeDeferred();
    SetText(El('HudChoicePrompt'), prompt || '');
    holder.textContent = '';
    for (const option of choiceOptions) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'Style_ChoiceOption';
      const title = doc.createElement('b');
      title.textContent = option.text || option.id;
      button.appendChild(title);
      if (option.detail) {
        const detail = doc.createElement('small');
        detail.textContent = option.detail;
        button.appendChild(detail);
      }
      button.addEventListener('click', () => ResolveChoice(option.id));
      holder.appendChild(button);
    }
    SetHidden(panel, false);
    choiceSpan = Number(seconds) > 0 ? Number(seconds) : 0;
    choiceTimer = choiceSpan;
    const timer = El('HudChoiceTimer');
    SetHidden(timer, choiceSpan <= 0);
    if (ctx && ctx.input && typeof ctx.input.SetEnabled === 'function') ctx.input.SetEnabled(false, 'Choice');
    const first = holder.querySelector('button');
    if (first) first.focus({ preventScroll: true });
    return choiceDeferred.promise;
  }

  function ResolveChoice(optionId) {
    if (!choiceDeferred) return;
    SetHidden(El('HudChoice'), true);
    if (ctx && ctx.input && typeof ctx.input.SetEnabled === 'function') ctx.input.SetEnabled(true, 'Choice');
    const deferred = choiceDeferred;
    choiceDeferred = null;
    choiceTimer = 0;
    choiceSpan = 0;
    deferred.resolve(optionId || '');
  }

  /* ---------------------------- 结局与失败 ---------------------------- */

  function ShowEnding(result) {
    const panel = El('HudEnding');
    if (!panel) return Promise.resolve();
    if (endingDeferred) endingDeferred.resolve();
    endingDeferred = MakeDeferred();
    const data = result || {};
    SetText(El('HudEndingTitle'), data.title || '');
    const lines = El('HudEndingLines');
    if (lines) {
      lines.textContent = '';
      for (const line of (data.lines || [])) {
        const node = doc.createElement('p');
        node.textContent = typeof line === 'string' ? line : (line && line.text) || '';
        lines.appendChild(node);
      }
    }
    RenderLedgerInto(El('HudEndingLedger'), Array.isArray(data.ledger) ? data.ledger : []);
    const stats = El('HudEndingStats');
    if (stats) {
      stats.textContent = '';
      const source = data.stats || {};
      for (const key of Object.keys(StatLabels)) {
        if (source[key] === undefined) continue;
        const cell = doc.createElement('div');
        cell.className = 'Style_EndingStat';
        const value = doc.createElement('b');
        value.textContent = key === 'playSeconds'
          ? Math.round(Number(source[key]) / 60) + ' 分钟'
          : String(source[key]);
        const label = doc.createElement('small');
        label.textContent = StatLabels[key];
        cell.appendChild(value);
        cell.appendChild(label);
        stats.appendChild(cell);
      }
    }
    SetHidden(panel, false);
    SetVisible(false);
    if (ctx && ctx.input && typeof ctx.input.SetEnabled === 'function') ctx.input.SetEnabled(false, 'Ending');
    return endingDeferred.promise;
  }

  function ShowGameOver(reason) {
    const panel = El('HudGameOver');
    if (!panel) return Promise.resolve('Menu');
    if (gameOverDeferred) gameOverDeferred.resolve('Menu');
    gameOverDeferred = MakeDeferred();
    const reasons = {
      Shot: '一颗子弹。就这么简单。',
      Melee: '近身缠斗，你没能站住。',
      Bleed: '血一直没止住。',
      Cold: '风雪把最后一点体温带走了。',
      Explosion: '爆炸掀翻了你。',
      CompanionCaptured: '小满被带走了。这一段得重来。',
      Detected: '整个山谷都醒了。',
    };
    SetText(El('HudGameOverReason'), reasons[reason] || String(reason || ''));
    SetHidden(panel, false);
    if (ctx && ctx.input && typeof ctx.input.SetEnabled === 'function') ctx.input.SetEnabled(false, 'GameOver');
    return gameOverDeferred.promise;
  }

  function ResolveGameOver(answer) {
    SetHidden(El('HudGameOver'), true);
    if (ctx && ctx.input && typeof ctx.input.SetEnabled === 'function') ctx.input.SetEnabled(true, 'GameOver');
    if (!gameOverDeferred) return;
    const deferred = gameOverDeferred;
    gameOverDeferred = null;
    deferred.resolve(answer);
  }

  /* ---------------------------- 淡入淡出 / 遮幅 / 载入 ---------------------------- */

  function FadeTo(alpha, seconds, color) {
    const fade = El('HudFade');
    if (!fade) return Promise.resolve();
    const target = Clamp01(Number(alpha) || 0);
    const span = Math.max(0, Number(seconds) || 0);
    if (color) SetVar(fade, 'background-color', String(color));
    fade.style.transitionDuration = span.toFixed(3) + 's';
    fade.style.opacity = String(target);
    SetAttr(fade, 'dataBlocking', target > 0.85 ? '1' : '');
    if (fadeDeferred) { fadeDeferred.resolve(); fadeDeferred = null; }
    if (span <= 0) return Promise.resolve();
    fadeDeferred = MakeDeferred();
    fadeTimer = span;
    return fadeDeferred.promise;
  }

  function SetLetterbox(on) {
    const box = El('HudLetterbox');
    if (!box) return;
    SetHidden(box, false);
    SetVar(box, '--BarScale', on ? '1' : '0');
    if (!on) {
      // 收起后再隐藏，避免过渡被打断
      window.setTimeout(() => { if (!disposed) SetHidden(box, true); }, 560);
    }
  }

  function SetLoading(loading, text) {
    const panel = El('HudLoading');
    if (!panel) return;
    SetHidden(panel, loading !== true);
    if (text) SetText(El('HudLoadingText'), text);
  }

  function SetVisible(visible) {
    SetHidden(root, visible === false);
  }

  function SetDebugText(text) {
    const panel = El('HudDebug');
    if (!panel) return;
    const value = text ? String(text) : '';
    SetHidden(panel, value.length === 0);
    SetText(panel, value);
  }

  /* ---------------------------- 触屏 ---------------------------- */

  function DetectTouch() {
    if (ctx && ctx.isMobile === true) return true;
    try {
      return (navigator.maxTouchPoints || 0) > 0 && window.matchMedia('(pointer: coarse)').matches;
    } catch (error) {
      return false;
    }
  }

  function SetTouchVisible(visible) {
    touchVisible = visible === true;
    SetHidden(El('HudTouch'), !touchVisible);
    SetAttr(gameRoot, 'dataTouch', touchVisible ? '1' : '');
    const input = ctx && ctx.input;
    if (input && typeof input.SetTouchEnabled === 'function') input.SetTouchEnabled(touchVisible);
  }

  function PushVirtualAxis(name, x, y) {
    const input = ctx && ctx.input;
    if (input && typeof input.SetVirtualAxis === 'function') input.SetVirtualAxis(name, x, y);
  }

  function PushVirtualButton(name, down) {
    const input = ctx && ctx.input;
    if (input && typeof input.SetVirtualButton === 'function') input.SetVirtualButton(name, down);
  }

  function BindTouchControls() {
    if (touchBound) return;
    touchBound = true;

    const stick = El('HudTouchStick');
    const knob = El('HudTouchStickKnob');
    const look = El('HudTouchLook');

    if (stick) {
      Bind(stick, 'pointerdown', (event) => {
        if (stickPointerId !== null) return;
        stickPointerId = event.pointerId;
        const rect = stick.getBoundingClientRect();
        stickRadius = Math.max(40, Math.min(72, Math.min(rect.width, rect.height) * 0.34));
        stickOrigin.x = event.clientX - rect.left;
        stickOrigin.y = event.clientY - rect.top;
        SetVar(stick, '--StickOriginX', stickOrigin.x.toFixed(1) + 'px');
        SetVar(stick, '--StickOriginY', stickOrigin.y.toFixed(1) + 'px');
        SetAttr(stick, 'dataActive', '1');
        if (stick.setPointerCapture) { try { stick.setPointerCapture(event.pointerId); } catch (error) { /* 忽略 */ } }
        event.preventDefault();
      });
      Bind(stick, 'pointermove', (event) => {
        if (event.pointerId !== stickPointerId) return;
        const rect = stick.getBoundingClientRect();
        let dx = (event.clientX - rect.left) - stickOrigin.x;
        let dy = (event.clientY - rect.top) - stickOrigin.y;
        const length = Math.hypot(dx, dy);
        if (length > stickRadius) { dx = dx / length * stickRadius; dy = dy / length * stickRadius; }
        SetVar(knob, '--StickX', dx.toFixed(1) + 'px');
        SetVar(knob, '--StickY', dy.toFixed(1) + 'px');
        PushVirtualAxis('move', Clamp(dx / stickRadius, -1, 1), Clamp(-dy / stickRadius, -1, 1));
        event.preventDefault();
      });
      const endStick = (event) => {
        if (event.pointerId !== stickPointerId) return;
        stickPointerId = null;
        SetVar(knob, '--StickX', '0px');
        SetVar(knob, '--StickY', '0px');
        SetVar(stick, '--StickOriginX', '50%');
        SetVar(stick, '--StickOriginY', '50%');
        SetAttr(stick, 'dataActive', '');
        PushVirtualAxis('move', 0, 0);
      };
      Bind(stick, 'pointerup', endStick);
      Bind(stick, 'pointercancel', endStick);
      Bind(stick, 'pointerleave', endStick);
    }

    if (look) {
      let lastX = 0;
      let lastY = 0;
      Bind(look, 'pointerdown', (event) => {
        if (lookPointerId !== null) return;
        lookPointerId = event.pointerId;
        lastX = event.clientX;
        lastY = event.clientY;
        SetAttr(look, 'dataActive', '1');
        if (look.setPointerCapture) { try { look.setPointerCapture(event.pointerId); } catch (error) { /* 忽略 */ } }
        event.preventDefault();
      });
      Bind(look, 'pointermove', (event) => {
        if (event.pointerId !== lookPointerId) return;
        lookDelta.x += (event.clientX - lastX);
        lookDelta.y += (event.clientY - lastY);
        lastX = event.clientX;
        lastY = event.clientY;
        event.preventDefault();
      });
      const endLook = (event) => {
        if (event.pointerId !== lookPointerId) return;
        lookPointerId = null;
        SetAttr(look, 'dataActive', '');
      };
      Bind(look, 'pointerup', endLook);
      Bind(look, 'pointercancel', endLook);
      Bind(look, 'pointerleave', endLook);
    }

    const buttons = doc.querySelectorAll('#HudTouch [dataTouch]');
    for (let i = 0; i < buttons.length; i += 1) {
      const button = buttons[i];
      const name = button.getAttribute('dataTouch');
      const isToggle = button.getAttribute('dataToggle') === '1';
      if (name === 'pause') {
        Bind(button, 'click', () => { if (menuOpen) CloseMenu(); else OpenMenu('Pause'); });
        continue;
      }
      Bind(button, 'pointerdown', (event) => {
        event.preventDefault();
        if (isToggle) {
          touchButtonState[name] = !touchButtonState[name];
          PushVirtualButton(name, touchButtonState[name]);
          SetAttr(button, 'dataDown', touchButtonState[name] ? '1' : '');
        } else {
          touchButtonState[name] = true;
          PushVirtualButton(name, true);
          SetAttr(button, 'dataDown', '1');
        }
        if (button.setPointerCapture) { try { button.setPointerCapture(event.pointerId); } catch (error) { /* 忽略 */ } }
      });
      const release = (event) => {
        if (event && event.preventDefault) event.preventDefault();
        if (isToggle) return;
        if (!touchButtonState[name]) return;
        touchButtonState[name] = false;
        PushVirtualButton(name, false);
        SetAttr(button, 'dataDown', '');
      };
      Bind(button, 'pointerup', release);
      Bind(button, 'pointercancel', release);
      Bind(button, 'pointerleave', release);
    }
  }

  /* ---------------------------- 活跃度（战斗外淡出） ---------------------------- */

  function MarkActivity() {
    calmSeconds = 0;
    SetAttr(root, 'dataCalm', '');
  }

  /* ---------------------------- 每帧 ---------------------------- */

  function Update(dt, currentCtx) {
    if (disposed) return;
    if (currentCtx) ctx = currentCtx;
    const step = Number(dt) || 0;
    const rawStep = currentCtx && Number.isFinite(currentCtx.rawDt) ? currentCtx.rawDt : step;

    // 字幕
    if (subtitleCurrent) {
      subtitleTimer -= step;
      if (subtitleTimer <= 0) AdvanceSubtitle();
      else if (subtitleCurrent.speaker) UpdateSubtitleDirection();
    }

    // 方向声音字幕
    if (soundCaptionTimer > 0) {
      soundCaptionTimer -= step;
      if (soundCaptionTimer <= 0) AdvanceSoundCaption();
    } else if (soundCaptions.length) {
      AdvanceSoundCaption();
    }

    // 浮条
    for (let i = toasts.length - 1; i >= 0; i -= 1) {
      const toast = toasts[i];
      toast.remaining -= step;
      if (toast.remaining <= 0.32) SetClass(toast.node, 'Style_ToastOut', true);
      if (toast.remaining <= 0) {
        if (toast.node && toast.node.parentNode) toast.node.parentNode.removeChild(toast.node);
        toasts.splice(i, 1);
      }
    }

    // 交互进度
    if (progressAuto && progressSpan > 0) {
      progressTimer += step;
      ShowInteractProgress(progressTimer / progressSpan);
      if (progressTimer >= progressSpan) HideInteractProgress();
    }

    // 章节卡与淡入淡出（用真实时间，暂停时也要走完）
    StepChapterCard(rawStep);
    if (fadeDeferred) {
      fadeTimer -= rawStep;
      if (fadeTimer <= 0) { fadeDeferred.resolve(); fadeDeferred = null; }
    }

    // 抉择倒计时
    if (choiceDeferred && choiceSpan > 0) {
      choiceTimer -= rawStep;
      SetVar(El('HudChoiceTimer'), '--TimerFill', Clamp01(choiceTimer / choiceSpan).toFixed(3));
      if (choiceTimer <= 0) ResolveChoice('');
    }

    // 触屏视角
    if (touchVisible && (lookDelta.x !== 0 || lookDelta.y !== 0)) {
      PushVirtualAxis('look', Clamp(lookDelta.x / 9, -1, 1), Clamp(lookDelta.y / 9, -1, 1));
      lookDelta.x = 0;
      lookDelta.y = 0;
    } else if (touchVisible && lookPointerId === null) {
      PushVirtualAxis('look', 0, 0);
    }

    // 低频轮询（8Hz）：警戒、伴随、声音字幕队列
    pollTimer -= rawStep;
    if (pollTimer <= 0) {
      pollTimer = 0.125;
      PollWorldState();
    }

    // 暂停输入
    const input = ctx && ctx.input;
    if (input && typeof input.Consume === 'function') {
      usesInputPause = true;
      if (input.Consume('pause')) { if (menuOpen) CloseMenu(); else OpenMenu('Pause'); }
      if (input.Consume('menu')) ToggleInventory();
    }

    // 战斗外淡出
    calmSeconds += rawStep;
    if (calmSeconds > 6 && stealth.level === 0 && !promptVisible && !subtitleCurrent) {
      SetAttr(root, 'dataCalm', '1');
    }
  }

  function PollWorldState() {
    const enemies = ctx && ctx.enemies;
    if (enemies) {
      let level = stealth.level;
      let alert = stealth.alert;
      let threat = null;
      try {
        if (typeof enemies.GetAlertLevel === 'function') level = enemies.GetAlertLevel();
        if (typeof enemies.GetGlobalAlert === 'function') alert = enemies.GetGlobalAlert();
        const player = ctx && ctx.player;
        if (typeof enemies.GetThreatDirection === 'function' && player && player.position) {
          threat = enemies.GetThreatDirection(player.position);
        }
      } catch (error) { /* 忽略 */ }
      const player = ctx && ctx.player;
      const concealed = player && player.state ? (player.state.concealment || 0) > 0.4 : stealth.concealed;
      const noise = player && player.state ? (player.state.noiseRadius || 0) : stealth.noiseRadius;
      if (level !== stealth.level || alert !== stealth.alert || threat !== stealth.threatDirection ||
          concealed !== stealth.concealed || noise !== stealth.noiseRadius) {
        SetStealthState({ level, alert, threatDirection: threat, concealed, noiseRadius: noise });
      }
    }

    const companion = ctx && ctx.companion;
    if (companion) {
      const state = companion.state || {};
      const distance = typeof companion.GetDistanceToPlayer === 'function'
        ? companion.GetDistanceToPlayer() : 0;
      SetCompanionState({
        mode: companion.mode || 'Follow',
        hidden: state.hidden === true,
        scared: state.scared || 0,
        distance,
      });
    }

    const audio = ctx && ctx.audio;
    if (audio && typeof audio.GetSoundCaptions === 'function' && settings.soundCaptionsOn !== false) {
      try {
        const captions = audio.GetSoundCaptions() || [];
        for (const caption of captions) {
          const stamp = Number(caption.at) || 0;
          if (stamp <= lastCaptionStamp) continue;
          lastCaptionStamp = stamp;
          ShowSoundCaption(caption.text, caption.directionRadians, caption.distance);
        }
      } catch (error) { /* 忽略 */ }
    }
  }

  function ToggleInventory() {
    if (inventoryOpen) CloseInventory();
    else OpenInventory();
  }

  /* ---------------------------- 事件订阅 ---------------------------- */

  On('HealthChanged', (payload) => {
    SetVitals({
      health: payload.health,
      maxHealth: payload.maxHealth || vitals.maxHealth,
      bleeding: payload.bleeding === true,
    });
  });
  On('StaminaChanged', (payload) => {
    SetVitals({ stamina: payload.stamina, maxStamina: payload.maxStamina || vitals.maxStamina });
  });
  On('WarmthChanged', (payload) => {
    SetVitals({ warmth: payload.warmth, maxWarmth: payload.maxWarmth || vitals.maxWarmth });
    if (payload.low === true) ShowToast('体温在掉。找个地方生火。', 'Warning');
  });
  On('PlayerDamaged', () => { MarkActivity(); });
  On('AmmoChanged', (payload) => {
    SetAmmo({ reserve: payload.reserve, loaded: payload.loaded });
    if (Number(payload.delta) > 0) ShowToast('子弹 +' + payload.delta, 'Item');
  });
  On('GunFired', (payload) => {
    SetAmmo({ loaded: payload.ammoLeft, chambered: false });
    MarkActivity();
  });
  On('ItemPicked', (payload) => {
    const name = ItemName(payload.itemId);
    ShowToast(name + (payload.count > 1 ? ' ×' + payload.count : ''), 'Item');
  });
  On('ItemCrafted', (payload) => {
    ShowToast('做好了：' + ItemName(payload.outputId), 'Item');
    if (inventoryOpen) RenderInventory();
  });
  On('CostRecorded', (payload) => {
    ShowToast(payload.label || LedgerLabel(payload.key), 'Cost', 4);
  });
  On('InteractPrompt', (payload) => {
    if (payload.visible === false) HidePrompt();
    else ShowPrompt(payload.text, payload.keyLabel, payload.kind);
  });
  On('InteractStarted', (payload) => {
    progressAuto = true;
    progressTimer = 0;
    progressSpan = Number(payload.seconds) > 0 ? Number(payload.seconds) : 1.4;
    ShowInteractProgress(0, payload.kind === 'Container' ? '翻找' : '');
  });
  On('InteractFinished', () => { HideInteractProgress(); });
  On('ObjectiveChanged', (payload) => {
    const existing = objectives.find((o) => o.id === payload.objectiveId);
    if (existing) {
      existing.text = payload.text || existing.text;
      existing.done = payload.state === 'Done';
      existing.failed = payload.state === 'Failed';
    } else {
      objectives.push({
        id: String(payload.objectiveId || 'Objective' + objectives.length),
        text: String(payload.text || ''),
        done: payload.state === 'Done',
        failed: payload.state === 'Failed',
        optional: payload.optional === true,
      });
    }
    RenderObjectives();
    const stateLabels = { New: '新目标', Updated: '目标更新', Done: '完成', Failed: '失败' };
    SetText(El('HudObjectiveState'), stateLabels[payload.state] || '');
    if (payload.state === 'New' || payload.state === 'Done' || payload.state === 'Failed') {
      ShowToast((stateLabels[payload.state] || '') + '：' + (payload.text || ''),
        payload.state === 'Failed' ? 'Warning' : 'Info');
    }
  });
  On('Subtitle', (payload) => {
    if (settings.subtitlesOn === false) return;
    const duration = Number(payload.duration) > 0 ? Number(payload.duration) : EstimateDuration(payload.text);
    subtitleQueue.push({
      speaker: payload.speaker || '',
      text: String(payload.text || ''),
      duration,
      emotion: payload.emotion || '',
    });
    if (!subtitleCurrent) AdvanceSubtitle();
  });
  On('SoundCaption', (payload) => {
    ShowSoundCaption(payload.text, payload.directionRadians, payload.distance);
  });
  On('CompanionState', (payload) => { SetCompanionState(payload); });
  On('CompanionCaptured', () => {
    ShowToast('小满被抓走了。', 'Warning', 5);
    MarkActivity();
  });
  On('ChapterChanged', (payload) => {
    chapterIndexText = payload.index ? '第' + '一二三四五'.charAt(Math.max(0, payload.index - 1)) + '章' : '';
    objectiveChapterText = chapterIndexText + (payload.title ? (chapterIndexText ? ' · ' : '') + payload.title : '');
    SetText(El('HudObjectiveChapter'), objectiveChapterText);
    objectives.length = 0;
    RenderObjectives();
    ShowChapterTitle(payload.title || '', payload.subtitle || '');
  });
  On('EnemyAlertChanged', (payload) => {
    SetStealthState({ level: payload.level, alert: payload.alert });
  });
  On('SquadAlerted', () => { MarkActivity(); });
  On('NoiseEmitted', (payload) => {
    if (payload && payload.sourceId === 'Player') SetStealthState({ noiseRadius: payload.radius || 0 });
  });
  On('WeatherChanged', (payload) => {
    if (payload.preset === 'Blizzard') ShowToast('起风了。雪把路盖住了。', 'Info', 3.5);
  });
  On('GameOver', (payload) => {
    ShowGameOver(payload && payload.reason).then((answer) => {
      Emit(answer === 'Retry' ? 'RequestRestart' : 'RequestTitle', { reason: payload && payload.reason });
    });
  });
  On('GameEnded', (payload) => {
    let catalog = null;
    try {
      const table = StoryData.EndingCatalog;
      if (table && payload.endingId && table[payload.endingId]) catalog = table[payload.endingId];
    } catch (error) { /* 忽略 */ }
    const lines = payload.lines || (catalog && catalog.lines) || [];
    const resolvedLines = lines.map((entry) => {
      if (typeof entry !== 'string') return entry;
      try {
        if (typeof StoryData.GetLine === 'function') {
          const line = StoryData.GetLine(entry);
          if (line && line.text) return line.text;
        }
      } catch (error) { /* 忽略 */ }
      return entry;
    });
    ShowEnding({
      endingId: payload.endingId,
      title: payload.title || (catalog && catalog.title) || StoryText('EndingTitleFallback', '十里山路'),
      lines: resolvedLines,
      ledger: payload.ledger || [],
      stats: payload.stats || {},
    });
  });
  On('PauseChanged', (payload) => {
    if (payload && payload.paused === false && menuOpen && payload.reason !== 'Menu') CloseMenu();
  });

  function ItemName(itemId) {
    try {
      if (typeof StoryData.GetItem === 'function') {
        const item = StoryData.GetItem(itemId);
        if (item && item.name) return item.name;
      }
      const catalog = StoryData.ItemCatalog;
      if (catalog && catalog[itemId] && catalog[itemId].name) return catalog[itemId].name;
    } catch (error) { /* 忽略 */ }
    return String(itemId || '');
  }

  function ItemDescription(itemId) {
    try {
      if (typeof StoryData.GetItem === 'function') {
        const item = StoryData.GetItem(itemId);
        if (item && item.description) return item.description;
      }
      const catalog = StoryData.ItemCatalog;
      if (catalog && catalog[itemId] && catalog[itemId].description) return catalog[itemId].description;
    } catch (error) { /* 忽略 */ }
    return '';
  }

  /* ---------------------------- DOM 绑定 ---------------------------- */

  const menuNode = El('HudMenu');
  Bind(menuNode, 'input', OnSettingInput);
  Bind(menuNode, 'change', OnSettingInput);
  Bind(menuNode, 'click', (event) => {
    const target = event.target;
    if (!target || typeof target.closest !== 'function') return;
    const tab = target.closest('.Style_MenuTab');
    if (tab) { OpenMenu(tab.getAttribute('dataMenu')); return; }
    if (target.closest('#HudButtonMenuClose') || target.closest('#HudButtonResume')) { CloseMenu(); return; }
    if (target.closest('#HudButtonRestart')) { CloseMenu(); Emit('RequestRestart', { reason: 'Menu' }); return; }
    if (target.closest('#HudButtonQuit')) { CloseMenu(); Emit('RequestTitle', { reason: 'Menu' }); }
  });

  Bind(El('HudButtonInventoryClose'), 'click', CloseInventory);
  Bind(El('HudButtonRetry'), 'click', () => ResolveGameOver('Retry'));
  Bind(El('HudButtonGameOverMenu'), 'click', () => ResolveGameOver('Menu'));
  Bind(El('HudButtonEndingReplay'), 'click', () => {
    SetHidden(El('HudEnding'), true);
    SetVisible(true);
    if (endingDeferred) { endingDeferred.resolve(); endingDeferred = null; }
    Emit('RequestRestart', { reason: 'Ending' });
  });
  Bind(El('HudButtonEndingTitle'), 'click', () => {
    SetHidden(El('HudEnding'), true);
    if (endingDeferred) { endingDeferred.resolve(); endingDeferred = null; }
    Emit('RequestTitle', { reason: 'Ending' });
  });

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      if (choiceDeferred) return;
      if (inventoryOpen) { CloseInventory(); event.preventDefault(); return; }
      if (menuOpen) { CloseMenu(); event.preventDefault(); return; }
      if (!usesInputPause) { OpenMenu('Pause'); event.preventDefault(); }
      return;
    }
    if (menuOpen || inventoryOpen || choiceDeferred) return;
    if (!usesInputPause && (event.key === 'Tab' || event.key === 'i' || event.key === 'I')) {
      ToggleInventory();
      event.preventDefault();
    }
  };
  Bind(window, 'keydown', onKeyDown);

  const onResize = () => { stickRadius = Math.max(40, Math.min(72, window.innerWidth * 0.09)); };
  Bind(window, 'resize', onResize);

  /* ---------------------------- 初始化 ---------------------------- */

  SetVisible(true);
  ApplySettings(settings);
  SetVitals({});
  SetCrosshair('Hidden', 0);
  SetLoading(false);
  RenderObjectives();
  if (DetectTouch()) {
    BindTouchControls();
    SetTouchVisible(true);
  } else {
    SetTouchVisible(false);
  }

  function Dispose() {
    disposed = true;
    for (const off of unsubscribers) {
      try { off(); } catch (error) { /* 忽略 */ }
    }
    unsubscribers.length = 0;
    for (const [element, type, handler, listenOptions] of domBindings) {
      try { element.removeEventListener(type, handler, listenOptions); } catch (error) { /* 忽略 */ }
    }
    domBindings.length = 0;
    for (const toast of toasts) {
      if (toast.node && toast.node.parentNode) toast.node.parentNode.removeChild(toast.node);
    }
    toasts.length = 0;
    subtitleQueue.length = 0;
    soundCaptions.length = 0;
    if (chapterDeferred) { chapterDeferred.resolve(); chapterDeferred = null; }
    if (choiceDeferred) { choiceDeferred.resolve(''); choiceDeferred = null; }
    if (endingDeferred) { endingDeferred.resolve(); endingDeferred = null; }
    if (gameOverDeferred) { gameOverDeferred.resolve('Menu'); gameOverDeferred = null; }
    if (fadeDeferred) { fadeDeferred.resolve(); fadeDeferred = null; }
  }

  return {
    root,
    SetVisible,

    ShowSubtitle,
    ClearSubtitle,
    ShowSoundCaption,
    ShowPrompt,
    HidePrompt,
    ShowInteractProgress,
    HideInteractProgress,
    ShowToast,

    ShowObjective,
    SetObjectiveList,
    ShowChapterTitle,

    SetVitals,
    SetAmmo,
    SetStealthState,
    SetCrosshair,
    SetThrowArc,
    SetCompanionState,

    OpenInventory,
    CloseInventory,
    ToggleInventory,
    OpenMenu,
    CloseMenu,
    IsMenuOpen() { return menuOpen || inventoryOpen; },
    ShowChoice,
    ShowEnding,
    ShowGameOver,
    FadeTo,
    SetLetterbox,
    SetLoading,

    SetTouchVisible,
    BindTouchControls,
    GetSettings() { return Object.assign({}, settings); },
    ApplySettings,

    SetDebugText,
    Update,
    Dispose,
  };
}

/* ============================ 无 DOM 兜底 ============================ */

function CreateHeadlessHud() {
  const settings = Object.assign({}, DefaultSettings);
  const noop = () => {};
  const resolved = () => Promise.resolve();
  return {
    root: null,
    SetVisible: noop,
    ShowSubtitle: noop,
    ClearSubtitle: noop,
    ShowSoundCaption: noop,
    ShowPrompt: noop,
    HidePrompt: noop,
    ShowInteractProgress: noop,
    HideInteractProgress: noop,
    ShowToast: noop,
    ShowObjective: noop,
    SetObjectiveList: noop,
    ShowChapterTitle: resolved,
    SetVitals: noop,
    SetAmmo: noop,
    SetStealthState: noop,
    SetCrosshair: noop,
    SetThrowArc: noop,
    SetCompanionState: noop,
    OpenInventory: noop,
    CloseInventory: noop,
    ToggleInventory: noop,
    OpenMenu: noop,
    CloseMenu: noop,
    IsMenuOpen() { return false; },
    ShowChoice() { return Promise.resolve(''); },
    ShowEnding: resolved,
    ShowGameOver() { return Promise.resolve('Menu'); },
    FadeTo: resolved,
    SetLetterbox: noop,
    SetLoading: noop,
    SetTouchVisible: noop,
    BindTouchControls: noop,
    GetSettings() { return Object.assign({}, settings); },
    ApplySettings(next) { Object.assign(settings, next || {}); },
    SetDebugText: noop,
    Update: noop,
    Dispose: noop,
  };
}
