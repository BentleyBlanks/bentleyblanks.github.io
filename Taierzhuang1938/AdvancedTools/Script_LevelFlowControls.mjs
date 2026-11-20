import { Clamp } from "./Script_LevelFlowGeometry.mjs";
import { FLOW_RENDERING, FLOW_ZOOM } from "../Data_Tuning_LevelFlow.mjs";

function GroundPanDelta(dx,dy,factor,right,forward) {
  const horizontal=Math.hypot(forward[0],forward[2])||1;
  const slope=Math.max(0.15,Math.abs(forward[1]))*(forward[1]>0?-1:1);
  return [-dx*right[0]*factor+dy*forward[0]/horizontal*factor/slope,0,
    -dx*right[2]*factor+dy*forward[2]/horizontal*factor/slope];
}

// Navigation belongs to the viewport that received the mouse press. Playback
// and other viewports remain independent while the scene camera is moving.
export class EncounterSceneControls {
  constructor(workspace,render) {
    this.workspace=workspace;this.render=render;this.drag=null;this.keys=new Set();this.wheelViews=new Map();
    this.touchPoints=new Map();this.touchGesture=null;this.touchConsumed=false;
    window.addEventListener("keyup",event=>this.keys.delete(event.code));
    window.addEventListener("blur",()=>this.Clear());
    document.addEventListener("visibilitychange",()=>{if(document.hidden) this.Clear();});
  }

  Clear({preserveTouch=false}={}) {
    const drag=this.drag;
    this.drag=null;
    if(drag) {
      this.Settle(drag.entry.map);
      delete drag.surface.dataset.navigationAction;
      if((!preserveTouch||!this.touchPoints.has(drag.pointerId))&&drag.surface.hasPointerCapture(drag.pointerId)) drag.surface.releasePointerCapture(drag.pointerId);
    }
    if(!preserveTouch) {
      const points=[...this.touchPoints.entries()];
      if(this.touchGesture) this.Settle(this.touchGesture.entry.map);
      this.touchPoints.clear();this.touchGesture=null;this.touchConsumed=false;
      for(const [id,point] of points) {
        delete point.entry.canvas.dataset.navigationAction;
        if(point.entry.canvas.hasPointerCapture(id)) point.entry.canvas.releasePointerCapture(id);
      }
    }
    for(const view of this.wheelViews.keys()) this.Settle(view);
    this.wheelViews.clear();this.drag=null;this.keys.clear();this.render();
  }

  TouchBegin(entry,event) {
    if(event.pointerType!=="touch") return false;
    event.preventDefault();
    this.touchPoints.set(event.pointerId,{entry,x:event.clientX,y:event.clientY});
    entry.canvas.setPointerCapture(event.pointerId);
    if(this.touchGesture) return true;
    const ids=[...this.touchPoints.keys()].filter(id=>this.touchPoints.get(id).entry===entry).slice(0,2);
    if(ids.length===2) this.StartTouchGesture(entry,ids);
    return this.touchConsumed;
  }

  TouchMeasure(ids,entry) {
    const [a,b]=ids.map(id=>this.touchPoints.get(id)),rect=entry.canvas.getBoundingClientRect();
    return {x:(a.x+b.x)/2-rect.left,y:(a.y+b.y)/2-rect.top,width:rect.width,height:rect.height,
      distance:Math.max(8,Math.hypot(b.x-a.x,b.y-a.y)),angle:Math.atan2(b.y-a.y,b.x-a.x)};
  }

  StartTouchGesture(entry,ids) {
    this.Clear({preserveTouch:true});this.workspace.Activate(entry.index);
    const view=entry.map,measure=this.TouchMeasure(ids,entry);
    if(view.type&&view.type!=="oblique") this.Free(entry);
    entry.mode="manual";this.StartNavigation(view);entry.canvas.dataset.navigationAction="touch";
    const gesture={entry,view,ids,measure,angle:measure.angle,rotation:0,scale:view.scale,width:measure.width,height:measure.height};
    if(!view.type) gesture.anchor=view.ToWorld([measure.x,measure.y]);
    else {
      const rect=entry.canvas.getBoundingClientRect();
      gesture.yaw=view.type==="oblique"?view.yaw:view.freeCamera.yaw;
      gesture.pitch=view.type==="oblique"?view.pitch:view.freeCamera.pitch;
      gesture.distance=Math.max(1,view.focusDistance||20);
      gesture.focal=view.focal;gesture.width=rect.width;gesture.height=rect.height;
      const factor=view.type==="oblique"?1/view.scale:gesture.distance/view.focal;
      const offset=GroundPanDelta(measure.x-rect.width/2,measure.y-rect.height*(view.type==="oblique"?0.57:0.49),factor,view.right,view.forward);
      const target=view.type==="oblique"?[view.center[0],view.Ground(view.center),view.center[1]]
        :view.freeCamera.eye.map((value,index)=>value+view.forward[index]*gesture.distance);
      gesture.anchor=target.map((value,index)=>value-offset[index]);
    }
    this.touchGesture=gesture;this.touchConsumed=true;
  }

