import * as THREE from "../TunnelBell1942/vendor/three/build/three.module.mjs";

const GradeProfiles = Object.freeze({
  school: Object.freeze({
    shadow: 0x90aaa4,
    highlight: 0xffd9a2,
    saturation: 0.62,
    contrast: 1.075,
    vignette: 0.27,
    bloom: 0.08,
    dof: 0.16,
    focusRange: 7.2,
    gain: 1.22,
    lift: 0.012,
  }),
  blockade: Object.freeze({
    shadow: 0x719b9c,
    highlight: 0xf1d39a,
    saturation: 0.58,
    contrast: 1.085,
    vignette: 0.3,
    bloom: 0.09,
    dof: 0.18,
    focusRange: 7.4,
    gain: 1.18,
    lift: 0.01,
  }),
  tunnel: Object.freeze({
    shadow: 0x886e58,
    highlight: 0xffc37b,
    saturation: 0.6,
    contrast: 1.075,
    vignette: 0.29,
    bloom: 0.1,
    dof: 0.12,
    focusRange: 6.5,
    gain: 1.33,
    lift: 0.014,
  }),
  ferry: Object.freeze({
    shadow: 0x829ba0,
    highlight: 0xffdda5,
    saturation: 0.61,
    contrast: 1.08,
    vignette: 0.28,
    bloom: 0.08,
    dof: 0.16,
    focusRange: 7.4,
    gain: 1.14,
    lift: 0.008,
  }),
});

const VertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FragmentShader = `
  precision highp float;
  uniform sampler2D uScene;
  uniform sampler2D uDepth;
  uniform vec2 uResolution;
  uniform float uTime;
  uniform float uNear;
  uniform float uFar;
  uniform float uFocusDistance;
  uniform float uFocusRange;
  uniform float uDofStrength;
  uniform float uGrainStrength;
  uniform float uVignetteStrength;
  uniform float uBloomStrength;
  uniform float uQuality;
  uniform float uSaturation;
  uniform float uContrast;
  uniform float uGain;
  uniform float uLift;
  uniform vec3 uShadowTint;
  uniform vec3 uHighlightTint;
  varying vec2 vUv;

  float Luminance(vec3 color) {
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
  }

  float LinearDepth(float depth) {
    float z = depth * 2.0 - 1.0;
    return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
  }

  float Hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  vec3 Scene(vec2 uv) {
    return texture2D(uScene, clamp(uv, vec2(0.001), vec2(0.999))).rgb;
  }

  vec3 LinearToSrgb(vec3 value) {
    vec3 lower = value * 12.92;
    vec3 higher = 1.055 * pow(max(value, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
    return mix(lower, higher, step(vec3(0.0031308), value));
  }

  void main() {
    vec2 texel = 1.0 / max(uResolution, vec2(1.0));
    vec2 centered = vUv - 0.5;
    float edge = dot(centered, centered);
    vec3 color = Scene(vUv);
    if (uQuality > 0.45) {
      vec2 chromaShift = centered * texel * (0.16 + edge * 1.2) * uQuality;
      color.r = Scene(vUv + chromaShift).r;
      color.b = Scene(vUv - chromaShift).b;

      float viewDepth = LinearDepth(texture2D(uDepth, vUv).x);
      float focusDelta = abs(viewDepth - uFocusDistance);
      float coc = smoothstep(uFocusRange, uFocusRange * 3.0, focusDelta) * uDofStrength * uQuality;
      vec2 blur = texel * (1.0 + coc * 3.2);
      vec3 blurColor = Scene(vUv + vec2( blur.x, 0.0));
      blurColor += Scene(vUv + vec2(-blur.x, 0.0));
      blurColor += Scene(vUv + vec2(0.0,  blur.y));
      blurColor += Scene(vUv + vec2(0.0, -blur.y));
      blurColor += Scene(vUv + vec2( blur.x,  blur.y));
      blurColor += Scene(vUv + vec2(-blur.x,  blur.y));
      blurColor += Scene(vUv + vec2( blur.x, -blur.y));
      blurColor += Scene(vUv + vec2(-blur.x, -blur.y));
      color = mix(color, blurColor * 0.125, coc * 0.72);

      vec2 glowStep = texel * (4.0 + uQuality * 3.0);
      vec3 glow = Scene(vUv + vec2( glowStep.x, 0.0));
      glow += Scene(vUv + vec2(-glowStep.x, 0.0));
      glow += Scene(vUv + vec2(0.0,  glowStep.y));
      glow += Scene(vUv + vec2(0.0, -glowStep.y));
      glow *= 0.25;
      color += max(glow - vec3(0.54), vec3(0.0)) * uBloomStrength;
    }

    float luma = Luminance(color);
    color = mix(vec3(luma), color, uSaturation);
    float shadowWeight = 1.0 - smoothstep(0.06, 0.48, luma);
    float highlightWeight = smoothstep(0.38, 0.9, luma);
    color *= mix(vec3(1.0), uShadowTint, shadowWeight * 0.18);
    color *= mix(vec3(1.0), uHighlightTint, highlightWeight * 0.12);
    color = color * uGain + vec3(uLift);
    // Night photography needs contrast without treating middle grey as the
    // pivot: a 0.5 pivot crushed almost every earth tone to black.  A low
    // photographic pivot keeps readable shadow separation while the vignette
    // and ACES shoulder still hold the frame together.
    const float contrastPivot = 0.18;
    color = max((color - contrastPivot) * uContrast + contrastPivot, vec3(0.0));

    vec2 vignetteUv = centered * vec2(1.0, 0.86);
    float vignette = smoothstep(0.28, 0.72, length(vignetteUv));
    color *= 1.0 - vignette * uVignetteStrength;
    float grain = Hash(gl_FragCoord.xy + vec2(uTime * 41.7, uTime * 17.3)) - 0.5;
    color += grain * uGrainStrength * (0.35 + 0.65 * (1.0 - clamp(luma, 0.0, 1.0)));
    gl_FragColor = vec4(LinearToSrgb(clamp(color, 0.0, 1.0)), 1.0);
  }
`;

