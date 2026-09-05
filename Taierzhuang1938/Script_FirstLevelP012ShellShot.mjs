// One brief view of the real impact, with the existing game's input-capture hooks.
// No duplicate explosion, actor repositioning, scene rebuild or checkpoint mutation.
import * as THREE from "three";
export class FirstLevelP012ShellShot {
  constructor(host){this.host=host;this.played=false;this.active=false;this.time=0;}
  Start(point){
    if(this.played||!point)return false;
    this.played=true;this.active=true;this.time=0;this.point={x:point.x,z:point.z};
    const {camera}=this.host;
    this.saved={position:camera.position.clone(),quaternion:camera.quaternion.clone(),fov:camera.fov};
    this.host.Capture({id:"P012DistantShell"});
    this.host.audio?.StopStoryVoice();
    const doc=globalThis.document;
    if(doc){
      this.overlay=doc.createElement('div');this.overlay.dataset.p012ShellShot='true';
      this.overlay.style.cssText='position:fixed;inset:0;z-index:60;pointer-events:none;border-top:7vh solid #000;border-bottom:12vh solid #000;box-sizing:border-box';
      const title=doc.createElement('div');title.textContent='北方 · 接防方向';
      title.style.cssText='position:absolute;left:5%;top:20px;color:#fff;font:20px serif;text-shadow:0 2px 5px #000';
      const line=doc.createElement('div');line.textContent='罗班长：北边阵地挨炮了！乡亲们往后撤，咱们靠边加快，赶去接防！';
      line.style.cssText='position:absolute;bottom:-9vh;left:8%;right:8%;color:#fff;text-align:center;font:20px/1.6 sans-serif';
      const style=doc.createElement('style');style.textContent='body:has([data-p012-shell-shot]) #hud,body:has([data-p012-shell-shot]) #firstLevelP012Legend {visibility:hidden !important}';
      this.overlay.append(style,title,line);doc.body.append(this.overlay);
    }
    this.Update(0);return true;
  }
  Update(dt){
    if(!this.active)return;
    this.time+=Math.max(0,dt);
    if(this.time>=6){this.Finish();return;}
    const {camera,battlefield}=this.host,p=this.point,y=battlefield.GroundHeight(p.x,p.z);
    // South-east of the actual crater, facing north-west; gently widen to show the road.
    const pull=this.time/6;
    camera.position.set(p.x+pull*2,y+16+pull*1.5,p.z+22+pull*4);
    camera.fov=52;camera.lookAt(new THREE.Vector3(p.x,y+1.5,p.z));camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  }
  Finish(){
    if(!this.active)return;
    this.active=false;this.overlay?.remove();this.overlay=null;
    const {camera}=this.host;
    camera.position.copy(this.saved.position);camera.quaternion.copy(this.saved.quaternion);camera.fov=this.saved.fov;
    camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
    this.host.Release();
  }
  Snapshot(){return {active:this.active,played:this.played,time:this.time,point:this.point||null};}
  Dispose(){this.Finish();}
}
