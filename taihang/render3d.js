// 《太行·1941》3D 渲染(文明6式 2.5D) —— Three.js。读 window.TH 的游戏状态, 复用其点格逻辑。
// 地形: PCG 高度图六边棱柱 + 程序化纹理; 树木 PCG 实例化; 天空大气散射; 单位=朝相机贴图棋子。
import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { TAARenderPass } from "three/addons/postprocessing/TAARenderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { CSM } from "three/addons/csm/CSM.js";

const SQ3 = Math.sqrt(3), R = 1.0, DEG = THREE.MathUtils.degToRad;
const G = () => window.TH;

let renderer, scene, camera, controls, animId = 0, host = null, ro = null;
let gTiles, gTrees, gUnits, gStruct, gOverlay;
const tiles = {};            // "q,r" -> { mesh, h, terrain }
let prismGeo, coneGeo, treeTrunkGeo, treeLeafGeo, hexFlatGeo;
const matCache = {};
const texCache = {};
let sunLight, sky, hemiLight, ambientLight, lastSig = "", inited = false, cx0 = 0, cz0 = 0;
let _sunElev = 42, _sunAzi = 150, composer = null, taaPass = null, taaEnabled = false;
let camPolar = 0.62; // 相机俯视极角(距+Y轴; 越小越俯视/越接近正上方俯拍 — 参考文明6)
let csm = null; const csmCfg = { cascades: 2, size: 2048, maxFar: 55, fade: true };
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
  plain:    { base: .08, amp: .05, top: "#8a923f", side: "#6a5836" },
  hills:    { base: .22, amp: .30, top: "#a88f3f", side: "#7a5f36" },
  forest:   { base: .12, amp: .10, top: "#4d6a2e", side: "#54502c" },
  mountain: { base: .40, amp: .70, top: "#9a9386", side: "#5c554a" },
};
function tileH() { return 0.5; } // 地块平整不起伏(0缝隙/边缘对齐); 山地靠山峰锥体表现, 且不可通行

