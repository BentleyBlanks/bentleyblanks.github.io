// 白盒·算力矩阵样式（自包含，作用域 .mx）。CRT 终端底 + Canvas 全屏 + 右侧商店 HUD。
let injected = false;
export function injectMatrixStyles(): void {
  if (injected) return; injected = true;
  const s = document.createElement("style"); s.textContent = CSS; document.head.appendChild(s);
}
const CSS = `
.mx { position: fixed; inset: 0; z-index: 2147483000; overflow: hidden; user-select: none;
  background: radial-gradient(130% 120% at 50% 45%, #0b1408 0%, #060b04 60%, #030503 100%);
  --grn: #b6ff6e; --gd: #5f8a3e; --gk: #2e4a1e; --amb: #e6bd53; --red: #e2564d;
  font-family: 'Courier New','Consolas',ui-monospace,monospace; color: var(--grn); }
.mx-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.mx-scan { position: absolute; inset: 0; pointer-events: none; z-index: 5;
  background: repeating-linear-gradient(0deg, rgba(0,0,0,.16) 0 1px, transparent 1px 3px), radial-gradient(120% 120% at 50% 50%, transparent 62%, rgba(0,0,0,.5) 100%);
  mix-blend-mode: multiply; }

/* 左上 HUD */
.mx-hud { position: absolute; top: 18px; left: 20px; z-index: 8; pointer-events: none; }
.mx-brand { font-size: 11px; letter-spacing: 2px; color: var(--gd); text-transform: uppercase; }
.mx-num { font-size: 46px; font-weight: 700; color: #eaffce; line-height: 1; letter-spacing: 1px; text-shadow: 0 0 14px rgba(120,220,60,.5); }
.mx-rate { font-size: 12px; color: var(--gd); margin-top: 4px; }
.mx-combo { font-size: 18px; font-weight: 800; margin-top: 6px; transition: opacity .2s; text-shadow: 0 0 12px currentColor; }
.mx-keys { display: flex; gap: 4px; margin-top: 10px; flex-wrap: wrap; max-width: 320px; }
.mx-key { width: 24px; height: 24px; display: grid; place-items: center; border-radius: 4px; border: 1px solid var(--gk); background: rgba(12,22,6,.7); color: var(--gd); font-size: 12px; font-weight: 700; }
.mx-key.hit { animation: mxkey .2s ease; }
@keyframes mxkey { 0%{ background: var(--grn); color: #06120c; box-shadow: 0 0 14px var(--grn);} 100%{} }

.mx-guide { position: absolute; top: 18px; left: 50%; transform: translateX(-50%); z-index: 10; max-width: 60%; padding: 9px 18px; border: 1px solid var(--grn); border-radius: 4px; background: rgba(12,24,6,.94); color: #d9ff9c; font-size: 13px; box-shadow: 0 0 18px rgba(120,220,60,.22); }

/* 右侧商店 */
.mx-shop { position: absolute; top: 0; right: 0; bottom: 0; width: 296px; z-index: 8; padding: 16px 12px; overflow-y: auto;
  background: linear-gradient(270deg, rgba(6,12,4,.92), rgba(6,12,4,.5) 80%, transparent); border-left: 1px solid var(--gk); }
.mx-shop::-webkit-scrollbar { width: 6px; } .mx-shop::-webkit-scrollbar-thumb { background: var(--gk); border-radius: 3px; }
.mx-shop-title { font-size: 11px; letter-spacing: 1px; color: var(--gd); margin: 10px 0 6px; text-transform: uppercase; }
.mx-item { display: flex; gap: 8px; align-items: center; width: 100%; padding: 7px 10px; margin-bottom: 5px; cursor: pointer; font-family: inherit;
  border: 1px solid var(--gk); border-radius: 5px; background: rgba(12,22,6,.5); color: var(--gd); transition: border-color .1s, background .1s; --tone: var(--grn); }
.mx-item:hover { border-color: var(--gd); }
.mx-item.affordable { border-color: var(--tone); background: rgba(30,50,14,.4); box-shadow: 0 0 10px color-mix(in srgb, var(--tone) 20%, transparent) inset; }
.mx-item.affordable .mx-item-name { color: color-mix(in srgb, var(--tone) 85%, #fff); }
.mx-item.affordable .mx-item-cost { color: var(--tone); }
.mx-item.locked { opacity: .4; cursor: default; border-style: dashed; }
.mx-item.maxed { opacity: .6; }
.mx-item.pulse { animation: mxpulse .35s ease; }
@keyframes mxpulse { 0%{ box-shadow: 0 0 0 0 color-mix(in srgb, var(--tone) 60%, transparent);} 100%{ box-shadow: 0 0 0 10px transparent;} }
.mx-item-icon { font-size: 18px; width: 28px; height: 28px; display: grid; place-items: center; border: 1px solid color-mix(in srgb, var(--tone) 40%, var(--gk)); border-radius: 4px; background: #0a1406; flex: none;
  filter: grayscale(.4) brightness(1.05); }
.mx-item.locked .mx-item-icon { filter: grayscale(1) brightness(.4); }
.mx-item-body { flex: 1; min-width: 0; }
.mx-item-top { display: flex; justify-content: space-between; align-items: baseline; }
.mx-item-name { font-size: 13px; font-weight: 700; color: color-mix(in srgb, var(--tone) 75%, #cfe8dd); }
.mx-item.locked .mx-item-name { color: var(--gd); }
.mx-item-cost { font-size: 13px; font-weight: 700; color: var(--amb); }
.mx-item-meta { font-size: 10px; color: var(--gd); margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: .85; }

.mx-fx { position: absolute; inset: 0; pointer-events: none; z-index: 9; }
.mx-float { position: absolute; transform: translateX(-50%); font-weight: 800; font-size: 22px; color: #d9ffe0; text-shadow: 0 0 12px rgba(182,255,110,.8); animation: mxfloat .85s ease-out forwards; font-family: inherit; }
@keyframes mxfloat { 0%{ opacity:0; transform: translate(-50%,0) scale(.8);} 18%{opacity:1;} 100%{ opacity:0; transform: translate(-50%,-50px) scale(1.1);} }

.mx-help { position: absolute; bottom: 16px; left: 20px; z-index: 8; font-size: 12px; color: var(--gd); }
.mx-help b { color: var(--grn); }

.mx-debug-btn { position: absolute; top: 12px; right: 306px; width: 30px; height: 30px; border-radius: 6px; border: 1px solid var(--gk); background: rgba(10,20,6,.9); color: var(--gd); font-size: 14px; cursor: pointer; z-index: 12; }
.mx-debug-btn:hover { color: var(--grn); }
.mx-debug { position: absolute; top: 48px; right: 306px; width: 252px; z-index: 12; border: 1px solid var(--gd); border-radius: 8px; background: rgba(6,12,4,.98); padding: 11px 13px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 12px 40px rgba(0,0,0,.6); }
.mx-debug-title { font-size: 11px; letter-spacing: 3px; color: var(--gd); }
.mx-debug-row { display: flex; gap: 5px; align-items: center; flex-wrap: wrap; font-size: 11px; color: var(--gd); }
.mx-debug button { font-family: inherit; font-size: 11px; padding: 5px 9px; border-radius: 5px; border: 1px solid var(--gk); background: #0a1406; color: var(--gd); cursor: pointer; }
.mx-debug button:hover { border-color: var(--grn); color: var(--grn); }
.mx-debug button.active { border-color: var(--grn); color: var(--grn); background: rgba(30,50,14,.5); }
.mx-debug button.danger { border-color: #6a2723; color: var(--red); }
.mx-debug input { width: 76px; font-family: inherit; font-size: 11px; padding: 5px 7px; border-radius: 5px; border: 1px solid var(--gk); background: #0a1406; color: var(--grn); }
`;
