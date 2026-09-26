import * as THREE from 'three';
import { MakeTerrainPatch } from './Script_TerrainMaterial.mjs';
import { SurfacePatchEnd } from './Script_MaterialPatches.mjs';
import { TerrainQualityOf } from './Data_Tuning_Terrain.mjs';
import { TERRAIN_CONTACT_GLSL } from './Script_TerrainContact.mjs';
import { TRENCH_SURFACE as C } from './Data_TrenchSurface.mjs';

const Common = /* glsl */`
uniform sampler2D uTrenchRelief;
uniform vec4 uTrenchMud;
float gTrenchWet=0.0;
float gTrenchContact=0.0;
vec2 MudAtlasUv(vec2 local, vec2 tile){return (clamp(local,vec2(.003),vec2(.997))+tile)*.5;}
vec4 MudPlane(vec3 world,vec3 geomN,vec3 worldDx,vec3 worldDy,int axis,float weight,out vec3 perturb) {
  if(weight<.003){perturb=vec3(0);return vec4(0);}
  bool side=axis!=0;bool alongX=axis==1;
  vec2 p=side?(alongX?vec2(world.z,-world.y):vec2(world.x,-world.y)):world.xz;
  vec2 q=p/uTrenchMud.x,cell=floor(q),local=fract(q);
  float cellEdge=1.0-smoothstep(.35,.5,max(abs(local.x-.5),abs(local.y-.5)));
  float salt=TerrainHash(cell+19.7);
  vec2 tile=vec2(mod(floor(salt*4.0),2.0),floor(salt*4.0)/2.0);tile.y=floor(tile.y);
  vec2 center=vec2(.5)+vec2(TerrainHash(cell+8.0)-.5,TerrainHash(cell+14.0)-.5)*.18;
  float angle=salt*6.283185;mat2 rot=mat2(cos(angle),-sin(angle),sin(angle),cos(angle));
  local=rot*(local-center)+.5;
  float outside=max(abs(local.x-.5),abs(local.y-.5));
  vec3 viewW=normalize(cameraPosition-world);
  vec2 viewP=side?(alongX?vec2(viewW.z,-viewW.y):vec2(viewW.x,-viewW.y)):viewW.xz;
  vec2 offset=rot*viewP/max(abs(dot(viewW,geomN)),.25)*uTrenchMud.y/uTrenchMud.x;
  float nearFade=1.0-smoothstep(${C.mud.parallaxNearM.toFixed(1)},${C.mud.parallaxFarM.toFixed(1)},length(vViewPosition));
  // A short bounded POM trace; textureLod is deliberate inside the divergent near branch.
  vec2 pdx=side?(alongX?vec2(worldDx.z,-worldDx.y):vec2(worldDx.x,-worldDx.y)):worldDx.xz;
  vec2 pdy=side?(alongX?vec2(worldDy.z,-worldDy.y):vec2(worldDy.x,-worldDy.y)):worldDy.xz;
  vec2 dx=rot*pdx/(uTrenchMud.x*2.0),dy=rot*pdy/(uTrenchMud.x*2.0);
  vec2 uv=local;float rayH=1.0;
  if(nearFade>.01 && outside<.49 && weight>.3){
    for(int i=0;i<6;i++){
      float h=textureLod(uTrenchRelief,MudAtlasUv(uv,tile),0.0).r;
      if(rayH<=h)break;
      uv-=offset*(nearFade/6.0);rayH-=1.0/6.0;
    }
  }
  vec2 at=MudAtlasUv(uv,tile);vec4 stamp=textureGrad(uTrenchRelief,at,dx,dy);
  stamp.g*=cellEdge*(1.0-smoothstep(.45,.495,outside));
  float e=1.0/512.0;
  float hx=textureGrad(uTrenchRelief,at+vec2(e,0),dx,dy).r-textureGrad(uTrenchRelief,at-vec2(e,0),dx,dy).r;
  float hy=textureGrad(uTrenchRelief,at+vec2(0,e),dx,dy).r-textureGrad(uTrenchRelief,at-vec2(0,e),dx,dy).r;
  vec2 grad=transpose(rot)*vec2(hx,hy)*(uTrenchMud.y*256.0/uTrenchMud.x);
  perturb=side?(alongX?vec3(0,grad.y,-grad.x):vec3(-grad.x,grad.y,0)):vec3(-grad.x,0,-grad.y);
  perturb-=geomN*dot(geomN,perturb);
  return stamp;
}
vec4 MudSurface(vec3 world,vec3 geomN,vec3 worldDx,vec3 worldDy,out vec3 perturb) {
  // Continuous triplanar weights also cover curved trench lips; a dominant-axis
  // switch produced visible triangular wet/dry boundaries on those slopes.
  vec3 w=pow(abs(geomN),vec3(4.0));w/=max(w.x+w.y+w.z,.001);
  vec3 a,b,c;
  vec4 top=MudPlane(world,geomN,worldDx,worldDy,0,w.y,a);
  vec4 east=MudPlane(world,geomN,worldDx,worldDy,1,w.x,b);
  vec4 south=MudPlane(world,geomN,worldDx,worldDy,2,w.z,c);
  perturb=a*w.y+b*w.x+c*w.z;
  return top*w.y+east*w.x+south*w.z;
}`;
const Evaluate = /* glsl */`
{
  vec3 geomN=normalize(transpose(mat3(viewMatrix))*normalize(vNormal));
  vec3 worldDx=dFdx(vTerrainWorld),worldDy=dFdy(vTerrainWorld);
  float spoil=clamp(vTerrainLayers.g,0.0,1.0);
  if(spoil>.001) {
  vec3 detailN;vec4 mud=MudSurface(vTerrainWorld,geomN,worldDx,worldDy,detailN);
  float mudMask=mud.g*spoil;
  float lowSpots=smoothstep(.30,.80,mud.b);
  gTrenchWet=mudMask*(.28+.72*lowSpots)*mix(.62,1.0,smoothstep(.5,.95,geomN.y));
  diffuseColor.rgb*=1.0-${C.mud.darken.toFixed(3)}*gTrenchWet;
  gTerrainRough=mix(gTerrainRough,mix(uTrenchMud.z,uTrenchMud.w,lowSpots),mudMask);
  gTerrainNormalW=normalize(gTerrainNormalW+detailN*mudMask*(1.0-gTrenchWet*.45));
  gMaterialAo*=mix(1.0,mud.a,mudMask);
  }
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
  vec3 stoneColor=stoneA.rgb*.70*(1.0-gTrenchWet*.18);
  diffuseColor.rgb=mix(stoneColor,soilColor,gTrenchContact);
  gTerrainRough=mix(clamp(stoneS.b,.55,.9),gTerrainRough,gTrenchContact);
  vec2 n=stoneS.rg*2.0-1.0;
  vec3 stonePerturb=an.y>.6?vec3(n.x,0,n.y):(an.x>an.z?vec3(0,-n.y,n.x):vec3(n.x,-n.y,0));
  stonePerturb-=geomN*dot(stonePerturb,geomN);
  vec3 soilNormal=normalize(mix(gTerrainNormalW,contact.xyz,.65*gTrenchContact));
  gTerrainNormalW=normalize(mix(normalize(geomN+stonePerturb*.7),soilNormal,gTrenchContact));
  gMaterialAo=mix(stoneS.a,gMaterialAo,gTrenchContact);
}`;

