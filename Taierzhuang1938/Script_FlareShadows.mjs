// Shadow-only cameras never join scene lights: no PBR sampler or light define.
// Native depth rendering preserves skinned/cutout/destruction caster contracts.
import * as THREE from "three";
import { FLARE_SHADOW as CFG } from "./Data_Tuning_FlareEffects.mjs";
import { MakeFullscreenMaterial, QUAD_GEOMETRY, QUAD_CAMERA } from "./Script_PostCommon.mjs";

export class FlareShadowsPass {
  constructor(pipeline) {
    this.name="flareShadows";this.pipeline=pipeline;this.slots=[];this.pending=null;
    this.serial=0;this.stats={maps:0,updates:0,calls:0,triangles:0};
    this.packUniforms={uDepth:{value:null},uNearFar:{value:new THREE.Vector2()}};
  }
  Resize() {} // map size is independent of screen resolution
  SetSource(lightRig){this.lightRig=lightRig;}
  Prepare(ctx) {
    const cluster=this.lightRig?.clustered;
    if(this.cluster&&this.cluster!==cluster)this.Idle();
    this.cluster=cluster;this.pending=null;
    if(!cluster)return;
    for(const info of cluster.uniforms.uFlareShadowInfo.value)info.w=0;
    if(!ctx.preset.flareShadows||!ctx.renderer.shadowMap.enabled||!this.pipeline.hdrCapable
      ||!ctx.renderer.extensions.has('EXT_color_buffer_float'))return;
    this.EnsureResources();
    const candidates=[];
    for(let i=0;i<cluster.activeCount;i++) {
      const source=cluster.sourceShadow[cluster.selected[i]];
      if(source)candidates.push({source,index:i});
    }
    const chosen=candidates.slice(0,CFG.slots);
    for(const slot of this.slots) {
      if(!chosen.some(c=>c.source===slot.source)){slot.source=null;slot.valid=false;}
    }
    for(const candidate of chosen) {
      let slot=this.slots.find(s=>s.source===candidate.source);
      if(!slot){slot=this.slots.find(s=>!s.source);slot.source=candidate.source;slot.valid=false;slot.last=-1;}
      slot.index=candidate.index;
      if(!this.pending||slot.last<this.pending.last)this.pending=slot;
    }
    this.stats.maps=chosen.length;
    // Previous map stays in its own world-space frame, then converts CURRENT view.
    for(const slot of this.slots)if(slot.source&&slot.valid)this.Publish(slot,ctx);
  }
  Enabled(){return !!this.pending;}
  EnsureResources() {
    if(this.slots.length)return;
    this.dummyScene=new THREE.Scene();
    this.dummyMaterial=MakeFullscreenMaterial('void main(){gl_FragColor=vec4(0.);}',{});
    this.dummyMaterial.colorWrite=false;
    this.dummyMesh=new THREE.Mesh(QUAD_GEOMETRY,this.dummyMaterial);
    this.dummyMesh.frustumCulled=false;this.dummyScene.add(this.dummyMesh);
    this.dummyTarget=new THREE.WebGLRenderTarget(1,1,{depthBuffer:false});
    const rows=CFG.size*CFG.size/(1024*4);
    this.packedTarget=new THREE.WebGLRenderTarget(1024,rows,{type:THREE.FloatType,
      minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:false});
    this.packMaterial=MakeFullscreenMaterial(`
      uniform sampler2D uDepth;
      uniform vec2 uNearFar;
      float ReadDepth(int index){
        float d=texelFetch(uDepth,ivec2(index%${CFG.size},index/${CFG.size}),0).r;
        return uNearFar.x*uNearFar.y/(uNearFar.y-d*(uNearFar.y-uNearFar.x));
      }
      void main(){
        int i=(int(gl_FragCoord.y)*1024+int(gl_FragCoord.x))*4;
        gl_FragColor=vec4(ReadDepth(i),ReadDepth(i+1),ReadDepth(i+2),ReadDepth(i+3));
      }`,this.packUniforms);
    this.copyOffset=new THREE.Vector2();
    for(let i=0;i<CFG.slots;i++) {
      const light=new THREE.SpotLight(0xffffff,0,1,CFG.angle);
      light.castShadow=true;light.shadow.autoUpdate=false;
      light.shadow.mapSize.set(CFG.size,CFG.size);light.shadow.camera.near=CFG.nearM;
      light.shadow.camera.up.set(0,0,1);
      this.slots.push({id:i,light,source:null,valid:false,last:-1,matrix:new THREE.Matrix4()});
    }
  }
  Publish(slot,ctx) {
    const cluster=this.cluster;
    cluster.lightData[slot.index*16+7]=-slot.id-1;
    cluster.uniforms.uFlareShadowMatrix.value[slot.id].multiplyMatrices(slot.matrix,ctx.camera.matrixWorld);
    cluster.uniforms.uFlareShadowInfo.value[slot.id].set(
      cluster.shadowBase+slot.id*CFG.size*CFG.size/4,CFG.biasM,0,1);
  }
  Render(ctx) {
    const slot=this.pending,renderer=ctx.renderer,light=slot.light;
    const oldTarget=renderer.getRenderTarget(),oldFace=renderer.getActiveCubeFace(),oldLevel=renderer.getActiveMipmapLevel();
    const auto=renderer.shadowMap.autoUpdate,needed=renderer.shadowMap.needsUpdate;
    const infoAuto=renderer.info.autoReset;renderer.info.autoReset=false;
    const calls=renderer.info.render.calls,triangles=renderer.info.render.triangles;
    light.position.copy(slot.source.position);
    light.target.position.copy(light.position);light.target.position.y-=1;
    const height=Math.max(4,light.position.y-ctx.camera.position.y);
    light.angle=Math.min(CFG.angle,Math.atan2(CFG.receiverRadiusM,height));
    light.distance=Math.min(slot.source.currentRadius,Math.hypot(height,CFG.receiverRadiusM)+CFG.depthMarginM);
    light.updateMatrixWorld();light.target.updateMatrixWorld();
    light.shadow.needsUpdate=true;
    this.dummyMesh.onBeforeRender=()=>{
      renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
      renderer.shadowMap.render([light],ctx.scene,ctx.camera);
    };
    try {
      // shadowMap.render requires an active WebGLRenderState; the dummy render
      // establishes one without contributing a light or a visible draw.
      renderer.setRenderTarget(this.dummyTarget);renderer.render(this.dummyScene,QUAD_CAMERA);
      this.packUniforms.uDepth.value=light.shadow.map.depthTexture;
      this.packUniforms.uNearFar.value.set(light.shadow.camera.near,light.shadow.camera.far);
      ctx.blitter.Blit(this.packMaterial,this.packedTarget);
      slot.matrix.multiplyMatrices(light.shadow.camera.projectionMatrix,light.shadow.camera.matrixWorldInverse);
      slot.valid=true;slot.last=this.serial++;
      this.Publish(slot,ctx);
      this.cluster.UploadMetadata();
      renderer.initTexture(this.cluster.dataTexture);
      this.copyOffset.set(0,(this.cluster.shadowBase+slot.id*CFG.size*CFG.size/4)/1024);
      renderer.copyTextureToTexture(this.packedTarget.texture,this.cluster.dataTexture,null,this.copyOffset);
      this.stats.updates++;
      this.stats.calls=renderer.info.render.calls-calls;
      this.stats.triangles=renderer.info.render.triangles-triangles;
    } finally {
      this.dummyMesh.onBeforeRender=()=>{};
      renderer.setRenderTarget(oldTarget,oldFace,oldLevel);
      renderer.shadowMap.autoUpdate=auto;renderer.shadowMap.needsUpdate=needed;
      renderer.info.autoReset=infoAuto;
    }
  }
  Idle() {
    if(this.cluster)for(const info of this.cluster.uniforms.uFlareShadowInfo.value)info.w=0;
    this.pending=null;this.stats.maps=0;
    for(const slot of this.slots){slot.source=null;slot.valid=false;}
  }
  Dispose() {
    this.Idle();
    for(const slot of this.slots)slot.light.shadow.dispose();
    this.slots.length=0;
    this.dummyMaterial?.dispose();this.dummyTarget?.dispose();this.packedTarget?.dispose();this.packMaterial?.dispose();
  }
}
