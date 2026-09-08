// 《台儿庄：血战滕县》簇状前向光照（Clustered Forward Shading）。
//
// ## 它解决的那条实测
// 2026-09 之前，全城同时能亮的动态光**一共 6 盏**（`EFFECT_LIGHT_COUNT.high`）。
// 不是美术选的，是 three 的账：场景里每多一盏 visible 的 `PointLight`，
// `NUM_POINT_LIGHTS` 就变一次，整座城的 `MeshStandardMaterial` 全部重编译
// （几百毫秒的硬卡顿）。所以灯池必须**定长**，逻辑火源再多也只有前 6 名进 GPU。
// 后果在夜战和燃烧的街道上一眼可见：第七处火只有粒子，地面上没有光。
//
// ## 做法（Olsson 2012 / Persson 2013 / UE Forward+ 同一套）
//   1. 视锥切成 tilesX × tilesY × slices 个**簇**，深度按指数分布（近密远疏）；
//   2. CPU 每帧把每盏灯的包围球分配到它覆盖的簇里，产出两张表：
//      簇表（每簇一个 `offset<<8 | count`）与光索引表；
//   3. **一张** RGBA32F DataTexture 上传（簇表 / 光索引 / 光源数据 三段拼在一块内存里，
//      整数那两段贴着 float 的位型存；2026-09 集成期为了 16 个纹素单元的硬预算合并的）；
//   4. 材质补丁在 `<lights_fragment_begin>` 之后接一段循环：由 `gl_FragCoord`
//      与线性视深算出簇号，只对**这一簇里登记过的灯**算 `RE_Direct`。
//
// 场景里于是**一盏 three 的 `PointLight` 都不放**（`NUM_POINT_LIGHTS = 0`），
// 开灯关灯只是改纹理内容，不碰 defines，也就不会重编译。
//
// ## 与三方前向 PBR 的一致性（有意逐字对齐，不是「差不多」）
//   · 光源位置存**视空间** —— 与 `WebGLLights.setupView` 给 `pointLights[i].position`
//     的口径相同，着色端 `lVector = pos - geometryPosition` 一模一样；
//   · 衰减直接调 three 的 `getDistanceAttenuation(d, cutoff, 2.0)`（逆平方 +
//     `pow2(saturate(1 - pow4(d/cutoff)))` 的窗口函数），聚光调
//     `getSpotAttenuation(coneCos, penumbraCos, angleCos)`；两个函数都在
//     `lights_pars_begin` 的**无条件段**里，`NUM_POINT_LIGHTS = 0` 时照样存在；
//   · 颜色存 `color × intensity`（three 的 `uniforms.color.copy(light.color)
//     .multiplyScalar(light.intensity)`）；
//   · 最后调的是同一个 `RE_Direct` 宏，所以能量、菲涅尔、各向异性全部走材质
//     自己的 BRDF，不是另写一份 Lambert。
//
// ## 已知近似（都是有意的）
//   · 簇用 AABB 而不是精确棱台（多算进来的灯被逆平方压成 0，画面无差别）；
//   · 局部光**不投影**。只有「英雄光」那一盏可以退回三方 `PointLight`
//     走立方体阴影（`Data_Tuning_Lights.heroShadow`，出厂关，账见 docs）；
//   · 簇网格用 `camera.projectionMatrix` 现取，TAA 抖动逐帧对齐；但簇分配
//     用的是**上一次 Update 的相机**，同一帧里预通道与主场景共用一份表。
//
// ## 坑（踩过的）
//   · `usampler2D` 在 GLSL ES 3.00 里**没有默认精度**，必须写 `highp`；
//   · 编译失败 three 只在控制台留一行，那一趟什么都不画 —— 验收必须读回像素；
//   · GLSL ES 3.00 保留字：`sample` / `filter` / `input` / `output` / `patch` /
//     `resource` / `active` / `common` / `partition`。这里所有标识符都带
//     `cluster` 前缀，顺手避开。

import * as THREE from "three";
import {
  ClusterGrid, ConeBoundingSphere, LIGHT_TYPE, LIGHT_DECAY,
  CLUSTER_NEAR, CLUSTER_DATA_TEX_WIDTH, MakeClusterTier,
} from "./Data_Tuning_Lights.mjs";

/** 一帧最多接收多少个候选光源（超出的按分数丢掉，不扩容、不 GC）。 */
const MAX_SOURCES = 512;
/**
 * 簇分配时给包围球留的余量。
 *
 * 由头：簇网格用的是 `camera.projectionMatrix` —— 而 TAA 的子像素抖动是
 * `post.Render` 里才上的（`TaaPass.ApplyJitter`），所以 CPU 侧那份矩阵比
 * 光栅化实际用的少半个像素的离轴。差值只在 tile 边界上体现，最坏情况是
 * 「某个片元查到的簇里少了一盏刚好擦着边的灯」；那盏灯在那里的贡献本来就
 * 被 `pow2(saturate(1 - pow4(d/cutoff)))` 压到 0 附近。2% 的半径余量比
 * 「把抖动也搬到 CPU 侧」便宜得多，也不会让簇里多出有意义的灯。
 */
