// 《烽线 · 敌后指挥》 —— 启动与集成层。
//
// 职责：装配规则内核（Script_Rules）、三维渲染（Script_Renderer）、特效（Script_Effects）、
// 界面（Script_Ui）与音频（Script_Audio），维护选中/悬停等表现层视图状态，驱动主循环与输入。
//
// 容错策略：规则内核与渲染器是硬依赖；特效与音频是软依赖，加载失败时降级为哑对象，
// 保证整局仍可进行。

import * as Rules from "./Script_Rules.mjs";
import { HexKey, ParseHexKey, HexDistanceKeys } from "./Script_Hex.mjs";

const qualityOrder = ["low", "medium", "high", "ultra"];

/** 特效模块缺席时的哑句柄，所有方法都安全空转。 */
function CreateNullEffects() {
  const resolved = () => Promise.resolve();
  return {
    Update() {},
    SpawnUnitMove: resolved,
    SpawnAmbush() {},
    SpawnSabotage() {},
    SpawnSweepArrow() {},
    SpawnMobilize() {},
    SpawnBuild() {},
    SpawnCapture() {},
    SpawnFloatingText() {},
    SpawnIntelPing() {},
    SpawnTunnelTravel: resolved,
    SetWeather() {},
    SetSmoke() {},
    ClearSmoke() {},
    SetTimeOfDay() {},
    SetQuality() {},
    Dispose() {},
  };
}

function CreateNullAudio() {
  return {
    Start() {},
    Play() {},
    SetEra() {},
    SetIntensity() {},
    SetMuted() {},
    SetVolume() {},
    Update() {},
    IsReady: () => false,
    Dispose() {},
  };
}

function DetectQuality() {
  const width = window.innerWidth;
  const ratio = window.devicePixelRatio || 1;
  const cores = navigator.hardwareConcurrency || 4;
  const mobile = width < 820 || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  if (mobile) return width < 560 || cores <= 4 ? "low" : "medium";
  if (cores >= 8 && ratio <= 2) return "ultra";
  return "high";
}

