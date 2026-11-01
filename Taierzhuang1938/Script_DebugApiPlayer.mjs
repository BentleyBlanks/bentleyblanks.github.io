// 调试口 window.Tengxian.Debug 的一组：玩家这一侧：键鼠、武器、动作、交互、准星与指针锁（docs/Data_DebugApi.md）。
// 主文件里的状态、服务、函数一律从工具箱 ctx 取；名字与签名是测试脚本的契约，改名要同步改测试。

import { DIFFICULTY } from "./Data_Battle.mjs";
import { TRAVERSAL } from "./Data_Traversal.mjs";
import { PLAYER_GUN_SLOTS, PlayerSlotKey, WEAPONS } from "./Data_Weapons.mjs";
import { CrosshairGeometry } from "./Script_Hud.mjs";
import { IDENTIFY } from "./Script_Identify.mjs";

export function PlayerDebugApi(ctx) {
  return {
      Reload: ctx.Reload,
  DoMelee: ctx.DoMelee,
      Throw: (kind, power) => {
        ctx.state.cooking = kind; ctx.state.cook = (power ?? 0.8) * 1.1; ctx.ReleaseCook();
      },
      Fire: () => { ctx.input.fire = true; ctx.fireEdge = true; ctx.TryFire(1, ctx.combat.Returning); ctx.input.fire = false; ctx.fireEdge = false; },
      // 键位路由：合成一次键盘事件走完整条链路（KEYMAP -> 上下文 -> OnAction），
      // 不许直接调 SwitchSlot —— 那样测的是函数，不是键位表。
      // 不给 down 就是"点按"：按下**并且松开**。
      // 只发 keydown 的话，InputRouter 会把第二次按下当成长按的自动重复直接吃掉
      // （held 里还留着这个 code），于是"按 1 再按 2 再按 1"只有头一次生效 ——
      // 通关冒烟里"切不回长枪"就是这么来的，而真人按键盘不会漏掉抬起。
      Key: (code, down) => {
        const Send = (type) => document.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
        if (down === undefined) { Send("keydown"); Send("keyup"); return; }
        Send(down ? "keydown" : "keyup");
      },
      // 按住/松开鼠标键（白刃蓄力等按住型输入要用；Fire 那条只覆盖单帧点击）
      Mouse: (button = 0, down = true) => {
        document.dispatchEvent(new MouseEvent(down ? "mousedown" : "mouseup", { button, bubbles: true }));
      },
      // 一次鼠标位移。**不走 mousemove 事件**：那条链路要查指针锁，而出图/测试
      // 模式下根本拿不到锁，查了就等于测试里转不了头。要测的是"位移进来之后
      // 视线怎么走"，指针锁归属另有冒烟覆盖。
      Look: (dx = 0, dy = 0) => { ctx.input.lookX += dx; ctx.input.lookY += dy; },
      Wheel: (delta) => {
        document.dispatchEvent(new WheelEvent("wheel", { deltaY: delta, bubbles: true }));
      },
      // 某个武器槽的数字键 code（"melee" → "Digit3"）。测试走 Key(SlotKey(...))，
      // 不写死数字：槽位表一改，大刀和投掷物的键就会前后挪。
      SlotKey: (slot) => PlayerSlotKey(slot),
      Slots: () => ({
        active: ctx.state.activeSlot, weapon: ctx.currentWeapon, loadout: ctx.state.loadoutId, order: [...ctx.SLOT_ORDER],
        slots: { ...ctx.state.slots }, variants: { ...ctx.state.weaponVariants }, lastGunSlot: ctx.state.lastGunSlot,
        // 背着的那支枪的账（手里那支以 ammo/clips/bayonetFixed 为准，换枪时才对账）。
        mags: Object.fromEntries(PLAYER_GUN_SLOTS.map((slot) => [slot, { ...ctx.state.mags[slot] }])),
        bayonets: { ...ctx.state.bayonets }, bayonetFixed: ctx.state.bayonetFixed, ammo: ctx.state.ammo, clips: ctx.state.clips,
        viewmodel: ctx.viewmodel.weaponId, viewmodelVariant: ctx.viewmodel.weaponVariant,
        fireMode: ctx.state.fireMode, bipod: ctx.player.bipod, ads: ctx.player.ads,
      }),
      LastShot: () => (ctx.state.lastShot ? { ...ctx.state.lastShot } : null),
      // 受击反馈的运行时状态。红闪与来弹方位都是**事件**（自己衰减），
      // 不是血量的函数，所以必须从这里取证，不能从 health 反推。
      /** 相机震动取证（Script_CameraShake）：创伤值、五个偏移、各类事件计数。 */
      Shake: () => ctx.player?.shake?.State() ?? null,
      Hurt: () => ({
        health: ctx.player.health, bleeding: ctx.player.bleeding, flash: ctx.player.hitFlash,
        marks: ctx.player.hitMarks.map((m) => ({ x: m.x, z: m.z, life: m.life })),
        wounds: ctx.player.wounds.length, alive: ctx.player.alive,
      }),
      /**
       * 命中回执的取证口（见 ConfirmHit）。**打出去的**那一侧，
       * 与上面 Hurt() 的 marks（打进来的方位）是两件事，别串。
       * marks 是按时间顺序的 "hit"/"kill" 序列，cues 是真的排进 WebAudio 的那两条 ——
       * 只断言 marks 会漏掉"写实档关了记号、听觉回执也一起没了"这一类回归。
       */
      Hits: () => ({
        marks: ctx.hud.confirms.slice(),
        cues: { hit: ctx.audio.RequestedCount("hitConfirm"), kill: ctx.audio.RequestedCount("killConfirm") },
        markerOn: DIFFICULTY.hitMarker !== false,
        visual: ctx.hud.HitmarkState(),
      }),
      // --- 第 3 批的取证口 ---
      // 翻越：翻过几次、此刻在不在半空、脚下多高（上墙要靠这个高度取证）
      Vault: () => ({
        count: ctx.player.vaultCount, active: ctx.player.vault.active,
        kind: ctx.player.vault.kind, rise: ctx.player.vault.rise, mantles: ctx.player.mantleCount,
        y: ctx.player.position.y, x: ctx.player.position.x, z: ctx.player.position.z,
        aiVaults: ctx.ai.vaultCount,
      }),
      /** 通行高度阶梯（Data_Traversal）。测试按它取判据，别在断言里抄数。 */
      Traversal: () => ({ ...TRAVERSAL }),
      // 跳跃：起跳次数、滞空/落地边沿与视图模型动作位移。
      Jump: () => ({
        count: ctx.player.jump.count, grounded: ctx.player.grounded,
        y: ctx.player.position.y, velocityY: ctx.player.velocity.y,
        airTime: ctx.player.jump.airTime, landSerial: ctx.player.jump.landSerial,
        landImpact: ctx.player.jump.landImpact, runK: ctx.player.jump.runK,
        viewY: ctx.viewmodel.statePivot.position.y,
        viewPitch: ctx.viewmodel.statePivot.rotation.x,
      }),
      // 下水：淹了多深、算不算下水。软墙的三条代价（慢/不能开枪/掉体力）都挂在它上面
      Water: () => ({
        depth: ctx.player.waterDepth, inWater: ctx.player.InWater, stamina: ctx.player.stamina,
      }),
      // 交互：够得着什么、捡过几次、分过几次弹、注册了哪些交互点
      Interact: () => {
        const c = ctx.interact.Query(ctx.player);
        return {
          kind: c ? c.kind : null, label: c ? c.label : null,
          gesture: c ? c.gesture : null,
          pickups: ctx.interact.pickups, handouts: ctx.interact.handouts,
          pickedUp: ctx.state.pickedUp, pickedUpVariant: ctx.state.pickedUpVariant ?? 0, weapon: ctx.currentWeapon,
          ...ctx.interact.State(),
        };
      },
      /**
       * 往地上放一把枪（与换枪丢下的那把同一条路：InteractSystem 记账 + BuildGroundWeaponView 摆模型）。
       * 拾枪测试用它摆靶，不必去杀一个人再等尸体摔稳。返回登记条目的 id。
       */
      /** 被冲击波震脱手的枪（Script_LooseGun）：State 取证；Enable 开关；Release 立刻撒手（不等倒地，探针用）。 */
      LooseGun: {
        State: () => ctx.LooseGunState(),
        Enable: (on = true) => { ctx.looseGun.enabled = !!on; return ctx.looseGun.enabled; },
        Release: (push = { regime: "fall", dirX: 0, dirZ: 1, horizontalMps: 2 }) => (ctx.IsGunSlot(ctx.state.activeSlot) && WEAPONS[ctx.currentWeapon]
          ? !!ctx.ReleaseLooseGun(push) : false),
      },
      DropWeapon: (weaponId, { x, z, yaw = 0, ammo = null, clips = 0 } = {}) => {
        if (!ctx.interact || !WEAPONS[weaponId]) return null;
        const item = ctx.interact.DropGroundWeapon({
          weaponId, ammo: ammo ?? WEAPONS[weaponId].magazine ?? 0, clips, yaw,
          position: { x, y: ctx.battlefield.GroundHeight(x, z), z },
        });
        if (item) ctx.BuildGroundWeaponView(item);
        return item?.id ?? null;
      },
      /**
       * 负重取证口。摆点是集成批的事，这里给的是**驱动 + 取证**：
       *   Debug.Carry.Begin("stretcher", { canDrop:false })  直接抬起来（跳过交互点）
       *   Debug.Carry.Force("dive")                          脚本强行松手（第一关扑入路沟）
       *   Debug.Carry.State()                                规则层 + HUD 两侧一起取
       * `speedScale` 读的是**玩家身上那个字段**，不是表里的数 ——
       * 「规则算出来了但没写进玩家」正是这一类接线最容易漏的一环。
       */
      Carry: {
        Begin: (kindId, opts) => ctx.carry.Begin(kindId, opts),
        Drop: (reason) => ctx.carry.Drop(reason),
        Throw: (reason) => ctx.carry.Throw(reason),
        Force: (reason) => ctx.carry.ForceRelease(reason),
        Reset: (reason) => ctx.carry.Reset(reason),
        Anchor: () => ctx.carry.PartnerAnchor(ctx.player),
        State: () => ({
          ...ctx.carry.State(),
          playerSpeedScale: ctx.player.carrySpeedScale,
          gunVisible: !!ctx.viewmodel?.root?.visible,
          hud: ctx.hud.CarryState(),
        }),
      },
      /**
       * 架设机枪取证口。摆点是集成批的事，这里给的是**驱动 + 取证**：
       *   Debug.Emplacement.Create({...})        摆一挺（不带交互点，直接用）
       *   Debug.Emplacement.Occupy(id)           上枪位（等价于玩家按 F）
       *   Debug.Emplacement.Fire(true/false)     扣住/松开扳机
       *   Debug.Emplacement.Jam(id)              脚本触发的必然失效（§6 阶段⑩②）
       *   Debug.Emplacement.State()              规则层 + HUD + 世界模型三侧一起取
       * `gunVisible` 读的是**视图模型那个字段**，不是规则层的推断 ——
       * 「规则说收枪了但画面没收」正是这一类接线最容易漏的一环。
       */
      Emplacement: {
        Create: (spec) => ctx.emplacement.CreateEmplacement(spec),
        Occupy: (id) => ctx.emplacement.Occupy(id, ctx.player),
        Vacate: (reason) => ctx.emplacement.Vacate(reason),
        Fire: (down) => { ctx.debugEmplacedFire = down !== false; return ctx.emplacement.SetFire(ctx.debugEmplacedFire); },
        Bolt: () => ctx.emplacement.PullBolt(),
        // 名字不叫 Clear：`emplacement.Clear(tag)` 是「按 tag 收掉战位」，
        // 这一条是「按住 R 排小卡」，同名会在取证脚本里被读反。
        HoldClear: (down) => (down === false ? ctx.emplacement.EndClear() : ctx.emplacement.BeginClear()),
        Reload: () => ctx.emplacement.Reload(),
        Resupply: (id, belts) => ctx.emplacement.Resupply(id, belts),
        Jam: (id, opts) => ctx.emplacement.ForceJam(id, opts),
        State: () => ({
          ...ctx.emplacement.State(),
          gunVisible: !!ctx.viewmodel?.root?.visible,
          playerYaw: ctx.player.yaw, playerPitch: ctx.player.pitch,
          worldModels: [...ctx.emplacementViews.entries()]
            .map(([id, view]) => ({ id, hasModel: !!view.root })),
          hud: ctx.hud.EmplacementState(),
        }),
      },
      Prompts: () => ctx.hud.actionPrompts.map((prompt) => ({ ...prompt })),
      /**
       * 准心与目标识别的取证口。
       * 准心那三个数必须一起读：`spreadDeg` 是 Player.SpreadDeg 的真值，
       * `gap` 是 HUD 真正画出来的缝，`expected` 是按当前视场重算的应画值 ——
       * 三者对不上就说明准心又在自说自话（这正是 2026-08-25 那次返工的病根）。
       */
      Reticle: () => {
        const weapon = WEAPONS[ctx.currentWeapon];
        const firearm = !!weapon?.ammo && weapon.magazine > 0;
        const spreadDeg = firearm ? ctx.player.SpreadDeg(weapon) : 0;
        const drawn = ctx.hud.CrosshairState();
        return {
          ...drawn,
          armed: firearm,
          fov: ctx.camera.fov,
          viewportHeight: window.innerHeight,
          expected: CrosshairGeometry({
            spreadDeg, fovDeg: ctx.camera.fov, viewportHeight: window.innerHeight,
            sprint: ctx.player.sprint, armed: firearm,
          }).gap,
          sprint: ctx.player.sprint,
          ads: ctx.player.ads,
        };
      },
      Target: () => ({
        card: ctx.hud.TargetState(),
        detail: DIFFICULTY.targetInfo ?? "basic",
        entityId: ctx.identify.entity?.id ?? null,
        stats: { ...ctx.identify.stats },
        cone: IDENTIFY.coneDeg,
      }),
      AdsOffset: () => ({ x: ctx.viewmodel.adsOffset.x, y: ctx.viewmodel.adsOffset.y }),
      Ammo: () => ({ ammo: ctx.state.ammo, clips: ctx.state.clips, grenades: ctx.state.grenades, bundles: ctx.state.bundles }),
      // --- 枪感第 2 轮的取证口 ---
      // 顿挫量、冲刺闸门、sway 输入。四条方子有没有真的接上只能从这里读。
      GunFeel: () => ({
        firePunch: ctx.firePunch,
        fovBase: ctx.graphics.fov,
        fov: ctx.camera.fov,
        sprintBlocked: ctx.player.sprint > 0.35
          || (ctx.state.elapsed - ctx.sprintReleaseAt) < ctx.SPRINT_FIRE_DELAY_S,
        sinceSprint: ctx.state.elapsed - ctx.sprintReleaseAt,
        swayYaw: ctx.viewmodel.lookSway ? ctx.viewmodel.lookSway.yaw : null,
        lastLookDeltaYaw: ctx.lastLookDeltaYaw,
        lowAmmo: ctx.state.ammo <= 1,
        boltOpen: ctx.viewmodel.boltOpen,
        breathHold: ctx.player.breathHold,
        breathFov: ctx.breathFov,
        breathHoldHintCount: ctx.state.breathHoldHintCount,
      }),
      // 指针锁：解锁通道有没有真的接上。fake=true 说明走的是页内假后端
      // （webdriver / 出图），真指针锁一次都没碰 —— 见 FAKE_POINTER_LOCK 的注释。
      PointerLock: () => ({
        locked: ctx.PointerLocked(),
        element: ctx.PointerLocked() ? "canvas" : null,
        fake: ctx.FAKE_POINTER_LOCK,
        browserLocked: document.pointerLockElement !== null,
        mouseFree: ctx.altMouseFree,
        dragLook: ctx.lockUnavailable,
        // raw input 有没有真的要到，以及尖刺闸门丢过几个假位移（见 AcceptLookMotion）
        rawInput: ctx.rawInputActive, rawInputSupported: ctx.rawInputSupported,
        spikesDropped: ctx.lookSpike.dropped, lastSpike: ctx.lookSpike.last,
      }),
      ReleasePointerLock: ctx.ReleasePointerLock,
      RequestPointerLock: ctx.RequestPointerLock,
      // 模拟浏览器吞掉 Esc、只抛 pointerlockchange 的真实路径；菜单冒烟锁死这条回归。
      DropPointerLock: () => {
        if (ctx.FAKE_POINTER_LOCK) {
          if (ctx.fakeLocked) { ctx.fakeLocked = false; ctx.OnPointerLockChange(); }
        } else if (document.pointerLockElement && typeof document.exitPointerLock === "function") {
          document.exitPointerLock();
        }
      },
      // 「仗有没有真的在打」只能从运行时取证：全场开火累计（AI + 玩家）、
      // AI 的状态分布、两侧的阵亡计数。读源码是推断不出来的。
      FireCount: () => ctx.ai.fireCount + ctx.state.playerShots,
  };
}