const RADIUS_MARGIN = 1.02;
/** 光源数据表每盏灯占几个纹素。 */
const TEXELS_PER_LIGHT = 4;

// ---------------------------------------------------------------------------
// 全局现役实例
//
// 材质补丁是在**材质创建时**装上的，而簇系统是 LightRig 构造出来的；两者的
// 构造顺序在正片（先 MaterialLibrary 后 LightRig）与探针页里都是「材质在前」。
// 与其把 cluster 一路穿过 MaterialLibrary / ActorFactory / Cutscene 的签名，
// 不如让补丁在**编译那一刻**现问一次 —— 补丁的 key / uniforms / fragment 都
// 支持函数形式，本来就是为这种运行时状态留的口子。
// ---------------------------------------------------------------------------
let activeClusteredLights = null;

/** 登记现役簇光系统（LightRig 构造时调）。传 null 注销。 */
export function SetActiveClusteredLights(instance) {
  activeClusteredLights = instance || null;
  return activeClusteredLights;
}

/** 当前现役的簇光系统；没有就返回 null（材质补丁据此整段不编译）。 */
export function GetActiveClusteredLights() {
  return activeClusteredLights;
}

// ---------------------------------------------------------------------------
// GLSL
// ---------------------------------------------------------------------------

/**
 * `<common>` 段：uniform 声明。
 * `uClusterParams.w` 是**运行时**开关（0/1），不是编译期的 —— 打开或关掉
 * 一盏灯、甚至整套簇光，都不许改 defines（那会触发整城重编译）。
 */
export const CLUSTER_COMMON_GLSL = /* glsl */`
uniform highp sampler2D uClusterData;
uniform vec4 uClusterParams;
uniform vec4 uClusterDepth;
uniform vec2 uClusterScreen;
// x = 索引带的起始**分量号** y = 光源数据带的起始**纹素号**
uniform vec2 uClusterBands;

// 分量寻址：一张 RGBA32F 里的第 n 个 32 位格。簇表与索引存的是整数，
// 贴着 float 的位型放进去（floatBitsToUint 取回）—— 因为三张表合并成一张是
// 采样器预算的硬需求（见 docs §1.8 的采样器预算表），而光源数据必须保持
// 「一个 texelFetch 拿一个 vec4」（它在最内层循环里，拆成四次标量取样会真的贵）。
uint ClusterUnit(int unit) {
  int clusterTexel = unit >> 2;
  return floatBitsToUint(texelFetch(uClusterData,
      ivec2(clusterTexel & 1023, clusterTexel >> 10), 0)[unit & 3]);
}

// 整个纹素（光源数据带用，一次取样拿四个 float）。
vec4 ClusterTexel(int clusterTexel) {
  return texelFetch(uClusterData, ivec2(clusterTexel & 1023, clusterTexel >> 10), 0);
}`;

/**
 * `<lights_fragment_begin>` 之后那段循环。
 *
 * `maxPerCluster` 只做循环上界（编译期常量，让驱动知道展开到哪）；实际循环
 * 次数是簇表里的 count。
 */
