// 第一关策划白盒场景：**唯一可见环境就是接受光照的白色长方体**。
//
// 它与 TengxianField / JieheField / RangeField 实现同一套战场查询接口，但不调用
// 城、城外、道路、植被、贴图或外部资产生成器。所有静态体块先进入 BuildSink 合批；
// 两扇剧情门保留为独立 Mesh，收到正式第一章信号后升起并同步移除 Rapier 碰撞体。
//
// GroundHeight 恒为 0，视觉地皮是一只顶面恰好落在 y=0 的白盒。因而看到的地、
// 玩家踩的地、AI 导航问的地三者天然一致。

import * as THREE from "three";
import { Clamp } from "./Script_Noise.mjs";
import { RayAabb, MakeBox, PlaceGeometry } from "./Script_Geo.mjs";
import { BuildSink } from "./Script_World.mjs";
import {
  FIRST_LEVEL_WHITEBOX_LAYOUT,
} from "./Data_FirstLevelWhitebox.mjs";

const GRID_SIZE = 12;
const CAMERA_FAR = 430;

function MakeWhiteMaterial(name = "FirstLevelWhiteboxWhite") {
  const material = new THREE.MeshStandardMaterial({
    name,
    color: 0xffffff,
    roughness: 0.88,
    metalness: 0,
  });
  material.userData.firstLevelWhitebox = true;
  return material;
}

/** 把 frozen 的布局规格翻成可挂物理 handle 的碰撞记录。 */
function ColliderRecord(spec) {
  const hx = spec.w * 0.5;
  const hy = spec.h * 0.5;
  const hz = spec.d * 0.5;
  const ry = spec.ry || 0;
  const ax = Math.abs(Math.cos(ry)) * hx + Math.abs(Math.sin(ry)) * hz;
  const az = Math.abs(Math.sin(ry)) * hx + Math.abs(Math.cos(ry)) * hz;
  return {
    min: [spec.x - ax, spec.y - hy, spec.z - az],
    max: [spec.x + ax, spec.y + hy, spec.z + az],
    c: [spec.x, spec.y, spec.z],
    h: [hx, hy, hz],
    ry,
    tag: spec.tag || "whiteboxWall",
  };
}

export class FirstLevelWhiteboxField {
  constructor(scene, _library, { bounds = null, zones = [], levelId = null } = {}) {
    this.scene = scene;
    this.levelId = levelId;
    this.layout = FIRST_LEVEL_WHITEBOX_LAYOUT;
    this.bounds = bounds
      ? { minX: bounds.minX, maxX: bounds.maxX, minZ: bounds.minZ, maxZ: bounds.maxZ }
      : { ...this.layout.bounds };
    this.cameraFar = CAMERA_FAR;
    this.wallTopY = null;
    this.physics = null;
    this.meshes = [];
    this.colliders = [];
    this.covers = [];
    this.grid = new Map();
    this.gridSize = GRID_SIZE;
    this.generatedExternalProps = [];
    this.objectives = zones.map((zone, index) => ({
      ...zone,
      index,
      owner: "nra",
      progress: 1,
      contested: false,
      reached: false,
    }));
    this.whiteMaterial = MakeWhiteMaterial();
    this.gates = new Map();
    this.stats = {
      groundChunks: 0,
      groundTris: 0,
      structures: 0,
      whiteBoxes: 0,
      dynamicGates: 0,
    };
  }

  GroundHeight(_x, _z) { return 0; }

