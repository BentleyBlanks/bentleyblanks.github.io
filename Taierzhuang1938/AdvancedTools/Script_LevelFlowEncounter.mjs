import { FLOW_GROUND, FLOW_GROUND_FORMATIONS, FLOW_PREVIOUS_ENCOUNTER, FLOW_PREVIOUS_DRAG_ENCOUNTER, FLOW_PREVIOUS_BATCH_ENCOUNTER, FLOW_PREVIOUS_FLANK, FLOW_PREVIOUS_CORNER, FLOW_PREVIOUS_PURSUIT } from "./Data_LevelFlow.mjs";
import { Clamp, Distance, EnterArea, Lerp, SampleRoute, SegmentDistance } from "./Script_LevelFlowGeometry.mjs";

export const ENCOUNTER_SCHEMA = "tengxian-encounter/2";
export const ENCOUNTER_BEHAVIORS = {
  advance: "沿路线推进", suppress: "定点压制", bounds: "掩体间跃进", flank: "绕侧包抄", escort: "跟车推进", withdraw: "撤离", guard: "驻守掩护",
};
export const ENCOUNTER_CINEMATICS = ["01a","01b","01c","01e","02a","02b","02c","02d","02e","02f","08f","09d","10g"];
const Area = (center, width = 5, depth = width) => ({ shape: "rect", center: [...center], size: [width, depth] });

