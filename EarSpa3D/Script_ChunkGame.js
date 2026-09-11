import * as THREE from 'three';
import { ToolIcon } from './Script_ToolIcons.mjs?v=ear014-ui-20260912';
import { CreateCore } from './Script_Core.js?v=ear011-20260911';
import { CreateImmersiveScene } from './Script_ImmersiveScene.js?v=ear019-hair-complexion-20260912';
import { CreateAudio } from './Script_Audio.js?v=ear012-size-audio-20260912';
import { LandingSound } from './Script_LandingSound.mjs?v=ear012-size-audio-20260912';
import { CreateShop } from './Script_Shop.js?v=ear011-20260911';
import { MakeRng } from './Script_Util.js?v=ear011-20260911';
import { CSS_VARS, PALETTE } from './Data_Palette.mjs?v=ear011-20260911';

import { CreateInstrumentShop } from './Script_InstrumentShop.js?v=ear014-ui-20260912';

const VERSION = 'ear019-hair-complexion-20260912';
const Clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const TOOL_IDS = { scoop: 'earPickBamboo', tweezers: 'earForceps', drops: 'earDrops',brush:'softBrush',suction:'microSuction',feather:'gooseFeather' };
const TYPE_NAMES = { dry: '干性薄层', wet: '黏性耳垢', impacted: '紧实硬结' };


