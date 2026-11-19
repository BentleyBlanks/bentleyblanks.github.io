import { DescribeFramebuffer, EnumName, ReadDrawState, ReadOutput, ReadProgram, ReadTexture } from "../Script_FrameDebugGl.mjs";

const MAX_PREVIEW_EDGE=960;
const GL_PREVIEW_EDGE=512;
const TEXTURE_PREVIEW_EDGE=256;
const CHANNELS={r:0,g:1,b:2,a:3};
const GPU_PREVIEW_BYTES=192*1024*1024;
let nextCaptureId=0;

function PreviewWidth(width,height,edge) {
  return Math.max(1,Math.round(width*Math.min(1,edge/Math.max(width,height))));
}

function DisplayImage(image,{channel="rgba",black=0,white=1,exposure=0}={},scalar=false) {
  if(!image) return null;
  const {width,height,pixels}=image,scale=pixels instanceof Float32Array?1:1/255;
  if(!scalar&&scale!==1&&channel==="rgba"&&black===0&&white===1&&exposure===0) return image;
  const gain=2**exposure,range=Math.max(.000001,white-black),output=new Uint8ClampedArray(width*height*4);
  const Level=value=>(value*scale*gain-black)/range*255;
  if(scalar) {
    for(let i=0,offset=0;i<pixels.length;i++,offset+=4) {
      output[offset]=output[offset+1]=output[offset+2]=Level(pixels[i]);output[offset+3]=255;
    }
    return {width,height,pixels:output};
  }
  const component=CHANNELS[channel];
  for(let i=0;i<pixels.length;i+=4) {
    const alpha=(pixels[i+3]*scale-black)/range*255;
    if(component!==undefined) {
      const gray=component===3?alpha:Level(pixels[i+component]);
      output[i]=output[i+1]=output[i+2]=gray;output[i+3]=255;
    } else {
      output[i]=Level(pixels[i]);output[i+1]=Level(pixels[i+1]);output[i+2]=Level(pixels[i+2]);
      output[i+3]=channel==="rgb"?255:alpha;
    }
  }
  return {width,height,pixels:output};
}

export class LevelFlowFrameCapture {
  constructor(renderFrame) {
    this.renderFrame=renderFrame;this.state="idle";this.error="";this.revision=0;this.selected=-1;
    this._events=[];this.queries=[];this.images=new Map();this.textureImages=new Map();this.timers=new Map();
  }

  get frozen(){return this.state==="frozen";}

  RequestCapture(viewport=null) {
    this.Resume();
    this.state="armed";this.requestedViewport=viewport;this.error="";this.revision++;
    this.renderFrame();
  }

  Begin() {
    this.started=performance.now();this.overhead=0;this.state="capturing";
    this.programIds=new Map();this.previewBytes=0;
    this.capture={id:++nextCaptureId,capturedAt:new Date().toISOString(),events:this._events,passes:[],programs:[],
      commandCount:0,bytes:0,cpuMs:0,gpuMs:null,gpuStatus:"unavailable"};
  }

  BeginViewport(name,index,type,canvas) {
    const pass={id:this.capture.passes.length,name,path:name,parent:null,first:this._events.length,viewport:index+1,type,
      commandStart:this._events.length,gpuMs:null,draws:0};
    this.capture.passes.push(pass);this.pass=pass;this.canvas=canvas;this.lastOutput=null;
  }

  EndViewport(cpuMs) {
    this.EndPhase();
    const pass=this.pass;
    pass.last=this._events.length-1;pass.commandEnd=this._events.length;pass.cpuMs=cpuMs;
    this.pass=null;this.canvas=null;this.lastOutput=null;
  }