export function CreateEncounterDocument(timeline, waves) {
  const Find = (id) => timeline.find((beat) => beat.id === id);
  const triggers = timeline.filter((beat) => beat.zone).map((beat) => ({
    id: `Arrival_${beat.id}`, label: beat.title, beat: beat.id, endBeat: beat.id,
    mode: "area", delay: 0, area: {shape:"circle",center:beat.zone.slice(0,2),size:[beat.zone[2]*2,beat.zone[2]*2]},
  }));
  const groups = waves.map((wave) => {
    const beat = Find(wave.beat), end = Find(wave.until || wave.beat);
    const triggerId = `Trigger_${wave.id}`;
    triggers.push({id:triggerId,label:wave.label,beat:beat.id,endBeat:end.id,mode:"area",delay:0,area:Area(beat.p[0],6),...structuredClone(wave.trigger||{})});
    return {
      id: wave.id, label: wave.label, beat: beat.id, endBeat: end.id, triggerId, enabled: true,
      side: "enemy", target: wave.target === "winter" ? "winter" : "player",
      area: Area(wave.source,...(wave.areaSize || [2.4,3])), route: structuredClone(wave.route),
      ...(wave.spawnOffsets ? {spawnOffsets: structuredClone(wave.spawnOffsets)} : {}),
      ...(wave.memberPlans ? {memberPlans: structuredClone(wave.memberPlans)} : {}),
      ...(wave.deployDelay ? {deployDelay: wave.deployDelay} : {}),
      ...(wave.reinforceAfterClear ? {reinforceAfterClear: true} : {}),
      ...(wave.standoffMetres ? {standoffMetres:wave.standoffMetres} : {}),
      ...(wave.spacingMetres ? {spacingMetres:wave.spacingMetres} : {}),
      ...(wave.coverWaitSeconds !== undefined ? {coverWaitSeconds:wave.coverWaitSeconds} : {}),
      count: wave.count, interval: wave.interval, maxAlive: wave.maxAlive ?? (wave.cyclic ? 5 : wave.count),
      lifetime: wave.lifetime ?? (wave.cyclic ? 44 : Math.max(5,wave.lastFall - (wave.count-1)*wave.interval)), speed: wave.speed ?? 2.5, grenadeInterval: wave.grenadeInterval ?? 0,
      behavior: wave.behavior || (wave.transfer ? "withdraw" : wave.id.startsWith("Tank") ? "escort" : wave.cyclic ? "bounds" : "advance"),
      note: wave.repeat,
    };
  });
  const Add = (id,label,beat,endBeat,center,route,count,side,behavior,target,lifetime=90) => {
    const triggerId=`Trigger_${id}`;
    triggers.push({id:triggerId,label,beat,endBeat,mode:"time",delay:0,area:Area(Find(beat).p[0],6)});
    groups.push({id,label,beat,endBeat,triggerId,enabled:true,side,target,area:Area(center,3,3),route,count,interval:2,maxAlive:count,lifetime,speed:2.2,behavior,note:"关卡调度布设"});
  };
  Add("RearPursuit","③ 北坡下沟第二波","03g","03h",[20,33],[[20,33],[17,36],[14.5,40],[12,44],[21.9,67.1],[26,76.6],[30,86],[32.5,101],[34,117]],3,"enemy","advance","player",54);
  const pursuit=groups.at(-1);pursuit.interval=2.5;pursuit.maxAlive=3;triggers.at(-1).delay=36;pursuit.standoffMetres=16;pursuit.grenadeInterval=11;pursuit.behavior="bounds";
  const escort=groups.find((group)=>group.id==="TankEscort");
  Object.assign(escort,{lifetime:400,speed:1.7,tankId:"tank1",grenadeInterval:12});
  Object.assign(triggers.find((trigger)=>trigger.id===escort.triggerId),{area:Area([32.5,101],8,8)});
  Add("TankRearScreen","后车行军护卫","03h","06f",[116,56],[[116,56],[112,98],[110,134],[108,166],[105,196],[103,218],[101,249]],4,"enemy","escort","player",470);
  triggers.pop(); // Both vehicle escort groups share the player arrival trigger.
  Object.assign(groups.at(-1),{triggerId:escort.triggerId,tankId:"tank2",speed:1.7,grenadeInterval:14});
  const reinforcement=groups.find((group)=>group.id==="TankReinforce");
  Object.assign(reinforcement,{tankId:"tank2",grenadeInterval:10,speed:1.8});
  Add("GroundWest","西翼掩体跃进","03h","06f",[96,108],[[96,108],[95,156],[95,192],[96,218],[95,251]],4,"enemy","bounds","player",470);
  Object.assign(groups.at(-1),{speed:2.8,interval:4,grenadeInterval:13});
  Add("GroundEast","东翼掩体跃进","03h","06g",[125,109],[[125,109],[123,160],[118,189],[118,222],[118,253]],4,"enemy","bounds","player",540);
  Object.assign(groups.at(-1),{speed:2.6,interval:5,grenadeInterval:14});
  for(const [id,label,center,weapon] of [
    ["DragGround","拖行段地面阻击",[20,96],"rifle"],
    ["FieldGround","坡顶地面阻击",[48,122],"rifle"],
    ["CampWestGun","集结处西侧机枪",[41,137],"machineGun"],
    ["CampEastGun","集结处东侧机枪",[74,139],"machineGun"],
    ["LaneGround","凹路西坎阻击",[72,190],"rifle"],
    ["BendGround","弯口接应",[80,279],"machineGun"],
  ]) {
    Add(id,label,"03a","06h",center,[center],weapon==="machineGun"?2:3,"friend","guard","enemy",800);
    groups.at(-1).weapon=weapon;
  }
  Add("CrestWest","坡顶西侧接应","03g","04a",[27.5,128],[[27.5,128],[28.5,129]],2,"friend","guard","enemy",160);
  Add("CrestEast","坡顶东侧接应","03g","04a",[43,129],[[43,129],[43,129]],2,"friend","guard","enemy",160);
  Add("VillageGun","北屋枪眼机枪组","08a","09i",[100,471.5],[[100,471.5]],3,"enemy","suppress","ramp",700);
  Add("VillageRifles","北屋与墙角守军","08a","09i",[104,471],[[104,471]],4,"enemy","guard","ramp",700);
  Add("SearchYard","街坊家搜人组","09a","09d",[74,459],[[74,459]],4,"enemy","guard","none",300);
  Add("SearchNeighbor","隔壁搜人组","09a","09d",[61,448],[[61,448]],2,"enemy","guard","none",300);
  Add("GateGuard","门房守卫","09e","09f",[73,465.5],[[73,465.5]],1,"enemy","guard","none",40);
  Add("KitchenGuard","灶屋守卫","09a","09i",[94,479.3],[[94,479.3]],1,"enemy","guard","none",400);
  Add("TempleGun","土地庙机枪","10c","10e",[181,480],[[181,480]],2,"enemy","suppress","player",140);
  Add("MortarTeam","场院掷弹筒","10c","10e",[199,449],[[199,449]],2,"enemy","guard","none",140);
  for(const formation of FLOW_GROUND_FORMATIONS) {
    const group=groups.find(item=>item.id===formation.id);
    group.area.size=[...formation.areaSize];
    group.spawnOffsets=structuredClone(formation.offsets);
    group.memberPlans=formation.offsets.map((offset,index)=>({
      delay:formation.delays[index],
      route:structuredClone(formation.routes?.[index]
        || (formation.route||group.route).slice(1).map(point=>point.map((value,axis)=>value+offset[axis]))),
    }));
  }
  return {schema:ENCOUNTER_SCHEMA,id:"FirstLevel",revision:"2026-11-13-pit-retreat-1",triggers,groups,annotations:[]};
}

