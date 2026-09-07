// 《台儿庄：血战滕县》级联阴影（CSM）+ 接触硬化软阴影（PCSS）。
//
// 对标：UE5 的 Dynamic CSM（practical split + 视锥切片包围球 + 光空间纹素吸附 +
// cascade fade）与 COD/Frostbite 那一路的 PCSS（blocker search → 半影估计 →
// 按半影缩放的 Vogel 盘 PCF + receiver-plane 深度偏置）。本仓零 addon，
// **不用 three 的 CSM addon**（vendor 里也没有 examples/jsm 的它）。
//
// ## 一句话架构
// N 盏同方向 `DirectionalLight` 各持一张阴影图（three 自己的 `WebGLShadowMap`
// 照常烘），**整段替换 `ShaderChunk.lights_fragment_begin` 里的平行光循环**，
// 按片元自己落在哪张图里选级、过渡带混合、只让一级贡献直射太阳。
//
// ## 为什么是「替换 chunk」而不是「材质补丁」
// 材质补丁只覆盖走 `MaterialLibrary` 那条路的材质（白盒关卡、破口碎块、过场
// 自建的 MeshStandardMaterial 都不走）。而 N 盏灯是**全局**的：漏掉一份材质，
// 那份材质就吃 N 份太阳，画面当场过曝。chunk 是 three 导出的可变对象，
// 换掉它 = 每一份内置光照材质都跟着改，一份都漏不掉。
// **必须在任何材质编译之前做一次**（模块顶层 + LightRig 构造时按档位重生成）。
//
// ## 零额外 uniform 的选级
// 级联要的东西 three 已经逐灯上传了：`vDirectionalShadowCoord[i]`（顶点着色器
// 里按**逐级** `shadowNormalBias` 推过法线的阴影坐标）、`directionalShadowMap[i]`、
// `directionalLightShadows[i]`（bias / normalBias / radius / intensity / mapSize）。
// 唯一缺的是「这一级铺了多少米」，而它能从 `directionalShadowMatrix[i]` 的行长度
// 反解出来（正交矩阵：第 0 行的模 = 1/覆盖宽度，第 2 行的模 = 1/深度范围）——
// 那张矩阵三方本来就上传给顶点着色器，这里只是在**片元**着色器里也声明一次。
// 于是整套 CSM + PCSS 不需要任何自备 uniform，接谁都不会漏。
//
// 选级用**纹理空间**而不是视深：包围球封顶（`Data_Tuning_Shadows.maxRadius`）之后
// 「本级铺到多远」不再是一个常数，只有图自己知道。按覆盖选，级与图永远一致。
//
// ## 能量守恒
// N 盏灯里**只有第 0 盏有强度**，1..N-1 的 `intensity = 0`，它们只是「阴影图的容器」。
// 这样即使某条路径没走到本文件的代码（比如玩家关掉阴影 → `USE_SHADOWMAP` 消失
// → 落回 three 原版循环），太阳也永远只有一份。这是本设计的安全网，别把它删了。
//
// ## r185 源码核实过的两条
//   · `WebGLShadowMap.renderObject( scene, camera, shadow.camera, light, type )` 里
//     的可见性判据是 `object.layers.test( camera.layers )` —— **camera 是主视图相机，
//     不是阴影相机**。所以「给远级的阴影相机关掉某个层来剔除小投影体」在 r185
//     行不通（任务书里那条要求先核实，核实结果是否定的）。远级的成本改用
//     **一帧只烘一张**（`shadow.autoUpdate = false` + 自己按 `bakeOrder` 点
//     `needsUpdate`）来压，那条早退在源码里是
//     `if ( shadow.autoUpdate === false && shadow.needsUpdate === false ) continue;`。
//     为什么必须一帧一张：城里每趟阴影烘焙有 ~1.45 M 三角的地板（BuildSink 合批块
//     剔不掉），而单帧三角红线只剩 2.59 M 余量。账在 Data_Tuning_Shadows 抬头。
//   · `PCFSoftShadowMap` 在 r185 会被 `WebGLShadowMap.render` 当场警告并改成
//     `PCFShadowMap`；`shadowMapTypeDefines` 只有 PCF 与 VSM 两个 key。
//
// ## 采样口径：BasicShadowMap（裸深度）
// PCSS 的 blocker search 必须**读到深度值**，而 `PCFShadowMap` 下 three 给
// `depthTexture` 设了 `compareFunction = LessEqualCompare`，它是 shadow 采样器纹理，
// 只能比较不能读。所以整局走 `BasicShadowMap`：`compareFunction = null`、
// `NearestFilter`、`uniform sampler2D directionalShadowMap[]`，双线性 PCF / 半影
// 估计 / receiver-plane 偏置全部自己写（这也正是 3A 引擎的做法）。
// 本文件同时保留 `SHADOWMAP_TYPE_PCF` 分支：别的页面（`Script_InfantryAnimationTest`）
// 用默认的 PCF 档，那里走硬件比较 + 固定盘，级联照常工作，只是没有接触硬化。

import * as THREE from "three";
import {
  SHADOW_COMMON, MakeShadowPreset, CascadeSplits, SliceBoundingSphere,
} from "./Data_Tuning_Shadows.mjs";

/** 级联上限。超过 4 的话 `vDirectionalShadowCoord` 的 varying 与采样器压力都不划算。 */
export const CSM_MAX_CASCADES = 4;

/**
 * 全局阴影图类型。**改它要连着改 `SUN_SHADOW_SAMPLER_GLSL` 的采样器类型**，
 * 两边必须一致，否则用 `sampler2D` 绑一张带 compareFunction 的纹理 = 未定义行为
 * （多数驱动整片返回 0，表现是全屏死黑的阴影）。
 */
export const SHADOW_MAP_TYPE = THREE.BasicShadowMap;

/** `SHADOW_MAP_TYPE === BasicShadowMap` 时为真：能拿到裸深度，PCSS 可用。 */
export const CSM_RAW_DEPTH = SHADOW_MAP_TYPE === THREE.BasicShadowMap
  || SHADOW_MAP_TYPE === THREE.VSMShadowMap;

/** 把渲染器切到本模块要的阴影口径。LightRig 构造时替调用方做掉。 */
export function ApplyRendererShadowSettings(renderer) {
  if (!renderer || !renderer.shadowMap) return;
  renderer.shadowMap.type = SHADOW_MAP_TYPE;
  // 阴影图一帧只烘一次：一帧里 renderer.render 要跑二十几次（预通道 + 主场景 +
  // GI 的探针四边形），autoUpdate = true 等于每次都重烘一遍。逐级节流由
  // CsmRig.ScheduleShadowUpdate 点 needsUpdate。
  renderer.shadowMap.autoUpdate = false;
}

// ===========================================================================
// GLSL
// ===========================================================================

const TWO_PI = 6.283185307179586;

/** 太阳半影系数：每米「遮挡体—接收面」间距张开多少米半影。 */
function SunPenumbraPerMeter() {
  return 2 * Math.tan(THREE.MathUtils.degToRad(SHADOW_COMMON.sunAngularDiameterDeg * 0.5));
}

function F(value, digits = 6) {
  const text = Number(value).toFixed(digits);
  return text.includes(".") ? text : `${text}.0`;
}

/**
 * 追加进 `shadowmap_pars_fragment` 的那一段：级联采样的全部函数。
 * **整段自带 `#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0` 守卫**，
 * 所以是「追加」不是「改写三方的字」—— 三方换 chunk 内容也不会打架。
 */
