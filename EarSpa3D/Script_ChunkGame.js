import * as THREE from 'three';
import {CARE_CASES,CARE_CASE_IDS,CustomerCase,CaseProgress} from './Data_CareCases.mjs?v=ear049-care-cases-20261013';
import {CreatePrecisionInput} from './Script_PrecisionInput.mjs?v=ear048-pointer-alignment-20261013';
import {CreateRenderQualitySettings} from './Script_RenderQualitySettings.mjs?v=ear040-render-settings-20260912';
import {ResolveRenderQuality} from './Data_RenderQuality.mjs?v=ear040-render-settings-20260912';
import {ContactFriction} from './Script_ContactFriction.mjs?v=ear035-sticky-scrape-audio-20260912';
import {CreatePhysicsSettings} from './Script_PhysicsSettings.mjs?v=ear028-physics-settings-20260912';
import {CUSTOMER_EARS,CustomerEarType} from './Data_CustomerTypes.mjs?v=ear029-oily-coating-20260912';
import { ToolIcon } from './Script_ToolIcons.mjs?v=ear014-ui-20260912';
import { CreateCore } from './Script_Core.js?v=ear043-runtime-performance-20261003';
import { CreateImmersiveScene } from './Script_ImmersiveScene.js?v=ear049-care-cases-20261013';
import { CreateAudio } from './Script_Audio.js?v=ear035-sticky-scrape-audio-20260912';
import { LandingSound } from './Script_LandingSound.mjs?v=ear012-size-audio-20260912';
import { CreateShop } from './Script_Shop.js?v=ear049-care-cases-20261013';
import { MakeRng } from './Script_Util.js?v=ear011-20260911';
import { CSS_VARS, PALETTE } from './Data_Palette.mjs?v=ear011-20260911';

import { CreateInstrumentShop } from './Script_InstrumentShop.js?v=ear046-click-care-20261012';

const VERSION = 'ear049-care-cases-20261013';
const Clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const TOOL_IDS = { scoop: 'earPickBamboo', tweezers: 'earForceps', drops: 'earDrops',brush:'softBrush',suction:'microSuction',feather:'gooseFeather' };
const TYPE_NAMES = { dry: '干性薄层', wet: '黏性耳垢', impacted: '紧实硬结', oily:'油性凝胶' };


