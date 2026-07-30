// 《燎原 · 敌后1937》 —— 启动与集成层。
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
    DecaySmoke() {},
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
    view.hint = "";
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
    ComputeAttackGuidance();
    view.briefing = Rules.GetTurnBriefing(state);
  }

  /**
   * 填充 view.attackTargets（本回合真打得着的敌格），并给新手一句节奏引导：
   * 选中的队伍够不着任何目标、但可见敌军就在 2-3 格内时，提示"先转移到隔壁再伏击"。
   * 同一提示最多出现 3 次（view 局部状态，不入存档）。
   */
  function ComputeAttackGuidance() {
    if (!view.selectedUnitId) return;
    const unit = Rules.GetUnit(state, view.selectedUnitId);
    if (!unit) return;
    const nearby = [];
    for (const enemy of state.enemies ?? []) {
      if ((enemy.hp ?? 1) <= 0 || enemy.visibleToPlayer === false) continue;
      const distance = HexDistanceKeys(unit.key, enemy.key);
      if (distance <= 3) nearby.push({ key: enemy.key, distance });
    }
    if (!nearby.length) return;
    for (const item of nearby) {
      const actions = item.key === view.selectedKey
        ? view.actions
        : Rules.ListContextActions(state, view.selectedUnitId, item.key);
      if (actions.some((action) => action.kind === "Attack" && action.enabled !== false)) {
        view.attackTargets.push(item.key);
      }
    }
    if (view.attackTargets.length || unit.acted) return;
    if (!nearby.some((item) => item.distance >= 2 && item.distance <= 3)) return;
    const token = `${unit.id}|${state.turn}`;
    if (view.ambushHintToken !== token) {
      if ((view.ambushHintCount ?? 0) >= 3) return;
      view.ambushHintToken = token;
      view.ambushHintCount = (view.ambushHintCount ?? 0) + 1;
    }
    view.hint = "敌军就在附近：先转移到敌人隔壁，再选「伏击后转移」。";
  }

  function SyncAll() {
    RecomputeView();
    SafeCall(() => handle.SyncWorld(state));
    SafeCall(() => handle.SetSelectedHex(view.selectedKey));
    SafeCall(() => handle.SetHighlight(view.reachable, "move"));
    SafeCall(() => ui?.Sync(state, view));
    SafeCall(() => audio.SetEra(state.eraKey));
    SafeCall(() => effects.SetWeather(WeatherForState(state), 1));
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

  /** 派发单个特效。所有 Spawn* 都返回 { duration }（秒），失败时按 null/0 处理。 */
  function SpawnEffectItem(item) {
    try {
      switch (item.kind) {
        case "Move": return effects.SpawnUnitMove(item.fromKey, item.toKey, null, { unitId: item.unitId });
        case "Ambush": return effects.SpawnAmbush(item.key);
        case "Sabotage": return effects.SpawnSabotage(item.key);
        // 攻坚没有专属特效，借爆破的烟火表现炮楼攻防。
        case "Siege": return effects.SpawnSabotage(item.key);
        case "Capture": return effects.SpawnCapture(item.key);
        case "Mobilize": return effects.SpawnMobilize(item.key);
        case "Build": return effects.SpawnBuild(item.key);
        case "IntelPing": return effects.SpawnIntelPing(item.key);
        case "Smoke": return effects.SetSmoke(item.key, item.payload?.level ?? 2);
        case "Sweep": return effects.SpawnSweepArrow(item.fromKey, item.key);
        case "FloatingText": return effects.SpawnFloatingText(item.key, item.payload?.text ?? "", item.payload?.color);
        case "Retreat": return effects.SpawnFloatingText(item.key, "转移", "#c8a86a");
        default: return null;
      }
    } catch (error) {
      // 单个特效失败不影响流程
      return null;
    }
  }

  /** 取一个特效的"叙事时长"。扫荡箭头是常驻警示层（全寿命 9s），排队时只等 1s 意思一下。 */
  function EffectSeconds(result, kind) {
    const duration = Number(result?.duration) || 0;
    if (kind === "Sweep") return Math.min(duration, 1);
    return duration;
  }

  /**
   * 战斗特效时间线。旧实现除 Move 外全部同帧齐发，伏击闪光、伤害数字、缴获与
   * 烟柱在同一帧糊成一团。现在按类型分镜：
   *   行军先走完 → 打击（伏击/爆破/攻坚，多个并行；烟柱、警示箭头随打击一起起）
   *   → 0.35s 后再出伤害数字 → 缴获 / 撤离收尾。
   * 全程共用 4 秒总预算（Promise.race 型护栏），任何特效都不许拖死 EndTurn；
   * autoPlay 模式零等待，保证无人值守整局的速度。
   */
  async function PlayEffectQueue(list) {
    const items = (list ?? []).filter((item) => item && item.kind);
    if (!items.length) return;

    if (view.autoPlay) {
      for (const item of items) SpawnEffectItem(item);
      return;
    }

    const startedAt = performance.now();
    const BudgetLeft = () => 4000 - (performance.now() - startedAt);
    const Wait = (seconds) => {
      const ms = Math.min((Number(seconds) || 0) * 1000, BudgetLeft());
      if (ms <= 0) return Promise.resolve();
      return new Promise((resolve) => setTimeout(resolve, ms));
    };

    const phases = { march: [], strike: [], text: [], tail: [] };
    for (const item of items) {
      if (item.kind === "Move") phases.march.push(item);
      else if (item.kind === "Ambush" || item.kind === "Sabotage" || item.kind === "Siege") phases.strike.push(item);
      else if (item.kind === "FloatingText") phases.text.push(item);
      else if (item.kind === "Capture" || item.kind === "Retreat") phases.tail.push(item);
      // Smoke / Sweep / Mobilize / Build / IntelPing 等随主体一起起
      else phases.strike.push(item);
    }

    // 1) 行军先走完（正常只有一条；等待受总预算约束，超时放行）。
    for (const item of phases.march) {
      const spawned = SpawnEffectItem(item);
      if (spawned && typeof spawned.then === "function" && BudgetLeft() > 0) {
        await Promise.race([spawned.catch(() => {}), Wait(3.5)]);
      }
    }

    // 2) 打击与环境层齐发，同类并行，取最长叙事时长。
    let strikeSeconds = 0;
    for (const item of phases.strike) {
      strikeSeconds = Math.max(strikeSeconds, EffectSeconds(SpawnEffectItem(item), item.kind));
    }

    // 3) 伤害数字延后 0.35s 再出："先见打、后见数"。
    let textSeconds = 0;
    if (phases.text.length) {
      if (strikeSeconds > 0) await Wait(0.35);
      for (const item of phases.text) {
        textSeconds = Math.max(textSeconds, EffectSeconds(SpawnEffectItem(item), item.kind));
      }
      strikeSeconds = Math.max(strikeSeconds - 0.35, 0);
    }
    const holdSeconds = Math.max(strikeSeconds * 0.7, textSeconds * 0.45);
    if (holdSeconds > 0) await Wait(holdSeconds);

    // 4) 缴获 / 撤离收尾。
    let tailSeconds = 0;
    for (const item of phases.tail) {
      tailSeconds = Math.max(tailSeconds, EffectSeconds(SpawnEffectItem(item), item.kind));
    }
    if (tailSeconds > 0) await Wait(tailSeconds * 0.55);
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
      // 敌方回合开始：回合边界让烟柱分两级消散（持续燃烧格会在结算特效里重新 SetSmoke 续命）。
      SafeCall(() => effects.DecaySmoke?.());
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
      await MaybeAskSweepStance();
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
  // 反扫荡方针
  // ---------------------------------------------------------------------

  /** 四种方针的玩家侧文案。key 与 Rules.sweepStanceKeys（Combat.sweepStanceProfiles）对齐。 */
  const sweepStanceCopy = {
    Disperse: {
      label: "分散转移·坚壁清野",
      detail: "保人保粮，主力伤亡最小；代价是暂时让出地面，流离的人最多。",
    },
    Decisive: {
      label: "正面决战",
      detail: "杀伤最大，缴获次之；我方伤亡成倍，村庄与平民代价也最重。",
    },
    CounterRaid: {
      label: "敌进我进",
      detail: "跳到外线打敌空虚后方，缴获最多；留守地区仍要受损。",
    },
    Fortify: {
      label: "依托工事节节抗击",
      detail: "凭地道与工事迟滞敌军，损失居中；工事薄的村庄要吃亏。",
    },
  };

  /** 给弹窗用的地名：优先地物名，其次地形名，最后落坐标。 */
  function LabelHex(current, key) {
    const hex = key ? Rules.GetHex(current, key) : null;
    if (!hex) return key || "未明地点";
    const feature = hex.feature ? definitions.terrain?.featureDefinitions?.[hex.feature]?.name : null;
    const terrain = definitions.terrain?.terrainDefinitions?.[hex.terrain]?.name ?? hex.terrain;
    return feature ? `${feature}（${terrain}）` : `${terrain} (${key})`;
  }

  /**
   * 敌扫荡进入 Declare / Prepare 阶段时，在玩家回合开始弹一次「反扫荡部署」选择卡。
   * 每次扫荡（按 sweep.id）只问一次，记录在 view 上防重复弹；autoPlay 不弹、默认「分散转移」。
   * busy 护盾成对：等玩家读卡期间放下，选完立刻举回；外层 RunEndTurn 的 finally 兜底放下。
   */
  async function MaybeAskSweepStance() {
    const sweep = state.sweep;
    if (!sweep || state.over) return;
    const stage = state.enemyReadout?.sweepStage;
    const pending = stage === "Declare" || stage === "Prepare" || (Number(sweep.turnsUntil) || 0) > 0;
    if (!pending) return;
    const token = sweep.id ?? `${sweep.targetKey}|${sweep.declaredTurn ?? ""}`;
    if (view.sweepStanceToken === token) return;
    view.sweepStanceToken = token;

    if (view.autoPlay || !ui?.Cinematic) {
      hooks.OnSetSweepStance("Disperse");
      return;
    }

    const forecast = Rules.ForecastSweep(state) ?? {};
    // axisKeys 是轴线途经的格序列，不是进攻路数；只有 ≤4 时才敢当路数报，否则一律「多路」。
    const axisRaw = forecast.axisKeys?.length ?? sweep.axisKeys?.length ?? 0;
    const axisCount = axisRaw >= 1 && axisRaw <= 4 ? axisRaw : 0;
    const strength = Math.round(Number(forecast.strength ?? sweep.strength) || 0);
    const turns = Math.max(0, Number(forecast.turnsUntil ?? sweep.turnsUntil) || 0);
    const confidence = Number(forecast.confidence);
    const lines = [
      `交通站与内线接连来报：敌已立案调兵，将以${axisCount > 0 ? ` ${axisCount} 路` : "多路"}合击${LabelHex(state, forecast.targetKey ?? sweep.targetKey)}，估计兵力 ${strength}，距发起约 ${turns} 回合。`,
      "沿线据点守备已开始抽调——这既是险局，也是打其后方的战机。各区如何应对，请即定下方针。",
    ];
    if (Number.isFinite(confidence) && confidence < 0.45) {
      lines.push(`该方向情报覆盖仅 ${Math.round(confidence * 100)}%，轴线与落点判断可能有误。`);
    }

    const options = Rules.sweepStanceKeys.map((key) => ({
      id: key,
      label: sweepStanceCopy[key]?.label ?? key,
      detail: sweepStanceCopy[key]?.detail ?? "",
    }));

    // 等玩家读卡点选期间不是"推演中"，busy 必须放下；选完立刻举回。
    SafeCall(() => ui?.SetBusy(false));
    const choice = await ui.Cinematic({
      kind: "Event",
      title: "反扫荡部署",
      subtitle: state.enemyReadout?.sweepStageLabel ?? "敌已立案调兵",
      dateline: Rules.FormatTurnDate(state.turn),
      body: lines.join("\n"),
      illustration: { kind: "Ridge", tone: "grim", motifs: [] },
      options,
      dismissible: false,
    });
    SafeCall(() => ui?.SetBusy(true));
    const stanceKey = Rules.sweepStanceKeys.includes(choice) ? choice : "Disperse";
    hooks.OnSetSweepStance(stanceKey);
    SafeCall(() => ui?.Toast(`反扫荡方针已定：「${sweepStanceCopy[stanceKey]?.label ?? stanceKey}」`, "warn"));
  }

  // ---------------------------------------------------------------------
  // 选择与输入
  // ---------------------------------------------------------------------

  /** 该格是否有可打击的目标：看得见的敌军，或仍有守备的据点。 */
  function HasStrikeTargetAt(key) {
    const stronghold = Rules.GetStrongholdAt(state, key);
    if (stronghold && !stronghold.destroyed && (stronghold.garrison ?? 0) > 0) return true;
    return Rules.GetEnemiesAt(state, key).some(
      (enemy) => (enemy.hp ?? 1) > 0 && enemy.visibleToPlayer !== false,
    );
  }

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
    } else if (view.selectedUnitId && HasStrikeTargetAt(key)) {
      // 打击目标选取：点的是敌军/据点所在格时保住当前选中的部队，
      // 行动栏才能列出对该格的伏击/破袭/攻坚与攻击预览。
      // （此前这里会把 selectedUnitId 清空，点敌格等于取消选择，攻击通路点不出来。）
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
    OnSetSweepStance: (key) => {
      const before = state;
      state = Rules.SetSweepStance(state, key);
      if (state !== before) {
        audio.Play("Confirm");
        SyncAll();
      }
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
  window.PrairieFire = {
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

  return window.PrairieFire;
}

function SafeCall(callback) {
  try {
    return callback();
  } catch (error) {
    console.warn("[PrairieFire]", error);
    return null;
  }
}
