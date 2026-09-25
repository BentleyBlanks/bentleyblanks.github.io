import * as THREE from 'three';
import { Panel,Section,Select,Slider,Button,ButtonRow,Toggle,Note,El } from './Script_EditorUi.mjs';
import { MISSION_DIALOGUE,MISSION_VOICE_CAST,MissionVoiceSubtitle,MissionVoiceSpoken } from './Data_FirstLevelMissionDialogue.mjs';
import { MISSION_VOICE_ALIGNMENT } from './Data_FirstLevelMissionVoiceAlignment.mjs';
import { SelectP012CompanionCast } from './Data_FirstLevelP012Cast.mjs';
import { GetLugouCharacterVariantEntries } from './Script_CharacterModel.mjs';
import { BuildSpeechEnvelope,SampleSpeechEnvelope } from './Script_SpeechEnvelope.mjs';
import { FACIAL_REVIEW_DEFAULTS,FACIAL_REVIEW_STORAGE,FacialLineAt,BuildFacialReviewSamples,SampleFacialKeys,ValidateFacialReview } from './Script_FacialReview.mjs';

const Name=who=>MISSION_VOICE_CAST[who]?.[0]||who;
const Fields=[['jawGain','口型幅度',2],['wide','展唇',1],['round','圆唇',1],['brow','抬眉',1],['blink','闭眼',1]];

