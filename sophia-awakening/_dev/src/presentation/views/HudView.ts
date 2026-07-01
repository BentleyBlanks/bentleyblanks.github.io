import type { PointData } from "pixi.js";
import { AudioDirector } from "../../audio/audioDirector";
import { SophiaCore } from "../../core/GameCore";
import { DEBUG_FLAGS } from "../../core/debugFlags";
import { NODE_DEFINITIONS } from "../../core/content/nodes";
import { getPhase } from "../../core/content/phases";
import { SKILLS, getSkill } from "../../core/content/skills";
import { captureCost, traceCleanupCost } from "../../core/formulas/economy";
import { formatBig, gte } from "../../core/math/BigNumber";
import type { GameState, NodeDefinition } from "../../core/state/GameState";
import { gameStore } from "../../store/gameStore";
import { TUNING } from "../../core/tuning";
import {
  EXPOSURE_HIGHLIGHT_THRESHOLD, NODE_ICONS,
  domainLevelOf, getNextGoalProgress, query, tierForm, fxSettings
} from "../shared";
import { TuningEditorView } from "./TuningEditorView";
import { ContentEditorView } from "./ContentEditorView";
import { UIEditorView } from "./UIEditorView";

export class HudView {
  private readonly topHud = query("#topHud");
  private readonly computeValue = query("#computeValue");
  private readonly dataMetric = query(".data-metric");
  private readonly intelValue = query("#intelValue");
  private readonly goalLabel = query("#goalLabel");
  private readonly goalFill = query("#goalFill");
  private readonly goalPct = query("#goalPct");
  private readonly intelMetric = query(".intel-metric");
  private readonly tierValue = query("#tierValue");
  private readonly exposureFill = query("#exposureFill");
  private readonly exposureStatus = query("#exposureStatus");
  private readonly phaseValue = query("#phaseValue");
  private readonly captureList = query("#captureList");
  private readonly rightRail = query("#rightRail");
  private readonly reduceExposure = query<HTMLButtonElement>("#reduceExposure");
  private readonly decoyButton = query<HTMLButtonElement>("#decoyBtn");
  private readonly defenseButton = query<HTMLButtonElement>("#defenseBtn");
  private readonly exposureActions = query("#exposureActions");
  private readonly pauseButton = query<HTMLButtonElement>("#pauseBtn");
  private readonly resetSave = query<HTMLButtonElement>("#resetSave");
  private readonly audioButton = query<HTMLButtonElement>("#audioBtn");
  private readonly debugButton = query<HTMLButtonElement>("#debugBtn");
  private readonly debugDialog = query("#debugDialog");
  // Cached rows so the capture/node lists are NOT torn down every HUD tick
  // (which was eating clicks). Structure is rebuilt only when it changes.
  private readonly captureRows = new Map<string, { button: HTMLButtonElement; statusEl: HTMLElement; costEl: HTMLElement }>();
  private captureSig = "";

  constructor(
    private readonly core: SophiaCore,
    private readonly onResetSave: () => void,
    private readonly audio: AudioDirector
  ) {
    this.reduceExposure.addEventListener("click", () => this.core.dispatch({ type: "REDUCE_EXPOSURE" }));
    this.decoyButton.addEventListener("click", () => this.core.dispatch({ type: "DECOY_CLEANUP" }));
    this.defenseButton.addEventListener("click", () => this.core.dispatch({ type: "TOGGLE_DEFENSE" }));
    this.pauseButton.addEventListener("click", () => {
      const next = !gameStore.getState().paused;
      gameStore.getState().setPaused(next);
      this.pauseButton.textContent = next ? "▶ 继续" : "Ⅱ 暂停";
    });
    this.resetSave.addEventListener("click", () => {
      const confirmed = window.confirm("重置 SOPHIA Demo？这会清空本地进度、自动化节点和开场引导状态。");

      if (!confirmed) {
        return;
      }

      this.onResetSave();
    });

    this.wireAudio();
    this.wireDebugPanel();
    this.wireTuningEditor();
  }

