import { BEISHAHE_SIGNALS, BEISHAHE_SURFACES } from "./Data_LevelFlowBeishahe.mjs";
import { Clamp, Distance, Lerp, SampleBeatRoute, SampleRoute } from "./Script_LevelFlowGeometry.mjs";

function Actor(id, name, side, kind, p, pose = "stand", extra = {}) {
  return {id, name, side, kind, p:[...p], pose, ...extra};
}

function Track(keys, time, timeline) {
  const points = keys.map(([id, fraction, x, z]) => {
    const beat = timeline.find(entry => entry.id === id);
    return [beat.start + beat.duration * fraction, x, z];
  });
  for (let index = 1; index < points.length; index++) {
    if (time > points[index][0]) continue;
    const a = points[index - 1], b = points[index];
    const fraction = Clamp((time - a[0]) / Math.max(0.001, b[0] - a[0]), 0, 1);
    return [Lerp(a[1], b[1], fraction), Lerp(a[2], b[2], fraction)];
  }
  return points.at(-1).slice(1);
}

function PlayerAt(time, timeline) {
  const beat = timeline.find(entry => time < entry.end) ?? timeline.at(-1);
  return SampleBeatRoute(beat, Clamp((time - beat.start) / beat.duration, 0, 1));
}

const leaderKeys = [
  ["11e",0,99,995],["11e",0.3,99,1005],["11e",0.7,105,1008],["11e",1,118,1008],
  ["14a",0,118,1008],["14a",0.15,105,1008],["14a",0.3,102.7,1016],
  ["14a",0.6,114,1050],["14a",1,140,1090],
  ["14b",0.3,170,1130],["14b",0.5,146,1137],["14b",1,121,1143],
  ["16a",0,121,1143],["16a",0.3,121,1172.5],["16a",0.6,121,1194],["16a",1,108,1194],
  ["16b",1,108,1194],["16c",0.4,121,1194],["16c",1,121,1205],
  ["18a",0,121,1205],["18a",0.2,114,1220],["18a",0.3,100,1228],
  ["18a",0.5,60,1240],["18a",0.7,20,1250],["18a",0.8,-20,1257],["18a",1,-68,1272],
  ["18c",0,-68,1272],["18c",0.6,-76,1275],["18d",0,-80,1276],
  ["18d",1,-80,1298],["18e",0.3,-80,1302],["18e",0.55,-80,1302],
  ["18e",0.85,-80,1324],["18e",1,-87,1328],
];

export function BeishaheSignals(time, timeline) {
  return BEISHAHE_SIGNALS.filter(signal => {
    const beat = timeline.find(entry => entry.id === signal.beat);
    return time >= beat.start + beat.duration * signal.fraction;
  }).map(signal => signal.id);
}

export function BeishaheSurfaceAt(point, signals = []) {
  const Inside = bounds => point[0]>=bounds[0] && point[0]<=bounds[1] && point[1]>=bounds[2] && point[1]<=bounds[3];
  const surface = BEISHAHE_SURFACES.find(entry => Inside(entry.bounds)
    && !(signals.includes(entry.hideOn) && Inside(entry.brokenBounds || entry.bounds)));
  return surface?.y ?? null;
}

