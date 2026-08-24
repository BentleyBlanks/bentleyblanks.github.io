// 《血战台儿庄》材质库：把 Script_TexBake 烘出的裸字节包成 three 纹理与
// MeshStandardMaterial，并把屏幕空间 AO 注入到**间接光**里。
//
// 两条铁律（错一条画面立刻塑料）：
//   1) albedo 必须标 SRGBColorSpace，normal / orm 必须是 NoColorSpace。
//      反了的话：颜色发灰、法线方向错、粗糙度整体偏亮。
//   2) SSAO 只乘 indirectDiffuse / indirectSpecular，**不许乘直接光**。
//      乘了直接光 = 太阳照到的墙角也发黑，那是脏，不是遮蔽。

import * as THREE from "three";
import { RECIPES } from "./Script_TexBake.mjs";
import { GI_SAMPLE_GLSL, BindGiUniforms } from "./Script_Gi.mjs";
import {
  BindDestructionUniforms, DestructionShaderGlsl,
} from "./Script_Destruction.mjs";

/** 把一张烘焙结果的某个通道包成 DataTexture。 */
function MakeTexture(bytes, size, { srgb = false, repeat = 1, anisotropy = 1 } = {}) {
  const texture = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  // 各向异性是"地面看起来是 3A 还是像糊了一层凡士林"的分水岭
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
  return texture;
}

/**
 * 给材质挂上「间接光的两件事」：屏幕空间 AO 与探针体 GI。
 *
 * 两件事必须**在同一个 onBeforeCompile 里**做完 —— three 一个材质只有一个钩子，
 * 分两次写的话后一次会把前一次整个覆盖掉（AO 会静默消失，且没有任何报错）。
 *
 * 分工：
 *   AO  —— 只压间接光，且只压「接触处」那种小尺度遮蔽（<aomap_fragment>）；
 *   GI  —— 直接**替换**天空 IBL 的漫反射项。探针体里已经含了天光，
 *          再加一份就是双份；而 iblIrradiance 本身没有位置概念，正是要被换掉的那个。
 *          镜面那一路（radiance）留给 IBL，但按 GI/天空的亮度比做一次遮蔽 ——
 *          否则屋里的金属件照样反着一片亮天。
 */
