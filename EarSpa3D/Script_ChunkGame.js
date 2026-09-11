import * as THREE from 'three';
import { CreateCore } from './Script_Core.js?v=ear006-20260911';
import { CreateChunkScene } from './Script_ChunkScene.js?v=ear006-20260911';
import { CreateAudio } from './Script_Audio.js?v=ear006-20260911';
import { CreateShop } from './Script_Shop.js?v=ear006-20260911';
import { MakeRng } from './Script_Util.js?v=ear006-20260911';
import { CSS_VARS, PALETTE } from './Data_Palette.mjs?v=ear006-20260911';

const VERSION = 'ear006-20260911';
const Clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const TOOL_IDS = { scoop: 'earPickBamboo', tweezers: 'earForceps', drops: 'earDrops' };
const TYPE_NAMES = { dry: '奶黄薄片', wet: '琥珀软块', impacted: '紧实琥珀块' };
const ICONS = {
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
    <header class="spa-header"><div class="spa-brand">${Icon('ear')}<div><h1>采耳物语</h1><span>A little moment of calm</span></div></div>
      <div class="header-actions"><button id="sound-toggle" aria-label="静音" aria-pressed="false">声音开</button><button id="settings-open" aria-label="打开声音设置与小铺">设置</button></div></header>
    <section class="spa-game" aria-label="整块采耳游戏">
      <div class="session-bar"><div><span class="eyebrow">慢慢来 · 一块一块取干净</span><p id="customer-name">今日采耳</p></div>
        <div class="clean-meter"><div><span>清洁度</span><strong id="clean-value">0%</strong></div><progress id="clean-progress" max="9" value="0" aria-label="清洁度"></progress></div></div>
      <div class="instruction"><div class="instruction-step" id="gesture-icon">↓</div><div><strong id="action-title">按住一块，慢慢向下拉</strong><span id="action-detail">撬起边缘，让整块轻轻脱离</span></div><button id="next-customer" hidden>再来一位 →</button></div>
      <div class="play-stage" id="play-stage"><span class="view-label">耳道近景 <i>●</i></span><span class="tray-label">收藏盘 <b id="harvest-count">0 / 9</b></span>
        <div id="pull-feedback" class="pull-feedback" hidden><span id="pull-label">慢慢拉</span><progress id="pull-meter" max="1" value="0" aria-label="撬起进度"></progress></div>
        <div id="welcome" class="welcome"><div class="welcome-card"><span class="eyebrow">给自己一点放松时间</span><h2>把烦恼，<br>一块块放下。</h2><p>按住 · 撬起 · 整块拉出<br>没有倒计时，跟着自己的节奏。</p><button id="ear-start" class="primary">开始放松 ${Icon('ear')}</button><small>戴上耳机，听见每一次轻轻脱离</small></div></div>
      </div>
      <nav class="tool-dock" aria-label="采耳工具">
        <button data-tool="scoop" aria-pressed="true">${Icon('scoop')}<span><strong>竹耳勺</strong><small>撬起薄片</small></span><kbd>1</kbd></button>
        <button data-tool="tweezers" aria-pressed="false">${Icon('tweezers')}<span><strong>小镊子</strong><small>夹起软块</small></span><kbd>2</kbd></button>
        <button data-tool="drops" aria-pressed="false">${Icon('drops')}<span><strong>软化液</strong><small>点一下软化</small></span><kbd>3</kbd></button>
      </nav>
      <div class="quiet-footer"><span id="session-note" role="status" aria-live="polite">一根手指就可以，松手会轻轻放回</span><span>EAR SPA · 3D</span></div>
    </section>
    <dialog id="settings-dialog"><div class="dialog-heading"><div><span class="eyebrow">属于你的放松节奏</span><h2>声音与小铺</h2></div><button id="settings-close" aria-label="关闭设置">✕</button></div>
      <label class="slider-row">总音量<input id="volume-master" type="range" min="0" max="1" step="0.01" value="0.8"></label>
      <label class="slider-row">动作音效<input id="volume-sfx" type="range" min="0" max="1" step="0.01" value="0.85"></label>
      <label class="slider-row">背景音乐<input id="volume-bgm" type="range" min="0" max="1" step="0.01" value="0.16"></label>
      <label class="slider-row">轻微震动<input id="haptics" type="checkbox" checked></label>
      <div class="shop-summary"><strong id="shop-name"></strong><span id="shop-coins"></span></div><div id="shop-offers"></div>
      <details><summary>操作说明</summary><p>按住一块向下拖动，看到它抬起后继续拉，就会整块脱离。软化液点在紧实块上更省力。松手可放回，没有惩罚。</p><p>键盘：1/2/3 切换工具；画面获得焦点后，左右方向键选块，空格抓住，上下方向键控制拉出，Esc 放回。</p></details>
    </dialog>`;
  document.body.append(app);
  document.getElementById('play-stage').prepend(canvas);
  document.getElementById('ear-stage')?.remove();
  canvas.tabIndex = 0; canvas.setAttribute('aria-label', '耳道操作区，按住块体向下拖动整块取出');
  const $ = id => document.getElementById(id);
  const core = CreateCore({ canvas, viewCamera: new THREE.OrthographicCamera(-6, 6, 9, -9, .05, 100) });
  const view = CreateChunkScene({ core });
  const audio = CreateAudio();
  const shop = CreateShop();
  let settings = { master: .8, sfx: .85, bgm: .16, muted: false, haptics: true };
  try { settings = { ...settings, ...JSON.parse(localStorage.getItem('earspa3d.calm.settings') || '{}') }; } catch { /* 隐私模式也能玩 */ }
  let phase = 'ready', toolId = 'scoop', active = null, harvested = [], elapsed = 0, time = 0, settle = 0;
  let pointer = null, lastMove = 0, keyboardIndex = 0, contactOn = false;
  const events = [];
  const rng = MakeRng(20260911 + shop.day * 307 + shop.state.totalCustomers * 997);
  function Record(type, data = {}) { events.push({ type, at: +time.toFixed(3), ...data }); if (events.length > 160) events.shift(); }
  function Note(text) { $('session-note').textContent = text; }
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
  function StopContact() { if (contactOn) audio.contact.end('scrape', { release: .06 }); contactOn = false; }
  function UpdateProgress() {
    $('harvest-count').textContent = `${harvested.length} / 9`;
    $('clean-value').textContent = `${Math.round(harvested.length / 9 * 100)}%`;
    $('clean-progress').value = harvested.length;
  }
  function StartCustomer() {
    if (!shop.CurrentCustomer()) shop.StartDay(rng);
    const customer = shop.CurrentCustomer();
    view.Reset(customer.waxSeed);
    harvested = []; active = pointer = null; elapsed = settle = 0; phase = 'playing';
    UpdateProgress(); $('next-customer').hidden = true;
    $('customer-name').textContent = `第 ${shop.day} 天 · ${customer.name}`;
    Instructions('按住一块，慢慢向下拉', '撬起边缘，让整块轻轻脱离');
    Note('一根手指就可以，松手会轻轻放回');
    Record('customerStart', { seed: customer.waxSeed });
    audio.setBgm(shop.state.mood);
  }
  // 首屏先摆好同一局，不播放、不计时，点击后直接开始操作。
  shop.StartDay(rng); view.Reset(shop.CurrentCustomer().waxSeed);
  $('customer-name').textContent = `第 ${shop.day} 天 · ${shop.CurrentCustomer().name}`;
  $('ear-start').onclick = () => { audio.unlock(); $('welcome').remove(); StartCustomer(); Sound('uiTap', .3); };
  function SetTool(id) {
    Cancel(); toolId = id;
    for (const button of app.querySelectorAll('[data-tool]')) button.setAttribute('aria-pressed', String(button.dataset.tool === id));
    if (phase !== 'complete') Instructions(id === 'drops' ? '点一块，滴入软化液' : '按住一块，慢慢向下拉', id === 'drops' ? '紧实的琥珀块也能轻松整块取出' : id === 'tweezers' ? '夹紧软块，感受轻轻拉丝的阻力' : '用勺沿托住薄片，整片撬起来');
  }
  app.querySelectorAll('[data-tool]').forEach(button => { button.onclick = () => { audio.unlock(); SetTool(button.dataset.tool); Sound('uiTap', .22); }; });
  function Cancel() {
    if (active) { active.state = 'returning'; Record('cancel', { id: active.id, progress: active.progress }); }
    if (pointer?.id != null && canvas.hasPointerCapture(pointer.id)) canvas.releasePointerCapture(pointer.id);
    active = pointer = null; StopContact(); view.HideTool(); $('pull-feedback').hidden = true;
  }
  function Begin(c, x, y, id = null) {
    if (!c || phase !== 'playing' || $('settings-dialog').open || active || view.chunks.some(c => c.state === 'flying' || c.state === 'returning')) return;
    if (toolId === 'drops') {
      c.softened = Math.min(1, c.softened + .8 + (shop.ToolLevel('earDrops') - 1) * .05);
      c.mesh.material.roughness = .18; c.mesh.material.clearcoat = 1;
      c.mesh.material.color.lerp(new THREE.Color(PALETTE.waxGlow), .22);
      view.Drop(c);
      Sound('dropLiquid', .5, c); Record('soften', { id: c.id, amount: c.softened });
      Note('软化好了，换上竹勺或镊子，整块取出');
      Instructions('软软的，现在好取多了', '换回竹耳勺或小镊子，按住向下拉'); return;
    }
    active = c; c.state = 'peeling'; c.progress = 0; c.held = 0; c.stretchPlayed = false;
    const distance = Clamp(core.size.height * .19, 72, 110);
    const typeFactor = c.type === 'wet' ? 1.18 : c.type === 'impacted' ? 1.5 - c.softened * .67 : .95;
    const match = toolId === 'tweezers' && c.type === 'wet' ? .77 : toolId === 'scoop' && c.type === 'dry' ? .88 : 1;
    pointer = { id, x, y, currentX: x, currentY: y, distance: distance * typeFactor * match / (1 + (shop.ToolLevel(TOOL_IDS[toolId]) - 1) * .08) };
    view.ShowTool(c, toolId); $('pull-feedback').hidden = false; $('pull-label').textContent = TYPE_NAMES[c.type];
    Instructions('边缘抬起来了，继续向下拉', c.type === 'impacted' && !c.softened ? '这块比较紧实，用软化液会更省力' : '不用着急，让它完整地离开');
    Note(c.type === 'wet' ? '软块会轻轻拉丝，向下再拉一点' : '托住近处的边缘，慢慢把整片撬起');
    Sound('scoopLift', .22, c); Record('grab', { id: c.id, tool: toolId });
  }
  function Release() {
    if (!active) return;
    const c = active;
    view.Peel(c, 1);
    view.Release(c, harvested.length); Record('release', { id: c.id, typeName: c.type });
    Sound(c.type === 'dry' ? 'snapWax' : 'scoopLift', .9, c);
    if (settings.haptics && navigator.vibrate) navigator.vibrate(18);
    active = null; StopContact(); $('pull-feedback').hidden = true;
    Instructions('整块出来了。', '看它轻轻落进收藏盘');
  }
  function Position(event) { const r = canvas.getBoundingClientRect(); return { x: event.clientX - r.left, y: event.clientY - r.top }; }
  canvas.addEventListener('pointerdown', e => {
    if (!e.isPrimary || e.button !== 0 || pointer || phase !== 'playing') return;
    e.preventDefault(); audio.unlock(); const p = Position(e); Begin(view.Pick(p.x, p.y), p.x, p.y, e.pointerId);
    if (active) canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (!pointer || e.pointerId !== pointer.id) return;
    const p = Position(e); pointer.currentX = p.x; pointer.currentY = p.y; lastMove = time;
  });
  canvas.addEventListener('pointerup', e => {
    if (!pointer || e.pointerId !== pointer.id) return;
    if (active && pointer.currentY - pointer.y >= pointer.distance && active.held > .12) Release();
    Cancel();
  });
  canvas.addEventListener('pointercancel', Cancel);
  canvas.addEventListener('lostpointercapture', () => { if (active) Cancel(); });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('blur', Cancel);
  window.addEventListener('resize', Cancel);
  document.addEventListener('visibilitychange', () => { if (document.hidden) Cancel(); });
  window.addEventListener('keydown', e => {
    if ($('settings-dialog').open || /INPUT|BUTTON|SUMMARY/.test(document.activeElement?.tagName)) return;
    if (['1', '2', '3'].includes(e.key)) { SetTool(['scoop', 'tweezers', 'drops'][Number(e.key) - 1]); return; }
    if (document.activeElement !== canvas) return;
    const targets = view.chunks.filter(c => c.state === 'attached');
    if (e.key === 'Escape') Cancel();
    if (['ArrowLeft', 'ArrowRight'].includes(e.key) && !active) {
      e.preventDefault(); keyboardIndex = (keyboardIndex + (e.key === 'ArrowRight' ? 1 : -1) + targets.length) % Math.max(1, targets.length);
      if (targets[keyboardIndex]) { view.ShowTool(targets[keyboardIndex], toolId); Note(`已选中${TYPE_NAMES[targets[keyboardIndex].type]}，空格抓住`); }
    }
    if (e.code === 'Space' && !active && targets.length) { e.preventDefault(); audio.unlock(); const c = targets[keyboardIndex % targets.length]; const p = view.Project(c.mesh.position); Begin(c, p.x, p.y); }
    if (active && ['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); pointer.currentY += e.key === 'ArrowDown' ? 16 : -16; lastMove = time; }
  });
  function Complete() {
    if (phase !== 'playing') return;
    phase = 'complete';
    const payout = shop.FinishCustomer({ cleanliness01: 1, comfort01: .95, relax01: 1, bestCombo: 9, harvest: harvested });
    Record('complete', { payout: payout?.payout, count: harvested.length });
    Instructions('干干净净，刚刚好。', `9 块完整收藏 · 收到 ${payout?.payout || 0} 枚小费与报酬`);
    $('next-customer').hidden = false; Note('这份干净留给你，想继续的时候再来一位'); Sound('sparkle', .3);
  }
  $('next-customer').onclick = () => {
    if (phase !== 'complete') return;
    audio.unlock(); shop.AdvanceCustomer(); if (!shop.HasNextCustomer()) { shop.NextDay(); shop.StartDay(rng); }
    StartCustomer();
  };
  function RefreshShop() {
    $('shop-name').textContent = shop.Snapshot().shopName;
    $('shop-coins').textContent = `${shop.coins} 枚`;
    const list = [['earPickBamboo', '竹耳勺'], ['earForceps', '小镊子'], ['earDrops', '软化液']];
    $('shop-offers').innerHTML = list.map(([id, name]) => {
      const offer = shop.ToolUpgradeOffer(id);
      return `<div class="upgrade-row"><span>${name} · Lv.${offer.level}<small>${id === 'earDrops' ? '提高每次软化效果' : '拉出距离更短，更省力'}</small></span><button data-upgrade="${id}" ${offer.affordable ? '' : 'disabled'}>${offer.maxed ? '已满级' : `${offer.cost} 枚升级`}</button></div>`;
    }).join('');
    const offer = shop.ShopOffer();
    $('shop-offers').insertAdjacentHTML('beforeend', `<div class="upgrade-row"><span>升级小铺<small>提高报酬与每日客数</small></span><button data-upgrade="shop" ${offer.affordable ? '' : 'disabled'}>${offer.maxed ? '已满级' : `${offer.cost} 枚升级`}</button></div>`);
    $('shop-offers').querySelectorAll('[data-upgrade]').forEach(b => { b.onclick = () => { const result = b.dataset.upgrade === 'shop' ? shop.UpgradeShop() : shop.UpgradeTool(b.dataset.upgrade); if (result.ok) Sound('uiConfirm', .3); RefreshShop(); }; });
  }
  $('settings-open').onclick = () => { Cancel(); RefreshShop(); $('settings-dialog').showModal(); };
  $('settings-close').onclick = () => $('settings-dialog').close();
  $('sound-toggle').onclick = () => { audio.unlock(); settings.muted = !settings.muted; ApplySettings(); };
  for (const id of ['master', 'sfx', 'bgm']) $('volume-' + id).oninput = e => { settings[id] = +e.target.value; ApplySettings(); };
  $('haptics').onchange = e => { settings.haptics = e.target.checked; ApplySettings(); };

  function Frame(dt) {
    time += dt;
    if (phase === 'playing' && !$('settings-dialog').open && !document.hidden) {
      elapsed += dt;
      if (active && pointer) {
        active.held += dt;
        const target = Clamp((pointer.currentY - pointer.y) / pointer.distance);
        const prev = active.progress;
        const next = prev + (target - prev) * (1 - Math.exp(-dt * 15));
        view.Peel(active, next, Clamp((pointer.currentX - pointer.x) / 80, -1, 1));
        view.ShowTool(active, toolId, next);
        $('pull-meter').value = next;
        if (next > .99 && active.held > .16) { Release(); }
        else {
          if (active.type === 'wet' && next > .32 && !active.stretchPlayed) { active.stretchPlayed = true; Sound('stretchWax', .24, active); }
          const moving = time - lastMove < .12 && Math.abs(next - prev) > .001;
          if (moving && !contactOn) { audio.contact.begin('scrape'); contactOn = true; }
          if (!moving) StopContact();
          if (contactOn) audio.contact.update('scrape', { speed01: .17, pressure01: .12, roughness01: active.type === 'dry' ? .3 : .06, dt });
        }
      }
      for (const c of view.Update(dt)) {
        harvested.push({ id: c.id, type: c.type, size: c.size }); Record('land', { id: c.id });
        Sound('chunkLand', .8, c); UpdateProgress();
        Instructions('一整块，收好啦。', '继续按住下一块，慢慢向下拉'); Note(`${TYPE_NAMES[c.type]} +1 · 每一块都完整留下`);
      }
      if (harvested.length === 9) { settle += dt; if (settle > .7) Complete(); }
    } else { view.Update(0); }
    audio.Update(dt); core.Render();
  }
  function Probe() {
    return { version: VERSION, phase, tool: toolId, elapsed: +elapsed.toFixed(2), cleanliness: harvested.length / 9, harvest: harvested.map(x => ({ ...x })), active: active?.id ?? null,
      targets: view.Targets(), events: events.map(x => ({ ...x })), audio: audio.debug(), settings: { ...settings }, shop: shop.Snapshot(), stats: { ...core.stats },
      viewport: { width: innerWidth, height: innerHeight }, stage: (() => { const r = canvas.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })() };
  }
  Object.defineProperty(window, '__EarSpaProbe', { value: Probe, configurable: true });
  if (new URLSearchParams(location.search).get('debug') === '1') {
    window.__EarSpaDebug = { StepFrames(n = 1) { for (let i = 0; i < Math.min(n, 3600); i++) Frame(1 / 60); return Probe(); }, Probe, audio, view, shop, core };
  }
  core.Resize(); view.Resize(); Frame(0);
  document.getElementById('ear-boot')?.remove();
  function Animate(now) { Frame(core.Tick(now)); requestAnimationFrame(Animate); }
  requestAnimationFrame(Animate);
}
