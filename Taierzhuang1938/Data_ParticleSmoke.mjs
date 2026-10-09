import {BATTLE_SMOKE_STYLES} from './Data_Tuning_BattleSmoke.mjs';
import {PARTICLE_VOLUME_ASSETS} from './Data_ParticleVolumeAssets.mjs';

const Position=v=>[v.x,v.y,v.z];
// One 3D fluid sequence owns each stationary plume. The actual wreck outlet,
// authored height, prevailing drift and opacity remain scene inputs.
export function BattleSmokeModules(source,quality='high'){
 const p=source.backdrop;if(!p)return [];
 const style=BATTLE_SMOKE_STYLES[p.frame]||BATTLE_SMOKE_STYLES[0],burst=p.frame===5;
 const asset=burst?'DustImpact':[1,2,4].includes(p.frame)?'DenseSmoke':'ChimneySmoke',baseTint=PARTICLE_VOLUME_ASSETS[asset].albedo;
 const origin=source.firePosition?Position(source.firePosition):p.ignition||Position(source.position);
 const height=Math.max(.4,p.height+source.position.y-origin[1]);
 const drift=Math.hypot(p.driftX||0,p.driftZ||0),yaw=Math.atan2(p.driftX||0,p.driftZ||1e-6);
 const cycle=Math.max(1,p.life),life=burst?cycle*.62:120;
 const bounds=burst?[p.crownWidth,height,p.crownWidth]:[p.crownWidth,height,Math.max(p.baseWidth*2,drift+p.crownWidth*.5)];
 return [{name:'Plume/'+p.seed,preset:burst?'VolumeExplosion':'VolumePlume',position:origin,modules:{
   main:{duration:burst?cycle:120,loop:true,prewarm:burst,startLifetime:life,startSpeed:0,startSize:1,maxParticles:1,simulationSpace:'local',randomSeed:p.seed>>>0,
     startRotation:yaw,startColor:[...style.tint.map((n,i)=>n/baseTint[i]),1]},
   emission:{rateOverTime:0,bursts:[{time:burst?cycle*(1-(p.seed%4096)/4096):0,count:1}]},shape:{enabled:false},
   sizeOverLifetime:{enabled:false},colorOverLifetime:{enabled:false},
   renderer:{mode:'bakedVolume',volumeAsset:asset,bounds,
     // Optical depth is a column property. Compensate the world-space scale so
     // nearby six-metre plumes do not become wisps while huge distant ones seal up.
     density:Math.max(.2,Math.min(32,style.opticalDepth*p.opacity*(asset==='DenseSmoke'?40:160)/height)),volumeSpeed:burst?PARTICLE_VOLUME_ASSETS.DustImpact.duration/life:Math.max(.3,Math.min(2,14/cycle)),
     emissionStrength:0,flameExtinction:0,volumeLoop:!burst,nearFade:0},
 }}];
}

export function StaticSmokeModules(source,wind){
 const height=source.groundHug?Math.max(.8,source.sizeEnd*.65):Math.max(2,Math.min(24,source.life*source.rise*.65));
 const spread=Math.max(.6,source.sizeEnd),drift=Math.hypot(wind.x,wind.z)*source.life;
 return {preset:'VolumePlume',name:'SourceSmoke/'+source.seed,position:Position(source.position),modules:{
   main:{duration:120,loop:true,prewarm:false,startLifetime:120,startSpeed:0,startSize:1,maxParticles:1,simulationSpace:'local',randomSeed:source.seed>>>0,
     startRotation:Math.atan2(wind.x,wind.z||1e-6),startColor:[...source.colorA.map((n,i)=>(n*.3+source.colorB[i]*.7)/[.32,.31,.29][i]),1]},
   renderer:{volumeAsset:source.kind==='black'?'ChimneySmoke':'DenseSmoke',bounds:[spread,height,Math.max(spread,drift+spread*.5)],density:Math.max(.2,Math.min(32,source.opacity*32)),volumeSpeed:Math.max(.35,Math.min(2,5/source.life))},
 }};
}
