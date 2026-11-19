import * as THREE from 'three';
import { FrameDebugMesh } from './Script_FrameDebugMesh.mjs';
import { EnumName, Primitives, RenderStateRows, ApiCall } from './Script_FrameDebugGl.mjs';

const CSS = `
:root{color-scheme:dark}
body.edThemedSurface{--bg:#10110e;--panel:#161811;--panel2:#1c1e17;--line:var(--ed-rule-2,#393b31);--line2:var(--ed-edge,#57594b);
--text:var(--ed-text,#deddd2);--muted:var(--ed-text-3,#aaa99b);--dim:var(--ed-text-4,#989b8b);--accent:var(--ed-gold,#edca83);
--sel:linear-gradient(90deg,#3b3220,#27261a);--selLine:var(--accent);--hover:#25271e;--pass:var(--ed-text-hi,#eeeee7);
--heat:237,202,131;--good:#a7ba91;--warn:#edca83;--err:#ef9a8a;
--mono:'Cascadia Mono','JetBrains Mono',Consolas,monospace}
*{box-sizing:border-box}[hidden]{display:none!important}
html,body{height:100%}body.edThemedSurface{margin:0;background:var(--bg);color:var(--text);font:12px/1.45 var(--ui-font,system-ui);display:flex;flex-direction:column;overflow:hidden}
button,input,select{font:inherit;color:inherit;background:var(--ed-field,#10110e);border:1px solid var(--line2);border-radius:4px;padding:4px 8px;min-height:27px}
button{cursor:pointer;white-space:nowrap}button:hover:not(:disabled){background:var(--hover);border-color:var(--accent);color:var(--accent)}button:disabled{opacity:.42;cursor:default}
button.primary{background:var(--sel);border-color:#977d49;color:var(--accent);font-weight:700}button.primary:hover:not(:disabled){background:#433924}
input[type=checkbox]{min-height:0;margin:0;accent-color:var(--accent)}label{display:inline-flex;align-items:center;gap:5px}
input[type=number]{width:62px}input[type=search]{width:100%}input:focus,select:focus,button:focus-visible{outline:1px solid var(--accent);outline-offset:0}
a{color:var(--accent)}small,.muted{color:var(--muted)}.mono{font-family:var(--mono)}.spacer{flex:1}
header{display:flex;align-items:center;gap:10px;min-height:43px;padding:6px 12px;background:linear-gradient(180deg,#10110e,#090a08);border-bottom:1px solid var(--ed-rule,var(--line))}
h1{font-size:16px;margin:0;letter-spacing:.25px;color:var(--pass);font-family:var(--ed-serif,var(--ui-font,system-ui));white-space:nowrap}
.source{padding-left:10px;border-left:1px solid var(--line);color:var(--muted);white-space:nowrap}
.stats{display:flex;gap:0;flex-wrap:wrap;justify-content:flex-end}.stat{display:flex;align-items:baseline;gap:6px;padding:1px 9px;border-left:1px solid var(--line)}
.stat:first-child{border:0}.stat b{font:600 12px var(--mono);color:var(--pass)}.stat span{font-size:10px;color:var(--muted);text-transform:uppercase}
.stat.timing b{color:var(--accent)}
.dot{width:6px;height:6px;border-radius:50%;background:var(--dim);display:inline-block;margin-right:7px;flex:none}.dot.frozen,.dot.armed{background:var(--accent)}.dot.error{background:var(--err)}
.toolbar{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.bar{padding:6px 12px;background:var(--panel);border-bottom:1px solid var(--line)}
.bar input[type=range]{flex:1;min-width:80px;padding:0;border:0;accent-color:var(--accent)}.sep{width:1px;align-self:stretch;background:var(--line);margin:0 4px}
#status{padding:3px 12px;color:var(--muted);background:#0c0d0a;border-top:1px solid var(--line);display:flex;align-items:center;min-height:24px}
main{flex:1;min-height:0;display:grid;grid-template-columns:var(--aside,clamp(330px,31vw,475px)) 5px minmax(0,1fr)}
aside{display:flex;flex-direction:column;min-height:0;background:var(--bg)}
.asideHead{padding:8px 8px 0;display:flex;flex-direction:column;gap:6px;border-bottom:1px solid var(--line);background:var(--panel)}
.asideHead .toolbar button{padding:3px 6px;font-size:11px}
.legend,.row{display:grid;grid-template-columns:minmax(0,1fr) 30px 53px 57px;align-items:center}
.legend{color:var(--muted);font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;padding:4px 0 5px}.legend span{text-align:right;padding-right:6px}.legend span:first-child{text-align:left;padding-left:8px}
#splitter{cursor:col-resize;background:var(--line)}#splitter:hover,#splitter.drag{background:var(--accent)}
#events{flex:1;overflow:auto;padding:2px 0 20px;font-size:11.5px}
.row{min-height:24px;cursor:default;border-left:2px solid transparent;user-select:none}.row:hover{background:var(--hover)}
.row>span{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.row>.num{text-align:right;padding-right:6px;font:11px var(--mono);color:var(--text)}
.row .name{display:flex;align-items:center;gap:5px;padding-left:calc(4px + var(--depth,0) * 14px)}
.row .label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.row .sub{color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1 1 0;min-width:0}
.row.pass{font-weight:600;color:var(--pass)}.row.pass .label{flex:0 1 auto}
.row.pass.inside{background:var(--panel2)}.row.on{background:var(--sel)!important;border-left-color:var(--selLine);color:var(--accent)}.row.on .sub{color:var(--muted)}
.caret{width:14px;height:14px;min-height:0;padding:0;border:0;background:none;color:var(--muted);font-size:9px;line-height:14px;flex:none}.caret:hover:not(:disabled){background:none;color:#fff}
.icon{flex:none;width:16px;height:14px;border-radius:2px;font:700 9px/14px var(--mono);text-align:center;color:var(--muted);background:#d8d4c313}
.icon.draw,.icon.inst,.icon.batch,.icon.proc{color:#c2ccaa}.icon.full,.icon.blit,.icon.copy{color:var(--accent)}
.icon.group{background:none;color:var(--accent);font-size:9px}.icon.group.synthetic{color:var(--muted)}
.idx{color:var(--dim);font:10.5px var(--mono);flex:none;min-width:28px;text-align:right}
.gpu{background:linear-gradient(90deg,rgba(var(--heat),.38) var(--p,0%),transparent var(--p,0%))}
.node.closed>.kids{display:none}.empty{padding:14px;color:var(--muted)}
.right{display:flex;flex-direction:column;min-height:0;overflow:auto;background:var(--bg)}.right>*{flex-shrink:0}
.eventHead{padding:8px 12px 6px;border-bottom:1px solid var(--line);background:var(--panel)}
.titleRow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}h2{font-size:15px;margin:0;color:var(--pass);font-weight:600;overflow-wrap:anywhere}
.crumbs{color:var(--muted);font-size:11px;display:flex;flex-wrap:wrap;gap:3px;align-items:center}.crumbs button{min-height:0;padding:0 2px;border:0;background:none;color:var(--muted)}.crumbs button:hover:not(:disabled){text-decoration:underline;background:none}
.summaryLine{display:flex;gap:6px 14px;align-items:center;flex-wrap:wrap;margin-top:4px}.chips{display:flex;gap:7px 14px;flex-wrap:wrap}.chip{display:inline-flex;gap:5px;align-items:baseline;font-size:11px;white-space:nowrap}.chip b{font:600 11px var(--mono);color:var(--pass)}.chip.hot b{color:var(--accent)}
.previewBar{padding:5px 12px;border-bottom:1px solid var(--line);background:var(--panel)}
.previewBar input[type=number]{width:48px}#attachment{max-width:185px;min-width:70px}
.seg{display:inline-flex}.seg button{border-radius:0;margin-left:-1px;min-width:25px;padding:3px 6px}.seg button:first-child{border-radius:4px 0 0 4px;margin-left:0}.seg button:last-child{border-radius:0 4px 4px 0}.seg button.on{background:var(--sel);color:var(--accent);box-shadow:inset 0 -2px var(--accent)}
.preview{position:relative;container-type:size;height:clamp(200px,38vh,560px);min-height:140px;resize:vertical;background:repeating-conic-gradient(#20221b 0% 25%,#191b15 0% 50%) 0/16px 16px;border-bottom:1px solid var(--line);overflow:hidden;display:flex;align-items:center;justify-content:center}
.preview canvas{max-width:100%;max-height:100%;image-rendering:auto}.preview.zoom{overflow:auto;display:block}.preview.zoom canvas{max-width:none;max-height:none;image-rendering:pixelated}
#output{width:min(100cqw,calc(100cqh * var(--image-aspect,1)));height:auto}.preview.zoom #output{width:auto}
#mesh{display:none;touch-action:none;cursor:grab;width:100%;height:100%;object-fit:contain}
.previewInfo{position:absolute;left:8px;bottom:6px;right:8px;display:flex;gap:10px;pointer-events:none;font:11px var(--mono);color:var(--text);text-shadow:0 1px 2px #000}.previewInfo .tag{background:#080907d9;padding:2px 6px;border-radius:3px}
.error{color:var(--err);padding:0 16px}.error:not(:empty){padding:6px 16px}
#properties{padding:0 0 8px}
details.fold{border-bottom:1px solid var(--line);background:var(--panel)}details.fold>summary{cursor:pointer;padding:6px 12px;font-weight:600;color:var(--text);display:flex;align-items:center;gap:8px;list-style:none;user-select:none}
details.fold>summary:hover{background:var(--hover)}
details.fold>summary::before{content:'▸';color:var(--muted);font-size:10px;width:10px}details.fold[open]>summary::before{content:'▾'}details.fold>summary::-webkit-details-marker{display:none}
details.fold>summary .count{font:10.5px var(--mono);color:var(--muted);font-weight:400}details.fold>summary .tools{margin-left:auto;display:flex;gap:6px;font-weight:400}
.foldBody{padding:4px 10px 10px;border-top:1px solid var(--line);background:var(--bg);overflow:auto}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr));gap:7px;padding-top:5px}
.card{border:1px solid var(--line);border-radius:3px;background:var(--panel);min-width:0;overflow:auto}.card h3{margin:0;padding:4px 8px;font-size:11px;letter-spacing:.35px;text-transform:uppercase;color:var(--accent);border-bottom:1px solid var(--line);background:var(--panel2)}
dl.kv{display:grid;grid-template-columns:max-content minmax(0,1fr);margin:0;padding:5px 9px;column-gap:14px;row-gap:3px}dl.kv dt{color:var(--muted);white-space:nowrap}dl.kv dd{margin:0;font-family:var(--mono);font-size:11.5px;overflow-wrap:anywhere;min-width:0}
.off{color:var(--dim)}.on-val{color:var(--good)}.hint{color:var(--dim);font-family:system-ui,sans-serif;font-size:11px;margin-left:6px}
table{width:100%;border-collapse:collapse;font:11px/1.45 var(--mono)}th{position:sticky;top:0;text-align:left;color:var(--muted);font:600 10.5px var(--ui-font,system-ui);text-transform:uppercase;letter-spacing:.3px;background:var(--panel2);padding:4px 7px;border-bottom:1px solid var(--line2)}
td{padding:3px 7px;border-bottom:1px solid var(--line);vertical-align:top;overflow-wrap:anywhere}tr:hover td{background:var(--hover)}td.k{color:var(--text);white-space:nowrap}td.t{color:var(--dim);white-space:nowrap}
h4{margin:6px 0 4px;font-size:11px;color:var(--accent);text-transform:uppercase;letter-spacing:.4px;display:flex;gap:6px;align-items:baseline}h4 .count{color:var(--dim);font-weight:400}
.thumbButton{padding:0;border:0;cursor:zoom-in}.thumb{width:44px;height:44px;border:1px solid var(--line2);background:repeating-conic-gradient(var(--panel2) 0% 25%,var(--panel) 0% 50%) 0/8px 8px;display:block;object-fit:contain}.thumb.none{display:flex;align-items:center;justify-content:center;color:var(--dim)}
.swatch{display:inline-block;width:11px;height:11px;border:1px solid #0008;border-radius:2px;vertical-align:-1px;margin-right:5px}
.matrix{display:grid;gap:0 10px;font:11px var(--mono)}.matrix span{text-align:right}
.keywords{display:flex;flex-wrap:wrap;gap:4px;padding:4px 0}.kw{font:11px var(--mono);padding:1px 6px;border-radius:3px;background:var(--panel2);border:1px solid var(--line2);color:var(--text)}.kw i{font-style:normal;color:var(--muted)}.kw.v{border-color:#61744b}.kw.f{border-color:#806b47}
.code{display:grid;grid-template-columns:max-content minmax(0,1fr);font:11px/1.5 var(--mono);max-height:520px;overflow:auto;background:#0d0e0a;border:1px solid var(--line);border-radius:4px}
.code .ln{color:var(--dim);text-align:right;padding:0 8px;user-select:none;border-right:1px solid var(--line);white-space:pre}.code .src{white-space:pre;padding:0 10px;color:var(--text)}
.code .pp{color:var(--accent)}.code .cm{color:var(--muted)}
.filter{width:220px;min-height:22px;padding:2px 7px}
pre.json{white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.5 var(--mono);margin:0;max-height:480px;overflow:auto}
.fold.emptyFold>summary{color:var(--dim);cursor:default}.fold.emptyFold>summary:hover{background:none}
@media(max-width:900px){main{grid-template-columns:var(--aside,290px) 5px minmax(0,1fr)}.stats .stat.memory,.source{display:none}}
@media(max-width:650px){main{grid-template-columns:minmax(180px,40%) 4px minmax(0,1fr)}.legend,.row{grid-template-columns:minmax(0,1fr) 48px}.row>.num:nth-child(2),.row>.num:nth-child(3),.legend>span:nth-child(2),.legend>span:nth-child(3){display:none}}`;

