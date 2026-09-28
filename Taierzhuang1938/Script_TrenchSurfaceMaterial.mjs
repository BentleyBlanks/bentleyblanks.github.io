import * as THREE from 'three';
import { MakeTerrainPatch } from './Script_TerrainMaterial.mjs';
import { TerrainBlendUniforms, TERRAIN_BLEND_GLSL } from './Script_TerrainBlend.mjs';
import { SurfacePatchEnd } from './Script_MaterialPatches.mjs';
import { TerrainQualityOf, TERRAIN_WATER as W } from './Data_Tuning_Terrain.mjs';
import { TERRAIN_CONTACT_GLSL } from './Script_TerrainContact.mjs';
import { TRENCH_SURFACE as C } from './Data_TrenchSurface.mjs';

// 基础地形那段 GLSL 被包进下面的非一致分支（纯沟土像素跳过它），导数在分支外求好；
// 湿泥/积水等壕沟这一路（沟底凹度只有这里有接触高度场）算完再统一上。
const Common = /* glsl */`
#define TERRAIN_HOISTED_DERIVATIVES
#define TERRAIN_WATER_EXTERNAL
uniform vec4 uTrenchMud;
uniform vec4 uTrenchWater;   // x 沟底积水 y 沟底底湿度 z,w 凹度（米）[起, 满]
uniform float uTrenchPom;
float gTrenchWet=0.0;
float gTrenchContact=0.0;
float gTrenchShadow=1.0;
float SoilHeight(vec2 uv,vec2 offA,vec2 offB,float blend,float lod){
  if(blend>.999)return textureLod(uTerrainAlbedo,vec3(uv+offB,3.0),lod).a;
  float a=textureLod(uTerrainAlbedo,vec3(uv+offA,3.0),lod).a;
  if(blend<.001)return a;
  return mix(a,textureLod(uTerrainAlbedo,vec3(uv+offB,3.0),lod).a,blend);
}
// Adaptive ray march followed by binary intersection refinement. All material
// channels use the SAME hit UV; filtering height in the march avoids distant shimmer.
void SoilPlane(vec3 world,vec3 geomN,vec3 dx,vec3 dy,int axis,float weight,vec3 lightW,
  out vec3 color,out vec3 perturb,out vec3 roughAo,out float shadow) {
  color=vec3(0);perturb=vec3(0);roughAo=vec3(0);shadow=1.0;
  if(weight<.015)return;
  vec2 p=axis==0?world.xz:axis==1?vec2(world.z,-world.y):vec2(world.x,-world.y);
  vec2 gx=axis==0?dx.xz:axis==1?vec2(dx.z,-dx.y):vec2(dx.x,-dx.y);
  vec2 gy=axis==0?dy.xz:axis==1?vec2(dy.z,-dy.y):vec2(dy.x,-dy.y);
  vec3 vw=normalize(cameraPosition-world);
  float facing=max(abs(dot(vw,geomN)),.12);
  vec3 tangentView=vw-geomN*dot(vw,geomN);
  vec2 vp=axis==0?tangentView.xz:axis==1?vec2(tangentView.z,-tangentView.y):vec2(tangentView.x,-tangentView.y);
  float inv=1.0/${C.mud.baseTileM.toFixed(3)};
  vec2 uv=p*inv;
  float variant=TerrainNoise(p*.13)*8.0,band=floor(variant);
  float blend=smoothstep(.42,.58,fract(variant));
  vec2 offA=sin(vec2(3,7)*band),offB=sin(vec2(3,7)*(band+1.0));
  float nearFade=uTrenchPom*(1.0-smoothstep(${C.mud.parallaxNearM.toFixed(1)},${C.mud.parallaxFarM.toFixed(1)},length(vViewPosition)));
  float slope=1.0-smoothstep(.45,.95,geomN.y);
  float relief=${C.mud.pomReliefM.toFixed(3)}*mix(.18,1.0,slope);
  float lod=max(0.0,log2(max(length(gx),length(gy))*inv*float(textureSize(uTerrainAlbedo,0).x))-.7);
  vec2 delta=vp/facing*relief*inv*nearFade;
  vec2 at=uv;float hitDepth=.5;
  if(nearFade>.02&&weight>.15){
    float steps=mix(float(${C.mud.pomMaxSteps}),float(${C.mud.pomMinSteps}),clamp(facing,0.0,1.0));
    steps=mix(float(${C.mud.pomMinSteps}),steps,nearFade);
    float stepDepth=1.0/ceil(steps),depth=0.0,previous=0.0;
    for(int i=0;i<${C.mud.pomMaxSteps};i++){
      at=uv+delta*(.5-depth);
      if(1.0-depth<=SoilHeight(at,offA,offB,blend,lod))break;
      previous=depth;depth=min(1.0,depth+stepDepth);
    }
    // Keep a bracket on opposite sides of the height field, rather than simply
    // stopping at the first layer (which produces terraces under camera movement).
    for(int i=0;i<${C.mud.pomRefineSteps};i++){
      float mid=(previous+depth)*.5;
      if(1.0-mid>SoilHeight(uv+delta*(.5-mid),offA,offB,blend,lod))previous=mid;else depth=mid;
    }
    hitDepth=(previous+depth)*.5;at=uv+delta*(.5-hitDepth);
  }
  vec4 a=TerrainVpMix(textureGrad(uTerrainAlbedo,vec3(at+offA,3.0),gx*inv,gy*inv),
    textureGrad(uTerrainAlbedo,vec3(at+offB,3.0),gx*inv,gy*inv),blend,uTerrainAlbedoMean[3]);
  vec4 s=mix(textureGrad(uTerrainSurface,vec3(at+offA,3.0),gx*inv,gy*inv),
    textureGrad(uTerrainSurface,vec3(at+offB,3.0),gx*inv,gy*inv),blend);
  float height=SoilHeight(at,offA,offB,blend,lod);
  color=mix(uTerrainAlbedoMean[3].rgb,a.rgb,.88);roughAo=vec3(s.ba,height);
  float ndl=dot(lightW,geomN);
  if(nearFade>.02&&weight>.15&&ndl>.08) {
    vec3 tangentLight=lightW-geomN*ndl;
    vec2 lp=axis==0?tangentLight.xz:axis==1?vec2(tangentLight.z,-tangentLight.y):vec2(tangentLight.x,-tangentLight.y);
    float rise=(1.0-height)/float(${C.mud.shadowSteps});
    vec2 lightStep=lp/max(ndl,.12)*relief*inv*rise;
    for(int j=1;j<=${C.mud.shadowSteps};j++){
      float h=SoilHeight(at+lightStep*float(j),offA,offB,blend,lod);
      shadow=min(shadow,1.0-smoothstep(.012,.075,h-height-rise*float(j))*.82*nearFade);
    }
  }
  vec2 n=(s.rg*2.0-1.0)*${C.mud.normalScale.toFixed(3)}*mix(.35,1.0,slope);
  perturb=axis==0?vec3(n.x,0,n.y):axis==1?vec3(0,-n.y,n.x):vec3(n.x,-n.y,0);
  perturb-=geomN*dot(geomN,perturb);
}
// 世界高度遮蔽；顺带给出「沟底凹度」low：四个方向 1.2 / 3.2 m 处比这里高多少的均值
//（沟底两侧是沟壁 → 大；沟沿与抛土顶四周更低 → 0），积水只落在沟底，不落在沟沿上。
float SoilHorizon(vec3 world,vec3 normalW,out float low) {
  float sum=0.0,rise=0.0;
  for(int i=0;i<4;i++){
    vec2 direction=i==0?vec2(1,0):i==1?vec2(-1,0):i==2?vec2(0,1):vec2(0,-1);
    float nearH=ContactSurface(world.xz+direction*1.2).w;
    float farH=ContactSurface(world.xz+direction*3.2).w;
    vec3 nearRay=normalize(vec3(direction.x*1.2,nearH-world.y-.03,direction.y*1.2));
    vec3 farRay=normalize(vec3(direction.x*3.2,farH-world.y-.03,direction.y*3.2));
    sum+=max(0.0,max(dot(normalW,nearRay),dot(normalW,farRay)));
    rise+=max(0.0,max(nearH,farH)-world.y);
  }
  low=smoothstep(uTrenchWater.z,uTrenchWater.w,rise*.25);
  return clamp(1.0-sum*.32,.48,1.0);
}`;
const Evaluate = /* glsl */`
{
  vec3 geomN=normalize(transpose(mat3(viewMatrix))*normalize(vNormal));
  vec3 worldDx=trenchWorldDx,worldDy=trenchWorldDy;
  // 翻土让位给车道/场坪（与基础地形 wSpoil = g·(1−r) 同一口径）：沟真切断路的地方，
  // SampleMissionGroundSurface 已经把车道权重收掉了（2026-09-28，06 集结洼地不再是一片沟底土）。
  float spoil=clamp(vTerrainLayers.g,0.0,1.0)*(1.0-clamp(vTerrainLayers.r,0.0,1.0));
  float trenchLow=0.0;
  if(spoil>.001) {
  vec3 w=pow(abs(geomN),vec3(4));w/=max(dot(w,vec3(1)),.001);
  vec3 ca,cb,cc,na,nb,nc;vec3 ra,rb,rc;float sa,sb,sc;
  vec3 lightW=vec3(0,1,0);
  #if NUM_DIR_LIGHTS > 0
  lightW=normalize(transpose(mat3(viewMatrix))*directionalLights[0].direction);
  #endif
  SoilPlane(vTerrainWorld,geomN,worldDx,worldDy,0,w.y,lightW,ca,na,ra,sa);
  SoilPlane(vTerrainWorld,geomN,worldDx,worldDy,1,w.x,lightW,cb,nb,rb,sb);
  SoilPlane(vTerrainWorld,geomN,worldDx,worldDy,2,w.z,lightW,cc,nc,rc,sc);
  gTrenchShadow=mix(1.0,sa*w.y+sb*w.x+sc*w.z,spoil);
  vec3 soil=ca*w.y+cb*w.x+cc*w.z;
  gTerrainAlbedo=mix(gTerrainAlbedo,soil,spoil);
  gTerrainWeights=mix(gTerrainWeights,vec4(0,0,0,1),spoil);
  vec3 surface=ra*w.y+rb*w.x+rc*w.z;
  float mineral=.92+.16*TerrainNoise(vTerrainWorld.xz*.55+vTerrainWorld.y*.7);
  diffuseColor.rgb=mix(diffuseColor.rgb,soil*mineral*${C.mud.albedoScale.toFixed(3)},spoil);
  gTerrainNormalW=normalize(mix(gTerrainNormalW,normalize(geomN+na*w.y+nb*w.x+nc*w.z),spoil));
  gTerrainRough=mix(gTerrainRough,clamp(surface.x,.76,.96),spoil);
  gMaterialAo=mix(gMaterialAo,mix(.25,1.0,surface.y),spoil);
  gTerrainHeight=mix(gTerrainHeight,surface.z,spoil);
  gMaterialAo*=SoilHorizon(vTerrainWorld,geomN,trenchLow);
  }
#ifndef TRENCH_STONE
  {
    // 湿泥与积水（Script_TerrainMaterial.TerrainWater）：车道照常；沟底（翻土 × 凹度）更湿、积水更多。
    float floorSite=spoil*trenchLow;
    vec3 wetColor=diffuseColor.rgb;
    TerrainWater(wetColor,vTerrainWorld.xz,geomN,max(gTerrainWeights.y*uTerrainWaterD.x,floorSite*uTrenchWater.x),
      trenchLow*spoil,max(gTerrainWeights.y*uTerrainWaterD.w,floorSite*uTrenchWater.y));
    diffuseColor.rgb=wetColor;
    gTrenchWet=max(gTerrainWet,gTerrainWater);
  }
#endif
}`;
const Stone = /* glsl */`
{
  vec4 contact=ContactSurface(vTerrainWorld.xz);
  vec3 geomN=normalize(transpose(mat3(viewMatrix))*normalize(vNormal));
  vec3 an=abs(geomN);vec2 stoneUv=an.y>.6?vTerrainWorld.xz:(an.x>an.z?vec2(vTerrainWorld.z,-vTerrainWorld.y):vec2(vTerrainWorld.x,-vTerrainWorld.y));
  vec4 stoneA=texture(uTerrainAlbedo,vec3(stoneUv*1.7,4.0));
  vec4 stoneS=texture(uTerrainSurface,vec3(stoneUv*1.7,4.0));
  float gap=(vTerrainWorld.y-contact.w)*contact.y;
  float edge=${C.contact.edgeNoiseM.toFixed(3)}*(TerrainNoise(vTerrainWorld.xz*19.0)-.5);
  gTrenchContact=1.0-smoothstep(.006,${C.contact.depthM.toFixed(3)},gap+edge);
  vec3 soilColor=diffuseColor.rgb;
  vec3 soilNormal=gTerrainNormalW;
  float soilRough=gTerrainRough;
  if(uTerrainBlendValid>.5){
    vec2 screenUv=gl_FragCoord.xy/uTerrainBlendSize;
    vec4 soilNd=texture(uTerrainBlendNormalDepth,screenUv);
    gTrenchContact=TerrainBlendMask(soilNd,vViewPosition);
    if(gTrenchContact>0.0){
      vec4 soilCr=texture(uTerrainBlendColor,screenUv);
      soilColor=soilCr.rgb;soilRough=soilCr.a;
      soilNormal=normalize(transpose(mat3(viewMatrix))*soilNd.xyz);
    }
  }
  // Dust coats the exposed mineral too; only a small fresh break retains rock colour.
  vec3 stoneColor=mix(soilColor*1.18,stoneA.rgb*vec3(.65,.58,.46),.72);
  diffuseColor.rgb=mix(stoneColor,soilColor,gTrenchContact);
  gTerrainRough=mix(clamp(stoneS.b,.82,.96),soilRough,gTrenchContact);
  // Texture_TrenchStoneNormal is Poly Haven nor_gl (green = image up); the terrain arrays sample
  // with flipY=false where image down = +v, so flip green here (docs/Data_TextureAssetStandard.md §3.2).
  vec2 n=(stoneS.rg*2.0-1.0)*vec2(1.0,-1.0);
  vec3 stonePerturb=an.y>.6?vec3(n.x,0,n.y):(an.x>an.z?vec3(0,-n.y,n.x):vec3(n.x,-n.y,0));
  stonePerturb-=geomN*dot(stonePerturb,geomN);
  gTerrainNormalW=normalize(mix(normalize(geomN+stonePerturb*.32),soilNormal,gTrenchContact));
  gMaterialAo=mix(stoneS.a,gMaterialAo,gTrenchContact);
}`;

