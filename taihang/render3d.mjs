// 《太行·1941》3D 渲染(文明6式 2.5D) —— Three.js。读 window.TH 的游戏状态, 复用其点格逻辑。
// 地形: 分层六边台地 + 手绘/程序材质; 树木 PCG 实例化; 天空大气散射; 单位/建筑=轻量微缩模型。
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.mjs";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.mjs";
import { RenderPass } from "three/addons/postprocessing/RenderPass.mjs";
import { TAARenderPass } from "three/addons/postprocessing/TAARenderPass.mjs";
import { OutputPass } from "three/addons/postprocessing/OutputPass.mjs";
import { CSM } from "three/addons/csm/CSM.mjs";

const SQ3 = Math.sqrt(3), R = 1.0, DEG = THREE.MathUtils.degToRad;
const G = () => window.TH;

let renderer, scene, camera, controls, animId = 0, host = null, ro = null;
let gTiles, gTerrain, gTrees, gUnits, gStruct, gOverlay;
const tiles = {};            // "q,r" -> { mesh, h, terrain }
let prismGeo, coneGeo, cragGeo, ridgeGeo, treeTrunkGeo, treeLeafGeo, treeLeafTopGeo, hexFlatGeo, roofGeo;
const matCache = {};
const texCache = {};
const sharedMats = {};
let iconAtlasImg = null;
let surfaceLoadStarted = false;
let sunLight, sky, hemiLight, ambientLight, lastSig = "", inited = false, cx0 = 0, cz0 = 0;
let _sunElev = 42, _sunAzi = 150, composer = null, taaPass = null, taaEnabled = false;
let camPolar = 0.62; // 相机俯视极角(距+Y轴; 越小越俯视/越接近正上方俯拍 — 参考文明6)
let csm = null; const csmCfg = { cascades: 2, size: 2048, maxFar: 55, fade: true, enabled: true };
let atmoOn = true, cubeTex = null, _tod = 12; // 大气开关 / CubeMap / 昼夜时刻(0-24h)
const skyU = {
  uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uZenith: { value: new THREE.Color(0x2a5fa8) },
  uHorizon: { value: new THREE.Color(0xacc6da) }, uGround: { value: new THREE.Color(0xcbb98e) }, // 地平线下=纸色(与羊皮纸桌面衔接)
  uNight: { value: new THREE.Color(0x0a1430) }, uDay: { value: 1 }, uSunCol: { value: new THREE.Color(0xfff0d0) },
};
const SKY_VERT = "varying vec3 vD; void main(){ vec4 wp=modelMatrix*vec4(position,1.0); vD=wp.xyz-cameraPosition; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }";
const SKY_FRAG = "varying vec3 vD; uniform vec3 uSunDir,uZenith,uHorizon,uGround,uNight,uSunCol; uniform float uDay; void main(){ vec3 d=normalize(vD); float up=d.y; float t=pow(clamp(up,0.0,1.0),0.55); vec3 s=mix(uHorizon,uZenith,t); if(up<0.0) s=mix(uHorizon,uGround,clamp(-up*2.5,0.0,1.0)); float sd=max(dot(d,uSunDir),0.0); float halo=pow(sd,6.0)*0.35+pow(sd,350.0)*1.2; float disk=smoothstep(0.9994,0.99975,sd); s+=uSunCol*halo; s=mix(s,uSunCol*1.3,disk); s=mix(uNight,s,uDay); gl_FragColor=vec4(pow(max(s,vec3(0.0)),vec3(0.4545)),1.0); }"; // pow=线性→sRGB输出(ShaderMaterial不带colorspace chunk)
// JS 版天空色(生成 CubeMap 用, 与 shader 对齐)
function skyColorJS(dx, dy, dz) {
  const sd = Math.max(0, dx * skyU.uSunDir.value.x + dy * skyU.uSunDir.value.y + dz * skyU.uSunDir.value.z);
  const t = Math.pow(Math.max(0, dy), 0.55), Z = skyU.uZenith.value, Ho = skyU.uHorizon.value, Gr = skyU.uGround.value, N = skyU.uNight.value, SC = skyU.uSunCol.value, day = skyU.uDay.value;
  let r, g, b;
  if (dy >= 0) { r = Ho.r + (Z.r - Ho.r) * t; g = Ho.g + (Z.g - Ho.g) * t; b = Ho.b + (Z.b - Ho.b) * t; }
  else { const k = Math.min(1, -dy * 2.5); r = Ho.r + (Gr.r - Ho.r) * k; g = Ho.g + (Gr.g - Ho.g) * k; b = Ho.b + (Gr.b - Ho.b) * k; }
  const halo = Math.pow(sd, 6) * 0.35 + Math.pow(sd, 350) * 1.2;
  r += SC.r * halo; g += SC.g * halo; b += SC.b * halo;
  r = N.r + (r - N.r) * day; g = N.g + (g - N.g) * day; b = N.b + (b - N.b) * day;
  const enc = v => Math.min(255, Math.pow(Math.max(0, v), 1 / 2.2) * 255) | 0; // 线性→sRGB(纹理标记为SRGBColorSpace)
  return [enc(r), enc(g), enc(b)];
}
let clock = 0; const revealAnims = {}; const tileVisPrev = new Set(); // 战雾展开动画

// ── PCG 噪声 ──
function h2(x, y) { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); }
function vn(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const a = h2(ix, iy), b = h2(ix + 1, iy), c = h2(ix, iy + 1), d = h2(ix + 1, iy + 1);
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + c * (1 - ux) * uy + d * ux * uy;
}
function fbm(x, y) { let s = 0, a = .5, f = 1; for (let i = 0; i < 4; i++) { s += a * vn(x * f, y * f); f *= 2; a *= .5; } return s; }
function hexWorld(q, r) { return [1.5 * R * q, SQ3 * R * (r + 0.5 * (q & 1))]; }

const TERR = {
  plain:    { base: .25, amp: .06, top: "#8b7a4b", side: "#5b4934", fleck: "#b19a67" },
  hills:    { base: .34, amp: .14, top: "#7b6843", side: "#554337", fleck: "#a08a5d" },
  forest:   { base: .30, amp: .08, top: "#3f4d32", side: "#3f3c31", fleck: "#667052" },
  mountain: { base: .52, amp: .18, top: "#716d63", side: "#45413d", fleck: "#999486" },
};
function tileH(q, r, terrain) {
  const cfg = TERR[terrain] || TERR.plain;
  const broad = fbm(q * .18 + 2.7, r * .18 - 1.3) - .5;
  const local = h2(q * 3.13 + 7, r * 2.71 - 4) - .5;
  return cfg.base + cfg.amp * (broad * 1.15 + local * .45);
}

function makeSharedMaterials() {
  if (sharedMats.wall) return;
  sharedMats.wall = new THREE.MeshStandardMaterial({ map: materialTex("plaster"), color: 0xd1b78a, roughness: .98 });
  sharedMats.wallEnemy = new THREE.MeshStandardMaterial({ map: materialTex("plaster"), color: 0xa9a08c, roughness: 1 });
  sharedMats.roof = new THREE.MeshStandardMaterial({ map: materialTex("tile"), color: 0x76695b, roughness: .9 });
  sharedMats.roofRed = new THREE.MeshStandardMaterial({ map: materialTex("tile"), color: 0x89584a, roughness: .9 });
  sharedMats.timber = new THREE.MeshStandardMaterial({ map: materialTex("wood"), color: 0x755a3e, roughness: .95 });
  sharedMats.stone = new THREE.MeshStandardMaterial({ map: materialTex("stone"), color: 0x8c887f, roughness: 1 });
  sharedMats.darkStone = new THREE.MeshStandardMaterial({ map: materialTex("stone"), color: 0x5d5b54, roughness: 1 });
  sharedMats.iron = new THREE.MeshStandardMaterial({ color: 0x343635, roughness: .62, metalness: .55 });
  sharedMats.railWood = new THREE.MeshStandardMaterial({ map: materialTex("wood"), color: 0x463628, roughness: 1 });
  sharedMats.snow = new THREE.MeshStandardMaterial({ color: 0xdde2df, roughness: .9, transparent: true, opacity: .88 });
  sharedMats.earth = new THREE.MeshStandardMaterial({ map: terrainTex("plain"), color: 0x826f4c, roughness: 1 });
  sharedMats.path = new THREE.MeshStandardMaterial({ map: terrainTex("plain"), color: 0xa28a5e, roughness: 1 });
  sharedMats.redCloth = new THREE.MeshStandardMaterial({ color: 0x9d2a21, roughness: .86, side: THREE.DoubleSide });
}

// 程序化羊皮纸纹理(四方连续: 每个斑点环绕绘制9份)
let _paperTex = null;
function paperTex() {
  if (_paperTex) return _paperTex;
  const N = 256, c = document.createElement("canvas"); c.width = c.height = N; const g = c.getContext("2d");
  g.fillStyle = "#d3c19a"; g.fillRect(0, 0, N, N);
  const wrap9 = fn => { for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) fn(dx, dy); };
  for (let i = 0; i < 30; i++) { // 大块晕染
    const x = Math.random() * N, y = Math.random() * N, r = 14 + Math.random() * 34, dark = Math.random() < .55;
    wrap9((dx, dy) => { const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r); gr.addColorStop(0, dark ? "rgba(140,112,66,0.10)" : "rgba(248,238,210,0.12)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2); });
  }
  for (let i = 0; i < 2600; i++) { // 纤维/杂点
    const x = Math.random() * N, y = Math.random() * N, v = Math.random() - .5, w = 1 + Math.random() * 3;
    g.fillStyle = v > 0 ? `rgba(255,250,228,${v * .2})` : `rgba(110,88,50,${-v * .18})`;
    wrap9((dx, dy) => g.fillRect(x + dx, y + dy, w, 1 + (Math.random() < .3 ? 1 : 0)));
  }
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.repeat.set(130, 130);
  _paperTex = tex; return tex;
}

function terrainTex(t) {
  if ((t === "plain" || t === "hills") && texCache.generated_loess) return texCache.generated_loess;
  if (texCache[t]) return texCache[t];
  const N = 512;
  const c = document.createElement("canvas"); c.width = c.height = N; const g = c.getContext("2d");
  g.fillStyle = TERR[t].top; g.fillRect(0, 0, N, N);
  const seed = { plain: 11, hills: 29, forest: 47, mountain: 73 }[t] || 5;
  const rnd = i => h2(seed + i * 1.37, seed * .71 - i * 2.19);
  // 大尺度土色晕染，决定远景层次；细颗粒只在近景出现。
  for (let i = 0; i < 180; i++) {
    const x = rnd(i) * N, y = rnd(i + 301) * N, r = 10 + rnd(i + 611) * 42;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, i % 2 ? "rgba(20,18,13,.085)" : "rgba(245,226,176,.075)");
    grad.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = grad; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 5600; i++) {
    const x = rnd(i + 971) * N, y = rnd(i + 7331) * N, a = .025 + rnd(i + 71) * .08;
    g.fillStyle = i & 1 ? `rgba(236,220,178,${a})` : `rgba(30,28,22,${a})`;
    const s = rnd(i + 133) > .92 ? 2 : 1; g.fillRect(x, y, s, s);
  }
  if (t === "plain" || t === "hills") {
    g.strokeStyle = t === "plain" ? "rgba(66,51,33,.15)" : "rgba(52,43,34,.2)"; g.lineWidth = 2;
    for (let i = 0; i < 34; i++) { const y = rnd(i + 200) * N; g.beginPath(); g.moveTo(-10, y); g.bezierCurveTo(N * .3, y + rnd(i + 5) * 14 - 7, N * .7, y - rnd(i + 9) * 14 + 7, N + 10, y + rnd(i + 17) * 10 - 5); g.stroke(); }
  } else if (t === "forest") {
    g.lineWidth = 1.2;
    for (let i = 0; i < 1200; i++) { const x = rnd(i + 12) * N, y = rnd(i + 512) * N, a = rnd(i + 911) * 6.28, l = 3 + rnd(i + 33) * 9; g.strokeStyle = i % 3 ? "rgba(27,35,24,.34)" : "rgba(118,120,76,.22)"; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  } else {
    g.lineWidth = 2;
    for (let i = 0; i < 110; i++) { const x = rnd(i + 88) * N, y = rnd(i + 921) * N, l = 8 + rnd(i + 48) * 34; g.strokeStyle = i % 3 ? "rgba(32,31,29,.22)" : "rgba(220,214,196,.17)"; g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y + l * (.14 + rnd(i + 812) * .18)); g.stroke(); }
  }
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  tex.repeat.set(1.8, 1.8);
  texCache[t] = tex; return tex;
}

