import * as THREE from 'three';
import {CloneSlimeVolume,PoseSlimeVolume,StepSlimeVolume,WriteSlimeSurface} from './Script_SlimePhysics.mjs?v=ear025-oily-20260912';
import {mergeGeometries} from './vendor/three/examples/jsm/utils/BufferGeometryUtils.js';

// 盘内藏品只保存外观与独立运动状态，不再持有耳壁物理体或参与客人评分。
export function CreateCollectionTray({scene, tray, camera, Project, size, scoop}) {
  const group=new THREE.Group();scene.add(group);
  const pieces=[],batches=new Map(),ray=new THREE.Raycaster(),plane=new THREE.Plane();
  const flat=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(0,1,0));
  const cleaner=scoop.clone(true);cleaner.name='Model_TrayCleaner';scene.add(cleaner);cleaner.visible=false;
  // 免费清盘耳勺是独立竹制器具，不参与采耳工具的等级和皮肤切换。
  cleaner.traverse(node=>{if(node.isMesh){node.name=node.name.replace('Model_','Model_TrayCleaner');node.geometry=node.geometry.clone();node.material=(Array.isArray(node.material)?node.material:[node.material]).map(m=>{const copy=m.clone();copy.name='Material_TrayCleanerBamboo';copy.clippingPlanes=[];return copy;});if(node.material.length===1)node.material=node.material[0];}});
  let serial=0,tilt=0,tilting=false,active=false,drag=null,removed=0;
  const unitScale=new THREE.Vector3(1,1,1),matrix=new THREE.Matrix4();
  function Sync(){group.position.copy(tray.position);group.quaternion.copy(tray.quaternion);group.updateMatrixWorld(true);}
  function Rebuild(){
    for(const batch of batches.values()){group.remove(batch.mesh);batch.mesh.geometry.dispose();batch.mesh.material.dispose();}
    batches.clear();
    for(const piece of pieces){
      if(!batches.has(piece.key))batches.set(piece.key,{pieces:[],geometries:[],material:piece.material,vertices:0});
      const batch=batches.get(piece.key);piece.offset=batch.vertices;batch.vertices+=piece.geometry.attributes.position.count;
      batch.pieces.push(piece);batch.geometries.push(piece.geometry);
    }
    for(const batch of batches.values()){
      const mesh=new THREE.Mesh(mergeGeometries(batch.geometries),batch.material.clone());
      if(batch.material.userData.oily){mesh.material.onBeforeCompile=batch.material.onBeforeCompile;mesh.material.customProgramCacheKey=batch.material.customProgramCacheKey;}
      mesh.castShadow=mesh.receiveShadow=true;mesh.frustumCulled=false;group.add(mesh);batch.mesh=mesh;
    }
    Write();
  }
  function Write(){
    for(const batch of batches.values()){
      const target=batch.mesh.geometry.attributes.position;
      for(const p of batch.pieces){const source=p.geometry.attributes.position;
        for(let i=0;i<source.count;i++)target.setXYZ(p.offset+i,source.getX(i)+p.position.x,source.getY(i)+p.position.y,source.getZ(i)+p.position.z);
        if(p.gelBody){const normals=batch.mesh.geometry.attributes.normal,sourceNormals=p.geometry.attributes.normal,thickness=batch.mesh.geometry.attributes.gelThickness;for(let i=0;i<source.count;i++){normals.setXYZ(p.offset+i,sourceNormals.getX(i),sourceNormals.getY(i),sourceNormals.getZ(i));thickness.setX(p.offset+i,p.gelBody.gel.render.thickness[i]);}normals.needsUpdate=thickness.needsUpdate=true;}
      }
      target.needsUpdate=true;
    }
  }
  function Add(c,position){
    if(c.trayStored||c.toolId==='suction')return;
    c.trayStored=true;
    const geometry=c.mesh.geometry.clone().applyMatrix4(matrix.compose(new THREE.Vector3(),flat,unitScale));
    // 所有来源统一属性，碎裂面与天然微屑可以进入同一材质批次。
    for(const name of Object.keys(geometry.attributes))if(!['position','normal','uv',...(c.body.gel?['gelRest','gelThickness']:[])].includes(name))geometry.deleteAttribute(name);
    if(!geometry.attributes.uv)geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count*2),2));
    const material=c.mesh.material.clone();material.clippingPlanes=[];
    if(c.body.gel){material.onBeforeCompile=c.mesh.material.onBeforeCompile;material.customProgramCacheKey=c.mesh.material.customProgramCacheKey;}
    pieces.push({id:++serial,key:c.type+':'+c.tone,gelBody:c.body.gel?CloneSlimeVolume(c.body,position.toArray()):null,geometry,material,position:position.clone(),velocity:new THREE.Vector3(),floor:position.y,mass:c.mass,grains:c.grainCount||1,radius:Math.max(.35,Math.min(1.7,Math.max(...c.footprint)/2)),fall:0});
    Rebuild();
  }
  function Point(x,y){
    Sync();const viewport=size();ray.setFromCamera(new THREE.Vector2(x/viewport.width*2-1,1-y/viewport.height*2),camera);
    plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0,1,0).applyQuaternion(group.quaternion),group.position);
    const hit=ray.ray.intersectPlane(plane,new THREE.Vector3());return hit?group.worldToLocal(hit):null;
  }
  function ShowCleaner(p){
    cleaner.visible=active&&!tilting;
    cleaner.position.copy(group.localToWorld(p.clone().setY(.8)));
    cleaner.quaternion.copy(group.quaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-.7,0,-.45)));
  }
  function Begin(x,y){
    if(!active||tilting)return false;const p=Point(x,y);
    if(!p||Math.hypot(p.x/29,p.z/18)>1.15)return false;
    drag=p;ShowCleaner(p);return true;
  }
  function Move(x,y){
    if(!drag||!active)return;const p=Point(x,y);if(!p)return;
    p.x=THREE.MathUtils.clamp(p.x,-36,36);p.z=THREE.MathUtils.clamp(p.z,-24,24);
    const delta=p.clone().sub(drag);delta.y=0;
    // 扫掠细分避免快速鼠标或低帧率触控跨过小碎屑。
    const steps=Math.max(1,Math.ceil(delta.length()/.45)),step=delta.clone().divideScalar(steps),cursor=drag.clone();
    for(let i=0;i<steps;i++){
      cursor.add(step);
      for(const piece of pieces)if(!piece.fall&&Math.hypot(piece.position.x-cursor.x,piece.position.z-cursor.z)<piece.radius+1.25){piece.position.add(step);piece.velocity.copy(step).multiplyScalar(12);if(piece.gelBody){PoseSlimeVolume(piece.gelBody,piece.position.toArray(),piece.gelBody.rotation);piece.gelBody.gel.awake=.45;for(const v of piece.gelBody.gel.velocities){v[0]+=step.x*6;v[2]+=step.z*6;}}}
    }
    drag=p;ShowCleaner(p);Write();
  }
  function End(){drag=null;cleaner.visible=false;}
  function SetTilt(value){tilting=active&&value;End();}
  function Update(dt){
    const previous=tilt;tilt+=( (tilting?.98:0)-tilt)*(1-Math.exp(-dt*5));
    if(Math.abs(tilt)<.00001)tilt=0;
    tray.rotation.x=-tilt;Sync();group.visible=tray.visible;
    let dirty=previous!==tilt,deleted=false;
    for(let i=pieces.length-1;i>=0;i--){
      const p=pieces[i];
      if(p.fall){
        p.fall+=dt;
        // 离盘后按世界竖直方向下落，盘子回平也不会把耳垢接回。
        p.fallVelocity.y-=50*dt;p.fallPosition.addScaledVector(p.fallVelocity,dt);
        p.position.copy(group.worldToLocal(p.fallPosition.clone()));dirty=true;
        if(p.fall>1.2){pieces.splice(i,1);p.geometry.dispose();p.material.dispose();deleted=true;}
        continue;
      }
      if(active&&dt>0){
        const gravity=Math.max(0,Math.sin(tilt)-.12)*42;
        p.velocity.z-=gravity*dt;p.position.addScaledVector(p.velocity,dt);p.velocity.multiplyScalar(Math.exp(-dt*(tilting?1.2:9)));p.position.y=p.floor;
        dirty=dirty||gravity>0||p.velocity.lengthSq()>.000001;
        if(Math.hypot(p.position.x/26.2,p.position.z/15.7)>1){p.fall=.001;p.fallPosition=group.localToWorld(p.position.clone());p.fallVelocity=p.velocity.clone().applyQuaternion(group.quaternion);removed++;}
      }
      if(p.gelBody&&dt>0&&p.gelBody.gel.awake>0&&!p.fall){
        PoseSlimeVolume(p.gelBody,p.position.toArray(),p.gelBody.rotation);StepSlimeVolume(p.gelBody,{gravity:[0,-8,0],floor:.045},dt);p.position.fromArray(p.gelBody.position);p.floor=p.position.y;
        WriteSlimeSurface(p.gelBody,p.geometry.attributes.position.array);p.geometry.applyQuaternion(new THREE.Quaternion().fromArray(p.gelBody.rotation));p.geometry.computeVertexNormals();dirty=true;
      }
    }
    if(deleted)Rebuild();else if(dirty)Write();
  }
  function SetActive(value){active=value;tilting=false;End();if(!value){for(const p of pieces)if(!p.fall)p.velocity.set(0,0,0);tilt=0;tray.rotation.x=0;Sync();}}
  function Probe(){return{active,tilting,tilt,dragging:!!drag,count:pieces.filter(p=>!p.fall).length,mass:pieces.reduce((sum,p)=>sum+(p.fall?0:p.mass),0),removed,batches:batches.size,toolVisible:cleaner.visible,pieces:pieces.filter(p=>!p.fall).map(p=>({id:p.id,mass:p.mass,position:p.position.toArray(),screen:Project(group.localToWorld(p.position.clone()))}))};}
  function Clear(){for(const p of pieces){p.geometry.dispose();p.material.dispose();}pieces.length=0;serial=removed=0;SetActive(false);Rebuild();}
  return{Add,Begin,Move,End,SetTilt,SetActive,Update,Probe,Sync,
    Clear,Suspend(){const saved={pieces:pieces.splice(0),serial,removed,active,tilt};serial=removed=0;SetActive(false);Rebuild();return saved;},
    Restore(saved){Clear();pieces.push(...saved.pieces);serial=saved.serial;removed=saved.removed;active=saved.active;tilt=saved.tilt;tray.rotation.x=-tilt;Rebuild();Sync();},
    Dispose(){for(const p of pieces){p.geometry.dispose();p.material.dispose();}for(const b of batches.values()){b.mesh.geometry.dispose();b.mesh.material.dispose();}cleaner.traverse(n=>{n.geometry?.dispose();for(const m of Array.isArray(n.material)?n.material:n.material?[n.material]:[])m.dispose();});scene.remove(group,cleaner);}};
}
