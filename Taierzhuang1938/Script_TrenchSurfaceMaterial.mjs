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
// The scanned displacement moves its own colour/normal samples. The old atlas
// displaced only an unrelated wet mask, so soil grains never gained parallax.
void SoilPlane(vec3 world,vec3 geomN,vec3 dx,vec3 dy,int axis,float weight,
  out vec3 color,out vec3 perturb,out vec2 roughAo) {
  color=vec3(0);perturb=vec3(0);roughAo=vec2(0);
  if(weight<.015)return;
  vec2 p=axis==0?world.xz:axis==1?vec2(world.z,-world.y):vec2(world.x,-world.y);
  vec2 gx=axis==0?dx.xz:axis==1?vec2(dx.z,-dx.y):vec2(dx.x,-dx.y);
  vec2 gy=axis==0?dy.xz:axis==1?vec2(dy.z,-dy.y):vec2(dy.x,-dy.y);
  vec3 vw=normalize(cameraPosition-world);
  vec2 vp=axis==0?vw.xz:axis==1?vec2(vw.z,-vw.y):vec2(vw.x,-vw.y);
  float inv=1.0/${C.mud.baseTileM.toFixed(3)};
  vec2 uv=p*inv;
  float variant=TerrainNoise(p*.19)*8.0,band=floor(variant);
  float blend=smoothstep(.3,.7,fract(variant));
  vec2 offA=sin(vec2(3,7)*band),offB=sin(vec2(3,7)*(band+1.0));
  float nearFade=1.0-smoothstep(${C.mud.parallaxNearM.toFixed(1)},${C.mud.parallaxFarM.toFixed(1)},length(vViewPosition));
  vec2 delta=vp/max(abs(dot(vw,geomN)),.32)*${C.mud.scanReliefM.toFixed(3)}*inv*nearFade;
  vec2 at=uv+delta*.5;float ray=1.0;
  if(nearFade>.02&&weight>.15)for(int i=0;i<8;i++) {
    float h=mix(textureLod(uTerrainAlbedo,vec3(at+offA,3.0),0.0).a,
      textureLod(uTerrainAlbedo,vec3(at+offB,3.0),0.0).a,blend);
    if(ray<=h)break;
    at-=delta*.125;ray-=.125;
  }
  vec4 a=mix(textureGrad(uTerrainAlbedo,vec3(at+offA,3.0),gx*inv,gy*inv),
    textureGrad(uTerrainAlbedo,vec3(at+offB,3.0),gx*inv,gy*inv),blend);
  vec4 s=mix(textureGrad(uTerrainSurface,vec3(at+offA,3.0),gx*inv,gy*inv),
    textureGrad(uTerrainSurface,vec3(at+offB,3.0),gx*inv,gy*inv),blend);
  color=a.rgb;roughAo=s.ba;
  vec2 n=(s.rg*2.0-1.0)*${C.mud.normalScale.toFixed(3)};
  perturb=axis==0?vec3(n.x,0,n.y):axis==1?vec3(0,-n.y,n.x):vec3(n.x,-n.y,0);
  perturb-=geomN*dot(geomN,perturb);
}
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
  vec2 pdx=side?(alongX?vec2(worldDx.z,-worldDx.y):vec2(worldDx.x,-worldDx.y)):worldDx.xz;
  vec2 pdy=side?(alongX?vec2(worldDy.z,-worldDy.y):vec2(worldDy.x,-worldDy.y)):worldDy.xz;
  vec2 dx=rot*pdx/(uTrenchMud.x*2.0),dy=rot*pdy/(uTrenchMud.x*2.0);
  vec2 at=MudAtlasUv(local,tile);vec4 stamp=textureGrad(uTrenchRelief,at,dx,dy);
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
  vec3 w=pow(abs(geomN),vec3(4));w/=max(dot(w,vec3(1)),.001);
  vec3 ca,cb,cc,na,nb,nc;vec2 ra,rb,rc;
  SoilPlane(vTerrainWorld,geomN,worldDx,worldDy,0,w.y,ca,na,ra);
  SoilPlane(vTerrainWorld,geomN,worldDx,worldDy,1,w.x,cb,nb,rb);
  SoilPlane(vTerrainWorld,geomN,worldDx,worldDy,2,w.z,cc,nc,rc);
  vec3 soil=ca*w.y+cb*w.x+cc*w.z;
  gTerrainAlbedo=mix(gTerrainAlbedo,soil,spoil);
  gTerrainWeights=mix(gTerrainWeights,vec4(0,0,0,1),spoil);
  vec2 surface=ra*w.y+rb*w.x+rc*w.z;
  float mineral=.92+.16*TerrainNoise(vTerrainWorld.xz*.55+vTerrainWorld.y*.7);
  diffuseColor.rgb=mix(diffuseColor.rgb,soil*mineral*${C.mud.albedoScale.toFixed(3)},spoil);
  gTerrainNormalW=normalize(mix(gTerrainNormalW,normalize(geomN+na*w.y+nb*w.x+nc*w.z),spoil));
  gTerrainRough=mix(gTerrainRough,clamp(surface.x,.76,.96),spoil);
  gMaterialAo=mix(gMaterialAo,mix(.72,1.0,surface.y),spoil);
  vec3 detailN;vec4 mud=MudSurface(vTerrainWorld,geomN,worldDx,worldDy,detailN);
  float mudMask=mud.g*spoil;
  float lowSpots=smoothstep(.45,.90,mud.b);
  float pooling=smoothstep(.78,.98,geomN.y);
  gTrenchWet=mudMask*(.12+.88*lowSpots)*mix(.20,1.0,pooling);
  diffuseColor.rgb*=1.0-${C.mud.darken.toFixed(3)}*gTrenchWet;
  gTerrainRough=mix(max(gTerrainRough,.78),mix(uTrenchMud.z,uTrenchMud.w,lowSpots*pooling),mudMask);
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
  // Dust coats the exposed mineral too; only a small fresh break retains rock colour.
  vec3 stoneColor=mix(soilColor*1.12,stoneA.rgb*vec3(.40,.32,.23),.38);
  diffuseColor.rgb=mix(stoneColor,soilColor,gTrenchContact);
  gTerrainRough=mix(clamp(stoneS.b,.82,.96),gTerrainRough,gTrenchContact);
  vec2 n=stoneS.rg*2.0-1.0;
  vec3 stonePerturb=an.y>.6?vec3(n.x,0,n.y):(an.x>an.z?vec3(0,-n.y,n.x):vec3(n.x,-n.y,0));
  stonePerturb-=geomN*dot(stonePerturb,geomN);
  vec3 soilNormal=normalize(mix(gTerrainNormalW,contact.xyz,.65*gTrenchContact));
  gTerrainNormalW=normalize(mix(normalize(geomN+stonePerturb*.32),soilNormal,gTrenchContact));
  gMaterialAo=mix(stoneS.a,gMaterialAo,gTrenchContact);
}`;

export function MakeTrenchSurfacePatch(pack, quality, assets, contact, { stone=false }={}) {
  const patch=MakeTerrainPatch(pack,TerrainQualityOf(quality));
  patch.terrainUniforms.uTerrainTileNear.value.w=1/C.mud.baseTileM;
  patch.terrainUniforms.uTerrainNormalScale.value.w=.65;
  const bind=patch.uniforms;
  patch.key+=stone?':trenchStoneContact4':':trenchWetHeight4';
  patch.uniforms=(uniforms,shader)=>{
    bind(uniforms,shader);
    uniforms.uTrenchRelief={value:assets.mud};
    uniforms.uTrenchMud={value:new THREE.Vector4(C.mud.tileM,C.mud.reliefM,C.mud.roughDry,C.mud.roughWet)};
    if(stone){uniforms.uContactHeight={value:contact.texture};uniforms.uContactGrid={value:contact.grid};}
  };
  patch.fragment=patch.fragment.map(([anchor,glsl])=>{
    if(anchor==='#include <common>')glsl+='\n'+Common+(stone?'\n'+TERRAIN_CONTACT_GLSL:'');
    if(anchor==='#include <map_fragment>') {
      // Fully excavated pixels use the coherent soil path only. Derivatives stay
      // outside the varying branch, including those consumed by the base terrain.
      glsl=glsl.replace(SurfacePatchEnd(anchor),'').replace('vec3 twDx = dFdx(tw), twDy = dFdy(tw);',
        'vec3 twDx = trenchWorldDx, twDy = trenchWorldDy;');
      glsl='vec3 trenchWorldDx=dFdx(vTerrainWorld),trenchWorldDy=dFdy(vTerrainWorld);\nif(vTerrainLayers.g<.999){'+glsl+'}\n'
        +Evaluate+(stone?'\n'+Stone:'')+'\n'+SurfacePatchEnd(anchor);
    }
    if(anchor==='#include <dithering_fragment>')glsl+=`\nif(uTerrainDebug>3.5)gl_FragColor=vec4(vec3(uTerrainDebug<4.5?gTrenchWet:uTerrainDebug<5.5?gTerrainRough:gTrenchContact),1.0);`;
    return [anchor,glsl];
  });
  return patch;
}