function materialTex(kind) {
  const k = "mat_" + kind; if (texCache[k]) return texCache[k];
  const N = 256, c = document.createElement("canvas"); c.width = c.height = N; const g = c.getContext("2d");
  const base = { plaster: "#b9a47d", tile: "#615549", wood: "#65503a", stone: "#77736a" }[kind] || "#888";
  g.fillStyle = base; g.fillRect(0, 0, N, N);
  const rnd = i => h2(i * 1.91 + kind.length * 11, i * 3.17 - kind.length * 7);
  if (kind === "tile") {
    g.strokeStyle = "rgba(28,24,22,.36)"; g.lineWidth = 3;
    for (let y = -16, row = 0; y < N + 20; y += 22, row++) for (let x = (row & 1) ? -24 : -12; x < N + 24; x += 34) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 30, y); g.lineTo(x + 28, y + 18); g.lineTo(x + 2, y + 18); g.closePath(); g.stroke(); }
  } else if (kind === "wood") {
    for (let i = 0; i < 70; i++) { const y = rnd(i) * N; g.strokeStyle = i % 3 ? "rgba(32,22,15,.2)" : "rgba(230,205,154,.12)"; g.lineWidth = 1 + rnd(i + 80) * 2; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(70, y + 5, 180, y - 5, N, y + 2); g.stroke(); }
  } else if (kind === "stone") {
    for (let i = 0; i < 160; i++) { const x = rnd(i) * N, y = rnd(i + 201) * N, r = 3 + rnd(i + 401) * 12; g.fillStyle = i & 1 ? "rgba(25,24,22,.13)" : "rgba(235,228,206,.1)"; g.beginPath(); g.ellipse(x, y, r, r * .45, rnd(i + 8) * 3, 0, 7); g.fill(); }
  } else {
    for (let i = 0; i < 900; i++) { const x = rnd(i) * N, y = rnd(i + 1300) * N; g.fillStyle = i & 1 ? "rgba(48,38,25,.09)" : "rgba(250,236,202,.08)"; g.fillRect(x, y, 1 + rnd(i + 99) * 3, 1); }
    g.strokeStyle = "rgba(70,55,36,.13)"; for (let i = 0; i < 18; i++) { const x = rnd(i + 7) * N, y = rnd(i + 77) * N; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 8 + rnd(i + 6) * 22, y + 3 + rnd(i + 9) * 20); g.stroke(); }
  }
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.repeat.set(2, 2);
  texCache[k] = tex; return tex;
}

function loadSurfaceAssets() {
  if (surfaceLoadStarted) return; surfaceLoadStarted = true;
  new THREE.TextureLoader().load("./assets/3d/taihang-loess-ground.png", tex => {
    if (!renderer || !scene) { tex.dispose(); surfaceLoadStarted = false; return; }
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); tex.repeat.set(2.15, 2.15);
    texCache.generated_loess = tex;
    for (const t of ["plain", "hills"]) {
      if (matCache[t]) { matCache[t].forEach(m => m.dispose()); delete matCache[t]; }
      if (sketchCache[t]) { sketchCache[t].forEach(m => m.dispose()); delete sketchCache[t]; }
    }
    if (fieldMat) { fieldMat.map = tex; fieldMat.bumpMap = tex; fieldMat.needsUpdate = true; }
    for (const k of ["earth", "path"]) if (sharedMats[k]) { sharedMats[k].map = tex; sharedMats[k].needsUpdate = true; }
    for (const tt of Object.values(tiles)) if (tt.terrain === "plain" || tt.terrain === "hills") tt.mesh.material = tt.fogged ? sketchMats(tt.terrain) : tileMats(tt.terrain);
    csmSetupScene(); forceMatUpdate(); lastSig = "";
  }, undefined, () => { surfaceLoadStarted = false; });
}
function tileMats(t) {
  if (matCache[t]) return matCache[t];
  const map = terrainTex(t);
  const top = new THREE.MeshStandardMaterial({ map, color: t === "hills" ? 0x938671 : 0xffffff, bumpMap: map, bumpScale: t === "mountain" ? .055 : .028, roughness: .96, metalness: 0 });
  const side = new THREE.MeshStandardMaterial({ map: t === "mountain" ? materialTex("stone") : materialTex("plaster"), color: TERR[t].side, bumpMap: materialTex(t === "mountain" ? "stone" : "plaster"), bumpScale: .035, roughness: 1, metalness: 0 });
  matCache[t] = [side, top, side]; return matCache[t];
}

// ── 素描战雾(已探索但当前不可见): shader 注入世界空间交叉排线 + 纸色调; 不受光不投影, CSM 不接管 Basic 材质 ──
const sketchCache = {};
function sketchify(mat) {
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWp;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n{ vec4 _w=vec4(transformed,1.0);\n#ifdef USE_INSTANCING\n_w=instanceMatrix*_w;\n#endif\nvWp=(modelMatrix*_w).xyz; }");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWp;")
      .replace("#include <map_fragment>", "#include <map_fragment>\n{ float lum=dot(diffuseColor.rgb,vec3(0.299,0.587,0.114)); float sk=0.70+0.34*lum; float a1=abs(fract((vWp.x+vWp.z)*3.0)-0.5)*2.0; float a2=abs(fract((vWp.x-vWp.z)*3.0)-0.5)*2.0; if(lum<0.6&&a1<0.3) sk-=0.13; if(lum<0.38&&a2<0.3) sk-=0.11; diffuseColor.rgb=vec3(0.22,0.20,0.17)*sk; }");
  };
  mat.userData.sketch = true; return mat;
}
function sketchMats(t) {
  if (sketchCache[t]) return sketchCache[t];
  const top = sketchify(new THREE.MeshBasicMaterial({ map: terrainTex(t) }));
  const side = sketchify(new THREE.MeshBasicMaterial({ color: TERR[t].side }));
  sketchCache[t] = [side, top, side]; return sketchCache[t];
}

