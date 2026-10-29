// Shared absolute-time flare optics. Cloth is a reconstruction, not a measured cartridge.
import * as THREE from 'three';
import {FLARE_ART as A,FLARE_OPTICS as O,FLARE_PHOTOMETRY as P,FLARE_COMBUSTION as C} from './Data_Tuning_FlareEffects.mjs';
import {SampleFlareAttitude,FlareCoreRadiance,SampleFlareCombustion,FlareLaunchEmission,FlarePhotometricScale,FLARE_ANGULAR_GLSL} from './Script_FlareOptics.mjs';
import {SampleFlareSmoke,SampleFlareSpark,SampleFlareFlowDirection} from './Script_FlareParticles.mjs';
import {SampleFlarePosition} from './Script_Flare.mjs';

const VERTEX=`varying vec2 vUv;varying float vAge;varying float vSeed;varying vec3 vWorld;varying vec2 vParticleRatio;
attribute float age;attribute float seed;
uniform vec3 flameAxis;uniform vec3 launchAxis;uniform float mode;
void main(){vUv=uv;vAge=age;vSeed=seed;
 vec4 world=modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.);vWorld=world.xyz;
 vec4 center=viewMatrix*world;
 vec2 physicalSize=vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));
 vec2 rasterSize=physicalSize;vParticleRatio=vec2(1.);
 if((mode>1.5&&age>=0.)||(mode<.5&&age>.5)){
  // A millimetre particle at 100 m is much smaller than one sample. Enlarge
  // only its raster carrier, then preserve its actual projected area below.
  float support=mode>1.5?${A.sparkRasterSupportRad}:${C.launchRasterSupportRad};
  rasterSize=max(physicalSize,vec2(max(0.,-center.z)*support));
  vParticleRatio=physicalSize/max(rasterSize,vec2(.000001));
 }
 vec2 up=(viewMatrix*vec4(mode<.5?(age>.5?launchAxis:flameAxis):vec3(0.,1.,0.),0.)).xy;up=length(up)>.01?normalize(up):vec2(0.,1.);
 vec2 right=vec2(up.y,-up.x);
 center.xy+=right*position.x*rasterSize.x+up*position.y*rasterSize.y;
 gl_Position=projectionMatrix*center;}`;
