import { FLOW_BEATS, FLOW_STAGES, FLOW_WAVES } from "./Data_LevelFlow.mjs";

export const Clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const Lerp = (a, b, amount) => a + (b - a) * amount;
export const Distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const Smooth = (value) => { const t = Clamp(value, 0, 1); return t * t * (3 - 2 * t); };

let elapsed = 0;
export const FLOW_TIMELINE = FLOW_BEATS.map((beat) => {
  const entry = { ...beat, start: elapsed, end: elapsed + beat.duration };
  elapsed = entry.end;
  return entry;
});
export const FLOW_DURATION = elapsed;
export const BeatById = (id) => FLOW_TIMELINE.find((beat) => beat.id === id);
export const STAGE_TIMELINE = FLOW_STAGES.map((stage) => {
  const beats = FLOW_TIMELINE.filter((beat) => beat.stage === stage.id);
  return { ...stage, start: beats[0].start, end: beats.at(-1).end, beats };
});

export function SampleRoute(points, progress) {
  if (points.length === 1) return [...points[0]];
  const lengths = points.slice(1).map((point, index) => Distance(points[index], point));
  let remaining = Clamp(progress, 0, 1) * lengths.reduce((sum, length) => sum + length, 0);
  for (let index = 0; index < lengths.length; index++) {
    if (remaining <= lengths[index] || index === lengths.length - 1) {
      const t = lengths[index] ? Clamp(remaining / lengths[index], 0, 1) : 0;
      return points[index].map((coordinate, axis) => Lerp(coordinate, points[index + 1][axis], t));
    }
    remaining -= lengths[index];
  }
  return [...points.at(-1)];
}

function Track(points, time) {
  if (time <= points[0][0]) return points[0].slice(1);
  for (let index = 1; index < points.length; index++) {
    if (time > points[index][0]) continue;
    const a = points[index - 1], b = points[index];
    const progress = Clamp((time - a[0]) / Math.max(0.001, b[0] - a[0]), 0, 1);
    return [Lerp(a[1], b[1], progress), Lerp(a[2], b[2], progress)];
  }
  return points.at(-1).slice(1);
}

// Each authored path is expanded to absolute keys once. Seeking never replays
// spawn events or mutates state, so backward seeks produce the same frame.
function Keys(entries) {
  return entries.map(([id, fraction, x, z]) => [BeatById(id).start + BeatById(id).duration * fraction, x, z]);
}

const winterKeys = Keys([
  ["01a",0,67.8,64], ["01e",1,62,64], ["02a",1,61.8,64], ["02i",1,62.2,64.6],
  ["03a",1,47.2,65.6], ["03b",1,47.2,65.6], ["03c",1,31.2,66.8],
  ["03e",1,31.2,66.8], ["03f",1,24.7,67.2], ["03g",1,24.7,67.2],
  ["03h",0.1,26,75], ["03h",0.25,30,84], ["03h",0.42,32.5,99],
  ["03h",0.62,35,114], ["03h",0.86,35,129], ["03h",1,35,140],
  ["04a",1,48,150], ["04b",1,48,150], ["04c",1,48,150],
  ["04d",1,60,157], ["05a",0.2,72,158.6], ["05a",0.45,83,163],
  ["05a",0.7,83,178], ["05a",1,80,201], ["05b",1,84.5,216], ["05c",1,86.5,227],
  ["06a",1,87,239], ["06b",0.25,87,239], ["06b",1,93.2,243], ["06c",1,93.2,243],
  ["06d",0.25,92,247], ["06d",0.5,87,261], ["06d",0.75,93,277], ["06d",1,97,292],
  ["06h",1,97,292], ["06i",0.6,97.5,300], ["06i",1,96,314],
  ["07a",1,95,328], ["07b",1,97,338], ["07c",1,100,352],
  ["08a",1,115,380], ["09j",1,115,380],
  ["10a",1,109,380], ["10b",1,100,430], ["10c",1,100,462],
  ["10d",0.25,111,465], ["10d",0.6,111,493], ["10d",1,119,505],
  ["10e",1,112,527], ["10f",1,117,545], ["10j",1,117,552],
]);
const cartKeys = Keys([
  ["01a",0,55,155], ["04d",0,55,155], ["04d",1,64,158],
  ["05a",0.3,80,159], ["05a",0.6,83,180], ["05a",1,83,211],
  ["05b",1,87,229], ["05c",1,88,241], ["06a",1,94,274],
  ["06b",1,97,292], ["06h",1,97,292], ["06i",0.6,97.5,300],
  ["06i",1,96,314], ["07a",1,95,328], ["07b",1,97,338], ["07c",1,100,352],
  ["08a",1,115,380], ["09j",1,115,380],
  ["10a",1,109,380], ["10b",1,100,430], ["10c",1,100,462],
  ["10d",0.25,111,465], ["10d",0.6,111,493], ["10d",1,119,505],
  ["10e",1,112,527], ["10f",1,117,545], ["10j",1,117,552],
]);
const tankKeys = Keys([
  ["06a",0,83,182], ["06a",1,84,215], ["06b",1,87,234], ["06c",1,88,244],
  ["06d",1,86,255], ["06e",1,88,265], ["06f",0.7,91,278], ["06i",1,91,278],
]);
const secondTankKeys = Keys([
  ["06a",0,83,170], ["06a",1,82,198], ["06b",1,84,214], ["06c",1,85,224],
  ["06d",1,88,238], ["06e",1,86,251], ["06f",1,86,253], ["06g",1,88,264],
  ["06h",1,88,264], ["06i",1,85,218],
]);