// Every position is sampled from the absolute director time. Seeking backwards
// restores survivors, bridge boards, vehicles and rescued children consistently.
export function BeishaheActors(beat, time, player, progress, timeline) {
  const Beat = id => timeline.find(entry => entry.id === id);
  const At = (id, fraction = 0) => Beat(id).start + Beat(id).duration * fraction;
  const Follow = delay => PlayerAt(Math.max(At("11a"), time - delay), timeline);
  const actors = [Actor("player", "顺子", "player", "person", player, beat.cover ? "kneel" : beat.pose,{lookAt:beat.lookAt})];
  const cartTime = Math.min(time + 1.5, At("11f", 1));
  let cart = PlayerAt(cartTime, timeline);
  if(beat.id === "11f") cart = SampleRoute([[102.7,1016],[114,1050],[140,1090],[170,1130],[146,1137],[121,1143],[122.3,1169]],progress);
  if (time >= At("11f", 1)) cart = [122.3,1169];
  if (beat.id === "11e") cart = SampleRoute([[99,995],[99,1001],[99,1006],[102.7,1016]], Clamp((progress - 0.35) / 0.65,0,1));
  const nextCart = time < At("11f",1) ? PlayerAt(Math.min(cartTime + 0.1, At("11f",1)),timeline) : cart;
  const heading = Distance(cart,nextCart) > 0.01 ? Math.atan2(nextCart[0] - cart[0], -(nextCart[1] - cart[1])) : Math.PI;
  const burned = time >= At("14b",0.8);
  if (!burned) {
    actors.push(Actor("cart","老耿的车","civilian","cart",cart,"stand",{heading}));
    const donkey = beat.id === "11e" && progress < 0.35 ? [99,995]
      : [cart[0] + Math.sin(heading) * 2.3, cart[1] - Math.cos(heading) * 2.3];
    actors.push(Actor("donkey","黑子","civilian","donkey",donkey,beat.id === "11e" && progress < 0.35 ? "stand" : "walk",{heading}));
  }

  let winter = cart, winterExtra = {parentId:"cart",elevation:1.05,heading};
  if (time >= At("12a") && time < At("12e",0.7)) {
    winter = Track([["12a",0,122.3,1169],["12a",0.2,114,1172.5],["12a",0.5,108,1172.5],["12a",1,101,1165],
      ["12d",1,101,1165],["12e",0.2,108,1172.5],["12e",0.5,121,1172.5],["12e",0.7,122.3,1169]],time,timeline);
    winterExtra = {};
  }
  if (burned) {winter = [122.3,1169];winterExtra = {};}
  if (time >= At("14c")) {
    winter = beat.id === "14c" ? SampleRoute([[122.3,1169],[121,1172.5],[121,1194],[108,1194],[100,1189.6]],Clamp((progress-0.16)/0.84,0,1)) : [100,1189.6];
    winterExtra = {};
  }
  if (time >= At("16c")) {
    winter = [player[0],player[1] + 1.5];
    winterExtra = {carried:true,elevation:0.75,status:"顺子与文财抬行，仍然活着"};
    if (["17b","17d"].includes(beat.id)) Object.assign(winterExtra,{carried:false,elevation:0,status:"放下担架，等火力被压住"});
    if (time >= At("18a",1) && time < At("18g")) {winter = [-90,1331];winterExtra = {status:"冬瓜在南堤后，活着等待回城"};}
  }
  actors.push(Actor("winter","冬瓜","friend","quilt",winter,"wounded",winterExtra));
  const carrying = time >= At("16c") && (beat.pose === "carry" || beat.id === "18g");
  let leader = time < At("11e") ? Follow(3) : Track(leaderKeys,time,timeline);
  if (beat.id === "18g") leader = Follow(3);
  const leaderMoving=time>=At("11e") && Distance(leader,Track(leaderKeys,time+0.05,timeline))>0.01;
  for (const [index,id,name] of [[0,"luo","罗班长"],[1,"he","何有田"],[2,"yao","幺娃"]]) {
    const onBridge=leader[0]>=-82&&leader[0]<=-78&&leader[1]>=1275&&leader[1]<=1325;
    let p = leaderMoving||onBridge ? Track(leaderKeys,time-index*0.6,timeline)
      : [leader[0] + index * 0.8,leader[1] - index * 1.2];
    if(beat.id==="18g") p=Follow(3+index*0.6);
    if (beat.id === "15a" || beat.id === "15b" || beat.id === "15c") {
      if (id !== "yao") {p = id === "luo" ? [121,1143] : [124,1143];}
      else p = [101.1,1189.9];
    }
    const firing = ["13","17"].includes(beat.stage) || ["18a","18b"].includes(beat.id);
    const stuck = id === "yao" && beat.id === "18e" && progress >= 0.3 && progress < 0.55;
    actors.push(Actor(id,name,"friend","person",p,stuck ? "down" : firing ? "shoot" : "stand",
      {heavy:id === "yao",firing,status:stuck ? "脚卡枕木缝，班长回头拽" : firing ? "殿后掩护" : "随队行动"}));
  }
  const liu = carrying ? [winter[0],winter[1] + 1.4]
    : time >= At("12a") && time < At("12f") ? [player[0] + 0.8,player[1] + 1]
    : beat.stage === "15" || ["16a","16b"].includes(beat.id) ? [101,1190.4]
    : time >= At("18b") && time < At("18g") ? [-88.5,1328] : Follow(1.5);
  actors.push(Actor("liu","刘文财","friend","person",liu,carrying ? "carry" : beat.cover ? "shoot" : "walk",{firing:beat.cover === true}));

  const shelterRoute = [[122,1169],[121,1172.5],[121,1194],[108,1194],[100,1189.6]];
  for (const [index,id,name,kind] of [[0,"geng","老耿","person"],[1,"nier","妮儿","child"]]) {
    let p = time < At("12a") ? Follow(index ? 1 : 2) : [122 + index,1171 + index];
    if (beat.id === "11e" && id === "nier") p = [cart[0],cart[1] + 2.4];
    if (time >= At("14b",0.5)) p = SampleRoute(shelterRoute,Clamp((time - At("14b",0.5)) / (At("14c",1) - At("14b",0.5)),0,1));
    if (time >= At("14c",1)) p = [99.2 + index * 1.4,1190.5];
    if (time >= At("16c")) p = Follow(3 + index * 1.5);
    if (time >= At("18a",1) && time < At("18g")) p = [-93 + index * 2,1331];
    actors.push(Actor(id,name,"civilian",kind,p,beat.stage === "15" ? "kneel" : "walk"));
  }

  if (time >= At("12a")) {
    let tian = time < At("14b") ? [113,1169.6]
      : SampleRoute([[113,1169.6],[114,1172.5],[121,1172.5],[121,1194],[108,1194],[101,1189.6]],Clamp((time-At("14b"))/(At("14c",1)-At("14b")),0,1));
    if (time >= At("16c")) tian = Follow(5);
    if (time >= At("18a",1) && time < At("18g")) tian = [-94,1332];
    actors.push(Actor("tian","田嫂","civilian","person",tian,beat.stage === "15" ? "kneel" : "stand"));
    let girl = time < At("14b") ? [100,1188.4] : [101,1168];
    if (beat.id === "14d" && progress >= 0.5) girl = [player[0] + 0.3,player[1]];
    if (time >= At("14d",1)) girl = [100.7,1190.1];
    if (time >= At("16c")) girl = tian;
    actors.push(Actor("erya","二丫","civilian","child",girl,time >= At("16c") ? "carry" : "kneel",
      {elevation:time >= At("16c") ? 0.8 : 0}));
    const medicDead = time >= At("14e",0.55);
    let medic = time < At("12c") ? [102,1165] : [103,1169];
    if (beat.id === "14c") medic = [player[0] + 0.6,player[1] + 1];
    if (time >= At("14c",1)) medic = beat.id === "14d" && progress<0.5 ? [...player] : [103,1169];
    actors.push(Actor("medic","军医","friend","person",medic,medicDead ? "dead" : "kneel",{status:medicDead ? "在院心施救时被扫倒" : "给伤号止血"}));
    actors.push(Actor("orderly","后送卫生兵","friend","person",[104,1167],"kneel"));
    if (time < At("14a")) actors.push(Actor("batman","营部勤务兵","friend","person",[123.5,1172.5],beat.id === "12d" ? "melee" : "stand"));
    for (let index = 0; index < 18; index++) {
      const p = [93.3 + index % 4 * 3.3,1158.5 + Math.floor(index / 4) * 2.9];
      actors.push(Actor(`aidPatient${index}`,`救护所伤号 ${index + 1}`,"friend","quilt",p,index === 15 && medicDead ? "dead" : "wounded"));
    }
  }
  const nearHole = ["15","16"].includes(beat.stage);
  const commanderPosition = nearHole ? [105.5,1192] : [104,1008];
  if (time < At("14a") || nearHole) {
    actors.push(Actor("sentry","二营哨兵","friend","person",[101.8,1005.6],"stand"));
    actors.push(Actor("battalion","二营连长","friend","person",commanderPosition,"stand"));
  }
  if (beat.stage === "11") {
    for (let index = 0; index < 9; index++) {
      const p = Follow(5 + index * 2);
      actors.push(Actor(`roadEvacuee${index}`,index % 3 === 0 ? "拄枪撤下来的伤兵" : "后送队老乡","civilian",index % 4 === 0 ? "quilt" : "person",[p[0] + (index % 3 - 1) * 1.2,p[1]],"walk"));
    }
  }
  if (["13a","13b","13c","13d"].includes(beat.id)) {
    for (let index = 0; index < 7; index++) {
      const start = At("13b") + index * 3;
      const p = SampleRoute([[106 + index,965 - index * 2],[99,989],[99,1001],[99,1006],[103,1016]],Clamp((time - start) / 28,0,1));
      const fallen = index === 1 && time >= start + 7;
      actors.push(Actor(`ditchEvacuee${index}`,`过板桥的撤退者 ${index + 1}`,index % 2 ? "friend" : "civilian","person",
        fallen ? SampleRoute([[107,963],[99,989],[99,1001],[99,1006],[103,1016]],0.25) : p,fallen ? "dead" : "run"));
    }
  }
  if (time < At("14a")) {
    const tank = Track([["11a",0,85,671],["11b",0.1,85,671],["11b",0.25,96,671],["11b",0.4,96,682],["11b",0.65,92,700],["11c",0,95,740],
      ["11c",1,97,820],["12b",0,93,900],["13b",1,99,986],["13c",0.5,99,996],
      ["13c",0.65,99,997],["13c",0.8,99,994],["13f",1,99,994]],time,timeline);
    actors.push(Actor("tank3","九四式 · 沟北追车","enemy","tank",tank,"stand",
      {surface:"ground",heading:Math.PI,turret:Math.PI,status:beat.stage === "13" ? "探沟后退，沟北扫射" : "远处走走停停"}));
  }
  if (beat.stage === "18") {
    actors.push(Actor("officer","三营军官","friend","person",[-88,1330],"kneel"));
    actors.push(Actor("engineer","工兵","friend","person",[-83,1325],time < At("18f",0.6) ? "kneel" : "run"));
  }
  return actors;
}

