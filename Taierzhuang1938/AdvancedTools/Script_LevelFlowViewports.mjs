import { FlowMapView } from "./Script_LevelFlowView.mjs";
import { FlowPerspectiveView } from "./Script_LevelFlowPerspective.mjs";
import { Clamp } from "./Script_LevelFlowGeometry.mjs";
import { ReadSceneCamera, ValidateViewportLayout } from "./Script_LevelFlowDocument.mjs";
import { FLOW_DEFAULT_VIEWS, FLOW_SCENE_CAMERA, FLOW_SCENE_CAMERA_LIMITS, FLOW_ZOOM } from "../Data_Tuning_LevelFlow.mjs";

export const ENCOUNTER_VIEW_TYPES={plan:"空间总览",battle:"战斗局部",oblique:"立体俯视",scene:"Scene 自由视角",chase:"跟拍",eye:"玩家视线"};
const ENCOUNTER_VIEW_GROUPS={"2D":["battle"],"3D":["scene","chase","eye"]};
// Archived frame packets and framing controls still use the legacy projections.
const LEGACY_VIEW_SELECTIONS={plan:"battle",oblique:"scene"};
const SCENE_CAMERA_STORAGE_PREFIX="tengxian1938_encounter_scene_camera_v1_";

export class EncounterViewports {
  constructor(element,mapData,{activate,change,bounds,bind,storage}) {
    this.element=element;this.mapData=mapData;this.callbacks={activate,change,bounds,bind};
    this.count=1;this.entries=[];this.activeIndex=0;this.storage=storage;
    for(const [index,type] of [...FLOW_DEFAULT_VIEWS.map(view=>view.type),"battle","eye"].entries()) {
      const pane=document.createElement("section");pane.className="lfViewPane";pane.dataset.viewport=String(index);
      const bar=document.createElement("div");bar.className="lfViewBar";
      const title=document.createElement("span");title.textContent=`视口 ${index+1}`;bar.append(title);
      const select=document.createElement("select");select.setAttribute("aria-label",`视口 ${index+1} 视角`);
      for(const [label,types] of Object.entries(ENCOUNTER_VIEW_GROUPS)) {
        const group=document.createElement("optgroup");group.label=label;
        for(const value of types) {
          const option=document.createElement("option");option.value=value;option.textContent=ENCOUNTER_VIEW_TYPES[value];group.append(option);
        }
        select.append(group);
      }
      select.value=LEGACY_VIEW_SELECTIONS[type]||type;bar.append(select);
      const target=document.createElement("select");target.className="lfViewTarget";target.setAttribute("aria-label",`视口 ${index+1} 跟随对象`);
      for(const [value,label] of [["player","顺子"],["winter","冬瓜"],["luo","班长"],["tank1","头车"]]) {const option=document.createElement("option");option.value=value;option.textContent=label;target.append(option);}
      bar.append(target);
      const cameraMenu=document.createElement("details");cameraMenu.className="lfViewCamera";
      const cameraSummary=document.createElement("summary");cameraSummary.textContent="镜头";cameraSummary.title="镜头取景与相机设置";
      cameraSummary.setAttribute("aria-label",`视口 ${index+1} 镜头`);
      const cameraOptions=document.createElement("div");cameraMenu.append(cameraSummary,cameraOptions);bar.append(cameraMenu);
      const fit=document.createElement("button");fit.textContent="重置镜头";fit.title=`恢复视口 ${index+1} 的默认镜头位置`;cameraOptions.append(fit);
      const layerMenu=document.createElement("details");layerMenu.className="lfViewLayers";
      const layerSummary=document.createElement("summary");layerSummary.textContent="显示";layerMenu.append(layerSummary);
      const layerOptions=document.createElement("div");layerMenu.append(layerOptions);bar.append(layerMenu);
      const layers={fire:true,triggers:true,spawns:true,routes:true,airWalls:false,names:true,importantLandmarks:true,landmarks:false,hud:false};
      for(const [key,label] of [["fire","火力"],["triggers","触发"],["spawns","生成"],["routes","路线"],["airWalls","空气墙"],["names","人名"],["importantLandmarks","重要场景"],["landmarks","全部场景"],["hud","地图 HUD"]]) {
        const wrapper=document.createElement("label"),input=document.createElement("input");
        input.type="checkbox";input.checked=layers[key];input.dataset.layer=key;input.setAttribute("aria-label",`视口 ${index+1} ${label}`);
        input.onchange=()=>{layers[key]=input.checked;this.callbacks.change();};
        wrapper.append(input,document.createTextNode(label));layerOptions.append(wrapper);
      }
      for(const menu of [cameraMenu,layerMenu]) {
        menu.addEventListener("toggle",()=>{
          if(!menu.open) return;
          for(const other of this.entries) {
            for(const otherMenu of [other.cameraMenu,other.layerMenu]) {
              if(otherMenu!==menu) otherMenu.open=false;
            }
          }
        });
        menu.addEventListener("keydown",event=>{
          if(event.key!=="Escape") return;
          event.preventDefault();event.stopPropagation();menu.open=false;menu.querySelector("summary").focus();
        });
      }
      const canvas=document.createElement("canvas");canvas.id=index===0?"flowMap":`flowMap${index+1}`;canvas.tabIndex=0;
      canvas.setAttribute("aria-label",`视口 ${index+1} · ${ENCOUNTER_VIEW_TYPES[type]}`);
      const legend=document.getElementById("viewportLegend").content.firstElementChild.cloneNode(true);legend.hidden=true;
      for(const [mode,label,description] of [
        ["stage","当前剧情范围","缩放到当前剧情段落的活动范围，只调整这个视口"],
        ["all","整个关卡","缩放到整个关卡的范围，只调整这个视口"],
        ["follow","自动跟随","镜头自动跟随顺子或所选跟随对象，再点一次停止跟随"],
      ]) {
        const button=document.createElement("button");button.textContent=label;button.title=description;
        button.dataset.framing=mode;button.setAttribute("aria-pressed","false");
        button.onclick=()=>{this.SetFraming(index,mode);cameraMenu.open=false;cameraSummary.focus();};cameraOptions.append(button);
      }
      pane.append(bar,canvas,legend);element.append(pane);
      const sceneCamera={...FLOW_SCENE_CAMERA};
      try {
        const saved=storage?.getItem(SCENE_CAMERA_STORAGE_PREFIX+index);
        if(saved) Object.assign(sceneCamera,ReadSceneCamera(JSON.parse(saved)));
      } catch { /* Camera settings still work without browser storage. */ }
      const entry={index,pane,bar,canvas,select,target,legend,type,layers,layerMenu,cameraMenu,sceneCamera,
        mode:type==="scene"?"manual":"follow",map:this.MakeView(canvas,type,sceneCamera),size:null,defaultCamera:index<2};
      this.entries.push(entry);
      this.CreateCameraSettings(entry,cameraOptions);
      this.CreateGizmo(entry);
      pane.addEventListener("pointerdown",()=>this.Activate(index),{capture:true});
      select.onchange=()=>this.SetType(index,select.value);
      target.onchange=()=>{entry.map.target=target.value;entry.map.followAnchor=null;entry.mode="follow";this.callbacks.change();};
      fit.onclick=()=>{
        if(entry.type==="scene") {entry.defaultCamera=true;entry.mode="manual";}
        else {entry.mode=entry.type==="plan"?"stage":"follow";entry.map.followZoom=1;this.Frame(entry);}
        this.callbacks.change();cameraMenu.open=false;cameraSummary.focus();
      };
      this.callbacks.bind(entry);
    }
    this.observer=new ResizeObserver(()=>this.Resize());
    for(const entry of this.entries) this.observer.observe(entry.canvas);
    document.addEventListener("pointerdown",event=>{
      if(event.target.closest(".lfViewCamera, .lfViewLayers")) return;
      for(const entry of this.entries) {entry.cameraMenu.open=false;entry.layerMenu.open=false;}
    });
    this.SetLayout(1);
  }

