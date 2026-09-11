import * as THREE from 'three';
// 从实际三角面投影轮廓和前后表面高度，不再用包围椭球扩大接触黑晕。
export function CreateContactOcclusion(){
 const limit=24,tile=64,grid=5,side=tile*grid,range=.40,data=new Uint8Array(side*side*4),cache=new WeakMap();
 const texture=new THREE.DataTexture(data,side,side,THREE.RGBAFormat);texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;
 const matrices=Array.from({length:limit},()=>new THREE.Matrix4()),sizes=Array.from({length:limit},()=>new THREE.Vector3(1,1,1)),uniforms={contactInverse:{value:matrices},contactSize:{value:sizes},contactCount:{value:0},contactEnabled:{value:1},contactLamp:{value:new THREE.Vector3()},contactOutline:{value:texture}};
 const slotGeometry=Array(limit).fill(null);let covered=0;
 function Outline(g){
  if(cache.has(g))return cache.get(g);g.computeBoundingBox();const center=g.boundingBox.getCenter(new THREE.Vector3()),size=g.boundingBox.getSize(new THREE.Vector3()).multiplyScalar(.5).add(new THREE.Vector3(range,range,.025));
  const count=tile*tile,low=new Float32Array(count).fill(Infinity),high=new Float32Array(count).fill(-Infinity),p=g.attributes.position,idx=g.index;
  const points=Array.from({length:p.count},(_,i)=>[(p.getX(i)-center.x)/size.x*.5*(tile-1)+(tile-1)/2,(p.getY(i)-center.y)/size.y*.5*(tile-1)+(tile-1)/2,p.getZ(i)-center.z]);
  for(let i=0;i<(idx?idx.count:p.count);i+=3){
   const [a,b,c]=[0,1,2].map(k=>points[idx?idx.getX(i+k):i+k]),den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-9)continue;
   const x0=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),x1=Math.min(tile-1,Math.ceil(Math.max(a[0],b[0],c[0]))),y0=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),y1=Math.min(tile-1,Math.ceil(Math.max(a[1],b[1],c[1])));
   for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den,v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den;if(u<-.015||v<-.015||u+v>1.015)continue;const z=u*a[2]+v*b[2]+(1-u-v)*c[2],k=y*tile+x;low[k]=Math.min(low[k],z);high[k]=Math.max(high[k],z);}
  }
  const mask=low.map(v=>Number.isFinite(v)?1:0),nearest=new Int32Array(count).fill(-1),dist=new Float32Array(count).fill(1e6),sx=size.x*2/(tile-1),sy=size.y*2/(tile-1);
  for(let y=1;y<tile-1;y++)for(let x=1;x<tile-1;x++){const k=y*tile+x;if(mask[k]&&[k-1,k+1,k-tile,k+tile].some(j=>!mask[j])){dist[k]=0;nearest[k]=k;}}
  function Visit(k,j,cost){if(j<0||j>=count||nearest[j]<0)return;if(dist[j]+cost<dist[k]){dist[k]=dist[j]+cost;nearest[k]=nearest[j];}}
  const diag=Math.hypot(sx,sy);
  for(let y=0;y<tile;y++)for(let x=0;x<tile;x++){const k=y*tile+x;if(x)Visit(k,k-1,sx);if(y)Visit(k,k-tile,sy);if(x&&y)Visit(k,k-tile-1,diag);if(x<tile-1&&y)Visit(k,k-tile+1,diag);}
  for(let y=tile-1;y>=0;y--)for(let x=tile-1;x>=0;x--){const k=y*tile+x;if(x<tile-1)Visit(k,k+1,sx);if(y<tile-1)Visit(k,k+tile,sy);if(x<tile-1&&y<tile-1)Visit(k,k+tile+1,diag);if(x&&y<tile-1)Visit(k,k+tile-1,diag);}
  const pixels=new Uint8Array(count*4);
  for(let k=0;k<count;k++){const j=mask[k]?k:nearest[k];pixels[k*4]=Math.round(THREE.MathUtils.clamp(.5+(mask[k]?-dist[k]:dist[k])/(range*2),0,1)*255);pixels[k*4+1]=Math.round(THREE.MathUtils.clamp(.5+(j>=0?low[j]:0)/size.z/2,0,1)*255);pixels[k*4+2]=Math.round(THREE.MathUtils.clamp(.5+(j>=0?high[j]:0)/size.z/2,0,1)*255);pixels[k*4+3]=255;}
  const result={center,size,pixels};cache.set(g,result);return result;
 }
 function Bind(shader,{self=-1,wall=null}={}){
  Object.assign(shader.uniforms,uniforms);shader.uniforms.contactSelf={value:self};
  shader.vertexShader='varying vec3 contactWorld;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','contactWorld=(modelMatrix*vec4(transformed,1.0)).xyz;\n#include <project_vertex>');
  shader.fragmentShader=`varying vec3 contactWorld;uniform mat4 contactInverse[24];uniform vec3 contactSize[24];uniform int contactCount;uniform int contactSelf;uniform float contactEnabled;uniform vec3 contactLamp;uniform sampler2D contactOutline;
   vec3 ReadContact(vec3 q,vec3 r,int index){vec2 uv=clamp(q.xy/r.xy*.5+.5,vec2(0.0),vec2(1.0));vec2 cell=vec2(float(index%5),floor(float(index)/5.0));vec3 sampleValue=texture2D(contactOutline,(cell+(uv*63.0+.5)/64.0)/5.0).rgb;return vec3((sampleValue.r-.5)*.8,(sampleValue.gb-.5)*2.0*r.z);}
  `+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <aomap_fragment>',`#include <aomap_fragment>
   float contactAo=1.0;float contactShadow=1.0;vec3 contactRay=normalize(contactLamp-contactWorld);
   for(int ci=0;ci<24;ci++){
    if(ci>=contactCount)break;if(ci==contactSelf)continue;
    vec3 q=(contactInverse[ci]*vec4(contactWorld,1.0)).xyz,r=contactSize[ci];
    if(any(greaterThan(abs(q),r+vec3(.32))))continue;
    vec3 surface=ReadContact(q,r,ci);float gap=abs(q.z-surface.y);
    // 0.09 mm 的局部暗缝只跟随真实投影轮廓，离壁后按间隙自然消退。
    float rim=exp(-abs(surface.x)/.135)*exp(-gap/.24);
    contactAo=min(contactAo,1.0-.76*rim);
    vec3 rd=(contactInverse[ci]*vec4(contactRay,0.0)).xyz;
    for(int si=0;si<4;si++){
     float travel=.045+float(si)*.085;vec3 probe=q+rd*travel;
     if(any(greaterThan(abs(probe.xy),r.xy)))continue;
     vec3 hit=ReadContact(probe,r,ci);float silhouette=1.0-smoothstep(-.018,.026,hit.x);
     float volume=smoothstep(hit.y-.012,hit.y+.024,probe.z)*(1.0-smoothstep(hit.z-.012,hit.z+.024,probe.z));
     contactShadow=min(contactShadow,1.0-.64*silhouette*volume);
    }
   }
   contactAo=mix(1.0,contactAo,contactEnabled);contactShadow=mix(1.0,contactShadow,contactEnabled);
   reflectedLight.indirectDiffuse*=contactAo;reflectedLight.indirectSpecular*=sqrt(contactAo);
   reflectedLight.directDiffuse*=min(contactShadow,mix(1.0,contactAo,.70));reflectedLight.directSpecular*=contactShadow;
  `);
 }
 function Update(chunks,lamp){
  uniforms.contactLamp.value.copy(lamp.position);const slots=new Map();let i=0,dirty=false;
  for(const c of chunks){if(i===limit)break;if(c.fine||!c.mesh.visible||['fractured','collected'].includes(c.state))continue;
   const outline=Outline(c.mesh.geometry);c.mesh.updateMatrixWorld(true);matrices[i].copy(c.mesh.matrixWorld).multiply(new THREE.Matrix4().makeTranslation(...outline.center.toArray())).invert();sizes[i].copy(outline.size);slots.set(c,i);
   if(slotGeometry[i]!==c.mesh.geometry){for(let y=0;y<tile;y++){const start=((Math.floor(i/grid)*tile+y)*side+(i%grid)*tile)*4;data.set(outline.pixels.subarray(y*tile*4,(y+1)*tile*4),start);}slotGeometry[i]=c.mesh.geometry;dirty=true;}i++;
  }
  if(dirty)texture.needsUpdate=true;uniforms.contactCount.value=i;covered=i;
  for(const c of chunks){const m=c.mesh.material;m.userData.contactSelf=slots.get(c)??-1;if(m.userData.contactShader)m.userData.contactShader.uniforms.contactSelf.value=m.userData.contactSelf;}
 }
 return{Bind,Update,Prepare:Outline,SetEnabled(value){uniforms.contactEnabled.value=value?1:0;},Probe(){return{contactOcclusion:'actual triangle silhouette edge AO and short contact rays',contactOccluders:covered,contactEnabled:!!uniforms.contactEnabled.value,contactRimMm:.135}}};
}
