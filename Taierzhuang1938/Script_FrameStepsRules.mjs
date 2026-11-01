// 正常游戏每帧的步骤：规则与任务（docs/Data_FrameSchedule.md）。
// 一步一个 PlayStep<Id>(ctx, f)；先后只由 Data_FrameSchedule.FRAME_PLAY_STEPS 决定，这里的书写顺序不算数。
// 主文件里的状态、服务、函数一律从工具箱 ctx 取（ctx.player、ctx.RenderScene()……）；f 是这一帧在步骤之间传的量。
// 结束这一帧用 return STOP，不写裸 return;（门禁 FrameScheduleTest）。

import { FIRST_LEVEL_P012_WHITEBOX_LEVEL_ID } from "./Data_FirstLevelP012Whitebox.mjs";
import { CompleteP012ManualReload } from "./Script_FirstLevelP012Opening.mjs";
import { ContentZoneId } from "./Script_FirstLevelWhiteboxFlow.mjs";
import { Progress } from "./Script_Menu.mjs";
import { Clamp } from "./Script_Noise.mjs";
import { CHAPTER_RELEASE_SIGNAL } from "./Script_Story.mjs";
import { T } from "./Script_Text.mjs";
import { STOP } from "./Script_FrameModes.mjs";

export function PlayStepPlayerDown(ctx, f) {
  const dt = f.dt, render = f.render;
  // 死亡判定必须放在**所有会造成伤害的系统都跑完之后**，并且用跨帧状态而不是
  // 帧内局部变量。玩家最常见的死法是被手榴弹/掷弹筒炸死，而爆炸结算在
  // combat.Update 里 —— 判定放在 player.Update 紧后面的话，那一类死法会被整个吞掉：
  // 不弹卡片、兵员池不扣、不换人，玩家永远躺在地上。
  // 脚本安排的无敌窗口（四关罗班长救顺子那 4—6 秒）：这一段是脚本不是战斗，
  // 死在里面会把整拍跳过去。被打倒时**不走死亡链路**，走检查点倒带 ——
  // 不扣兵员池、不弹死亡卡、不换人（Script_Checkpoint 的头注写着为什么）。
  if (ctx.state.playerAliveLast && !ctx.player.Alive && ctx.state.elapsed < ctx.scriptInvulnUntil) {
    if (ctx.checkpoint?.Rewind(2.0)) ctx.state.playerAliveLast = true;
  }
  if (ctx.state.playerAliveLast && !ctx.player.Alive) ctx.OnPlayerDown();
  ctx.state.playerAliveLast = ctx.player.Alive;
  if(ctx.missionRuntime?.failed || ctx.p012Runtime?.failed){if(render)ctx.RenderScene(dt);return STOP;}
}

export function PlayStepFirewalls(ctx, f) {
  // 火墙（三关传单入火封住的那条追击路线）。**对玩家同样有伤害** ——
  // 它是封路，不是单向道具。烧完就把烟收掉。
  if (ctx.state.firewalls.length) {
    for (let i = ctx.state.firewalls.length - 1; i >= 0; i -= 1) {
      const wall = ctx.state.firewalls[i];
      if (ctx.state.elapsed > wall.until) {
        for (const handle of wall.smoke) ctx.vfx?.RemoveSmokeSource(handle);
        ctx.state.firewalls.splice(i, 1);
        continue;
      }
      if (!wall.damagePlayer || !ctx.player.Alive) continue;
      if (ctx.state.elapsed - wall.lastHurt < 0.6) continue;
      // 点到线段的距离：1.6 m 之内算站在火里。
      const dx = wall.bx - wall.ax;
      const dz = wall.bz - wall.az;
      const len2 = dx * dx + dz * dz;
      const t = len2 > 0
        ? Clamp(((ctx.player.position.x - wall.ax) * dx + (ctx.player.position.z - wall.az) * dz) / len2, 0, 1)
        : 0;
      const near = Math.hypot(ctx.player.position.x - (wall.ax + dx * t), ctx.player.position.z - (wall.az + dz * t));
      if (near > 1.6) continue;
      wall.lastHurt = ctx.state.elapsed;
      ctx.player.TakeHit(9, "legs", null, { fire: true });
      ctx.hud.Hint(T("hud.hint.fireBlocks"), 1.6);
    }
  }
}

