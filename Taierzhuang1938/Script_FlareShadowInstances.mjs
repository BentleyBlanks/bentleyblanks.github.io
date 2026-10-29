// Shadow-only policy for the common exact instance subset engine.
import * as THREE from 'three';
import {ShadowDepthFor} from './Script_ShadowDepth.mjs';
import {FLARE_SHADOW as CFG} from './Data_Tuning_FlareEffects.mjs';
import {InstanceFrustumScope} from './Script_InstanceFrustumScope.mjs';
const BeforeShadow=THREE.Object3D.prototype.onBeforeShadow,AfterShadow=THREE.Object3D.prototype.onAfterShadow;
export class FlareShadowInstances extends InstanceFrustumScope {
  constructor({minTriangles=CFG.instanceCullMinTriangles,maxInstances=CFG.instanceCullMaxInstances,maxObjects=CFG.instanceCullMaxObjects}={}) {
    super({minTriangles,maxInstances,maxObjects,name:'FlareShadowInstances',accept:o=>o.castShadow&&!o.userData?.noShadowBatch
      &&o.customDepthMaterial===ShadowDepthFor(o)&&o.customDepthMaterial?.onBeforeCompile===THREE.Material.prototype.onBeforeCompile
      &&o.onBeforeShadow===BeforeShadow&&o.onAfterShadow===AfterShadow});
  }
}
