import * as THREE from 'three';
import {PARTICLE_VOLUME_ASSETS} from './Data_ParticleVolumeAssets.mjs';
import {El,Row,Select,Toggle,ButtonRow,Note} from './Script_EditorUi.mjs';
import {EvaluateCurve,EvaluateGradient} from './Script_ParticleModules.mjs';

const Clone=value=>JSON.parse(JSON.stringify(value));
function NumberField(parent,label,value,onChange,{min=-1000,max=1000,step=.01,path=''}={}){
 const input=El('input');input.type='number';input.min=min;input.max=max;input.step=step;input.value=value;input.dataset.particleField=path;input.setAttribute('aria-label',label);
 input.addEventListener('change',()=>{const n=Number(input.value);if(Number.isFinite(n))onChange(n)});Row(parent,label,input);return input;
}
function CurveGraph(parent,keys,onChange,{min=0,max=4}={}){
 let points=Clone(keys),selected=0;const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
 svg.setAttribute('viewBox','0 0 280 112');svg.setAttribute('role','img');svg.setAttribute('aria-label','生命周期曲线，双击添加控制点');
 svg.style.cssText='width:100%;height:112px;background:#171d20;border:1px solid #465155;touch-action:none;display:block';parent.appendChild(svg);
 const AutoRange=()=>{const peak=Math.max(...points.map(p=>Math.abs(p[1])));return {high:Math.min(max,peak>0?Math.max(.01,peak*1.25):1),low:min<0?Math.max(min,-(peak>0?Math.max(.01,peak*1.25):1)):0};};
 let {low,high}=AutoRange();if(high<=low)high=low+.01;let axisLabel;
 const xy=p=>[12+p[0]*256,100-(p[1]-low)/(high-low)*88];
 const At=event=>{const r=svg.getBoundingClientRect();return [Math.max(0,Math.min(1,(event.clientX-r.left)/r.width*280/256-12/256)),Math.max(low,Math.min(high,low+(100-(event.clientY-r.top)/r.height*112)/88*(high-low)))];};
 function Draw(){
   if(axisLabel)axisLabel.textContent=`归一化时间 0–100% · 纵轴 ${low.toFixed(2)}–${high.toFixed(2)}`;
   svg.replaceChildren();
   for(let i=0;i<=4;i++){const line=document.createElementNS(ns,'path');line.setAttribute('d',`M12 ${12+i*22}H268 M${12+i*64} 12V100`);line.setAttribute('stroke','#354044');svg.appendChild(line);}
   const path=document.createElementNS(ns,'path');path.setAttribute('d',points.map((p,i)=>(i?'L':'M')+xy(p).join(' ')).join(' '));path.setAttribute('stroke','#e7bb69');path.setAttribute('stroke-width','2');path.setAttribute('fill','none');svg.appendChild(path);
   points.forEach((point,index)=>{
     const circle=document.createElementNS(ns,'circle'),[x,y]=xy(point);circle.setAttribute('cx',x);circle.setAttribute('cy',y);circle.setAttribute('r','5');circle.setAttribute('fill',index===selected?'#fff0c4':'#bf9755');circle.style.cursor='grab';circle.dataset.curvePoint=index;svg.appendChild(circle);
     circle.addEventListener('pointerdown',event=>{
       event.preventDefault();event.stopPropagation();selected=index;circle.setPointerCapture(event.pointerId);
       const Move=e=>{const p=At(e);p[0]=index===0?points[0][0]:index===points.length-1?points.at(-1)[0]:Math.max(points[index-1][0]+.005,Math.min(points[index+1][0]-.005,p[0]));points[index]=p.map(n=>Number(n.toFixed(4)));const q=xy(points[index]);circle.setAttribute('cx',q[0]);circle.setAttribute('cy',q[1]);path.setAttribute('d',points.map((k,i)=>(i?'L':'M')+xy(k).join(' ')).join(' '));onChange(Clone(points));};
       const End=()=>{circle.removeEventListener('pointermove',Move);circle.removeEventListener('pointerup',End);circle.removeEventListener('pointercancel',End);Draw();};
       circle.addEventListener('pointermove',Move);circle.addEventListener('pointerup',End);circle.addEventListener('pointercancel',End);
     });
   });
 }
 svg.addEventListener('dblclick',event=>{if(points.length>=32)return;const p=At(event);if(points.some(k=>Math.abs(k[0]-p[0])<.01))return;points.push(p);points.sort((a,b)=>a[0]-b[0]);selected=points.indexOf(p);onChange(Clone(points));Draw();});
 ButtonRow(parent,[{label:'添加控制点',onClick:()=>{if(points.length>=32)return;let gap=0,at=0;for(let i=1;i<points.length;i++)if(points[i][0]-points[i-1][0]>gap){gap=points[i][0]-points[i-1][0];at=i;}const time=(points[at][0]+points[at-1][0])*.5;points.splice(at,0,[time,EvaluateCurve(points,time)]);selected=at;onChange(Clone(points));Draw();}},
   {label:'删除选中点',onClick:()=>{if(points.length<=2||selected===0||selected===points.length-1)return;points.splice(selected,1);selected=0;onChange(Clone(points));Draw();}},
   {label:'扩大范围',onClick:()=>{high=Math.min(max,high*2);if(low<0)low=Math.max(min,low*2);Draw();}},
   {label:'适配曲线',onClick:()=>{({low,high}=AutoRange());Draw();}}]);
 axisLabel=Note(parent,'');Draw();
}
function CurveField(parent,label,value,onChange,{min=0,max=4,step=.01,path=''}={}){
 const box=El('div');box.style.cssText='padding:6px 0;border-bottom:1px solid #343b3e';parent.appendChild(box);
 let current=Clone(value),body=El('div');
 const mode=typeof value==='number'?'constant':Array.isArray(value)?'curve':value.mode;
 const ToKeys=()=>Array.isArray(current)?current:current.curve||[[0,EvaluateCurve(current,0)],[1,EvaluateCurve(current,1)]];
 const Set=value=>{current=value;onChange(Clone(value));};
 const chooser=Select(box,label,[{value:'constant',label:'常数'},{value:'twoConstants',label:'随机区间'},{value:'curve',label:'曲线'},{value:'twoCurves',label:'随机双曲线'}],mode,next=>{
   const middle=EvaluateCurve(current,.5);Set(next==='constant'?middle:next==='twoConstants'?{mode:next,min:Math.min(middle*.8,middle*1.2),max:Math.max(middle*.8,middle*1.2)}:next==='curve'?ToKeys():{mode:next,min:ToKeys(),max:ToKeys()});Draw(next);
 });chooser.root.dataset.curveMode=path;box.appendChild(body);
 function Draw(kind){
   body.replaceChildren();
   if(kind==='constant')NumberField(body,'数值',current,Set,{min,max,step,path});
   else if(kind==='twoConstants')for(const key of ['min','max'])NumberField(body,key==='min'?'最小':'最大',current[key],n=>Set({...current,[key]:n}),{min,max,step,path:path+'.'+key});
   else if(kind==='curve')CurveGraph(body,ToKeys(),Set,{min,max});
   else for(const key of ['min','max']){Note(body,key==='min'?'下限曲线':'上限曲线');CurveGraph(body,Array.isArray(current[key])?current[key]:[[0,EvaluateCurve(current[key],0)],[1,EvaluateCurve(current[key],1)]],keys=>Set({...current,[key]:keys}),{min,max});}
 }Draw(mode);
}
function ColorField(parent,label,color,onChange){
 let value=[...color],gain=Math.max(1,...value.slice(0,3));const swatch=El('input');swatch.type='color';swatch.setAttribute('aria-label',label);
 swatch.value='#'+new THREE.Color().fromArray(value.slice(0,3).map(n=>n/gain)).getHexString();Row(parent,label,swatch);
 swatch.addEventListener('input',()=>{value=[...new THREE.Color(swatch.value).toArray().map(n=>n*gain),value[3]];onChange([...value]);});
 NumberField(parent,'亮度',gain,n=>{const old=gain;gain=n;value=value.map((v,i)=>i<3?v/old*gain:v);onChange([...value]);},{min:0.001,max:32,step:.1});
 NumberField(parent,'透明度',value[3],n=>{value[3]=n;onChange([...value]);},{min:0,max:1,step:.05});
}

