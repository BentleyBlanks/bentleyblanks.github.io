// 《台儿庄：血战滕县》材质库：把 Script_TexBake 烘出的裸字节包成 three 纹理与
// MeshStandardMaterial，并把屏幕空间 AO 注入到**间接光**里。
//
// 两条铁律（错一条画面立刻塑料）：
//   1) albedo 必须标 SRGBColorSpace，normal / orm 必须是 NoColorSpace。
//      反了的话：颜色发灰、法线方向错、粗糙度整体偏亮。
//   2) SSAO 只乘 indirectDiffuse / indirectSpecular，**不许乘直接光**。
//      乘了直接光 = 太阳照到的墙角也发黑，那是脏，不是遮蔽。

import * as THREE from "three";
import { RECIPES, BakeDetailNormal, BakeSkinLut } from "./Script_TexBake.mjs";
import { SSR } from "./Data_Tuning_Graphics.mjs";
import {
  ApplyPatches, IndirectLightingPatches, MakeDestructionPatch, FoldOrmMaps, PatchesOf,
} from "./Script_MaterialPatches.mjs";
import { MakeMaterialShadingPatch, MakeShadingFeatures } from "./Script_MaterialShading.mjs";
import {
  SurfaceOf, CLOTH_SHEEN, METAL_ANISOTROPY, DETAIL_NORMAL,
  EXTERNAL_MATERIAL_CLASSES, EXTERNAL_MATERIAL_ORDER,
} from "./Data_Tuning_Materials.mjs";

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
 * 一张**外部图片**的 ORM 粗糙度下界。用一张离屏 canvas 解码后整张扫（每张一次，
 * 512² 约 1 ms）。**不能降采样再扫** —— 降采样会把最小值平均高，把一块真的
 * 光滑区域误判成“全都很糙”，于是 SSR 被错误地注销掉。
 * 读不到（跨域 / 没有 canvas）时返回 0 = “不知道”，保守地保留 SSR。
 */
function ExternalOrmRoughnessFloor(texture) {
  const image = texture?.image;
  if (!image || !image.width || !image.height) return 0;
  try {
    const canvas = typeof OffscreenCanvas === "function"
      ? new OffscreenCanvas(image.width, image.height)
      : Object.assign(document.createElement("canvas"), { width: image.width, height: image.height });
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return 0;
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, image.width, image.height).data;
    return OrmRoughnessFloor(data);
  } catch (error) {
    return 0;
  }
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
 *   着色 —— POM / 细节法线 / 微阴影 / 地平线镜面遮蔽 / 皮肤预积分散射。
 *          补丁由 MaterialLibrary._ShadingPatch 造好后传进来（模块反向 import 会成环）。
 *   破口 —— 主材质 / 静态克隆 / 阴影深度三条链共用同一份 OBB。
 */
export function InjectIndirectLighting(material,
  { ssao = null, gi = null, ssr = null, destruction = null, shading = null } = {}) {
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
  ApplyPatches(material, IndirectLightingPatches({
    orm, ssao, gi, ssr: ssrUniforms, destruction, shading,
  }));
  // 布尔标记只给运行时取证与幂等接入用。不要把 uniforms 包塞进新标记：
  // 里面有 Texture，material.clone()/toJSON 会为每个人刷一屏“Unable to serialize”。
  material.userData.indirectLightingInjected = true;
  return material;
}

