import * as THREE from 'three';
import { BuildEar, MakeRng } from './Script_EarAnatomy.js?v=ear012-outer-20260911';
import { GLTFLoader } from './vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { PALETTE as P } from './Data_Palette.mjs?v=ear012-outer-20260911';

import {InstrumentContact,IsFeatherDebris} from './Script_InstrumentInteraction.mjs?v=ear012-controls-20260912';
import { CreatePeelBody, GripPeelBody, UngripPeelBody, GetGripPoint, StepPeelBody } from './Script_PeelPhysics.mjs?v=ear012-outer-20260911';
import {mergeGeometries} from './vendor/three/examples/jsm/utils/BufferGeometryUtils.js';
import {FractureGeometry,GeometryVolume,SmoothWaxNormals} from './Script_FractureGeometry.js?v=ear012-outer-20260911';
import {AccelerateStaticRaycast} from './Script_StaticRaycast.js?v=ear012-outer-20260911';
import { CreateToolContact } from './Script_ToolContact.js?v=ear012-outer-20260911';
import { CreateTactileMaterials } from './Script_TactileMaterials.js?v=ear012-controls-20260912';
const Clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

// 封闭耳道、真实接触点与实体收集盘共用毫米世界；镜头在取出时连续后退。
export async function CreateImmersiveScene({ core }) {
  const asset = await new GLTFLoader().loadAsync(new URL('./Models/Model_ImmersiveEar.glb?v=ear015-grip-20260912', import.meta.url).href);
  asset.scene.updateMatrixWorld(true);
  const materials=await CreateTactileMaterials(core.renderer);
  const profile=await (await fetch(new URL('./Data_CanalProfile.json?v=ear012-outer-20260911',import.meta.url))).json();
  const contact=CreateToolContact(profile);
  let lampOn=false,aim=new THREE.Vector2(),aimed=false,toolLevels={},toolSkins={},lastToolId=null,previewTriangles=0,inspectionDepth=0,inspectionTarget=0,reachBlocked=false,heading=0,scoopRotation=null,turnPoint=null,turnChunk=null,hairTime=0;
  const TOOL_REACH={scoop:8.8,tweezers:17.5,drops:17.5,brush:9.5,suction:18,feather:18};
  const Reach=id=>(TOOL_REACH[id]||8.8)+Math.max(0,(toolLevels[id]||1)-1)*.3;
  function PhysicalCopy(source){
    if(source.isMeshPhysicalMaterial)return source.clone();
    const material=new THREE.MeshPhysicalMaterial();THREE.MeshStandardMaterial.prototype.copy.call(material,source);return material;
  }
  function Baked(name) {
    const source = asset.scene.getObjectByName(name);
    if(!source)throw new Error('模型缺少节点：'+name);
    const meshes=[];source.traverse(n=>{if(n.isMesh)meshes.push(n);});
    const geometries=meshes.map(n=>{const g=n.geometry.clone().applyMatrix4(n.matrixWorld);for(const key of Object.keys(g.attributes))if(!['position','normal','uv'].includes(key))g.deleteAttribute(key);if(!g.attributes.uv)g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count*2),2));return g;});
    const mesh=new THREE.Mesh(geometries.length===1?geometries[0]:mergeGeometries(geometries,true),meshes.length===1?PhysicalCopy(meshes[0].material):meshes.map(m=>PhysicalCopy(m.material)));
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
  lamp.shadow.intensity=.78;lamp.shadow.normalBias=.028;
  core.setExposure(1.1);lamp.color.set(0xfffbf5);
  function BakeEnvironment(renderer){
  const environmentScene=new THREE.Scene();environmentScene.background=new THREE.Color(0x626c74);
  for(const [x,y,z,w,h] of [[-5,5,4,4,9],[4,1,-3,3,8],[0,8,0,8,2]]){const card=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:0xe9edef,side:THREE.DoubleSide}));card.position.set(x,y,z);card.lookAt(0,0,0);environmentScene.add(card);}
  const pmrem=new THREE.PMREMGenerator(renderer),target=pmrem.fromScene(environmentScene,.08);pmrem.dispose();environmentScene.traverse(n=>{n.geometry?.dispose();n.material?.dispose();});return target;
  }
  scene.environment=BakeEnvironment(core.renderer).texture;scene.environmentIntensity=.18;

  const outer = new THREE.Group(), canalGroup = new THREE.Group(); root.add(outer, canalGroup);
  for (const name of ['Model_OuterEar','Model_Temple','Model_Pillow']) {
    const mesh=Baked(name);
    if(name==='Model_Pillow') mesh.visible=false;
    else {
      const vestibule=name==='Model_OuterEar',uv=mesh.geometry.attributes.uv,p=mesh.geometry.attributes.position;
      mesh.material=materials.Skin({outer:true,vestibule});
      // GLTF flips Blender V. Keep authored recess depth before projecting shared skin UVs.
      if(vestibule) mesh.geometry.setAttribute('vestibuleDepth',new THREE.Float32BufferAttribute(Array.from({length:uv.count},(_,i)=>1-uv.getY(i)),1));
      for(let i=0;i<p.count;i++) uv.setXY(i,p.getX(i)/20,p.getY(i)/20);
      uv.needsUpdate=true;
    }
    outer.add(mesh);
  }
  for(const name of ['Model_ProfileEyes','Model_ProfileIris','Model_ProfileLashes','Model_ProfileHair','Model_ProfileHairStrands']){const mesh=Baked(name);
    if(name.includes('Hair')){mesh.material.roughness=.62;mesh.material.clearcoat=.035;mesh.material.sheen=.08;mesh.material.sheenColor.set(0x655046);mesh.material.sheenRoughness=.65;mesh.material.anisotropy=0;mesh.material.anisotropyRotation=Math.PI/2;mesh.material.side=THREE.DoubleSide;mesh.material.onBeforeCompile=shader=>{shader.vertexShader='varying vec2 hairFlow;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nhairFlow=uv;');shader.fragmentShader='varying vec2 hairFlow;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float phase=hairFlow.x*13500.0+sin(hairFlow.y*13.0)*1.4;float strand=.5+.5*sin(phase)*(1.0-smoothstep(.6,3.0,fwidth(phase)));
      diffuseColor.rgb*=.82+strand*.18;`);};mesh.material.customProgramCacheKey=()=> 'ProfileGroomedFiberFlow3';}
    outer.add(mesh);}
  const wall = Baked('Model_Canal'); wall.material.side = THREE.DoubleSide; wall.receiveShadow=true; const drum=Baked('Model_Eardrum');drum.material.side=THREE.DoubleSide;const hair=Baked('Model_CanalHair');hair.material=new THREE.MeshPhysicalMaterial({color:0xd0d2ce,roughness:.8,sheen:1,sheenColor:0xe7e9e4,sheenRoughness:.7});canalGroup.add(wall,drum,hair);
  wall.material=materials.Skin();wall.receiveShadow=true;AccelerateStaticRaycast(wall);
  const hairUniforms={time:{value:0},tool:{value:new THREE.Vector3(999,999,999)}};
  hair.material.onBeforeCompile=shader=>{shader.uniforms.vellusTime=hairUniforms.time;shader.uniforms.vellusTool=hairUniforms.tool;shader.vertexShader='uniform float vellusTime;uniform vec3 vellusTool;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
    float rootWeight=uv.x*uv.x;float phase=uv.y*71.0;
    vec3 nearTool=position-vellusTool;float influence=exp(-dot(nearTool,nearTool)*2.2);
    transformed+=rootWeight*(vec3(sin(vellusTime*1.1+phase)*.014,cos(vellusTime*.85+phase)*.009,0.0)+normalize(nearTool+vec3(.001))*.065*influence);
  `);};hair.material.customProgramCacheKey=()=> 'PaleVellusRootWeighted';

  const focus = canal.CenterAt(5.4).clone();
  const right = new THREE.Vector3(), up = new THREE.Vector3(), toward = new THREE.Vector3();
  const workingPlane = new THREE.Plane();
  const ray = new THREE.Raycaster();
  let width = 1, height = 1, chunks = [], inside = false, entrance = 0;
  let lastToolPoint = null, transfer = null, showcase = false,tearTransfer=null;
  const outsidePosition = new THREE.Vector3(-31, 12, -115);
  const insidePosition = new THREE.Vector3(-.25, .2, -1.8);
  camera.position.copy(outsidePosition); camera.up.set(0, 1, 0); camera.lookAt(-2, 8, -1); camera.updateMatrixWorld(true);
  function Surface(depth, angle, lift = 0) { return canal.PointAt(depth, angle, -lift).clone(); }
  const tray = Baked('Model_Tray'); scene.add(tray); tray.position.set(7,-30,-34);tray.scale.set(5.0,4,5.0);tray.receiveShadow=true;
  // 彩蛋印在真实盘沿材质上，参与同一光照、深度与透视。
  const trayLabelCanvas=document.createElement('canvas');trayLabelCanvas.width=1024;trayLabelCanvas.height=128;
  const trayLabelContext=trayLabelCanvas.getContext('2d');trayLabelContext.font='500 72px "Microsoft YaHei", sans-serif';trayLabelContext.textAlign='center';trayLabelContext.textBaseline='middle';trayLabelContext.fillStyle='#ffffff';trayLabelContext.fillText('强迫症的SOPHIA',512,67);
  const trayLabelMap=new THREE.CanvasTexture(trayLabelCanvas);trayLabelMap.anisotropy=Math.min(8,core.renderer.capabilities.getMaxAnisotropy());
  tray.material.onBeforeCompile=shader=>{shader.uniforms.trayInscription={value:trayLabelMap};shader.vertexShader='varying vec3 trayLocal;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntrayLocal=position;');shader.fragmentShader='varying vec3 trayLocal;uniform sampler2D trayInscription;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
    vec2 oval=vec2(trayLocal.x/5.3,trayLocal.z/3.2);float radius=length(oval);
    float labelAngle=atan(oval.x,-oval.y);vec2 labelUv=vec2(.5-labelAngle/.64,1.0-(radius-.91)/.10);
    if(trayLocal.y>.10&&all(greaterThanEqual(labelUv,vec2(0.0)))&&all(lessThanEqual(labelUv,vec2(1.0)))){float ink=texture2D(trayInscription,labelUv).a;diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.40,.43,.42),ink*.27);}
  `);};tray.material.customProgramCacheKey=()=> 'TraySophiaRimInscription';
  const trayCamera = new THREE.Vector3(-29,16,-123), trayFocus = new THREE.Vector3(1,-6,-1);
  const FlatRotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(0,1,0));
  const Smooth = t => { t=Clamp(t); return t*t*(3-2*t); };
  const tool = new THREE.Group(); scene.add(tool); tool.visible = false;
  const toolParts = { scoop: new THREE.Group(), tweezers: new THREE.Group(), drops: new THREE.Group(), brush:new THREE.Group(), suction:new THREE.Group(),feather:new THREE.Group() };
  for (const [id, names] of Object.entries({ scoop: ['Model_ScoopShaft','Model_ScoopHead'], tweezers: ['Model_ForcepsJawLeft','Model_ForcepsJawRight','Model_ForcepsGrip'], drops: ['Model_DropperPipette','Model_DropperBulb'], brush:['Model_Brush','Model_BrushGrip'], suction:['Model_Suction'],feather:['Model_FeatherTuft','Model_FeatherGrip'] })) {
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
    inspectionDepth+=(inspectionTarget-inspectionDepth)*(1-Math.exp(-dt*8));
    const inspectPosition=insidePosition.clone().lerp(canal.CenterAt(6.3).clone(),inspectionDepth);
    const inspectFocus=focus.clone().lerp(canal.CenterAt(13.7).clone(),inspectionDepth);
    camera.position.lerpVectors(outsidePosition, inspectPosition, t);
    const look = new THREE.Vector3(-2,8,-1).lerp(inspectFocus,t);
    const transferBlend = showcase ? 1 : transfer && transfer.mode!=='suction' ? Smooth(transfer.age/.9) * (chunks.filter(c=>!['fractured','collected'].includes(c.state)).length===1?1:1-Smooth((transfer.age-2.55)/.85)) : 0;
    camera.position.lerp(trayCamera,transferBlend); look.lerp(trayFocus,transferBlend);
    // 横屏把耳部留在画幅右侧，避免宽画幅重新露出整张侧脸。
    const outerPan=width/height>1.65?30*Math.max(1-t,transferBlend):0;camera.position.x+=outerPan;look.x+=outerPan;
    camera.lookAt(look);
    const narrow=width/height<.85;
    camera.fov = ((narrow?65:width/height>1.65?34:45)*(1-t)+(narrow?THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(.55)/camera.aspect)):66)*t)*(1-transferBlend)+ (narrow?74:width/height>1.65?36:48)*transferBlend;
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    right.setFromMatrixColumn(camera.matrixWorld,0);up.setFromMatrixColumn(camera.matrixWorld,1);toward.setFromMatrixColumn(camera.matrixWorld,2);
    toolClip.setFromNormalAndCoplanarPoint(toward.clone().negate(),camera.position.clone().addScaledVector(toward,-2.5));
    workingPlane.setFromNormalAndCoplanarPoint(toward, focus);
    outer.visible=entrance<.94||transferBlend>.15;canalGroup.visible=true;
    scene.background.set('#191d20');
    scene.backgroundIntensity=.8;scene.backgroundBlurriness=0;
    scene.environmentIntensity=transferBlend>.4?.65:lampOn?.28:.018;
    for(const c of chunks)c.mesh.visible=(transferBlend<.66||['carrying','dropping','collected'].includes(c.state))&&c.state!=='fractured'&&!(c.toolId==='suction'&&c.state==='collected');
    lamp.position.copy(camera.position).addScaledVector(right,.6).addScaledVector(up,.4);
    lamp.target.position.copy(look);
    if(t>.9&&transferBlend<.05&&aimed){ray.setFromCamera(aim,camera);const hit=ray.intersectObject(wall)[0];lamp.target.position.copy(hit?.point||ray.ray.at(14,new THREE.Vector3()));}
    lamp.angle=.48+(1-t+transferBlend)*.6;lamp.penumbra=.55;
    lamp.intensity=(lampOn?115:0)*t*(1-transferBlend)+transferBlend*190;
    ambient.intensity=.7*(1-t)+(lampOn?.24:.045)*t+transferBlend*.4;key.intensity=1.8*(1-t)+transferBlend*1.4;
    tray.visible=transferBlend>.2||showcase;
    materials.SetOutside(Math.max(1-t,transferBlend));drum.material.color.setScalar(1-Math.max(1-t,transferBlend)*.92);
    ring.quaternion.copy(camera.quaternion);
  }
  function Resize() {
    const size=core.size;if(width===size.width&&height===size.height)return; width=size.width;height=size.height;camera.aspect=width/height;tray.position.x=width/height<.85?-8:7;tray.position.y=width/height>1.65?-15:-30;
    for(const c of chunks)if(c.state==='collected'&&c.toolId!=='suction')c.mesh.position.copy(TrayPosition(c));
  }

  function BuildChunk(rng, id, depth, angle, type, form='chunk') {
    const size = .75 + rng() * .12;
    const tone=type==='dry'&&(form==='ribbon'||id===0||rng()<.48)?'paleYellow':'brown';
    const prototype = Baked(type === 'dry' ? 'Model_WaxDry' : type === 'wet' ? 'Model_WaxWet' : 'Model_WaxFirm');
    const geo = prototype.geometry; const p = geo.attributes.position; const seed=rng()*6;
    const stretch=form==='film'?[1.48,1.7,.24]:form==='ribbon'?[.66,2.22,.32]:form==='flake'?[1.25,1.4,.40]:[1,1,1];
    geo.scale(size*stretch[0],size*stretch[1],size*stretch[2]);
    // Blender 原型尖端平面为 XY，背面沿局部 +Z 进入内壁，正面朝向内法线。
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
      const variation=1+.075*Math.sin(x*4+y*2+seed)+.035*Math.sin(y*11+seed*2);
      const curl=tone==='paleYellow'?.055*Math.pow(Math.min(1,Math.abs(x)/(size*stretch[0])),3)*(1+.35*Math.sin(y*4+seed)):0;
      p.setXYZ(i,x*variation,y*(1+.08*Math.sin(seed)),z+(.22*stretch[2])+curl);
    }
    geo.computeVertexNormals();
    prototype.material=materials.Wax(type,tone);
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
      mass:.90,form,tone,generation:0,fine:false,fragment:false,wetting:0,stress:0,irritation:0,tear:0,origin: mesh.position.clone(), rotation: mesh.quaternion.clone(), original: p.array.slice(), normal, seed, footprint:[size*stretch[0],size*stretch[1]], slot: -1, fly: 0, held: 0 };
    chunk.body=CreatePeelBody({position:chunk.origin.toArray(),rotation:chunk.rotation.toArray(),normal:normal.toArray(),size,type,footprint:chunk.footprint,anchorCount:type==='wet'?13:9});
    mesh.userData.chunk = chunk;
    return chunk;
  }
  function Reset(seed) {
    for (const c of chunks) { root.remove(c.mesh, c.mark); c.mesh.geometry.dispose(); c.mesh.material.dispose(); c.mark.geometry.dispose(); c.mark.material.dispose(); }
    transfer=null;showcase=false;inspectionDepth=inspectionTarget=0;scoopRotation=null;heading=0;turnPoint=turnChunk=null;contact.Reset();
    const rng = MakeRng(seed);
    chunks = Array.from({ length: 9 }, (_, i) => {
      const front = i < 6; const angle = front ? .22 + i * Math.PI / 3 : .70 + (i-6)*Math.PI*2/3;
      const wetEar=seed%5>=3;const type=i===4||i===8?'impacted':i===2||i===7?'wet':wetEar?(i%3===0?'dry':'wet'):(i===5?'wet':'dry');
      return BuildChunk(rng,i,(i===8?14.6:i===7?11.8:front?4.4:8.0)+(rng()-.5)*.15,angle,type,type==='wet'?'film':i%2?'ribbon':'flake');
    });
    for(let i=0;i<12;i++){
      const c=BuildChunk(rng,'dust'+i,4.8+(i%3)*.72,.46+i*Math.PI*2/12,'dry','flake');
      const gs=[];for(let j=0;j<9;j++){const g=new THREE.IcosahedronGeometry(.025+rng()*.06,1);g.scale(1,1,.2);g.translate((rng()-.5)*.62,(rng()-.5)*.75,.035);gs.push(g);}
      c.mesh.geometry.dispose();c.mesh.geometry=mergeGeometries(gs);gs.forEach(g=>g.dispose());c.mesh.geometry.setIndex(Array.from({length:c.mesh.geometry.attributes.position.count},(_,i)=>i));
      c.mass=.075;c.form='microdust';c.fine=true;c.size=.38;c.footprint=[.38,.42];c.grainCount=9;c.original=c.mesh.geometry.attributes.position.array.slice();c.body=CreatePeelBody({position:c.origin.toArray(),rotation:c.rotation.toArray(),normal:c.normal.toArray(),size:c.size,type:'dry'});chunks.push(c);
    }
    // Film and long flakes follow the wall curvature across their whole back surface.
    for(const c of chunks){const p=c.mesh.geometry.attributes.position;
      for(let i=0;i<p.count;i++){const v=new THREE.Vector3(p.getX(i),p.getY(i),0).applyQuaternion(c.rotation).add(c.origin),surface=contact.Surface(v);p.setZ(i,p.getZ(i)-surface.clearance+.018);}
      p.needsUpdate=true;SmoothWaxNormals(c.mesh.geometry);c.original=p.array.slice();
    }
    HideTool(); droplet.visible = false; dropTarget = null; return chunks;
  }
  function VisualCenter(c) { return new THREE.Vector3(0,0,0.09).applyQuaternion(c.mesh.quaternion).add(c.mesh.position); }
  function Project(position) {
    const v = position.clone().project(camera);
    return { x: (v.x + 1) * .5 * width, y: (1 - v.y) * .5 * height, z: v.z };
  }
  function Pick(x, y,toolId=null) {
    scene.updateMatrixWorld(true);
    ray.setFromCamera(new THREE.Vector2(x / width * 2 - 1, 1 - y / height * 2), camera);
    const hit = ray.intersectObjects(chunks.filter(c=>c.state==='attached').map(c=>c.mesh))[0];
    const obstruction = ray.intersectObject(wall)[0];
    if (hit && (!obstruction || hit.distance < obstruction.distance + .035)) return hit.object.userData.chunk;
    // 小屏边缘容差只扩到最近的一块，不能把空白长按解释成远处接触。
    let nearest = null, distance = Math.min(30, width * .075);
    for (const c of chunks.filter(c=>c.state==='attached')) {
      const p = Project(VisualCenter(c));
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < distance) {
        ray.setFromCamera(new THREE.Vector2(p.x/width*2-1,1-p.y/height*2),camera);
        const piece=ray.intersectObject(c.mesh)[0],skin=ray.intersectObject(wall)[0];
        if((piece&&(!skin||piece.distance<skin.distance+.035))||(c.fine&&(!skin||ray.ray.origin.distanceTo(VisualCenter(c))<skin.distance+.15))){nearest = c; distance = d;}
      }
    }
    return nearest;
  }
  function SyncBody(c) {
    c.mesh.position.fromArray(c.body.position); c.mesh.quaternion.fromArray(c.body.rotation);
    c.progress=1-c.body.anchors.filter(a=>a.alive).length/c.body.anchors.length;
  }
  function Grip(c,x,y,id) {
    scene.updateMatrixWorld(true);
    ray.setFromCamera(new THREE.Vector2(x/width*2-1,1-y/height*2),camera);
    const hit=ray.intersectObject(c.mesh)[0];
    let point=hit?.point.clone()||c.mesh.position.clone().addScaledVector(c.normal,.35);
    if(id==='scoop') {
      const local=c.mesh.worldToLocal(point.clone());local.z=0;
      if(local.length()<.12)local.set(0,-1,0);
      local.set(0,-(c.footprint?.[1]||c.size)*.63,.06);
      point=c.mesh.localToWorld(local);
    }
    if(id==='tweezers'){
      const side=c.mesh.material.side;c.mesh.material.side=THREE.DoubleSide;
      const thicknessRay=new THREE.Raycaster(point.clone().addScaledVector(c.normal,c.size*2+.2),c.normal.clone().negate(),0,c.size*4+1);
      const surfaces=thicknessRay.intersectObject(c.mesh);c.mesh.material.side=side;
      if(surfaces.length>1)point.copy(surfaces[0].point).lerp(surfaces.at(-1).point,.5);
    }
    GripPeelBody(c.body,point.toArray());c.toolId=id;c.gripRotation=null;
    c.gripStart=point.clone();c.holdRotation=null;c.appliedAge=0;
    ToolAt(point,id,c);c.gripRotation=tool.quaternion.clone();
    const contactState=InstrumentContact(id,c.gripRotation.toArray(),c.normal.toArray(),{jawContact:c.jawContact});
    c.aligned=contactState.aligned;c.grasped=id==='tweezers'&&contactState.aligned;c.forceDirection=new THREE.Vector3().fromArray(contactState.direction);
    c.pullLocal=c.forceDirection.clone().applyQuaternion(c.rotation.clone().invert());

    ShowTool(c,id);
  }
  function Drag(c,x,y,dt,efficiency) {
    ray.setFromCamera(new THREE.Vector2(x/width*2-1,1-y/height*2),camera);
    if(!c.body.detached){
      // 已形成双侧夹持后由抓点保持，变形中的表面射线不应把镊子误判为松夹。
      const contactState=InstrumentContact(c.toolId,tool.quaternion.toArray(),c.normal.toArray(),{jawContact:c.grasped});
      c.aligned=contactState.aligned;c.forceDirection.fromArray(contactState.direction);
      c.pullLocal.copy(c.forceDirection).applyQuaternion(c.rotation.clone().invert());
    }
    c.appliedAge+=dt;
    const pressure=Smooth(Clamp((c.appliedAge-.08)/.72));
    const travel=(c.toolId==='feather'?.7:Math.max(2.15,1.4+Math.max(...(c.footprint||[c.size]))))*pressure;
    const target=c.gripStart.clone().addScaledVector(c.forceDirection,c.aligned?travel:0);
    if(c.toolId==='suction'&&c.fragment&&c.softened>.45)target.addScaledVector(c.normal,.85);

    const pose=ToolAt(target,c.toolId,c);target.copy(pose.position);
    if(c.body.detached&&!c.holdRotation)c.holdRotation=['scoop','brush'].includes(c.toolId)?FlatRotation.toArray():c.body.rotation.slice();
    const anchors=c.body.anchors.filter(a=>a.alive).length;
    const hard=c.type==='impacted'&&!c.fragment;
    const adhesion=c.fine?.035:c.fragment?.32:hard?1+18*(1-c.softened)**3:1;
    const brittle=c.toolId==='tweezers'&&(c.type==='dry'||c.fragment&&c.type==='impacted')&&c.generation<3&&c.softened<.6;
    const minAnchors=brittle?Math.max(3,Math.ceil(c.body.anchors.length*.6)):(c.toolId==='scoop'&&c.type!=='dry'&&!c.fragment)?2:0;
    const supported=c.fine?c.toolId==='feather'&&IsFeatherDebris(c):c.toolId==='feather'?false:c.toolId==='brush'?c.fragment:c.toolId==='suction'?c.fragment&&c.softened>.45:true;
    const result=StepPeelBody(c.body,{target:c.aligned?target.toArray():null,softness:c.softened,efficiency:efficiency*(supported?1:.03),adhesion,minAnchors:supported&&c.aligned?minAnchors:c.body.anchors.length,supportRotation:c.holdRotation},dt);
    result.wrongDirection=!c.aligned;
    result.needsForceps=c.toolId==='scoop'&&minAnchors>0&&result.remaining===2;
    result.wrongTool=!supported;
    const risky=supported&&c.aligned&&c.generation<3&&((c.toolId==='tweezers'&&(c.type==='dry'||c.fragment&&c.type==='impacted')&&c.softened<.6)||(hard&&c.softened<.6));
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
    if(c.fine)return;
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
      if(c.tear>.15){const d=c.pullLocal||new THREE.Vector3(1,0,0),band=v.x*d.x+v.y*d.y,sign=Math.sign(band);const strain=c.tear*c.tear;v.addScaledVector(d,sign*strain*.10*Math.min(1,Math.abs(band)*3));v.z+=Math.sin(v.y*4+c.seed)*strain*.07;}
      p.setXYZ(i,v.x,v.y,v.z);
    }
    p.needsUpdate=true;c.mesh.geometry.computeVertexNormals();
  }
  function Fracture(c){
    const direction=c.pullLocal?.toArray()||[Math.sin(heading),Math.cos(heading),0];
    const pieces=FractureGeometry(c.mesh.geometry,{direction,grip:c.body.grip||[0,0,0],seed:c.seed,generation:c.generation,load:c.tear});
    if(pieces.length<2){pieces.forEach(g=>g.dispose());c.stress=0;c.tear=0;return [];}
    const volumes=pieces.map(GeometryVolume),totalVolume=volumes.reduce((a,b)=>a+b,0);c.state='fractured';c.mesh.visible=false;Ungrip(c);
    const result=pieces.map((geometry,i)=>{
      const centroid=geometry.boundingBox.getCenter(new THREE.Vector3());geometry.translate(-centroid.x,-centroid.y,-centroid.z);
      const fragmentMaterial=materials.Wax(c.type,c.tone);fragmentMaterial.roughness=c.mesh.material.roughness;fragmentMaterial.clearcoat=c.mesh.material.clearcoat;
      const mesh=new THREE.Mesh(geometry,fragmentMaterial);mesh.position.copy(centroid.clone().applyQuaternion(c.mesh.quaternion).add(c.mesh.position));mesh.quaternion.copy(c.mesh.quaternion);
      const start=mesh.position.clone();
      const spread=centroid.clone().multiplyScalar(1.15).applyQuaternion(c.rotation);
      const destination=c.origin.clone().add(spread).addScaledVector(c.normal,.10);
      const projected=canal.Project(destination);projected.depth=THREE.MathUtils.clamp(projected.depth,4.0,16.5);const normal=canal.NormalAt(projected.depth,projected.angle).clone();
      const seatRay=new THREE.Raycaster(canal.CenterAt(projected.depth).clone(),normal.clone().negate(),0,10),seat=seatRay.intersectObject(wall)[0];
      if(seat)destination.copy(seat.point).addScaledVector(normal,-geometry.boundingBox.min.z+.035);
      mesh.position.copy(destination);
      mesh.quaternion.setFromUnitVectors(c.normal,normal).multiply(c.rotation).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),(i-1)*.14));
      const vertices=geometry.attributes.position;
      for(let pass=0;pass<4;pass++){let penetration=0;for(let j=0;j<vertices.count;j+=3){const p=new THREE.Vector3().fromBufferAttribute(vertices,j).applyQuaternion(mesh.quaternion).add(mesh.position);penetration=Math.max(penetration,.02-contact.Surface(p).clearance);}if(penetration<=0)break;mesh.position.addScaledVector(normal,penetration);}
      mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);
      const fragment={...c,id:String(c.id)+'.'+i,state:'settling',settleFrom:start,settleAge:0,settleVelocity:c.normal.clone().multiplyScalar(.5).add(spread.clone().multiplyScalar(1.6)),tear:0,mesh,mark:c.mark.clone(),size:Math.max(.045,Math.sqrt(geometry.boundingBox.getSize(new THREE.Vector3()).x*geometry.boundingBox.getSize(new THREE.Vector3()).y)*.52),origin:mesh.position.clone(),rotation:mesh.quaternion.clone(),original:geometry.attributes.position.array.slice(),body:null,normal,depth:projected.depth,angle:projected.angle,footprint:[geometry.boundingBox.getSize(new THREE.Vector3()).x*.5,geometry.boundingBox.getSize(new THREE.Vector3()).y*.5],fragment:true,generation:c.generation+1,fine:false,form:'fragment',grainCount:1,cutDirection:direction,mass:c.mass*volumes[i]/totalVolume,stress:0,progress:0,slot:-1};
      fragment.fine=IsFeatherDebris(fragment);
      fragment.body=CreatePeelBody({position:fragment.origin.toArray(),rotation:fragment.rotation.toArray(),normal:normal.toArray(),size:fragment.size,type:c.type});mesh.userData.chunk=fragment;chunks.push(fragment);return fragment;
    });
    result.forEach((fragment,i)=>{fragment.mesh.position.copy(fragment.settleFrom);fragment.tearRotation=c.mesh.quaternion.clone();fragment.settleRotation=fragment.rotation.clone();});
    c.tearPieces=result;c.tearAge=0;tearTransfer={pieces:result,age:0,color:c.mesh.material.color.clone()};
    HideTool();return result;
  }
  function FiberMaterial(){
    const m=new THREE.MeshPhysicalMaterial({color:0xe5e3d8,roughness:.65,metalness:0,sheen:1,sheenColor:0xf4f2e6,sheenRoughness:.58,side:THREE.DoubleSide});
    m.onBeforeCompile=shader=>{shader.uniforms.fiberTime=hairUniforms.time;shader.uniforms.fiberLamp={value:lamp.position};shader.uniforms.fiberTouch={get value(){return tool.visible&&lastToolPoint?lastToolPoint:new THREE.Vector3(999,999,999)}};shader.vertexShader='varying vec3 fiberAxis;varying vec3 fiberWorld;uniform float fiberTime;uniform vec3 fiberTouch;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
        float freeTip=1.0-smoothstep(0.0,3.0,position.y);
        transformed.x+=sin(fiberTime*2.4+position.y*2.0)*.018*freeTip;
        transformed.z+=cos(fiberTime*1.7+position.x*4.0)*.014*freeTip;
        fiberAxis=normalize(normalMatrix*vec3(position.x*.22,1.0,position.z*.22));fiberWorld=(modelMatrix*vec4(transformed,1.0)).xyz;
      `);
      shader.fragmentShader='varying vec3 fiberAxis;varying vec3 fiberWorld;uniform vec3 fiberLamp;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
        vec3 strandT=normalize(fiberAxis);vec3 h=normalize(geometryViewDir+normalize((viewMatrix*vec4(fiberLamp-fiberWorld,0.0)).xyz));
        float tangentDot=dot(strandT,h);float lobe=pow(sqrt(max(0.0,1.0-tangentDot*tangentDot)),48.0);
        float secondary=pow(sqrt(max(0.0,1.0-pow(clamp(tangentDot+.17,-1.0,1.0),2.0))),12.0);
        reflectedLight.indirectSpecular+=irradiance*(lobe*.15+secondary*.08)*vec3(1.0,.94,.83);
        reflectedLight.indirectDiffuse+=irradiance*diffuseColor.rgb*.10;
      `);
    };m.customProgramCacheKey=()=> 'FeatherDualLobeFiber';return m;
  }
  function StyleTool(group,id,level,skin){
    const edition=level<2?'Basic':level<4?'Refined':'Master';
    for(const part of group.children){
      part.userData.originalName??=part.name;
      const source=asset.scene.getObjectByName(part.userData.originalName+'_'+edition);
      if(source){const variant=Baked(source.name);part.geometry.dispose();for(const m of (Array.isArray(part.material)?part.material:[part.material]))m.dispose();part.geometry=variant.geometry;part.material=variant.material;}
      if(['Model_FeatherTuft','Model_Brush'].includes(part.userData.originalName)){for(const m of (Array.isArray(part.material)?part.material:[part.material]))m.dispose();part.material=FiberMaterial();part.userData.softFiber=true;part.userData.fiberRest=part.geometry.attributes.position.array.slice();
        const groups=new Map(),rest=part.userData.fiberRest;
        for(let i=0;i<rest.length/3;i++){const v=new THREE.Vector3(rest[i*3],rest[i*3+1],rest[i*3+2]),key=[v.x,v.y,v.z].map(x=>Math.floor(x/.028)).join(',');if(!groups.has(key))groups.set(key,{center:new THREE.Vector3(),indices:[],radius:0});const bin=groups.get(key);bin.center.add(v);bin.indices.push(i);}
        for(const bin of groups.values()){bin.center.divideScalar(bin.indices.length);for(const i of bin.indices)bin.radius=Math.max(bin.radius,bin.center.distanceTo(new THREE.Vector3(rest[i*3],rest[i*3+1],rest[i*3+2])));}
        part.userData.fiberGroups=[...groups.values()];part.userData.fiberPose=null;}
      for(const m of (Array.isArray(part.material)?part.material:[part.material])){
        materials.GripMaterial(m,skin,level);if(/ToolLiquid/.test(m.name)){m.transparent=false;m.opacity=1;m.transmission=.72;m.thickness=.12;m.depthWrite=true;m.roughness=.075;m.ior=1.33;m.attenuationColor.set(0xc9dbc1);m.attenuationDistance=1.8;}if(/ToolGlass/.test(m.name)){m.transparent=false;m.opacity=1;m.transmission=.96;m.thickness=.065;m.depthWrite=true;m.roughness=.055;m.clearcoat=.2;m.ior=1.47;m.color.set(0xf3fafb);}m.clippingPlanes=[toolClip];if(!/ToolGlass|ToolLiquid/.test(m.name))m.roughness=Math.max(.12,m.roughness-(level%2===1&&level>1?.08:0));
        if(/ToolHandle/.test(m.name)&&['walnut','jade'].includes(skin)){m.color.set(skin==='walnut'?0x66452c:0xd1ded3);m.metalness=0;m.roughness=skin==='jade'?.22:.47;}
      }
    }
  }
  function SetSkins(equipped,levels={}){
    for(const [id,group] of Object.entries(toolParts))if(toolSkins[id]!==equipped[id]||toolLevels[id]!==levels[id])StyleTool(group,id,levels[id]||1,equipped[id]||'classic');
    toolSkins={...equipped};toolLevels={...levels};contact.Reset();
  }
  let shadersWarmed=false;
  async function WarmTools(){
    const renderer=core.renderer,wasShadow=renderer.shadowMap.enabled;
    const visible=[tool,...Object.values(toolParts)].map(o=>[o,o.visible]);tool.visible=true;Object.values(toolParts).forEach(g=>g.visible=true);
    try{for(const shadow of [...new Set([wasShadow,false])]){renderer.shadowMap.enabled=shadow;await renderer.compileAsync(scene,camera);renderer.render(scene,camera);}shadersWarmed=true;}
    finally{renderer.shadowMap.enabled=wasShadow;visible.forEach(([o,v])=>o.visible=v);}
  }
  function CreateToolPreview(canvas,id,level,next,skin){
    const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});renderer.setPixelRatio(Math.min(2,devicePixelRatio));renderer.setSize(canvas.clientWidth||500,canvas.clientHeight||300,false);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
    const stage=new THREE.Scene(),cam=new THREE.PerspectiveCamera(34,(canvas.clientWidth||500)/(canvas.clientHeight||300),.1,150);cam.position.set(1,10,38);cam.lookAt(0,10,0);
    // 商店预览透明底，沿用 UI 的底板；器具环境光与材质保持原值。
    const previewEnvironment=BakeEnvironment(renderer);stage.environment=previewEnvironment.texture;stage.environmentIntensity=.9;stage.background=null;stage.add(new THREE.HemisphereLight(0xffffff,0x504a40,2.2));
    for(const [x,z,intensity] of [[-8,12,4],[10,-5,3]]){const light=new THREE.DirectionalLight(0xffffff,intensity);light.position.set(x,18,z);stage.add(light);}
    const models=[level,next].map((n,i)=>{const group=toolParts[id].clone(true);group.visible=true;group.children.forEach(p=>{p.geometry=p.geometry.clone();p.material=Array.isArray(p.material)?p.material.map(m=>m.clone()):p.material.clone();p.rotation.set(0,0,0);});StyleTool(group,id,n,skin);group.children.forEach(p=>{for(const m of (Array.isArray(p.material)?p.material:[p.material]))m.clippingPlanes=[];p.position.set(0,0,0);});group.position.x=i?4:-4;group.rotation.x=.12;group.rotation.y=-.35;stage.add(group);return group;});
    const render=()=>{renderer.render(stage,cam);previewTriangles=renderer.info.render.triangles;};render();let px=null;
    canvas.onpointerdown=e=>{px=e.clientX;canvas.setPointerCapture(e.pointerId);};canvas.onpointermove=e=>{if(px==null)return;models.forEach(m=>m.rotation.y+=(e.clientX-px)*.015);px=e.clientX;render();};canvas.onpointerup=canvas.onpointercancel=()=>px=null;
    return{SetView(mode){const y=mode==='tip'?.65:mode==='grip'?(id==='drops'?6.2:16.7):id==='drops'?4.5:10;const z=mode==='full'?(id==='drops'?21:38):7;models.forEach((m,i)=>m.position.x=(i?1:-1)*(mode==='full'?4:1.25));cam.position.set(1,y+(mode==='tip'?1:0),z);cam.lookAt(0,y,0);render();},Dispose(){previewTriangles=0;previewEnvironment.dispose();renderer.dispose();renderer.forceContextLoss();models.forEach(g=>g.traverse(p=>{p.geometry?.dispose();if(p.material)for(const m of (Array.isArray(p.material)?p.material:[p.material]))m.dispose();}));}};
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
  function Ungrip(c) { UngripPeelBody(c.body);c.gripRotation=null;c.grasped=false;threads.forEach(t=>t.visible=false); }
  function ToolAt(point,id,c=null,opening=0) {
    reachBlocked=false;
    if(inside&&!transfer){const projected=canal.Project(point);if(projected.depth>Reach(id)){point=Surface(Reach(id),projected.angle,.3);reachBlocked=true;}}
    tool.visible=true;tool.position.copy(point);
    // 耳勺保存玩家的握持朝向，贴壁、换目标和镜头移动只修正位置。
    if(id==='scoop'&&scoopRotation)tool.quaternion.copy(scoopRotation);
    else{
      const shaftAxis=camera.position.clone().addScaledVector(right,1.15).addScaledVector(up,-1.7).sub(point).normalize();
      const faceNormal=c ? new THREE.Vector3(0,0,1).applyQuaternion(c.body?.detached?c.mesh.quaternion:c.rotation) : toward;
      const xAxis=shaftAxis.clone().cross(faceNormal).normalize();
      if(xAxis.lengthSq()<.1)xAxis.copy(right);
      const zAxis=xAxis.clone().cross(shaftAxis).normalize();
      tool.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis,shaftAxis,zAxis));tool.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),heading));
      if(id==='scoop')scoopRotation=tool.quaternion.clone();
    }

    const jawAxis=new THREE.Vector3(1,0,0).applyQuaternion(tool.quaternion);
    if(id==='tweezers'&&c?.body?.grip){
      c.mesh.updateMatrixWorld(true);const oldSide=c.mesh.material.side;c.mesh.material.side=THREE.DoubleSide;
      const sides=[-1,1].map(sign=>new THREE.Raycaster(point.clone().addScaledVector(jawAxis,sign*2.5),jawAxis.clone().multiplyScalar(-sign),0,2.5).intersectObject(c.mesh)[0]);
      c.jawContact=sides.every(Boolean);c.jawGaps=sides.map(hit=>hit?2.5-hit.distance+.048:.66);
      c.mesh.material.side=oldSide;
    }
    for(const [key,group] of Object.entries(toolParts))group.visible=key===id;
    const jaws=toolParts.tweezers.children;
    // 两片弹性镊臂绕柄根张开，夹持时以块体的实际宽度为止点。
    (id==='tweezers'?jaws.slice(0,2):[]).forEach((jaw,i)=>{
      const sign=i===0?-1:1;
      let gap=.66;
      if(c?.body?.grip)gap=c.jawGaps?.[i]??.66;
      const angle=sign*(gap+opening-.08)/17;
      jaw.rotation.z=angle;
      jaw.position.set(Math.sin(angle)*17,17-Math.cos(angle)*17,0);
    });
    if(lastToolId!==id){contact.Reset();lastToolId=id;}
    const samples=contact.Samples(toolParts[id]);
    if(['feather','brush'].includes(id))for(let y=0;y<3;y+=.15)samples.push(new THREE.Vector3(0,y,0));
    const pose=contact.Solve(point,tool.quaternion,samples,{sweep:!transfer,lockPivot:!!turnPoint});tool.position.copy(pose.position);tool.quaternion.copy(pose.rotation);
    if(id==='scoop'&&!transfer)scoopRotation.copy(pose.rotation);
    if(['feather','brush'].includes(id)){
      tool.updateMatrixWorld(true);
      for(const part of toolParts[id].children){if(!part.userData.softFiber)continue;
        if(part.userData.fiberPose?.equals(part.matrixWorld))continue;part.userData.fiberPose=part.matrixWorld.clone();
        const p=part.geometry.attributes.position,rest=part.userData.fiberRest,inv=part.matrixWorld.clone().invert();
        const wallAt=contact.Surface(tool.position),surfacePoint=tool.position.clone().addScaledVector(wallAt.normal,-wallAt.clearance);
        const sample={normal:new THREE.Vector3()},world=new THREE.Vector3(),delta=new THREE.Vector3(),local=new THREE.Vector3();
        for(const bin of part.userData.fiberGroups){
          world.copy(bin.center).applyMatrix4(part.matrixWorld);const rootWeight=1-Clamp(bin.center.y/(id==='brush'?1.85:3));
          const gap=delta.subVectors(world,surfacePoint).dot(wallAt.normal),correction=Clamp(.035-gap,0,.7)*rootWeight;world.addScaledVector(wallAt.normal,correction);
          // 每簇是有上界半径的包络球；额外安全距离覆盖簇内每个顶点和末梢摆动。
          const clearance=.058+bin.radius*1.18;
          for(let pass=0;pass<3;pass++){contact.Surface(world,sample);if(sample.clearance>=clearance)break;world.addScaledVector(sample.normal,clearance+.002-sample.clearance);}
          delta.copy(world).applyMatrix4(inv).sub(bin.center);
          for(const i of bin.indices)p.setXYZ(i,rest[i*3]+delta.x,rest[i*3+1]+delta.y,rest[i*3+2]+delta.z);
        }p.needsUpdate=true;part.geometry.computeVertexNormals();
      }
    }
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
    ToolAt(point,id,c.body?c:null);
    tool.visible=entrance>.94&&!transfer&&!showcase;
  }
  function Hover(x,y,id) {
    if(!inside || entrance<1 || transfer || showcase)return;
    const hit=Pick(x,y,id);
    if(hit)ShowTool(hit,id,0,{x,y});else {
      ray.setFromCamera(new THREE.Vector2(x/width*2-1,1-y/height*2),camera);
      const surface=ray.intersectObject(wall)[0];
      if(surface&&canal.Project(surface.point).depth<19)ShowTool({origin:surface.point,mesh:{position:surface.point},normal:surface.face.normal.clone().transformDirection(wall.matrixWorld)},id,0,{x,y});
      else HideTool();
    }
  }
  function HideTool() { tool.visible = ring.visible = false; threads.forEach(t => { t.visible = false; }); }
  function TrayBounds(){const b=new THREE.Box3().setFromObject(tray),points=[];for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z])points.push(Project(new THREE.Vector3(x,y,z)));return{x:Math.min(...points.map(p=>p.x)),y:Math.min(...points.map(p=>p.y)),right:Math.max(...points.map(p=>p.x)),bottom:Math.max(...points.map(p=>p.y)),visible:tray.visible};}
  function TrayPosition(c) {
    return tray.position.clone().add(new THREE.Vector3((c.slot%5-2)*1.75,.045+(c.bottomOffset||0)+Math.floor(c.slot/15)*.28,Math.floor(c.slot/5)%3*1.55-1.55));
  }
  function Release(c,slot) {
    if(c.toolId==='feather'){
      if(!IsFeatherDebris(c))return;
      c.batch=chunks.filter(other=>other!==c&&IsFeatherDebris(other)&&other.state==='attached'&&other.origin.distanceTo(c.origin)<1.7);
      c.batch.forEach(other=>{other.state='carrying';other.toolId='feather';other.batchOffset=other.mesh.position.clone().sub(c.mesh.position).applyQuaternion(c.mesh.quaternion.clone().invert()).multiplyScalar(.45);});
    }
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
  function EndService(){if(transfer){const c=transfer.chunk;c.state='attached';c.mesh.position.copy(c.origin);c.mesh.quaternion.copy(c.rotation);for(const child of c.batch||[]){child.state='attached';child.mesh.position.copy(child.origin);child.mesh.quaternion.copy(child.rotation);}transfer=null;}for(const c of chunks)if(c.state==='held'||c.state==='peeling'){Ungrip(c);c.state='attached';}HideTool();}
  function Update(dt) {
    Resize();hairTime+=dt;hairUniforms.time.value=hairTime;hairUniforms.tool.value.copy(tool.visible?tool.position:new THREE.Vector3(999,999,999));
    if(transfer)transfer.age+=dt;
    CameraFrame(dt);
    if(dropTarget&&dropAge<.45) {
      dropAge+=dt;const t=Clamp(dropAge/.45);
      droplet.position.copy(droplet.userData.start||dropTarget).lerp(dropTarget,t).addScaledVector(up,Math.sin(t*Math.PI)*.1);
      droplet.scale.set(1,1+(1-t)*.55,1);droplet.visible=t<1;
    }
    const landed=[];
    for(const c of chunks) {
      if(c.wetting>c.softened)c.softened=Math.min(c.wetting,c.softened+dt*.32);
      c.surfaceWet=Math.min(1,(c.surfaceWet||0)+Math.min(dt*3,Math.max(0,c.wetting-(c.surfaceWet||0))));
      materials.WetWax(c.mesh.material,c.softened,c.surfaceWet,c.type);
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
    materials.Update(chunks,lamp);
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
    if(transfer?.chunk.batch){const parent=transfer.chunk;for(const child of parent.batch){child.mesh.visible=true;child.mesh.position.copy(parent.mesh.position).add(child.batchOffset.clone().applyQuaternion(parent.mesh.quaternion));child.mesh.quaternion.copy(parent.mesh.quaternion);if(parent.state==='collected')child.state='collected';}}
    for(const parent of [...landed])if(parent.batch)for(const child of parent.batch){child.state='collected';landed.push(child);}
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
  function InteractionPoint(c){
    if(!c.fragment||c.state!=='attached')return VisualCenter(c);
    scene.updateMatrixWorld(true);const p=c.mesh.geometry.attributes.position,idx=c.mesh.geometry.index,candidates=[VisualCenter(c)];
    const stride=Math.max(3,Math.floor((idx?.count||p.count)/60/3)*3);
    for(let i=0;i<(idx?.count||p.count)-2;i+=stride){const v=new THREE.Vector3();for(let j=0;j<3;j++)v.add(new THREE.Vector3().fromBufferAttribute(p,idx?idx.getX(i+j):i+j));candidates.push(v.multiplyScalar(1/3).applyMatrix4(c.mesh.matrixWorld));}
    for(const point of candidates){const screen=Project(point);ray.setFromCamera(new THREE.Vector2(screen.x/width*2-1,1-screen.y/height*2),camera);const hit=ray.intersectObjects(chunks.filter(c=>c.state==='attached').map(c=>c.mesh))[0],skin=ray.intersectObject(wall)[0];if(hit?.object===c.mesh&&(!skin||hit.distance<skin.distance+.035))return point;}
    return VisualCenter(c);
  }
  function Targets() { return chunks.map(c=>({id:c.id,type:c.type,depth:c.depth,mass:c.mass,form:c.form,tone:c.tone,generation:c.generation,fine:c.fine,grainCount:c.grainCount||1,cutDirection:c.cutDirection,forceDirection:c.forceDirection?.toArray(),fragment:c.fragment,wetting:c.wetting,surfaceWet:c.surfaceWet||0,aligned:c.aligned,jawContact:c.jawContact,footprint:c.footprint,state:c.state,progress:c.progress,softened:c.softened,vertices:c.mesh.geometry.attributes.position.count,triangles:c.mesh.geometry.index.count/3,position:c.mesh.position.toArray(),rotation:c.mesh.quaternion.toArray(),scale:c.mesh.scale.toArray(),screen:Project(InteractionPoint(c)),sweepScreen:Project(VisualCenter(c).add(new THREE.Vector3(1.8,0,0).applyQuaternion(c.rotation))),pullScreen:Project(VisualCenter(c).addScaledVector(c.normal,1.8)),physics:{anchors:c.body.anchors.filter(a=>a.alive).length,detached:c.body.detached,strain:c.body.strain,force:c.body.force,contact:c.body.contact,grip:c.body.grip?.slice()||null}})); }
  return {WarmTools,canal,Reset,EndService,Pick,Grip,Drag,Fracture,SetSkins,CreateToolPreview,Ungrip,ShowTool,HideTool,Release,Update,Targets,Project,Resize,
    TurnStart(x,y,id){
      turnChunk=Pick(x,y,id);if(turnChunk)ShowTool(turnChunk,id,0,{x,y});else Hover(x,y,id);
      if(!tool.visible)return false;
      // 先为整个旋转包络留出间隙，勺沿不会一转到侧面就卡死在内壁里。
      const bins=new Map();for(const p of contact.Samples(toolParts[id])){const key=Math.floor(p.y/.2),r=Math.hypot(p.x,p.z);bins.set(key,Math.max(bins.get(key)||0,r));}
      const envelope=[];for(const [band,radius] of bins)for(const y of [band*.2,(band+1)*.2])for(let i=0;i<16;i++){const a=i*Math.PI/8,r=(radius+.025)/Math.cos(Math.PI/16);envelope.push(new THREE.Vector3(Math.cos(a)*r,y,Math.sin(a)*r));}
      const pose=contact.Solve(tool.position,tool.quaternion,envelope,{sweep:false});tool.position.copy(pose.position);tool.quaternion.copy(pose.rotation);turnPoint=tool.position.clone();return true;
    },
    TurnBy(delta,id){if(!turnPoint)return;const previous=heading;heading+=delta;if(id==='scoop')scoopRotation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),delta));const pose=ToolAt(turnPoint,id,turnChunk);if(pose.blocked)heading=previous+delta*(pose.rotationFraction||0);return heading;},
    TurnEnd(){turnPoint=null;turnChunk=null;},Heading(){return heading;},
    Reach,CanReach(c,id){return c.depth<=Reach(id);},SetDeep(value){inspectionTarget=value?1:0;contact.Reset();HideTool();},
    AuditTool,CollisionProbe(){return contact.Probe();},
    SetContact:materials.SetContact,
    RenderingProbe(){return {shadersWarmed,staticRaycast:true,fiberClusters:Object.fromEntries(['feather','brush'].map(id=>[id,toolParts[id].children.reduce((sum,p)=>sum+(p.userData.fiberGroups?.length||0),0)])),...materials.Probe(),heading,inspectionDepth,inspectionTarget,reachBlocked,toolReach:Reach(lastToolId),traySize:new THREE.Box3().setFromObject(tray).getSize(new THREE.Vector3()).toArray(),trayStandalone:true,trayBounds:TrayBounds(),trayInscription:"强迫症的SOPHIA",toolPosition:tool.position.toArray(),toolRotation:tool.quaternion.toArray(),featherShading:'dual-lobe anisotropic fiber approximation',hairCount:360,hairRootFixed:true,hairTime,headRealtime:true,lampOn,lampAim:lamp.target.position.toArray(),lampIntensity:lamp.intensity,shadows:core.renderer.shadowMap.enabled,canalVisible:canalGroup.visible,externalContext:outer.visible&&!!(transfer||showcase),outerVisible:outer.visible,irritation:chunks.filter(c=>!c.fragment).map(c=>c.irritation),roughness:chunks.map(c=>c.mesh.material.roughness),clearcoat:chunks.map(c=>c.mesh.material.clearcoat),toolLevels:{...toolLevels},previewTriangles};},
    ToggleLamp(){lampOn=!lampOn;return lampOn;},AimLamp(x,y){aim.set(x/width*2-1,1-y/height*2);aimed=true;},
    Enter(){inside=true;entrance=0;showcase=false;},Hover,
    ToggleView(){if(transfer)return 'canal';showcase=false;inside=!inside;HideTool();return inside?'canal':'ear';},
    Showcase(){showcase=true;HideTool();},
    get ready(){return entrance>=1&&!transfer&&!showcase;},
    get busy(){return !!transfer;},
    get transfer(){return transfer?{id:transfer.chunk.id,age:transfer.age,mode:transfer.mode||'carry',toolVisible:tool.visible}:null;},
    Drop(c){c.surfaceWet=Math.max(c.surfaceWet||0,.18);ShowTool(c,'drops');dropTarget=c.mesh.position.clone().addScaledVector(c.normal,.18);dropAge=0;droplet.visible=true;droplet.userData.start=lastToolPoint.clone();},
    get chunks(){return chunks;},
    modelInfo:{source:'BlenderMCP',file:'Models/Model_ImmersiveEar.glb',edition:'DirectionalAnatomy',nodes:asset.scene.children.map(n=>n.name)},
    Dispose(){anatomy.dispose();root.traverse(n=>{n.geometry?.dispose();});}};
}
