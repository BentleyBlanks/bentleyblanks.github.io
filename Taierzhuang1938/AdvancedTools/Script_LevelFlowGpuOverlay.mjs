// Screen-space overlay vertices retain the camera distance that produced them.
// The depth attachment is in editor (top-down) coordinates, even when another pane renders next.
const vertexSource=`#version 300 es
precision highp float;
layout(location=0) in vec3 point;
layout(location=1) in vec4 ink;
layout(location=2) in vec4 shape;
layout(location=3) in vec2 uv;
layout(location=4) in vec4 anchor;
layout(location=5) in float actor;
uniform vec2 displaySize;
uniform sampler2D visibility;
out vec3 position;
out vec4 color;
out vec4 capsule;
out vec2 texcoord;
flat out vec4 label;
flat out float actorOpacity;
void main(){
  gl_Position=vec4(point.xy/displaySize*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);
  position=point;color=ink;capsule=shape;texcoord=uv;label=anchor;actorOpacity=-1.;
  if(actor>=0.) {
    vec2 flags=texelFetch(visibility,ivec2(int(actor),0),0).rg;
    if(flags.g>0.) actorOpacity=flags.r>0.?0.7:anchor.w;
  }
}`;
const depthFunctions=`
uniform highp sampler2D sceneDepth;
uniform float coordinateScale;
bool hidden(vec2 screen,float depth) {
  ivec2 p=ivec2(floor(screen*coordinateScale+0.5));
  ivec2 size=textureSize(sceneDepth,0);
  return all(greaterThanEqual(p,ivec2(0)))&&all(lessThan(p,size))&&depth>texelFetch(sceneDepth,p,0).r+0.025;
}
`;
const fragmentSource=`#version 300 es
precision highp float;
${depthFunctions}
uniform sampler2D atlas;
uniform bool perspective;
in vec3 position;
in vec4 color;
in vec4 capsule;
in vec2 texcoord;
flat in vec4 label;
flat in float actorOpacity;
out vec4 pixel;
void main(){
  float opacity=actorOpacity;
  if(opacity<0.&&label.w>=1.) opacity=1.;
  if(opacity<0.) {
    float z=perspective?1./position.z:position.z;
    opacity=(label.z>0.?hidden(label.xy,label.z):hidden(position.xy-0.5/coordinateScale,z))?label.w:1.;
  }
  if(opacity<=0.) discard;
  vec4 c=color;
  if(texcoord.x>=0.) c*=texture(atlas,texcoord);
  if(capsule.w>=0.) {
    vec2 d=vec2(capsule.x-clamp(capsule.x,0.,capsule.z),capsule.y);
    float edge=length(d)-capsule.w;
    c.a*=clamp(0.5-edge/max(fwidth(edge),0.001),0.,1.);
  }
  pixel=vec4(c.rgb,c.a*opacity);
}`;
// Each instance tests up to 64 samples from a projected limb, head or face.
// MAX blending retains both "some visible" and "some hidden" for each actor.
const probeSource=`#version 300 es
precision highp float;
${depthFunctions}
layout(location=0) in vec3 a;
layout(location=1) in vec3 b;
layout(location=2) in vec3 c;
layout(location=3) in vec4 batch;
uniform vec2 displaySize;
uniform bool perspective;
uniform float slots;
flat out vec2 flags;
float edge(vec2 u,vec2 v,vec2 p){return (p.x-u.x)*(v.y-u.y)-(p.y-u.y)*(v.x-u.x);}
void main(){
  int i=int(batch.z)+gl_VertexID;
  bool valid=i<int(batch.w);
  vec3 p=a;
  if(batch.y==0.) p=mix(a,b,float(i)/max(1.,batch.w-1.));
  else {
    vec2 lo=batch.y==1.?a.xy-vec2(c.x):min(min(a.xy,b.xy),c.xy);
    vec2 hi=batch.y==1.?a.xy+vec2(c.x):max(max(a.xy,b.xy),c.xy);
    lo=max(vec2(0.),floor(lo));hi=min(ceil(displaySize),ceil(hi));
    int width=max(1,int(hi.x-lo.x));
    p.xy=lo+vec2(i%width,i/width);
    vec2 at=p.xy+0.5;
    if(batch.y==1.) valid=valid&&distance(at,a.xy)<=c.x;
    else {
      float area=edge(a.xy,b.xy,c.xy);
      vec3 w=vec3(edge(b.xy,c.xy,at),edge(c.xy,a.xy,at),0.)/area;w.z=1.-w.x-w.y;
      valid=valid&&abs(area)>0.001&&all(greaterThanEqual(w,vec3(0.)));
      p.z=dot(w,vec3(a.z,b.z,c.z));
    }
  }
  bool occluded=hidden(p.xy,perspective?1./p.z:p.z);
  flags=valid?(occluded?vec2(0,1):vec2(1,0)):vec2(0);
  gl_Position=vec4((batch.x+0.5)/slots*2.-1.,0.,0.,1.);gl_PointSize=1.;
}`;
const probeFragment=`#version 300 es
precision highp float; flat in vec2 flags; out vec4 pixel;
void main(){pixel=vec4(flags,0.,1.);}`;

