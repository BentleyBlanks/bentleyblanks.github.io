// 白盒样式（自包含，作用域 .wb）。伪3D 浮雕方块地图（perspective + 立体格 + 中心眼 + 占领填X）。
let injected = false;
export function injectWBStyles(): void {
  if (injected) return; injected = true;
  const s = document.createElement("style"); s.textContent = CSS; document.head.appendChild(s);
}

const CSS = `
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
`;