export function MakeTrenchSurfacePatch(pack, quality, assets, contact, { stone=false }={}) {
  const patch=MakeTerrainPatch(pack,TerrainQualityOf(quality));
  patch.terrainUniforms.uTerrainTileNear.value.w=1/C.mud.baseTileM;
  const bind=patch.uniforms;
  patch.key+=stone?':trenchStoneContact3':':trenchWetHeight3';
  patch.uniforms=(uniforms,shader)=>{
    bind(uniforms,shader);
    uniforms.uTrenchRelief={value:assets.mud};
    uniforms.uTrenchMud={value:new THREE.Vector4(C.mud.tileM,C.mud.reliefM,C.mud.roughDry,C.mud.roughWet)};
    if(stone){uniforms.uContactHeight={value:contact.texture};uniforms.uContactGrid={value:contact.grid};}
  };
  patch.fragment=patch.fragment.map(([anchor,glsl])=>{
    if(anchor==='#include <common>')glsl+='\n'+Common+(stone?'\n'+TERRAIN_CONTACT_GLSL:'');
    if(anchor==='#include <map_fragment>')glsl=glsl.replace(SurfacePatchEnd(anchor),'')+'\n'+Evaluate+(stone?'\n'+Stone:'')+'\n'+SurfacePatchEnd(anchor);
    if(anchor==='#include <dithering_fragment>')glsl+=`\nif(uTerrainDebug>3.5)gl_FragColor=vec4(vec3(uTerrainDebug<4.5?gTrenchWet:uTerrainDebug<5.5?gTerrainRough:gTrenchContact),1.0);`;
    return [anchor,glsl];
  });
  return patch;
}
