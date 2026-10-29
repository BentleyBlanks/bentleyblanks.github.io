// Absolute-time optical reconstruction: replay/seek never draws fresh randomness.
import {FLARE_OPTICS as O,FLARE_ART as A,FLARE_PHOTOMETRY as P,FLARE_COMBUSTION as C} from './Data_Tuning_FlareEffects.mjs';
const Clamp=x=>Math.max(0,Math.min(1,x));
const Smooth=x=>{x=Clamp(x);return x*x*x*(x*(x*6-15)+10);};
function Hash(n,seed){const a=Math.sin(n*127.1+seed*311.7)*43758.5453123;return a-Math.floor(a);}
function Noise(t,seed){const i=Math.floor(t),u=Smooth(t-i);return Hash(i,seed)*(1-u)+Hash(i+1,seed)*u;}
const spectra=new WeakMap();
function BurnSpectrum(f){
 let cache=spectra.get(f);if(cache?.phase===f.flickerPhase)return cache.modes;
 const modes=Array.from({length:O.flutterModes},(_,i)=>({
  hz:O.flutterBandHz[0]+(O.flutterBandHz[1]-O.flutterBandHz[0])*(i+Hash(i,f.flickerPhase+3))/O.flutterModes,
  phase:2*Math.PI*Hash(i,f.flickerPhase+51),seed:f.flickerPhase+i*17,
 }));spectra.set(f,{phase:f.flickerPhase,modes});return modes;
}
export function FlareBurnModulation(f,t,exposureS=0){
 let variation=0;
 // Integrate each band over the displayed frame's exposure, rather than
 // aliasing fast combustion into false slow beats at 30/24 fps.
 const center=t-Math.max(0,exposureS)*.5;
 const amplitude=O.flutterRms*Math.sqrt(2/O.flutterModes);
 for(const mode of BurnSpectrum(f)){
  const hz=mode.hz,a=Math.PI*hz*Math.max(0,exposureS),filter=a>1e-6?Math.sin(a)/a:1;
  const antiAlias=1-Smooth((hz*Math.max(0,exposureS)-.35)/.15);
  const phase=mode.phase+O.phaseWander*(Noise(center*O.phaseWanderHz,mode.seed)-.5);
  variation+=amplitude*filter*antiAlias*Math.sin(2*Math.PI*hz*center+phase);
 }
 const blend=Smooth((t-(f.burnAt??f.ignitedAt+f.igniteS))/O.settleBurnS);
 return 1+Math.max(-O.flutterLimit,Math.min(O.flutterLimit,variation))*blend;
}
const colorScale=new Map();
export function FlarePhotometricScale(hex){
 if(colorScale.has(hex))return colorScale.get(hex);
 const Linear=v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;};
 // Renderer RGB is linear Rec.709; quoted candlepower is photopic Y. A red
 // source must not silently lose ~78% of its stated intensity to RGB tinting.
 const y=.2126*Linear((hex>>16)&255)+.7152*Linear((hex>>8)&255)+.0722*Linear(hex&255);
 const scale=y>1e-6?1/y:0;colorScale.set(hex,scale);return scale;
}
export function FlareCoreRadiance(f,areaScale=1){
 // Integral of exp(-r²/s²) over the billboard's emitting area. Candela is
 // intensity, not surface luminance: L = I / projected emitting area (NIST).
 // The shader applies pixel filtering first, then a half-float safety cap.
 const area=Math.PI*P.coreRadiusSquared*A.glowSize*A.glowSize*.25*Math.max(areaScale,1e-6);
 return Math.max(0,f.intensity)*(f.photometricScale??1)*(f.sceneScale??1)/area;
}
export function SampleFlareCombustion(f,t=f.t){
 const since=t-f.ignitedAt,remaining=f.outAt-t,active=!f.launchObstructed&&since>=0&&remaining>0;
 const fuel=active?Math.min(Smooth(since/Math.max(f.igniteS,.001)),Clamp(remaining/Math.max(f.fadeS,.001))):0;
 const width=active?C.minWidth+(1-C.minWidth)*Math.sqrt(fuel):0;
 const length=active?C.minLength+(1-C.minLength)*Math.pow(fuel,.7):0;
 const after=Clamp((t-f.outAt)/C.emberLifeS);
 const emberVisible=!f.launchObstructed&&t<f.outAt+C.emberLifeS;
 const reveal=Smooth((t-(f.outAt-C.emberLifeS*.5))/(C.emberLifeS*.5));
 const ember=emberVisible?Math.max(0,reveal*Math.exp(-after*C.emberCooling)*(1-Smooth(after))):0;
 return {active,fuel,width,length,ember,emberScale:emberVisible?Math.sqrt(1-after):0,
  aspect:f.parachute===false?C.signalAspect:C.whiteAspect};
}
export function FlareLaunchEmission(f,t=f.t,exposureS=f.lightExposureS??0){
 if(!f.physical||t<0||t>=C.launchS+Math.max(0,exposureS))return 0;
 if(t===0||!(exposureS>0))return Math.max(0,1-t/C.launchS)**2;
 const start=Math.max(0,t-exposureS),end=Math.min(C.launchS,t);
 if(end<=start)return 0;
 const Integral=x=>C.launchS/3*(1-(1-x/C.launchS)**3);
 return Math.max(0,(Integral(end)-Integral(start))/exposureS);
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