function CsmParsGlsl(preset) {
  const cascades = Math.min(CSM_MAX_CASCADES, preset.cascades);
  const pcssLevels = CSM_RAW_DEPTH ? Math.min(cascades, preset.pcssLevels) : 0;
  const blockerTaps = Math.max(1, preset.blockerTaps | 0);
  const diskTaps = Math.max(1, preset.filterTaps | 0);
  const fade = Math.max(0.005, preset.fade);
  const penumbraPerMeter = SunPenumbraPerMeter();

  // 逐级派发：采样器数组只能用**常量下标**（GLSL ES 3.00），所以这里由 JS 展开
  // 成字面量分支。PCSS 只编进最近 pcssLevels 级 —— 远级的半影本来就比一个
  // 屏幕像素还宽，多跑一遍 blocker search 是白花钱。
  const Dispatch = (indexExpr, coordVar, planeVar) => {
    let out = "";
    for (let i = 0; i < cascades; i += 1) {
      const fn = i < pcssLevels ? "CsmEvaluatePcss" : "CsmEvaluateFixed";
      out += `
    #if NUM_DIR_LIGHT_SHADOWS > ${i}
    if ( ${indexExpr} == ${i} ) return ${fn}( directionalShadowMap[ ${i} ], directionalLightShadows[ ${i} ], directionalShadowMatrix[ ${i} ], ${coordVar}, ${planeVar} );
    #endif`;
    }
    return out;
  };

  let select = "";
  for (let i = 0; i < cascades; i += 1) {
    select += `
    #if NUM_DIR_LIGHT_SHADOWS > ${i}
    if ( csmLevel < 0 ) {
      vec4 raw = vDirectionalShadowCoord[ ${i} ];
      vec3 c = raw.xyz / raw.w;
      vec2 e = abs( c.xy - 0.5 );
      float m = max( e.x, e.y );
      if ( m < 0.5 && c.z >= 0.0 && c.z <= 1.0 ) {
        csmLevel = ${i};
        csmCoordNear = c;
        csmMix = clamp( ( m - CSM_FADE_START ) / CSM_FADE_WIDTH, 0.0, 1.0 );
      }
    } else if ( csmLevel == ${i - 1} ) {
      vec4 rawNext = vDirectionalShadowCoord[ ${i} ];
      vec3 cn = rawNext.xyz / rawNext.w;
      vec2 en = abs( cn.xy - 0.5 );
      if ( max( en.x, en.y ) < 0.5 && cn.z >= 0.0 && cn.z <= 1.0 ) {
        csmCoordFar = cn;
        csmHasFar = true;
      }
    }
    #endif`;
  }

  return /* glsl */`
#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0

// three 只在顶点着色器里声明这张矩阵（shadowmap_pars_vertex）。片元侧再声明一次
// 就能拿到「这一级铺了多少米、深度范围多少米」——正交矩阵行向量的模的倒数。
// 值由 WebGLRenderer 每帧写进 uniforms.directionalShadowMatrix（module 18251），
// 我们一个 uniform 都不用自己接。
uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];

#define CSM_FADE_WIDTH ${F(fade)}
#define CSM_FADE_START ${F(0.5 - fade)}
#define CSM_DISK_TAPS ${diskTaps}
#define CSM_BLOCKER_TAPS ${blockerTaps}
// 每米间距张开的半影（米）。见 Data_Tuning_Shadows.sunAngularDiameterDeg。
#define CSM_PENUMBRA_PER_METER ${F(penumbraPerMeter)}
#define CSM_SEARCH_MAX_METERS ${F(SHADOW_COMMON.blockerSearchMaxMeters)}
#define CSM_MAX_PENUMBRA_TEXELS ${F(SHADOW_COMMON.maxPenumbraTexels, 2)}

// 交错梯度噪声（Jimenez）。带 Csm 前缀是因为 three 只在 SHADOWMAP_TYPE_PCF 下
// 定义 interleavedGradientNoise / vogelDiskSample，BASIC 档根本没有那两个。
// 不掺帧序号：TAA 每帧抖动相机，同一个世界点落在不同的 gl_FragCoord 上，
// 时间上的样本轮换由它提供（three 内置的 getShadow 也是这么做的），
// 而画面仍然逐帧确定 —— 视觉审查靠逐轮截图比对，随机数会让比对失效。
float CsmIgn( vec2 position ) {
  return fract( 52.9829189 * fract( dot( position, vec2( 0.06711056, 0.00583715 ) ) ) );
}

vec2 CsmVogel( int tapIndex, int tapCount, float phi ) {
  const float goldenAngle = 2.399963229728653;
  float r = sqrt( ( float( tapIndex ) + 0.5 ) / float( tapCount ) );
  float theta = float( tapIndex ) * goldenAngle + phi;
  return vec2( cos( theta ), sin( theta ) ) * r;
}

#if defined( SHADOWMAP_TYPE_PCF )
  #define CSM_SAMPLER sampler2DShadow
  float CsmCompare( CSM_SAMPLER shadowMap, vec2 uv, float z ) {
    return texture( shadowMap, vec3( uv, z ) );
  }
#else
  #define CSM_SAMPLER sampler2D
  float CsmDepthAt( CSM_SAMPLER shadowMap, vec2 uv ) {
    return texture2D( shadowMap, uv ).r;
  }
  // 裸深度档自己做「先比较再插值」的双线性 PCF（percentage-closer bilinear）。
  // 先插值再比较是错的：那样比较的是一个被平滑过的深度，边缘会整体外扩一个纹素。
  float CsmCompare( CSM_SAMPLER shadowMap, vec2 uv, float z, vec2 mapSize ) {
    vec2 texel = vec2( 1.0 ) / mapSize;
    vec2 f = fract( uv * mapSize - 0.5 );
    vec2 base = ( floor( uv * mapSize - 0.5 ) + 0.5 ) * texel;
    float d00 = step( z, texture2D( shadowMap, base ).r );
    float d10 = step( z, texture2D( shadowMap, base + vec2( texel.x, 0.0 ) ).r );
    float d01 = step( z, texture2D( shadowMap, base + vec2( 0.0, texel.y ) ).r );
    float d11 = step( z, texture2D( shadowMap, base + texel ).r );
    return mix( mix( d00, d10, f.x ), mix( d01, d11, f.x ), f.y );
  }
#endif

/**
 * receiver-plane 深度偏置（Isidoro 2006）：本片元所在平面在阴影图 uv 上的深度梯度。
 * 有了它，盘上偏移出去的那些抽样点比较的是「同一个平面在那儿应该有多深」，
 * 掠射角上就不必把常数 bias 调到能把影子整个顶飞（peter-panning）的量级。
 * 梯度在掠射角会爆掉，所以钳住。
 */
vec2 CsmReceiverPlane( vec3 coord ) {
  vec3 dx = dFdx( coord );
  vec3 dy = dFdy( coord );
  float det = dx.x * dy.y - dx.y * dy.x;
  if ( abs( det ) < 1e-9 ) return vec2( 0.0 );
  vec2 planeBias = vec2(
    dy.y * dx.z - dx.y * dy.z,
    dx.x * dy.z - dy.x * dx.z
  ) / det;
  return clamp( planeBias, vec2( -0.02 ), vec2( 0.02 ) );
}

/** 正交阴影矩阵反解：x = 本级覆盖宽度（米），y = 本级深度范围（米）。 */
vec2 CsmWorldScale( mat4 shadowMatrix ) {
  float uvPerMeter = length( vec3( shadowMatrix[ 0 ][ 0 ], shadowMatrix[ 1 ][ 0 ], shadowMatrix[ 2 ][ 0 ] ) );
  float zPerMeter = length( vec3( shadowMatrix[ 0 ][ 2 ], shadowMatrix[ 1 ][ 2 ], shadowMatrix[ 2 ][ 2 ] ) );
  return vec2( 1.0 / max( uvPerMeter, 1e-8 ), 1.0 / max( zPerMeter, 1e-8 ) );
}

float CsmFilterDisk( CSM_SAMPLER shadowMap, DirectionalLightShadow shadowData,
    vec3 coord, vec2 planeBias, float diskUv, float phi ) {
  float sum = 0.0;
#if defined( SHADOWMAP_TYPE_PCF )
  for ( int tapIndex = 0; tapIndex < CSM_DISK_TAPS; tapIndex ++ ) {
    vec2 offset = CsmVogel( tapIndex, CSM_DISK_TAPS, phi ) * diskUv;
    sum += CsmCompare( shadowMap, coord.xy + offset, coord.z + shadowData.shadowBias + dot( offset, planeBias ) );
  }
#else
  // 盘半径超过四个纹素时抽样点本来就散在不同纹素上，「先比较再插值」的双线性
  // 只是让每个抽样点多花三次取样，换不来任何可见差别。窄盘（贴着遮挡体的接触处、
  // 以及固定盘那 2.2 个纹素）才需要它 —— 那里的边缘只有一两个纹素宽，
  // 点采样会是台阶。分支写在循环**外面**：写在里面的话有些驱动会把两条路都算掉。
  if ( diskUv * shadowData.shadowMapSize.x > 4.0 ) {
    for ( int tapIndex = 0; tapIndex < CSM_DISK_TAPS; tapIndex ++ ) {
      vec2 offset = CsmVogel( tapIndex, CSM_DISK_TAPS, phi ) * diskUv;
      float z = coord.z + shadowData.shadowBias + dot( offset, planeBias );
      sum += step( z, texture2D( shadowMap, coord.xy + offset ).r );
    }
  } else {
    for ( int tapIndex = 0; tapIndex < CSM_DISK_TAPS; tapIndex ++ ) {
      vec2 offset = CsmVogel( tapIndex, CSM_DISK_TAPS, phi ) * diskUv;
      float z = coord.z + shadowData.shadowBias + dot( offset, planeBias );
      sum += CsmCompare( shadowMap, coord.xy + offset, z, shadowData.shadowMapSize );
    }
  }
#endif
  return sum / float( CSM_DISK_TAPS );
}

/** 固定盘 PCF：半影宽度恒为 shadowRadius 个纹素。远级与低档走这条。 */
float CsmEvaluateFixed( CSM_SAMPLER shadowMap, DirectionalLightShadow shadowData,
    mat4 shadowMatrix, vec3 coord, vec2 planeBias ) {
  float phi = CsmIgn( gl_FragCoord.xy ) * ${F(TWO_PI)};
  float diskUv = shadowData.shadowRadius / max( shadowData.shadowMapSize.x, 1.0 );
  float visibility = CsmFilterDisk( shadowMap, shadowData, coord, planeBias, diskUv, phi );
  return mix( 1.0, visibility, shadowData.shadowIntensity );
}

#if defined( SHADOWMAP_TYPE_PCF )
  #define CsmEvaluatePcss CsmEvaluateFixed
#else
/**
 * PCSS：blocker search → 半影估计 → 按半影缩放的盘。
 * 平行光的半影只跟「遮挡体到接收面的间距」有关（不像点光要除以接收面距离），
 * 所以这里是一条直线：penumbra = 间距 × CSM_PENUMBRA_PER_METER。
 */
float CsmEvaluatePcss( CSM_SAMPLER shadowMap, DirectionalLightShadow shadowData,
    mat4 shadowMatrix, vec3 coord, vec2 planeBias ) {
  float phi = CsmIgn( gl_FragCoord.xy ) * ${F(TWO_PI)};
  vec2 worldScale = CsmWorldScale( shadowMatrix );
  float texelUv = 1.0 / max( shadowData.shadowMapSize.x, 1.0 );
  float diskUv = shadowData.shadowRadius * texelUv;
  float z = coord.z + shadowData.shadowBias;

  // 搜索半径：本级深度范围内可能张开的最大半影，再按「接触」的尺度封顶。
  float searchMeters = min( worldScale.y * CSM_PENUMBRA_PER_METER, CSM_SEARCH_MAX_METERS );
  float searchUv = max( searchMeters / worldScale.x, diskUv );
  float blockerSum = 0.0;
  float blockerCount = 0.0;
  for ( int tapIndex = 0; tapIndex < CSM_BLOCKER_TAPS; tapIndex ++ ) {
    vec2 offset = CsmVogel( tapIndex, CSM_BLOCKER_TAPS, phi ) * searchUv;
    float depth = CsmDepthAt( shadowMap, coord.xy + offset );
    if ( depth < z + dot( offset, planeBias ) ) {
      blockerSum += depth;
      blockerCount += 1.0;
    }
  }
  if ( blockerCount > 0.0 ) {
    float separationMeters = max( 0.0, z - blockerSum / blockerCount ) * worldScale.y;
    float penumbraUv = separationMeters * CSM_PENUMBRA_PER_METER / worldScale.x;
    diskUv = clamp( max( diskUv, penumbraUv ), diskUv, CSM_MAX_PENUMBRA_TEXELS * texelUv );
  }
  float visibility = CsmFilterDisk( shadowMap, shadowData, coord, planeBias, diskUv, phi );
  return mix( 1.0, visibility, shadowData.shadowIntensity );
}
#endif

/**
 * 按级号派发到对应的采样器。采样器数组在 GLSL ES 3.00 里**只能用常量下标**，
 * 所以这里由 JS 展开成字面量分支；混合过渡带时同一个函数被调两次（近级、远级）。
 */
float CsmDispatch( int csmLevel, vec3 csmCoord, vec2 csmPlane ) {${Dispatch("csmLevel", "csmCoord", "csmPlane")}
  return 1.0;
}

/**
 * 1.0 = 完全照到太阳，0.0 = 完全被挡。**所有级联之外返回 1.0**（不是 0）——
 * 最远一级之外没有阴影信息，返回 0 会让整个远景死黑。
 */
float CsmSunVisibility() {
  int csmLevel = -1;
  vec3 csmCoordNear = vec3( 0.0 );
  vec3 csmCoordFar = vec3( 0.0 );
  bool csmHasFar = false;
  float csmMix = 0.0;
${select}
  if ( csmLevel < 0 ) return 1.0;
  if ( !csmHasFar ) csmMix = 0.0;

  vec2 planeNear = CsmReceiverPlane( csmCoordNear );
  float visibility = CsmDispatch( csmLevel, csmCoordNear, planeNear );
  if ( csmMix > 0.0 ) {
    vec2 planeFar = CsmReceiverPlane( csmCoordFar );
    visibility = mix( visibility, CsmDispatch( csmLevel + 1, csmCoordFar, planeFar ), csmMix );
  }
  return clamp( visibility, 0.0, 1.0 );
}

#ifdef CSM_CONTACT
// 接触阴影**没有自己的采样器**：它打在 SSIL 靶的 alpha 里（uSsilMap.a）。
// 由头：八个子系统合流之后人物与视模材质在 ANGLE-D3D11 的 16 个纹素单元上超了线，
// 而这两张都是半分辨率的屏幕空间靶，合一张零代价（口径与预算表见
// docs/Data_TechRenderPipeline.md §1.8）。uSsilMap / uSsaoResolution 由 AO 补丁的
// 「屏幕空间输入公共声明块」声明 —— 所以 CSM_CONTACT 只在**挂了 AO 补丁**的
// 材质上定义（见 IndirectLightingPatches 里那一行）。
// SSIL 靶的 alpha 在接触阴影关着时恒为 1（GTAO 写 1，1×1 傅底图也是 1）= 没挡住。
float CsmContactShadow() {
  return texture2D( uSsilMap, gl_FragCoord.xy / uSsaoResolution ).a;
}
#endif

#endif
`;
}

