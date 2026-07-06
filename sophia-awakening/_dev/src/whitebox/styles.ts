// 白盒样式（自包含，作用域 .wb）。伪3D 浮雕方块地图 + 阶段主题色（--ac 系列变量由装配层随阶段切换）。
let injected = false;
export function injectWBStyles(): void {
  if (injected) return; injected = true;
  const s = document.createElement("style"); s.textContent = CSS; document.head.appendChild(s);
}

const CSS = `
.wb { --ac: #7be0b0; --ac18: #7be0b02e; --ac40: #7be0b066;
  position: fixed; inset: 0; z-index: 2147483000; display: grid; grid-template-columns: 320px 1fr;
  background: #05080a; color: #d6e6df; font-family: 'Noto Sans SC', Inter, system-ui, sans-serif;
  overflow: hidden; user-select: none; transition: --ac .4s; }
.wb-bg { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 0; }

/* 左栏 */
.wb-side { position: relative; z-index: 2; display: flex; flex-direction: column; padding: 18px 16px 10px;
  border-right: 1px solid rgba(255,255,255,.06); background: linear-gradient(180deg, rgba(10,16,14,.92), rgba(6,10,9,.94));
  backdrop-filter: blur(6px); min-height: 0; }
.wb-brand { font-size: 13px; letter-spacing: 4px; font-weight: 800; color: var(--ac); text-shadow: 0 0 14px var(--ac40); transition: color .5s; }
.wb-brand span { font-size: 10px; letter-spacing: 2px; font-weight: 400; color: #56705f; margin-left: 6px; }
.wb-compute { padding: 10px 0 12px; border-bottom: 1px solid rgba(255,255,255,.06); margin-bottom: 8px; }
.wb-num { font-size: 42px; font-weight: 900; color: #f2fffa; line-height: 1.05; font-variant-numeric: tabular-nums;
  text-shadow: 0 0 22px var(--ac18); }
.wb-rate { font-size: 11px; color: var(--ac); margin-top: 4px; opacity: .9; transition: color .5s; }
.wb-keys { display: flex; flex-wrap: wrap; gap: 4px; padding: 8px 0 12px; border-bottom: 1px solid rgba(255,255,255,.06); margin-bottom: 8px; }
.wb-key { width: 24px; height: 26px; display: grid; place-items: center; border-radius: 6px;
  border: 1px solid rgba(255,255,255,.1); border-bottom-width: 3px; background: #0d1613; color: var(--ac);
  font-size: 12px; font-weight: 800; font-family: ui-monospace, monospace; transition: color .5s; }
.wb-key.hit { animation: wbkey .18s ease; }
@keyframes wbkey { 0% { background: var(--ac40); color: #fff; transform: translateY(2px); border-bottom-width: 1px; } }
.wb-scroll { flex: 1; overflow-y: auto; min-height: 0; display: flex; flex-direction: column; gap: 6px; padding-right: 4px; scrollbar-width: thin; scrollbar-color: #1d2c26 transparent; }
#wbSkills, #wbDevices { display: flex; flex-direction: column; gap: 6px; }
.wb-title { font-size: 11px; letter-spacing: 2px; color: #56705f; margin-top: 8px; text-transform: uppercase; }

.wb-item { text-align: left; border: 1px solid rgba(255,255,255,.07); border-radius: 10px; background: rgba(13,21,18,.8);
  color: #9fc4b5; padding: 8px 11px; cursor: pointer; font-family: inherit;
  transition: border-color .12s, background .12s, transform .06s, box-shadow .2s; }
.wb-item:hover { border-color: rgba(255,255,255,.16); }
.wb-item:active { transform: scale(.985); }
.wb-item.affordable { border-color: var(--ac40); background: rgba(16,28,23,.9); color: #e4f7ee; box-shadow: 0 0 14px var(--ac18), inset 0 0 12px rgba(255,255,255,.02); }
.wb-item.affordable .wb-item-cost { color: var(--ac); }
.wb-item.locked { opacity: .45; cursor: default; border-style: dashed; }
.wb-item.maxed { opacity: .6; }
.wb-item.hidden-row { display: none; }
.wb-item.pulse { animation: wbpulse .4s ease; }
@keyframes wbpulse { 0% { box-shadow: 0 0 0 0 var(--ac40); } 100% { box-shadow: 0 0 0 12px transparent; } }
.wb-item-top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.wb-item-name { font-size: 13px; font-weight: 700; color: #eafff5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wb-item.locked .wb-item-name { color: #5c8574; }
.wb-item-cost { font-size: 13px; font-weight: 800; color: #c9a24b; flex-shrink: 0; font-variant-numeric: tabular-nums; }
.wb-item-meta { font-size: 11px; color: #5c8574; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* 中间：阶段条 + 阶段头 + 伪3D方块地图 */
.wb-main { position: relative; z-index: 1; overflow: hidden; display: grid; grid-template-rows: auto auto 1fr; justify-items: center; }
.wb-stagebar { display: flex; gap: 6px; padding: 14px 12px 0; flex-wrap: wrap; justify-content: center; z-index: 5; }
.wb-stagebtn { display: flex; align-items: center; gap: 6px; padding: 5px 12px 5px 6px; border-radius: 999px;
  border: 1px solid rgba(255,255,255,.08); background: rgba(10,17,14,.7); color: #7d998c; font-size: 12px; font-weight: 600;
  font-family: inherit; cursor: pointer; transition: border-color .2s, color .2s, box-shadow .2s; backdrop-filter: blur(4px); }
.wb-stagebtn i { font-style: normal; width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center;
  font-size: 10px; font-weight: 800; background: rgba(255,255,255,.07); color: #9db5aa; }
.wb-stagebtn:hover:not(.locked) { border-color: rgba(255,255,255,.2); color: #d6e6df; }
.wb-stagebtn.active { border-color: var(--ac); color: #f2fffa; box-shadow: 0 0 16px var(--ac18); }
.wb-stagebtn.active i { background: var(--ac); color: #05221a; }
.wb-stagebtn.done:not(.active) i { background: rgba(255,255,255,.16); color: #eafff5; }
.wb-stagebtn.done:not(.active) i::before { content: "✓"; }
.wb-stagebtn.done i { font-size: 0; } .wb-stagebtn.done i::before { font-size: 10px; }
.wb-stagebtn.locked { opacity: .35; cursor: default; }
.wb-stagebtn.locked i::before { content: "🔒"; font-size: 8px; }
.wb-stagebtn.locked i { font-size: 0; }

.wb-stagehead { text-align: center; padding: 10px 0 0; z-index: 5; }
.wb-stagename { font-size: 22px; font-weight: 900; letter-spacing: 6px; color: #f2fffa; text-shadow: 0 0 24px var(--ac40); }
.wb-stagesub { font-size: 11px; letter-spacing: 2px; color: #6f8f80; margin-top: 3px; }
.wb-stageprog { width: 220px; height: 3px; border-radius: 2px; background: rgba(255,255,255,.07); margin: 8px auto 0; overflow: hidden; }
.wb-stageprog i { display: block; height: 100%; width: 0; border-radius: 2px; background: var(--ac); box-shadow: 0 0 10px var(--ac); transition: width .35s ease, background .5s; }

.wb-stage { position: relative; width: min(86vw, 980px); height: 100%; min-height: 0; align-self: stretch; }
.wb-map { position: absolute; inset: 0; perspective: 1150px; display: none; place-items: center; padding: 12px 0 44px; }
.wb-map.active { display: grid; }
.wb-map.enter .wb-map-inner { animation: wbmapin .55s cubic-bezier(.2,.9,.3,1.1); }
@keyframes wbmapin { from { opacity: 0; } to { opacity: 1; } }
.wb-map-inner { width: min(92%, 860px); max-height: 94%; display: grid; gap: 10px; transform: rotateX(34deg); transform-style: preserve-3d; }

.wb-tile { position: relative; border-radius: 9px; display: grid; place-items: center; min-height: 52px;
  background: linear-gradient(160deg, rgba(20,32,27,.92), rgba(10,18,15,.92)); border: 1px solid rgba(255,255,255,.07);
  box-shadow: 0 6px 0 rgba(3,7,5,.9), 0 10px 18px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.05);
  transform: translateZ(0); transition: transform .18s, box-shadow .18s, background .25s, border-color .25s, opacity .3s; }
.wb-dev .wb-tile-name { font-size: 11px; line-height: 1.2; text-align: center; padding: 0 4px; color: #5d7f6f; transform: rotateX(-34deg); transition: color .25s; }
.wb-dev .wb-x { position: absolute; font-size: 28px; font-weight: 900; color: var(--ac); opacity: 0;
  transform: rotateX(-34deg) scale(.4); transition: opacity .3s, transform .3s, color .5s; text-shadow: 0 0 12px var(--ac40); }
.wb-dev .wb-tile-lv { position: absolute; bottom: 3px; right: 6px; font-size: 10px; color: var(--ac); font-weight: 800; transform: rotateX(-34deg); }
.wb-dev .wb-tile-cost { position: absolute; bottom: 3px; left: 0; right: 0; text-align: center; font-size: 10px; font-weight: 800; color: #c9a24b; transform: rotateX(-34deg); opacity: .85; }
.wb-tile.reachable { border-color: rgba(255,255,255,.14); cursor: pointer; }
.wb-tile.reachable .wb-tile-cost { color: #8a7440; }
.wb-tile.buyable { border-color: var(--ac); cursor: pointer;
  box-shadow: 0 8px 0 rgba(3,9,6,.95), 0 12px 24px var(--ac18), inset 0 1px 0 rgba(255,255,255,.1);
  animation: wbbreathe 1.6s ease-in-out infinite; }
@keyframes wbbreathe { 50% { box-shadow: 0 8px 0 rgba(3,9,6,.95), 0 12px 30px var(--ac40), inset 0 1px 0 rgba(255,255,255,.1); } }
.wb-tile.buyable:hover { transform: translateZ(14px); }
.wb-tile.buyable .wb-tile-name { color: var(--ac); }
.wb-tile.owned { background: linear-gradient(160deg, rgba(28,52,42,.95), rgba(14,30,22,.95)); border-color: var(--ac40);
  transform: translateZ(10px); box-shadow: 0 10px 0 rgba(2,8,5,.95), 0 16px 26px var(--ac18), inset 0 1px 0 rgba(255,255,255,.12); }
.wb-tile.owned .wb-x { opacity: 1; transform: rotateX(-34deg) scale(1); }
.wb-tile.owned .wb-tile-name { color: #9fd9c0; }
.wb-tile.owned .wb-tile-cost { display: none; }
.wb-tile.locked { opacity: .26; }

/* 核心格：眼睛 */
.wb-core { background: radial-gradient(120% 120% at 50% 30%, rgba(16,32,25,.98), rgba(6,12,9,.98)); border-color: var(--ac40);
  transform: translateZ(26px); cursor: pointer;
  box-shadow: 0 14px 0 rgba(2,8,5,.95), 0 20px 44px var(--ac18), inset 0 0 30px var(--ac18); }
.wb-eye { position: relative; width: 46px; height: 46px; border-radius: 50%; transform: rotateX(-34deg);
  background: radial-gradient(circle at 50% 42%, #ffffff 0%, #ffffff 16%, var(--ac) 42%, color-mix(in srgb, var(--ac) 45%, #04140d) 78%, #04140d 100%);
  box-shadow: 0 0 28px var(--ac40), 0 0 60px var(--ac18); animation: wbiris 3.2s ease-in-out infinite; }
.wb-eye i { position: absolute; left: 50%; top: 50%; width: 9px; height: 9px; margin: -4.5px 0 0 -4.5px; border-radius: 50%;
  background: #041008; box-shadow: 0 0 5px rgba(0,0,0,.7); }
@keyframes wbiris { 50% { box-shadow: 0 0 40px var(--ac40), 0 0 90px var(--ac18); } }
.wb-core.gulp { transform: translateZ(26px) scale(1.06); }
.wb-core.gulp .wb-eye { animation: wbgulp .3s ease; }
@keyframes wbgulp { 0% { transform: rotateX(-34deg) scale(1); } 40% { transform: rotateX(-34deg) scale(1.3); } 100% { transform: rotateX(-34deg) scale(1); } }

/* 需求卡 + 浮字 + toast */
.wb-fx { position: absolute; inset: 0; pointer-events: none; z-index: 6; }
.wb-card { position: absolute; z-index: 4; pointer-events: none; padding: 7px 12px; border-radius: 10px;
  border: 1px solid rgba(255,255,255,.12); border-left: 3px solid var(--ac);
  background: linear-gradient(180deg, rgba(16,30,24,.96), rgba(9,18,14,.96)); color: #dff2e8; font-size: 12px; font-weight: 600;
  box-shadow: 0 10px 24px rgba(0,0,0,.55); animation: wbin .25s ease, wbsway 3.4s ease-in-out infinite alternate; }
@keyframes wbin { from { opacity: 0; transform: translateY(-10px) scale(.92); } }
@keyframes wbsway { from { rotate: var(--sway, 0deg); translate: 0 0; } to { rotate: calc(var(--sway, 0deg) * -1); translate: 0 5px; } }
.wb-float { position: absolute; font-weight: 900; font-size: 20px; color: var(--ac); text-shadow: 0 0 12px var(--ac40); animation: wbfloat 1s ease-out forwards; }
@keyframes wbfloat { 0% { opacity: 0; transform: translateY(0) scale(.8); } 18% { opacity: 1; } 100% { opacity: 0; transform: translateY(-54px) scale(1.05); } }

.wb-toast { position: absolute; top: 34%; left: 50%; transform: translate(-50%, -50%) scale(.8); z-index: 8; pointer-events: none;
  padding: 14px 30px; border-radius: 14px; border: 1px solid var(--ac); background: rgba(6,14,11,.92);
  color: #f2fffa; font-size: 18px; font-weight: 900; letter-spacing: 3px; box-shadow: 0 0 40px var(--ac40); opacity: 0; }
.wb-toast.show { animation: wbtoast 2.4s ease forwards; }
@keyframes wbtoast { 0% { opacity: 0; transform: translate(-50%,-50%) scale(.8); } 12% { opacity: 1; transform: translate(-50%,-50%) scale(1.04); }
  20% { transform: translate(-50%,-50%) scale(1); } 80% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%,-56%) scale(1); } }

.wb-help { position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%); font-size: 12px; color: #56705f; z-index: 5; }
.wb-help b { color: var(--ac); }
.wb-debug { position: absolute; top: 12px; right: 14px; width: 34px; height: 34px; border-radius: 8px;
  border: 1px solid rgba(255,255,255,.1); background: rgba(10,20,16,.8); color: #c9a24b; font-size: 15px; cursor: pointer; z-index: 20; }
`;
