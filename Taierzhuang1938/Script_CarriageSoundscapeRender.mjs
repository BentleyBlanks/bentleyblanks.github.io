// Local listening deliverable only. Runtime plays these stems through its live buses.
// Main dialogue remains the complete original take; no per-line cuts or concatenation.
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";
import {CARRIAGE_SOUND as C} from "./Data_FirstLevelCarriageSound.mjs";
import {MISSION_VOICE_ALIGNMENT as A} from "./Data_FirstLevelMissionVoiceAlignment.mjs";
import {MISSION_VOICE_TIMING as T} from "./Data_FirstLevelMissionVoiceTiming.mjs";
const here=path.dirname(fileURLToPath(import.meta.url));
const target=process.argv.find(arg=>arg.startsWith("--output="))?.slice(9);
if(!target||!path.isAbsolute(target))throw new Error("Supply an absolute --output= MP3 path outside delivered game assets");
fs.mkdirSync(path.dirname(target),{recursive:true});
const lead=T.TrainMeal.segments[0].wait,total=lead+T.TrainMeal.segments[0].end+T.TrainMeal.tail;
const uneasy=lead+A.TrainMeal.lines[C.uneasyLine][0];
const at=C.reactions.map(reaction=>Math.round((lead+A.TrainMeal.lines[reaction.line][1])*1000));
const graph=[
 `[0:a]atrim=duration=${total},asetpts=PTS-STARTPTS,volume=${C.trainGain*.8},afade=t=in:d=0.8,afade=t=out:st=${total-1}:d=1[rail]`,
 `[1:a]atrim=duration=${total},asetpts=PTS-STARTPTS,volume='${C.crowdGain*.8}*if(lt(t,${uneasy}),1,${C.uneasyScale})':eval=frame,afade=t=in:d=0.6,afade=t=out:st=${total-1}:d=1[crowd]`,
 `[2:a]aformat=channel_layouts=stereo,adelay=${lead*1000}|${lead*1000}[voice]`,
 `[3:a]asplit=2[c1][c2]`,
 `[c1]lowpass=f=3600,aecho=.8:.9:43|79:.1|.07,pan=stereo|c0=.8*c0|c1=.4*c0,adelay=${at[0]}|${at[0]}[left]`,
 `[c2]lowpass=f=3600,aecho=.8:.9:43|79:.1|.07,pan=stereo|c0=.4*c0|c1=.8*c0,adelay=${at[1]}|${at[1]}[right]`,
 `[rail][crowd][voice][left][right]amix=inputs=5:duration=longest:normalize=0,atrim=duration=${total},alimiter=limit=.79:level=false:latency=true[out]`,
].join(";");
const result=spawnSync(process.env.FFMPEG||"ffmpeg",["-y","-v","error",
 "-stream_loop","-1","-i",path.join(here,"Audio/Amb/AudioAmb_TrainInterior.mp3"),
 "-stream_loop","-1","-i",path.join(here,"Audio/Amb/AudioAmb_CarriageCrowd.mp3"),
 "-i",path.join(here,"Audio/FirstLevel/AudioVoice_FirstLevelTrainMeal.mp3"),
 "-i",path.join(here,"Audio/Amb/AudioAmb_CarriageRearCheer.mp3"),
 "-filter_complex",graph,"-map","[out]","-ar","44100","-ac","2","-b:a","192k",target],{encoding:"utf8",windowsHide:true});
if(result.status!==0)throw new Error(result.stderr);
console.log(JSON.stringify({file:target,seconds:total,cheersAtSeconds:at.map(ms=>ms/1000),uneasyAtSeconds:uneasy,stems:["main dialogue","rolling train","crowd conversations","rear group reactions"]}));
