/**
 * Script_Art.mjs — 渲染栈：材质库 / 程序化贴图 / 光照 / 雾 / 天空 / 后处理 / 天气 / 特效
 * Owner: AgentArt
 *
 * ⚠ 本文件目前是 **AgentBoot 铺设的可运行灰盒实现**：公开 API 与 AGENTS.md 5.6 一致，
 *   AgentArt 接管后可整体重写内部，调用方无需改动。
 *
 * 依赖 DAG：three, Config, Math。禁止 import 任何玩法模块。
 * 零外部素材：所有贴图由 Canvas2D 程序化生成。
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Config, Palette } from './Script_Config.mjs';
import * as MathUtil from './Script_Math.mjs';

/* ================================================================== *
 * 一、程序化贴图（Canvas2D，零外部文件）
 * ================================================================== */

function MakeCanvas(size) {
  const canvas = (typeof document !== 'undefined' && document.createElement)
    ? document.createElement('canvas')
    : null;
  if (!canvas) return null;
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function FinishTexture(canvas, repeat) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat || 1, repeat || 1);
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** 通用噪点底子：fbm 灰度 + 可选条纹，用来把「纯色塑料感」打碎。 */
function DrawNoiseField(context, size, options) {
  const settings = options || {};
  const scale = settings.scale === undefined ? 0.05 : settings.scale;
  const contrast = settings.contrast === undefined ? 0.35 : settings.contrast;
  const base = settings.base === undefined ? 0.6 : settings.base;
  const grain = settings.grain === undefined ? 0.08 : settings.grain;
  const image = context.createImageData(size, size);
  const data = image.data;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const fbm = MathUtil.Fbm2(x * scale, y * scale, 4, 2.1, 0.52);
      const speck = MathUtil.Hash2(x * 7.13, y * 3.71) - 0.5;
      let value = base + fbm * contrast + speck * grain;
      if (settings.streak) {
        value += Math.sin(y * settings.streak + MathUtil.Noise2(x * 0.02, y * 0.02) * 3) * 0.05;
      }
      value = MathUtil.Clamp01(value);
      const index = (y * size + x) * 4;
      const level = Math.round(value * 255);
      data[index] = level;
      data[index + 1] = level;
      data[index + 2] = level;
      data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
}

function TextureNoise(size, options, repeat) {
  const canvas = MakeCanvas(size);
  if (!canvas) return null;
  const context = canvas.getContext('2d');
  DrawNoiseField(context, size, options);
  return FinishTexture(canvas, repeat);
}

/** 木纹：竖向条纹 + 结疤。 */
function TextureWoodGrain(size) {
  const canvas = MakeCanvas(size);
  if (!canvas) return null;
  const context = canvas.getContext('2d');
  DrawNoiseField(context, size, { scale: 0.02, contrast: 0.12, base: 0.88, grain: 0.04 });
  context.globalAlpha = 0.22;
  for (let i = 0; i < size; i += 2) {
    const offset = MathUtil.Noise2(i * 0.06, 0) * 6;
    const shade = 170 + Math.round(MathUtil.Hash1(i * 0.7) * 60);
    context.strokeStyle = 'rgb(' + shade + ',' + shade + ',' + shade + ')';
    context.beginPath();
    context.moveTo(i + offset, 0);
    context.lineTo(i - offset, size);
    context.stroke();
  }
  context.globalAlpha = 1;
  return FinishTexture(canvas, 1);
}

