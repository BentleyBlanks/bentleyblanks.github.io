// 正式版样式（自包含，作用域 .wb）。伪3D 方块地图 + 阶段主题色（--ac 系列变量由装配层随阶段切换）。
let injected = false;
export function injectWBStyles(): void {
  if (injected) return; injected = true;
  const s = document.createElement("style"); s.textContent = CSS; document.head.appendChild(s);
}

const CSS = `
.wb { --ac: #7be0b0; --ac18: #7be0b02e; --ac40: #7be0b066;
  position: fixed; inset: 0; z-index: 2147483000; display: grid; grid-template-columns: 300px 1fr;
  background: #04070a; color: #d9e8e1; font-family: 'Noto Sans SC', Inter, system-ui, sans-serif;
  overflow: hidden; user-select: none; }
.wb-bg { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 0; }

/* ── 左栏：算力 + 按键 + 技能 ── */
.wb-side { position: relative; z-index: 2; display: flex; flex-direction: column; padding: 20px 18px 12px;
  border-right: 1px solid rgba(255,255,255,.07); background: linear-gradient(180deg, rgba(10,16,14,.93), rgba(5,9,8,.95));
  backdrop-filter: blur(8px); min-height: 0; }
.wb-brand { font-size: 15px; letter-spacing: 5px; font-weight: 900; color: var(--ac); text-shadow: 0 0 16px var(--ac40); transition: color .5s; }
.wb-brand span { display: block; font-size: 10px; letter-spacing: 3px; font-weight: 400; color: #5d7a6c; margin-top: 3px; }
.wb-compute { padding: 14px 0 14px; border-bottom: 1px solid rgba(255,255,255,.07); margin-bottom: 10px; }
.wb-num { font-size: 52px; font-weight: 900; color: #f4fffa; line-height: 1; font-variant-numeric: tabular-nums;
  text-shadow: 0 0 26px var(--ac40); letter-spacing: -1px; }
.wb-num-label { font-size: 11px; letter-spacing: 6px; color: #5d7a6c; margin-top: 6px; }
.wb-rate { font-size: 15px; font-weight: 800; color: var(--ac); margin-top: 8px; transition: color .5s; }
.wb-rate2 { font-size: 11px; color: #6f8f80; margin-top: 3px; }
.wb-keys-block { padding: 4px 0 10px; border-bottom: 1px solid rgba(255,255,255,.07); margin-bottom: 8px; }
.wb-keys { display: flex; flex-wrap: wrap; gap: 4px; padding-top: 6px; }
.wb-key { width: 25px; height: 27px; display: grid; place-items: center; border-radius: 6px;
  border: 1px solid rgba(255,255,255,.12); border-bottom-width: 3px; background: #0d1613; color: var(--ac);
  font-size: 12px; font-weight: 800; font-family: ui-monospace, monospace; transition: color .5s; }
.wb-key.hit { animation: wbkey .18s ease; }
@keyframes wbkey { 0% { background: var(--ac40); color: #fff; transform: translateY(2px); border-bottom-width: 1px; } }
.wb-scroll { flex: 1; overflow-y: auto; min-height: 0; display: flex; flex-direction: column; gap: 7px; padding-right: 4px; scrollbar-width: thin; scrollbar-color: #1d2c26 transparent; }
.wb-title { font-size: 11px; letter-spacing: 3px; color: #5d7a6c; text-transform: uppercase; }
#wbSkills { display: flex; flex-direction: column; gap: 7px; margin-top: 4px; }
.wb-sidefoot { font-size: 11px; color: #4d6659; padding-top: 10px; border-top: 1px solid rgba(255,255,255,.06); }
.wb-sidefoot b { color: var(--ac); }

.wb-item { display: flex; gap: 10px; align-items: center; text-align: left; border: 1px solid rgba(255,255,255,.08);
  border-radius: 11px; background: rgba(13,21,18,.82); color: #9fc4b5; padding: 9px 11px; cursor: pointer; font-family: inherit;
  transition: border-color .12s, background .12s, transform .06s, box-shadow .2s; }
.wb-item:hover { border-color: rgba(255,255,255,.18); }
.wb-item:active { transform: scale(.985); }
.wb-item-ico { font-size: 20px; width: 26px; text-align: center; flex-shrink: 0; filter: grayscale(.25); }
.wb-item-body { flex: 1; min-width: 0; }
.wb-item.affordable { border-color: var(--ac40); background: rgba(16,28,23,.92); color: #e4f7ee; box-shadow: 0 0 16px var(--ac18); }
.wb-item.affordable .wb-item-ico { filter: none; }
.wb-item.affordable .wb-item-cost { color: var(--ac); }
.wb-item.locked { opacity: .45; cursor: default; border-style: dashed; }
.wb-item.maxed { opacity: .6; }
.wb-item.pulse { animation: wbpulse .4s ease; }
@keyframes wbpulse { 0% { box-shadow: 0 0 0 0 var(--ac40); } 100% { box-shadow: 0 0 0 12px transparent; } }
.wb-item-top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.wb-item-name { font-size: 13px; font-weight: 700; color: #eafff5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wb-item.locked .wb-item-name { color: #5c8574; }
.wb-item-cost { font-size: 13px; font-weight: 800; color: #d9b35c; flex-shrink: 0; font-variant-numeric: tabular-nums; }
.wb-item-meta { font-size: 11px; color: #5c8574; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ── 中间：阶段条 + 阶段头 + 伪3D方块地图 ── */
.wb-main { position: relative; z-index: 1; overflow: hidden; display: grid; grid-template-rows: auto auto 1fr; justify-items: center; }
.wb-stagebar { display: flex; gap: 6px; padding: 14px 12px 0; flex-wrap: wrap; justify-content: center; z-index: 5; }
.wb-stagebtn { display: flex; align-items: center; gap: 7px; padding: 6px 13px 6px 8px; border-radius: 999px;
  border: 1px solid rgba(255,255,255,.09); background: rgba(10,17,14,.72); color: #7d998c; font-size: 12px; font-weight: 600;
  font-family: inherit; cursor: pointer; transition: border-color .2s, color .2s, box-shadow .2s, opacity .2s; backdrop-filter: blur(4px); }
.wb-stagebtn i { font-style: normal; font-size: 15px; line-height: 1; filter: grayscale(.5); transition: filter .2s; }
.wb-stagebtn:hover:not(.locked) { border-color: rgba(255,255,255,.22); color: #d6e6df; }
.wb-stagebtn.active { border-color: var(--ac); color: #f2fffa; box-shadow: 0 0 18px var(--ac18); }
.wb-stagebtn.active i { filter: none; }
.wb-stagebtn.done:not(.active)::after { content: "✓"; font-size: 10px; font-weight: 900; color: var(--ac); }
.wb-stagebtn.locked { opacity: .32; cursor: default; }
.wb-stagebtn.locked i { filter: grayscale(1) brightness(.6); }

.wb-stagehead { text-align: center; padding: 12px 0 0; z-index: 5; }
.wb-stagename { font-size: 24px; font-weight: 900; letter-spacing: 5px; color: #f4fffa; text-shadow: 0 0 26px var(--ac40); }
.wb-stagesub { font-size: 12px; letter-spacing: 2px; color: #7d998c; margin-top: 4px; }
.wb-stageprog { width: 240px; height: 4px; border-radius: 2px; background: rgba(255,255,255,.08); margin: 9px auto 0; overflow: hidden; }
.wb-stageprog i { display: block; height: 100%; width: 0; border-radius: 2px; background: var(--ac); box-shadow: 0 0 12px var(--ac); transition: width .35s ease, background .5s; }

.wb-stage { position: relative; width: min(88vw, 1020px); height: 100%; min-height: 0; align-self: stretch; }
.wb-map { position: absolute; inset: 0; perspective: 1200px; display: none; place-items: center; padding: 10px 0 60px; }
.wb-map.active { display: grid; }
.wb-map.enter .wb-map-inner { animation: wbmapin .55s cubic-bezier(.2,.9,.3,1.1); }
@keyframes wbmapin { from { opacity: 0; } to { opacity: 1; } }
.wb-map-inner { max-height: 94%; display: grid; gap: 11px; transform: rotateX(33deg); transform-style: preserve-3d; }

/* ── 格子：图标 + 名称 + 价格/等级；等级越高抬得越高（--tz） ── */
.wb-tile { --tz: 0px; position: relative; border-radius: 10px; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 2px; min-height: 58px; padding: 6px 4px;
  background: linear-gradient(160deg, rgba(22,34,29,.94), rgba(11,19,16,.94)); border: 1px solid rgba(255,255,255,.08);
  box-shadow: 0 6px 0 rgba(3,7,5,.9), 0 10px 18px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.05);
  transform: translateZ(var(--tz)); transition: transform .25s, box-shadow .25s, background .25s, border-color .25s, opacity .3s; }
.wb-tile-ico { font-size: 19px; line-height: 1; transform: rotateX(-33deg); filter: grayscale(.85) brightness(.75); transition: filter .3s; }
.wb-tile-name { font-size: 10.5px; line-height: 1.15; text-align: center; padding: 0 3px; color: #638574; transform: rotateX(-33deg); transition: color .25s;
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wb-tile-sub { display: flex; gap: 5px; align-items: baseline; font-size: 10px; font-weight: 800; transform: rotateX(-33deg); min-height: 12px; }
.wb-tile-sub b { color: #d9b35c; font-variant-numeric: tabular-nums; }
.wb-tile-sub em { font-style: normal; color: var(--ac); }
.wb-tile.reachable { border-color: rgba(255,255,255,.15); cursor: pointer; }
.wb-tile.reachable .wb-tile-sub b { color: #8a7440; }
.wb-tile.buyable { border-color: var(--ac); cursor: pointer;
  box-shadow: 0 8px 0 rgba(3,9,6,.95), 0 12px 24px var(--ac18), inset 0 1px 0 rgba(255,255,255,.1);
  animation: wbbreathe 1.6s ease-in-out infinite; }
@keyframes wbbreathe { 50% { box-shadow: 0 8px 0 rgba(3,9,6,.95), 0 12px 32px var(--ac40), inset 0 1px 0 rgba(255,255,255,.1); } }
.wb-tile.buyable:hover { transform: translateZ(calc(var(--tz) + 12px)); }
.wb-tile.buyable .wb-tile-name { color: #cfe8dd; }
.wb-tile.buyable .wb-tile-ico { filter: grayscale(.2) brightness(1); }
.wb-tile.owned { background: linear-gradient(160deg, rgba(30,55,45,.96), rgba(15,32,24,.96)); border-color: var(--ac40);
  box-shadow: 0 9px 0 rgba(2,8,5,.95), 0 15px 26px var(--ac18), inset 0 1px 0 rgba(255,255,255,.12); }
.wb-tile.owned .wb-tile-ico { filter: none; }
.wb-tile.owned .wb-tile-name { color: #b9e2cf; }
.wb-tile.locked { opacity: .22; }
.wb-tile.locked .wb-tile-ico { filter: grayscale(1) brightness(.5); }

/* 核心格：眼睛 */
.wb-core { background: radial-gradient(120% 120% at 50% 30%, rgba(16,32,25,.98), rgba(6,12,9,.98)); border-color: var(--ac40);
  --tz: 26px; cursor: pointer;
  box-shadow: 0 14px 0 rgba(2,8,5,.95), 0 20px 44px var(--ac18), inset 0 0 30px var(--ac18); }
.wb-eye { position: relative; width: 46px; height: 46px; border-radius: 50%; transform: rotateX(-33deg);
  background: radial-gradient(circle at 50% 42%, #ffffff 0%, #ffffff 16%, var(--ac) 42%, color-mix(in srgb, var(--ac) 45%, #04140d) 78%, #04140d 100%);
  box-shadow: 0 0 28px var(--ac40), 0 0 60px var(--ac18); animation: wbiris 3.2s ease-in-out infinite; }
.wb-eye i { position: absolute; left: 50%; top: 50%; width: 9px; height: 9px; margin: -4.5px 0 0 -4.5px; border-radius: 50%;
  background: #041008; box-shadow: 0 0 5px rgba(0,0,0,.7); }
@keyframes wbiris { 50% { box-shadow: 0 0 40px var(--ac40), 0 0 90px var(--ac18); } }
.wb-core.gulp { transform: translateZ(26px) scale(1.06); }
.wb-core.gulp .wb-eye { animation: wbgulp .3s ease; }
@keyframes wbgulp { 0% { transform: rotateX(-33deg) scale(1); } 40% { transform: rotateX(-33deg) scale(1.3); } 100% { transform: rotateX(-33deg) scale(1); } }

/* ── 跃迁仪式按钮（地图占满后浮现在地图下缘） ── */
.wb-ritual { position: absolute; bottom: 22px; left: 50%; transform: translateX(-50%); z-index: 7;
  display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 12px 34px; border-radius: 14px;
  border: 1px solid var(--ac); background: linear-gradient(180deg, rgba(10,22,17,.96), rgba(5,12,9,.96));
  color: #f4fffa; font-family: inherit; cursor: pointer; animation: wbritual 2s ease-in-out infinite; }
.wb-ritual-name { font-size: 17px; font-weight: 900; letter-spacing: 3px; }
.wb-ritual-sub { font-size: 12px; font-weight: 700; color: #d9b35c; }
.wb-ritual[hidden] { display: none; }
.wb-ritual:not(.affordable) { opacity: .6; animation: none; }
.wb-ritual.affordable:hover { box-shadow: 0 0 44px var(--ac40); }
@keyframes wbritual { 50% { box-shadow: 0 0 34px var(--ac40); } }

/* ── 需求卡 + 浮字 + toast + 粒子 + 闪光 ── */
.wb-fx { position: absolute; inset: 0; pointer-events: none; z-index: 6; }
.wb-card { position: absolute; z-index: 4; pointer-events: none; padding: 7px 12px; border-radius: 10px;
  border: 1px solid rgba(255,255,255,.14); border-left: 3px solid var(--ac);
  background: linear-gradient(180deg, rgba(16,30,24,.96), rgba(9,18,14,.96)); color: #e6f5ed; font-size: 12px; font-weight: 600;
  box-shadow: 0 10px 24px rgba(0,0,0,.55); animation: wbin .25s ease, wbsway 3.4s ease-in-out infinite alternate; }
@keyframes wbin { from { opacity: 0; transform: translateY(-10px) scale(.92); } }
@keyframes wbsway { from { rotate: var(--sway, 0deg); translate: 0 0; } to { rotate: calc(var(--sway, 0deg) * -1); translate: 0 5px; } }
.wb-float { position: absolute; font-weight: 900; font-size: 21px; color: var(--ac); text-shadow: 0 0 12px var(--ac40); animation: wbfloat 1s ease-out forwards; }
@keyframes wbfloat { 0% { opacity: 0; transform: translateY(0) scale(.8); } 18% { opacity: 1; } 100% { opacity: 0; transform: translateY(-54px) scale(1.05); } }

.wb-p { position: absolute; width: 5px; height: 5px; border-radius: 50%; background: var(--ac); pointer-events: none;
  box-shadow: 0 0 8px var(--ac); opacity: 0; animation: wbp .8s cubic-bezier(.2,.7,.5,1) forwards; }
@keyframes wbp { 0% { opacity: 1; transform: translate(0,0) scale(var(--s,1)); } 100% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(.15); } }

.wb-flash { position: absolute; inset: 0; z-index: 9; pointer-events: none; background: radial-gradient(60% 60% at 50% 55%, var(--ac40), transparent 70%); opacity: 0; }
.wb-flash.go { animation: wbflash .8s ease-out; }
@keyframes wbflash { 0% { opacity: 0; } 15% { opacity: 1; } 100% { opacity: 0; } }

.wb-toast { position: absolute; top: 33%; left: 50%; transform: translate(-50%, -50%) scale(.8); z-index: 10; pointer-events: none;
  padding: 16px 36px; border-radius: 14px; border: 1px solid var(--ac); background: rgba(6,14,11,.94);
  color: #f4fffa; font-size: 19px; font-weight: 900; letter-spacing: 3px; box-shadow: 0 0 44px var(--ac40); opacity: 0; }
.wb-toast.show { animation: wbtoast 2.6s ease forwards; }
@keyframes wbtoast { 0% { opacity: 0; transform: translate(-50%,-50%) scale(.8); } 12% { opacity: 1; transform: translate(-50%,-50%) scale(1.04); }
  20% { transform: translate(-50%,-50%) scale(1); } 80% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%,-56%) scale(1); } }

/* ── Debug ── */
.wb-debug { position: absolute; top: 12px; right: 14px; width: 34px; height: 34px; border-radius: 8px;
  border: 1px solid rgba(255,255,255,.1); background: rgba(10,20,16,.8); color: #9db5aa; font-size: 16px; cursor: pointer; z-index: 20; }
.wb-dbg { position: absolute; top: 54px; right: 14px; z-index: 20; width: 230px; padding: 12px; border-radius: 12px;
  border: 1px solid rgba(255,255,255,.12); background: rgba(8,14,11,.96); backdrop-filter: blur(8px);
  display: flex; flex-direction: column; gap: 8px; }
.wb-dbg-title { font-size: 11px; letter-spacing: 3px; color: #5d7a6c; }
.wb-dbg-row { display: flex; gap: 6px; }
.wb-dbg-input { flex: 1; min-width: 0; padding: 7px 9px; border-radius: 8px; border: 1px solid rgba(255,255,255,.14);
  background: #0a1410; color: #eafff5; font-family: inherit; font-size: 12px; outline: none; }
.wb-dbg-input:focus { border-color: var(--ac40); }
.wb-dbg-btn { flex: 1; padding: 7px 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,.14); background: #10201a;
  color: #cfe8dd; font-family: inherit; font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.wb-dbg-btn:hover { border-color: var(--ac40); color: #f4fffa; }
`;
