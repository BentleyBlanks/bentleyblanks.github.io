// P012 白盒行为编排。纯规则，不 import three；复用正式交互、搬运、剧情信号与检查点。
// 动作驱动阶段；新战术压力常态40秒、快清最短30秒。侦察→同轴步枪增援是明确例外，不代表全部波次达标。
import { PickUpLoadInteraction, GiveSupplyInteraction } from "./Script_Interact.mjs";
import { P012Point } from "./Data_FirstLevelP012Space.mjs";
import { P012NextVisiblePoint, P012SegmentClear, P012RouteProjection } from "./Script_FirstLevelP012March.mjs";

const Distance = (a, b) => a && b ? Math.hypot(a.x - b.x, a.z - b.z) : Infinity;
const Clone = (value) => JSON.parse(JSON.stringify(value));

/** Reconnect the finite east-lane encounter using its real walls and capsule. */
export function P012EastEnemyRejoinPath(config, position, target, radius, points = []) {
  if(!Number.isFinite(radius)||radius<=0||!position||!target)return null;
  const blocks=config.layout?.blocks||[];
  const corners=[];
  for(const block of blocks.filter(block=>['EastEnemyWall','EnemySpawnScreenEast'].includes(block.id))){
    const c=Math.cos(block.ry||0),s=Math.sin(block.ry||0),margin=radius+.2;
    for(const x of [-block.w/2-margin,block.w/2+margin])for(const z of [-block.d/2-margin,block.d/2+margin])
      corners.push({x:block.x+x*c+z*s,z:block.z-x*s+z*c,y:position.y||0});
  }
  const nodes=[position,target,...points,...corners],costs=nodes.map(()=>Infinity),visited=new Set(),previous=[];
  costs[0]=0;
  while(visited.size<nodes.length){
    let at=-1;
    for(let i=0;i<nodes.length;i++)if(!visited.has(i)&&(at<0||costs[i]<costs[at]))at=i;
    if(at<0||!Number.isFinite(costs[at]))return null;
    if(at===1){const result=[];for(let i=1;i!==0;i=previous[i])result.unshift({...nodes[i]});return result;}
    visited.add(at);
    for(let i=1;i<nodes.length;i++)if(!visited.has(i)&&P012SegmentClear(blocks,nodes[at],nodes[i],radius)){
      const cost=costs[at]+Distance(nodes[at],nodes[i]);
      if(cost<costs[i]){costs[i]=cost;previous[i]=at;}
    }
  }
  return null;
}

export const P012_BEATS = Object.freeze([
  ["B00", "跟随罗班长下车", "Z00", 0, "door"],
  ["B01", "领取步枪和子弹", "Z00", 40, "weapon"],
  ["B02", "跟随小队穿过集结村路", "Z01", 85, "village"],
  ["B03", "在村口跟上班长，继续北上接防", "Z02", 140, "depart"],
  ["B04", "跟随班长北上", "Z03", 185, "shelling"],
  ["B05", "把弹药送到机枪阵位", "Z04", 230, "ammo"],
  ["B06", "观察前方田地", "Z05", 285, "scouts"],
  ["B07", "阻止正面步兵接近阵地", "Z05", 330, "front"],
  ["B08", "低姿换枪眼，压制机枪", "Z05", 380, "machineGun"],
  ["B09", "听掷弹筒发射声，离开旧枪眼", "Z05", 425, "mortar"],
  ["B10", "封锁西侧铁路涵洞", "Z05", 465, "culvert"],
  ["B11", "换弹补给，查看伤员", "Z04", 510, "wounded"],
  ["B12", "到交通壕后送队集合点", "Z04", 565, "volunteer"],
  ["B13", "沿交通壕、村口原路向南护送", "Z06", 600, "escort"],
  ["B14", "侧绕残屋，压制道路机枪再回担架队", "Z07", 740, "ambush"],
  ["B15", "检查担架伤员，随班长到墙后收队", "Z08", 910, "regroup"],
  ["B16", "从墙后观察航迹，选择护送路线", "Z08", 980, "railPass"],
  ["B17", "处理扫射造成的道路阻碍", "Z08", 1030, "crowdTurn"],
  ["B18", "接住同一副担架后端，沿沟边搬运", "Z08", 1100, "stretcher"],
  ["B19", "扑入路沟", "Z08", 1140, "dive"],
  ["B20", "守住沟边，阻止日军接近伤员", "Z08", 1185, "closeFight"],
  ["B21", "清除近处敌人，尝试打开南路", "Z09", 1250, "southFight"],
  ["B22", "观察南侧截断线", "Z09", 1370, "southCut"],
  ["B23", "掩护后送队沿回撤沟道退回阵地", "Z10", 1395, "retreat"],
  ["B24", "把伤员抬入掩蔽部", "Z04", 1500, "regrip"],
  ["B25", "第一关结束", "Z04", 1550, "complete"],
].map(([id, objective, zone, targetStartS, action]) => Object.freeze({ id, objective, zone, targetStartS, action })));

/** 每波只引入一种主压力，数量有限；死亡不返还预算。 */
export const P012_WAVES = Object.freeze([
  { beat: 6, atS: 285, count: 2, kind: "scouts", lane: "scoutSearch" },
  { beat: 7, atS: 330, count: 5, kind: "rifles", lane: "centerEnemy" },
  { beat: 8, atS: 380, count: 2, kind: "machineGun", lane: "machineGunEnemy" },
  { beat: 9, atS: 425, count: 2, kind: "mortar", lane: "eastEnemy" },
  { beat: 10, atS: 465, count: 4, kind: "culvert", lane: "westEnemy" },
  { beat: 13, atS: 600, count: 4, kind: "roadContact", lane: "roadContact" },
  { beat: 14, atS: 740, count: 6, kind: "ambush", lane: "ambush" },
  { beat: 20, atS: 1185, count: 6, kind: "closeFight", lane: "closeFight" },
  { beat: 21, atS: 1250, count: 6, kind: "southFight", lane: "southFight" },
].map(Object.freeze));

export class FirstLevelP012Director {
  constructor(host = {}, config = {}) {
    this.host = host;
    this.config = config;
    this.beat = 0;
    this.elapsed = 0;
    this.enteredAt = 0;
    this.facts = new Set();
    this.signals = new Set();
    this.visits = [];
    this.travelM = 0;
    this.sprintM = 0;
    this.airSprintM = 0;
    this.ambushEntryIndex = 0;
    this.ambushRejoin = null;
    this.closePressureReleased = false;
    this.closeReleasedGroup = -1;
    this.airRouteChoice = null;
    this.airRescueTravelM = 0;
    this.lookRad = 0;
    this.last = null;
    this.gunports = new Set();
    this.unlockedWaves = [];
    this.enemyRoutes = [];
    this.pendingEnemies = [];
    this.spawnedTotal = 0;
    this.lastWaveAt = -1e9;
    this.pressureHistory = [];
    this.stageVisits = [];
    this.retreatPoint = 0;
    this.checkpoints = [];
    this.checkpointId = null;
    this.history = [];
    this.action = P012_BEATS[0].objective;
    this.lastSample = {};
    this.routeIndex = 0;
    this.orientationIndex = 0;
    this.observationTime = 0;
    this.mortarImpactStart = 0;
    this.shellObservationTime = 0;
    this.shellImpactStart = 0;
    this.shellTarget = null;
    this.cleanupWeaponStart = 0;
    this.frontlineAmmoRemaining = config.activities?.frontlineAmmo?.stockClips ?? 12;
    this.frontlineAmmoDispensed = 0;
    this.supplyReceipts = new Set();
    this.southGrenadesRemaining = config.activities?.southGrenadeStock ?? 2;
    this.grenadeStart = 0;
    this.completionReasons = {};
    this.mortarEscapeFrom = null;
    this.carryTravelM = 0;
    this.weaponActionStart = 0;
    this.guideStarted = false;
    this.retreatCovers = [];
    this.InstallInteractions();
  }

  Point(name, fallback) { return this.config.anchors?.[name] || fallback; }
  Mark(name) { this.facts.add(name); return true; }
  Emit(name) {
    if (this.signals.has(name)) return false;
    this.signals.add(name);
    this.host.Signal?.(name);
    return true;
  }
  Signalled(name) { return this.signals.has(name) || !!this.host.Signalled?.(name); }
  SupplyOnce(fact) {
    this.Mark(fact);
    if (this.supplyReceipts.has(fact)) return false;
    this.supplyReceipts.add(fact); this.host.CheckWeapon?.(); return true;
  }
  FrontlineAmmoLabel() {
    return this.frontlineAmmoRemaining > 0
      ? `领取桥夹 · 箱内剩 ${this.frontlineAmmoRemaining}/${this.config.activities?.frontlineAmmo?.stockClips ?? 12}`
      : "弹药箱已空";
  }
  ActivityRoute() {
    const a = this.config.activities || {};
    return ({ 0: a.trainRoute, 1: a.weaponGuideRoute, 2: a.villageRoute, 3:[a.villageRoute?.at(-1)], 4: a.shellCoverRoute,
      5: a.ammoRoute, 11: a.woundedDragRoute, 12: [a.woundedDragTo || this.config.anchors.shelter], 13: a.roadContactSideRoute, 14: this.config.routes?.flank,
      15: a.airRegroupRoute,
      16: this.airRouteChoice ? (a.airRouteChoices?.[this.airRouteChoice] || []) : a.airRegroupRoute,
      17: a.airRejoinRoute,
      18: a.stretcherCarryRoute, 20: a.closeFightRoute, 21: a.southRoomRoute, 22: a.southAssemblyRoute })[this.beat] || [];
  }
  StartGuide() {
    const activity=this.config.activities||{};
    this.guideStarted = true;
    this.host.Guide?.({ beat: this.beat, route: this.ActivityRoute(),
      ...(this.beat === 0 ? { ...(this.config.arrival ? {startIndex:1,arrivalRadius:.45} : {}), WaitAt: index => (this.config.arrival && index === 1 && !this.Signalled("P012TrainDoor")) || (index === 2
        && Distance(this.lastSample.position, this.lastSample.guidePosition || this.config.anchors.trainDoor) > 3),
        FaceAt: () => this.config.arrival&&!this.Signalled("P012TrainDoor")?this.config.activities.arrivalGatePoint:this.lastSample.position } : {}),
      ...(this.beat === 1 ? { startIndex: 0,
        WaitAt: index => index === 0 ? !this.facts.has("weapon") : index === 1 ? !this.facts.has("issuedAmmo") : true,
        FaceAt: index => this.config.activities.weaponGuideFacing[index] } : {}),
      ...(this.beat === 11 ? {
        route: [{x:this.config.activities.woundedDragFrom.x-1.4,z:this.config.activities.woundedDragFrom.z},...this.config.activities.woundedDragRoute.slice(1)], startIndex: 0, safeRoute: true,
        approachPoints: this.config.activities.woundedGuideRoute, waitDistance: 6,
        WaitAt: index => index === 0 && this.lastSample.carryKind !== "wounded" && !this.lastSample.woundedDragDelivered,
        Hold: () => Distance(this.lastSample.guidePosition,this.config.activities.woundedDragFrom)>2
          && this.facts.has("wounded") && this.lastSample.carryKind !== "wounded" && !this.lastSample.woundedDragDelivered,
        FaceAt: () => this.lastSample.position,
      } : {}),
      ...([14, 16, 17, 20, 21].includes(this.beat) ? { route: [] } : {}),
      ...(this.beat===15?{route:activity.airRegroupRoute||[],safeRoute:true,startIndex:0,waitDistance:8,
        approachPoints:this.config.routes?.south||[],
        WaitAt:index=>index===activity.airRegroupRoute.length-1 || (index===0&&!this.facts.has("roadWounded")),
        FaceAt:()=>activity.airObservationPosition}:{}),
      ...(this.beat === 22 ? { route: this.config.activities.blockadeGuideRoute,
        safeRoute: true, approachPoints: this.config.activities.blockadeGuideRoute,
        WaitAt: index => index === this.config.activities.blockadeGuideRoute.length - 1,
        FaceAt: () => this.config.anchors.blockadePositions?.[1] } : {}),
      ...(this.beat === 14 ? {
        route: this.config.activities.ambushEntryRoute?.slice(0,1) || [], startIndex: 0, safeRoute: true,
        approachPoints: this.config.routes?.south?.slice(0,this.config.routes.south.findIndex(point=>Distance(point,this.config.routes.flank[0])<.1)+1),
        WaitAt: () => true, FaceAt: () => this.config.routes?.flank?.[1], holdStance: 1,
      } : {}),
      ...(this.beat === 23 ? {
        route: [this.config.activities.retreatSmokeUse], startIndex: 0, safeRoute: true, waitDistance: 8,
        approachPoints: [...(this.config.activities.southRoomRoute || []),...(this.config.activities.southAssemblyRoute || []),...(this.config.routes?.retreat?.slice(0,2)||[])],
        WaitAt: () => true, FaceAt: () => this.lastSample.position,
        ReleaseWhen: () => this.facts.has("retreatSmokeDeployed"),
      } : {}),
      ...(this.beat === 3 ? {startIndex:0,WaitAt:()=>true,FaceAt:()=>this.HubFacing()} : {}),
      ...(this.beat === 4 ? { startIndex: 0,
        WaitAt: index => index===this.ActivityRoute().length-1
          ? !this.Signalled("P012NorthContinue") : Distance(this.lastSample.position,this.lastSample.guidePosition)>8,
        FaceAt: index => index===this.ActivityRoute().length-1?this.lastSample.position:null } : {}),
      ...(this.beat === 12 ? { startIndex: 0, WaitAt: () => this.beat === 12 } : {}),
      ...(this.beat === 13 ? { route: activity.roadContactGuideRoute, startIndex: 0, safeRoute: true,
        approachPoints: activity.woundedDragRoute, waitDistance: 8,
        Hold: () => this.RoadColumnBehind(),
        WaitAt: index => index === activity.roadContactGuideRoute.length-1,
        FaceAt: () => this.facts.has("roadContactClear") ? this.lastSample.position : activity.roadContactEnemies?.[0]?.position } : {}),
      speed: this.config.activities?.guideSpeedByBeat?.[this.beat] || this.config.activities?.guideSpeedMps || 1.3 });
  }

