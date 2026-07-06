// 真·shader 视差背景：WebGL 全屏片元着色器。
// 多层内容按深度对鼠标做不同幅度的偏移（视差）：辉光雾 < 三层网格 < 两层星尘，越近层跟手越多。
// 主题色 uA 随阶段切换平滑过渡。

export interface ShaderBg {
  frame(tMs: number): void;
  setMouse(x: number, y: number): void; // 归一化 -1..1
  setAccent(hex: string): void;
}

const VERT = `attribute vec2 aP; void main(){ gl_Position = vec4(aP, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform vec2 uRes; uniform float uT; uniform vec2 uM; uniform vec3 uA;

float h21(vec2 p){ p = fract(p * vec2(234.34, 435.345)); p += dot(p, p + 34.23); return fract(p.x * p.y); }

float gridMask(vec2 p, float w){
  vec2 g = abs(fract(p) - 0.5);
  float d = 0.5 - max(g.x, g.y);
  return smoothstep(w, 0.0, d);
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  vec3 col = vec3(0.010, 0.014, 0.012);

  // 深层辉光雾（跟手最少）
  float neb = exp(-2.4 * length(uv - vec2(0.0, 0.02) + uM * 0.05));
  col += uA * neb * 0.06;
  float neb2 = exp(-3.5 * length(uv + vec2(0.55, -0.3) + uM * 0.03));
  col += uA * neb2 * 0.03;

  // 三层网格：深度越大（越近）缩放越大、随鼠标偏移越多、漂移越快
  for (int i = 1; i <= 3; i++) {
    float fi = float(i);
    float depth = fi / 3.0;
    vec2 p = uv * (2.6 + fi * 2.4) + uM * depth * 1.15 + vec2(uT * 0.008 * fi, uT * 0.016 * depth);
    float g = gridMask(p, 0.045);
    float fade = exp(-1.5 * length(uv));
    col += uA * g * 0.055 * depth * fade;
  }

  // 两层星尘（最近层，视差最强 + 闪烁）
  for (int i = 1; i <= 2; i++) {
    float fi = float(i);
    vec2 p = uv * (12.0 + fi * 9.0) + uM * (1.3 + fi * 1.5) + vec2(0.0, uT * 0.05 * fi);
    vec2 id = floor(p); vec2 f = fract(p) - 0.5;
    float rnd = h21(id);
    vec2 off = (vec2(rnd, fract(rnd * 7.13)) - 0.5) * 0.7;
    float star = smoothstep(0.10, 0.0, length(f - off)) * step(0.92, rnd);
    float tw = 0.55 + 0.45 * sin(uT * (1.0 + rnd * 4.0) + rnd * 30.0);
    col += mix(vec3(0.9), uA, 0.55) * star * tw * (0.5 / fi);
  }

  // 扫描线 + 暗角
  col *= 0.95 + 0.05 * sin(gl_FragCoord.y * 1.7);
  col *= 1.0 - 0.5 * dot(uv, uv);
  gl_FragColor = vec4(col, 1.0);
}`;

function hexToRgb01(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}

export function createShaderBg(canvas: HTMLCanvasElement): ShaderBg {
  const noop: ShaderBg = { frame: () => {}, setMouse: () => {}, setAccent: () => {} };
  const gl = canvas.getContext("webgl", { antialias: false, depth: false, alpha: false, powerPreference: "low-power" });
  if (!gl) return noop;

  function compile(type: number, src: string): WebGLShader | null {
    const sh = gl!.createShader(type); if (!sh) return null;
    gl!.shaderSource(sh, src); gl!.compileShader(sh);
    if (!gl!.getShaderParameter(sh, gl!.COMPILE_STATUS)) { console.error(gl!.getShaderInfoLog(sh)); return null; }
    return sh;
  }
  const vs = compile(gl.VERTEX_SHADER, VERT), fs = compile(gl.FRAGMENT_SHADER, FRAG);
  const prog = gl.createProgram();
  if (!vs || !fs || !prog) return noop;
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(prog)); return noop; }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aP = gl.getAttribLocation(prog, "aP");
  gl.enableVertexAttribArray(aP);
  gl.vertexAttribPointer(aP, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(prog, "uRes");
  const uT = gl.getUniformLocation(prog, "uT");
  const uM = gl.getUniformLocation(prog, "uM");
  const uA = gl.getUniformLocation(prog, "uA");

  let mx = 0, my = 0, tx = 0, ty = 0; // 平滑后的鼠标 / 目标
  let ac: [number, number, number] = hexToRgb01("#7be0b0");
  let acT: [number, number, number] = [...ac];

  return {
    setMouse(x, y) { tx = x; ty = y; },
    setAccent(hex) { acT = hexToRgb01(hex); },
    frame(tMs) {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.floor(canvas.clientWidth * dpr), h = Math.floor(canvas.clientHeight * dpr);
      if (w === 0 || h === 0) return;
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
      mx += (tx - mx) * 0.055; my += (ty - my) * 0.055;
      for (let i = 0; i < 3; i++) ac[i] += (acT[i] - ac[i]) * 0.04;
      gl.uniform2f(uRes, w, h);
      gl.uniform1f(uT, tMs / 1000);
      gl.uniform2f(uM, mx, my);
      gl.uniform3f(uA, ac[0], ac[1], ac[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  };
}
