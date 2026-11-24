// 极简 COD 风格第一人称试枪靶场（只读检查场景）：
// - 明亮低噪点的清水混凝土靶道地坪（带 1 m 格缝与 5m/10m/15m/25m 距离标线）；
// - 两侧清水混凝土墙 + 3 m 间距立柱 + 1.62 m 眼高基准线（横移与蹲立立刻给出清晰视差与高度参照）；
// - 顶部格栅天窗梁（射手正上方完全敞开吃满昼光，前方靶道投下等距光影条纹）；
// - 低矮射击台 + 10 m 暖象牙高对比归零靶板（记弹孔）+ 7 m / 15 m / 24 m 弹簧摆动人形钢靶。

import * as THREE from "three";
import { ApplyPatches, IndirectLightingPatches } from "../Script_MaterialPatches.mjs";

const BAY_HALF_W = 4.8;
const BAY_WALL_H = 4.6;
const BAY_Z_NEAR = 5.5;
const BAY_Z_FAR = -35.5;
const EYE_DATUM_Y = 1.62;

function MakeCanvasTexture(width, height, draw, { repeatX = 1, repeatY = 1, anisotropy = 8 } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  draw(ctx, width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = repeatX > 1 ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.wrapT = repeatY > 1 ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

function CreateConcreteFloorTexture(anisotropy) {
  return MakeCanvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = "#b8bbb2";
    ctx.fillRect(0, 0, w, h);
    // 细微混凝土颗粒，低对比不抢枪身视线
    let seed = 19381;
    const Rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };
    for (let i = 0; i < 4200; i += 1) {
      const x = Rand() * w;
      const y = Rand() * h;
      const s = 1 + Rand() * 2.4;
      const v = 172 + Math.floor((Rand() - 0.5) * 26);
      ctx.fillStyle = `rgba(${v},${v + 2},${v - 2},0.35)`;
      ctx.fillRect(x, y, s, s);
    }
    // 2x2 清水混凝土板块拼缝（每格 1m）
    ctx.strokeStyle = "rgba(84, 88, 82, 0.42)";
    ctx.lineWidth = 2;
    for (const p of [0, w * 0.5]) {
      ctx.beginPath();
      ctx.moveTo(p, 0); ctx.lineTo(p, h);
      ctx.moveTo(0, p); ctx.lineTo(w, p);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(232, 234, 228, 0.28)";
    ctx.lineWidth = 1;
    for (const p of [2, w * 0.5 + 2]) {
      ctx.beginPath();
      ctx.moveTo(p, 0); ctx.lineTo(p, h);
      ctx.moveTo(0, p); ctx.lineTo(w, p);
      ctx.stroke();
    }
  }, { repeatX: 5, repeatY: 20, anisotropy });
}

function CreateConcreteWallTexture(anisotropy) {
  return MakeCanvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = "#c3c5bd";
    ctx.fillRect(0, 0, w, h);
    let seed = 41923;
    const Rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };
    for (let i = 0; i < 3200; i += 1) {
      const x = Rand() * w;
      const y = Rand() * h;
      const v = 185 + Math.floor((Rand() - 0.5) * 24);
      ctx.fillStyle = `rgba(${v},${v + 1},${v - 3},0.28)`;
      ctx.fillRect(x, y, 2, 2);
    }
    // 清水混凝土模板横纵缝 + 穿墙螺栓孔
    ctx.strokeStyle = "rgba(88, 92, 86, 0.32)";
    ctx.lineWidth = 2;
    for (const y of [h * 0.25, h * 0.5, h * 0.75]) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    for (const x of [0, w * 0.5]) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    ctx.fillStyle = "rgba(76, 80, 74, 0.45)";
    for (const y of [h * 0.125, h * 0.375, h * 0.625, h * 0.875]) {
      for (const x of [w * 0.14, w * 0.36, w * 0.64, w * 0.86]) {
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
      }
    }
  }, { repeatX: 10, repeatY: 2, anisotropy });
}

