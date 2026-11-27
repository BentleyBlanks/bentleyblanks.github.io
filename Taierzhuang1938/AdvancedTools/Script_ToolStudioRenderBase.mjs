// 独立工具宿主的渲染底座：不碰 Script_Main，把游戏的渲染系统在这里自己装一遍，
// 只消费游戏模块（WebGLRenderer 设置、PostPipeline、AO / SSR / GI / 着色 uniform、MaterialLibrary、SkyDome、
// LightRig、ActorFactory + 合批、Viewmodel、VfxSystem、AudioEngine）。构造参数、画质档与每帧的出画顺序
// 都照 Script_Main（约 445–760 行建系统、1533–1650 行建人物与枪、RenderSceneContent 出画）与
// Script_FrameModes.FrameModeEditor；天光、地台、相机照高级工具首页（Data_ToolsHome 的 ToolsHome 关）那一帧，
// 这样同一个工具在游戏宿主与这里出的画面是同一张。
//
// 有意不装的东西（它们是性能补丁或玩法侧系统，不改变画面）：阴影静态合批 / 预通道静态合批 / 骨头剪枝 /
// 阴影实例剔除、剖析器与帧调试器、自动降档、物理、AI、HUD、环境系统（组件式环境只有场景类工具才用）、
// 第一人称身体的影子替身（编辑器里玩家不在场，身体恒藏）。
//
// 页面要有 <base href="../">：游戏模块里大量按游戏根目录写的 "./Model/…" "./Texture/…" 相对路径照旧能用。

import * as THREE from "three";
import { CreateGameGraphics } from "../Script_Tuning_GameGraphics.mjs";
import { SetTextureImportRenderer } from "../Script_TextureImports.mjs";
import { MaterialLibrary } from "../Script_Materials.mjs";
import { SkyDome, SKY_PRESETS } from "../Script_Sky.mjs";
import { NormalizeGraphicsDetails, LoadSavedGraphics, ApplySavedSettings } from "../Script_EditorSettings.mjs";
import { LightRig } from "../Script_Light.mjs";
import { FirstPersonSelfShadow } from "../Script_FirstPersonSelfShadow.mjs";
import { FirstPersonReflectionProbe } from "../Script_FirstPersonReflectionProbe.mjs";
import { StepRifleSlings } from "../Script_RifleSlingCloth.mjs";
import { ProbeVolume, MakeGiUniforms, GI_QUALITY } from "../Script_Gi.mjs";
import {
  CreateStandardCameraPost, ApplyStandardCameraProfile,
  CreateStandardAoUniforms, SyncStandardAoUniforms, BuildStandardPostOptions,
} from "../Script_CameraProfile.mjs";
import { MakeMaterialShadingUniforms, ApplyShadingQuality, SyncShadingKnobs } from "../Script_MaterialShading.mjs";
import { ActorFactory } from "../Script_Actor.mjs";
import { ActorBatcher } from "../Script_ActorBatch.mjs";
import { Viewmodel } from "../Script_Viewmodel.mjs";
import { VfxSystem } from "../Script_Vfx.mjs";
import { AudioEngine } from "../Script_Audio.mjs";
import { LoadGrenadeAsset } from "../Script_GrenadeAsset.mjs";
import { GetActiveClusteredLights } from "../Script_ClusteredLights.mjs";
import { LoadGraphicsProfile } from "../Script_GraphicsProfile.mjs";
import { RECIPES } from "../Script_TexBake.mjs";
import { SCALE_PRESETS } from "../Data_Battle.mjs";
import { CAMERA } from "../Data_Tuning_Main.mjs";
import { TOOLS_HOME_PHASE } from "../Data_ToolsHome.mjs";
import { DEFAULT_PLAYER_WEAPON } from "../Data_Weapons.mjs";
import { PBR_SETS } from "./Data_ToolStudioPbrSets.mjs";

const Clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const PBR_LANES = 12;
const FLAT_NORMAL = { x: 0, y: 1, z: 0 };

/** 天光那一帧用的预设名：高级工具首页那一关（ToolsHome）的天。 */
const PHASE = TOOLS_HOME_PHASE;

/** 取一帧的间隔上限，同 Script_Main.Loop。 */
export const MAX_FRAME_DT = 0.05;

function DustBox(phase) {
  const z0 = phase.zones[0];
  return new THREE.Box3(new THREE.Vector3(z0.x - 150, -6, z0.z - 150), new THREE.Vector3(z0.x + 150, 22, z0.z + 150));
}