export function InjectIndirectLighting(material, { ssao = null, gi = null, destruction = null } = {}) {
  material.userData.ssaoUniforms = ssao;
  material.userData.giUniforms = gi;
  material.userData.destructionUniforms = destruction;
  material.onBeforeCompile = (shader) => {
    let vertex = shader.vertexShader;
    let fragment = shader.fragmentShader;

    if (ssao) {
      shader.uniforms.uSsaoMap = ssao.map;
      shader.uniforms.uSsaoResolution = ssao.resolution;
      shader.uniforms.uSsaoStrength = ssao.strength;
      fragment = fragment
        .replace("#include <common>", `#include <common>
        uniform sampler2D uSsaoMap;
        uniform vec2 uSsaoResolution;
        uniform float uSsaoStrength;`)
        .replace("#include <aomap_fragment>", `#include <aomap_fragment>
        {
          float ssao = texture2D(uSsaoMap, gl_FragCoord.xy / uSsaoResolution).r;
          ssao = mix(1.0, ssao, uSsaoStrength);
          reflectedLight.indirectDiffuse *= ssao;
          // 镜面遮蔽：粗糙面遮得多、光滑面遮得少（Lagarde 的近似）
          reflectedLight.indirectSpecular *= clamp(pow(ssao, 1.0 + material.roughness * 2.0), 0.0, 1.0);
        }`);
    }

    if (gi) {
      BindGiUniforms(shader.uniforms, gi);
      // 世界坐标要自己传：three 的 worldPosition 只在开了阴影/envMap 时才有，
      // 靠它等于把 GI 的生死系在别的开关上。实例化/骨骼的矩阵顺序照抄 <project_vertex>。
      vertex = vertex
        .replace("#include <common>", `#include <common>
        varying vec3 vGiWorldPos;`)
        .replace("#include <project_vertex>", `#include <project_vertex>
        {
          vec4 giWorld = vec4(transformed, 1.0);
          #ifdef USE_BATCHING
            giWorld = batchingMatrix * giWorld;
          #endif
          #ifdef USE_INSTANCING
            giWorld = instanceMatrix * giWorld;
          #endif
          vGiWorldPos = (modelMatrix * giWorld).xyz;
        }`);
      fragment = fragment
        .replace("#include <common>", `#include <common>
        varying vec3 vGiWorldPos;
        vec3 gGiDebugColor = vec3(0.0);
${GI_SAMPLE_GLSL}`)
        .replace("#include <lights_fragment_maps>", `#include <lights_fragment_maps>
        #if defined( RE_IndirectDiffuse )
        if (uGiEnabled > 0.001) {
          // geometryNormal 是**视空间**的，不转回世界空间就会得到一张跟着镜头转的假 GI
          vec3 giNormal = transformNormalByInverseViewMatrix(geometryNormal, viewMatrix);
          vec3 giView = normalize(cameraPosition - vGiWorldPos);
          float giConfidence;
          vec3 giIrradiance = GiSampleIrradiance(vGiWorldPos, giNormal, giView, giConfidence) * uGiIntensity;
          // uGiEnabled 是 0→1 的淡入量（图集收敛前是 0），不是开关
          giConfidence *= uGiEnabled;
          // ?giView= 假彩色取证：1 探针辐照度×0.05 / 2 被替换前的天空 IBL×0.05 /
          // 3 confidence / 4 gi 与 IBL 的亮度比×0.25（与曝光无关，1.0 的比值显示为 0.25 灰）。
          // 在 mix 之前抓，末端 <dithering_fragment> 处整帧覆盖输出。
          if (uGiDebugView > 0.5) {
            if (uGiDebugView < 1.5) gGiDebugColor = giIrradiance * 0.05;
            else if (uGiDebugView < 2.5) gGiDebugColor = iblIrradiance * 0.05;
            else if (uGiDebugView < 3.5) gGiDebugColor = vec3(giConfidence);
            else if (uGiDebugView < 4.5) {
              float giDbgL = dot(giIrradiance, vec3(0.2126, 0.7152, 0.0722));
              float iblDbgL = max(dot(iblIrradiance, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
              gGiDebugColor = vec3(giDbgL / iblDbgL * 0.25);
            }
            else gGiDebugColor = vec3(gGiDbgWeightSum * 0.5);
          }
          if (giConfidence > 0.0) {
            #if defined( RE_IndirectSpecular )
            float giSkyLum = max(dot(iblIrradiance, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
            float giLum = dot(giIrradiance, vec3(0.2126, 0.7152, 0.0722));
            float giOcclusion = clamp(giLum / giSkyLum, 0.0, 1.0);
            radiance *= mix(1.0, mix(1.0, giOcclusion, giConfidence), uGiSpecularOcclusion);
            #endif
            iblIrradiance = mix(iblIrradiance, giIrradiance, giConfidence);
          }
        }
        #endif`)
        .replace("#include <dithering_fragment>", `#include <dithering_fragment>
        if (uGiDebugView > 0.5) gl_FragColor = vec4(gGiDebugColor, 1.0);`);
    }

    if (destruction) {
      BindDestructionUniforms(shader.uniforms, destruction);
      // 跟 GI 一样必须自己传世界坐标。这里不能拿 vViewPosition 反推：静态合批网格
      // 分区之后 modelMatrix 虽然通常是单位阵，但编辑器与过场会真的移动整棵节点。
      vertex = vertex
        .replace("#include <common>", `#include <common>
        varying vec3 vDamageWorldPos;`)
        .replace("#include <project_vertex>", `#include <project_vertex>
        {
          vec4 damageWorld = vec4(transformed, 1.0);
          #ifdef USE_BATCHING
            damageWorld = batchingMatrix * damageWorld;
          #endif
          #ifdef USE_INSTANCING
            damageWorld = instanceMatrix * damageWorld;
          #endif
          vDamageWorldPos = (modelMatrix * damageWorld).xyz;
        }`);
      fragment = fragment
        .replace("#include <common>", `#include <common>
        varying vec3 vDamageWorldPos;
${DestructionShaderGlsl(destruction.maxVolumes)}`)
        .replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
        ApplyDamageVolumes(vDamageWorldPos);`);
    }

    shader.vertexShader = vertex;
    shader.fragmentShader = fragment;
  };
  // 缓存键必须跟着注入组合走：两种组合共用一份编译结果 = 有的材质拿不到 GI
  material.customProgramCacheKey = () => `indirect:${ssao ? 1 : 0}${gi ? 1 : 0}${destruction ? 1 : 0}`;
  return material;
}

/** 阴影深度也裁同一批洞；否则墙已经穿了，太阳底下还留一块完整墙影。 */
function MakeDestructionDepthMaterial(uniforms) {
  const material = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  material.onBeforeCompile = (shader) => {
    BindDestructionUniforms(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
      varying vec3 vDamageWorldPos;`)
      .replace("#include <project_vertex>", `#include <project_vertex>
      {
        vec4 damageWorld = vec4(transformed, 1.0);
        #ifdef USE_BATCHING
          damageWorld = batchingMatrix * damageWorld;
        #endif
        #ifdef USE_INSTANCING
          damageWorld = instanceMatrix * damageWorld;
        #endif
        vDamageWorldPos = (modelMatrix * damageWorld).xyz;
      }`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
      varying vec3 vDamageWorldPos;
${DestructionShaderGlsl(uniforms.maxVolumes)}`)
      .replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
      ApplyDamageVolumes(vDamageWorldPos);`);
  };
  material.customProgramCacheKey = () => `damageDepth:${uniforms.maxVolumes}`;
  return material;
}