/**
 * 克隆一份**带着注入钩子**的材质。
 *
 * 为什么要有它（2026-09-08 第一关帧取证）：静态烘焙的尸体、远景实例化人群和蒙皮人物
 * 曾共用同一个材质对象。three 在 setProgram 里按 object 的 skinning / instancing 标志
 * 与 materialProperties 里上一次的标志比较，不一致就整个重新 getProgram ——
 * 程序本身有缓存不会重编，但 getParameters + 缓存键拼串每次都跑：实测一帧
 * 四百多次，约 930 KB 垃圾 / 帧、四到六毫秒 CPU，GC 每五帧一次。
 * 每一类 object（蒙皮 / 静态 / 实例）拿自己的一份材质，标志就稳定了。
 *
 * 经注册表（Script_MaterialPatches.ApplyPatches）装过补丁的材质，克隆体按**同一份
 * 补丁列表重装**，而不是抄钩子：`Material.clone()` 会把 defines 重置成 STANDARD /
 * PHYSICAL、把 userData 走一遍 JSON，钩子里的 SyncDefines 又只认原材质 —— 直接抄过来
 * 的克隆体第一次 getProgram 键里少 CSM_CONTACT / USE_MATERIAL_POM 这些位、钩子跑完
 * 又多回来，three 就再链接一份逐字节相同的程序（孪生程序，见 ApplyPatches 抬头）。
 * 没经过注册表的材质（Actor / 地形形变那几处自挂钩子的）仍然显式抄钩子；
 * 闭包里只引用共享的 uniforms 包与注入参数，可以安全共用。
 */
export function CloneShadedMaterial(material) {
  if (!material) return material;
  if (Array.isArray(material)) return material.map(CloneShadedMaterial);
  const clone = material.clone();
  clone.name = material.name;
  if (material.defines) clone.defines = Object.assign({}, clone.defines, material.defines);
  const patches = PatchesOf(material);
  if (patches) {
    ApplyPatches(clone, patches);
  } else {
    if (Object.prototype.hasOwnProperty.call(material, "onBeforeCompile")) clone.onBeforeCompile = material.onBeforeCompile;
    if (Object.prototype.hasOwnProperty.call(material, "customProgramCacheKey")) clone.customProgramCacheKey = material.customProgramCacheKey;
  }
  return clone;
}

/**
 * 外部 GLB 材质按**名字**分类（皮肤 / 金属 / 布）。
 *
 * 为什么按名字：卢沟桥那十套人物是混合 atlas，一个网格里同时有脸、军装和头发，
 * 几何上分不开；能分开的只有材质名（`John_All Body` / `战士5_头部` /
 * `Material #1721585337`）。命中不到时返回 null —— **什么都不做**是有意的：
 * 宁可少一层绒光，也不要把眼球或刺刀误判成棉布。
 */
