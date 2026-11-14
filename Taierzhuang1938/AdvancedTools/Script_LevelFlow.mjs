import { FLOW_SOURCE } from "./Data_LevelFlow.mjs";
import { FLOW_SOURCE_EXCERPTS } from "./Data_LevelFlowSource.mjs";
import { BeatById, Clamp, EvaluateFlow, DEFAULT_ENCOUNTER_DOCUMENT, FLOW_DURATION, FLOW_TIMELINE, FormatFlowTime, STAGE_TIMELINE } from "./Script_LevelFlowModel.mjs";
import { GroupPath, ENCOUNTER_CINEMATICS } from "./Script_LevelFlowEncounter.mjs";
import { EncounterDocument, CreateFramePacket } from "./Script_LevelFlowDocument.mjs";
import { LoadEncounterMap } from "./Script_LevelFlowMap.mjs";
import { EncounterViewports } from "./Script_LevelFlowViewports.mjs";
import { ScreenshotAnnotations } from "./Script_LevelFlowAnnotations.mjs";
import { EncounterChat } from "./Script_LevelFlowChat.mjs?v=20261114UnitAttachments";
import { CreateUnitsAttachment } from "./Script_LevelFlowUnits.mjs";
import { FormatSourcePassage, CreateLocationText } from "./Script_LevelFlowPresentation.mjs";
import { EncounterSceneControls } from "./Script_LevelFlowControls.mjs";

const Element = (id) => document.getElementById(id);
let canvas,workspace,navigation,annotationEditor,chat;
let storage;
try { storage=window.localStorage; } catch { storage=null; }
const project=new EncounterDocument(DEFAULT_ENCOUNTER_DOCUMENT,FLOW_TIMELINE,storage);

let map, time=0, playing=false, mode="select", selection=null;
let selectedUnitIds=[], multipleUnits=false;
let frame=EvaluateFlow(0,project.value), shownStage="", shownBeat="", lastTimestamp=0, pointer=null, draft=null;
let toastTimer=0, renderPending=false;
const params=new URLSearchParams(location.search);