// ── 单位棋子贴图(复用彩色徽标) ──
const UGLYPH = { scout: "侦", work: "工", militia: "民", regular: "连", elite: "团", commando: "武", spy: "特", puppet: "伪", squad: "日", company: "中", armored: "装", bandit: "匪" };
function drawUnitIcon(g, type, x, y, s, color) {
  const cells = { scout:[0,1], work:[1,1], militia:[2,1], regular:[2,1], elite:[3,1], commando:[0,2], spy:[1,2], puppet:[2,1], squad:[2,1], company:[2,1] };
  if (iconAtlasImg && iconAtlasImg.complete && iconAtlasImg.naturalWidth && cells[type]) {
    const [cx, cy] = cells[type], sw = iconAtlasImg.naturalWidth / 4, sh = iconAtlasImg.naturalHeight / 3;
    g.drawImage(iconAtlasImg, cx * sw, cy * sh, sw, sh, x - s * .52, y - s * .52, s * 1.04, s * 1.04); return;
  }
  g.save(); g.translate(x, y); g.strokeStyle = color; g.fillStyle = color; g.lineWidth = Math.max(2, s * .09); g.lineCap = "round"; g.lineJoin = "round";
  if (type === "scout") { g.beginPath(); g.arc(0, 0, s * .34, 0, 7); g.stroke(); g.beginPath(); g.moveTo(-s*.1,s*.18); g.lineTo(s*.12,-s*.25); g.lineTo(s*.04,s*.04); g.closePath(); g.fill(); }
  else if (type === "work") { g.beginPath(); g.moveTo(-s*.18,-s*.3); g.lineTo(s*.16,s*.26); g.stroke(); g.beginPath(); g.moveTo(s*.08,s*.18); g.lineTo(s*.28,s*.15); g.lineTo(s*.23,s*.36); g.closePath(); g.fill(); }
  else if (type === "armored") { g.fillRect(-s*.32,-s*.02,s*.64,s*.24); g.fillRect(-s*.15,-s*.2,s*.3,s*.19); g.fillRect(s*.1,-s*.16,s*.32,s*.06); g.beginPath(); g.arc(-s*.2,s*.25,s*.09,0,7); g.arc(s*.2,s*.25,s*.09,0,7); g.fill(); }
  else if (type === "spy") { g.beginPath(); g.moveTo(-s*.38,0); g.quadraticCurveTo(0,-s*.34,s*.38,0); g.quadraticCurveTo(0,s*.34,-s*.38,0); g.stroke(); g.beginPath(); g.arc(0,0,s*.1,0,7); g.fill(); }
  else if (type === "commando") { g.beginPath(); g.moveTo(-s*.24,s*.3); g.lineTo(s*.19,-s*.28); g.lineTo(s*.1,s*.16); g.closePath(); g.fill(); g.strokeRect(-s*.28,s*.2,s*.22,s*.08); }
  else if (type === "squad" || type === "company") { g.beginPath(); g.arc(0,0,s*.16,0,7); g.fill(); for(let i=0;i<8;i++){ const a=i*Math.PI/4; g.beginPath(); g.moveTo(Math.cos(a)*s*.23,Math.sin(a)*s*.23); g.lineTo(Math.cos(a)*s*.38,Math.sin(a)*s*.38); g.stroke(); } }
  else { g.beginPath(); g.moveTo(-s*.28,s*.28); g.lineTo(s*.25,-s*.27); g.moveTo(-s*.24,-s*.3); g.lineTo(s*.3,s*.24); g.stroke(); if(type==="elite"){ g.beginPath(); for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,rr=i%2?s*.14:s*.32; const px=Math.cos(a)*rr,py=Math.sin(a)*rr; i?g.lineTo(px,py):g.moveTo(px,py);} g.closePath(); g.fill(); } }
  g.restore();
}
function unitTex(u) {
  const k = u.type; if (texCache["u_" + k]) return texCache["u_" + k];
  const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d");
  const isP = u.side === "p";
  const badge = isP ? (u.layer === "civ" ? "#2f6b6b" : u.type === "commando" ? "#4a3a6a" : "#8a2a1a") : (u.type === "puppet" ? "#5f5628" : u.type === "spy" ? "#463a52" : "#961f13");
  // 简笔人形
  g.fillStyle = "rgba(0,0,0,.28)"; g.beginPath(); g.ellipse(64, 116, 26, 8, 0, 0, 7); g.fill();
  g.strokeStyle = badge; g.lineWidth = 11; g.lineCap = "round";
  g.beginPath(); g.moveTo(64, 88); g.lineTo(52, 112); g.moveTo(64, 88); g.lineTo(76, 112); g.stroke();
  g.fillStyle = badge; g.beginPath(); g.moveTo(48, 88); g.lineTo(52, 56); g.lineTo(76, 56); g.lineTo(80, 88); g.closePath(); g.fill();
  g.fillStyle = "#d8b088"; g.beginPath(); g.arc(64, 46, 15, 0, 7); g.fill();
  if (!isP) { g.fillStyle = "#454b36"; g.beginPath(); g.arc(64, 42, 18, Math.PI, 0); g.fill(); }
  else { g.fillStyle = badge; g.fillRect(48, 30, 32, 10); g.fillStyle = "#e2382a"; g.beginPath(); g.arc(64, 34, 4, 0, 7); g.fill(); }
  // (徽标改为独立的头顶大横幅 sprite, 见 unitBannerTex)
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; texCache["u_" + k] = tex; return tex;
}
// Civ6式头顶大横幅: 阵营色底+大徽标字+姿态icon+血条 (缓存键含姿态与血量档)
function unitBannerTex(u) {
  const posture = u.fortified ? "守" : u.resting ? "休" : (u.autoPath && u.autoPath.length ? "行" : "");
  const hpB = Math.ceil(Math.max(0, u.hp) / 10);
  const k = "ub_" + u.type + "_" + (posture ? posture : "-") + hpB + (u.side === "p" && u.mp > 0 ? "a" : "");
  if (texCache[k]) return texCache[k];
  const c = document.createElement("canvas"); c.width = 256; c.height = 104; const g = c.getContext("2d");
  const isP = u.side === "p";
  const badge = isP ? (u.layer === "civ" ? "#2f6b6b" : u.type === "commando" ? "#4a3a6a" : "#8a2a1a") : (u.type === "puppet" ? "#5f5628" : u.type === "spy" ? "#463a52" : "#961f13");
  const w = posture ? 196 : 170, x0 = 128 - w / 2;
  const grad = g.createLinearGradient(0, 8, 0, 92); grad.addColorStop(0, badge); grad.addColorStop(1, "#241f1a");
  g.fillStyle = "rgba(12,12,10,.32)"; roundRect(g, x0 + 4, 12, w, 82, 20); g.fill();
  g.fillStyle = grad; roundRect(g, x0, 8, w, 82, 20); g.fill();
  g.strokeStyle = isP ? "rgba(224,199,143,.94)" : "rgba(202,150,112,.9)"; g.lineWidth = 4; g.stroke();
  g.fillStyle = "rgba(12,13,12,.42)"; g.beginPath(); g.arc(x0 + 40, 47, 29, 0, 7); g.fill();
  drawUnitIcon(g, u.type, x0 + 40, 47, 52, "#f2e4c6");
  g.fillStyle = "#f8eed8"; g.font = "800 43px 'Noto Sans SC',sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(UGLYPH[u.type] || "兵", x0 + 93, u.hp < 100 ? 40 : 48);
  if (posture) { g.fillStyle = "#d7bd7d"; g.font = "700 26px 'Noto Sans SC',sans-serif"; g.fillText(posture, x0 + 145, 48); }
  if (u.hp < 100) { // 血条嵌底边
    const hw = w * 0.8;
    g.fillStyle = "rgba(18,14,8,.9)"; g.fillRect(128 - hw / 2, 76, hw, 9);
    g.fillStyle = u.hp > 55 ? "#9fbc52" : u.hp > 25 ? "#d8a441" : "#e2564d";
    g.fillRect(128 - hw / 2, 76, hw * u.hp / 100, 9);
  }
  if (isP && u.mp > 0) { g.fillStyle = "#9fbc52"; g.strokeStyle = "rgba(18,14,8,.9)"; g.lineWidth = 3; g.beginPath(); g.arc(x0 + w, 12, 11, 0, 7); g.fill(); g.stroke(); } // 可行动绿点
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; texCache[k] = tex; return tex;
}
// Civ6式城市横幅(总部/根据地村庄): 民心圆+名字+建造/建筑
function cityBannerTex(v) {
  const name = (v.hq ? "★" : "") + v.name.replace("(总部)", "");
  const tR = v.build ? "🔨" + v.build.left : (v.buildings && v.buildings.length ? "🏠" + v.buildings.length : "");
  const k = "vb_" + name + "_" + Math.round(v.heart) + "_" + tR;
  if (texCache[k]) return texCache[k];
  const c = document.createElement("canvas"); c.width = 512; c.height = 96; const g = c.getContext("2d");
  g.font = "700 44px 'Noto Sans SC',sans-serif";
  const w = Math.min(500, 96 + g.measureText(name).width + (tR ? 96 : 24)), x0 = 256 - w / 2, h = 76, y0 = 10;
  g.fillStyle = v.hq ? "rgba(112,26,16,.96)" : "rgba(84,26,16,.94)";
  roundRect(g, x0, y0, w, h, 36); g.fill();
  g.strokeStyle = v.hq ? "#e8c05a" : "rgba(240,220,180,.55)"; g.lineWidth = v.hq ? 5 : 3; g.stroke();
  const cxL = x0 + 44, cy = y0 + h / 2;
  g.fillStyle = "#22190f"; g.beginPath(); g.arc(cxL, cy, 28, 0, 7); g.fill();
  g.strokeStyle = v.heart >= 70 ? "#9fbc52" : v.heart >= 40 ? "#d8a441" : "#b8563a";
  g.lineWidth = 5; g.beginPath(); g.arc(cxL, cy, 28, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * v.heart / 100); g.stroke();
  g.fillStyle = "#f0e4c0"; g.font = "800 30px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(Math.round(v.heart), cxL, cy + 1);
  g.fillStyle = "#f8eed8"; g.font = "700 44px 'Noto Sans SC',sans-serif"; g.textAlign = "left";
  g.fillText(name, cxL + 42, cy + 2);
  if (tR) { g.font = "700 34px sans-serif"; g.fillText(tR, x0 + w - 88, cy + 2); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; texCache[k] = tex; return tex;
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

function makeRoofGeometry() {
  // 单位尺寸的人字坡屋顶：x 为檐宽、z 为进深、屋脊沿 z 方向。
  const p = new Float32Array([
    -.5,0,-.5,  .5,0,-.5,  0,.5,-.5,
    -.5,0,.5,   .5,0,.5,   0,.5,.5,
  ]);
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(p, 3));
  geo.setIndex([0,1,2, 3,5,4, 0,3,4, 0,4,1, 2,1,4, 2,4,5, 0,2,5, 0,5,3]);
  geo.computeVertexNormals(); return geo;
}

function loadIconAtlas() {
  if (iconAtlasImg) return;
  iconAtlasImg = new Image();
  iconAtlasImg.onload = () => {
    for (const k of Object.keys(texCache)) if (k.startsWith("ub_")) { texCache[k].dispose && texCache[k].dispose(); delete texCache[k]; }
    lastSig = "";
  };
  iconAtlasImg.onerror = () => { iconAtlasImg = null; };
  iconAtlasImg.src = "./assets/3d/taihang-ui-icons.png";
}

// ── 初始化 ──
function init(container) {
  if (inited) return true;
  host = container;
  loadIconAtlas();
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  } catch (e) { console.error("WebGL 初始化失败", e); return false; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(host.clientWidth || innerWidth, host.clientHeight || innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.82;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x8c979d, 1);
  host.appendChild(renderer.domElement);
  loadSurfaceAssets();

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xaeb8b8, 25, 92);
  const W = G().CFG.mapW, H = G().CFG.mapH;
  const [bx, bz] = hexWorld(W / 2, H / 2); cx0 = bx; cz0 = bz; // 板心

  // 天空: 自定义梯度大气 shader(方向+太阳散射近似, toneMapped=false 避免曝光烧白)
  // 之前用 THREE.Sky(Preetham) 在高俯视角看向地平线下方会外推成纯白, 改用可控梯度天空
  const skyMat = new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: skyU, side: THREE.BackSide, depthWrite: false });
  skyMat.toneMapped = false;
  sky = new THREE.Mesh(new THREE.SphereGeometry(1600, 32, 16), skyMat); sky.renderOrder = -1; sky.frustumCulled = false; scene.add(sky);
  const sunPos = new THREE.Vector3(); sunPos.setFromSphericalCoords(1, DEG(90 - _sunElev), DEG(_sunAzi));

  // 光照
  sunLight = new THREE.DirectionalLight(0xffead0, 2.65);
  sunLight.position.copy(sunPos).multiplyScalar(80); sunLight.target.position.set(cx0, 0, cz0);
  sunLight.castShadow = true; sunLight.shadow.mapSize.set(2048, 2048);
  // 兜底单阴影: 收紧范围(±18)让 2k 精度不被浪费, 每帧跟随镜头; CSM 启用时此阴影关闭
  const sc = sunLight.shadow.camera; sc.near = 1; sc.far = 90; sc.left = -18; sc.right = 18; sc.top = 18; sc.bottom = -18; sc.updateProjectionMatrix();
  sunLight.shadow.bias = -0.0005;
  scene.add(sunLight, sunLight.target);
  hemiLight = new THREE.HemisphereLight(0xc9d7df, 0x493c2b, 0.82); scene.add(hemiLight);
  ambientLight = new THREE.AmbientLight(0x596168, 0.28); scene.add(ambientLight);

  // 羊皮纸桌面(Civ6风格): 地图外围与未探索区域露出纸面, 不再是天空的地平线下暗色
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ map: paperTex(), color: 0x94876c, roughness: 1, metalness: 0 }));
  paper.rotation.x = -Math.PI / 2; paper.position.set(cx0, -0.02, cz0); paper.receiveShadow = true; scene.add(paper);

  // 共享几何(thetaStart=π/2 → 顶点落在 ±x, 平顶六边形, 与 hexWorld 的 1.5R 列距对齐)
  prismGeo = new THREE.CylinderGeometry(R, R, 1, 6, 1, false, Math.PI / 2); // 半径=R → 相邻六边形贴合无缝
  coneGeo = new THREE.ConeGeometry(R * 0.64, 1, 7, 2, false, Math.PI / 2);
  cragGeo = new THREE.DodecahedronGeometry(.46, 0);
  ridgeGeo = new THREE.ConeGeometry(.44, 1, 6, 1, false, Math.PI / 2);
  treeTrunkGeo = new THREE.CylinderGeometry(0.035, 0.065, 0.34, 6);
  treeLeafGeo = new THREE.ConeGeometry(0.24, 0.46, 7);
  treeLeafTopGeo = new THREE.ConeGeometry(0.17, 0.36, 7);
  hexFlatGeo = new THREE.CircleGeometry(R * 0.9, 6, Math.PI / 2); hexFlatGeo.rotateX(-Math.PI / 2);
  roofGeo = makeRoofGeometry();
  makeSharedMaterials();

  gTiles = new THREE.Group(); gTerrain = new THREE.Group(); gTrees = new THREE.Group(); gUnits = new THREE.Group(); gStruct = new THREE.Group(); gOverlay = new THREE.Group();
  scene.add(gTiles, gTerrain, gTrees, gUnits, gStruct, gOverlay);

  buildTiles();
  buildBoundary();
  // 首帧: 已探明格不做展开动画(避免整片抖动), 只有之后新揭开的才动画
  const s0 = G().state();
  for (let q = 0; q < W; q++) for (let r = 0; r < H; r++) if (s0.tiles[q][r].disc) tileVisPrev.add(q + "," + r);

  // 相机 + 控制
  camera = new THREE.PerspectiveCamera(42, host.clientWidth / host.clientHeight, 0.25, 3000);
  const hq = G().state().hq; const [hx, hz] = hexWorld(hq.q, hq.r);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(hx, 0, hz);
  camera.position.set(hx + 2.7, 18, hz + 12.5); // 首屏拉近到可辨认人物/屋瓦，同时保留约三环探索范围
  // 文明6式相机: 固定俯角(高俯视), 只允许平移+滚轮缩放, 不允许旋转/改变角度
  controls.enableRotate = false;
  controls.minPolarAngle = controls.maxPolarAngle = camPolar;
  controls.minDistance = 8; controls.maxDistance = 85;
  controls.enableDamping = true; controls.dampingFactor = 0.1; controls.screenSpacePanning = false;
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  controls.update();

  // 点击拾取
  setupPicking();
  ro = new ResizeObserver(onResize); ro.observe(host);
  window.addEventListener("resize", onResize);

  inited = true; lastSig = "";
  syncDynamic();
  if (csmCfg.enabled) buildCSM();     // 2级 CSM 阴影(默认开启; 可在 Debug 关)
  else { sunLight.visible = true; sunLight.castShadow = true; }
  setTOD(_tod);                       // 按当前昼夜时刻初始化太阳与天空色
  if (!atmoOn) applyAtmo(false);      // 若上次关了大气, 恢复 CubeMap
  loop();
  return true;
}