  HubFacing() {
    const directions=this.config.activities?.hubBriefing;
    if(!directions||!this.Signalled("P012HubBriefingStarted"))return this.lastSample.position;
    if(!this.Signalled("P012HubRailExplained"))return directions.rail;
    if(!this.Signalled("P012HubFrontExplained"))return directions.front;
    if(!this.Signalled("P012HubVillageExplained"))return directions.village;
    return directions.south;
  }

  InstallInteractions() {
    const Register = (spec) => this.host.Register?.(spec);
    Register({ id: "p012_weaponCheck", kind: "supply", label: "领取步枪，前往弹药分发点",
      gesture: "hold", seconds: 2.4, position: this.config.activities.weaponReceiveAnchor,
      Enabled: () => this.beat <= 1 && !this.facts.has("weapon"), once: false,
      OnComplete: () => {
        if(this.beat>1||this.facts.has("weapon")||this.host.ReceiveWeapon?.()===false)return false;
        this.Mark("weapon"); this.Emit("P012WeaponReceived"); return true;
      } });
    Register({ id: "p012_ammoIssue", kind: "supply", label: "领取子弹，随后跟队出发",
      gesture: "hold", seconds: 1.8, position: this.config.activities?.weaponIssueAnchor,
      Enabled: () => this.beat === 1 && this.facts.has("weapon") && !this.facts.has("issuedAmmo"), once: false,
      OnComplete: () => {
        if(this.beat!==1||!this.facts.has("weapon")||this.facts.has("issuedAmmo"))return false;
        this.Mark("issuedAmmo"); this.Emit("P012AmmoIssued"); this.host.CheckWeapon?.();
        if(this.config.activities?.briefing)this.host.Guide?.({beat:1,route:this.config.activities.briefing.route,startIndex:0,
          WaitAt:index=>index===this.config.activities.briefing.route.length-1,FaceAt:()=>this.lastSample.position,speed:3.05});
        return true;
      } });
    Register({ id: "p012_woundedCheck", kind: "bandage", label: "查看伤员，整理弹药并补充1包绷带",
      gesture: "hold", seconds: 2.2, position: this.config.activities?.woundedDragFrom || this.Point("shelter", P012Point(-7, -52)),
      Enabled: () => this.beat === 11 && !this.supplyReceipts.has("wounded"), once: false,
      OnComplete: () => { const issued = this.SupplyOnce("wounded"); if (issued) this.host.GiveBandages?.(1);
        this.Emit("P012WoundedChecked"); return issued; } });
    Register({ id: "p012_volunteer", kind: "supply", label: "向罗班长主动申请护送伤员",
      gesture: "hold", seconds: 1.5, Anchor: () => this.lastSample.guidePosition,
      Enabled: () => this.beat === 12 && !this.facts.has("volunteer") && this.lastSample.guideAlive === true
        && Distance(this.lastSample.guidePosition, this.config.activities.woundedDragTo) < 3, once: false,
      OnComplete: () => { this.Mark("volunteer"); this.Emit("P012EscortRequested"); } });
    Register({ id: "p012_roadContactHold", kind: "supply", label: "命令担架队停在院墙后", gesture: "hold", seconds: 1.4, position: this.config.activities?.roadContactColumnHold, once: false,
      Enabled: () => this.beat === 13 && this.facts.has("roadContactSeen") && !this.facts.has("roadContactHeld"), OnComplete: () => { this.Mark("roadContactHeld"); this.Emit("P012RoadContactHold"); } });
    Register({ id: "p012_roadContactRelease", kind: "supply", label: "从队尾放行担架队", gesture: "hold", seconds: 1.4, position: this.config.activities?.roadContactTailRelease, once: false,
      Enabled: () => this.beat === 13 && this.facts.has("roadContactClear") && this.lastSample.roadContactFriendlyCoverCount >= 2 && !this.facts.has("roadContactReleased"), OnComplete: () => { this.Mark("roadContactReleased"); this.Emit("P012RoadContactRelease"); } });
    Register({ id: "p012_frontlineAmmo", kind: "supply", label: this.FrontlineAmmoLabel(),
      gesture: "hold", seconds: this.config.activities?.frontlineAmmo?.takeSeconds ?? 2.4,
      position: this.Point("ammoDrop"), once: false,
      Enabled: () => this.beat >= 6 && this.beat <= 10 && this.facts.has("ammo"),
      OnBegin: (ctx) => { if (ctx?.point) ctx.point.label = this.FrontlineAmmoLabel(); },
      OnComplete: (ctx) => {
        const current = Math.max(0, Number(this.host.CurrentClips?.() ?? this.lastSample.clips) || 0);
        const request = Math.min(this.frontlineAmmoRemaining,
          Math.max(0, (this.config.activities?.frontlineAmmo?.carryCapClips ?? 4) - current));
        if (request <= 0) return false;
        const actual = Math.max(0, Math.min(request, Math.floor(Number(this.host.GiveClips?.(request)) || 0)));
        this.frontlineAmmoRemaining -= actual; this.frontlineAmmoDispensed += actual;
        if (ctx?.point) ctx.point.label = this.FrontlineAmmoLabel();
        return actual > 0;
      } });
    Register({ id: "p012_roadWounded", kind: "bandage", label: "检查前方担架伤员",
      gesture: "hold", seconds: 2.2, Anchor: () => this.lastSample.roadWoundedPosition,
      Enabled: () => this.beat === 15 && this.lastSample.roadWoundedAtInspection === true
        && !!this.lastSample.roadWoundedPosition && !this.facts.has("roadWounded"), once: false,
      OnComplete: () => {
        if (this.beat !== 15 || this.lastSample.roadWoundedAtInspection !== true || !this.lastSample.roadWoundedPosition) return false;
        this.Mark("roadWounded"); this.Mark("regroup"); this.Emit("P012RoadWoundedChecked"); return true;
      } });
    Register({id:"p012_airRescue",kind:"carry",label:"背起扫射中受伤的百姓",gesture:"hold",seconds:1.2,
      position:this.config.activities?.airCivilianPosition,once:false,
      Enabled:()=>this.beat===17&&this.Signalled("P012AirObstacleCreated")&&!this.facts.has("airObstacleResolved")&&!carry?.Active,
      OnComplete:()=>carry?.Begin("wounded",{label:"受伤百姓",payload:{who:"p012AirCivilian"}})!==false});
    Register({id:"p012_airRescueCover",kind:"carry",label:"把伤员放到蓝色硬掩体后",gesture:"hold",seconds:1,
      position:this.config.activities?.airRescueCover,once:false,
      Enabled:()=>this.beat===17&&carry?.KindId==="wounded"
        &&Distance(this.lastSample.position,this.config.activities?.airRescueCover)<1.7
        &&P012SegmentClear(this.config.layout?.blocks||[],this.lastSample.position,this.config.activities?.airRescueCover,this.lastSample.bodyRadius||.42),
      OnComplete:()=>{carry?.ForceRelease("airRescue");this.Mark("airObstacleResolved");this.Mark("airRescued");
        this.Emit("P012AirObstacleResolved");this.host.ResolveAirObstacle?.("rescue");return true;}});
    Register({id:"p012_airCartClear",kind:"plank",label:"推开翻倒小车，转入沟边",gesture:"hold",seconds:2.2,
      position:this.config.activities?.airCartPosition,once:false,
      Enabled:()=>this.beat===17&&this.Signalled("P012AirObstacleCreated")&&!this.facts.has("airObstacleResolved")&&!carry?.Active,
      OnComplete:()=>{this.Mark("airObstacleResolved");this.Mark("airCartCleared");this.Emit("P012AirObstacleResolved");
        this.host.ResolveAirObstacle?.("cart");return true;}});
    Register({ id: "p012_southGrenades", kind: "supply", label: "领取手榴弹 · 备用2枚",
      gesture: "hold", seconds: 1.8, position: this.config.activities?.southGrenadeSupply,
      Enabled: () => this.beat === 21 && this.southGrenadesRemaining > 0 && !(this.lastSample.grenades > 0), once: false,
      OnComplete: (ctx) => {
        const actual = Math.max(0, Math.min(this.southGrenadesRemaining,
          Math.floor(Number(this.host.GiveGrenades?.(this.southGrenadesRemaining)) || 0)));
        this.southGrenadesRemaining -= actual;
        if (ctx?.point) ctx.point.label = `领取手榴弹 · 备用${this.southGrenadesRemaining}枚`;
        return actual > 0;
      } });
    Register({ id: "p012_retreatSmoke", kind: "supply", label: "点燃烟幕，遮断南路火线",
      gesture: "hold", seconds: 1.8, position: this.config.activities?.retreatSmokeUse,
      Enabled: () => this.beat === 23 && !this.facts.has("retreatSmokeDeployed"), once: false,
      OnComplete: () => {
        if (!this.host.DeployRetreatSmoke?.(this.config.activities?.retreatSmokeAt)) return false;
        this.Mark("retreatSmokeDeployed"); return true;
      } });
    const carry = this.host.Carry?.();
    Register({ ...PickUpLoadInteraction({ id: "p012_ammoPickup", kindId: "ammoCrate", carry,
      position: this.Point("ammoPickup", P012Point(-7, -52)), label: "抬起机枪弹药箱",
      once: false,
      options: { label: "机枪弹药箱", payload: { to: "p012Mg" } } }),
      Enabled: () => this.beat === 5 && !carry?.Active });
    Register(GiveSupplyInteraction({ id: "p012_ammoDrop", item: "弹药箱",
      position: this.Point("ammoDrop", P012Point(5, -65)), label: "把弹药送到机枪阵位",
      Has: () => this.beat === 5 && carry?.KindId === "ammoCrate" && this.routeIndex >= this.ActivityRoute().length, once: false,
      OnComplete: () => {
        carry?.ForceRelease("delivered");
        if (!carry?.Active) this.Mark("ammo");
      } }));
  }

  RouteArrivalRadius() {
    const activity = this.config.activities || {};
    return [13, 18, 21, 22].includes(this.beat) ? 0.6
      : this.beat === 14 ? (activity.ambushRouteRadiusM || 0.6) : (activity.routeRadiusM || 3);
  }

  RoadColumnBehind() {
    const { guidePosition, columnPosition } = this.lastSample;
    const route = this.config.escortWaypoints;
    return !!guidePosition && !!columnPosition && !!route?.length && !this.facts.has("roadContactSeen")
      && Distance(guidePosition, columnPosition) > 10
      && P012RouteProjection(route, guidePosition).along > P012RouteProjection(route, columnPosition).along;
  }

