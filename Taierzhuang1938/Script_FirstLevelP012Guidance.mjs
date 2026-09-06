// Disposable P012 navigation and one portable ammunition box; no story facts are written here.
//
// 牌子上写谁**是数据**：`Data_FirstLevelP012Beats.P012_GUIDANCE_NAMES` 是按拍与事实
// 选名字的谓词表，解释器与 Flow 的目标行共用同一个 `P012ResolveLine`。
// 这里只负责把「现在是什么情形」置成几个具名钩子，再把牌子画到屏幕上。
import * as THREE from "three";
import { T } from "./Script_Text.mjs";
import { P012_GUIDANCE_NAMES } from "./Data_FirstLevelP012Beats.mjs";
import { P012ResolveLine } from "./Script_FirstLevelP012Flow.mjs";
export class FirstLevelP012Guidance {
  constructor(host){
    this.host=host;this.point=new THREE.Vector3();this.projected=new THREE.Vector3();
    this.crate=new THREE.Mesh(new THREE.BoxGeometry(.85,.5,.55),new THREE.MeshStandardMaterial({color:0xc99838,roughness:.92}));
    this.crate.name="P012PortableAmmoBox";host.scene.add(this.crate);
    this.signs=[];
    for(const [label,at] of [[T("p012.guide.ammoBoxSign"),host.config.anchors.ammoPickup],[T("p012.guide.ammoDropSign"),host.config.anchors.ammoDrop]]){
      const canvas=document.createElement('canvas');canvas.width=768;canvas.height=160;const ctx=canvas.getContext('2d');
      ctx.fillStyle='#151a20';ctx.fillRect(0,0,768,160);ctx.strokeStyle='#ffd66b';ctx.lineWidth=8;ctx.strokeRect(4,4,760,152);
      ctx.fillStyle='#fff0bc';ctx.font='bold 46px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,384,80);
      const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
      const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:true}));sprite.name="P012AmmoLabel";sprite.raycast=()=>{};sprite.scale.set(3.8,.8,1);sprite.position.set(at.x,host.battlefield.GroundHeight(at.x,at.z)+1.6,at.z);host.scene.add(sprite);this.signs.push(sprite);
    }
    this.marker=document.createElement('div');this.marker.dataset.p012Navigation='true';
    this.marker.style.cssText='position:fixed;z-index:35;pointer-events:none;transform:translate(-50%,-100%);padding:7px 10px;background:#151a20ed;color:#fff0bc;border:2px solid #ffd66b;border-radius:5px;font:bold 15px/1.5 sans-serif;text-align:center;max-width:240px;white-space:pre-line';
    document.body.append(this.marker);
  }
  Update(){
    const flow=this.host.Flow?.(),carry=this.host.Carry?.(),player=this.host.Player(),camera=this.host.camera;
    if(!flow||!player)return;
    const active=flow.beat===5,delivered=flow.facts.has('ammo'),carrying=carry?.KindId==='ammoCrate';
    const at=flow.ammoBoxPosition;
    this.crate.visible=flow.beat<=5&&!delivered;
    if(carrying){this.crate.position.copy(player.position);this.crate.position.x-=Math.sin(player.yaw)*.8;this.crate.position.z-=Math.cos(player.yaw)*.8;this.crate.position.y+=.85;this.crate.rotation.y=player.yaw;}
    else this.crate.position.set(at.x,this.host.battlefield.GroundHeight(at.x,at.z)+.25,at.z);
    this.signs[0].visible=active&&!carrying&&!delivered;
    this.signs[0].position.set(at.x,this.host.battlefield.GroundHeight(at.x,at.z)+1.6,at.z);
    this.signs[1].visible=active&&!delivered;
    // One current step only. A screen-edge arrow remains available when looking away.
    this.marker.hidden=flow.beat<1||flow.beat>=25||!player.Alive;
    if(this.marker.hidden)return;
    const goal=flow.CurrentObjective(),target=goal.target;if(!target){this.marker.hidden=true;return;}
    // 表要的五个具名钩子；其余条件（拍号 / 事实 / 手上搬的）表自己就读得到。
    const flags=new Set();
    if(Math.hypot(target.x-this.host.config.anchors.ammoDrop.x,target.z-this.host.config.anchors.ammoDrop.z)<1)flags.add('guideAtAmmoDrop');
    if(goal.interactionId==='p012_frontlineAmmo')flags.add('frontlineAmmoPoint');
    if(flow.lastSample.woundedDragDelivered)flags.add('woundedDelivered');
    if(flow.airRouteChoice)flags.add('airRouteChosen');
    if(flow.WaveState(6).resolved)flags.add('ambushResolved');
    // 目标点自己带了名字就用它 —— 那不是「按情形选一句」，不进表。
    const name=goal.targetLabel||P012ResolveLine(P012_GUIDANCE_NAMES,flow.LineContext(flags,carry?.KindId??null));
    this.point.set(target.x,this.host.battlefield.GroundHeight(target.x,target.z)+1.2,target.z);
    this.projected.copy(this.point).project(camera);
    const local=this.point.clone().applyMatrix4(camera.matrixWorldInverse),behind=local.z>=0;
    let x=this.projected.x,y=-this.projected.y;
    if(behind){x=local.x>=0?2:-2;y=.25;}
    const edge=behind||Math.abs(x)>.78||Math.abs(y)>.68;
    const scale=Math.max(1,Math.abs(x)/.78,Math.abs(y)/.68);x/=scale;y/=scale;
    const arrow=edge?(Math.abs(x)>.6?(x>0?'▶ ':'◀ '):(y>0?'▼ ':'▲ ')):'◆ ';
    this.marker.textContent=arrow+name;
    this.marker.style.left=(50+x*50)+'%';this.marker.style.top=(50+y*50)+'%';
    this.marker.dataset.step=active?(delivered?'observe':carrying?'deliver':'pickup'):`B${String(flow.beat).padStart(2,'0')}`;
  }
  Dispose(){this.marker.remove();this.crate.removeFromParent();this.crate.geometry.dispose();this.crate.material.dispose();for(const sprite of this.signs){sprite.removeFromParent();sprite.material.map.dispose();sprite.material.dispose();}}
}
