import { CopyValue, SaveGlState, EnumName, ReadProgram, ReadDrawState, DescribeFramebuffer, CopyAttachment, ReadOutput, ReadTexture, ReadRaw } from './Script_FrameDebugGl.mjs';

const DRAW = /^(drawArrays|drawElements|drawRangeElements)(Instanced)?$|^multiDraw/;
const EVENT = /^(drawArrays|drawElements|drawRangeElements)(Instanced)?$|^multiDraw|^clear$|^clearBuffer|^blitFramebuffer$|^copyTex|^generateMipmap$/;
// Program building and immutable texture allocation are one-time object setup,
// not frame content. Replaying linkProgram invalidates every uniform location
// three.js holds (the object then vanishes from replay AND from the live game
// after Resume); replaying texStorage* on the now-immutable texture is
// INVALID_OPERATION. The objects outlive the capture, so the replay never needs them.
const IGNORE = /^(get|is|create|delete|check|readPixels|finish|flush|beginQuery|endQuery|fenceSync|clientWaitSync|waitSync|shaderSource|compileShader|attachShader|detachShader|linkProgram|validateProgram|bindAttribLocation|transformFeedbackVaryings|texStorage)/;
const LIMIT_BYTES = 768 * 1024 * 1024;
let nextCaptureId = 0;

function ObjectPath(object) {
  const names = [];
  for (let item = object; item; item = item.parent) names.unshift(item.name || `${item.type}#${item.id}`);
  return names.join('/');
}
function TextureInfo(texture) {
  const image = texture?.image;
  return { id: texture.id, name: texture.name || `Texture#${texture.id}`, width: image?.width, height: image?.height,
    depth: image?.depth, format: texture.format, type: texture.type, colorSpace: texture.colorSpace, isDepth: !!texture.isDepthTexture,
    mipmaps: !!texture.generateMipmaps, source: texture.userData?.source || image?.currentSrc || image?.src || null };
}
function NamedAncestor(object) {
  for (let item = object.parent; item; item = item.parent) if (item.name && !item.isScene) return item.name;
  return null;
}
// Unnamed full-screen materials are still reachable from the pass that owns
// them (`materialCompose`, `blur.material`); that field name is the real name.
function FieldName(owner, value) {
  if (!owner || typeof owner !== 'object') return null;
  for (const key of Object.keys(owner)) {
    const field = owner[key];
    if (field === value) return key;
    if (!field || typeof field !== 'object' || field.isObject3D || field.isTexture || ArrayBuffer.isView(field)) continue;
    if (Array.isArray(field)) { const i = field.indexOf(value); if (i >= 0) return `${key}[${i}]`; }
    else if (Object.getPrototypeOf(field) === Object.prototype) for (const inner of Object.keys(field)) if (field[inner] === value) return `${key}.${inner}`;
  }
  return null;
}
function MaskLabel(gl, mask) {
  const parts = [[gl.COLOR_BUFFER_BIT, 'Color'], [gl.DEPTH_BUFFER_BIT, 'Depth'], [gl.STENCIL_BUFFER_BIT, 'Stencil']].filter(([bit]) => mask & bit).map(([, name]) => name);
  return `(${parts.join(' ') || 'nothing'})`;
}
const PHASE_GROUPS = { Skybox: 'DrawSkybox', Opaque: 'DrawOpaqueObjects', Transparent: 'DrawTransparentObjects' };

function DrawInfo(gl, name, args) {
  if (!DRAW.test(name)) return null;
  const indexed = /Elements/.test(name), instanced = /Instanced/.test(name), multi = /^multiDraw/.test(name);
  const parts = [];
  if (multi) {
    const count = args.at(-1);
    for (let i = 0; i < count; i++) parts.push(indexed
      ? { count: args[1][args[2] + i], offsetBytes: args[4][args[5] + i], instances: instanced ? args[6][args[7] + i] : 1 }
      : { first: args[1][args[2] + i], count: args[3][args[4] + i], instances: instanced ? args[5][args[6] + i] : 1 });
  } else if (name === 'drawRangeElements') parts.push({ count: args[3], offsetBytes: args[5], instances: 1 });
  else parts.push(indexed ? { count: args[1], offsetBytes: args[3], instances: instanced ? args[4] : 1 }
    : { first: args[1], count: args[2], instances: instanced ? args[3] : 1 });
  return { topology: EnumName(gl, args[0]), indexed, batch: multi, submissions: 1, subDraws: parts.length,
    indexType: indexed ? EnumName(gl, name === 'drawRangeElements' ? args[4] : multi ? args[3] : args[2]) : null,
    elements: parts.reduce((sum, part) => sum + part.count * part.instances, 0), parts };
}