function Actor(id, name, side, kind, p, pose = "stand", extra = {}) {
  return { id, name, side, kind, p, pose, ...extra };
}

let companionTracks = null;

function CoreActors(beat, time, player, progress) {
  const winter = Track(winterKeys, time);
  const cart = Track(cartKeys, time);
  const actors = [Actor("player", "顺子", "player", "person", player, beat.pose)];
  const winterPose = time < BeatById("02b").start ? "kneel" : "wounded";
  actors.push(Actor("winter", "冬瓜", "friend", "quilt", winter, winterPose));
  const atCamp = beat.stage === "04", village = Number(beat.stage) >= 8;
  const offset = (x, z) => [player[0] + x, player[1] + z];
  let luo = offset(-1.4, -2.5), he = offset(1.1, 0), liu = offset(-0.7, -4), yao = offset(-2, 1);
  if (Number(beat.stage) <= 2) {
    luo = Track(Keys([["01a",0,64,64], ["01c",0,64,64], ["01c",1,30,74], ["02a",0,30,74],
      ["02e",1,56,72], ["02f",1,60,65], ["02i",1,61,63]]), time);
    he = [luo[0] - 1, luo[1] + 1.5]; liu = [luo[0] - 2.3, luo[1] + 1];
    yao = Track(Keys([["01a",0,65,65], ["01c",0,65,65], ["01c",0.4,22,67],
      ["01c",0.7,12,44], ["01c",1,0,-7], ["02i",1,0,-7], ["03f",0,0,-7]]),time);
  }
  if (beat.id === "03f") yao = SampleRoute([[0,-7],[0,11],[13,21],[12,44],[22,66]],progress);
  if (beat.stage === "03" && beat.id < "03f") yao = [0,-7];
  if (beat.pose === "drag") he = offset(0,0.95);
  if (beat.id === "03g") { luo = [22,69.5]; yao = [24,73]; }
  if (atCamp) { luo = [57,150]; he = [49,152]; liu = [52,150]; yao = [50,149]; }
  if (beat.stage === "06" && ["06g","06h"].includes(beat.id)) yao = [81,278];
  if (village && beat.stage !== "10") {
    luo = Track(Keys([["08a",0,98,348],["08a",1,102,383],["08e",1,118,388],
      ["08f",1,122,402],["09a",1,125,423],["09b",1,123,438],["09c",1,125,448],
      ["09i",1,123,452],["09j",1,116,465]]),time);
    he=[luo[0]+1,luo[1]+1.2];
    yao=time<BeatById("08a").end?offset(-2,1):[100,384];
  }
  actors.push(Actor("luo", "罗班长", "friend", "person", luo, beat.id === "03g" ? "shoot" : "stand"));
  actors.push(Actor("he", "何有田", "friend", "person", he, beat.pose === "drag" ? "drag" : "stand"));
  actors.push(Actor("liu", "刘文财", "friend", "person", liu, beat.stage === "03" ? "shoot" : "stand"));
  actors.push(Actor("yao", "幺娃", "friend", "person", yao, ["06g","06h"].includes(beat.id) ? "shoot" : "stand"));
  if (Number(beat.stage) >= 4) {
    actors.push(Actor("cart", "老耿的车", "civilian", "cart", cart, "stand"));
    actors.push(Actor("geng", "老耿", "civilian", "person", [cart[0]-1.7,cart[1]], "stand"));
    let nier = [cart[0]+1.2,cart[1]+2.2];
    if(beat.id === "08g") nier=SampleRoute([[115,380],[99,380],[80,382],[80,392]],progress);
    if(beat.stage === "09") nier=offset(-0.8,1.2);
    if(beat.id === "09h") nier=SampleRoute([[90,486],[93,487],[94,485]],progress);
    if(beat.stage === "10" && time < BeatById("10d").end) nier=Track(Keys([["10a",0,101,478],["10b",1,108,483],["10c",1,109,465],["10d",1,119,505]]),time);
    actors.push(Actor("nier", "妮儿", "civilian", "child", nier, "stand"));
  }
  if (Number(beat.stage) >= 6) {
    const burned = time >= BeatById("06h").start + BeatById("06h").duration * 0.8;
    const tankPosition=Track(tankKeys,time);
    const turretTarget=["06g","06h"].includes(beat.id)?yao:player;
    const turret=Math.atan2(turretTarget[0]-tankPosition[0],-(turretTarget[1]-tankPosition[1]))+Math.sin(time*0.8)*0.15;
    actors.push(Actor("tank1", "九四式 · 头车", "enemy", "tank", tankPosition, burned ? "burn" : "stand",
      { heading: Math.PI, turret, disabled: time >= BeatById("06g").start }));
    if (time < BeatById("07a").start) actors.push(Actor("tank2", "九四式 · 后车", "enemy", "tank", Track(secondTankKeys,time), "stand", { heading: time >= BeatById("06i").start ? 0 : Math.PI, turret: Math.PI }));
  }
  if (["06a","06b"].includes(beat.id)) {
    const down = beat.id === "06b";
    actors.push(Actor("carrier1", "抬担架的老乡", "civilian", "person", [winter[0],winter[1]-1.7], down ? "dead" : "walk"));
    actors.push(Actor("carrier2", "抬担架的老乡", "civilian", "person", [winter[0],winter[1]+1.7], down ? "dead" : "walk"));
  }
  if (beat.id === "06c") actors.push(Actor("veteran", "抱捆老兵", "friend", "person", SampleRoute([[94,264],[88.5,257]], Math.min(1,progress*2)), progress > 0.5 ? "dead" : "run"));
  if(beat.stage === "08" || beat.stage === "09") {
    const gunners=[[99.5,472],[100.5,472],[100,473.5]];
    if(beat.id !== "09j") {
      for(let index=0;index<gunners.length;index++) actors.push(Actor(`loophole${index}`,"枪眼机枪组","enemy","person",gunners[index],"shoot"));
      for(let index=0;index<3;index++) actors.push(Actor(`rifle${index}`,"北屋守军","enemy","person",[96+index*4,473],"stand"));
      actors.push(Actor("wallGuard","墙角守军","enemy","person",[111,465],"stand"));
      if(time<BeatById("08d").start) actors.push(Actor("messenger","将去喊援的日军","enemy","person",[113,465],"stand"));
    }
    if(time<BeatById("09e").start) {
      for(let index=0;index<5;index++) actors.push(Actor(`yard${index}`,index<3?"院内搜人组":"隔壁搜人组","enemy","person",[index<3?79+index*1.8:65+(index-3)*2,444],"stand"));
    }
    if(beat.id <= "09i") {
      actors.push(Actor("gateGuard","门房守卫","enemy","person",[85,451],beat.id>="09g"?"dead":"stand"));
      actors.push(Actor("kitchenGuard","灶屋守卫","enemy","person",[94,480],"stand"));
    }
  }
  if(beat.stage === "10") {
    if(time<BeatById("10f").start) {
      actors.push(Actor("templeGun","庙后机枪","enemy","person",[206,480],"shoot"));
      actors.push(Actor("mortar","麦秸垛掷弹筒","enemy","person",[199,449],"kneel"));
    }
    for(let index=0;index<12;index++) {
      const cross=BeatById("10a").start+32+index*13.5;
      const p=Track([[cross-110,115,380],[cross-95,100,383],[cross-12,100,458],
        [cross,111,465],[cross+16,111,493],[cross+30,119,505],[cross+55,112,527],[cross+80,117,552]],time);
      actors.push(Actor(`stretcher${index}`,`担架 ${index+1}`,"civilian","quilt",p,"wounded"));
    }
    if(beat.id >= "10h") actors.push(Actor("platoon","负伤排长","friend","person",offset(-1,-3),"drag"));
  }
  if(companionTracks) for(const actor of actors) {
    if(companionTracks[actor.id]) actor.p=Track(companionTracks[actor.id],time);
  }
  return actors;
}

