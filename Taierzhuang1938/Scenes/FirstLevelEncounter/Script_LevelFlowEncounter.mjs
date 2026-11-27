import { FLOW_ZOOM } from "../../Data_Tuning_LevelFlow.mjs";
import { FLOW_GROUND, FLOW_GROUND_FORMATIONS, FLOW_FRIEND_REINFORCEMENTS, FLOW_PREVIOUS_ENCOUNTER, FLOW_PREVIOUS_DRAG_ENCOUNTER, FLOW_PREVIOUS_BATCH_ENCOUNTER, FLOW_PREVIOUS_FLANK, FLOW_PREVIOUS_CORNER, FLOW_PREVIOUS_PURSUIT } from "./Data_LevelFlow.mjs";
import { Clamp, Distance, EnterArea, InsideArea, Lerp, SampleRoute, SegmentDistance } from "./Script_LevelFlowGeometry.mjs";
import { FLOW_PREVIOUS_AMBUSH, FLOW_PREVIOUS_FRONT_DEFENSE, FLOW_PREVIOUS_TANK_APPROACH, FLOW_PREVIOUS_CAMP_COVER, FLOW_PREVIOUS_CAMP_ALIGNED, FLOW_PREVIOUS_INFANTRY_TANK, FLOW_PREVIOUS_CAMP_SCATTER, FLOW_PREVIOUS_CAMP_COMBINED } from "./Data_LevelFlowAmbushBaseline.mjs";
import { FLOW_STREET_DEFENSE } from "./Data_LevelFlow.mjs";
import { FLOW_VILLAGE_STEALTH } from "./Data_LevelFlow.mjs";
import { FLOW_PREVIOUS_STREET_DEFENSE } from "./Data_LevelFlowAmbushBaseline.mjs";
import { SQUAD_SPLINE_PROFILES } from "../../Data_Tuning_SquadSpline.mjs";
import { FIRST_LEVEL_SQUAD_SPLINE_CONFIG } from "../../Data_FirstLevelSquadSplines.mjs";
import { ResolveSquadSplineTuning } from "../../Script_SquadSplinePcg.mjs";
import { HashString } from "../../Script_ProceduralGaze.mjs";
import { ResolveEncounterGroupSplineConfig, SampleSquadSplinePoint, SampleDeterministicGaze } from "../../Script_FirstLevelSquadSpline.mjs";