function Toast(message,persistent=false) {
  clearTimeout(toastTimer);Element("flowError").textContent=message;Element("flowError").hidden=false;
  if(!persistent) toastTimer=setTimeout(()=>{Element("flowError").hidden=true;},5000);
}
function SetPlaying(value) {
  playing=value;lastTimestamp=0;
  Element("playFlow").textContent=value?"暂停":"播放";
  Element("playFlow").setAttribute("aria-pressed",String(value));
  RequestRender();
}
function SetMode(value) {
  mode=value;
  for(const entry of workspace.Visible()) entry.canvas.dataset.mode=value;
  for(const button of document.querySelectorAll("[data-mode]")) button.classList.toggle("selected",button.dataset.mode===value);
  if(value!=="select") SetPlaying(false);
}
function ShowTab(value) {
  if(value==="notes") {
    OpenAnnotations();Element("legacyAnnotations").open=true;Element("notesPane").hidden=false;return;
  }
  for(const name of ["chat","script"]) Element(`${name}Pane`).hidden=name!==value;
  for(const button of document.querySelectorAll("[data-tab]")) button.classList.toggle("selected",button.dataset.tab===value);
  UpdateAnnotations();Render();
}
function Apply(edit) {
  try {project.Change(edit);Changed();return true;}
  catch(error) {Toast(error.message);return false;}
}
function Changed() {
  UpdateAnnotations();Render();
  Element("saveStatus").textContent=project.warning?"当前窗口草稿":"本机已保存";
  if(project.warning) Toast(project.warning,true);
}
function SelectedObject() {
  return selection?.type==="trigger"?project.value.triggers.find((item)=>item.id===selection.id)
    :selection?.type==="group"?project.value.groups.find((item)=>item.id===selection.id):null;
}
function Select(value, { additive=false }={}) {
  if(value?.type==="actor") {
    if(!frame.actors.some(actor=>actor.id===value.id)||chat?.sending) return;
    SetPlaying(false);
    selectedUnitIds=additive||multipleUnits
      ?selectedUnitIds.includes(value.id)?selectedUnitIds.filter(id=>id!==value.id):[...selectedUnitIds,value.id]
      :[value.id];
    selection=selectedUnitIds.length?{type:"actor",id:selectedUnitIds.at(-1),ids:[...selectedUnitIds]}:null;
    chat?.OpenUnits();ShowTab("chat");
  } else {selection=value;selectedUnitIds=[];}
  if(value?.type==="group"||value?.type==="trigger") {SetMode("select");}
  if(value?.type==="annotation") {ShowTab("notes");Element("annotationText").value=project.value.annotations.find((item)=>item.id===value.id)?.text||"";}
  Render();
}
function SetUnitSelectionMode(multiple) {
  multipleUnits=multiple;
  if(!multiple&&selectedUnitIds.length>1) {
    selectedUnitIds=[selectedUnitIds.at(-1)];
    selection={type:"actor",id:selectedUnitIds[0],ids:[...selectedUnitIds]};
  }
  Render();
}
function StageBounds() {
  const points=frame.stage.beats.flatMap((beat)=>beat.p);
  if(Number(frame.stage.id)<=2) points.push([0,-10],[76,82]);
  if(frame.stage.id==="05") points.push([88,112],[92,98]);
  for(const group of frame.groups.filter((item)=>item.beat.slice(0,2)===frame.stage.id)) {
    points.push(group.area.center,...group.route);
    for(let index=0;index<(group.memberPlans?.length||0);index++) points.push(...GroupPath(group,index));
  }
  const xs=points.map((point)=>point[0]),zs=points.map((point)=>point[1]);
  return [Math.min(...xs)-14,Math.max(...xs)+14,Math.min(...zs)-14,Math.max(...zs)+14];
}
function Seek(value,{fit=false}={}) {
  const previousStage=frame.stage.id;
  time=Clamp(Number(value)||0,0,FLOW_DURATION);frame=EvaluateFlow(time,project.value);
  if(previousStage!==frame.stage.id) {selection=null;selectedUnitIds=[];}
  if(map&&(fit||previousStage!==frame.stage.id)) workspace.FrameStage();
  draft=null;Render();
}
function JumpBeat(id) {const beat=BeatById(id);if(beat) Seek(beat.start,{fit:workspace.active.mode==="stage"});}
function StepBeat(direction) {const index=FLOW_TIMELINE.indexOf(frame.beat);JumpBeat(FLOW_TIMELINE[Clamp(index+direction,0,FLOW_TIMELINE.length-1)].id);}
function Button(text,action) {const button=document.createElement("button");button.type="button";button.textContent=text;button.addEventListener("click",action);return button;}

