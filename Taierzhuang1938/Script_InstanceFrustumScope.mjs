// Scoped exact instance subsets. Shared geometry/materials and source buffers stay owned by their sources.
import * as THREE from 'three';

const AttributeVersion=a=>a?.isInterleavedBufferAttribute?a.data.version:a?.version;
const Triangles=g=>Math.max(0,Math.min(g.index?.count??g.attributes.position.count,g.drawRange.start+g.drawRange.count)-Math.max(0,g.drawRange.start))/3;
export const InstanceSortId=item=>item.object?.userData?.instanceFrustumSourceId??item.id;

export function CompactableInstances(o,minTriangles,maxInstances) {
  const g=o.geometry,m=o.material,a=o.instanceMatrix,c=o.instanceColor;
  return o.isInstancedMesh&&o.children.length===0&&o.count>0&&o.count<=maxInstances&&o.count<=o.instanceMatrix.count
    &&a.itemSize===16&&!a.normalized&&a.array instanceof Float32Array&&a.meshPerAttribute===1
    &&(!c||(c.isInstancedBufferAttribute&&c.itemSize===3&&c.meshPerAttribute===1&&c.count>=o.count))
    &&!o.userData?.instanceFrustumProxy&&g?.attributes.position?.itemSize===3
    &&!g.isInstancedBufferGeometry&&!Object.values(g.attributes).some(a=>a.isInstancedBufferAttribute||a.data?.isInstancedInterleavedBuffer)
    &&!Object.values(g.morphAttributes).some(a=>a.length)&&!o.morphTexture
    &&m&&!Array.isArray(m)&&m.visible&&!m.transparent&&!m.isShaderMaterial&&!m.isRawShaderMaterial&&!m.wireframe
    &&(!m.displacementMap||m.displacementScale===0)&&!m.alphaToCoverage
    &&Triangles(g)>=minTriangles;
}

