// One quad, three samplers. This DOM overlay is outside the world's HDR/prepass pipeline.
// Compiles, decodes and renders in its own Worker; idle papers have no frame loop.
const vertexSource = `
attribute vec2 position;
varying vec2 uv;
void main() { uv = position * 0.5 + 0.5; gl_Position = vec4(position, 0.0, 1.0); }
`;
const fragmentSource = `
precision highp float;
varying vec2 uv;
uniform sampler2D baseMap, normalMap, roughnessMap;
uniform vec2 tilt;
uniform vec3 lightDirection;
uniform vec4 surface;
vec3 Linear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
vec3 Srgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0/2.4)) - 0.055, step(vec3(0.0031308), c));
}
vec3 Rotate(vec3 n) {
  float cy=cos(tilt.x), sy=sin(tilt.x), cx=cos(-tilt.y), sx=sin(-tilt.y);
  n = vec3(cy*n.x + sy*n.z, n.y, -sy*n.x + cy*n.z);
  return vec3(n.x, cx*n.y - sx*n.z, sx*n.y + cx*n.z);
}
void main() {
  vec3 base = texture2D(baseMap, uv).rgb;
  vec4 material = texture2D(roughnessMap, uv);
  vec3 n = texture2D(normalMap, uv).rgb * 2.0 - 1.0;
  n = normalize(Rotate(normalize(vec3(n.xy * surface.x, max(n.z, 0.1)))));
  vec3 l = normalize(lightDirection), v = vec3(0.0, 0.0, 1.0), h = normalize(l + v);
  float nl=max(dot(n,l),0.0), nv=max(dot(n,v),0.001), nh=max(dot(n,h),0.0);
  float roughness=clamp(material.r,0.65,1.0), a=roughness*roughness, a2=a*a;
  float d=a2/(3.14159265*pow(nh*nh*(a2-1.0)+1.0,2.0));
  float k=pow(roughness+1.0,2.0)/8.0;
  float g=(nv/(nv*(1.0-k)+k))*(nl/(nl*(1.0-k)+k));
  float f=0.04+0.96*pow(1.0-max(dot(v,h),0.0),5.0);
  float spec=d*g*f/max(4.0*nv*nl,0.001)*nl;
  // Existing print already includes its museum photograph lighting. Normalize
  // diffuse at rest; add only gentle changing relief, never re-author the ink.
  float diffuse=(surface.y+surface.z*nl)/(surface.y+surface.z*l.z);
  vec3 color=Linear(base)*diffuse+vec3(spec*surface.w*material.a);
  gl_FragColor=vec4(Srgb(max(color,vec3(0.0))),1.0);
}
`;
let gl, canvas, program, tuning, tiltLocation, ready = false;
let current = { yaw: 0, pitch: 0 }, animation = null, frame = null;
const Schedule = callback => typeof requestAnimationFrame === "function" ? requestAnimationFrame(callback) : setTimeout(() => callback(performance.now()), 16);

function Compile(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source); gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  gl.attachShader(program, shader); gl.deleteShader(shader);
}

// Exactly the same cubic-bezier(0.2,0.8,0.2,1) as the compositor's CSS return.
function Ease(x) {
  let lo = 0, hi = 1, t = x;
  for (let i = 0; i < 14; i++) {
    t = (lo + hi) * 0.5;
    const inv = 1 - t, at = 0.6 * inv * inv * t + 0.6 * inv * t * t + t * t * t;
    if (at < x) lo = t; else hi = t;
  }
  return 2.4 * (1-t)*(1-t)*t + 3*(1-t)*t*t + t*t*t;
}

function Draw(time = performance.now()) {
  frame = null;
  if (!ready) return;
  if (animation) {
    const progress = Math.min(1, (time - animation.start) / animation.duration);
    const f = Ease(progress);
    current = { yaw: animation.from.yaw*(1-f)+animation.to.yaw*f, pitch: animation.from.pitch*(1-f)+animation.to.pitch*f };
    if (progress >= 1) { current = animation.to; animation = null; }
  }
  gl.uniform2f(tiltLocation, current.yaw * Math.PI / 180, current.pitch * Math.PI / 180);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  if (animation) Invalidate();
}
function Invalidate() { if (ready && frame === null) frame = Schedule(Draw); }
function Resize(size) {
  canvas.width = size.width; canvas.height = size.height;
  if (gl) gl.viewport(0, 0, size.width, size.height);
  Invalidate();
}

async function Init(message) {
  canvas = message.canvas; tuning = message.tuning; current = message.tilt;
  gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: "low-power" });
  if (!gl) throw new Error("BootPaper: WebGL unavailable");
  canvas.addEventListener("webglcontextlost", () => { ready = false; postMessage({ type: "error" }); });
  program = gl.createProgram();
  Compile(gl.VERTEX_SHADER, vertexSource); Compile(gl.FRAGMENT_SHADER, fragmentSource);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
  const pos = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(pos); gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
  tiltLocation = gl.getUniformLocation(program, "tilt");
  gl.uniform3fv(gl.getUniformLocation(program, "lightDirection"), tuning.light);
  gl.uniform4f(gl.getUniformLocation(program, "surface"), tuning.normalScale, tuning.ambient, tuning.direct, tuning.specular);
  // Bitmap orientation and color conversion must be set at decode, because
  // WebGL UNPACK_FLIP_Y / PREMULTIPLY_ALPHA flags do not affect ImageBitmap.
  await Promise.all(["base", "normal", "roughness"].map(async (key, unit) => {
    const response = await fetch(message.urls[key]);
    if (!response.ok) throw new Error(`BootPaper: ${key} ${response.status}`);
    const bitmap = await createImageBitmap(await response.blob(), {
      imageOrientation: "flipY", premultiplyAlpha: "none", colorSpaceConversion: "none",
    });
    try {
      const texture = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
      gl.uniform1i(gl.getUniformLocation(program, `${key}Map`), unit);
    } finally { bitmap.close(); }
  }));
  Resize({ width: canvas.width, height: canvas.height });
  ready = true; Draw(); postMessage({ type: "ready" });
}

self.onmessage = ({ data }) => {
  if (data.type === "init") Init(data).catch(error => postMessage({ type: "error", message: String(error) }));
  else if (data.type === "resize" && canvas) Resize(data.size);
  else if (data.type === "tilt") {
    animation = data.duration ? { from: { ...current }, to: data.tilt, start: performance.now(), duration: data.duration } : null;
    if (!animation) current = data.tilt;
    Invalidate();
  }
};
