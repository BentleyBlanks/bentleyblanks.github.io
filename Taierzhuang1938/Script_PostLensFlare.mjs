// 《台儿庄：血战滕县》镜头光晕（John Chapman,《Pseudo Lens Flare》, 2013）
// + 镜头脏污 + 受遮挡的太阳眩光。
//
// 帧图位置：`god` 之后、`composite` 之前。读的是泛光那一趟已经提取好的**亮部图**
// （`BloomPass.bright`，半分辨率），所以不用为它再扫一遍全屏 HDR。
// 输出一张约 1/4 分辨率（封顶 9.6 万像素，与太阳拖影同一口径）的 HDR 靶，
// 由合成 pass 在**曝光与 tonemap 之前**加进来 —— 光晕是进到镜头里的光，
// 不是屏幕上的贴纸；放到 tonemap 之后就只能是一层假的亮斑。
//
// ## 三层（都在 Data_Tuning_Camera.LENS_FLARE 里配）
//   ghosts  亮部图沿「像素 → 屏幕中心」方向的重复采样。真镜头里每一组镜片
//           都会反射一次，反射像沿光轴对称分布 —— 这就是「鬼影」。
//           RGB 用略微不同的采样半径，得到镜片色散（紫边/青边）。
//   halo    固定半径的环：镜筒内壁的一次反射。
//   glare   太阳位置上的星芒 + 核心辉光。**受屏幕空间遮挡**：
//           太阳被墙/屋檐挡住时它必须消失，否则整关都糊着一颗假太阳。
//           判据用预通道 RT0 的线性视深（w > 0 = 有几何 = 挡住）。
//
// ## 镜头脏污为什么不在这一 pass 里
// 脏污是**乘在泛光上的**（`bloom *= 1 + dirt·strength·smoothstep(…)`），
// 而泛光是在合成 pass 里加进去的。所以脏污纹理由这个模块生成、交给合成 pass 用，
// 那边写成等价的加法项（`+ bloom·strength·dirt·门槛`）。关键是那道 smoothstep
// 门槛：只有真的有强光源时脏污才亮起来，否则整屏永远糊着一层灰（docs §5）。
//
// GLSL ES 3.00 保留字（sample / filter / input / output / …）一个都不用。

import * as THREE from "three";
import { MakeFullscreenMaterial, MakeRenderTarget, GLSL_COMMON } from "./Script_PostCommon.mjs";
import { LENS_FLARE } from "./Data_Tuning_Camera.mjs";

const F = LENS_FLARE;

