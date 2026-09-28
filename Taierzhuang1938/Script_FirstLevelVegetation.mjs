// 第一关植被：冬末干草簇 / 枯杂草 / 低矮灌木荆棘 / 河岸芦苇 / 零星绿芽的交叉面片。
// 撒点规则与卡片表在 Data_FirstLevelVegetation.mjs，口径 docs/Data_FirstLevelVegetationProps.md。
//
// 【合批】按 64 m 分区，每区把全部卡片烘成一份静态几何（位置 / 法线 / 图集 UV / 顶点色），
// 一区一个 draw call —— 比「每区 × 每种卡片一只 InstancedMesh」少一个数量级的提交
// （第一关的瓶颈是 CPU 提交，~21 µs/draw）。每区挂一只 THREE.LOD：近档全部卡片、远档
// 只留 ≥ farMinHeightM 的高卡、再远不画；距离切换由渲染器在投影时自己做，主循环里没有
// 每帧代码。半径按画质分档（VEGETATION_QUALITY）。
//
// 【MotionVector】静态几何 + 静态世界矩阵 = 规范里的「既有静态合批路径」，预通道自动写相机
// 速度；AlphaTest + map 的 UV0 裁切由预通道的覆盖材质逐 draw 接入（规范 2026-09-26 条），
// 预通道与主场景轮廓一致。**不做风摆**：自定义顶点位移在预通道覆盖材质里不存在，主场景
// 摆了而预通道不摆会让深度 / 法线 / 速度三张图对不上轮廓（规范「会动的实例、自定义顶点位移」
// 一行明确禁止用于近景）。以后要风摆，先给预通道补顶点补丁通路与前帧时间，再在这里加。
//
// 【光照】卡片法线大半朝上（0.75 上 + 0.25 面朝向），明暗跟地面走，不会背光一面发黑；
// 正反两面各自建三角形（FrontSide），不靠 DoubleSide 翻法线。根部顶点色压暗当接触 AO。
// 纯视觉：不投影、不进碰撞、不进 AI 视线。

import * as THREE from "three";
import { BuildSink } from "./Script_World.mjs";
import { CloneShadedMaterial } from "./Script_Materials.mjs";
import {
  VEGETATION, VEGETATION_ATLAS, VEGETATION_CARDS, VEGETATION_QUALITY, VEGETATION_TINT,
  PlanFirstLevelVegetation, MissionDressingContext,
} from "./Data_FirstLevelVegetation.mjs";

const LOADER = new THREE.TextureLoader();

/** 图集贴图（sRGB，mip + 各向异性）。失败返回 null，关卡照常建，只是没有植被。 */
export async function LoadFirstLevelVegetationAtlas(library) {
  try {
    const texture = await LOADER.loadAsync(VEGETATION_ATLAS.url);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = Math.min(8, library?.anisotropy || 1);
    texture.name = "Texture_FirstLevelVegetationAtlas";
    return texture;
  } catch (error) {
    console.warn("[FirstLevelVegetation] 图集读取失败，本关不画植被", error);
    return null;
  }
}

const UP = new THREE.Vector3(0, 1, 0);