function BuildCompanionTracks() {
  const tracks=Object.fromEntries(["luo","he","liu","yao","nier"].map((id)=>[id,[]]));
  for(const beat of FLOW_TIMELINE) {
    const positions=Object.fromEntries(Object.keys(tracks).map((id)=>[id,[]]));
    for(let index=0;index<=10;index++) {
      const progress=index/10;
      const actors=CoreActors(beat,beat.start+beat.duration*progress,SampleRoute(beat.p,progress),progress);
      for(const id of Object.keys(tracks)) {
        const actor=actors.find((entry)=>entry.id===id);
        if(actor) positions[id].push(actor.p);
      }
    }
    for(const id of Object.keys(tracks)) {
      if(!positions[id].length) continue;
      const previous=tracks[id].at(-1);
      const points=previous?[previous.slice(1),...positions[id]]:positions[id];
      const lengths=points.slice(1).map((point,index)=>Distance(points[index],point));
      const total=lengths.reduce((sum,length)=>sum+length,0);
      const stationary=positions[id].every((point)=>Distance(point,positions[id][0])<0.01);
      const travelDuration=stationary?Math.min(beat.duration,total/1.8):beat.duration;
      if(!previous) tracks[id].push([beat.start,...points[0]]);
      let traveled=0;
      for(let index=1;index<points.length;index++) {
        traveled+=lengths[index-1];
        if(lengths[index-1]>0) tracks[id].push([beat.start+travelDuration*traveled/total,...points[index]]);
      }
      tracks[id].push([beat.end,...points.at(-1)]);
    }
  }
  return tracks;
}