  TouchMove(entry,event) {
    const point=this.touchPoints.get(event.pointerId);
    if(event.pointerType!=="touch"||!point) return false;
    point.x=event.clientX;point.y=event.clientY;
    if(!this.touchConsumed) return false;
    event.preventDefault();
    const gesture=this.touchGesture;
    if(!gesture||gesture.entry!==entry||!gesture.ids.includes(event.pointerId)) return true;
    const view=entry.map,measure=this.TouchMeasure(gesture.ids,entry),ratio=measure.distance/gesture.measure.distance;
    if(view!==gesture.view||measure.width!==gesture.width||measure.height!==gesture.height) {this.Clear();return true;}
    gesture.rotation+=Math.atan2(Math.sin(measure.angle-gesture.angle),Math.cos(measure.angle-gesture.angle));
    gesture.angle=measure.angle;
    if(!view.type) {
      const rect=entry.canvas.getBoundingClientRect();
      view.scale=Clamp(gesture.scale*ratio,FLOW_ZOOM.minScale,FLOW_ZOOM.maxScale);
      view.center=[gesture.anchor[0]-(measure.x-rect.width/2)/view.scale,gesture.anchor[1]-(measure.y-rect.height/2)/view.scale];
    } else {
      const yaw=gesture.yaw+gesture.rotation,pitch=gesture.pitch,orthographic=view.type==="oblique";
      const forward=orthographic?[-Math.sin(yaw)*Math.cos(pitch),-Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)]
        :[Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)];
      const right=orthographic?[Math.cos(yaw),0,-Math.sin(yaw)]:[-Math.cos(yaw),0,Math.sin(yaw)];
      const distance=Clamp(gesture.distance/ratio,1,1000);
      view.scale=Clamp(gesture.scale*ratio,FLOW_ZOOM.minScale,FLOW_ZOOM.maxScale);
      const factor=orthographic?1/view.scale:distance/gesture.focal;
      const offset=GroundPanDelta(measure.x-gesture.width/2,measure.y-gesture.height*(orthographic?0.57:0.49),factor,right,forward);
      const target=gesture.anchor.map((value,index)=>value+offset[index]);
      view.center=[target[0],target[2]];
      if(orthographic) view.yaw=yaw;
      else {view.freeCamera={eye:target.map((value,index)=>value-forward[index]*distance),yaw,pitch};view.focusDistance=distance;}
    }
    this.render();return true;
  }

  TouchEnd(entry,event) {
    if(event.pointerType!=="touch"||!this.touchPoints.has(event.pointerId)) return false;
    const consumed=this.touchConsumed;
    this.touchPoints.delete(event.pointerId);
    if(this.touchGesture?.ids.includes(event.pointerId)) {
      this.Settle(this.touchGesture.entry.map);delete this.touchGesture.entry.canvas.dataset.navigationAction;
      this.touchGesture=null;
      const ids=[...this.touchPoints.keys()].filter(id=>this.touchPoints.get(id).entry===entry).slice(0,2);
      if(ids.length===2) this.StartTouchGesture(entry,ids);
    }
    if(!this.touchPoints.size) {this.touchConsumed=false;this.touchGesture=null;}
    if(consumed) this.render();
    return consumed;
  }

  TouchLost(event) {
    if(!this.touchPoints.has(event.pointerId)) return false;
    this.Clear();return true;
  }

  StartNavigation(view) {
    if(!view.type) return;
    view.navigationActive=true;
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

  Begin(entry,event,{surface=entry.canvas,forceOrbit=false,forcePan=false}={}) {
    const handPan=forcePan&&event.button===0&&!event.altKey;
    if(!forceOrbit&&!handPan&&event.button!==1&&event.button!==2&&!(event.button===0&&event.altKey)) return false;
    if(this.drag) this.Clear({preserveTouch:event.pointerType==="touch"});
    event.preventDefault();this.workspace.Activate(entry.index);surface.focus();surface.setPointerCapture(event.pointerId);
    const view=entry.map;
    const action=forceOrbit?"orbit":event.altKey&&event.button===2?"dolly":!view.type?"planPan":event.button===1||handPan?"pan":event.altKey?"orbit":"look";
    const followingZoom=entry.mode==="follow"&&action==="dolly";
    if(view.type&&!followingZoom&&!(view.type==="oblique"&&action!=="look")) this.Free(entry);
    this.StartNavigation(view);
    if(!followingZoom) entry.mode="manual";
    const pivot=[view.center[0],view.Ground?.(view.center)||0,view.center[1]];
    const offset=view.eye?.map((value,index)=>value-pivot[index]);
    this.drag={entry,action,handPan,surface,pointerId:event.pointerId,x:event.clientX,y:event.clientY,pivot,distance:offset?Math.max(2,Math.hypot(...offset)):20};
    surface.dataset.navigationAction=action;
    if(event.shiftKey) this.keys.add("ShiftLeft");
    return true;
  }

  BindGizmo(entry) {
    const surface=entry.gizmo;
    let press=null;
    surface.addEventListener("pointerdown",event=>{
      if(event.button!==0) return;
      event.stopPropagation();
      press={pointerId:event.pointerId,x:event.clientX,y:event.clientY,axis:event.target.closest("[data-gizmo-axis]")?.dataset.gizmoAxis,moved:false};
      this.Begin(entry,event,{surface,forceOrbit:true});
      surface.classList.add("lfGizmoDragging");
    });
    surface.addEventListener("pointermove",event=>{
      if(!press) return;
      press.moved ||= Math.hypot(event.clientX-press.x,event.clientY-press.y)>3;
      this.Move(entry,event);
    });
    const Finish=(accept)=>{
      const released=press;press=null;
      surface.classList.remove("lfGizmoDragging");
      if(released&&surface.hasPointerCapture(released.pointerId)) surface.releasePointerCapture(released.pointerId);
      this.End(entry);
      if(accept&&released&&!released.moved&&released.axis) this.SnapAxis(entry,released.axis);
    };
    surface.addEventListener("pointerup",()=>Finish(true));
    surface.addEventListener("pointercancel",()=>Finish(false));
    surface.addEventListener("lostpointercapture",()=>Finish(false));
    window.addEventListener("blur",()=>Finish(false));
    surface.addEventListener("keydown",event=>{
      if(event.key!=="Escape") return;
      event.preventDefault();event.stopPropagation();Finish(false);
    });
    surface.addEventListener("click",event=>{
      const axis=event.target.closest("[data-gizmo-axis]")?.dataset.gizmoAxis;
      if(event.detail===0&&axis) this.SnapAxis(entry,axis);
    });
    surface.addEventListener("wheel",event=>this.Wheel(entry,event),{passive:false});
  }

  SnapAxis(entry,axis) {
    const view=this.Free(entry),direction=[0,0,0];
    direction["XYZ".indexOf(axis[1])]=axis[0]==="+"?1:-1;
    const yaw=Math.atan2(-direction[0],-direction[2]);
    const pitch=Clamp(Math.asin(-direction[1]),-1.54,1.54);
    const forward=[Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)];
    const target=[view.center[0],view.Ground(view.center)+0.8,view.center[1]];
    const distance=Math.max(1,view.focusDistance||20);
    view.freeCamera={eye:target.map((value,index)=>value-forward[index]*distance),yaw,pitch};
    view.focusDistance=distance;this.render();
  }

  Move(entry,event) {
    const drag=this.drag;if(!drag||drag.entry!==entry||drag.pointerId!==event.pointerId) return false;
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y,view=entry.map;
    this.StartNavigation(view);
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
      const delta=drag.handPan?GroundPanDelta(dx,dy,factor,view.right,view.forward)
        :view.right.map((value,index)=>(-dx*value+dy*view.up[index])*factor);
      view.center=[view.center[0]+delta[0],view.center[1]+delta[2]];
      if(view.freeCamera) view.freeCamera.eye=view.freeCamera.eye.map((value,index)=>value+delta[index]);
    } else this.Dolly(entry,(dx+dy)*0.015);
    this.render();return true;
  }

  End(entry) {if(this.drag?.entry!==entry) return false;this.Clear();return true;}

  Dolly(entry,amount) {
    const view=entry.map;
    if(entry.mode==="follow"&&view.type!=="scene") {
      const scale=Clamp(view.scale*Math.exp(-amount),FLOW_ZOOM.minScale,FLOW_ZOOM.maxScale);
      view.followZoom=Clamp((view.followZoom??1)*scale/view.scale,0.001,1000);
      view.scale=scale;
      return;
    }
    if(!view.type||view.type==="oblique") {view.scale=Clamp(view.scale*Math.exp(-amount),FLOW_ZOOM.minScale,FLOW_ZOOM.maxScale);return;}
    if(entry.mode!=="follow") this.Free(entry);
    const distance=Math.max(1,view.focusDistance||20),step=distance*(1-Math.exp(Clamp(amount,-1,1)));
    view.freeCamera.eye=view.freeCamera.eye.map((value,index)=>value+view.forward[index]*step);
    view.focusDistance=Clamp(distance-step,1,1000);
  }

  Wheel(entry,event) {
    event.preventDefault();this.workspace.Activate(entry.index);
    if(this.drag?.action==="look"&&this.drag.entry===entry) {
      this.workspace.AdjustFlySpeed(entry,Math.exp(-Clamp(event.deltaY,-300,300)*0.002));return;
    }
    if(entry.mode!=="follow") entry.mode="manual";
    if(entry.map.type||entry.mode==="follow") this.Dolly(entry,event.deltaY*0.001);
    else {const rect=entry.canvas.getBoundingClientRect();entry.map.Zoom(Math.exp(-event.deltaY*0.001),[event.clientX-rect.left,event.clientY-rect.top]);}
    if(entry.map.type) {
      this.StartNavigation(entry.map);
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
    const speed=view.sceneCamera.speed*(this.keys.has("ShiftLeft")||this.keys.has("ShiftRight")?4:1)*delta/Math.max(1,Math.hypot(forward,right,vertical));
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