function PopulateTimeline() {
  for(const stage of STAGE_TIMELINE) {
    const button=Button(`${stage.id} ${stage.title}`,()=>{workspace.active.mode="stage";Seek(stage.start,{fit:true});});
    button.dataset.stage=stage.id;button.title=`${stage.status} · ${FormatFlowTime(stage.start)}—${FormatFlowTime(stage.end)}`;
    button.style.left=`${stage.start/FLOW_DURATION*100}%`;button.style.width=`${(stage.end-stage.start)/FLOW_DURATION*100}%`;
    button.classList.toggle("draft",stage.status==="草稿");Element("timelineStages").append(button);
  }
  for(const beat of FLOW_TIMELINE) {
    const cinematic=ENCOUNTER_CINEMATICS.includes(beat.id);
    const button=Button(beat.id.toUpperCase(),()=>JumpBeat(beat.id));
    button.setAttribute("aria-label",`${beat.id.toUpperCase()} ${beat.title}`);
    button.dataset.beat=beat.id;button.style.left=`${beat.start/FLOW_DURATION*100}%`;button.style.width=`${beat.duration/FLOW_DURATION*100}%`;
    button.classList.toggle("cinematic",cinematic);
    button.title=`${beat.id.toUpperCase()} · ${FormatFlowTime(beat.start)} · ${beat.title}${cinematic?" · 镜头动画段":""}`;
    Element("timelineBeats").append(button);
  }
  for(const stamp of [0,300,600,900,1200,1500,FLOW_DURATION]) {
    const label=document.createElement("span");label.textContent=FormatFlowTime(stamp);
    label.style.left=`${stamp/FLOW_DURATION*100}%`;Element("timelineRuler").append(label);
  }
  const beats=Element("timelineBeats");
  new ResizeObserver(()=>{
    for(const button of beats.children) button.classList.toggle("lfShortBeat",button.getBoundingClientRect().width<25);
  }).observe(beats);
  Element("flowSeek").max=String(FLOW_DURATION);Element("sourceLink").href=FLOW_SOURCE.url;
}
function UpdateTimeline() {
  if(shownStage!==frame.stage.id) {
    shownStage=frame.stage.id;
    for(const button of document.querySelectorAll("[data-stage]")) button.classList.toggle("selected",button.dataset.stage===shownStage);
  }
  if(shownBeat!==frame.beat.id) {
    shownBeat=frame.beat.id;
    Element("timelineMode").hidden=!ENCOUNTER_CINEMATICS.includes(frame.beat.id);Element("timelineMode").textContent=`${frame.beat.id.toUpperCase()} 镜头动画`;
    Element("beatId").textContent=frame.beat.id.toUpperCase();Element("beatTitle").textContent=frame.beat.title;
    Element("stageStatus").textContent=frame.stage.status;FormatSourcePassage(Element("sourcePassage"),FLOW_SOURCE_EXCERPTS[frame.beat.id]);
    Element("planningNote").hidden=!frame.beat.planning;
    Element("planningNote").textContent=frame.beat.planning?`当前编排 · ${frame.beat.planning}`:"";
    for(const button of document.querySelectorAll("[data-beat]")) button.classList.toggle("selected",button.dataset.beat===shownBeat);
    Element("frameHeading").textContent=`${frame.stage.id} ${frame.stage.title} / ${frame.beat.id.toUpperCase()}`;
  }
  const timeText=`${FormatFlowTime(time)} / ${FormatFlowTime(FLOW_DURATION)}`;
  if(Element("flowTime").textContent!==timeText) Element("flowTime").textContent=timeText;
  Element("flowSeek").value=String(time);
  Element("timelineAxis").style.setProperty("--progress",`${time/FLOW_DURATION*100}%`);
  Element("flowSeek").setAttribute("aria-valuetext",`${FormatFlowTime(time)} · ${frame.beat.id.toUpperCase()} ${frame.beat.title}`);
}
function UpdateAnnotations() {
  Element("legacyAnnotations").hidden=!project.value.annotations.length;
  const list=Element("annotationFrames");list.replaceChildren();
  const times=[...new Set(project.value.annotations.map((item)=>item.time))].sort((a,b)=>a-b);
  for(const stamp of times) {
    const notes=project.value.annotations.filter((item)=>item.time===stamp),beat=EvaluateFlow(stamp,project.value).beat;
    const button=Button(`${FormatFlowTime(stamp)} · ${beat.id.toUpperCase()} · ${notes.length} 处`,()=>{
      SetPlaying(false);Seek(stamp);
      if(notes[0].viewports) {workspace.Restore(notes[0].viewports);Element("viewportLayout").value=String(workspace.count);}
      else {workspace.SetType(0,"plan");workspace.Activate(0);const view=notes[0].view;if(view) RestoreView(view,notes[0].viewport);}
      Render();
    });button.className="lfFrameBookmark";button.dataset.annotationTime=String(stamp);list.append(button);
  }
}
function RequestRender() {renderPending=true;}
function Render(preparedFrame=null) {
  if(!map||!workspace) return;
  renderPending=false;
  frame=preparedFrame||EvaluateFlow(time,project.value);UpdateTimeline();
  selectedUnitIds=selectedUnitIds.filter(id=>frame.actors.some(actor=>actor.id===id));
  if(selection?.type==="actor") selection=selectedUnitIds.length?{type:"actor",id:selectedUnitIds.at(-1),ids:[...selectedUnitIds]}:null;
  chat?.UpdateUnits(CreateUnitsAttachment(frame,workspace,selectedUnitIds,project.value),multipleUnits);
  workspace.Draw(frame,null,selection,project.value.annotations,draft,project.value);
  Element("mapReadout").textContent=`${frame.beat.id.toUpperCase()}  ${FormatFlowTime(time)}  ·  玩家 X ${frame.player[0].toFixed(1)}  Z ${frame.player[1].toFixed(1)}`;
}
function Hit(point,view=map) {
  const priority={annotationHandle:6,annotation:5,actor:3,group:2,trigger:1};
  return view.hits.filter((item)=>Math.hypot(item.screen[0]-point[0],item.screen[1]-point[1])<=item.radius)
    .sort((a,b)=>(priority[b.type]||0)-(priority[a.type]||0)
      ||Math.hypot(a.screen[0]-point[0],a.screen[1]-point[1])-Math.hypot(b.screen[0]-point[0],b.screen[1]-point[1]))[0];
}
function LocalPoint(event,surface=canvas) {const rect=surface.getBoundingClientRect();return [event.clientX-rect.left,event.clientY-rect.top];}
function Packet() {
  const rect=canvas.getBoundingClientRect();
  const packet=CreateFramePacket(project.value,frame,map,{width:rect.width,height:rect.height});
  packet.context.viewports=workspace.Serialize();packet.context.selection=structuredClone(selection);return packet;
}