let peakMat, hillMat, snowMat, peakMatS, snowMatS, fieldMat, fieldMatS;
function winterNow() {
  const cfg = G().CFG, span = cfg.winterMonths || [11, 2];
  const m = Math.floor((G().state().turn - 1) / cfg.turnsPerMonth) % 12 + 1;
  return span[0] <= span[1] ? m >= span[0] && m <= span[1] : m >= span[0] || m <= span[1];
}
function addTerrainDecor(mesh, q, r, kind, fogMat, winterOnly) {
  mesh.userData = { q, r, decor: kind, baseMat: mesh.material, fogMat: fogMat || peakMatS, winterOnly: !!winterOnly };
  gTerrain.add(mesh); return mesh;
}
function buildTiles() {
  const s = G().state(), W = G().CFG.mapW, H = G().CFG.mapH;
  peakMat = new THREE.MeshStandardMaterial({ map: materialTex("stone"), color: 0x9b978e, bumpMap: materialTex("stone"), bumpScale: .08, roughness: .98 });
  hillMat = new THREE.MeshStandardMaterial({ map: materialTex("stone"), color: 0x887a65, bumpMap: materialTex("stone"), bumpScale: .045, roughness: 1 });
  snowMat = sharedMats.snow;
  fieldMat = new THREE.MeshStandardMaterial({ map: terrainTex("plain"), color: 0x5b4932, roughness: 1 });
  peakMatS = sketchify(new THREE.MeshBasicMaterial({ map: materialTex("stone"), color: 0x8c877b }));
  snowMatS = sketchify(new THREE.MeshBasicMaterial({ color: 0xb8b8ad, transparent: true, opacity: .72 }));
  fieldMatS = sketchify(new THREE.MeshBasicMaterial({ color: 0x72634e }));
  for (let q = 0; q < W; q++) for (let r = 0; r < H; r++) {
    const t = s.tiles[q][r], [x, z] = hexWorld(q, r);
    const h = Math.max(0.14, tileH(q, r, t.terrain));
    const m = new THREE.Mesh(prismGeo, tileMats(t.terrain));
    m.scale.set(1, h, 1); m.position.set(x, h / 2, z);
    m.receiveShadow = true; m.castShadow = true; m.userData = { q, r, h };
    gTiles.add(m); tiles[q + "," + r] = { mesh: m, h, terrain: t.terrain };
    if (t.terrain === "mountain") {
      // 一格不是一根锥体：主峰 + 两块错位岩脊，形成太行层叠山势。
      const ph = .82 + .68 * h2(q * 5.3, r * 2.1), rot = h2(q + 12, r - 9) * Math.PI;
      const peak = new THREE.Mesh(cragGeo, peakMat); peak.scale.set(.92, ph * 1.2, .70); peak.rotation.y = rot; peak.rotation.z = (h2(q + 31, r) - .5) * .12; peak.position.set(x - .06, h + ph * .52, z + .03); peak.castShadow = peak.receiveShadow = true; addTerrainDecor(peak, q, r, "peak", peakMatS);
      for (let i = 0; i < 2; i++) {
        const a = rot + (i ? 2.2 : -1.6), sc = .42 + h2(q * 9 + i, r * 4) * .26;
        const crag = new THREE.Mesh(i ? cragGeo : ridgeGeo, i ? peakMat : hillMat);
        crag.scale.set(sc * 1.25, sc * (i ? 1.5 : 1.15), sc * .72); crag.rotation.y = a;
        crag.position.set(x + Math.cos(a) * .38, h + sc * .43, z + Math.sin(a) * .38); crag.castShadow = crag.receiveShadow = true;
        addTerrainDecor(crag, q, r, "crag", peakMatS);
      }
      const cap = new THREE.Mesh(cragGeo, snowMat); cap.scale.set(.39, ph * .22, .31); cap.rotation.y = rot; cap.rotation.z = peak.rotation.z; cap.position.set(x - .08, h + ph * 1.04, z + .02); cap.castShadow = true; addTerrainDecor(cap, q, r, "snow", snowMatS);
    } else if (t.terrain === "hills" && h2(q * 4.7, r * 6.1) > .28) {
      const a = h2(q - 2, r + 6) * Math.PI, rh = .16 + h2(q * 2, r * 8) * .18;
      const ridge = new THREE.Mesh(ridgeGeo, hillMat); ridge.scale.set(.82, rh, .34); ridge.rotation.y = a; ridge.position.set(x + .08, h + rh / 2 - .01, z - .05); ridge.castShadow = ridge.receiveShadow = true; addTerrainDecor(ridge, q, r, "ridge", peakMatS);
    }
    // 稀疏裸岩与农田垄让平原/丘陵在远景也有尺度参照。
    if ((t.terrain === "plain" || t.terrain === "hills") && !t.village && !t.rail && h2(q * 7.1, r * 4.3) > .72) {
      const ang = (h2(q, r + 22) - .5) * .7;
      for (let i = -2; i <= 2; i++) { const row = new THREE.Mesh(new THREE.BoxGeometry(.76, .025, .035), fieldMat); row.rotation.y = ang; row.position.set(x + Math.sin(ang) * i * .12, h + .025, z + Math.cos(ang) * i * .12); row.receiveShadow = true; addTerrainDecor(row, q, r, "field", fieldMatS); }
    } else if (t.terrain !== "plain" && h2(q * 8.2 + 1, r * 3.6) > .78) {
      const rock = new THREE.Mesh(cragGeo, hillMat); const rs = .08 + h2(q + 4, r - 3) * .11; rock.scale.set(rs * 1.4, rs, rs); rock.position.set(x + (h2(q, r) - .5) * .8, h + rs * .42, z + (h2(q + 1, r) - .5) * .8); rock.rotation.y = h2(q + 8, r) * 5; rock.castShadow = true; addTerrainDecor(rock, q, r, "rock", peakMatS);
    }
    if (t.terrain !== "mountain" && h2(q * 11.1, r * 9.7) > .58) {
      const frost = new THREE.Mesh(cragGeo, snowMat); const fs = .12 + h2(q + 40, r) * .14; frost.scale.set(fs * 2.5, .012, fs * 1.2); frost.position.set(x + (h2(q + 3, r) - .5) * .82, h + .026, z + (h2(q, r + 2) - .5) * .78); frost.rotation.y = h2(q * 4, r * 3) * 6.28; addTerrainDecor(frost, q, r, "frost", snowMatS, true);
    }
  }
}

function buildBoundary() {
  const W = G().CFG.mapW, H = G().CFG.mapH, R3 = SQ3 * R, pts = [];
  const has = (px, pz) => { for (let q = 0; q < W; q++) for (let r = 0; r < H; r++) { const [ex, ez] = hexWorld(q, r); if ((ex - px) ** 2 + (ez - pz) ** 2 < (R * 0.5) ** 2) return true; } return false; };
  for (let q = 0; q < W; q++) for (let r = 0; r < H; r++) {
    if (q !== 0 && q !== W - 1 && r !== 0 && r !== H - 1) continue;
    const [x, z] = hexWorld(q, r);
    for (let i = 0; i < 6; i++) {
      const am = Math.PI / 3 * (i + 0.5), nx = x + R3 * Math.cos(am), nz = z + R3 * Math.sin(am);
      if (has(nx, nz)) continue; // 朝图外的边→边界
      const a0 = Math.PI / 3 * i, a1 = Math.PI / 3 * ((i + 1) % 6);
      const y = topY(q, r) + .055;
      pts.push(new THREE.Vector3(x + R * Math.cos(a0), y, z + R * Math.sin(a0)));
      pts.push(new THREE.Vector3(x + R * Math.cos(a1), y, z + R * Math.sin(a1)));
    }
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xa98a50, transparent: true, opacity: .72 }));
  line.renderOrder = 2; gTiles.add(line);
}
function focus(q, r) {
  if (!inited) return;
  const [x, z] = hexWorld(q, r), ty = topY(q, r);
  const dx = camera.position.x - controls.target.x, dy = camera.position.y - controls.target.y, dz = camera.position.z - controls.target.z;
  controls.target.set(x, ty, z); camera.position.set(x + dx, ty + dy, z + dz); controls.update();
}
// 目标格顶投影到屏幕像素坐标(供确认框定位)
function project(q, r) {
  if (!inited) return null;
  const [x, z] = hexWorld(q, r), v = new THREE.Vector3(x, topY(q, r) + 0.6, z);
  v.project(camera);
  const rect = renderer.domElement.getBoundingClientRect();
  return { x: rect.left + (v.x * 0.5 + 0.5) * rect.width, y: rect.top + (-v.y * 0.5 + 0.5) * rect.height };
}

// ── 级联阴影 CSM ──
function sunDirVec() { const p = new THREE.Vector3(); p.setFromSphericalCoords(1, DEG(90 - _sunElev), DEG(_sunAzi)); return p.normalize().multiplyScalar(-1); }
function csmSetupScene() { if (!csm || !scene) return; scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.isMeshStandardMaterial && !m.userData._csm) { try { csm.setupMaterial(m); m.userData._csm = true; } catch (e) {} } }); }); }
function disposeCSM() { if (csm) { try { csm.dispose(); } catch (e) {} csm = null; } if (scene) scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.userData._csm = false; }); }); }
function buildCSM() {
  try {
    disposeCSM();
    csm = new CSM({ maxFar: csmCfg.maxFar, cascades: csmCfg.cascades, mode: "practical", parent: scene, shadowMapSize: csmCfg.size, camera, lightDirection: sunDirVec(), lightColor: sunLight.color.clone(), lightIntensity: 3.0 / csmCfg.cascades, shadowBias: -0.0004 });
    csm.fade = csmCfg.fade;
    if (sunLight) { sunLight.castShadow = false; sunLight.visible = false; } // CSM 接管方向光+阴影
    csmSetupScene();
    forceMatUpdate();  // 关键: cascades/size 改变后强制重编译 shader, 否则 CSM_CASCADES define 与 uniform 数组不匹配→地块消失
  } catch (e) { console.error("CSM 初始化失败, 回退单阴影", e); csm = null; if (sunLight) { sunLight.visible = true; sunLight.castShadow = true; } }
}

