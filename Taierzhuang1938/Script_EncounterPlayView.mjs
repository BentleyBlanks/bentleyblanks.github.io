import * as THREE from "three";
import { CreateEditorLiteBlit } from "./Script_CameraProfile.mjs";

// Observer renders the same world, without stepping animation, physics or sound.
// Multi-viewport observer uses CAMERA_PROFILES.editorLite via CreateEditorLiteBlit (renders linear HDR
// reusing main viewport's prewarmed NoToneMapping shaders, then single-pass Three.js ACESFilmic blit)
// so dual-viewport inspection avoids both duplicating PostPipeline and recompiling scene shaders.
// Presentation canvases capture each completed view before the next camera draws.
export class EncounterPlayView {
  constructor(host) {
    this.host=host;this.count=1;this.mode="follow";this.target="player";this.drag=null;this.keys=new Set();this.focused=false;
    this.camera=new THREE.PerspectiveCamera(60,1,0.06,1500);
    this.yaw=0.6;this.pitch=0.95;this.distance=18;
    this.pane=document.createElement("section");this.pane.className="encounterObserver";this.pane.hidden=true;
    this.bar=document.createElement("div");
    this.select=document.createElement("select");
    for(const [id,name] of [["player","顺子"],["luo","班长"],["winter","冬瓜"],["tank1","头车"]]) {
      const option=document.createElement("option");option.value=id;option.textContent=name;this.select.append(option);
    }
    this.select.onchange=()=>{this.target=this.select.value;this.mode="follow";};
    this.reset=document.createElement("button");this.reset.textContent="跟拍";
    this.reset.onclick=()=>{this.mode="follow";this.distance=18;};
    this.free=document.createElement("button");this.free.textContent="自由观察";this.free.onclick=()=>{this.mode="free";this.canvas.focus();};
    this.bar.append(this.select,this.reset,this.free);
    this.canvas=document.createElement("canvas");this.canvas.tabIndex=0;
    this.canvas.setAttribute("aria-label","Play 观察视口");
    this.primary=document.createElement("canvas");this.primary.className="encounterPrimary";this.primary.hidden=true;
    document.body.append(this.primary);
    this.pane.append(this.bar,this.canvas);document.body.append(this.pane);
    this.pane.addEventListener("mousedown",e=>e.stopPropagation());
    this.pane.addEventListener("mouseup",e=>e.stopPropagation());
    this.onMainFocus=()=>{this.focused=false;this.keys.clear();this.canvas.blur();};
    this.host.canvas.addEventListener("pointerdown",this.onMainFocus);
    this.canvas.addEventListener("contextmenu",e=>e.preventDefault());
    this.canvas.title="O 切换玩家／观察 · 右键旋转 · WASD 移动 · Q/E 升降 · 中键平移 · 滚轮缩放";
    this.canvas.addEventListener("focus",()=>{this.focused=true;});
    this.canvas.addEventListener("blur",()=>{this.focused=false;this.keys.clear();this.drag=null;});
    this.canvas.addEventListener("keydown",e=>{if(["KeyW","KeyA","KeyS","KeyD","KeyQ","KeyE","ShiftLeft"].includes(e.code)){e.stopPropagation();e.preventDefault();this.keys.add(e.code);this.mode="free";}});
    this.canvas.addEventListener("keyup",e=>{this.keys.delete(e.code);e.stopPropagation();});
    this.canvas.addEventListener("pointerdown",e=>{e.stopPropagation();this.canvas.focus();this.drag={x:e.clientX,y:e.clientY,button:e.button};this.canvas.setPointerCapture(e.pointerId);});
    this.canvas.addEventListener("pointerup",()=>{this.drag=null;});
    this.canvas.addEventListener("pointercancel",()=>{this.drag=null;});
    this.canvas.addEventListener("pointermove",e=>{
      if(!this.drag)return;e.stopPropagation();
      const x=e.clientX-this.drag.x,y=e.clientY-this.drag.y;
      if(this.drag.button===1) {
        this.mode="free";
        const right=new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld,0);
        this.camera.position.addScaledVector(right,-x*0.04);this.camera.position.y+=y*0.04;
      } else {this.yaw-=x*0.006;this.pitch=Math.max(-1.4,Math.min(1.4,this.pitch+y*0.006));}
      this.drag.x=e.clientX;this.drag.y=e.clientY;
    });
    this.canvas.addEventListener("wheel",e=>{e.preventDefault();e.stopPropagation();if(this.mode==="free")this.camera.position.addScaledVector(this.camera.getWorldDirection(new THREE.Vector3()),-e.deltaY*.02);else this.distance=Math.max(3,Math.min(120,this.distance*Math.exp(e.deltaY*0.001)));},{passive:false});
  }
  SetLayout(count) {
    this.count=count===2?2:1;this.pane.hidden=this.count!==2;
    this.primary.hidden=this.count!==2;
    document.body.classList.toggle("encounterDual",this.count===2);
    this.host.ai.view.SetObserverCameras(this.count===2?[this.camera]:[]);
    this.host.ctx.ApplyGraphics();
  }
  Size(){return {width:Math.max(1,Math.floor(window.innerWidth/(this.count===2?2:1))),height:window.innerHeight};}
  Update(resolve,dt=0) {
    const target=resolve(this.target)||this.host.player.position;
    if(this.mode==="follow")this.camera.position.set(target.x+Math.sin(this.yaw)*Math.cos(this.pitch)*this.distance,
      target.y+1+Math.sin(this.pitch)*this.distance,target.z+Math.cos(this.yaw)*Math.cos(this.pitch)*this.distance);
    if(this.mode==="follow")this.camera.lookAt(target.x,target.y+1,target.z);
    else {
      const forward=new THREE.Vector3(-Math.sin(this.yaw)*Math.cos(this.pitch),-Math.sin(this.pitch),-Math.cos(this.yaw)*Math.cos(this.pitch));
      const right=new THREE.Vector3().crossVectors(forward,new THREE.Vector3(0,1,0)).normalize();
      const speed=(this.keys.has("ShiftLeft")?24:8)*dt;
      this.camera.position.addScaledVector(forward,((this.keys.has("KeyW")?1:0)-(this.keys.has("KeyS")?1:0))*speed);
      this.camera.position.addScaledVector(right,((this.keys.has("KeyD")?1:0)-(this.keys.has("KeyA")?1:0))*speed);
      this.camera.position.y+=((this.keys.has("KeyE")?1:0)-(this.keys.has("KeyQ")?1:0))*speed;
      this.camera.lookAt(this.camera.position.clone().add(forward));
    }
    this.camera.updateMatrixWorld();
  }
  State(){return {count:this.count,mode:this.mode,target:this.target,camera:this.camera.position.toArray(),direction:this.camera.getWorldDirection(new THREE.Vector3()).toArray(),calls:this.renderer?.info.render.calls,triangles:this.renderer?.info.render.triangles};}
  Render(dt,options,before,after) {
    if(this.count!==2)return;
    this.host.ctx.frameDebugger?.SetViewport("视口 2 · 观察视角");
    if(!this.renderer) {
      this.renderer=this.host.renderer;
      this.editorLiteBlit=CreateEditorLiteBlit();
    }
    const width=Math.max(1,this.canvas.clientWidth),height=Math.max(1,this.canvas.clientHeight);
    const source=this.renderer.domElement;
    if(this.canvas.width!==width||this.canvas.height!==height) {
      this.canvas.width=width;this.canvas.height=height;
      this.camera.aspect=width/height;this.camera.updateProjectionMatrix();
    }
    if(this.primary.width!==source.width||this.primary.height!==source.height){this.primary.width=source.width;this.primary.height=source.height;}
    this.primary.getContext("2d").drawImage(source,0,0);
    const restore=this.host.ctx.SuspendScreenSpaceForProbe();
    const saved=this.host.viewmodel.root.visible,body=this.host.viewmodel.body?.root;
    const bodyVisible=body?.visible;
    this.host.viewmodel.root.visible=false;if(body)body.visible=false;
    before?.();
    try {
      this.editorLiteBlit.Render(this.renderer,this.host.scene,this.camera,source.width,source.height);
      this.canvas.getContext("2d").drawImage(source,0,0,width,height);
    } finally {
      after?.();this.host.viewmodel.root.visible=saved;if(body)body.visible=bodyVisible;restore();
    }
  }
  Dispose(){
    this.count=1;this.host.ai.view.SetObserverCameras([]);this.editorLiteBlit?.Dispose?.();this.editorLiteBlit=null;
    this.host.canvas.removeEventListener("pointerdown",this.onMainFocus);
    this.pane.remove();this.primary.remove();document.body.classList.remove("encounterDual");
  }
}
