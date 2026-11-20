import { EncounterGpuRaster } from "./Script_LevelFlowGpuRaster.mjs";
import { LevelFlowFrameCapture } from "./Script_LevelFlowFrameCapture.mjs";
import { ENCOUNTER_VIEW_TYPES } from "./Script_LevelFlowViewports.mjs";

const TOOLS={
  profiler:{label:"Profiler",features:"width=1360,height=980,menubar=no,toolbar=no"},
  frameDebugger:{label:"Frame Debugger",features:"width=1440,height=980,menubar=no,toolbar=no"},
};

export class LevelFlowDebug {
  constructor({requestRender,renderFrame,toast,visible}) {
    Object.assign(this,{requestRender,toast,visible});
    this.windows=new Map();
    this.capture=new LevelFlowFrameCapture(renderFrame);
    this.name=`${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    window.addEventListener("pagehide",()=>this.CloseAll());
  }

  async Open(id) {
    const tool=TOOLS[id],existing=this.windows.get(id);
    if(existing&&!existing.popup.closed) {existing.popup.focus();return;}
    this.Close(id);
    let popup;
    try {popup=window.open("",`levelFlowDebug_${this.name}_${id}`,tool.features);} catch {}
    if(!popup) {this.toast(`${tool.label} 独立窗口被浏览器拦截，请允许弹窗后重试`);return;}
    const slot={popup};this.windows.set(id,slot);
    try {
      popup.document.title=`Encounter Designer · ${tool.label}`;
      popup.document.body.textContent=`加载 ${tool.label}…`;
      if(id==="profiler") {
        const [{FrameProfiler},{ProfilerEditor}]=await Promise.all([
          import("../Script_Profiler.mjs"),import("../Script_EditorProfiler.mjs"),
        ]);
        if(this.windows.get(id)!==slot||popup.closed) return;
        const gl=EncounterGpuRaster()?.gl??null;
        this.renderStats={calls:0,triangles:0};
        const profiler=new FrameProfiler({getContext:()=>gl,info:{
          render:this.renderStats,reset:()=>{this.renderStats.calls=0;this.renderStats.triangles=0;},
        }});
        profiler.environment=()=>({source:"Encounter Designer",window:`${window.innerWidth}×${window.innerHeight}`,
          dpr:window.devicePixelRatio,output:this.visible().map(({canvas})=>`${canvas.width}×${canvas.height}`).join(" · ")});
        profiler.AddCounter("viewports",()=>this.visible().length,{label:"可见视口",group:"编辑器"});
        slot.panel=new ProfilerEditor({profiler,preview:true,CloseProfiler:()=>this.Close(id),RequestDrawFrame:()=>{
          this.fullDraw=true;this.requestRender();
        }},popup);
        slot.panel.Enter();
        this.profiler=profiler;this.lastRender=0;this.fullDraw=true;this.requestRender();
      } else {
        const {FrameDebuggerEditor}=await import("../Script_EditorFrameDebugger.mjs");
        if(this.windows.get(id)!==slot||popup.closed) return;
        slot.panel=new FrameDebuggerEditor({preview:true,game:{FrameDebugger:this.capture},
          CaptureTargets:()=>this.visible().map(({index,type})=>[index,`视口 ${index+1} · ${ENCOUNTER_VIEW_TYPES[type]}`]),
          CloseFrameDebugger:()=>this.Close(id)},popup);
        slot.panel.Enter();
      }
    } catch(error) {
      if(this.windows.get(id)!==slot) return;
      this.Close(id);this.toast(`${tool.label} 打不开：${error.message}`);
    }
  }

  Close(id) {
    const slot=this.windows.get(id);if(!slot) return;
    this.windows.delete(id);slot.panel?.Exit();
    if(!slot.popup.closed) slot.popup.close();
    if(id==="profiler") {this.profiler=null;this.fullDraw=false;this.lastRender=null;}
  }

  CloseAll() {for(const id of this.windows.keys()) this.Close(id);}

  Update(dt) {
    for(const [id,slot] of this.windows) if(slot.popup.closed) this.Close(id);
    if(this.profiler) {
      if(this.capture.capture?.gpuStatus!=="pending") this.profiler.PollGpu();
      this.windows.get("profiler").panel.Update(dt);
    }
  }

  BeginFrame(time,tick) {
    const capturing=this.capture.state==="armed";
    if(capturing) this.capture.Begin();
    this.profileFrame=!capturing&&this.capture.capture?.gpuStatus!=="pending"&&this.profiler?.recording?this.profiler:null;
    if(this.profileFrame) {
      this.profileFrame.BeginFrame(time,!!tick&&tick.previous===this.lastRender);
      const start=performance.now();
      const previous=this.profileFrame.history.at(-1);
      this.redrawIntervalMs=previous?start-previous.t0:null;
      this.outsideRenderBeforeMs=previous?Math.max(0,start-previous.t0-previous.cpuMs):null;
      this.beforeRender=tick?.beforeRender??null;
    }
    this.preview=null;
    this.lastRender=this.profileFrame&&tick?time:null;
    this.forceDraw=capturing||!!(this.profileFrame&&this.fullDraw);
    if(this.profileFrame) this.fullDraw=false;
  }

  BeginCpu(name) {this.profileFrame?.B(name);}
  EndCpu(name) {this.profileFrame?.E(name);}
  SetFrameContext(frame) {
    if(!this.profileFrame) return;
    this.profileFrame.SetFrameContext("editorPreview",frame.stage.id);
    this.preview={timeSeconds:frame.time,beat:frame.beat.id,redrawIntervalMs:this.redrawIntervalMs,outsideRenderBeforeMs:this.outsideRenderBeforeMs,beforeRender:this.beforeRender,viewports:[]};
  }

  BeginViewports() {
    this.BeginCpu("encounterViewport");
    this.profileFrame?.GpuFrameStart(true);
  }

  EndViewports() {
    this.profileFrame?.GpuFrameEnd();
    this.EndCpu("encounterViewport");
  }

  BeginViewport(entry,name) {
    const domain=`encounterViewport/视口 ${entry.index+1}`;
    const capture=this.capture.state==="capturing"&&(this.capture.requestedViewport===null||this.capture.requestedViewport===entry.index)?this.capture:null;
    const profiler=this.profileFrame,stats=this.renderStats;
    const passStart=capture?performance.now():0,overhead=capture?.overhead||0;
    const scopes=profiler?[domain]:null;
    const cpu=profiler?{
      Begin:label=>{
        const path=`${scopes.at(-1)}/${label}`;
        scopes.push(path);profiler.B(path);
      },
      End:()=>profiler.E(scopes.pop()),
    }:null;
    profiler?.B(domain);
    capture?.BeginViewport(name,entry.index,entry.type,entry.canvas);
    return {
      cpu,
      capturing:!!capture,
      captureDraws:!!profiler?.capturingDraws,
      redrawBase:this.forceDraw,
      Canvas:(label,canvas,started)=>capture?.CanvasEvent(label,canvas,performance.now()-started),
      BeginGpu:phase=>profiler?.GpuPush(`${domain}/${phase}`),
      EndGpu:()=>profiler?.GpuPop(),
      BeginGl:gl=>capture?.BeginGpu(gl),
      Gl:(gl,phase,api,args,triangles,cpuMs,query,gpu,raster)=>{
        if(profiler&&triangles!==null) {
          stats.calls++;stats.triangles+=triangles;
          if(profiler.capturingDraws) profiler.RecordRawDraw(api,triangles,cpuMs);
        }
        if(capture) {
          const start=performance.now();
          capture.GlEvent(gl,phase,api,args,triangles,cpuMs,query,gpu,raster);
          capture.overhead+=performance.now()-start;
        }
      },
      End:()=>{
        if(profiler) {
          while(scopes.length) cpu.End();
          this.preview?.viewports.push({index:entry.index+1,type:entry.type,
            backend:entry.map.raster?(entry.map.raster.accelerated?"webgl2":"software"):"canvas2d",
            width:entry.canvas.width,height:entry.canvas.height,
            camera:entry.map.eye?{eye:[...entry.map.eye],forward:[...entry.map.forward],up:[...entry.map.up],
              perspective:entry.map.raster.perspective,scale:entry.map.scale,fov:entry.map.fov,verticalFov:entry.map.verticalFov,near:entry.map.near,far:entry.map.far,
              navigating:!!entry.map.navigationActive}:null});
        }
        capture?.EndViewport(Math.max(0,performance.now()-passStart-(capture.overhead-overhead)));
      },
    };
  }

  EndFrame(error) {
    this.profileFrame?.EndFrame(this.preview?{preview:this.preview}:undefined);
    this.profileFrame=null;
    if(this.capture.state==="capturing") this.capture.Finish(error);
  }
}
