import * as THREE from 'three';
import {El,Section,Slider,Select,Toggle,ButtonRow,Note,Row} from './Script_EditorUi.mjs';
import {CurveField,ColorField} from './Script_EditorParticleInspector.mjs';
import {BuildSink} from './Script_World.mjs';
import {CloneShadedMaterial} from './Script_Materials.mjs';
import {NormalizeFallingSoil,NormalizeSoilPreview} from './Script_FallingSoilRules.mjs';
import {FALLING_SOIL_SCHEMA as SCHEMA,FALLING_SOIL_STAGE as STAGE,FALLING_SOIL_PRESETS as PRESETS,FALLING_SOIL_LIMITS as LIMITS} from './Data_Tuning_FallingSoil.mjs';
const Clone=value=>JSON.parse(JSON.stringify(value));

// Only UI + studio reference surfaces. All emission/collision/rendering is the
// production ParticleEffects.FallingSoil implementation, including in whitebox.
export class FallingSoilInspector{
  constructor(editor,parent){this.editor=editor;this.parent=parent;this.configs=new Map();this.stage=Clone(STAGE);this.id=null;}
  get api(){return this.editor.host.vfx.particles.FallingSoil;}
  get selected(){return Object.hasOwn(PRESETS,this.editor.effectId);}
  Config(){const key=this.editor.effectId;if(!this.configs.has(key))this.configs.set(key,NormalizeFallingSoil({},key));return this.configs.get(key);}
  Show(){
    const open=new Set([...this.parent.querySelectorAll('details[open]')].map(el=>el.dataset.soilGroup));
    this.parent.replaceChildren();if(!this.selected){Note(this.parent,'在效果库中选择任一“落土”预设。');return;}
    const config=this.Config(),top=Section(this.parent,'共用落土效果 · 三层可独立组合');
    Note(top,'真实米制；本页来源、物理和美术数值均可保存。修改后按同一种子重建当前时刻，立即可见。常规效果的整体缩放不改变本页的米制参数。');
    ButtonRow(top,[{label:'停发 · 自然收尾',onClick:()=>{if(this.id){this.api.Stop(this.id);this.editor.paused=false;}}},
      {label:'近看土流 / 触地尘',onClick:()=>this.Frame('flow')},{label:'检查单个土块',onClick:()=>this.Frame(true)},{label:'看全程',onClick:()=>this.Frame(false)}]);
    Note(top,'外观对照：FX Elements 的实拍 Falling Debris 008；细土帘是主体，少量土块为辅。参考与对照方法见项目的落土视觉说明。');
    for(const [group,{label,fields}]of Object.entries(SCHEMA)){
      const details=El('details'),summary=El('summary','',label);details.dataset.soilGroup=group;
      details.open=open.size?open.has(group):['emitter','timing'].includes(group);summary.style.cssText='cursor:pointer;padding:10px 0;color:#e5c78f;font-weight:600';
      details.appendChild(summary);const body=El('div');details.appendChild(body);this.parent.appendChild(details);
      for(const [key,schema]of Object.entries(fields)){
        const path=group+'.'+key,value=config[group][key],Patch=n=>this.Edit({[group]:{[key]:n}});
        if(schema.type==='number')this.Number(body,schema.label,value,Patch,{...schema,path});
        if(schema.type==='boolean'){const t=Toggle(body,schema.label,value,Patch);t.root.dataset.soilField=path;}
        if(schema.type==='enum'){const s=Select(body,schema.label,Object.entries(schema.options).map(([value,label])=>({value,label})),value,Patch);s.root.dataset.soilField=path;}
        if(schema.type==='curve')CurveField(body,schema.label,value,Patch,{...schema,path:'soil.'+path});
        if(schema.type==='color'){const box=El('div');box.dataset.soilField=path;body.appendChild(box);ColorField(box,schema.label,value,Patch);}
        if(schema.type==='vector')for(let i=0;i<3;i++)this.Number(body,schema.label+' '+['X','Y','Z'][i],value[i],n=>{const values=[...this.Config()[group][key]];values[i]=n;Patch(values);},{...schema,path:path+'.'+i});
      }
    }
    const stage=Section(this.parent,'预览参照物与表面（只在摄影棚）');
    const Rebuild=()=>this.Replay();
    Toggle(stage,'显示洞顶 / 板缝来源',this.stage.sourceReference,on=>{this.stage.sourceReference=on;Rebuild();});
    Toggle(stage,'显示暗色观察背景',this.stage.backdrop,on=>{this.stage.backdrop=on;Rebuild();});
    Toggle(stage,'显示并碰撞横木',this.stage.beam.enabled,on=>{this.stage.beam.enabled=on;Rebuild();});
    Toggle(stage,'移动宿主（粒子离开后留在世界）',this.stage.followMotion,on=>{this.stage.followMotion=on;Rebuild();});
    this.Number(stage,'预览地面高度',this.stage.groundY,n=>{this.stage.groundY=n;Rebuild();},{min:-3,max:3,step:.05,path:'stage.groundY'});
    for(const [key,label,min,max]of [['y','横木高度',.1,6],['x','横木 X',-4,4],['z','横木 Z',-4,4],['width','横木宽',.1,6],['depth','横木深',.05,2],['height','横木厚',.03,.6]])
      this.Number(stage,label,this.stage.beam[key],n=>{this.stage.beam[key]=n;Rebuild();},{min,max,step:.02,path:'stage.beam.'+key});
    Note(stage,'地面和横木走宿主表面接口。运行时自动接共享 GroundHeight + Battlefield.Raycast，也可注入不同地形、阻挡或运动来源；这些摄影棚参照物不会进入正片。');
    Note(stage,`引擎硬上限：${LIMITS.emitters} 个发射器；合计 ${LIMITS.grains} 粒细砂 / ${LIMITS.clods} 个实体土块 / ${LIMITS.dust} 片细尘；固定 60 Hz，碎裂最多一代。细砂为缓存采样碰撞，土块为逐步扫掠碰撞。`);
  }
  Number(parent,label,value,onChange,{min=0,max=1,step=.01,path=''}={}){
    // Reuse normal sliders for compact bounded knobs, numeric fields for world
    // positions/seeds where a slider cannot supply useful precision.
    if(Math.abs((value-min)/step-Math.round((value-min)/step))>1e-6)step=Math.min(step,.001);
    if(max-min<=1000){const s=Slider(parent,{label,min,max,step,value,onInput:n=>this.editor.Try(()=>onChange(n))});
      s.root.querySelector('input').dataset.soilField=path;s.root.querySelector('input').setAttribute('aria-label',label);return;}
    const input=El('input');input.type='number';input.value=value;input.min=min;input.max=max;input.step=step;input.dataset.soilField=path;input.setAttribute('aria-label',label);
    input.addEventListener('change',()=>this.editor.Try(()=>onChange(Number(input.value))));Row(parent,label,input);
  }
  Edit(patch){
    const previous=this.Config(),next=NormalizeFallingSoil({...previous,...Object.fromEntries(Object.entries(patch).map(([key,value])=>[key,{...previous[key],...value}]))},this.editor.effectId);
    this.configs.set(this.editor.effectId,next);if(patch.emitter?.seed!==undefined){this.editor.seed=next.emitter.seed;const field=this.editor.panel.root.querySelector('[data-vfx-seed]');if(field)field.value=this.editor.seed;}
    this.Replay();return Clone(next);
  }
  Replay(){const time=this.editor.previewTime,paused=this.editor.paused;this.editor.Seek(time);this.editor.paused=paused;return this.Inspect();}
  Begin(){this.End();if(!this.selected)return;
    this.savedPadVisible=this.editor.studio.pad.visible;this.editor.studio.pad.visible=false;
    const c=this.Config();c.emitter.seed=this.editor.seed;this.BuildStage(c);
    const host={groundAt:()=>this.stage.groundY,raycast:(from,dir,distance)=>this.Raycast(from,dir,distance)};
    if(this.stage.followMotion)host.transformAt=time=>({position:[Math.sin(time*.9)*.7,0,0],rotation:[0,Math.sin(time*.5)*.12,0]});
    this.id=this.api.Create({preset:this.editor.effectId,config:c},host).id;this.api.solidRoot.visible=true;this.Update(0);
  }
  End(){if(this.id&&this.api.entries.has(this.id))this.api.Remove(this.id);this.id=null;
    if(this.savedPadVisible!==undefined){this.editor.studio.pad.visible=this.savedPadVisible;this.savedPadVisible=undefined;}
    if(this.root){this.root.traverse(object=>{object.geometry?.dispose();});this.root.removeFromParent();this.root=null;}
    for(const material of this.materials||[])material.dispose();this.materials=[];
  }
  BuildStage(c){
    this.root=new THREE.Group();this.root.name='FallingSoilPreviewReferences';this.editor.studio.stand.add(this.root);
    const library=this.editor.host.library;
    const ground=CloneShadedMaterial(library.Get('Ground'));ground.color.setHex(0x9a8c76);ground.roughness=1;
    const earth=CloneShadedMaterial(library.Get('Ground'));earth.color.setHex(0x947354);earth.roughness=1;
    const wood=library.baked?.has('WoodBeam')?CloneShadedMaterial(library.Get('WoodBeam')):new THREE.MeshStandardMaterial({color:0x735638,roughness:.94});
    const backdrop=new THREE.MeshStandardMaterial({color:0x20241f,roughness:1});this.materials=[ground,earth,wood,backdrop];
    const sink=new BuildSink();sink.SetSector('FallingSoilPreview');
    const box=(target,key,w,h,d,x,y,z)=>{const geo=new THREE.BoxGeometry(w,h,d),uv=geo.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*Math.max(1,w),uv.getY(i)*Math.max(1,d));geo.translate(x,y,z);target.Add(key,geo);};
    box(sink,'ground',6,.035,5,0,this.stage.groundY-.0175,0);
    const b=this.stage.beam;if(b.enabled)box(sink,'wood',b.width,b.height,b.depth,b.x,b.y,b.z);
    if(this.stage.backdrop){const h=Math.max(2,c.emitter.position[1]-this.stage.groundY+1.2);box(sink,'backdrop',Math.max(6,c.emitter.width+2),h,.06,c.emitter.position[0],this.stage.groundY+h*.5,c.emitter.position[2]+c.emitter.length*.5+1.2);}
    sink.Flush(this.root,{Get:key=>key==='ground'?ground:key==='wood'?wood:backdrop},{castShadow:false});
    this.source=new THREE.Group();this.root.add(this.source);this.source.visible=this.stage.sourceReference;
    const source=new BuildSink();source.SetSector('SoilSource');const w=Math.max(.4,c.emitter.width),d=Math.max(.4,c.emitter.length);
    if(c.emitter.shape==='line'){
      const seam=Math.max(.015,c.emitter.length);
      box(source,'wood',w+.25,.08,.32,0,.04,-.16-seam*.5);box(source,'wood',w+.25,.08,.32,0,.04,.16+seam*.5);
      box(source,'earth',w+.25,.22,.75,0,.19,0);
    }else{
      const edge=c.emitter.distribution==='edge',extra=edge?.04:.6;
      box(source,'earth',w+extra,.3,d+extra,0,.15,0);
      box(source,'wood',w+.5,.12,.14,0,-.06,-d*.5-.12);box(source,'wood',w+.5,.12,.14,0,-.06,d*.5+.12);
    }
    source.Flush(this.source,{Get:key=>key==='earth'?earth:wood},{castShadow:false});
  }
  Raycast(from,dir,distance){const b=this.stage.beam;if(!b.enabled)return null;
    const box=new THREE.Box3(new THREE.Vector3(b.x-b.width*.5,b.y-b.height*.5,b.z-b.depth*.5),new THREE.Vector3(b.x+b.width*.5,b.y+b.height*.5,b.z+b.depth*.5));
    const ray=new THREE.Ray(new THREE.Vector3(from.x,from.y,from.z),new THREE.Vector3(dir.x,dir.y,dir.z)),point=ray.intersectBox(box,new THREE.Vector3());if(!point)return null;
    const t=point.distanceTo(ray.origin);if(t>distance)return null;const normal=[0,0,0],coordinates=point.toArray();let best=Infinity;
    for(let i=0;i<3;i++)for(const [side,value]of [[-1,box.min.toArray()[i]],[1,box.max.toArray()[i]]]){const d=Math.abs(coordinates[i]-value);if(d<best){best=d;normal.fill(0);normal[i]=side;}}
    return {t,normal};
  }
  Update(time){if(!this.source||!this.id)return;const p=this.api.Get(this.id).simulation.Pose(time);
    this.source.position.fromArray(p.position);this.source.rotation.set(...p.rotation);
    if(p.hostRotation)this.source.quaternion.premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...p.hostRotation)));
  }
  Frame(near=false){if(!this.selected)return;const c=this.Config(),p=c.emitter.position,isClod=near===true,isFlow=near==='flow';
    this.editor.studio.maxDistance=40;this.editor.studio.Frame(Math.max(3,c.emitter.position[1]+.5),isClod?.85:isFlow?2.8:Math.max(5.6,p[1]*1.75));
    const middle=(p[1]+this.stage.groundY)*.5;
    const clod=isClod&&this.id?this.api.Samples(this.id,'clods',48).sort((a,b)=>Math.abs(a.position[1]-middle)-Math.abs(b.position[1]-middle))[0]:null;
    if(clod)this.editor.studio.orbit.target.fromArray(clod.position);else this.editor.studio.orbit.target.set(p[0],isFlow?this.stage.groundY+.85:Math.max(.4,middle),p[2]);
    const orbit=this.editor.studio.orbit;orbit.pitch=isClod?.22:.08;
    if(!isClod)orbit.target.addScaledVector(new THREE.Vector3(Math.cos(orbit.yaw),0,-Math.sin(orbit.yaw)),orbit.dist*.1);
    if(clod){for(const yaw of [orbit.yaw,orbit.yaw+Math.PI,orbit.yaw+Math.PI*.5,orbit.yaw-Math.PI*.5]){
      const target=orbit.target,eye=new THREE.Vector3(target.x+Math.sin(yaw)*Math.cos(orbit.pitch)*orbit.dist,target.y+Math.sin(orbit.pitch)*orbit.dist,target.z+Math.cos(yaw)*Math.cos(orbit.pitch)*orbit.dist);
      const dir=target.clone().sub(eye).normalize(),hit=this.Raycast(eye,dir,orbit.dist);if(!hit||hit.t>orbit.dist-.05){orbit.yaw=yaw;break;}
    }}
    this.editor.studio.ApplyCamera();this.editor.host.post?.NotifyCameraCut();
  }
  Inspect(){return this.id&&this.api.entries.has(this.id)?this.api.Inspect(this.id):null;}
  Export(){return this.selected?{version:1,kind:'TengxianFallingSoil',preset:this.editor.effectId,config:Clone(this.Config()),preview:Clone(this.stage)}:undefined;}
  Import(data){if(data?.version!==1||data.kind!=='TengxianFallingSoil'||data.preset!==this.editor.effectId)throw new Error('落土预设无效');this.configs.set(data.preset,NormalizeFallingSoil(data.config,data.preset));this.stage=NormalizeSoilPreview(data.preview);}
}
