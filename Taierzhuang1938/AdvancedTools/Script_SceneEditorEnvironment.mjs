// 场景编辑器（SceneEditor.html）的环境氛围、天穹、光照与 PMREM 反射球控制器。
//
// 职责：
//   1. 读取当前场景的 Scenes/<Id>/Environment_<Id>.json 与 Environment/EnvPreset_<Id>.json
//      （没有环境文件的测试场景回退到 SKY_PRESETS.firstLevelBattleDay）；
//   2. 用游戏同一套 SkyDome（物理大气 + 云层 + 战场霾 + 地平线反照）与 EnvironmentSystem，
//      随相机飞越不同环境区域（例如 FirstLevelMerged / FirstLevelEncounter 的白天兜底 ↔ BeishaheDusk 黄昏）
//      实时更新天穹、平行光方向/色温/强度、全局 SH 探针、环境底色、远雾与曝光；
//   3. 通过 SkyDome.BakeEnvironment(scene) 烘焙 256px HDR PMREM 反射球挂到 scene.environment
//      并设置 scene.environmentIntensity，同时启用与游戏 CompositePass 逐系数对齐的 ACES Filmic 色调映射
//      （Three.js ACESFilmicToneMapping 内含 /0.6，所以 toneMappingExposure = preset.exposure * 0.6），
//      消除缺失反射球导致的死黑水洼与无色调映射导致的纯白过曝高光。

import * as THREE from "three";
import { SkyDome, SKY_PRESETS, SKY_RADIANCE_GLSL } from "../Script_Sky.mjs";
import { EnvironmentSystem } from "../Script_EnvSystem.mjs";
import { LoadSceneEnvironment } from "../Script_EnvLoader.mjs";
import { ApplyPatches, MakePatch, PatchesOf } from "../Script_MaterialPatches.mjs";
import { SceneInfo } from "../Data_SceneAssets.mjs";
import { GLOBAL_SH_PROBE_COEFFICIENTS } from "../Data_GlobalShProbe.mjs";
import { BLOCKOUT_EDITOR_FILL } from "../Data_Tuning_WhiteboxMaterial.mjs";
import { ENV_RUNTIME } from "../Data_Tuning_Environment.mjs";
import { ApplyEditorLiteCameraProfile, CAMERA_PROFILES } from "../Script_CameraProfile.mjs";

const SKY_DISPLAY_VERT = /* glsl */`
varying vec3 vWorldDirection;
void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldDirection = normalize(worldPosition.xyz - cameraPosition);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position.z = gl_Position.w;
}
`;