/** 一批实例 → 一份几何。每件两张交叉面片、正反两面，共 16 顶点 8 三角。 */
function BakeCards(instances) {
  const count = instances.length;
  const positions = new Float32Array(count * 16 * 3), normals = new Float32Array(count * 16 * 3);
  const uvs = new Float32Array(count * 16 * 2), colors = new Float32Array(count * 16 * 3);
  const indices = count * 16 > 65535 ? new Uint32Array(count * 24) : new Uint16Array(count * 24);
  let v = 0, idx = 0;
  const face = new THREE.Vector3(), n = new THREE.Vector3();
  for (const it of instances) {
    const card = VEGETATION_CARDS[it.card];
    const h = card.heightM * it.scale, w = h * card.aspect;
    const [u0, v0, u1, v1] = card.uv;
    // 色调：干草偏暖到偏灰之间抖一点，整体亮度 0.8–1.05。
    const bright = 0.8 + it.tint * 0.25, warm = (it.tint * 7.31) % 1;
    const tint = [bright * (0.96 + warm * 0.06), bright * (0.97 + warm * 0.02), bright * (1.0 - warm * 0.06)];
    // 轻微倾斜：顶边沿面片方向错开，不让一片草地全是笔直的板。
    const lean = ((it.tint * 13.7) % 1 - 0.5) * 0.18 * h;
    for (let q = 0; q < 2; q++) {
      const a = it.yaw + q * Math.PI / 2, dx = Math.cos(a) * w / 2, dz = -Math.sin(a) * w / 2;
      face.set(Math.sin(a), 0, Math.cos(a));
      for (let side = 0; side < 2; side++) {
        const sign = side ? -1 : 1;
        n.copy(face).multiplyScalar(0.25 * sign).addScaledVector(UP, 0.75).normalize();
        const base = v;
        const corners = [[-1, 0], [1, 0], [1, 1], [-1, 1]];
        for (const [sx, top] of corners) {
          const o = v * 3, t = v * 2;
          const lx = sx * dx + (top ? Math.cos(a) * lean : 0), lz = sx * dz - (top ? Math.sin(a) * lean : 0);
          positions[o] = it.x + lx; positions[o + 1] = it.y - 0.03 + top * h; positions[o + 2] = it.z + lz;
          normals[o] = n.x; normals[o + 1] = n.y; normals[o + 2] = n.z;
          uvs[t] = sx < 0 ? u0 : u1; uvs[t + 1] = top ? v1 : v0;
          const ao = top ? 1 : 0.5;
          colors[o] = tint[0] * ao; colors[o + 1] = tint[1] * ao; colors[o + 2] = tint[2] * ao;
          v++;
        }
        // 正面逆时针（朝 face），背面反绕序。
        if (side === 0) indices.set([base, base + 1, base + 2, base, base + 2, base + 3], idx);
        else indices.set([base, base + 2, base + 1, base, base + 3, base + 2], idx);
        idx += 6;
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

export class FirstLevelVegetation {
  /**
   * @param {THREE.Scene} scene
   * @param {object} layout 正式第一关布局（MISSION_LAYOUT）
   * @param {MaterialLibrary} library
   * @param {THREE.Texture} atlas LoadFirstLevelVegetationAtlas 的结果
   * @param {(x:number,z:number)=>number} groundAt 地形高度（不含可走台面）
   * @param {string} quality 画质档（low / medium / high / ultra）
   */
  constructor(scene, layout, library, atlas, groundAt, quality = "high") {
    this.scene = scene;
    this.quality = VEGETATION_QUALITY[quality] ? quality : "high";
    const q = VEGETATION_QUALITY[this.quality];
    const started = typeof performance !== "undefined" ? performance.now() : 0;
    this.plan = PlanFirstLevelVegetation(MissionDressingContext(layout, groundAt), this.quality);
    const material = CloneShadedMaterial(library.Plain("FirstLevelVegetation", { color: 0xffffff, roughness: 0.96, metalness: 0 }));
    material.name = "FirstLevelVegetation";
    material.color.setRGB(...VEGETATION_TINT);
    material.map = atlas;
    material.alphaTest = 0.42;
    material.alphaToCoverage = !!q.alphaToCoverage;
    material.vertexColors = true;
    material.needsUpdate = true;
    this.material = material;
    this.root = new THREE.Group();
    this.root.name = "FirstLevelVegetation";
    const sectors = new Map();
    for (const it of this.plan.instances) {
      const key = `${Math.floor(it.x / VEGETATION.sectorM)}_${Math.floor(it.z / VEGETATION.sectorM)}`;
      if (!sectors.has(key)) sectors.set(key, []);
      sectors.get(key).push(it);
    }
    this.lods = [];
    this.stats = { instances: this.plan.instances.length, sectors: sectors.size, triangles: 0, farTriangles: 0,
      planned: this.plan.stats.planned, capped: this.plan.stats.capped, buildMs: 0 };
    // 合批走 BuildSink（仓库契约：新静态几何一律 BuildSink 分区合批），一区一只桶；
    // 预先烘好的单份几何进桶，合并时原样返回，顶点色不丢。
    const sink = new BuildSink();
    const farSink = new BuildSink();
    for (const [key, list] of sectors) {
      sink.SetSector(`Vegetation_${key}`).Add("FirstLevelVegetation", BakeCards(list));
      const far = list.filter((it) => VEGETATION_CARDS[it.card].heightM * it.scale >= VEGETATION.farMinHeightM);
      if (far.length) farSink.SetSector(`Vegetation_${key}`).Add("FirstLevelVegetation", BakeCards(far));
    }
    const holder = new THREE.Group();
    const resolve = () => material;
    const near = sink.Flush(holder, {}, { castShadow: false, receiveShadow: true, resolve });
    const farMeshes = new Map(farSink.Flush(holder, {}, { castShadow: false, receiveShadow: true, resolve })
      .map((mesh) => [mesh.name, mesh]));
    for (const mesh of near) {
      const box = mesh.geometry.boundingSphere;
      const lod = new THREE.LOD();
      lod.name = `FirstLevelVegetation_${mesh.name}`;
      lod.position.copy(box.center);
      mesh.position.copy(box.center).negate();
      mesh.name = `FirstLevelVegetation_Near_${mesh.name}`;
      lod.addLevel(mesh, 0, 0.06);
      const farMesh = farMeshes.get(mesh.name.replace("FirstLevelVegetation_Near_", ""));
      if (farMesh) {
        farMesh.position.copy(mesh.position);
        farMesh.name = `FirstLevelVegetation_Far_${farMesh.name}`;
        lod.addLevel(farMesh, q.nearM, 0.06);
        this.stats.farTriangles += farMesh.geometry.index.count / 3;
      } else lod.addLevel(new THREE.Object3D(), q.nearM, 0.06);
      lod.addLevel(new THREE.Object3D(), q.farM, 0.06);
      this.stats.triangles += mesh.geometry.index.count / 3;
      this.root.add(lod);
      this.lods.push(lod);
    }
    scene.add(this.root);
    this.stats.buildMs = started ? Math.round(performance.now() - started) : 0;
  }

  /** 编辑器 / 测试用：当前各档可见的区数（渲染器上一次投影时切的档）。 */
  VisibleCounts() {
    const out = { near: 0, far: 0, none: 0 };
    for (const lod of this.lods) {
      const level = lod.getCurrentLevel();
      out[level === 0 ? "near" : level === 1 && lod.levels.length === 3 ? "far" : "none"] += 1;
    }
    return out;
  }

  Dispose() {
    this.root.parent?.remove(this.root);
    this.root.traverse((object) => { if (object.isMesh) object.geometry.dispose(); });
    this.material.dispose();
    this.lods = [];
  }
}