/**
 * 替换 `lights_fragment_begin` 里的平行光段。
 *
 * 保留三方原版作为 `USE_SHADOWMAP` 关掉时的退路：那时候 `NUM_DIR_LIGHTS` 仍是 N
 * （castShadow 的灯照样进 lights 数组），但 1..N-1 的 intensity 是 0，
 * 原版循环加出来仍然只有一份太阳。
 */
function CsmDirectionalGlsl() {
  return /* glsl */`
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
		// 级联太阳：前 NUM_DIR_LIGHT_SHADOWS 盏灯是同一轮太阳的 N 级，
		// 只有第 0 盏带强度，其余是阴影图的容器（见文件抬头「能量守恒」）。
		directionalLight = directionalLights[ 0 ];
		getDirectionalLightInfo( directionalLight, directLight );
		if ( directLight.visible && receiveShadow ) {
			gCsmSunVisibility = CsmSunVisibility();
			#ifdef CSM_CONTACT
				// 接触阴影只压直射太阳，且与级联取 min（两者都是「挡住了没有」，
				// 相乘会在同时命中的地方叠成两倍黑）。间接光一点都不许压。
				gCsmSunVisibility = min( gCsmSunVisibility, CsmContactShadow() );
			#endif
			directLight.color *= gCsmSunVisibility;
		}
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
		#if NUM_DIR_LIGHTS > NUM_DIR_LIGHT_SHADOWS
		// 不投影的平行光（本作没有，留着是为了别人加一盏时不被级联吞掉）
		for ( int i = NUM_DIR_LIGHT_SHADOWS; i < NUM_DIR_LIGHTS; i ++ ) {
			directionalLight = directionalLights[ i ];
			getDirectionalLightInfo( directionalLight, directLight );
			RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
		}
		#endif
	#else
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
			directionalLight = directionalLights[ i ];
			getDirectionalLightInfo( directionalLight, directLight );
			RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
		}
		#pragma unroll_loop_end
	#endif
#endif
`;
}

