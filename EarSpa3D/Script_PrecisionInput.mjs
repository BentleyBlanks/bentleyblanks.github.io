// Independent position, wrist rotation, insertion and grip. No wax selection or
// motion animation belongs to input: contact is resolved by the visible tool.
export function CreatePrecisionInput({canvas,Enabled,Cancel,SelectTool,ViewTray,Wake}) {
  const keys=new Set(),actions=new Set();
  let cursor=null,capture=null,rotating=false,dx=0,dy=0,depth=0,yaw=0,pitch=0;
  const bindings=[];
  function Listen(target,name,handler,options){target.addEventListener(name,handler,options);bindings.push([target,name,handler,options]);}
  function Point(event){return{x:event.clientX,y:event.clientY};}
  function Reset(){keys.clear();actions.clear();cursor=null;rotating=false;dx=dy=depth=yaw=pitch=0;const id=capture;capture=null;if(id!=null&&canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);}
  function Stop(){Reset();Cancel();}
  Listen(canvas,'pointerenter',event=>{cursor=Point(event);});
  Listen(canvas,'pointerleave',()=>{if(capture==null)cursor=null;});
  Listen(canvas,'pointerdown',event=>{
    if(!Enabled()||event.isPrimary===false||![0,2].includes(event.button))return;
    event.preventDefault();Wake();canvas.focus({preventScroll:true});cursor=Point(event);
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
    if(event.button===0)actions.delete('pointer');if(event.button===2)rotating=false;
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
    const frame={dx:(dx+((keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')?1:0))*80*dt)*scale,
      dy:(dy+((keys.has('ArrowDown')?1:0)-(keys.has('ArrowUp')?1:0))*80*dt)*scale,
      depth:(depth+((keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0))*3*dt)*scale,
      yaw:yaw*scale,pitch:pitch*scale,roll:((keys.has('KeyE')?1:0)-(keys.has('KeyQ')?1:0))*1.1*dt*scale,
      acting:actions.size>0,rotating,fine};
    dx=dy=depth=yaw=pitch=0;return frame;
  }
  return{Read,Reset,Probe(){return{acting:actions.size>0,rotating,captured:capture!=null,keys:[...keys]};},Dispose(){Reset();for(const [target,name,handler,options]of bindings)target.removeEventListener(name,handler,options);}};
}