export function ClusterLoopGlsl(maxPerCluster) {
  const bound = Math.max(1, Math.min(255, maxPerCluster | 0));
  return /* glsl */`
#if defined( RE_Direct )
if (uClusterParams.w > 0.5) {
  float clusterViewDepth = max(-geometryPosition.z, uClusterDepth.z);
  int clusterTilesX = int(uClusterParams.x);
  int clusterTileX = clamp(int(gl_FragCoord.x * uClusterScreen.x), 0, clusterTilesX - 1);
  int clusterTileY = clamp(int(gl_FragCoord.y * uClusterScreen.y), 0, int(uClusterParams.y) - 1);
  int clusterSlice = clamp(int(floor(log(clusterViewDepth) * uClusterDepth.x + uClusterDepth.y)),
                           0, int(uClusterParams.z) - 1);
  uint clusterCell = ClusterUnit(
      (clusterSlice * int(uClusterParams.y) + clusterTileY) * clusterTilesX + clusterTileX);
  uint clusterOffset = clusterCell >> 8u;
  int clusterCount = int(clusterCell & 255u);
  IncidentLight clusterLight;
  for (int clusterIter = 0; clusterIter < ${bound}; clusterIter ++) {
    if (clusterIter >= clusterCount) break;
    uint clusterSlot = clusterOffset + uint(clusterIter);
    // 索引是 16 位，两个塑进一个 32 位格（小端：偶号在低半）。
    uint clusterPair = ClusterUnit(int(uClusterBands.x) + int(clusterSlot >> 1u));
    int clusterId = int((clusterSlot & 1u) == 0u ? (clusterPair & 65535u) : (clusterPair >> 16u));
    int clusterTexel0 = int(uClusterBands.y) + clusterId * ${TEXELS_PER_LIGHT};
    vec4 clusterT0 = ClusterTexel(clusterTexel0);
    vec3 clusterVector = clusterT0.xyz - geometryPosition;
    float clusterRange = abs(clusterT0.w);
    // t0.w 的**符号**就是「是不是纯点光」：正 = 点光（绝大多数），负 = 聚光/管光。
    // 簇的包围盒是保守的，一簇里有相当一部分灯对某个片元其实已经出了截断距离；
    // 窗口函数 pow2(saturate(1 - pow4(d/cutoff))) 在 d ≥ cutoff 处恒为 0，
    // 所以点光可以在**取颜色那一次 texelFetch 之前**就退掉，连整个 BRDF 一起省。
    // 聚光/管光的有效范围与代表点/锥有关，不能这么早退。
    if (clusterT0.w > 0.0 && dot(clusterVector, clusterVector) >= clusterRange * clusterRange) continue;
    vec4 clusterT1 = ClusterTexel(clusterTexel0 + 1);
    float clusterKind = clusterT1.w;
    if (clusterKind > 1.5) {
      // 管状光：把着色点投到线段上取最近点当代表点（Karis 2013 representative point）。
      // 面积光的正解要积分整条线段，代表点法是电影级引擎里通用的一档近似：
      // 高光形状会略短，漫反射几乎无差别，而成本只是一次 dot + 一次 clamp。
      vec4 clusterT2 = ClusterTexel(clusterTexel0 + 2);
      vec4 clusterT3 = ClusterTexel(clusterTexel0 + 3);
      float clusterAlong = clamp(-dot(clusterVector, clusterT2.xyz), -clusterT3.z, clusterT3.z);
      clusterVector += clusterT2.xyz * clusterAlong;
    }
    float clusterDist = length(clusterVector);
    clusterLight.direction = clusterVector / max(clusterDist, 1e-4);
    clusterLight.color = clusterT1.rgb
      * getDistanceAttenuation(clusterDist, clusterRange, ${LIGHT_DECAY.toFixed(1)});
    if (clusterKind > 0.5 && clusterKind < 1.5) {
      vec4 clusterT2 = ClusterTexel(clusterTexel0 + 2);
      vec4 clusterT3 = ClusterTexel(clusterTexel0 + 3);
      clusterLight.color *= getSpotAttenuation(clusterT2.w, clusterT3.x,
          dot(clusterLight.direction, clusterT2.xyz));
    }
    clusterLight.visible = clusterLight.color != vec3(0.0);
    if (clusterLight.visible) {
      RE_Direct(clusterLight, geometryPosition, geometryNormal, geometryViewDir,
                geometryClearcoatNormal, material, reflectedLight);
    }
  }
}
#endif`;
}

/**
 * 在一份 uniforms 上建齐簇光要的条目并接上纹理。
 * **共享同一批 `{value}` 对象**：簇系统换纹理（改分辨率/画质档）时所有材质
 * 一起跟上，不必逐材质重接。
 */
export function BindClusterUniforms(uniforms, cluster) {
  if (!cluster) return uniforms;
  const u = cluster.uniforms;
  uniforms.uClusterData = u.uClusterData;
  uniforms.uClusterBands = u.uClusterBands;
  uniforms.uClusterParams = u.uClusterParams;
  uniforms.uClusterDepth = u.uClusterDepth;
  uniforms.uClusterScreen = u.uClusterScreen;
  return uniforms;
}

// ---------------------------------------------------------------------------
// 主体
// ---------------------------------------------------------------------------