  CreateCameraSettings(entry,container) {
    const fields=document.createElement("fieldset"),legend=document.createElement("legend");
    fields.className="lfSceneCameraSettings";
    legend.textContent="Scene 相机设置";
    fields.append(legend);
    const inputs={};
    const status=document.createElement("output");status.hidden=true;
    for(const [key,label,unit] of [["verticalFov","垂直 FOV","°"],["near","近裁剪","m"],["far","远裁剪","m"],["speed","移动速度","m/s"]]) {
      const row=document.createElement("label"),name=document.createElement("span"),input=document.createElement("input");
      const [min,max]=FLOW_SCENE_CAMERA_LIMITS[key];
      name.textContent=label;
      input.type="number";input.name=key;input.min=min;input.max=max;input.step="any";input.required=true;
      input.setAttribute("aria-label",`视口 ${entry.index+1} ${label}（${unit}）`);
      if(key==="speed") input.title="按住右键配合 WASD / Q / E 飞行，Shift 加速，滚轮实时调速";
      inputs[key]=input;
      input.addEventListener("change",()=>{
        const settings=ReadSceneCamera({...entry.sceneCamera,[key]:input.valueAsNumber});
        if(!settings) {
          input.setAttribute("aria-invalid","true");
          status.textContent=input.validity.valid?"远裁剪须比近裁剪至少大 0.01 m。":`请输入 ${min}–${max} ${unit}。`;
          status.hidden=false;
          return;
        }
        this.SaveCameraSettings(entry,settings);
      });
      row.append(name,input,document.createTextNode(unit));fields.append(row);
    }
    const reset=document.createElement("button");reset.type="button";reset.textContent="恢复默认参数";
    reset.addEventListener("click",()=>this.SaveCameraSettings(entry,FLOW_SCENE_CAMERA));
    fields.append(status,reset);container.append(fields);
    entry.cameraSettings=fields;
    entry.syncCameraSettings=()=>{
      for(const [key,input] of Object.entries(inputs)) {
        input.value=entry.sceneCamera[key];input.removeAttribute("aria-invalid");
      }
      status.hidden=true;
    };
    entry.cameraMenu.addEventListener("toggle",()=>{if(entry.cameraMenu.open) entry.syncCameraSettings();});
    entry.syncCameraSettings();
  }

