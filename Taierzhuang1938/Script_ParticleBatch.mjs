import * as THREE from 'three';
import {MarkNoPrepass} from './Script_Post.mjs';
import {GLSL_NOISE, GLSL_VERT_HELPERS, VERT_PARTICLE, FRAG_PARTICLE, VERT_DEBRIS, FRAG_DEBRIS} from './Script_ParticleShaders.mjs';
import {PARTICLE_VOLUME} from './Data_Tuning_Particles.mjs';

export function MakeQuadGeometry() {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(
    [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  return geometry;
}

/**
 * 沿 x 切成 segments 段的长条（x 仍是 -1..1，y 是 ±1）。只有光束池用：一条光束从几十米外
 * 一直拉到相机身边，线宽的像素保底/上限按**顶点**离相机的距离算，四个角的面片只能在两端
 * 之间线性插值 —— 中间离相机最近的那一段会胀成一个楔子。切段之后每一截各按自己的距离收宽。
 */
function MakeStripGeometry(segments) {
  const geometry = new THREE.InstancedBufferGeometry();
  const positions = [], index = [];
  for (let i = 0; i <= segments; i += 1) {
    const x = -1 + (2 * i) / segments;
    positions.push(x, -1, 0, x, 1, 0);
    if (i < segments) {
      const a = i * 2;
      index.push(a, a + 2, a + 3, a, a + 3, a + 1);
    }
  }
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  return geometry;
}

export class ParticleBatch {
  /**
   * @param {number} capacity 槽位数
   * @param {object} config shape / orient / blending / lit / bounce / softRange / renderOrder
   * @param {object} shared 共享 uniform（uTime/uNormalDepth/... 全池同一份对象引用）
   */
  constructor(capacity, config, shared, modules = {}) {
    this.capacity = Math.max(4, capacity | 0);
    this.cursor = 0;
    this.config = config;
    this.deathTime = new Float32Array(this.capacity);   // CPU 侧只留死亡时刻，用来算 instanceCount
    this.dirtyMin = Infinity;
    this.dirtyMax = -Infinity;

    const geometry = config.segments ? MakeStripGeometry(config.segments) : MakeQuadGeometry();
    const n = this.capacity;
    this.arrays = {
      iSpawnLife: new Float32Array(n * 2),
      iOrigin: new Float32Array(n * 3),
      iVelocity: new Float32Array(n * 3),
      iAccel: new Float32Array(n * 3),
      iSize: new Float32Array(n * 2),
      iSpin: new Float32Array(n * 2),
      iColorA: new Float32Array(n * 3),
      iColorB: new Float32Array(n * 3),
      iEmitterColor: new Float32Array(n * 4),
      iParams: new Float32Array(n * 4),
      iExtra: new Float32Array(n * 4),
    };
    if (config.orient === "normal") this.arrays.iNormal = new Float32Array(n * 3);

    this.attributes = {};
    for (const [name, array] of Object.entries(this.arrays)) {
      const itemSize = array.length / n;
      const attribute = new THREE.InstancedBufferAttribute(array, itemSize);
      attribute.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute(name, attribute);
      this.attributes[name] = attribute;
    }
    geometry.instanceCount = 0;
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);   // 关掉视锥剔除，粒子在 shader 里飞
    this.geometry = geometry;

    const defines = {};
    defines[`SHAPE_${config.shape.toUpperCase()}`] = "";
    if (config.orient === "normal") defines.ORIENT_NORMAL = "";
    else if (config.orient === "stretch") defines.ORIENT_STRETCH = "";
    if (config.lit) defines.LIT = "";
    if (config.litSurface) defines.LIT_SURFACE = "";
    if (config.bounce) defines.GROUND_BOUNCE = "";
    if (config.aerial) defines.AERIAL = "";
    if (config.sprite?.authoredColor) defines.SPRITE_AUTHORED_COLOR = "";
    if (config.mask?.fire) defines.MASKED_FIRE = "";
    if(config.lit&&(config.shape==='puff'||config.shape==='masked'&&!config.mask?.fire)){
      defines.VOLUME_SMOKE='';defines.PARTICLE_VOLUME_STEPS=PARTICLE_VOLUME.steps[config.quality]||PARTICLE_VOLUME.steps.high;
    }

    const preserveTargetAlpha = !!config.preserveTargetAlpha;
    this.material = new THREE.ShaderMaterial({
      defines,
      uniforms: Object.assign({}, shared, modules, {
        uSoftRange: { value: config.softRange ?? 0.6 },
        uParticleAspect: {value:1},
        uParticleVolume: {value:new THREE.Vector2(PARTICLE_VOLUME.extinction,PARTICLE_VOLUME.shadow)},
        uFadeOutStart: { value: config.fadeOutStart ?? 0.45 },
        uSpriteMap: { value: config.sprite ? config.sprite.texture : shared.uSpriteMap.value },
        uSpriteGrid: {
          value: config.sprite
            ? new THREE.Vector2(config.sprite.grid[0], config.sprite.grid[1])
            : shared.uSpriteGrid.value,
        },
        uSpriteFrames: { value: config.sprite ? config.sprite.frames : shared.uSpriteFrames.value },
        uSpriteEmission: { value: config.sprite?.emission ?? 1 },
        uMaskMap: { value: config.mask?.texture ?? shared.uMaskMap.value },
        uMaskNoiseMap: { value: config.mask?.noise ?? shared.uMaskNoiseMap.value },
        uMaskNoiseDetailMap: { value: config.mask?.detailNoise ?? shared.uMaskNoiseDetailMap.value },
        uMaskEmission: { value: config.mask?.emission ?? 1 },
        uDecalBaseMap: { value: config.decal?.base ?? shared.uDecalBaseMap.value },
        uDecalNormalMap: { value: config.decal?.normal ?? shared.uDecalNormalMap.value },
        uDecalOrmMap: { value: config.decal?.orm ?? shared.uDecalOrmMap.value },
        uDecalReady: { value: config.decal?.ready ?? 0 },
        // 预警准星池的三个分层色；其余池的着色器里没有这几个 uniform，three 不会上传。
        uMarkerSoil: { value: new THREE.Vector3(...(config.marker?.soil ?? [0, 0, 0])) },
        uMarkerDust: { value: new THREE.Vector3(...(config.marker?.dust ?? [0, 0, 0])) },
        uMarkerHot: { value: new THREE.Vector3(...(config.marker?.hot ?? [0, 0, 0])) },
      }),
      vertexShader: `${GLSL_VERT_HELPERS}\n${VERT_PARTICLE}`,
      fragmentShader: `${GLSL_NOISE}\n${FRAG_PARTICLE}`,
      transparent: true,
      depthTest: true,
      depthWrite: false,                 // 半透明粒子写深度 = 互相切出硬边
      // 默认 NormalBlending 会把离屏 HDR 靶的 alpha 也按 srcAlpha 混低：贴花越深，
      // 承载物在后续链路里越像“透明了”。贴花只改 RGB，alpha 必须原样保留。
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: config.blending === THREE.AdditiveBlending ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor,
      blendEquation: THREE.AddEquation,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
      blendEquationAlpha: THREE.AddEquation,
      side: THREE.DoubleSide,
      polygonOffset: !!config.polygonOffset,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
    });
    this.material.userData.preserveTargetAlpha = true;
    this.material.userData.particleBackend = 'modules';
    // 粒子是加性/半透明的 billboard：进了深度法线预通道就会在 SSAO 里
    // 挖出一片乱码，还会把体积光的天空判据搞坏。
    MarkNoPrepass(this.material);

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = config.renderOrder ?? 0;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.matrixAutoUpdate = false;
    if (config.hideWhenIdle) this.mesh.visible = false;
  }

  /** 环形分配：满了就覆盖最老的那个（弹孔的先进先出也靠这条）。 */
  Spawn(s, now) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    const a = this.arrays;
    a.iSpawnLife[i * 2] = now;
    a.iSpawnLife[i * 2 + 1] = s.life;
    a.iOrigin[i * 3] = s.x; a.iOrigin[i * 3 + 1] = s.y; a.iOrigin[i * 3 + 2] = s.z;
    a.iVelocity[i * 3] = s.vx; a.iVelocity[i * 3 + 1] = s.vy; a.iVelocity[i * 3 + 2] = s.vz;
    a.iAccel[i * 3] = s.ax; a.iAccel[i * 3 + 1] = s.ay; a.iAccel[i * 3 + 2] = s.az;
    a.iSize[i * 2] = s.sizeStart; a.iSize[i * 2 + 1] = s.sizeEnd;
    a.iSpin[i * 2] = s.angle; a.iSpin[i * 2 + 1] = s.spin;
    a.iColorA[i * 3] = s.colorA[0]; a.iColorA[i * 3 + 1] = s.colorA[1]; a.iColorA[i * 3 + 2] = s.colorA[2];
    a.iColorB[i * 3] = s.colorB[0]; a.iColorB[i * 3 + 1] = s.colorB[1]; a.iColorB[i * 3 + 2] = s.colorB[2];
    a.iEmitterColor.set(s.emitterColor||[1,1,1,1],i*4);
    a.iParams[i * 4] = s.opacity; a.iParams[i * 4 + 1] = s.fadeIn;
    a.iParams[i * 4 + 2] = s.drag; a.iParams[i * 4 + 3] = s.seed;
    a.iExtra[i * 4] = s.stretch; a.iExtra[i * 4 + 1] = s.flicker;
    // iExtra.w：序列帧池放起始帧，拉伸池放像素保底半宽（两者从不同池里出，不冲突）
    a.iExtra[i * 4 + 2] = s.groundY;
    a.iExtra[i * 4 + 3] = (this.config.orient === "stretch" ? s.minPx : s.frame) || 0;
    if (a.iNormal) {
      a.iNormal[i * 3] = s.nx; a.iNormal[i * 3 + 1] = s.ny; a.iNormal[i * 3 + 2] = s.nz;
    }
    this.deathTime[i] = now + s.life;
    if (i < this.dirtyMin) this.dirtyMin = i;
    if (i > this.dirtyMax) this.dirtyMax = i;
    return i;
  }

  /**
   * 每帧一次：把脏区间提交，并把 instanceCount 收到"最高的活槽 + 1"。
   * 只提交区间而不是整块，是因为整块上传（约 116 B × capacity）在连发时
   * 每帧都要走一遍 PCIe，白白吃掉几个百分点的帧时间。
   */
  Flush(now) {
    if (this.dirtyMax >= this.dirtyMin) {
      const lo = this.dirtyMin, hi = this.dirtyMax;
      for (const attribute of Object.values(this.attributes)) {
        const itemSize = attribute.itemSize;
        attribute.addUpdateRange(lo * itemSize, (hi - lo + 1) * itemSize);
        attribute.needsUpdate = true;
      }
      this.dirtyMin = Infinity;
      this.dirtyMax = -Infinity;
    }
    let last = -1;
    const death = this.deathTime;
    for (let i = this.capacity - 1; i >= 0; i -= 1) {
      if (death[i] > now) { last = i; break; }
    }
    this.geometry.instanceCount = last + 1;
    // 只在一次演出里用得到的池（开场近爆的泥浆）：空着就整只藏起来，不占每帧的 program 绑定。
    // 关卡预热的「全场强制出画」会把藏着的网格翻出来画一帧，着色器照样在加载画面后面编掉。
    this.mesh.visible=this.enabled!==false&&(!this.config.hideWhenIdle||last>=0);
  }

  Clear() {
    this.deathTime.fill(0);
    this.arrays.iSpawnLife.fill(0);
    this.dirtyMin = 0;
    this.dirtyMax = this.capacity - 1;
    this.geometry.instanceCount = 0;
  }

  Dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

export class ParticleMeshBatch {
  /**
   * @param {object} [options]
   *   shape：换掉单位方块的源几何（约 1 m 见方、有 position/normal，可带索引），着色器不变 ——
   *     与方块池共用同一个 program，不多一次编译。开场近爆的土块/木片用（MakeClodGeometry / MakeSplinterGeometry）。
   *   hideWhenIdle：空着时藏起整只网格（只在一场演出里用的池，不占每帧的绑定）。
   */
  constructor(capacity, shared, options = {}, modules = {}) {
    const {shape=null,hideWhenIdle=false}=options;this.config=options;
    this.capacity = Math.max(4, capacity | 0);
    this.cursor = 0;
    this.deathTime = new Float32Array(this.capacity);
    this.dirtyMin = Infinity;
    this.dirtyMax = -Infinity;
    this.hideWhenIdle = hideWhenIdle;

    const box = shape ? shape.clone() : new THREE.BoxGeometry(1, 1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute("position", box.getAttribute("position"));
    geometry.setAttribute("normal", box.getAttribute("normal"));
    if (box.getIndex()) geometry.setIndex(box.getIndex());
    // 只是借它的 position/normal/index，**不能 dispose**：dispose 会把这几个
    // attribute 从渲染器的缓冲表里摘掉，而它们现在归这张实例化几何所有。
    // 源几何本身没上过 GPU，交给 GC 就行。

    const n = this.capacity;
    this.arrays = {
      iSpawnLife: new Float32Array(n * 2),
      iOrigin: new Float32Array(n * 3),
      iVelocity: new Float32Array(n * 3),
      iScale: new Float32Array(n * 3),
      iAcceleration: new Float32Array(n * 3),
      iInitialRotation: new Float32Array(n),
      iOpacity: new Float32Array(n),
      iSpin: new Float32Array(n * 3),
      iColor: new Float32Array(n * 3),
      iParams: new Float32Array(n * 4),
    };
    this.attributes = {};
    for (const [name, array] of Object.entries(this.arrays)) {
      const attribute = new THREE.InstancedBufferAttribute(array, array.length / n);
      attribute.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute(name, attribute);
      this.attributes[name] = attribute;
    }
    geometry.instanceCount = 0;
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.geometry = geometry;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: shared.uTime, uSunDirection: shared.uSunDirection,
        uSunColor: shared.uSunColor, uSkyColor: shared.uSkyColor,
        uParticleAspect: {value:1},
        ...modules,
        uMeshSurface:{value:new THREE.Vector2(options.metalness||0,options.roughness??.9)},
      },
      vertexShader: VERT_DEBRIS,
      fragmentShader: FRAG_DEBRIS,
      transparent: false,
      depthWrite: true,
      side: THREE.FrontSide,
    });
    this.material.userData.particleBackend='modules';
    // 粒子是加性/半透明的 billboard：进了深度法线预通道就会在 SSAO 里
    // 挖出一片乱码，还会把体积光的天空判据搞坏。
    MarkNoPrepass(this.material);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.matrixAutoUpdate = false;
    if (hideWhenIdle) this.mesh.visible = false;
  }

  Spawn(d, now) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    const a = this.arrays;
    a.iSpawnLife[i * 2] = now; a.iSpawnLife[i * 2 + 1] = d.life;
    a.iOrigin[i * 3] = d.x; a.iOrigin[i * 3 + 1] = d.y; a.iOrigin[i * 3 + 2] = d.z;
    a.iVelocity[i * 3] = d.vx; a.iVelocity[i * 3 + 1] = d.vy; a.iVelocity[i * 3 + 2] = d.vz;
    a.iScale[i * 3] = d.sx; a.iScale[i * 3 + 1] = d.sy; a.iScale[i * 3 + 2] = d.sz;
    a.iAcceleration.set(d.force||[0,-9.81,0],i*3);a.iInitialRotation[i]=d.initialRotation||0;
    a.iOpacity[i]=d.opacity??1;
    a.iSpin[i * 3] = d.rx; a.iSpin[i * 3 + 1] = d.ry; a.iSpin[i * 3 + 2] = d.rz;
    a.iColor[i * 3] = d.color[0]; a.iColor[i * 3 + 1] = d.color[1]; a.iColor[i * 3 + 2] = d.color[2];
    a.iParams[i * 4] = d.drag; a.iParams[i * 4 + 1] = d.groundY;
    a.iParams[i * 4 + 2] = d.bounce; a.iParams[i * 4 + 3] = d.seed;
    this.deathTime[i] = now + d.life;
    if (i < this.dirtyMin) this.dirtyMin = i;
    if (i > this.dirtyMax) this.dirtyMax = i;
    return i;
  }

  Flush(now) {
    if (this.dirtyMax >= this.dirtyMin) {
      const lo = this.dirtyMin, hi = this.dirtyMax;
      for (const attribute of Object.values(this.attributes)) {
        attribute.addUpdateRange(lo * attribute.itemSize, (hi - lo + 1) * attribute.itemSize);
        attribute.needsUpdate = true;
      }
      this.dirtyMin = Infinity;
      this.dirtyMax = -Infinity;
    }
    let last = -1;
    for (let i = this.capacity - 1; i >= 0; i -= 1) {
      if (this.deathTime[i] > now) { last = i; break; }
    }
    this.geometry.instanceCount = last + 1;
    this.mesh.visible=this.enabled!==false&&(!this.hideWhenIdle||last>=0);
  }

  Clear() {
    this.deathTime.fill(0);
    this.arrays.iSpawnLife.fill(0);
    this.dirtyMin = 0; this.dirtyMax = this.capacity - 1;
    this.geometry.instanceCount = 0;
  }

  Dispose() { this.geometry.dispose(); this.material.dispose(); }
}
