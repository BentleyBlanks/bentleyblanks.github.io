import * as THREE from 'three';
import {CreateRenderQualitySettings} from './Script_RenderQualitySettings.mjs?v=ear040-render-settings-20260912';
import {ResolveRenderQuality} from './Data_RenderQuality.mjs?v=ear040-render-settings-20260912';
import {ContactFriction} from './Script_ContactFriction.mjs?v=ear035-sticky-scrape-audio-20260912';
import {CreatePhysicsSettings} from './Script_PhysicsSettings.mjs?v=ear028-physics-settings-20260912';
import {CUSTOMER_EARS,CustomerEarType} from './Data_CustomerTypes.mjs?v=ear029-oily-coating-20260912';
import { ToolIcon } from './Script_ToolIcons.mjs?v=ear014-ui-20260912';
import { CreateCore } from './Script_Core.js?v=ear043-runtime-performance-20261003';
import { CreateImmersiveScene } from './Script_ImmersiveScene.js?v=ear046-click-care-20261012';
import { CreateAudio } from './Script_Audio.js?v=ear035-sticky-scrape-audio-20260912';
import { LandingSound } from './Script_LandingSound.mjs?v=ear012-size-audio-20260912';
import { CreateShop } from './Script_Shop.js?v=ear040-render-settings-20260912';
import { MakeRng } from './Script_Util.js?v=ear011-20260911';
import { CSS_VARS, PALETTE } from './Data_Palette.mjs?v=ear011-20260911';

import { CreateInstrumentShop } from './Script_InstrumentShop.js?v=ear046-click-care-20261012';