export async function StartGame(options = {}) {
  const canvas = options.canvas ?? document.getElementById("worldCanvas");
  const uiRoot = options.uiRoot ?? document.getElementById("uiRoot");
  const report = options.OnProgress ?? (() => {});

  report(0.05, "读取地形与史料……");

  // --- 装载表现层模块（软失败） ---
  const [rendererModule, effectsModule, uiModule, audioModule] = await Promise.all([
    import("./Script_Renderer.mjs"),
    import("./Script_Effects.mjs").catch(() => null),
    import("./Script_Ui.mjs").catch(() => null),
    import("./Script_Audio.mjs").catch(() => null),
  ]);

  report(0.25, "编成部队与工作队……");

  const settings = LoadSettings();
  const view = {
    selectedKey: null,
    selectedUnitId: null,
    hoverKey: null,
    actions: [],
    reachable: [],
    attackTargets: [],
    preview: null,
    panel: null,
    quality: settings.quality ?? DetectQuality(),
    muted: settings.muted ?? false,
    difficulty: settings.difficulty ?? "Normal",
    busy: false,
    hint: "",
    campaign: null,
    strategicLayer: "Both",
  };

  let state = Rules.CreateInitialState({ seed: settings.seed, difficulty: view.difficulty });

  report(0.4, "勘测太行东麓……");

  const handle = rendererModule.CreateRenderer(canvas, { quality: view.quality });
  // 特效必须知道每格地形的顶面高度，否则粒子与行军动画会贴在 y=0 的平面上。
  const HeightAt = (key) => (typeof handle.GetHexTopHeight === "function" ? handle.GetHexTopHeight(key) : 0);
  handle.effects = effectsModule?.CreateEffects
    ? SafeCall(() =>
        effectsModule.CreateEffects(handle.scene, handle.camera, handle.renderer, { quality: view.quality, HeightAt }),
      ) ?? CreateNullEffects()
    : CreateNullEffects();
  const effects = handle.effects;
  SafeCall(() => effects.SetHeightProvider?.(HeightAt));

  report(0.62, "构筑三维战场……");
  await Promise.resolve(handle.BuildWorld(state));

  const audio = audioModule?.CreateAudio ? SafeCall(() => audioModule.CreateAudio({ muted: view.muted })) ?? CreateNullAudio() : CreateNullAudio();

  report(0.8, "布置指挥所……");

  // 定义表同步注入：UI 若自己异步 import，冷启动头一两秒会真的把英文内部 key 显示给玩家。
  // 这几个模块 Script_Rules 已经静态 import 过了，这里直接把它们递给 UI。
  const [dataUnits, dataTech, dataTerrain, dataHistory] = await Promise.all([
    import("./Data_Units.mjs").catch(() => null),
    import("./Data_Tech.mjs").catch(() => null),
    import("./Data_Terrain.mjs").catch(() => null),
    import("./Data_History.mjs").catch(() => null),
  ]);
  const definitions = { units: dataUnits, tech: dataTech, terrain: dataTerrain, history: dataHistory };

  const ui = uiModule?.CreateUi ? SafeCall(() => uiModule.CreateUi(uiRoot, { definitions })) ?? null : null;
  SafeCall(() => handle.SetTerrainDefinitions?.(dataTerrain?.terrainDefinitions));

  // ---------------------------------------------------------------------
  // 视图与同步
  // ---------------------------------------------------------------------

  function RecomputeView() {
    view.actions = [];
    view.reachable = [];
    view.attackTargets = [];
    view.preview = null;
    if (view.selectedUnitId && !Rules.GetUnit(state, view.selectedUnitId)) view.selectedUnitId = null;
    if (view.selectedUnitId) {
      const reachable = Rules.FindReachableHexes(state, view.selectedUnitId);
      view.reachable = Array.from(reachable.keys());
    }
    if (view.selectedKey) {
      view.actions = Rules.ListContextActions(state, view.selectedUnitId, view.selectedKey);
      const attack = view.actions.find((action) => action.kind === "Attack");
      if (attack) view.preview = Rules.GetActionPreview(state, attack);
    }
    view.briefing = Rules.GetTurnBriefing(state);
    view.campaign = Rules.GetCampaignView?.(state) ?? view.briefing?.campaign ?? null;
  }

  function SyncAll() {
    RecomputeView();
    SafeCall(() => handle.SyncWorld(state));
    SafeCall(() => handle.SetSelectedHex(view.selectedKey));
    SafeCall(() => ApplyStrategicLayer());
    SafeCall(() => ui?.Sync(state, view));
    SafeCall(() => audio.SetEra(state.eraKey));
    SafeCall(() => effects.SetWeather(WeatherForState(state), 1));
  }

  function ApplyStrategicLayer() {
    handle.SetHighlight(null);

    // 战略图层与单位移动范围是正交信息：先铺战略态势，最后叠移动范围。
    // 旧实现选中单位后直接 return，导致开局默认选中单位时「补给 / 战线」按钮永远无视觉反馈。
    if (view.strategicLayer === "Supply" || view.strategicLayer === "Both") {
      const suppliedKeys = state.supply?.resistance?.suppliedKeys
        ?? state.map?.supplyNodes?.filter((node) => node.camp === "Resistance").map((node) => node.key)
        ?? [];
      handle.SetHighlight(suppliedKeys, "intel");
    }
    if (view.strategicLayer === "Front" || view.strategicLayer === "Both") {
      const keys = [];
      for (const edge of state.map?.frontLines ?? []) keys.push(edge.a ?? edge.fromKey, edge.b ?? edge.toKey);
      // 旧档没有 frontLines 数组时，地图格仍带 frontline 安全默认值。
      if (!keys.length) {
        for (const key of state.map?.order ?? []) if (state.map?.hexes?.[key]?.frontline) keys.push(key);
      }
      handle.SetHighlight(keys.filter(Boolean), "attack");
    }
    if (view.selectedUnitId && view.reachable.length) {
      handle.SetHighlight(view.reachable, "move");
    }
  }

  function WeatherForState(current) {
    const season = Rules.GetSeasonKey(current.turn);
    if (season === "冬") return "Snow";
    if (season === "夏") return "Rain";
    if (current.eraKey === "Hardship") return "Dust";
    return "Clear";
  }

  // ---------------------------------------------------------------------
  // 行动派发
  // ---------------------------------------------------------------------

  /** 任何特效都不许拖死回合：单个等待封顶 3.5 秒，超时就继续走。 */
  function WithEffectTimeout(promise) {
    return Promise.race([
      Promise.resolve(promise),
      new Promise((resolve) => setTimeout(resolve, 3500)),
    ]);
  }

  async function PlayEffectQueue(list) {
    for (const item of list ?? []) {
      if (!item?.kind) continue;
      try {
        if (item.kind === "Move") await WithEffectTimeout(effects.SpawnUnitMove(item.fromKey, item.toKey, null, { unitId: item.unitId }));
        else if (item.kind === "Ambush") effects.SpawnAmbush(item.key);
        else if (item.kind === "Sabotage") effects.SpawnSabotage(item.key);
        else if (item.kind === "Capture") effects.SpawnCapture(item.key);
        else if (item.kind === "Mobilize") effects.SpawnMobilize(item.key);
        else if (item.kind === "Build") effects.SpawnBuild(item.key);
        else if (item.kind === "IntelPing") effects.SpawnIntelPing(item.key);
        else if (item.kind === "Smoke") effects.SetSmoke(item.key, item.payload?.level ?? 2);
        else if (item.kind === "Sweep") effects.SpawnSweepArrow(item.fromKey, item.key);
        else if (item.kind === "FloatingText") effects.SpawnFloatingText(item.key, item.payload?.text ?? "", item.payload?.color);
        else if (item.kind === "Retreat") effects.SpawnFloatingText(item.key, "转移", "#c8a86a");
      } catch (error) {
        // 单个特效失败不影响流程
      }
    }
  }

  async function Dispatch(action) {
    if (view.busy || state.over) return;
    view.busy = true;
    SafeCall(() => ui?.SetBusy(true));
    try {
      const outcome = Rules.PerformAction(state, action);
      if (!outcome.report.ok) {
        SafeCall(() => ui?.Toast(outcome.report.reason || "无法执行", "warn"));
        audio.Play("Cancel");
        return;
      }
      state = outcome.nextState;
      audio.Play(SoundForAction(action));
      await PlayEffectQueue(outcome.report.effects);
      for (const line of outcome.report.lines) SafeCall(() => ui?.Toast(line, "info"));
      if (action.kind === "Move" && view.selectedUnitId) {
        const unit = Rules.GetUnit(state, view.selectedUnitId);
        if (unit) view.selectedKey = unit.key;
      }
      SyncAll();
    } finally {
      view.busy = false;
      SafeCall(() => ui?.SetBusy(false));
    }
  }

  function SoundForAction(action) {
    if (action.kind === "Attack") return "Ambush";
    if (action.kind === "Sabotage") return "Blast";
    if (action.kind === "Siege") return "Blast";
    if (action.kind === "Move") return "March";
    if (action.kind === "Mobilize") return "Good";
    if (action.kind === "BuildWork" || action.kind === "FoundBase") return "Build";
    return "Click";
  }

  async function RunEndTurn() {
    if (view.busy || state.over) return;
    view.busy = true;
    SafeCall(() => ui?.SetBusy(true));
    try {
      audio.Play("Turn");
      const outcome = Rules.EndTurn(state);
      state = outcome.nextState;
      await PlayEffectQueue(outcome.report.effects);

      for (const item of outcome.report.events ?? []) {
        if (item.kind === "Era") {
          audio.SetEra(state.eraKey);
          await ShowEraCinematic(state.eraKey);
        } else if (item.kind === "Historical") {
          await ShowHistoricalEvent(item.event);
        } else if (item.kind === "Ending") {
          await ShowEnding(item.result);
        }
      }

      const forecast = Rules.ForecastSweep(state);
      if (forecast && forecast.turnsUntil <= 2) {
        audio.Play("Alarm");
        SafeCall(() => effects.SpawnSweepArrow(forecast.axisKeys?.[0] ?? forecast.targetKey, forecast.targetKey));
      }
      for (const line of outcome.report.lines) SafeCall(() => ui?.Toast(line, "info"));

      view.selectedUnitId = null;
      SyncAll();
      SaveGame(true);
    } finally {
      view.busy = false;
      SafeCall(() => ui?.SetBusy(false));
    }
  }

  async function ShowEraCinematic(eraKey) {
    const era = Rules.GetEraForTurn(state.turn);
    if (!ui?.Cinematic || view.autoPlay) return;
    SafeCall(() => ui?.SetBusy(false));
    await ui.Cinematic({
      kind: "Era",
      eraKey,
      title: era.name ?? eraKey,
      dateline: `${era.dateRange ?? Rules.FormatTurnDate(state.turn)}`,
      body: era.summary ?? "",
      rules: era.rules ?? [],
      illustration: { kind: "Ridge", tone: eraKey === "Hardship" ? "grim" : "warm", motifs: [] },
      options: [{ id: "ok", label: "继续" }],
    });
  }

  async function ShowHistoricalEvent(event) {
    // autoPlay 供冒烟/视觉自动化使用：不弹卡、直接取默认选项，
    // 否则 EndTurn 会一直等玩家点选，自动化流程会在事件卡上永久挂起。
    if (!ui?.Cinematic || view.autoPlay) {
      state = Rules.ApplyEventChoice(state, event.id, event.options?.[0]?.id);
      return;
    }
    // 等玩家读卡点选期间不是"推演中"，busy 必须放下
    SafeCall(() => ui?.SetBusy(false));
    const choice = await ui.Cinematic({ kind: "Event", ...event });
    SafeCall(() => ui?.SetBusy(true));
    state = Rules.ApplyEventChoice(state, event.id, choice ?? event.options?.[0]?.id);
    SyncAll();
  }

  async function ShowEnding(result) {
    if (!ui?.Cinematic || view.autoPlay) return;
    SafeCall(() => ui?.SetBusy(false));
    await ui.Cinematic({
      kind: "Ending",
      title: result?.ending?.title ?? "终局",
      dateline: "1945 年 8 月",
      body: result?.ending?.body ?? "",
      epilogue: result?.ending?.epilogue ?? "",
      result,
      illustration: { kind: "Assembly", tone: "warm", motifs: [] },
      options: [{ id: "ok", label: "查看账本" }],
    });
    SafeCall(() => ui.ShowPanel("Ledger", result));
  }

  // ---------------------------------------------------------------------
  // 选择与输入
  // ---------------------------------------------------------------------

  function SelectHex(key) {
    if (!key || !Rules.GetHex(state, key)) {
      view.selectedKey = null;
      view.selectedUnitId = null;
      SyncAll();
      return;
    }
    const unitsHere = Rules.GetUnitsAt(state, key);
    if (unitsHere.length) {
      // 反复点同一格时在该格的多支部队之间轮换。
      const index = unitsHere.findIndex((unit) => unit.id === view.selectedUnitId);
      view.selectedUnitId = unitsHere[(index + 1) % unitsHere.length].id;
    } else if (view.selectedUnitId && view.reachable.includes(key)) {
      // 已选中部队时点亮格 = 直接转移
      Dispatch({ kind: "Move", unitId: view.selectedUnitId, toKey: key });
      view.selectedKey = key;
      return;
    } else {
      view.selectedUnitId = null;
    }
    view.selectedKey = key;
    audio.Play("Click");
    SyncAll();
  }

  let pointerDown = null;
  canvas.addEventListener("pointerdown", (event) => {
    pointerDown = { x: event.clientX, y: event.clientY, time: performance.now() };
    audio.Start();
  });
  canvas.addEventListener("pointerup", (event) => {
    if (!pointerDown) return;
    const dx = event.clientX - pointerDown.x;
    const dy = event.clientY - pointerDown.y;
    const drift = Math.hypot(dx, dy);
    const elapsed = performance.now() - pointerDown.time;
    pointerDown = null;
    // 12px 以内的手抖算点击；拖动是相机操作，不误选。
    if (drift > 12 || elapsed > 700) return;
    const key = SafeCall(() => handle.PickHex(event.clientX, event.clientY));
    SelectHex(key ?? null);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (pointerDown) return;
    const key = SafeCall(() => handle.PickHex(event.clientX, event.clientY));
    if (key !== view.hoverKey) {
      view.hoverKey = key ?? null;
      SafeCall(() => handle.SetHoverHex(view.hoverKey));
      SafeCall(() => ui?.Sync(state, view));
    }
  });
  canvas.addEventListener("pointerleave", () => {
    view.hoverKey = null;
    SafeCall(() => handle.SetHoverHex(null));
  });

  window.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.code === "Space") {
      event.preventDefault();
      RunEndTurn();
    } else if (event.code === "Escape") {
      view.panel = null;
      SafeCall(() => ui?.ShowPanel(null));
    } else if (event.code === "KeyN") {
      CycleIdleUnit();
    }
  });

  function CycleIdleUnit() {
    const idle = state.units.filter((unit) => !unit.acted && unit.moves > 0);
    if (!idle.length) return;
    const index = idle.findIndex((unit) => unit.id === view.selectedUnitId);
    const unit = idle[(index + 1) % idle.length];
    view.selectedUnitId = unit.id;
    view.selectedKey = unit.key;
    SafeCall(() => handle.FocusHex(unit.key, { duration: 0.5 }));
    SyncAll();
  }

  window.addEventListener("resize", () => SafeCall(() => handle.Resize()));

  // ---------------------------------------------------------------------
  // UI hooks
  // ---------------------------------------------------------------------

  const hooks = {
    OnEndTurn: () => RunEndTurn(),
    OnSelectHex: (key) => SelectHex(key),
    OnUnitAction: (action) => Dispatch(action),
    OnFocusHex: (key) => {
      SafeCall(() => handle.FocusHex(key, { duration: 0.6 }));
      SelectHex(key);
    },
    OnBuild: (payload) => {
      if (payload?.kind === "District") {
        state = Rules.QueueDistrict(state, payload.baseId, payload.districtType);
        audio.Play("Build");
      } else if (payload?.kind === "Unit") {
        state = Rules.TrainUnit(state, payload.baseId, payload.unitType);
        audio.Play("Unlock");
      }
      SyncAll();
    },
    OnResearch: (payload) => {
      state = Rules.SetResearch(state, payload?.id, payload?.tree ?? "tech");
      audio.Play("Confirm");
      SyncAll();
    },
    OnAdoptPolicy: (ids) => {
      state = Rules.SetPolicies(state, ids);
      audio.Play("Confirm");
      SyncAll();
    },
    OnFoundBase: (payload) => Dispatch({ kind: "FoundBase", unitId: payload?.unitId ?? view.selectedUnitId, key: payload?.key ?? view.selectedKey }),
    OnPanelOpen: (name) => {
      view.panel = name;
      audio.Play("Click");
      SafeCall(() => ui?.Sync(state, view));
    },
    OnPickUnit: (unitId) => {
      const unit = Rules.GetUnit(state, unitId);
      if (!unit) return;
      view.selectedUnitId = unit.id;
      view.selectedKey = unit.key;
      audio.Play("Click");
      SyncAll();
    },
    OnSetQuality: (level) => {
      view.quality = qualityOrder.includes(level) ? level : "high";
      SafeCall(() => handle.SetQuality(view.quality));
      SafeCall(() => effects.SetQuality(view.quality));
      SaveSettings();
      SyncAll();
    },
    OnToggleAudio: (muted) => {
      view.muted = muted ?? !view.muted;
      audio.SetMuted(view.muted);
      SaveSettings();
      SyncAll();
    },
    OnSave: () => {
      SaveGame(false);
      SafeCall(() => ui?.Toast("已存档", "good"));
    },
    OnLoad: () => {
      const loaded = LoadGame();
      if (!loaded) {
        SafeCall(() => ui?.Toast("没有可用存档", "warn"));
        return;
      }
      state = loaded;
      SafeCall(() => handle.BuildWorld(state));
      SyncAll();
      SafeCall(() => ui?.Toast("存档已读取", "good"));
    },
    OnNewGame: (payload) => {
      const seed = payload?.seed;
      view.difficulty = payload?.difficulty ?? view.difficulty;
      state = Rules.CreateInitialState({ seed, difficulty: view.difficulty });
      view.selectedKey = null;
      view.selectedUnitId = null;
      SaveSettings();
      SafeCall(() => handle.BuildWorld(state));
      SafeCall(() => handle.FocusHex(state.startKey, { duration: 0 }));
      SyncAll();
    },
    OnSetDifficulty: (level) => {
      view.difficulty = level;
      SaveSettings();
    },
    OnSetStrategicLayer: (layer) => {
      view.strategicLayer = ["Both", "Supply", "Front"].includes(layer) ? layer : "Both";
      SafeCall(() => ApplyStrategicLayer());
    },
  };
  SafeCall(() => ui?.Bind(hooks));

  // ---------------------------------------------------------------------
  // 存档
  // ---------------------------------------------------------------------

  function SaveGame(auto) {
    try {
      window.localStorage.setItem(Rules.saveKey, Rules.SerializeState(state));
      if (!auto) window.localStorage.setItem(`${Rules.saveKey}_manual`, Rules.SerializeState(state));
    } catch (error) {
      // 隐私模式下 localStorage 不可用，忽略
    }
  }

  function LoadGame() {
    try {
      const text = window.localStorage.getItem(`${Rules.saveKey}_manual`) ?? window.localStorage.getItem(Rules.saveKey);
      return text ? Rules.DeserializeState(text) : null;
    } catch (error) {
      return null;
    }
  }

  function SaveSettings() {
    try {
      window.localStorage.setItem(
        `${Rules.saveKey}_settings`,
        JSON.stringify({ quality: view.quality, muted: view.muted, difficulty: view.difficulty }),
      );
    } catch (error) {
      // 忽略
    }
  }

  function LoadSettings() {
    try {
      const text = window.localStorage.getItem(`${Rules.saveKey}_settings`);
      return text ? JSON.parse(text) : {};
    } catch (error) {
      return {};
    }
  }

  // ---------------------------------------------------------------------
  // 主循环
  // ---------------------------------------------------------------------

  let last = performance.now();
  let elapsed = 0;
  function Frame(now) {
    const delta = Math.min(0.1, (now - last) / 1000);
    last = now;
    elapsed += delta;
    SafeCall(() => handle.Update(delta, elapsed));
    SafeCall(() => audio.Update(delta));
    SafeCall(() => ui?.SyncUnitPlates?.(state, view, (key) => handle.ProjectHexToScreen(key, 0.92)));
    requestAnimationFrame(Frame);
  }
  requestAnimationFrame(Frame);

  SafeCall(() => handle.SetQuality(view.quality));
  SafeCall(() => effects.SetQuality(view.quality));
  SafeCall(() => handle.FocusHex(state.startKey, { duration: 0 }));
  view.selectedKey = state.startKey;
  SyncAll();

  report(1, "就绪");

  // 暴露给冒烟测试与调试面板。
  window.EnemyRearCommand = {
    GetState: () => state,
    SetState: (next) => {
      state = next;
      SyncAll();
    },
    Rules,
    handle,
    ui,
    audio,
    view,
    EndTurn: RunEndTurn,
    /** 自动化用：跳过全部过场与事件卡，直接取默认选项，保证 EndTurn 一定会 resolve。 */
    SetAutoPlay(enabled) {
      view.autoPlay = Boolean(enabled);
    },
    definitions,
  };

  return window.EnemyRearCommand;
}

function SafeCall(callback) {
  try {
    return callback();
  } catch (error) {
    console.warn("[EnemyRearCommand]", error);
    return null;
  }
}