function Require(condition, message) { if (!condition) throw new Error(message); }
function CheckPoint(point) { return Array.isArray(point) && point.length === 2 && point.every((value) => Number.isFinite(value) && Math.abs(value) <= 10000); }
function CheckArea(area) {
  return area && ["circle","rect"].includes(area.shape) && CheckPoint(area.center) && CheckPoint(area.size)
    && area.size.every((value) => value >= 0.5 && value <= 500);
}

export function ValidateEncounterDocument(input, timeline) {
  Require(input?.schema === ENCOUNTER_SCHEMA, "文件版本不匹配");
  Require(Array.isArray(input.triggers) && input.triggers.length <= 300, "触发区数据无效");
  Require(Array.isArray(input.groups) && input.groups.length <= 200, "生成区数据无效");
  Require(Array.isArray(input.annotations) && input.annotations.length <= 1000, "标注数据无效");
  const beats = new Map(timeline.map((beat) => [beat.id,beat]));
  const triggers = new Set();
  const CheckIdentity = (item) => {
    Require(typeof item.id === "string" && /^[A-Za-z0-9_-]{1,90}$/.test(item.id), "对象编号无效");
    Require(typeof item.label === "string" && item.label.length <= 150, "对象名称过长");
    Require(beats.has(item.beat) && beats.has(item.endBeat), "对象引用的阶段不存在");
    Require(beats.get(item.endBeat).end > beats.get(item.beat).start, "结束阶段早于开始阶段");
    Require(CheckArea(item.area), "区域坐标或尺寸无效");
  };
  for (const trigger of input.triggers) {
    CheckIdentity(trigger);
    Require(!triggers.has(trigger.id), "触发区编号重复");triggers.add(trigger.id);
    Require(["area","time"].includes(trigger.mode), "触发方式无效");
    Require(Number.isFinite(trigger.delay) && trigger.delay >= 0 && trigger.delay <= timeline.at(-1).end, "触发延迟无效");
  }
  const groupIds = new Set();
  for (const group of input.groups) {
    CheckIdentity(group);
    Require(!groupIds.has(group.id), "生成区编号重复");groupIds.add(group.id);
    Require(triggers.has(group.triggerId), "生成区关联的触发区不存在");
    Require(["friend","enemy"].includes(group.side) && ["player","winter","enemy","ramp","none"].includes(group.target), "阵营或目标无效");
    Require(typeof group.enabled === "boolean" && Object.hasOwn(ENCOUNTER_BEHAVIORS,group.behavior), "行为配置无效");
    Require(Array.isArray(group.route) && group.route.length>0 && group.route.length<=100 && group.route.every(CheckPoint), "推进路线无效");
    Require(group.spawnOffsets===undefined || Array.isArray(group.spawnOffsets) && group.spawnOffsets.length>0 && group.spawnOffsets.length<=40 && group.spawnOffsets.every(CheckPoint), "分散生成点无效");
    Require(group.memberPlans===undefined || Array.isArray(group.memberPlans) && group.memberPlans.length>0 && group.memberPlans.length<=40
      && group.memberPlans.every(plan=>plan && Number.isFinite(plan.delay) && plan.delay>=0 && plan.delay<=60
        && Array.isArray(plan.route) && plan.route.length>0 && plan.route.length<=100 && plan.route.every(CheckPoint)), "单兵推进计划无效");
    Require(group.deployDelay===undefined || Number.isFinite(group.deployDelay) && group.deployDelay>=0 && group.deployDelay<=60, "隐蔽集结时长无效");
    Require(group.standoffMetres===undefined || Number.isFinite(group.standoffMetres) && group.standoffMetres>=0 && group.standoffMetres<=100, "追击距离无效");
    Require(group.spacingMetres===undefined || Number.isFinite(group.spacingMetres) && group.spacingMetres>=0 && group.spacingMetres<=10, "单兵间距无效");
    Require(group.coverWaitSeconds===undefined || Number.isFinite(group.coverWaitSeconds) && group.coverWaitSeconds>=0 && group.coverWaitSeconds<=60, "掩护停留时长无效");
    Require(group.tankId===undefined||["", "tank1","tank2"].includes(group.tankId),"跟随战车无效");
    Require(group.weapon===undefined||["rifle","machineGun"].includes(group.weapon),"武器配置无效");
    Require(group.grenadeInterval===undefined||group.grenadeInterval===0||Number.isFinite(group.grenadeInterval)&&group.grenadeInterval>=8&&group.grenadeInterval<=120,"投弹间隔须为 0 或 8–120 秒");
    Require(Number.isInteger(group.count) && group.count>=0 && group.count<=100, "数量须在 0–100 内");
    Require(Number.isInteger(group.maxAlive) && group.maxAlive>=1 && group.maxAlive<=40, "同时在场须在 1–40 内");
    Require(group.reinforceAfterClear===undefined || typeof group.reinforceAfterClear==="boolean", "整批消灭后补充开关无效");
    Require(Number.isFinite(group.interval) && group.interval>=0 && group.interval<=300, "补充间隔无效");
    Require(Number.isFinite(group.lifetime) && group.lifetime>=2 && group.lifetime<=2000, "存续时长无效");
    Require(Number.isFinite(group.speed) && group.speed>=0.1 && group.speed<=8, "移动速度无效");
  }
  const annotationIds=new Set();
  for(const annotation of input.annotations) {
    Require(typeof annotation.id==="string" && !annotationIds.has(annotation.id),"标注编号重复");annotationIds.add(annotation.id);
    Require(["arrow","rect","text"].includes(annotation.kind),"标注类型无效");
    Require(Number.isFinite(annotation.time) && annotation.time>=0 && annotation.time<=timeline.at(-1).end,"标注时间无效");
    Require(CheckPoint(annotation.a) && CheckPoint(annotation.b),"标注坐标无效");
    Require(typeof annotation.text==="string" && annotation.text.length<=500,"标注文字过长");
    if(annotation.view) Require(CheckPoint(annotation.view.center)&&Number.isFinite(annotation.view.scale)&&annotation.view.scale>=0.1&&annotation.view.scale<=80,"标注视图无效");
  }
  return structuredClone(input);
}

