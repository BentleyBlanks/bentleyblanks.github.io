import { FLOW_RENDERING } from "../Data_Tuning_LevelFlow.mjs";

// One offscreen context for all panes. Depth readback remains unfiltered for
// picking and actor strokes. Lighting only changes the displayed color.
const Dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
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
      uniform highp sampler2DShadow shadowMap;
      uniform vec3 shadowCenter;
      uniform vec3 shadowRight;
      uniform vec3 shadowUp;
      uniform vec3 sun;
      uniform vec3 eye;
      uniform vec3 right,up,forward;
      uniform vec2 lightBalance;
      uniform vec4 shadowSettings;
      uniform bool terrainSurface;
      uniform sampler2D groundColor,distantColor;
      uniform vec4 groundBounds,distantBounds;
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
            // Each tap is a hardware bilinear depth comparison, so the 3x3 kernel
            // blends 16 texels with smooth weights instead of nine hard steps.
            float lit=0.0;
            for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++) {
              vec2 offset=vec2(x,y)*texel;
              lit+=texture(shadowMap,vec3(shadow.xy+offset,clamp(shadow.z+dot(depthGradient,offset)-bias,0.0,1.0)));
            }
            float direct=lightBalance.y*max(dot(shadingNormal,sun),0.0);
            visibility-=shadowSettings.w*(1.0-lit/9.0)*direct/(lightBalance.x+direct);
          }
        }
        vec3 surface=rgb;
        if(terrainSurface&&dot(worldNormal,worldNormal)>0.01) {
          surface=vec3(198.0,207.0,169.0)/255.0;
          vec2 distantUv=(worldPosition.xz-distantBounds.xy)/distantBounds.zw;
          if(all(greaterThanEqual(distantUv,vec2(0.0)))&&all(lessThanEqual(distantUv,vec2(1.0)))) {
            vec4 paint=texture(distantColor,distantUv);
            surface=mix(surface,paint.rgb,paint.a);
          }
          vec2 groundSize=vec2(textureSize(groundColor,0));
          vec2 groundUv=(worldPosition.xz-groundBounds.xy)/groundBounds.zw;
          if(all(greaterThanEqual(groundUv,vec2(0.0)))&&all(lessThanEqual(groundUv,vec2(1.0)))) {
            surface=texture(groundColor,(groundUv*(groundSize-1.0)+0.5)/groundSize).rgb;
          }
          float diffuse=max(0.0,dot(normalize(worldNormal),sun));
          surface*=lightBalance.x+lightBalance.y*diffuse;
        }
        pixel=vec4(surface*visibility,1.0);
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
    this.surfaceUniforms=Object.fromEntries(['terrainSurface','groundColor','distantColor','groundBounds','distantBounds'].map(name=>[name,gl.getUniformLocation(this.program,name)]));
    this.surfaceTextures=new Map();
    this.residentOwners=new Map();
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
    const fullscreenVertex=`#version 300 es
      void main() {
        vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);
        gl_Position=vec4(p*2.0-1.0,0.0,1.0);
      }`;
    // Pass 1 writes the raw ambient light factor (1 = open, aoMinLight = fully
    // occluded) into its own target. Every pixel of a 4x4 block uses a different
    // ray rotation and step offset, so the 8x4 taps cover 16 times more ray
    // directions than they would with a fixed pattern. Fixed taps put every
    // wall edge on two or three discrete rings, which showed up as layered
    // ghost copies of the edge. Pass 2 (aoResolveProgram) averages the 4x4 block.
    this.aoProgram=Program(fullscreenVertex, `#version 300 es
      precision highp float;
      uniform sampler2D sceneColor,sceneDepth,sceneNormal;
      uniform vec2 size,aoSize;
      uniform vec4 projection,aoSettings;
      uniform vec2 terrainAo;
      uniform float minLight;
      uniform bool perspective;
      out vec4 pixel;
      const int bayer[16]=int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5);
      vec3 Position(vec2 p) {
        ivec2 at=clamp(ivec2(p),ivec2(0),ivec2(size)-1);
        float z=min(texelFetch(sceneDepth,at,0).r,projection.w);
        vec2 xy=vec2(p.x-size.x*0.5,size.y*projection.y-p.y)/projection.x;
        return vec3(xy*(perspective?z:1.0),z);
      }
      void main() {
        vec2 p=gl_FragCoord.xy*size/aoSize;
        ivec2 at=clamp(ivec2(p),ivec2(0),ivec2(size)-1);
        pixel=vec4(1.0);
        if(texelFetch(sceneColor,at,0).a==0.0) return;
        ivec2 phaseAt=ivec2(gl_FragCoord.xy);
        int phase=bayer[(phaseAt.x&3)+((phaseAt.y&3)<<2)];
        float turn=float(phase)/16.0*0.785398163;
        float jitter=float((phase*7)&15)/16.0;
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
        float radius=clamp(aoSettings.x*projection.x/(perspective?max(center.z,projection.z):1.0),2.0,aoSettings.z);
        float occlusion=0.0;
        for(int direction=0;direction<8;direction++) {
          float angle=float(direction)*0.785398163+turn;
          vec2 ray=vec2(cos(angle),sin(angle));
          for(int step=0;step<4;step++) {
            vec2 sampleAt=p+ray*(1.5+(radius-1.5)*(float(step)+jitter)*0.25);
            if(any(lessThan(sampleAt,vec2(0.5)))||any(greaterThanEqual(sampleAt,size-0.5))) continue;
            if(texelFetch(sceneColor,ivec2(sampleAt),0).a==0.0) continue;
            vec3 delta=Position(sampleAt)-center;
            float distance=length(delta);
            if(distance<0.015||distance>aoSettings.x) continue;
            float horizon=max(0.0,min(dot(normal,delta/distance),dot(geometricNormal,delta/distance))-horizonBias);
            occlusion+=horizon*(1.0-distance/aoSettings.x);
          }
        }
        pixel=vec4(vec3(max(minLight,1.0-occlusion*aoSettings.y*mix(1.0,terrainAo.x,surfaceNormal.w)/32.0)),1.0);
      }`);
    this.aoUniforms=Object.fromEntries(['sceneColor','sceneDepth','sceneNormal','size','aoSize','projection','aoSettings','terrainAo','minLight','perspective'].map(name=>[name,gl.getUniformLocation(this.aoProgram,name)]));
    this.aoResolveProgram=Program(fullscreenVertex, `#version 300 es
      precision highp float;
      uniform sampler2D sceneColor,sceneDepth,aoMap;
      uniform vec2 size;
      uniform float farDepth;
      uniform vec3 hazeSettings,hazeColor;
      out vec4 pixel;
      void main() {
        ivec2 at=ivec2(gl_FragCoord.xy);
        pixel=texelFetch(sceneColor,at,0);
        if(pixel.a==0.0) return;
        float z=min(texelFetch(sceneDepth,at,0).r,farDepth);
        // Depth-aware 4x4 average over exactly one dither period. Neighbours
        // across a wall edge are far away in depth and drop out, so the
        // shadow does not bleed onto the other surface.
        float tolerance=0.03*z+0.12,sum=0.0,total=0.0;
        ivec2 aoSize=textureSize(aoMap,0);
        vec2 aoScale=vec2(aoSize)/size;
        ivec2 aoAt=ivec2(gl_FragCoord.xy*aoScale);
        for(int y=-2;y<2;y++) for(int x=-2;x<2;x++) {
          ivec2 q=clamp(aoAt+ivec2(x,y),ivec2(0),aoSize-1);
          ivec2 sceneAt=clamp(ivec2((vec2(q)+0.5)/aoScale),ivec2(0),ivec2(size)-1);
          if(texelFetch(sceneColor,sceneAt,0).a==0.0) continue;
          float weight=max(0.0,1.0-abs(min(texelFetch(sceneDepth,sceneAt,0).r,farDepth)-z)/tolerance);
          sum+=weight*texelFetch(aoMap,q,0).r;total+=weight;
        }
        pixel.rgb*=total>0.0?sum/total:1.0;
        float haze=smoothstep(hazeSettings.x,hazeSettings.y,z)*hazeSettings.z;
        pixel.rgb=mix(pixel.rgb,hazeColor,haze);
      }`);
    this.aoResolveUniforms=Object.fromEntries(['sceneColor','sceneDepth','aoMap','size','farDepth','hazeSettings','hazeColor'].map(name=>[name,gl.getUniformLocation(this.aoResolveProgram,name)]));
    this.depthSampleProgram=Program(fullscreenVertex,`#version 300 es
      precision highp float;
      precision highp int;
      uniform sampler2D sceneDepth;
      uniform highp usampler2D sampleIndices;
      uniform uint sourceWidth;
      out float pixel;
      void main() {
        uint index=texelFetch(sampleIndices,ivec2(gl_FragCoord.xy),0).r;
        pixel=texelFetch(sceneDepth,ivec2(index%sourceWidth,index/sourceWidth),0).r;
      }`);
    this.depthSampleUniforms=Object.fromEntries(['sceneDepth','sampleIndices','sourceWidth'].map(name=>[name,gl.getUniformLocation(this.depthSampleProgram,name)]));
    this.shadowBuffer=gl.createBuffer();this.shadowVao=gl.createVertexArray();
    gl.bindVertexArray(this.shadowVao);gl.bindBuffer(gl.ARRAY_BUFFER,this.shadowBuffer);
    gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,12,0);
    this.fullscreenVao=gl.createVertexArray();
    const settings=FLOW_RENDERING.lighting;
    this.shadowTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.shadowTexture);
    this.maxTextureSize=gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.shadowSize=Math.min(settings.shadowMapSize,this.maxTextureSize);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_COMPARE_MODE,gl.COMPARE_REF_TO_TEXTURE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_COMPARE_FUNC,gl.LEQUAL);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,this.shadowSize,this.shadowSize,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);
    this.shadowFramebuffer=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,this.shadowFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,this.shadowTexture,0);
    gl.drawBuffers([gl.NONE]);gl.readBuffer(gl.NONE);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) throw new Error('Incomplete shadow framebuffer');
  }

  BindTerrainSurface(surface) {
    const gl=this.gl,uniforms=this.surfaceUniforms;
    gl.uniform1i(uniforms.terrainSurface,surface?1:0);
    gl.uniform1i(uniforms.groundColor,1);gl.uniform1i(uniforms.distantColor,2);
    if(!surface) return;
    if(!this.surfaceTextures.has(surface)) {
      gl.activeTexture(gl.TEXTURE1);
      // The shared context serves every pane. Reuse the same pair of maps,
      // and release replaced scene maps when the editor changes terrain.
      while(this.surfaceTextures.size>=2) {
        const [oldSource,textures]=this.surfaceTextures.entries().next().value;
        for(const texture of textures) gl.deleteTexture(texture);
        this.surfaceTextures.delete(oldSource);
      }
      const anisotropy=gl.getExtension('EXT_texture_filter_anisotropic');
      const textures=[surface.scene,surface.backdrop].map(map=>{
        const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,map?.width||1,map?.height||1,0,gl.RGBA,gl.UNSIGNED_BYTE,map?.data||new Uint8Array(4));
        gl.generateMipmap(gl.TEXTURE_2D);
        if(anisotropy) gl.texParameterf(gl.TEXTURE_2D,anisotropy.TEXTURE_MAX_ANISOTROPY_EXT,
          Math.min(FLOW_RENDERING.terrainSurface.anisotropy,gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
        return texture;
      });
      this.surfaceTextures.set(surface,textures);
    }
    const textures=this.surfaceTextures.get(surface);
    for(const [index,map] of [surface.scene,surface.backdrop].entries()) {
      gl.activeTexture(gl.TEXTURE1+index);gl.bindTexture(gl.TEXTURE_2D,textures[index]);
      gl.uniform1i(index?uniforms.distantColor:uniforms.groundColor,1+index);
      const extent=map?[map.minX,map.minZ,(map.width-(index?0:1))*map.texelM,(map.height-(index?0:1))*map.texelM]:[0,0,1,1];
      gl.uniform4fv(index?uniforms.distantBounds:uniforms.groundBounds,extent);
    }
    gl.activeTexture(gl.TEXTURE0);
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
      gl.deleteFramebuffer(target.framebuffer);gl.deleteFramebuffer(target.shadedFramebuffer);gl.deleteTexture(target.shadedColor);gl.deleteFramebuffer(target.aoFramebuffer);gl.deleteTexture(target.aoTexture);gl.deleteTexture(target.color);gl.deleteTexture(target.distance);gl.deleteTexture(target.normal);gl.deleteRenderbuffer(target.depth);this.targets.delete(oldKey);
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
    target.aoFramebuffer=gl.createFramebuffer();target.aoTexture=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,target.aoTexture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    target.aoWidth=Math.max(1,Math.ceil(width*FLOW_RENDERING.lighting.aoRenderScale));
    target.aoHeight=Math.max(1,Math.ceil(height*FLOW_RENDERING.lighting.aoRenderScale));
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,target.aoWidth,target.aoHeight,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    gl.bindFramebuffer(gl.FRAMEBUFFER,target.aoFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,target.aoTexture,0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) throw new Error('Incomplete AO factor framebuffer');
  }

  PrepareResidentGeometry(raster) {
    if(!raster.resident||!raster.worldBatches.length) return null;
    const gl=this.gl,settings=FLOW_RENDERING.residentGeometry,owner=raster.view.mapData;
    let arena=this.residentOwners.get(owner);
    const previous=raster.residentIndexRecord;
    if(previous&&previous.arena===arena&&previous.batches===raster.worldBatches) return previous;
    let needed=0,total=0;
    for(const vertices of raster.worldBatches) {
      total+=vertices.byteLength;
      if(!arena?.entries.has(vertices)) needed+=vertices.byteLength;
    }
    if(total>settings.maxBytes) {raster.MaterializeWorldBatches();return null;}
    if(arena&&arena.used+needed>settings.maxBytes) {
      gl.deleteBuffer(arena.buffer);gl.deleteVertexArray(arena.vao);
      this.residentOwners.delete(owner);arena=null;needed=total;
    }
    if(!arena) {
      while(this.residentOwners.size>=settings.owners) {
        const [oldOwner,old]=this.residentOwners.entries().next().value;
        gl.deleteBuffer(old.buffer);gl.deleteVertexArray(old.vao);this.residentOwners.delete(oldOwner);
      }
      arena={entries:new WeakMap(),buffer:gl.createBuffer(),vao:gl.createVertexArray(),
        used:0,capacity:settings.initialBytes,indices:new Uint32Array(0)};
      while(arena.capacity<needed) arena.capacity*=2;
      gl.bindBuffer(gl.ARRAY_BUFFER,arena.buffer);gl.bufferData(gl.ARRAY_BUFFER,arena.capacity,gl.STATIC_DRAW);
      this.residentOwners.set(owner,arena);
    }
    if(arena.used+needed>arena.capacity) {
      let capacity=arena.capacity;
      while(capacity<arena.used+needed) capacity*=2;
      const buffer=gl.createBuffer();gl.bindBuffer(gl.COPY_WRITE_BUFFER,buffer);gl.bufferData(gl.COPY_WRITE_BUFFER,capacity,gl.STATIC_DRAW);
      gl.bindBuffer(gl.COPY_READ_BUFFER,arena.buffer);gl.copyBufferSubData(gl.COPY_READ_BUFFER,gl.COPY_WRITE_BUFFER,0,0,arena.used);
      gl.deleteBuffer(arena.buffer);arena.buffer=buffer;arena.capacity=capacity;
    }
    gl.bindVertexArray(arena.vao);gl.bindBuffer(gl.ARRAY_BUFFER,arena.buffer);
    for(let index=0;index<3;index++) {gl.enableVertexAttribArray(index);gl.vertexAttribPointer(index,3,gl.FLOAT,false,36,index*12);}
    const count=total/36;
    if(arena.indices.length<count) arena.indices=new Uint32Array(2**Math.ceil(Math.log2(count)));
    const uploadStart=arena.used,additions=needed?new Float32Array(needed/4):null;
    let offset=0;
    for(const vertices of raster.worldBatches) {
      let indices=arena.entries.get(vertices);
      if(!indices) {
        const first=arena.used/36,length=vertices.length/9;
        indices=new Uint32Array(length);
        for(let index=0;index<length;index++) indices[index]=first+index;
        additions.set(vertices,(arena.used-uploadStart)/4);
        arena.used+=vertices.byteLength;arena.entries.set(vertices,indices);
      }
      arena.indices.set(indices,offset);offset+=indices.length;
    }
    if(additions) gl.bufferSubData(gl.ARRAY_BUFFER,uploadStart,additions.subarray(0,(arena.used-uploadStart)/4));
    const indexBuffer=previous?.indexBuffer||gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,arena.indices.subarray(0,count),gl.STREAM_DRAW);
    const record={arena,indexBuffer,count,batches:raster.worldBatches};
    raster.residentIndexRecord=record;
    return record;
  }

  DrawResidentGeometry() {
    if(!this.residentWorld) return;
    this.gl.bindVertexArray(this.residentWorld.arena.vao);
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER,this.residentWorld.indexBuffer);
    this.gl.drawElements(this.gl.TRIANGLES,this.residentWorld.count,this.gl.UNSIGNED_INT,0);
  }

  BindSceneTarget(raster) {
    const gl=this.gl,target=this.target;
    // Draw distance directly into this pane's picking texture. Other panes of
    // the same size reuse the color targets but keep their own last depth.
    const distance=raster.sparseDepth?this.DepthSnapshot(raster).texture:target.distance;
    gl.bindFramebuffer(gl.FRAMEBUFFER,target.framebuffer);
    if(target.attachedDistance!==distance) {
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT1,gl.TEXTURE_2D,distance,0);
      target.attachedDistance=distance;
    }
  }

  DepthSnapshot(raster) {
    const gl=this.gl;
    let snapshot=raster.depthSnapshot;
    if(!snapshot||snapshot.gl!==gl||snapshot.width!==raster.width||snapshot.height!==raster.height) {
      if(snapshot?.gl===gl) {gl.deleteTexture(snapshot.texture);gl.deleteFramebuffer(snapshot.framebuffer);}
      snapshot={gl,width:raster.width,height:raster.height,texture:gl.createTexture(),framebuffer:gl.createFramebuffer()};
      gl.bindTexture(gl.TEXTURE_2D,snapshot.texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.R32F,raster.width,raster.height,0,gl.RED,gl.FLOAT,null);
      gl.bindFramebuffer(gl.FRAMEBUFFER,snapshot.framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,snapshot.texture,0);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0]);gl.bindTexture(gl.TEXTURE_2D,null);
      raster.depthSnapshot=snapshot;
    }
    return snapshot;
  }

  ReadFullDepth(raster) {
    return this.Trace(raster,this.ReadFullDepthContent);
  }

  ReadFullDepthContent(raster) {
    this.Phase("深度回读");
    const gl=this.gl;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER,raster.depthSnapshot.framebuffer);gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.readPixels(0,0,raster.width,raster.height,gl.RED,gl.FLOAT,raster.depthData);
  }

  ReadDepthSamples(raster) {
    if(!raster.depthSampleCount) return;
    return this.Trace(raster,this.ReadDepthSamplesContent);
  }

  ReadDepthSamplesContent(raster) {
    this.Phase("深度采样");
    const gl=this.gl,width=FLOW_RENDERING.depthReadback.sampleWidth;
    const rows=Math.ceil(raster.depthSampleCount/width);
    if(rows>this.maxTextureSize) {
      this.ReadFullDepth(raster);raster.fullDepthReady=true;raster.depthSampleCount=0;return;
    }
    if(!this.depthSamples||this.depthSamples.height<rows) {
      if(this.depthSamples) {
        gl.deleteTexture(this.depthSamples.indices);gl.deleteTexture(this.depthSamples.values);gl.deleteFramebuffer(this.depthSamples.framebuffer);
      }
      const height=2**Math.ceil(Math.log2(Math.max(1,rows)));
      const samples={height,indices:gl.createTexture(),values:gl.createTexture(),framebuffer:gl.createFramebuffer(),
        keys:new Uint32Array(width*height),depth:new Float32Array(width*height)};
      gl.activeTexture(gl.TEXTURE1);
      for(const [texture,internal,format,type] of [[samples.indices,gl.R32UI,gl.RED_INTEGER,gl.UNSIGNED_INT],[samples.values,gl.R32F,gl.RED,gl.FLOAT]]) {
        gl.bindTexture(gl.TEXTURE_2D,texture);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
        gl.texImage2D(gl.TEXTURE_2D,0,internal,width,height,0,format,type,null);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER,samples.framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,samples.values,0);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
      this.depthSamples=samples;
    }
    const samples=this.depthSamples;
    samples.keys.set(raster.depthSampleKeys.subarray(0,raster.depthSampleCount));
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,samples.indices);
    gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,width,rows,gl.RED_INTEGER,gl.UNSIGNED_INT,samples.keys.subarray(0,width*rows));
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,raster.depthSnapshot.texture);
    gl.bindFramebuffer(gl.FRAMEBUFFER,samples.framebuffer);gl.viewport(0,0,width,rows);gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.depthSampleProgram);gl.bindVertexArray(this.fullscreenVao);
    gl.uniform1i(this.depthSampleUniforms.sceneDepth,0);gl.uniform1i(this.depthSampleUniforms.sampleIndices,1);
    gl.uniform1ui(this.depthSampleUniforms.sourceWidth,raster.width);
    gl.drawArrays(gl.TRIANGLES,0,3);gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.readPixels(0,0,width,rows,gl.RED,gl.FLOAT,samples.depth.subarray(0,width*rows));
    for(let index=0;index<raster.depthSampleCount;index++) raster.depthData[raster.depthSampleKeys[index]]=samples.depth[index];
    for(let index=0;index<raster.depthTiles.length;index++) if(raster.depthTiles[index]===1) raster.depthTiles[index]=2;
    raster.depthSampleCount=0;
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,null);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,null);
  }

  DrawShadows(raster) {
    const gl=this.gl,view=raster.view,settings=view.lighting;
    const sun=FLOW_RENDERING.sky.sunDirection.map(value=>value/Math.hypot(...FLOW_RENDERING.sky.sunDirection));
    const horizontal=Math.hypot(sun[0],sun[2]),right=[sun[2]/horizontal,0,-sun[0]/horizontal];
    const up=[sun[1]*right[2],sun[2]*right[0]-sun[0]*right[2],-sun[1]*right[0]];
    const orthographic=!raster.perspective;
    const distance=Math.min(180,Math.max(20,(view.eye[1]-view.Ground([view.eye[0],view.eye[2]]))/Math.max(0.15,-view.forward[1])));
    const center=orthographic?[...view.aim]:view.eye.map((value,axis)=>value+view.forward[axis]*distance);
    // Radius steps up in 20% increments and the center snaps to whole texels, so
    // shadow edges stay put while the camera moves instead of crawling.
    const wanted=Math.min(settings.shadowMaxRadiusM,Math.max(settings.shadowMinRadiusM,orthographic?Math.max(view.width,view.height)/view.scale*0.65:distance*1.5));
    const radius=Math.min(settings.shadowMaxRadiusM,Math.max(settings.shadowMinRadiusM,1.2**Math.ceil(Math.log(wanted)/Math.log(1.2))));
    const texelSize=radius*2/this.shadowSize,snapRight=Math.round(Dot(center,right)/texelSize)*texelSize-Dot(center,right),snapUp=Math.round(Dot(center,up)/texelSize)*texelSize-Dot(center,up);
    for(let axis=0;axis<3;axis++) center[axis]+=right[axis]*snapRight+up[axis]*snapUp;
    const values={shadowCenter:center,shadowRight:right,shadowUp:up,sun,shadowSettings:[radius,settings.shadowDepthM,settings.shadowBiasM/settings.shadowDepthM/2,settings.shadowStrength]};
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,null);
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.shadowFramebuffer);gl.viewport(0,0,this.shadowSize,this.shadowSize);
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LESS);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);
    gl.clearBufferfv(gl.DEPTH,0,new Float32Array([1]));gl.useProgram(this.shadowProgram);
    for(const [name,value] of Object.entries(values)) {
      if(value.length===4) gl.uniform4fv(this.shadowUniforms[name],value);else gl.uniform3fv(this.shadowUniforms[name],value);
    }
    gl.bindVertexArray(this.shadowVao);gl.bindBuffer(gl.ARRAY_BUFFER,this.shadowBuffer);
    if(this.uploadedShadowVertices!==raster.shadowVertices) {
      gl.bufferData(gl.ARRAY_BUFFER,raster.shadowVertices,gl.STATIC_DRAW);this.uploadedShadowVertices=raster.shadowVertices;
    }
    gl.drawArrays(gl.TRIANGLES,0,raster.shadowVertices.length/3);
    // Visible terrain, vehicles and carried objects also cast shadows.
    this.DrawResidentGeometry();
    if(raster.worldLength) {
      gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER,raster.worldVertices.subarray(0,raster.worldLength),gl.STREAM_DRAW);gl.drawArrays(gl.TRIANGLES,0,raster.worldLength/9);
    }
    return values;
  }

  DrawAmbientOcclusion(raster) {
    this.Phase("环境遮蔽");
    const gl=this.gl,view=raster.view,settings=view.lighting;
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.target.aoFramebuffer);gl.disable(gl.DEPTH_TEST);
    gl.viewport(0,0,this.target.aoWidth,this.target.aoHeight);
    gl.useProgram(this.aoProgram);gl.bindVertexArray(this.fullscreenVao);
    for(const [unit,name,texture] of [[0,'sceneColor',this.target.color],[1,'sceneDepth',this.target.attachedDistance],[2,'sceneNormal',this.target.normal]]) {
      gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(this.aoUniforms[name],unit);
    }
    gl.uniform2f(this.aoUniforms.size,raster.width,raster.height);
    gl.uniform2f(this.aoUniforms.aoSize,this.target.aoWidth,this.target.aoHeight);
    gl.uniform4f(this.aoUniforms.projection,(raster.perspective?view.focal:view.scale)*raster.coordinateScale,raster.perspective?0.49:0.57,view.near,view.far);
    gl.uniform4f(this.aoUniforms.aoSettings,settings.aoRadiusM,settings.aoStrength,settings.aoMaxPixels,0);
    gl.uniform2f(this.aoUniforms.terrainAo,settings.aoTerrainScale??FLOW_RENDERING.lighting.aoTerrainScale,
      settings.aoTerrainBias??FLOW_RENDERING.lighting.aoTerrainBias);
    gl.uniform1f(this.aoUniforms.minLight,settings.aoMinLight);gl.uniform1i(this.aoUniforms.perspective,raster.perspective?1:0);
    gl.drawArrays(gl.TRIANGLES,0,3);
    // Resolve: average the dithered factors and apply them to the lit color.
    this.Phase("遮蔽合成与远雾");
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.target.shadedFramebuffer);
    gl.viewport(0,0,raster.width,raster.height);
    gl.useProgram(this.aoResolveProgram);
    for(const [unit,name,texture] of [[0,'sceneColor',this.target.color],[1,'sceneDepth',this.target.attachedDistance],[2,'aoMap',this.target.aoTexture]]) {
      gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(this.aoResolveUniforms[name],unit);
    }
    gl.uniform2f(this.aoResolveUniforms.size,raster.width,raster.height);gl.uniform1f(this.aoResolveUniforms.farDepth,view.far);
    const haze=FLOW_RENDERING.haze;
    gl.uniform3f(this.aoResolveUniforms.hazeSettings,haze.startM,haze.endM,haze.strength);
    gl.uniform3fv(this.aoResolveUniforms.hazeColor,[1,3,5].map(offset=>parseInt(FLOW_RENDERING.sky.horizon.slice(offset,offset+2),16)/255));
    gl.drawArrays(gl.TRIANGLES,0,3);
    gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,null);
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,null);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,null);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER,this.target.shadedFramebuffer);
  }

  Draw(raster) {
    return this.Trace(raster,this.DrawContent);
  }

  Trace(raster,method) {
    const trace=raster.debugTrace;
    if(!trace||this.trace===trace) return method.call(this,raster);
    const gl=this.gl,restore=[];
    this.trace=trace;
    try {
      for(const api of ["drawArrays","drawElements",...(trace.capturing?["clearBufferfv","blitFramebuffer"]:[])]) {
        const original=gl[api],own=Object.hasOwn(gl,api);
        gl[api]=(...args)=>{
          const triangles=api==="drawElements"?args[1]/3:api==="drawArrays"?args[2]/3:null;
          const query=trace.BeginGl(gl),timed=trace.capturing||trace.captureDraws;
          const start=timed?performance.now():0;
          try {return original.apply(gl,args);}
          finally {trace.Gl(gl,this.phase,api,args,triangles,timed?performance.now()-start:0,query);}
        };
        restore.push(()=>{if(own) gl[api]=original;else delete gl[api];});
      }
      return method.call(this,raster);
    } finally {
      this.Phase(null);this.trace=null;
      for(const undo of restore.reverse()) undo();
    }
  }

  Phase(name) {
    if(!this.trace||name===this.phase) return;
    if(this.phase) this.trace.EndGpu();
    this.phase=name;
    if(name) this.trace.BeginGpu(name);
  }

  DrawContent(raster) {
    const gl=this.gl;if(gl.isContextLost()) return false;
    try {this.Resize(raster.width,raster.height);} catch {unavailable=true;return false;}
    this.Phase("几何准备");
    this.residentWorld=this.PrepareResidentGeometry(raster);
    const lighting=raster.view?.lighting&&raster.shadowVertices;
    if(lighting) this.Phase("阴影");
    const shadowValues=lighting?this.DrawShadows(raster):null;
    this.Phase("主场景");
    this.BindSceneTarget(raster);gl.viewport(0,0,raster.width,raster.height);
    gl.disable(gl.BLEND);gl.disable(gl.DITHER);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LESS);
    gl.clearBufferfv(gl.COLOR,0,new Float32Array(4));gl.clearBufferfv(gl.COLOR,1,new Float32Array([Infinity,0,0,0]));
    gl.clearBufferfv(gl.COLOR,2,new Float32Array(4));
    gl.clearBufferfv(gl.DEPTH,0,new Float32Array([1]));
    gl.useProgram(this.program);gl.uniform2f(this.size,raster.width,raster.height);gl.uniform1i(this.perspective,raster.perspective?1:0);
    gl.uniform1i(this.lightingUniforms.lit,lighting?1:0);
    const balance=raster.view?.lighting||FLOW_RENDERING.lighting;
    gl.uniform2f(this.lightingUniforms.lightBalance,balance.ambient,balance.direct);
    const sun=FLOW_RENDERING.sky.sunDirection,sunLength=Math.hypot(...sun);
    gl.uniform3fv(this.lightingUniforms.sun,sun.map(value=>value/sunLength));
    if(lighting) {
      gl.uniform2f(this.lightingUniforms.lightBalance,raster.view.lighting.ambient,raster.view.lighting.direct);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.shadowTexture);gl.uniform1i(this.lightingUniforms.shadowMap,0);
      for(const [name,value] of Object.entries(shadowValues)) {
        if(value.length===4) gl.uniform4fv(this.lightingUniforms[name],value);else gl.uniform3fv(this.lightingUniforms[name],value);
      }
    }
    this.BindTerrainSurface(raster.terrainSurface);
    gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
    if(raster.view) {
      const view=raster.view;
      for(const name of ['eye','right','up','forward']) gl.uniform3fv(this.cameraUniforms[name],view[name]);
      gl.uniform4f(this.cameraUniforms.projection,(raster.perspective?view.focal:view.scale)*raster.coordinateScale,raster.perspective?0.49:0.57,view.near,view.far);
    }
    gl.uniform1i(this.world,1);this.DrawResidentGeometry();
    if(raster.worldLength) {
      gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
      gl.uniform1i(this.world,1);
      if(!lighting) gl.bufferData(gl.ARRAY_BUFFER,raster.worldVertices.subarray(0,raster.worldLength),gl.STREAM_DRAW);
      gl.drawArrays(gl.TRIANGLES,0,raster.worldLength/9);
    }
    gl.uniform1i(this.world,0);
    gl.bindVertexArray(this.screenVao);
    gl.bufferData(gl.ARRAY_BUFFER,raster.gpuVertices.subarray(0,raster.gpuLength),gl.STREAM_DRAW);
    gl.drawArrays(gl.TRIANGLES,0,raster.gpuLength/6);
    this.Phase("深度回读");
    if(raster.sparseDepth) {
      // Let the GPU render shadows and scene depth while the CPU projects the
      // current frame's markers and collects the pixels they actually need.
      if(raster.pendingDepthDraw) {
        gl.flush();
        raster.CollectDepthSamples(raster.pendingDepthDraw);raster.pendingDepthDraw=null;
      }
      this.ReadDepthSamples(raster);
      gl.bindFramebuffer(gl.FRAMEBUFFER,this.framebuffer);
    } else {
      gl.readBuffer(gl.COLOR_ATTACHMENT1);gl.readPixels(0,0,raster.width,raster.height,gl.RED,gl.FLOAT,raster.depthData);
    }
    // Keep color on the GPU. Only depth is read back for editor interactions.
    if(lighting) this.DrawAmbientOcclusion(raster);
    this.Phase("输出到视口");
    gl.readBuffer(gl.COLOR_ATTACHMENT0);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,null);
    gl.blitFramebuffer(0,0,raster.width,raster.height,0,this.canvas.height,raster.width,this.canvas.height-raster.height,gl.COLOR_BUFFER_BIT,gl.NEAREST);
    return !gl.isContextLost()&&gl.getError()===gl.NO_ERROR;
  }
}
