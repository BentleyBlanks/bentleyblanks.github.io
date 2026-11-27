// 《台儿庄：血战滕县》统一相机后处理档案装配器（Script_CameraProfile.mjs）。
//
// 所有需要后处理的渲染器必须经由本模块获取相机档案：
//   · 标准完整管线（游戏正片 / 标题菜单指挥室 / 单视口视觉验收工具）：
//       CreateStandardCameraPost + ApplyStandardCameraProfile + BuildStandardPostOptions
//   · 简易编辑器管线（多视口 / 编辑器向视口，仅 Three.js 默认 ACESFilmic）：
//       ApplyEditorLiteCameraProfile
//
// 固化参数唯一源头在 `Data_CameraProfile.mjs`；本模块只负责把它落到 WebGLRenderer / PostPipeline / 每帧 options 上，
// 并仅放行规范白名单内的局部运行期参数（DoF、体积雾/雾、玩法瞬态生理反馈）。

import * as THREE from "three";
import {
  CAMERA_PROFILE_SCHEMA,
  CAMERA_PROFILE_RUNTIME_OVERRIDES,
  CAMERA_PROFILE_FROZEN_SETTINGS_KEYS,
  CAMERA_PROFILES,
} from "./Data_CameraProfile.mjs";
import { PostPipeline } from "./Script_Post.mjs";
import { MakeAoUniforms, SyncAoUniforms } from "./Script_PostGtao.mjs";
import { SSIL } from "./Data_Tuning_Gtao.mjs";

export {
  CAMERA_PROFILE_SCHEMA,
  CAMERA_PROFILE_RUNTIME_OVERRIDES,
  CAMERA_PROFILE_FROZEN_SETTINGS_KEYS,
  CAMERA_PROFILES,
};

const FROZEN_KEY_SET = new Set(CAMERA_PROFILE_FROZEN_SETTINGS_KEYS);
const DEFAULT_SUN_DIR = new THREE.Vector3(...CAMERA_PROFILES.standard.defaultSunDirection).normalize();

const Clamp01 = (v) => (v <= 0 ? 0 : v >= 1 ? 1 : v);

/**
 * 过滤掉旧存档里属于固化 CameraProfile 的键，防止历史 localStorage 覆盖统一画面观感。
 * @param {Record<string, unknown>|null} saved
 * @returns {Record<string, unknown>|null}
 */
export function StripFrozenCameraSettings(saved) {
  if (!saved || typeof saved !== "object") return null;
  const clean = {};
  for (const [key, value] of Object.entries(saved)) {
    if (!FROZEN_KEY_SET.has(key)) clean[key] = value;
  }
  return clean;
}

/** 某个设置键是否已被 CameraProfile 冻结。 */
export function IsFrozenCameraSettingKey(key) {
  return FROZEN_KEY_SET.has(key);
}

/**
 * 按 `CAMERA_PROFILES.standard` 创建并初始化一套完整的 `PostPipeline`。
 * 自动把 `renderer` 设为线性交由 PostPipeline 输出（NoToneMapping + SRGBColorSpace）。
 */
export function CreateStandardCameraPost(renderer, {
  width,
  height,
  outputWidth = width,
  outputHeight = height,
  quality = "high",
  volumetrics = null,
  contactShadows = null,
  ssr = null,
  ssrStrength = null,
  atmosphere = null,
} = {}) {
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const w = Math.max(2, (width ?? renderer.domElement.width ?? 2) | 0);
  const h = Math.max(2, (height ?? renderer.domElement.height ?? 2) | 0);
  const outW = Math.max(2, (outputWidth ?? w) | 0);
  const outH = Math.max(2, (outputHeight ?? h) | 0);
  const post = new PostPipeline(renderer, { width: w, height: h, quality });
  if (outW !== w || outH !== h) post.SetSize(w, h, outW, outH);
  ApplyStandardCameraProfile(post, { volumetrics, contactShadows, ssr, ssrStrength, atmosphere });
  return post;
}

