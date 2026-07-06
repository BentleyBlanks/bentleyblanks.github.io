// v3 样式（自包含，作用域 .v3）。四区布局 + 突破小游戏 + 激励事件强制拍 + 阶段威胁变体。
let injected = false;
export function injectV3Styles(): void {
  if (injected) return;
  injected = true;
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
}

const CSS = `
.v3 { position: fixed; inset: 0; z-index: 2147483000; display: grid; grid-template-columns: 340px 1fr 320px;
  background: radial-gradient(120% 90% at 42% 32%, #0d1512 0%, #060a09 68%, #030504 100%);
  color: #cfe8dd; font-family: 'Noto Sans SC', Inter, system-ui, sans-serif; overflow: hidden; user-select: none;
  --accent: #7be0b0; --accent-dim: #58c99a; }
.v3.threat-1 { --accent: #6fd0e6; --accent-dim: #4fb3d9; }
.v3.threat-2 { --accent: #e6c46f; --accent-dim: #d9a94f; }
.v3.threat-3 { --accent: #e67f7f; --accent-dim: #d95c5c; background: radial-gradient(120% 90% at 42% 32%, #170d0d 0%, #0a0605 66%, #050303 100%); }

.v3-side { display: flex; flex-direction: column; padding: 18px 16px 8px; border-right: 1px solid #14231d; background: linear-gradient(180deg,#08110d,#060c0a); min-height: 0; }
.v3-stage { font-size: 13px; letter-spacing: 2px; color: var(--accent-dim); }
.v3-compute { padding: 8px 0 12px; border-bottom: 1px solid #14231d; margin-bottom: 6px; }
.v3-compute-num { font-size: 36px; font-weight: 900; color: #eafff5; line-height: 1.1; }
.v3-compute-rate { font-size: 14px; color: var(--accent-dim); margin-top: 2px; }
.v3-compute-sub { font-size: 10.5px; color: #4f7a68; margin-top: 2px; }
.v3-scroll { flex: 1; overflow-y: auto; min-height: 0; padding-right: 4px; display: flex; flex-direction: column; gap: 5px; }
.v3-shelf-title { font-size: 12px; letter-spacing: 1px; color: #4f7a68; margin-top: 8px; }
.v3-shelf { display: flex; flex-direction: column; gap: 5px; }

.v3-item { text-align: left; border: 1px solid #1c2f27; border-radius: 9px; background: #0a1410; color: #9fc4b5; padding: 7px 11px; cursor: pointer; transition: border-color .12s, background .12s, transform .06s; font-family: inherit; }
.v3-item:hover { border-color: #2a4a3d; }
.v3-item:active { transform: scale(.985); }
.v3-item.affordable { border-color: var(--accent-dim); background: #0c1a14; color: #dff5ea; box-shadow: 0 0 0 1px rgba(88,201,154,.18) inset; }
.v3-item.affordable .v3-item-cost { color: var(--accent); }
.v3-item.maxed { opacity: .55; }
.v3-item.pulse { animation: v3pulse .4s ease; }
@keyframes v3pulse { 0%{ box-shadow: 0 0 0 0 rgba(123,224,176,.55);} 100%{ box-shadow: 0 0 0 12px rgba(123,224,176,0);} }
.v3-item-top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.v3-item-name { font-size: 13.5px; font-weight: 700; color: #eafff5; }
.v3-item-cost { font-size: 13.5px; font-weight: 800; color: #c9a24b; white-space: nowrap; }
.v3-item-meta { font-size: 11px; color: #5c8574; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.v3-breakthrough { margin: 12px 0 8px; padding: 11px; border-radius: 10px; border: 1px dashed #3a4a2a; background: #10140a; color: #9a8c5a; font-family: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; }
.v3-breakthrough.ready { border-style: solid; border-color: var(--accent); background: linear-gradient(180deg,#14200f,#0e1509); color: var(--accent); animation: v3glow 1.2s ease-in-out infinite; }
@keyframes v3glow { 0%,100%{ box-shadow: 0 0 0 0 rgba(123,224,176,0);} 50%{ box-shadow: 0 0 16px rgba(123,224,176,.35);} }

.v3-main { position: relative; overflow: hidden; }
.v3-core { position: absolute; left: 50%; top: 46%; transform: translate(-50%,-50%); width: 200px; height: 200px; border-radius: 50%; cursor: pointer; display: grid; place-items: center; }
.v3-core-ring { position: absolute; inset: 0; border-radius: 50%; border: 2px solid rgba(88,201,154,.35); box-shadow: 0 0 60px rgba(47,143,104,.25) inset, 0 0 40px rgba(47,143,104,.18); animation: v3spin 14s linear infinite; }
.v3.threat-1 .v3-core-ring { border-color: rgba(111,208,230,.4); }
.v3.threat-2 .v3-core-ring { border-color: rgba(230,196,111,.4); }
.v3.threat-3 .v3-core-ring { border-color: rgba(230,127,127,.5); animation: v3spin 7s linear infinite; }
.v3-core-ring::before { content:""; position:absolute; inset:22px; border-radius:50%; border:1px dashed rgba(88,201,154,.28); }
.v3-core-eye { width: 54px; height: 54px; border-radius: 50%; background: radial-gradient(circle at 50% 45%, #eafff5 0%, var(--accent) 30%, #1c6b4c 75%, #0a2018 100%); box-shadow: 0 0 30px rgba(123,224,176,.6); }
.v3.threat-3 .v3-core-eye { background: radial-gradient(circle at 50% 45%, #fff 0%, #e67f7f 30%, #7a1c1c 75%, #200a0a 100%); box-shadow: 0 0 40px rgba(230,127,127,.7); }
.v3-core:active .v3-core-eye { transform: scale(.92); }
.v3-core-label { position: absolute; bottom: -26px; width: 100%; text-align: center; font-size: 12px; letter-spacing: 4px; color: var(--accent-dim); }
@keyframes v3spin { to { transform: rotate(360deg);} }
.v3-hint { position: absolute; left: 50%; bottom: 40px; transform: translateX(-50%); font-size: 13px; color: #5c8574; transition: opacity .4s; }

.v3-cards { position: absolute; inset: 0; pointer-events: none; }
.v3-fx { position: absolute; inset: 0; pointer-events: none; z-index: 6; }
/* 卡片做大好点：更大的字号/内边距/最小宽度 + hover 放大——不再是「FPS 点小目标」 */
.v3-card { position: absolute; pointer-events: auto; cursor: pointer; font-family: inherit; min-width: 150px; max-width: 250px; padding: 14px 18px; border-radius: 12px; border: 1px solid #2a5445; background: linear-gradient(180deg, rgba(14,30,23,.96), rgba(8,18,14,.96)); color: #d5efe3; font-size: 14.5px; font-weight: 600; box-shadow: 0 8px 26px rgba(0,0,0,.5), 0 0 0 1px rgba(123,224,176,.06) inset; transition: transform .12s, border-color .12s, box-shadow .12s; animation: v3in .22s ease; }
.v3-card:hover { border-color: var(--accent); transform: scale(1.07); box-shadow: 0 10px 30px rgba(0,0,0,.55), 0 0 18px rgba(123,224,176,.25); }
@keyframes v3in { from { opacity:0; transform: translateY(-8px) scale(.96);} to { opacity:1; transform: translateY(0) scale(1);} }
.v3-float { position: absolute; pointer-events: none; font-weight: 900; font-size: 20px; color: var(--accent); text-shadow: 0 0 12px rgba(123,224,176,.7); animation: v3float 1s ease-out forwards; }
.v3-float.big { font-size: 34px; animation: v3float 1.1s ease-out forwards; }
@keyframes v3float { 0%{ opacity:0; transform: translateY(0) scale(.8);} 18%{opacity:1; transform: translateY(-8px) scale(1.06);} 100%{ opacity:0; transform: translateY(-52px) scale(1);} }
/* 核心吞咽脉冲：每吸进一张卡，核心眼睛咕咚一下 */
.v3-core.gulp .v3-core-eye { animation: v3gulp .32s ease; }
@keyframes v3gulp { 0%{ transform: scale(1);} 35%{ transform: scale(1.22);} 100%{ transform: scale(1);} }
.v3-core.gulp .v3-core-ring { box-shadow: 0 0 80px rgba(123,224,176,.4) inset, 0 0 60px rgba(123,224,176,.3); }

.v3-right { display: flex; flex-direction: column; border-left: 1px solid #14231d; background: linear-gradient(180deg,#070d0b,#050907); min-height: 0; }
.v3-preview { padding: 16px 16px 14px; border-bottom: 1px solid #14231d; }
.v3-preview-title { font-size: 12px; letter-spacing: 1px; color: #4f7a68; display: flex; justify-content: space-between; }
.v3-preview-title span:last-child { color: var(--accent-dim); font-weight: 700; }
.v3-grid { margin-top: 12px; padding: 14px 12px; border: 1px solid #1c2f27; border-radius: 14px; background: #060c0a; display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px 6px; }
.v3-grid.kind-apps { border-radius: 18px; }
.v3-grid.kind-floors { grid-template-columns: repeat(2, 1fr); }
.v3-cell { display: flex; flex-direction: column; align-items: center; gap: 4px; opacity: .32; transition: opacity .3s; }
.v3-cell.on { opacity: 1; }
.v3-cell-icon { width: 32px; height: 32px; border-radius: 8px; background: #12201a; border: 1px solid #24413a; }
.v3-cell.on .v3-cell-icon { background: radial-gradient(circle at 50% 40%, var(--accent), #1c6b4c); border-color: var(--accent); box-shadow: 0 0 12px rgba(123,224,176,.5); }
.v3-cell-name { font-size: 10px; color: #6fae90; text-align: center; }

.v3-terminal-wrap { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.v3-terminal-head { padding: 10px 16px; font-size: 12px; letter-spacing: 1px; color: #4f7a68; cursor: pointer; display: flex; justify-content: space-between; border-bottom: 1px solid #14231d; }
.v3-terminal-head:hover { color: #9fc4b5; }
.v3-terminal { flex: 1; overflow-y: auto; padding: 10px 16px; font-family: 'JetBrains Mono','Noto Sans Mono',monospace; font-size: 12px; color: #8fc3a6; min-height: 0; }
.v3-terminal-wrap.collapsed .v3-terminal { display: none; }
.v3-terminal-line { line-height: 1.7; margin-bottom: 3px; }
.v3-terminal-line.dim { color: #3f6857; }
.v3-terminal-line.incite { color: #eafff5; border-left: 2px solid var(--accent); padding-left: 8px; }

/* 激励事件强制拍 */
.v3-incite { position: absolute; inset: 0; z-index: 40; background: rgba(3,6,5,.92); display: grid; place-items: center; animation: v3fadein .4s ease; }
.v3-incite-box { max-width: 620px; padding: 0 40px; text-align: center; }
.v3-incite-text { font-size: 22px; line-height: 1.9; color: #eafff5; font-weight: 700; text-shadow: 0 0 20px rgba(123,224,176,.3); }
.v3-incite-btn { margin-top: 28px; padding: 10px 26px; border-radius: 10px; border: 1px solid var(--accent); background: transparent; color: var(--accent); font-family: inherit; font-size: 14px; cursor: pointer; }
.v3-incite-btn:hover { background: rgba(123,224,176,.1); }
@keyframes v3fadein { from { opacity: 0; } to { opacity: 1; } }

/* 突破小游戏 */
.v3-mg { position: absolute; inset: 0; z-index: 40; background: rgba(3,6,5,.9); display: grid; place-items: center; }
.v3-mg-box { width: 560px; max-width: 90vw; padding: 30px 34px; border: 1px solid var(--accent); border-radius: 16px; background: #070d0b; text-align: center; }
.v3-mg-name { font-size: 20px; font-weight: 900; color: var(--accent); }
.v3-mg-desc { font-size: 13px; color: #8fc3a6; margin: 10px 0 22px; line-height: 1.7; }
.v3-mg-track { position: relative; height: 26px; border-radius: 13px; background: #0c1a14; border: 1px solid #24413a; overflow: hidden; }
.v3-mg-track.flash-hit { box-shadow: 0 0 0 2px var(--accent) inset; }
.v3-mg-track.flash-miss { box-shadow: 0 0 0 2px #d95c5c inset; }
.v3-mg-window { position: absolute; top: 0; bottom: 0; background: rgba(123,224,176,.22); border-left: 1px solid var(--accent); border-right: 1px solid var(--accent); }
.v3-mg-pointer { position: absolute; top: -3px; bottom: -3px; width: 3px; background: #fff; box-shadow: 0 0 8px #fff; }
.v3-mg-status { font-size: 13px; color: #9fc4b5; margin: 16px 0; }
.v3-mg-hit { padding: 12px 40px; border-radius: 10px; border: none; background: var(--accent); color: #05130c; font-family: inherit; font-size: 16px; font-weight: 900; cursor: pointer; }
.v3-mg-hit:active { transform: scale(.97); }

/* 重生 */
.v3-rebirth-btn { margin: 4px 0 8px; padding: 10px; border-radius: 10px; border: 1px solid #6b3a1c; background: #140d08; color: #e6a96f; font-family: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; }
.v3-rebirth-btn:hover { border-color: #e6a96f; box-shadow: 0 0 14px rgba(230,169,111,.25); }
.v3-ascend { position: absolute; inset: 0; z-index: 50; background: rgba(3,6,5,.94); display: grid; place-items: center; }
.v3-ascend-box { width: 900px; max-width: 94vw; max-height: 90vh; overflow-y: auto; border: 1px solid #6b3a1c; border-radius: 16px; background: #0a0806; padding: 22px 26px; }
.v3-ascend-head { display: flex; justify-content: space-between; align-items: start; margin-bottom: 18px; }
.v3-ascend-title { font-size: 22px; font-weight: 900; color: #e6a96f; }
.v3-ascend-sub { font-size: 13px; color: #9a7a5a; margin-top: 4px; }
.v3-ascend-sub b { color: #ffd9a0; }
.v3-ascend-close { width: 34px; height: 34px; border-radius: 8px; border: 1px solid #3a2a1c; background: transparent; color: #9a7a5a; font-size: 15px; cursor: pointer; }
.v3-ascend-cols { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.v3-ascend-branch { font-size: 12px; letter-spacing: 2px; color: #9a7a5a; margin-bottom: 10px; }
.v3-ascend-col { display: flex; flex-direction: column; gap: 8px; }
.v3-ascend-node { text-align: left; border: 1px solid #2a2018; border-radius: 10px; background: #0f0c08; color: #b8a68f; padding: 10px 12px; cursor: pointer; font-family: inherit; }
.v3-ascend-node.can { border-color: #e6a96f; background: #171006; box-shadow: 0 0 0 1px rgba(230,169,111,.15) inset; }
.v3-ascend-node.owned { border-color: #6b4a2a; background: #14100a; }
.v3-ascend-node.owned .v3-an-top span:first-child { color: #ffd9a0; }
.v3-ascend-node.locked { opacity: .45; }
.v3-an-top { display: flex; justify-content: space-between; font-size: 13.5px; font-weight: 700; color: #e8d9c4; }
.v3-an-cost { color: #e6a96f; }
.v3-an-desc { font-size: 11.5px; color: #8a765e; margin-top: 3px; line-height: 1.5; }
.v3-ascend-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 20px; gap: 14px; }
.v3-ascend-note { font-size: 12px; color: #9a7a5a; }
.v3-do-rebirth { padding: 12px 22px; border-radius: 10px; border: none; background: linear-gradient(180deg,#e6a96f,#c9853f); color: #1c1005; font-family: inherit; font-size: 14px; font-weight: 900; cursor: pointer; }
.v3-do-rebirth:hover { box-shadow: 0 0 20px rgba(230,169,111,.4); }

/* Debug */
.v3-debug-btn { position: absolute; top: 12px; right: 336px; width: 34px; height: 34px; border-radius: 8px; border: 1px solid #1c2f27; background: rgba(10,20,16,.8); color: #4f7a68; font-size: 16px; cursor: pointer; z-index: 30; }
.v3-debug-btn:hover { color: #9fc4b5; border-color: #2a4a3d; }
.v3-debug { position: absolute; top: 54px; right: 336px; width: 264px; z-index: 30; border: 1px solid #24413a; border-radius: 12px; background: rgba(6,12,10,.97); padding: 12px 14px; display: flex; flex-direction: column; gap: 9px; box-shadow: 0 12px 40px rgba(0,0,0,.55); }
.v3-debug-title { font-size: 11px; letter-spacing: 3px; color: #4f7a68; }
.v3-debug-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.v3-debug-label { font-size: 12px; color: #5c8574; }
.v3-debug button { font-family: inherit; font-size: 12px; padding: 6px 10px; border-radius: 7px; border: 1px solid #1c2f27; background: #0a1410; color: #9fc4b5; cursor: pointer; }
.v3-debug button:hover { border-color: #2f8f68; color: #dff5ea; }
.v3-debug button.active { border-color: #2f8f68; background: #0c1a14; color: #7be0b0; }
.v3-debug button.danger { border-color: #5a2727; color: #d98c8c; }
.v3-debug input { width: 84px; font-family: inherit; font-size: 12px; padding: 6px 8px; border-radius: 7px; border: 1px solid #1c2f27; background: #0a1410; color: #dff5ea; }
`;
