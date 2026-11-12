import { FLOW_SOURCE } from "./Data_LevelFlow.mjs";
import { FLOW_SOURCE_EXCERPTS } from "./Data_LevelFlowSource.mjs";
import { BeatById, Clamp, EvaluateFlow, DEFAULT_ENCOUNTER_DOCUMENT, FLOW_DURATION, FLOW_TIMELINE, FormatFlowTime, STAGE_TIMELINE } from "./Script_LevelFlowModel.mjs";
import { ENCOUNTER_BEHAVIORS, ENCOUNTER_CINEMATICS } from "./Script_LevelFlowEncounter.mjs";
import { EncounterDocument, CreateFramePacket, ReadFramePacket, AddPngFrameMetadata, ReadPngFrameMetadata, DownloadBlob } from "./Script_LevelFlowDocument.mjs";
import { LoadEncounterMap } from "./Script_LevelFlowMap.mjs";
import { EncounterViewports } from "./Script_LevelFlowViewports.mjs";

const Element = (id) => document.getElementById(id);
let canvas,workspace;
let storage;
try { storage=window.localStorage; } catch { storage=null; }
const project=new EncounterDocument(DEFAULT_ENCOUNTER_DOCUMENT,FLOW_TIMELINE,storage);
const layers=Object.fromEntries([...document.querySelectorAll("[data-layer]")].map((input)=>[input.dataset.layer,input.checked]));
let map, time=0, playing=false, mode="select", tab="script", selection=null;
let frame=EvaluateFlow(0,project.value), shownStage="", shownBeat="", lastTimestamp=0, pointer=null, draft=null;
let toastTimer=0, objectFormKey="";
const params=new URLSearchParams(location.search);