function terrainTex(t) {
  if (texCache[t]) return texCache[t];
  const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d");
  g.fillStyle = TERR[t].top; g.fillRect(0, 0, 64, 64);
  // 斑点噪声占位纹理
  for (let i = 0; i < 1100; i++) {
    const x = Math.random() * 64, y = Math.random() * 64, s = Math.random() * 2 + .5, v = (Math.random() - .5);
    g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 200 : 0},${Math.abs(v) * 0.22})`;
    g.fillRect(x, y, s, s);
  }
  if (t === "forest") { g.fillStyle = "rgba(30,50,20,.3)"; for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(Math.random() * 64, Math.random() * 64, 2 + Math.random() * 3, 0, 7); g.fill(); } }
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  texCache[t] = tex; return tex;
}
function tileMats(t) {
  if (matCache[t]) return matCache[t];
  const top = new THREE.MeshStandardMaterial({ map: terrainTex(t), roughness: .96, metalness: 0 });
  const side = new THREE.MeshStandardMaterial({ color: TERR[t].side, roughness: 1, metalness: 0 });
  matCache[t] = [side, top, side]; return matCache[t];
}

// ── 单位棋子贴图(复用彩色徽标) ──
const UGLYPH = { scout: "侦", work: "工", militia: "民", regular: "连", elite: "团", commando: "武", puppet: "伪", squad: "日", company: "中", armored: "装" };
function unitTex(u) {
  const k = u.type; if (texCache["u_" + k]) return texCache["u_" + k];
  const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d");
  const isP = u.side === "p";
  const badge = isP ? (u.layer === "civ" ? "#2f6b6b" : u.type === "commando" ? "#4a3a6a" : "#8a2a1a") : (u.type === "puppet" ? "#5f5628" : "#961f13");
  // 简笔人形
  g.fillStyle = "rgba(0,0,0,.28)"; g.beginPath(); g.ellipse(64, 116, 26, 8, 0, 0, 7); g.fill();
  g.strokeStyle = badge; g.lineWidth = 11; g.lineCap = "round";
  g.beginPath(); g.moveTo(64, 88); g.lineTo(52, 112); g.moveTo(64, 88); g.lineTo(76, 112); g.stroke();
  g.fillStyle = badge; g.beginPath(); g.moveTo(48, 88); g.lineTo(52, 56); g.lineTo(76, 56); g.lineTo(80, 88); g.closePath(); g.fill();
  g.fillStyle = "#d8b088"; g.beginPath(); g.arc(64, 46, 15, 0, 7); g.fill();
  if (!isP) { g.fillStyle = "#454b36"; g.beginPath(); g.arc(64, 42, 18, Math.PI, 0); g.fill(); }
  else { g.fillStyle = badge; g.fillRect(48, 30, 32, 10); g.fillStyle = "#e2382a"; g.beginPath(); g.arc(64, 34, 4, 0, 7); g.fill(); }
  // 徽标
  g.fillStyle = badge; roundRect(g, 42, 2, 44, 30, 8); g.fill();
  g.strokeStyle = isP ? "rgba(240,220,180,.8)" : "rgba(230,120,110,.8)"; g.lineWidth = 2; g.stroke();
  g.fillStyle = "#f8eed8"; g.font = "800 24px 'Noto Sans SC',sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(UGLYPH[u.type] || "兵", 64, 18);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; texCache["u_" + k] = tex; return tex;
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

// ── 初始化 ──
function init(container) {
  if (inited) return true;
  host = container;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  } catch (e) { console.error("WebGL 初始化失败", e); return false; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(host.clientWidth || innerWidth, host.clientHeight || innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.5;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  const W = G().CFG.mapW, H = G().CFG.mapH;
  const [bx, bz] = hexWorld(W / 2, H / 2); cx0 = bx; cz0 = bz; // 板心

  // 天空(大气散射)
  sky = new Sky(); sky.scale.setScalar(6000); scene.add(sky);
  const u = sky.material.uniforms;
  u.turbidity.value = 8; u.rayleigh.value = 2.6; u.mieCoefficient.value = 0.005; u.mieDirectionalG.value = 0.85;
  const sunPos = new THREE.Vector3(); sunPos.setFromSphericalCoords(1, DEG(90 - _sunElev), DEG(_sunAzi)); u.sunPosition.value.copy(sunPos);

  // 光照
  sunLight = new THREE.DirectionalLight(0xfff2da, 3.2);
  sunLight.position.copy(sunPos).multiplyScalar(80); sunLight.target.position.set(cx0, 0, cz0);
  sunLight.castShadow = true; sunLight.shadow.mapSize.set(2048, 2048);
  // 兜底单阴影: 收紧范围(±18)让 2k 精度不被浪费, 每帧跟随镜头; CSM 启用时此阴影关闭
  const sc = sunLight.shadow.camera; sc.near = 1; sc.far = 90; sc.left = -18; sc.right = 18; sc.top = 18; sc.bottom = -18; sc.updateProjectionMatrix();
  sunLight.shadow.bias = -0.0005;
  scene.add(sunLight, sunLight.target);
  hemiLight = new THREE.HemisphereLight(0xcfe0ff, 0x54492e, 0.95); scene.add(hemiLight);
  ambientLight = new THREE.AmbientLight(0x55606f, 0.35); scene.add(ambientLight);

  // 共享几何(thetaStart=π/2 → 顶点落在 ±x, 平顶六边形, 与 hexWorld 的 1.5R 列距对齐)
  prismGeo = new THREE.CylinderGeometry(R, R, 1, 6, 1, false, Math.PI / 2); // 半径=R → 相邻六边形贴合无缝
  coneGeo = new THREE.ConeGeometry(R * 0.66, 1, 6, 1, false, Math.PI / 2);
  treeTrunkGeo = new THREE.CylinderGeometry(0.04, 0.06, 0.3, 5);
  treeLeafGeo = new THREE.ConeGeometry(0.22, 0.5, 6);
  hexFlatGeo = new THREE.CircleGeometry(R * 0.9, 6, Math.PI / 2); hexFlatGeo.rotateX(-Math.PI / 2);

  gTiles = new THREE.Group(); gTrees = new THREE.Group(); gUnits = new THREE.Group(); gStruct = new THREE.Group(); gOverlay = new THREE.Group();
  scene.add(gTiles, gTrees, gUnits, gStruct, gOverlay);

  buildTiles();
  buildBoundary();
  // 首帧: 已探明格不做展开动画(避免整片抖动), 只有之后新揭开的才动画
  const s0 = G().state();
  for (let q = 0; q < W; q++) for (let r = 0; r < H; r++) if (s0.tiles[q][r].disc) tileVisPrev.add(q + "," + r);

  // 相机 + 控制
  camera = new THREE.PerspectiveCamera(46, host.clientWidth / host.clientHeight, 0.5, 3000);
  const hq = G().state().hq; const [hx, hz] = hexWorld(hq.q, hq.r);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(hx, 0, hz);
  camera.position.set(hx, 30, hz + 20); // 高俯视起始机位
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
  buildCSM();     // 2级 CSM 阴影(默认开启)
  loop();
  return true;
}

let peakMat, snowMat;
function buildTiles() {
  const s = G().state(), W = G().CFG.mapW, H = G().CFG.mapH;
  peakMat = new THREE.MeshStandardMaterial({ color: 0xa39c90, roughness: .92 });
  snowMat = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: .8 });
  for (let q = 0; q < W; q++) for (let r = 0; r < H; r++) {
    const t = s.tiles[q][r], [x, z] = hexWorld(q, r);
    const h = Math.max(0.14, tileH(q, r, t.terrain));
    const m = new THREE.Mesh(prismGeo, tileMats(t.terrain));
    m.scale.set(1, h, 1); m.position.set(x, h / 2, z);
    m.receiveShadow = true; m.castShadow = true; m.userData = { q, r, h };
    gTiles.add(m); tiles[q + "," + r] = { mesh: m, h, terrain: t.terrain };
    if (t.terrain === "mountain") { // 雪顶峰
      const ph = 0.55 + 0.75 * h2(q * 5.3, r * 2.1);
      const peak = new THREE.Mesh(coneGeo, peakMat); peak.scale.set(1, ph, 1); peak.position.set(x, h + ph / 2, z);
      peak.castShadow = true; peak.receiveShadow = true; peak.userData = { q, r, h, decor: 1 }; gTiles.add(peak);
      const cap = new THREE.Mesh(coneGeo, snowMat); cap.scale.set(0.56, ph * 0.5, 0.56); cap.position.set(x, h + ph * 0.76, z);
      cap.castShadow = true; cap.userData = { q, r, decor: 1 }; gTiles.add(cap);
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
      pts.push(new THREE.Vector3(x + R * Math.cos(a0), 0.08, z + R * Math.sin(a0)));
      pts.push(new THREE.Vector3(x + R * Math.cos(a1), 0.08, z + R * Math.sin(a1)));
    }
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xf0c860 }));
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
  } catch (e) { console.error("CSM 初始化失败, 回退单阴影", e); csm = null; if (sunLight) { sunLight.visible = true; sunLight.castShadow = true; } }
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
  setSky(o) { if (!sky) return; const u = sky.material.uniforms; if (o.turbidity != null) u.turbidity.value = o.turbidity; if (o.rayleigh != null) u.rayleigh.value = o.rayleigh; if (o.mie != null) u.mieCoefficient.value = o.mie; if (o.mieG != null) u.mieDirectionalG.value = o.mieG; if (o.elevation != null) _sunElev = o.elevation; if (o.azimuth != null) _sunAzi = o.azimuth; if (o.elevation != null || o.azimuth != null) { const p = new THREE.Vector3(); p.setFromSphericalCoords(1, DEG(90 - _sunElev), DEG(_sunAzi)); u.sunPosition.value.copy(p); sunLight.position.copy(p).multiplyScalar(80); if (csm) csm.lightDirection.copy(sunDirVec()); } },
  setSun(o) { if (!sunLight) return; if (o.color) sunLight.color.set(o.color); if (o.intensity != null) sunLight.intensity = o.intensity; if (csm) { if (o.intensity != null) { csm.lightIntensity = o.intensity / csmCfg.cascades; csm.lights.forEach(l => l.intensity = csm.lightIntensity); } if (o.color) csm.lights.forEach(l => l.color.set(o.color)); } },
  setHemi(o) { if (!hemiLight) return; if (o.sky) hemiLight.color.set(o.sky); if (o.ground) hemiLight.groundColor.set(o.ground); if (o.intensity != null) hemiLight.intensity = o.intensity; },
  setAmbient(o) { if (!ambientLight) return; if (o.color) ambientLight.color.set(o.color); if (o.intensity != null) ambientLight.intensity = o.intensity; },
  setFog(o) { if (!scene) return; if (o.enabled === false) { scene.fog = null; return; } if (!scene.fog) scene.fog = new THREE.Fog(0xbcc6d0, 18, 85); if (o.color) scene.fog.color.set(o.color); if (o.near != null) scene.fog.near = o.near; if (o.far != null) scene.fog.far = o.far; },
  setShadow(size) { csmCfg.size = size; if (csm) { buildCSM(); return; } if (!sunLight) return; if (sunLight.shadow.map) sunLight.shadow.map.dispose(); sunLight.shadow.map = null; sunLight.shadow.mapSize.set(size, size); },
  setCSM(o) { if (o.cascades != null) csmCfg.cascades = o.cascades; if (o.size != null) csmCfg.size = o.size; if (o.maxFar != null) csmCfg.maxFar = o.maxFar; if (o.fade != null) csmCfg.fade = o.fade; if (o.enabled === false) { disposeCSM(); if (sunLight) { sunLight.visible = true; sunLight.castShadow = true; } forceMatUpdate(); } else buildCSM(); },
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
  const s = G().state(); let u = ""; for (const un of s.units) u += un.id + un.q + "," + un.r + "|" + Math.round(un.hp) + ";";
  let d = 0, v = 0; const W = G().CFG.mapW, H = G().CFG.mapH;
  for (let q = 0; q < W; q++) for (let r = 0; r < H; r++) { if (s.tiles[q][r].disc) d++; }
  const sel = G().sel(), pend = G().pending(), reach = G().reach();
  let st = ""; for (let q = 0; q < W; q++) for (let r = 0; r < H; r++) { const t = s.tiles[q][r]; if (t.village) st += q + "" + r + (t.village.owner) + (t.village.buildings ? t.village.buildings.length : 0); if (t.sh) st += "s" + q + r + Math.round(t.sh.hp); if (t.mine) st += "m" + q + r; }
  return s.turn + "#" + d + "#" + u + "#" + (sel ? sel.kind + (sel.id || sel.q + "," + sel.r) : "-") + "#" + (pend ? pend.type + pend.q + "," + pend.r : "-") + "#" + (reach ? reach.size : 0) + "#" + st;
}
function clearGroup(g) { for (let i = g.children.length - 1; i >= 0; i--) { const c = g.children[i]; g.remove(c); if (c.geometry && c.geometry !== prismGeo && c.geometry !== hexFlatGeo && c.geometry !== treeTrunkGeo && c.geometry !== treeLeafGeo) c.geometry.dispose && c.geometry.dispose(); } }

function syncDynamic() {
  const s = G().state(), W = G().CFG.mapW, H = G().CFG.mapH, key = G().key;
  const visSet = G().visSet();
  // 迷雾: 未探明格隐藏; 新揭开的登记展开动画
  for (let q = 0; q < W; q++) for (let r = 0; r < H; r++) {
    const k = q + "," + r, tt = tiles[k]; if (!tt) continue;
    const disc = s.tiles[q][r].disc; tt.mesh.visible = disc;
    if (disc && !tileVisPrev.has(k)) { tileVisPrev.add(k); revealAnims[k] = clock; tt.mesh.scale.y = 0.001; tt.mesh.position.y = 0.0005; }
  }
  gTiles.children.forEach(m => { if (m.userData && m.userData.decor) m.visible = s.tiles[m.userData.q][m.userData.r].disc; });

  // 树木(PCG, 仅已探明的森林/丘陵)
  clearGroup(gTrees);
  const trunkMats = [], leafPos = [];
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4326, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f6a2a, roughness: 1 });
  let ti = 0; const dummy = new THREE.Object3D();
  const trunks = [], leaves = [];
  for (let q = 0; q < W; q++) for (let r = 0; r < H; r++) {
    const t = s.tiles[q][r]; if (!t.disc) continue;
    let n = t.terrain === "forest" ? 6 : (t.terrain === "hills" && h2(q * 1.7, r * 3.1) > 0.6 ? 2 : 0);
    if (!n) continue;
    const [x, z] = hexWorld(q, r), h = tiles[q + "," + r].h;
    for (let i = 0; i < n; i++) {
      const a = h2(q * 3.1 + i, r * 5.7) * 6.28, rad = 0.55 * h2(q + i * 0.3, r + i);
      const tx = x + Math.cos(a) * rad, tz = z + Math.sin(a) * rad, sc = 0.7 + h2(q * i + 1, r) * 0.6;
      trunks.push([tx, h + 0.15 * sc, tz, sc]); leaves.push([tx, h + 0.42 * sc, tz, sc]);
    }
  }
  if (trunks.length) {
    const im = new THREE.InstancedMesh(treeTrunkGeo, trunkMat, trunks.length);
    trunks.forEach((p, i) => { dummy.position.set(p[0], p[1], p[2]); dummy.scale.set(p[3], p[3], p[3]); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
    im.castShadow = true; gTrees.add(im);
    const lm = new THREE.InstancedMesh(treeLeafGeo, leafMat, leaves.length);
    leaves.forEach((p, i) => { dummy.position.set(p[0], p[1], p[2]); dummy.scale.set(p[3], p[3], p[3]); dummy.updateMatrix(); lm.setMatrixAt(i, dummy.matrix); });
    lm.castShadow = true; gTrees.add(lm);
  }

  // 建筑(村庄/县城/炮楼/铁路/地雷)
  clearGroup(gStruct);
  for (let q = 0; q < W; q++) for (let r = 0; r < H; r++) {
    const t = s.tiles[q][r]; if (!t.disc) continue;
    const [x, z] = hexWorld(q, r), h = tiles[q + "," + r].h;
    if (t.rail) gStruct.add(railTie(x, h, z));
    if (t.village) gStruct.add(villageMesh(x, h, z, t.village));
    if (t.sh) gStruct.add(structMesh(x, h, z, t.sh));
    if (t.mine) gStruct.add(mineMesh(x, h, z));
  }

  // 单位(敌方需可见)
  clearGroup(gUnits);
  for (const un of s.units) {
    if (un.side === "j" && !visSet.has(key(un.q, un.r))) continue;
    if (!s.tiles[un.q][un.r].disc) continue;
    const [x, z] = hexWorld(un.q, un.r), h = tiles[un.q + "," + un.r].h;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: unitTex(un), depthWrite: false, transparent: true }));
    const off = un.layer === "civ" ? -0.28 : 0.28;
    sp.scale.set(1.0, 1.0, 1); sp.position.set(x + off, h + 0.62, z); sp.userData = { q: un.q, r: un.r };
    gUnits.add(sp);
  }

  // 高亮(选中/可达/路径/攻击)
  clearGroup(gOverlay);
  const sel = G().sel(), reach = G().reach(), pend = G().pending();
  const selU = sel && sel.kind === "unit" ? s.units.find(x => x.id === sel.id) : null;
  if (selU) gOverlay.add(ring(selU.q, selU.r, 0xffe9a0, 0.5));
  if (reach) for (const k of reach.keys()) { const [q, r] = k.split(",").map(Number); gOverlay.add(hexCap(q, r, 0x9fbc52, 0.16)); }
  if (pend && pend.type === "move" && pend.path) {
    for (let i = 0; i < pend.path.length - 1; i++) gOverlay.add(pathSeg(pend.path[i], pend.path[i + 1]));
    gOverlay.add(ring(pend.q, pend.r, 0xffe9a0, 0.9));
  }
  if (pend && (pend.type === "atk" || pend.type === "struct")) gOverlay.add(ring(pend.q, pend.r, 0xe2564d, 0.95));
  csmSetupScene(); // 新建的村庄/建筑/树材质接入 CSM
}

function topY(q, r) { const tt = tiles[q + "," + r]; return tt ? tt.h : 0.2; }
function railTie(x, h, z) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.18), new THREE.MeshStandardMaterial({ color: 0x8a8058, roughness: .8 })); m.position.set(x, h + 0.04, z); m.castShadow = true; return m; }
function mineMesh(x, h, z) { const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8, 0, 6.28, 0, 1.57), new THREE.MeshStandardMaterial({ color: 0x2c2820 })); b.position.set(x, h + 0.02, z); g.add(b); const l = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshStandardMaterial({ color: 0xe23a2c, emissive: 0x902018 })); l.position.set(x, h + 0.16, z); g.add(l); return g; }
function villageMesh(x, h, z, v) {
  const g = new THREE.Group(); const owned = v.owner === "p";
  const wall = new THREE.MeshStandardMaterial({ color: owned ? 0x8a6238 : 0x4c473a, roughness: 1 });
  const roof = new THREE.MeshStandardMaterial({ color: owned ? 0x9c3b27 : 0x554b3c, roughness: 1 });
  const hut = (dx, dz, w, ht) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, ht, w), wall); b.position.set(x + dx, h + ht / 2, z + dz); b.castShadow = b.receiveShadow = true; g.add(b); const rf = new THREE.Mesh(new THREE.ConeGeometry(w * 0.85, ht * 0.7, 4), roof); rf.rotation.y = Math.PI / 4; rf.position.set(x + dx, h + ht + ht * 0.35, z + dz); rf.castShadow = true; g.add(rf); };
  hut(-0.18, 0, 0.3, 0.28); hut(0.2, 0.14, 0.34, 0.34); hut(0.05, -0.2, 0.26, 0.24);
  if (owned) g.add(flag(x + 0.34, h, z - 0.1, 0xe23a2c, v.hq));
  if (v.hq) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.03, 6, 24), new THREE.MeshStandardMaterial({ color: 0xe8c05a, emissive: 0x5a4410 })); ring.rotation.x = Math.PI / 2; ring.position.set(x, h + 0.03, z); g.add(ring); }
  return g;
}
function structMesh(x, h, z, sh) {
  const g = new THREE.Group();
  if (sh.kind === "town") {
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x4c433a, roughness: 1 });
    const keep = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 1.1), wallMat); keep.position.set(x, h + 0.35, z); keep.castShadow = keep.receiveShadow = true; g.add(keep);
    const inner = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.5), new THREE.MeshStandardMaterial({ color: 0x2e2620 })); inner.position.set(x, h + 0.45, z); inner.castShadow = true; g.add(inner);
    g.add(flag(x + 0.3, h + 0.7, z, 0xf0ece0, false, true));
  } else if (sh.kind === "pillbox") {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 0.7, 6), new THREE.MeshStandardMaterial({ color: 0x2b2622, roughness: 1 })); t.position.set(x, h + 0.35, z); t.castShadow = true; g.add(t);
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.09, 0.5), new THREE.MeshStandardMaterial({ color: 0xe2483a, emissive: 0x701810 })); slit.position.set(x, h + 0.4, z); g.add(slit);
  } else if (sh.kind === "site") {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.3, 6), new THREE.MeshStandardMaterial({ color: 0x6a5a3a, roughness: 1, transparent: true, opacity: .6 })); t.position.set(x, h + 0.15, z); g.add(t);
  }
  return g;
}
function flag(x, y, z, col, hq, sun) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 5), new THREE.MeshStandardMaterial({ color: 0xcfc6b2 })); pole.position.set(x, y + 0.25, z); g.add(pole);
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.18), new THREE.MeshStandardMaterial({ color: col, side: THREE.DoubleSide, roughness: 1 })); cloth.position.set(x + 0.14, y + 0.4, z); g.add(cloth);
  if (sun) { const d = new THREE.Mesh(new THREE.CircleGeometry(0.05, 12), new THREE.MeshStandardMaterial({ color: 0xc8352a, side: THREE.DoubleSide })); d.position.set(x + 0.15, y + 0.4, z + 0.001); g.add(d); }
  return g;
}
function ring(q, r, col, op) { const m = new THREE.Mesh(new THREE.TorusGeometry(R * 0.8, 0.05, 8, 28), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op })); m.rotation.x = Math.PI / 2; const [x, z] = hexWorld(q, r); m.position.set(x, topY(q, r) + 0.06, z); return m; }
function hexCap(q, r, col, op) { const m = new THREE.Mesh(hexFlatGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false })); const [x, z] = hexWorld(q, r); m.position.set(x, topY(q, r) + 0.04, z); return m; }
function pathSeg(a, b) { const [ax, az] = hexWorld(a[0], a[1]), [bx, bz] = hexWorld(b[0], b[1]); const ay = topY(a[0], a[1]) + 0.1, by = topY(b[0], b[1]) + 0.1; const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(ax, ay, az), new THREE.Vector3(bx, by, bz)]); return new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffe9a0 })); }

// ── 拾取(区分点击/拖动) ──
let downPt = null;
function setupPicking() {
  const el = renderer.domElement, ray = new THREE.Raycaster(), m = new THREE.Vector2();
  el.addEventListener("pointerdown", e => { downPt = [e.clientX, e.clientY]; });
  el.addEventListener("pointerup", e => {
    if (!downPt) return; const moved = Math.abs(e.clientX - downPt[0]) + Math.abs(e.clientY - downPt[1]); downPt = null;
    if (moved > 6) return; // 拖动=旋转, 不算点击
    const rect = el.getBoundingClientRect();
    m.x = ((e.clientX - rect.left) / rect.width) * 2 - 1; m.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    ray.setFromCamera(m, camera);
    const hit = ray.intersectObjects(gTiles.children, false).find(h => h.object.userData && h.object.userData.q !== undefined);
    if (hit) { G().click(hit.object.userData.q, hit.object.userData.r); }
  });
}

function onResize() { if (!renderer) return; const w = host.clientWidth || innerWidth, h = host.clientHeight || innerHeight; renderer.setSize(w, h); if (composer) composer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); if (csm) csm.updateFrustums(); }
function loop() {
  animId = requestAnimationFrame(loop);
  clock = performance.now() / 1000;
  controls.update();
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
  renderer.dispose(); scene = null; renderer = null; sky = hemiLight = ambientLight = sunLight = null; inited = false; lastSig = "";
  for (const k in tiles) delete tiles[k];
  for (const k in revealAnims) delete revealAnims[k];
  tileVisPrev.clear();
}
function active() { return inited; }

export const TH3D = { init, dispose, active, focus, project, dbg };
if (typeof window !== "undefined") window.TH3D = TH3D;