export class ParticleInspector {
 constructor(parent,{Read,Patch}){this.parent=parent;this.Read=Read;this.Patch=Patch;}
 Show(){
   this.parent.replaceChildren();const record=this.Read()||{},{modules:m,profile}=record,eventLayer=!!profile||record.name?.startsWith('RuntimeVolume/');if(!m){Note(this.parent,'播放或添加一个粒子层后即可编辑。');return;}
   const Patch=(module,key,value)=>this.Patch({[module]:{[key]:value}});
   const Group=(key,title)=>{const section=El('details');section.dataset.particleModule=key;section.open=key==='main';const summary=El('summary','',title);summary.style.cssText='cursor:pointer;padding:10px 0;font-weight:600;color:#e5c78f';section.appendChild(summary);const body=El('div');section.appendChild(body);this.parent.appendChild(section);if('enabled'in m[key])Toggle(body,'启用',m[key].enabled,on=>Patch(key,'enabled',on));return body;};
   const Curve=(parent,module,key,label,options={})=>CurveField(parent,label,m[module][key],value=>Patch(module,key,value),{...options,path:module+'.'+key});
   const Number=(parent,module,key,label,options={})=>NumberField(parent,label,m[module][key],value=>Patch(module,key,value),{...options,path:module+'.'+key});
   const main=Group('main','主模块 Main');
   if(eventLayer)Note(main,'事件发射层：寿命、速度与尺寸为倍率；形状与发射位置由该效果决定。');
   Number(main,'main','duration','周期 / 秒',{min:.05,max:120,step:.1});
   Toggle(main,'循环',m.main.loop,on=>Patch('main','loop',on));Toggle(main,'预热',m.main.prewarm,on=>Patch('main','prewarm',on));
   Number(main,'main','startDelay','延迟 / 秒',{min:0,max:120,step:.05});
   Curve(main,'main','startLifetime',eventLayer?'寿命倍率':'寿命 / 秒',{min:.02,max:120});
   Curve(main,'main','startSpeed',eventLayer?'速度倍率':'初速 / 米每秒',{min:0,max:100});
   Curve(main,'main','startSize',eventLayer||m.renderer.mode==='bakedVolume'?'尺寸倍率':'初始尺寸 / 米',{min:.001,max:50});
   Curve(main,'main','startRotation','初始旋转 / 弧度',{min:-6.28,max:6.28});
   ColorField(main,'起始颜色',m.main.startColor,value=>Patch('main','startColor',value));
   Number(main,'main','gravityModifier','重力倍率',{min:-10,max:10,step:.1});Number(main,'main','maxParticles','最大粒子数',{min:1,max:this.Read().capacity||4096,step:1});
   Number(main,'main','randomSeed','粒子层种子',{min:0,max:4294967295,step:1});
   Select(main,'模拟空间',[{value:'world',label:'世界'},{value:'local',label:'跟随发射器'}],m.main.simulationSpace,value=>Patch('main','simulationSpace',value));
   const emission=Group('emission','发射 Emission');if(profile)Note(emission,'该层由游戏事件显式发射；启用后可叠加模块的自动发射。');
   Curve(emission,'emission','rateOverTime','每秒发射数',{min:0,max:1000});Number(emission,'emission','rateOverDistance','每米发射数',{min:0,max:1000,step:1});
   for(const [i,burst]of m.emission.bursts.entries()){
     const row=El('div');emission.appendChild(row);Note(row,'爆发 '+(i+1));
     NumberField(row,'时刻 / 秒',burst.time,n=>{const bursts=Clone(this.Read().modules.emission.bursts);bursts[i].time=n;Patch('emission','bursts',bursts)},{min:0,max:m.main.duration});
     CurveField(row,'数量',burst.count,n=>{const bursts=Clone(this.Read().modules.emission.bursts);bursts[i].count=n;Patch('emission','bursts',bursts)},{min:0,max:4096,step:1});
     NumberField(row,'重复次数',burst.cycles||1,n=>{const bursts=Clone(this.Read().modules.emission.bursts);bursts[i].cycles=n;Patch('emission','bursts',bursts)},{min:1,max:100,step:1});
     NumberField(row,'重复间隔 / 秒',burst.repeatInterval||0,n=>{const bursts=Clone(this.Read().modules.emission.bursts);bursts[i].repeatInterval=n;Patch('emission','bursts',bursts)},{min:0,max:120,step:.05});
   }
   ButtonRow(emission,[{label:'添加爆发',onClick:()=>{Patch('emission','bursts',[...m.emission.bursts,{time:0,count:12}]);this.Show();}},{label:'清空爆发',onClick:()=>{Patch('emission','bursts',[]);this.Show();}}]);
   const shape=Group('shape','形状 Shape');Select(shape,'形状',['point','circle','cone','sphere','box','beam'],m.shape.type,value=>{Patch('shape','type',value);this.Show()});
   Number(shape,'shape','radius','半径 / 米',{min:0,max:50});Number(shape,'shape','angle','锥角 / 度',{min:0,max:90,step:1});
   for(let i=0;i<3;i++)NumberField(shape,'盒体 '+['X','Y','Z'][i],m.shape.box[i],value=>{const box=[...this.Read().modules.shape.box];box[i]=value;Patch('shape','box',box)},{min:0,max:100});
   if(m.shape.type==='beam')for(let i=0;i<3;i++)NumberField(shape,'光束方向 '+['X','Y','Z'][i],m.shape.direction[i],value=>{const direction=[...this.Read().modules.shape.direction];direction[i]=value;Patch('shape','direction',direction)},{min:-1,max:1});
   const velocity=Group('velocityOverLifetime','速度随寿命 Velocity');for(const axis of ['x','y','z'])Curve(velocity,'velocityOverLifetime',axis,axis.toUpperCase()+' / 米每秒',{min:-10,max:10});
   const force=Group('forceOverLifetime','力与阻尼 Force');for(const axis of ['x','y','z'])Number(force,'forceOverLifetime',axis,axis.toUpperCase()+' / 米每秒²',{min:-100,max:100});Number(force,'forceOverLifetime','drag','阻尼',{min:0,max:20});
   const size=Group('sizeOverLifetime','尺寸随寿命 Size');Curve(size,'sizeOverLifetime','curve','尺寸曲线',{min:0,max:4});
   const color=Group('colorOverLifetime','颜色随寿命 Color');
   ButtonRow(color,[{label:'添加色标',onClick:()=>{const keys=Clone(this.Read().modules.colorOverLifetime.gradient);if(keys.length>=32)return;let index=1;for(let i=2;i<keys.length;i++)if(keys[i][0]-keys[i-1][0]>keys[index][0]-keys[index-1][0])index=i;const t=(keys[index][0]+keys[index-1][0])/2;keys.splice(index,0,[t,EvaluateGradient(keys,t)]);Patch('colorOverLifetime','gradient',keys);this.Show();}}]);
   for(const [i,key]of m.colorOverLifetime.gradient.entries()){
     const row=El('details'),summary=El('summary','',Math.round(key[0]*100)+'%');row.appendChild(summary);color.appendChild(row);
     NumberField(row,'寿命比例',key[0],value=>{const keys=Clone(this.Read().modules.colorOverLifetime.gradient);keys[i][0]=value;keys.sort((a,b)=>a[0]-b[0]);Patch('colorOverLifetime','gradient',keys)},{min:0,max:1,step:.01});
     ColorField(row,'颜色',key[1],value=>{const keys=Clone(this.Read().modules.colorOverLifetime.gradient);keys[i][1]=value;Patch('colorOverLifetime','gradient',keys)});
     if(i>0&&i<m.colorOverLifetime.gradient.length-1)ButtonRow(row,[{label:'删除色标',onClick:()=>{const keys=Clone(this.Read().modules.colorOverLifetime.gradient);keys.splice(i,1);Patch('colorOverLifetime','gradient',keys);this.Show();}}]);
   }
   const rotation=Group('rotationOverLifetime','旋转随寿命 Rotation');Curve(rotation,'rotationOverLifetime','angularVelocity','角速度 / 弧度每秒',{min:-6.28,max:6.28});
   const noise=Group('noise','扰动 Noise');Curve(noise,'noise','strength','强度 / 米',{min:0,max:2});Number(noise,'noise','frequency','频率',{min:.01,max:20});Number(noise,'noise','scrollSpeed','变化速度',{min:0,max:20});
   const renderer=Group('renderer','渲染 Renderer');
   if(m.renderer.mode==='material')Note(renderer,'材质配置：'+profile);
   else Select(renderer,'类型',['flame','smoke','ember','mote','windowMote','volume','bakedVolume'],m.renderer.mode,value=>{Patch('renderer','mode',value);this.Show();});
   Number(renderer,'renderer','aspect','纵横比',{min:.1,max:10});Number(renderer,'renderer','softRange','软交界 / 米',{min:0,max:5});
   if(['volume','bakedVolume'].includes(m.renderer.mode)||['smoke','sourceSmoke','bombSmoke'].includes(profile))Number(renderer,'renderer','density','体积密度',{min:.01,max:32});
   if(m.renderer.mode==='volume')Number(renderer,'renderer','nearFade','近处渐隐 / 米',{min:0,max:30});
   if(['mote','bakedVolume'].includes(m.renderer.mode))for(let i=0;i<3;i++)NumberField(renderer,'范围 '+['X','Y','Z'][i],m.renderer.bounds[i],value=>{const bounds=[...this.Read().modules.renderer.bounds];bounds[i]=value;Patch('renderer','bounds',bounds)},{min:.01,max:1000});
   if(m.renderer.mode==='bakedVolume'){
     Select(renderer,'三维模拟',Object.keys(PARTICLE_VOLUME_ASSETS),m.renderer.volumeAsset,value=>Patch('renderer','volumeAsset',value));
     Number(renderer,'renderer','volumeSpeed','模拟播放速度',{min:0,max:8});Toggle(renderer,'循环体积序列',m.renderer.volumeLoop,value=>Patch('renderer','volumeLoop',value));
     Number(renderer,'renderer','volumeYaw','体积朝向 / 弧度',{min:-6.28,max:6.28});
     Number(renderer,'renderer','emissionStrength','火焰发光',{min:0,max:100});Number(renderer,'renderer','flameExtinction','热区消光',{min:0,max:100});
   }
 }
}
