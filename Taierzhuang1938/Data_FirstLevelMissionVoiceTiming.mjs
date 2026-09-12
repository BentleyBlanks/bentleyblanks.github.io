import { MISSION_VOICE_ALIGNMENT } from "./Data_FirstLevelMissionVoiceAlignment.mjs";
import { CARRIAGE_SOUND } from "./Data_FirstLevelCarriageSound.mjs";
import { OPENING } from "./Data_FirstLevelOpening.mjs";
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
  if (["TrainMeal","TrainBanter","TrainShelling","EscapeWhisper"].includes(cue.id)) {
    const lines=MISSION_VOICE_ALIGNMENT[cue.id].lines;
    if(cue.id==="TrainMeal")return {lines,segments:[{id:"ShareFood",start:0,end:total,wait:4,events:[
      {at:lines[1][1],id:"TrainFoodReceived"},
      ...CARRIAGE_SOUND.reactions.map(reaction=>({at:lines[reaction.line][1],id:reaction.id})),
      {at:lines[CARRIAGE_SOUND.uneasyLine][0],id:"CarriageUneasy"},
    ]}],tail:2};
    // Two intact performances play together. Luo begins while Liu is still
    // counting; the retained briefing ends before He's interrupted retort.
    if(cue.id==="TrainBanter")return {lines,parallel:[{id:"TrainBriefing",at:.5}],segments:[
      {id:"BanterAndBriefing",start:0,end:total,wait:0,startEvent:"TrainBanterStart",
        events:[{at:lines[3][1],id:"TrainIncomingFire"}]},
    ],tail:0};
    if(cue.id==="EscapeWhisper")return {lines,segments:[{id:"PrivateExchange",start:0,end:total,wait:2}],tail:2};
    return {lines,segments:[
      {id:"IncomingAndReassure",start:0,end:lines[2][1],wait:0,gate:"trainFirstShellLaunched",startEvent:"TrainProneOrder",
        events:[{at:Math.max(lines[2][0],lines[2][1]-OPENING.nearShellFlightS),id:"TrainNearShell"}]},
      {id:"DerailImpact",start:lines[3][0],end:lines[4][1],wait:0,gate:"trainNearShellImpact"},
      {id:"LuoRescue",start:lines[5][0],end:lines[8][1],wait:0,gate:"trainLuoStanding",events:[
        {at:lines[6][0],id:"TrainRescue"},
        {at:lines[7][0],id:"TrainRescueGrip"},
        {at:MISSION_VOICE_ALIGNMENT.TrainShelling.markers.rescueLift,id:"TrainRescueLift"},
        {at:MISSION_VOICE_ALIGNMENT.TrainShelling.markers.rescueFeet,id:"TrainRescueFeet"},
        {at:lines[8][0],id:"TrainRescueSteady"},
      ]},
      {id:"GroundFire",start:lines[9][0],end:total,wait:0,gate:"luoRescueComplete"},
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