function PlayerRoute(timeline) {
  return timeline.flatMap((beat) => {
    const lengths=beat.p.slice(1).map((point,index)=>Distance(beat.p[index],point));
    const total=lengths.reduce((sum,value)=>sum+value,0);
    if(total===0) return [[beat.start,...beat.p[0]],[beat.end,...beat.p[0]]];
    let walked=0;
    return beat.p.map((point,index)=>{
      if(index) walked+=lengths[index-1];
      return [beat.start+beat.duration*(beat.pace?.[index]??walked/total),...point];
    });
  });
}

const coverTracks=new WeakMap();

export function CompileEncounters(document, timeline) {
  const beats=new Map(timeline.map((beat)=>[beat.id,beat])), route=PlayerRoute(timeline);
  const triggers=document.triggers.map((trigger)=>{
    const start=beats.get(trigger.beat).start+trigger.delay,end=beats.get(trigger.endBeat).end;
    let firedAt=trigger.mode === "time" && start<=end ? start : null;
    if(trigger.mode === "area") for(let index=1;index<route.length;index++) {
      const previous=route[index-1],next=route[index];
      const from=Math.max(start,previous[0]),to=Math.min(end,next[0]);
      if(to<from || next[0]<=previous[0]) continue;
      const a=SampleRoute([previous.slice(1),next.slice(1)],(from-previous[0])/(next[0]-previous[0]));
      const b=SampleRoute([previous.slice(1),next.slice(1)],(to-previous[0])/(next[0]-previous[0]));
      const entered=EnterArea(a,b,trigger.area);
      if(entered!==null) {firedAt=Lerp(from,to,entered);break;}
    }
    return {...trigger,start,end,firedAt};
  });
  const groups=document.groups.map((group)=>{
    const trigger=triggers.find((item)=>item.id===group.triggerId);
    const start=trigger.firedAt,end=beats.get(group.endBeat).end;
    const lives=[];
    if(start!==null && group.enabled) for(let index=0;index<group.count;index++) {
      const slot=lives[index-group.maxAlive];
      const batchSlot=index%group.maxAlive;
      const previousBatch=group.reinforceAfterClear ? lives[index-batchSlot-1] : null;
      const ready=previousBatch ? previousBatch.fall+batchSlot*group.interval : slot?.fall??start;
      const born=Math.max(start+index*group.interval,ready);
      if(born>=end) break;
      lives.push({born,fall:born+group.lifetime});
    }
    const compiled={...group,start,end,lives};
    if(group.standoffMetres && !(group.behavior==="bounds" && group.memberPlans)) coverTracks.set(compiled,BuildPursuitTracks(compiled,route));
    else if(group.behavior==="bounds") coverTracks.set(compiled,BuildCoverTracks(compiled,route));
    return compiled;
  });
  return {triggers,groups};
}

function RouteProjection(path,point) {
  let traveled=0,nearest=Infinity,progress=0;
  for(let index=1;index<path.length;index++) {
    const a=path[index-1],b=path[index],length=Distance(a,b);
    const fraction=length?Clamp(((point[0]-a[0])*(b[0]-a[0])+(point[1]-a[1])*(b[1]-a[1]))/(length*length),0,1):0;
    const projected=[Lerp(a[0],b[0],fraction),Lerp(a[1],b[1],fraction)];
    if(Distance(point,projected)<nearest) {nearest=Distance(point,projected);progress=traveled+length*fraction;}
    traveled+=length;
  }
  return progress;
}