const FRAG_LENS_FLARE = /* glsl */`
uniform sampler2D uBright;
uniform sampler2D uNormalDepth;
uniform vec2 uSunUv;
uniform float uSunOnScreen;     // CPU 判定：太阳投影是否落在（外扩后的）屏幕里
uniform float uGlare;           // 星芒总强度（0 = 不画）
uniform float uAspect;
uniform float uThreshold;
uniform float uFrame;
varying vec2 vUv;
${GLSL_COMMON}

/**
 * 亮部再抬一道门槛：光晕只吃真正的光源，不吃被泛光提起来的中间调。
 * 否则整幅画都会往中心方向拖出一串鬼影 —— 那就是廉价滤镜感。
 */
vec3 FlareSource(vec2 uv) {
  vec3 c = texture2D(uBright, clamp(uv, vec2(0.001), vec2(0.999))).rgb;
  float br = max(c.r, max(c.g, c.b));
  return c * max(br - uThreshold, 0.0) / max(br, 1e-4);
}

/** 色散：R/G/B 沿同一方向取略微不同的半径，得到镜片的紫边/青边。 */
vec3 SourceDispersed(vec2 uv, vec2 direction, float amount) {
  return vec3(
    FlareSource(uv + direction * amount).r,
    FlareSource(uv).g,
    FlareSource(uv - direction * amount).b);
}

/**
 * 镜头色：鬼影不是白的，它带着镜片镀膜的颜色。
 * 用余弦调色板（Inigo Quilez）而不是一张 1D LUT —— 少一张纹理，且可复现。
 */
vec3 LensTint(float t) {
  return 0.62 + 0.38 * cos(6.28318 * (vec3(0.00, 0.16, 0.32) + clamp(t, 0.0, 1.0)));
}

/** 太阳是否被几何挡住：在太阳 uv 周围绕一圈取样，只有天空（视深 0）才算露出来。 */
float SunVisibility() {
  if (uSunOnScreen < 0.5) return 0.0;
  float open = 0.0;
  for (int i = 0; i < ${F.occlusionTaps}; i++) {
    float a = (float(i) + 0.5) / ${F.occlusionTaps.toFixed(1)} * 6.28318;
    vec2 offset = vec2(cos(a) / max(uAspect, 0.001), sin(a)) * ${F.occlusionRadius.toFixed(4)};
    vec2 uv = uSunUv + offset;
    // 屏幕外的取样点当作「看不见」：太阳半个盘在画面外时眩光本来就该减半
    float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
    float viewDepth = texture2D(uNormalDepth, clamp(uv, vec2(0.0), vec2(1.0))).w;
    open += inside * step(viewDepth, 0.0001);
  }
  return open / ${F.occlusionTaps.toFixed(1)};
}

void main() {
  // Chapman 的口径：以屏幕中心为对称点，先把 uv 翻过去
  vec2 flipped = 1.0 - vUv;
  vec2 toCenter = vec2(0.5) - flipped;
  vec2 ghostStep = toCenter * ${F.ghostSpacing.toFixed(4)};
  vec2 direction = normalize(toCenter + vec2(1e-6));
  vec3 result = vec3(0.0);
  // 鬼影与光环单独一层：它们乘 ghostScale，太阳眩光不乘（见 Data_Tuning_Camera）。
  vec3 ghosts = vec3(0.0);

  // --- 鬼影 ---------------------------------------------------------------
  for (int i = 1; i <= ${F.ghostCount}; i++) {
    vec2 uv = flipped + ghostStep * float(i);
    // 画面外的鬼影不采（clamp 会把边缘那一列拉成一条亮带）
    float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
    float radial = length(vec2(0.5) - uv) / 0.70710678;
    float weight = pow(clamp(1.0 - radial, 0.0, 1.0), 8.0) * inside;
    vec3 texel = SourceDispersed(uv, direction, ${F.ghostDispersal.toFixed(5)} * float(i));
    ghosts += texel * weight * LensTint(radial);
  }

  // --- 光环（镜筒内壁的一次反射）------------------------------------------
  {
    vec2 uv = flipped + direction * ${F.haloRadius.toFixed(4)};
    float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
    float radial = length(vec2(0.5) - uv) / 0.70710678;
    float ring = pow(clamp(1.0 - abs(radial - 0.5) / ${F.haloWidth.toFixed(4)}, 0.0, 1.0), 3.0);
    ghosts += SourceDispersed(uv, direction, ${F.haloChroma.toFixed(5)})
      * ring * inside * LensTint(radial * 0.6 + 0.2);
  }
  result += ghosts * ${F.ghostScale.toFixed(4)};

  // --- 太阳眩光（星芒 + 核心）---------------------------------------------
  if (uGlare > 0.0001 && ${F.starPoints} > 0) {
    float visibility = SunVisibility();
    if (visibility > 0.0) {
      vec2 d = (vUv - uSunUv) * vec2(uAspect, 1.0);
      float dist = length(d);
      float angle = atan(d.y, d.x);
      // 光圈叶片数决定星芒条数；abs(cos) 的正负两瓣合起来正好是对称的星
      float spikes = pow(abs(cos(angle * ${(F.starPoints * 0.5).toFixed(1)})),
                         ${F.starSharpness.toFixed(1)});
      float falloff = exp(-dist / ${F.starLength.toFixed(4)});
      float core = exp(-dist * dist / 0.00035);
      // 太阳自己的颜色从亮部图上就近取一口（比另传一份 sunColor 少一个接线点）
      vec3 sunColor = texture2D(uBright, clamp(uSunUv, vec2(0.001), vec2(0.999))).rgb;
      float br = max(max(sunColor.r, sunColor.g), max(sunColor.b, 1e-4));
      sunColor /= br;
      result += sunColor * (spikes * falloff * 1.6 + core * 2.2) * uGlare * visibility;
    }
  }

  // 时间抖动只加在极弱的一层上：鬼影是低频的，不抖也不会有色带，
  // 但完全静止的光晕在推镜头时会显得"贴在屏幕上"。
  float jitter = 0.985 + 0.015 * Ign(gl_FragCoord.xy + uFrame * 5.31);
  gl_FragColor = vec4(max(result * jitter, vec3(0.0)), 1.0);
}
`;

