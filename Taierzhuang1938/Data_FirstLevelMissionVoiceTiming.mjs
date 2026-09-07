import { MISSION_VOICE_ALIGNMENT } from "./Data_FirstLevelMissionVoiceAlignment.mjs";
// Source seconds measured from the retained Seed Audio MP3s (Whisper word timings,
// checked against the current script). Whole recordings remain unchanged.
// Delays belong to playback, not to the generated performance.
export const MISSION_VOICE_TIMING = Object.freeze({
  TrainMeal: {
    segments: [
      {id:"ShareFood",start:0,end:15.55,wait:5},
      {id:"CountAmmo",start:15.55,end:27.54,wait:4.5},
      {id:"LeaveSome",start:27.54,end:38.818,wait:3.5},
    ],
    tail: 4,
  },
  TrainShelling: {
    segments: [
      {id:"PrepareArrival",start:0,end:2.13,wait:2,endEvent:"TrainFirstShell"},
      {id:"FirstShellWarning",start:2.13,end:3.65,wait:0,gate:"trainFirstShellImpact",endEvent:"TrainNearShell"},
      {id:"WoundedSoldier",start:3.65,end:6.69,wait:0,gate:"trainSoldierWounded"},
      {id:"TakeCover",start:6.69,end:10.65,wait:.2,
        events:[{at:9.15,id:"TrainProneOrder"}]},
      {id:"CheckWound",start:10.65,end:22.544,wait:4},
    ],
    tail: 2,
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
