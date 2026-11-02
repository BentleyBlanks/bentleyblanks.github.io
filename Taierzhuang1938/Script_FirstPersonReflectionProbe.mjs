// 第一人称本地反射图（2026-11-02，用户：背向太阳时枪这么黑）。
//
// 汉阳造 173R 的钢件是纯金属，只能映出别处的光。改之前视模只有一张天空 IBL（×0.34）可映，
// 背光时镜面方向对着前方晒亮的地面与沟壁，映到的却是 IBL 下半球那块暗地色，整块发黑。
// 照 COD 的路子（IW 起「反射探针是一等公民」、黑色行动 2 的反射跟着当地亮度走）：
// 在玩家眼睛处拍一张低分辨率立方体图，预滤波成 PMREM，只给视模材质当 envMap。
//
//   · 只给 Script_FirstPersonSelfShadow 克隆出来的那份视模材质（userData.firstPersonSelfShadow），
//     世界材质与共享底材一个都不碰；没有那份克隆（自阴影从没开过）就什么都不做。
//   · 视模网格独占 FIRST_PERSON_SHADOW_LAYER，立方体相机只看第 0 层，枪手自己天然不进图；
//     第一人称身体在第 0 层，拍的时候临时藏（hidden 回调）。
//   · 屏幕空间输入在立方体面里是错位的（AO / SSIL / 接触阴影按 gl_FragCoord 采主画面那张靶，
//     簇状光的簇表按主相机的视锥建），拍的时候由 suspendScreenSpace 回调临时归零，拍完还原。
//   · 远平面只到身边一圈（tuning.far），外面用天空 IBL 当背景补上，亮度按当前环境反射强度。
//   · 每 faceEveryFrames 帧拍 facesPerFrame 面，六面拍完才整张预滤波、换上；离上次拍摄点走开 moveM 米或隔
//     maxAgeS 秒重拍；站着不动没有额外开销（只剩按时重拍）。拍摄排在主画面出画之后：阴影图已经烘过，这一趟不再烘（needsUpdate 关掉）。
//   · 立方体边长与天空 IBL 的 PMREM 同尺寸：CUBEUV 常量一致，换上时视模材质不另编程序。
// 画质面板「第一人称：本地反射」关掉就把 envMap 还给 null（退回天空 IBL），即改之前的样子。
// 参数在 Data_Tuning_FirstPersonLighting.reflection。

import * as THREE from "three";
import { FIRST_PERSON_LIGHTING } from "./Data_Tuning_FirstPersonLighting.mjs";

const FACES = 6;