  EndPhase() {
    if(!this.phase) return;
    this.phase.last=this._events.length-1;
    this.phase.commandEnd=this._events.length;
    this.phase=null;
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
    const name=event.phase||"Canvas2D",index=this._events.length;
    if(this.phase?.name!==name) {
      this.EndPhase();
      this.phase={id:this.capture.passes.length,name,path:`${this.pass.path} / ${name}`,parent:this.pass.id,
        first:index,commandStart:index,draws:0,cpuMs:0,gpuMs:null};
      this.capture.passes.push(this.phase);
    }
    const pass=this.phase;
    pass.cpuMs+=event.cpuMs;
    if(event.draw) {pass.draws++;this.pass.draws++;}
    this._events.push({index,command:index,pass:pass.id,path:pass.path,gpuMs:null,uniforms:[],programId:-1,...event});
    return index;
  }

  GlEvent(gl,phase,api,args,triangles,cpuMs,query,gpu,raster) {
    this.gl=gl;
    if(query) gl.endQuery(query.timer.TIME_ELAPSED_EXT);
    let queryStored=false;
    try {
      const draw=triangles!==null,blit=api==="blitFramebuffer",indexed=api==="drawElements";
      const count=draw?args[indexed?1:2]:0,instances=api==="drawArraysInstanced"?args[3]:1;
      const part=indexed?{count,offsetBytes:args[3],instances}:{count,first:args[1],instances};
      const drawInfo=draw?{topology:args[0]===gl.POINTS?"POINTS":EnumName(gl,args[0]),indexed,batch:false,subDraws:1,submissions:1,elements:count*instances,
        indexType:indexed?EnumName(gl,args[2]):null,parts:[part]}:null;
      const state=ReadDrawState(gl),framebuffer=gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
      const region=blit?[Math.min(args[4],args[6]),Math.min(args[5],args[7]),Math.abs(args[6]-args[4]),Math.abs(args[7]-args[5])]:state.VIEWPORT;
      const [width,height]=region.slice(2),targetSize=[width,height];
      const geometry=draw?gpu.DebugGeometry(raster,gl.getParameter(gl.VERTEX_ARRAY_BINDING),part.first,count):null;
      let kind=blit?"Blit":"Clear",label=blit?"输出到视口":args[0]===gl.DEPTH?"Depth":`Color ${args[1]}`;
      if(draw) {
        kind=geometry?.batches?"Draw Batched":geometry?"Draw Mesh":api==="drawArraysInstanced"?"Draw Procedural":"Draw Fullscreen";
        label=geometry?.name||phase;
        if(geometry?.batches) drawInfo.geometryBatches=geometry.batches.length;
      }
      const target=gpu.DebugTargetName(framebuffer);
      const formats=DescribeFramebuffer(gl,framebuffer,width,height);
      const attachments=formats.map(({object,...attachment})=>({...attachment,format:EnumName(gl,attachment.format),
        name:target==="场景 G-Buffer"?["颜色","线性距离","法线"][attachment.point-gl.COLOR_ATTACHMENT0]||attachment.name:attachment.name}));
      const drawData=draw?this.ShaderData(gl,gpu,raster):{};
      const clearIndex=kind==="Clear"?formats.findIndex(a=>args[0]===gl.DEPTH?a.depth:a.point===gl.COLOR_ATTACHMENT0+args[1]):0;
      const index=this.AddEvent({kind,label,phase,api,args:args.map(value=>ArrayBuffer.isView(value)?[...value]:value),draw,drawInfo,
        cpuMs,cpuSubmitMs:cpuMs,target,targetSize,state,...drawData,
        _geometry:count?this.CopyGeometry(geometry):null,_target:{name:target,width,height,attachments,defaultAttachment:Math.max(0,clearIndex)}});
      if(query) {
        this.queries.push({...query,index,pass:this.phase.id,viewport:this.pass.id});
        queryStored=true;
      }
      this.SaveOutputs(gl,index,framebuffer,formats,attachments,region,kind==="Clear"?clearIndex:null);
      for(const [i,texture] of (drawData.textures||[]).entries()) {
        const {_handle:handle,width,height,scalar,format}=texture;
        delete texture._handle;
        if(!handle||!width||!/^SAMPLER_2D(_SHADOW)?$/.test(texture.sampler)) continue;
        this.SaveImage(this.textureImages,`${index}:${i}`,texture,()=>ReadTexture(gl,handle,{
          sourceWidth:width,sourceHeight:height,raw:scalar||/F$/.test(format),flipY:texture.flipY,
          width:PreviewWidth(width,height,TEXTURE_PREVIEW_EDGE),
        }));
      }
    } finally {if(query&&!queryStored) gl.deleteQuery(query.query);}
  }