/** 圆形柔边点精灵：雪花、火星、飞屑共用。 */
function TextureSoftDot(size) {
  const canvas = MakeCanvas(size);
  if (!canvas) return null;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/* ================================================================== *
 * 二、材质库
 * ================================================================== */

/** MaterialKey → 物理外观。颜色一律取自 Config.Palette（冬日冷灰 + 唯一暖橙）。 */
const MaterialSpecs = {
  SnowGround: { color: Palette.SnowMid, roughness: 0.94, texture: 'Texture_SnowNoise', repeat: 26 },
  SnowPacked: { color: Palette.SnowTrampled, roughness: 0.86, texture: 'Texture_SnowNoise', repeat: 12 },
  Ice: { color: Palette.Ice, roughness: 0.28, metalness: 0.05 },
  Dirt: { color: Palette.Dirt, roughness: 0.98, texture: 'Texture_DirtGrain', repeat: 8 },
  Mud: { color: Palette.Mud, roughness: 1.0, texture: 'Texture_DirtGrain', repeat: 6 },
  Gravel: { color: Palette.Gravel, roughness: 0.95, texture: 'Texture_DirtGrain', repeat: 10 },
  Rock: { color: Palette.Rock, roughness: 0.9, texture: 'Texture_RockGrain', repeat: 3 },
  RockDark: { color: Palette.RockDark, roughness: 0.92, texture: 'Texture_RockGrain', repeat: 3 },
  StoneWall: { color: Palette.StoneWall, roughness: 0.88, texture: 'Texture_RockGrain', repeat: 2 },
  MudWall: { color: Palette.MudWall, roughness: 0.96, texture: 'Texture_MudWall', repeat: 2 },
  BrickBurnt: { color: Palette.BrickBurnt, roughness: 0.94, texture: 'Texture_MudWall', repeat: 2 },
  Wood: { color: Palette.Wood, roughness: 0.82, texture: 'Texture_WoodGrain', repeat: 2 },
  WoodOld: { color: Palette.WoodOld, roughness: 0.9, texture: 'Texture_WoodGrain', repeat: 2 },
  CharredWood: { color: Palette.CharredWood, roughness: 0.98, texture: 'Texture_CharredPlank', repeat: 2 },
  Thatch: { color: Palette.Thatch, roughness: 0.98, texture: 'Texture_StrawWeave', repeat: 4 },
  Straw: { color: Palette.Straw, roughness: 0.98, texture: 'Texture_StrawWeave', repeat: 3 },
  Paper: { color: Palette.Paper, roughness: 0.9, texture: 'Texture_PaperGrain', repeat: 1 },
  PaperWindow: { color: Palette.PaperWindow, roughness: 0.86, texture: 'Texture_PaperGrain', repeat: 1, transparent: true, opacity: 0.86 },
  ClothCoarse: { color: Palette.ClothCoarse, roughness: 0.96, texture: 'Texture_ClothWeave', repeat: 3 },
  ClothPadded: { color: Palette.ClothPadded, roughness: 0.98, texture: 'Texture_ClothWeave', repeat: 2 },
  FabricGray: { color: Palette.FabricGray, roughness: 0.95, texture: 'Texture_ClothWeave', repeat: 2 },
  FabricKhaki: { color: Palette.FabricKhaki, roughness: 0.95, texture: 'Texture_ClothWeave', repeat: 2 },
  FabricBlue: { color: Palette.FabricBlue, roughness: 0.95, texture: 'Texture_ClothWeave', repeat: 2 },
  FabricRed: { color: Palette.FabricRed, roughness: 0.9 },
  Fur: { color: Palette.Fur, roughness: 1.0, texture: 'Texture_ClothWeave', repeat: 4 },
  SkinPale: { color: Palette.SkinPale, roughness: 0.72 },
  SkinWeathered: { color: Palette.SkinWeathered, roughness: 0.78 },
  MetalDull: { color: Palette.MetalDull, roughness: 0.55, metalness: 0.6 },
  MetalRust: { color: Palette.MetalRust, roughness: 0.88, metalness: 0.25, texture: 'Texture_DirtGrain', repeat: 4 },
  Gunmetal: { color: Palette.Gunmetal, roughness: 0.42, metalness: 0.75 },
  Glass: { color: 0x9fb2bd, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.35 },
  Water: { color: 0x33414c, roughness: 0.16, metalness: 0.2, transparent: true, opacity: 0.82 },
  Sandbag: { color: 0x7a7159, roughness: 0.98, texture: 'Texture_ClothWeave', repeat: 2 },
  BarbedWire: { color: Palette.BarbedWire, roughness: 0.6, metalness: 0.5 },
  CanvasTent: { color: 0x6f6a58, roughness: 0.96, texture: 'Texture_ClothWeave', repeat: 3 },
  Foliage: { color: Palette.Foliage, roughness: 0.94, side: 'double' },
  FoliageDead: { color: Palette.FoliageDead, roughness: 0.96, side: 'double' },
};

/* 贴图是「细节」不是「压暗器」：底色已经由 Palette 决定，
   所以 base 一律接近 1，只用对比度打碎塑料感。base 压到 0.6 会让整个村子黑成剪影。 */
const TextureRecipes = {
  Texture_SnowNoise: { size: 256, options: { scale: 0.045, contrast: 0.13, base: 0.93, grain: 0.04 } },
  Texture_DirtGrain: { size: 256, options: { scale: 0.09, contrast: 0.22, base: 0.86, grain: 0.09 } },
  Texture_RockGrain: { size: 256, options: { scale: 0.06, contrast: 0.26, base: 0.85, grain: 0.08 } },
  Texture_MudWall: { size: 256, options: { scale: 0.035, contrast: 0.18, base: 0.89, grain: 0.07, streak: 0.11 } },
  Texture_CharredPlank: { size: 256, options: { scale: 0.07, contrast: 0.30, base: 0.74, grain: 0.11, streak: 0.30 } },
  Texture_StrawWeave: { size: 256, options: { scale: 0.02, contrast: 0.16, base: 0.88, grain: 0.12, streak: 0.55 } },
  Texture_ClothWeave: { size: 128, options: { scale: 0.5, contrast: 0.10, base: 0.91, grain: 0.08, streak: 1.6 } },
  Texture_PaperGrain: { size: 128, options: { scale: 0.11, contrast: 0.08, base: 0.95, grain: 0.04 } },
};

/**
 * 共享材质库。World / Character 必须从这里取材质，保证 draw call 受控。
 * 独立导出，方便未来 AgentArt 单测。
 */
export function CreateMaterialLibrary(three) {
  const Three = three || THREE;
  const materials = new Map();
  const variants = new Map();
  const textures = new Map();

  function GetTexture(key) {
    if (textures.has(key)) return textures.get(key);
    let texture = null;
    if (key === 'Texture_SoftDot') texture = TextureSoftDot(64);
    else if (key === 'Texture_WoodGrain') texture = TextureWoodGrain(256);
    else {
      const recipe = TextureRecipes[key];
      if (recipe) texture = TextureNoise(recipe.size, recipe.options, 1);
    }
    textures.set(key, texture);
    return texture;
  }

  function Build(key, overrides) {
    const spec = MaterialSpecs[key] || MaterialSpecs.MudWall;
    const params = {
      color: new Three.Color(spec.color),
      roughness: spec.roughness === undefined ? 0.9 : spec.roughness,
      metalness: spec.metalness === undefined ? 0.02 : spec.metalness,
    };
    if (spec.transparent) { params.transparent = true; params.opacity = spec.opacity === undefined ? 1 : spec.opacity; }
    if (spec.side === 'double') params.side = Three.DoubleSide;
    const material = new Three.MeshStandardMaterial(params);
    material.name = 'Material_' + key;
    if (spec.texture) {
      const texture = GetTexture(spec.texture);
      if (texture) {
        const cloned = texture.clone();
        cloned.needsUpdate = true;
        cloned.wrapS = Three.RepeatWrapping;
        cloned.wrapT = Three.RepeatWrapping;
        cloned.repeat.set(spec.repeat || 1, spec.repeat || 1);
        material.map = cloned;
      }
    }
    if (overrides) {
      for (const name of Object.keys(overrides)) {
        if (name === 'color') material.color.set(overrides.color);
        else material[name] = overrides[name];
      }
      material.needsUpdate = true;
    }
    return material;
  }

  return {
    keys: Object.keys(MaterialSpecs),
    GetMaterial(key, overrides) {
      if (overrides) return Build(key, overrides);
      if (!materials.has(key)) materials.set(key, Build(key, null));
      return materials.get(key);
    },
    MakeVariant(key, variantId, overrides) {
      const cacheKey = key + '#' + variantId;
      if (!variants.has(cacheKey)) variants.set(cacheKey, Build(key, overrides));
      return variants.get(cacheKey);
    },
    RegisterMaterial(key, material) {
      materials.set(key, material);
      return material;
    },
    GetTexture: GetTexture,
    Dispose() {
      for (const material of materials.values()) { if (material.map) material.map.dispose(); material.dispose(); }
      for (const material of variants.values()) { if (material.map) material.map.dispose(); material.dispose(); }
      for (const texture of textures.values()) { if (texture) texture.dispose(); }
      materials.clear();
      variants.clear();
      textures.clear();
    },
  };
}

/* ================================================================== *
 * 三、天空 / 分级后处理 着色器
 * ================================================================== */

const SkyVertexShader = [
  'varying vec3 vWorldDirection;',
  'void main() {',
  '  vec4 worldPosition = modelMatrix * vec4(position, 1.0);',
  '  vWorldDirection = normalize(worldPosition.xyz - cameraPosition);',
  '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
  '  gl_Position.z = gl_Position.w;',
  '}',
].join('\n');

const SkyFragmentShader = [
  'uniform vec3 uZenith;',
  'uniform vec3 uHorizon;',
  'uniform vec3 uSunColor;',
  'uniform vec3 uSunDirection;',
  'uniform float uHaze;',
  'varying vec3 vWorldDirection;',
  'void main() {',
  '  vec3 dir = normalize(vWorldDirection);',
  '  float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);',
  '  float band = pow(clamp(1.0 - abs(dir.y), 0.0, 1.0), 2.2);',
  '  vec3 color = mix(uHorizon, uZenith, pow(h, 0.72));',
  '  float sun = pow(max(dot(dir, normalize(uSunDirection)), 0.0), 22.0);',
  '  color += uSunColor * sun * 0.35;',
  '  color = mix(color, uHorizon, band * uHaze);',
  '  gl_FragColor = vec4(color, 1.0);',
  '}',
].join('\n');

/** 最终分级：暗角 + 颗粒 + 去饱和 + 闪白 + 低温结霜。故意廉价，胜在统一。 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: Config.Render.vignette },
    uGrain: { value: Config.Render.filmGrain },
    uDesaturation: { value: Config.Render.desaturationBase },
    uFlashColor: { value: new THREE.Color(1, 1, 1) },
    uFlashStrength: { value: 0 },
    uDamage: { value: 0 },
    uTime: { value: 0 },
    uAspect: { value: 1.78 },
  },
  vertexShader: [
    'varying vec2 vUv;',
    'void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  ].join('\n'),
  fragmentShader: [
    'uniform sampler2D tDiffuse;',
    'uniform float uVignette;',
    'uniform float uGrain;',
    'uniform float uDesaturation;',
    'uniform vec3 uFlashColor;',
    'uniform float uFlashStrength;',
    'uniform float uDamage;',
    'uniform float uTime;',
    'uniform float uAspect;',
    'varying vec2 vUv;',
    'float Hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'void main() {',
    '  vec4 texel = texture2D(tDiffuse, vUv);',
    '  vec3 color = texel.rgb;',
    '  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));',
    '  color = mix(color, vec3(luma), uDesaturation);',
    '  vec2 centered = (vUv - 0.5) * vec2(uAspect, 1.0);',
    '  float radius = length(centered) / length(vec2(uAspect, 1.0) * 0.5);',
    '  color *= 1.0 - uVignette * pow(clamp(radius, 0.0, 1.0), 2.4);',
    '  float frost = smoothstep(0.42, 1.0, radius) * uDamage;',
    '  color = mix(color, vec3(0.72, 0.79, 0.86), frost * 0.55);',
    '  float grain = (Hash(vUv * 1024.0 + uTime) - 0.5) * uGrain;',
    '  color += grain;',
    '  color = mix(color, uFlashColor, clamp(uFlashStrength, 0.0, 1.0));',
    '  gl_FragColor = vec4(color, texel.a);',
    '}',
  ].join('\n'),
};

/* ================================================================== *
 * 四、粒子池（雪 + 一次性特效）
 * ================================================================== */

const TransientVertexShader = [
  'attribute float aSize;',
  'attribute float aAlpha;',
  'attribute vec3 aColor;',
  'varying float vAlpha;',
  'varying vec3 vColor;',
  'void main() {',
  '  vAlpha = aAlpha;',
  '  vColor = aColor;',
  '  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);',
  '  gl_PointSize = aSize * (260.0 / max(-viewPosition.z, 0.4));',
  '  gl_Position = projectionMatrix * viewPosition;',
  '}',
].join('\n');

const TransientFragmentShader = [
  'uniform sampler2D uSprite;',
  'varying float vAlpha;',
  'varying vec3 vColor;',
  'void main() {',
  '  vec4 sprite = texture2D(uSprite, gl_PointCoord);',
  '  float alpha = sprite.a * vAlpha;',
  '  if (alpha < 0.02) discard;',
  '  gl_FragColor = vec4(vColor, alpha);',
  '}',
].join('\n');

function CreateParticlePool(capacity, sprite) {
  const positions = new Float32Array(capacity * 3);
  const velocities = new Float32Array(capacity * 3);
  const colors = new Float32Array(capacity * 3);
  const sizes = new Float32Array(capacity);
  const alphas = new Float32Array(capacity);
  const life = new Float32Array(capacity);
  const maxLife = new Float32Array(capacity);
  const drag = new Float32Array(capacity);
  const gravity = new Float32Array(capacity);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
  geometry.setDrawRange(0, capacity);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 500);

  const material = new THREE.ShaderMaterial({
    uniforms: { uSprite: { value: sprite } },
    vertexShader: TransientVertexShader,
    fragmentShader: TransientFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 6;
  let cursor = 0;

  return {
    object: points,
    Emit(x, y, z, vx, vy, vz, size, color, seconds, gravityValue, dragValue) {
      const index = cursor;
      cursor = (cursor + 1) % capacity;
      positions[index * 3] = x; positions[index * 3 + 1] = y; positions[index * 3 + 2] = z;
      velocities[index * 3] = vx; velocities[index * 3 + 1] = vy; velocities[index * 3 + 2] = vz;
      colors[index * 3] = color.r; colors[index * 3 + 1] = color.g; colors[index * 3 + 2] = color.b;
      sizes[index] = size;
      alphas[index] = 1;
      life[index] = seconds;
      maxLife[index] = seconds;
      gravity[index] = gravityValue;
      drag[index] = dragValue;
    },
    Update(dt) {
      let active = 0;
      for (let i = 0; i < capacity; i += 1) {
        if (life[i] <= 0) { alphas[i] = 0; continue; }
        life[i] -= dt;
        if (life[i] <= 0) { alphas[i] = 0; continue; }
        active += 1;
        const damping = Math.max(0, 1 - drag[i] * dt);
        velocities[i * 3] *= damping;
        velocities[i * 3 + 1] = velocities[i * 3 + 1] * damping + gravity[i] * dt;
        velocities[i * 3 + 2] *= damping;
        positions[i * 3] += velocities[i * 3] * dt;
        positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
        positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;
        alphas[i] = MathUtil.Clamp01(life[i] / Math.max(0.001, maxLife[i]));
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.aAlpha.needsUpdate = true;
      geometry.attributes.aColor.needsUpdate = true;
      geometry.attributes.aSize.needsUpdate = true;
      return active;
    },
    Clear() {
      for (let i = 0; i < capacity; i += 1) { life[i] = 0; alphas[i] = 0; }
      geometry.attributes.aAlpha.needsUpdate = true;
    },
    Dispose() { geometry.dispose(); material.dispose(); },
  };
}

/* ================================================================== *
 * 五、Art 本体
 * ================================================================== */

export function CreateArt(ctx, options) {
  const settings = options || {};
  const quality = settings.quality || (ctx && ctx.quality) || 'high';
  const renderConfig = Config.Render;

  /* —— renderer —— */
  const renderer = new THREE.WebGLRenderer({
    canvas: settings.canvas || (ctx && ctx.canvas) || undefined,
    antialias: quality !== 'low',
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.setPixelRatio(Math.min(renderConfig.pixelRatioCap, (typeof window !== 'undefined' && window.devicePixelRatio) || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = renderConfig.toneMappingExposure;
  renderer.shadowMap.enabled = quality !== 'low';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(new THREE.Color(Palette.FogWinter), 1);

  /* —— scene / camera —— */
  const scene = new THREE.Scene();
  scene.name = 'SceneBlackstone';
  const fog = new THREE.Fog(new THREE.Color(Palette.FogWinter), renderConfig.fogNear, renderConfig.fogFar);
  scene.fog = fog;

  const camera = new THREE.PerspectiveCamera(
    Config.Camera.fov, 16 / 9, Config.Camera.near, Config.Camera.far,
  );
  camera.position.set(0, 2.2, 6);
  camera.name = 'CameraMain';

  const effectsGroup = new THREE.Group();
  effectsGroup.name = 'GroupEffects';
  scene.add(effectsGroup);

  const library = CreateMaterialLibrary(THREE);

  /* —— 天空穹顶 —— */
  const skyUniforms = {
    uZenith: { value: new THREE.Color(Palette.SkyZenith) },
    uHorizon: { value: new THREE.Color(Palette.SkyHorizon) },
    uSunColor: { value: new THREE.Color(Config.TimeOfDay.Dawn.key) },
    uSunDirection: { value: new THREE.Vector3(0.3, 0.4, -0.9) },
    uHaze: { value: 0.45 },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 20),
    new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      vertexShader: SkyVertexShader,
      fragmentShader: SkyFragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    }),
  );
  sky.name = 'MeshSkyDome';
  sky.scale.setScalar(Config.Camera.far * 0.5);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);

  /* —— 光照：冬日冷灰。方向光当日光，半球光当雪地反射 —— */
  const sun = new THREE.DirectionalLight(new THREE.Color(Config.TimeOfDay.Dawn.key), 2.1);
  sun.name = 'LightSun';
  sun.castShadow = quality !== 'low';
  sun.shadow.mapSize.set(renderConfig.shadowMapSize, renderConfig.shadowMapSize);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = renderConfig.shadowDistance * 2.4;
  sun.shadow.camera.left = -renderConfig.shadowDistance * 0.6;
  sun.shadow.camera.right = renderConfig.shadowDistance * 0.6;
  sun.shadow.camera.top = renderConfig.shadowDistance * 0.6;
  sun.shadow.camera.bottom = -renderConfig.shadowDistance * 0.6;
  sun.shadow.bias = -0.0012;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  scene.add(sun.target);

  const hemisphere = new THREE.HemisphereLight(
    new THREE.Color(Palette.SkyHorizon), new THREE.Color(Palette.SnowShadow), 1.05,
  );
  hemisphere.name = 'LightHemisphere';
  scene.add(hemisphere);

  const ambient = new THREE.AmbientLight(new THREE.Color(Palette.FogWinter), 0.28);
  scene.add(ambient);

  /** 关键光方向（抬高后的那条，供阴影与相机跟随复用） */
  const sunDirection = new THREE.Vector3(0.3, 0.6, -0.7).normalize();

  /* —— 天气 —— */
  const weather = {
    preset: 'LightSnow',
    snowRate: Config.Weather.LightSnow.snowRate,
    windDirection: new THREE.Vector2(-0.6, -0.8),
    windSpeed: Config.Weather.LightSnow.windSpeed,
    fogDensity: Config.Weather.LightSnow.fogDensity,
    visibility: Config.Weather.LightSnow.visibility,
    ambientLight: Config.Weather.LightSnow.ambientLight,
  };
  let timeOfDay = 'Dawn';
  let gustStrength = 0;
  let gustSeconds = 0;

  /* —— 飘雪 —— */
  const sprite = library.GetTexture('Texture_SoftDot');
  const snowCount = quality === 'low' ? 700 : (quality === 'medium' ? 1400 : renderConfig.snowParticleCount);
  const snowSpan = 46;
  const snowPositions = new Float32Array(snowCount * 3);
  const snowSizes = new Float32Array(snowCount);
  const snowAlphas = new Float32Array(snowCount);
  const snowColors = new Float32Array(snowCount * 3);
  const snowSeed = new Float32Array(snowCount);
  for (let i = 0; i < snowCount; i += 1) {
    snowPositions[i * 3] = (MathUtil.Hash1(i * 1.7) - 0.5) * snowSpan;
    snowPositions[i * 3 + 1] = MathUtil.Hash1(i * 3.1) * 26;
    snowPositions[i * 3 + 2] = (MathUtil.Hash1(i * 5.3) - 0.5) * snowSpan;
    snowSizes[i] = 0.035 + MathUtil.Hash1(i * 7.7) * 0.075;
    snowAlphas[i] = 0.35 + MathUtil.Hash1(i * 11.3) * 0.5;
    snowColors[i * 3] = 0.92; snowColors[i * 3 + 1] = 0.95; snowColors[i * 3 + 2] = 1.0;
    snowSeed[i] = MathUtil.Hash1(i * 13.9) * 6.28;
  }
  const snowGeometry = new THREE.BufferGeometry();
  snowGeometry.setAttribute('position', new THREE.BufferAttribute(snowPositions, 3));
  snowGeometry.setAttribute('aSize', new THREE.BufferAttribute(snowSizes, 1));
  snowGeometry.setAttribute('aAlpha', new THREE.BufferAttribute(snowAlphas, 1));
  snowGeometry.setAttribute('aColor', new THREE.BufferAttribute(snowColors, 3));
  snowGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), snowSpan);
  const snowMaterial = new THREE.ShaderMaterial({
    uniforms: { uSprite: { value: sprite } },
    vertexShader: TransientVertexShader,
    fragmentShader: TransientFragmentShader,
    transparent: true,
    depthWrite: false,
  });
  const snow = new THREE.Points(snowGeometry, snowMaterial);
  snow.name = 'PointsSnow';
  snow.frustumCulled = false;
  snow.renderOrder = 5;
  effectsGroup.add(snow);

  /* —— 一次性粒子池 —— */
  const transient = CreateParticlePool(quality === 'low' ? 240 : 640, sprite);
  transient.object.name = 'PointsTransient';
  effectsGroup.add(transient.object);

  /* —— 脚印（扁平实例化四边形） —— */
  const footprintCapacity = 220;
  const footprintGeometry = new THREE.PlaneGeometry(0.19, 0.34);
  footprintGeometry.rotateX(-Math.PI / 2);
  /* 雪地脚印是一个「凹下去的暗斑」，不是白贴纸：压暗 + 半透 + polygonOffset 防止与地面打架 */
  const footprintMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0x4a5460),
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const footprints = new THREE.InstancedMesh(footprintGeometry, footprintMaterial, footprintCapacity);
  footprints.name = 'InstancedFootprints';
  footprints.frustumCulled = false;
  footprints.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  footprints.count = 0;
  footprints.renderOrder = 2;
  effectsGroup.add(footprints);
  let footprintCursor = 0;
  const scratchMatrix = new THREE.Matrix4();
  const scratchQuaternion = new THREE.Quaternion();
  const scratchVectorA = new THREE.Vector3();
  const scratchVectorB = new THREE.Vector3();
  const scratchColor = new THREE.Color();

  /* —— 后处理 —— */
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(1280, 720), renderConfig.bloomStrength, 0.85, 0.72,
  );
  if (quality !== 'low') composer.addPass(bloom);
  const gradePass = new ShaderPass(GradeShader);
  composer.addPass(gradePass);
  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  /* —— 屏幕状态 —— */
  const screen = {
    vignette: renderConfig.vignette,
    vignetteTarget: renderConfig.vignette,
    desaturation: renderConfig.desaturationBase,
    desaturationTarget: renderConfig.desaturationBase,
    damage: 0,
    flashStrength: 0,
    flashDecay: 1,
    letterbox: false,
    aimMode: false,
  };
  const shake = { strength: 0, seconds: 0, frequency: 22, offset: new THREE.Vector3() };

  const lights = [];
  const stats = { drawCalls: 0, triangles: 0, programs: 0, fps: 0, frameMs: 0 };
  let elapsed = 0;
  let currentQuality = quality;

  function ApplyTimeOfDay(preset) {
    const tod = Config.TimeOfDay[preset] || Config.TimeOfDay.Dawn;
    timeOfDay = preset;
    const azimuth = tod.sunAzimuthDeg * MathUtil.DegToRad;
    /* 天上的日盘按美术给的低角度画，但**投影用的关键光必须抬高**：
       8° 的太阳会被四周山脊整片挡住，村子会黑成剪影——那不是氛围，那是 bug。 */
    const skyElevation = tod.sunElevationDeg * MathUtil.DegToRad;
    const lightElevation = Math.max(tod.sunElevationDeg, 30) * MathUtil.DegToRad;
    const skyDirection = new THREE.Vector3(
      Math.cos(skyElevation) * Math.sin(azimuth),
      Math.max(0.04, Math.sin(skyElevation)),
      Math.cos(skyElevation) * Math.cos(azimuth),
    ).normalize();
    const direction = new THREE.Vector3(
      Math.cos(lightElevation) * Math.sin(azimuth),
      Math.sin(lightElevation),
      Math.cos(lightElevation) * Math.cos(azimuth),
    ).normalize();
    sunDirection.copy(direction);
    sun.position.copy(direction).multiplyScalar(60);
    sun.color.set(tod.key);
    sun.intensity = MathUtil.Lerp(1.1, 3.1, MathUtil.Clamp01(tod.ambientLight)) * weather.ambientLight;
    hemisphere.color.set(preset === 'Night' ? Palette.SkyNight : Palette.SkyHorizon);
    hemisphere.groundColor.set(Palette.SnowMid);
    hemisphere.intensity = MathUtil.Lerp(1.10, 2.40, tod.ambientLight) * weather.ambientLight;
    ambient.intensity = MathUtil.Lerp(0.34, 0.72, tod.ambientLight);
    skyUniforms.uSunDirection.value.copy(skyDirection);
    skyUniforms.uSunColor.value.set(tod.key);
    skyUniforms.uZenith.value.set(preset === 'Night' ? Palette.SkyNight : Palette.SkyZenith);
    skyUniforms.uHorizon.value.set(preset === 'Dusk' ? Palette.SkyDusk : Palette.SkyHorizon);
    const fogColor = preset === 'Night' ? Palette.FogNight : Palette.FogWinter;
    fog.color.set(fogColor);
    renderer.setClearColor(fog.color, 1);
  }

  function ApplyWeather(preset) {
    const data = Config.Weather[preset] || Config.Weather.LightSnow;
    weather.preset = preset;
    weather.snowRate = data.snowRate;
    weather.windSpeed = data.windSpeed;
    weather.fogDensity = data.fogDensity;
    weather.visibility = data.visibility;
    weather.ambientLight = data.ambientLight;
    const windRadians = data.windDirectionDeg * MathUtil.DegToRad;
    weather.windDirection.set(Math.sin(windRadians), Math.cos(windRadians));
    fog.near = renderConfig.fogNear * MathUtil.Lerp(0.35, 1.15, data.visibility);
    fog.far = renderConfig.fogFar * MathUtil.Lerp(0.30, 1.10, data.visibility);
    skyUniforms.uHaze.value = MathUtil.Clamp01(1.15 - data.visibility);
    snowMaterial.uniforms.uSprite.value = sprite;
    ApplyTimeOfDay(timeOfDay);
    /* 契约第六节：WeatherChanged 的发布者是 Art。Hud 靠它出"起风了"的提示，
       EnemyAi 靠它缩视距。构造期 ctx.bus 已存在（P0 阶段就挂好了）。 */
    if (ctx && ctx.bus && typeof ctx.bus.Emit === 'function') {
      ctx.bus.Emit('WeatherChanged', {
        preset: weather.preset, snowRate: weather.snowRate,
        windSpeed: weather.windSpeed, visibility: weather.visibility,
      });
    }
  }

  ApplyWeather('LightSnow');
  ApplyTimeOfDay('Dawn');

  function MakeLightHandle(object, disposer) {
    const handle = {
      object: object,
      SetPosition(vector) { object.position.copy(vector); },
      SetDirection(vector) {
        if (object.target) {
          object.target.position.copy(object.position).add(vector);
          object.target.updateMatrixWorld();
        }
      },
      SetIntensity(value) { object.intensity = value; },
      SetEnabled(value) { object.visible = !!value; },
      Dispose() {
        const index = lights.indexOf(handle);
        if (index >= 0) lights.splice(index, 1);
        if (object.parent) object.parent.remove(object);
        if (object.target && object.target.parent) object.target.parent.remove(object.target);
        if (disposer) disposer();
      },
    };
    lights.push(handle);
    return handle;
  }

  const art = {
    renderer: renderer,
    scene: scene,
    camera: camera,
    effectsGroup: effectsGroup,
    stats: stats,

    /* —— 材质与贴图 —— */
    GetMaterial(key, overrides) { return library.GetMaterial(key, overrides); },
    GetTexture(key) { return library.GetTexture(key); },
    MakeVariant(key, variantId, overrides) { return library.MakeVariant(key, variantId, overrides); },
    RegisterMaterial(key, material) { return library.RegisterMaterial(key, material); },

    /* —— 环境 —— */
    SetTimeOfDay(preset) { ApplyTimeOfDay(preset); },
    SetWeather(preset) { ApplyWeather(preset); },
    GetWeather() {
      return {
        preset: weather.preset, snowRate: weather.snowRate,
        windDirection: weather.windDirection, windSpeed: weather.windSpeed + gustStrength,
        fogDensity: weather.fogDensity, visibility: weather.visibility, ambientLight: weather.ambientLight,
      };
    },
    SetWindGust(strength, seconds) { gustStrength = strength; gustSeconds = seconds; },
    GetAmbientLightLevel(position) {
      let level = MathUtil.Clamp01(weather.ambientLight * (Config.TimeOfDay[timeOfDay] || Config.TimeOfDay.Dawn).ambientLight + 0.08);
      if (position) {
        for (let i = 0; i < lights.length; i += 1) {
          const object = lights[i].object;
          if (!object.visible || !object.isLight) continue;
          const distance = object.position.distanceTo(position);
          const radius = object.distance || 12;
          if (distance < radius) level += (1 - distance / radius) * MathUtil.Clamp01(object.intensity / 3);
        }
      }
      return MathUtil.Clamp01(level);
    },

    /* —— 动态光 —— */
    CreateFireLight(position, lightOptions) {
      const settingsLight = lightOptions || {};
      const light = new THREE.PointLight(
        new THREE.Color(Palette.FireMid),
        settingsLight.intensity === undefined ? 6 : settingsLight.intensity,
        settingsLight.radius === undefined ? 11 : settingsLight.radius,
        1.9,
      );
      light.position.copy(position);
      light.castShadow = false;
      light.userData.flicker = settingsLight.flicker === undefined ? 0.28 : settingsLight.flicker;
      light.userData.baseIntensity = light.intensity;
      light.userData.kind = 'Fire';
      effectsGroup.add(light);
      return MakeLightHandle(light, null);
    },
    CreateSpotLight(spotOptions) {
      const settingsLight = spotOptions || {};
      const light = new THREE.SpotLight(
        new THREE.Color(settingsLight.kind === 'Searchlight' ? Palette.SearchlightBeam : Palette.LanternGlow),
        settingsLight.intensity === undefined ? 8 : settingsLight.intensity,
        settingsLight.range || 24,
        (settingsLight.halfAngleDeg || 18) * MathUtil.DegToRad,
        0.45,
        1.4,
      );
      if (settingsLight.position) light.position.copy(settingsLight.position);
      light.userData.kind = settingsLight.kind || 'Flashlight';
      effectsGroup.add(light);
      effectsGroup.add(light.target);
      if (settingsLight.direction) {
        light.target.position.copy(light.position).add(settingsLight.direction);
        light.target.updateMatrixWorld();
      }
      return MakeLightHandle(light, null);
    },
    CreateFlare(position, flareOptions) {
      const settingsLight = flareOptions || {};
      const light = new THREE.PointLight(new THREE.Color(Palette.FlareLight), 14, Config.Enemy.flareLightRadius, 1.6);
      light.position.copy(position);
      light.userData.kind = 'Flare';
      light.userData.seconds = settingsLight.seconds === undefined ? Config.Enemy.flareBurnSeconds : settingsLight.seconds;
      light.userData.velocity = settingsLight.driftVelocity ? settingsLight.driftVelocity.clone() : new THREE.Vector3(0, 0.4, 0);
      light.userData.baseIntensity = 14;
      light.userData.flicker = 0.15;
      effectsGroup.add(light);
      return MakeLightHandle(light, null);
    },

    /* —— 一次性特效 —— */
    SpawnImpact(position, normal, surface) {
      const color = scratchColor.set(surface === 'Snow' ? Palette.SnowLit : Palette.AshGray);
      for (let i = 0; i < 8; i += 1) {
        const spread = 2.4;
        transient.Emit(
          position.x, position.y, position.z,
          (normal ? normal.x : 0) * 1.5 + (MathUtil.Hash1(elapsed * 91 + i) - 0.5) * spread,
          (normal ? normal.y : 1) * 1.5 + MathUtil.Hash1(elapsed * 37 + i) * spread,
          (normal ? normal.z : 0) * 1.5 + (MathUtil.Hash1(elapsed * 53 + i) - 0.5) * spread,
          0.05 + MathUtil.Hash1(i * 3.3) * 0.06, color, 0.5, -6, 2.2,
        );
      }
    },
    SpawnMuzzleFlash(position, direction, scale) {
      const color = scratchColor.set(Palette.MuzzleFlash);
      const size = scale || 1;
      for (let i = 0; i < 6; i += 1) {
        transient.Emit(
          position.x, position.y, position.z,
          direction.x * 6 + (MathUtil.Hash1(i * 7.1) - 0.5), direction.y * 6 + (MathUtil.Hash1(i * 11.7) - 0.5),
          direction.z * 6 + (MathUtil.Hash1(i * 5.9) - 0.5),
          0.18 * size, color, 0.09, 0, 9,
        );
      }
    },
    SpawnSnowBurst(position, strength) {
      const color = scratchColor.set(Palette.SnowLit);
      const power = strength === undefined ? 1 : strength;
      const count = Math.round(10 * power);
      for (let i = 0; i < count; i += 1) {
        transient.Emit(
          position.x, position.y + 0.05, position.z,
          (MathUtil.Hash1(elapsed * 17 + i) - 0.5) * 2.2 * power,
          0.6 + MathUtil.Hash1(elapsed * 29 + i) * 1.8 * power,
          (MathUtil.Hash1(elapsed * 41 + i) - 0.5) * 2.2 * power,
          0.06 + MathUtil.Hash1(i * 2.7) * 0.08, color, 0.85, -2.4, 1.4,
        );
      }
    },
    SpawnBreathPuff(position, direction, strength) {
      const color = scratchColor.set(0xdde5ee);
      const power = strength === undefined ? 1 : strength;
      for (let i = 0; i < 4; i += 1) {
        transient.Emit(
          position.x, position.y, position.z,
          direction.x * 0.6 * power + (MathUtil.Hash1(i * 3.1) - 0.5) * 0.25,
          0.22 + MathUtil.Hash1(i * 4.9) * 0.2,
          direction.z * 0.6 * power + (MathUtil.Hash1(i * 6.3) - 0.5) * 0.25,
          0.10 + i * 0.03, color, 1.1 + power * 0.4, 0.15, 1.6,
        );
      }
    },
    SpawnFootprint(position, forward, surface, side) {
      if (footprints.count < footprintCapacity) footprints.count = Math.min(footprintCapacity, footprints.count + 1);
      const index = footprintCursor;
      footprintCursor = (footprintCursor + 1) % footprintCapacity;
      const yaw = forward ? Math.atan2(forward.x, forward.z) : 0;
      scratchQuaternion.setFromAxisAngle(scratchVectorB.set(0, 1, 0), yaw);
      const lateral = side === 'L' ? -0.12 : 0.12;
      scratchVectorA.set(
        position.x + Math.cos(yaw) * lateral,
        position.y + 0.015,
        position.z - Math.sin(yaw) * lateral,
      );
      scratchMatrix.compose(scratchVectorA, scratchQuaternion, scratchVectorB.set(1, 1, 1));
      footprints.setMatrixAt(index, scratchMatrix);
      footprints.instanceMatrix.needsUpdate = true;
    },
    SpawnSmoke(position, smokeOptions) {
      const settingsSmoke = smokeOptions || {};
      const color = scratchColor.set(Palette.AshGray);
      const seconds = settingsSmoke.seconds === undefined ? 2.2 : settingsSmoke.seconds;
      const scale = settingsSmoke.scale === undefined ? 1 : settingsSmoke.scale;
      for (let i = 0; i < 5; i += 1) {
        transient.Emit(
          position.x, position.y, position.z,
          (MathUtil.Hash1(elapsed * 23 + i) - 0.5) * 0.5, 0.5 + MathUtil.Hash1(i * 9.1) * 0.6,
          (MathUtil.Hash1(elapsed * 31 + i) - 0.5) * 0.5,
          0.25 * scale, color, seconds, 0.1, 0.8,
        );
      }
    },
    SpawnDebris(position, count, surface) {
      const color = scratchColor.set(surface === 'Wood' ? Palette.Wood : Palette.Gravel);
      const total = count || 6;
      for (let i = 0; i < total; i += 1) {
        transient.Emit(
          position.x, position.y + 0.1, position.z,
          (MathUtil.Hash1(elapsed * 13 + i) - 0.5) * 3, 1.2 + MathUtil.Hash1(i * 8.3) * 2,
          (MathUtil.Hash1(elapsed * 19 + i) - 0.5) * 3,
          0.04 + MathUtil.Hash1(i * 1.9) * 0.04, color, 1.1, -9, 0.6,
        );
      }
    },
    ClearTransient() {
      transient.Clear();
      footprints.count = 0;
      footprintCursor = 0;
    },

    /* —— 屏幕表现 —— */
    ShakeCamera(strength, seconds, frequency) {
      shake.strength = Math.max(shake.strength, strength);
      shake.seconds = Math.max(shake.seconds, seconds);
      shake.frequency = frequency || 22;
    },
    FlashScreen(color, strength, seconds) {
      gradePass.uniforms.uFlashColor.value.set(color);
      screen.flashStrength = MathUtil.Clamp01(strength);
      screen.flashDecay = 1 / Math.max(0.05, seconds || 0.2);
    },
    SetVignette(strength) { screen.vignetteTarget = strength; },
    SetDamageOverlay(intensity) { screen.damage = MathUtil.Clamp01(intensity); },
    SetAimMode(on) {
      screen.aimMode = !!on;
      screen.vignetteTarget = on ? renderConfig.vignette + 0.18 : renderConfig.vignette;
    },
    SetLetterbox(on) { screen.letterbox = !!on; },
    SetDesaturation(amount) { screen.desaturationTarget = MathUtil.Clamp01(amount); },
    SetTimeScaleVisual(scale) {
      screen.desaturationTarget = MathUtil.Clamp01(renderConfig.desaturationBase + (1 - MathUtil.Clamp01(scale)) * 0.35);
    },

    /* —— 生命周期 —— */
    Resize(width, height, pixelRatio) {
      const safeWidth = Math.max(1, Math.floor(width));
      const safeHeight = Math.max(1, Math.floor(height));
      const ratio = Math.min(renderConfig.pixelRatioCap, pixelRatio || 1);
      renderer.setPixelRatio(ratio);
      renderer.setSize(safeWidth, safeHeight, false);
      composer.setPixelRatio(ratio);
      composer.setSize(safeWidth, safeHeight);
      camera.aspect = safeWidth / safeHeight;
      camera.updateProjectionMatrix();
      gradePass.uniforms.uAspect.value = camera.aspect;
      /* 辉光跑半分辨率：它本来就是低频的一层，全分辨率纯属浪费（移动端与软件渲染差别巨大） */
      bloom.setSize(Math.max(160, Math.floor(safeWidth * 0.5)), Math.max(90, Math.floor(safeHeight * 0.5)));
    },
    SetQuality(level) {
      currentQuality = level;
      renderer.shadowMap.enabled = level !== 'low';
      sun.castShadow = level !== 'low';
      snow.visible = level !== 'low' || weather.snowRate > 0.5;
    },
    GetQuality() { return currentQuality; },

    Update(dt, frameCtx) {
      elapsed += dt;
      const wind = weather.windDirection;
      const windSpeed = weather.windSpeed + gustStrength;

      if (gustSeconds > 0) {
        gustSeconds -= dt;
        if (gustSeconds <= 0) { gustSeconds = 0; gustStrength = 0; }
      }

      /* 天空与雪跟着相机走，永远不会「走出雪区」 */
      sky.position.copy(camera.position);
      snow.position.set(
        Math.round(camera.position.x / snowSpan) * snowSpan,
        0,
        Math.round(camera.position.z / snowSpan) * snowSpan,
      );

      /* 太阳始终罩住相机附近，保证阴影贴图密度 */
      sun.target.position.set(camera.position.x, 0, camera.position.z);
      sun.target.updateMatrixWorld();
      sun.position.set(
        camera.position.x + sunDirection.x * 55,
        camera.position.y + sunDirection.y * 55,
        camera.position.z + sunDirection.z * 55,
      );

      /* 飘雪：风吹 + 下落 + 循环 */
      const half = snowSpan * 0.5;
      const fall = MathUtil.Lerp(0.9, 3.4, weather.snowRate);
      for (let i = 0; i < snowCount; i += 1) {
        const base = i * 3;
        const sway = Math.sin(elapsed * 1.6 + snowSeed[i]) * 0.35;
        snowPositions[base] += (wind.x * windSpeed * 0.25 + sway) * dt;
        snowPositions[base + 1] -= fall * dt;
        snowPositions[base + 2] += (wind.y * windSpeed * 0.25 + sway * 0.6) * dt;
        if (snowPositions[base + 1] < -2) {
          snowPositions[base + 1] = 24;
          snowPositions[base] = (MathUtil.Hash1(elapsed * 7 + i) - 0.5) * snowSpan;
          snowPositions[base + 2] = (MathUtil.Hash1(elapsed * 11 + i) - 0.5) * snowSpan;
        }
        const localX = snowPositions[base] + snow.position.x - camera.position.x;
        const localZ = snowPositions[base + 2] + snow.position.z - camera.position.z;
        if (localX > half) snowPositions[base] -= snowSpan;
        else if (localX < -half) snowPositions[base] += snowSpan;
        if (localZ > half) snowPositions[base + 2] -= snowSpan;
        else if (localZ < -half) snowPositions[base + 2] += snowSpan;
        snowAlphas[i] = MathUtil.Clamp01((0.25 + weather.snowRate * 0.8) * (0.4 + MathUtil.Hash1(i * 11.3) * 0.6));
      }
      snowGeometry.attributes.position.needsUpdate = true;
      snowGeometry.attributes.aAlpha.needsUpdate = true;

      transient.Update(dt);

      /* 火光闪烁：全片唯一暖色 */
      for (let i = lights.length - 1; i >= 0; i -= 1) {
        const object = lights[i].object;
        const data = object.userData;
        if (data.flicker) {
          object.intensity = data.baseIntensity * (1 + MathUtil.Wobble(elapsed * 3.4 + i, i) * data.flicker);
        }
        if (data.kind === 'Flare') {
          data.seconds -= dt;
          object.position.addScaledVector(data.velocity, dt);
          data.velocity.multiplyScalar(0.985);
          if (data.seconds <= 0) lights[i].Dispose();
        }
      }

      /* 屏幕分级 */
      screen.vignette = MathUtil.Damp(screen.vignette, screen.vignetteTarget, 6, dt);
      screen.desaturation = MathUtil.Damp(screen.desaturation, screen.desaturationTarget, 4, dt);
      if (screen.flashStrength > 0) {
        screen.flashStrength = Math.max(0, screen.flashStrength - screen.flashDecay * dt);
      }
      gradePass.uniforms.uVignette.value = screen.vignette;
      gradePass.uniforms.uDesaturation.value = screen.desaturation;
      gradePass.uniforms.uDamage.value = screen.damage;
      gradePass.uniforms.uFlashStrength.value = screen.flashStrength;
      gradePass.uniforms.uTime.value = elapsed;

      /* 镜头抖动叠加在 Player 写好的相机变换之上 */
      if (shake.seconds > 0) {
        shake.seconds -= dt;
        const decay = MathUtil.Clamp01(shake.seconds * Config.Camera.shakeDecayLambda * 0.2);
        const amount = shake.strength * decay;
        shake.offset.set(
          Math.sin(elapsed * shake.frequency) * amount,
          Math.sin(elapsed * shake.frequency * 1.37 + 1.1) * amount,
          0,
        );
        camera.position.add(shake.offset.clone().applyQuaternion(camera.quaternion));
        if (shake.seconds <= 0) { shake.strength = 0; shake.offset.set(0, 0, 0); }
      }

      camera.updateMatrixWorld();
      if (frameCtx && frameCtx.debug && frameCtx.debug.gizmos) frameCtx.debug.gizmos.visible = !!frameCtx.debug.enabled;
    },

    Render() {
      /* autoReset 会在每个 pass 后清零，统计就只剩最后那个全屏四边形；手动管窗口才有意义 */
      renderer.info.autoReset = false;
      renderer.info.reset();
      composer.render();
      const info = renderer.info;
      stats.drawCalls = info.render.calls;
      stats.triangles = info.render.triangles;
      stats.programs = info.programs ? info.programs.length : 0;
    },

    Dispose() {
      for (let i = lights.length - 1; i >= 0; i -= 1) lights[i].Dispose();
      transient.Dispose();
      snowGeometry.dispose();
      snowMaterial.dispose();
      footprintGeometry.dispose();
      footprintMaterial.dispose();
      sky.geometry.dispose();
      sky.material.dispose();
      library.Dispose();
      composer.dispose();
      renderer.dispose();
    },
  };

  return art;
}

export default CreateArt;
