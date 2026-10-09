// 特效预览编辑器：直接驱动正片的 VfxSystem，不维护第二套“看起来差不多”的假预览。
// 持续效果来自 SCENE_EFFECTS，因而这里确认过的火/烟参数可以原样进场景关卡 JSON。

import * as THREE from "three";
import { El, Panel, Section, Slider, Select, Toggle, ButtonRow, Facts, Note, ListBox, TextArea }
  from "./Script_EditorUi.mjs";
import { SCENE_EFFECTS } from "./Script_Vfx.mjs";
import {ParticleInspector} from './Script_EditorParticleInspector.mjs';
import {MergeParticleModules,NormalizeParticleModules} from './Script_ParticleModules.mjs';
import {Mulberry32} from './Script_Noise.mjs';
import {FIRST_LEVEL_DISTANT_SMOKE} from './Data_FirstLevelDistantSmoke.mjs';

const INSTANT_EFFECTS = [
  ...[['SootColumn',0,'浓黑烟柱'],['BillowColumn',1,'翻卷烟团'],['DustBank',2,'贴地尘幕'],['WindShear',3,'风切烟带'],['GroundScreen',4,'白色烟幕'],['DustPulse',5,'间歇土烟']].map(([id,frame,name])=>({
    id:'Plume'+id,name:'烟场 · '+name,note:'真实场景同源体积烟',continuous:true,sourceHandle:true,run:(v,s)=>{
      const source=FIRST_LEVEL_DISTANT_SMOKE.find(p=>p.tier!=='far'&&p.options.backdrop.frame===frame),backdrop={...source.options.backdrop,seed:1938};
      for(const key of ['height','baseWidth','crownWidth','driftX','driftZ','spread'])backdrop[key]*=s;
      return v.SmokeSource({x:0,y:.04,z:0},{rate:0,fire:0,backdrop});
    },
  })),
  {id:'Empty',name:'空白粒子效果',note:'添加粒子层建立新预设',run:()=>{}},
  {id:'DustMotes',name:'环境 · 悬浮尘',note:'具有世界视差的微粒',continuous:true,run:v=>v.AmbientDust(new THREE.Box3(new THREE.Vector3(-8,0,-8),new THREE.Vector3(8,6,8)),.12)},
  {id:'ShellCasings',name:'弹壳 · 抛出与弹跳',note:'真实口径尺寸与金属反光',run:v=>{for(let i=0;i<6;i++)v.ShellCasing(new THREE.Vector3(0,1.1,0),new THREE.Vector3(1,.2,0),'7.92');}},
  {id:'ImpactWater',name:'命中 · 水面',note:'水花与涟漪',run:v=>v.Impact(new THREE.Vector3(0,.02,0),new THREE.Vector3(0,1,0),'water')},
  { id: "ExplosionGrenade", name: "爆炸 · 手榴弹", note: "半径 4 m", run: (v, s) => v.Explosion({ x: 0, y: 0.12, z: 0 }, { radius: 4 * s, kind: "grenade", groundY: 0 }) },
  { id: "ExplosionMortar", name: "爆炸 · 掷弹筒", note: "半径 7 m", run: (v, s) => v.Explosion({ x: 0, y: 0.16, z: 0 }, { radius: 7 * s, kind: "launcher", groundY: 0 }) },
  { id: "ExplosionShell", name: "爆炸 · 炮弹", note: "半径 11 m", run: (v, s) => v.Explosion({ x: 0, y: 0.18, z: 0 }, { radius: 11 * s, kind: "shell", groundY: 0 }) },
  { id: "MuzzleRifle", name: "枪口焰 · 步枪", note: "两帧焰 + 枪烟", run: (v, s) => v.MuzzleFlash(new THREE.Vector3(0, 1.05, 0), new THREE.Vector3(0, 0, -1), { scale: s, kind: "rifle" }) },
  { id: "MuzzleMg", name: "枪口焰 · 机枪", note: "连续武器单次反馈", run: (v, s) => v.MuzzleFlash(new THREE.Vector3(0, 1.05, 0), new THREE.Vector3(0, 0, -1), { scale: s, kind: "lmg" }) },
  { id: "ImpactBrick", name: "命中 · 砖墙", note: "砖粉、碎块与弹孔", run: (v) => v.Impact(new THREE.Vector3(0, 0.85, 0), new THREE.Vector3(0, 0, -1), "brick") },
  { id: "ImpactDirt", name: "命中 · 泥土", note: "土扬尘与碎块", run: (v) => v.Impact(new THREE.Vector3(0, 0.05, 0), new THREE.Vector3(0, 1, 0), "dirt") },
  { id: "ImpactWood", name: "命中 · 木材", note: "木屑与粉尘", run: (v) => v.Impact(new THREE.Vector3(0, 0.85, 0), new THREE.Vector3(0, 0, -1), "wood") },
  { id: "ImpactMetal", name: "命中 · 金属", note: "火星与跳弹", run: (v) => v.Impact(new THREE.Vector3(0, 0.85, 0), new THREE.Vector3(0, 0, -1), "metal") },
  { id: "Tracer", name: "曳光弹", note: "中方暖白弹道", run: (v) => v.Tracer(new THREE.Vector3(-4, 1.1, 0), new THREE.Vector3(4, 1.1, 0), { speed: 90, kind: "nra" }) },
  { id: "TracerBeam", name: "战车机枪光束", note: "枪口到弹着点一整条，弹头 + 余辉", run: (v) => v.TracerBeam(new THREE.Vector3(-6, 1.3, -3), new THREE.Vector3(3, 0.9, 1), { speed: 60, kind: "ija" }) },
  { id: "ImpactBrickSparks", name: "命中 · 砖墙（战车机枪）", note: "砖粉 + 顺反弹方向的火星与亮闪", run: (v) => v.Impact(new THREE.Vector3(0, 0.85, 0), new THREE.Vector3(0, 0, -1), "brick", { weaponKind: "lmg", hardSparks: true, incoming: new THREE.Vector3(0.6, -0.1, 1).normalize() }) },
  { id: "Blood", name: "血雾", note: "命中反馈：雾芯+溅射+血滴+地渍", run: (v, s) => v.Blood(new THREE.Vector3(0, 1.0, 0), new THREE.Vector3(0, 0, -1), s) },
  { id: "Incoming", name: "炮弹落点预警", note: "准星贴图 + 收缩环 + 落点尘", run: (v) => v.IncomingMarker(new THREE.Vector3(0, 0.03, 0), 2.6, { radius: 11 }) },
];