  SaveOutputs(gl,index,framebuffer,formats,attachments,region,cleared) {
    const previous=this.lastOutput;
    this.lastOutput={framebuffer,index};
    if(!framebuffer) {
      // Overlay draws and the scene blit both occupy only the active pane.
      const format={...formats[0],width:gl.drawingBufferWidth,height:gl.drawingBufferHeight};
      this.SaveImage(this.images,`${index}:0`,attachments[0],()=>ReadOutput(gl,framebuffer,format,
        {region,width:PreviewWidth(region[2],region[3],GL_PREVIEW_EDGE)}));
      return;
    }
    for(const [i,format] of formats.entries()) {
      const attachment=attachments[i],raw=format.depth||/F$/.test(attachment.format);
      attachment.scalar=format.depth||format.format===gl.R32F;
      // Successive MRT clears write one attachment. Keep the others from
      // the previous event on this target without synchronizing again.
      const unchanged=cleared!==null&&cleared>=0&&i!==cleared&&previous?.framebuffer===framebuffer
        ?this.images.get(`${previous.index}:${i}`):null;
      if(unchanged) {
        this.images.set(`${index}:${i}`,unchanged);
        attachment.previewSize=[unchanged.width,unchanged.height];
        continue;
      }
      this.SaveImage(this.images,`${index}:${i}`,attachment,()=>ReadOutput(gl,framebuffer,format,
        {raw,flipY:false,width:PreviewWidth(format.width,format.height,GL_PREVIEW_EDGE)}));
    }
  }

  ShaderData(gl,gpu,raster) {
    const handle=gl.getParameter(gl.CURRENT_PROGRAM),program=ReadProgram(gl,handle);
    if(!program) return {};
    const shaderName=gpu.DebugProgramName(handle);
    if(!this.programIds.has(handle)) {
      this.programIds.set(handle,this.capture.programs.length);
      this.capture.programs.push({name:shaderName,sources:program.sources});
    }
    const textures=[],active=gl.getParameter(gl.ACTIVE_TEXTURE);
    try {
      for(const uniform of program.uniforms.filter(item=>item.group==="Textures")) {
        const units=uniform.size===1?[uniform.value]:uniform.value;
        for(const [arrayIndex,unit] of units.entries()) {
          gl.activeTexture(gl.TEXTURE0+unit);
          const texture=gl.getParameter(gl.TEXTURE_BINDING_2D);
          const info=texture?gpu.DebugTextureInfo(raster,texture):null;
          textures.push({uniform:uniform.name,arrayIndex,unit,sampler:uniform.type,...info,
            name:info?.name??(texture?"Texture 2D":"Unbound"),_handle:texture});
        }
      }
    } finally {gl.activeTexture(active);}
    const buffers=[];
    for(let i=0;i<gl.getProgramParameter(handle,gl.ACTIVE_ATTRIBUTES);i++) {
      const info=gl.getActiveAttrib(handle,i),location=gl.getAttribLocation(handle,info.name);
      if(location<0||!gl.getVertexAttrib(location,gl.VERTEX_ATTRIB_ARRAY_ENABLED)) continue;
      buffers.push({name:info.name,location,size:gl.getVertexAttrib(location,gl.VERTEX_ATTRIB_ARRAY_SIZE),
        type:EnumName(gl,gl.getVertexAttrib(location,gl.VERTEX_ATTRIB_ARRAY_TYPE)),
        stride:gl.getVertexAttrib(location,gl.VERTEX_ATTRIB_ARRAY_STRIDE),
        offset:gl.getVertexAttribOffset(location,gl.VERTEX_ATTRIB_ARRAY_POINTER)});
    }
    return {programId:this.programIds.get(handle),shaderName,uniforms:program.uniforms,blocks:program.blocks,textures,buffers};
  }

