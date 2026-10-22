import * as THREE from 'three';
import {SURFACE_GLSL} from './Script_SurfaceDetail.js?v=ear050-career-care-20261022';

// Forward-rendered skin: normalized angular diffusion and two dielectric GGX lobes.
// This is a local approximation, not UE's screen-space Burley diffusion pass.
const PORTRAIT_GLSL=`
varying vec3 earWorld;
uniform float earOutside;
uniform float earSss;
vec3 portraitDiffuseNormal;
vec3 portraitBroadRadiance=vec3(0.0);
vec3 portraitTightRadiance=vec3(0.0);
float portraitOil;
float portraitLobeMix;
float PortraitBroadRoughness(float r){return clamp(r+.10,.38,.70);}
float PortraitTightRoughness(float r){return clamp(r*.57,.19,.34);}
vec3 PortraitDiffusion(float cosine,vec3 width){
  // Integral over incoming directions is PI, matching the unwrapped cosine.
  // Wider red transport redistributes light instead of adding a red fill light.
  return max(vec3(cosine)+width,vec3(0.0))/((1.0+width)*(1.0+width));
}
vec2 PortraitUv(vec2 uv){
  // Break the atlas's 20 mm repeat with a continuous, low-frequency material warp.
  return uv+vec2(SurfaceNoise(earWorld*.071),SurfaceNoise(earWorld*.053+vec3(7.1,3.8,.4)))*.13;
}
`;

const PORTRAIT_COLOR=`
  vec2 cheekOffset=(earWorld.xy+vec2(45.0,13.0))/vec2(29.0,27.0);
  vec2 noseOffset=(earWorld.xy+vec2(87.0,16.0))/vec2(13.0,19.0);
  vec2 earOffset=earWorld.xy/vec2(23.0,35.0);
  vec2 foreheadOffset=(earWorld.xy-vec2(-52.0,42.0))/vec2(37.0,32.0);
  float cheek=exp(-dot(cheekOffset,cheekOffset));
  float nose=exp(-dot(noseOffset,noseOffset));
  float pinna=exp(-dot(earOffset,earOffset))*(1.0-smoothstep(10.0,26.0,earWorld.z));
  float forehead=exp(-dot(foreheadOffset,foreheadOffset));
  float lip=exp(-pow((earWorld.y+51.0)/5.0,4.0)-pow((earWorld.z-63.2)/19.0,4.0))*smoothstep(67.0,75.0,-earWorld.x);
  float complexion=SurfaceNoise(earWorld*.12+vec3(3.7,9.3,1.1))-.5;
  float capillary=SurfaceNoise(earWorld*.83+vec3(8.1,2.7,4.3))-.5;
  float perfusion=clamp(cheek*.37+nose*.16+pinna*.29+complexion*.08,0.0,.44);
  diffuseColor.rgb*=mix(vec3(1.0),vec3(1.065,.82,.90),perfusion);
  diffuseColor.rgb*=vec3(1.0+complexion*.025+capillary*.012,1.0+complexion*.015,1.0+complexion*.022);
  diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.37,.105,.105),lip*.74);
  portraitOil=clamp(nose*.78+forehead*.25+cheek*.15+lip*.38,0.0,.90);
  portraitLobeMix=.18+portraitOil*.20;
`;

const PORTRAIT_DIRECT_DIFFUSE=`
  float skinNL=dot(portraitDiffuseNormal,directLight.direction);
  vec3 shallow=PortraitDiffusion(skinNL,vec3(.10,.055,.035));
  vec3 deep=PortraitDiffusion(skinNL,vec3(.48,.20,.10));
  vec3 diffusion=mix(shallow,deep,.55);
  vec2 pinnaOffset=earWorld.xy/vec2(25.0,39.0);
  float pinna=exp(-dot(pinnaOffset,pinnaOffset)*1.6)*(1.0-smoothstep(9.0,24.0,earWorld.z));
  float helix=smoothstep(.23,.88,length(earWorld.xy/vec2(19.0,32.0)));
  float thin=pinna*(.25+.75*helix);
  float transmittedCosine=max(0.0,-skinNL);
  float forwardPhase=.55+.45*pow(max(0.0,dot(-directLight.direction,geometryViewDir)),2.0);
  vec3 transmission=transmittedCosine*forwardPhase*vec3(.92,.27,.13);
  // Thin cartilage spends part of the same diffuse budget on back transmission.
  diffusion=mix(diffusion,transmission,thin*.36);
  vec3 response=mix(vec3(dotNL),diffusion,clamp(earSss*earOutside,0.0,1.0));
  float viewCosine=max(0.0,dot(geometryNormal,geometryViewDir));
  vec3 surfaceReflectance=F_Schlick(material.specularColorBlended,material.specularF90,viewCosine);
  reflectedLight.directDiffuse+=directLight.color*response*(1.0-surfaceReflectance)*BRDF_Lambert(material.diffuseContribution);
`;

const PORTRAIT_DIRECT_SPECULAR=`
  PhysicalMaterial broadSkin=material;
  PhysicalMaterial tightSkin=material;
  broadSkin.roughness=PortraitBroadRoughness(material.roughness);
  tightSkin.roughness=PortraitTightRoughness(material.roughness);
  vec3 broadReflection=BRDF_GGX_Multiscatter(directLight.direction,geometryViewDir,geometryNormal,broadSkin);
  vec3 tightReflection=BRDF_GGX_Multiscatter(directLight.direction,geometryViewDir,geometryNormal,tightSkin);
  reflectedLight.directSpecular+=irradiance*mix(broadReflection,tightReflection,portraitLobeMix);
`;

