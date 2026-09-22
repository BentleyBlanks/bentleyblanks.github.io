// Pure movement decisions. Hosts own actor identity, collision, terrain and animation.
// Update never teleports, creates actors, advances a mission, or changes combat state.
import { SQUAD_MARCH as C, SQUAD_MARCH_PRESETS, SQUAD_MARCH_AVOID as A } from './Data_Tuning_SquadMarch.mjs';

const Clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const Distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
const Angle = a => Math.atan2(Math.sin(a),Math.cos(a));
function ValidatePoint(p){
  if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.z)||Math.abs(p.x)>100000||Math.abs(p.z)>100000)throw new Error('Invalid route coordinate');
  if(p.width!==undefined&&(!Number.isFinite(p.width)||p.width<1))throw new Error('Invalid route width');
  return {x:p.x,z:p.z,...(p.width===undefined?{}:{width:p.width})};
}
function MemberRoute(route){
  if(!Array.isArray(route)||route.length>C.maxRoutePoints)throw new Error('Invalid member route');
  return route.map(ValidatePoint);
}
// Local visibility graph around neighbours, used only after yielding.
// Terrain and navigation remain host-owned; return one swept waypoint.
function AvoidRoute(position,target,obstacles,radius,CanMoveTo){
  const distance=Distance(position,target),reach=distance;
  const end={x:position.x+(target.x-position.x)*reach/distance,z:position.z+(target.z-position.z)*reach/distance};
  const nearby=obstacles.filter(o=>Distance(o.position,position)<Math.min(A.queryRadiusM,reach+radius*3));
  const Clear=(a,b)=>{
    const d=Distance(a,b);if(d<.001)return true;
    for(const o of nearby){
      const ox=o.position.x-a.x,oz=o.position.z-a.z,k=Clamp((ox*(b.x-a.x)+oz*(b.z-a.z))/(d*d),0,1);
      if(Math.hypot(ox-(b.x-a.x)*k,oz-(b.z-a.z)*k)<Math.min(radius,Math.hypot(ox,oz))-1e-7)return false;
    }
    return true;
  };
  const nodes=[position,end];
  for(const o of nearby)for(let i=0;i<A.circleSamples;i++){
    const point={x:o.position.x+Math.cos(i*Math.PI*2/A.circleSamples)*radius*A.ringScale,z:o.position.z+Math.sin(i*Math.PI*2/A.circleSamples)*radius*A.ringScale};
    if(nearby.every(other=>Distance(other.position,point)>=radius))nodes.push(point);
  }
  const costs=nodes.map(()=>Infinity),parent=nodes.map(()=>-1),closed=new Set();costs[0]=0;
  while(closed.size<nodes.length){
    let at=-1,best=Infinity;
    for(let i=0;i<nodes.length;i++)if(!closed.has(i)&&costs[i]+Distance(nodes[i],end)<best){at=i;best=costs[i]+Distance(nodes[i],end);}
    if(at<0)return null;
    if(at===1){const route=[];while(at>0){route.unshift({...nodes[at]});at=parent[at];}return route;}
    closed.add(at);
    for(let i=1;i<nodes.length;i++){
      if(closed.has(i))continue;
      const cost=costs[at]+Distance(nodes[at],nodes[i]);
      if(cost>=costs[i]||!Clear(nodes[at],nodes[i])||at===0&&CanMoveTo?.(nodes[i])===false)continue;
      costs[i]=cost;parent[i]=at;
    }
  }
  return null;
}
export function SquadMarchRandom(seed) {
  let value=2166136261;
  for(const ch of String(seed)) value=Math.imul(value^ch.charCodeAt(0),16777619)>>>0;
  return () => {value=(value+0x6D2B79F5)>>>0;let t=value;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}
export function SquadMarchProgress(route,p){
  let nearest=Infinity,result=0,progress=0;
  for(let i=1;i<route.length;i++){
    const a=route[i-1],b=route[i],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
    if(length<.001)continue;
    const k=Clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/(length*length),i===1?-1:0,1);
    const distance=Math.hypot(p.x-a.x-dx*k,p.z-a.z-dz*k);
    if(distance<nearest){nearest=distance;result=progress+k*length;}progress+=length;
  }
  return result;
}
export function ValidateSquadMarchConfig(raw) {
  if(!raw || typeof raw!=='object')throw new Error('Expected squad configuration');
  if(raw.version!==undefined&&raw.version!==1)throw new Error('Unsupported squad configuration version');
  const config=JSON.parse(JSON.stringify(raw));
  config.version=1;
  config.count=Number(config.count??config.members?.length??6);
  if(!Number.isInteger(config.count)||config.count<1||config.count>C.maxCount)throw new Error(`Squad count must be 1–${C.maxCount}`);
  config.leaderIndex=Number(config.leaderIndex??0);
  if(!Number.isInteger(config.leaderIndex)||config.leaderIndex<0||config.leaderIndex>=config.count)throw new Error('Invalid leader index');
  config.seed=String(config.seed??17);
  config.preset=config.preset??'guided';
  if(!Object.hasOwn(SQUAD_MARCH_PRESETS,config.preset))throw new Error('Unknown march preset');
  if(!Array.isArray(config.route)||config.route.length<2||config.route.length>C.maxRoutePoints)throw new Error('Route needs 2–128 points');
  config.route=config.route.map(ValidatePoint);
  if(config.route.slice(1).every((p,i)=>Distance(p,config.route[i])<.01))throw new Error('Route has no length');
  if(config.goal){
    config.goal=ValidatePoint(config.goal);
    if(Distance(config.route.at(-1),config.goal)>.01)config.route.push({...config.goal});
    if(config.route.length>C.maxRoutePoints)throw new Error('Route including destination exceeds 128 points');
  }
  config.tuning=config.tuning??{};
  for(const [key,value] of Object.entries(config.tuning)){
    if(!Object.hasOwn(C,key)||['maxCount','maxRoutePoints'].includes(key)||!Number.isFinite(value)||value<0||value>100)throw new Error(`Invalid march tuning: ${key}`);
  }
  const t={...C,...SQUAD_MARCH_PRESETS[config.preset],...config.tuning};
  if(t.runMinS<.5||t.runMaxS<t.runMinS||t.restMinS<.2||t.restMaxS<t.restMinS||t.speedMps<.1||t.speedMps>8
    ||t.accelerationMps2<.1||t.decelerationMps2<.1||t.separationM<.4||t.spacingM<t.separationM
    ||t.restFraction<=0||t.restFraction>.5||t.resumeDistanceM>=t.waitDistanceM
    ||t.speedVariation>.5||t.leaderSpeedScale<=0||t.leaderSpeedScale>1||t.catchupM<1||t.catchupScale<1||t.catchupScale>2
    ||t.arrivalM<.05||t.localRadiusM<t.separationM||t.stopGapS<.1||t.turnRateRad<.1
    ||t.alertChance>1||t.alertMaxS<t.alertMinS||t.alertMinS<.3||t.alertRetryMinS<.5||t.alertRetryMaxS<t.alertRetryMinS
    ||t.startDelayMaxS>5||t.formationJitter>.45||t.firstRunScale<.1||t.firstRunScale>1||t.paceWobble>.3||t.paceHzMax<t.paceHzMin
    ||t.easeScale<.3||t.easeScale>1||t.regroupScale>.5||t.lookChestShare>1||!['rest','pause','ease'].includes(t.cadence??'rest'))throw new Error('Inconsistent march tuning range');
  if(config.members){
    if(!Array.isArray(config.members)||config.members.length!==config.count||config.members.some(m=>!m||m.id==null||String(m.id)==='')
      ||new Set(config.members.map(m=>String(m.id))).size!==config.count)throw new Error('Member IDs must be unique and match count');
    config.members=config.members.map(m=>({id:String(m.id),...(m.route===undefined?{}:{route:MemberRoute(m.route)})}));
  }
  return config;
}