export class FrameDebugger {
  constructor(renderer, { post = null, profiler = null, onFreeze = null, onResume = null } = {}) {
    this.renderer = renderer; this.gl = renderer.getContext(); this.post = post; this.profiler = profiler;
    this.windowName = `tengxianFrameDebugger_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    this.onFreeze = onFreeze; this.onResume = onResume;
    this.state = 'idle'; this.capture = null; this.selected = -1; this.revision = 0; this.error = '';
    this._hooks = []; this._mute = 0; this._timer = this.gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this._OnLost = () => { this.error = 'WebGL context lost; capture released'; this.Resume(); };
    this._OnRestored = () => { this._timer = this.gl.getExtension('EXT_disjoint_timer_query_webgl2'); this.error = ''; this.revision++; };
    this._OnResize = () => { if (this.frozen || this.state === 'armed') { this.error = 'Viewport changed; capture released'; this.Resume(); } };
    renderer.domElement.addEventListener('webglcontextlost', this._OnLost);
    renderer.domElement.addEventListener('webglcontextrestored', this._OnRestored);
    globalThis.addEventListener?.('resize', this._OnResize);
  }
  get frozen() { return this.state === 'frozen'; }
  RequestCapture() {
    if (this.state === 'capturing') return;
    this.Resume(); this.error = ''; this.state = 'armed'; this.revision++;
    this._resumeProfiler = !!this.profiler?.recording;
    this.profiler?.Pause(); // TIME_ELAPSED queries cannot nest with Profiler.
  }
  _Inspect(fn) {
    this._mute++;
    const start = performance.now();
    try { return fn(); } finally { this._overhead += performance.now() - start; this._mute--; }
  }
  _Hook(object, key, make) {
    const original = object[key], own = Object.hasOwn(object, key), wrapper = make(original);
    object[key] = wrapper;
    this._hooks.push(() => { if (object[key] !== wrapper) return; if (own) object[key] = original; else delete object[key]; });
  }
  BeginRender() {
    if (this.state !== 'armed') return false;
    const gl = this.gl;
    this.state = 'capturing'; this._overhead = 0; this._bytes = 0; this._start = performance.now();
    this._commands = []; this._events = []; this._passes = []; this._stack = []; this._copies = [];
    this._framebuffers = new Map(); this._programs = new Map(); this._buffers = new Map(); this._savedObjects = new Map();
    this._deletes = []; this._object = null; this._pendingTarget = this.renderer.getRenderTarget();
    this._renders = []; this._owners = new Map(); this._replayedAt = null;
    this._initial = SaveGlState(gl);
    this._currentProgram = gl.getParameter(gl.CURRENT_PROGRAM);
    if (this._currentProgram) this._programs.set(this._currentProgram, ReadProgram(gl, this._currentProgram));
    this.capture = { id: ++nextCaptureId, capturedAt: new Date().toISOString(), width: gl.drawingBufferWidth, height: gl.drawingBufferHeight,
      events: this._events, passes: this._passes, programs: [], cpuMs: 0, gpuMs: null,
      gpuStatus: this._timer ? 'pending' : 'unavailable', timingNote: 'CPU: captured submission including draw setup, excluding inspection. GPU: one frozen command-stream replay, disjoint non-overlapping queries; Pass totals include state changes/uploads and child draws. Replay does not advance simulation; cache/query overhead can affect timings.' };
    try {
      const names = new Set();
      for (let p = gl; p; p = Object.getPrototypeOf(p)) for (const name of Object.getOwnPropertyNames(p)) if (typeof gl[name] === 'function') names.add(name);
      for (const name of names) {
        if (name === 'constructor' || name.startsWith('_')) continue;
        if (name.startsWith('delete')) {
          this._Hook(gl, name, original => (...args) => {
            if (this._mute) return original.apply(gl, args);
            this._deletes.push(() => original.apply(gl, args));
          });
        } else if (!IGNORE.test(name)) this._Hook(gl, name, original => (...args) => this._Call(name, original, args));
      }
      const multiDraw = gl.getExtension('WEBGL_multi_draw');
      if (multiDraw) for (const name of ['multiDrawArraysWEBGL', 'multiDrawElementsWEBGL', 'multiDrawArraysInstancedWEBGL', 'multiDrawElementsInstancedWEBGL']) {
        if (typeof multiDraw[name] === 'function') this._Hook(multiDraw, name, original => (...args) => this._Call(name, original, args, multiDraw));
      }
      this._Hook(this.renderer, 'setRenderTarget', original => (...args) => {
        this._pendingTarget = args[0]; this._face = args[1] || 0; this._mip = args[2] || 0;
        return original.apply(this.renderer, args);
      });
      this._Hook(this.renderer, 'renderBufferDirect', original => (camera, scene, geometry, material, object, group) => {
        const previous = this._object, previousScope = this._drawScope;
        this._object = { camera, scene, geometry, material, object, group };
        this._drawScope = { start: performance.now(), overhead: this._overhead };
        try { return original.call(this.renderer, camera, scene, geometry, material, object, group); }
        finally { this._object = previous; this._drawScope = previousScope; }
      });
      this._Hook(this.renderer.shadowMap, 'render', original => (...args) => {
        if (!this.renderer.shadowMap.enabled || !this.renderer.shadowMap.needsUpdate && !this.renderer.shadowMap.autoUpdate || !args[0]?.length) return original.apply(this.renderer.shadowMap, args);
        this.Push('shadow'); try { return original.apply(this.renderer.shadowMap, args); } finally { this.Pop(); }
      });
      for (const pass of this.post?.passes || []) {
        this._Hook(pass, 'Render', original => (...args) => {
          this.Push(pass.name, pass); try { return original.apply(pass, args); } finally { this.Pop(); }
        });
        // A disabled pass may still blit a neutral image (contactShadows.Idle);
        // Prepare may upload. Without a scope those draws hang at the root.
        for (const method of ['Idle', 'Prepare']) if (typeof pass[method] === 'function') this._Hook(pass, method, original => (...args) => {
          this.Push(`${pass.name}.${method}`, pass, true); try { return original.apply(pass, args); } finally { this.Pop(); }
        });
      }
      // Scene submissions become Unity-style groups (Render / DrawOpaqueObjects...)
      // after capture; see _Organize. Only the span is recorded here.
      this._Hook(this.renderer, 'render', original => (scene, camera) => {
        const span = { scene: scene?.name || 'Scene', camera: camera?.name || camera?.type || 'Camera', parent: this._stack.at(-1)?.id ?? null,
          commandStart: this._commands.length, start: performance.now(), overhead: this._overhead };
        try { return original.call(this.renderer, scene, camera); }
        finally {
          span.commandEnd = this._commands.length; span.cpuMs = Math.max(0, performance.now() - span.start - (this._overhead - span.overhead));
          delete span.start; delete span.overhead; this._renders.push(span);
        }
      });
      // Covers GI / first-person self shadows outside PostPipeline as well.
      if (this.profiler) {
        this._Hook(this.profiler, 'GpuPush', original => name => {
          const duplicate = this._stack.at(-1)?.name === name || (this.post?.passes || []).some(pass => pass.name === name);
          this._profileStack ??= []; this._profileStack.push(!duplicate);
          if (!duplicate) this.Push(name);
          return original.call(this.profiler, name);
        });
        this._Hook(this.profiler, 'GpuPop', original => () => {
          if (this._profileStack?.pop()) this.Pop(); return original.call(this.profiler);
        });
      }
      // Forces renderer-owned GL state into the command stream. Uniform caches
      // are independent, so initial program uniform values are saved separately.
      this.renderer.resetState();
      this._start = performance.now(); this._startOverhead = this._overhead;
      return true;
    } catch (error) { this.Abort(error); return false; }
  }
  Push(name, owner = null, transient = false) {
    const row = { id: this._passes.length, name, path: [...this._stack.map(p => p.name), name].join('/'),
      parent: this._stack.at(-1)?.id ?? null, first: this._events.length, last: -1, cpuMs: 0, gpuMs: null, draws: 0,
      start: performance.now(), overhead: this._overhead, commandStart: this._commands.length, commandEnd: -1 };
    if (owner) this._owners.set(row.id, owner);
    if (transient) row.transient = true;
    this._passes.push(row); this._stack.push(row);
  }
  Pop() {
    const row = this._stack.pop(); if (!row) return;
    row.last = this._events.length - 1;
    row.commandEnd = this._commands.length;
    row.cpuMs = Math.max(0, performance.now() - row.start - (this._overhead - row.overhead));
    row.draws = this._events.slice(row.first).filter(event => event.draw).length;
    delete row.start; delete row.overhead;
    // Idle / Prepare that submitted nothing is not worth a tree node.
    if (row.transient && row.last < row.first && row.id === this._passes.length - 1) { this._passes.pop(); this._owners.delete(row.id); return; }
    delete row.transient;
  }
  _Budget(bytes) {
    this._bytes += bytes;
    if (this._bytes > LIMIT_BYTES) throw new Error('Capture exceeded 768 MiB resource budget; use a smaller viewport / render scale');
  }
  _Framebuffer(firstCommand, args) {
    const gl = this.gl, framebuffer = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
    if (this._framebuffers.has(framebuffer)) return this._framebuffers.get(framebuffer);
    const target = this._pendingTarget;
    const width = target ? Math.max(1, target.width >> this._mip) : gl.drawingBufferWidth;
    const height = target ? Math.max(1, target.height >> this._mip) : gl.drawingBufferHeight;
    const attachments = DescribeFramebuffer(gl, framebuffer, width, height);
    const names = Object.entries(this.post?.targets || {}).filter(([, value]) => value === target).map(([name]) => name);
    const row = { id: this._framebuffers.size, framebuffer, target,
      name: !framebuffer ? 'Backbuffer' : names[0] || target?.texture?.name || target?.name || `RenderTarget ${this._framebuffers.size}`,
      width, height, attachments, draws: Array.from({ length: gl.getParameter(gl.MAX_DRAW_BUFFERS) }, (_, i) => gl.getParameter(gl.DRAW_BUFFER0 + i)) };
    const readFramebuffer = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, framebuffer); row.readBuffer = gl.getParameter(gl.READ_BUFFER);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, readFramebuffer);
    this._framebuffers.set(framebuffer, row);
    if (attachments.some(attachment => attachment.samples > 0)) {
      // WebGL2 forbids blitting INTO multisample storage (unlike desktop GL).
      // The game's MSAA passes start with a full clear, making their previous
      // samples dead. Replay that clear; never resolve then expand the samples.
      const mask = firstCommand === 'clear' ? args[0] : 0;
      const scissor = gl.getParameter(gl.SCISSOR_BOX);
      const unclipped = !gl.isEnabled(gl.SCISSOR_TEST) || (scissor[0] <= 0 && scissor[1] <= 0 && scissor[2] >= width && scissor[3] >= height);
      const full = unclipped && attachments.every(attachment => attachment.depth
        ? !!(mask & gl.DEPTH_BUFFER_BIT) && gl.getParameter(gl.DEPTH_WRITEMASK)
          && (![gl.DEPTH24_STENCIL8, gl.DEPTH32F_STENCIL8].includes(attachment.format) || !!(mask & gl.STENCIL_BUFFER_BIT) && gl.getParameter(gl.STENCIL_WRITEMASK) === 0xffffffff)
        : attachment.stencil ? !!(mask & gl.STENCIL_BUFFER_BIT) && gl.getParameter(gl.STENCIL_WRITEMASK) === 0xffffffff
          : !!(mask & gl.COLOR_BUFFER_BIT) && gl.getParameter(gl.COLOR_WRITEMASK).every(Boolean)
            && row.draws.includes(attachment.sourcePoint));
      if (!full) throw new Error(`MSAA target ${row.name} loads previous samples; WebGL2 cannot preserve them. Capture a frame whose MSAA pass starts with a full clear.`);
      row.initialAction = 'Full clear (MSAA samples reconstructed by replay)';
      return row;
    }
    const restore = SaveGlState(gl);
    try {
      for (const attachment of attachments) {
        const key = `${attachment.level || 0}/${attachment.face || 0}/${attachment.layer || 0}`;
        const identity = attachment.object || 'backbuffer';
        const saved = this._savedObjects.get(identity) || new Set();
        if (saved.has(key)) continue;
        this._Budget(attachment.width * attachment.height * 8 * Math.max(1, attachment.samples));
        this._copies.push(CopyAttachment(gl, framebuffer, attachment)); saved.add(key); this._savedObjects.set(identity, saved);
      }
    } finally { gl.bindFramebuffer(gl.READ_FRAMEBUFFER, framebuffer); gl.readBuffer(row.readBuffer); restore(); }
    return row;
  }
  _SaveBuffer(target) {
    const gl = this.gl;
    const names = new Map([[gl.ARRAY_BUFFER, gl.ARRAY_BUFFER_BINDING], [gl.ELEMENT_ARRAY_BUFFER, gl.ELEMENT_ARRAY_BUFFER_BINDING],
      [gl.UNIFORM_BUFFER, gl.UNIFORM_BUFFER_BINDING], [gl.COPY_WRITE_BUFFER, gl.COPY_WRITE_BUFFER_BINDING], [gl.PIXEL_UNPACK_BUFFER, gl.PIXEL_UNPACK_BUFFER_BINDING]]);
    const binding = names.get(target); if (!binding) return;
    const buffer = gl.getParameter(binding); if (!buffer || this._buffers.has(buffer)) return;
    const size = gl.getBufferParameter(target, gl.BUFFER_SIZE), usage = gl.getBufferParameter(target, gl.BUFFER_USAGE);
    this._Budget(size); const bytes = new Uint8Array(size);
    if (size) gl.getBufferSubData(target, 0, bytes);
    this._buffers.set(buffer, { bytes, usage });
  }
  _Call(name, original, args, receiver = this.gl) {
    const gl = this.gl;
    if (this._mute || this.state !== 'capturing') return original.apply(receiver, args);
    let event = null;
    try { this._Inspect(() => {
      if (name === 'useProgram') {
        this._currentProgram = args[0];
        if (args[0] && !this._programs.has(args[0])) this._programs.set(args[0], ReadProgram(gl, args[0]));
      }
      if (name === 'bufferData' || name === 'bufferSubData') this._SaveBuffer(args[0]);
      if (EVENT.test(name)) {
        const target = this._Framebuffer(name, args), ref = this._object, draw = DRAW.test(name);
        const details = draw ? this._Details(ref) : null;
        const program = draw ? ReadProgram(gl, gl.getParameter(gl.CURRENT_PROGRAM)) : null;
        const previous = this._events.findLast(e => e.draw);
        const state = ReadDrawState(gl);
        const { kind, label } = this._EventName(name, args, details, ref, program);
        event = { index: this._events.length, kind, label,
          draw, api: name, args: args.map(value => typeof value === 'number' ? value : String(value)),
          drawInfo: DrawInfo(gl, name, args), shaderName: program?.name || null,
          pass: this._stack.at(-1)?.id ?? null, path: this._stack.map(p => p.name).join('/') || 'Render',
          target: target.name, targetId: target.id, targetSize: [target.width, target.height],
          cpuMs: 0, gpuMs: null, details, state,
          uniforms: program?.uniforms || [], blocks: program?.blocks || [],
          programId: draw ? [...this._programs.keys()].indexOf(gl.getParameter(gl.CURRENT_PROGRAM)) : -1,
          batchCause: !draw ? null : !previous ? 'First draw' : previous.details?.materialId !== details?.materialId ? 'Material changed'
            : previous.targetId !== target.id ? 'Render target changed' : previous.path !== (this._stack.map(p => p.name).join('/') || 'Render') ? 'Pass changed'
              : previous.details?.geometryId !== details?.geometryId ? 'Geometry / buffer changed' : 'Separate submission; WebGL exposes no engine batching decision',
          _target: target, _object: ref ? { ...ref } : null };
        if (program) { const handles = []; event.textures = this._Textures(program.uniforms, ref?.material, handles); event._textureHandles = handles; }
        this._events.push(event);
      }
      const copied = args.map(value => { if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) this._Budget(value.byteLength); return CopyValue(value); });
      this._commands.push({ name, args: copied, receiver });
    }); } catch (error) { this.Abort(error); return original.apply(receiver, args); }
    const start = performance.now();
    let result;
    try { result = original.apply(receiver, args); }
    finally {
      if (event) {
        const end = performance.now(); event.cpuSubmitMs = end - start;
        event.cpuMs = event.draw && this._drawScope ? Math.max(0, end - this._drawScope.start - (this._overhead - this._drawScope.overhead)) : event.cpuSubmitMs;
        if (event.draw && this._drawScope) { this._drawScope.start = end; this._drawScope.overhead = this._overhead; }
        event.command = this._commands.length - 1;
      }
    }
    return result;
  }
  _EventName(name, args, details, ref, program) {
    const gl = this.gl;
    if (DRAW.test(name)) {
      const fullscreen = !!ref && ref.object === this.post?.blitter?.mesh;
      const kind = !ref ? 'Draw Procedural' : fullscreen ? 'Draw Fullscreen' : /^multiDraw/.test(name) ? 'Draw Batched'
        : /Instanced/.test(name) ? 'Draw Mesh Instanced' : 'Draw Mesh';
      const label = details?.nameSource === 'id' && fullscreen ? program?.name || this._stack.at(-1)?.name || details.name : details?.name || program?.name || name;
      return { kind, label };
    }
    if (name === 'clear') return { kind: 'Clear', label: MaskLabel(gl, args[0]) };
    if (name.startsWith('clearBuffer')) return { kind: 'Clear', label: `(${args[0] === gl.COLOR ? `Color ${args[1]}` : args[0] === gl.DEPTH ? 'Depth' : args[0] === gl.STENCIL ? 'Stencil' : 'Depth Stencil'})` };
    if (name === 'blitFramebuffer') {
      const source = this._framebuffers.get(gl.getParameter(gl.READ_FRAMEBUFFER_BINDING))?.name;
      return { kind: 'Blit', label: `${MaskLabel(gl, args[8])}${source ? ` ${source} →` : ''}` };
    }
    if (name === 'generateMipmap') return { kind: 'Generate Mips', label: '' };
    return { kind: 'Copy Texture', label: `(${name})` };
  }
  _ObjectName(object, geometry, material) {
    if (object.name) return { name: object.name, source: 'Object3D.name' };
    const owners = [...this._stack].reverse().map(row => this._owners.get(row.id)).filter(Boolean);
    if (this.post) owners.push(this.post);
    for (const owner of owners) {
      const field = FieldName(owner, material);
      if (field) return { name: `${owner.name || owner.constructor?.name || 'owner'}.${field}`, source: 'owner field' };
    }
    const part = geometry.name || material.name || (geometry.type !== 'BufferGeometry' ? geometry.type : null);
    const ancestor = NamedAncestor(object);
    if (ancestor) return { name: `${ancestor} › ${part || object.type}`, source: 'named ancestor' };
    if (part) return { name: part, source: geometry.name ? 'geometry.name' : material.name ? 'material.name' : 'geometry.type' };
    return { name: `${object.type}#${object.id}`, source: 'id' };
  }
  _Details(ref) {
    if (!ref) return null;
    const { object, geometry, material, camera, group } = ref;
    const naming = this._ObjectName(object, geometry, material);
    const attributes = Object.entries(geometry.attributes).map(([name, attribute]) => ({ name,
      count: attribute.count, itemSize: attribute.itemSize, normalized: attribute.normalized,
      type: (attribute.array || attribute.data?.array)?.constructor.name,
      bytes: (attribute.array || attribute.data?.array)?.byteLength, divisor: attribute.isInstancedBufferAttribute ? attribute.meshPerAttribute : 0 }));
    return { name: naming.name, nameSource: naming.source, object: object.name || `${object.type}#${object.id}`, objectId: object.id, objectType: object.type, path: ObjectPath(object),
      phase: material.transparent ? 'Transparent' : /^Background/.test(material.name || '') ? 'Skybox' : 'Opaque',
      renderOrder: object.renderOrder, layers: object.layers.mask, frustumCulled: object.frustumCulled, castShadow: object.castShadow, receiveShadow: object.receiveShadow,
      geometry: geometry.name || `Geometry#${geometry.id}`, geometryType: geometry.type, geometryId: geometry.id, vertices: geometry.attributes.position?.count || 0,
      indices: geometry.index?.count || 0, instances: object.isInstancedMesh ? object.count : geometry.instanceCount || 1,
      group: group ? { ...group } : null, drawRange: { ...geometry.drawRange }, attributes,
      material: material.name || `${material.type}#${material.id}`, materialId: material.id, shader: material.type,
      materialFlags: { transparent: material.transparent, side: ['Front', 'Back', 'Double'][material.side] ?? material.side, blending: material.blending,
        depthTest: material.depthTest, depthWrite: material.depthWrite, alphaTest: material.alphaTest, opacity: material.opacity, toneMapped: material.toneMapped, fog: material.fog },
      camera: camera.name || `${camera.type}#${camera.id}`, keywords: { ...material.defines },
      textures: Object.entries(material).filter(([, value]) => value?.isTexture).map(([name, texture]) => ({ binding: name, ...TextureInfo(texture) })),
      worldMatrix: object.matrixWorld.toArray(), viewMatrix: camera.matrixWorldInverse.toArray(), projectionMatrix: camera.projectionMatrix.toArray(),
      source: object.userData?.source || geometry.userData?.source || null };
  }
  _Textures(uniforms, material, handles = []) {
    const gl = this.gl, known = new Map();
    const Add = texture => {
      if (Array.isArray(texture)) { texture.forEach(Add); return; }
      if (!texture?.isTexture) return;
      const handle = this.renderer.properties.get(texture).__webglTexture;
      if (handle) known.set(handle, TextureInfo(texture));
    };
    for (const value of Object.values(material || {})) if (value?.isTexture) Add(value);
    for (const value of Object.values(material?.uniforms || this.renderer.properties.get(material || {}).uniforms || {})) Add(value?.value);
    for (const target of Object.values(this.post?.targets || {})) {
      for (const texture of target?.textures || []) Add(texture);
      Add(target?.depthTexture);
    }
    const active = gl.getParameter(gl.ACTIVE_TEXTURE), textures = [];
    try {
      for (const uniform of uniforms.filter(row => row.group === 'Textures')) {
        const units = Array.isArray(uniform.value) ? uniform.value : [uniform.value];
        for (const [index, unit] of units.entries()) {
          gl.activeTexture(gl.TEXTURE0 + unit);
          const binding = /CUBE/.test(uniform.type) ? gl.TEXTURE_BINDING_CUBE_MAP : /2D_ARRAY/.test(uniform.type) ? gl.TEXTURE_BINDING_2D_ARRAY : /3D/.test(uniform.type) ? gl.TEXTURE_BINDING_3D : gl.TEXTURE_BINDING_2D;
          const texture = gl.getParameter(binding);
          textures.push({ uniform: uniform.name, arrayIndex: index, unit, sampler: uniform.type,
            ...(known.get(texture) || { name: texture ? 'GPU texture (no source asset)' : 'Unbound' }) });
          handles.push(texture);
        }
      }
    } finally { gl.activeTexture(active); }
    return textures;
  }
  EndRender(error = null) {
    if (this.state !== 'capturing') return;
    if (error) { this.Abort(error); return; }
    while (this._stack.length) this.Pop();
    this.capture.cpuMs = Math.max(0, performance.now() - this._start - (this._overhead - this._startOverhead));
    this._hooks.reverse().forEach(Restore => Restore()); this._hooks = [];
    try { this._Organize(); } catch (error) { this.Abort(error); return; }
    this.capture.programs = [...this._programs.values()].map(program => ({ name: program?.name || null, sources: program?.sources || [] }));
    this._endState = SaveGlState(this.gl);
    this._endTarget = this.renderer.getRenderTarget();
    this._endFace = this.renderer.getActiveCubeFace(); this._endMip = this.renderer.getActiveMipmapLevel();
    this.capture.bytes = this._bytes; this.capture.commandCount = this._commands.length;
    this.state = 'frozen'; this.selected = this._events.length - 1;
    try { this._MeasureReplay(); } catch (error) { this.Abort(error); return; }
    this._pollStart = performance.now(); this._hostFrozen = true;
    try { this.onFreeze?.(); } catch (error) { this.Abort(error); return; }
    // UI settings and developer APIs can mutate resources even while the frame
    // loop is frozen. Release the capture BEFORE those resources are replaced.
    for (const [owner, names] of [[this.renderer, ['setSize', 'setPixelRatio', 'render', 'dispose']],
      [this.post, ['SetSize', 'SetTaaEnabled', 'SetTonemap', 'SetAutoExposure', 'SetLutEnabled', 'SetSsilEnabled', 'SetSsrEnabled', 'SetDebugView', 'SetShadingMode', 'Dispose']]]) {
      if (!owner) continue;
      for (const name of names) if (typeof owner[name] === 'function') this._Hook(owner, name, original => (...args) => {
        if (this.frozen) this.Resume(); return original.apply(owner, args);
      });
    }
    this.revision++; this.Poll();
  }
  // Unity-like hierarchy after the fact: scene submissions inside a pass get a
  // Render group; opaque / skybox / transparent runs get Draw* groups; draws
  // outside every pass get one group per target. Groups own the commands
  // between their siblings, so their GPU segment includes state setup.
  _Organize() {
    const events = this._events, passes = this._passes;
    const Inside = (row, start, end) => row.commandStart >= start && row.commandEnd <= end && row.commandEnd > row.commandStart;
    const Items = (container, start = -Infinity, end = Infinity) => [
      ...events.filter(event => event.pass === container && event.command >= start && event.command < end).map(event => ({ at: event.command, end: event.command + 1, event })),
      ...passes.filter(pass => pass.parent === container && Inside(pass, start, end)).map(pass => ({ at: pass.commandStart, end: pass.commandEnd, pass }))].sort((a, b) => a.at - b.at);
    const Group = (name, parent, commandStart, commandEnd, cpuMs, synthetic) => {
      const members = events.filter(event => event.pass === parent && event.command >= commandStart && event.command < commandEnd);
      const children = passes.filter(pass => pass.parent === parent && Inside(pass, commandStart, commandEnd));
      const indices = [...members.map(event => event.index), ...children.filter(pass => pass.last >= pass.first).flatMap(pass => [pass.first, pass.last])];
      if (!indices.length) return null;
      const row = { id: passes.length, name, path: '', parent, first: Math.min(...indices), last: Math.max(...indices),
        cpuMs: cpuMs ?? members.reduce((sum, event) => sum + event.cpuMs, 0) + children.reduce((sum, pass) => sum + pass.cpuMs, 0),
        gpuMs: null, draws: 0, commandStart, commandEnd, synthetic };
      passes.push(row);
      for (const event of members) event.pass = row.id;
      for (const pass of children) pass.parent = row.id;
      return row;
    };
    const Phase = item => item.event?.draw ? item.event.details?.phase || 'Opaque' : null;
    for (const span of [...this._renders].sort((a, b) => (a.commandEnd - a.commandStart) - (b.commandEnd - b.commandStart))) {
      const inside = Items(span.parent, span.commandStart, span.commandEnd);
      if (events.filter(event => event.command >= span.commandStart && event.command < span.commandEnd).length < 3) continue;
      // A render call that is (apart from its clears) the whole pass needs no extra level.
      const outside = Items(span.parent).filter(item => item.at < span.commandStart || item.end > span.commandEnd).some(item => item.pass || item.event.kind !== 'Clear');
      let container = span.parent;
      if (span.parent == null || outside) container = Group(`Render ${span.scene}`, span.parent, span.commandStart, span.commandEnd, span.cpuMs, 'render')?.id ?? span.parent;
      const items = container === span.parent ? inside : Items(container, span.commandStart, span.commandEnd);
      const draws = items.filter(Phase);
      if (draws.length < 4 || new Set(draws.map(Phase)).size < 2) continue;
      const runs = []; let cursor = span.commandStart, run = null;
      for (const item of items) {
        const phase = Phase(item);
        if (phase && run?.phase === phase) run.end = item.end;
        else if (phase) { run = { phase, start: cursor, end: item.end }; runs.push(run); }
        else run = null;
        cursor = item.end;
      }
      for (const run of runs) Group(PHASE_GROUPS[run.phase], container, run.start, run.end, null, 'phase');
    }
    const loose = []; let cursor = 0, run = null;
    for (const item of Items(null)) {
      if (item.event && run?.target === item.event.target) run.end = item.end;
      else if (item.event) { run = { target: item.event.target, start: cursor, end: item.end }; loose.push(run); }
      else run = null;
      cursor = item.end;
    }
    for (const run of loose) Group(`(Unscoped) → ${run.target}`, null, run.start, run.end, null, 'unscoped');
    const Path = row => row.parent == null ? row.name : `${Path(passes[row.parent])}/${row.name}`;
    const Depth = row => row.parent == null ? 0 : Depth(passes[row.parent]) + 1;
    for (const row of passes) { row.path = Path(row); row.depth = Depth(row); row.draws = 0; }
    for (const event of events) {
      event.path = event.pass == null ? 'Render' : passes[event.pass].path;
      if (event.draw) for (let id = event.pass; id != null; id = passes[id].parent) passes[id].draws++;
    }
  }
  _ResetReplay() {
    const gl = this.gl;
    for (const copy of this._copies) copy.Restore();
    for (const target of this._framebuffers.values()) {
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, target.framebuffer); gl.drawBuffers(target.framebuffer ? target.draws : [gl.BACK]);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, target.framebuffer); gl.readBuffer(target.readBuffer);
      // SSR's previous-frame color is sampled at nonzero LOD before being
      // overwritten later in the frame. Restore its entire generated pyramid.
      for (const texture of target.target?.textures || []) if (texture.generateMipmaps && !texture.isCubeTexture && !texture.isData3DTexture && !texture.isDataArrayTexture) {
        const handle = this.renderer.properties.get(texture).__webglTexture;
        if (handle) { gl.bindTexture(gl.TEXTURE_2D, handle); gl.generateMipmap(gl.TEXTURE_2D); }
      }
    }
    for (const [buffer, data] of this._buffers) { gl.bindBuffer(gl.COPY_WRITE_BUFFER, buffer); gl.bufferData(gl.COPY_WRITE_BUFFER, data.bytes, data.usage); }
    for (const program of this._programs.values()) program?.Restore();
    this._initial();
  }
  _Run(command) { command.receiver[command.name](...command.args); }
  _MeasureReplay() {
    this._queries = []; this._replayedAt = null;
    if (!this._timer) return;
    const gl = this.gl, cuts = new Set([0, this._commands.length]);
    for (const event of this._events) { cuts.add(event.command); cuts.add(event.command + 1); }
    for (const pass of this._passes) { cuts.add(pass.commandStart); cuts.add(pass.commandEnd); }
    const points = [...cuts].sort((a, b) => a - b), byCommand = new Map(this._events.map(event => [event.command, event]));
    this._ResetReplay();
    for (let i = 0; i < points.length - 1; i++) {
      const start = points[i], end = points[i + 1]; if (start === end) continue;
      const query = gl.createQuery();
      const segment = { query, event: byCommand.get(start), passes: this._passes.filter(pass => pass.commandStart <= start && pass.commandEnd >= end).map(pass => pass.id) };
      this._queries.push(segment);
      gl.beginQuery(this._timer.TIME_ELAPSED_EXT, query);
      try { for (let at = start; at < end; at++) this._Run(this._commands[at]); }
      finally { gl.endQuery(this._timer.TIME_ELAPSED_EXT); }
    }
    this._endState();
  }
  Poll() {
    if (!this.frozen || this.capture.gpuStatus !== 'pending') return;
    const gl = this.gl, pending = this._queries || [];
    const invalid = gl.isContextLost() || gl.getParameter(this._timer.GPU_DISJOINT_EXT);
    const timeout = performance.now() - this._pollStart > 15000;
    if (!invalid && !timeout && pending.length && !gl.getQueryParameter(pending.at(-1).query, gl.QUERY_RESULT_AVAILABLE)) return;
    if (!invalid && !timeout) { this.capture.gpuMs = 0; for (const pass of this._passes) pass.gpuMs = 0; }
    for (const segment of pending) {
      if (!invalid && !timeout) {
        const ms = gl.getQueryParameter(segment.query, gl.QUERY_RESULT) / 1e6;
        this.capture.gpuMs += ms;
        if (segment.event) segment.event.gpuMs = ms;
        for (const id of segment.passes) this._passes[id].gpuMs += ms;
      }
      gl.deleteQuery(segment.query);
    }
    this._queries = [];
    this.capture.gpuStatus = invalid ? 'disjoint' : timeout ? 'timeout' : 'ready';
    this.revision++;
  }
  Replay(index = this.selected) {
    if (!this.frozen) throw new Error('Capture a frame first');
    if (this.gl.isContextLost()) throw new Error('WebGL context lost');
    this.selected = Math.max(0, Math.min(index, this._events.length - 1));
    const event = this._events[this.selected]; if (!event) return null;
    this._ResetReplay();
    for (let i = 0; i <= event.command; i++) this._Run(this._commands[i]);
    this._replayedAt = this.selected;
    this.revision++;
    return event;
  }
  Preview(index = this.selected, attachmentIndex = 0, options = {}) {
    const event = this.Replay(index); if (!event) return null;
    const target = event._target;
    const attachment = target.attachments[attachmentIndex];
    if (!attachment || attachment.stencil) throw new Error('This attachment has no color/depth preview');
    return ReadOutput(this.gl, target.framebuffer, attachment, options);
  }
  // Raw attachment values after `index` (floats; depth in [0,1]; sRGB targets
  // come back linear). x / y are image coordinates, top-left origin.
  ReadPixels(index, attachmentIndex = 0, x = 0, y = 0, w = 1, h = 1) {
    if (!this.frozen) throw new Error('Capture a frame first');
    const event = this._events[index]; if (!event) throw new Error(`No event ${index}`);
    const attachment = event._target.attachments[attachmentIndex];
    if (!attachment || attachment.stencil) throw new Error(`No readable attachment ${attachmentIndex} on ${event.target}`);
    const rect = this._Rect(attachment, x, y, w, h);
    if (this._replayedAt !== index) this.Replay(index);
    return { width: rect.w, height: rect.h, values: this._Rows(ReadRaw(this.gl, event._target.framebuffer, attachment, rect.x, rect.glY, rect.w, rect.h), rect.w, rect.h) };
  }
  _Rect(attachment, x, y, w, h) {
    x = Math.floor(x); y = Math.floor(y); w = Math.max(1, Math.floor(w)); h = Math.max(1, Math.floor(h));
    if (x < 0 || y < 0 || x + w > attachment.width || y + h > attachment.height) throw new Error(`Region ${x},${y} ${w}x${h} outside ${attachment.width}x${attachment.height}`);
    return { x, y, w, h, glY: attachment.height - y - h };
  }
  // GL rows run bottom-up; agents read images top-down.
  _Rows(pixels, w, h) {
    const rows = [];
    for (let row = h - 1; row >= 0; row--) {
      const line = [];
      for (let column = 0; column < w; column++) line.push(Array.from(pixels.subarray((row * w + column) * 4, (row * w + column) * 4 + 4)));
      rows.push(line);
    }
    return rows;
  }
  // Every event (up to `event`) that wrote the same texture / renderbuffer at
  // this pixel, through whichever framebuffer it was attached to, with the value
  // after it. One full replay with a 1x1 readback per touching event.
  PixelHistory(x, y, { event = this._events.length - 1, attachment: attachmentIndex = 0 } = {}) {
    if (!this.frozen) throw new Error('Capture a frame first');
    const last = this._events[event]; if (!last) throw new Error(`No event ${event}`);
    const attachment = last._target.attachments[attachmentIndex];
    if (!attachment || attachment.stencil) throw new Error(`No readable attachment ${attachmentIndex} on ${last.target}`);
    this._Rect(attachment, x, y, 1, 1);
    const Same = other => (other.object || null) === (attachment.object || null) && !!other.depth === !!attachment.depth
      && (other.level || 0) === (attachment.level || 0) && (other.layer || 0) === (attachment.layer || 0) && (other.face || 0) === (attachment.face || 0);
    const Read = (target, match) => Array.from(ReadRaw(this.gl, target.framebuffer, match, Math.floor(x), match.height - Math.floor(y) - 1, 1, 1));
    this._ResetReplay();
    const initial = Read(last._target, attachment), history = [];
    let previous = initial, at = 0;
    for (const item of this._events) {
      if (item.index > event) break;
      for (; at <= item.command; at++) this._Run(this._commands[at]);
      const match = item._target.attachments.find(Same);
      if (!match || match.width !== attachment.width || match.height !== attachment.height) continue;
      const value = Read(item._target, match), changed = value.some((v, i) => v !== previous[i]);
      history.push({ index: item.index, kind: item.kind, label: item.label, path: item.path, target: item.target, value, changed });
      previous = value;
    }
    this.selected = event; this._replayedAt = event; this.revision++;
    return { x: Math.floor(x), y: Math.floor(y), event, target: last.target, attachment: attachment.name, format: EnumName(this.gl, attachment.format),
      initial, final: previous, writes: history.filter(item => item.changed).length, history };
  }
  // A sampled texture as the event's draw sees it (replay state after the draw).
  TexturePreview(index, binding, options = {}) {
    if (!this.frozen) throw new Error('Capture a frame first');
    const event = this._events[index], texture = event?.textures?.[binding], handle = event?._textureHandles?.[binding];
    if (!texture || !handle) throw new Error('Unbound texture');
    if (!/^SAMPLER_2D(_SHADOW)?$/.test(texture.sampler)) throw new Error(`${texture.sampler} has no 2D preview`);
    if (this._replayedAt !== index) this.Replay(index);
    return ReadTexture(this.gl, handle, { sourceWidth: texture.width, sourceHeight: texture.height, depth: texture.isDepth || /SHADOW/.test(texture.sampler), ...options });
  }
  Present(output = null) {
    if (!output) { this._viewOverlay?.remove(); this._viewOverlay = null; return; }
    const doc = this.renderer.domElement.ownerDocument;
    if (!doc) return;
    const canvas = this._viewOverlay || doc.createElement('canvas');
    if (!this._viewOverlay) {
      canvas.id = 'frameDebuggerGameView'; canvas.setAttribute('aria-label', 'Frame Debugger selected event output');
      canvas.style.cssText = 'position:fixed;z-index:39;pointer-events:none;background:#151920;object-fit:contain';
      doc.body.append(canvas); this._viewOverlay = canvas;
    }
    const rect = this.renderer.domElement.getBoundingClientRect();
    Object.assign(canvas.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    canvas.width = output.width; canvas.height = output.height;
    const context = canvas.getContext('2d'), data = context.createImageData(output.width, output.height);
    data.data.set(output.pixels); context.putImageData(data, 0, 0);
  }
  Inspect() {
    if (!this.capture) return { state: this.state, error: this.error };
    return { state: this.state, selected: this.selected, error: this.error, ...this.capture,
      events: this._events.map(({ _target, _object, _query, _textureHandles, ...event }) => ({ ...event,
        attachments: _target.attachments.map(({ object, ...attachment }) => ({ ...attachment, format: EnumName(this.gl, attachment.format) })) })) };
  }
  Abort(error) { this.error = String(error?.message || error); this.Resume(); this.state = 'error'; this.revision++; }
  Resume() {
    const wasFrozen = this.frozen;
    this.Present();
    this._hooks.reverse().forEach(Restore => Restore()); this._hooks = [];
    if (wasFrozen && !this.gl.isContextLost()) {
      // Complete the captured command stream so texture/buffer contents return
      // to the real end of frame before the simulation and temporal passes resume.
      try {
        this.Replay(this._events.length - 1);
        const last = this._events.at(-1)?.command ?? -1;
        for (let i = last + 1; i < this._commands.length; i++) this._Run(this._commands[i]);
        this._endState?.();
        this.renderer.resetState(); this.renderer.setRenderTarget(this._endTarget, this._endFace, this._endMip);
      } catch (error) { this.error = String(error); this.renderer.resetState(); }
    }
    for (const segment of this._queries || []) this.gl.deleteQuery(segment.query);
    this._queries = [];
    for (const copy of this._copies || []) copy.Dispose();
    for (const Delete of this._deletes || []) Delete();
    this._copies = []; this._deletes = []; this._commands = []; this._events = []; this._programs?.clear(); this._buffers?.clear();
    this._framebuffers?.clear(); this._savedObjects?.clear(); this._profileStack = [];
    this._initial = null; this._endState = null; this._endTarget = null; this._pendingTarget = null;
    this._passes = []; this._stack = []; this._object = null; this._drawScope = null; this._renders = []; this._owners?.clear(); this._replayedAt = null;
    this.capture = null; this.state = 'idle'; this.selected = -1;
    if (this._resumeProfiler) this.profiler?.Resume(); this._resumeProfiler = false;
    if (this._hostFrozen) { this._hostFrozen = false; this.onResume?.(); }
    this.selection = null; this.revision++;
  }
  Dispose() {
    this.Resume(); this.renderer.domElement.removeEventListener('webglcontextlost', this._OnLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this._OnRestored);
    globalThis.removeEventListener?.('resize', this._OnResize);
  }
}
