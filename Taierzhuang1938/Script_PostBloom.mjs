// 《台儿庄：血战滕县》泛光（亮部提取 + 多级降/升采样）与太阳拖影。
//
// 2026-09 帧图重构从 `Script_Post.mjs` 原样搬出 —— GLSL 与参数一个字没改。
// 两个 pass 放在同一个文件里，因为它们共用那张 `bright` 靶：亮部提取顺手在
// alpha 里打包了一张低分辨率天空遮挡图，太阳拖影每步就只读这一张。
//
// 顺序上的铁律：**泛光必须在 tonemap 之前**（HDR 域）。放到 ACES 之后，
// 超亮部早被压到 1.0，阈值提取不出任何东西，只能靠把阈值降到 0.6 来"伪造"泛光，
// 结果整屏发奶白。

import * as THREE from "three";
import { MakeFullscreenMaterial, MakeRenderTarget, GLSL_COMMON } from "./Script_PostCommon.mjs";

// --- 泛光：亮部提取 + 13 抽样降采样 + 3x3 tent 升采样 -----------------------
const FRAG_BRIGHT = /* glsl */`
uniform sampler2D uSource;
uniform sampler2D uNormalDepth;
uniform float uThreshold;
uniform float uKnee;
uniform float uClamp;
uniform float uPackSky;
varying vec2 vUv;
${GLSL_COMMON}
void main() {
  vec3 c = texture2D(uSource, vUv).rgb;
  c = min(c, vec3(uClamp));                 // 防单个超亮像素把整屏糊成白饼
  float br = max(c.r, max(c.g, c.b));
  // 软膝：硬阈值会在爆点边缘切出一圈生硬的轮廓
  float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  float contrib = max(soft, br - uThreshold) / max(br, 1e-4);
  // 太阳拖影开时借 alpha 带一张低分辨率天空遮挡图。这一趟本来就在读 HDR，
  // 顺手多读一次深度，可以让后面的径向模糊每步从“亮部+全分辨率深度”
  // 两次随机访存变成只读这一张图。关拖影时统一写 1，动态分支不读深度。
  float sky = 1.0;
  if (uPackSky > 0.5) {
    float depth = texture2D(uNormalDepth, vUv).w;
    sky = clamp(step(depth, 0.0001) + step(300.0, depth), 0.0, 1.0);
  }
  gl_FragColor = vec4(c * contrib, sky);
}
`;

const FRAG_DOWNSAMPLE = /* glsl */`
uniform sampler2D uSource;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  // COD:AW 那套 13 抽样：比 2x2 盒式稳得多，镜头一动泛光不会"沸腾"
  vec3 a = texture2D(uSource, vUv + uTexel * vec2(-2.0,  2.0)).rgb;
  vec3 b = texture2D(uSource, vUv + uTexel * vec2( 0.0,  2.0)).rgb;
  vec3 c = texture2D(uSource, vUv + uTexel * vec2( 2.0,  2.0)).rgb;
  vec3 d = texture2D(uSource, vUv + uTexel * vec2(-2.0,  0.0)).rgb;
  vec3 e = texture2D(uSource, vUv).rgb;
  vec3 f = texture2D(uSource, vUv + uTexel * vec2( 2.0,  0.0)).rgb;
  vec3 g = texture2D(uSource, vUv + uTexel * vec2(-2.0, -2.0)).rgb;
  vec3 h = texture2D(uSource, vUv + uTexel * vec2( 0.0, -2.0)).rgb;
  vec3 i = texture2D(uSource, vUv + uTexel * vec2( 2.0, -2.0)).rgb;
  vec3 j = texture2D(uSource, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
  vec3 k = texture2D(uSource, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
  vec3 l = texture2D(uSource, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  vec3 m = texture2D(uSource, vUv + uTexel * vec2( 1.0, -1.0)).rgb;
  vec3 result = e * 0.125;
  result += (a + c + g + i) * 0.03125;
  result += (b + d + f + h) * 0.0625;
  result += (j + k + l + m) * 0.125;
  gl_FragColor = vec4(result, 1.0);
}
`;

const FRAG_UPSAMPLE = /* glsl */`
uniform sampler2D uSource;   // 更小一级
uniform sampler2D uPrevious; // 同级已有内容
uniform vec2 uTexel;
uniform float uRadius;
varying vec2 vUv;
void main() {
  vec2 o = uTexel * uRadius;
  vec3 s = texture2D(uSource, vUv + vec2(-o.x,  o.y)).rgb * 1.0;
  s += texture2D(uSource, vUv + vec2( 0.0,  o.y)).rgb * 2.0;
  s += texture2D(uSource, vUv + vec2( o.x,  o.y)).rgb * 1.0;
  s += texture2D(uSource, vUv + vec2(-o.x,  0.0)).rgb * 2.0;
  s += texture2D(uSource, vUv).rgb * 4.0;
  s += texture2D(uSource, vUv + vec2( o.x,  0.0)).rgb * 2.0;
  s += texture2D(uSource, vUv + vec2(-o.x, -o.y)).rgb * 1.0;
  s += texture2D(uSource, vUv + vec2( 0.0, -o.y)).rgb * 2.0;
  s += texture2D(uSource, vUv + vec2( o.x, -o.y)).rgb * 1.0;
  gl_FragColor = vec4(texture2D(uPrevious, vUv).rgb + s / 16.0, 1.0);
}
`;