export async function Start() {
  for (const [key, value] of Object.entries(CSS_VARS)) document.documentElement.style.setProperty(key, value);
  const canvas = document.getElementById('ear-canvas');
  const app = document.createElement('main'); app.id = 'ear-app';
  app.innerHTML = `
    <svg class="tool-icon-filters" width="0" height="0" aria-hidden="true"><defs><filter id="tool-icon-cutout" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  5 5 5 0 -0.15"/></filter></defs></svg>
    <header class="spa-header"><div class="spa-brand"><span class="eyebrow">EAR CARE</span><p id="customer-name">今日采耳</p></div>
      <div class="header-actions"><button id="settings-open" aria-label="打开声音设置">设置</button></div></header>
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
        <button data-tool="drops" aria-pressed="false">${ToolIcon('drops')}<span><strong>软化液</strong><small>点一下软化</small></span><kbd>3</kbd></button>
      </nav>
    </section>
    <dialog id="settings-dialog" aria-labelledby="settings-title"><div class="dialog-heading"><div><span class="eyebrow">EAR CARE / SETTINGS</span><h2 id="settings-title">声音与轻触</h2></div><button id="settings-close" aria-label="关闭设置">✕</button></div>
      <div class="slider-row"><span>声音</span><button id="sound-toggle" aria-label="静音" aria-pressed="false">声音开</button></div>
      <label class="slider-row">总音量<input id="volume-master" type="range" min="0" max="1" step="0.01" value="0.8"></label>
      <label class="slider-row">动作音效<input id="volume-sfx" type="range" min="0" max="1" step="0.01" value="0.85"></label>
      <label class="slider-row">背景音乐<input id="volume-bgm" type="range" min="0" max="1" step="0.01" value="0.16"></label>
      <label class="slider-row">轻微震动<input id="haptics" type="checkbox" checked></label>

      <details id="operation-guide"><summary>操作指南</summary><p>鼠标右键按住连续旋转，松开停止，工具留在接触点；左键持续按住，耳勺沿接近垂直于耳道壁的方向把耳垢刮离，镊子沿夹持方向夹起。手机切换转向／施力，分别单指按住。工具遇到内壁会受阻。点放大镜切换深浅视野，短耳勺工作长度有限；深处用长镊，硬结先滴液软化。松脱后仍在工具上，松手由工具托送到耳外，再轻放入盘。硬结先滴液等待约 3 秒。干薄片用耳勺托边，黏块先松边再用镊子夹；硬拉会痛或碎裂。碎屑可用耳勺清理，也可买毛刷轻扫或用吸引管吸走湿碎屑。中途松手会放回。</p><p>键盘：1/2/3 切换工具；画面获得焦点后，左右方向键选块，空格抓住，Q/E 旋转方向，空格松手，Esc 取消。</p></details>
    </dialog>`;
  document.body.append(app);
  app.querySelector('.spa-brand').insertAdjacentHTML('beforeend','<div class="session-status"></div>');
  app.querySelector('.session-status').append(app.querySelector('.clean-meter'));
  app.querySelector('.header-actions').insertAdjacentHTML('afterbegin','<button id="shop-open">小铺</button>');
  app.querySelector('.session-status').insertAdjacentHTML('beforeend','<span id="satisfaction" title="客人满意度">☺ 85</span>');
  app.querySelector('.play-stage').insertAdjacentHTML('beforeend','<div id="reward-toast" hidden role="status"></div><section id="receipt" hidden><span>本次采耳</span><h2 id="receipt-title"></h2><p id="receipt-detail"></p><div><button id="receipt-shop">逛逛小铺</button><button id="receipt-next">接待下一位 →</button></div></section>');
  for(const [id,label,detail] of [['brush','柔毛刷','刷松干屑'],['suction','吸引管','清理软化碎屑'],['feather','鹅绒掸','成片带走微屑']])app.querySelector('.tool-dock').insertAdjacentHTML('beforeend',`<button data-tool="${id}" aria-pressed="false" hidden>${ToolIcon(id)}<span><strong>${label}</strong><small>${detail}</small></span></button>`);
  app.querySelector('.dialog-heading').insertAdjacentHTML('afterend','<button id="audio-test">试听挖取音效</button>');
  document.getElementById('play-stage').prepend(canvas);
  document.getElementById('ear-stage')?.remove();
  canvas.tabIndex = 0; canvas.setAttribute('aria-label', '耳道操作区，工具接触耳垢后，自由拨动或夹取');
  const $ = id => document.getElementById(id);
  app.insertAdjacentHTML('beforeend','<button id="depth-toggle" class="depth-toggle" aria-pressed="false" aria-label="放大观察深处" title="放大观察"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5M7 10h6"/><path class="zoom-plus" d="M10 7v6"/></svg></button>');
  const core = CreateCore({ canvas, viewCamera: new THREE.PerspectiveCamera(65, 1, .05, 400) });
  const view = await CreateImmersiveScene({ core });
  const audio = CreateAudio();
  const shop = CreateShop();
  let settings = { master: .8, sfx: .85, bgm: .16, muted: false, haptics: true };
  try { settings = { ...settings, ...JSON.parse(localStorage.getItem('earspa3d.calm.settings') || '{}') }; } catch { /* 隐私模式也能玩 */ }
  let phase = 'ready', toolId = 'scoop', active = null, harvested = [], elapsed = 0, time = 0, settle = 0;
  app.dataset.phase='ready';
  let turnPointer=null,touchMode='force',timeLimit=210,timedOut=false;
  let pointer = null, keyboardIndex = 0, contactOn = false, pendingHover = null;
  let hintUntil=0,satisfaction=85,painCooldown=0,rewardUntil=0,combo=0,bestCombo=0,painCount=0,fractures=0;
  const events = [],feedback=[];
  app.querySelector('.play-stage').insertAdjacentHTML('beforeend','<button id="lamp-toggle" class="lamp-toggle" aria-pressed="false">☼ 检查灯 · 关</button>');
  app.querySelector('.play-stage').insertAdjacentHTML('beforeend','<div id="precision-controls"><div class="touch-modes"><button id="mode-force" aria-pressed="true">施力</button><button id="mode-turn" aria-pressed="false">转向</button></div></div><div id="service-clock" role="timer" aria-label="服务剩余时间"><span>剩余服务</span><b id="service-time">03:30</b></div>');
  app.querySelector('.care-objective').append($('service-clock'));
  for (const button of app.querySelectorAll('[data-tool]')) button.title = button.textContent.trim();
  function SetTouchMode(mode){Cancel();touchMode=mode;$('mode-force').setAttribute('aria-pressed',String(mode==='force'));$('mode-turn').setAttribute('aria-pressed',String(mode==='turn'));}
  $('mode-force').onclick=()=>SetTouchMode('force');$('mode-turn').onclick=()=>SetTouchMode('turn');
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
  function CleanMass(){return Math.min(9,harvested.reduce((sum,c)=>sum+c.mass,0));}
  function UpdateInventory(){const inv=shop.Snapshot().inventory;for(const button of app.querySelectorAll('[data-tool]'))button.hidden=!inv.tools.includes(button.dataset.tool);view.SetSkins(inv.equipped,Object.fromEntries(Object.entries(TOOL_IDS).map(([id,key])=>[id,shop.ToolLevel(key)])));}

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
  $('audio-test').onclick=()=>{audio.unlock();Sound('peelDry',1);};
  function StopContact() { if (contactOn) audio.contact.end('scrape', { release: .06 }); contactOn = false; }
  function UpdateProgress(){
    const percent=Math.round(CleanMass()/9*100);
    $('harvest-count').textContent=harvested.length+' 件';$('clean-value').textContent=percent+'%';$('clean-progress').value=CleanMass();
    $('satisfaction').textContent=(satisfaction>75?'☺':satisfaction>50?'◔':'☹')+' '+Math.round(satisfaction);
    $('satisfaction').dataset.mood=satisfaction>75?'happy':satisfaction>50?'neutral':'hurt';
  }
  function StartCustomer() {
    if (!shop.CurrentCustomer()) shop.StartDay(rng);
    const customer = shop.CurrentCustomer();
    feedback.length=0;
    view.Reset(customer.waxSeed);timeLimit=210;timedOut=false;
    view.Enter();
    $('view-toggle').textContent='看耳廓 ↗';
    harvested=[];active=pointer=null;elapsed=settle=0;phase='playing';app.dataset.phase='playing';satisfaction=85;$('depth-toggle').setAttribute('aria-pressed','false');$('depth-toggle').setAttribute('aria-label','放大观察深处');$('depth-toggle').title='放大观察';combo=bestCombo=painCount=fractures=0;painCooldown=0;$('receipt').hidden=true;UpdateInventory();
    UpdateProgress(); $('next-customer').hidden = true;
    $('customer-name').textContent = `第 ${shop.day} 天 · ${customer.name}`;

    Record('customerStart',{seed:customer.waxSeed});
    audio.setBgm(shop.state.mood);
  }
  // 首屏先摆好同一局，不播放、不计时，点击后直接开始操作。
  shop.StartDay(rng); view.Reset(shop.CurrentCustomer().waxSeed);
  $('customer-name').textContent = `第 ${shop.day} 天 · ${shop.CurrentCustomer().name}`;
  $('ear-start').onclick = () => { audio.unlock(); $('welcome').remove(); StartCustomer(); canvas.focus({preventScroll:true}); Sound('uiTap', .3); };
  function SetTool(id) {
    if(!shop.Snapshot().inventory.tools.includes(id))return;Cancel();toolId=id;UpdateInventory();
    for (const button of app.querySelectorAll('[data-tool]')) button.setAttribute('aria-pressed', String(button.dataset.tool === id));
  }
  app.querySelectorAll('[data-tool]').forEach(button => { button.onclick = () => { audio.unlock(); SetTool(button.dataset.tool); Sound('uiTap', .22); }; });
  function Cancel() {
    pendingHover=null;
    if(turnPointer){const id=turnPointer.id;turnPointer=null;view.TurnEnd();if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);}
    if(active) {
      if(active.body.detached) Release();
      else {view.Ungrip(active);active.state='returning';Record('cancel',{id:active.id,progress:active.progress});}
    }
    const captured=pointer?.id;
    active=pointer=null;app.dataset.gripping="false";
    if(captured!=null&&canvas.hasPointerCapture(captured))canvas.releasePointerCapture(captured);
    StopContact();if(!view.busy)view.HideTool();$('pull-feedback').hidden=true;
  }
  function Begin(c, x, y, id = null) {
    if (!c || !view.ready || phase !== 'playing' || DialogOpen() || active || view.busy) return;
    if(!view.CanReach(c,toolId)){view.ShowTool(c,toolId,0,{x,y});Hint('工具够不到 · 换长镊');Record('reachLimit',{id:c.id,depth:c.depth,reach:view.Reach(toolId),tool:toolId});return;}
    if(c.fine&&toolId!=='feather'){Hint('细屑用鹅绒掸');return;}
    if(!c.fine&&toolId==='feather'){Hint('鹅绒掸带不动大块');return;}
    if(toolId==='drops'){
      c.wetting=Math.min(1,c.wetting+.92+(shop.ToolLevel('earDrops')-1)*.03);
      view.Drop(c);Sound('dropLiquid',.75,c);Record('soften',{id:c.id,target:c.wetting});
      Feedback('软化液已滴入');return;
    }
    active=c;app.dataset.gripping='true';c.state='peeling';c.held=0;c.stretchPlayed=false;c.painLoad=0;
    pointer={id,x,y,currentX:x,currentY:y};
    view.Grip(c,x,y,toolId);
    $('pull-feedback').hidden=false;$('pull-label').textContent=TYPE_NAMES[c.type];

    Sound(toolId==='suction'?'vacuumSuck':toolId==='brush'?'tickleFeather':toolId==='tweezers'?'metalTick':'scrapeSoft', .65, c); Record('grab', { id: c.id, tool: toolId });
  }
  function Release() {
    if(!active?.body.detached)return;
    const c=active;
    view.Release(c,harvested.length);Record('release',{id:c.id,typeName:c.type});
    active=null;app.dataset.gripping='false';StopContact();$('pull-feedback').hidden=true;

  }
  function Position(event) { const r = canvas.getBoundingClientRect(); return { x: event.clientX - r.left, y: event.clientY - r.top }; }
  function PointerDown(e){
    if(e.isPrimary===false||![0,2].includes(e.button)||phase!=='playing'||DialogOpen()||view.busy)return;
    pendingHover=null;if(pointer||turnPointer)Cancel();
    const p=Position(e);view.AimLamp(p.x,p.y);e.preventDefault();audio.unlock();
    if(e.pointerType==='touch'){app.dataset.touch='true';}
    if(e.button===2||(e.pointerType==='touch'&&touchMode==='turn')){
      if(view.ready&&view.TurnStart(p.x,p.y,toolId)){turnPointer={id:e.pointerId,x:p.x,y:p.y};canvas.setPointerCapture(e.pointerId);Record('turnStart');}return;
    }
    if(e.button!==0)return;
    Begin(view.Pick(p.x,p.y,toolId),p.x,p.y,e.pointerId);if(active)canvas.setPointerCapture(e.pointerId);
  }
  canvas.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse')PointerDown(e);else mousePointerId=e.pointerId;});
  canvas.addEventListener('mousedown',e=>PointerDown({clientX:e.clientX,clientY:e.clientY,button:e.button,pointerId:mousePointerId,pointerType:'mouse',preventDefault:()=>e.preventDefault()}));
  let mousePointerId=1;
  canvas.addEventListener('pointermove',e=>{
    const p=Position(e);view.AimLamp(p.x,p.y);if(e.pointerType==='mouse')mousePointerId=e.pointerId;
    if(turnPointer){if(e.pointerId!==turnPointer.id)return;e.preventDefault();turnPointer.x=p.x;turnPointer.y=p.y;return;}
    // 高频鼠标事件只保留最新位置，每个可见帧做一次完整碰撞扫掠。
    if(!pointer){if(phase==='playing'&&!DialogOpen())pendingHover=p;return;}
    if(e.pointerId!==pointer.id)return;pointer.currentX=p.x;pointer.currentY=p.y;
  });
  function PointerUp(e){
    if(turnPointer?.id===e.pointerId&&(e.pointerType!=='mouse'||e.button===2)){turnPointer=null;view.TurnEnd();if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);Record('turnEnd',{angle:view.Heading()});return;}
    if(pointer&&e.pointerId===pointer.id&&(e.pointerType!=='mouse'||e.button===0))Cancel();
  }
  canvas.addEventListener('pointerup',e=>{if(e.pointerType!=='mouse')PointerUp(e);});
  canvas.addEventListener('mouseup',e=>PointerUp({pointerId:mousePointerId,pointerType:'mouse',button:e.button}));
  canvas.addEventListener('pointercancel', Cancel);
  canvas.addEventListener('lostpointercapture', () => { if (active||turnPointer) Cancel(); });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('blur', Cancel);
  window.addEventListener('resize', Cancel);
  document.addEventListener('visibilitychange', () => { if (document.hidden) Cancel(); });
  window.addEventListener('keydown', e => {
    if (DialogOpen() || /INPUT|BUTTON|SUMMARY/.test(document.activeElement?.tagName)) return;
    if (['1', '2', '3'].includes(e.key)) { SetTool(['scoop', 'tweezers', 'drops'][Number(e.key) - 1]); return; }
    if (document.activeElement !== canvas) return;
    const targets = view.chunks.filter(c => c.state === 'attached' || c.state === 'returning');
    if (e.key === 'Escape') Cancel();
    if (['ArrowLeft', 'ArrowRight'].includes(e.key) && !active) {
      e.preventDefault(); keyboardIndex = (keyboardIndex + (e.key === 'ArrowRight' ? 1 : -1) + targets.length) % Math.max(1, targets.length);
      if (targets[keyboardIndex]) { view.ShowTool(targets[keyboardIndex], toolId);  }
    }
    if(e.code==='Space'&&active){e.preventDefault();Cancel();return;}
    if (e.code === 'Space' && !active && targets.length) { e.preventDefault(); audio.unlock(); const c = targets[keyboardIndex % targets.length]; const p = view.Project(c.mesh.position); Begin(c, p.x, p.y); }
    if(['q','e'].includes(e.key.toLowerCase())&&targets.length){e.preventDefault();const c=active||targets[keyboardIndex%targets.length];Cancel();const p=view.Project(c.mesh.position);if(view.TurnStart(p.x,p.y,toolId)){view.TurnBy(e.key.toLowerCase()==='e'?.12:-.12,toolId);view.TurnEnd();}}
  });
  function Complete(expired=false) {
    if (phase !== 'playing') return;
    timedOut=expired;Cancel();if(expired)view.EndService();phase='complete';app.dataset.phase='complete';view.Showcase();UpdateProgress();
    const payout = shop.FinishCustomer({ cleanliness01: CleanMass()/9, comfort01:satisfaction/100,relax01:satisfaction/100,bestCombo, harvest: harvested });
    Record('complete', { payout:payout?.payout,count:harvested.length,timedOut:expired,cleanliness:CleanMass()/9 });

    $('receipt').hidden=false;
    $('receipt-title').textContent=(expired?'服务结束':satisfaction>=85?'非常满意':satisfaction>=60?'还不错':'下次请轻一点')+' · +'+(payout?.payout||0)+' 枚';
    $('receipt-detail').textContent=`清洁 ${Math.round(CleanMass()/9*100)}% · 满意度 ${Math.round(satisfaction)}｜工时费 ${payout?.labor||0} + 小费 ${payout?.tip||0} + 手艺奖励 ${(payout?.comboBonus||0)+(payout?.perfectBonus||0)}`;
    $('next-customer').hidden=true;  Sound('sparkle', .3);
  }
  $('next-customer').onclick = () => {
    if (phase !== 'complete') return;
    audio.unlock(); shop.AdvanceCustomer(); if (!shop.HasNextCustomer()) { shop.NextDay(); shop.StartDay(rng); }
    StartCustomer();
  };
  $('receipt-next').onclick=()=>$('next-customer').click();
  $('receipt-shop').onclick=()=>OpenShop();
  function OpenShop(){instrumentShop.Open();}
  function OpenSettings(showGuide=false){Cancel();$('operation-guide').open=showGuide;$('settings-dialog').showModal();if(showGuide)$('operation-guide').scrollIntoView({block:'nearest'});}
  $('settings-open').onclick=()=>OpenSettings();$('shop-open').onclick=OpenShop;
  $('welcome-shop').onclick=OpenShop;$('welcome-settings').onclick=()=>OpenSettings();$('welcome-help').onclick=()=>OpenSettings(true);
  $('depth-toggle').onclick=()=>{if(phase!=='playing'||view.busy)return;Cancel();const deep=$('depth-toggle').getAttribute('aria-pressed')!=='true';view.SetDeep(deep);$('depth-toggle').setAttribute('aria-pressed',String(deep));$('depth-toggle').setAttribute('aria-label',deep?'缩小观察入口':'放大观察深处');$('depth-toggle').title=deep?'缩小观察':'放大观察';};
  $('view-toggle').onclick = () => { if(phase==='ready')return;Cancel();$('view-toggle').textContent=view.ToggleView()==='ear'?'进入耳道 ↗':'看耳廓 ↗'; };
  $('settings-close').onclick = () => $('settings-dialog').close();
  $('sound-toggle').onclick = () => { audio.unlock(); settings.muted = !settings.muted; ApplySettings(); };
  for (const id of ['master', 'sfx', 'bgm']) $('volume-' + id).oninput = e => { settings[id] = +e.target.value; ApplySettings(); };
  $('haptics').onchange = e => { settings.haptics = e.target.checked; ApplySettings(); };

  function Interact(dt){
    const c=active;c.held+=dt;
    const before=c.body.anchors.filter(a=>a.alive).length;
    const state=view.Drag(c,pointer.currentX,pointer.currentY,dt,1+(shop.ToolLevel(TOOL_IDS[toolId])-1)*.08);
    c.painLoad=state.pain>0?c.painLoad+dt:Math.max(0,c.painLoad-dt);
    if(c.painLoad>.18&&!painCooldown){
      satisfaction=Math.max(5,satisfaction-9);painCount++;combo=0;painCooldown=4;
      Feedback('操作引起不适','pain');
      Record('pain',{id:c.id,satisfaction});UpdateProgress();
    }
    if(state.fracture){
      const pieces=view.Fracture(c);if(!pieces.length)return;Record('fracture',{id:c.id,pieces:pieces.map(p=>p.id)});fractures++;combo=0;satisfaction=Math.max(5,satisfaction-3);
      active=null;Cancel();Sound('snapWax',.9,c);Reward('裂成了 '+pieces.length+' 片 · 碎屑仍需清理','warn');
      Feedback('硬拉导致碎裂','pain');UpdateProgress();return;
    }
    $('pull-meter').value=state.strain;
    $('pull-label').textContent=state.wrongDirection?(toolId==='scoop'?'勺面方向不对 · 旋转后再撬':'夹爪未对准 · 旋转后再夹'):state.wrongTool?(toolId==='suction'?'只吸软化后的碎屑':'毛刷只能刷松碎屑'):state.needsForceps?'边缘松了 · 换镊子夹出':c.type==='impacted'&&c.softened<.6?'硬结牢固 · 先滴软化液':state.detached?'松手带出':state.contact?'内壁有阻力 · 轻一点':'边缘正在松开';
    if(state.remaining<before){Record('bondBreak',{id:c.id,remaining:state.remaining});Sound(c.type==='dry'?'peelDry':'peelSticky',state.detached?1:.55,c);}
    if(state.detached&&toolId==='suction'){Release();pointer=null;Record('suction',{id:c.id});return;}
    if(state.detached&&c.state!=='held'){
      c.state='held';Record('detach',{id:c.id});

      if(settings.haptics&&navigator.vibrate)navigator.vibrate(16);
    }
    const moving=state.force>.25&&!state.detached;
    if(moving&&!contactOn){audio.contact.begin('scrape');contactOn=true;}
    if(!moving)StopContact();
    if(contactOn)audio.contact.update('scrape',{speed01:Clamp(Math.hypot(...c.body.velocity)/3,.12,.65),pressure01:Clamp(state.force/70,.25,.8),roughness01:c.type==='dry'?.45:.12,dt});
  }
  function Frame(dt) {
    time+=dt;painCooldown=Math.max(0,painCooldown-dt);
    if(time>rewardUntil)$('reward-toast').hidden=true;
    if (phase === 'playing' && !DialogOpen() && !document.hidden) {
      dt=Math.min(dt,Math.max(0,timeLimit-elapsed));elapsed+=dt;
      if(pendingHover){const p=pendingHover;pendingHover=null;if(!pointer&&!turnPointer)view.Hover(p.x,p.y,toolId);}
      if(turnPointer)view.TurnBy(dt*Math.PI*.65,toolId);
      if(active&&pointer) Interact(dt);
      else if(!turnPointer&&time>hintUntil)$('pull-feedback').hidden=true;
      for (const c of view.Update(dt)) {
        harvested.push({id:c.id,type:c.type,size:c.size,mass:c.mass,fragment:c.fragment});Record('land',{id:c.id,mass:c.mass});
        satisfaction=Math.min(100,satisfaction+c.mass*2);combo++;bestCombo=Math.max(bestCombo,combo);
        const landing=LandingSound(c);
        Sound(landing.cue,landing.gain,c);Record('landingSound',{id:c.id,...landing});UpdateProgress();
        Reward(`+${(c.mass/9*100).toFixed(c.mass<.09?1:0)}%`);
        if(settings.haptics&&navigator.vibrate)navigator.vibrate([12,40,8]);
        Feedback('清理完成，满意度提升');

      }
      if(elapsed>=timeLimit){Complete(true);}
      if(CleanMass()>8.999&&!view.busy){settle+=dt;if(settle>.7)Complete();}
    } else { view.Update(0); }
    const remaining=Math.max(0,timeLimit-elapsed);$('service-time').textContent=Math.floor(remaining/60).toString().padStart(2,'0')+':'+Math.floor(remaining%60).toString().padStart(2,'0');$('service-clock').dataset.urgent=String(remaining<30);
    const transferring=String(!!view.transfer);if(app.dataset.transferring!==transferring)app.dataset.transferring=transferring;
    audio.Update(dt); core.Render();
  }
  function Probe() {
    return { version: VERSION,phase,timeLimit,timeRemaining:Math.max(0,timeLimit-elapsed),timedOut,inputMode:touchMode,turning:!!turnPointer,tool: toolId, elapsed: +elapsed.toFixed(2), cleanliness: CleanMass()/9,satisfaction,painCount,fractures, harvest: harvested.map(x => ({ ...x })), active: active?.id ?? null,
      targets: view.Targets(), transfer:view.transfer, model:view.modelInfo, viewReady:view.ready, rendering:view.RenderingProbe(), collision:view.CollisionProbe(),feedback:feedback.map(f=>({...f})), events: events.map(x => ({ ...x })), audio: audio.debug(), settings: { ...settings }, shop: shop.Snapshot(), stats: { ...core.stats },
      viewport: { width: innerWidth, height: innerHeight }, stage: (() => { const r = canvas.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })() };
  }
  UpdateInventory();UpdateProgress();core.Resize();view.Resize();Frame(0);await view.WarmTools();Frame(0);
  Object.defineProperty(window, '__EarSpaProbe', { value: Probe, configurable: true });
  if (new URLSearchParams(location.search).get('debug') === '1') {
    window.__EarSpaDebug = { StepFrames(n = 1) { for (let i = 0; i < Math.min(n, 3600); i++) Frame(1 / 60); return Probe(); }, Probe, audio, view, shop, core };
  }
  document.getElementById('ear-boot')?.remove();
  function Animate(now) { Frame(core.Tick(now)); requestAnimationFrame(Animate); }
  requestAnimationFrame(Animate);
}
