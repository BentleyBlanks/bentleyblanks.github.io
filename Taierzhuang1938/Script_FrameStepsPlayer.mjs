// 正常游戏每帧的步骤：玩家这一侧（docs/Data_FrameSchedule.md）。
// 一步一个 PlayStep<Id>(ctx, f)；先后只由 Data_FrameSchedule.FRAME_PLAY_STEPS 决定，这里的书写顺序不算数。
// 主文件里的状态、服务、函数一律从工具箱 ctx 取（ctx.player、ctx.RenderScene()……）；f 是这一帧在步骤之间传的量。
// 结束这一帧用 return STOP，不写裸 return;（门禁 FrameScheduleTest）。

import { BREATH_HOLD, FREE_AIM } from "./Data_Tuning_Player.mjs";
import { WEAPONS } from "./Data_Weapons.mjs";
import { Clamp01 } from "./Script_Noise.mjs";
import { TerrainTrailSystem } from "./Script_TerrainTrails.mjs";
import { T } from "./Script_Text.mjs";

export function PlayStepDeathTimer(ctx, f) {
  const dt = f.dt;
  if (ctx.state.deathTimer > 0) {
    ctx.state.deathTimer -= dt;
    if (ctx.state.deathTimer <= 0 && ctx.state.pendingRespawn) {
      if (ctx.sandbox?.holdsRespawn) { /* Keep the test result until the player restarts. */ }
      else if (ctx.state.nraPool > 0) ctx.RespawnPlayer();
      else ctx.hud.Say(null, T("hud.say.noOneLeft"), 8);
    }
  }
}

export function PlayStepInput(ctx, f) {
  const realDt = f.realDt;
  ctx.profiler.B("input");
  if (ctx.meleeCombat) {
    ctx.sandbox?.BeforeMeleeUpdate?.();
    ctx.meleeCombat.Update(realDt);
    ctx.sandbox?.AfterMeleeUpdate?.();
  }
  const firePrev = ctx.input.fire;
  ctx.ReadKeys();
  ctx.p012BinocularRaised = !!ctx.p012Runtime?.binocularOwned && !!ctx.input.ads;
  if (ctx.p012Runtime?.binocularOwned) { ctx.input.fire = false; ctx.input.ads = false; }
  ctx.EnsureDebugInventory();
  if (ctx.meleeCombat?.CanUse()) { ctx.input.fire = false; ctx.input.ads = false; }
  if (ctx.meleeCombat?.Blocking) {
    ctx.input.forward = 0; ctx.input.strafe = 0; ctx.input.sprint = false;
    ctx.input.fire = false; ctx.input.ads = false;
    ctx.input.crouchPressed = false; ctx.input.pronePressed = false; ctx.input.stanceRequested = null;
  }
  // 架着机枪：人钉在射手位上。移动/冲刺/换姿势一并封掉，**左键留着**
  // （它这会儿是机枪的扳机）。与白刃 QTE 同一条封法，不另起一套。
  // 右键照 COD 新作的固定机枪：贴着照门收窄视野精瞄。它不走 player.ads ——
  // 那条是手上步枪的开镜（视图模型、两脚架闸、准心淡出），枪这会儿背在背上；
  // 这里只把意图记进 emplacedAds 给相机 FOV，并按同一张 FREE_AIM.adsLookScale 压转向。
  if (ctx.BlockoutInputCaptured() || ctx.sandbox?.CapturesInput?.()) {
    ctx.input.forward = 0; ctx.input.strafe = 0; ctx.input.sprint = false; ctx.input.fire = false; ctx.input.ads = false;
    ctx.input.crouchPressed = false; ctx.input.pronePressed = false; ctx.input.stanceRequested = null;
  }
  // 白盒编辑器的飞行观察：鼠标位移转的是飞行相机（走的还是游戏自己的那条输入链：指针锁 / 假后端 / 锁不住时按住右键拖动），
  // 玩家本人不转头、不探身（Q / E 在飞行里是升降）。灵敏度与玩家转头同一口径。
  if (ctx.BLOCKOUT && ctx.blockout?.flying) {
    const flySens = (ctx.input.sensitivity ?? 1) * FREE_AIM.sensitivityScale;
    ctx.blockout.FlyLook(-ctx.input.lookX * flySens, -ctx.input.lookY * flySens);
    ctx.input.lookX = 0; ctx.input.lookY = 0; ctx.input.lean = 0;
  }
  ctx.emplacedAds = !!ctx.emplacement?.Mounted && !!ctx.input.ads && ctx.player.Alive;
  if (ctx.emplacement?.Mounted) {
    ctx.input.forward = 0; ctx.input.strafe = 0; ctx.input.sprint = false; ctx.input.ads = false;
    ctx.input.crouchPressed = false; ctx.input.pronePressed = false; ctx.input.stanceRequested = null;
    const lookScale = 1 - ctx.adsFovT * FREE_AIM.adsLookScale;
    ctx.input.lookX *= lookScale; ctx.input.lookY *= lookScale;
  }
  ctx.fireEdge = ctx.input.fire && !firePrev;
  ctx.profiler.E("input");
}

