import {FeatherCapacity} from './Script_FeatherSweep.mjs?v=ear029-feather-20260912';
import {AddFeatherFur,ClearFeatherFur,PrepareFeatherStrands,FEATHER_FUR_LENGTH,FEATHER_FUR_PASSES} from './Script_FeatherFur.js?v=ear031-feather-groom-20260912';
import {CreateCollectionTray} from './Script_CollectionTray.js?v=ear036-oily-bites-20260912';
import * as THREE from 'three';
import {SlimeCage,PoseSlimeVolume,StepSlimeVolume,SplitSlimeBite} from './Script_SlimePhysics.mjs?v=ear036-oily-bites-20260912';
import {BuildOilyCoating,OILY_REGIONS} from './Script_OilyCoating.mjs?v=ear036-oily-bites-20260912';
import { BuildEar, MakeRng } from './Script_EarAnatomy.js?v=ear012-outer-20260911';
import { GLTFLoader } from './vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { PALETTE as P } from './Data_Palette.mjs?v=ear012-outer-20260911';

import {InstrumentContact,IsFeatherDebris} from './Script_InstrumentInteraction.mjs?v=ear033-scoop-contact-audio-20260912';
import {WaxEdgeContact,WaxGripNormal} from './Script_WaxEdgeContact.mjs?v=ear033-scoop-contact-audio-20260912';
import { CreatePeelBody, GripPeelBody, UngripPeelBody, GetGripPoint, StepPeelBody, BindPeelSurface, BindPeelSurfaceSteps, WritePeelSurface, MovePeelBody, PeelAnchorPoint } from './Script_PeelPhysics.mjs?v=ear036-oily-bites-20260912';
import {mergeGeometries} from './vendor/three/examples/jsm/utils/BufferGeometryUtils.js';
import {FractureGeometry,GeometryVolume,SmoothWaxNormals} from './Script_FractureGeometry.js?v=ear024-cohesive-scraping-20260912';
import {AccelerateStaticRaycast} from './Script_StaticRaycast.js?v=ear012-outer-20260911';
import { CreateToolContact } from './Script_ToolContact.js?v=ear020-contact-loading-20260912';
import { CreateTactileMaterials } from './Script_TactileMaterials.js?v=ear032-oily-detail-20260912';
const Clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

