import { FLOW_SOURCE, FLOW_WORLD } from "./Data_LevelFlow.mjs";
import { FLOW_SOURCE_EXCERPTS } from "./Data_LevelFlowSource.mjs";
import { BeatById, CameraAt, Clamp, EvaluateFlow, FLOW_DURATION, FLOW_TIMELINE, FormatFlowTime, STAGE_TIMELINE } from "./Script_LevelFlowModel.mjs";
import { DrawFlowCamera, FlowMapView } from "./Script_LevelFlowView.mjs";

const Element = (id) => document.getElementById(id);
const poseNames = {
  look:"转头观察", pack:"双手塞短褂", down:"趴倒、近爆冲击", kneel:"跪姿，只能转头",
  drag:"双手拖人，枪收起", shoot:"松手，举枪射击", walk:"跟随队伍", carry:"双手搬皮箱",
  throw:"拾雷、甩回", retreat:"面向北侧，边打边退", plant:"贴车放捆、拉火、退开", run:"跟班长跑",
  crouch:"蹲行，压低镜头", hold:"双手捂住妮儿的嘴", melee:"近身挥刀", vault:"踩柴垛翻墙",
};
const map = new FlowMapView(Element("flowMap"));
const layers = Object.fromEntries([...document.querySelectorAll("[data-layer]")].map((input)=>[input.dataset.layer,input.checked]));
const params = new URLSearchParams(location.search);
let time = 0, playing = false, follow = false, selection = "", cameraMode = "player", lastTimestamp = 0;
let frame = EvaluateFlow(0), shownBeat = "", shownStage = "", fitted = false;
const stageButtons = new Map(), beatButtons = new Map(), segmentButtons = new Map();

function Button(text,className,action) {
  const button=document.createElement("button");
  button.textContent=text;button.className=className;button.addEventListener("click",action);
  return button;
}

function SetPlaying(value) {
  playing=value;
  Element("playFlow").textContent=playing?"暂停":"播放";
  Element("playFlow").setAttribute("aria-pressed",String(playing));
  lastTimestamp=0;
}

function Seek(value,{fit=false}={}) {
  time=Clamp(value,0,FLOW_DURATION);frame=EvaluateFlow(time);
  if(fit) {map.Fit(frame.stage.bounds);fitted=true;}
  Render();
}

function JumpBeat(id) {
  const beat=BeatById(id);
  if(!beat) return;
  const previousStage=frame.stage.id;
  Seek(beat.start,{fit:previousStage!==beat.stage});
}

function StepBeat(direction) {
  const index=FLOW_TIMELINE.indexOf(frame.beat);
  JumpBeat(FLOW_TIMELINE[Clamp(index+direction,0,FLOW_TIMELINE.length-1)].id);
}

function PopulateNavigation() {
  for(const stage of STAGE_TIMELINE) {
    const button=Button("","lfStage",()=>Seek(stage.start,{fit:true}));
    button.dataset.stage=stage.id;
    const number=document.createElement("b");number.textContent=stage.id;
    const title=document.createElement("span");title.textContent=stage.title;
    const meta=document.createElement("small");meta.textContent=`${FormatFlowTime(stage.end-stage.start)} · ${stage.status}`;
    button.append(number,title,meta);
    if(stage.id === "08") button.classList.add("draft");
    Element("stageList").append(button);stageButtons.set(stage.id,button);
    const segment=Button(`${stage.id} ${stage.title}`,stage.status === "草稿"?"draft":"",()=>Seek(stage.start,{fit:true}));
    segment.style.flex=String(stage.end-stage.start);segment.title=`${stage.title} ${FormatFlowTime(stage.start)}–${FormatFlowTime(stage.end)}`;
    Element("timelineSegments").append(segment);segmentButtons.set(stage.id,segment);
  }
  Element("flowSeek").max=String(FLOW_DURATION);
  Element("flowNotice").textContent=FLOW_SOURCE.notice;
  Element("sourceLink").href=FLOW_SOURCE.url;
}

