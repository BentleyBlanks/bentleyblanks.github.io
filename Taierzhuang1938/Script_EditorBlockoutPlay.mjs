// 白盒试玩（docs/Data_EditorBlockout.md §17，2026-10-31）：编辑器里选一段关键帧，按下就从这一帧开打。
//
// 规则（哪一步怎么打、谁变 AI、什么算过关）全在 Script_EditorBlockoutPlayPlan（纯函数）；这里只管跑：
//   · 读 Blockout/<Level>.play.json（可选，404 = 全按推断）；编辑器每 2 s 轮询时顺手查一次，试玩中改的下一次开打生效。
//   · 开打：玩家按本关的携行重新领一遍装备、回满血（宿主 ResetPlayer），摆到第一步的机位；无敌 / 无限子弹按面板开关
//     （宿主读 PlayOverrides，不写调试存档）。
//   · 每一步：fight —— 先走到这一步的玩家站位（第一步直接摆过去），到了把这一帧的日军按数据放成真 AI
//     （AiDirector.Spawn，守点 hold 或往玩家压 advance），同一个人跨步还活着就留着、挪守点；打死的人后面的步不再出现；
//     move —— 走到目标点；watch —— 有预演就播（N / Esc 跳过），没有就停几秒。友军、战车、倒地的、掷弹筒组照旧是编辑器的演员
//     （总控经 FilterPuppets 把变成 AI 的人从演员里摘掉）。
//   · 过关看 PlayStepCleared；过了停 clearPauseS 秒进下一步；玩家倒下 / 打完 / 按 K 中止 → 收兵、出小结。
//   · 掷弹筒（step.mortar）：从那个演员的位置往玩家身边打 Combat.FireShell（啸声、落地爆炸都走游戏那一套，会炸死人）。
//
// 界面（同编辑器的 .boRoot 一套样式，Style_EditorBlockout.css「白盒试玩」一节）：
//   卡片右上「试玩」按钮 / K 打开设置面板（段落预设、起止关键帧、无敌 / 无限子弹 / 播过场三个开关、「开打」）；
//   试玩中顶部一条：第几步 · 站位名 · 目标 · 距离 · 剩几个敌人 · 用时 · 结束（K）；打完出小结（每一步用时、结果，
//   掉血、打死几个），「再来一遍 / 从这一步重来 / 回到编辑」。界面文字是编辑器自用的中文（Script_Editor* 不进文本门禁）。

import * as THREE from "three";
import {
  BLOCKOUT_PLAY, NormalizeBlockoutPlay, ValidateBlockoutPlay, PlayStepPlan, PlayStepCleared, PlayRange, FormatPlayTime,
} from "./Script_EditorBlockoutPlayPlan.mjs";
import { SpeakingCastOptions } from "./Data_FirstLevelSpeakingCast.mjs";
import { WEAPONS } from "./Data_Weapons.mjs";

export const PLAY_KEY = "KeyK";
const DEG = Math.PI / 180;
/** 试玩编排文件不在时，隔多久再查一次（秒）。 */
const PLAY_ABSENT_RECHECK_S = 30;
const RESULT_TEXT = Object.freeze({ done: "打完了", dead: "阵亡", abort: "中止" });
const STEP_RESULT_TEXT = Object.freeze({ kill: "打退", reach: "到位", time: "撑住", watch: "看完", previz: "看完", skip: "跳过", dead: "阵亡", abort: "中止" });
const MODE_TEXT = Object.freeze({ fight: "打", move: "走", watch: "看", skip: "跳" });

