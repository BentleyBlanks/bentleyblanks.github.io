// 《太行·1941》3D 渲染(文明6式 2.5D) —— Three.js。读 window.TH 的游戏状态, 复用其点格逻辑。
// 地形: PCG 高度图六边棱柱 + 程序化纹理; 树木 PCG 实例化; 天空大气散射; 单位=朝相机贴图棋子。
import * as THREE from "three";
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
  plain:    { base: .08, amp: .05, top: "#8a923f", side: "#6a5836" },
  hills:    { base: .22, amp: .30, top: "#a88f3f", side: "#7a5f36" },
  forest:   { base: .12, amp: .10, top: "#4d6a2e", side: "#54502c" },
  mountain: { base: .40, amp: .70, top: "#9a9386", side: "#5c554a" },
};
function tileH() { return 0.5; } // 地块平整不起伏(0缝隙/边缘对齐); 山地靠山峰锥体表现, 且不可通行

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
  if (texCache[t]) return texCache[t];
  const N = 256; // 纹素精度 4x(64→256): 沙滩/草地近看更细腻
  const c = document.createElement("canvas"); c.width = c.height = N; const g = c.getContext("2d");
  g.fillStyle = TERR[t].top; g.fillRect(0, 0, N, N);
  // 双尺度斑点噪声(粗块+细粒)——4x 分辨率下细节密度同步提高
  for (let i = 0; i < 4400; i++) {
    const x = Math.random() * N, y = Math.random() * N, s = Math.random() * 6 + 1, v = (Math.random() - .5);
    g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 200 : 0},${Math.abs(v) * 0.16})`;
    g.fillRect(x, y, s, s);
  }
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * N, y = Math.random() * N, v = (Math.random() - .5);
    g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 190 : 0},${Math.abs(v) * 0.14})`;
    g.fillRect(x, y, 1, 1);
  }
  if (t === "forest") { g.fillStyle = "rgba(30,50,20,.3)"; for (let i = 0; i < 160; i++) { g.beginPath(); g.arc(Math.random() * N, Math.random() * N, 4 + Math.random() * 8, 0, 7); g.fill(); } }
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  texCache[t] = tex; return tex;
}
function tileMats(t) {
  if (matCache[t]) return matCache[t];
  const top = new THREE.MeshStandardMaterial({ map: terrainTex(t), roughness: .96, metalness: 0 });
  const side = new THREE.MeshStandardMaterial({ color: TERR[t].side, roughness: 1, metalness: 0 });
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
      .replace("#include <map_fragment>", "#include <map_fragment>\n{ float lum=dot(diffuseColor.rgb,vec3(0.299,0.587,0.114)); float sk=0.62+0.5*lum; float a1=abs(fract((vWp.x+vWp.z)*3.0)-0.5)*2.0; float a2=abs(fract((vWp.x-vWp.z)*3.0)-0.5)*2.0; if(lum<0.6&&a1<0.3) sk-=0.17; if(lum<0.38&&a2<0.3) sk-=0.15; diffuseColor.rgb=vec3(0.845,0.78,0.615)*sk; }");
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
const UGLYPH = { scout: "侦", work: "工", militia: "民", regular: "连", elite: "团", commando: "武", spy: "特", puppet: "伪", squad: "日", company: "中", armored: "装" };
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
  const posture = u.fortified ? "🛡" : u.resting ? "🛌" : (u.autoPath && u.autoPath.length ? "🚩" : "");
  const hpB = Math.ceil(Math.max(0, u.hp) / 10);
  const k = "ub_" + u.type + "_" + (posture ? posture : "-") + hpB + (u.side === "p" && u.mp > 0 ? "a" : "");
  if (texCache[k]) return texCache[k];
  const c = document.createElement("canvas"); c.width = 256; c.height = 104; const g = c.getContext("2d");
  const isP = u.side === "p";
  const badge = isP ? (u.layer === "civ" ? "#2f6b6b" : u.type === "commando" ? "#4a3a6a" : "#8a2a1a") : (u.type === "puppet" ? "#5f5628" : u.type === "spy" ? "#463a52" : "#961f13");
  const w = posture ? 190 : 130, x0 = 128 - w / 2;
  g.fillStyle = badge; roundRect(g, x0, 8, w, 82, 20); g.fill();
  g.strokeStyle = isP ? "rgba(240,220,180,.9)" : "rgba(230,120,110,.9)"; g.lineWidth = 5; g.stroke();
  g.fillStyle = "#f8eed8"; g.font = "800 56px 'Noto Sans SC',sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(posture ? (UGLYPH[u.type] || "兵") + posture : (UGLYPH[u.type] || "兵"), 128, u.hp < 100 ? 42 : 48);
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

  // 天空: 自定义梯度大气 shader(方向+太阳散射近似, toneMapped=false 避免曝光烧白)
  // 之前用 THREE.Sky(Preetham) 在高俯视角看向地平线下方会外推成纯白, 改用可控梯度天空
  const skyMat = new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: skyU, side: THREE.BackSide, depthWrite: false });
  skyMat.toneMapped = false;
  sky = new THREE.Mesh(new THREE.SphereGeometry(1600, 32, 16), skyMat); sky.renderOrder = -1; sky.frustumCulled = false; scene.add(sky);
  const sunPos = new THREE.Vector3(); sunPos.setFromSphericalCoords(1, DEG(90 - _sunElev), DEG(_sunAzi));

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

  // 羊皮纸桌面(Civ6风格): 地图外围与未探索区域露出纸面, 不再是天空的地平线下暗色
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ map: paperTex(), roughness: 1, metalness: 0 }));
  paper.rotation.x = -Math.PI / 2; paper.position.set(cx0, -0.02, cz0); paper.receiveShadow = true; scene.add(paper);

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
  if (csmCfg.enabled) buildCSM();     // 2级 CSM 阴影(默认开启; 可在 Debug 关)
  else { sunLight.visible = true; sunLight.castShadow = true; }
  setTOD(_tod);                       // 按当前昼夜时刻初始化太阳与天空色
  if (!atmoOn) applyAtmo(false);      // 若上次关了大气, 恢复 CubeMap
  loop();
  return true;
}