const DIR_SECTION_START = "#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )";
const DIR_SECTION_END = "#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )";

let installedQuality = null;
let originalLightsBegin = null;
let originalShadowPars = null;

/**
 * 安装级联阴影的着色器 chunk。**必须在任何材质编译之前调**（LightRig 构造时调）。
 * 同一档位重复调是幂等的；换档位会重生成（换档本来就要重开页面，见画质面板）。
 *
 * @param {string} quality low | medium | high | ultra
 * @returns {object} 实际生效的阴影档位（`Data_Tuning_Shadows.MakeShadowPreset`）
 */
export function InstallCsmShaderChunks(quality = "high") {
  const preset = MakeShadowPreset(quality);
  if (installedQuality === quality) return preset;
  if (originalLightsBegin === null) {
    originalLightsBegin = THREE.ShaderChunk.lights_fragment_begin;
    originalShadowPars = THREE.ShaderChunk.shadowmap_pars_fragment;
  }
  const source = originalLightsBegin;
  const start = source.indexOf(DIR_SECTION_START);
  const end = source.indexOf(DIR_SECTION_END);
  if (start < 0 || end < 0 || end < start) {
    // 三方换了 chunk 的写法。静默跳过 = 每份材质吃 N 份太阳，画面当场过曝
    // 而且没人知道为什么，所以这里必须吼一声并且**不装**（退回单级行为）。
    console.error("[Csm] lights_fragment_begin 里找不到平行光段，级联阴影未安装");
    return preset;
  }
  THREE.ShaderChunk.lights_fragment_begin = `${source.slice(0, start)}
// 级联阴影：本片元最终采到的太阳可见度（1 = 照到）。声明在最外层是为了
// 材质补丁（Debug Rendering 的「太阳阴影」假彩色）能在 include 之后读到它。
float gCsmSunVisibility = 1.0;
${CsmDirectionalGlsl()}${source.slice(end)}`;
  THREE.ShaderChunk.shadowmap_pars_fragment = `${originalShadowPars}\n${CsmParsGlsl(preset)}`;
  installedQuality = quality;
  return preset;
}

/** 取证用：当前装的是哪一档（没装过是 null）。 */
export function InstalledCsmQuality() { return installedQuality; }

// ===========================================================================
// 全屏 pass 用的采样接口（体积雾 / 接触阴影 / 调试视图）
// ===========================================================================

/**
 * `Script_Light.SUN_SHADOW_GLSL` 的本体。材质走的是上面那套 chunk，
 * **全屏 pass 走这一套**：它自己声明采样器与矩阵，由 `BindSunShadowUniforms`
 * + `LightRig.SyncShadowUniforms()` 每帧接上。
 *
 * 两个签名：
 *   `float SunShadowVisibility( vec3 worldPos, vec3 worldNormal )`  —— 盘抽样
 *   `float SunShadowVisibilityCheap( vec3 worldPos )`               —— 单抽样
 * 后者给体积雾的 raymarch 用：一帧几十万次调用，盘抽样在那里是纯浪费
 * （雾里本来就没有硬边，多抽样看不出差别）。
 */
