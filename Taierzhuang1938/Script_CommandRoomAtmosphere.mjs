import * as THREE from "three";
import {ParticleEffects} from "./Script_ParticleEffects.mjs";
import {CreateParticleEnvironment} from "./Script_ParticleEnvironment.mjs";

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
uniform sampler2D panelColor;uniform float panelMix;
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
  for(int i=0;i<24;i++){
    float angle=float(i)*2.39996323;
    vec2 q=uv+vec2(cos(angle),sin(angle))*sqrt((float(i)+.5)/24.)*radius*colorTexel;
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
  vec3 room=mix(FocusColor(screenUv),texture2D(panelColor,screenUv).rgb,panelMix);
  gl_FragColor=vec4(room+fog/max(total,1e-5),1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const PANEL_BLUR = `varying vec2 screenUv;uniform sampler2D sourceColor;uniform vec2 axis;
void main(){
  vec3 c=texture2D(sourceColor,screenUv).rgb*.227027;
  c+=(texture2D(sourceColor,screenUv+axis).rgb+texture2D(sourceColor,screenUv-axis).rgb)*.1945946;
  c+=(texture2D(sourceColor,screenUv+axis*2.).rgb+texture2D(sourceColor,screenUv-axis*2.).rgb)*.1216216;
  c+=(texture2D(sourceColor,screenUv+axis*3.).rgb+texture2D(sourceColor,screenUv-axis*3.).rgb)*.054054;
  c+=(texture2D(sourceColor,screenUv+axis*4.).rgb+texture2D(sourceColor,screenUv-axis*4.).rgb)*.016216;
  gl_FragColor=vec4(c,1.);
}`;

export class CommandRoomAtmosphere {
  constructor(renderer, scene, data, depthOfField={focus:3.15,range:1.55,aperture:2.3,maxRadius:2.2}) {
    this.renderer=renderer; this.scene=scene; this.data=data; this.shadowDirty=true;
    this.panelFocus=0;this.panelBlur=depthOfField.panelBlur || 0;
    this.size=new THREE.Vector2();
    this.colorTarget=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:true,samples:2});
    this.colorTarget.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
    this.volumeTarget=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:false,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});
    this.blurTargets=[0,1].map(()=>new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:false}));
    this.blurMaterial=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,
      vertexShader:VERTEX,fragmentShader:PANEL_BLUR,uniforms:{sourceColor:{value:this.colorTarget.texture},axis:{value:new THREE.Vector2()}}});
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
        panelColor:{value:this.blurTargets[1].texture},panelMix:{value:0},
        volumeColor:{value:this.volumeTarget.texture},volumeTexel:{value:new THREE.Vector2()},inverseProjection:{value:new THREE.Matrix4()},
        colorTexel:{value:new THREE.Vector2()},dof:{value:new THREE.Vector4(depthOfField.focus,depthOfField.range,depthOfField.aperture,depthOfField.maxRadius)}}});
    this.quadScene=new THREE.Scene();this.quadCamera=new THREE.Camera();
    this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.volumeMaterial);
    this.quad.frustumCulled=false;this.quadScene.add(this.quad);
  }
  SetPanelFocus(value){this.panelFocus=THREE.MathUtils.clamp(value,0,1);this.compositeMaterial.uniforms.panelMix.value=this.panelFocus;}
  BuildDust(data) {
    this.particleEnvironment=CreateParticleEnvironment();const shared=this.particleEnvironment.shared;
    Object.assign(shared,{uParticleLightDepth:this.lightUniforms.lightDepth,uParticleLightMatrix:this.lightUniforms.lightMatrix,
      uParticleLightBias:this.lightUniforms.shadowBias,uParticleLightTexel:this.lightUniforms.shadowTexel,uParticleLightValid:{value:1}});
    this.particles=new ParticleEffects(this.scene,shared,'high');
    const origin=this.volumeMaterial.uniforms.origin.value,direction=this.volumeMaterial.uniforms.direction.value;
    this.dustId=this.particles.Create({preset:'WindowDust',name:'CommandRoom/WindowDust',position:origin.toArray(),modules:{
      main:{maxParticles:data.count,startSize:{mode:'twoConstants',min:data.size*.5,max:data.size},startColor:[...new THREE.Color(data.color).toArray(),data.opacity]},
      emission:{rateOverTime:data.count/120},shape:{box:[this.data.size[0]*.94,this.data.size[1]*.94,this.data.length],direction:direction.toArray()},noise:{strength:data.drift},
    }}).id;
    this.dust=this.particles.renderer.pools.windowMote.mesh;this.dust.name='CommandRoomWindowDust';this.lastDustTime=0;return this.dust;
  }

  Render(camera,time) {
    const r=this.renderer;r.getDrawingBufferSize(this.size);
    const width=Math.max(1,this.size.x),height=Math.max(1,this.size.y);
    if(this.colorTarget.width!==width||this.colorTarget.height!==height){
      this.colorTarget.setSize(width,height);
      this.volumeTarget.setSize(Math.max(1,Math.round(width*this.data.resolutionScale)),Math.max(1,Math.round(height*this.data.resolutionScale)));
      for(const target of this.blurTargets)target.setSize(Math.max(1,Math.ceil(width/2)),Math.max(1,Math.ceil(height/2)));
      this.compositeMaterial.uniforms.volumeTexel.value.set(1/this.volumeTarget.width,1/this.volumeTarget.height);
      const pixelScale=height/Math.max(1,r.domElement.clientHeight || height);
      this.compositeMaterial.uniforms.colorTexel.value.set(pixelScale/width,pixelScale/height);
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
    if(this.particles){
      this.particleEnvironment.shared.uResolution.value.set(width,height);
      if(time<this.lastDustTime){this.particles.Simulate(this.dustId,120);this.particles.Play(this.dustId);this.lastDustTime=0;}
      let dt=Math.max(0,time-this.lastDustTime);while(dt>0){const step=Math.min(120,dt);this.particles.Update(step);dt-=step;}
      this.lastDustTime=time;
    }
    const u=this.volumeMaterial.uniforms;
    u.clock.value=time;u.inverseProjection.value.copy(camera.projectionMatrixInverse);
    u.cameraWorld.value.copy(camera.matrixWorld);camera.getWorldPosition(u.eye.value);
    this.compositeMaterial.uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
    r.setRenderTarget(this.colorTarget);r.render(this.scene,camera);
    if(this.panelFocus>.001){
      const pixelScale=height/Math.max(1,r.domElement.clientHeight || height);
      const radius=this.panelBlur*this.panelFocus*.5*pixelScale;
      const blur=this.blurMaterial.uniforms;this.quad.material=this.blurMaterial;
      blur.sourceColor.value=this.colorTarget.texture;blur.axis.value.set(radius/width,0);
      r.setRenderTarget(this.blurTargets[0]);r.render(this.quadScene,this.quadCamera);
      blur.sourceColor.value=this.blurTargets[0].texture;blur.axis.value.set(0,radius/height);
      r.setRenderTarget(this.blurTargets[1]);r.render(this.quadScene,this.quadCamera);
    }
    this.quad.material=this.volumeMaterial;r.setRenderTarget(this.volumeTarget);r.render(this.quadScene,this.quadCamera);
    this.quad.material=this.compositeMaterial;r.setRenderTarget(null);r.render(this.quadScene,this.quadCamera);
  }
  Dispose(){
    this.particles?.Dispose();this.particleEnvironment?.Dispose();
    this.colorTarget.dispose();this.volumeTarget.dispose();this.shadowTarget.dispose();this.depthMaterial.dispose();
    this.volumeMaterial.dispose();this.compositeMaterial.dispose();this.quad.geometry.dispose();
    for(const target of this.blurTargets)target.dispose();this.blurMaterial.dispose();
  }
}
