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
 *
 * GI 注入分两层，**编译期**按 `gi.sampling` 二选一（cache key 里也带着它）：
 *   采样层 —— GI_SAMPLE_GLSL + 图集 uniforms + uGiEnabled 分支，只在探针体打开时
 *            编进去。即使 uGiEnabled 恒为 0 这坨代码也占着采样器与寄存器，
 *            实测整帧贵 ~2.7 ms（2026-08-26 FrameProfileTest，RTX 4070 SUPER）；
 *   调试层 —— uGiDebugView / gGiDebugColor / 材质通道视图 6-9 / 末端整帧覆盖。
 *            GI 关着也要在：?giView 与 Debug Rendering 面板不依赖探针体。
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

    if (gi && gi.sampling !== false) {
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
          // 体积**外**的回退值。画质面板那根「间接光强度」已经乘进了 uGiIntensity
          // （探针一侧），回退的天空 IBL 必须乘同一份 —— 少乘一边，×2 就等于
          // 「体内两倍、体外一倍」，体积边界上凭空多出一圈硬色差，而且体积跟着
          // 玩家滚，那圈色差就跟着人走。乘数跟着 uGiEnabled 淡入：图集还没收敛
          // 就先把体外提亮的话，进关那一秒会先闪一下再落回来。
          vec3 giFallback = iblIrradiance * mix(1.0, uGiGain, uGiEnabled);
          // ?giView= 假彩色取证：1 材质最终采用的间接辐照度×0.05 /
          // 2 被替换前的天空 IBL×0.05（不含上面那份增益，看的是「原样的天」）/
          // 3 confidence / 4 探针 GI 与体外回退的亮度比×0.25（与曝光无关，
          // 1.0 的比值显示为 0.25 灰；比值离 1 越远，体积边界那条缝越明显）。
          // 在 mix 之前抓，末端 <dithering_fragment> 处整帧覆盖输出。
          if (uGiDebugView > 0.5) {
            // 正片在探针体外（confidence=0）会回退到天空 IBL。这里以前只画
            // giIrradiance，体积边界外便整片纯黑，误报成“远处没有 GI”。调试图
            // 必须复现下面实际写回 iblIrradiance 的同一条 mix，才能显示真实结果。
            if (uGiDebugView < 1.5) {
              gGiDebugColor = mix(giFallback, giIrradiance, giConfidence) * 0.05;
            }
            else if (uGiDebugView < 2.5) gGiDebugColor = iblIrradiance * 0.05;
            else if (uGiDebugView < 3.5) gGiDebugColor = vec3(giConfidence);
            else if (uGiDebugView < 4.5) {
              float giDbgL = dot(giIrradiance, vec3(0.2126, 0.7152, 0.0722));
              float iblDbgL = max(dot(giFallback, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
              gGiDebugColor = vec3(giDbgL / iblDbgL * 0.25);
            }
            // 5.5 的上界不能省：6-9 是材质通道视图，值在更早的 chunk 里已经抓好，
            // 这里兜底 else 一接就会把它们全冲成权重和（四个视图一模一样的灰）。
            else if (uGiDebugView < 5.5) gGiDebugColor = vec3(gGiDbgWeightSum * 0.5);
          }
          #if defined( RE_IndirectSpecular )
          if (giConfidence > 0.0) {
            // 遮蔽比要拿**同倍**的两侧比，否则增益一开就恒等于 1（屋里的金属件
            // 照样反着一片亮天）。giFallback 与 giIrradiance 都含增益，比值干净。
            float giSkyLum = max(dot(giFallback, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
            float giLum = dot(giIrradiance, vec3(0.2126, 0.7152, 0.0722));
            float giOcclusion = clamp(giLum / giSkyLum, 0.0, 1.0);
            radiance *= mix(1.0, mix(1.0, giOcclusion, giConfidence), uGiSpecularOcclusion);
          }
          #endif
          // confidence=0 也要写回：那一路是 giFallback，增益在体外同样生效。
          iblIrradiance = mix(giFallback, giIrradiance, giConfidence);
        }
        #endif`)
        // 材质通道假彩色（6 BaseColor / 7 粗糙度 / 8 金属度 / 9 太阳阴影）。
        // 前向管线没有延迟渲染的 GBuffer，这些通道只在材质自己的着色器里存在 ——
        // 想看它们只有一条路：让材质把该通道当颜色写出去。各通道在它诞生的
        // chunk 之后立刻抓（那时值刚算完、还没被后续光照消费掉）。
        .replace("#include <color_fragment>", `#include <color_fragment>
        if (uGiDebugView > 5.5 && uGiDebugView < 6.5) gGiDebugColor = diffuseColor.rgb;`)
        .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        if (uGiDebugView > 6.5 && uGiDebugView < 7.5) gGiDebugColor = vec3(roughnessFactor);`)
        .replace("#include <metalnessmap_fragment>", `#include <metalnessmap_fragment>
        if (uGiDebugView > 7.5 && uGiDebugView < 8.5) gGiDebugColor = vec3(metalnessFactor);`)
        // 太阳阴影因子：白 = 照到，黑 = 挡住。r185 的 getShadow 六参签名。
        // 不收影的材质（USE_SHADOWMAP 未定义）保持 0 —— 黑 = 没参与收影，也是信息。
        // 阴影框只有 66 m：框外 getShadow 的 frustumTest 不过、恒返回 1（纯白），
        // 这个视图顺带能看到阴影覆盖范围的边。
        .replace("#include <lights_fragment_begin>", `#include <lights_fragment_begin>
        #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
        if (uGiDebugView > 8.5 && uGiDebugView < 9.5) {
          gGiDebugColor = vec3(getShadow(directionalShadowMap[0],
            directionalLightShadows[0].shadowMapSize, directionalLightShadows[0].shadowIntensity,
            directionalLightShadows[0].shadowBias, directionalLightShadows[0].shadowRadius,
            vDirectionalShadowCoord[0]));
        }
        #endif`)
        .replace("#include <dithering_fragment>", `#include <dithering_fragment>
        if (uGiDebugView > 0.5) gl_FragColor = vec4(gGiDebugColor, 1.0);`);
    } else if (gi) {
      // 调试视图基建（无探针采样版）。视图语义按「GI 关闭时材质实际在用什么」走：
      //   1/2 = 天空 IBL×0.05 —— 采样层没编进来，材质实际采用的间接辐照度**就是**
      //         iblIrradiance，所以视图 1 与视图 2 在这个档位是同一张图；
      //   3/4/5 = 黑 —— confidence / 亮度比 / 权重和都是探针量，没有探针 = 0，
      //         黑不是坏视图，是准确信息（画面里没有探针 GI）；
      //   6-9 材质通道与采样版逐字节相同。
      shader.uniforms.uGiDebugView = gi.debugView;
      fragment = fragment
        .replace("#include <common>", `#include <common>
        uniform float uGiDebugView;
        vec3 gGiDebugColor = vec3(0.0);`)
        .replace("#include <lights_fragment_maps>", `#include <lights_fragment_maps>
        #if defined( RE_IndirectDiffuse )
        if (uGiDebugView > 0.5 && uGiDebugView < 2.5) gGiDebugColor = iblIrradiance * 0.05;
        #endif`)
        .replace("#include <color_fragment>", `#include <color_fragment>
        if (uGiDebugView > 5.5 && uGiDebugView < 6.5) gGiDebugColor = diffuseColor.rgb;`)
        .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        if (uGiDebugView > 6.5 && uGiDebugView < 7.5) gGiDebugColor = vec3(roughnessFactor);`)
        .replace("#include <metalnessmap_fragment>", `#include <metalnessmap_fragment>
        if (uGiDebugView > 7.5 && uGiDebugView < 8.5) gGiDebugColor = vec3(metalnessFactor);`)
        .replace("#include <lights_fragment_begin>", `#include <lights_fragment_begin>
        #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
        if (uGiDebugView > 8.5 && uGiDebugView < 9.5) {
          gGiDebugColor = vec3(getShadow(directionalShadowMap[0],
            directionalLightShadows[0].shadowMapSize, directionalLightShadows[0].shadowIntensity,
            directionalLightShadows[0].shadowBias, directionalLightShadows[0].shadowRadius,
            vDirectionalShadowCoord[0]));
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
  // 缓存键必须跟着注入组合走：两种组合共用一份编译结果 = 有的材质拿不到 GI。
  // GI 位是三态（0 无 / 1 只有调试层 / 2 带探针采样），且**每次编译现读** ——
  // 运行时翻转 gi.sampling 再 needsUpdate，就能拿到另一套程序而不撞缓存。
  material.customProgramCacheKey = () =>
    `indirect:${ssao ? 1 : 0}${gi ? (gi.sampling !== false ? 2 : 1) : 0}${destruction ? 1 : 0}`;
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

  /** 一张下好的图 → 一张按本库约定配好的贴图。外部图三条路共用。 */
  _WrapTexture(image, srgb) {
    const texture = new THREE.Texture(image);
    texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
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
  _LoadExternalImage(url, srgb, timeoutMs) {
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
        (loaded) => Settle(resolve, this._WrapTexture(loaded, srgb)),
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
  async LoadExternalSet(name, { albedo, normal, orm }, { timeoutMs = 30000 } = {}) {
    const loaded = await Promise.all([
      this._LoadExternalImage(albedo, true, timeoutMs),
      this._LoadExternalImage(normal, false, timeoutMs),
      this._LoadExternalImage(orm, false, timeoutMs),
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
  async LoadExternalBaseNormal(name, fallbackName, { albedo, normal }, { timeoutMs = 30000 } = {}) {
    const fallback = this.baked.get(fallbackName);
    if (!fallback) throw new Error(`材质未烘焙：${fallbackName}`);
    const loaded = await Promise.all([
      this._LoadExternalImage(albedo, true, timeoutMs),
      this._LoadExternalImage(normal, false, timeoutMs),
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
