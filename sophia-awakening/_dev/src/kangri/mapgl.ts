// 《烽火敌后》· WebGL 战图。片元着色器渲染「倾斜3D地形战场」：华北地形(fbm 高度场+光照)，
// 按控制场着色(根据地红/敌占灰/中间)，收复区域发红光脉动，日军扫荡时红色冲击环从据点扩散。尽量用 shader 做效果。
const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform int uCount;            // 区域数
uniform vec3 uReg[10];         // x,y(归一化0-1), reclaimed(1/0)
uniform float uSweep;          // 0..1 扫荡冲击强度(1=刚发生)
uniform vec2 uSweepPos;        // 扫荡中心(归一化)
uniform float uPhase;          // 0..3 阶段(越后越亮)
uniform float uControl;        // 0..1 已收复比例

float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
  float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1));
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y); }
float fbm(vec2 p){ float v=0.,a=.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.03; a*=.5; } return v; }

void main(){
  vec2 frag = gl_FragCoord.xy / uRes;             // 0..1
  vec2 sc = (gl_FragCoord.xy - .5*uRes)/uRes.y;   // 居中，等比

  // —— 伪3D倾斜地面：屏幕y映射到深度，近大远小 ——
  float horizon = 0.16;                            // 地平线以上是天
  float yy = frag.y - horizon;
  if(yy <= 0.001){ // 天空/远方战云
    vec3 sky = mix(vec3(.04,.05,.04), vec3(.10,.08,.05), frag.y);
    sky += vec3(.12,.03,.02)*uSweep*smoothstep(.4,0.,frag.y); // 战云泛红
    gl_FragColor = vec4(sky,1.); return;
  }
  float depth = horizon / max(yy, .0009);          // 远处 depth 大
  vec2 world = vec2((frag.x-.5)*depth*2.2, depth*1.1 - uTime*0.006);

  // 高度场 + 伪法线光照
  float h = fbm(world*1.3);
  float hx = fbm((world+vec2(.02,0))*1.3) - h;
  float hy = fbm((world+vec2(0,.02))*1.3) - h;
  vec3 nrm = normalize(vec3(-hx*6., -hy*6., 1.));
  float lig = clamp(dot(nrm, normalize(vec3(.5,.6,.8))), 0., 1.);
  lig = .35 + .75*lig;

  // 地形基色（黄土/山地）
  vec3 land = mix(vec3(.10,.11,.07), vec3(.20,.19,.12), h);
  land = mix(land, vec3(.16,.14,.09), smoothstep(.55,.85,h)); // 山脊

  // —— 控制场：区域影响。根据地(reclaimed)红，敌占灰暗 ——
  // 把归一化区域坐标转到 world 附近做距离场（近似，投影到俯视）
  float redField=0., grayField=0., glow=0.;
  vec2 mapp = vec2((frag.x-.5), (frag.y-horizon)/(1.-horizon)); // 地图归一化(0中心..)
  vec2 mp = vec2(frag.x, (frag.y-horizon)/(1.-horizon));
  for(int i=0;i<10;i++){
    if(i>=uCount) break;
    vec3 R = uReg[i];
    float d = distance(mp, R.xy);
    float infl = smoothstep(.26, 0., d);
    if(R.z>.5){ redField = max(redField, infl); glow += smoothstep(.10,0.,d)*(.6+.4*sin(uTime*2.+float(i))); }
    else grayField = max(grayField, infl*.7);
  }

  vec3 col = land*lig;
  // 敌占区：压暗+青灰(日占)
  col = mix(col, col*vec3(.5,.55,.6)*.7, grayField);
  // 根据地：染红+提亮(星火燎原)
  col = mix(col, mix(col, vec3(.55,.12,.08), .7)*1.15, redField);
  col += vec3(.9,.25,.15)*glow*.5;               // 根据地脉动红光

  // 连接线/网格微光(战图感)
  vec2 g = abs(fract(world*3.)-.5);
  float grid = smoothstep(.48,.5,max(g.x,g.y));
  col += vec3(.10,.14,.08)*grid*.25*(1.-depth*.06);

  // —— 扫荡冲击环：从 uSweepPos 扩散的红环 ——
  if(uSweep>0.01){
    float sd = distance(mp, uSweepPos);
    float ring = smoothstep(.03,0.,abs(sd - (1.-uSweep)*.6));
    col += vec3(1.,.15,.1)*ring*uSweep*1.4;
    col = mix(col, col*vec3(1.2,.7,.6), smoothstep(.5,0.,sd)*uSweep*.5); // 灼烧
  }

  // 距离雾 + 暗角
  col = mix(col, vec3(.05,.05,.045), smoothstep(.2,1.,depth*.5));
  col *= 1.0 - .5*smoothstep(.7,1.4,length(sc));
  // 整体随阶段回暖(黎明)
  col *= mix(.8, 1.15, uPhase/3.);
  col += vec3(.02,.02,.015);

  gl_FragColor = vec4(col, 1.);
}`;

export interface MapGL {
  render: (t: number) => void;
  setRegions: (regs: { x: number; y: number; reclaimed: boolean }[]) => void;
  pulseSweep: (x: number, y: number) => void;
  setPhase: (p: number, control: number) => void;
  resize: () => void;
  ok: boolean;
}

export function initMapGL(canvas: HTMLCanvasElement): MapGL {
  const gl = canvas.getContext("webgl", { antialias: true, alpha: false });
  if (!gl) return stub();
  const prog = link(gl, VERT, FRAG);
  if (!prog) return stub();
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = (n: string) => gl.getUniformLocation(prog, n);
  const uRes = U("uRes"), uTime = U("uTime"), uCount = U("uCount"), uReg = U("uReg"),
    uSweep = U("uSweep"), uSweepPos = U("uSweepPos"), uPhase = U("uPhase"), uControl = U("uControl");

  let regFlat = new Float32Array(30);
  let regCount = 0;
  let sweep = 0, sweepX = 0.5, sweepY = 0.5, phaseV = 0, controlV = 0;

  function resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.max(1, w * dpr); canvas.height = Math.max(1, h * dpr);
    gl!.viewport(0, 0, canvas.width, canvas.height);
  }
  resize();

  return {
    ok: true,
    resize,
    setRegions(regs) {
      regCount = Math.min(10, regs.length); regFlat = new Float32Array(30);
      for (let i = 0; i < regCount; i++) { regFlat[i * 3] = regs[i].x; regFlat[i * 3 + 1] = 1 - regs[i].y; regFlat[i * 3 + 2] = regs[i].reclaimed ? 1 : 0; }
    },
    pulseSweep(x, y) { sweep = 1; sweepX = x; sweepY = 1 - y; },
    setPhase(p, control) { phaseV = p; controlV = control; },
    render(t) {
      sweep = Math.max(0, sweep - 0.012);
      gl!.uniform2f(uRes, canvas.width, canvas.height);
      gl!.uniform1f(uTime, t);
      gl!.uniform1i(uCount, regCount);
      gl!.uniform3fv(uReg, regFlat);
      gl!.uniform1f(uSweep, sweep);
      gl!.uniform2f(uSweepPos, sweepX, sweepY);
      gl!.uniform1f(uPhase, phaseV);
      gl!.uniform1f(uControl, controlV);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    }
  };
}

function link(gl: WebGLRenderingContext, vs: string, fs: string): WebGLProgram | null {
  const v = compile(gl, gl.VERTEX_SHADER, vs), f = compile(gl, gl.FRAGMENT_SHADER, fs);
  if (!v || !f) return null;
  const p = gl.createProgram()!; gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error("link", gl.getProgramInfoLog(p)); return null; }
  return p;
}
function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error("shader", gl.getShaderInfoLog(s)); return null; }
  return s;
}
function stub(): MapGL {
  return { ok: false, render: () => {}, setRegions: () => {}, pulseSweep: () => {}, setPhase: () => {}, resize: () => {} };
}
