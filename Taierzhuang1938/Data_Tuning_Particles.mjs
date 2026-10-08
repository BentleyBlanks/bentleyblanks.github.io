// Shared particle presets and quality budgets. Linear HDR colors, metres, seconds.
export const PARTICLE_LIMITS = Object.freeze({systems:384,curveSamples:48,
  low:{flame:1024,smoke:384,ember:192},medium:{flame:1536,smoke:512,ember:256},
  high:{flame:2048,smoke:768,ember:384},ultra:{flame:2560,smoke:768,ember:512}});
export const BURNING_LIGHT = Object.freeze({count:4,viewDistance:28,intensity:14,radius:9,height:.6,color:0xff852a});
const Range=(min,max)=>({mode:'twoConstants',min,max});
export const PARTICLE_PRESETS = Object.freeze({
  FireRoot: {
    main:{duration:2,prewarm:true,startLifetime:Range(.65,1.1),startSpeed:Range(.1,.35),startSize:Range(.24,.40),maxParticles:48},
    emission:{rateOverTime:8},shape:{type:'circle',radius:.6},
    forceOverLifetime:{enabled:true,y:.35,drag:1.8},
    sizeOverLifetime:{curve:[[0,.4],[.18,1],[.65,.85],[1,.1]]},
    colorOverLifetime:{gradient:[[0,[2.4,.36,.025,0]],[.15,[3.3,.7,.06,.8]],[.55,[2.2,.28,.018,.7]],[1,[.42,.024,.002,0]]]},
    noise:{enabled:true,strength:.05,frequency:2.7,scrollSpeed:2.1},
    renderer:{mode:'flame',aspect:1.4,softRange:.16},
  },
  FireTongue: {
    main:{duration:2,prewarm:true,startLifetime:Range(.7,1.25),startSpeed:Range(.7,1.4),startSize:Range(.2,.36),maxParticles:64},
    emission:{rateOverTime:14},shape:{type:'cone',radius:.45,angle:10},
    forceOverLifetime:{enabled:true,y:1.8,drag:.8},
    sizeOverLifetime:{curve:[[0,.4],[.22,1],[.5,.85],[.8,.38],[1,0]]},
    colorOverLifetime:{gradient:[[0,[3.8,1.25,.17,0]],[.12,[4.4,1.38,.18,.78]],[.42,[2.7,.53,.038,.85]],[.72,[.7,.075,.004,.48]],[1,[.18,.02,.003,0]]]},
    noise:{enabled:true,strength:[[0,.03],[1,.24]],frequency:2.4,scrollSpeed:1.7},
    renderer:{mode:'flame',aspect:2.6,softRange:.25},
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
    noise:{enabled:true,strength:[[0,.06],[1,.6]],frequency:1.3,scrollSpeed:.75},renderer:{mode:'smoke',aspect:1.15,softRange:.7},
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
