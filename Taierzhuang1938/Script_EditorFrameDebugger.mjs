import { FrameDebugMesh } from './Script_FrameDebugMesh.mjs';

const CSS = `
*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;background:#151920;color:#dfe5ed;font:12px/1.5 system-ui,sans-serif}
header{padding:12px 16px;background:#202733;display:flex;align-items:center;gap:14px}h1{font-size:18px;margin:0}small,.muted{color:#9eabbc}
button,input,select{font:inherit;color:inherit;background:#252d3a;border:1px solid #495569;border-radius:4px;padding:5px 8px}button{cursor:pointer}button:hover{background:#34445b}button:disabled{opacity:.4;cursor:default}
.toolbar{display:flex;align-items:center;gap:7px;padding:9px 14px;flex-wrap:wrap;border-bottom:1px solid #343e4e}.toolbar input[type=range]{flex:1;min-width:120px}.toolbar input[type=number]{width:72px}
#status{padding:8px 16px;color:#b9d7f2;background:#192330}main{display:grid;grid-template-columns:360px minmax(350px,1fr);height:calc(100vh - 152px)}aside{overflow:auto;border-right:1px solid #343e4e;padding:10px}.right{overflow:auto;padding:12px 18px}
.search{width:100%;margin-bottom:8px}.legend,.event,.pass{display:grid;grid-template-columns:minmax(0,1fr) 67px 67px;gap:4px;align-items:center}.legend{position:sticky;top:0;background:#151920;color:#9eabbc;padding:4px}.event{width:100%;border:0;border-radius:0;padding:5px 7px;font:11px Consolas,monospace;text-align:right;background:transparent}.event span:first-child{text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.event.on{background:#315681;color:#fff}.event:hover{background:#26384d}.pass{font-weight:600;padding:6px 0;font-size:11px;cursor:pointer}summary{list-style-position:inside}summary span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}details{border-bottom:1px solid #303947}details>pre{padding:8px}
.preview{position:relative;min-height:180px;background:repeating-conic-gradient(#222b38 0% 25%,#19222e 0% 50%) 0/20px 20px;border:1px solid #39485c;overflow:auto;text-align:center}.preview canvas{max-width:100%;height:auto;vertical-align:middle}.preview.zoom canvas{max-width:none}#mesh{display:none;touch-action:none;cursor:grab}h2{font-size:14px;color:#97c8f7;margin:16px 0 8px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.55 Consolas,monospace;margin:0}table{width:100%;border-collapse:collapse;font:11px/1.5 Consolas,monospace}td,th{text-align:left;border-bottom:1px solid #303947;padding:4px 6px;vertical-align:top;overflow-wrap:anywhere}td:last-child{max-width:520px}a{color:#a9d3ff}.error{color:#ffae98}.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.pill{padding:2px 7px;border:1px solid #496787;border-radius:12px}.spacer{flex:1}@media(max-width:850px){main{grid-template-columns:280px minmax(320px,1fr)}}`;
const Ms = value => value == null ? '—' : value < 0.001 ? '<.001' : value.toFixed(3);

