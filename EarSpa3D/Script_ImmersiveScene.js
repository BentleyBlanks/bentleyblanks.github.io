import * as THREE from 'three';
import { BuildEar, MakeRng } from './Script_EarAnatomy.js?v=ear007-20260911';
import { GLTFLoader } from './vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { PALETTE as P } from './Data_Palette.mjs?v=ear007-20260911';

import { CreatePeelBody, GripPeelBody, UngripPeelBody, GetGripPoint, StepPeelBody } from './Script_PeelPhysics.mjs?v=ear007-20260911';
const Clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

// 封闭耳道、真实接触点与实体收集盘共用毫米世界；镜头在取出时连续后退。
export async function CreateImmersiveScene({ core }) {
  const asset = await new GLTFLoader().loadAsync(new URL('./Models/Model_ImmersiveEar.glb?v=ear007-20260911', import.meta.url).href);
  asset.scene.updateMatrixWorld(true);
  function Baked(name) {
    const source = asset.scene.getObjectByName(name);
    if (!source?.geometry) throw new Error('模型缺少节点：' + name);
    const mesh = new THREE.Mesh(source.geometry.clone().applyMatrix4(source.matrixWorld), source.material.clone());
    mesh.name = name; return mesh;
  }
  const { scene, camera } = core;
  core.renderer.localClippingEnabled = true;
  const toolClip = new THREE.Plane();
  const anatomy = BuildEar(null, { quality: 'low' });
  const canal = anatomy.canal;
  const root = new THREE.Group();
  scene.add(root);
  scene.background = new THREE.Color(P.creamDeep);
  const ambient = new THREE.HemisphereLight(P.cream, P.peachDeep, 1.0); scene.add(ambient);
  const key = new THREE.DirectionalLight(P.cream, 2.1); key.position.set(-15, 30, -40); scene.add(key);
  const lamp = new THREE.SpotLight(P.skinSheen,62,80,1.25,.8,2);scene.add(lamp,lamp.target);
  lamp.castShadow=true;lamp.shadow.mapSize.set(1024,1024);
  lamp.shadow.camera.near=.2;lamp.shadow.camera.far=45;lamp.shadow.bias=-.00005;lamp.shadow.normalBias=.018;
  lamp.shadow.intensity=.38;
  core.setExposure(.96);
  const outer = new THREE.Group(), canalGroup = new THREE.Group(); root.add(outer, canalGroup);
  for (const name of ['Model_OuterEar', 'Model_Temple', 'Model_Pillow']) outer.add(Baked(name));
  const wall = Baked('Model_Canal'); wall.material.side = THREE.DoubleSide; wall.receiveShadow=true; canalGroup.add(wall, Baked('Model_Eardrum'));
  const focus = canal.CenterAt(5.4).clone();
  const right = new THREE.Vector3(), up = new THREE.Vector3(), toward = new THREE.Vector3();
  const workingPlane = new THREE.Plane();
  const ray = new THREE.Raycaster();
  let width = 1, height = 1, chunks = [], inside = false, entrance = 0;
  let lastToolPoint = null, transfer = null, showcase = false;
  const outsidePosition = new THREE.Vector3(12, 4, -69);
  const insidePosition = new THREE.Vector3(-.25, .2, -1.8);
  camera.position.copy(outsidePosition); camera.up.set(0, 1, 0); camera.lookAt(-2, 1, 0); camera.updateMatrixWorld(true);
  function Surface(depth, angle, lift = 0) { return canal.PointAt(depth, angle, -lift).clone(); }
  const tray = Baked('Model_Tray'); scene.add(tray); tray.position.set(0,-6,-11);tray.receiveShadow=true;
  const trayCamera = new THREE.Vector3(0,3,-24), trayFocus = new THREE.Vector3(0,-4,-10);
  const FlatRotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(0,1,0));
  const Smooth = t => { t=Clamp(t); return t*t*(3-2*t); };
  const tool = new THREE.Group(); scene.add(tool); tool.visible = false;
  const toolParts = { scoop: new THREE.Group(), tweezers: new THREE.Group(), drops: new THREE.Group() };
  for (const [id, names] of Object.entries({ scoop: ['Model_ScoopShaft','Model_ScoopHead'], tweezers: ['Model_ForcepsJawLeft','Model_ForcepsJawRight','Model_ForcepsGrip'], drops: ['Model_DropperPipette','Model_DropperBulb'] })) {
    for (const name of names) {
      const part=Baked(name);part.castShadow=true;part.material.clippingPlanes=[toolClip];toolParts[id].add(part);
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
    const transferBlend = showcase ? 1 : transfer ? Smooth(transfer.age/.9) * (transfer.chunk.slot===8?1:1-Smooth((transfer.age-2.55)/.85)) : 0;
    camera.position.lerp(trayCamera,transferBlend); look.lerp(trayFocus,transferBlend);
    camera.lookAt(look);
    const narrow=width/height<.85;
    camera.fov = ((narrow?51:45)*(1-t)+(narrow?94:66)*t)*(1-transferBlend)+ (narrow?63:48)*transferBlend;
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    right.setFromMatrixColumn(camera.matrixWorld,0);up.setFromMatrixColumn(camera.matrixWorld,1);toward.setFromMatrixColumn(camera.matrixWorld,2);
    toolClip.setFromNormalAndCoplanarPoint(toward.clone().negate(),camera.position.clone().addScaledVector(toward,-2.5));
    workingPlane.setFromNormalAndCoplanarPoint(toward, focus);
    outer.visible = entrance < .94 || transferBlend>.5;
    lamp.position.copy(camera.position).addScaledVector(right,.6).addScaledVector(up,.4);
    lamp.target.position.copy(look);lamp.intensity = 62*t + transferBlend*240;
    ambient.intensity=1.0+t*.2; key.intensity=2.1-t*1.5+transferBlend*.8;
    tray.visible=true;
    ring.quaternion.copy(camera.quaternion);
  }
  function Resize() {
    const size=core.size; width=size.width;height=size.height;camera.aspect=width/height;
  }

  function BuildChunk(rng, id, depth, angle, type) {
    const size = .66 + rng() * .10;
    const prototype = Baked(type === 'dry' ? 'Model_WaxDry' : type === 'wet' ? 'Model_WaxWet' : 'Model_WaxFirm');
    const geo = prototype.geometry; const p = geo.attributes.position; const seed=rng()*6;
    geo.scale(size, size, size);
    // Blender 原型尖端平面为 XY，背面沿局部 +Z 进入内壁，正面朝向内法线。
    for(let i=0;i<p.count;i++) p.setZ(i,p.getZ(i)+.22);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, prototype.material);mesh.castShadow=true;mesh.receiveShadow=true;
    const normal = canal.NormalAt(depth, angle).clone().normalize();
    const tangent = canal.TangentAt(depth).clone().normalize();
    const xAxis = tangent.clone().cross(normal).normalize();
    const yAxis = normal.clone().cross(xAxis).normalize();
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, normal));
    mesh.position.copy(Surface(depth, angle, .018));
    root.add(mesh);
    const mark = new THREE.Mesh(new THREE.CircleGeometry(size * .99, 40), new THREE.MeshBasicMaterial({ color: P.skinSheen, transparent: true, opacity: 0, depthWrite: false }));
    mark.visible=false;
    mark.position.copy(Surface(depth, angle, .03)); mark.quaternion.copy(mesh.quaternion); root.add(mark);
    const chunk = { id, type, depth, angle, size, state: 'attached', progress: 0, softened: 0, mesh, mark,
      origin: mesh.position.clone(), rotation: mesh.quaternion.clone(), original: p.array.slice(), normal, seed, slot: -1, fly: 0, held: 0 };
    chunk.body=CreatePeelBody({position:chunk.origin.toArray(),rotation:chunk.rotation.toArray(),normal:normal.toArray(),size,type});
    mesh.userData.chunk = chunk;
    return chunk;
  }
  function Reset(seed) {
    for (const c of chunks) { root.remove(c.mesh, c.mark); c.mesh.geometry.dispose(); c.mesh.material.dispose(); c.mark.geometry.dispose(); c.mark.material.dispose(); }
    transfer=null;showcase=false;
    const rng = MakeRng(seed);
    chunks = Array.from({ length: 9 }, (_, i) => {
      const front = i < 6; const angle = front ? .22 + i * Math.PI / 3 : .70 + (i-6)*Math.PI*2/3;
      const type = i === 4 ? 'impacted' : (i + seed) % 3 === 0 ? 'wet' : 'dry';
      return BuildChunk(rng, i, (front ? 4.1 : 7.6) + (rng()-.5)*.15, angle, type);
    });
    HideTool(); droplet.visible = false; dropTarget = null; return chunks;
  }
  function VisualCenter(c) { return new THREE.Vector3(0,0,.22).applyQuaternion(c.mesh.quaternion).add(c.mesh.position); }
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
    const target=c.gripStart.clone().add(offset);
    if(c.body.detached&&!c.holdRotation)c.holdRotation=c.toolId==='scoop'?FlatRotation.toArray():c.body.rotation.slice();
    const result=StepPeelBody(c.body,{target:target.toArray(),softness:c.softened,efficiency,supportRotation:c.holdRotation},dt);
    // 拿起后也不能穿过对侧管壁。中心点始终限制在真实管腔的安全半径内。
    const pos=new THREE.Vector3().fromArray(c.body.position), projected=canal.Project(pos);
    if(projected.depth>0 && projected.depth<canal.Length) {
      const center=canal.CenterAt(projected.depth).clone();
      const radial=pos.clone().sub(center), limit=canal.RadiusAt(projected.depth,projected.angle)-c.size*.7;
      if(radial.length()>limit && c.body.detached) {
        c.body.position=center.add(radial.setLength(limit)).toArray();
        c.body.velocity=[0,0,0];result.contact=true;
      }
    }
    SyncBody(c);
    ShowTool(c,c.toolId);
    Threads(c);
    return result;
  }
  function Threads(c) {
    const alive=c.body.anchors.filter(a=>a.alive);
    threads.forEach((thread,i)=>{
      const anchor=alive[i];thread.visible=c.type==='wet'&&!!anchor&&c.body.strain>.12;
      if(!thread.visible)return;
      const start=new THREE.Vector3().fromArray(anchor.rest);
      const end=new THREE.Vector3().fromArray(anchor.local).applyQuaternion(c.mesh.quaternion).add(c.mesh.position);
      const delta=end.clone().sub(start);
      thread.position.copy(start).add(end).multiplyScalar(.5);
      thread.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize());
      thread.scale.set(.7,delta.length(),.7);
    });
  }
  function Ungrip(c) { UngripPeelBody(c.body);threads.forEach(t=>t.visible=false); }
  function ToolAt(point,id,c=null,opening=0) {
    tool.visible=true;tool.position.copy(point);
    const shaftAxis=camera.position.clone().addScaledVector(right,3.2).addScaledVector(up,-3.0).sub(point).normalize();
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
    lastToolPoint=point.clone();
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
      if(surface)ShowTool({origin:surface.point,mesh:{position:surface.point},normal:surface.face.normal.clone().transformDirection(wall.matrixWorld)},id,0,{x,y});
      else HideTool();
    }
  }
  function HideTool() { tool.visible = ring.visible = false; threads.forEach(t => { t.visible = false; }); }
  function TrayPosition(c) {
    return tray.position.clone().add(new THREE.Vector3((c.slot%5-2)*1.6,.08,Math.floor(c.slot/5)*1.6-.8));
  }
  function Release(c,slot) {
    c.state='carrying';c.slot=slot;
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
      droplet.position.copy(dropTarget).addScaledVector(up,(1-t)*1.4).addScaledVector(toward,.35);
      droplet.scale.set(1,1+(1-t)*.55,1);droplet.visible=t<1;
    }
    const landed=[];
    for(const c of chunks) {
      if(c.state==='returning') {
        StepPeelBody(c.body,{softness:c.softened},dt);SyncBody(c);
        if(Math.hypot(...c.body.velocity)<.02&&Math.hypot(...c.body.spin)<.04) c.state='attached';
      }
    }
    if(transfer) {
      const c=transfer.chunk,age=transfer.age;
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
  function Targets() { return chunks.map(c=>({id:c.id,type:c.type,state:c.state,progress:c.progress,softened:c.softened,vertices:c.mesh.geometry.attributes.position.count,triangles:c.mesh.geometry.index.count/3,position:c.mesh.position.toArray(),rotation:c.mesh.quaternion.toArray(),scale:c.mesh.scale.toArray(),screen:Project(VisualCenter(c)),pullScreen:Project(VisualCenter(c).addScaledVector(c.normal,1.8)),physics:{anchors:c.body.anchors.filter(a=>a.alive).length,detached:c.body.detached,strain:c.body.strain,force:c.body.force,contact:c.body.contact,grip:c.body.grip?.slice()||null}})); }
  return {canal,Reset,Pick,Grip,Drag,Ungrip,ShowTool,HideTool,Release,Update,Targets,Project,Resize,
    Enter(){inside=true;entrance=0;showcase=false;},Hover,
    ToggleView(){if(transfer)return 'canal';showcase=false;inside=!inside;HideTool();return inside?'canal':'ear';},
    Showcase(){showcase=true;HideTool();},
    get ready(){return entrance>=1&&!transfer&&!showcase;},
    get busy(){return !!transfer;},
    get transfer(){return transfer?{id:transfer.chunk.id,age:transfer.age,toolVisible:tool.visible}:null;},
    Drop(c){dropTarget=c.mesh.position.clone();dropAge=0;droplet.visible=true;ShowTool(c,'drops');},
    get chunks(){return chunks;},
    modelInfo:{source:'BlenderMCP',file:'Models/Model_ImmersiveEar.glb',nodes:asset.scene.children.map(n=>n.name)},
    Dispose(){anatomy.dispose();root.traverse(n=>{n.geometry?.dispose();});}};
}