// ── 昼夜(TOD 0-24h): 驱动太阳方向/颜色 + 天空梯度色 + 各灯强度 ──
function setTOD(h) {
  _tod = ((h % 24) + 24) % 24;
  const elev = 70 * Math.sin((_tod - 6) / 12 * Math.PI);   // 6h地平线 12h最高(70°) 18h落下, 夜里为负
  _sunElev = elev; _sunAzi = (_tod / 24) * 360 + 90;        // 太阳东升西落
  const dir = new THREE.Vector3().setFromSphericalCoords(1, DEG(90 - elev), DEG(_sunAzi));
  skyU.uSunDir.value.copy(dir);
  const day = Math.max(0.05, Math.min(1, (elev + 6) / 12));  // 太阳<-6°=夜, >+6°=全昼, 之间过渡
  const low = Math.max(0, 1 - Math.abs(elev) / 16) * (elev > -6 ? 1 : 0); // 落日/日出橙红程度
  skyU.uDay.value = day; // 天顶色不动(留给 Debug 自定义); TOD 只驱动地平线/太阳暖色
  skyU.uHorizon.value.set(0xacc6da).lerp(new THREE.Color(0xe8925a), low);
  skyU.uSunCol.value.set(0xfff0d0).lerp(new THREE.Color(0xffa050), low);
  if (!sunLight) return;
  // 光照方向: 太阳落到地平线下后不能从地底往上照, 把照明仰角钳制在 ≥8°(视觉太阳照常落下, 夜里主要靠环境光)
  const ldir = dir.clone(); if (ldir.y < 0.14) { ldir.y = 0.14; ldir.normalize(); }
  sunLight.position.copy(ldir).multiplyScalar(80);
  sunLight.color.set(0xfff2da).lerp(new THREE.Color(0xffa860), low);
  sunLight.intensity = 0.35 + 3.0 * day;
  if (hemiLight) hemiLight.intensity = 0.2 + 0.75 * day;
  if (ambientLight) ambientLight.intensity = 0.18 + 0.22 * day;
  if (csm) { csm.lightDirection.copy(ldir.clone().negate().normalize()); csm.lightIntensity = sunLight.intensity / csmCfg.cascades; csm.lights.forEach(l => { l.intensity = csm.lightIntensity; l.color.copy(sunLight.color); }); }
  if (!atmoOn && cubeTex) { cubeTex.dispose(); cubeTex = makeSkyCube(); scene.background = cubeTex; } // 关大气时随 TOD 刷新 CubeMap
}
// ── 程序化天空 CubeMap(6面, 方向一致→无缝; 关大气时作静态天空盒) ──
function makeSkyCube() {
  const S = 128, faces = [];
  const B = [ // 每面 [right, up, forward]
    [[0, 0, -1], [0, -1, 0], [1, 0, 0]], [[0, 0, 1], [0, -1, 0], [-1, 0, 0]],
    [[1, 0, 0], [0, 0, 1], [0, 1, 0]], [[1, 0, 0], [0, 0, -1], [0, -1, 0]],
    [[1, 0, 0], [0, -1, 0], [0, 0, 1]], [[-1, 0, 0], [0, -1, 0], [0, 0, -1]],
  ];
  for (let f = 0; f < 6; f++) {
    const c = document.createElement("canvas"); c.width = c.height = S; const g = c.getContext("2d");
    const img = g.createImageData(S, S), d = img.data, [rt, up, fw] = B[f];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = (x + .5) / S * 2 - 1, v = (y + .5) / S * 2 - 1;
      let dx = fw[0] + u * rt[0] + v * up[0], dy = fw[1] + u * rt[1] + v * up[1], dz = fw[2] + u * rt[2] + v * up[2];
      const L = Math.hypot(dx, dy, dz); const col = skyColorJS(dx / L, dy / L, dz / L), i = (y * S + x) * 4;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0); faces.push(c);
  }
  const tex = new THREE.CubeTexture(faces); tex.needsUpdate = true; tex.colorSpace = THREE.SRGBColorSpace; return tex;
}
function applyAtmo(on) {
  atmoOn = on; if (!scene) return;
  if (on) { if (sky) sky.visible = true; scene.background = null; }
  else { if (sky) sky.visible = false; if (cubeTex) cubeTex.dispose(); cubeTex = makeSkyCube(); scene.background = cubeTex; }
}

// ── Debug: 环境/画质调参 API ──
const TONE = { none: THREE.NoToneMapping, linear: THREE.LinearToneMapping, reinhard: THREE.ReinhardToneMapping, cineon: THREE.CineonToneMapping, aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping };
function forceMatUpdate() { if (scene) scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.needsUpdate = true); }); }
function ensureComposer() {
  if (composer || !renderer) return;
  try {
    composer = new EffectComposer(renderer);
    taaPass = new TAARenderPass(scene, camera); taaPass.unbiased = false; taaPass.sampleLevel = 2;
    composer.addPass(taaPass); composer.addPass(new OutputPass()); onResize();
  } catch (e) { console.error("TAA 初始化失败", e); composer = null; taaEnabled = false; }
}
const dbg = {
  setTOD(h) { setTOD(h); },                 // 昼夜时刻 0-24h
  setAtmo(on) { applyAtmo(on); },           // 大气开/关(关→程序化 CubeMap)
  setSky(o) { if (!sky) return; if (o.zenith) skyU.uZenith.value.set(o.zenith); if (o.horizon) skyU.uHorizon.value.set(o.horizon); if (o.night) skyU.uNight.value.set(o.night); if (o.elevation != null || o.azimuth != null) { if (o.elevation != null) _sunElev = o.elevation; if (o.azimuth != null) _sunAzi = o.azimuth; const p = new THREE.Vector3().setFromSphericalCoords(1, DEG(90 - _sunElev), DEG(_sunAzi)); skyU.uSunDir.value.copy(p); if (sunLight) sunLight.position.copy(p).multiplyScalar(80); if (csm) csm.lightDirection.copy(sunDirVec()); } },
  setSun(o) { if (!sunLight) return; if (o.color) sunLight.color.set(o.color); if (o.intensity != null) sunLight.intensity = o.intensity; if (csm) { if (o.intensity != null) { csm.lightIntensity = o.intensity / csmCfg.cascades; csm.lights.forEach(l => l.intensity = csm.lightIntensity); } if (o.color) csm.lights.forEach(l => l.color.set(o.color)); } },
  setHemi(o) { if (!hemiLight) return; if (o.sky) hemiLight.color.set(o.sky); if (o.ground) hemiLight.groundColor.set(o.ground); if (o.intensity != null) hemiLight.intensity = o.intensity; },
  setAmbient(o) { if (!ambientLight) return; if (o.color) ambientLight.color.set(o.color); if (o.intensity != null) ambientLight.intensity = o.intensity; },
  setFog(o) { if (!scene) return; if (o.enabled === false) { scene.fog = null; return; } if (!scene.fog) scene.fog = new THREE.Fog(0xbcc6d0, 18, 85); if (o.color) scene.fog.color.set(o.color); if (o.near != null) scene.fog.near = o.near; if (o.far != null) scene.fog.far = o.far; },
  setShadow(size) { if (csmCfg.size === size) return; csmCfg.size = size; if (csm) { reinit(); return; } if (!sunLight) return; if (sunLight.shadow.map) sunLight.shadow.map.dispose(); sunLight.shadow.map = null; sunLight.shadow.mapSize.set(size, size); },
  setCSM(o) {
    let structural = false;
    if (o.cascades != null && o.cascades !== csmCfg.cascades) { csmCfg.cascades = o.cascades; structural = true; }
    if (o.size != null && o.size !== csmCfg.size) { csmCfg.size = o.size; structural = true; }
    if (o.enabled != null && o.enabled !== csmCfg.enabled) { csmCfg.enabled = o.enabled; structural = true; }
    // maxFar/fade 可原地更新, 不必重建
    if (o.maxFar != null) { csmCfg.maxFar = o.maxFar; if (csm) { csm.maxFar = o.maxFar; csm.updateFrustums(); } }
    if (o.fade != null) { csmCfg.fade = o.fade; if (csm) { csm.fade = o.fade; csm.updateFrustums(); } }
    if (structural) reinit();   // 走整机重建, 从根上避开 CSM 补丁重叠导致的崩溃/消失
  },
  setTone(mode, exposure) { if (!renderer) return; if (mode && TONE[mode] !== undefined) { renderer.toneMapping = TONE[mode]; forceMatUpdate(); } if (exposure != null) renderer.toneMappingExposure = exposure; },
  setTAA(on) { taaEnabled = !!on; if (on) ensureComposer(); },
  setCamera(o) {
    if (!controls) return;
    if (o.polar != null) { camPolar = o.polar; controls.minPolarAngle = controls.maxPolarAngle = camPolar; }
    if (o.fov != null) { camera.fov = o.fov; camera.updateProjectionMatrix(); }
    if (o.minDist != null) controls.minDistance = o.minDist;
    if (o.maxDist != null) controls.maxDistance = o.maxDist;
    controls.update();
  },
};

// ── 动态同步(信号量变化时重建 树/单位/建筑/高亮 + 迷雾可见性) ──
function signature() {
  const s = G().state(); let u = ""; for (const un of s.units) u += un.id + un.q + "," + un.r + "|" + Math.round(un.hp) + "," + un.mp + (un.fortified ? "F" : "") + (un.resting ? "R" : "") + (un.autoPath ? "~" + un.autoPath.length : "") + ";";
  let d = 0; const W = G().CFG.mapW, H = G().CFG.mapH, vis = G().visSet();
  for (let q = 0; q < W; q++) for (let r = 0; r < H; r++) { if (s.tiles[q][r].disc) d++; }
  const sel = G().sel(), pend = G().pending(), reach = G().reach();
  let st = ""; for (let q = 0; q < W; q++) for (let r = 0; r < H; r++) { const t = s.tiles[q][r]; if (t.village) st += q + "" + r + (t.village.owner) + (t.village.buildings ? t.village.buildings.length : 0) + Math.round(t.village.heart) + (t.village.build ? "b" + t.village.build.left : ""); if (t.sh) st += "s" + q + r + Math.round(t.sh.hp); if (t.mine) st += "m" + q + r; }
  const mm = G().moveMode && G().moveMode() ? 1 : 0, mh = G().moveHover && G().moveHover();
  return s.turn + "#" + d + "#" + (vis ? vis.size : 0) + "#" + u + "#" + (sel ? sel.kind + (sel.id || sel.q + "," + sel.r) : "-") + "#" + (pend ? pend.type + pend.q + "," + pend.r : "-") + "#" + mm + (mh ? mh.q + "," + mh.r : "-") + "#" + (reach ? reach.size : 0) + "#" + st;
}
function clearGroup(g) {
  const shared = new Set([prismGeo, coneGeo, cragGeo, ridgeGeo, hexFlatGeo, treeTrunkGeo, treeLeafGeo, treeLeafTopGeo, roofGeo]);
  const sharedMaterials = new Set([peakMat, hillMat, snowMat, peakMatS, snowMatS, fieldMat, fieldMatS]);
  for (const v of Object.values(sharedMats)) {
    if (v && v.isMaterial) sharedMaterials.add(v);
    else if (v && typeof v === "object") for (const m of Object.values(v)) if (m && m.isMaterial) sharedMaterials.add(m);
  }
  for (let i = g.children.length - 1; i >= 0; i--) {
    const c = g.children[i]; g.remove(c);
    const transientMats = new Set();
    c.traverse && c.traverse(o => {
      if (o.geometry && !shared.has(o.geometry)) o.geometry.dispose && o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (!sharedMaterials.has(m)) transientMats.add(m); });
    });
    transientMats.forEach(m => m.dispose && m.dispose());
  }
}