// A stable lane and spacing per member, tapered at narrow authored route points.
export function SquadMarchRoute(route,slot,tuning=C,seed=17) {
  const rnd=SquadMarchRandom(`${seed}:lane:${slot}`);
  const singleFile=route.some(p=>p.width<A.narrowWidthM);
  const row=slot===0?0:Math.floor((slot-1)/3)+1;
  // Loose, not a parade block: jitter is a fraction of the lane spacing, and half that
  // of the row spacing. Rows are the tight axis: a later member must still be able to
  // reach a front slot past rear members already parked (corner routes, 14 people).
  const jitter=tuning.formationJitter??C.formationJitter;
  const lane=slot===0||singleFile?0:((slot-1)%3-1)*tuning.spreadM+(rnd()-.5)*2*jitter*tuning.spreadM;
  const back=slot===0?0:(singleFile?slot:row)*tuning.spacingM+(rnd()-.5)*jitter*tuning.spacingM;
  return route.map((p,i)=>{
    const a=route[Math.max(0,i-1)],b=route[Math.min(route.length-1,i+1)];
    const d=Distance(a,b)||1,dx=(b.x-a.x)/d,dz=(b.z-a.z)/d;
    const lateral=p.width?Clamp(lane,-Math.max(0,(p.width-1)/2),Math.max(0,(p.width-1)/2)):lane;
    return {x:p.x-dz*lateral-dx*back,z:p.z+dx*lateral-dz*back,...(p.width?{width:p.width}:{})};
  });
}