export function PlayStepCheckpoint(ctx, f) {
  // 脚本检查点：**排在死亡判定之后**，采的是这一帧最终的位置/姿态/血/弹。
  // 排在前面的话，被打死的那一帧也会被采进环里，倒带就退回到"刚好要死"的那一刻。
  ctx.checkpoint?.Update();
}

export function PlayStepMission(ctx, f) {
  const dt = f.dt;
  ctx.profiler.B("story");
  ctx.profiler.B("story/mission");
  ctx.missionRuntime?.Update(dt);
  ctx.missionRuntime?.opening.ApplyCamera();
  // 白盒编辑器的预演：玩家相机写完之后接管（docs/Data_EditorBlockout.md §14.2）
  // 飞行观察时相机可能离玩家很远：阴影框跟着相机走（同炮击扬尘测试场的自由相机）
  const blockoutCamera = !!ctx.blockout?.ApplyCamera?.(ctx.camera);
  if (blockoutCamera && ctx.blockout.flying) { ctx.camera.getWorldDirection(ctx._forward); ctx.lights.UpdateShadowFrustum(ctx.camera.position, ctx._forward); }
  // 测试场的自由观察相机（炮击扬尘）：玩家相机写完之后接管，阴影框跟着相机走（玩家留在原地）。
  const sandboxCamera = !!ctx.sandbox?.ApplyCamera?.(ctx.camera);
  if (sandboxCamera) { ctx.camera.getWorldDirection(ctx._forward); ctx.lights.UpdateShadowFrustum(ctx.camera.position, ctx._forward); }
  // 第一人称持枪移动检查：白盒预演 / 飞行与测试场相机都没接管时，主相机挪到玩家身旁的外部机位
  //（阴影框留在玩家脚下：机位就在几米内）。
  if (!blockoutCamera && !sandboxCamera) ctx.editor?.ApplyOverlayCamera(ctx.camera, true);
  ctx.profiler.E("story/mission");
  if(ctx.missionRuntime?.completed){ctx.profiler.E('story');return STOP;}
}

export function PlayStepP012(ctx, f) {
  const dt = f.dt;
  if (ctx.p012Flow) {
    ctx.profiler.B("story/p012");
    ctx.p012StageZero?.Update(dt);
    ctx.p012Resting?.Update(dt);
    ctx.p012Runtime.Update(dt);
    ctx.p012Runtime.TryDitchDodge(ctx.player.position, ctx.player.stance, ctx.strafe?.View());
    if (ctx.p012Runtime.weaponActionPending && !ctx.viewmodel.IsBusy?.()) {
      ctx.p012Runtime.weaponActionPending = false; ctx.p012Runtime.weaponActionCount++;
      CompleteP012ManualReload(ctx.p012Runtime);
    }
    ctx.p012Flow.Update(dt, ctx.ReadP012ProgressSample());
    if (ctx.story.Signalled("P012Complete")) {
      // 这片白盒就是玩家的第一关：打完记进度，选章里标「已通过」（id 与 CAMPAIGN_ENTRIES[0] 同）。
      Progress.MarkCleared(FIRST_LEVEL_P012_WHITEBOX_LEVEL_ID, 0);
      ctx.p012Runtime.completed = true; ctx.ShowPauseMenu(); ctx.menu.OpenSandboxComplete();
      ctx.profiler.E("story/p012"); ctx.profiler.E("story"); return STOP;
    }
    ctx.profiler.E("story/p012");
  }
}

export function PlayStepObjectives(ctx, f) {
  const dt = f.dt;
  ctx.profiler.B("story/objectives");
  ctx.UpdateObjectives(dt);
  ctx.profiler.E("story/objectives");
}