export function PlayStepCarry(ctx, f) {
  const dt = f.dt;
  // 负重必须排在 player.Update **之前**：它写的 carrySpeedScale 就是这一帧
  // 玩家要用的那个乘数，写晚一帧就会出现「刚抬起来还能冲刺一步」。
  ctx.carry?.Update(dt, ctx.player);
  ctx.playerVent.Update(dt);
}

export function PlayStepPlayer(ctx, f) {
  const dt = f.dt;
  ctx.profiler.B("player");
  ctx.input.diveSpeedMps = ctx.p012Runtime?.DiveSpeed(ctx.strafe?.View());
  ctx.player.meleePose = ctx.meleeCombat?.ViewPose();
  ctx.missionRuntime?.BeforePlayer(dt,ctx.input);
  const playerFrame = ctx.player.Update(dt, ctx.input, WEAPONS[ctx.currentWeapon], {
    allowUndeployedAds: !!ctx.SANDBOX_PLUGIN?.phase.whitebox?.allowUndeployedAds,
    blockLean: !!ctx.emplacement?.Mounted || !!ctx.carry?.Blocking || !!ctx.missionRuntime?.EmptyHands
      || !!ctx.state.cooking || !!ctx.meleeCombat?.Blocking
      || ["reload", "melee", "meleeWind", "fixBayonet", "throw"].includes(ctx.viewmodel.action?.kind),
  });
  if (playerFrame?.stanceBlockReason === "proneSlope") {
    ctx.hud.Hint(T("hud.hint.proneSlopeBlocked"), 2);
  }
  ctx.player.UpdateGunClearance(ctx.emplacement?.Mounted || ctx.carry?.Blocking || ctx.missionRuntime?.EmptyHands ? null : WEAPONS[ctx.currentWeapon]);
  ctx.SyncJumpSound();
  if (ctx.sandbox?.updateSlot === "afterPlayer") ctx.sandbox.Update(dt);
  ctx.profiler.E("player");
}

export function PlayStepEmplacement(ctx, f) {
  const dt = f.dt;
  // 架设机枪同样排在 player.Update **之后**：射界限位要夹的是这一帧的视线，
  // 夹晚一帧画面就会先越界再被拉回来。
  if (ctx.emplacement) {
    ctx.emplacement.SyncNpc(ctx.ai.soldiers);
    // 按住 R 排小卡。R 在键位表里是 press（没有松手边沿），所以按住这件事
    // 直接问 router 要 —— 比给 R 改成 holdAction 安全：那样 Reload() 会被调两次。
    if (ctx.emplacement.Mounted && ctx.router?.Down("KeyR")) ctx.emplacement.BeginClear();
    else ctx.emplacement.EndClear();
    ctx.emplacement.Update(dt, ctx.player);
    ctx.SyncMountedView(dt);
    ctx.SyncEmplacementViews();
    // 「刚下枪位」那一个边沿：把上枪位之前的姿态还回去。用边沿而不是在 Vacate 里做，
    // 是因为离位有四条路（玩家按 F、人倒了、换关、战位被收掉），一条条挂钩会漏。
    const mountedNow = ctx.emplacement.MountedId;
    if (ctx.mountedIdLast && !mountedNow && ctx.seatStanceBefore) {
      ctx.player.stance = ctx.seatStanceBefore;
      ctx.seatStanceBefore = null;
    }
    ctx.mountedIdLast = mountedNow;
  }
}

