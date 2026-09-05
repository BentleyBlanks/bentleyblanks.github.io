import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {CreateTrainRig} from './Script_TrainRig.mjs';
const scene=new THREE.Scene();scene.background=new THREE.Color('#38454c');scene.fog=new THREE.Fog('#38454c',30,85);
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;document.body.prepend(renderer.domElement);
const pmrem=new THREE.PMREMGenerator(renderer);const environment=new THREE.Scene();environment.background=new THREE.Color(.36,.42,.47);
for(const position of [[0,10,0],[-10,3,0],[6,4,8]]){const panel=new THREE.Mesh(new THREE.PlaneGeometry(8,8),new THREE.MeshBasicMaterial({color:new THREE.Color(3,3,3),side:THREE.DoubleSide}));panel.position.fromArray(position);panel.lookAt(0,0,0);environment.add(panel);}
scene.environment=pmrem.fromScene(environment,.05).texture;pmrem.dispose();
const camera=new THREE.PerspectiveCamera(36,innerWidth/innerHeight,.1,200);
const controls={target:new THREE.Vector3(),Update(){camera.lookAt(this.target);},update(){this.Update();}};
const pointers=new Map();let pinchDistance=0;
function Zoom(factor){const offset=camera.position.clone().sub(controls.target);offset.multiplyScalar(factor);offset.clampLength(3,90);camera.position.copy(controls.target).add(offset);controls.update();}
renderer.domElement.style.touchAction='none';
renderer.domElement.onpointerdown=event=>{renderer.domElement.setPointerCapture(event.pointerId);pointers.set(event.pointerId,[event.clientX,event.clientY]);pinchDistance=0;};
renderer.domElement.onpointerup=renderer.domElement.onpointercancel=event=>{pointers.delete(event.pointerId);pinchDistance=0;};
renderer.domElement.onpointermove=event=>{const previous=pointers.get(event.pointerId);if(!previous)return;pointers.set(event.pointerId,[event.clientX,event.clientY]);if(pointers.size===2){const [a,b]=[...pointers.values()];const d=Math.hypot(a[0]-b[0],a[1]-b[1]);if(pinchDistance)Zoom(pinchDistance/d);pinchDistance=d;return;}const spherical=new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));spherical.theta-=(event.clientX-previous[0])*.006;spherical.phi=Math.max(.02,Math.min(Math.PI/2-.015,spherical.phi+(event.clientY-previous[1])*.006));camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));controls.update();};
renderer.domElement.addEventListener('wheel',event=>{event.preventDefault();Zoom(Math.exp(event.deltaY*.001));},{passive:false});
scene.add(new THREE.HemisphereLight(0xc8dae7,0x424138,.75));
const sun=new THREE.DirectionalLight(0xffe6c0,3.5);sun.position.set(6,14,8);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-20;sun.shadow.camera.right=20;sun.shadow.camera.top=15;sun.shadow.camera.bottom=-15;sun.shadow.bias=-.0002;scene.add(sun);scene.add(sun.target);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(400,400),new THREE.MeshStandardMaterial({color:0x35434a,roughness:.95}));floor.rotation.x=-Math.PI/2;floor.position.y=-.255;floor.receiveShadow=true;scene.add(floor);
const rails=new THREE.Group();scene.add(rails);
const railMaterial=new THREE.MeshStandardMaterial({color:0x737c7b,metalness:.82,roughness:.34});
const sleeperMaterial=new THREE.MeshStandardMaterial({color:0x474237,roughness:.9});
for(const lane of [0,5.3]){
  for(const side of [-1,1]){const rail=new THREE.Mesh(new THREE.BoxGeometry(180,.17,.075),railMaterial);rail.position.set(0,-.083,lane+side*.755);rail.receiveShadow=true;rails.add(rail);}
  const sleepers=new THREE.InstancedMesh(new THREE.BoxGeometry(.23,.11,2.3),sleeperMaterial,250);const matrix=new THREE.Matrix4();
  for(let i=0;i<250;i++)sleepers.setMatrixAt(i,matrix.makeTranslation(-87.5+i*.7,-.20,lane));sleepers.receiveShadow=true;rails.add(sleepers);
}
const loader=new GLTFLoader();let running=false,direction=1,distance=0,last=performance.now();
const manifest=await fetch('./Data_TrainRig.json').then(response=>response.json());
const models={};const rigs={};
for(const name of ['Locomotive','Gondola']){const gltf=await loader.loadAsync(`./Model_${name}Rig.glb`);models[name]=gltf.scene;models[name].position.z=name==='Gondola'?5.3:0;models[name].traverse(object=>{if(object.isMesh){object.castShadow=true;object.receiveShadow=true;}});scene.add(gltf.scene);rigs[name]=CreateTrainRig(gltf.scene,manifest);}
function SetDistance(next){const delta=next-distance;distance=next;for(const name of Object.keys(models)){models[name].position.x=distance;rigs[name].SetTravelMeters(distance);}camera.position.x+=delta;controls.target.x+=delta;sun.position.x=distance+6;sun.target.position.x=distance;rails.position.x=Math.round(distance/70)*70;floor.position.x=distance;document.querySelector('#travel').value=distance;document.querySelector('#distanceValue').value=`${distance.toFixed(2)} m`;controls.update();scene.updateMatrixWorld(true);renderer.render(scene,camera);}
function SetView(view){
  document.querySelector('#view').value=view;
  models.Locomotive.visible=view!=='Gondola';models.Gondola.visible=view==='Gondola'||view==='Both';
  const views={Both:[[17,12,23],[0,1.4,2.4]],Locomotive:[[15,7,18],[0,1.8,0]],Gondola:[[10,6,18],[0,1.2,5.3]],Mechanism:[[3,2.1,11],[1.1,.9,0]],Left:[[3,2.1,-11],[1.1,.9,0]],Side:[[0,3.2,23],[0,1.95,0]],Front:[[19,2.6,0],[0,2.1,0]],Top:[[0,28,.01],[0,0,0]]};
  const [position,target]=views[view];controls.target.set(target[0]+distance,target[1],target[2]);const offset=new THREE.Vector3().fromArray(position).sub(new THREE.Vector3().fromArray(target)).multiplyScalar(Math.max(1,1/camera.aspect));camera.position.copy(controls.target).add(offset);controls.update();renderer.render(scene,camera);
}
function SetRunning(value){running=value;document.querySelector('#play').textContent=running?'暂停':'播放';}
document.querySelector('#view').onchange=event=>SetView(event.target.value);
document.querySelector('#play').onclick=()=>SetRunning(!running);
document.querySelector('#reverse').onclick=()=>{direction*=-1;document.querySelector('#reverse').textContent=direction>0?'反向':'恢复前进';};
document.querySelector('#reset').onclick=()=>{SetRunning(false);SetDistance(0);};
document.querySelector('#travel').oninput=event=>{SetRunning(false);SetDistance(Number(event.target.value));};
document.querySelector('#speed').oninput=event=>document.querySelector('#speedValue').value=`${Number(event.target.value).toFixed(1)} m/s`;
addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();SetView(document.querySelector('#view').value);});
SetView('Both');SetDistance(0);
document.querySelector('#status').textContent='双轴敞车 · 五组动轮 · 90° 曲柄错位';
window.TrainReview={ready:true,models,rigs,scene,camera,renderer,manifest,SetDistance,SetView,SetRunning};
renderer.setAnimationLoop(now=>{const dt=Math.min((now-last)/1000,.05);last=now;if(running)SetDistance(distance+dt*direction*Number(document.querySelector('#speed').value));renderer.render(scene,camera);});
