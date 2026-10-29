// Shadow-only cameras never join scene lights: no PBR sampler or light define.
// Native depth rendering preserves skinned/cutout/destruction caster contracts.
import * as THREE from "three";
import { FLARE_SHADOW as CFG } from "./Data_Tuning_FlareEffects.mjs";
import { MakeFullscreenMaterial, QUAD_GEOMETRY, QUAD_CAMERA } from "./Script_PostCommon.mjs";
import {FitReceiverCone,ReceiverConeCovered} from './Script_FlareShadowBounds.mjs';

const ConeConfig={...CFG,coneMaxHalfAngleRad:CFG.maxConeAngle,coneAngleGuardRad:CFG.coneGuardRad,coneDepthCoverageMargin:0};

// Dominant-axis order must match ClusterFlareShadow. The +/-Y faces use Z-up
// to avoid a degenerate lookAt; other faces use Y-up. Native depth materials
// preserve skinned, cutout and material-patch caster behavior on every face.
const FaceDirections=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const FaceUps=[[0,1,0],[0,1,0],[0,0,1],[0,0,1],[0,1,0],[0,1,0]];
const ReceiverGeometryVersions=new WeakMap();
const SkinBoundsCache=new WeakMap();
const BoneWorldRevisionCache=new WeakMap();
let receiverFrameId=0,receiverScanActive=false,nextBoneRevision=1;
const SkinMatrix=new THREE.Matrix4(),SkinWorldMatrix=new THREE.Matrix4(),SkinBox=new THREE.Box3();
const StaticReceiverCache=new WeakMap(),GeometryReceiverBins=new WeakMap();
const GeometryGroupStates=new WeakMap();
const VertexA=new THREE.Vector3(),VertexB=new THREE.Vector3(),VertexC=new THREE.Vector3();
const InstanceMatrix=new THREE.Matrix4();
const ReceiverCacheStats={hits:0,rebuilds:0,instanceObjects:0,batchedObjects:0,instanceActiveBoxes:0,instanceAggregateBoxes:0,instanceUploadsUnchanged:0,instanceBoxesUpdated:0,skinObjects:0,skinHits:0,boneReads:0,boneWorldChecks:0};
const AttributeVersion=attribute=>attribute?.isInterleavedBufferAttribute?attribute.data.version:attribute?.version;

function GroupRevision(geometry) {
  let state=GeometryGroupStates.get(geometry);
  if(!state){state={revision:0,values:[]};GeometryGroupStates.set(geometry,state);}
  const groups=geometry.groups,values=state.values;let changed=values.length!==groups.length*3;
  for(let i=0;i<groups.length;i++){
    const group=groups[i],at=i*3;
    if(values[at]!==group.start||values[at+1]!==group.count||values[at+2]!==group.materialIndex)changed=true;
    values[at]=group.start;values[at+1]=group.count;values[at+2]=group.materialIndex;
  }
  values.length=groups.length*3;if(changed)state.revision++;return state.revision;
}

function GeometryBins(geometry,cell) {
  const position=geometry.attributes.position,index=geometry.index,draw=geometry.drawRange;
  const groups=GroupRevision(geometry);
  let cache=GeometryReceiverBins.get(geometry);
  if(cache&&cache.position===position&&cache.positionVersion===AttributeVersion(position)&&cache.index===index&&cache.indexVersion===AttributeVersion(index)
    &&cache.start===draw.start&&cache.count===draw.count&&cache.groups===groups&&cache.cell===cell)return cache.boxes;
  const bins=new Map(),total=index?.count??position.count;
  // Including all material groups is conservative even when only some use
  // clustered PBR. Keep each group's primitive origin and drawRange clipping.
  const ranges=[{start:0,count:total},...geometry.groups];
  for(const range of ranges){
    const start=Math.max(draw.start,range.start),end=Math.min(total,draw.start+draw.count,range.start+range.count);
    for(let i=start;i+2<end;i+=3){
      VertexA.fromBufferAttribute(position,index?index.getX(i):i);VertexB.fromBufferAttribute(position,index?index.getX(i+1):i+1);VertexC.fromBufferAttribute(position,index?index.getX(i+2):i+2);
      const key=`${Math.floor((VertexA.x+VertexB.x+VertexC.x)/(3*cell))},${Math.floor((VertexA.z+VertexB.z+VertexC.z)/(3*cell))}`;
      let box=bins.get(key);if(!box){box=new THREE.Box3();bins.set(key,box);}
      // Whole triangle, including vertices across cell boundaries. A centroid
      // alone cannot prove that a triangle misses the camera or light volume.
      box.expandByPoint(VertexA).expandByPoint(VertexB).expandByPoint(VertexC);
    }
  }
  cache={position,positionVersion:AttributeVersion(position),index,indexVersion:AttributeVersion(index),start:draw.start,count:draw.count,groups,cell,boxes:[...bins.values()]};
  GeometryReceiverBins.set(geometry,cache);return cache.boxes;
}