function TimedPosition(route,time) {
  const end=route.findIndex((point)=>point[0]>=time);
  if(end<=0) return route[end<0?route.length-1:0].slice(1);
  const a=route[end-1],b=route[end];
  return SampleRoute([a.slice(1),b.slice(1)],(time-a[0])/(b[0]-a[0]));
}

export function GroupPath(group,index) {
  const slot=index%group.maxAlive;
  const offset=group.spawnOffsets?.[slot];
  const origin=offset?group.area.center.map((value,axis)=>value+offset[axis]):group.area.center;
  return [origin,...(group.memberPlans?.[slot]?.route || group.route.slice(1))];
}

// Compile each soldier's cover-to-cover movement once, including waits for the
// retreating front to move. Seeking samples these tracks without replaying AI.
function BuildPursuitTracks(group, playerRoute) {
  return group.lives.map((life, index) => {
    const path = GroupPath(group, index);
    const total = path.slice(1).reduce((sum, point, entry) => sum + Distance(path[entry], point), 0);
    const track = [[life.born, 0]];
    let distance = 0;
    const ready = life.born + (group.deployDelay || 0) + (group.memberPlans?.[index % group.maxAlive]?.delay || 0);
    for (let time = life.born + 0.25; time <= Math.min(life.fall, group.end); time += 0.25) {
      const next = Math.min(total, distance + group.speed * 0.25);
      const candidate = SampleRoute(path, total ? next / total : 0);
      if (time >= ready && Distance(candidate, TimedPosition(playerRoute, time)) >= group.standoffMetres + Math.hypot(...group.area.size) / 2) distance = next;
      track.push([time, distance]);
    }
    return track;
  });
}

function BuildCoverTracks(group,playerRoute) {
  if(group.memberPlans && group.spawnOffsets) return BuildBoundingPairTracks(group,playerRoute);
  return group.lives.map((life,index)=>{
    const path=GroupPath(group,index),distances=[0];
    for(let point=1;point<path.length;point++) distances.push(distances.at(-1)+Distance(path[point-1],path[point]));
    const track=[[life.born,0]],step=0.25;
    let distance=0,next=1,waitUntil=life.born+(group.deployDelay||0)+(group.memberPlans?.[index%group.maxAlive]?.delay||0);
    for(let time=life.born+step;time<=Math.min(life.fall,group.end);time+=step) {
      const front=RouteProjection(path,TimedPosition(playerRoute,time));
      if(next<path.length&&time>=waitUntil&&distances[next]<=front+2) {
        distance=Math.min(distances[next],distance+group.speed*step);
        if(distance>=distances[next]) {next++;waitUntil=time+FLOW_GROUND.coverWaitS;}
      }
      track.push([time,distance]);
    }
    return track;
  });
}

function BuildBoundingPairTracks(group,playerRoute) {
  const states=group.lives.map((life,index)=>{
    const path=GroupPath(group,index),distances=[0],slot=index%group.maxAlive;
    for(let point=1;point<path.length;point++) distances.push(distances.at(-1)+Distance(path[point-1],path[point]));
    return {path,distances,life,index,team:Math.floor(slot/2)%2,next:1,distance:0,
      waitUntil:life.born+(group.deployDelay||0)+(group.memberPlans[slot]?.delay||0),track:[[life.born,0]]};
  });
  const step=0.25;
  for(let time=group.start+step;time<=Math.min(group.end,Math.max(...group.lives.map(life=>life.fall)));time+=step) {
    // Snapshot arrivals before this tick so a pair cannot release the other
    // midway through the same tick. Each pair waits for covering fire to resume.
    const arrivals=states.map(state=>state.next);
    const player=TimedPosition(playerRoute,time);
    const frontReady=states.map(state=>state.next>=state.path.length
      || group.standoffMetres && SegmentDistance(player,state.path[state.next-1],state.path[state.next])>=group.standoffMetres
      || state.distances[state.next]<=RouteProjection(state.path,player)+2);
    for(const state of states) {
      if(time<state.life.born || time>state.life.fall) continue;
      const covering=states.every((other,otherIndex)=>other.team===state.team
        // Rear pairs follow the preceding cover team. Waiting for a later
        // pair would lock both teams when that pair queues at the narrow ramp.
        || group.spacingMetres && other.index>state.index
        || time<other.life.born || time>=other.life.fall || arrivals[otherIndex]>=other.path.length
        || arrivals[otherIndex]>=state.next+(state.team===1?1:0));
      const pairReady=states.every((other,otherIndex)=>other.team!==state.team
        || time<other.life.born || time>=other.life.fall || arrivals[otherIndex]!==state.next || frontReady[otherIndex]);
      const clear = state.next>=state.path.length || !group.standoffMetres
        || SegmentDistance(player,state.path[state.next-1],state.path[state.next])>=group.standoffMetres;
      if(state.next<state.path.length && time>=state.waitUntil && covering && pairReady && clear) {
        const distance=Math.min(state.distances[state.next],state.distance+group.speed*step);
        const candidate=SampleRoute(state.path,distance/(state.distances.at(-1)||1));
        const spaced=!group.spacingMetres || states.every(other=>other===state
          || time<other.life.born || time>=other.life.fall
          || Distance(candidate,SampleRoute(other.path,other.distance/(other.distances.at(-1)||1)))>=group.spacingMetres);
        if(spaced) state.distance=distance;
        if(state.distance>=state.distances[state.next]) {state.next++;state.waitUntil=time+(group.coverWaitSeconds??FLOW_GROUND.coverWaitS);}
      }
      state.track.push([time,state.distance]);
    }
  }
  return states.map(state=>state.track);
}