export class ClusteredLights {
  /**
   * @param {object} [options]
   * @param {string} [options.quality] 画质档名（决定 CLUSTER_TIERS 那一档）
   * @param {object} [options.tier] 直接给一份档位（测试用；给了就不查表）
   */
  constructor({ quality = "high", tier = null } = {}) {
    this.quality = quality;
    this.tier = tier ? { ...tier } : MakeClusterTier(quality);
    this.enabled = this.tier.enabled !== false;

    this.grid = new ClusterGrid({
      tilesX: this.tier.tilesX, tilesY: this.tier.tilesY, slices: this.tier.slices,
      near: CLUSTER_NEAR, far: this.tier.far, maxIndices: this.tier.maxIndices,
    });
    this.maxLights = Math.max(1, Math.min(1024, this.tier.maxLights | 0));

    // --- 每帧的候选源（预分配，零 GC）-------------------------------------
    // 步长 12：世界 xyz / 线性 rgb（含强度）/ 半径 / 类型 / 世界方向 xyz（聚光轴或管轴）
    this.sourceData = new Float32Array(MAX_SOURCES * 12);
    // 步长 3：coneCos / penumbraCos / 管长半值
    this.sourceShape = new Float32Array(MAX_SOURCES * 3);
    this.sourceScore = new Float32Array(MAX_SOURCES);
    this.sourceOrder = new Int32Array(MAX_SOURCES);
    this.sourceCount = 0;

    // --- 送进 GPU 的那一批 -------------------------------------------------
    this.spheres = new Float64Array(this.maxLights * 4);   // 视空间 x,y,深度,半径
    this.selected = new Int32Array(this.maxLights);
    this.activeCount = 0;

    // --- 一张表（采样器预算）-------------------------------------------
    // 2026-09 集成期把**三张 DataTexture 合成一张** RGBA32F：
    // 八个子系统合流之后，静态墙材质在 ANGLE-D3D11 的 16 个纹素单元上超了线，
    // 而超了之后程序不链接、那只材质整只不画（口径与预算表见
    // docs/Data_TechRenderPipeline.md §1.8）。这里省下的两个单元是性价比最高的一笔。
    //
    // 布局（单位是**分量**，即 4 字节一格；纹素宽 1024，每行 4096 分量）：
    //   [0, clusterCount)                 簇表（uint32：offset<<8 | count）
    //   [indexBase, +ceil(maxIndices/2))  光索引（两个 16 位塑一格，与旧的 R16UI 等量）
    //   [lightBase, +maxLights*16)        光源数据（float，四个分量一个 texel）
    // 整数带贴着 float 的位型存（着色端 `floatBitsToUint` 取回）—— 这样光源数据
    // 仍然是「一次 texelFetch 拿一个 vec4」，最内层循环的取样次数一次都没多。
    // 每帧上传量与三张表时代相同（ultra 约 450 KB）。
    const indexUnits = Math.ceil(this.grid.maxIndices / 2);
    const indexBase = this.grid.clusterCount;
    // 光源数据带要对齐到 texel 边界（四个分量），不然 vec4 取样会错位。
    const lightBase = (indexBase + indexUnits + 3) & ~3;
    const lightUnits = this.maxLights * TEXELS_PER_LIGHT * 4;
    const rowUnits = CLUSTER_DATA_TEX_WIDTH * 4;
    const totalUnits = Math.ceil((lightBase + lightUnits) / rowUnits) * rowUnits;
    this.dataUnits = totalUnits;
    this.indexBase = indexBase;
    this.lightBase = lightBase;

    const buffer = new ArrayBuffer(totalUnits * 4);
    // 三段视图共用同一块内存：网格就地写自己那两段，零拷贝。
    this.grid.table = new Uint32Array(buffer, 0, this.grid.clusterCount);
    // 小端：偶号索引落在 uint32 的低 16 位，与着色端 `slot & 1u` 那一行对得上。
    this.grid.indices = new Uint16Array(buffer, indexBase * 4, indexUnits * 2);
    this.grid.maxIndices = indexUnits * 2;
    this.lightData = new Float32Array(buffer, lightBase * 4, lightUnits);
    this.dataArray = new Float32Array(buffer);

    this.dataTexture = new THREE.DataTexture(
      this.dataArray, CLUSTER_DATA_TEX_WIDTH, totalUnits / rowUnits,
      THREE.RGBAFormat, THREE.FloatType);
    // 浮点纹理的线性过滤要 OES_texture_float_linear，而我们是 texelFetch，
    // 本来也不该插值。
    this.dataTexture.minFilter = THREE.NearestFilter;
    this.dataTexture.magFilter = THREE.NearestFilter;
    this.dataTexture.generateMipmaps = false;
    this.dataTexture.colorSpace = THREE.NoColorSpace;
    this.dataTexture.needsUpdate = true;

    this.uniforms = {
      uClusterData: { value: this.dataTexture },
      // x = 索引带起始分量号 y = 光源数据带起始**纹素**号
      uClusterBands: { value: new THREE.Vector2(indexBase, lightBase >> 2) },
      // x=tilesX y=tilesY z=slices w=运行时开关
      uClusterParams: { value: new THREE.Vector4(
        this.grid.tilesX, this.grid.tilesY, this.grid.slices, 0) },
      // x=sliceScale y=sliceBias z=near w=far
      uClusterDepth: { value: new THREE.Vector4(
        this.grid.sliceScale, this.grid.sliceBias, this.grid.near, this.grid.far) },
      uClusterScreen: { value: new THREE.Vector2(
        this.grid.tilesX / 1920, this.grid.tilesY / 1080) },
    };

    this.width = 1920;
    this.height = 1080;
    this.frames = 0;
    this.buildMs = 0;
    // 上一帧的统计（画质面板 / 测试 / 报告读它）
    this.stats = {
      sources: 0, active: 0, indexCount: 0, occupied: 0,
      maxPerCluster: 0, meanPerOccupied: 0, meanPerCluster: 0, overflow: 0,
      buildMs: 0, clusters: this.grid.clusterCount,
    };
  }

  /** 主渲染靶尺寸。`gl_FragCoord → tile` 的换算靠它，改分辨率必须跟着改。 */
  SetViewport(width, height) {
    if (!(width > 0) || !(height > 0)) return;
    this.width = width; this.height = height;
    this.uniforms.uClusterScreen.value.set(this.grid.tilesX / width, this.grid.tilesY / height);
  }

  /** 运行时总闸。关掉之后着色器那段循环整条跳过（不改 defines、不重编译）。 */
  SetEnabled(on) {
    this.enabled = !!on && this.tier.enabled !== false;
    if (!this.enabled) this.uniforms.uClusterParams.value.w = 0;
    return this.enabled;
  }