let peakMat, snowMat, peakMatS, snowMatS;
function buildTiles() {
  const s = G().state(), W = G().CFG.mapW, H = G().CFG.mapH;
  peakMat = new THREE.MeshStandardMaterial({ color: 0xa39c90, roughness: .92 });
  snowMat = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: .8 });
  peakMatS = sketchify(new THREE.MeshBasicMaterial({ color: 0xa39c90 }));
  snowMatS = sketchify(new THREE.MeshBasicMaterial({ color: 0xf2f2ee }));
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
      peak.castShadow = true; peak.receiveShadow = true; peak.userData = { q, r, h, decor: "peak" }; gTiles.add(peak);
      const cap = new THREE.Mesh(coneGeo, snowMat); cap.scale.set(0.56, ph * 0.5, 0.56); cap.position.set(x, h + ph * 0.76, z);
      cap.castShadow = true; cap.userData = { q, r, decor: "snow" }; gTiles.add(cap);
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
  return s.turn + "#" + d + "#" + (vis ? vis.size : 0) + "#" + u + "#" + (sel ? sel.kind + (sel.id || sel.q + "," + sel.r) : "-") + "#" + (pend ? pend.type + pend.q + "," + pend.r + (pend.path ? pend.path.length : 0) : "-") + "#" + (reach ? reach.size : 0) + "#" + st;
}
function clearGroup(g) { for (let i = g.children.length - 1; i >= 0; i--) { const c = g.children[i]; g.remove(c); if (c.geometry && c.geometry !== prismGeo && c.geometry !== hexFlatGeo && c.geometry !== treeTrunkGeo && c.geometry !== treeLeafGeo) c.geometry.dispose && c.geometry.dispose(); } }

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
  gTiles.children.forEach(m => {
    if (!m.userData || !m.userData.decor) return;
    const td = s.tiles[m.userData.q][m.userData.r]; m.visible = td.disc;
    const fog = td.disc && !visSet.has(m.userData.q + "," + m.userData.r);
    if ((m.userData.fogS || false) !== fog) { m.userData.fogS = fog; m.material = m.userData.decor === "snow" ? (fog ? snowMatS : snowMat) : (fog ? peakMatS : peakMat); m.castShadow = !fog; }
  });

  // 树木(PCG, 仅已探明的森林/丘陵)
  clearGroup(gTrees);
  const trunkMats = [], leafPos = [];
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4326, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f6a2a, roughness: 1 });
  let ti = 0; const dummy = new THREE.Object3D();
  const trunks = [], leaves = [], trunksF = [], leavesF = []; // F=素描(雾中)
  for (let q = 0; q < W; q++) for (let r = 0; r < H; r++) {
    const t = s.tiles[q][r]; if (!t.disc) continue;
    let n = t.terrain === "forest" ? 6 : (t.terrain === "hills" && h2(q * 1.7, r * 3.1) > 0.6 ? 2 : 0);
    if (!n) continue;
    const fog = !visSet.has(q + "," + r);
    const [x, z] = hexWorld(q, r), h = tiles[q + "," + r].h;
    for (let i = 0; i < n; i++) {
      const a = h2(q * 3.1 + i, r * 5.7) * 6.28, rad = 0.55 * h2(q + i * 0.3, r + i);
      const tx = x + Math.cos(a) * rad, tz = z + Math.sin(a) * rad, sc = 0.7 + h2(q * i + 1, r) * 0.6;
      (fog ? trunksF : trunks).push([tx, h + 0.15 * sc, tz, sc]); (fog ? leavesF : leaves).push([tx, h + 0.42 * sc, tz, sc]);
    }
  }
  const addInst = (geo, mat, arr, shadow) => {
    if (!arr.length) return;
    const im = new THREE.InstancedMesh(geo, mat, arr.length);
    arr.forEach((p, i) => { dummy.position.set(p[0], p[1], p[2]); dummy.scale.set(p[3], p[3], p[3]); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
    im.castShadow = shadow; gTrees.add(im);
  };
  addInst(treeTrunkGeo, trunkMat, trunks, true); addInst(treeLeafGeo, leafMat, leaves, true);
  addInst(treeTrunkGeo, sketchify(new THREE.MeshBasicMaterial({ color: 0x5a4326 })), trunksF, false);
  addInst(treeLeafGeo, sketchify(new THREE.MeshBasicMaterial({ color: 0x3f6a2a })), leavesF, false);

  // 建筑(村庄/县城/炮楼/铁路/地雷)
  clearGroup(gStruct);
  for (let q = 0; q < W; q++) for (let r = 0; r < H; r++) {
    const t = s.tiles[q][r]; if (!t.disc) continue;
    const [x, z] = hexWorld(q, r), h = tiles[q + "," + r].h;
    if (t.rail) gStruct.add(railTie(x, h, z));
    if (t.village) {
      gStruct.add(villageMesh(x, h, z, t.village));
      if (t.village.owner === "p") { // 总部/根据地村庄: Civ6式城市横幅
        const cb = new THREE.Sprite(new THREE.SpriteMaterial({ map: cityBannerTex(t.village), depthWrite: false, transparent: true }));
        cb.scale.set(2.4, 0.45, 1); cb.position.set(x, h + 1.85, z); cb.userData = { q, r };
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
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: unitTex(un), depthWrite: false, transparent: true }));
    const off = un.layer === "civ" ? -0.28 : 0.28;
    sp.scale.set(1.0, 1.0, 1); sp.position.set(x + off, h + 0.62, z); sp.userData = { q: un.q, r: un.r };
    gUnits.add(sp);
    // 头顶大横幅(Civ6式, 易辨认)
    const bn = new THREE.Sprite(new THREE.SpriteMaterial({ map: unitBannerTex(un), depthWrite: false, transparent: true }));
    bn.scale.set(1.5, 0.61, 1); bn.position.set(x + off, h + 1.35, z); bn.userData = { q: un.q, r: un.r };
    gUnits.add(bn);
  }

  // 高亮(选中/可达/路径/攻击)
  clearGroup(gOverlay);
  const sel = G().sel(), reach = G().reach(), pend = G().pending();
  const selU = sel && sel.kind === "unit" ? s.units.find(x => x.id === sel.id) : null;
  if (selU) gOverlay.add(ring(selU.q, selU.r, 0xffe9a0, 0.5));
  if (reach) for (const k of reach.keys()) { const [q, r] = k.split(",").map(Number); gOverlay.add(hexCap(q, r, 0x8fd24a, 0.14)); gOverlay.add(hexOutline(q, r, 0xcdff72)); }
  const drawPath3D = (path, stops) => {
    for (let i = 0; i < path.length - 1; i++) gOverlay.add(pathSeg(path[i], path[i + 1]));
    if (stops) for (const [bq, br, bt] of stops) { const sp = numSprite(bt); const [x, z] = hexWorld(bq, br); sp.position.set(x, topY(bq, br) + 0.45, z); gOverlay.add(sp); }
  };
  if (pend && (pend.type === "move" || pend.type === "movefar") && pend.path) {
    drawPath3D(pend.path, pend.stops);
    gOverlay.add(ring(pend.q, pend.r, 0xffe9a0, 0.9));
  }
  // 已下达的行军令(选中时): 路径+剩余回合数字
  if (selU && selU.autoPath && selU.autoPath.length && !(pend && pend.path) && G().pathTurns) {
    const full = [[selU.q, selU.r], ...selU.autoPath];
    drawPath3D(full, G().pathTurns(selU, full).stops);
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
  renderer.dispose(); scene = null; renderer = null; sky = hemiLight = ambientLight = sunLight = null; inited = false; lastSig = "";
  for (const k in tiles) delete tiles[k];
  for (const k in revealAnims) delete revealAnims[k];
  tileVisPrev.clear();
  // 清缓存: 重建时用全新材质(不带上一 CSM 的 onBeforeCompile 补丁), 避免 CSM 重建崩溃
  for (const k in matCache) delete matCache[k];
  for (const k in texCache) delete texCache[k];
  for (const k in sketchCache) delete sketchCache[k];
  _paperTex = null;
}
// 结构性重建(cascades/size/开关): 整个 3D 重来一遍最稳, 缓存已在 dispose 清空→材质全新
function reinit() { if (!inited || !host) return; const h = host; dispose(); init(h); }
function active() { return inited; }

export const TH3D = { init, dispose, active, focus, project, dbg };
if (typeof window !== "undefined") window.TH3D = TH3D;
