import { MISSION_TUNING as R } from "./Data_FirstLevelMission.mjs";
import { MISSION_ROUTES, MISSION_ANCHORS as A, MISSION_PLACEMENT } from "./Data_FirstLevelMissionLayout.mjs";
export function MissionRouteLength(route) {
  return route.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - route[i].x, p.z - route[i].z), 0);
}
export function MissionRoutePoint(route, distance) {
  let left = Math.max(0, distance);
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1],
      b = route[i],
      length = Math.hypot(b.x - a.x, b.z - a.z);
    if (left <= length || i === route.length - 1) {
      const t = Math.min(1, left / (length || 1));
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, yaw: Math.atan2(a.x - b.x, a.z - b.z) };
    }
    left -= length;
  }
  return { ...route[0], yaw: 0 };
}
export function MissionRouteProjection(route, point) {
  let nearest=Infinity, progress=0, bestProgress=0;
  for(let i=1;i<route.length;i++) {
    const a=route[i-1],b=route[i],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
    const t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.z-a.z)*dz)/(length*length||1)));
    const distance=Math.hypot(point.x-a.x-dx*t,point.z-a.z-dz*t);
    if(distance<nearest){nearest=distance;bestProgress=progress+t*length;}
    progress+=length;
  }
  return { progress: bestProgress, distance: nearest };
}
export function MissionRouteLookahead(route, point, lead=R.guideLookaheadM) {
  return MissionRoutePoint(route, MissionRouteProjection(route,point).progress+lead);
}
export function MissionRouteBetween(route, from, to) {
  const start=MissionRouteProjection(route,from).progress, end=MissionRouteProjection(route,to).progress;
  let progress=0;
  const middle=[];
  for(let i=1;i<route.length;i++){
    progress+=Math.hypot(route[i].x-route[i-1].x,route[i].z-route[i-1].z);
    if(progress>Math.min(start,end)&&progress<Math.max(start,end))middle.push(route[i]);
  }
  if(start>end)middle.reverse();
  return [{x:from.x,z:from.z},MissionRoutePoint(route,start),...middle,MissionRoutePoint(route,end),{x:to.x,z:to.z}];
}
export class FirstLevelMissionColumn {
  constructor() {
    this.route = [...MISSION_ROUTES.south, ...MISSION_ROUTES.village.slice(1)];
    this.length = MissionRouteLength(this.route);
    this.litters = Array.from({ length: R.litterCount }, (_, i) => ({
      id: `Litter${i}`,
      zhou: i === R.zhouQueueIndex,
      progress: (R.litterCount - i) * R.litterSpacingM,
      ...MissionRoutePoint(this.route, (R.litterCount - i) * R.litterSpacingM),
      health: 100,
      bearers: [100, 100],
      state: "waiting",
      visible: false,
      passedGate: false,
      loaded: false,
      evacuated: false,
    }));
    this.walkers = Array.from({ length: R.walkingWoundedCount + R.medicCount + R.civilianCount }, (_, i) => ({
      id: `Walker${i}`,
      progress: 80 - i * 1.35,
      ...MissionRoutePoint(this.route, 80 - i * 1.35),
      kind:
        i < R.walkingWoundedCount
          ? "wounded"
          : i < R.walkingWoundedCount + R.medicCount
            ? "medic"
            : "civilian",
      health: 100,
      visible: false,
    }));
    this.vehicles = MISSION_PLACEMENT.cartBays.map((point, i) => ({
      id: `EvacCart${i}`,
      ...point,
      yaw: Math.PI,
      load: [],
      departed: false,
      progress: 0,
      overturned: false,
      state: i === 0 ? "loading" : "waiting",
      approachRoute: [point, { x: 86, z: 123 }, { x: 80, z: 123 }, { x: 80, z: 120 }],
      approachProgress: 0,
    }));
    this.traffic = Array.from({ length: 3 }, (_, i) => ({
      id: `SouthCart${i}`,
      progress: i * 32,
      ...MissionRoutePoint(MISSION_ROUTES.southTraffic, i * 32),
      visible: false,
    }));
    this.active = false;
    this.gateOpen = false;
    this.loading = false;
    this.loadingTime = 0;
    this.departed = 0;
    this.loadEvents = [];
    this.mode = "south";
    this.replacements = 0;
    this.bearerCasualties = [];
    this.retreatDistance = 0;
  }
  get zhou() {
    return this.litters.find((litter) => litter.zhou);
  }
  Activate() {
    this.active = true;
    for (const entry of [...this.litters, ...this.walkers]) entry.visible = true;
  }
  GateProgress() {
    const index = MISSION_ROUTES.village.findIndex((p) => p.x === A.gate.x && p.z === A.gate.z);
    return (
      MissionRouteLength(MISSION_ROUTES.south) +
      MissionRouteLength(MISSION_ROUTES.village.slice(0, index + 1))
    );
  }
  QueueAhead() {
    return this.litters
      .slice(0, R.zhouQueueIndex)
      .filter((litter) => !litter.loaded && !litter.evacuated && litter.health > 0).length;
  }
  BeginZhouBoarding() {
    if (this.zhouBoarding || this.QueueAhead() > 0) return false;
    this.zhouBoarding = true;
    this.zhouBoardingStart = { x: this.zhou.x, z: this.zhou.z };
    return true;
  }
  RetreatLimit(point) {
    const index = this.route.findIndex((p) => Math.hypot(p.x - point.x, p.z - point.z) < 0.1);
    return index < 0
      ? this.length
      : Math.min(this.length, MissionRouteLength(this.route.slice(0, index + 1)) + 12);
  }
  StartFinalExit() {
    this.mode = "exit";
    for (const entry of [...this.litters, ...this.walkers].filter(
      (entry) => entry.health > 0 && !entry.zhou && !entry.loaded && !entry.evacuated,
    )) {
      if(entry.assigned)continue;
      const door = entry.bearers
        ? [
            { x: -151, z: 40 },
            { x: -151, z: 47 },
          ]
        : [];
      entry.exitRoute = [
        { x: entry.x, z: entry.z },
        ...door,
        { x: -147, z: 49 },
        ...MISSION_ROUTES.exit.slice(3, -1),
      ];
      entry.exitProgress = 0;
      entry.exitLength = MissionRouteLength(entry.exitRoute);
    }
  }
  StartReception() {
    this.mode = "reception";
    let litterRank = 0;
    for (const [i, entry] of [...this.litters, ...this.walkers].entries()) {
      if (entry.loaded || entry.evacuated || entry.health <= 0) continue;
      const rank = entry.bearers ? litterRank++ : i - this.litters.length;
      const inside = { x: -155 + (rank % 3) * 3.3, z: 29 + Math.floor(rank / 3) * 3.8 };
      const yard = { x: -162 + (rank % 14) * 1.7, z: 44.2 + Math.floor(rank / 14) * 1.4 };
      const end = entry.zhou
        ? [A.zhouPickup]
        : entry.bearers
          ? [{ x: -138, z: 49 }, { x: -151, z: 49 }, { x: -151, z: 40 }, inside]
          : [{ x: -138, z: 49 }, yard];
      const tail = [{ x: -138, z: 40 }, ...end];
      const common = entry.joinRoute || this.route,
        progress = entry.joinRoute ? entry.joinProgress : entry.progress;
      const remaining = [];
      let distance = 0;
      for (let k = 1; k < common.length; k++) {
        distance += Math.hypot(common[k].x - common[k - 1].x, common[k].z - common[k - 1].z);
        if (distance > progress && common[k].x >= -138) remaining.push(common[k]);
      }
      entry.receiveRoute = [{ x: entry.x, z: entry.z }, ...remaining, ...tail];
      entry.receiveLength = MissionRouteLength(entry.receiveRoute);
      entry.receiveProgress = 0;
    }
  }
  StartRetreat() {
    if (this.mode === "retreat") return;
    this.mode = "retreat";
    this.loading = false;
    const route = [
      { x: 74, z: 111 },
      { x: 60, z: 111 },
      ...MISSION_ROUTES.evacuation,
      ...MISSION_ROUTES.reception.slice(1),
    ];
    this.route = route;
    this.length = MissionRouteLength(route);
    this.retreatDistance = 0;
    // Assign each survivor a connection from their current position; never teleport the column.
    for (const entry of [...this.litters, ...this.walkers]) {
      entry.joinRoute = [
        { x: entry.x, z: entry.z },
        { x: 60, z: entry.z },
        { x: 54, z: 114 },
        ...route.slice(3),
      ];
      entry.joinProgress = 0;
      entry.joinLength = MissionRouteLength(entry.joinRoute);
      entry.progress = this.length - entry.joinLength;
    }
  }
  Update(dt, { moving = true, routeSafe = true, maxProgress = Infinity, player = null, SafeAt = () => routeSafe } = {}) {
    if (!this.active) return;
    this.CaptureBearerLosses();
    for (const litter of this.litters.filter((l) => l.unloadTarget && !l.unloadedFromCart)) {
      const distance = Math.hypot(litter.x - litter.unloadTarget.x, litter.z - litter.unloadTarget.z);
      const step = Math.min(1, (dt * R.litterSpeedMps) / (distance || 1));
      litter.x += (litter.unloadTarget.x - litter.x) * step;
      litter.z += (litter.unloadTarget.z - litter.z) * step;
      if (distance < 0.2) {
        litter.unloadedFromCart = true;
        litter.state = "waiting";
        litter.liftFraction = 0;
      }
    }
    for(const cart of this.vehicles) if(cart.boltedTeam) {
      const team=cart.boltedTeam;
      team.progress=Math.min(team.length,team.progress+dt*R.boltedTeamSpeedMps);
      Object.assign(team,MissionRoutePoint(team.route,team.progress));
    }
    for (const cart of this.traffic)
      if (cart.visible) {
        cart.progress += dt * R.cartSpeedMps;
        Object.assign(cart, MissionRoutePoint(MISSION_ROUTES.southTraffic, cart.progress));
        if (cart.progress >= MissionRouteLength(MISSION_ROUTES.southTraffic)) cart.visible = false;
      }
    this.UpdateBearers(dt, routeSafe, SafeAt);
    if (this.mode === "reception") {
      for (const entry of [...this.litters, ...this.walkers].filter(
        (entry) => entry.receiveRoute && !entry.received && !entry.treating && !entry.assigned,
      )) {
        if(entry.bearers && entry.health>0 && entry.bearers.some(health=>health<=0)) {
          entry.state="waiting";this.RequestBearer(entry);continue;
        }
        if (SafeAt(entry))
          entry.receiveProgress = Math.min(
            entry.receiveLength,
            entry.receiveProgress + (entry.bearers ? R.litterSpeedMps : R.walkSpeedMps) * dt,
          );
        Object.assign(entry, MissionRoutePoint(entry.receiveRoute, entry.receiveProgress));
        entry.state = "moving";
        if (entry.receiveProgress >= entry.receiveLength) {
          entry.received = true;
          entry.state = "waiting";
        }
      }
      this.SyncAssignedBearers();
      return;
    }
    if (this.mode === "exit") {
      for (const entry of [...this.litters, ...this.walkers].filter(
        (entry) => entry.exitRoute && !entry.escaped && !entry.assigned,
      )) {
        if(entry.bearers && entry.health>0 && entry.bearers.some(health=>health<=0)) {
          entry.state="waiting";this.RequestBearer(entry);continue;
        }
        if (SafeAt(entry))
          entry.exitProgress = Math.min(
            entry.exitLength,
            entry.exitProgress + (entry.bearers ? R.litterSpeedMps : R.finalEvacSpeedMps) * dt,
          );
        Object.assign(entry, MissionRoutePoint(entry.exitRoute, entry.exitProgress));
        entry.state = routeSafe ? "moving" : "waiting";
        if (entry.exitProgress >= entry.exitLength) {
          entry.escaped = true;
          entry.evacuated = true;
          entry.visible = false;
        }
      }
      this.SyncAssignedBearers();
      return;
    }
    const gateLimit = this.gateOpen ? Infinity : this.GateProgress() - 3;
    const queue = this.litters.filter(
      (litter) => litter.visible && !litter.evacuated && !litter.loaded && litter.health > 0,
    );
    for (const [i, litter] of queue.entries()) {
      if (["carried", "fallen", "critical", "placed", "loading", "unloading"].includes(litter.state))
        continue;
      if (litter.unloadedFromCart && this.mode !== "retreat") continue;
      if (litter.bearers.some(health => health <= 0)) {
        litter.state = "waiting";
        this.RequestBearer(litter);
        continue;
      }
      const ownRoute = litter.joinRoute || this.route,
        ownLength = litter.joinLength || this.length;
      const progressKey = litter.joinRoute ? "joinProgress" : "progress";
      const front = queue[i - 1],
        offset = litter.joinRoute ? ownLength - this.length : 0;
      let limit = Math.min(ownLength, gateLimit + offset, maxProgress + offset);
      if (front && !["fallen", "critical", "placed", "loading"].includes(front.state))
        limit = Math.min(limit, front.progress + offset - R.litterSpacingM);
      // Keep a real queue of separate litters at transfer, with room for player/NPC passage.
      if (!litter.joinRoute) limit = Math.min(limit, this.length - i * R.queueSpacingM);
      const canMove = moving && SafeAt(litter) && litter[progressKey] < limit - 0.05;
      if (canMove) litter[progressKey] = Math.min(limit, litter[progressKey] + R.litterSpeedMps * dt);
      const at = MissionRoutePoint(ownRoute, litter[progressKey]);
      Object.assign(litter, at, { state: canMove ? "moving" : "waiting" });
      if (!litter.joinRoute && litter.progress > this.GateProgress()) litter.passedGate = true;
      if (litter.joinRoute) litter.progress = this.length - (ownLength - litter.joinProgress);
    }
    for (const [i, walker] of this.walkers.entries()) {
      if (!walker.visible || walker.health <= 0 || walker.assigned || walker.treating || walker.rescueTarget) continue;
      const route = walker.joinRoute || this.route,
        key = walker.joinRoute ? "joinProgress" : "progress";
      const ownLength = walker.joinLength || this.length,
        offset = ownLength - this.length;
      const waitingGap = walker.joinRoute ? 0 : Math.floor(i / 2) * R.walkerSpacingM;
      const cap = Math.min(ownLength - waitingGap, gateLimit + offset - waitingGap, maxProgress + offset);
      if (moving && SafeAt(walker)) walker[key] = Math.min(cap, walker[key] + R.walkSpeedMps * dt);
      const point = MissionRoutePoint(route, walker[key]);
      const side = (i % 2 ? 1 : -1) * 1.15;
      Object.assign(walker, {
        ...point,
        x: point.x + Math.cos(point.yaw) * side,
        z: point.z - Math.sin(point.yaw) * side,
      });
      if (walker.joinRoute)
        walker.progress = Math.max(0, this.length - (walker.joinLength - walker.joinProgress));
    }
    if(this.loading)this.UpdateLoadingBay(dt);
    if (this.loading && routeSafe) this.Load(dt);
    for (const cart of this.vehicles) {
      if (cart.departed && !cart.overturned) {
        cart.progress = Math.min(cart.routeLength, cart.progress + dt * R.cartSpeedMps);
        Object.assign(cart, MissionRoutePoint(cart.route, cart.progress));
      }
      for (const [i, id] of cart.load.entries()) {
        const litter = this.litters.find((litter) => litter.id === id),
          side = i % 2 ? 0.7 : -0.7,
          back = Math.floor(i / 2) * 2.5 - 1.25;
        litter.x = cart.x + Math.cos(cart.yaw) * side - Math.sin(cart.yaw) * back;
        litter.z = cart.z - Math.sin(cart.yaw) * side - Math.cos(cart.yaw) * back;
        litter.yaw = cart.yaw;
        if (cart.departed && cart.progress >= cart.routeLength) {
          litter.visible = false;
          litter.evacuated = true;
        }
      }
    }
    this.SyncAssignedBearers();
  }
  CaptureBearerLosses() {
    for(const litter of this.litters) {
      litter.bearerLossRecorded ||= [false,false];
      for(let slot=0;slot<2;slot++) {
        if(litter.bearers[slot]>0){litter.bearerLossRecorded[slot]=false;continue;}
        if(litter.bearerLossRecorded[slot])continue;
        litter.bearerLossRecorded[slot]=true;
        if(!litter.visible)continue;
        const side=slot===0?-1:1;
        this.bearerCasualties.push({litter:litter.id,slot,
          x:litter.x-Math.sin(litter.yaw||0)*side*1.6,
          z:litter.z-Math.cos(litter.yaw||0)*side*1.6,yaw:litter.yaw||0});
        const helper=this.walkers.find(w=>w.assigned===litter.id&&w.assignedSlot===slot);
        if(helper)helper.casualtyRepresented=true;
      }
    }
  }
  SyncAssignedBearers() {
    for(const helper of this.walkers.filter(w=>w.assigned)) {
      const litter=this.litters.find(l=>l.id===helper.assigned);
      if(!litter)continue;
      if(helper.health<=0){helper.assigned=null;continue;}
      const side=helper.assignedSlot===0?-1:1;
      helper.x=litter.x-Math.sin(litter.yaw)*side*1.6;
      helper.z=litter.z-Math.cos(litter.yaw)*side*1.6;
      helper.yaw=litter.yaw;helper.progress=litter.progress;
      for(const key of ["joinRoute","joinProgress","joinLength","receiveRoute","receiveProgress","receiveLength","exitRoute","exitProgress","exitLength"])
        if(litter[key]!=null)helper[key]=litter[key];
      helper.health=Math.min(helper.health,litter.bearers[helper.assignedSlot]);
      helper.escaped=!!(litter.escaped||litter.evacuated);
      helper.evacuated=helper.escaped;
      if(helper.escaped)helper.visible=false;
      if(litter.health<=0){
        helper.assigned=null;
        const path=helper.joinRoute||this.route;
        helper[helper.joinRoute?"joinProgress":"progress"]=MissionRouteProjection(path,helper).progress;
      }
    }
  }
  RequestBearer(litter) {
    const slot=litter.bearers.findIndex(health=>health<=0);
    if(slot<0 || this.walkers.some(w=>w.rescueTarget?.litter===litter.id))return;
    const helper=this.walkers.filter(w=>w.visible&&w.health>0&&!w.assigned&&!w.rescueTarget&&!w.treating&&['medic','civilian'].includes(w.kind))
      .sort((a,b)=>Math.hypot(a.x-litter.x,a.z-litter.z)-Math.hypot(b.x-litter.x,b.z-litter.z))[0];
    if(!helper)return;
    const side=slot===0?-1:1, target={x:litter.x-Math.sin(litter.yaw)*side*1.6,z:litter.z-Math.cos(litter.yaw)*side*1.6};
    helper.rescueTarget={litter:litter.id,slot};
    const path=litter.exitRoute||litter.receiveRoute||helper.joinRoute||this.route;
    helper.rescueRoute=MissionRouteBetween(path,helper,target);
    const ward=MISSION_PLACEMENT.wardInterior;
    const inside=p=>p.x>ward.minX&&p.x<ward.maxX&&p.z>ward.minZ&&p.z<ward.maxZ;
    if(["reception","exit"].includes(this.mode) && inside(target)) {
      if(inside(helper))helper.rescueRoute=[{x:helper.x,z:helper.z},target];
      else if(helper.x>-166&&helper.x<-123&&helper.z>=43&&helper.z<55)
        helper.rescueRoute=[{x:helper.x,z:helper.z},{x:helper.x,z:49},{x:-151,z:49},{x:-151,z:40},target];
    }
    helper.rescueProgress=0;
  }
  UpdateBearers(dt,routeSafe,SafeAt=()=>routeSafe) {
    for(const helper of this.walkers.filter(w=>w.rescueTarget)) {
      const target=this.litters.find(l=>l.id===helper.rescueTarget.litter);
      if(helper.health<=0 || !target || target.health<=0 || target.bearers[helper.rescueTarget.slot]>0) {
        delete helper.rescueTarget;continue;
      }
      if(!SafeAt(helper)){helper.crouch=true;continue;}
      helper.crouch=false;
      const length=MissionRouteLength(helper.rescueRoute);
      helper.rescueProgress=Math.min(length,helper.rescueProgress+dt*R.bearerApproachMps);
      Object.assign(helper,MissionRoutePoint(helper.rescueRoute,helper.rescueProgress));
      if(length-helper.rescueProgress<R.bearerReachM) {
        target.bearers[helper.rescueTarget.slot]=Math.min(75,helper.health);
        helper.assigned=target.id;
        helper.assignedSlot=helper.rescueTarget.slot;
        delete helper.rescueTarget;
        this.replacements++;
      }
    }
  }
  UpdateLoadingBay(dt) {
    const cart = this.vehicles.find(cart => !cart.departed && !cart.overturned);
    if (!cart || cart.state === "loading") return;
    const previous = this.vehicles[this.vehicles.indexOf(cart) - 1];
    if (previous && previous.progress < R.cartClearanceM) return;
    cart.state = "approaching";
    cart.approachProgress = Math.min(MissionRouteLength(cart.approachRoute),
      cart.approachProgress + dt * R.cartApproachSpeedMps);
    Object.assign(cart, MissionRoutePoint(cart.approachRoute, cart.approachProgress));
    if (cart.approachProgress >= MissionRouteLength(cart.approachRoute)) cart.state = "loading";
  }
  Depart(cart) {
    if (cart.departed || !cart.load.length) return;
    cart.departed = true;
    cart.state = "departing";
    cart.route = [{ x: cart.x, z: cart.z }, { x: 76, z: 145 }, { x: 76, z: 174 }, { x: 76, z: 198 }];
    cart.routeLength = MissionRouteLength(cart.route);
    this.departed++;
  }
  TransferReady() {
    const ahead = this.litters.slice(0, R.zhouQueueIndex).filter(litter => litter.health > 0);
    const required = Math.min(R.cartCapacity * 2, ahead.length);
    const departing = this.vehicles.filter(cart => cart.departed).flatMap(cart => cart.load);
    return this.QueueAhead() === 0 && ahead.filter(litter => departing.includes(litter.id)).length >= required;
  }
  Load(dt) {
    const cart = this.vehicles.find(
      (cart) => !cart.departed && !cart.overturned && cart.state === "loading" && cart.load.length < R.cartCapacity,
    );
    if (!cart) return;
    const next = this.litters.find((litter) => !litter.loaded && !litter.evacuated && litter.health > 0);
    // A reduced surviving queue must not wait forever for passengers who died.
    if (cart.load.length && this.QueueAhead() === 0 && !this.TransferReady() && cart.load.length < R.cartCapacity) {
      this.Depart(cart);
      return;
    }
    if (
      !next ||
      (next.zhou && !this.zhouBoarding) ||
      !next.passedGate ||
      next.progress < this.length - R.queueSpacingM
    )
      return;
    next.state = "loading";
    const target = { x: cart.x - 2, z: cart.z },
      distance = Math.hypot(target.x - next.x, target.z - next.z);
    if (!next.loadOrigin && distance > R.loadingReachM) {
      const step = Math.min(1, (R.litterSpeedMps * dt) / distance);
      next.yaw = Math.atan2(next.x - target.x, next.z - target.z);
      next.x += (target.x - next.x) * step;
      next.z += (target.z - next.z) * step;
      return;
    }
    // The medic leaves the walking column and reaches the loading crew before checking each patient.
    if (!this.triageMedic || this.triageMedic.health<=0 || this.triageMedic.assigned) {
      this.triageMedic=this.walkers.filter(w=>w.visible&&w.health>0&&w.kind==="medic"&&!w.assigned&&!w.rescueTarget)
        .sort((a,b)=>Math.hypot(a.x-next.x,a.z-next.z)-Math.hypot(b.x-next.x,b.z-next.z))[0];
      if(this.triageMedic){
        this.triageMedic.treating=true;
        this.triageMedic.careRoute=MissionRouteBetween(this.route,this.triageMedic,{x:cart.x-3,z:cart.z});
        this.triageMedic.careProgress=0;
      }
    }
    if(this.triageMedic) {
      const medic=this.triageMedic, length=MissionRouteLength(medic.careRoute);
      medic.careProgress=Math.min(length,medic.careProgress+dt*R.medicApproachMps);
      Object.assign(medic,MissionRoutePoint(medic.careRoute,medic.careProgress));
      medic.crouch=medic.careProgress>=length;
      if(!medic.crouch)return;
    }
    // Zhou reaches the same loading bay physically; the air raid interrupts his lift aboard.
    if (next.zhou) return;
    next.loadOrigin ||= { x: next.x, z: next.z };
    next.loadTime = (next.loadTime || 0) + dt;
    const duration = R.vehicleLoadSeconds / R.cartCapacity;
    next.liftFraction = Math.min(1, Math.max(0, (next.loadTime - R.triageSeconds) / duration));
    const side = cart.load.length % 2 ? 0.7 : -0.7, back = Math.floor(cart.load.length / 2) * 2.5 - 1.25;
    const seat = { x: cart.x + Math.cos(cart.yaw) * side - Math.sin(cart.yaw) * back,
      z: cart.z - Math.sin(cart.yaw) * side - Math.cos(cart.yaw) * back };
    next.x = next.loadOrigin.x + (seat.x - next.loadOrigin.x) * next.liftFraction;
    next.z = next.loadOrigin.z + (seat.z - next.loadOrigin.z) * next.liftFraction;
    if (next.liftFraction < 1) return;
    delete next.loadOrigin;
    next.loaded = true;
    next.state = "loaded";
    cart.load.push(next.id);
    this.loadEvents.push({ litter: next.id, cart: cart.id });
    if (cart.load.length === R.cartCapacity) this.Depart(cart);
  }
  Blast(point, radius, damage, Exposed = () => true) {
    for (const litter of this.litters) {
      if (!litter.visible || litter.evacuated || litter.zhou || !Exposed(litter)) continue;
      const d = Math.hypot(point.x - litter.x, point.z - litter.z);
      if (d > radius) continue;
      const hit = damage * (1 - d / radius) ** 2;
      litter.health = Math.max(0, litter.health - hit);
      litter.bearers[0] = Math.max(0, litter.bearers[0] - hit);
      if (litter.health === 0) litter.state = "casualty";
    }
    for (const walker of this.walkers) {
      if(walker.assigned)continue;
      const d = Math.hypot(point.x - walker.x, point.z - walker.z);
      if (d < radius && Exposed(walker))
        walker.health = Math.max(0, walker.health - damage * (1 - d / radius) ** 2);
    }
  }
  AirDamage() {
    this.loading = false;
    if(this.triageMedic){this.triageMedic.treating=false;this.triageMedic.crouch=false;}
    this.triageMedic=null;
    const cart = this.vehicles.find((cart) => !cart.departed) || this.vehicles.at(-1);
    cart.overturned = true;
    const team={x:cart.x-Math.sin(cart.yaw)*4.8,z:cart.z-Math.cos(cart.yaw)*4.8};
    const route=[team,{x:94,z:134},{x:119,z:169}];
    cart.boltedTeam={...team,yaw:cart.yaw,route,progress:0,length:MissionRouteLength(route)};
    for (const litter of this.litters
      .filter((litter) => !litter.evacuated && !litter.loaded && !litter.zhou && litter.health > 0)
      .slice(0, 2)) {
      litter.state = "fallen";
      litter.bearers[1] = 0;
      litter.health = Math.min(litter.health, 30);
    }
    this.zhou.bearers[1] = 0;
    this.zhou.state = "critical";
    for (const [i, id] of cart.load.entries()) {
      const litter = this.litters.find((l) => l.id === id);
      litter.loaded = false;
      litter.state = "unloading";
      litter.unloadTarget = { x: cart.x - 5, z: cart.z + (i - 1) * R.litterSpacingM };
    }
    cart.load = [];
    this.CaptureBearerLosses();
  }
  Snapshot() {
    return structuredClone({ ...this });
  }
  Restore(saved) {
    Object.assign(this, structuredClone(saved));
  }
  State() {
    return {
      mode: this.mode,
      active: this.active,
      departed: this.departed,
      loaded: this.loadEvents.length,
      replacements: this.replacements,
      bearerCasualties: this.bearerCasualties.map(body=>({...body})),
      queueAhead: this.QueueAhead(),
      zhouBoarding: !!this.zhouBoarding,
      gatePassed: this.litters.filter((litter) => litter.passedGate).length,
      litters: this.litters.map((litter) => ({
        ...litter,
        joinRoute: undefined,
        bearers: [...litter.bearers],
      })),
      walkers: this.walkers.map((walker) => ({ ...walker, joinRoute: undefined })),
      traffic: this.traffic.map((cart) => ({ ...cart })),
      vehicles: this.vehicles.map((cart) => ({ ...cart, load: [...cart.load] })),
    };
  }
}

