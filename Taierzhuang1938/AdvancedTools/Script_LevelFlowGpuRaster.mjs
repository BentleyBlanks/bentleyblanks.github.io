import { FLOW_RENDERING } from "../Data_Tuning_LevelFlow.mjs";

// One offscreen context for all panes. Depth readback remains unfiltered for
// picking and actor strokes. Lighting only changes the displayed color.
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
      layout(location=2) in vec3 normal;
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
      out vec3 worldPosition;
      out vec3 worldNormal;
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
        vec2 screen=position.xy/size;
        float cameraScale=perspective?position.z:1.0;
        vec2 cameraXY=vec2((screen.x-0.5)*size.x,(projection.y-screen.y)*size.y)/projection.x*cameraScale;
        worldPosition=world?position:eye+right*cameraXY.x+up*cameraXY.y+forward*position.z;
        worldNormal=world?normal:vec3(0.0);
      }`);
    const fragment=Shader(gl.FRAGMENT_SHADER,`#version 300 es
      precision highp float;
      in vec3 rgb;
      in float distanceToCamera;
      in vec3 worldPosition;
      in vec3 worldNormal;
      uniform bool lit;
      uniform sampler2D shadowMap;
      uniform vec3 shadowCenter;
      uniform vec3 shadowRight;
      uniform vec3 shadowUp;
      uniform vec3 sun;
      uniform vec3 eye;
      uniform vec3 right,up,forward;
      uniform vec2 lightBalance;
      uniform vec4 shadowSettings;
      layout(location=0) out vec4 pixel;
      layout(location=1) out float distancePixel;
      layout(location=2) out vec4 normalPixel;
      void main() {
        float visibility=1.0;
        normalPixel=vec4(0.0);
        if(lit) {
          vec3 normal=normalize(cross(dFdx(worldPosition),dFdy(worldPosition)));
          if(dot(normal,eye-worldPosition)<0.0) normal=-normal;
          bool smoothTerrain=dot(worldNormal,worldNormal)>0.01;
          vec3 shadingNormal=smoothTerrain?normalize(worldNormal):normal;
          normalPixel=vec4(dot(shadingNormal,right),dot(shadingNormal,up),dot(shadingNormal,forward),smoothTerrain?1.0:0.0);
          // Offset smooth receivers away from their own tessellated surface.
          float normalBias=smoothTerrain?shadowSettings.z*shadowSettings.y*2.0:0.0;
          vec3 relative=worldPosition+shadingNormal*normalBias-shadowCenter;
          vec3 shadow=vec3(dot(relative,shadowRight)/shadowSettings.x,dot(relative,shadowUp)/shadowSettings.x,-dot(relative,sun)/shadowSettings.y)*0.5+0.5;
          vec3 shadowDx=dFdx(shadow),shadowDy=dFdy(shadow);
          float determinant=shadowDx.x*shadowDy.y-shadowDx.y*shadowDy.x;
          vec2 depthGradient=abs(determinant)>1e-10
            ?vec2(shadowDy.y*shadowDx.z-shadowDx.y*shadowDy.z,shadowDx.x*shadowDy.z-shadowDy.x*shadowDx.z)/determinant:vec2(0.0);
          float cosine=abs(dot(normal,sun));
          float slope=sqrt(max(0.0,1.0-cosine*cosine))/max(0.1,cosine);
          vec2 texel=1.0/vec2(textureSize(shadowMap,0));
          float bias=shadowSettings.z+slope*texel.x*shadowSettings.x/shadowSettings.y*1.5;
          if(all(greaterThan(shadow,vec3(0.0)))&&all(lessThan(shadow,vec3(1.0)))) {
            float blocked=0.0;
            for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++) {
              vec2 offset=vec2(x,y)*texel;
              float depth=texture(shadowMap,shadow.xy+offset).r;
              blocked+=shadow.z+dot(depthGradient,offset)-bias>depth?1.0:0.0;
            }
            float direct=lightBalance.y*max(dot(shadingNormal,sun),0.0);
            visibility-=shadowSettings.w*blocked/9.0*direct/(lightBalance.x+direct);
          }
        }
        pixel=vec4(rgb*visibility,1.0);
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
    for(let index=0;index<3;index++) {gl.enableVertexAttribArray(index);gl.vertexAttribPointer(index,3,gl.FLOAT,false,36,index*12);}
    this.screenVao=gl.createVertexArray();gl.bindVertexArray(this.screenVao);
    gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
    for(let index=0;index<2;index++) {gl.enableVertexAttribArray(index);gl.vertexAttribPointer(index,3,gl.FLOAT,false,24,index*12);}
    this.targets=new Map();
    const Program=(vertexSource,fragmentSource)=>{
      const program=gl.createProgram(),v=Shader(gl.VERTEX_SHADER,vertexSource),f=Shader(gl.FRAGMENT_SHADER,fragmentSource);
      gl.attachShader(program,v);gl.attachShader(program,f);gl.linkProgram(program);gl.deleteShader(v);gl.deleteShader(f);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      return program;
    };
    this.lightingUniforms=Object.fromEntries(['lit','shadowMap','shadowCenter','shadowRight','shadowUp','sun','shadowSettings','lightBalance'].map(name=>[name,gl.getUniformLocation(this.program,name)]));
    this.shadowProgram=Program(`#version 300 es
      precision highp float;
      layout(location=0) in vec3 position;
      uniform vec3 shadowCenter,shadowRight,shadowUp,sun;
      uniform vec4 shadowSettings;
      void main() {
        vec3 p=position-shadowCenter;
        gl_Position=vec4(dot(p,shadowRight)/shadowSettings.x,dot(p,shadowUp)/shadowSettings.x,-dot(p,sun)/shadowSettings.y,1.0);
      }`, `#version 300 es
      precision highp float;
      void main() {}`);
    this.shadowUniforms=Object.fromEntries(['shadowCenter','shadowRight','shadowUp','sun','shadowSettings'].map(name=>[name,gl.getUniformLocation(this.shadowProgram,name)]));
    this.aoProgram=Program(`#version 300 es
      void main() {
        vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);
        gl_Position=vec4(p*2.0-1.0,0.0,1.0);
      }`, `#version 300 es
      precision highp float;
      uniform sampler2D sceneColor,sceneDepth,sceneNormal;
      uniform vec2 size;
      uniform vec4 projection,aoSettings;
      uniform vec2 terrainAo;
      uniform float minLight;
      uniform bool perspective;
      out vec4 pixel;
      vec3 Position(vec2 p) {
        ivec2 at=clamp(ivec2(p),ivec2(0),ivec2(size)-1);
        float z=min(texelFetch(sceneDepth,at,0).r,projection.w);
        vec2 xy=vec2(p.x-size.x*0.5,size.y*projection.y-p.y)/projection.x;
        return vec3(xy*(perspective?z:1.0),z);
      }
      void main() {
        ivec2 at=ivec2(gl_FragCoord.xy);
        pixel=texelFetch(sceneColor,at,0);
        if(pixel.a==0.0) return;
        vec2 p=gl_FragCoord.xy;
        vec3 center=Position(p);
        // Terrain supplies interpolated height-field normals. A depth derivative
        // would expose every fan triangle again along the bank and its foot.
        vec4 surfaceNormal=texelFetch(sceneNormal,at,0);
        vec3 normal=normalize(surfaceNormal.xyz);
        float horizonBias=mix(0.08,terrainAo.y,surfaceNormal.w);
        vec3 left=center-Position(p-vec2(1,0)),right=Position(p+vec2(1,0))-center;
        vec3 top=center-Position(p-vec2(0,1)),bottom=Position(p+vec2(0,1))-center;
        vec3 dx=abs(left.z)<abs(right.z)?left:right,dy=abs(top.z)<abs(bottom.z)?top:bottom;
        vec3 geometricNormal=normalize(cross(dx,dy));
        if(dot(geometricNormal,center)>0.0) geometricNormal=-geometricNormal;
        float radius=clamp(aoSettings.x*projection.x/(perspective?max(center.z,0.15):1.0),2.0,aoSettings.z);
        float occlusion=0.0;
        for(int direction=0;direction<8;direction++) {
          float angle=float(direction)*0.785398163;
          vec2 ray=vec2(cos(angle),sin(angle));
          for(int step=1;step<=2;step++) {
            vec2 sampleAt=p+ray*radius*(float(step)*0.45);
            if(any(lessThan(sampleAt,vec2(0.5)))||any(greaterThanEqual(sampleAt,size-0.5))) continue;
            if(texelFetch(sceneColor,ivec2(sampleAt),0).a==0.0) continue;
            vec3 delta=Position(sampleAt)-center;
            float distance=length(delta);
            if(distance<0.015||distance>aoSettings.x) continue;
            float horizon=max(0.0,min(dot(normal,delta/distance),dot(geometricNormal,delta/distance))-horizonBias);
            occlusion+=horizon*(1.0-distance/aoSettings.x);
          }
        }
        pixel.rgb*=max(minLight,1.0-occlusion*aoSettings.y*mix(1.0,terrainAo.x,surfaceNormal.w)/16.0);
      }`);
    this.aoUniforms=Object.fromEntries(['sceneColor','sceneDepth','sceneNormal','size','projection','aoSettings','terrainAo','minLight','perspective'].map(name=>[name,gl.getUniformLocation(this.aoProgram,name)]));
    this.shadowBuffer=gl.createBuffer();this.shadowVao=gl.createVertexArray();
    gl.bindVertexArray(this.shadowVao);gl.bindBuffer(gl.ARRAY_BUFFER,this.shadowBuffer);
    gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,12,0);
    this.fullscreenVao=gl.createVertexArray();
    const settings=FLOW_RENDERING.lighting;
    this.shadowTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.shadowTexture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,settings.shadowMapSize,settings.shadowMapSize,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);
    this.shadowFramebuffer=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,this.shadowFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,this.shadowTexture,0);
    gl.drawBuffers([gl.NONE]);gl.readBuffer(gl.NONE);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) throw new Error('Incomplete shadow framebuffer');
  }

  Resize(width,height) {
    const gl=this.gl,key=`${width}x${height}`;
    if(this.canvas.width<width||this.canvas.height<height) {this.canvas.width=Math.max(width,this.canvas.width);this.canvas.height=Math.max(height,this.canvas.height);}
    if(this.targets.has(key)) {
      const target=this.targets.get(key);this.targets.delete(key);this.targets.set(key,target);
      this.target=target;this.framebuffer=target.framebuffer;return;
    }
    // Reuse the different sizes of the four panes instead of reallocating GPU
    // attachments when switching from the left pane to the right pane.
    while(this.targets.size>=4) {
      const [oldKey,target]=this.targets.entries().next().value;
      gl.deleteFramebuffer(target.framebuffer);gl.deleteFramebuffer(target.shadedFramebuffer);gl.deleteTexture(target.shadedColor);gl.deleteTexture(target.color);gl.deleteTexture(target.distance);gl.deleteTexture(target.normal);gl.deleteRenderbuffer(target.depth);this.targets.delete(oldKey);
    }
    const target={framebuffer:gl.createFramebuffer(),color:gl.createTexture(),distance:gl.createTexture(),normal:gl.createTexture(),depth:gl.createRenderbuffer()};
    this.targets.set(key,target);this.target=target;this.framebuffer=target.framebuffer;
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.framebuffer);
    for(const [texture,attachment,format,type,internal] of [
      [target.color,gl.COLOR_ATTACHMENT0,gl.RGBA,gl.UNSIGNED_BYTE,gl.RGBA8],
      [target.distance,gl.COLOR_ATTACHMENT1,gl.RED,gl.FLOAT,gl.R32F],
      [target.normal,gl.COLOR_ATTACHMENT2,gl.RGBA,gl.HALF_FLOAT,gl.RGBA16F],
    ]) {
      gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texImage2D(gl.TEXTURE_2D,0,internal,width,height,0,format,type,null);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,attachment,gl.TEXTURE_2D,texture,0);
    }
    gl.bindRenderbuffer(gl.RENDERBUFFER,target.depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT32F,width,height);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,target.depth);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1,gl.COLOR_ATTACHMENT2]);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) throw new Error('Incomplete raster framebuffer');
    target.shadedFramebuffer=gl.createFramebuffer();target.shadedColor=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,target.shadedColor);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    gl.bindFramebuffer(gl.FRAMEBUFFER,target.shadedFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,target.shadedColor,0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) throw new Error('Incomplete AO framebuffer');
  }

  DrawShadows(raster) {
    const gl=this.gl,view=raster.view,settings=view.lighting;
    const sun=FLOW_RENDERING.sky.sunDirection.map(value=>value/Math.hypot(...FLOW_RENDERING.sky.sunDirection));
    const horizontal=Math.hypot(sun[0],sun[2]),right=[sun[2]/horizontal,0,-sun[0]/horizontal];
    const up=[sun[1]*right[2],sun[2]*right[0]-sun[0]*right[2],-sun[1]*right[0]];
    const orthographic=!raster.perspective;
    const distance=Math.min(180,Math.max(20,(view.eye[1]-view.Ground([view.eye[0],view.eye[2]]))/Math.max(0.15,-view.forward[1])));
    const center=orthographic?view.aim:view.eye.map((value,axis)=>value+view.forward[axis]*distance);
    const radius=Math.min(settings.shadowMaxRadiusM,Math.max(settings.shadowMinRadiusM,orthographic?Math.max(view.width,view.height)/view.scale*0.65:distance*1.5));
    const values={shadowCenter:center,shadowRight:right,shadowUp:up,sun,shadowSettings:[radius,settings.shadowDepthM,settings.shadowBiasM/settings.shadowDepthM/2,settings.shadowStrength]};
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,null);
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.shadowFramebuffer);gl.viewport(0,0,settings.shadowMapSize,settings.shadowMapSize);
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LESS);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);
    gl.clearBufferfv(gl.DEPTH,0,new Float32Array([1]));gl.useProgram(this.shadowProgram);
    for(const [name,value] of Object.entries(values)) {
      if(value.length===4) gl.uniform4fv(this.shadowUniforms[name],value);else gl.uniform3fv(this.shadowUniforms[name],value);
    }
    gl.bindVertexArray(this.shadowVao);gl.bindBuffer(gl.ARRAY_BUFFER,this.shadowBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,raster.shadowVertices,gl.STREAM_DRAW);gl.drawArrays(gl.TRIANGLES,0,raster.shadowVertices.length/3);
    // Visible terrain, vehicles and carried objects also cast shadows.
    gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER,raster.worldVertices.subarray(0,raster.worldLength),gl.STREAM_DRAW);gl.drawArrays(gl.TRIANGLES,0,raster.worldLength/9);
    return values;
  }

  DrawAmbientOcclusion(raster) {
    const gl=this.gl,view=raster.view,settings=view.lighting;
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.target.shadedFramebuffer);gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.aoProgram);gl.bindVertexArray(this.fullscreenVao);
    for(const [unit,name,texture] of [[0,'sceneColor',this.target.color],[1,'sceneDepth',this.target.distance],[2,'sceneNormal',this.target.normal]]) {
      gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(this.aoUniforms[name],unit);
    }
    gl.uniform2f(this.aoUniforms.size,raster.width,raster.height);
    gl.uniform4f(this.aoUniforms.projection,(raster.perspective?view.focal:view.scale)*raster.coordinateScale,raster.perspective?0.49:0.57,0.15,view.far);
    gl.uniform4f(this.aoUniforms.aoSettings,settings.aoRadiusM,settings.aoStrength,settings.aoMaxPixels,0);
    gl.uniform2f(this.aoUniforms.terrainAo,settings.aoTerrainScale??FLOW_RENDERING.lighting.aoTerrainScale,
      settings.aoTerrainBias??FLOW_RENDERING.lighting.aoTerrainBias);
    gl.uniform1f(this.aoUniforms.minLight,settings.aoMinLight);gl.uniform1i(this.aoUniforms.perspective,raster.perspective?1:0);
    gl.drawArrays(gl.TRIANGLES,0,3);
    gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,null);
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,null);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,null);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER,this.target.shadedFramebuffer);
  }

  Draw(raster) {
    const gl=this.gl;if(gl.isContextLost()) return false;
    try {this.Resize(raster.width,raster.height);} catch {unavailable=true;return false;}
    const lighting=raster.view?.lighting&&raster.shadowVertices;
    const shadowValues=lighting?this.DrawShadows(raster):null;
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.framebuffer);gl.viewport(0,0,raster.width,raster.height);
    gl.disable(gl.BLEND);gl.disable(gl.DITHER);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LESS);
    gl.clearBufferfv(gl.COLOR,0,new Float32Array(4));gl.clearBufferfv(gl.COLOR,1,new Float32Array([Infinity,0,0,0]));
    gl.clearBufferfv(gl.COLOR,2,new Float32Array(4));
    gl.clearBufferfv(gl.DEPTH,0,new Float32Array([1]));
    gl.useProgram(this.program);gl.uniform2f(this.size,raster.width,raster.height);gl.uniform1i(this.perspective,raster.perspective?1:0);
    gl.uniform1i(this.lightingUniforms.lit,lighting?1:0);
    if(lighting) {
      gl.uniform2f(this.lightingUniforms.lightBalance,raster.view.lighting.ambient,raster.view.lighting.direct);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.shadowTexture);gl.uniform1i(this.lightingUniforms.shadowMap,0);
      for(const [name,value] of Object.entries(shadowValues)) {
        if(value.length===4) gl.uniform4fv(this.lightingUniforms[name],value);else gl.uniform3fv(this.lightingUniforms[name],value);
      }
    }
    gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
    if(raster.view) {
      const view=raster.view;
      for(const name of ['eye','right','up','forward']) gl.uniform3fv(this.cameraUniforms[name],view[name]);
      gl.uniform4f(this.cameraUniforms.projection,(raster.perspective?view.focal:view.scale)*raster.coordinateScale,raster.perspective?0.49:0.57,0.15,view.far);
    }
    if(raster.worldLength) {
      gl.uniform1i(this.world,1);
      gl.bufferData(gl.ARRAY_BUFFER,raster.worldVertices.subarray(0,raster.worldLength),gl.STREAM_DRAW);
      gl.drawArrays(gl.TRIANGLES,0,raster.worldLength/9);
    }
    gl.uniform1i(this.world,0);
    gl.bindVertexArray(this.screenVao);
    gl.bufferData(gl.ARRAY_BUFFER,raster.gpuVertices.subarray(0,raster.gpuLength),gl.STREAM_DRAW);
    gl.drawArrays(gl.TRIANGLES,0,raster.gpuLength/6);
    gl.readBuffer(gl.COLOR_ATTACHMENT1);gl.readPixels(0,0,raster.width,raster.height,gl.RED,gl.FLOAT,raster.depth);
    // Keep color on the GPU. Only depth is read back for editor interactions.
    if(lighting) this.DrawAmbientOcclusion(raster);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,null);
    gl.blitFramebuffer(0,0,raster.width,raster.height,0,this.canvas.height,raster.width,this.canvas.height-raster.height,gl.COLOR_BUFFER_BIT,gl.NEAREST);
    return !gl.isContextLost()&&gl.getError()===gl.NO_ERROR;
  }
}