function UpdateInspector() {
  if(shownStage!==frame.stage.id) {
    if(shownStage && playing && !follow) map.Fit(frame.stage.bounds);
    shownStage=frame.stage.id;
    beatButtons.clear();Element("beatList").replaceChildren();
    for(const beat of frame.stage.beats) {
      const button=Button("","lfBeatButton",()=>JumpBeat(beat.id));
      const clock=document.createElement("time");clock.textContent=FormatFlowTime(beat.start-frame.stage.start);
      const name=document.createElement("span");name.textContent=beat.title;
      button.append(clock,name);button.dataset.beat=beat.id;
      Element("beatList").append(button);beatButtons.set(beat.id,button);
    }
    for(const [id,button] of stageButtons) {button.classList.toggle("selected",id===shownStage);button.setAttribute("aria-current",id===shownStage?"step":"false");}
    for(const [id,button] of segmentButtons) button.classList.toggle("selected",id===shownStage);
  }
  if(shownBeat!==frame.beat.id) {
    shownBeat=frame.beat.id;
    Element("beatId").textContent=`${frame.beat.id.toUpperCase()} · ${frame.stage.title}`;
    Element("stageStatus").textContent=`${frame.stage.status} · ${FLOW_SOURCE.revision}`;
    Element("beatTitle").textContent=frame.beat.title;
    Element("taskText").textContent=frame.beat.task;
    Element("actionText").textContent=poseNames[frame.beat.pose]??frame.beat.pose;
    Element("threatText").textContent=frame.beat.threat;
    Element("gateText").textContent=frame.beat.gate;
    Element("exitText").textContent=frame.beat.exit;
    Element("sourcePassage").textContent=FLOW_SOURCE_EXCERPTS[frame.beat.id];
    for(const [id,button] of beatButtons) {button.classList.toggle("selected",id===shownBeat);button.setAttribute("aria-current",id===shownBeat?"step":"false");}
    if(playing) beatButtons.get(shownBeat)?.scrollIntoView({block:"nearest"});
  }
  const live=frame.actors.filter((actor)=>actor.side === "enemy" && actor.kind === "person" && actor.pose !== "dead").length;
  Element("enemyCount").textContent=frame.stretchersPassed === null?`在场步兵 ${live}`:`担架 ${frame.stretchersPassed} / 12 · 日军 ${live}`;
  Element("nearestEnemy").textContent=Number.isFinite(frame.nearest)?`近敌 ${frame.nearest.toFixed(0)} m`:"近敌 —";
  Element("spawnText").textContent=frame.spawns.map((spawn)=>`${spawn.label} · ${spawn.repeat}`).join("\n") || (Number(frame.stage.id)<=2?"开场预置九名日军，反击后退走三人。":"本拍没有新增敌军。");
  Element("cameraAction").textContent=poseNames[frame.beat.pose]??frame.beat.pose;
  Element("flowTime").textContent=`${FormatFlowTime(time)} / ${FormatFlowTime(FLOW_DURATION)}`;
  Element("flowSeek").value=String(time);
  Element("previousBeat").disabled=frame.beat===FLOW_TIMELINE[0];
  Element("nextBeat").disabled=frame.beat===FLOW_TIMELINE.at(-1);
}

function Render() {
  frame=EvaluateFlow(time);
  if(!fitted) {map.Fit(frame.stage.bounds);fitted=true;}
  if(follow) map.center=[frame.player[0]+32/map.scale,frame.player[1]+3];
  UpdateInspector();
  map.Draw(frame,layers,selection);
  const camera=DrawFlowCamera(Element("flowCamera"),frame,cameraMode);
  Element("cameraHeight").textContent=`${camera.eye[1].toFixed(1)} m`;
  Element("mapScale").textContent=`${map.scale.toFixed(1)} px/m`;
}

function AnimationTick(timestamp) {
  if(playing && lastTimestamp) {
    const delta=Math.min(0.1,(timestamp-lastTimestamp)/1000)*Number(Element("flowSpeed").value);
    const end=Element("loopStage").checked?frame.stage.end:FLOW_DURATION;
    if(time+delta>=end) {
      if(Element("loopStage").checked) time=frame.stage.start+(time+delta-end);
      else {time=FLOW_DURATION;SetPlaying(false);}
    } else time+=delta;
    Render();
  }
  lastTimestamp=timestamp;
  requestAnimationFrame(AnimationTick);
}