export function MissionGuideSpeed(actor,player,target,yielding=false) {
  if(yielding)return 0;
  const dx=player.x-actor.x,dz=player.z-actor.z,distance=Math.hypot(dx,dz);
  const playerAhead=dx*(target.x-actor.x)+dz*(target.z-actor.z);
  if(playerAhead<0&&distance>R.squadWaitDistanceM)return 0;
  return playerAhead>0&&distance>R.squadCatchupDistanceM?R.squadCatchupMps:R.squadSpeedMps;
}

export function MissionSquadRoute(route, slot=0) {
  if(route.length<2)return route.map(point=>({...point}));
  const centre=[{...route[0]}];
  const AppendLine=point=>{
    const from=centre.at(-1),distance=Math.hypot(point.x-from.x,point.z-from.z);
    const steps=Math.max(1,Math.ceil(distance/R.squadRouteSampleM));
    for(let i=1;i<=steps;i++)centre.push({x:from.x+(point.x-from.x)*i/steps,z:from.z+(point.z-from.z)*i/steps});
  };
  for(let i=1;i<route.length-1;i++){
    const a=route[i-1],b=route[i],c=route[i+1];
    const incoming=Math.hypot(b.x-a.x,b.z-a.z),outgoing=Math.hypot(c.x-b.x,c.z-b.z);
    const trim=Math.min(R.squadRouteCornerM,incoming*R.squadRouteCornerFraction,outgoing*R.squadRouteCornerFraction);
    const p={x:b.x+(a.x-b.x)*trim/(incoming||1),z:b.z+(a.z-b.z)*trim/(incoming||1)};
    const q={x:b.x+(c.x-b.x)*trim/(outgoing||1),z:b.z+(c.z-b.z)*trim/(outgoing||1)};
    AppendLine(p);
    for(let j=1;j<=R.squadRouteCornerSamples;j++){const t=j/R.squadRouteCornerSamples,u=1-t;centre.push({x:u*u*p.x+2*u*t*b.x+t*t*q.x,z:u*u*p.z+2*u*t*b.z+t*t*q.z});}
  }
  AppendLine(route.at(-1));
  centre[centre.length-1]={...route.at(-1)};
  const lane=R.squadRouteLanesM[slot%R.squadRouteLanesM.length];
  return centre.map((point,i)=>{
    const a=centre[Math.max(0,i-1)],b=centre[Math.min(centre.length-1,i+1)];
    const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz)||1;
    const taper=Math.min(1,Math.hypot(point.x-route.at(-1).x,point.z-route.at(-1).z)/R.squadRouteExitBlendM);
    return {x:point.x-dz/length*lane*taper,z:point.z+dx/length*lane*taper};
  });
}
export function MissionSquadPace({speed,slot=0,yaw,target,position,gap=Infinity,previous=0,dt=0}) {
  if(speed<=0 || gap<=R.squadSpacingM)return 0;
  const bearing=Math.atan2(position.x-target.x,position.z-target.z);
  const turn=Math.abs(Math.atan2(Math.sin(bearing-yaw),Math.cos(bearing-yaw)));
  const corner=Math.max(R.squadTurnSpeedFloor,Math.cos(Math.min(Math.PI/2,turn)));
  const spacing=Math.min(1,(gap-R.squadSpacingM)/R.squadGapEaseM);
  const desired=speed*R.squadStrideScales[slot%R.squadStrideScales.length]*corner*spacing;
  return previous+(desired-previous)*(1-Math.exp(-dt/R.squadSpeedBlendS));
}