  BuildWhiteBoxes() {
    const sink = new BuildSink();
    sink.SetSector("FirstLevelWhitebox");
    const ground = this.layout.ground;
    sink.Add("Whitebox", PlaceGeometry(MakeBox(ground.w, ground.h, ground.d, 1,
      "FirstLevelWhiteboxGround"), { x: ground.x, y: ground.y, z: ground.z }));
    this.stats.groundChunks = 1;
    this.stats.groundTris = 12;

    for (const block of this.layout.blocks) {
      sink.Add("Whitebox", PlaceGeometry(MakeBox(block.w, block.h, block.d, 1, block.id), {
        x: block.x,
        y: block.y,
        z: block.z,
        ry: block.ry || 0,
      }));
      if (block.solid !== false) {
        sink.Solid(block.x, block.y, block.z, block.w * 0.5, block.h * 0.5,
          block.d * 0.5, block.tag, block.ry || 0);
      }
      if (block.cover) {
        sink.Cover(block.x, block.z, block.h, block.cover.faceX, block.cover.faceZ);
      }
      this.stats.whiteBoxes += 1;
      this.stats.structures += 1;
    }

    for (const mesh of sink.Flush(this.scene, { Get: () => this.whiteMaterial })) {
      mesh.name = "FirstLevelWhitebox_StaticWhiteBoxes";
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.meshes.push(mesh);
    }
    this.colliders = sink.colliders;
    this.covers = sink.covers.slice();
  }

  BuildGates() {
    for (const spec of this.layout.gates) {
      const material = MakeWhiteMaterial(`FirstLevelWhitebox_${spec.id}`);
      const mesh = new THREE.Mesh(MakeBox(spec.w, spec.h, spec.d, 1, spec.id), material);
      mesh.position.set(spec.x, spec.y, spec.z);
      mesh.rotation.y = spec.ry || 0;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = `FirstLevelWhitebox_${spec.id}`;
      this.scene.add(mesh);
      this.meshes.push(mesh);
      const collider = ColliderRecord(spec);
      this.colliders.push(collider);
      this.gates.set(spec.id, { spec, mesh, material, collider, open: false });
      this.stats.dynamicGates += 1;
      this.stats.whiteBoxes += 1;
      this.stats.structures += 1;
    }
  }

  *BuildSteps() {
    yield { label: "策划白盒：纯白地皮", progress: 0.24 };
    this.BuildWhiteBoxes();
    yield { label: "策划白盒：空间体块", progress: 0.62 };
    this.BuildGates();
    yield { label: "策划白盒：碰撞与掩体", progress: 0.88 };
    this.BuildCollisionGrid();
    yield { label: "策划白盒就绪", progress: 1 };
  }

  /**
   * 正式第一章的事实直接驱动可见空间变化。不存在“走到说明牌，文字说门开了”：
   * 信号真发生 → 白门升起 → 碰撞真移除 → 队伍从院里走出来。
   */
  SyncScenario({ signalled = null } = {}) {
    if (typeof signalled !== "function") return 0;
    let opened = 0;
    for (const [id, gate] of this.gates) {
      if (!gate.open && signalled(gate.spec.signal) && this.OpenGate(id)) opened += 1;
    }
    return opened;
  }

  OpenGate(id) {
    const gate = this.gates.get(id);
    if (!gate || gate.open) return false;
    gate.open = true;
    gate.mesh.position.y = gate.spec.y + gate.spec.h + 1.2;
    const handle = gate.collider._physicsHandle;
    if (this.physics && handle !== null && handle !== undefined) this.physics.RemoveSolid(handle);
    const index = this.colliders.indexOf(gate.collider);
    if (index >= 0) this.colliders.splice(index, 1);
    this.BuildCollisionGrid();
    return true;
  }

  BuildCollisionGrid() {
    this.grid.clear();
    const size = this.gridSize;
    for (const box of this.colliders) {
      const x0 = Math.floor(box.min[0] / size);
      const x1 = Math.floor(box.max[0] / size);
      const z0 = Math.floor(box.min[2] / size);
      const z1 = Math.floor(box.max[2] / size);
      for (let x = x0; x <= x1; x += 1) {
        for (let z = z0; z <= z1; z += 1) {
          const key = x * 100003 + z;
          if (!this.grid.has(key)) this.grid.set(key, []);
          this.grid.get(key).push(box);
        }
      }
    }
  }

  BoxesNear(x, z) {
    return this.grid.get(Math.floor(x / this.gridSize) * 100003
      + Math.floor(z / this.gridSize)) || [];
  }