const stationaryGazeTuning = ResolveSquadSplineTuning(FIRST_LEVEL_SQUAD_SPLINE_CONFIG.stationaryGazeProfile);
const Smoothstep = (e0, e1, x) => {
  if (e1 <= e0) return x >= e1 ? 1 : 0;
  const t = Clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

export const ENCOUNTER_SCHEMA = "tengxian-encounter/2";
export const ENCOUNTER_BEHAVIORS = {
  advance: "沿路线推进", suppress: "定点压制", bounds: "掩体间跃进", flank: "绕侧包抄", escort: "跟车推进", withdraw: "撤离", guard: "驻守掩护",
};
export const ENCOUNTER_CINEMATICS = ["01a","01b","01c","01e","02a","02b","02c","02d","02e","02f","08f","09d","10g","11c","18g"];
const Area = (center, width = 5, depth = width) => ({ shape: "rect", center: [...center], size: [width, depth] });

export function CreateEncounterDocument(timeline, waves, options = {}) {
  const { id: docId = "FirstLevelEncounter", revision = "2026-11-27-camp-tactics-1" } = options;
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
      side: "enemy", target: ["winter","none"].includes(wave.target) ? wave.target : "player",
      area: Area(wave.source,...(wave.areaSize || [2.4,3])), route: structuredClone(wave.route),
      ...(wave.spawnOffsets ? {spawnOffsets: structuredClone(wave.spawnOffsets)} : {}),
      ...(wave.memberPlans ? {memberPlans: structuredClone(wave.memberPlans)} : {}),
      ...(wave.deployDelay ? {deployDelay: wave.deployDelay} : {}),
      ...(wave.reinforceAfterClear ? {reinforceAfterClear: true} : {}),
      ...(wave.standoffMetres ? {standoffMetres:wave.standoffMetres} : {}),
      ...(wave.spacingMetres ? {spacingMetres:wave.spacingMetres} : {}),
      ...(wave.coverWaitSeconds !== undefined ? {coverWaitSeconds:wave.coverWaitSeconds} : {}),
      ...(wave.suppressedBy ? {suppressedBy:[...wave.suppressedBy],suppressionStop:[...wave.suppressionStop]} : {}),
      ...(wave.weapon ? {weapon: wave.weapon} : {}),
      ...(wave.firingArea ? {firingArea: structuredClone(wave.firingArea)} : {}),
      ...(wave.engageOn ? {engageOn: wave.engageOn} : {}),
      ...(wave.fireCycle ? {fireCycle: structuredClone(wave.fireCycle)} : {}),
      ...(wave.afterRouteLookAt ? {afterRouteLookAt: [...wave.afterRouteLookAt]} : {}),
      ...(wave.withdrawAlongRoute ? {withdrawAlongRoute: true} : {}),
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
  Add("RearPursuit","③ 北坡下沟第二波","03g","03h",[20,33],[[20,33],[17,36],[14.5,40],[12,44],[9.5,50],[9.5,57],[13.5,58],[21.9,67.1],[25.5,79],[25.5,83.8],[29,83.8],[29,89],[30,91],[32.5,101],[34,117]],3,"enemy","advance","player",54);
  const pursuit=groups.at(-1);pursuit.interval=2.5;pursuit.maxAlive=3;triggers.at(-1).delay=36;pursuit.standoffMetres=16;pursuit.grenadeInterval=11;pursuit.behavior="bounds";
  Object.assign(pursuit,{suppressedBy:["DragGround","CrestWest","CampWestGun"],suppressionStop:[25.5,83.8],note:"北侧第二波绕过北沟工事；我军仍在阻击时守弯口沙包，不沿我军火线自杀式前进"});
  const escort=groups.find((group)=>group.id==="TankEscort");
  Object.assign(escort,{lifetime:182,speed:2.2,tankId:"tank1",grenadeInterval:12});
  Object.assign(triggers.find((trigger)=>trigger.id===escort.triggerId),{area:Area([86,225],8,8)});
  Add("TankRearScreen","后车行军护卫","06a","06f",[107,170],[[107,170],[105,196],[103,218],[101,249]],4,"enemy","escort","player",260);
  triggers.pop(); // Both vehicle escort groups share the player arrival trigger.
  Object.assign(groups.at(-1),{triggerId:escort.triggerId,tankId:"tank2",speed:2.2,grenadeInterval:14});
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
    if(["LaneGround","BendGround"].includes(id)) groups.at(-1).enabled=false;
  }
  Add("CrestWest","坡顶西侧接应","03g","04a",[27.5,128],[[27.5,128],[28.5,129]],2,"friend","guard","enemy",160);
  Add("CrestEast","坡顶东侧接应","03g","04a",[43,129],[[43,129],[43,129]],2,"friend","guard","enemy",160);
  const hasGengjiazhuang = !!(Find("09i") && Find("10b"));
  if (hasGengjiazhuang) {
    Add("VillageGun","北屋枪眼机枪组","08a","09i",[100,471.5],[[100,471.5]],3,"enemy","suppress","ramp",700);
    Add("VillageRifles","北屋与墙角守军","08a","09i",[104,471],[[104,471]],4,"enemy","guard","ramp",700);
    for(const group of groups.filter(entry=>["VillageGun","VillageRifles"].includes(entry.id))) group.engageOn="09e";
    Add("SearchYard","街坊家搜人组","09a","09d",[74,459],[[74,459]],4,"enemy","guard","none",300);
    Add("SearchNeighbor","隔壁搜人组","09a","09d",[61,448],[[61,448]],2,"enemy","guard","none",300);
    Add("GateGuard","门房守卫","09e","09f",[73,465.5],[[73,465.5]],1,"enemy","guard","none",40);
    Add("KitchenGuard","灶屋守卫","09a","09i",[94,479.3],[[94,479.3]],1,"enemy","guard","none",400);
    Add("TempleGun","土地庙机枪","10c","10e",[181,480],[[181,480]],2,"enemy","suppress","player",140);
    Add("MortarTeam","场院掷弹筒","10c","10e",[199,449],[[199,449]],2,"enemy","guard","none",140);
  }
  const formationNotes={
    GroundWest:"西翼先导步兵（含十一年式轻机枪基准火力），05A 后段先于战车沿西侧掩体两两交互跃进，清扫凹路西沿",
    GroundEast:"东翼先导步兵（含十一年式轻机枪基准火力），05A 后段先于战车沿东侧土埂残墙交互跃进，交叉压制凹路",
    TankReinforce:"头车焚毁后由后车步兵掩护反击：东翼轻机枪组定点压制，三人分路借残骸与东侧土埂交替跃进摸进",
  };
  for(const formation of FLOW_GROUND_FORMATIONS) {
    const group=groups.find(item=>item.id===formation.id);
    if(formation.areaCenter) group.area.center=[...formation.areaCenter];
    if(formation.center) group.area.center=[...formation.center];
    group.area.size=[...formation.areaSize];
    if(formation.route) group.route=structuredClone(formation.route);
    if(formation.areaCenter && group.route.length) group.route[0]=[...formation.areaCenter];
    if(formation.behavior) group.behavior=formation.behavior;
    if(formation.interval!==undefined) group.interval=formation.interval;
    if(formation.speed!==undefined) group.speed=formation.speed;
    if(formation.coverWaitSeconds!==undefined) group.coverWaitSeconds=formation.coverWaitSeconds;
    if(formation.weapon) group.weapon=formation.weapon;
    if(formation.engageOn) group.engageOn=formation.engageOn;
    if(formation.fireCycle) group.fireCycle=structuredClone(formation.fireCycle);
    if(formation.firingArea) group.firingArea=structuredClone(formation.firingArea);
    if(formationNotes[formation.id]) group.note=formationNotes[formation.id];
    if(formation.note) group.note=formation.note;
    if(formation.triggerDelay!==undefined) {
      const trigger=triggers.find(item=>item.id===group.triggerId);
      if(trigger) trigger.delay=formation.triggerDelay;
    }
    group.spawnOffsets=structuredClone(formation.offsets);
    if(formation.holdUntil) group.holdUntil=structuredClone(formation.holdUntil);
    group.memberPlans=formation.offsets.map((offset,index)=>({
      delay:formation.delays[index],
      route:structuredClone(formation.routes?.[index]
        || (formation.route||group.route).slice(1).map(point=>point.map((value,axis)=>value+offset[axis]))),
    }));
    if(formation.holdPoint) for(const [index,plan] of group.memberPlans.entries()) {
      plan.route.unshift(formation.holdPoint.map((value,axis)=>value+formation.offsets[index][axis]));
    }
  }
  // Stage the convoy behind the northern berm before the player hears it.
  // Both escort squads are already marching when the tanks enter pursuit.
  const approachLead=Find("06a").start-Find("05a").start;
  for(const [id,center] of [["TankEscort",[137,53]],["TankRearScreen",[152,26]]]) {
    const group=groups.find(entry=>entry.id===id);
    const approach=FLOW_GROUND.road.filter(point=>point[1]>=44 && point[1]<=186);
    if(id==="TankEscort") approach.shift();
    group.beat="05a";
    group.area.center=center;
    group.route=[center,...approach,...group.route.slice(1)];
    group.memberPlans=group.spawnOffsets.map((offset,index)=>({
      delay:0,
      route:[...approach.map(point=>[point[0]+offset[0],point[1]]),...group.memberPlans[index].route.filter(point=>point[1]>186)],
    }));
    group.interval=0;
    group.lifetime+=approachLead;
    group.note=id==="TankEscort"
      ? "05A 在北侧土垄后随头车隐蔽出发，双翼梯次护卫、接战前静默警戒，06A 起交替短停伴随推进"
      : "05A 随二号车在纵深后方跟进（含轻机枪基准火力），双翼散开掩护侧后，06A 起与头车交替短停推进";
  }
  Object.assign(triggers.find(trigger=>trigger.id===escort.triggerId),{
    beat:"05a",area:Area(Find("05a").p[0],8,8),
  });
  for(const reinforcement of FLOW_FRIEND_REINFORCEMENTS) {
    const group=groups.find(entry=>entry.id===reinforcement.id);
    Object.assign(group,{beat:"03f",area:Area(reinforcement.center,3,3),route:structuredClone(reinforcement.route),
      interval:0,lifetime:800,speed:3.2,behavior:"advance",
      deployDelay:Find("03g").start+4+reinforcement.delay-Find("03f").start,
      note:"集结处待命；03G 班长压北面时闻枪声接应，分三路前出，到位后阻击"});
    Object.assign(triggers.find(entry=>entry.id===group.triggerId),{beat:"03f"});
  }
  if (hasGengjiazhuang) {
    for(const staging of FLOW_STREET_DEFENSE.groups) {
      const group=groups.find(entry=>entry.id===staging.id);
      if (!group) continue;
      Object.assign(group,structuredClone(staging));
      Object.assign(triggers.find(entry=>entry.id===group.triggerId),{
        beat:group.beat,endBeat:group.endBeat,mode:"time",delay:0,
      });
    }
    const patrol = structuredClone(FLOW_VILLAGE_STEALTH.patrol);
    patrol.triggerId = "Trigger_TempleSearch";
    groups.push(patrol);
    triggers.push({id:patrol.triggerId,label:patrol.label,beat:patrol.beat,endBeat:patrol.endBeat,
      mode:"time",delay:0,area:structuredClone(patrol.area)});
    for (const group of groups.filter(group=>["VillageGun","VillageRifles"].includes(group.id))) group.engageOn="09j";
  }
  for(const group of groups) {
    if(["BeishaheGunWest","BeishaheGunEast","RailBridgeGun","MergedHouseGun","MergedBridgeGun"].includes(group.id)) group.weapon="machineGun";
  }
  return {schema:ENCOUNTER_SCHEMA,id:docId,revision,triggers,groups,annotations:[]};
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
    Require(group.afterRouteLookAt===undefined || CheckPoint(group.afterRouteLookAt),"路线结束朝向无效");
    Require(group.spawnOffsets===undefined || Array.isArray(group.spawnOffsets) && group.spawnOffsets.length>0 && group.spawnOffsets.length<=40 && group.spawnOffsets.every(CheckPoint), "分散生成点无效");
    Require(group.memberPlans===undefined || Array.isArray(group.memberPlans) && group.memberPlans.length>0 && group.memberPlans.length<=40
      && group.memberPlans.every(plan=>plan && Number.isFinite(plan.delay) && plan.delay>=0 && plan.delay<=60
        && (plan.lifetime===undefined || Number.isFinite(plan.lifetime) && plan.lifetime>=2 && plan.lifetime<=2000)
        && Array.isArray(plan.route) && plan.route.length>0 && plan.route.length<=100 && plan.route.every(CheckPoint)
        && (plan.waitSeconds===undefined || Array.isArray(plan.waitSeconds) && plan.waitSeconds.length===plan.route.length+1
          && plan.waitSeconds.every(seconds=>Number.isFinite(seconds)&&seconds>=0&&seconds<=60))), "单兵推进计划无效");
    Require(group.deployDelay===undefined || Number.isFinite(group.deployDelay) && group.deployDelay>=0 && group.deployDelay<=60, "隐蔽集结时长无效");
    Require(group.standoffMetres===undefined || Number.isFinite(group.standoffMetres) && group.standoffMetres>=0 && group.standoffMetres<=100, "追击距离无效");
    Require(group.spacingMetres===undefined || Number.isFinite(group.spacingMetres) && group.spacingMetres>=0 && group.spacingMetres<=10, "单兵间距无效");
    Require(group.coverWaitSeconds===undefined || Number.isFinite(group.coverWaitSeconds) && group.coverWaitSeconds>=0 && group.coverWaitSeconds<=60, "掩护停留时长无效");
    Require(group.firingArea===undefined || CheckArea(group.firingArea), "射击区域无效");
    Require(group.withdrawAlongRoute===undefined || typeof group.withdrawAlongRoute==="boolean", "沿原路撤离开关无效");
    Require(group.fireCycle===undefined || group.fireCycle && Number.isFinite(group.fireCycle.seconds)
      && group.fireCycle.seconds>=1 && group.fireCycle.seconds<=120 && Number.isFinite(group.fireCycle.active)
      && group.fireCycle.active>0 && group.fireCycle.active<=group.fireCycle.seconds
      && Number.isFinite(group.fireCycle.offset) && group.fireCycle.offset>=0, "射击与换弹节奏无效");
    if(group.suppressedBy!==undefined) {
      Require(group.side==="enemy" && Array.isArray(group.suppressedBy) && group.suppressedBy.length>0
        && group.suppressedBy.every(id=>typeof id==="string" && id.length>0 && !input.groups.some(defender=>defender.id===id && defender.side!=="friend")), "阻击方须引用友军组");
      Require(CheckPoint(group.suppressionStop) && !group.memberPlans, "受阻停步点须为有效世界坐标，使用共用路线");
    }
    Require(group.holdUntil===undefined || group.behavior==="bounds" && group.memberPlans && group.spawnOffsets
      && timeline.some(beat=>beat.id===group.holdUntil?.beat) && Number.isFinite(group.holdUntil.fraction)
      && group.holdUntil.fraction>=0 && group.holdUntil.fraction<=1
      && (group.holdUntil.waypoint===undefined || Number.isInteger(group.holdUntil.waypoint) && group.holdUntil.waypoint>=1 && group.holdUntil.waypoint<=100), "阻击停留时刻无效");
    Require(group.engageOn===undefined||timeline.some(beat=>beat.id===group.engageOn),"接战拍号无效");
    Require(group.tankId===undefined||["", "tank1","tank2"].includes(group.tankId),"跟随战车无效");
    Require(group.weapon===undefined||["rifle","machineGun"].includes(group.weapon),"武器配置无效");
    Require(group.splineProfile===undefined||Object.hasOwn(SQUAD_SPLINE_PROFILES,group.splineProfile),"小队行进预设无效");
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
    if(annotation.view) Require(CheckPoint(annotation.view.center)&&Number.isFinite(annotation.view.scale)&&annotation.view.scale>=0.1&&annotation.view.scale<=FLOW_ZOOM.maxScale,"标注视图无效");
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
      lives.push({born,fall:born+(group.memberPlans?.[batchSlot]?.lifetime ?? group.lifetime)});
    }
    const holdBeat=beats.get(group.holdUntil?.beat);
    const compiled={...group,start,end,lives,engageAt:group.engageOn?beats.get(group.engageOn).start:-Infinity,holdUntilTime:holdBeat?holdBeat.start+holdBeat.duration*group.holdUntil.fraction:null};
    return compiled;
  });
  for(const group of groups) {
    if(group.standoffMetres && !(group.behavior==="bounds" && group.memberPlans)) coverTracks.set(group,BuildPursuitTracks(group,route,groups));
    else if(group.behavior==="bounds") coverTracks.set(group,BuildCoverTracks(group,route));
  }
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

