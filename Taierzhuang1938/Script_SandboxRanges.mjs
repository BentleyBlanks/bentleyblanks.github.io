// 测试场插件（docs/Data_SandboxRanges.md）：每个测试场在这里交代「用哪片场地、哪张关卡表、建什么、
// 每帧排在哪儿跑、要不要接管慢放 / 输入 / 相机、调试口叫什么」。装配层 Script_Main 只认「当前有没有一个
// 测试场插件」，按下面的统一接口调它，不再认识布料、断肢这些名字。登记表（网址开关与通用待遇）在
// Data_SandboxRanges。
//
// 插件实例的接口（都可缺省）：
//   debugName / api   挂到 window.Tengxian.Debug[debugName] 的取证口（名字与改造前一字不差）
//   updateSlot        每帧在哪儿跑：afterPlayer（玩家移动之后）/ beforeAi（AI 之前）/ afterCombat（战斗结算之后）
//   ownsFrame         整帧交给测试场（布料）：只跑它自己、天空灯光与画面
//   Update(dt) / UpdateCamera(dt) / ScaleDt(dt) / CapturesInput() / ApplyCamera(camera) / Dispose()
//   PostOptions()    当前镜头的后期参数，随插件一起销毁
//   OnInstalled()     装配层把它记成当前测试场之后再调（枪械射击要先登记再补弹药）
//   armory            枪械射击场的弹药规则（装配层的补给、换弹、HUD 读它）
//   Maintain()        补兵那个 3 秒节拍里调（靶场、白刃实验场复位木桩兵）；没有就不补兵
//   holdsRespawn      倒下后不换人；OnPlayerDown() 返回 true = 倒下由测试场接管
//   BeforeMeleeUpdate() / AfterMeleeUpdate() / PreviewPose(entity, pose)  白刃层每帧前后、动作预览换姿势
//   OnKey(detail)     键先给测试场看（返回 undefined = 不归它管）；ActionPrompts() 返回整条底部提示
//   UpdatePanel(frame)  HUD 那一步里刷新测试场自己的面板
//
// 插件模块可选的 startup：轻量开机（只加载列出的 PBR 组与音效，不预载担架、飞机、弹坑碎屑）。
// sceneryOnly 供纯环境机位使用，跳过人物和前景道具的预载。
// graphicsProfile 供原画 / 正式场景预览使用，走固定画质而不装玩家的画面偏好。
//
// 宿主 `host` 是装配层交过来的「工具箱」：场地、玩家、相机、各系统，以及几只装配层自己的函数
// （抢指针锁、藏枪模、给手榴弹、换枪补给），以及主文件的工具箱 ctx（靶场与白刃实验场的运行时整块读写主文件状态时用）。

