// 《台儿庄：血战滕县》材质库：把 Script_TexBake 烘出的裸字节包成 three 纹理与
// MeshStandardMaterial，并把屏幕空间 AO 注入到**间接光**里。
//
// 两条铁律（错一条画面立刻塑料）：
//   1) albedo 必须标 SRGBColorSpace，normal / orm 必须是 NoColorSpace。
//      反了的话：颜色发灰、法线方向错、粗糙度整体偏亮。
//   2) SSAO 只乘 indirectDiffuse / indirectSpecular，**不许乘直接光**。
//      乘了直接光 = 太阳照到的墙角也发黑，那是脏，不是遮蔽。

import * as THREE from "three";
import { RECIPES } from "./Script_TexBake.mjs";
import { SSR } from "./Data_Tuning_Graphics.mjs";
import {
  ApplyPatches, IndirectLightingPatches, MakeDestructionPatch, FoldOrmMaps,
} from "./Script_MaterialPatches.mjs";

/**
 * 1×1 透明 GIF。给一张挂死的 `<img>` 换上它 = 当场放弃原来那条连接，
 * 而且不产生新请求。**别改成 `img.src = ""`** —— 空串按 HTML 规范会解析成
 * 页面自己的 URL，等于顺手再下一遍 index.html。
 */
const BLANK_PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

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
 * 一张烘好的 ORM 里粗糙度（绿通道）的最小值，0..1。扫一遍字节，每个配方只算一次。
 */
function OrmRoughnessFloor(orm) {
  let min = 255;
  for (let i = 1; i < orm.length; i += 4) if (orm[i] < min) min = orm[i];
  return min / 255;
}

/**
 * 这份材质的粗糙度有没有**可能**落进 SSR 的区间。
 *
 * SSR 的材质侧只在 `material.roughness <= uSsrMaxRoughness`（出厂 0.60）时才动
 * `radiance`。而本仓的墙 / 地 / 木 / 布 / 砸袋那一批配方，烘出来的粗糙度
 * 下界都在 0.75 以上（实测表见 docs §1.8）—— 那条分支永远不成立。
 * 所以这些材质**根本不编 SSR 补丁**：逐像素逐比特无差别，而每一份省一个
 * 纹理单元（`uSsrMap`）—— 这是 16 个单元硬预算里性价比最高的一笔之一。
 *
 * 下一帧追踪端的粗糙度输入也自洽：不挂补丁 = 不往 `gl_FragColor.a` 写粗糙度，
 * 不透明材质的 alpha 恒为 1，追踪端读到 1.0 就跳过那些像素 —— 与“它太糙，
 * 不值得追”是同一个结论。
 *
 * **前提：这一位是构造期定的。** 谁要在运行时把一份库材质的 `roughness` 调到
 * 0.60 以下（比如淠水效果），得连着重新 `InjectIndirectLighting` 一次，否则那份
 * 材质不会突然长出 SSR 来。外部 GLB（自带 roughnessMap，下界未知）一律保留 SSR。
 */
function SsrEligible(minRoughness) {
  return !(minRoughness > SSR.maxRoughness);
}

/**
 * 给材质挂上「间接光的两件事」：屏幕空间 AO 与探针体 GI（外加破口裁切）。
 *
 * 2026-09 帧图重构：**实现搬到了 `Script_MaterialPatches.mjs` 的补丁注册表**，
 * 这里只剩一层薄封装（外部签名与 userData 标记一个字没变）。
 *
 * 为什么要注册表：three 一个材质只有一个 `onBeforeCompile` 钩子，分两次写的话
 * 后一次会把前一次整个覆盖掉（AO 会静默消失，且没有任何报错）。注册表把所有
 * 补丁在同一个钩子里按固定顺序做完，`customProgramCacheKey` 由各补丁的 key 拼出来。
 *
 * 分工（细节与锚点表见 Script_MaterialPatches 抬头）：
 *   AO  —— 只压间接光，且只压「接触处」那种小尺度遮蔽（`<aomap_fragment>`）；
 *   GI  —— 直接**替换**天空 IBL 的漫反射项，镜面那一路按亮度比做遮蔽；
 *          采样层是**编译期**开关（`gi.sampling` 进了 cache key），调试层常在。
 *   SSR —— 按置信度把镜面 IBL 的 `radiance` 换成屏幕空间反射，并把
 *          `material.roughness` 写进 `gl_FragColor.a`（下一帧追踪端的粗糙度输入）。
 *          **只给不透明材质**：往 alpha 里写数会改混合结果，所以下面每个
 *          建材质的入口都按 `transparent` 分流。
 *   破口 —— 主材质 / 静态克隆 / 阴影深度三条链共用同一份 OBB。
 */