export class FrameDebuggerEditor {
  static id = 'frameDebugger';
  static label = 'Frame Debugger';
  static hint = '独立窗口：冻结一帧、逐 DC / Pass 回放、CPU / GPU 耗时、渲染靶 / 网格 / Shader 检查';
  static keepOnClose = true;
  constructor(host) { this.host = host; this.debugger = host.game.FrameDebugger; this.win = null; this.mesh = null; this.lastRevision = -1; this.captureId = null; this.filter = ''; this.sort = 'order'; }
  Enter() {
    this.win = window.open('', this.debugger.windowName, 'width=1360,height=960,menubar=no,toolbar=no');
    if (!this.win) throw new Error('Frame Debugger 独立窗口被浏览器拦截，请允许弹窗后重试');
    const doc = this.win.document; this.doc = doc;
    doc.open(); doc.write('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>台儿庄 · Frame Debugger</title></head><body></body></html>'); doc.close();
    const style = doc.createElement('style'); style.textContent = CSS; doc.head.append(style);
    doc.body.innerHTML = `<header><h1>Frame Debugger</h1><span class="pill">台儿庄 1938 · WebGL 2</span><span class="spacer"></span><small>CPU / GPU · ms</small></header>
      <div class="toolbar"><select id="target" aria-label="捕获目标"><option>当前游戏 · ${location.host}</option></select><button id="capture">启用 / 捕获当前帧</button><button id="resume">禁用 / 继续</button><button id="save">导出报告</button><button id="previous" title="←">◀</button><input id="scrubber" aria-label="渲染事件" type="range" min="0" max="0" value="0"><button id="next" title="→">▶</button><input id="index" aria-label="事件编号" type="number" min="1" value="1"><span id="count">/ 0</span></div>
      <div id="status">点击捕获，冻结下一次完整渲染提交。← / → 步进；Home / End 首尾；Esc 继续。</div>
      <main><aside><input id="search" class="search" placeholder="搜索 Pass / 对象 / 材质 / Shader"><div class="row"><select id="sort"><option value="order">事件顺序</option><option value="gpu">GPU 最耗时</option><option value="cpu">CPU 最耗时</option></select><button id="expand">展开全部</button><button id="collapse">折叠全部</button></div><div class="legend"><span>事件 / Pass</span><span>CPU ms</span><span>GPU ms</span></div><div id="events"></div></aside>
      <section class="right"><div class="row"><h2 id="selected">尚未捕获</h2><span class="spacer"></span><label><input id="syncView" type="checkbox" checked> 同步游戏画面</label><button id="locate">定位源对象</button></div>
      <div class="toolbar"><select id="view"><option value="output">Output 渲染结果</option><option value="mesh">Mesh 网格</option></select><select id="attachment" aria-label="渲染目标附件"></select><select id="channel" aria-label="颜色通道"><option value="rgba">RGBA</option><option value="rgb">RGB</option><option value="r">R</option><option value="g">G</option><option value="b">B</option><option value="a">Alpha</option></select><label>黑 <input id="black" type="number" value="0" step=".01"></label><label>白 <input id="white" type="number" value="1" step=".01"></label><label>EV <input id="exposure" type="number" value="0" step=".5"></label><button id="png">保存 PNG</button><button id="zoom">适应 / 1:1</button></div>
      <div id="meshControls" class="toolbar" hidden><select id="meshMode"><option value="shaded">Shaded</option><option value="uvChecker">UV Checker</option><option value="uvLayout">UV Layout</option><option value="vertexColor">Vertex Color</option><option value="normals">Normals</option><option value="tangents">Tangents</option><option value="blendshapes">Blendshapes / 当前形变</option></select><label><input id="wireframe" type="checkbox"> Wireframe</label><label>形变 <input id="morph" type="range" min="0" max="1" step=".01" value="1"></label><small>拖动旋转 · 滚轮缩放</small></div>
      <div id="preview" class="preview"><canvas id="output"></canvas><canvas id="mesh"></canvas></div><div id="previewError" class="error"></div><div id="properties"></div>
      <p class="muted">GPU 来自当前冻结帧的一次完整命令回放，查询异步返回；— 表示未返回或不可用。CPU 为捕获时提交（含绘制准备），已扣除检查开销。Pass GPU 包含状态设置、上传与子事件；父行包含子行，勿重复相加。缓存与查询插桩会影响耗时，趋势请用 Profiler。</p></section></main>`;
    this.ui = Object.fromEntries([...doc.querySelectorAll('[id]')].map(el => [el.id, el]));
    const ui = this.ui;
    ui.capture.onclick = () => { this.debugger.RequestCapture(); this.Update(); };
    ui.resume.onclick = () => { this.debugger.Resume(); this.Update(); };
    ui.previous.onclick = () => this.Select(this.debugger.selected - 1);
    ui.next.onclick = () => this.Select(this.debugger.selected + 1);
    ui.scrubber.oninput = () => this.Select(Number(ui.scrubber.value));
    ui.index.onchange = () => this.Select(Number(ui.index.value) - 1);
    ui.search.oninput = () => { this.filter = ui.search.value.toLowerCase(); this.BuildTree(); };
    ui.sort.onchange = () => { this.sort = ui.sort.value; this.BuildTree(); };
    ui.expand.onclick = () => ui.events.querySelectorAll('details').forEach(el => { el.open = true; });
    ui.collapse.onclick = () => ui.events.querySelectorAll('details').forEach(el => { el.open = false; });
    for (const id of ['view', 'attachment', 'channel', 'black', 'white', 'exposure', 'meshMode', 'wireframe', 'morph']) ui[id].onchange = () => this.DrawPreview();
    ui.syncView.onchange = () => { if (!ui.syncView.checked) this.debugger.Present(); else this.DrawPreview(); };
    ui.zoom.onclick = () => ui.preview.classList.toggle('zoom');
    ui.save.onclick = () => this.Download(new Blob([JSON.stringify(this.debugger.Inspect(), null, 2)], { type: 'application/json' }), `FrameCapture_${this.debugger.capture?.id || 0}.json`);
    ui.png.onclick = () => (ui.view.value === 'mesh' ? ui.mesh : ui.output).toBlob(blob => { if (blob) this.Download(blob, `FrameCapture_Event${this.debugger.selected + 1}.png`); });
    ui.locate.onclick = () => {
      const ref = this.debugger._events[this.debugger.selected]?._object;
      if (!ref) return;
      console.info('[Frame Debugger] Captured source object', ref.object, ref.geometry, ref.material);
      this.debugger.selection = { object: ref.object, geometry: ref.geometry, material: ref.material };
      ui.previewError.textContent = `源对象：${this.debugger._events[this.debugger.selected].details.path} · 已存入 Tengxian.FrameDebugger.selection，可在控制台检查。`;
    };
    doc.addEventListener('keydown', event => {
      if (/INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
      const delta = event.shiftKey ? 10 : 1;
      if (event.key === 'ArrowLeft') this.Select(this.debugger.selected - delta);
      else if (event.key === 'ArrowRight') this.Select(this.debugger.selected + delta);
      else if (event.key === 'Home') this.Select(0);
      else if (event.key === 'End') this.Select(this.debugger._events.length - 1);
      else if (event.key === 'Escape') { this.debugger.Resume(); this.Update(); }
      else return;
      event.preventDefault();
    });
    this.timer = setInterval(() => this.Update(), 100);
    this.Update(); return this;
  }
  El(tag, text = '', className = '') { const el = this.doc.createElement(tag); el.textContent = text; if (className) el.className = className; return el; }
  Update() {
    if (!this.win || this.win.closed) { this.host.CloseFrameDebugger(); return; }
    this.debugger.Poll();
    if (this.lastRevision === this.debugger.revision) return;
    this.lastRevision = this.debugger.revision;
    const capture = this.debugger.capture, ui = this.ui, ready = this.debugger.frozen;
    for (const id of ['resume', 'save', 'previous', 'next', 'scrubber', 'index', 'png', 'locate']) ui[id].disabled = !ready;
    if (!capture || !ready) {
      ui.status.textContent = this.debugger.error || (this.debugger.state === 'armed' ? '等待下一次渲染提交…' : '游戏运行中 · 点击捕获当前帧');
      if (!capture) {
        ui.events.replaceChildren(); ui.properties.replaceChildren(); ui.selected.textContent = '尚未捕获';
        if (this.captureId !== null) { this.mesh?.Clear(); ui.output.getContext('2d').clearRect(0, 0, ui.output.width, ui.output.height); }
      }
      this.captureId = null; return;
    }
    const statuses = { ready: '已返回', pending: '等待 GPU', unavailable: '扩展不可用', disjoint: 'GPU 时钟失效', timeout: '查询超时' };
    ui.status.textContent = `帧 #${capture.id} · ${capture.events.filter(event => event.draw).length} DC / ${capture.events.length} 事件 · CPU ${Ms(capture.cpuMs)} ms · GPU Σ ${Ms(capture.gpuMs)} ms (${statuses[capture.gpuStatus]}) · ${(capture.bytes / 1048576).toFixed(1)} MiB · 世界已冻结`;
    ui.previous.disabled = this.debugger.selected <= 0;
    ui.next.disabled = this.debugger.selected >= capture.events.length - 1;
    this.BuildTree();
    if (this.captureId !== capture.id) { this.captureId = capture.id; this.Select(capture.events.length - 1); }
  }
  BuildTree() {
    const capture = this.debugger.capture; if (!capture || !this.debugger.frozen) return;
    const root = this.ui.events, scroll = this.ui.events.parentElement.scrollTop;
    const closed = new Set([...root.querySelectorAll('details:not([open])')].map(el => el.dataset.pass));
    root.replaceChildren();
    const Match = event => !this.filter || `${event.index + 1} ${event.path} ${event.label} ${event.details?.material || ''} ${event.details?.shader || ''}`.toLowerCase().includes(this.filter);
    const AddEvent = (event, parent) => {
      if (!Match(event)) return;
      const row = this.El('button', '', `event${event.index === this.debugger.selected ? ' on' : ''}`); row.dataset.event = event.index;
      row.append(this.El('span', `${event.index + 1} · ${event.kind} ${event.label}`), this.El('span', Ms(event.cpuMs)), this.El('span', Ms(event.gpuMs)));
      row.title = `${event.path}\n${event.details?.path || event.target}`; row.onclick = () => this.Select(event.index); parent.append(row);
    };
    if (this.sort !== 'order') {
      [...capture.events].sort((a, b) => (b[`${this.sort}Ms`] ?? -1) - (a[`${this.sort}Ms`] ?? -1)).forEach(event => AddEvent(event, root));
    } else {
      const groups = new Map();
      for (const pass of capture.passes) {
        if (pass.last < pass.first || !capture.events.slice(pass.first, pass.last + 1).some(Match)) continue;
        const group = this.El('details'); group.open = !closed.has(String(pass.id)); group.dataset.pass = pass.id;
        const title = this.El('summary', '', 'pass');
        title.append(this.El('span', `${pass.name} (${pass.draws} DC)`), this.El('span', Ms(pass.cpuMs)), this.El('span', Ms(pass.gpuMs)));
        title.title = '双击跳到此 Pass 结束'; title.ondblclick = () => this.Select(pass.last);
        group.append(title); groups.set(pass.id, group);
      }
      // Merge pass groups and free events by first event to preserve frame order.
      const AddChildren = (parentId, parent) => {
        const items = [...capture.passes.filter(pass => pass.parent === parentId && groups.has(pass.id)).map(pass => ({ at: pass.first, pass })),
          ...capture.events.filter(event => event.pass === parentId).map(event => ({ at: event.index, event }))].sort((a, b) => a.at - b.at);
        for (const item of items) if (item.pass) { const group = groups.get(item.pass.id); parent.append(group); AddChildren(item.pass.id, group); } else AddEvent(item.event, parent);
      };
      AddChildren(null, root);
    }
    this.ui.events.parentElement.scrollTop = scroll;
  }
  Select(index) {
    if (!this.debugger.frozen) return;
    this.debugger.selected = Math.max(0, Math.min(index, this.debugger._events.length - 1));
    const event = this.debugger._events[this.debugger.selected]; if (!event) return;
    const ui = this.ui;
    ui.scrubber.max = this.debugger._events.length - 1; ui.scrubber.value = event.index;
    ui.index.max = this.debugger._events.length; ui.index.value = event.index + 1; ui.count.textContent = `/ ${this.debugger._events.length}`;
    ui.previous.disabled = event.index === 0; ui.next.disabled = event.index === this.debugger._events.length - 1;
    ui.selected.textContent = `#${event.index + 1} ${event.label} · ${event.target}`;
    ui.attachment.replaceChildren();
    event._target.attachments.forEach((attachment, i) => { const option = this.El('option', `${attachment.name} · ${attachment.width}×${attachment.height}`); option.value = i; option.disabled = attachment.stencil; ui.attachment.append(option); });
    ui.view.querySelector('[value=mesh]').disabled = !event._object;
    if (!event._object) ui.view.value = 'output';
    const attributes = event._object?.geometry.attributes || {};
    for (const [mode, enabled] of Object.entries({ uvChecker: !!attributes.uv, uvLayout: !!attributes.uv,
      vertexColor: !!attributes.color, normals: !!attributes.normal, tangents: !!attributes.tangent,
      blendshapes: !!event._object?.object.morphTargetInfluences?.length })) ui.meshMode.querySelector(`[value=${mode}]`).disabled = !enabled;
    if (ui.meshMode.selectedOptions[0]?.disabled) ui.meshMode.value = 'shaded';
    this.BuildTree(); this.Properties(event); this.DrawPreview();
    const row = ui.events.querySelector(`[data-event="${event.index}"]`);
    for (let parent = row?.parentElement; parent && parent !== ui.events; parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true;
    row?.scrollIntoView({ block: 'nearest' });
  }
  Properties(event) {
    const root = this.ui.properties; root.replaceChildren();
    const Section = (title, value, open = false) => {
      const box = this.El('details'); box.open = open; box.append(this.El('summary', title));
      const pre = this.El('pre', typeof value === 'string' ? value : JSON.stringify(value, null, 2)); box.append(pre); root.append(box);
    };
    Section('Details · 绘制与 RenderTarget', { api: event.api, draw: event.drawInfo, args: event.args, cpuMs: event.cpuMs, cpuGlCallMs: event.cpuSubmitMs, gpuMs: event.gpuMs,
      pass: event.path, target: event.target, attachments: this.debugger.Inspect().events[event.index].attachments,
      batchCause: event.batchCause, ...event.details }, true);
    Section('Render State · Blend / Depth / Stencil / Raster', event.state);
    const sources = this.debugger.capture.programs[event.programId]?.sources || [];
    Section('Keywords · GLSL defines', sources.flatMap(source => (source.source?.match(/^\s*#define\s+[^\n]+/gm) || []).map(define => `${source.stage}: ${define.trim()}`)));
    for (const group of ['Textures', 'Ints', 'Floats', 'Vectors', 'Matrices']) Section(group,
      group === 'Textures' ? { bindings: event.textures || [], samplers: event.uniforms.filter(uniform => uniform.group === group), materialTextures: event.details?.textures || [] } : event.uniforms.filter(uniform => uniform.group === group));
    const assets = [...new Map((event.textures || []).filter(texture => texture.source).map(texture => [texture.source, texture])).values()];
    if (assets.length) {
      const box = this.El('details'); box.append(this.El('summary', 'Texture assets · 纹理源文件'));
      for (const texture of assets) {
        let source;
        try { source = new URL(texture.source, location.href); } catch { continue; }
        if (!['http:', 'https:', 'blob:'].includes(source.protocol) && !(source.protocol === 'data:' && /^data:image\//i.test(source.href))) continue;
        const row = this.El('div', '', 'toolbar'), link = this.El('a', `${texture.name} · ${texture.width}×${texture.height}`);
        link.href = source.href; link.target = '_blank'; link.rel = 'noopener'; row.append(link); box.append(row);
      }
      root.append(box);
    }
    Section('Buffers · vertex / index', event.details ? { attributes: event.details.attributes, indices: event.details.indices, group: event.details.group } : []);
    Section('Constant Buffers · WebGL uniform blocks', event.blocks);
    for (const source of sources) Section(`${source.stage} Shader · 实际编译源码`, source.source);
    Section('平台对应', 'Unity Editor 的 Project/Hierarchy 由“定位源对象”对应；Unity SRP/SRP Batcher、原生远程 Player、Compute/Geometry/Tessellation Shader 与 memoryless/load-store 声明不是本游戏 WebGL2 管线功能，不伪造数据。当前目标是本游戏页面。');
  }
  DrawPreview() {
    if (!this.debugger.frozen) return;
    const ui = this.ui; ui.previewError.textContent = '';
    const isMesh = ui.view.value === 'mesh'; ui.output.style.display = isMesh ? 'none' : 'inline'; ui.mesh.style.display = isMesh ? 'inline' : 'none'; ui.meshControls.hidden = !isMesh;
    try {
      const output = !isMesh || ui.syncView.checked ? this.debugger.Preview(this.debugger.selected, Number(ui.attachment.value), {
        channel: ui.channel.value, black: Number(ui.black.value), white: Number(ui.white.value), exposure: Number(ui.exposure.value),
        width: this.debugger._events[this.debugger.selected]?._target.attachments[Number(ui.attachment.value)]?.width || 1920 }) : null;
      if (output && ui.syncView.checked) this.debugger.Present(output);
      if (isMesh) {
        this.mesh ??= new FrameDebugMesh(ui.mesh);
        this.mesh.SetEvent(this.debugger._events[this.debugger.selected], ui.meshMode.value, ui.wireframe.checked, Number(ui.morph.value));
      } else {
        if (!output) return;
        ui.output.width = output.width; ui.output.height = output.height;
        const context = ui.output.getContext('2d'), data = context.createImageData(output.width, output.height); data.data.set(output.pixels); context.putImageData(data, 0, 0);
      }
    } catch (error) { ui.previewError.textContent = String(error.message || error); }
    this.lastRevision = this.debugger.revision;
  }
  Download(blob, name) {
    const url = URL.createObjectURL(blob), link = this.El('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  Exit() { clearInterval(this.timer); this.debugger.Resume(); this.mesh?.Dispose(); this.mesh = null; if (this.win && !this.win.closed) this.win.close(); this.win = null; }
}
