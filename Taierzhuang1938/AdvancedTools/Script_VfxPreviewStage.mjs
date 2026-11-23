// 特效预览台：渲染器 + 场景 + 轨道相机 + HDR 靶 + 输出变换（曝光 → ACES → sRGB），外加预览灯与天穹。
//
// 不是游戏的渲染管线：没有预通道、SSAO、体积雾、GI、泛光、调色。特效着色器输出的是线性 HDR，
// 所以这里只做「把 HDR 显示出来」必须的那一步（Script_ToneMapCurves 的 ACES，与游戏同一条曲线）。
// 曝光取环境预设里的 exposure（游戏自动曝光稳态时的增益就是它），再乘上用户的 EV 补偿。
// 天穹用预设的天顶 / 地平线 / 地面色画一个渐变，只当背景参照。

import * as THREE from "three";
import { TONEMAP_GLSL } from "../Script_ToneMapCurves.mjs";
import { Studio } from "../Script_EditorStage.mjs";
import { PreviewLights } from "./Script_VfxPreviewLights.mjs";
import { PreviewMaterialLibrary } from "./Script_VfxPreviewSurfaces.mjs";

const OUTPUT_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
const OUTPUT_FRAG = /* glsl */`
uniform sampler2D tHdr;
uniform float uExposure;
varying vec2 vUv;
${TONEMAP_GLSL}
vec3 LinearToSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(max(c, vec3(1e-5)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
void main() {
  vec3 hdr = texture2D(tHdr, vUv).rgb * uExposure;
  gl_FragColor = vec4(LinearToSrgb(ApplyTonemap(hdr, 0.0)), 1.0);
}
`;

const SKY_FRAG = /* glsl */`
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGround;
varying vec3 vDir;
void main() {
  float y = normalize(vDir).y;
  vec3 sky = y >= 0.0 ? mix(uHorizon, uZenith, pow(clamp(y, 0.0, 1.0), 0.55)) : mix(uHorizon, uGround, clamp(-y * 4.0, 0.0, 1.0));
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
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.05, 2000);
    this.camera.position.set(0, 1.6, 6);
    this.scene.add(this.camera);
    this.library = new PreviewMaterialLibrary();
    this.lights = new PreviewLights(this.scene, { quality, shadowMapSize: quality === "low" ? 1024 : 2048 });
    this.studio = new Studio({ scene: this.scene, camera: this.camera, library: this.library });
    this.exposure = 1;
    this.exposureEv = 0;

    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false,
      uniforms: { uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGround: { value: new THREE.Color() } },
    }));
    this.sky.name = "SkyDome"; // 摄影棚藏世界时按这个名字留下天穹（Script_EditorStage.WorldMask）
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1000;
    this.scene.add(this.sky);

    this.hdr = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: quality === "low" ? 0 : 4, depthBuffer: true });
    this.output = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.ShaderMaterial({
      vertexShader: OUTPUT_VERT, fragmentShader: OUTPUT_FRAG, depthTest: false, depthWrite: false,
      uniforms: { tHdr: { value: this.hdr.texture }, uExposure: { value: 1 } },
    }));
    this.output.geometry.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.output.frustumCulled = false;
    this.outputScene = new THREE.Scene();
    this.outputScene.add(this.output);
    this.outputCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.Resize();
    this._onResize = () => this.Resize();
    window.addEventListener("resize", this._onResize);
  }

  Resize() {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(2, Math.round(rect.width || window.innerWidth));
    const height = Math.max(2, Math.round(rect.height || window.innerHeight));
    this.renderer.setSize(width, height, false);
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.hdr.setSize(size.x, size.y);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /** 环境参数（与 SKY_PRESETS 同形）落到灯、天穹与曝光上。 */
  ApplyEnvironment(env, sunDirection, flareSceneScale) {
    const direction = new THREE.Vector3(sunDirection.x, sunDirection.y, sunDirection.z).normalize();
    this.lights.ApplyEnvironment(env, direction, flareSceneScale);
    this.exposure = Number.isFinite(env.exposure) ? env.exposure : 1;
    // 天穹只是背景参照：预设的天顶 / 地平线 / 地面是线性辐亮度（与游戏天穹同一份数，HDR），照样过曝光与 ACES。
    const u = this.sky.material.uniforms;
    SkyColor(env.zenith, [0.38, 0.52, 0.72], u.uZenith.value);
    SkyColor(env.horizon, [0.68, 0.76, 0.86], u.uHorizon.value);
    SkyColor(env.ground, [0.30, 0.32, 0.34], u.uGround.value);
    this.sunDirection = direction;
  }

  SetExposureEv(ev) { this.exposureEv = Number.isFinite(ev) ? ev : 0; }

  get OutputExposure() { return this.exposure * Math.pow(2, this.exposureEv); }

  Render() {
    this.sky.position.copy(this.camera.position);
    this.sky.scale.setScalar(Math.min(1500, this.camera.far * 0.9));
    this.lights.FollowView(this.studio.orbit.target, Math.max(20, Math.min(160, this.studio.orbit.dist * 3)));
    this.renderer.setRenderTarget(this.hdr);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.output.material.uniforms.uExposure.value = this.OutputExposure;
    this.renderer.render(this.outputScene, this.outputCamera);
  }

  Dispose() {
    window.removeEventListener("resize", this._onResize);
    this.studio.Dispose();
    this.hdr.dispose();
    this.renderer.dispose();
  }
}