export function InjectIndirectLighting(material,
  { ssao = null, gi = null, ssr = null, destruction = null } = {}) {
  // 半透明材质一律不挂 SSR：补丁要占用 gl_FragColor.a。这里再兜一次底，
  // 调用点漏判也不会把混合搞坏。
  const ssrUniforms = material.transparent ? null : ssr;
  // ORM 三合一：把 metalnessMap / aoMap 从材质上摘掉，改成从 roughnessMap 那一个
  // 采样器读 .b / .r（省两个纹理单元，口径见 Script_MaterialPatches.MakeOrmPatch）。
  // 幂等：结果记在 userData.ormUniforms，静态克隆与外部 GLB 二次注入都取回同一份。
  const orm = FoldOrmMaps(material);
  material.userData.ssaoUniforms = ssao;
  material.userData.giUniforms = gi;
  material.userData.ssrUniforms = ssrUniforms;
  material.userData.destructionUniforms = destruction;
  ApplyPatches(material, IndirectLightingPatches({ orm, ssao, gi, ssr: ssrUniforms, destruction }));
  // 布尔标记只给运行时取证与幂等接入用。不要把 uniforms 包塞进新标记：
  // 里面有 Texture，material.clone()/toJSON 会为每个人刷一屏“Unable to serialize”。
  material.userData.indirectLightingInjected = true;
  return material;
}

