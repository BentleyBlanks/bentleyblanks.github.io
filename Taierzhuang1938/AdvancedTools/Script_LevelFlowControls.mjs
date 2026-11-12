import { Clamp } from "./Script_LevelFlowGeometry.mjs";
import { FLOW_RENDERING } from "../Data_Tuning_LevelFlow.mjs";

// Navigation belongs to the viewport that received the mouse press. Playback
// and other viewports remain independent while the scene camera is moving.
export class EncounterSceneControls {
  constructor(workspace,render) {
    this.workspace=workspace;this.render=render;this.drag=null;this.keys=new Set();this.wheelViews=new Map();
    window.addEventListener("keyup",event=>this.keys.delete(event.code));
    window.addEventListener("blur",()=>this.Clear());
    document.addEventListener("visibilitychange",()=>{if(document.hidden) this.Clear();});
  }

  Clear() {
    if(this.drag) this.Settle(this.drag.entry.map);
    for(const view of this.wheelViews.keys()) this.Settle(view);
    this.wheelViews.clear();this.drag=null;this.keys.clear();this.render();
  }

  Scale(view) {
    if(!view.type) return;
    view.navigationActive=true;view.renderScale=view.adaptiveScale;
  }

  Settle(view) {
    if(!view.type) return;
    view.navigationActive=false;view.renderScale=1;
  }

  Free(entry) {
    const view=entry.map;
    if(!view.freeCamera) {
      const distance=view.type==="oblique"?view.focal/view.scale:Math.hypot(...view.aim.map((value,index)=>value-view.eye[index]));
      const eye=view.type==="oblique"?view.aim.map((value,index)=>value-view.forward[index]*distance):[...view.eye];
      view.freeCamera={eye,yaw:Math.atan2(view.forward[0],view.forward[2]),pitch:Math.asin(view.forward[1])};
      view.focusDistance=Math.max(2,distance);
      view.center=[view.aim[0],view.aim[2]];
    }
    entry.type="scene";view.type="scene";entry.select.value="scene";entry.mode="manual";
    entry.canvas.setAttribute("aria-label",`视口 ${entry.index+1} · Scene 自由视角`);
    return view;
  }

  Begin(entry,event) {
    if(event.button!==1&&event.button!==2&&!(event.button===0&&event.altKey)) return false;
    event.preventDefault();this.workspace.Activate(entry.index);entry.canvas.focus();entry.canvas.setPointerCapture(event.pointerId);
    const view=entry.map;
    const action=!view.type?"planPan":event.button===1?"pan":event.altKey?(event.button===0?"orbit":"dolly"):"look";
    if(view.type&&!(view.type==="oblique"&&action!=="look")) this.Free(entry);
    this.Scale(view);
    entry.mode="manual";
    const pivot=[view.center[0],view.Ground?.(view.center)||0,view.center[1]];
    const offset=view.eye?.map((value,index)=>value-pivot[index]);
    this.drag={entry,action,x:event.clientX,y:event.clientY,pivot,distance:offset?Math.max(2,Math.hypot(...offset)):20};
    if(event.shiftKey) this.keys.add("ShiftLeft");
    return true;
  }

  Move(entry,event) {
    const drag=this.drag;if(!drag||drag.entry!==entry) return false;
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y,view=entry.map;
    this.Scale(view);
    drag.x=event.clientX;drag.y=event.clientY;
    if(drag.action==="planPan") view.center=[view.center[0]-dx/view.scale,view.center[1]-dy/view.scale];
    else if(drag.action==="look") {
      view.freeCamera.yaw-=dx*0.005;view.freeCamera.pitch=Clamp(view.freeCamera.pitch-dy*0.005,-1.54,1.54);
    } else if(drag.action==="orbit") {
      if(view.type==="oblique") {view.yaw-=dx*0.005;view.pitch=Clamp(view.pitch+dy*0.005,0.06,1.54);}
      else {
        const camera=view.freeCamera;
        camera.yaw-=dx*0.005;camera.pitch=Clamp(camera.pitch-dy*0.005,-1.54,1.54);
        const forward=[Math.sin(camera.yaw)*Math.cos(camera.pitch),Math.sin(camera.pitch),Math.cos(camera.yaw)*Math.cos(camera.pitch)];
        camera.eye=drag.pivot.map((value,index)=>value-forward[index]*drag.distance);
      }
    } else if(drag.action==="pan") {
      const factor=view.type==="oblique"?1/view.scale:(view.focusDistance||20)/view.focal;
      const delta=view.right.map((value,index)=>(-dx*value+dy*view.up[index])*factor);
      view.center=[view.center[0]+delta[0],view.center[1]+delta[2]];
      if(view.freeCamera) view.freeCamera.eye=view.freeCamera.eye.map((value,index)=>value+delta[index]);
    } else this.Dolly(entry,(dx+dy)*0.015);
    this.render();return true;
  }