export function CreateCinematicPostFX3D(renderer, camera, renderProfile) {
  const quality = renderProfile.id === "desktop" ? 1 : renderProfile.id === "balanced" ? 0.72 : 0.34;
  const renderScale = renderProfile.id === "mobile" ? 0.78 : 1;
  const supportsDepthTexture = renderer.capabilities.isWebGL2 || renderer.extensions.has("WEBGL_depth_texture");
  const supportsHighp = renderer.capabilities.precision === "highp";
  const usePostFx = supportsDepthTexture && supportsHighp;
  const target = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: true,
    stencilBuffer: false,
  });
  target.texture.name = "ReedSignal_CinematicColor";
  // The fullscreen shader performs the only display transform, so the scene target must remain linear.
  target.texture.colorSpace = THREE.NoColorSpace;
  if (usePostFx) {
    target.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
    target.depthTexture.format = THREE.DepthFormat;
    target.depthTexture.name = "ReedSignal_CinematicDepth";
  }
  if (renderer.capabilities.isWebGL2 && usePostFx) target.samples = renderProfile.id === "desktop" ? 4 : renderProfile.id === "balanced" ? 2 : 0;

  const uniforms = {
    uScene: { value: target.texture },
    uDepth: { value: target.depthTexture || target.texture },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uNear: { value: camera.near },
    uFar: { value: camera.far },
    uFocusDistance: { value: 15 },
    uFocusRange: { value: 4.2 },
    uDofStrength: { value: 0.8 },
    uGrainStrength: { value: renderProfile.id === "mobile" ? 0.003 : 0.004 },
    uVignetteStrength: { value: 0.34 },
    uBloomStrength: { value: 0.34 },
    uQuality: { value: quality },
    uSaturation: { value: 0.72 },
    uContrast: { value: 1.05 },
    uGain: { value: 1.18 },
    uLift: { value: 0.01 },
    uShadowTint: { value: new THREE.Color(0x90aaa4) },
    uHighlightTint: { value: new THREE.Color(0xffd9a2) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VertexShader,
    fragmentShader: FragmentShader,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
  const geometry = new THREE.PlaneGeometry(2, 2);
  const quad = new THREE.Mesh(geometry, material);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  scene.add(quad);
  let width = 1;
  let height = 1;
  let disposed = false;

  function SetChapter(chapterId) {
    const grade = GradeProfiles[chapterId] || GradeProfiles.school;
    uniforms.uFocusRange.value = grade.focusRange;
    uniforms.uDofStrength.value = grade.dof;
    uniforms.uVignetteStrength.value = grade.vignette;
    uniforms.uBloomStrength.value = grade.bloom;
    uniforms.uSaturation.value = grade.saturation;
    uniforms.uContrast.value = grade.contrast;
    uniforms.uGain.value = grade.gain;
    uniforms.uLift.value = grade.lift;
    uniforms.uShadowTint.value.setHex(grade.shadow);
    uniforms.uHighlightTint.value.setHex(grade.highlight);
  }

  function Resize(cssWidth, cssHeight, pixelRatio) {
    width = Math.max(1, Math.round(cssWidth * pixelRatio * renderScale));
    height = Math.max(1, Math.round(cssHeight * pixelRatio * renderScale));
    if (usePostFx) target.setSize(width, height);
    uniforms.uResolution.value.set(width, height);
  }

  function Render(sourceScene, time, focusDistance, suspicion = 0) {
    if (disposed) return;
    if (!usePostFx) {
      renderer.setRenderTarget(null);
      renderer.clear();
      renderer.render(sourceScene, camera);
      return;
    }
    uniforms.uTime.value = time;
    uniforms.uFocusDistance.value = focusDistance;
    const baseVignette = uniforms.uVignetteStrength.value;
    uniforms.uVignetteStrength.value = Math.min(0.58, baseVignette + suspicion * 0.06);
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(sourceScene, camera);
    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(scene, postCamera);
    uniforms.uVignetteStrength.value = baseVignette;
  }

  function Dispose() {
    if (disposed) return;
    disposed = true;
    target.dispose();
    geometry.dispose();
    material.dispose();
  }

  return Object.freeze({
    SetChapter,
    Resize,
    Render,
    Dispose,
    get enabled() { return usePostFx && !disposed; },
    get quality() { return usePostFx ? quality : 0; },
    get width() { return width; },
    get height() { return height; },
  });
}
