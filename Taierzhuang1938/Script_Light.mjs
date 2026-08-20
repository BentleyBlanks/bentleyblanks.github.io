// 《血战台儿庄》灯光装置：太阳（含跟随式阴影框）、半球补光、火光池、枪口闪光。
//
// 阴影是"3A 与网页 demo"的第一道分水岭。要点：
//  - 平行光的正交阴影框必须**跟着玩家走**并且尽量小：框开到 500 米，2048 的图
//    每个纹素 24cm，砖墙的影子就是一条锯齿。这里框只开 62 米。
//  - 框的移动必须**吸附到纹素网格**，否则玩家一走动，所有阴影边缘就在那儿爬行
//    （shadow shimmering），比锯齿更廉价。
//  - normalBias 比 bias 好使：斜面上的自阴影痤疮靠它，而不是靠把 bias 调大到
//    影子整个飘起来（peter-panning）。

import * as THREE from "three";

const SHADOW_SIZE = { low: 1024, medium: 2048, high: 4096, ultra: 4096 };

export class LightRig {
  constructor(scene, { quality = "high", shadowExtent = 62 } = {}) {
    this.scene = scene;
    this.shadowExtent = shadowExtent;
    this.quality = quality;

    this.sun = new THREE.DirectionalLight(0xffffff, 3.0);
    this.sun.castShadow = quality !== "low";
    const mapSize = SHADOW_SIZE[quality] ?? 2048;
    this.sun.shadow.mapSize.set(mapSize, mapSize);
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 260;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.radius = quality === "low" ? 1 : 2.2;
    this.sun.shadow.blurSamples = 12;
    this.sun.target = new THREE.Object3D();
    scene.add(this.sun);
    scene.add(this.sun.target);

    // 探针体接管间接光之后，半球光要让位（见 SetGiActive）
    this.hemiBase = 0.6;
    this.giFill = 1;

    // 半球光只做"天空冷 / 地面暖"的方向性补光。真正的间接光靠 scene.environment，
    // 这一盏只是把 IBL 撑不起来的那一点点方向感补上，强度必须小。
    this.hemi = new THREE.HemisphereLight(0x8899aa, 0x4a4034, 0.6);
    scene.add(this.hemi);

    this.fireLights = [];
    this.fireStates = [];
    for (let i = 0; i < 6; i += 1) {
      const light = new THREE.PointLight(0xff7a2a, 0, 24, 2);
      light.castShadow = false;
      light.visible = false;
      scene.add(light);
      this.fireLights.push(light);
      this.fireStates.push({ active: false, base: 0, seed: i * 37.13, radius: 18 });
    }

    // 枪口闪光：一盏，抢用。开火那一帧亮 2 帧就灭 —— 长亮就成手电筒了。
    this.muzzle = new THREE.PointLight(0xffd9a0, 0, 22, 2);
    this.muzzle.visible = false;
    scene.add(this.muzzle);
    this.muzzleTimer = 0;

    this.sunDirection = new THREE.Vector3(0, 1, 0);
  }

  /**
   * 半球光与探针体的分工。
   *
   * 半球光原本干的是「天空把冷色洒到朝上的面」这件事 —— 而这正是探针体算得
   * **更准**的那一部分（它还知道头顶有没有屋顶）。两个一起开就是双份天光，
   * 屋里会亮得像在院子里。所以 GI 一上，半球光退成一点点底噪：
   * 探针还没收敛的那一两帧、以及探针体外的远景，靠它兜着不至于死黑。
   */
  SetGiActive(active) {
    this.giFill = active ? 0.3 : 1;
    this.hemi.intensity = this.hemiBase * this.giFill;
  }

  /** 套用 SKY_PRESETS 里那一份光照参数。 */
  ApplyPreset(preset, sunDirection) {
    this.sun.color.setHex(preset.lightColor);
    this.sun.intensity = preset.lightIntensity;
    this.hemi.color.setHex(preset.hemiSky);
    this.hemi.groundColor.setHex(preset.hemiGround);
    this.hemiBase = preset.hemiIntensity;
    this.hemi.intensity = this.hemiBase * this.giFill;
    this.sunDirection.copy(sunDirection).normalize();
    this.sun.castShadow = this.quality !== "low" && preset.lightIntensity > 0.35;
  }

