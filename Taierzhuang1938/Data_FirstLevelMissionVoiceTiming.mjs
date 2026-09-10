import { MISSION_VOICE_ALIGNMENT } from "./Data_FirstLevelMissionVoiceAlignment.mjs";
import { CARRIAGE_SOUND } from "./Data_FirstLevelCarriageSound.mjs";
// Source seconds measured from the retained Seed Audio MP3s (Whisper word timings,
// checked against the current script). Whole recordings remain unchanged.
// Delays belong to playback, not to the generated performance.
export const MISSION_VOICE_TIMING = Object.freeze({
  AircraftReturn: {
    segments:[{id:"ReturnAndDive",start:0,end:5.721,wait:0,events:[{at:4.58,id:"AircraftDiveOrder"}]}],tail:0,
  },

});
export function MissionVoiceTimeline(cue, total) {
  // Each rebuilt exchange is aligned to its retained whole recording.
  if (["TrainMeal","TrainShelling","EscapeWhisper"].includes(cue.id)) {
    const lines=MISSION_VOICE_ALIGNMENT[cue.id].lines;
    if(cue.id==="TrainMeal")return {lines,segments:[{id:"ShareFood",start:0,end:total,wait:4,events:[{at:lines[1][1],id:"TrainFoodReceived"}]}],tail:2};
    if(cue.id==="EscapeWhisper")return {lines,segments:[{id:"PrivateExchange",start:0,end:total,wait:2}],tail:2};
    return {lines,segments:[
      {id:"FirstShellWarning",start:0,end:lines[0][1],wait:0,gate:"trainFirstShellImpact",endEvent:"TrainNearShell"},
      {id:"DerailImpact",start:lines[1][0],end:lines[3][1],wait:0,gate:"trainNearShellImpact",startEvent:"TrainProneOrder"},
      {id:"LuoRescue",start:lines[4][0],end:lines[4][1],wait:0,gate:"trainStopped",startEvent:"TrainRescue"},
      {id:"GroundFire",start:lines[5][0],end:total,wait:0,gate:"luoRescueComplete"},
    ],tail:.5};
  }
  const authored = MISSION_VOICE_TIMING[cue.id];
  const aligned = MISSION_VOICE_ALIGNMENT[cue.id];
  if (aligned) return {lines:aligned.lines,segments:authored?.segments||[{id:"WholeExchange",start:0,end:total,wait:0}],tail:authored?.tail||0};
  const weights = cue.lines.map(line => Math.max(4, line.text.length));
  const sum = weights.reduce((a,b)=>a+b,0);
  let cursor = 0;
  return {
    lines: weights.map(weight => {const start=cursor;cursor+=total*weight/sum;return [start,cursor];}),
    segments: [{id:"WholeExchange",start:0,end:total,wait:0}],
    tail: 0,
  };
}