const VERSION = 'ear046-click-care-20261012';
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
        <aside class="care-objective" aria-label="服务目标"><span class="eyebrow">目标</span><strong>清理耳垢与微屑</strong></aside>
      </div>
      <nav class="tool-dock" aria-label="采耳工具">
        <button data-tool="scoop" aria-pressed="true">${ToolIcon('scoop')}<span><strong>耳勺</strong><small>撬起薄片</small></span><kbd>1</kbd></button>
        <button data-tool="tweezers" aria-pressed="false">${ToolIcon('tweezers')}<span><strong>小镊子</strong><small>夹起软块</small></span><kbd>2</kbd></button>
        <button data-tool="drops" aria-pressed="false">${ToolIcon('drops')}<span><strong>软化液</strong><small>管口接触滴液</small></span><kbd>3</kbd></button>
      </nav>
    </section>
    <dialog id="settings-dialog" aria-labelledby="settings-title"><div class="dialog-heading"><div><span class="eyebrow">EAR CARE / SETTINGS</span><h2 id="settings-title">设置与练习</h2></div><button id="settings-close" aria-label="关闭设置">✕</button></div>
      <section class="practice-settings" aria-labelledby="practice-title"><h3 id="practice-title">客人耳道测试</h3><p>直接进入指定耳道，自由练习。不限时，器具全部可用，营业进度保留。</p><label for="practice-type">耳道类型</label><select id="practice-type">${Object.entries(CUSTOMER_EARS).map(([id,type])=>`<option value="${id}" ${id==='oily'?'selected':''}>${type.label} · ${type.note}</option>`).join('')}</select><div><button id="practice-start">进入测试关卡</button><button id="practice-return" hidden>返回营业</button></div></section>
      <p id="click-control-help" style="font-size:12px;line-height:1.8;color:var(--ui-muted)">选择工具，点一下耳垢即可。工具会靠近、调整方向，再撬起或夹取并带出落盘。硬结先滴软化液，等约 3 秒。柔毛刷点扫小颗粒，鹅绒掸点扫后带出；点“停手”或按 Esc 可中止。</p>
      <section class="general-settings" aria-labelledby="general-title"><h3 id="general-title">通用</h3><details id="quality-settings" class="quality-settings"></details>
      <div class="slider-row"><span>声音</span><button id="sound-toggle" aria-label="静音" aria-pressed="false">声音开</button></div>
      <label class="slider-row">总音量<input id="volume-master" type="range" min="0" max="1" step="0.01" value="0.8"></label>
      <label class="slider-row">动作音效<input id="volume-sfx" type="range" min="0" max="1" step="0.01" value="0.85"></label>
      <label class="slider-row">背景音乐<input id="volume-bgm" type="range" min="0" max="1" step="0.01" value="0.16"></label>
      <label class="slider-row">轻微震动<input id="haptics" type="checkbox" checked></label>
      </section>
      <section id="physics-debug" class="debug-settings" aria-labelledby="debug-title"></section>

      <details id="operation-guide"><summary>操作指南</summary><p>选择器具，点一下可见耳垢。耳勺自动调整勺面并做一次短行程撬取；镊子先将两侧尖端贴到耳垢，再闭合夹取。松脱后工具会带出，张开后耳垢自然落盘。硬结先点软化液，等约 3 秒；黏性耳垢用镊子，深处也用长镊。点柔毛刷清扫区域，刷毛将实际碰到的小颗粒扫松、扫拢；再点鹅绒掸，将扫到的小颗粒带出。取出或落盘前不计清洁度。空白处不会选块，工具够不到或被耳壁挡住会提示。点停手、按 Esc、打开设置或切换工具可中止。</p><p>键盘：1/2/3 切换工具，方向键选择可见耳垢，空格或回车完成一次操作，Esc 停手。点放大镜观察深处，点“看耳廓”切换视角。</p></details>
    </dialog>`;
  document.body.append(app);
  app.querySelector('.spa-brand').insertAdjacentHTML('beforeend','<div class="session-status"></div>');
  app.querySelector('.session-status').append(app.querySelector('.clean-meter'));
  app.querySelector('.header-actions').insertAdjacentHTML('afterbegin','<button id="shop-open">小铺</button>');
  app.querySelector('.session-status').insertAdjacentHTML('beforeend','<span id="satisfaction" title="客人满意度">☺ 85</span>');
  app.querySelector('.play-stage').insertAdjacentHTML('beforeend','<div id="reward-toast" hidden role="status"></div><section id="receipt" hidden><span>本次采耳</span><h2 id="receipt-title"></h2><p id="receipt-detail"></p><div><button id="receipt-shop">逛逛小铺</button><button id="receipt-next">接待下一位 →</button></div></section>');
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
  // Old drag preferences migrate to the single click action scheme.
  settings.toolDrag=false;view.SetToolDrag(false);
  let phase = 'ready', toolId = 'scoop', active = null, harvested = [], elapsed = 0, time = 0, settle = 0;
  let practice=null,suspended=null,pendingCustomer=null;
  app.dataset.phase='ready';
  let trayPointer=null,tiltPointer=null;
  let turnPointer=null,timeLimit=210,timedOut=false;
  let pointer = null, contactOn = false, action = null, keyboardTarget = null;
  let hintUntil=0,satisfaction=85,painCooldown=0,rewardUntil=0,combo=0,bestCombo=0,painCount=0,fractures=0;
  const events = [],feedback=[];
  app.querySelector('.play-stage').insertAdjacentHTML('beforeend','<button id="lamp-toggle" class="lamp-toggle" aria-pressed="false">☼ 检查灯 · 关</button>');
  app.querySelector('.play-stage').insertAdjacentHTML('beforeend','<div id="precision-controls"><span id="click-help" role="status">选工具 · 点耳垢</span><button id="action-cancel" hidden>停手</button></div><div id="service-clock" role="timer" aria-label="服务剩余时间"><span>剩余服务</span><b id="service-time">03:30</b></div>');
  app.querySelector('.care-objective').append($('service-clock'));
  $('action-cancel').onclick=()=>{Cancel();Hint('已停手 · 可以重新点取');};
  for (const button of app.querySelectorAll('[data-tool]')) button.title = button.textContent.trim();
  const instrumentShop=CreateInstrumentShop({app,shop,view,Cancel,Sound,UpdateInventory});
  const DialogOpen=()=>$('settings-dialog').open||instrumentShop.open;
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
  }
  function StartCustomer(reuseScene=false) {
    if (!practice&&!shop.CurrentCustomer()) shop.StartDay(rng);
    const customer = practice?{waxSeed:20260912,earType:practice,name:CUSTOMER_EARS[practice].label}:shop.CurrentCustomer();
    feedback.length=0;
    Cancel();$('tray-cleanup').hidden=true;if(practice)view.ClearTray();
    if(!reuseScene)view.Reset(customer.waxSeed,CustomerEarType(customer));timeLimit=CustomerEarType(customer)==='oily'?900:210;timedOut=false;
    view.Enter();
    $('view-toggle').textContent='看耳廓 ↗';
    harvested=[];active=pointer=null;elapsed=settle=0;phase='playing';app.dataset.phase='playing';satisfaction=85;$('depth-toggle').setAttribute('aria-pressed','false');$('depth-toggle').setAttribute('aria-label','放大观察深处');$('depth-toggle').title='放大观察';combo=bestCombo=painCount=fractures=0;painCooldown=0;$('receipt').hidden=true;UpdateInventory();
    UpdateProgress(); $('next-customer').hidden = true;
    $('customer-name').textContent = practice?`耳道练习 · ${customer.name}`:`第 ${shop.day} 天 · ${customer.name}${CustomerEarType(customer)==='oily'?' · 油耳':''}`;

    Record('customerStart',{seed:customer.waxSeed,earType:CustomerEarType(customer),practice:!!practice});
    audio.setBgm(shop.state.mood);
  }
  // 首屏先摆好同一局，不播放、不计时，点击后直接开始操作。
  shop.StartDay(rng); view.Reset(shop.CurrentCustomer().waxSeed,CustomerEarType(shop.CurrentCustomer()));
  $('customer-name').textContent = `第 ${shop.day} 天 · ${shop.CurrentCustomer().name}`;
  $('ear-start').onclick = () => { audio.unlock(); $('welcome').remove(); StartCustomer(true); canvas.focus({preventScroll:true}); Sound('uiTap', .3); };
  function SetTool(id) {
    if(!practice&&!shop.Snapshot().inventory.tools.includes(id))return;Cancel();view.HideTool();toolId=id;UpdateInventory();
    for (const button of app.querySelectorAll('[data-tool]')) button.setAttribute('aria-pressed', String(button.dataset.tool === id));
  }
  app.querySelectorAll('[data-tool]').forEach(button => { button.onclick = () => { audio.unlock(); SetTool(button.dataset.tool); Sound('uiTap', .22); }; });
  function Cancel() {
    StopTrayInput();
    const stopped=action;action=null;$('action-cancel').hidden=true;
    if(stopped&&stopped.c!==active)view.EndApproach(stopped.c);
    view.EndScoopStroke();view.EndToolDrag();
    if(turnPointer){const id=turnPointer.id;turnPointer=null;view.TurnEnd();if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);}
    if(active) {
      if(active.body.detached) Release();
      else {view.Ungrip(active);active.state='returning';Record('cancel',{id:active.id,progress:active.progress});}
    }
    if(stopped)view.EndApproach(stopped.c);
    const captured=pointer?.id;
    active=pointer=null;app.dataset.gripping="false";
    if(captured!=null&&canvas.hasPointerCapture(captured))canvas.releasePointerCapture(captured);
    StopContact();app.dataset.dragging='false';$('pull-feedback').hidden=true;
  }
  function Begin(c, x, y, id = null) {
    if (!c || !view.ready || phase !== 'playing' || DialogOpen() || active || view.busy) return;
    if(!view.CanReach(c,toolId)){Hint('工具够不到 · 换长镊');Record('reachLimit',{id:c.id,depth:c.depth,reach:view.Reach(toolId),tool:toolId});return;}
    if(c.fine&&toolId==='brush')return;
    if(toolId==='brush'&&!c.fragment){Hint('毛刷只能扫拢细屑或刷松碎片');return;}
    if(c.fine&&toolId!=='feather'){Hint('细屑先用刷子扫拢，再用鹅绒掸带走');return;}
    if(!c.fine&&toolId==='feather'){Hint('鹅绒掸带不动大块');return;}
    if(toolId==='drops'){
      if(pointer){if(pointer.dropped.has(c.id))return;pointer.dropped.add(c.id);}
      c.wetting=Math.min(1,c.wetting+.92+(shop.ToolLevel('earDrops')-1)*.03);
      view.Drop(c);Sound('dropLiquid',.75,c);Record('soften',{id:c.id,target:c.wetting});
      Feedback('软化液已滴入');return;
    }
    if(view.Grip(c,x,y,toolId)===false){
      if(toolId==='tweezers')Hint('镊尖被挡住 · 点耳垢另一侧试试');
      return;
    }
    active=c;app.dataset.gripping='true';c.state='peeling';c.held=0;c.stretchPlayed=false;c.painLoad=0;
    pointer={...pointer,id,x,y,currentX:x,currentY:y};
    $('pull-feedback').hidden=false;$('pull-label').textContent=TYPE_NAMES[c.type];

    if(toolId!=='scoop')Sound(toolId==='suction'?'vacuumSuck':toolId==='brush'?'tickleFeather':toolId==='tweezers'?'metalTick':'scrapeSoft', .65, c); Record('grab', { id: c.id, tool: toolId });
  }
  function Release() {
    if(!active?.body.detached)return;
    const c=active;
    view.Release(c,harvested.length);Record('release',{id:c.id,typeName:c.type});
    active=null;app.dataset.gripping='false';StopContact();$('pull-feedback').hidden=true;

  }
  function Position(event) { const r = canvas.getBoundingClientRect(); return { x: event.clientX - r.left, y: event.clientY - r.top }; }
  function ClickTarget(x,y){
    if(phase!=='playing'||DialogOpen()||view.busy||action||!view.ready)return;
    const c=view.Pick(x,y,toolId);
    if(!c){Hint('点一下可见耳垢');return;}
    if(!view.CanReach(c,toolId)){Hint('工具够不到 · 换长镊');return;}
    if(c.type==='impacted'&&!c.fragment&&c.softened<.6&&toolId!=='drops'){Hint('硬结牢固 · 先滴软化液，等待约 3 秒');return;}
    if(toolId==='brush'&&!c.fragment&&!c.fine){Hint('柔毛刷用来扫小颗粒');return;}
    if(c.fine&&!['brush','feather'].includes(toolId)){Hint('小颗粒用柔毛刷或鹅绒掸');return;}
    if(!c.fine&&toolId==='feather'){Hint('大块耳垢用耳勺或镊子');return;}
    c.clickAction=true;c.clickApproach=null;
    action={c,id:c.id,tool:toolId,stage:'approach',age:0,x,y};
    $('action-cancel').hidden=false;Hint('正在靠近 · 自动调整器具方向');Record('actionStart',{id:c.id,tool:toolId});
  }
  let mousePointerId=1;
  function PointerDown(e){
    if(e.isPrimary===false||e.button!==0||DialogOpen())return;
    const p=Position(e);e.preventDefault();audio.unlock();canvas.focus({preventScroll:true});
    if(phase==='complete'){
      if(trayPointer==null&&view.TrayBegin(p.x,p.y)){trayPointer=e.pointerId;canvas.setPointerCapture(e.pointerId);}return;
    }
    if(e.pointerType==='touch')app.dataset.touch='true';
    view.AimLamp(p.x,p.y);ClickTarget(p.x,p.y);
  }
  canvas.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse')PointerDown(e);else mousePointerId=e.pointerId;});
  canvas.addEventListener('mousedown',e=>PointerDown({clientX:e.clientX,clientY:e.clientY,button:e.button,pointerId:mousePointerId,pointerType:'mouse',preventDefault:()=>e.preventDefault()}));
  canvas.addEventListener('pointermove',e=>{
    const p=Position(e);view.AimLamp(p.x,p.y);if(e.pointerType==='mouse')mousePointerId=e.pointerId;
    if(phase==='complete'&&trayPointer===e.pointerId&&!DialogOpen()){e.preventDefault();view.TrayMove(p.x,p.y);}
  });
  canvas.addEventListener('pointerup',e=>{if(trayPointer===e.pointerId)StopTrayInput();});
  canvas.addEventListener('mouseup',()=>{if(trayPointer===mousePointerId)StopTrayInput();});
  canvas.addEventListener('pointercancel',Cancel);
  canvas.addEventListener('lostpointercapture',()=>{if(trayPointer!=null)StopTrayInput();});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  window.addEventListener('blur',Cancel);window.addEventListener('resize',Cancel);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)Cancel();});
  window.addEventListener('keydown',e=>{
    if(e.key==='Escape'){Cancel();return;}
    if(DialogOpen()||/INPUT|BUTTON|SUMMARY|SELECT/.test(document.activeElement?.tagName))return;
    if(['1','2','3'].includes(e.key)){SetTool(['scoop','tweezers','drops'][Number(e.key)-1]);return;}
    if(document.activeElement!==canvas||phase!=='playing'||view.busy||action)return;
    const targets=view.Targets().filter(c=>['attached','returning','resting'].includes(c.state)&&c.screen.z>-1&&c.screen.z<1&&c.screen.x>=0&&c.screen.x<core.size.width&&c.screen.y>=0&&c.screen.y<core.size.height);
    if(!targets.length)return;
    if(e.key.startsWith('Arrow')){e.preventDefault();const index=targets.findIndex(c=>c.id===keyboardTarget),delta=['ArrowLeft','ArrowUp'].includes(e.key)?-1:1;keyboardTarget=targets[(index+delta+targets.length)%targets.length].id;Hint('已选耳垢 · 空格开始');return;}
    if(e.code==='Space'||e.key==='Enter'){e.preventDefault();if(e.repeat)return;audio.unlock();const c=targets.find(c=>c.id===keyboardTarget)||targets[0];ClickTarget(c.screen.x,c.screen.y);}
  });
  function Complete(expired=false) {
    if (phase !== 'playing') return;
    timedOut=expired;Cancel();if(expired)view.EndService();phase='complete';app.dataset.phase='complete';view.Showcase();UpdateProgress();
    const payout = practice?null:shop.FinishCustomer({ cleanliness01: CleanMass()/9, comfort01:satisfaction/100,relax01:satisfaction/100,bestCombo, harvest: harvested });
    Record('complete', { payout:payout?.payout,count:harvested.length,timedOut:expired,cleanliness:CleanMass()/9 });

    $('receipt').hidden=false;$('tray-cleanup').hidden=false;
    $('receipt-title').textContent=(expired?'服务结束':satisfaction>=85?'非常满意':satisfaction>=60?'还不错':'下次请轻一点')+' · +'+(payout?.payout||0)+' 枚';
    $('receipt-detail').textContent=`清洁 ${Math.round(CleanMass()/9*100)}% · 满意度 ${Math.round(satisfaction)}｜工时费 ${payout?.labor||0} + 小费 ${payout?.tip||0} + 手艺奖励 ${(payout?.comboBonus||0)+(payout?.perfectBonus||0)}`;
    if(practice){$('receipt-title').textContent='练习完成';$('receipt-detail').textContent=`${CUSTOMER_EARS[practice].label} · 清洁 ${Math.round(CleanMass()/9*100)}% · 不计营业收益`;$('receipt-next').textContent='再练一次';}
    $('next-customer').hidden=true;  Sound('sparkle', .3);
    const next=shop.state.todayCustomers.find(c=>!c.done);
    if(next&&!practice)view.PrepareCustomer(next.waxSeed,{earType:CustomerEarType(next)}).catch(error=>console.error('下一位客人准备失败',error));
  }
  function UpdateGameplaySettings(){
    const button=$('debug-next-customer');button.disabled=!!practice||phase==='preparing';
    button.textContent=phase==='preparing'?'正在准备下一位…':pendingCustomer?'重试接待当前顾客 →':'跳转下一个顾客 →';
    $('gameplay-status').textContent=practice?'练习中无法跳过营业顾客，请先返回营业。':pendingCustomer&&phase!=='preparing'?'准备失败，可重试接待同一位顾客。':'';
  }
  async function NextCustomer(skip=false) {
    if(phase==='preparing'||(skip&&practice)||(!skip&&phase!=='complete'))return;
    if(practice){StartCustomer();return;}
    Cancel();audio.unlock();view.EndService();
    if(!pendingCustomer){
      if(skip&&shop.SkipCustomer())Record('customerSkip',{id:shop.CurrentCustomer().id});
      shop.AdvanceCustomer();if(!shop.HasNextCustomer()){shop.NextDay();shop.StartDay(rng);}
      pendingCustomer=shop.CurrentCustomer();
    }
    const customer=pendingCustomer,button=$('receipt-next');phase='preparing';app.dataset.phase=phase;
    $('welcome')?.setAttribute('hidden','');$('receipt').hidden=false;$('tray-cleanup').hidden=true;
    button.disabled=true;button.textContent='正在准备下一位…';$('practice-start').disabled=true;UpdateGameplaySettings();
    try{
      if(!await view.PrepareCustomer(customer.waxSeed,{urgent:true,earType:CustomerEarType(customer)}))throw new Error('客人准备已取消');
      StartCustomer();pendingCustomer=null;$('settings-dialog').close();canvas.focus({preventScroll:true});
    }catch(error){
      console.error('客人准备失败',error);phase='complete';app.dataset.phase=phase;
      $('receipt-title').textContent='暂时没能接待';$('receipt-detail').textContent='请重试，将继续准备同一位顾客。';
    }finally{
      button.disabled=false;$('practice-start').disabled=false;button.textContent=pendingCustomer?'重试接待 →':'接待下一位 →';UpdateGameplaySettings();
    }
  }
  $('next-customer').onclick=()=>NextCustomer();
  $('debug-next-customer').onclick=()=>NextCustomer(true);
  $('receipt-next').onclick=()=>$('next-customer').click();
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
  function PracticeUi(){UpdateGameplaySettings();app.dataset.practice=String(!!practice);$('practice-return').hidden=!practice;$('practice-start').textContent=practice?'重开所选耳道':'进入测试关卡';$('receipt-next').textContent=practice?'再练一次':'接待下一位 →';app.querySelector('.care-objective>strong').textContent=practice?'自由练习 · 随时重开':'清理耳垢与微屑';}
  function StartPractice(){
    if(phase==='preparing')return;
    Cancel();
    if(!suspended)suspended={view:view.Suspend(),phase,toolId,harvested,elapsed,settle,satisfaction,combo,bestCombo,painCount,fractures,painCooldown,timedOut,timeLimit,feedback:feedback.slice(),customerName:$('customer-name').textContent,receiptTitle:$('receipt-title').textContent,receiptDetail:$('receipt-detail').textContent};
    practice=$('practice-type').value;if(!Object.hasOwn(CUSTOMER_EARS,practice))practice='oily';
    $('welcome')?.setAttribute('hidden','');$('settings-dialog').close();audio.unlock();StartCustomer();
    if(!view.RenderingProbe().lampOn)view.ToggleLamp();$('lamp-toggle').setAttribute('aria-pressed','true');$('lamp-toggle').textContent='☼ 检查灯 · 开';
    PracticeUi();canvas.focus({preventScroll:true});
  }
  function ReturnFromPractice(){
    if(!suspended)return;Cancel();const saved=suspended;view.Restore(saved.view);({phase,toolId,harvested,elapsed,settle,satisfaction,combo,bestCombo,painCount,fractures,painCooldown,timedOut,timeLimit}=saved);feedback.splice(0,feedback.length,...saved.feedback);practice=suspended=null;
    app.dataset.phase=phase;$('welcome')?.toggleAttribute('hidden',phase!=='ready');$('receipt').hidden=phase!=='complete';$('tray-cleanup').hidden=phase!=='complete';$('customer-name').textContent=saved.customerName;$('receipt-title').textContent=saved.receiptTitle;$('receipt-detail').textContent=saved.receiptDetail;$('settings-dialog').close();
    UpdateDepthControl(saved.view.inspectionTarget);$('view-toggle').textContent=saved.view.inside?'看耳廓 ↗':'进入耳道 ↗';
    const lit=view.RenderingProbe().lampOn;$('lamp-toggle').setAttribute('aria-pressed',String(lit));$('lamp-toggle').textContent='☼ 检查灯 · '+(lit?'开':'关');for(const button of app.querySelectorAll('[data-tool]'))button.setAttribute('aria-pressed',String(button.dataset.tool===toolId));
    PracticeUi();UpdateInventory();UpdateProgress();canvas.focus({preventScroll:true});
  }
  $('practice-start').onclick=StartPractice;$('practice-return').onclick=ReturnFromPractice;
  function OpenSettings(showGuide=false){Cancel();UpdateGameplaySettings();$('practice-start').disabled=phase==='preparing';$('operation-guide').open=showGuide;$('settings-dialog').showModal();if(showGuide)$('operation-guide').scrollIntoView({block:'nearest'});}
  $('settings-open').onclick=()=>OpenSettings();$('shop-open').onclick=OpenShop;
  $('welcome-shop').onclick=OpenShop;$('welcome-settings').onclick=()=>OpenSettings();$('welcome-help').onclick=()=>OpenSettings(true);
  function UpdateDepthControl(target){const label=target>0?'缩小观察入口':target<0?'返回标准视角':'放大观察深处';$('depth-toggle').setAttribute('aria-pressed',String(target>0));$('depth-toggle').setAttribute('aria-label',label);$('depth-toggle').title=label;}
  $('depth-toggle').onclick=()=>{if(phase!=='playing'||view.busy)return;Cancel();UpdateDepthControl(view.CycleDepth());};
  $('view-toggle').onclick = () => { if(phase==='ready')return;Cancel();$('view-toggle').textContent=view.ToggleView()==='ear'?'进入耳道 ↗':'看耳廓 ↗'; };
  $('settings-close').onclick = () => $('settings-dialog').close();
  $('sound-toggle').onclick = () => { audio.unlock(); settings.muted = !settings.muted; ApplySettings(); };
  for (const id of ['master', 'sfx', 'bgm']) $('volume-' + id).oninput = e => { settings[id] = +e.target.value; ApplySettings(); };
  $('haptics').onchange = e => { settings.haptics = e.target.checked; ApplySettings(); };

  function Interact(dt){
    let c=active;c.held+=dt;
    const before=c.body.anchors.filter(a=>a.alive).length;
    const state=view.Drag(c,pointer.currentX,pointer.currentY,dt,1+(shop.ToolLevel(TOOL_IDS[toolId])-1)*.08);
    if(state.bite){const source=c.id;c=active=state.bite;Record('oilyBite',{source,id:c.id,mass:c.mass});Sound('peelSticky',.7,c);}
    if(state.slipped){view.Slip(c);active=null;pointer.moved=false;Cancel();Hint('工作端滑脱 · 点另一处边缘再试');app.dataset.gripping='false';StopContact();Record('slip',{id:c.id});return;}
    c.painLoad=state.pain>0?c.painLoad+dt:Math.max(0,c.painLoad-dt);
    if(c.painLoad>.18&&!painCooldown){
      satisfaction=Math.max(5,satisfaction-9);painCount++;combo=0;painCooldown=4;
      Feedback('操作引起不适','pain');
      Record('pain',{id:c.id,satisfaction});UpdateProgress();
    }
    if(state.fracture){
      const pieces=view.Fracture(c);if(!pieces.length)return;Record('fracture',{id:c.id,pieces:pieces.map(p=>p.id)});fractures++;combo=0;satisfaction=Math.max(5,satisfaction-3);
      active=null;pointer.moved=false;app.dataset.gripping='false';StopContact();Sound('snapWax',.9,c);Reward('裂成了 '+pieces.length+' 片 · 碎屑仍需清理','warn');
      Feedback('硬拉导致碎裂','pain');UpdateProgress();Cancel();return;
    }
    $('pull-meter').value=state.strain;
    $('pull-label').textContent=state.wrongDirection?(toolId==='scoop'?'勺面没贴稳 · 点另一侧边缘':'夹爪未对准 · 点另一侧试试'):state.wrongTool?(toolId==='suction'?'只吸软化后的碎屑':'毛刷只能刷松碎屑'):state.needsForceps?'边缘松了 · 换镊子夹出':c.type==='impacted'&&c.softened<.6?'硬结牢固 · 先滴软化液':state.detached?'已经松脱 · 正在带出':c.type==='oily'?'黏着耳壁 · 缓慢挖取一小团':state.contact?'内壁有阻力 · 轻一点':toolId==='tweezers'?'镊尖已闭合 · 正在夹取':'边缘正在松开';
    if(state.remaining<before){Record('bondBreak',{id:c.id,remaining:state.remaining});Sound(c.type==='dry'?'peelDry':'peelSticky',state.detached?1:.55,c);}
    if(state.detached&&toolId==='suction')Record('suction',{id:c.id});
    if(state.detached&&c.state!=='held'){
      c.state='held';Record('detach',{id:c.id});

      if(settings.haptics&&navigator.vibrate)navigator.vibrate(16);
    }
    if(action&&state.detached){const source=action.c;Release();view.EndApproach(c);if(source!==c)view.EndApproach(source);action=null;pointer=null;$('action-cancel').hidden=true;return;}
    if(action&&state.needsForceps){Cancel();Hint('边缘松了 · 换镊子夹出');return;}
    if(action&&c.held>3.2){Cancel();Hint('附着还很牢 · 滴液软化后再取');return;}
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
      if(!action)view.EnsureTool(toolId);
      if(action){
        const a=action;a.age+=dt;
        if(a.stage==='approach'){
          const approach=view.Approach(a.c,a.x,a.y,a.tool,a.age,dt);
          if(approach.failed){Cancel();Hint(approach.reason==='reach'?'工具够不到 · 换长镊':'器具被耳壁挡住 · 点另一侧边缘试试');}
          else if(approach.ready){
            a.age=0;
            if(['brush','feather'].includes(a.tool)&&a.c.fine){a.stage='sweeping';Hint('刷毛正在扫过小颗粒');}
            else{
              pointer={id:null,x:a.x,y:a.y,currentX:a.x,currentY:a.y,dropped:new Set()};
              Begin(a.c,a.x,a.y);
              if(a.tool==='drops'){view.EndApproach(a.c);action=pointer=null;$('action-cancel').hidden=true;Hint('软化液已滴入 · 等约 3 秒再取');}
              else if(active)a.stage='working';
              else{Cancel();Hint('没有夹稳 · 点耳垢另一侧试试');}
            }
          }
        }else if(a.stage==='sweeping'){
          const sweep=view.ClickSweep(a.c,a.tool,a.age,dt);
          if(sweep.moved){
            Hint(a.tool==='brush'?`扫起 ${sweep.grains} 粒 · 用鹅绒掸带出`:`已带起 ${sweep.grains} 粒`);
            if(contactOn!=='sweep'){StopContact();audio.contact.begin('sweep');contactOn='sweep';}
            audio.contact.update('sweep',{speed01:.6,pressure01:.3,roughness01:.45,dt});
          }
          if(sweep.done){
            Record('sweep',{tool:a.tool,count:sweep.total,grains:sweep.grains});
            if(sweep.total){Reward(a.tool==='brush'?`扫松 ${sweep.grains} 粒 · 小颗粒已拢起`:`带出 ${sweep.grains} 粒`);if(settings.haptics&&navigator.vibrate)navigator.vibrate([8,25,8]);}
            Cancel();Hint(sweep.total?(a.tool==='brush'?'小颗粒已扫拢 · 换鹅绒掸点取':'小颗粒正在带出落盘'):'没有扫到小颗粒 · 点颗粒所在位置');
          }
        }else if(active&&pointer)Interact(dt);
      }else if(time>hintUntil)$('pull-feedback').hidden=true;
      for (const c of view.Update(dt)) {
        harvested.push({id:c.id,type:c.type,size:c.size,mass:c.mass,fragment:c.fragment});Record('land',{id:c.id,mass:c.mass});
        satisfaction=Math.min(100,satisfaction+c.mass*2);combo++;bestCombo=Math.max(bestCombo,combo);
        const landing=LandingSound(c);
        Sound(landing.cue,landing.gain,c);Record('landingSound',{id:c.id,...landing});UpdateProgress();
        Reward(`+${(c.mass/9*100).toFixed(c.mass<.09?1:0)}%`);
        if(settings.haptics&&navigator.vibrate)navigator.vibrate([12,40,8]);
        Feedback('清理完成，满意度提升');

      }
      if(!practice&&elapsed>=timeLimit){Complete(true);}
      if(CleanMass()>(view.chunks[0]?.type==='oily'?9-1e-8:8.999)&&!view.busy){settle+=dt;if(settle>.7)Complete();}
    } else { view.Update(phase==='complete'&&!DialogOpen()&&!document.hidden?dt:0); }
    if(phase==='complete'){const tray=view.TrayProbe();$('tray-count').textContent=tray.count?tray.count+' 件留在盘中':'盘子清空了';}
    const remaining=Math.max(0,timeLimit-elapsed);$('service-time').textContent=Math.floor(remaining/60).toString().padStart(2,'0')+':'+Math.floor(remaining%60).toString().padStart(2,'0');$('service-clock').dataset.urgent=String(remaining<30);
    if(practice){$('service-time').textContent='不限时';$('service-clock').dataset.urgent='false';}
    const transferring=String(!!view.transfer);if(app.dataset.transferring!==transferring)app.dataset.transferring=transferring;
    audio.Update(dt); core.Render();
  }
  function Probe() {
    return { version: VERSION,phase,practice,earType:practice||CustomerEarType(shop.CurrentCustomer()),timeLimit:practice?null:timeLimit,timeRemaining:practice?null:Math.max(0,timeLimit-elapsed),timedOut,controlScheme:'click',action:action?{stage:action.stage,id:action.id,tool:action.tool}:null,inputMode:'click',turning:!!turnPointer,tool: toolId, elapsed: +elapsed.toFixed(2), cleanliness: CleanMass()/9,satisfaction,painCount,fractures, harvest: harvested.map(x => ({ ...x })), active: active?.id ?? null,
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
