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
 * 给材质挂上屏幕空间 AO。
 * 用 onBeforeCompile 改 <aomap_fragment>：这是 three 里唯一一个"只动间接光"的钩子。
 */
export function InjectScreenSpaceAo(material, aoUniforms) {
  material.userData.ssaoUniforms = aoUniforms;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSsaoMap = aoUniforms.map;
    shader.uniforms.uSsaoResolution = aoUniforms.resolution;
    shader.uniforms.uSsaoStrength = aoUniforms.strength;
    shader.fragmentShader = shader.fragmentShader
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
  };
  material.customProgramCacheKey = () => "ssao1";
  return material;
}

/**
 * 材质库。烘焙是同步的但按配方切片，所以 Prepare() 是个可 await 的生成器循环，
 * 加载条能真的动起来（一次性烘 15 张 512 会把主线程卡死 3 秒，白屏就是这么来的）。
 */
export class MaterialLibrary {
  constructor(renderer, { textureSize = 512, ssao = null } = {}) {
    this.renderer = renderer;
    this.textureSize = textureSize;
    this.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 1;
    this.ssao = ssao;         // { map: {value}, resolution: {value}, strength: {value} }
    this.baked = new Map();   // name -> { albedo, normal, orm }（three 纹理）
    this.materials = new Map();
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
    if (this.ssao) InjectScreenSpaceAo(material, this.ssao);
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
    if (this.ssao && !params.transparent) InjectScreenSpaceAo(material, this.ssao);
    this.materials.set(key, material);
    return material;
  }

  Dispose() {
    for (const set of this.baked.values()) {
      set.albedo.dispose(); set.normal.dispose(); set.orm.dispose();
    }
    for (const m of this.materials.values()) m.dispose();
    this.baked.clear();
    this.materials.clear();
  }
}