  RetreatRouteProjection(position) {
    const points = this.config.routes?.retreat || [];
    let nearest = null, along = 0;
    for (let index = 0; index < points.length - 1; index += 1) {
      const a = points[index], b = points[index + 1], dx = b.x - a.x, dz = b.z - a.z;
      const length = Math.hypot(dx, dz);
      const t = Math.max(0, Math.min(1, ((position.x - a.x) * dx + (position.z - a.z) * dz) / (length * length)));
      const point = { x: a.x + dx * t, z: a.z + dz * t }, distance = Distance(position, point);
      if (!nearest || distance < nearest.distance) nearest = { point, distance, along: along + length * t };
      along += length;
    }
    return nearest;
  }

  RetreatRejoinTarget(column = this.lastSample.columnPosition) {
    const player = this.lastSample.position;
    if (!player || !column) return null;
    const from = this.RetreatRouteProjection(player), to = this.RetreatRouteProjection(column);
    if (!from || !to) return column;
    let along = 0;
    const vertices = (this.config.routes?.retreat || []).map((point, index, points) => {
      if (index) along += Distance(points[index - 1], point);
      return { point, along };
    });
    const forward = to.along >= from.along;
    const candidates = vertices.filter((vertex) => forward
      ? vertex.along > from.along + 0.6 && vertex.along < to.along
      : vertex.along < from.along - 0.6 && vertex.along > to.along);
    return (forward ? candidates[0] : candidates.at(-1))?.point || column;
  }

  FrontlineApproachTarget(target) {
    // Player-only retries retain combat facts but may return behind the solid
    // reverse slope. Rejoin through the existing ammunition trench, not through
    // the wall. This latch is navigation only, never a checkpoint/world reset.
    const player = this.lastSample.position;
    if (!player || !target) return null;
    if (player.z > this.Point("ammoPickup", P012Point(-7, -52)).z - 3) this.frontlineApproaching = true;
    if (!this.frontlineApproaching) return null;
    if (Distance(player, target) <= 0.6) { this.frontlineApproaching = false; return null; }
    const central = this.config.anchors.gunports[1];
    const points = [...this.config.activities.ammoRoute.slice(-3),
      ...(target.x > central.x ? [{ x: central.x + 2, z: central.z - 0.8 }] : []), target];
    let along = 0, nearest = null;
    const vertices = points.map((point, index) => {
      if (index) {
        const a = points[index - 1], dx = point.x - a.x, dz = point.z - a.z;
        const length = Math.hypot(dx, dz);
        const t = Math.max(0, Math.min(1, ((player.x-a.x)*dx+(player.z-a.z)*dz)/(length*length || 1)));
        const distance = Math.hypot(player.x-a.x-dx*t,player.z-a.z-dz*t);
        if (!nearest || distance < nearest.distance) nearest = { distance, along: along+length*t };
        along += length;
      }
      return { point, along };
    });
    if (player.z > points[0].z + 0.6) return points[0];
    return vertices.find(vertex => vertex.along > (nearest?.along || 0)+0.001
      && Distance(player,vertex.point)>0.6)?.point || target;
  }

  SouthRouteApproachTarget(target) {
    // A player-only retry keeps the room-clear progress but returns to the
    // northern ditch. Reuse the complete cleared approach in both directions;
    // the short B22 exit route alone would still point through the return bank.
    // This is guidance along that known route, not arbitrary off-road pathfinding.
    const activity = this.config.activities || {};
    const points = [activity.closeFightRoute?.[0], ...(activity.southRoomRoute || [])].filter(Boolean);
    const player = this.lastSample.position;
    if (!player || !target || points.length < 2) return null;
    let along = 0, nearest = null;
    const vertices = points.map((point, index) => {
      if (index) {
        const a = points[index - 1], dx = point.x - a.x, dz = point.z - a.z;
        const length = Math.hypot(dx, dz);
        const t = Math.max(0, Math.min(1, ((player.x - a.x) * dx + (player.z - a.z) * dz) / (length * length || 1)));
        const distance = Math.hypot(player.x - a.x - dx * t, player.z - a.z - dz * t);
        if (!nearest || distance < nearest.distance) nearest = { distance, along: along + length * t };
        along += length;
      }
      return { point, along };
    });
    const destination = vertices.find(vertex => Distance(vertex.point, target) < 0.01);
    if (!destination || !nearest) return null;
    const forward = destination.along >= nearest.along;
    const candidates = vertices.filter(vertex => Distance(player, vertex.point) > this.RouteArrivalRadius()
      && (forward ? vertex.along > nearest.along + 0.001 && vertex.along < destination.along
        : vertex.along < nearest.along - 0.001 && vertex.along > destination.along));
    return (forward ? candidates[0] : candidates.at(-1))?.point || null;
  }

  RetreatLeadTarget(target) {
    if (this.lastSample.lastLitterArrived) return null;
    const column = this.lastSample.columnPosition;
    if (!column || !target) return null;
    const projection = this.RetreatRouteProjection(column), destination = this.RetreatRouteProjection(target);
    if (!projection || !destination || destination.along <= projection.along + 10) return null;
    const points = this.config.routes.retreat;
    let remaining = projection.along + 10;
    for (let index = 1; index < points.length; index += 1) {
      const a = points[index - 1], b = points[index], length = Distance(a, b);
      if (remaining <= length) return { x: a.x + (b.x - a.x) * remaining / length,
        z: a.z + (b.z - a.z) * remaining / length };
      remaining -= length;
    }
    return points.at(-1);
  }

  RetreatCoverState() {
    const index = (this.config.activities?.retreatCoverIndices || []).find(value => !this.retreatCovers.includes(value));
    const point = this.config.routes?.retreat?.[index];
    const column = this.lastSample.columnPosition;
    if (!point || !column) return { hold: false, index, point };
    const current = this.RetreatRouteProjection(column), cover = this.RetreatRouteProjection(point);
    const overdue = !!this.lastSample.lastLitterArrived || (current && cover && current.along > cover.along + 24);
    return { index, point, overdue, hold: !overdue && current && cover && current.along >= cover.along - 5 };
  }

  AmbushThreat() {
    if (this.beat !== 14) return null;
    for (const [index, group] of (this.config.activities?.ambushGroups || []).entries()) {
      if (this.routeIndex < group.routeIndex) continue;
      const living = this.enemyRoutes.filter((entry) => entry.ambushGroup === index
        && this.host.EnemyPosition?.(entry.handle));
      const pending = this.pendingEnemies.some((entry) => entry.ambushGroup === index);
      if (living.length || pending) return { ...group, index, lookAt: living.length
        ? this.host.EnemyPosition(living[0].handle) : group.positions[0] };
    }
    return null;
  }
  StepAmbushRejoin(position) {
    if(this.beat!==14){this.ambushRejoin=null;return;}
    const activity=this.config.activities||{},route=this.ActivityRoute(),blocks=this.config.layout?.blocks;
    if(!position||!blocks||!route.length)return;
    if(this.ambushRejoin&&Distance(position,this.ambushRejoin.destination)<=this.RouteArrivalRadius()){
      this.ambushRejoin=null;return;
    }
    if(!this.ambushRejoin){
      const destination=this.AmbushThreat()?.cover||route[this.routeIndex];
      const entry=activity.ambushEntryRoute||[];
      // A world-preserving retry or ordinary detour can put the player back
      // outside the ruin while the combat cursor correctly stays inside it.
      // This is geometry-based, not a death flag or a checkpoint teleport hook.
      if(!destination||this.routeIndex===0||Distance(position,destination)<=12
        ||!entry.some(point=>Distance(position,point)<30)
        ||P012SegmentClear(blocks,position,destination,.42))return;
      const points=[...entry,...route.slice(0,Math.min(route.length,this.routeIndex+1))];
      if(Distance(points.at(-1),destination)>.01)points.push(destination);
      const plan=P012NextVisiblePoint(blocks,position,points,0,.42);
      if(plan.blocked)return;
      this.ambushRejoin={destination:{...destination},points,index:plan.index,target:{...plan.point}};
    }
    const rejoin=this.ambushRejoin;
    // Re-evaluate the entire already-travelled prefix: another retry may move
    // the player behind the navigation cursor, without rolling back any facts.
    const next=P012NextVisiblePoint(blocks,position,rejoin.points,0,.42);
    rejoin.index=next.index;rejoin.target={...next.point};rejoin.blocked=!!next.blocked;
  }

  StepEastEnemyRejoin(route, position) {
    if(route.encounterBeat!==9)return false;
    const target=route.points[route.index],radius=this.host.EnemyBodyRadius?.(route.handle);
    if(!target||!Number.isFinite(radius)||radius<=0)return false;
    if(P012SegmentClear(this.config.layout?.blocks||[],position,target,radius)){
      if(route.rejoin){this.host.EnemyRejoin?.(route.handle,null);route.rejoin=null;}
      return false;
    }
    const path=P012EastEnemyRejoinPath(this.config,position,target,radius,route.points);
    // Failure is explicit: do not teleport, enlarge the passage or move the cursor.
    const point=path?.[0]||position;
    route.rejoin={target:{...point},destination:{...target},blocked:!path,radius};
    this.host.EnemyGoal?.(route.handle,point,.3);
    this.host.EnemyRejoin?.(route.handle,point);
    return true;
  }
  LateThreat() {
    const groups = this.beat === 20 ? this.config.activities?.closeFightGroups
      : this.beat === 21 ? this.config.activities?.southFightGroups : null;
    for (const [index, group] of (groups || []).entries()) {
      if (this.routeIndex < group.routeIndex) continue;
      const living = this.enemyRoutes.filter((entry) => entry.encounterBeat === this.beat
        && entry.encounterGroup === index && this.host.EnemyPosition?.(entry.handle));
      const pending = this.pendingEnemies.some((entry) => entry.encounterBeat === this.beat && entry.encounterGroup === index);
      if (living.length || pending) return { ...group, index, lookAt: living.length
        ? this.host.EnemyPosition(living[0].handle) : group.positions[0] };
    }
    return null;
  }

  StepEnemyBound(route, player) {
    if (!route.relocation || route.index < route.points.length) return;
    const actor = this.host.EnemyPosition?.(route.handle);
    if (!actor) return;
    const partner = this.enemyRoutes.find((entry) => entry !== route && entry.encounterBeat === route.encounterBeat
      && entry.encounterGroup === route.encounterGroup);
    const partnerAlive = partner && this.host.EnemyPosition?.(partner.handle);
    const partnerCombat = partnerAlive ? this.host.EnemyCombatState?.(partner.handle) : null;
    if (!route.bound) route.bound = { phase: "cover", player: player ? { ...player } : null,
      partnerFire: partnerCombat?.lastFire ?? null };
    const bound = route.bound;
    if (bound.phase === "moving") {
      if (Distance(actor, route.relocation) <= 0.7) bound.phase = "settled";
      else this.host.EnemyGoal?.(route.handle, route.relocation, 0.6);
      return;
    }
    if (bound.phase === "settled") return;
    const combat = this.host.EnemyCombatState?.(route.handle);
    const partnerReady = partnerAlive && partner.index >= partner.points.length;
    const reason = !partnerAlive && partner ? "partnerLost"
      : combat?.suppression > 0.3 ? "suppressed"
      : player && bound.player && Distance(player, bound.player) >= 3 ? "playerRepositioned"
      : route.encounterSlot === 1 && partnerReady && Number.isFinite(partnerCombat?.lastFire)
        && partnerCombat.lastFire > (bound.partnerFire ?? partnerCombat.lastFire) ? "coverFire"
      : route.encounterSlot === 0 && partner?.bound?.phase === "settled" ? "partnerSettled" : null;
    if (!reason) return;
    bound.phase = "moving"; bound.reason = reason;
    this.host.EnemyGoal?.(route.handle, route.relocation, 0.6);
    this.Emit(`P012Bound${route.encounterBeat}_${route.encounterGroup}_${route.encounterSlot}`);
  }

  SaveCheckpoint(id) {
    if (this.checkpointId === id) return;
    this.checkpointId = id;
    this.checkpoints.push({ id, at: this.elapsed, beat: this.beat });
    this.host.Checkpoint?.(id, this.Snapshot());
  }