export function PlayStepNarrative(ctx, f) {
  const dt = f.dt;
  // 「占点耗对方的票」那一套（ER2 2.0.9 的机制）跟着占领点一起删了。
  // 线性关卡里逼玩家往前打的是**时间**与**剧本**，不是一条会把你耗死的进度条：
  // 城是必然陷落的，磨时间没有任何好处。

  // --- 叙事层 ---
  // 身边六十米内有敌人在开枪 = 正在交火。原剧本的 wave:N / waveClear:N
  // 就映射到这个计数上 —— 开放战场没有编排好的波次，但"身边打起来了"这件事有。
  ctx.profiler.B("story/narrative");
  let fighting = false;
  for (const s2 of ctx.ai.soldiers) {
    if (!s2.alive || s2.side === "nra") continue;
    if (ctx.state.elapsed - s2.lastFire > 2.5) continue;
    if (s2.position.distanceTo(ctx.player.position) < 60) { fighting = true; break; }
  }
  ctx.story.SetFighting(fighting);
  const playerZone = ctx.battlefield.objectives.find((o) =>
    Math.hypot(ctx.player.position.x - o.x, ctx.player.position.z - o.z) < o.radius);
  ctx.story.Update(dt, {
    zone: playerZone ? ContentZoneId(playerZone) : null,
    objectiveIndex: ctx.state.objectiveIndex,
    objectiveCount: ctx.state.objectiveCount,
    levelSeconds: ctx.state.levelSeconds,
    pool: ctx.state.nraPool,
    p012Beat: ctx.p012Flow?.beat,
  });
  if (ctx.story.ObjectiveText && !ctx.p012Flow && !ctx.missionRuntime) ctx.state.storyObjective = ctx.story.ObjectiveText;
  ctx.profiler.E("story/narrative");
}

export function PlayStepSetpieces(ctx, f) {
  const dt = f.dt;
  // 章节摆点：**排在 story.Update 之后**。它的 onVoice 钩子读的是 story.fired，
  // 排在前面的话每一拍都要慢一帧 —— 「顺子喊完『老子回去压住！』就播转身那一场」
  // 这种同拍的事会看得出来差一帧。
  ctx.profiler.B("story/setpieces");
  ctx.setpieces?.Update(dt);
  ctx.profiler.E("story/setpieces");
  if (ctx.p012CarryView) {
    ctx.profiler.B("story/carry");
    const litterId = ctx.setpieces?.mem?.p012CarriedLitter?.propLitter;
    ctx.p012CarryView.Update(dt, { litter: ctx.missionRuntime?.view.zhouRoot || ctx.setpieceProps.get(String(litterId))?.root,
      player: ctx.player, carry: ctx.carry?.View(), alive: ctx.player.Alive && !ctx.state.cutscene && !ctx.state.menu });
    ctx.profiler.E("story/carry");
  }
}

export function PlayStepScenario(ctx, f) {
  // 事件先改变白盒，再让玩家从改变后的世界里读到结果：护送队喊走后开院门，
  // 南路被切断后开归路。不存在悬浮解释卡，也不存在隐形空气墙。
  ctx.profiler.B("story/scenario");
  const openedScenarioGates = ctx.battlefield?.SyncScenario?.({
    objectiveIndex: ctx.state.objectiveIndex,
    // 第一关的换态信号名与事实名不一样（契约 §3 冻结了大写信号名），
    // 对照表在 Data_FirstLevelMissionGates.MISSION_SCENARIO_SIGNALS，运行时用 Signalled 查。
    signalled: (name) => !!ctx.missionRuntime?.Signalled(name) || ctx.story.Signalled(name) || !!ctx.blockout?.Signalled(name),
  });
  // 连通分量摊到后面几帧（Script_Navigation.Refresh 的 spread）：01 洞口塌方就在近爆那一帧换态。
  if (openedScenarioGates > 0) ctx.navGrid?.Refresh(ctx.battlefield, { spread: true });
  ctx.profiler.E("story/scenario");
  ctx.profiler.E("story");
}

