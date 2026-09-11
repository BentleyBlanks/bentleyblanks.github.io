import * as THREE from 'three';
import {CreateContactOcclusion} from './Script_ContactOcclusion.js?v=ear020-contact-loading-20260912';
// imagegen 的图集按通道拆成 GPU 纹理；法线/粗糙度/AO 保持线性，颜色才走 sRGB。
export async function CreateTactileMaterials(renderer) {
  const loader=new THREE.TextureLoader(),contact=CreateContactOcclusion();
  async function Atlas(file){
    const atlas=await loader.loadAsync(new URL('./Textures/'+file+'?v=ear011-20260911',import.meta.url).href),image=atlas.image;
    const maps={};
    for(const [name,x,y] of [['map',0,0],['normalMap',1,0],['roughnessMap',0,1],['aoMap',1,1]]){
      const canvas=document.createElement('canvas');canvas.width=Math.floor(image.width/2);canvas.height=Math.floor(image.height/2);
      canvas.getContext('2d').drawImage(image,x*canvas.width,y*canvas.height,canvas.width,canvas.height,0,0,canvas.width,canvas.height);
      const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=name==='map'?THREE.SRGBColorSpace:THREE.NoColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());maps[name]=texture;
    }atlas.dispose();return maps;
  }
  const [skin,outerSkin,wax,gripAtlas]=await Promise.all([Atlas('Texture_CanalPbrAtlas.png'),Atlas('Texture_OuterSkinPbrAtlas.png'),Atlas('Texture_WaxPbrAtlas.png'),Atlas('Texture_GripPbrAtlas.png')]);
  const grips=['steel','walnut','jade'].map((id,i)=>Object.fromEntries(Object.entries(gripAtlas).map(([channel,t])=>{const canvas=document.createElement('canvas');canvas.width=Math.floor(t.image.width/3);canvas.height=t.image.height;canvas.getContext('2d').drawImage(t.image,i*t.image.width/3,0,t.image.width/3,t.image.height,0,0,canvas.width,canvas.height);const map=new THREE.CanvasTexture(canvas);map.colorSpace=t.colorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.anisotropy=t.anisotropy;return[channel,map];})));
  function GripMaterial(material,skin='classic',level=1){
    const handle=/ToolHandle/.test(material.name),steel=/ToolSteel/.test(material.name);if(!handle&&!steel)return;
    const id=handle&&skin==='jade'?2:handle&&(skin==='walnut'||level===1)?1:0;
    Object.assign(material,grips[id]);material.normalScale.set(id===0?.055:.12,id===0?.24:.12);material.aoMapIntensity=.5;material.color.setRGB(id===1&&skin==='classic'?1.6:1,id===1&&skin==='classic'?1.5:1,id===1&&skin==='classic'?1.3:1);
    material.roughness=id===2?.85:1;material.metalness=id===0?1:0;
    if(material.isMeshPhysicalMaterial){material.clearcoat=id===2?.7:id===1?.1:0;material.clearcoatRoughness=.12;material.anisotropy=0;}
    if(id===0){
      // 钢的颜色是导体反射率；图集里的灰色明暗不能再次作为烘焙光照压暗反射。
      const brushed=handle,roughness=(brushed?.28:.21)-(level-1)*.022;
      material.map=null;material.color.setRGB(.72,.75,.78);material.aoMapIntensity=.22;
      material.normalScale.set(brushed?.025:.010,brushed?.055:.018);
      material.roughness=1;
      if(material.isMeshPhysicalMaterial){material.anisotropy=brushed?.42:.12;material.anisotropyRotation=Math.PI/2;}
      // 保留图集中的微细加工纹，限制起伏幅度，避免粗糙度被全局下限抹平。
      material.onBeforeCompile=shader=>{
        shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor='+roughness.toFixed(3)+'+(roughnessFactor-.5)*.07;');
        // 毫米近距点光会出现针状极值；柔和压缩直射峰值，保留环境反射的亮暗条带。
        shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
          float metalPeak=max(max(reflectedLight.directSpecular.r,reflectedLight.directSpecular.g),reflectedLight.directSpecular.b);
          reflectedLight.directSpecular/=1.0+metalPeak/.8;`);
      };
      material.customProgramCacheKey=()=> 'InstrumentSteelFinish'+(brushed?'Brushed':'Polished')+level;
      material.userData.instrumentMetal=brushed?'brushed':'polished';
    }
    material.needsUpdate=true;
  }
  const marks=Array.from({length:9},()=>new THREE.Vector4(0,0,0,0)),wet=Array.from({length:9},()=>new THREE.Vector4(0,0,0,0));
  const state={outerSss:{value:.10},outside:{value:0},sss:{value:.18},light:{value:new THREE.Vector3()},power:{value:0},marks:{value:marks},wet:{value:wet}};
  function Skin({outer=false,vestibule=false}={}){
    const maps=Object.fromEntries(Object.entries(outer?outerSkin:skin).map(([k,t])=>{const c=t.clone();c.repeat.set(outer?1:4,outer?1:5);if(outer)c.wrapS=c.wrapT=THREE.MirroredRepeatWrapping;return[k,c];}));
    const material=new THREE.MeshPhysicalMaterial({...maps,color:new THREE.Color().setRGB(.99,1.20,1.23),roughness:1,metalness:0,normalScale:new THREE.Vector2(outer?.18:.12,outer?.18:.12),aoMapIntensity:outer?.18:.65,clearcoat:1,clearcoatRoughness:.12,side:THREE.DoubleSide});
    material.userData.kind='skin';
    material.onBeforeCompile=shader=>{
      shader.uniforms.earOutside=state.outside;shader.uniforms.earSss=outer?state.outerSss:state.sss;shader.uniforms.earLamp=state.light;shader.uniforms.earPower=state.power;shader.uniforms.earMarks=state.marks;shader.uniforms.earWet=state.wet;
      shader.vertexShader=(vestibule?'attribute float vestibuleDepth;varying float mouthDepth;\n':'')+'varying vec3 earWorld;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nearWorld=(modelMatrix*vec4(position,1.0)).xyz;\n'+(vestibule?'mouthDepth=vestibuleDepth;\n':'')+(outer?'':`for(int i=0;i<9;i++){float d=distance(earWorld,earMarks[i].xyz);float bump=exp(-d*d/0.65)*earMarks[i].w;transformed+=normal*bump*0.035;}`));
      if(!outer)shader.vertexShader='uniform vec4 earMarks[9];\n'+shader.vertexShader;
      shader.fragmentShader=(vestibule?'varying float mouthDepth;\n':'')+'uniform float earOutside;varying vec3 earWorld;uniform float earSss;uniform vec3 earLamp;uniform float earPower;uniform vec4 earMarks[9];uniform vec4 earWet[9];\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        float localIrritation=0.0;float localWet=0.0;
        ${outer?'':'diffuseColor.rgb*=mix(1.0,.18,earOutside);'}
        ${vestibule?'diffuseColor.rgb*=mix(1.0,.18,smoothstep(0.0,.85,mouthDepth)*earOutside);':''}
        ${outer?`// Keep pore/albedo variation; broad anatomical masks add subtle perfusion.
        diffuseColor.rgb*=vec3(1.065,.995,1.025);
        vec2 cheekOffset=(earWorld.xy+vec2(45.0,13.0))/27.0;
        vec2 noseOffset=(earWorld.xy+vec2(87.0,16.0))/vec2(13.0,18.0);
        vec2 earOffset=earWorld.xy/vec2(23.0,35.0);
        float cheek=exp(-dot(cheekOffset,cheekOffset));
        float nose=exp(-dot(noseOffset,noseOffset));
        float earWarm=exp(-dot(earOffset,earOffset))*(1.0-smoothstep(10.0,26.0,earWorld.z));
        float perfusion=clamp(cheek*.23+nose*.13+earWarm*.15,0.0,.28);
        diffuseColor.rgb*=mix(vec3(1.0),vec3(1.17,.79,.83),perfusion);
        float lip=exp(-pow((earWorld.y+51.0)/5.0,4.0)-pow((earWorld.z-63.2)/19.0,4.0))*smoothstep(67.0,75.0,-earWorld.x);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.38,.095,.080),lip*.8);`:''}
        ${outer?'':`for(int i=0;i<9;i++){float d=distance(earWorld,earMarks[i].xyz);localIrritation=max(localIrritation,exp(-d*d/0.6)*earMarks[i].w);float w=distance(earWorld,earWet[i].xyz);localWet=max(localWet,exp(-w*w/1.1)*earWet[i].w);}`}
        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.16,.47,.40),clamp(localIrritation,0.0,.72));`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,0.14,localWet);');
      shader.fragmentShader=shader.fragmentShader.replace('#include <clearcoat_normal_fragment_begin>','#include <clearcoat_normal_fragment_begin>');
      shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_fragment>','#include <lights_physical_fragment>\nmaterial.clearcoat=localWet*.9;');
      // 薄皮层的单次散射近似：依赖实际灯距、受光角和遮蔽，不给深处加无条件自发光。
      shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',outer?`#include <lights_fragment_end>
        vec3 externalL=normalize((viewMatrix*vec4(-.25,.65,-.72,0.0)).xyz);
        float pinna=exp(-pow(earWorld.x/30.0,4.0)-pow(earWorld.y/42.0,4.0))* (1.0-smoothstep(12.0,25.0,earWorld.z));
        float rim=pow(1.0-abs(dot(normal,geometryViewDir)),2.0);
        float back=pow(clamp((dot(-normal,externalL)+.35)/1.35,0.0,1.0),1.5);
        reflectedLight.directDiffuse+=diffuseColor.rgb*vec3(1.0,.40,.24)*earSss*(.18+pinna*rim)*back*earOutside;
        `:`#include <lights_fragment_end>
        vec3 earL=(viewMatrix*vec4(earLamp-earWorld,0.0)).xyz;
        float earDistance=max(length(earL),0.5);
        float wrap=pow(clamp((dot(normal,normalize(earL))+.45)/1.45,0.0,1.0),1.7);
        reflectedLight.directDiffuse+=diffuseColor.rgb*vec3(1.0,.32,.18)*wrap*earSss*min(earPower/(earDistance*earDistance),2.0);`);
    };
    const skinCompile=material.onBeforeCompile;material.onBeforeCompile=shader=>{skinCompile(shader);if(!outer)contact.Bind(shader);};
    material.customProgramCacheKey=()=>outer?(vestibule?'EarSkinRecessedVestibule4':'EarSkinOuterComplexion3'):'EarSkinCanalContact2';return material;
  }
  function Wax(type,tone='brown'){
    if(type==='oily'){
      const material=new THREE.MeshPhysicalMaterial({color:0xecc477,map:wax.map,roughness:.24,normalMap:wax.normalMap,normalScale:new THREE.Vector2(.018,.018),metalness:0,ior:1.46,transmission:.5,thickness:.70,attenuationColor:0xc78925,attenuationDistance:1.8,clearcoat:.65,clearcoatRoughness:.10,specularIntensity:.65,envMapIntensity:.85});
      material.userData.waxWet={value:1};material.userData.waxSoft={value:0};material.userData.oily=true;
      material.onBeforeCompile=shader=>{
        shader.vertexShader='attribute vec3 gelRest;attribute float gelThickness;varying vec3 gelLocal;varying float gelPath;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ngelLocal=gelRest;gelPath=gelThickness;');
        shader.fragmentShader='varying vec3 gelLocal;varying float gelPath;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <transmission_fragment>',THREE.ShaderChunk.transmission_fragment.replace('material.thickness = thickness;', 'material.thickness = thickness * gelPath;').replace('material.transmission = transmission;', 'material.transmission = mix(.28,.83,exp(-gelPath*1.8));'));
        shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
          float cloud=.5+.5*sin(gelLocal.x*4.1+sin(gelLocal.y*3.7))*sin(gelLocal.y*5.3+gelLocal.z*3.0);
          float lipidDetail=dot(texture2D(map,vMapUv).rgb,vec3(.299,.587,.114));
          diffuseColor.rgb=diffuse*mix(vec3(.88,.84,.73),vec3(1.03,1.00,.94),smoothstep(.025,.42,lipidDetail));
          diffuseColor.rgb*=.88+cloud*.16;
        `);
        shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
          float rim=pow(1.0-abs(dot(normal,geometryViewDir)),2.5);
          reflectedLight.directDiffuse+=diffuseColor.rgb*reflectedLight.directDiffuse*(.20+rim*.8);
        `);
        contact.Bind(shader,{self:material.userData.contactSelf});material.userData.contactShader=shader;
      };material.customProgramCacheKey=()=> 'OilyViscoelasticVolume1';return material;
    }
    const pale=tone==='paleYellow';
    const material=new THREE.MeshPhysicalMaterial({...wax,color:type==='impacted'?0xcbb588:type==='wet'?0xd1bfa1:0xfff3d5,roughness:type==='wet'?.27:1,normalScale:new THREE.Vector2(pale?.11:.22,pale?.11:.22),aoMapIntensity:pale?.35:.58,clearcoat:type==='wet'?.8:0,clearcoatRoughness:.13,metalness:0});
    if(pale){
      material.transparent=true;material.depthWrite=false;
      // 保留同一 PBR 的纹理细节，重新标定薄角质层的浅黄底色，避免深棕颜色贴图把它压黑。
      material.onBeforeCompile=shader=>{
        shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
          float keratinDetail=pow(clamp(dot(diffuseColor.rgb,vec3(.299,.587,.114)),0.0,1.0),.35);
          diffuseColor.rgb=mix(vec3(.66,.38,.045),vec3(.98,.82,.30),keratinDetail);`);
        // 用原型 UV 对应的椭球厚度估计薄层光学消光；边缘透出皮肤，厚部遮光。
        shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
          float thinEdge=pow(1.0-abs(dot(normal,geometryViewDir)),2.0);
          reflectedLight.directDiffuse*=1.0+thinEdge*.22;
          float keratinDepth=abs(sin(vMapUv.y*3.14159265)*sin(vMapUv.x*6.2831853));
          float opticalPath=(.16+.84*pow(keratinDepth,.7))/max(.5,abs(dot(normal,geometryViewDir)));
          diffuseColor.a*=1.0-exp(-3.5*opticalPath);`);
      };
      material.customProgramCacheKey=()=> 'PaleYellowKeratinThinSheet';
    }
    material.userData.waxWet={value:0};material.userData.waxSoft={value:0};
    const waxCompile=material.onBeforeCompile;material.onBeforeCompile=shader=>{waxCompile(shader);
      shader.uniforms.waxWet=material.userData.waxWet;shader.uniforms.waxSoft=material.userData.waxSoft;
      shader.fragmentShader='uniform float waxWet;uniform float waxSoft;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`
        diffuseColor.rgb*=mix(vec3(1.0),vec3(.61,.48,.32),waxWet*.55+waxSoft*.45);
        #include <roughnessmap_fragment>
        roughnessFactor=mix(roughnessFactor,.075,waxWet*.85);`);
      contact.Bind(shader,{self:material.userData.contactSelf,wall:material.userData.contactWall});material.userData.contactShader=shader;};material.customProgramCacheKey=()=>pale?'PaleKeratinWet3':'BrownWaxWet3';
    return material;
  }
  function WetWax(material,softness,wetness,type){
    if(type==='oily'){material.roughness=.24-softness*.055;material.clearcoatRoughness=.10;return;}
    material.userData.waxWet.value=wetness;material.userData.waxSoft.value=softness;
    material.roughness=(type==='wet'?.27:1)*(1-wetness*.81);
    material.clearcoat=Math.max(type==='wet'?.8:0,wetness*.98);material.clearcoatRoughness=.055;
    const normal=material.userData.dryNormalScale||(material.userData.dryNormalScale=material.normalScale.clone());
    material.normalScale.copy(normal).multiplyScalar(1-softness*.72);
  }
  function Update(chunks,lamp){
    contact.Update(chunks,lamp);state.light.value.copy(lamp.position);state.power.value=lamp.intensity;
    const originals=chunks.filter(c=>!c.fragment).slice(0,9);
    originals.forEach((c,i)=>{marks[i].set(c.origin.x,c.origin.y,c.origin.z,c.irritation||0);wet[i].set(c.origin.x,c.origin.y,c.origin.z,c.surfaceWet||c.softened||0);});
  }
  return{Skin,Wax,WetWax,GripMaterial,Update,PrepareContact:contact.Prepare,SetOutside(value){state.outside.value=value;},SetContact:contact.SetEnabled,Probe(){return{...contact.Probe(),pbr:['albedo','normal','roughness','ao'],sss:'thin-layer single-scattering approximation',sssStrength:state.sss.value,outerPbr:'Texture_OuterSkinPbrAtlas.png',outerSss:'separate thin-pinna transmission approximation',outerSssStrength:state.outerSss.value};}};
}