function CreateTimberBackstopTexture(anisotropy) {
  return MakeCanvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = "#8a745d";
    ctx.fillRect(0, 0, w, h);
    const slats = 16;
    const sh = h / slats;
    for (let i = 0; i < slats; i += 1) {
      const shade = 122 + ((i * 19) % 24) - 12;
      ctx.fillStyle = `rgb(${shade + 16}, ${shade}, ${shade - 18})`;
      ctx.fillRect(0, i * sh + 2, w, sh - 4);
      ctx.fillStyle = "rgba(32, 26, 20, 0.55)";
      ctx.fillRect(0, i * sh, w, 3);
    }
  }, { repeatX: 3, repeatY: 2, anisotropy });
}

function CreateDistanceBandTexture(label, anisotropy) {
  return MakeCanvasTexture(512, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(44, 49, 54, 0.78)";
    ctx.fillRect(0, h * 0.44, w, 12);
    ctx.fillStyle = "#d9a94e";
    ctx.fillRect(w * 0.38, h * 0.18, w * 0.24, h * 0.64);
    ctx.fillStyle = "#191e23";
    ctx.font = "700 44px Consolas, 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, w * 0.5, h * 0.52);
  }, { anisotropy });
}

function CreateCalibrationBoardTexture(anisotropy) {
  return MakeCanvasTexture(1024, 768, (ctx, w, h) => {
    // 暖象牙高对比底板：深蓝钢机械瞄具贴在上面极其清晰，且不会过曝泛白
    ctx.fillStyle = "#e6e2d5";
    ctx.fillRect(0, 0, w, h);

    // 柔和内框
    ctx.strokeStyle = "#2b3036";
    ctx.lineWidth = 10;
    ctx.strokeRect(18, 18, w - 36, h - 36);

    // 顶部标头条
    ctx.fillStyle = "#262c32";
    ctx.fillRect(22, 22, w - 44, 62);
    ctx.fillStyle = "#e6e2d5";
    ctx.font = "600 28px 'Microsoft YaHei UI', 'Segoe UI', sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("10M · 铁瞄归零与散步校准靶", 48, 54);
    ctx.fillStyle = "#d9a94e";
    ctx.font = "600 24px Consolas, monospace";
    ctx.textAlign = "right";
    ctx.fillText("EYE 1.62M  |  1 GRID = 10 CM", w - 48, 54);

    // 瞄准中心在画布垂直 54% 处（严格对齐 1.62m 眼高）
    const cx = w * 0.5;
    const cy = h * 0.54;
    const pxPer10Cm = 62;

    // 10cm 细网格
    ctx.strokeStyle = "rgba(42, 48, 56, 0.16)";
    ctx.lineWidth = 1.5;
    for (let dx = -7; dx <= 7; dx += 1) {
      const x = cx + dx * pxPer10Cm;
      if (x < 34 || x > w - 34) continue;
      ctx.beginPath(); ctx.moveTo(x, 96); ctx.lineTo(x, h - 34); ctx.stroke();
    }
    for (let dy = -5; dy <= 4; dy += 1) {
      const y = cy + dy * pxPer10Cm;
      if (y < 96 || y > h - 34) continue;
      ctx.beginPath(); ctx.moveTo(34, y); ctx.lineTo(w - 34, y); ctx.stroke();
    }

    // 同心环
    const rings = [
      { r: pxPer10Cm * 3.0, stroke: "#3a424b", width: 2.5 },
      { r: pxPer10Cm * 2.0, stroke: "#2d343c", width: 3 },
      { r: pxPer10Cm * 1.0, stroke: "#1f252b", width: 3.5 },
      { r: pxPer10Cm * 0.42, stroke: "#c44530", width: 3.5 },
    ];
    for (const ring of rings) {
      ctx.strokeStyle = ring.stroke;
      ctx.lineWidth = ring.width;
      ctx.beginPath();
      ctx.arc(cx, cy, ring.r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 主十字基准线
    ctx.strokeStyle = "#262c32";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(46, cy); ctx.lineTo(cx - 28, cy);
    ctx.moveTo(cx + 28, cy); ctx.lineTo(w - 46, cy);
    ctx.moveTo(cx, 108); ctx.lineTo(cx, cy - 28);
    ctx.moveTo(cx, cy + 28); ctx.lineTo(cx, h - 46);
    ctx.stroke();

    // 中心高对比菱形靶心（朱砂红 + 深炭核心）
    ctx.fillStyle = "#c44530";
    ctx.beginPath();
    ctx.moveTo(cx, cy - 24);
    ctx.lineTo(cx + 24, cy);
    ctx.lineTo(cx, cy + 24);
    ctx.lineTo(cx - 24, cy);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#181c20";
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fill();

    // 刻度标注
    ctx.fillStyle = "#48525c";
    ctx.font = "600 18px Consolas, monospace";
    ctx.textAlign = "center";
    for (const k of [-3, -2, -1, 1, 2, 3]) {
      ctx.fillText(`${k > 0 ? "+" : ""}${k * 10}`, cx + k * pxPer10Cm, cy + 26);
    }
  }, { anisotropy });
}

function CreateSilhouetteTexture(distanceLabel, anisotropy) {
  return MakeCanvasTexture(512, 768, (ctx, w, h) => {
    ctx.fillStyle = "#ddd9cb";
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "#2b3138";
    ctx.lineWidth = 8;
    ctx.strokeRect(12, 12, w - 24, h - 24);

    // 顶部距离牌
    ctx.fillStyle = "#262d34";
    ctx.fillRect(16, 16, w - 32, 54);
    ctx.fillStyle = "#d9a94e";
    ctx.font = "700 32px Consolas, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(distanceLabel, w * 0.5, 44);

    // 人形轮廓（深炭灰底 + 浅灰环线）
    ctx.fillStyle = "#2d343b";
    // 头部
    ctx.beginPath();
    ctx.ellipse(w * 0.5, 168, 56, 70, 0, 0, Math.PI * 2);
    ctx.fill();
    // 躯干与肩部
    ctx.beginPath();
    ctx.moveTo(w * 0.5 - 64, 232);
    ctx.lineTo(w * 0.5 + 64, 232);
    ctx.quadraticCurveTo(w * 0.5 + 168, 250, w * 0.5 + 178, 344);
    ctx.lineTo(w * 0.5 + 164, h - 24);
    ctx.lineTo(w * 0.5 - 164, h - 24);
    ctx.lineTo(w * 0.5 - 178, 344);
    ctx.quadraticCurveTo(w * 0.5 - 168, 250, w * 0.5 - 64, 232);
    ctx.closePath();
    ctx.fill();

    // 胸口得分环与中心点
    const cx = w * 0.5;
    const cy = 410;
    ctx.strokeStyle = "rgba(235, 232, 220, 0.72)";
    ctx.lineWidth = 3;
    for (const r of [112, 68]) {
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = "#c94b34";
    ctx.beginPath(); ctx.arc(cx, cy, 24, 0, Math.PI * 2); ctx.fill();
    // 头部中心环
    ctx.strokeStyle = "rgba(235, 232, 220, 0.65)";
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(cx, 168, 28, 0, Math.PI * 2); ctx.stroke();
  }, { anisotropy });
}

export class FirstPersonRangeScene {
  constructor(base) {
    this.base = base;
    this.root = new THREE.Group();
    this.root.name = "FirstPersonFiringRange";
    this.resources = [];
    this.colliders = [];
    this.reactiveTargets = [];
    this.impactDecals = [];
    this.raycaster = new THREE.Raycaster();
    this.calibrationBoard = null;
    this.maxDecals = 42;

    this._Build();
    base.scene.add(this.root);
  }

  _Track(...items) {
    for (const it of items) if (it) this.resources.push(it);
  }

  _StdMat(params) {
    const mat = new THREE.MeshStandardMaterial(params);
    if (this.base.ssao) {
      ApplyPatches(mat, IndirectLightingPatches({ ssao: this.base.ssao, gi: null, ssr: null }));
    }
    this._Track(mat);
    return mat;
  }

  _AddMesh(geo, mat, { pos = [0, 0, 0], rot = [0, 0, 0], cast = false, receive = true, parent = this.root, surface = null } = {}) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.rotation.set(rot[0], rot[1], rot[2]);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    parent.add(mesh);
    if (surface) {
      mesh.userData.rangeSurface = surface;
      this.colliders.push(mesh);
    }
    return mesh;
  }

  _Build() {
    const aniso = Math.min(8, this.base.renderer?.capabilities?.getMaxAnisotropy?.() || 4);
    const floorTex = CreateConcreteFloorTexture(aniso);
    const wallTex = CreateConcreteWallTexture(aniso);
    const timberTex = CreateTimberBackstopTexture(aniso);
    this._Track(floorTex, wallTex, timberTex);

    const concreteFloorMat = this._StdMat({ map: floorTex, roughness: 0.88, metalness: 0.02 });
    const concreteWallMat = this._StdMat({ map: wallTex, roughness: 0.84, metalness: 0.02 });
    const pilasterMat = this._StdMat({ color: 0xb2b5ad, roughness: 0.82, metalness: 0.04 });
    const kickboardMat = this._StdMat({ color: 0x3b4248, roughness: 0.78, metalness: 0.08 });
    const datumStripeMat = this._StdMat({ color: 0xc89a45, roughness: 0.62, metalness: 0.06 });
    const darkSteelMat = this._StdMat({ color: 0x2e343a, roughness: 0.52, metalness: 0.65 });
    const benchWoodMat = this._StdMat({ color: 0x7e6248, roughness: 0.66, metalness: 0.04 });
    const brassMat = this._StdMat({ color: 0xc9a354, roughness: 0.34, metalness: 0.82 });
    const timberBackstopMat = this._StdMat({ map: timberTex, roughness: 0.86, metalness: 0.02 });

    const bayLen = BAY_Z_NEAR - BAY_Z_FAR;
    const bayMidZ = (BAY_Z_NEAR + BAY_Z_FAR) * 0.5;

    // 1. 清水混凝土靶道地坪
    const floorGeo = new THREE.PlaneGeometry(BAY_HALF_W * 2 + 0.8, bayLen);
    this._Track(floorGeo);
    this._AddMesh(floorGeo, concreteFloorMat, {
      pos: [0, 0, bayMidZ], rot: [-Math.PI / 2, 0, 0], cast: false, receive: true, surface: "brick",
    });

    // 射击线黄黑标线（z = -1.05）+ 左右通道引导线
    const lineStripeGeo = new THREE.PlaneGeometry(BAY_HALF_W * 2 - 0.8, 0.10);
    this._Track(lineStripeGeo);
    this._AddMesh(lineStripeGeo, datumStripeMat, {
      pos: [0, 0.004, -1.05], rot: [-Math.PI / 2, 0, 0], receive: true,
    });

    const laneGuideGeo = new THREE.PlaneGeometry(0.055, bayLen - 7);
    this._Track(laneGuideGeo);
    for (const x of [-1.45, 1.45]) {
      this._AddMesh(laneGuideGeo, kickboardMat, {
        pos: [x, 0.003, bayMidZ - 1.5], rot: [-Math.PI / 2, 0, 0], receive: true,
      });
    }

    // 地面距离标牌（5M / 10M / 15M / 25M）
    const bandGeo = new THREE.PlaneGeometry(3.2, 0.72);
    this._Track(bandGeo);
    for (const dist of [5, 10, 15, 25]) {
      const tex = CreateDistanceBandTexture(`${dist}M`, aniso);
      this._Track(tex);
      const mat = this._StdMat({ map: tex, transparent: true, roughness: 0.85, metalness: 0, depthWrite: false });
      this._AddMesh(bandGeo, mat, {
        pos: [0, 0.006, -dist + 0.55], rot: [-Math.PI / 2, 0, 0], receive: true,
      });
    }

    // 2. 两侧清水混凝土墙 + 踢脚线 + 1.62m 眼高基准横带 + 等距立柱（横移视差极佳）
    const wallGeo = new THREE.BoxGeometry(0.32, BAY_WALL_H, bayLen);
    const kickGeo = new THREE.BoxGeometry(0.06, 0.42, bayLen);
    const datumGeo = new THREE.BoxGeometry(0.03, 0.055, bayLen - 2);
    const pilasterGeo = new THREE.BoxGeometry(0.32, BAY_WALL_H, 0.34);
    this._Track(wallGeo, kickGeo, datumGeo, pilasterGeo);

    for (const side of [-1, 1]) {
      const wx = side * (BAY_HALF_W + 0.16);
      this._AddMesh(wallGeo, concreteWallMat, { pos: [wx, BAY_WALL_H * 0.5, bayMidZ], cast: true, receive: true, surface: "brick" });
      this._AddMesh(kickGeo, kickboardMat, { pos: [side * (BAY_HALF_W - 0.01), 0.21, bayMidZ], receive: true });
      // 1.62m 眼高基准线（站立平视刚好重合，蹲伏时视线明显落到基准线下方）
      this._AddMesh(datumGeo, datumStripeMat, { pos: [side * (BAY_HALF_W - 0.01), EYE_DATUM_Y, bayMidZ], receive: true });

      for (let z = 3.0; z >= BAY_Z_FAR + 2.0; z -= 3.0) {
        this._AddMesh(pilasterGeo, pilasterMat, {
          pos: [side * (BAY_HALF_W - 0.12), BAY_WALL_H * 0.5, z], cast: true, receive: true, surface: "brick",
        });
      }
    }

    // 后墙（防止外部环绕视角看到空虚地平线）
    const rearWallGeo = new THREE.BoxGeometry(BAY_HALF_W * 2 + 0.64, BAY_WALL_H, 0.32);
    this._Track(rearWallGeo);
    this._AddMesh(rearWallGeo, concreteWallMat, {
      pos: [0, BAY_WALL_H * 0.5, BAY_Z_NEAR + 0.16], cast: true, receive: true, surface: "brick",
    });

    // 3. 顶部开放天窗格栅梁（射手正上方 z > -2.5 敞开吃满阳光，前方每 4m 一根横梁形成建筑节奏阴影）
    const beamGeo = new THREE.BoxGeometry(BAY_HALF_W * 2 + 0.3, 0.34, 0.36);
    const corniceGeo = new THREE.BoxGeometry(0.46, 0.34, bayLen);
    this._Track(beamGeo, corniceGeo);
    for (const side of [-1, 1]) {
      this._AddMesh(corniceGeo, pilasterMat, { pos: [side * (BAY_HALF_W - 0.05), BAY_WALL_H - 0.17, bayMidZ], cast: true, receive: true });
    }
    for (let z = -3.2; z >= BAY_Z_FAR + 1.5; z -= 4.0) {
      this._AddMesh(beamGeo, pilasterMat, { pos: [0, BAY_WALL_H - 0.17, z], cast: true, receive: true });
    }

    // 4. 远端防弹原木格栅止弹墙（z = -35.5）
    const backstopGeo = new THREE.BoxGeometry(BAY_HALF_W * 2, BAY_WALL_H, 0.5);
    this._Track(backstopGeo);
    this._AddMesh(backstopGeo, timberBackstopMat, {
      pos: [0, BAY_WALL_H * 0.5, BAY_Z_FAR], cast: false, receive: true, surface: "wood",
    });

    // 5. 极简射击工作台（z = -1.48，高度 0.86m，不挡蹲姿与腰射，但稳稳托出尺度感）
    const benchBaseGeo = new THREE.BoxGeometry(5.6, 0.80, 0.46);
    const benchTopGeo = new THREE.BoxGeometry(5.8, 0.06, 0.58);
    const trayGeo = new THREE.BoxGeometry(0.42, 0.025, 0.24);
    const roundGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.072, 8);
    this._Track(benchBaseGeo, benchTopGeo, trayGeo, roundGeo);
    this._AddMesh(benchBaseGeo, pilasterMat, { pos: [0, 0.40, -1.50], cast: true, receive: true, surface: "brick" });
    this._AddMesh(benchTopGeo, benchWoodMat, { pos: [0, 0.83, -1.50], cast: true, receive: true, surface: "wood" });
    this._AddMesh(trayGeo, darkSteelMat, { pos: [1.32, 0.873, -1.48], cast: true, receive: true });
    for (let i = 0; i < 5; i += 1) {
      this._AddMesh(roundGeo, brassMat, {
        pos: [1.24 + i * 0.022, 0.893, -1.48], rot: [Math.PI / 2, 0, 0.12], cast: true, receive: true,
      });
    }

    // 6. 中央 10M 高对比归零校准靶（中心严格落在 y = 1.62m 眼高）
    this._BuildCalibrationTarget(aniso, darkSteelMat);

    // 7. 纵深弹簧摆动人形钢靶（7M 左近 / 15M 右中 / 24M 左远）
    this._BuildReactiveSilhouette({ x: -2.05, z: -7.0, label: "7M", scale: 0.94, aniso, darkSteelMat });
    this._BuildReactiveSilhouette({ x: 2.15, z: -15.0, label: "15M", scale: 1.0, aniso, darkSteelMat });
    this._BuildReactiveSilhouette({ x: -1.35, z: -24.0, label: "24M", scale: 1.08, aniso, darkSteelMat });
  }

  _BuildCalibrationTarget(aniso, steelMat) {
    const z = -10.0;
    const boardW = 1.64;
    const boardH = 1.23;
    // 画布瞄准中心在 cy = 0.54 * h → 距底边 0.46 * boardH → 板中心高度 = 1.62 + 0.04 * boardH
    const boardCenterY = EYE_DATUM_Y + 0.04 * boardH;
    const tex = CreateCalibrationBoardTexture(aniso);
    this._Track(tex);
    const boardMat = this._StdMat({ map: tex, roughness: 0.88, metalness: 0.02 });
    const backMat = this._StdMat({ color: 0x3b4248, roughness: 0.78, metalness: 0.15 });

    const group = new THREE.Group();
    group.position.set(0, 0, z);
    this.root.add(group);

    const postGeo = new THREE.BoxGeometry(0.065, boardCenterY + boardH * 0.5 + 0.06, 0.065);
    const footGeo = new THREE.BoxGeometry(0.12, 0.05, 0.66);
    const crossBarGeo = new THREE.BoxGeometry(boardW + 0.14, 0.06, 0.055);
    const backingGeo = new THREE.BoxGeometry(boardW, boardH, 0.04);
    const faceGeo = new THREE.PlaneGeometry(boardW, boardH);
    this._Track(postGeo, footGeo, crossBarGeo, backingGeo, faceGeo);

    for (const sx of [-1, 1]) {
      const px = sx * (boardW * 0.5 + 0.04);
      this._AddMesh(postGeo, steelMat, { pos: [px, (boardCenterY + boardH * 0.5 + 0.06) * 0.5, 0], cast: true, receive: true, parent: group, surface: "metal" });
      this._AddMesh(footGeo, steelMat, { pos: [px, 0.025, 0], cast: true, receive: true, parent: group });
    }
    this._AddMesh(crossBarGeo, steelMat, { pos: [0, boardCenterY - boardH * 0.5 - 0.03, 0], cast: true, receive: true, parent: group });
    this._AddMesh(backingGeo, backMat, { pos: [0, boardCenterY, -0.022], cast: true, receive: true, parent: group, surface: "wood" });
    const face = this._AddMesh(faceGeo, boardMat, { pos: [0, boardCenterY, 0.002], cast: false, receive: true, parent: group, surface: "wood" });
    face.userData.isCalibrationBoard = true;
    this.calibrationBoard = face;
  }

  _BuildReactiveSilhouette({ x, z, label, scale = 1, aniso, darkSteelMat }) {
    const tex = CreateSilhouetteTexture(label, aniso);
    this._Track(tex);
    const plateMat = this._StdMat({ map: tex, roughness: 0.72, metalness: 0.14 });
    const hitFlashMat = new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0, depthWrite: false });
    this._Track(hitFlashMat);

    const anchor = new THREE.Group();
    anchor.position.set(x, 0, z);
    this.root.add(anchor);

    const baseGeo = new THREE.BoxGeometry(0.76 * scale, 0.10, 0.52);
    const pivot = new THREE.Group();
    pivot.position.set(0, 0.10, 0);
    anchor.add(pivot);

    const stemGeo = new THREE.BoxGeometry(0.08 * scale, 0.62, 0.06);
    const w = 0.68 * scale;
    const h = 1.04 * scale;
    const plateGeo = new THREE.BoxGeometry(w, h, 0.036);
    const faceGeo = new THREE.PlaneGeometry(w, h);
    const flashGeo = new THREE.RingGeometry(0.06 * scale, 0.16 * scale, 24);
    this._Track(baseGeo, stemGeo, plateGeo, faceGeo, flashGeo);

    this._AddMesh(baseGeo, darkSteelMat, { pos: [0, 0.05, 0], cast: true, receive: true, parent: anchor, surface: "metal" });
    this._AddMesh(stemGeo, darkSteelMat, { pos: [0, 0.31, 0], cast: true, receive: true, parent: pivot, surface: "metal" });
    const plateBody = this._AddMesh(plateGeo, darkSteelMat, { pos: [0, 0.62 + h * 0.5, 0], cast: true, receive: true, parent: pivot, surface: "metal" });
    const face = this._AddMesh(faceGeo, plateMat, { pos: [0, 0.62 + h * 0.5, 0.020], cast: false, receive: true, parent: pivot, surface: "metal" });
    const flash = new THREE.Mesh(flashGeo, hitFlashMat);
    flash.position.set(0, 0.62 + h * 0.5, 0.025);
    pivot.add(flash);

    const target = {
      label,
      pivot,
      angle: 0,
      vel: 0,
      flashMat: hitFlashMat,
      flashMesh: flash,
      flashT: 0,
    };
    plateBody.userData.reactiveTarget = target;
    face.userData.reactiveTarget = target;
    this.reactiveTargets.push(target);
  }

  _EnsureHoleAssets() {
    if (!this._holeGeo) {
      this._holeGeo = new THREE.CircleGeometry(0.016, 12);
      this._holeMat = new THREE.MeshBasicMaterial({ color: 0x141618, polygonOffset: true, polygonOffsetFactor: -2 });
      this._Track(this._holeGeo, this._holeMat);
    }
  }

  /** 预热用弹孔代理：与真弹孔同一份几何 / 材质，不进 impactDecals。 */
  CreateWarmProxy() {
    this._EnsureHoleAssets();
    return new THREE.Mesh(this._holeGeo, this._holeMat);
  }

  _SpawnBulletHole(point, normal) {
    this._EnsureHoleAssets();
    const mesh = new THREE.Mesh(this._holeGeo, this._holeMat);
    mesh.position.copy(point).addScaledVector(normal, 0.004);
    mesh.lookAt(point.x + normal.x, point.y + normal.y, point.z + normal.z);
    this.root.add(mesh);
    this.impactDecals.push(mesh);
    if (this.impactDecals.length > this.maxDecals) {
      const oldest = this.impactDecals.shift();
      oldest?.removeFromParent();
    }
  }

  ClearBulletHoles() {
    for (const m of this.impactDecals) m.removeFromParent();
    this.impactDecals.length = 0;
  }

  /** 对靶场所有实体与靶板做一次射线求交；击中钢靶触发弹簧后仰与闪光，击中归零靶留弹孔。 */
  RaycastShot(origin, direction) {
    this.root.updateMatrixWorld(true);
    this.raycaster.set(origin, direction);
    this.raycaster.near = 0.05;
    this.raycaster.far = 90;
    const hits = this.raycaster.intersectObjects(this.colliders, false);
    if (!hits.length) return null;
    const hit = hits[0];
    const obj = hit.object;
    const normal = hit.face ? hit.face.normal.clone().transformDirection(obj.matrixWorld).normalize() : new THREE.Vector3(0, 0, 1);
    const surface = obj.userData.rangeSurface || "brick";

    if (obj.userData.isCalibrationBoard) {
      this._SpawnBulletHole(hit.point, normal);
    }
    const target = obj.userData.reactiveTarget;
    if (target) {
      target.vel = Math.max(target.vel, 5.2);
      target.flashT = 1;
      const localPt = target.pivot.worldToLocal(hit.point.clone());
      target.flashMesh.position.set(localPt.x, localPt.y, 0.028);
    }
    return {
      point: hit.point.clone(),
      normal,
      distance: hit.distance,
      surface,
      targetLabel: target?.label || (obj.userData.isCalibrationBoard ? "10M" : null),
    };
  }

  Update(dt) {
    const step = Math.min(0.05, Math.max(0, dt));
    for (const target of this.reactiveTargets) {
      // 阻尼弹簧回归：击中后迅速向后仰 ~26°，再弹回略微晃动
      const k = 42;
      const d = 8.2;
      const acc = -k * target.angle - d * target.vel;
      target.vel += acc * step;
      target.angle = THREE.MathUtils.clamp(target.angle + target.vel * step, -0.14, 0.55);
      target.pivot.rotation.x = -target.angle;
      if (target.flashT > 0) {
        target.flashT = Math.max(0, target.flashT - step * 4.5);
        target.flashMat.opacity = target.flashT * 0.92;
        const s = 0.7 + (1 - target.flashT) * 0.9;
        target.flashMesh.scale.set(s, s, 1);
      }
    }
  }

  Dispose() {
    this.ClearBulletHoles();
    this.root.removeFromParent();
    for (const res of new Set(this.resources)) res?.dispose?.();
    this.resources.length = 0;
    this.colliders.length = 0;
    this.reactiveTargets.length = 0;
  }
}