/**
 * 程序化烘一张镜头脏污图（灰度，存在 R 通道）。
 *
 * 确定性 LCG，不用 Math.random —— 视觉审查靠逐轮截图比对，画面自己在抖
 * 就判断不了「这一版比上一版好」（docs 的坑）。
 * 内容：几十个软油斑 + 十几道细划痕 + 一层低频底噪。
 */
export function BakeLensDirt(size = F.dirt.size, seed = F.dirt.seed) {
  let state = seed >>> 0;
  const Random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const field = new Float32Array(size * size);

  // 油斑
  const blobs = 46;
  for (let i = 0; i < blobs; i += 1) {
    const cx = Random() * size;
    const cy = Random() * size;
    const radius = (0.008 + Random() * 0.045) * size;
    const strength = 0.25 + Random() * 0.75;
    const squash = 0.6 + Random() * 0.9;
    const x0 = Math.max(0, Math.floor(cx - radius * 2));
    const x1 = Math.min(size - 1, Math.ceil(cx + radius * 2));
    const y0 = Math.max(0, Math.floor(cy - radius * 2 / squash));
    const y1 = Math.min(size - 1, Math.ceil(cy + radius * 2 / squash));
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const dx = (x - cx) / radius;
        const dy = (y - cy) * squash / radius;
        const d2 = dx * dx + dy * dy;
        if (d2 > 4) continue;
        const falloff = Math.exp(-d2 * 1.6);
        const index = y * size + x;
        field[index] = Math.max(field[index], falloff * strength);
      }
    }
  }

  // 划痕：一段一段的细线，端点随机
  const scratches = 15;
  for (let i = 0; i < scratches; i += 1) {
    const x0 = Random() * size;
    const y0 = Random() * size;
    const angle = Random() * Math.PI * 2;
    const length = (0.10 + Random() * 0.45) * size;
    const strength = 0.20 + Random() * 0.45;
    const steps = Math.ceil(length * 2);
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps;
      const x = x0 + Math.cos(angle) * length * t;
      const y = y0 + Math.sin(angle) * length * t;
      // 划痕的亮度沿长度呼吸，端点淡出
      const fade = Math.sin(t * Math.PI) * strength;
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          const px = Math.round(x) + ox;
          const py = Math.round(y) + oy;
          if (px < 0 || py < 0 || px >= size || py >= size) continue;
          const w = ox === 0 && oy === 0 ? 1 : 0.35;
          const index = py * size + px;
          field[index] = Math.max(field[index], fade * w);
        }
      }
    }
  }

  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i += 1) {
    // 一层极低的底噪：完全干净的镜头也不真实，但它必须低到只在强光下才现形
    const base = 0.04 + 0.05 * ((i * 2654435761) % 1024) / 1024;
    const value = Math.min(1, field[i] + base);
    const byte = Math.round(value * 255);
    data[i * 4] = byte;
    data[i * 4 + 1] = byte;
    data[i * 4 + 2] = byte;
    data[i * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.colorSpace = THREE.NoColorSpace;      // 脏污是**数据**，不是颜色
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

/** 光晕关着时合成 pass 绑的 1×1 全黑（加出来精确等于 0）。 */
function MakeBlackPixel() {
  const texture = new THREE.DataTexture(
    new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export class LensFlarePass {
  constructor(pipeline, bloom) {
    this.name = "lensFlare";
    this.pipeline = pipeline;
    this.bloom = bloom;
    this.blackPixel = MakeBlackPixel();
    this.dirtTexture = null;          // 惰性烘：关着的档一个字节都不占
    this.active = false;
    this.strength = 0;                // 本帧总强度（档位 × 面板倍率）
    this.dirtStrength = F.dirt.strength;
    this.userScale = 1;
    this.userDirtScale = 1;
    this.uniforms = {
      uBright: { value: null },
      uNormalDepth: { value: null },
      uSunUv: { value: new THREE.Vector2(0.5, 0.8) },
      uSunOnScreen: { value: 0 },
      uGlare: { value: 1 },
      uAspect: { value: 1 },
      uThreshold: { value: F.threshold },
      uFrame: { value: 0 },
    };
    this.material = MakeFullscreenMaterial(FRAG_LENS_FLARE, this.uniforms);
    this.target = null;
    this._sunWorld = new THREE.Vector3();
  }

  /** 合成 pass 绑的那张：没在跑就是 1×1 全黑。 */
  get Texture() {
    return this.active && this.target ? this.target.texture : this.blackPixel;
  }

  /** 镜头脏污（惰性烘一次，之后一直用）。 */
  get DirtTexture() {
    if (!this.dirtTexture) this.dirtTexture = BakeLensDirt();
    return this.dirtTexture;
  }

  /**
   * Debug Rendering 的两张视图。两张都走通用展示 pass（mode 4 = Reinhard+sRGB，
   * mode 5 = 0-1 直通），不需要自带材质。
   */
  RegisterDebugViews(debugPass) {
    debugPass.RegisterView("lensFlare", () => ({
      texture: this.target?.texture, mode: 4, unavailable: !this.active,
    }));
    debugPass.RegisterView("lensDirt", () => ({
      texture: this.DirtTexture, mode: 5,
    }));
  }

  /** 画质面板的两根倍率（0 = 关）。 */
  SetUserScale(flare, dirt) {
    if (Number.isFinite(flare)) this.userScale = Math.max(0, flare);
    if (Number.isFinite(dirt)) this.userDirtScale = Math.max(0, dirt);
  }

  Resize(width, height) {
    if (this.target) this.target.dispose();
    // 与太阳拖影同一口径：光晕是低频的，放大后本来就没有高频细节。
    // 常规 1600×900 走 1/4；超宽/4K 封顶约 9.6 万像素，宽高比不变。
    let w = Math.max(2, width >> 2);
    let h = Math.max(2, height >> 2);
    const scale = Math.min(1, Math.sqrt(96000 / (w * h)));
    w = Math.max(2, Math.round(w * scale));
    h = Math.max(2, Math.round(h * scale));
    this.target = MakeRenderTarget(w, h, { type: this.pipeline.hdrType });
    this.pipeline.targets.flare = this.target;
  }

  /**
   * 本帧强度与太阳屏幕位置。放在 Prepare 里而不是 Render 里，是因为
   * **关着的时候也要跑**：`strength` 归零、`active` 归 false，
   * 合成 pass 那边才不会继续加着上一帧的光晕。
   *
   * 太阳投影自己算，不借 `ctx.sunUv` —— 那一份由太阳拖影 pass 写，
   * 而拖影出厂是关着的（`graphics.godEnabled = false`），
   * 借它等于让光晕跟着一个从来不更新的坐标走。
   */
  Prepare(ctx) {
    const byQuality = F.byQuality[this.pipeline.quality] ?? 0;
    this.strength = byQuality * this.userScale * (ctx.options.lensFlare ?? 1);
    this.dirtStrength = F.dirt.strength * this.userDirtScale * (ctx.options.lensDirt ?? 1);
    this.active = !!ctx.preset.lensFlare && this.strength > 0.0001;
    if (!this.active) return;

    const U = this.uniforms;
    // 鬼影/光环的几何按**输出**画面的宽高比摆（这一趟读的是泛光亮部图，
    // 而泛光跟着 TAA 之后的 sceneColor 走）。TAAU 开着时两组分辨率不同。
    U.uAspect.value = ctx.outputWidth / Math.max(1, ctx.outputHeight);
    U.uFrame.value = ctx.frame;
    if (ctx.options.sunDirection) {
      // 太阳只是方向；取相机前方一个仍在远裁面以内的点做屏幕投影
      const distance = Math.min(600, ctx.camera.far * 0.9);
      const ndc = this._sunWorld.copy(ctx.options.sunDirection).multiplyScalar(distance)
        .add(ctx.camera.position).project(ctx.camera);
      const edge = Math.max(Math.abs(ndc.x), Math.abs(ndc.y));
      const onScreen = ndc.z < 1 && edge < 1.05;
      U.uSunUv.value.set(ndc.x * 0.5 + 0.5, ndc.y * 0.5 + 0.5);
      U.uSunOnScreen.value = onScreen ? 1 : 0;
      U.uGlare.value = onScreen ? THREE.MathUtils.clamp(1.15 - edge, 0, 1) : 0;
    } else {
      U.uSunOnScreen.value = 0;
      U.uGlare.value = 0;
    }
  }

  Enabled() { return this.active; }

  Render(ctx) {
    this.uniforms.uBright.value = this.bloom.bright.texture;
    this.uniforms.uNormalDepth.value = ctx.normalDepthTexture;
    ctx.blitter.Blit(this.material, this.target);
  }

  Dispose() {
    if (this.target) this.target.dispose();
    this.material.dispose();
    this.blackPixel.dispose();
    this.dirtTexture?.dispose();
    this.dirtTexture = null;
  }
}

export default LensFlarePass;