const Ms = value => value == null ? '—' : value < 0.001 ? '<.001' : value.toFixed(3);
const Count = value => value == null ? '—' : Number(value).toLocaleString('en-US');
const Num = value => {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value !== 'number') return String(value);
  if (Number.isInteger(value)) return String(value);
  const abs = Math.abs(value);
  return abs >= 1e5 || abs < 1e-4 ? value.toExponential(3) : value.toFixed(abs >= 100 ? 2 : 4).replace(/\.?0+$/, '');
};
// FLOAT_VEC3 → vec3, UNSIGNED_INT_SAMPLER_2D → usampler2D: what the shader source says.
const GlslType = type => {
  const text = String(type), sampler = text.match(/^(INT_|UNSIGNED_INT_)?SAMPLER_(.+)$/);
  if (sampler) return `${sampler[1] === 'INT_' ? 'i' : sampler[1] ? 'u' : ''}sampler${sampler[2].split('_').map(part => ({ SHADOW: 'Shadow', CUBE: 'Cube', ARRAY: 'Array' })[part] || part).join('')}`;
  const match = text.match(/^(FLOAT|INT|UNSIGNED_INT|BOOL)(?:_(VEC|MAT)(\w+))?$/);
  if (!match) return text;
  if (!match[2]) return { FLOAT: 'float', INT: 'int', UNSIGNED_INT: 'uint', BOOL: 'bool' }[match[1]];
  return match[2] === 'MAT' ? `mat${match[3]}` : `${{ FLOAT: '', INT: 'i', UNSIGNED_INT: 'u', BOOL: 'b' }[match[1]]}vec${match[3]}`;
};
const THREE_NAMES = { format: new Map(), type: new Map(), blending: new Map() };
for (const [key, value] of Object.entries(THREE)) {
  if (typeof value !== 'number') continue;
  if (/Format$/.test(key)) THREE_NAMES.format.set(value, key.replace(/_?Format$/, ''));
  else if (/^(Unsigned|Byte|Short|Int|Float|HalfFloat)\w*Type$/.test(key)) THREE_NAMES.type.set(value, key.replace(/Type$/, ''));
  else if (/Blending$/.test(key) && value <= 6) THREE_NAMES.blending.set(value, key.replace(/Blending$/, ''));
}
const ICONS = { 'Draw Mesh': ['draw', 'D'], 'Draw Mesh Instanced': ['inst', 'I'], 'Draw Batched': ['batch', 'B'], 'Draw Fullscreen': ['full', 'F'],
  'Draw Procedural': ['proc', 'P'], Canvas2D: ['full', '2D'], Clear: ['clear', 'C'], Blit: ['blit', '⇢'], 'Generate Mips': ['copy', 'M'], 'Copy Texture': ['copy', 'T'] };

