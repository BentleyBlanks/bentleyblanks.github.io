// ===========================================================================
// Script_FirstLevelNightLights.mjs —— 关尾北门夜景的火盆/马灯点光
//
// night 预设曝光低：**没有点光的白盒会糊成一团**（口径见 Data_CutsceneBeimenBreakout
// 文件头「夜预设曝光 3.6：没有点光的地方就是黑的」）。所以夜景那一片必须自带光源。
//
// 两条纪律：
//   1. **不投影**。一帧只许烘一张阴影，几盏气氛点光一律 `castShadow = false`。
//   2. 只在夜景真的出现时存在（`Sync(specs)` 传空数组就全拆掉）—— 阶段回跳、
//      重试、白天那几步都不许留下一盏灯。
//
// 光的位置与强度由 Script_FirstLevelNightGate 按 Data_Tuning_FirstLevelEnd 算好后
// 传进来；本文件只管 three 那一侧。
// ===========================================================================
import * as THREE from "three";

export class FirstLevelNightLights {
  constructor({ scene }) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = "FirstLevelNightGateLights";
    this.root.visible = false;
    scene.add(this.root);
    this.lights = new Map();
  }
  /** specs: [{id,x,y,z,color,intensity,distanceM,decay}]，空数组＝全部拆掉。 */
  Sync(specs = []) {
    const wanted = new Set(specs.map(spec => spec.id));
    for (const [id, light] of this.lights)
      if (!wanted.has(id)) { light.removeFromParent(); light.dispose?.(); this.lights.delete(id); }
    for (const spec of specs) {
      let light = this.lights.get(spec.id);
      if (!light) {
        light = new THREE.PointLight(spec.color, spec.intensity, spec.distanceM, spec.decay);
        light.name = `NightGateLight_${spec.id}`;
        light.castShadow = false;
        this.root.add(light);
        this.lights.set(spec.id, light);
      }
      light.position.set(spec.x, spec.y, spec.z);
      light.color.setHex(spec.color);
      light.intensity = spec.intensity;
      light.distance = spec.distanceM;
      light.decay = spec.decay;
    }
    this.root.visible = this.lights.size > 0;
    return this.lights.size;
  }
  get count() { return this.lights.size; }
  Dispose() {
    this.Sync([]);
    this.root.removeFromParent();
  }
}
