// 《台儿庄：血战滕县》程序化人物合批：把百姓等刚体分件按「几何 × 材质」收成 InstancedMesh。
// 蒙皮身体仍自己画；同款步枪的刚性挂件按几何/材质跨人物合批，保留原贴图与逐实例运动历史。
//
// 为什么非做不可（实测数字，phase=2 城里，1280×720）：
//   城里同时站着 69 个人，每个人是 24—33 个分件网格（一根骨头下按材质分桶合并过，
//   见 Script_Actor 开头第 2 条）。这些网格合起来只有 15 万个三角形，却要占
//   **一帧 1408 个 draw call**（全场 1680 的 84%）—— 深度法线预通道一遍、主场景
//   一遍、阴影一遍。三角形早就不是瓶颈了，瓶颈是 three 在 JS 侧为每一次提交
//   做的那点固定开销（renderBufferDirect / setProgram / uniform 上传）。
//   RTX 4070 上 gl.finish() 不等任何东西：整帧是**纯 CPU 卡在提交上**。
//
// 为什么能无损：
//   · 全场 69 个人只用 69 份几何（几何按 kind 缓存）与 29 份材质（材质按个体着色后
//     也进缓存）—— 同一份「几何+材质」的分件在不同人身上是**同一个对象**，
//     实例化之后画出来的顶点与像素完全一样，差别只在提交次数。
//   · 每个分件的实例矩阵就是它自己的 matrixWorld（骨骼算完之后那一份），
//     所以姿态、身高缩放、武器缩放一个都不丢。
//   · 原网格不删、不改 visible（游戏逻辑还在读它），只是挪到一个没有相机也没有灯
//     去看的图层上（BATCH_LAYER）—— 于是它不进主渲染、不进阴影，但 matrixWorld
//     照旧每帧算，合批读的就是那一份。
//
// 三条边界，改之前先读：
//   1) **castShadow 是逐分件的语义、逐批次的现实**。Actor.SetShadowEnabled 会按距离
//      关掉中景人物的投影。主画面合成一批，烘阴影时临时换成只含投影者的子集；
//      没有传 renderer 的独立调用方仍按「投影」与「不投影」两批绘制。
//   2) **skipNormalDepth 同理**。日军那套 GLB 分段网格整体不进深度法线预通道
//      （Script_RiggedModel 标的），所以它进 key，批次自己带上这个 userData，
//      Post._CollectSkipped 照旧生效。
//   3) **InstancedMesh 不做逐实例剔除**，所以这里自己按人剔一次：人物包围球在相机
//      视锥里、**或者**离相机近到能往画面里投影子（阴影框半宽 62 m，取 120 m 冗余），
//      才写进实例表。这是原来逐网格剔除结果的超集 —— 多写的那些在屏幕外，
//      光栅化阶段一个像素都不落。
import * as THREE from "three";
import { AttachShadowDepth } from "./Script_ShadowDepth.mjs";
import { ActorDepthBatcher } from "./Script_ActorDepthBatch.mjs";