import { SANDBOX_RANGES } from "./Data_SandboxRanges.mjs";
import { EncounterPlay } from "./Script_EncounterPlay.mjs";
import { ENCOUNTER_PLAY_PHASE } from "./Script_EncounterPlayScene.mjs";
import { ENCOUNTER_PLAY_STARTUP } from "./Data_Tuning_EncounterPlayStartup.mjs";
import { FirstLevelWhiteboxField } from "./Script_FirstLevelWhiteboxField.mjs";
import { CreateScenePreviewBackdrop, CreateScenePreviewPhase } from "./Script_DevTools.mjs";
import { SceneInfo } from "./Data_SceneAssets.mjs";
import { IsSceneCamera } from "./Script_SceneDoc.mjs";
import { RANGE_PHASE } from "./Data_Range.mjs";
import { RangeField } from "./Script_RangeField.mjs";
import { CreateRangeTargets } from "./Script_RangeTargets.mjs";
import { CreateMeleeLab } from "./Script_MeleeLabRuntime.mjs";
import { MELEE_QTE_PHASE } from "./Data_MeleeQte.mjs";
import { EXPLOSION_RANGE_PHASE } from "./Data_ExplosionRange.mjs";
import { ExplosionRangeField } from "./Script_ExplosionRangeField.mjs";
import { ExplosionRange } from "./Script_ExplosionRange.mjs";
import { WEAPON_RANGE_PHASE, WEAPON_RANGE_STARTUP } from "./Data_WeaponRange.mjs";
import { WeaponRangeField } from "./Script_WeaponRangeField.mjs";
import { WeaponRangeRuntime } from "./Script_WeaponRangeRuntime.mjs";
import { MOVEMENT_RANGE_PHASE } from "./Data_MovementRange.mjs";
import { MovementRangeField } from "./Script_MovementRangeField.mjs";
import { MovementRange } from "./Script_MovementRange.mjs";
import { GORE_RANGE_PHASE } from "./Data_GoreRange.mjs";
import { GoreRangeField } from "./Script_GoreRangeField.mjs";
import { GoreRange } from "./Script_GoreRange.mjs";
import { SHELL_IMPACT_RANGE_PHASE } from "./Data_ShellImpactRange.mjs";
import { ShellImpactRangeField } from "./Script_ShellImpactRangeField.mjs";
import { ShellImpactRange } from "./Script_ShellImpactRange.mjs";
import { BATTLE_REACTION_RANGE_PHASE } from "./Data_BattleReactionRange.mjs";
import { BattleReactionRange } from "./Script_BattleReactionRange.mjs";
import { CLOTH_RANGE_PHASE } from "./Data_ClothRange.mjs";
import { ClothRangeField } from "./Script_ClothRangeField.mjs";
import { ClothRange } from "./Script_ClothRange.mjs";
import { HAIR_RANGE_PHASE } from "./Data_HairRange.mjs";
import { HairRangeField } from "./Script_HairRangeField.mjs";
import { HairRange } from "./Script_HairRange.mjs";

/** 把一个测试场运行时包成统一接口；`hooks` 里给的才接，没给的装配层一律不调。 */
function Instance(runtime, hooks = {}) {
  return {
    runtime,
    api: runtime?.api ?? null,
    debugName: null,
    updateSlot: null,
    ownsFrame: false,
    dropDebugOnDispose: false,
    Update(dt) { runtime?.Update?.(dt); },
    Dispose() { runtime?.Dispose?.(); },
    ...hooks,
  };
}

/** 炮击扬尘与人物反应两个场共用的构造参数（改造前装配层就是同一份）。 */
function FireRangeOptions(h) {
  return {
    battlefield: h.battlefield, combat: h.combat, player: h.player, camera: h.camera, scene: h.scene,
    library: h.library, vfx: h.vfx, audio: h.audio, hud: h.hud, canvas: h.canvas,
    CanUse: h.CanUse, Focus: h.Focus, SetViewmodelHidden: h.SetViewmodelHidden,
  };
}

function FixedSceneCamera(host, poseForFrame) {
  const camera = host.camera;
  return () => {
    host.SetViewmodelHidden(true);
    const pose = poseForFrame();
    const radians = Math.PI / 180;
    camera.position.set(...pose.position);
    camera.rotation.set(pose.pitchDeg * radians, pose.yawDeg * radians, 0, "YXZ");
    if (camera.fov !== pose.fovDeg) {
      camera.fov = pose.fovDeg;
      camera.updateProjectionMatrix();
    }
  };
}

const ROADSIDE_DUST_VOLUME = "EastTrackSoilBurst";

