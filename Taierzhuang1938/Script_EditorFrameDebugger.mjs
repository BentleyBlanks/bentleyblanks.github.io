import * as THREE from 'three';
import { FrameDebugMesh } from './Script_FrameDebugMesh.mjs';
import { EnumName, Primitives, RenderStateRows, ApiCall } from './Script_FrameDebugGl.mjs';

const CSS = `
:root{--bg:#1a1e25;--panel:#20252e;--panel2:#262c36;--raised:#2c3440;--line:#343d4a;--line2:#404a59;--text:#d8dee7;--muted:#8a95a5;--dim:#65707f;
--accent:#4d9cff;--sel:#2c5687;--selLine:#4d9cff;--hover:#29323e;--pass:#eef2f7;--heat:255,146,64;--good:#76d19a;--warn:#ffbe6b;--err:#ff8f7a;
--mono:'Cascadia Mono','JetBrains Mono',Consolas,monospace}
*{box-sizing:border-box}[hidden]{display:none!important}
html,body{height:100%}body{margin:0;background:var(--bg);color:var(--text);font:12px/1.45 system-ui,'Segoe UI','Microsoft YaHei',sans-serif;display:flex;flex-direction:column;overflow:hidden}
button,input,select{font:inherit;color:inherit;background:var(--panel2);border:1px solid var(--line2);border-radius:4px;padding:4px 8px;min-height:26px}
button{cursor:pointer;white-space:nowrap}button:hover:not(:disabled){background:#33404f;border-color:#55657a}button:disabled{opacity:.38;cursor:default}
button.primary{background:#1f4b7c;border-color:#3b78bd}button.primary:hover:not(:disabled){background:#28609e}
input[type=number]{width:62px}input[type=search]{width:100%}input:focus,select:focus,button:focus-visible{outline:1px solid var(--accent);outline-offset:0}
a{color:#8cc4ff}small,.muted{color:var(--muted)}.mono{font-family:var(--mono)}.spacer{flex:1}
header{display:flex;align-items:center;gap:12px;padding:8px 14px;background:linear-gradient(#262d38,#20262f);border-bottom:1px solid var(--line)}
h1{font-size:15px;margin:0;letter-spacing:.2px}.pill{padding:1px 8px;border:1px solid #3c5a7c;border-radius:10px;color:#a9c9ec;font-size:11px}
.stats{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.stat{display:flex;flex-direction:column;align-items:flex-end;padding:2px 9px;border-left:1px solid var(--line);min-width:64px}
.stat b{font:600 13px var(--mono);color:var(--pass)}.stat span{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px}
.dot{width:8px;height:8px;border-radius:50%;background:var(--dim);display:inline-block;margin-right:6px}.dot.live{background:var(--good)}.dot.frozen{background:var(--accent);box-shadow:0 0 6px var(--accent)}.dot.armed{background:var(--warn)}.dot.error{background:var(--err)}
.toolbar{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.bar{padding:7px 14px;background:var(--panel);border-bottom:1px solid var(--line)}
.bar input[type=range]{flex:1;min-width:120px;accent-color:var(--accent)}.sep{width:1px;align-self:stretch;background:var(--line);margin:0 4px}
#status{padding:5px 14px;color:#a9c7e6;background:#1c2530;border-bottom:1px solid var(--line);display:flex;align-items:center;min-height:26px}
main{flex:1;min-height:0;display:grid;grid-template-columns:var(--aside,440px) 5px minmax(360px,1fr)}
aside{display:flex;flex-direction:column;min-height:0;background:var(--panel)}
.asideHead{padding:8px 8px 0;display:flex;flex-direction:column;gap:6px;border-bottom:1px solid var(--line)}
.asideHead .toolbar button{padding:3px 7px}
.legend,.row{display:grid;grid-template-columns:minmax(0,1fr) 38px 60px 60px;align-items:center}
.legend{color:var(--muted);font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;padding:4px 0 5px}.legend span{text-align:right;padding-right:6px}.legend span:first-child{text-align:left;padding-left:8px}
#splitter{cursor:col-resize;background:var(--line)}#splitter:hover,#splitter.drag{background:var(--accent)}
#events{flex:1;overflow:auto;padding:2px 0 20px;font-size:11.5px}
.row{min-height:22px;cursor:default;border-left:2px solid transparent;user-select:none}.row:hover{background:var(--hover)}
.row>span{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.row>.num{text-align:right;padding-right:6px;font:11px var(--mono);color:#b7c1ce}
.row .name{display:flex;align-items:center;gap:5px;padding-left:calc(4px + var(--depth,0) * 14px)}
.row .label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.row .sub{color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1 1 0;min-width:0}
.row.pass{font-weight:600;color:var(--pass)}.row.pass .label{flex:0 1 auto}
.row.pass.inside{background:rgba(77,156,255,.07)}.row.on{background:var(--sel)!important;border-left-color:var(--selLine);color:#fff}.row.on .sub{color:#b5cbe6}
.caret{width:14px;height:14px;min-height:0;padding:0;border:0;background:none;color:var(--muted);font-size:9px;line-height:14px;flex:none}.caret:hover:not(:disabled){background:none;color:#fff}
.icon{flex:none;width:16px;height:14px;border-radius:3px;font:700 9px/14px var(--mono);text-align:center;color:#0d1117}
.icon.draw{background:#6fb1ff}.icon.inst{background:#9d8cff}.icon.batch{background:#c58cff}.icon.full{background:#59d0c4}.icon.proc{background:#8fd97a}.icon.clear{background:#8a95a5}.icon.blit{background:#ffbe6b}.icon.copy{background:#e0a0c0}
.icon.group{background:none;color:#8fb7e3;font-size:11px}.icon.group.synthetic{color:#7b8797}
.idx{color:var(--dim);font:10.5px var(--mono);flex:none;min-width:28px;text-align:right}
.gpu{background:linear-gradient(90deg,rgba(var(--heat),.38) var(--p,0%),transparent var(--p,0%))}
.node.closed>.kids{display:none}.empty{padding:14px;color:var(--muted)}
.right{display:flex;flex-direction:column;min-height:0;overflow:auto;background:var(--bg)}.right>*{flex-shrink:0}
.eventHead{padding:10px 16px 8px;border-bottom:1px solid var(--line);background:var(--panel);position:sticky;top:0;z-index:3}
.titleRow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}h2{font-size:15px;margin:0;color:#f1f5fa;font-weight:600;overflow-wrap:anywhere}
.kindTag{font:600 10.5px var(--mono);padding:1px 7px;border-radius:3px;background:#324458;color:#b8d6f6;white-space:nowrap}
.crumbs{margin-top:3px;color:var(--muted);font-size:11.5px;display:flex;flex-wrap:wrap;gap:3px;align-items:center}.crumbs button{min-height:0;padding:0 4px;border:0;background:none;color:#93b9e2}.crumbs button:hover:not(:disabled){text-decoration:underline;background:none}
.chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.chip{display:inline-flex;gap:5px;align-items:baseline;padding:2px 8px;border-radius:10px;background:var(--panel2);border:1px solid var(--line);font-size:11px;white-space:nowrap}.chip b{font:600 11px var(--mono);color:var(--pass)}.chip.hot b{color:#ffb27a}
.previewBar{padding:6px 16px;border-bottom:1px solid var(--line);background:#1d222a}
.seg{display:inline-flex}.seg button{border-radius:0;margin-left:-1px;min-width:30px;padding:3px 7px}.seg button:first-child{border-radius:4px 0 0 4px;margin-left:0}.seg button:last-child{border-radius:0 4px 4px 0}.seg button.on{background:#2d5d93;border-color:#4d86c5;color:#fff}
.preview{position:relative;height:clamp(220px,44vh,560px);min-height:160px;resize:vertical;background:repeating-conic-gradient(#232b36 0% 25%,#1b222c 0% 50%) 0/18px 18px;border-bottom:1px solid var(--line);overflow:hidden;display:flex;align-items:center;justify-content:center}
.preview canvas{max-width:100%;max-height:100%;image-rendering:auto}.preview.zoom{overflow:auto;display:block}.preview.zoom canvas{max-width:none;max-height:none;image-rendering:pixelated}
#mesh{display:none;touch-action:none;cursor:grab;width:100%;height:100%;object-fit:contain}
.previewInfo{position:absolute;left:8px;bottom:6px;right:8px;display:flex;gap:10px;pointer-events:none;font:11px var(--mono);color:#cfd8e3;text-shadow:0 1px 2px #000}.previewInfo .tag{background:rgba(12,15,20,.72);padding:1px 6px;border-radius:3px}
.error{color:var(--err);padding:0 16px}.error:not(:empty){padding:6px 16px}
#properties{padding:6px 16px 10px}
details.fold{border:1px solid var(--line);border-radius:5px;margin:8px 0;background:var(--panel)}details.fold>summary{cursor:pointer;padding:6px 10px;font-weight:600;color:#cfe3fa;display:flex;align-items:center;gap:8px;list-style:none;user-select:none}
details.fold>summary::before{content:'▸';color:var(--muted);font-size:10px;width:10px}details.fold[open]>summary::before{content:'▾'}details.fold>summary::-webkit-details-marker{display:none}
details.fold>summary .count{font:10.5px var(--mono);color:var(--muted);font-weight:400}details.fold>summary .tools{margin-left:auto;display:flex;gap:6px;font-weight:400}
.foldBody{padding:4px 10px 10px;border-top:1px solid var(--line)}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:8px;padding-top:6px}
.card{border:1px solid var(--line);border-radius:4px;background:#1d222a;min-width:0}.card h3{margin:0;padding:5px 9px;font-size:11px;letter-spacing:.4px;text-transform:uppercase;color:#9fb4cc;border-bottom:1px solid var(--line);background:#222933}
dl.kv{display:grid;grid-template-columns:max-content minmax(0,1fr);margin:0;padding:5px 9px;column-gap:14px;row-gap:3px}dl.kv dt{color:var(--muted);white-space:nowrap}dl.kv dd{margin:0;font-family:var(--mono);font-size:11.5px;overflow-wrap:anywhere;min-width:0}
.off{color:var(--dim)}.on-val{color:var(--good)}.hint{color:var(--dim);font-family:system-ui,sans-serif;font-size:11px;margin-left:6px}
table{width:100%;border-collapse:collapse;font:11px/1.45 var(--mono)}th{position:sticky;top:0;text-align:left;color:var(--muted);font:600 10.5px system-ui,sans-serif;text-transform:uppercase;letter-spacing:.3px;background:#222933;padding:4px 7px;border-bottom:1px solid var(--line2)}
td{padding:3px 7px;border-bottom:1px solid #2a313b;vertical-align:top;overflow-wrap:anywhere}tr:hover td{background:#222a34}td.k{color:#cfe0f3;white-space:nowrap}td.t{color:var(--dim);white-space:nowrap}
h4{margin:10px 0 4px;font-size:11px;color:#9fb4cc;text-transform:uppercase;letter-spacing:.4px;display:flex;gap:6px;align-items:baseline}h4 .count{color:var(--dim);font-weight:400}
.thumb{width:44px;height:44px;border:1px solid var(--line2);background:repeating-conic-gradient(#2a323d 0% 25%,#20262f 0% 50%) 0/8px 8px;display:block;cursor:zoom-in;object-fit:contain}.thumb.none{cursor:default;display:flex;align-items:center;justify-content:center;color:var(--dim);font-size:9px}
.swatch{display:inline-block;width:11px;height:11px;border:1px solid #0008;border-radius:2px;vertical-align:-1px;margin-right:5px}
.matrix{display:grid;gap:0 10px;font:11px var(--mono)}.matrix span{text-align:right}
.keywords{display:flex;flex-wrap:wrap;gap:4px;padding:4px 0}.kw{font:11px var(--mono);padding:1px 6px;border-radius:3px;background:#2a3542;border:1px solid #394a5e;color:#cfe0f3}.kw i{font-style:normal;color:var(--muted)}.kw.v{border-color:#3e5f45}.kw.f{border-color:#5f4e3e}
.code{display:grid;grid-template-columns:max-content minmax(0,1fr);font:11px/1.5 var(--mono);max-height:520px;overflow:auto;background:#161a20;border:1px solid var(--line);border-radius:4px}
.code .ln{color:#4d5866;text-align:right;padding:0 8px;user-select:none;border-right:1px solid #262d36;white-space:pre}.code .src{white-space:pre;padding:0 10px;color:#cdd6e2}
.code .pp{color:#c792ea}.code .cm{color:#5f7086}
.filter{width:220px;min-height:22px;padding:2px 7px}
pre.json{white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.5 var(--mono);margin:0;max-height:480px;overflow:auto}
footer.note{padding:4px 16px 16px;color:var(--dim);font-size:11px;line-height:1.55}
@media(max-width:900px){main{grid-template-columns:var(--aside,300px) 5px minmax(300px,1fr)}.stats .stat:nth-child(n+5){display:none}}`;

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
  'Draw Procedural': ['proc', 'P'], Clear: ['clear', 'C'], Blit: ['blit', '⇢'], 'Generate Mips': ['copy', 'M'], 'Copy Texture': ['copy', 'T'] };

