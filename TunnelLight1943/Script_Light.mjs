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
varying vec2 vWorld;

float SolidAt(vec2 w) {
  vec2 uv = (w - uMaskMin) / uMaskSize;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  return texture2D(uMask, uv).r;
}

void main() {
  vec2 d = vWorld - uLightPos;
  float dist = length(d);
  if (dist > uRadius) discard;

  // 距离衰减：近处不过曝，边缘干净收掉
  float fall = 1.0 - dist / uRadius;
  fall = fall * fall * (0.35 + 0.65 * fall);

  // 沿光线步进：撞到实心即被挡住。步长按距离自适应，近处省算力
  const int STEPS = 18;
  float lit = 1.0;
  for (int i = 1; i <= STEPS; i++) {
    float t = float(i) / float(STEPS + 1);
    vec2 p = mix(vWorld, uLightPos, t);
    if (SolidAt(p) > 0.5) {
      // 越靠近光源被挡，衰减越硬；靠近墙面留一点软边
      lit = 0.0;
      break;
    }
  }
  // 软化：贴着遮挡面的一圈不要硬切
  float edge = smoothstep(0.0, uSoft, dist);
  float v = fall * mix(1.0, lit, edge) * uIntensity;
  gl_FragColor = vec4(uColor * v, v);
}
`;

/** 造一盏带遮挡的灯 */
export function CreateOccludedLight(occluder, { radius = 5, color = 0xffc878, intensity = 1 } = {}) {
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
  mesh.userData.SetRadius = (r) => {
    mat.uniforms.uRadius.value = r;
    mesh.geometry.dispose();
    mesh.geometry = new THREE.PlaneGeometry(r * 2, r * 2);
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
    air.push({ x0: range[0] - 1.5, y0: UNDER_Y - 0.2, x1: range[1] + 1.5, y1: UNDER_Y + 2.15 });
    // 洞室与旁洞更高
    for (const p of sceneDef.props) {
      if (p.kind === "chamber") {
        air.push({ x0: p.x - p.w / 2, y0: UNDER_Y - 0.2, x1: p.x + p.w / 2, y1: UNDER_Y + 3.0 });
      } else if (p.kind === "pocket") {
        air.push({ x0: p.x - 2.8, y0: UNDER_Y - 0.2, x1: p.x + 2.8, y1: UNDER_Y + 2.5 });
      }
    }
    // 竖井：从地面通到地道顶，光可以顺着漏下去
    for (const shaft of sceneDef.shafts) {
      if (shaft.builtFlag && !state.flags[shaft.builtFlag]) continue;
      air.push({ x0: shaft.x - 0.85, y0: UNDER_Y + 1.6, x1: shaft.x + 0.85, y1: SURFACE_Y + 0.3 });
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
