import { OPENING } from "./Data_FirstLevelOpening.mjs";
import { MISSION_TRAIN, MissionTrainMotion } from "./Data_FirstLevelMissionTrain.mjs";
const C=OPENING.barrage;

// A finite authored ambush around the moving carriage. Tracers stop at the
// actual first surface; shells use the shared visible ballistic projectiles.
export class FirstLevelOpeningBarrage {
  constructor(runtime){this.r=runtime;this.shells=new Set();this.impacts=[];this.shots=0;this.hits=0;}
  Begin(){
    if(this.startedAt!=null)return;
    this.startedAt=this.r.time;this.nextShotAt=0;
    this.r.Record("trainIncomingFire");
    this.r.Record("trainFirstShellLaunched");
    this.r.carriageSound.Impact();
    this.Update();
  }
  Update(){
    const r=this.r;
    if(this.startedAt==null||r.Has("trainNearShellImpact"))return;
    const age=r.time-this.startedAt;
    for(const [index,spec] of C.shells.entries()){
      if(age<spec.at||this.shells.has(index))continue;
      this.shells.add(index);
      const flight=index===0?C.firstFlightS:C.shellFlightS;
      const trainTime=r.time+(r.trainShellStartedAt==null?(r.trainClockLead||0):0);
      const offset=MissionTrainMotion(trainTime+flight,r.trainShellStartedAt,r.shellTrainOffset).offsetM;
      const target=r.Point({x:spec.x,z:MISSION_TRAIN.cars[OPENING.derailCar].z+offset+spec.z});
      const from=r.Point({x:spec.x+C.shellSourceOffset.x,z:target.z+C.shellSourceOffset.z},C.shellSourceHeightM);
      r.combat.FireShell(from,target,{flight,kind:"Shell75",radius:C.shellRadiusM,damage:0,
        OnImpact:point=>{
          this.impacts.push({index,time:r.time,point:{x:point.x,y:point.y,z:point.z}});
          if(index===0&&!r.Has("trainFirstShellImpact")){
            r.Record("trainFirstShellImpact");
            r.trainShellStartedAt=r.time;r.shellTrainOffset=r.battlefield.trainOffsetM;
          }
        }});
    }
    if(age>=C.maxSeconds||age<this.nextShotAt)return;
    // One shot per simulation frame; a slow frame does not dump a whole
    // magazine into one image or create an unbounded audio/VFX backlog.
    const index=this.shots++,burstIndex=index%C.burstShots;
    this.nextShotAt=age+C.shotIntervalS+(burstIndex===C.burstShots-1?C.burstRestS:0);
    const z=MISSION_TRAIN.cars[OPENING.derailCar].z+r.battlefield.trainOffsetM;
    const from=r.Point({x:C.shotSourceX,z:z-C.sourceLeadM+(index%C.sourceLanes)*C.sourceSpacingM},C.shotSourceHeightM);
    const to=r.Point({x:C.targetX,z:z+((index*C.targetStrideM)%C.targetSpanM)-C.targetCenterM},
      index%C.sourceLanes===0?C.wallHeightM:C.passHeightM+(index%C.heightSteps)*C.heightStepM);
    const delta=to.clone().sub(from),distance=delta.length(),direction=delta.clone().normalize();
    const hit=r.battlefield.Raycast(from,direction,distance,{terrain:true});
    if(hit)to.copy(from).addScaledVector(direction,hit.t);
    this.lastShot={time:r.time,from:{x:from.x,y:from.y,z:from.z},to:{x:to.x,y:to.y,z:to.z},speed:C.tracerSpeedMps};
    r.vfx.Tracer(from,to,{speed:C.tracerSpeedMps,kind:"ija"});
    r.audio.Play(C.shotCue,{position:from,volume:C.shotVolume});
    if(index%3===1)r.audio.Play(C.nearCue,{position:to,volume:C.nearVolume});
    if(hit){
      this.hits++;
      r.vfx.Impact(to,hit.normal||direction.clone().multiplyScalar(-1),"metal");
      if(index%3===0)r.audio.Play(C.impactCue,{position:to,volume:C.impactVolume});
    }
  }
  State(){return {startedAt:this.startedAt,shots:this.shots,surfaceHits:this.hits,shells:[...this.shells],impacts:this.impacts,lastShot:this.lastShot};}
}