  /** 一帧的开始：清空候选源。 */
  BeginFrame() {
    this.sourceCount = 0;
  }

  _PushSource(x, y, z, r, g, b, radius, type, dx, dy, dz, coneCos, penumbraCos, halfLength, score) {
    if (this.sourceCount >= MAX_SOURCES) return -1;
    const i = this.sourceCount;
    const o = i * 12;
    const d = this.sourceData;
    d[o] = x; d[o + 1] = y; d[o + 2] = z;
    d[o + 3] = r; d[o + 4] = g; d[o + 5] = b;
    d[o + 6] = radius; d[o + 7] = type;
    d[o + 8] = dx; d[o + 9] = dy; d[o + 10] = dz;
    const s = i * 3;
    this.sourceShape[s] = coneCos;
    this.sourceShape[s + 1] = penumbraCos;
    this.sourceShape[s + 2] = halfLength;
    this.sourceScore[i] = score;
    this.sourceCount = i + 1;
    return i;
  }

  /** 点光。`color` 是线性 rgb **已乘强度**（与 three 的 uniforms.color 同口径）。 */
  AddPoint(x, y, z, r, g, b, radius, score = 0) {
    return this._PushSource(x, y, z, r, g, b, radius, LIGHT_TYPE.POINT, 0, 0, 1, -1, -1, 0, score);
  }

  /**
   * 聚光。`dx,dy,dz` 是**光束朝向**（灯 → 照射方向）；内部按 three 的口径
   * 取反存进纹理（three 的 `spotLight.direction` 是「靶点 → 灯」）。
   */
  AddSpot(x, y, z, r, g, b, radius, dx, dy, dz, coneCos, penumbraCos, score = 0) {
    const len = Math.hypot(dx, dy, dz) || 1;
    return this._PushSource(x, y, z, r, g, b, radius, LIGHT_TYPE.SPOT,
      -dx / len, -dy / len, -dz / len, coneCos, penumbraCos, 0, score);
  }

  /** 管状光（代表点近似）。`dx,dy,dz` 是管轴，`halfLength` 是半长（米）。 */
  AddTube(x, y, z, r, g, b, radius, dx, dy, dz, halfLength, score = 0) {
    const len = Math.hypot(dx, dy, dz) || 1;
    return this._PushSource(x, y, z, r, g, b, radius, LIGHT_TYPE.TUBE,
      dx / len, dy / len, dz / len, -1, -1, Math.max(0, halfLength), score);
  }