/** 阴影深度也裁同一批洞；否则墙已经穿了，太阳底下还留一块完整墙影。 */
function MakeDestructionDepthMaterial(uniforms) {
  const material = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  ApplyPatches(material, [MakeDestructionPatch(uniforms, {
    key: "damageDepth:" + uniforms.maxVolumes,
  })]);
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
  constructor(renderer,
    { textureSize = 512, ssao = null, gi = null, ssr = null, destruction = null } = {}) {
    this.renderer = renderer;
    this.textureSize = textureSize;
    this.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 1;
    this.ssao = ssao;         // { map: {value}, resolution: {value}, strength: {value} }
    this.gi = gi;             // MakeGiUniforms() 那一包，与 ProbeVolume 共用同一批对象
    // SsrPass.SurfaceUniforms 那一包（SSR 关档时是 null，材质连补丁都不编）
    this.ssr = ssr;
    this.destruction = destruction;
    this.baked = new Map();   // name -> { albedo, normal, orm }（three 纹理）
    this.materials = new Map();
    // 演员也会复用 BrickWall / WoodBeam 的底材，不能把破口 shader 直接挂到底材上，
    // 否则人走过洞口时身体也会被裁掉。Static() 只给 BuildSink 的场景网格克隆一份。
    this.staticMaterials = new Map();
    // 外部 GLB 的材质由加载器缓存并在多个蒙皮实例之间共享。WeakSet 既保证只注入
    // 一次，也不把这些材质变成 MaterialLibrary 的所有物（Dispose 时不能替资产卸载）。
    this.externalPbrMaterials = new WeakSet();
    this.staticDepthMaterial = destruction ? MakeDestructionDepthMaterial(destruction) : null;
  }

  /**
   * 把 GLB 自带的 MeshStandard/PhysicalMaterial 接进项目统一的 PBR 与调试链。
   *
   * glTF 规范的 metallicFactor 缺省值是 1。卢沟桥十套人物多数材质没有显式写该
   * 字段，于是 GLTFLoader 会把军装、皮肤和头发全部当成金属；白盒里又没有贴图环境
   * 帮暗面提轮廓，最终就成了黑色剪影。角色资产是混合 atlas，没有可独立保留的裸露
   * 金属桶，因此运行时明确归零 metalness；roughness 仍保留作者标量与贴图，调试视图
   * 显示的是 three 真正参与 BRDF 的 roughnessFactor。
   */
  ConfigureExternalPbr(material, { metalness = null, minRoughness = null } = {}) {
    const materials = Array.isArray(material) ? material : [material];
    for (const item of materials) {
      if (!item || (!item.isMeshStandardMaterial && !item.isMeshPhysicalMaterial)) continue;
      let changed = false;
      if (Number.isFinite(metalness)) {
        const nextMetalness = Math.max(0, Math.min(1, metalness));
        changed ||= item.metalness !== nextMetalness;
        item.metalness = nextMetalness;
      }
      if (Number.isFinite(minRoughness)) {
        const nextRoughness = Math.max(minRoughness, Number(item.roughness) || 0);
        changed ||= item.roughness !== nextRoughness;
        item.roughness = nextRoughness;
      }
      const firstConfiguration = !this.externalPbrMaterials.has(item);
      if (firstConfiguration) {
        if (this.ssao || this.gi || this.ssr) {
          InjectIndirectLighting(item, { ssao: this.ssao, gi: this.gi, ssr: this.ssr });
        }
        this.externalPbrMaterials.add(item);
      }
      item.userData.externalPbrConfigured = true;
      if (firstConfiguration || changed) item.needsUpdate = true;
    }
    return material;
  }

  /** 逐个配方烘焙，每 yield 一次交还主线程。 */
  *PrepareSteps(names = Object.keys(RECIPES)) {
    for (const name of names) {
      const recipe = RECIPES[name];
      if (!recipe) continue;
      const size = name.startsWith("Cloth") || name === "Steel" || name === "SteelHelmet"
        || name === "Sandbag" || name === "WoodBeam" || name === "WoodStock"
        || name === "WattleFence"
        ? Math.min(256, this.textureSize)
        : this.textureSize;
      const maps = recipe(size);
      this.baked.set(name, {
        albedo: MakeTexture(maps.albedo, maps.size, { srgb: true, anisotropy: this.anisotropy }),
        normal: MakeTexture(maps.normal, maps.size, { anisotropy: this.anisotropy }),
        orm: MakeTexture(maps.orm, maps.size, { anisotropy: this.anisotropy }),
        // 这张 ORM 的粗糙度下界（绿通道最小值）。给 SSR 补丁的死代码消除用，见 SsrEligible。
        roughMin: OrmRoughnessFloor(maps.orm),
      });
      yield name;
    }
  }

  /** 一张下好的图 → 一张按本库约定配好的贴图。外部图三条路共用。 */
  _WrapTexture(image, srgb, flipY = true) {
    const texture = new THREE.Texture(image);
    texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    // 平铺 PBR 按浏览器图片坐标走默认翻转；恢复 glTF 作者 UV atlas 时必须与
    // GLTFLoader 一样设 false，否则整张 atlas 上下颠倒、模型采到未使用的色块。
    texture.flipY = flipY;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = this.anisotropy;
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * 下一张外部贴图。**必须带超时。**
   *
   * `<img>` 的加载没有超时这回事：连接一旦挂住（不是 404、不是 reset，就是
   * 单纯不回数据），它既不发 load 也不发 error，那个 Promise 永远悬着。
   * 开机时这一步要一口气下 72 张图 / 35 MB，只要其中**一张**挂住，Boot 里的
   * Promise.all 就再也不 settle —— 加载画面停在"加载 PBR 材质……"、进度条钉在
   * 24%，而展示台在 worker 里照转不误，整个页面看上去还活着。用 playwright
   * 把任意一张 hold 住，百分之百复现。
   *
   * 超时之后把 src 换成 BLANK_PIXEL，让浏览器松开那条连接：同域只有六个并发
   * 名额，后面建关卡还要用。走 ImageLoader 而不是 TextureLoader 就是为了拿到
   * 这个 img 元素 —— TextureLoader 只在成功回调里才把 image 挂到 texture 上。
   */
  _LoadExternalImage(url, srgb, timeoutMs, flipY = true) {
    return new Promise((resolve, reject) => {
      let image = null;
      let settled = false;
      const Settle = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn(value);
      };
      const timer = setTimeout(() => {
        if (image) image.src = BLANK_PIXEL;
        Settle(reject, new Error(`${url} 超时 ${timeoutMs} ms`));
      }, timeoutMs);
      image = new THREE.ImageLoader().load(
        url,
        (loaded) => Settle(resolve, this._WrapTexture(loaded, srgb, flipY)),
        undefined,
        () => Settle(reject, new Error(`${url} 读不到`)),
      );
    });
  }

  /**
   * Replace one procedural recipe with authored PBR images.  Weapon materials use
   * this after the cheap procedural fallback has been baked, so a missing image
   * never blocks boot and Pages can still run from a partially warmed cache.
   *
   * 三张图有一张读不到 / 超时就整套不换，抛给调用方 —— 只换一半（比如有 albedo
   * 没 normal）比全部退回程序化更难看。调用方按套接住，别让一套拖垮其它套。
   */
  async LoadExternalSet(name, { albedo, normal, orm, flipY = true }, { timeoutMs = 30000 } = {}) {
    const loaded = await Promise.all([
      this._LoadExternalImage(albedo, true, timeoutMs, flipY),
      this._LoadExternalImage(normal, false, timeoutMs, flipY),
      this._LoadExternalImage(orm, false, timeoutMs, flipY),
    ]);
    this.baked.set(name, { albedo: loaded[0], normal: loaded[1], orm: loaded[2] });
    // LoadExternalSet runs before actors are built. Clear anyway so editor hot reloads
    // cannot retain a material that still points at the procedural fallback.
    this.materials.clear();
    return name;
  }

  /**
   * Replace authored color + normal while keeping a proven procedural ORM.
   * Small props such as carts and crates need their own UV-scale wood grain,
   * but do not need another network texture just to repeat the same dry-wood
   * roughness/occlusion response.
   */
  async LoadExternalBaseNormal(name, fallbackName,
    { albedo, normal, flipY = true }, { timeoutMs = 30000 } = {}) {
    const fallback = this.baked.get(fallbackName);
    if (!fallback) throw new Error(`材质未烘焙：${fallbackName}`);
    const loaded = await Promise.all([
      this._LoadExternalImage(albedo, true, timeoutMs, flipY),
      this._LoadExternalImage(normal, false, timeoutMs, flipY),
    ]);
    this.baked.set(name, { albedo: loaded[0], normal: loaded[1], orm: fallback.orm });
    this.materials.clear();
    return name;
  }

  /**
   * 为局部布景换一张作者绘制的 base color，但继续复用一套已经验过的
   * normal + ORM。这样车厢可以有专属的铆钉钢板／防滑钢板，同时不把
   * PBR 降级成一张无粗糙度、无金属度的彩色贴图。
   */
  async LoadExternalAlbedo(name, fallbackName, albedo, { timeoutMs = 30000 } = {}) {
    const fallback = this.baked.get(fallbackName);
    if (!fallback) throw new Error(`材质未烘焙：${fallbackName}`);
    const texture = await this._LoadExternalImage(albedo, true, timeoutMs);
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
      // 同一张 ORM 喂三个槽（glTF 的打包约定）。**注意 three 不做去重** ——
      // 三个槽各占一个纹理单元；InjectIndirectLighting 里的 FoldOrmMaps 会把
      // metalnessMap / aoMap 摘掉，改由材质补丁从 roughnessMap 一份采样里读。
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
    if (this.ssao || this.gi || this.ssr) {
      // 粗糙度下界 = 标量×ORM 绿通道最小值。超过 SSR 上限就不编那一路（见 SsrEligible）。
      const roughFloor = (options.roughness ?? 1) * (set.roughMin ?? 0);
      const ssr = SsrEligible(roughFloor) ? this.ssr : null;
      InjectIndirectLighting(material, { ssao: this.ssao, gi: this.gi, ssr });
    }
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
    if (!params.transparent && (this.ssao || this.gi || this.ssr)) {
      // 纯色材质没有 roughnessMap，粗糙度就是那一个标量，下界精确。
      const ssr = SsrEligible(params.roughness ?? 0.85) ? this.ssr : null;
      InjectIndirectLighting(material, { ssao: this.ssao, gi: this.gi, ssr });
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
      // 跟底材的判定走：底材没挂 SSR（太糙）的话，可裁切克隆也不该挂，
      // 否则同一块墙的完整版与破口版会是两套采样器预算。
      ssr: material.userData.ssrUniforms ? this.ssr : null,
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