const CONTINUOUS = Object.entries(SCENE_EFFECTS).map(([id, effect]) => ({
  id, name: effect.name, note: effect.note, continuous: true,
}));
const ALL_EFFECTS = [...CONTINUOUS, ...INSTANT_EFFECTS];

export class VfxEditor {
  static id = "vfx";
  static label = "特效预览";
  static hint = "查看火焰、烟雾、爆炸、命中、枪口焰与曳光";

  constructor(host) {
    this.host = host;
    this.studio = host.studio;
    this.cameraMode = "studio";
    this.panel = null;
    this.effectId = "FireMedium";
    this.handle = 0;
    this.scale = 1;
    this.loop = true;
    this.loopInterval = 2.5;
    this.loopTimer = 0;
    this.playing = false;
    this.savedWind = null;
    this.savedVfxVisible = true;
    this.savedSources = null;
    this.savedNextSourceId = 1;
    this.savedParticles = null;
    this.savedDustVisible = null;
    this.wind = new THREE.Vector3();
    this.previewTime=0;this.paused=false;this.speed=1;this.seed=1938;
    this.layerPatches=new Map();this.layerRecords=new Map();this.customLayers=[];this.customIds=[];
    this.selectedLayer=null;this.customIndex=0;this.uiAge=0;this.seekFrame=0;this.banks=new Map();
  }