function StaticWorldBoxes(object,version) {
  const geometry=object.geometry,matrix=object.matrixWorld.elements;
  let cache=StaticReceiverCache.get(object);
  const isInstances=object.isInstancedMesh||object.isBatchedMesh&&Array.isArray(object._instanceInfo);
  const matrixSame=cache&&cache.matrix.every((v,i)=>v===matrix[i]);
  const groups=GroupRevision(geometry);
  const same=cache&&cache.geometry===geometry&&cache.position===geometry.attributes.position&&cache.version===version&&cache.index===geometry.index&&cache.indexVersion===geometry.index?.version
    &&cache.start===geometry.drawRange.start&&cache.count===geometry.drawRange.count&&cache.groups===groups;
  if(isInstances){
    if(!cache)cache={};
    if(object.isBatchedMesh)ReceiverCacheStats.batchedObjects++;else ReceiverCacheStats.instanceObjects++;
    const info=object._instanceInfo,count=object.isBatchedMesh?info.length:object.count;
    const attribute=object.isBatchedMesh?object._matricesTexture:object.instanceMatrix,instanceVersion=attribute?.version;
    const values=object.isBatchedMesh?attribute.image.data:attribute.array;
    const storageSame=same&&cache.instanceAttribute===attribute&&cache.instanceCount===count&&cache.instanceValues?.length===count*16;
    if(!storageSame){cache.instanceValues=new Float32Array(count*16);cache.instanceIds=new Int32Array(count).fill(-2);cache.localBoxes=[];cache.boxes=[];cache.liveBoxes=[];}
    const valuesMayChange=!storageSame||cache.instanceVersion!==instanceVersion;
    let changed=false,metadataChanged=!storageSame;
    for(let i=0;i<count;i++){
      const id=object.isBatchedMesh?(info[i].active===false||info[i].visible===false?-1:info[i].geometryIndex):0,previous=cache.instanceIds[i];
      if(id<0){if(previous>=0){cache.localBoxes[i]=null;cache.boxes[i]=null;metadataChanged=true;}cache.instanceIds[i]=id;continue;}
      ReceiverCacheStats.instanceActiveBoxes++;
      let dirty=!storageSame||previous!==id;
      if(valuesMayChange)for(let j=0;j<16;j++){const at=i*16+j;if(cache.instanceValues[at]!==values[at])dirty=true;cache.instanceValues[at]=values[at];}
      if(dirty){
        if(!valuesMayChange)for(let j=0;j<16;j++)cache.instanceValues[i*16+j]=values[i*16+j];
        const box=cache.localBoxes[i]||new THREE.Box3();
        if(object.isBatchedMesh)object.getBoundingBoxAt(id,box);else box.copy(geometry.boundingBox);
        object.getMatrixAt(i,InstanceMatrix);box.applyMatrix4(InstanceMatrix);cache.localBoxes[i]=box;ReceiverCacheStats.instanceBoxesUpdated++;changed=true;
      }
      if(dirty||!matrixSame){const world=cache.boxes[i]||new THREE.Box3();world.copy(cache.localBoxes[i]).applyMatrix4(object.matrixWorld);world.receiverName=object.name||object.type;cache.boxes[i]=world;}
      if(previous!==id)metadataChanged=true;cache.instanceIds[i]=id;
    }
    if(metadataChanged){cache.liveBoxes.length=0;for(const box of cache.boxes)if(box)cache.liveBoxes.push(box);}
    if(metadataChanged||changed||!matrixSame||!cache.receiverBoxes){
      if(cache.liveBoxes.length<=CFG.receiverInstanceGroupMinCount)cache.receiverBoxes=cache.liveBoxes;
      else {
        const cells=new Map(),cell=CFG.receiverInstanceCellM;
        for(const box of cache.liveBoxes){
          const key=`${Math.floor((box.min.x+box.max.x)/(2*cell))},${Math.floor((box.min.y+box.max.y)/(2*cell))},${Math.floor((box.min.z+box.max.z)/(2*cell))}`;
          let group=cells.get(key);if(!group){group=new THREE.Box3();group.receiverName=box.receiverName;cells.set(key,group);}
          // Assign by center, retain the ENTIRE box across cell boundaries.
          // These are receiver bounds only; caster geometry is untouched.
          group.union(box);
        }
        cache.receiverBoxes=[...cells.values()];
      }
    }
    ReceiverCacheStats.instanceAggregateBoxes+=cache.receiverBoxes.length;
    if(!changed&&storageSame){ReceiverCacheStats.hits++;if(valuesMayChange)ReceiverCacheStats.instanceUploadsUnchanged++;}else ReceiverCacheStats.rebuilds++;
    Object.assign(cache,{geometry,position:geometry.attributes.position,version,index:geometry.index,indexVersion:geometry.index?.version,start:geometry.drawRange.start,count:geometry.drawRange.count,groups,
      instanceAttribute:attribute,instanceVersion,instanceCount:count});
    if(!matrixSame)cache.matrix=matrix.slice();StaticReceiverCache.set(object,cache);return cache.receiverBoxes;
  }
  if(same&&matrixSame&&!object.isBatchedMesh){ReceiverCacheStats.hits++;return cache.boxes;}
  ReceiverCacheStats.rebuilds++;
  let localBoxes;
  if(object.isBatchedMesh){
    if(!same||object.isBatchedMesh)object.computeBoundingBox();
    localBoxes=[object.boundingBox];
  }else{
    const scale=Math.max(Math.hypot(matrix[0],matrix[1],matrix[2]),Math.hypot(matrix[4],matrix[5],matrix[6]),Math.hypot(matrix[8],matrix[9],matrix[10]));
    const box=geometry.boundingBox,extent=Math.hypot(box.max.x-box.min.x,box.max.z-box.min.z)*scale;
    localBoxes=extent>CFG.receiverPartitionMinM&&!geometry.morphAttributes.position?.length?GeometryBins(geometry,CFG.receiverCellM/Math.max(scale,1e-8)):[box];
  }
  const boxes=localBoxes.map(box=>{const world=box.clone().applyMatrix4(object.matrixWorld);world.receiverName=object.name||object.type;return world;});
  cache={geometry,position:geometry.attributes.position,version,index:geometry.index,indexVersion:geometry.index?.version,start:geometry.drawRange.start,count:geometry.drawRange.count,groups,
    matrix:matrix.slice(),localBoxes,boxes};StaticReceiverCache.set(object,cache);return boxes;
}