export function BindPortraitSkin(material,state){
  // Neutralize the reusable atlas's orange bias before regional blood perfusion.
  material.color.setRGB(.94,1.25,1.55);
  material.normalScale.set(.075,.075);
  material.aoMapIntensity=.12;
  material.ior=1.44;
  material.specularIntensity=.95;
  // The tight lobe represents skin surface oils. A third clearcoat would overglaze it.
  material.clearcoat=0;
  material.userData.portraitSkin={diffusion:'normalized two-scale angular approximation',specular:'weighted dual dielectric GGX',poreScaleMm:.30};
  material.onBeforeCompile=shader=>{
    shader.uniforms.earOutside=state.outside;
    shader.uniforms.earSss=state.outerSss;
    shader.vertexShader='varying vec3 earWorld;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nearWorld=(modelMatrix*vec4(position,1.0)).xyz;');
    shader.fragmentShader=SURFACE_GLSL+PORTRAIT_GLSL+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',THREE.ShaderChunk.map_fragment
      .replace('texture2D( map, vMapUv )','texture2D( map, PortraitUv(vMapUv) )')
      // The existing atlas includes a visible pore-light pattern. Keep fine pigment
      // variation but let the light/normal response supply pore contrast at runtime.
      .replace('diffuseColor *= sampledDiffuseColor;','sampledDiffuseColor.rgb=mix(vec3(.779,.388,.266),sampledDiffuseColor.rgb,.58);\ndiffuseColor *= sampledDiffuseColor;'));
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`
      #if defined(USE_COLOR) || defined(USE_COLOR_ALPHA)
        diffuseColor.rgb*=mix(vec3(1.0),vColor.rgb,.74);
      #endif
      ${PORTRAIT_COLOR}`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',THREE.ShaderChunk.roughnessmap_fragment
      .replace('texture2D( roughnessMap, vRoughnessMapUv )','texture2D( roughnessMap, PortraitUv(vRoughnessMapUv) )')+`
      roughnessFactor=clamp(.46+(roughnessFactor-.52)*.30-portraitOil*.09+complexion*.025,.32,.56);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      float poreFilter=SurfaceFilter(earWorld,3.3);
      float microFilter=SurfaceFilter(earWorld,12.0);
      float pores=earDetailLayers>0?pow(smoothstep(.54,.91,SurfaceNoise(earWorld*3.3)),2.0):0.0;
      float microSkin=earDetailLayers>1?SurfaceNoise(earWorld*12.0+vec3(2.2,8.7,1.6))-.5:0.0;
      float skinRelief=earSurfaceDetail*(-pores*.0034*poreFilter+microSkin*.00055*microFilter);
      normal=SurfaceNormal(normal,skinRelief,-vViewPosition);
      portraitDiffuseNormal=normalize(mix(nonPerturbedNormal,normal,.24));
    `);
    let physical=THREE.ShaderChunk.lights_physical_pars_fragment
      .replace('reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution );',PORTRAIT_DIRECT_DIFFUSE)
      .replace('reflectedLight.directSpecular += irradiance * BRDF_GGX_Multiscatter( directLight.direction, geometryViewDir, geometryNormal, material );',PORTRAIT_DIRECT_SPECULAR);
    // Keep both image-based lobes and their multiple-scattering energy terms separate.
    physical=physical.replace('vec3 singleScatteringDielectric = vec3( 0.0 );',`vec3 singleScatteringDielectric=vec3(0.0);
      vec3 portraitBroadSingle=vec3(0.0),portraitBroadMulti=vec3(0.0);
      vec3 portraitTightSingle=vec3(0.0),portraitTightMulti=vec3(0.0);`)
      .replace('computeMultiscattering( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.roughness, singleScatteringDielectric, multiScatteringDielectric );',`
        computeMultiscattering(geometryNormal,geometryViewDir,material.specularColor,material.specularF90,PortraitBroadRoughness(material.roughness),portraitBroadSingle,portraitBroadMulti);
        computeMultiscattering(geometryNormal,geometryViewDir,material.specularColor,material.specularF90,PortraitTightRoughness(material.roughness),portraitTightSingle,portraitTightMulti);
        singleScatteringDielectric=mix(portraitBroadSingle,portraitTightSingle,portraitLobeMix);
        multiScatteringDielectric=mix(portraitBroadMulti,portraitTightMulti,portraitLobeMix);`)
      .replace('vec3 indirectSpecular = radiance * singleScattering;','vec3 indirectSpecular=mix(portraitBroadRadiance*portraitBroadSingle,portraitTightRadiance*portraitTightSingle,portraitLobeMix);');
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_pars_fragment>',physical);
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_maps>',THREE.ShaderChunk.lights_fragment_maps
      .replace('radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );',`
        portraitBroadRadiance=getIBLRadiance(geometryViewDir,geometryNormal,PortraitBroadRoughness(material.roughness));
        portraitTightRadiance=getIBLRadiance(geometryViewDir,geometryNormal,PortraitTightRoughness(material.roughness));
        radiance+=mix(portraitBroadRadiance,portraitTightRadiance,portraitLobeMix);`));
    material.userData.skinSssShader=shader;
  };
  material.customProgramCacheKey=()=> 'EarPortraitSkinNormalizedDualLobe1';
  return material;
}