function Toast(message,persistent=false) {
  clearTimeout(toastTimer);Element("flowError").textContent=message;Element("flowError").hidden=false;
  if(!persistent) toastTimer=setTimeout(()=>{Element("flowError").hidden=true;},5000);
}
function SetPlaying(value) {
  playing=value;lastTimestamp=0;
  Element("playFlow").textContent=value?"暂停":"播放";
  Element("playFlow").setAttribute("aria-pressed",String(value));
}
function SetMode(value) {
  mode=value;
  for(const entry of workspace.Visible()) entry.canvas.dataset.mode=value;
  for(const button of document.querySelectorAll("[data-mode]")) button.classList.toggle("selected",button.dataset.mode===value);
  if(value!=="select") {SetPlaying(false);ShowTab("notes");}
}
function ShowTab(value) {
  tab=value;
  for(const name of ["script","edit","notes"]) Element(`${name}Pane`).hidden=name!==value;
  for(const button of document.querySelectorAll("[data-tab]")) button.classList.toggle("selected",button.dataset.tab===value);
  objectFormKey="";UpdateObjects();UpdateAnnotations();Render();
}
function Apply(edit) {
  try {project.Change(edit);Changed();return true;}
  catch(error) {Toast(error.message);return false;}
}
function Changed() {
  objectFormKey="";UpdateObjects();UpdateAnnotations();Render();
  Element("saveStatus").textContent=project.warning?"当前窗口草稿":"本机已保存";
  if(project.warning) Toast(project.warning,true);
}
function SelectedObject() {
  return selection?.type==="trigger"?project.value.triggers.find((item)=>item.id===selection.id)
    :selection?.type==="group"?project.value.groups.find((item)=>item.id===selection.id):null;
}
function Select(value) {
  selection=value;objectFormKey="";
  if(value?.type==="group"||value?.type==="trigger") {SetMode("select");ShowTab("edit");}
  if(value?.type==="annotation") {ShowTab("notes");Element("annotationText").value=project.value.annotations.find((item)=>item.id===value.id)?.text||"";}
  UpdateObjects();Render();
}
function StageBounds() {
  const points=frame.stage.beats.flatMap((beat)=>beat.p);
  if(Number(frame.stage.id)<=2) points.push([0,-10],[76,82]);
  if(frame.stage.id==="05") points.push([88,112],[92,98]);
  for(const group of frame.groups.filter((item)=>item.beat.slice(0,2)===frame.stage.id)) points.push(group.area.center,...group.route);
  const xs=points.map((point)=>point[0]),zs=points.map((point)=>point[1]);
  return [Math.min(...xs)-14,Math.max(...xs)+14,Math.min(...zs)-14,Math.max(...zs)+14];
}
function Seek(value,{fit=false}={}) {
  const previousStage=frame.stage.id;
  time=Clamp(Number(value)||0,0,FLOW_DURATION);frame=EvaluateFlow(time,project.value);
  if(previousStage!==frame.stage.id) {selection=null;objectFormKey="";}
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
    button.classList.toggle("draft",stage.status==="草稿");Element("timelineStages").append(button);
  }
  Element("flowSeek").max=String(FLOW_DURATION);Element("sourceLink").href=FLOW_SOURCE.url;
}
function UpdateTimeline() {
  if(shownStage!==frame.stage.id) {
    shownStage=frame.stage.id;Element("timelineBeats").replaceChildren();
    for(const beat of frame.stage.beats) {
      const cinematic=ENCOUNTER_CINEMATICS.includes(beat.id);
      const button=Button(`${cinematic?"镜头 · ":""}${beat.title}`,()=>JumpBeat(beat.id));
      button.dataset.beat=beat.id;button.style.flex=String(beat.duration);button.classList.toggle("cinematic",cinematic);
      button.title=`${beat.id.toUpperCase()} · ${FormatFlowTime(beat.start)} · ${beat.title}${cinematic?" · 镜头动画段":""}`;
      Element("timelineBeats").append(button);
    }
    for(const button of document.querySelectorAll("[data-stage]")) button.classList.toggle("selected",button.dataset.stage===shownStage);
    UpdateObjects();
  }
  if(shownBeat!==frame.beat.id) {
    shownBeat=frame.beat.id;
    Element("beatId").textContent=frame.beat.id.toUpperCase();Element("beatTitle").textContent=frame.beat.title;
    Element("stageStatus").textContent=frame.stage.status;Element("sourcePassage").textContent=FLOW_SOURCE_EXCERPTS[frame.beat.id];
    for(const button of document.querySelectorAll("[data-beat]")) button.classList.toggle("selected",button.dataset.beat===shownBeat);
  }
  Element("frameHeading").textContent=`${frame.stage.id} ${frame.stage.title} / ${frame.beat.id.toUpperCase()}`;
  Element("flowTime").textContent=`${FormatFlowTime(time)} / ${FormatFlowTime(FLOW_DURATION)}`;
  Element("flowSeek").value=String(time);
  Element("undoFlow").disabled=!project.undo.length;Element("redoFlow").disabled=!project.redo.length;
  Element("followPlayer").setAttribute("aria-pressed",String(workspace.active.mode==="follow"));
}
function WritePath(object,path,value) {
  const keys=path.split(".");let parent=object;
  for(const key of keys.slice(0,-1)) parent=parent[key];
  parent[keys.at(-1)]=value;
  if(path==="side") object.target=value==="friend"?"enemy":"player";
  if(path.startsWith("area.center")&&object.route) object.route[0]=[...object.area.center];
}
function Field(parent,label,path,value,options=null) {
  const wrapper=document.createElement("label");wrapper.className="lfField";wrapper.append(document.createTextNode(label));
  const input=document.createElement(options?"select":typeof value==="boolean"?"select":"input");
  input.name=path;input.setAttribute("aria-label",label);
  const choices=typeof value==="boolean"?[["true","启用"],["false","停用"]]:options;
  if(choices) for(const [key,text] of choices) {const option=document.createElement("option");option.value=key;option.textContent=text;input.append(option);}
  else {input.type=typeof value==="number"?"number":"text";if(typeof value==="number") input.step="0.1";}
  input.value=String(value);wrapper.append(input);parent.append(wrapper);
  input.addEventListener("change",()=>{
    const current=SelectedObject();if(!current) return;
    const next=typeof value==="number"?Number(input.value):typeof value==="boolean"?input.value==="true":input.value;
    Apply((document)=>{const target=(selection.type==="group"?document.groups:document.triggers).find((item)=>item.id===current.id);WritePath(target,path,next);});
  });
}
function UpdateObjects() {
  if(!map) return;
  const selector=Element("objectList"),current=SelectedObject();
  const candidates=[...project.value.groups.map((item)=>({type:"group",item})),...project.value.triggers.map((item)=>({type:"trigger",item}))]
    .filter(({item})=>item.beat.slice(0,2)===frame.stage.id||item.endBeat.slice(0,2)===frame.stage.id||item.id===current?.id);
  selector.replaceChildren();
  const empty=document.createElement("option");empty.value="";empty.textContent="选择地图上的区域";selector.append(empty);
  for(const {type,item} of candidates) {const option=document.createElement("option");option.value=`${type}:${item.id}`;option.textContent=`${type==="group"?(item.side==="friend"?"我方":"生成"):"触发"} · ${item.label}`;selector.append(option);}
  selector.value=current?`${selection.type}:${current.id}`:"";
  if(tab!=="edit") return;
  const form=Element("objectForm"),key=current?JSON.stringify(current):"empty";
  if(objectFormKey===key) return;
  objectFormKey=key;form.replaceChildren();Element("objectActions").hidden=!current;
  if(!current) {Element("objectPreview").textContent="点选区域，拖动中心挪位置，拖动角点改范围。";return;}
  Field(form,"名称","label",current.label);
  const geometry=document.createElement("details"),summary=document.createElement("summary");summary.textContent="区域、时段与路线";geometry.append(summary);geometry.open=selection.type==="trigger";
  const positions=document.createElement("div");positions.className="lfFieldGrid";geometry.append(positions);
  Field(positions,"中心 X","area.center.0",current.area.center[0]);Field(positions,"中心 Z","area.center.1",current.area.center[1]);
  Field(positions,"宽度 m","area.size.0",current.area.size[0]);Field(positions,"深度 m","area.size.1",current.area.size[1]);
  Field(geometry,"形状","area.shape",current.area.shape,[["rect","矩形"],["circle","圆形（宽度为直径）"]]);
  const beatOptions=FLOW_TIMELINE.map((beat)=>[beat.id,`${beat.id.toUpperCase()} ${beat.title}`]);
  Field(geometry,"起始拍","beat",current.beat,beatOptions);Field(geometry,"结束拍","endBeat",current.endBeat,beatOptions);
  if(selection.type==="trigger") {
    Field(form,"触发方式","mode",current.mode,[["area","玩家路线进入区域"],["time","到达指定时刻"]]);Field(form,"起始拍后延迟 s","delay",current.delay);
  } else {
    const identity=document.createElement("div");identity.className="lfFieldGrid";form.append(identity);
    Field(identity,"启用","enabled",current.enabled);Field(identity,"阵营","side",current.side,[["enemy","日军"],["friend","我方"]]);
    Field(form,"行为","behavior",current.behavior,Object.entries(ENCOUNTER_BEHAVIORS));
    const numbers=document.createElement("div");numbers.className="lfFieldGrid";form.append(numbers);
    for(const [label,path] of [["总人数","count"],["同时在场","maxAlive"],["补充间隔 s","interval"],["存续时长 s","lifetime"]]) Field(numbers,label,path,current[path]);
    Field(geometry,"移动速度 m/s","speed",current.speed);
    Field(form,"关联触发区","triggerId",current.triggerId,project.value.triggers.map((trigger)=>[trigger.id,trigger.label]));
    Field(form,"射击目标","target",current.target,[["player","顺子"],["winter","冬瓜"],["enemy","敌军"],["ramp","村口坡道"],["none","停火"]]);
    const wrapper=document.createElement("label");wrapper.className="lfField";wrapper.append(document.createTextNode("路线 X, Z · 地图上可拖路点"));
    const route=document.createElement("textarea");route.name="route";route.value=current.route.map((point)=>point.join(", ")).join("\n");wrapper.append(route);geometry.append(wrapper);
    route.addEventListener("change",()=>Apply((document)=>{
      const points=route.value.trim().split(/\n/).filter(Boolean).map((line)=>line.split(/[,，\s]+/).map(Number));
      const group=document.groups.find((item)=>item.id===current.id);group.route=points;if(points[0]?.length===2) group.area.center=[...points[0]];
    }));
  }
  form.append(geometry);
  Element("addRoutePoint").hidden=selection.type!=="group";
}
function UpdateObjectPreview() {
  const object=SelectedObject();if(!object||tab!=="edit") return;
  if(selection.type==="trigger") {
    const state=frame.triggers.find((item)=>item.id===object.id),count=project.value.groups.filter((group)=>group.triggerId===object.id).length;
    Element("objectPreview").textContent=`${state.firedAt===null?"路线未经过":`触发 ${FormatFlowTime(state.firedAt)}`}\n关联 ${count} 个生成区`;
  } else {
    const state=frame.groups.find((item)=>item.id===object.id);
    Element("objectPreview").textContent=`${state.start===null?"等待路线进入触发区":`触发 ${FormatFlowTime(state.start)}`}\n已出 ${state.spawned} / ${state.count} · 当前在场 ${state.live}`;
  }
}
function UpdateAnnotations() {
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
function Render() {
  if(!map||!workspace) return;
  frame=EvaluateFlow(time,project.value);UpdateTimeline();
  workspace.Draw(frame,layers,selection,project.value.annotations,draft);
  Element("mapReadout").textContent=`${frame.beat.id.toUpperCase()}  ${FormatFlowTime(time)}  ·  玩家 X ${frame.player[0].toFixed(1)}  Z ${frame.player[1].toFixed(1)}`;
  UpdateObjectPreview();
}
function Hit(point,view=map) {
  const priority={areaHandle:6,routeHandle:6,annotationHandle:6,annotation:5,actor:3,group:2,trigger:1};
  return view.hits.filter((item)=>Math.hypot(item.screen[0]-point[0],item.screen[1]-point[1])<=item.radius)
    .sort((a,b)=>(priority[b.type]||0)-(priority[a.type]||0))[0];
}
function LocalPoint(event,surface=canvas) {const rect=surface.getBoundingClientRect();return [event.clientX-rect.left,event.clientY-rect.top];}
function Packet() {
  const rect=canvas.getBoundingClientRect();
  const packet=CreateFramePacket(project.value,frame,map,{width:rect.width,height:rect.height});
  packet.context.viewports=workspace.Serialize();return packet;
}

function RestoreView(view,viewport) {
  map.center=[...view.center];
  const rect=canvas.getBoundingClientRect();
  const ratio=viewport?Math.min(rect.width/viewport.width,rect.height/viewport.height):1;
  map.scale=Clamp(view.scale*ratio,0.15,40);workspace.active.mode="manual";
}

function BindMap(entry) {
  const surface=entry.canvas;
  surface.addEventListener("pointerdown",(event)=>{
    if(event.button!==0&&event.button!==1) return;
    workspace.Activate(entry.index);
    surface.focus();surface.setPointerCapture(event.pointerId);
    const screen=LocalPoint(event),world=map.ToWorld(screen),hit=Hit(screen);
    if(mode==="route"&&selection?.type==="group") {Apply((document)=>document.groups.find((item)=>item.id===selection.id).route.push(world));SetMode("select");ShowTab("edit");return;}
    const action=event.button===1?"pan":mode!=="select"?"annotate":["areaHandle","routeHandle","annotationHandle"].includes(hit?.type)?"edit":"pan";
    if(action!=="pan") SetPlaying(false);
    pointer={screen,world,center:[...map.center],hit,action,moved:false,original:project.value,viewport:entry.index,yaw:map.yaw||0,rotate:map.type==="eye"||event.altKey};
    if(action==="annotate") {
      const rect=canvas.getBoundingClientRect();
      draft={id:`Note_${Date.now()}`,kind:mode,time:Math.round(time*100)/100,a:world,b:[...world],text:"",view:{center:[...map.center],scale:map.scale},viewport:{width:rect.width,height:rect.height},viewports:workspace.Serialize()};
      if(mode==="text") draft.text="文字";
    }
  });
  surface.addEventListener("pointermove",(event)=>{
    const screen=LocalPoint(event,surface),world=entry.map.ToWorld(screen);
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
      if(pointer.action==="annotate") draft.b=world;
      if(pointer.action==="edit") {
        const candidate=structuredClone(pointer.original),hit=pointer.hit;
        const list=hit.type==="annotationHandle"?candidate.annotations:hit.type==="routeHandle"||hit.objectType==="group"?candidate.groups:candidate.triggers;
        const target=list.find((item)=>item.id===hit.id);
        if(hit.type==="annotationHandle") target[hit.handle]=world;
        else if(hit.type==="routeHandle") target.route[hit.index]=world;
        else if(hit.handle===0) {target.area.center=world;if(target.route) target.route[0]=[...world];}
        else target.area.size=[Math.max(0.5,Math.abs(world[0]-target.area.center[0])*2),Math.max(0.5,Math.abs(world[1]-target.area.center[1])*2)].map((value)=>Math.min(500,value));
        project.value=candidate;
      }
      Element("mapTooltip").hidden=true;Render();return;
    }
    const hit=Hit(screen,entry.map),tip=Element("mapTooltip");tip.hidden=!hit?.text;
    if(hit?.text) {tip.textContent=hit.text;const grid=Element("viewportGrid").getBoundingClientRect(),rect=surface.getBoundingClientRect();tip.style.left=`${Clamp(rect.x-grid.x+screen[0]+14,5,grid.width-270)}px`;tip.style.top=`${Clamp(rect.y-grid.y+screen[1]+15,5,grid.height-50)}px`;}
  });
  surface.addEventListener("pointerup",()=>{
    if(!pointer||pointer.viewport!==entry.index) return;
    const action=pointer.action;
    if(action==="edit") {const candidate=project.value;project.value=pointer.original;try {project.Replace(candidate);Changed();} catch(error) {Toast(error.message);}}
    if(action==="annotate"&&draft&&(pointer.moved||draft.kind==="text")) {
      const annotation=draft;draft=null;Apply((document)=>document.annotations.push(annotation));Select({type:"annotation",id:annotation.id});
      if(annotation.kind==="text") {Element("annotationText").focus();Element("annotationText").select();}
    }
    if(action==="pan"&&!pointer.moved&&pointer.hit) {
      const hit=pointer.hit;Select({type:hit.type,id:hit.id});
    }
    pointer=null;draft=null;Render();
  });
  surface.addEventListener("pointercancel",()=>{if(pointer?.action==="edit") project.value=pointer.original;pointer=null;draft=null;Render();});
  surface.addEventListener("wheel",(event)=>{event.preventDefault();workspace.Activate(entry.index);workspace.active.mode="manual";map.Zoom(Math.exp(-event.deltaY*0.001),LocalPoint(event,surface));Render();},{passive:false});
  surface.addEventListener("pointerleave",()=>{Element("mapTooltip").hidden=true;});
}