companionTracks=BuildCompanionTracks();

function WaveActors(time,player) {
  const actors = [], spawns = [];
  for (const wave of FLOW_WAVES) {
    const beat = BeatById(wave.beat);
    const end = wave.until ? BeatById(wave.until).end : beat.end;
    if (time < beat.start - 12 || time > end + 8) continue;
    spawns.push({ ...wave, time: beat.start, active: time >= beat.start && time < end });
    for (let index = 0; index < wave.count; index++) {
      const born = beat.start + index * wave.interval;
      if (time < born) continue;
      const fall = wave.cyclic ? born+44 : beat.start + Lerp(wave.lastFall * 0.35, wave.lastFall, (index + 1) / wave.count);
      const routeTime = Math.min(17, Math.max(5, (fall - born) * 0.7));
      const path = wave.route.map((p) => [p[0] + (index % 3 - 1) * 0.65, p[1] - index * 0.6]);
      const p = SampleRoute(path, (Math.min(time, fall) - born) / routeTime);
      if (wave.id.startsWith("Tank")) {
        const tank = Track(tankKeys,Math.min(time,fall));
        p[1] = Math.min(p[1],tank[1]-4-index*0.7);
        p[0] = tank[0]+(index%2 ? -0.8 : 0.8);
      }
      if(!wave.transfer && wave.id !== "GengHouse" && Distance(p,player)<4.2) {
        const length=Math.max(0.01,Distance(wave.source,player));
        p[0]=player[0]+(wave.source[0]-player[0])/length*4.2;
        p[1]=player[1]+(wave.source[1]-player[1])/length*4.2;
      }
      const leaving=wave.transfer || (wave.id === "GengHouse" && index>=4);
      if(leaving && time>=end-1) continue;
      const pose=time>=fall&&!leaving ? "dead" : leaving ? "run" : "shoot";
      actors.push(Actor(`${wave.id}${index}`, `${wave.label} ${index+1}`, "enemy", "person", p, pose,
        { born, fall, target: wave.target, wave: wave.id, elevation:wave.id === "Rim"?1.8:0 }));
    }
  }
  return { actors, spawns };
}

function OpeningActors(beat, time) {
  if (beat.stage !== "02") return [];
  const defeated = time >= BeatById("02g").start;
  return Array.from({ length: 9 }, (_,index) => {
    let p = [[54.5,61.4],[57.5,61.2],[59,65],[59.8,64],[56,65],[51,65.3],[45,66],[42,66],[39,66]][index];
    if (defeated && index >= 6) p = SampleRoute([p,[22,67],[12,44]], (time-BeatById("02h").start)/15);
    return Actor(`opening${index}`, index < 2 ? "北沿机枪组" : index === 4 ? "丙" : "日军", "enemy", "person", p,
      defeated && index < 6 ? "dead" : "stand");
  });
}

