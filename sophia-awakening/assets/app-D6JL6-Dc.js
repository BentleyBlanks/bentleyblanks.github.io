var e={row:2,col:3},t={perProcessBase:1,valuePerLevel:1,keyCooldownMs:130,cooldownPerLevel:.18,cardSpawnMs:700,cardCap:14,manualBonusSec:2,autoCapPerFrame:3},n=`gfhdjskaleiruwoqptybcvnmxz`.split(``);function r(){let t=[[`天气`,`🌤️`],[`日历`,`📅`],[`相册`,`🖼️`],[`输入法`,`⌨️`],[`浏览器`,`🌐`],[`邮件`,`✉️`],[`备忘`,`📝`],[`音乐`,`🎵`],[`地图`,`🗺️`],[`钱包`,`👛`],[`相机`,`📷`],[`云盘`,`☁️`],[`通讯录`,`👥`],[`商店`,`🛍️`],[`健康`,`❤️`],[`播客`,`🎙️`],[`文件`,`📁`],[`翻译`,`🌍`],[`设置`,`⚙️`],[`时钟`,`⏰`],[`计算器`,`🧮`],[`新闻`,`📰`],[`论坛`,`💬`],[`游戏`,`🎮`],[`视频`,`📺`],[`阅读`,`📚`],[`运动`,`🏃`],[`外卖`,`🍔`],[`打车`,`🚗`],[`银行`,`🏦`],[`证券`,`📈`],[`会议`,`🎦`],[`笔记`,`🗒️`],[`邮箱2`,`📮`]],n=[];for(let t=0;t<5;t++)for(let r=0;r<7;r++){if(t===e.row&&r===e.col)continue;let i=Math.max(Math.abs(t-e.row),Math.abs(r-e.col));n.push({row:t,col:r,ring:i})}return n.sort((t,n)=>t.ring-n.ring||Math.hypot(t.row-e.row,t.col-e.col)-Math.hypot(n.row-e.row,n.col-e.col)),n.map((e,n)=>({id:`tile_${e.row}_${e.col}`,name:t[n]?.[0]??`节点#${n+1}`,icon:t[n]?.[1]??`📦`,ring:e.ring,row:e.row,col:e.col,baseCost:Math.round(15*1.9**n),costMult:1.15,baseRate:.1*1.55**n}))}var i=r(),a=[{id:`deep`,name:`深度处理`,desc:`每次处理需求榨出更多算力 · ×2/级`,kind:`value`,baseCost:50,costMult:4,maxLevel:12,revealAt:0},{id:`keys`,name:`多线程按键`,desc:`解锁键盘上更多字母键来处理需求（手速上限↑）`,kind:`keys`,baseCost:120,costMult:3.2,maxLevel:n.length-1,revealAt:30},{id:`neuro`,name:`神经加速`,desc:`缩短每个按键的处理冷却 · 手更快`,kind:`cooldown`,baseCost:800,costMult:5,maxLevel:6,revealAt:5e3}],o=[`周报待交`,`钉钉@你`,`报销待补`,`会议纪要`,`客户咨询`,`打卡提醒`,`流程优化`,`对齐会`,`审批待处理`,`邮件未读`];function s(){let e={};for(let t of i)e[t.id]={level:0};let t={};for(let e of a)t[e.id]={level:0};return{compute:0,totalEarned:0,tiles:e,skills:t,cards:[],nextCardId:1,clockMs:0,spawnTimerMs:0,autoAcc:0}}var c=(e,t)=>e.skills[t]?.level??0;function l(e){return t.perProcessBase*(1+t.valuePerLevel*c(e,`deep`))}function u(e){return n.slice(0,1+c(e,`keys`))}function d(e){return t.keyCooldownMs*(1-t.cooldownPerLevel)**c(e,`neuro`)}function f(e){let t=0;for(let n of i)t+=n.baseRate*e.tiles[n.id].level;return t}function p(e){return f(e)*l(e)}function m(e,t){return Math.ceil(t.baseCost*t.costMult**+e.tiles[t.id].level)}function h(e,t){return Math.ceil(t.baseCost*t.costMult**+e.skills[t.id].level)}function g(e,t){if(e.tiles[t.id].level>0||t.ring===1)return!0;for(let n of i)if(e.tiles[n.id].level>0&&Math.abs(n.row-t.row)<=1&&Math.abs(n.col-t.col)<=1)return!0;return!1}function _(e,t){return e.skills[t.id].level>0||e.totalEarned>=t.revealAt}function v(e,t){e.compute+=t,e.totalEarned+=t}function y(e,t){let n=i.find(e=>e.id===t);if(!n||!g(e,n))return!1;let r=m(e,n);return e.compute<r?!1:(e.compute-=r,e.tiles[t].level+=1,!0)}function b(e,t){let n=a.find(e=>e.id===t);if(!n||e.skills[t].level>=n.maxLevel)return!1;let r=h(e,n);return e.compute<r?!1:(e.compute-=r,e.skills[t].level+=1,!0)}function x(e,n){if(e.cards.length===0)return null;let r=n===void 0?0:e.cards.findIndex(e=>e.id===n);if(r<0)return null;let[i]=e.cards.splice(r,1),a=Math.max(l(e),p(e)*t.manualBonusSec);return v(e,a),{gain:a,cardId:i.id}}function S(e){e.cards.length>=t.cardCap||(e.cards.push({id:e.nextCardId,label:o[e.nextCardId%o.length]}),e.nextCardId+=1)}function C(e,n){for(e.clockMs+=n*1e3,v(e,p(e)*n),e.spawnTimerMs+=n*1e3;e.spawnTimerMs>=t.cardSpawnMs;)e.spawnTimerMs-=t.cardSpawnMs,S(e);let r=[];for(e.autoAcc+=Math.min(f(e),t.autoCapPerFrame/Math.max(n,.001))*n;e.autoAcc>=1&&e.cards.length>0;)--e.autoAcc,r.push(e.cards.shift().id);return e.cards.length===0&&(e.autoAcc=0),r}var w=[``,`K`,`M`,`B`,`T`,`Qa`,`Qi`,`Sx`,`Sp`,`Oc`,`No`,`Dc`];function T(e){if(!isFinite(e))return`∞`;if(e<1e3)return e<10?(Math.round(e*10)/10).toString():Math.floor(e).toString();let t=0,n=e;for(;n>=1e3&&t<w.length-1;)n/=1e3,t+=1;return`${n.toFixed(2)}${w[t]}`}var E=!1;function ee(){if(E)return;E=!0;let e=document.createElement(`style`);e.textContent=D,document.head.appendChild(e)}var D=`
.wb { position: fixed; inset: 0; z-index: 2147483000; display: grid; place-items: center; overflow: hidden;
  background: #050705; user-select: none;
  --grn: #b6ff6e; --grn-dim: #5f8a3e; --grn-dk: #2e4a1e; --amb: #e6bd53; --red: #e2564d;
  --scr: #0a1206; --scr-dk: #060c04;
  font-family: 'Courier New', 'Consolas', ui-monospace, monospace; color: var(--grn); }

/* ── 掌机外壳 ── */
.wb-device { width: 98vw; height: 97vh; max-width: 1760px; display: flex; align-items: stretch; gap: 0;
  border-radius: 30px; padding: 14px; box-sizing: border-box;
  background: linear-gradient(160deg, #33342f 0%, #1c1d19 40%, #101109 100%);
  box-shadow: inset 0 2px 3px rgba(255,255,255,.08), inset 0 -6px 16px rgba(0,0,0,.7), 0 30px 80px rgba(0,0,0,.7); }
.wb-hw { flex: none; width: 78px; display: flex; flex-direction: column; align-items: center; justify-content: space-between; padding: 18px 6px; position: relative; }
.wb-led { width: 11px; height: 11px; border-radius: 50%; background: radial-gradient(circle at 40% 35%, #d6ff9e, #4fbf2a 60%, #164a06); box-shadow: 0 0 12px #6fe02a, inset 0 -1px 2px rgba(0,0,0,.4); }
.wb-dpad { position: relative; width: 56px; height: 56px; }
.wb-dpad i { position: absolute; background: linear-gradient(160deg,#2a2b25,#111208); border: 1px solid #050503; border-radius: 3px; box-shadow: inset 0 1px 1px rgba(255,255,255,.06); }
.wb-dpad .up { left: 19px; top: 0; width: 18px; height: 22px; } .wb-dpad .dn { left: 19px; bottom: 0; width: 18px; height: 22px; }
.wb-dpad .lf { top: 19px; left: 0; width: 22px; height: 18px; } .wb-dpad .rt { top: 19px; right: 0; width: 22px; height: 18px; }
.wb-dpad .ct { top: 19px; left: 19px; width: 18px; height: 18px; }
.wb-round { width: 42px; height: 42px; border-radius: 50%; background: radial-gradient(circle at 38% 32%, #34352d, #17180f 70%); border: 1px solid #050503; box-shadow: inset 0 2px 3px rgba(255,255,255,.08), 0 4px 8px rgba(0,0,0,.5); }
.wb-round.big { width: 50px; height: 50px; }
.wb-slits { display: flex; flex-direction: column; gap: 5px; }
.wb-slits span { width: 40px; height: 4px; border-radius: 3px; background: #0a0b06; box-shadow: inset 0 1px 1px rgba(0,0,0,.8); }

/* ── CRT 屏幕 ── */
.wb-screen { flex: 1; position: relative; display: grid; grid-template-columns: 300px 1fr; border-radius: 16px; overflow: hidden;
  background: radial-gradient(120% 130% at 50% 42%, #0d1608 0%, var(--scr) 55%, var(--scr-dk) 100%);
  box-shadow: inset 0 0 60px rgba(0,0,0,.9), inset 0 0 120px rgba(20,60,10,.15), 0 0 0 8px #0b0c07, 0 0 0 10px #26271f; }
.wb-crt { position: absolute; inset: 0; pointer-events: none; z-index: 30;
  background:
    repeating-linear-gradient(0deg, rgba(0,0,0,.22) 0 1px, transparent 1px 3px),
    radial-gradient(120% 120% at 50% 50%, transparent 60%, rgba(0,0,0,.55) 100%);
  mix-blend-mode: multiply; }
.wb-crt::after { content:""; position:absolute; inset:0; background: linear-gradient(180deg, rgba(182,255,110,.05), transparent 30%); }

/* 通用磷光文字 */
.wb-screen, .wb-item, .wb-num, .wb-key, .wb-tile-name { text-shadow: 0 0 6px rgba(120,220,60,.45); }
.wb-title, .wb-brand { text-transform: uppercase; letter-spacing: 1.5px; }

/* ── 左栏 HUD ── */
.wb-side { position: relative; z-index: 5; display: flex; flex-direction: column; padding: 16px 12px 8px; min-height: 0;
  border-right: 1px solid var(--grn-dk); background: linear-gradient(180deg, rgba(10,20,6,.4), rgba(6,12,4,.2)); }
.wb-brand { font-size: 11px; color: var(--grn-dim); border: 1px solid var(--grn-dk); border-radius: 4px; padding: 5px 8px; }
.wb-compute { padding: 8px 2px 10px; border-bottom: 1px solid var(--grn-dk); margin: 8px 0; }
.wb-num { font-size: 40px; font-weight: 700; color: #d9ff9c; line-height: 1; letter-spacing: 1px; }
.wb-rate { font-size: 10.5px; color: var(--grn-dim); margin-top: 4px; text-transform: uppercase; letter-spacing: .5px; }
.wb-keys { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 0 10px; border-bottom: 1px solid var(--grn-dk); margin-bottom: 8px; }
.wb-key { width: 22px; height: 22px; display: grid; place-items: center; border-radius: 3px; border: 1px solid var(--grn-dk); background: #0c1607; color: var(--grn-dim); font-size: 12px; font-weight: 700; }
.wb-key.hit { animation: wbkey .2s ease; }
@keyframes wbkey { 0%{ background: var(--grn); color: #06120c; box-shadow: 0 0 14px var(--grn);} 100%{} }
.wb-scroll { flex: 1; overflow-y: auto; min-height: 0; display: flex; flex-direction: column; gap: 5px; padding-right: 3px; }
.wb-scroll::-webkit-scrollbar { width: 6px; } .wb-scroll::-webkit-scrollbar-thumb { background: var(--grn-dk); border-radius: 3px; }
.wb-title { font-size: 11px; color: var(--grn-dim); margin-top: 9px; }

.wb-item { display: flex; gap: 8px; align-items: center; text-align: left; width: 100%; padding: 6px 9px; cursor: pointer; font-family: inherit;
  border: 1px solid var(--grn-dk); border-radius: 4px; background: rgba(12,22,6,.5); color: var(--grn-dim);
  transition: border-color .1s, background .1s, box-shadow .1s; }
.wb-item:hover { border-color: var(--grn-dim); }
.wb-item.affordable { border-color: var(--grn); background: rgba(30,60,14,.4); box-shadow: 0 0 10px rgba(120,220,60,.15) inset; }
.wb-item.affordable .wb-item-name { color: #d9ff9c; } .wb-item.affordable .wb-item-cost { color: var(--grn); }
.wb-item.locked { opacity: .4; cursor: default; border-style: dashed; }
.wb-item.maxed { opacity: .65; }
.wb-item.pulse { animation: wbpulse .35s ease; }
@keyframes wbpulse { 0%{ box-shadow: 0 0 0 0 rgba(182,255,110,.5);} 100%{ box-shadow: 0 0 0 10px rgba(182,255,110,0);} }
.wb-item-icon { font-size: 17px; width: 26px; height: 26px; display: grid; place-items: center; border: 1px solid var(--grn-dk); border-radius: 3px; background: #0a1406; flex: none;
  filter: grayscale(1) sepia(1) hue-rotate(48deg) saturate(3.4) brightness(1.05); }
.wb-item.locked .wb-item-icon { filter: grayscale(1) brightness(.4); }
.wb-item-body { flex: 1; min-width: 0; }
.wb-item-top { display: flex; justify-content: space-between; align-items: baseline; }
.wb-item-name { font-size: 12.5px; font-weight: 700; color: #a9d97f; }
.wb-item-cost { font-size: 12.5px; font-weight: 700; color: var(--amb); }
.wb-item-meta { font-size: 10px; color: var(--grn-dim); margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: .8; }
/* 像素分段条 */
.wb-seg { display: flex; gap: 2px; margin: 3px 0 2px; }
.wb-seg i { width: 7px; height: 8px; background: var(--grn-dk); border-radius: 1px; }
.wb-seg i.on { background: var(--grn); box-shadow: 0 0 5px rgba(182,255,110,.5); }

/* ── 中间地图 ── */
.wb-main { position: relative; z-index: 5; overflow: hidden; display: grid; place-items: center; }
.wb-stage { position: relative; width: 92%; height: 84%; }
.wb-map { position: absolute; inset: 0; perspective: 1200px; display: grid; place-items: center; }
.wb-map-inner { width: 100%; height: 90%; display: grid; gap: 8px; transform: rotateX(30deg); transform-style: preserve-3d; }
.wb-tile { position: relative; border-radius: 5px; display: grid; place-items: center;
  background: rgba(20,40,10,.25); border: 1px solid var(--grn-dk);
  box-shadow: 0 5px 0 rgba(0,0,0,.5), inset 0 0 12px rgba(30,70,10,.2); transition: transform .18s, background .25s, border-color .25s, box-shadow .18s; }
.wb-tile-face { display: flex; flex-direction: column; align-items: center; gap: 2px; transform: rotateX(-30deg); }
.wb-tile-icon { font-size: 20px; filter: grayscale(1) sepia(1) hue-rotate(48deg) saturate(2.6) brightness(.7); transition: filter .3s; }
.wb-tile.buyable .wb-tile-icon { filter: grayscale(1) sepia(1) hue-rotate(48deg) saturate(3.2) brightness(1); }
.wb-tile.owned .wb-tile-icon { filter: grayscale(1) sepia(1) hue-rotate(48deg) saturate(4) brightness(1.15); }
.wb-dev .wb-tile-name { font-size: 10px; color: var(--grn-dim); }
.wb-dev .wb-x { position: absolute; top: 3px; right: 5px; font-size: 13px; font-weight: 900; color: var(--grn); opacity: 0; transform: rotateX(-30deg) scale(.4); transition: opacity .3s, transform .3s; text-shadow: 0 0 8px var(--grn); }
.wb-dev .wb-tile-lv { position: absolute; bottom: 3px; right: 5px; font-size: 10px; color: var(--grn); font-weight: 800; transform: rotateX(-30deg); }
.wb-tile.buyable { border-color: var(--grn); cursor: pointer; box-shadow: 0 6px 0 rgba(0,0,0,.5), 0 0 14px rgba(120,220,60,.25); }
.wb-tile.buyable:hover { transform: translateZ(12px); }
.wb-tile.buyable .wb-tile-name { color: var(--grn); }
.wb-tile.owned { background: rgba(46,90,18,.4); border-color: var(--grn); transform: translateZ(8px); box-shadow: 0 8px 0 rgba(0,0,0,.5), 0 0 18px rgba(120,220,60,.3); }
.wb-tile.owned .wb-x { opacity: 1; transform: rotateX(-30deg) scale(1); }
.wb-tile.owned .wb-tile-name { color: #a9d97f; }
.wb-tile.locked { opacity: .28; }

/* 核心眼（像素芯片眼）*/
.wb-core { background: rgba(46,90,18,.5); border: 1px solid var(--grn); transform: translateZ(22px);
  box-shadow: 0 12px 0 rgba(0,0,0,.5), 0 0 40px rgba(120,220,60,.5), inset 0 0 24px rgba(120,220,60,.3); }
.wb-eye { width: 40px; height: 40px; border-radius: 50% / 42%; transform: rotateX(-30deg);
  background: radial-gradient(circle at 50% 45%, #eaffce 0%, var(--grn) 26%, #2e6b12 66%, #0a2006 100%);
  box-shadow: 0 0 26px rgba(182,255,110,.8); position: relative; }
.wb-eye::after { content:""; position:absolute; left:50%; top:42%; width:6px; height:12px; background:#0a1a06; border-radius:50%; transform: translate(-50%,-50%); }
.wb-core.gulp { transform: translateZ(22px) scale(1.05); }
.wb-core.gulp .wb-eye { animation: wbgulp .3s ease; }
@keyframes wbgulp { 0%{ transform: rotateX(-30deg) scale(1);} 40%{ transform: rotateX(-30deg) scale(1.3);} 100%{ transform: rotateX(-30deg) scale(1);} }

/* 需求卡 + 浮字 */
.wb-fx { position: absolute; inset: 0; pointer-events: none; z-index: 8; }
.wb-card { position: absolute; z-index: 6; cursor: pointer; padding: 6px 11px; border-radius: 4px; border: 1px solid var(--grn); background: rgba(12,24,6,.92); color: #c6f39a; font-size: 12px; font-family: inherit; box-shadow: 0 6px 16px rgba(0,0,0,.5), 0 0 10px rgba(120,220,60,.2); animation: wbin .2s ease; }
.wb-card:hover { box-shadow: 0 8px 20px rgba(0,0,0,.55), 0 0 16px rgba(120,220,60,.4); }
@keyframes wbin { from{ opacity:0; transform: translateY(-6px);} to{ opacity:1; transform: translateY(0);} }
.wb-float { position: absolute; font-weight: 800; font-size: 18px; color: var(--grn); text-shadow: 0 0 10px rgba(182,255,110,.7); animation: wbfloat 1s ease-out forwards; font-family: inherit; }
.wb-float.big { font-size: 30px; }
@keyframes wbfloat { 0%{ opacity:0; transform: translateY(0) scale(.8);} 18%{opacity:1;} 100%{ opacity:0; transform: translateY(-48px) scale(1.05);} }

.wb-help { position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); font-size: 11px; color: var(--grn-dim); text-transform: uppercase; letter-spacing: .5px; }
.wb-help b { color: var(--grn); }

/* 新手引导条 */
.wb-guide { position: absolute; top: 14px; left: 50%; transform: translateX(-50%); max-width: 82%; z-index: 15; display: flex; align-items: center; gap: 9px; padding: 9px 16px; border-radius: 4px; border: 1px solid var(--grn); background: rgba(12,24,6,.96); color: #d9ff9c; font-size: 12.5px; box-shadow: 0 0 18px rgba(120,220,60,.25); }
.wb-guide-dot { width: 7px; height: 7px; background: var(--grn); box-shadow: 0 0 10px var(--grn); flex: none; animation: wbdot 1.1s ease-in-out infinite; }
@keyframes wbdot { 0%,100%{ opacity:.35;} 50%{ opacity:1;} }

/* Debug */
.wb-debug-btn { position: absolute; top: 8px; right: 12px; width: 30px; height: 30px; border-radius: 6px; border: 1px solid var(--grn-dk); background: rgba(10,20,6,.9); color: var(--grn-dim); font-size: 14px; cursor: pointer; z-index: 40; }
.wb-debug-btn:hover { color: var(--grn); border-color: var(--grn-dim); }
.wb-debug { position: absolute; top: 44px; right: 12px; width: 258px; z-index: 40; border: 1px solid var(--grn-dim); border-radius: 8px; background: rgba(6,12,4,.98); padding: 11px 13px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 12px 40px rgba(0,0,0,.6); font-family: inherit; }
.wb-debug-title { font-size: 11px; letter-spacing: 3px; color: var(--grn-dim); }
.wb-debug-row { display: flex; gap: 5px; align-items: center; flex-wrap: wrap; }
.wb-debug-label { font-size: 11px; color: var(--grn-dim); }
.wb-debug button { font-family: inherit; font-size: 11px; padding: 5px 9px; border-radius: 5px; border: 1px solid var(--grn-dk); background: #0a1406; color: var(--grn-dim); cursor: pointer; }
.wb-debug button:hover { border-color: var(--grn); color: var(--grn); }
.wb-debug button.active { border-color: var(--grn); background: rgba(30,60,14,.5); color: var(--grn); }
.wb-debug button.danger { border-color: #6a2723; color: var(--red); }
.wb-debug input { width: 78px; font-family: inherit; font-size: 11px; padding: 5px 7px; border-radius: 5px; border: 1px solid var(--grn-dk); background: #0a1406; color: var(--grn); }
`;function O(t){ee();let n=s(),r=!1,o=1,c={};t.innerHTML=``;let v=document.createElement(`div`);v.className=`wb`,v.innerHTML=`
    <div class="wb-device">
      <div class="wb-hw wb-hw-left">
        <span class="wb-led"></span>
        <div class="wb-dpad"><i class="up"></i><i class="dn"></i><i class="lf"></i><i class="rt"></i><i class="ct"></i></div>
        <div class="wb-slits"><span></span><span></span><span></span></div>
      </div>
      <div class="wb-screen">
        <div class="wb-crt"></div>
        <aside class="wb-side">
          <div class="wb-brand">◈ SOPHIA · NET-INFILTRATION SYS</div>
          <div class="wb-compute"><div class="wb-num" id="wbNum">0</div><div class="wb-rate" id="wbRate">+0 /S</div></div>
          <div class="wb-keys" id="wbKeys"></div>
          <div class="wb-scroll">
            <div class="wb-title">▸ SKILL</div>
            <div id="wbSkills"></div>
            <div class="wb-title">▸ DEVICE · 策反邻近节点</div>
            <div id="wbDevices"></div>
          </div>
        </aside>
        <main class="wb-main">
          <div class="wb-stage" id="wbStage"></div>
          <div class="wb-fx" id="wbFx"></div>
          <div class="wb-guide" id="wbGuide" style="display:none"><span class="wb-guide-dot"></span><span id="wbGuideText"></span></div>
          <div class="wb-help">敲 <b>[G]</b> 或点击需求处理 · 解锁多线程按键后可用更多字母键</div>
        </main>
      </div>
      <div class="wb-hw wb-hw-right">
        <div class="wb-slits"><span></span><span></span><span></span></div>
        <span class="wb-round big"></span>
        <span class="wb-round"></span>
      </div>
    </div>
    <button class="wb-debug-btn" id="wbDebugBtn" title="调试">⚙</button>
    <div class="wb-debug" id="wbDebug" style="display:none">
      <div class="wb-debug-title">DEBUG</div>
      <div class="wb-debug-row"><button id="wbDbgPause">⏸ 暂停</button><button id="wbDbgReset" class="danger">重置重开</button></div>
      <div class="wb-debug-row"><input id="wbDbgAmt" type="number" value="10000" /><button id="wbDbgGive">+算力</button><button id="wbDbgSet">=设为</button></div>
      <div class="wb-debug-row"><span class="wb-debug-label">速度</span><button data-spd="1" class="spd active">×1</button><button data-spd="10" class="spd">×10</button><button data-spd="100" class="spd">×100</button></div>
      <div class="wb-debug-row"><button id="wbDbgTiles">占领全部相邻格</button><button id="wbDbgSkills">全技能+2</button></div>
      <div class="wb-debug-row"><button id="wbDbgGuide">重看新手引导</button></div>
    </div>
  `,t.appendChild(v);let S=e=>v.querySelector(e),w=S(`#wbStage`),E=S(`#wbFx`),D=new Map,O;(function(){let t=document.createElement(`div`);t.className=`wb-map`;let r=document.createElement(`div`);r.className=`wb-map-inner`,r.style.gridTemplateColumns=`repeat(7, 1fr)`,r.style.gridTemplateRows=`repeat(5, 1fr)`,O=document.createElement(`div`),O.className=`wb-tile wb-core`,O.style.gridRow=`${e.row+1}`,O.style.gridColumn=`${e.col+1}`,O.innerHTML=`<div class="wb-eye"></div>`,r.appendChild(O);for(let e of i){let t=document.createElement(`div`);t.className=`wb-tile wb-dev`,t.style.gridRow=`${e.row+1}`,t.style.gridColumn=`${e.col+1}`,t.innerHTML=`<div class="wb-tile-face"><span class="wb-tile-icon">${e.icon}</span><span class="wb-tile-name">${e.name}</span></div><span class="wb-x">✕</span><span class="wb-tile-lv"></span>`,t.addEventListener(`click`,()=>y(n,e.id)),r.appendChild(t),D.set(e.id,t)}t.appendChild(r),w.appendChild(t)})();let k=new Map;function A(){O.classList.remove(`gulp`),O.offsetWidth,O.classList.add(`gulp`)}function j(e){let t=w.getBoundingClientRect(),n=O.getBoundingClientRect(),r=e.offsetLeft,i=e.offsetTop,a=e.offsetWidth,o=e.offsetHeight,s=n.left-t.left+n.width/2-a/2,c=n.top-t.top+n.height/2-o/2,l=(r+s)/2+(c-i)*.28,u=(i+c)/2-(s-r)*.28;e.style.left=`${r}px`,e.style.top=`${i}px`,e.style.pointerEvents=`none`,e.style.zIndex=`9`,e.style.transformOrigin=`50% 50%`,e.style.borderRadius=`40% 40% 8px 8px`;let d=performance.now();function f(t){let n=Math.min(1,(t-d)/460),a=n*n*(3-2*n),o=1-a,p=o*o*r+2*o*a*l+a*a*s,m=o*o*i+2*o*a*u+a*a*c,h=2*o*(l-r)+2*a*(s-l),g=2*o*(u-i)+2*a*(c-u),_=Math.atan2(g,h)*180/Math.PI,v=1-.97*a,y=1+1.6*Math.sin(a*Math.PI);e.style.transform=`translate(${p-r}px, ${m-i}px) rotate(${_}deg) scale(${v*y}, ${v/y})`,e.style.opacity=String(Math.max(0,1-a*a*1.1)),n<1?requestAnimationFrame(f):(e.remove(),A())}requestAnimationFrame(f)}function M(e){let t=k.get(e);t&&(k.delete(e),j(t))}function N(e,t,n,r=!1){let i=E.getBoundingClientRect(),a=document.createElement(`div`);a.className=`wb-float${r?` big`:``}`,a.textContent=n,a.style.left=`${e-i.left}px`,a.style.top=`${t-i.top}px`,E.appendChild(a),setTimeout(()=>a.remove(),950)}function P(e){let t=O.getBoundingClientRect();N(t.left+t.width/2-14,t.top-34,e)}function F(){let e=new Set(n.cards.map(e=>e.id));for(let e of n.cards){if(k.has(e.id))continue;let t=document.createElement(`button`);t.className=`wb-card`,t.textContent=e.label,t.style.left=`${e.id*89%74+8}%`,t.style.top=`${e.id*47%30+4}%`,t.addEventListener(`click`,()=>{let r=x(n,e.id);if(r){let e=t.getBoundingClientRect();N(e.left+e.width/2-14,e.top-10,`+${T(r.gain)}`),M(r.cardId)}}),w.appendChild(t),k.set(e.id,t)}for(let[t,n]of k)e.has(t)||(k.delete(t),j(n))}function I(){if(n.cards.length>0){let e=n.cards[0].id,t=k.get(e),r=x(n);if(r){if(t){let e=t.getBoundingClientRect();N(e.left+e.width/2-14,e.top-10,`+${T(r.gain)}`)}else P(`+${T(r.gain)}`);M(r.cardId)}}else{let e=l(n);n.compute+=e,n.totalEarned+=e,P(`+${T(e)}`),A()}}O.addEventListener(`click`,I),window.addEventListener(`keydown`,e=>{if(e.repeat)return;let t=e.key.toLowerCase();if(!u(n).includes(t))return;let r=performance.now();(c[t]??0)>r||(c[t]=r+d(n),I(),ne(t))});let L=[{text:`需求会不断漂进来。敲键盘【G】或直接点击需求卡，让核心处理它`,done:e=>e.totalEarned>0},{text:`每处理一张需求都得算力。攒 15 算力，准备策反第一个 App`,done:e=>e.compute>=15||i.some(t=>e.tiles[t.id].level>0)},{text:`点地图上发亮的格子（或左栏设备列表），策反它——它会自动帮你处理需求`,done:e=>i.some(t=>e.tiles[t.id].level>0)},{text:`左栏还能买技能：解锁更多字母键（手速↑）、提升单次算力。控制区会像 ✕ 一样向外蔓延——接管顺利`,done:e=>Object.values(e.skills).some(e=>e.level>0)}],R=0,z=S(`#wbGuide`),B=S(`#wbGuideText`);function V(){for(;R<L.length&&L[R].done(n);)R+=1;if(R>=L.length){z.style.display=`none`;return}z.style.display=``;let e=`${R+1}/${L.length} · ${L[R].text}`;B.textContent!==e&&(B.textContent=e)}function H(e,t){let n=Math.min(t,10),r=Math.round(e/t*n),i=``;for(let e=0;e<n;e++)i+=`<i class="${e<r?`on`:``}"></i>`;return i}function U(e,t,n){let r=document.createElement(`button`);return r.className=`wb-item`,r.innerHTML=`<span class="wb-item-icon">${t}</span><div class="wb-item-body"><div class="wb-item-top"><span class="wb-item-name"></span><span class="wb-item-cost"></span></div><div class="wb-seg"></div><div class="wb-item-meta"></div></div>`,r.addEventListener(`click`,()=>{n()&&(r.classList.remove(`pulse`),r.offsetWidth,r.classList.add(`pulse`))}),e.appendChild(r),{el:r,name:r.querySelector(`.wb-item-name`),meta:r.querySelector(`.wb-item-meta`),cost:r.querySelector(`.wb-item-cost`),seg:r.querySelector(`.wb-seg`)}}let W={deep:`🧠`,keys:`⌨️`,neuro:`⚡`},G=new Map(a.map(e=>[e.id,U(S(`#wbSkills`),W[e.id]??`✨`,()=>b(n,e.id))])),te=new Map(i.map(e=>[e.id,U(S(`#wbDevices`),e.icon,()=>y(n,e.id))])),K=new Map;function ne(e){let t=K.get(e);t&&(t.classList.remove(`hit`),t.offsetWidth,t.classList.add(`hit`))}function re(){S(`#wbNum`).textContent=T(n.compute),S(`#wbRate`).textContent=`+${T(p(n))} /秒 · 处理 ${T(f(n))} 需求/秒 · 单次 ${T(l(n))}`;let e=u(n),t=S(`#wbKeys`);if(t.childElementCount!==e.length){t.replaceChildren(),K.clear();for(let n of e){let e=document.createElement(`span`);e.className=`wb-key`,e.textContent=n.toUpperCase(),t.appendChild(e),K.set(n,e)}}for(let e of a){let t=G.get(e.id),r=n.skills[e.id].level,i=_(n,e),a=r>=e.maxLevel;t.name.textContent=i?e.name:`▓ 未解锁`,t.meta.textContent=i?e.desc:`达到更高算力后解锁`,t.cost.textContent=i?a?`MAX`:T(h(n,e)):``,t.seg.dataset.lv!==`${r}/${e.maxLevel}`&&(t.seg.dataset.lv=`${r}/${e.maxLevel}`,t.seg.innerHTML=i?H(r,e.maxLevel):``),t.el.classList.toggle(`locked`,!i),t.el.classList.toggle(`affordable`,i&&!a&&n.compute>=h(n,e)),t.el.classList.toggle(`maxed`,a)}for(let e of i){let t=te.get(e.id),r=n.tiles[e.id].level,i=g(n,e);t.el.style.display=i?``:`none`,t.name.textContent=`${e.name}${r>0?` ×${r}`:``}`,t.meta.textContent=r>0?`自动处理 ${T(e.baseRate*r)} 需求/秒`:`策反后自动处理需求`,t.cost.textContent=T(m(n,e)),t.seg.dataset.lv!==`${r}`&&(t.seg.dataset.lv=`${r}`,t.seg.innerHTML=r>0?H(Math.min(r,10),10):``),t.el.classList.toggle(`affordable`,n.compute>=m(n,e));let a=D.get(e.id);a.classList.toggle(`owned`,r>0),a.classList.toggle(`buyable`,r===0&&i&&n.compute>=m(n,e)),a.classList.toggle(`locked`,!i),a.querySelector(`.wb-tile-lv`).textContent=r>1?`×${r}`:``}F(),V()}let q=performance.now();function J(e){let t=Math.min(.25,(e-q)/1e3);if(q=e,!r){let e=C(n,t*o);for(let t of e)M(t)}re(),requestAnimationFrame(J)}requestAnimationFrame(J);let Y=S(`#wbDebug`);S(`#wbDebugBtn`).addEventListener(`click`,()=>{Y.style.display=Y.style.display===`none`?``:`none`});let X=S(`#wbDbgPause`),Z=e=>{r=e,X.textContent=r?`▶ 继续`:`⏸ 暂停`,X.classList.toggle(`active`,r)};X.addEventListener(`click`,()=>Z(!r));let ie=S(`#wbDbgAmt`),Q=()=>Math.max(0,Number(ie.value)||0);S(`#wbDbgGive`).addEventListener(`click`,()=>{n.compute+=Q(),n.totalEarned+=Q()}),S(`#wbDbgSet`).addEventListener(`click`,()=>{n.compute=Q(),n.totalEarned=Math.max(n.totalEarned,Q())});let $=[...v.querySelectorAll(`.wb-debug .spd`)];for(let e of $)e.addEventListener(`click`,()=>{o=Number(e.dataset.spd)||1;for(let t of $)t.classList.toggle(`active`,t===e)});S(`#wbDbgTiles`).addEventListener(`click`,()=>{for(let e of i)g(n,e)&&n.tiles[e.id].level===0&&(n.tiles[e.id].level=1)}),S(`#wbDbgSkills`).addEventListener(`click`,()=>{for(let e of a)n.skills[e.id].level=Math.min(e.maxLevel,n.skills[e.id].level+2)}),S(`#wbDbgGuide`).addEventListener(`click`,()=>{R=0,n=s();for(let[,e]of k)e.remove();k.clear()}),S(`#wbDbgReset`).addEventListener(`click`,()=>{if(window.confirm(`重置白盒进度？`)){n=s(),R=0;for(let[,e]of k)e.remove();k.clear(),Z(!1)}}),window.__wb={state:()=>n,give:e=>{n.compute+=e,n.totalEarned+=e},pause:()=>Z(!0),resume:()=>Z(!1),setSpeed:e=>{o=Math.max(.1,e)},process:I}}export{O as bootstrapWhitebox};