function BoneWorldRevision(bone) {
  ReceiverCacheStats.boneReads++;
  let cache=BoneWorldRevisionCache.get(bone);
  if(!cache){cache={values:new Float64Array(16),revision:0,frame:-1};BoneWorldRevisionCache.set(bone,cache);}
  if(receiverScanActive&&cache.frame===receiverFrameId)return cache.revision;
  ReceiverCacheStats.boneWorldChecks++;
  const values=bone.matrixWorld.elements;let changed=false;
  for(let i=0;i<16;i++){if(cache.values[i]!==values[i])changed=true;cache.values[i]=values[i];}
  if(changed)cache.revision=nextBoneRevision++;
  cache.frame=receiverFrameId;return cache.revision;
}

function SkinnedReceiverBounds(object,bounds,version) {
  let cache=SkinBoundsCache.get(object);
  const bind=object.bindMatrix.elements,boneCount=object.skeleton.bones.length;
  if(!cache||cache.geometry!==object.geometry||cache.position!==object.geometry.attributes.position||cache.version!==version||cache.skeleton!==object.skeleton
    ||cache.firstInverse!==object.skeleton.boneInverses[0]||cache.boneCount!==boneCount||!cache.bind.every((v,i)=>v===bind[i])){
    const envelopes=[];
    for(const inverse of object.skeleton.boneInverses){
      SkinMatrix.multiplyMatrices(inverse,object.bindMatrix);SkinBox.copy(object.geometry.boundingBox).applyMatrix4(SkinMatrix);
      envelopes.push([(SkinBox.min.x+SkinBox.max.x)*.5,(SkinBox.min.y+SkinBox.max.y)*.5,(SkinBox.min.z+SkinBox.max.z)*.5,
        (SkinBox.max.x-SkinBox.min.x)*.5,(SkinBox.max.y-SkinBox.min.y)*.5,(SkinBox.max.z-SkinBox.min.z)*.5]);
    }
    cache={geometry:object.geometry,position:object.geometry.attributes.position,version,skeleton:object.skeleton,envelopes,bind:bind.slice(),firstInverse:object.skeleton.boneInverses[0],boneCount,
      pose:new Float64Array(boneCount),worldBind:new Float64Array(16),worldBounds:new THREE.Box3(),poseValid:false};SkinBoundsCache.set(object,cache);
  }
  bounds.makeEmpty();SkinWorldMatrix.multiplyMatrices(object.matrixWorld,object.bindMatrixInverse);
  let unchanged=cache.poseValid&&cache.bindMode===object.bindMode;
  if(object.bindMode!=='attached')for(let i=0;i<16;i++)if(cache.worldBind[i]!==SkinWorldMatrix.elements[i])unchanged=false;
  for(let i=0;i<boneCount;i++){const revision=BoneWorldRevision(object.skeleton.bones[i]);if(cache.pose[i]!==revision)unchanged=false;cache.pose[i]=revision;}
  if(unchanged){bounds.copy(cache.worldBounds);ReceiverCacheStats.skinHits++;return;}
  cache.worldBind.set(SkinWorldMatrix.elements);
  for(let i=0;i<cache.envelopes.length;i++){
    const b=cache.envelopes[i],bone=object.skeleton.bones[i],m=object.bindMode==='attached'?bone.matrixWorld.elements:SkinMatrix.multiplyMatrices(SkinWorldMatrix,bone.matrixWorld).elements;
    const x=m[0]*b[0]+m[4]*b[1]+m[8]*b[2]+m[12],y=m[1]*b[0]+m[5]*b[1]+m[9]*b[2]+m[13],z=m[2]*b[0]+m[6]*b[1]+m[10]*b[2]+m[14];
    const rx=Math.abs(m[0])*b[3]+Math.abs(m[4])*b[4]+Math.abs(m[8])*b[5],ry=Math.abs(m[1])*b[3]+Math.abs(m[5])*b[4]+Math.abs(m[9])*b[5],rz=Math.abs(m[2])*b[3]+Math.abs(m[6])*b[4]+Math.abs(m[10])*b[5];
    bounds.min.x=Math.min(bounds.min.x,x-rx);bounds.max.x=Math.max(bounds.max.x,x+rx);
    bounds.min.y=Math.min(bounds.min.y,y-ry);bounds.max.y=Math.max(bounds.max.y,y+ry);
    bounds.min.z=Math.min(bounds.min.z,z-rz);bounds.max.z=Math.max(bounds.max.z,z+rz);
  }
  cache.worldBounds.copy(bounds);cache.poseValid=true;cache.bindMode=object.bindMode;
}