  SaveCameraSettings(entry,settings) {
    Object.assign(entry.sceneCamera,settings);
    entry.syncCameraSettings();
    try {this.storage?.setItem(SCENE_CAMERA_STORAGE_PREFIX+entry.index,JSON.stringify(settings));}
    catch { /* Keep the settings available in this session. */ }
    this.callbacks.change();
  }

  AdjustFlySpeed(entry,factor) {
    const [min,max]=FLOW_SCENE_CAMERA_LIMITS.speed;
    const speed=Math.min(max,Math.max(min,entry.sceneCamera.speed*factor));
    this.SaveCameraSettings(entry,{...entry.sceneCamera,speed});
    const toast=entry.speedToast??=Object.assign(document.createElement("output"),{className:"lfSpeedToast"});
    toast.textContent=`飞行速度 ${speed.toFixed(speed<10?2:1)} m/s`;toast.hidden=false;
    entry.pane.append(toast);
    clearTimeout(entry.speedToastTimer);entry.speedToastTimer=setTimeout(()=>{toast.hidden=true;},900);
  }

  CreateGizmo(entry) {
    const gizmo=document.createElement("div");
    gizmo.className="lfViewGizmo";gizmo.tabIndex=0;
    gizmo.setAttribute("role","group");gizmo.setAttribute("aria-label",`视口 ${entry.index+1} XYZ 视角轴`);
    entry.gizmo=gizmo;entry.gizmoAxes=[];
    for(const [axis,color] of [["X","#e86a68"],["Y","#83c66f"],["Z","#6b9fee"]]) {
      for(const sign of [-1,1]) {
        const arm=document.createElement("div");arm.className="lfGizmoArm";
        arm.style.setProperty("--axis-color",color);
        const line=document.createElement("span");line.className="lfGizmoLine";
        const button=document.createElement("button");button.type="button";
        button.dataset.gizmoAxis=`${sign>0?"+":"-"}${axis}`;
        button.setAttribute("aria-label",`${sign>0?"+":"−"}${axis} 轴视角`);
        button.className=sign>0?"lfGizmoTip":"lfGizmoTip lfGizmoNegative";
        button.textContent=sign>0?axis:"";
        arm.append(line,button);gizmo.append(arm);
        entry.gizmoAxes.push({axis:"XYZ".indexOf(axis),sign,arm,line,button});
      }
    }
    const center=document.createElement("span");center.className="lfGizmoCenter";
    gizmo.append(center);entry.pane.append(gizmo);
  }

