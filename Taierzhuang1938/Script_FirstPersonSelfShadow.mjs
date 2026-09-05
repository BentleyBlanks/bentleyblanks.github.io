// 第一人称自阴影：只给镜头前的手臂 / 武器画一张独立小阴影图。
//
// 不能直接把 Viewmodel 的 `castShadow` 打开。它的几何为了窄 FOV 与近裁面经过了
// 非等比压缩，若进入战场太阳阴影图，投到墙面上的会是一块被放大的假枪影；旧版
// `Script_Viewmodel.MakePart` 把 castShadow 写死为 false，守的就是这条边界。
//
// 本系统因此走一条隔离路径：
//   1) 第一人称不透明 PBR 网格独占 FIRST_PERSON_SHADOW_LAYER；主相机同时看 0/29 层；
//   2) 用正交相机 + MeshDepthMaterial 只画 29 层的 RGBA packed depth；
//   3) 只在 Viewmodel 自己的材质克隆里注入 3×3 PCF，压低直射漫反射 / 镜面反射。
// 世界不采这张图，Viewmodel 也仍保持 castShadow=false，所以两张阴影图绝不串线。

import * as THREE from "three";

export const FIRST_PERSON_SHADOW_LAYER = 29;

const SHADOW_BIAS_MATRIX = new THREE.Matrix4().set(
  0.5, 0.0, 0.0, 0.5,
  0.0, 0.5, 0.0, 0.5,
  0.0, 0.0, 0.5, 0.5,
  0.0, 0.0, 0.0, 1.0,
);

const SHADOW_FRAGMENT_GLSL = /* glsl */`
uniform sampler2D uFirstPersonShadowMap;
uniform vec2 uFirstPersonShadowTexel;
uniform float uFirstPersonShadowEnabled;
uniform float uFirstPersonShadowBias;
uniform float uFirstPersonShadowStrength;
uniform float uFirstPersonShadowSoft;        // 1 = 软化路径：双线性 Poisson PCF + receiver-plane 偏置
uniform float uFirstPersonShadowRadius;      // 软化滤波半径（texel）
uniform float uFirstPersonShadowSoftBias;    // 软化路径的常数偏置；斜率交给平面偏置，所以比硬路径小
uniform float uFirstPersonShadowPlaneClamp;  // 平面偏置的梯度钳制：掠射角下导数会爆，不钳就是几十厘米的漏光
varying vec4 vFirstPersonShadowCoord;

// 12 点 Poisson 盘，固定图案不转：转起来的噪点在近距离的手背上比锯齿更显眼。
const vec2 FIRST_PERSON_POISSON[12] = vec2[12](
  vec2(-0.326, -0.406), vec2(-0.840, -0.074), vec2(-0.696,  0.457), vec2(-0.203,  0.621),
  vec2( 0.962, -0.195), vec2( 0.473, -0.480), vec2( 0.519,  0.767), vec2( 0.185, -0.893),
  vec2( 0.507,  0.064), vec2( 0.896,  0.412), vec2(-0.322, -0.933), vec2(-0.792, -0.598)
);

const vec4 FIRST_PERSON_DEPTH_UNPACK = vec4(
  1.0 / (256.0 * 256.0 * 256.0),
  1.0 / (256.0 * 256.0),
  1.0 / 256.0,
  1.0
);

float FirstPersonPackedDepth(vec2 uv) {
  return dot(texture2D(uFirstPersonShadowMap, uv), FIRST_PERSON_DEPTH_UNPACK);
}

float FirstPersonCompare(vec2 uv, float receiver) {
  return step(receiver, FirstPersonPackedDepth(uv));
}

// 双线性 PCF：**先比较再插值**。插值深度再比较会在遮挡边缘算出一个不存在的中间深度，
// 边缘反而更脏；比较结果按小数权重混合才是硬件 PCF 的那种平滑。
float FirstPersonBilinearCompare(vec2 uv, float receiver) {
  vec2 texel = uFirstPersonShadowTexel;
  vec2 grid = uv / texel - 0.5;
  vec2 f = fract(grid);
  vec2 base = (floor(grid) + 0.5) * texel;
  float a = FirstPersonCompare(base, receiver);
  float b = FirstPersonCompare(base + vec2(texel.x, 0.0), receiver);
  float c = FirstPersonCompare(base + vec2(0.0, texel.y), receiver);
  float d = FirstPersonCompare(base + texel, receiver);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float FirstPersonSelfShadow() {
  vec3 projected = vFirstPersonShadowCoord.xyz / max(vFirstPersonShadowCoord.w, 1e-5);
  // 导数在任何分支之前取：ES 3.00 只保证一致控制流里的 dFdx/dFdy 有定义。
  vec3 dpdx = dFdx(projected);
  vec3 dpdy = dFdy(projected);
  if (uFirstPersonShadowEnabled < 0.5) return 1.0;
  if (projected.x <= 0.0 || projected.x >= 1.0
      || projected.y <= 0.0 || projected.y >= 1.0
      || projected.z <= 0.0 || projected.z >= 1.0) return 1.0;
  if (uFirstPersonShadowSoft < 0.5) {
    // 硬路径（出厂默认）：3×3 step PCF，原样保留。
    float receiver = projected.z - uFirstPersonShadowBias;
    float lit = 0.0;
    for (int y = -1; y <= 1; y += 1) {
      for (int x = -1; x <= 1; x += 1) {
        vec2 uv = projected.xy + vec2(float(x), float(y)) * uFirstPersonShadowTexel;
        lit += FirstPersonCompare(uv, receiver);
      }
    }
    return mix(1.0, lit / 9.0, uFirstPersonShadowStrength);
  }
  // receiver-plane depth bias（Isidoro 2006）：用接收面在阴影图空间的深度梯度，
  // 给每个 tap 各自的参考深度，这样倾斜的手背不靠一个大常数偏置也不长 acne。
  float det = dpdx.x * dpdy.y - dpdx.y * dpdy.x;
  vec2 planeGrad = vec2(0.0);
  if (abs(det) > 1e-12) {
    planeGrad = vec2(dpdy.y * dpdx.z - dpdx.y * dpdy.z, dpdx.x * dpdy.z - dpdy.x * dpdx.z) / det;
    planeGrad = clamp(planeGrad, vec2(-uFirstPersonShadowPlaneClamp), vec2(uFirstPersonShadowPlaneClamp));
  }
  vec2 scale = uFirstPersonShadowTexel * uFirstPersonShadowRadius;
  float lit = 0.0;
  for (int i = 0; i < 12; i += 1) {
    vec2 offset = FIRST_PERSON_POISSON[i] * scale;
    float receiver = projected.z + dot(planeGrad, offset) - uFirstPersonShadowSoftBias;
    lit += FirstPersonBilinearCompare(projected.xy + offset, receiver);
  }
  return mix(1.0, lit / 12.0, uFirstPersonShadowStrength);
}
`;

