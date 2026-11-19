import { EnumName } from "../Script_FrameDebugGl.mjs";

const MAX_PREVIEW_EDGE=960;
let nextCaptureId=0;

export class LevelFlowFrameCapture {
  constructor(renderFrame) {
    this.renderFrame=renderFrame;this.state="idle";this.error="";this.revision=0;this.selected=-1;
    this._events=[];this.queries=[];this.images=new Map();this.timers=new Map();
  }

  get frozen(){return this.state==="frozen";}

  RequestCapture() {
    this.Resume();
    this.state="armed";this.error="";this.revision++;
    this.renderFrame();
  }

  Begin() {
    this.started=performance.now();this.overhead=0;this.state="capturing";
    this.capture={id:++nextCaptureId,capturedAt:new Date().toISOString(),events:this._events,passes:[],programs:[],
      commandCount:0,bytes:0,cpuMs:0,gpuMs:null,gpuStatus:"unavailable"};
  }

  BeginViewport(name,index,type,canvas) {
    const pass={id:this.capture.passes.length,name,path:name,parent:null,first:this._events.length,viewport:index+1,type,
      commandStart:this._events.length,gpuMs:null,draws:0};
    this.capture.passes.push(pass);this.pass=pass;this.canvas=canvas;
  }

  EndViewport(cpuMs) {
    const pass=this.pass;
    pass.last=this._events.length-1;pass.commandEnd=this._events.length;pass.cpuMs=cpuMs;
    this.pass=null;this.canvas=null;
  }

  BeginGpu(gl) {
    if(!this.timers.has(gl)) this.timers.set(gl,gl.getExtension("EXT_disjoint_timer_query_webgl2"));
    const timer=this.timers.get(gl);
    if(!timer||gl.isContextLost()||gl.getQuery(timer.TIME_ELAPSED_EXT,gl.CURRENT_QUERY)) return null;
    const query=gl.createQuery();if(!query) return null;
    gl.beginQuery(timer.TIME_ELAPSED_EXT,query);
    return {gl,timer,query};
  }

  AddEvent(event) {
    const index=this._events.length,pass=this.pass;
    if(event.draw) pass.draws++;
    this._events.push({index,command:index,pass:pass.id,path:pass.path,gpuMs:null,uniforms:[],programId:-1,...event});
    return index;
  }

  GlEvent(gl,phase,api,args,triangles,cpuMs,query) {
    if(query) {
      gl.endQuery(query.timer.TIME_ELAPSED_EXT);
      this.queries.push({...query,index:this._events.length,pass:this.pass.id});
    }
    const draw=triangles!==null;
    const indexed=api==="drawElements",count=draw?args[indexed?1:2]:0;
    const instances=api==="drawArraysInstanced"?args[3]:1;
    const part=indexed?{count,offsetBytes:args[3],instances:1}:{count,first:args[1],instances};
    const drawInfo=draw?{topology:EnumName(gl,args[0]),indexed,batch:false,subDraws:1,submissions:1,elements:count*instances,
      indexType:indexed?EnumName(gl,args[2]):null,parts:[part]}:null;
    const kind=draw?"Draw Procedural":api==="blitFramebuffer"?"Blit":"Clear";
    const label=kind==="Clear"?`${api} · ${args[0]===gl.DEPTH?"Depth":`Color ${args[1]}`}`:api;
    const target=gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING)?"WebGL2 Render Target":"WebGL2 Backbuffer";
    const targetSize=kind==="Blit"?[Math.abs(args[6]-args[4]),Math.abs(args[7]-args[5])]:Array.from(gl.getParameter(gl.VIEWPORT)).slice(2);
    this.AddEvent({kind,label,phase,api,args:args.map(value=>ArrayBuffer.isView(value)?[...value]:value),draw,drawInfo,
      cpuMs,cpuSubmitMs:cpuMs,target,targetSize,_target:{name:target,width:targetSize[0],height:targetSize[1],attachments:[]}});
  }

  CanvasEvent(label,canvas,cpuMs) {
    const start=performance.now(),target=canvas===this.canvas?"Viewport Canvas":"Background Canvas";
    const width=canvas.width,height=canvas.height,scale=Math.min(1,MAX_PREVIEW_EDGE/Math.max(width,height));
    const image=document.createElement("canvas");
    image.width=Math.max(1,Math.round(width*scale));image.height=Math.max(1,Math.round(height*scale));
    image.getContext("2d",{willReadFrequently:true}).drawImage(canvas,0,0,image.width,image.height);
    const index=this.AddEvent({kind:"Canvas2D",label,api:"Canvas2D",args:[],draw:false,cpuMs,target,targetSize:[width,height],
      _target:{name:target,width,height,attachments:[{name:"Color",format:"RGBA8",width:image.width,height:image.height}]}});
    this.images.set(index,image);this.capture.bytes+=image.width*image.height*4;
    this.overhead+=performance.now()-start;
  }

  Finish(error) {
    if(error||!this._events.length) {
      this.Resume();this.state="error";this.error=String(error?.message||error||"没有可捕获的视口");return;
    }
    this.capture.cpuMs=Math.max(0,performance.now()-this.started-this.overhead);
    this.capture.commandCount=this._events.length;
    this.capture.gpuStatus=this.queries.length?"pending":"unavailable";
    this.pollStarted=performance.now();this.state="frozen";this.revision++;
  }

  Poll() {
    if(this.capture?.gpuStatus!=="pending") return;
    const last=this.queries.at(-1),{gl,timer}=last;
    const invalid=gl.isContextLost()||gl.getParameter(timer.GPU_DISJOINT_EXT);
    const timeout=performance.now()-this.pollStarted>15000;
    if(!invalid&&!timeout&&this.queries.some(item=>!item.gl.getQueryParameter(item.query,item.gl.QUERY_RESULT_AVAILABLE))) return;
    if(!invalid&&!timeout) {
      this.capture.gpuMs=0;
      for(const {gl,query,index,pass} of this.queries) {
        const ms=gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6;
        this._events[index].gpuMs=ms;this.capture.gpuMs+=ms;
        this.capture.passes[pass].gpuMs=(this.capture.passes[pass].gpuMs??0)+ms;
      }
    }
    this.ReleaseQueries();
    this.capture.gpuStatus=invalid?"disjoint":timeout?"timeout":"ready";this.revision++;
  }

  ReleaseQueries() {
    for(const {gl,query} of this.queries) gl.deleteQuery(query);
    this.queries=[];this.timers.clear();
  }

  Preview(index) {
    const image=this.images.get(index);if(!image) return null;
    const {width,height}=image;
    return {width,height,pixels:image.getContext("2d").getImageData(0,0,width,height).data};
  }

  Inspect() {
    return this.capture?{state:this.state,selected:this.selected,...this.capture,
      events:this._events.map(({_target,...event})=>({...event,attachments:_target.attachments}))}:{state:this.state,error:this.error};
  }

  Resume() {
    this.ReleaseQueries();this.images.clear();this._events=[];this.capture=null;this.pass=null;this.canvas=null;
    this.state="idle";this.selected=-1;this.error="";this.revision++;
  }
}