  Enter(next) {
    this.host.HoldRetreatForCover?.(false);
    this.history.push({ beat: P012_BEATS[this.beat].id, at: this.elapsed,
      ...(this.completionReasons[this.beat] ? { reason: this.completionReasons[this.beat] } : {}) });
    this.beat = next;
    this.enteredAt = this.elapsed;
    this.stageVisits = [];
    this.routeIndex = 0;
    this.guideStarted = false;
    if (next === 24) this.carryTravelM = 0;
    if (next === 16) this.airSprintM = 0;
    if (next === 9) { this.mortarImpactStart = this.lastSample.mortarImpactCount || 0;
      this.mortarEscapeFrom = null; }
    if (next === 11) this.cleanupWeaponStart = this.lastSample.weaponActionCount || 0;
    if (next === 12) this.Emit("P012EscortRequestOpen");
    if (next === 21) { this.grenadeStart = this.lastSample.grenadeThrows || 0; this.Emit("P012DitchClear"); }
    this.action = P012_BEATS[next].objective;
    this.host.Objective?.(this.action);
    if (next === 2) this.SaveCheckpoint("CP00");
    if (next === 5) this.SaveCheckpoint("CP01");
    if (next === 5) this.Emit("P012AmmoTask");
    if (next === 11) this.SaveCheckpoint("CP02");
    const contentEvents = { 11: "AtVillage", 13: "AtCulvert", 14: "AtSouthRoad", 16: "AtDitch", 23: "AtFallback" };
    if (contentEvents[next]) this.Emit(contentEvents[next]);
    if (next === 14) { this.Emit("P012AmbushStarted"); this.SaveCheckpoint("CP03"); }
    if (next === 15) this.Emit("P012AmbushClear");
    if (next === 16) this.Emit("P012AirObserveOpen");
    if (next === 17) { this.Emit("P012CrowdReady"); this.Emit("P012SeekAirCover"); }
    if (next === 20) this.SaveCheckpoint("CP05");
    if (next === 22) this.Emit("P012SouthVerified");
    if (next === 23) { this.SaveCheckpoint("CP06"); this.Emit("SouthCut"); }
    if (next === 24) { this.SaveCheckpoint("CP07"); this.Emit("P012RegripReady"); }
    if (next === 25) this.Emit("P012Complete");
  }