// --- 太阳拖影 fallback（屏幕空间方向性模糊）---------------------------------
const FRAG_GODRAYS = /* glsl */`
uniform sampler2D uBright;
uniform vec2 uSunUv;
uniform float uDensity;
uniform float uWeight;
uniform float uFrame;
varying vec2 vUv;
${GLSL_COMMON}
vec3 TapRay(vec2 ray, float t, float jitter, float weight) {
  vec4 s = texture2D(uBright, vUv + ray * clamp(t + jitter, 0.0, 1.0));
  return s.rgb * s.a * weight;
}
void main() {
  // 这不再模拟体积内的逐步光线积分，只做一条指向太阳的屏幕空间拖影。
  // 8 个非均匀 tap 覆盖与旧版相同的 uDensity 长度；近处密、远处疏，
  // 低分辨率线性过滤 + 微小帧间抖动会把它融成连续光带。
  vec2 ray = (uSunUv - vUv) * uDensity;
  float jitter = (Ign(gl_FragCoord.xy + uFrame * 3.17) - 0.5) * 0.018;
  vec3 sum = TapRay(ray, 0.02, jitter, 1.00);
  sum += TapRay(ray, 0.06, jitter, 0.92);
  sum += TapRay(ray, 0.13, jitter, 0.84);
  sum += TapRay(ray, 0.23, jitter, 0.74);
  sum += TapRay(ray, 0.36, jitter, 0.63);
  sum += TapRay(ray, 0.52, jitter, 0.52);
  sum += TapRay(ray, 0.70, jitter, 0.42);
  sum += TapRay(ray, 0.90, jitter, 0.34);
  gl_FragColor = vec4(sum * (uWeight / 5.41), 1.0);
}
`;

export class BloomPass {
  constructor(pipeline) {
    this.name = "bloom";
    this.pipeline = pipeline;
    this.uniformsBright = {
      uSource: { value: null }, uNormalDepth: { value: null },
      uThreshold: { value: 1.18 }, uKnee: { value: 0.55 }, uClamp: { value: 40 },
      uPackSky: { value: 0 },
    };
    this.matBright = MakeFullscreenMaterial(FRAG_BRIGHT, this.uniformsBright);
    this.uniformsDown = { uSource: { value: null }, uTexel: { value: new THREE.Vector2() } };
    this.matDown = MakeFullscreenMaterial(FRAG_DOWNSAMPLE, this.uniformsDown);
    this.uniformsUp = {
      uSource: { value: null }, uPrevious: { value: null },
      uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1.0 },
    };
    this.matUp = MakeFullscreenMaterial(FRAG_UPSAMPLE, this.uniformsUp);
    this.bright = null;
    this.mips = [];
  }

  Enabled() { return true; }

  Resize(width, height) {
    if (this.bright) this.bright.dispose();
    for (const rt of this.mips) rt.dispose();
    this.mips = [];
    this.bright = MakeRenderTarget(width >> 1, height >> 1, { type: this.pipeline.hdrType });
    let mw = width >> 1, mh = height >> 1;
    for (let i = 0; i < this.pipeline.preset.bloomLevels; i += 1) {
      mw = Math.max(2, mw >> 1); mh = Math.max(2, mh >> 1);
      this.mips.push(MakeRenderTarget(mw, mh, { type: this.pipeline.hdrType }));
      // 升采样要往回叠，每一级都得有一份"已有内容"的副本
      this.mips.push(MakeRenderTarget(mw, mh, { type: this.pipeline.hdrType }));
    }
    this.pipeline.targets.bright = this.bright;
    this.pipeline.bloomMips = this.mips;
  }

  /** 合成 pass 实际采样的那一级泛光靶。调试面板与 uBloom 必须指同一张。 */
  get BloomTarget() {
    return this.mips[this.pipeline.preset.bloomLevels > 1 ? 1 : 0] || null;
  }

  Render(ctx) {
    this.uniformsBright.uSource.value = ctx.sceneColor.texture;
    this.uniformsBright.uNormalDepth.value = ctx.normalDepthTexture;
    this.uniformsBright.uPackSky.value = ctx.godActive ? 1 : 0;
    this.uniformsBright.uThreshold.value = ctx.options.bloomThreshold ?? 1.18;
    ctx.blitter.Blit(this.matBright, this.bright);

    const levels = ctx.preset.bloomLevels;
    let source = this.bright;
    for (let i = 0; i < levels; i += 1) {
      const dst = this.mips[i * 2];
      this.uniformsDown.uSource.value = source.texture;
      this.uniformsDown.uTexel.value.set(1 / source.width, 1 / source.height);
      ctx.blitter.Blit(this.matDown, dst);
      source = dst;
    }
    // 从最小一级往回叠：每一级 = 本级降采样结果 + 上一级(更小)的 tent 放大
    let carried = this.mips[(levels - 1) * 2];
    for (let i = levels - 2; i >= 0; i -= 1) {
      const same = this.mips[i * 2];
      const dst = this.mips[i * 2 + 1];
      this.uniformsUp.uSource.value = carried.texture;
      this.uniformsUp.uPrevious.value = same.texture;
      this.uniformsUp.uTexel.value.set(1 / dst.width, 1 / dst.height);
      ctx.blitter.Blit(this.matUp, dst);
      carried = dst;
    }
  }

  Dispose() {
    if (this.bright) this.bright.dispose();
    for (const rt of this.mips) rt.dispose();
    this.mips = [];
    this.matBright.dispose();
    this.matDown.dispose();
    this.matUp.dispose();
  }
}

