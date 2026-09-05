// Disposable P012 navigation and one portable ammunition box; no story facts are written here.
import * as THREE from "three";
export class FirstLevelP012Guidance {
  constructor(host){
    this.host=host;this.point=new THREE.Vector3();this.projected=new THREE.Vector3();
    this.crate=new THREE.Mesh(new THREE.BoxGeometry(.85,.5,.55),new THREE.MeshStandardMaterial({color:0xc99838,roughness:.92}));
    this.crate.name="P012PortableAmmoBox";host.scene.add(this.crate);
    this.signs=[];
    for(const [label,at] of [["弹药箱 · 按住 F 搬起",host.config.anchors.ammoPickup],["机枪收弹处 · 按住 F 交付",host.config.anchors.ammoDrop]]){
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
    let name=active?(delivered?'观察位':!carrying?'弹药箱':Math.hypot(target.x-this.host.config.anchors.ammoDrop.x,target.z-this.host.config.anchors.ammoDrop.z)<1?'机枪收弹处':'沿交通壕向这里拐弯 → 机枪收弹处')
      :'罗班长 · 北上接防';
    if(!active)name=({1:flow.facts.has('issuedAmmo')?'罗班长 · 集合':flow.facts.has('weapon')?'子弹领取处':'步枪领取处',
      6:'前方田地 · 观察敌情',7:'正面阵地 · 阻止敌人接近',8:'敌方机枪方向 · 可借枪眼还击',9:'掷弹筒方向 · 注意炮击预警',10:'西侧铁路涵洞',
      12:'罗班长 · 接应后送队',13:flow.facts.has('roadContactClear')?'担架队 · 继续护送':'道路遭遇敌人 · 掩护担架',
      14:flow.WaveState(6).resolved?'担架队 · 回来接应':'残屋火力点 · 清除伏兵',15:flow.facts.has('roadWounded')?'罗班长 · 墙后集合':'担架伤员 · 查看伤势',
      16:!flow.airRouteChoice?'两条护送路 · 左沟边 / 右道路':'跟上担架队',17:flow.facts.has('airObstacleResolved')?'担架队 · 回来接应':carry?.KindId==='wounded'?'墙后伤员安置处':'受伤百姓 / 翻倒小车',
      18:carry?.KindId==='stretcher'?'担架前进方向 · 沿沟搬运':'担架后端 · 靠近按 F 接手',19:'扫射逼近 · 可借路沟避弹',20:'接近伤员的敌人',21:'南路敌人 · 清除阻碍',22:'罗班长和担架队 · 南路集合',
      23:'担架队 · 一起撤回掩蔽部',24:carry?.KindId==='stretcher'?'掩蔽部 · 抬入伤员':'原担架后端 · 按 F 接手'})[flow.beat]||name;
    if(goal.interactionId==='p012_frontlineAmmo')name='前沿弹药箱 · 按住 F 补充桥夹';
    if(flow.beat===11)name=flow.lastSample.woundedDragDelivered?'伤员已安置 · 跟班长集合':carry?.KindId==='wounded'?'沿交通壕 → 掩蔽部接收处':'伤员';
    if(goal.targetLabel)name=goal.targetLabel;
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