// Bounding the ACTUAL PBR receiver geometry avoids rendering empty sky and
// every house behind the observer. Keep separate bounds through view/light
// rejection, then conservatively project each box onto each cube face. Any
// caster on a source-to-visible-receiver ray is inside the resulting frustum,
// even when that caster is itself outside the observer's view.
function ReceiverBoxes(ctx,frustum,boxes,scratch) {
  boxes.length=0;
  for(const key of Object.keys(ReceiverCacheStats))ReceiverCacheStats[key]=0;
  receiverFrameId++;receiverScanActive=true;
  try{ctx.scene.traverseVisible(object=>{
    if(!object.isMesh)return;
    const material=object.material;
    if(Array.isArray(material)?!material.some(m=>m?.visible&&m.isMeshStandardMaterial):!material?.visible||!material.isMeshStandardMaterial)return;
    // Match the main renderer's own object-level rejection before doing any
    // more detailed receiver work. Off-screen objects still remain casters.
    if(object.frustumCulled!==false&&!frustum.intersectsObject(object))return;
    const geometry=object.geometry,position=geometry.attributes.position,version=AttributeVersion(position),previous=ReceiverGeometryVersions.get(geometry);
    if(!geometry.boundingBox||previous?.position!==position||previous?.version!==version){geometry.computeBoundingBox();ReceiverGeometryVersions.set(geometry,{position,version});}
    if(object.isSkinnedMesh){
      ReceiverCacheStats.skinObjects++;
      // Every skinned vertex is a convex blend of bone-transformed bind
      // vertices. The union of these transformed whole-geometry boxes is
      // conservative for every pose, without CPU-skinning millions of points.
      SkinnedReceiverBounds(object,scratch,version);
      if(frustum.intersectsBox(scratch)){const box=scratch.clone();box.receiverName=object.name||object.type;boxes.push(box);}
    }else for(const box of StaticWorldBoxes(object,version))if(frustum.intersectsBox(box))boxes.push(box);
  });}finally{receiverScanActive=false;}
}

function SourceReceiverBounds(source,radius,boxes,bounds) {
  bounds.makeEmpty();
  for(const box of boxes){
    const minX=Math.max(box.min.x,source.x-radius),maxX=Math.min(box.max.x,source.x+radius);
    const minY=Math.max(box.min.y,source.y-radius),maxY=Math.min(box.max.y,source.y+radius);
    const minZ=Math.max(box.min.z,source.z-radius),maxZ=Math.min(box.max.z,source.z+radius);
    if(minX>maxX||minY>maxY||minZ>maxZ)continue;
    bounds.min.x=Math.min(bounds.min.x,minX);bounds.max.x=Math.max(bounds.max.x,maxX);
    bounds.min.y=Math.min(bounds.min.y,minY);bounds.max.y=Math.max(bounds.max.y,maxY);
    bounds.min.z=Math.min(bounds.min.z,minZ);bounds.max.z=Math.max(bounds.max.z,maxZ);
  }
  if(!bounds.isEmpty())bounds.expandByScalar(CFG.normalBiasM);
}

