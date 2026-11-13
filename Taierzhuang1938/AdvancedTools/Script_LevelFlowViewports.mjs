import { FlowMapView } from "./Script_LevelFlowView.mjs";
import { FlowPerspectiveView } from "./Script_LevelFlowPerspective.mjs";
import { Clamp } from "./Script_LevelFlowGeometry.mjs";
import { ValidateViewportLayout } from "./Script_LevelFlowDocument.mjs";
import { FLOW_DEFAULT_VIEWS } from "../Data_Tuning_LevelFlow.mjs";

export const ENCOUNTER_VIEW_TYPES={plan:"空间总览",battle:"战斗局部",oblique:"立体俯视",scene:"Scene 自由视角",chase:"跟拍",eye:"玩家视线"};

export class EncounterViewports {
  constructor(element,mapData,{activate,change,bounds,bind}) {
    this.element=element;this.mapData=mapData;this.callbacks={activate,change,bounds,bind};
    this.count=2;this.entries=[];this.activeIndex=0;
    for(const [index,type] of [...FLOW_DEFAULT_VIEWS.map(view=>view.type),"battle","eye"].entries()) {
      const pane=document.createElement("section");pane.className="lfViewPane";pane.dataset.viewport=String(index);
      const bar=document.createElement("div");bar.className="lfViewBar";
      const title=document.createElement("span");title.textContent=`视口 ${index+1}`;bar.append(title);
      const select=document.createElement("select");select.setAttribute("aria-label",`视口 ${index+1} 视角`);
      for(const [value,label] of Object.entries(ENCOUNTER_VIEW_TYPES)) {const option=document.createElement("option");option.value=value;option.textContent=label;select.append(option);}
      select.value=type;bar.append(select);
      const target=document.createElement("select");target.className="lfViewTarget";target.setAttribute("aria-label",`视口 ${index+1} 跟随对象`);
      for(const [value,label] of [["player","顺子"],["winter","冬瓜"],["luo","班长"],["tank1","头车"]]) {const option=document.createElement("option");option.value=value;option.textContent=label;target.append(option);}
      bar.append(target);
      const fit=document.createElement("button");fit.textContent="重置镜头";fit.title=`恢复视口 ${index+1} 的默认镜头位置`;bar.append(fit);
      const rotate=document.createElement("button");rotate.textContent="↻";rotate.title="旋转 45°";bar.append(rotate);
      const layerMenu=document.createElement("details");layerMenu.className="lfViewLayers";
      const layerSummary=document.createElement("summary");layerSummary.textContent="显示";layerMenu.append(layerSummary);
      const layerOptions=document.createElement("div");layerMenu.append(layerOptions);bar.append(layerMenu);
      const layers={fire:true,triggers:true,spawns:true,routes:true,names:true};
      for(const [key,label] of [["fire","火力"],["triggers","触发"],["spawns","生成"],["routes","路线"],["names","人名"]]) {
        const wrapper=document.createElement("label"),input=document.createElement("input");
        input.type="checkbox";input.checked=true;input.dataset.layer=key;input.setAttribute("aria-label",`视口 ${index+1} ${label}`);
        input.onchange=()=>{layers[key]=input.checked;this.callbacks.change();};
        wrapper.append(input,document.createTextNode(label));layerOptions.append(wrapper);
      }
      layerMenu.addEventListener("toggle",()=>{if(layerMenu.open) for(const other of this.entries) if(other.index!==index) other.layerMenu.open=false;});
      const canvas=document.createElement("canvas");canvas.id=index===0?"flowMap":`flowMap${index+1}`;canvas.tabIndex=0;
      canvas.setAttribute("aria-label",`视口 ${index+1} · ${ENCOUNTER_VIEW_TYPES[type]}`);
      const status=document.createElement("div");status.className="lfViewStatus";
      const framing=document.createElement("div");framing.className="lfViewFraming";framing.setAttribute("aria-label",`视口 ${index+1} 镜头范围`);
      for(const [mode,label,description] of [
        ["stage","当前剧情范围","缩放到当前剧情段落的活动范围，只调整这个视口"],
        ["all","整个关卡","缩放到整个关卡的范围，只调整这个视口"],
        ["follow","自动跟随","镜头自动跟随顺子或所选跟随对象，再点一次停止跟随"],
      ]) {
        const button=document.createElement("button");button.textContent=label;button.title=description;
        button.dataset.framing=mode;button.setAttribute("aria-pressed","false");
        button.onclick=()=>this.SetFraming(index,mode);framing.append(button);
      }
      pane.append(bar,canvas,framing,status);element.append(pane);
      const entry={index,pane,bar,canvas,select,target,rotate,status,type,layers,layerMenu,mode:type==="scene"?"manual":"follow",map:this.MakeView(canvas,type),size:null,defaultCamera:index<2};
      this.entries.push(entry);
      pane.addEventListener("pointerdown",()=>this.Activate(index),{capture:true});
      select.onchange=()=>this.SetType(index,select.value);
      target.onchange=()=>{entry.map.target=target.value;entry.mode="follow";this.callbacks.change();};
      fit.onclick=()=>{
        if(entry.type==="scene") {entry.defaultCamera=true;entry.mode="manual";}
        else {entry.mode=entry.type==="plan"?"stage":"follow";this.Frame(entry);}
        this.callbacks.change();
      };
      rotate.onclick=()=>{entry.map.yaw=(entry.map.yaw||0)+Math.PI/4;this.callbacks.change();};
      this.callbacks.bind(entry);
    }
    this.observer=new ResizeObserver(()=>{
      for(const entry of this.Visible()) {
        const rect=entry.canvas.getBoundingClientRect();
        if(rect.width<1||rect.height<1) continue;
        if(entry.size&&entry.mode==="manual") entry.map.scale*=Math.min(rect.width/entry.size.width,rect.height/entry.size.height);
        else this.Frame(entry);
        entry.size={width:rect.width,height:rect.height};
      }
      this.callbacks.change();
    });
    for(const entry of this.entries) this.observer.observe(entry.canvas);
    this.SetLayout(2);
  }

