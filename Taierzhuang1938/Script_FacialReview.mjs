import { CHARACTER_SPEECH as C } from './Data_Tuning_CharacterSpeech.mjs';
import { SampleSpeechEnvelope } from './Script_SpeechEnvelope.mjs';

export const FACIAL_REVIEW_DEFAULTS = Object.freeze({jawGain:1, wide:0, round:0, brow:0, blink:0});
export const FACIAL_REVIEW_STORAGE = 'tengxian1938_facial_review_v1';
export function FacialLineAt(lines, time) {
  return lines.findIndex(([start,end]) => time >= start && time < end);
}
// Precompute the same attack/release as gameplay so seeking backwards and slow
// playback produce the same expression at the same source-recording time.
export function BuildFacialReviewSamples(envelope, lines, cue, who) {
  const stepS=1/60, levels=new Float32Array(Math.ceil(envelope.duration/stepS)+1);
  let level=0;
  for(let i=0;i<levels.length;i++) {
    const time=i*stepS, index=FacialLineAt(lines,time);
    const active=index>=0 && cue.lines[index].who===who;
    const target=active?SampleSpeechEnvelope(envelope,time).level:0;
    level=active?level+(target-level)*(1-Math.exp(-stepS/(target>level?C.attackS:C.releaseS))):0;
    levels[i]=level;
  }
  return {stepS,levels};
}
export function SampleFacialKeys(keys,time) {
  if(!keys.length)return {...FACIAL_REVIEW_DEFAULTS};
  const next=keys.findIndex(key=>key.time>time);
  if(next===0)return {...keys[0].values};
  if(next<0)return {...keys.at(-1).values};
  const a=keys[next-1],b=keys[next],t=(time-a.time)/(b.time-a.time);
  return Object.fromEntries(Object.keys(FACIAL_REVIEW_DEFAULTS).map(key=>[key,a.values[key]+(b.values[key]-a.values[key])*t]));
}
export function ValidateFacialReview(raw, {cueId,who,sha256,duration}) {
  if(raw?.version!==1 || raw.cueId!==cueId || raw.who!==who || raw.sha256!==sha256)
    throw Error('角色、台词或录音版本不匹配');
  if(!Array.isArray(raw.keys)||raw.keys.length>1000)throw Error('关键帧格式无效');
  const keys=raw.keys.map(key=>{
    if(!Number.isFinite(key.time)||key.time<0||key.time>duration)throw Error('关键帧时间超出录音');
    const values={};
    for(const name of Object.keys(FACIAL_REVIEW_DEFAULTS)) {
      const value=key.values?.[name];
      if(!Number.isFinite(value)||value<0||value>(name==='jawGain'?2:1))throw Error('表情数值无效');
      values[name]=value;
    }
    return {time:key.time,values};
  }).sort((a,b)=>a.time-b.time);
  if(keys.some((key,i)=>i>0&&key.time===keys[i-1].time))throw Error('关键帧时间重复');
  if(typeof raw.note!=='string'||raw.note.length>4000)throw Error('检查备注格式无效');
  return {version:1,cueId,who,sha256,keys,note:raw.note};
}