export class SquadMarch {
  constructor(raw) {
    this.config=ValidateSquadMarchConfig(raw);
    this.tuning={...C,...SQUAD_MARCH_PRESETS[this.config.preset],...this.config.tuning};
    this.cadence=this.tuning.cadence??'rest';
    this.time=0;this.events=[];this.members=new Map();this.outputs=new Map();this.waiting=false;
    const specs=this.config.members??Array.from({length:this.config.count},(_,i)=>({id:`Member${i+1}`}));
    let slot=1;
    for(let i=0;i<specs.length;i++){
      const spec=specs[i],id=String(spec.id),formationSlot=i===this.config.leaderIndex?0:slot++;
      const route=spec.route?.map(p=>({...p}))??SquadMarchRoute(this.config.route,formationSlot,this.tuning,this.config.seed);
      this.members.set(id,this.NewMember(id,formationSlot,route));
    }
  }
  // Cadence draws (run/rest lengths) use rnd; start, pace and alert draws use a separate
  // style stream so adding a presentation choice never reshuffles the stop schedule.
  NewMember(id,slot,route){
    const t=this.tuning,rnd=SquadMarchRandom(`${this.config.seed}:${id}`),style=SquadMarchRandom(`${this.config.seed}:${id}:style`);
    const m={id,leader:slot===0,rnd,style,route,index:0,phase:'run',speed:0,runLeft:0,restLeft:0,restLength:1,restSign:1,cycles:0,lastStop:-Infinity,
      formationSlot:slot,followDistance:slot===0?0:(Math.floor((slot-1)/3)+1)*t.spacingM,stride:1+(rnd()-.5)*2*t.speedVariation,
      startLeft:slot===0?0:t.startDelayMaxS*style(),paceHz:t.paceHzMin+style()*(t.paceHzMax-t.paceHzMin),pacePhase:style()*Math.PI*2,
      alert:null,alertNext:null};
    // The first window reaches lower than later ones, so first stops do not bunch at runMinS.
    const first=t.runMinS*t.firstRunScale;m.runLeft=first+rnd()*(t.runMaxS-first);
    return m;
  }
  RunDuration(m){return this.tuning.runMinS+m.rnd()*(this.tuning.runMaxS-this.tuning.runMinS);}
  SetLeader(id){
    if(!this.members.has(String(id)))throw new Error('Leader must be a squad member');
    for(const m of this.members.values()){m.leader=m.id===String(id);if(m.leader){m.followDistance=0;m.startLeft=0;this.Resume(m,'role');}}
  }
  // A slight look out to one side, hold, across to the other, hold, back to the route.
  StartAlert(m,minLength=0){
    const t=this.tuning,s=m.style,length=Math.max(minLength,t.alertMinS+s()*(t.alertMaxS-t.alertMinS));
    m.alert={at:this.time,length,sign:s()<.5?-1:1,first:t.lookYawRad*(.6+s()*.35),second:t.lookYawRad*(.6+s()*.35)};
    this.Event(m,'alert','random');return length;
  }
  AlertYaw(m){
    const a=m.alert;if(!a)return 0;
    const p=(this.time-a.at)/a.length;
    if(p>=1){m.alert=null;return 0;}
    const keys=[[0,0],[.2,a.first*a.sign],[.4,a.first*a.sign],[.64,-a.second*a.sign],[.82,-a.second*a.sign],[1,0]];
    let i=1;while(p>keys[i][0])i++;
    const [p0,v0]=keys[i-1],[p1,v1]=keys[i],k=(p-p0)/(p1-p0);
    return v0+(v1-v0)*k*k*(3-2*k);
  }
  // Members standing for a while (arrived, held) roll a low-chance alert every retry window.
  Still(m){
    const t=this.tuning;
    if(!m.alert){
      if(m.alertNext==null)m.alertNext=this.time+.4+m.style()*.8;
      else if(this.time>=m.alertNext){
        m.alertNext=this.time+t.alertRetryMinS+m.style()*(t.alertRetryMaxS-t.alertRetryMinS);
        if(m.style()<t.alertChance)this.StartAlert(m);
      }
    }
    return this.AlertYaw(m);
  }
  AddMember(id,{route=null}={}){
    id=String(id);
    if(this.members.has(id))throw new Error('Member already belongs to this squad');
    if(this.members.size>=C.maxCount)throw new Error('Squad is full');
    let slot=this.members.size?1:0;const occupied=new Set([...this.members.values()].map(m=>m.formationSlot));while(occupied.has(slot))slot++;
    const m=this.NewMember(id,slot,route==null?SquadMarchRoute(this.config.route,slot,this.tuning,this.config.seed):MemberRoute(route));
    this.members.set(id,m);this.config.count=this.members.size;return m;
  }
  RemoveMember(id){
    const m=this.members.get(String(id));if(!m)return false;
    this.members.delete(m.id);this.outputs.delete(m.id);this.config.count=this.members.size;
    if(m.leader&&this.members.size)this.SetLeader(this.members.keys().next().value);
    return true;
  }
  SetRoute(id,route){
    const m=this.members.get(String(id));if(!m)return;
    m.route=MemberRoute(route);m.index=0;m.arrived=false;this.Resume(m,'route');
  }
  Event(m,type,reason){this.events.push({id:m.id,type,reason,time:this.time});if(this.events.length>512)this.events.shift();}
  Resume(m,reason){if(m.phase!=='run')this.Event(m,'resume',reason);m.phase='run';m.runLeft=this.RunDuration(m);m.restLeft=0;m.alert=null;m.alertNext=null;
    if(reason!=='cadence'){m.avoidGoal=null;m.avoidRoute=[];}}
  Update(dt,observations,{player=null,paused=false}={}){
    if(paused||!(dt>0))return this.outputs;
    dt=Math.min(dt,.1);this.time+=dt;
    const t=this.tuning,byId=new Map(observations.map(o=>[String(o.id),o]));
    let leader=[...this.members.values()].find(m=>m.leader);
    if(byId.get(leader?.id)?.alive===false){
      const next=[...this.members.values()].find(m=>byId.get(m.id)?.alive===true);
      if(next){this.SetLeader(next.id);leader=next;}
    }
    const lead=byId.get(leader?.id);
    const progress=new Map(observations.map(o=>[String(o.id),SquadMarchProgress(this.config.route,o.position)]));
    const leadProgress=progress.get(leader?.id)??0;
    const playerProgress=player?SquadMarchProgress(this.config.route,player):-Infinity;
    const lag=Math.max(0,...[...this.members.values()].filter(m=>byId.get(m.id)?.alive!==false&&byId.get(m.id)?.active!==false&&!byId.get(m.id)?.busy)
      .map(m=>leadProgress-(progress.get(m.id)??leadProgress)-m.followDistance));
    if(player&&lead){
      const dest=leader.route[Math.min(leader.index,leader.route.length-1)],p=lead.position;
      const ahead=playerProgress>leadProgress+t.arrivalM||dest&&(player.x-p.x)*(dest.x-p.x)+(player.z-p.z)*(dest.z-p.z)>0;
      if(ahead)this.waiting=false;
      else if(Distance(player,p)>t.waitDistanceM)this.waiting=true;
      else if(Distance(player,p)<t.resumeDistanceM)this.waiting=false;
    }else this.waiting=false;
    this.outputs.clear();
    // Due-time order is stable across frames but changes between cycles; never actor-list order.
    const ordered=[...this.members.values()].sort((a,b)=>a.runLeft-b.runLeft||a.id.localeCompare(b.id));
    for(const m of ordered){
      const o=byId.get(m.id);
      // Hosts with an authored waypoint queue can retain their arrival/mission semantics.
      if(o?.route){
        const first=o.route[0],key=first?`${first.x}:${first.z}`:'';
        if(m.observedTarget!==key){m.avoidGoal=null;m.avoidRoute=[];m.observedTarget=key;}
        m.route=o.route;m.index=0;
      }
      if(!o||o.alive===false||o.active===false||o.busy){
        if(!m.suspended)this.Resume(m,o?.alive===false?'dead':'interrupted');m.suspended=true;m.speed=0;
        this.outputs.set(m.id,{id:m.id,status:o?.alive===false?'dead':'released',controlled:false,speedMps:0,lookYaw:0,breath:0});continue;
      }
      m.suspended=false;
      // Reaction delay only for a member starting from standstill; a mid-march rebuild
      // (hosts rebuild on route changes) must never make running people stop.
      if(!m.started){m.started=true;if((o.speedMps??0)>t.startStillMps)m.startLeft=0;}
      const beforeIndex=m.index;
      while(m.index<m.route.length&&Distance(o.position,m.route[m.index])<t.arrivalM)m.index++;
      if(m.index!==beforeIndex){m.avoidGoal=null;m.avoidRoute=[];}
      let target=m.route[m.index];
      if(!target){if(!m.arrived)this.Resume(m,'arrived');m.arrived=true;m.speed=0;m.startLeft=0;const lookYaw=this.Still(m);
        this.outputs.set(m.id,{id:m.id,status:'arrived',controlled:true,goal:{...o.position},speedMps:0,lookYaw,alert:m.alert?1:0,breath:0,leader:m.leader});continue;}
      m.arrived=false;
      let distance=Distance(o.position,target),dx=(target.x-o.position.x)/(distance||1),dz=(target.z-o.position.z)/(distance||1);
      const obstacles=observations.filter(other=>String(other.id)!==m.id&&other.alive!==false&&other.active!==false);
      if(player)obstacles.push({position:player,alive:true});
      // Short local avoidance, checked against neighbours and host navigation. Keeping
      // a chosen side until clear prevents a symmetric crowd from oscillating in place.
      const wasAvoiding=m.avoiding;m.avoiding=false;
      if(m.avoidGoal&&Distance(o.position,m.avoidGoal)<A.arrivalM){m.avoidRoute.shift();m.avoidGoal=m.avoidRoute[0]??null;}
      if(m.avoidGoal&&(this.time>m.avoidUntil||o.canPause===false||o.CanMoveTo?.(m.avoidGoal)===false)){m.avoidGoal=null;m.avoidRoute=[];}
      const blockers=obstacles.filter(other=>{
        const ox=other.position.x-o.position.x,oz=other.position.z-o.position.z;
        return ox*dx+oz*dz>0&&ox*dx+oz*dz<t.separationM*2&&Math.abs(ox*dz-oz*dx)<t.separationM;
      });
      const obstructed=blockers.length>0;
      m.blockedS=obstructed&&m.phase==='run'&&m.speed<A.stoppedSpeedMps?(m.blockedS||0)+dt:0;
      const settled=blockers.some(other=>{const at=this.members.get(String(other.id));return at&&at.index>=at.route.length;});
      if(!m.avoidGoal&&this.time>=(m.avoidRetryAt??0)&&obstructed&&(settled||m.blockedS>A.blockedS||wasAvoiding)&&m.phase==='run'&&(m.speed<A.startSpeedMps||wasAvoiding)&&o.canPause!==false&&!(target.width<A.narrowWidthM)){
        m.avoidRetryAt=this.time+A.retryS;
        const best=AvoidRoute(o.position,target,obstacles,t.separationM*A.clearanceScale,o.CanMoveTo);
        if(best?.length){m.avoidRoute=best;m.avoidGoal=best[0];m.avoidUntil=this.time+A.timeoutS;}

      }
      if(m.avoidGoal){target=m.avoidGoal;distance=Distance(o.position,target);dx=(target.x-o.position.x)/(distance||1);dz=(target.z-o.position.z)/(distance||1);m.avoiding=true;}
      let gap=Infinity;
      for(const other of obstacles){
        // The guide owns the head of the column. Followers can bunch into his
        // wait point while he rallies the player; once released, they must not
        // keep his speed clamped to zero by the ordinary follower-separation
        // rule. Static obstacles and the player still use avoidance above.
        if(m.leader&&this.members.has(String(other.id)))continue;
        const ox=other.position.x-o.position.x,oz=other.position.z-o.position.z,forward=ox*dx+oz*dz;
        const across=Math.abs(ox*dz-oz*dx);
        if(forward>0&&across<t.separationM)gap=Math.min(gap,forward+t.separationM-Math.sqrt(t.separationM**2-across**2));
      }
      const behind=lead&&lead!==o?Math.max(0,leadProgress-(progress.get(m.id)??leadProgress)-m.followDistance):0;
      const tooFarAhead=!m.leader&&lead&&(progress.get(m.id)??0)>leadProgress+t.spacingM*2;
      const catchup=behind>t.catchupM||playerProgress-(progress.get(m.id)??playerProgress)>t.catchupM;
      const wait=this.waiting&&(m.leader||!catchup);
      const cadence=this.cadence;
      if(m.startLeft>0){if(m.leader||catchup||o.noPause)m.startLeft=0;else m.startLeft-=dt;}
      const starting=m.startLeft>0;
      const noPause=o.noPause||m.avoiding||target.width<A.narrowWidthM||catchup||wait||starting||o.maxSpeed===0||(t.pauses===false&&cadence!=='ease');
      if(noPause||m.leader){if(m.phase!=='run')this.Resume(m,'priority');}
      if(!noPause&&!m.leader&&m.phase==='run'&&gap>t.separationM){
        // Count time actually running. A blocked member cannot "rest" while stuck.
        if((o.speedMps??m.speed)>.3)m.runLeft-=dt;
        if(m.runLeft<=0){
          const local=[...this.members.values()].filter(other=>{
            const at=byId.get(other.id);return !other.leader&&at?.alive!==false&&at?.active!==false&&at&&!at.busy&&Distance(at.position,o.position)<t.localRadiusM;
          });
          const stopped=local.filter(other=>other.phase!=='run').length;
          const last=Math.max(-Infinity,...local.map(other=>other.lastStop));
          const maxRest=Math.max(1,Math.floor(local.length*t.restFraction));
          // An eased pace never stops, so it is not bound by the host's safe-stop check.
          if(stopped<maxRest&&this.time-last>=t.stopGapS&&(cadence==='ease'||o.canPause!==false)){
            m.lastStop=this.time;m.restLength=t.restMinS+m.rnd()*(t.restMaxS-t.restMinS);m.restLeft=m.restLength;m.restSign=m.rnd()<.5?-1:1;
            if(cadence==='ease'){m.phase='ease';this.Event(m,'ease','cadence');}
            else{m.phase='brake';this.Event(m,'brake','cadence');}
          }
        }
      }
      if(m.phase==='rest'||m.phase==='ease'){
        m.restLeft-=dt;
        if(m.restLeft<=0){m.cycles++;this.Resume(m,'cadence');}
      }
      const bearing=Math.atan2(-dx,-dz),turn=Math.abs(Angle(bearing-(o.yaw??bearing)));
      let pace=m.stride;
      if(!m.leader){
        // Personal pace drifts slowly, so walk/urgent columns breathe instead of moving as one block.
        pace*=1+t.paceWobble*Math.sin(this.time*m.paceHz*Math.PI*2+m.pacePhase);
        // Outside a dead band, drift back toward the formation slot (guided relies on its slower leader).
        if(cadence!=='rest'&&!catchup&&lead&&lead!==o&&t.regroupScale>0){
          const error=leadProgress-(progress.get(m.id)??leadProgress)-m.followDistance,over=Math.abs(error)-t.regroupM;
          if(over>0)pace*=1+Math.sign(error)*Math.min(t.regroupScale,over*t.regroupScale/3);
        }
        if(m.phase==='ease')pace*=t.easeScale;
      }
      let wanted=Math.min(t.speedMps*pace*(catchup?t.catchupScale:1),o.maxSpeed??Infinity);
      if(m.leader&&!catchup&&this.members.size>1)wanted*=t.leaderSpeedScale*Clamp(1-(lag-t.catchupM*.3)/t.catchupM*.5,.55,1);
      if(tooFarAhead)wanted=Math.min(wanted,t.speedMps*t.leaderSpeedScale*.65);
      // AI hosts may aim/strafe independently of travel; body yaw must not throttle them twice.
      if(o.turnLimited!==false)wanted*=Math.max(.25,Math.cos(Math.min(Math.PI/2,turn)));
      wanted=Math.min(wanted,Math.sqrt(Math.max(0,2*t.decelerationMps2*(distance-(m.avoiding?A.brakingMarginM:t.arrivalM*.5)))));
      if(m.phase==='brake'||m.phase==='rest'||wait||starting)wanted=0;
      if(gap<t.separationM*2)wanted=Math.min(wanted,Math.max(0,(gap-t.separationM)*2));
      m.speed+=Clamp(wanted-m.speed,-t.decelerationMps2*dt,t.accelerationMps2*dt);
      if(gap<=t.separationM||o.maxSpeed===0)m.speed=0;
      if(m.phase==='brake'&&m.speed<.05&&(o.speedMps??0)<.12){
        m.phase='rest';m.speed=0;this.Event(m,'stop','cadence');
        // Low chance: this stop becomes a slight alert scan; the stop lasts the whole scan.
        if(m.style()<t.alertChance){m.restLeft=m.restLength=this.StartAlert(m,m.restLeft);}
      }
      const rest=m.phase==='rest';
      // Ordinary stops keep the eyes on the route with one small settling glance.
      const restProgress=1-m.restLeft/m.restLength;
      let lookYaw=0;
      if(rest)lookYaw=m.alert?this.AlertYaw(m):Math.sin(restProgress*Math.PI)**2*m.restSign*t.restGlanceRad;
      else if(wait&&m.speed<.05)lookYaw=this.Still(m);
      else{m.alert=null;m.alertNext=null;}
      const status=wait?'waiting':starting?'starting':m.phase==='brake'?'braking':rest?(cadence==='pause'?'pausing':'resting')
        :m.phase==='ease'?'easing':catchup?'catchup':gap<=t.separationM?'yielding':'running';
      this.outputs.set(m.id,{id:m.id,status,controlled:true,goal:{...target},arrivalM:m.avoiding?A.hostArrivalM:t.arrivalM*.5,speedMps:m.speed,
        lookYaw,alert:m.alert?1:0,breath:rest&&cadence==='rest'?1:0,leader:m.leader,index:m.index,cycles:m.cycles});
    }
    return this.outputs;
  }
  Snapshot(){return {time:this.time,waiting:this.waiting,members:[...this.outputs.values()].map(o=>({...o})),events:this.events.map(e=>({...e}))};}
}
