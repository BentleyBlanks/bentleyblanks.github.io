// Absolute-time visual particles; sizes/rates are reconstruction, not a chemical
// particle-size measurement. Use the same deterministic births when seeking.
import {FLARE_ART as A} from './Data_Tuning_FlareEffects.mjs';
import {SampleFlarePosition} from './Script_Flare.mjs';
import {SampleFlareAttitude} from './Script_FlareOptics.mjs';
const Hash=(n,seed)=>{const v=Math.sin(n*127.1+seed*311.7)*43758.5453123;return v-Math.floor(v);};

export function SampleFlareRelease(f,born){
 const position=SampleFlarePosition(f,born),dt=Math.min(.01,Math.max(0,born));
 const previous=SampleFlarePosition(f,born-dt),velocity={x:0,y:0,z:0};
 if(dt>0)for(const axis of ['x','y','z'])velocity[axis]=(position[axis]-previous[axis])/dt;
 return {position,velocity};
}
export function SampleFlareSpark(f,t,index){
 const slot=Math.floor(t*A.sparkHz)-index,seed=f.flickerPhase??0;
 const born=(slot+.85*Hash(slot,seed))/A.sparkHz,age=t-born;
 const life=A.sparkLifeMin+(A.sparkLife-A.sparkLifeMin)*Hash(slot,seed+31);
 if(born<f.ignitedAt||born>=f.outAt||age<0||age>=life)return null;
 const {position:p,velocity:v}=SampleFlareRelease(f,born);
 const axis=f.parachute?SampleFlareAttitude(f,born).direction:{x:-v.x,y:-v.y,z:-v.z};
 const len=Math.hypot(axis.x,axis.y,axis.z)||1,speed=A.sparkEjectMS*(.3+Hash(slot,seed+9));
 const angle=2*Math.PI*Hash(slot,seed+17),spread=.35*Hash(slot,seed+23);
 v.x+=axis.x/len*speed+Math.cos(angle)*spread;
 v.y+=axis.y/len*speed;v.z+=axis.z/len*speed+Math.sin(angle)*spread;
 const drag=A.sparkDragS*(.7+.6*Hash(slot,seed+47)),travel=drag*(1-Math.exp(-age/drag));
 const wx=Math.sin(f.driftDirRad)*f.driftMS,wz=Math.cos(f.driftDirRad)*f.driftMS;
 return {born,age,life,seed:Hash(slot,seed+53),size:A.sparkSizeMin+(A.sparkSizeMax-A.sparkSizeMin)*Hash(slot,seed+61),
  x:p.x+wx*age+(v.x-wx)*travel,
  y:p.y+v.y*travel-A.gravity*drag*(age-travel),
  z:p.z+wz*age+(v.z-wz)*travel};
}