/**
 * 把 `CAMERA_PROFILES.standard` 全部固化参数强制同步到既有 `PostPipeline` 实例上。
 * 仅接受性能/硬件相关的非美术运行态参数（分辨率、体积雾开关、接触阴影、SSR、大气）。
 */
export function ApplyStandardCameraProfile(post, {
  width = null,
  height = null,
  outputWidth = null,
  outputHeight = null,
  volumetrics = null,
  contactShadows = null,
  ssr = null,
  ssrStrength = null,
  atmosphere = null,
} = {}) {
  if (!post) return null;
  const S = CAMERA_PROFILES.standard;
  post.cameraProfileId = S.id;
  if (post.renderer) {
    post.renderer.toneMapping = THREE.NoToneMapping;
    post.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }
  if (width != null && height != null) {
    const w = Math.max(2, width | 0);
    const h = Math.max(2, height | 0);
    const outW = Math.max(2, (outputWidth ?? w) | 0);
    const outH = Math.max(2, (outputHeight ?? h) | 0);
    if (post.width !== w || post.height !== h || post.outputWidth !== outW || post.outputHeight !== outH) {
      post.SetSize(w, h, outW, outH);
    }
  }
  post.SetTaaEnabled(S.taa);
  post.uniformsTaa.uCurrentWeight.value = S.taaCurrentWeight;
  if (post.taaJitterScale !== S.taaJitterScale) post.hasTaaHistory = false;
  post.taaJitterScale = S.taaJitterScale;
  post.sharpenStrength = S.sharpen;
  post.SetAutoExposure(S.autoExposure);
  post.SetLocalTonemap(S.localTonemap);
  post.SetLutEnabled(S.lut);
  post.SetFilmLook(S.filmLook);
  post.SetFilmOptics(S.filmOptics);
  post.exposurePass.SetBiasEv(S.exposureCompensationEv);
  post.lensFlarePass.SetUserScale(S.lensFlare.userScale, S.lensFlare.dirtScale);
  post.bloomPass.karis = S.bloom.karis;
  post.uniformsComposite.uDither.value = S.dither;
  post.SetTonemap(S.tonemap);
  post.SetSsilEnabled(!!post.preset.ssil);
  if (volumetrics !== null) post.preset.volumetrics = !!volumetrics;
  if (contactShadows !== null) post.preset.contactShadows = !!contactShadows;
  if (ssr !== null) post.SetSsrEnabled(!!ssr);
  if (ssrStrength !== null) post.SetSsrStrength(ssrStrength);
  if (atmosphere !== null) post.preset.atmosphere = !!atmosphere;
  return S;
}

/** 创建并绑定固化 AO / SSIL 强度的材质端 uniform 包。 */
export function CreateStandardAoUniforms(post) {
  const { ssaoStrength, ssilStrength } = CAMERA_PROFILES.standard.ao;
  return MakeAoUniforms(post, { strength: ssaoStrength, ssilStrength });
}

/** 每帧同步固化 AO / SSIL 强度（随 GI 混入自动压减 SSIL，避免二次反弹叠加）。 */
export function SyncStandardAoUniforms(ssao, post, { giBlend = 0 } = {}) {
  const { ssaoStrength, ssilStrength } = CAMERA_PROFILES.standard.ao;
  SyncAoUniforms(ssao, post, {
    strength: ssaoStrength,
    ssilStrength: ssilStrength * (1 - (1 - SSIL.giScale) * Clamp01(giBlend)),
  });
}

/**
 * 组装单帧 `post.Render(scene, camera, options)` 选项：
 *   · 曝光、泛光、色调映射、3D LUT 分级、饱和度、对比度、暗角、颗粒、色差、Purkinje、镜头光晕
 *     全部锁定在 `CAMERA_PROFILES.standard`（白天基线），昼夜预设不再覆盖后处理；
 *   · 仅放行规范允许的局部运行期输入：雾/体积雾（`fog`、`volumetricPreset`）、景深（`dof`、`nearDof`）、
 *     玩法生理反馈（压制 / 受伤 / 黑场 / 闭眼 / 震荡 / 残影）及线性 HDR 注入回调（指挥室窗光体积）。
 */
