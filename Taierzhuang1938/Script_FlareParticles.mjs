// Absolute-time visual particles; sizes/rates are reconstruction, not a chemical
// particle-size measurement. Use the same deterministic births when seeking.
import {FLARE_ART as A} from './Data_Tuning_FlareEffects.mjs';
import {SampleFlarePosition} from './Script_Flare.mjs';
import {SampleFlareAttitude,SampleFlareCombustion} from './Script_FlareOptics.mjs';
const Hash=(n,seed)=>{const v=Math.sin(n*127.1+seed*311.7)*43758.5453123;return v-Math.floor(v);};
const Smooth=(a,b,x)=>{const u=Math.max(0,Math.min(1,(x-a)/(b-a)));return u*u*(3-2*u);};

export function SampleFlareRelease(f,born){
 const position=SampleFlarePosition(f,born),dt=Math.min(.01,Math.max(0,born));
 const previous=SampleFlarePosition(f,born-dt),velocity={x:0,y:0,z:0};
 if(dt>0)for(const axis of ['x','y','z'])velocity[axis]=(position[axis]-previous[axis])/dt;
 return {position,velocity};
}
// A free star's flame and ejecta trail the air-relative motion. World-space
// velocity alone would turn a wind-carried star's tail into its drift direction.
export function SampleFlareFlowDirection(f,t,release=SampleFlareRelease(f,t)){
 if(f.parachute)return SampleFlareAttitude(f,t).direction;
 const {velocity:v}=release;
 const x=Math.sin(f.driftDirRad)*f.driftMS-v.x,y=-v.y,z=Math.cos(f.driftDirRad)*f.driftMS-v.z;
 const length=Math.hypot(x,y,z);
 return length>1e-6?{x:x/length,y:y/length,z:z/length}:{x:0,y:1,z:0};
}
export function SampleFlareSmoke(f,t,index){
 const born=(Math.floor(t*A.smokeHz)-index)/A.smokeHz,age=t-born;
 const launch=born>=0&&born<.16,birth=SampleFlareCombustion(f,born);
 if(age<0||age>A.smokeLife||(!launch&&(!birth.active||Math.sin(born*178.3+f.flickerPhase)*.5+.5>birth.fuel)))return null;
 const release=SampleFlareRelease(f,born),p=launch?{x:f.from.x,y:f.groundY+A.launchHeight,z:f.from.z}:release.position;
 const seed=Math.sin(born*74.7+f.swayPhase)*.5+.5;
 const spread=.025+age*.09+(f.parachute&&!launch?.22*Smooth(.25,.9,age):0);
 const drag=A.smokeDragS*(1-Math.exp(-age/A.smokeDragS));
 const v=launch?{x:0,y:0,z:0}:release.velocity;
 const wx=Math.sin(f.driftDirRad)*f.driftMS,wz=Math.cos(f.driftDirRad)*f.driftMS;
 // Wind accelerates a released particle towards the air speed. It does not
 // add that speed to its inherited velocity at the instant of emission.
 // The canopy wake remains a separate deflection around the leeward skirt.
 const wake=f.parachute&&!launch?A.canopyRadius*1.2*Smooth(.25,.8,age):0;
 return {born,age,life:A.smokeLife,launch,seed,size:.1+age*.32,
  x:p.x+wx*age+(v.x-wx)*drag+Math.sin(f.driftDirRad)*wake+Math.sin(born*3.7+age)*spread,
  y:p.y+v.y*drag+age*A.smokeRiseMS-(f.parachute&&!launch?.16:0),
  z:p.z+wz*age+(v.z-wz)*drag+Math.cos(f.driftDirRad)*wake+Math.cos(born*4.1-age*.4)*spread};
}
export function SampleFlareSpark(f,t,index){
 // A carrier stopped before deployment never ignited. Its scheduled ignition
 // timestamp alone must not create hot particles later in the spent phase.
 if(f.launchObstructed)return null;
 const slot=Math.floor(t*A.sparkHz)-index,seed=f.flickerPhase??0;
 const born=(slot+.85*Hash(slot,seed))/A.sparkHz,age=t-born;
 const life=A.sparkLifeMin+(A.sparkLife-A.sparkLifeMin)*Hash(slot,seed+31);
 if(born<f.ignitedAt||born>=f.outAt||age<0||age>=life)return null;
 if(Hash(slot,seed+73)>SampleFlareCombustion(f,born).fuel)return null;
 const {position:p,velocity:v}=SampleFlareRelease(f,born);
 const axis=SampleFlareFlowDirection(f,born,{position:p,velocity:v});
 const speed=A.sparkEjectMS*(.3+Hash(slot,seed+9));
 const angle=2*Math.PI*Hash(slot,seed+17),spread=.35*Hash(slot,seed+23);
 v.x+=axis.x*speed+Math.cos(angle)*spread;
 v.y+=axis.y*speed;v.z+=axis.z*speed+Math.sin(angle)*spread;
 const drag=A.sparkDragS*(.7+.6*Hash(slot,seed+47)),travel=drag*(1-Math.exp(-age/drag));
 const wx=Math.sin(f.driftDirRad)*f.driftMS,wz=Math.cos(f.driftDirRad)*f.driftMS;
 return {born,age,life,seed:Hash(slot,seed+53),size:A.sparkSizeMin+(A.sparkSizeMax-A.sparkSizeMin)*Hash(slot,seed+61),
  x:p.x+wx*age+(v.x-wx)*travel,
  y:p.y+v.y*travel-A.gravity*drag*(age-travel),
  z:p.z+wz*age+(v.z-wz)*travel};
}
