// Shared particle presets and quality budgets. Linear HDR colors, metres, seconds.
export const PARTICLE_LIMITS = Object.freeze({systems:384,curveSamples:48,
  low:{flame:1024,smoke:384,ember:192,mote:192,windowMote:512,volume:1152},medium:{flame:1536,smoke:512,ember:256,mote:384,windowMote:512,volume:1536},
  high:{flame:2048,smoke:768,ember:384,mote:640,windowMote:512,volume:2048},ultra:{flame:2560,smoke:768,ember:512,mote:800,windowMote:512,volume:2560}});
export const BURNING_LIGHT = Object.freeze({count:4,viewDistance:28,intensity:14,radius:9,height:.6,color:0xff852a});
export const PARTICLE_VOLUME = Object.freeze({steps:{low:4,medium:6,high:8,ultra:10},extinction:2.8,shadow:2.4,sourceFadeSeconds:.16});
export const PARTICLE_MESH = Object.freeze({casingCapacity:64,casingSides:8,casingLife:[2.4,4],metalness:.72,roughness:.3});
// Visual envelopes, independent of damage radius. Fragmentation blasts have a
// short hot core; burning fuel in a disabled tank sustains the luminous phase.
export const EXPLOSION_PARTICLE_ART = Object.freeze({
  grenade:{spriteScale:.30,spriteLife:.28,glowLife:.12,glowScale:.30,opacity:.68,lightSeconds:.18,smokeOpacity:.66},
  launcher:{spriteScale:.28,spriteLife:.30,glowLife:.14,glowScale:.30,opacity:.68,lightSeconds:.20,smokeOpacity:.68},
  shell:{spriteScale:.32,spriteLife:.38,glowLife:.17,glowScale:.34,opacity:.72,lightSeconds:.24,smokeOpacity:.7},
  tank:{spriteScale:.65,spriteLife:.85,glowLife:.42,glowScale:.56,opacity:.8,lightSeconds:.55,smokeOpacity:.7},
  bomb:{spriteScale:.38,spriteLife:.42,glowLife:.20,glowScale:.38,opacity:.72,lightSeconds:.30,smokeOpacity:.7},
});
export const EXPLOSION_VOLUME_ART=Object.freeze({
 grenade:{asset:'DustImpact',scale:.55,life:3.8,speed:1.8,density:9,emission:0,flameExtinction:0},
 launcher:{asset:'DustImpact',scale:.6,life:4.2,speed:1.65,density:10,emission:0,flameExtinction:0},
 shell:{asset:'DustImpact',scale:.65,life:4.7,speed:1.5,density:11,emission:0,flameExtinction:0},
 tank:{scale:.72,life:7.5,speed:.92,density:5.5,emission:35,flameExtinction:6},
 bomb:{asset:'DustImpact',scale:.7,life:5,speed:1.4,density:12,emission:0,flameExtinction:0},
});
const Range=(min,max)=>({mode:'twoConstants',min,max});
const PhysicalFire={main:{duration:120,startLifetime:120,startSpeed:0,startSize:1,maxParticles:1,simulationSpace:'local'},emission:{rateOverTime:0,bursts:[{time:0,count:1}]},shape:{enabled:false},
  sizeOverLifetime:{enabled:false},colorOverLifetime:{enabled:false},renderer:{mode:'bakedVolume',volumeAsset:'Campfire',bounds:[1.9,2.2,2.05],density:.12,emissionStrength:60,flameExtinction:8,volumeLoop:true}};