export function MakeTrenchSurfacePatch(pack, quality, assets, contact, { stone=false }={}) {
  const patch=MakeTerrainPatch(pack,TerrainQualityOf(quality));
  patch.terrainUniforms.uTerrainTileNear.value.w=1/C.mud.baseTileM;
  patch.terrainUniforms.uTerrainNormalScale.value.w=.65;
  const bind=patch.uniforms;
  // Runtime diagnostic for same-frame POM A/B; normal/colour/lighting stay fixed.
  const pom={value:1};patch.trenchPomUniform=pom;
  patch.key+=stone?':trenchStoneContact8Gbuffer':':trenchWetHeight8';
  patch.uniforms=(uniforms,shader)=>{
    bind(uniforms,shader);

    uniforms.uTrenchMud={value:new THREE.Vector4(C.mud.tileM,C.mud.reliefM,C.mud.roughDry,W.waterRough)};
    uniforms.uTrenchWater={value:new THREE.Vector4(W.site.trenchFloor,W.damp.trenchFloor,W.lowRiseM[0],W.lowRiseM[1])};
    uniforms.uTrenchPom=pom;
    if(stone){
      for(const key of ['uTerrainBlendValid','uTerrainBlendColor','uTerrainBlendNormalDepth','uTerrainBlendSize'])uniforms[key]=TerrainBlendUniforms[key];
      uniforms.uTerrainBlendWidth={value:C.contact.blendWidthM};
    }else uniforms.uTerrainCapture=TerrainBlendUniforms.uTerrainCapture;
    uniforms.uContactHeight={value:contact.texture};uniforms.uContactGrid={value:contact.grid};
  };
  patch.fragment=patch.fragment.map(([anchor,glsl])=>{
    if(anchor==='#include <common>')glsl+='\n'+TERRAIN_CONTACT_GLSL+'\n'+(stone?'#define TRENCH_STONE\n':'')+Common+(stone?'\n'+TERRAIN_BLEND_GLSL+'\nuniform sampler2D uTerrainBlendColor;':'\nuniform float uTerrainCapture;\nlayout(location=1) out vec4 oTerrainNormalDepth;');
    if(anchor==='#include <map_fragment>') {
      // Fully excavated pixels use the coherent soil path only. Derivatives stay
      // outside the varying branch, including those consumed by the base terrain
      // (TERRAIN_HOISTED_DERIVATIVES in Script_TerrainMaterial's GLSL_EVALUATE).
      glsl=glsl.replace(SurfacePatchEnd(anchor),'');
      glsl='vec3 trenchWorldDx=dFdx(vTerrainWorld),trenchWorldDy=dFdy(vTerrainWorld);\n'
        +'vec2 trenchRutD=vec2(dFdx(vTerrainLayers.w),dFdy(vTerrainLayers.w));\n'
        +'if(vTerrainLayers.g*(1.0-vTerrainLayers.r)<.999){'+glsl+'}\n'
        +Evaluate+(stone?'\n'+Stone:'')+'\n'+SurfacePatchEnd(anchor);
    }
    if(anchor==='#include <dithering_fragment>')glsl+=`\nif(uTerrainDebug>3.5&&uTerrainDebug<6.5)gl_FragColor=vec4(vec3(uTerrainDebug<4.5?gTrenchWet:uTerrainDebug<5.5?gTerrainRough:gTrenchContact),1.0);`;
    if(anchor==='#include <dithering_fragment>' && !stone)glsl+='\noTerrainNormalDepth=vec4(normalize(normal),vViewPosition.z);\nif(uTerrainCapture>.5)gl_FragColor=vec4(diffuseColor.rgb,roughnessFactor);';
    return [anchor,glsl];
  });
  patch.fragment.push(['#include <lights_fragment_end>', 'reflectedLight.directDiffuse*=gTrenchShadow;reflectedLight.directSpecular*=gTrenchShadow;']);
  return patch;
}