  /**
   * 每帧把阴影框挪到玩家前方，并吸附到纹素网格。
   * @param {THREE.Vector3} focus 玩家位置
   * @param {THREE.Vector3} forward 视线朝向（水平分量）
   */
  UpdateShadowFrustum(focus, forward) {
    const extent = this.shadowExtent;
    // 阴影框中心往前推 1/4 框宽：玩家看得见的东西比背后多
    const ahead = new THREE.Vector3(forward.x, 0, forward.z);
    if (ahead.lengthSq() > 1e-6) ahead.normalize().multiplyScalar(extent * 0.22);
    else ahead.set(0, 0, 0);
    const center = focus.clone().add(ahead);

    const cam = this.sun.shadow.camera;
    cam.left = -extent; cam.right = extent;
    cam.top = extent; cam.bottom = -extent;

    // 纹素吸附：把中心投到光空间，量化到纹素，再投回来
    const mapSize = this.sun.shadow.mapSize.x;
    const texelWorld = (extent * 2) / mapSize;
    const lightDir = this.sunDirection;
    const up = Math.abs(lightDir.y) > 0.98 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, lightDir).normalize();
    const trueUp = new THREE.Vector3().crossVectors(lightDir, right).normalize();
    const px = Math.round(center.dot(right) / texelWorld) * texelWorld;
    const py = Math.round(center.dot(trueUp) / texelWorld) * texelWorld;
    const pz = center.dot(lightDir);
    const snapped = new THREE.Vector3()
      .addScaledVector(right, px)
      .addScaledVector(trueUp, py)
      .addScaledVector(lightDir, pz);

    this.sun.target.position.copy(snapped);
    this.sun.position.copy(snapped).addScaledVector(lightDir, 130);
    this.sun.target.updateMatrixWorld();
    cam.updateProjectionMatrix();
  }

  /** 点一处火：返回句柄，可以再关掉。位置固定的火（着火的房子、燃烧的战车）。 */
  AddFire(position, { intensity = 6, radius = 20, color = 0xff7a2a } = {}) {
    const index = this.fireStates.findIndex((s) => !s.active);
    if (index < 0) return -1;
    const light = this.fireLights[index];
    light.position.copy(position);
    light.color.setHex(color);
    light.distance = radius;
    light.visible = true;
    this.fireStates[index].active = true;
    this.fireStates[index].base = intensity;
    this.fireStates[index].radius = radius;
    return index;
  }

  RemoveFire(handle) {
    if (handle < 0 || handle >= this.fireStates.length) return;
    this.fireStates[handle].active = false;
    this.fireLights[handle].visible = false;
    this.fireLights[handle].intensity = 0;
  }

  ClearFires() {
    for (let i = 0; i < this.fireStates.length; i += 1) this.RemoveFire(i);
  }

  /** 开火：闪一下。position 用枪口世界坐标。 */
  FlashMuzzle(position, intensity = 26) {
    this.muzzle.position.copy(position);
    this.muzzle.intensity = intensity;
    this.muzzle.visible = true;
    this.muzzleTimer = 0.055;
  }

  Update(dt, elapsed) {
    // 火焰闪烁：两个不同频率的正弦叠一点噪声。单频率会看出规律的"呼吸"
    for (let i = 0; i < this.fireStates.length; i += 1) {
      const state = this.fireStates[i];
      if (!state.active) continue;
      const t = elapsed * 1.0 + state.seed;
      const flicker = 0.72
        + 0.18 * Math.sin(t * 7.3)
        + 0.10 * Math.sin(t * 17.9 + 1.7)
        + 0.08 * Math.sin(t * 31.1 + 3.1);
      this.fireLights[i].intensity = state.base * Math.max(0.28, flicker);
    }
    if (this.muzzleTimer > 0) {
      this.muzzleTimer -= dt;
      if (this.muzzleTimer <= 0) {
        this.muzzle.visible = false;
        this.muzzle.intensity = 0;
      } else {
        this.muzzle.intensity *= 0.55;
      }
    }
  }

  Dispose() {
    this.scene.remove(this.sun, this.sun.target, this.hemi, this.muzzle);
    for (const l of this.fireLights) this.scene.remove(l);
  }
}
