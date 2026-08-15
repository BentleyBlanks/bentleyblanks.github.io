// 《地道里的光》 —— 2D 遮挡光照。
//
// 画面是剖面：土是实心的，地道是掏出来的空腔。灯必须只照亮空腔，
// 照不穿土层，也不能从地面漏进地道。做法：
//   1) 按场景烘一张"遮挡掩码"（白=实心土/墙，黑=空气），
//   2) 每盏灯是一个覆盖其半径的四边形，片元着色器从当前像素沿直线
//      步进到光源，途中撞到实心就判为在阴影里。
// 等价于对遮挡场做可见性查询，比逐灯生成阴影网格简单，且天然支持
// "光从竖井口漏下去"这种剖面特有的效果。

import * as THREE from "three";

const MASK_PPM = 6;   // 掩码分辨率（像素/米）——只用于可见性，不需要很高

/**
 * 烘一张遮挡掩码。
 * solids: [{x0,y0,x1,y1}] 实心矩形（世界坐标，y 向上）
 * air:    [{x0,y0,x1,y1}] 从实心里挖回空气的矩形（后处理，优先级更高）
 */
export function BuildOccluder(bounds, solids, air) {
  const w = Math.max(8, Math.ceil((bounds.x1 - bounds.x0) * MASK_PPM));
  const h = Math.max(8, Math.ceil((bounds.y1 - bounds.y0) * MASK_PPM));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  // 掩码里 y 轴向下，世界 y 向上，作一次翻转
  const toPx = (x) => (x - bounds.x0) * MASK_PPM;
  const toPy = (y) => (bounds.y1 - y) * MASK_PPM;

  ctx.fillStyle = "#000";           // 默认空气
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#fff";           // 实心
  for (const s of solids) {
    ctx.fillRect(toPx(s.x0), toPy(s.y1), (s.x1 - s.x0) * MASK_PPM, (s.y1 - s.y0) * MASK_PPM);
  }
  ctx.fillStyle = "#000";           // 掏回空气（地道、洞室、竖井）
  for (const a of air) {
    ctx.fillRect(toPx(a.x0), toPy(a.y1), (a.x1 - a.x0) * MASK_PPM, (a.y1 - a.y0) * MASK_PPM);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return {
    texture: tex,
    canvas,
    min: new THREE.Vector2(bounds.x0, bounds.y0),
    size: new THREE.Vector2(bounds.x1 - bounds.x0, bounds.y1 - bounds.y0),
  };
}

const VERT = `
varying vec2 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xy;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

// 动态遮挡体上限。人是站在灯前的，投出的影子比土墙的更会说话——
// 一盏马灯扫过院子，墙上先出现的是提灯那个人被拉长的影子。
export const MAX_BLOCKERS = 8;

const FRAG = `
precision highp float;
uniform sampler2D uMask;
uniform vec2 uMaskMin;
uniform vec2 uMaskSize;
uniform vec2 uLightPos;
uniform float uRadius;
uniform vec3 uColor;
uniform float uIntensity;
uniform float uSoft;
uniform int uBlockerCount;
uniform vec4 uBlockers[${MAX_BLOCKERS}];   // xy=中心 zw=半宽半高
varying vec2 vWorld;

float SolidAt(vec2 w) {
  vec2 uv = (w - uMaskMin) / uMaskSize;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  return texture2D(uMask, uv).r;
}

// 动态遮挡（人体）：软边一点，人的影子边缘本来就不该是刀切的
float BlockedAt(vec2 p) {
  float hit = 0.0;
  for (int i = 0; i < ${MAX_BLOCKERS}; i++) {
    if (i >= uBlockerCount) break;
    vec4 b = uBlockers[i];
    vec2 q = abs(p - b.xy) - b.zw;
    float inside = max(q.x, q.y);
    hit = max(hit, 1.0 - smoothstep(-0.06, 0.07, inside));
  }
  return hit;
}

void main() {
  vec2 d = vWorld - uLightPos;
  float dist = length(d);
  if (dist > uRadius) discard;

  // 距离衰减：近处不过曝，边缘干净收掉
  float fall = 1.0 - dist / uRadius;
  fall = fall * fall * (0.35 + 0.65 * fall);

  // 沿光线步进：撞到实心即被挡住。
  // 步长必须按**世界尺度**取，不能把固定步数摊到整段距离上——地道净高不到
  // 两米、洞顶到地表的土层也就两米出头，而暗适应那盏灯半径 17 米，等分 18 步
  // 时步长将近一米，斜着穿过土层的光线会整段跳过去，于是灯光糊到土里。
  const int STEPS = 48;
  float stepLen = max(dist / float(STEPS), 0.16);
  vec2 dir = d / max(dist, 1e-4);
  float lit = 1.0;
  for (int i = 1; i <= STEPS; i++) {
    float t = float(i) * stepLen;
    if (t >= dist) break;
    vec2 p = vWorld - dir * t;
    // 土墙挡死
    if (SolidAt(p) > 0.5) { lit = 0.0; break; }
    // 人挡光不挡死：半影里还留一点点，才不像贴了张黑纸
    lit = min(lit, 1.0 - BlockedAt(p) * 0.92);
  }
  // 着色点本身就在土里：只留一点点，让洞壁上下沿有受光感；
  // 再往土里深一点，上面的步进会判成全黑。光就此收在地道的上下边缘里。
  float selfSolid = SolidAt(vWorld);

  // 软化：贴着遮挡面的一圈不要硬切
  float edge = smoothstep(0.0, uSoft, dist);
  float v = fall * mix(1.0, lit, edge) * uIntensity * mix(1.0, 0.22, selfSolid);
  gl_FragColor = vec4(uColor * v, v);
}
`;

/** 造一盏带遮挡的灯 */
export function CreateOccludedLight(occluder, { radius = 5, color = 0xffc878, intensity = 1 } = {}) {
  const blockers = [];
  for (let i = 0; i < MAX_BLOCKERS; i += 1) blockers.push(new THREE.Vector4(0, 0, 0, 0));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMask: { value: occluder.texture },
      uMaskMin: { value: occluder.min },
      uMaskSize: { value: occluder.size },
      uLightPos: { value: new THREE.Vector2() },
      uRadius: { value: radius },
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: intensity },
      uSoft: { value: 0.55 },
      uBlockerCount: { value: 0 },
      uBlockers: { value: blockers },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), mat);
  mesh.renderOrder = 60;
  mesh.userData.SetLight = (x, y, z = 0.4) => {
    mesh.position.set(x, y, z);
    mat.uniforms.uLightPos.value.set(x, y);
  };
  mesh.userData.SetIntensity = (v) => { mat.uniforms.uIntensity.value = v; };
  // boxes: [{x, y, hw, hh}]，只取离本灯最近的前 MAX_BLOCKERS 个
  mesh.userData.SetBlockers = (boxes) => {
    const lx = mat.uniforms.uLightPos.value.x;
    const ly = mat.uniforms.uLightPos.value.y;
    const r = mat.uniforms.uRadius.value;
    const near = [];
    for (const b of boxes) {
      // 灯就在这个体积里（提灯的人自己）——照他自己不算被挡
      if (Math.abs(lx - b.x) < b.hw + 0.05 && Math.abs(ly - b.y) < b.hh + 0.05) continue;
      const d = Math.hypot(lx - b.x, ly - b.y);
      if (d > r) continue;
      near.push({ b, d });
    }
    near.sort((p, q) => p.d - q.d);
    const n = Math.min(near.length, MAX_BLOCKERS);
    for (let i = 0; i < n; i += 1) {
      const { b } = near[i];
      mat.uniforms.uBlockers.value[i].set(b.x, b.y, b.hw, b.hh);
    }
    mat.uniforms.uBlockerCount.value = n;
  };
  mesh.userData.SetRadius = (r) => {
    mat.uniforms.uRadius.value = r;
    mesh.geometry.dispose();
    mesh.geometry = new THREE.PlaneGeometry(r * 2, r * 2);
  };
  return mesh;
}

// ────────────────────────────────────────────────────────────────────────
// 打进来的光（2026-08-13 用户定：「序章里的打进来的光要做出来」）
//
// 老版是**烘在井壁贴图上的几道渐变**：它被剪在井筒的剪影里，所以那几条光
// 只存在于洞顶以上那截土管子里，窖底那间屋子——正是两个孩子蹲着的地方——
// 一丝光都没有。而且它画的是"墙上有几道亮痕"，不是"空气里有一束光"。
//
// 现在按 SDF 现算：每条光是一条**从板缝射下来的楔形**，
//   · 到光轴的横向距离减去该处半宽 = 有符号距离，softstep 出柔边（这就是 SDF），
//   · 半宽随行程线性张开——板缝窄、落到地上摊开一块，
//   · 沿程按 mask 往回步进一次：撞到实心土就没有光（洞顶以上的土层自然吃掉，
//     光只在掏空的窖里存在），
//   · **人挡得住光**：躯干进了光柱，光柱在他身上断一截（uBlockers 与灯共用）
//     ——这是"打进来的光"和"墙上画了几道黄条"的分界线，
//   · 光柱里有浮尘、落点有一摊亮斑。
//
// 与灯不同，这里的遮挡步进只做**一次**（所有光柱共用一个源点方向），
// 而且**先算 SDF、光柱外的片元当场 discard**——不然满屏都在跑步进。
export const MAX_SHAFTS = 4;

const SHAFT_FRAG = `
precision highp float;
uniform sampler2D uMask;
uniform vec2 uMaskMin;
uniform vec2 uMaskSize;
uniform vec2 uOrigin;      // 板缝所在（窖口中心，地表高度）
uniform vec2 uDir;         // 光的方向（朝下，斜的时候往东偏）
uniform vec4 uShafts[${MAX_SHAFTS}];   // x=缝相对窖口的横向偏移 y=缝口半宽 z=每米张开 w=亮度
uniform int uCount;
uniform float uLen;        // 打得多远
uniform float uFloorY;     // 落到哪儿（窖底）
uniform float uIntensity;
uniform float uDust;
uniform float uTime;
uniform vec3 uColor;
uniform int uBlockerCount;
uniform vec4 uBlockers[${MAX_BLOCKERS}];
varying vec2 vWorld;

float SolidAt(vec2 w) {
  vec2 uv = (w - uMaskMin) / uMaskSize;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  return texture2D(uMask, uv).r;
}

float BlockedAt(vec2 p) {
  float hit = 0.0;
  for (int i = 0; i < ${MAX_BLOCKERS}; i++) {
    if (i >= uBlockerCount) break;
    vec4 b = uBlockers[i];
    vec2 q = abs(p - b.xy) - b.zw;
    hit = max(hit, 1.0 - smoothstep(-0.05, 0.08, max(q.x, q.y)));
  }
  return hit;
}

float Hash21(vec2 p) {
  return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453);
}