function RoadsideSoil(vfx, { x, z }, y) {
  const range = (min,max) => ({ mode:"twoConstants", min, max });
  // Turn the existing ground-colliding soil emitter upward. Its solid clods
  // enter the normal/depth pass and receive the fog at their own position.
  const debris = vfx.FallingSoil({ preset: "SoilHeavyCrumble", config: {
    emitter: { shape:"area", position:[x,y+.065,z], width:.34, length:.32, distribution:"streams",
      streams:4, streamWidth:.084, rotation:[Math.PI,0,-.29], clearance:.018, seed:411806 },
    timing: { mode:"once", duration:.29, frequency:60, quantity:1.35, variation:.16,
      intensity:[[0,1.55],[.38,1.21],[.83,.64],[1,0]] },
    motion: { wind:[.21,0,.12], turbulence:.032 },
    grains: { amount:28, size:range(.003,.027), sizeBias:1.69, speed:range(1.9,6.8), spread:2.85,
      gravity:1.11, drag:.58, life:range(.44,1.1), color:[.045,.035,.029,.83], shutter:.007, minPixel:.36,
      trailOpacity:.6, impactDust:.005, deposit:false, maxParticles:760 },
    clods: { amount:1.58, size:range(.022,.105), sizeBias:1.94, speed:range(1.5,6.6), spread:3,
      gravity:1.02, drag:.31, life:range(.54,1.49), color:[.046,.035,.028,1], aspect:[1,.70,.86],
      maxParticles:42, impactDust:.55, maxBounces:1, fragmentChance:.07 },
    dust: { amount:3.0, size:range(.23,.47), speed:range(.62,4.35), spread:1.46, gravity:.19,
      life:range(.65,1.75), color:[.067,.051,.042,.33], density:1.86, diffusion:2.06, sourceSpread:.14,
      veil:false, aspect:1.20, fadeIn:.024, volumetric:false, impactAmount:.66, maxParticles:86 },
    budget: { distance:48, fadeDistance:12, rayChecks:84, grainCollision:false },
  }}).id;
  const plume = vfx.particles.VolumeBurst([x,y+.012,z], {
    asset:ROADSIDE_DUST_VOLUME, life:1.38,
    density:9.1, color:[1,1,1,.92], fadeIn:.059, seed:26067,
  })?.id;
  return { debris, plume };
}

function SceneryPreview(sceneId, extraPbrSets = [], soilMarker, loadFigures) {
  const phase = CreateScenePreviewPhase(SceneInfo(sceneId));
  return {
    phase, World: FirstLevelWhiteboxField,
    startup: {
      sceneryOnly: true,
      graphicsProfile: "high",
      pbrSets: extraPbrSets && ["Ground", "CraterScorched", "Steel", "WoodStock", "GrenadePbr", "DadaoPbr", ...extraPbrSets],
      audio: { voice: false, ambience: false, music: false, sfx: [] },
    },
    Create(host) {
      const { battlefield, camera, vfx, state } = host;
      const { layout } = battlefield;
      const backdrop = CreateScenePreviewBackdrop(host);
      const volumetrics = host.post.volumetricsPass;
      const fogHandles = (layout.fogVolumes || []).map(({ position: [x, y, z], size: [rx, ry, rz], ...look }) =>
        volumetrics.AddFogVolume({ ...look, position: { x, y, z }, size: { x: rx, y: ry, z: rz } }));
      const spawn = layout.spawn || { x: 0, z: 0, yawDeg: 0 };
      const defaultPose = layout.camera || {
        position: [spawn.x, battlefield.StaticGroundHeight(spawn.x, spawn.z) + 1.65, spawn.z],
        yawDeg: spawn.yawDeg, pitchDeg: 0, fovDeg: 55,
      };
      let pose = defaultPose;
      const ApplyPose = FixedSceneCamera(host, () => pose);
      const impact = soilMarker && layout.landmarks?.find((marker) => marker.id === soilMarker);
      const ground = impact && battlefield.StaticGroundHeight(impact.x, impact.z);
      let untilImpact = .4;
      let impactAge = null;
      let soil = null;
      let figures = null;
      let disposed = false;
      const RemoveSoil = () => {
        if (soil?.debris && vfx.particles.FallingSoil.entries.has(soil.debris)) vfx.particles.FallingSoil.Remove(soil.debris);
        if (soil?.plume && vfx.particles.systems.has(soil.plume)) vfx.particles.Clear(soil.plume);
        soil = null;
      };
      const runtime = {
        api: { SetCamera(next) {
          if (!IsSceneCamera(next)) return false;
          pose = { ...next, position: [...next.position] };
          return true;
        }, State: () => ({
          scene: layout.scene, camera: pose, backdrop: backdrop.Stats(), error: phase.blockout.sceneError,
          props: battlefield.scenePropStats?.stats.props ?? 0,
          propTriangles: battlefield.scenePropStats?.stats.propTriangles ?? 0,
          missing: battlefield.scenePropStats?.missing ?? [],
          terrainTriangles: battlefield.stats.groundTris,
          terrainLayers: battlefield.terrainLayers?.setName ?? null,
          fogVolumes: fogHandles.length,
          terrainSet: battlefield.terrainLayers?.setName,
          smoke: vfx.smokeSources.size,
          ...(loadFigures ? { figures: figures?.ids || [] } : {}),
          ...(impact ? { impactAge, soil: soil ? vfx.particles.FallingSoil.Inspect(soil.debris) : null } : {}),
        }) },
        Update(dt) {
          if (figures && !figures.root.parent) host.scene.add(figures.root);
          if (impact) {
            untilImpact -= dt;
            if (untilImpact <= 0) {
              RemoveSoil();
              soil = RoadsideSoil(vfx, impact, ground);
              untilImpact += 12;
              impactAge = 0;
            }
            if (impactAge !== null) impactAge += dt;
          }
          vfx.Update(dt, camera, state.elapsed);
        },
        Dispose() {
          disposed = true;
          figures?.Dispose();
          for (const handle of fogHandles) volumetrics.RemoveFogVolume(handle);
          RemoveSoil();
          backdrop.Dispose();
          host.SetViewmodelHidden(false);
        },
      };
      return Instance(runtime, {
        debugName: "ScenePreview", ownsFrame: true, dropDebugOnDispose: true,
        OnInstalled: ApplyPose,
        UpdateCamera: ApplyPose,
        PostOptions: () => ({
          ...(pose.vignette === undefined ? {} : { vignette: pose.vignette }),
          ...(pose.nearFocusM ? { nearDofFocus: pose.nearFocusM, nearDofRange: pose.nearFocusM * .6,
            nearDofStrength: .72, nearDofMaxPx: 4.5 } : {}),
        }),
        Warmup: async () => {
          if (impact) vfx.particles.renderer.volumes.Pool(ROADSIDE_DUST_VOLUME);
          const preparingFigures = loadFigures?.(host, layout.landmarks).then(loaded => {
            if (disposed) loaded.Dispose();
            else figures = loaded;
          });
          await Promise.all([vfx.particles.Ready(), preparingFigures]);
        },
      });
    },
  };
}

