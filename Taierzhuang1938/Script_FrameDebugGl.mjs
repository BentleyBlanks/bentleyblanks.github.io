// WebGL2 capture helpers. All inspection work runs outside timed draw regions.
// No renderer addons, global prototype changes, gl.finish, or synchronous timer waits.
export function CopyValue(value) {
  if (value instanceof DataView) return new DataView(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  if (ArrayBuffer.isView(value)) return new value.constructor(value);
  if (value instanceof ArrayBuffer) return value.slice(0);
  if (Array.isArray(value)) return value.map(CopyValue);
  return value;
}

export function SaveGlState(gl) {
  const calls = [];
  const Get = name => gl.getParameter(gl[name]);
  const Add = (name, ...args) => calls.push([name, args]);
  for (const name of ['BLEND', 'CULL_FACE', 'DEPTH_TEST', 'STENCIL_TEST', 'SCISSOR_TEST',
    'POLYGON_OFFSET_FILL', 'SAMPLE_ALPHA_TO_COVERAGE', 'SAMPLE_COVERAGE', 'DITHER', 'RASTERIZER_DISCARD']) {
    Add(gl.isEnabled(gl[name]) ? 'enable' : 'disable', gl[name]);
  }
  Add('blendColor', ...Get('BLEND_COLOR'));
  Add('blendEquationSeparate', Get('BLEND_EQUATION_RGB'), Get('BLEND_EQUATION_ALPHA'));
  Add('blendFuncSeparate', Get('BLEND_SRC_RGB'), Get('BLEND_DST_RGB'), Get('BLEND_SRC_ALPHA'), Get('BLEND_DST_ALPHA'));
  Add('colorMask', ...Get('COLOR_WRITEMASK'));
  Add('clearColor', ...Get('COLOR_CLEAR_VALUE'));
  Add('clearDepth', Get('DEPTH_CLEAR_VALUE'));
  Add('clearStencil', Get('STENCIL_CLEAR_VALUE'));
  Add('depthFunc', Get('DEPTH_FUNC'));
  Add('depthMask', Get('DEPTH_WRITEMASK'));
  Add('depthRange', ...Get('DEPTH_RANGE'));
  Add('cullFace', Get('CULL_FACE_MODE'));
  Add('frontFace', Get('FRONT_FACE'));
  Add('lineWidth', Get('LINE_WIDTH'));
  Add('polygonOffset', Get('POLYGON_OFFSET_FACTOR'), Get('POLYGON_OFFSET_UNITS'));
  Add('sampleCoverage', Get('SAMPLE_COVERAGE_VALUE'), Get('SAMPLE_COVERAGE_INVERT'));
  for (const [face, prefix] of [[gl.FRONT, 'STENCIL_'], [gl.BACK, 'STENCIL_BACK_']]) {
    Add('stencilFuncSeparate', face, Get(prefix + 'FUNC'), Get(prefix + 'REF'), Get(prefix + 'VALUE_MASK'));
    Add('stencilOpSeparate', face, Get(prefix + 'FAIL'), Get(prefix + 'PASS_DEPTH_FAIL'), Get(prefix + 'PASS_DEPTH_PASS'));
    Add('stencilMaskSeparate', face, Get(prefix + 'WRITEMASK'));
  }
  Add('viewport', ...Get('VIEWPORT'));
  Add('scissor', ...Get('SCISSOR_BOX'));
  const active = Get('ACTIVE_TEXTURE');
  for (let i = 0; i < Get('MAX_COMBINED_TEXTURE_IMAGE_UNITS'); i++) {
    gl.activeTexture(gl.TEXTURE0 + i);
    Add('activeTexture', gl.TEXTURE0 + i);
    for (const [target, binding] of [['TEXTURE_2D', 'TEXTURE_BINDING_2D'], ['TEXTURE_CUBE_MAP', 'TEXTURE_BINDING_CUBE_MAP'],
      ['TEXTURE_3D', 'TEXTURE_BINDING_3D'], ['TEXTURE_2D_ARRAY', 'TEXTURE_BINDING_2D_ARRAY']]) Add('bindTexture', gl[target], Get(binding));
    Add('bindSampler', i, Get('SAMPLER_BINDING'));
  }
  gl.activeTexture(active);
  Add('activeTexture', active);
  Add('bindVertexArray', Get('VERTEX_ARRAY_BINDING'));
  for (const name of ['ARRAY_BUFFER', 'ELEMENT_ARRAY_BUFFER', 'COPY_READ_BUFFER', 'COPY_WRITE_BUFFER',
    'PIXEL_PACK_BUFFER', 'PIXEL_UNPACK_BUFFER', 'UNIFORM_BUFFER']) Add('bindBuffer', gl[name], Get(name + '_BINDING'));
  for (let i = 0; i < Get('MAX_UNIFORM_BUFFER_BINDINGS'); i++) {
    const buffer = gl.getIndexedParameter(gl.UNIFORM_BUFFER_BINDING, i);
    const size = gl.getIndexedParameter(gl.UNIFORM_BUFFER_SIZE, i);
    if (buffer && size) Add('bindBufferRange', gl.UNIFORM_BUFFER, i, buffer, gl.getIndexedParameter(gl.UNIFORM_BUFFER_START, i), size);
    else Add('bindBufferBase', gl.UNIFORM_BUFFER, i, buffer);
  }
  Add('bindBuffer', gl.UNIFORM_BUFFER, Get('UNIFORM_BUFFER_BINDING'));
  for (const name of ['PACK_ALIGNMENT', 'UNPACK_ALIGNMENT', 'PACK_ROW_LENGTH', 'PACK_SKIP_PIXELS', 'PACK_SKIP_ROWS',
    'UNPACK_ROW_LENGTH', 'UNPACK_IMAGE_HEIGHT', 'UNPACK_SKIP_PIXELS', 'UNPACK_SKIP_ROWS', 'UNPACK_SKIP_IMAGES',
    'UNPACK_FLIP_Y_WEBGL', 'UNPACK_PREMULTIPLY_ALPHA_WEBGL', 'UNPACK_COLORSPACE_CONVERSION_WEBGL']) Add('pixelStorei', gl[name], Get(name));
  Add('bindRenderbuffer', gl.RENDERBUFFER, Get('RENDERBUFFER_BINDING'));
  Add('bindFramebuffer', gl.DRAW_FRAMEBUFFER, Get('DRAW_FRAMEBUFFER_BINDING'));
  Add('bindFramebuffer', gl.READ_FRAMEBUFFER, Get('READ_FRAMEBUFFER_BINDING'));
  Add('readBuffer', Get('READ_BUFFER'));
  Add('useProgram', Get('CURRENT_PROGRAM'));
  return () => { for (const [name, args] of calls) gl[name](...args); };
}

const ENUMS = new WeakMap();
export function EnumName(gl, value) {
  if (value === null) return null;
  if (!ENUMS.has(gl)) {
    const names = new Map();
    for (let p = gl; p; p = Object.getPrototypeOf(p)) {
      for (const key of Object.getOwnPropertyNames(p)) if (/^[A-Z][A-Z0-9_x]+$/.test(key)) names.set(gl[key], key);
    }
    ENUMS.set(gl, names);
  }
  return ENUMS.get(gl).get(value) ?? value;
}

export function ReadProgram(gl, program) {
  if (!program) return null;
  const uniforms = [], restore = [];
  for (let i = 0; i < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i++) {
    const info = gl.getActiveUniform(program, i), location = gl.getUniformLocation(program, info.name);
    if (location === null) continue; // Uniform block members are recorded separately.
    const type = EnumName(gl, info.type);
    const isSampler = /SAMPLER/.test(type), isInt = isSampler || /^(INT|BOOL)/.test(type), isUint = !isSampler && /^UNSIGNED_INT/.test(type);
    const vector = type.match(/VEC([234])/), matrix = type.match(/MAT([234](?:x[234])?)/);
    const name = matrix ? `uniformMatrix${matrix[1]}fv` : `uniform${vector?.[1] || 1}${isUint ? 'uiv' : isInt ? 'iv' : 'fv'}`;
    // getUniform(array[0]) returns only the first element, not the whole array.
    // Save every element, including sampler arrays and arrays of matrices.
    const values = [];
    for (let element = 0; element < info.size; element++) {
      const elementLocation = element === 0 ? location : gl.getUniformLocation(program, info.name.replace('[0]', `[${element}]`));
      if (elementLocation === null) continue;
      const value = CopyValue(gl.getUniform(program, elementLocation));
      const data = typeof value === 'number' || typeof value === 'boolean' ? [Number(value)] : value;
      restore.push([name, matrix ? [elementLocation, false, data] : [elementLocation, data]]);
      values.push(ArrayBuffer.isView(value) ? Array.from(value) : value);
    }
    uniforms.push({ name: info.name, type, size: info.size, value: info.size === 1 ? values[0] : values,
      group: isSampler ? 'Textures' : matrix ? 'Matrices' : vector ? 'Vectors' : isInt || isUint ? 'Ints' : 'Floats' });
  }
  const blocks = [];
  for (let i = 0; i < gl.getProgramParameter(program, gl.ACTIVE_UNIFORM_BLOCKS); i++) {
    const binding = gl.getActiveUniformBlockParameter(program, i, gl.UNIFORM_BLOCK_BINDING);
    blocks.push({ name: gl.getActiveUniformBlockName(program, i), binding,
      bytes: gl.getActiveUniformBlockParameter(program, i, gl.UNIFORM_BLOCK_DATA_SIZE) });
  }
  const sources = (gl.getAttachedShaders(program) || []).map(shader => ({
    stage: gl.getShaderParameter(shader, gl.SHADER_TYPE) === gl.VERTEX_SHADER ? 'Vertex' : 'Fragment', source: gl.getShaderSource(shader) }));
  // three injects `#define SHADER_NAME <material.name>`; empty for unnamed materials.
  const name = sources.map(source => source.source?.match(/^#define SHADER_NAME (.+)$/m)?.[1]?.trim()).find(Boolean) || null;
  return { name, uniforms, blocks, sources, Restore() { gl.useProgram(program); for (const [name, args] of restore) gl[name](...args); } };
}

export function ReadDrawState(gl) {
  const out = {};
  for (const key of ['VIEWPORT', 'SCISSOR_BOX', 'COLOR_WRITEMASK', 'COLOR_CLEAR_VALUE', 'DEPTH_CLEAR_VALUE', 'STENCIL_CLEAR_VALUE',
    'BLEND_COLOR', 'DEPTH_WRITEMASK', 'DEPTH_RANGE', 'POLYGON_OFFSET_FACTOR', 'POLYGON_OFFSET_UNITS',
    'STENCIL_REF', 'STENCIL_VALUE_MASK', 'STENCIL_WRITEMASK', 'STENCIL_BACK_REF', 'STENCIL_BACK_VALUE_MASK', 'STENCIL_BACK_WRITEMASK']) {
    const value = gl.getParameter(gl[key]); out[key] = ArrayBuffer.isView(value) ? Array.from(value) : value;
  }
  for (const key of ['DEPTH_FUNC', 'CULL_FACE_MODE', 'FRONT_FACE', 'BLEND_SRC_RGB', 'BLEND_DST_RGB', 'BLEND_SRC_ALPHA', 'BLEND_DST_ALPHA',
    'BLEND_EQUATION_RGB', 'BLEND_EQUATION_ALPHA', 'STENCIL_FUNC', 'STENCIL_FAIL', 'STENCIL_PASS_DEPTH_FAIL', 'STENCIL_PASS_DEPTH_PASS',
    'STENCIL_BACK_FUNC', 'STENCIL_BACK_FAIL', 'STENCIL_BACK_PASS_DEPTH_FAIL', 'STENCIL_BACK_PASS_DEPTH_PASS']) out[key] = EnumName(gl, gl.getParameter(gl[key]));
  for (const key of ['BLEND', 'CULL_FACE', 'DEPTH_TEST', 'STENCIL_TEST', 'SCISSOR_TEST', 'RASTERIZER_DISCARD',
    'POLYGON_OFFSET_FILL', 'SAMPLE_ALPHA_TO_COVERAGE', 'DITHER']) out[key] = gl.isEnabled(gl[key]);
  out.DRAW_BUFFERS = Array.from({ length: gl.getParameter(gl.MAX_DRAW_BUFFERS) }, (_, i) => EnumName(gl, gl.getParameter(gl.DRAW_BUFFER0 + i))).filter(name => name !== 'NONE');
  return out;
}

// Preserve each framebuffer before its first write, including temporal history,
// MRT, shadow depth and multisampling. Copies remain GPU-side until preview.
export function DescribeFramebuffer(gl, framebuffer, width, height) {
  const attachments = [];
  if (!framebuffer) return [{ point: gl.COLOR_ATTACHMENT0, sourcePoint: gl.BACK, format: gl.RGBA8, width, height, samples: gl.getParameter(gl.SAMPLES), depth: false, name: 'Backbuffer' }];
  const max = gl.getParameter(gl.MAX_COLOR_ATTACHMENTS);
  const samples = gl.getParameter(gl.SAMPLES);
  for (const point of [...Array.from({ length: max }, (_, i) => gl.COLOR_ATTACHMENT0 + i), gl.DEPTH_ATTACHMENT, gl.STENCIL_ATTACHMENT]) {
    const Get = name => gl.getFramebufferAttachmentParameter(gl.DRAW_FRAMEBUFFER, point, gl[name]);
    const kind = Get('FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE');
    if (kind === gl.NONE) continue;
    const object = Get('FRAMEBUFFER_ATTACHMENT_OBJECT_NAME');
    const depth = point === gl.DEPTH_ATTACHMENT, stencil = point === gl.STENCIL_ATTACHMENT;
    const component = Get('FRAMEBUFFER_ATTACHMENT_COMPONENT_TYPE');
    let w = width, h = height, format;
    if (kind === gl.RENDERBUFFER) {
      const old = gl.getParameter(gl.RENDERBUFFER_BINDING);
      gl.bindRenderbuffer(gl.RENDERBUFFER, object);
      w = gl.getRenderbufferParameter(gl.RENDERBUFFER, gl.RENDERBUFFER_WIDTH);
      h = gl.getRenderbufferParameter(gl.RENDERBUFFER, gl.RENDERBUFFER_HEIGHT);
      format = gl.getRenderbufferParameter(gl.RENDERBUFFER, gl.RENDERBUFFER_INTERNAL_FORMAT);
      gl.bindRenderbuffer(gl.RENDERBUFFER, old);
    } else if (depth || stencil) {
      const depthBits = Get('FRAMEBUFFER_ATTACHMENT_DEPTH_SIZE'), stencilBits = Get('FRAMEBUFFER_ATTACHMENT_STENCIL_SIZE');
      format = stencilBits ? (component === gl.FLOAT ? gl.DEPTH32F_STENCIL8 : gl.DEPTH24_STENCIL8)
        : component === gl.FLOAT ? gl.DEPTH_COMPONENT32F : depthBits === 16 ? gl.DEPTH_COMPONENT16 : gl.DEPTH_COMPONENT24;
    } else {
      const bits = Get('FRAMEBUFFER_ATTACHMENT_RED_SIZE');
      const channels = Get('FRAMEBUFFER_ATTACHMENT_ALPHA_SIZE') ? 'RGBA' : Get('FRAMEBUFFER_ATTACHMENT_BLUE_SIZE') ? 'RGB' : Get('FRAMEBUFFER_ATTACHMENT_GREEN_SIZE') ? 'RG' : 'R';
      format = gl[`${channels}${bits}${component === gl.FLOAT ? 'F' : component === gl.INT ? 'I' : component === gl.UNSIGNED_INT ? 'UI' : ''}`];
      if (Get('FRAMEBUFFER_ATTACHMENT_COLOR_ENCODING') === gl.SRGB) format = gl.SRGB8_ALPHA8;
    }
    if (stencil && attachments.some(a => a.object === object && a.depth)) continue;
    attachments.push({ point, sourcePoint: point, object, format, width: w, height: h, samples, depth, stencil,
      level: kind === gl.TEXTURE ? Get('FRAMEBUFFER_ATTACHMENT_TEXTURE_LEVEL') : 0,
      face: kind === gl.TEXTURE ? Get('FRAMEBUFFER_ATTACHMENT_TEXTURE_CUBE_MAP_FACE') : 0,
      layer: kind === gl.TEXTURE ? Get('FRAMEBUFFER_ATTACHMENT_TEXTURE_LAYER') : 0,
      name: depth ? 'Depth' : stencil ? 'Stencil' : `Color ${point - gl.COLOR_ATTACHMENT0}` });
  }
  return attachments;
}

export function CopyAttachment(gl, source, attachment, asTexture = false) {
  const a = attachment, framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, framebuffer);
  let texture = null, buffer = null;
  const combined = a.format === gl.DEPTH24_STENCIL8 || a.format === gl.DEPTH32F_STENCIL8;
  const point = combined ? gl.DEPTH_STENCIL_ATTACHMENT : a.depth ? gl.DEPTH_ATTACHMENT : a.stencil ? gl.STENCIL_ATTACHMENT : gl.COLOR_ATTACHMENT0;
  if (asTexture) {
    texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, a.format, a.width, a.height);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, point, gl.TEXTURE_2D, texture, 0);
  } else {
    buffer = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, buffer);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, a.samples, a.format, a.width, a.height);
    gl.framebufferRenderbuffer(gl.DRAW_FRAMEBUFFER, point, gl.RENDERBUFFER, buffer);
  }
  const mask = a.depth ? gl.DEPTH_BUFFER_BIT | (combined ? gl.STENCIL_BUFFER_BIT : 0) : a.stencil ? gl.STENCIL_BUFFER_BIT : gl.COLOR_BUFFER_BIT;
  gl.drawBuffers([a.depth || a.stencil ? gl.NONE : gl.COLOR_ATTACHMENT0]);
  if (gl.checkFramebufferStatus(gl.DRAW_FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    gl.deleteFramebuffer(framebuffer); if (texture) gl.deleteTexture(texture); if (buffer) gl.deleteRenderbuffer(buffer);
    throw new Error(`Cannot preserve ${a.name} (${EnumName(gl, a.format)})`);
  }
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, source);
  if (!(a.depth || a.stencil)) gl.readBuffer(a.sourcePoint);
  gl.disable(gl.SCISSOR_TEST);
  gl.blitFramebuffer(0, 0, a.width, a.height, 0, 0, a.width, a.height, mask, gl.NEAREST);
  return { framebuffer, texture, buffer, attachment: a,
    Restore() {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, framebuffer);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, source);
      if (!(a.depth || a.stencil)) {
        gl.readBuffer(gl.COLOR_ATTACHMENT0);
        gl.drawBuffers(source ? Array.from({ length: a.point - gl.COLOR_ATTACHMENT0 + 1 }, (_, i) => gl.COLOR_ATTACHMENT0 + i === a.point ? a.point : gl.NONE) : [gl.BACK]);
      }
      gl.disable(gl.SCISSOR_TEST);
      gl.blitFramebuffer(0, 0, a.width, a.height, 0, 0, a.width, a.height, mask, gl.NEAREST);
    },
    Dispose() { gl.deleteFramebuffer(framebuffer); if (texture) gl.deleteTexture(texture); if (buffer) gl.deleteRenderbuffer(buffer); } };
}