  DrawGizmo(entry) {
    const view=entry.map;
    if(entry.gizmo.hidden||!view.right) return;
    for(const {axis,sign,arm,line,button} of entry.gizmoAxes) {
      const x=view.right[axis]*sign*29,y=-view.up[axis]*sign*29;
      arm.style.zIndex=String(Math.round(100-view.forward[axis]*sign*20));
      line.style.width=`${Math.hypot(x,y)}px`;
      line.style.transform=`rotate(${Math.atan2(y,x)}rad)`;
      line.style.opacity=sign>0?"1":"0.35";
      button.style.left=`${48+x}px`;button.style.top=`${48+y}px`;
    }
  }

  MakeView(canvas,type,sceneCamera) {
    return ["plan","battle"].includes(type)?new FlowMapView(canvas,this.mapData):new FlowPerspectiveView(canvas,this.mapData,type,sceneCamera);
  }
  SetMapData(mapData) {
    this.mapData=mapData;
    this.contentKey="";
    for(const entry of this.entries) {
      const old=entry.map;
      entry.drawKey=null;
      entry.map=this.MakeView(entry.canvas,entry.type,entry.sceneCamera);
      entry.map.center=[...old.center];
      entry.map.scale=old.scale;
      entry.map.yaw=old.yaw||0;
      entry.map.pitch=old.pitch||0.67;
      entry.map.target=old.target||"player";
      entry.map.followZoom=old.followZoom??1;
      if(entry.type==="scene"&&old.freeCamera) {
        entry.map.freeCamera=structuredClone(old.freeCamera);
        entry.map.focusDistance=old.focusDistance||22;
      }
      this.Frame(entry);
    }
    this.Activate(this.activeIndex);
  }
  get active() {return this.entries[this.activeIndex];}
  Visible() {return this.entries.slice(0,this.count);}

  SetResizing(resizing) {
    // CSS stretches the existing canvas bitmap while the sidebar follows the pointer.
    // Rebuild terrain projection and raster buffers once at the final dimensions.
    this.resizing=resizing;
    if(!resizing) this.Resize(true);
  }

  Resize(force=false) {
    if(this.resizing) return;
    let changed=false;
    for(const entry of this.Visible()) {
      const rect=entry.canvas.getBoundingClientRect();
      if(rect.width<1||rect.height<1||entry.size?.width===rect.width&&entry.size?.height===rect.height) continue;
      if(entry.size&&entry.mode==="manual") entry.map.scale=Clamp(entry.map.scale*Math.min(rect.width/entry.size.width,rect.height/entry.size.height),FLOW_ZOOM.minScale,FLOW_ZOOM.maxScale);
      else this.Frame(entry);
      entry.size={width:rect.width,height:rect.height};
      changed=true;
    }
    if(changed||force) this.callbacks.change();
  }