  Update(dt, sample = {}) {
    this.elapsed += Math.max(0, dt);
    this.lastSample = sample;
    const p = sample.position;
    const activity = this.config.activities || {};
    if (this.beat === 9 && this.unlockedWaves.includes(3) && sample.mortarWarningActive && sample.mortarWarningPosition)
      this.mortarEscapeFrom = { ...sample.mortarWarningPosition };
    if (this.beat === 0) this.Emit("P012Arrival");
    if(this.beat===1&&this.facts.has("issuedAmmo")&&activity.briefing){
      const briefing=activity.briefing;
      if(!this.Signalled("P012BriefingStarted")&&this.Signalled("P012MusterCalled")
        &&Distance(sample.guidePosition,briefing.position)<1.5&&Distance(p,sample.guidePosition)<=briefing.playerRadiusM
        &&sample.briefingReadyCount>=briefing.readyCount)this.Emit("P012BriefingStarted");
    }
    if (!this.guideStarted) this.StartGuide();
    if (this.last && p) {
      const moved = Math.min(3, Distance(p, this.last.position));
      this.travelM += moved;
      if (this.beat === 24 && sample.carryKind === "stretcher" && this.last.carryKind === "stretcher") this.carryTravelM += moved;
      if (sample.sprint > 0.5) this.sprintM += moved;
      if(this.beat===17&&sample.carryKind==="wounded"&&this.last.carryKind==="wounded")this.airRescueTravelM+=moved;
      if (this.beat === 16 && sample.sprint > 0.5) this.airSprintM += moved;
    }
    if (p) this.last = { position: { x: p.x, z: p.z }, yaw: sample.yaw || 0, carryKind: sample.carryKind };
    const route = this.ActivityRoute();
    if(this.beat===16&&this.Signalled("P012AircraftRailFire")&&sample.aircraftVisible===true
      &&Distance(p,activity.airObservationPosition)<=(activity.airObservationRangeM||4)){
      if(!this.facts.has("airObserved")){this.Mark("airObserved");this.Emit("P012AirObserved");}
    }
    // Rail fire is a world event; a missed free-camera glance cannot strand
    // the player at a route entrance after that one finite pass has gone.
    // Keep airObserved as honest observation evidence, never invent it here.
    if(this.beat===16&&this.Signalled("P012AircraftRailFire")&&!this.airRouteChoice){
      const choices=activity.airRouteChoices||{};
      for(const [name,points] of Object.entries(choices))if(points?.[0]&&Distance(p,points[0])<=this.RouteArrivalRadius()){
        this.airRouteChoice=name;this.routeIndex=0;this.Mark("airRouteChosen");this.Emit("P012AirRouteChosen");break;
      }
    }
    this.StepAmbushRejoin(p);
    if (this.beat === 14 && !this.ambushRejoin && Distance(p, activity.ambushEntryRoute?.[this.ambushEntryIndex]) <= this.RouteArrivalRadius())
      this.ambushEntryIndex += 1;
    const guideNear = Distance(p, sample.guidePosition) <= (activity.guideRangeM || 12);
    if (this.beat === 20 && !this.LateThreat() && this.closeReleasedGroup >= 0
      && this.closeReleasedGroup < (activity.closeFightGroups?.length||0)-1) {
      const nextGroup = this.closeReleasedGroup + 1;
      if (this.routeIndex < (activity.closeFightGroups?.[nextGroup]?.routeIndex ?? route.length))
        this.Emit(`P012DelayPosition${nextGroup}`);
    }
    // Follow goals belong to the moving guide, not invisible circles left behind him.
    // The actor advances its target within 2m; a player following 1–2m behind can
    // legitimately never enter a 3m circle. Consume only guide-traversed segments
    // while physically accompanying him, and separately acknowledge his last stop.
    if ([0, 2].includes(this.beat) && Distance(p, sample.guidePosition) <= 4
      && Number.isInteger(sample.guideRouteIndex)) {
      const passed = Math.min(route.length - 1, Math.max(0, sample.guideRouteIndex));
      this.routeIndex = Math.max(this.routeIndex, passed);
      if (passed === route.length - 1 && Distance(sample.guidePosition, route.at(-1)) <= 2.5)
        this.routeIndex = route.length;
    }
    const routeAllowed = this.beat === 0 || this.beat === 2 ? guideNear
      : this.beat === 4 ? !this.facts.has("northNearMissImpact") || this.facts.has("northCovered") || sample.stance !== "stand"
      : this.beat === 5 ? sample.carryKind === "ammoCrate"
      : this.beat === 11 ? sample.carryKind === "wounded"
      : this.beat === 14 ? !this.ambushRejoin && !this.AmbushThreat()
      : this.beat === 16 ? !!this.airRouteChoice && Distance(p, sample.columnPosition) < 18
      : this.beat === 17 ? this.facts.has("airObstacleResolved")
      : this.beat === 18 ? sample.carryKind === "stretcher"
      : this.beat === 20 ? !this.LateThreat()
      : this.beat === 21 ? this.routeIndex < (activity.southSupplyRouteIndex || 0)
        || !this.LateThreat() : true;
    if (routeAllowed && Distance(p, route[this.routeIndex]) <= this.RouteArrivalRadius()) {
      this.routeIndex += 1;
    }
    if(this.beat===5&&this.routeIndex>=3)this.Emit("P012AmmoDoglegEntered");
    if(this.beat===5&&this.routeIndex>=7)this.Emit("P012AmmoGunlineNear");
    if(this.beat===13){
      const atBreach=Distance(p,activity.roadContactBreach)<=4&&Distance(sample.guidePosition,activity.roadContactBreach)<=3;
      const contact=this.enemyRoutes.filter(entry=>entry.encounterBeat===13);
      const deployed=contact.length===4&&!this.pendingEnemies.some(entry=>entry.encounterBeat===13);
      const cleared=deployed&&contact.every(entry=>!this.host.EnemyPosition?.(entry.handle));
      // Identifying one real threat is enough to call a halt. A successful
      // early shot must never require the victim to become alive/visible again.
      if(!this.facts.has("roadContactSeen")&&atBreach&&deployed&&(sample.roadContactVisibleCount>0||cleared)){
        this.Mark("roadContactSeen");this.Emit("P012RoadContactSeen");
      }
      if(this.facts.has("roadContactHeld")&&cleared){this.Mark("roadContactClear");this.Emit("P012RoadContactClear");}
    }
    if (this.beat === 0 && !this.config.arrival && this.routeIndex >= 2 && guideNear) this.Emit("P012TrainDoor");
    if(this.beat===4){
      const chat=activity.northApproachChatPosition||route[0];
      if(!this.facts.has("northApproachChat")&&Distance(p,chat)<=3){
        this.Mark("northApproachChat");this.Emit("P012NorthApproachChat");
      }
      const next=route[1],length=Distance(chat,next),dx=next?.x-chat?.x,dz=next?.z-chat?.z;
      const along=p&&length>0?((p.x-chat.x)*dx+(p.z-chat.z)*dz)/length:0;
      const cross=p&&length>0?Math.abs((p.x-chat.x)*dz-(p.z-chat.z)*dx)/length:Infinity;
      if(this.facts.has("northApproachChat")&&!this.facts.has("northNearMissRequested")
        &&along>=(activity.northNearMissAfterM||10)&&cross<4){
        this.Mark("northNearMissRequested");this.shellImpactStart=sample.mortarImpactCount||0;
        // A near miss ahead and off the road remains in a forward-looking
        // player's view; no forced camera turn or invisible blast behind them.
        this.shellTarget=activity.northNearMissImpactPosition
          ? {...activity.northNearMissImpactPosition}
          : {x:p.x+(dx*9+dz*3)/length,z:p.z+(dz*9-dx*3)/length};
        this.Emit("P012NorthNearMissIncoming");this.host.Shelling?.(this.shellTarget);
      }
      if(this.facts.has("northNearMissRequested")&&!this.facts.has("northNearMissImpact")
        &&sample.mortarImpactCount>this.shellImpactStart){
        this.Mark("northNearMissImpact");this.Emit("P012NorthNearMissImpact");this.Emit("P012Shelling");
        this.host.NorthNearMissReaction?.(this.shellTarget);
      }
      if(this.facts.has("northNearMissImpact")&&!this.facts.has("northCovered")
        &&["crouch","prone"].includes(sample.stance)
        &&Distance(p,activity.northShelterPosition)<=(activity.northShelterRadiusM||2.4)
        &&this.host.ShelteredFromImpact?.(sample.mortarImpactPosition||this.shellTarget)===true){
        this.Mark("northCovered");this.Emit("P012NorthDitchEntered");
      }
    }
    if (this.beat === 23) {
      const returnRoute = this.config.routes?.retreat || [];
      const gap = Distance(p, sample.columnPosition);
      const cover = this.RetreatCoverState();
      // World-preserving retries may retain a column already beyond a missed
      // stop. Never send the player back to manufacture historical cover facts.
      if (cover.overdue) this.Mark("retreatRecoveryRequired");
      const recovery = this.facts.has("retreatRecoveryRequired");
      this.host.HoldRetreatForCover?.(!recovery && !!cover.hold);
      if (!recovery && cover.hold && Distance(p, cover.point) < 6 && gap < 24) {
        // Rejoining can consume navigation corners, but never any cover fact.
        // The first uncompleted cover remains the mandatory physical stop.
        this.retreatPoint = cover.index;
        this.retreatRejoining = false;
      }
      if (sample.lastLitterArrived) this.retreatRejoining = false;
      else if (sample.columnPosition && gap > (activity.retreatRejoinEnterM || 20)) this.retreatRejoining = true;
      else if (gap < (activity.retreatRejoinExitM || 10)) this.retreatRejoining = false;
      const needsCover = (activity.retreatCoverIndices || []).includes(this.retreatPoint);
      const coversColumn = Distance(p, sample.columnPosition) < 24 && sample.stance !== "stand";
      if (!recovery && !this.retreatRejoining && Distance(p, returnRoute[this.retreatPoint]) < 6 && (!needsCover || coversColumn)) {
        if (needsCover && !this.retreatCovers.includes(this.retreatPoint)) {
          this.retreatCovers.push(this.retreatPoint);
          this.Emit(`P012RetreatCover${(activity.retreatCoverIndices || []).indexOf(this.retreatPoint)}`);
          if (Number(sample.clips) === 0 && Number(sample.ammo) === 0) this.Emit("P012RetreatAmmoLow");
        }
        if (Distance(returnRoute[this.retreatPoint], this.Point("hub", P012Point(0, 0))) < 1) this.Emit("P012HubRevisited");
        if (this.retreatPoint < returnRoute.length - 1) this.retreatPoint += 1;
      }
      // Recompute after the real player action so this same frame releases the
      // stop; no timed wait and no virtual movement of the column.
      if (!recovery) this.host.HoldRetreatForCover?.(!!this.RetreatCoverState().hold);
      if (recovery && sample.lastLitterArrived && gap < 8 && sample.stance !== "stand") {
        this.Mark("retreatArrivalGuarded");
        this.completionReasons[23] = "escortArrivedBeforeCover";
      }
    } else {
      this.host.HoldRetreatForCover?.(false);
    }
    const zone = sample.zone;
    // A button press or an unrelated explosion does not complete the room assault.
    if (this.beat === 21 && Distance(p, activity.southRoom) < 3) this.Mark("southRoomEntered");
    if (this.beat === 23 && this.facts.has("retreatSmokeDeployed") && sample.retreatSmokeActive) this.Mark("retreatSmokeObserved");
    if (this.beat === 23 && sample.lastLitterArrived) this.Emit("P012LastLitterArrived");
    if (zone && this.visits[this.visits.length - 1] !== zone) this.visits.push(zone);
    if (zone && this.stageVisits[this.stageVisits.length - 1] !== zone) this.stageVisits.push(zone);
    if (this.beat === 4 && sample.stance === "crouch") this.Mark("crouch");
    for (const [index, port] of (this.config.anchors?.gunports || []).entries()) {
      if (Distance(p, port) < 6) this.gunports.add(index);
    }
    // 最早首枪窗口 + 每波有限预算。门由 beat 和现场事实共同开，不按时间无限补兵。
    const closeWaveIndex = P012_WAVES.findIndex((wave) => wave.kind === "closeFight");
    if (this.beat >= 18 && this.beat < 20 && this.Signalled("P012StretcherLifted")
      && !this.unlockedWaves.includes(closeWaveIndex)) {
      this.unlockedWaves.push(closeWaveIndex);
      this.SpawnWave(P012_WAVES[closeWaveIndex], closeWaveIndex);
      this.Emit("P012CloseEnemiesStaged");
    }
    if (this.Signalled("P012CloseEnemiesStaged") && this.Signalled("P012DiveApproach") && !this.closePressureReleased) {
      this.closePressureReleased = true;
      this.closeReleasedGroup = 0;
      this.pressureHistory.push({ kind: "closeFight", at: this.elapsed, interval: this.elapsed - this.lastWaveAt,
        mechanism: "groundReleaseOnDive", reason: "actualDiveApproach" });
      this.lastWaveAt = this.elapsed;
      this.host.Pressure?.(P012_WAVES[closeWaveIndex]);
    }
    if (this.beat === 20 && this.closeReleasedGroup >= 0 && this.closeReleasedGroup < 2) {
      const previous = this.closeReleasedGroup;
      const previousCleared = this.enemyRoutes.filter(entry => entry.encounterBeat === 20
        && entry.encounterGroup === previous).every(entry => !this.host.EnemyPosition?.(entry.handle));
      const next = previous + 1, cover = activity.closeFightGroups?.[next]?.cover;
      if (previousCleared && cover && Distance(p, cover) <= this.RouteArrivalRadius()) {
        this.closeReleasedGroup = next;
        this.Emit(`P012CloseGroupReleased${next}`);
      }
    }
    for (const [index, wave] of P012_WAVES.entries()) {
      if(wave.kind === "closeFight")continue;
      // The finite contact takes position while the escort is still north.
      // Arrival can reveal surviving enemies without spawning them in view.
      // Scouts may call same-axis rifle reinforcements immediately. New MG,
      // mortar and culvert pressure keeps a 30s floor; existing gunport movement
      // remains active during this transition, not a stationary wait objective.
      const previousGroupClear = this.pendingEnemies.length === 0
        && this.enemyRoutes.every((entry) => !this.host.EnemyPosition?.(entry.handle));
      const interval = this.elapsed - this.lastWaveAt;
      const newTacticalPressure = index >= 2 && index <= 4;
      const clearReady = previousGroupClear && (!newTacticalPressure || interval >= 30);
      if (this.beat >= wave.beat && (interval >= 40 || clearReady)
        && !this.unlockedWaves.includes(index)) {
        this.unlockedWaves.push(index);
        this.pressureHistory.push({ kind: wave.kind, at: this.elapsed,
          interval: Number.isFinite(this.lastWaveAt) && this.lastWaveAt > 0 ? this.elapsed - this.lastWaveAt : null,
          previousGroupClear,
          mechanism: index === 0 ? "initialContact" : index === 1 ? "sameAxisReinforcement"
            : newTacticalPressure ? "newTacticalPressure" : "lateEncounter",
          reason: interval >= 40 ? "normal40" : newTacticalPressure ? "clearMinimum30"
            : index === 1 ? "clearReinforcement" : "clearReady" });
        this.lastWaveAt = this.elapsed;
        if (wave.kind === "mortar") {
          this.mortarImpactStart = sample.mortarImpactCount || 0;
          this.mortarEscapeFrom = p ? { x: p.x, z: p.z } : null;
          this.Emit("P012MortarUnlocked");
        }
        this.host.Pressure?.(wave);
        this.SpawnWave(wave, index);
      }
    }
    for (const route of this.enemyRoutes) {
      const point = this.host.EnemyPosition?.(route.handle);
      if (!point) continue;
      if (this.StepScoutSearch(route, point)) continue;
      if (route.staging && route.encounterBeat === 20 && route.encounterGroup <= this.closeReleasedGroup) {
        route.staging = false; this.host.EnemyStaging?.(route.handle, false);
      }
      if (route.staging && route.index > route.stagingStopIndex) {
        this.host.EnemyGoal?.(route.handle, route.stagingStopIndex < 0 ? route.spawnPoint : route.points[route.stagingStopIndex], 0.6);
        continue;
      }
      if (route.index >= route.points.length) { this.StepEnemyBound(route, p); continue; }
      if(this.StepEastEnemyRejoin(route,point))continue;
      if (Distance(point, route.points[route.index]) < (route.relocation ? 0.6 : 2)) route.index += 1;
      if (route.staging && route.index > route.stagingStopIndex) continue;
      const goal = route.points[route.index];
      if (goal) this.host.EnemyGoal?.(route.handle, goal, route.relocation ? 0.6 : undefined);
      else this.StepEnemyBound(route, p);
    }
    this.SpawnPending();
    const dead = Number(sample.nearEnemyDeaths ?? sample.enemyDeaths) || 0;
    const Has = (fact) => this.facts.has(fact);
    const At = (id) => zone === id;
    const Followed = (ids) => {
      let cursor = 0;
      for (const visited of this.stageVisits) if (visited === ids[cursor]) cursor += 1;
      return cursor === ids.length;
    };
    let ready = false;
    switch (this.beat) {
      case 0: ready = this.routeIndex >= route.length && this.Signalled("P012TrainDoor"); break;
      case 1: ready = Has("weapon") && Has("issuedAmmo")
        &&(!activity.briefing||this.Signalled("P012BriefingComplete")); break;
      // Passing people are scene information, not a hidden "spot both groups"
      // objective. Reaching the hub must not depend on a crowd visibility bit.
      case 2: ready = this.routeIndex >= route.length; break;
      case 3: {
        const hub=activity.villageRoute?.at(-1),exit=activity.shellCoverRoute?.[0];
        ready=sample.guideAlive!==false && Distance(p,sample.guidePosition)<=4
          &&Distance(sample.guidePosition,hub)<=4 && !!exit
          &&P012SegmentClear(this.config.layout?.blocks||[],sample.guidePosition,exit,.42);
        if(ready&&activity.hubBriefing){this.Emit("P012HubBriefingStarted");ready=this.Signalled("P012HubBriefed");}
        if(ready)this.Emit("P012VillageNorthDeparture");
        break;
      }
      // The route ends at Luo's actual regroup stop, between the broad zone
      // radii. Do not require the player to abandon him for an invisible zone
      // centre after the squad has physically arrived and finished the count.
      case 4: ready = this.routeIndex >= route.length && Has("northNearMissImpact") && Has("northCovered")
        && this.Signalled("P012NorthContinue"); break;
      case 5: ready = Has("ammo") && this.gunports.size > 0; break;
      case 6: ready = dead >= 2 || (this.unlockedWaves.includes(0) && sample.scoutAlarm); break;
      case 7: ready = dead >= 7; break;
      case 8: {
        const cleared = sample.enemyMgDestroyed && this.pendingEnemies.length === 0
          && this.enemyRoutes.every((entry) => !this.host.EnemyPosition?.(entry.handle));
        ready = dead >= 9 && this.gunports.size >= 2 && (sample.friendlyMgFiredAfterSuppression || cleared);
        if (ready) this.completionReasons[8] = sample.friendlyMgFiredAfterSuppression ? "friendlyMgResumed" : "threatCleared";
        break;
      }
      case 9: ready = this.unlockedWaves.includes(3) && dead >= 11 && sample.stance !== "stand"
        && sample.mortarImpactCount > this.mortarImpactStart && Distance(p, sample.mortarImpactPosition) >= 6; break;
      case 10: ready = dead >= 15; break;
      case 11: ready = Has("wounded") && sample.woundedDragDelivered
        && sample.woundedDragDistance >= (activity.woundedDragMinM || 10)
        && this.routeIndex >= route.length && sample.weaponActionCount > this.cleanupWeaponStart; break;
      case 12:
        ready = Has("volunteer") && this.host.Signalled?.("P012EscortApproved");
        if (ready) this.Emit("EscortCall");
        break;
      case 13: ready = At("Z06") && Followed(["Z04", "Z03", "Z02", "Z06"])
        && sample.columnAtEscortEnd && Has("roadContactReleased") && Distance(p, activity.roadContactTailRelease) < 4; break;
      case 14:
        {
          const roadActors = this.enemyRoutes.filter((entry) => entry.ambushGroup === 0);
          if (roadActors.length === 2 && roadActors.every((entry) => !this.host.EnemyPosition?.(entry.handle))
            && !this.pendingEnemies.some((entry) => entry.ambushGroup === 0)) this.Emit("P012RoadGunSilenced");
        }
        if (!this.ambushRejoin && Distance(p, this.config.activities?.ambushGroups?.[2]?.cover || P012Point(72, 43)) < 7) this.Mark("flanked");
        ready = dead >= 25 && Has("flanked") && this.ambushEntryIndex >= (activity.ambushEntryRoute?.length || 0) && this.routeIndex >= route.length
          && Distance(p, sample.columnPosition) < 18; break;
      case 15: ready = Has("regroup") && Has("roadWounded") && Distance(p, sample.columnPosition) < 12
        && Distance(sample.guidePosition,activity.airObservationPosition)<=3
        &&Distance(p,activity.airObservationPosition)<=(activity.airObservationRangeM||4); break;
      case 16:
        if (this.airRouteChoice && this.routeIndex>=route.length && sample.airColumnEnteredRoad === true
          && Distance(p, sample.columnPosition) < 18
          && !this.Signalled("P012AirReady")) {
          this.SaveCheckpoint("CP04"); this.Emit("P012AirReady");
        }
        ready = this.Signalled("P012AirReady") && this.Signalled("P012RailComplete"); break;
      case 17: ready = this.Signalled("P012CrowdFire") && Has("airObstacleResolved")
        && this.routeIndex >= route.length; break;
      case 18: ready = sample.carryKind === "stretcher"
        && sample.carryDistance >= (activity.stretcherCarryMinM || 20)
        && this.routeIndex >= route.length && Distance(p, activity.stretcherCarryTo) < 3;
        if (ready) this.Emit("P012CarryReady"); break;
      case 19: ready = this.Signalled("P012Dived") && sample.stance !== "stand"; break;
      case 20: ready = dead >= 31 && this.closeReleasedGroup >= (activity.closeFightGroups?.length||1)-1
        && this.routeIndex >= (activity.closeFightRoute?.length || 0); break;
      case 21: ready = dead >= 37 && At("Z09") && Has("southRoomEntered")
        && this.routeIndex >= route.length
        && this.SouthEnemiesCleared(); break;
      case 22: {
        const cleared = sample.farSpawned === 4 && sample.farDeaths === 4;
        ready = Distance(p,activity.blockadeDecisionPosition)<=(activity.blockadeDecisionRangeM||8)
          &&Distance(sample.guidePosition,activity.blockadeDecisionPosition)<1
          && sample.columnAtSouthAssembly === true && this.routeIndex >= route.length
          && sample.guideAlive === true && Distance(p, sample.guidePosition) <= (activity.blockadeDecisionRangeM || 8)
          && ((sample.blockadeVisible && sample.blockadePressure) || cleared);
        if (ready) { this.completionReasons[22] = cleared ? "blockadeCleared" : "blockadeObservedFiring";
          this.Emit("P012BlockadeDecision"); }
        break;
      }
      case 23: ready = At("Z04") && sample.columnArrived && sample.lastLitterArrived
        && Has("retreatSmokeObserved")
        && (Has("retreatArrivalGuarded") || (this.retreatPoint >= (this.config.routes?.retreat?.length || 1) - 1
        && this.retreatCovers.length >= (activity.retreatCoverIndices?.length || 0))); break;
      case 24: ready = sample.carryKind === "stretcher" && this.carryTravelM >= (activity.finalCarryMinM || 10)
        && Distance(p, this.Point("shelter", P012Point(-7, -52))) < 3; break;
      default: break;
    }
    if (ready && this.beat < 25) this.Enter(this.beat + 1);
    const currentText = this.CurrentObjective().text;
    if (currentText !== this.action) { this.action = currentText; this.host.Objective?.(currentText); }
    return this.State();
  }