  /**
   * 一帧的结束：选灯 → 转视空间 → 建簇表 → 上传。
   *
   * @param {THREE.Camera} camera 本帧出画的相机（必须是透视相机）
   * @param {number} [width] 主靶宽（不传就沿用上次 SetViewport）
   * @param {number} [height] 主靶高
   */
  EndFrame(camera, width = 0, height = 0) {
    this.frames += 1;
    if (width > 0 && height > 0) this.SetViewport(width, height);
    const params = this.uniforms.uClusterParams.value;
    if (!this.enabled || !camera || !camera.isPerspectiveCamera) {
      params.w = 0;
      this.activeCount = 0;
      this.stats.sources = this.sourceCount;
      this.stats.active = 0;
      return this.stats;
    }

    // [1] 选前 maxLights 名。分数由调用方（LightRig）按镜头贡献 × 优先级算好。
    const count = this.sourceCount;
    const order = this.sourceOrder;
    for (let i = 0; i < count; i += 1) order[i] = i;
    let take = count;
    if (count > this.maxLights) {
      // 只要前 N 名，用部分选择排序：N ≤ 128，count 通常几十，比全排序便宜，
      // 而且**零分配**（Array.prototype.sort 会为比较器建闭包帧）。
      take = this.maxLights;
      for (let i = 0; i < take; i += 1) {
        let best = i;
        for (let j = i + 1; j < count; j += 1) {
          if (this.sourceScore[order[j]] > this.sourceScore[order[best]]) best = j;
        }
        if (best !== i) { const t = order[i]; order[i] = order[best]; order[best] = t; }
      }
    }

    // [2] 世界 → 视空间。矩阵元素直接取，避免每盏灯 new 一个 Vector3。
    camera.updateMatrixWorld();
    const e = camera.matrixWorldInverse.elements;
    const data = this.sourceData;
    const shape = this.sourceShape;
    const out = this.lightData;
    const spheres = this.spheres;
    let active = 0;
    for (let n = 0; n < take; n += 1) {
      const src = order[n];
      const o = src * 12;
      const radius = data[o + 6];
      if (!(radius > 0)) continue;
      const cr = data[o + 3], cg = data[o + 4], cb = data[o + 5];
      if (cr <= 0 && cg <= 0 && cb <= 0) continue;
      const wx = data[o], wy = data[o + 1], wz = data[o + 2];
      const vx = e[0] * wx + e[4] * wy + e[8] * wz + e[12];
      const vy = e[1] * wx + e[5] * wy + e[9] * wz + e[13];
      const vz = e[2] * wx + e[6] * wy + e[10] * wz + e[14];
      // 方向是向量，不吃平移
      const wdx = data[o + 8], wdy = data[o + 9], wdz = data[o + 10];
      const vdx = e[0] * wdx + e[4] * wdy + e[8] * wdz;
      const vdy = e[1] * wdx + e[5] * wdy + e[9] * wdz;
      const vdz = e[2] * wdx + e[6] * wdy + e[10] * wdz;

      const type = data[o + 7];
      const s = src * 3;
      // 包围球：点光就是它自己；聚光取球扇形的最小包围球；管光把半长加进半径。
      let bx = vx, by = vy, bz = vz, br = radius;
      if (type === LIGHT_TYPE.SPOT) {
        // vdx.. 存的是「靶点 → 灯」，光束方向要取反
        const sphere = ConeBoundingSphere(radius, shape[s]);
        bx = vx - vdx * sphere.along;
        by = vy - vdy * sphere.along;
        bz = vz - vdz * sphere.along;
        br = sphere.radius;
      } else if (type === LIGHT_TYPE.TUBE) {
        br = radius + shape[s + 2];
      }

      const slot = active * TEXELS_PER_LIGHT * 4;
      // t0.w 带符号：正 = 纯点光（着色端可以提前退），负 = 聚光/管光。
      out[slot] = vx; out[slot + 1] = vy; out[slot + 2] = vz;
      out[slot + 3] = type === LIGHT_TYPE.POINT ? radius : -radius;
      out[slot + 4] = cr; out[slot + 5] = cg; out[slot + 6] = cb; out[slot + 7] = type;
      out[slot + 8] = vdx; out[slot + 9] = vdy; out[slot + 10] = vdz; out[slot + 11] = shape[s];
      out[slot + 12] = shape[s + 1]; out[slot + 13] = 0; out[slot + 14] = shape[s + 2]; out[slot + 15] = 0;

      const so = active * 4;
      spheres[so] = bx; spheres[so + 1] = by; spheres[so + 2] = -bz;
      spheres[so + 3] = br * RADIUS_MARGIN;
      this.selected[active] = src;
      active += 1;
      if (active >= this.maxLights) break;
    }
    // 剩下的槽位清零：着色端不会读到它们（簇表里没有索引），但留着上一帧的
    // 残值会让「读回光源数据表」这类取证误判。
    for (let i = active; i < this.maxLights; i += 1) {
      out.fill(0, i * TEXELS_PER_LIGHT * 4, (i + 1) * TEXELS_PER_LIGHT * 4);
    }
    this.activeCount = active;

    // [3] 建簇表
    const pe = camera.projectionMatrix.elements;
    this.grid.SetProjection(pe[0], pe[5], pe[8], pe[9]);
    const gridStats = this.grid.Build(spheres, active);

    // [4] 上传。三段在同一块内存里，一次传完（ultra 约 450 KB，与三张表时代相同）——
    // three 对已分配过的 DataTexture 走 texSubImage2D，不重新分配显存。
    this.dataTexture.needsUpdate = true;

    params.set(this.grid.tilesX, this.grid.tilesY, this.grid.slices, active > 0 ? 1 : 0);
    const depth = this.uniforms.uClusterDepth.value;
    depth.set(this.grid.sliceScale, this.grid.sliceBias, this.grid.near, this.grid.far);

    const stats = this.stats;
    stats.sources = count;
    stats.active = active;
    stats.indexCount = gridStats.indexCount;
    stats.occupied = gridStats.occupied;
    stats.maxPerCluster = gridStats.maxPerCluster;
    stats.meanPerOccupied = gridStats.meanPerOccupied;
    stats.meanPerCluster = gridStats.meanPerCluster;
    stats.overflow = gridStats.overflow;
    stats.buildMs = gridStats.buildMs;
    stats.clusters = this.grid.clusterCount;
    this.buildMs = gridStats.buildMs;
    return stats;
  }

  /**
   * 当前这一批光源（**世界坐标**）。给体积雾 / 大气代理用：它们在世界空间
   * raymarch，拿不到视空间的表。
   *
   * 返回的是新建的普通对象数组（每帧调一次的取证接口，不是热路径）。
   */
  GetClusterLightData() {
    const list = [];
    const data = this.sourceData;
    const shape = this.sourceShape;
    for (let i = 0; i < this.activeCount; i += 1) {
      const src = this.selected[i];
      const o = src * 12, s = src * 3;
      const type = data[o + 7];
      list.push({
        index: i,
        type: type === LIGHT_TYPE.SPOT ? "spot" : (type === LIGHT_TYPE.TUBE ? "tube" : "point"),
        position: [data[o], data[o + 1], data[o + 2]],
        color: [data[o + 3], data[o + 4], data[o + 5]],
        radius: data[o + 6],
        // 聚光存的是「靶点 → 灯」，这里还原成光束朝向，消费方不必再猜符号
        direction: type === LIGHT_TYPE.POINT ? null
          : (type === LIGHT_TYPE.SPOT
            ? [-data[o + 8], -data[o + 9], -data[o + 10]]
            : [data[o + 8], data[o + 9], data[o + 10]]),
        coneCos: type === LIGHT_TYPE.SPOT ? shape[s] : -1,
        penumbraCos: type === LIGHT_TYPE.SPOT ? shape[s + 1] : -1,
        halfLength: type === LIGHT_TYPE.TUBE ? shape[s + 2] : 0,
        score: this.sourceScore[src],
        decay: LIGHT_DECAY,
      });
    }
    return {
      enabled: this.enabled && this.uniforms.uClusterParams.value.w > 0.5,
      quality: this.quality,
      maxLights: this.maxLights,
      grid: {
        tilesX: this.grid.tilesX, tilesY: this.grid.tilesY, slices: this.grid.slices,
        near: this.grid.near, far: this.grid.far, clusters: this.grid.clusterCount,
      },
      stats: { ...this.stats },
      lights: list,
    };
  }