// 封闭耳道、真实接触点与实体收集盘共用毫米世界；镜头在取出时连续后退。
export async function CreateImmersiveScene({ core }) {
  const [asset,materials,profile]=await Promise.all([
    new GLTFLoader().loadAsync(new URL('./Models/Model_ImmersiveEar.glb?v=ear019-hair-complexion-20260912', import.meta.url).href),
    CreateTactileMaterials(core.renderer),
    fetch(new URL('./Data_CanalProfile.json?v=ear012-outer-20260911',import.meta.url)).then(response=>response.json()),
  ]);
  asset.scene.updateMatrixWorld(true);
  const contact=CreateToolContact(profile);
  let lampOn=false,aim=new THREE.Vector2(),aimed=false,toolLevels={},toolSkins={},lastToolId=null,previewTriangles=0,inspectionDepth=0,inspectionTarget=0,reachBlocked=false,heading=0,scoopRotation=null,turnPoint=null,turnChunk=null,hairTime=0,scoopStroke=null,featherSweep=null;
  const TOOL_REACH={scoop:8.8,tweezers:23.8,drops:17.5,brush:9.5,suction:18,feather:18};
  const Reach=id=>Math.min(24.4,(TOOL_REACH[id]||8.8)+Math.max(0,(toolLevels[id]||1)-1)*.3);
  function PhysicalCopy(source){
    if(source.isMeshPhysicalMaterial)return source.clone();
    const material=new THREE.MeshPhysicalMaterial();THREE.MeshStandardMaterial.prototype.copy.call(material,source);return material;
  }
  function Baked(name) {
    const source = asset.scene.getObjectByName(name);
    if(!source)throw new Error('模型缺少节点：'+name);
    const meshes=[];source.traverse(n=>{if(n.isMesh)meshes.push(n);});
    const geometries=meshes.map(n=>{const g=n.geometry.clone().applyMatrix4(n.matrixWorld);for(const key of Object.keys(g.attributes))if(!['position','normal','uv','color'].includes(key))g.deleteAttribute(key);if(!g.attributes.uv)g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count*2),2));return g;});
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
  function BakeEnvironment(renderer,metal=false){
  const environmentScene=new THREE.Scene();environmentScene.background=new THREE.Color(0x626c74);
  // 金属需要可分辨的亮条、暗面和冷暖反射；仅作用于器具，避免照亮封闭耳道。
  if(metal)environmentScene.background.setRGB(.025,.032,.042);
  const cards=metal?[[-5,3,4,2.1,9,3.4,3.6,3.8],[5,1,-3,1.2,8,1.7,1.95,2.3],[0,8,0,7,3,1.8,1.7,1.5],[-1,-4,-5,5,2,.42,.34,.27]]:[[-5,5,4,4,9],[4,1,-3,3,8],[0,8,0,8,2]];
  for(const [x,y,z,w,h,r,g,b] of cards){const color=metal?new THREE.Color().setRGB(r,g,b):new THREE.Color(0xe9edef),card=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide}));card.position.set(x,y,z);card.lookAt(0,0,0);environmentScene.add(card);}
  const pmrem=new THREE.PMREMGenerator(renderer),target=pmrem.fromScene(environmentScene,metal?.015:.08);pmrem.dispose();environmentScene.traverse(n=>{n.geometry?.dispose();n.material?.dispose();});return target;
  }
  const environment=BakeEnvironment(core.renderer),metalEnvironment=BakeEnvironment(core.renderer,true),metalMaterials=new Set();
  let metalIntensity=.7;
  scene.environment=environment.texture;scene.environmentIntensity=.18;

  const outer = new THREE.Group(), canalGroup = new THREE.Group(); root.add(outer, canalGroup);
  for (const name of ['Model_OuterEar','Model_Temple','Model_Pillow']) {
    const mesh=Baked(name);
    if(name==='Model_Pillow') mesh.visible=false;
    else {
      const vestibule=name==='Model_OuterEar',uv=mesh.geometry.attributes.uv,p=mesh.geometry.attributes.position;
      mesh.material=materials.Skin({outer:true,vestibule});
      // Blender bakes local pinna occlusion from the sculpted cartilage geometry.
      mesh.material.vertexColors=!!mesh.geometry.attributes.color;
      // GLTF flips Blender V. Keep authored recess depth before projecting shared skin UVs.
      if(vestibule) mesh.geometry.setAttribute('vestibuleDepth',new THREE.Float32BufferAttribute(Array.from({length:uv.count},(_,i)=>1-uv.getY(i)),1));
      for(let i=0;i<p.count;i++) uv.setXY(i,p.getX(i)/20,p.getY(i)/20);
      uv.needsUpdate=true;
    }
    outer.add(mesh);
  }
  const hairMap=await new THREE.TextureLoader().loadAsync(new URL('./Textures/Texture_LayeredDarkHair.png?v=ear017-layered-20260912',import.meta.url).href);
  hairMap.colorSpace=THREE.SRGBColorSpace;hairMap.anisotropy=Math.min(8,core.renderer.capabilities.getMaxAnisotropy());
  for(const name of ['Model_ProfileEyes','Model_ProfileIris','Model_ProfileLashes','Model_ProfileHair','Model_ProfileHairStrands','Model_ProfileHairWisps']){
    const mesh=Baked(name);
    if(name.includes('Hair')){
      const scalp=name==='Model_ProfileHair',wisps=name==='Model_ProfileHairWisps';
      mesh.material=new THREE.MeshPhysicalMaterial({map:hairMap,bumpMap:hairMap,bumpScale:.035,color:scalp?0x99918b:0xffffff,roughness:scalp?.75:.62,metalness:0,specularIntensity:.24,anisotropy:0,anisotropyRotation:Math.PI/2,sheen:.10,sheenColor:0x9b8067,sheenRoughness:.72,clearcoat:0,alphaTest:scalp?0:.10,side:THREE.DoubleSide,depthWrite:true});
      mesh.material.alphaToCoverage=!wisps;
      if(wisps){mesh.material.map=null;mesh.material.bumpMap=null;mesh.material.alphaTest=0;mesh.material.color.set(0x655046);mesh.material.specularIntensity=.1;mesh.material.transparent=true;mesh.material.opacity=.64;mesh.material.depthWrite=false;}
      if(!wisps){
        // Sample a strand-scale slice for color, retaining the full authored edge alpha.
        mesh.material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )','texture2D( map, vec2(.34+vMapUv.x*.18,vMapUv.y) )').replace('diffuseColor *= sampledDiffuseColor;','sampledDiffuseColor.a='+(scalp?'1.0':'texture2D(map,vMapUv).a')+'; diffuseColor *= sampledDiffuseColor;'));};
        mesh.material.customProgramCacheKey=()=> scalp?'HairOpaqueCoverage2':'LayeredHairStrandScale2';
        mesh.material.roughness=.54;mesh.material.specularIntensity=.38;
      }
      mesh.userData.hairLayer=scalp?'opaqueScalp':wisps?'silhouetteStrands':'threeTexturedCardLayers';
    }
    outer.add(mesh);
  }
  const wall = Baked('Model_Canal'); wall.material.side = THREE.DoubleSide; wall.receiveShadow=true; const drum=Baked('Model_Eardrum');drum.material.side=THREE.DoubleSide;const hair=Baked('Model_CanalHair');hair.material=new THREE.MeshPhysicalMaterial({color:0xd0d2ce,roughness:.8,sheen:1,sheenColor:0xe7e9e4,sheenRoughness:.7});canalGroup.add(wall,drum,hair);
  wall.material=materials.Skin();wall.receiveShadow=true;AccelerateStaticRaycast(wall);
  // 入口全景只显示管腔内表面，不暴露剖面外壳；完整原网格仍用于实际壁面射线。
  const entryWall=wall.clone(),entryIndices=[],wallPosition=wall.geometry.attributes.position,wallIndex=wall.geometry.index;
  for(let i=0;i<wallIndex.count;i+=3){const ids=[0,1,2].map(k=>wallIndex.getX(i+k)),[a,b,c]=ids.map(id=>new THREE.Vector3().fromBufferAttribute(wallPosition,id)),center=a.clone().add(b).add(c).multiplyScalar(1/3),depth=canal.Project(center).depth,radial=center.clone().sub(canal.CenterAt(depth).clone()).normalize(),normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize();if(normal.dot(radial)<-.25)entryIndices.push(...ids);}
  entryWall.name='Model_EntryCanal';entryWall.geometry=wall.geometry.clone();entryWall.geometry.setIndex(entryIndices);entryWall.material=wall.material.clone();entryWall.material.side=THREE.FrontSide;entryWall.material.onBeforeCompile=wall.material.onBeforeCompile;entryWall.material.customProgramCacheKey=wall.material.customProgramCacheKey;entryWall.visible=false;canalGroup.add(entryWall);
  // 入口孔径遮挡管腔外的深部模型；孔沿来自同一解剖轮廓，保留入口薄膜的真实视线。
  const aperturePositions=[],apertureIndices=[],apertureCenter=canal.CenterAt(0).clone();
  for(let i=0;i<128;i++){const mouth=canal.PointAt(0,i/128*Math.PI*2,.02).clone(),outside=mouth.clone().sub(apertureCenter).normalize().multiplyScalar(80).add(apertureCenter);aperturePositions.push(...mouth.toArray(),...outside.toArray());const a=i*2,b=((i+1)%128)*2;apertureIndices.push(a,b,a+1,a+1,b,b+1);}
  const apertureGeometry=new THREE.BufferGeometry();apertureGeometry.setAttribute('position',new THREE.Float32BufferAttribute(aperturePositions,3));apertureGeometry.setIndex(apertureIndices);
  const entryAperture=new THREE.Mesh(apertureGeometry,new THREE.MeshBasicMaterial({color:0x191d20,side:THREE.DoubleSide,toneMapped:false}));entryAperture.name='Model_EntryAperture';entryAperture.visible=false;canalGroup.add(entryAperture);
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
  let toolDragMode=false,toolDrag=null,manualRotation=null,parkedTool=null;
  let lastToolPoint = null, transfer = null, showcase = false, showcaseBlend = 0, traySlot = 0;
  const outsidePosition = new THREE.Vector3(-31, 12, -115);
  const insidePosition = new THREE.Vector3(-.25, .2, -1.8);
  const entryFocus=canal.CenterAt(0).clone(),entryPosition=entryFocus.clone().addScaledVector(canal.TangentAt(0).clone(),-10);
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
      const part=Baked(name);part.castShadow=true;
      // 长镊保留工作端形状，加长真实夹臂与握柄位置；完整碰撞沿用同一几何。
      if(id==='tweezers')ExtendForceps(part);
      for(const m of (Array.isArray(part.material)?part.material:[part.material]))m.clippingPlanes=[toolClip];toolParts[id].add(part);
    }
    tool.add(toolParts[id]);
  }
  const collectionTray=CreateCollectionTray({scene,tray,camera,Project,size:()=>({width,height}),scoop:toolParts.scoop});
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.95, .026, 8, 64), new THREE.MeshBasicMaterial({ color: P.white, transparent: true, opacity: .75 }));
  scene.add(ring); ring.quaternion.copy(camera.quaternion); ring.visible = false;
  const droplet = new THREE.Mesh(new THREE.SphereGeometry(.16, 16, 12), new THREE.MeshPhysicalMaterial({ color: P.water, roughness: .12, clearcoat: 1 }));
  scene.add(droplet); droplet.visible = false;
  let dropAge = 1, dropTarget = null;


  function CameraFrame(dt) {
    entrance = Clamp(entrance + (inside ? dt : -dt) / 1.7);
    const t = Smooth(entrance);
    inspectionDepth+=(inspectionTarget-inspectionDepth)*(1-Math.exp(-dt*8));
    const oily=chunks[0]?.type==='oily';
    const inspectPosition=insidePosition.clone().lerp(canal.CenterAt(oily?9.5:6.3).clone(),inspectionDepth);
    const inspectFocus=focus.clone().lerp(canal.CenterAt(oily?20:13.7).clone(),inspectionDepth);
    if(oily&&inspectionDepth<0){const wide=Clamp(-inspectionDepth/.4);inspectPosition.copy(insidePosition).lerp(entryPosition,wide);inspectFocus.copy(focus).lerp(entryFocus,wide);}
    camera.position.lerpVectors(outsidePosition, inspectPosition, t);
    const look = new THREE.Vector3(-2,8,-1).lerp(inspectFocus,t);
    const transferBlend = showcase ? 1 : transfer && transfer.mode!=='suction' ? Smooth(transfer.age/.9) * (chunks.filter(c=>!['fractured','collected','exhausted'].includes(c.state)).length===1?1:1-Smooth((transfer.age-2.55)/.85)) : 0;
    camera.position.lerp(trayCamera,transferBlend); look.lerp(trayFocus,transferBlend);
    // 横屏把耳部留在画幅右侧，避免宽画幅重新露出整张侧脸。
    const outerPan=width/height>1.65?30*Math.max(1-t,transferBlend):0;camera.position.x+=outerPan;look.x+=outerPan;
    const narrow=width/height<.85;
    camera.fov = ((narrow?65:width/height>1.65?34:45)*(1-t)+(narrow?THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(.55)/camera.aspect)):66)*t)*(1-transferBlend)+ (narrow?74:width/height>1.65?36:48)*transferBlend;
    showcaseBlend+=( (showcase?1:0)-showcaseBlend)*(1-Math.exp(-dt*4));
    if(showcaseBlend>.0001){
      // 盘子占据结算卡以外的区域，竖屏留在下半部，横屏留在右侧。
      const portrait=width<=600,wide=width/height>1.65;
      const distance=portrait?88:wide?82:105;
      const closePosition=tray.position.clone().add(new THREE.Vector3(0,distance*.82,-distance*.57));
      const closeLook=tray.position.clone();
      const forward=closeLook.clone().sub(closePosition).normalize();
      const closeRight=forward.clone().cross(new THREE.Vector3(0,1,0)).normalize();
      const closeUp=closeRight.clone().cross(forward).normalize();
      const pan=portrait?closeUp.multiplyScalar(height<650?13:15):closeRight.multiplyScalar(wide?-18:-10);
      closePosition.add(pan);closeLook.add(pan);
      camera.position.lerp(closePosition,showcaseBlend);look.lerp(closeLook,showcaseBlend);
      camera.fov=THREE.MathUtils.lerp(camera.fov,portrait?THREE.MathUtils.radToDeg(2*Math.atan(36/(distance*camera.aspect))):wide?36:48,showcaseBlend);
    }
    camera.lookAt(look);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    right.setFromMatrixColumn(camera.matrixWorld,0);up.setFromMatrixColumn(camera.matrixWorld,1);toward.setFromMatrixColumn(camera.matrixWorld,2);
    toolClip.setFromNormalAndCoplanarPoint(toward.clone().negate(),camera.position.clone().addScaledVector(toward,-2.5));
    workingPlane.setFromNormalAndCoplanarPoint(toward, focus);
    outer.visible=(entrance<.94||transferBlend>.15)&&showcaseBlend<.92;canalGroup.visible=showcaseBlend<.92;entryAperture.visible=entryWall.visible=oily&&inspectionDepth<-.03&&!outer.visible&&showcaseBlend<.92;wall.visible=!entryWall.visible;
    scene.background.set('#191d20');
    scene.backgroundIntensity=.8;scene.backgroundBlurriness=0;
    scene.environmentIntensity=transferBlend>.4?.65:lampOn?.28:.018;
    metalIntensity=THREE.MathUtils.lerp(THREE.MathUtils.lerp(.7,lampOn?.75:.045,t),.85,transferBlend);
    for(const c of chunks)if(c.coating)c.mesh.material.envMapIntensity=metalIntensity*.72;
    for(const material of metalMaterials)material.envMapIntensity=metalIntensity;
    for(const c of chunks)c.mesh.visible=(transferBlend<.66||['carrying','dropping','collected'].includes(c.state))&&!['fractured','exhausted'].includes(c.state)&&!(c.toolId==='suction'&&c.state==='collected')&&!c.trayStored&&showcaseBlend<.92;
    lamp.position.copy(camera.position).addScaledVector(right,.6).addScaledVector(up,.4);
    lamp.target.position.copy(look);
    if(t>.9&&transferBlend<.05&&aimed){ray.setFromCamera(aim,camera);const hit=ray.intersectObject(wall)[0];lamp.target.position.copy(hit?.point||ray.ray.at(14,new THREE.Vector3()));}
    lamp.angle=.48+(1-t+transferBlend)*.6;lamp.penumbra=.55;
    lamp.intensity=(lampOn?115:0)*t*(1-transferBlend)+transferBlend*190;
    ambient.intensity=.7*(1-t)+(lampOn?.24:.045)*t+transferBlend*.4;key.intensity=1.8*(1-t)+transferBlend*1.4;
    tray.visible=transferBlend>.2||showcase;collectionTray.Update(dt);
    materials.SetOutside(Math.max(1-t,transferBlend));drum.material.color.setScalar(1-Math.max(1-t,transferBlend)*.92);
    ring.quaternion.copy(camera.quaternion);
  }
  function Resize() {
    const size=core.size;if(width===size.width&&height===size.height)return; width=size.width;height=size.height;camera.aspect=width/height;tray.position.x=width/height<.85?-8:7;tray.position.y=width/height>1.65?-15:-30;
    for(const c of chunks)if(c.state==='collected'&&c.toolId!=='suction')c.mesh.position.copy(TrayPosition(c));
  }

  const waxPrototypes=new Map();
  function WaxGeometry(type){
    if(!waxPrototypes.has(type)){
      const prototype=Baked(type==='dry'?'Model_WaxDry':type==='wet'?'Model_WaxWet':'Model_WaxFirm');
      for(const material of(Array.isArray(prototype.material)?prototype.material:[prototype.material]))material.dispose();
      waxPrototypes.set(type,prototype.geometry);
    }
    return waxPrototypes.get(type).clone();
  }
  function BuildChunk(rng, id, depth, angle, type, form='chunk') {
    const size = .75 + rng() * .12;
    const tone=type==='dry'&&(form==='ribbon'||id===0||rng()<.48)?'paleYellow':'brown';
    const geo=type==='oily'?new THREE.BufferGeometry():WaxGeometry(type);if(type==='oily'){const cage=SlimeCage(size,rng()*6);geo.setAttribute('position',new THREE.BufferAttribute(cage.positions,3));geo.setIndex(new THREE.BufferAttribute(cage.indices,1));}
    const p=geo.attributes.position,seed=rng()*6;
    const stretch=form==='film'?[1.48,1.7,.24]:form==='ribbon'?[.66,2.22,.32]:form==='flake'?[1.25,1.4,.40]:[1,1,1];
    if(type!=='oily')geo.scale(size*stretch[0],size*stretch[1],size*stretch[2]);
    // Blender 原型尖端平面为 XY，背面沿局部 +Z 进入内壁，正面朝向内法线。
    for(let i=0;type!=='oily'&&i<p.count;i++){
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
      const variation=1+.075*Math.sin(x*4+y*2+seed)+.035*Math.sin(y*11+seed*2);
      const curl=tone==='paleYellow'?.055*Math.pow(Math.min(1,Math.abs(x)/(size*stretch[0])),3)*(1+.35*Math.sin(y*4+seed)):0;
      p.setXYZ(i,x*variation,y*(1+.08*Math.sin(seed)),z+(.22*stretch[2])+curl);
    }
    geo.computeVertexNormals();
    // 凝胶透光，局部遮蔽使用实际轮廓；不把它烘成不透光的黑影。
    const mesh = new THREE.Mesh(geo, materials.Wax(type,tone));mesh.castShadow=type!=='oily';mesh.receiveShadow=true;
    if(type==='oily')mesh.material.envMap=metalEnvironment.texture;
    const normal = canal.NormalAt(depth, angle).clone().normalize();
    const tangent = canal.TangentAt(depth).clone().normalize();
    const xAxis = tangent.clone().cross(normal).normalize();
    const yAxis = normal.clone().cross(xAxis).normalize();
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, normal));
    const surfaceRay=new THREE.Raycaster(canal.CenterAt(depth).clone(),normal.clone().negate(),0,10);
    const surfaceHit=surfaceRay.intersectObject(wall)[0];
    mesh.position.copy(surfaceHit?surfaceHit.point.clone().addScaledVector(normal,.01):Surface(depth,angle,.018));
    const mark = new THREE.Mesh(new THREE.CircleGeometry(size * .99, 40), new THREE.MeshBasicMaterial({ color: P.skinSheen, transparent: true, opacity: 0, depthWrite: false }));
    mark.visible=false;
    mark.position.copy(Surface(depth, angle, .03)); mark.quaternion.copy(mesh.quaternion);
    const chunk = { id, type, depth, angle, size, state: 'attached', progress: 0, softened: 0, mesh, mark,
      mass:type==='oily'?1:.90,form,tone,generation:0,fine:false,fragment:false,wetting:0,surfaceWet:type==='oily'?1:0,stress:0,irritation:0,tear:0,origin: mesh.position.clone(), rotation: mesh.quaternion.clone(), original: p.array.slice(), normal, seed, footprint:type==='oily'?[size*1.35,size*1.58]:[size*stretch[0],size*stretch[1]], slot: -1, fly: 0, held: 0 };
    chunk.body=CreatePeelBody({position:chunk.origin.toArray(),rotation:chunk.rotation.toArray(),normal:normal.toArray(),size,type,footprint:chunk.footprint,anchorCount:['wet','oily'].includes(type)?13:9});
    mesh.userData.chunk = chunk;
    return chunk;
  }
  function BuildOilRegion(rng,id,seed){
    const lattice=BuildOilyCoating(id,seed,(depth,angle)=>{
      const normal=canal.NormalAt(depth,angle).clone().normalize(),center=canal.CenterAt(depth).clone();
      const hit=new THREE.Raycaster(center,normal.clone().negate(),0,10).intersectObject(wall)[0];
      const point=hit?.point||Surface(depth,angle);return{point:point.toArray(),normal:contact.Surface(point).normal.toArray()};
    });
    const sample=lattice.parameters[lattice.gripNode%lattice.layer],chunk=BuildChunk(rng,id,sample[2],sample[3],'oily','coating');
    const inverse=chunk.rotation.clone().invert(),position=new THREE.Vector3();
    for(let i=0;i<lattice.positions.length;i+=3){position.fromArray(lattice.positions,i).sub(chunk.origin).applyQuaternion(inverse);position.toArray(lattice.positions,i);}
    chunk.mesh.geometry.dispose();chunk.mesh.geometry=new THREE.BufferGeometry();chunk.mesh.geometry.setAttribute('position',new THREE.BufferAttribute(lattice.positions,3));chunk.mesh.geometry.setIndex(new THREE.BufferAttribute(lattice.indices,1));chunk.mesh.geometry.computeVertexNormals();
    chunk.mass=9/OILY_REGIONS.length;chunk.coating=true;chunk.gripNode=lattice.gripNode;chunk.coverage={start:lattice.region.start,end:lattice.region.end,width:lattice.region.width};
    chunk.body.volumeMesh=lattice;chunk.body.cleanMass=chunk.mass;chunk.original=lattice.positions.slice();return chunk;
  }
  function* BuildCustomer(seed,result,earType='mixed') {
    const rng = MakeRng(seed);
    if(earType==='oily')for(let i=0;i<OILY_REGIONS.length;i++){result.push(BuildOilRegion(rng,i,seed));yield;}
    for(let i=0;earType!=='oily'&&i<9;i++){
      const front = i < 6; const angle = front ? .22 + i * Math.PI / 3 : .70 + (i-6)*Math.PI*2/3;
      const wetEar=seed%5>=3;const type=earType!=='mixed'?earType:i===4||i===8?'impacted':i===2||i===7?'wet':wetEar?(i%3===0?'dry':'wet'):(i===5?'wet':'dry');
      result.push(BuildChunk(rng,i,(i===8?14.6:i===7?11.8:front?4.4:8.0)+(rng()-.5)*.15,angle,type,type==='oily'?'gel':type==='wet'?'film':i%2?'ribbon':'flake'));yield;
    }
    for(let i=0;earType!=='oily'&&i<12;i++){
      const c=BuildChunk(rng,'dust'+i,4.8+(i%3)*.72,.46+i*Math.PI*2/12,'dry','flake');
      const gs=[];for(let j=0;j<9;j++){const g=new THREE.IcosahedronGeometry(.025+rng()*.06,1);g.scale(1,1,.2);g.translate((rng()-.5)*.62,(rng()-.5)*.75,.035);gs.push(g);}
      c.mesh.geometry.dispose();c.mesh.geometry=mergeGeometries(gs);gs.forEach(g=>g.dispose());c.mesh.geometry.setIndex(Array.from({length:c.mesh.geometry.attributes.position.count},(_,i)=>i));
      c.mass=.075;c.form='microdust';c.fine=true;c.size=.38;c.footprint=[.38,.42];c.grainCount=9;c.original=c.mesh.geometry.attributes.position.array.slice();c.body=CreatePeelBody({position:c.origin.toArray(),rotation:c.rotation.toArray(),normal:c.normal.toArray(),size:c.size,type:'dry'});result.push(c);yield;
    }
    // Film and long flakes follow the wall curvature across their whole back surface.
    for(const c of result){const p=c.mesh.geometry.attributes.position;
      for(let i=0;!c.coating&&i<p.count;i++){const v=new THREE.Vector3(p.getX(i),p.getY(i),0).applyQuaternion(c.rotation).add(c.origin),surface=contact.Surface(v);p.setZ(i,p.getZ(i)-surface.clearance+.018);}
      p.needsUpdate=true;SmoothWaxNormals(c.mesh.geometry);c.original=p.array.slice();yield;
      if(!c.fine){let render;if(c.type==='oily')render=BindPeelSurface(c.body,p.array,c.mesh.geometry.index.array);else yield* BindPeelSurfaceSteps(c.body,p.array,c.mesh.geometry.index.array);
        if(c.body.gel){const sample={normal:new THREE.Vector3()},point=new THREE.Vector3();c.body.gel.collider=p=>{contact.Surface(point.fromArray(p),sample);return{normal:sample.normal.toArray(),clearance:sample.clearance};};c.mesh.geometry.dispose();c.mesh.geometry=new THREE.BufferGeometry();c.mesh.geometry.setAttribute('position',new THREE.BufferAttribute(render.positions,3));c.mesh.geometry.setIndex(new THREE.BufferAttribute(render.indices,1));c.mesh.geometry.setAttribute('gelRest',new THREE.BufferAttribute(render.rest,3));const uv=new Float32Array(render.rest.length/3*2);for(let i=0;i<uv.length/2;i++){uv[i*2]=render.rest[i*3]/3+.5;uv[i*2+1]=render.rest[i*3+1]/3+.5;}c.mesh.geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));c.mesh.geometry.setAttribute('gelThickness',new THREE.BufferAttribute(render.thickness,1));c.mesh.geometry.computeVertexNormals();c.original=render.positions.slice();}
        yield;materials.PrepareContact(c.mesh.geometry);yield;
      }
    }
  }
  let preparation=null,disposed=false;
  const preparationStats={builds:0,preparedResets:0,lastResetMs:0,lastBuildMs:0,maxSliceMs:0};
  function DisposeChunks(list){for(const c of list){c.mesh.removeFromParent();c.mark.removeFromParent();c.mesh.geometry.dispose();c.mesh.material.dispose();c.mark.geometry.dispose();c.mark.material.dispose();}}
  function CancelPreparation(){
    if(!preparation)return;const job=preparation;preparation=null;
    if(job.id!=null){if(job.idle)cancelIdleCallback(job.id);else clearTimeout(job.id);}
    job.iterator.return();DisposeChunks(job.chunks);job.resolve(false);
  }
  function PrepareCustomer(seed,{urgent=false,earType='mixed'}={}){
    if(disposed)return Promise.resolve(false);
    if(preparation?.seed===seed&&preparation.earType===earType){const job=preparation;if(urgent&&!job.ready&&!job.urgent){job.urgent=true;if(job.idle&&job.id!=null)cancelIdleCallback(job.id);else if(job.id!=null)clearTimeout(job.id);job.schedule();}return job.promise;}
    CancelPreparation();const job={seed,earType,chunks:[],ready:false,id:null,urgent,idle:false,cpuMs:0};
    job.iterator=BuildCustomer(seed,job.chunks,earType);job.promise=new Promise((resolve,reject)=>{job.resolve=resolve;job.reject=reject;});preparation=job;
    function Schedule(){job.idle=!job.urgent&&typeof requestIdleCallback==='function';job.id=job.idle?requestIdleCallback(Work,{timeout:100}):setTimeout(Work,0);}
    job.schedule=Schedule;
    function Work(){
      if(preparation!==job)return;job.id=null;const start=performance.now();
      try{
        do{if(job.iterator.next().done){job.ready=true;break;}}while(performance.now()-start<3);
        const elapsed=performance.now()-start;job.cpuMs+=elapsed;preparationStats.maxSliceMs=Math.max(preparationStats.maxSliceMs,elapsed);
        if(job.ready){preparationStats.builds++;preparationStats.lastBuildMs=job.cpuMs;job.resolve(true);}else Schedule();
      }catch(error){preparation=null;DisposeChunks(job.chunks);job.reject(error);}
    }
    Schedule();return job.promise;
  }
  function Reset(seed,earType='mixed') {
    const start=performance.now();let next;
    if(preparation?.seed===seed&&preparation.earType===earType&&preparation.ready){next=preparation.chunks;preparation=null;preparationStats.preparedResets++;}
    else{CancelPreparation();next=[];for(const _ of BuildCustomer(seed,next,earType)){/* synchronous diagnostic/fallback entry */}preparationStats.builds++;}
    // 同类材质保留已编译的 program；每块仍使用独立的湿度和接触 uniform。
    const available=new Map();
    for(const c of chunks){if(c.fragment)continue;const key=c.type+':'+c.tone;if(!available.has(key))available.set(key,[]);available.get(key).push(c);}
    for(const c of next){const previous=available.get(c.type+':'+c.tone)?.pop();if(!previous)continue;
      const fresh=c.mesh.material;c.mesh.material=previous.mesh.material;previous.mesh.material=fresh;
      c.mesh.material.clippingPlanes=null;materials.WetWax(c.mesh.material,0,0,c.type);
    }
    DisposeChunks(chunks);chunks=next;for(const c of chunks)root.add(c.mesh,c.mark);
    transfer=null;showcase=false;showcaseBlend=0;collectionTray.SetActive(false);inspectionDepth=inspectionTarget=0;parkedTool=manualRotation=toolDrag=null;scoopRotation=scoopStroke=null;heading=0;turnPoint=turnChunk=null;contact.Reset();
    preparationStats.lastResetMs=performance.now()-start;
    HideTool(); droplet.visible = false; dropTarget = null; return chunks;
  }
  function VisualCenter(c) { if(c.coating&&c.body.gel)return new THREE.Vector3().fromBufferAttribute(c.mesh.geometry.attributes.position,c.gripNode).applyQuaternion(c.mesh.quaternion).add(c.mesh.position);return new THREE.Vector3(0,0,0.09).applyQuaternion(c.mesh.quaternion).add(c.mesh.position); }
  function Project(position) {
    const v = position.clone().project(camera);
    return { x: (v.x + 1) * .5 * width, y: (1 - v.y) * .5 * height, z: v.z };
  }
  function Pick(x, y,toolId=null) {
    scene.updateMatrixWorld(true);
    ray.setFromCamera(new THREE.Vector2(x / width * 2 - 1, 1 - y / height * 2), camera);
    const hit = ray.intersectObjects(chunks.filter(c=>c.state==='attached'||c.state==='returning').map(c=>c.mesh))[0];
    const obstruction = ray.intersectObject(wall)[0];
    if (hit && (!obstruction || hit.distance < obstruction.distance + .035)) return hit.object.userData.chunk;
    if(toolId==='scoop'&&scoopStroke){
      let nearest=null,distance=Infinity;
      for(const c of chunks){
        if(!['attached','returning'].includes(c.state)||c.fine||!CanScoopReach(c))continue;
        const contactHit=ScoopSurfaceHit(c);
        if(contactHit&&contactHit.point.distanceToSquared(tool.position)<distance){nearest=c;distance=contactHit.point.distanceToSquared(tool.position);}
      }
      if(nearest)return nearest;
    }
    // 小屏边缘容差只扩到最近的一块，不能把空白长按解释成远处接触。
    let nearest = null, distance = Math.min(30, width * .075);
    for (const c of chunks.filter(c=>c.state==='attached'||c.state==='returning')) {
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
    c.progress=c.body.anchors.length?1-c.body.anchors.filter(a=>a.alive).length/c.body.anchors.length:1;
  }
  function ScoopTouches(point){
    const local=point.clone().sub(tool.position).applyQuaternion(tool.quaternion.clone().invert());
    return Math.abs(local.x)<.64&&Math.abs(local.y)<.84&&local.z>-.55&&local.z<.6;
  }
  function CanScoopReach(c){return c.coating||c.depth<=Reach('scoop');}
  function ScoopNormal(c){
    // 松脱后的托送姿态会把薄片转平；它不应反过来将已有勺碗支撑判成勺背。
    if(c.body.detached&&c.scoopSupportNormal)return c.scoopSupportNormal.slice();
    if(c.body.surface)return WaxGripNormal(c.body,c.normal.toArray());
    if(c.body.gel&&c.scoopFace){
      const p=c.mesh.geometry.attributes.position,[a,b,d]=c.scoopFace.map(i=>new THREE.Vector3().fromBufferAttribute(p,i));
      const normal=b.sub(a).cross(d.sub(a));
      if(normal.lengthSq()>1e-12)return normal.normalize().applyQuaternion(c.mesh.quaternion).toArray();
    }
    return c.normal.toArray();
  }
  function ScoopSurfaceHit(c){
    if(!c.mesh.geometry.boundingSphere)c.mesh.geometry.computeBoundingSphere();
    const bounds=c.mesh.geometry.boundingSphere.clone().applyMatrix4(c.mesh.matrixWorld);
    if(bounds.center.distanceTo(tool.position)>bounds.radius+.95)return null;
    const axis=new THREE.Vector3(0,0,1).applyQuaternion(tool.quaternion),probe=new THREE.Raycaster(),samples=[[0,0]];
    for(let i=0;i<12;i++){const angle=i*Math.PI/6;samples.push([Math.cos(angle)*.36,Math.sin(angle)*.51]);}
    let nearest=null,distance=Infinity;
    // 沿真实勺碗开口检查有限工作区，鼠标中心在轮廓外时勺沿也能接触。
    for(const [x,y] of samples){
      const start=new THREE.Vector3(x,y,.6).applyQuaternion(tool.quaternion).add(tool.position);
      probe.set(start,axis.clone().negate());probe.far=1.15;
      const hit=probe.intersectObject(c.mesh)[0];if(!hit||!ScoopTouches(hit.point))continue;
      const d=hit.point.distanceToSquared(tool.position);if(d>=distance)continue;
      const skin=probe.intersectObject(wall)[0];if(skin&&skin.distance+.035<hit.distance)continue;
      nearest=hit;distance=d;
    }
    return nearest;
  }
  // Contact queries use the corrected, visible working end; the cursor is never a target ray.
  function ToolSurfaceHit(c,id){
    if(!tool.visible||lastToolId!==id||!c.coating&&c.depth>Reach(id))return null;
    if(id==='scoop')return ScoopSurfaceHit(c);
    if(!c.mesh.geometry.boundingSphere)c.mesh.geometry.computeBoundingSphere();
    const bounds=c.mesh.geometry.boundingSphere.clone().applyMatrix4(c.mesh.matrixWorld);
    const fiber=['feather','brush'].includes(id),range=fiber?4:.95;
    if(bounds.center.distanceTo(tool.position)>bounds.radius+range)return null;
    const probe=new THREE.Raycaster(),samples=[];
    if(fiber){
      tool.updateMatrixWorld(true);
      for(const part of toolParts[id].children)if(part.userData.softFiber){
        const positions=part.geometry.attributes.position;
        for(const bin of part.userData.fiberGroups){
          const point=new THREE.Vector3().fromBufferAttribute(positions,bin.indices[0]).applyMatrix4(part.matrixWorld);
          if(point.distanceTo(bounds.center)<=bounds.radius+bin.radius+.12)samples.push({point,radius:bin.radius+.12});
        }
      }
    }else{
      // The open jaw gap is the capture volume; liquid/suction only work at the outlet.
      for(const x of [-.25,0,.25])for(const y of [0,.25,.5]){
        if(id==='tweezers'){
          const start=new THREE.Vector3(-.8,y,x*.5).applyQuaternion(tool.quaternion).add(tool.position);
          probe.set(start,new THREE.Vector3(1,0,0).applyQuaternion(tool.quaternion));probe.far=1.6;
          const hit=probe.intersectObject(c.mesh)[0],skin=probe.intersectObject(wall)[0];
          if(hit&&(!skin||hit.distance<skin.distance+.035))return hit;
        }else samples.push({point:new THREE.Vector3(x,-.08,y*.4).applyQuaternion(tool.quaternion).add(tool.position),radius:id==='drops'?.65:.35});
      }
    }
    let closest=null,distance=Infinity;
    for(const {point,radius} of samples){
      const direction=bounds.center.clone().sub(point).normalize();
      // Start just outside the finite contact sphere, including contact when inside a thin shell.
      probe.set(point.clone().addScaledVector(direction,-radius),direction);probe.far=radius*2;
      const hit=probe.intersectObject(c.mesh)[0];if(!hit)continue;
      const skin=probe.intersectObject(wall)[0];if(skin&&skin.distance+.035<hit.distance)continue;
      const d=hit.point.distanceToSquared(tool.position);if(d<distance){closest=hit;distance=d;}
    }
    return closest;
  }
  function PickTool(id){
    scene.updateMatrixWorld(true);let nearest=null,nearestPoint=null,distance=Infinity;
    for(const c of chunks){
      if(!['attached','returning'].includes(c.state)||!c.coating&&c.depth>Reach(id)||c.fine&&id!=='feather'||!c.fine&&id==='feather')continue;
      const hit=ToolSurfaceHit(c,id);if(!hit||canal.Project(hit.point).depth>Reach(id))continue;
      const d=hit.point.distanceToSquared(tool.position);if(d<distance){nearest=c;nearestPoint=hit.point;distance=d;}
    }
    if(nearest?.coating)nearest.depth=canal.Project(nearestPoint).depth;
    return nearest;
  }
  function EnsureTool(id){
    if(!inside||entrance<1||transfer||showcase)return false;
    if(!tool.visible||lastToolId!==id){
      if(!tool.visible)contact.Reset();
      const point=parkedTool?.id===id?parkedTool.position.clone():canal.CenterAt(4).clone();
      manualRotation=parkedTool?.id===id?parkedTool.rotation.clone():null;
      ToolAt(point,id);
    }
    return tool.visible;
  }
  function StartToolDrag(x,y,id,axis='plane'){
    if(!EnsureTool(id))return false;
    const plane=new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()),tool.position);
    ray.setFromCamera(new THREE.Vector2(x/width*2-1,1-y/height*2),camera);
    const cursor=ray.ray.intersectPlane(plane,new THREE.Vector3());
    if(!cursor)return false;
    toolDrag={plane,offset:tool.position.clone().sub(cursor),cursor:cursor.clone(),y,axis,depth:0};return true;
  }
  function MoveToolDrag(x,y,id,c=null){
    if(!toolDrag)return null;
    ray.setFromCamera(new THREE.Vector2(x/width*2-1,1-y/height*2),camera);
    const cursor=ray.ray.intersectPlane(toolDrag.plane,new THREE.Vector3());
    const target=tool.position.clone(),forward=camera.getWorldDirection(new THREE.Vector3());
    if(toolDrag.axis==='depth')target.addScaledVector(forward,(toolDrag.y-y)*8/height);
    else if(cursor)target.add(cursor.clone().sub(toolDrag.cursor));
    target.addScaledVector(forward,toolDrag.depth);
    // Consume the input even when blocked: reversing must move immediately, without paying back overshoot.
    toolDrag.depth=0;toolDrag.y=y;if(cursor)toolDrag.cursor.copy(cursor);
    const pose=ToolAt(target,id,c);
    // Rebase at the visible depth, so screen displacement stays direct after advancing or wall contact.
    toolDrag.plane.setFromNormalAndCoplanarPoint(forward,pose.position);
    const rebased=ray.ray.intersectPlane(toolDrag.plane,new THREE.Vector3());
    if(rebased){toolDrag.cursor.copy(rebased);toolDrag.offset.copy(pose.position).sub(rebased);}
    return pose;
  }
  function AdvanceTool(amount,id){
    if(!EnsureTool(id))return null;
    return ToolAt(tool.position.clone().addScaledVector(camera.getWorldDirection(new THREE.Vector3()),Clamp(amount,-.6,.6)),id);
  }
  function Grip(c,x,y,id) {
    scene.updateMatrixWorld(true);
    ray.setFromCamera(new THREE.Vector2(x/width*2-1,1-y/height*2),camera);
    const manual=toolDragMode;
    if(manual&&!toolDrag)return false;
    let hit=manual?ToolSurfaceHit(c,id):ray.intersectObject(c.mesh)[0];
    if(manual&&!hit)return false;
    if(id==='scoop'&&scoopStroke&&(!hit||!ScoopTouches(hit.point)||hit.point.distanceTo(tool.position)>.95))hit=ScoopSurfaceHit(c);
    let point=hit?.point.clone()||c.mesh.position.clone().addScaledVector(c.normal,.35);
    if(c.coating){const projected=canal.Project(point);if(projected.depth>Reach(id))return false;c.depth=projected.depth;c.normal.copy(contact.Surface(point).normal);}
    if(id==='scoop'&&scoopStroke&&(!hit||!ScoopTouches(point)||point.distanceTo(tool.position)>.95))return false;
    if(id==='tweezers'&&!manual){
      const side=c.mesh.material.side;c.mesh.material.side=THREE.DoubleSide;
      const thicknessRay=new THREE.Raycaster(point.clone().addScaledVector(c.normal,c.size*2+.2),c.normal.clone().negate(),0,c.size*4+1);
      const surfaces=thicknessRay.intersectObject(c.mesh);c.mesh.material.side=side;
      if(surfaces.length>1)point.copy(surfaces[0].point).lerp(surfaces.at(-1).point,.5);
    }
    if(id==='feather')c.batch=[];
    GripPeelBody(c.body,point.toArray());c.toolId=id;c.gripRotation=null;
    c.scoopFace=hit?.face?[hit.face.a,hit.face.b,hit.face.c]:null;
    c.scoopSupportNormal=null;
    c.gripStart=point.clone();c.holdRotation=null;c.appliedAge=0;
    if(manual)ToolAt(tool.position.clone(),id,c);
    else if(id!=='scoop'||!scoopStroke)ToolAt(point,id,c);
    c.manualDrag=manual;c.toolOffset=point.clone().sub(tool.position);c.gripRotation=tool.quaternion.clone();
    if(id==='scoop'){
      // 鼠标按下时建立相机平面；碰撞修正的起点偏移只记录一次，不会产生自动拉力。
      c.dragPlane=toolDrag?.plane||scoopStroke?.plane||new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()),tool.position);
      const cursor=ray.ray.intersectPlane(c.dragPlane,new THREE.Vector3());
      c.cursorOffset=toolDrag?.offset||scoopStroke?.offset||tool.position.clone().sub(cursor||tool.position);
      c.scoopOffset=point.clone().sub(tool.position);c.lastScoopTarget=tool.position.clone();
    }
    const contactState=InstrumentContact(id,c.gripRotation.toArray(),id==='scoop'?ScoopNormal(c):c.normal.toArray(),{jawContact:c.jawContact,edgeContact:id==='scoop'?WaxEdgeContact(c.body,point.toArray()):null});
    c.aligned=contactState.aligned;c.grasped=id==='tweezers'&&contactState.aligned;c.forceDirection=new THREE.Vector3().fromArray(contactState.direction);
    c.pullLocal=c.forceDirection.clone().applyQuaternion(c.rotation.clone().invert());

    if(id!=='scoop'&&!manual)ShowTool(c,id);
    return true;
  }
  function Drag(c,x,y,dt,efficiency) {
    ray.setFromCamera(new THREE.Vector2(x/width*2-1,1-y/height*2),camera);
    if(!c.body.detached&&c.toolId!=='scoop'){
      // 已形成双侧夹持后由抓点保持，变形中的表面射线不应把镊子误判为松夹。
      const contactState=InstrumentContact(c.toolId,tool.quaternion.toArray(),c.normal.toArray(),{jawContact:c.grasped});
      c.aligned=contactState.aligned;c.forceDirection.fromArray(contactState.direction);
      c.pullLocal.copy(c.forceDirection).applyQuaternion(c.rotation.clone().invert());
    }
    c.appliedAge+=dt;
    const pressure=Smooth(Clamp((c.appliedAge-.08)/(c.body.gel?1.6:.72)));
    const travel=(c.coating?4.8:c.body.gel?3.4:c.toolId==='feather'?.7:Math.max(2.15,1.4+Math.max(...(c.footprint||[c.size]))))*pressure;
    const cursor=c.toolId==='scoop'&&!c.manualDrag?ray.ray.intersectPlane(c.dragPlane,new THREE.Vector3()):null;
    const target=c.toolId==='scoop'?(cursor?cursor.add(c.cursorOffset):c.lastScoopTarget.clone()):c.gripStart.clone().addScaledVector(c.forceDirection,c.aligned?travel:0);
    if(!c.manualDrag&&c.toolId==='suction'&&c.fragment&&c.softened>.45)target.addScaledVector(c.normal,.85);

    const previousTool=tool.position.clone();
    const pose=c.manualDrag?MoveToolDrag(x,y,c.toolId,c):ToolAt(target,c.toolId,c);target.copy(pose.position);
    const toolMotion=target.clone().sub(previousTool),surfaceNormal=new THREE.Vector3().fromArray(c.toolId==='scoop'?ScoopNormal(c):c.normal.toArray()).normalize();
    const scrapeSpeed=toolMotion.clone().addScaledVector(surfaceNormal,-toolMotion.dot(surfaceNormal)).length()/Math.max(dt,1e-6);
    if(c.toolId==='scoop'){
      const motion=target.clone().sub(c.lastScoopTarget);c.lastScoopTarget.copy(target);
      if(motion.lengthSq()>1e-10)c.forceDirection.copy(motion).normalize();
      // 勺碗仅在有限工作区接触材料；越过勺沿或朝向错误会滑脱，不能成为无限长的抓取弹簧。
      const grip=GetGripPoint(c.body),edgeContact=WaxEdgeContact(c.body,grip);
      const contactState=InstrumentContact('scoop',tool.quaternion.toArray(),surfaceNormal.toArray(),{edgeContact,motion:motion.toArray()});
      c.scoopContact=ScoopTouches(new THREE.Vector3().fromArray(grip))&&c.scoopOffset.length()<.95&&contactState.loading;
      c.aligned=contactState.aligned;c.scoopEdgeContact=edgeContact;
      if(!c.body.detached&&c.aligned)c.scoopSupportNormal=surfaceNormal.toArray();
      target.add(c.scoopOffset);
    }
    if(c.manualDrag&&c.toolId!=='scoop')target.add(c.toolOffset);
    if(c.body.detached&&!c.holdRotation)c.holdRotation=['scoop','brush'].includes(c.toolId)?FlatRotation.toArray():c.body.rotation.slice();
    const anchors=c.body.anchors.filter(a=>a.alive).length;
    const hard=c.type==='impacted'&&!c.fragment;
    const adhesion=c.body.gel?1:c.fine?.035:c.fragment?(c.inheritedAdhesion||1):hard?1+24*(1-c.softened)**3:c.type==='wet'?5:2.2;
    const minAnchors=(c.toolId==='scoop'&&c.type!=='dry'&&c.type!=='oily'&&!c.fragment)?2:0;
    const supported=c.fine?c.toolId==='feather'&&IsFeatherDebris(c):c.toolId==='feather'?false:c.toolId==='brush'?c.fragment:c.toolId==='suction'?c.fragment&&c.softened>.45:true;
    c.adhesion=adhesion;
    const touching=c.toolId==='scoop'?c.scoopContact:!c.manualDrag||c.toolId==='tweezers'||!!ToolSurfaceHit(c,c.toolId);
    const result=StepPeelBody(c.body,{target:c.aligned&&touching?target.toArray():null,softness:c.softened,efficiency:efficiency*(supported?1:.03),adhesion,minAnchors:supported&&c.aligned&&touching?minAnchors:c.body.anchors.length,supportRotation:c.holdRotation,fracture:supported&&c.aligned&&touching&&c.generation<3},dt);
    result.slipped=(c.toolId==='scoop'||c.manualDrag)&&!touching;
    result.wrongDirection=!c.aligned;
    result.needsForceps=c.toolId==='scoop'&&minAnchors>0&&result.remaining===2;
    result.wrongTool=!supported;
    result.scrapeSpeed=touching&&c.aligned?scrapeSpeed:0;
    c.tear=c.body.surface?.cohesion?.damage||0;
    result.pain=(result.force>42&&result.remaining>0&&(hard&&c.softened<.6||!c.body.gel&&result.contact))?Clamp(result.force/100):0;

    result.contact=result.contact||pose.contact;
    if(result.pain>0&&c.softened<.6)c.irritation=Clamp(c.irritation+dt*result.pain*.8);
    if(result.remaining<anchors&&c.softened<.6)c.irritation=Clamp(c.irritation+.075*(1-c.softened));
    // 拿起后也不能穿过对侧管壁。中心点始终限制在真实管腔的安全半径内。
    const pos=new THREE.Vector3().fromArray(c.body.position), projected=canal.Project(pos);
    if(projected.depth>0 && projected.depth<canal.length) {
      const center=canal.CenterAt(projected.depth).clone();
      const radial=pos.clone().sub(center), limit=canal.RadiusAt(projected.depth,projected.angle)-c.size*.7;
      if(radial.length()>limit && c.body.detached) {
        MovePeelBody(c.body,center.add(radial.setLength(limit)).toArray());result.contact=true;
      }
    }
    SyncBody(c);Deform(c);
    if(c.toolId!=='scoop'&&!c.manualDrag)ShowTool(c,c.toolId);
    if(result.biteReady){result.bite=TakeOilBite(c);result.detached=!!result.bite;result.remaining=0;}
    return result;
  }
  function SetOilGeometry(c){
    const render=c.body.gel.render,geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(render.positions,3));geometry.setIndex(new THREE.BufferAttribute(render.indices,1));geometry.setAttribute('gelRest',new THREE.BufferAttribute(render.rest,3));geometry.setAttribute('gelThickness',new THREE.BufferAttribute(render.thickness,1));
    const uv=new Float32Array(render.rest.length/3*2);for(let i=0;i<uv.length/2;i++){uv[i*2]=render.rest[i*3]/3+.5;uv[i*2+1]=render.rest[i*3+1]/3+.5;}geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();c.mesh.geometry.dispose();c.mesh.geometry=geometry;c.original=render.positions.slice();c.gripNode=0;SyncBody(c);
  }
  function TakeOilBite(c){
    const parts=SplitSlimeBite(c.body);if(!parts)return null;
    const material=materials.Wax('oily',c.tone);material.envMap=c.mesh.material.envMap;material.envMapIntensity=c.mesh.material.envMapIntensity;
    const mesh=new THREE.Mesh(new THREE.BufferGeometry(),material);mesh.receiveShadow=true;
    const bite={...c,id:String(c.id)+'.bite'+(c.biteSerial=(c.biteSerial||0)+1),body:parts.bite,mesh,mark:c.mark.clone(),mass:parts.bite.cleanMass,form:'oilyBite',fragment:true,generation:0,state:'held',grasped:c.grasped,gripNode:0,normal:c.normal.clone(),origin:new THREE.Vector3().fromArray(parts.bite.origin),rotation:new THREE.Quaternion().fromArray(parts.bite.rotation),trayStored:false,slot:-1,progress:1};
    bite.mark.geometry=c.mark.geometry.clone();bite.mark.material=c.mark.material.clone();SetOilGeometry(bite);const extent=mesh.geometry.boundingBox.getSize(new THREE.Vector3());bite.size=Math.max(.10,Math.cbrt(parts.bite.gel.volume)*.5);bite.footprint=[Math.max(.2,extent.x*.5),Math.max(.2,extent.y*.5)];mesh.userData.chunk=bite;root.add(mesh);chunks.push(bite);
    if(parts.remainder){c.body=parts.remainder;c.mass=parts.remainder.cleanMass;c.state='returning';SetOilGeometry(c);}
    else{Ungrip(c);c.mass=0;c.state='exhausted';c.mesh.visible=false;}
    return bite;
  }
  function Deform(c) {
    if(!c.body.surface&&!c.body.gel)return;
    const geometry=c.mesh.geometry;
    WritePeelSurface(c.body,geometry.attributes.position.array);
    geometry.attributes.position.needsUpdate=true;
    if(c.body.gel){geometry.attributes.gelThickness.needsUpdate=true;geometry.computeVertexNormals();}else SmoothWaxNormals(geometry);
    geometry.computeBoundingBox();geometry.computeBoundingSphere();
  }
  function Fracture(c){
    const section=c.body.surface?.fracture;if(!section)return [];
    const inverse=c.mesh.quaternion.clone().invert();
    const cutNormal=new THREE.Vector3().fromArray(section.normal).applyQuaternion(inverse).normalize();
    const cutPoint=c.mesh.worldToLocal(new THREE.Vector3().fromArray(section.point)),constant=cutPoint.dot(cutNormal);
    const pieces=FractureGeometry(c.mesh.geometry,{normal:cutNormal.toArray(),point:cutPoint.toArray()});
    if(pieces.length<2){c.body.surface.fracture=null;return [];}
    const volumes=pieces.map(GeometryVolume),totalVolume=volumes.reduce((a,b)=>a+b,0);
    if(volumes.some(v=>v<totalVolume*.025)||pieces.some(g=>g.attributes.position.count<12)){
      pieces.forEach(g=>g.dispose());c.body.surface.fracture=null;return [];
    }
    // 在同一个形变截面分配原来的锚点，不给每个子块凭空补满黏附。
    const inherited=c.body.anchors.map(a=>({...a,rest:a.rest.slice(),world:PeelAnchorPoint(c.body,a).slice()}));
    const velocity=c.body.velocity.slice(),spin=c.body.spin.slice(),worldPosition=c.mesh.position.clone(),worldRotation=c.mesh.quaternion.clone();
    c.state='fractured';c.mesh.visible=false;Ungrip(c);
    return pieces.map((geometry,i)=>{
      const centroid=geometry.boundingBox.getCenter(new THREE.Vector3()),extent=geometry.boundingBox.getSize(new THREE.Vector3());
      const anchors=inherited.filter(a=>(new THREE.Vector3().fromArray(a.world).sub(worldPosition).applyQuaternion(inverse).dot(cutNormal)>=constant)===(i===1));
      geometry.translate(-centroid.x,-centroid.y,-centroid.z);
      const mesh=new THREE.Mesh(geometry,materials.Wax(c.type,c.tone));
      mesh.position.copy(centroid.clone().applyQuaternion(worldRotation).add(worldPosition));mesh.quaternion.copy(worldRotation);
      mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);
      const fragment={...c,id:String(c.id)+'.'+i,mesh,mark:c.mark.clone(),state:'returning',tear:0,stress:0,progress:0,
        origin:mesh.position.clone(),rotation:mesh.quaternion.clone(),original:geometry.attributes.position.array.slice(),size:Math.max(.045,Math.sqrt(extent.x*extent.y)*.52),
        normal:c.normal.clone(),footprint:[extent.x*.5,extent.y*.5],fragment:true,generation:c.generation+1,fine:false,form:'fragment',grainCount:1,
        cutDirection:cutNormal.toArray(),mass:c.mass*volumes[i]/totalVolume,inheritedAdhesion:c.adhesion||c.inheritedAdhesion||1,slot:-1,gripRotation:null,grasped:false};
      fragment.fine=IsFeatherDebris(fragment);
      fragment.body=CreatePeelBody({position:mesh.position.toArray(),rotation:mesh.quaternion.toArray(),normal:c.normal.toArray(),size:fragment.size,type:c.type,anchorCount:0});
      fragment.body.anchors=anchors.map(a=>({...a,inherited:true,local:new THREE.Vector3().fromArray(a.world).sub(mesh.position).applyQuaternion(inverse).toArray()}));
      if(!fragment.fine){
        BindPeelSurface(fragment.body,geometry.attributes.position.array,geometry.index.array);
        fragment.body.anchors.forEach((a,j)=>{a.rest=anchors[j].rest.slice();});
        // 保留母体各处的速度场，切口两侧从同一张实际表面连续分开。
        const source=c.body.surface;
        fragment.body.surface.points.forEach((point,j)=>{
          let nearest=0,distance=Infinity;
          source.points.forEach((v,k)=>{const d=v.reduce((sum,x,axis)=>sum+(x-point[axis])**2,0);if(d<distance){nearest=k;distance=d;}});
          fragment.body.surface.velocities[j]=source.velocities[nearest].slice();
          const lift=Math.max(0,source.points[nearest].reduce((sum,v,k)=>sum+(v-source.support[nearest][k])*c.body.normal[k],0));
          fragment.body.surface.support[j]=point.map((v,k)=>v-c.body.normal[k]*lift);
        });
      }
      fragment.body.detached=fragment.body.anchors.every(a=>!a.alive);fragment.body.velocity=velocity.slice();fragment.body.spin=spin.slice();
      if(fragment.body.detached){fragment.state='settling';fragment.settleAge=0;fragment.settleVelocity=new THREE.Vector3().fromArray(velocity);}
      mesh.userData.chunk=fragment;chunks.push(fragment);return fragment;
    });
  }
  function FiberMaterial(feather=false){
    const m=new THREE.MeshPhysicalMaterial({color:feather?0xc2bba9:0xe5e3d8,roughness:feather?.86:.65,metalness:0,sheen:feather?.3:1,sheenColor:feather?0xe1dacc:0xf4f2e6,sheenRoughness:.58,side:THREE.DoubleSide});
    m.onBeforeCompile=shader=>{if(feather)shader.vertexShader='attribute vec3 featherTangent;\n'+shader.vertexShader;shader.uniforms.fiberTime=hairUniforms.time;shader.uniforms.fiberLamp={value:lamp.position};shader.uniforms.fiberTouch={get value(){return tool.visible&&lastToolPoint?lastToolPoint:new THREE.Vector3(999,999,999)}};shader.vertexShader='varying vec3 fiberAxis;varying vec3 fiberWorld;uniform float fiberTime;uniform vec3 fiberTouch;\n'+shader.vertexShader;
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
      if(feather){
        shader.vertexShader=shader.vertexShader.replace('vec3(position.x*.22,1.0,position.z*.22)','featherTangent');
        shader.fragmentShader=shader.fragmentShader.replace('lobe*.15+secondary*.08','lobe*.035+secondary*.035').replace('diffuseColor.rgb*.10','diffuseColor.rgb*.025');
      }
    };m.customProgramCacheKey=()=> feather?'FeatherCombedFiberV2':'FeatherDualLobeFiber';return m;
  }
  function ExtendForceps(part){
    const geometry=part.geometry;if(geometry.userData.deepForceps)return;
    const p=geometry.attributes.position,grip=(part.userData.originalName||part.name).startsWith('Model_ForcepsGrip');
    for(let i=0;i<p.count;i++)p.setY(i,p.getY(i)+(grip?6.3:Math.max(0,p.getY(i)-3)/14*6.3));
    p.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();geometry.userData={...geometry.userData,deepForceps:true};
  }
  function StyleTool(group,id,level,skin,reflection=metalEnvironment.texture){
    const edition=level<2?'Basic':level<4?'Refined':'Master';
    for(const part of group.children){
      ClearFeatherFur(part);
      part.userData.originalName??=part.name;
      const source=asset.scene.getObjectByName(part.userData.originalName+'_'+edition);
      if(source){const variant=Baked(source.name);part.geometry.dispose();for(const m of (Array.isArray(part.material)?part.material:[part.material]))m.dispose();part.geometry=variant.geometry;part.material=variant.material;}
      if(id==='tweezers')ExtendForceps(part);
      if(id==='feather'&&part.userData.originalName==='Model_FeatherTuft'){const spread=1+(level-1)*.32;part.geometry.scale(spread,1,spread);PrepareFeatherStrands(part.geometry);}
      if(['Model_FeatherTuft','Model_Brush'].includes(part.userData.originalName)){for(const m of (Array.isArray(part.material)?part.material:[part.material]))m.dispose();part.material=FiberMaterial(id==='feather');part.userData.softFiber=true;part.userData.fiberRest=part.geometry.attributes.position.array.slice();
        const groups=new Map(),rest=part.userData.fiberRest;
        if(id==='feather'){
          for(const indices of part.geometry.userData.featherRings){const bin={center:new THREE.Vector3(),indices,radius:0};for(const i of indices)bin.center.add(new THREE.Vector3(rest[i*3],rest[i*3+1],rest[i*3+2]));groups.set(groups.size,bin);}
        }else for(let i=0;i<rest.length/3;i++){const v=new THREE.Vector3(rest[i*3],rest[i*3+1],rest[i*3+2]),key=[v.x,v.y,v.z].map(x=>Math.floor(x/.028)).join(',');if(!groups.has(key))groups.set(key,{center:new THREE.Vector3(),indices:[],radius:0});const bin=groups.get(key);bin.center.add(v);bin.indices.push(i);}
        for(const bin of groups.values()){bin.center.divideScalar(bin.indices.length);for(const i of bin.indices)bin.radius=Math.max(bin.radius,bin.center.distanceTo(new THREE.Vector3(rest[i*3],rest[i*3+1],rest[i*3+2])));}
        part.userData.fiberGroups=[...groups.values()];part.userData.fiberPose=null;
        if(id==='feather')AddFeatherFur(part,()=>FiberMaterial(true),[toolClip]);}
      for(const m of (Array.isArray(part.material)?part.material:[part.material])){
        materials.GripMaterial(m,skin,level);if(/ToolLiquid/.test(m.name)){m.transparent=false;m.opacity=1;m.transmission=.72;m.thickness=.12;m.depthWrite=true;m.roughness=.075;m.ior=1.33;m.attenuationColor.set(0xc9dbc1);m.attenuationDistance=1.8;}if(/ToolGlass/.test(m.name)){m.transparent=false;m.opacity=1;m.transmission=.96;m.thickness=.065;m.depthWrite=true;m.roughness=.055;m.clearcoat=.2;m.ior=1.47;m.color.set(0xf3fafb);}m.clippingPlanes=[toolClip];if(!m.userData.instrumentMetal&&!/ToolGlass|ToolLiquid/.test(m.name))m.roughness=Math.max(.12,m.roughness-(level%2===1&&level>1?.08:0));
        if(m.userData.instrumentMetal){
          m.envMap=reflection;m.envMapIntensity=reflection===metalEnvironment.texture?metalIntensity:.8;
          if(reflection===metalEnvironment.texture){metalMaterials.add(m);m.addEventListener('dispose',()=>metalMaterials.delete(m));}
        }
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
    const stage=new THREE.Scene(),cam=new THREE.PerspectiveCamera(34,(canvas.clientWidth||500)/(canvas.clientHeight||300),.1,150);cam.position.set(1,id==='tweezers'?13:10,id==='tweezers'?47:38);cam.lookAt(0,id==='tweezers'?13:10,0);
    // 渲染目标不能跨 WebGL 上下文复用；预览在自己的 renderer 烘焙相同的金属反射。
    const previewEnvironment=BakeEnvironment(renderer),previewMetalEnvironment=BakeEnvironment(renderer,true);stage.environment=previewEnvironment.texture;stage.environmentIntensity=.9;stage.background=null;stage.add(new THREE.HemisphereLight(0xffffff,0x504a40,2.2));
    for(const [x,z,intensity] of [[-8,12,1.8],[10,-5,1.2]]){const light=new THREE.DirectionalLight(0xffffff,intensity);light.position.set(x,18,z);stage.add(light);}
    const models=[level,next].map((n,i)=>{const group=toolParts[id].clone(true);group.visible=true;group.children.forEach(p=>{ClearFeatherFur(p,false);p.geometry=p.geometry.clone();p.material=Array.isArray(p.material)?p.material.map(m=>m.clone()):p.material.clone();p.rotation.set(0,0,0);});StyleTool(group,id,n,skin,previewMetalEnvironment.texture);group.traverse(p=>{if(p.material)for(const m of (Array.isArray(p.material)?p.material:[p.material]))m.clippingPlanes=[];});group.children.forEach(p=>p.position.set(0,0,0));group.position.x=i?4:-4;group.rotation.x=.12;group.rotation.y=-.35;stage.add(group);return group;});
    const render=()=>{renderer.render(stage,cam);previewTriangles=renderer.info.render.triangles;};render();let px=null;
    canvas.onpointerdown=e=>{px=e.clientX;canvas.setPointerCapture(e.pointerId);};canvas.onpointermove=e=>{if(px==null)return;models.forEach(m=>m.rotation.y+=(e.clientX-px)*.015);px=e.clientX;render();};canvas.onpointerup=canvas.onpointercancel=()=>px=null;
    return{SetView(mode){const y=mode==='tip'?(id==='feather'?1.3:.65):mode==='grip'?(id==='drops'?6.2:id==='tweezers'?23:16.7):id==='drops'?4.5:id==='tweezers'?13:10;const z=mode==='full'?(id==='drops'?21:id==='tweezers'?47:38):id==='feather'&&mode==='tip'?13:7;models.forEach((m,i)=>m.position.x=(i?1:-1)*(mode==='full'?4:id==='feather'&&mode==='tip'?2.5:1.25));cam.position.set(1,y+(mode==='tip'?1:0),z);cam.lookAt(0,y,0);render();},Dispose(){previewTriangles=0;previewEnvironment.dispose();previewMetalEnvironment.dispose();renderer.dispose();renderer.forceContextLoss();models.forEach(g=>g.traverse(p=>{p.geometry?.dispose();if(p.material)for(const m of (Array.isArray(p.material)?p.material:[p.material]))m.dispose();}));}};
  }
  function Ungrip(c) { UngripPeelBody(c.body);c.gripRotation=null;c.grasped=false; }
  const fiberTipSamples=[];for(let y=0;y<3;y+=.15)fiberTipSamples.push(new THREE.Vector3(0,y,0));
  function Slip(c){
    Ungrip(c);
    if(c.body.detached){c.state='settling';c.settleAge=0;c.settleVelocity=new THREE.Vector3().fromArray(c.body.velocity);}
    else c.state='returning';
  }
  function ToolAt(point,id,c=null,opening=0) {
    reachBlocked=false;
    if(inside&&!transfer){const projected=canal.Project(point);if(projected.depth>Reach(id)){const originalCenter=canal.CenterAt(projected.depth).clone();point=point.clone().sub(originalCenter).add(canal.CenterAt(Reach(id)).clone());reachBlocked=true;}}
    tool.visible=true;tool.position.copy(point);
    // 耳勺保存玩家的握持朝向，贴壁、换目标和镜头移动只修正位置。
    if(id==='tweezers'&&transfer?.toolRotation){
      // 尖端离开耳道后再转腕；固定外景握持角，避免镊身始终指向镜头而透视缩成小点。
      tool.quaternion.copy(transfer.toolRotation).slerp(transfer.outsideToolRotation,Smooth((-point.z-3)/10));
    }else if(toolDragMode&&manualRotation&&!transfer)tool.quaternion.copy(manualRotation);
    else if(id==='scoop'&&scoopRotation)tool.quaternion.copy(scoopRotation);
    else{
      const shaftAxis=camera.position.clone().addScaledVector(right,1.15).addScaledVector(up,-1.7).sub(point).normalize();
      const faceNormal=c?.coating&&!c.body.detached?c.normal:c ? new THREE.Vector3(0,0,1).applyQuaternion(c.body?.detached?c.mesh.quaternion:c.rotation) : toward;
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
      const hinge=23.3,angle=sign*(gap+opening-.08)/hinge;
      jaw.rotation.z=angle;
      jaw.position.set(Math.sin(angle)*hinge,hinge-Math.cos(angle)*hinge,0);
    });
    if(lastToolId!==id){contact.Reset();lastToolId=id;}
    const samples=contact.Samples(toolParts[id],['feather','brush'].includes(id)?fiberTipSamples:null);
    const pose=contact.Solve(point,tool.quaternion,samples,{sweep:!transfer,lockPivot:!!turnPoint});tool.position.copy(pose.position);tool.quaternion.copy(pose.rotation);
    if(id==='scoop'&&!transfer)scoopRotation.copy(pose.rotation);
    if(toolDragMode&&!transfer){manualRotation=pose.rotation.clone();parkedTool={id,position:pose.position.clone(),rotation:pose.rotation.clone()};}
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
          const clearance=.058+bin.radius*1.18+(id==='feather'?FEATHER_FUR_LENGTH:0);
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
  function HideTool() { tool.visible = ring.visible = false; }
  function StartScoopStroke(x,y){
    Hover(x,y,'scoop');if(!tool.visible)return;
    const plane=new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()),tool.position);
    ray.setFromCamera(new THREE.Vector2(x/width*2-1,1-y/height*2),camera);
    const cursor=ray.ray.intersectPlane(plane,new THREE.Vector3());
    scoopStroke={plane,offset:tool.position.clone().sub(cursor||tool.position)};
  }
  function MoveScoopStroke(x,y){
    if(!scoopStroke){StartScoopStroke(x,y);return;}
    ray.setFromCamera(new THREE.Vector2(x/width*2-1,1-y/height*2),camera);
    const cursor=ray.ray.intersectPlane(scoopStroke.plane,new THREE.Vector3());
    if(cursor)ToolAt(cursor.add(scoopStroke.offset),'scoop');
  }
  function SweepFeather(previousRotation) {
    if(!featherSweep||transfer)return;
    const angle=previousRotation.angleTo(tool.quaternion);
    if(angle<.001)return;
    featherSweep.angle+=angle;
    tool.updateMatrixWorld(true);
    // The same deformed fiber clusters used for wall contact define the pickup area.
    const part=toolParts.feather.children.find(p=>p.userData.softFiber);
    const positions=part.geometry.attributes.position,local=new THREE.Vector3(),fiber=new THREE.Vector3();
    const inverse=part.matrixWorld.clone().invert(),capacity=FeatherCapacity(toolLevels.feather);
    if(featherSweep.angle>.055&&featherSweep.items.length<capacity){
      const candidates=chunks.filter(c=>IsFeatherDebris(c)&&['attached','returning'].includes(c.state)&&c.depth<=Reach('feather'));
      candidates.sort((a,b)=>a.mesh.position.distanceToSquared(tool.position)-b.mesh.position.distanceToSquared(tool.position));
      for(const c of candidates){
        if(featherSweep.items.length>=capacity)break;
        local.copy(c.mesh.position).applyMatrix4(inverse);
        const radius=Math.min(.30,Math.max(...c.footprint)*.6)+FEATHER_FUR_LENGTH;
        const touched=part.userData.fiberGroups.some(bin=>{
          fiber.fromBufferAttribute(positions,bin.indices[0]);
          return fiber.distanceToSquared(local)<(radius+bin.radius+.035)**2;
        });
        if(!touched)continue;
        GripPeelBody(c.body,c.mesh.position.toArray());
        c.body.anchors.forEach(a=>a.alive=false);c.body.detached=true;c.state='held';c.toolId='feather';c.batch=[];
        c.featherOffset=c.mesh.position.clone().applyMatrix4(tool.matrixWorld.clone().invert());
        c.featherRotation=tool.quaternion.clone().invert().multiply(c.mesh.quaternion);
        featherSweep.items.push(c);
      }
    }
    for(const c of featherSweep.items){
      c.mesh.position.copy(c.featherOffset).applyMatrix4(tool.matrixWorld);
      const wallContact=contact.Surface(c.mesh.position);if(wallContact.clearance<.10)c.mesh.position.addScaledVector(wallContact.normal,.10-wallContact.clearance);
      c.mesh.quaternion.copy(tool.quaternion).multiply(c.featherRotation);
      c.body.position=c.mesh.position.toArray();c.body.rotation=c.mesh.quaternion.toArray();
    }
  }
  function EndFeatherSweep(){
    const items=featherSweep?.items||[];featherSweep=null;
    if(items.length){const [parent,...batch]=items;parent.batch=batch;Release(parent);}
  }
  function TrayBounds(){const b=new THREE.Box3().setFromObject(tray),points=[];for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z])points.push(Project(new THREE.Vector3(x,y,z)));return{x:Math.min(...points.map(p=>p.x)),y:Math.min(...points.map(p=>p.y)),right:Math.max(...points.map(p=>p.x)),bottom:Math.max(...points.map(p=>p.y)),visible:tray.visible};}
  function TrayPosition(c) {
    const slot=c.slot<0?0:c.slot,angle=slot*2.39996323,radius=1.1+Math.sqrt(slot%90)*.8;
    return tray.position.clone().add(new THREE.Vector3(Math.cos(angle)*radius,.10+(c.bottomOffset||0)+Math.floor(slot/90)*.18,Math.sin(angle)*radius*.7));
  }
  function Release(c,slot) {
    if(c.toolId==='feather'){
      if(!IsFeatherDebris(c))return;
      c.batch??=[];
      c.batch.forEach(other=>{other.state='carrying';other.toolId='feather';other.batchOffset=other.mesh.position.clone().sub(c.mesh.position).applyQuaternion(c.mesh.quaternion.clone().invert());});
    }
    c.state='carrying';if(c.body.gel)c.body.gel.collider=null;c.slot=traySlot++;for(const child of c.batch||[]){child.slot=traySlot++;child.mesh.geometry.computeBoundingBox();child.bottomOffset=-child.mesh.geometry.boundingBox.min.z;}c.mesh.geometry.computeBoundingBox();c.bottomOffset=-c.mesh.geometry.boundingBox.min.z;
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
    transfer={chunk:c,age:0};
    if(c.toolId==='tweezers'){
      const outward=trayCamera.clone().sub(trayFocus).normalize();
      const lateral=new THREE.Vector3(0,1,0).cross(outward).normalize();
      const vertical=outward.clone().cross(lateral).normalize();
      const shaft=lateral.multiplyScalar(.75).addScaledVector(vertical,.55).addScaledVector(outward,.35).normalize();
      const jawAxis=shaft.clone().cross(outward).normalize();
      transfer.toolRotation=tool.quaternion.clone();
      transfer.outsideToolRotation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(jawAxis,shaft,jawAxis.clone().cross(shaft).normalize()));
    }
  }
  function EndService(){if(transfer){const c=transfer.chunk;c.state=c.trayStored?'collected':'attached';c.mesh.position.copy(c.origin);c.mesh.quaternion.copy(c.rotation);for(const child of c.batch||[]){child.state=child.trayStored?'collected':'attached';child.mesh.position.copy(child.origin);child.mesh.quaternion.copy(child.rotation);}transfer=null;}for(const c of chunks)if(c.state==='held'||c.state==='peeling'){Ungrip(c);c.state='attached';}HideTool();}
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
        c.settleAge+=dt;c.settleVelocity.y-=9.8*dt;c.settleVelocity.multiplyScalar(Math.exp(-dt*2));
        const desired=c.mesh.position.clone().addScaledVector(c.settleVelocity,dt),vertices=c.mesh.geometry.attributes.position;
        let hitWall=false;
        for(let pass=0;pass<3;pass++){
          let penetration=0,normal=null;
          for(let j=0;j<vertices.count;j+=3){const point=new THREE.Vector3().fromBufferAttribute(vertices,j).applyQuaternion(c.mesh.quaternion).add(desired),hit=contact.Surface(point);if(.018-hit.clearance>penetration){penetration=.018-hit.clearance;normal=hit.normal.clone();}}
          if(!normal)break;desired.addScaledVector(normal,penetration);const into=c.settleVelocity.dot(normal);
          if(into<0)c.settleVelocity.addScaledVector(normal,-into*1.12);c.settleVelocity.multiplyScalar(Math.exp(-dt*18));hitWall=true;
        }
        MovePeelBody(c.body,desired.toArray());c.mesh.position.copy(desired);c.origin.copy(desired);
        if((hitWall&&c.settleAge>.25&&c.settleVelocity.length()<.25)||c.settleAge>3){c.state='attached';c.settleVelocity.set(0,0,0);}
      }
      if(c.state==='returning'||c.body.gel&&c.state==='attached'&&(c.body.gel.awake>0||c.body.motion>.035)) {
        StepPeelBody(c.body,{softness:c.softened,adhesion:c.adhesion||c.inheritedAdhesion||1},dt);SyncBody(c);Deform(c);
        if(Math.hypot(...c.body.velocity)<.02&&Math.hypot(...c.body.spin)<.04&&(c.body.motion||0)<.035) c.state='attached';
      }
    }
    materials.Update(chunks,lamp);
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
        if(c.body.gel){PoseSlimeVolume(c.body,c.mesh.position.toArray(),c.mesh.quaternion.toArray());StepSlimeVolume(c.body,{gravity:[0,-2.5,0]},dt);SyncBody(c);Deform(c);}
        else{c.body.position=c.mesh.position.toArray();c.body.rotation=c.mesh.quaternion.toArray();}
        ToolAt(new THREE.Vector3().fromArray(GetGripPoint(c.body)),c.toolId,c);
      } else {
        if(c.state==='carrying') {c.state='dropping';Ungrip(c);}
        const floor=TrayPosition(c).y;
        if(c.state==='dropping') {
          c.dropVelocity-=36*dt;c.mesh.position.y+=c.dropVelocity*dt;
          if(c.mesh.position.y<=floor) {
            c.mesh.position.y=floor;c.dropVelocity=Math.abs(c.dropVelocity)*(c.body.gel?.025:.22);c.bounces++;
            if(c.body.gel){PoseSlimeVolume(c.body,c.mesh.position.toArray(),c.mesh.quaternion.toArray());for(const v of c.body.gel.velocities)v[1]-=1.5;c.body.gel.awake=2.5;}
            if(c.bounces===1)landed.push(c);
            if(c.bounces>2||c.dropVelocity<.18)c.state='collected';
          }
        }
        if(c.body.gel&&c.bounces&&!c.trayStored){StepSlimeVolume(c.body,{gravity:[0,-8,0],floor:tray.position.y+.045},dt);SyncBody(c);Deform(c);}
        const away=Smooth((age-1.5)/.65);
        ToolAt(c.path.getPoint(1).add(new THREE.Vector3(away*2,away*2,-away*3)),c.toolId,c,away*.5);
        if(c.toolId==='scoop')tool.rotateY(away*.65);
        tool.visible=age<2.3;
      }
      if(age>=3.4) { c.state='collected';if(!c.body.gel)c.mesh.position.copy(TrayPosition(c));transfer=null;HideTool(); }
    }
    if(transfer?.chunk.batch){const parent=transfer.chunk;for(const child of parent.batch){child.mesh.visible=!child.trayStored;child.mesh.position.copy(parent.mesh.position).add(child.batchOffset.clone().applyQuaternion(parent.mesh.quaternion));child.mesh.quaternion.copy(parent.mesh.quaternion);if(parent.state==='collected')child.state='collected';}}
    for(const parent of [...landed])if(parent.batch)for(const child of parent.batch){child.state='collected';landed.push(child);}
    for(const c of landed){collectionTray.Add(c,TrayPosition(c).sub(tray.position));if(c.trayStored)c.mesh.visible=false;}
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
    if(!c.fragment&&!c.coating||!['attached','returning'].includes(c.state))return VisualCenter(c);
    scene.updateMatrixWorld(true);const p=c.mesh.geometry.attributes.position,idx=c.mesh.geometry.index,candidates=[VisualCenter(c)];
    const stride=Math.max(3,Math.floor((idx?.count||p.count)/60/3)*3);
    for(let i=0;i<(idx?.count||p.count)-2;i+=stride){const v=new THREE.Vector3();for(let j=0;j<3;j++)v.add(new THREE.Vector3().fromBufferAttribute(p,idx?idx.getX(i+j):i+j));candidates.push(v.multiplyScalar(1/3).applyMatrix4(c.mesh.matrixWorld));}
    // 鼠标事件会把 clientX/Y 截成整数；极薄碎片的诊断触点也必须在该像素仍然可见。
    const pickable=chunks.filter(c=>c.state==='attached'||c.state==='returning').map(c=>c.mesh);
    for(const point of candidates){const screen=Project(point);if(screen.z<=-1||screen.z>=1||screen.x<0||screen.x>width||screen.y<0||screen.y>height)continue;let visible=true;
      for(const [x,y] of [[screen.x,screen.y],[Math.floor(screen.x),Math.floor(screen.y)]]){ray.setFromCamera(new THREE.Vector2(x/width*2-1,1-y/height*2),camera);const hit=ray.intersectObjects(pickable)[0],skin=ray.intersectObject(wall)[0];if(hit?.object!==c.mesh||(skin&&hit.distance>=skin.distance+.035)){visible=false;break;}}
      if(visible)return point;
    }
    return VisualCenter(c);
  }
  function Targets() { return chunks.map(c=>({id:c.id,type:c.type,depth:c.depth,mass:c.mass,form:c.form,tone:c.tone,generation:c.generation,fine:c.fine,grainCount:c.grainCount||1,cutDirection:c.cutDirection,forceDirection:c.forceDirection?.toArray(),fragment:c.fragment,wetting:c.wetting,surfaceWet:c.surfaceWet||0,aligned:c.aligned,jawContact:c.jawContact,footprint:c.footprint,state:c.state,progress:c.progress,softened:c.softened,vertices:c.mesh.geometry.attributes.position.count,triangles:c.mesh.geometry.index.count/3,position:c.mesh.position.toArray(),rotation:c.mesh.quaternion.toArray(),scale:c.mesh.scale.toArray(),screen:Project(InteractionPoint(c)),sweepScreen:Project(VisualCenter(c).add(new THREE.Vector3(1.8,0,0).applyQuaternion(c.rotation))),pullScreen:Project(VisualCenter(c).addScaledVector(c.normal,1.8)),physics:{cohesiveLoad:c.body.surface?.cohesion?.ratio||0,damage:c.body.surface?.cohesion?.damage||0,cutSection:c.body.surface?.fracture||null,solver:c.body.gel?'xpbd-viscoelastic-volume':c.body.surface?'xpbd-shell':'rigid-grain',nodes:c.body.gel?.points.length||c.body.surface?.points.length||0,tetrahedra:c.body.gel?.tetrahedra.length||0,volumeRatio:c.body.gel?.volumeRatio??1,minJacobian:c.body.gel?.minJacobian??1,gelStretch:c.body.gel?.maxStretch??1,peakGelStretch:c.body.gel?.peakStretch??1,bend:c.body.bend||0,peakBend:c.body.surface?.peakBend||0,maxStretch:c.body.surface?.maxStretch||0,motion:c.body.motion||0,anchors:c.body.anchors.filter(a=>a.alive).length,detached:c.body.detached,strain:c.body.strain,force:c.body.force,contact:c.body.contact,grip:c.body.grip?.slice()||null}})); }
  return {WarmTools,canal,Reset,PrepareCustomer,CancelPreparation,PreparationProbe(){return{...preparationStats,pendingSeed:preparation?.seed??null,ready:!!preparation?.ready,stagedChunks:preparation?.chunks.length||0};},EndService,Pick,Grip,Drag,Fracture,SetSkins,CreateToolPreview,Ungrip,Slip,ShowTool,HideTool,Release,Update,Targets,Project,Resize,StartScoopStroke,MoveScoopStroke,EndScoopStroke(){scoopStroke=null;},
    TrayBegin:collectionTray.Begin,TrayMove:collectionTray.Move,TrayEnd:collectionTray.End,TrayTilt:collectionTray.SetTilt,TrayProbe:collectionTray.Probe,
    ClearTray(){collectionTray.Clear();traySlot=0;},
    Suspend(){CancelPreparation();const saved={tray:collectionTray.Suspend(),traySlot,showcaseBlend,chunks,transfer,showcase,inspectionDepth,inspectionTarget,inside,entrance,heading,scoopRotation,parkedTool,manualRotation,lampOn,aimed,aim:aim.clone()};for(const c of chunks)root.remove(c.mesh,c.mark);chunks=[];transfer=null;HideTool();return saved;},
    Restore(saved){CancelPreparation();collectionTray.Restore(saved.tray);traySlot=saved.traySlot;showcaseBlend=saved.showcaseBlend;for(const c of chunks){root.remove(c.mesh,c.mark);c.mesh.geometry.dispose();c.mesh.material.dispose();c.mark.geometry.dispose();c.mark.material.dispose();}({chunks,transfer,showcase,inspectionDepth,inspectionTarget,inside,entrance,heading,scoopRotation,parkedTool,manualRotation,lampOn,aimed}=saved);aim.copy(saved.aim);for(const c of chunks)root.add(c.mesh,c.mark);contact.Reset();HideTool();},
    SetToolDrag(enabled){toolDragMode=enabled;parkedTool=toolDrag=manualRotation=null;HideTool();},EnsureTool,StartToolDrag,MoveToolDrag,PickTool,AdvanceTool,QueueToolDepth(amount){if(toolDrag)toolDrag.depth=Clamp(toolDrag.depth+amount,-.6,.6);},EndToolDrag(){toolDrag=null;},
    TurnStart(x,y,id){
      if(transfer||showcase)return false;
      if(toolDragMode){if(!EnsureTool(id))return false;turnChunk=PickTool(id);}
      else{turnChunk=Pick(x,y,id);if(turnChunk)ShowTool(turnChunk,id,0,{x,y});else Hover(x,y,id);}
      if(!tool.visible)return false;
      // 先为整个旋转包络留出间隙，勺沿不会一转到侧面就卡死在内壁里。
      const bins=new Map();for(const p of contact.Samples(toolParts[id],id==='feather'?fiberTipSamples:null)){const key=Math.floor(p.y/.2),r=Math.hypot(p.x,p.z);bins.set(key,Math.max(bins.get(key)||0,r));}
      const envelope=[];for(const [band,radius] of bins)for(const y of [band*.2,(band+1)*.2])for(let i=0;i<16;i++){const a=i*Math.PI/8,r=(radius+.025)/Math.cos(Math.PI/16);envelope.push(new THREE.Vector3(Math.cos(a)*r,y,Math.sin(a)*r));}
      const pose=contact.Solve(tool.position,tool.quaternion,envelope,{sweep:false});tool.position.copy(pose.position);tool.quaternion.copy(pose.rotation);turnPoint=tool.position.clone();
      if(id==='feather'){featherSweep={items:[],angle:0};if(turnChunk)turnChunk={rotation:turnChunk.rotation.clone()};}
      return true;
    },
    TurnBy(delta,id){if(!turnPoint)return;const previous=heading,previousRotation=tool.quaternion.clone();heading+=delta;if(toolDragMode&&manualRotation)manualRotation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),delta));else if(id==='scoop')scoopRotation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),delta));const pose=ToolAt(turnPoint,id,turnChunk);if(pose.blocked)heading=previous+delta*(pose.rotationFraction||0);if(id==='feather')SweepFeather(previousRotation);return heading;},
    TurnEnd(){turnPoint=null;turnChunk=null;EndFeatherSweep();},Heading(){return heading;},
    FeatherSweepProbe(){return{capacity:FeatherCapacity(toolLevels.feather),held:featherSweep?.items.length||0};},
    CycleDepth(){inspectionTarget=chunks[0]?.type==='oily'?(inspectionTarget===0?1:inspectionTarget>0?-.4:0):(inspectionTarget?0:1);contact.Reset();HideTool();return inspectionTarget;},
    Reach,CanReach(c,id){return c.coating||c.depth<=Reach(id);},SetDeep(value){inspectionTarget=value?1:0;contact.Reset();HideTool();},
    AuditTool,CollisionProbe(){return contact.Probe();},
    SetContact:materials.SetContact,
    RenderingProbe(){return {shadersWarmed,staticRaycast:true,fiberClusters:Object.fromEntries(['feather','brush'].map(id=>[id,toolParts[id].children.reduce((sum,p)=>sum+(p.userData.fiberGroups?.length||0),0)])),...materials.Probe(),heading,inspectionDepth,inspectionTarget,reachBlocked,toolReach:Reach(lastToolId),traySize:new THREE.Box3().setFromObject(tray).getSize(new THREE.Vector3()).toArray(),trayStandalone:true,trayCloseup:showcaseBlend,trayCollection:collectionTray.Probe(),trayBounds:TrayBounds(),trayInscription:"强迫症的SOPHIA",toolVisible:tool.visible,toolDragMode,draggingTool:!!toolDrag,toolPosition:tool.position.toArray(),toolScreen:Project(tool.position),toolDepth:canal.Project(tool.position).depth,toolRotation:tool.quaternion.toArray(),featherShading:'six-pass combed continuous fibers',featherFur:{passes:FEATHER_FUR_PASSES,length:FEATHER_FUR_LENGTH},featherSweep:{capacity:FeatherCapacity(toolLevels.feather),held:featherSweep?.items.length||0,angle:featherSweep?.angle||0},hairCount:360,hairRootFixed:true,profileHairLayers:3,profileHairTexture:'Texture_LayeredDarkHair.png',profileHairWisps:90,hairTime,headRealtime:true,lampOn,lampAim:lamp.target.position.toArray(),lampIntensity:lamp.intensity,shadows:core.renderer.shadowMap.enabled,canalVisible:canalGroup.visible,externalContext:outer.visible&&!!(transfer||showcase),outerVisible:outer.visible,irritation:chunks.filter(c=>!c.fragment).map(c=>c.irritation),roughness:chunks.map(c=>c.mesh.material.roughness),clearcoat:chunks.map(c=>c.mesh.material.clearcoat),toolLevels:{...toolLevels},previewTriangles};},
    ToggleLamp(){lampOn=!lampOn;return lampOn;},AimLamp(x,y){aim.set(x/width*2-1,1-y/height*2);aimed=true;},
    Enter(){inside=true;entrance=0;showcase=false;},Hover,
    ToggleView(){if(transfer)return 'canal';showcase=false;inside=!inside;HideTool();return inside?'canal':'ear';},
    Showcase(){showcase=true;collectionTray.SetActive(true);HideTool();},
    get ready(){return entrance>=1&&!transfer&&!showcase;},
    get busy(){return !!transfer;},
    get transfer(){return transfer?{id:transfer.chunk.id,batch:transfer.chunk.batch?.map(c=>c.id)||[],age:transfer.age,mode:transfer.mode||'carry',toolVisible:tool.visible}:null;},
    Drop(c){c.surfaceWet=Math.max(c.surfaceWet||0,.18);if(!toolDragMode||!toolDrag)ShowTool(c,'drops');dropTarget=c.mesh.position.clone().addScaledVector(c.normal,.18);dropAge=0;droplet.visible=true;droplet.userData.start=lastToolPoint.clone();},
    get chunks(){return chunks;},
    modelInfo:{source:'BlenderMCP',file:'Models/Model_ImmersiveEar.glb',edition:'DirectionalAnatomy',nodes:asset.scene.children.map(n=>n.name)},
    Dispose(){toolParts.feather.children.forEach(p=>ClearFeatherFur(p));collectionTray.Dispose();disposed=true;CancelPreparation();waxPrototypes.forEach(g=>g.dispose());environment.dispose();metalEnvironment.dispose();metalMaterials.clear();anatomy.dispose();root.traverse(n=>{n.geometry?.dispose();});}};
}
