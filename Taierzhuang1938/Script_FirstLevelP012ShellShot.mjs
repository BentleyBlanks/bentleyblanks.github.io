// Player-eye observation and the same world-space battery throughout the approach.
// Combat owns ballistic hits/audio; bounded smoke sources outlive the brief camera capture.
import * as THREE from "three";
export class FirstLevelP012ShellShot {
  constructor(host){this.host=host;this.played=false;this.active=false;this.time=0;this.elapsed=0;this.serial=0;this.impacts=0;this.plumes=[];this.nextShell=0;this.disposed=false;}
  Start(point){
    if(this.played||!point)return false;
    this.played=true;this.active=true;this.time=0;this.point={x:point.x,z:point.z};
    const {camera}=this.host;
    this.saved={position:camera.position.clone(),quaternion:camera.quaternion.clone(),fov:camera.fov};
    this.AddSmoke(new THREE.Vector3(point.x,this.host.battlefield.GroundHeight(point.x,point.z),point.z));
    this.host.Capture({id:"P012DistantShell"});
    this.host.audio?.StopStoryVoice();
    const doc=globalThis.document;
    if(doc){
      this.overlay=doc.createElement('div');this.overlay.dataset.p012ShellShot='true';
      this.overlay.style.cssText='position:fixed;inset:0;z-index:60;pointer-events:none;border-top:7vh solid #000;border-bottom:12vh solid #000;box-sizing:border-box';
      const title=doc.createElement('div');title.textContent='北方阵地 · 铁路侧翼持续遭到炮击';
      title.style.cssText='position:absolute;left:5%;top:20px;color:#fff;font:20px serif;text-shadow:0 2px 5px #000';
      const line=doc.createElement('div');line.textContent='罗班长：看北边，阵地沿线还在挨炮！乡亲们往后撤！跟紧我，沿沟赶去接防！';
      line.style.cssText='position:absolute;bottom:-9vh;left:8%;right:8%;color:#fff;text-align:center;font:20px/1.6 sans-serif';
      const style=doc.createElement('style');style.textContent='body:has([data-p012-shell-shot]) [data-p012-navigation],body:has([data-p012-shell-shot]) #hud,body:has([data-p012-shell-shot]) #firstLevelP012Legend {visibility:hidden !important}';
      this.overlay.append(style,title,line);doc.body.append(this.overlay);
    }
    this.Update(0);return true;
  }
  Update(dt){
    this.UpdateBarrage(dt);
    if(!this.active)return;
    this.time+=Math.max(0,dt);
    if(this.time>=9){this.Finish();return;}
    const {camera,battlefield}=this.host,p=this.point;
    // No crane, dolly or teleport: the lens remains at the captured player eye.
    camera.position.copy(this.saved.position);
    const zoom=Math.min(1,this.time/.85);
    camera.fov=THREE.MathUtils.lerp(38,24,zoom*zoom*(3-2*zoom));
    camera.lookAt(p.x,battlefield.GroundHeight(p.x,p.z)+9,p.z-8);
    camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  }
  UpdateBarrage(dt){
    if(!this.played||this.disposed)return;
    this.elapsed+=Math.max(0,dt);
    for(let i=this.plumes.length-1;i>=0;i--)if(this.elapsed>=this.plumes[i].until){
      this.host.vfx?.RemoveSmokeSource(this.plumes[i].handle);this.plumes.splice(i,1);
    }
    // Story-bounded, not a one-shot cinematic loop: continue while walking and carrying.
    if(!this.active&&(this.host.runtime.beat<2||this.host.runtime.beat>5))return;
    if(this.elapsed<this.nextShell)return;
    const index=this.serial++,slot=index%3,wave=Math.floor(index/3),p=this.point;
    const offsets=[[-16,-6],[11,-17],[-3,5],[20,0],[-12,-22],[6,-9]];
    const [dx,dz]=offsets[index%offsets.length];
    const at=new THREE.Vector3(p.x+dx,this.host.battlefield.GroundHeight(p.x+dx,p.z+dz),p.z+dz);
    const from=at.clone().add(new THREE.Vector3(slot===1?38:-38,26+(wave%3)*3,-42-slot*7));
    this.host.FireShell?.(from,at,{flight:2.1+slot*.22,OnImpact:impact=>{
      if(this.disposed)return;this.impacts++;this.AddSmoke(impact);
    }});
    this.nextShell=this.elapsed+(slot<2?.32:this.active?1.05:3.1);
  }
  AddSmoke(point){
    if(!this.host.vfx)return;
    // Reuse a capped set of real impact columns, retaining old smoke after control returns.
    const near=this.plumes.find(entry=>entry.point.distanceTo(point)<7);
    if(near){near.until=this.elapsed+38;return;}
    if(this.plumes.length>=8){const old=this.plumes.shift();this.host.vfx.RemoveSmokeSource(old.handle);}
    const handle=this.host.vfx.SmokeSource(point.clone().add(new THREE.Vector3(0,.4,0)),{
      kind:"black",rate:5,radius:1.5,rise:2.2,sizeStart:1.5,sizeEnd:6.5,life:11,opacity:.48,turbulence:.32,
      colorA:0x47433e,colorB:0x777068});
    this.plumes.push({handle,point:point.clone(),until:this.elapsed+38});
  }
  Finish(){
    if(!this.active)return;
    this.active=false;this.overlay?.remove();this.overlay=null;
    const {camera}=this.host;
    camera.position.copy(this.saved.position);camera.quaternion.copy(this.saved.quaternion);camera.fov=this.saved.fov;
    camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
    this.host.Release();
  }
  Snapshot(){return {active:this.active,played:this.played,time:this.time,elapsed:this.elapsed,point:this.point||null,launched:this.serial,impacts:this.impacts,plumes:this.plumes.length,eye:this.saved?.position.toArray()||null};}
  Dispose(){this.disposed=true;this.Finish();for(const plume of this.plumes)this.host.vfx?.RemoveSmokeSource(plume.handle);this.plumes.length=0;}
}