export const SUN_SHADOW_SAMPLER_GLSL = /* glsl */`
// 告诉消费方「本接口自带单抽样版」。B3 体积雾在级联落地之前自带了一份
// 同名 fallback（包在 ifndef SUN_SHADOW_HAS_CHEAP 里）；有了这一行它就被预处理器整块剔掉，
// 不会与下面真正的 SunShadowVisibilityCheap 重复定义（重定义 = 那一趟编译不过、雾全黑）。
#define SUN_SHADOW_HAS_CHEAP 1
// PCF 档下 depthTexture 带 compareFunction，**必须** highp sampler2DShadow；
// BASIC 档是裸深度，sampler2D。两者由 Script_Csm.SHADOW_MAP_TYPE 决定，
// 绑错类型是未定义行为（多数驱动整片返回 0 = 全屏死黑）。
${CSM_RAW_DEPTH
    ? "uniform highp sampler2D uSunShadowMap[ " + CSM_MAX_CASCADES + " ];"
    : "uniform highp sampler2DShadow uSunShadowMap[ " + CSM_MAX_CASCADES + " ];"}
uniform mat4 uSunShadowMatrix[ ${CSM_MAX_CASCADES} ];
// x = 图边长, y = 深度偏移（归一化）, z = 法线偏移（世界米）, w = 盘半径（纹素）
uniform vec4 uSunShadowParams[ ${CSM_MAX_CASCADES} ];
uniform float uSunShadowCount;
uniform float uSunShadowIntensity;
uniform float uSunShadowEnabled;

float SunShadowIgn( vec2 position ) {
  return fract( 52.9829189 * fract( dot( position, vec2( 0.06711056, 0.00583715 ) ) ) );
}

vec2 SunShadowVogel( int tapIndex, int tapCount, float phi ) {
  const float goldenAngle = 2.399963229728653;
  float r = sqrt( ( float( tapIndex ) + 0.5 ) / float( tapCount ) );
  float theta = float( tapIndex ) * goldenAngle + phi;
  return vec2( cos( theta ), sin( theta ) ) * r;
}

float SunShadowTap( int level, vec2 uv, float z ) {
${(() => {
    let out = "";
    for (let i = 0; i < CSM_MAX_CASCADES; i += 1) {
      out += CSM_RAW_DEPTH
        ? `  if ( level == ${i} ) return step( z, texture2D( uSunShadowMap[ ${i} ], uv ).r );\n`
        : `  if ( level == ${i} ) return texture( uSunShadowMap[ ${i} ], vec3( uv, z ) );\n`;
    }
    return out;
  })()}  return 1.0;
}
${CSM_RAW_DEPTH ? /* glsl */`
/** 裸深度档才有：调试视图的 blocker search 要读到深度值本身。 */
float SunShadowRawDepth( int level, vec2 uv ) {
${(() => {
    let out = "";
    for (let i = 0; i < CSM_MAX_CASCADES; i += 1) {
      out += `  if ( level == ${i} ) return texture2D( uSunShadowMap[ ${i} ], uv ).r;\n`;
    }
    return out;
  })()}  return 1.0;
}` : ""}

/** 选级 + 投影。返回 xyz = [0,1] 阴影坐标，w = 级号（-1 = 全部级联之外）。 */
vec4 SunShadowProject( vec3 worldPos, vec3 worldNormal ) {
  for ( int level = 0; level < ${CSM_MAX_CASCADES}; level ++ ) {
    if ( float( level ) >= uSunShadowCount ) break;
    vec4 params = uSunShadowParams[ level ];
    vec4 coord = uSunShadowMatrix[ level ] * vec4( worldPos + worldNormal * params.z, 1.0 );
    vec3 c = coord.xyz / coord.w;
    vec2 e = abs( c.xy - 0.5 );
    if ( max( e.x, e.y ) < 0.5 && c.z >= 0.0 && c.z <= 1.0 ) {
      return vec4( c, float( level ) );
    }
  }
  return vec4( 0.0, 0.0, 0.0, -1.0 );
}

/**
 * 1.0 = 完全照到，0.0 = 完全被挡，**全部级联之外返回 1.0**（不是 0）——
 * 覆盖范围之外没有阴影信息，返回 0 会让整个远景死黑。
 */
float SunShadowVisibility( vec3 worldPos, vec3 worldNormal ) {
  if ( uSunShadowEnabled < 0.5 ) return 1.0;
  vec4 hit = SunShadowProject( worldPos, worldNormal );
  int level = int( hit.w + 0.5 );
  if ( hit.w < 0.0 ) return 1.0;
  vec4 params = uSunShadowParams[ 0 ];
  if ( level == 1 ) params = uSunShadowParams[ 1 ];
  else if ( level == 2 ) params = uSunShadowParams[ 2 ];
  else if ( level == 3 ) params = uSunShadowParams[ 3 ];
  float texelUv = 1.0 / max( params.x, 1.0 );
  float diskUv = params.w * texelUv;
  float z = hit.z + params.y;
  float phi = SunShadowIgn( gl_FragCoord.xy ) * ${F(TWO_PI)};
  float sum = 0.0;
  for ( int tapIndex = 0; tapIndex < 8; tapIndex ++ ) {
    sum += SunShadowTap( level, hit.xy + SunShadowVogel( tapIndex, 8, phi ) * diskUv, z );
  }
  return mix( 1.0, sum * 0.125, uSunShadowIntensity );
}

/**
 * 本片元的半影宽度（本级纹素）。**只给调试视图**（Debug Rendering 的
 * 「阴影半影」）：正片的半影是在材质 chunk 里逐级算的，这里是同一套公式的
 * 全屏复算，用来一眼看出「近处硬、远处软」是不是真的在发生。
 * PCF 档没有裸深度可读，直接返回固定盘半径。
 */
float SunShadowPenumbraTexels( vec3 worldPos, vec3 worldNormal ) {
  if ( uSunShadowEnabled < 0.5 ) return 0.0;
  vec4 hit = SunShadowProject( worldPos, worldNormal );
  if ( hit.w < 0.0 ) return 0.0;
  int level = int( hit.w + 0.5 );
  vec4 params = uSunShadowParams[ 0 ];
  if ( level == 1 ) params = uSunShadowParams[ 1 ];
  else if ( level == 2 ) params = uSunShadowParams[ 2 ];
  else if ( level == 3 ) params = uSunShadowParams[ 3 ];
${CSM_RAW_DEPTH ? /* glsl */`
  mat4 shadowMatrix = uSunShadowMatrix[ 0 ];
  if ( level == 1 ) shadowMatrix = uSunShadowMatrix[ 1 ];
  else if ( level == 2 ) shadowMatrix = uSunShadowMatrix[ 2 ];
  else if ( level == 3 ) shadowMatrix = uSunShadowMatrix[ 3 ];
  float worldWidth = 1.0 / max( length( vec3( shadowMatrix[ 0 ][ 0 ], shadowMatrix[ 1 ][ 0 ], shadowMatrix[ 2 ][ 0 ] ) ), 1e-8 );
  float depthRange = 1.0 / max( length( vec3( shadowMatrix[ 0 ][ 2 ], shadowMatrix[ 1 ][ 2 ], shadowMatrix[ 2 ][ 2 ] ) ), 1e-8 );
  float texelUv = 1.0 / max( params.x, 1.0 );
  float z = hit.z + params.y;
  float searchUv = max( min( depthRange * ${F(SunPenumbraPerMeter())}, ${F(SHADOW_COMMON.blockerSearchMaxMeters)} ) / worldWidth, params.w * texelUv );
  float phi = SunShadowIgn( gl_FragCoord.xy ) * ${F(TWO_PI)};
  float blockerSum = 0.0;
  float blockerCount = 0.0;
  for ( int tapIndex = 0; tapIndex < 8; tapIndex ++ ) {
    vec2 offset = SunShadowVogel( tapIndex, 8, phi ) * searchUv;
    float depth = SunShadowRawDepth( level, hit.xy + offset );
    if ( depth < z ) { blockerSum += depth; blockerCount += 1.0; }
  }
  if ( blockerCount <= 0.0 ) return params.w;
  float separation = max( 0.0, z - blockerSum / blockerCount ) * depthRange;
  float penumbraUv = separation * ${F(SunPenumbraPerMeter())} / worldWidth;
  return clamp( max( params.w, penumbraUv / texelUv ), 0.0, ${F(SHADOW_COMMON.maxPenumbraTexels, 2)} );
` : `
  return params.w;
`}
}

/** 单抽样版。体积雾 raymarch 每帧几十万次调用走这条。 */
float SunShadowVisibilityCheap( vec3 worldPos ) {
  if ( uSunShadowEnabled < 0.5 ) return 1.0;
  vec4 hit = SunShadowProject( worldPos, vec3( 0.0 ) );
  if ( hit.w < 0.0 ) return 1.0;
  int level = int( hit.w + 0.5 );
  vec4 params = uSunShadowParams[ 0 ];
  if ( level == 1 ) params = uSunShadowParams[ 1 ];
  else if ( level == 2 ) params = uSunShadowParams[ 2 ];
  else if ( level == 3 ) params = uSunShadowParams[ 3 ];
  return mix( 1.0, SunShadowTap( level, hit.xy, hit.z + params.y ), uSunShadowIntensity );
}
`;

