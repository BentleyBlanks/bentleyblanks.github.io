// 每帧的骨架（docs/Data_FrameSchedule.md）：冻结判断、帧头、选模式，以及五个模式各自跑什么。
// Script_Main.Frame 只剩三行，依次叫这里的 FrameFrozen / BeginFrame / FrameMode。
// 主文件里的状态、服务、函数一律从工具箱 ctx 取（ctx.player、ctx.RenderScene()……），不读全局变量。

/** 结束这一帧的信号：调度表里任何一步返回它，后面的步骤这一帧都不跑（任务失败 / 通关）。 */
export const STOP = Symbol("frameStop");

/** 失败画面 / 任务结束：只出画面，世界时钟不走（返回 true = 这一帧到此为止）。 */
export function FrameFrozen(ctx, dt, render) {
  if (ctx.menu?.open && ctx.menu.mode === "failure") {
    // Only the fallen viewpoint advances; AI, damage and mission clocks stay frozen.
    if (!ctx.player.Alive) { ctx.player.Update(dt); ctx.UpdatePlayerDeath(); }
    if (render) ctx.RenderScene(0);
    return true;
  }
  // StepFrames also enters here directly: terminal P012 screens freeze the entire world clock.
  if (ctx.missionRuntime?.completed || ctx.missionRuntime?.failed || (ctx.missionRuntime && !ctx.state.running && !ctx.UiCapturing()) || ctx.p012Runtime?.completed || ctx.p012Runtime?.failed) {
    if (render) ctx.RenderScene(0);
    return true;
  }
  return false;
}

/** 帧头：任何模式都跑。玩法时钟在这里推一步，后面各模式读 f.dt（玩法时间）与 f.realDt（真实时间）。 */
export function BeginFrame(ctx, f, dt, render) {
  const realDt = dt;
  // QTE 窗口走真实时间；下面玩家、AI、弹道、特效和叙事统一吃缩放后的玩法时间。
  // 这句必须在 state.elapsed 之前：否则慢的只有 AI，玩家/故事仍按正常速度飞过去。
  // Combat is stepped after pause/menu/editor gates, before movement and AI.
  // 白刃 QTE、测试场（断肢慢动作 / 炮击扬尘暂停单步 / 人物反应慢放）、编辑器持枪检查的慢放
  // 都登记在玩法时钟里（Script_GameClock，顺序同原来那五行）。
  dt = ctx.clock.Step(realDt);
  ctx.state.frame += 1;
  ctx.state.elapsed += dt;
  // 叠加层（Debug Rendering）不接管相机也不暂停玩法，所以它的每帧要排在
  // 所有分支之前 —— 排进下面任何一条 if 里，都会有一整类帧读不到新数。
  ctx.profiler.B("overlay");
  if (ctx.editor) ctx.editor.UpdateOverlays(dt);
  // 白盒关卡编辑器：演员、标记、卡片与小地图（换关中自己跳过）。
  ctx.blockout?.Update(dt);
  ctx.profiler.E("overlay");
  // 外部道具流送：跟着**相机**走（游戏里相机就在玩家头上；过场里跟运镜走，
  // 布景才不会在长焦端消失）。必须排在所有 return 分支之前。
  if (ctx.battlefield?.externalStreamer) {
    ctx.profiler.B("streamer");
    ctx.battlefield.externalStreamer.Update(ctx.camera.position.x, ctx.camera.position.z);
    ctx.profiler.E("streamer");
  }
  // 机队独立于玩法暂停与过场：它是远方连续发生的战场环境，不占用 AI / 物理预算。
  // **扫射航线不是**：它归玩法时间（strafe.Update 在下面那段里推），
  // 所以暂停/过场时 View() 停在原地不动，那一架就钉在航线上不再前进。
  ctx.aircraft?.Update(ctx.state.elapsed, ctx.strafe?.View() ?? null);
  f.realDt = realDt; f.dt = dt; f.render = render;
}