export function ClassifyExternalMaterial(name) {
  const text = String(name || "");
  if (!text) return null;
  for (const kind of EXTERNAL_MATERIAL_ORDER) {
    if (EXTERNAL_MATERIAL_CLASSES[kind]?.test(text)) return kind;
  }
  return null;
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
    { textureSize = 512, ssao = null, gi = null, ssr = null,
      destruction = null, shading = null } = {}) {
    this.renderer = renderer;
    this.textureSize = textureSize;
    // 小件（布、钢、沙包、木梁）一直是 256；ultra 把基准抬到 1024 时它们跟着翻一档。
    // 写成推导而不是再加一个构造参数：调用方只需要说"这一档基准多大"。
    this.smallTextureSize = Math.min(512, Math.max(256, Math.round(textureSize / 2)));
    this.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 1;
    this.ssao = ssao;         // { map: {value}, resolution: {value}, strength: {value} }
    this.gi = gi;             // MakeGiUniforms() 那一包，与 ProbeVolume 共用同一批对象
    // SsrPass.SurfaceUniforms 那一包（SSR 关档时是 null，材质连补丁都不编）
    this.ssr = ssr;
    this.destruction = destruction;
    // MakeMaterialShadingUniforms() 那一包（POM / 细节法线 / 微阴影 / 地平线 / 皮肤）。
    // 与 ssao / gi 同一个模式：全场共用一份，调一根旋钮全场生效。
    this.shading = shading;
    this.shadingMapsReady = false;
    // 外部 GLB 材质换 MeshPhysicalMaterial 之后的对照表（同一份源材质只换一次，
    // 换出来的那份被所有引用它的网格共用 —— 否则每个网格一份材质 = 每个网格一份程序）。
    this.upgradedExternal = new Map();
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
  ConfigureExternalPbr(material, { metalness = null, minRoughness = null, mesh = null } = {}) {
    const list = Array.isArray(material) ? material : [material];
    const out = [];
    let rebind = false;
    for (const source of list) {
      if (!source || (!source.isMeshStandardMaterial && !source.isMeshPhysicalMaterial)) {
        out.push(source);
        continue;
      }
      // 类型升级只在调用方交出网格时做（`mesh`）：换类等于换对象，拿不到网格
      // 就没法把新材质挂回去，那只会造出一份没人用的 MeshPhysicalMaterial。
      const item = mesh ? this._UpgradeExternal(source) : source;
      if (item !== source) rebind = true;
      out.push(item);
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
      // 金属件的各向异性要 roughness 有个下限才看得出方向（全镜面时高光是一个点）。
      if (item.userData.externalMaterialClass === "metal" && item.isMeshPhysicalMaterial) {
        const anisoRoughness = Math.max(METAL_ANISOTROPY.minRoughness, Number(item.roughness) || 0);
        changed ||= item.roughness !== anisoRoughness;
        item.roughness = anisoRoughness;
      }
      // 没被分类的外部材质也要吃微阴影与地平线遮蔽（那两项只要有 ORM / 法线图
      // 就成立，与是什么东西无关）。细节法线在这里一律 0：人物与枪械是 atlas UV，
      // 一份 uv 摊在整个身体上，再乘 10 倍平铺只有二十厘米一个循环 —— 那不是
      // 微表面，那是花布。外部件要细节法线得先有一套按世界尺度走的 uv（已知缺口）。
      if (!item.userData.materialShadingSurface) {
        item.userData.materialShadingSurface = {
          pom: 0, detailNormal: 0, detailTile: 9, microShadow: 0.8,
          horizonOcclusion: true, skin: false,
          hasNormalMap: !!item.normalMap, hasAoMap: !!item.aoMap,
        };
      }
      const firstConfiguration = !this.externalPbrMaterials.has(item);
      if (firstConfiguration) {
        this._Inject(item);
        this.externalPbrMaterials.add(item);
      }
      item.userData.externalPbrConfigured = true;
      if (firstConfiguration || changed) item.needsUpdate = true;
    }
    if (mesh && rebind) mesh.material = Array.isArray(material) ? out : out[0];
    return Array.isArray(material) ? out : out[0];
  }

  /**
   * 按材质名给外部 GLB 材质分类，需要时换成 `MeshPhysicalMaterial`。
   *
   * 为什么必须换类：three 的绒光（Charlie sheen）与各向异性是
   * `MeshPhysicalMaterial` 的字段 —— `WebGLPrograms` 的 `HAS_SHEEN`
   * 只看 `material.sheen > 0`（任何材质都读得到），但 uniform 的上传
   * (`refreshUniformsPhysical`) 门在 `material.isMeshPhysicalMaterial` 上。
   * 只设字段不换类 = 定义开着、uniform 恒 0：白付一份程序，画面一点不变。
   *
   * 同一份源材质只换一次并记进对照表：卢沟桥那十套人物的材质由加载器缓存共享，
   * 逐网格各换一份等于逐网格一份程序（换人那一帧要现编几十个）。
   */
  _UpgradeExternal(source) {
    if (source.isMeshPhysicalMaterial && source.userData.externalMaterialClass) return source;
    const existing = this.upgradedExternal.get(source);
    if (existing) return existing;
    const kind = ClassifyExternalMaterial(source.name);
    if (!kind || (kind === "skin" && !this.shading)) {
      source.userData.externalMaterialClass = kind || "";
      this.upgradedExternal.set(source, source);
      return source;
    }
    if (kind === "skin") {
      // 皮肤不换类：预积分散射是自己的补丁，不用 three 的任何 Physical 字段，
      // 换类只会白吃一份 PHYSICAL 程序（IOR + USE_SPECULAR 两段）。
      source.userData.externalMaterialClass = "skin";
      source.userData.materialShadingSurface = {
        pom: 0, detailNormal: 0, detailTile: 9, microShadow: 0.6,
        horizonOcclusion: true, skin: true,
        hasNormalMap: !!source.normalMap, hasAoMap: !!source.aoMap,
      };
      this.upgradedExternal.set(source, source);
      return source;
    }
    const upgraded = new THREE.MeshPhysicalMaterial();
    // 用**父类的** copy：MeshPhysicalMaterial.copy 会去读 source.sheenColor.copy(...)，
    // 而源材质是 MeshStandardMaterial，那些字段根本不存在，当场抛异常。
    THREE.MeshStandardMaterial.prototype.copy.call(upgraded, source);
    // 父类的 copy 顺手把 defines 写成 { STANDARD: '' }，PHYSICAL 要补回来。
    upgraded.defines = { STANDARD: "", PHYSICAL: "" };
    upgraded.name = source.name;
    upgraded.userData.externalMaterialClass = kind;
    if (kind === "cloth") {
      upgraded.sheen = CLOTH_SHEEN.sheen;
      upgraded.sheenRoughness = CLOTH_SHEEN.roughness;
      // 绒光色 = 布色去饱和后往白提。纯白绒光看着像蒙了一层塑料膜，
      // 完全用布色又等于把布整体提亮一档、颜色不变（等于没有绒光）。
      const sheenColor = upgraded.color.clone();
      const luminance = sheenColor.r * 0.2126 + sheenColor.g * 0.7152 + sheenColor.b * 0.0722;
      sheenColor.lerp(new THREE.Color(luminance, luminance, luminance), 1 - CLOTH_SHEEN.colorSaturation);
      sheenColor.lerp(new THREE.Color(1, 1, 1), CLOTH_SHEEN.colorLift);
      upgraded.sheenColor = sheenColor;
      upgraded.userData.materialShadingSurface = {
        pom: 0, detailNormal: 0, detailTile: 10, microShadow: 0.7,
        horizonOcclusion: true, skin: false,
        hasNormalMap: !!upgraded.normalMap, hasAoMap: !!upgraded.aoMap,
      };
    } else {
      upgraded.anisotropy = METAL_ANISOTROPY.anisotropy;
      // 枪管是沿模型局部 -Z 的，UV 上对应切线 U 方向 —— 0 弧度就是沿枪管拉长。
      upgraded.anisotropyRotation = METAL_ANISOTROPY.rotation;
      upgraded.userData.materialShadingSurface = {
        pom: 0, detailNormal: 0, detailTile: 10, microShadow: 0.6,
        horizonOcclusion: true, skin: false,
        hasNormalMap: !!upgraded.normalMap, hasAoMap: !!upgraded.aoMap,
      };
    }
    this.upgradedExternal.set(source, upgraded);
    return upgraded;
  }

  /**
   * 材质着色升级要用的两张全场共用图还差几步没烘（进度条要拿它算总数）。
   * 已经烘过或没接 shading 包时返回 0。
   */
  PendingShadingSteps() {
    return this.shading && !this.shadingMapsReady ? 2 : 0;
  }

  /**
   * 细节法线 + 皮肤预积分 LUT。两张都是**全场一份**，与配方无关，所以不进
   * `baked` 表，直接挂到 shading 包的 uniform 上。
   *
   * LUT 的两条硬要求（错一条就是一张彩色噪点或者一条硬边）：
   * `flipY = false`（它是数据不是图片）、`ClampToEdgeWrapping`（NdotL=±1 与
   * 曲率两端不许绕回去）、`NoColorSpace`、不生成 mipmap。
   */
  *PrepareShadingSteps() {
    if (!this.shading || this.shadingMapsReady) return;
    const detail = BakeDetailNormal(DETAIL_NORMAL.size);
    const detailTexture = new THREE.DataTexture(detail.normal, detail.size, detail.size,
      THREE.RGBAFormat, THREE.UnsignedByteType);
    detailTexture.colorSpace = THREE.NoColorSpace;
    detailTexture.wrapS = THREE.RepeatWrapping;
    detailTexture.wrapT = THREE.RepeatWrapping;
    detailTexture.generateMipmaps = true;
    detailTexture.minFilter = THREE.LinearMipmapLinearFilter;
    detailTexture.magFilter = THREE.LinearFilter;
    detailTexture.anisotropy = this.anisotropy;
    detailTexture.needsUpdate = true;
    this.shading.detailNormalMap.value?.dispose?.();
    this.shading.detailNormalMap.value = detailTexture;
    this.shadingTextures = [detailTexture];
    yield "DetailNormal";

    const lut = BakeSkinLut();
    const lutTexture = new THREE.DataTexture(lut.data, lut.width, lut.height,
      THREE.RGBAFormat, THREE.UnsignedByteType);
    lutTexture.colorSpace = THREE.NoColorSpace;
    lutTexture.flipY = false;
    lutTexture.wrapS = THREE.ClampToEdgeWrapping;
    lutTexture.wrapT = THREE.ClampToEdgeWrapping;
    lutTexture.generateMipmaps = false;
    lutTexture.minFilter = THREE.LinearFilter;
    lutTexture.magFilter = THREE.LinearFilter;
    lutTexture.needsUpdate = true;
    this.shading.skinLut.value?.dispose?.();
    this.shading.skinLut.value = lutTexture;
    this.shadingTextures.push(lutTexture);
    this.shadingMapsReady = true;
    yield "SkinLut";
  }

  /** 逐个配方烘焙，每 yield 一次交还主线程。 */
  *PrepareSteps(names = Object.keys(RECIPES)) {
    // 两张全场共用图排在最前：它们是**每一份材质**都要接的 uniform，
    // 谁先建关谁就得等着，不能懒到第一次用的时候现烘（那一帧直接冻住）。
    yield* this.PrepareShadingSteps();
    for (const name of names) {
      const recipe = RECIPES[name];
      if (!recipe) continue;
      const size = name.startsWith("Cloth") || name === "Steel" || name === "SteelHelmet"
        || name === "Sandbag" || name === "WoodBeam" || name === "WoodStock"
        || name === "WattleFence"
        ? Math.min(this.smallTextureSize, this.textureSize)
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
    this.baked.set(name, {
      albedo: loaded[0], normal: loaded[1], orm: loaded[2],
      // 与程序化配方同一条：粗糙度下界超过 SSR 上限就不编那一路补丁（见 SsrEligible）。
      roughMin: ExternalOrmRoughnessFloor(loaded[2]),
    });
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
    this.baked.set(name, {
      albedo: loaded[0], normal: loaded[1], orm: fallback.orm, roughMin: fallback.roughMin,
    });
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
    this.baked.set(name, {
      albedo: texture, normal: fallback.normal, orm: fallback.orm, roughMin: fallback.roughMin,
    });
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
    // 表面着色升级：POM 深度 / 细节法线 / 微阴影倍率按配方查
    // Data_Tuning_Materials.SURFACE_RECIPES。四个标量存进 userData（纯数字，
    // clone 时 JSON 拷得过去），Static() 克隆一份时照原样重建同一路补丁。
    material.userData.materialShadingSurface = this._SurfaceFeatures(name);
    // 粗糙度下界 = 标量×ORM 绿通道最小值。超过 SSR 上限就不编那一路（见 SsrEligible）。
    const roughFloor = (options.roughness ?? 1) * (set.roughMin ?? 0);
    this._Inject(material, { ssr: SsrEligible(roughFloor) ? this.ssr : null });
    this.materials.set(key, material);
    return material;
  }

  /** 一份烘焙配方对应的着色特性（Get 与 Static 共用同一份口径）。 */
  _SurfaceFeatures(name) {
    const surface = SurfaceOf(name);
    return {
      pom: surface.pomDepth,
      detailNormal: surface.detailWeight,
      detailTile: surface.detailTile,
      microShadow: surface.microShadow,
      horizonOcclusion: true,
      skin: false,
      hasNormalMap: true,
      // 真正的值由 _Inject 按 ORM 三合一的结果改写（摘掉 aoMap 之后
      // 材质自带的遮蔽在补丁声明的 gMaterialAo 上，不在 three 的 aoMap 上）。
      hasAoMap: true,
    };
  }

  /** 造这份材质的着色补丁（没接 shading 包或一路都不编时返回 null）。 */
  _ShadingPatch(material) {
    const spec = material.userData.materialShadingSurface;
    if (!this.shading || !spec) return null;
    return MakeMaterialShadingPatch(this.shading, MakeShadingFeatures(spec));
  }

  /**
   * 统一的注入口：ORM 三合一 / AO / GI / SSR / 着色升级 /（可选）破口，
   * 顺序由补丁注册表定（`IndirectLightingPatches`）。
   *
   * `ssr` 不传就用库里那一包；传 null 表示这份材质**不编 SSR**
   * （粗糙度下界超过 SSR 上限，见 `SsrEligible`）。
   */
  _Inject(material, { destruction = null, ssr = undefined } = {}) {
    // ORM 三合一先做：它决定材质自带的遮蔽还在不在 `aoMap` 上（摘掉之后
    // 微阴影要改读补丁声明的 gMaterialAo），而着色特性里那一位要跟着走。
    // 幂等 —— 二次注入取回同一份描述子。
    const orm = FoldOrmMaps(material);
    const spec = material.userData.materialShadingSurface;
    if (spec) spec.hasAoMap = !!(orm && (orm.ao || material.aoMap));
    const shading = this._ShadingPatch(material);
    const ssrPack = ssr === undefined ? this.ssr : ssr;
    if (!this.ssao && !this.gi && !ssrPack && !shading && !destruction) return material;
    return InjectIndirectLighting(material, {
      ssao: this.ssao, gi: this.gi, ssr: ssrPack, destruction, shading,
    });
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
    if (!params.transparent) {
      // 纯色材质没有 roughnessMap，粗糙度就是那一个标量，下界精确。
      this._Inject(material, { ssr: SsrEligible(params.roughness ?? 0.85) ? this.ssr : null });
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
    // userData 是 JSON 深拷的，materialShadingSurface（四个数字）与 ormUniforms
    // 原样跟过来了，所以静态克隆与底材编的是同一路补丁、同一份 cache key ——
    // 不然场景里同一块砖会出现「能打穿的那面有视差、不能打穿的那面没有」。
    // SSR 也跟底材的判定走：底材没挂（太糙）的话可裁切克隆也不该挂，
    // 否则同一块墙的完整版与破口版会是两套采样器预算。
    this._Inject(clone, {
      destruction: this.destruction,
      ssr: material.userData.ssrUniforms ? this.ssr : null,
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
    // 换类出来的那些 MeshPhysicalMaterial 是本库造的，跟着还；源材质属于资产
    // 加载器（外部 GLB 在多个关卡之间复用），一个都不许碰。
    for (const [source, upgraded] of this.upgradedExternal) {
      if (upgraded && upgraded !== source) upgraded.dispose();
    }
    this.upgradedExternal.clear();
    for (const texture of this.shadingTextures || []) texture.dispose();
    this.shadingTextures = null;
    this.shadingMapsReady = false;
    this.baked.clear();
    this.materials.clear();
    this.staticMaterials.clear();
  }
}