export function BuildStandardPostOptions({
  sunDirection = null,
  sunColor = null,
  fog = null,
  volumetricPreset = null,
  exposureAnchor = null,
  dt = 1 / 60,
  steadyView = false,
  lensFlareScale = 1,
  suppression = 0,
  damage = 0,
  fade = 0,
  eyeClosure = 0,
  hitDisorientation = 0,
  lidGlow = null,
  lidEdge = null,
  lidLight = null,
  eyeAdapt = 1,
  afterimage = null,
  concussion = null,
  dof = null,
  nearDof = null,
  renderLinearHdr = null,
  outputViewport = null,
  taa = undefined,
} = {}) {
  const S = CAMERA_PROFILES.standard;
  const sup = Clamp01(suppression);
  const dofStrength = dof?.strength > 0 ? Clamp01(dof.strength) : 0;
  const nearDofStrength = !steadyView && nearDof?.strength > 0 ? Clamp01(nearDof.strength) : 0;
  const options = {
    sunDirection: sunDirection || DEFAULT_SUN_DIR,
    sunColor: sunColor || S.defaultSunColor,
    fog: fog || S.neutralFog,
    // 体积雾读 skyPreset 查时段雾体参数；自动曝光读 exposureProfile 锁定白天档位，互不串扰。
    skyPreset: volumetricPreset || S.skyPreset,
    exposureProfile: S.skyPreset,
    exposureAnchor: exposureAnchor || null,
    dt,
    exposure: S.exposure,
    bloom: S.bloom.strength,
    bloomThreshold: S.bloom.threshold,
    godStrength: S.godRays.enabled ? S.godRays.strength : 0,
    saturation: S.grade.saturation * (1 - sup * 0.35),
    contrast: S.grade.contrast,
    grade: S.grade,
    grain: S.grain.strength,
    grainSize: S.grain.size,
    vignette: S.vignette + sup * 0.22,
    aberration: S.aberration,
    purkinje: S.purkinje,
    lensFlare: S.lensFlare.strength * Math.max(0, Number.isFinite(lensFlareScale) ? lensFlareScale : 1),
    motionBlur: steadyView ? 0 : S.motionBlur * (1 - dofStrength),
    fade,
    eyeClosure,
    damage,
    hitDisorientation,
    eyeAdapt,
    dofStrength,
    dofFocus: dof?.focus ?? S.dof.focus,
    dofRange: dof?.range ?? S.dof.range,
    dofMaxPx: dof?.maxPx ?? S.dof.maxPx,
    nearDofStrength,
    nearDofFocus: nearDof?.focus ?? S.dof.nearFocus,
    nearDofRange: nearDof?.range ?? S.dof.nearRange,
    nearDofMaxPx: nearDof?.maxPx ?? S.dof.nearMaxPx,
    nearDofSightUv: nearDofStrength > 0 ? (nearDof?.sightUv || null) : null,
  };
  if (lidGlow) options.lidGlow = lidGlow;
  if (lidEdge) options.lidEdge = lidEdge;
  if (lidLight) options.lidLight = lidLight;
  if (afterimage) options.afterimage = afterimage;
  if (concussion) options.concussion = concussion;
  if (typeof renderLinearHdr === "function") options.renderLinearHdr = renderLinearHdr;
  if (outputViewport) options.outputViewport = outputViewport;
  if (taa !== undefined) options.taa = taa;
  return options;
}

/**
 * 把 `CAMERA_PROFILES.editorLite` 落到 Three.js `WebGLRenderer` 上：
 * 无 Bloom / TAA / LUT / LensFlare / AutoExposure / Grain，仅保留 Three.js 默认 ACESFilmicToneMapping + 固化曝光与 sRGB 输出。
 * 专供多视口与编辑器向视口使用。
 */