  SetLayout(count) {
    this.count=[1,2,3,4].includes(Number(count))?Number(count):1;
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
    entry.type=type;entry.select.value=LEGACY_VIEW_SELECTIONS[type]||type;entry.map=this.MakeView(entry.canvas,type,entry.sceneCamera);
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
      if(mode!=="follow"&&["scene","eye","chase"].includes(entry.type)) this.SetType(index,"oblique");
      entry.mode=mode;
      if(mode==="follow") {entry.map.followZoom=1;entry.map.followAnchor=null;}
      this.Frame(entry);
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

  Draw(frame,layers,selection,annotations,draft,document=null,debug=null) {
    if(this.resizing&&!debug?.forceDraw) return;
    debug?.BeginViewports();
    try {this.DrawVisible(frame,layers,selection,annotations,draft,document,debug);}
    finally {debug?.EndViewports();}
  }

  DrawVisible(frame,layers,selection,annotations,draft,document,debug) {
    debug?.BeginCpu("encounterViewport/布局");
    const contentKey=JSON.stringify([frame.time,frame.beat.id,layers,selection,draft]);
    const contentChanged=document===null||document!==this.document||annotations!==this.annotations||contentKey!==this.contentKey;
    const viewports=this.Visible().map(entry=>({entry,rect:entry.canvas.getBoundingClientRect()}));
    debug?.EndCpu("encounterViewport/布局");
    for(const {entry,rect} of viewports) {
      debug?.BeginCpu("encounterViewport/视口状态");
      if(entry.defaultCamera) this.DefaultCamera(entry,frame);
      const perspective=!["plan","battle"].includes(entry.type);
      const hide=(element,value)=>{if(element.hidden!==value)element.hidden=value;};
      hide(entry.target,!perspective||entry.type==="scene");hide(entry.gizmo,!perspective);
      hide(entry.cameraSettings,entry.type!=="scene");
      hide(entry.legend,!entry.layers.hud);
      if(entry.mode==="follow") entry.map.Follow(frame);
      for(const button of entry.pane.querySelectorAll("[data-framing]")) {
        const pressed=String(button.dataset.framing===entry.mode);
        if(button.getAttribute("aria-pressed")!==pressed) {
          button.setAttribute("aria-pressed",pressed);
          if(button.dataset.framing==="follow") button.textContent=entry.mode==="follow"?"停止跟随":"自动跟随";
        }
      }
      const view=entry.map;
      const drawKey=JSON.stringify([entry.type,entry.mode,entry.layers,view.center,view.scale,view.freeCamera,view.yaw,view.pitch,view.fov,view.near,view.far,view.target,view.renderScale,view.hoveredActorId,rect.width,rect.height,window.devicePixelRatio]);
      debug?.EndCpu("encounterViewport/视口状态");
      if(!debug?.forceDraw&&!contentChanged&&drawKey===entry.drawKey) continue;
      const trace=debug?.BeginViewport(entry,`视口 ${entry.index+1} · ${ENCOUNTER_VIEW_TYPES[entry.type]}`);
      try {view.Draw(frame,entry.layers,selection,annotations,draft,rect,trace);}
      finally {trace?.End();}
      this.DrawGizmo(entry);
      entry.drawKey=drawKey;
    }
    this.document=document;this.annotations=annotations;this.contentKey=contentKey;
  }

  Serialize() {
    return {count:this.count,active:this.activeIndex,views:this.Visible().map((entry)=>{
      const rect=entry.canvas.getBoundingClientRect();
      return {type:entry.type,mode:entry.mode,layers:{...entry.layers},center:[...entry.map.center],scale:entry.map.scale,followZoom:entry.map.followZoom??1,
        yaw:entry.map.yaw||0,pitch:entry.map.pitch||0.67,target:entry.map.target||"player",viewport:{width:rect.width,height:rect.height},
        ...(entry.type==="scene"?entry.sceneCamera:entry.map.type?{far:entry.map.far}:{}),
        ...(entry.map.type?{freeCamera:entry.map.freeCamera?structuredClone(entry.map.freeCamera):null,focusDistance:entry.map.focusDistance||20,
          followAnchor:entry.map.followAnchor?[...entry.map.followAnchor]:null}:{})};
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
        entry.layers.airWalls=saved.layers.airWalls??false;
        entry.layers.importantLandmarks=saved.layers.importantLandmarks??(saved.layers.landmarks??true);
        entry.layers.landmarks=saved.layers.landmarks??false;
      }
      entry.layers.hud=saved.layers?.hud??false;
      for(const input of entry.layerMenu.querySelectorAll("input")) input.checked=entry.layers[input.dataset.layer];
      entry.mode=saved.mode;entry.map.center=[...saved.center];entry.map.yaw=saved.yaw;entry.map.pitch=saved.pitch;entry.map.target=saved.target;
      entry.map.followZoom=saved.followZoom??1;
      entry.map.followAnchor=saved.followAnchor?[...saved.followAnchor]:null;
      if(entry.type==="scene") {
        Object.assign(entry.sceneCamera,ReadSceneCamera(saved));entry.syncCameraSettings();
      }
      if(entry.map.type) {
        if(entry.type!=="scene") entry.map.viewFar=saved.far??FLOW_SCENE_CAMERA.far;
        entry.map.freeCamera=saved.freeCamera?structuredClone(saved.freeCamera):entry.map.freeCamera;
        entry.map.focusDistance=saved.focusDistance||20;
      }
      const ratio=saved.viewport?Math.min(rect.width/saved.viewport.width,rect.height/saved.viewport.height):1;
      entry.map.scale=Clamp(saved.scale*ratio,FLOW_ZOOM.minScale,FLOW_ZOOM.maxScale);
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