/** 兼容旧调用点：只挂 AO。 */
export function InjectScreenSpaceAo(material, aoUniforms) {
  return InjectIndirectLighting(material, { ssao: aoUniforms });
}

/**
 * 材质库。烘焙是同步的但按配方切片，所以 Prepare() 是个可 await 的生成器循环，
 * 加载条能真的动起来（一次性烘 15 张 512 会把主线程卡死 3 秒，白屏就是这么来的）。
 */
export class MaterialLibrary {
  constructor(renderer, { textureSize = 512, ssao = null, gi = null, destruction = null } = {}) {
    this.renderer = renderer;
    this.textureSize = textureSize;
    this.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 1;
    this.ssao = ssao;         // { map: {value}, resolution: {value}, strength: {value} }
    this.gi = gi;             // MakeGiUniforms() 那一包，与 ProbeVolume 共用同一批对象
    this.destruction = destruction;
    this.baked = new Map();   // name -> { albedo, normal, orm }（three 纹理）
    this.materials = new Map();
    // 演员也会复用 BrickWall / WoodBeam 的底材，不能把破口 shader 直接挂到底材上，
    // 否则人走过洞口时身体也会被裁掉。Static() 只给 BuildSink 的场景网格克隆一份。
    this.staticMaterials = new Map();
    this.staticDepthMaterial = destruction ? MakeDestructionDepthMaterial(destruction) : null;
  }

  /** 逐个配方烘焙，每 yield 一次交还主线程。 */
  *PrepareSteps(names = Object.keys(RECIPES)) {
    for (const name of names) {
      const recipe = RECIPES[name];
      if (!recipe) continue;
      const size = name.startsWith("Cloth") || name === "Steel" || name === "SteelHelmet"
        || name === "Sandbag" || name === "WoodBeam" || name === "WoodStock"
        ? Math.min(256, this.textureSize)
        : this.textureSize;
      const maps = recipe(size);
      this.baked.set(name, {
        albedo: MakeTexture(maps.albedo, maps.size, { srgb: true, anisotropy: this.anisotropy }),
        normal: MakeTexture(maps.normal, maps.size, { anisotropy: this.anisotropy }),
        orm: MakeTexture(maps.orm, maps.size, { anisotropy: this.anisotropy }),
      });
      yield name;
    }
  }

  /**
   * Replace one procedural recipe with authored PBR images.  Weapon materials use
   * this after the cheap procedural fallback has been baked, so a missing image
   * never blocks boot and Pages can still run from a partially warmed cache.
   */
  async LoadExternalSet(name, { albedo, normal, orm }) {
    const loader = new THREE.TextureLoader();
    const Load = async (url, srgb) => {
      const texture = await loader.loadAsync(url);
      texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.anisotropy = this.anisotropy;
      texture.needsUpdate = true;
      return texture;
    };
    const loaded = await Promise.all([Load(albedo, true), Load(normal, false), Load(orm, false)]);
    this.baked.set(name, { albedo: loaded[0], normal: loaded[1], orm: loaded[2] });
    // LoadExternalSet runs before actors are built. Clear anyway so editor hot reloads
    // cannot retain a material that still points at the procedural fallback.
    this.materials.clear();
    return name;
  }