  Dispose() {
    this.dataTexture.dispose();
    if (activeClusteredLights === this) activeClusteredLights = null;
  }
}

// ---------------------------------------------------------------------------
// Debug Rendering 的两层叠加
// ---------------------------------------------------------------------------

// 与 `Script_PostCommon.VERT_QUAD` 同一份写法：不设 glslVersion，让 three 自己
// 前置 `#version 300 es` 与 `varying` / `texture2D` / `gl_FragColor` 的兼容 define。
// 设了 GLSL3 就得自己写 `layout(location = 0) out vec4`，白担一份风险。
// `usampler2D` / `texelFetch` / `uint` 在这条路上照常可用（本来就是 ES 3.00）。
const HEAT_VERT = /* glsl */`
varying vec2 vClusterUv;
void main() {
  vClusterUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

/**
 * 簇灯数热图。
 *
 * 它是**叠加层**不是调试视图：Debug Rendering 的视图那条路要在
 * `Script_PostDebug.GetSource()` 里加 case，那个文件归后处理帧图，不是这里的
 * 地盘。叠加层走 `post.AddDebugOverlay`，画进 hdr 靶（TAA 之前），配合面板把
 * 视图切到「HDR 场景」就能拿到不过合成链的原图。
 *
 * 「HDR 场景」那一档是 Reinhard + sRGB（`Script_PostDebug` 的 uMode 4），
 * 所以这里输出 `L/(1-L)` 反解一次，屏幕上拿到的正是这条色标本身。
 */
export function MakeClusterHeatOverlay(cluster) {
  const uniforms = {
    uClusterNormalDepth: { value: null },
    uClusterHeatScale: { value: 8 },
    uClusterHeatAlpha: { value: 0.92 },
  };
  BindClusterUniforms(uniforms, cluster);
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: HEAT_VERT,
    fragmentShader: /* glsl */`
${CLUSTER_COMMON_GLSL}
uniform sampler2D uClusterNormalDepth;
uniform float uClusterHeatScale;
uniform float uClusterHeatAlpha;
varying vec2 vClusterUv;

vec3 ClusterHeatRamp(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c = mix(vec3(0.02, 0.05, 0.30), vec3(0.02, 0.55, 0.55), smoothstep(0.0, 0.28, t));
  c = mix(c, vec3(0.10, 0.72, 0.12), smoothstep(0.25, 0.52, t));
  c = mix(c, vec3(0.92, 0.80, 0.06), smoothstep(0.50, 0.76, t));
  c = mix(c, vec3(0.95, 0.10, 0.05), smoothstep(0.74, 1.0, t));
  return c;
}