const FRAGMENT=`precision highp float;
varying vec2 vUv;varying float vAge;varying float vSeed;varying vec3 vWorld;varying vec2 vParticleRatio;
uniform vec3 tint;uniform vec3 ambient;uniform vec3 lightPosition;
uniform float mode;uniform float clock;uniform float power;uniform float candle;uniform float scatter;
uniform float opacityScale;
uniform vec4 combustion; // width, length, aspect, cold residual
uniform vec2 ember; // independent residual radiance and shrinking extent
uniform float launchPower;
uniform vec3 launchTint;
uniform vec4 otherLight[${A.smokeLightSlots}];
uniform vec3 otherTint[${A.smokeLightSlots}];
uniform vec3 otherAxis[${A.smokeLightSlots}];
uniform vec2 otherLobe[${A.smokeLightSlots}];
uniform vec3 flameAxis;uniform float directional;
${FLARE_ANGULAR_GLSL}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
float fbm(vec2 p){return .57*noise(p)+.28*noise(p*2.03+11.)+.15*noise(p*4.11-7.);}
void main(){vec2 p=(vUv-.5)*2.;float r2=dot(p,p);if(r2>1.||vAge<0.)discard;
 if(mode<.5){
  if(vAge>.5){
   vec2 physical=p/max(vParticleRatio,vec2(.000001));
   // Each horizontal strip has a normalized Gaussian integral. Let its bend
   // and width change along the jet, while its unresolved total flux stays
   // independent of whichever subpixel happens to sample that shape.
   float n=fbm(vec2(physical.y*11.+clock*31.,-clock*47.));
   float width=.11+.13*n;
   float footprint=max(length(dFdx(p)),length(dFdy(p)));
   vec2 radius2=vec2(width*width,.48*.48)*vParticleRatio*vParticleRatio+footprint*footprint*.35;
   vec2 offset=vec2(-.05*(n-.5),.1)*vParticleRatio;
   float area=(.11+.13*.5)*.48*vParticleRatio.x*vParticleRatio.y/sqrt(radius2.x*radius2.y);
   float jet=exp(-dot((p-offset)*(p-offset),1./radius2))*area;
   vec3 launchRadiance=launchTint*jet*launchPower;
   launchRadiance*=min(1.,${P.radianceMax.toFixed(1)}/max(max(launchRadiance.r,max(launchRadiance.g,launchRadiance.b)),.0001));
   gl_FragColor=vec4(launchRadiance,1.);
  }else{
  vec2 local=p/max(combustion.xy,vec2(.001));
  float n=fbm(local*9.+vec2(clock*2.7,-clock*17.));
  float bend=.014*(noise(vec2(local.y*28.-clock*11.,clock*2.3))-.5);
  float width=.024+.022*n;
  float tongue=exp(-pow((local.x+bend+.01*sin(clock*29.+local.y*24.))/width,2.))*smoothstep(-.025,.02,local.y)*(1.-smoothstep(.04,.35,local.y))*(.2+.8*n);
  // Pixel-area filtering prevents a physically small star disappearing between
  // samples in the full-flight view. Integral stays constant as its radius grows.
  float footprint=max(length(dFdx(p)),length(dFdy(p)));
  vec2 physical=vec2(combustion.x*combustion.z,combustion.y/combustion.z);
  vec2 radius2=${P.coreRadiusSquared}*physical*physical+footprint*footprint*.35;
  vec2 offset=vec2(bend*combustion.x,0.);
  float core=exp(-dot((p-offset)*(p-offset),1./radius2))*${P.coreRadiusSquared}*combustion.x*combustion.y/sqrt(radius2.x*radius2.y);
  float emission=directional>.5?FlareEmissionGain(flameAxis,normalize(cameraPosition-vWorld),${O.angularFloor},${O.angularPower}):1.;
  vec3 radiance=tint*(core*${P.coreFraction}+tongue*${C.tongueFraction})*power*emission;
  vec2 emberSize=vec2(${C.emberWidth},${C.emberLength})*ember.y;
  vec2 emberRadius=${P.coreRadiusSquared}*emberSize*emberSize+footprint*footprint*.35;
  float emberCore=exp(-dot(p*p,1./emberRadius))*${P.coreRadiusSquared}*emberSize.x*emberSize.y/sqrt(emberRadius.x*emberRadius.y);
  radiance+=vec3(1.,.12,.008)*emberCore*ember.x;
  // Do not clamp candlepower before area filtering: that made red and white
  // sources converge to the same intensity. Preserve color at half-float limit.
  radiance*=min(1.,${P.radianceMax.toFixed(1)}/max(max(radiance.r,max(radiance.g,radiance.b)),.0001));
  gl_FragColor=vec4(radiance,1.);
  }
 }else if(mode>1.5){
  float heat=pow(max(0.,1.-vAge),1.8);
  float footprint=max(length(dFdx(p)),length(dFdy(p)));
  vec2 radius2=vParticleRatio*vParticleRatio/12.+footprint*footprint*.35;
  float area=vParticleRatio.x*vParticleRatio.y/(12.*sqrt(radius2.x*radius2.y));
  float filtered=exp(-dot(p*p,1./radius2))*area;
  gl_FragColor=vec4(mix(vec3(1.,.14,.01),vec3(1.,.8,.35),heat)*filtered*heat*power,1.);
 }else{
  vec2 q=p+vec2(vSeed*17.,vSeed*9.)+vec2(vAge*.3,-vAge*.5);
  float n=fbm(q*3.5),edge=pow(max(0.,1.-r2),1.5);
  float density=edge*smoothstep(.18,.72,n)*smoothstep(0.,.08,vAge)*pow(1.-vAge,1.2);
  vec3 delta=vWorld-lightPosition;
  float emission=directional>.5?FlareEmissionGain(flameAxis,normalize(delta),${O.angularFloor},${O.angularPower}):1.;
  vec3 incident=ambient+tint*candle*scatter*emission/(dot(delta,delta)+4.);
  for(int i=0;i<${A.smokeLightSlots};i++){
   if(otherLight[i].w<=0.)continue;
   vec3 offset=vWorld-otherLight[i].xyz;
   float gain=otherLobe[i].x<0.?1.:FlareEmissionGain(otherAxis[i],offset*inversesqrt(max(dot(offset,offset),.000001)),otherLobe[i].x,otherLobe[i].y);
   incident+=otherTint[i]*otherLight[i].w*scatter*gain/(dot(offset,offset)+4.);
  }
  gl_FragColor=vec4(vec3(.46,.45,.42)*incident,1.-exp(-density*opacityScale));
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
    mode:{value:mode},clock:{value:0},power:{value:1},candle:{value:0},scatter:{value:A.smokeScatter},
    flameAxis:{value:new THREE.Vector3(0,-1,0)},directional:{value:0},opacityScale:{value:A.smokeOpacity},combustion:{value:new THREE.Vector4(1,1,1,0)},ember:{value:new THREE.Vector2()},
    otherLight:{value:Array.from({length:A.smokeLightSlots},()=>new THREE.Vector4())},
    otherTint:{value:Array.from({length:A.smokeLightSlots},()=>new THREE.Color())},
    otherAxis:{value:Array.from({length:A.smokeLightSlots},()=>new THREE.Vector3(0,-1,0))},
    otherLobe:{value:Array.from({length:A.smokeLightSlots},()=>new THREE.Vector2(-1,1))},
    launchPower:{value:0},launchTint:{value:new THREE.Color(C.launchColor)},launchAxis:{value:new THREE.Vector3(0,1,0)}},
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
 // Rolled rim and shoulder on the spent candle, authored in metres and kept
 // parametric with the canopy. Not a claim about an identified Type 95 casing.
 const r=A.candleRadius,h=A.candleHeight;
 const profile=[[0,-h/2],[r*.83,-h/2],[r*1.06,-h*.46],[r,-h*.39],[r,h*.35],[r*.92,h*.48],[r*.5,h/2],[0,h/2]].map(p=>new THREE.Vector2(...p));
 const mesh=new THREE.Mesh(new THREE.LatheGeometry(profile,16),material);
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
  const root=new THREE.Group(),head=Cards(2,0,flare.lightColor),smoke=Cards(A.smokeCount,1,flare.lightColor),sparks=Cards(A.sparkCount,2,0xffac50),suspension=MakeSuspension(),candle=Candle();
  const canopy=suspension.group;canopy.add(candle);
  const carrier=Candle();carrier.name='FlareDiscardedCarrier';carrier.scale.set(1.18,1.35,1.18);
  root.name='Flare/'+flare.id;root.add(head,smoke,sparks,canopy,carrier);this.root.add(root);
  const item={root,head,smoke,sparks,canopy,candle,carrier,surfaceHeight,...suspension};this.items.add(item);this.Update(item,flare);return item;
 }
 Lighting(){
  const l=this.lights;this.ambient.setRGB(A.ambientFloor,A.ambientFloor,A.ambientFloor);this.sun.setRGB(0,0,0);
  if(l){this.ambient.add(l.ambient.color.clone().multiplyScalar(l.ambient.intensity));
    // The probe's strength is not white irradiance: use its actual SH constant
    // band, as the PBR environment does, rather than making night smoke glow.
    const sh=l.globalProbe?.sh.coefficients[0],gain=(l.globalProbe?.intensity??0)*.886227/Math.PI;
    if(sh)this.ambient.add(new THREE.Color().setRGB(Math.max(0,sh.x)*gain,Math.max(0,sh.y)*gain,Math.max(0,sh.z)*gain));
    this.sun.copy(l.sun.color).multiplyScalar(l.sun.intensity/Math.PI);
  }else this.ambient.setRGB(.14,.15,.17);
 }
 Cloth(item,f,opened,settle,fade){
  const {cloth,cords,segments,rings}=item,p=cloth.geometry.attributes.position;
  const extension=.15+.85*opened;
  const baseY=(A.leaderLength+A.cordLength)*extension*(1-settle);
  const radius=A.canopyRadius*(.06+.94*opened),height=A.canopyHeight*opened*(1-settle);
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
   const r=j/rings,a=i/segments*Math.PI*2,theta=r*Math.PI*.5;
   const panel=Math.sin(a*A.ribs*.5)**2,flutter=Math.sin(a*3+f.t*3.7+r*9)*.004*r*r*(1-settle);
   const rr=A.ventRadius+(radius-A.ventRadius)*((1-settle)*Math.sin(theta)+settle*r)*(1-.045*panel*r*(1-settle));
   const y=baseY+height*Math.cos(theta)+panel*.025*r*(1-settle)+flutter+settle*FoldedHeight(a,r);
   const index=j*(segments+1)+i,c=item.contactOffsets,o=index*3;
   p.setXYZ(index,Math.cos(a)*rr+(c?.[o]||0)*settle,y+(c?.[o+1]||0)*settle,Math.sin(a)*rr+(c?.[o+2]||0)*settle);
  }p.needsUpdate=true;cloth.geometry.computeVertexNormals();
  const c=cords.geometry.attributes.position;let k=0;
  c.setXYZ(k++,0,A.candleHeight+A.candleLift,0);c.setXYZ(k++,0,A.leaderLength*extension*(1-settle)+.04*settle,0);
  for(let i=0;i<A.ribs;i++){
   const joinY=A.leaderLength*extension*(1-settle)+.04*settle,end=new THREE.Vector3().fromBufferAttribute(p,rings*(segments+1)+Math.round(i/A.ribs*segments));
   c.setXYZ(k++,0,joinY,0);c.setXYZ(k++,end.x*.5,(joinY+end.y)*.5-settle*.03,end.z*.5);
   c.setXYZ(k++,end.x*.5,(joinY+end.y)*.5-settle*.03,end.z*.5);c.setXYZ(k++,end.x,end.y,end.z);
  }c.needsUpdate=true;cords.geometry.setDrawRange(0,k);
  const u=cloth.material.uniforms;u.ambient.value.copy(this.ambient);u.sun.value.copy(this.sun);u.sunDirection.value.copy(this.lights?.sunDirection??new THREE.Vector3(0,1,0));
  const illumination=f.intensity*(f.photometricScale??1)*(f.sceneScale??1);
  u.selfLight.value.setHex(f.lightColor).multiplyScalar(illumination*A.canopySelfLight);u.opacity.value=.96*fade;
  cords.material.color.copy(this.ambient).add(this.sun).multiplyScalar(.3).add(new THREE.Color(f.lightColor).multiplyScalar(illumination*A.canopySelfLight*.3));cords.material.opacity=.75*fade;
  item.candle.position.set(0,(A.candleLift+A.candleHeight*.5)*(1-settle)+A.candleRadius*settle,0);
  item.candle.rotation.z=settle*Math.PI*.5;item.candle.material.opacity=fade;
 }
 Update(item,f){
  if(!this.items.has(item))return;this.Lighting();
  const {head,smoke,sparks,canopy}=item,t=f.t,since=t-f.ignitedAt;
  const opened=Smooth(0,A.openingS,since),settle=f.landed?Smooth(0,A.settleS,t-f.landing.t):0;
  const fade=f.landed?1-Smooth(f.endAt-A.groundFadeS,f.endAt,t):1;
  head.material.uniforms.clock.value=t+f.flickerPhase*.743;
  const combustion=SampleFlareCombustion(f,t);
  head.material.uniforms.combustion.value.set(combustion.width,combustion.length,combustion.aspect,0);
  head.material.uniforms.ember.value.set(C.emberRadiance*combustion.ember*(f.sceneScale??1),combustion.emberScale);
  head.material.uniforms.power.value=combustion.active?FlareCoreRadiance(f,combustion.width*combustion.length):0;
  const launch=FlareLaunchEmission(f,t),launchScale=(f.sceneScale??1)*FlarePhotometricScale(C.launchColor);
  head.material.uniforms.launchPower.value=C.launchRadiance*launch*launchScale;
  head.material.uniforms.launchAxis.value.set(f.at.x-f.from.x,2*f.apexM,f.at.z-f.from.z).normalize();
  sparks.material.uniforms.power.value=A.sparkRadiance*(f.sceneScale??1);
  const flow=SampleFlareFlowDirection(f,t),axis=head.material.uniforms.flameAxis.value;
  const attitude=SampleFlareAttitude(f,t);
  axis.set(flow.x,flow.y,flow.z);
  head.material.uniforms.directional.value=f.opticalMotion?1:0;
  Put(head,0,f.pos.x,f.pos.y,f.pos.z,A.glowSize,0);
  Put(head,1,f.from.x,f.groundY+A.launchHeight,f.from.z,f.parachute?C.whiteLaunchSizeM:C.signalLaunchSizeM,launch>0?1:-1);Flush(head);
  canopy.visible=f.parachute!==false&&!f.launchObstructed&&since>=0;
  canopy.position.set(f.pos.x,f.pos.y,f.pos.z);canopy.rotation.set(Math.sin(since*1.7)*.035*opened*(1-settle),0,Math.sin(since*2+f.swayPhase)*.055*opened*(1-settle));
  if(f.opticalMotion)canopy.rotation.set(attitude.x,0,attitude.z);
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
  const u=smoke.material.uniforms;u.ambient.value.copy(this.ambient).add(this.sun.clone().multiplyScalar(.65));u.lightPosition.value.set(f.pos.x,f.pos.y,f.pos.z);u.candle.value=f.intensity*(f.photometricScale??1)*(f.sceneScale??1);
  u.tint.value.setHex(launch>0?C.launchColor:f.lightColor);
  if(launch>0){u.lightPosition.value.set(f.from.x,f.groundY+A.launchHeight,f.from.z);u.candle.value=C.launchCd*launch*launchScale;}
  u.flameAxis.value.copy(axis);u.directional.value=launch>0?0:f.opticalMotion?1:0;
  const neighbors=[];
  for(const source of this.lights?.fireSources?.values()||[]){
   if(source.handle===f.lightHandle||!(source.currentIntensity>0))continue;
   const intensity=source.currentIntensity,distance=(source.position.x-f.pos.x)**2+(source.position.y-f.pos.y)**2+(source.position.z-f.pos.z)**2;
   neighbors.push({source,score:intensity/(distance+4)});
  }
  neighbors.sort((a,b)=>b.score-a.score);
  for(let i=0;i<A.smokeLightSlots;i++){
   const source=neighbors[i]?.source;
   if(!source){u.otherLight.value[i].w=0;continue;}
   u.otherLight.value[i].set(source.position.x,source.position.y,source.position.z,source.currentIntensity);
   u.otherTint.value[i].copy(source.currentColor||source.color);
   u.otherAxis.value[i].copy(source.emission?.direction||up);
   u.otherLobe.value[i].set(source.emission?.floor??-1,source.emission?.power??1);
  }
  for(let i=0;i<A.smokeCount;i++){
   const p=SampleFlareSmoke(f,t,i);
   if(!p){Put(smoke,i,0,0,0,0,-1);continue;}
   Put(smoke,i,p.x,p.y,p.z,p.size,p.age/p.life,p.seed);
  }Flush(smoke);
  for(let i=0;i<A.sparkCount;i++){
   const p=SampleFlareSpark(f,t,i);
   if(!p){Put(sparks,i,0,0,0,0,-1);continue;}
   Put(sparks,i,p.x,p.y,p.z,p.size,p.age/p.life,p.seed);
  }Flush(sparks);
 }
 Remove(item){if(!this.items.delete(item))return;item.root.removeFromParent();item.cloth.material.uniforms.weave.value.dispose();item.root.traverse(o=>{if(o.isInstancedMesh)o.dispose();o.geometry?.dispose();o.material?.dispose();});}
 Dispose(){for(const item of [...this.items])this.Remove(item);this.root.removeFromParent();}
}
