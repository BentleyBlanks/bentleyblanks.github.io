import * as THREE from 'three';
import {MergeGeometries} from './Script_Geo.mjs';
import {AttachShadowDepth} from './Script_ShadowDepth.mjs';

const identity=new THREE.Matrix4();

// Colour still uses each authored material. Solid depth/shadow passes need only
// the unchanged triangles, normals and the rigid parent's transform.
export class ActorDepthBatcher {
  constructor(scene){this.scene=scene;this.groups=new Map();this.hidden=[];this.enabled=true;}
  Scan(record) {
    record.depthClusters=[];
    const parents=new Map();
    for(const entry of record.entries) {
      const mesh=entry.mesh,m=mesh.material,g=mesh.geometry;
      if(!/^(HanYang173R_|Type38_511_)/.test(m.name)||m.alphaTest>0||m.alphaHash||m.alphaToCoverage||m.wireframe||m.transparent||m.displacementMap
        ||m.allowOverride===false||mesh.customDepthMaterial||mesh.userData.skipNormalDepth
        ||mesh.userData.normalDepthMaxDistance||g.drawRange.start!==0||g.drawRange.count!==Infinity
        ||!g.attributes.normal||g.attributes.position.isInterleavedBufferAttribute||g.attributes.normal.isInterleavedBufferAttribute
        ||!(g.attributes.position.array instanceof Float32Array)||!(g.attributes.normal.array instanceof Float32Array)
        ||(g.attributes.uv&&!(g.attributes.uv.array instanceof Float32Array))
        ||g.attributes.uv?.isInterleavedBufferAttribute||!mesh.matrix.equals(identity))continue;
      const key=mesh.parent.uuid+':'+m.side+':'+m.shadowSide;
      let cluster=parents.get(key);if(!cluster)parents.set(key,cluster={parent:mesh.parent,entries:[]});cluster.entries.push(entry);
    }
    for(const {parent,entries} of parents.values()) {
      if(entries.length<2)continue;
      const first=entries[0].mesh.material;
      if(entries.some(e=>e.mesh.material.side!==first.side||e.mesh.material.shadowSide!==first.shadowSide))continue;
      const key=entries.map(e=>e.group.key).join(';');
      let group=this.groups.get(key);
      if(!group) {
        const geometry=MergeGeometries(entries.map(e=>e.mesh.geometry.clone()));
        const normalMaterial=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
        const shadowMaterial=new THREE.MeshBasicMaterial({side:first.side});shadowMaterial.shadowSide=first.shadowSide;
        group={key,geometry,parts:entries.map(e=>e.group),normalMaterial,shadowMaterial,normal:null,shadow:null,
          matrices:[],previous:[],casting:[],valid:false};this.groups.set(key,group);
        for(const part of group.parts)part.depthOwner=part.depthOwner===undefined?group:part.depthOwner===group?group:null;
      }
      record.depthClusters.push({parent,entries,group,frame:-1,previous:new Float32Array(16),renderPrevious:new Float32Array(16)});
    }
  }
  BeginFrame(){for(const group of this.groups.values()){group.matrices.length=0;group.previous.length=0;group.casting.length=0;group.valid=false;}}
  Collect(record,frame) {
    for(const cluster of record.depthClusters||[]) {
      const {parent,entries,group}=cluster,cast=entries[0].mesh.castShadow;
      if(entries.some(e=>e.drawnFrame!==frame||e.mesh.parent!==parent||!e.mesh.matrix.equals(identity)||e.mesh.castShadow!==cast))continue;
      // drawnFrame already proves each source geometry/material and attribute
      // version matched its colour bucket. Shared material admission is identical
      // across actors, so check it once per group, not once per rifle instance.
      if(group.checkFrame!==frame){
        group.checkFrame=frame;
        group.sourcesValid=group.parts.every(({material:m})=>m.side===group.shadowMaterial.side&&m.shadowSide===group.shadowMaterial.shadowSide
          &&!(m.alphaTest>0||m.alphaHash||m.alphaToCoverage||m.wireframe||m.transparent||m.displacementMap));
      }
      if(!group.sourcesValid)continue;
      // Keep history by owner identity, never by its position in a compacted list.
      const matrix=parent.matrixWorld.elements;
      group.matrices.push(matrix);
      cluster.renderPrevious.set(cluster.frame===frame-1?cluster.previous:matrix);
      group.previous.push(cluster.renderPrevious);
      group.casting.push(cast);cluster.previous.set(matrix);cluster.frame=frame;
    }
  }
  Finish() {
    for(const group of this.groups.values()) {
      const count=group.matrices.length;
      // Partial visibility or another grouping sharing a material bucket falls
      // back to the original per-part depth draws, never a duplicate or a hole.
      group.valid=this.enabled&&count>0&&group.parts.every(p=>p.depthOwner===group&&p.count.cast+p.count.plain===count);
      if(!group.valid){if(group.normal)group.normal.count=0;if(group.shadow)group.shadow.count=0;continue;}
      const normal=this.Mesh(group,'normal',count),shadow=this.Mesh(group,'shadow',count);
      let casters=0;
      for(let i=0;i<count;i++){
        normal.instanceMatrix.array.set(group.matrices[i],i*16);
        normal.geometry.attributes.instancePreviousMatrix.array.set(group.previous[i],i*16);
        if(group.casting[i])shadow.instanceMatrix.array.set(group.matrices[i],casters++*16);
      }
      normal.count=count;normal.instanceMatrix.needsUpdate=true;normal.geometry.attributes.instancePreviousMatrix.needsUpdate=true;
      shadow.count=casters;shadow.instanceMatrix.needsUpdate=true;normal.visible=false;shadow.visible=false;
    }
  }
  Mesh(group,kind,count) {
    let mesh=group[kind];if(mesh&&mesh.instanceMatrix.count>=count)return mesh;
    const capacity=Math.max(16,count,mesh?mesh.instanceMatrix.count*2:0);
    if(mesh){mesh.removeFromParent();mesh.dispose();mesh.geometry.dispose();}
    const geometry=group.geometry.clone();
    if(kind==='normal')geometry.setAttribute('instancePreviousMatrix',new THREE.InstancedBufferAttribute(new Float32Array(capacity*16),16).setUsage(THREE.DynamicDrawUsage));
    mesh=new THREE.InstancedMesh(geometry,group[kind+'Material'],capacity);
    mesh.name='ActorDepthBatch_'+kind;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled=false;mesh.matrixAutoUpdate=false;mesh.matrixWorldAutoUpdate=false;mesh.visible=false;
    mesh.castShadow=kind==='shadow';if(mesh.castShadow)AttachShadowDepth(mesh);
    this.scene.add(mesh);group[kind]=mesh;return mesh;
  }
  Covers(part){return this.enabled&&part.depthOwner?.valid===true;}
  BeginPrepass(){
    if(!this.enabled||this.hidden.length)return;
    for(const group of this.groups.values())if(group.valid){
      for(const part of group.parts){const mesh=part.meshes.plain;if(mesh){this.hidden.push(mesh,mesh.visible);mesh.visible=false;}}
      this.hidden.push(group.normal,group.normal.visible);group.normal.visible=true;
    }
  }
  EndPrepass(){for(let i=0;i<this.hidden.length;i+=2)this.hidden[i].visible=this.hidden[i+1];this.hidden.length=0;}
  BeginShadow(saved){
    if(!this.enabled)return;
    for(const group of this.groups.values())if(group.valid){
      saved.push(group.normal,group.normal.visible,group.shadow,group.shadow.visible);
      group.normal.visible=false;group.shadow.visible=group.shadow.count>0;
    }
  }
  SetEnabled(on){this.enabled=on;if(!on){this.EndPrepass();for(const g of this.groups.values()){g.valid=false;if(g.normal)g.normal.visible=false;if(g.shadow)g.shadow.visible=false;}}}
  Clear(){
    this.EndPrepass();
    for(const group of this.groups.values()){
      for(const part of group.parts)if(part.depthOwner===group)delete part.depthOwner;
      for(const kind of ['normal','shadow'])if(group[kind]){group[kind].removeFromParent();group[kind].dispose();group[kind].geometry.dispose();}
      group.geometry.dispose();group.normalMaterial.dispose();group.shadowMaterial.dispose();
    }
    this.groups.clear();
  }
}