void main() {
  float clusterViewDepth = texture2D(uClusterNormalDepth, vClusterUv).a;
  // 天空（预通道里被藏出去了，留的是 clear 值 0）不属于任何簇
  if (clusterViewDepth <= 0.0) discard;
  clusterViewDepth = max(clusterViewDepth, uClusterDepth.z);
  int clusterTilesX = int(uClusterParams.x);
  int clusterTileX = clamp(int(gl_FragCoord.x * uClusterScreen.x), 0, clusterTilesX - 1);
  int clusterTileY = clamp(int(gl_FragCoord.y * uClusterScreen.y), 0, int(uClusterParams.y) - 1);
  int clusterSlice = clamp(int(floor(log(clusterViewDepth) * uClusterDepth.x + uClusterDepth.y)),
                           0, int(uClusterParams.z) - 1);
  uint clusterCell = ClusterUnit(
      (clusterSlice * int(uClusterParams.y) + clusterTileY) * clusterTilesX + clusterTileX);
  float clusterCount = float(clusterCell & 255u);
  if (clusterCount <= 0.0) discard;
  vec3 heat = ClusterHeatRamp(clusterCount / max(uClusterHeatScale, 1.0));
  // 「HDR 场景」视图会做一次 Reinhard，这里先反解，屏幕上才是这条色标
  gl_FragColor = vec4(heat / max(1.0 - heat, 0.02), uClusterHeatAlpha);
}`,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  material.allowOverride = false;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.renderOrder = 9000;
  const root = new THREE.Group();
  root.matrixAutoUpdate = false;
  root.add(mesh);
  root.userData.clusterHeat = true;
  root.userData.uniforms = uniforms;
  root.userData.SetSource = (normalDepthTexture) => {
    uniforms.uClusterNormalDepth.value = normalDepthTexture || null;
  };
  root.userData.Dispose = () => {
    material.dispose();
    mesh.geometry.dispose();
  };
  return root;
}

/**
 * 光源球线框叠加层：每盏灯三个大圆（世界空间），聚光另加四根母线与锥口圆。
 * 线色按 1/曝光预补（与 ColliderWireframe 同一条账），夜战 3.6 与白天 0.5
 * 下亮度一致。
 */
export function MakeClusterSphereOverlay(cluster, { segments = 24 } = {}) {
  const maxLights = cluster ? cluster.maxLights : 64;
  // 每盏灯：3 个大圆（segments 段）+ 聚光的 4 根母线 + 锥口圆（segments 段）
  const perLight = (segments * 3 + segments) * 2 + 8;
  const capacity = maxLights * perLight;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(capacity * 3);
  const colors = new Float32Array(capacity * 3);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setDrawRange(0, 0);
  const material = new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.9,
    depthTest: false, depthWrite: false, toneMapped: false,
  });
  material.allowOverride = false;
  const lines = new THREE.LineSegments(geometry, material);
  lines.frustumCulled = false;
  lines.matrixAutoUpdate = false;
  const root = new THREE.Group();
  root.matrixAutoUpdate = false;
  root.add(lines);
  root.userData.PrepareDebugOverlay = ({ exposure }) => {
    material.color.setScalar(1 / Math.max(0.05, Math.min(20, exposure || 1)));
  };

  const axes = [[0, 1, 2], [1, 2, 0], [2, 0, 1]];
  root.userData.Update = () => {
    if (!cluster) { geometry.setDrawRange(0, 0); return; }
    const data = cluster.GetClusterLightData();
    let v = 0;
    const Push = (x, y, z, r, g, b) => {
      if (v >= capacity) return;
      positions[v * 3] = x; positions[v * 3 + 1] = y; positions[v * 3 + 2] = z;
      colors[v * 3] = r; colors[v * 3 + 1] = g; colors[v * 3 + 2] = b;
      v += 1;
    };
    for (const light of data.lights) {
      const [px, py, pz] = light.position;
      const radius = light.radius;
      // 线色 = 灯自己的颜色归一化（能看出是哪盏），聚光偏青
      const peak = Math.max(light.color[0], light.color[1], light.color[2], 1e-4);
      let cr = light.color[0] / peak, cg = light.color[1] / peak, cb = light.color[2] / peak;
      if (light.type === "spot") { cr = 0.35 * cr + 0.2; cg = 0.5 * cg + 0.45; cb = 0.5 * cb + 0.5; }
      const point = [0, 0, 0];
      for (const [a0, a1] of axes) {
        for (let i = 0; i < segments; i += 1) {
          for (const step of [i, (i + 1) % segments]) {
            const angle = (step / segments) * Math.PI * 2;
            point[0] = px; point[1] = py; point[2] = pz;
            point[a0] += Math.cos(angle) * radius;
            point[a1] += Math.sin(angle) * radius;
            Push(point[0], point[1], point[2], cr, cg, cb);
          }
        }
      }
      if (light.type === "spot" && light.direction) {
        const [dx, dy, dz] = light.direction;
        const sinHalf = Math.sqrt(Math.max(0, 1 - light.coneCos * light.coneCos));
        const rim = radius * sinHalf;
        const along = radius * light.coneCos;
        // 锥轴的一组正交基
        const upX = Math.abs(dy) > 0.95 ? 1 : 0, upY = Math.abs(dy) > 0.95 ? 0 : 1, upZ = 0;
        let ax = upY * dz - upZ * dy, ay = upZ * dx - upX * dz, az = upX * dy - upY * dx;
        const alen = Math.hypot(ax, ay, az) || 1;
        ax /= alen; ay /= alen; az /= alen;
        const bx = dy * az - dz * ay, by = dz * ax - dx * az, bz = dx * ay - dy * ax;
        const cx = px + dx * along, cy = py + dy * along, cz = pz + dz * along;
        for (let i = 0; i < segments; i += 1) {
          for (const step of [i, (i + 1) % segments]) {
            const angle = (step / segments) * Math.PI * 2;
            const co = Math.cos(angle) * rim, si = Math.sin(angle) * rim;
            Push(cx + ax * co + bx * si, cy + ay * co + by * si, cz + az * co + bz * si, cr, cg, cb);
          }
        }
        for (let i = 0; i < 4; i += 1) {
          const angle = (i / 4) * Math.PI * 2;
          const co = Math.cos(angle) * rim, si = Math.sin(angle) * rim;
          Push(px, py, pz, cr, cg, cb);
          Push(cx + ax * co + bx * si, cy + ay * co + by * si, cz + az * co + bz * si, cr, cg, cb);
        }
      }
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    geometry.setDrawRange(0, v);
  };
  root.userData.Dispose = () => { geometry.dispose(); material.dispose(); };
  return root;
}