  End(entry) {if(this.drag?.entry!==entry) return false;this.Clear();return true;}

  Dolly(entry,amount) {
    const view=entry.map;
    if(view.type==="oblique") {view.scale=Clamp(view.scale*Math.exp(-amount),0.15,40);return;}
    this.Free(entry);
    const distance=Math.max(1,view.focusDistance||20),step=distance*(1-Math.exp(Clamp(amount,-1,1)));
    view.freeCamera.eye=view.freeCamera.eye.map((value,index)=>value+view.forward[index]*step);
    view.focusDistance=Clamp(distance-step,1,1000);
  }

  Wheel(entry,event) {
    event.preventDefault();this.workspace.Activate(entry.index);entry.mode="manual";
    if(entry.map.type) this.Dolly(entry,event.deltaY*0.001);
    else {const rect=entry.canvas.getBoundingClientRect();entry.map.Zoom(Math.exp(-event.deltaY*0.001),[event.clientX-rect.left,event.clientY-rect.top]);}
    if(entry.map.type) {
      this.Scale(entry.map);
      this.wheelViews.set(entry.map,performance.now()+FLOW_RENDERING.navigation.wheelSettleMs);
    }
    this.render();
  }

  Key(event) {
    if(this.drag?.action!=="look"||!["KeyW","KeyA","KeyS","KeyD","KeyQ","KeyE","ShiftLeft","ShiftRight"].includes(event.code)) return false;
    event.preventDefault();this.keys.add(event.code);return true;
  }

  Tick(delta) {
    let settled=false;
    for(const [view,until] of this.wheelViews) if(performance.now()>=until&&this.drag?.entry.map!==view) {
      this.Settle(view);this.wheelViews.delete(view);settled=true;
    }
    if(this.drag?.action!=="look"||!this.keys.size) return settled;
    const view=this.drag.entry.map,camera=view.freeCamera;if(!camera) return false;
    const forward=Number(this.keys.has("KeyW"))-Number(this.keys.has("KeyS"));
    const right=Number(this.keys.has("KeyD"))-Number(this.keys.has("KeyA"));
    const vertical=Number(this.keys.has("KeyE"))-Number(this.keys.has("KeyQ"));
    const speed=12*(this.keys.has("ShiftLeft")||this.keys.has("ShiftRight")?4:1)*delta/Math.max(1,Math.hypot(forward,right,vertical));
    const movement=[Math.sin(camera.yaw)*Math.cos(camera.pitch)*forward-Math.cos(camera.yaw)*right,
      Math.sin(camera.pitch)*forward+vertical,Math.cos(camera.yaw)*Math.cos(camera.pitch)*forward+Math.sin(camera.yaw)*right];
    camera.eye=camera.eye.map((value,index)=>value+movement[index]*speed);
    return settled||!!(forward||right||vertical);
  }

  Focus(point,radius=8) {
    const entry=this.workspace.active,view=entry.map;entry.mode="manual";
    if(!view.type||view.type==="oblique") view.scale=Clamp(Math.min(view.canvas.clientWidth,view.canvas.clientHeight)/(radius*3),0.15,25);
    else {
      this.Free(entry);view.focusDistance=Math.max(4,radius*2.5);
      const target=[point[0],view.Ground(point)+0.8,point[1]];
      view.freeCamera.eye=target.map((value,index)=>value-view.forward[index]*view.focusDistance);
    }
    view.center=[...point];
    this.render();
  }
}