export class InstanceFrustumScope {
  constructor({minTriangles,maxInstances,maxObjects,accept=()=>true,name='InstanceFrustumScope'}={}) {
    this.accept=accept;this.name=name;this.hidden=[];this.suspended=false;this.minTriangles=minTriangles;this.maxInstances=maxInstances;this.maxObjects=maxObjects;
    this.enabled=true;this.bypass=false;this.records=new Map();this.scene=null;this.restore=null;
    this.root=new THREE.Group();this.root.name=name;this.root.visible=false;
    this.root.matrixAutoUpdate=false;this.root.matrixWorldAutoUpdate=false;
    this.frustum=new THREE.Frustum();this.clip=new THREE.Matrix4();this.matrix=new THREE.Matrix4();this.world=new THREE.Matrix4();
    this.stats={};
  }
  _Drop(source,record) {record.proxy?.removeFromParent();record.proxy?.dispose();this.records.delete(source);}
  _Bounds(source,record) {
    const g=source.geometry,p=g.attributes.position,a=source.instanceMatrix,e=source.matrixWorld.elements;
    const geometryChanged=record.position!==p||record.positionVersion!==AttributeVersion(p);
    if(record.position===p&&record.positionVersion===AttributeVersion(p)&&record.attribute===a&&record.version===a.version
      &&record.count===source.count&&record.world.every((v,i)=>v===e[i])){this.stats.cacheHits++;return record.boxes;}
    record.position=p;record.positionVersion=AttributeVersion(p);record.attribute=a;record.version=a.version;record.count=source.count;record.world=e.slice();
    if(geometryChanged)record.local.setFromBufferAttribute(p);record.boxes.length=source.count;
    for(let i=0;i<source.count;i++){
      this.matrix.fromArray(a.array,i*16);this.world.multiplyMatrices(source.matrixWorld,this.matrix);
      (record.boxes[i]??=new THREE.Box3()).copy(record.local).applyMatrix4(this.world);
    }
    this.stats.boundsRebuilt++;return record.boxes;
  }
  _Proxy(source,record) {
    if(record.proxy&&(record.proxy.instanceMatrix.count<source.count||record.color!==source.instanceColor)){
      record.proxy.removeFromParent();record.proxy.dispose();record.proxy=null;
    }
    if(!record.proxy){
      const proxy=new THREE.InstancedMesh(source.geometry,source.material,source.count);
      proxy.name=`${this.name}_${source.name||source.id}`;proxy.userData={...source.userData,instanceFrustumProxy:true,flareShadowInstances:true};
      proxy.castShadow=source.castShadow;proxy.receiveShadow=source.receiveShadow;proxy.frustumCulled=false;proxy.matrixAutoUpdate=false;proxy.matrixWorldAutoUpdate=false;
      proxy.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.root.add(proxy);record.proxy=proxy;
    }
    const proxy=record.proxy;proxy.material=source.material;proxy.customDepthMaterial=source.customDepthMaterial;
    proxy.userData.instanceFrustumSourceId=source.id;
    if(source.boundingSphere)proxy.boundingSphere=(proxy.boundingSphere??new THREE.Sphere()).copy(source.boundingSphere);
    proxy.matrixWorld.copy(source.matrixWorld);proxy.layers.mask=source.layers.mask;proxy.renderOrder=source.renderOrder;proxy.receiveShadow=source.receiveShadow;
    const color=source.instanceColor;
    if(color&&(!proxy.instanceColor||record.color!==color)){
      proxy.instanceColor=new THREE.InstancedBufferAttribute(new color.array.constructor(proxy.instanceMatrix.count*color.itemSize),color.itemSize,color.normalized);
      proxy.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }else if(!color)proxy.instanceColor=null;
    record.color=color;return proxy;
  }
  /** Native shadow draw must be enclosed in try/finally { restore(); }. No timing or main-render work. */
  Begin(scene,shadowCamera,mainCamera=null) {
    if(this.restore)throw new Error('FlareShadowInstances shadow scopes cannot overlap');
    if(this.scene!==scene){this.Dispose();this.scene=scene;}
    this.stats={objects:0,sourceInstances:0,visibleInstances:0,culledInstances:0,trianglesSaved:0,boundsRebuilt:0,cacheHits:0};
    const hidden=this.hidden;hidden.length=0;let restored=false;
    const restore=()=>{if(restored)return;restored=true;for(const o of hidden)o.visible=true;this.root.visible=false;this.restore=null;};
    this.restore=restore;
    try {
      if(!this.enabled||this.bypass||!scene)return restore;
      if(this.root.parent!==scene)scene.add(this.root);
      for(const record of this.records.values())if(record.proxy)record.proxy.visible=false;
      this.frustum.setFromProjectionMatrix(this.clip.multiplyMatrices(shadowCamera.projectionMatrix,shadowCamera.matrixWorldInverse));
      const seen=new Set(),sources=[];
      scene.traverseVisible(o=>{if(CompactableInstances(o,this.minTriangles,this.maxInstances)&&this.accept(o)&&(!mainCamera||o.layers.test(mainCamera.layers)))sources.push(o);});
      for(const source of sources){
        if(seen.size>=this.maxObjects)break;seen.add(source);
        let record=this.records.get(source);
        if(record?.geometry!==source.geometry){if(record)this._Drop(source,record);record=null;}
        if(!record){record={geometry:source.geometry,world:[],local:new THREE.Box3(),boxes:[],proxy:null};this.records.set(source,record);}
        const boxes=this._Bounds(source,record),indices=[];
        for(let i=0;i<source.count;i++)if(this.frustum.intersectsBox(boxes[i]))indices.push(i);
        const count=indices.length;this.stats.objects++;this.stats.sourceInstances+=source.count;this.stats.visibleInstances+=count;
        this.stats.culledInstances+=source.count-count;this.stats.trianglesSaved+=(source.count-count)*Triangles(source.geometry);
        if(count===source.count)continue;
        if(count){
          const proxy=this._Proxy(source,record),matrix=source.instanceMatrix.array,color=source.instanceColor;
          for(let i=0;i<count;i++){
            const at=indices[i];proxy.instanceMatrix.array.set(matrix.subarray(at*16,at*16+16),i*16);
            if(color)proxy.instanceColor.array.set(color.array.subarray(at*color.itemSize,(at+1)*color.itemSize),i*color.itemSize);
          }
          proxy.count=count;proxy.instanceMatrix.needsUpdate=true;if(color)proxy.instanceColor.needsUpdate=true;proxy.visible=true;
        }
        source.visible=false;hidden.push(source);
      }
      for(const [source,record] of this.records)if(!seen.has(source))this._Drop(source,record);
      this.root.visible=true;return restore;
    }catch(error){restore();throw error;}
  }
  WithFullSources(fn) {
    if(!this.restore||this.suspended)return fn();
    this.suspended=true;const visible=this.root.visible;this.root.visible=false;for(const source of this.hidden)source.visible=true;
    try{return fn();}finally{for(const source of this.hidden)source.visible=false;this.root.visible=visible;this.suspended=false;}
  }
  Dispose() {
    this.restore?.();for(const [source,record] of this.records)this._Drop(source,record);
    this.root.removeFromParent();this.scene=null;
  }
}