export class FirstPersonReflectionProbe {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene} scene
   * @param {object} options
   * @param {() => Iterable<THREE.Material>} options.materials 视模那份克隆材质（FirstPersonSelfShadow.ownedMaterials）
   * @param {() => THREE.Object3D[]} [options.hidden]          拍的时候要藏的东西（第一人称身体、枪手根）
   * @param {() => (() => void)} [options.suspendScreenSpace]  归零屏幕空间输入，返回还原函数
   * @param {boolean} [options.enabled=true]
   */
  constructor(renderer, scene, { materials, hidden = null, suspendScreenSpace = null, enabled = true } = {}) {
    const R = FIRST_PERSON_LIGHTING.reflection;
    this.renderer = renderer;
    this.scene = scene;
    this.materials = materials;
    this.hidden = hidden;
    this.suspendScreenSpace = suspendScreenSpace;
    this.enabled = enabled !== false;
    this.size = R.size;
    this.cubeTarget = new THREE.WebGLCubeRenderTarget(R.size, {
      type: THREE.HalfFloatType,
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
    });
    this.cubeTarget.texture.name = "FirstPersonReflectionCube";
    this.cubeCamera = new THREE.CubeCamera(R.near, R.far, this.cubeTarget);
    this.cubeCamera.name = "FirstPersonReflectionCamera";
    this.cubeCamera.coordinateSystem = renderer.coordinateSystem;
    this.cubeCamera.updateCoordinateSystem();
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.pmremTarget = null;
    this.capturePos = new THREE.Vector3();
    this.lastPos = new THREE.Vector3();
    this.face = -1;          // -1 = 闲着；0…5 = 正在拍第几面
    this.age = 0;
    this.ready = false;
    this.dirty = true;
    this.captures = 0;
    this.facesRendered = 0;
    this.frameCounter = 0;
    this.assigned = new Map();   // 材质 → 换上之前的 { envMap, envMapIntensity }
  }

  /** 画质面板热切。关掉立刻把视模材质的 envMap 还回去。 */
  SetEnabled(on) {
    const next = on !== false;
    if (next === this.enabled) return this.enabled;
    this.enabled = next;
    if (!next) { this._Restore(); this.face = -1; } else this.dirty = true;
    return this.enabled;
  }

  /** 天光换档、跳段之类要立刻重拍时调。 */
  Invalidate() { this.dirty = true; }

  /**
   * 每帧一次，排在主画面出画之后。
   * @param {number} dt
   * @param {THREE.Vector3} eye 这一帧的相机世界位置
   * @param {boolean} active 第一人称枪手这一帧画不画（菜单、过场、预演时不拍）
   */
  Update(dt, eye, active = true) {
    if (!this.enabled) return false;
    const R = FIRST_PERSON_LIGHTING.reflection;
    this.age += Math.max(0, Number(dt) || 0);
    if (!active) return false;
    if (this.face < 0) {
      const moved = this.ready ? eye.distanceTo(this.lastPos) : Infinity;
      if (this.ready && !this.dirty && moved < R.moveM && this.age < R.maxAgeS) { this._Assign(); return false; }
      this.capturePos.copy(eye);
      this.face = 0;
      this.dirty = false;
    }
    // 隔帧拍：第一张（还没有可用的图）不等，拍完越快越好
    this.frameCounter = (this.frameCounter + 1) % Math.max(1, R.faceEveryFrames | 0 || 1);
    if (this.ready && this.frameCounter !== 0) { this._Assign(); return false; }
    const count = Math.max(1, Math.min(FACES, R.facesPerFrame | 0 || 1));
    this._RenderFaces(this.face, Math.min(FACES, this.face + count));
    this.face += count;
    if (this.face >= FACES) {
      this.pmremTarget = this.pmrem.fromCubemap(this.cubeTarget.texture, this.pmremTarget);
      this.pmremTarget.texture.name = "FirstPersonReflectionPmrem";
      this.lastPos.copy(this.capturePos);
      this.face = -1;
      this.age = 0;
      this.ready = true;
      this.captures += 1;
    }
    this._Assign();
    return true;
  }

  _RenderFaces(from, to) {
    const renderer = this.renderer, scene = this.scene;
    const cameras = this.cubeCamera.children;
    this.cubeCamera.position.copy(this.capturePos);
    this.cubeCamera.updateMatrixWorld(true);
    const previousTarget = renderer.getRenderTarget();
    const previousFace = renderer.getActiveCubeFace();
    const previousMip = renderer.getActiveMipmapLevel();
    const previousAutoClear = renderer.autoClear;
    const previousXr = renderer.xr.enabled;
    const shadowMap = renderer.shadowMap;
    const previousShadowNeedsUpdate = shadowMap.needsUpdate;
    const background = scene.background, backgroundIntensity = scene.backgroundIntensity;
    const backgroundBlurriness = scene.backgroundBlurriness;
    const hidden = [];
    for (const object of this.hidden?.() || []) {
      if (object?.visible) { object.visible = false; hidden.push(object); }
    }
    const restoreScreenSpace = this.suspendScreenSpace?.() || null;
    try {
      shadowMap.needsUpdate = false;
      renderer.xr.enabled = false;
      renderer.autoClear = true;
      // 远平面外（含天穹那颗大球）用天空 IBL 补：与视模原来映的是同一张图、同一个强度
      if (scene.environment) {
        scene.background = scene.environment;
        scene.backgroundIntensity = scene.environmentIntensity ?? 1;
        scene.backgroundBlurriness = 0;
      }
      for (let i = from; i < to; i += 1) {
        renderer.setRenderTarget(this.cubeTarget, i);
        renderer.render(scene, cameras[i]);
        this.facesRendered += 1;
      }
    } finally {
      scene.background = background;
      scene.backgroundIntensity = backgroundIntensity;
      scene.backgroundBlurriness = backgroundBlurriness;
      restoreScreenSpace?.();
      for (const object of hidden) object.visible = true;
      shadowMap.needsUpdate = previousShadowNeedsUpdate;
      renderer.autoClear = previousAutoClear;
      renderer.xr.enabled = previousXr;
      renderer.setRenderTarget(previousTarget, previousFace, previousMip);
    }
  }

  /** 换枪会换视模那份克隆材质，所以每帧对一遍（只有几只材质）。 */
  _Assign() {
    if (!this.ready || !this.pmremTarget) return;
    const texture = this.pmremTarget.texture;
    const intensity = FIRST_PERSON_LIGHTING.reflection.intensity;
    for (const material of this.materials?.() || []) {
      if (!material?.isMeshStandardMaterial || !material.userData?.firstPersonSelfShadow) continue;
      // 第一次见到就登记，哪怕它已经挂着本地反射图：伤口 / 皮肤变体是从**已经换过**的视模材质克隆来的，
      // 进来时 envMap 就是这张图，不登记的话关掉本地反射时它还不回去。这种的原样记成 null（天空 IBL）。
      if (!this.assigned.has(material)) {
        this.assigned.set(material, {
          envMap: material.envMap === texture ? null : material.envMap,
          envMapIntensity: material.envMapIntensity,
        });
      }
      if (material.envMap === texture) continue;
      material.envMap = texture;
      material.envMapIntensity = intensity;
    }
  }

  _Restore() {
    for (const [material, saved] of this.assigned) {
      material.envMap = saved.envMap;
      material.envMapIntensity = saved.envMapIntensity;
    }
    this.assigned.clear();
  }

  Status() {
    return {
      enabled: this.enabled,
      ready: this.ready,
      size: this.size,
      captures: this.captures,
      facesRendered: this.facesRendered,
      capturing: this.face >= 0,
      age: this.age,
      materials: [...this.assigned.keys()].filter((m) => m.envMap === this.pmremTarget?.texture).length,
      position: this.ready ? this.lastPos.toArray().map((v) => +v.toFixed(2)) : null,
    };
  }

  Dispose() {
    this._Restore();
    this.cubeTarget.dispose();
    this.pmremTarget?.dispose();
    this.pmrem.dispose();
  }
}

export default FirstPersonReflectionProbe;
