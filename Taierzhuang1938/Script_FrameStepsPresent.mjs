// 正常游戏每帧的步骤：表现与出画（docs/Data_FrameSchedule.md）。
// 一步一个 PlayStep<Id>(ctx, f)；先后只由 Data_FrameSchedule.FRAME_PLAY_STEPS 决定，这里的书写顺序不算数。
// 主文件里的状态、服务、函数一律从工具箱 ctx 取（ctx.player、ctx.RenderScene()……）；f 是这一帧在步骤之间传的量。
// 结束这一帧用 return STOP，不写裸 return;（门禁 FrameScheduleTest）。

import { DIFFICULTY } from "./Data_Battle.mjs";
import { WEAPONS } from "./Data_Weapons.mjs";
import { GunReadyFromCover } from "./Script_FirearmActions.mjs";

export function PlayStepHud(ctx, f) {
  const dt = f.dt, weapon = f.weapon, phase = f.phase;
  // --- HUD ---
  ctx.profiler.B("hud");
  // The campaign objective is read on the pause screen, without HUD notifications.
  ctx.hud.SetObjective(phase.whitebox?.fullMission ? ctx.missionRuntime?.ObjectiveNotice() || "" : ctx.state.storyObjective || phase.label, phase.whitebox?.fullMission?null:ctx.state.nraPool, null);
  // 架着机枪时右下那块弹药读数换成**机枪**的：同一个元素、同一套低弹/空膛配色，
  // 不另画一块小字面板 —— 两套口径并排，玩家会读成两件不同的事。
  // 备弹照步枪口径折成发数（板数 × 每板），不是「3 板」。
  const empView = ctx.emplacement?.View() || null;
  ctx.hud.SetState({
    wounded: ctx.player.wounds.length > 0,
    bleeding: ctx.player.bleeding,
    bandages: ctx.player.bandages,
    breath: ctx.player.breathHold,
    order: ctx.state.order,
    ammo: empView ? empView.rounds : ctx.state.ammo,
    clips: empView ? empView.belts : ctx.state.clips,
    magazine: empView ? empView.beltRounds : weapon?.magazine ?? 0,
    armed: empView ? !empView.dead : Number(weapon?.magazine) > 0,
    infiniteAmmo: !empView && ctx.sandbox?.armory?.ammoMode === "infinite",
    infiniteReserve: !empView && !!ctx.sandbox?.armory,
    grenades: ctx.state.grenades,
    bundles: ctx.state.bundles,
    mortar: ctx.combat.MortarReady ? ctx.combat.MortarLeft : 0,
    cooking: ctx.state.cooking ? Math.min(1, ctx.state.cook / 1.1) : 0,
  });
  // 标准 FPS 规则：准心固定屏幕中心。枪体动画不能拖着 HUD 基准移动；
  // 默认难度下 AimDirection 与 ViewDirection 共轴，开镜时机械瞄具也解到同一中心。
  // 缝画的是**这一枪真实的散布锥**（player.SpreadDeg），不是手感常数 —— 见 Hud.SetCrosshair。
  // 大刀与手榴弹没有散布可言，给固定小十字，别拿步枪的锥去骗人。
  // 枪械须同时有弹药类型和弹仓；没有独立散布数值的机枪也使用 Player 的默认精度。
  // 架着机枪时准心画的是**机枪**的散布锥（Script_Emplacement 的 spreadDeg），
  // 不是背上那支步枪的 —— 拿步枪的锥去骗人比不画还差。
  const firearm = empView ? true : !!weapon?.ammo && weapon.magazine > 0;
  const spreadDeg = empView ? empView.spreadDeg * ctx.player.firearmHandling.SpreadScale(WEAPONS[ctx.emplacement.Emplacement(empView.id)?.kind.weaponId]) : (firearm ? ctx.player.SpreadDeg(weapon) : 0);
  // 弹药块的闲置自隐（COD《战争世界》）：数字变了由 Hud.SetState 自己拨；
  // 数字没变的交互 —— 扣着扳机、开镜看一眼 —— 在这里拨。架着机枪时那块读的是机枪，
  // 右键意图在 emplacedAds（input.ads 已被机枪那条封掉）。
  if (ctx.player.Alive && firearm && (ctx.input.fire || ctx.input.ads || ctx.emplacedAds)) ctx.hud.Touch("combat");
  ctx.hud.SetCrosshair({
    // 抬着东西时准心收掉：枪不在手上，画一个散布锥就是在骗人。
    // 架着机枪反过来**要**留着：弹道收敛到准心指着的那个点上（EMPLACED_CONVERGE_M）。
    visible: DIFFICULTY.showCrosshair !== false && ctx.player.Alive
      && (empView || GunReadyFromCover(ctx.player.gunClearance, ctx.viewmodel.wallLower))
      && !ctx.state.ordersOpen && !ctx.state.cutscene && !ctx.meleeCombat?.Active && !ctx.carry?.Blocking && !ctx.p012Runtime?.binocularOwned && !ctx.missionRuntime?.EmptyHands,
    spreadDeg,
    fovDeg: ctx.camera.fov,
    viewportHeight: window.innerHeight,
    armed: firearm,
    grenade: !!ctx.state.cooking,
    sprint: ctx.player.sprint,
    ads: ctx.player.ads,
    dt,
  });
  // 准心指着谁。写实档（targetInfo=false）整条链短路，不扫也不投射线。
  ctx.hud.SetTarget(ctx.SANDBOX_RANGE?.identify === false || ctx.missionRuntime?.frontShow?.bunker.CameraActive ? null : ctx.identify.Update(dt, {
    eye: ctx._idEye.copy(ctx.player.EyePosition),
    dir: ctx.player.AimDirection(ctx._idAim),
    soldiers: ctx.ai.soldiers,
    // extras：载具与固定火力点按 Script_Identify 的字段契约挂进来。
    // 战车系统还没进正片（Data_Levels 的 vehicles 仍是设计数据），所以现在是空的。
    detail: ctx.player.Alive && !ctx.state.ordersOpen && !ctx.state.cutscene && !ctx.meleeCombat?.Active
      ? (ctx.SANDBOX_RANGE?.targetDetail === false ? false : DIFFICULTY.targetInfo ?? "basic") : false,
    spreadDeg,
  }), phase.hud);
  ctx.hud.SetSuppression(ctx.player.suppression);
  // 屋内伏击那一拍自带一个提示环，共用的底部僵持进度卡这时候让位（其余场合照旧）。
  const cinematicPrompt = ctx.missionRuntime?.AmbushPromptView?.() || null;
  ctx.hud.SetCinematicBeat(ctx.missionRuntime?.AmbushCinematic === true);
  ctx.hud.SetCinematicPrompt(cinematicPrompt);
  ctx.hud.SetMeleeQte(ctx.missionRuntime?.AmbushCinematic ? null : (ctx.meleeCombat?.View() || null));
  ctx.sandbox?.UpdatePanel?.(ctx.state.frame);
  // 按住型交互的进度环 + 负重条。两者都只读脱敏快照，HUD 不认识规则层的结构。
  ctx.hud.SetInteractProgress(ctx.interact?.View() || null);
  ctx.hud.SetCarry(ctx.carry?.View() || null);
  ctx.hud.SetWeaponUiVisible(!ctx.missionRuntime?.EmptyHands);
  for(const entry of ctx.setpieceProps.values())if(entry.woundedActor&&entry.root.visible)ctx.UpdateWoundedActor(entry.woundedActor,dt);
  // 架设机枪面板（热条 / 弹药 / 卡壳 / 退出提示）。同样只读脱敏快照。
  ctx.hud.SetEmplacement(empView);
  // 报码纸（终章亲手发报）。同样只读脱敏快照。
  ctx.hud.SetTelegraph(ctx.telegraph?.View() || null);
  // 受伤反馈三层（底噪 / 红闪 / 濒死搏动）＋ 来弹方位，见 Hud.SetHurt。
  // 这里原来是一行 `SetDamage(Clamp01(1 - health/70) * 0.62)` ——
  // 满血挨一发三八式（当时 39.6 点）之后暗角只有 0.088 × 边缘 0.52 ≈ 看不见，
  // 而再挨一发人就没了。玩家说的"连红框都没有"指的就是这一行。
  ctx.hud.SetHurt({
    health: ctx.player.health,
    flash: ctx.player.hitFlash,
    marks: ctx.player.hitMarks,
    yaw: ctx.player.yaw,
  });
  ctx.PlayHurtCues();
  const markerObjectives = phase.hud?.objectiveMarkers === false ? [] : ctx.battlefield.objectives;
  ctx.hud.UpdateMarkers(markerObjectives, ctx.camera, (x, y, z) => {
    ctx._proj.set(x, y, z);
    const dist = ctx._proj.distanceTo(ctx.camera.position);
    ctx._proj.project(ctx.camera);
    return {
      x: (ctx._proj.x * 0.5 + 0.5) * window.innerWidth,
      y: (-ctx._proj.y * 0.5 + 0.5) * window.innerHeight,
      visible: ctx._proj.z < 1 && Math.abs(ctx._proj.x) < 1 && Math.abs(ctx._proj.y) < 1,
      dist,
    };
  }, ctx.state.objectiveIndex);
  // 活手榴弹进入实际爆炸伤害范围才提示；屏内钉住落点，屏外贴边指方向。
  // 单独再投影一次最多只有四颗，避免把目标路标与爆炸警告绑成一套生命周期。
  ctx.hud.UpdateGrenadeWarnings(ctx.combat.GrenadeThreats(ctx.player.position), ctx.player, (x, y, z) => {
    ctx._proj.set(x, y, z);
    // 先在视空间判「在镜头前还是身后」：身后的点经透视除法会翻到对面，
    // 屏幕坐标不能再当方向用（HUD 那边对身后的弹退回按 yaw 算方位）。
    ctx._proj.applyMatrix4(ctx.camera.matrixWorldInverse);
    const behind = ctx._proj.z >= 0;
    ctx._proj.set(x, y, z).project(ctx.camera);
    return {
      x: (ctx._proj.x * 0.5 + 0.5) * window.innerWidth,
      y: (-ctx._proj.y * 0.5 + 0.5) * window.innerHeight,
      visible: !behind && ctx._proj.z > -1 && ctx._proj.z < 1 && Math.abs(ctx._proj.x) < 1 && Math.abs(ctx._proj.y) < 1,
      behind,
    };
  });
  ctx.hud.UpdateMinimap(dt, {
    player: ctx.player, objectives: ctx.battlefield.objectives, soldiers: ctx.ai.soldiers, bounds: ctx.battlefield.bounds,
  });
  ctx.hud.Update(dt);
  // 敌军 AI 覆盖层排在 HUD 之后、渲染之前：它读的是这一帧决策完的状态。
  // 默认关；开着的时候也只是 DOM，画面本身一个像素都不动。
  ctx.UpdateAiDebugOverlay();
  ctx.profiler.E("hud");
}

export function PlayStepRender(ctx, f) {
  const dt = f.dt, render = f.render;
  // --- 渲染 ---
  if (!render) {
    // Manual simulation still emits spatial audio. Keep its listener at the
    // simulated viewpoint, just as RenderScene does after a displayed frame.
    ctx.camera.updateWorldMatrix(true, false);
    ctx.audio.SetListener(ctx.camera);
    return;
  }
  ctx.RenderScene(dt);
}

/** 这一组的步骤（id → 函数），Script_Main 合进 PLAY_STEP_FUNCS。 */
export const PRESENT_STEPS = {
  hud: PlayStepHud,
  render: PlayStepRender,
};
