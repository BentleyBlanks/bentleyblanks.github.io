// 调试口 window.Tengxian（= window.Taierzhuang，同一个对象）：测试脚本与出图脚本驱动游戏的唯一入口（docs/Data_DebugApi.md）。
// 开机时 Script_Main.Boot 调 InstallDebugApi(ctx) 一次；顶层挂主文件里的对象，Debug 由三组系统各自声明后合起来，
// 之后测试场、编辑器、菜单、白盒再往 Debug 上各挂自己的口。名字是 183 个测试脚本的契约：只加不改，改名要同步改测试。

import { RANGE_PHASE, RANGE_RESPAWN_S, RANGE_STATIONS } from "./Data_Range.mjs";
import { WEAPONS } from "./Data_Weapons.mjs";
import { LIMB_IDS as GORE_LIMB_IDS } from "./Script_Dismemberment.mjs";
import { FrameDebugAgent } from "./Script_FrameDebugAgent.mjs";
import { DeathLibrary, HitReactionEnabled, HitReactionOf, PreloadDeathLibrary, SetHitReactionEnabled } from "./Script_HitReactionLayer.mjs";
import { LoadMeleeAnimations, MeleeAnimationsLoaded } from "./Script_MeleeAnimationData.mjs";
import { SandboxDebugStubs } from "./Script_SandboxRanges.mjs";
import { SetShadowSkipEnabled, ShadowSkipCount } from "./Script_ShadowSkip.mjs";
import { TerrainTrailSystem } from "./Script_TerrainTrails.mjs";
import * as THREE from "three";
import { PlayerDebugApi } from "./Script_DebugApiPlayer.mjs";
import { WorldDebugApi } from "./Script_DebugApiWorld.mjs";
import { MissionDebugApi } from "./Script_DebugApiMission.mjs";

