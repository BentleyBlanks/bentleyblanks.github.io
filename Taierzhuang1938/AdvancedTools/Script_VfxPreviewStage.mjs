// 特效预览台：渲染器 + 场景 + 轨道相机 + 标准固化相机后处理管线（CAMERA_PROFILES.standard），外加预览灯、测试场与天穹。
//
// 2026-11-28 CameraProfile 统一：弃用独立简化 ACES 输出通道，改为复用项目唯一完整后处理管线
// `CreateStandardCameraPost` + `BuildStandardPostOptions`（与正片白天基线同源：TAA / 自动曝光 / Bloom /
// ACES + 64³ 3D LUT / FilmOptics / 35mm 颗粒），保证特效在预览台与正片里的泛光、对比度、色彩响应一致；
// 昼夜切换只改变灯光、天穹与雾，不再修改后处理。

import * as THREE from "three";
import {
  CAMERA_PROFILES, CreateStandardCameraPost, BuildStandardPostOptions,
} from "../Script_CameraProfile.mjs";
import { MarkNoPrepass } from "../Script_Post.mjs";
import { Studio } from "../Script_EditorStage.mjs";
import { PreviewLights } from "./Script_VfxPreviewLights.mjs";
import { PreviewMaterialLibrary } from "./Script_VfxPreviewSurfaces.mjs";
import { VfxPreviewArena } from "./Script_VfxPreviewArena.mjs";

const SKY_FRAG = /* glsl */`
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunDir;
uniform vec3 uSunTint;
uniform float uSunGlow;
uniform float uDarkMode;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  if (uDarkMode > 0.5) {
    vec3 darkZenith = vec3(0.011, 0.012, 0.015);
    vec3 darkHorizon = vec3(0.025, 0.027, 0.030);
    vec3 darkGround = vec3(0.009, 0.010, 0.012);
    vec3 col = y >= 0.0
      ? mix(darkHorizon, darkZenith, pow(clamp(y, 0.0, 1.0), 0.65))
      : mix(darkHorizon, darkGround, clamp(-y * 3.5, 0.0, 1.0));
    gl_FragColor = vec4(col, 1.0);
    return;
  }
  vec3 sky = y >= 0.0
    ? mix(uHorizon, uZenith, pow(clamp(y, 0.0, 1.0), 0.52))
    : mix(uHorizon, uGround, clamp(-y * 4.5, 0.0, 1.0));
  // 柔和太阳方向大气散射辉光，使户外天穹更有方向层次
  float mu = max(dot(d, normalize(uSunDir)), 0.0);
  float haze = pow(mu, 10.0) * 0.16 + pow(mu, 96.0) * 0.45;
  sky += uSunTint * haze * uSunGlow * smoothstep(-0.08, 0.12, y);
  gl_FragColor = vec4(sky, 1.0);
}
`;
const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

/** 环境参数里的天空色：线性 RGB 数组（HDR）；兼容老的 0xrrggbb（按 sRGB 解）。 */
function SkyColor(value, fallback, target) {
  if (Array.isArray(value) && value.length >= 3) return target.setRGB(value[0], value[1], value[2]);
  if (Number.isFinite(value)) return target.setHex(value, THREE.SRGBColorSpace);
  return target.setRGB(fallback[0], fallback[1], fallback[2]);
}

