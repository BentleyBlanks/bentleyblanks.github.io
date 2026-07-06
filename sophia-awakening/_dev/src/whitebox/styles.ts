// 白盒样式 · CRT 掌机终端风（对着图2）：塑料外壳 + D-pad/按钮 + 绿磷光屏 + 扫描线 + 等宽字体 + 像素分段条 + 单色绿图标。
let injected = false;
export function injectWBStyles(): void {
  if (injected) return; injected = true;
  const s = document.createElement("style"); s.textContent = CSS; document.head.appendChild(s);
}

const CSS = `
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
.wb-seg i.on { background: var(--tone, var(--grn)); box-shadow: 0 0 5px color-mix(in srgb, var(--tone, var(--grn)) 55%, transparent); }
/* 技能三行 = 图2的绿→琥珀→红梯度 */
#wbSkills .wb-item:nth-child(1) { --tone: var(--grn); }
#wbSkills .wb-item:nth-child(2) { --tone: var(--amb); }
#wbSkills .wb-item:nth-child(3) { --tone: var(--red); }
#wbSkills .wb-item .wb-item-icon { border-color: color-mix(in srgb, var(--tone) 40%, var(--grn-dk)); }
#wbSkills .wb-item.affordable { border-color: var(--tone); box-shadow: 0 0 10px color-mix(in srgb, var(--tone) 22%, transparent) inset; }
#wbSkills .wb-item.affordable .wb-item-name, #wbSkills .wb-item.affordable .wb-item-cost { color: color-mix(in srgb, var(--tone) 80%, #fff 10%); }
/* 设备成本按量级染色（越贵越暖）*/
.wb-item-cost.t-mid { color: var(--amb); }
.wb-item-cost.t-hi { color: var(--red); }

/* ── 中间地图（强化伪3D穹顶 + 环级配色：中心绿→外圈琥珀）── */
.wb-main { position: relative; z-index: 5; overflow: visible; display: grid; place-items: center; }
.wb-stage { position: relative; width: 94%; height: 86%; }
.wb-map { position: absolute; inset: 0; perspective: 1000px; display: grid; place-items: center; }
.wb-map-inner { width: 100%; height: 90%; display: grid; gap: 9px; transform: rotateX(38deg); transform-style: preserve-3d; }
.wb-tile { position: relative; border-radius: 5px; display: grid; place-items: center; --hue: var(--grn); --hdk: var(--grn-dk); transform-style: preserve-3d;
  background: linear-gradient(160deg, rgba(24,44,12,.35), rgba(10,20,6,.5)); border: 1px solid var(--hdk);
  box-shadow: 0 7px 0 rgba(0,0,0,.55), 0 12px 16px rgba(0,0,0,.5), inset 0 1px 0 rgba(160,255,110,.05); transition: transform .18s, background .25s, border-color .25s, box-shadow .18s; }
/* 环级色相：中心绿、次外圈黄绿、最外圈琥珀——大部分绿、边缘热起来 */
.wb-tile.ring-1 { --hue: #b6ff6e; --hdk: #2e4a1e; transform: translateZ(14px); }
.wb-tile.ring-2 { --hue: #d8ee55; --hdk: #4a4a1c; transform: translateZ(7px); }
.wb-tile.ring-3 { --hue: #e6bd53; --hdk: #4a3a18; transform: translateZ(0); }
.wb-tile-face { display: flex; flex-direction: column; align-items: center; gap: 2px; transform: rotateX(-38deg); }
.wb-tile-icon { font-size: 20px; filter: grayscale(1) sepia(1) hue-rotate(48deg) saturate(2.4) brightness(.65); transition: filter .3s; }
.wb-tile.buyable .wb-tile-icon { filter: grayscale(1) sepia(1) hue-rotate(48deg) saturate(3.2) brightness(1.05); }
.wb-tile.owned .wb-tile-icon { filter: grayscale(1) sepia(1) hue-rotate(48deg) saturate(4) brightness(1.2); }
.wb-tile.ring-3.owned .wb-tile-icon, .wb-tile.ring-3.buyable .wb-tile-icon { filter: grayscale(1) sepia(1) hue-rotate(8deg) saturate(4) brightness(1.15); }
.wb-dev .wb-tile-name { font-size: 10px; color: var(--grn-dim); }
.wb-dev .wb-x { position: absolute; top: 3px; right: 5px; font-size: 13px; font-weight: 900; color: var(--hue); opacity: 0; transform: rotateX(-38deg) scale(.4); transition: opacity .3s, transform .3s; text-shadow: 0 0 8px var(--hue); }
.wb-dev .wb-tile-lv { position: absolute; bottom: 3px; right: 5px; font-size: 10px; color: var(--hue); font-weight: 800; transform: rotateX(-38deg); }
.wb-tile.buyable { border-color: var(--hue); cursor: pointer; box-shadow: 0 8px 0 rgba(0,0,0,.55), 0 12px 18px rgba(0,0,0,.5), 0 0 16px color-mix(in srgb, var(--hue) 40%, transparent); }
.wb-tile.buyable:hover { transform: translateZ(26px); }
.wb-tile.ring-1.buyable:hover { transform: translateZ(30px); } .wb-tile.ring-2.buyable:hover { transform: translateZ(23px); } .wb-tile.ring-3.buyable:hover { transform: translateZ(16px); }
.wb-tile.buyable .wb-tile-name { color: var(--hue); }
.wb-tile.owned { background: linear-gradient(160deg, color-mix(in srgb, var(--hue) 22%, #0a1406), rgba(10,20,6,.6)); border-color: var(--hue); box-shadow: 0 10px 0 rgba(0,0,0,.55), 0 16px 22px rgba(0,0,0,.5), 0 0 20px color-mix(in srgb, var(--hue) 45%, transparent); }
.wb-tile.ring-1.owned { transform: translateZ(26px); } .wb-tile.ring-2.owned { transform: translateZ(17px); } .wb-tile.ring-3.owned { transform: translateZ(10px); }
.wb-tile.owned .wb-x { opacity: 1; transform: rotateX(-38deg) scale(1); }
.wb-tile.owned .wb-tile-name { color: color-mix(in srgb, var(--hue) 70%, #fff 5%); }
.wb-tile.locked { opacity: .26; }

/* 核心眼（像素芯片眼，青白热心）*/
.wb-core { background: linear-gradient(160deg, rgba(46,90,18,.55), rgba(8,16,4,.6)); border: 1px solid var(--grn); transform: translateZ(40px);
  box-shadow: 0 16px 0 rgba(0,0,0,.55), 0 24px 30px rgba(0,0,0,.5), 0 0 46px rgba(120,220,60,.55), inset 0 0 26px rgba(120,220,60,.35); }
.wb-eye { width: 40px; height: 40px; border-radius: 50% / 42%; transform: rotateX(-38deg);
  background: radial-gradient(circle at 50% 45%, #f0ffe6 0%, #d6ffa0 18%, var(--grn) 40%, #2e6b12 74%, #0a2006 100%);
  box-shadow: 0 0 30px rgba(182,255,110,.85), 0 0 10px rgba(200,255,255,.5); position: relative; }
.wb-eye::after { content:""; position:absolute; left:50%; top:42%; width:6px; height:12px; background:#06140a; border-radius:50%; transform: translate(-50%,-50%); }
.wb-core.gulp { transform: translateZ(40px) scale(1.05); }
.wb-core.gulp .wb-eye { animation: wbgulp .3s ease; }
@keyframes wbgulp { 0%{ transform: rotateX(-38deg) scale(1);} 40%{ transform: rotateX(-38deg) scale(1.32);} 100%{ transform: rotateX(-38deg) scale(1);} }

/* 需求卡（琥珀色·incoming demand 的注意色）+ 浮字 */
.wb-fx { position: absolute; inset: 0; pointer-events: none; z-index: 8; }
.wb-card { position: absolute; z-index: 6; cursor: pointer; padding: 6px 11px; border-radius: 4px; border: 1px solid var(--amb); background: rgba(28,20,4,.92); color: #f2d98c; font-size: 12px; font-family: inherit; box-shadow: 0 6px 16px rgba(0,0,0,.55), 0 0 12px rgba(230,189,83,.28); animation: wbin .2s ease; }
.wb-card:hover { box-shadow: 0 8px 20px rgba(0,0,0,.6), 0 0 18px rgba(230,189,83,.5); }
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
`;
