// 正常游戏每帧的步骤：世界模拟（docs/Data_FrameSchedule.md）。
// 一步一个 PlayStep<Id>(ctx, f)；先后只由 Data_FrameSchedule.FRAME_PLAY_STEPS 决定，这里的书写顺序不算数。
// 主文件里的状态、服务、函数一律从工具箱 ctx 取（ctx.player、ctx.RenderScene()……）；f 是这一帧在步骤之间传的量。
// 结束这一帧用 return STOP，不写裸 return;（门禁 FrameScheduleTest）。

export function PlayStepAlliesDown(ctx, f) {
  // 友军倒下：叙事层要靠它触发「他倒了我上，我倒了你上」那几句。
  // 用计数差而不是回调 —— AiDirector 没有死亡事件，加一个回调等于改它的契约，
  // 而计数差在这里够用且不会漏（同一帧死两个人只报一次，叙事上也没差别）。
  const alliesNow = ctx.ai.CountSide("nra");
  if (ctx.state.prevAllies > 0 && alliesNow < ctx.state.prevAllies && ctx.story) ctx.story.Signal("allyDown");
  ctx.state.prevAllies = alliesNow;
}

export function PlayStepFlare(ctx, f) {
  const dt = f.dt;
  // 照明弹：升空→点燃→伞降燃烧→熄灭→暗适应，外加**发现距离倍率**。
  // **必须排在 ai.Update 之前**：倍率要在这一帧的 Think 之前写进 AiDirector，
  // 写晚一帧就成了「亮了，但这一帧还没有人看见」。灯与烟由它自己的宿主
  // 适配器写进 LightRig / VfxSystem，那两个的 Update 都排在后面（见下）。
  ctx.flare?.Update(dt);
}

export function PlayStepCompanion(ctx, f) {
  const dt = f.dt;
  // 具名同伴的跟随目标。**必须排在 ai.Update 之前**：goal 要在这一帧的 Think
  // 之前写进去，写晚一帧就是「班长永远慢你一步」。它自己按 regoalS 分频，
  // 不是每帧都真的写（每帧写 goal 等于每帧打断寻路）。
  ctx.companion?.Update(dt);
}

export function PlayStepAi(ctx, f) {
  const dt = f.dt;
  ctx.profiler.B("ai");
  if (ctx.sandbox?.updateSlot === "beforeAi") ctx.sandbox.Update(dt);
  ctx.ai.Update(dt, ctx.camera);
  ctx.profiler.E("ai");
}

export function PlayStepPhysics(ctx, f) {
  const dt = f.dt;
  // 物理步进排在**人都走完之后、特效与投掷物之前**：
  // 玩家与 AI 是运动学体，它们这一帧的位移要先写进刚体，引擎再把碰撞体同步过去；
  // 手雷是动态刚体，它读的就是同步之后的那份位置。顺序反了会差一帧，
  // 表现为「手雷从刚跑过去的人身上穿过去」。
  ctx.profiler.B("physics");
  if (ctx.physics) ctx.physics.Step(dt);
  // 断肢块排在**物理步进之后、Vfx 之前**：它把刚体位姿同步到网格上，
  // 而挂在断面上的持续血源是 Vfx 每帧读节点世界矩阵取位置的 —— 顺序反了
  // 血会跟着上一帧的肢块走（一段在半空的血迹）。
  ctx.gore?.Update(dt, ctx.camera);
  ctx.profiler.E("physics");
}

export function PlayStepVfx(ctx, f) {
  const dt = f.dt;
  ctx.profiler.B("vfx");
  ctx.vfx.Update(dt, ctx.camera, ctx.state.elapsed);
  ctx.profiler.E("vfx");
}

export function PlayStepCombat(ctx, f) {
  const dt = f.dt;
  ctx.profiler.B("combat");
  ctx.combat.Update(dt, { phase: ctx.PHASE_TABLE[ctx.state.phaseIndex] });
  if (ctx.sandbox?.updateSlot === "afterCombat") ctx.sandbox.Update(dt);
  // 日机扫射：弹着线推进、白名单结算、玩家躲避窗口。**必须排在下面那条
  // 死亡判定之前** —— 它打得倒玩家，排在后面那一类死法会被整帧吞掉
  // （与手榴弹/掷弹筒同一笔账，见死亡判定那段注释）。
  ctx.strafe?.Update(dt);
  // 炮坑的地表碎块：爆炸那一帧只改地形与碰撞，半埋的土块石块摊到随后一两帧铺
  // （一块 ~12k 顶点，是爆炸链里最贵也最不怕晚一帧的一项）。
  ctx.battlefield?.deformation?.Update();
  ctx.profiler.E("combat");
}

export function PlayStepLights(ctx, f) {
  const dt = f.dt;
  // 投弹蓄力：按住 G/H 的时间同时决定扔多远和引信烧掉多少
  if (ctx.state.cooking) ctx.state.cook += dt;
  ctx.sky.Update(ctx.state.elapsed);
  ctx.lights.Update(dt, ctx.state.elapsed, ctx.camera.position);
  ctx.camera.getWorldDirection(ctx._forward);
  ctx.lights.UpdateShadowFrustum(ctx.player.position, ctx._forward);
  // 探针体（gi.Update）不在这里推，它挂在 RenderScene 上 —— 见那里的账。
}

/** 这一组的步骤（id → 函数），Script_Main 合进 PLAY_STEP_FUNCS。 */
export const WORLD_STEPS = {
  alliesDown: PlayStepAlliesDown,
  flare: PlayStepFlare,
  companion: PlayStepCompanion,
  ai: PlayStepAi,
  physics: PlayStepPhysics,
  vfx: PlayStepVfx,
  combat: PlayStepCombat,
  lights: PlayStepLights,
};
