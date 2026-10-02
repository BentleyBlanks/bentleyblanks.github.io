import * as THREE from 'three';
import {SURFACE_GLSL,BindWaxAppearance} from './Script_SurfaceDetail.js?v=ear041-material-response-20261003';
import {CreateContactOcclusion} from './Script_ContactOcclusion.js?v=ear041-material-response-20261003';
// imagegen 的图集按通道拆成 GPU 纹理；法线/粗糙度/AO 保持线性，颜色才走 sRGB。
export async function CreateTactileMaterials(renderer) {
  const loader=new THREE.TextureLoader(),contact=CreateContactOcclusion();
  let quality={wetness:1,detail:1,detailLayers:3,scattering:1,contact:1,contactSamples:4};
  const qualityUniforms={earWetQuality:{value:1},earSurfaceDetail:{value:1},earReflectionQuality:{value:1},earDetailLayers:{value:3}},qualityMaterials=new Set();
  function ConfigureMaterial(material){
    if(!material.isMeshStandardMaterial||qualityMaterials.has(material))return material;
    qualityMaterials.add(material);material.addEventListener('dispose',()=>qualityMaterials.delete(material));
    material.userData.renderTransmission??=material.transmission||0;
    const compile=material.onBeforeCompile,cacheKey=material.customProgramCacheKey();
    if(!compile.earRenderQuality){
      const wrapper=shader=>{
        compile(shader);Object.assign(shader.uniforms,qualityUniforms);
        shader.fragmentShader='uniform float earWetQuality;uniform float earSurfaceDetail;uniform float earReflectionQuality;uniform int earDetailLayers;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <envmap_physical_pars_fragment>',THREE.ShaderChunk.envmap_physical_pars_fragment
          .replaceAll('envMapIntensity','(envMapIntensity*earReflectionQuality)')
          .replace('vec3 getIBLIrradiance( const in vec3 normal ) {','vec3 getIBLIrradiance( const in vec3 normal ) { if(earReflectionQuality<=0.0)return vec3(0.0);')
          .replace('vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {','vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) { if(earReflectionQuality<=0.0)return vec3(0.0);'));
        shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`if(earSurfaceDetail>0.0){
          #include <normal_fragment_maps>
          normal=normalize(mix(nonPerturbedNormal,normal,earSurfaceDetail));
        }`);
        shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_fragment>',`#include <lights_physical_fragment>
          #ifdef USE_CLEARCOAT
            material.clearcoat*=earWetQuality;
          #endif`);
      };
      wrapper.earRenderQuality=true;material.onBeforeCompile=wrapper;
      material.customProgramCacheKey=()=>cacheKey+'RenderQuality1';material.needsUpdate=true;
    }
    ApplyMaterialQuality(material);return material;
  }
  function ApplyMaterialQuality(material){
    if('transmission' in material){const value=quality.wetness?material.userData.renderTransmission:0;if((material.transmission>0)!==(value>0))material.needsUpdate=true;material.transmission=value;}
  }
  function SetQuality(next){
    quality={...next};qualityUniforms.earWetQuality.value=next.wetness;qualityUniforms.earReflectionQuality.value=next.reflections;qualityUniforms.earSurfaceDetail.value=next.detail;qualityUniforms.earDetailLayers.value=next.detailLayers;
    state.sss.value=.18*next.scattering;state.outerSss.value=.58*next.scattering;contact.SetQuality(next.contact,next.contactSamples);
    for(const material of qualityMaterials)ApplyMaterialQuality(material);
  }
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
  const state={outerSss:{value:.58},outside:{value:0},sss:{value:.18},light:{value:new THREE.Vector3()},power:{value:0},marks:{value:marks},wet:{value:wet}};
  function Skin({outer=false,vestibule=false}={}){
    const maps=Object.fromEntries(Object.entries(outer?outerSkin:skin).map(([k,t])=>{const c=t.clone();c.repeat.set(outer?1:4,outer?1:5);if(outer)c.wrapS=c.wrapT=THREE.MirroredRepeatWrapping;return[k,c];}));
    const material=new THREE.MeshPhysicalMaterial({...maps,color:new THREE.Color().setRGB(.99,1.20,1.23),roughness:1,metalness:0,normalScale:new THREE.Vector2(outer?.18:.085,outer?.18:.085),aoMapIntensity:outer?.18:.42,clearcoat:1,clearcoatRoughness:.24,side:THREE.DoubleSide});
    material.userData.kind='skin';
    if(outer&&!vestibule){material.normalScale.set(.10,.10);material.ior=1.4;material.specularIntensity=.65;}
    material.onBeforeCompile=shader=>{
      shader.uniforms.earOutside=state.outside;shader.uniforms.earSss=outer?state.outerSss:state.sss;shader.uniforms.earLamp=state.light;shader.uniforms.earPower=state.power;shader.uniforms.earMarks=state.marks;shader.uniforms.earWet=state.wet;
      shader.vertexShader=(vestibule?'attribute float vestibuleDepth;varying float mouthDepth;\n':'')+'varying vec3 earWorld;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nearWorld=(modelMatrix*vec4(position,1.0)).xyz;\n'+(vestibule?'mouthDepth=vestibuleDepth;\n':'')+(outer?'':`for(int i=0;i<9;i++){float d=distance(earWorld,earMarks[i].xyz);float bump=exp(-d*d/0.65)*earMarks[i].w;transformed+=normal*bump*0.035;}`));
      if(!outer)shader.vertexShader='uniform vec4 earMarks[9];\n'+shader.vertexShader;
      shader.fragmentShader=SURFACE_GLSL+(vestibule?'varying float mouthDepth;\n':'')+'uniform float earOutside;varying vec3 earWorld;uniform float earSss;uniform vec3 earLamp;uniform float earPower;uniform vec4 earMarks[9];uniform vec4 earWet[9];\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        float localIrritation=0.0;float localWet=0.0;
        ${outer?'':`// Remove the atlas' uniform red cast while retaining its anatomical colour variation.
        float skinLuma=dot(diffuseColor.rgb,vec3(.299,.587,.114));
        diffuseColor.rgb=mix(diffuseColor.rgb,skinLuma*vec3(1.34,.90,.73),.52);
        float perfusionNoise=SurfaceNoise(earWorld*1.4);
        diffuseColor.rgb*=mix(vec3(.96,.91,.88),vec3(1.035,1.03,1.015),perfusionNoise);`}
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
        ${outer?'':`for(int i=0;i<9;i++){float d=distance(earWorld,earMarks[i].xyz);localIrritation=max(localIrritation,exp(-d*d/0.6)*earMarks[i].w);float w=distance(earWorld,earWet[i].xyz);localWet=max(localWet,exp(-w*w/1.1)*earWet[i].w*earWetQuality);}`}
        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.16,.47,.40),clamp(localIrritation,0.0,.72));`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(clamp(.52+(roughnessFactor-.5)*.22,.40,.65),0.23,localWet);');
      shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
        float skinRelief=earSurfaceDetail*(1.0-localWet*.45)*(
          (earDetailLayers>0?(SurfaceNoise(earWorld*9.0)-.5)*.0025*SurfaceFilter(earWorld,9.0):0.0)+
          (earDetailLayers>1?(SurfaceNoise(earWorld*43.0)-.5)*.0008*SurfaceFilter(earWorld,43.0):0.0));
        normal=SurfaceNormal(normal,skinRelief,-vViewPosition);
      `);
      if(outer&&!vestibule){
        shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(.43+(roughnessFactor-.5)*.20,.35,.55);');
        // Per-light diffusion approximation: broaden the red-channel light transition.
        // Incident radiance already contains lamp distance, intensity and shadow attenuation.
        const skinDiffuse=`
          float skinNL=dot(geometryNormal,directLight.direction);
          vec3 skinWrap=vec3(.55,.24,.14);
          vec3 skinLobe=max(vec3(skinNL)+skinWrap,vec3(0.0))/(1.0+skinWrap);
          vec2 pinnaOffset=earWorld.xy/vec2(25.0,39.0);
          float pinna=exp(-dot(pinnaOffset,pinnaOffset)*1.6)*(1.0-smoothstep(9.0,24.0,earWorld.z));
          float grazing=1.0-abs(dot(geometryNormal,geometryViewDir));
          float thin=pinna*(.22+.78*grazing*grazing);
          float backlight=pow(max(0.0,dot(-directLight.direction,geometryViewDir)),3.0);
          vec3 transmission=vec3(1.0,.24,.12)*thin*backlight*.85;
          vec3 response=mix(vec3(dotNL),skinLobe+transmission,earSss*earOutside);
          reflectedLight.directDiffuse+=directLight.color*response*BRDF_Lambert(material.diffuseContribution);`;
        shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_pars_fragment>',THREE.ShaderChunk.lights_physical_pars_fragment.replace('reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution );',skinDiffuse));
      }
      shader.fragmentShader=shader.fragmentShader.replace('#include <clearcoat_normal_fragment_begin>','#include <clearcoat_normal_fragment_begin>');
      shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_fragment>','#include <lights_physical_fragment>\nmaterial.clearcoat=(.055+localWet*.62)*earWetQuality;');
      // 薄皮层的单次散射近似：依赖实际灯距、受光角和遮蔽，不给深处加无条件自发光。
      shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',outer?'#include <lights_fragment_end>':`#include <lights_fragment_end>
        vec3 earL=(viewMatrix*vec4(earLamp-earWorld,0.0)).xyz;
        float earDistance=max(length(earL),0.5);
        float wrap=pow(clamp((dot(normal,normalize(earL))+.45)/1.45,0.0,1.0),1.7);
        reflectedLight.directDiffuse+=diffuseColor.rgb*vec3(1.0,.32,.18)*wrap*earSss*min(earPower/(earDistance*earDistance),2.0);`);
    };
    const skinCompile=material.onBeforeCompile;material.onBeforeCompile=shader=>{skinCompile(shader);if(!outer)contact.Bind(shader);if(outer&&!vestibule)material.userData.skinSssShader=shader;};
    material.customProgramCacheKey=()=>outer?(vestibule?'EarSkinRecessedVestibule6':'EarSkinLightDiffusion5'):'EarSkinCanalMicrorelief3';return ConfigureMaterial(material);
  }
  function Wax(type,tone='brown'){
    if(type==='oily'){
      const material=new THREE.MeshPhysicalMaterial({color:0xd2aa75,map:wax.map,roughness:.16,normalMap:wax.normalMap,normalScale:new THREE.Vector2(.022,.022),metalness:0,ior:1.46,transmission:.84,thickness:1,attenuationColor:0xb17f43,attenuationDistance:1.2,clearcoat:.82,clearcoatRoughness:.22,specularIntensity:.8,envMapIntensity:.42});
      material.userData.waxWet={value:1};material.userData.waxSoft={value:0};material.userData.oily=true;
      // 弯曲体积的远侧折边必须被近侧挡住；关闭深度写入会出现交叉黑线。
      material.transparent=true;material.depthWrite=true;
      material.userData.gelDetail={value:1};
      material.onBeforeCompile=shader=>{
        shader.vertexShader='attribute vec3 gelRest;attribute float gelThickness;varying vec3 gelLocal;varying float gelPath;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ngelLocal=gelRest;gelPath=gelThickness;');
        shader.uniforms.gelDetail=material.userData.gelDetail;
        shader.fragmentShader=`varying vec3 gelLocal;varying float gelPath;uniform float gelDetail;
          float GelHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
          float GelNoise(vec3 p){
            vec3 i=floor(p),f=fract(p);f=f*f*f*(f*(f*6.0-15.0)+10.0);
            return mix(mix(mix(GelHash(i),GelHash(i+vec3(1,0,0)),f.x),mix(GelHash(i+vec3(0,1,0)),GelHash(i+vec3(1,1,0)),f.x),f.y),
              mix(mix(GelHash(i+vec3(0,0,1)),GelHash(i+vec3(1,0,1)),f.x),mix(GelHash(i+vec3(0,1,1)),GelHash(i+vec3(1,1,1)),f.x),f.y),f.z);
          }
          vec3 GelPerturb(vec3 n,float height,vec3 viewPoint){
            vec3 sx=dFdx(viewPoint),sy=dFdy(viewPoint),rx=cross(sy,n),ry=cross(n,sx);
            float determinant=dot(sx,rx);
            return normalize(abs(determinant)*n-sign(determinant)*(dFdx(height)*rx+dFdy(height)*ry));
          }
        `+shader.fragmentShader;
        // 毫米尺度的材料空间起伏会随凝胶一起拉长；屏幕导数滤掉亚像素噪声。
        shader.fragmentShader=shader.fragmentShader.replace('#include <envmap_physical_pars_fragment>',THREE.ShaderChunk.envmap_physical_pars_fragment
          .replaceAll('envMapIntensity','(envMapIntensity*earReflectionQuality)')
          .replace('vec3 getIBLIrradiance( const in vec3 normal ) {','vec3 getIBLIrradiance( const in vec3 normal ) { if(earReflectionQuality<=0.0)return vec3(0.0);')
          .replace('vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {','vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) { if(earReflectionQuality<=0.0)return vec3(0.0);'));
        shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
          float gelPixel=max(length(dFdx(gelLocal)),length(dFdy(gelLocal)));
          float gelRelief=gelDetail*earSurfaceDetail*mix(.20,1.0,smoothstep(.025,.55,gelPath))*(
            (earDetailLayers>0?.005*GelNoise(gelLocal*6.5)*(1.0-smoothstep(.05,.16,gelPixel)):0.0)+
            (earDetailLayers>1?.0025*GelNoise(gelLocal*21.0+7.1)*(1.0-smoothstep(.018,.05,gelPixel)):0.0)+
            (earDetailLayers>2?.0008*GelNoise(gelLocal*57.0+19.4)*(1.0-smoothstep(.006,.018,gelPixel)):0.0));
          normal=GelPerturb(normal,gelRelief,-vViewPosition);
        `);
        shader.fragmentShader=shader.fragmentShader.replace('#include <clearcoat_normal_fragment_maps>','#include <clearcoat_normal_fragment_maps>\nclearcoatNormal=GelPerturb(clearcoatNormal,gelRelief*.50,-vViewPosition);');
        shader.fragmentShader=shader.fragmentShader.replace('#include <transmission_fragment>',THREE.ShaderChunk.transmission_fragment.replace('material.thickness = thickness;', 'material.thickness = max(.01,gelPath);').replace('material.transmission = transmission;', 'material.transmission = mix(.36,.97,exp(-gelPath*3.2))*earWetQuality;').replace('material.diffuseContribution, material.specularColorBlended','mix(vec3(1.0),material.diffuseContribution,smoothstep(.06,.65,gelPath)), material.specularColorBlended'));
        shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(.5,mix(.15,.26,smoothstep(.02,.65,gelPath)),earWetQuality);');
        shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','diffuseColor.a*=smoothstep(.008,.075,gelPath);\n#include <opaque_fragment>');
        shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
          float cloud=GelNoise(gelLocal*2.2);
          float lipidDetail=dot(texture2D(map,vMapUv).rgb,vec3(.299,.587,.114));
          diffuseColor.rgb=diffuse*mix(vec3(.76,.62,.45),vec3(1.06,1.00,.91),clamp(cloud*.45+smoothstep(.025,.42,lipidDetail)*.55,0.0,1.0));
          diffuseColor.rgb*=.96+cloud*.08;
        `);
        shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
          float rim=pow(1.0-abs(dot(normal,geometryViewDir)),2.5);
          reflectedLight.directDiffuse+=diffuseColor.rgb*reflectedLight.directDiffuse*(.20+rim*.8)*earWetQuality;
        `);
        contact.Bind(shader,{self:material.userData.contactSelf});material.userData.contactShader=shader;
      };material.customProgramCacheKey=()=> 'OilyLipidScattering4';return ConfigureMaterial(material);
    }
    const pale=tone==='paleYellow';
    const material=new THREE.MeshPhysicalMaterial({...wax,color:type==='impacted'?0xcbb588:type==='wet'?0xd1bfa1:0xfff3d5,roughness:type==='wet'?.27:1,normalScale:new THREE.Vector2(pale?.11:.22,pale?.11:.22),aoMapIntensity:pale?.35:.58,clearcoat:type==='wet'?.8:0,clearcoatRoughness:.13,metalness:0});
    material.depthWrite=true;material.transparent=false;material.ior=1.46;
    material.userData.waxWet={value:0};material.userData.waxSoft={value:0};
    material.onBeforeCompile=shader=>{
      shader.uniforms.waxWet=material.userData.waxWet;shader.uniforms.waxSoft=material.userData.waxSoft;
      shader.fragmentShader='uniform float waxWet;uniform float waxSoft;\n'+shader.fragmentShader;
      BindWaxAppearance(shader,{type,pale});
      shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`
        diffuseColor.rgb*=mix(vec3(1.0),vec3(.76,.65,.48),waxRenderWet*.55+waxRenderSoft*.45);
        #include <roughnessmap_fragment>`);
      contact.Bind(shader,{self:material.userData.contactSelf,wall:material.userData.contactWall});material.userData.contactShader=shader;};material.customProgramCacheKey=()=> 'WaxMaterialResponse4'+type+pale;
    return ConfigureMaterial(material);
  }
  function WetWax(material,softness,wetness,type){
    if(type==='oily'){material.roughness=.5+(.16-softness*.035-.5)*quality.wetness;material.clearcoatRoughness=.22;return;}
    // Keep physical state independent of quality, including frozen tray copies.
    material.userData.waxWet.value=wetness;material.userData.waxSoft.value=softness;
    material.roughness=(type==='wet'?.65-.38*quality.wetness:1)*(1-wetness*quality.wetness*.81);
    material.clearcoat=Math.max(type==='wet'?.8:0,wetness*.98);material.clearcoatRoughness=.18;
    const normal=material.userData.dryNormalScale||(material.userData.dryNormalScale=material.normalScale.clone());
    material.normalScale.copy(normal).multiplyScalar(1-softness*.72);
  }
  function Drum(geometry){
    geometry.computeBoundingBox();const center=geometry.boundingBox.getCenter(new THREE.Vector3());
    const material=new THREE.MeshPhysicalMaterial({color:0xffffff,roughness:.34,metalness:0,ior:1.38,specularIntensity:.48,clearcoat:.18,clearcoatRoughness:.26,side:THREE.DoubleSide});
    material.onBeforeCompile=shader=>{
      shader.uniforms.membraneCenter={value:center};
      shader.vertexShader='uniform vec3 membraneCenter;varying vec3 membraneLocal;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nmembraneLocal=position-membraneCenter;');
      shader.fragmentShader='varying vec3 membraneLocal;\n'+SURFACE_GLSL+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        float membraneRadius=length(membraneLocal.xy);
        float membraneAngle=atan(membraneLocal.y,membraneLocal.x);
        float membraneCloud=SurfaceNoise(membraneLocal*2.8);
        float membraneFibre=sin(membraneAngle*96.0+membraneRadius*4.0);
        float membraneRim=smoothstep(2.0,3.1,membraneRadius);
        float membraneHandle=exp(-pow((membraneLocal.x+.19*membraneLocal.y)/.14,2.0))*smoothstep(-.7,.4,membraneLocal.y);
        diffuseColor.rgb*=mix(vec3(.34,.285,.265),vec3(.62,.55,.46),membraneCloud)*mix(1.0,.65,membraneRim);
        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*1.45,membraneHandle*.42);
      `);
      shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
        float membraneRelief=earSurfaceDetail*(membraneFibre*.0008*SurfaceFilter(membraneLocal,40.0)+membraneCloud*.002);
        normal=SurfaceNormal(normal,membraneRelief,-vViewPosition);
      `);
    };
    material.customProgramCacheKey=()=> 'PearlMembraneRadialFibres1';return ConfigureMaterial(material);
  }
  function Update(chunks,lamp,dt=0){
    contact.Update(chunks,lamp,dt);state.light.value.copy(lamp.position);state.power.value=lamp.intensity;
    const originals=chunks.filter(c=>!c.fragment).slice(0,9);
    for(let i=originals.length;i<9;i++){marks[i].set(0,0,0,0);wet[i].set(0,0,0,0);}
    originals.forEach((c,i)=>{marks[i].set(c.origin.x,c.origin.y,c.origin.z,c.irritation||0);wet[i].set(c.origin.x,c.origin.y,c.origin.z,c.surfaceWet||c.softened||0);});
  }
  return{Skin,Drum,Wax,WetWax,GripMaterial,Update,SetQuality,ConfigureMaterial,PrepareContact:contact.Prepare,SetOutside(value){state.outside.value=value;},SetContact:contact.SetEnabled,Probe(){return{...contact.Probe(),materialResponse:'shell thickness, bending strain and cohesive damage',membraneDetail:'radial collagen and pearl roughness approximation',surfaceDetail:quality.detail,detailLayers:quality.detailLayers,wetRendering:quality.wetness,pbr:['albedo','normal','roughness','ao'],sss:'thin-layer single-scattering approximation',sssStrength:state.sss.value,outerPbr:'Texture_OuterSkinPbrAtlas.png',outerSss:'per-light RGB diffusion and thin-pinna backlighting approximation',outerSssStrength:state.outerSss.value};}};
}