export function PlayStepInteract(ctx, f) {
  const dt = f.dt;
  // 按住型交互反过来要排在 player.Update **之后**：够不够得着要用这一帧的位置，
  // 玩家走开一步进度就该断，而不是在后台接着读条。
  ctx.interact?.Update(dt, ctx.player);
  // 被冲击波震脱手的枪：撒手、飞、落地停稳后交给 interact 当地上的枪；弯腰捡的那一下（Script_LooseGun）。
  ctx.StepLooseGuns(dt);
  // 发报：码组推进与底噪。排在 interact **之后** —— 那一层这一帧刚可能
  // 把一组发出去。**什么都不封**：玩家可以边发边走开，进度留着（§7 不夺控制权）。
  ctx.telegraph?.Update(dt, ctx.player);
}

export function PlayStepHands(ctx, f) {
  // 负重与架设机枪都要收枪（两只手都占着 / 枪背在背上）。**只在边沿写 visible**：
  // 过场、菜单、倒地镜头三处也在切同一个字段，每帧写会互相盖掉。
  // 抬着东西的人被打死时负重会在同一帧卸掉，不挡住的话枪会在尸体镜头里冒出来。
  ctx.SyncMissionHands();
  const handsBusy = !!ctx.carry?.Blocking || !!ctx.p012CarryView?.rig.root.visible
    || (!!ctx.emplacement?.Blocking && !ctx.mountView.active) || !!ctx.p012Runtime?.binocularOwned;
  if (ctx.viewmodel?.root && ctx.carryHidGun !== handsBusy) {
    ctx.carryHidGun = handsBusy;
    if (!ctx.state.cutscene && !ctx.state.menu && ctx.player.Alive) ctx.viewmodel.root.visible = !ctx.carryHidGun;
  }
  ctx.input.lookX = 0; ctx.input.lookY = 0;
  ctx.input.crouchPressed = false; ctx.input.pronePressed = false; ctx.input.stanceRequested = null;
}

export function PlayStepFoley(ctx, f) {
  const dt = f.dt;
  // 脚步、落地、身体 foley 全部交给 Script_AudioWiring。
  //
  // 【2026-09-08】原来这里是两段写死的逻辑，各有一处硬伤：
  //   · 落地固定播 footstepRubble + bodyFall —— bodyFall 是**一个人倒下**
  //     （装具散开、四肢先后落地），于是每次跳窗台都像旁边有人被打死；
  //   · 脚步按 `state.frame % 3` 在瓦砾与土路之间轮 —— 听感是「每走三步换一次地面」，
  //     而脚底下到底是什么从来没有人问过。
  // 现在按脚下真实材质查（射线拿碰撞盒 tag + 水深），姿态与冲刺分别给音量与步距，
  // 姿态切换/翻越出布料声、冲刺出装具声、跑久了或伤重出喘息。
  ctx.audioWiring.Update(dt, ctx.state.frame, ctx.SURFACE_BY_TAG);

  // 地面脚印与痕迹（docs/Data_TerrainTrails.md）：这里只收落脚（人物按真实脚骨、玩家按步距），
  // 画进痕迹靶是帧图 terrainTrails 那一趟的事。过场里玩家不留印（机位在演，身子不在那）。
  TerrainTrailSystem.Update(dt, { focus: ctx.camera.getWorldPosition(ctx.trailFocus),
    player: ctx.state.cutscene || ctx.state.menu ? null : ctx.player, scene: ctx.scene });
}

export function PlayStepPrompts(ctx, f) {
  // 情境操作提示：每六帧扫一次。F 查询会遍历全场士兵，0.1 s 一次已经足够跟手；
  // 同一轮也重算换枪与包扎条件，保证 HUD 不会提示一个实际做不了的动作。
  if (ctx.state.frame % 6 === 0) {
    ctx.profiler.B("hud");
    ctx.UpdateContextualActionPrompts();
    ctx.profiler.E("hud");
  }
}

