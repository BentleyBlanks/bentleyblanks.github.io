// Frame Debugger 的 agent 接口：`window.Tengxian.FrameDebug`。
//
// 窗口给人看，这里给脚本 / agent 调：每个方法都只返回**纯 JSON**（图是 PNG data URL），
// 所以 `page.evaluate(() => Tengxian.FrameDebug.Event(285))` 原样可用；命令行包装见
// Script_FrameDebugCli.mjs，口径见 docs/Data_FrameDebugger.md「Agent 接口」。
//
// 约定：
//   · 事件用 0 起的 `index`（窗口里显示的 #编号 = index + 1）。
//   · 像素坐标是**图像坐标**：左上角 (0,0)，单位是该附件的像素（不是画布 CSS 像素）。
//   · 原始值（Pixels / PixelHistory）是附件里的真实浮点：HDR 不截断，深度在 [0,1]，
//     sRGB 靶读回来已是线性值。Image() 才是经过 Levels / 通道 / 曝光的 8 位显示图。
//   · 名字口径（label / nameSource）、合成分组（synthetic）与窗口完全相同。
import { EnumName, Primitives, RenderStateRows, ApiCall } from './Script_FrameDebugGl.mjs';

const R = value => value == null ? null : Math.round(value * 1e4) / 1e4;
const Sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const HELP = {
  conventions: 'index 0 起（窗口 #编号 = index+1）；像素为附件图像坐标，左上 (0,0)；Pixels/PixelHistory 返回真实浮点，Image 返回 8 位显示 PNG',
  methods: {
    'await Capture({ timeoutMs = 15000, waitGpu = true })': '冻结下一帧并等 GPU 计时返回；返回 Summary()。手动步进页面（manual=1）自动推一帧',
    'Release()': '释放捕获、恢复运行（等同窗口「禁用 / 继续」）',
    'Summary({ top = 12 })': '整帧：DC/事件/CPU/GPU、按树序的 Pass 与分组（含 GPU 占比）、最耗 GPU / CPU 的 DC',
    'Events({ text, kind, pass, target, object, material, shader, draw, minGpuMs, from, to, sort, limit = 100 })': '按条件筛事件；text 模糊匹配名字/路径/材质/Shader/目标；pass 为路径前缀；sort = order|gpu|cpu',
    'Event(index, { uniforms = true, filter, arrayLimit = 16, source = false, matrices = false })': '单个事件的完整详情（Unity 事件信息的同一份内容）',
    'Image(index, { attachment = 0, texture, channel, black, white, exposure, width = 1024 })': '该事件之后的渲染目标（或 texture = 采样器下标，读该 DC 看到的纹理）→ { width, height, png }',
    'Pixels(index, x, y, { attachment = 0, w = 1, h = 1 })': '该事件之后附件的原始值，rows[y][x] = [r,g,b,a]',
    'PixelHistory(x, y, { event = 最后一个, attachment = 0 })': '截至 event，所有写过同一纹理该像素的事件及写后的值（changed 标出真正改动的）',
    'Show(index, { attachment = 0 })': '把该事件的结果盖到游戏画面上（截游戏画布用）',
  },
};