function syncDynamic() {
  const s = G().state(), W = G().CFG.mapW, H = G().CFG.mapH, key = G().key;
  const visSet = G().visSet();
  // 迷雾三态: 未探明=隐藏(露出羊皮纸) / 已探明不可见=素描 / 可见=正常; 新揭开的登记展开动画
  for (let q = 0; q < W; q++) for (let r = 0; r < H; r++) {
    const k = q + "," + r, tt = tiles[k]; if (!tt) continue;
    const disc = s.tiles[q][r].disc; tt.mesh.visible = disc;
    const fogged = disc && !visSet.has(k);
    if (fogged !== !!tt.fogged) { tt.fogged = fogged; tt.mesh.material = fogged ? sketchMats(tt.terrain) : tileMats(tt.terrain); tt.mesh.castShadow = tt.mesh.receiveShadow = !fogged; }
    if (disc && !tileVisPrev.has(k)) { tileVisPrev.add(k); revealAnims[k] = clock; tt.mesh.scale.y = 0.001; tt.mesh.position.y = 0.0005; }
  }
  const winter = winterNow();
  gTerrain.children.forEach(m => {
    if (!m.userData || !m.userData.decor) return;
    const td = s.tiles[m.userData.q][m.userData.r]; m.visible = td.disc;
    if (m.userData.winterOnly) m.visible = m.visible && winter;
    const fog = td.disc && !visSet.has(m.userData.q + "," + m.userData.r);
    if ((m.userData.fogS || false) !== fog) { m.userData.fogS = fog; m.material = fog ? m.userData.fogMat : m.userData.baseMat; m.castShadow = !fog; }
  });

  // 树木(PCG, 仅已探明的森林/丘陵)
  clearGroup(gTrees);
  const trunkMat = new THREE.MeshStandardMaterial({ map: materialTex("wood"), color: 0x493625, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: winter ? 0x34443b : 0x385437, roughness: .95 });
  const leafTopMat = new THREE.MeshStandardMaterial({ color: winter ? 0x46564b : 0x4a6840, roughness: .95 });
  const dummy = new THREE.Object3D();
  const trunks = [], leaves = [], tops = [], snowTips = [], trunksF = [], leavesF = [], topsF = []; // F=素描(雾中)
  for (let q = 0; q < W; q++) for (let r = 0; r < H; r++) {
    const t = s.tiles[q][r]; if (!t.disc) continue;
    let n = t.terrain === "forest" ? (t.village ? 4 : 9) : (t.terrain === "hills" && h2(q * 1.7, r * 3.1) > .5 ? 3 : 0);
    if (!n) continue;
    const fog = !visSet.has(q + "," + r);
    const [x, z] = hexWorld(q, r), h = tiles[q + "," + r].h;
    for (let i = 0; i < n; i++) {
      const a = h2(q * 3.1 + i, r * 5.7) * 6.28, rad = 0.55 * h2(q + i * 0.3, r + i);
      const tx = x + Math.cos(a) * rad, tz = z + Math.sin(a) * rad, sc = .62 + h2(q * (i + 1) + 1, r + i * 2) * .62;
      (fog ? trunksF : trunks).push([tx, h + .17 * sc, tz, sc]);
      (fog ? leavesF : leaves).push([tx, h + .43 * sc, tz, sc]);
      (fog ? topsF : tops).push([tx, h + .67 * sc, tz, sc]);
      if (!fog && winter && i % 2 === 0) snowTips.push([tx, h + .79 * sc, tz, sc * .72]);
    }
  }
  const addInst = (geo, mat, arr, shadow) => {
    if (!arr.length) return;
    const im = new THREE.InstancedMesh(geo, mat, arr.length);
    arr.forEach((p, i) => { dummy.position.set(p[0], p[1], p[2]); dummy.scale.set(p[3], p[3], p[3]); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
    im.castShadow = shadow; gTrees.add(im);
  };
  addInst(treeTrunkGeo, trunkMat, trunks, true); addInst(treeLeafGeo, leafMat, leaves, true);
  addInst(treeLeafTopGeo, leafTopMat, tops, true);
  addInst(treeLeafTopGeo, snowMat, snowTips, false);
  addInst(treeTrunkGeo, sketchify(new THREE.MeshBasicMaterial({ color: 0x5a4326 })), trunksF, false);
  addInst(treeLeafGeo, sketchify(new THREE.MeshBasicMaterial({ color: 0x3f6a2a })), leavesF, false);
  addInst(treeLeafTopGeo, sketchify(new THREE.MeshBasicMaterial({ color: 0x4d5b45 })), topsF, false);

  // 建筑(村庄/县城/炮楼/铁路/地雷)
  clearGroup(gStruct);
  for (let q = 0; q < W; q++) for (let r = 0; r < H; r++) {
    const t = s.tiles[q][r]; if (!t.disc) continue;
    const [x, z] = hexWorld(q, r), h = tiles[q + "," + r].h;
    if (t.rail) gStruct.add(railMesh(q, r, x, h, z, t));
    if (t.village) {
      gStruct.add(villageMesh(x, h, z, t.village));
      if (t.village.owner === "p") { // 总部/根据地村庄: Civ6式城市横幅
        const cb = new THREE.Sprite(new THREE.SpriteMaterial({ map: cityBannerTex(t.village), depthWrite: false, transparent: true }));
        cb.material.toneMapped = false; cb.scale.set(2.0, .38, 1); cb.position.set(x, h + 1.28, z); cb.userData = { q, r, banner: 1 };
        gStruct.add(cb);
      }
    }
    if (t.sh) gStruct.add(structMesh(x, h, z, t.sh));
    if (t.mine) gStruct.add(mineMesh(x, h, z));
  }

  // 单位(敌方需可见)
  clearGroup(gUnits);
  for (const un of s.units) {
    if (un.side === "j" && !visSet.has(key(un.q, un.r))) continue;
    if (!s.tiles[un.q][un.r].disc) continue;
    const [x, z] = hexWorld(un.q, un.r), h = tiles[un.q + "," + un.r].h;
    const off = un.layer === "civ" ? -0.28 : 0.28;
    gUnits.add(unitMiniature(un, x, h, z, off));
    // 头顶大横幅(Civ6式, 易辨认)
    const bn = new THREE.Sprite(new THREE.SpriteMaterial({ map: unitBannerTex(un), depthWrite: false, transparent: true }));
    bn.material.toneMapped = false; bn.scale.set(1.42, .58, 1); bn.position.set(x + off, h + 1.05, z); bn.userData = { q: un.q, r: un.r }; // 横幅不再压过模型
    gUnits.add(bn);
  }

  // 高亮(选中/可达/路径/攻击)
  clearGroup(gOverlay);
  const sel = G().sel(), reach = G().reach(), pend = G().pending();
  const selU = sel && sel.kind === "unit" ? s.units.find(x => x.id === sel.id) : null;
  if (selU) gOverlay.add(ring(selU.q, selU.r, 0xffe9a0, 0.5));
  const mvMode = G().moveMode && G().moveMode(), mvHover = G().moveHover && G().moveHover();
  if (reach && mvMode) for (const k of reach.keys()) { const [q, r] = k.split(",").map(Number); gOverlay.add(hexCap(q, r, 0x8fd24a, 0.14)); gOverlay.add(hexOutline(q, r, 0xcdff72)); }
  if (mvMode && G().tunnelTargets) for (const o of G().tunnelTargets()) { gOverlay.add(hexCap(o.q, o.r, 0x4ec8de, 0.18)); gOverlay.add(hexOutline(o.q, o.r, 0x8fe8f8)); } // 地道转移目标(青色)
  const drawPath3D = (path, stops) => {
    for (let i = 0; i < path.length - 1; i++) gOverlay.add(pathSeg(path[i], path[i + 1]));
    if (stops) for (const [bq, br, bt] of stops) { const sp = numSprite(bt); const [x, z] = hexWorld(bq, br); sp.position.set(x, topY(bq, br) + 0.45, z); gOverlay.add(sp); }
  };
  if (mvMode && mvHover && mvHover.path) { // 移动模式悬停路径预览(点击即执行)
    drawPath3D(mvHover.path, mvHover.stops);
    gOverlay.add(ring(mvHover.q, mvHover.r, 0xffe9a0, 0.9));
  }
  // 已下达的行军令(选中时): 路径+剩余回合数字
  if (selU && selU.autoPath && selU.autoPath.length && !(mvMode && mvHover) && G().pathTurns) {
    const full = [[selU.q, selU.r], ...selU.autoPath];
    drawPath3D(full, G().pathTurns(selU, full).stops);
  }
  if (pend && (pend.type === "atk" || pend.type === "struct")) gOverlay.add(ring(pend.q, pend.r, 0xe2564d, 0.95));
  csmSetupScene(); // 新建的村庄/建筑/树材质接入 CSM
}

function topY(q, r) { const tt = tiles[q + "," + r]; return tt ? tt.h : 0.2; }
function addBox(g, w, ht, d, mat, x, y, z, ry) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, ht, d), mat); m.position.set(x, y, z); if (ry) m.rotation.y = ry; m.castShadow = m.receiveShadow = true; g.add(m); return m;
}
function addCylinder(g, rt, rb, ht, seg, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, ht, seg), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m;
}
function markPickGroup(g, q, r) { g.traverse(o => { if (o.isMesh) o.userData = { ...o.userData, q, r }; }); return g; }

function railMesh(q, r, x, h, z, t) {
  const g = new THREE.Group(); g.position.set(x, h + .015, z);
  const s = G().state(), dirs = (q & 1) ? [[1,0],[1,1],[0,-1],[0,1],[-1,0],[-1,1]] : [[1,-1],[1,0],[0,-1],[0,1],[-1,-1],[-1,0]];
  const ns = dirs.map(([dq, dr]) => [q + dq, r + dr]).filter(([nq, nr]) => s.tiles[nq] && s.tiles[nq][nr] && s.tiles[nq][nr].rail);
  let dx = 0, dz = 1;
  if (ns.length) {
    const a = hexWorld(ns[0][0], ns[0][1]), b = ns.length > 1 ? hexWorld(ns[ns.length - 1][0], ns[ns.length - 1][1]) : [x * 2 - a[0], z * 2 - a[1]];
    dx = b[0] - a[0]; dz = b[1] - a[1];
  }
  g.rotation.y = Math.atan2(dx, dz);
  const bed = new THREE.Mesh(new THREE.BoxGeometry(.72, .035, 1.82), new THREE.MeshStandardMaterial({ map: materialTex("stone"), color: 0x625c50, roughness: 1 })); bed.position.y = .012; bed.receiveShadow = true; g.add(bed);
  for (let i = -3; i <= 3; i++) addBox(g, .78, .045, .095, sharedMats.railWood, 0, .052, i * .24, (t.railBroken || 0) && i === 0 ? .25 : 0);
  for (const rx of [-.23, .23]) { const rail = addBox(g, .038, .055, 1.82, sharedMats.iron, rx, .092, 0); if (t.railBroken) { rail.rotation.z = rx < 0 ? .055 : -.055; rail.position.z += rx < 0 ? .08 : -.06; } }
  if ((r + q) % 3 === 0) {
    const pole = addCylinder(g, .018, .025, .72, 6, sharedMats.timber, .48, .39, -.18);
    addBox(g, .32, .025, .025, sharedMats.timber, .48, .68, -.18);
    for (const ox of [-.13, .13]) addCylinder(g, .018, .018, .04, 8, new THREE.MeshStandardMaterial({ color: 0x4b4b42, roughness: .7 }), .48 + ox, .72, -.18);
    pole.castShadow = true;
  }
  return markPickGroup(g, q, r);
}