const FaceCharts=FaceDirections.map((d,face)=>{
  const up=FaceUps[face],right=[d[1]*up[2]-d[2]*up[1],d[2]*up[0]-d[0]*up[2],d[0]*up[1]-d[1]*up[0]];
  return [d,up,right].flatMap(axis=>[axis.findIndex(v=>v!==0),axis.find(v=>v!==0)]);
});
const FitLo=new Float64Array(3),FitHi=new Float64Array(3);

function FitFaces(source,radius,boxes,clipSource=source,clipRadius=radius) {
  const fits=new Array(CFG.faces).fill(null);
  const lo=FitLo,hi=FitHi;
  for(const box of boxes){
    const bias=CFG.normalBiasM;
    lo[0]=Math.max(box.min.x-source.x-bias,clipSource.x-source.x-clipRadius);lo[1]=Math.max(box.min.y-source.y-bias,clipSource.y-source.y-clipRadius);lo[2]=Math.max(box.min.z-source.z-bias,clipSource.z-source.z-clipRadius);
    hi[0]=Math.min(box.max.x-source.x+bias,clipSource.x-source.x+clipRadius);hi[1]=Math.min(box.max.y-source.y+bias,clipSource.y-source.y+clipRadius);hi[2]=Math.min(box.max.z-source.z+bias,clipSource.z-source.z+clipRadius);
    if(lo[0]>hi[0]||lo[1]>hi[1]||lo[2]>hi[2])continue;
    for(let face=0;face<CFG.faces;face++){
      const c=FaceCharts[face],depthMin=c[1]>0?lo[c[0]]:-hi[c[0]],depthMax=c[1]>0?hi[c[0]]:-lo[c[0]];
      const verticalMin=c[3]>0?lo[c[2]]:-hi[c[2]],verticalMax=c[3]>0?hi[c[2]]:-lo[c[2]],horizontalMin=c[5]>0?lo[c[4]]:-hi[c[4]],horizontalMax=c[5]>0?hi[c[4]]:-lo[c[4]];
      if(depthMax<CFG.nearM||horizontalMin>depthMax||horizontalMax<-depthMax||verticalMin>depthMax||verticalMax<-depthMax)continue;
      // Inside this face depth >= |horizontal| and |vertical|. Applying their
      // closest possible magnitudes avoids expanding a ground box to the
      // entire face merely because its X/Z extent crosses the source plane.
      const minDepth=Math.max(CFG.nearM,depthMin,horizontalMin>0?horizontalMin:horizontalMax<0?-horizontalMax:0,verticalMin>0?verticalMin:verticalMax<0?-verticalMax:0),guard=CFG.receiverGuard;
      const minU=Math.max(-1,horizontalMin/(horizontalMin<0?minDepth:depthMax)-guard),maxU=Math.min(1,horizontalMax/(horizontalMax>0?minDepth:depthMax)+guard);
      const minV=Math.max(-1,verticalMin/(verticalMin<0?minDepth:depthMax)-guard),maxV=Math.min(1,verticalMax/(verticalMax>0?minDepth:depthMax)+guard),far=depthMax+CFG.depthGuardM;
      const previous=fits[face];
      if(!previous)fits[face]={minU,maxU,minV,maxV,far};
      else {previous.minU=Math.min(previous.minU,minU);previous.maxU=Math.max(previous.maxU,maxU);previous.minV=Math.min(previous.minV,minV);previous.maxV=Math.max(previous.maxV,maxV);previous.far=Math.max(previous.far,far);}
    }
  }
  return fits;
}

function Covers(previous,current) {
  return current.every((fit,i)=>!fit||previous?.[i]&&previous[i].minU<=fit.minU+CFG.receiverGuard*.5
    &&previous[i].maxU>=fit.maxU-CFG.receiverGuard*.5&&previous[i].minV<=fit.minV+CFG.receiverGuard*.5
    &&previous[i].maxV>=fit.maxV-CFG.receiverGuard*.5&&previous[i].far>=fit.far-CFG.depthGuardM*.5);
}