export class FrameDebuggerEditor {
  static id = 'frameDebugger';
  static label = 'Frame Debugger';
  static hint = '独立窗口：冻结一帧、逐 DC / Pass 回放、CPU / GPU 耗时、渲染靶 / 网格 / Shader 检查';
  static keepOnClose = true;
  constructor(host, popup = null) {
    this.host = host; this.debugger = host.game.FrameDebugger; this.win = popup; this.mesh = null; this.lastRevision = -1; this.captureId = null;
    this.treeKey = ''; this.filter = ''; this.sort = 'order'; this.channel = 'rgba'; this.open = new Set(); this.folds = new Map();
    this.selectedPass = null; this.textureView = null; this.view = 'output';
  }
  Enter() {
    this.win ??= window.open('', this.debugger.windowName, 'width=1440,height=980,menubar=no,toolbar=no');
    if (!this.win) throw new Error('Frame Debugger 独立窗口被浏览器拦截，请允许弹窗后重试');
    const doc = this.win.document; this.doc = doc;
    doc.open(); doc.write('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>台儿庄 · Frame Debugger</title></head><body></body></html>'); doc.close();
    doc.body.className = 'edThemedSurface';
    for (const source of document.querySelectorAll('link[data-interface-theme],link[href*="Style_Editor.css"]')) {
      const theme = doc.createElement('link'); theme.rel = 'stylesheet'; theme.href = source.href; doc.head.append(theme);
    }
    const style = doc.createElement('style'); style.textContent = CSS; doc.head.append(style);
    doc.body.innerHTML = `<header><h1>Frame Debugger</h1><span class="source">台儿庄 1938</span><span class="spacer"></span><div id="stats" class="stats"></div></header>
      <div class="toolbar bar"><button id="capture" class="primary" aria-label="捕获当前帧">捕获当前帧</button><button id="resume">继续运行</button>
        <select id="target" aria-label="捕获目标"><option>当前游戏</option></select><span class="sep"></span>
        <button id="previous" title="上一事件 (←，Shift ×10)">◀</button><input id="scrubber" aria-label="渲染事件" type="range" min="0" max="0" value="0"><button id="next" title="下一事件 (→，Shift ×10)">▶</button>
        <input id="index" aria-label="事件编号" type="number" min="1" value="1"><span id="count" class="muted">/ 0</span><span class="sep"></span><button id="save">导出报告</button></div>
      <main><aside><div class="asideHead"><input id="search" type="search" aria-label="搜索渲染事件" placeholder="搜索事件" title="Pass、对象、材质、Shader、#编号">
        <div class="toolbar"><select id="sort" aria-label="排序"><option value="order">事件顺序</option><option value="gpu">GPU 最耗时</option><option value="cpu">CPU 最耗时</option></select>
        <button id="expand" title="展开全部">展开全部</button><button id="collapse" title="折叠全部">折叠全部</button><span class="spacer"></span><small id="treeInfo"></small></div>
        <div class="legend"><span>事件层级</span><span>DC</span><span>CPU ms</span><span id="gpuColumn">GPU ms</span></div></div><div id="events" role="tree"></div></aside>
      <div id="splitter" title="拖动调整宽度"></div>
      <section id="right" class="right"><div class="eventHead"><div class="titleRow"><h2 id="selected">尚未捕获</h2><span class="spacer"></span>
          <label><input id="syncView" type="checkbox" checked> 同步游戏画面</label><button id="locate" title="在控制台定位源对象">定位对象</button></div>
        <div class="summaryLine"><div id="crumbs" class="crumbs"></div><div id="chips" class="chips"></div></div></div>
      <div class="toolbar previewBar"><span id="viewModes" class="seg" role="group" aria-label="预览模式"></span>
        <select id="attachment" aria-label="渲染目标附件"></select><span id="channel" class="seg" role="group" aria-label="颜色通道"></span>
        <label>Levels <input id="black" type="number" value="0" step=".01" title="黑场" aria-label="黑场"> – <input id="white" type="number" value="1" step=".01" title="白场" aria-label="白场"></label><label>EV <input id="exposure" type="number" value="0" step=".5" aria-label="曝光"></label>
        <span class="spacer"></span><button id="zoom" title="适应窗口 / 快照像素">1:1</button><button id="png">保存 PNG</button></div>
      <div id="meshControls" class="toolbar previewBar" hidden><select id="meshMode" aria-label="网格模式"><option value="shaded">着色</option><option value="uvChecker">UV 棋盘</option><option value="uvLayout">UV 展开</option><option value="vertexColor">顶点色</option><option value="normals">法线</option><option value="tangents">切线</option><option value="blendshapes">形变</option></select><label><input id="wireframe" type="checkbox"> 线框</label><label>形变 <input id="morph" type="range" min="0" max="1" step=".01" value="1"></label></div>
      <div id="preview" class="preview"><canvas id="output"></canvas><canvas id="mesh"></canvas><div class="previewInfo"><span id="previewLabel" class="tag" hidden></span><span class="spacer"></span><span id="pixel" class="tag" hidden></span></div></div>
      <div id="previewError" class="error"></div><div id="properties"></div>
      </section></main><footer id="status" role="status"><span id="stateDot" class="dot"></span><span id="statusText"></span></footer>`;
    this.ui = Object.fromEntries([...doc.querySelectorAll('[id]')].map(el => [el.id, el]));
    const ui = this.ui;
    if (this.host.preview) {
      doc.title = 'Encounter Designer 编辑器预览 · Frame Debugger';
      doc.querySelector('.source').textContent = 'Encounter Designer';
      ui.target.options[0].textContent = '可见编辑器视口';
      ui.gpuColumn.textContent = 'GPU ms ≈'; ui.gpuColumn.title = '逐命令 GPU 查询';
      ui.resume.textContent = '清除捕获';
      ui.syncView.closest('label').hidden = true; ui.syncView.checked = false;
      ui.locate.hidden = true;
    }
    for (const [value, label] of [['output', '输出'], ['mesh', '网格'], ['texture', '纹理']]) {
      const button = this.El('button', label); button.dataset.value = value;
      button.onclick = () => { this.view = value; this.DrawPreview(); };
      ui.viewModes.append(button);
    }
    for (const [value, text] of [['rgba', 'RGBA'], ['rgb', 'RGB'], ['r', 'R'], ['g', 'G'], ['b', 'B'], ['a', 'A']]) {
      const button = this.El('button', text); button.dataset.value = value;
      button.onclick = () => { this.channel = value; this.DrawPreview(); };
      ui.channel.append(button);
    }
    ui.capture.onclick = () => {
      if (this.host.preview) this.debugger.RequestCapture(ui.target.selectedIndex > 0 ? Number(ui.target.value) : null);
      else this.debugger.RequestCapture();
      this.Update();
    };
    ui.resume.onclick = () => { this.debugger.Resume(); this.Update(); };
    ui.previous.onclick = () => this.Select(this.debugger.selected - 1);
    ui.next.onclick = () => this.Select(this.debugger.selected + 1);
    ui.scrubber.oninput = () => this.Select(Number(ui.scrubber.value));
    ui.index.onchange = () => this.Select(Number(ui.index.value) - 1);
    ui.search.oninput = () => { this.filter = ui.search.value.trim().toLowerCase(); this.BuildTree(); };
    ui.sort.onchange = () => { this.sort = ui.sort.value; this.BuildTree(); };
    ui.expand.onclick = () => { for (const pass of this.debugger.capture?.passes || []) this.open.add(pass.path); this.BuildTree(); };
    ui.collapse.onclick = () => { this.open.clear(); this.BuildTree(); };
    ui.events.onclick = event => this.TreeClick(event);
    ui.events.ondblclick = event => { const node = event.target.closest('.row.pass')?.parentElement; if (node) this.Toggle(node); };
    for (const id of ['attachment', 'black', 'white', 'exposure', 'meshMode', 'wireframe', 'morph']) ui[id].onchange = () => this.DrawPreview();
    ui.syncView.onchange = () => { if (!ui.syncView.checked) this.debugger.Present(); else this.DrawPreview(); };
    ui.zoom.onclick = () => { ui.zoom.textContent = ui.preview.classList.toggle('zoom') ? '适应' : '1:1'; };
    ui.save.onclick = () => this.Download(new Blob([JSON.stringify(this.debugger.Inspect(), null, 2)], { type: 'application/json' }), `FrameCapture_${this.debugger.capture?.id || 0}.json`);
    ui.png.onclick = () => (this.view === 'mesh' ? ui.mesh : ui.output).toBlob(blob => { if (blob) this.Download(blob, `FrameCapture_Event${this.debugger.selected + 1}.png`); });
    ui.locate.onclick = () => this.Locate();
    ui.output.onmousemove = event => this.Pixel(event);
    ui.output.onmouseleave = () => { ui.pixel.hidden = true; };
    ui.output.onclick = event => this.PixelHistoryAt(event);
    if (!this.host.preview) ui.output.title = '单击查看像素历史';
    ui.splitter.onpointerdown = event => {
      ui.splitter.setPointerCapture(event.pointerId); ui.splitter.classList.add('drag');
      ui.splitter.onpointermove = move => doc.body.style.setProperty('--aside', `${Math.max(240, Math.min(this.win.innerWidth - 420, move.clientX))}px`);
      ui.splitter.onpointerup = () => { ui.splitter.onpointermove = null; ui.splitter.classList.remove('drag'); };
    };
    doc.addEventListener('keydown', event => {
      if (/INPUT|SELECT|TEXTAREA/.test(event.target.tagName) && event.target.type !== 'range') return;
      const delta = event.shiftKey ? 10 : 1;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') this.Select(this.debugger.selected - delta);
      else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') this.Select(this.debugger.selected + delta);
      else if (event.key === 'Home') this.Select(0);
      else if (event.key === 'End') this.Select(this.debugger._events.length - 1);
      else if (event.key === 'Escape') { this.debugger.Resume(); this.Update(); }
      else if (event.key === 'f' && event.ctrlKey) ui.search.focus();
      else return;
      event.preventDefault();
    });
    this.timer = setInterval(() => this.Update(), 100);
    this.Update(); return this;
  }
  El(tag, text = '', className = '') { const el = this.doc.createElement(tag); if (text !== '') el.textContent = text; if (className) el.className = className; return el; }
  Stat(label, value, title = '', type = '') { const box = this.El('div', '', `stat ${type}`); box.append(this.El('span', label), this.El('b', value)); if (title) box.title = title; return box; }
  Update() {
    if (!this.win || this.win.closed) { this.host.CloseFrameDebugger(); return; }
    this.debugger.Poll();
    if (this.host.preview && this.host.CaptureTargets) {
      const targets = this.host.CaptureTargets(), key = JSON.stringify(targets);
      if (key !== this.targetKey) {
        this.targetKey = key;
        const value = this.ui.target.value;
        this.ui.target.options.length = 1;
        for (const [id, name] of targets) {
          const option = this.El('option', name); option.value = id; this.ui.target.append(option);
        }
        this.ui.target.value = targets.some(([id]) => String(id) === value) ? value : this.ui.target.options[0].value;
      }
    }
    if (this.lastRevision === this.debugger.revision) return;
    this.lastRevision = this.debugger.revision;
    const capture = this.debugger.capture, ui = this.ui, ready = this.debugger.frozen;
    for (const id of ['save', 'previous', 'next', 'scrubber', 'index', 'png', 'locate']) ui[id].disabled = !ready;
    ui.resume.disabled = !ready && this.debugger.state !== 'armed';
    ui.capture.disabled = this.debugger.state === 'armed' || this.debugger.state === 'capturing';
    ui.capture.textContent = ready ? '重新捕获' : '捕获当前帧';
    ui.stateDot.className = `dot ${ready ? 'frozen' : this.debugger.state === 'armed' || this.debugger.state === 'capturing' ? 'armed' : this.debugger.state === 'error' ? 'error' : 'live'}`;
    if (!capture || !ready) {
      ui.statusText.textContent = this.debugger.error || (ui.capture.disabled ? '正在捕获…' : '就绪');
      if (!capture) {
        ui.events.replaceChildren(this.El('div', '尚未捕获', 'empty'));
        ui.properties.replaceChildren(); ui.selected.textContent = '尚未捕获'; ui.crumbs.replaceChildren(); ui.chips.replaceChildren(); ui.stats.replaceChildren();
        ui.treeInfo.textContent = ''; ui.previewLabel.hidden = ui.pixel.hidden = true; ui.previewError.textContent = '';
        ui.attachment.replaceChildren(); ui.attachment.disabled = ui.zoom.disabled = true; ui.count.textContent = '/ 0';
        ui.scrubber.max = ui.scrubber.value = '0'; ui.index.value = '1'; ui.meshControls.hidden = true;
        ui.mesh.style.display = 'none'; ui.output.style.display = ''; ui.output.width = ui.output.height = 1;
        this.view = 'output'; this.textureView = null;
        this.mesh?.Clear(); this.UpdatePreviewModes(null);
      }
      this.captureId = null; this.treeKey = ''; return;
    }
    const statuses = { ready: 'GPU 就绪', pending: 'GPU 查询中', unavailable: 'GPU 不可用', disjoint: 'GPU 时钟失效', timeout: 'GPU 查询超时' };
    const draws = capture.events.filter(event => event.draw).length;
    const target = this.host.preview ? `${capture.passes.filter(pass => pass.viewport).length} 个视口`
      : `${capture.width}×${capture.height} · ${Count(capture.commandCount)} 条 GL 命令`;
    ui.statusText.textContent = `帧 #${capture.id} · ${target} · ${statuses[capture.gpuStatus]}`;
    const gpuLabel = this.host.preview ? 'GPU ms ≈' : 'GPU ms';
    const gpuTitle = this.host.preview ? '逐命令 GPU 查询；不含命令间的 GPU 工作。' : '冻结帧独立回放的 GPU 时间。';
    ui.stats.replaceChildren(this.Stat('DC', Count(draws)), this.Stat('事件', Count(capture.events.length)), this.Stat('CPU ms', Ms(capture.cpuMs)),
      this.Stat(gpuLabel, Ms(capture.gpuMs), gpuTitle, 'timing'), this.Stat('捕获内存', `${(capture.bytes / 1048576).toFixed(1)} MiB`, '', 'memory'));
    const key = `${capture.id}:${capture.gpuStatus}`;
    if (key !== this.treeKey) {
      const firstView = this.host.preview ? capture.passes.find(pass => pass.viewport) : null;
      if (firstView && !this.hasCaptured) {
        this.open.add(firstView.path);
        for (const pass of capture.passes) if (pass.parent === firstView.id && pass.name === '主场景') this.open.add(pass.path);
        this.hasCaptured = true;
      }
      this.treeKey = key; this.BuildTree();
      if (this.captureId !== capture.id) {
        this.captureId = capture.id; this.selectedPass = null; this.textureView = null; this.pixelHistory = null;
        this.Select(firstView?.last ?? capture.events.length - 1, firstView?.id ?? null);
      }
      else { const event = this.debugger._events[this.debugger.selected]; this.Header(event); if (event) this.Properties(event); }
    }
  }
  // ---------------------------------------------------------------- tree
  Match(event) {
    if (!this.filter) return true;
    const d = event.details || {};
    return `#${event.index + 1} ${event.kind} ${event.label} ${event.path} ${event.target} ${event.phase || ''} ${d.material || ''} ${d.shader || ''} ${event.shaderName || ''} ${d.geometry || ''} ${d.path || ''}`.toLowerCase().includes(this.filter);
  }
  EventRow(event, depth, flat = false) {
    const row = this.El('div', '', 'row ev'); row.dataset.event = event.index; row.style.setProperty('--depth', depth);
    const [iconClass, glyph] = ICONS[event.kind] || ['draw', '?'];
    const name = this.El('span', '', 'name'), icon = this.El('span', glyph, `icon ${iconClass}`); icon.title = event.kind;
    const d = event.details;
    name.append(this.El('span', '', 'caret'), icon, this.El('span', String(event.index + 1), 'idx'), this.El('span', event.label || event.kind, 'label'),
      this.El('span', flat ? event.path : d?.material || (this.host.preview ? '' : event.target), 'sub'));
    const gpu = this.El('span', Ms(event.gpuMs), 'num gpu'); gpu.style.setProperty('--p', `${Math.min(100, (event.gpuMs || 0) / this.maxEventGpu * 100)}%`);
    row.append(name, this.El('span', event.draw ? '1' : '', 'num'), this.El('span', Ms(event.cpuMs), 'num'), gpu);
    row.title = `#${event.index + 1} ${event.kind} ${event.label}\n${event.path} → ${event.target}${d ? `\n${d.path}\n材质 ${d.material} · ${event.shaderName || d.shader}` : ''}`;
    if (event.index === this.debugger.selected && this.selectedPass == null) row.classList.add('on');
    return row;
  }
  PassNode(pass, depth, filtered) {
    const node = this.El('div', '', 'node'); node.dataset.pass = pass.id; node.dataset.path = pass.path;
    const row = this.El('div', '', 'row pass'); row.style.setProperty('--depth', depth);
    const name = this.El('span', '', 'name'), caret = this.El('button', '▾', 'caret'); caret.tabIndex = -1; caret.dataset.toggle = '1';
    const icon = this.El('span', '◆', `icon group${pass.synthetic ? ' synthetic' : ''}`);
    icon.title = pass.viewport ? '视口' : pass.synthetic ? '捕获器归并的分组' : '游戏 Pass';
    name.append(caret, icon, this.El('span', pass.name, 'label'));
    const total = this.debugger.capture.gpuMs, gpu = this.El('span', Ms(pass.gpuMs), 'num gpu');
    gpu.style.setProperty('--p', `${total ? Math.min(100, (pass.gpuMs || 0) / total * 100) : 0}%`);
    row.append(name, this.El('span', Count(pass.draws), 'num'), this.El('span', Ms(pass.cpuMs), 'num'), gpu);
    row.title = `${pass.path}\n事件 #${pass.first + 1} – #${pass.last + 1} · ${pass.draws} DC${total && pass.gpuMs != null ? ` · 占 GPU 帧 ${(pass.gpuMs / total * 100).toFixed(1)}%` : ''}\n单击：看此组结束时的画面 · 双击 / ▾：展开折叠`;
    if (!filtered && !this.open.has(pass.path)) { node.classList.add('closed'); caret.textContent = '▸'; }
    if (this.selectedPass === pass.id) row.classList.add('on');
    const kids = this.El('div', '', 'kids'); node.append(row, kids);
    return node;
  }
  BuildTree() {
    const capture = this.debugger.capture; if (!capture || !this.debugger.frozen) return;
    const root = this.ui.events, scroll = root.scrollTop, fragment = this.doc.createDocumentFragment();
    this.maxEventGpu = Math.max(1e-6, ...capture.events.map(event => event.gpuMs || 0));
    let shown = 0;
    if (this.sort !== 'order' && !capture.passes.some(pass => pass.viewport)) {
      const key = `${this.sort}Ms`;
      for (const event of [...capture.events].filter(event => this.Match(event)).sort((a, b) => (b[key] ?? -1) - (a[key] ?? -1))) { fragment.append(this.EventRow(event, 0, true)); shown++; }
    } else {
      const passes = capture.passes, children = new Map();
      for (const pass of passes) if (pass.last >= pass.first) (children.get(pass.parent) || children.set(pass.parent, []).get(pass.parent)).push({ at: pass.first, pass });
      for (const event of capture.events) (children.get(`e${event.pass}`) || children.set(`e${event.pass}`, []).get(`e${event.pass}`)).push({ at: event.index, event });
      const Visible = new Map();
      const Has = pass => {
        if (Visible.has(pass.id)) return Visible.get(pass.id);
        const value = !this.filter || pass.name.toLowerCase().includes(this.filter) || (children.get(`e${pass.id}`) || []).some(item => this.Match(item.event)) || (children.get(pass.id) || []).some(item => Has(item.pass));
        Visible.set(pass.id, value); return value;
      };
      const Add = (parentId, container, depth, forced, viewport = false) => {
        const sortKey = viewport && this.sort !== 'order' ? `${this.sort}Ms` : null;
        const items = [...(children.get(parentId) || []), ...(children.get(`e${parentId}`) || [])].sort((left, right) =>
          (sortKey ? ((right.pass || right.event)[sortKey] ?? -1) - ((left.pass || left.event)[sortKey] ?? -1) : 0)
          || left.at - right.at || (left.pass ? -1 : 1));
        for (const item of items) {
          if (item.pass) {
            const passMatch = this.filter && item.pass.name.toLowerCase().includes(this.filter);
            if (!forced && !Has(item.pass)) continue;
            const node = this.PassNode(item.pass, depth, !!this.filter); container.append(node);
            Add(item.pass.id, node.lastChild, depth + 1, forced || passMatch, viewport || !!item.pass.viewport);
          } else if (forced || this.Match(item.event)) { container.append(this.EventRow(item.event, depth)); shown++; }
        }
      };
      Add(null, fragment, 0, false);
    }
    root.replaceChildren(fragment);
    if (!shown && !root.childElementCount) root.append(this.El('div', '没有匹配的事件', 'empty'));
    this.ui.treeInfo.textContent = this.filter ? `${shown} 项匹配` : '';
    root.scrollTop = scroll;
    this.MarkSelection(false);
  }
  Toggle(node, open = node.classList.contains('closed')) {
    node.classList.toggle('closed', !open); node.querySelector(':scope>.row .caret').textContent = open ? '▾' : '▸';
    if (open) this.open.add(node.dataset.path); else this.open.delete(node.dataset.path);
  }
  TreeClick(event) {
    const row = event.target.closest('.row'); if (!row) return;
    if (row.classList.contains('pass')) {
      const node = row.parentElement;
      if (event.target.dataset.toggle) { this.Toggle(node); return; }
      const pass = this.debugger.capture.passes[Number(node.dataset.pass)];
      this.Select(pass.last, pass.id);
    } else this.Select(Number(row.dataset.event));
  }
  MarkSelection(scroll = true) {
    const root = this.ui.events, index = this.debugger.selected;
    root.querySelectorAll('.row.on,.row.inside').forEach(el => el.classList.remove('on', 'inside'));
    let row = this.selectedPass != null ? root.querySelector(`.node[data-pass="${this.selectedPass}"]>.row`) : root.querySelector(`[data-event="${index}"]`);
    const event = this.debugger._events[index];
    if ((this.sort === 'order' || this.debugger.capture.passes.some(pass => pass.viewport)) && event) {
      // Open the chain down to the selection (Unity keeps the selected event visible).
      const chain = [];
      for (let id = this.selectedPass != null ? this.debugger.capture.passes[this.selectedPass].parent : event.pass; id != null; id = this.debugger.capture.passes[id].parent) chain.push(id);
      for (const id of chain) { const node = root.querySelector(`.node[data-pass="${id}"]`); if (node) { if (node.classList.contains('closed')) this.Toggle(node, true); node.firstChild.classList.add('inside'); } }
      row ??= root.querySelector(`[data-event="${index}"]`);
    }
    row?.classList.add('on');
    if (scroll) row?.scrollIntoView({ block: 'nearest' });
  }
  // ---------------------------------------------------------------- selection
  Select(index, passId = null) {
    if (!this.debugger.frozen) return;
    this.debugger.selected = Math.max(0, Math.min(index, this.debugger._events.length - 1));
    this.selectedPass = passId;
    const event = this.debugger._events[this.debugger.selected]; if (!event) return;
    const ui = this.ui;
    ui.scrubber.max = this.debugger._events.length - 1; ui.scrubber.value = event.index;
    ui.index.max = this.debugger._events.length; ui.index.value = event.index + 1; ui.count.textContent = `/ ${this.debugger._events.length}`;
    ui.previous.disabled = event.index === 0; ui.next.disabled = event.index === this.debugger._events.length - 1;
    const previous = ui.attachment.selectedOptions[0]?.dataset.name;
    ui.attachment.replaceChildren();
    event._target.attachments.forEach((attachment, i) => {
      const option = this.El('option', `${attachment.name} · ${EnumName(this.debugger.gl, attachment.format)} · ${attachment.width}×${attachment.height}`);
      option.value = i; option.dataset.name = attachment.name; option.disabled = attachment.stencil; ui.attachment.append(option);
    });
    const matching = event._target.attachments.findIndex(attachment => attachment.name === previous && !attachment.stencil);
    if (this.host.preview && event.kind === 'Clear') ui.attachment.value = event._target.defaultAttachment;
    else if (matching >= 0) ui.attachment.value = matching;
    const hasMesh = !!(event._object || event._geometry);
    if (this.textureView?.index !== event.index) this.textureView = null;
    if (this.view === 'texture' && !this.textureView) this.view = 'output';
    if ((!hasMesh || passId != null) && this.view === 'mesh') this.view = 'output';
    const attributes = event._object?.geometry.attributes || {};
    for (const [mode, enabled] of Object.entries({ uvChecker: !!attributes.uv, uvLayout: !!attributes.uv,
      vertexColor: !!attributes.color || event._geometry?.stride >= 6, normals: !!attributes.normal || !!event._geometry, tangents: !!attributes.tangent,
      blendshapes: !!event._object?.object.morphTargetInfluences?.length })) ui.meshMode.querySelector(`[value=${mode}]`).disabled = !enabled;
    if (ui.meshMode.selectedOptions[0]?.disabled) ui.meshMode.value = 'shaded';
    this.MarkSelection(); this.Header(event); this.DrawPreview(); this.Properties(event);
  }
  Header(event) {
    if (!event) return;
    const ui = this.ui, capture = this.debugger.capture, pass = this.selectedPass != null ? capture.passes[this.selectedPass] : null;
    ui.selected.textContent = pass ? pass.name : `#${event.index + 1} · ${event.draw ? event.label : `${event.kind} ${event.label}`}`.trim();
    ui.crumbs.replaceChildren();
    const chain = [];
    for (let id = pass ? pass.parent : event.pass; id != null; id = capture.passes[id].parent) chain.unshift(capture.passes[id]);
    chain.forEach((row, i) => {
      if (i) ui.crumbs.append(this.El('span', '›'));
      const button = this.El('button', row.name); button.title = `选中 ${row.path}（跳到其最后一个事件）`; button.onclick = () => this.Select(row.last, row.id); ui.crumbs.append(button);
    });
    if (chain.length) ui.crumbs.append(this.El('span', '→'));
    ui.crumbs.append(this.El('span', event.target));
    const Chip = (label, value, hot = false) => { const chip = this.El('span', '', `chip${hot ? ' hot' : ''}`); chip.append(this.El('span', label, 'muted'), this.El('b', value)); return chip; };
    const target = pass || event, share = capture.gpuMs && target.gpuMs != null ? target.gpuMs / capture.gpuMs : 0;
    ui.chips.replaceChildren(Chip(this.host.preview ? 'GPU ≈' : 'GPU', `${Ms(target.gpuMs)} ms${share ? ` · ${(share * 100).toFixed(1)}%` : ''}`, share > 0.05), Chip('CPU', `${Ms(target.cpuMs)} ms`));
    if (pass) ui.chips.append(Chip('DC', Count(pass.draws)), Chip('事件', `#${pass.first + 1} – #${pass.last + 1}`));
    else {
      const info = event.drawInfo;
      if (info) {
        ui.chips.append(Chip(info.topology === 'TRIANGLES' ? 'Triangles' : 'Primitives', Count(Primitives(info))));
        const instances = info.parts.reduce((sum, part) => sum + part.instances, 0);
        if (instances > info.parts.length) ui.chips.append(Chip('Instances', Count(instances)));
        if (info.batch) ui.chips.append(Chip('Sub-draws', Count(info.subDraws)));
      }
      if (event.shaderName || event.details?.shader) ui.chips.append(Chip('Shader', event.shaderName || event.details.shader));
      if (event.batchCause) ui.chips.append(Chip('Batch', event.batchCause));
    }
  }
  Locate() {
    const event = this.debugger._events[this.debugger.selected], ref = event?._object;
    if (!ref) { this.ui.previewError.textContent = '此事件没有 three.js 源对象（Clear / Blit / 原始 GL 调用）。'; return; }
    console.info('[Frame Debugger] Captured source object', ref.object, ref.geometry, ref.material);
    this.debugger.selection = { object: ref.object, geometry: ref.geometry, material: ref.material };
    this.ui.previewError.textContent = `源对象：${event.details.path} · 已存入 Tengxian.FrameDebugger.selection，可在游戏窗口控制台检查。`;
  }
  // ---------------------------------------------------------------- preview
  UpdatePreviewModes(event) {
    const ui = this.ui, view = this.view;
    const output = view === 'output';
    const attachment = event?._target.attachments[Number(ui.attachment.value)];
    const texture = event?.textures?.[this.textureView?.binding];
    const scalar = output ? attachment?.depth || attachment?.scalar : texture?.scalar;
    const canAdjust = view !== 'mesh' && !!(output ? attachment && !attachment.previewError : texture && !texture.previewError);
    for (const button of ui.viewModes.children) {
      const value = button.dataset.value, active = !!event && view === value;
      button.disabled = !event || (value === 'mesh' && !(event._object || event._geometry)) || (value === 'texture' && !this.textureView);
      button.classList.toggle('on', active); button.setAttribute('aria-pressed', active);
    }
    for (const button of ui.channel.children) {
      const active = canAdjust && !scalar && this.channel === button.dataset.value;
      button.disabled = !canAdjust || scalar;
      button.classList.toggle('on', active); button.setAttribute('aria-pressed', active);
    }
    ui.channel.hidden = ui.black.closest('label').hidden = ui.exposure.closest('label').hidden = view === 'mesh' && !!event;
    ui.black.disabled = ui.white.disabled = ui.exposure.disabled = !canAdjust;
    ui.attachment.hidden = !output && !!event; ui.attachment.disabled = !attachment;
    ui.zoom.disabled = !canAdjust;
    ui.locate.disabled = !event?._object;
  }