function mineMesh(x, h, z) {
  const g = new THREE.Group(); g.position.set(x, h, z);
  const mineMat = new THREE.MeshStandardMaterial({ color: 0x34352e, roughness: .8, metalness: .25 });
  for (let i = 0; i < 3; i++) { const a = i * 2.2 + .4, rad = i ? .16 : 0; const b = addCylinder(g, .08, .1, .045, 10, mineMat, Math.cos(a) * rad, .035, Math.sin(a) * rad); const pin = addCylinder(g, .012, .012, .045, 6, sharedMats.iron, b.position.x, .075, b.position.z); pin.castShadow = false; }
  const stake = addBox(g, .025, .32, .025, sharedMats.timber, -.26, .16, .16, -.12);
  const tag = addBox(g, .24, .13, .018, sharedMats.redCloth, -.24, .27, .16, -.12); tag.rotation.z = -.08; stake.castShadow = tag.castShadow = true;
  return g;
}

function addHouse(g, dx, dz, w, d, ht, wall, roof, ry) {
  const hg = new THREE.Group(); hg.position.set(dx, 0, dz); hg.rotation.y = ry || 0;
  addBox(hg, w, .07, d, sharedMats.stone, 0, .035, 0);
  addBox(hg, w, ht, d, wall, 0, ht / 2 + .06, 0);
  const rf = new THREE.Mesh(roofGeo, roof); rf.scale.set(w * 1.16, ht * .72, d * 1.18); rf.position.y = ht + .06; rf.castShadow = true; hg.add(rf);
  const door = addBox(hg, w * .19, ht * .48, .025, sharedMats.timber, -.12 * w, ht * .25 + .06, -d / 2 - .012);
  const windowMat = new THREE.MeshStandardMaterial({ color: 0x9f7b43, emissive: 0x3b250d, emissiveIntensity: .8, roughness: .8 });
  addBox(hg, w * .16, ht * .22, .022, windowMat, .2 * w, ht * .58 + .06, -d / 2 - .014);
  door.castShadow = false; g.add(hg); return hg;
}

function villageMesh(x, h, z, v) {
  const g = new THREE.Group(); g.position.set(x, h, z); const owned = v.owner === "p";
  const wall = owned ? sharedMats.wall : sharedMats.wallEnemy, roof = owned ? sharedMats.roofRed : sharedMats.roof;
  const lane = addBox(g, .15, .018, 1.42, sharedMats.path, .16, .018, .12, -.18); lane.castShadow = false;
  const yard = new THREE.Mesh(new THREE.CircleGeometry(.42, 18), sharedMats.path); yard.rotation.x = -Math.PI / 2; yard.position.set(.02, .022, .04); yard.receiveShadow = true; g.add(yard);
  // 石墙围成的小院比三栋孤立方盒更像华北山村，也提供清晰的据点轮廓。
  addBox(g, 1.05, .10, .055, sharedMats.stone, 0, .05, -.47);
  addBox(g, .055, .10, .92, sharedMats.stone, -.52, .05, 0);
  addBox(g, .055, .10, .58, sharedMats.stone, .52, .05, .17);
  addHouse(g, -.24, -.20, .42, .30, .29, wall, roof, .03);
  addHouse(g, .22, .20, .46, .32, .34, wall, roof, -.12);
  addHouse(g, -.18, .25, .32, .27, .24, wall, roof, .08);
  if (v.hq) addHouse(g, .22, -.18, .38, .28, .30, wall, roof, -.05);
  // 水井、柴垛与石碾，近看有生活气，远看仍只是克制的小点。
  addCylinder(g, .095, .11, .09, 12, sharedMats.stone, .1, .06, .02);
  addCylinder(g, .065, .065, .025, 12, new THREE.MeshStandardMaterial({ color: 0x1d2526, roughness: 1 }), .1, .11, .02);
  for (let i = 0; i < 4; i++) { const log = addCylinder(g, .018, .022, .22, 6, sharedMats.timber, -.42 + i * .035, .12 + i * .012, .42); log.rotation.z = Math.PI / 2; }
  if (v.buildings && v.buildings.includes("kaiken")) for (let i = -2; i <= 2; i++) addBox(g, .42, .018, .025, fieldMat, .3, .02, i * .055, -.18);
  if (v.buildings && v.buildings.includes("liangcang")) { addBox(g, .22, .16, .08, sharedMats.darkStone, -.38, .09, -.38, .45); addBox(g, .09, .10, .012, sharedMats.timber, -.38, .08, -.43, .45); }
  if (v.buildings && v.buildings.includes("didao")) { const hatch = addBox(g, .18, .025, .13, sharedMats.timber, .37, .025, .38, -.25); hatch.castShadow = false; }
  if (v.buildings && v.buildings.includes("arsenal")) { const chimney = addCylinder(g, .025, .035, .27, 7, sharedMats.darkStone, .42, .20, -.23); chimney.castShadow = true; }
  if (v.buildings && v.buildings.includes("yexiao")) { const lamp = new THREE.PointLight(0xffb35b, .32, 2); lamp.position.set(.18, .42, .06); g.add(lamp); }
  if (owned) { const fg = flag(.39, 0, -.22, 0x9d2a21, v.hq); g.add(fg); }
  if (v.hq) { const halo = new THREE.Mesh(new THREE.TorusGeometry(.68, .025, 6, 36), new THREE.MeshStandardMaterial({ color: 0xc9a34b, emissive: 0x4c3508 })); halo.rotation.x = Math.PI / 2; halo.position.y = .035; g.add(halo); }
  return g;
}
function structMesh(x, h, z, sh) {
  const g = new THREE.Group(); g.position.set(x, h, z);
  if (sh.kind === "town") {
    const wm = sharedMats.darkStone;
    addBox(g, 1.28, .34, .12, wm, 0, .17, -.55); addBox(g, 1.28, .34, .12, wm, 0, .17, .55);
    addBox(g, .12, .34, 1.0, wm, -.58, .17, 0); addBox(g, .12, .34, 1.0, wm, .58, .17, 0);
    for (const [tx, tz] of [[-.56,-.53],[.56,-.53],[-.56,.53],[.56,.53]]) { addCylinder(g, .18, .21, .55, 8, wm, tx, .275, tz); const cap = new THREE.Mesh(new THREE.ConeGeometry(.23, .18, 8), sharedMats.roof); cap.position.set(tx, .64, tz); cap.castShadow = true; g.add(cap); }
    addHouse(g, 0, .02, .55, .42, .48, sharedMats.wallEnemy, sharedMats.roof, 0);
    addBox(g, .26, .30, .035, new THREE.MeshStandardMaterial({ color: 0x231f1a, roughness: 1 }), 0, .15, -.62);
    g.add(flag(.30, .47, -.02, 0xe2ded0, false, true));
  } else if (sh.kind === "pillbox") {
    const body = addCylinder(g, .27, .36, .66, 8, sharedMats.darkStone, 0, .33, 0);
    addCylinder(g, .31, .29, .10, 8, sharedMats.stone, 0, .70, 0);
    const slitMat = new THREE.MeshStandardMaterial({ color: 0x171a18, roughness: 1 });
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2, slit = addBox(g, .18, .055, .025, slitMat, Math.sin(a) * .275, .48, Math.cos(a) * .275, a); slit.castShadow = false; }
    for (let i = 0; i < 7; i++) { const a = i / 7 * 6.28; const bag = new THREE.Mesh(new THREE.SphereGeometry(.08, 8, 5), new THREE.MeshStandardMaterial({ color: 0x77705c, roughness: 1 })); bag.scale.set(1.5, .55, .72); bag.position.set(Math.cos(a) * .39, .06, Math.sin(a) * .39); bag.rotation.y = -a; bag.castShadow = true; g.add(bag); }
    body.castShadow = true;
  } else if (sh.kind === "bandit") {
    // 土匪山寨: 木栅寨墙 + 石屋 + 灰旗
    for (let i = 0; i < 8; i++) { const a = Math.PI / 4 * i; addBox(g, .05, .34, .05, sharedMats.timber, Math.cos(a) * .42, .17, Math.sin(a) * .42, a); }
    addBox(g, .34, .22, .28, new THREE.MeshStandardMaterial({ color: 0x4a4238, roughness: 1 }), 0, .11, 0);
    g.add(flag(.3, 0, -.1, 0x50483c, false));
  } else if (sh.kind === "site") {
    addCylinder(g, .24, .3, .3, 8, new THREE.MeshStandardMaterial({ color: 0x6a5a3a, roughness: 1, transparent: true, opacity: .68 }), 0, .15, 0);
    for (const a of [0, Math.PI / 2]) addBox(g, .72, .025, .025, sharedMats.timber, 0, .40, 0, a);
    for (const [px, pz] of [[-.28,-.28],[.28,-.28],[-.28,.28],[.28,.28]]) addBox(g, .025, .62, .025, sharedMats.timber, px, .31, pz);
  }
  return g;
}
function flag(x, y, z, col, hq, sun) {
  const g = new THREE.Group(); g.position.set(x, y, z);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.012, .016, hq ? .78 : .62, 6), new THREE.MeshStandardMaterial({ color: 0xaaa18d, roughness: .7, metalness: .15 })); pole.position.y = hq ? .39 : .31; pole.castShadow = true; g.add(pole);
  const clothMat = col === 0x9d2a21 ? sharedMats.redCloth : new THREE.MeshStandardMaterial({ color: col, side: THREE.DoubleSide, roughness: 1 });
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(hq ? .38 : .31, hq ? .23 : .18, 3, 1), clothMat); cloth.position.set(hq ? .19 : .155, hq ? .61 : .49, 0); cloth.castShadow = true; g.add(cloth);
  if (sun) { const d = new THREE.Mesh(new THREE.CircleGeometry(.048, 16), new THREE.MeshStandardMaterial({ color: 0xa82c24, side: THREE.DoubleSide, roughness: 1 })); d.position.set(hq ? .20 : .16, hq ? .61 : .49, .002); g.add(d); }
  return g;
}

function unitModelMaterials(u) {
  const side = u.side === "p" ? "p" : "j", role = u.type;
  const bodyColor = side === "p"
    ? ({ work: 0x6f7065, scout: 0x5f6b70, militia: 0x56645f, regular: 0x4b5960, elite: 0x3f5058, commando: 0x394640 }[role] || 0x56645f)
    : ({ spy: 0x4b4640, puppet: 0x706846, armored: 0x66654d }[role] || 0x747252);
  const k = "unitmat_" + side + "_" + role;
  if (!sharedMats[k]) sharedMats[k] = {
    body: new THREE.MeshStandardMaterial({ color: bodyColor, roughness: .96 }),
    trim: new THREE.MeshStandardMaterial({ color: side === "p" ? 0x7d2d26 : 0x8b8061, roughness: .9 }),
    leather: new THREE.MeshStandardMaterial({ map: materialTex("wood"), color: 0x4b3525, roughness: 1 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xb58a65, roughness: .9 }),
    metal: sharedMats.iron,
    base: new THREE.MeshStandardMaterial({ color: side === "p" ? 0x4e221d : 0x403c2e, roughness: .82, metalness: .12 }),
  };
  return sharedMats[k];
}