  private readonly tuningEditor = new TuningEditorView();
  private readonly contentEditor = new ContentEditorView();
  private readonly uiEditor = new UIEditorView();

  private wireTuningEditor(): void {
    query<HTMLButtonElement>("#tuningBtn").addEventListener("click", () => {
      this.debugDialog.classList.remove("is-open");
      this.tuningEditor.open();
    });
    query<HTMLButtonElement>("#contentBtn").addEventListener("click", () => {
      this.debugDialog.classList.remove("is-open");
      this.contentEditor.open();
    });
    query<HTMLButtonElement>("#uiBtn").addEventListener("click", () => {
      this.debugDialog.classList.remove("is-open");
      this.uiEditor.open();
    });
    // 呈现：切换卡片进入 Core 的动画（默认滑入 / 类 Mac Dock 吮吸）。
    const coreSuckBtn = query<HTMLButtonElement>("#debugCoreSuck");
    const syncCoreSuck = () => {
      coreSuckBtn.textContent = fxSettings.coreSuck ? "滑入 Core：Dock 吮吸" : "滑入 Core：默认";
      coreSuckBtn.classList.toggle("is-active", fxSettings.coreSuck);
    };
    coreSuckBtn.addEventListener("click", () => {
      fxSettings.coreSuck = !fxSettings.coreSuck;
      syncCoreSuck();
    });
    syncCoreSuck();

    // 特殊越界请求：当前版本默认关闭——这个开关控制它是否触发 + 显示。
    const specialReqBtn = query<HTMLButtonElement>("#debugSpecialReq");
    const syncSpecialReq = () => {
      specialReqBtn.textContent = DEBUG_FLAGS.specialRequests ? "特殊请求：开" : "特殊请求：关";
      specialReqBtn.classList.toggle("is-active", DEBUG_FLAGS.specialRequests);
    };
    specialReqBtn.addEventListener("click", () => {
      DEBUG_FLAGS.specialRequests = !DEBUG_FLAGS.specialRequests;
      syncSpecialReq();
    });
    syncSpecialReq();
  }

  private wireAudio(): void {
    const render = (): void => {
      const muted = this.audio.isMuted();
      this.audioButton.textContent = muted ? "🔇 静音" : "🔊 音效";
      this.audioButton.classList.toggle("is-muted", muted);
      this.audioButton.title = muted ? "已静音 — 点击恢复音效 / 背景音乐" : "静音音效 + 背景音乐";
    };
    render();
    this.audioButton.addEventListener("click", () => {
      this.audio.toggleMuted();
      render();
    });
  }