/** 复制一份材质，保留材质库已经装好的 AO/GI 编译钩子，但不把新阴影注入共享底材。 */
function CloneOwnedMaterial(material) {
  const clone = material.clone();
  clone.name = `${material.name || material.type}_FirstPerson`;
  clone.onBeforeCompile = material.onBeforeCompile;
  clone.customProgramCacheKey = material.customProgramCacheKey;
  clone.userData = { ...(material.userData || {}) };
  return clone;
}

function EnableShadowLayerOnLight(object) {
  if (object.isLight) object.layers.enable(FIRST_PERSON_SHADOW_LAYER);
}

export class FirstPersonSelfShadow {
  /**
   * @param {object} [options]
   * @param {number} [options.size=1024]        硬路径（出厂）的阴影图边长
   * @param {number} [options.extent=1.35]      正交相机半幅面（米）
   * @param {boolean} [options.soft=false]      软化路径：2048 图 + 双线性 Poisson PCF + receiver-plane 偏置。
   *                                            出厂关；画质面板「自阴影软化」热切（SetSoft）。
   * @param {number} [options.softSize=2048]    软化路径的阴影图边长
   * @param {number} [options.softRadius=0.006] 软化滤波半径（米）；按当前 texel 换算成 uniform
   */
  constructor(renderer, scene, camera, root, { size = 1024, extent = 1.35, soft = false, softSize = 2048, softRadius = 0.006 } = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.root = root;
    this.hardSize = Math.max(256, Math.min(2048, Math.round(size) || 1024));
    this.softSize = Math.max(512, Math.min(4096, Math.round(softSize) || 2048));
    this.softRadius = Math.max(0.001, Number(softRadius) || 0.006);
    this.soft = !!soft;
    this.size = this.soft ? this.softSize : this.hardSize;
    this.extent = Math.max(0.8, Number(extent) || 1.35);
    this.enabled = false;
    this.renderedFrames = 0;

    this.uniforms = {
      map: { value: null },
      texel: { value: new THREE.Vector2(1 / this.size, 1 / this.size) },
      enabled: { value: 0 },
      bias: { value: 0.0018 },
      strength: { value: 0.78 },
      matrix: { value: new THREE.Matrix4() },
      // 软化路径。soft 是 uniform 而不是 define：切换不重编译整棵视模材质。
      soft: { value: this.soft ? 1 : 0 },
      radius: { value: 1 },
      // 常数偏置只兜住 packed depth 的量化误差；斜率由 receiver-plane 偏置接管
      softBias: { value: 0.0006 },
      // 梯度钳在 1.0：5 texel 的 tap 在 2048 图上最多带 ~1.5 cm 的平面偏置
      planeClamp: { value: 1.0 },
    };

    this.target = null;
    this._BuildTarget(this.size);

    this.depthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      side: THREE.FrontSide,
      blending: THREE.NoBlending,
    });
    this.depthMaterial.name = "FirstPersonSelfShadowDepthMaterial";

    const e = this.extent;
    this.shadowCamera = new THREE.OrthographicCamera(-e, e, e, -e, 0.02, 6.0);
    this.shadowCamera.layers.set(FIRST_PERSON_SHADOW_LAYER);
    this.shadowCamera.matrixWorldAutoUpdate = true;
    this.camera.layers.enable(FIRST_PERSON_SHADOW_LAYER);

    this.ownedBySource = new WeakMap();
    this.ownedMaterials = new Set();
    this.patchedMaterials = new WeakSet();
    this.meshes = [];
    this.casters = [];
    this._center = new THREE.Vector3();
    this._origin = new THREE.Vector3();
    this._forward = new THREE.Vector3();
    this._sunDirection = new THREE.Vector3();
    this._quaternion = new THREE.Quaternion();
    this._clearColor = new THREE.Color();
    this._hidden = [];
    this._overrideStates = [];
    this._overrideTouched = new Set();   // 见 Render 里的去重注释
    this.Sync();
  }

  _BuildTarget(size) {
    if (this.target) this.target.dispose();
    this.size = size;
    this.target = new THREE.WebGLRenderTarget(size, size, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
      depthBuffer: true,
      stencilBuffer: false,
    });
    this.target.texture.name = "FirstPersonSelfShadowDepth";
    this.target.texture.colorSpace = THREE.NoColorSpace;
    this.uniforms.map.value = this.target.texture;
    this.uniforms.texel.value.set(1 / size, 1 / size);
    this._UpdateRadius();
  }

  /** 软化滤波半径按米给，换算成当前图的 texel 数（图换尺寸时半径不变）。 */
  _UpdateRadius() {
    const texelMeters = (2 * this.extent) / this.size;
    this.uniforms.radius.value = this.softRadius / texelMeters;
  }

  /**
   * 软化路径热切：换 2048 靶 + 着色器走双线性 Poisson / receiver-plane 分支。
   * 只动 uniform 与靶，不动 cache key，所以不触发视模材质重编译。
   */
  SetSoft(on) {
    const next = !!on;
    const size = next ? this.softSize : this.hardSize;
    this.soft = next;
    this.uniforms.soft.value = next ? 1 : 0;
    if (size !== this.size) this._BuildTarget(size);
    return this.soft;
  }

  _Owned(material) {
    if (!material || !material.isMeshStandardMaterial) return material;
    if (this.patchedMaterials.has(material)) return material;
    let owned = this.ownedBySource.get(material);
    if (!owned) {
      owned = CloneOwnedMaterial(material);
      this.ownedBySource.set(material, owned);
      this.ownedMaterials.add(owned);
      this._PatchMaterial(owned);
    }
    return owned;
  }

  _PatchMaterial(material) {
    if (!material || this.patchedMaterials.has(material)) return;
    const previousCompile = material.onBeforeCompile;
    const previousKey = material.customProgramCacheKey;
    const uniforms = this.uniforms;
    material.onBeforeCompile = function FirstPersonShadowCompile(shader, activeRenderer) {
      previousCompile.call(this, shader, activeRenderer);
      shader.uniforms.uFirstPersonShadowMap = uniforms.map;
      shader.uniforms.uFirstPersonShadowTexel = uniforms.texel;
      shader.uniforms.uFirstPersonShadowEnabled = uniforms.enabled;
      shader.uniforms.uFirstPersonShadowBias = uniforms.bias;
      shader.uniforms.uFirstPersonShadowStrength = uniforms.strength;
      shader.uniforms.uFirstPersonShadowMatrix = uniforms.matrix;
      shader.uniforms.uFirstPersonShadowSoft = uniforms.soft;
      shader.uniforms.uFirstPersonShadowRadius = uniforms.radius;
      shader.uniforms.uFirstPersonShadowSoftBias = uniforms.softBias;
      shader.uniforms.uFirstPersonShadowPlaneClamp = uniforms.planeClamp;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>
        uniform mat4 uFirstPersonShadowMatrix;
        varying vec4 vFirstPersonShadowCoord;`)
        .replace("#include <project_vertex>", `#include <project_vertex>
        {
          vec4 firstPersonShadowWorld = vec4(transformed, 1.0);
          #ifdef USE_BATCHING
            firstPersonShadowWorld = batchingMatrix * firstPersonShadowWorld;
          #endif
          #ifdef USE_INSTANCING
            firstPersonShadowWorld = instanceMatrix * firstPersonShadowWorld;
          #endif
          vFirstPersonShadowCoord = uFirstPersonShadowMatrix * modelMatrix * firstPersonShadowWorld;
        }`);
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>
${SHADOW_FRAGMENT_GLSL}`)
        .replace("#include <aomap_fragment>", `#include <aomap_fragment>
        {
          float firstPersonShadow = FirstPersonSelfShadow();
          reflectedLight.directDiffuse *= firstPersonShadow;
          reflectedLight.directSpecular *= firstPersonShadow;
        }`);
    };
    material.customProgramCacheKey = function FirstPersonShadowCacheKey() {
      return `${previousKey.call(this)}|firstPersonSelfShadow1`;
    };
    material.userData.firstPersonSelfShadow = true;
    // **不要在这里动 allowOverride**。预通道归属由 Script_Post.MarkForegroundPrepass
    // 决定（不透明件要吃覆盖材质才写得出真法线），clone() 已经把源材质那一位抄过来了。
    // 以前这里写死 false，等于把视图模型偷偷踢出覆盖材质，法线视图里就是一团噪声。
    material.needsUpdate = true;
    this.patchedMaterials.add(material);
  }

  /** Equip 会重建枪械树；逐帧轻量同步让新网格自动进入同一条隔离路径。 */
  Sync() {
    this.meshes.length = 0;
    this.casters.length = 0;
    if (!this.root) return;
    this.root.traverse((object) => {
      if (!object.isMesh || !object.material) return;
      const list = Array.isArray(object.material) ? object.material : [object.material];
      if (!list.some((material) => material?.isMeshStandardMaterial)) return;
      const owned = list.map((material) => this._Owned(material));
      object.material = Array.isArray(object.material) ? owned : owned[0];
      object.layers.set(FIRST_PERSON_SHADOW_LAYER);
      // 战场太阳阴影仍不得收这棵压缩几何；本系统的深度 pass 不读 castShadow。
      object.castShadow = false;
      this.meshes.push(object);
      const opaque = owned.every((material) => !material?.transparent && (material?.opacity ?? 1) >= 1);
      if (opaque && !object.userData?.debris) this.casters.push(object);
    });
  }

  SetEnabled(on) {
    this.enabled = !!on;
    this.uniforms.enabled.value = this.enabled ? 1 : 0;
    return this.enabled;
  }

  _FitCamera(sunDirection) {
    this.root.getWorldPosition(this._origin);
    this.root.getWorldQuaternion(this._quaternion);
    this._forward.set(0, 0, -1).applyQuaternion(this._quaternion).normalize();
    this._center.copy(this._origin).addScaledVector(this._forward, 0.58);
    this._sunDirection.copy(sunDirection || { x: 0.45, y: 0.75, z: 0.35 });
    if (this._sunDirection.lengthSq() < 1e-6) this._sunDirection.set(0.45, 0.75, 0.35);
    this._sunDirection.normalize();
    this.shadowCamera.position.copy(this._center).addScaledVector(this._sunDirection, 2.8);
    this.shadowCamera.up.set(0, 1, 0);
    if (Math.abs(this._sunDirection.y) > 0.98) this.shadowCamera.up.set(0, 0, 1);
    this.shadowCamera.lookAt(this._center);
    this.shadowCamera.updateMatrixWorld(true);
    this.uniforms.matrix.value.copy(SHADOW_BIAS_MATRIX)
      .multiply(this.shadowCamera.projectionMatrix)
      .multiply(this.shadowCamera.matrixWorldInverse);
  }

  Render(sunDirection) {
    if (!this.enabled || !this.root?.visible) return false;
    this.Sync();
    if (!this.casters.length) return false;
    this._FitCamera(sunDirection);

    const renderer = this.renderer;
    const previousTarget = renderer.getRenderTarget();
    const previousOverride = this.scene.overrideMaterial;
    const previousClearAlpha = renderer.getClearAlpha();
    renderer.getClearColor(this._clearColor);
    this._hidden.length = 0;
    this._overrideStates.length = 0;
    this._overrideTouched.clear();

    const casterSet = new Set(this.casters);
    for (const mesh of this.meshes) {
      if (!casterSet.has(mesh) && mesh.visible) {
        this._hidden.push(mesh);
        mesh.visible = false;
      }
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (!material) continue;
        // 一份材质挂在好几个网格上是常态（枪身与刺刀共用钢）。不去重的话第二次
        // push 记下的是**已经被自己改成 true 的值**，还原时最后一次写回把它永久
        // 留在 true 上 —— 视图模型的预通道口径于是被这一趟悄悄改掉了。
        if (this._overrideTouched.has(material)) continue;
        this._overrideTouched.add(material);
        this._overrideStates.push([material, material.allowOverride]);
        material.allowOverride = true;
      }
    }

    // 灯也要挂进本层。three 按「相机看得见的灯」算光照哈希，而这台相机只看
    // FIRST_PERSON_SHADOW_LAYER：灯留在第 0 层的话，这一趟看到 0 盏灯、主通道又
    // 看到全部灯，同一个 scene 的 lights.state.version 每帧被顶两次，全场每份带光照
    // 材质在每个 pass 都重走一遍 getProgram（含 onBeforeCompile.toString() 的
    // 缓存键）—— 爆炸测试场空场实测 0.44 ms/帧，占主线程 13%。深度覆盖材质不读灯，
    // 多收进来的灯只让哈希稳定，画面不变。每帧遍历是为了接住运行时新挂的灯
    // （过场道具自带点光），代价约 0.03 ms。
    this.scene.traverse(EnableShadowLayerOnLight);
    // 灯进了本层，three 会想在这一趟顺手烘战场阴影图：那是主通道的事，别搬过来。
    const shadowMap = renderer.shadowMap;
    const previousShadowNeedsUpdate = shadowMap.needsUpdate;
    try {
      this.scene.overrideMaterial = this.depthMaterial;
      shadowMap.needsUpdate = false;
      renderer.setRenderTarget(this.target);
      renderer.setClearColor(0xffffff, 1);
      renderer.clear(true, true, true);
      renderer.render(this.scene, this.shadowCamera);
      this.renderedFrames += 1;
    } finally {
      shadowMap.needsUpdate = previousShadowNeedsUpdate;
      this.scene.overrideMaterial = previousOverride;
      for (const [material, allowOverride] of this._overrideStates) material.allowOverride = allowOverride;
      for (const mesh of this._hidden) mesh.visible = true;
      renderer.setRenderTarget(previousTarget);
      renderer.setClearColor(this._clearColor, previousClearAlpha);
    }
    return true;
  }

  /** 浏览器回归只在显式调用时读一次，正式帧绝不制造 GPU 同步点。 */
  AuditDepth() {
    const bytes = new Uint8Array(this.size * this.size * 4);
    this.renderer.readRenderTargetPixels(this.target, 0, 0, this.size, this.size, bytes);
    let nonClear = 0;
    for (let i = 0; i < bytes.length; i += 4) {
      if (bytes[i] < 250 || bytes[i + 1] < 250 || bytes[i + 2] < 250) nonClear += 1;
    }
    return { size: this.size, nonClear };
  }

  Status() {
    const isolated = this.meshes.every((mesh) => mesh.layers.isEnabled(FIRST_PERSON_SHADOW_LAYER)
      && !mesh.layers.isEnabled(0));
    return {
      enabled: this.enabled,
      size: this.size,
      soft: this.soft,
      radiusTexels: this.uniforms.radius.value,
      renderedFrames: this.renderedFrames,
      meshes: this.meshes.length,
      casters: this.casters.length,
      materials: this.ownedMaterials.size,
      isolated,
      worldCasterLeak: this.meshes.some((mesh) => mesh.castShadow),
    };
  }

  Dispose() {
    this.SetEnabled(false);
    this.target.dispose();
    this.depthMaterial.dispose();
    for (const material of this.ownedMaterials) material.dispose();
    this.ownedMaterials.clear();
  }
}

export default FirstPersonSelfShadow;
