// One offscreen context for all preview panes. Only triangle filling moves to
// the GPU; the editor keeps its CPU depth buffer for picking and actor strokes.
// No game renderer, scene assets or terrain sampling rules are changed here.
let shared;
let unavailable=false;

export function EncounterGpuRaster() {
  if(unavailable) return null;
  if(shared&&!shared.gl.isContextLost()) return shared;
  try {
    shared=new GpuRaster();
    return shared;
  } catch {
    unavailable=true;
    return null;
  }
}

class GpuRaster {
  constructor() {
    this.canvas=document.createElement('canvas');
    const gl=this.canvas.getContext('webgl2',{antialias:false,alpha:true,depth:false,preserveDrawingBuffer:false});
    if(!gl||!gl.getExtension('EXT_color_buffer_float')) throw new Error('Float raster unavailable');
    this.gl=gl;
    const Shader=(type,source)=>{
      const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    const vertex=Shader(gl.VERTEX_SHADER,`#version 300 es
      precision highp float;
      layout(location=0) in vec3 position;
      layout(location=1) in vec3 color;
      uniform vec2 size;
      uniform bool perspective;
      uniform bool world;
      uniform vec3 eye;
      uniform vec3 right;
      uniform vec3 up;
      uniform vec3 forward;
      uniform vec4 projection;
      out vec3 rgb;
      out float distanceToCamera;
      void main() {
        vec3 point=position;
        vec4 clip=vec4(0.0);
        if(world) {
          vec3 relative=position-eye;
          vec3 camera=vec3(dot(relative,right),dot(relative,up),dot(relative,forward));
          float w=perspective?camera.z:1.0;
          point.z=camera.z;
          float near=projection.z,far=projection.w;
          float clipZ=perspective?((far+near)*camera.z-2.0*far*near)/(far-near):(camera.z-near)*2.0/(far-near)-1.0;
          clip=vec4(2.0*camera.x*projection.x/size.x,(projection.y*2.0-1.0)*w-2.0*camera.y*projection.x/size.y,clipZ,w);
        }
        float w=perspective?point.z:1.0;
        // Readback row zero is also Canvas row zero, so no full-frame Y flip.
        gl_Position=world?clip:vec4((point.xy/size*2.0-1.0)*w,0.0,w);
        rgb=color/255.0;
        distanceToCamera=point.z;
      }`);
    const fragment=Shader(gl.FRAGMENT_SHADER,`#version 300 es
      precision highp float;
      in vec3 rgb;
      in float distanceToCamera;
      layout(location=0) out vec4 pixel;
      layout(location=1) out float distancePixel;
      void main() {
        pixel=vec4(rgb,1.0);
        distancePixel=distanceToCamera;
        gl_FragDepth=distanceToCamera/16384.0;
      }`);
    this.program=gl.createProgram();gl.attachShader(this.program,vertex);gl.attachShader(this.program,fragment);gl.linkProgram(this.program);
    gl.deleteShader(vertex);gl.deleteShader(fragment);
    if(!gl.getProgramParameter(this.program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
    this.size=gl.getUniformLocation(this.program,'size');this.perspective=gl.getUniformLocation(this.program,'perspective');
    this.world=gl.getUniformLocation(this.program,'world');
    this.cameraUniforms=Object.fromEntries(['eye','right','up','forward','projection'].map(name=>[name,gl.getUniformLocation(this.program,name)]));
    this.buffer=gl.createBuffer();this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
    for(let index=0;index<2;index++) {gl.enableVertexAttribArray(index);gl.vertexAttribPointer(index,3,gl.FLOAT,false,24,index*12);}
    this.targets=new Map();
  }

  Resize(width,height) {
    const gl=this.gl,key=`${width}x${height}`;
    if(this.canvas.width<width||this.canvas.height<height) {this.canvas.width=Math.max(width,this.canvas.width);this.canvas.height=Math.max(height,this.canvas.height);}
    if(this.targets.has(key)) {
      const target=this.targets.get(key);this.targets.delete(key);this.targets.set(key,target);
      this.framebuffer=target.framebuffer;return;
    }
    // Reuse the different sizes of the four panes instead of reallocating GPU
    // attachments when switching from the left pane to the right pane.
    while(this.targets.size>=4) {
      const [oldKey,target]=this.targets.entries().next().value;
      gl.deleteFramebuffer(target.framebuffer);gl.deleteTexture(target.color);gl.deleteTexture(target.distance);gl.deleteRenderbuffer(target.depth);this.targets.delete(oldKey);
    }
    const target={framebuffer:gl.createFramebuffer(),color:gl.createTexture(),distance:gl.createTexture(),depth:gl.createRenderbuffer()};
    this.targets.set(key,target);this.framebuffer=target.framebuffer;
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.framebuffer);
    for(const [texture,attachment,format,type,internal] of [
      [target.color,gl.COLOR_ATTACHMENT0,gl.RGBA,gl.UNSIGNED_BYTE,gl.RGBA8],
      [target.distance,gl.COLOR_ATTACHMENT1,gl.RED,gl.FLOAT,gl.R32F],
    ]) {
      gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texImage2D(gl.TEXTURE_2D,0,internal,width,height,0,format,type,null);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,attachment,gl.TEXTURE_2D,texture,0);
    }
    gl.bindRenderbuffer(gl.RENDERBUFFER,target.depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT32F,width,height);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,target.depth);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) throw new Error('Incomplete raster framebuffer');
  }

  Draw(raster) {
    const gl=this.gl;if(gl.isContextLost()) return false;
    try {this.Resize(raster.width,raster.height);} catch {unavailable=true;return false;}
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.framebuffer);gl.viewport(0,0,raster.width,raster.height);
    gl.disable(gl.BLEND);gl.disable(gl.DITHER);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LESS);
    gl.clearBufferfv(gl.COLOR,0,new Float32Array(4));gl.clearBufferfv(gl.COLOR,1,new Float32Array([Infinity,0,0,0]));
    gl.clearBufferfv(gl.DEPTH,0,new Float32Array([1]));
    gl.useProgram(this.program);gl.uniform2f(this.size,raster.width,raster.height);gl.uniform1i(this.perspective,raster.perspective?1:0);
    gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
    if(raster.worldLength) {
      const view=raster.view;
      for(const name of ['eye','right','up','forward']) gl.uniform3fv(this.cameraUniforms[name],view[name]);
      gl.uniform4f(this.cameraUniforms.projection,(raster.perspective?view.focal:view.scale)*raster.coordinateScale,raster.perspective?0.49:0.57,0.15,view.far);
      gl.uniform1i(this.world,1);
      gl.bufferData(gl.ARRAY_BUFFER,raster.worldVertices.subarray(0,raster.worldLength),gl.STREAM_DRAW);
      gl.drawArrays(gl.TRIANGLES,0,raster.worldLength/6);
    }
    gl.uniform1i(this.world,0);
    gl.bufferData(gl.ARRAY_BUFFER,raster.gpuVertices.subarray(0,raster.gpuLength),gl.STREAM_DRAW);
    gl.drawArrays(gl.TRIANGLES,0,raster.gpuLength/6);
    gl.readBuffer(gl.COLOR_ATTACHMENT1);gl.readPixels(0,0,raster.width,raster.height,gl.RED,gl.FLOAT,raster.depth);
    // Keep color on the GPU. Only depth is read back for editor interactions.
    gl.readBuffer(gl.COLOR_ATTACHMENT0);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,null);
    gl.blitFramebuffer(0,0,raster.width,raster.height,0,this.canvas.height,raster.width,this.canvas.height-raster.height,gl.COLOR_BUFFER_BIT,gl.NEAREST);
    return !gl.isContextLost()&&gl.getError()===gl.NO_ERROR;
  }
}
