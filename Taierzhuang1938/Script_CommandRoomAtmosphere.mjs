import * as THREE from "three";

// A bounded world-space light volume. Camera depth clips the integral; a static
// light-space depth map includes the actual window mullions, furniture and paper.
// Reference: saladgamer.com/vlb-doc/compatibility/ and comp-dustparticles/.
const VERTEX = `varying vec2 screenUv;
void main(){screenUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const SHADOW = `
uniform sampler2D lightDepth; uniform mat4 lightMatrix;
uniform float shadowBias; uniform float shadowTexel;
float Lit(vec3 p){
  vec4 q=lightMatrix*vec4(p,1.);vec3 uv=q.xyz/q.w*.5+.5;
  if(any(lessThan(uv,vec3(0.)))||any(greaterThan(uv,vec3(1.))))return 0.;
  float lit=0.;
  for(int y=0;y<2;y++)for(int x=0;x<2;x++){
    vec2 d=(vec2(float(x),float(y))-.5)*shadowTexel;
    lit+=step(uv.z-shadowBias,texture2D(lightDepth,uv.xy+d).r);
  }return lit*.25;
}`;
const VOLUME = `
varying vec2 screenUv; uniform sampler2D sceneDepth;
uniform mat4 inverseProjection; uniform mat4 cameraWorld;
uniform vec3 eye; uniform vec3 origin; uniform vec3 direction;
uniform vec2 aperture; uniform float beamLength; uniform vec3 tint;
uniform float density; uniform float clock; uniform float edgeSoftness;
${SHADOW}
vec3 BeamPoint(vec3 p){
  float along=(p.z-origin.z)/direction.z;
  return vec3(p.xy-origin.xy-direction.xy*along,along);
}
vec3 BeamRay(vec3 d){float along=d.z/direction.z;return vec3(d.xy-direction.xy*along,along);}
void main(){
  float depth=texture2D(sceneDepth,screenUv).r;
  vec4 view=inverseProjection*vec4(screenUv*2.-1.,depth*2.-1.,1.);
  vec3 end=(cameraWorld*vec4(view.xyz/view.w,1.)).xyz;
  float stop=distance(end,eye);vec3 ray=normalize(end-eye);
  vec3 ro=BeamPoint(eye),rd=BeamRay(ray);
  // Preserve signs for rays parallel to a slab, avoiding infinity/NaN at screen centre.
  rd=sign(rd+vec3(1e-9))*max(abs(rd),vec3(1e-6));
  vec3 a=(vec3(-aperture*.5,0.)-ro)/rd;
  vec3 b=(vec3(aperture*.5,beamLength)-ro)/rd;
  vec3 lo=min(a,b),hi=max(a,b);
  float enter=max(0.,max(lo.x,max(lo.y,lo.z)));
  float leave=min(stop,min(hi.x,min(hi.y,hi.z)));
  float integral=0.;
  if(leave>enter){
    float stride=(leave-enter)/float(BEAM_STEPS);
    float jitter=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);
    for(int i=0;i<BEAM_STEPS;i++){
      float distanceAlongRay=enter+(float(i)+jitter)*stride;
      vec3 p=eye+ray*distanceAlongRay;vec3 local=BeamPoint(p);
      vec2 edge=aperture*.5-abs(local.xy);
      float feather=smoothstep(0.,edgeSoftness,min(edge.x,edge.y));
      float ends=smoothstep(0.,.12,local.z)*(1.-smoothstep(beamLength*.72,beamLength,local.z));
      float noise=.78+.22*sin(p.x*8.+p.y*3.+clock*.11)*sin(p.y*7.-p.z*5.-clock*.09);
      float intersection=smoothstep(0.,.08,stop-distanceAlongRay);
      integral+=Lit(p)*feather*ends*noise*intersection*stride;
    }
  }
  float scatter=1.-exp(-integral*density);
  gl_FragColor=vec4(tint*scatter,stop);
}`;
const COMPOSITE = `
varying vec2 screenUv; uniform sampler2D sceneColor; uniform sampler2D sceneDepth;
uniform sampler2D volumeColor; uniform vec2 volumeTexel;
uniform mat4 inverseProjection; uniform vec2 colorTexel; uniform vec4 dof;
float ViewDepth(vec2 uv){
  float z=texture2D(sceneDepth,uv).r;
  vec4 p=inverseProjection*vec4(uv*2.-1.,z*2.-1.,1.);
  return -p.z/p.w;
}
vec3 FocusColor(vec2 uv){
  float d=ViewDepth(uv);
  float radius=min(dof.w,max(0.,abs(d-dof.x)-dof.y)*dof.z/max(d,.1));
  vec3 sum=texture2D(sceneColor,uv).rgb;float total=1.;
  // Small depth-aware disc; foreground silhouettes never borrow background colour.
  for(int i=0;i<12;i++){
    float angle=float(i)*2.39996323;
    vec2 q=uv+vec2(cos(angle),sin(angle))*sqrt((float(i)+.5)/12.)*radius*colorTexel;
    float sampleDepth=ViewDepth(q);
    float weight=exp(-max(0.,sampleDepth-d-.04)*35.);
    sum+=texture2D(sceneColor,q).rgb*weight;total+=weight;
  }
  return sum/total;
}
void main(){
  float z=texture2D(sceneDepth,screenUv).r;
  vec4 v=inverseProjection*vec4(screenUv*2.-1.,z*2.-1.,1.);
  float distanceToSurface=length(v.xyz/v.w);
  vec3 fog=vec3(0.);float total=0.;
  // Bilateral upsampling prevents half-resolution fog bleeding over the table edge.
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec4 sampleFog=texture2D(volumeColor,screenUv+vec2(float(x),float(y))*volumeTexel);
    float weight=exp(-abs(sampleFog.a-distanceToSurface)*20.)/(1.+float(x*x+y*y));
    fog+=sampleFog.rgb*weight;total+=weight;
  }
  gl_FragColor=vec4(FocusColor(screenUv)+fog/max(total,1e-5),1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class CommandRoomAtmosphere {
  constructor(renderer, scene, data, depthOfField={focus:3.15,range:1.55,aperture:2.3,maxRadius:2.2}) {
    this.renderer=renderer; this.scene=scene; this.data=data; this.shadowDirty=true;
    this.size=new THREE.Vector2();
    this.colorTarget=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:true,samples:2});
    this.colorTarget.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
    this.volumeTarget=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:false,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});
    this.shadowTarget=new THREE.WebGLRenderTarget(data.shadowSize,data.shadowSize,{depthBuffer:true});
    this.shadowTarget.depthTexture=new THREE.DepthTexture(data.shadowSize,data.shadowSize,THREE.UnsignedIntType);
    this.depthMaterial=new THREE.MeshDepthMaterial();
    const direction=new THREE.Vector3().fromArray(data.direction).normalize();
    const origin=new THREE.Vector3().fromArray(data.center);
    this.lightCamera=new THREE.OrthographicCamera(-data.shadowExtent,data.shadowExtent,data.shadowExtent,-data.shadowExtent,.1,data.shadowFar);
    this.lightCamera.position.copy(origin).addScaledVector(direction,-data.shadowDistance);
    this.lightCamera.lookAt(origin);this.lightCamera.updateMatrixWorld(true);
    this.lightMatrix=new THREE.Matrix4().multiplyMatrices(this.lightCamera.projectionMatrix,this.lightCamera.matrixWorldInverse);
    this.lightUniforms={lightDepth:{value:this.shadowTarget.depthTexture},lightMatrix:{value:this.lightMatrix},
      shadowBias:{value:data.shadowBias},shadowTexel:{value:1/data.shadowSize}};
    this.volumeMaterial=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,
      defines:{BEAM_STEPS:data.steps},vertexShader:VERTEX,fragmentShader:VOLUME,
      uniforms:{...this.lightUniforms,sceneDepth:{value:this.colorTarget.depthTexture},
        inverseProjection:{value:new THREE.Matrix4()},cameraWorld:{value:new THREE.Matrix4()},eye:{value:new THREE.Vector3()},
        origin:{value:origin},direction:{value:direction},aperture:{value:new THREE.Vector2().fromArray(data.size)},
        beamLength:{value:data.length},tint:{value:new THREE.Color(data.color)},density:{value:data.density},
        clock:{value:0},edgeSoftness:{value:data.edgeSoftness}}});
    this.compositeMaterial=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,
      vertexShader:VERTEX,fragmentShader:COMPOSITE,
      uniforms:{sceneColor:{value:this.colorTarget.texture},sceneDepth:{value:this.colorTarget.depthTexture},
        volumeColor:{value:this.volumeTarget.texture},volumeTexel:{value:new THREE.Vector2()},inverseProjection:{value:new THREE.Matrix4()},
        colorTexel:{value:new THREE.Vector2()},dof:{value:new THREE.Vector4(depthOfField.focus,depthOfField.range,depthOfField.aperture,depthOfField.maxRadius)}}});
    this.quadScene=new THREE.Scene();this.quadCamera=new THREE.Camera();
    this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.volumeMaterial);
    this.quad.frustumCulled=false;this.quadScene.add(this.quad);
  }
  BuildDust(data) {
    const positions=new Float32Array(data.count*3),seeds=new Float32Array(data.count);
    let seed=1938;const Rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const origin=this.volumeMaterial.uniforms.origin.value,direction=this.volumeMaterial.uniforms.direction.value;
    for(let i=0;i<data.count;i++){
      const t=(.06+Rand()*.90)*this.data.length;
      positions[i*3]=origin.x+direction.x*t+(Rand()-.5)*this.data.size[0]*.94;
      positions[i*3+1]=origin.y+direction.y*t+(Rand()-.5)*this.data.size[1]*.94;
      positions[i*3+2]=origin.z+direction.z*t;seeds[i]=Rand();
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.BufferAttribute(positions,3));
    geometry.setAttribute("seed",new THREE.BufferAttribute(seeds,1));
    const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,
      uniforms:{...this.lightUniforms,clock:{value:0},tint:{value:new THREE.Color(data.color)},opacity:{value:data.opacity},
        pointSize:{value:data.size},drift:{value:data.drift},pixelHeight:{value:1}},
      vertexShader:`attribute float seed;uniform float clock;uniform float drift;uniform float pointSize;uniform float pixelHeight;
        varying vec3 worldPoint;varying float brightness;
        void main(){vec3 p=position;float phase=seed*6.283185;
          p+=vec3(sin(clock*.27+phase),sin(clock*.17+phase*3.),cos(clock*.21+phase*2.))*drift;
          worldPoint=(modelMatrix*vec4(p,1.)).xyz;vec4 view=modelViewMatrix*vec4(p,1.);
          brightness=(.45+.55*seed)*smoothstep(.25,.7,-view.z)*(1.-smoothstep(5.,8.,-view.z));
          gl_PointSize=clamp(pointSize*pixelHeight*projectionMatrix[1][1]*(.5+seed*.5)/max(.1,-view.z),.6,2.6);
          gl_Position=projectionMatrix*view;}`,
      fragmentShader:`uniform vec3 tint;uniform float opacity;varying vec3 worldPoint;varying float brightness;
        ${SHADOW}
        void main(){float radius=length(gl_PointCoord-.5);float alpha=exp(-radius*radius*18.)*smoothstep(.5,.28,radius);
          alpha*=opacity*brightness*Lit(worldPoint);if(alpha<.003)discard;gl_FragColor=vec4(tint,alpha);}`});
    this.dust=new THREE.Points(geometry,material);this.dust.name="CommandRoomWindowDust";
    this.scene.add(this.dust);return this.dust;
  }
  Render(camera,time) {
    const r=this.renderer;r.getDrawingBufferSize(this.size);
    const width=Math.max(1,this.size.x),height=Math.max(1,this.size.y);
    if(this.colorTarget.width!==width||this.colorTarget.height!==height){
      this.colorTarget.setSize(width,height);
      this.volumeTarget.setSize(Math.max(1,Math.round(width*this.data.resolutionScale)),Math.max(1,Math.round(height*this.data.resolutionScale)));
      this.compositeMaterial.uniforms.volumeTexel.value.set(1/this.volumeTarget.width,1/this.volumeTarget.height);
      this.compositeMaterial.uniforms.colorTexel.value.set(1/width,1/height);
    }
    camera.updateMatrixWorld(true);
    if(this.shadowDirty){
      const override=this.scene.overrideMaterial,background=this.scene.background;
      const dustVisible=this.dust?.visible;
      try{
        if(this.dust)this.dust.visible=false;
        this.scene.overrideMaterial=this.depthMaterial;this.scene.background=null;
        r.setRenderTarget(this.shadowTarget);r.clear();r.render(this.scene,this.lightCamera);
        this.shadowDirty=false;
      }finally{this.scene.overrideMaterial=override;this.scene.background=background;if(this.dust)this.dust.visible=dustVisible;}
    }
    if(this.dust){this.dust.material.uniforms.clock.value=time;this.dust.material.uniforms.pixelHeight.value=height;}
    const u=this.volumeMaterial.uniforms;
    u.clock.value=time;u.inverseProjection.value.copy(camera.projectionMatrixInverse);
    u.cameraWorld.value.copy(camera.matrixWorld);camera.getWorldPosition(u.eye.value);
    this.compositeMaterial.uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
    r.setRenderTarget(this.colorTarget);r.render(this.scene,camera);
    this.quad.material=this.volumeMaterial;r.setRenderTarget(this.volumeTarget);r.render(this.quadScene,this.quadCamera);
    this.quad.material=this.compositeMaterial;r.setRenderTarget(null);r.render(this.quadScene,this.quadCamera);
  }
  Dispose(){
    this.colorTarget.dispose();this.volumeTarget.dispose();this.shadowTarget.dispose();this.depthMaterial.dispose();
    this.volumeMaterial.dispose();this.compositeMaterial.dispose();this.quad.geometry.dispose();
  }
}