  StandHeight(x, z, fromY) {
    let height = this.GroundHeight(x, z);
    const ceiling = fromY + 0.6;
    for (const box of this.BoxesNear(x, z)) {
      if (x < box.min[0] || x > box.max[0] || z < box.min[2] || z > box.max[2]) continue;
      const top = box.max[1];
      if (top > ceiling || top <= height) continue;
      height = top;
    }
    return height;
  }

  WaterDepth(_x, _z, _y) { return 0; }

  NearbyColliders(x, z, radius = 3) {
    const size = this.gridSize;
    const out = [];
    const x0 = Math.floor((x - radius) / size);
    const x1 = Math.floor((x + radius) / size);
    const z0 = Math.floor((z - radius) / size);
    const z1 = Math.floor((z + radius) / size);
    for (let gx = x0; gx <= x1; gx += 1) {
      for (let gz = z0; gz <= z1; gz += 1) {
        const list = this.grid.get(gx * 100003 + gz);
        if (list) for (const box of list) if (!out.includes(box)) out.push(box);
      }
    }
    return out;
  }

  Raycast(origin, direction, maxDist = 200, options = null) {
    if (this.physics) return this.physics.Raycast(origin, direction, maxDist, options);
    return this.RaycastAabb(origin, direction, maxDist);
  }

  RaycastAabb(origin, direction, maxDist = 200) {
    let best = null;
    const steps = Math.ceil(maxDist / this.gridSize) + 1;
    const seen = new Set();
    for (let i = 0; i <= steps; i += 1) {
      const t = (i / steps) * maxDist;
      const px = origin.x + direction.x * t;
      const pz = origin.z + direction.z * t;
      const gx = Math.floor(px / this.gridSize);
      const gz = Math.floor(pz / this.gridSize);
      for (let ox = -1; ox <= 1; ox += 1) {
        for (let oz = -1; oz <= 1; oz += 1) {
          const key = (gx + ox) * 100003 + (gz + oz);
          if (seen.has(key)) continue;
          seen.add(key);
          const list = this.grid.get(key);
          if (!list) continue;
          for (const box of list) {
            const hit = RayAabb(origin, direction, box, maxDist);
            if (hit !== null && (best === null || hit.t < best.t)) best = hit;
          }
        }
      }
      if (best && best.t < t) break;
    }
    return best;
  }

  ClampToBounds(x, z, margin = 8) {
    return {
      x: Clamp(x, this.bounds.minX + margin, this.bounds.maxX - margin),
      z: Clamp(z, this.bounds.minZ + margin, this.bounds.maxZ - margin),
    };
  }

  CheckSightCorridor() {
    return { ok: true, blockers: [], scene: "firstLevelWhitebox", applies: false };
  }

  CheckWallCorridor() {
    return {
      rampCount: 0,
      topReachableSpan: 0,
      topSegments: 0,
      leakSpan: 0,
      leaks: [],
      ok: true,
      scene: "firstLevelWhitebox",
      applies: false,
    };
  }

  DebugState() {
    return {
      material: this.whiteMaterial.type,
      color: this.whiteMaterial.color.getHex(),
      textured: !!this.whiteMaterial.map,
      whiteBoxes: this.stats.whiteBoxes,
      blocks: this.layout.blocks.length,
      sections: this.layout.sections.map((section) => ({ ...section })),
      gates: [...this.gates.entries()].map(([id, gate]) => ({
        id,
        signal: gate.spec.signal,
        open: gate.open,
        colliding: this.colliders.includes(gate.collider),
      })),
      externalAssets: 0,
    };
  }

  Dispose() {
    const disposedMaterials = new Set();
    for (const mesh of this.meshes) {
      this.scene.remove(mesh);
      mesh.geometry?.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (material && !disposedMaterials.has(material)) {
          material.dispose();
          disposedMaterials.add(material);
        }
      }
    }
    this.meshes.length = 0;
    this.colliders = [];
    this.covers = [];
    this.grid.clear();
    this.gates.clear();
    this.objectives.length = 0;
  }
}

export default FirstLevelWhiteboxField;
