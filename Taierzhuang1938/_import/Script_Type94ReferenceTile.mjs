// Native-photo coordinates are the contract for both full-frame and crop views.
// This utility changes the reference viewer's projection only, never the asset.
export function UndistortReferencePixel(point,camera,useLens=true){
 const k=camera.k,d=camera.distortion||[],xd=(point[0]-k[0][2])/k[0][0],yd=(point[1]-k[1][2])/k[1][1];
 if(!useLens)return point.slice();
 let x=xd,y=yd;
 for(let i=0;i<12;i++){
  const r2=x*x+y*y,s=1+(d[0]||0)*r2+(d[1]||0)*r2*r2+(d[4]||0)*r2*r2*r2;
  const tx=2*(d[2]||0)*x*y+(d[3]||0)*(r2+2*x*x),ty=(d[2]||0)*(r2+2*y*y)+2*(d[3]||0)*x*y;
  x=(xd-tx)/s;y=(yd-ty)/s;
 }
 return[x*k[0][0]+k[0][2],y*k[1][1]+k[1][2]];
}
export function CalculateReferenceTile(camera,imageSize,crop,useLens=true,gutter=16){
 const[w,h]=imageSize,output=crop?crop.slice():[0,0,w,h];
 if(!output.every(Number.isFinite)||output[2]<=0||output[3]<=0)throw Error('Invalid reference crop');
 if(!crop)return{output,source:[-.2*w,-.2*h,1.4*w,1.4*h]};
 let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
 for(let j=0;j<=32;j++)for(let i=0;i<=32;i++){
  const p=UndistortReferencePixel([output[0]+output[2]*i/32,output[1]+output[3]*j/32],camera,useLens);
  left=Math.min(left,p[0]);top=Math.min(top,p[1]);right=Math.max(right,p[0]);bottom=Math.max(bottom,p[1]);
 }
 if(![left,top,right,bottom].every(Number.isFinite))throw Error('Nonfinite lens tile');
 const x=Math.floor(left)-gutter,y=Math.floor(top)-gutter;
 return{output,source:[x,y,Math.ceil(right)+gutter-x,Math.ceil(bottom)+gutter-y]};
}
export function CropReferenceCamera(THREE,camera,imageSize,source,margin=.2){
 const[w,h]=imageSize,[x,y,cw,ch]=source,c=camera.clone();
 const m=new THREE.Matrix4().set(w*(1+2*margin)/cw,0,0,(w-2*x-cw)/cw,0,h*(1+2*margin)/ch,0,(2*y+ch-h)/ch,0,0,1,0,0,0,0,1);
 c.projectionMatrix.premultiply(m);c.projectionMatrixInverse.copy(c.projectionMatrix).invert();return c;
}
export const ReferenceLensTileFragment=`
varying vec2 vUv;
uniform sampler2D source;
uniform vec2 size,focal,centre,tangential;
uniform vec3 radial;
uniform vec4 outputRegion,sourceRegion;
uniform float useLens;
void main(){
 vec2 pixel=outputRegion.xy+vec2(vUv.x,1.-vUv.y)*outputRegion.zw;
 vec2 distorted=(pixel-centre)/focal,u=distorted;
 if(useLens>.5){for(int i=0;i<12;i++){
  float r2=dot(u,u),s=1.+radial.x*r2+radial.y*r2*r2+radial.z*r2*r2*r2;
  vec2 t=vec2(2.*tangential.x*u.x*u.y+tangential.y*(r2+2.*u.x*u.x),tangential.x*(r2+2.*u.y*u.y)+2.*tangential.y*u.x*u.y);
  u=(distorted-t)/s;
 }}
 vec2 p=(u*focal+centre-sourceRegion.xy)/sourceRegion.zw;p.y=1.-p.y;
 if(any(lessThan(p,vec2(0.)))||any(greaterThan(p,vec2(1.)))){gl_FragColor=vec4(0.);return;}
 vec4 color=texture2D(source,p);color.rgb/=max(color.a,1e-8);gl_FragColor=color;
 #include <colorspace_fragment>
 gl_FragColor.rgb*=gl_FragColor.a;
}`;