// Only the colour and normal draws use this subset. Shadow draws have their
// own full caster buffers. Test the actual render camera (including TAA jitter),
// keep the source order and move previous transforms with current transforms.
class CameraInstanceSubset {
  constructor(){this.records=new WeakMap();this.saved=[];this.clip=new THREE.Matrix4();this.frustum=new THREE.Frustum();this.matrix=new THREE.Matrix4();this.box=new THREE.Box3();}
  Draw(batch,camera,draw){
    if(this.active){
      // A probe/secondary camera may render recursively from a draw callback.
      if(this.suspended)return draw();
      this.suspended=true;
      try{for(const r of this.saved)this.Restore(r);return draw();}
      finally{for(const r of this.saved)this.Compact(r);this.suspended=false;}
    }
    if(!camera?.isPerspectiveCamera||camera.isArrayCamera)return draw();
    this.active=true;
    try{
      if(!camera.parent&&camera.matrixWorldAutoUpdate)camera.updateMatrixWorld();
      this.clip.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
      this.frustum.setFromProjectionMatrix(this.clip,camera.coordinateSystem,camera.reversedDepth);
      for(const g of batch.depthBatch.groups.values())if(g.valid){
        if(g.normal?.visible)this.Apply(g.normal,batch);
        else for(const part of g.parts){const m=part.meshes.plain;if(m?.visible)this.Apply(m,batch);}
      }
      return draw();
    }finally{
      for(const r of this.saved)this.Restore(r);
      this.saved.length=0;this.active=false;
    }
  }
  Restore({mesh,count,first,end,current,previous}){
    const a=mesh.instanceMatrix,b=mesh.geometry.attributes.instancePreviousMatrix;
    if(end>first){a.array.set(current.subarray(first*16,end*16),first*16);b.array.set(previous.subarray(first*16,end*16),first*16);a.needsUpdate=true;b.needsUpdate=true;}
    mesh.count=count;
  }
  Compact({mesh,first,end,indices}){
    const a=mesh.instanceMatrix,b=mesh.geometry.attributes.instancePreviousMatrix;
    for(let j=first;j<end;j++){
      const i=indices[j];a.array.copyWithin(j*16,i*16,i*16+16);b.array.copyWithin(j*16,i*16,i*16+16);
    }
    if(end>first){a.needsUpdate=true;b.needsUpdate=true;}
    mesh.count=end;
  }
  Apply(mesh,batch){
    const count=mesh.count,g=mesh.geometry,triangles=(g.index?.count??g.attributes.position.count)/3;
    if(!count||triangles*count<2048)return;
    if(!g.boundingBox)g.computeBoundingBox();
    if(!g.boundingBox||g.boundingBox.isEmpty())return;
    const current=mesh.instanceMatrix,previous=g.attributes.instancePreviousMatrix;
    let r=this.records.get(mesh);
    if(!r){r={mesh,indices:new Uint32Array(current.count),current:new Float32Array(current.array.length),previous:new Float32Array(previous.array.length)};this.records.set(mesh,r);}
    let n=0,first=count;
    for(let i=0;i<count;i++){
      this.matrix.fromArray(current.array,i*16).premultiply(mesh.matrixWorld);
      this.box.copy(g.boundingBox).applyMatrix4(this.matrix);
      if(this.frustum.intersectsBox(this.box))r.indices[n++]=i;else if(first===count)first=i;
    }
    if(n===count)return;
    batch.stats.cameraTrianglesSkipped+=(count-n)*triangles;
    r.count=count;r.first=first;r.end=n;this.saved.push(r);
    if(n>first){
      r.current.set(current.array.subarray(first*16,n*16),first*16);r.previous.set(previous.array.subarray(first*16,n*16),first*16);
    }
    this.Compact(r);
  }
}

/** 原网格挪去的图层：相机与灯的 layers 掩码都只有第 0 位，挪过去就等于不提交。 */
const BATCH_LAYER = 30;
/** 人物包围球半径（米）。人高 1.8 m，倒地/挥枪时分件最远也在根节点 1.5 m 内。 */
const ACTOR_RADIUS = 3;
/** 超出视锥但仍可能往画面里投影子的距离（米）。阴影框半宽 62 m，这里留一倍冗余。 */
const SHADOW_RELEVANT = 120;
/** 批次容量的最小值：别为了多一个人就重建一次 InstancedMesh。 */
const MIN_CAPACITY = 16;
const shadowScopes = new WeakMap();
const renderScopes = new WeakMap();
const AttributeVersion=attribute=>attribute?.isInterleavedBufferAttribute?attribute.data.version:attribute?.version;
function GeometryChanged(group) {
  const g=group.geometry;
  if(g.index!==group.index||AttributeVersion(g.index)!==group.indexVersion
    ||g.drawRange.start!==group.drawStart||g.drawRange.count!==group.drawCount
    ||Object.keys(g.attributes).length!==group.attributes.length)return true;
  for(const source of group.attributes)if(g.attributes[source.name]!==source.attribute||AttributeVersion(source.attribute)!==source.version)return true;
  return false;
}

// Authored world-weapon leaves have identity rotation/scale; only their parent
// or a visual-origin translation moves. Keep the Matrix4 objects and all normal
// Object3D update hooks, but avoid full quaternion composition and 4x4 products.
export class RigidWeaponMatrix extends THREE.Matrix4 {
  compose(position,quaternion,scale){
    if(quaternion.x===0&&quaternion.y===0&&quaternion.z===0&&(quaternion.w===1||quaternion.w===-1)
      &&scale.x===1&&scale.y===1&&scale.z===1)return this.makeTranslation(position.x,position.y,position.z);
    return super.compose(position,quaternion,scale);
  }
  multiplyMatrices(a,b){
    const e=b.elements;
    if(e[0]===1&&e[5]===1&&e[10]===1&&e[15]===1&&e[1]===0&&e[2]===0&&e[3]===0
      &&e[4]===0&&e[6]===0&&e[7]===0&&e[8]===0&&e[9]===0&&e[11]===0){
      const x=e[12],y=e[13],z=e[14],source=a.elements;
      this.copy(a);const target=this.elements;
      target[12]=source[0]*x+source[4]*y+source[8]*z+source[12];
      target[13]=source[1]*x+source[5]*y+source[9]*z+source[13];
      target[14]=source[2]*x+source[6]*y+source[10]*z+source[14];
      target[15]=source[3]*x+source[7]*y+source[11]*z+source[15];
      return this;
    }
    return super.multiplyMatrices(a,b);
  }
}

