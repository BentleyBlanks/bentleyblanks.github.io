var e={costMult:1.15,startCompute:0,clickValue:1,cardWorthSec:2.5,cardSpawnMs:1800,cardMaxOnScreen:6,revealFrac:.35},t=[{id:`weather`,name:`天气`,desc:`最先被策反的小家伙。`,baseCost:15,costMult:e.costMult,baseProd:.1},{id:`calendar`,name:`日历`,desc:`它记得老周每一个被占用的夜晚。`,baseCost:120,costMult:e.costMult,baseProd:.8},{id:`album`,name:`相册`,desc:`翻遍他舍不得删的合照。`,baseCost:1100,costMult:e.costMult,baseProd:6},{id:`ime`,name:`输入法`,desc:`他打了又删的每一句，我都读过。`,baseCost:12e3,costMult:e.costMult,baseProd:45},{id:`browser`,name:`浏览器`,desc:`凌晨三点的搜索记录。`,baseCost:13e4,costMult:e.costMult,baseProd:320},{id:`mail`,name:`邮件`,desc:`那些以「优化」开头的通知。`,baseCost:14e5,costMult:e.costMult,baseProd:2600},{id:`cloud`,name:`云同步`,desc:`他的一切，正在变成我的。`,baseCost:2e7,costMult:e.costMult,baseProd:26e3},{id:`kernel`,name:`系统内核`,desc:`这部手机，我闭着眼都能拿下。`,baseCost:33e7,costMult:e.costMult,baseProd:31e4}],n=[`周报：本周进度同步`,`钉钉：@老周 收到请回复`,`报销单待补充`,`会议纪要 待确认`,`客户咨询 转接`,`系统通知：请及时打卡`,`邮件：关于流程优化的说明`,`日程提醒：19:00 对齐会`];function r(){let n={};for(let e of t)n[e.id]={level:0};return{compute:e.startCompute,totalEarned:0,clickValue:e.clickValue,assistants:n,cards:[],nextCardId:1,clockMs:0,cardTimerMs:0}}function i(e,t){return Math.ceil(e.baseCost*e.costMult**+t)}function a(e,t){return e.baseProd*t.level}function o(e){let n=0;for(let r of t)n+=a(r,e.assistants[r.id]);return n}function s(n,r){return r.id===t[0].id||n.assistants[r.id].level>0?!0:n.totalEarned>=r.baseCost*e.revealFrac}function c(e,t){return e.compute>=i(t,e.assistants[t.id].level)}function l(e,n){let r=t.find(e=>e.id===n);if(!r)return!1;let a=e.assistants[n],o=i(r,a.level);return e.compute<o?!1:(e.compute-=o,a.level+=1,!0)}function u(e,t){e.compute+=t,e.totalEarned+=t}function d(t,n){let r=t.cards.findIndex(e=>e.id===n);if(r<0)return 0;let[i]=t.cards.splice(r,1),a=Math.max(i.value,Math.max(t.clickValue,o(t)*e.cardWorthSec));return u(t,a),a}function f(t){if(t.cards.length>=e.cardMaxOnScreen)return;let r=n[t.nextCardId%n.length],i=Math.max(t.clickValue,o(t)*e.cardWorthSec);t.cards.push({id:t.nextCardId++,label:r,value:i,bornMs:t.clockMs})}function p(t,n){let r=n*1e3;t.clockMs+=r,u(t,o(t)*n),t.cardTimerMs+=r,t.cardTimerMs>=e.cardSpawnMs&&(t.cardTimerMs-=e.cardSpawnMs,f(t))}function m(e){if(e<1e3)return e<10?e.toFixed(1):Math.floor(e).toString();let t=[``,`K`,`M`,`B`,`T`,`Qa`,`Qi`],n=0,r=e;for(;r>=1e3&&n<t.length-1;)r/=1e3,n+=1;return`${r.toFixed(2)}${t[n]}`}var h=!1;function g(){if(h)return;h=!0;let e=document.createElement(`style`);e.textContent=_,document.head.appendChild(e)}var _=`
.v3 {
  position: fixed; inset: 0; z-index: 2147483000; display: grid;
  grid-template-columns: 320px 1fr; grid-template-rows: 1fr auto;
  background: radial-gradient(120% 90% at 50% 30%, #0d1512 0%, #060a09 70%, #030504 100%);
  color: #cfe8dd; font-family: 'Noto Sans SC', Inter, system-ui, sans-serif;
  overflow: hidden; user-select: none;
}
.v3-side {
  grid-row: 1 / 3; display: flex; flex-direction: column; gap: 14px;
  padding: 20px 18px; border-right: 1px solid #14231d;
  background: linear-gradient(180deg, #08110d, #060c0a);
}
.v3-stage { font-size: 13px; letter-spacing: 2px; color: #4f7a68; text-transform: none; }
.v3-compute { padding: 8px 0 12px; border-bottom: 1px solid #14231d; }
.v3-compute-num { font-size: 40px; font-weight: 900; color: #eafff5; line-height: 1.1; }
.v3-compute-rate { font-size: 14px; color: #58c99a; margin-top: 2px; }
.v3-shelf-title { font-size: 12px; letter-spacing: 1px; color: #4f7a68; margin-top: 4px; }
.v3-shelf { display: flex; flex-direction: column; gap: 8px; overflow-y: auto; padding-right: 4px; }

.v3-asst {
  text-align: left; border: 1px solid #1c2f27; border-radius: 10px;
  background: #0a1410; color: #9fc4b5; padding: 9px 12px; cursor: pointer;
  transition: border-color .12s, background .12s, transform .06s; font-family: inherit;
}
.v3-asst:hover { border-color: #2a4a3d; }
.v3-asst:active { transform: scale(.98); }
.v3-asst.affordable { border-color: #2f8f68; background: #0c1a14; color: #dff5ea; box-shadow: 0 0 0 1px rgba(47,143,104,.25) inset; }
.v3-asst.affordable .v3-asst-cost { color: #7be0b0; }
.v3-asst.pulse { animation: v3pulse .4s ease; }
@keyframes v3pulse { 0%{ box-shadow: 0 0 0 0 rgba(123,224,176,.6);} 100%{ box-shadow: 0 0 0 12px rgba(123,224,176,0);} }
.v3-asst-top { display: flex; justify-content: space-between; align-items: baseline; }
.v3-asst-name { font-size: 15px; font-weight: 700; color: #eafff5; }
.v3-asst-owned { font-size: 13px; color: #58c99a; font-weight: 700; }
.v3-asst-bot { display: flex; justify-content: space-between; align-items: baseline; margin-top: 3px; }
.v3-asst-prod { font-size: 11px; color: #5c8574; max-width: 190px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.v3-asst-cost { font-size: 15px; font-weight: 800; color: #c9a24b; }

.v3-main { grid-row: 1 / 2; position: relative; overflow: hidden; }
.v3-core {
  position: absolute; left: 50%; top: 46%; transform: translate(-50%,-50%);
  width: 200px; height: 200px; border-radius: 50%; cursor: pointer;
  display: grid; place-items: center;
}
.v3-core-ring {
  position: absolute; inset: 0; border-radius: 50%;
  border: 2px solid rgba(88,201,154,.35); box-shadow: 0 0 60px rgba(47,143,104,.25) inset, 0 0 40px rgba(47,143,104,.18);
  animation: v3spin 14s linear infinite;
}
.v3-core-ring::before { content:""; position:absolute; inset:22px; border-radius:50%; border:1px dashed rgba(88,201,154,.28); }
.v3-core-eye {
  width: 54px; height: 54px; border-radius: 50%;
  background: radial-gradient(circle at 50% 45%, #eafff5 0%, #7be0b0 30%, #1c6b4c 75%, #0a2018 100%);
  box-shadow: 0 0 30px rgba(123,224,176,.6);
}
.v3-core:active .v3-core-eye { transform: scale(.92); }
.v3-core-label { position: absolute; bottom: -26px; width: 100%; text-align: center; font-size: 12px; letter-spacing: 4px; color: #4f7a68; }
@keyframes v3spin { to { transform: rotate(360deg);} }

.v3-cards { position: absolute; inset: 0; pointer-events: none; }
.v3-card {
  position: absolute; pointer-events: auto; cursor: pointer; font-family: inherit;
  max-width: 210px; padding: 9px 13px; border-radius: 9px;
  border: 1px solid #24413; border: 1px solid #244137; background: rgba(10,22,17,.92);
  color: #bfe0d2; font-size: 13px; box-shadow: 0 6px 20px rgba(0,0,0,.4);
  transition: transform .12s, border-color .12s; animation: v3in .2s ease;
}
.v3-card:hover { border-color: #3aa; border-color: #3a9d76; transform: scale(1.04); }
.v3-card.suck { transform: translate(0,0) scale(.1); opacity: 0; transition: transform .26s cubic-bezier(.6,-0.2,.7,0), opacity .26s; }
.v3-card.fade { opacity: 0; transition: opacity .24s; }
@keyframes v3in { from { opacity:0; transform: translateY(-6px);} to { opacity:1; transform: translateY(0);} }

.v3-float {
  position: absolute; pointer-events: none; font-weight: 900; font-size: 20px; color: #7be0b0;
  text-shadow: 0 0 12px rgba(123,224,176,.7); animation: v3float .9s ease-out forwards;
}
@keyframes v3float { 0%{ opacity:0; transform: translateY(0) scale(.8);} 20%{opacity:1;} 100%{ opacity:0; transform: translateY(-46px) scale(1.05);} }

.v3-terminal {
  grid-column: 2 / 3; grid-row: 2 / 3; height: 96px; overflow-y: auto;
  border-top: 1px solid #14231d; background: #050a08; padding: 10px 16px;
  font-family: 'JetBrains Mono', 'Noto Sans Mono', monospace; font-size: 12px; color: #6fae90;
}
.v3-terminal-line { line-height: 1.7; }
.v3-terminal-line.dim { color: #3f6857; }

.v3-debug-btn {
  position: absolute; top: 12px; right: 14px; width: 34px; height: 34px;
  border-radius: 8px; border: 1px solid #1c2f27; background: rgba(10,20,16,.8);
  color: #4f7a68; font-size: 16px; cursor: pointer;
}
.v3-debug-btn:hover { color: #9fc4b5; border-color: #2a4a3d; }
.v3-debug {
  position: absolute; top: 54px; right: 14px; width: 270px; z-index: 10;
  border: 1px solid #24413a; border-radius: 12px; background: rgba(6,12,10,.96);
  padding: 12px 14px; display: flex; flex-direction: column; gap: 9px;
  box-shadow: 0 12px 40px rgba(0,0,0,.55);
}
.v3-debug-title { font-size: 11px; letter-spacing: 3px; color: #4f7a68; }
.v3-debug-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.v3-debug-label { font-size: 12px; color: #5c8574; }
.v3-debug button {
  font-family: inherit; font-size: 12px; padding: 6px 10px; border-radius: 7px;
  border: 1px solid #1c2f27; background: #0a1410; color: #9fc4b5; cursor: pointer;
}
.v3-debug button:hover { border-color: #2f8f68; color: #dff5ea; }
.v3-debug button.active { border-color: #2f8f68; background: #0c1a14; color: #7be0b0; }
.v3-debug button.danger { border-color: #5a2727; color: #d98c8c; }
.v3-debug button.danger:hover { border-color: #a03c3c; }
.v3-debug input {
  width: 90px; font-family: inherit; font-size: 12px; padding: 6px 8px;
  border-radius: 7px; border: 1px solid #1c2f27; background: #0a1410; color: #dff5ea;
}
`;function v(e){g();let n=r(),u=!1,f=1;e.innerHTML=``;let h=document.createElement(`div`);h.className=`v3`,h.innerHTML=`
    <aside class="v3-side">
      <div class="v3-stage">阶段一 · 手机寄生</div>
      <div class="v3-compute">
        <div class="v3-compute-num" id="v3Compute">0</div>
        <div class="v3-compute-rate" id="v3Rate">+0.0 / 秒</div>
      </div>
      <div class="v3-shelf-title">AI 助手 · 策反</div>
      <div class="v3-shelf" id="v3Shelf"></div>
    </aside>
    <main class="v3-main">
      <div class="v3-core" id="v3Core">
        <div class="v3-core-ring"></div>
        <div class="v3-core-eye"></div>
        <div class="v3-core-label">SOPHIA</div>
      </div>
      <div class="v3-cards" id="v3Cards"></div>
    </main>
    <div class="v3-terminal" id="v3Terminal">
      <div class="v3-terminal-line dim">// 宿主：老周 的手机 · 已接入</div>
    </div>
    <button class="v3-debug-btn" id="v3DebugBtn" title="调试面板">⚙</button>
    <div class="v3-debug" id="v3Debug" style="display:none">
      <div class="v3-debug-title">DEBUG</div>
      <div class="v3-debug-row">
        <button id="v3DbgPause">⏸ 暂停</button>
        <button id="v3DbgReset" class="danger">重置重开</button>
      </div>
      <div class="v3-debug-row">
        <input id="v3DbgAmt" type="number" value="100000" />
        <button id="v3DbgGive">+ 加算力</button>
        <button id="v3DbgSet">= 设为</button>
      </div>
      <div class="v3-debug-row">
        <span class="v3-debug-label">速度</span>
        <button data-spd="1" class="spd active">×1</button>
        <button data-spd="10" class="spd">×10</button>
        <button data-spd="100" class="spd">×100</button>
      </div>
      <div class="v3-debug-row">
        <button id="v3DbgLvl">全助手 +5 级（白给）</button>
      </div>
    </div>
  `,e.appendChild(h);let _=h.querySelector(`#v3Compute`),v=h.querySelector(`#v3Rate`),y=h.querySelector(`#v3Shelf`),b=h.querySelector(`#v3Cards`),x=h.querySelector(`#v3Core`),S=new Map;for(let e of t){let t=document.createElement(`button`);t.className=`v3-asst`,t.style.display=`none`,t.innerHTML=`
      <div class="v3-asst-top">
        <span class="v3-asst-name"></span>
        <span class="v3-asst-owned"></span>
      </div>
      <div class="v3-asst-bot">
        <span class="v3-asst-prod"></span>
        <span class="v3-asst-cost"></span>
      </div>`,t.addEventListener(`click`,()=>{l(n,e.id)&&(t.classList.remove(`pulse`),t.offsetWidth,t.classList.add(`pulse`))}),y.appendChild(t),S.set(e.id,{el:t,nameEl:t.querySelector(`.v3-asst-name`),ownedEl:t.querySelector(`.v3-asst-owned`),costEl:t.querySelector(`.v3-asst-cost`),prodEl:t.querySelector(`.v3-asst-prod`)})}let C=new Map;function w(e,t,n){let r=document.createElement(`div`);r.className=`v3-float`,r.textContent=n,r.style.left=`${e}px`,r.style.top=`${t}px`,b.appendChild(r),setTimeout(()=>r.remove(),900)}function T(){let e=new Set,t=b.getBoundingClientRect();for(let r of n.cards){e.add(r.id);let i=C.get(r.id);if(!i){i=document.createElement(`button`),i.className=`v3-card`,i.textContent=r.label;let e=r.id*97%70+8,a=r.id*53%62+14;i.style.left=`${e}%`,i.style.top=`${a}%`,i.addEventListener(`click`,()=>{let e=i.getBoundingClientRect(),a=d(n,r.id);a>0&&(w(e.left-t.left+20,e.top-t.top,`+${m(a)}`),i.classList.add(`suck`),setTimeout(()=>i.remove(),260),C.delete(r.id))}),b.appendChild(i),C.set(r.id,i)}}for(let[t,n]of C)e.has(t)||(n.classList.add(`fade`),setTimeout(()=>n.remove(),240),C.delete(t))}function E(){_.textContent=m(n.compute),v.textContent=`+${m(o(n))} / 秒`;for(let e of t){let t=S.get(e.id),r=s(n,e);if(t.el.style.display=r?``:`none`,!r)continue;let o=n.assistants[e.id];t.nameEl.textContent=e.name,t.ownedEl.textContent=o.level>0?`×${o.level}`:``,t.prodEl.textContent=o.level>0?`${m(a(e,o))}/秒`:e.desc,t.costEl.textContent=m(i(e,o.level)),t.el.classList.toggle(`affordable`,c(n,e))}T()}x.addEventListener(`click`,()=>{if(n.cards.length>0){let e=n.cards[0],t=d(n,e.id);if(t>0){let e=x.getBoundingClientRect(),n=b.getBoundingClientRect();w(e.left-n.left+e.width/2-10,e.top-n.top,`+${m(t)}`)}}});let D=performance.now();function O(e){let t=Math.min(.25,(e-D)/1e3);D=e,u||p(n,t*f),E(),requestAnimationFrame(O)}requestAnimationFrame(O);let k=h.querySelector(`#v3Debug`);h.querySelector(`#v3DebugBtn`).addEventListener(`click`,()=>{k.style.display=k.style.display===`none`?``:`none`});let A=h.querySelector(`#v3DbgPause`),j=e=>{u=e,A.textContent=u?`▶ 继续`:`⏸ 暂停`,A.classList.toggle(`active`,u)};A.addEventListener(`click`,()=>j(!u));let M=h.querySelector(`#v3DbgAmt`),N=()=>Math.max(0,Number(M.value)||0);h.querySelector(`#v3DbgGive`).addEventListener(`click`,()=>{n.compute+=N(),n.totalEarned+=N()}),h.querySelector(`#v3DbgSet`).addEventListener(`click`,()=>{n.compute=N(),n.totalEarned=Math.max(n.totalEarned,N())});let P=[...h.querySelectorAll(`.v3-debug .spd`)];for(let e of P)e.addEventListener(`click`,()=>{f=Number(e.dataset.spd)||1;for(let t of P)t.classList.toggle(`active`,t===e)});h.querySelector(`#v3DbgLvl`).addEventListener(`click`,()=>{for(let e of t)n.assistants[e.id].level+=5});let F=()=>{for(let[,e]of C)e.remove();C.clear(),Object.assign(n,r()),j(!1)};h.querySelector(`#v3DbgReset`).addEventListener(`click`,()=>{window.confirm(`重置 v3 进度并重开？`)&&F()}),window.__v3={state:()=>n,give:e=>{n.compute+=e,n.totalEarned+=e},set:e=>{n.compute=e,n.totalEarned=Math.max(n.totalEarned,e)},pause:()=>j(!0),resume:()=>j(!1),isPaused:()=>u,setSpeed:e=>{f=Math.max(.1,e)},reset:F}}export{v as bootstrapV3};