function BindControls() {
  for(const button of document.querySelectorAll("[data-tab]")) button.onclick=()=>ShowTab(button.dataset.tab);
  for(const button of document.querySelectorAll("[data-mode]")) button.onclick=()=>SetMode(button.dataset.mode);
  for(const input of document.querySelectorAll("[data-layer]")) input.onchange=()=>{layers[input.dataset.layer]=input.checked;Render();};
  Element("playFlow").onclick=()=>{if(time>=FLOW_DURATION) Seek(0);SetMode("select");SetPlaying(!playing);};
  Element("previousBeat").onclick=()=>StepBeat(-1);Element("nextBeat").onclick=()=>StepBeat(1);
  Element("flowSeek").oninput=(event)=>Seek(Number(event.target.value));
  Element("viewportLayout").onchange=(event)=>{workspace.SetLayout(Number(event.target.value));Render();};
  Element("fitStage").onclick=()=>{workspace.active.mode="stage";map.Fit(StageBounds());Render();};
  Element("fitAll").onclick=()=>{workspace.active.mode="all";map.Fit(map.mapData.bounds);Render();};
  Element("followPlayer").onclick=()=>{workspace.active.mode=workspace.active.mode==="follow"?"manual":"follow";Render();};
  Element("undoFlow").onclick=()=>{project.Undo();Changed();};Element("redoFlow").onclick=()=>{project.Redo();Changed();};
  Element("objectList").onchange=(event)=>{const [type,id]=event.target.value.split(":");Select(id?{type,id}:null);};
  Element("objectForm").onsubmit=(event)=>event.preventDefault();
  Element("focusObject").onclick=()=>{const object=SelectedObject();if(object) {workspace.active.mode="manual";map.center=[...object.area.center];map.scale=Math.max(map.scale,7);Render();}};
  Element("addRoutePoint").onclick=()=>{mode="route";canvas.dataset.mode="route";SetPlaying(false);Toast("在地图上点击新的路点");};
  Element("deleteObject").onclick=()=>{
    if(!SelectedObject()) return;
    if(selection.type==="trigger"&&project.value.groups.some((group)=>group.triggerId===selection.id)) {Toast("此触发区仍关联生成区，先修改关联或删除对应生成区");return;}
    Apply((document)=>{const key=selection.type==="group"?"groups":"triggers";document[key]=document[key].filter((item)=>item.id!==selection.id);});selection=null;Changed();
  };
  const AddObject=(type)=>{
    const id=`${type}_${Date.now()}`,beat=frame.beat.id,center=[...frame.player];
    Apply((document)=>{
      const trigger={id:`Trigger_${id}`,label:"新触发区",beat,endBeat:beat,mode:"area",delay:0,area:{shape:"rect",center,size:[6,6]}};
      document.triggers.push(trigger);
      if(type==="group") document.groups.push({id,label:"新生成区",beat,endBeat:beat,triggerId:trigger.id,enabled:true,side:"enemy",target:"player",area:{shape:"rect",center:[center[0]+10,center[1]-12],size:[3,3]},route:[[center[0]+10,center[1]-12],[center[0]+5,center[1]-6]],count:3,maxAlive:3,interval:3,lifetime:30,speed:2.2,behavior:"advance",note:"手工布设"});
      selection={type,id:type==="group"?id:trigger.id};
    });Changed();
  };
  Element("addTrigger").onclick=()=>AddObject("trigger");Element("addGroup").onclick=()=>AddObject("group");
  Element("annotationText").onchange=(event)=>{if(selection?.type==="annotation") Apply((document)=>{document.annotations.find((item)=>item.id===selection.id).text=event.target.value;});};
  Element("deleteAnnotation").onclick=()=>{if(selection?.type==="annotation") {Apply((document)=>{document.annotations=document.annotations.filter((item)=>item.id!==selection.id);});selection=null;Element("annotationText").value="";Render();}};
  Element("exportProject").onclick=()=>DownloadBlob(new Blob([JSON.stringify(Packet(),null,2)],{type:"application/json"}),`Encounter_${frame.beat.id}_${Math.round(time*100)}.json`);
  Element("exportFrame").onclick=async()=>{
    try {
      SetPlaying(false);Render();const packet=Packet(),capture=workspace.Capture(),output=document.createElement("canvas");
      output.width=capture.width;output.height=capture.height+92;
      const context=output.getContext("2d");context.drawImage(capture,0,0);context.fillStyle="#131a13";context.fillRect(0,capture.height,output.width,92);
      context.fillStyle="#e8d9b6";context.font="16px Microsoft YaHei, sans-serif";
      context.fillText(`${packet.frameId}  |  ${frame.beat.title}`,18,capture.height+29);
      context.font="13px Microsoft YaHei, sans-serif";
      const viewLabel=map.type?`立体视角 ${map.type}`:`${map.scale.toFixed(3)} px/m`;
      context.fillText(`时间 ${time.toFixed(2)} s  ·  玩家 X ${frame.player[0].toFixed(2)} / Z ${frame.player[1].toFixed(2)}  ·  视图中心 ${map.center.map((value)=>value.toFixed(2)).join(', ')}  ·  ${viewLabel}`,18,capture.height+55);
      context.fillStyle="#a9b49f";context.fillText("PNG 内含完整帧定位、标注与布设，可导入继续编辑",18,capture.height+78);
      const blob=await new Promise((resolve)=>output.toBlob(resolve,"image/png"));
      const enriched=AddPngFrameMetadata(await blob.arrayBuffer(),packet);
      DownloadBlob(new Blob([enriched],{type:"image/png"}),`${packet.frameId}.png`);Toast("已导出带帧定位的标注图");
    } catch(error) {Toast(error.message);}
  };
  Element("copyFrame").onclick=async()=>{
    const packet=Packet(),url=new URL(location.href);url.search="";url.searchParams.set("t",time.toFixed(2));url.searchParams.set("x",map.center[0].toFixed(2));url.searchParams.set("z",map.center[1].toFixed(2));url.searchParams.set("zoom",map.scale.toFixed(3));
    const notes=project.value.annotations.filter((item)=>Math.abs(item.time-time)<0.06).map((item)=>`${item.kind} [${item.a.map((v)=>v.toFixed(2))}] → [${item.b.map((v)=>v.toFixed(2))}] ${item.text}`);
    const text=`${packet.frameId}\n${frame.beat.title}\n时间 ${time.toFixed(2)} s · 玩家 X ${frame.player[0].toFixed(2)} Z ${frame.player[1].toFixed(2)}\n${notes.join('\n')}\n${url.href}`;
    try {await navigator.clipboard.writeText(text);Toast("已复制帧时间、世界坐标和定位链接");}
    catch {DownloadBlob(new Blob([text],{type:"text/plain"}),`${packet.frameId}.txt`);Toast("定位已保存为文本");}
  };
  Element("importProject").onclick=()=>Element("importFile").click();
  Element("importFile").onchange=async(event)=>{
    const file=event.target.files[0];if(!file) return;
    try {
      const raw=/\.png$/i.test(file.name)?ReadPngFrameMetadata(await file.arrayBuffer()):JSON.parse(await file.text());
      const packet=ReadFramePacket(raw,FLOW_TIMELINE);SetPlaying(false);project.Replace(packet.document);Seek(packet.context.time);
      if(packet.context.viewports) {workspace.Restore(packet.context.viewports);Element("viewportLayout").value=String(workspace.count);}
      else {workspace.SetType(0,"plan");workspace.Activate(0);RestoreView(packet.context.view,packet.context.viewport);}
      selection=null;Changed();Toast(`已回到 ${packet.frameId}`);
    } catch(error) {Toast(`导入失败 · ${error.message}`);} finally {event.target.value="";}
  };
  document.addEventListener("keydown",(event)=>{
    if(event.target.matches("input,select,textarea,button,a,summary")) return;
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="z") {event.preventDefault();event.shiftKey?project.Redo():project.Undo();Changed();return;}
    if(event.code==="Space") {event.preventDefault();SetMode("select");SetPlaying(!playing);}
    if(event.key==="ArrowLeft"||event.key==="ArrowRight") {event.preventDefault();Seek(time+(event.key==="ArrowRight"?1:-1)*(event.shiftKey?5:1));}
    if(event.key==="[") StepBeat(-1);if(event.key==="]") StepBeat(1);
    if(event.key==="Escape") {if(pointer?.action==="edit") project.value=pointer.original;SetMode("select");draft=null;pointer=null;Render();}
  });
}
function Tick(timestamp) {
  if(playing&&lastTimestamp) {
    const previousStage=frame.stage.id,delta=Math.min(0.1,(timestamp-lastTimestamp)/1000)*Number(Element("flowSpeed").value);
    const end=Element("loopStage").checked?frame.stage.end:FLOW_DURATION;
    if(time+delta>=end) {if(Element("loopStage").checked) time=frame.stage.start;else {time=FLOW_DURATION;SetPlaying(false);}}
    else time+=delta;
    frame=EvaluateFlow(time,project.value);
    if(previousStage!==frame.stage.id) workspace.FrameStage();
    Render();
  }
  lastTimestamp=timestamp;requestAnimationFrame(Tick);
}

