import * as THREE from 'three';
import { Panel,Section,Slider,Select,ButtonRow,Button,Toggle,Note,El,Row } from './Script_EditorUi.mjs';
import { SQUAD_MARCH as C,SQUAD_MARCH_EDITOR as E,SQUAD_MARCH_PRESETS } from './Data_Tuning_SquadMarch.mjs';
import { SquadMarch,ValidateSquadMarchConfig } from './Script_SquadMarch.mjs';
import { InstallSquadMarchActor } from './Script_SquadMarchActor.mjs';
import { MarkNoPrepass } from './Script_Post.mjs';

const COLORS={running:'#a7cbe3',braking:'#ddb668',resting:'#f2cd75',catchup:'#8bdbc4',waiting:'#efaa80',yielding:'#c49fe1',arrived:'#98c58e'};
const LABELS={running:'跑动',braking:'收步',resting:'喘息观察',catchup:'追赶',waiting:'等候',yielding:'让行',arrived:'到达'};
const Clone=value=>JSON.parse(JSON.stringify(value));
const Angle=a=>Math.atan2(Math.sin(a),Math.cos(a));

export class SquadMarchEditor {
  static id='squadMarch';
  static label='小队行进';
  static hint='配置人数、路线与随机样式，预览真实人物的错峰跑停';
  constructor(host){
    this.host=host;this.studio=host.studio;this.cameraMode='studio';
    this.config=ValidateSquadMarchConfig({count:E.count,seed:E.seed,leaderIndex:E.leaderIndex,preset:E.preset,route:Clone(E.route)});
    this.profiles={};this.actors=[];this.soldiers=[];this.owned=[];this.playing=true;this.rate=1;this.follow=false;this.selected=0;
    this.samples=[];this.sampleAt=0;this.loaded=false;
  }
  Enter(root){
    this.studio.Open(this.host.hideInStudio);
    this.stageSaved={pad:this.studio.pad.scale.clone(),grid:this.studio.grid.scale.clone(),padVisible:this.studio.pad.visible,gridVisible:this.studio.grid.visible};
    this.studio.pad.scale.setScalar(3);this.studio.grid.scale.setScalar(3);
    this.studio.SetGridVisible(true);
    try{this.profiles=JSON.parse(localStorage.getItem(E.storageKey)||'{}');if(this.profiles[this.config.count])this.config=ValidateSquadMarchConfig(this.profiles[this.config.count]);}catch{this.profiles={};}
    this.panel=Panel({title:'小队行进编辑器',sub:'共享行进 · 实时人物',onClose:()=>this.host.Close()});
    this.panel.root.dataset.squadMarch='true';root.appendChild(this.panel.root);
    this.status=Note(this.panel.root,'');this.status.style.cssText='padding:8px 14px;color:#eed497';
    this.historyPanel=El('div');this.historyPanel.style.cssText='position:fixed;left:245px;right:350px;bottom:16px;max-height:190px;overflow:auto;background:#101518e8;padding:8px;border:1px solid #414647;pointer-events:auto';root.appendChild(this.historyPanel);
    this.BuildUi();this.Rebuild();this.Frame();return this;
  }
  Exit(){
    this.DisposeScene();this.historyPanel?.remove();this.panel?.root.remove();this.panel=null;
    this.studio.pad.scale.copy(this.stageSaved.pad);this.studio.grid.scale.copy(this.stageSaved.grid);
    this.studio.pad.visible=this.stageSaved.padVisible;this.studio.grid.visible=this.stageSaved.gridVisible;
    this.studio.Close();
  }
  BuildUi(){
    const body=this.panel.body;body.replaceChildren();this.sliders={};
    const squad=Section(body,'小队与随机样式');
    const count=El('input');count.type='number';count.min='1';count.max=String(C.maxCount);count.value=String(this.config.count);count.setAttribute('aria-label','小队人数');Row(squad,'人数（含班长）',count);
    count.addEventListener('change',()=>{const n=Number(count.value);if(!Number.isInteger(n)||n<1||n>C.maxCount){count.value=String(this.config.count);return;}
      const raw=this.profiles[n]??{...this.config,members:undefined,count:n,leaderIndex:Math.min(this.config.leaderIndex,n-1)};this.LoadConfig(raw);});
    ButtonRow(squad,[1,3,6,9,12,24].map(n=>({label:`${n} 人`,onClick:()=>this.LoadConfig(this.profiles[n]??{...this.config,members:undefined,count:n,leaderIndex:Math.min(this.config.leaderIndex,n-1)})})));
    const seed=El('input');seed.type='text';seed.value=this.config.seed;seed.maxLength=80;seed.setAttribute('aria-label','随机种子');Row(squad,'随机种子',seed);
    seed.addEventListener('change',()=>{this.config.seed=seed.value||'17';this.Rebuild();});
    ButtonRow(squad,[{label:'换一个随机样式',onClick:()=>{this.config.seed=String(Math.floor(Math.random()*1e9));seed.value=this.config.seed;this.Rebuild();}},
      {label:'同种子重播',onClick:()=>this.Rebuild()}]);
    Select(squad,'班长',Array.from({length:this.config.count},(_,i)=>({value:String(i),label:`队员 ${i+1}`})),String(this.config.leaderIndex),v=>{this.config.leaderIndex=Number(v);this.Rebuild();});
    Select(squad,'行进方式',[{value:'guided',label:'带路跑 · 错峰喘息'},{value:'walk',label:'步行'},{value:'urgent',label:'紧急转移 · 持续前进'}],this.config.preset,v=>{this.config.preset=v;delete this.config.tuning.speedMps;this.BuildUi();this.Rebuild();});
    const play=Section(body,'观看');
    this.playToggle=Toggle(play,'播放 / 暂停',this.playing,v=>{this.playing=v;});
    ButtonRow(play,[{label:'前进一帧',onClick:()=>{this.playing=false;this.playToggle.Set(false);this.Step(1/60);}},
      {label:'全队机位',onClick:()=>{this.follow=false;this.followToggle.Set(false);this.Frame();}}]);
    Select(play,'播放速度',[{value:'.5',label:'0.5×'},{value:'1',label:'1×'},{value:'2',label:'2×'}],String(this.rate),v=>{this.rate=Number(v);});
    this.followToggle=Toggle(play,'近看所选队员',this.follow,v=>{this.follow=v;this.Frame();});
    Select(play,'观察队员',Array.from({length:this.config.count},(_,i)=>({value:String(i),label:`队员 ${i+1}`})),String(Math.min(this.selected,this.config.count-1)),v=>{this.selected=Number(v);});
    const parameters=Section(body,'行进参数');
    const tuning={...C,...SQUAD_MARCH_PRESETS[this.config.preset],...this.config.tuning};
    const fields=[['speedMps','速度（米/秒）',.5,6,.1],['spreadM','横向疏密（米）',.5,4,.1],['spacingM','前后间距（米）',1,3.5,.1],
      ['runMinS','最短跑动（秒）',1,8,.1],['runMaxS','最长跑动（秒）',1,10,.1],['restMinS','最短喘息（秒）',.3,3,.1],['restMaxS','最长喘息（秒）',.3,4,.1],
      ['stopGapS','停步错开（秒）',.1,2,.1],['speedVariation','个人速度差',0,.2,.01],['lookYawRad','观察转角',.1,.7,.05]];
    for(const [key,label,min,max,step] of fields){
      this.sliders[key]=Slider(parameters,{label,min,max,step,value:tuning[key],onInput:v=>{
        this.config.tuning[key]=v;
        for(const [low,high] of [['runMinS','runMaxS'],['restMinS','restMaxS']]){
          const values={...C,...this.config.tuning};if(values[low]>values[high]){const other=key===low?high:low;this.config.tuning[other]=v;this.sliders[other].Set(v);}
        }
        this.Rebuild();
      }});
      this.sliders[key].root.querySelector('input').setAttribute('aria-label',label);
    }
    const route=Section(body,'路线与目标');
    this.routeCanvas=El('canvas');this.routeCanvas.width=560;this.routeCanvas.height=360;this.routeCanvas.style.cssText='width:100%;height:180px;background:#20262b;touch-action:none;border:1px solid #5c6264';
    this.routeCanvas.setAttribute('aria-label','行进路线图：点击增加点，拖动移动点，右键删除点');route.appendChild(this.routeCanvas);
    Note(route,'拖动路点修改路线；点空白处追加；右键删除。末点为任务目标。');
    ButtonRow(route,[{label:'折线路线',onClick:()=>this.SetRoute(Clone(E.route))},
      {label:'直线路线',onClick:()=>this.SetRoute([{x:0,z:14},{x:0,z:-24}])},
      {label:'窄口路线',onClick:()=>this.SetRoute([{x:0,z:16},{x:0,z:4,width:2},{x:0,z:-4,width:2},{x:4,z:-20}])}]);
    this.routePick=Select(route,'编辑路点',[],null,v=>{this.routeIndex=Number(v);this.SyncRouteInputs();});
    this.routeInputs={};
    for(const [key,label] of [['x','东西 X'],['z','南北 Z']]){
      const input=El('input');input.type='number';input.step='.5';input.setAttribute('aria-label',label);Row(route,label,input);this.routeInputs[key]=input;
      input.addEventListener('change',()=>{const value=Number(input.value);if(Number.isFinite(value)&&Math.abs(value)<=400){delete this.config.goal;this.config.route[this.routeIndex??0][key]=value;this.Rebuild();}else this.SyncRouteInputs();});
    }
    this.BindRouteInput();
    const history=Section(body,'全队状态 · 最近 15 秒');
    this.timeline=El('canvas');this.timeline.width=560;this.timeline.height=60+this.config.count*22;this.timeline.style.cssText='width:100%;background:#20262b';this.historyPanel.replaceChildren();Note(this.historyPanel,'各人跑停 · 最近 15 秒　蓝：跑动　金：喘息　绿：追赶 / 到达');this.historyPanel.appendChild(this.timeline);this.timeline.style.maxWidth='620px';this.timeline.style.display='block';this.timeline.style.margin='auto';
    Note(history,'蓝：跑动　金：喘息　绿：追赶 / 到达　紫：让行');

    const save=Section(body,'保存样式');
    ButtonRow(save,[{label:'保存此人数的样式',onClick:()=>this.SaveProfile()},
      {label:'导出配置',onClick:()=>this.Export()},
      {label:'导入配置',onClick:()=>this.fileInput.click()}]);
    this.fileInput=El('input');this.fileInput.type='file';this.fileInput.accept='.json,application/json';this.fileInput.hidden=true;save.appendChild(this.fileInput);
    this.fileInput.addEventListener('change',async()=>{try{const file=this.fileInput.files[0];if(file)this.LoadConfig(JSON.parse(await file.text()));}catch(error){this.SetStatus(`导入失败：${error.message}`);}this.fileInput.value='';});
    this.savedNote=Note(save,`已存人数：${Object.keys(this.profiles).join('、')||'暂无'}`);
  }
  SetStatus(text){if(this.status)this.status.textContent=text;}
  LoadConfig(raw){
    try{this.config=ValidateSquadMarchConfig(raw);this.selected=Math.min(this.selected,this.config.count-1);this.BuildUi();this.Rebuild();this.Frame();return true;}
    catch(error){this.SetStatus(`配置无效：${error.message}`);return false;}
  }
  SaveProfile(){
    try{const config=ValidateSquadMarchConfig(this.config);this.profiles[config.count]=config;localStorage.setItem(E.storageKey,JSON.stringify(this.profiles));this.savedNote.textContent=`已保存 ${config.count} 人样式 · 种子 ${config.seed}`;return true;}
    catch(error){this.savedNote.textContent=`保存失败：${error.message}`;return false;}
  }
  Export(){
    const config=ValidateSquadMarchConfig(this.config),url=URL.createObjectURL(new Blob([JSON.stringify(config,null,2)],{type:'application/json'}));
    const link=El('a');link.href=url;link.download=`Data_SquadMarch_${config.count}People.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return config;
  }
  SetRoute(route){this.config.route=route;delete this.config.goal;this.routeIndex=0;this.Rebuild();this.Frame();}
  SyncRouteInputs(){
    this.routeIndex=Math.min(this.routeIndex??0,this.config.route.length-1);const p=this.config.route[this.routeIndex];
    this.routePick.Fill(this.config.route.map((_,i)=>({value:String(i),label:`${i+1}${i===this.config.route.length-1?' · 目标':''}`})),String(this.routeIndex));
    for(const key of ['x','z'])this.routeInputs[key].value=String(p[key]);
  }
  RouteBounds(){
    if(this.dragSpan!=null)return this.dragSpan;
    const points=this.config.route,span=Math.max(40,...points.map(p=>Math.abs(p.x)*2.5),...points.map(p=>Math.abs(p.z)*2.5));return span;
  }
  BindRouteInput(){
    const canvas=this.routeCanvas;
    const World=e=>{const r=canvas.getBoundingClientRect(),span=this.dragSpan??this.RouteBounds();return {x:((e.clientX-r.left)/r.width-.5)*span,z:((e.clientY-r.top)/r.height-.5)*span};};
    const Nearest=p=>{let best=-1,d=this.RouteBounds()*.035;this.config.route.forEach((q,i)=>{const distance=Math.hypot(p.x-q.x,p.z-q.z);if(distance<d){d=distance;best=i;}});return best;};
    canvas.addEventListener('contextmenu',e=>{e.preventDefault();delete this.config.goal;const i=Nearest(World(e));if(i>=0&&this.config.route.length>2){this.config.route.splice(i,1);this.Rebuild();}});
    canvas.addEventListener('pointerdown',e=>{
      if(e.button!==0)return;e.preventDefault();e.stopPropagation();const p=World(e);let i=Nearest(p);
      if(i<0){if(this.config.route.length>=C.maxRoutePoints)return;this.config.route.push(p);i=this.config.route.length-1;}
      delete this.config.goal;this.dragSpan=this.RouteBounds();this.dragIndex=i;this.routeIndex=i;canvas.setPointerCapture(e.pointerId);this.SyncRouteInputs();this.DrawRoute();
    });
    canvas.addEventListener('pointermove',e=>{if(this.dragIndex==null)return;const p=World(e);Object.assign(this.config.route[this.dragIndex],{x:Math.round(p.x*2)/2,z:Math.round(p.z*2)/2});this.SyncRouteInputs();this.DrawRoute();});
    const Finish=()=>{if(this.dragIndex==null)return;this.dragIndex=null;this.dragSpan=null;this.Rebuild();};
    canvas.addEventListener('pointerup',Finish);canvas.addEventListener('pointercancel',Finish);
  }
  DisposeScene(){for(const actor of this.actors){actor.root.removeFromParent();actor.Dispose();}this.actors=[];this.soldiers=[];for(const item of this.owned)item.dispose();this.owned=[];this.studio.ClearStand();}
  Rebuild(){
    try{this.march=new SquadMarch(this.config);}catch(error){this.SetStatus(`配置无效：${error.message}`);return false;}
    this.DisposeScene();this.samples=[];this.sampleAt=0;this.selected=Math.min(this.selected,this.config.count-1);
    let i=0;
    for(const member of this.march.members.values()){
      const actor=this.host.actorFactory.Create('nra',{seed:i*7+3,weapon:'HanYang',modelVariant:i%4});
      const first=member.route[0]??this.config.route[0],next=member.route[1]??this.config.route.at(-1);actor.root.position.set(first.x,0,first.z);
      const soldier={id:i+1,actor,alive:true,position:actor.root.position,yaw:Math.atan2(first.x-next.x,first.z-next.z),moveSpeed:0,memberId:member.id};
      actor.root.rotation.y=soldier.yaw;InstallSquadMarchActor(soldier);this.studio.stand.add(actor.root);this.actors.push(actor);this.soldiers.push(soldier);i++;
      const label=El('canvas');label.width=192;label.height=48;const ctx=label.getContext('2d');
      ctx.fillStyle='#101518cc';ctx.fillRect(0,0,192,48);ctx.fillStyle=member.leader?'#f2d275':'#ffffff';ctx.font='bold 30px sans-serif';ctx.textAlign='center';ctx.fillText(`${i}${member.leader?' 班长':''}`,96,35);
      const texture=new THREE.CanvasTexture(label),labelMaterial=MarkNoPrepass(new THREE.SpriteMaterial({map:texture,depthTest:false,transparent:true}));
      const sprite=new THREE.Sprite(labelMaterial);sprite.position.set(0,2.05,0);sprite.scale.set(1.3,.325,1);actor.root.add(sprite);this.owned.push(texture,labelMaterial);
    }
    const points=this.config.route.map(p=>new THREE.Vector3(p.x,.06,p.z));
    const geometry=new THREE.BufferGeometry().setFromPoints(points),material=MarkNoPrepass(new THREE.LineBasicMaterial({color:0xcdb774}));
    this.studio.stand.add(new THREE.Line(geometry,material));this.owned.push(geometry,material);
    this.SyncRouteInputs();this.DrawRoute();this.DrawTimeline();this.SetStatus(`${this.config.count} 人 · 种子 ${this.config.seed}`);
    this.Step(1/60);return true;
  }
  Center(){
    if(this.follow&&this.soldiers[this.selected])return this.soldiers[this.selected].position.clone().add(new THREE.Vector3(0,1.1,0));
    const center=new THREE.Vector3(0,.8,0);for(const s of this.soldiers){center.x+=s.position.x/this.soldiers.length;center.z+=s.position.z/this.soldiers.length;}return center;
  }
  Frame(){
    const center=this.Center();this.studio.orbit.target.copy(center);
    const radius=Math.max(2,...this.soldiers.map(s=>Math.hypot(s.position.x-center.x,s.position.z-center.z)));
    this.studio.orbit.dist=this.follow?7:Math.min(39,Math.max(10,radius*3));this.studio.orbit.pitch=this.follow?.25:.45;this.studio.orbit.yaw=Math.PI+.55;
    this.host.camera.fov=50;this.host.camera.updateProjectionMatrix();this.studio.ApplyCamera();
  }
  Step(dt){
    if(!this.march)return;
    const outputs=this.march.Update(dt,this.soldiers.map(s=>({id:s.memberId,position:s.position,yaw:s.yaw,alive:true,speedMps:s.moveSpeed*3.6,canPause:true})));
    for(const s of this.soldiers){
      const o=outputs.get(s.memberId);if(!o)continue;s.squadMarchCommand=o;
      const dx=o.goal.x-s.position.x,dz=o.goal.z-s.position.z,d=Math.hypot(dx,dz);
      const step=Math.min(Math.max(0,d-.05),o.speedMps*dt);s.moveSpeed=dt>0?step/dt/3.6:0;
      if(step>0&&d>0){s.position.x+=dx/d*step;s.position.z+=dz/d*step;s.yaw+=Math.max(-C.turnRateRad*dt,Math.min(C.turnRateRad*dt,Angle(Math.atan2(-dx,-dz)-s.yaw)));}
      s.actor.root.rotation.y=s.yaw;
      s.actor.Update(dt,{moveSpeed:s.moveSpeed,moveSpeedMps:s.moveSpeed*3.6,aim:0,grounded:true,elapsed:this.march.time,lookYaw:o.lookYaw});
    }
    if(this.march.time>=this.sampleAt){this.sampleAt=this.march.time+.1;this.samples.push({time:this.march.time,states:[...this.march.members.keys()].map(id=>outputs.get(id)?.status)});while(this.samples[0]?.time<this.march.time-15)this.samples.shift();this.DrawRoute();this.DrawTimeline();
      const s=this.soldiers[this.selected],o=outputs.get(s.memberId);this.SetStatus(`队员 ${this.selected+1}${o.leader?' · 班长':''}：${LABELS[o.status]||o.status} · ${(s.moveSpeed*3.6).toFixed(1)} 米/秒 · ${this.march.time.toFixed(1)} 秒`);
    }
  }
  DrawRoute(){
    if(!this.routeCanvas)return;const canvas=this.routeCanvas,ctx=canvas.getContext('2d'),span=this.RouteBounds();ctx.clearRect(0,0,canvas.width,canvas.height);
    const X=x=>(x/span+.5)*canvas.width,Z=z=>(z/span+.5)*canvas.height;
    ctx.strokeStyle='#424a50';ctx.lineWidth=1;
    for(let v=-span/2;v<=span/2;v+=5){ctx.beginPath();ctx.moveTo(X(v),0);ctx.lineTo(X(v),canvas.height);ctx.stroke();ctx.beginPath();ctx.moveTo(0,Z(v));ctx.lineTo(canvas.width,Z(v));ctx.stroke();}
    ctx.strokeStyle='#ccb77a';ctx.lineWidth=3;ctx.beginPath();this.config.route.forEach((p,i)=>i?ctx.lineTo(X(p.x),Z(p.z)):ctx.moveTo(X(p.x),Z(p.z)));ctx.stroke();
    this.config.route.forEach((p,i)=>{ctx.fillStyle=i===this.routeIndex?'#fff0bc':'#cbb16a';ctx.beginPath();ctx.arc(X(p.x),Z(p.z),7,0,Math.PI*2);ctx.fill();ctx.font='18px sans-serif';ctx.fillText(String(i+1),X(p.x)+10,Z(p.z)-8);});
    for(const s of this.soldiers){ctx.fillStyle=s.squadMarchCommand?.leader?'#ffffff':COLORS[s.squadMarchCommand?.status]||'#9bc9e8';ctx.beginPath();ctx.arc(X(s.position.x),Z(s.position.z),4,0,Math.PI*2);ctx.fill();}
  }
  DrawTimeline(){
    if(!this.timeline)return;const ctx=this.timeline.getContext('2d'),w=this.timeline.width;ctx.clearRect(0,0,w,this.timeline.height);ctx.font='17px sans-serif';
    for(let i=0;i<this.config.count;i++){const y=26+i*22;ctx.fillStyle='#d6d9d8';ctx.fillText(`${i+1}${i===this.config.leaderIndex?' 班长':''}`,6,y+14);
      for(const sample of this.samples){const x=90+(sample.time-Math.max(0,this.march.time-15))/15*(w-95);ctx.fillStyle=COLORS[sample.states[i]]||'#4c535a';ctx.fillRect(x,y,4,16);}
    }
  }
  Update(dt){
    if(this.playing){let remaining=Math.min(dt,.1)*this.rate;while(remaining>0){const step=Math.min(1/60,remaining);this.Step(step);remaining-=step;}}
    this.studio.orbit.target.copy(this.Center());
    this.host.lights?.UpdateShadowFrustum(this.studio.orbit.target,new THREE.Vector3(0,0,-1));
  }
  Snapshot(){return {...this.march.Snapshot(),config:Clone(this.config),actors:this.soldiers.map(s=>({id:s.memberId,position:{x:s.position.x,z:s.position.z},meshSource:s.actor.meshSource,modelId:s.actor.modelId}))};}
}