  CopyGeometry(geometry) {
    if(!geometry||!geometry.data) return geometry; // Resident batches are immutable within the preview renderer.
    if(!geometry.immutable) {
      this.capture.bytes+=geometry.data.byteLength;
      return {...geometry,data:geometry.data.slice()};
    }
    return geometry;
  }

  SaveImage(store,key,metadata,Read) {
    if(this.previewBytes>=GPU_PREVIEW_BYTES) {metadata.previewError="快照已达容量上限";return;}
    try {
      const image=Read();
      if(metadata.scalar) {
        const values=new Float32Array(image.width*image.height);
        for(let i=0;i<values.length;i++) values[i]=image.pixels[i*4];
        image.pixels=values;
      }
      const bytes=image.pixels.byteLength;
      if(this.previewBytes+bytes>GPU_PREVIEW_BYTES) {metadata.previewError="快照已达容量上限";return;}
      store.set(key,image);this.previewBytes+=bytes;this.capture.bytes+=bytes;
      metadata.previewSize=[image.width,image.height];
    } catch(error) {metadata.previewError=String(error.message||error);}
  }

  CanvasEvent(label,canvas,cpuMs) {
    const start=performance.now(),target=canvas===this.canvas?"Viewport Canvas":"Background Canvas";
    const width=canvas.width,height=canvas.height,scale=Math.min(1,MAX_PREVIEW_EDGE/Math.max(width,height));
    const attachment={name:"Color",format:"RGBA8",width,height};
    const index=this.AddEvent({kind:"Canvas2D",label,phase:label==="绘制天空"?"天空":"Canvas2D",api:"Canvas2D",args:[],draw:false,cpuMs,target,targetSize:[width,height],
      _target:{name:target,width,height,attachments:[attachment]}});
    this.SaveImage(this.images,`${index}:0`,attachment,()=>{
      const image=document.createElement("canvas");
      image.width=Math.max(1,Math.round(width*scale));image.height=Math.max(1,Math.round(height*scale));
      const context=image.getContext("2d",{willReadFrequently:true});
      context.drawImage(canvas,0,0,image.width,image.height);
      return {width:image.width,height:image.height,pixels:context.getImageData(0,0,image.width,image.height).data};
    });
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
      for(const {gl,query,index,pass,viewport} of this.queries) {
        const ms=gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6;
        this._events[index].gpuMs=ms;this.capture.gpuMs+=ms;
        this.capture.passes[pass].gpuMs=(this.capture.passes[pass].gpuMs??0)+ms;
        this.capture.passes[viewport].gpuMs=(this.capture.passes[viewport].gpuMs??0)+ms;
      }
    }
    this.ReleaseQueries();
    this.capture.gpuStatus=invalid?"disjoint":timeout?"timeout":"ready";this.revision++;
  }

  ReleaseQueries() {
    for(const {gl,query} of this.queries) gl.deleteQuery(query);
    this.queries=[];this.timers.clear();
  }

  Preview(index,attachment,options) {
    return DisplayImage(this.images.get(`${index}:${attachment}`),options,this._events[index]?._target.attachments[attachment]?.scalar);
  }

  TexturePreview(index,binding,options) {
    return DisplayImage(this.textureImages.get(`${index}:${binding}`),options,this._events[index]?.textures?.[binding]?.scalar);
  }

  Inspect() {
    return this.capture?{state:this.state,selected:this.selected,...this.capture,
      events:this._events.map(({_target,_geometry,textures,...event})=>({...event,attachments:_target.attachments,
        mesh:_geometry?.name,textures}))}:{state:this.state,error:this.error};
  }

  Resume() {
    this.ReleaseQueries();this.images.clear();this.textureImages.clear();this.programIds?.clear();
    this._events=[];this.capture=null;this.pass=null;this.phase=null;this.canvas=null;this.lastOutput=null;
    this.state="idle";this.selected=-1;this.error="";this.revision++;
  }
}