export function PlayStepFirearms(ctx, f) {
  const dt = f.dt;
  // Mark the actual sprint release before this frame can fire. The raise and
  // the 220ms readiness window run together instead of adding two waits.
  const sprintOn = ctx.player.sprint > 0.35 && ctx.input.sprint && !ctx.player.wantAds;
  if (ctx.sprintWasOn && !sprintOn) ctx.sprintReleaseAt = ctx.state.elapsed;
  ctx.sprintWasOn = sprintOn;
  ctx.UpdateReloadRequest();
  if (ctx.player.Alive) ctx.TryFire(dt, ctx.combat.Returning);
  else ctx.ClearFirearmRequests();
  // 松开左键时把攥着的手榴弹扔出去（投掷物槽里左键 = G 键的等价物）
  if (ctx.state.activeSlot === "throwable" && ctx.state.cooking && !ctx.input.fire) ctx.ReleaseCook();
  // 白刃蓄力步进。鼠标那条的"松手"在这里判（键盘那条走 OnAction 的 up 边沿）；
  // 蓄力中死了就取消 —— 尸体不出招。
  if (ctx.state.meleeCharge) {
    ctx.state.meleeCharge.t += dt;
    if (!ctx.player.Alive) { ctx.state.meleeCharge = null; ctx.viewmodel.CancelMeleeCharge?.(); }
    else if (ctx.state.meleeCharge.source === "mouse" && !ctx.input.fire) ctx.ReleaseMeleeCharge();
  }
}

export function PlayStepCameraFov(ctx, f) {
  const dt = f.dt;
  // 开镜时相机 FOV 收缩 —— 铁瞄的"贴脸"感来自这一下。
  // 屏息相对普通开镜再放大约 1.1×：这是"憋住那一口气把注意力收拢"的视觉说法，
  // 也让玩家一眼知道自己确实在屏息（我们不给体力条）。
  //
  // 【2026-08-19 按战地 datamine 重做，两条】
  //
  // 一、**FOV 过渡是固定 150 ms 的，跟哪支枪无关。** BFV 全部 82 支枪的
  //    AimingFovTransitionTime 都是 0.15 s —— 枪的轻重差异**全在视图模型的动画里**，
  //    不在相机上。我们原来是「每枪不同的 ads 速度」再串一层 dt*9 的指数平滑
  //    （≈231 ms 才到位），两层滞后叠在一起，结果手枪和捷克式在相机上反应几乎
  //    一样糊 —— 分不出轻重，方向正好做反了。
  //    现在相机走自己那条 150 ms 的线性过渡，枪的轻重仍由 adsTimeS 在动画上体现。
  //
  // 二、**拉栓/装填强制退出瞄准。** BF1 的栓动枪拉栓会强制退出瞄准镜，那一下
  //    「丢失瞄准画面」对栓动枪分量的贡献，比那 2° 后坐大得多。
  //    Script_Viewmodel 早就在做了（adsInput 乘了 actionBlend），但相机一直没跟上：
  //    枪都甩出画面了视野还是窄的 —— 玩家看到的是「视野卡住了」，不是「在拉栓」。
  const weapon = WEAPONS[ctx.currentWeapon];
  // 只数真正拿着火器进入 ADS 的上升沿；空手、望远镜、过场和菜单不消耗三次教学。
  const tutorialAds = ctx.state.running && !ctx.state.menu && !ctx.state.cutscene && ctx.player.Alive
    && Number(weapon?.magazine) > 0 && ctx.player.wantAds;
  if (tutorialAds && !ctx.state.breathHoldHintAds
    && ctx.state.breathHoldHintCount < BREATH_HOLD.tutorialAdsCount) {
    ctx.state.breathHoldHintCount += 1;
    ctx.hud.Hint(T("hud.hint.breathHold"));
  }
  ctx.state.breathHoldHintAds = tutorialAds;
  const adsHeld = ctx.player.wantAds || ctx.emplacedAds ? 1 : 0;
  const fovStep = dt / ctx.ADS_FOV_TIME;
  ctx.adsFovT = adsHeld > ctx.adsFovT ? Math.min(adsHeld, ctx.adsFovT + fovStep)
    : Math.max(adsHeld, ctx.adsFovT - fovStep);
  // 架着机枪时镜头倍率取**机枪**那支枪的 adsFovScale（与步枪同一条 150 ms 过渡），
  // 背上步枪的视图模型曲线不参与：它这会儿不在瞄准线上，也不该把机枪的视野拽回来。
  const mountedWeapon = ctx.emplacement?.Mounted
    ? WEAPONS[ctx.emplacement.Emplacement(ctx.emplacement.MountedId)?.kind.weaponId] || null : null;
  const fovWeapon = mountedWeapon || weapon;
  // 拉栓/装填期间乘上视图模型自己那条脱离瞄准的曲线（Script_Viewmodel.adsSuppress）。
  // 用它、而不是在这儿另起一个 150 ms 的 snap，是因为因果要对：
  // 视野丢失是**枪离开了瞄准线**的结果，两者本来就该是同一条曲线。
  const adsEff = ctx.adsFovT * (ctx.emplacement?.Mounted ? 1 : (ctx.viewmodel.adsSuppress ?? 1));
  // 屏息放大单独平滑：它跟开镜不是一回事，snap 会"啵"一下。
  ctx.breathFov += ((ctx.player.breathHold ? BREATH_HOLD.fovScale : 1) - ctx.breathFov)
    * Clamp01(dt * BREATH_HOLD.fovLerpRate);
  const baseFov = ctx.graphics.fov * (1 - adsEff * (1 - (fovWeapon?.adsFovScale ?? 0.75))) * ctx.breathFov;

  // 枪感方子 2：开火顿挫。85 ms 衰减，**平方**衰减让前两帧吃掉六成 ——
  // 那一下才是"顿"而不是"晃"。叠在 FOV 上 1.9°，约等于开镜变化量的 12%。
  //
  // 关于「把 FOV 追踪系数 dt*9 提到 dt*26」那一条：**那个系数已经不存在了。**
  // 上一轮照战地 datamine 把相机侧的指数平滑整个换成了固定 150 ms 的线性过渡
  //（见上面那段注释），camera.fov 现在是每帧直接赋值的，没有任何一层平滑会
  // 把 1.9° 抹平。所以这一条方子的目的（"别让顿挫被插值吃掉"）现在由结构保证，
  // 不需要那个魔法数。这不是漏做，是前提变了。
  if (ctx.firePunch > 0) {
    ctx.firePunch = Math.max(0, ctx.firePunch - dt / ctx.FIRE_PUNCH_DECAY_S);
  }
  const punch = ctx.firePunch * ctx.firePunch;
  // 第一关 01 受困段把视野收窄（Script_FirstLevelFrontShow.NarrowFovDeg 管平滑）；
  // 其它时候原样返回基准 FOV，这一层不改任何既有手感。
  const missionFov = ctx.missionRuntime?.NarrowFovDeg?.(baseFov, dt) ?? baseFov;
  const targetFov = ctx.p012BinocularRaised ? 25 : missionFov + punch * ctx.FIRE_PUNCH_FOV_DEG;
  if (Math.abs(ctx.camera.fov - targetFov) > 0.001) {
    ctx.camera.fov = targetFov;
    ctx.camera.updateProjectionMatrix();
  }
  ctx.p012Binoculars?.Update({owned:!!ctx.p012Runtime?.binocularOwned,raised:ctx.p012BinocularRaised},dt);
  f.weapon = weapon;
}