  Enter(root) {
    const vfx = this.host.vfx;
    this.savedWind = vfx.wind.clone();
    this.wind.copy(this.savedWind);
    this.savedVfxVisible = vfx.root.visible;
    this.savedVfxTime = vfx.time;
    this.savedVfxRandom = vfx.random;
    // 预览必须是隔离的：现关烟柱不能在摄影棚期间偷偷推进，预览的弹孔/爆炸也
    // 不能关掉工具后留在正片原点。保存池与持续源，退出时逐字节还原。
    this.savedParticleEffects = vfx.particles;
    this.savedParticleEffectsVisible = vfx.particles.root.visible;
    this.savedParticleEffects.root.visible = false;
    vfx.particles = vfx.particles.Fork();
    this.savedParticlePools=vfx.pools;
    vfx.pools=Object.fromEntries(Object.entries(vfx.pools).map(([name,pool])=>[name,pool.particleId?vfx.particles.channels.get(pool.profile):pool]));
    this.savedDebris=vfx.debris;this.savedChunks=vfx.chunks;
    vfx.debris=vfx.particles.channels.get(vfx.debris.profile);
    vfx.chunks=Object.fromEntries(Object.entries(vfx.chunks).map(([name,pool])=>[name,vfx.particles.channels.get(pool.profile)]));
    this.savedBlood=vfx.bloodEffects.BeginPreview(vfx.pools.bloodMist,vfx.pools.bloodDrop);
    this.savedGroundLevel=vfx.groundLevel;vfx.SetGroundLevel(0);
    vfx.bloodSpurts=vfx.bloodEffects.sources;
    this.savedBattleSmoke = vfx.battleSmoke;
    this.savedBattleSmokeVisible = vfx.battleSmoke?.mesh.visible;
    if (vfx.battleSmoke) vfx.battleSmoke.mesh.visible = false;
    vfx.battleSmoke = null;
    this.savedSources = vfx.smokeSources;
    this.savedNextSourceId = vfx.nextSourceId;
    this.savedParticles = this.CaptureParticles(vfx);
    this.savedLighting=this.host.lights?.BeginEffectPreview?.();
    if(!this.savedLighting)for (const source of this.savedSources.values()) vfx.DetachSourceLight(source);
    vfx.smokeSources = new Map();
    for (const pool of Object.values(vfx.pools)) pool.Clear();
    vfx.debris.Clear();
    this.savedDust=vfx.dust;this.savedDustVisible=vfx.dust?.mesh.visible;
    if(vfx.dust)vfx.dust.mesh.visible=false;
    vfx.dust=null;
    this.studio.Open(this.host.hideInStudio);
    // The studio owns the visible scene here. Keep its authored particle/mesh
    // materials without changing the game's whitebox config or saved preferences.
    const whitebox=this.host.post?.whiteboxScene;
    this.savedWhiteboxConfig=whitebox?.config??null;
    if(whitebox){whitebox.config={...whitebox.config,effects:true,assetTextures:true};whitebox.Invalidate();}
    // WorldMask 会把场景直属的 VfxRoot 一起藏掉；预览器明确把它列为展品。
    vfx.root.visible = true;
    this.studio.SetGridVisible(true);
    this.studio.Frame(3.4, 8.5);
    this.panel = Panel({
      title: "粒子特效编辑器", sub: this.savedWhiteboxConfig?"白盒环境 · 保留特效材质":"游戏同源预览",
      variant: "work", onClose: () => this.host.Close(),
    });
    root.appendChild(this.panel.root);
    this.panel.root.dataset.vfxEditor='modules';
    this.baseModules=new Map([...vfx.particles.channels].map(([name,channel])=>[name,JSON.parse(JSON.stringify(channel.system.modules))]));
    this.BuildUi(this.panel.body);
    this.onPreviewKey=event=>{
      if(event.target.closest?.('input,textarea,select,button,summary'))return;
      if(event.code==='Space'){event.preventDefault();event.stopPropagation();this.TogglePause();}
      if(event.code==='ArrowRight'){event.preventDefault();event.stopPropagation();this.Step(event.shiftKey?10:1);}
      if(event.code==='Home'){event.preventDefault();event.stopPropagation();this.Seek(0);}
    };
    document.addEventListener('keydown',this.onPreviewKey,true);
    this.Play();
    return this;
  }

  Exit() {
    cancelAnimationFrame(this.seekFrame);document.removeEventListener('keydown',this.onPreviewKey,true);
    this.Stop();
    const vfx = this.host.vfx;
    vfx.bloodEffects.EndPreview(this.savedBlood);vfx.bloodSpurts=vfx.bloodEffects.sources;
    vfx.particles.Dispose();
    vfx.particles = this.savedParticleEffects;
    vfx.pools=this.savedParticlePools;this.savedParticlePools=null;
    vfx.debris=this.savedDebris;vfx.chunks=this.savedChunks;
    vfx.SetGroundLevel(this.savedGroundLevel);
    vfx.particles.root.visible = this.savedParticleEffectsVisible;
    this.savedParticleEffects = null;
    vfx.battleSmoke?.Dispose();vfx.battleSmoke=this.savedBattleSmoke;
    if (vfx.battleSmoke) vfx.battleSmoke.mesh.visible = this.savedBattleSmokeVisible;
    vfx.time=this.savedVfxTime;vfx.shared.uTime.value=vfx.time;
    vfx.random=this.savedVfxRandom;
    if (this.savedSources) {
      vfx.smokeSources = this.savedSources;
      if(!this.savedLighting)for (const source of this.savedSources.values()) vfx.AttachSourceLight(source);
    }
    vfx.nextSourceId = this.savedNextSourceId;
    if (this.savedParticles) this.RestoreParticles(vfx, this.savedParticles);
    vfx.dust?.Dispose();vfx.dust=this.savedDust;
    if (vfx.dust && this.savedDustVisible != null) vfx.dust.mesh.visible = this.savedDustVisible;
    if (this.savedWind) vfx.SetWind(this.savedWind);
    if (this.panel) this.panel.root.remove();
    this.panel = null;
    if(this.savedWhiteboxConfig){const whitebox=this.host.post.whiteboxScene;whitebox.config=this.savedWhiteboxConfig;whitebox.Invalidate();this.savedWhiteboxConfig=null;}
    this.studio.Close();
    if(this.savedLighting)this.host.lights.EndEffectPreview(this.savedLighting,this.savedVfxTime);
    vfx.root.visible = this.savedVfxVisible;
    this.savedSources = null;
    this.savedParticles = null;
    this.savedDustVisible = null;
  }