  EnemyBudget() { return this.unlockedWaves.reduce((n, index) => n + P012_WAVES[index].count, 0); }
  SouthEnemiesCleared() {
    const enemies=this.enemyRoutes.filter(entry=>entry.encounterBeat===21);
    return enemies.length===6 && !this.pendingEnemies.some(entry=>entry.encounterBeat===21)
      && enemies.every(entry=>!this.host.EnemyPosition?.(entry.handle));
  }
  RecordSouthGrenadeEffect(target, damage, position) {
    if(this.beat!==21 || !(damage>0) || !this.enemyRoutes.some(entry=>entry.encounterBeat===21&&entry.handle===target))return false;
    this.Mark("southGrenadeThrown");
    this.lastSouthGrenadeEffect={position:{x:position.x,y:position.y,z:position.z},targetId:target.id ?? null,damage};
    return true;
  }
  StepScoutSearch(route, point) {
    if (!route.scout) return false;
    const search = this.config.firstContact.scoutSearch;
    if (!route.scout.alerted) {
      const seen = this.host.EnemyScoutState?.(route.handle) || {};
      const reason = seen.hit ? "hit" : seen.detectedPlayer ? "detectedPlayer" : seen.alarmed ? "alarmed" : null;
      if (reason) {
        route.scout.alerted = true; route.scout.reason = reason;
        route.points = route.scout.approach; route.index = 0;
      }
    }
    if (route.scout.alerted) {
      this.host.EnemyScoutMode?.(route.handle, route.index < route.points.length
        ? { searching: false, speedMps: search.approachSpeedMps } : null);
      return false;
    }
    // Search never consumes a clock or marches down the attack lane. Only a
    // real perception/hit/alarm receipt changes this same living actor's order.
    if (Distance(point, route.points[route.index]) < 0.6) route.index = (route.index + 1) % route.points.length;
    this.host.EnemyScoutMode?.(route.handle, { searching: true, speedMps: search.speedMps });
    this.host.EnemyGoal?.(route.handle, route.points[route.index], 0.6);
    return true;
  }
  SpawnWave(wave, waveIndex) {
    // The wave can be authored early by the dive approach or reach the normal
    // finite-wave path at B20. Emit once from the shared creation seam so both
    // routes retain the same staged-pressure fact (Emit is idempotent).
    if (wave.kind === "closeFight") this.Emit("P012CloseEnemiesStaged");
    const name = wave.lane === "machineGunEnemy" ? "machineGun" : wave.lane === "westEnemy" ? "west" : wave.lane === "eastEnemy" ? "east" : "center";
    const lane = this.config.enemyLanes?.[name];
    const late = wave.beat >= 14;
    const fallback = late ? (wave.beat >= 21 ? this.Point("southGunpoint", P012Point(48, 107))
      : this.Point("gunpoint", P012Point(58, 39))) : this.Point("scout", P012Point(5, -113));
    const source = late ? fallback : lane?.spawn || fallback;
    for (let index = 0; index < wave.count; index += 1) {
      const scout = wave.kind === "scouts" ? this.config.firstContact?.scoutSearch?.entries[index] : null;
      const groups = wave.beat === 20 ? this.config.activities?.closeFightGroups
        : wave.beat === 21 ? this.config.activities?.southFightGroups : null;
      const encounterGroup = groups?.length ? Math.floor(index / 2) : null;
      const encounter = encounterGroup !== null ? groups[encounterGroup] : null;
      const encounterPosition = encounter?.positions[index % 2];
      const encounterSpawn = encounter?.spawns?.[index % 2] || encounterPosition;
      const ambushGroup = wave.kind === "ambush" && this.config.activities?.ambushGroups?.length ? Math.floor(index / 2) : null;
      const ambushPosition = encounterPosition || (ambushGroup !== null ? this.config.activities.ambushGroups[ambushGroup].positions[index % 2] : null);
      const roadContact = wave.kind === "roadContact" ? this.config.activities?.roadContactEnemies?.[index] : null;
      const weapon = index === 0 && ["machineGun", "ambush", "southFight"].includes(wave.kind)
        ? "Type11" : "Type38";
      const terminal = wave.kind === "culvert" ? lane?.terminalGoals?.[index] : null;
      const points = roadContact ? [roadContact.position]
        : encounterPosition ? [...(encounter.approaches?.[index % 2] || encounter.approach || []), encounterPosition]
        : ambushPosition ? [ambushPosition] : late ? [fallback] : terminal ? [...(lane?.waypoints || []).slice(0, -1), terminal]
        : [...(lane?.waypoints || []), lane?.goal || fallback];
      this.pendingEnemies.push({ spec: { x: roadContact?.position.x ?? scout?.spawn.x ?? encounterSpawn?.x ?? ambushPosition?.x ?? source.x, z: roadContact?.position.z ?? scout?.spawn.z ?? encounterSpawn?.z ?? ambushPosition?.z ?? source.z + index * 0.7,
        weapon, p012RoadContact: wave.kind === "roadContact", p012Near: true, p012MachineGun: wave.kind === "machineGun", squadId: `P012_${waveIndex}`, order: wave.kind === "scouts" || wave.kind === "machineGun" || ambushPosition ? "hold" : "attack" }, points, ambushGroup, encounterGroup, encounterBeat: wave.beat,
        scout: scout ? { approach: points.slice(1), search: scout.points } : null,
        encounterSlot: index % 2, relocation: encounter?.relocations?.[index % 2] || null,
        staging: wave.kind === "closeFight" && encounterGroup > this.closeReleasedGroup,
        stagingStopIndex: encounter?.stagingStopIndices?.[index % 2] ?? -1 });
    }
    this.SpawnPending();
  }
  SpawnPending() {
    const waiting = [];
    for (const pending of this.pendingEnemies) {
      const handle = this.host.SpawnEnemy?.(pending.spec);
      if (!handle) { waiting.push(pending); continue; }
      this.spawnedTotal += 1;
      const scout = pending.scout ? { approach: pending.scout.approach, alerted: false, reason: null } : null;
      this.enemyRoutes.push({ handle, points: pending.scout?.search || pending.points, index: 0, scout, ambushGroup: pending.ambushGroup,
        encounterGroup: pending.encounterGroup, encounterBeat: pending.encounterBeat,
        encounterSlot: pending.encounterSlot, relocation: pending.relocation,
        staging: pending.staging, stagingStopIndex: pending.stagingStopIndex,
        spawnPoint: { x: pending.spec.x, z: pending.spec.z } });
      const staged = pending.staging;
      if (scout) this.host.EnemyScoutMode?.(handle, { searching: true, speedMps: this.config.firstContact.scoutSearch.speedMps });
      if (staged) this.host.EnemyStaging?.(handle, true);
      const initialGoal = pending.scout?.search[0] || (staged && pending.stagingStopIndex < 0 ? pending.spec : pending.points[0]);
      if (initialGoal) this.host.EnemyGoal?.(handle, initialGoal, pending.relocation || scout ? 0.6 : undefined);
    }
    this.pendingEnemies = waiting;
  }
  CurrentObjective() {
    const beat = P012_BEATS[this.beat];
    const anchors = this.config.anchors || {};
    const activity = this.config.activities || {};
    const route = this.ActivityRoute();
    let target = null;
    let text = beat.objective;
    let lookAt = null;
    let interactionId = null;
    let requiredAction = "move";
    let requiredStance = null;
    let progress = null;
    if ([0, 2, 13].includes(this.beat)) requiredAction = "follow";
    if ([0, 2, 4, 14].includes(this.beat)) target = route[this.routeIndex] || route.at(-1);
    if ([0, 2].includes(this.beat) && this.lastSample.guidePosition) target = this.lastSample.guidePosition;
    if (this.beat === 1) { target = activity.weaponReceivePosition; interactionId = "p012_weaponCheck"; }
    if (this.beat === 1 && this.facts.has("weapon")) {
      target = this.facts.has("issuedAmmo") ? activity.villageRoute[0] : activity.weaponIssuePosition;
      text = this.facts.has("issuedAmmo") ? "跟随小队穿过村路" : "到弹药桌领取子弹";
      interactionId = this.facts.has("issuedAmmo") ? null : "p012_ammoIssue";
      if(this.facts.has("issuedAmmo")&&activity.briefing){target=this.lastSample.guidePosition||activity.briefing.position;
        text=this.Signalled("P012BriefingStarted")?"听罗班长交代接防任务":"随班长集结，准备前往北面阵地";requiredAction="follow";}
    }
    if (this.beat === 3) {
      target=this.lastSample.guidePosition||activity.villageRoute?.at(-1);
      interactionId=null;requiredAction="follow";text=this.Signalled("P012HubBriefingStarted")?"听班长交代前沿位置与后送路":"跟班长到村口集合";
    }
    if(this.beat===4){
      if(this.routeIndex>=route.length&&!this.Signalled("P012NorthContinue"))target=this.lastSample.guidePosition||route.at(-1);
      if(!this.facts.has("northNearMissImpact")){text="跟随班长北上";requiredAction="follow";}
      else{
        text=this.facts.has("northCovered")?"沿交通壕继续跟上班长":"炮弹落在路旁！冲进前面的路沟，压低身子";
        requiredAction=this.facts.has("northCovered")?"follow":"sprint";
        if(!this.facts.has("northCovered"))target=activity.northShelterPosition;
        if(!this.facts.has("northCovered")&&Distance(this.lastSample.position,target)<=4){
          requiredStance="crouch";requiredAction="crouch";
        }
      }
    }
    if (this.beat === 5) target = this.facts.has("ammo") ? anchors.gunports?.[1]
      : this.lastSample.carryKind === "ammoCrate" ? route[this.routeIndex] || anchors.ammoDrop : anchors.ammoPickup;
    if (this.beat === 5 && !this.facts.has("ammo")) interactionId = this.lastSample.carryKind !== "ammoCrate"
      ? "p012_ammoPickup" : this.routeIndex >= route.length ? "p012_ammoDrop" : null;
    if (this.beat === 5 && this.lastSample.carryKind === "ammoCrate") text = "沿狗腿交通壕搬运弹药，送到机枪阵位";
    if (this.beat === 8) { target = anchors.gunports?.[2]; text = "低姿移到东侧枪眼，压制村墙边的机枪"; }
    if (this.beat === 9) { target = anchors.gunports?.[1]; text = `${this.completionReasons[8] === "threatCleared" ? "机枪威胁已清除" : "友军机枪已恢复射击"}；听掷弹筒预警，低姿离开旧落点，转移到中央枪眼`; }
    if (this.beat === 10) { target = anchors.gunports?.[0]; text = "转向西侧枪眼，封锁铁路涵洞"; }
    if ([8, 10].includes(this.beat) && Distance(this.lastSample.position, target) > 3) {
      requiredStance = "prone";
      text = `卧倒沿连续胸墙横移，前往${this.beat === 8 ? "东侧" : "西侧"}枪眼`;
    }
    if (this.beat === 9 && this.mortarEscapeFrom) {
      const origin = this.mortarEscapeFrom;
      const mgStatus = this.completionReasons[8] === "threatCleared" ? "机枪威胁已清除；" : "友军机枪已恢复射击；";
      const safePort = [anchors.gunports?.[1], anchors.gunports?.[0], anchors.gunports?.[2]]
        .find((point) => point && Distance(point, origin) >= 8) || anchors.gunports?.[1];
      if (Distance(this.lastSample.position, origin) < 6 && safePort) {
        const length = Distance(origin, safePort) || 1;
        target = { x: origin.x + (safePort.x - origin.x) * Math.min(1, 8 / length),
          z: origin.z + (safePort.z - origin.z) * Math.min(1, 8 / length) };
        requiredAction = "sprint"; requiredStance = "stand";
        text = `${mgStatus}掷弹筒预警！先冲刺离开落点六米，再卧倒换位`;
      } else {
        target = safePort;
        if (Distance(this.lastSample.position, target) > 3
          || Number(this.lastSample.nearEnemyDeaths ?? this.lastSample.enemyDeaths) >= 11) requiredStance = "prone";
        text = `${mgStatus}已离开落点，卧倒沿连续胸墙转移到安全枪眼`;
      }
    }
    if (this.beat === 9 && !this.unlockedWaves.includes(3)) {
      target = anchors.gunports?.[1]; requiredStance = "prone"; requiredAction = "move";
      text = `${this.completionReasons[8] === "threatCleared" ? "机枪威胁已清除" : "友军机枪已恢复射击"}；沿胸墙低姿调整到中央枪眼，必要时装填并留意东侧动静`;
    }
    if (this.beat === 11) { target = activity.woundedDragFrom; interactionId = "p012_woundedCheck"; }
    if (this.beat === 11 && this.facts.has("wounded")) {
      if (!this.lastSample.woundedDragDelivered) {
        const dragging = this.lastSample.carryKind === "wounded";
        target = dragging ? route[this.routeIndex] || activity.woundedDragTo : activity.woundedDragFrom;
        interactionId = dragging ? null : "p012_woundedDrag"; text = "把伤员沿交通壕拖回掩蔽部";
      } else { target = activity.woundedDragTo; interactionId = null; requiredAction = "reload"; text = "安置伤员后重新装填步枪"; }
    }
    if (this.beat === 12) {
      const rendezvous=activity.woundedDragTo||anchors.shelter;
      target=Distance(this.lastSample.guidePosition,rendezvous)<3?this.lastSample.guidePosition:rendezvous;
      interactionId="p012_volunteer";
    }
    if (this.beat === 12 && this.facts.has("volunteer")) {
      interactionId = null; text = "已报名护送；听清罗班长的接应地点，准备随担架出发";
    }
    if(this.beat===13){
      const guideRoute=activity.roadContactGuideRoute||[];
      const guideCursor=Math.max(0,Math.min(guideRoute.length-1,Number(this.lastSample.guideRouteIndex)||0));
      const followRoute=[...guideRoute.slice(0,guideCursor),this.lastSample.guidePosition].filter(Boolean);
      const followPlan=P012NextVisiblePoint(this.config.layout?.blocks||[],this.lastSample.position,
        followRoute,0,.42);
      target=followPlan.blocked?(this.lastSample.guidePosition||activity.roadContactBreach):followPlan.point;
      requiredAction="follow";
      if(this.facts.has("roadContactSeen")&&!this.facts.has("roadContactHeld")){target=activity.roadContactColumnHold;interactionId="p012_roadContactHold";requiredAction="move";text="敌人已暴露；到院墙后命令担架队停下";}
      else if(this.facts.has("roadContactHeld")&&!this.facts.has("roadContactClear")){target=route[this.routeIndex]||activity.roadContactFirePosition;lookAt=activity.roadContactEnemies?.[0]?.position;requiredAction="fight";text="沿实体侧墙到射位，清除道路上的四名日军";}
      else if(this.facts.has("roadContactClear")&&!this.facts.has("roadContactReleased")){target=activity.roadContactTailRelease;interactionId="p012_roadContactRelease";requiredAction="move";text="回到担架队尾，确认两处掩体有人后放行";}
    }
    if (this.beat === 15 && !this.facts.has("roadWounded")) {
      target = this.lastSample.roadWoundedPosition || this.lastSample.columnPosition;
      interactionId = this.lastSample.roadWoundedAtInspection ? "p012_roadWounded" : null;
      requiredAction = this.lastSample.roadWoundedAtInspection ? "move" : "follow";
      text = this.lastSample.roadWoundedAtInspection ? "检查这副真实担架上的伤员" : "随担架到墙边停靠处，留意伤员状况";
    }
    if (this.beat === 15 && this.facts.has("roadWounded")) {
      target = this.lastSample.guidePosition||activity.airObservationPosition; interactionId = null; requiredAction = "follow";
      text = "跟班长收到矮墙后；他会面向铁路交代下一步";
    }
    if (this.beat === 14 && this.routeIndex >= route.length) target = this.lastSample.columnPosition;
    if (this.beat === 14) {
      const threat = this.AmbushThreat();
      if (threat) { target = threat.cover; lookAt = threat.lookAt; requiredAction = "fight"; text = threat.label; }
      else { requiredAction = this.routeIndex >= route.length ? "follow" : "move"; }
      const alive = this.enemyRoutes.some((entry) => entry.ambushGroup !== null && entry.ambushGroup !== undefined && this.host.EnemyPosition?.(entry.handle));
      const p = this.lastSample.position;
      const protectedSegment = p && (activity.ambushProneSegments || []).some((segment) =>
        p.x >= segment.minX && p.x <= segment.maxX && p.z >= segment.minZ && p.z <= segment.maxZ
        && !this.enemyRoutes.some((entry) => entry.ambushGroup !== null && entry.ambushGroup !== undefined
          && entry.ambushGroup <= segment.afterGroup && this.host.EnemyPosition?.(entry.handle)));
      const prepareProne = p && (activity.ambushProneApproaches || []).some((segment) =>
        p.x >= segment.minX && p.x <= segment.maxX && p.z >= segment.minZ && p.z <= segment.maxZ);
      if (alive && (Distance(p, target) > 0.65 || !threat)) {
        requiredAction = protectedSegment || prepareProne ? "move" : "sprint";
        requiredStance = protectedSegment || prepareProne ? "prone" : "stand";
        text = prepareProne ? "前方胸墙很低，提前卧倒再贴墙进入" : protectedSegment ? "保持卧倒贴着胸墙进入射击窝" : "掩体之间有空档，短冲刺到下一个射击角";
      } else if (threat) text = `${text}；站起射击，装填时先卧倒`;
      if (this.Signalled("P012RoadGunSilenced")) text += this.Signalled("P012RoadCoverReached")
        ? "；前副担架已移入掩蔽" : "；道路火力已清，前副担架正从院墙后移出";
      const entryTarget = activity.ambushEntryRoute?.[this.ambushEntryIndex];
      if (entryTarget) {
        target = entryTarget; requiredAction = "move"; requiredStance = "prone";
        text = "先沿入口卧倒进入蓝色胸墙掩护，不要直冲残屋";
      } else if (threat?.index === 0) {
        target = threat.cover; requiredAction = "fight"; requiredStance = Distance(p,target) > 0.65 ? "prone" : null;
        text = this.lastSample.bleeding > 0 && this.lastSample.bandages > 0
          ? "卧倒在蓝色胸墙后，流血时按 B 包扎；装填后起身压制道路火力"
          : "在蓝色胸墙后卧倒装填，起身压制道路火力；随后继续侧绕残屋";
      }
      if(this.ambushRejoin){
        target=this.ambushRejoin.target;lookAt=null;requiredAction="move";requiredStance=null;
        text="沿原入口重新接回残屋侧翼，不要穿越院墙；现场敌情和剩余补给保持不变";
      }
    }
    if (this.beat === 16) {
      if(!this.Signalled("P012AircraftRailFire")){
        target=activity.airObservationPosition;lookAt=anchors.railPassFrom;requiredAction="observe";
        text="留在实体矮墙后，用自由视角观察铁路方向的真实航迹";
      }else if(!this.airRouteChoice){
        const choices=activity.airRouteChoices||{};
        const open=choices.open?.[0],ditch=choices.ditch?.[0];
        target=Distance(this.lastSample.position,open)<Distance(this.lastSample.position,ditch)?open:ditch;
        requiredAction="move";text="自己判断：向右走开放路更快，向左贴沟边更稳";
      }else{
        target=route[this.routeIndex]||route.at(-1);requiredAction="follow";
        text=this.airRouteChoice==="open"?"沿选定的开放路接应担架，保持队伍展开":"沿选定的沟边路接应担架，利用蓝色沟岸遮蔽";
      }
      if (Distance(this.lastSample.position,this.lastSample.columnPosition)>14) {
        target = this.lastSample.airColumnTailPosition || this.lastSample.columnPosition;
        requiredAction = "follow"; text = "后面的担架落开了，回身接住队尾再走";
      }
    }
    if (this.beat === 17) {
      if(!this.Signalled("P012AirObstacleCreated")){
        target=activity.airTurnWatchPositions?.[this.airRouteChoice]||activity.airObservationPosition;requiredAction="observe";
        text=this.Signalled("P012CrowdFire")?"扫射刚落下，确认路上伤员和翻倒小车的位置":"飞机正在转向这条路，留意担架队，寻找路沟";}
      else if(this.lastSample.carryKind==="wounded"){
        target=P012NextVisiblePoint(this.config.layout?.blocks||[],this.lastSample.position,
          activity.airRescueRoute||[activity.airRescueCover],0,this.lastSample.bodyRadius||.42).point;
        interactionId=target===activity.airRescueCover||Distance(target,activity.airRescueCover)<.01?"p012_airRescueCover":null;
        requiredAction="carry";text="从蓝色沟岸南端开口绕入，把受伤百姓送到墙后";
      }else if(!this.facts.has("airObstacleResolved")){
        const rescue=activity.airCivilianPosition,cart=activity.airCartPosition;
        const chooseRescue=Distance(this.lastSample.position,rescue)<=Distance(this.lastSample.position,cart);
        target=chooseRescue?rescue:cart;requiredAction="interact";
        interactionId=chooseRescue?"p012_airRescue":"p012_airCartClear";text="选择：靠左背起伤员送到蓝墙后，或靠右推开小车转沟边";
      }else{target=route[this.routeIndex]||route.at(-1);requiredAction="move";
        text=this.facts.has("airRescued")?"伤员已入掩体；沿沟边回接同一副担架":"小车已推开；从沟边绕过扫射路面";}
    }
    if (this.beat === 18) target = this.lastSample.columnPosition || anchors.stretcher;
    if (this.beat === 18 && !this.Signalled("P012StretcherLifted")) interactionId = "ch1_stretcher";
    if (this.beat === 18 && this.lastSample.carryKind === "stretcher") {
      target = route[this.routeIndex] || activity.stretcherCarryTo; interactionId = null;
      text = "接牢同一副担架后端，和前面的担架员沿沟边走";
    }
    if (this.beat === 19) {
      const slots = anchors.strafeSlots || [];
      target = slots.reduce((nearest, point) => Distance(this.lastSample.position, point) < Distance(this.lastSample.position, nearest) ? point : nearest, null);
      text = "飞机压下来时按 Z 并移动，扑进最近的路沟";
    }
    if (this.beat === 23) {
      const points = this.config.routes?.retreat || [];
      target = points[this.retreatPoint];
      if (!this.facts.has("retreatSmokeDeployed")) {
        const guideAtSmoke = Distance(this.lastSample.guidePosition, activity.retreatSmokeUse) < 2.5;
        if (guideAtSmoke) {
          target = activity.retreatSmokeUse; interactionId = "p012_retreatSmoke";
          text = "到撤退线点燃烟幕，掩护担架离开南路";
          if (this.completionReasons[22] === "blockadeCleared") text = "四名远哨已清除，但南路断障无法通行；点燃烟幕，护送伤员改走西沟";
        } else {
          target = this.lastSample.guidePosition || activity.retreatSmokeUse;
          requiredAction = "follow";
          text = "跟班长沿已清路沟到撤退线，再点烟改走西沟";
        }
      } else if (this.facts.has("retreatRecoveryRequired")) {
        target = Distance(this.lastSample.position, this.lastSample.columnPosition) < 8
          ? this.lastSample.columnPosition : this.RetreatRejoinTarget();
        requiredAction = Distance(this.lastSample.position, this.lastSample.columnPosition) < 8 ? "crouch" : "follow";
        text = "沿回撤沟接应实际担架队，到站后在伤员旁低姿警戒";
      } else if (this.RetreatCoverState().hold) {
        target = this.RetreatRejoinTarget(this.RetreatCoverState().point);
        requiredAction = Distance(this.lastSample.position, this.RetreatCoverState().point) < 6 ? "crouch" : "follow";
        text = "在路沟接应担架，靠近队伍后低姿掩护";
      } else if (this.retreatRejoining) {
        target = this.RetreatRejoinTarget(); requiredAction = "follow";
        text = "担架队落在后面，沿原路拐点回接，再一起撤退";
      } else {
        const lead = this.RetreatLeadTarget(target);
        if (lead) { target = this.RetreatRejoinTarget(lead); requiredAction = "follow";
          text = "在担架前方近距离引路，保持队伍一起移动"; }
      }
    }
    if (this.beat === 21) {
      if (this.routeIndex < (activity.southSupplyRouteIndex || 0)) {
        target = route[this.routeIndex]; text = "掩护担架沿已清路沟向南推进"; requiredAction = "move";
      } else { target = route[this.routeIndex] || activity.southRoom; text = "沿沟口绕进南路民房，清除近处日军";
        const threat = this.LateThreat();
        if (threat) { target = threat.cover; lookAt = threat.lookAt; requiredAction = "fight"; text = threat.label; }
        if (threat && this.lastSample.grenades > 0) text += "；可向当前火力点投掷手榴弹";
      }
    }
    if (this.beat === 20) {
      const threat = this.LateThreat(); target = threat?.cover || route[this.routeIndex] || route.at(-1);
      lookAt = threat?.lookAt || null; requiredAction = threat ? "fight" : "move";
      text = threat?.label || "守住沟边伤员，确认接近的敌人已被清除";
    }
    if (this.beat === 22) {
      target = route[this.routeIndex] || this.lastSample.guidePosition || activity.blockadeDecisionPosition;
      requiredAction = this.routeIndex < route.length || !this.lastSample.columnAtSouthAssembly ? "move" : "follow";
      lookAt = anchors.blockadePositions?.[1] || this.Point("southGunpoint");
      text = this.routeIndex < route.length ? "沿原来的安全入口回到路沟，接应两副担架"
        : !this.lastSample.columnAtSouthAssembly ? "掩护两副担架到南路沟内集合，确认无人掉队"
        : "跟班长到南路实体掩体后，确认阻滞线是否仍在交火";
      if(this.routeIndex>=route.length&&this.lastSample.columnAtSouthAssembly
        &&this.lastSample.guideAlive!==false&&Distance(this.lastSample.guidePosition,activity.blockadeDecisionPosition)<=1
        &&Distance(this.lastSample.position,activity.blockadeDecisionPosition)<=activity.blockadeDecisionRangeM){
        requiredAction="observe";
        text="班长正看向东南面的路障；留在沟岸后，查看那边的火力";
      }
    }
    if ([20, 21].includes(this.beat) && requiredAction === "fight") {
      const moving = this.enemyRoutes.find((entry) => entry.encounterBeat === this.beat
        && entry.bound?.phase === "moving" && this.host.EnemyPosition?.(entry.handle));
      if (moving) { text += "；敌人正转移到另一射击位，注意移动射手";
        lookAt = this.host.EnemyPosition(moving.handle); }
    }
    if ([21, 22].includes(this.beat)) {
      const approach = this.SouthRouteApproachTarget(target);
      if (approach) {
        target = approach; lookAt = null; requiredAction = "move";
        text = "沿已清路沟的转角接近民房入口，绕开沟岸";
      }
    }
    if (this.beat >= 24) target = this.lastSample.carryKind === "stretcher" ? anchors.shelter
      : this.lastSample.regripPosition || activity.regripPosition;
    if (this.beat === 24 && this.lastSample.carryKind !== "stretcher") interactionId = "ch1_regrip";
    if (this.beat === 19 ||
      (this.beat === 23 && (activity.retreatCoverIndices || []).includes(this.retreatPoint))) {
      if (!(this.beat === 23 && requiredAction === "follow")) requiredAction = "crouch";
    }
    if (this.beat >= 6 && this.beat <= 10 && this.frontlineAmmoRemaining > 0
      && Number(this.host.CurrentClips?.() ?? this.lastSample.clips) <= 0) {
      target = anchors.ammoDrop; interactionId = "p012_frontlineAmmo"; requiredAction = "move";
      text = `退到弹药箱补充桥夹 · 箱内剩 ${this.frontlineAmmoRemaining}`;
    }
    if ([14, 20, 21].includes(this.beat) && !this.lastSample.carryKind
      && Number(this.lastSample.ammo) === 0 && Number(this.lastSample.clips) === 0) {
      // Describe resources the player actually owns, not an assumed corpse or
      // supply location hidden behind a wall. This does not change the objective
      // target, grant ammunition, or require scavenging to finish the encounter.
      const grenades = Math.max(0, Math.floor(Number(this.lastSample.grenades) || 0));
      text += grenades > 0
        ? `；步枪打空，尚有${grenades}枚手榴弹：按住 G 准备，松开投出`
        : "；步枪打空：留意倒下士兵的枪械，靠近按 F 缴获（替换当前枪弹）";
    }
    let frontlineApproach = null;
    if (this.beat >= 6 && this.beat <= 10 && interactionId !== "p012_frontlineAmmo") {
      const port = anchors.gunports?.[this.beat === 8 ? 2 : this.beat === 10 ? 0 : 1];
      frontlineApproach = this.FrontlineApproachTarget(port);
      if (frontlineApproach) {
        target = frontlineApproach; lookAt = null; requiredAction = "move"; requiredStance = "prone";
        text = "沿反斜面中间交通壕回到枪眼，绕开两侧实体壕墙";
      }
    }
    return { text, zone: beat.zone, target, lookAt, interactionId, requiredAction, requiredStance, progress,
      routeTarget: route[this.routeIndex] || null, arrivalRadiusM: this.beat === 13 && requiredAction === "follow"
        && target === this.lastSample.guidePosition ? 2.4
        : frontlineApproach || (this.beat === 23 && requiredAction === "follow")
          || (this.beat===17&&requiredAction==="carry") ? 0.6 : this.RouteArrivalRadius() };
  }
  Snapshot() { return Clone({ beat: this.beat, elapsed: this.elapsed, enteredAt: this.enteredAt,
    facts: [...this.facts], signals: [...this.signals], visits: this.visits, travelM: this.travelM,
    sprintM: this.sprintM, airSprintM: this.airSprintM, ambushEntryIndex: this.ambushEntryIndex, lookRad: this.lookRad, gunports: [...this.gunports],
    unlockedWaves: this.unlockedWaves, spawnedTotal: this.spawnedTotal, lastWaveAt: this.lastWaveAt,
    pressureHistory: this.pressureHistory,
    stageVisits: this.stageVisits, retreatPoint: this.retreatPoint, retreatRejoining: !!this.retreatRejoining,
    routeIndex: this.routeIndex, orientationIndex: this.orientationIndex, carryTravelM: this.carryTravelM,
    closeReleasedGroup: this.closeReleasedGroup,airRouteChoice:this.airRouteChoice,
    airRescueTravelM:this.airRescueTravelM,
    observationTime: this.observationTime, mortarImpactStart: this.mortarImpactStart,
    shellObservationTime: this.shellObservationTime, shellImpactStart: this.shellImpactStart, shellTarget: this.shellTarget,
    cleanupWeaponStart: this.cleanupWeaponStart,
    frontlineAmmoRemaining: this.frontlineAmmoRemaining, frontlineAmmoDispensed: this.frontlineAmmoDispensed,
    supplyReceipts: [...this.supplyReceipts],
    southGrenadesRemaining: this.southGrenadesRemaining, grenadeStart: this.grenadeStart,
    lastSouthGrenadeEffect: this.lastSouthGrenadeEffect || null,
    completionReasons: this.completionReasons,
    mortarEscapeFrom: this.mortarEscapeFrom,
    weaponActionStart: this.weaponActionStart, retreatCovers: this.retreatCovers,
    checkpoints: this.checkpoints, checkpointId: this.checkpointId, history: this.history }); }
  Restore(snapshot) {
    this.host.HoldRetreatForCover?.(false);
    if (!snapshot || !Number.isInteger(snapshot.beat) || snapshot.beat < 0 || snapshot.beat > 25) return false;
    const next = Clone(snapshot);
    // 现有检查点只倒带玩家与任务，不复活世界中的死者；波次账单保持已发放，防重复刷敌。
    next.unlockedWaves = [...new Set([...this.unlockedWaves, ...next.unlockedWaves])];
    next.spawnedTotal = Math.max(this.spawnedTotal, next.spawnedTotal || 0);
    next.frontlineAmmoRemaining = Math.min(this.frontlineAmmoRemaining, next.frontlineAmmoRemaining ?? this.frontlineAmmoRemaining);
    next.frontlineAmmoDispensed = Math.max(this.frontlineAmmoDispensed, next.frontlineAmmoDispensed || 0);
    next.supplyReceipts = [...new Set([...this.supplyReceipts, ...(next.supplyReceipts || [])])];
    next.southGrenadesRemaining = Math.min(this.southGrenadesRemaining, next.southGrenadesRemaining ?? this.southGrenadesRemaining);
    // 爆炸与敌人伤亡属于保留的现场；旧任务检查点不能抹掉真实命中回执。
    next.lastSouthGrenadeEffect = Clone(this.lastSouthGrenadeEffect || next.lastSouthGrenadeEffect || null);
    next.facts = next.facts.filter(fact => fact !== "southGrenadeThrown");
    if (next.lastSouthGrenadeEffect) next.facts.push("southGrenadeThrown");
    Object.assign(this, next);
    this.facts = new Set(next.facts); this.signals = new Set(next.signals); this.gunports = new Set(next.gunports);
    this.supplyReceipts = new Set(next.supplyReceipts);
    for (const receipt of this.supplyReceipts) this.facts.add(receipt);
    this.last = null;
    this.ambushRejoin = null;
    this.guideStarted = false;
    this.action = P012_BEATS[this.beat].objective;
    this.host.RestoreSignals?.([...this.signals]);
    this.host.Objective?.(this.action);
    return true;
  }
  State() { return { beat: P012_BEATS[this.beat].id, beatIndex: this.beat, action: this.action,
    objective: this.CurrentObjective(),
    frontlineAmmo: { remainingClips: this.frontlineAmmoRemaining, dispensedClips: this.frontlineAmmoDispensed,
      label: this.FrontlineAmmoLabel() },
    southGrenadesRemaining: this.southGrenadesRemaining,
    lastSouthGrenadeEffect: Clone(this.lastSouthGrenadeEffect || null),
    southEnemiesCleared: this.SouthEnemiesCleared(),
    completionReasons: { ...this.completionReasons },
    elapsed: this.elapsed, airSprintM: this.airSprintM, airRouteChoice:this.airRouteChoice,
    airRescueTravelM:this.airRescueTravelM,ambushEntryIndex: this.ambushEntryIndex,
    ambushRejoin:this.ambushRejoin?{target:{...this.ambushRejoin.target},destination:{...this.ambushRejoin.destination},index:this.ambushRejoin.index,blocked:!!this.ambushRejoin.blocked}:null,
    closePressureReleased: this.closePressureReleased, closeReleasedGroup: this.closeReleasedGroup,
    stagedCloseEnemies: this.enemyRoutes.filter(entry=>entry.staging).length,
    enemyBudget: this.EnemyBudget(), spawnedTotal: this.spawnedTotal,
    scouts: this.enemyRoutes.filter(entry=>entry.scout).map(entry=>({ alive: !!this.host.EnemyPosition?.(entry.handle),
      alerted: entry.scout.alerted, reason: entry.scout.reason, routeIndex: entry.index })),
    pendingEnemies: this.pendingEnemies.length,
    totalEnemyBudget: P012_WAVES.reduce((n,w)=>n+w.count,0) + (this.config.activities?.farEnemyBudget || 0),
    routeIndex: this.routeIndex, orientationIndex: this.orientationIndex, carryTravelM: this.carryTravelM,
    retreatPoint: this.retreatPoint, retreatRejoining: !!this.retreatRejoining, retreatCovers: this.retreatCovers.slice(),
    waves: this.unlockedWaves.map((index)=>({ ...P012_WAVES[index] })), checkpointId: this.checkpointId,
    pressureHistory: this.pressureHistory.map((entry) => ({ ...entry })),
    enemyBounds: this.enemyRoutes.filter((entry) => entry.bound).map((entry) => ({ beat: entry.encounterBeat,
      group: entry.encounterGroup, slot: entry.encounterSlot, phase: entry.bound.phase, reason: entry.bound.reason || null })),
    signals: [...this.signals], facts: [...this.facts], visits: this.visits.slice(), complete: this.beat === 25 };
  }
}

export default FirstLevelP012Director;
