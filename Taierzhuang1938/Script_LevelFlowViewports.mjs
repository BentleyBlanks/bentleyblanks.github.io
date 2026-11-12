import { FlowMapView } from "./Script_LevelFlowView.mjs";
import { FlowPerspectiveView } from "./Script_LevelFlowPerspective.mjs";
import { Clamp } from "./Script_LevelFlowGeometry.mjs";
import { ValidateViewportLayout } from "./Script_LevelFlowDocument.mjs";

export const ENCOUNTER_VIEW_TYPES={plan:"空间总览",battle:"战斗局部",oblique:"立体俯视",chase:"跟拍",eye:"玩家视线"};

export class EncounterViewports {
  constructor(element,mapData,{activate,change,bounds,bind}) {
    this.element=element;this.mapData=mapData;this.callbacks={activate,change,bounds,bind};
    this.count=2;this.entries=[];this.activeIndex=0;
    for(const [index,type] of ["plan","oblique","battle","eye"].entries()) {
      const pane=document.createElement("section");pane.className="lfViewPane";pane.dataset.viewport=String(index);
      const bar=document.createElement("div");bar.className="lfViewBar";
      const title=document.createElement("span");title.textContent=`视口 ${index+1}`;bar.append(title);
      const select=document.createElement("select");select.setAttribute("aria-label",`视口 ${index+1} 视角`);
      for(const [value,label] of Object.entries(ENCOUNTER_VIEW_TYPES)) {const option=document.createElement("option");option.value=value;option.textContent=label;select.append(option);}
      select.value=type;bar.append(select);
      const target=document.createElement("select");target.className="lfViewTarget";target.setAttribute("aria-label",`视口 ${index+1} 跟随对象`);
      for(const [value,label] of [["player","顺子"],["winter","冬瓜"],["luo","班长"],["tank1","头车"]]) {const option=document.createElement("option");option.value=value;option.textContent=label;target.append(option);}
      bar.append(target);
      const fit=document.createElement("button");fit.textContent="复位";fit.title=`复位视口 ${index+1}`;bar.append(fit);
      const rotate=document.createElement("button");rotate.textContent="↻";rotate.title="旋转 45°";bar.append(rotate);
      const canvas=document.createElement("canvas");canvas.id=index===0?"flowMap":`flowMap${index+1}`;canvas.tabIndex=0;
      canvas.setAttribute("aria-label",`视口 ${index+1} · ${ENCOUNTER_VIEW_TYPES[type]}`);
      const status=document.createElement("div");status.className="lfViewStatus";
      pane.append(bar,canvas,status);element.append(pane);
      const entry={index,pane,bar,canvas,select,target,rotate,status,type,mode:type==="plan"?"stage":"follow",map:this.MakeView(canvas,type),size:null};
      this.entries.push(entry);
      pane.addEventListener("pointerdown",()=>this.Activate(index),{capture:true});
      select.onchange=()=>this.SetType(index,select.value);
      target.onchange=()=>{entry.map.target=target.value;entry.mode="follow";this.callbacks.change();};
      fit.onclick=()=>{entry.mode=entry.type==="plan"?"stage":"follow";this.Frame(entry);this.callbacks.change();};
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
    entry.type=type;entry.select.value=type;entry.map=this.MakeView(entry.canvas,type);
    entry.map.center=[...old.center];entry.map.scale=old.scale;
    entry.mode=type==="plan"?"stage":"follow";
    entry.canvas.setAttribute("aria-label",`视口 ${index+1} · ${ENCOUNTER_VIEW_TYPES[type]}`);
    this.Frame(entry);this.Activate(index);
  }

  Frame(entry) {
    if(entry.mode==="stage") entry.map.Fit(this.callbacks.bounds());
    if(entry.mode==="all") entry.map.Fit(this.mapData.bounds);
  }

  FrameStage() {for(const entry of this.Visible()) if(entry.mode==="stage") this.Frame(entry);}

  Draw(frame,layers,selection,annotations,draft) {
    for(const entry of this.Visible()) {
      const perspective=!["plan","battle"].includes(entry.type);
      entry.target.hidden=!perspective;entry.rotate.hidden=!perspective;
      if(entry.mode==="follow") entry.map.Follow(frame);
      entry.map.Draw(frame,layers,selection,annotations,draft);
      entry.status.textContent=`${frame.beat.id.toUpperCase()}  ·  ${entry.mode==="follow"?"跟随":entry.mode==="manual"?"自由取景":entry.mode==="all"?"全图":"本段"}`;
    }
  }

  Serialize() {
    return {count:this.count,active:this.activeIndex,views:this.Visible().map((entry)=>{
      const rect=entry.canvas.getBoundingClientRect();
      return {type:entry.type,mode:entry.mode,center:[...entry.map.center],scale:entry.map.scale,
        yaw:entry.map.yaw||0,pitch:entry.map.pitch||0.67,target:entry.map.target||"player",viewport:{width:rect.width,height:rect.height}};
    })};
  }

  Restore(layout) {
    if(!layout) return false;
    layout=ValidateViewportLayout(layout);
    this.SetLayout(layout.count);
    for(const [index,saved] of layout.views.entries()) {
      this.SetType(index,saved.type);
      const entry=this.entries[index],rect=entry.canvas.getBoundingClientRect();
      entry.mode=saved.mode;entry.map.center=[...saved.center];entry.map.yaw=saved.yaw;entry.map.pitch=saved.pitch;entry.map.target=saved.target;
      const ratio=saved.viewport?Math.min(rect.width/saved.viewport.width,rect.height/saved.viewport.height):1;
      entry.map.scale=Clamp(saved.scale*ratio,0.15,40);
      entry.size={width:rect.width,height:rect.height};
    }
    this.Activate(Clamp(layout.active||0,0,this.count-1));return true;
  }

  Capture() {
    const rect=this.element.getBoundingClientRect(),ratio=Math.min(2,window.devicePixelRatio||1),output=document.createElement("canvas");
    output.width=Math.round(rect.width*ratio);output.height=Math.round(rect.height*ratio);
    const context=output.getContext("2d");context.fillStyle="#11160f";context.fillRect(0,0,output.width,output.height);
    context.scale(ratio,ratio);context.font="12px Microsoft YaHei, sans-serif";
    for(const entry of this.Visible()) {
      const pane=entry.pane.getBoundingClientRect(),canvas=entry.canvas.getBoundingClientRect();
      context.fillStyle="#192017";context.fillRect(pane.x-rect.x,pane.y-rect.y,pane.width,pane.height);
      context.fillStyle="#dfcfab";context.fillText(`视口 ${entry.index+1} · ${ENCOUNTER_VIEW_TYPES[entry.type]}`,pane.x-rect.x+10,pane.y-rect.y+20);
      context.drawImage(entry.canvas,canvas.x-rect.x,canvas.y-rect.y,canvas.width,canvas.height);
    }
    return output;
  }
}