  CaptureParticles(vfx) {
    const Capture = (pool) => ({
      cursor: pool.cursor,
      deathTime: pool.deathTime.slice(),
      arrays: Object.fromEntries(Object.entries(pool.arrays)
        .map(([name, array]) => [name, array.slice()])),
    });
    return {
      pools: Object.fromEntries(Object.entries(vfx.pools)
        .filter(([,pool])=>!pool.particleId)
        .map(([name, pool]) => [name, Capture(pool)])),
      debris: vfx.debris.particleId?null:Capture(vfx.debris),
      lastExplosionSprite: vfx.lastExplosionSprite,
      lastMuzzleProfile: vfx.lastMuzzleProfile,
    };
  }

  RestoreParticles(vfx, snapshot) {
    const Restore = (pool, saved) => {
      if (!pool || !saved) return;
      pool.cursor = saved.cursor;
      pool.deathTime.set(saved.deathTime);
      for (const [name, array] of Object.entries(saved.arrays)) pool.arrays[name]?.set(array);
      pool.dirtyMin = 0;
      pool.dirtyMax = pool.capacity - 1;
      pool.Flush(vfx.time);
    };
    for (const [name, saved] of Object.entries(snapshot.pools)) Restore(vfx.pools[name], saved);
    if(snapshot.debris)Restore(vfx.debris, snapshot.debris);
    vfx.lastExplosionSprite = snapshot.lastExplosionSprite;
    vfx.lastMuzzleProfile = snapshot.lastMuzzleProfile;
  }