function EscortRouteProgress(path,point) {
  // The authored convoy advances south. Use its longitudinal position so
  // closest-point projection cannot jump across the inside of a road bend.
  if(path.some((entry,index)=>index>0 && entry[1]<=path[index-1][1])) return RouteProjection(path,point);
  let distance=0;
  for(let index=1;index<path.length;index++) {
    const a=path[index-1],b=path[index];
    distance+=Distance(a,b)*Clamp((point[1]-a[1])/(b[1]-a[1]),0,1);
  }
  return distance;
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
function BuildPursuitTracks(group, playerRoute, groups) {
  return group.lives.map((life, index) => {
    const path = GroupPath(group, index);
    const total = path.slice(1).reduce((sum, point, entry) => sum + Distance(path[entry], point), 0);
    const track = [[life.born, 0]];
    let distance = 0;
    const ready = life.born + (group.deployDelay || 0) + (group.memberPlans?.[index % group.maxAlive]?.delay || 0);
    for (let time = life.born + 0.25; time <= Math.min(life.fall, group.end); time += 0.25) {
      const suppressed=group.suppressedBy?.some(id=>{
        const defender=groups.find(entry=>entry.id===id);
        return defender?.enabled && defender.start!==null && time<defender.end && defender.lives.some((life,index)=>
          time>=life.born && time<life.fall && GroupActor(defender,index,time,[]).firing);
      });
      const stop=suppressed?RouteProjection(path,group.suppressionStop):total;
      const next = Math.max(distance,Math.min(stop, distance + group.speed * 0.25));
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
      const holdWaypoint=group.holdUntil?.waypoint??1;
      const held=group.holdUntilTime!==null && time<group.holdUntilTime && state.next>holdWaypoint;
      if(state.next<state.path.length && time>=state.waitUntil && covering && pairReady && clear && !held) {
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

function WaitingRouteMovement(path, waits, age, speed) {
  let elapsed = age;
  let distance = 0;
  for (let index = 0; index < path.length; index++) {
    if (elapsed < waits[index]) return {distance,moving:false};
    elapsed -= waits[index];
    if (index === path.length - 1) return {distance,moving:false};
    const length = Distance(path[index],path[index+1]);
    if (elapsed < length/speed) return {distance:distance+elapsed*speed,moving:true};
    elapsed -= length/speed;
    distance += length;
  }
  return {distance,moving:false};
}

function GroupActor(group,index,time,coreActors) {
  const life=group.lives[index];
  const survivesWithdrawal=group.withdrawAlongRoute && life.fall>=group.end;
  const dead=!survivesWithdrawal && time>=life.fall;
  const slot=index%group.maxAlive,offset=group.spawnOffsets?.[slot];
  const readyAt=life.born+(group.deployDelay||0)+(group.memberPlans?.[slot]?.delay||0);
  const sampleTime=group.withdrawAlongRoute?Math.min(time,group.end):time;
  const age=Math.max(0,Math.min(sampleTime,life.fall)-readyAt);
  const path=GroupPath(group,index);
  const lengths=path.slice(1).map((point,index)=>Distance(path[index],point));
  const total=lengths.reduce((sum,length)=>sum+length,0);
  const stationary=["suppress","guard"].includes(group.behavior);
  const waits = group.memberPlans?.[slot]?.waitSeconds;
  const movement=group.standoffMetres||group.behavior==="bounds"?CoverMovement(group,index,Math.min(sampleTime,life.fall))
    : waits ? WaitingRouteMovement(path,waits,age,group.speed) : {distance:age*group.speed,moving:!stationary&&age*group.speed<total};
  let distance=stationary?0:Math.min(total,movement.distance);
  const tank=coreActors.find((actor)=>actor.id===(group.tankId||"tank1"));
  if(group.behavior==="escort"&&tank) {
    const progress=EscortRouteProgress(path,[tank.p[0]+(offset?.[0]||0),tank.p[1]]);
    const setback=offset&&offset[1]<0?-offset[1]:(group.memberPlans?5+slot*3.2:3+slot*1.1);
    const limit=Math.max(0,progress-setback);
    if(distance>=total-0.05) movement.moving=false;
    else if(distance>=limit-0.05) movement.moving=tank.moving&&limit<total-0.05;
    distance=Math.min(distance,limit);
  }
  if(group.withdrawAlongRoute && time>=group.end && !dead) distance=Math.max(0,distance-(time-group.end)*group.speed);
  let position=SampleRoute(path,total?distance/total:0);
  const slots=Math.min(group.count,group.maxAlive);
  const columns=Math.ceil(Math.sqrt(slots)),rows=Math.ceil(slots/columns);
  const spread=offset?[0,0]:group.area.shape==="circle"
    ? [Math.cos(slot*2.39996)*Math.sqrt((slot+0.5)/slots)*group.area.size[0]*0.4,Math.sin(slot*2.39996)*Math.sqrt((slot+0.5)/slots)*group.area.size[0]*0.4]
    : [((slot%columns+0.5)/columns-0.5)*group.area.size[0]*0.8,((Math.floor(slot/columns)+0.5)/rows-0.5)*group.area.size[1]*0.8];
  let pose=dead?"dead":time<readyAt?"kneel":movement.moving?"run":group.behavior==="withdraw"?"stand":"shoot";
  if(time<group.engageAt && pose==="shoot") pose="kneel";
  if(group.withdrawAlongRoute && time>=group.end && !dead) pose="run";
  const splineCfg = !stationary && total >= 4.0 ? ResolveEncounterGroupSplineConfig(group) : null;
  let pcg = null;
  if (splineCfg) {
    const memberRole = slot === 0 ? (group.weapon === "machineGun" ? "mgGunner" : "leader") : "rifleman";
    pcg = SampleSquadSplinePoint({
      squadKey: group.id,
      config: splineCfg,
      memberIndex: slot,
      memberCount: Math.max(1, slots),
      role: memberRole,
      route: path,
      distance,
      totalLength: total,
      time,
      moving: !dead && (movement.moving || (group.withdrawAlongRoute && time >= group.end && distance > 0)),
      firing: false,
      pose,
      noAdvanceBeyondDistance: !!group.standoffMetres || group.behavior === "escort" || group.behavior === "bounds",
    });
  }
  const hasSpatialPcg = !!(pcg && ((splineCfg.maxOffsetM ?? 0) > 0.01 || (splineCfg.paceJitterM ?? 0) > 0.01 || (splineCfg.splineBlend ?? 0) > 0.01));
  if (hasSpatialPcg) {
    const headM = Math.max(splineCfg.featherStartM ?? 2.0, splineCfg.concealmentHeadM ?? 0);
    const tailM = splineCfg.featherEndM ?? 2.4;
    let midW = Smoothstep(0.15, Math.min(headM, total * 0.35), distance)
      * (1 - Smoothstep(Math.max(0, total - Math.min(tailM, total * 0.35)), Math.max(0.01, total - 0.08), distance));
    if (group.suppressionStop) {
      const stopDist = RouteProjection(path, group.suppressionStop);
      midW *= Smoothstep(0.3, 3.5, Math.abs(distance - stopDist));
    }
    const baseP = position;
    const blendedX = Lerp(baseP[0], pcg.p[0], midW);
    const blendedZ = Lerp(baseP[1], pcg.p[1], midW);
    const spreadW = (splineCfg.maxOffsetM ?? 0) > 0.01 ? (1 - midW) : 1;
    position = [blendedX + spread[0] * spreadW, blendedZ + spread[1] * spreadW];
  } else {
    position=[position[0]+spread[0],position[1]+spread[1]];
  }
  const inFiringArea=!group.firingArea || InsideArea(position,group.firingArea);
  const firingWindow=!group.fireCycle || (time-life.born+group.fireCycle.offset+slot*0.7)%group.fireCycle.seconds<group.fireCycle.active;
  const firing=time<group.end && group.behavior!=="withdraw" && group.target!=="none" && pose==="shoot" && inFiringArea && firingWindow;
  if(pose==="shoot" && !firing && group.fireCycle) pose="kneel";
  const heading=group.afterRouteLookAt&&!movement.moving&&distance>=total-0.001
    ?Math.atan2(group.afterRouteLookAt[0]-position[0],-(group.afterRouteLookAt[1]-position[1])):undefined;
  let gazeExtra = null;
  if (!dead && !firing) {
    if (pcg) {
      gazeExtra = {
        marchHeading: pcg.heading,
        gazeYaw: pcg.gazeYaw,
        gazePitch: pcg.gazePitch,
        gazeKind: pcg.gazeKind,
        splineProfile: pcg.splineProfile,
      };
    } else if (stationary) {
      const g = SampleDeterministicGaze({
        seed: HashString(`${group.id}:guard:${slot}`),
        time,
        tuning: stationaryGazeTuning,
        role: slot === 0 ? "leader" : "rifleman",
        moving: false,
        firing: false,
        pose,
      });
      gazeExtra = {
        gazeYaw: g.gazeYaw,
        gazePitch: g.gazePitch,
        gazeKind: g.gazeKind,
        splineProfile: FIRST_LEVEL_SQUAD_SPLINE_CONFIG.stationaryGazeProfile,
      };
    }
  }
  return {id:`${group.id}_${index}`,name:`${group.label} ${index+1}`,side:group.side,kind:"person",p:position,pose,heading,
    groupId:group.id,wave:group.id,target:group.target,born:life.born,fall:life.fall,
    ...(group.withdrawAlongRoute ? {withdrawn:time>=group.end && !dead && distance<=0} : {}),
    ...(gazeExtra || {}),
    heavy:group.weapon==="machineGun"&&index%group.maxAlive===0||group.target==="ramp",firing};
}

export function SampleEncounters(plan,time,coreActors,sampleCore=()=>coreActors) {
  const actors=[],effects=[];
  const player=coreActors.find((actor)=>actor.id==="player");
  for(const group of plan.groups) {
    if(group.start===null||!group.enabled||time<group.start||!group.withdrawAlongRoute&&time>group.end+8) continue;
    for(let index=0;index<group.lives.length;index++) {
      const life=group.lives[index];
      if(time<life.born||time>life.fall+8 && !(group.withdrawAlongRoute && life.fall>=group.end)) continue;
      const actor=GroupActor(group,index,time,coreActors);
      if(!actor.withdrawn) actors.push(actor);
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
  const campGuards=coreActors.filter(actor=>actor.coveringEvacuation && actor.firing);
  for(const actor of [...actors,...rearGuards].filter((item)=>item.firing)) {
    const casualty=actor.groupId==="Corner" && rearGuards.find(guard=>time>=guard.fall-2 && time<=guard.fall+0.3);
    const suppression=plan.groups.find(group=>group.id===actor.groupId)?.suppressedBy;
    const blockingGuards=suppression?actors.filter(guard=>guard.side==="friend" && guard.firing && suppression.includes(guard.groupId)):[];
    const coveringTarget=actor.side==="enemy" && actor.target==="player" && [...campGuards,...blockingGuards].reduce((nearest,guard)=>
      !nearest||Distance(actor.p,guard.p)<Distance(actor.p,nearest.p)?guard:nearest,null);
    const preferPlayer=actor.side==="enemy" && actor.target==="player" && player && coveringTarget
      && player.pose==="shoot" && Distance(actor.p,player.p)<16 && Distance(actor.p,player.p)<Distance(actor.p,coveringTarget.p);
    const target=actor.target==="enemy"?enemies.reduce((nearest,enemy)=>!nearest||Distance(actor.p,enemy.p)<Distance(actor.p,nearest.p)?enemy:nearest,null)
      :actor.target==="ramp"?{p:[100,384]}:casualty||(preferPlayer?player:coveringTarget)||(coreActors.find((item)=>item.id===actor.target)??player);
    if(target&&Distance(actor.p,target.p)<180) effects.push({kind:"fire",a:actor.p,b:target.p,side:actor.side,sourceId:actor.id,targetId:target.id,groupId:actor.groupId,heavy:actor.heavy,phase:(time*2.3+actor.p[0])%1});
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
    const matchedRoute=JSON.stringify(current.route)===JSON.stringify(next.route)
      || (formation.previousRoute && JSON.stringify(current.route)===JSON.stringify(formation.previousRoute));
    const previousArea={...next.area,size:formation.previousAreaSize};
    const legacyArea=formation.previousCenter?{...next.area,center:formation.previousCenter,size:formation.previousAreaSize}:null;
    const matchedArea=JSON.stringify(current.area)===JSON.stringify(previousArea)
      || (legacyArea && JSON.stringify(current.area)===JSON.stringify(legacyArea));
    if(!matchedRoute || !matchedArea) continue;
    current.area=structuredClone(next.area);
    current.route=structuredClone(next.route);
    current.spawnOffsets=structuredClone(next.spawnOffsets);
    current.memberPlans=structuredClone(next.memberPlans);
    if(next.holdUntil) current.holdUntil=structuredClone(next.holdUntil);
    for(const key of ["coverWaitSeconds","firingArea","weapon"]) {
      if(current[key]===undefined && next[key]!==undefined) current[key]=structuredClone(next[key]);
    }
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
  return UpgradeCampCover(value,defaults);
}

function UpgradeAmbush(value,defaults) {
  for(const collection of ["groups","triggers"]) {
    for(const previous of FLOW_PREVIOUS_AMBUSH[collection]) {
      const current=value[collection].find(entry=>entry.id===previous.id);
      const next=defaults[collection].find(entry=>entry.id===previous.id);
      if(!current) continue;
      if(!next) {
        if(JSON.stringify(current)===JSON.stringify(previous)) value[collection]=value[collection].filter(entry=>entry!==current);
        continue;
      }
      const routeEdited=JSON.stringify(current.route)!==JSON.stringify(previous.route);
      for(const [key,entry] of Object.entries(next)) {
        if(routeEdited&&["area","route","memberPlans","spawnOffsets"].includes(key)) continue;
        if(JSON.stringify(current[key])===JSON.stringify(previous[key])) current[key]=structuredClone(entry);
      }
    }
  }
  const triggerIds=new Set(value.groups.map(group=>group.triggerId));
  for(const previous of FLOW_PREVIOUS_AMBUSH.triggers) {
    if(!defaults.triggers.some(trigger=>trigger.id===previous.id)&&triggerIds.has(previous.id)
      &&!value.triggers.some(trigger=>trigger.id===previous.id)) value.triggers.push(structuredClone(previous));
  }
  value.revision=defaults.revision;
  return value;
}

function UpgradeCampCover(value,defaults) {
  for(const formation of FLOW_GROUND_FORMATIONS.filter(entry=>entry.holdUntil)) {
    const current=value.groups.find(group=>group.id===formation.id),next=defaults.groups.find(group=>group.id===formation.id);
    if(!current || !next) continue;
    const previousPlans=next.memberPlans.map(plan=>({...plan,route:plan.route.slice(1)}));
    if(JSON.stringify(current.memberPlans)!==JSON.stringify(previousPlans)
      || JSON.stringify(current.route)!==JSON.stringify(next.route)
      || JSON.stringify(current.spawnOffsets)!==JSON.stringify(next.spawnOffsets)) continue;
    current.memberPlans=structuredClone(next.memberPlans);
    if(current.holdUntil===undefined) current.holdUntil=structuredClone(next.holdUntil);
  }
  value.revision=defaults.revision;
  return value;
}

function UpgradeLegacyEncounterDocument(input,defaults) {
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

function UpgradeOpeningDefense(input,defaults) {
  const value=structuredClone(input),current=value.groups.find(group=>group.id==="Fork");
  const next=defaults.groups.find(group=>group.id==="Fork");
  const previousOffsets=[[2.3,-9.9],[10.3,-3.5],[-10.6,-5],[5.5,3.8],[-8.4,1.8]];
  if(current && next && JSON.stringify(current.route)===JSON.stringify(next.route)
    && JSON.stringify(current.area)===JSON.stringify(next.area)
    && JSON.stringify(current.spawnOffsets)===JSON.stringify(previousOffsets)) {
    const previousPlans=structuredClone(next.memberPlans);
    previousPlans[2].route=[[64.4,47.8],[62,53],[55,60],[53.5,62.8]];
    previousPlans[4].route=[[66.6,51.5],[62,55.5],[61,60.5],[60.8,65.8],[60,66],[51.5,66]];
    if(JSON.stringify(current.memberPlans)===JSON.stringify(previousPlans)) {
      current.spawnOffsets=structuredClone(next.spawnOffsets);
      current.memberPlans=structuredClone(next.memberPlans);
    }
  }
  value.revision=defaults.revision;
  return value;
}

function UpgradeExistingEncounterDocument(input,defaults) {
  if(input.revision===defaults.revision) return input;
  if(input.revision==="2026-11-14-double-tank-destruction-1") return UpgradeVillageEngagement(structuredClone(input),defaults);
  if(input.revision==="2026-11-14-tank-approach-1") return UpgradeTankDestruction(structuredClone(input),defaults);
  const upgraded=UpgradeLegacyEncounterDocument(input,defaults);
  if(upgraded===input && ![FLOW_PREVIOUS_AMBUSH.revision,FLOW_PREVIOUS_FRONT_DEFENSE.revision,"2026-11-14-front-defense-1","2026-11-14-opening-defense-1","2026-11-14-friend-reinforcements-1","2026-11-14-camp-cover-1"].includes(input.revision)) return input;
  const value=structuredClone(upgraded);
  for(const reinforcement of FLOW_FRIEND_REINFORCEMENTS) {
    const current=value.groups.find(entry=>entry.id===reinforcement.id);
    const next=defaults.groups.find(entry=>entry.id===reinforcement.id);
    const previous=reinforcement.previous;
    if(!current || !next || current.memberPlans || current.spawnOffsets || current.deployDelay!==undefined
      || JSON.stringify(current.route)!==JSON.stringify(previous.route)
      || JSON.stringify(current.area)!==JSON.stringify(previous.area)) continue;
    for(const [key,entry] of Object.entries(previous)) {
      if(JSON.stringify(current[key])===JSON.stringify(entry)) current[key]=structuredClone(next[key]);
    }
    current.deployDelay=next.deployDelay;
    const trigger=value.triggers.find(entry=>entry.id===current.triggerId);
    if(trigger?.mode==="time" && trigger.delay===0 && trigger.beat===previous.beat) trigger.beat=next.beat;
  }
  for(const previous of FLOW_PREVIOUS_FRONT_DEFENSE.groups) {
    const current=value.groups.find(group=>group.id===previous.id),next=defaults.groups.find(group=>group.id===previous.id);
    if(!current || !next || current.memberPlans || JSON.stringify(current.route)!==JSON.stringify(previous.route)) continue;
    for(const [key,entry] of Object.entries(next)) {
      if(JSON.stringify(current[key])===JSON.stringify(previous[key])) current[key]=structuredClone(entry);
    }
  }
  return UpgradeTankDestruction(UpgradeTankApproach(UpgradeOpeningDefense(UpgradeAmbush(UpgradeCampCover(value,defaults),defaults),defaults),defaults),defaults);
}

function UpgradeMergedEastFlank(document, defaults) {
  const replaceGroupIfUntouched = (id, legacyRoutes, legacyMeta = {}) => {
    const next = defaults.groups.find(group => group.id === id);
    const group = document.groups.find(group => group.id === id);
    if (!next || !group || group.spawnOffsets || group.memberPlans) return;
    const routeJson = JSON.stringify(group.route);
    const matchedRoute = legacyRoutes.find(route => JSON.stringify(route) === routeJson);
    if (!matchedRoute || JSON.stringify(group.area.center) !== JSON.stringify(matchedRoute[0])) return;
    const idx = document.groups.indexOf(group);
    document.groups[idx] = structuredClone(next);
    const nextTrigger = defaults.triggers.find(trigger => trigger.id === next.triggerId);
    const trigger = document.triggers.find(trigger => trigger.id === group.triggerId);
    if (nextTrigger && trigger && trigger.mode === "time"
      && (!legacyMeta.triggerBeats || legacyMeta.triggerBeats.includes(trigger.beat))
      && (!legacyMeta.triggerDelays || legacyMeta.triggerDelays.includes(trigger.delay))) {
      Object.assign(trigger, structuredClone(nextTrigger));
    }
  };

  replaceGroupIfUntouched("MergedWestSearch", [
    [[68, 516], [80, 516], [84, 516], [76, 516], [68, 516]],
    [[67.75, 499.2], [67.03, 510.2], [66.65, 516], [75, 516], [84, 516], [75, 516], [66, 516], [67.03, 510.2], [67.75, 499.2]],
  ], { triggerBeats: ["09a"], triggerDelays: [30, 34] });

  replaceGroupIfUntouched("MergedHouseGun", [
    [[256, 573], [216, 572], [185, 569], [157, 564], [140, 560], [131.6, 560], [131.6, 562.8], [131.6, 571.5], [131.6, 573.1], [131.6, 575.2]],
  ], { triggerBeats: ["08c"], triggerDelays: [14] });

  replaceGroupIfUntouched("MergedKitchenGuard", [
    [[256, 573], [216, 572], [185, 569], [157, 564], [140, 560], [131.6, 560], [131.6, 562.8], [131.6, 564.8], [127.5, 565.0], [127.5, 566.2], [127.5, 568.8]],
  ], { triggerBeats: ["08c"], triggerDelays: [16] });

  for (const addedId of ["MergedMainStFlank", "MergedYardAtrocity", "MergedYardStraggler"]) {
    const nextGroup = defaults.groups.find(group => group.id === addedId);
    if (nextGroup && !document.groups.some(group => group.id === addedId)) {
      document.groups.push(structuredClone(nextGroup));
      const nextTrigger = defaults.triggers.find(trigger => trigger.id === nextGroup.triggerId);
      if (nextTrigger && !document.triggers.some(trigger => trigger.id === nextTrigger.id)) {
        document.triggers.push(structuredClone(nextTrigger));
      }
    }
  }
}

function UpgradeMergedBoards(document, defaults) {
  const next = defaults.groups.find(group => group.id === "MergedBoards");
  const group = document.groups.find(group => group.id === next?.id);
  if (!group || !next) return;
  if (group.endBeat === "08d" && group.lifetime === 54) {
    group.endBeat = next.endBeat;
    group.lifetime = next.lifetime;
    if (group.lastFall === 62) group.lastFall = next.lastFall;
    const trigger = document.triggers.find(t => t.id === group.triggerId);
    if (trigger?.id === next.triggerId && trigger.endBeat === "08d") {
      trigger.endBeat = defaults.triggers.find(t => t.id === next.triggerId).endBeat;
    }
  }
}

function UpgradeInfantryTankTactics(value, defaults) {
  const spatialKeys = ["area", "route", "spawnOffsets", "memberPlans"];
  const tacticKeys = [...spatialKeys, "behavior", "weapon", "engageOn", "fireCycle", "interval", "coverWaitSeconds", "note"];
  for (const previous of FLOW_PREVIOUS_INFANTRY_TANK.groups) {
    const current = value.groups.find(group => group.id === previous.id);
    const next = defaults.groups.find(group => group.id === previous.id);
    if (!current || !next) continue;
    const spatialEdited = spatialKeys.some(key => JSON.stringify(current[key]) !== JSON.stringify(previous[key]));
    for (const key of tacticKeys) {
      if (spatialEdited && [...spatialKeys, "behavior", "interval", "coverWaitSeconds"].includes(key)) continue;
      if (JSON.stringify(current[key]) === JSON.stringify(previous[key])) {
        if (next[key] === undefined) delete current[key];
        else current[key] = structuredClone(next[key]);
      }
    }
  }
  value.revision = defaults.revision;
  return value;
}

export function UpgradeEncounterDocument(input,defaults) {
  if(defaults.id!=="FirstLevelEncounter") {
    const cloned=structuredClone(input);
    const eastFlankRevisions = ["2026-11-22-beishahe-merged-1", "2026-11-25-west-search-cover-1"];
    const boardsLegacyRevisions = [...eastFlankRevisions, "2026-11-26-east-flank-plan-a-1"];
    const infantryTankLegacyRevisions = [...boardsLegacyRevisions, "2026-11-26-merged-boards-clear-1"];
    if (input.id === "L1_BeishaheMerged" && input.id === defaults.id && input.revision !== defaults.revision) {
      if (eastFlankRevisions.includes(input.revision)) UpgradeMergedEastFlank(cloned, defaults);
      if (boardsLegacyRevisions.includes(input.revision)) UpgradeMergedBoards(cloned, defaults);
      if (infantryTankLegacyRevisions.includes(input.revision)) {
        UpgradeCampFromBaseline(cloned, defaults, FLOW_PREVIOUS_CAMP_SCATTER);
        UpgradeInfantryTankTactics(cloned, defaults);
      } else if (input.revision === FLOW_PREVIOUS_CAMP_COMBINED.revision) {
        UpgradeCampFromBaseline(cloned, defaults, FLOW_PREVIOUS_CAMP_COMBINED);
      }
    }
    cloned.id=defaults.id;
    cloned.revision=defaults.revision;
    return cloned;
  }
  if(input.revision===defaults.revision) return input;
  if(input.revision===FLOW_PREVIOUS_CAMP_COMBINED.revision) {
    return UpgradeCampFromBaseline(structuredClone(input),defaults,FLOW_PREVIOUS_CAMP_COMBINED);
  }
  if(input.revision===FLOW_PREVIOUS_CAMP_SCATTER.revision) {
    return UpgradeInfantryTankTactics(UpgradeCampFromBaseline(structuredClone(input),defaults,FLOW_PREVIOUS_CAMP_SCATTER),defaults);
  }
  const value=UpgradePriorBeishaheDocument(input,defaults);
  if(value===input) return input;
  const upgraded=structuredClone(value);
  const addedGroups=defaults.groups.filter(group=>Number(group.beat.slice(0,2))>=11);
  for(const group of addedGroups) if(!upgraded.groups.some(entry=>entry.id===group.id)) upgraded.groups.push(structuredClone(group));
  const triggerIds=new Set(addedGroups.map(group=>group.triggerId));
  for(const trigger of defaults.triggers.filter(entry=>triggerIds.has(entry.id))) {
    if(!upgraded.triggers.some(entry=>entry.id===trigger.id)) upgraded.triggers.push(structuredClone(trigger));
  }
  return UpgradeInfantryTankTactics(UpgradeCampFromBaseline(upgraded,defaults,FLOW_PREVIOUS_CAMP_SCATTER),defaults);
}

function UpgradePriorBeishaheDocument(input,defaults) {
  if(input.revision===defaults.revision) return input;
  if(input.revision==="2026-11-17-camp-scatter-1") return UpgradeCampFromBaseline(structuredClone(input),defaults,FLOW_PREVIOUS_CAMP_SCATTER);
  if(input.revision===FLOW_PREVIOUS_CAMP_ALIGNED.revision) return UpgradeCampFromBaseline(structuredClone(input),defaults,FLOW_PREVIOUS_CAMP_ALIGNED);
  const upgraded=input.revision===FLOW_PREVIOUS_CAMP_COVER.revision
    ? structuredClone(input) : UpgradeTempleEncounterDocument(input,defaults);
  if(upgraded===input) return input;
  return UpgradeCampFromBaseline(UpgradeCampFromBaseline(upgraded,defaults,FLOW_PREVIOUS_CAMP_COVER),defaults,FLOW_PREVIOUS_CAMP_ALIGNED);
}

// Untouched prior camp flank defaults move to the concealed-origin tactical layout.
// Edited routes, delays, counts, switches, custom areas and deleted groups stay as authored.
function UpgradeCampFromBaseline(value,defaults,baseline) {
  for(const previous of baseline.groups) {
    const current=value.groups.find(group=>group.id===previous.id);
    const next=defaults.groups.find(group=>group.id===previous.id);
    if(!current || !next || ["area","route","spawnOffsets"].some(key=>JSON.stringify(current[key])!==JSON.stringify(previous[key]))) continue;
    let allRoutesUntouched=(current.memberPlans?.length||0)===previous.memberPlans.length;
    for(const [index,plan] of (current.memberPlans||[]).entries()) {
      const prevPlan=previous.memberPlans[index],nextPlan=next.memberPlans[index];
      if(!prevPlan || !nextPlan) {allRoutesUntouched=false;continue;}
      if(JSON.stringify(plan.route)===JSON.stringify(prevPlan.route)) {
        plan.route=structuredClone(nextPlan.route);
        if(plan.delay===prevPlan.delay) plan.delay=nextPlan.delay;
      } else {
        allRoutesUntouched=false;
      }
    }
    if(allRoutesUntouched) {
      current.area=structuredClone(next.area);
      current.route=structuredClone(next.route);
      current.spawnOffsets=structuredClone(next.spawnOffsets);
      for(const key of ["holdUntil","interval","speed","note"]) {
        if(Object.hasOwn(previous,key)) {
          if(JSON.stringify(current[key])===JSON.stringify(previous[key])) current[key]=structuredClone(next[key]);
        } else if(next[key]!==undefined) {
          current[key]=structuredClone(next[key]);
        }
      }
      for(const key of ["coverWaitSeconds","firingArea","weapon","fireCycle"]) {
        if(current[key]===undefined && next[key]!==undefined) current[key]=structuredClone(next[key]);
      }
    }
  }
  for(const previous of baseline.triggers||[]) {
    const current=value.triggers.find(trigger=>trigger.id===previous.id);
    const next=defaults.triggers.find(trigger=>trigger.id===previous.id);
    if(!current || !next) continue;
    const group=value.groups.find(entry=>entry.triggerId===current.id);
    const nextGroup=defaults.groups.find(entry=>entry.id===group?.id);
    if(!group || !nextGroup || JSON.stringify(group.area)!==JSON.stringify(nextGroup.area)) continue;
    if(current.mode===previous.mode && current.beat===previous.beat && current.delay===previous.delay) {
      current.delay=next.delay;
    }
  }
  value.revision=defaults.revision;
  return value;
}

function UpgradeTempleEncounterDocument(input,defaults) {
  if(input.revision===defaults.revision) return input;
  if(["2026-11-15-temple-stealth-1","2026-11-15-temple-stealth-2"].includes(input.revision))return UpgradeTempleCover(structuredClone(input),defaults);
  const prior = structuredClone(defaults);
  prior.revision = "2026-11-15-street-defense-2";
  prior.groups = prior.groups.filter(group=>group.id!=="TempleSearch");
  prior.triggers = prior.triggers.filter(trigger=>trigger.id!=="Trigger_TempleSearch");
  const currentRevision = input.revision === prior.revision;
  const upgraded=UpgradeExistingEncounterDocument(input,defaults);
  if(upgraded===input && !currentRevision && !["2026-11-15-village-engagement-1","2026-11-15-street-defense-1"].includes(input.revision)) return input;
  const value=structuredClone(upgraded);
  for(const collection of ["groups","triggers"]) for(const previous of FLOW_PREVIOUS_STREET_DEFENSE[collection]) {
    const current=value[collection].find(entry=>entry.id===previous.id);
    const next=defaults[collection].find(entry=>entry.id===previous.id);
    if(!current || !next) continue;
    const spatialKeys=collection==="groups"?["area","route","memberPlans","spawnOffsets"]:["area"];
    const spatialEdited=spatialKeys.some(key=>JSON.stringify(current[key])!==JSON.stringify(previous[key]));
    for(const [key,entry] of Object.entries(next)) {
      if(spatialEdited && [...spatialKeys,"behavior","firingArea"].includes(key)) continue;
      if(JSON.stringify(current[key])===JSON.stringify(previous[key])) current[key]=structuredClone(entry);
    }
  }
  for (const collection of ["groups","triggers"]) {
    const id = collection === "groups" ? "TempleSearch" : "Trigger_TempleSearch";
    if (!value[collection].some(entry=>entry.id===id)) value[collection].push(structuredClone(defaults[collection].find(entry=>entry.id===id)));
  }
  for (const group of value.groups.filter(group=>["VillageGun","VillageRifles"].includes(group.id))) {
    if (group.engageOn === "09e") group.engageOn = "09j";
  }
  return UpgradeTempleCover(UpgradeVillageEngagement(value,defaults),defaults);
}

function UpgradeTempleCover(value,defaults) {
  const patrol=value.groups.find(group=>group.id==="TempleSearch");
  if(patrol&&patrol.afterRouteLookAt===undefined)patrol.afterRouteLookAt=structuredClone(defaults.groups.find(group=>group.id==="TempleSearch").afterRouteLookAt);
  const current=value.triggers.find(trigger=>trigger.id==="Arrival_09b");
  const next=defaults.triggers.find(trigger=>trigger.id==="Arrival_09b");
  const previousAreas=[
    {shape:"circle",center:[76,430],size:[6,6]},
    {shape:"circle",center:[80.3,424.8],size:[2.4,2.4]}
  ];
  if(current && next && previousAreas.some(area=>JSON.stringify(area)===JSON.stringify(current.area))) {
    current.area=structuredClone(next.area);
    if(current.label==="蹲在窗台底下挪过" || current.label==="蹲在窗台下挪过")current.label=next.label;
  }
  value.revision=defaults.revision;
  return value;
}

function UpgradeTankDestruction(value,defaults) {
  for(const [id,label] of [["Arrival_06f","捡第一捆，追到后轮放下"],["Arrival_06h","老耿递第二捆，摸到车头"]]) {
    const current=value.triggers.find(trigger=>trigger.id===id),next=defaults.triggers.find(trigger=>trigger.id===id);
    if(!current || !next) continue;
    if(current.label===label) current.label=next.label;
    if(id==="Arrival_06h" && JSON.stringify(current.area)===JSON.stringify({shape:"circle",center:[101,281],size:[6,6]})) {
      current.area=structuredClone(next.area);
    }
  }
  return UpgradeVillageEngagement(value,defaults);
}

function UpgradeVillageEngagement(value,defaults) {
  for(const id of ["VillageGun","VillageRifles"]) {
    const group=value.groups.find(entry=>entry.id===id);
    if(group && group.engageOn===undefined) group.engageOn=defaults.groups.find(entry=>entry.id===id).engageOn;
  }
  value.revision=defaults.revision;
  return value;
}

function UpgradeTankApproach(value,defaults) {
  for(const collection of ["groups","triggers"]) for(const previous of FLOW_PREVIOUS_TANK_APPROACH[collection]) {
    const current=value[collection].find(entry=>entry.id===previous.id);
    const next=defaults[collection].find(entry=>entry.id===previous.id);
    if(!current || !next) continue;
    const spatialKeys=collection==="groups"?["area","route","memberPlans","spawnOffsets"]:["area"];
    const edited=spatialKeys.some(key=>JSON.stringify(current[key])!==JSON.stringify(previous[key]));
    for(const [key,entry] of Object.entries(next)) {
      if(edited && spatialKeys.includes(key)) continue;
      if(JSON.stringify(current[key])===JSON.stringify(previous[key])) current[key]=structuredClone(entry);
    }
  }
  value.revision=defaults.revision;
  return value;
}