// ===========================================================================
// CsmRig：N 盏灯 + 拟合 + 吸附 + 节流
// ===========================================================================

const _center = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _snapped = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);
const _altUp = new THREE.Vector3(0, 0, 1);

/**
 * 级联装置。**第 0 盏就是 `LightRig.sun`**（外部有 `lights.sun.shadow.*` 的
 * 消费方，那些引用一个都不许断）；1..N-1 是同方向、零强度的阴影图容器。
 */
export class CsmRig {
  constructor(scene, { quality = "high", mapSize = 0 } = {}) {
    this.scene = scene;
    this.quality = quality;
    this.preset = InstallCsmShaderChunks(quality);
    this.count = Math.min(CSM_MAX_CASCADES, this.preset.cascades);
    this.mapSize = mapSize || this.preset.mapSize;
    this.defaultMapSize = this.preset.mapSize;

    this.lights = [];
    for (let i = 0; i < this.count; i += 1) {
      // 只有第 0 盏带强度。1..N-1 是零强度的容器：任何没走本模块 chunk 的
      // 材质（另一条渲染路径、别人新建的材质）加出来仍然只有一份太阳。
      const light = new THREE.DirectionalLight(0xffffff, i === 0 ? 3.0 : 0);
      light.name = `SunCascade${i}`;
      light.castShadow = true;
      light.shadow.mapSize.set(this.mapSize, this.mapSize);
      light.shadow.camera.near = 0.5;
      light.shadow.camera.far = 260;
      light.shadow.bias = -0.0004;
      light.shadow.normalBias = 0.035;
      light.shadow.radius = 2.2;
      // 逐级节流的开关：three 的 WebGLShadowMap 在
      // `shadow.autoUpdate === false && shadow.needsUpdate === false` 时跳过这盏灯。
      light.shadow.autoUpdate = false;
      light.shadow.needsUpdate = true;
      light.target = new THREE.Object3D();
      light.target.name = `SunCascade${i}Target`;
      scene.add(light);
      scene.add(light.target);
      this.lights.push(light);
    }
    this.sun = this.lights[0];

    /** 逐级：本级实际拟合出来的半径（米）与纹素世界尺寸（米）。取证与测试读它。 */
    this.radii = new Array(this.count).fill(0);
    this.texelWorld = new Array(this.count).fill(0);
    this.splits = [];
    this.frame = 0;
    this.lastScheduled = new Array(this.count).fill(true);
    // 「这一级重拟合过了，还没重烘」。Update 置位、ScheduleShadowUpdate 消位 ——
    // 两者必须严格配对：只要出现「矩阵是新的、图是旧的」，影子就整体平移半个身位，
    // 而且只在移动时出现，是最难查的一类阴影 bug。
    this.dirty = new Array(this.count).fill(true);
    this.lastFitCenter = [];
    for (let i = 0; i < this.count; i += 1) this.lastFitCenter.push(new THREE.Vector3());
    // 面板基准值（逐级按纹素尺度缩放，见 _ApplyBias）
    this.baseBias = -0.0004;
    this.baseNormalBias = 0.035;
    this.baseRadius = 2.2;
    this.intensity = 1;
    this.enabled = true;
  }

  /**
   * 这一帧烘哪一级。**每帧恰好一张**（`bakeOrder` 轮转表）——
   * 城里每趟阴影烘焙有 ~1.45 M 三角的地板（合批块剔不掉），单帧三角红线只剩
   * 2.59 M 余量，多烘一张就顶穿。账在 `Data_Tuning_Shadows` 抬头。
   *
   * 例外：**还没有图的级必须立刻烘**。`shadow.map === null` 时三方给材质绑的是
   * 空纹理，裸深度读到 0 → 那一级覆盖的区域整片死黑。开机/换图尺寸那一帧
   * 允许一次性烘满（那时加载画面盖着屏幕，也不在任何单帧预算的取样点上）。
   */
  _LevelsThisFrame() {
    const missing = [];
    for (let level = 0; level < this.count; level += 1) {
      if (this.lights[level].castShadow && !this.lights[level].shadow.map) missing.push(level);
    }
    if (missing.length) return missing;
    const order = this.preset.bakeOrder;
    const slot = ((this.frame % order.length) + order.length) % order.length;
    return [order[slot] % this.count];
  }

  /**
   * 相机瞬移 / 太阳转向 / 换关 / 改设置：把轮转相位清零，让最近一级先跟上，
   * 其余级在一轮 `bakeOrder` 之内补齐。
   *
   * **不能在这里把所有级一次标脏** —— 那样下一帧要烘 N 张，直接顶穿单帧三角
   * 红线（账在 `Data_Tuning_Shadows` 抬头）。而且也没必要：每一级的矩阵只在它
   * 自己重拟合的那一帧才变，和它自己的图永远配对，所以「还没轮到的级」拿的是
   * 一套自洽的旧矩阵 + 旧图 —— 只是内容旧几帧，不会错位。
   */
  ForceUpdate() {
    // 下一次 Update 会先 +1，所以 -1 让它落回 bakeOrder[0]（约定：最近一级）
    this.frame = -1;
    for (const center of this.lastFitCenter) center.set(0, 0, 0);
  }

  SetIntensity(value) {
    this.intensity = Math.min(1, Math.max(0, Number(value) || 0));
  }

  SetBias(bias, normalBias, radius = null) {
    this.baseBias = Number.isFinite(bias) ? bias : this.baseBias;
    this.baseNormalBias = Number.isFinite(normalBias) ? normalBias : this.baseNormalBias;
    if (Number.isFinite(radius)) this.baseRadius = radius;
    this.ForceUpdate();
  }

  /** 换阴影图尺寸：旧靶必须扔掉，three 才会按新尺寸重建。 */
  SetMapSize(size) {
    const want = Math.max(256, size | 0);
    if (want === this.mapSize) return;
    this.mapSize = want;
    for (const light of this.lights) {
      light.shadow.mapSize.set(want, want);
      if (light.shadow.map) {
        light.shadow.map.dispose();
        light.shadow.map = null;
      }
    }
    this.ForceUpdate();
  }

  /** 阴影总距离（米）。0 / 非法值 = 退回档位默认（`SHADOW_PRESETS.maxDistance`）。 */
  SetMaxDistance(meters) {
    const want = Number.isFinite(meters) && meters > 1
      ? meters : MakeShadowPreset(this.quality).maxDistance;
    if (Math.abs(want - this.preset.maxDistance) < 0.01) return;
    this.preset.maxDistance = want;
    this.ForceUpdate();
  }

  SetCastShadow(on) {
    const want = !!on;
    this.enabled = want;
    for (const light of this.lights) light.castShadow = want;
    if (want) this.ForceUpdate();
  }