void main() {
  vec2 perp = vec2(uDir.y, -uDir.x);
  vec2 rel = vWorld - uOrigin;
  float tAxis = dot(rel, uDir);
  if (tAxis < -0.15 || tAxis > uLen) discard;

  // ── 先算 SDF：光柱外的片元一律不参与后面的步进 ──
  float core = 0.0;      // 光柱里的浓度
  float pool = 0.0;      // 落点那摊亮斑
  for (int i = 0; i < ${MAX_SHAFTS}; i++) {
    if (i >= uCount) break;
    vec4 s = uShafts[i];
    vec2 o = uOrigin + perp * s.x;
    vec2 d = vWorld - o;
    float t = dot(d, uDir);
    if (t < 0.0) continue;
    float lat = dot(d, perp);
    float hw = s.y + s.z * t;
    // 有符号距离：<0 在光柱里。柔边按半宽走（尺度不变），但**不许糊过头**——
    // 柔边一宽，三条缝就并成一根胖柱子，读出来是"一团光晕"不是"几条光"
    float sd = abs(lat) - hw;
    float k = 1.0 - smoothstep(-hw * 0.55, hw * 0.12, sd);
    // 越往下越淡（空气里散掉了）。指数压到 0.85：1.5 那档打到窖底只剩一成，
    // 光在半空就没了，落地那摊亮斑跟上面接不上
    float fade = pow(max(0.0, 1.0 - t / uLen), 0.85);
    core += k * fade * s.w;

    // 落在窖底的那摊：光轴撞地的位置，横着摊开一块椭圆
    float tf = (uFloorY - o.y) / uDir.y;
    if (tf > 0.0) {
      vec2 hit = o + uDir * tf;
      float hwf = s.y + s.z * tf;
      vec2 q = (vWorld - hit) / vec2(hwf * 1.5, hwf * 0.42);
      pool += (1.0 - smoothstep(0.4, 1.0, length(q))) * s.w * 0.55;
    }
  }
  float amt = core + pool;
  if (amt < 0.004) discard;

  // ── 挡住没有：土层挡死，人挡一截 ──
  const int STEPS = 22;
  float dist = max(tAxis, 0.02);
  float stepLen = max(dist / float(STEPS), 0.12);
  float lit = 1.0;
  for (int i = 1; i <= STEPS; i++) {
    float t = float(i) * stepLen;
    if (t >= dist) break;
    vec2 p = vWorld - uDir * t;
    if (SolidAt(p) > 0.5) { lit = 0.0; break; }
    lit = min(lit, 1.0 - BlockedAt(p) * 0.94);
  }
  // 着色点自己就在土里：一点点受光感，不然洞壁没有被照到的样子
  lit *= mix(1.0, 0.25, SolidAt(vWorld));

  // ── 浮尘：光柱里才看得见的那些小颗粒，慢慢往下飘 ──
  float dust = 0.0;
  if (uDust > 0.0 && core > 0.02) {
    vec2 cell = vec2(vWorld.x * 7.0, vWorld.y * 7.0 - uTime * 0.35);
    vec2 id = floor(cell);
    float rnd = Hash21(id);
    float d = length(fract(cell) - vec2(0.35 + 0.3 * rnd, 0.5));
    dust = smoothstep(0.30, 0.02, d) * step(0.86, rnd) * uDust * core;
  }

  float v = (amt * lit + dust) * uIntensity;
  gl_FragColor = vec4(uColor * v, v);
}
`;

/**
 * 造一束"打进来的光"。所有几何参数都按世界米给，摆位由 SetShafts 决定。
 */
export function CreateLightShafts(occluder, { color = 0xe8dcb6, span = 12, height = 6 } = {}) {
  const shafts = [];
  for (let i = 0; i < MAX_SHAFTS; i += 1) shafts.push(new THREE.Vector4(0, 0, 0, 0));
  const blockers = [];
  for (let i = 0; i < MAX_BLOCKERS; i += 1) blockers.push(new THREE.Vector4(0, 0, 0, 0));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMask: { value: occluder.texture },
      uMaskMin: { value: occluder.min },
      uMaskSize: { value: occluder.size },
      uOrigin: { value: new THREE.Vector2() },
      uDir: { value: new THREE.Vector2(0, -1) },
      uShafts: { value: shafts },
      uCount: { value: 0 },
      uLen: { value: height },
      uFloorY: { value: -3.6 },
      uIntensity: { value: 0 },
      uDust: { value: 1 },
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uBlockerCount: { value: 0 },
      uBlockers: { value: blockers },
    },
    vertexShader: VERT,
    fragmentShader: SHAFT_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(span, height), mat);
  mesh.userData.uniforms = mat.uniforms;
  // 光柱平面挂在窖口正下方那块空气上（origin 在上沿中点）
  mesh.userData.SetOrigin = (x, y, z = 0.5) => {
    mesh.position.set(x, y - height / 2, z);
    mat.uniforms.uOrigin.value.set(x, y);
  };
  mesh.userData.SetSlant = (slant) => {
    const len = Math.hypot(slant, 1);
    mat.uniforms.uDir.value.set(slant / len, -1 / len);
  };
  // list: [{off, half, spread, gain}]
  mesh.userData.SetShafts = (list) => {
    const n = Math.min(list.length, MAX_SHAFTS);
    for (let i = 0; i < n; i += 1) {
      const s = list[i];
      shafts[i].set(s.off, s.half, s.spread, s.gain);
    }
    mat.uniforms.uCount.value = n;
  };
  mesh.userData.SetIntensity = (v) => { mat.uniforms.uIntensity.value = v; };
  mesh.userData.SetFloor = (y) => { mat.uniforms.uFloorY.value = y; };
  mesh.userData.SetDust = (v) => { mat.uniforms.uDust.value = v; };
  mesh.userData.SetTime = (t) => { mat.uniforms.uTime.value = t; };
  mesh.userData.SetBlockers = (boxes) => {
    const ox = mat.uniforms.uOrigin.value.x;
    const near = [];
    for (const b of boxes) {
      if (Math.abs(b.x - ox) > span * 0.75) continue;
      near.push({ b, d: Math.abs(b.x - ox) });
    }
    near.sort((p, q) => p.d - q.d);
    const n = Math.min(near.length, MAX_BLOCKERS);
    for (let i = 0; i < n; i += 1) {
      const { b } = near[i];
      blockers[i].set(b.x, b.y, b.hw, b.hh);
    }
    mat.uniforms.uBlockerCount.value = n;
  };
  return mesh;
}

/** 由场景数据推出遮挡矩形（土层实心，地道/洞室/竖井是空气） */
export function SceneOccluders(sceneDef, state, SURFACE_Y, UNDER_Y) {
  const L = sceneDef.length;
  const bounds = { x0: -40, y0: UNDER_Y - 6, x1: L + 40, y1: SURFACE_Y + 20 };
  const solids = [];
  const air = [];

  // 地面以下全部是土
  solids.push({ x0: bounds.x0, y0: bounds.y0, x1: bounds.x1, y1: SURFACE_Y });

  const range = sceneDef.walk.under;
  if (range) {
    // 地道走廊：掏成空气
    air.push({ x0: range[0] - 1.5, y0: UNDER_Y - 0.2, x1: range[1] + 1.5, y1: UNDER_Y + 1.55 });
    // 洞室与旁洞更高
    for (const p of sceneDef.props) {
      if (p.kind === "chamber") {
        air.push({ x0: p.x - p.w / 2, y0: UNDER_Y - 0.2, x1: p.x + p.w / 2, y1: UNDER_Y + 3.0 });
      } else if (p.kind === "pocket") {
        air.push({ x0: p.x - 2.8, y0: UNDER_Y - 0.2, x1: p.x + 2.8, y1: UNDER_Y + 2.5 });
      }
    }
    // 竖井：从地面通到地道顶，光可以顺着漏下去。
    // 下沿要**探进走廊里**（1.4 < 走廊顶 1.55）：接口处留一条 5 厘米的实心，
    // 掩码只有 6 像素/米，那条缝照样能把顺井打下来的光整束切断
    for (const shaft of sceneDef.shafts) {
      if (shaft.builtFlag && !state.flags[shaft.builtFlag]) continue;
      air.push({ x0: shaft.x - 0.85, y0: UNDER_Y + 1.4, x1: shaft.x + 0.85, y1: SURFACE_Y + 0.3 });
    }
  }

  // 地上的房子与高墙挡光
  for (const p of sceneDef.props) {
    if (p.kind === "house") {
      solids.push({ x0: p.x - p.w / 2, y0: SURFACE_Y, x1: p.x + p.w / 2, y1: SURFACE_Y + p.h });
    } else if (p.kind === "fortWall" || (p.kind === "wallSeg" && (p.h || 0) >= 1.6)) {
      solids.push({ x0: p.x - (p.w || 1) / 2, y0: SURFACE_Y, x1: p.x + (p.w || 1) / 2, y1: SURFACE_Y + (p.h || 2) });
    } else if (p.kind === "blockhouse") {
      solids.push({ x0: p.x - 2, y0: SURFACE_Y, x1: p.x + 2, y1: SURFACE_Y + 6 });
    }
  }

  return { bounds, solids, air };
}