PopulateNavigation();
Element("playFlow").addEventListener("click",()=>{
  if(time>=FLOW_DURATION) Seek(0,{fit:true});
  SetPlaying(!playing);
});
Element("previousBeat").addEventListener("click",()=>StepBeat(-1));
Element("nextBeat").addEventListener("click",()=>StepBeat(1));
Element("flowSeek").addEventListener("input",(event)=>Seek(Number(event.target.value)));
Element("fitStage").addEventListener("click",()=>{follow=false;Element("followPlayer").setAttribute("aria-pressed","false");map.Fit(frame.stage.bounds);Render();});
Element("fitAll").addEventListener("click",()=>{follow=false;Element("followPlayer").setAttribute("aria-pressed","false");map.Fit(FLOW_WORLD.bounds);Render();});
Element("followPlayer").addEventListener("click",()=>{follow=!follow;Element("followPlayer").setAttribute("aria-pressed",String(follow));Render();});
Element("cameraMode").addEventListener("change",(event)=>{cameraMode=event.target.value;Render();});
Element("expandCamera").addEventListener("click",()=>{
  const expanded=Element("cameraPanel").classList.toggle("expanded");
  Element("expandCamera").textContent=expanded?"缩小":"放大";Render();
});
for(const input of document.querySelectorAll("[data-layer]")) input.addEventListener("change",()=>{layers[input.dataset.layer]=input.checked;Render();});
document.addEventListener("keydown",(event)=>{
  if(event.target.matches("input,select,textarea,button,a,summary")) return;
  if(event.code === "Space") {event.preventDefault();SetPlaying(!playing);}
  if(event.code === "ArrowLeft" || event.code === "ArrowRight") {event.preventDefault();Seek(time+(event.code === "ArrowRight"?1:-1)*(event.shiftKey?5:1));}
  if(event.key === "[") StepBeat(-1);
  if(event.key === "]") StepBeat(1);
});
let drag=null;
const canvas=Element("flowMap");
canvas.addEventListener("pointerdown",(event)=>{
  canvas.setPointerCapture(event.pointerId);canvas.focus();
  drag={x:event.clientX,y:event.clientY,center:[...map.center],moved:false};
});
canvas.addEventListener("pointermove",(event)=>{
  const rect=canvas.getBoundingClientRect(),point=[event.clientX-rect.left,event.clientY-rect.top];
  if(drag) {
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
    if(Math.hypot(dx,dy)>3) drag.moved=true;
    map.center=[drag.center[0]-dx/map.scale,drag.center[1]-dy/map.scale];
    if(drag.moved) {follow=false;Element("followPlayer").setAttribute("aria-pressed","false");}
    Element("mapTooltip").hidden=true;Render();return;
  }
  const hit=[...map.hits].reverse().find((item)=>Math.hypot(item.screen[0]-point[0],item.screen[1]-point[1])<item.radius);
  const tooltip=Element("mapTooltip");tooltip.hidden=!hit;
  if(hit) {tooltip.textContent=hit.text;tooltip.style.left=`${Math.min(point[0]+13,rect.width-240)}px`;tooltip.style.top=`${Math.min(point[1]+15,rect.height-65)}px`;}
});
canvas.addEventListener("pointerup",(event)=>{
  if(drag&&!drag.moved) {
    const rect=canvas.getBoundingClientRect(),point=[event.clientX-rect.left,event.clientY-rect.top];
    const hit=[...map.hits].reverse().find((item)=>item.actor&&Math.hypot(item.screen[0]-point[0],item.screen[1]-point[1])<item.radius);
    selection=hit?.actor??"";Element("selectionText").textContent=hit?.text??"";Render();
  }
  drag=null;
});
canvas.addEventListener("pointercancel",()=>{drag=null;});
canvas.addEventListener("pointerleave",()=>{Element("mapTooltip").hidden=true;});
canvas.addEventListener("wheel",(event)=>{
  event.preventDefault();
  const rect=canvas.getBoundingClientRect();
  map.Zoom(Math.exp(-event.deltaY*0.001),[event.clientX-rect.left,event.clientY-rect.top]);
  Render();
},{passive:false});
new ResizeObserver(()=>Render()).observe(Element("flowMap"));
new ResizeObserver(()=>Render()).observe(Element("flowCamera"));
window.addEventListener("error",(event)=>{Element("flowError").hidden=false;Element("flowError").textContent=event.message;});

// Read-only inspection plus the same seek controls exposed by the UI.
window.LevelFlow={
  Seek, JumpBeat, Evaluate:EvaluateFlow, CameraAt, SetPlaying,
  Inspect:()=>({time,playing,stage:frame.stage.id,beat:frame.beat.id,duration:FLOW_DURATION,camera:CameraAt(frame,cameraMode),actors:frame.actors,layers:{...layers}}),
};
if(params.has("beat")) JumpBeat(params.get("beat"));
else if(params.has("stage")) {const stage=STAGE_TIMELINE.find((entry)=>entry.id===params.get("stage").padStart(2,"0"));if(stage) Seek(stage.start,{fit:true});}
else Seek(Number(params.get("t"))||0);
requestAnimationFrame(AnimationTick);