export class FacialEditor {
  static id='facial';
  static label='人物面部';
  static hint='配套对白、口型与表情近景检查';
  constructor(host) {
    this.host=host;this.studio=host.studio;this.cameraMode='studio';
    this.who='luo';this.time=0;this.rate=1;this.keys=[];this.note='';this.drafts={};
    this.playing=false;this.loop=false;this.reference=false;this.closed=false;this.request=0;
    this.cache=new Map();this.values={...FACIAL_REVIEW_DEFAULTS};
  }
  Enter(root) {
    this.savedView=this.host.camera.view?{...this.host.camera.view}:null;
    this.studio.Open(this.host.hideInStudio);
    this.stageSaved={pad:this.studio.pad.visible,grid:this.studio.grid.visible};this.studio.SetGridVisible(false);
    this.ctx=new AudioContext();
    this.panel=Panel({title:'人物面部',sub:'对白检查',onClose:()=>this.host.Close()});
    this.panel.root.dataset.facial='true';root.appendChild(this.panel.root);
    const body=this.panel.body;
    const pick=Section(body,'角色与配套台词');
    this.actorSelect=Select(pick,'角色',Object.keys(MISSION_VOICE_CAST).filter(who=>MISSION_DIALOGUE.some(cue=>cue.lines.some(line=>line.who===who))).map(who=>({value:who,label:Name(who)})),this.who,who=>this.SelectActor(who));
    this.actorSelect.root.setAttribute('aria-label','角色');
    this.cueSelect=Select(pick,'对白',[],null,id=>this.LoadCue(id));this.cueSelect.root.setAttribute('aria-label','配套对白');
    this.modelSelect=Select(pick,'检查模型',[],null,value=>{this.modelOverride=value;this.RebuildActor();});
    this.modelSelect.root.setAttribute('aria-label','检查模型');
    this.rigNote=Note(pick,'');this.status=Note(pick,'正在加载录音清单…');this.status.setAttribute('role','status');
    this.retry=Button(pick,'重新加载录音',()=>this.manifest?this.LoadCue(this.cue.id):this.LoadManifest());
    const camera=Section(body,'观察角度');
    ButtonRow(camera,[{label:'正面',onClick:()=>this.Frame(0)},{label:'左侧 45°',onClick:()=>this.Frame(-.78)},{label:'右侧 45°',onClick:()=>this.Frame(.78)},{label:'嘴部特写',onClick:()=>this.Frame(0,true)}]);
    Note(camera,'拖动旋转 · 滚轮缩放 · 右键拖动平移');
    this.referenceToggle=Toggle(camera,'中性表情对照',false,on=>{this.reference=on;this.ApplyPose();});
    this.faceSection=Section(body,'表情草稿');this.sliders={};
    Note(this.faceSection,'调节后记录关键帧，再保存草稿。');
    for(const [key,label,max] of Fields) {
      this.sliders[key]=Slider(this.faceSection,{label,min:0,max,step:.01,value:this.values[key],onInput:value=>{
        this.Pause();this.values[key]=value;this.manual=true;this.ApplyPose();
      }});
      this.sliders[key].root.querySelector('input').setAttribute('aria-label',label);
    }
    ButtonRow(this.faceSection,[{label:'记录当前关键帧',onClick:()=>this.AddKey()},{label:'删除当前关键帧',onClick:()=>this.DeleteKey()},{label:'恢复自动表情',onClick:()=>{this.keys=[];this.manual=false;this.SyncValues();this.Remember();}}]);
    this.keySelect=Select(this.faceSection,'关键帧',[],null,value=>this.Seek(Number(value)));this.keySelect.root.setAttribute('aria-label','表情关键帧');
    const save=Section(body,'检查记录');
    this.noteInput=El('textarea');this.noteInput.rows=3;this.noteInput.maxLength=4000;this.noteInput.placeholder='记录口型、表情与时机的问题…';this.noteInput.setAttribute('aria-label','检查备注');save.appendChild(this.noteInput);
    this.noteInput.addEventListener('input',()=>{this.note=this.noteInput.value;this.Remember();});
    ButtonRow(save,[{label:'保存本地草稿',onClick:()=>this.Save()},{label:'导出草稿',onClick:()=>this.Export()},{label:'导入草稿',onClick:()=>this.file.click()}]);
    this.file=El('input');this.file.type='file';this.file.accept='.json,application/json';this.file.hidden=true;save.appendChild(this.file);
    this.file.addEventListener('change',async()=>{const file=this.file.files[0];this.file.value='';if(!file)return;
      try {if(file.size>500000)throw Error('文件过大');this.Import(JSON.parse(await file.text()));}catch(error){this.Status(`导入失败：${error.message}`);}
    });
    Note(save,'草稿仅用于本工具预览；不改动游戏表演。');
    this.timeline=El('div','edFacialTimeline');root.appendChild(this.timeline);
    this.caption=El('div','edFacialCaption','请选择配套台词');this.timeline.appendChild(this.caption);
    this.wave=El('canvas');this.wave.width=1000;this.wave.height=80;this.wave.setAttribute('aria-label','录音波形，点击定位');this.timeline.appendChild(this.wave);
    this.wave.addEventListener('pointerdown',event=>{const rect=this.wave.getBoundingClientRect();this.Seek((event.clientX-rect.left)/rect.width*this.Duration);});
    this.scrub=Slider(this.timeline,{label:'录音时间',min:0,max:1,step:1/60,value:0,format:v=>`${v.toFixed(2)} s`,onInput:value=>this.Seek(value)});
    this.scrub.root.querySelector('input').setAttribute('aria-label','录音时间');
    const buttons=ButtonRow(this.timeline,[{label:'播放',onClick:()=>this.Play()},{label:'暂停',onClick:()=>this.Pause()},
      {label:'重播',onClick:()=>{this.Seek(this.Range[0]);this.Play();}},{label:'−1 帧',onClick:()=>this.Seek(this.CurrentTime()-1/60)},
      {label:'+1 帧',onClick:()=>this.Seek(this.CurrentTime()+1/60)}]);
    this.loopToggle=Toggle(buttons,'循环选段',false,on=>{this.loop=on;});
    Select(this.timeline,'速度',['0.25','0.5','1'].map(value=>({value,label:`${value}×`})),String(this.rate),value=>{
      const playing=this.playing;this.Pause();this.rate=Number(value);if(playing)this.Play();
    }).root.setAttribute('aria-label','播放速度');
    this.lineSelect=Select(this.timeline,'播放范围',[{value:'all',label:'整段对白'}],'all',value=>{this.lineIndex=value==='all'?null:Number(value);this.Seek(this.Range[0]);});
    this.lineSelect.root.setAttribute('aria-label','播放范围');
    this.clock=Note(this.timeline,'');
    try {const raw=JSON.parse(localStorage.getItem(FACIAL_REVIEW_STORAGE)||'{}');if(raw&&typeof raw==='object'&&!Array.isArray(raw))this.drafts=raw;}catch{this.Status('本地草稿无法读取');}
    this.SelectActor(this.who,false);this.LoadManifest();return this;
  }
  Status(message){if(!this.closed)this.status.textContent=message;}
  get Duration(){return this.buffer?.duration||0;}
  get Range(){return this.lineIndex==null?[0,this.Duration]:(this.lines?.[this.lineIndex]||[0,this.Duration]);}
  get DraftKey(){return this.cue?`${this.who}:${this.cue.id}`:'';}
  async LoadManifest() {
    try {
      const response=await fetch(new URL('./Audio/FirstLevel/Data_FirstLevelVoiceManifest.json',import.meta.url),{cache:'no-cache',signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw Error(`清单 HTTP ${response.status}`);
      const manifest=await response.json();if(this.closed)return;this.manifest=manifest;await this.LoadCue(this.cueSelect.Value());
    }catch(error){this.Status(`录音清单加载失败：${error.message}`);}
  }
  SelectActor(who,load=true) {
    this.Remember();this.Pause();this.who=who;this.actorSelect.Set(who);this.modelOverride=null;
    const cues=MISSION_DIALOGUE.filter(cue=>cue.lines.some(line=>line.who===who));
    const chosen=cues.find(cue=>cue.id===this.cue?.id)||cues.find(cue=>cue.guidance)||cues[0];
    this.cueSelect.Fill(cues.map(cue=>({value:cue.id,label:`${cue.id} · ${cue.lines.find(line=>line.who===who).text.slice(0,20)}`})),chosen?.id);
    this.RebuildActor();if(load&&this.manifest)this.LoadCue(chosen.id,false);
  }
  RebuildActor() {
    this.actor?.root.removeFromParent();this.actor?.Dispose();this.actor=null;
    // Only named companion appearances are frozen by the existing cast table.
    // Other voices can be inspected with an explicitly labelled approved model.
    const cast=SelectP012CompanionCast(this.who),kind=this.who.startsWith('ija')?'ija':'nra';
    const variants=GetLugouCharacterVariantEntries(kind);
    const variant=Number(this.modelOverride??cast?.modelVariant??variants[0].modelVariant);
    this.modelSelect.Fill(variants.map(entry=>({value:String(entry.modelVariant),label:`${entry.modelId}${!cast?' · 检查替身':''}`})),String(variant));
    this.actor=this.host.actorFactory.Create(kind,{modelVariant:variant,castId:this.who,seed:17,weapon:null});
    this.studio.stand.add(this.actor.root);this.actor.Update(0,{moveSpeed:0,elapsed:0});
    this.face=this.actor.characterRig?.facial;
    this.rigNote.textContent=!this.actor.characterRig?'模型加载失败':this.face?'已绑定面部 · 声学节奏口型（非逐音素）':`${cast&&variant===cast.modelVariant?'角色原模型':'检查替身，尚未绑定角色外观'} · 无面部骨骼，暂只能检查配音`;
    for(const control of this.faceSection.querySelectorAll('input,button,select'))control.disabled=!this.face;
    this.Frame(0);this.ApplyPose();
  }
  async LoadCue(id,remember=true) {
    if(remember)this.Remember();this.Pause();const request=++this.request;
    this.abort?.abort();this.abort=new AbortController();
    this.cue=MISSION_DIALOGUE.find(cue=>cue.id===id);this.cueSelect.Set(id);this.buffer=null;this.envelope=null;this.lines=[];this.samples=null;this.time=0;this.lineIndex=null;
    this.keys=[];this.note='';this.noteInput.value='';this.manual=false;this.SyncValues();this.ApplyPose();this.DrawWave();
    this.caption.textContent='正在加载配套录音…';this.Status('正在加载配套录音…');
    try {
      const entry=this.manifest?.cues[id];if(!entry)throw Error('配套录音尚未提供');
      let decoded=this.cache.get(entry.sha256);
      if(!decoded) {
        const response=await fetch(new URL(`./Audio/FirstLevel/${this.cue.file}?v=${entry.sha256}`,import.meta.url),{signal:this.abort.signal});
        if(!response.ok)throw Error(`录音 HTTP ${response.status}`);
        const bytes=await response.arrayBuffer();
        const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
        if(hash!==entry.sha256)throw Error('录音内容与版本不一致');
        const buffer=await this.ctx.decodeAudioData(bytes);decoded={buffer,envelope:BuildSpeechEnvelope(buffer)};
      }
      if(this.closed||request!==this.request)return;
      this.cache.set(entry.sha256,decoded);if(this.cache.size>4)this.cache.delete(this.cache.keys().next().value);
      const alignment=MISSION_VOICE_ALIGNMENT[id];
      if(alignment?.sha256!==entry.sha256||alignment.lines.length!==this.cue.lines.length||alignment.lines.some(([a,b])=>a<0||b<a||b>decoded.buffer.duration+.05))throw Error('缺少当前录音的有效说话人对齐');
      this.buffer=decoded.buffer;this.envelope=decoded.envelope;this.lines=alignment.lines;
      this.samples=BuildFacialReviewSamples(this.envelope,this.lines,this.cue,this.who);
      this.scrub.root.querySelector('input').max=String(this.Duration);
      this.lineSelect.Fill([{value:'all',label:'整段对白'},...this.cue.lines.map((line,i)=>({value:String(i),label:`${i+1}. ${Name(line.who)}：${MissionVoiceSubtitle(this.cue,i)}`}))],'all');
      const stored=this.drafts[this.DraftKey];let restored=false;
      if(stored)try {this.ApplyDraft(ValidateFacialReview(stored,this.Identity()));restored=true;}catch{this.Status('旧草稿与录音版本不符，未应用');}
      this.Seek(this.lines[this.cue.lines.findIndex(line=>line.who===this.who)][0]);
      if(!stored||restored)this.Status(restored?'已恢复本地表情草稿':'录音就绪 · 拖动时间轴检查');
    }catch(error){if(this.closed||request!==this.request||error.name==='AbortError')return;this.buffer=null;this.Status(`加载失败：${error.message}`);this.caption.textContent='录音不可用';}
  }
  Frame(angle=0,mouth=false) {
    const head=this.actor?.characterRig?.bones.head;
    const target=head?head.getWorldPosition(new THREE.Vector3()):new THREE.Vector3(0,1.55,0);
    // The source idle can turn the head relative to the torso. Head local +Y is
    // anatomical forward (the same convention as the production head hitbox).
    const forward=head?new THREE.Vector3(0,1,0).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion())):new THREE.Vector3(0,0,-1);
    target.y+=mouth?.02:.08;
    if(mouth&&this.face){
      const upper=this.face.controls.find(control=>control.name==='Face_LipUpper').bone.getWorldPosition(new THREE.Vector3());
      const lower=this.face.controls.find(control=>control.name==='Face_LipLower').bone.getWorldPosition(new THREE.Vector3());
      target.copy(upper).lerp(lower,.5);
    }
    this.studio.orbit.target.copy(target);this.studio.orbit.yaw=Math.atan2(forward.x,forward.z)+angle;this.studio.orbit.pitch=Math.asin(Math.max(-1,Math.min(1,forward.y)))+.02;this.studio.orbit.dist=mouth?.39:.82;
    this.studio.ApplyCamera();this.host.post?.NotifyCameraCut?.();
  }
  FrameViewport() {
    const width=window.innerWidth,height=window.innerHeight;
    const panel=this.panel.root.getBoundingClientRect(),timeline=this.timeline.getBoundingClientRect();
    const left=width>1050?238:8,right=panel.left-8,top=64,bottom=timeline.top;
    const key=[width,height,left,right,bottom].join(':');if(this.viewportKey===key)return;this.viewportKey=key;
    // Keep the face in the unobscured viewport without a second renderer.
    this.host.camera.setViewOffset(width,height,width/2-(left+right)/2,height/2-(top+bottom)/2,width,height);
    this.host.post?.NotifyCameraCut?.();
  }
  CurrentTime(){return this.playing?Math.min(this.Range[1],this.startedAt+(this.ctx.currentTime-this.startedClock)*this.rate):this.time;}
  async Play() {
    if(!this.buffer||this.closed)return;const request=this.request;
    try {
      await this.ctx.resume();if(this.closed||request!==this.request)return;
      this.Pause();this.manual=false;const [start,end]=this.Range;
      if(this.time<start||this.time>=end-.001)this.time=start;
      if(end<=this.time)return;
      const source=this.ctx.createBufferSource();source.buffer=this.buffer;source.playbackRate.value=this.rate;source.connect(this.ctx.destination);
      this.startedAt=this.time;this.startedClock=this.ctx.currentTime;this.source=source;this.playing=true;
      source.start(0,this.time,end-this.time);
      source.onended=()=>{if(this.source!==source)return;this.time=end;this.playing=false;source.disconnect();this.source=null;if(this.loop){this.time=start;this.Play();}};
    }catch(error){this.Status(`播放失败：${error.message}`);}
  }
  Pause() {
    this.time=this.CurrentTime();this.playing=false;
    if(this.source){this.source.onended=null;this.source.stop();this.source.disconnect();this.source=null;}
  }
  Seek(time) {
    this.Pause();this.time=Math.max(0,Math.min(this.Duration,Number.isFinite(time)?time:0));this.manual=false;
    this.SyncValues();this.ApplyPose();this.RefreshTimeline();this.host.post?.NotifyCameraCut?.();
  }
  SyncValues() {
    if(!this.manual)this.values=SampleFacialKeys(this.keys,this.time);
    for(const [key,slider] of Object.entries(this.sliders))slider.Set(this.values[key]);
    this.keySelect.Fill(this.keys.map(key=>({value:String(key.time),label:`${key.time.toFixed(3)} s`})),String(this.time));
  }
  ApplyPose() {
    if(!this.face)return;
    const index=FacialLineAt(this.lines||[],this.time),active=!!this.buffer&&index>=0&&this.cue.lines[index].who===this.who&&!this.reference;
    const sample=SampleSpeechEnvelope(this.envelope,this.time);
    this.face.time=this.time;this.face.level=active?(this.samples?.levels[Math.floor(this.time*60)]||0)*this.values.jawGain:0;
    this.face.Update(0,{speech:{active,...sample},dead:this.reference});
    if(!this.reference)for(const control of this.face.controls) {
      const {bone,name,poses}=control;
      const layers=name.includes('Lid')?[['Blink',this.values.blink]]:name.includes('Brow')?[['Open',this.values.brow]]:name==='Face_Jaw'?[]:[['Wide',this.values.wide],['Round',this.values.round]];
      for(const [pose,weight] of layers)if(weight>0&&poses[pose]){bone.position.lerp(poses[pose].position,weight);bone.quaternion.slerp(poses[pose].quaternion,weight);}
    }
    this.actor.root.updateMatrixWorld(true);
  }
  AddKey() {
    if(!this.face||!this.buffer)return;this.Pause();
    const time=Math.round(this.time*1000)/1000;
    this.keys=this.keys.filter(key=>Math.abs(key.time-time)>.001);this.keys.push({time:Math.min(time,this.Duration),values:{...this.values}});this.keys.sort((a,b)=>a.time-b.time);
    this.manual=false;this.Remember();this.SyncValues();this.Status('已记录关键帧 · 可保存本地草稿');
  }
  DeleteKey() {this.keys=this.keys.filter(key=>Math.abs(key.time-this.time)>.002);this.manual=false;this.Remember();this.SyncValues();this.ApplyPose();}
  Identity(){return {cueId:this.cue.id,who:this.who,sha256:this.manifest.cues[this.cue.id].sha256,duration:this.Duration};}
  Document(){const {duration,...identity}=this.Identity();return {version:1,...identity,keys:structuredClone(this.keys),note:this.note};}
  Remember(){if(this.buffer&&this.cue)this.drafts[this.DraftKey]=this.Document();}
  ApplyDraft(draft){this.keys=draft.keys;this.note=draft.note;this.noteInput.value=this.note;this.manual=false;this.SyncValues();this.ApplyPose();}
  Import(raw){if(!this.buffer)throw Error('请先加载配套录音');const draft=ValidateFacialReview(raw,this.Identity());this.Pause();this.ApplyDraft(draft);this.Remember();this.Status('草稿已导入，尚未保存');return true;}
  Save(){if(!this.buffer){this.Status('请先加载配套录音');return false;}try {this.Remember();localStorage.setItem(FACIAL_REVIEW_STORAGE,JSON.stringify(this.drafts));this.Status('本地草稿已保存');return true;}catch(error){this.Status(`保存失败：${error.message}`);return false;}}
  Export(){if(!this.buffer)return;this.Remember();const document=this.Document(),url=URL.createObjectURL(new Blob([JSON.stringify(document,null,2)],{type:'application/json'}));const link=El('a');link.href=url;link.download=`Data_FacialReview_${this.who}_${this.cue.id}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return document;}
  DrawWave() {
    const ctx=this.wave.getContext('2d'),w=this.wave.width,h=this.wave.height;ctx.fillStyle='#141b20';ctx.fillRect(0,0,w,h);
    if(!this.envelope)return;
    this.lines.forEach(([start,end],i)=>{ctx.fillStyle=this.cue.lines[i].who===this.who?'#81704755':'#66788722';ctx.fillRect(start/this.Duration*w,0,(end-start)/this.Duration*w,h);});
    ctx.fillStyle='#b9c3bb';for(let x=0;x<w;x++){const level=this.envelope.levels[Math.floor(x/w*this.envelope.levels.length)]||0;ctx.fillRect(x,h/2-level*28,1,Math.max(1,level*56));}
    ctx.fillStyle='#edc475';ctx.fillRect(this.time/this.Duration*w,0,2,h);
    for(const key of this.keys){ctx.fillStyle='#9ed2d5';ctx.fillRect(key.time/this.Duration*w-3,2,6,6);}
  }
  RefreshTimeline() {
    this.scrub.Set(this.time);this.DrawWave();
    const index=FacialLineAt(this.lines||[],this.time),line=this.cue?.lines[index];
    if(this.buffer)this.caption.textContent=line?`${Name(line.who)}：${MissionVoiceSubtitle(this.cue,index)}${line.lang==='ja'?` / ${MissionVoiceSpoken(this.cue,index)}`:''}`:'录音停顿';
    this.clock.textContent=`${this.playing?'播放':'定格'} · ${this.time.toFixed(3)} / ${this.Duration.toFixed(3)} s · 60 帧/秒 · 金色区间：${Name(this.who)}`;
  }
  Update() {
    this.FrameViewport();
    this.time=this.CurrentTime();if(!this.manual){this.values=SampleFacialKeys(this.keys,this.time);for(const [key,slider] of Object.entries(this.sliders))slider.Set(this.values[key]);}
    this.ApplyPose();this.RefreshTimeline();this.host.lights?.UpdateShadowFrustum(this.studio.orbit.target,new THREE.Vector3(0,0,-1));
  }
  Exit() {
    this.Remember();this.Pause();this.closed=true;++this.request;this.abort?.abort();this.ctx.close().catch(()=>{});this.cache.clear();
    this.actor?.root.removeFromParent();this.actor?.Dispose();this.actor=null;this.panel.root.remove();this.timeline.remove();
    this.studio.pad.visible=this.stageSaved.pad;this.studio.grid.visible=this.stageSaved.grid;this.studio.Close();
    if(this.savedView?.enabled){const v=this.savedView;this.host.camera.setViewOffset(v.fullWidth,v.fullHeight,v.offsetX,v.offsetY,v.width,v.height);}else this.host.camera.clearViewOffset();
  }
}
