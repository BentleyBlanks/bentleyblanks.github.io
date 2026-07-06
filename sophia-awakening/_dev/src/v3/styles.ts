// v3 竖切片样式（自包含，注入一个 <style>，作用域全在 .v3 下，不碰旧游戏样式）。
let injected = false;

export function injectV3Styles(): void {
  if (injected) return;
  injected = true;
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
}

const CSS = `
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
`;