export function ApplyBeishaheSurfaces(actors,time,timeline) {
  const signals = BeishaheSignals(time,timeline);
  for(const actor of actors) {
    const surface = BeishaheSurfaceAt(actor.p,signals);
    if(surface!==null) actor.surfaceY=surface;
    if(signals.includes("BridgeBlown") && actor.side==="enemy" && actor.p[0]>-82 && actor.p[0]<-78 && actor.p[1]>1278 && actor.p[1]<1300) actor.pose="dead";
  }
}

export function BeishaheEffects(beat, time, progress, actors, timeline) {
  if (Number(beat.stage) < 11) return [];
  const effects = [];
  const Beat = id => timeline.find(entry => entry.id === id);
  if (beat.stage === "13" || ["17b","17d","18c","18d","18e","18f"].includes(beat.id)) {
    const enemies = actors.filter(actor => actor.side === "enemy" && actor.pose !== "dead");
    for (const id of ["player","liu","luo","he","yao"]) {
      const actor = actors.find(entry => entry.id === id);
      const target = enemies.find(enemy => enemy.kind !== "tank");
      if (actor && target && (beat.cover || actor.firing)) effects.push({kind:"fire",a:actor.p,b:target.p,side:actor.side,sourceId:actor.id,targetId:target.id,phase:(time * 3 + id.length) % 1});
    }
  }
  if (beat.stage === "13") {
    const mortar = actors.find(actor => actor.groupId === "BeishaheMortar" && actor.pose !== "dead");
    if (mortar) effects.push({kind:"grenade",a:mortar.p,b:[118 + Math.sin(Math.floor(time / 12)) * 6,1008],phase:(time % 12) / 12,side:"enemy"});
    const tank = actors.find(actor => actor.id === "tank3");
    if (tank && beat.id >= "13c") effects.push({kind:"fire",a:tank.p,b:[118,1008],side:"enemy",heavy:true,phase:time * 6 % 1});
  }
  if (beat.stage === "14") {
    const cycle = (time - Beat("14a").start) % 18;
    const target = beat.id === "14a" ? [118,1008] : [103,1170];
    for (let index = 0; index < 3; index++) effects.push({kind:"plane",p:[target[0] + 180 - cycle * 20,target[1] + index * 13],elevation:45 + index * 6});
    if (cycle > 5 && cycle < 12) {
      const impact = [target[0] + 24 - (cycle - 5) * 7,target[1]];
      effects.push({kind:"blast",p:impact,age:cycle % 0.6});
    }
  }
  if (beat.id === "13e" && progress >= 0.15 && progress < 0.35) effects.push({kind:"blast",p:[257,1228],age:(progress - 0.15) * beat.duration});
  if (beat.id === "18f" && progress >= 0.6) for (const z of [1283.5,1294.5]) effects.push({kind:"blast",p:[-80,z],age:(progress - 0.6) * beat.duration});
  return effects;
}