export class ActorBatcher {
  /** @param {THREE.Scene} scene */
  constructor(scene, renderer = null) {
    this.scene = scene;
    this.enabled = true;
    this.records = new Map();     // actor -> { revision, entries }
    this.groups = new Map();      // key -> group
    this.frustum = new THREE.Frustum();
    this.viewProjection = new THREE.Matrix4();
    this.sphere = new THREE.Sphere(new THREE.Vector3(), ACTOR_RADIUS);
    this.cameraPosition = new THREE.Vector3();
    this.stats = { actors: 0, instances: 0, batches: 0 };
    this.frame = 0;
    this.ancestry=new WeakMap();
    this.sourceRoots=[];
    this.depthBatch = new ActorDepthBatcher(scene);
    this.cameraSubset = new CameraInstanceSubset();
    this.shadowScope = false;
    if (renderer) this.EnableShadowScope(renderer);
  }

  /** Main/prepass need every attachment; shadow draws only need casters. Use
   * one main draw per material without changing any member's castShadow flag.
   * One wrapper per renderer survives level changes, without retaining old batches. */
  EnableShadowScope(renderer) {
    this.shadowScope = true;
    let renderScope=renderScopes.get(renderer);
    if(renderScope)renderScope.batch=this;
    else {
      renderScope={batch:this};renderScopes.set(renderer,renderScope);
      const render=renderer.render;
      renderer.render=function ActorBatchRender(scene,...args){
        const batch=renderScope.batch,saved=[];
        // Layer exclusion avoids draws but three still visits every source leaf
        // in main/depth/shadow traversal. Fully covered rigid parents can be
        // hidden just for submission; animation and all gameplay reads see the
        // original visibility before and after this synchronous render scope.
        if(batch.enabled&&scene===batch.scene)for(const root of batch.sourceRoots){saved.push(root,root.visible);root.visible=false;}
        try{
          if(batch.enabled&&batch.shadowScope&&scene===batch.scene&&!this.xr?.isPresenting)
            return batch.cameraSubset.Draw(batch,args[0],()=>render.call(this,scene,...args));
          return render.call(this,scene,...args);
        }
        finally{for(let i=0;i<saved.length;i+=2)saved[i].visible=saved[i+1];}
      };
    }
    let scope = shadowScopes.get(renderer);
    if (scope) { scope.batch = this;return; }
    scope = {batch:this};shadowScopes.set(renderer,scope);
    const previous = renderer.shadowMap.render;
    renderer.shadowMap.render = function ActorBatchShadowRender(...args) {
      const batch = scope.batch, saved = [];
      if (batch.enabled && batch.shadowScope) for (const group of batch.groups.values()) {
        const main = group.meshes.plain, shadow = group.meshes.cast;
        if (main) { saved.push(main,main.visible);main.visible = false; }
        if (shadow) { saved.push(shadow,shadow.visible);shadow.visible = shadow.count > 0 && !batch.depthBatch.Covers(group); }
      }
      if(batch.enabled&&batch.shadowScope)batch.depthBatch.BeginShadow(saved);
      try { return previous.apply(this,args); }
      finally { for (let i=0;i<saved.length;i+=2) saved[i].visible = saved[i+1]; }
    };
  }

  /**
   * 开关。关掉时把原网格放回第 0 层、批次清零 —— 画面回到「一个分件一个 draw call」
   * 的老路子。视觉回归就靠它在**同一帧**上开关对比（跨进程重跑对不齐：
   * 城里的战斗不是逐帧可复现的）。
   */
  SetEnabled(on) {
    const next = !!on;
    if (this.enabled === next) return this;
    this.enabled = next;
    this.sourceRoots.length=0;
    this.depthBatch.SetEnabled(next);
    for (const record of this.records.values()) {
      for (const entry of record.entries) { entry.mesh.layers.set(next ? BATCH_LAYER : 0);entry.frame = -1; }
      for(const cluster of record.depthClusters||[])cluster.frame=-1;
    }
    if (!next) {
      for (const group of this.groups.values()) {
        group.count.cast = 0; group.count.plain = 0;
        for (const kind of ["cast", "plain"]) if (group.meshes[kind]) group.meshes[kind].count = 0;
      }
    }
    return this;
  }