function CoverMovement(group,index,time) {
  const track=coverTracks.get(group)?.[index];
  if(!track?.length) return {distance:0,moving:false};
  const end=track.findIndex((key)=>key[0]>=time);
  if(end<=0) return {distance:track[end<0?track.length-1:0][1],moving:false};
  const a=track[end-1],b=track[end];
  return {distance:Lerp(a[1],b[1],(time-a[0])/(b[0]-a[0])),moving:b[1]>a[1]};
}

function GroupActor(group,index,time,coreActors) {
  const life=group.lives[index];
  const slot=index%group.maxAlive,offset=group.spawnOffsets?.[slot];
  const readyAt=life.born+(group.deployDelay||0)+(group.memberPlans?.[slot]?.delay||0);
  const age=Math.max(0,Math.min(time,life.fall)-readyAt);
  const path=GroupPath(group,index);
  const lengths=path.slice(1).map((point,index)=>Distance(path[index],point));
  const total=lengths.reduce((sum,length)=>sum+length,0);
  const stationary=["suppress","guard"].includes(group.behavior);
  const movement=group.standoffMetres||group.behavior==="bounds"?CoverMovement(group,index,Math.min(time,life.fall)):{distance:age*group.speed,moving:!stationary&&age*group.speed<total};
  let distance=stationary?0:Math.min(total,movement.distance);
  const tank=coreActors.find((actor)=>actor.id===(group.tankId||"tank1"));
  if(group.behavior==="escort"&&tank) {
    const progress=RouteProjection(path,tank.p);
    const spacing=group.memberPlans?3.2:1.1;
    const clearance=group.memberPlans?5:3;
    const limit=Math.max(0,progress-clearance-slot*spacing);
    if(distance>=limit) movement.moving=tank.moving;
    distance=Math.min(distance,limit);
  }
  let position=SampleRoute(path,total?distance/total:0);
  const slots=Math.min(group.count,group.maxAlive);
  const columns=Math.ceil(Math.sqrt(slots)),rows=Math.ceil(slots/columns);
  const spread=offset?[0,0]:group.area.shape==="circle"
    ? [Math.cos(slot*2.39996)*Math.sqrt((slot+0.5)/slots)*group.area.size[0]*0.4,Math.sin(slot*2.39996)*Math.sqrt((slot+0.5)/slots)*group.area.size[0]*0.4]
    : [((slot%columns+0.5)/columns-0.5)*group.area.size[0]*0.8,((Math.floor(slot/columns)+0.5)/rows-0.5)*group.area.size[1]*0.8];
  position=[position[0]+spread[0],position[1]+spread[1]];
  let pose=time>=life.fall?"dead":time<readyAt?"kneel":group.behavior==="withdraw"||movement.moving?"run":"shoot";
  if(time>=group.end&&pose!=="dead") {position=SampleRoute([position,group.area.center],(time-group.end)*group.speed/(Distance(position,group.area.center)||1));pose="run";}
  return {id:`${group.id}_${index}`,name:`${group.label} ${index+1}`,side:group.side,kind:"person",p:position,pose,
    groupId:group.id,wave:group.id,target:group.target,born:life.born,fall:life.fall,
    heavy:group.weapon==="machineGun"&&index%group.maxAlive===0||group.target==="ramp",firing:group.behavior!=="withdraw"&&group.target!=="none"&&pose==="shoot"};
}