const white=[1,1,1,1],plain=[0,0,0,-1],noAnchor=[0,0,0,1],solid=[-1,0];
const colors=new Map();
function Ink(hex) {
  if(!colors.has(hex)) {
    let value=hex.slice(1);
    if(value.length<=4) value=[...value].map(ch=>ch+ch).join("");
    if(value.length===6) value+="ff";
    colors.set(hex,[0,2,4,6].map(offset=>parseInt(value.slice(offset,offset+2),16)/255));
  }
  return colors.get(hex);
}
function Layout(gl,widths,instanced) {
  const vao=gl.createVertexArray(),buffer=gl.createBuffer();
  gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
  const stride=widths.reduce((sum,n)=>sum+n,0)*4;
  let offset=0;
  widths.forEach((width,i)=>{
    gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,width,gl.FLOAT,false,stride,offset);
    if(instanced) gl.vertexAttribDivisor(i,1);
    offset+=width*4;
  });
  return {vao,buffer,stride:stride/4};
}
function Texture(gl,width,height,filter) {
  const texture=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,filter);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,filter);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);return texture;
}
export class EncounterGpuOverlay {
  constructor(gl,program) {
    this.gl=gl;this.program=program(vertexSource,fragmentSource);this.probeProgram=program(probeSource,probeFragment);
    const Uniforms=(p,names)=>Object.fromEntries(names.map(name=>[name,gl.getUniformLocation(p,name)]));
    this.uniforms=Uniforms(this.program,["displaySize","coordinateScale","sceneDepth","perspective","atlas","visibility"]);
    this.probeUniforms=Uniforms(this.probeProgram,["displaySize","coordinateScale","sceneDepth","perspective","slots"]);
    this.layout=Layout(gl,[3,4,4,2,4,1],false);this.probeLayout=Layout(gl,[3,3,3,4],true);
    this.flagFbo=gl.createFramebuffer();this.flagWidth=1;this.flags=Texture(gl,1,1,gl.NEAREST);
    this.scratch=document.createElement("canvas");this.pages=[];this.sprites=new Map();this.atlasSize=Math.min(2048,gl.getParameter(gl.MAX_TEXTURE_SIZE));
    this.blank=Texture(gl,1,1,gl.NEAREST);
    this.vertices=new Float32Array(16384);this.probes=new Float32Array(4096);
  }
  Begin(raster,context,reuseVisibility=false) {
    this.raster=raster;this.context=context;this.vertexLength=0;this.probeLength=0;this.runs=[];
    this.left=Infinity;this.top=Infinity;this.right=-Infinity;this.bottom=-Infinity;
    this.reuseVisibility=reuseVisibility;
    if(!reuseVisibility) this.actorSlots=new Map();
    this.anchor=undefined;this.actorSlot=-1;this.probeActor=-1;this.pixelRatio=context.getTransform().a||1;
    return this;
  }
  Depth(z) {return this.raster.perspective?1/z:z;}
  TrackActor(id) {
    const slot=this.actorSlots.size;this.actorSlots.set(id,slot);this.probeActor=slot;
  }
  Probe(a,b,c,mode,count) {
    if(this.probeActor<0) return;
    const needed=this.probeLength+Math.ceil(count/64)*this.probeLayout.stride;
    if(this.probes.length<needed) {
      const grown=new Float32Array(Math.max(needed,this.probes.length*2));grown.set(this.probes);this.probes=grown;
    }
    for(let start=0;start<count;start+=64) {
      const at=this.probeLength,probes=this.probes;
      probes.set(a,at);probes.set(b,at+3);probes.set(c,at+6);
      probes[at+9]=this.probeActor;probes[at+10]=mode;probes[at+11]=start;probes[at+12]=count;
      this.probeLength+=this.probeLayout.stride;
    }
  }
  Vertex(x,y,z,color,shape,uv,anchor,actor) {
    this.left=Math.min(this.left,x);this.right=Math.max(this.right,x);
    this.top=Math.min(this.top,y);this.bottom=Math.max(this.bottom,y);
    const at=this.vertexLength;
    this.vertexLength+=this.layout.stride;
    if(this.vertexLength>this.vertices.length) {
      const grown=new Float32Array(this.vertices.length*2);grown.set(this.vertices);this.vertices=grown;
    }
    const vertices=this.vertices;
    vertices[at]=x;vertices[at+1]=y;vertices[at+2]=z;vertices.set(color,at+3);vertices.set(shape,at+7);
    vertices.set(uv,at+11);vertices.set(anchor,at+13);vertices[at+17]=actor;
  }
  Run(texture=null) {
    const first=this.vertexLength/this.layout.stride;
    if(!this.runs.length||texture&&texture!==this.runs.at(-1).texture) this.runs.push({first,texture:texture||this.blank});
  }
  Line(a,b,color,width,hiddenAlpha=1,anchor=null,actor=-1) {
    const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
    if(!Number.isFinite(length)) return;
    const ux=length?dx/length:1,uy=length?dy/length:0,r=width/2,outer=r+1;
    const za=this.Depth(a.depth),zb=this.Depth(b.depth);
    // Clip the probe sequence before expanding it. A close near-plane crossing
    // can project one endpoint several screens outside the pane.
    if(this.probeActor>=0) {
      let from=0,to=1;
      for(const [p,d,max] of [[a.x,dx,this.raster.displayWidth],[a.y,dy,this.raster.displayHeight]]) {
        if(!d) {if(p< -5||p>max+5) to=-1;continue;}
        const u=(-5-p)/d,v=(max+5-p)/d;from=Math.max(from,Math.min(u,v));to=Math.min(to,Math.max(u,v));
      }
      if(from<=to) {
        const At=t=>[a.x+dx*t,a.y+dy*t,za+(zb-za)*t];
        this.Probe(At(from),At(to),[0,0,0],0,Math.max(2,Math.ceil(length*(to-from)/1.5)+1));
      }
    }
    const ink=Ink(color),test=anchor||[0,0,0,hiddenAlpha];this.Run();
    for(const [end,side] of [[0,-1],[1,-1],[1,1],[0,-1],[1,1],[0,1]]) {
      const along=end?length+outer:-outer,cross=side*outer;
      this.Vertex(a.x+along*ux-cross*uy,a.y+along*uy+cross*ux,length?za+(zb-za)*along/length:za,ink,[along,cross,length,r],solid,test,actor);
    }
  }
  Disk(p,r,color,hiddenAlpha,anchor=null) {
    const z=this.Depth(p.depth),outside=r+1,ink=Ink(color),test=anchor||[0,0,0,hiddenAlpha];
    if(this.probeActor>=0) {
      const size=(v,max)=>Math.max(0,Math.min(Math.ceil(max),Math.ceil(v+r))-Math.max(0,Math.floor(v-r)));
      this.Probe([p.x,p.y,z],[0,0,0],[r,0,0],1,size(p.x,this.raster.displayWidth)*size(p.y,this.raster.displayHeight));
    }
    this.Run();
    for(const [dx,dy] of [[-1,-1],[1,-1],[1,1],[-1,-1],[1,1],[-1,1]])
      this.Vertex(p.x+dx*outside,p.y+dy*outside,z,ink,[dx*outside,dy*outside,0,r],solid,test,-1);
  }
  Face(points,color,hiddenAlpha,anchor=null,actor=-1) {
    this.Run();const ink=Ink(color);
    for(let i=1;i+1<points.length;i++) {
      const tri=[points[0],points[i],points[i+1]];
      const coords=tri.map(p=>[p.x,p.y,this.Depth(p.depth)]);
      if(this.probeActor>=0) {
        const extent=(axis,max)=>Math.max(0,Math.min(Math.ceil(max),Math.ceil(Math.max(...coords.map(p=>p[axis]))))-Math.max(0,Math.floor(Math.min(...coords.map(p=>p[axis])))));
        this.Probe(...coords,2,extent(0,this.raster.displayWidth)*extent(1,this.raster.displayHeight));
      }
      for(const [x,y,z] of coords) this.Vertex(x,y,z,ink,plain,solid,anchor||[0,0,0,hiddenAlpha],actor);
    }
  }
  Sprite(key,width,height,paint,corners,anchor=noAnchor,actor=-1) {
    if(!(width>0&&height>0)) return;
    const gl=this.gl,size=this.atlasSize,scale=Math.min(this.pixelRatio,(size-2)/Math.max(width,height));
    const cacheKey=JSON.stringify([key,scale,width,height]);
    let sprite=this.sprites.get(cacheKey);
    if(!sprite) {
      const w=Math.ceil(width*scale),h=Math.ceil(height*scale);
      let page=this.pages.at(-1);
      if(page&&page.x+w+1>size) {page.x=1;page.y+=page.row+2;page.row=0;}
      if(!page||page.y+h+1>size) {
        page={texture:Texture(gl,size,size,gl.LINEAR),x:1,y:1,row:0,keys:[]};this.pages.push(page);
      }
      this.scratch.width=w;this.scratch.height=h;
      const ctx=this.scratch.getContext("2d");ctx.setTransform(scale,0,0,scale,0,0);paint(ctx);
      gl.bindTexture(gl.TEXTURE_2D,page.texture);gl.texSubImage2D(gl.TEXTURE_2D,0,page.x,page.y,gl.RGBA,gl.UNSIGNED_BYTE,this.scratch);
      sprite={texture:page.texture,u:page.x/size,v:page.y/size,w:w/size,h:h/size};
      this.sprites.set(cacheKey,sprite);page.keys.push(cacheKey);page.x+=w+2;page.row=Math.max(page.row,h);
    }
    this.Run(sprite.texture);
    const uv=[[0,0],[1,0],[1,1],[0,1]];
    for(const i of [0,1,2,0,2,3]) {
      const [x,y]=corners[i];this.Vertex(x,y,1,white,plain,[sprite.u+uv[i][0]*sprite.w,sprite.v+uv[i][1]*sprite.h],anchor,actor);
    }
  }
  Billboard(key,x,y,w,h,paint,anchor,actor=-1) {
    this.Sprite(key,w,h,paint,[[x,y],[x+w,y],[x+w,y+h],[x,y+h]],anchor,actor);
  }
  Speech(actor,speech,lines,box,paint,tail) {
    const view=this.raster.view,anchor=view.LabelVertex(actor);
    const test=[anchor.x,anchor.y,anchor.depth,view.type==="eye"&&!view.freeCamera?0:.22];
    const slot=this.actorSlots.get(actor.id)??-1,[left,top,w,h]=box;
    this.Billboard(["speech",speech.name,lines],left-2,top-2,w+4,h+4,ctx=>paint(ctx,2,2),test,slot);
    const Point=(x,y)=>({x,y,depth:anchor.depth});
    const a=Point(tail.x-7,tail.edgeY),tip=Point(tail.tipX,tail.tipY),b=Point(tail.x+7,tail.edgeY);
    this.Face([a,tip,b],tail.fill,1,test,slot);
    this.Line(a,tip,tail.outline,2,1,test,slot);this.Line(tip,b,tail.outline,2,1,test,slot);
    this.Line(Point(tail.x-6,tail.edgeY),Point(tail.x+6,tail.edgeY),tail.fill,2,1,test,slot);
  }
  Bind(program,uniforms) {
    const gl=this.gl,r=this.raster;gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,r.depthSnapshot.texture);gl.uniform1i(uniforms.sceneDepth,0);
    gl.uniform1f(uniforms.coordinateScale,r.coordinateScale);gl.uniform1i(uniforms.perspective,r.perspective?1:0);
    gl.uniform2f(uniforms.displaySize,r.view.width,r.view.height);
  }
  Render(raster) {
    const gl=this.gl,gpu=raster.gpu;
    const width=Math.max(1,Math.round(raster.view.width*this.pixelRatio)),height=Math.max(1,Math.round(raster.view.height*this.pixelRatio));
    if(gpu.canvas.width<width) gpu.canvas.width=width;
    if(gpu.canvas.height<height) gpu.canvas.height=height;
    gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);
    if(this.actorSlots.size&&!this.reuseVisibility) {
      gpu.Phase("人物可见性");
      if(this.flagWidth<this.actorSlots.size) {
        gl.deleteTexture(this.flags);this.flagWidth=2**Math.ceil(Math.log2(this.actorSlots.size));this.flags=Texture(gl,this.flagWidth,1,gl.NEAREST);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER,this.flagFbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.flags,0);
      gl.viewport(0,0,this.flagWidth,1);gl.clearBufferfv(gl.COLOR,0,new Float32Array(4));
      this.Bind(this.probeProgram,this.probeUniforms);gl.uniform1f(this.probeUniforms.slots,this.flagWidth);
      gl.bindVertexArray(this.probeLayout.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.probeLayout.buffer);
      gl.bufferData(gl.ARRAY_BUFFER,this.probes.subarray(0,this.probeLength),gl.STREAM_DRAW);
      gl.blendEquation(gl.MAX);gl.drawArraysInstanced(gl.POINTS,0,64,this.probeLength/this.probeLayout.stride);
    }
    // Canvas composition and clearing only touch the rectangle occupied by
    // this overlay. Empty space can dominate a large single-pane viewport.
    const left=Math.max(0,Math.floor(this.left*this.pixelRatio)-1),right=Math.min(width,Math.ceil(this.right*this.pixelRatio)+1);
    const top=Math.max(0,Math.floor(this.top*this.pixelRatio)-1),bottom=Math.min(height,Math.ceil(this.bottom*this.pixelRatio)+1);
    if(right<=left||bottom<=top) {gl.disable(gl.BLEND);gl.blendEquation(gl.FUNC_ADD);gl.bindFramebuffer(gl.FRAMEBUFFER,null);return;}
    gpu.Phase("GPU 文字与标记");
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,gpu.canvas.height-height,width,height);
    gl.enable(gl.SCISSOR_TEST);gl.scissor(left,gpu.canvas.height-bottom,right-left,bottom-top);
    gl.clearBufferfv(gl.COLOR,0,new Float32Array(4));
    gl.blendEquation(gl.FUNC_ADD);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    this.Bind(this.program,this.uniforms);
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.flags);gl.uniform1i(this.uniforms.visibility,1);
    gl.activeTexture(gl.TEXTURE2);gl.uniform1i(this.uniforms.atlas,2);
    gl.bindVertexArray(this.layout.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.layout.buffer);
    gl.bufferData(gl.ARRAY_BUFFER,this.vertices.subarray(0,this.vertexLength),gl.STREAM_DRAW);
    for(let i=0;i<this.runs.length;i++) {
      const {first,texture}=this.runs[i],end=this.runs[i+1]?.first??this.vertexLength/this.layout.stride;
      gl.bindTexture(gl.TEXTURE_2D,texture);gl.drawArrays(gl.TRIANGLES,first,end-first);
    }
    gl.disable(gl.BLEND);gl.disable(gl.SCISSOR_TEST);
    for(const unit of [2,1,0]) {gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,null);}
    const sx=raster.view.width/width,sy=raster.view.height/height;
    gpu.Phase(null);
    const cpu=gpu.trace?.cpu;
    cpu?.Begin("叠层合成到画布");
    try {this.context.drawImage(gpu.canvas,left,top,right-left,bottom-top,left*sx,top*sy,(right-left)*sx,(bottom-top)*sy);}
    finally {cpu?.End();}
    while(this.pages.length>2) {
      const page=this.pages.shift();for(const key of page.keys) this.sprites.delete(key);gl.deleteTexture(page.texture);
    }
  }
  Flush() {
    if(this.vertexLength||this.actorSlots.size&&!this.reuseVisibility) this.raster.gpu.Trace(this.raster,r=>this.Render(r));
    this.context=null;this.raster=null;this.runs=[];
  }
}
