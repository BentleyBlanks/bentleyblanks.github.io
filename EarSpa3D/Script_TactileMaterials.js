import * as THREE from 'three';
// imagegen 的图集按通道拆成 GPU 纹理；法线/粗糙度/AO 保持线性，颜色才走 sRGB。
export async function CreateTactileMaterials(renderer) {
  const loader=new THREE.TextureLoader();
  async function Atlas(file){
    const atlas=await loader.loadAsync(new URL('./Textures/'+file+'?v=ear009-20260911',import.meta.url).href),image=atlas.image;
    const maps={};
    for(const [name,x,y] of [['map',0,0],['normalMap',1,0],['roughnessMap',0,1],['aoMap',1,1]]){
      const canvas=document.createElement('canvas');canvas.width=Math.floor(image.width/2);canvas.height=Math.floor(image.height/2);
      canvas.getContext('2d').drawImage(image,x*canvas.width,y*canvas.height,canvas.width,canvas.height,0,0,canvas.width,canvas.height);
      const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=name==='map'?THREE.SRGBColorSpace:THREE.NoColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());maps[name]=texture;
    }atlas.dispose();return maps;
  }
  const [skin,wax,gripAtlas]=await Promise.all([Atlas('Texture_CanalPbrAtlas.png'),Atlas('Texture_WaxPbrAtlas.png'),Atlas('Texture_GripPbrAtlas.png')]);
  const grips=['steel','walnut','jade'].map((id,i)=>Object.fromEntries(Object.entries(gripAtlas).map(([channel,t])=>{const canvas=document.createElement('canvas');canvas.width=Math.floor(t.image.width/3);canvas.height=t.image.height;canvas.getContext('2d').drawImage(t.image,i*t.image.width/3,0,t.image.width/3,t.image.height,0,0,canvas.width,canvas.height);const map=new THREE.CanvasTexture(canvas);map.colorSpace=t.colorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.anisotropy=t.anisotropy;return[channel,map];})));
  function GripMaterial(material,skin='classic',level=1){
    const handle=/ToolHandle/.test(material.name),steel=/ToolSteel/.test(material.name);if(!handle&&!steel)return;
    const id=handle&&skin==='jade'?2:handle&&(skin==='walnut'||level===1)?1:0;
    Object.assign(material,grips[id]);material.normalScale.set(.12,.12);material.aoMapIntensity=.5;material.color.setRGB(id===1&&skin==='classic'?1.6:1,id===1&&skin==='classic'?1.5:1,id===1&&skin==='classic'?1.3:1);
    material.roughness=id===2?.85:id===1?1:Math.max(.24,.95-(level-1)*.16);material.metalness=id===0?.92:0;if(material.isMeshPhysicalMaterial){material.clearcoat=id===2?.7:id===1?.1:.2;material.clearcoatRoughness=.12;}material.needsUpdate=true;
  }
  const marks=Array.from({length:9},()=>new THREE.Vector4(0,0,0,0)),wet=Array.from({length:9},()=>new THREE.Vector4(0,0,0,0));
  const state={sss:{value:.18},light:{value:new THREE.Vector3()},power:{value:0},marks:{value:marks},wet:{value:wet}};
  function Skin({outer=false}={}){
    const maps=Object.fromEntries(Object.entries(skin).map(([k,t])=>{const c=t.clone();c.repeat.set(outer?7:4,outer?9:5);return[k,c];}));
    const material=new THREE.MeshPhysicalMaterial({...maps,color:new THREE.Color().setRGB(1.04,1.15,1.19),roughness:1,metalness:0,normalScale:new THREE.Vector2(.27,.27),aoMapIntensity:.65,clearcoat:1,clearcoatRoughness:.12,side:THREE.DoubleSide});
    material.userData.kind='skin';
    material.onBeforeCompile=shader=>{
      shader.uniforms.earSss=state.sss;shader.uniforms.earLamp=state.light;shader.uniforms.earPower=state.power;shader.uniforms.earMarks=state.marks;shader.uniforms.earWet=state.wet;
      shader.vertexShader='varying vec3 earWorld;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nearWorld=(modelMatrix*vec4(position,1.0)).xyz;\n'+(outer?'':`for(int i=0;i<9;i++){float d=distance(earWorld,earMarks[i].xyz);float bump=exp(-d*d/0.65)*earMarks[i].w;transformed+=normal*bump*0.035;}`));
      if(!outer)shader.vertexShader='uniform vec4 earMarks[9];\n'+shader.vertexShader;
      shader.fragmentShader='varying vec3 earWorld;uniform float earSss;uniform vec3 earLamp;uniform float earPower;uniform vec4 earMarks[9];uniform vec4 earWet[9];\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        float localIrritation=0.0;float localWet=0.0;
        ${outer?'':`for(int i=0;i<9;i++){float d=distance(earWorld,earMarks[i].xyz);localIrritation=max(localIrritation,exp(-d*d/0.6)*earMarks[i].w);float w=distance(earWorld,earWet[i].xyz);localWet=max(localWet,exp(-w*w/1.1)*earWet[i].w);}`}
        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.16,.47,.40),clamp(localIrritation,0.0,.72));`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,0.14,localWet);');
      shader.fragmentShader=shader.fragmentShader.replace('#include <clearcoat_normal_fragment_begin>','#include <clearcoat_normal_fragment_begin>');
      shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_fragment>','#include <lights_physical_fragment>\nmaterial.clearcoat=localWet*.9;');
      // 薄皮层的单次散射近似：依赖实际灯距、受光角和遮蔽，不给深处加无条件自发光。
      shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
        vec3 earL=(viewMatrix*vec4(earLamp-earWorld,0.0)).xyz;
        float earDistance=max(length(earL),0.5);
        float wrap=pow(clamp((dot(normal,normalize(earL))+.45)/1.45,0.0,1.0),1.7);
        reflectedLight.directDiffuse+=diffuseColor.rgb*vec3(1.0,.32,.18)*wrap*earSss*min(earPower/(earDistance*earDistance),2.0);`);
    };
    material.customProgramCacheKey=()=>outer?'EarSkinOuterSss1':'EarSkinCanalSss1';return material;
  }
  function Wax(type){return new THREE.MeshPhysicalMaterial({...wax,color:type==='impacted'?0xa18053:type==='wet'?0x9e7445:0xe6c899,roughness:type==='wet'?.65:1,normalScale:new THREE.Vector2(.38,.38),aoMapIntensity:.58,clearcoat:type==='wet'?.2:0,clearcoatRoughness:.13,metalness:0});}
  function Update(chunks,lamp){
    state.light.value.copy(lamp.position);state.power.value=lamp.intensity;
    const originals=chunks.filter(c=>!c.fragment).slice(0,9);
    originals.forEach((c,i)=>{marks[i].set(c.origin.x,c.origin.y,c.origin.z,c.irritation||0);wet[i].set(c.origin.x,c.origin.y,c.origin.z,c.softened||0);});
  }
  return{Skin,Wax,GripMaterial,Update,Probe(){return{pbr:['albedo','normal','roughness','ao'],sss:'thin-layer single-scattering approximation',sssStrength:state.sss.value};}};
}