export function SampleEncounters(plan,time,coreActors,sampleCore=()=>coreActors) {
  const actors=[],effects=[];
  const player=coreActors.find((actor)=>actor.id==="player");
  for(const group of plan.groups) {
    if(group.start===null||!group.enabled||time<group.start||time>group.end+8) continue;
    for(let index=0;index<group.lives.length;index++) {
      const life=group.lives[index];
      if(time<life.born||time>life.fall+8) continue;
      actors.push(GroupActor(group,index,time,coreActors));
      if(group.side!=="enemy"||!group.grenadeInterval||group.target==="none") continue;
      const interval=group.grenadeInterval,first=life.born+5+index*1.7;
      const launch=first+Math.floor((time-first)/interval)*interval,age=time-launch;
      if(launch<first||launch>=Math.min(life.fall,group.end)||age<0||age>5) continue;
      const then=sampleCore(launch),thrower=GroupActor(group,index,launch,then);
      if(thrower.pose!=="shoot") continue;
      const target=then.find((actor)=>actor.id===group.target)||then[0];
      const range=Distance(thrower.p,target.p);
      if(range<7||range>32) continue;
      const landing=[target.p[0]+Math.sin(index*2.4)*1.2,target.p[1]+Math.cos(index*2.4)*1.2];
      if(age<3.5) effects.push({kind:"grenade",a:thrower.p,b:landing,phase:Math.min(1,age/2),side:"enemy",groupId:group.id});
      else effects.push({kind:"blast",p:landing,age:age-3.5,side:"enemy",groupId:group.id});
    }
  }
  const enemies=actors.filter((actor)=>actor.side==="enemy"&&actor.pose!=="dead");
  const rearGuards=coreActors.filter(actor=>actor.groupId==="DragRearguard");
  for(const actor of [...actors,...rearGuards].filter((item)=>item.firing)) {
    const casualty=actor.groupId==="Corner" && rearGuards.find(guard=>time>=guard.fall-2 && time<=guard.fall+0.3);
    const target=actor.target==="enemy"?enemies.reduce((nearest,enemy)=>!nearest||Distance(actor.p,enemy.p)<Distance(actor.p,nearest.p)?enemy:nearest,null)
      :actor.target==="ramp"?{p:[100,384]}:casualty||(coreActors.find((item)=>item.id===actor.target)??player);
    if(target&&Distance(actor.p,target.p)<180) effects.push({kind:"fire",a:actor.p,b:target.p,side:actor.side,heavy:actor.heavy,phase:(time*2.3+actor.p[0])%1});
  }
  return {actors,effects,triggers:plan.triggers.map((trigger)=>({...trigger,active:trigger.firedAt!==null&&time>=trigger.firedAt})),
    groups:plan.groups.map((group)=>({...group,spawned:group.lives.filter((life)=>time>=life.born).length,
      live:group.lives.filter((life)=>time>=life.born&&time<Math.min(life.fall,group.end)).length}))};
}

function UpgradeFlankReinforcement(value,defaults) {
  const changes=[
    ["groups","TrafficFlank",FLOW_PREVIOUS_FLANK.group],
    ["triggers","Trigger_TrafficFlank",FLOW_PREVIOUS_FLANK.trigger],
  ];
  for(const [collection,id,previous] of changes) {
    const current=value[collection].find(item=>item.id===id);
    const next=defaults[collection].find(item=>item.id===id);
    if(!current || !next) continue;
    for(const [key,entry] of Object.entries(previous)) {
      if(JSON.stringify(current[key])===JSON.stringify(entry)) {
        current[key]=structuredClone(next[key]);
      }
    }
    if(collection==="groups" && current.reinforceAfterClear===undefined) {
      current.reinforceAfterClear=next.reinforceAfterClear;
    }
  }
  return UpgradeGroundFormations(value,defaults);
}

function UpgradeGroundFormations(value,defaults) {
  for(const formation of FLOW_GROUND_FORMATIONS) {
    const current=value.groups.find(group=>group.id===formation.id);
    const next=defaults.groups.find(group=>group.id===formation.id);
    if(!current || !next || current.memberPlans || current.spawnOffsets) continue;
    const previousArea={...next.area,size:formation.previousAreaSize};
    if(JSON.stringify(current.route)!==JSON.stringify(next.route)
      || JSON.stringify(current.area)!==JSON.stringify(previousArea)) continue;
    current.area=structuredClone(next.area);
    current.spawnOffsets=structuredClone(next.spawnOffsets);
    current.memberPlans=structuredClone(next.memberPlans);
  }
  return UpgradeDragPursuit(value,defaults);
}