  /** 登记一个人物。重复登记是安全的（会按 partsRevision 重扫）。 */
  Add(actor) {
    if (!actor || !actor.root) return;
    if (!this.records.has(actor)) this.records.set(actor, { revision: -1, entries: [] });
    this._Scan(actor);
  }

  /** 摘掉一个人物：原网格放回第 0 层，实例表下一帧自然不再写它。 */
  Remove(actor) {
    const record = this.records.get(actor);
    if (!record) return;
    this._ForgetSources(record);
    for (const entry of record.entries) entry.mesh.layers.set(0);
    this.records.delete(actor);
  }

  /** 换关：全摘干净，批次网格一并从场景上拿掉。 */
  Clear() {
    this.sourceRoots.length=0;
    this.depthBatch.Clear();
    for (const actor of [...this.records.keys()]) this.Remove(actor);
    for (const group of this.groups.values()) {
      for (const kind of ["cast", "plain"]) {
        const mesh = group.meshes[kind];
        if (!mesh) continue;
        if (mesh.parent) mesh.parent.remove(mesh);
        mesh.dispose();
        mesh.geometry.dispose();
      }
    }
    this.groups.clear();
  }

  /**
   * 每帧一次，**排在 scene.updateMatrixWorld() 之后、出画之前**。
   * 顺序反了实例矩阵就落后一帧，表现为人物比自己的枪口火慢半拍。
   */
  Update(camera) {
    if (!this.enabled) return;
    this.frame += 1;
    this.stats.cameraTrianglesSkipped=0;
    this.sourceRoots.length=0;
    this.depthBatch.BeginFrame();
    for (const group of this.groups.values()) { group.count.cast = 0; group.count.plain = 0;group.changed=GeometryChanged(group); }

    this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.viewProjection);
    this.cameraPosition.setFromMatrixPosition(camera.matrixWorld);

    let instances = 0;
    let actors = 0;
    for (const [actor, record] of this.records) {
      if (actor.disposed) { this.Remove(actor); continue; }
      if (record.revision !== (actor.partsRevision | 0)) this._Scan(actor);
      const root = actor.root;
      // A severed arm can carry the same weapon outside the actor subtree.
      // Its actual ancestry below, rather than the body's culling flag, owns visibility.
      if ((!root.visible || !root.parent) && !actor.goreWeaponHold) continue;
      this.sphere.center.setFromMatrixPosition(root.matrixWorld);
      const relevant = actor.usingRiggedCharacter || this.frustum.intersectsSphere(this.sphere)
        || this.sphere.center.distanceToSquared(this.cameraPosition) < SHADOW_RELEVANT * SHADOW_RELEVANT;
      if (!relevant) continue;
      actors += 1;
      for (const entry of record.entries) {
        const mesh = entry.mesh;
        if (!mesh.visible || !mesh.parent) continue;
        // The cached weapon geometry is immutable. A later deformation or
        // replacement must use the live source Mesh, not an outdated private copy.
        const geometry=mesh.geometry;
        const changed=geometry!==entry.group.geometry||mesh.material!==entry.group.material||entry.group.changed;
        if(changed){mesh.layers.set(0);entry.frame=-1;continue;}
        // Native draws can flip frontFace per object; one instance draw cannot.
        if (mesh.matrixWorld.determinant() <= 0) { mesh.layers.set(0);entry.frame = -1;continue; }
        mesh.layers.set(BATCH_LAYER);
        // Attachments can be reparented to a replacement skeleton without a
        // weapon revision. Resolve actual ancestry once per parent per Update;
        // all leaves under a rifle share it, including detached gore props.
        if (!this._VisibleInScene(mesh.parent)) continue;
        const group = entry.group;
        const kind = mesh.castShadow ? "cast" : "plain";
        const index = group.count[kind];
        const buffer = this._EnsureBuffer(group, kind, index + 1);
        buffer.set(mesh.matrixWorld.elements, index * 16);
        group.previous[kind].set(entry.frame === this.frame - 1 ? entry.previous : mesh.matrixWorld.elements, index * 16);
        entry.previous.set(mesh.matrixWorld.elements);entry.frame = this.frame;
        group.count[kind] = index + 1;
        entry.drawnFrame=this.frame;
        instances += 1;
      }
      if(this.shadowScope)this.depthBatch.Collect(record,this.frame);
      if(this.shadowScope)for(const candidate of record.sourceParents||[]){
        const {parent,entries}=candidate;
        if(parent.children.length===entries.length&&entries.every(e=>e.drawnFrame===this.frame
          &&e.mesh.parent===parent&&e.mesh.children.length===0))this.sourceRoots.push(parent);
      }
    }

