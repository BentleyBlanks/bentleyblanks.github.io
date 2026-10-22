import * as THREE from 'three';

// A studio reflection field belongs to the external portrait only. It never
// changes the ear canal's purchased examination lamp or its environment.
export function CreatePortraitLighting({renderer,scene,key,meshes}) {
  const studio=new THREE.Scene();studio.background=new THREE.Color().setRGB(.022,.026,.032);
  for(const [position,size,radiance] of [
    [[-4,5,-4],[3.3,5.8],[2.8,2.65,2.55]],
    [[4,3,2],[1.4,5.6],[1.65,1.8,2.0]],
    [[-2,-2,-3],[4.5,1.7],[.22,.19,.17]],
  ]){
    const panel=new THREE.Mesh(new THREE.PlaneGeometry(...size),new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(...radiance),side:THREE.DoubleSide}));
    panel.position.fromArray(position);panel.lookAt(0,0,0);studio.add(panel);
  }
  const pmrem=new THREE.PMREMGenerator(renderer),environment=pmrem.fromScene(studio,.035);pmrem.dispose();
  studio.traverse(object=>{object.geometry?.dispose();object.material?.dispose();});
  key.name='PortraitKey';key.color.set(0xfff3e9);key.position.set(-85,125,-115);key.target.position.set(-12,10,15);scene.add(key.target);
  key.castShadow=true;key.shadow.mapSize.set(2048,2048);
  Object.assign(key.shadow.camera,{left:-120,right:120,top:145,bottom:-145,near:1,far:520});
  key.shadow.camera.updateProjectionMatrix();key.shadow.bias=-.00015;key.shadow.normalBias=.25;
  key.shadow.radius=2;key.shadow.intensity=.72;
  // The head and groom are static. Keep the first result until a quality change
  // requests another map; moving examination tools use their own dynamic lamp.
  key.shadow.autoUpdate=false;key.shadow.needsUpdate=true;
  const fill=new THREE.DirectionalLight(0xd7e3f2,.16);fill.name='PortraitFill';fill.position.set(110,35,-100);fill.target.position.set(-12,5,20);
  const rim=new THREE.DirectionalLight(0xe0e8f7,.72);rim.name='PortraitRim';rim.position.set(70,95,100);rim.target.position.set(0,15,10);
  scene.add(fill,fill.target,rim,rim.target);
  const bound=[];
  for(const mesh of meshes){
    mesh.castShadow=true;mesh.receiveShadow=true;
    for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
      if(/Temple|OuterEar/.test(mesh.name))material.shadowSide=THREE.BackSide;
      material.envMap=environment.texture;material.envMapIntensity=.40;material.needsUpdate=true;bound.push(material);
    }
  }
  const staticCasters=new Set(meshes),shadowHooks=new Map();
  function RestoreHook(object,hook){
    // Restore an interrupted callback too, including geometries shared by meshes.
    while(hook.ranges.length){const {geometry,start,count}=hook.ranges.pop();geometry.setDrawRange(start,count);}
    if(object.onBeforeShadow===hook.Before)object.onBeforeShadow=hook.before;
    if(object.onAfterShadow===hook.After)object.onAfterShadow=hook.after;
    hook.geometry.removeEventListener('dispose',hook.Dispose);
  }
  function RegisterShadowCasters(){
    const present=new Set();
    scene.traverse(object=>{
      if(!object.geometry||!object.castShadow||staticCasters.has(object))return;
      present.add(object);
      const previous=shadowHooks.get(object);
      if(previous?.geometry===object.geometry)return;
      if(previous)RestoreHook(object,previous);
      const hook={before:object.onBeforeShadow,after:object.onAfterShadow,geometry:object.geometry,ranges:[]};
      hook.Before=function(...args){
        hook.before.apply(this,args);
        if(args[3]!==key.shadow.camera)return;
        const geometry=args[4],{start,count}=geometry.drawRange;
        hook.ranges.push({geometry,start,count});geometry.setDrawRange(start,0);
      };
      hook.After=function(...args){
        if(args[3]===key.shadow.camera&&hook.ranges.length){
          const {geometry,start,count}=hook.ranges.pop();geometry.setDrawRange(start,count);
        }
        hook.after.apply(this,args);
      };
      // Customer resets dispose removed wax geometry. Release its mesh and
      // callbacks immediately, even if the cached portrait is never shown again.
      hook.Dispose=()=>{RestoreHook(object,hook);shadowHooks.delete(object);};
      hook.geometry.addEventListener('dispose',hook.Dispose);
      object.onBeforeShadow=hook.Before;object.onAfterShadow=hook.After;shadowHooks.set(object,hook);
    });
    for(const [object,hook] of shadowHooks)if(!present.has(object)){RestoreHook(object,hook);shadowHooks.delete(object);}
  }
  let blend=1,portraitVisible=false;
  function Update(outside,visible=true){
    // A quality change can rebuild the map while the whole portrait is hidden.
    // Restore its head/groom casters once on the visibility edge, then keep the
    // static map. Repeated visible frames do not invalidate it.
    if(visible&&!portraitVisible)key.shadow.needsUpdate=true;
    // Three r185 selects shadow casters with the main camera's layers. Skip other
    // casters only during this light's draw, then restore each material group
    // immediately: tools/wax retain their main draw and examination-lamp shadows.
    // Discover new chunks only when rebuilding the cache, not on stable frames.
    if(renderer.shadowMap.enabled&&(key.shadow.needsUpdate||!key.shadow.map))RegisterShadowCasters();
    portraitVisible=visible;
    blend=THREE.MathUtils.clamp(outside,0,1);fill.intensity=.16*blend;rim.intensity=.72*blend;
    for(const material of bound)material.envMapIntensity=.40*blend;
  }
  return {Update,Probe(){return{model:'portrait-studio-v1',outside:blend,keyShadow:key.castShadow,staticShadow:!key.shadow.autoUpdate,fill:fill.intensity,rim:rim.intensity,environment:.40*blend};},Dispose(){for(const [object,hook] of shadowHooks)RestoreHook(object,hook);shadowHooks.clear();environment.dispose();key.shadow.map?.dispose();fill.removeFromParent();fill.target.removeFromParent();rim.removeFromParent();rim.target.removeFromParent();}};
}