  MakeView(canvas,type) {
    return ["plan","battle"].includes(type)?new FlowMapView(canvas,this.mapData):new FlowPerspectiveView(canvas,this.mapData,type);
  }
  get active() {return this.entries[this.activeIndex];}
  Visible() {return this.entries.slice(0,this.count);}

  SetLayout(count) {
    this.count=[1,2,4].includes(Number(count))?Number(count):2;
    this.element.dataset.layout=String(this.count);
    for(const entry of this.entries) entry.pane.hidden=entry.index>=this.count;
    if(this.activeIndex>=this.count) this.activeIndex=0;
    for(const entry of this.Visible()) {entry.size=null;this.Frame(entry);}
    this.Activate(this.activeIndex);
  }

  Activate(index) {
    this.activeIndex=Clamp(Number(index)||0,0,this.count-1);
    for(const entry of this.entries) entry.pane.classList.toggle("active",entry.index===this.activeIndex);
    this.callbacks.activate(this.active);this.callbacks.change();
  }

  SetType(index,type) {
    if(!Object.hasOwn(ENCOUNTER_VIEW_TYPES,type)) return;
    const entry=this.entries[index],old=entry.map;
    entry.defaultCamera=false;entry.drawKey=null;
    entry.type=type;entry.select.value=type;entry.map=this.MakeView(entry.canvas,type);
    entry.map.center=[...old.center];entry.map.scale=old.scale;
    entry.mode=type==="plan"?"stage":type==="scene"?"manual":"follow";
    if(type==="scene") {
      const distance=old.type==="oblique"&&Number.isFinite(old.focal)?old.focal/old.scale:22;
      entry.map.freeCamera=old.eye?{eye:old.type==="oblique"?old.aim.map((value,axis)=>value-old.forward[axis]*distance):[...old.eye],yaw:Math.atan2(old.forward[0],old.forward[2]),pitch:Math.asin(old.forward[1])}
        :{eye:[old.center[0],entry.map.Ground(old.center)+12,old.center[1]-18],yaw:0,pitch:-0.55};
      entry.map.focusDistance=distance;
    }
    entry.canvas.setAttribute("aria-label",`视口 ${index+1} · ${ENCOUNTER_VIEW_TYPES[type]}`);
    this.Frame(entry);this.Activate(index);
  }

  Frame(entry) {
    if(entry.mode==="stage") entry.map.Fit(this.callbacks.bounds());
    if(entry.mode==="all") entry.map.Fit(this.mapData.bounds);
  }

  SetFraming(index,mode) {
    const entry=this.entries[index];
    if(mode==="follow"&&entry.mode==="follow") entry.mode="manual";
    else {
      if(entry.type==="scene"||mode!=="follow"&&["eye","chase"].includes(entry.type)) this.SetType(index,"oblique");
      entry.mode=mode;this.Frame(entry);
    }
    this.Activate(index);
  }

  FrameStage() {for(const entry of this.Visible()) if(entry.mode==="stage") this.Frame(entry);}

  DefaultCamera(entry,frame) {
    const preset=FLOW_DEFAULT_VIEWS[entry.index]||FLOW_DEFAULT_VIEWS[0],view=entry.map;
    const actor=frame.actors.find(actor=>actor.id==="player")||frame.actors[0];
    const target=[actor.p[0],view.Ground(actor.p)+preset.lookHeight,actor.p[1]];
    const forward=[Math.sin(preset.yaw)*Math.cos(preset.pitch),Math.sin(preset.pitch),Math.cos(preset.yaw)*Math.cos(preset.pitch)];
    const eye=target.map((value,axis)=>value-forward[axis]*preset.distance);
    eye[1]=Math.max(eye[1],view.Ground([eye[0],eye[2]])+preset.lookHeight);
    const delta=target.map((value,axis)=>value-eye[axis]);
    view.center=[...actor.p];view.focusDistance=Math.hypot(...delta);
    view.freeCamera={eye,yaw:preset.yaw,pitch:Math.atan2(delta[1],Math.hypot(delta[0],delta[2]))};
    entry.defaultCamera=false;
  }

