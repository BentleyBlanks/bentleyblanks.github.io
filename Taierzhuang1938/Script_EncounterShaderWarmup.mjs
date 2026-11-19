import {QUAD_CAMERA} from "./Script_PostCommon.mjs";
import {OverrideKind} from "./Script_OverrideVariants.mjs";
import {GetActiveAtmosphere} from "./Script_Atmosphere.mjs";
import {Group} from "three";

// Submit with the same scene, object type and framebuffer as the actual pass.
// The normal shader warmup polls this shared program list before the first draw.
export function SubmitEncounterPrograms(host) {
  const {post:p,renderer}=host, blitter=p.blitter;
  const target=renderer.getRenderTarget(),face=renderer.getActiveCubeFace(),mip=renderer.getActiveMipmapLevel();
  const saved=blitter.mesh.material, before=renderer.info.programs.length;
  function SubmitBlit(mat,rt) {
    if(!mat||!rt)return;
    blitter.mesh.material=mat;
    renderer.setRenderTarget(rt);
    renderer.compile(blitter.scene,QUAD_CAMERA);
  }
  try {
    const a=p.gtaoPass,s=p.ssrPass,v=p.volumetricsPass,c=p.contactShadowsPass;
    const b=p.bloomPass,m=p.motionBlurPass,e=p.exposurePass;
    const atmosphere=GetActiveAtmosphere();
    if(atmosphere) {
      SubmitBlit(atmosphere.skyViewMaterial,atmosphere.skyViewTarget);
      SubmitBlit(atmosphere.aerialMaterial,atmosphere.aerialTarget);
    }
    SubmitBlit(p.prepassPass.matHzb,p.prepassPass.hzbLevels?.[0]);
    SubmitBlit(a.materialTrace,a.raw);SubmitBlit(a.materialTemporal,a.history?.[0]);SubmitBlit(a.materialBlur,a.blurOut);
    SubmitBlit(a.materialHistory,a.colorHistory);
    SubmitBlit(s.materialHiz,s.hizLevels?.[0]);SubmitBlit(s.materialTrace,s.hit);
    SubmitBlit(s.materialResolve,s.resolve);SubmitBlit(s.materialTemporal,s.historyA);
    SubmitBlit(p.ssrColorPass.material,p.ssrColorPass.target);
    SubmitBlit(c.material,c.raw);SubmitBlit(c.materialBlur,c.blur);SubmitBlit(c.materialCompose,c.combined);
    SubmitBlit(v.materialInject,v.volumeA);SubmitBlit(v.materialIntegrate,v.integrated);SubmitBlit(v.materialApply,v.fogScatter);
    SubmitBlit(p.taaPass.material,p.targets.taaA);
    SubmitBlit(m.matTile,m.tileX);SubmitBlit(m.matNeighbor,m.neighbor);
    SubmitBlit(m.material,m.blurTarget||m.target);SubmitBlit(m.matResolve,m.blurTarget&&m.target);
    SubmitBlit(b.matBright,b.bright);SubmitBlit(b.matDown,b.mips?.[0]);SubmitBlit(b.matUp,b.mips?.[1]);
    SubmitBlit(p.godRaysPass.material,p.godRaysPass.target);SubmitBlit(p.lensFlarePass.material,p.lensFlarePass.target);
    SubmitBlit(e.matLum,e.lumTarget);SubmitBlit(e.matRows,e.binsTarget);SubmitBlit(e.matState,e.stateTargets?.[0]);
    if(e.histTarget){renderer.setRenderTarget(e.histTarget);renderer.compile(e.pointScene,QUAD_CAMERA);}
    SubmitBlit(p.compositePass.material,p.compositePass.target);
    // The final blit writes the display colour space.
    blitter.mesh.material=p.fxaaPass.material;
    renderer.setRenderTarget(null);renderer.compile(blitter.scene,QUAD_CAMERA);

    const shadow=host.ctx.firstPersonSelfShadow;
    if(shadow?.enabled&&shadow.target) {
      renderer.setRenderTarget(shadow.target);
      const kinds=new Set();
      host.viewmodel.root.traverse(object=>{
        if(!object.isMesh)return;
        const kind=OverrideKind(object,object.geometry);
        if(kinds.has(kind))return;
        kinds.add(kind);
        const proxy=Object.create(object);
        proxy.children=[];proxy.material=shadow.depthVariants.For(object,object.geometry);
        renderer.compile(proxy,shadow.shadowCamera,shadow._depthScene);
      });
    }
  } finally {
    blitter.mesh.material=saved;
    renderer.setRenderTarget(target,face,mip);
  }
  return renderer.info.programs.length-before;
}

// The frame normally creates the soldiers' instanced attachment meshes immediately
// before drawing them. Compile those meshes with the actual HDR lights; compiling
// their individual source rifles does not cover USE_INSTANCING.
export function SubmitEncounterActorPrograms(host) {
  const {renderer,scene,camera,post}=host, batch=host.ctx.actorBatch;
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld();
  batch?.Update(camera);
  const color=new Group();
  for(const group of batch?.groups.values()||[]) {
    for(const mesh of Object.values(group.meshes))if(mesh?.visible&&mesh.count)color.children.push(mesh);
  }
  const before=renderer.info.programs.length;
  if(color.children.length)host.ctx.CompileAsRendered(color,"encounterAttachments");

  const pass=post.prepassPass;
  if(pass.target) {
    const depth=new Group(),seen=new Set(),previous=renderer.getRenderTarget();
    const face=renderer.getActiveCubeFace(),mip=renderer.getActiveMipmapLevel();
    scene.traverse(object=>{
      if(!object.isMesh)return;
      const kind=OverrideKind(object,object.geometry);
      if(seen.has(kind))return;
      seen.add(kind);
      const proxy=Object.create(object);
      proxy.children=[];proxy.material=pass.variants.For(object,object.geometry);
      depth.children.push(proxy);
    });
    try {
      renderer.setRenderTarget(pass.target);
      renderer.compile(depth,camera,scene);
    } finally {renderer.setRenderTarget(previous,face,mip);}
  }
  return renderer.info.programs.length-before;
}