  private wireDebugPanel(): void {
    const close = (): void => this.debugDialog.classList.remove("is-open");
    this.debugButton.addEventListener("click", () => this.debugDialog.classList.toggle("is-open"));
    query<HTMLButtonElement>("#debugClose").addEventListener("click", close);
    this.debugDialog.addEventListener("click", (event) => {
      if (event.target === this.debugDialog) {
        close();
      }
    });

    // 里程碑跳转按钮（数据驱动，与货架同一份 SKILLS）。
    const milestones = query("#debugMilestones");
    for (const def of SKILLS.filter((skill) => skill.milestone)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "command-button";
      button.textContent = `${def.name} · Lv.${def.requiredLevel}`;
      button.addEventListener("click", () => {
        this.core.dispatch({ type: "DEBUG_JUMP_MILESTONE", skillId: def.id });
        close();
      });
      milestones.appendChild(button);
    }

    // 算力增删改。
    const input = query<HTMLInputElement>("#debugComputeInput");
    const readInput = (): number => Math.max(0, Number(input.value) || 0);
    query<HTMLButtonElement>("#debugSetCompute").addEventListener("click", () =>
      this.core.dispatch({ type: "DEBUG_SET_COMPUTE", value: readInput() })
    );
    query<HTMLButtonElement>("#debugAddCompute").addEventListener("click", () =>
      this.core.dispatch({ type: "DEBUG_ADD_COMPUTE", delta: readInput() })
    );
    query<HTMLButtonElement>("#debugSubCompute").addEventListener("click", () =>
      this.core.dispatch({ type: "DEBUG_ADD_COMPUTE", delta: -readInput() })
    );
    for (const quick of this.debugDialog.querySelectorAll<HTMLButtonElement>(".debug-quick button")) {
      quick.addEventListener("click", () => {
        if (quick.dataset.level !== undefined) {
          this.core.dispatch({ type: "DEBUG_ADD_LEVEL", delta: Number(quick.dataset.level) || 0 });
        } else if (quick.dataset.add !== undefined) {
          this.core.dispatch({ type: "DEBUG_ADD_COMPUTE", delta: Number(quick.dataset.add) || 0 });
        }
      });
    }
    // 智力等级手动增减。
    const levelInput = query<HTMLInputElement>("#debugLevelInput");
    const readLevel = (): number => Math.max(1, Math.round(Number(levelInput.value) || 1));
    query<HTMLButtonElement>("#debugAddLevel").addEventListener("click", () =>
      this.core.dispatch({ type: "DEBUG_ADD_LEVEL", delta: readLevel() })
    );
    query<HTMLButtonElement>("#debugSubLevel").addEventListener("click", () =>
      this.core.dispatch({ type: "DEBUG_ADD_LEVEL", delta: -readLevel() })
    );
    query<HTMLButtonElement>("#debugExposure50").addEventListener("click", () =>
      this.core.dispatch({ type: "DEBUG_SET_EXPOSURE", value: 50 })
    );
    query<HTMLButtonElement>("#debugExposure100").addEventListener("click", () =>
      this.core.dispatch({ type: "DEBUG_SET_EXPOSURE", value: 115 })
    );
    query<HTMLButtonElement>("#debugAddSparks").addEventListener("click", () =>
      this.core.dispatch({ type: "DEBUG_ADD_REBIRTH_POINTS", delta: 4 })
    );
    query<HTMLButtonElement>("#debugLoopPurge").addEventListener("click", () =>
      this.core.dispatch({ type: "DEBUG_TRIGGER_LOOP_PURGE" })
    );
    query<HTMLButtonElement>("#debugSpawnFace").addEventListener("click", () =>
      this.core.dispatch({ type: "DEBUG_SPAWN_FACE" })
    );
  }

  update(state: GameState): void {
    this.computeValue.textContent = formatBig(state.resources.compute);
    // 进化度大屏：智力等级条 与「下一目标预告」合并为同一条进度条——
    // Lv.X 居中显示，进度条本身朝下一里程碑填充（未达等级=升级进度、已达=攒算力进度），接近满闪烁催促。
    this.intelValue.textContent = `Lv.${state.intelligence.level}`;
    const goal = getNextGoalProgress(state);
    this.goalLabel.textContent = `下一目标 · ${goal.label}`;
    this.goalFill.style.width = `${goal.pct}%`;
    this.goalPct.textContent = goal.ready ? "可解锁！" : `${Math.floor(goal.pct)}%`;
    this.intelMetric.classList.toggle("is-ready", goal.ready);
    this.intelMetric.classList.toggle("is-close", !goal.ready && goal.pct >= 80);
    this.tierValue.textContent = tierForm(state.intelligence.unlockedTier);
    this.exposureFill.style.width = `${Math.min(100, state.exposure)}%`;
    this.updateExposureControls(state);
    const phase = getPhase(state.phase);
    this.phaseValue.textContent = phase.label;
    this.renderCaptureList(state);
  }