  Draw(frame,layers,selection,annotations,draft,document=null) {
    const contentKey=JSON.stringify([frame.time,frame.beat.id,layers,selection,draft]);
    const contentChanged=document===null||document!==this.document||annotations!==this.annotations||contentKey!==this.contentKey;
    for(const entry of this.Visible()) {
      if(entry.defaultCamera) this.DefaultCamera(entry,frame);
      const perspective=!["plan","battle"].includes(entry.type);
      entry.target.hidden=!perspective||entry.type==="scene";entry.rotate.hidden=!perspective||entry.type==="scene";
      if(entry.mode==="follow") entry.map.Follow(frame);
      for(const button of entry.pane.querySelectorAll("[data-framing]")) {
        const pressed=String(button.dataset.framing===entry.mode);
        if(button.getAttribute("aria-pressed")!==pressed) button.setAttribute("aria-pressed",pressed);
      }
      const rect=entry.canvas.getBoundingClientRect(),view=entry.map;
      const drawKey=JSON.stringify([entry.type,entry.mode,entry.layers,view.center,view.scale,view.freeCamera,view.yaw,view.pitch,view.far,view.target,view.renderScale,rect.width,rect.height,window.devicePixelRatio]);
      if(!contentChanged&&drawKey===entry.drawKey) continue;
      entry.map.Draw(frame,entry.layers,selection,annotations,draft);
      entry.drawKey=drawKey;
      const status=`${frame.beat.id.toUpperCase()}  ·  ${entry.mode==="follow"?"镜头自动跟随":entry.mode==="manual"?"手动移动镜头":entry.mode==="all"?"整个关卡":"当前剧情范围"}`;
      if(entry.status.textContent!==status) entry.status.textContent=status;
    }
    this.document=document;this.annotations=annotations;this.contentKey=contentKey;
  }

  Serialize() {
    return {count:this.count,active:this.activeIndex,views:this.Visible().map((entry)=>{
      const rect=entry.canvas.getBoundingClientRect();
      return {type:entry.type,mode:entry.mode,layers:{...entry.layers},center:[...entry.map.center],scale:entry.map.scale,
        yaw:entry.map.yaw||0,pitch:entry.map.pitch||0.67,target:entry.map.target||"player",viewport:{width:rect.width,height:rect.height},
        ...(entry.map.type?{far:entry.map.far,freeCamera:entry.map.freeCamera?structuredClone(entry.map.freeCamera):null,focusDistance:entry.map.focusDistance||20}:{})};
    })};
  }

  Restore(layout) {
    if(!layout) return false;
    layout=ValidateViewportLayout(layout);
    this.SetLayout(layout.count);
    for(const [index,saved] of layout.views.entries()) {
      this.SetType(index,saved.type);
      const entry=this.entries[index],rect=entry.canvas.getBoundingClientRect();
      if(saved.layers) {
        Object.assign(entry.layers,saved.layers);
        for(const input of entry.layerMenu.querySelectorAll("input")) input.checked=entry.layers[input.dataset.layer];
      }
      entry.mode=saved.mode;entry.map.center=[...saved.center];entry.map.yaw=saved.yaw;entry.map.pitch=saved.pitch;entry.map.target=saved.target;
      if(entry.map.type) {entry.map.far=saved.far||1500;entry.map.freeCamera=saved.freeCamera?structuredClone(saved.freeCamera):entry.map.freeCamera;entry.map.focusDistance=saved.focusDistance||20;}
      const ratio=saved.viewport?Math.min(rect.width/saved.viewport.width,rect.height/saved.viewport.height):1;
      entry.map.scale=Clamp(saved.scale*ratio,0.15,40);
      entry.size={width:rect.width,height:rect.height};
    }
    this.Activate(Clamp(layout.active||0,0,this.count-1));return true;
  }

  Capture() {
    const rect=this.element.getBoundingClientRect(),ratio=Math.min(2,window.devicePixelRatio||1),output=document.createElement("canvas");
    output.width=Math.round(rect.width*ratio);output.height=Math.round(rect.height*ratio);
    const context=output.getContext("2d");context.fillStyle=getComputedStyle(this.element).backgroundColor;context.fillRect(0,0,output.width,output.height);
    context.scale(ratio,ratio);context.font="12px Microsoft YaHei, sans-serif";
    for(const entry of this.Visible()) {
      const pane=entry.pane.getBoundingClientRect(),canvas=entry.canvas.getBoundingClientRect();
      context.fillStyle=getComputedStyle(entry.bar).backgroundColor;context.fillRect(pane.x-rect.x,pane.y-rect.y,pane.width,pane.height);
      context.fillStyle=getComputedStyle(entry.bar).color;context.fillText(`视口 ${entry.index+1} · ${ENCOUNTER_VIEW_TYPES[entry.type]}`,pane.x-rect.x+10,pane.y-rect.y+20);
      context.drawImage(entry.canvas,canvas.x-rect.x,canvas.y-rect.y,canvas.width,canvas.height);
    }
    return output;
  }
}