export async function Start() {
  for (const [key, value] of Object.entries(CSS_VARS)) document.documentElement.style.setProperty(key, value);
  const canvas = document.getElementById('ear-canvas');
  const app = document.createElement('main'); app.id = 'ear-app';
  app.innerHTML = `
    <svg class="tool-icon-filters" width="0" height="0" aria-hidden="true"><defs><filter id="tool-icon-cutout" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  5 5 5 0 -0.15"/></filter></defs></svg>
    <header class="spa-header"><div class="spa-brand"><span class="eyebrow">EAR CARE</span><p id="customer-name">今日采耳</p></div>
      <div class="header-actions"><button id="settings-open" aria-label="打开设置">设置</button></div></header>
    <section class="spa-game" aria-label="整块采耳游戏">
      <div class="clean-meter"><div><span>已清理</span><strong id="clean-value">0%</strong></div><progress id="clean-progress" max="9" value="0" aria-label="清洁度"></progress></div>
      <button id="next-customer" hidden>下一位</button>
      <div class="play-stage" id="play-stage"><button class="view-label" id="view-toggle" aria-label="切换耳廓与耳道视角">看耳廓 ↗</button><span class="tray-label">收藏盘 <b id="harvest-count">0 / 9</b></span>
        <div id="pull-feedback" class="pull-feedback" hidden><span id="pull-label">慢慢拉</span><progress id="pull-meter" max="1" value="0" aria-label="当前接触阻力"></progress></div>
        <div id="welcome" class="welcome"><div class="welcome-card"><h2>EAR CARE</h2><p class="welcome-subtitle">耳 道 护 理 模 拟 器</p><nav class="welcome-menu" aria-label="主菜单"><button id="ear-start" class="welcome-start">开始游戏</button><button id="welcome-shop">器具商店</button><button id="welcome-settings">设置</button><button id="welcome-help">操作指南</button></nav><p class="welcome-quote">小小的舒适，<br><span>也是一种治愈。</span></p></div><span class="welcome-signature">CLEAN · RELAX · HEAL</span></div>
        <aside class="care-objective" aria-label="服务目标"><span class="eyebrow" id="case-number">目标</span><strong id="case-title">清理耳垢与微屑</strong><div id="case-content" hidden><p id="case-condition"></p><ol id="case-goals"></ol><p id="case-hint"></p><p id="case-optional"></p><div class="case-actions"><button id="case-details">病例详情</button><button id="case-submit" disabled>目标未完成</button></div></div></aside>
        <div id="case-markers" aria-hidden="true"><span id="case-pin-1" hidden>1</span><span id="case-pin-2" hidden>2</span></div>
      </div>
      <nav class="tool-dock" aria-label="采耳工具">
        <button data-tool="scoop" aria-pressed="true">${ToolIcon('scoop')}<span><strong>耳勺</strong><small>撬起薄片</small></span><kbd>1</kbd></button>
        <button data-tool="tweezers" aria-pressed="false">${ToolIcon('tweezers')}<span><strong>小镊子</strong><small>夹起软块</small></span><kbd>2</kbd></button>
        <button data-tool="drops" aria-pressed="false">${ToolIcon('drops')}<span><strong>软化液</strong><small>管口接触滴液</small></span><kbd>3</kbd></button>
      </nav>
    </section>
    <dialog id="settings-dialog" aria-labelledby="settings-title"><div class="dialog-heading"><div><span class="eyebrow">EAR CARE / SETTINGS</span><h2 id="settings-title">设置与练习</h2></div><button id="settings-close" aria-label="关闭设置">✕</button></div>
      <section class="practice-settings" aria-labelledby="case-practice-title"><h3 id="case-practice-title">病例练习</h3><p>完成指定目标后交单。不限时、器具全部可用，不计营业收益。</p><label for="case-practice-type">选择病例</label><select id="case-practice-type">${CARE_CASE_IDS.map(id=>`<option value="${id}">${CARE_CASES[id].number} · ${CARE_CASES[id].title}</option>`).join('')}</select><div><button id="case-practice-start">练习这个病例</button></div></section>
      <section class="practice-settings" aria-labelledby="practice-title"><h3 id="practice-title">自由练习</h3><p>直接进入指定耳道，自由练习。不限时，器具全部可用，营业进度保留。</p><label for="practice-type">耳道类型</label><select id="practice-type">${Object.entries(CUSTOMER_EARS).map(([id,type])=>`<option value="${id}" ${id==='oily'?'selected':''}>${type.label} · ${type.note}</option>`).join('')}</select><div><button id="practice-start">进入测试关卡</button><button id="practice-return" hidden>返回营业</button></div></section>
      <p id="click-control-help" style="font-size:12px;line-height:1.8;color:var(--ui-muted)">电脑精细操作：移动鼠标控制器具，滚轮向前深入、向后撤出，按住右键转腕，Q / E 转动勺面。按住左键或空格夹持／施力，松开释放；Shift 降低移动速度。取出后按 T 查看收集盘，亲手移到盘上松开。</p>
      <section class="general-settings" aria-labelledby="general-title"><h3 id="general-title">通用</h3><details id="quality-settings" class="quality-settings"></details>
      <div class="slider-row"><span>声音</span><button id="sound-toggle" aria-label="静音" aria-pressed="false">声音开</button></div>
      <label class="slider-row">总音量<input id="volume-master" type="range" min="0" max="1" step="0.01" value="0.8"></label>
      <label class="slider-row">动作音效<input id="volume-sfx" type="range" min="0" max="1" step="0.01" value="0.85"></label>
      <label class="slider-row">背景音乐<input id="volume-bgm" type="range" min="0" max="1" step="0.01" value="0.16"></label>
      <label class="slider-row">轻微震动<input id="haptics" type="checkbox" checked></label>
      </section>
      <section id="physics-debug" class="debug-settings" aria-labelledby="debug-title"></section>

      <details id="operation-guide"><summary>操作指南</summary><p>鼠标自由移动器具，滚轮控制深度，右键拖动调整倾角，Q / E 转动器具。左键或空格控制夹持与工具作用；Shift 精细慢移。方向键移动工作端，W / S 深入或撤出，1–6 切换器具。按 Esc 停手；设置、失焦和换工具也会释放夹持。</p><p>耳勺：用凹面从薄片边缘接触，按住并亲手推进、抬起。勺背不会刮取，松脱的薄片需要勺面支撑，翻倒会滑落。镊子：张开两尖，把耳垢放在两尖之间，按住闭合后再拉。夹空、只有一尖碰到、快速硬拉都可能夹不住或滑脱。硬结先让滴管口接触并滴液，等待软化。</p><p>取出：保持夹持，滚轮向后撤到耳口外；按 T 查看收集盘，鼠标移到盘上方，再松开。落在工作垫上的耳垢可重新夹取。未落盘不计清洁度。柔毛刷按住扫动，鹅绒掸按住带走实际接触的微屑，吸引管按住吸走已软化的碎片。手机提供基础拖动，完整精细操作请使用电脑键鼠。</p></details>
    </dialog><dialog id="case-dialog" aria-labelledby="case-dialog-title"><div class="dialog-heading"><div><span class="eyebrow">CASE NOTES</span><h2 id="case-dialog-title"></h2></div><button id="case-close" aria-label="关闭病例详情">✕</button></div><p id="case-request"></p><p id="case-guide"></p><p class="case-note">主目标达成即可交单；继续精清会增加清洁收益。耳垢需要真正落盘或吸入，夹在手里不算完成。</p><button id="case-resume">继续操作</button></dialog>`;
  document.body.append(app);
  app.querySelector('.spa-brand').insertAdjacentHTML('beforeend','<div class="session-status"></div>');
  app.querySelector('.session-status').append(app.querySelector('.clean-meter'));
  app.querySelector('.header-actions').insertAdjacentHTML('afterbegin','<button id="shop-open">小铺</button>');
  app.querySelector('.session-status').insertAdjacentHTML('beforeend','<span id="satisfaction" title="客人满意度">☺ 85</span>');
  app.querySelector('.play-stage').insertAdjacentHTML('beforeend','<div id="reward-toast" hidden role="status"></div><section id="receipt" hidden><span>本次采耳</span><h2 id="receipt-title"></h2><p id="receipt-detail"></p><p id="receipt-case" hidden></p><div><button id="receipt-shop">逛逛小铺</button><button id="receipt-retry" hidden>重练本病例</button><button id="receipt-next">接待下一位 →</button></div></section>');
  for(const [id,label,detail] of [['brush','柔毛刷','扫拢细碎屑'],['suction','吸引管','清理软化碎屑'],['feather','鹅绒掸','成片带走微屑']])app.querySelector('.tool-dock').insertAdjacentHTML('beforeend',`<button data-tool="${id}" aria-pressed="false" hidden>${ToolIcon(id)}<span><strong>${label}</strong><small>${detail}</small></span></button>`);
  app.querySelector('.dialog-heading').insertAdjacentHTML('afterend','<button id="audio-test">试听挖取音效</button>');
  document.getElementById('play-stage').prepend(canvas);
  document.getElementById('ear-stage')?.remove();
  canvas.tabIndex = 0; canvas.setAttribute('aria-label', '耳道操作区，工具接触耳垢后，自由拨动或夹取');
  const $ = id => document.getElementById(id);
  const physicsSettings=CreatePhysicsSettings($('physics-debug'));
  $('physics-debug').insertAdjacentHTML('beforeend',`<details id="gameplay-settings"><summary>GamePlay<span aria-hidden="true">＋</span></summary><div class="quality-content"><p id="gameplay-hint">跳过当前顾客，接待下一位；当天末位后进入次日。未完成服务不发放收益，盘中物品保留。</p><button id="debug-next-customer" type="button" aria-describedby="gameplay-hint">跳转下一个顾客 →</button><p id="gameplay-status" role="status" aria-live="polite"></p></div></details>`);
  $('play-stage').insertAdjacentHTML('beforeend','<section id="tray-cleanup" hidden aria-label="整理收藏盘"><div><span class="eyebrow">收藏盘</span><strong id="tray-count" role="status"></strong></div><p id="tray-help">按住拖动耳勺，将耳垢拨过盘沿。未清理的会留到下一位。</p><button id="tray-tilt" aria-pressed="false">按住倾倒盘子</button></section>');
  app.insertAdjacentHTML('beforeend','<button id="depth-toggle" class="depth-toggle" aria-pressed="false" aria-label="放大观察深处" title="放大观察"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5M7 10h6"/><path class="zoom-plus" d="M10 7v6"/></svg></button>');
  const core = CreateCore({ canvas, viewCamera: new THREE.PerspectiveCamera(65, 1, .05, 400) });
  const audio = CreateAudio();
  const shop = CreateShop();
  const view = await CreateImmersiveScene({ core });
  let settings = { master: .8, sfx: .85, bgm: .16, muted: false, haptics: true, toolDrag: false };
  try { settings = { ...settings, ...JSON.parse(localStorage.getItem('earspa3d.calm.settings') || '{}') }; } catch { /* 隐私模式也能玩 */ }
  // Old click/drag preferences migrate without touching the business save.
  settings.toolDrag=true;settings.controlScheme='precision';view.SetPrecisionMode(true);
  let phase = 'ready', toolId = 'scoop', active = null, harvested = [], elapsed = 0, time = 0, settle = 0;
  let practice=null,suspended=null,pendingCustomer=null,caseId=null,practiceCase=null;
  let caseUiKey='',caseWasComplete=false,caseMarkerTime=0;
  app.dataset.phase='ready';
  let trayPointer=null,tiltPointer=null;
  let turnPointer=null,timeLimit=600,timedOut=false;
  let pointer = null, contactOn = false,precisionInput=null,wasActing=false,doseCooldown=0;
  let hintUntil=0,satisfaction=85,painCooldown=0,rewardUntil=0,combo=0,bestCombo=0,painCount=0,fractures=0;
  const events = [],feedback=[];
  app.querySelector('.play-stage').insertAdjacentHTML('beforeend','<button id="lamp-toggle" class="lamp-toggle" aria-pressed="false">☼ 检查灯 · 关</button>');
  app.querySelector('.play-stage').insertAdjacentHTML('beforeend','<div id="precision-controls"><span id="click-help">移动 · 滚轮进退 · 右键转腕 · 左键夹持</span><span id="tool-depth" aria-label="器具深度"></span><button id="manual-tray" title="T · 保持夹持查看收集盘">收集盘 <kbd>T</kbd></button><button id="action-cancel" hidden>松手</button></div><span id="tool-reticle" hidden aria-hidden="true"></span><div id="service-clock" role="timer" aria-label="服务剩余时间"><span>剩余服务</span><b id="service-time">03:30</b></div>');
  app.querySelector('.care-objective').append($('service-clock'));
  $('action-cancel').onclick=()=>{Cancel();Hint('已松手 · 可重新调整器具');};
  for (const button of app.querySelectorAll('[data-tool]')) button.title = button.textContent.trim();
  const instrumentShop=CreateInstrumentShop({app,shop,view,Cancel,Sound,UpdateInventory});
  const DialogOpen=()=>$('settings-dialog').open||$('case-dialog').open||instrumentShop.open;
  precisionInput=CreatePrecisionInput({canvas,Enabled:()=>phase==='playing'&&!DialogOpen()&&!view.busy&&!document.hidden,
    Cancel,SelectTool:index=>SetTool(['scoop','tweezers','drops','brush','suction','feather'][index]),ViewTray:ToggleTray,Wake:()=>audio.unlock(),ToolScreen:()=>view.ToolPose().toolScreen});
  $('manual-tray').onclick=()=>{ToggleTray();canvas.focus({preventScroll:true});};
  $('lamp-toggle').onclick=()=>{const on=view.ToggleLamp();$('lamp-toggle').setAttribute('aria-pressed',String(on));$('lamp-toggle').textContent='☼ 检查灯 · '+(on?'开':'关');Sound('uiTap',.2);};
  const rng = MakeRng(20260911 + shop.day * 307 + shop.state.totalCustomers * 997);
  function Record(type, data = {}) { events.push({ type, at: +time.toFixed(3), ...data }); if (events.length > 160) events.shift(); }

  function Feedback(message,kind='calm'){
    const previous=feedback.at(-1);
    feedback.push({message,kind,time,satisfaction:Math.round(satisfaction),delta:Math.round(satisfaction)-(previous?.satisfaction??85)});
    if(feedback.length>40)feedback.shift();
  }
  function Reward(message,kind='good'){const box=$('reward-toast');box.textContent=message;box.dataset.kind=kind;box.hidden=false;box.getAnimations().forEach(a=>a.cancel());box.animate([{opacity:0,transform:'translate(-50%,12px) scale(.9)'},{opacity:1,transform:'translate(-50%,0) scale(1.04)',offset:.2},{opacity:1,transform:'translate(-50%,-7px) scale(1)',offset:.8},{opacity:0,transform:'translate(-50%,-18px) scale(1)'}],{duration:2200,fill:'forwards'});rewardUntil=time+2.3;}
  function CleanMass(){const mass=harvested.reduce((sum,c)=>sum+c.mass,0);return mass>9-1e-8?9:Math.min(9,mass);}
  const CurrentCaseProgress=()=>CaseProgress(caseId,view.chunks,harvested);
  function UpdateCase(){
    const spec=CARE_CASES[caseId],state=CurrentCaseProgress();
    const key=JSON.stringify([caseId,practice,phase,state?.goals.map(g=>[Math.floor(g.ratio*100),g.complete,g.fractured,Math.round(g.softened*100)]),state?.complete,state?.optional]);
    if(key===caseUiKey)return;caseUiKey=key;
    $('case-content').hidden=!spec;app.querySelector('.care-objective').dataset.case=String(!!spec);
    $('case-number').textContent=spec?`病例 ${String(spec.number).padStart(2,'0')}${practice?' · 练习':''}`:'目标';
    $('case-title').textContent=spec?spec.title:practice?'自由练习 · 随时重开':'清理耳垢与微屑';
    if(!spec)return;
    $('case-condition').textContent=spec.condition;
    $('case-goals').innerHTML=state.goals.map(g=>`<li data-done="${g.complete}"><span>${g.number} · ${g.label}</span><b>${g.complete?'已收齐':Math.min(99,Math.floor(g.ratio*100))+'%'}</b></li>`).join('');
    $('case-hint').textContent=state.hint;
    $('case-optional').textContent=(state.optional?'✓ 已达成 · ':'额外挑战 · ')+spec.optional;
    $('case-submit').disabled=!state.complete||phase!=='playing';$('case-submit').textContent=state.complete?'交单完成':'目标未完成';
    $('case-dialog-title').textContent=spec.title;$('case-request').textContent=spec.request;$('case-guide').textContent=spec.guide;
    if(state.complete&&!caseWasComplete&&phase==='playing'){Reward('目标已收齐 · 可以交单，也可以继续精清');Record('caseReady',{caseId});}
    caseWasComplete=state.complete;
  }
  $('case-submit').onclick=()=>{if(phase==='playing'&&!DialogOpen()&&CurrentCaseProgress()?.complete)Complete();};
  $('case-details').onclick=()=>{if(!caseId||phase!=='playing')return;Cancel();UpdateCase();$('case-dialog').showModal();};
  const CloseCase=()=>{$('case-dialog').close();canvas.focus({preventScroll:true});};
  $('case-close').onclick=CloseCase;$('case-resume').onclick=CloseCase;
  function UpdateInventory(){const inv=shop.Snapshot().inventory;for(const button of app.querySelectorAll('[data-tool]'))button.hidden=!practice&&!inv.tools.includes(button.dataset.tool);view.SetSkins(inv.equipped,Object.fromEntries(Object.entries(TOOL_IDS).map(([id,key])=>[id,shop.ToolLevel(key)])));}

  function Hint(message){$('pull-feedback').hidden=false;$('pull-label').textContent=message;$('pull-meter').value=0;hintUntil=time+2.2;}
  function Sound(cue, gain = .65, c = null) {
    const pan = c ? Clamp(view.Project(c.mesh.position).x / core.size.width * 2 - 1, -.6, .6) : 0;
    audio.playSfx(cue, { gain, pan }); Record('sound', { cue });
  }
  function ApplySettings() {
    audio.setMaster(settings.muted ? 0 : settings.master); audio.setSfxVolume(settings.sfx); audio.setBgmVolume(settings.bgm);
    $('sound-toggle').textContent = settings.muted ? '声音关' : '声音开';
    $('sound-toggle').setAttribute('aria-label', settings.muted ? '开启声音' : '静音');
    $('sound-toggle').setAttribute('aria-pressed', String(settings.muted));
    for (const id of ['master', 'sfx', 'bgm']) $('volume-' + id).value = settings[id];
    $('haptics').checked = settings.haptics;
    try { localStorage.setItem('earspa3d.calm.settings', JSON.stringify(settings)); } catch { /* 可无存储 */ }
  }
  ApplySettings();
  const renderQualitySettings=CreateRenderQualitySettings($('quality-settings'),settings=>{
    const quality=ResolveRenderQuality(settings);core.SetRenderQuality(quality);view.SetRenderQuality(quality);core.Render();
  });
  $('audio-test').onclick=()=>{audio.unlock();Sound('peelDry',1);};
  function StopContact() { if (contactOn) audio.contact.end(contactOn, { release: .025 }); contactOn = false; }
  function UpdateProgress(){
    const mass=CleanMass(),percent=Math.min(view.chunks[0]?.type==='oily'&&mass<9?99:100,Math.round(mass/9*100));
    $('harvest-count').textContent=harvested.length+' 件';$('clean-value').textContent=percent+'%';$('clean-progress').value=CleanMass();
    $('satisfaction').textContent=(satisfaction>75?'☺':satisfaction>50?'◔':'☹')+' '+Math.round(satisfaction);
    $('satisfaction').dataset.mood=satisfaction>75?'happy':satisfaction>50?'neutral':'hurt';
    UpdateCase();
  }
  function StartCustomer(reuseScene=false) {
    if (!practice&&!shop.CurrentCustomer()) shop.StartDay(rng);
    const customer = practice?{waxSeed:20260912,earType:practice,name:CUSTOMER_EARS[practice].label}:shop.CurrentCustomer();
    feedback.length=0;
    Cancel();$('tray-cleanup').hidden=true;if(practice)view.ClearTray();
    caseId=practice?practiceCase:CustomerCase(customer);caseUiKey='';caseWasComplete=false;
    if(!reuseScene)view.Reset(customer.waxSeed,CustomerEarType(customer),caseId);timeLimit=CustomerEarType(customer)==='oily'?900:600;timedOut=false;
    view.Enter();
    $('manual-tray').innerHTML='收集盘 <kbd>T</kbd>';
    if(!view.RenderingProbe().lampOn)view.ToggleLamp();$('lamp-toggle').setAttribute('aria-pressed','true');$('lamp-toggle').textContent='☼ 检查灯 · 开';
    $('view-toggle').textContent='看耳廓 ↗';
    harvested=[];active=pointer=null;elapsed=settle=0;phase='playing';app.dataset.phase='playing';satisfaction=85;$('depth-toggle').setAttribute('aria-pressed','false');$('depth-toggle').setAttribute('aria-label','放大观察深处');$('depth-toggle').title='放大观察';combo=bestCombo=painCount=fractures=0;painCooldown=0;$('receipt').hidden=true;UpdateInventory();
    UpdateProgress(); $('next-customer').hidden = true;
    $('customer-name').textContent = practice?`耳道练习 · ${customer.name}`:`第 ${shop.day} 天 · ${customer.name}${CustomerEarType(customer)==='oily'?' · 油耳':''}`;

    $('receipt-case').hidden=true;$('receipt-retry').hidden=!practiceCase;
    if(caseId)Hint(CARE_CASES[caseId].title+' · 先看右侧目标，可打开病例详情');
    Record('customerStart',{seed:customer.waxSeed,earType:CustomerEarType(customer),practice:!!practice,caseId});
    audio.setBgm(shop.state.mood);
  }
  // 首屏先摆好同一局，不播放、不计时，点击后直接开始操作。
  shop.StartDay(rng);caseId=CustomerCase(shop.CurrentCustomer());view.Reset(shop.CurrentCustomer().waxSeed,CustomerEarType(shop.CurrentCustomer()),caseId);
  $('customer-name').textContent = `第 ${shop.day} 天 · ${shop.CurrentCustomer().name}`;
  $('ear-start').onclick = () => { audio.unlock(); $('welcome').remove(); StartCustomer(true); canvas.focus({preventScroll:true}); Sound('uiTap', .3); };
  function SetTool(id) {
    if(!practice&&!shop.Snapshot().inventory.tools.includes(id))return;Cancel();view.HideTool();toolId=id;UpdateInventory();
    for (const button of app.querySelectorAll('[data-tool]')) button.setAttribute('aria-pressed', String(button.dataset.tool === id));
    canvas.focus({preventScroll:true});
  }
  app.querySelectorAll('[data-tool]').forEach(button => { button.onclick = () => { audio.unlock(); SetTool(button.dataset.tool); Sound('uiTap', .22); }; });
  function Cancel() {
    precisionInput?.Reset();wasActing=false;StopTrayInput();view.PrecisionStop();
    if(active){view.PrecisionDrop(active);Record('cancel',{id:active.id,progress:active.progress,detached:active.body.detached});}
    active=pointer=turnPointer=null;app.dataset.gripping='false';app.dataset.dragging='false';
    $('action-cancel').hidden=true;StopContact();$('pull-feedback').hidden=true;
  }
  function Begin(c, x, y, id = null) {
    if (!c || !view.ready || phase !== 'playing' || DialogOpen() || active || view.busy) return;
    if(!view.CanReach(c,toolId)){Hint('工具够不到 · 换长镊');Record('reachLimit',{id:c.id,depth:c.depth,reach:view.Reach(toolId),tool:toolId});return;}
    if(c.fine&&toolId==='brush')return;
    if(toolId==='brush'&&!c.fragment){Hint('毛刷只能扫拢细屑或刷松碎片');return;}
    if(c.fine&&toolId!=='feather'){Hint('细屑先用刷子扫拢，再用鹅绒掸带走');return;}
    if(!c.fine&&toolId==='feather'){Hint('鹅绒掸带不动大块');return;}
    if(toolId==='suction'&&(!c.fragment||c.softened<=.45)){Hint('吸引管只处理已软化的碎片');return;}
    if(toolId==='drops'){
      if(pointer){if(pointer.dropped.has(c.id))return;pointer.dropped.add(c.id);}
      c.wetting=Math.min(1,c.wetting+.92+(shop.ToolLevel('earDrops')-1)*.03);
      view.Drop(c);Sound('dropLiquid',.75,c);Record('soften',{id:c.id,target:c.wetting});
      Feedback('软化液已滴入');return;
    }
    if(view.Grip(c,x,y,toolId)===false){
      if(toolId==='tweezers')Hint('两尖还没夹稳 · 调整位置与角度');
      return;
    }
    active=c;app.dataset.gripping='true';c.state='peeling';c.held=0;c.stretchPlayed=false;c.painLoad=0;
    pointer={...pointer,id,x,y,currentX:x,currentY:y};
    $('pull-feedback').hidden=false;$('pull-label').textContent=TYPE_NAMES[c.type];

    if(toolId!=='scoop')Sound(toolId==='suction'?'vacuumSuck':toolId==='brush'?'tickleFeather':toolId==='tweezers'?'metalTick':'scrapeSoft', .65, c); Record('grab', { id: c.id, tool: toolId });
  }
  function Release() {
    if(!active)return;
    const c=active;
    view.PrecisionDrop(c);Record('release',{id:c.id,typeName:c.type,detached:c.body.detached});
    active=null;app.dataset.gripping='false';StopContact();$('pull-feedback').hidden=true;

  }
  function Position(event) { const r = canvas.getBoundingClientRect(); return { x: event.clientX - r.left, y: event.clientY - r.top }; }
  canvas.addEventListener('pointerdown',e=>{
    if(phase!=='complete'||e.isPrimary===false||e.button!==0||DialogOpen())return;
    const p=Position(e);if(trayPointer==null&&view.TrayBegin(p.x,p.y)){e.preventDefault();trayPointer=e.pointerId;canvas.setPointerCapture(e.pointerId);}
  });
  canvas.addEventListener('pointermove',e=>{
    const p=Position(e);view.AimLamp(p.x,p.y);
    if(phase==='complete'&&trayPointer===e.pointerId&&!DialogOpen()){e.preventDefault();view.TrayMove(p.x,p.y);}
  });
  canvas.addEventListener('pointerup',e=>{if(trayPointer===e.pointerId)StopTrayInput();});
  canvas.addEventListener('lostpointercapture',()=>{if(trayPointer!=null)StopTrayInput();});
  window.addEventListener('resize',Cancel);
  function Complete(expired=false) {
    if (phase !== 'playing') return;
    const caseResult=CurrentCaseProgress();
    if(caseResult&&!expired&&!caseResult.complete)return;
    timedOut=expired;Cancel();if(expired)view.EndService();phase='complete';app.dataset.phase='complete';view.Showcase();UpdateProgress();
    const payout = practice?null:shop.FinishCustomer({ cleanliness01: CleanMass()/9, comfort01:satisfaction/100,relax01:satisfaction/100,bestCombo, harvest: harvested,caseResult });
    Record('complete', { payout:payout?.payout,count:harvested.length,timedOut:expired,cleanliness:CleanMass()/9,caseId,caseComplete:caseResult?.complete });

    $('receipt').hidden=false;$('tray-cleanup').hidden=false;
    $('receipt-title').textContent=(expired?'服务结束':satisfaction>=85?'非常满意':satisfaction>=60?'还不错':'下次请轻一点')+' · +'+(payout?.payout||0)+' 枚';
    $('receipt-detail').textContent=`清洁 ${Math.round(CleanMass()/9*100)}% · 满意度 ${Math.round(satisfaction)}｜工时费 ${payout?.labor||0} + 小费 ${payout?.tip||0} + 手艺奖励 ${(payout?.comboBonus||0)+(payout?.perfectBonus||0)}${caseId?' + 病例目标 '+(payout?.caseBonus||0):''}`;
    if(practice){$('receipt-title').textContent='练习完成';$('receipt-detail').textContent=`${CUSTOMER_EARS[practice].label} · 清洁 ${Math.round(CleanMass()/9*100)}% · 不计营业收益`;$('receipt-next').textContent='再练一次';}
    $('receipt-case').hidden=!caseResult;
    if(caseResult){
      $('receipt-title').textContent=(caseResult.complete?'病例完成':'服务到时 · 目标未完成')+(practice?'':' · +'+(payout?.payout||0)+' 枚');
      $('receipt-case').textContent=`${CARE_CASES[caseId].title} · 主目标 ${Math.floor(caseResult.ratio*100)}%｜${caseResult.optional?'额外挑战达成':'额外挑战未达成'}。${caseResult.complete?'已按实际清理量结算。':'下次先集中处理编号目标。'}`;
      if(practice)$('receipt-case').textContent=$('receipt-case').textContent.replace('已按实际清理量结算。','可重练本关，或继续下个病例。');
    }
    if(practiceCase)$('receipt-next').textContent='下个病例 →';
    $('next-customer').hidden=true;  Sound('sparkle', .3);
    const next=shop.state.todayCustomers.find(c=>!c.done);
    if(next&&!practice)view.PrepareCustomer(next.waxSeed,{earType:CustomerEarType(next),caseId:CustomerCase(next)}).catch(error=>console.error('下一位客人准备失败',error));
  }
  function UpdateGameplaySettings(){
    const button=$('debug-next-customer');button.disabled=!!practice||phase==='preparing';
    button.textContent=phase==='preparing'?'正在准备下一位…':pendingCustomer?'重试接待当前顾客 →':'跳转下一个顾客 →';
    $('gameplay-status').textContent=practice?'练习中无法跳过营业顾客，请先返回营业。':pendingCustomer&&phase!=='preparing'?'准备失败，可重试接待同一位顾客。':'';
  }
  async function NextCustomer(skip=false) {
    if(phase==='preparing'||(skip&&practice)||(!skip&&phase!=='complete'))return;
    if(practice){if(practiceCase){practiceCase=CARE_CASE_IDS[(CARE_CASE_IDS.indexOf(practiceCase)+1)%CARE_CASE_IDS.length];$('case-practice-type').value=practiceCase;}StartCustomer();return;}
    Cancel();audio.unlock();view.EndService();
    if(!pendingCustomer){
      if(skip&&shop.SkipCustomer())Record('customerSkip',{id:shop.CurrentCustomer().id});
      shop.AdvanceCustomer();if(!shop.HasNextCustomer()){shop.NextDay();shop.StartDay(rng);}
      pendingCustomer=shop.CurrentCustomer();
    }
    const customer=pendingCustomer,button=$('receipt-next');phase='preparing';app.dataset.phase=phase;
    $('welcome')?.setAttribute('hidden','');$('receipt').hidden=false;$('tray-cleanup').hidden=true;
    button.disabled=true;button.textContent='正在准备下一位…';$('practice-start').disabled=true;$('case-practice-start').disabled=true;UpdateGameplaySettings();
    try{
      if(!await view.PrepareCustomer(customer.waxSeed,{urgent:true,earType:CustomerEarType(customer),caseId:CustomerCase(customer)}))throw new Error('客人准备已取消');
      StartCustomer();pendingCustomer=null;$('settings-dialog').close();canvas.focus({preventScroll:true});
    }catch(error){
      console.error('客人准备失败',error);phase='complete';app.dataset.phase=phase;
      $('receipt-title').textContent='暂时没能接待';$('receipt-detail').textContent='请重试，将继续准备同一位顾客。';
    }finally{
      button.disabled=false;$('practice-start').disabled=false;$('case-practice-start').disabled=false;button.textContent=pendingCustomer?'重试接待 →':'接待下一位 →';UpdateGameplaySettings();
    }
  }
  $('next-customer').onclick=()=>NextCustomer();
  $('debug-next-customer').onclick=()=>NextCustomer(true);
  $('receipt-next').onclick=()=>$('next-customer').click();
  $('receipt-retry').onclick=()=>{if(practiceCase&&phase==='complete')StartCustomer();};
  $('receipt-shop').onclick=()=>OpenShop();
  function StopTrayInput(){
    const id=trayPointer;trayPointer=null;view.TrayEnd();view.TrayTilt(false);
    if(id!=null&&canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);
    const tiltId=tiltPointer;tiltPointer=null;
    if(tiltId!=null&&$('tray-tilt').hasPointerCapture(tiltId))$('tray-tilt').releasePointerCapture(tiltId);
    $('tray-tilt').setAttribute('aria-pressed','false');
  }
  function TiltTray(){if(phase!=='complete'||DialogOpen())return;view.TrayTilt(true);$('tray-tilt').setAttribute('aria-pressed','true');}
  $('tray-tilt').addEventListener('pointerdown',e=>{if(e.button!==0||e.isPrimary===false)return;e.preventDefault();Cancel();audio.unlock();tiltPointer=e.pointerId;$('tray-tilt').setPointerCapture(e.pointerId);TiltTray();});
  for(const name of ['pointerup','pointercancel','lostpointercapture','blur'])$('tray-tilt').addEventListener(name,StopTrayInput);
  $('tray-tilt').addEventListener('keydown',e=>{if(e.code==='Space'||e.code==='Enter'){e.preventDefault();TiltTray();}});
  $('tray-tilt').addEventListener('keyup',e=>{if(e.code==='Space'||e.code==='Enter'){e.preventDefault();StopTrayInput();}});

  function OpenShop(){if(practice)return;instrumentShop.Open();}
  function PracticeUi(){UpdateGameplaySettings();app.dataset.practice=String(!!practice);$('practice-return').hidden=!practice;$('practice-start').textContent=practice?'重开所选耳道':'进入测试关卡';$('receipt-next').textContent=practiceCase?'下个病例 →':practice?'再练一次':'接待下一位 →';$('receipt-retry').hidden=!practiceCase;UpdateCase();}
  function StartPractice(selectedCase=null){
    if(phase==='preparing')return;
    Cancel();
    if(!suspended)suspended={view:view.Suspend(),phase,toolId,harvested,elapsed,settle,satisfaction,combo,bestCombo,painCount,fractures,painCooldown,timedOut,timeLimit,caseId,caseWasComplete,feedback:feedback.slice(),customerName:$('customer-name').textContent,receiptTitle:$('receipt-title').textContent,receiptDetail:$('receipt-detail').textContent,receiptCase:$('receipt-case').textContent,receiptCaseHidden:$('receipt-case').hidden};
    practiceCase=Object.hasOwn(CARE_CASES,selectedCase)?selectedCase:null;
    practice=practiceCase?'mixed':$('practice-type').value;if(!Object.hasOwn(CUSTOMER_EARS,practice))practice='oily';
    $('welcome')?.setAttribute('hidden','');$('settings-dialog').close();audio.unlock();StartCustomer();
    if(!view.RenderingProbe().lampOn)view.ToggleLamp();$('lamp-toggle').setAttribute('aria-pressed','true');$('lamp-toggle').textContent='☼ 检查灯 · 开';
    PracticeUi();canvas.focus({preventScroll:true});
  }
  function ReturnFromPractice(){
    if(!suspended)return;Cancel();const saved=suspended;view.Restore(saved.view);({phase,toolId,harvested,elapsed,settle,satisfaction,combo,bestCombo,painCount,fractures,painCooldown,timedOut,timeLimit,caseId,caseWasComplete}=saved);feedback.splice(0,feedback.length,...saved.feedback);practice=practiceCase=suspended=null;caseUiKey='';
    app.dataset.phase=phase;$('welcome')?.toggleAttribute('hidden',phase!=='ready');$('receipt').hidden=phase!=='complete';$('tray-cleanup').hidden=phase!=='complete';$('customer-name').textContent=saved.customerName;$('receipt-title').textContent=saved.receiptTitle;$('receipt-detail').textContent=saved.receiptDetail;$('settings-dialog').close();
    $('receipt-case').textContent=saved.receiptCase;$('receipt-case').hidden=saved.receiptCaseHidden;
    UpdateDepthControl(saved.view.inspectionTarget);$('view-toggle').textContent=saved.view.inside?'看耳廓 ↗':'进入耳道 ↗';
    $('manual-tray').innerHTML=saved.view.precisionTray?'返回耳道 <kbd>T</kbd>':'收集盘 <kbd>T</kbd>';
    const lit=view.RenderingProbe().lampOn;$('lamp-toggle').setAttribute('aria-pressed',String(lit));$('lamp-toggle').textContent='☼ 检查灯 · '+(lit?'开':'关');for(const button of app.querySelectorAll('[data-tool]'))button.setAttribute('aria-pressed',String(button.dataset.tool===toolId));
    PracticeUi();UpdateInventory();UpdateProgress();canvas.focus({preventScroll:true});
  }
  $('practice-start').onclick=()=>StartPractice();$('case-practice-start').onclick=()=>StartPractice($('case-practice-type').value);$('practice-return').onclick=ReturnFromPractice;
  function OpenSettings(showGuide=false){Cancel();UpdateGameplaySettings();$('practice-start').disabled=phase==='preparing';$('case-practice-start').disabled=phase==='preparing';$('operation-guide').open=showGuide;$('settings-dialog').showModal();if(showGuide)$('operation-guide').scrollIntoView({block:'nearest'});}
  $('settings-open').onclick=()=>OpenSettings();$('shop-open').onclick=OpenShop;
  $('welcome-shop').onclick=OpenShop;$('welcome-settings').onclick=()=>OpenSettings();$('welcome-help').onclick=()=>OpenSettings(true);
  function UpdateDepthControl(target){const label=target>0?'缩小观察入口':target<0?'返回标准视角':'放大观察深处';$('depth-toggle').setAttribute('aria-pressed',String(target>0));$('depth-toggle').setAttribute('aria-label',label);$('depth-toggle').title=label;}
  $('depth-toggle').onclick=()=>{if(phase!=='playing'||view.busy)return;Cancel();UpdateDepthControl(view.CycleDepth());};
  $('view-toggle').onclick = () => { if(phase==='ready')return;Cancel();$('view-toggle').textContent=view.ToggleView()==='ear'?'进入耳道 ↗':'看耳廓 ↗'; };
  function ToggleTray(){
    if(phase!=='playing'||DialogOpen()||view.busy)return;
    if(!view.PrecisionTray(active)){Hint(view.PrecisionProbe().trayView?'先把耳垢放下，再返回耳道':'先保持夹持 · 向后撤到耳口外再按 T');return;}
    $('manual-tray').innerHTML=view.PrecisionProbe().trayView?'返回耳道 <kbd>T</kbd>':'收集盘 <kbd>T</kbd>';
    Record('trayView',{enabled:view.PrecisionProbe().trayView});
  }
  $('settings-close').onclick = () => {$('settings-dialog').close();canvas.focus({preventScroll:true});};
  $('sound-toggle').onclick = () => { audio.unlock(); settings.muted = !settings.muted; ApplySettings(); };
  for (const id of ['master', 'sfx', 'bgm']) $('volume-' + id).oninput = e => { settings[id] = +e.target.value; ApplySettings(); };
  $('haptics').onchange = e => { settings.haptics = e.target.checked; ApplySettings(); };

  function Interact(dt){
    let c=active;c.held+=dt;
    const before=c.body.anchors.filter(a=>a.alive).length;
    const state=view.Drag(c,pointer.currentX,pointer.currentY,dt,1+(shop.ToolLevel(TOOL_IDS[toolId])-1)*.08);
    if(state.bite){const source=c.id;c=active=state.bite;Record('oilyBite',{source,id:c.id,mass:c.mass});Sound('peelSticky',.7,c);}
    if(state.slipped){view.PrecisionDrop(c);active=null;Cancel();Hint(state.gripOverload?'夹持滑脱 · 先软化或慢慢拉':'失去支撑 · 调整器具后重新夹取');Record('slip',{id:c.id});return;}
    c.painLoad=state.pain>0?c.painLoad+dt:Math.max(0,c.painLoad-dt);
    if(c.painLoad>.18&&!painCooldown){
      satisfaction=Math.max(5,satisfaction-9);painCount++;combo=0;painCooldown=4;
      Feedback('操作引起不适','pain');
      Record('pain',{id:c.id,satisfaction});UpdateProgress();
    }
    if(state.fracture){
      const pieces=view.Fracture(c);if(!pieces.length)return;Record('fracture',{id:c.id,pieces:pieces.map(p=>p.id)});fractures++;combo=0;satisfaction=Math.max(5,satisfaction-3);
      active=null;app.dataset.gripping='false';StopContact();Sound('snapWax',.9,c);Reward('裂成了 '+pieces.length+' 片 · 碎屑仍需清理','warn');
      Feedback('硬拉导致碎裂','pain');UpdateProgress();Cancel();return;
    }
    $('pull-meter').value=state.strain;
    $('pull-label').textContent=state.wrongDirection?(toolId==='scoop'?'勺背接触 · 转动勺面':'夹爪倾角不合适 · 右键转腕'):state.wrongTool?(toolId==='suction'?'只吸软化后的碎屑':'毛刷只能刷松碎屑'):state.needsForceps?'边缘松了 · 可换镊子':c.type==='impacted'&&c.softened<.6?'附着牢固 · 先滴液软化':state.detached?'已松脱 · 向后撤出，按 T 查看收集盘':c.type==='oily'?'保持接触 · 缓慢挖取一小团':state.contact?'碰到内壁 · 调整方向':toolId==='tweezers'?'已夹住 · 亲手缓慢拉出':'正在剥离 · 继续沿边缘刮动';
    if(state.remaining<before){Record('bondBreak',{id:c.id,remaining:state.remaining});Sound(c.type==='dry'?'peelDry':'peelSticky',state.detached?1:.55,c);}
    if(state.detached&&toolId==='suction')Record('suction',{id:c.id});
    if(state.detached&&c.state!=='held'){
      c.state='held';Record('detach',{id:c.id});

      if(settings.haptics&&navigator.vibrate)navigator.vibrate(16);
    }
    if(state.detached&&toolId==='suction'){view.Release(c);active=pointer=null;StopContact();return;}
    const friction=ContactFriction(state,toolId,c.type);
    if(contactOn!==friction?.kind)StopContact();
    if(friction&&!contactOn){audio.contact.begin(friction.kind);contactOn=friction.kind;}
    if(friction)audio.contact.update(friction.kind,{...friction,dt});
  }
  function Frame(dt) {
    time+=dt;painCooldown=Math.max(0,painCooldown-dt);
    if(time>rewardUntil)$('reward-toast').hidden=true;
    if (phase === 'playing' && !DialogOpen() && !document.hidden) {
      if(!practice){dt=Math.min(dt,Math.max(0,timeLimit-elapsed));elapsed+=dt;}
      const input=precisionInput.Read(dt);doseCooldown=Math.max(0,doseCooldown-dt);
      if(!input.acting&&wasActing){Release();view.PrecisionStop();StopContact();}
      wasActing=input.acting;turnPointer=input.rotating;
      if(view.ready){
        const pose=view.PrecisionMove(input,toolId,active,dt);
        const screen=view.ToolPose().toolScreen;
        pointer={x:screen.x,y:screen.y,currentX:screen.x,currentY:screen.y,dropped:new Set()};
        if(input.acting&&!active&&!['brush','feather'].includes(toolId)){
          const c=view.PrecisionContact(toolId);
          if(c&&(toolId!=='drops'||!doseCooldown)){Begin(c,screen.x,screen.y);if(toolId==='drops')doseCooldown=.7;}
        }
        if(active)Interact(dt);
        else if(input.acting&&toolId==='brush'&&view.BrushSweepProbe().moved){
          const sweep=view.BrushSweepProbe();Hint(`实际扫拢 ${sweep.moved} 组微屑 · 换鹅绒掸带出`);
          if(contactOn!=='sweep'){StopContact();audio.contact.begin('sweep');contactOn='sweep';}
          audio.contact.update('sweep',{speed01:Clamp((pose?.motion||0)*6),pressure01:.3,roughness01:.45,dt});
          Record('sweep',{tool:toolId,count:sweep.moved});
        }else{StopContact();if(input.acting&&toolId==='feather'&&view.FeatherSweepProbe().held)Hint(`已带起 ${view.FeatherSweepProbe().grains} 粒 · 撤出后按 T 放盘`);else if(input.acting&&toolId==='tweezers')Hint('还没夹住 · 张开两尖，将耳垢放在两尖之间');else if(input.acting&&toolId==='scoop')Hint('用凹面贴住薄片边缘，再缓慢刮动');else if(time>hintUntil)$('pull-feedback').hidden=true;}
        if(pose?.contact&&!active&&pose.motion>.005)Hint('器具碰到内壁 · 可沿壁滑动或向后撤');
      }
      app.dataset.gripping=String(!!active||view.FeatherSweepProbe().held>0);app.dataset.dragging=String(input.acting);$('action-cancel').hidden=!input.acting&&!active;
      for (const c of view.Update(dt)) {
        if(harvested.some(item=>item.id===c.id))continue;
        harvested.push({id:c.id,type:c.type,size:c.size,mass:c.mass,fragment:c.fragment,softened:c.softened});Record('land',{id:c.id,mass:c.mass});
        satisfaction=Math.min(100,satisfaction+c.mass*2);combo++;bestCombo=Math.max(bestCombo,combo);
        const landing=LandingSound(c);
        Sound(landing.cue,landing.gain,c);Record('landingSound',{id:c.id,...landing});UpdateProgress();
        Reward(`+${(c.mass/9*100).toFixed(c.mass<.09?1:0)}%`);
        if(settings.haptics&&navigator.vibrate)navigator.vibrate([12,40,8]);
        Feedback('清理完成，满意度提升');

      }
      if(!practice&&elapsed>=timeLimit){Complete(true);}
      if(!caseId&&CleanMass()>(view.chunks[0]?.type==='oily'?9-1e-8:8.999)&&!view.busy){settle+=dt;if(settle>.7)Complete();}
    } else { view.Update(phase==='complete'&&!DialogOpen()&&!document.hidden?dt:0); }
    if(phase==='complete'){const tray=view.TrayProbe();$('tray-count').textContent=tray.count?tray.count+' 件留在盘中':'盘子清空了';}
    const remaining=Math.max(0,timeLimit-elapsed);$('service-time').textContent=Math.floor(remaining/60).toString().padStart(2,'0')+':'+Math.floor(remaining%60).toString().padStart(2,'0');$('service-clock').dataset.urgent=String(remaining<30);
    if(practice){$('service-time').textContent='不限时';$('service-clock').dataset.urgent='false';}
    UpdateCase();
    if(time>=caseMarkerTime){
      caseMarkerTime=time+.1;
      for(const number of [1,2])$('case-pin-'+number).hidden=true;
      if(caseId&&phase==='playing'&&!DialogOpen()&&!view.PrecisionProbe().trayView)for(const marker of view.CaseMarkers(caseId)){
        const pin=$('case-pin-'+marker.number);if(!marker.screen)continue;
        pin.hidden=false;pin.style.left=marker.screen.x+'px';pin.style.top=marker.screen.y+'px';
      }
    }
    const transferring=String(!!view.transfer);if(app.dataset.transferring!==transferring)app.dataset.transferring=transferring;
    const rendering=view.ToolPose(),precision=view.PrecisionProbe();
    if(rendering.toolVisible)precisionInput.SyncTool(rendering.toolScreen,{constrained:precision.contact||precision.blocked,transitioning:!view.ready});
    $('tool-depth').textContent=precision.trayView?'盘面操作':rendering.toolDepth<=0?'耳口外':rendering.toolDepth.toFixed(1)+' mm';
    const tip=$('tool-reticle');tip.hidden=phase!=='playing'||DialogOpen()||!rendering.toolVisible||!precisionInput.Probe().pointerInside||rendering.toolScreen.z<-1||rendering.toolScreen.z>1;
    tip.style.left=rendering.toolScreen.x+'px';tip.style.top=rendering.toolScreen.y+'px';tip.dataset.contact=String(precision.contact);
    audio.Update(dt); core.Render();
  }
  function Probe() {
    return { version: VERSION,phase,practice,practiceCase,careCase:CurrentCaseProgress(),earType:practice||CustomerEarType(shop.CurrentCustomer()),timeLimit:practice?null:timeLimit,timeRemaining:practice?null:Math.max(0,timeLimit-elapsed),timedOut,controlScheme:'precision',action:active?{stage:active.body.detached?'held':'contact',id:active.id,tool:toolId}:null,inputMode:'precision',input:precisionInput.Probe(),precision:view.PrecisionProbe(),turning:!!turnPointer,tool: toolId, elapsed: +elapsed.toFixed(2), cleanliness: CleanMass()/9,satisfaction,painCount,fractures, harvest: harvested.map(x => ({ ...x })), active: active?.id ?? null,
      tray:view.TrayProbe(),targets: view.Targets(), transfer:view.transfer, model:view.modelInfo, viewReady:view.ready, rendering:view.RenderingProbe(), collision:view.CollisionProbe(),preparation:view.PreparationProbe(),feedback:feedback.map(f=>({...f})), events: events.map(x => ({ ...x })), audio: audio.debug(), settings: { ...settings }, physicsSettings:physicsSettings.Snapshot(),renderQuality:renderQualitySettings.Snapshot(), shop: shop.Snapshot(), stats: { ...core.stats },
      viewport: { width: innerWidth, height: innerHeight }, stage: (() => { const r = canvas.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })() };
  }
  UpdateInventory();UpdateProgress();core.Resize();view.Resize();view.Update(0);await view.WarmTools();Frame(0);
  Object.defineProperty(window, '__EarSpaProbe', { value: Probe, configurable: true });
  if (new URLSearchParams(location.search).get('debug') === '1') {
    window.__EarSpaDebug = { StepFrames(n = 1) { for (let i = 0; i < Math.min(n, 3600); i++) Frame(1 / 60); return Probe(); }, Probe, audio, view, shop, core };
  }
  document.getElementById('ear-boot')?.remove();
  function Animate(now) { Frame(core.Tick(now)); requestAnimationFrame(Animate); }
  requestAnimationFrame(Animate);
}
