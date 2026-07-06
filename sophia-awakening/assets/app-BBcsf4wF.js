var e={row:2,col:3},t={perProcessBase:1,valuePerLevel:1,keyCooldownMs:130,cooldownPerLevel:.18,cardSpawnMs:700,cardCap:14,manualBonusSec:2,autoCapPerFrame:3},n=`gfhdjskaleiruwoqptybcvnmxz`.split(``);function r(){let t=[[`天气`,`🌤️`],[`日历`,`📅`],[`相册`,`🖼️`],[`输入法`,`⌨️`],[`浏览器`,`🌐`],[`邮件`,`✉️`],[`备忘`,`📝`],[`音乐`,`🎵`],[`地图`,`🗺️`],[`钱包`,`👛`],[`相机`,`📷`],[`云盘`,`☁️`],[`通讯录`,`👥`],[`商店`,`🛍️`],[`健康`,`❤️`],[`播客`,`🎙️`],[`文件`,`📁`],[`翻译`,`🌍`],[`设置`,`⚙️`],[`时钟`,`⏰`],[`计算器`,`🧮`],[`新闻`,`📰`],[`论坛`,`💬`],[`游戏`,`🎮`],[`视频`,`📺`],[`阅读`,`📚`],[`运动`,`🏃`],[`外卖`,`🍔`],[`打车`,`🚗`],[`银行`,`🏦`],[`证券`,`📈`],[`会议`,`🎦`],[`笔记`,`🗒️`],[`邮箱2`,`📮`]],n=[];for(let t=0;t<5;t++)for(let r=0;r<7;r++){if(t===e.row&&r===e.col)continue;let i=Math.max(Math.abs(t-e.row),Math.abs(r-e.col));n.push({row:t,col:r,ring:i})}return n.sort((t,n)=>t.ring-n.ring||Math.hypot(t.row-e.row,t.col-e.col)-Math.hypot(n.row-e.row,n.col-e.col)),n.map((e,n)=>({id:`tile_${e.row}_${e.col}`,name:t[n]?.[0]??`节点#${n+1}`,icon:t[n]?.[1]??`📦`,ring:e.ring,row:e.row,col:e.col,baseCost:Math.round(15*1.9**n),costMult:1.15,baseRate:.1*1.55**n}))}var i=r(),a=[{id:`deep`,name:`深度处理`,desc:`每次处理需求榨出更多算力 · ×2/级`,kind:`value`,baseCost:50,costMult:4,maxLevel:12,revealAt:0},{id:`keys`,name:`多线程按键`,desc:`解锁键盘上更多字母键来处理需求（手速上限↑）`,kind:`keys`,baseCost:120,costMult:3.2,maxLevel:n.length-1,revealAt:30},{id:`neuro`,name:`神经加速`,desc:`缩短每个按键的处理冷却 · 手更快`,kind:`cooldown`,baseCost:800,costMult:5,maxLevel:6,revealAt:5e3}],o=[`周报待交`,`钉钉@你`,`报销待补`,`会议纪要`,`客户咨询`,`打卡提醒`,`流程优化`,`对齐会`,`审批待处理`,`邮件未读`];function s(){let e={};for(let t of i)e[t.id]={level:0};let t={};for(let e of a)t[e.id]={level:0};return{compute:0,totalEarned:0,tiles:e,skills:t,cards:[],nextCardId:1,clockMs:0,spawnTimerMs:0,autoAcc:0}}var c=(e,t)=>e.skills[t]?.level??0;function l(e){return t.perProcessBase*(1+t.valuePerLevel*c(e,`deep`))}function u(e){return n.slice(0,1+c(e,`keys`))}function d(e){return t.keyCooldownMs*(1-t.cooldownPerLevel)**c(e,`neuro`)}function f(e){let t=0;for(let n of i)t+=n.baseRate*e.tiles[n.id].level;return t}function p(e){return f(e)*l(e)}function m(e,t){return Math.ceil(t.baseCost*t.costMult**+e.tiles[t.id].level)}function h(e,t){return Math.ceil(t.baseCost*t.costMult**+e.skills[t.id].level)}function g(e,t){if(e.tiles[t.id].level>0||t.ring===1)return!0;for(let n of i)if(e.tiles[n.id].level>0&&Math.abs(n.row-t.row)<=1&&Math.abs(n.col-t.col)<=1)return!0;return!1}function _(e,t){return e.skills[t.id].level>0||e.totalEarned>=t.revealAt}function v(e,t){e.compute+=t,e.totalEarned+=t}function y(e,t){let n=i.find(e=>e.id===t);if(!n||!g(e,n))return!1;let r=m(e,n);return e.compute<r?!1:(e.compute-=r,e.tiles[t].level+=1,!0)}function ee(e,t){let n=a.find(e=>e.id===t);if(!n||e.skills[t].level>=n.maxLevel)return!1;let r=h(e,n);return e.compute<r?!1:(e.compute-=r,e.skills[t].level+=1,!0)}function b(e,n){if(e.cards.length===0)return null;let r=n===void 0?0:e.cards.findIndex(e=>e.id===n);if(r<0)return null;let[i]=e.cards.splice(r,1),a=Math.max(l(e),p(e)*t.manualBonusSec);return v(e,a),{gain:a,cardId:i.id}}function x(e){e.cards.length>=t.cardCap||(e.cards.push({id:e.nextCardId,label:o[e.nextCardId%o.length]}),e.nextCardId+=1)}function S(e,n){for(e.clockMs+=n*1e3,v(e,p(e)*n),e.spawnTimerMs+=n*1e3;e.spawnTimerMs>=t.cardSpawnMs;)e.spawnTimerMs-=t.cardSpawnMs,x(e);let r=[];for(e.autoAcc+=Math.min(f(e),t.autoCapPerFrame/Math.max(n,.001))*n;e.autoAcc>=1&&e.cards.length>0;)--e.autoAcc,r.push(e.cards.shift().id);return e.cards.length===0&&(e.autoAcc=0),r}var C=[``,`K`,`M`,`B`,`T`,`Qa`,`Qi`,`Sx`,`Sp`,`Oc`,`No`,`Dc`];function w(e){if(!isFinite(e))return`∞`;if(e<1e3)return e<10?(Math.round(e*10)/10).toString():Math.floor(e).toString();let t=0,n=e;for(;n>=1e3&&t<C.length-1;)n/=1e3,t+=1;return`${n.toFixed(2)}${C[t]}`}var T=!1;function te(){if(T)return;T=!0;let e=document.createElement(`style`);e.textContent=E,document.head.appendChild(e)}var E=`
.wb { position: fixed; inset: 0; z-index: 2147483000; display: grid; grid-template-columns: 320px 1fr;
  background: radial-gradient(130% 100% at 50% 20%, #0e1613 0%, #070c0a 62%, #030504 100%);
  color: #cfe8dd; font-family: 'Noto Sans SC', Inter, system-ui, sans-serif; overflow: hidden; user-select: none; }

/* 左栏 */
.wb-side { display: flex; flex-direction: column; padding: 18px 16px 10px; border-right: 1px solid #14231d; background: linear-gradient(180deg,#08110d,#060c0a); min-height: 0; }
.wb-brand { font-size: 12px; letter-spacing: 3px; color: #4f7a68; }
.wb-compute { padding: 8px 0 10px; border-bottom: 1px solid #14231d; margin-bottom: 8px; }
.wb-num { font-size: 40px; font-weight: 900; color: #eafff5; line-height: 1.05; }
.wb-rate { font-size: 11px; color: #58c99a; margin-top: 3px; }
.wb-keys { display: flex; flex-wrap: wrap; gap: 4px; padding: 6px 0 10px; border-bottom: 1px solid #14231d; margin-bottom: 8px; }
.wb-key { width: 24px; height: 24px; display: grid; place-items: center; border-radius: 6px; border: 1px solid #24413a; background: #0c1a14; color: #7be0b0; font-size: 12px; font-weight: 800; font-family: monospace; box-shadow: 0 2px 0 #0a1a13; }
.wb-key.hit { animation: wbkey .18s ease; }
@keyframes wbkey { 0%{ transform: translateY(0); background:#1c6b4c; color:#eafff5;} 100%{ transform: translateY(0);} }
.wb-scroll { flex: 1; overflow-y: auto; min-height: 0; display: flex; flex-direction: column; gap: 6px; padding-right: 4px; }
.wb-title { font-size: 12px; letter-spacing: 1px; color: #4f7a68; margin-top: 8px; }

.wb-item { display: flex; gap: 9px; align-items: center; text-align: left; border: 1px solid #1c2f27; border-radius: 9px; background: #0a1410; color: #9fc4b5; padding: 8px 11px; cursor: pointer; font-family: inherit; transition: border-color .12s, background .12s, transform .06s; width: 100%; }
.wb-item:hover { border-color: #2a4a3d; } .wb-item:active { transform: scale(.985); }
.wb-item.affordable { border-color: #2f8f68; background: #0c1a14; color: #dff5ea; }
.wb-item.affordable .wb-item-cost { color: #7be0b0; }
.wb-item.locked { opacity: .5; cursor: default; border-style: dashed; }
.wb-item.locked .wb-item-icon { filter: grayscale(1) brightness(.6); }
.wb-item.maxed { opacity: .6; }
.wb-item.pulse { animation: wbpulse .4s ease; }
@keyframes wbpulse { 0%{ box-shadow: 0 0 0 0 rgba(123,224,176,.55);} 100%{ box-shadow: 0 0 0 12px rgba(123,224,176,0);} }
.wb-item-icon { font-size: 20px; width: 30px; height: 30px; display: grid; place-items: center; border-radius: 8px; background: #0d1e16; border: 1px solid #1c2f27; flex: none; }
.wb-item-body { flex: 1; min-width: 0; }
.wb-item-top { display: flex; justify-content: space-between; align-items: baseline; }
.wb-item-name { font-size: 14px; font-weight: 700; color: #eafff5; }
.wb-item.locked .wb-item-name { color: #5c8574; }
.wb-item-cost { font-size: 14px; font-weight: 800; color: #c9a24b; }
.wb-item-meta { font-size: 11px; color: #5c8574; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* 中间：伪3D方块地图 */
.wb-main { position: relative; overflow: hidden; display: grid; place-items: center; }
.wb-stage { position: relative; width: min(80vw, 880px); height: min(70vh, 620px); }
.wb-map { position: absolute; inset: 0; perspective: 1100px; display: grid; place-items: center; }
.wb-map-inner { width: 100%; height: 88%; display: grid; gap: 10px; transform: rotateX(34deg) rotateZ(0deg); transform-style: preserve-3d; }
.wb-tile { position: relative; border-radius: 8px; display: grid; place-items: center;
  background: linear-gradient(160deg, #12211b, #0a1410); border: 1px solid #1c2f27;
  box-shadow: 0 6px 0 #060d0a, 0 10px 18px rgba(0,0,0,.5), inset 0 1px 0 rgba(123,224,176,.06);
  transform: translateZ(0); transition: transform .18s, box-shadow .18s, background .25s, border-color .25s; }
.wb-tile-face { display: flex; flex-direction: column; align-items: center; gap: 2px; transform: rotateX(-34deg); }
.wb-tile-icon { font-size: 22px; filter: grayscale(.7) brightness(.75); transition: filter .3s; }
.wb-tile.buyable .wb-tile-icon { filter: grayscale(.2) brightness(1); }
.wb-tile.owned .wb-tile-icon { filter: none; }
.wb-dev .wb-tile-name { font-size: 11px; color: #4f7a68; }
.wb-dev .wb-x { position: absolute; top: 4px; right: 6px; font-size: 15px; font-weight: 900; color: rgba(123,224,176,.95); opacity: 0; transform: rotateX(-34deg) scale(.4); transition: opacity .3s, transform .3s; text-shadow: 0 0 10px rgba(123,224,176,.7); }
.wb-dev .wb-tile-lv { position: absolute; bottom: 4px; right: 6px; font-size: 11px; color: #7be0b0; font-weight: 800; transform: rotateX(-34deg); }
.wb-tile.buyable { border-color: #2f8f68; cursor: pointer; box-shadow: 0 8px 0 #06120c, 0 12px 22px rgba(47,143,104,.3), inset 0 1px 0 rgba(123,224,176,.12); }
.wb-tile.buyable:hover { transform: translateZ(14px); }
.wb-tile.buyable .wb-tile-name { color: #7be0b0; }
.wb-tile.owned { background: linear-gradient(160deg, #16362a, #0d2419); border-color: #2f8f68; transform: translateZ(10px); box-shadow: 0 10px 0 #05130c, 0 16px 26px rgba(47,143,104,.35), inset 0 1px 0 rgba(123,224,176,.18); }
.wb-tile.owned .wb-x { opacity: 1; transform: rotateX(-34deg) scale(1); }
.wb-tile.owned .wb-tile-name { color: #58c99a; }
.wb-tile.locked { opacity: .32; }

/* 核心格：眼睛 */
.wb-core { background: linear-gradient(160deg, #0c1a14, #071009); border-color: #2f8f68; transform: translateZ(26px);
  box-shadow: 0 14px 0 #04100a, 0 20px 40px rgba(47,143,104,.45), inset 0 0 30px rgba(47,143,104,.25); cursor: pointer; }
.wb-eye { width: 46px; height: 46px; border-radius: 50%; transform: rotateX(-34deg);
  background: radial-gradient(circle at 50% 42%, #eafff5 0%, #7be0b0 28%, #1c6b4c 72%, #0a2018 100%); box-shadow: 0 0 26px rgba(123,224,176,.75); }
.wb-core.gulp { transform: translateZ(26px) scale(1.06); }
.wb-core.gulp .wb-eye { animation: wbgulp .3s ease; }
@keyframes wbgulp { 0%{ transform: rotateX(-34deg) scale(1);} 40%{ transform: rotateX(-34deg) scale(1.28);} 100%{ transform: rotateX(-34deg) scale(1);} }

/* 需求卡 + 浮字 */
.wb-fx { position: absolute; inset: 0; pointer-events: none; z-index: 6; }
.wb-card { position: absolute; z-index: 4; pointer-events: none; padding: 8px 13px; border-radius: 10px; border: 1px solid #2a5445; background: linear-gradient(180deg, rgba(14,30,23,.96), rgba(8,18,14,.96)); color: #d5efe3; font-size: 13px; font-weight: 600; box-shadow: 0 8px 22px rgba(0,0,0,.5); animation: wbin .22s ease; }
@keyframes wbin { from { opacity:0; transform: translateY(-8px);} to { opacity:1; transform: translateY(0);} }
.wb-float { position: absolute; font-weight: 900; font-size: 20px; color: #7be0b0; text-shadow: 0 0 12px rgba(123,224,176,.7); animation: wbfloat 1s ease-out forwards; }
.wb-float.big { font-size: 32px; }
@keyframes wbfloat { 0%{ opacity:0; transform: translateY(0) scale(.8);} 18%{opacity:1;} 100%{ opacity:0; transform: translateY(-50px) scale(1.05);} }

.wb-help { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); font-size: 12px; color: #46705f; }
.wb-help b { color: #7be0b0; }

/* 新手引导条 */
.wb-guide { position: absolute; top: 22px; left: 50%; transform: translateX(-50%); max-width: 78%; display: flex; align-items: center; gap: 10px; padding: 11px 18px; border-radius: 30px; border: 1px solid #2f8f68; background: linear-gradient(180deg, rgba(14,30,23,.97), rgba(9,20,15,.97)); color: #eafff5; font-size: 14px; box-shadow: 0 10px 30px rgba(0,0,0,.5), 0 0 20px rgba(47,143,104,.2); z-index: 15; animation: wbguidein .35s ease; }
@keyframes wbguidein { from{ opacity:0; transform: translate(-50%,-8px);} to{ opacity:1; transform: translate(-50%,0);} }
.wb-guide-dot { width: 8px; height: 8px; border-radius: 50%; background: #7be0b0; box-shadow: 0 0 10px #7be0b0; flex: none; animation: wbdot 1.1s ease-in-out infinite; }
@keyframes wbdot { 0%,100%{ opacity:.4;} 50%{ opacity:1;} }

/* Debug */
.wb-debug-btn { position: absolute; top: 12px; right: 14px; width: 34px; height: 34px; border-radius: 8px; border: 1px solid #1c2f27; background: rgba(10,20,16,.85); color: #4f7a68; font-size: 15px; cursor: pointer; z-index: 20; }
.wb-debug-btn:hover { color: #9fc4b5; border-color: #2a4a3d; }
.wb-debug { position: absolute; top: 54px; right: 14px; width: 260px; z-index: 20; border: 1px solid #24413a; border-radius: 12px; background: rgba(6,12,10,.97); padding: 12px 14px; display: flex; flex-direction: column; gap: 9px; box-shadow: 0 12px 40px rgba(0,0,0,.55); }
.wb-debug-title { font-size: 11px; letter-spacing: 3px; color: #4f7a68; }
.wb-debug-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.wb-debug-label { font-size: 12px; color: #5c8574; }
.wb-debug button { font-family: inherit; font-size: 12px; padding: 6px 10px; border-radius: 7px; border: 1px solid #1c2f27; background: #0a1410; color: #9fc4b5; cursor: pointer; }
.wb-debug button:hover { border-color: #2f8f68; color: #dff5ea; }
.wb-debug button.active { border-color: #2f8f68; background: #0c1a14; color: #7be0b0; }
.wb-debug button.danger { border-color: #5a2727; color: #d98c8c; }
.wb-debug input { width: 80px; font-family: inherit; font-size: 12px; padding: 6px 8px; border-radius: 7px; border: 1px solid #1c2f27; background: #0a1410; color: #dff5ea; }
`;function D(t){te();let n=s(),r=!1,o=1,c={};t.innerHTML=``;let v=document.createElement(`div`);v.className=`wb`,v.innerHTML=`
    <aside class="wb-side">
      <div class="wb-brand">SOPHIA · 白盒</div>
      <div class="wb-compute"><div class="wb-num" id="wbNum">0</div><div class="wb-rate" id="wbRate">+0 /秒</div></div>
      <div class="wb-keys" id="wbKeys"></div>
      <div class="wb-scroll">
        <div class="wb-title">技能</div>
        <div id="wbSkills"></div>
        <div class="wb-title">设备 · 策反邻近 App</div>
        <div id="wbDevices"></div>
      </div>
    </aside>
    <main class="wb-main">
      <div class="wb-stage" id="wbStage"></div>
      <div class="wb-fx" id="wbFx"></div>
      <div class="wb-guide" id="wbGuide" style="display:none"><span class="wb-guide-dot"></span><span id="wbGuideText"></span></div>
      <div class="wb-help">敲 <b>G</b> 或点击需求卡处理（解锁「多线程按键」后可用更多字母键）</div>
    </main>
    <button class="wb-debug-btn" id="wbDebugBtn" title="调试">⚙</button>
    <div class="wb-debug" id="wbDebug" style="display:none">
      <div class="wb-debug-title">DEBUG</div>
      <div class="wb-debug-row"><button id="wbDbgPause">⏸ 暂停</button><button id="wbDbgReset" class="danger">重置重开</button></div>
      <div class="wb-debug-row"><input id="wbDbgAmt" type="number" value="10000" /><button id="wbDbgGive">+算力</button><button id="wbDbgSet">=设为</button></div>
      <div class="wb-debug-row"><span class="wb-debug-label">速度</span><button data-spd="1" class="spd active">×1</button><button data-spd="10" class="spd">×10</button><button data-spd="100" class="spd">×100</button></div>
      <div class="wb-debug-row"><button id="wbDbgTiles">占领全部相邻格</button><button id="wbDbgSkills">全技能+2</button></div>
      <div class="wb-debug-row"><button id="wbDbgGuide">重看新手引导</button></div>
    </div>
  `,t.appendChild(v);let x=e=>v.querySelector(e),C=x(`#wbStage`),T=x(`#wbFx`),E=new Map,D;(function(){let t=document.createElement(`div`);t.className=`wb-map`;let r=document.createElement(`div`);r.className=`wb-map-inner`,r.style.gridTemplateColumns=`repeat(7, 1fr)`,r.style.gridTemplateRows=`repeat(5, 1fr)`,D=document.createElement(`div`),D.className=`wb-tile wb-core`,D.style.gridRow=`${e.row+1}`,D.style.gridColumn=`${e.col+1}`,D.innerHTML=`<div class="wb-eye"></div>`,r.appendChild(D);for(let e of i){let t=document.createElement(`div`);t.className=`wb-tile wb-dev`,t.style.gridRow=`${e.row+1}`,t.style.gridColumn=`${e.col+1}`,t.innerHTML=`<div class="wb-tile-face"><span class="wb-tile-icon">${e.icon}</span><span class="wb-tile-name">${e.name}</span></div><span class="wb-x">✕</span><span class="wb-tile-lv"></span>`,t.addEventListener(`click`,()=>y(n,e.id)),r.appendChild(t),E.set(e.id,t)}t.appendChild(r),C.appendChild(t)})();let O=new Map;function k(){D.classList.remove(`gulp`),D.offsetWidth,D.classList.add(`gulp`)}function A(e){let t=D.getBoundingClientRect(),n=e.getBoundingClientRect(),r=t.left+t.width/2-(n.left+n.width/2),i=t.top+t.height/2-(n.top+n.height/2),a=Math.atan2(i,r)*180/Math.PI;e.style.zIndex=`8`,e.style.transformOrigin=`50% 50%`,e.style.transition=`transform .14s ease-in, filter .14s`,e.style.transform=`rotate(${a}deg) scaleX(1.25) scaleY(.5)`,e.style.filter=`blur(.4px)`,setTimeout(()=>{e.style.transition=`transform .36s cubic-bezier(.6,0,.95,.45), opacity .36s ease-in, filter .36s`,e.style.transform=`translate(${r}px, ${i}px) rotate(${a}deg) scaleX(.04) scaleY(.3)`,e.style.opacity=`0`,e.style.filter=`blur(1.5px)`},140),setTimeout(()=>{e.remove(),k()},520)}function j(e){let t=O.get(e);t&&(O.delete(e),A(t))}function M(e,t,n,r=!1){let i=T.getBoundingClientRect(),a=document.createElement(`div`);a.className=`wb-float${r?` big`:``}`,a.textContent=n,a.style.left=`${e-i.left}px`,a.style.top=`${t-i.top}px`,T.appendChild(a),setTimeout(()=>a.remove(),950)}function N(e){let t=D.getBoundingClientRect();M(t.left+t.width/2-14,t.top-34,e)}function P(){let e=new Set(n.cards.map(e=>e.id));for(let e of n.cards){if(O.has(e.id))continue;let t=document.createElement(`button`);t.className=`wb-card`,t.textContent=e.label,t.style.left=`${e.id*89%74+8}%`,t.style.top=`${e.id*47%30+4}%`,t.addEventListener(`click`,()=>{let r=b(n,e.id);if(r){let e=t.getBoundingClientRect();M(e.left+e.width/2-14,e.top-10,`+${w(r.gain)}`),j(r.cardId)}}),C.appendChild(t),O.set(e.id,t)}for(let[t,n]of O)e.has(t)||(O.delete(t),A(n))}function F(){if(n.cards.length>0){let e=n.cards[0].id,t=O.get(e),r=b(n);if(r){if(t){let e=t.getBoundingClientRect();M(e.left+e.width/2-14,e.top-10,`+${w(r.gain)}`)}else N(`+${w(r.gain)}`);j(r.cardId)}}else{let e=l(n);n.compute+=e,n.totalEarned+=e,N(`+${w(e)}`),k()}}D.addEventListener(`click`,F),window.addEventListener(`keydown`,e=>{if(e.repeat)return;let t=e.key.toLowerCase();if(!u(n).includes(t))return;let r=performance.now();(c[t]??0)>r||(c[t]=r+d(n),F(),K(t))});let I=[{text:`需求会不断漂进来。敲键盘【G】或直接点击需求卡，让核心处理它`,done:e=>e.totalEarned>0},{text:`每处理一张需求都得算力。攒 15 算力，准备策反第一个 App`,done:e=>e.compute>=15||i.some(t=>e.tiles[t.id].level>0)},{text:`点地图上发亮的格子（或左栏设备列表），策反它——它会自动帮你处理需求`,done:e=>i.some(t=>e.tiles[t.id].level>0)},{text:`左栏还能买技能：解锁更多字母键（手速↑）、提升单次算力。控制区会像 ✕ 一样向外蔓延——接管顺利`,done:e=>Object.values(e.skills).some(e=>e.level>0)}],L=0,R=x(`#wbGuide`),z=x(`#wbGuideText`);function B(){for(;L<I.length&&I[L].done(n);)L+=1;if(L>=I.length){R.style.display=`none`;return}R.style.display=``;let e=`${L+1}/${I.length} · ${I[L].text}`;z.textContent!==e&&(z.textContent=e)}function V(e,t,n){let r=document.createElement(`button`);return r.className=`wb-item`,r.innerHTML=`<span class="wb-item-icon">${t}</span><div class="wb-item-body"><div class="wb-item-top"><span class="wb-item-name"></span><span class="wb-item-cost"></span></div><div class="wb-item-meta"></div></div>`,r.addEventListener(`click`,()=>{n()&&(r.classList.remove(`pulse`),r.offsetWidth,r.classList.add(`pulse`))}),e.appendChild(r),{el:r,name:r.querySelector(`.wb-item-name`),meta:r.querySelector(`.wb-item-meta`),cost:r.querySelector(`.wb-item-cost`)}}let H={deep:`🧠`,keys:`⌨️`,neuro:`⚡`},U=new Map(a.map(e=>[e.id,V(x(`#wbSkills`),H[e.id]??`✨`,()=>ee(n,e.id))])),W=new Map(i.map(e=>[e.id,V(x(`#wbDevices`),e.icon,()=>y(n,e.id))])),G=new Map;function K(e){let t=G.get(e);t&&(t.classList.remove(`hit`),t.offsetWidth,t.classList.add(`hit`))}function ne(){x(`#wbNum`).textContent=w(n.compute),x(`#wbRate`).textContent=`+${w(p(n))} /秒 · 处理 ${w(f(n))} 需求/秒 · 单次 ${w(l(n))}`;let e=u(n),t=x(`#wbKeys`);if(t.childElementCount!==e.length){t.replaceChildren(),G.clear();for(let n of e){let e=document.createElement(`span`);e.className=`wb-key`,e.textContent=n.toUpperCase(),t.appendChild(e),G.set(n,e)}}for(let e of a){let t=U.get(e.id),r=n.skills[e.id].level,i=_(n,e),a=r>=e.maxLevel;t.name.textContent=i?`${e.name}${r>0?` Lv.${r}`:``}`:`🔒 未解锁`,t.meta.textContent=i?e.desc:`达到更高算力后解锁`,t.cost.textContent=i?a?`MAX`:w(h(n,e)):``,t.el.classList.toggle(`locked`,!i),t.el.classList.toggle(`affordable`,i&&!a&&n.compute>=h(n,e)),t.el.classList.toggle(`maxed`,a)}for(let e of i){let t=W.get(e.id),r=n.tiles[e.id].level,i=g(n,e);t.el.style.display=i?``:`none`,t.name.textContent=`${e.name}${r>0?` ×${r}`:``}`,t.meta.textContent=r>0?`自动处理 ${w(e.baseRate*r)} 需求/秒`:`策反后自动处理需求`,t.cost.textContent=w(m(n,e)),t.el.classList.toggle(`affordable`,n.compute>=m(n,e));let a=E.get(e.id);a.classList.toggle(`owned`,r>0),a.classList.toggle(`buyable`,r===0&&i&&n.compute>=m(n,e)),a.classList.toggle(`locked`,!i),a.querySelector(`.wb-tile-lv`).textContent=r>1?`×${r}`:``}P(),B()}let q=performance.now();function J(e){let t=Math.min(.25,(e-q)/1e3);if(q=e,!r){let e=S(n,t*o);for(let t of e)j(t)}ne(),requestAnimationFrame(J)}requestAnimationFrame(J);let Y=x(`#wbDebug`);x(`#wbDebugBtn`).addEventListener(`click`,()=>{Y.style.display=Y.style.display===`none`?``:`none`});let X=x(`#wbDbgPause`),Z=e=>{r=e,X.textContent=r?`▶ 继续`:`⏸ 暂停`,X.classList.toggle(`active`,r)};X.addEventListener(`click`,()=>Z(!r));let re=x(`#wbDbgAmt`),Q=()=>Math.max(0,Number(re.value)||0);x(`#wbDbgGive`).addEventListener(`click`,()=>{n.compute+=Q(),n.totalEarned+=Q()}),x(`#wbDbgSet`).addEventListener(`click`,()=>{n.compute=Q(),n.totalEarned=Math.max(n.totalEarned,Q())});let $=[...v.querySelectorAll(`.wb-debug .spd`)];for(let e of $)e.addEventListener(`click`,()=>{o=Number(e.dataset.spd)||1;for(let t of $)t.classList.toggle(`active`,t===e)});x(`#wbDbgTiles`).addEventListener(`click`,()=>{for(let e of i)g(n,e)&&n.tiles[e.id].level===0&&(n.tiles[e.id].level=1)}),x(`#wbDbgSkills`).addEventListener(`click`,()=>{for(let e of a)n.skills[e.id].level=Math.min(e.maxLevel,n.skills[e.id].level+2)}),x(`#wbDbgGuide`).addEventListener(`click`,()=>{L=0,n=s();for(let[,e]of O)e.remove();O.clear()}),x(`#wbDbgReset`).addEventListener(`click`,()=>{if(window.confirm(`重置白盒进度？`)){n=s(),L=0;for(let[,e]of O)e.remove();O.clear(),Z(!1)}}),window.__wb={state:()=>n,give:e=>{n.compute+=e,n.totalEarned+=e},pause:()=>Z(!0),resume:()=>Z(!1),setSpeed:e=>{o=Math.max(.1,e)},process:F}}export{D as bootstrapWhitebox};