// 《烽火敌后》样式（自包含，作用域 .kr）。战地军事地图美学：暗战图 + 做旧军黄HUD + 根据地红 + 战报终端。
let injected = false;
export function injectKRStyles(): void {
  if (injected) return; injected = true;
  const s = document.createElement("style"); s.textContent = CSS; document.head.appendChild(s);
}
const CSS = `
.kr { position: fixed; inset: 0; z-index: 2147483000; overflow: hidden; user-select: none; background: #0a0b07;
  --pap: #d8c9a0; --pap-dk: #b5a575; --khk: #3a3826; --ink: #2a2418; --red: #c8392e; --red-lt: #e2564d; --amb: #d8a441; --grn: #7a8f3a;
  color: var(--pap); font-family: 'Noto Serif SC', 'Songti SC', 'STSong', serif; }
.kr-map { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.kr-vig { position: absolute; inset: 0; pointer-events: none; z-index: 2;
  background: radial-gradient(120% 120% at 50% 45%, transparent 55%, rgba(0,0,0,.5) 100%);
  box-shadow: inset 0 0 120px rgba(0,0,0,.6); }

.kr-title { position: absolute; top: 14px; left: 50%; transform: translateX(-50%); z-index: 8; font-size: 20px; font-weight: 700; letter-spacing: 4px; color: #f0e4c0; text-shadow: 0 2px 8px rgba(0,0,0,.8), 0 0 18px rgba(200,57,46,.3); }
.kr-phase { position: absolute; top: 46px; left: 50%; transform: translateX(-50%); z-index: 8; font-size: 12px; color: var(--pap-dk); letter-spacing: 1px; text-shadow: 0 1px 4px rgba(0,0,0,.9); }
.kr-sweep { position: absolute; top: 78px; left: 50%; transform: translateX(-50%); z-index: 9; font-size: 22px; font-weight: 800; color: var(--red-lt); opacity: 0; letter-spacing: 3px; text-shadow: 0 0 20px rgba(200,57,46,.8); transition: opacity .2s; }
.kr-sweep.on { opacity: 1; animation: krshake .3s ease 3; }
@keyframes krshake { 0%,100%{ transform: translateX(-50%);} 25%{ transform: translate(-52%,1px);} 75%{ transform: translate(-48%,-1px);} }

/* 扫荡决策条：兵团来袭时底部弹出——组织群众转移 / 组织抗击 */
.kr-sweepbar { position: absolute; bottom: 64px; left: 50%; transform: translateX(-50%); z-index: 12; width: min(680px, 62%);
  border: 1px solid var(--red); border-radius: 6px; background: rgba(24,16,12,.96); padding: 12px 16px 14px;
  box-shadow: 0 8px 32px rgba(0,0,0,.7), 0 0 22px rgba(200,57,46,.25); animation: krbarin .25s ease; }
@keyframes krbarin { 0%{ opacity:0; transform: translate(-50%,14px);} 100%{ opacity:1; transform: translate(-50%,0);} }
.kr-sb-head { font-size: 15px; font-weight: 800; color: var(--red-lt); letter-spacing: 1px; margin-bottom: 3px; }
.kr-sb-status { font-size: 11.5px; color: var(--pap-dk); margin-bottom: 9px; }
.kr-sb-row { display: flex; gap: 10px; align-items: stretch; }
.kr-sb-btn { font-family: inherit; cursor: pointer; border-radius: 5px; color: #f0e4c0; transition: border-color .1s, transform .06s; }
.kr-sb-btn:active { transform: scale(.97); }
.kr-sb-btn:disabled { opacity: .45; cursor: default; }
.kr-sb-btn.evac { flex: 1.15; display: flex; flex-direction: column; gap: 2px; text-align: left; padding: 9px 12px;
  border: 2px solid var(--amb); background: linear-gradient(180deg, #4a3c1a, #302510); }
.kr-sb-btn.evac:hover:not(:disabled) { border-color: #f0cf70; }
.kr-sb-btn.evac.done { border-color: var(--grn); background: linear-gradient(180deg, #35401c, #222b12); }
.kr-sb-btn.evac b { font-size: 14px; letter-spacing: 1px; }
.kr-sb-btn.evac span { font-size: 10px; color: var(--pap-dk); }
.kr-sb-commit { flex: 1; display: flex; flex-direction: column; gap: 5px; }
.kr-sb-commit-t { font-size: 11px; color: var(--pap-dk); letter-spacing: 1px; }
.kr-sb-commit-btns { display: flex; gap: 6px; flex: 1; }
.kr-sb-btn.fight { flex: 1; padding: 7px 4px; font-size: 12.5px; font-weight: 700; border: 2px solid var(--red);
  background: linear-gradient(180deg, #5a221c, #3a1610); }
.kr-sb-btn.fight:hover:not(:disabled) { border-color: var(--red-lt); }
.kr-sb-btn.fight.all { background: linear-gradient(180deg, #77281f, #4a1a12); }
.kr-sb-btn.fight.pulse { animation: krpul .35s ease; }

/* 地图区域标记 */
.kr-regions { position: absolute; inset: 0; z-index: 4; pointer-events: none; }
.kr-region { position: absolute; transform: translate(-50%,-50%); pointer-events: auto; background: none; border: none; cursor: pointer; font-family: inherit; display: flex; flex-direction: column; align-items: center; gap: 2px; }
.kr-region.hidden { display: none; }
.kr-region-dot { width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--pap-dk); background: rgba(40,36,24,.7); box-shadow: 0 0 8px rgba(0,0,0,.6); }
.kr-region.ready .kr-region-dot { border-color: var(--amb); background: rgba(216,164,65,.4); box-shadow: 0 0 14px rgba(216,164,65,.7); animation: krpulse 1.2s ease-in-out infinite; }
.kr-region.reclaimed .kr-region-dot { border-color: var(--red-lt); background: radial-gradient(circle,#e2564d,#8a1c14); box-shadow: 0 0 16px rgba(226,86,77,.9); }
@keyframes krpulse { 0%,100%{ transform: scale(1);} 50%{ transform: scale(1.35);} }
.kr-region-name { font-size: 10.5px; color: var(--pap); text-shadow: 0 1px 3px #000, 0 0 6px #000; opacity: .55; white-space: nowrap; }
.kr-region.ready .kr-region-name, .kr-region.reclaimed .kr-region-name { opacity: 1; }
.kr-region.reclaimed .kr-region-name { color: #f2c0a0; }

/* 左栏 */
.kr-left { position: absolute; top: 96px; left: 18px; bottom: 18px; width: 300px; z-index: 8; display: flex; flex-direction: column; gap: 12px; }
.kr-res { display: flex; flex-direction: column; gap: 8px; }
.kr-res-row { display: flex; align-items: center; gap: 11px; padding: 9px 13px; border: 1px solid var(--khk); border-radius: 4px; background: linear-gradient(180deg, rgba(40,36,24,.82), rgba(24,22,14,.82)); box-shadow: 0 3px 10px rgba(0,0,0,.4); }
.kr-ic { font-size: 24px; filter: sepia(.5) brightness(1.05); }
.kr-res-num { font-size: 30px; font-weight: 700; color: #f0e4c0; line-height: 1; }
.kr-res-lab { font-size: 11px; color: var(--pap-dk); margin-top: 3px; }
.kr-res-lab span { color: var(--grn); }
.kr-rally { padding: 14px; border: 2px solid var(--red); border-radius: 6px; background: linear-gradient(180deg, #5a221c, #3a1610); color: #f0e0c0; cursor: pointer; font-family: inherit; display: flex; flex-direction: column; gap: 3px; box-shadow: 0 4px 14px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,200,150,.15); transition: transform .06s; }
.kr-rally:hover { border-color: var(--red-lt); background: linear-gradient(180deg, #6a271f, #431811); }
.kr-rally:active, .kr-rally.hit { transform: scale(.98); }
.kr-rally.hit { animation: krrally .3s ease; }
@keyframes krrally { 0%{ box-shadow: 0 0 0 0 rgba(226,86,77,.6);} 100%{ box-shadow: 0 0 0 16px rgba(226,86,77,0), 0 4px 14px rgba(0,0,0,.5);} }
.kr-rally b { font-size: 17px; letter-spacing: 2px; }
.kr-rally span { font-size: 10.5px; color: var(--pap-dk); }

.kr-terminal { flex: 1; overflow-y: auto; min-height: 0; padding: 10px 12px; border: 1px solid var(--khk); border-radius: 4px; background: rgba(18,16,10,.8); font-size: 12px; line-height: 1.7; }
.kr-terminal::-webkit-scrollbar { width: 6px; } .kr-terminal::-webkit-scrollbar-thumb { background: var(--khk); }
.kr-tline { margin-bottom: 5px; color: var(--pap-dk); }
.kr-tline.era { color: #e8d29a; border-left: 2px solid var(--amb); padding-left: 8px; font-weight: 600; }
.kr-tline.win { color: #f2c0a0; border-left: 2px solid var(--red-lt); padding-left: 8px; }
.kr-tline.loss { color: var(--red-lt); }
.kr-tline.info { color: #b6c48a; }

/* 右栏商店 */
.kr-right { position: absolute; top: 96px; right: 18px; bottom: 18px; width: 320px; z-index: 8; display: flex; flex-direction: column; }
.kr-tabs { display: flex; gap: 4px; margin-bottom: 8px; }
.kr-tab { flex: 1; padding: 8px; border: 1px solid var(--khk); border-radius: 4px 4px 0 0; background: rgba(24,22,14,.7); color: var(--pap-dk); font-family: inherit; font-size: 13px; cursor: pointer; }
.kr-tab.active { border-color: var(--amb); color: #f0e4c0; background: rgba(40,36,24,.85); }
.kr-panel { flex: 1; overflow-y: auto; min-height: 0; display: flex; flex-direction: column; gap: 5px; padding-right: 3px; }
.kr-panel::-webkit-scrollbar { width: 6px; } .kr-panel::-webkit-scrollbar-thumb { background: var(--khk); }
.kr-item { text-align: left; width: 100%; padding: 8px 11px; border: 1px solid var(--khk); border-radius: 4px; background: linear-gradient(180deg, rgba(40,36,24,.7), rgba(24,22,14,.7)); color: var(--pap-dk); cursor: pointer; font-family: inherit; transition: border-color .1s, background .1s; }
.kr-item:hover { border-color: var(--pap-dk); }
.kr-item.affordable { border-color: var(--amb); background: linear-gradient(180deg, rgba(58,48,26,.8), rgba(34,28,16,.8)); }
.kr-item.affordable .kr-item-name { color: #f0e4c0; } .kr-item.affordable .kr-item-cost { color: var(--amb); }
.kr-item.maxed { opacity: .6; border-color: var(--red); }
.kr-item.maxed .kr-item-name { color: #f2c0a0; }
.kr-item.pulse { animation: krpul .35s ease; }
@keyframes krpul { 0%{ box-shadow: 0 0 0 0 rgba(216,164,65,.5);} 100%{ box-shadow: 0 0 0 10px transparent;} }
.kr-item-top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.kr-item-name { font-size: 14px; font-weight: 700; color: #d8c9a0; }
.kr-item-cost { font-size: 12px; font-weight: 700; color: var(--pap-dk); white-space: nowrap; }
.kr-item-meta { font-size: 10.5px; color: #8a8058; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.kr-fx { position: absolute; inset: 0; pointer-events: none; z-index: 10; }
.kr-float { position: absolute; transform: translateX(-50%); font-weight: 800; font-size: 18px; color: #f0e0c0; text-shadow: 0 0 12px rgba(216,164,65,.7), 0 2px 4px #000; animation: krfloat .85s ease-out forwards; font-family: inherit; }
.kr-float.big { font-size: 22px; color: #f2c0a0; text-shadow: 0 0 16px rgba(226,86,77,.9), 0 2px 4px #000; }
.kr-float.dim { font-size: 13px; font-weight: 600; color: var(--pap-dk); }
@keyframes krfloat { 0%{ opacity:0; transform: translate(-50%,0) scale(.85);} 18%{opacity:1;} 100%{ opacity:0; transform: translate(-50%,-40px) scale(1.05);} }
.kr-flash { position: absolute; transform: translate(-50%,-50%); width: 40px; height: 40px; border-radius: 50%; pointer-events: none; }
.kr-flash.win { border: 2px solid var(--red-lt); animation: krring .9s ease-out forwards; }
@keyframes krring { 0%{ opacity:.9; transform: translate(-50%,-50%) scale(.3);} 100%{ opacity:0; transform: translate(-50%,-50%) scale(4);} }

.kr-guide { position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%); z-index: 11; max-width: 56%; padding: 9px 18px; border: 1px solid var(--amb); border-radius: 4px; background: rgba(24,20,12,.95); color: #f0e4c0; font-size: 13px; box-shadow: 0 0 18px rgba(216,164,65,.2); }

.kr-debug-btn { position: absolute; top: 12px; right: 346px; width: 30px; height: 30px; border-radius: 6px; border: 1px solid var(--khk); background: rgba(24,20,12,.9); color: var(--pap-dk); font-size: 14px; cursor: pointer; z-index: 12; }
.kr-debug { position: absolute; top: 46px; right: 346px; width: 240px; z-index: 12; border: 1px solid var(--pap-dk); border-radius: 8px; background: rgba(18,16,10,.98); padding: 11px 13px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 12px 40px rgba(0,0,0,.6); font-size: 11px; color: var(--pap-dk); }
.kr-dt { letter-spacing: 3px; }
.kr-dr { display: flex; gap: 5px; align-items: center; flex-wrap: wrap; }
.kr-debug button { font-family: inherit; font-size: 11px; padding: 5px 9px; border-radius: 5px; border: 1px solid var(--khk); background: rgba(40,36,24,.6); color: var(--pap-dk); cursor: pointer; }
.kr-debug button:hover { border-color: var(--amb); color: #f0e4c0; }
.kr-debug button.active { border-color: var(--amb); color: #f0e4c0; }
.kr-debug button.danger { border-color: #6a2723; color: var(--red-lt); }
.kr-debug input { width: 74px; font-family: inherit; font-size: 11px; padding: 5px 7px; border-radius: 5px; border: 1px solid var(--khk); background: rgba(40,36,24,.6); color: #f0e4c0; }

/* v2：时期注释 / 根据地面板 / 大战役 / 结局对照屏 */
.kr-eranote { position: absolute; top: 66px; left: 50%; transform: translateX(-50%); z-index: 8; max-width: 54%; font-size: 11px; color: rgba(216,201,160,.62); letter-spacing: .5px; text-align: center; text-shadow: 0 1px 4px rgba(0,0,0,.9); }
.kr-item.locked { opacity: .45; border-style: dashed; }
.kr-item.locked .kr-item-cost { color: #8a6a5a; }
.kr-base { padding: 8px 11px; margin-bottom: 5px; border: 1px solid var(--khk); border-radius: 4px; background: linear-gradient(180deg, rgba(40,36,24,.6), rgba(24,22,14,.6)); cursor: pointer; }
.kr-base.est { border-color: rgba(200,57,46,.5); }
.kr-base.sel { border-color: var(--amb); box-shadow: 0 0 10px rgba(216,164,65,.25); }
.kr-base-head { display: flex; justify-content: space-between; align-items: baseline; }
.kr-base-name { font-size: 13.5px; font-weight: 700; color: #e8d7ae; }
.kr-base.est .kr-base-name { color: #f2b6a0; }
.kr-base-terr { font-size: 10px; color: #8a8058; }
.kr-base-stats { font-size: 10.5px; color: var(--pap-dk); margin: 3px 0 6px; line-height: 1.5; }
.kr-base-acts { display: flex; gap: 5px; flex-wrap: wrap; }
.kr-ba { font-family: inherit; font-size: 11px; padding: 4px 9px; border-radius: 4px; border: 1px solid var(--khk); background: rgba(40,36,24,.7); color: #d8c9a0; cursor: pointer; }
.kr-ba:hover:not(:disabled) { border-color: var(--amb); color: #f0e4c0; }
.kr-ba:disabled { opacity: .42; cursor: default; }
.kr-ba.est { border-color: rgba(216,164,65,.6); }
.kr-ba.spot { border-color: rgba(200,57,46,.55); color: #f2c0a0; }
.kr-ba.mig { border-color: rgba(122,143,58,.6); color: #c6d49a; }
.kr-float.big { font-size: 24px; color: #f0e4c0; letter-spacing: 3px; }
.kr-float.dim { font-size: 13px; color: #b5a575; }
.kr-ending { position: absolute; inset: 0; z-index: 30; background: rgba(6,5,3,.88); display: flex; align-items: center; justify-content: center; }
.kr-end-card { width: min(720px, 88%); max-height: 88%; overflow-y: auto; padding: 28px 34px; border: 2px solid var(--amb); border-radius: 8px; background: linear-gradient(180deg, #1c1810, #12100a); box-shadow: 0 24px 80px rgba(0,0,0,.8), 0 0 40px rgba(216,164,65,.15); text-align: center; }
.kr-end-date { font-size: 13px; color: var(--pap-dk); letter-spacing: 2px; }
.kr-end-grade { font-size: 44px; font-weight: 800; color: #f0e4c0; letter-spacing: 10px; margin: 10px 0 6px; text-shadow: 0 0 24px rgba(216,164,65,.5); }
.kr-end-desc { font-size: 13px; color: #d8c9a0; margin-bottom: 18px; line-height: 1.7; }
.kr-end-table { width: 100%; border-collapse: collapse; font-size: 11.5px; text-align: left; margin-bottom: 16px; }
.kr-end-table th { color: var(--amb); font-size: 11px; letter-spacing: 1px; padding: 6px 8px; border-bottom: 1px solid var(--khk); }
.kr-end-table td { padding: 7px 8px; border-bottom: 1px solid rgba(58,56,38,.5); color: #d8c9a0; vertical-align: top; line-height: 1.55; }
.kr-end-table td.hist { color: #9a8f68; font-size: 10.5px; }
.kr-end-foot { font-size: 11px; color: #8a8058; line-height: 1.8; margin-bottom: 16px; }
.kr-end-btn { font-family: inherit; font-size: 14px; padding: 9px 30px; border-radius: 5px; border: 1px solid var(--amb); background: linear-gradient(180deg, #5a221c, #3a1610); color: #f0e4c0; cursor: pointer; letter-spacing: 2px; }
.kr-end-btn:hover { background: linear-gradient(180deg, #6a271f, #431811); }

/* 成就 toast / 成就面板 / 文献道具 / 新手引导 */
.kr-toasts { position: absolute; right: 346px; bottom: 20px; z-index: 26; display: flex; flex-direction: column; gap: 8px; pointer-events: none; }
.kr-toast { display: flex; gap: 10px; align-items: center; padding: 10px 16px; border: 1px solid var(--amb); border-radius: 6px; background: linear-gradient(180deg, rgba(40,34,18,.97), rgba(24,20,12,.97)); box-shadow: 0 8px 30px rgba(0,0,0,.6), 0 0 18px rgba(216,164,65,.25); animation: krtoast .45s cubic-bezier(.2,1.4,.4,1); }
.kr-toast.out { transition: opacity .5s, transform .5s; opacity: 0; transform: translateY(14px); }
@keyframes krtoast { 0%{ opacity:0; transform: translateX(60px);} 100%{ opacity:1; transform: none;} }
.kr-toast-ic { font-size: 24px; }
.kr-toast-name { font-size: 14px; font-weight: 800; color: #f0e4c0; letter-spacing: 1px; }
.kr-toast-desc { font-size: 11px; color: var(--pap-dk); }
.kr-ach-head { font-size: 13px; font-weight: 700; color: var(--amb); letter-spacing: 2px; padding: 4px 2px 8px; }
.kr-ach { display: flex; gap: 9px; align-items: center; padding: 7px 10px; margin-bottom: 4px; border: 1px solid var(--khk); border-radius: 4px; background: rgba(24,22,14,.55); opacity: .55; }
.kr-ach.got { opacity: 1; border-color: rgba(216,164,65,.55); background: linear-gradient(180deg, rgba(48,40,20,.7), rgba(28,24,14,.7)); }
.kr-ach-ic { font-size: 17px; width: 24px; text-align: center; }
.kr-ach-name { font-size: 12.5px; font-weight: 700; color: #d8c9a0; }
.kr-ach.got .kr-ach-name { color: #f0e4c0; }
.kr-ach-desc { font-size: 10.5px; color: #8a8058; }
.kr-doct-btn { position: absolute; top: 96px; left: 50%; transform: translateX(-50%); z-index: 14; padding: 10px 22px; border: 1px solid var(--amb); border-radius: 6px; background: linear-gradient(180deg, #4a3a16, #2c2210); color: #f0e4c0; font-family: inherit; font-size: 14px; font-weight: 700; letter-spacing: 1px; cursor: pointer; animation: krdoct 1.6s ease-in-out infinite; }
@keyframes krdoct { 0%,100%{ box-shadow: 0 0 10px rgba(216,164,65,.35);} 50%{ box-shadow: 0 0 26px rgba(216,164,65,.75);} }
.kr-doct-btn:hover { background: linear-gradient(180deg, #5a4820, #362a14); }
.kr-doct-card { position: absolute; inset: 0; z-index: 28; background: rgba(6,5,3,.82); display: flex; align-items: center; justify-content: center; }
.kr-doct-inner { width: min(560px, 86%); padding: 30px 38px; border: 2px solid var(--amb); border-radius: 8px; background: linear-gradient(180deg, #221c10, #14100a); text-align: center; box-shadow: 0 24px 80px rgba(0,0,0,.8), 0 0 40px rgba(216,164,65,.2); }
.kr-doct-book { font-size: 44px; margin-bottom: 6px; }
.kr-doct-title { font-size: 24px; font-weight: 800; color: #f0e4c0; letter-spacing: 3px; }
.kr-doct-hist { font-size: 11px; color: var(--pap-dk); margin: 4px 0 12px; letter-spacing: 1px; }
.kr-doct-desc { font-size: 13px; color: #d8c9a0; line-height: 1.8; margin-bottom: 12px; }
.kr-doct-line { font-size: 13px; color: #e8d29a; font-style: italic; line-height: 1.8; padding: 10px 14px; border-left: 2px solid var(--amb); background: rgba(216,164,65,.06); text-align: left; margin-bottom: 14px; }
.kr-doct-fx { font-size: 14px; font-weight: 700; color: #b6d48a; margin-bottom: 18px; }
.kr-doct-close { font-family: inherit; font-size: 14px; padding: 9px 30px; border-radius: 5px; border: 1px solid var(--amb); background: linear-gradient(180deg, #5a221c, #3a1610); color: #f0e4c0; cursor: pointer; letter-spacing: 2px; }
.kr-onb { position: absolute; inset: 0; z-index: 24; pointer-events: none; }
.kr-onb-tip { position: absolute; max-width: 320px; padding: 10px 16px; border: 1px solid var(--amb); border-radius: 6px; background: rgba(28,22,12,.97); color: #f0e4c0; font-size: 13px; line-height: 1.6; box-shadow: 0 6px 24px rgba(0,0,0,.6), 0 0 16px rgba(216,164,65,.25); }
.kr-onb-tip::before { content: "☝"; margin-right: 6px; }
.kr-onb-skip { position: absolute; bottom: 14px; right: 360px; pointer-events: auto; font-family: inherit; font-size: 11px; padding: 4px 12px; border-radius: 4px; border: 1px solid var(--khk); background: rgba(24,20,12,.8); color: var(--pap-dk); cursor: pointer; }
.kr-onb-skip:hover { color: #f0e4c0; border-color: var(--amb); }
.kr-onb-glow { animation: krglow 1.3s ease-in-out infinite; position: relative; z-index: 25; }
@keyframes krglow { 0%,100%{ box-shadow: 0 0 0 2px rgba(216,164,65,.5), 0 0 18px rgba(216,164,65,.4);} 50%{ box-shadow: 0 0 0 4px rgba(216,164,65,.9), 0 0 30px rgba(216,164,65,.8);} }

/* 右上角成就按钮 + 浮层 */
.kr-ach-btn { position: absolute; top: 12px; right: 384px; width: 30px; height: 30px; border-radius: 6px; border: 1px solid var(--khk); background: rgba(24,20,12,.9); font-size: 14px; cursor: pointer; z-index: 12; padding: 0; }
.kr-ach-btn:hover { border-color: var(--amb); }
.kr-ach-badge { position: absolute; top: -6px; right: -7px; min-width: 15px; height: 15px; border-radius: 8px; background: var(--amb); color: #201808; font-size: 9.5px; font-weight: 800; line-height: 15px; text-align: center; padding: 0 3px; font-family: inherit; }
.kr-ach-pop { position: absolute; top: 48px; right: 384px; width: 300px; max-height: 72vh; overflow-y: auto; z-index: 13; border: 1px solid var(--amb); border-radius: 8px; background: rgba(14,12,8,.98); padding: 10px 12px; box-shadow: 0 14px 50px rgba(0,0,0,.7); }
.kr-ach-pop::-webkit-scrollbar { width: 6px; } .kr-ach-pop::-webkit-scrollbar-thumb { background: var(--khk); border-radius: 3px; }

/* 文献全屏直弹 + 失败结局 */
.kr-doct-pop { animation: krdoctpop .5s cubic-bezier(.2,1.5,.4,1); }
@keyframes krdoctpop { 0%{ opacity:0; transform: scale(.7) translateY(30px);} 100%{ opacity:1; transform: none;} }
.kr-doct-got { font-size: 11px; letter-spacing: 6px; color: var(--amb); margin-bottom: 8px; }
.kr-end-card.defeat { border-color: #7a2c22; box-shadow: 0 24px 80px rgba(0,0,0,.85), 0 0 46px rgba(160,40,26,.3); background: linear-gradient(180deg, #201210, #120b08); }
.kr-end-card.defeat .kr-end-grade { color: #d86a58; text-shadow: 0 0 24px rgba(200,57,46,.6); }

/* 游击出击面板 + 文献全屏 */
.kr-raids { border: 1px solid var(--khk); border-radius: 4px; background: rgba(18,16,10,.8); padding: 7px 9px; display: flex; flex-direction: column; gap: 4px; }
.kr-raids-head { font-size: 11px; letter-spacing: 1px; color: var(--pap-dk); margin-bottom: 2px; }
.kr-raids-head span { color: #f0b060; font-weight: 700; }
.kr-raid { display: flex; gap: 7px; align-items: center; width: 100%; text-align: left; padding: 5px 8px; border: 1px solid var(--khk); border-radius: 4px; background: rgba(28,24,14,.6); color: var(--pap-dk); cursor: pointer; font-family: inherit; transition: border-color .1s; }
.kr-raid.ready { border-color: rgba(226,120,60,.65); background: linear-gradient(180deg, rgba(70,42,18,.6), rgba(40,26,12,.6)); }
.kr-raid.ready .kr-raid-name { color: #f5c896; }
.kr-raid.ready .kr-raid-cd { color: #8fc06a; }
.kr-raid.cooling { opacity: .55; }
.kr-raid.pulse { animation: krpul .4s ease; }
.kr-raid-ic { font-size: 16px; }
.kr-raid-body { flex: 1; min-width: 0; }
.kr-raid-top { display: flex; justify-content: space-between; }
.kr-raid-name { font-size: 12.5px; font-weight: 700; color: #d8c9a0; }
.kr-raid-cd { font-size: 10.5px; }
.kr-raid-meta { font-size: 9.5px; color: #8a8058; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kr-doct-card { background: rgba(4,3,2,.95); }
.kr-doct-full { width: min(760px, 94%); padding: 44px 56px; }
.kr-doct-full .kr-doct-book { font-size: 64px; }
.kr-doct-full .kr-doct-title { font-size: 32px; letter-spacing: 5px; }
.kr-doct-full .kr-doct-desc { font-size: 14.5px; }
.kr-doct-full .kr-doct-line { font-size: 14.5px; }
.kr-doct-full .kr-doct-fx { font-size: 16px; }
.kr-ba.hq { border-color: rgba(216,164,65,.7); color: #f0d8a0; }

/* 整风再出发 */
.kr-prestige { padding: 9px 12px; border: 1px solid rgba(216,164,65,.7); border-radius: 5px; background: linear-gradient(180deg, #3a2e12, #241c0c); color: #f0d8a0; font-family: inherit; font-size: 13px; font-weight: 700; cursor: pointer; letter-spacing: 1px; }
.kr-prestige:hover { background: linear-gradient(180deg, #4a3a18, #2c2210); }
`;