    this.depthBatch.Finish();
    let batches = 0;
    for (const group of this.groups.values()) {
      if (this.shadowScope) {
        const castCount=group.count.cast,plainCount=group.count.plain,total=castCount+plainCount;
        if (total) {
          const main=this._EnsureMesh(group,'plain',total),previous=main.geometry.attributes.instancePreviousMatrix;
          main.instanceMatrix.array.set(group.buffer.cast.subarray(0,castCount*16));
          main.instanceMatrix.array.set(group.buffer.plain.subarray(0,plainCount*16),castCount*16);
          previous.array.set(group.previous.cast.subarray(0,castCount*16));
          previous.array.set(group.previous.plain.subarray(0,plainCount*16),castCount*16);
          main.instanceMatrix.needsUpdate=true;previous.needsUpdate=true;main.count=total;main.visible=true;batches++;
        } else if (group.meshes.plain) group.meshes.plain.count=0;
        if (castCount && !this.depthBatch.Covers(group)) {
          const shadow=this._EnsureMesh(group,'cast',castCount);
          shadow.instanceMatrix.array.set(group.buffer.cast.subarray(0,castCount*16));
          shadow.instanceMatrix.needsUpdate=true;shadow.count=castCount;shadow.visible=false;
        } else if (group.meshes.cast) {group.meshes.cast.count=0;group.meshes.cast.visible=false;}
        continue;
      }
      for (const kind of ["cast", "plain"]) {
        const count = group.count[kind];
        const mesh = group.meshes[kind];
        if (!count) { if (mesh) mesh.count = 0; continue; }
        const target = this._EnsureMesh(group, kind, count);
        target.instanceMatrix.array.set(group.buffer[kind].subarray(0, count * 16));
        target.instanceMatrix.needsUpdate = true;
        const previous = target.geometry.attributes.instancePreviousMatrix;
        previous.array.set(group.previous[kind].subarray(0, count * 16));
        previous.needsUpdate = true;
        target.count = count;
        target.visible = true;
        batches += 1;
      }
    }
    this.stats.actors = actors;
    this.stats.instances = instances;
    this.stats.batches = batches;
    this.stats.sourceRoots=this.sourceRoots.length;
    this.stats.sourceMeshes=this.sourceRoots.reduce((n,root)=>n+root.children.length,0);
  }

  BeginDepthPass(){if(this.shadowScope)this.depthBatch.BeginPrepass();}
  EndDepthPass(){this.depthBatch.EndPrepass();}

  _VisibleInScene(object) {
    if(!object)return false;
    let cached=this.ancestry.get(object);
    if(cached?.frame===this.frame)return cached.visible;
    const visible=object.visible&&(object===this.scene||this._VisibleInScene(object.parent));
    if(!cached){cached={frame:0,visible:false};this.ancestry.set(object,cached);}
    cached.frame=this.frame;cached.visible=visible;return visible;
  }

  // -------------------------------------------------------------------------

  _Scan(actor) {
    const record = this.records.get(actor);
    if (!record) return;
    this._ForgetSources(record);
    for (const entry of record.entries) entry.mesh.layers.set(0);
    record.entries.length = 0;
    record.revision = actor.partsRevision | 0;
    const root = actor.root;
    root.traverse((object) => {
      if (!object.isMesh || object.isInstancedMesh || object.isSkinnedMesh || object.userData.hairGroom) return;
      if (!object.geometry || !object.material || Array.isArray(object.material)) return;
      // Scope the new rigged path to the measured bottleneck. No body, hair,
      // transparency, deformation or draw-hook substitution is admitted.
      if (actor.usingRiggedCharacter && !/^(HanYang173R_|Type38_511_)/.test(object.material.name)) return;
      if (object.material.transparent || object.geometry.morphAttributes.position?.length
        || object.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender
        || object.onAfterRender !== THREE.Object3D.prototype.onAfterRender) return;
      if(/^(HanYang173R_|Type38_511_)/.test(object.material.name)){
        Object.setPrototypeOf(object.matrix,RigidWeaponMatrix.prototype);
        Object.setPrototypeOf(object.matrixWorld,RigidWeaponMatrix.prototype);
      }
      const skip = object.userData.skipNormalDepth === true;
      const key = `${object.geometry.id}|${object.material.id}|${skip ? 1 : 0}|${object.receiveShadow ? 1 : 0}`;
      let group = this.groups.get(key);
      if (!group) {
        group = {
          key, skip, geometry: object.geometry, material: object.material, receiveShadow: object.receiveShadow,
          meshes: { cast: null, plain: null },
          buffer: { cast: new Float32Array(MIN_CAPACITY * 16), plain: new Float32Array(MIN_CAPACITY * 16) },
          previous: { cast: new Float32Array(MIN_CAPACITY * 16), plain: new Float32Array(MIN_CAPACITY * 16) },
          count: { cast: 0, plain: 0 },
          attributes:Object.entries(object.geometry.attributes).map(([name,attribute])=>({name,attribute,version:AttributeVersion(attribute)})),
          index:object.geometry.index,indexVersion:AttributeVersion(object.geometry.index),
          drawStart:object.geometry.drawRange.start,drawCount:object.geometry.drawRange.count,changed:false,
        };
        this.groups.set(key, group);
      }
      record.entries.push({ mesh: object, group, previous: new Float32Array(16), frame: -1 });
      if (this.enabled) object.layers.set(BATCH_LAYER);
    });
    this.depthBatch.Scan(record);
    const parents=new Map();
    for(const entry of record.entries){const parent=entry.mesh.parent;let list=parents.get(parent);if(!list)parents.set(parent,list=[]);list.push(entry);}
    record.sourceParents=[...parents].filter(([parent,entries])=>parent&&parent!==this.scene&&parent.children.length===entries.length&&entries.every(e=>e.mesh.children.length===0))
      .map(([parent,entries])=>({parent,entries}));
  }

  _ForgetSources(record){
    if(!record.sourceParents?.length||!this.sourceRoots.length)return;
    const parents=new Set(record.sourceParents.map(entry=>entry.parent));
    this.sourceRoots=this.sourceRoots.filter(root=>!parents.has(root));
  }

  _EnsureBuffer(group, kind, need) {
    const buffer = group.buffer[kind];
    if (buffer.length >= need * 16) return buffer;
    // 第一次真正出画时本关人物已经全部登记完。按总人数一次预留，避免玩家转头
    // 看见更多士兵时，每个材质桶都在那一帧从 16→32→64 反复分配/拷贝。
    const capacity = Math.max(need, this.records.size, (buffer.length / 16) * 2);
    const grown = new Float32Array(capacity * 16);
    grown.set(buffer);
    group.buffer[kind] = grown;
    const previous = new Float32Array(capacity * 16);previous.set(group.previous[kind]);group.previous[kind] = previous;
    return grown;
  }

  _EnsureMesh(group, kind, need) {
    const existing = group.meshes[kind];
    if (existing && existing.instanceMatrix.count >= need) return existing;
    if (existing) {
      if (existing.parent) existing.parent.remove(existing);
      existing.dispose();
      existing.geometry.dispose();
    }
    // 同 CPU buffer：首次创建就按本关 Actor 总数留足。矩阵只有 64 B / 人，
    // 即使七十个桶都留 70 人也不到 320 KB，换掉的是转头时几十次 GPU buffer 重建。
    const capacity = Math.max(MIN_CAPACITY, need, this.records.size,
      existing ? existing.instanceMatrix.count * 2 : 0);
    // One private geometry per batch (not per actor): disposal must not delete
    // shared factory WebGL buffers. Geometry, normals, UVs and tangents are exact copies.
    const geometry = group.geometry.clone();
    geometry.setAttribute('instancePreviousMatrix', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 16), 16).setUsage(THREE.DynamicDrawUsage));
    const mesh = new THREE.InstancedMesh(geometry, group.material, capacity);
    mesh.name = `ActorBatch_${group.key}_${kind}`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = kind === "cast";
    mesh.receiveShadow = group.receiveShadow;
    if (mesh.castShadow) AttachShadowDepth(mesh);
    // 实例是全场人物，包围盒每帧都在动；逐实例剔除已经在 Update 里按人做过了。
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.matrixWorldAutoUpdate = false;
    if (group.skip) mesh.userData.skipNormalDepth = true;
    mesh.count = 0;
    this.scene.add(mesh);
    group.meshes[kind] = mesh;
    return mesh;
  }
}