function UpgradeDragPursuit(value,defaults) {
  const current=value.groups.find(group=>group.id==="Corner");
  const next=defaults.groups.find(group=>group.id==="Corner");
  if(current && next) {
    const routeEdited=JSON.stringify(current.route)!==JSON.stringify(FLOW_PREVIOUS_CORNER.route)
      && JSON.stringify(current.route)!==JSON.stringify(next.route);
    for(const [key,previous] of Object.entries(FLOW_PREVIOUS_CORNER)) {
      if(routeEdited && key==="behavior") continue;
      if(JSON.stringify(current[key])===JSON.stringify(previous)) current[key]=structuredClone(next[key]);
    }
    if(!routeEdited && !current.memberPlans) {
      current.memberPlans=structuredClone(next.memberPlans);
      current.standoffMetres=next.standoffMetres;
      current.spacingMetres=next.spacingMetres;
      current.coverWaitSeconds=next.coverWaitSeconds;
    }
  }
  return UpgradePursuit(value,defaults);
}

function UpgradePursuit(value, defaults) {
  for (const collection of ["groups", "triggers"]) {
    for (const previous of FLOW_PREVIOUS_PURSUIT[collection]) {
      const current = value[collection].find(entry => entry.id === previous.id);
      const next = defaults[collection].find(entry => entry.id === previous.id);
      if (!current || !next) continue;
      for (const [key, entry] of Object.entries(next)) {
        if (JSON.stringify(current[key]) === JSON.stringify(previous[key])) current[key] = structuredClone(entry);
      }
    }
  }
  value.revision = defaults.revision;

  return value;
}

export function UpgradeEncounterDocument(input,defaults) {
  if(input.revision==="2026-11-13-drag-pursuit-1") return UpgradePursuit(structuredClone(input),defaults);
  if(input.revision==="2026-11-13-ground-formation-1") return UpgradeDragPursuit(structuredClone(input),defaults);
  if(input.revision==="2026-11-13-flank-refill-1") return UpgradeGroundFormations(structuredClone(input),defaults);
  if(input.revision==="2026-11-13-formation-1") return UpgradeFlankReinforcement(structuredClone(input),defaults);
  // Upgrade the collapsed batch without restoring groups deleted in a draft.
  if(input.revision==="2026-11-13-batch-1") {
    const value=structuredClone(input);
    const current=value.groups.find(group=>group.id==="Fork");
    const next=defaults.groups.find(group=>group.id==="Fork");
    if(current && JSON.stringify(current.route)===JSON.stringify(next.route) && current.memberPlans===undefined) {
      current.memberPlans=structuredClone(next.memberPlans);
      if(current.note==="第一回五人按标注叉位在北侧土垄后整批生成，经南端绕出压住洞口") current.note=next.note;
    }
    return UpgradeFlankReinforcement(value,defaults);
  }
  const oldRevision=input.revision===FLOW_PREVIOUS_ENCOUNTER.revision;
  // Junction drafts already know ForkRelief, so deleting it stays respected.
  const baseline=input.revision==="2026-11-13-junction-1" ? {
    ...FLOW_PREVIOUS_BATCH_ENCOUNTER,
    groups:[...FLOW_PREVIOUS_BATCH_ENCOUNTER.groups,{id:"ForkRelief"}],
    triggers:[...FLOW_PREVIOUS_BATCH_ENCOUNTER.triggers,{id:"Trigger_ForkRelief"}],
  } : [FLOW_PREVIOUS_ENCOUNTER,FLOW_PREVIOUS_DRAG_ENCOUNTER,FLOW_PREVIOUS_BATCH_ENCOUNTER]
    .find(previous=>previous.revision===input.revision);
  if(!baseline) return input;
  const value=structuredClone(input);
  for(const collection of ["groups","triggers"]) {
    for(const next of defaults[collection]) {
      const current=value[collection].find((item)=>item.id===next.id);
      const previousEntry=baseline[collection].find((item)=>item.id===next.id);
      const previous=previousEntry?{...FLOW_PREVIOUS_BATCH_ENCOUNTER[collection].find(item=>item.id===next.id),...(oldRevision?FLOW_PREVIOUS_DRAG_ENCOUNTER[collection].find(item=>item.id===next.id):{}),...previousEntry}:null;
      if(!current&&!previous) value[collection].push(structuredClone(next));
      if(!current||!previous) continue;
      const routeEdited=Object.hasOwn(previous,"route") && JSON.stringify(current.route)!==JSON.stringify(previous.route);
      for(const [key,entry] of Object.entries(next)) {
        if(key==="memberPlans" && routeEdited) continue;
        if(JSON.stringify(current[key])===JSON.stringify(previous[key])) current[key]=structuredClone(entry);
      }
    }
  }
  return UpgradeFlankReinforcement(value,defaults);
}