export function ReadOutput(gl, source, attachment, options = {}) {
  const restore = SaveGlState(gl);
  let input = null;
  try {
    input = CopyAttachment(gl, source, attachment, true);
    return DrawPreview(gl, input.texture, attachment.width, attachment.height, attachment.depth, options);
  } finally { input?.Dispose(); restore(); }
}

// Reads a texture exactly as the selected draw sees it (after replay). Only
// float/normalized 2D textures: integer and cube/array/3D samplers are skipped.
// Filtering and depth-compare are forced to NEAREST / NONE for the read and put back.
export function ReadTexture(gl, texture, { sourceWidth, sourceHeight, depth = false, ...options } = {}) {
  if (!texture) throw new Error('Texture is not bound');
  const restore = SaveGlState(gl);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture);
  const saved = [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER, gl.TEXTURE_COMPARE_MODE].map(name => [name, gl.getTexParameter(gl.TEXTURE_2D, name)]);
  try {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.NONE);
    return DrawPreview(gl, texture, sourceWidth || options.width || 64, sourceHeight || sourceWidth || options.width || 64, depth, options);
  } finally {
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture);
    for (const [name, value] of saved) gl.texParameteri(gl.TEXTURE_2D, name, value);
    restore();
  }
}

function DrawPreview(gl, input, sourceWidth, sourceHeight, depth, { channel = 'rgba', black = 0, white = 1, exposure = 0, width = 960 } = {}) {
  const resources = [];
  try {
    const w = Math.max(1, Math.min(width, sourceWidth)), h = Math.max(1, Math.round(sourceHeight * w / sourceWidth));
    const target = gl.createFramebuffer(), texture = gl.createTexture();
    resources.push(() => { gl.deleteFramebuffer(target); gl.deleteTexture(texture); });
    gl.bindTexture(gl.TEXTURE_2D, texture); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    const vertex = gl.createShader(gl.VERTEX_SHADER), fragment = gl.createShader(gl.FRAGMENT_SHADER), program = gl.createProgram();
    resources.push(() => { gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment); });
    gl.shaderSource(vertex, '#version 300 es\nout vec2 uv;void main(){uv=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(uv*2.-1.,0.,1.);}');
    gl.shaderSource(fragment, `#version 300 es\nprecision highp float;uniform sampler2D tex;uniform vec3 levels;uniform int channel;in vec2 uv;out vec4 color;void main(){vec4 v=texture(tex,uv);v.rgb*=exp2(levels.z);v=(v-levels.x)/max(0.000001,levels.y-levels.x);if(channel>0){float c=channel==1?v.r:channel==2?v.g:channel==3?v.b:v.a;color=vec4(vec3(c),1.);}else{color=vec4(v.rgb,channel==0?1.:v.a);}}`);
    for (const shader of [vertex, fragment]) { gl.compileShader(shader); gl.attachShader(program, shader); }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    const vao = gl.createVertexArray(); resources.push(() => gl.deleteVertexArray(vao)); gl.bindVertexArray(vao);
    gl.useProgram(program); gl.activeTexture(gl.TEXTURE0); gl.bindSampler(0, null); gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(gl.getUniformLocation(program, 'tex'), 0);
    gl.uniform3f(gl.getUniformLocation(program, 'levels'), black, white, exposure);
    gl.uniform1i(gl.getUniformLocation(program, 'channel'), depth ? 1 : ({ rgba: -1, rgb: 0, r: 1, g: 2, b: 3, a: 4 })[channel] ?? 0);
    for (const flag of [gl.DEPTH_TEST, gl.STENCIL_TEST, gl.CULL_FACE, gl.BLEND, gl.SCISSOR_TEST, gl.RASTERIZER_DISCARD]) gl.disable(flag);
    gl.colorMask(true, true, true, true); gl.viewport(0, 0, w, h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const pixels = new Uint8Array(w * h * 4);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.PACK_ROW_LENGTH, 0); gl.pixelStorei(gl.PACK_SKIP_PIXELS, 0); gl.pixelStorei(gl.PACK_SKIP_ROWS, 0);
    gl.readBuffer(gl.COLOR_ATTACHMENT0); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const flipped = new Uint8ClampedArray(pixels.length);
    for (let y = 0; y < h; y++) flipped.set(pixels.subarray(y * w * 4, (y + 1) * w * 4), (h - y - 1) * w * 4);
    return { width: w, height: h, pixels: flipped };
  } finally { resources.reverse().forEach(Dispose => Dispose()); }
}