/** 这一帧归哪个模式（顺序同 Data_FrameSchedule.FRAME_MODES）。 */
export function FrameMode(ctx) {
  if (ctx.UiCapturing()) return "editor";
  if (ctx.p012StageZero?.shellShot.active) return "shellShot";
  // 建切片期间（换关）也只走画面：碰撞盒表正在被换掉，规则层这时候查什么都是错的
  if (!ctx.state.ready) return "loading";
  if (ctx.sandbox?.ownsFrame) return "lab";
  return "play";
}

/** 编辑器接管：玩法全停，只推编辑器与画面。 */
export function FrameModeEditor(ctx, f) {
  const dt = f.dt, render = f.render;
  // 编辑器接管：玩法全停，只推编辑器与画面。
  ctx.settings?.Update(dt);
  ctx.editor?.Update(dt);
  if (ctx.commandRoom?.ready && ctx.menu?.live && ctx.settings?.IsOpen) {
    ctx.commandRoom.Update(dt);
    if(render)ctx.commandRoom.Render();
    return;
  }
  // 阴影框跟着**编辑器相机**走：编辑器的自由飞行
  // 会把镜头带到离玩家几百米的地方，而阴影框留在玩家脚下 = 那一片一个
  // 影子都没有（画面上是「东西浮在地上」）。采样点出图全走这条分支。
  ctx.camera.getWorldDirection(ctx._forward);
  // 特效编辑器直接驱动 VfxSystem；点光包络也必须同帧推进，否则预览里只有火球贴片，
  // 墙地仍旧不亮，退出编辑器才突然补算一大步。
  // 高级工具开着、没有互斥编辑器时，第一人称持枪移动检查仍按外部机位出画（玩家停着，替身眼睛不重抄）
  ctx.editor?.ApplyOverlayCamera(ctx.camera, false);
  if(ctx.editor?.activeId==='vfx')ctx.lights.Update(0,ctx.editor.active.previewTime??ctx.state.elapsed,ctx.camera.position);
  else ctx.lights.Update(dt, ctx.state.elapsed, ctx.camera.position);
  ctx.lights.UpdateShadowFrustum(ctx.camera.position, ctx._forward);
  if (render) ctx.RenderScene(dt);
  return;
}

/** 第一关 0 段炮弹镜头：只推镜头、天空灯光、特效、战斗与画面。 */
export function FrameModeShellShot(ctx, f) {
  const dt = f.dt, render = f.render;
  ctx.p012StageZero.shellShot.Update(dt);
  ctx.sky.Update(ctx.state.elapsed);ctx.lights.Update(dt,ctx.state.elapsed,ctx.camera.position);
  ctx.vfx?.Update(dt,ctx.camera,ctx.state.elapsed);
  ctx.combat?.Update(dt,{phase:ctx.PHASE_TABLE[ctx.state.phaseIndex]});
  ctx.camera.getWorldDirection(ctx._forward);ctx.lights.UpdateShadowFrustum(ctx.camera.position,ctx._forward);
  if(render)ctx.RenderScene(dt);
  return;
}

/** 换关建切片中：什么都不跑。 */
export function FrameModeLoading(ctx) {}

/** 测试场整帧接管（布料实验室）。 */
export function FrameModeLab(ctx, f) {
  const dt = f.dt, render = f.render;
  // The laboratory owns orbit input and simulation time, without FPS movement or combat side effects.
  ctx.sandbox.Update(dt);
  ctx.sandbox.UpdateCamera?.(dt);
  ctx.hudRoot.style.display = "none";
  ctx.sky.Update(ctx.state.elapsed);
  ctx.lights.Update(dt, ctx.state.elapsed, ctx.camera.position);
  ctx.camera.getWorldDirection(ctx._forward);
  ctx.lights.UpdateShadowFrustum(ctx.camera.position, ctx._forward);
  if (render) ctx.RenderScene(dt);
  return;
}

/** 正常游戏：按 Data_FrameSchedule.FRAME_PLAY_STEPS 的先后跑，任何一步返回 STOP 就结束这一帧。 */
export function FrameModePlay(ctx, f) {
  for (const step of ctx.PLAY_STEPS) if (step(ctx, f) === STOP) return;
}
