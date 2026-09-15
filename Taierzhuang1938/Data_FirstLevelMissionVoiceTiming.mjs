import { MISSION_VOICE_ALIGNMENT } from "./Data_FirstLevelMissionVoiceAlignment.mjs";
import { CARRIAGE_SOUND } from "./Data_FirstLevelCarriageSound.mjs";
// Separate exchanges wait for world facts; continuous dialogue plays intact.
export const MISSION_VOICE_TIMING = Object.freeze({});
export function MissionVoiceTimeline(cue,total) {
  const aligned=MISSION_VOICE_ALIGNMENT[cue.id];
  const weights=cue.lines.map(line=>Math.max(4,line.text.length));
  const sum=weights.reduce((a,b)=>a+b,0);let cursor=0;
  const lines=aligned?.lines.length===cue.lines.length?aligned.lines:weights.map(weight=>{
    const start=cursor;cursor+=total*weight/sum;return [start,cursor];
  });
  const segment={id:"WholeExchange",start:0,end:total,wait:0};let parallel,tail=0;
  if(cue.id==="TrainMeal"){
    segment.id="ShareFood";segment.wait=4;tail=1;
    segment.events=[{at:lines[1][1],id:"TrainFoodReceived"},
      ...CARRIAGE_SOUND.reactions.map(reaction=>({at:lines[reaction.line][1],id:reaction.id})),
      {at:lines[CARRIAGE_SOUND.uneasyLine][0],id:"CarriageUneasy"}];
  }
  if(cue.id==="TrainPack"){
    segment.id="PrivatePacking";segment.gate="trainPackNear";
    parallel=[{id:"TrainBanter",at:5,maxDistance:4}];
  }
  if(cue.id==="WreckImpact")segment.gate="trainNearShellImpact";
  if(cue.id==="TrainShelling"){
    segment.id="LuoRescue";segment.gate="trainLuoStanding";
    const start=lines[0][0],end=lines[1][1],grip=lines[1][0];
    const lift=aligned?.lines.length===2&&aligned.markers?.rescueLift||grip+(end-grip)*.18;
    const steady=aligned?.lines.length===2&&aligned.markers?.rescueFeet||grip+(end-grip)*.7;
    segment.events=[{at:start,id:"TrainRescue"},{at:grip,id:"TrainRescueGrip"},
      {at:lift,id:"TrainRescueLift"},{at:steady,id:"TrainRescueFeet"},{at:steady,id:"TrainRescueSteady"}];
  }
  if(cue.id==="WreckExit")segment.gate="luoRescueComplete";
  if(cue.id==="EscapeWhisper"){segment.wait=1;tail=2;}
  if(cue.id==="AircraftReturn")segment.events=[{at:lines[2][0],id:"AircraftDiveOrder"}];
  // Room ambush: the litter stab lands on 老周's own line, the squad orders on the last 罗班长 sentence.
  if(cue.id==="RoomAmbush")segment.events=[{at:lines[2][0],id:"AmbushZhouLine"}];
  if(cue.id==="RoomAmbushCleared")segment.events=[{at:lines[3][0],id:"AmbushLuoOrders"}];
  return {lines,segments:[segment],tail,...(parallel?{parallel}:{})};
}