export function PlayStepOutcome(ctx, f) {
  const dt = f.dt;
  // --- 结束条件 ---
  // **这座城没有"守住"这个结局。** 三月十七日它陷落，十八日午前肃清完毕，
  // 这是信史，不给玩家改。所以"赢"只有一种意思：这一关的目标链走完了。
  // 唯一的失败是池子空了 —— 「城里还站着的人」减到零，再没有人可以填上去。
  if (!ctx.state.outcome && ctx.state.nraPool <= 0 && !ctx.player.Alive) ctx.EndBattle("defeat");

  ctx.state.phaseTime += dt;
  const phase = ctx.PHASE_TABLE[ctx.state.phaseIndex];

  // --- 钉关（mechanics.pinFinalZone）---------------------------------------
  // 第五关最后一个路标是「返回最后火力点」，而阶段⑩⑪⑫（最后防守三层、
  // 最终白刃战、视角接替三段）全在它**之后**。按常规规则一踏进那个圈就
  // objectiveIndex ≥ objectiveCount，Script_Main 立刻换关，整段被吃掉。
  // 所以章节数据声明这条旗标之后，走到最后一个路标只是"到了"，
  // 要等 story.Signal("ChapterRelease") 才放行。
  //
  // 保险丝：信号一直不来的话，超过配置时长 + PIN_RELEASE_GRACE_S 自动放行并告警。
  // 没有它，一条忘了接的信号就是"这一关永远打不完"，而画面上完全看不出为什么。
  if (ctx.state.pinFinalZone && !ctx.state.chapterReleased) {
    if (ctx.story.Signalled(CHAPTER_RELEASE_SIGNAL)) {
      ctx.state.chapterReleased = true;
      ctx.state.chapterReleaseAt = ctx.state.phaseTime;
    } else if (ctx.state.phaseTime > ctx.state.levelSeconds + ctx.PIN_RELEASE_GRACE_S) {
      ctx.state.chapterReleased = true;
      ctx.state.chapterReleaseAt = ctx.state.phaseTime;
      console.warn(`钉关保险丝：${phase.id} 等不到 ${CHAPTER_RELEASE_SIGNAL}，`
        + `已超时 ${Math.round(ctx.state.phaseTime - ctx.state.levelSeconds)} s，自动放行`);   // @text-ok console.warn 的续行
    }
  }
  const chapterPinned = ctx.state.pinFinalZone && !ctx.state.chapterReleased;

  // 换关：目标链走完，或者配置时长到了（史实时段是往前走的，不等玩家）
  const levelOver = !ctx.state.pinned && !chapterPinned
    && (ctx.state.objectiveIndex >= ctx.state.objectiveCount || ctx.state.phaseTime > ctx.state.levelSeconds);
  if (levelOver && !ctx.state.advancing && !ctx.state.outcome) {
    // 异步：建下一片切片要分帧走完。这里只管点火，别 await —— Frame 是同步的。
    ctx.AdvanceLevel().catch((error) => console.error("换关失败", error));
  }
  f.phase = phase;
}

export function PlayStepSpawn(ctx, f) {
  const dt = f.dt, phase = f.phase;
  // 补兵（靶场不补战线，只把倒下的木桩兵按 RANGE_RESPAWN_S 复位）
  ctx.state.spawnAccumulator += dt;
  if (ctx.state.spawnAccumulator > 3) {
    ctx.state.spawnAccumulator = 0;
    ctx.profiler.B("spawn");
    // 有 Maintain 的测试场（靶场、白刃实验场）按这个节拍复位木桩兵。
    if (ctx.sandbox?.Maintain) ctx.sandbox.Maintain();
    // 其余测试场不补兵：枪械射击场的靶由它自己每帧维护；断肢场的木桩兵**不自动复位**
    //（断了的肢体要留在场上看，复位走面板的「重置木桩」）；其余场地本来就没有兵。
    else if (ctx.SANDBOX_RANGE) { /* Sandbox fixtures maintain themselves. */ }
    else if (ctx.BLOCKOUT) { /* Blockout units are editor-owned puppets; nothing to reseed. */ }
    else if (ctx.TOOLS_HOME) { /* The tools home is an empty lot. */ }
    else ctx.SeedSoldiers(phase);
    ctx.profiler.E("spawn");
  }
}

/** 这一组的步骤（id → 函数），Script_Main 合进 PLAY_STEP_FUNCS。 */
export const RULES_STEPS = {
  playerDown: PlayStepPlayerDown,
  firewalls: PlayStepFirewalls,
  checkpoint: PlayStepCheckpoint,
  mission: PlayStepMission,
  p012: PlayStepP012,
  objectives: PlayStepObjectives,
  narrative: PlayStepNarrative,
  setpieces: PlayStepSetpieces,
  scenario: PlayStepScenario,
  outcome: PlayStepOutcome,
  spawn: PlayStepSpawn,
};