export class VfxPreviewStage {
  constructor(canvas, { quality = "high", pixelRatio = Math.min(1.5, globalThis.devicePixelRatio || 1) } = {}) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.05, 2000);
    this.camera.position.set(0, 1.6, 6);
    this.scene.add(this.camera);
    this.post = CreateStandardCameraPost(this.renderer, { width: 2, height: 2, quality });
    this.library = new PreviewMaterialLibrary();
    this.lights = new PreviewLights(this.scene, { quality, shadowMapSize: quality === "low" ? 1024 : 2048 });
    this.studio = new Studio({ scene: this.scene, camera: this.camera, library: this.library });
    this.arena = new VfxPreviewArena(this.studio);
    if (this.arena.grid?.material) {
      MarkNoPrepass(this.arena.grid.material);
      this.arena.grid.userData.skipNormalDepth = true;
    }
    this.exposure = CAMERA_PROFILES.standard.exposure;
    this.sunDirection = new THREE.Vector3(0.4, 0.8, 0.4).normalize();
    this.sunColor = [...CAMERA_PROFILES.standard.defaultSunColor];
    this.fog = CAMERA_PROFILES.standard.neutralFog;
    this.volumetricPreset = CAMERA_PROFILES.standard.skyPreset;

    const skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false,
      uniforms: {
        uZenith: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uGround: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.4).normalize() },
        uSunTint: { value: new THREE.Color(1, 0.96, 0.88) },
        uSunGlow: { value: 0.4 },
        uDarkMode: { value: 0.0 },
      },
    });
    MarkNoPrepass(skyMat);
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), skyMat);
    this.sky.name = "SkyDome"; // 摄影棚藏世界时按这个名字留下天穹（Script_EditorStage.WorldMask）
    this.sky.userData.skipNormalDepth = true;
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1000;
    this.scene.add(this.sky);

    this.Resize();
    this._onResize = () => this.Resize();
    window.addEventListener("resize", this._onResize);
    if (typeof ResizeObserver !== "undefined") {
      this._resizeObserver = new ResizeObserver(() => this.Resize());
      this._resizeObserver.observe(canvas);
    }
  }

  Resize() {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(2, Math.round(rect.width || window.innerWidth));
    const height = Math.max(2, Math.round(rect.height || window.innerHeight));
    if (this._w === width && this._h === height) return;
    this._w = width;
    this._h = height;
    this.renderer.setSize(width, height, false);
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.post.SetSize(Math.max(2, size.x), Math.max(2, size.y));
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /** 环境参数（与 SKY_PRESETS 同形）只落到灯、天穹与雾上；后处理曝光与调色锁定在 CAMERA_PROFILES.standard。 */
  ApplyEnvironment(env, sunDirection, flareSceneScale) {
    const direction = new THREE.Vector3(sunDirection.x, sunDirection.y, sunDirection.z).normalize();
    this.lights.ApplyEnvironment(env, direction, flareSceneScale);
    this.exposure = CAMERA_PROFILES.standard.exposure;
    this.sunColor = Array.isArray(env.sunColor) ? env.sunColor : CAMERA_PROFILES.standard.defaultSunColor;
    this.fog = env.fog || CAMERA_PROFILES.standard.neutralFog;
    this.volumetricPreset = env.profile || CAMERA_PROFILES.standard.skyPreset;
    const u = this.sky.material.uniforms;
    SkyColor(env.zenith, [0.38, 0.52, 0.72], u.uZenith.value);
    SkyColor(env.horizon, [0.68, 0.76, 0.86], u.uHorizon.value);
    SkyColor(env.ground, [0.30, 0.32, 0.34], u.uGround.value);
    u.uSunDir.value.copy(direction);
    u.uSunTint.value.setHex(env.lightColor ?? 0xfff2df);
    u.uSunGlow.value = Math.min(1.8, Math.max(0.1, Number(env.glow) || (this.lights.sun.intensity > 0.6 ? 0.45 : 0.15)));
    this.sunDirection = direction;
    this.arena.SyncEnvironment(u.uHorizon.value, this.OutputExposure);
  }

  SetArenaMode(mode) {
    this.arena.SetMode(mode);
    this.sky.material.uniforms.uDarkMode.value = mode === "dark" ? 1.0 : 0.0;
    this.arena.SyncEnvironment(this.sky.material.uniforms.uHorizon.value, this.OutputExposure);
  }

  SetArenaEffect(effectId, flags) {
    this.arena.SetEffect(effectId, flags);
  }

  get OutputExposure() { return CAMERA_PROFILES.standard.exposure; }

  Render(dt = 1 / 60) {
    this.sky.position.copy(this.camera.position);
    this.sky.scale.setScalar(Math.min(1500, this.camera.far * 0.9));
    this.arena.Update(this.studio.orbit.dist);
    this.lights.FollowView(this.studio.orbit.target, Math.max(20, Math.min(160, this.studio.orbit.dist * 3)));
    this.post.Render(this.scene, this.camera, BuildStandardPostOptions({
      sunDirection: this.sunDirection,
      sunColor: this.sunColor,
      fog: this.arena.mode === "dark" ? CAMERA_PROFILES.standard.neutralFog : this.fog,
      volumetricPreset: this.volumetricPreset,
      dt,
    }));
  }

  Dispose() {
    window.removeEventListener("resize", this._onResize);
    this._resizeObserver?.disconnect();
    this.arena.Dispose();
    this.studio.Dispose();
    this.post.Dispose();
    this.renderer.dispose();
  }
}
