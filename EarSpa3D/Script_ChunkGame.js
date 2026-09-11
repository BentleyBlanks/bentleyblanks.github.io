import * as THREE from 'three';
import { CreateCore } from './Script_Core.js?v=ear009-20260911';
import { CreateImmersiveScene } from './Script_ImmersiveScene.js?v=ear009-20260911';
import { CreateAudio } from './Script_Audio.js?v=ear009-20260911';
import { CreateShop } from './Script_Shop.js?v=ear009-20260911';
import { MakeRng } from './Script_Util.js?v=ear009-20260911';
import { CSS_VARS, PALETTE } from './Data_Palette.mjs?v=ear009-20260911';

import { CreateInstrumentShop } from './Script_InstrumentShop.js?v=ear009-20260911';

const VERSION = 'ear009-20260911';
const Clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const TOOL_IDS = { scoop: 'earPickBamboo', tweezers: 'earForceps', drops: 'earDrops',brush:'softBrush',suction:'microSuction' };
const TYPE_NAMES = { dry: '干性薄层', wet: '黏性耳垢', impacted: '紧实硬结' };
const ICONS = {
  brush:'<path d="M17 29V13M11 14l1-10m4 10V3m4 11 1-10m3 11 2-9M10 16h15"/>',
  suction:'<path d="M20 29V13q0-7-5-7H9m0-3v7M17 29h6"/>',
  ear: '<path d="M13 26c-1-5-7-3-7-12a10 10 0 0 1 20 0c0 7-7 7-8 12-1 5-6 5-7 1M12 17v-4a4 4 0 0 1 8 0c0 4-5 3-5 7"/>',
  scoop: '<path d="M10 27 20 10"/><ellipse cx="22" cy="7" rx="3" ry="5" transform="rotate(30 22 7)"/>',
  tweezers: '<path d="m7 27 11-22q1-2 3-1l3 2q2 1 0 3L12 29M19 8l-8 16M22 10 14 25"/>',
  drops: '<path d="m19 4 8 8-5 5-8-8zM16 11l-8 8 5 5 8-8M8 23s-4 3-4 5a3 3 0 0 0 6 0c0-2-2-5-2-5Z"/>',
};
const Icon = name => `<svg viewBox="0 0 34 34" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.ear}</svg>`;