export function PlayStepView(ctx, f) {
  const dt = f.dt;
  // 枪感方子 3：**把视线增量接进 sway。**
  // 限幅、增量换算在 Script_FirearmHandling.LookSway；这里只负责算出每帧转了多少。
  // 算增量要用**枪口方向**（yaw + aimYaw），不是视线：自由瞄准那一段偏移
  // 本来就是"枪还没跟上"的一部分，漏掉它枪会在自由瞄准范围内诡异地不动。
  const viewYaw = ctx.player.yaw + ctx.player.aimYaw;
  const viewPitch = ctx.player.pitch + ctx.player.aimPitch;
  let dYaw = viewYaw - ctx.lastViewYaw;
  // 绕过 ±π 那一圈：不处理的话转身穿过背后时会甩出一个 2π 的假增量，
  // 枪会整个飞出画面（弹簧限幅救不了，因为输入本身错了三个数量级）
  if (dYaw > Math.PI) dYaw -= Math.PI * 2;
  else if (dYaw < -Math.PI) dYaw += Math.PI * 2;
  const dPitch = viewPitch - ctx.lastViewPitch;
  ctx.lastViewYaw = viewYaw;
  ctx.lastViewPitch = viewPitch;
  ctx.lastLookDeltaYaw = dYaw;

  // 第一人称持枪移动检查：替身眼睛抄这一帧的玩家眼睛，Viewmodel 挂在它下面（没开工具 = 空操作）。
  ctx.editor?.SyncOverlayEye(ctx.camera);
  ctx.profiler.B("viewmodel");
  if (!ctx.player.Alive && ctx.viewmodel.deathHands) ctx.UpdatePlayerDeath();
  else {
  if (ctx.mountView.active) ctx.MountedViewPose();
  ctx.viewmodel.Update(dt, {
    // 被冲击波掀倒时枪跟着放下去（借贴墙收枪那一层；Script_PlayerKnockback.GunLower）
    wallLower: ctx.mountView.active ? 0 : Math.max(ctx.player.gunClearance.lower, ctx.player.knock?.GunLower ?? 0),
    playerPosition: ctx.player.position, playerYaw: ctx.player.yaw,
    // 第一人称身体的落脚点跟地形起伏（Script_FirstPersonGait：只取相对玩家脚下的高差）。
    bodyGroundAt: ctx.BodyGroundAt,
    carryBodyVisible: !!ctx.p012CarryView?.rig.root.visible && !ctx.state.cutscene && !ctx.state.menu && ctx.player.Alive,
    carryBodyYaw: ctx.p012CarryView?.bodyYaw,
    carryBodyCrouch: ctx.p012CarryView?.BodyCrouch || 0,
    // 第一人称的腿和身子：白刃倒地、被冲击波掀倒横在地上时都藏起来（那套站姿身体对不上）
    meleeCameraDrop: Math.max(ctx.player.meleeCameraDrop, ctx.player.knock?.BodyHidden ? 1 : 0),
    prone: ctx.player.stanceBlend.prone, alive: ctx.player.Alive,
    dt, moveSpeed: Clamp01(Math.hypot(ctx.player.velocity.x, ctx.player.velocity.z) / 3.2),
    strafe: ctx.input.strafe, grounded: ctx.player.grounded, sprint: ctx.player.sprint,
    verticalVelocity: ctx.player.velocity.y,
    ads: ctx.mountView.active ? (ctx.emplacedAds ? 1 : 0) : ctx.player.ads, lookDeltaYaw: dYaw, lookDeltaPitch: dPitch,
    // 自由瞄准的**绝对**偏移（不是增量）：枪要真的指到那儿去。
    // 没有这两条的话，2° 锥内推鼠标只有弹道在偏、画面一动不动 ——
    // 而本作没有准星，玩家读不到任何东西（见 docs/Data_GunFeelReview.md 末节）。
    freeAimYaw: ctx.player.aimYaw, freeAimPitch: ctx.player.aimPitch,
    crouch: ctx.player.stanceBlend.crouch, elapsed: ctx.state.elapsed,
    // 枪感方子 1 的另一半：最后一发打完栓停在后面不推回。
    // 即使 HUD 已显示弹药，枪机停后仍是玩家不移开视线就能读到的空仓通道。
    lowAmmo: ctx.state.ammo <= 0,
    ammo: ctx.emplacement?.Mounted ? ctx.emplacement.Emplacement(ctx.emplacement.MountedId)?.rounds : ctx.state.ammo,
    meleeCombat: ctx.sandbox?.PreviewPose?.(ctx.player, ctx.meleeCombat?.ViewPose()) ?? (ctx.meleeCombat?.ViewPose() || null),
    // 近爆的身体反应：收枪、缩肩、手臂慢半拍、之后手抖（Script_BlastFlinch.arms；没在反应时是 null）。
    blastFlinch: ctx.player.flinch?.Active ? ctx.player.flinch.arms : null,
  });
  // 弯腰捡震脱手的枪：抓到之前右手（空手）伸向地上那把（Script_LooseGun.GunReachPose）。
  if (ctx.looseGun.recover && !ctx.viewmodel.weapon && ctx.looseGun.recover.reach > 0) ctx.viewmodel.ReachWorld(ctx.looseGun.recover.atV, ctx.looseGun.recover.reach);
  }
  ctx.profiler.E("viewmodel");
}

/** 这一组的步骤（id → 函数），Script_Main 合进 PLAY_STEP_FUNCS。 */
export const PLAYER_STEPS = {
  deathTimer: PlayStepDeathTimer,
  input: PlayStepInput,
  carry: PlayStepCarry,
  player: PlayStepPlayer,
  emplacement: PlayStepEmplacement,
  interact: PlayStepInteract,
  hands: PlayStepHands,
  foley: PlayStepFoley,
  prompts: PlayStepPrompts,
  firearms: PlayStepFirearms,
  cameraFov: PlayStepCameraFov,
  view: PlayStepView,
};