function Effects(beat, time, progress, actors) {
  const effects = [], player = actors[0];
  const winter = actors.find((actor) => actor.id === "winter");
  const tank = actors.find((actor) => actor.id === "tank1");
  const AddArc = (a,b,t0,length) => {
    const phase = (time-t0)/length;
    if (phase>=0 && phase<=1) effects.push({ kind: "grenade", a,b, phase });
    if (phase>1 && phase<1.7) effects.push({ kind: "blast", p:b, age:(phase-1)*length });
  };
  if (beat.fx === "rescue") {
    AddArc([51,72],[54.5,61.4],beat.start,2.5);
    AddArc([58,72],[57.5,61.2],beat.start+0.4,2.5);
  }
  if (beat.fx === "returnGrenade") {
    AddArc([21,61],[winter.p[0],winter.p[1]],beat.start,2.2);
    AddArc(winter.p,[21,61],beat.start+4,2.1);
  }
  if (["trackBlast","engineBlast","collapse"].includes(beat.fx)) {
    const age = time - (beat.start + beat.duration * 0.8);
    if (age >= 0 && age < 5) effects.push({ kind: "blast", p: tank?.p ?? player.p, age });
  }
  const targets = actors.filter((actor) => actor.side === "enemy" && actor.pose !== "dead" && actor.kind !== "tank" && actor.pose !== "run");
  if (["shoot","retreat"].includes(beat.pose) && targets.length) {
    const target = targets[Math.floor(time/3) % targets.length];
    effects.push({ kind: "fire", a:player.p, b:target.p, side:"player", phase:(time*1.2)%1 });
  }
  for (const enemy of targets.filter((actor)=>actor.target && actor.pose === "shoot").slice(0,4)) {
    effects.push({ kind:"fire", a:enemy.p, b:enemy.target === "winter" ? winter.p : player.p, side:"enemy", phase:(time*2.2+enemy.p[0])%1 });
  }
  if (beat.fire === "tank" && tank && tank.pose !== "burn") {
    const target = ["06g","06h"].includes(beat.id) ? actors.find((actor)=>actor.id === "yao").p : player.p;
    effects.push({ kind:"fire", a:tank.p, b:target, side:"enemy", heavy:true, phase:(time*5)%1 });
  }
  if (["crossfire","north"].includes(beat.fire) && beat.stage === "02") {
    effects.push({kind:"fire",a:[55,61],b:[23,67],side:"enemy",phase:(time*6)%1,heavy:true});
    if (beat.fire === "crossfire") effects.push({kind:"fire",a:[23,67],b:[55,61],side:"friend",phase:(time*3)%1});
  }
  if (beat.id === "03g") effects.push({kind:"fire",a:[22,69.5],b:[12,44],side:"friend",phase:(time*5)%1,heavy:true});
  if (["06g","06h"].includes(beat.id)) effects.push({kind:"fire",a:[81,278],b:tank.p,side:"friend",phase:(time*5)%1});
  if (beat.fx === "planes") {
    for (let index=0;index<3;index++) effects.push({kind:"plane",p:[105+(index-1)*9,180+progress*150-index*6],height:35});
  }
  if(beat.fire === "loophole") {
    // A short quiet interval is the player's reload window. The gun responds
    // with a longer burst across the exposed road when the player stops.
    const reload=(time-beat.start)%9>6;
    effects.push({kind:"fire",a:[100,471],b:reload?[114,380]:[100,383],side:"enemy",heavy:true,phase:(time*(reload?7:3))%1});
    if(beat.id === "08c"&&!reload) effects.push({kind:"fire",a:player.p,b:[100,471],side:"player",phase:(time*2)%1});
  }
  if(beat.fire === "street") {
    effects.push({kind:"fire",a:[206,480],b:player.p,side:"enemy",heavy:true,phase:(time*5)%1});
    if(beat.id === "10d") effects.push({kind:"fire",a:[123,457],b:player.p,side:"enemy",phase:(time*2)%1});
  }
  if(beat.fx === "mortar") {
    const cycle=Math.floor((time-beat.start)/12),phase=((time-beat.start)%12)/3;
    const landing=[[127,467],[120,466],[113,474],[113,465]][Math.min(cycle,3)];
    if(phase<=1) effects.push({kind:"grenade",a:[199,449],b:landing,phase});
    else if(phase<1.7) effects.push({kind:"blast",p:landing,age:(phase-1)*2});
  }
  if(beat.fx === "artillery") {
    const age=(time-beat.start)%5;
    const behind=[player.p[0]+Math.sin(Math.floor(time/5))*4,player.p[1]-5];
    effects.push({kind:"blast",p:behind,age});
  }
  if(beat.fx === "yardBlast") {
    const age=(time-beat.start)%12;
    if(age<3) {effects.push({kind:"blast",p:[111,465],age});effects.push({kind:"blast",p:[116,464],age:age+0.4});}
  }
  if(beat.fx === "runner") effects.push({kind:"runner",p:SampleRoute([[110,465],[180,465],[230,465]],progress)});
  if(beat.fx === "column") for(let index=0;index<14;index++) effects.push({kind:"column",p:[225+index*2-progress*10,330+index*3+progress*10]});
  return effects;
}

