// Readback-only browser QA. The mask borrows evaluated matrices, restores all
// materials and does not become a production render pass.
import * as THREE from 'three';
export function MeasureHanYangPixels(game){
 const renderer=game.renderer,ldr=game.post.targets.ldr;
 // Default whitebox writes directly to the canvas, not the unused LDR target.
 // Read synchronously after StepFrames, before drawing the temporary mask.
 const screen=game.post.whiteboxConfig&&!game.post.whiteboxConfig.fxaa&&game.post.whiteboxPasses.has('whiteboxOutput');
 const size=screen?renderer.getDrawingBufferSize(new THREE.Vector2()):null,w=screen?size.x:ldr.width,h=screen?size.y:ldr.height;
 const color=new Uint8Array(w*h*4);
 if(screen){const gl=renderer.getContext();gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,color);}
 else renderer.readRenderTargetPixels(ldr,0,0,w,h,color);
 const red=new THREE.MeshBasicMaterial({color:0xff0000,toneMapped:false}),green=new THREE.MeshBasicMaterial({color:0x00ff00,toneMapped:false}),black=new THREE.MeshBasicMaterial({color:0,toneMapped:false});
 const scene=new THREE.Scene();scene.matrixWorldAutoUpdate=false;scene.children.push(game.viewmodel.root);
 const target=new THREE.WebGLRenderTarget(w,h,{type:THREE.UnsignedByteType,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});
 const previousTarget=renderer.getRenderTarget(),previousColor=renderer.getClearColor(new THREE.Color()),previousAlpha=renderer.getClearAlpha(),saved=[];
 const mask=new Uint8Array(w*h*4);
 try{
  game.viewmodel.root.traverse(o=>{if(!o.isMesh)return;saved.push([o,o.material]);o.material=o.userData.hanYang173RPart?(o.userData.weaponSurface==='wood'?green:red):black;});
  renderer.setRenderTarget(target);renderer.setClearColor(0,1);renderer.clear();renderer.render(scene,game.camera);renderer.readRenderTargetPixels(target,0,0,w,h,mask);
 }finally{
  for(const [o,m]of saved)o.material=m;renderer.setRenderTarget(previousTarget);renderer.setClearColor(previousColor,previousAlpha);
  target.dispose();red.dispose();green.dispose();black.dispose();scene.children.length=0;
 }
 const result={};
 for(const [name,c]of [['metal',0],['wood',1]]){
  const values=[];for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){
   if([[0,0],[-2,0],[2,0],[0,-2],[0,2]].some(([dx,dy])=>mask[((y+dy)*w+x+dx)*4+c]<250))continue;
   const p=(y*w+x)*4;values.push(.2126*color[p]+.7152*color[p+1]+.0722*color[p+2]);
  }
  values.sort((a,b)=>a-b);result[name]={pixels:values.length,p10:values[Math.floor(values.length*.1)],p50:values[Math.floor(values.length*.5)],p90:values[Math.floor(values.length*.9)],p95:values[Math.floor(values.length*.95)],blackFraction:values.filter(v=>v<8).length/values.length};
 }
 return result;
}