export class FlareShadowsPass {
  constructor(pipeline) {
    this.name="flareShadows";this.pipeline=pipeline;this.slots=[];this.pending=null;
    this.serial=0;this.stats={maps:0,updates:0,faces:0,calls:0,triangles:0};
    this.frustum=new THREE.Frustum();this.viewProjection=new THREE.Matrix4();
    this.receiverBounds=new THREE.Box3();this.receiverBoxes=[];this.scratchBounds=new THREE.Box3();this.extraPending=[];
    this.shadowViewPosition=new THREE.Vector3();
    this.packUniforms={uDepth:{value:null},uNearFar:{value:new THREE.Vector2()},uMapSize:{value:CFG.size}};
  }
  Resize() {} // map size is independent of screen resolution
  SetSource(lightRig){this.lightRig=lightRig;}
  Prepare(ctx) {
    const cluster=this.lightRig?.clustered;
    if(this.cluster&&this.cluster!==cluster)this.Idle();
    this.cluster=cluster;this.pending=null;this.extraPending.length=0;
    if(!cluster)return;
    for(const info of cluster.uniforms.uFlareShadowInfo.value)info.w=0;
    if(!ctx.preset.flareShadows||!ctx.renderer.shadowMap.enabled||!this.pipeline.hdrCapable
      ||!ctx.renderer.extensions.has('EXT_color_buffer_float'))return;
    const candidates=[];
    for(let i=0;i<cluster.activeCount;i++) {
      const source=cluster.sourceShadow[cluster.selected[i]];
      if(source)candidates.push({source,index:i});
    }
    const chosen=candidates.slice(0,CFG.slots);
    if(chosen.length)this.EnsureResources();
    if(chosen.length){
      this.frustum.setFromProjectionMatrix(this.viewProjection.multiplyMatrices(ctx.camera.projectionMatrix,ctx.camera.matrixWorldInverse));
      const at=performance.now();
      ReceiverBoxes(ctx,this.frustum,this.receiverBoxes,this.scratchBounds);
      this.stats.receiverMs=performance.now()-at;
      this.stats.receiverCache={...ReceiverCacheStats};
    }
    for(const slot of this.slots) {
      if(!chosen.some(c=>c.source===slot.source)){slot.source=null;slot.valid=false;}
    }
    const fitAt=performance.now();this.stats.fitReuse=0;
    for(const candidate of chosen) {
      let slot=this.slots.find(s=>s.source===candidate.source);
      if(!slot){slot=this.slots.find(s=>!s.source);slot.source=candidate.source;slot.valid=false;slot.last=-1;}
      slot.index=candidate.index;
      SourceReceiverBounds(slot.source.position,Math.max(CFG.nearM*2,slot.source.currentRadius),this.receiverBoxes,this.receiverBounds);
      let cone=null;
      if(slot.valid&&slot.cone){
        const e=slot.recenteredMatrix.copy(slot.matrices[0]).elements,dx=slot.source.position.x-slot.position.x,dy=slot.source.position.y-slot.position.y,dz=slot.source.position.z-slot.position.z;
        // Reuse only the fitted projection, never an old shadow render. Move
        // that world projection to the current emitter and certify all current
        // receiver vertices before drawing BOTH fresh maps at this position.
        for(let row=0;row<4;row++)e[12+row]-=e[row]*dx+e[4+row]*dy+e[8+row]*dz;
        if(ReceiverConeCovered(slot.recenteredMatrix,slot.source.position,Math.max(CFG.nearM*2,slot.source.currentRadius),this.receiverBoxes,this.frustum.planes[5],ConeConfig)){cone=slot.cone;this.stats.fitReuse++;}
      }
      slot.nextCone=cone||FitReceiverCone(slot.source.position,Math.max(CFG.nearM*2,slot.source.currentRadius),this.receiverBoxes,this.frustum.planes[5],ConeConfig);
      slot.nextFits=slot.nextCone?null:FitFaces(slot.source.position,Math.max(CFG.nearM*2,slot.source.currentRadius),this.receiverBoxes);
      if(!this.pending||slot.last<this.pending.last)this.pending=slot;
    }
    this.stats.fitMs=performance.now()-fitAt;
    this.stats.maps=chosen.length;
    // An ordinary frame refreshes one source. A newly exposed view must also
    // refresh any other source whose previous crop no longer covers it.
    for(const slot of this.slots)if(slot.source&&slot!==this.pending){
      const radius=Math.max(CFG.nearM*2,slot.source.currentRadius);
      // Coverage must be measured in the LAST map's source frame. Comparing
      // two angular intervals relative to different moving origins is unsafe.
      const covered=slot.valid&&(slot.cone?ReceiverConeCovered(slot.matrices[0],slot.source.position,radius,this.receiverBoxes,this.frustum.planes[5],ConeConfig)
        :Covers(slot.fits,FitFaces(slot.position,radius+slot.position.distanceTo(slot.source.position),this.receiverBoxes,slot.source.position,radius)));
      if(!covered)this.extraPending.push(slot);
    }
    // Previous map stays in its own world-space frame, then converts CURRENT view.
    for(const slot of this.slots)if(slot.source&&slot.valid)this.Publish(slot,ctx);
  }
  Enabled(){return !!this.pending;}
  EnsureResources() {
    this.cluster.EnsureFlareShadowStorage();
    if(this.slots.length)return;
    this.dummyScene=new THREE.Scene();
    this.dummyMaterial=MakeFullscreenMaterial('void main(){gl_FragColor=vec4(0.);}',{});
    this.dummyMaterial.colorWrite=false;
    this.dummyMesh=new THREE.Mesh(QUAD_GEOMETRY,this.dummyMaterial);
    this.dummyMesh.frustumCulled=false;this.dummyScene.add(this.dummyMesh);
    this.dummyTarget=new THREE.WebGLRenderTarget(1,1,{depthBuffer:false});
    const rows=CFG.size*CFG.size/(1024*4);
    this.packedTarget=new THREE.WebGLRenderTarget(1024,rows,{type:THREE.FloatType,
      minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:false});
    this.packedFarTarget=new THREE.WebGLRenderTarget(1024,CFG.farSize*CFG.farSize/(1024*4),{type:THREE.FloatType,
      minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:false});
    this.packMaterial=MakeFullscreenMaterial(`
      uniform sampler2D uDepth;
      uniform vec2 uNearFar;
      uniform int uMapSize;
      float ReadDepth(int index){
        float d=texelFetch(uDepth,ivec2(index%uMapSize,index/uMapSize),0).r;
        return uNearFar.x*uNearFar.y/(uNearFar.y-d*(uNearFar.y-uNearFar.x));
      }
      void main(){
        int i=(int(gl_FragCoord.y)*1024+int(gl_FragCoord.x))*4;
        gl_FragColor=vec4(ReadDepth(i),ReadDepth(i+1),ReadDepth(i+2),ReadDepth(i+3));
      }`,this.packUniforms);
    this.copyOffset=new THREE.Vector2();
    for(let i=0;i<CFG.slots;i++) {
      const MakeLight=size=>{const light=new THREE.SpotLight(0xffffff,0,1,CFG.angle);
        light.castShadow=true;light.shadow.autoUpdate=false;light.shadow.mapSize.set(size,size);light.shadow.camera.near=CFG.nearM;return light;};
      const light=MakeLight(CFG.size),farLight=MakeLight(CFG.farSize);
      this.slots.push({id:i,light,farLight,source:null,valid:false,last:-1,position:new THREE.Vector3(),recenteredMatrix:new THREE.Matrix4(),
        matrices:Array.from({length:CFG.faces},()=>new THREE.Matrix4())});
    }
  }
  Publish(slot,ctx) {
    const cluster=this.cluster;
    cluster.lightData[slot.index*16+7]=-slot.id-1;
    cluster.uniforms.uFlareShadowViewRotation.value.setFromMatrix4(ctx.camera.matrixWorld);
    this.shadowViewPosition.copy(slot.position).applyMatrix4(ctx.camera.matrixWorldInverse);
    cluster.uniforms.uFlareShadowPosition.value[slot.id].set(this.shadowViewPosition.x,this.shadowViewPosition.y,this.shadowViewPosition.z,slot.cone?1:0);
    for(let face=0;face<CFG.faces;face++){
      const map=slot.id*CFG.faces+face;
      cluster.uniforms.uFlareShadowMatrix.value[map].multiplyMatrices(slot.matrices[face],ctx.camera.matrixWorld);
      cluster.uniforms.uFlareShadowInfo.value[map].set(
        cluster.shadowBase+map*CFG.size*CFG.size/4,CFG.biasM,slot.cone&&face===0?CFG.farSize:CFG.size,slot.fits?.[face]?1:0);
    }
  }
  Render(ctx) {
    const renderer=ctx.renderer,calls=renderer.info.render.calls,triangles=renderer.info.render.triangles;
    this.stats.renderedFaces=0;
    this.RenderSource(ctx,this.pending);
    for(const slot of this.extraPending)this.RenderSource(ctx,slot);
    this.stats.calls=renderer.info.render.calls-calls;
    this.stats.triangles=renderer.info.render.triangles-triangles;
  }
  RenderSource(ctx,slot) {
    const renderer=ctx.renderer;
    const oldTarget=renderer.getRenderTarget(),oldFace=renderer.getActiveCubeFace(),oldLevel=renderer.getActiveMipmapLevel();
    const auto=renderer.shadowMap.autoUpdate,needed=renderer.shadowMap.needsUpdate;
    const infoAuto=renderer.info.autoReset;renderer.info.autoReset=false;
    try {
      // shadowMap.render requires an active WebGLRenderState; the dummy render
      // establishes one without contributing a light or a visible draw.
      // Publish only after all selected maps were drawn at this source/time.
      const maps=[];
      if(slot.nextCone){
        const height=Math.max(4,slot.source.position.y-ctx.camera.position.y),nearAngle=Math.min(CFG.maxConeAngle,Math.atan2(CFG.nearReceiverRadiusM,height));
        const nearFar=Math.min(slot.source.currentRadius,Math.hypot(height,CFG.nearReceiverRadiusM)+CFG.nearDepthMarginM);
        maps.push({face:0,light:slot.farLight,size:CFG.farSize,cone:slot.nextCone},{face:4,light:slot.light,size:CFG.size,cone:{direction:[0,-1,0],angle:nearAngle,far:nearFar}});
      }else for(let face=0;face<CFG.faces;face++)if(slot.nextFits[face])maps.push({face,light:slot.light,size:CFG.size,fit:slot.nextFits[face]});
      for(const entry of maps){
        const {face,light,size,fit,cone}=entry,direction=cone?cone.direction:FaceDirections[face];
        light.position.copy(slot.source.position);light.updateMatrixWorld();
        light.target.position.set(light.position.x+direction[0],light.position.y+direction[1],light.position.z+direction[2]);
        const vertical=Math.abs(direction[1])>.9;light.shadow.camera.up.set(0,vertical?0:1,vertical?1:0);
        light.distance=cone?cone.far:fit.far;light.angle=cone?cone.angle:CFG.angle;
        if(cone&&cone.minU!=null)light.shadow.camera.setViewOffset(2,2,cone.minU+1,1-cone.maxV,cone.maxU-cone.minU,cone.maxV-cone.minV);
        else if(cone)light.shadow.camera.clearViewOffset();
        else light.shadow.camera.setViewOffset(2,2,fit.minU+1,1-fit.maxV,Math.max(.00001,fit.maxU-fit.minU),Math.max(.00001,fit.maxV-fit.minV));
        light.target.updateMatrixWorld();light.shadow.needsUpdate=true;
        this.dummyMesh.onBeforeRender=()=>{renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;renderer.shadowMap.render([light],ctx.scene,ctx.camera);};
        renderer.setRenderTarget(this.dummyTarget);renderer.render(this.dummyScene,QUAD_CAMERA);
        this.packUniforms.uDepth.value=light.shadow.map.depthTexture;
        this.packUniforms.uNearFar.value.set(light.shadow.camera.near,light.shadow.camera.far);
        this.packUniforms.uMapSize.value=size;
        const packedTarget=size===CFG.farSize?this.packedFarTarget:this.packedTarget;
        ctx.blitter.Blit(this.packMaterial,packedTarget);
        slot.matrices[face].multiplyMatrices(light.shadow.camera.projectionMatrix,light.shadow.camera.matrixWorldInverse);
        renderer.initTexture(this.cluster.dataTexture);
        this.copyOffset.set(0,(this.cluster.shadowBase+(slot.id*CFG.faces+face)*CFG.size*CFG.size/4)/1024);
        renderer.copyTextureToTexture(packedTarget.texture,this.cluster.dataTexture,null,this.copyOffset);
        this.stats.renderedFaces++;
      }
      slot.position.copy(slot.source.position);slot.cone=slot.nextCone;
      slot.fits=slot.cone?new Array(CFG.faces).fill(null):slot.nextFits;
      if(slot.cone){slot.fits[0]=slot.cone;slot.fits[4]=true;}
      slot.valid=true;slot.last=this.serial++;
      this.Publish(slot,ctx);
      this.cluster.UploadMetadata();
      this.stats.updates++;
      this.stats.faces=CFG.faces;
    } finally {
      this.dummyMesh.onBeforeRender=()=>{};
      renderer.setRenderTarget(oldTarget,oldFace,oldLevel);
      renderer.shadowMap.autoUpdate=auto;renderer.shadowMap.needsUpdate=needed;
      renderer.info.autoReset=infoAuto;
    }
  }
  Idle() {
    if(this.cluster)for(const info of this.cluster.uniforms.uFlareShadowInfo.value)info.w=0;
    this.pending=null;this.extraPending.length=0;this.stats.maps=0;
    for(const slot of this.slots){slot.source=null;slot.valid=false;}
  }
  Dispose() {
    this.Idle();
    for(const slot of this.slots){slot.light.shadow.dispose();slot.farLight.shadow.dispose();}
    this.slots.length=0;
    this.dummyMaterial?.dispose();this.dummyTarget?.dispose();this.packedTarget?.dispose();this.packedFarTarget?.dispose();this.packMaterial?.dispose();
  }
}