function addLimb(g, mat, x, y, z, len, rz, rx) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(.022, .027, len, 6), mat); m.position.set(x, y, z); m.rotation.z = rz || 0; m.rotation.x = rx || 0; m.castShadow = true; g.add(m); return m;
}

function humanMiniature(u) {
  const g = new THREE.Group(), m = unitModelMaterials(u), isEnemy = u.side !== "p";
  addLimb(g, m.body, -.045, .16, 0, .23, -.08); addLimb(g, m.body, .045, .16, 0, .23, .08);
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(.075, .115, .25, 7), m.body); torso.position.y = .34; torso.castShadow = true; g.add(torso);
  addLimb(g, m.body, -.11, .37, 0, .24, -.55); addLimb(g, m.body, .11, .37, 0, .24, .55);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.072, 10, 7), m.skin); head.position.y = .535; head.castShadow = true; g.add(head);
  if (u.type === "spy") {
    addCylinder(g, .082, .086, .055, 10, m.body, 0, .595, 0); addCylinder(g, .12, .12, .018, 12, m.body, 0, .568, 0);
  } else if (isEnemy) {
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(.091, 12, 7, 0, 6.28, 0, 1.78), m.body); helmet.position.y = .575; helmet.castShadow = true; g.add(helmet);
    addBox(g, .19, .018, .12, m.body, 0, .565, 0);
  } else {
    addCylinder(g, .081, .088, .055, 10, m.body, 0, .59, 0); addBox(g, .16, .018, .07, m.body, .025, .565, -.045);
    const star = new THREE.Mesh(new THREE.SphereGeometry(.013, 6, 4), m.trim); star.position.set(0, .594, -.083); g.add(star);
  }
  addBox(g, .14, .15, .065, m.leather, 0, .36, .095); // 背包
  if (u.type === "work") {
    const pole = addCylinder(g, .012, .014, .48, 6, m.leather, .17, .31, -.02); pole.rotation.z = -.35;
    const blade = addBox(g, .11, .13, .018, m.metal, .255, .085, -.02, -.08); blade.rotation.z = -.35;
  } else if (u.type === "scout") {
    addBox(g, .13, .065, .055, m.metal, 0, .45, -.09); addCylinder(g, .025, .025, .055, 8, m.metal, -.045, .45, -.12); addCylinder(g, .025, .025, .055, 8, m.metal, .045, .45, -.12);
  } else {
    const rifle = addBox(g, .035, .48, .035, m.leather, .16, .34, -.055); rifle.rotation.z = -.48;
    const barrel = addCylinder(g, .009, .009, .25, 6, m.metal, .265, .49, -.055); barrel.rotation.z = -.48;
  }
  return g;
}

function armoredMiniature(u) {
  const g = new THREE.Group(), m = unitModelMaterials(u);
  addBox(g, .56, .18, .34, m.body, 0, .17, 0); addBox(g, .40, .12, .28, m.body, -.03, .30, 0);
  addCylinder(g, .105, .12, .09, 10, m.body, .10, .405, 0);
  const gun = addCylinder(g, .012, .015, .34, 7, m.metal, .10, .43, -.17); gun.rotation.x = Math.PI / 2;
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x242521, roughness: .88 });
  for (const wx of [-.19, .19]) for (const wz of [-.18, .18]) { const wh = addCylinder(g, .075, .075, .055, 10, wheelMat, wx, .12, wz); wh.rotation.x = Math.PI / 2; }
  return g;
}

function unitMiniature(u, x, h, z, off) {
  const g = new THREE.Group(); g.position.set(x + off, h + .035, z); g.userData = { q: u.q, r: u.r, faceCamera: 1 };
  const mats = unitModelMaterials(u);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(.24, .27, .055, 20), mats.base); base.position.y = .028; base.castShadow = base.receiveShadow = true; g.add(base);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(.235, .014, 5, 24), new THREE.MeshStandardMaterial({ color: u.side === "p" ? 0xc39c54 : 0x8d7650, roughness: .7, metalness: .28 })); rim.rotation.x = Math.PI / 2; rim.position.y = .061; g.add(rim);
  const fig = u.type === "armored" ? armoredMiniature(u) : humanMiniature(u); fig.scale.setScalar(u.type === "armored" ? .83 : .92); fig.position.y = .05; g.add(fig);
  g.traverse(o => { if (o.isMesh) o.userData = { ...o.userData, q: u.q, r: u.r }; }); return g;
}

function ring(q, r, col, op) { const m = new THREE.Mesh(new THREE.TorusGeometry(R * 0.8, 0.05, 8, 28), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op })); m.rotation.x = Math.PI / 2; const [x, z] = hexWorld(q, r); m.position.set(x, topY(q, r) + 0.06, z); return m; }
function hexCap(q, r, col, op) { const m = new THREE.Mesh(hexFlatGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false })); const [x, z] = hexWorld(q, r); m.position.set(x, topY(q, r) + 0.04, z); return m; }
// 六边形高亮边框(文明六风格可移动范围): 亮色描边六条边, 比半透明填充清晰得多
function hexOutline(q, r, col) {
  const [x, z] = hexWorld(q, r), y = topY(q, r) + 0.06, pts = [];
  for (let i = 0; i <= 6; i++) { const a = Math.PI / 3 * i; pts.push(new THREE.Vector3(x + R * .93 * Math.cos(a), y, z + R * .93 * Math.sin(a))); }
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  const m = new THREE.Line(g, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.95 }));
  return m;
}
// 回合数字徽章(行军路径 1,2,3..)
function numSprite(n) {
  const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d");
  g.fillStyle = "rgba(40,36,24,.95)"; g.beginPath(); g.arc(32, 32, 26, 0, 7); g.fill();
  g.strokeStyle = "#ffe9a0"; g.lineWidth = 4; g.stroke();
  g.fillStyle = "#fff4d0"; g.font = "bold 30px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(n, 32, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true }));
  sp.scale.set(0.5, 0.5, 1); return sp;
}
function pathSeg(a, b) { const [ax, az] = hexWorld(a[0], a[1]), [bx, bz] = hexWorld(b[0], b[1]); const ay = topY(a[0], a[1]) + 0.1, by = topY(b[0], b[1]) + 0.1; const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(ax, ay, az), new THREE.Vector3(bx, by, bz)]); return new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffe9a0 })); }

// ── 拾取(区分点击/拖动) ──
let downPt = null;
function setupPicking() {
  const el = renderer.domElement, ray = new THREE.Raycaster(), m = new THREE.Vector2();
  const castAt = (e) => { const rect = el.getBoundingClientRect(); m.x = ((e.clientX - rect.left) / rect.width) * 2 - 1; m.y = -((e.clientY - rect.top) / rect.height) * 2 + 1; ray.setFromCamera(m, camera); };
  el.addEventListener("pointerdown", e => { downPt = [e.clientX, e.clientY]; });
  el.addEventListener("pointerup", e => {
    if (!downPt) return; const moved = Math.abs(e.clientX - downPt[0]) + Math.abs(e.clientY - downPt[1]); downPt = null;
    if (moved > 6) return; // 拖动=旋转, 不算点击
    castAt(e);
    // 城市横幅优先: 点横幅直接选中村庄
    const bh = ray.intersectObjects(gStruct.children, false).find(h => h.object.userData && h.object.userData.banner);
    if (bh && G().selectTile) { G().selectTile(bh.object.userData.q, bh.object.userData.r); return; }
    const hit = ray.intersectObjects(gTiles.children, false).find(h => h.object.userData && h.object.userData.q !== undefined);
    if (hit) { G().click(hit.object.userData.q, hit.object.userData.r); }
  });
  // 移动命令模式: 悬停路径预览(节流)
  let lastHover = 0;
  el.addEventListener("pointermove", e => {
    if (!G().moveMode || !G().moveMode()) return;
    const now = performance.now(); if (now - lastHover < 50) return; lastHover = now;
    castAt(e);
    const hit = ray.intersectObjects(gTiles.children, false).find(h => h.object.userData && h.object.userData.q !== undefined);
    if (hit && G().hover) G().hover(hit.object.userData.q, hit.object.userData.r);
  });
}

function onResize() { if (!renderer) return; const w = host.clientWidth || innerWidth, h = host.clientHeight || innerHeight; renderer.setSize(w, h); if (composer) composer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); if (csm) csm.updateFrustums(); }
function loop() {
  animId = requestAnimationFrame(loop);
  clock = performance.now() / 1000;
  controls.update();
  if (gUnits && camera) gUnits.children.forEach(o => { if (o.userData && o.userData.faceCamera) o.rotation.y = Math.atan2(camera.position.x - o.position.x, camera.position.z - o.position.z) + Math.PI; });
  if (sky && sky.visible) sky.position.copy(camera.position); // 天空盒跟随镜头(始终包住相机, 不被远裁剪面切掉)
  if (csm) { csm.update(); }
  else if (sunLight && sunLight.castShadow) { const d = sunDirVec(); sunLight.position.copy(controls.target).addScaledVector(d, -60); sunLight.target.position.copy(controls.target); sunLight.target.updateMatrixWorld(); } // 单阴影跟随镜头
  const sig = signature(); if (sig !== lastSig) { lastSig = sig; syncDynamic(); }
  for (const k in revealAnims) { // 战雾展开: 新格从地面升起
    const tt = tiles[k], p = (clock - revealAnims[k]) / 0.5;
    if (p >= 1) { tt.mesh.scale.y = tt.h; tt.mesh.position.y = tt.h / 2; delete revealAnims[k]; }
    else { const e = 1 - Math.pow(1 - p, 3), sy = Math.max(0.001, tt.h * e); tt.mesh.scale.y = sy; tt.mesh.position.y = sy / 2; }
  }
  if (taaEnabled && composer) composer.render(); else renderer.render(scene, camera);
}

function dispose() {
  if (!inited) return; cancelAnimationFrame(animId); animId = 0;
  if (ro) ro.disconnect(); window.removeEventListener("resize", onResize);
  controls.dispose(); if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
  disposeCSM();
  if (composer) { composer.dispose && composer.dispose(); composer = null; taaPass = null; }
  if (scene) {
    const geos = new Set(), mats = new Set();
    scene.traverse(o => { if (o.geometry) geos.add(o.geometry); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => mats.add(m)); });
    geos.forEach(g => g.dispose && g.dispose()); mats.forEach(m => m.dispose && m.dispose());
  }
  renderer.dispose(); scene = null; renderer = null; sky = hemiLight = ambientLight = sunLight = null; inited = false; lastSig = "";
  gTiles = gTerrain = gTrees = gUnits = gStruct = gOverlay = null;
  for (const k in tiles) delete tiles[k];
  for (const k in revealAnims) delete revealAnims[k];
  tileVisPrev.clear();
  // 清缓存: 重建时用全新材质(不带上一 CSM 的 onBeforeCompile 补丁), 避免 CSM 重建崩溃
  for (const k in matCache) delete matCache[k];
  for (const k in texCache) { if (texCache[k] && texCache[k].dispose) texCache[k].dispose(); delete texCache[k]; }
  for (const k in sketchCache) delete sketchCache[k];
  for (const k in sharedMats) delete sharedMats[k];
  if (_paperTex) _paperTex.dispose(); _paperTex = null; surfaceLoadStarted = false;
}
// 结构性重建(cascades/size/开关): 整个 3D 重来一遍最稳, 缓存已在 dispose 清空→材质全新
function reinit() { if (!inited || !host) return; const h = host; dispose(); init(h); }
function active() { return inited; }

export const TH3D = { init, dispose, active, focus, project, dbg };
if (typeof window !== "undefined") window.TH3D = TH3D;
