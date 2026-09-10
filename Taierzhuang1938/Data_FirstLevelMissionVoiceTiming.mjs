import { MISSION_VOICE_ALIGNMENT } from "./Data_FirstLevelMissionVoiceAlignment.mjs";
import { CARRIAGE_SOUND } from "./Data_FirstLevelCarriageSound.mjs";
// Source seconds measured from the retained Seed Audio MP3s (Whisper word timings,
// checked against the current script). Whole recordings remain unchanged.
// Delays belong to playback, not to the generated performance.
export const MISSION_VOICE_TIMING = Object.freeze({
  TrainMeal: {
    segments: [
      {id:"CarriageExchange",start:0,end:88.842,wait:5,
        events:[{at:MISSION_VOICE_ALIGNMENT.TrainMeal.lines[1][1],id:"TrainFoodReceived"},
          ...CARRIAGE_SOUND.reactions.map(reaction=>({at:MISSION_VOICE_ALIGNMENT.TrainMeal.lines[reaction.line][1],id:reaction.id})),
          {at:MISSION_VOICE_ALIGNMENT.TrainMeal.lines[CARRIAGE_SOUND.uneasyLine][0],id:"CarriageUneasy"}]},
    ],
    tail: 4,
  },
  TrainShelling: {
    segments: [
      {id:"FirstShellWarning",start:0,end:2.12,wait:.3,gate:"trainFirstShellImpact",endEvent:"TrainNearShell"},
      {id:"BrakeAndCover",start:2.12,end:4.76,wait:0,startEvent:"TrainProneOrder"},
      {id:"WoundedSoldier",start:4.76,end:6.44,wait:0,gate:"trainSoldierWounded"},
      {id:"TakeCover",start:6.44,end:9.32,wait:.2},
      {id:"CheckWound",start:9.32,end:17,wait:2.5},
      {id:"EmergencyUnload",start:17,end:20.036,wait:.5,gate:"trainStopped"},
    ],
    tail: 1,
  },
  AircraftReturn: {
    segments:[{id:"ReturnAndDive",start:0,end:5.721,wait:0,events:[{at:4.58,id:"AircraftDiveOrder"}]}],tail:0,
  },
  EscapeWhisper: {
    segments: [{id:"PrivateExchange",start:0,end:9.143,wait:3}],
    tail: 1,
  },
});
export function MissionVoiceTimeline(cue, total) {
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
