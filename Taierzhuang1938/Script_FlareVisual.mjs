// Shared game/editor renderer. Absolute-time smoke/sparks make scrubbing deterministic.
// No billboard art download: small emissive source, soft smoke, physical canopy and cords.
import * as THREE from 'three';
import {FLARE_ART as A} from './Data_Tuning_FlareEffects.mjs';
import {SampleFlarePosition} from './Script_Flare.mjs';

const VERTEX=`varying vec2 vUv; varying float vAge;
attribute float age;
void main(){vUv=uv;vAge=age;
  vec4 center=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);
  float size=length(instanceMatrix[0].xyz);
  center.xy+=position.xy*size;
  gl_Position=projectionMatrix*center;}`;
const FRAGMENT=`precision highp float;
varying vec2 vUv;varying float vAge;
uniform vec3 tint;uniform float mode;uniform float clock;uniform float power;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
void main(){vec2 p=(vUv-.5)*2.;float r=length(p);if(r>1.||vAge<0.)discard;
if(mode<.5){
 float n=noise(p*7.+vec2(clock*2.,-clock*7.));
 float core=exp(-dot(p*vec2(1.5,.8),p*vec2(1.5,.8))*85.)*(.8+.2*n);
 float halo=exp(-r*r*12.)*.12;
 float colored=1.-smoothstep(.05,.3,tint.g);
 gl_FragColor=vec4((tint*halo*mix(4.,9.,colored)+mix(tint,vec3(1),mix(.65,.02,colored))*core*mix(14.,4.,colored))*power,1.);
}else{
 float n=noise(p*3.+vAge*2.)*.65+noise(p*8.-vAge)*.35;
 float edge=1.-smoothstep(.3,1.,r);
 float alpha=edge*(.35+.65*n)*sin(3.14159*clamp(vAge,0.,1.))*.34;
 gl_FragColor=vec4(tint,alpha);
}
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

function Cards(count,mode,color){
 const geometry=new THREE.PlaneGeometry(1,1);
 geometry.setAttribute('age',new THREE.InstancedBufferAttribute(new Float32Array(count).fill(-1),1));
 const material=new THREE.ShaderMaterial({vertexShader:VERTEX,fragmentShader:FRAGMENT,
  uniforms:{tint:{value:new THREE.Color(color)},mode:{value:mode},clock:{value:0},power:{value:1}},
  transparent:true,depthWrite:false,depthTest:true,blending:mode===0?THREE.AdditiveBlending:THREE.NormalBlending});
 const mesh=new THREE.InstancedMesh(geometry,material,count);mesh.frustumCulled=false;
 mesh.name=mode===0?'FlareRadiance':'FlareSmoke';return mesh;
}
function Canopy(){
 const geometry=new THREE.SphereGeometry(A.canopyRadius,32,10,0,Math.PI*2,0,Math.PI*.5);
 const p=geometry.attributes.position;
 for(let i=0;i<p.count;i++){
  const x=p.getX(i),z=p.getZ(i),theta=Math.atan2(z,x),r=Math.hypot(x,z)/A.canopyRadius;
  p.setY(i,p.getY(i)*A.canopyHeight/A.canopyRadius-.025*Math.cos(theta*A.ribs)*r*r);
 }geometry.computeVertexNormals();
 // Thin translucent fabric belongs to the transparent-effects pass (no opaque
 // prepass/motion-vector claim for this VfxRoot-owned canopy).
 const material=new THREE.MeshStandardMaterial({color:0xaca18b,roughness:1,side:THREE.DoubleSide,transparent:true,opacity:.94,depthWrite:false});
 const canopy=new THREE.Mesh(geometry,material);canopy.name='FlareSilkCanopy';canopy.position.y=A.cordLength;
 const points=[];for(let i=0;i<A.ribs;i++){const a=i/A.ribs*Math.PI*2;
  points.push(0,.12,0,Math.cos(a)*A.canopyRadius,A.cordLength,Math.sin(a)*A.canopyRadius);}
 const cords=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(points,3)),
  new THREE.LineBasicMaterial({color:0x9d937d,transparent:true,opacity:.9,depthWrite:false}));cords.name='FlareSuspensionLines';
 const group=new THREE.Group();group.add(canopy,cords);return group;
}
const matrix=new THREE.Matrix4(),pos=new THREE.Vector3(),scale=new THREE.Vector3(),q=new THREE.Quaternion();
function Put(mesh,i,x,y,z,size,age){pos.set(x,y,z);scale.setScalar(size);matrix.compose(pos,q,scale);mesh.setMatrixAt(i,matrix);mesh.geometry.attributes.age.setX(i,age);}
function Flush(mesh){mesh.instanceMatrix.needsUpdate=true;mesh.geometry.attributes.age.needsUpdate=true;}

export class FlareVisuals {
 constructor(parent){this.root=new THREE.Group();this.root.name='FlareEffects';parent.add(this.root);this.items=new Set();}
 Add(flare){
  const root=new THREE.Group(),head=Cards(1,0,flare.lightColor),smoke=Cards(A.smokeCount,1,0xaaa99f),sparks=Cards(A.sparkCount,0,0xffac50),canopy=Canopy();
  root.name='Flare/'+flare.id;root.add(head,smoke,sparks,canopy);this.root.add(root);
  const item={root,head,smoke,sparks,canopy};this.items.add(item);this.Update(item,flare);return item;
 }
 Update(item,f){
  if(!this.items.has(item))return;
  const {head,smoke,sparks,canopy}=item,t=f.t,since=t-f.ignitedAt;
  head.material.uniforms.clock.value=t;head.material.uniforms.power.value=f.brightness;
  Put(head,0,f.pos.x,f.pos.y,f.pos.z,A.glowSize,0);Flush(head);
  canopy.visible=f.parachute!==false&&since>=0;
  const opened=THREE.MathUtils.smoothstep(since,0,A.openingS);
  canopy.position.set(f.pos.x,f.pos.y,f.pos.z);canopy.scale.set(.08+.92*opened,.3+.7*opened,.08+.92*opened);
  canopy.rotation.z=Math.sin(since*2+f.swayPhase)*.07*opened;canopy.rotation.x=Math.sin(since*1.7)*.05*opened;
  // White fabric catches the candle's own upward light without another light slot.
  canopy.children[0].material.emissive.setHex(f.lightColor).multiplyScalar(.018*f.brightness);
  for(let i=0;i<A.smokeCount;i++){
   const born=(Math.floor(t*A.smokeHz)-i)/A.smokeHz,age=t-born;
   if(born<.08||born>f.outAt||age>A.smokeLife){Put(smoke,i,0,0,0,0,-1);continue;}
   const p=SampleFlarePosition(f,born),burn=born>=f.ignitedAt;
   const seed=Math.sin(born*74.7+f.swayPhase),spread=.10+age*.12;
   Put(smoke,i,p.x+Math.sin(f.driftDirRad)*f.driftMS*age+seed*spread,
    p.y+age*.5,p.z+Math.cos(f.driftDirRad)*f.driftMS*age+Math.cos(born*43.1)*spread,
    (burn?.24:.12)+age*.28,age/A.smokeLife);
  }Flush(smoke);
  smoke.material.uniforms.tint.value.setHex(0xaaa99f).lerp(new THREE.Color(f.lightColor),.1*f.brightness);
  for(let i=0;i<A.sparkCount;i++){
   const born=(Math.floor(t*22)-i)/22,age=t-born;
   if(born<f.ignitedAt||born>f.outAt||age>A.sparkLife){Put(sparks,i,0,0,0,0,-1);continue;}
   const p=SampleFlarePosition(f,born),a=born*137.5;
   Put(sparks,i,p.x+Math.sin(a)*age*.4,p.y-age*.9-4.905*age*age,p.z+Math.cos(a)*age*.4,.045*(1-age/A.sparkLife),0);
  }sparks.material.uniforms.power.value=f.brightness*.6;Flush(sparks);
 }
 Remove(item){if(!this.items.delete(item))return;item.root.removeFromParent();item.root.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}
 Dispose(){for(const item of [...this.items])this.Remove(item);this.root.removeFromParent();}
}