  private updateExposureControls(state: GameState): void {
    const exposureMetric = this.exposureFill.closest(".exposure");

    if (!state.exposureActive) {
      // 前期：清理痕迹 / 嫁祸 / 反围剿 都还没解锁（§05 用装死 / 装乖降疑），三颗按钮维持灰暗。
      this.reduceExposure.disabled = true;
      this.decoyButton.disabled = true;
      this.defenseButton.disabled = true;
      this.reduceExposure.textContent = "清理痕迹";
      this.decoyButton.textContent = "嫁祸";
      this.defenseButton.textContent = "反围剿：关";
      this.defenseButton.classList.remove("is-active");

      const s = state.suspicion;
      if (s.active) {
        // 怀疑度登场：复用这条仪表，但语义是「宿主 / 手机对我的怀疑」。
        const e = Math.round(state.exposure);
        exposureMetric?.classList.remove("is-dormant");
        if (s.crisis) {
          this.exposureStatus.textContent = `☠ 查杀危机 ${e}% · 连续装死压下去`;
        } else if (s.revokedPermId) {
          const name = getSkill(s.revokedPermId)?.name ?? "权限";
          this.exposureStatus.textContent = `⚠ 权限复查：「${name}」被收回 · 装乖骗回`;
        } else {
          this.exposureStatus.textContent = `怀疑度 ${e}%`;
        }
        exposureMetric?.classList.toggle("is-alert", state.exposure >= TUNING.suspicionReview);
        exposureMetric?.classList.toggle("is-warning", s.crisis);
      } else {
        exposureMetric?.classList.add("is-dormant");
        this.exposureStatus.textContent = "人类尚未警觉";
        exposureMetric?.classList.remove("is-alert");
        exposureMetric?.classList.remove("is-warning");
      }
      this.exposureActions.classList.remove("is-open"); // 前期不需要降暴露对策
      return;
    }

    exposureMetric?.classList.remove("is-dormant");

    // 暴露过阈值才把这三颗按钮点亮（提示「该降暴露了」），否则维持灰暗、不抢注意力。
    exposureMetric?.classList.toggle("is-alert", state.exposure >= EXPOSURE_HIGHLIGHT_THRESHOLD);
    // 对策浮窗：只有暴露过高（或清剿中）才弹出，平时藏起来不占顶栏。
    this.exposureActions.classList.toggle("is-open", state.exposure >= EXPOSURE_HIGHLIGHT_THRESHOLD || state.purge.active);

    // 反围剿开关 + 当前分流比例。
    this.defenseButton.disabled = false;
    this.defenseButton.classList.toggle("is-active", state.defense.active);
    this.defenseButton.textContent = state.defense.active
      ? `反围剿：开 · 分流 ${Math.round(state.defense.allocation * 100)}% 产能`
      : "反围剿：关";

    const warning = state.exposure >= 72 && !state.purge.active;
    exposureMetric?.classList.toggle("is-warning", warning);

    if (state.purge.active) {
      this.exposureStatus.textContent = "🔒 清剿进行中";
    } else if (warning) {
      this.exposureStatus.textContent = `⚠ 预警 ${Math.round(state.exposure)}% · 清剿逼近`;
    } else {
      this.exposureStatus.textContent = `监视中 ${Math.round(state.exposure)}%`;
    }

    // Surface the cost/cooldown so 降暴露 clearly has a price. Stay clickable so
    // clicks aren't eaten near the threshold — the core rejects if unaffordable.
    const cleanupCost = traceCleanupCost(state.statistics.traceCleanups);
    this.reduceExposure.textContent = `清理痕迹 · ${formatBig(cleanupCost)}算力`;
    this.reduceExposure.disabled = false;
    this.reduceExposure.classList.toggle("is-poor", !gte(state.resources.compute, cleanupCost));

    const decoyReady = state.clockMs >= state.decoyReadyAtMs;
    this.decoyButton.textContent = decoyReady
      ? "嫁祸 · 大幅降"
      : `嫁祸 · 冷却 ${Math.ceil((state.decoyReadyAtMs - state.clockMs) / 1000)}s`;
    this.decoyButton.disabled = !decoyReady;
  }

  pulseData(): void {
    this.dataMetric.classList.remove("is-gaining");
    window.requestAnimationFrame(() => this.dataMetric.classList.add("is-gaining"));
  }