  /**
   * 为局部布景换一张作者绘制的 base color，但继续复用一套已经验过的
   * normal + ORM。这样车厢可以有专属的铆钉钢板／防滑钢板，同时不把
   * PBR 降级成一张无粗糙度、无金属度的彩色贴图。
   */
  async LoadExternalAlbedo(name, fallbackName, albedo) {
    const fallback = this.baked.get(fallbackName);
    if (!fallback) throw new Error(`材质未烘焙：${fallbackName}`);
    const loader = new THREE.TextureLoader();
    const texture = await loader.loadAsync(albedo);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = this.anisotropy;
    texture.needsUpdate = true;
    this.baked.set(name, { albedo: texture, normal: fallback.normal, orm: fallback.orm });
    this.materials.clear();
    return name;
  }

  /**
   * 取一份材质。同一个 name + 同一组 options 只建一次。
   * @param {string} name 配方名
   * @param {object} options repeat / normalScale / roughness / metalness / color / side / transparent
   */
  Get(name, options = {}) {
    const key = `${name}|${JSON.stringify(options)}`;
    if (this.materials.has(key)) return this.materials.get(key);
    const set = this.baked.get(name);
    if (!set) throw new Error(`材质未烘焙：${name}`);
    const repeat = options.repeat ?? 1;
    const clone = (texture) => {
      if (repeat === 1) return texture;
      const t = texture.clone();
      t.repeat.set(Array.isArray(repeat) ? repeat[0] : repeat, Array.isArray(repeat) ? repeat[1] : repeat);
      t.needsUpdate = true;
      return t;
    };
    const albedo = clone(set.albedo);
    const normal = clone(set.normal);
    const orm = clone(set.orm);
    const material = new THREE.MeshStandardMaterial({
      map: albedo,
      normalMap: normal,
      normalScale: new THREE.Vector2(options.normalScale ?? 1, options.normalScale ?? 1),
      // 同一张 ORM 喂三个槽 —— glTF 的打包约定，three 原生支持，省两个采样器
      aoMap: orm,
      roughnessMap: orm,
      metalnessMap: orm,
      roughness: options.roughness ?? 1,
      metalness: options.metalness ?? 1,
      aoMapIntensity: options.aoIntensity ?? 0.72,
      color: new THREE.Color(options.color ?? 0xffffff),
      side: options.side ?? THREE.FrontSide,
      envMapIntensity: options.envMapIntensity ?? 1,
      transparent: !!options.transparent,
      opacity: options.opacity ?? 1,
      flatShading: !!options.flatShading,
    });
    if (this.ssao || this.gi) InjectIndirectLighting(material, { ssao: this.ssao, gi: this.gi });
    this.materials.set(key, material);
    return material;
  }

  /** 无贴图的纯色 PBR（玻璃、水、旗面这类）。也吃 SSAO。 */
  Plain(name, params = {}) {
    const key = `plain:${name}|${JSON.stringify(params)}`;
    if (this.materials.has(key)) return this.materials.get(key);
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(params.color ?? 0x808080),
      roughness: params.roughness ?? 0.85,
      metalness: params.metalness ?? 0,
      side: params.side ?? THREE.FrontSide,
      transparent: !!params.transparent,
      opacity: params.opacity ?? 1,
      emissive: new THREE.Color(params.emissive ?? 0x000000),
      emissiveIntensity: params.emissiveIntensity ?? 1,
      flatShading: !!params.flatShading,
      depthWrite: params.depthWrite ?? true,
    });
    if (!params.transparent && (this.ssao || this.gi)) {
      InjectIndirectLighting(material, { ssao: this.ssao, gi: this.gi });
    }
    this.materials.set(key, material);
    return material;
  }

  /** 把普通底材变成“只用于静态布景”的可裁切版本；同一底材始终复用同一克隆。 */
  Static(material) {
    if (!this.destruction || !material) return material;
    const key = material.uuid;
    if (this.staticMaterials.has(key)) return this.staticMaterials.get(key);
    const clone = material.clone();
    clone.name = `${material.name || material.type}_DestructibleStatic`;
    InjectIndirectLighting(clone, {
      ssao: this.ssao,
      gi: this.gi,
      destruction: this.destruction,
    });
    this.staticMaterials.set(key, clone);
    return clone;
  }

  StaticDepth() { return this.staticDepthMaterial; }

  Dispose() {
    for (const set of this.baked.values()) {
      set.albedo.dispose(); set.normal.dispose(); set.orm.dispose();
    }
    for (const m of this.materials.values()) m.dispose();
    for (const m of this.staticMaterials.values()) m.dispose();
    if (this.staticDepthMaterial) this.staticDepthMaterial.dispose();
    this.baked.clear();
    this.materials.clear();
    this.staticMaterials.clear();
  }
}
