import * as THREE from 'three';
import { BuildEar, MakeRng } from './Script_EarAnatomy.js?v=ear009-20260911';
import { GLTFLoader } from './vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { PALETTE as P } from './Data_Palette.mjs?v=ear009-20260911';

import { CreatePeelBody, GripPeelBody, UngripPeelBody, GetGripPoint, StepPeelBody } from './Script_PeelPhysics.mjs?v=ear009-20260911';
import {mergeGeometries} from './vendor/three/examples/jsm/utils/BufferGeometryUtils.js';
import {FractureGeometry} from './Script_FractureGeometry.js?v=ear009-20260911';
import { CreateToolContact } from './Script_ToolContact.js?v=ear009-20260911';
import { CreateTactileMaterials } from './Script_TactileMaterials.js?v=ear009-20260911';
const Clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

// 封闭耳道、真实接触点与实体收集盘共用毫米世界；镜头在取出时连续后退。
export async function CreateImmersiveScene({ core }) {
  const asset = await new GLTFLoader().loadAsync(new URL('./Models/Model_ImmersiveEar.glb?v=ear009-20260911', import.meta.url).href);
  asset.scene.updateMatrixWorld(true);
  const materials=await CreateTactileMaterials(core.renderer);
  const profile=await (await fetch(new URL('./Data_CanalProfile.json',import.meta.url))).json();
  const contact=CreateToolContact(profile);
  let lampOn=false,aim=new THREE.Vector2(),aimed=false,toolLevels={},toolSkins={},lastToolId=null,previewTriangles=0;
  function Baked(name) {
    const source = asset.scene.getObjectByName(name);
    if(!source)throw new Error('模型缺少节点：'+name);
    const meshes=[];source.traverse(n=>{if(n.isMesh)meshes.push(n);});
    const geometries=meshes.map(n=>{const g=n.geometry.clone().applyMatrix4(n.matrixWorld);for(const key of Object.keys(g.attributes))if(!['position','normal','uv'].includes(key))g.deleteAttribute(key);if(!g.attributes.uv)g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count*2),2));return g;});
    const mesh=new THREE.Mesh(geometries.length===1?geometries[0]:mergeGeometries(geometries,true),meshes.length===1?meshes[0].material.clone():meshes.map(m=>m.material.clone()));
    mesh.name = name; return mesh;
  }
  const { scene, camera } = core;
  core.renderer.localClippingEnabled = true;
  const toolClip = new THREE.Plane();
  const anatomy = BuildEar(null, { quality: 'low' });
  const canal = anatomy.canal;
  const root = new THREE.Group();
  scene.add(root);
  scene.background = new THREE.Color('#392c27');
  const ambient = new THREE.HemisphereLight(0xe0e7e8, 0x647074, 1.0); scene.add(ambient);
  const key = new THREE.DirectionalLight(P.cream, 2.1); key.position.set(-15, 30, -40); scene.add(key);
  const lamp = new THREE.SpotLight(P.skinSheen,62,80,1.25,.8,2);scene.add(lamp,lamp.target);
  lamp.castShadow=true;lamp.shadow.mapSize.set(1024,1024);
  lamp.shadow.camera.near=.2;lamp.shadow.camera.far=45;lamp.shadow.bias=-.00005;lamp.shadow.normalBias=.018;
  lamp.shadow.intensity=.78;lamp.shadow.normalBias=.008;
  core.setExposure(1.1);lamp.color.set(0xfffbf5);
  const environmentScene=new THREE.Scene();environmentScene.background=new THREE.Color(0x333b40);
  for(const [x,y,z,w,h] of [[-5,5,4,4,9],[4,1,-3,3,8],[0,8,0,8,2]]){const card=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:0xe9edef,side:THREE.DoubleSide}));card.position.set(x,y,z);card.lookAt(0,0,0);environmentScene.add(card);}
  const pmrem=new THREE.PMREMGenerator(core.renderer);scene.environment=pmrem.fromScene(environmentScene,.08).texture;pmrem.dispose();environmentScene.traverse(n=>{n.geometry?.dispose();n.material?.dispose();});scene.environmentIntensity=.18;
  const customerBackdrop=await new THREE.TextureLoader().loadAsync(new URL('./Textures/Texture_CustomerSideProfile.png?v=ear009-20260911',import.meta.url).href);customerBackdrop.colorSpace=THREE.SRGBColorSpace;

  const outer = new THREE.Group(), canalGroup = new THREE.Group(); root.add(outer, canalGroup);
  for (const name of ['Model_OuterEar','Model_Temple','Model_Pillow']){const mesh=Baked(name);if(name!=='Model_Pillow')mesh.material=materials.Skin({outer:true});outer.add(mesh);}
  const wall = Baked('Model_Canal'); wall.material.side = THREE.DoubleSide; wall.receiveShadow=true; const drum=Baked('Model_Eardrum');drum.material.side=THREE.DoubleSide;const hair=Baked('Model_CanalHair');hair.material=new THREE.MeshPhysicalMaterial({color:0xb8a48a,roughness:.8,sheen:1,sheenColor:0xc4b79c,sheenRoughness:.7});canalGroup.add(wall,drum,hair);
  wall.material=materials.Skin();wall.receiveShadow=true;
  const focus = canal.CenterAt(5.4).clone();
  const right = new THREE.Vector3(), up = new THREE.Vector3(), toward = new THREE.Vector3();
  const workingPlane = new THREE.Plane();
  const ray = new THREE.Raycaster();
  let width = 1, height = 1, chunks = [], inside = false, entrance = 0;
  let lastToolPoint = null, transfer = null, showcase = false,tearTransfer=null;
  const outsidePosition = new THREE.Vector3(6, 5, -88);
  const insidePosition = new THREE.Vector3(-.25, .2, -1.8);
  camera.position.copy(outsidePosition); camera.up.set(0, 1, 0); camera.lookAt(-2, 1, 0); camera.updateMatrixWorld(true);
  function Surface(depth, angle, lift = 0) { return canal.PointAt(depth, angle, -lift).clone(); }
  const tray = Baked('Model_Tray'); scene.add(tray); tray.position.set(0,-6,-11);tray.scale.set(1.5,1,1.5);tray.receiveShadow=true;
  const tabletop=new THREE.Mesh(new THREE.BoxGeometry(32,.35,22),new THREE.MeshPhysicalMaterial({color:0x3f494d,roughness:.46,metalness:.55,clearcoat:.2}));tabletop.position.set(0,-6.23,-11);tabletop.receiveShadow=true;scene.add(tabletop);
  const trayCamera = new THREE.Vector3(0,5,-30), trayFocus = new THREE.Vector3(0,-4,-10);
  const FlatRotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(0,1,0));
  const Smooth = t => { t=Clamp(t); return t*t*(3-2*t); };
  const tool = new THREE.Group(); scene.add(tool); tool.visible = false;
  const toolParts = { scoop: new THREE.Group(), tweezers: new THREE.Group(), drops: new THREE.Group(), brush:new THREE.Group(), suction:new THREE.Group() };
  for (const [id, names] of Object.entries({ scoop: ['Model_ScoopShaft','Model_ScoopHead'], tweezers: ['Model_ForcepsJawLeft','Model_ForcepsJawRight','Model_ForcepsGrip'], drops: ['Model_DropperPipette','Model_DropperBulb'], brush:['Model_Brush','Model_BrushGrip'], suction:['Model_Suction'] })) {
    for (const name of names) {
      const part=Baked(name);part.castShadow=true;for(const m of (Array.isArray(part.material)?part.material:[part.material]))m.clippingPlanes=[toolClip];toolParts[id].add(part);
    }
    tool.add(toolParts[id]);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.95, .026, 8, 64), new THREE.MeshBasicMaterial({ color: P.white, transparent: true, opacity: .75 }));
  scene.add(ring); ring.quaternion.copy(camera.quaternion); ring.visible = false;
  const threadGroup = new THREE.Group(); scene.add(threadGroup);
  const droplet = new THREE.Mesh(new THREE.SphereGeometry(.16, 16, 12), new THREE.MeshPhysicalMaterial({ color: P.water, roughness: .12, clearcoat: 1 }));
  scene.add(droplet); droplet.visible = false;
  let dropAge = 1, dropTarget = null;
  const threads = Array.from({ length: 3 }, () => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(.035, .07, 1, 7), new THREE.MeshStandardMaterial({ color: P.waxGlow, roughness: .2 }));
    threadGroup.add(m); m.visible = false; return m;
  });

  function CameraFrame(dt) {
    entrance = Clamp(entrance + (inside ? dt : -dt) / 1.7);
    const t = Smooth(entrance);
    camera.position.lerpVectors(outsidePosition, insidePosition, t);
    const look = new THREE.Vector3(-2,1,0).lerp(focus,t);
    const transferBlend = showcase ? 1 : transfer && transfer.mode!=='suction' ? Smooth(transfer.age/.9) * (chunks.filter(c=>!['fractured','collected'].includes(c.state)).length===1?1:1-Smooth((transfer.age-2.55)/.85)) : 0;
    camera.position.lerp(trayCamera,transferBlend); look.lerp(trayFocus,transferBlend);
    camera.lookAt(look);
    const narrow=width/height<.85;
    camera.fov = ((narrow?65:45)*(1-t)+(narrow?THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(.55)/camera.aspect)):66)*t)*(1-transferBlend)+ (narrow?63:48)*transferBlend;
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    right.setFromMatrixColumn(camera.matrixWorld,0);up.setFromMatrixColumn(camera.matrixWorld,1);toward.setFromMatrixColumn(camera.matrixWorld,2);
    toolClip.setFromNormalAndCoplanarPoint(toward.clone().negate(),camera.position.clone().addScaledVector(toward,-2.5));
    workingPlane.setFromNormalAndCoplanarPoint(toward, focus);
    outer.visible=entrance<.94&&transferBlend<.2;canalGroup.visible=transferBlend<.66;
    scene.background=transferBlend>.5?customerBackdrop:new THREE.Color('#211c1b');
    scene.backgroundIntensity=.8;scene.backgroundBlurriness=0;
    scene.environmentIntensity=transferBlend>.4?.45:lampOn?.22:.018;
    for(const c of chunks)c.mesh.visible=(transferBlend<.66||['carrying','dropping','collected'].includes(c.state))&&c.state!=='fractured'&&!(c.toolId==='suction'&&c.state==='collected');
    lamp.position.copy(camera.position).addScaledVector(right,.6).addScaledVector(up,.4);
    lamp.target.position.copy(look);
    if(t>.9&&transferBlend<.05&&aimed){ray.setFromCamera(aim,camera);const hit=ray.intersectObject(wall)[0];lamp.target.position.copy(hit?.point||ray.ray.at(14,new THREE.Vector3()));}
    lamp.angle=.48+(1-t+transferBlend)*.6;lamp.penumbra=.55;
    lamp.intensity=(lampOn?115:0)*t*(1-transferBlend)+transferBlend*190;
    ambient.intensity=.7*(1-t)+(lampOn?.24:.045)*t+transferBlend*.4;key.intensity=1.8*(1-t)+transferBlend*1.4;
    tray.visible=tabletop.visible=transferBlend>.2||showcase;
    ring.quaternion.copy(camera.quaternion);
  }
  function Resize() {
    const size=core.size; width=size.width;height=size.height;camera.aspect=width/height;
  }

  function BuildChunk(rng, id, depth, angle, type) {
    const size = .75 + rng() * .12;
    const prototype = Baked(type === 'dry' ? 'Model_WaxDry' : type === 'wet' ? 'Model_WaxWet' : 'Model_WaxFirm');
    const geo = prototype.geometry; const p = geo.attributes.position; const seed=rng()*6;
    geo.scale(size, size, size);
    // Blender 原型尖端平面为 XY，背面沿局部 +Z 进入内壁，正面朝向内法线。
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
      const variation=1+.075*Math.sin(x*4+y*2+seed)+.035*Math.sin(y*11+seed*2);
      p.setXYZ(i,x*variation,y*(1+.08*Math.sin(seed)),z+.22);
    }
    geo.computeVertexNormals();
    prototype.material=materials.Wax(type);
    const mesh = new THREE.Mesh(geo, prototype.material);mesh.castShadow=true;mesh.receiveShadow=true;
    const normal = canal.NormalAt(depth, angle).clone().normalize();
    const tangent = canal.TangentAt(depth).clone().normalize();
    const xAxis = tangent.clone().cross(normal).normalize();
    const yAxis = normal.clone().cross(xAxis).normalize();
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, normal));
    const surfaceRay=new THREE.Raycaster(canal.CenterAt(depth).clone(),normal.clone().negate(),0,10);
    const surfaceHit=surfaceRay.intersectObject(wall)[0];
    mesh.position.copy(surfaceHit?surfaceHit.point.clone().addScaledVector(normal,.01):Surface(depth,angle,.018));
    root.add(mesh);
    const mark = new THREE.Mesh(new THREE.CircleGeometry(size * .99, 40), new THREE.MeshBasicMaterial({ color: P.skinSheen, transparent: true, opacity: 0, depthWrite: false }));
    mark.visible=false;
    mark.position.copy(Surface(depth, angle, .03)); mark.quaternion.copy(mesh.quaternion); root.add(mark);
    const chunk = { id, type, depth, angle, size, state: 'attached', progress: 0, softened: 0, mesh, mark,
      mass:1,fragment:false,wetting:0,stress:0,irritation:0,tear:0,origin: mesh.position.clone(), rotation: mesh.quaternion.clone(), original: p.array.slice(), normal, seed, slot: -1, fly: 0, held: 0 };
    chunk.body=CreatePeelBody({position:chunk.origin.toArray(),rotation:chunk.rotation.toArray(),normal:normal.toArray(),size,type});
    mesh.userData.chunk = chunk;
    return chunk;
  }
  function Reset(seed) {
    for (const c of chunks) { root.remove(c.mesh, c.mark); c.mesh.geometry.dispose(); c.mesh.material.dispose(); c.mark.geometry.dispose(); c.mark.material.dispose(); }
    transfer=null;showcase=false;contact.Reset();
    const rng = MakeRng(seed);
    chunks = Array.from({ length: 9 }, (_, i) => {
      const front = i < 6; const angle = front ? .22 + i * Math.PI / 3 : .70 + (i-6)*Math.PI*2/3;
      const type = i === 4 ? 'impacted' : (i + seed) % 3 === 0 ? 'wet' : 'dry';
      return BuildChunk(rng, i, (front ? 4.1 : 7.6) + (rng()-.5)*.15, angle, type);
    });
    HideTool(); droplet.visible = false; dropTarget = null; return chunks;
  }
  function VisualCenter(c) { return new THREE.Vector3(0,0,c.fragment?0:.22).applyQuaternion(c.mesh.quaternion).add(c.mesh.position); }
  function Project(position) {
    const v = position.clone().project(camera);
    return { x: (v.x + 1) * .5 * width, y: (1 - v.y) * .5 * height, z: v.z };
  }
  function Pick(x, y) {
    scene.updateMatrixWorld(true);
    ray.setFromCamera(new THREE.Vector2(x / width * 2 - 1, 1 - y / height * 2), camera);
    const hit = ray.intersectObjects(chunks.filter(c => c.state === 'attached').map(c => c.mesh))[0];
    const obstruction = ray.intersectObject(wall)[0];
    if (hit && (!obstruction || hit.distance < obstruction.distance + .035)) return hit.object.userData.chunk;
    // 小屏边缘容差只扩到最近的一块，不能把空白长按解释成远处接触。
    let nearest = null, distance = Math.min(30, width * .075);
    for (const c of chunks.filter(c => c.state === 'attached')) {
      const p = Project(VisualCenter(c));
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < distance) {
        ray.setFromCamera(new THREE.Vector2(p.x/width*2-1,1-p.y/height*2),camera);
        const piece=ray.intersectObject(c.mesh)[0],skin=ray.intersectObject(wall)[0];
        if(piece && (!skin || piece.distance<skin.distance+.035)){nearest = c; distance = d;}
      }
    }
    return nearest;
  }
  function SyncBody(c) {
    c.mesh.position.fromArray(c.body.position); c.mesh.quaternion.fromArray(c.body.rotation);
    c.progress=1-c.body.anchors.filter(a=>a.alive).length/5;
  }
  function Grip(c,x,y,id) {
    scene.updateMatrixWorld(true);
    ray.setFromCamera(new THREE.Vector2(x/width*2-1,1-y/height*2),camera);
    const hit=ray.intersectObject(c.mesh)[0];
    let point=hit?.point.clone()||c.mesh.position.clone().addScaledVector(c.normal,.35);
    if(id==='scoop') {
      const local=c.mesh.worldToLocal(point.clone());local.z=0;
      if(local.length()<.12)local.set(0,-1,0);
      local.normalize().multiplyScalar(c.size*.7);local.z=.10;
      point=c.mesh.localToWorld(local);
    }
    if(id==='tweezers')point.addScaledVector(c.normal,-.16);
    GripPeelBody(c.body,point.toArray());c.toolId=id;
    c.gripStart=point.clone();c.holdRotation=null;
    c.inputPlane=new THREE.Plane().setFromNormalAndCoplanarPoint(toward,point);
    c.inputStart=ray.ray.intersectPlane(c.inputPlane,new THREE.Vector3())||point.clone();
    ShowTool(c,id);
  }
  function Drag(c,x,y,dt,efficiency) {
    ray.setFromCamera(new THREE.Vector2(x/width*2-1,1-y/height*2),camera);
    const point=ray.ray.intersectPlane(c.inputPlane,new THREE.Vector3())||c.inputStart;
    const offset=point.sub(c.inputStart).clampLength(0,2.2);
    if(c.toolId==='brush')offset.addScaledVector(c.normal,-offset.dot(c.normal));
    const target=c.gripStart.clone().add(offset);
    if(c.toolId==='suction'&&c.fragment&&c.softened>.45)target.addScaledVector(c.normal,.85);

    const pose=ToolAt(target,c.toolId,c);target.copy(pose.position);
    if(c.body.detached&&!c.holdRotation)c.holdRotation=['scoop','brush'].includes(c.toolId)?FlatRotation.toArray():c.body.rotation.slice();
    const anchors=c.body.anchors.filter(a=>a.alive).length;
    const hard=c.type==='impacted'&&!c.fragment;
    const adhesion=c.fragment?.16:hard?1+18*(1-c.softened)**3:1;
    const brittle=c.toolId==='tweezers'&&c.type==='dry'&&!c.fragment&&c.softened<.6;
    const minAnchors=brittle?3:(c.toolId==='scoop'&&c.type!=='dry'&&!c.fragment)?2:0;
    const supported=c.toolId==='brush'?c.fragment:c.toolId==='suction'?c.fragment&&c.softened>.45:true;
    const result=StepPeelBody(c.body,{target:target.toArray(),softness:c.softened,efficiency:efficiency*(supported?1:.03),adhesion,minAnchors:supported?minAnchors:5,supportRotation:c.holdRotation},dt);
    result.needsForceps=c.toolId==='scoop'&&minAnchors>0&&result.remaining===2;
    result.wrongTool=!supported;
    const risky=!c.fragment&&((c.toolId==='tweezers'&&c.type==='dry'&&c.softened<.6)||(hard&&c.softened<.6));
    c.stress=risky&&result.force>25?c.stress+dt*(result.force/80):Math.max(0,c.stress-dt*.2);
    c.tear=Clamp(c.stress/(hard?.95:.55));result.fracture=c.tear>=1;
    result.pain=(result.force>42&&result.remaining>0&&(hard&&c.softened<.6||result.contact))?Clamp(result.force/100):0;

    result.contact=result.contact||pose.contact;
    if(result.pain>0&&c.softened<.6)c.irritation=Clamp(c.irritation+dt*result.pain*.8);
    if(result.remaining<anchors&&c.softened<.6)c.irritation=Clamp(c.irritation+.075*(1-c.softened));
    // 拿起后也不能穿过对侧管壁。中心点始终限制在真实管腔的安全半径内。
    const pos=new THREE.Vector3().fromArray(c.body.position), projected=canal.Project(pos);
    if(projected.depth>0 && projected.depth<canal.length) {
      const center=canal.CenterAt(projected.depth).clone();
      const radial=pos.clone().sub(center), limit=canal.RadiusAt(projected.depth,projected.angle)-c.size*.7;
      if(radial.length()>limit && c.body.detached) {
        c.body.position=center.add(radial.setLength(limit)).toArray();
        c.body.velocity=[0,0,0];result.contact=true;
      }
    }
    SyncBody(c);Deform(c);
    ShowTool(c,c.toolId);
    Threads(c);
    return result;
  }
  function Deform(c) {
    if(c.fragment)return;
    const p=c.mesh.geometry.attributes.position,rotation=c.mesh.quaternion.clone().invert();
    const grip=c.body.grip?new THREE.Vector3().fromArray(c.body.grip):null;
    const anchors=c.body.anchors.filter(a=>a.alive);
    for(let i=0;i<p.count;i++){
      const v=new THREE.Vector3(c.original[i*3],c.original[i*3+1],c.original[i*3+2]),delta=new THREE.Vector3();let weight=0;
      for(const a of anchors){
        const local=new THREE.Vector3().fromArray(a.local),w=Math.exp(-((v.x-local.x)**2+(v.y-local.y)**2)/(c.size*c.size*.24));
        const current=local.clone().applyQuaternion(c.mesh.quaternion).add(c.mesh.position);
        delta.addScaledVector(new THREE.Vector3().fromArray(a.rest).sub(current).applyQuaternion(rotation),w);weight+=w;
      }
      if(weight>0){
        const away=grip?Clamp(v.distanceTo(grip)/(c.size*.65)):1;
        delta.divideScalar(weight).clampLength(0,c.type==='wet'?.38:.18).multiplyScalar(away*.72);
        v.add(delta);
      }
      if(c.tear>.15){const band=v.x+.28*v.y,sign=Math.sign(band);const strain=c.tear*c.tear;v.x+=sign*strain*.13*Math.min(1,Math.abs(band)*3);v.z+=Math.sin(v.y*4+c.seed)*strain*.11;}
      p.setXYZ(i,v.x,v.y,v.z);
    }
    p.needsUpdate=true;c.mesh.geometry.computeVertexNormals();
  }
  function Fracture(c){
    const pieces=FractureGeometry(c.mesh.geometry);c.state='fractured';c.mesh.visible=false;Ungrip(c);
    const result=pieces.map((geometry,i)=>{
      const centroid=geometry.boundingBox.getCenter(new THREE.Vector3());geometry.translate(-centroid.x,-centroid.y,-centroid.z);
      const mesh=new THREE.Mesh(geometry,c.mesh.material.clone());mesh.position.copy(centroid.clone().applyQuaternion(c.mesh.quaternion).add(c.mesh.position));mesh.quaternion.copy(c.mesh.quaternion);
      const start=mesh.position.clone();
      const spread=centroid.clone().multiplyScalar(1.8).applyQuaternion(c.rotation);
      const destination=c.origin.clone().add(spread).addScaledVector(c.normal,.10);
      const projected=canal.Project(destination),normal=canal.NormalAt(projected.depth,projected.angle).clone();
      const seatRay=new THREE.Raycaster(canal.CenterAt(projected.depth).clone(),normal.clone().negate(),0,10),seat=seatRay.intersectObject(wall)[0];
      if(seat)destination.copy(seat.point).addScaledVector(normal,-geometry.boundingBox.min.z+.035);
      mesh.position.copy(destination);
      mesh.quaternion.setFromUnitVectors(c.normal,normal).multiply(c.rotation).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),(i-1)*.14));
      const vertices=geometry.attributes.position;
      for(let pass=0;pass<4;pass++){let penetration=0;for(let j=0;j<vertices.count;j+=3){const p=new THREE.Vector3().fromBufferAttribute(vertices,j).applyQuaternion(mesh.quaternion).add(mesh.position);penetration=Math.max(penetration,.02-contact.Surface(p).clearance);}if(penetration<=0)break;mesh.position.addScaledVector(normal,penetration);}
      mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);
      const fragment={...c,id:String(c.id)+'.'+i,state:'settling',settleFrom:start,settleAge:0,settleVelocity:c.normal.clone().multiplyScalar(.5).add(spread.clone().multiplyScalar(1.6)),tear:0,mesh,mark:c.mark.clone(),size:c.size*.6,origin:mesh.position.clone(),rotation:mesh.quaternion.clone(),original:geometry.attributes.position.array.slice(),body:null,normal,depth:projected.depth,angle:projected.angle,fragment:true,mass:c.mass/pieces.length,stress:0,progress:0,slot:-1};
      fragment.body=CreatePeelBody({position:fragment.origin.toArray(),rotation:fragment.rotation.toArray(),normal:normal.toArray(),size:fragment.size,type:c.type});mesh.userData.chunk=fragment;chunks.push(fragment);return fragment;
    });
    result.forEach((fragment,i)=>{fragment.mesh.position.copy(fragment.settleFrom);fragment.tearRotation=c.mesh.quaternion.clone();fragment.settleRotation=fragment.rotation.clone();});
    c.tearPieces=result;c.tearAge=0;tearTransfer={pieces:result,age:0,color:c.mesh.material.color.clone()};
    HideTool();return result;
  }
  function StyleTool(group,id,level,skin){
    const edition=level<2?'Basic':level<4?'Refined':'Master';
    for(const part of group.children){
      part.userData.originalName??=part.name;
      const source=asset.scene.getObjectByName(part.userData.originalName+'_'+edition);
      if(source){const variant=Baked(source.name);part.geometry.dispose();for(const m of (Array.isArray(part.material)?part.material:[part.material]))m.dispose();part.geometry=variant.geometry;part.material=variant.material;}
      for(const m of (Array.isArray(part.material)?part.material:[part.material])){
        materials.GripMaterial(m,skin,level);if(/ToolGlass/.test(m.name)){m.transparent=true;m.opacity=.33;m.depthWrite=false;m.roughness=.07;m.clearcoat=1;m.ior=1.47;}m.clippingPlanes=[toolClip];m.roughness=Math.max(.12,m.roughness-(level%2===1&&level>1?.08:0));
        if(/ToolHandle/.test(m.name)&&['walnut','jade'].includes(skin)){m.color.set(skin==='walnut'?0x66452c:0xd1ded3);m.metalness=0;m.roughness=skin==='jade'?.22:.47;}
      }
    }
  }
  function SetSkins(equipped,levels={}){
    for(const [id,group] of Object.entries(toolParts))if(toolSkins[id]!==equipped[id]||toolLevels[id]!==levels[id])StyleTool(group,id,levels[id]||1,equipped[id]||'classic');
    toolSkins={...equipped};toolLevels={...levels};contact.Reset();
  }
  function CreateToolPreview(canvas,id,level,next,skin){
    const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});renderer.setPixelRatio(Math.min(2,devicePixelRatio));renderer.setSize(canvas.clientWidth||500,canvas.clientHeight||300,false);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
    const stage=new THREE.Scene(),cam=new THREE.PerspectiveCamera(34,(canvas.clientWidth||500)/(canvas.clientHeight||300),.1,150);cam.position.set(1,10,38);cam.lookAt(0,10,0);
    stage.environment=scene.environment;stage.add(new THREE.HemisphereLight(0xffffff,0x504a40,2.2));
    for(const [x,z,intensity] of [[-8,12,4],[10,-5,3]]){const light=new THREE.DirectionalLight(0xffffff,intensity);light.position.set(x,18,z);stage.add(light);}
    const models=[level,next].map((n,i)=>{const group=toolParts[id].clone(true);group.visible=true;group.children.forEach(p=>{p.geometry=p.geometry.clone();p.material=Array.isArray(p.material)?p.material.map(m=>m.clone()):p.material.clone();p.rotation.set(0,0,0);});StyleTool(group,id,n,skin);group.children.forEach(p=>{for(const m of (Array.isArray(p.material)?p.material:[p.material]))m.clippingPlanes=[];p.position.set(0,0,0);});group.position.x=i?4:-4;group.rotation.x=.12;group.rotation.y=-.35;stage.add(group);return group;});
    const render=()=>{renderer.render(stage,cam);previewTriangles=renderer.info.render.triangles;};render();let px=null;
    canvas.onpointerdown=e=>{px=e.clientX;canvas.setPointerCapture(e.pointerId);};canvas.onpointermove=e=>{if(px==null)return;models.forEach(m=>m.rotation.y+=(e.clientX-px)*.015);px=e.clientX;render();};canvas.onpointerup=canvas.onpointercancel=()=>px=null;
    return{SetView(mode){const y=mode==='tip'?.65:mode==='grip'?(id==='drops'?6.2:16.7):id==='drops'?4.5:10;const z=mode==='full'?(id==='drops'?21:38):7;models.forEach((m,i)=>m.position.x=(i?1:-1)*(mode==='full'?4:1.25));cam.position.set(1,y+(mode==='tip'?1:0),z);cam.lookAt(0,y,0);render();},Dispose(){previewTriangles=0;renderer.dispose();renderer.forceContextLoss();models.forEach(g=>g.traverse(p=>{p.geometry?.dispose();if(p.material)for(const m of (Array.isArray(p.material)?p.material:[p.material]))m.dispose();}));}};
  }
  function Threads(c) {
    const alive=c.body.anchors.filter(a=>a.alive);
    threads.forEach((thread,i)=>{
      const anchor=alive[i];thread.visible=!!anchor&&(c.type==='wet'&&c.body.strain>.12||c.tear>.35);thread.material.color.copy(c.mesh.material.color);
      if(!thread.visible)return;
      const start=new THREE.Vector3().fromArray(anchor.rest);
      const end=new THREE.Vector3().fromArray(anchor.local).applyQuaternion(c.mesh.quaternion).add(c.mesh.position);
      const delta=end.clone().sub(start);
      thread.position.copy(start).add(end).multiplyScalar(.5);
      thread.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize());
      const thickness=c.type==='wet'?.5:Math.max(.05,(1-c.tear)*.25);thread.scale.set(thickness,delta.length(),thickness);
    });
  }
  function Ungrip(c) { UngripPeelBody(c.body);threads.forEach(t=>t.visible=false); }
  function ToolAt(point,id,c=null,opening=0) {
    tool.visible=true;tool.position.copy(point);
    const shaftAxis=camera.position.clone().addScaledVector(right,1.15).addScaledVector(up,-1.7).sub(point).normalize();
    const faceNormal=c ? new THREE.Vector3(0,0,1).applyQuaternion(c.mesh.quaternion) : toward;
    const xAxis=shaftAxis.clone().cross(faceNormal).normalize();
    if(xAxis.lengthSq()<.1)xAxis.copy(right);
    const zAxis=xAxis.clone().cross(shaftAxis).normalize();
    tool.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis,shaftAxis,zAxis));
    for(const [key,group] of Object.entries(toolParts))group.visible=key===id;
    const jaws=toolParts.tweezers.children;
    // 两片弹性镊臂绕柄根张开，夹持时以块体的实际宽度为止点。
    jaws.slice(0,2).forEach((jaw,i)=>{
      const sign=i===0?-1:1;
      let gap=.66;
      if(c){
        // 从夹持中心向两侧量到真正的表面，镊尖停在表面，不能隔空夹住。
        c.mesh.updateMatrixWorld(true);
        const oldSide=c.mesh.material.side;c.mesh.material.side=THREE.DoubleSide;
        const gripRay=new THREE.Raycaster(point,xAxis.clone().multiplyScalar(sign),0,2);
        const contact=gripRay.intersectObject(c.mesh)[0];c.mesh.material.side=oldSide;
        gap=contact?contact.distance+.048:c.size*.38;
      }
      const angle=sign*(gap+opening-.08)/17;
      jaw.rotation.z=angle;
      jaw.position.set(Math.sin(angle)*17,17-Math.cos(angle)*17,0);
    });
    if(lastToolId!==id){contact.Reset();lastToolId=id;}
    const samples=contact.Samples(toolParts[id]);
    const pose=contact.Solve(point,tool.quaternion,samples,{sweep:!transfer});tool.position.copy(pose.position);tool.quaternion.copy(pose.rotation);
    lastToolPoint=tool.position.clone();return pose;
  }
  function ShowTool(c,id,progress=0,screen=null) {
    let point;
    if(c.body?.grip)point=new THREE.Vector3().fromArray(GetGripPoint(c.body));
    else if(screen) {
      ray.setFromCamera(new THREE.Vector2(screen.x/width*2-1,1-screen.y/height*2),camera);
      const surface=ray.intersectObject(wall)[0];
      point=surface?.point.clone().addScaledVector(c.normal,.1)||c.mesh.position.clone();
    } else point=c.mesh.position.clone().addScaledVector(c.normal,.35);
    ToolAt(point,id,c.body?.grip?c:null);
    tool.visible=entrance>.94&&!transfer&&!showcase;
  }
  function Hover(x,y,id) {
    if(!inside || entrance<1 || transfer || showcase)return;
    const hit=Pick(x,y);
    if(hit)ShowTool(hit,id,0,{x,y});else {
      ray.setFromCamera(new THREE.Vector2(x/width*2-1,1-y/height*2),camera);
      const surface=ray.intersectObject(wall)[0];
      if(surface&&canal.Project(surface.point).depth<10)ShowTool({origin:surface.point,mesh:{position:surface.point},normal:surface.face.normal.clone().transformDirection(wall.matrixWorld)},id,0,{x,y});
      else HideTool();
    }
  }
  function HideTool() { tool.visible = ring.visible = false; threads.forEach(t => { t.visible = false; }); }
  function TrayPosition(c) {
    return tray.position.clone().add(new THREE.Vector3((c.slot%5-2)*1.75,.045+(c.bottomOffset||0)+Math.floor(c.slot/15)*.28,Math.floor(c.slot/5)%3*1.55-1.55));
  }
  function Release(c,slot) {
    c.state='carrying';c.slot=slot;c.mesh.geometry.computeBoundingBox();c.bottomOffset=-c.mesh.geometry.boundingBox.min.z;
    if(c.toolId==='suction'){
      c.suctionStart=c.mesh.position.clone();c.suctionRotation=tool.quaternion.clone();
      c.nozzle=lastToolPoint.clone().addScaledVector(c.normal,.6);
      c.suctionAxis=new THREE.Vector3(0,1,0).applyQuaternion(c.suctionRotation);
      const clip=new THREE.Plane().setFromNormalAndCoplanarPoint(c.suctionAxis.clone().negate(),c.nozzle.clone().addScaledVector(c.suctionAxis,.22));
      c.mesh.material.clippingPlanes=[clip];
      transfer={chunk:c,age:0,mode:'suction'};Ungrip(c);return;
    }
    const start=c.mesh.position.clone();
    const center=canal.CenterAt(c.depth).clone();
    const destination=TrayPosition(c).add(new THREE.Vector3(0,2.3,0));
    c.path=new THREE.CatmullRomCurve3([start,center,new THREE.Vector3(0,0,-2),new THREE.Vector3(0,-1,-7),destination],false,'centripetal');
    c.carryRotation=c.mesh.quaternion.clone();c.dropVelocity=0;c.bounces=0;
    transfer={chunk:c,age:0};threads.forEach(t=>t.visible=false);
  }
  function Update(dt) {
    Resize();
    if(transfer)transfer.age+=dt;
    CameraFrame(dt);
    if(dropTarget&&dropAge<.45) {
      dropAge+=dt;const t=Clamp(dropAge/.45);
      droplet.position.copy(droplet.userData.start||dropTarget).lerp(dropTarget,t).addScaledVector(up,Math.sin(t*Math.PI)*.1);
      droplet.scale.set(1,1+(1-t)*.55,1);droplet.visible=t<1;
    }
    const landed=[];materials.Update(chunks,lamp);
    for(const c of chunks) {
      if(c.wetting>c.softened)c.softened=Math.min(c.wetting,c.softened+dt*.32);
      c.mesh.material.roughness=(c.type==='wet'?.65:1)*(1-c.softened*.81);c.mesh.material.clearcoat=Math.max(c.type==='wet'?.2:0,c.softened*.95);c.mesh.material.clearcoatRoughness=.10;
      c.irritation=Math.max(0,(c.irritation||0)-dt*.004);
      if(c.state==='settling'){
        c.settleAge+=dt;const t=Clamp(c.settleAge/.55);
        const pull=1-Math.exp(-c.settleAge*9);
        const spring=c.origin.clone().sub(c.mesh.position).multiplyScalar(110).addScaledVector(c.settleVelocity,-15);c.settleVelocity.addScaledVector(spring,dt);c.mesh.position.addScaledVector(c.settleVelocity,dt);
        const separation=c.mesh.position.clone().sub(c.origin).dot(c.normal);if(separation<-.025){c.mesh.position.addScaledVector(c.normal,-separation);c.settleVelocity.addScaledVector(c.normal,-c.settleVelocity.dot(c.normal)*1.22);}
        c.mesh.quaternion.copy(c.tearRotation).slerp(c.settleRotation,pull);
        if(t>=1){c.mesh.position.copy(c.origin);c.mesh.quaternion.copy(c.rotation);c.state='attached';}
      }
      if(c.state==='returning') {
        StepPeelBody(c.body,{softness:c.softened},dt);SyncBody(c);Deform(c);
        if(Math.hypot(...c.body.velocity)<.02&&Math.hypot(...c.body.spin)<.04) c.state='attached';
      }
    }
    if(tearTransfer){
      tearTransfer.age+=dt;const t=tearTransfer.age;
      threads.forEach((thread,i)=>{const a=tearTransfer.pieces[i%tearTransfer.pieces.length],b=tearTransfer.pieces[(i+1)%tearTransfer.pieces.length];const start=a.mesh.position.clone(),end=b.mesh.position.clone();const delta=end.clone().sub(start);thread.visible=t<.3+i*.055;thread.material.color.copy(tearTransfer.color);thread.position.copy(start).add(end).multiplyScalar(.5);thread.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize());thread.scale.set(Math.max(.015,.27*(1-t/.47)),delta.length(),Math.max(.015,.27*(1-t/.47)));});
      if(t>.47){threads.forEach(t=>t.visible=false);tearTransfer=null;}
    }
    if(transfer) {
      const c=transfer.chunk,age=transfer.age;
      if(transfer.mode==='suction'){
        ToolAt(c.nozzle,'suction');
        const t=Smooth(age/.85);
        c.mesh.position.copy(c.suctionStart).lerp(c.nozzle.clone().addScaledVector(c.suctionAxis,1.4),t);
        c.mesh.quaternion.copy(c.rotation).slerp(c.suctionRotation,t*.5);
        if(age>=.85){c.state='collected';c.mesh.visible=false;landed.push(c);transfer=null;HideTool();}
        return landed;
      }
      if(age<1.5) {
        const t=Smooth(age/1.5);
        c.mesh.position.copy(c.path.getPoint(t));
        c.mesh.quaternion.copy(c.carryRotation).slerp(FlatRotation,Smooth((t-.3)/.7));
        c.body.position=c.mesh.position.toArray();c.body.rotation=c.mesh.quaternion.toArray();
        ToolAt(new THREE.Vector3().fromArray(GetGripPoint(c.body)),c.toolId,c);
      } else {
        if(c.state==='carrying') {c.state='dropping';Ungrip(c);}
        const floor=TrayPosition(c).y;
        if(c.state==='dropping') {
          c.dropVelocity-=36*dt;c.mesh.position.y+=c.dropVelocity*dt;
          if(c.mesh.position.y<=floor) {
            c.mesh.position.y=floor;c.dropVelocity=Math.abs(c.dropVelocity)*.22;c.bounces++;
            if(c.bounces===1)landed.push(c);
            if(c.bounces>2||c.dropVelocity<.18)c.state='collected';
          }
        }
        const away=Smooth((age-1.5)/.65);
        ToolAt(c.path.getPoint(1).add(new THREE.Vector3(away*2,away*2,-away*3)),c.toolId,c,away*.5);
        if(c.toolId==='scoop')tool.rotateY(away*.65);
        tool.visible=age<2.3;
      }
      if(age>=3.4) { c.state='collected';c.mesh.position.copy(TrayPosition(c));transfer=null;HideTool(); }
    }
    return landed;
  }
  function AuditTool(){
    tool.updateMatrixWorld(true);wall.updateMatrixWorld(true);let fieldMinimum=Infinity,meshMinimum=Infinity;const closest=[];
    if(!tool.visible)return{visible:false};
    for(const part of toolParts[lastToolId].children){const p=part.geometry.attributes.position;for(let i=0;i<p.count;i++){const world=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(part.matrixWorld),hit=contact.Surface(world);if(hit.depth<0)continue;fieldMinimum=Math.min(fieldMinimum,hit.clearance);closest.push({world,clearance:hit.clearance});}}
    closest.sort((a,b)=>a.clearance-b.clearance);
    for(const {world} of closest.slice(0,24)){const projected=canal.Project(world),center=canal.CenterAt(projected.depth).clone(),dir=world.clone().sub(center),distance=dir.length();const hit=new THREE.Raycaster(center,dir.normalize(),0,10).intersectObject(wall)[0];if(hit)meshMinimum=Math.min(meshMinimum,hit.distance-distance);}
    return {visible:true,id:lastToolId,vertices:closest.length,fieldMinimum,meshMinimum};
  }
  function Targets() { return chunks.map(c=>({id:c.id,type:c.type,mass:c.mass,fragment:c.fragment,wetting:c.wetting,state:c.state,progress:c.progress,softened:c.softened,vertices:c.mesh.geometry.attributes.position.count,triangles:c.mesh.geometry.index.count/3,position:c.mesh.position.toArray(),rotation:c.mesh.quaternion.toArray(),scale:c.mesh.scale.toArray(),screen:Project(VisualCenter(c)),sweepScreen:Project(VisualCenter(c).add(new THREE.Vector3(1.8,0,0).applyQuaternion(c.rotation))),pullScreen:Project(VisualCenter(c).addScaledVector(c.normal,1.8)),physics:{anchors:c.body.anchors.filter(a=>a.alive).length,detached:c.body.detached,strain:c.body.strain,force:c.body.force,contact:c.body.contact,grip:c.body.grip?.slice()||null}})); }
  return {canal,Reset,Pick,Grip,Drag,Fracture,SetSkins,CreateToolPreview,Ungrip,ShowTool,HideTool,Release,Update,Targets,Project,Resize,
    AuditTool,CollisionProbe(){return contact.Probe();},
    RenderingProbe(){return {...materials.Probe(),lampOn,lampAim:lamp.target.position.toArray(),lampIntensity:lamp.intensity,shadows:core.renderer.shadowMap.enabled,canalVisible:canalGroup.visible,externalContext:scene.background===customerBackdrop,outerVisible:outer.visible,irritation:chunks.filter(c=>!c.fragment).map(c=>c.irritation),roughness:chunks.map(c=>c.mesh.material.roughness),clearcoat:chunks.map(c=>c.mesh.material.clearcoat),toolLevels:{...toolLevels},previewTriangles};},
    ToggleLamp(){lampOn=!lampOn;return lampOn;},AimLamp(x,y){aim.set(x/width*2-1,1-y/height*2);aimed=true;},
    Enter(){inside=true;entrance=0;showcase=false;},Hover,
    ToggleView(){if(transfer)return 'canal';showcase=false;inside=!inside;HideTool();return inside?'canal':'ear';},
    Showcase(){showcase=true;HideTool();},
    get ready(){return entrance>=1&&!transfer&&!showcase;},
    get busy(){return !!transfer;},
    get transfer(){return transfer?{id:transfer.chunk.id,age:transfer.age,mode:transfer.mode||'carry',toolVisible:tool.visible}:null;},
    Drop(c){ShowTool(c,'drops');dropTarget=c.mesh.position.clone().addScaledVector(c.normal,.18);dropAge=0;droplet.visible=true;droplet.userData.start=lastToolPoint.clone();},
    get chunks(){return chunks;},
    modelInfo:{source:'BlenderMCP',file:'Models/Model_ImmersiveEar.glb',edition:'TactilePbr',nodes:asset.scene.children.map(n=>n.name)},
    Dispose(){anatomy.dispose();root.traverse(n=>{n.geometry?.dispose();});}};
}