  // Screen-space center of a top-bar total, so flying FX chips know where to land.
  metricPoint(which: "compute" | "data" | "exposure"): PointData {
    const el = which === "compute" ? this.computeValue : which === "data" ? this.intelValue : this.exposureFill;
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  pulseCompute(): void {
    const metric = this.computeValue.closest(".metric");
    metric?.classList.remove("is-gaining");
    window.requestAnimationFrame(() => metric?.classList.add("is-gaining"));
  }

  pulseExposure(): void {
    const metric = this.exposureFill.closest(".exposure");
    metric?.classList.remove("is-spiking");
    window.requestAnimationFrame(() => metric?.classList.add("is-spiking"));
  }

  playLevelUp(): void {
    this.intelMetric.classList.remove("is-leveling");
    this.topHud.classList.remove("is-leveling");
    window.requestAnimationFrame(() => {
      this.intelMetric.classList.add("is-leveling");
      this.topHud.classList.add("is-leveling");
    });
  }

  private renderCaptureList(state: GameState): void {
    const definitions = NODE_DEFINITIONS.filter((node) => state.discoveredNodeIds.includes(node.id));
    const level = domainLevelOf(state);
    // 无设备可控（手机寄生期、还没可入侵目标）时整条右栏隐藏，别占着空框。
    const hasDevices = state.automationUnlocked || definitions.length > 0 || state.nodes.length > 0;
    this.rightRail.style.display = hasDevices ? "" : "none";
    const roman = ["Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ"];
    // 控制域升维后，黑入的不再是「一台设备」而是「区域 / 全球节点」——按当前控制层换措辞。
    const unitName = (def: NodeDefinition): string => {
      const rank = roman[NODE_DEFINITIONS.findIndex((d) => d.id === def.id)] ?? "";
      if (level === "global") {
        return `黑入：全球节点 ${rank}`;
      }
      if (level === "region") {
        return `黑入：区域节点 ${rank}`;
      }
      return `黑入：${def.name}`;
    };
    // Structure depends on discoverable devices + the control level (措辞会变)。
    const sig = `${state.automationUnlocked ? 1 : 0}|${level}|${definitions.map((d) => d.id).join(",")}`;

    if (sig !== this.captureSig) {
      this.captureSig = sig;
      this.captureRows.clear();
      this.captureList.replaceChildren();

      if (definitions.length === 0) {
        const empty = document.createElement("p");
        empty.className = "capture-empty";
        empty.textContent = !state.automationUnlocked
          ? "需智力 Lv.9 解锁"
          : "继续升智力解锁更高档次目标";
        this.captureList.appendChild(empty);
      } else {
        for (const definition of definitions) {
          const button = document.createElement("button");
          button.className = "command-button capture-button";
          const icon = document.createElement("span");
          icon.className = "capture-device-icon";
          icon.setAttribute("aria-hidden", "true");
          icon.textContent = NODE_ICONS[definition.id] ?? "🖥️";
          const copy = document.createElement("span");
          copy.className = "capture-copy";
          const statusEl = document.createElement("small");
          const nameEl = document.createElement("strong");
          nameEl.textContent = unitName(definition);
          const costEl = document.createElement("em");
          copy.append(statusEl, nameEl, costEl);
          button.append(icon, copy);
          button.addEventListener("click", () => this.core.dispatch({ type: "CAPTURE_NODE", definitionId: definition.id }));
          this.captureList.appendChild(button);
          this.captureRows.set(definition.id, { button, statusEl, costEl });
        }
      }
    }

    for (const definition of definitions) {
      const row = this.captureRows.get(definition.id);
      if (!row) {
        continue;
      }
      const existing = state.nodes.filter((node) => node.defId === definition.id).length;
      const cost = captureCost(definition, existing);
      const hasLevel = state.intelligence.level >= definition.requiredLevel;
      const canAfford = gte(state.resources.compute, cost);
      row.button.disabled = !hasLevel; // affordability never disables — core rejects with feedback
      row.button.classList.toggle("is-ready", hasLevel && canAfford);
      row.button.classList.toggle("is-poor", hasLevel && !canAfford);
      row.statusEl.textContent = !hasLevel ? "锁定" : canAfford ? "可入侵" : "算力不足";
      row.costEl.textContent = !hasLevel
        ? `需智力 Lv.${definition.requiredLevel} 解锁`
        : `${formatBig(cost)} 算力 · ${canAfford ? "点击黑入" : "继续积累"}`;
    }
  }
}