export function ApplyEditorLiteCameraProfile(renderer) {
  const L = CAMERA_PROFILES.editorLite;
  if (!renderer) return L;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = L.toneMappingExposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.userData = { ...(renderer.userData || {}), cameraProfileId: L.id };
  return L;
}

/**
 * 简易编辑器管线的离屏单趟 ACESFilmic 输出器（专供与标准管线共享同一 Scene/Renderer 的第二视口，
 * 例如 `EncounterPlayView` 双视口观察视角）：
 *   · 场景继续在 `renderer.toneMapping = THREE.NoToneMapping` 下绘入 HalfFloat 离屏靶
 *     （100% 命中主视口已预热的着色器缓存，零重编译卡顿）；
 *   · 随后用一张全屏四边形走 Three.js 原生 `#include <tonemapping_fragment>` + `#include <colorspace_fragment>`
 *     按 `CAMERA_PROFILES.editorLite`（ACESFilmic + 固化曝光 + sRGB）送屏，无 Bloom/TAA/LUT/颗粒。
 */
export function CreateEditorLiteBlit() {
  const uniforms = { tInput: { value: null } };
  const material = new THREE.ShaderMaterial({
    uniforms,
    depthTest: false,
    depthWrite: false,
    toneMapped: true,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D tInput;
      varying vec2 vUv;
      void main() {
        gl_FragColor = texture2D(tInput, vUv);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const blitScene = new THREE.Scene();
  const blitCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  blitScene.add(quad);
  let target = null;
  return {
    cameraProfileId: CAMERA_PROFILES.editorLite.id,
    Render(renderer, sceneToDraw, cameraToDraw, width, height) {
      const w = Math.max(2, width | 0);
      const h = Math.max(2, height | 0);
      if (!target || target.width !== w || target.height !== h) {
        target?.dispose();
        target = new THREE.WebGLRenderTarget(w, h, {
          type: THREE.HalfFloatType,
          depthBuffer: true,
          stencilBuffer: false,
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
        });
      }
      const savedTarget = renderer.getRenderTarget();
      const savedTone = renderer.toneMapping;
      const savedExposure = renderer.toneMappingExposure;
      const savedSpace = renderer.outputColorSpace;
      const savedAutoClear = renderer.autoClear;
      try {
        renderer.toneMapping = THREE.NoToneMapping;
        renderer.toneMappingExposure = 1;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.autoClear = true;
        renderer.setRenderTarget(target);
        renderer.render(sceneToDraw, cameraToDraw);

        renderer.setRenderTarget(null);
        ApplyEditorLiteCameraProfile(renderer);
        uniforms.tInput.value = target.texture;
        renderer.render(blitScene, blitCamera);
      } finally {
        uniforms.tInput.value = null;
        renderer.toneMapping = savedTone;
        renderer.toneMappingExposure = savedExposure;
        renderer.outputColorSpace = savedSpace;
        renderer.autoClear = savedAutoClear;
        renderer.setRenderTarget(savedTarget);
      }
    },
    Dispose() {
      target?.dispose();
      target = null;
      quad.geometry.dispose();
      material.dispose();
    },
  };
}

export default {
  CAMERA_PROFILE_SCHEMA,
  CAMERA_PROFILE_RUNTIME_OVERRIDES,
  CAMERA_PROFILE_FROZEN_SETTINGS_KEYS,
  CAMERA_PROFILES,
  StripFrozenCameraSettings,
  IsFrozenCameraSettingKey,
  CreateStandardCameraPost,
  ApplyStandardCameraProfile,
  CreateStandardAoUniforms,
  SyncStandardAoUniforms,
  BuildStandardPostOptions,
  ApplyEditorLiteCameraProfile,
  CreateEditorLiteBlit,
};