function RestoreView(view,viewport) {
  map.center=[...view.center];
  const rect=canvas.getBoundingClientRect();
  const ratio=viewport?Math.min(rect.width/viewport.width,rect.height/viewport.height):1;
  map.scale=Clamp(view.scale*ratio,0.15,40);workspace.active.mode="manual";
}

function BindMap(entry) {
  const surface=entry.canvas;
  surface.title="点击单位单选 · Ctrl / Shift + 点击多选 · 右键旋转 · 右键 + WASD 飞行 · Q/E 升降 · 中键平移 · Alt + 左键环绕 · F 聚焦";
  surface.addEventListener("contextmenu",event=>event.preventDefault());
  surface.addEventListener("pointerdown",(event)=>{
    if(navigation.Begin(entry,event)) return;
    if(event.button!==0) return;
    workspace.Activate(entry.index);
    surface.focus();surface.setPointerCapture(event.pointerId);
    const screen=LocalPoint(event),world=map.ToWorld(screen),hit=Hit(screen);
    const action=mode!=="select"?"annotate":hit?.type==="annotationHandle"?"edit":entry.map.type?"select":"pan";
    pointer={screen,world,center:[...map.center],hit,action,moved:false,original:project.value,viewport:entry.index,yaw:map.yaw||0,rotate:map.type==="eye"||event.altKey,additive:event.ctrlKey||event.metaKey||event.shiftKey};
    if(action==="annotate") {
      const rect=canvas.getBoundingClientRect();
      draft={id:`Note_${Date.now()}`,kind:mode,time:Math.round(time*100)/100,a:world,b:[...world],text:"",view:{center:[...map.center],scale:map.scale},viewport:{width:rect.width,height:rect.height},viewports:workspace.Serialize()};
      if(mode==="text") draft.text="文字";
    }
  });
  surface.addEventListener("pointermove",(event)=>{
    if(navigation.Move(entry,event)) return;
    const screen=LocalPoint(event,surface);
    if(pointer&&pointer.viewport===entry.index) {
      const dx=screen[0]-pointer.screen[0],dy=screen[1]-pointer.screen[1];if(Math.hypot(dx,dy)>3) pointer.moved=true;
      if(pointer.action==="pan"&&pointer.moved) {
        if(pointer.rotate&&map.type) map.yaw=pointer.yaw-dx*0.007;
        else {
          workspace.active.mode="manual";
          const current=map.ToWorld(screen);
          map.center=map.center.map((value,index)=>value+pointer.world[index]-current[index]);
        }
      }
      if(pointer.action==="annotate") draft.b=entry.map.ToWorld(screen);
      if(pointer.action==="edit") {
        const world=entry.map.ToWorld(screen);
        const candidate=structuredClone(pointer.original),hit=pointer.hit;
        const target=candidate.annotations.find((item)=>item.id===hit.id);
        target[hit.handle]=world;
        project.value=candidate;
      }
      Element("mapTooltip").hidden=true;RequestRender();return;
    }
    const hit=Hit(screen,entry.map),tip=Element("mapTooltip");tip.hidden=!hit?.text;
    if(hit?.text) {tip.textContent=hit.text;const grid=Element("viewportGrid").getBoundingClientRect(),rect=surface.getBoundingClientRect();tip.style.left=`${Clamp(rect.x-grid.x+screen[0]+14,5,grid.width-270)}px`;tip.style.top=`${Clamp(rect.y-grid.y+screen[1]+15,5,grid.height-50)}px`;}
  });
  surface.addEventListener("pointerup",()=>{
    if(navigation.End(entry)) return;
    if(!pointer||pointer.viewport!==entry.index) return;
    const action=pointer.action;
    if(action==="edit") {const candidate=project.value;project.value=pointer.original;try {project.Replace(candidate);Changed();} catch(error) {Toast(error.message);}}
    if(action==="annotate"&&draft&&(pointer.moved||draft.kind==="text")) {
      const annotation=draft;draft=null;Apply((document)=>document.annotations.push(annotation));Select({type:"annotation",id:annotation.id});
      if(annotation.kind==="text") {Element("annotationText").focus();Element("annotationText").select();}
    }
    if(["pan","select"].includes(action)&&!pointer.moved) {
      const hit=pointer.hit;
      if(hit) Select({type:hit.type,id:hit.id},{additive:pointer.additive});
      else if(!pointer.additive&&!multipleUnits) Select(null);
    }
    pointer=null;draft=null;Render();
  });
  surface.addEventListener("pointercancel",()=>{navigation.Clear();if(pointer?.action==="edit") project.value=pointer.original;pointer=null;draft=null;Render();});
  surface.addEventListener("lostpointercapture",()=>navigation.End(entry));
  surface.addEventListener("wheel",event=>navigation.Wheel(entry,event),{passive:false});
  surface.addEventListener("pointerleave",()=>{Element("mapTooltip").hidden=true;});
}

