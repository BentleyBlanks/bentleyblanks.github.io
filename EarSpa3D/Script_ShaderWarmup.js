import * as THREE from 'three';

// Three's compile() does not initialize per-material clipping, or the linear
// transmission pass. Prime each clipping count with an empty render, then compile
// matching proxies against the real scene lights/environment. Nothing is drawn.
export async function WarmRenderPrograms(renderer,scene,camera){
 const target=renderer.getRenderTarget(),tone=renderer.toneMapping,shadow=renderer.shadowMap.enabled,planes=renderer.clippingPlanes;
 const empty=new THREE.Scene(),linear=new THREE.WebGLRenderTarget(1,1,{colorSpace:THREE.LinearSRGBColorSpace});
 const groups=new Map();
 scene.traverse(object=>{
  if(!object.isMesh)return;
  for(const material of Array.isArray(object.material)?object.material:[object.material]){
   const count=material.clippingPlanes?.length||0;
   if(!groups.has(count))groups.set(count,new THREE.Group());
   const proxy=new THREE.Mesh(object.geometry,material);proxy.receiveShadow=object.receiveShadow;groups.get(count).add(proxy);
  }
 });
 function Compile(group,transmission){
  renderer.compile(group,camera,scene);
  const backs=new THREE.Group(),changed=[];
  for(const proxy of group.children){const material=proxy.material;
   // Transmission renders the far side of double-sided glass separately.
   if(transmission&&material.transmission>0&&material.side===THREE.DoubleSide){changed.push([material,material.side]);material.side=THREE.BackSide;backs.add(new THREE.Mesh(proxy.geometry,material));}
  }
  try{if(changed.length)renderer.compile(backs,camera,scene);}
  finally{for(const [material,side]of changed){material.side=side;material.needsUpdate=true;}}
 }
 try{
  for(const enabled of [true,false])for(const transmission of [false,true]){
   renderer.shadowMap.enabled=enabled;
   renderer.setRenderTarget(transmission?linear:target);renderer.toneMapping=transmission?THREE.NoToneMapping:tone;
   for(const [count,group]of groups){
    renderer.clippingPlanes=Array.from({length:count},()=>new THREE.Plane());
    renderer.render(empty,camera);
    Compile(group,transmission);
    // Wetness quality changes the transmission define; all other quality knobs
    // are uniforms. Warm this small subset for saved low/high settings as well.
    const alternate=new THREE.Group(),changed=new Map();
    for(const proxy of group.children){const material=proxy.material;if(!material.userData.renderTransmission)continue;
     if(!changed.has(material)){changed.set(material,material.transmission);material.transmission=material.transmission>0?0:material.userData.renderTransmission;}
     alternate.add(new THREE.Mesh(proxy.geometry,material));
    }
    try{if(changed.size)Compile(alternate,transmission);}
    finally{for(const [material,value]of changed){material.transmission=value;material.needsUpdate=true;}}
    await new Promise(resolve=>setTimeout(resolve,0));
   }
  }
  // Queue all variants before waiting so the driver can compile them together.
  // The bundled Three's compileAsync checks only each material's currentProgram;
  // variants share a material, so retain and check every queued WebGLProgram.
  const pending=new Set(renderer.info.programs);
  while(pending.size){for(const program of pending)if(program.isReady())pending.delete(program);if(pending.size)await new Promise(resolve=>setTimeout(resolve,10));}
 }finally{
  renderer.clippingPlanes=planes;renderer.shadowMap.enabled=shadow;renderer.toneMapping=tone;renderer.setRenderTarget(target);linear.dispose();
  // Clear the primed clipping state before the real scene's first render.
  renderer.render(empty,camera);
 }
}