async function Start() {
  PopulateTimeline();
  const mapData=await LoadEncounterMap();
  workspace=new EncounterViewports(Element("viewportGrid"),mapData,{
    activate:(entry)=>{map=entry.map;canvas=entry.canvas;canvas.dataset.mode=mode;},
    change:()=>Render(),bounds:StageBounds,bind:BindMap,
  });
  Element("mapLoading").hidden=true;
  BindControls();
  window.LevelFlow={
    Seek,JumpBeat,SetPlaying,Select,Packet,SetMode,
    Evaluate:(value)=>EvaluateFlow(value,project.value),
    Inspect:()=>({time,playing,stage:frame.stage.id,beat:frame.beat.id,duration:FLOW_DURATION,actors:frame.actors,layers:{...layers},view:{center:[...map.center],scale:map.scale},viewports:workspace.Serialize(),mapObjects:mapData.objects.length,groups:frame.groups,triggers:frame.triggers,document:structuredClone(project.value)}),
    ToScreen:(point,index=workspace.activeIndex)=>workspace.entries[index].map.ToScreen(point),
    SetLayout:(count)=>{workspace.SetLayout(count);Element("viewportLayout").value=String(count);},
    SetViewType:(index,type)=>workspace.SetType(index,type),
    ActivateView:(index)=>workspace.Activate(index),
  };
  const stage=STAGE_TIMELINE.find((item)=>item.id===params.get("stage")?.padStart(2,"0"));
  if(params.has("beat")) JumpBeat(params.get("beat"));else Seek(params.has("t")?Number(params.get("t")):stage?.start||0,{fit:true});
  if(["x","z","zoom"].every((key)=>params.has(key)&&Number.isFinite(Number(params.get(key))))) {map.center=[Number(params.get("x")),Number(params.get("z"))];map.scale=Clamp(Number(params.get("zoom")),0.15,40);workspace.active.mode="manual";}
  if(project.warning) Toast(project.warning,true);
  UpdateAnnotations();Render();requestAnimationFrame(Tick);
}
Start().catch((error)=>{Element("mapLoading").textContent=error.message;Toast(error.message,true);console.error(error);});