  BuildUi(body) {
    const transport=El('div');transport.style.cssText='flex:0 0 auto;background:#101416;border-bottom:1px solid #363d40';this.panel.root.insertBefore(transport,body);
    const playback=Section(transport,'播放与时间');
    const buttons=ButtonRow(playback,[{label:'播放',onClick:()=>this.Play()},{label:'暂停',onClick:()=>this.TogglePause()},
      {label:'单帧',onClick:()=>this.Step()},{label:'归零',onClick:()=>this.Seek(0)},{label:'停止',onClick:()=>this.Stop()}]);
    ['play','pause','step','restart','stop'].forEach((key,i)=>buttons.children[i].dataset.vfxAction=key);this.pauseButton=buttons.children[1];
    this.timeSlider=Slider(playback,{label:'时间',min:0,max:10,step:1/60,value:0,format:v=>v.toFixed(2)+' s',onInput:value=>this.QueueSeek(value)});
    this.timeSlider.root.querySelector('input').dataset.vfxTime='true';
    Select(playback,'时间轴长度',[{value:10,label:'10 秒'},{value:30,label:'30 秒'},{value:60,label:'60 秒'}],10,value=>this.timeSlider.root.querySelector('input').max=value);
    Select(playback,'播放速度',[.1,.25,.5,1,2].map(value=>({value,label:value+'×'})),1,value=>{this.speed=Number(value)});
    Note(playback,'空格暂停/继续 · → 单帧 · Shift+→ 十帧 · Home 归零');
    this.message=Note(transport,'');this.message.setAttribute('role','status');this.message.dataset.vfxStatus='true';
    const tabs=ButtonRow(transport,[{label:'效果库',onClick:()=>this.ShowTab('library')},{label:'粒子模块',onClick:()=>this.ShowTab('modules')},{label:'预设',onClick:()=>this.ShowTab('presets')}]);
    ['library','modules','presets'].forEach((key,i)=>tabs.children[i].dataset.vfxTab=key);
    this.tabs={};for(const key of ['library','modules','presets']){const box=El('div');box.dataset.vfxPanel=key;body.appendChild(box);this.tabs[key]=box;}
    const library=Section(this.tabs.library,'效果库');
    this.effectList=ListBox(library,{height:240,onPick:id=>this.SelectEffect(id)});
    this.effectList.Fill(ALL_EFFECTS.map(effect=>({id:effect.id,name:effect.name,tail:effect.continuous?'持续':'瞬时',title:effect.note})));this.effectList.Select(this.effectId);
    const environment=Section(this.tabs.library,'规模与环境');
    Toggle(environment,'自动重播瞬时效果',this.loop,on=>{this.loop=on});
    Slider(environment,{label:'整体缩放',min:.25,max:3,step:.05,value:this.scale,onInput:value=>{this.scale=value;this.Play()}});
    Slider(environment,{label:'重播间隔',min:.4,max:12,step:.1,value:this.loopInterval,onInput:value=>{this.loopInterval=value}});
    for(const axis of ['x','z'])Slider(environment,{label:'风 '+axis.toUpperCase(),min:-4,max:4,step:.1,value:this.wind[axis],onInput:value=>{this.wind[axis]=value;this.ApplyWind()}});
    const seed=El('input');seed.type='number';seed.min='0';seed.max='4294967295';seed.step='1';seed.value=this.seed;seed.dataset.vfxSeed='true';seed.setAttribute('aria-label','预览随机种子');
    seed.addEventListener('change',()=>{const value=Number(seed.value);if(Number.isInteger(value)&&value>=0&&value<=4294967295){this.seed=value;this.Play();}});environment.appendChild(seed);
    Toggle(environment,'显示米格',true,on=>this.studio.SetGridVisible(on));
    ButtonRow(environment,[{label:'适配镜头',onClick:()=>this.FrameEffect()}]);Note(environment,'在画面空白处拖动旋转，滚轮缩放。');
    const layers=Section(this.tabs.modules,'粒子层');
    this.layerSelect=Select(layers,'编辑层',[],null,key=>{this.selectedLayer=key;this.inspector.Show()});this.layerSelect.root.dataset.vfxLayer='true';
    const presets=this.host.vfx.particles.Presets();this.addPreset=Select(layers,'新粒子层',presets,'FireTongue',()=>{});
    ButtonRow(layers,[{label:'添加粒子层',onClick:()=>this.AddLayer(this.addPreset.Value())},{label:'删除自建层',onClick:()=>this.DeleteLayer()}]);
    Note(layers,'生命周期曲线实时生效；初始尺寸、速度等发射参数在新粒子或重播时生效。');
    this.inspectorBody=El('div');this.tabs.modules.appendChild(this.inspectorBody);
    this.inspector=new ParticleInspector(this.inspectorBody,{Read:()=>this.ReadLayer(),Patch:patch=>this.EditLayer(patch)});
    const storage=Section(this.tabs.presets,'保存与导入');
    this.savedName=El('input');this.savedName.placeholder='预设名称';this.savedName.value='我的粒子预设';this.savedName.setAttribute('aria-label','预设名称');storage.appendChild(this.savedName);
    this.savedSelect=Select(storage,'本机预设',[],null,()=>{});
    ButtonRow(storage,[{label:'保存到浏览器',onClick:()=>this.SaveLocal()},{label:'载入选中预设',onClick:()=>this.LoadLocal()}]);
    Note(storage,'本机保存用于下次继续编辑；下载 JSON 可交给 agent 或在别处导入。');
    this.json=TextArea(storage,{rows:9,placeholder:'导出当前效果，或粘贴粒子预设 JSON 后导入。'});this.json.dataset.vfxPreset='true';
    ButtonRow(storage,[{label:'生成 JSON',onClick:()=>{this.json.value=JSON.stringify(this.Export(),null,2);this.Status('已生成当前效果预设。')}},
      {label:'导入 JSON',onClick:()=>this.Try(()=>this.Import(JSON.parse(this.json.value)))},{label:'下载 JSON',onClick:()=>this.Download()}]);
    const file=El('input');file.type='file';file.accept='.json,application/json';file.setAttribute('aria-label','选择粒子预设文件');
    file.addEventListener('change',async()=>{const chosen=file.files?.[0];if(!chosen)return;const text=await chosen.text();if(this.panel)this.Try(()=>this.Import(JSON.parse(text)));});storage.appendChild(file);
    ButtonRow(storage,[{label:'应用参数到当前关卡同名层',onClick:()=>this.ApplyToScene()}]);
    Note(storage,'应用到关卡会更新已存在及后续生成的同名层；不会直接改写项目源文件。');
    this.facts=Facts(Section(body,'运行状态'));this.RefreshSaved();this.ShowTab('library');
  }
  ShowTab(tab){for(const [key,box]of Object.entries(this.tabs))box.hidden=key!==tab;if(tab==='modules')this.inspector.Show();}
  Status(message,error=false){if(!this.message)return;this.message.textContent=message;this.message.style.color=error?'#ffae98':'#c9d6c7';}
  Try(run){try{return run()}catch(error){this.Status(error.message,true);return false}}
  IsContinuous(){return !!SCENE_EFFECTS[this.effectId]||!!INSTANT_EFFECTS.find(effect=>effect.id===this.effectId)?.continuous;}
  ApplyWind(){this.host.vfx.SetWind(this.wind);}
  Key(entry){return entry.editorKey||(entry.profile?'channel:'+entry.profile:'preset:'+entry.preset);}
  Effects(){return ALL_EFFECTS.map(({id,name,note,continuous})=>({id,name,note,continuous:!!continuous}));}
  SelectLayer(key){if(!this.layerRecords.has(key))throw new Error('粒子层不存在：'+key);this.selectedLayer=key;this.layerSelect.Set(key);this.inspector.Show();return this.ReadLayer();}
  SelectEffect(id){
    if(!ALL_EFFECTS.some(effect=>effect.id===id))throw new Error('Unknown particle effect '+id);
    this.banks.set(this.effectId,{patches:this.layerPatches,custom:this.customLayers});this.effectId=id;
    const bank=this.banks.get(id);this.layerPatches=bank?.patches||new Map();this.customLayers=bank?.custom||[];this.selectedLayer=null;
    if(id==='Empty')this.loop=false;this.Play();this.FrameEffect();
  }
  CaptureLayers(){
    const api=this.host.vfx.particles;
    for(const [id,entry]of api.systems){if(!entry.system.emitted&&!entry.editorKey&&!entry.name.startsWith('Burning/'))continue;
      const key=this.Key(entry);this.layerRecords.set(key,{id,key,...api.Export(id),capacity:api.renderer.streams.get(entry.system)?.capacity});}
  }
  RefreshLayers(force=false){
    this.CaptureLayers();const options=[...this.layerRecords].map(([key,value])=>({value:key,label:(value.name?.startsWith('Burning/')?value.preset:value.profile||value.name)||key}));
    const signature=options.map(p=>p.value).join('|');
    if(force||signature!==this.layerSignature){this.layerSignature=signature;if(!this.layerRecords.has(this.selectedLayer))this.selectedLayer=options[0]?.value||null;
      this.layerSelect?.Fill(options,this.selectedLayer);this.inspector?.Show();}
  }
  ReadLayer(){
    const record=this.layerRecords.get(this.selectedLayer);if(!record)return null;
    if(this.host.vfx.particles.systems.has(record.id))return {...record,...this.host.vfx.particles.Export(record.id)};
    return record;
  }
  EditLayer(patch){return this.Try(()=>{
    const record=this.ReadLayer();if(!record)throw new Error('请先选择一个粒子层。');
    const modules=MergeParticleModules(record.modules,patch),api=this.host.vfx.particles;
    if(api.systems.has(record.id))api.Configure(record.id,patch);
    const previous=this.layerPatches.get(this.selectedLayer)||{},next={...previous};for(const [key,value]of Object.entries(patch))next[key]={...next[key],...value};
    this.layerPatches.set(this.selectedLayer,next);this.layerRecords.set(this.selectedLayer,{...record,modules});this.Status('参数已更新；发射参数可按“播放”重播查看。');return true;
  });}
  Stop(){
    this.CaptureLayers();const vfx=this.host.vfx;
    if(this.handle)vfx.RemoveSceneEffect(this.handle);this.handle=0;
    if(vfx.dust){vfx.dust.Dispose();vfx.dust=null;}
    for(const id of this.customIds)if(vfx.particles.systems.has(id))vfx.particles.Remove(id);this.customIds=[];
    vfx.ClearParticles();vfx.bloodEffects.Clear();if(this.savedLighting)this.host.lights.ResetEffectPreview();
    this.playing=false;this.paused=false;this.loopTimer=0;this.UpdateFacts();
  }
  Play(){
    this.Stop();const vfx=this.host.vfx,api=vfx.particles;this.layerRecords.clear();
    vfx.time=0;vfx.shared.uTime.value=0;vfx.nextSourceId=1+(this.seed%65535);vfx.random=Mulberry32(this.seed);vfx.bloodEffects.random=vfx.random;
    for(const [name,channel]of api.channels){if(!api.systems.has(channel.particleId))continue;api.Configure(channel.particleId,this.baseModules.get(name));const patch=this.layerPatches.get('channel:'+name);if(patch)api.Configure(channel.particleId,patch);}
    api.presetOverrides.clear();for(const [key,patch]of this.layerPatches)if(key.startsWith('preset:'))api.presetOverrides.set(key.slice(7),patch);
    api.Restart();for(const channel of api.channels.values())if(api.systems.has(channel.particleId))channel.system.Play({restart:true});api.renderer.Flush();this.ApplyWind();this.previewTime=0;this.loopTimer=0;this.paused=false;
    if(SCENE_EFFECTS[this.effectId])this.handle=vfx.SceneEffect({x:0,y:.04,z:0},this.effectId,{scale:this.scale});
    else {const effect=INSTANT_EFFECTS.find(effect=>effect.id===this.effectId),result=effect?.run(vfx,this.scale);if(effect?.sourceHandle)this.handle=result;}
    for(const layer of this.customLayers){const definition=JSON.parse(JSON.stringify(layer.definition)),patch=this.layerPatches.get(layer.key);
      if(patch)definition.modules=MergeParticleModules(definition.modules,patch);const created=api.Import(definition);api.Get(created.id).editorKey=layer.key;this.customIds.push(created.id);}
    this.playing=true;this.Advance(0);this.host.post?.NotifyCameraCut();this.RefreshLayers(true);this.UpdateFacts();
  }
  Advance(dt){
    let remaining=Math.max(0,dt);do{const step=Math.min(1/60,remaining);this.previewTime+=step;
      this.host.vfx.Update(step,this.host.camera,this.previewTime);if(this.savedLighting)this.host.lights.Update(step,this.previewTime,this.host.camera.position);
      remaining-=step;
    }while(remaining>1e-9);
  }
  TogglePause(){if(!this.playing){this.Play();return;}this.paused=!this.paused;this.UpdateFacts();}
  Step(frames=1){if(!this.playing)this.Play();for(let i=0;i<Math.max(1,Math.min(600,frames|0));i++)this.Advance(1/60);this.loopTimer=this.previewTime;this.paused=true;this.RefreshLayers();this.UpdateFacts();}
  Seek(seconds){if(!Number.isFinite(seconds)||seconds<0||seconds>120)throw new Error('预览时间必须为 0–120 秒。');
    this.Play();const frames=Math.floor(seconds*60);for(let i=0;i<frames;i++)this.Advance(1/60);if(seconds-frames/60>1e-8)this.Advance(seconds-frames/60);
    this.loopTimer=this.previewTime;this.paused=true;this.host.post?.NotifyCameraCut();this.RefreshLayers(true);this.UpdateFacts();return this.Inspect();}
  QueueSeek(seconds){this.seekTarget=seconds;if(this.seekFrame)return;this.seekFrame=requestAnimationFrame(()=>{this.seekFrame=0;if(this.panel)this.Try(()=>this.Seek(this.seekTarget))});}
  FrameEffect(){
    const id=this.effectId,small=/^(Muzzle|Impact|Blood|ShellCasings)/.test(id);
    const height=/Explosion/.test(id)?(id==='ExplosionShell'?9:6)*this.scale:/Smoke|Plume/.test(id)?7:small?1.8:3.4*this.scale;
    this.studio.Frame(height,small?2.5:Math.max(4,height*2.2));this.host.post?.NotifyCameraCut();
  }
  AddLayer(preset){return this.Try(()=>{const api=this.host.vfx.particles,created=api.Create({preset,name:'自建 '+preset});const key='custom:'+(++this.customIndex);
    api.Get(created.id).editorKey=key;this.customLayers.push({key,definition:api.Export(created.id)});this.customIds.push(created.id);this.selectedLayer=key;this.playing=true;this.RefreshLayers(true);return created;});}
  DeleteLayer(){if(!this.selectedLayer?.startsWith('custom:')){this.Status('预置效果层可在 Renderer 中关闭显示；删除用于自建层。');return;}
    const record=this.ReadLayer();if(record&&this.host.vfx.particles.systems.has(record.id))this.host.vfx.particles.Remove(record.id);
    this.customLayers=this.customLayers.filter(layer=>layer.key!==this.selectedLayer);this.layerPatches.delete(this.selectedLayer);this.layerRecords.delete(this.selectedLayer);this.selectedLayer=null;this.RefreshLayers(true);}
  Export(){return {version:1,kind:'TengxianParticleEffect',effect:this.effectId,seed:this.seed,scale:this.scale,wind:[this.wind.x,this.wind.z],
    layers:Object.fromEntries(this.layerPatches),custom:JSON.parse(JSON.stringify(this.customLayers))};}
  Import(data){
    if(data?.version!==1||data.kind!=='TengxianParticleEffect'||!ALL_EFFECTS.some(effect=>effect.id===data.effect))throw new Error('不是受支持的粒子效果预设。');
    if(!Number.isInteger(data.seed)||data.seed<0||data.seed>4294967295||!Number.isFinite(data.scale)||data.scale<.25||data.scale>3)throw new Error('预设的种子或缩放无效。');
    if(!Array.isArray(data.wind)||data.wind.length!==2||data.wind.some(n=>!Number.isFinite(n)||Math.abs(n)>4))throw new Error('预设风速无效。');
    const patches=new Map(Object.entries(data.layers||{}));for(const [key,patch]of patches){if(!/^(channel|preset|custom):[A-Za-z0-9_]+$/.test(key))throw new Error('粒子层标识无效。');MergeParticleModules(NormalizeParticleModules(),patch);}
    const custom=data.custom||[];if(!Array.isArray(custom)||custom.length>24)throw new Error('最多支持 24 个自建粒子层。');
    const api=this.host.vfx.particles;if(new Set(custom.map(layer=>layer.key)).size!==custom.length)throw new Error('自建层标识不能重复。');
    for(const [key]of patches){if(key.startsWith('preset:')&&!api.Presets().includes(key.slice(7)))throw new Error('未知的粒子预设层。');if(key.startsWith('channel:')&&!api.profiles.has(key.slice(8)))throw new Error('未知的粒子通道层。');}
    for(const layer of custom){if(!/^custom:\d+$/.test(layer.key)||!layer.definition)throw new Error('自建粒子层无效。');NormalizeParticleModules(layer.definition.modules);
      if(layer.definition.profile?!api.profiles.has(layer.definition.profile):!api.Presets().includes(layer.definition.preset))throw new Error('缺少预设使用的渲染配置。');}
    this.Stop();this.effectId=data.effect;this.seed=data.seed;this.scale=data.scale;this.wind.set(data.wind[0],0,data.wind[1]);this.layerPatches=patches;
    this.customLayers=JSON.parse(JSON.stringify(custom));this.customIndex=Math.max(0,...custom.map(layer=>Number(layer.key.slice(7))));this.effectList.Select(this.effectId);this.selectedLayer=null;this.Play();this.Status('预设已载入。');return this.Inspect();
  }
  ReadSaved(){try{return JSON.parse(localStorage.getItem('Tengxian.ParticleEffectPresets.v1')||'{}')}catch{return {}}}
  RefreshSaved(){const saved=this.ReadSaved();this.savedSelect?.Fill(Object.keys(saved).map(value=>({value,label:value})));}
  SaveLocal(){this.Try(()=>{const name=this.savedName.value.trim()||this.effectId,saved=this.ReadSaved();Object.defineProperty(saved,name,{value:this.Export(),enumerable:true,configurable:true,writable:true});localStorage.setItem('Tengxian.ParticleEffectPresets.v1',JSON.stringify(saved));this.RefreshSaved();this.savedSelect.Set(name);this.Status('已保存到此浏览器。');});}
  LoadLocal(){this.Try(()=>{const data=this.ReadSaved()[this.savedSelect.Value()];if(!data)throw new Error('请选择已保存的预设。');this.Import(data);});}
  Download(){const text=JSON.stringify(this.Export(),null,2);this.json.value=text;const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const link=El('a');link.href=url;link.download='Data_ParticleEffect_'+this.effectId+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  ApplyToScene(){return this.Try(()=>{const target=this.savedParticleEffects;let changed=0;
    for(const [id,entry]of target.systems){const key=this.Key(entry),patch=this.layerPatches.get(key);if(patch){target.Configure(id,patch);changed++;}}
    for(const [key,patch]of this.layerPatches)if(key.startsWith('preset:'))target.presetOverrides.set(key.slice(7),patch);
    this.Status('已更新关卡中的 '+changed+' 个同名粒子层；可退出预览查看。');return {changed};});}
  Inspect(){return {effect:this.effectId,time:this.previewTime,paused:this.paused,playing:this.playing,seed:this.seed,selectedLayer:this.selectedLayer,
    layers:[...this.layerRecords].map(([key,value])=>({key,id:value.id,profile:value.profile,preset:value.preset})),particles:this.host.vfx.particles.Inspect()};}
  UpdateFacts(){if(!this.facts)return;const entries=this.host.vfx.particles.Inspect().entries;
    this.facts.Set('当前效果',ALL_EFFECTS.find(effect=>effect.id===this.effectId)?.name||this.effectId);
    this.facts.Set('预览时间',this.previewTime.toFixed(2)+' s');this.facts.Set('存活粒子',entries.reduce((n,e)=>n+e.particleCount,0));
    this.facts.Set('参与层数',this.layerRecords.size);this.facts.Set('丢弃',entries.reduce((n,e)=>n+e.dropped,0));this.facts.Set('随机种子',this.seed);
    this.timeSlider?.Set(this.previewTime);if(this.pauseButton)this.pauseButton.textContent=this.paused?'继续':'暂停';}
  Update(dt){
    const step=this.playing&&!this.paused?Math.max(0,Math.min(.1,dt||0))*this.speed:0;
    if(!this.IsContinuous()&&this.playing&&!this.paused&&this.loop){this.loopTimer+=step;if(this.loopTimer>=this.loopInterval){this.Play();}}
    this.Advance(step);this.uiAge+=Math.max(0,dt||0);if(this.uiAge>.15||step===0){this.uiAge=0;this.RefreshLayers();this.UpdateFacts();}
  }

}

export default VfxEditor;