export class FrameDebugAgent {
  /** @param {import('./Script_FrameDebugger.mjs').FrameDebugger} frameDebugger @param {{ Step?: () => void }} options Step 渲染一帧（StepFrames） */
  constructor(frameDebugger, { Step = null } = {}) { this.debugger = frameDebugger; this.Step = Step; }
  Help() { return HELP; }
  get _capture() {
    if (!this.debugger.frozen) throw new Error('没有冻结的捕获：先 await Tengxian.FrameDebug.Capture()');
    return this.debugger.capture;
  }
  _Event(index) {
    this._capture;
    const event = this.debugger._events[index];
    if (!event) throw new Error(`没有事件 ${index}（共 ${this.debugger._events.length} 个，index 从 0 起）`);
    return event;
  }
  async Capture({ timeoutMs = 15000, waitGpu = true } = {}) {
    const d = this.debugger, start = performance.now();
    d.RequestCapture();
    while (!d.frozen) {
      if (d.state === 'error') throw new Error(d.error);
      if (performance.now() - start > timeoutMs) { d.Resume(); throw new Error('捕获超时：这段时间里没有渲染提交（页面隐藏时没有 rAF，手动步进页面需要 Step）'); }
      // Armed StepFrames renders one frame without advancing simulation.
      if (d.state === 'armed') this.Step?.();
      if (!d.frozen) await Sleep(16);
    }
    while (waitGpu && d.frozen && d.capture.gpuStatus === 'pending' && performance.now() - start < timeoutMs) { d.Poll(); await Sleep(20); }
    return this.Summary();
  }
  Release() { this.debugger.Resume(); return { state: this.debugger.state }; }
  _Row(event) {
    const d = event.details, info = event.drawInfo;
    return { index: event.index, kind: event.kind, label: event.label, path: event.path, target: event.target,
      object: d?.path ?? null, material: d?.material ?? null, shader: event.shaderName || d?.shader || null,
      primitives: Primitives(info), instances: info ? info.parts.reduce((sum, part) => sum + part.instances, 0) : null,
      cpuMs: R(event.cpuMs), gpuMs: R(event.gpuMs) };
  }
  _Tree() {
    const passes = this._capture.passes, children = new Map(), order = [];
    for (const pass of passes) if (pass.last >= pass.first) (children.get(pass.parent) || children.set(pass.parent, []).get(pass.parent)).push(pass);
    const Walk = parent => { for (const pass of (children.get(parent) || []).sort((a, b) => a.first - b.first)) { order.push(pass); Walk(pass.id); } };
    Walk(null); return order;
  }
  Summary({ top = 12 } = {}) {
    const c = this._capture, total = c.gpuMs;
    return { id: c.id, capturedAt: c.capturedAt, size: [c.width, c.height], events: c.events.length, draws: c.events.filter(event => event.draw).length,
      commands: c.commandCount, cpuMs: R(c.cpuMs), gpuMs: R(c.gpuMs), gpuStatus: c.gpuStatus, backupMiB: R(c.bytes / 1048576),
      passes: this._Tree().map(pass => ({ id: pass.id, path: pass.path, depth: pass.depth ?? 0, synthetic: pass.synthetic || null,
        events: [pass.first, pass.last], draws: pass.draws, cpuMs: R(pass.cpuMs), gpuMs: R(pass.gpuMs), gpuShare: total && pass.gpuMs != null ? R(pass.gpuMs / total) : null })),
      topGpu: this.Events({ draw: true, sort: 'gpu', limit: top }).rows, topCpu: this.Events({ draw: true, sort: 'cpu', limit: top }).rows };
  }
  Events({ text = '', kind = '', pass = '', target = '', object = '', material = '', shader = '', draw = null, minGpuMs = null, from = 0, to = Infinity, sort = 'order', limit = 100 } = {}) {
    const Has = (value, needle) => !needle || String(value ?? '').toLowerCase().includes(String(needle).toLowerCase());
    let rows = this._capture.events.filter(event => event.index >= from && event.index <= to
      && (draw == null || event.draw === draw) && Has(event.kind, kind) && (!pass || event.path === pass || event.path.startsWith(`${pass}/`))
      && Has(event.target, target) && Has(event.details?.path, object) && Has(event.details?.material, material) && Has(event.shaderName || event.details?.shader, shader)
      && (minGpuMs == null || (event.gpuMs ?? -1) >= minGpuMs)
      && (!text || [event.label, event.path, event.target, event.details?.path, event.details?.material, event.shaderName, event.details?.shader, event.kind].some(value => Has(value, text))));
    if (sort === 'gpu' || sort === 'cpu') rows = rows.sort((a, b) => (b[`${sort}Ms`] ?? -1) - (a[`${sort}Ms`] ?? -1));
    return { count: rows.length, rows: rows.slice(0, limit).map(event => this._Row(event)) };
  }
  Event(index, { uniforms = true, filter = '', arrayLimit = 16, source = false, matrices = false } = {}) {
    const event = this._Event(index), d = event.details, gl = this.debugger.gl, capture = this._capture, program = capture.programs[event.programId];
    const Trim = value => Array.isArray(value) && value.length > arrayLimit ? { first: value.slice(0, arrayLimit), length: value.length } : value;
    const defines = {};
    for (const stage of program?.sources || []) for (const match of stage.source?.matchAll(/^\s*#define\s+(\w+)(?:[ \t]+(.+))?$/gm) || []) defines[match[1]] = (match[2] || '').trim();
    const object = d ? { name: d.name, nameSource: d.nameSource, object: d.object, objectType: d.objectType, objectId: d.objectId, path: d.path,
      geometry: d.geometry, geometryType: d.geometryType, vertices: d.vertices, indices: d.indices, instances: d.instances, drawRange: d.drawRange, group: d.group,
      material: d.material, materialType: d.shader, materialFlags: d.materialFlags, phase: d.phase, renderOrder: d.renderOrder, camera: d.camera,
      castShadow: d.castShadow, receiveShadow: d.receiveShadow, frustumCulled: d.frustumCulled, source: d.source, materialDefines: d.keywords,
      attributes: d.attributes, ...(matrices ? { worldMatrix: d.worldMatrix, viewMatrix: d.viewMatrix, projectionMatrix: d.projectionMatrix } : {}) } : null;
    return { ...this._Row(event), api: ApiCall(gl, event), batchCause: event.batchCause, cpuGlCallMs: R(event.cpuSubmitMs), draw: event.drawInfo,
      object, renderTarget: { name: event.target, size: event.targetSize, initialAction: event._target.initialAction ?? null,
        attachments: event._target.attachments.map((attachment, i) => ({ index: i, name: attachment.name, format: EnumName(gl, attachment.format),
          width: attachment.width, height: attachment.height, samples: attachment.samples, depth: !!attachment.depth, stencil: !!attachment.stencil })) },
      state: Object.fromEntries(RenderStateRows(event.state).map(([key, value]) => [key, typeof value === 'string' ? value : String(value)])),
      clear: event.kind === 'Clear' ? { color: event.state.COLOR_CLEAR_VALUE, depth: event.state.DEPTH_CLEAR_VALUE, stencil: event.state.STENCIL_CLEAR_VALUE } : undefined,
      program: event.draw ? { id: event.programId, name: program?.name ?? null } : undefined,
      textures: event.textures?.map((texture, binding) => ({ binding, uniform: texture.uniform, arrayIndex: texture.arrayIndex, unit: texture.unit, sampler: texture.sampler,
        name: texture.name, width: texture.width ?? null, height: texture.height ?? null, format: texture.format ?? null, type: texture.type ?? null,
        colorSpace: texture.colorSpace ?? null, isDepth: !!texture.isDepth, source: texture.source ?? null, previewable: /^SAMPLER_2D(_SHADOW)?$/.test(texture.sampler) && texture.name !== 'Unbound' })),
      uniforms: uniforms && event.draw ? event.uniforms.filter(uniform => uniform.group !== 'Textures' && (!filter || uniform.name.toLowerCase().includes(filter.toLowerCase())))
        .map(uniform => ({ name: uniform.name.replace(/\[0\]$/, ''), type: uniform.type, size: uniform.size, value: Trim(uniform.value) })) : undefined,
      blocks: event.draw ? event.blocks : undefined, defines: event.draw ? defines : undefined,
      sources: source && program ? Object.fromEntries(program.sources.map(stage => [stage.stage, stage.source])) : undefined };
  }
  Image(index, { attachment = 0, texture = null, channel = 'rgba', black = 0, white = 1, exposure = 0, width = 1024 } = {}) {
    const event = this._Event(index), options = { channel, black, white, exposure, width };
    const output = texture == null ? this.debugger.Preview(index, attachment, options) : this.debugger.TexturePreview(index, texture, options);
    const canvas = document.createElement('canvas'); canvas.width = output.width; canvas.height = output.height;
    const context = canvas.getContext('2d'), data = context.createImageData(output.width, output.height); data.data.set(output.pixels); context.putImageData(data, 0, 0);
    const source = texture == null ? event._target.attachments[attachment] : event.textures[texture];
    return { index, width: output.width, height: output.height, source: texture == null ? `${event.target}/${source.name}` : `${source.uniform}:${source.name}`,
      sourceSize: [source.width ?? null, source.height ?? null], png: canvas.toDataURL('image/png') };
  }
  Pixels(index, x, y, { attachment = 0, w = 1, h = 1 } = {}) {
    this._Event(index);
    return { index, x, y, attachment, ...this.debugger.ReadPixels(index, attachment, x, y, w, h) };
  }
  PixelHistory(x, y, { event = this.debugger._events.length - 1, attachment = 0 } = {}) {
    this._Event(event);
    return this.debugger.PixelHistory(x, y, { event, attachment });
  }
  Show(index, { attachment = 0 } = {}) {
    this._Event(index);
    this.debugger.Present(this.debugger.Preview(index, attachment, { width: this.debugger._events[index]._target.attachments[attachment]?.width || 1920 }));
    return { shown: index };
  }
}
