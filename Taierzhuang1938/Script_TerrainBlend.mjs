// Opaque mesh/terrain material blending. Capture the visible soil (including its
// raised crust and crater tiles) before the normal/depth prepass and main shading.
import * as THREE from 'three';
import { MakeRenderTarget } from './Script_PostCommon.mjs';

// Draws are synchronous. Each pipeline publishes its own targets before consumers
// run; Idle clears validity, so another scene cannot inherit a previous terrain.
export const TerrainBlendUniforms = {
  uTerrainCapture: { value: 0 },
  uTerrainBlendValid: { value: 0 },
  uTerrainBlendColor: { value: null },
  uTerrainBlendNormalDepth: { value: null },
  uTerrainBlendSize: { value: new THREE.Vector2(1, 1) },
};

export const TERRAIN_BLEND_GLSL = /* glsl */`
uniform float uTerrainBlendValid;
uniform sampler2D uTerrainBlendNormalDepth;
uniform vec2 uTerrainBlendSize;
uniform float uTerrainBlendWidth;
float TerrainBlendMask(vec4 soil, vec3 viewPosition) {
  float separation=soil.w-viewPosition.z;
  // Convert view-Z separation to metres along the sampled soil normal. Reject
  // empty/background pixels and geometry in front of the receiver.
  if(uTerrainBlendValid<.5 || soil.w<=0.0 || separation<-.015)return 0.0;
  float normalDistance=max(separation,0.0)*max(abs(dot(normalize(soil.xyz),normalize(viewPosition))),.15)
    /max(normalize(viewPosition).z,.1);
  return 1.0-smoothstep(.008,uTerrainBlendWidth,normalDistance);
}`;

export class TerrainBlendPass {
  constructor(pipeline) {
    this.name='terrainBlend';this.pipeline=pipeline;
    this.scene=new THREE.Scene();this.proxies=new Map();this.target=null;
    this.sources=[];this.savedClear=new THREE.Color();
  }
  Prepare(ctx) {
    this.sources.length=0;
    ctx.scene.traverseVisible(object=>{
      if(object.isMesh && !object.isInstancedMesh && object.material?.userData.terrainBlendSource)
        this.sources.push(object);
    });
  }
  Enabled(){return !!(this.pipeline.preset.terrainBlend && this.pipeline.hdrCapable && this.sources.length);}
  Idle(ctx){
    if(ctx)ctx.terrainBlend=null;
    TerrainBlendUniforms.uTerrainBlendValid.value=0;
    TerrainBlendUniforms.uTerrainBlendColor.value=null;
    TerrainBlendUniforms.uTerrainBlendNormalDepth.value=null;
    if(!this.sources.length){this.proxies.clear();this.scene.clear();}
  }
  Resize(width,height){
    this.width=width;this.height=height;
    if(this.target){this.target.dispose();this.target=null;}
    this.Idle();
  }
  Render(ctx) {
    const renderer=ctx.renderer;
    if(!this.target){
      this.target=MakeRenderTarget(this.width,this.height,{count:2,depthBuffer:true,
        type:THREE.HalfFloatType,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});
      this.target.textures[0].name='terrainAlbedoRoughness';
      this.target.textures[1].name='terrainNormalDepth';
    }
    for(const proxy of this.proxies.values())proxy.visible=false;
    for(const source of this.sources){
      let proxy=this.proxies.get(source);
      if(!proxy){
        // Reuse the actual shader, including crater surface overrides. Neither
        // source geometry nor material is owned by this pass or disposed here.
        proxy=new THREE.Mesh(source.geometry,source.material);
        proxy.matrixAutoUpdate=false;this.proxies.set(source,proxy);this.scene.add(proxy);
      }
      source.updateWorldMatrix(true,false);
      proxy.geometry=source.geometry;proxy.material=source.material;
      proxy.matrix.copy(source.matrixWorld);proxy.visible=true;
      proxy.frustumCulled=source.frustumCulled;proxy.layers.mask=source.layers.mask;
    }
    for(const [source,proxy] of this.proxies)if(!proxy.visible){this.scene.remove(proxy);this.proxies.delete(source);}
    const previous=renderer.getRenderTarget(),alpha=renderer.getClearAlpha();
    renderer.getClearColor(this.savedClear);
    const shadowAuto=renderer.shadowMap.autoUpdate;
    TerrainBlendUniforms.uTerrainCapture.value=1;
    TerrainBlendUniforms.uTerrainBlendValid.value=0;
    try{
      renderer.shadowMap.autoUpdate=false;
      renderer.setRenderTarget(this.target);renderer.setClearColor(0,0);renderer.clear();
      renderer.render(this.scene,ctx.camera);
    }finally{
      TerrainBlendUniforms.uTerrainCapture.value=0;
      renderer.shadowMap.autoUpdate=shadowAuto;
      renderer.setClearColor(this.savedClear,alpha);renderer.setRenderTarget(previous);
    }
    TerrainBlendUniforms.uTerrainBlendColor.value=this.target.textures[0];
    TerrainBlendUniforms.uTerrainBlendNormalDepth.value=this.target.textures[1];
    TerrainBlendUniforms.uTerrainBlendSize.value.set(this.width,this.height);
    TerrainBlendUniforms.uTerrainBlendValid.value=1;
    ctx.terrainBlend=this.target;
  }
  Dispose(){this.Idle();this.target?.dispose();this.target=null;this.proxies.clear();this.scene.clear();}
}