function OpenAnnotations() {
  navigation.Clear();SetPlaying(false);SetMode("select");Render();
  annotationEditor.Open(workspace.Capture(),Packet());
}

function BindControls() {
  for(const button of document.querySelectorAll("[data-tab]")) button.onclick=()=>ShowTab(button.dataset.tab);
  for(const button of document.querySelectorAll("[data-mode]")) button.onclick=()=>SetMode(button.dataset.mode);
  Element("playFlow").onclick=()=>{if(time>=FLOW_DURATION) Seek(0);SetMode("select");SetPlaying(!playing);};
  Element("previousBeat").onclick=()=>StepBeat(-1);Element("nextBeat").onclick=()=>StepBeat(1);
  Element("flowSeek").oninput=(event)=>Seek(Number(event.target.value));
  Element("viewportLayout").onchange=(event)=>{workspace.SetLayout(Number(event.target.value));Render();};
  Element("annotationText").onchange=(event)=>{if(selection?.type==="annotation") Apply((document)=>{document.annotations.find((item)=>item.id===selection.id).text=event.target.value;});};
  Element("deleteAnnotation").onclick=()=>{if(selection?.type==="annotation") {Apply((document)=>{document.annotations=document.annotations.filter((item)=>item.id!==selection.id);});selection=null;Element("annotationText").value="";Render();}};
  document.addEventListener("keydown",(event)=>{
    if(event.target.matches("input,select,textarea,button,a,summary")) return;
    if(navigation.Key(event)) return;
    if(event.code==="KeyF") {
      event.preventDefault();const object=SelectedObject(),actor=frame.actors.find(item=>selection?.type==="actor"&&item.id===selection.id);
      const note=project.value.annotations.find(item=>selection?.type==="annotation"&&item.id===selection.id);
      navigation.Focus(object?.area.center||actor?.p||note?.b||frame.player,object?Math.max(...object.area.size)/2:6);return;
    }
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="z") {event.preventDefault();event.shiftKey?project.Redo():project.Undo();Changed();return;}
    if(event.code==="Space") {event.preventDefault();SetMode("select");SetPlaying(!playing);}
    if(event.key==="ArrowLeft"||event.key==="ArrowRight") {event.preventDefault();Seek(time+(event.key==="ArrowRight"?1:-1)*(event.shiftKey?5:1));}
    if(event.key==="[") StepBeat(-1);if(event.key==="]") StepBeat(1);
    if(event.key==="Escape") {navigation.Clear();if(pointer?.action==="edit") project.value=pointer.original;SetMode("select");draft=null;pointer=null;Render();}
  });
}
function Tick(timestamp) {
  const navigated=!Element("annotationDialog").open&&navigation.Tick(lastTimestamp?Math.min(0.1,(timestamp-lastTimestamp)/1000):0);
  if(playing&&lastTimestamp) {
    const previousStage=frame.stage.id,delta=Math.min(0.1,(timestamp-lastTimestamp)/1000)*Number(Element("flowSpeed").value);
    const end=Element("loopStage").checked?frame.stage.end:FLOW_DURATION;
    if(time+delta>=end) {if(Element("loopStage").checked) time=frame.stage.start;else {time=FLOW_DURATION;SetPlaying(false);}}
    else time+=delta;
    frame=EvaluateFlow(time,project.value);
    if(previousStage!==frame.stage.id) workspace.FrameStage();
    Render(frame);
  }
  else if(navigated||renderPending) Render();
  lastTimestamp=timestamp;requestAnimationFrame(Tick);
}