export const PARTICLE_PRESETS = Object.freeze({
  VolumeFire:PhysicalFire,
  VolumePlume:{main:{duration:120,startLifetime:120,startSpeed:0,startSize:1,maxParticles:1},emission:{rateOverTime:0,bursts:[{time:0,count:1}]},shape:{enabled:false},
    sizeOverLifetime:{enabled:false},colorOverLifetime:{enabled:false},renderer:{mode:'bakedVolume',volumeAsset:'ChimneySmoke',bounds:[3,6,8.55],density:12,emissionStrength:0,flameExtinction:0,volumeLoop:true}},
  VolumeDensePlume:{main:{duration:120,startLifetime:120,startSpeed:0,startSize:1,maxParticles:1},emission:{rateOverTime:0,bursts:[{time:0,count:1}]},shape:{enabled:false},
    sizeOverLifetime:{enabled:false},colorOverLifetime:{enabled:false},renderer:{mode:'bakedVolume',volumeAsset:'DenseSmoke',bounds:[6,7,8],density:5,emissionStrength:0,flameExtinction:0,volumeLoop:true}},
  VolumeDustImpact:{main:{duration:7,loop:false,startLifetime:7,startSpeed:0,startSize:1,maxParticles:1},emission:{rateOverTime:0,bursts:[{time:0,count:1}]},shape:{enabled:false},
    sizeOverLifetime:{enabled:false},colorOverLifetime:{enabled:false},renderer:{mode:'bakedVolume',volumeAsset:'DustImpact',bounds:[10,4.5,13],density:9,emissionStrength:0,flameExtinction:0,volumeLoop:false}},
  VolumeExplosion:{main:{duration:7,loop:false,startLifetime:7,startSpeed:0,startSize:1,maxParticles:1},emission:{rateOverTime:0,bursts:[{time:0,count:1}]},shape:{enabled:false},
    sizeOverLifetime:{enabled:false},colorOverLifetime:{enabled:false},renderer:{mode:'bakedVolume',volumeAsset:'GroundExplosion',bounds:[7,9,7],density:3,emissionStrength:10,flameExtinction:5,volumeLoop:false}},
  SootRoot:{main:{duration:4.8,prewarm:true,startLifetime:4.8,startSpeed:0,startSize:.7,startColor:[.07,.065,.06,.7],maxParticles:16},emission:{rateOverTime:2},
    velocityOverLifetime:{enabled:true,y:.6},renderer:{mode:'volume',aspect:1.35,softRange:.35,density:8}},
  WindowDust:{main:{duration:120,prewarm:true,startLifetime:120,startSpeed:0,startSize:Range(.00175,.0035),maxParticles:512},emission:{rateOverTime:4},shape:{type:'beam',box:[.75,1.9,3.25],direction:[.8,-1.25,1.6]},
    sizeOverLifetime:{enabled:false},colorOverLifetime:{gradient:[[0,[1,1,1,0]],[.02,[1,1,1,1]],[.96,[1,1,1,1]],[1,[1,1,1,0]]]},noise:{enabled:true,strength:.035,frequency:1,scrollSpeed:.27},renderer:{mode:'windowMote',aspect:1,softRange:0}},
  BattleSmoke:{main:{duration:10,prewarm:true,startLifetime:10,startSpeed:0,startSize:2,maxParticles:32},emission:{rateOverTime:1.4},
    velocityOverLifetime:{enabled:true,y:1},shape:{type:'circle',radius:.4},sizeOverLifetime:{curve:[[0,.2],[.7,1],[1,.9]]},
    colorOverLifetime:{gradient:[[0,[.12,.11,.09,0]],[.1,[.12,.11,.09,.7]],[.7,[.22,.21,.19,.7]],[1,[.3,.29,.27,0]]]},
    renderer:{mode:'volume',aspect:1.1,softRange:.7,density:8,nearFade:1.5}},
  DustMote:{
    main:{duration:30,prewarm:true,startLifetime:30,startSpeed:Range(.005,.025),startSize:Range(.003,.011),startColor:[.65,.56,.4,.22],maxParticles:512},
    emission:{rateOverTime:12},shape:{type:'box',box:[30,9,30]},
    sizeOverLifetime:{enabled:false},colorOverLifetime:{gradient:[[0,[1,1,1,0]],[.08,[1,1,1,1]],[.85,[1,1,1,1]],[1,[1,1,1,0]]]},
    noise:{enabled:true,strength:.2,frequency:.8,scrollSpeed:.35},renderer:{mode:'mote',aspect:1,softRange:.08,bounds:[30,9,30]},
  },
  FireRoot:{...PhysicalFire,renderer:{...PhysicalFire.renderer,bounds:[1.6,.8,1.6]}},
  FireTongue:PhysicalFire,
  FireEmber: {
    main:{duration:3,prewarm:true,startLifetime:Range(1.4,2.8),startSpeed:Range(.8,2.5),startSize:Range(.009,.023),maxParticles:24},
    emission:{rateOverTime:1.8},shape:{type:'cone',radius:.5,angle:23},
    forceOverLifetime:{enabled:true,y:.65,drag:.4},
    sizeOverLifetime:{curve:[[0,.8],[.2,1],[1,.2]]},
    colorOverLifetime:{gradient:[[0,[4.8,1.5,.18,0]],[.08,[4.8,1.5,.18,1]],[.5,[2.8,.45,.025,.85]],[1,[.35,.025,.001,0]]]},
    noise:{enabled:true,strength:.15,frequency:1.8,scrollSpeed:1.2},renderer:{mode:'ember',aspect:2,softRange:.12},
  },
  FireSmoke: {
    main:{duration:4,prewarm:true,startLifetime:Range(2.5,3.8),startSpeed:Range(.65,1.2),startSize:Range(.35,.55),startRotation:Range(-3.14,3.14),maxParticles:40},
    emission:{rateOverTime:4},shape:{type:'cone',radius:.4,angle:15},
    forceOverLifetime:{enabled:true,y:.55,drag:.55},
    sizeOverLifetime:{curve:[[0,.4],[.25,1],[.7,2.5],[1,3.8]]},
    colorOverLifetime:{gradient:[[0,[.13,.085,.045,0]],[.18,[.065,.060,.055,.38]],[.55,[.15,.14,.125,.3]],[1,[.3,.29,.27,0]]]},
    rotationOverLifetime:{enabled:true,angularVelocity:.22},
    noise:{enabled:true,strength:[[0,.06],[1,.6]],frequency:1.3,scrollSpeed:.75},renderer:{mode:'volume',aspect:1.15,softRange:.7,density:4},
  },
});
export function BurningParticleModules(source, scale=1) {
  const size=Math.max(.2,Math.min(3,source.fire??1)),radius=Math.max(.1,source.radius??.6);
  return ['FireTongue','FireEmber'].map((preset,index)=>{
    const modules=JSON.parse(JSON.stringify(PARTICLE_PRESETS[preset]));
    modules.main.randomSeed=((source.backdrop?.seed??source.seed??1938)+index*7919)>>>0;
    if(preset==='FireTongue'){
      const width=Math.max(.35,radius*2.05),height=(source.fireShape==='ground'?1.35:2.15)*Math.sqrt(size);
      modules.renderer.bounds=[width,height,width*.95];modules.main.startRotation=(modules.main.randomSeed%360)*Math.PI/180;
      return {preset,modules};
    }
    modules.main.startSize.min*=size;modules.main.startSize.max*=size;
    modules.main.startSpeed.min*=Math.sqrt(size);modules.main.startSpeed.max*=Math.sqrt(size);
    modules.emission.rateOverTime*=scale*Math.min(1.8,Math.sqrt(size));
    modules.shape.radius=radius*(index===0?.78:.55);
    return {preset,modules};
  });
}
