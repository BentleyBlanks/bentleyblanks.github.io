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
const Range=(min,max)=>({mode:'twoConstants',min,max});
export const PARTICLE_PRESETS = Object.freeze({
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
  FireRoot: {
    main:{duration:2,prewarm:true,startLifetime:Range(.65,1.1),startSpeed:Range(.1,.35),startSize:Range(.28,.45),maxParticles:48},
    emission:{rateOverTime:8},shape:{type:'circle',radius:.6},
    forceOverLifetime:{enabled:true,y:.35,drag:1.8},
    sizeOverLifetime:{curve:[[0,.4],[.18,1],[.65,.85],[1,.1]]},
    colorOverLifetime:{gradient:[[0,[2.4,.36,.025,0]],[.15,[3.3,.7,.06,.8]],[.55,[2.2,.28,.018,.7]],[1,[.42,.024,.002,0]]]},
    noise:{enabled:true,strength:.05,frequency:2.7,scrollSpeed:2.1},
    renderer:{mode:'flame',aspect:.9,softRange:.16},
  },
  FireTongue: {
    main:{duration:2,prewarm:true,startLifetime:Range(.65,1.15),startSpeed:Range(.8,1.4),startSize:Range(.16,.29),maxParticles:64},
    emission:{rateOverTime:14},shape:{type:'cone',radius:.45,angle:10},
    forceOverLifetime:{enabled:true,y:1.8,drag:.8},
    sizeOverLifetime:{curve:[[0,.4],[.22,1],[.5,.85],[.8,.38],[1,0]]},
    colorOverLifetime:{gradient:[[0,[3.5,1.6,.45,0]],[.12,[4.2,2,.6,.72]],[.42,[2.7,.68,.075,.65]],[.72,[.48,.12,.015,0]],[1,[.18,.035,.004,0]]]},
    noise:{enabled:true,strength:[[0,.015],[.4,.1],[1,.35]],frequency:2.4,scrollSpeed:1.7},
    renderer:{mode:'flame',aspect:2.8,softRange:.25},
  },
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
  return ['FireRoot','FireTongue','FireEmber'].map((preset,index)=>{
    const modules=JSON.parse(JSON.stringify(PARTICLE_PRESETS[preset]));
    modules.main.randomSeed=((source.backdrop?.seed??source.seed??1938)+index*7919)>>>0;
    modules.main.startSize.min*=size;modules.main.startSize.max*=size;
    modules.main.startSpeed.min*=Math.sqrt(size);modules.main.startSpeed.max*=Math.sqrt(size);
    modules.emission.rateOverTime*=scale*Math.min(1.8,Math.sqrt(size));
    modules.shape.radius=radius*(index===0?.78:.55);
    if(source.fireShape==='ground'&&index===1){
      modules.renderer.aspect=1.5;
      modules.main.startSpeed.min*=.5;modules.main.startSpeed.max*=.5;
      modules.forceOverLifetime.y*=.4;
    }
    return {preset,modules};
  });
}
