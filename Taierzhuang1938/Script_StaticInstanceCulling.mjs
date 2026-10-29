// Main/prepass-only subsets of the static PropBatch contract. Native shadow
// traversals temporarily see every original source, including offscreen casters.
import * as THREE from 'three';
import {InstanceFrustumScope,InstanceSortId} from './Script_InstanceFrustumScope.mjs';
import {MaterialPreservesPosition} from './Script_MaterialPatches.mjs';
import {STATIC_INSTANCE_CULLING as CFG} from './Data_Tuning_Graphics.mjs';

function Accept(source) {
  if(!source.userData.staticPropBatch||source.instanceMatrix.usage!==THREE.StaticDrawUsage)return false;
  if(source.onBeforeRender!==THREE.Object3D.prototype.onBeforeRender||source.onAfterRender!==THREE.Object3D.prototype.onAfterRender)return false;
  for(let node=source;node;node=node.parent)if(node.userData?.skipNormalDepth||node.userData?.foregroundPrepassRoot||node.userData?.foregroundPrepass||(node.isGroup&&node.renderOrder!==0))return false;
  const material=source.material;
  return material.onBeforeCompile===THREE.Material.prototype.onBeforeCompile||MaterialPreservesPosition(material);
}

/** Three's stock opaque ordering, retaining the original object's final tie break. */
export function StaticInstanceOpaqueSort(a,b) {
  return a.groupOrder-b.groupOrder||a.renderOrder-b.renderOrder||a.material.id-b.material.id
    ||a.materialVariant-b.materialVariant||a.z-b.z||InstanceSortId(a)-InstanceSortId(b);
}

export class StaticInstanceCulling extends InstanceFrustumScope {
  constructor(renderer,{tuning=CFG}={}) {
    super({...tuning,accept:Accept,name:'StaticInstanceCulling'});
    this.enabled=tuning.enabled!==false;this.renderer=renderer;this.uninstall=null;
  }
  Begin(scene,camera) {
    const restore=super.Begin(scene,camera,camera);
    if(!this.uninstall){
      const shadowMap=this.renderer?.shadowMap;
      if(shadowMap&&typeof shadowMap.render==='function'){
        const original=shadowMap.render,scope=this;
        const wrapped=function StaticInstanceShadowRender(...args){return scope.WithFullSources(()=>original.apply(this,args));};
        shadowMap.render=wrapped;
        this.uninstall=()=>{if(shadowMap.render===wrapped)shadowMap.render=original;};
      }
    }
    return restore;
  }
  Dispose() {super.Dispose();this.uninstall?.();this.uninstall=null;}
}