  DrawPreview() {
    if (!this.debugger.frozen) return;
    const ui = this.ui; ui.previewError.textContent = '';
    const index = this.debugger.selected, event = this.debugger._events[index];
    const view = this.view, isMesh = view === 'mesh';
    this.UpdatePreviewModes(event);
    ui.output.width = ui.output.height = 1; ui.png.disabled = true; this.previewSource = null;
    ui.pixel.hidden = ui.previewLabel.hidden = true;
    ui.output.style.display = isMesh ? 'none' : ''; ui.mesh.style.display = isMesh ? 'block' : 'none'; ui.meshControls.hidden = !isMesh;
    ui.wireframe.disabled = ui.meshMode.value === 'uvLayout';
    ui.morph.closest('label').hidden = ui.meshMode.value !== 'blendshapes';
    const options = { channel: this.channel, black: Number(ui.black.value), white: Number(ui.white.value), exposure: Number(ui.exposure.value) };
    try {
      const attachment = event?._target.attachments[Number(ui.attachment.value)];
      const output = view !== 'texture' && (!isMesh || ui.syncView.checked) ? this.debugger.Preview(index, Number(ui.attachment.value), { ...options, width: attachment?.width || 1920 }) : null;
      if (output && ui.syncView.checked) this.debugger.Present(output);
      let shown = output, label = attachment ? `${attachment.name} · ${EnumName(this.debugger.gl, attachment.format)} · ${attachment.width}×${attachment.height}` : '';
      let previewError = attachment?.previewError;
      if (attachment?.previewSize && attachment.previewSize.join() !== [attachment.width, attachment.height].join()) label += ` · 预览 ${attachment.previewSize.join('×')}`;
      if (view === 'texture' && this.textureView) {
        const texture = event.textures[this.textureView.binding];
        shown = this.debugger.TexturePreview(index, this.textureView.binding, { ...options, width: Math.min(2048, texture.width || 1024) });
        label = `${texture.name} · ${texture.width ?? '?'}×${texture.height ?? '?'}`;
        previewError = texture.previewError;
      }
      this.previewSource = shown ? { width: view === 'texture' ? event.textures[this.textureView.binding].width || shown.width : attachment?.width || shown.width,
        height: view === 'texture' ? event.textures[this.textureView.binding].height || shown.height : attachment?.height || shown.height } : null;
      ui.previewLabel.hidden = !label || (!isMesh && !shown); ui.previewLabel.textContent = label;
      if (isMesh) {
        this.mesh ??= new FrameDebugMesh(ui.mesh);
        this.mesh.SetEvent(event, ui.meshMode.value, !ui.wireframe.disabled && ui.wireframe.checked, Number(ui.morph.value));
        ui.previewLabel.textContent = event._geometry?.name || event.details?.geometry || '网格';
        ui.previewLabel.hidden = false; ui.png.disabled = false;
      } else if (shown) {
        ui.output.width = shown.width; ui.output.height = shown.height;
        ui.output.style.setProperty('--image-aspect', shown.width / shown.height);
        const context = ui.output.getContext('2d', { willReadFrequently: true }), data = context.createImageData(shown.width, shown.height); data.data.set(shown.pixels); context.putImageData(data, 0, 0);
        ui.png.disabled = false;
      } else ui.previewError.textContent = previewError || '无预览';
    } catch (error) { ui.previewError.textContent = String(error.message || error); }
    this.lastRevision = this.debugger.revision;
  }
  SourcePixel(event) {
    const canvas = this.ui.output, rect = canvas.getBoundingClientRect(); if (!this.previewSource || !rect.width) return null;
    const x = Math.floor((event.clientX - rect.left) / rect.width * this.previewSource.width), y = Math.floor((event.clientY - rect.top) / rect.height * this.previewSource.height);
    return x < 0 || y < 0 || x >= this.previewSource.width || y >= this.previewSource.height ? null : [x, y];
  }
  // Same call agents use (Tengxian.FrameDebug.PixelHistory); shown at the top of the properties.
  PixelHistoryAt(mouse) {
    const at = !this.host.preview && this.view === 'output' && this.SourcePixel(mouse); if (!at) return;
    const event = this.debugger._events[this.debugger.selected];
    try { this.pixelHistory = this.debugger.PixelHistory(at[0], at[1], { event: event.index, attachment: Number(this.ui.attachment.value) || 0 }); }
    catch (error) { this.ui.previewError.textContent = String(error.message || error); return; }
    this.folds.set('pixel', true); this.Properties(event); this.lastRevision = this.debugger.revision;
    this.ui.properties.scrollIntoView({ block: 'start' });
  }
  PixelHistoryFold(root) {
    const history = this.pixelHistory, Value = value => { const span = this.El('span'); span.append(this.Swatch(value), this.El('span', `(${value.map(Num).join(', ')})`)); return span; };
    this.Fold(root, 'pixel', `Pixel History · (${history.x}, ${history.y}) · ${history.target}/${history.attachment}`, `${history.writes} 次改写`, (body, tools) => {
      const all = this.El('label'); const box = this.El('input'); box.type = 'checkbox'; box.checked = !!this.pixelHistoryAll; all.append(box, ' 显示未改值的事件');
      all.onclick = click => click.stopPropagation(); tools.append(all);
      const content = this.El('div'); body.append(content);
      const Draw = () => {
        content.replaceChildren();
        const cards = this.El('div', '', 'cards'); content.append(cards);
        this.Card(cards, 'Pixel', [['坐标', `(${history.x}, ${history.y})，左上为原点`], ['格式', history.format], ['帧起始', Value(history.initial)], ['截至 #' + (history.event + 1), Value(history.final)]]);
        const rows = history.history.filter(item => item.changed || this.pixelHistoryAll);
        this.Table(content, ['#', '事件', 'Pass', '写后原始值', ''], rows.map(item => {
          const link = this.El('a', `${item.kind} ${item.label}`); link.href = '#'; link.onclick = click => { click.preventDefault(); this.Select(item.index); };
          return [String(item.index + 1), link, item.path, Value(item.value), item.changed ? '改写' : '未变'];
        }));
        content.append(this.El('div', '原始值是附件里的真实数据（HDR 不截断，深度 0–1，sRGB 靶为线性）；与 Tengxian.FrameDebug.PixelHistory 同一份。', 'muted'));
      };
      box.onchange = () => { this.pixelHistoryAll = box.checked; Draw(); };
      Draw();
    }, true);
  }
  Pixel(event) {
    const canvas = this.ui.output, rect = canvas.getBoundingClientRect(); if (!this.previewSource || !rect.width) return;
    const x = Math.floor((event.clientX - rect.left) / rect.width * canvas.width), y = Math.floor((event.clientY - rect.top) / rect.height * canvas.height);
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
    const [r, g, b, a] = canvas.getContext('2d', { willReadFrequently: true }).getImageData(x, y, 1, 1).data;
    const sx = Math.floor(x * this.previewSource.width / canvas.width), sy = Math.floor(y * this.previewSource.height / canvas.height);
    this.ui.pixel.hidden = false; this.ui.pixel.textContent = `(${sx}, ${sy}) 显示值 ${[r, g, b, a].map(v => (v / 255).toFixed(3)).join(' ')}`;
  }
  ShowTexture(binding) {
    const event = this.debugger._events[this.debugger.selected], texture = event.textures[binding];
    this.textureView = { binding, index: event.index, uniform: texture.uniform, arrayIndex: texture.arrayIndex };
    this.view = 'texture';
    this.DrawPreview(); this.ui.preview.scrollIntoView({ block: 'nearest' });
  }
  // ---------------------------------------------------------------- properties
  Fold(root, key, title, count, Build, open = false) {
    const box = this.El('details', '', 'fold'); box.open = this.folds.has(key) ? this.folds.get(key) : open;
    const summary = this.El('summary'); summary.append(this.El('span', title));
    if (count != null) summary.append(this.El('span', String(count), 'count'));
    if (count === 0) {
      box.open = false; box.classList.add('emptyFold'); summary.setAttribute('aria-disabled', 'true');
      summary.onclick = event => event.preventDefault();
      box.append(summary); root.append(box); return box;
    }
    const tools = this.El('span', '', 'tools'); summary.append(tools); box.append(summary);
    const body = this.El('div', '', 'foldBody'); box.append(body);
    let built = false;
    const Render = () => { if (built || !box.open) return; built = true; try { Build(body, tools); } catch (error) { body.append(this.El('div', String(error.message || error), 'error')); } };
    box.ontoggle = () => { this.folds.set(key, box.open); Render(); };
    root.append(box); Render();
    return box;
  }
  Card(root, title, rows) {
    const card = this.El('div', '', 'card'); card.append(this.El('h3', title));
    const list = this.El('dl', '', 'kv');
    for (const [key, value, hint] of rows) {
      if (value === undefined) continue;
      const dd = this.El('dd');
      if (value instanceof this.win.Node) dd.append(value); else dd.textContent = value == null || value === '' ? '—' : String(value);
      if (value === 'Off' || value === false || value === 'false') dd.classList.add('off');
      if (hint) dd.append(this.El('span', hint, 'hint'));
      list.append(this.El('dt', key), dd);
    }
    card.append(list); root.append(card); return card;
  }
  Table(root, columns, rows) {
    const table = this.El('table'), head = this.El('tr');
    for (const column of columns) head.append(this.El('th', column));
    table.append(head);
    for (const cells of rows) {
      const tr = this.El('tr');
      cells.forEach((value, i) => {
        const td = this.El('td');
        if (value instanceof this.win.Node) td.append(value); else td.textContent = value == null ? '—' : String(value);
        if (i === 0) td.className = 'k'; tr.append(td);
      });
      table.append(tr);
    }
    root.append(table); return table;
  }
  Swatch(values) {
    const span = this.El('span', '', 'swatch'), [r, g, b, a = 1] = values.map(value => Math.max(0, Math.min(1, value)));
    span.style.background = `rgba(${r * 255 | 0},${g * 255 | 0},${b * 255 | 0},${a})`; return span;
  }
  UniformValue(uniform) {
    const Format = value => {
      if (!Array.isArray(value)) return Num(value);
      const matrix = uniform.type.match(/MAT([234])(?:x([234]))?/);
      if (matrix) {
        const columns = Number(matrix[1]), rows = Number(matrix[2] || matrix[1]), grid = this.El('div', '', 'matrix');
        grid.style.gridTemplateColumns = `repeat(${columns}, max-content)`;
        for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) grid.append(this.El('span', Num(value[c * rows + r])));
        return grid;
      }
      const text = `(${value.map(Num).join(', ')})`;
      if (/VEC[34]$/.test(uniform.type) && /col|tint|albedo|diffuse|emissive|fog|sky|sun|light/i.test(uniform.name) && value.every(v => v >= 0 && v <= 4)) {
        const span = this.El('span'); span.append(this.Swatch(value), this.El('span', text)); return span;
      }
      return text;
    };
    if (uniform.size <= 1) return Format(uniform.value);
    const box = this.El('details'); box.append(this.El('summary', `[${uniform.size}] ${Array.isArray(uniform.value) ? `${String(this.Plain(Format(uniform.value[0])))} …` : ''}`));
    const list = this.El('div');
    uniform.value.forEach((element, i) => { const line = this.El('div'); line.append(this.El('span', `[${i}] `, 'muted')); const value = Format(element); line.append(value instanceof this.win.Node ? value : this.El('span', value)); list.append(line); });
    box.append(list); return box;
  }
  Plain(value) { return value instanceof this.win.Node ? value.textContent : value; }
  Properties(event) {
    const root = this.ui.properties; root.replaceChildren();
    const d = event.details, capture = this.debugger.capture, gl = this.debugger.gl, pass = this.selectedPass != null ? capture.passes[this.selectedPass] : null;
    const program = capture.programs[event.programId];
    if (this.pixelHistory) this.PixelHistoryFold(root);
    if (pass) this.Fold(root, 'group', '分组统计', null, body => {
      const cards = this.El('div', '', 'cards'); body.append(cards);
      this.Card(cards, 'Group', [['路径', pass.path], ['类型', pass.viewport ? '视口' : pass.synthetic ? `捕获器归并（${pass.synthetic}）` : '游戏 Pass'], ['事件', `#${pass.first + 1} – #${pass.last + 1}`],
        ['Draw calls', Count(pass.draws)], ['CPU', `${Ms(pass.cpuMs)} ms`], ['GPU', `${Ms(pass.gpuMs)} ms`], [this.host.preview ? '渲染事件' : 'GL 命令', `${Count(pass.commandEnd - pass.commandStart)}`]]);
      const top = capture.events.slice(pass.first, pass.last + 1).filter(item => item.draw && item.gpuMs != null).sort((a, b) => b.gpuMs - a.gpuMs).slice(0, 8);
      if (top.length) {
        const card = this.El('div', '', 'card'); card.append(this.El('h3', '最耗 GPU 的 DC'));
        this.Table(card, ['#', '事件', 'GPU ms'], top.map(item => { const link = this.El('a', `${item.kind} ${item.label}`); link.href = '#'; link.onclick = click => { click.preventDefault(); this.Select(item.index); }; return [String(item.index + 1), link, Ms(item.gpuMs)]; }));
        cards.append(card);
      }
    });
    this.Fold(root, 'details', 'Details', null, body => {
      const cards = this.El('div', '', 'cards'); body.append(cards);
      this.Card(cards, 'Event', [['事件', `#${event.index + 1} / ${capture.events.length}`], ['类型', event.kind], ['API', ApiCall(this.debugger.gl, event)],
        ['Pass', event.path], ['CPU', `${Ms(event.cpuMs)} ms`, event.draw && event.cpuMs !== event.cpuSubmitMs ? `GL 提交 ${Ms(event.cpuSubmitMs)} ms` : ''],
        [this.host.preview ? 'GPU ≈' : 'GPU', `${Ms(event.gpuMs)} ms`],
        ['Batch cause', event.batchCause ?? undefined]]);
      if (event.drawInfo) {
        const info = event.drawInfo, primitives = Primitives(info);
        this.Card(cards, 'Draw', [['Topology', info.topology], ['Indexed', info.indexed ? `Yes · ${info.indexType}` : 'No'], ['Elements', Count(info.elements)],
          ['Primitives', Count(Math.round(primitives))], ['Instances', Count(info.parts.reduce((sum, part) => sum + part.instances, 0))], ['Sub-draws', info.batch ? Count(info.subDraws) : undefined],
          ['合并几何块', info.geometryBatches ? Count(info.geometryBatches) : undefined],
          ['Vertices (buffer)', d ? Count(d.vertices) : undefined], ['Indices (buffer)', d?.indices ? Count(d.indices) : undefined],
          ['Draw range', d ? `${d.drawRange.start}, ${d.drawRange.count === Infinity ? '∞' : d.drawRange.count}` : undefined],
          ['Group', d?.group ? `start ${d.group.start} · count ${d.group.count} · material ${d.group.materialIndex}` : undefined]]);
        if (info.parts.length > 1) {
          const card = this.El('div', '', 'card'); card.append(this.El('h3', `Sub-draws (${info.parts.length})`));
          this.Table(card, ['#', info.indexed ? 'Offset bytes' : 'First', 'Count', 'Instances'], info.parts.slice(0, 256).map((part, i) => [String(i), Count(info.indexed ? part.offsetBytes : part.first), Count(part.count), Count(part.instances)]));
          cards.append(card);
        }
      }
      if (d) {
        const path = this.El('span'); path.append(this.El('span', d.path));
        const copy = this.El('button', '复制'); copy.style.cssText = 'min-height:0;padding:0 6px;margin-left:6px;font-size:10.5px'; copy.onclick = () => this.win.navigator.clipboard?.writeText(d.path); path.append(copy);
        const flags = d.materialFlags;
        this.Card(cards, 'Mesh / Object', [['显示名', d.name, `来自 ${d.nameSource}`], ['Object', `${d.object} · ${d.objectType} #${d.objectId}`], ['层级路径', path],
          ['Geometry', `${d.geometry} · ${d.geometryType} #${d.geometryId}`], ['Material', `${d.material} · ${d.shader} #${d.materialId}`],
          ['Shader', event.shaderName || d.shader, event.shaderName ? 'SHADER_NAME' : 'material.type'], ['Camera', d.camera], ['渲染队列', `${d.phase} · renderOrder ${d.renderOrder}`],
          ['Material flags', flags ? `${flags.transparent ? 'Transparent' : 'Opaque'} · ${flags.side} · Blending ${THREE_NAMES.blending.get(flags.blending) ?? flags.blending} · depthTest ${flags.depthTest ? 'On' : 'Off'} · depthWrite ${flags.depthWrite ? 'On' : 'Off'}${flags.alphaTest ? ` · alphaTest ${Num(flags.alphaTest)}` : ''}${flags.opacity !== 1 ? ` · opacity ${Num(flags.opacity)}` : ''}` : undefined],
          ['Shadows', `cast ${d.castShadow ? 'On' : 'Off'} · receive ${d.receiveShadow ? 'On' : 'Off'} · frustumCulled ${d.frustumCulled ? 'On' : 'Off'}`],
          ['Instances (object)', d.instances > 1 ? Count(d.instances) : undefined], ['Source', d.source ?? undefined]]);
      } else if (event.draw && (event._geometry || event.shaderName)) {
        this.Card(cards, 'Mesh / Shader', [['网格', event._geometry?.name], ['Shader', event.shaderName ?? undefined]]);
      }
      if (event.api === 'clearBufferfv' && this.host.preview) {
        this.Card(cards, 'Clear', [['附件', event.label], ['值', event.args[2].map(Num).join(', ')]]);
      } else if (event.kind === 'Clear' && event.state) {
        const s = event.state, color = this.El('span'); color.append(this.Swatch(s.COLOR_CLEAR_VALUE), this.El('span', `(${s.COLOR_CLEAR_VALUE.map(Num).join(', ')})`));
        this.Card(cards, 'Clear', [['Buffers', event.label.replace(/[()]/g, '')], ['Color', color], ['Depth', Num(s.DEPTH_CLEAR_VALUE)], ['Stencil', String(s.STENCIL_CLEAR_VALUE)]]);
      }
      const target = event._target, card = this.Card(cards, 'Render Target', [['RenderTarget', target.name], ['Size', `${target.width} × ${target.height}`],
        ['Initial action', target.initialAction ?? undefined]]);
      this.Table(card, ['Attachment', 'Format', 'Size', 'MSAA', 'Level/Face/Layer'], target.attachments.map(attachment => [attachment.name, String(EnumName(gl, attachment.format)),
        `${attachment.width}×${attachment.height}`, attachment.samples ? `×${attachment.samples}` : 'Off', `${attachment.level || 0} / ${attachment.face ? EnumName(gl, attachment.face) : 0} / ${attachment.layer || 0}`]));
      if (event.state) this.Card(cards, 'Render State', RenderStateRows(event.state, Num));
    }, true);
    if (!event.draw) { this.RawJson(root, event); return; }
    const defines = new Map();
    for (const source of program?.sources || []) for (const match of source.source?.matchAll(/^\s*#define\s+(\w+)(?:[ \t]+(.+))?$/gm) || []) {
      const entry = defines.get(match[1]) || { value: (match[2] || '').trim(), stages: new Set() }; entry.stages.add(source.stage[0]); defines.set(match[1], entry);
    }
    const materialDefines = Object.entries(d?.keywords || {});
    this.Fold(root, 'keywords', 'Keywords', defines.size + materialDefines.length, body => {
      if (materialDefines.length) {
        body.append(this.El('h4', 'Material defines'));
        const list = this.El('div', '', 'keywords'); for (const [name, value] of materialDefines) list.append(this.Keyword(name, value, '')); body.append(list);
      }
      if (materialDefines.length && defines.size) body.append(this.El('h4', 'GLSL #define'));
      const list = this.El('div', '', 'keywords');
      for (const [name, entry] of [...defines].sort((a, b) => a[0].localeCompare(b[0]))) list.append(this.Keyword(name, entry.value, entry.stages.size === 1 ? [...entry.stages][0] : ''));
      body.append(list);
    });
    const textures = event.textures || [];
    this.PropertyFold(root, 'Textures', textures.length, (body, keep) => this.TextureTable(body, event, textures, keep));
    for (const group of ['Ints', 'Floats', 'Vectors', 'Matrices']) {
      const rows = event.uniforms.filter(uniform => uniform.group === group);
      this.PropertyFold(root, group, rows.length, (body, keep) =>
        this.Table(body, ['Name', 'Value', 'Type'], rows.filter(uniform => keep(uniform.name)).map(uniform =>
          [uniform.name.replace(/\[0\]$/, ''), this.UniformValue(uniform), `${GlslType(uniform.type)}${uniform.size > 1 ? `[${uniform.size}]` : ''}`])));
    }
    this.Fold(root, 'buffers', 'Buffers', d?.attributes.length ?? event.buffers?.length ?? 0, body => {
      if (d) {
        body.append(this.El('h4', 'Vertex attributes'));
        this.Table(body, ['Name', 'Components', 'Type', 'Normalized', 'Count', 'Bytes', 'Divisor'], d.attributes.map(a => [a.name, String(a.itemSize), a.type, a.normalized ? 'Yes' : 'No', Count(a.count), Count(a.bytes), String(a.divisor)]));
        body.append(this.El('h4', 'Index buffer'));
        this.Table(body, ['Type', 'Indices', 'Instances'], [[event.drawInfo?.indexType || 'Non-indexed', Count(d.indices), Count(d.instances)]]);
      } else this.Table(body, ['Name', 'Location', 'Components', 'Type', 'Stride', 'Offset'], event.buffers.map(attribute =>
        [attribute.name, String(attribute.location), String(attribute.size), attribute.type, Count(attribute.stride), Count(attribute.offset)]));
    });
    const blocks = event.blocks || [];
    this.Fold(root, 'constantBuffers', 'Constant Buffers', blocks.length, body =>
      this.Table(body, ['Block', 'Binding', 'Bytes'], blocks.map(block => [block.name, String(block.binding), Count(block.bytes)])));
    this.Fold(root, 'shader', 'Shader', program?.sources.length ?? 0, body => {
      for (const source of program?.sources || []) {
        const lines = (source.source || '').split('\n'), header = this.El('h4', `${source.stage} shader`);
        const copy = this.El('button', '复制'); copy.style.cssText = 'min-height:0;padding:0 6px;font-size:10.5px;margin-left:auto'; copy.onclick = () => this.win.navigator.clipboard?.writeText(source.source || ''); header.append(copy);
        body.append(header, this.Code(lines));
      }
    });
    this.RawJson(root, event);
  }
  Keyword(name, value, stage) {
    const chip = this.El('span', name, `kw${stage === 'V' ? ' v' : stage === 'F' ? ' f' : ''}`);
    if (value !== '' && value != null) chip.append(this.El('i', ` = ${String(value).slice(0, 40)}`));
    if (stage) chip.append(this.El('i', ` ${stage}`));
    chip.title = `${name}${value !== '' ? ` ${value}` : ''}${stage ? `\n只出现在 ${stage === 'V' ? 'Vertex' : 'Fragment'} shader` : ''}`;
    return chip;
  }
  PropertyFold(root, group, count, build) {
    this.Fold(root, group, group, count, (body, tools) => {
      const filter = this.El('input'); filter.type = 'search'; filter.className = 'filter'; filter.placeholder = '筛选属性';
      filter.setAttribute('aria-label', `筛选 ${group}`); filter.onclick = click => click.stopPropagation();
      const content = this.El('div'); body.append(content);
      const Update = () => {
        content.replaceChildren();
        const query = filter.value.trim().toLowerCase();
        build(content, name => name.toLowerCase().includes(query));
      };
      if (count > 8) { tools.append(filter); filter.oninput = Update; }
      Update();
    });
  }
  TextureTable(root, event, textures, keep) {
    const rows = textures.map((texture, i) => ({ texture, i })).filter(({ texture }) => keep(`${texture.uniform} ${texture.name}`));
    this.Table(root, ['', 'Name', 'Unit', 'Sampler', 'Texture', 'Size', 'Format'], rows.map(({ texture, i }) => {
      const thumb = this.Thumbnail(event, texture, i);
      const name = this.El('span', texture.name);
      if (texture.source) {
        try {
          const url = new URL(texture.source, location.href);
          if (['http:', 'https:', 'blob:'].includes(url.protocol) || /^data:image\//i.test(url.href)) { const link = this.El('a', ' ↗'); link.href = url.href; link.target = '_blank'; link.rel = 'noopener'; link.title = url.href; name.append(link); }
        } catch { /* ignore invalid source */ }
      }
      const format = texture.format == null ? '—' : [THREE_NAMES.format.get(texture.format) ?? texture.format,
        THREE_NAMES.type.get(texture.type) ?? texture.type].filter(value => value != null).join(' · ');
      return [thumb, `${texture.uniform.replace(/\[0\]$/, '')}${texture.arrayIndex || /\[0\]$/.test(texture.uniform) ? `[${texture.arrayIndex}]` : ''}`, String(texture.unit),
        GlslType(texture.sampler), name, texture.width ? `${texture.width}×${texture.height}${texture.depth > 1 ? `×${texture.depth}` : ''}` : '—', `${format}${texture.colorSpace && texture.colorSpace !== 'NoColorSpace' && texture.colorSpace !== '' ? ` · ${texture.colorSpace}` : ''}`];
    }));
  }
  Thumbnail(event, texture, binding) {
    if (!/^SAMPLER_2D(_SHADOW)?$/.test(texture.sampler) || texture.name === 'Unbound' || (this.host.preview && !texture.previewSize)) {
      const none = this.El('span', '—', 'thumb none'); none.title = texture.previewError || texture.sampler; return none;
    }
    const canvas = this.El('canvas', '', 'thumb');
    const button = this.El('button', '', 'thumbButton'); button.title = `预览 ${texture.uniform}`; button.append(canvas);
    button.onclick = () => this.ShowTexture(binding);
    // Each thumbnail is a GPU readback; fill them after the step so holding → stays fluid.
    (this.thumbJobs ??= []).push(() => {
      if (!this.debugger.frozen || this.debugger.selected !== event.index || !canvas.isConnected) return;
      try {
        const image = this.debugger.TexturePreview(event.index, binding, { width: 88 });
        canvas.width = image.width; canvas.height = image.height;
        const context = canvas.getContext('2d'), data = context.createImageData(image.width, image.height); data.data.set(image.pixels); context.putImageData(data, 0, 0);
      } catch (error) { canvas.title = String(error.message || error); }
      this.lastRevision = this.debugger.revision;
    });
    this.win.clearTimeout(this.thumbTimer);
    this.thumbTimer = this.win.setTimeout(() => { const jobs = this.thumbJobs; this.thumbJobs = []; jobs.forEach(Job => Job()); }, 120);
    return button;
  }
  Code(lines) {
    const box = this.El('div', '', 'code'), numbers = this.El('div', '', 'ln'), source = this.El('div', '', 'src');
    numbers.textContent = lines.map((_, i) => i + 1).join('\n');
    for (const [i, line] of lines.entries()) {
      const trimmed = line.trimStart();
      const span = this.El('span', line, trimmed.startsWith('#') ? 'pp' : trimmed.startsWith('//') ? 'cm' : '');
      source.append(span, i < lines.length - 1 ? '\n' : '');
    }
    box.append(numbers, source); return box;
  }
  RawJson(root, event) {
    this.Fold(root, 'raw', 'Raw JSON', null, body => {
      const { _target, _object, _geometry, _textureHandles, textures, uniforms, ...rest } = event;
      body.append(this.El('pre', JSON.stringify({ ...rest, uniforms: uniforms.length, textures: textures?.map(({ _handle, ...texture }) => texture) }, null, 2), 'json'));
    });
  }
  Download(blob, name) {
    const url = URL.createObjectURL(blob), link = this.El('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  Exit() { clearInterval(this.timer); this.debugger.Resume(); this.mesh?.Dispose(); this.mesh = null; if (this.win && !this.win.closed) this.win.close(); this.win = null; }
}
