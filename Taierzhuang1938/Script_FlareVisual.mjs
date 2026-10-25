// Shared absolute-time flare optics. Cloth is a reconstruction, not a measured cartridge.
import * as THREE from 'three';
import {FLARE_ART as A} from './Data_Tuning_FlareEffects.mjs';
import {SampleFlarePosition} from './Script_Flare.mjs';

const VERTEX=`varying vec2 vUv;varying float vAge;varying float vSeed;varying vec3 vWorld;
attribute float age;attribute float seed;
void main(){vUv=uv;vAge=age;vSeed=seed;
 vec4 world=modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.);vWorld=world.xyz;
 vec4 center=viewMatrix*world;
 vec2 up=(viewMatrix*vec4(0.,1.,0.,0.)).xy;up=length(up)>.01?normalize(up):vec2(0.,1.);
 vec2 right=vec2(up.y,-up.x);
 center.xy+=right*position.x*length(instanceMatrix[0].xyz)+up*position.y*length(instanceMatrix[1].xyz);
 gl_Position=projectionMatrix*center;}`;
const FRAGMENT=`precision highp float;
varying vec2 vUv;varying float vAge;varying float vSeed;varying vec3 vWorld;
uniform vec3 tint;uniform vec3 ambient;uniform vec3 lightPosition;
uniform float mode;uniform float clock;uniform float power;uniform float candle;uniform float scatter;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
float fbm(vec2 p){return .57*noise(p)+.28*noise(p*2.03+11.)+.15*noise(p*4.11-7.);}
void main(){vec2 p=(vUv-.5)*2.;float r2=dot(p,p);if(r2>1.||vAge<0.)discard;
 if(mode<.5){
  float n=fbm(p*9.+vec2(clock*1.4,-clock*9.));
  float width=.055+.035*n;
  float tongue=exp(-pow((p.x+.03*sin(clock*13.+p.y*20.))/width,2.))*smoothstep(-.17,-.08,p.y)*(1.-smoothstep(.08,.48,p.y))*(.4+.6*n);
  float core=exp(-r2*170.)*(.8+.2*n),halo=exp(-r2*20.)*.018;
  float colored=1.-smoothstep(.05,.3,tint.g);
  vec3 flame=mix(tint,vec3(1),mix(.75,.04,colored));
  gl_FragColor=vec4((flame*(core*14.+tongue*5.)+tint*halo*4.)*power,1.);
 }else if(mode>1.5){
  float heat=pow(max(0.,1.-vAge),1.8);
  gl_FragColor=vec4(mix(vec3(1.,.14,.01),vec3(1.,.8,.35),heat)*exp(-r2*12.)*heat*7.,1.);
 }else{
  vec2 q=p+vec2(vSeed*17.,vSeed*9.)+vec2(vAge*.3,-vAge*.5);
  float n=fbm(q*3.5),edge=pow(max(0.,1.-r2),1.5);
  float density=edge*smoothstep(.18,.72,n)*smoothstep(0.,.08,vAge)*pow(1.-vAge,1.2);
  vec3 delta=vWorld-lightPosition;
  vec3 incident=ambient+tint*candle*scatter/(dot(delta,delta)+4.);
  gl_FragColor=vec4(vec3(.46,.45,.42)*incident,1.-exp(-density*.52));
 }
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
const CLOTH_VERTEX=`varying vec2 vUv;varying vec3 vNormal;
void main(){vUv=uv;vNormal=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const CLOTH_FRAGMENT=`varying vec2 vUv;varying vec3 vNormal;
uniform sampler2D weave;uniform vec3 ambient;uniform vec3 sun;uniform vec3 sunDirection;
uniform vec3 selfLight;uniform float opacity;
void main(){vec3 n=normalize(vNormal);if(!gl_FrontFacing)n=-n;
 vec3 albedo=texture2D(weave,vUv).rgb;
 // Housing shields the upward hemisphere: only scattered/reflected candle light.
 vec3 illumination=ambient*(.55+.45*abs(n.y))+sun*max(0.,dot(n,sunDirection))+selfLight*(.6+.4*(1.-vUv.y));
 gl_FragColor=vec4(albedo*illumination,opacity);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

function Cards(count,mode,color){
 const geometry=new THREE.PlaneGeometry(1,1);
 geometry.setAttribute('age',new THREE.InstancedBufferAttribute(new Float32Array(count).fill(-1),1));
 geometry.setAttribute('seed',new THREE.InstancedBufferAttribute(new Float32Array(count),1));
 const material=new THREE.ShaderMaterial({vertexShader:VERTEX,fragmentShader:FRAGMENT,
  uniforms:{tint:{value:new THREE.Color(color)},ambient:{value:new THREE.Color()},lightPosition:{value:new THREE.Vector3()},
    mode:{value:mode},clock:{value:0},power:{value:1},candle:{value:0},scatter:{value:A.smokeScatter}},
  transparent:true,depthWrite:false,depthTest:true,blending:mode===1?THREE.NormalBlending:THREE.AdditiveBlending});
 const mesh=new THREE.InstancedMesh(geometry,material,count);mesh.frustumCulled=false;
 mesh.name=mode===0?'FlareRadiance':mode===1?'FlareSmoke':'FlareEmbers';return mesh;
}
function SilkMap(){
 const w=512,h=128,data=new Uint8Array(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const u=x/w*A.ribs,seam=Math.min(u%1,1-u%1)<.018,rim=y>h-4;
  const value=(seam?.62:rim?.68:.82)*((x+y)%2?1:.97),i=(y*w+x)*4;
  data.set([Math.round(value*255),Math.round(value*249),Math.round(value*230),255],i);
 }
 const map=new THREE.DataTexture(data,w,h);map.colorSpace=THREE.SRGBColorSpace;
 map.wrapS=THREE.RepeatWrapping;map.magFilter=THREE.LinearFilter;map.minFilter=THREE.LinearMipmapLinearFilter;map.generateMipmaps=true;map.needsUpdate=true;return map;
}
function MakeSuspension(){
 const segments=64,rings=12,positions=[],uv=[],indices=[];
 for(let j=0;j<=rings;j++)for(let i=0;i<=segments;i++){positions.push(0,0,0);uv.push(i/segments,j/rings);}
 for(let j=0;j<rings;j++)for(let i=0;i<segments;i++){const a=j*(segments+1)+i,b=a+segments+1;indices.push(a,b,a+1,b,b+1,a+1);}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);
 const material=new THREE.ShaderMaterial({vertexShader:CLOTH_VERTEX,fragmentShader:CLOTH_FRAGMENT,side:THREE.DoubleSide,
  transparent:true,depthWrite:false,uniforms:{weave:{value:SilkMap()},ambient:{value:new THREE.Color()},sun:{value:new THREE.Color()},
   sunDirection:{value:new THREE.Vector3(0,1,0)},selfLight:{value:new THREE.Color()},opacity:{value:.96}}});
 const cloth=new THREE.Mesh(geometry,material);cloth.name='FlareSilkCanopy';cloth.frustumCulled=false;
 const cords=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array((A.ribs*4+2)*3),3)),
  new THREE.LineBasicMaterial({color:0x887b61,transparent:true,opacity:.7,depthWrite:false}));cords.name='FlareSuspensionLines';cords.frustumCulled=false;
 const group=new THREE.Group();group.add(cloth,cords);return {group,cloth,cords,segments,rings};
}
function Candle(){
 const material=new THREE.MeshStandardMaterial({color:0x534d40,metalness:.35,roughness:.78,transparent:true,opacity:1,depthWrite:false});
 const mesh=new THREE.Mesh(new THREE.CylinderGeometry(A.candleRadius,A.candleRadius,A.candleHeight,12),material);
 mesh.name='FlareCandleHousing';return mesh;
}
const matrix=new THREE.Matrix4(),pos=new THREE.Vector3(),scale=new THREE.Vector3(),q=new THREE.Quaternion(),landRotation=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0),normal=new THREE.Vector3();
function Put(mesh,i,x,y,z,size,age,seed=0,aspect=1){pos.set(x,y,z);scale.set(size,size*aspect,size);matrix.compose(pos,q,scale);mesh.setMatrixAt(i,matrix);mesh.geometry.attributes.age.setX(i,age);mesh.geometry.attributes.seed.setX(i,seed);}
function Flush(mesh){mesh.instanceMatrix.needsUpdate=true;mesh.geometry.attributes.age.needsUpdate=true;mesh.geometry.attributes.seed.needsUpdate=true;}
const Smooth=(a,b,x)=>THREE.MathUtils.smoothstep(x,a,b);
const FoldedHeight=(a,r)=>A.foldedClothBaseM+A.foldedClothWrinkleM*(Math.sin(a*3+r*14)+1);

export class FlareVisuals {
 constructor(parent,lights=null){this.root=new THREE.Group();this.root.name='FlareEffects';parent.add(this.root);this.items=new Set();this.lights=lights;this.ambient=new THREE.Color();this.sun=new THREE.Color();}
 Add(flare,surfaceHeight=null){
  const root=new THREE.Group(),head=Cards(1,0,flare.lightColor),smoke=Cards(A.smokeCount,1,flare.lightColor),sparks=Cards(A.sparkCount,2,0xffac50),suspension=MakeSuspension(),candle=Candle();
  const canopy=suspension.group;canopy.add(candle);
  const carrier=Candle();carrier.name='FlareDiscardedCarrier';carrier.scale.set(1.18,1.35,1.18);
  root.name='Flare/'+flare.id;root.add(head,smoke,sparks,canopy,carrier);this.root.add(root);
  const item={root,head,smoke,sparks,canopy,candle,carrier,surfaceHeight,...suspension};this.items.add(item);this.Update(item,flare);return item;
 }
 Lighting(){
  const l=this.lights;this.ambient.setRGB(A.ambientFloor,A.ambientFloor,A.ambientFloor);this.sun.setRGB(0,0,0);
  if(l){this.ambient.add(l.ambient.color.clone().multiplyScalar(l.ambient.intensity*1.5));
    this.ambient.addScalar((l.globalProbe?.intensity??0)*.25);this.sun.copy(l.sun.color).multiplyScalar(l.sun.intensity*.45);
  }else this.ambient.setRGB(.14,.15,.17);
 }
 Cloth(item,f,opened,settle,fade){
  const {cloth,cords,segments,rings}=item,p=cloth.geometry.attributes.position;
  const baseY=(A.leaderLength+A.cordLength)*(1-settle);
  const radius=A.canopyRadius*(.06+.94*opened),height=A.canopyHeight*(1-settle);
  // Cache the contact deformation once per landing. Raised tile rows must not
  // disappear through the collapsed cloth even when the candle fell between them.
  if(settle>0&&item.surfaceHeight&&item.contactLanding!==f.landing){
   item.contactLanding=f.landing;item.contactOffsets=new Float32Array(p.count*3);
   const q=new THREE.Quaternion().setFromUnitVectors(up,new THREE.Vector3().fromArray(f.landing.normal||[0,1,0]).normalize());
   const inverse=q.clone().invert(),point=new THREE.Vector3(),offset=new THREE.Vector3(),base=new THREE.Vector3();
   for(let j=0;j<=rings;j++)for(let i=0;i<=segments;i++){
    const r=j/rings,a=i/segments*Math.PI*2,rr=A.ventRadius+(radius-A.ventRadius)*r,index=j*(segments+1)+i;
    base.set(Math.cos(a)*rr,FoldedHeight(a,r),Math.sin(a)*rr);point.copy(base).applyQuaternion(q).add(item.canopy.position);
    let y=item.surfaceHeight({x:point.x,y:point.y+A.clothContactProbeM,z:point.z});
    const arc=rr*A.clothArcRatio,reach=arc*A.clothDrapeMaxRatio;
    if(point.y-y>A.clothDrapeThresholdM){
     // Slack cloth hangs over a roof edge. Shorten its horizontal span as it
     // sags, rather than stretching a rigid disc half a metre above the tiles.
     const sag=Math.min(reach,point.y-y),shrink=Math.sqrt(Math.max(0,1-(sag/arc)**2));
     point.set(base.x*shrink,base.y,base.z*shrink).applyQuaternion(q).add(item.canopy.position);
     y=item.surfaceHeight({x:point.x,y:point.y+A.clothContactProbeM,z:point.z});
    }
    const delta=y+A.groundClearance-point.y;
    point.y+=point.y-y>A.clothDrapeThresholdM?Math.max(-reach,delta):Math.max(0,delta);
    offset.copy(point).sub(item.canopy.position).applyQuaternion(inverse).sub(base);
    offset.toArray(item.contactOffsets,index*3);
   }
  }
  for(let j=0;j<=rings;j++)for(let i=0;i<=segments;i++){
   const r=j/rings,a=i/segments*Math.PI*2,rr=A.ventRadius+(radius-A.ventRadius)*r;
   const panel=Math.sin(a*A.ribs*.5)**2,flutter=Math.sin(a*3+f.t*3.7+r*9)*.006*r*r*(1-settle);
   const y=baseY+height*Math.pow(1-r*r,.7)+panel*.018*r*(1-settle)+flutter+settle*FoldedHeight(a,r);
   const index=j*(segments+1)+i,c=item.contactOffsets,o=index*3;
   p.setXYZ(index,Math.cos(a)*rr+(c?.[o]||0)*settle,y+(c?.[o+1]||0)*settle,Math.sin(a)*rr+(c?.[o+2]||0)*settle);
  }p.needsUpdate=true;cloth.geometry.computeVertexNormals();
  const c=cords.geometry.attributes.position;let k=0;
  c.setXYZ(k++,0,A.candleHeight+A.candleLift,0);c.setXYZ(k++,0,A.leaderLength*(1-settle)+.04*settle,0);
  for(let i=0;i<A.ribs;i++){
   const joinY=A.leaderLength*(1-settle)+.04*settle,end=new THREE.Vector3().fromBufferAttribute(p,rings*(segments+1)+Math.round(i/A.ribs*segments));
   c.setXYZ(k++,0,joinY,0);c.setXYZ(k++,end.x*.5,(joinY+end.y)*.5-settle*.03,end.z*.5);
   c.setXYZ(k++,end.x*.5,(joinY+end.y)*.5-settle*.03,end.z*.5);c.setXYZ(k++,end.x,end.y,end.z);
  }c.needsUpdate=true;cords.geometry.setDrawRange(0,k);
  const u=cloth.material.uniforms;u.ambient.value.copy(this.ambient);u.sun.value.copy(this.sun);u.sunDirection.value.copy(this.lights?.sunDirection??new THREE.Vector3(0,1,0));
  u.selfLight.value.setHex(f.lightColor).multiplyScalar(f.intensity*A.canopySelfLight);u.opacity.value=.96*fade;
  cords.material.color.copy(this.ambient).add(this.sun).multiplyScalar(.3).add(new THREE.Color(f.lightColor).multiplyScalar(f.intensity*A.canopySelfLight*.3));cords.material.opacity=.75*fade;
  item.candle.position.set(0,(A.candleLift+A.candleHeight*.5)*(1-settle)+A.candleRadius*settle,0);
  item.candle.rotation.z=settle*Math.PI*.5;item.candle.material.opacity=fade;
 }
 Update(item,f){
  if(!this.items.has(item))return;this.Lighting();
  const {head,smoke,sparks,canopy}=item,t=f.t,since=t-f.ignitedAt;
  const opened=Smooth(0,A.openingS,since),settle=f.landed?Smooth(0,A.settleS,t-f.landing.t):0;
  const fade=f.landed?1-Smooth(f.endAt-A.groundFadeS,f.endAt,t):1;
  head.material.uniforms.clock.value=t;head.material.uniforms.power.value=since>=0?f.brightness:0;
  Put(head,0,f.pos.x,f.pos.y,f.pos.z,A.glowSize,0);Flush(head);
  canopy.visible=f.parachute!==false&&!f.launchObstructed&&since>=0;
  canopy.position.set(f.pos.x,f.pos.y,f.pos.z);canopy.rotation.set(Math.sin(since*1.7)*.035*opened*(1-settle),0,Math.sin(since*2+f.swayPhase)*.055*opened*(1-settle));
  if(settle>0){normal.fromArray(f.landing.normal||[0,1,0]).normalize();landRotation.setFromUnitVectors(up,normal);canopy.quaternion.slerp(landRotation,settle);}
  if(canopy.visible)this.Cloth(item,f,opened,settle,fade);
  item.carrier.visible=f.physical&&f.parachute&&t<(f.carrierLanding?.t??0)+3;
  if(item.carrier.visible){
    const carrierPose=SampleFlarePosition({...f,parachute:false,landing:f.carrierLanding,flightSlides:f.carrierLanding?.slides,swayM:0},t);
    item.carrier.position.set(carrierPose.x,carrierPose.y+A.candleHeight*.65,carrierPose.z);
    item.carrier.rotation.set(Math.max(0,t-f.ignitedAt)*4,0,Math.max(0,t-f.ignitedAt)*2.3);
    if(f.carrierLanding&&t>=f.carrierLanding.t){
      normal.fromArray(f.carrierLanding.normal||[0,1,0]).normalize();landRotation.setFromUnitVectors(up,normal);
      item.carrier.rotation.set(0,0,Math.PI*.5);item.carrier.quaternion.premultiply(landRotation);
      item.carrier.position.set(carrierPose.x,carrierPose.y,carrierPose.z).addScaledVector(normal,A.candleRadius*1.18);
    }
    item.carrier.material.opacity=1-Smooth((f.carrierLanding?.t??0)+2,(f.carrierLanding?.t??0)+3,t);
  }
  const u=smoke.material.uniforms;u.ambient.value.copy(this.ambient).add(this.sun.clone().multiplyScalar(.65));u.lightPosition.value.set(f.pos.x,f.pos.y,f.pos.z);u.candle.value=f.intensity;
  for(let i=0;i<A.smokeCount;i++){
   const born=(Math.floor(t*A.smokeHz)-i)/A.smokeHz,age=t-born;
   const launch=born>=0&&born<.16;
   if((born<f.ignitedAt&&!launch)||born>f.outAt||age>A.smokeLife){Put(smoke,i,0,0,0,0,-1);continue;}
   const p=launch?{x:f.from.x,y:f.groundY+A.launchHeight,z:f.from.z}:SampleFlarePosition(f,born);
   const seed=Math.sin(born*74.7+f.swayPhase)*.5+.5;
   const spread=.04+age*.1+(f.parachute&&!launch ? .3*Smooth(.25,.9,age) : 0);
   Put(smoke,i,p.x+Math.sin(f.driftDirRad)*f.driftMS*age+Math.sin(born*3.7+age)*spread,p.y+age*.55,
    p.z+Math.cos(f.driftDirRad)*f.driftMS*age+Math.cos(born*4.1-age*.4)*spread,.18+age*.3,age/A.smokeLife,seed);
  }Flush(smoke);
  for(let i=0;i<A.sparkCount;i++){
   const born=(Math.floor(t*A.sparkHz)-i)/A.sparkHz,age=t-born;
   if(born<f.ignitedAt||born>f.outAt||age>A.sparkLife){Put(sparks,i,0,0,0,0,-1);continue;}
   const p=SampleFlarePosition(f,born),a=born*137.5;
   Put(sparks,i,p.x+Math.sin(a)*age*.3,p.y-age*.65-.5*A.gravity*age*age,p.z+Math.cos(a)*age*.3,.024,age/A.sparkLife,0,1+age*3);
  }Flush(sparks);
 }
 Remove(item){if(!this.items.delete(item))return;item.root.removeFromParent();item.cloth.material.uniforms.weave.value.dispose();item.root.traverse(o=>{if(o.isInstancedMesh)o.dispose();o.geometry?.dispose();o.material?.dispose();});}
 Dispose(){for(const item of [...this.items])this.Remove(item);this.root.removeFromParent();}
}