/**
 * 建底座。onStep(label, progress) 报开机进度。
 * 返回的对象就是各编辑器的 host 里「渲染侧 + 系统侧」那一半（见 Script_ToolStudio 里 EditorHost）。
 */
export async function CreateStudioBase({ canvas, search = location.search, onStep = () => {}, fitCanvas = false, initialSky = null } = {}) {
  const params = new URLSearchParams(search);
  const GRAPHICS_PROFILE = LoadGraphicsProfile(search);
  const QUALITY = GRAPHICS_PROFILE;
  const SCALE = SCALE_PRESETS[params.get("scale") || "medium"] || SCALE_PRESETS.medium;
  const state = { elapsed: 0, frame: 0, ready: false };

  const ViewportSize = () => {
    if (!fitCanvas) return { width: window.innerWidth, height: window.innerHeight };
    const rect = canvas.getBoundingClientRect();
    return {
      width: Math.max(2, Math.round(rect.width || canvas.clientWidth || window.innerWidth)),
      height: Math.max(2, Math.round(rect.height || canvas.clientHeight || window.innerHeight)),
    };
  };
  const initSize = ViewportSize();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  SetTextureImportRenderer(renderer);
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  renderer.setSize(initSize.width, initSize.height, false);
  renderer.debug.checkShaderErrors = false;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  // toneMapping 与 outputColorSpace 由 CreateStandardCameraPost(renderer, ...) 统一装配。

  const scene = new THREE.Scene();
  scene.matrixWorldAutoUpdate = false;
  const camera = new THREE.PerspectiveCamera(CAMERA.baseFovDeg, initSize.width / initSize.height, 0.06, 620);
  camera.rotation.order = "YXZ";
  camera.far = PHASE.cameraFar ?? 620;
  camera.updateProjectionMatrix();

  const post = CreateStandardCameraPost(renderer, {
    width: Math.max(2, renderer.domElement.width), height: Math.max(2, renderer.domElement.height), quality: QUALITY,
  });
  const ssao = CreateStandardAoUniforms(post);
  const ssrUniforms = post.SsrUniforms;

  const graphics = CreateGameGraphics({ profile: GRAPHICS_PROFILE, preset: post.preset,
    gi: params.get("gi") === "1", gore: false });
  NormalizeGraphicsDetails(graphics, post);
  const CONTACT_SHADOWS_SUPPORTED = !!post.preset.contactShadows;
  {
    const bootScale = Clamp(graphics.renderScale, 0.4, 1.6);
    const bootOutW = Math.max(2, renderer.domElement.width);
    const bootOutH = Math.max(2, renderer.domElement.height);
    post.SetSize(Math.max(2, Math.round(bootOutW * bootScale)), Math.max(2, Math.round(bootOutH * bootScale)),
      bootOutW, bootOutH);
  }

  const GI_ON = GI_QUALITY[QUALITY] != null;
  const giUniforms = MakeGiUniforms();
  giUniforms.debugView.value = parseFloat(params.get("giView") || "0") || 0;
  giUniforms.sampling = GI_ON && graphics.gi;
  const shadingUniforms = MakeMaterialShadingUniforms();
  ApplyShadingQuality(shadingUniforms, post.preset, graphics);
  SyncShadingKnobs(shadingUniforms, graphics);
  shadingUniforms.debugView.value = parseFloat(params.get("matView") || "0") || 0;
  const library = new MaterialLibrary(renderer, {
    textureSize: post.preset.materialTexture || (QUALITY === "low" ? 256 : 512),
    ssao, gi: GI_ON ? giUniforms : null, ssr: ssrUniforms, shading: shadingUniforms,
  });

  const sky = new SkyDome(renderer, { quality: QUALITY });
  scene.add(sky.mesh);
  const lights = new LightRig(scene, { quality: QUALITY, shadowExtent: 66, renderer });
  lights.SetViewCamera(camera);
  post.SetSunShadowSource(lights);
  let gi = (GI_ON && graphics.gi)
    ? new ProbeVolume(renderer, { quality: QUALITY, skyUniforms: sky.uniforms, uniforms: giUniforms }) : null;
  if (gi) gi.enabled = true;

  const audio = new AudioEngine({ enabled: params.get("audio") !== "0", assetPolicy: null });

  // --- 材质：先烘不被外部 PBR 顶替的配方，再读外部 PBR 套（同 Script_Main.Boot） --------------
  const pbrOverridden = new Set(PBR_SETS.map((set) => set.name));
  for (const set of PBR_SETS) if (set.fallback) pbrOverridden.delete(set.fallback);
  const bakeNames = Object.keys(RECIPES).filter((name) => !pbrOverridden.has(name));
  onStep("烘焙贴图", 0.05);
  const total = bakeNames.length + library.PendingShadingSteps();
  let baked = 0;
  for await (const name of library.PrepareStepsAsync(bakeNames)) {
    baked += 1;
    onStep(`烘焙贴图 ${baked}/${total} · ${name}`, 0.05 + 0.25 * (baked / total));
    await NextFrame();
  }
  onStep("读取 PBR 材质", 0.3);
  const queue = [...PBR_SETS];
  let loaded = 0;
  const RunLane = async () => {
    for (;;) {
      const set = queue.shift();
      if (!set) return;
      try {
        if (set.fallback) await library.LoadExternalBaseNormal(set.name, set.fallback, set);
        else await library.LoadExternalSet(set.name, set);
      } catch (error) {
        for await (const _ of library.PrepareStepsAsync([set.name])) await NextFrame();
        console.warn(`[ToolStudio] 外部 PBR「${set.name}」没读到，退回程序化：${String(error).slice(0, 160)}`);
      }
      loaded += 1;
      onStep(`读取 PBR 材质 ${loaded}/${PBR_SETS.length}`, 0.3 + 0.3 * (loaded / PBR_SETS.length));
    }
  };
  await Promise.all(Array.from({ length: PBR_LANES }, RunLane));

  audio.PrefetchPacks?.();

  // --- 天光：默认用高级工具首页预设，或调用方指定的预设 -----------------------------------
  let skyOverride = (initialSky && SKY_PRESETS[initialSky]) ? initialSky : null;
  const preset = sky.Apply(skyOverride || PHASE.sky);
  sky.BakeEnvironment(scene);
  lights.ApplyPreset(preset, sky.sunDirection);
  if (gi) gi.ApplyPreset(preset, graphics.giStrength);
  scene.fog = null;

  // --- 人物、枪、特效 -----------------------------------------------------------------------
  onStep("读取人物与枪模", 0.65);
  const actorFactory = new ActorFactory(library, { quality: QUALITY, view: {camera, renderer, lightRig: lights} });
  const actorBatch = new ActorBatcher(scene);
  actorFactory.SetBatcher(actorBatch);
  actorFactory.groundProbe = () => ({ y: 0, normal: FLAT_NORMAL, tag: "terrain" });
  const meshes = await actorFactory.PreloadMeshes({ weaponsOnly: false });
  await NextFrame();
  if (meshes.missing.length) console.warn(`[ToolStudio] 这些模型没读到，对应的人/枪退回方块几何：${meshes.missing.join(", ")}`);
  const [grenadeAsset] = await Promise.all([LoadGrenadeAsset()]);
  await NextFrame();
  const vfx = new VfxSystem(scene, library, { quality: QUALITY, maxParticles: SCALE.vfxBudget, lights });
  vfx.dustReferenceForced = params.get("dustRef") === "1";
  vfx.SetBloodSurface((from, direction, distance) => FlatRaycast(from, direction, distance));
  vfx.SetFallingSoilSurface({ groundAt: () => 0, raycast: (from, direction, distance) => FlatRaycast(from, direction, distance) });
  vfx.AmbientDust(DustBox(PHASE), 0.075);

  const viewmodel = new Viewmodel(library, {
    fov: 52, depthBudget: 1.22, meshDocs: actorFactory.meshDocs,
    riggedAssets: params.get("arms") !== "legacy" ? actorFactory.riggedAssets : null,
    hanYangAsset: actorFactory.hanYang173R, grenadeAsset,
  });
  camera.add(viewmodel.root);
  scene.add(camera);
  // 游戏开局玩家手里就是默认武器：不藏视图模型的工具（音效音乐等）画面里有它
  viewmodel.Equip(DEFAULT_PLAYER_WEAPON, 0);
  if (viewmodel.markForegroundPrepass) viewmodel.markForegroundPrepass();
  const firstPersonSelfShadow = new FirstPersonSelfShadow(renderer, scene, camera, viewmodel.root, {
    size: QUALITY === "low" ? 512 : 1024,
    soft: graphics.firstPersonSelfShadowSoft === true,
    eyeSun: graphics.firstPersonEyeSun !== false,
    sunBlocked: (origin, direction, maxDistance) => !!FlatRaycast(origin, direction, maxDistance),
  });
  firstPersonSelfShadow.SetEnabled(graphics.shadows && graphics.firstPersonSelfShadow);
  firstPersonSelfShadow.SetWeaponLightEnabled(graphics.firstPersonWeaponLight !== false);
  const firstPersonReflection = new FirstPersonReflectionProbe(renderer, scene, {
    materials: () => firstPersonSelfShadow?.ownedMaterials || [],
    hidden: () => [viewmodel?.root, viewmodel?.body?.root],
    suspendScreenSpace: SuspendScreenSpaceForProbe,
    enabled: graphics.firstPersonReflection !== false,
  });

  // 地面为 y=0 的无限平面：血迹贴花 / 落土 / 自阴影的「朝太阳射线」只问这一块地
  function FlatRaycast(from, direction, distance) {
    if (direction.y >= -1e-6) return null;
    const t = -from.y / direction.y;
    if (t < 0 || t > distance) return null;
    return { t, distance: t, point: { x: from.x + direction.x * t, y: 0, z: from.z + direction.z * t }, normal: FLAT_NORMAL, tag: "terrain" };
  }

  function RecompileAllMaterials() {
    const Mark = (material) => { if (material) material.needsUpdate = true; };
    scene.traverse((object) => {
      const material = object.material;
      if (Array.isArray(material)) material.forEach(Mark); else Mark(material);
    });
    for (const material of library.materials.values()) Mark(material);
    for (const material of library.upgradedExternal.values()) Mark(material);
  }

  /** 画质旋钮落到渲染器上，同 Script_Main.ApplyGraphics（去掉自动降档与断肢开关）。 */
  function ApplyGraphics() {
    NormalizeGraphicsDetails(graphics, post);
    const scale = Clamp(graphics.renderScale, 0.4, 1.6);
    const vp = ViewportSize();
    camera.aspect = vp.width / vp.height;
    camera.updateProjectionMatrix();
    renderer.setSize(vp.width, vp.height, false);
    const outW = Math.max(2, renderer.domElement.width);
    const outH = Math.max(2, renderer.domElement.height);
    const width = Math.max(2, Math.round(outW * scale)), height = Math.max(2, Math.round(outH * scale));
    ApplyStandardCameraProfile(post, {
      width, height, outputWidth: outW, outputHeight: outH,
      volumetrics: graphics.volumetrics !== false,
      contactShadows: CONTACT_SHADOWS_SUPPORTED && graphics.contactShadows !== false && graphics.shadows !== false,
      ssr: graphics.ssr !== false,
      ssrStrength: graphics.ssrStrength ?? 1,
      atmosphere: graphics.atmosphere !== false,
    });
    lights.SetShadowTuning({
      bias: graphics.shadowBias, normalBias: graphics.shadowNormalBias,
      intensity: graphics.shadowIntensity, mapSize: graphics.shadowSize || lights.defaultShadowSize,
    });
    lights.SetShadowDistance(graphics.shadowDistance);
    lights.SetNearShadowBakeAllowed(true);
    giUniforms.normalBias.value = graphics.giNormalBias;
    giUniforms.specularOcclusion.value = graphics.giSpecularOcclusion;
    SyncShadingKnobs(shadingUniforms, graphics);
    if (ApplyShadingQuality(shadingUniforms, post.preset, graphics)) RecompileAllMaterials();
    firstPersonSelfShadow?.SetEnabled(!!graphics.shadows && graphics.firstPersonSelfShadow !== false);
    firstPersonSelfShadow?.SetSoft(graphics.firstPersonSelfShadowSoft === true);
    firstPersonSelfShadow?.SetEyeSun(graphics.firstPersonEyeSun !== false);
    firstPersonSelfShadow?.SetWeaponLightEnabled(graphics.firstPersonWeaponLight !== false);
    firstPersonReflection?.SetEnabled(graphics.firstPersonReflection !== false);
    lights.SetShadowsEnabled(!!graphics.shadows);
    if (GI_ON) {
      const wantGi = !!graphics.gi;
      if (wantGi && !gi) gi = new ProbeVolume(renderer, { quality: QUALITY, skyUniforms: sky.uniforms, uniforms: giUniforms });
      if (giUniforms.sampling !== wantGi) {
        giUniforms.sampling = wantGi;
        RecompileAllMaterials();
      }
      if (gi) {
        gi.enabled = wantGi;
        gi.irradianceHistory = graphics.giIrradianceHistory;
        gi.distanceHistory = graphics.giDistanceHistory;
        if (!gi.enabled) { gi.blend = 0; gi.SyncUniforms(); lights.SetGiActive(0); }
        const current = SKY_PRESETS[skyOverride || PHASE.sky];
        if (current) gi.ApplyPreset(current, graphics.giStrength);
      }
    }
    lights.SetClusteredEnabled(graphics.clusteredLights !== false);
    const wantHero = !!graphics.clusterHeroShadow && graphics.shadows !== false;
    if (lights.heroShadow !== wantHero) {
      lights.SetHeroShadow(wantHero);
      RecompileAllMaterials();
    }
    post.preset.atmosphere = graphics.atmosphere !== false;
    const atmosphereChanged = [
      sky.SetAtmosphereEnabled(graphics.atmosphere !== false),
      sky.SetHazeScale(graphics.atmosphereHaze),
    ].some(Boolean);
    if (atmosphereChanged) sky.BakeEnvironment(scene);
    const shadowSize = graphics.shadowSize || lights.defaultShadowSize;
    if (lights.sun.shadow.mapSize.x !== shadowSize) {
      lights.sun.shadow.mapSize.set(shadowSize, shadowSize);
      if (lights.sun.shadow.map) { lights.sun.shadow.map.dispose(); lights.sun.shadow.map = null; }
    }
  }

  // 存档里的画质与音量（玩家在游戏设置里调的那一套）
  let onResizeHook = null;
  const HandleResize = () => {
    ApplyGraphics();
    onResizeHook?.();
  };
  const savedSettings = { game: { graphics, ApplyGraphics }, audio };
  try { ApplySavedSettings(savedSettings); } catch (error) { console.warn("[ToolStudio] 存档设置装不回去：", error); }
  ApplyGraphics();
  window.addEventListener("resize", HandleResize);
  if (fitCanvas && typeof ResizeObserver === "function") {
    let lastW = initSize.width;
    let lastH = initSize.height;
    const observer = new ResizeObserver(() => {
      const vp = ViewportSize();
      if (vp.width === lastW && vp.height === lastH) return;
      lastW = vp.width;
      lastH = vp.height;
      HandleResize();
    });
    observer.observe(canvas);
  }

  /** 把环境换成某个天光预设（特效编辑器的日 / 夜光照预览用）；同 Script_Main.ApplySkyPreset 没有环境系统那一支。 */
  function ApplySkyPreset(name) {
    if (!SKY_PRESETS[name]) return false;
    skyOverride = name;
    const next = sky.Apply(name);
    sky.BakeEnvironment(scene);
    lights.ApplyPreset(next, sky.sunDirection);
    return true;
  }
  function RestoreLevelSky() {
    if (!skyOverride) return;
    skyOverride = null;
    const next = sky.Apply(PHASE.sky);
    sky.BakeEnvironment(scene);
    lights.ApplyPreset(next, sky.sunDirection);
  }

  const forward = new THREE.Vector3();

  /**
   * 一帧：同 FrameModeEditor 里灯光与阴影框那几行 + RenderScene；编辑器的 Update 由外壳先跑。
   * 特效编辑器开着时灯光时间由它的预览时间定（vfxPreview），同游戏宿主；
   * 独立第一人称窗口可传入 nearDof（与正片 ADS 近景景深同源）和 lensFlareScale。
   */
  function Frame(dt, { vfxPreview = false, previewTime, nearDof = null, lensFlareScale = 1 } = {}) {
    state.elapsed += dt;
    state.frame += 1;
    camera.getWorldDirection(forward);
    if (vfxPreview) lights.Update(0, previewTime ?? state.elapsed, camera.position);
    else lights.Update(dt, state.elapsed, camera.position);
    lights.UpdateShadowFrustum(camera.position, forward);
    RenderScene(dt, nearDof, lensFlareScale);
  }

  function RenderScene(dt, nearDof = null, lensFlareScale = 1) {
    if (viewmodel.body) viewmodel.body.root.visible = false;
    if (gi) {
      gi.Update(dt, camera.position, lights);
      lights.SetGiActive(gi.uniforms.enabled.value);
    }
    lights.ScheduleShadowUpdate(renderer);
    const giBlend = gi ? (giUniforms.enabled.value || 0) : 0;
    SyncStandardAoUniforms(ssao, post, { giBlend });
    sky.mesh.position.copy(camera.position);
    const skyName = skyOverride || PHASE.sky;
    const preset = SKY_PRESETS[skyName] || SKY_PRESETS[PHASE.sky];
    vfx.SetDepthSource(post.NormalDepthTexture, post.width, post.height, post.SceneDepthTexture);
    post.SetGroundDustSource?.(vfx.dustFields || null);
    vfx.SetFog(preset.fog, preset.sunColor);
    vfx.SetSun(sky.sunDirection);
    camera.updateWorldMatrix(true, false);
    audio.SetListener(camera);
    lights.UpdateClusters(camera, post.width, post.height);
    scene.updateMatrixWorld();
    StepRifleSlings(dt, camera);
    if (firstPersonSelfShadow?.enabled) firstPersonSelfShadow.Render(sky.sunDirection, dt);
    if (actorBatch) actorBatch.Update(camera);
    post.Render(scene, camera, BuildStandardPostOptions({
      sunDirection: sky.sunDirection,
      sunColor: preset.sunColor,
      fog: preset.fog,
      volumetricPreset: skyName,
      exposureAnchor: skyOverride ? null : PHASE.id,
      dt,
      lensFlareScale,
      nearDof,
    }));
    if (firstPersonReflection?.enabled) {
      firstPersonReflection.Update(dt, camera.position, !!viewmodel?.root?.visible);
    }
  }

  function SuspendScreenSpaceForProbe() {
    const cluster = GetActiveClusteredLights()?.uniforms?.uClusterParams?.value || null;
    const saved = {
      ao: ssao.strength.value, ssil: ssao.ssilStrength?.value, ssilMap: ssao.ssilMap?.value,
      ssr: ssrUniforms?.strength?.value, cluster: cluster ? cluster.w : null,
    };
    ssao.strength.value = 0;
    if (ssao.ssilStrength) ssao.ssilStrength.value = 0;
    if (ssao.ssilMap) ssao.ssilMap.value = NEUTRAL_SSIL;
    if (ssrUniforms?.strength) ssrUniforms.strength.value = 0;
    if (cluster) cluster.w = 0;
    return () => {
      ssao.strength.value = saved.ao;
      if (ssao.ssilStrength) ssao.ssilStrength.value = saved.ssil;
      if (ssao.ssilMap) ssao.ssilMap.value = saved.ssilMap;
      if (ssrUniforms?.strength) ssrUniforms.strength.value = saved.ssr;
      if (cluster) cluster.w = saved.cluster;
    };
  }
  const NEUTRAL_SSIL = (() => {
    const texture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    texture.needsUpdate = true;
    return texture;
  })();

  state.ready = true;
  return {
    THREE, params, state, renderer, scene, camera, canvas, post, ssao, graphics, library, sky, lights, vfx, audio,
    actorFactory, actorBatch, viewmodel, firstPersonSelfShadow, firstPersonReflection, shadingUniforms,
    get gi() { return gi; },
    set onResize(fn) { onResizeHook = typeof fn === "function" ? fn : null; },
    ApplyGraphics, ApplySkyPreset, RestoreLevelSky, Frame, RenderScene,
    GetEnvironmentState: () => ({ name: skyOverride || PHASE.sky, override: !!skyOverride }),
    RestoreEnvironmentState(snapshot) {
      if (snapshot?.override && snapshot.name) ApplySkyPreset(snapshot.name);
      else RestoreLevelSky();
    },
    defaultWeaponId: DEFAULT_PLAYER_WEAPON,
  };
}

/** 让出一个宏任务（MessageChannel 不吃后台页面的定时器钳制，同 Script_Main.NextTask）。 */
function NextTask() {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => { channel.port1.close(); channel.port2.close(); resolve(); };
    channel.port2.postMessage(0);
  });
}

/** 让出一帧：可见时等 rAF，隐藏时走宏任务（同 Script_Main.NextFrame，去掉加载纸）。 */
export async function NextFrame() {
  if (document.hidden) return NextTask();
  await new Promise((resolve) => {
    let frame;
    const finish = () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", finish);
      resolve();
    };
    frame = requestAnimationFrame(finish);
    document.addEventListener("visibilitychange", finish, { once: true });
  });
  await NextTask();
}