const SVG = (body) => `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICON_PLAY = SVG('<circle cx="8" cy="8" r="5.3"/><path d="M8 1.4v3.2M8 11.4v3.2M1.4 8h3.2M11.4 8h3.2"/><circle cx="8" cy="8" r="1" fill="currentColor" stroke="none"/>');
const ICON_CLOSE = SVG('<path d="M4 4l8 8M12 4l-8 8"/>');

function El(tag, className = "", text = "") {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

function Button(className, text = "", { icon = "", tip = "" } = {}) {
  const b = El("button", `boBtn ${className}`.trim());
  b.type = "button";
  if (icon) b.innerHTML = icon;
  if (text) b.appendChild(El("span", "boBtnText", text));
  if (tip) { b.dataset.tip = tip; b.setAttribute("aria-label", tip); }
  return b;
}

/** 本会话的随机（掷弹筒落点散布）：不用 Math.random，开打时按种子起，同一段每次散布一样好复现。 */
function Mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class BlockoutPlay {
  constructor(editor) {
    this.editor = editor;
    this.doc = null;            // 归一化后的试玩编排（没有文件 = 空编排）
    this.text = null;
    this.levelKey = "";
    this.present = false;
    this.validation = null;
    this.lastCheckMs = -Infinity;
    this.loading = false;
    this.settings = { invincible: false, infiniteAmmo: false, previz: true, from: null, to: null };
    this.settingsLevel = "";
    this.run = null;            // 正在打的那一段（见 Start）
    this.summary = null;        // 小结（打完 / 阵亡 / 中止后留着，直到回到编辑或再来一遍）
    this.panelOpen = false;
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this.BuildDom();
  }

  get game() { return this.editor.game; }
  get host() { return this.editor.host; }
  /** 正在打（含倒下后等小结的那两秒）。 */
  get active() { return !!this.run; }
  /** 试玩占着编辑器：正在打或者小结还开着（导航栏、翻关键帧、预演键、飞行都不理）。 */
  get locked() { return !!this.run || !!this.summary; }

  // -------------------------------------------------------------------------
  // 读文件

  async Load({ force = false } = {}) {
    const editor = this.editor, levelKey = editor.levelKey;
    if (levelKey !== this.levelKey) { this.levelKey = levelKey; this.text = null; this.doc = null; this.present = false; force = true; }
    this.lastCheckMs = performance.now();
    let result;
    try { result = await editor.store.Load(`${levelKey}.play`, { knownText: force ? undefined : this.text ?? undefined }); }
    catch (error) { return this.present; }
    if (levelKey !== editor.levelKey) return false;
    if (result.state === "same") return this.present;
    if (result.state === "missing") { this.Swap(null, null, null); return false; }
    if (result.state !== "ok") { this.validation = { ok: false, errors: [result.message], warnings: [] }; this.text = result.text ?? this.text; return this.present; }
    const check = ValidateBlockoutPlay(result.doc, { config: editor.doc });
    if (!check.ok) console.warn(`[BlockoutPlay] ${levelKey}.play.json 有 ${check.errors.length} 处错误，这一份不用，按关键帧推断：`, check.errors.slice(0, 6));
    else if (check.warnings.length) console.warn(`[BlockoutPlay] ${levelKey}.play.json 有 ${check.warnings.length} 处提醒：`, check.warnings.slice(0, 6));
    this.Swap(check.ok ? result.doc : null, result.text, check);
    return true;
  }

  Swap(doc, text, validation) {
    this.doc = NormalizeBlockoutPlay(doc);
    this.text = text;
    this.present = !!doc;
    this.validation = validation;
    // 换关（或第一次读到）：开关取这份编排的缺省
    if (this.settingsLevel !== this.levelKey) {
      this.settingsLevel = this.levelKey;
      Object.assign(this.settings, this.doc.defaults, { from: null, to: null });
    }
    if (this.panelOpen) this.RenderPanel();
  }

  /** 总控每 2 s 轮询时调；配置变了要重新核对点名。 */
  Poll({ configChanged = false } = {}) {
    if (this.loading) return;
    const due = this.present || configChanged || performance.now() - this.lastCheckMs >= PLAY_ABSENT_RECHECK_S * 1000;
    if (!due) return;
    this.loading = true;
    this.Load({ force: configChanged }).finally(() => { this.loading = false; });
  }

  Plan() { return this.doc || NormalizeBlockoutPlay(null); }

  // -------------------------------------------------------------------------
  // 宿主与总控读的几样

  /** 宿主（Script_Main）读：试玩中玩家无不无敌、子弹有没有数。null = 不在试玩（编辑器照旧无敌、无限子弹）。 */
  Overrides() {
    if (!this.run) return null;
    return { invincible: !!this.run.settings.invincible, infiniteAmmo: !!this.run.settings.infiniteAmmo };
  }

  /** 总控摆演员前过一遍：变成 AI 的人、打死的人不再摆演员。 */
  FilterPuppets(units) {
    const run = this.run;
    if (!run || !Array.isArray(units)) return units;
    return units.filter(u => !run.soldiers.has(u.id) && !run.killed.has(u.id) && !run.step?.aiIds.has(u.id));
  }

  CapturesMouse() { return this.panelOpen || !!this.summary; }

  // -------------------------------------------------------------------------
  // 开打 / 收场

  /** 打一段：from / to 是关键帧 id 或下标（缺省 = 面板上选的；面板没选 = 当前帧打到底）。→ 成没成 */
  Start({ from = null, to = null, settings = null } = {}) {
    const editor = this.editor;
    if (!editor.doc || editor.rebuilding || editor.switching) return false;
    if (this.run) this.Finish("abort", { summary: false });
    this.CloseSummary({ restore: false });
    if (editor.previz?.playing) editor.previz.Stop({ restore: false });
    editor.ExitFly?.({ quiet: true });
    editor.ToggleMap?.(false);
    const s = { ...this.settings, ...(settings || {}) };
    const indices = PlayRange(editor.doc, from ?? s.from ?? editor.index, to ?? s.to ?? null);
    if (!indices.length) { editor.ui.Toast("试玩的起止关键帧对不上", "warn"); return false; }
    this.ClosePanel();
    const seed = indices[0] * 7919 + indices.length * 131 + 17;
    this.run = {
      indices, cursor: -1, settings: { invincible: !!s.invincible, infiniteAmmo: !!s.infiniteAmmo, previz: s.previz !== false },
      soldiers: new Map(), corpses: [], killed: new Set(), step: null, phase: "", phaseT: 0, stepT: 0, engageT: 0, totalT: 0,
      stepKills: 0, stepSpawned: new Set(), kills: 0, damage: 0, log: [], lastHealth: null, mortarT: 0, rnd: Mulberry32(seed),
      deadAt: null, previzToken: 0, hudKey: "",
    };
    // 先登记 run（宿主的 ApplyDebugOptions 读 Overrides），再按本关携行重新领装备、回满血
    this.game.ResetPlayer?.();
    this.game.ApplyDebugOptions?.();
    this.run.lastHealth = this.game.player?.health ?? null;
    editor.markers.SetPois([]);
    editor.markers.SetStations([], -1);
    document.body.classList.add("blockoutPlay");
    this.hud.hidden = false;
    this.EnterStep(0);
    return true;
  }

  /** 进第 cursor 步（范围里的第几个）。 */
  EnterStep(cursor) {
    const run = this.run, editor = this.editor;
    if (!run) return;
    if (cursor >= run.indices.length) { this.Finish("done"); return; }
    const first = cursor === 0;
    const prevIndex = run.step?.index ?? -1;
    run.cursor = cursor;
    const index = run.indices[cursor];
    const step = PlayStepPlan(editor.doc, index, this.Plan(), { killed: run.killed, first });
    run.step = step;
    run.stepT = 0; run.engageT = 0; run.phaseT = 0; run.stepKills = 0; run.stepSpawned = new Set();
    run.mortarT = step.mortar ? step.mortar.firstS : 0;
    run.hudKey = "";
    // 上一步留下的活人：这一步还有他 → 留着（Engage 里挪守点）；没有他 / 这一步是看戏 → 撤场
    for (const [id, soldier] of run.soldiers) {
      if (!soldier.alive) continue;
      if (step.mode !== "fight" || !step.aiIds.has(id)) this.RemoveSoldier(id);
    }
    if (step.mode === "skip") { this.LogStep("skip"); this.EnterStep(cursor + 1); return; }
    if (step.mode === "watch" && run.settings.previz && step.previz && editor.previz?.Has(index)) {
      run.phase = "previz";
      const token = ++run.previzToken;
      editor.previz.Play(index).then(() => {
        if (this.run !== run || run.previzToken !== token || run.phase !== "previz") return;
        this.LogStep("previz");
        this.EnterStep(cursor + 1);
      });
      this.UpdateHud(true);
      return;
    }
    const teleport = first || step.mode === "watch";
    editor.GoTo(index, { animate: !teleport && index === prevIndex + 1, keepPlayer: !teleport });
    editor.markers.SetPois([]);
    editor.markers.SetStations([], -1);
    if (step.mode === "watch") { run.phase = "watch"; editor.markers.SetNext(null); }
    else if (step.approach && this.DistanceTo(this.StationOf(step)) > step.approachM) {
      run.phase = "approach";
      const p = this.StationOf(step);
      editor.markers.SetNext({ x: p.x, z: p.z, text: step.name, radiusM: step.approachM });
    } else this.Engage();
    if (!first || step.mode !== "fight") editor.ui.Toast(`${step.label} · ${step.name}`, "info");
    this.UpdateHud(true);
  }

  /** approach 段走到了（或不用走）：放兵、开始算过关。 */
  Engage() {
    const run = this.run, step = run.step;
    run.phase = "engage";
    run.engageT = 0;
    if (step.mode === "fight") {
      for (const spec of step.ai) {
        const have = run.soldiers.get(spec.id);
        if (have?.alive) { this.Order(have, spec, step); run.stepSpawned.add(spec.id); continue; }
        const soldier = this.SpawnSoldier(spec, step);
        if (soldier) run.stepSpawned.add(spec.id);
      }
    }
    // 开打就让日军知道人在哪（step.alert，缺省开）：等 alertDelayS 秒（刚放出来的人感知还没挂上，报了也记不住）再报，之后每 alertEveryS 秒报一次
    run.alertAt = step.mode === "fight" && step.alert && run.stepSpawned.size > 0 ? BLOCKOUT_PLAY.alertDelayS : Infinity;
    const reach = step.clear.reach;
    this.editor.markers.SetNext(reach ? { x: reach.x, z: reach.z, text: step.objective, radiusM: reach.r } : null);
    this.UpdateHud(true);
  }

  SpawnSoldier(spec, step) {
    const ai = this.game.ai;
    if (!ai) return null;
    const cast = spec.castId ? SpeakingCastOptions(spec.castId) : {};
    const soldier = ai.Spawn("ija", spec.x, spec.z, {
      weapon: spec.weapon,
      squadId: `BlockoutPlay_${step.id}_${spec.group || "solo"}`,
      ry: (spec.yawDeg || 0) * DEG,
      ...cast,
    });
    if (!soldier) { console.warn(`[BlockoutPlay] ${spec.id} 放不出来（人数到上限 ${ai.maxAlive}？）`); return null; }
    // fresh 步：同一个 id 前面死过，尸体留在场上，收场时一起撤
    const old = this.run.soldiers.get(spec.id);
    if (old && old !== soldier) this.run.corpses.push(old);
    soldier.blockoutPlayId = spec.id;
    this.SnapToSpot(soldier, spec.x, spec.z);
    if (spec.bayonet) soldier.bayonetFixed = true;
    this.Order(soldier, spec, step);
    this.run.soldiers.set(spec.id, soldier);
    return soldier;
  }

  /**
   * 放回关键帧摆的位置。AiDirector.Spawn 用站立胶囊（半径 0.34、高 1.78）找空地，窄沟的斜壁会被当成「站不下」，
   * 一圈圈往外挪到沟沿上（实测 02-4 的追兵一放出来就站在沟沿上）。这里照编辑器摆玩家的口径（细一点、矮一点的探针，
   * 膝盖以上真埋进墙才挪，0.1 m 一圈往外找）把人挪回原位。
   */
  SnapToSpot(soldier, x, z) {
    const physics = this.game.physics;
    if (!physics?.GroundProbe || !physics.Overlaps) return;
    if (Math.hypot(soldier.position.x - x, soldier.position.z - z) < 0.3) return;
    const ground = this.editor.groundAt(x, z);
    let y = physics.GroundProbe(x, z, ground + 0.3, 1.2, 4).y;
    // 探针同编辑器 BLOCKOUT_EDITOR.freeSpotRadius / freeSpotHeight（这里不反向 import 总控）
    if (physics.Overlaps(x, y + 0.35, z, 0.2, 1.2)) {
      const near = this.editor.NudgeFree?.(physics, x, z);
      if (!near) return;
      x = near.x; z = near.z; y = near.y;
    }
    soldier.position.set(x, y, z);
    soldier.body?.Teleport?.(x, y, z);
    soldier.goal.set(x, 0, z);
    soldier.actor?.root.position.copy(soldier.position);
  }

  /** 守点 / 往玩家压（同第一关任务运行时的 hold 写法：order + holdZone）。 */
  Order(soldier, spec, step) {
    if (spec.order === "advance") {
      soldier.order = "advance";
      soldier.holdZone = null;
      const p = this.game.player?.position;
      // 先朝玩家那边去几秒（导航网格按沟里的隐形墙排路，不翻沟沿），之后交给班组自己追
      if (p) { soldier.goal.set(p.x, 0, p.z); soldier.manualGoalUntil = (this.game.ai?.time ?? 0) + 6; }
    } else {
      soldier.order = "hold";
      soldier.holdZone = { id: `BlockoutPlay_${spec.id}`, x: spec.x, z: spec.z, radius: step.holdM };
      soldier.goal.set(spec.x, 0, spec.z);
    }
  }

  RemoveSoldier(id) {
    const run = this.run, soldier = run?.soldiers.get(id);
    if (!soldier) return;
    run.soldiers.delete(id);
    try { this.game.ai?.Remove(soldier); } catch (error) { console.warn("[BlockoutPlay] 收兵失败", id, error); }
  }

  /** 收场：撤掉所有放出来的兵（活的、死的），还原编辑器；summary 为真时出小结。 */
  Finish(result, { summary = true } = {}) {
    const run = this.run, editor = this.editor;
    if (!run) return;
    if (run.phase === "previz" && editor.previz?.playing) { run.previzToken += 1; editor.previz.Stop({ restore: false }); }
    if (result !== "done" && run.step && !run.log.some(entry => entry.cursor === run.cursor)) this.LogStep(result);
    for (const id of [...run.soldiers.keys()]) this.RemoveSoldier(id);
    for (const corpse of run.corpses) { try { this.game.ai?.Remove(corpse); } catch (error) { /* 已撤 */ } }
    run.corpses.length = 0;
    this.run = null;
    // 倒下了：马上换人（宿主的换人计时撤掉、阵亡卡收起），不然宿主自己换人会把人送回关卡出生点；
    // 宿主的阵亡卡可能比小结先到点、已经换过人了，所以按结果认，不按此刻活没活
    const dead = result === "dead";
    if (this.game.player?.alive === false) this.game.ResetPlayer?.();
    this.game.ApplyDebugOptions?.();
    document.body.classList.remove("blockoutPlay");
    this.hud.hidden = true;
    editor.markers.SetNext(null);
    if (!summary) { this.Restore(run.step?.index ?? editor.index); return; }
    this.summary = {
      result, indices: run.indices, failedCursor: result === "done" ? -1 : run.cursor, failedIndex: run.step?.index ?? -1,
      totalT: run.totalT, kills: run.kills, damage: run.damage, log: run.log, settings: run.settings,
    };
    // 摆回这一步的关键帧（演员、信号都回来）；玩家留在原地看小结，倒下的摆回这一步的机位
    editor.GoTo(run.step?.index ?? editor.index, { animate: false, keepPlayer: !dead });
    editor.ReleasePointerLock?.();
    this.RenderSummary();
  }

  /** 回到编辑：摆回某个关键帧（含玩家机位）。 */
  Restore(index) {
    const editor = this.editor;
    if (editor.doc && index >= 0) editor.GoTo(index, { animate: false });
  }

  CloseSummary({ restore = true } = {}) {
    const summary = this.summary;
    if (!summary) return;
    this.summary = null;
    this.summaryEl.hidden = true;
    if (restore) this.Restore(summary.failedIndex >= 0 ? summary.failedIndex : summary.indices[summary.indices.length - 1]);
  }

  // -------------------------------------------------------------------------
  // 每帧（总控在演员层之后调）

  Update(dt) {
    const run = this.run;
    if (!run) return;
    run.totalT += dt;
    run.stepT += dt;
    run.phaseT += dt;
    const player = this.game.player;
    // 掉血：每帧比一次（无敌时宿主把血顶回 100，不算）
    if (player && Number.isFinite(player.health)) {
      if (Number.isFinite(run.lastHealth) && player.health < run.lastHealth) run.damage += run.lastHealth - player.health;
      run.lastHealth = player.health;
    }
    // 打死的人：记账（同一个人后面的步不再出现）
    for (const [id, soldier] of run.soldiers) {
      if (soldier.alive || soldier.blockoutPlayCounted) continue;
      soldier.blockoutPlayCounted = true;
      run.killed.add(id);
      run.kills += 1;
      if (run.stepSpawned.has(id)) run.stepKills += 1;
    }
    if (run.phase === "dead") {
      if (run.phaseT >= BLOCKOUT_PLAY.deathSummaryS) this.Finish("dead");
      return;
    }
    if (player && player.alive === false) {
      run.phase = "dead";
      run.phaseT = 0;
      run.deadAt = run.step?.index ?? null;
      this.UpdateHud(true);
      return;
    }
    const step = run.step;
    if (!step) return;
    if (run.phase === "approach") {
      if (this.DistanceTo(this.StationOf(step)) <= step.approachM) this.Engage();
    } else if (run.phase === "engage") {
      run.engageT += dt;
      if (run.engageT >= run.alertAt) {
        run.alertAt = run.engageT + BLOCKOUT_PLAY.alertEveryS;
        // 走 AI 自己的听觉入口，同玩家在原地开了一枪：远处守点的机枪、跃进组也记下人在哪、转过来找。
        // 听来的觉察会消退（十来秒就回到没察觉），玩家自己的枪声只传 150 m，所以开打期间隔一阵报一次 = 「坑里一直在开火」
        this.game.ai?.NoteStimulus?.("gunshot", player.position, { side: "nra", isPlayer: true, ref: player, loudnessM: BLOCKOUT_PLAY.alertLoudnessM });
      }
      this.UpdateMortar(dt);
      const reason = PlayStepCleared(step.clear, {
        kills: run.stepKills, spawned: run.stepSpawned.size, alive: this.AliveOf(run.stepSpawned), elapsedS: run.engageT, player: player?.position,
      });
      if (reason) {
        run.phase = "cleared"; run.phaseT = 0;
        this.LogStep(reason);
        this.editor.ui.Toast(`${STEP_RESULT_TEXT[reason] || "过了"}：${step.label} · ${step.name}`, "ok");
      }
    } else if (run.phase === "watch") {
      if (run.phaseT >= step.watchS) { this.LogStep("watch"); this.EnterStep(run.cursor + 1); return; }
    } else if (run.phase === "cleared") {
      if (run.phaseT >= BLOCKOUT_PLAY.clearPauseS) { this.EnterStep(run.cursor + 1); return; }
    }
    this.UpdateHud(false);
  }

  UpdateMortar(dt) {
    const run = this.run, mortar = run.step?.mortar, combat = this.game.combat, player = this.game.player;
    if (!mortar || !combat?.FireShell || !player) return;
    run.mortarT -= dt;
    if (run.mortarT > 0) return;
    run.mortarT = mortar.everyS;
    // 打的人：还在场上的那几个掷弹筒演员里轮着挑
    const live = this.editor.puppets.Live().filter(p => mortar.from.includes(p.id));
    if (!live.length) return;
    const from = live[Math.floor(run.rnd() * live.length) % live.length];
    const a = run.rnd() * Math.PI * 2, r = Math.sqrt(run.rnd()) * mortar.spreadM;
    const tx = player.position.x + Math.cos(a) * r, tz = player.position.z + Math.sin(a) * r;
    const groundAt = this.editor.groundAt;
    this._v.set(from.x, groundAt(from.x, from.z) + 0.6, from.z);
    this._w.set(tx, groundAt(tx, tz), tz);
    const weapon = WEAPONS.Type89Launcher;
    combat.FireShell(this._v, this._w, { flight: mortar.flightS, kind: "Shell50", radius: weapon.radiusM, damage: weapon.damage, report: true });
  }

  LogStep(result) {
    const run = this.run, step = run?.step;
    if (!step) return;
    run.log.push({ cursor: run.cursor, index: step.index, id: step.id, label: step.label, name: step.name, mode: step.mode, timeS: run.stepT, result, kills: run.stepKills });
  }

  AliveOf(ids) {
    let n = 0;
    for (const id of ids) if (this.run.soldiers.get(id)?.alive) n += 1;
    return n;
  }

  StationOf(step) { return this.editor.doc.keyframes[step.index].player; }

  DistanceTo(p) {
    const q = this.game.player?.position;
    if (!p || !q) return Infinity;
    return Math.hypot(q.x - p.x, q.z - p.z);
  }

  // -------------------------------------------------------------------------
  // 界面

  BuildDom() {
    const ui = this.editor.ui;
    // 卡片右上的「试玩」按钮（排在预演按钮前面）
    this.btn = Button("boIconBtn boPlayBtn", "", { icon: ICON_PLAY, tip: "试玩：从这一帧开打（K）" });
    this.btn.dataset.tipSide = "left";
    this.btn.addEventListener("click", () => this.TogglePanel());
    ui.btnPreviz.parentNode.insertBefore(this.btn, ui.btnPreviz);

    const stop = (e) => { if (e.type === "keydown") this.OnKey(e); e.stopPropagation(); };
    const wire = (el) => { for (const type of ["mousedown", "wheel", "keydown", "contextmenu", "click", "dblclick"]) el.addEventListener(type, stop); return el; };

    // 设置面板
    this.panel = wire(El("section", "boPlayPanel boPanel"));
    this.panel.hidden = true;
    this.panel.setAttribute("aria-label", "试玩");
    ui.root.appendChild(this.panel);

    // 试玩中顶部那条
    this.hud = El("div", "boPlayHud boPanel");
    this.hud.hidden = true;
    this.hudTag = El("span", "boPlayTag", "试玩");
    this.hudStep = El("span", "boPlayStep");
    this.hudName = El("span", "boPlayName");
    this.hudGoal = El("span", "boPlayGoal");
    this.hudEnemy = El("span", "boPlayEnemy");
    this.hudTime = El("span", "boPlayTime");
    this.hudStop = Button("boPlayStop", "结束", { tip: "结束试玩（K）" });
    this.hudStop.dataset.tipSide = "below";
    this.hudStop.addEventListener("click", (e) => { e.stopPropagation(); this.Finish("abort"); });
    const top = El("div", "boPlayHudTop");
    top.append(this.hudTag, this.hudStep, this.hudName, this.hudTime, this.hudStop);
    const bottom = El("div", "boPlayHudBottom");
    bottom.append(this.hudGoal, this.hudEnemy);
    this.hud.append(top, bottom);
    wire(this.hud);
    ui.root.appendChild(this.hud);

    // 小结
    this.summaryEl = wire(El("section", "boPlaySummary boPanel"));
    this.summaryEl.hidden = true;
    this.summaryEl.setAttribute("aria-label", "试玩小结");
    ui.root.appendChild(this.summaryEl);
  }

  OnKey(e) {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === "Escape") { e.preventDefault(); if (this.summary) this.CloseSummary(); else this.ClosePanel(); }
    else if (e.code === PLAY_KEY) { e.preventDefault(); this.OnPlayKey(); }
  }

  /** K：没在打 → 开面板 / 面板开着就开打；在打 → 中止；小结开着 → 再来一遍。 */
  OnPlayKey() {
    if (this.run) { this.Finish("abort"); return; }
    if (this.summary) { this.Retry(); return; }
    if (this.panelOpen) this.StartFromPanel();
    else this.OpenPanel();
  }

  TogglePanel() { if (this.panelOpen) this.ClosePanel(); else this.OpenPanel(); }

  OpenPanel() {
    if (this.run || !this.editor.doc) return;
    if (this.summary) this.CloseSummary({ restore: false });
    this.editor.ExitFly?.({ quiet: true });
    this.panelOpen = true;
    this.editor.ReleasePointerLock?.();
    this.RenderPanel();
    this.panel.hidden = false;
    this.btn.classList.add("on");
  }

  ClosePanel() {
    this.panelOpen = false;
    this.panel.hidden = true;
    this.btn.classList.remove("on");
  }

  StartFromPanel() {
    const from = this.fromSelect?.value ?? null, to = this.toSelect?.value ?? null;
    this.settings.from = from; this.settings.to = to;
    this.Start({ from, to });
  }

  KeyframeLabel(kf) { return `${kf.id} · ${kf.name}`; }

  RenderPanel() {
    const editor = this.editor, doc = editor.doc, plan = this.Plan();
    const panel = this.panel;
    panel.textContent = "";
    if (!doc) return;
    const head = El("div", "boPlayHead");
    head.append(El("span", "boPlayTag", "试玩"), El("span", "boPlayTitle", "从关键帧开打"));
    const close = Button("boIconBtn boPlayClose", "", { icon: ICON_CLOSE, tip: "关（Esc）" });
    close.dataset.tipSide = "left";
    close.addEventListener("click", () => this.ClosePanel());
    head.append(close);
    panel.append(head);

    // 段落预设：编排里写的几段 + 「从当前帧打到底」
    const presets = El("div", "boPlayPresets");
    const cur = doc.keyframes[editor.index] || doc.keyframes[0];
    const Preset = (label, from, to, note = "") => {
      const b = Button("boPlayPreset", label, note ? { tip: note } : {});
      b.dataset.tipSide = "below";
      b.addEventListener("click", () => { this.fromSelect.value = from; this.toSelect.value = to; this.SyncRangeHint(); });
      presets.append(b);
    };
    for (const range of plan.ranges) {
      if (doc.keyframes.some(k => k.id === range.from) && doc.keyframes.some(k => k.id === range.to)) Preset(range.label, range.from, range.to, range.note);
    }
    Preset("从这一帧打到底", cur.id, doc.keyframes[doc.keyframes.length - 1].id);
    panel.append(presets);

    // 起止
    const Select = (label, value) => {
      const row = El("label", "boPlayRow");
      row.append(El("span", "boPlayKey", label));
      const select = El("select", "boPlaySelect");
      for (const kf of doc.keyframes) {
        const opt = El("option", "", this.KeyframeLabel(kf));
        opt.value = kf.id;
        select.append(opt);
      }
      select.value = value;
      select.addEventListener("change", () => this.SyncRangeHint());
      row.append(select);
      panel.append(row);
      return select;
    };
    const from = this.settings.from && doc.keyframes.some(k => k.id === this.settings.from) ? this.settings.from : cur.id;
    const defaultTo = plan.ranges.find(r => r.from === from)?.to || doc.keyframes[doc.keyframes.length - 1].id;
    const to = this.settings.to && doc.keyframes.some(k => k.id === this.settings.to) ? this.settings.to : defaultTo;
    this.fromSelect = Select("起点", from);
    this.toSelect = Select("终点", to);
    this.rangeHint = El("div", "boPlayHint");
    panel.append(this.rangeHint);

    // 开关
    const toggles = El("div", "boPlayToggles");
    const Toggle = (key, label, tip) => {
      const b = Button("boPlayToggle", label, { tip });
      b.dataset.tipSide = "below";
      const sync = () => { b.classList.toggle("on", !!this.settings[key]); b.setAttribute("aria-pressed", this.settings[key] ? "true" : "false"); };
      b.addEventListener("click", () => { this.settings[key] = !this.settings[key]; sync(); });
      sync();
      toggles.append(b);
    };
    Toggle("invincible", "无敌", "挨打不掉血（只看动线和节奏时开）");
    Toggle("infiniteAmmo", "无限子弹", "弹匣打不空");
    Toggle("previz", "播过场", "「看」的那几步有预演就播（N / Esc 跳过）；关了就停几秒直接往下");
    panel.append(toggles);

    const foot = El("div", "boPlayFoot");
    const note = El("div", "boPlayNote", "日军换成真 AI（会走位、开枪、吃子弹）；友军还是演员，不开枪、不挡子弹。");
    if (this.validation && !this.validation.ok) note.textContent = `试玩编排有错，这次按关键帧推断：${this.validation.errors[0]}`;
    else if (!this.present) note.textContent += " 这一关没有试玩编排，按关键帧推断。";
    const go = Button("boPlayGo", "开打", { tip: "K" });
    go.dataset.tipSide = "below";
    go.addEventListener("click", () => this.StartFromPanel());
    foot.append(note, go);
    panel.append(foot);
    this.SyncRangeHint();
  }

  /** 选中的那一段有几步、各是打 / 走 / 看。 */
  SyncRangeHint() {
    const doc = this.editor.doc;
    if (!doc || !this.rangeHint) return;
    const indices = PlayRange(doc, this.fromSelect.value, this.toSelect.value);
    if (!indices.length) { this.rangeHint.textContent = "终点在起点前面"; this.rangeHint.classList.add("bad"); return; }
    this.rangeHint.classList.remove("bad");
    const counts = { fight: 0, move: 0, watch: 0, skip: 0 };
    let enemies = 0;
    for (const i of indices) { const step = PlayStepPlan(doc, i, this.Plan()); counts[step.mode] += 1; enemies += step.ai.length; }
    const parts = [`${indices.length} 步`];
    for (const mode of ["fight", "move", "watch", "skip"]) if (counts[mode]) parts.push(`${MODE_TEXT[mode]} ${counts[mode]}`);
    parts.push(`日军最多 ${enemies} 人次`);
    this.rangeHint.textContent = parts.join(" · ");
  }

  UpdateHud(force) {
    const run = this.run;
    if (!run) return;
    const step = run.step;
    const time = FormatPlayTime(run.totalT);
    let goal = "", enemy = "";
    if (run.phase === "dead") goal = "阵亡";
    else if (run.phase === "previz") goal = "过场（N / Esc 跳过）";
    else if (run.phase === "watch") goal = `看：${step.objective}`;
    else if (run.phase === "approach") {
      const d = this.DistanceTo(this.StationOf(step));
      goal = `去：${step.name}　${Number.isFinite(d) ? Math.round(d) + " m" : ""}`;
    } else if (run.phase === "cleared") goal = "✓ 过了";
    else if (step) {
      const reach = step.clear.reach;
      goal = step.objective;
      if (reach) { const d = this.DistanceTo(reach); if (Number.isFinite(d)) goal += `　${Math.round(d)} m`; }
      if (step.clear.time) goal += `　撑 ${Math.max(0, Math.ceil(step.clear.time - run.engageT))} s`;
    }
    if (step?.mode === "fight" && (run.phase === "engage" || run.phase === "cleared")) enemy = `敌 ${this.AliveOf(run.stepSpawned)} / ${run.stepSpawned.size}`;
    const key = [run.cursor, run.phase, time, goal, enemy].join("|");
    if (!force && key === run.hudKey) return;
    run.hudKey = key;
    this.hudStep.textContent = step ? `${run.cursor + 1}/${run.indices.length}  ${step.label}` : "";
    this.hudName.textContent = step ? step.name : "";
    this.hudTime.textContent = time;
    this.hudGoal.textContent = goal;
    this.hudEnemy.textContent = enemy;
    this.hudEnemy.hidden = !enemy;
    this.hud.classList.toggle("dead", run.phase === "dead");
  }

  RenderSummary() {
    const s = this.summary, el = this.summaryEl;
    el.textContent = "";
    if (!s) return;
    const head = El("div", "boPlayHead");
    head.append(El("span", `boPlayTag ${s.result}`, "试玩"), El("span", "boPlayTitle", RESULT_TEXT[s.result] || s.result));
    const close = Button("boIconBtn boPlayClose", "", { icon: ICON_CLOSE, tip: "回到编辑（Esc）" });
    close.dataset.tipSide = "left";
    close.addEventListener("click", () => this.CloseSummary());
    head.append(close);
    el.append(head);
    const totals = El("div", "boPlayTotals");
    const Stat = (label, value) => { const b = El("span", "boPlayStat"); b.append(El("b", "", value), El("span", "", label)); totals.append(b); };
    Stat("用时", FormatPlayTime(s.totalT));
    Stat("打死", String(s.kills));
    Stat("掉血", s.settings.invincible ? "无敌" : String(Math.round(s.damage)));
    Stat("步数", `${s.log.filter(e => !["dead", "abort"].includes(e.result)).length}/${s.indices.length}`);
    el.append(totals);
    const table = El("div", "boPlayLog");
    for (const entry of s.log) {
      const row = El("div", `boPlayLogRow ${["dead", "abort"].includes(entry.result) ? "bad" : ""}`.trim());
      row.append(El("span", "boPlayLogNo", entry.label), El("span", "boPlayLogName", entry.name),
        El("span", "boPlayLogMode", MODE_TEXT[entry.mode] || ""), El("span", "boPlayLogTime", FormatPlayTime(entry.timeS)),
        El("span", "boPlayLogResult", (STEP_RESULT_TEXT[entry.result] || entry.result) + (entry.kills ? ` · ${entry.kills}` : "")));
      table.append(row);
    }
    el.append(table);
    const foot = El("div", "boPlayFoot");
    const again = Button("boPlayGo", "再来一遍", { tip: "K" });
    again.dataset.tipSide = "below";
    again.addEventListener("click", () => this.Retry());
    foot.append(again);
    if (s.failedCursor > 0) {
      const fromHere = Button("boPlaySecondary", "从这一步重来");
      fromHere.addEventListener("click", () => this.Retry({ fromFailed: true }));
      foot.append(fromHere);
    }
    const back = Button("boPlaySecondary", "回到编辑");
    back.addEventListener("click", () => this.CloseSummary());
    foot.append(back);
    el.append(foot);
    el.hidden = false;
  }

  Retry({ fromFailed = false } = {}) {
    const s = this.summary;
    if (!s) return;
    const doc = this.editor.doc;
    const from = fromFailed && s.failedIndex >= 0 ? s.failedIndex : s.indices[0];
    const to = s.indices[s.indices.length - 1];
    this.CloseSummary({ restore: false });
    this.Start({ from: doc.keyframes[from]?.id ?? from, to: doc.keyframes[to]?.id ?? to, settings: s.settings });
  }

  /** 取证 / 测试用的现状。 */
  State() {
    const run = this.run;
    const soldiers = run ? [...run.soldiers.entries()].map(([id, s]) => ({ id, alive: !!s.alive, x: +s.position.x.toFixed(2), z: +s.position.z.toFixed(2), order: s.order, weapon: s.weaponId, state: s.state })) : [];
    return {
      present: this.present, valid: this.validation?.ok ?? null, panelOpen: this.panelOpen,
      active: !!run, settings: { ...this.settings },
      run: run ? {
        indices: run.indices.slice(), cursor: run.cursor, step: run.step?.id ?? null, mode: run.step?.mode ?? null, phase: run.phase,
        totalT: +run.totalT.toFixed(2), engageT: +run.engageT.toFixed(2), kills: run.kills, stepKills: run.stepKills,
        stepSpawned: run.stepSpawned.size, alive: this.AliveOf(run.stepSpawned), damage: Math.round(run.damage),
        killed: [...run.killed], clear: run.step ? { ...run.step.clear } : null, settings: { ...run.settings }, log: run.log.map(e => ({ ...e })),
      } : null,
      soldiers,
      summary: this.summary ? { result: this.summary.result, totalT: +this.summary.totalT.toFixed(2), kills: this.summary.kills, damage: Math.round(this.summary.damage), log: this.summary.log.map(e => ({ ...e })) } : null,
    };
  }

  Dispose() {
    if (this.run) this.Finish("abort", { summary: false });
    this.btn.remove();
    this.panel.remove();
    this.hud.remove();
    this.summaryEl.remove();
  }
}