const SKY_DISPLAY_FRAG = SKY_RADIANCE_GLSL + /* glsl */`
varying vec3 vWorldDirection;
void main() {
  gl_FragColor = vec4(SkyRadiance(normalize(vWorldDirection), 1.0), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const SKY_SIG_FIELDS = [
  "sunElevation", "sunAzimuth", "zenith", "horizon", "ground",
  "sunColor", "sunIntensity", "sunSize", "glow", "glowSpread",
  "smoke", "smokeColor", "smokeHeight", "cloudShape", "cloudDeck",
  "stars", "atmosphere", "fog", "lightIntensity", "envIntensity",
];

// 场景编辑器编辑视口固化使用 CAMERA_PROFILES.editorLite（仅 Three.js 默认 ACESFilmicToneMapping + 固化曝光），
// 不随昼夜或环境区域覆写 toneMappingExposure。
// 相机单帧跳变超过此距离（如 Frame / Home / 定位分界线）时立刻贴合目标区域环境，不等长过渡。
const SNAP_JUMP_M = 40;
// 场景编辑器编辑视口没有级联阴影与 SSR，且保留完整视距：雾起止放宽并跟当前大气色同步。
const EDITOR_FOG_NEAR = 450;
const EDITOR_FOG_FAR = 5200;
// 阴天云幕遮日时（例如 firstLevelBattleDay 的 sunIntensity=1.2）把直射高光的有效粗糙度展宽到
// 广域云层尺度（Karis 2013 面积光近似），避免水洼出现晴空点状纯白过曝斑；无 SSR 时把 PMREM
// 镜面反射保底在物理 1.0× 天光能量（不超过反射的天空本身），同时保持漫反射 IBL 按 preset.envIntensity 控对比。
const OVERCAST_SUN_SPREAD_SQ = 0.36;
const OVERCAST_DIRECT_SPEC_FLOOR = 0.45;
const EDITOR_SPEC_IBL_FLOOR = 1.0;

function FallbackPresetForScene(sceneId, fallbackSky) {
  const info = SceneInfo(sceneId);
  if (info?.category === "test") return sceneId === "TestMelee" ? "meleeLabDay" : "testSceneDay";
  return fallbackSky;
}

function ComputeAtmosphereSpecParams(preset) {
  const sunDisc = Math.max(0.5, Number(preset?.sunIntensity) || 0.5);
  const sunClarity = THREE.MathUtils.clamp((Math.log2(sunDisc) - 0.5) / 4.5, 0, 1);
  const overcast = 1 - sunClarity;
  const sunSpreadSq = overcast * overcast * OVERCAST_SUN_SPREAD_SQ;
  const directSpecScale = THREE.MathUtils.lerp(OVERCAST_DIRECT_SPEC_FLOOR, 1.0, sunClarity);
  const envInt = Math.max(0.12, Number(preset?.envIntensity) || 1);
  const specIblScale = Math.max(envInt, EDITOR_SPEC_IBL_FLOOR) / envInt;
  return { sunClarity, sunSpreadSq, directSpecScale, specIblScale };
}

function MakeEditorLightingPatch(atmosphereUniform) {
  return MakePatch({
    key: "sceneEditorAtmoSpec1",
    preservesPosition: true,
    uniforms: (uniforms) => { uniforms.uEditorAtmosphere = atmosphereUniform; },
    fragment: [
      ["#include <common>", /* glsl */`
        uniform vec4 uEditorAtmosphere; // x: sunSpreadSq, y: directSpecScale, z: specIblScale, w: sunClarity
      `],
      ["#include <lights_physical_fragment>", /* glsl */`
        float gEditorBaseRoughness = material.roughness;
        if (uEditorAtmosphere.x > 0.0001) {
          material.roughness = clamp(sqrt(gEditorBaseRoughness * gEditorBaseRoughness + uEditorAtmosphere.x), gEditorBaseRoughness, 1.0);
        }
      `],
      ["#include <lights_fragment_begin>", /* glsl */`
        material.roughness = gEditorBaseRoughness;
        reflectedLight.directSpecular *= uEditorAtmosphere.y;
      `],
      ["#include <lights_fragment_maps>", /* glsl */`
        #if defined( RE_IndirectSpecular ) && defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
          radiance *= uEditorAtmosphere.z;
        #endif
      `],
    ],
  });
}

function Signature(preset, fields) {
  let out = "";
  for (const field of fields) out += `${field}=${JSON.stringify(preset[field] ?? null)};`;
  return out;
}

function FetchFromGameRoot(url, init) {
  const base = new URL("../", location.href);
  return fetch(new URL(url, base), init);
}

export class SceneEditorEnvironment {
  constructor(renderer, scene, { fallbackSky = "firstLevelBattleDay" } = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.fallbackSky = fallbackSky;

    ApplyEditorLiteCameraProfile(this.renderer);

    this.sky = new SkyDome(renderer, { radius: 4000, quality: "medium", environment: true, atmosphere: true });
    this.skyDisplayMaterial = new THREE.ShaderMaterial({
      uniforms: this.sky.uniforms,
      vertexShader: SKY_DISPLAY_VERT,
      fragmentShader: SKY_DISPLAY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
      fog: false,
      toneMapped: true,
    });
    this.skyMesh = new THREE.Mesh(this.sky.mesh.geometry, this.skyDisplayMaterial);
    this.skyMesh.frustumCulled = false;
    this.skyMesh.renderOrder = -1000;
    this.skyMesh.name = "SceneEditor_SkyDome";
    this.scene.add(this.skyMesh);

    this.sun = new THREE.DirectionalLight(0xfff2df, 4.6);
    this.sun.name = "SceneEditor_SunLight";
    this.sun.position.set(40, 70, 25);
    this.scene.add(this.sun);

    this.globalProbe = new THREE.LightProbe();
    this.globalProbe.sh.fromArray(GLOBAL_SH_PROBE_COEFFICIENTS);
    this.globalProbe.intensity = 0.42 * BLOCKOUT_EDITOR_FILL.probe;
    this.globalProbe.name = "SceneEditor_GlobalShProbe";
    this.scene.add(this.globalProbe);

    this.ambient = new THREE.AmbientLight(0xe5e2dc, 0.18 * BLOCKOUT_EDITOR_FILL.ambient);
    this.ambient.name = "SceneEditor_AmbientLight";
    this.scene.add(this.ambient);

    this.scene.fog = new THREE.Fog(0x9a9a98, EDITOR_FOG_NEAR, EDITOR_FOG_FAR);
    this.scene.background = this.scene.fog.color.clone();

    this.atmosphereUniform = { value: new THREE.Vector4(0, 1, 1, 1) };
    this.lightingPatch = MakeEditorLightingPatch(this.atmosphereUniform);
    this.specParams = { sunClarity: 1, sunSpreadSq: 0, directSpecScale: 1, specIblScale: 1 };

    this.env = new EnvironmentSystem();
    this.loadToken = 0;
    this.version = -1;
    this.skySig = null;
    this.envDirty = false;
    this.lastBakeMs = -Infinity;
    this.bakes = 0;
    this.preset = null;
    this.lastObserver = null;
    this.activeVolume = null;
    this.activePresetId = null;

    this.ApplyPreset(SKY_PRESETS[this.fallbackSky] || SKY_PRESETS.firstLevelBattleDay, { forceBake: true });
  }

  /** 为当前场景加载 Scenes/<Id>/Environment_<Id>.json；测试场景直走对应基准白昼，免发 404 请求。 */
  async LoadForScene(sceneId, observer = null) {
    const token = ++this.loadToken;
    this.lastObserver = observer ? { x: observer.x, y: observer.y, z: observer.z } : null;
    const fallbackId = FallbackPresetForScene(sceneId, this.fallbackSky);
    if (SceneInfo(sceneId)?.category === "test") {
      this.env.Clear();
      this.activeVolume = null;
      this.activePresetId = fallbackId;
      this.ApplyPreset(SKY_PRESETS[fallbackId] || SKY_PRESETS.testSceneDay, { forceBake: true });
      return false;
    }
    try {
      const loaded = await LoadSceneEnvironment(sceneId, { fetchFn: FetchFromGameRoot });
      if (token !== this.loadToken) return false;
      if (!loaded) {
        this.env.Clear();
        this.activeVolume = null;
        this.activePresetId = fallbackId;
        this.ApplyPreset(SKY_PRESETS[fallbackId] || SKY_PRESETS.firstLevelBattleDay, { forceBake: true });
        return false;
      }
      this.env.SetScene(sceneId, loaded.sceneDoc, loaded.presets, { errors: loaded.errors, kind: "scene" });
      this.version = -1;
      const at = observer || { x: 0, y: 0, z: 0 };
      const output = this.env.SnapAt(at);
      this.ApplyEnvOutput(output, { forceBake: true });
      return true;
    } catch (error) {
      if (token !== this.loadToken) return false;
      console.warn(`[SceneEditor] 场景环境 ${sceneId} 读取失败，回退默认氛围`, error);
      this.env.Clear();
      this.activeVolume = null;
      this.activePresetId = fallbackId;
      this.ApplyPreset(SKY_PRESETS[fallbackId] || SKY_PRESETS.firstLevelBattleDay, { forceBake: true });
      return false;
    }
  }

  /** 立刻按给定观察点贴合环境区域与反射球（Home / Frame / 换场景后调用）。 */
  SnapAt(position) {
    if (!position) return;
    this.lastObserver = { x: position.x, y: position.y, z: position.z };
    if (!this.env.active) return;
    const output = this.env.SnapAt(position);
    this.ApplyEnvOutput(output, { forceBake: true });
  }

  /** 每帧同步天穹位置与区域环境；飞越区域时平滑过渡并按 pmremIntervalS 限频重烘反射球。 */
  Update(dt, camera) {
    if (camera) this.skyMesh.position.copy(camera.position);
    if (!this.env.active || !camera) return;
    const pos = camera.position;
    let output;
    let forceBake = false;
    if (this.lastObserver) {
      const dx = pos.x - this.lastObserver.x;
      const dy = pos.y - this.lastObserver.y;
      const dz = pos.z - this.lastObserver.z;
      if (Math.hypot(dx, dy, dz) > SNAP_JUMP_M) {
        output = this.env.SnapAt(pos);
        forceBake = true;
      } else {
        output = this.env.Update(dt, pos);
      }
    } else {
      output = this.env.SnapAt(pos);
      forceBake = true;
    }
    this.lastObserver = { x: pos.x, y: pos.y, z: pos.z };
    this.ApplyEnvOutput(output, { forceBake });
  }

  ApplyEnvOutput(output, { forceBake = false } = {}) {
    if (!output) return;
    const sunSource = output.components?.Sun?.source || output.components?.Sky?.source || null;
    this.activeVolume = sunSource?.id || null;
    this.activePresetId = sunSource?.presetId || null;
    if (output.version !== this.version || forceBake) {
      this.version = output.version;
      this.ApplyPreset(output.preset, { forceBake });
      return;
    }
    this.FlushBake(false);
  }

  ApplyPreset(preset, { forceBake = false } = {}) {
    if (!preset) return;
    this.preset = preset;
    const skySig = Signature(preset, SKY_SIG_FIELDS);
    let lightPreset = preset;
    if (skySig !== this.skySig || forceBake) {
      this.skySig = skySig;
      lightPreset = this.sky.Apply(preset);
      this.envDirty = true;
    }

    // 平行光：跟当前天穹太阳方向、色温与强度对齐
    this.sun.position.copy(this.sky.sunDirection).multiplyScalar(120);
    this.sun.color.setHex(lightPreset.lightColor ?? 0xfff2df);
    this.sun.intensity = lightPreset.lightIntensity ?? 4.6;

    // 间接漫反射：沿用游戏 Global SH Probe + AmbientLight，并乘白盒编辑器补光系数（防背光面死黑）
    const night = (lightPreset.lightIntensity ?? 1) <= 0.5;
    const probeBase = lightPreset.shProbeIntensity ?? (night ? 0.11 : 0.34);
    const ambientBase = lightPreset.ambientIntensity ?? (night ? 0.045 : 0.16);
    this.globalProbe.intensity = probeBase * BLOCKOUT_EDITOR_FILL.probe;
    this.ambient.color.setHex(lightPreset.ambientColor ?? 0x607085);
    this.ambient.intensity = ambientBase * BLOCKOUT_EDITOR_FILL.ambient;

    // 固化使用 CAMERA_PROFILES.editorLite，不再随昼夜/区域覆盖曝光与色调映射
    ApplyEditorLiteCameraProfile(this.renderer);

    // 远雾与背景色随当前大气地平线/雾色联动（线性空间直接写入）
    const fogSky = preset.fog?.sky || preset.horizon || [0.6, 0.6, 0.59];
    const fogGround = preset.fog?.ground || preset.ground || fogSky;
    this.scene.fog.color.setRGB(
      fogGround[0] * 0.35 + fogSky[0] * 0.65,
      fogGround[1] * 0.35 + fogSky[1] * 0.65,
      fogGround[2] * 0.35 + fogSky[2] * 0.65,
    );
    if (this.scene.background?.isColor) this.scene.background.copy(this.scene.fog.color);
    else this.scene.background = this.scene.fog.color.clone();

    // 环境反射强度（PMREM 烘焙后立即生效）与按当前天空大气标定的直射高光 / 反射球均衡参数
    this.scene.environmentIntensity = preset.envIntensity ?? 1;
    this.specParams = ComputeAtmosphereSpecParams(preset);
    this.atmosphereUniform.value.set(
      this.specParams.sunSpreadSq,
      this.specParams.directSpecScale,
      this.specParams.specIblScale,
      this.specParams.sunClarity,
    );
    this.FlushBake(forceBake);
  }

  /** 为编辑视口的 PBR 材质挂上环境氛围高光/反射球均衡补丁（幂等，保留已有补丁）。 */
  AttachMaterial(material) {
    if (!material || (!material.isMeshStandardMaterial && !material.isMeshPhysicalMaterial)) return material;
    const existing = PatchesOf(material) || [];
    if (existing.includes(this.lightingPatch)) return material;
    ApplyPatches(material, [...existing, this.lightingPatch]);
    return material;
  }

  FlushBake(force = false) {
    if (!this.envDirty) return false;
    const now = performance.now();
    if (!force && now - this.lastBakeMs < ENV_RUNTIME.pmremIntervalS * 1000) return false;
    this.sky.BakeEnvironment(this.scene);
    this.scene.environmentIntensity = this.preset?.envIntensity ?? 1;
    this.envDirty = false;
    this.lastBakeMs = now;
    this.bakes += 1;
    return true;
  }

  State() {
    const preset = this.preset;
    return {
      active: this.env.active,
      hasProbe: !!this.scene.environment,
      bakes: this.bakes,
      volume: this.activeVolume,
      preset: this.activePresetId,
      hour: this.env.active ? this.env.clock.hour : 12,
      exposure: CAMERA_PROFILES.editorLite.exposure,
      cameraProfile: CAMERA_PROFILES.editorLite.id,
      envIntensity: this.scene.environmentIntensity,
      sunClarity: this.specParams.sunClarity,
      specIblScale: this.specParams.specIblScale,
      directSpecScale: this.specParams.directSpecScale,
      sunColor: this.sun.color.getHex(),
      sunIntensity: this.sun.intensity,
      sunDirection: this.sky.sunDirection.toArray(),
    };
  }

  Dispose() {
    this.scene.remove(this.skyMesh, this.sun, this.globalProbe, this.ambient);
    this.skyDisplayMaterial.dispose();
    this.sky.Dispose();
    this.scene.environment = null;
  }
}
