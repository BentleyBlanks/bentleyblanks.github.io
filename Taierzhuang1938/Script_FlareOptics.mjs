// Absolute-time optical reconstruction: replay/seek never draws fresh randomness.
import {FLARE_OPTICS as O,FLARE_ART as A} from './Data_Tuning_FlareEffects.mjs';
const Clamp=x=>Math.max(0,Math.min(1,x));
const Smooth=x=>{x=Clamp(x);return x*x*x*(x*(x*6-15)+10);};
function Hash(n,seed){const a=Math.sin(n*127.1+seed*311.7)*43758.5453123;return a-Math.floor(a);}
function Noise(t,seed){const i=Math.floor(t),u=Smooth(t-i);return Hash(i,seed)*(1-u)+Hash(i+1,seed)*u;}
export function FlareBurnModulation(f,t){
 let n=0;for(let i=0;i<O.noiseHz.length;i++)n+=Noise(t*O.noiseHz[i],f.flickerPhase+i*17)*O.noiseWeight[i];
 const dip=Smooth((Noise(t*O.dipHz,f.flickerPhase+91)-.58)/.42);
 const modulation=Math.max(O.floor,O.floor+(1-O.floor)*n-O.dipDepth*dip);
 const blend=Smooth((t-(f.burnAt??f.ignitedAt+f.igniteS))/O.settleBurnS);
 return Math.max(O.floor,Math.min(1,1+(modulation-1)*blend));
}
export function SampleFlareAttitude(f,t){
 const s=Math.max(0,t-f.ignitedAt),open=Smooth(s/A.openingS);
 const settle=f.landing?1-Smooth((t-f.landing.t)/A.settleS):1;
 const weight=f.opticalMotion&&f.parachute!==false?open*settle:0,L=A.cordLength+A.leaderLength;
 const w=Math.sqrt(A.gravity/L),phase=f.swayPhase;
 const gust=(Noise(s*.37,phase+13)*2-1)*O.gustRad;
 const x=weight*(O.tiltXRad*Math.sin(s*w+phase+gust)+gust);
 const z=weight*(O.tiltZRad*Math.sin(s*w*O.secondaryPeriodRatio+phase*1.31)-gust*.6);
 // Euler XYZ rotates the downward emission axis and the whole suspension.
 const direction={x:Math.sin(z),y:-Math.cos(z)*Math.cos(x),z:-Math.cos(z)*Math.sin(x)};
 return {x,z,direction,offset:{x:direction.x*L,y:(direction.y+1)*L,z:direction.z*L}};
}
export function FlareAngularGain(cosine,floor=O.angularFloor,power=O.angularPower){
 return floor+(1-floor)*Math.pow(Math.max(0,Math.min(1,cosine)),power);
}
// Shared by surfaces, visible hot core, smoke and volumetric scattering.
export const FLARE_ANGULAR_GLSL=`
float FlareEmissionGain(vec3 axis,vec3 toward,float floorGain,float exponent){
 return mix(floorGain,1.,pow(max(0.,dot(axis,toward)),exponent));
}`;