const PLUGINS = {
  firstLevelScenePreview: SceneryPreview("FirstLevel", null),
  dugoutAidOpenFields: SceneryPreview("DugoutAidOpenFields", null),
  gengjiazhuangFieldApproach: SceneryPreview("GengjiazhuangFieldApproach"),
  gengjiazhuangEastSmoke: SceneryPreview("GengjiazhuangEastSmoke", ["Sandbag"]),
  tanketteAdvanceEastTrack: SceneryPreview("TanketteAdvanceEastTrack",
    ["Sandbag", "WoodCrate", "HandcartWood"], "RoadsideSoilBurst",
    async (host, landmarks) => (await import("./Script_EastTrackFigures.mjs")).BuildEastTrackFigures(host, landmarks)),
  aircraftEvacuationDitch: SceneryPreview("AircraftEvacuationDitch", ["WoodCrate", "WoodBeam", "HandcartWood", "Sandbag"]),
  encounterPlay: {
    phase: ENCOUNTER_PLAY_PHASE, World: FirstLevelWhiteboxField, startup: ENCOUNTER_PLAY_STARTUP,
    Create(h) { return CreateEncounterPlayPluginInstance(h, { mode: "editor" }); },
  },
  movement: {
    phase: MOVEMENT_RANGE_PHASE, World: MovementRangeField,
    Create: (h) => Instance(new MovementRange({ player: h.player, scene: h.scene, battlefield: h.battlefield, CanUse: h.CanUse }),
      { debugName: "MovementRange", updateSlot: "afterPlayer" }),
  },
  weapons: {
    phase: WEAPON_RANGE_PHASE, World: WeaponRangeField, startup: WEAPON_RANGE_STARTUP,
    Create: (h) => {
      const runtime = new WeaponRangeRuntime({
        ai: h.ai, player: h.player, camera: h.camera, state: h.state, actorFactory: h.actorFactory, battlefield: h.battlefield,
        scene: h.scene, library: h.library, interact: h.interact, viewmodel: h.viewmodel,
        Weapon: h.Weapon, Pickup: h.Pickup, Refill: h.Refill,
      });
      return Instance(runtime, {
        debugName: "WeaponRange", updateSlot: "beforeAi", armory: runtime,
        // 补给要先认得「这是枪械射击场」才补成无限：装配层登记完这个实例再补。
        OnInstalled: () => h.EnsureDebugInventory(),
      });
    },
  },
  range: {
    phase: RANGE_PHASE, World: RangeField,
    Create: (h) => Instance(null, CreateRangeTargets(h)),
  },
  explosions: {
    phase: EXPLOSION_RANGE_PHASE, World: ExplosionRangeField,
    Create: (h) => {
      const runtime = new ExplosionRange({
        battlefield: h.battlefield, combat: h.combat, interact: h.interact, player: h.player, ai: h.ai, hud: h.hud, aircraft: h.aircraft,
        GiveGrenade: h.GiveGrenade,
      });
      // 取证口 Debug.Explosions 是常驻的（不在爆炸场时返回 null），见 SandboxDebugStubs。
      return Instance(runtime, {
        updateSlot: "afterCombat",
        api: { State: () => runtime.State() || null, GoTo: (id) => runtime.GoTo(id), Reset: () => runtime.Reset() },
      });
    },
  },
  melee: {
    phase: MELEE_QTE_PHASE, World: RangeField,
    Create: (h) => Instance(null, CreateMeleeLab(h)),
  },
  gore: {
    phase: GORE_RANGE_PHASE, World: GoreRangeField,
    Create: (h) => {
      const runtime = new GoreRange({
        ai: h.ai, player: h.player, camera: h.camera, scene: h.scene, combat: h.combat, battlefield: h.battlefield, renderer: h.renderer,
        // 核心断肢系统的调试口（docs/Data_Dismemberment.md §8.3）。惰性取：建关时可能还没挂好。
        Gore: h.GoreDebug, CanUse: h.CanUse, Focus: h.Focus,
      });
      // 慢动作按钮：乘一个倍率。
      return Instance(runtime, { debugName: "GoreRange", updateSlot: "afterPlayer", ScaleDt: (dt) => dt * runtime.timeScale });
    },
  },
  impacts: {
    phase: SHELL_IMPACT_RANGE_PHASE, World: ShellImpactRangeField,
    Create: (h) => {
      const runtime = new ShellImpactRange(FireRangeOptions(h));
      // 暂停 / 单步 / 慢放；自由观察相机接管输入与相机（玩家留在原地）。
      return Instance(runtime, {
        debugName: "ShellImpact", updateSlot: "afterCombat",
        ScaleDt: (dt) => runtime.ScaleDt(dt),
        CapturesInput: () => runtime.CapturesInput(),
        ApplyCamera: (camera) => runtime.ApplyCamera(camera),
      });
    },
  },
  reactions: {
    // 人物战场反应测试场借炮击扬尘测试场那片场地（壕沟、分层土壤、布景）。
    phase: BATTLE_REACTION_RANGE_PHASE, World: ShellImpactRangeField,
    Create: (h) => {
      const runtime = new BattleReactionRange(FireRangeOptions(h));
      return Instance(runtime, { debugName: "BattleReaction", updateSlot: "afterCombat", ScaleDt: (dt) => runtime.ScaleDt(dt) });
    },
  },
  cloth: {
    phase: CLOTH_RANGE_PHASE, World: ClothRangeField,
    Create: (h) => {
      const runtime = new ClothRange({
        battlefield: h.battlefield, player: h.player, camera: h.camera, scene: h.scene, library: h.library, canvas: h.canvas,
        renderer: h.renderer, post: h.post, state: h.state, CanUse: h.CanUse, SetViewmodelHidden: h.SetViewmodelHidden,
      });
      runtime.UpdateCamera(0);
      // 实验室自己管轨道相机与模拟时间，不走第一人称移动与战斗。
      return Instance(runtime, {
        debugName: "ClothRange", ownsFrame: true, dropDebugOnDispose: true,
        UpdateCamera: (dt) => runtime.UpdateCamera(dt),
      });
    },
  },
  hair: {
    phase: HAIR_RANGE_PHASE, World: HairRangeField,
    Create: (h) => {
      const runtime = new HairRange({
        scene: h.scene, camera: h.camera, canvas: h.canvas, renderer: h.renderer, post: h.post, ctx: h.ctx,
        CanUse: h.CanUse, SetViewmodelHidden: h.SetViewmodelHidden,
      });
      runtime.UpdateCamera(0);
      // 实验室自己管轨道相机；头发切档要等相机放好，所以每帧的头发更新也在 UpdateCamera 里。
      return Instance(runtime, {
        debugName: "HairRange", ownsFrame: true, dropDebugOnDispose: true,
        UpdateCamera: (dt) => runtime.UpdateCamera(dt),
      });
    },
  },
};