  /**
   * 逐级的 bias / normalBias。面板给的是**第 0 级的基准**，往外每级按
   * 纹素世界尺寸等比放大 —— 纹素变粗四倍，痤疮的台阶也粗四倍，
   * 用同一个绝对偏移必然是「近处彼得潘 + 远处痤疮」二选一。
   */
  _ApplyBias(level, radius) {
    const light = this.lights[level];
    const shadow = light.shadow;
    const texel = (radius * 2) / this.mapSize;
    this.texelWorld[level] = texel;
    const texelRatio = this.texelWorld[0] > 0 ? texel / this.texelWorld[0] : 1;
    const depthRange = Math.max(1e-3, shadow.camera.far - shadow.camera.near);
    // 面板的 shadowBias 是「在参考深度范围上的归一化偏移」；换算成米之后
    // 按本级实际深度范围折回归一化，面板那根滑杆的手感才跨级一致。
    const biasMeters = this.baseBias * SHADOW_COMMON.referenceDepthRange * texelRatio;
    shadow.bias = biasMeters / depthRange;
    shadow.normalBias = this.baseNormalBias * texelRatio;
    shadow.radius = this.baseRadius;
    shadow.intensity = this.intensity;
  }

  /**
   * 每帧拟合。**只重拟合这一帧要重烘的级** —— 不然会出现「矩阵是新的、图是旧的」，
   * 那是最难查的一类阴影错位（影子整体平移半个身位，而且只在移动时出现）。
   *
   * @param {THREE.Camera} camera 主视图相机（拿 fov / aspect / 位姿）
   * @param {THREE.Vector3} sunDirection 指向太阳的单位向量（世界）
   * @param {THREE.Vector3} fallbackFocus 没有相机时的中心（玩家位置）
   * @param {THREE.Vector3} fallbackForward 没有相机时的朝向
   */
  Update(camera, sunDirection, fallbackFocus = null, fallbackForward = null) {
    this.frame += 1;
    let origin;
    let forward;
    let tanHalfFovY;
    let aspect;
    let cameraFar;
    if (camera && camera.isPerspectiveCamera) {
      camera.updateMatrixWorld();
      origin = camera.position;
      _forward.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
      forward = _forward;
      // 用**基准 FOV** 而不是当下的 FOV：开镜把 fov 从 55 压到 20 会让包围球
      // 半径缩到三分之一，级联每帧变尺寸 = 阴影边缘随开镜呼吸。
      tanHalfFovY = Math.tan(THREE.MathUtils.degToRad((camera.userData?.csmBaseFov ?? camera.fov) * 0.5));
      aspect = camera.aspect;
      cameraFar = camera.far;
    } else {
      origin = fallbackFocus || _center.set(0, 0, 0);
      forward = fallbackForward || _forward.set(0, 0, -1);
      tanHalfFovY = Math.tan(THREE.MathUtils.degToRad(27.5));
      aspect = 16 / 9;
      cameraFar = 260;
    }

    const far = Math.min(cameraFar, this.preset.maxDistance);
    this.splits = CascadeSplits(SHADOW_COMMON.splitNear, far, this.count, this.preset.lambda);

    // 相机瞬移 / 太阳转向不用特判：轮转表里最近一级隔帧就到（bakeOrder 的第 0 格），
    // 其余级在一轮之内补齐；而每一级的矩阵与它自己的图永远同一帧更新，
    // 所以「还没轮到的级」是一套自洽的旧数据，不会错位，只是内容旧几帧。
    const lightDir = sunDirection;
    const up = Math.abs(lightDir.y) > 0.98 ? _altUp : _worldUp;
    _right.crossVectors(up, lightDir).normalize();
    _up.crossVectors(lightDir, _right).normalize();

    const levels = this._LevelsThisFrame();
    for (const level of levels) {
      // 拟合了就必须烘：置位交给 ScheduleShadowUpdate 去消。
      this.dirty[level] = true;
      const zn = this.splits[level];
      const zf = this.splits[level + 1];
      const sphere = SliceBoundingSphere(zn, zf, tanHalfFovY, aspect);
      const cap = this.preset.maxRadius[level] ?? sphere.radius;
      let radius = Math.min(sphere.radius, cap);
      // 半径向上取整到 1/16 m：不量化的话半径每帧有浮点抖动，纹素尺寸跟着抖，
      // 吸附栅格也跟着抖 —— 吸附就白做了。
      radius = Math.ceil(radius / SHADOW_COMMON.radiusQuantum) * SHADOW_COMMON.radiusQuantum;
      this.radii[level] = radius;

      // 球心：视轴上 min(切片球心, 封顶后还够得着的距离)。半径被封顶时球心也要
      // 跟着往回收，否则框整个跑到玩家前面去，脚下反而没有阴影。
      const centerDistance = Math.min(sphere.distance, radius * 0.9);
      _center.copy(origin).addScaledVector(forward, centerDistance);

      // 光空间纹素吸附：把球心投到光空间的 (right, up) 平面上量化到纹素栅格。
      const texel = (radius * 2) / this.mapSize;
      const px = Math.round(_center.dot(_right) / texel) * texel;
      const py = Math.round(_center.dot(_up) / texel) * texel;
      const pz = _center.dot(lightDir);
      _snapped.set(0, 0, 0)
        .addScaledVector(_right, px)
        .addScaledVector(_up, py)
        .addScaledVector(lightDir, pz);

      const light = this.lights[level];
      const cam = light.shadow.camera;
      cam.left = -radius; cam.right = radius;
      cam.top = radius; cam.bottom = -radius;
      cam.near = 0.5;
      // 光源往回退 casterExtrusion：不退的话站在楼前时那栋楼在包围球**外**，
      // 它的影子整栋消失（"影子只在走近了才出现"）。
      cam.far = radius * 2 + SHADOW_COMMON.casterExtrusion;
      cam.updateProjectionMatrix();
      light.target.position.copy(_snapped);
      light.position.copy(_snapped).addScaledVector(lightDir, radius + SHADOW_COMMON.casterExtrusion * 0.5);
      light.target.updateMatrixWorld();
      this.lastFitCenter[level].copy(origin);
      this._ApplyBias(level, radius);
    }
  }

  /**
   * 点这一帧要烘哪几张。**替代旧的那句全局 `renderer.shadowMap.needsUpdate = true`。**
   * @returns {number} 这一帧真的要烘的级数（取证/测试读它）
   */
  ScheduleShadowUpdate(renderer) {
    let pending = 0;
    for (let level = 0; level < this.count; level += 1) {
      // **不要在这里重算轮转判据**：Update 与本函数之间隔着半帧，两处各算一次
      // 就可能出现「拟合了但没排烘」（矩阵新、图旧 = 影子整体平移半个身位，
      // 而且只在移动时出现）。以 Update 置下的 dirty 为准。
      const want = this.dirty[level];
      this.dirty[level] = false;
      this.lights[level].shadow.needsUpdate = want;
      // 取证用：三方在烘完之后就把 needsUpdate 清成 false，事后读不出这一帧
      // 排了谁，所以在这里留一份。
      this.lastScheduled[level] = want;
      if (want) pending += 1;
    }
    if (renderer?.shadowMap) renderer.shadowMap.needsUpdate = pending > 0;
    return pending;
  }