export async function Start() {
  for (const [key, value] of Object.entries(CSS_VARS)) document.documentElement.style.setProperty(key, value);
  const canvas = document.getElementById('ear-canvas');
  const app = document.createElement('main'); app.id = 'ear-app';
  app.innerHTML = `
    <header class="spa-header"><div class="spa-brand">${Icon('ear')}<div><h1>采耳物语</h1><span>PRECISION EAR CARE</span></div></div>
      <div class="header-actions"><button id="sound-toggle" aria-label="静音" aria-pressed="false">声音开</button><button id="settings-open" aria-label="打开声音设置">设置</button></div></header>
    <section class="spa-game" aria-label="整块采耳游戏">
      <div class="session-bar"><div><span class="eyebrow">慢慢来 · 一块一块取干净</span><p id="customer-name">今日采耳</p></div>
        <div class="clean-meter"><div><span>清洁度</span><strong id="clean-value">0%</strong></div><progress id="clean-progress" max="9" value="0" aria-label="清洁度"></progress></div></div>
      <div class="instruction"><div class="instruction-step" id="gesture-icon">◌</div><div><strong id="action-title">拿起工具，轻轻拨动边缘</strong><span id="action-detail">指尖带动工具，撬松后整块取出</span></div><button id="next-customer" hidden>再来一位 →</button></div>
      <div class="play-stage" id="play-stage"><button class="view-label" id="view-toggle" aria-label="切换耳廓与耳道视角">看耳廓 ↗</button><span class="tray-label">收藏盘 <b id="harvest-count">0 / 9</b></span>
        <div id="pull-feedback" class="pull-feedback" hidden><span id="pull-label">慢慢拉</span><progress id="pull-meter" max="1" value="0" aria-label="当前接触阻力"></progress></div>
        <div id="welcome" class="welcome"><div class="welcome-card"><span class="eyebrow">EAR SPA / REALTIME 3D</span><h2>看清每一处，<br>感受每次接触。</h2><p>探入 · 撬松 · 完整取出<br>打开检查灯，选择合适的工具。</p><button id="ear-start" class="primary">开始接待 ${Icon('ear')}</button><small>戴上耳机，听见每一次轻轻脱离</small></div></div>
      </div>
      <nav class="tool-dock" aria-label="采耳工具">
        <button data-tool="scoop" aria-pressed="true">${Icon('scoop')}<span><strong>竹耳勺</strong><small>撬起薄片</small></span><kbd>1</kbd></button>
        <button data-tool="tweezers" aria-pressed="false">${Icon('tweezers')}<span><strong>小镊子</strong><small>夹起软块</small></span><kbd>2</kbd></button>
        <button data-tool="drops" aria-pressed="false">${Icon('drops')}<span><strong>软化液</strong><small>点一下软化</small></span><kbd>3</kbd></button>
      </nav>
      <div class="quiet-footer"><span id="session-note" role="status" aria-live="polite">一根手指就可以，未松脱会回落，松脱后松手托送落盘</span><span>EAR SPA · 3D</span></div>
    </section>
    <dialog id="settings-dialog"><div class="dialog-heading"><div><span class="eyebrow">音频 / 操作反馈</span><h2>声音与轻触</h2></div><button id="settings-close" aria-label="关闭设置">✕</button></div>
      <label class="slider-row">总音量<input id="volume-master" type="range" min="0" max="1" step="0.01" value="0.8"></label>
      <label class="slider-row">动作音效<input id="volume-sfx" type="range" min="0" max="1" step="0.01" value="0.85"></label>
      <label class="slider-row">背景音乐<input id="volume-bgm" type="range" min="0" max="1" step="0.01" value="0.16"></label>
      <label class="slider-row">轻微震动<input id="haptics" type="checkbox" checked></label>

      <details><summary>操作说明</summary><p>拿工具接触一块耳垢，从边缘朝管腔空处轻轻托起或夹取，推向内壁会受阻。松脱后仍在工具上，松手由工具托送到耳外，再轻放入盘。硬结先滴液等待约 3 秒。干薄片用耳勺托边，黏块先松边再用镊子夹；硬拉会痛或碎裂。碎屑可用耳勺清理，也可买毛刷轻扫或用吸引管吸走湿碎屑。中途松手会放回。</p><p>键盘：1/2/3 切换工具；画面获得焦点后，左右方向键选块，空格抓住，方向键移动工具，空格松手，Esc 取消。</p></details>
    </dialog>`;
  document.body.append(app);
  app.querySelector('.spa-header').insertBefore(app.querySelector('.clean-meter'),app.querySelector('.header-actions'));
  app.querySelector('.header-actions').insertAdjacentHTML('afterbegin','<button id="shop-open">小铺</button>');
  app.querySelector('.spa-header').insertAdjacentHTML('beforeend','<span id="satisfaction" title="客人满意度">☺ 85</span>');
  app.querySelector('.play-stage').insertAdjacentHTML('beforeend','<div id="customer-bubble" hidden role="status"></div><div id="reward-toast" hidden role="status"></div><section id="receipt" hidden><span>本次采耳</span><h2 id="receipt-title"></h2><p id="receipt-detail"></p><div><button id="receipt-shop">逛逛小铺</button><button id="receipt-next">接待下一位 →</button></div></section>');
  for(const [id,label,detail] of [['brush','柔毛刷','刷松干屑'],['suction','吸引管','清理软化碎屑']])app.querySelector('.tool-dock').insertAdjacentHTML('beforeend',`<button data-tool="${id}" aria-pressed="false" hidden>${Icon(id)}<span><strong>${label}</strong><small>${detail}</small></span></button>`);
  app.querySelector('.dialog-heading').insertAdjacentHTML('afterend','<button id="audio-test">试听挖取音效</button>');
  document.getElementById('play-stage').prepend(canvas);
  document.getElementById('ear-stage')?.remove();
  canvas.tabIndex = 0; canvas.setAttribute('aria-label', '耳道操作区，工具接触耳垢后，自由拨动或夹取');
  const $ = id => document.getElementById(id);
  const core = CreateCore({ canvas, viewCamera: new THREE.PerspectiveCamera(65, 1, .05, 400) });
  const view = await CreateImmersiveScene({ core });
  const audio = CreateAudio();
  const shop = CreateShop();
  let settings = { master: .8, sfx: .85, bgm: .16, muted: false, haptics: true };
  try { settings = { ...settings, ...JSON.parse(localStorage.getItem('earspa3d.calm.settings') || '{}') }; } catch { /* 隐私模式也能玩 */ }
  let phase = 'ready', toolId = 'scoop', active = null, harvested = [], elapsed = 0, time = 0, settle = 0;
  let pointer = null, lastMove = 0, keyboardIndex = 0, contactOn = false;
  let satisfaction=85,painCooldown=0,bubbleUntil=0,rewardUntil=0,combo=0,bestCombo=0,painCount=0,fractures=0;
  const events = [],feedback=[];
  app.querySelector('.play-stage').insertAdjacentHTML('beforeend','<figure id="customer-sideview" hidden><img src="./Textures/Texture_CustomerSideProfile.png?v=ear009-20260911" alt="客人侧面与耳廓"><figcaption>侧面观察 · 耳外收集</figcaption></figure><button id="lamp-toggle" class="lamp-toggle" aria-pressed="false">☼ 检查灯 · 关</button><details id="customer-feedback"><summary><span class="feedback-heart">●</span> 客人反馈 <b id="feedback-count">0</b><span class="feedback-chevron">⌄</span></summary><div class="feedback-heading"><span id="feedback-name"></span><span id="feedback-mood"></span></div><ol id="feedback-list" aria-live="polite"></ol></details>');
  const instrumentShop=CreateInstrumentShop({app,shop,view,Cancel,Sound,UpdateInventory});
  const DialogOpen=()=>$('settings-dialog').open||instrumentShop.open;
  $('lamp-toggle').onclick=()=>{const on=view.ToggleLamp();$('lamp-toggle').setAttribute('aria-pressed',String(on));$('lamp-toggle').textContent='☼ 检查灯 · '+(on?'开':'关');Sound('uiTap',.2);};
  const rng = MakeRng(20260911 + shop.day * 307 + shop.state.totalCustomers * 997);
  function Record(type, data = {}) { events.push({ type, at: +time.toFixed(3), ...data }); if (events.length > 160) events.shift(); }
  function Note(text) { $('session-note').textContent = text; }
  function Bubble(message,kind='calm'){
    const previous=feedback.at(-1);if(!previous||previous.message!==message||time-previous.time>7||Math.round(satisfaction)!==previous.satisfaction){
      const entry={message,kind,time,satisfaction:Math.round(satisfaction),delta:Math.round(satisfaction)-(previous?.satisfaction??85)};feedback.push(entry);if(feedback.length>40)feedback.shift();
      const li=document.createElement('li');li.dataset.kind=kind;const quote=document.createElement('p');quote.textContent=message;const meta=document.createElement('small');meta.textContent=Math.floor(elapsed/60)+':'+String(Math.floor(elapsed%60)).padStart(2,'0')+' · 满意 '+entry.satisfaction+(entry.delta?' ('+(entry.delta>0?'+':'')+entry.delta+')':'');li.append(quote,meta);$('feedback-list').prepend(li);while($('feedback-list').children.length>40)$('feedback-list').lastChild.remove();$('feedback-count').textContent=feedback.length;$('feedback-name').textContent=shop.CurrentCustomer()?.name||'今日客人';$('feedback-mood').textContent=kind==='pain'?'需要轻一点':'渐渐放松';
    }
 $('customer-bubble').textContent=message;$('customer-bubble').dataset.kind=kind;$('customer-bubble').hidden=false;bubbleUntil=time+4; }
  function Reward(message,kind='good'){const box=$('reward-toast');box.textContent=message;box.dataset.kind=kind;box.hidden=false;box.getAnimations().forEach(a=>a.cancel());box.animate([{opacity:0,transform:'translate(-50%,12px) scale(.9)'},{opacity:1,transform:'translate(-50%,0) scale(1.04)',offset:.2},{opacity:1,transform:'translate(-50%,-7px) scale(1)',offset:.8},{opacity:0,transform:'translate(-50%,-18px) scale(1)'}],{duration:2200,fill:'forwards'});rewardUntil=time+2.3;}
  function CleanMass(){return Math.min(9,harvested.reduce((sum,c)=>sum+c.mass,0));}
  function UpdateInventory(){const inv=shop.Snapshot().inventory;for(const button of app.querySelectorAll('[data-tool]'))button.hidden=!inv.tools.includes(button.dataset.tool);view.SetSkins(inv.equipped,Object.fromEntries(Object.entries(TOOL_IDS).map(([id,key])=>[id,shop.ToolLevel(key)])));}

  function Instructions(title, detail) { $('action-title').textContent = title; $('action-detail').textContent = detail; }
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
    feedback.length=0;$('feedback-list').replaceChildren();$('feedback-count').textContent='0';
    view.Reset(customer.waxSeed);
    view.Enter();
    $('view-toggle').textContent='看耳廓 ↗';
    harvested=[];active=pointer=null;elapsed=settle=0;phase='playing';app.dataset.phase='playing';satisfaction=85;combo=bestCombo=painCount=fractures=0;painCooldown=0;$('receipt').hidden=true;UpdateInventory();
    UpdateProgress(); $('next-customer').hidden = true;
    $('customer-name').textContent = `第 ${shop.day} 天 · ${customer.name}`;
    Instructions('拿起工具，轻轻拨动边缘', '指尖带动工具，撬松后整块取出');
    Note('一根手指就可以，松手会轻轻放回');
    Record('customerStart',{seed:customer.waxSeed});Bubble(customer.name+'：慢慢来，我有点怕疼。');
    audio.setBgm(shop.state.mood);
  }
  // 首屏先摆好同一局，不播放、不计时，点击后直接开始操作。
  shop.StartDay(rng); view.Reset(shop.CurrentCustomer().waxSeed);
  $('customer-name').textContent = `第 ${shop.day} 天 · ${shop.CurrentCustomer().name}`;
  $('ear-start').onclick = () => { audio.unlock(); $('welcome').remove(); StartCustomer(); Sound('uiTap', .3); };
  function SetTool(id) {
    if(!shop.Snapshot().inventory.tools.includes(id))return;Cancel();toolId=id;UpdateInventory();
    for (const button of app.querySelectorAll('[data-tool]')) button.setAttribute('aria-pressed', String(button.dataset.tool === id));
    if(phase!=='complete'&&['brush','suction'].includes(id)){Instructions(id==='brush'?'顺着干燥碎屑轻扫':'先软化，再用吸引管收走碎屑','这些工具不撬硬结');return;}
    if (phase !== 'complete') Instructions(id === 'drops' ? '点一块，滴入软化液' : '拿起工具，轻轻拨动边缘', id === 'drops' ? '等待渗透，硬结润开后再松边夹取' : id === 'tweezers' ? '夹紧软块，感受轻轻拉丝的阻力' : '用勺沿托住薄片，整片撬起来');
  }
  app.querySelectorAll('[data-tool]').forEach(button => { button.onclick = () => { audio.unlock(); SetTool(button.dataset.tool); Sound('uiTap', .22); }; });
  function Cancel() {
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
    if(toolId==='drops'){
      c.wetting=Math.min(1,c.wetting+.92+(shop.ToolLevel('earDrops')-1)*.03);
      view.Drop(c);Sound('dropLiquid',.75,c);Record('soften',{id:c.id,target:c.wetting});
      Bubble('软化液正在渗透，等它润开再取。');Instructions('等待软化液渗透','硬结润开后，先用竹勺松边，再夹出');return;
    }
    active=c;app.dataset.gripping='true';c.state='peeling';c.held=0;c.stretchPlayed=false;c.painLoad=0;
    pointer={id,x,y,currentX:x,currentY:y};
    view.Grip(c,x,y,toolId);
    $('pull-feedback').hidden=false;$('pull-label').textContent=TYPE_NAMES[c.type];
    Instructions('顺着边缘轻轻撬，感受它松开', c.type === 'impacted' && !c.softened ? '这块比较紧实，用软化液会更省力' : '不用着急，让它完整地离开');
    Note(c.type === 'wet' ? '软块会轻轻拉丝，轻轻换个角度' : '托住近处的边缘，慢慢把整片撬起');
    Sound(toolId==='suction'?'vacuumSuck':toolId==='brush'?'tickleFeather':toolId==='tweezers'?'metalTick':'scrapeSoft', .65, c); Record('grab', { id: c.id, tool: toolId });
  }
  function Release() {
    if(!active?.body.detached)return;
    const c=active;
    view.Release(c,harvested.length);Record('release',{id:c.id,typeName:c.type});
    active=null;app.dataset.gripping='false';StopContact();$('pull-feedback').hidden=true;
    Instructions('稳稳带出，轻轻放下。','工具托住整块耳垢，送到耳外的小盘里');
  }
  function Position(event) { const r = canvas.getBoundingClientRect(); return { x: event.clientX - r.left, y: event.clientY - r.top }; }
  canvas.addEventListener('pointerdown', e => {
    if (!e.isPrimary || e.button !== 0 || pointer || phase !== 'playing') return;
    e.preventDefault(); audio.unlock(); const p = Position(e);view.AimLamp(p.x,p.y); Begin(view.Pick(p.x, p.y), p.x, p.y, e.pointerId);
    if (active) canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    const p = Position(e);view.AimLamp(p.x,p.y);
    if (!pointer) { if(phase==='playing' && !DialogOpen()) view.Hover(p.x,p.y,toolId); return; }
    if (e.pointerId !== pointer.id) return;
    pointer.currentX = p.x; pointer.currentY = p.y; lastMove = time;
  });
  canvas.addEventListener('pointerup', e => {
    if (!pointer || e.pointerId !== pointer.id) return;
    Cancel();
  });
  canvas.addEventListener('pointercancel', Cancel);
  canvas.addEventListener('lostpointercapture', () => { if (active) Cancel(); });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('blur', Cancel);
  window.addEventListener('resize', Cancel);
  document.addEventListener('visibilitychange', () => { if (document.hidden) Cancel(); });
  window.addEventListener('keydown', e => {
    if (DialogOpen() || /INPUT|BUTTON|SUMMARY/.test(document.activeElement?.tagName)) return;
    if (['1', '2', '3'].includes(e.key)) { SetTool(['scoop', 'tweezers', 'drops'][Number(e.key) - 1]); return; }
    if (document.activeElement !== canvas) return;
    const targets = view.chunks.filter(c => c.state === 'attached');
    if (e.key === 'Escape') Cancel();
    if (['ArrowLeft', 'ArrowRight'].includes(e.key) && !active) {
      e.preventDefault(); keyboardIndex = (keyboardIndex + (e.key === 'ArrowRight' ? 1 : -1) + targets.length) % Math.max(1, targets.length);
      if (targets[keyboardIndex]) { view.ShowTool(targets[keyboardIndex], toolId); Note(`已选中${TYPE_NAMES[targets[keyboardIndex].type]}，空格抓住`); }
    }
    if(e.code==='Space'&&active){e.preventDefault();Cancel();return;}
    if (e.code === 'Space' && !active && targets.length) { e.preventDefault(); audio.unlock(); const c = targets[keyboardIndex % targets.length]; const p = view.Project(c.mesh.position); Begin(c, p.x, p.y); }
    if(active&&['ArrowDown','ArrowUp','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();pointer.currentX+=(e.key==='ArrowRight'?8:e.key==='ArrowLeft'?-8:0);pointer.currentY+=(e.key==='ArrowDown'?8:e.key==='ArrowUp'?-8:0);lastMove=time;}
  });
  function Complete() {
    if (phase !== 'playing') return;
    phase='complete';app.dataset.phase='complete';view.Showcase();UpdateProgress();$('customer-bubble').hidden=true;
    const payout = shop.FinishCustomer({ cleanliness01: 1, comfort01:satisfaction/100,relax01:satisfaction/100,bestCombo, harvest: harvested });
    Record('complete', { payout: payout?.payout, count: harvested.length });
    Instructions('干干净净，刚刚好。', `本次收藏 · 收到 ${payout?.payout || 0} 枚小费与报酬`);
    $('receipt').hidden=false;
    $('receipt-title').textContent=(satisfaction>=85?'非常满意':satisfaction>=60?'还不错':'下次请轻一点')+' · +'+(payout?.payout||0)+' 枚';
    $('receipt-detail').textContent=`清洁 100% · 满意度 ${Math.round(satisfaction)}｜工时费 ${payout?.labor||0} + 小费 ${payout?.tip||0} + 手艺奖励 ${(payout?.comboBonus||0)+(payout?.perfectBonus||0)}`;
    $('next-customer').hidden=true; Note('这份干净留给你，想继续的时候再来一位'); Sound('sparkle', .3);
  }
  $('next-customer').onclick = () => {
    if (phase !== 'complete') return;
    audio.unlock(); shop.AdvanceCustomer(); if (!shop.HasNextCustomer()) { shop.NextDay(); shop.StartDay(rng); }
    StartCustomer();
  };
  $('receipt-next').onclick=()=>$('next-customer').click();
  $('receipt-shop').onclick=()=>OpenShop();
  function OpenShop(){instrumentShop.Open();}
  $('settings-open').onclick=()=>{Cancel();$('settings-dialog').showModal();};$('shop-open').onclick=OpenShop;
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
      Bubble(c.type==='impacted'&&c.softened<.6?'哎哟！这块太硬了，先软化一下吧。':'有点疼……轻一点，别顶着内壁。','pain');
      Sound('customerPain',.8,c);Record('pain',{id:c.id,satisfaction});UpdateProgress();
    }
    if(state.fracture){
      const pieces=view.Fracture(c);Record('fracture',{id:c.id,pieces:pieces.map(p=>p.id)});fractures++;combo=0;satisfaction=Math.max(5,satisfaction-3);
      active=null;Cancel();Sound('snapWax',.9,c);Reward('裂成了 '+pieces.length+' 片 · 碎屑仍需清理','warn');
      Bubble(c.type==='dry'?'薄层很脆，用耳勺托边，别用镊子硬夹。':'硬结被撬裂了，先软化，再清理碎屑。','pain');UpdateProgress();return;
    }
    $('pull-meter').value=state.strain;
    $('pull-label').textContent=state.wrongTool?(toolId==='suction'?'只吸软化后的碎屑':'毛刷只能刷松碎屑'):state.needsForceps?'边缘松了 · 换镊子夹出':c.type==='impacted'&&c.softened<.6?'硬结牢固 · 先滴软化液':state.detached?'松手带出':state.contact?'内壁有阻力 · 轻一点':'边缘正在松开';
    if(state.remaining<before){Record('bondBreak',{id:c.id,remaining:state.remaining});Sound(c.type==='dry'?'peelDry':'peelSticky',state.detached?1:.55,c);}
    if(state.detached&&toolId==='suction'){Release();pointer=null;Record('suction',{id:c.id});Instructions('碎屑进入吸引管','吸入滤芯后计入清洁度');return;}
    if(state.detached&&c.state!=='held'){
      c.state='held';Record('detach',{id:c.id});
      Instructions('松手带出','落盘后计入清洁度');
      if(settings.haptics&&navigator.vibrate)navigator.vibrate(16);
    }
    const moving=time-lastMove<.2&&state.force>.25&&!state.detached;
    if(moving&&!contactOn){audio.contact.begin('scrape');contactOn=true;}
    if(!moving)StopContact();
    if(contactOn)audio.contact.update('scrape',{speed01:Clamp(Math.hypot(...c.body.velocity)/3,.12,.65),pressure01:Clamp(state.force/70,.25,.8),roughness01:c.type==='dry'?.45:.12,dt});
  }
  function Frame(dt) {
    time+=dt;painCooldown=Math.max(0,painCooldown-dt);
    if(time>bubbleUntil)$('customer-bubble').hidden=true;
    if(time>rewardUntil)$('reward-toast').hidden=true;
    if (phase === 'playing' && !DialogOpen() && !document.hidden) {
      elapsed += dt;
      if(active&&pointer) Interact(dt);
      for (const c of view.Update(dt)) {
        harvested.push({id:c.id,type:c.type,size:c.size,mass:c.mass,fragment:c.fragment});Record('land',{id:c.id,mass:c.mass});
        satisfaction=Math.min(100,satisfaction+c.mass*2);combo++;bestCombo=Math.max(bestCombo,combo);
        Sound(c.toolId==='suction'?'vacuumSuck':'chunkLand',c.toolId==='suction'?.3:.9,c);Sound('sparkle',.24);UpdateProgress();
        Reward(`清洁 +${Math.round(c.mass/9*100)}% · ${c.fragment?'碎屑清走了':'整块取出！'}${combo>1?'  连续 '+combo+' 次':''}`);
        if(settings.haptics&&navigator.vibrate)navigator.vibrate([12,40,8]);
        Bubble(satisfaction>80?'嗯……舒服，感觉通透多了。':'这一下轻多了。继续慢慢来。');
        Instructions('收好啦，继续下一处','留意硬结与干碎屑，换合适的工具');
      }
      if(CleanMass()>8.999&&!view.busy){settle+=dt;if(settle>.7)Complete();}
    } else { view.Update(0); }
    $('customer-sideview').hidden=!view.busy||view.RenderingProbe().externalContext;
    audio.Update(dt); core.Render();
  }
  function Probe() {
    return { version: VERSION, phase, tool: toolId, elapsed: +elapsed.toFixed(2), cleanliness: CleanMass()/9,satisfaction,painCount,fractures, harvest: harvested.map(x => ({ ...x })), active: active?.id ?? null,
      targets: view.Targets(), transfer:view.transfer, model:view.modelInfo, viewReady:view.ready, rendering:view.RenderingProbe(), collision:view.CollisionProbe(),feedback:feedback.map(f=>({...f})), events: events.map(x => ({ ...x })), audio: audio.debug(), settings: { ...settings }, shop: shop.Snapshot(), stats: { ...core.stats },
      viewport: { width: innerWidth, height: innerHeight }, stage: (() => { const r = canvas.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })() };
  }
  Object.defineProperty(window, '__EarSpaProbe', { value: Probe, configurable: true });
  if (new URLSearchParams(location.search).get('debug') === '1') {
    window.__EarSpaDebug = { StepFrames(n = 1) { for (let i = 0; i < Math.min(n, 3600); i++) Frame(1 / 60); return Probe(); }, Probe, audio, view, shop, core };
  }
  UpdateInventory();UpdateProgress();core.Resize(); view.Resize(); Frame(0);
  document.getElementById('ear-boot')?.remove();
  function Animate(now) { Frame(core.Tick(now)); requestAnimationFrame(Animate); }
  requestAnimationFrame(Animate);
}