/** 遭遇设计试玩与第一关正式战役共用的插件装配（同一份 EncounterPlay 运行时与钩子）。 */
export function CreateEncounterPlayPluginInstance(h, options = {}) {
  const runtime = new EncounterPlay(h, options);
  return Instance(runtime, {
    id: options.mode === "campaign" ? "firstLevelCampaign" : "encounterPlay",
    debugName: "EncounterPlay",
    updateSlot: "beforeAi",
    holdsRespawn: true,
    captureViewportName: "视口 1 · 玩家视角",
    ScaleDt: (dt) => runtime.ScaleDt(dt),
    CapturesInput: () => runtime.CapturesInput(),
    ApplyCamera: (camera) => runtime.ApplyCamera(camera),
    OnKey: (detail) => runtime.OnKey(detail),
    OnPlayerDown: () => runtime.Fail(),
    ViewportSize: () => runtime.view.Size(),
    AfterRender: (dt, frameOptions) => runtime.AfterRender(dt, frameOptions),
    Warmup: (onStep) => runtime.Warmup(onStep),
  });
}

/** 登记表顺序的全部插件（选章「测试场景」一组、场地类表都按它）。 */
export const SANDBOX_PLUGINS = Object.freeze(SANDBOX_RANGES.flatMap((entry) => {
  const plugin = PLUGINS[entry.id];
  if (!plugin) throw new Error(`SandboxRanges: no plugin for ${entry.id}`);
  if (!plugin.phase) return [];
  return [Object.freeze({ id: entry.id, entry, ...plugin, Create: (host) => Object.assign(plugin.Create(host), { id: entry.id }) })];
}));

/** 登记表里的那一行对应的插件。 */
export function SandboxPluginFor(entry) {
  return entry ? SANDBOX_PLUGINS.find((p) => p.id === entry.id) || null : null;
}

/** 这一关是不是某个测试场的场地（按关卡 id，不管当前开的是哪个）。 */
export function SandboxForPhase(phase) {
  return phase ? SANDBOX_PLUGINS.find((p) => p.phase.id === phase.id) || null : null;
}

/** 场地类表里测试场那几行：关卡 id → 场地类。 */
export function SandboxWorldClasses() {
  return Object.fromEntries(SANDBOX_PLUGINS.map((p) => [p.phase.id, p.World]));
}

/**
 * 常驻的取证口：不管开没开那个测试场都在（不在时返回 null），签名不许改（测试与出图脚本按它取）。
 * `current()` 取装配层当前的测试场实例。
 */
export function SandboxDebugStubs(current) {
  const Explosions = () => { const s = current(); return s?.id === "explosions" ? s.api : null; };
  return {
    Explosions: {
      State: () => Explosions()?.State() || null,
      GoTo: (id) => Explosions()?.GoTo(id),
      Reset: () => Explosions()?.Reset(),
    },
  };
}