  /** 把级联接到一份 `SUN_SHADOW_SAMPLER_GLSL` 的 uniforms 上。 */
  SyncUniforms(uniforms) {
    const maps = uniforms.uSunShadowMap.value;
    const matrices = uniforms.uSunShadowMatrix.value;
    const params = uniforms.uSunShadowParams.value;
    let usable = 0;
    let fallback = null;
    for (let level = 0; level < this.count; level += 1) {
      const shadow = this.lights[level].shadow;
      const map = shadow.map;
      const depth = map ? map.depthTexture : null;
      // BASIC 档 compareFunction 是 null，PCF 档不是 null。绑错类型是未定义行为，
      // 宁可整体退回「没有阴影」也不要往 sampler2D 上塞一张 shadow 纹理。
      const typeOk = depth && (CSM_RAW_DEPTH ? !depth.compareFunction : !!depth.compareFunction);
      if (!this.lights[level].castShadow || !typeOk) break;
      maps[level] = depth;
      matrices[level].copy(shadow.matrix);
      params[level].set(shadow.mapSize.x, shadow.bias, shadow.normalBias, shadow.radius);
      fallback = depth;
      usable += 1;
    }
    // 没接上的槽也要绑一张真纹理：WebGL 里同一个纹理单元被两种采样器类型
    // 同时引用是 draw-time 错误，绑 null 会让三方退回默认单元。
    for (let level = usable; level < CSM_MAX_CASCADES; level += 1) {
      maps[level] = fallback;
      if (fallback) params[level].copy(params[Math.max(0, usable - 1)]);
    }
    uniforms.uSunShadowCount.value = usable;
    uniforms.uSunShadowIntensity.value = this.intensity;
    uniforms.uSunShadowEnabled.value = usable > 0 ? 1 : 0;
  }

  /** 取证：逐级半径、纹素尺寸、分割距离、本帧烘了几张。 */
  GetState() {
    return {
      quality: this.quality,
      cascades: this.count,
      mapSize: this.mapSize,
      splits: this.splits.slice(),
      radii: this.radii.slice(),
      texelWorld: this.texelWorld.slice(),
      pcssLevels: CSM_RAW_DEPTH ? Math.min(this.count, this.preset.pcssLevels) : 0,
      rawDepth: CSM_RAW_DEPTH,
      baked: this.lights.map((light) => !!light.shadow.map),
      mapSizes: this.lights.map((light) => (light.shadow.map ? light.shadow.map.width : 0)),
      intensityPerLight: this.lights.map((light) => light.intensity),
      castShadow: this.lights.map((light) => !!light.castShadow),
      pending: this.lights.map((light) => !!light.shadow.needsUpdate),
      scheduled: this.lastScheduled.slice(),
      bakeOrder: this.preset.bakeOrder.slice(),
      intensity: this.intensity,
      bias: this.lights.map((light) => light.shadow.bias),
      normalBias: this.lights.map((light) => light.shadow.normalBias),
    };
  }

  Dispose() {
    for (const light of this.lights) {
      this.scene.remove(light, light.target);
      if (light.shadow.map) {
        light.shadow.map.dispose();
        light.shadow.map = null;
      }
    }
    this.lights.length = 0;
  }
}

/** 一份 `SUN_SHADOW_SAMPLER_GLSL` 要的 uniform 条目（值都建好，随时可 Sync）。 */
export function MakeSunShadowUniforms(uniforms = {}) {
  if (!uniforms.uSunShadowMap) {
    uniforms.uSunShadowMap = { value: new Array(CSM_MAX_CASCADES).fill(null) };
  }
  if (!uniforms.uSunShadowMatrix) {
    uniforms.uSunShadowMatrix = {
      value: Array.from({ length: CSM_MAX_CASCADES }, () => new THREE.Matrix4()),
    };
  }
  if (!uniforms.uSunShadowParams) {
    uniforms.uSunShadowParams = {
      value: Array.from({ length: CSM_MAX_CASCADES }, () => new THREE.Vector4(1024, -0.0004, 0.035, 2.2)),
    };
  }
  uniforms.uSunShadowCount = uniforms.uSunShadowCount || { value: 0 };
  uniforms.uSunShadowIntensity = uniforms.uSunShadowIntensity || { value: 1 };
  uniforms.uSunShadowEnabled = uniforms.uSunShadowEnabled || { value: 0 };
  return uniforms;
}

// ===========================================================================
// 材质补丁：屏幕空间接触阴影 + GI 调试视图 9 的级联版
// ===========================================================================

/**
 * 接触阴影图与**主渲染靶**尺寸的共享引用。
 *
 * 2026-09 集成期起，接触阴影的图**打在 SSIL 靶的 alpha 里**（采样器预算，见
 * `CsmContactShadow()` 那一段的注释），所以这里不再持有纹理。保留这一包是给
 * `Script_ContactShadows` 的调试图与分辨率口径用。
 */
export const CSM_CONTACT_UNIFORMS = {
  map: { value: null },
  resolution: { value: new THREE.Vector2(1, 1) },
};

let _whiteTexture = null;
/** 1×1 纯白（接触阴影关着时的中性值）。 */
export function CsmWhiteTexture() {
  if (!_whiteTexture) {
    _whiteTexture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    _whiteTexture.colorSpace = THREE.NoColorSpace;
    _whiteTexture.needsUpdate = true;
  }
  return _whiteTexture;
}

/**
 * 本档位编不编接触阴影那一段 GLSL。**编译期开关**，由 `ContactShadowsPass`
 * 构造时按画质档告诉这里；运行时开关走「绑一张 1×1 纯白图」，不翻这一位
 * （翻它要整场重编译）。
 */
let _contactCompiled = false;
export function SetCsmContactCompiled(on) { _contactCompiled = !!on; }
export function IsCsmContactCompiled() { return _contactCompiled; }

/**
 * 级联阴影的材质补丁。**级联本体不在这里** —— 它在 chunk 里（见文件抬头），
 * 覆盖每一份内置光照材质。这里只有两件补丁注册表才做得到的事：
 *
 *   1) 屏幕空间接触阴影：要一张全屏图，只能逐材质接 uniform；
 *   2) Debug Rendering「太阳阴影」（GI 假彩色视图 9）改读级联可见度。
 *      原来那一行调的是 `getShadow(directionalShadowMap[0], …)`，级联之后
 *      它只显示第 0 级；这里在同一个锚点**追加**覆盖，不动 GI 补丁一个字。
 *
 * @param {object} options
 * @param {boolean} options.contact 覆盖档位级开关（缺省 = 读 SetCsmContactCompiled）
 * @param {boolean} options.giDebug GI 调试层在不在（`gGiDebugColor` / `uGiDebugView` 才存在）
 */
export function MakeCsmPatch({ contact = null, giDebug = false } = {}) {
  const useContact = contact == null ? _contactCompiled : !!contact;
  return _MakeCsmPatch(useContact, giDebug);
}

function _MakeCsmPatch(contact, giDebug) {
  if (!contact && !giDebug) return null;
  const fragment = [];
  if (giDebug) {
    fragment.push(["#include <lights_fragment_begin>", /* glsl */`
        // 视图 9「太阳阴影」：级联版。gCsmSunVisibility 由 lights_fragment_begin
        // 里的级联段写好（接触阴影已经 min 进去了），这里只是把它当颜色抓出来。
        #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
        if (uGiDebugView > 8.5 && uGiDebugView < 9.5) gGiDebugColor = vec3(gCsmSunVisibility);
        #endif`]);
  }
  return {
    key: `csm${contact ? "C" : "0"}${giDebug ? "G" : "0"}`,
    // 接触阴影不再自带 uniform：它读的是 AO 补丁声明的 uSsilMap.a（采样器预算）。
    uniforms: null,
    vertex: null,
    fragment: fragment.length ? fragment : null,
    // 档位级开关：low 档根本不编接触阴影那一段。运行时开关走「绑一张纯白图」，
    // 不翻这个 define —— 翻它要整场重编译。
    defines: contact ? { CSM_CONTACT: "" } : null,
  };
}