export class GodRaysPass {
  constructor(pipeline, bloom) {
    this.name = "god";
    this.pipeline = pipeline;
    this.bloom = bloom;
    this.uniforms = {
      uBright: { value: null },
      uSunUv: { value: new THREE.Vector2(0.5, 0.8) }, uDensity: { value: 0.52 },
      uWeight: { value: 3.0 }, uFrame: { value: 0 },
    };
    this.material = MakeFullscreenMaterial(FRAG_GODRAYS, this.uniforms);
    this.target = null;
    this.sunWorld = new THREE.Vector3();
  }

  Resize(width, height) {
    if (this.target) this.target.dispose();
    // 太阳拖影是方向性模糊，放大后本来就没有高频细节。常规 1600×900 仍走 1/4
    // （360p 量级）；超宽/4K 不再让它跟像素数无上限增长，封顶约 9.6 万像素。
    // 用户的 3394×1348 截图因此从 848×337 收到约 491×195，宽高比不变。
    let godW = Math.max(2, width >> 2), godH = Math.max(2, height >> 2);
    const godMaxPixels = 96000;
    const godScale = Math.min(1, Math.sqrt(godMaxPixels / (godW * godH)));
    godW = Math.max(2, Math.round(godW * godScale));
    godH = Math.max(2, Math.round(godH * godScale));
    this.target = MakeRenderTarget(godW, godH, { type: this.pipeline.hdrType });
    this.pipeline.targets.god = this.target;
  }

  /**
   * 在亮部提取前就算好这帧会不会跑太阳拖影，因为亮部图的 alpha
   * 只在这种情况下需要顺手打包天空遮挡。旧版到第 5 pass 才投影太阳，
   * 亮部 pass 无法知道是否值得多读一张深度图。
   */
  ResolveActivation(ctx) {
    let godStrength = ctx.options.godStrength ?? 0;
    let godActive = false;
    if (ctx.preset.godrays && godStrength > 0 && ctx.options.sunDirection) {
      // 太阳只是方向，拿一个相机前方的有限点做屏幕投影即可。点必须留在远裁面
      // 以内；界河关卡 far=460，旧版写死 600 会让 ndc.z 越界，fallback 永远不开。
      const sunProjectionDistance = Math.min(600, ctx.camera.far * 0.9);
      const ndc = this.sunWorld.copy(ctx.options.sunDirection).multiplyScalar(sunProjectionDistance)
        .add(ctx.camera.position).project(ctx.camera);
      const edge = Math.max(Math.abs(ndc.x), Math.abs(ndc.y));
      if (ndc.z < 1 && edge < 1.4) {
        godStrength *= THREE.MathUtils.clamp(1.4 - edge, 0, 1);
        godActive = godStrength > 0.0001;
      }
    }
    if (!godActive) godStrength = 0;
    ctx.godActive = godActive;
    ctx.godStrength = godStrength;
    ctx.sunNdc.copy(this.sunWorld);
    ctx.sunUv.set(this.sunWorld.x * 0.5 + 0.5, this.sunWorld.y * 0.5 + 0.5);
  }

  Enabled(ctx) { return ctx.godActive; }

  Render(ctx) {
    this.uniforms.uBright.value = this.bloom.bright.texture;
    this.uniforms.uSunUv.value.copy(ctx.sunUv);
    this.uniforms.uFrame.value = ctx.frame;
    ctx.blitter.Blit(this.material, this.target);
  }

  Dispose() {
    if (this.target) this.target.dispose();
    this.material.dispose();
  }
}