export function InstallDebugApi(ctx) {
  window.Taierzhuang = {
    // Debug 由三组系统各自声明（Script_DebugApi{Player,World,Mission}），名字不许重（DebugApiTest 守）
    // gi 是取值器：探针体默认不构造，运行时打开（ApplyGraphics）才补建，
    // 拷值出去的话冒烟与剖析脚本拿到的永远是 boot 时那个 null
    renderer: ctx.renderer, scene: ctx.scene, camera: ctx.camera, post: ctx.post, sky: ctx.sky, lights: ctx.lights, library: ctx.library, profiler: ctx.profiler, FrameDebugger: ctx.frameDebugger,
    // agent / 脚本查帧：纯 JSON 的捕获、筛事件、读原始像素、像素历史（docs/Data_FrameDebugger.md「Agent 接口」）
    FrameDebug: new FrameDebugAgent(ctx.frameDebugger, { Step: () => ctx.StepFrames(1) }),
    // 阴影烘焙子树跳过（Script_ShadowSkip）：取证脚本读登记数、同页 A/B 开关
    shadowSkip: { Count: ShadowSkipCount, SetEnabled: SetShadowSkipEnabled },
    // 骨头子树遍历剪枝（Script_BonePrune）：同页 A/B 开关、剪掉的根数与节点数
    bonePrune: ctx.bonePrune,
    // 阴影趟静态投影体合批（Script_ShadowCasterBatch）：同页 A/B 开关、成员数与组数
    shadowCasterBatch: ctx.shadowCasterBatch,
    shadowInstanceCulling: ctx.shadowInstanceCulling,
    // 预通道静态合批（Script_PrepassStaticBatch）：同页 A/B 开关、成员数与组数
    prepassStaticBatch: ctx.prepassStaticBatch,
    // 材质着色升级那一包（POM / 细节法线 / 微阴影 / 地平线 / 皮肤）：
    // Debug Rendering 面板按它设假彩色编号，MaterialUpgradeTest 按它做 A/B。
    materialShading: ctx.shadingUniforms, RecompileAllMaterials: ctx.RecompileAllMaterials,
    get gi() { return ctx.gi; }, get firstPersonSelfShadow() { return ctx.firstPersonSelfShadow; },
    get Particles() { return ctx.vfx.particles; },
    get ParticleEditor() { return ctx.editor?.activeId === 'vfx' ? ctx.editor.active : null; },
    get MenuParticles() { return ctx.commandRoom?.atmosphere?.particles ?? null; },
    player: ctx.player, ai: ctx.ai, vfx: ctx.vfx, viewmodel: ctx.viewmodel, hud: ctx.hud, audio: ctx.audio, state: ctx.state, actorFactory: ctx.actorFactory, actorBatch: ctx.actorBatch, input: ctx.input,
    // 音频接线层：取证走 Debug.AudioZone，专项冒烟要直接摸缓存与限速器
    // （Script_AudioWiringTest 换探针世界之前必须先把 1 m 网格缓存清掉）。
    audioWiring: ctx.audioWiring,
    get meleeCombat() { return ctx.meleeCombat; },
    story: ctx.story, combat: ctx.combat, interact: ctx.interact, carry: ctx.carry, emplacement: ctx.emplacement, wheel: ctx.wheel, strafe: ctx.strafe, flare: ctx.flare, telegraph: ctx.telegraph,
    companion: ctx.companion, checkpoint: ctx.checkpoint, setpieces: ctx.setpieces,
    // 机队实例：出图脚本要能给任意一架摆手动姿态，核对模型机头朝向。
    get aircraft() { return ctx.aircraft; },
    // 白刃全身动画库是否已灌入（Data_MeleeAnimationSets）；测试摆姿势前要看它。
    get meleeAnimationsLoaded() { return MeleeAnimationsLoaded(); },
    LoadMeleeAnimations,
    StepFrames: ctx.StepFrames, JumpToPhase: ctx.JumpToLevel, AdvanceLevel: ctx.AdvanceLevel,
    // FrameProfileTest 的 GI 消融走设置面板同一条路（graphics.gi + ApplyGraphics）
    graphics: ctx.graphics, ApplyGraphics: ctx.ApplyGraphics, autoQuality: ctx.autoQuality, GraphicsProfile: ctx.graphicsProfileApi,
    // 通关冒烟用的口子：直接驱动动作，不必去合成键盘事件
    Debug: {
      ...PlayerDebugApi(ctx),
      ...WorldDebugApi(ctx),
      ...MissionDebugApi(ctx),
    },
  };
  // battlefield 与 nav **每换一关都会被换成新的一份**（切片重建）。
  // 写成普通属性的话，调试口会一直指着上一关那份已经 Dispose 掉的城 ——
  // 表现是"取证读出来的碰撞盒表是空的"，而代码看起来完全正确。所以用取值器。
  Object.defineProperty(window.Taierzhuang, "battlefield", { get: () => ctx.battlefield });
  Object.defineProperty(window.Taierzhuang, "physics", { get: () => ctx.physics });
  Object.defineProperty(window.Taierzhuang, "nav", { get: () => ctx.navGrid });

  // 别名：全局名沿用 Taierzhuang 是为了不动出图脚本与两个冒烟（三处都按它取运行时），
  // 但这个项目现在是滕县，新写的东西一律用 window.Tengxian。**两个名字是同一个对象。**
  window.Tengxian = window.Taierzhuang;
  // 开机那趟 EnterLevel 排在 window.Taierzhuang 建起来之前，所以测试场的取证口要在这儿再挂一次
  //（换关时那一支在 InstallSandbox 里）；常驻的那几个（不在那个测试场时返回 null）也在这儿挂。
  Object.assign(window.Taierzhuang.Debug, SandboxDebugStubs(() => ctx.sandbox));
  ctx.RegisterSandboxDebug();
  window.Taierzhuang.Debug.Clock = () => ctx.clock.State();

  // --- 靶场取证口（只在 ?range=1 下存在；口径在 docs/Data_TestRange.md） ----
  // 人机共用：agent 用 State/Targets 断言、GoTo/AimAt 摆位，真人在旁边看同一片场。
  // 输入不在这里另开门：开枪/开镜/上刺刀/投弹照旧走 Debug.Fire / Key / Mouse / Throw
  // 的真事件链 —— 测的是键位与玩法，不是函数。
  window.Taierzhuang.Debug.TerrainDeformation = {
    State: () => ctx.battlefield.deformation?.State(),
    Height: (x, z) => ctx.battlefield.GroundHeight(x, z),
    BaseHeight: (x, z) => ctx.battlefield.BaseGroundHeight(x, z),
    Reset: () => ctx.battlefield.deformation?.Reset(),
  };
  // 断肢取证口。**所有关卡都挂**（不只测试场）：正片里也要能一句话验「打死人不报错」。
  // 契约在 docs/Data_Dismemberment.md §8.3，别改签名。
  window.Taierzhuang.Debug.Gore = {
    State: () => ctx.gore?.State() || null,
    Limbs: () => [...GORE_LIMB_IDS],
    /**
     * 直接对一名士兵卸一段肢体。走的是**正片那条死亡链**（Kill → Ragdoll → Sever），
     * 不是绕过规则层的后门；已经倒下的人则直接 Sever（Kill 对死人返回 false）。
     * @param {number} soldierId 士兵 id
     * @param {string} limbId 肢体名（Limbs() 里的一个）
     * @param {[number,number,number]|null} dir 卸出去的方向，默认沿断口轴
     */
    Sever: (soldierId, limbId, dir = null) => {
      const soldier = ctx.ai?.soldiers.find((s) => s.id === soldierId) || null;
      if (!soldier || !ctx.gore) return null;
      const direction = dir ? new THREE.Vector3(dir[0], dir[1], dir[2]) : null;
      const plan = { limbs: [limbId], kind: "debug", point: null };
      if (soldier.alive) soldier.Kill(direction, plan);
      else ctx.gore.Sever(soldier, plan.limbs, { direction, kind: plan.kind });
      return ctx.gore.State();
    },
    // 顺手写回 graphics.gore：不写的话下一次 ApplyGraphics（改个窗口大小就够）
    // 会拿设置面板那一位把这里刚关掉的又打开。
    SetEnabled: (value) => {
      ctx.graphics.gore = value !== false;
      return ctx.gore?.SetEnabled(value !== false);
    },
    SetForce: (kind) => ctx.gore?.SetForce(kind || null) ?? null,
    Reset: () => { ctx.gore?.ReleaseAll(); return ctx.gore?.State() || null; },
  };
  // 地面脚印与痕迹取证口（docs/Data_TerrainTrails.md §6）。?trails=0 关采集。
  // Read 同步读回痕迹靶一个世界点（0..255 的 [坑深, 泥边, 踩乱]），别在帧循环里用。
  window.Taierzhuang.Debug.TerrainTrails = {
    Describe: () => ({ ...TerrainTrailSystem.Describe(), pass: ctx.post.terrainTrailsPass?.Describe() ?? null,
      preset: ctx.post.preset?.terrainTrails ?? null }),
    Stamp: (o) => TerrainTrailSystem.Stamp(o),
    Read: (x, z) => ctx.post.terrainTrailsPass?.ReadTexel(ctx.renderer, x, z) ?? null,
    SetEnabled: (value) => TerrainTrailSystem.SetEnabled(value !== false),
    Reset: () => TerrainTrailSystem.Reset(),
  };
  // 受击物理反应取证口（docs/Data_HitReaction.md §2.4）。**所有关卡都挂**；?hitreact=0 关整层。
  // Hit 走正片 TakeHit 链（扣血、可致死、方向死亡）；Impulse 只打冲量不扣血（调参、拍对照图用）。
  {
    const Soldier = (id) => ctx.ai?.soldiers.find((s) => s.id === id) || null;
    const Vec = (a) => (a ? new THREE.Vector3(a[0], a[1], a[2]) : null);
    const Descriptor = (soldier, o, lethal) => ({
      kind: o.kind || "bullet", part: o.part || "torso", shapeId: o.shapeId || null, point: Vec(o.point), pointExact: !!o.point,
      direction: Vec(o.dir || [0, 0, 1]).normalize(), sweep: Vec(o.sweep), blastOrigin: Vec(o.blastOrigin),
      damage: o.damage ?? 75, rawDamage: o.damage ?? 75, weaponId: o.weaponId || null, lethal, seed: soldier.actor?.seed ?? soldier.id,
    });
    window.Taierzhuang.Debug.HitReaction = {
      Hit: (id, o = {}) => {
        const s = Soldier(id);
        if (!s) return null;
        const dir = Vec(o.dir || [0, 0, 1]).normalize();
        const died = s.TakeHit(o.damage ?? 75, o.part || "torso", dir,
          { kind: o.kind || "bullet", shapeId: o.shapeId || null, point: Vec(o.point), pointExact: !!o.point,
            sweep: Vec(o.sweep), blastOrigin: Vec(o.blastOrigin), weaponId: o.weaponId || null });
        return { died: !!died, health: s.health };
      },
      Impulse: (id, o = {}) => {
        const s = Soldier(id);
        return s?.alive ? s.actor?.ReceiveHit(Descriptor(s, o, false)) ?? null : null;
      },
      State: (id) => {
        const s = Soldier(id);
        const layer = s?.actor?.characterRig?.hitReaction;
        return layer ? layer.Describe() : { active: false, enabled: HitReactionEnabled(), layer: false };
      },
      SetEnabled: (value) => SetHitReactionEnabled(value !== false),
      Enabled: () => HitReactionEnabled(),
      Preload: () => PreloadDeathLibrary().then((lib) => !!lib),
      Library: () => { const lib = DeathLibrary(); return lib ? { revision: lib.revision, clips: [...lib.clips.keys()], profiles: lib.profiles } : null; },
      Layer: (id) => HitReactionOf(Soldier(id)?.actor)?.Describe() ?? null,
    };
  }
  if (ctx.RANGE) {
    const RangeTargetSnapshot = (entry) => {
      const s = entry.soldier;
      return {
        id: entry.spec.id, station: entry.spec.station,
        x: entry.spec.x, z: entry.spec.z,
        alive: !!(s && s.alive),
        health: s ? s.health : 0,
        deadTime: s && !s.alive ? s.deadTime : 0,
        distance: s ? Math.hypot(s.position.x - ctx.player.position.x,
          s.position.z - ctx.player.position.z) : null,
      };
    };
    window.Taierzhuang.Debug.Range = {
      /** 一眼总览：工位、靶况、击倒/复位计数、玩家武器与弹药 —— 验收的唯一入口。 */
      State: () => ({
        stations: RANGE_STATIONS.map((z) => ({ id: z.id, name: z.name, x: z.x, z: z.z })),
        targets: ctx.rangeTargets.map(RangeTargetSnapshot),
        stats: { ...ctx.rangeStats },
        player: {
          x: ctx.player.position.x, z: ctx.player.position.z, yaw: ctx.player.yaw, pitch: ctx.player.pitch,
          health: ctx.player.health, alive: ctx.player.alive,
          ads: ctx.player.ads, fov: ctx.camera.fov,
          slot: ctx.state.activeSlot, weapon: ctx.currentWeapon,
          ammo: ctx.state.ammo, clips: ctx.state.clips, grenades: ctx.state.grenades,
          bayonetFixed: ctx.state.bayonetFixed,
        },
        pinned: ctx.state.pinned,
        respawnS: RANGE_RESPAWN_S,
      }),
      Targets: () => ctx.rangeTargets.map(RangeTargetSnapshot),
      /** 瞬移到某个工位（RangeRifle / RangeGrenade / RangeMelee），面朝各自靶道。 */
      GoTo: (stationId) => {
        const zone = RANGE_STATIONS.find((z) => z.id === stationId);
        if (!zone) return null;
        ctx.player.Spawn(zone.x, zone.z, zone.ry ?? 0);
        return { id: zone.id, x: zone.x, z: zone.z, yaw: ctx.player.yaw };
      },
      /**
       * 把视线摆到某个靶子身上。只摆 yaw/pitch，开火仍走 Debug.Fire ——
       * 散布、后坐、开镜収束照旧全在链路里。
       *
       * offsetY 默认 = **躯干判定中心** COMBAT.hitbox.centerY（与 MarchBullet 读的
       * 是同一份数，判定球半径 COMBAT.hitbox.radius）。两条要知道的账：
       *   · TryFire 是先施加本发的枪口上跳再采样弹道（「顶上去 100%」的设计），
       *     所以首发会比瞄点高出 kick × 距离 —— ADS 下约 0.9°，25 m 处 ≈ 0.4 m。
       *     远靶验命中要么瞄低、要么用近靶（RangeTest 用的 R10）。
       *   · 命中几何只有那一个球（爆头是 TryFire 里按概率抽的，不是几何），
       *     所以别瞄头 —— 那条线从球上方擦过去就是脱靶。
       */
      AimAt: (targetId, offsetY = ctx.HITBOX.centerY) => {
        const entry = ctx.rangeTargets.find((e) => e.spec.id === targetId);
        const s = entry ? entry.soldier : null;
        if (!s) return null;
        const from = ctx.player.EyePosition;
        const dx = s.position.x - from.x;
        const dy = (s.position.y + offsetY) - from.y;
        const dz = s.position.z - from.z;
        const horiz = Math.hypot(dx, dz) || 1;
        ctx.player.yaw = Math.atan2(-dx, -dz);
        ctx.player.pitch = Math.atan2(dy, horiz);
        ctx.player.aimYaw = 0;
        ctx.player.aimPitch = 0;
        return { yaw: ctx.player.yaw, pitch: ctx.player.pitch, distance: Math.hypot(dx, dy, dz) };
      },
      /** 整场复位：靶子全部立即重立，玩家满血满弹，击倒/复位计数清零。 */
      Reset: () => {
        for (const entry of ctx.rangeTargets) {
          if (entry.soldier) ctx.ai.Remove(entry.soldier);
          entry.soldier = ctx.SpawnRangeTarget(entry.spec);
          entry.deadCounted = false;
        }
        ctx.rangeStats.killed = 0;
        ctx.rangeStats.respawned = 0;
        ctx.rangeStats.resets += 1;
        ctx.player.health = 100;
        ctx.player.bleeding = false;
        const loadout = RANGE_PHASE.loadoutOverride;
        ctx.state.mags.primary = { ammo: WEAPONS[loadout.primary].magazine, clips: loadout.spareClips };
        // 副武器是捡来的那支（靶场携行表里没有）：身上有就给它也补满。
        const secondary = ctx.state.slots.secondary;
        ctx.state.mags.secondary = secondary
          ? { ammo: WEAPONS[secondary].magazine, clips: 2 }
          : { ammo: 0, clips: 0 };
        const mag = ctx.state.mags[ctx.state.activeSlot];
        if (mag) { ctx.state.ammo = mag.ammo; ctx.state.clips = mag.clips; }
        ctx.state.grenades = loadout.throwables.Grenade;
        return window.Taierzhuang.Debug.Range.State();
      },
    };
  }
}