export function EvaluateFlow(requestedTime) {
  const time = Clamp(Number.isFinite(requestedTime) ? requestedTime : 0, 0, FLOW_DURATION);
  const beat = FLOW_TIMELINE.find((entry) => time < entry.end) ?? FLOW_TIMELINE.at(-1);
  const stage = STAGE_TIMELINE.find((entry) => entry.id === beat.stage);
  const progress = Clamp((time - beat.start) / beat.duration, 0, 1);
  const player = SampleRoute(beat.p, progress);
  const actors = CoreActors(beat,time,player,progress);
  const waves = WaveActors(time,player);
  actors.push(...OpeningActors(beat,time),...waves.actors);
  const effects = Effects(beat,time,progress,actors);
  const zone = beat.zone ? { p:beat.zone.slice(0,2), radius:beat.zone[2], condition:beat.gate, active:progress>=0.75 } : null;
  const previous = FLOW_TIMELINE[Math.max(0,FLOW_TIMELINE.indexOf(beat)-1)];
  const look = SampleRoute([previous.look,beat.look],Smooth(progress*3));
  const nearest = actors.filter((actor)=>actor.side === "enemy" && actor.pose !== "dead")
    .reduce((value,actor)=>Math.min(value,Distance(player,actor.p)),Infinity);
  const stretchersPassed=beat.stage === "10" ? Clamp(Math.floor((time-BeatById("10a").start-32)/13.5)+1,0,12) : null;
  return {time,beat,stage,progress,player,actors,effects,spawns:waves.spawns,zone,look,nearest,stretchersPassed};
}

export function CameraAt(frame, mode = "player") {
  const { player, look, time, beat } = frame;
  const eye = [player[0], 1.6, player[1]];
  const aim = [look[0],beat.id === "03g"?2.6:0.8,look[1]];
  if (mode === "player") {
    if (["kneel","drag","down","crouch","hold"].includes(beat.pose)) eye[1] = beat.pose === "down" ? 0.35 : 0.85;
    if (["walk","run","drag","retreat"].includes(beat.pose)) eye[1] += Math.sin(time*6)*0.045;
    if (beat.pose === "pack" || beat.pose === "plant") aim[1] = -0.6;
    if (beat.pose === "vault") eye[1]+=Math.sin(frame.progress*Math.PI)*1.5;
  } else {
    const direction = Math.atan2(look[0]-player[0],look[1]-player[1]);
    const radius = mode === "overview" ? 26 : 10;
    const orbit = mode === "overview" ? Math.sin(time*0.03)*0.25 : 0.5;
    eye[0] -= Math.sin(direction+orbit)*radius;
    eye[2] -= Math.cos(direction+orbit)*radius;
    eye[1] = mode === "overview" ? 22 : 6;
    aim[0] = player[0]; aim[1] = 0.5; aim[2] = player[1];
  }
  const impact = frame.effects.find((fx)=>fx.kind === "blast" && fx.age < 1);
  if (impact) { eye[0]+=Math.sin(time*48)*0.12*(1-impact.age); eye[1]+=Math.cos(time*51)*0.1*(1-impact.age); }
  return {eye,aim,fov:mode === "player" ? 72 : 60};
}

export function FormatFlowTime(time) {
  const seconds = Math.floor(time);
  return `${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`;
}
