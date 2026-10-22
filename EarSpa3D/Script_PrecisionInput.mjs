// Independent position, wrist rotation, insertion and grip. No wax selection or
// motion animation belongs to input: contact is resolved by the visible tool.
export function CreatePrecisionInput({canvas,Enabled,Cancel,SelectTool,ViewTray,Wake,ToolScreen,assisted=false}) {
  const keys=new Set(),actions=new Set();
  let cursor=null,capture=null,rotating=false,dx=0,dy=0,depth=0,yaw=0,pitch=0;
  let offset={x:0,y:0},pointerInside=false;
  const bindings=[];
  function Listen(target,name,handler,options){target.addEventListener(name,handler,options);bindings.push([target,name,handler,options]);}
  function Point(event){const rect=canvas.getBoundingClientRect();return{x:event.clientX-rect.left,y:event.clientY-rect.top};}
  function Clutch(screen=ToolScreen()){if(cursor&&screen&&screen.z>-1&&screen.z<1)offset={x:screen.x-cursor.x,y:screen.y-cursor.y};}
  function Reset(){keys.clear();actions.clear();cursor=null;offset={x:0,y:0};rotating=false;dx=dy=depth=yaw=pitch=0;const id=capture;capture=null;if(id!=null&&canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);}
  function Stop(){Reset();Cancel();}
  Listen(canvas,'pointerenter',event=>{pointerInside=true;cursor=Point(event);offset={x:0,y:0};if(actions.size)Clutch();});
  Listen(canvas,'pointerleave',()=>{pointerInside=false;if(capture==null)cursor=null;});
  Listen(canvas,'pointerdown',event=>{
    if(!Enabled()||event.isPrimary===false||![0,2].includes(event.button))return;
    event.preventDefault();Wake();canvas.focus({preventScroll:true});cursor=Point(event);pointerInside=true;
    if(event.button===0)actions.add('pointer');else rotating=true;
    capture=event.pointerId;canvas.setPointerCapture(capture);
  });
  Listen(canvas,'pointermove',event=>{
    const next=Point(event);
    if(Enabled()&&cursor){const x=next.x-cursor.x,y=next.y-cursor.y;
      if(rotating){yaw+=x*.008;pitch+=y*.008;}else{dx+=x;dy+=y;}
    }
    cursor=next;
  });
  Listen(canvas,'pointerup',event=>{
    if(event.button===0)actions.delete('pointer');if(event.button===2){rotating=false;Clutch();}
    if(!actions.has('pointer')&&!rotating){const id=capture;capture=null;if(id!=null&&canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);}
  });
  Listen(canvas,'pointercancel',Stop);
  Listen(canvas,'lostpointercapture',()=>{if(capture!=null)Stop();});
  Listen(canvas,'contextmenu',event=>event.preventDefault());
  Listen(canvas,'wheel',event=>{
    if(!Enabled())return;event.preventDefault();Wake();canvas.focus({preventScroll:true});
    const units=event.deltaMode===1?16:event.deltaMode===2?canvas.clientHeight:1;
    // Positive wheel advances, negative wheel withdraws. One event is bounded;
    // geometry sweep still checks the entire path, including rapid scrolling.
    depth+=Math.max(-.8,Math.min(.8,event.deltaY*units*.004));
  },{passive:false});
  Listen(window,'keydown',event=>{
    if(event.code==='Escape'){Stop();return;}
    if(!Enabled()||/INPUT|BUTTON|SUMMARY|SELECT|TEXTAREA/.test(document.activeElement?.tagName))return;
    if(event.code==='KeyT'){event.preventDefault();if(!event.repeat)ViewTray();return;}
    if(/^Digit[1-6]$/.test(event.code)){event.preventDefault();if(!event.repeat)SelectTool(Number(event.code.slice(5))-1);return;}
    if(!['Space','KeyQ','KeyE','KeyW','KeyS','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','ShiftLeft','ShiftRight'].includes(event.code))return;
    event.preventDefault();Wake();keys.add(event.code);if(event.code==='Space')actions.add('keyboard');
  });
  Listen(window,'keyup',event=>{const used=keys.has(event.code);keys.delete(event.code);if(event.code==='Space'){actions.delete('keyboard');if(used)event.preventDefault();}});
  Listen(window,'blur',Stop);
  Listen(document,'visibilitychange',()=>{if(document.hidden)Stop();});
  function Read(dt){
    if(!Enabled()){Reset();return{dx:0,dy:0,depth:0,yaw:0,pitch:0,roll:0,acting:false,rotating:false};}
    const fine=keys.has('ShiftLeft')||keys.has('ShiftRight'),scale=fine?.25:1;
    const keyX=((keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')?1:0))*80*dt,keyY=((keys.has('ArrowDown')?1:0)-(keys.has('ArrowUp')?1:0))*80*dt;
    const frame={aim:cursor&&!rotating&&!fine&&!keyX&&!keyY?{x:cursor.x+(assisted?0:offset.x),y:cursor.y+(assisted?0:offset.y)}:null,
      handDx:(dx+keyX)*scale,handDy:(dy+keyY)*scale,
      dx:((fine?dx:0)+keyX)*scale,dy:((fine?dy:0)+keyY)*scale,
      depth:(depth+((keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0))*3*dt)*scale,
      yaw:yaw*scale,pitch:pitch*scale,roll:((keys.has('KeyE')?1:0)-(keys.has('KeyQ')?1:0))*1.1*dt*scale,
      acting:actions.size>0,rotating,fine};
    dx=dy=depth=yaw=pitch=0;return frame;
  }
  function SyncTool(screen,{constrained=false,transitioning=false}={}){
    if(!cursor||assisted)return;
    const clutch=rotating||keys.has('ShiftLeft')||keys.has('ShiftRight')||[...keys].some(key=>key.startsWith('Arrow'))||transitioning;
    if(clutch||constrained&&Math.hypot(screen.x-cursor.x-offset.x,screen.y-cursor.y-offset.y)>.5)Clutch(screen);
  }
  return{Read,Reset,SyncTool,Probe(){return{acting:actions.size>0,rotating,captured:capture!=null,keys:[...keys],pointerInside,pointer:cursor?{...cursor}:null,offset:{...offset},aim:cursor?{x:cursor.x+offset.x,y:cursor.y+offset.y}:null};},Dispose(){Reset();for(const [target,name,handler,options]of bindings)target.removeEventListener(name,handler,options);}};
}