export class FrameDebuggerEditor {
  static id = 'frameDebugger';
  static label = 'Frame Debugger';
  static hint = '独立窗口：冻结一帧、逐 DC / Pass 回放、CPU / GPU 耗时、渲染靶 / 网格 / Shader 检查';
  static keepOnClose = true;
  constructor(host) {
    this.host = host; this.debugger = host.game.FrameDebugger; this.win = null; this.mesh = null; this.lastRevision = -1; this.captureId = null;
    this.treeKey = ''; this.filter = ''; this.sort = 'order'; this.channel = 'rgba'; this.open = new Set(); this.folds = new Map();
    this.selectedPass = null; this.textureView = null; this.propertyFilter = '';
  }
  Enter() {
    this.win = window.open('', this.debugger.windowName, 'width=1440,height=980,menubar=no,toolbar=no');
    if (!this.win) throw new Error('Frame Debugger 独立窗口被浏览器拦截，请允许弹窗后重试');
    const doc = this.win.document; this.doc = doc;
    doc.open(); doc.write('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>台儿庄 · Frame Debugger</title></head><body></body></html>'); doc.close();
    const style = doc.createElement('style'); style.textContent = CSS; doc.head.append(style);
    doc.body.innerHTML = `<header><h1>Frame Debugger</h1><span class="pill">台儿庄 1938 · WebGL 2</span><span class="spacer"></span><div id="stats" class="stats"></div></header>
      <div class="toolbar bar"><select id="target" aria-label="捕获目标"><option>当前游戏 · ${location.host}</option></select>
        <button id="capture" class="primary">● 启用 / 捕获当前帧</button><button id="resume">■ 禁用 / 继续</button><button id="save">导出报告</button><span class="sep"></span>
        <button id="previous" title="上一事件 (←，Shift ×10)">◀</button><input id="scrubber" aria-label="渲染事件" type="range" min="0" max="0" value="0"><button id="next" title="下一事件 (→，Shift ×10)">▶</button>
        <input id="index" aria-label="事件编号" type="number" min="1" value="1"><span id="count" class="muted">/ 0</span></div>
      <div id="status"><span id="stateDot" class="dot"></span><span id="statusText">点击捕获，冻结下一次完整渲染提交。← / → 步进；Home / End 首尾；Esc 继续。</span></div>
      <main><aside><div class="asideHead"><input id="search" type="search" placeholder="搜索 Pass / 对象 / 材质 / Shader / #编号">
        <div class="toolbar"><select id="sort" aria-label="排序"><option value="order">事件顺序</option><option value="gpu">GPU 最耗时</option><option value="cpu">CPU 最耗时</option></select>
        <button id="expand" title="展开全部">展开全部</button><button id="collapse" title="折叠全部">折叠全部</button><span class="spacer"></span><small id="treeInfo"></small></div>
        <div class="legend"><span>事件 / Pass</span><span>DC</span><span>CPU ms</span><span>GPU ms</span></div></div><div id="events" role="tree"></div></aside>
      <div id="splitter" title="拖动调整宽度"></div>
      <section id="right" class="right"><div class="eventHead"><div class="titleRow"><span id="kindTag" class="kindTag" hidden></span><h2 id="selected">尚未捕获</h2><span class="spacer"></span>
          <label><input id="syncView" type="checkbox" checked> 同步游戏画面</label><button id="locate" title="把源对象存进 Tengxian.FrameDebugger.selection 并在控制台打印">定位源对象</button></div>
        <div id="crumbs" class="crumbs"></div><div id="chips" class="chips"></div></div>
      <div class="toolbar previewBar"><select id="view" aria-label="预览"><option value="output">Output 渲染结果</option><option value="mesh">Mesh 网格</option><option value="texture" disabled>Texture 纹理</option></select>
        <select id="attachment" aria-label="渲染目标附件" style="max-width:260px"></select><span id="channel" class="seg" role="group" aria-label="颜色通道"></span>
        <label>Levels <input id="black" type="number" value="0" step=".01" title="黑场"> – <input id="white" type="number" value="1" step=".01" title="白场"></label><label>EV <input id="exposure" type="number" value="0" step=".5"></label>
        <span class="spacer"></span><button id="zoom" title="适应窗口 / 原始像素">适应 / 1:1</button><button id="png">保存 PNG</button></div>
      <div id="meshControls" class="toolbar previewBar" hidden><select id="meshMode"><option value="shaded">Shaded</option><option value="uvChecker">UV Checker</option><option value="uvLayout">UV Layout</option><option value="vertexColor">Vertex Color</option><option value="normals">Normals</option><option value="tangents">Tangents</option><option value="blendshapes">Blendshapes / 当前形变</option></select><label><input id="wireframe" type="checkbox"> Wireframe</label><label>形变 <input id="morph" type="range" min="0" max="1" step=".01" value="1"></label><small>拖动旋转 · 滚轮缩放</small></div>
      <div id="preview" class="preview"><canvas id="output"></canvas><canvas id="mesh"></canvas><div class="previewInfo"><span id="previewLabel" class="tag" hidden></span><span class="spacer"></span><span id="pixel" class="tag" hidden></span></div></div>
      <div id="previewError" class="error"></div><div id="properties"></div>
      <footer class="note">GPU 来自当前冻结帧的一次完整命令回放，查询异步返回；— 表示未返回或不可用。CPU 为捕获时提交（含绘制准备），已扣除检查开销。Pass / 分组的 GPU 包含状态设置、上传与子事件；父行包含子行，勿重复相加。灰色 ◆ 分组（Render / Draw*Objects / Unscoped）由捕获器按提交顺序归并，不是游戏里的 Pass。缓存与查询插桩会影响耗时，趋势请用 Profiler。Unity SRP Batcher、Compute/Geometry/Tessellation、memoryless / load-store 不是本游戏 WebGL2 管线功能，不伪造数据。</footer></section></main>`;
    this.ui = Object.fromEntries([...doc.querySelectorAll('[id]')].map(el => [el.id, el]));
    const ui = this.ui;
    for (const [value, text] of [['rgba', 'RGBA'], ['rgb', 'RGB'], ['r', 'R'], ['g', 'G'], ['b', 'B'], ['a', 'A']]) {
      const button = this.El('button', text); button.dataset.value = value; button.classList.toggle('on', value === this.channel);
      button.onclick = () => { this.channel = value; ui.channel.querySelectorAll('button').forEach(el => el.classList.toggle('on', el === button)); this.DrawPreview(); };
      ui.channel.append(button);
    }
    ui.capture.onclick = () => { this.debugger.RequestCapture(); this.Update(); };
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
    ui.view.onchange = () => { if (ui.view.value !== 'texture') this.textureView = null; this.DrawPreview(); };
    ui.syncView.onchange = () => { if (!ui.syncView.checked) this.debugger.Present(); else this.DrawPreview(); };
    ui.zoom.onclick = () => ui.preview.classList.toggle('zoom');
    ui.save.onclick = () => this.Download(new Blob([JSON.stringify(this.debugger.Inspect(), null, 2)], { type: 'application/json' }), `FrameCapture_${this.debugger.capture?.id || 0}.json`);
    ui.png.onclick = () => (ui.view.value === 'mesh' ? ui.mesh : ui.output).toBlob(blob => { if (blob) this.Download(blob, `FrameCapture_Event${this.debugger.selected + 1}.png`); });
    ui.locate.onclick = () => this.Locate();
    ui.output.onmousemove = event => this.Pixel(event);
    ui.output.onmouseleave = () => { ui.pixel.hidden = true; };
    ui.output.onclick = event => this.PixelHistoryAt(event);
    ui.output.title = '单击像素：像素历史（哪些事件写过它、写后的原始值）';
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
  Stat(label, value, title = '') { const box = this.El('div', '', 'stat'); box.append(this.El('b', value), this.El('span', label)); if (title) box.title = title; return box; }
  Update() {
    if (!this.win || this.win.closed) { this.host.CloseFrameDebugger(); return; }
    this.debugger.Poll();
    if (this.lastRevision === this.debugger.revision) return;
    this.lastRevision = this.debugger.revision;
    const capture = this.debugger.capture, ui = this.ui, ready = this.debugger.frozen;
    for (const id of ['resume', 'save', 'previous', 'next', 'scrubber', 'index', 'png', 'locate']) ui[id].disabled = !ready;
    ui.stateDot.className = `dot ${ready ? 'frozen' : this.debugger.state === 'armed' || this.debugger.state === 'capturing' ? 'armed' : this.debugger.state === 'error' ? 'error' : 'live'}`;
    if (!capture || !ready) {
      ui.statusText.textContent = this.debugger.error || (this.debugger.state === 'armed' ? '等待下一次渲染提交…' : '游戏运行中 · 点击「启用 / 捕获当前帧」冻结下一帧');
      if (!capture) {
        ui.events.replaceChildren(this.El('div', '尚未捕获。捕获后这里按提交顺序列出 Pass 与每个渲染事件。', 'empty'));
        ui.properties.replaceChildren(); ui.selected.textContent = '尚未捕获'; ui.kindTag.hidden = true; ui.crumbs.replaceChildren(); ui.chips.replaceChildren(); ui.stats.replaceChildren();
        ui.treeInfo.textContent = ''; ui.previewLabel.hidden = true;
        if (this.captureId !== null) { this.mesh?.Clear(); ui.output.getContext('2d').clearRect(0, 0, ui.output.width, ui.output.height); }
      }
      this.captureId = null; this.treeKey = ''; return;
    }
    const statuses = { ready: '已返回', pending: '等待 GPU', unavailable: '扩展不可用', disjoint: 'GPU 时钟失效', timeout: '查询超时' };
    const draws = capture.events.filter(event => event.draw).length;
    ui.statusText.textContent = `帧 #${capture.id} 已冻结 · ${capture.capturedAt.slice(11, 19)} · ${capture.width}×${capture.height} · ${Count(capture.commandCount)} 条 GL 命令 · GPU 计时${statuses[capture.gpuStatus]}`;
    ui.stats.replaceChildren(this.Stat('Draw calls', Count(draws)), this.Stat('Events', Count(capture.events.length)),
      this.Stat('Passes', Count(capture.passes.filter(pass => !pass.synthetic).length)), this.Stat('CPU ms', Ms(capture.cpuMs)),
      this.Stat('GPU ms', Ms(capture.gpuMs), statuses[capture.gpuStatus]), this.Stat('Backup', `${(capture.bytes / 1048576).toFixed(1)} MiB`));
    const key = `${capture.id}:${capture.gpuStatus}`;
    if (key !== this.treeKey) {
      this.treeKey = key; this.BuildTree();
      if (this.captureId !== capture.id) { this.captureId = capture.id; this.selectedPass = null; this.textureView = null; this.pixelHistory = null; this.Select(capture.events.length - 1); }
      else { const event = this.debugger._events[this.debugger.selected]; this.Header(event); if (event) this.Properties(event); }
    }
  }
  // ---------------------------------------------------------------- tree
  Match(event) {
    if (!this.filter) return true;
    const d = event.details || {};
    return `#${event.index + 1} ${event.kind} ${event.label} ${event.path} ${event.target} ${d.material || ''} ${d.shader || ''} ${event.shaderName || ''} ${d.geometry || ''} ${d.path || ''}`.toLowerCase().includes(this.filter);
  }
  EventRow(event, depth, flat = false) {
    const row = this.El('div', '', 'row ev'); row.dataset.event = event.index; row.style.setProperty('--depth', depth);
    const [iconClass, glyph] = ICONS[event.kind] || ['draw', '?'];
    const name = this.El('span', '', 'name'), icon = this.El('span', glyph, `icon ${iconClass}`); icon.title = event.kind;
    const d = event.details;
    name.append(this.El('span', '', 'caret'), icon, this.El('span', String(event.index + 1), 'idx'), this.El('span', event.draw ? event.label : `${event.kind} ${event.label}`.trim(), 'label'),
      this.El('span', flat ? event.path : d ? d.material : event.target, 'sub'));
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
    const icon = this.El('span', '◆', `icon group${pass.synthetic ? ' synthetic' : ''}`); icon.title = pass.synthetic ? '捕获器归并的分组' : '游戏 Pass';
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
    if (this.sort !== 'order') {
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
      const Add = (parentId, container, depth, forced) => {
        const items = [...(children.get(parentId) || []), ...(children.get(`e${parentId}`) || [])].sort((a, b) => a.at - b.at || (a.pass ? -1 : 1));
        for (const item of items) {
          if (item.pass) {
            const passMatch = this.filter && item.pass.name.toLowerCase().includes(this.filter);
            if (!forced && !Has(item.pass)) continue;
            const node = this.PassNode(item.pass, depth, !!this.filter); container.append(node);
            Add(item.pass.id, node.lastChild, depth + 1, forced || passMatch);
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
    if (this.sort === 'order' && event) {
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
    const previous = Number(ui.attachment.value) || 0;
    ui.attachment.replaceChildren();
    event._target.attachments.forEach((attachment, i) => {
      const option = this.El('option', `${attachment.name} · ${EnumName(this.debugger.gl, attachment.format)} · ${attachment.width}×${attachment.height}`);
      option.value = i; option.disabled = attachment.stencil; ui.attachment.append(option);
    });
    if (previous < event._target.attachments.length && !event._target.attachments[previous].stencil) ui.attachment.value = previous;
    ui.view.querySelector('[value=mesh]').disabled = !event._object;
    if (this.textureView?.index !== event.index) this.textureView = null;
    ui.view.querySelector('[value=texture]').disabled = !this.textureView;
    if (ui.view.value === 'texture' && !this.textureView) ui.view.value = 'output';
    if (!event._object && ui.view.value === 'mesh') ui.view.value = 'output';
    const attributes = event._object?.geometry.attributes || {};
    for (const [mode, enabled] of Object.entries({ uvChecker: !!attributes.uv, uvLayout: !!attributes.uv,
      vertexColor: !!attributes.color, normals: !!attributes.normal, tangents: !!attributes.tangent,
      blendshapes: !!event._object?.object.morphTargetInfluences?.length })) ui.meshMode.querySelector(`[value=${mode}]`).disabled = !enabled;
    if (ui.meshMode.selectedOptions[0]?.disabled) ui.meshMode.value = 'shaded';
    this.MarkSelection(); this.Header(event); this.DrawPreview(); this.Properties(event);
  }
  Header(event) {
    if (!event) return;
    const ui = this.ui, capture = this.debugger.capture, pass = this.selectedPass != null ? capture.passes[this.selectedPass] : null;
    ui.kindTag.hidden = false; ui.kindTag.textContent = pass ? 'GROUP END' : event.kind.toUpperCase();
    ui.selected.textContent = pass ? `${pass.name} · 结束于 #${event.index + 1}` : `#${event.index + 1}  ${event.draw ? event.label : `${event.kind} ${event.label}`}`.trim();
    ui.crumbs.replaceChildren();
    const chain = [];
    for (let id = event.pass; id != null; id = capture.passes[id].parent) chain.unshift(capture.passes[id]);
    if (!chain.length) ui.crumbs.append(this.El('span', 'Frame'));
    chain.forEach((row, i) => {
      if (i) ui.crumbs.append(this.El('span', '›'));
      const button = this.El('button', row.name); button.title = `选中 ${row.path}（跳到其最后一个事件）`; button.onclick = () => this.Select(row.last, row.id); ui.crumbs.append(button);
    });
    ui.crumbs.append(this.El('span', '→'), this.El('span', `${event.target} ${event.targetSize?.join('×') || ''}`, 'mono'));
    const Chip = (label, value, hot = false) => { const chip = this.El('span', '', `chip${hot ? ' hot' : ''}`); chip.append(this.El('span', label, 'muted'), this.El('b', value)); return chip; };
    const target = pass || event, share = capture.gpuMs && target.gpuMs != null ? target.gpuMs / capture.gpuMs : 0;
    ui.chips.replaceChildren(Chip('GPU', `${Ms(target.gpuMs)} ms${share ? ` · ${(share * 100).toFixed(1)}%` : ''}`, share > 0.05), Chip('CPU', `${Ms(target.cpuMs)} ms`));
    if (pass) ui.chips.append(Chip('Draw calls', Count(pass.draws)), Chip('事件', `#${pass.first + 1} – #${pass.last + 1}`));
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
  DrawPreview() {
    if (!this.debugger.frozen) return;
    const ui = this.ui; ui.previewError.textContent = '';
    const index = this.debugger.selected, event = this.debugger._events[index];
    const view = ui.view.value, isMesh = view === 'mesh';
    ui.output.style.display = isMesh ? 'none' : ''; ui.mesh.style.display = isMesh ? 'block' : 'none'; ui.meshControls.hidden = !isMesh;
    ui.attachment.disabled = view !== 'output';
    const options = { channel: this.channel, black: Number(ui.black.value), white: Number(ui.white.value), exposure: Number(ui.exposure.value) };
    try {
      const attachment = event?._target.attachments[Number(ui.attachment.value)];
      const output = view !== 'texture' && (!isMesh || ui.syncView.checked) ? this.debugger.Preview(index, Number(ui.attachment.value), { ...options, width: attachment?.width || 1920 }) : null;
      if (output && ui.syncView.checked) this.debugger.Present(output);
      let shown = output, label = attachment ? `${event.target}${attachment.name === event.target ? '' : ` · ${attachment.name}`} · ${EnumName(this.debugger.gl, attachment.format)} · ${attachment.width}×${attachment.height}${attachment.samples ? ` · MSAA ×${attachment.samples}` : ''}` : '';
      if (view === 'texture' && this.textureView) {
        const texture = event.textures[this.textureView.binding];
        shown = this.debugger.TexturePreview(index, this.textureView.binding, { ...options, width: Math.min(2048, texture.width || 1024) });
        label = `${texture.uniform}${texture.arrayIndex ? `[${texture.arrayIndex}]` : ''} · ${texture.name} · ${texture.width ?? '?'}×${texture.height ?? '?'} · 该 DC 读到的内容`;
      }
      this.previewSource = shown ? { width: view === 'texture' ? event.textures[this.textureView.binding].width || shown.width : attachment?.width || shown.width,
        height: view === 'texture' ? event.textures[this.textureView.binding].height || shown.height : attachment?.height || shown.height } : null;
      ui.previewLabel.hidden = isMesh || !label; ui.previewLabel.textContent = label;
      if (isMesh) {
        this.mesh ??= new FrameDebugMesh(ui.mesh);
        this.mesh.SetEvent(event, ui.meshMode.value, ui.wireframe.checked, Number(ui.morph.value));
      } else if (shown) {
        ui.output.width = shown.width; ui.output.height = shown.height;
        const context = ui.output.getContext('2d', { willReadFrequently: true }), data = context.createImageData(shown.width, shown.height); data.data.set(shown.pixels); context.putImageData(data, 0, 0);
      }
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
    const at = this.ui.view.value === 'output' && this.SourcePixel(mouse); if (!at) return;
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
    this.ui.view.querySelector('[value=texture]').disabled = false; this.ui.view.value = 'texture';
    this.DrawPreview(); this.ui.preview.scrollIntoView({ block: 'nearest' });
  }
  // ---------------------------------------------------------------- properties
  Fold(root, key, title, count, Build, open = false) {
    const box = this.El('details', '', 'fold'); box.open = this.folds.has(key) ? this.folds.get(key) : open;
    const summary = this.El('summary'); summary.append(this.El('span', title));
    if (count != null) summary.append(this.El('span', String(count), 'count'));
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
    if (pass) this.Fold(root, 'group', `分组 · ${pass.name}`, null, body => {
      const cards = this.El('div', '', 'cards'); body.append(cards);
      this.Card(cards, 'Group', [['路径', pass.path], ['类型', pass.synthetic ? `捕获器归并（${pass.synthetic}）` : '游戏 Pass'], ['事件', `#${pass.first + 1} – #${pass.last + 1}`],
        ['Draw calls', Count(pass.draws)], ['CPU', `${Ms(pass.cpuMs)} ms`], ['GPU', `${Ms(pass.gpuMs)} ms`], ['GL 命令', `${Count(pass.commandEnd - pass.commandStart)}`]]);
      const top = capture.events.slice(pass.first, pass.last + 1).filter(item => item.draw).sort((a, b) => (b.gpuMs ?? -1) - (a.gpuMs ?? -1)).slice(0, 8);
      if (top.length) {
        const card = this.El('div', '', 'card'); card.append(this.El('h3', '最耗 GPU 的 DC'));
        this.Table(card, ['#', '事件', 'GPU ms'], top.map(item => { const link = this.El('a', `${item.kind} ${item.label}`); link.href = '#'; link.onclick = click => { click.preventDefault(); this.Select(item.index); }; return [String(item.index + 1), link, Ms(item.gpuMs)]; }));
        cards.append(card);
      }
      body.append(this.El('div', '下面是该组最后一个事件的详情。', 'muted'));
    }, true);
    this.Fold(root, 'details', 'Details', null, body => {
      const cards = this.El('div', '', 'cards'); body.append(cards);
      this.Card(cards, 'Event', [['事件', `#${event.index + 1} / ${capture.events.length}`], ['类型', event.kind], ['API', ApiCall(this.debugger.gl, event)],
        ['Pass', event.path], ['CPU', `${Ms(event.cpuMs)} ms`, event.draw ? `GL 调用本身 ${Ms(event.cpuSubmitMs)} ms` : ''], ['GPU', `${Ms(event.gpuMs)} ms`],
        ['Batch cause', event.batchCause ?? undefined]]);
      if (event.drawInfo) {
        const info = event.drawInfo, primitives = Primitives(info);
        this.Card(cards, 'Draw', [['Topology', info.topology], ['Indexed', info.indexed ? `Yes · ${info.indexType}` : 'No'], ['Elements', Count(info.elements)],
          ['Primitives', Count(Math.round(primitives))], ['Instances', Count(info.parts.reduce((sum, part) => sum + part.instances, 0))], ['Sub-draws', info.batch ? Count(info.subDraws) : undefined],
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
      } else if (event.draw) this.Card(cards, 'Mesh / Object', [['源对象', '无', '原始 GL 调用，没有经过 three.js renderBufferDirect'], ['Shader', event.shaderName ?? undefined]]);
      if (event.kind === 'Clear') {
        const s = event.state, color = this.El('span'); color.append(this.Swatch(s.COLOR_CLEAR_VALUE), this.El('span', `(${s.COLOR_CLEAR_VALUE.map(Num).join(', ')})`));
        this.Card(cards, 'Clear', [['Buffers', event.label.replace(/[()]/g, '')], ['Color', color], ['Depth', Num(s.DEPTH_CLEAR_VALUE)], ['Stencil', String(s.STENCIL_CLEAR_VALUE)]]);
      }
      const target = event._target, card = this.Card(cards, 'Render Target', [['RenderTarget', target.name], ['Size', `${target.width} × ${target.height}`],
        ['Initial action', target.initialAction ?? undefined]]);
      this.Table(card, ['Attachment', 'Format', 'Size', 'MSAA', 'Level/Face/Layer'], target.attachments.map(attachment => [attachment.name, String(EnumName(gl, attachment.format)),
        `${attachment.width}×${attachment.height}`, attachment.samples ? `×${attachment.samples}` : 'Off', `${attachment.level || 0} / ${attachment.face ? EnumName(gl, attachment.face) : 0} / ${attachment.layer || 0}`]));
      this.Card(cards, 'Render State', RenderStateRows(event.state, Num));
    }, true);
    if (!event.draw) { this.RawJson(root, event); return; }
    const defines = new Map();
    for (const source of program?.sources || []) for (const match of source.source?.matchAll(/^\s*#define\s+(\w+)(?:[ \t]+(.+))?$/gm) || []) {
      const entry = defines.get(match[1]) || { value: (match[2] || '').trim(), stages: new Set() }; entry.stages.add(source.stage[0]); defines.set(match[1], entry);
    }
    const materialDefines = Object.entries(d?.keywords || {});
    this.Fold(root, 'keywords', 'Keywords', defines.size, body => {
      if (materialDefines.length) {
        body.append(this.El('h4', 'Material defines'));
        const list = this.El('div', '', 'keywords'); for (const [name, value] of materialDefines) list.append(this.Keyword(name, value, '')); body.append(list);
      }
      const header = this.El('h4', '编译后 #define'); header.append(this.El('span', 'V = 仅顶点 · F = 仅片元', 'count')); body.append(header);
      const list = this.El('div', '', 'keywords');
      for (const [name, entry] of [...defines].sort((a, b) => a[0].localeCompare(b[0]))) list.append(this.Keyword(name, entry.value, entry.stages.size === 1 ? [...entry.stages][0] : ''));
      body.append(list);
    });
    const uniforms = event.uniforms.filter(uniform => uniform.group !== 'Textures');
    this.Fold(root, 'properties', 'Properties', `${(event.textures || []).length + uniforms.length}`, (body, tools) => {
      const filter = this.El('input'); filter.type = 'search'; filter.className = 'filter'; filter.placeholder = '筛选属性名'; filter.value = this.propertyFilter;
      filter.onclick = click => click.stopPropagation();
      tools.append(filter);
      const content = this.El('div'); body.append(content);
      const Draw = () => { content.replaceChildren(); this.PropertyTables(content, event, uniforms); };
      filter.oninput = () => { this.propertyFilter = filter.value.trim().toLowerCase(); Draw(); };
      Draw();
    }, true);
    this.Fold(root, 'buffers', 'Buffers', d ? d.attributes.length : null, body => {
      if (d) {
        body.append(this.El('h4', 'Vertex attributes'));
        this.Table(body, ['Name', 'Components', 'Type', 'Normalized', 'Count', 'Bytes', 'Divisor'], d.attributes.map(a => [a.name, String(a.itemSize), a.type, a.normalized ? 'Yes' : 'No', Count(a.count), Count(a.bytes), String(a.divisor)]));
        body.append(this.El('h4', 'Index buffer'));
        this.Table(body, ['Type', 'Indices', 'Instances'], [[event.drawInfo?.indexType || 'Non-indexed', Count(d.indices), Count(d.instances)]]);
      }
      const header = this.El('h4', 'Constant buffers · uniform blocks'); header.append(this.El('span', String(event.blocks.length), 'count')); body.append(header);
      if (event.blocks.length) this.Table(body, ['Block', 'Binding', 'Bytes'], event.blocks.map(block => [block.name, String(block.binding), Count(block.bytes)]));
      else body.append(this.El('div', '此程序不使用 uniform block。', 'muted'));
    });
    this.Fold(root, 'shader', `Shader · ${event.shaderName || d?.shader || 'program'}`, program?.sources.length ?? 0, (body, tools) => {
      for (const source of program?.sources || []) {
        const lines = (source.source || '').split('\n'), header = this.El('h4', `${source.stage} shader`); header.append(this.El('span', `${lines.length} 行 · 实际编译源码`, 'count'));
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
  PropertyTables(root, event, uniforms) {
    const filter = this.propertyFilter, Keep = name => !filter || name.toLowerCase().includes(filter);
    const textures = (event.textures || []).map((texture, i) => ({ texture, i })).filter(({ texture }) => Keep(`${texture.uniform} ${texture.name}`));
    const Header = (title, count) => { const h = this.El('h4', title); h.append(this.El('span', String(count), 'count')); root.append(h); };
    Header('Textures', textures.length);
    if (textures.length) this.Table(root, ['', 'Name', 'Unit', 'Sampler', 'Texture', 'Size', 'Format'], textures.map(({ texture, i }) => {
      const thumb = this.Thumbnail(event, texture, i);
      const name = this.El('span', texture.name);
      if (texture.source) {
        try {
          const url = new URL(texture.source, location.href);
          if (['http:', 'https:', 'blob:'].includes(url.protocol) || /^data:image\//i.test(url.href)) { const link = this.El('a', ' ↗'); link.href = url.href; link.target = '_blank'; link.rel = 'noopener'; link.title = url.href; name.append(link); }
        } catch { /* ignore invalid source */ }
      }
      const format = texture.format != null ? `${THREE_NAMES.format.get(texture.format) ?? texture.format} · ${THREE_NAMES.type.get(texture.type) ?? texture.type ?? ''}` : '—';
      return [thumb, `${texture.uniform.replace(/\[0\]$/, '')}${texture.arrayIndex || /\[0\]$/.test(texture.uniform) ? `[${texture.arrayIndex}]` : ''}`, String(texture.unit),
        GlslType(texture.sampler), name, texture.width ? `${texture.width}×${texture.height}${texture.depth > 1 ? `×${texture.depth}` : ''}` : '—', `${format}${texture.colorSpace && texture.colorSpace !== 'NoColorSpace' && texture.colorSpace !== '' ? ` · ${texture.colorSpace}` : ''}`];
    }));
    for (const group of ['Ints', 'Floats', 'Vectors', 'Matrices']) {
      const rows = uniforms.filter(uniform => uniform.group === group && Keep(uniform.name));
      Header(group, rows.length);
      if (rows.length) this.Table(root, ['Name', 'Value', 'Type'], rows.map(uniform => [uniform.name.replace(/\[0\]$/, ''), this.UniformValue(uniform), `${GlslType(uniform.type)}${uniform.size > 1 ? `[${uniform.size}]` : ''}`]));
    }
  }
  Thumbnail(event, texture, binding) {
    if (!/^SAMPLER_2D(_SHADOW)?$/.test(texture.sampler) || texture.name === 'Unbound') {
      const none = this.El('span', texture.name === 'Unbound' ? '未绑定' : /CUBE/.test(texture.sampler) ? 'Cube' : /3D|ARRAY/.test(texture.sampler) ? 'Array' : 'Int', 'thumb none'); return none;
    }
    const canvas = this.El('canvas', '', 'thumb'); canvas.title = '点击在上方预览区查看（该 DC 读到的内容）';
    canvas.onclick = () => this.ShowTexture(binding);
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
    return canvas;
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
      const { _target, _object, _textureHandles, uniforms, ...rest } = event;
      body.append(this.El('pre', JSON.stringify({ ...rest, uniforms: uniforms.length }, null, 2), 'json'));
    });
  }
  Download(blob, name) {
    const url = URL.createObjectURL(blob), link = this.El('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  Exit() { clearInterval(this.timer); this.debugger.Resume(); this.mesh?.Dispose(); this.mesh = null; if (this.win && !this.win.closed) this.win.close(); this.win = null; }
}