async function Start() {
  PopulateTimeline();
  const mapData=await LoadEncounterMap();
  workspace=new EncounterViewports(Element("viewportGrid"),mapData,{
    activate:(entry)=>{map=entry.map;canvas=entry.canvas;canvas.dataset.mode=mode;},
    change:()=>Render(),bounds:StageBounds,bind:BindMap,
  });
  navigation=new EncounterSceneControls(workspace,RequestRender);
  annotationEditor=new ScreenshotAnnotations(async()=>{
    await chat.Attach(annotationEditor);annotationEditor.dialog.close();ShowTab("chat");
  });
  chat=new EncounterChat({
    snapshot:()=>({frame:Packet(),location:JSON.parse(CreateLocationText(frame,workspace,selection,project.value))}),
    openScreenshot:OpenAnnotations,
    editScreenshot:(image)=>{if(image) annotationEditor.Open(image.capture,image.frame,image.marks);},
    openUnits:()=>{SetPlaying(false);ShowTab("chat");},
    setUnitMode:SetUnitSelectionMode,
    removeUnit:id=>Select({type:"actor",id},{additive:true}),
    clearUnits:()=>Select(null),
  });
  Element("mapLoading").hidden=true;
  BindControls();
  window.LevelFlow={
    Seek,JumpBeat,SetPlaying,Select,Packet,SetMode,
    Evaluate:(value)=>EvaluateFlow(value,project.value),
    Inspect:()=>({time,playing,stage:frame.stage.id,beat:frame.beat.id,duration:FLOW_DURATION,actors:frame.actors,effects:frame.effects,layers:{...workspace.active.layers},view:{center:[...map.center],scale:map.scale},viewports:workspace.Serialize(),rendering:workspace.Visible().map(entry=>entry.map.Diagnostics?.()||null),mapObjects:mapData.objects.length,groups:frame.groups,triggers:frame.triggers,document:structuredClone(project.value)}),
    ToScreen:(point,index=workspace.activeIndex)=>workspace.entries[index].map.ToScreen(point),
    SetLayout:(count)=>{workspace.SetLayout(count);Element("viewportLayout").value=String(count);},
    SetViewType:(index,type)=>workspace.SetType(index,type),
    ActivateView:(index)=>workspace.Activate(index),
    RestoreViewports:(layout)=>{workspace.Restore(layout);Element("viewportLayout").value=String(workspace.count);Render();},
  };
  const stage=STAGE_TIMELINE.find((item)=>item.id===params.get("stage")?.padStart(2,"0"));
  if(params.has("beat")) JumpBeat(params.get("beat"));else Seek(params.has("t")?Number(params.get("t")):stage?.start||0,{fit:true});
  if(["x","z","zoom"].every((key)=>params.has(key)&&Number.isFinite(Number(params.get(key))))) {
    map.center=[Number(params.get("x")),Number(params.get("z"))];map.scale=Clamp(Number(params.get("zoom")),0.15,40);workspace.active.mode="manual";
    if(map.type==="scene") {
      const distance=Clamp(map.focal/map.scale,4,map.far/2),target=[map.center[0],map.Ground(map.center)+0.8,map.center[1]];
      map.freeCamera.eye=target.map((value,axis)=>value-map.forward[axis]*distance);map.focusDistance=distance;
    }
  }
  if(project.warning) Toast(project.warning,true);
  UpdateAnnotations();Render();chat.RefreshContext();requestAnimationFrame(Tick);
}
Start().catch((error)=>{Element("mapLoading").textContent=error.message;Toast(error.message,true);console.error(error);});
