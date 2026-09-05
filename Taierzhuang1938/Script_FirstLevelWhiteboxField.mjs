// 第一关策划白盒场景：**唯一可见环境就是接受光照的白色长方体**。
//
// 它与 TengxianField / JieheField / RangeField 实现同一套战场查询接口，但不调用
// 城、城外、道路、植被、贴图或外部资产生成器。所有静态体块先进入 BuildSink 合批；
// 两扇剧情门保留为独立 Mesh，收到正式第一章信号后升起并同步移除 Rapier 碰撞体。
//
// GroundHeight 默认0；显式 walkableSurfaces 仅允许引用同一布局实体的顶面。
// 车厢地板/逐级台阶可走解析支撑，屋顶不会因为是Box就自动成为地面。

import * as THREE from "three";
import { Clamp } from "./Script_Noise.mjs";
import { RayAabb, MakeBox, PlaceGeometry } from "./Script_Geo.mjs";
import { BuildSink } from "./Script_World.mjs";
import {
  FIRST_LEVEL_WHITEBOX_LAYOUT,
} from "./Data_FirstLevelWhitebox.mjs";

const GRID_SIZE = 12;
const CAMERA_FAR = 430;

export function CompileWhiteboxWalkableSurfaces(layout) {
  return (layout.walkableSurfaces || []).map(surface=>{
    const block=layout.blocks.find(item=>item.id===surface.id);
    if(!block || ["x","y","z","w","h","d"].some(key=>!Number.isFinite(block[key])||block[key]!==surface[key])
      || (block.ry||0)!==(surface.ry||0) || block.w<=0||block.h<=0||block.d<=0)
      throw new Error(`Walkable surface must match a layout block: ${surface.id}`);
    return {...block};
  });
}

export function SampleWhiteboxSurface(surfaces,x,z) {
  let height=0;
  for(const surface of surfaces){
    const dx=x-surface.x,dz=z-surface.z,c=Math.cos(surface.ry||0),s=Math.sin(surface.ry||0);
    if(Math.abs(dx*c-dz*s)<=surface.w/2 && Math.abs(dx*s+dz*c)<=surface.d/2)
      height=Math.max(height,surface.y+surface.h/2);
  }
  return height;
}

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

function MakeSemanticMaterial(name, color) {
  const material = new THREE.MeshStandardMaterial({ name, color, roughness: 0.82, metalness: 0 });
  material.userData.firstLevelWhitebox = true;
  material.userData.whiteboxSemantic = name;
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
  constructor(scene, _library, { bounds = null, zones = [], levelId = null, whiteboxLayout = null } = {}) {
    this.scene = scene;
    this.levelId = levelId;
    this.layout = whiteboxLayout || FIRST_LEVEL_WHITEBOX_LAYOUT;
    this.walkableSurfaces = CompileWhiteboxWalkableSurfaces(this.layout);
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
    this.materials = new Map([["Whitebox", this.whiteMaterial]]);
    for (const [semantic, color] of Object.entries(this.layout.semanticColors || {})) {
      this.materials.set(semantic, MakeSemanticMaterial(`FirstLevelWhitebox_${semantic}`, color));
    }
    this.gates = new Map();
    this.scenarioMeshes = [];
    this.scenarioColliders = [];
    this.scenarioState = null;
    this.legend = null;
    this.stats = {
      groundChunks: 0,
      groundTris: 0,
      structures: 0,
      whiteBoxes: 0,
      dynamicGates: 0,
    };
  }

  GroundHeight(x, z) { return SampleWhiteboxSurface(this.walkableSurfaces,x,z); }

  BuildWhiteBoxes() {
    const sink = new BuildSink();
    sink.SetSector("FirstLevelWhitebox");
    const ground = this.layout.ground;
    sink.Add(ground.semantic || "Whitebox", PlaceGeometry(MakeBox(ground.w, ground.h, ground.d, 1,
      "FirstLevelWhiteboxGround"), { x: ground.x, y: ground.y, z: ground.z }));
    // Keep the physical soil separate from structural boxes so the shared crater
    // adapter can replace its surface without touching walls or elevated floors.
    for (const mesh of sink.Flush(this.scene, { Get: (key) => this.materials.get(key) || this.whiteMaterial })) {
      mesh.name = "FirstLevelWhitebox_Ground"; mesh.userData.deformableTerrain = true;
      this.meshes.push(mesh);
    }
    this.stats.groundChunks = 1;
    this.stats.groundTris = 12;

    for (const block of this.layout.blocks) {
      if (this.layout.scenario?.replaceBlockIds.includes(block.id)) continue;
      sink.Add(block.semantic || "Whitebox", PlaceGeometry(MakeBox(block.w, block.h, block.d, 1, block.id), {
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

    for (const mesh of sink.Flush(this.scene, { Get: (key) => this.materials.get(key) || this.whiteMaterial })) {
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
      const material = this.layout.semanticColors?.[spec.semantic]
        ? MakeSemanticMaterial(`FirstLevelWhitebox_${spec.semantic}_${spec.id}`,
          this.layout.semanticColors[spec.semantic])
        : MakeWhiteMaterial(`FirstLevelWhitebox_${spec.id}`);
      const mesh = new THREE.Mesh(MakeBox(spec.w, spec.h, spec.d, 1, spec.id), material);
      mesh.position.set(spec.x, spec.y, spec.z);
      mesh.rotation.y = spec.ry || 0;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = `FirstLevelWhitebox_${spec.id}`;
      this.scene.add(mesh);
      this.meshes.push(mesh);
      const collider = ColliderRecord(spec);
      const open=!!spec.appearSignal;
      if(open)mesh.visible=false;else this.colliders.push(collider);
      this.gates.set(spec.id, { spec, mesh, material, collider, open });
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
    this.SetScenarioState(this.layout.scenario?.states[0]);
    this.BuildLegend();
    yield { label: "策划白盒：碰撞与掩体", progress: 0.88 };
    this.BuildCollisionGrid();
    yield { label: "策划白盒就绪", progress: 1 };
  }

  /**
   * 正式第一章的事实直接驱动可见空间变化。不存在“走到说明牌，文字说门开了”：
   * 信号真发生 → 白门升起 → 碰撞真移除 → 队伍从院里走出来。
   */
  SyncScenario({ signalled = null, restore = false } = {}) {
    if (typeof signalled !== "function") return 0;
    let opened = 0;
    for (const [id, gate] of this.gates) {
      const absent=!!gate.spec.appearSignal&&!signalled(gate.spec.appearSignal);
      const open=absent||signalled(gate.spec.signal);
      if (!gate.open && open && this.OpenGate(id)) opened += 1;
      else if ((restore||gate.spec.appearSignal) && gate.open && !open && this.CloseGate(id)) opened += 1;
    }
    const states = this.layout.scenario?.states;
    if (states && this.SetScenarioState([...states].reverse().find(state => !state.signal || signalled(state.signal)))) opened += 1;
    return opened;
  }

  /** Checkpoint replay is explicit so legacy callers retain one-way gate semantics. */
  RestoreScenario(options = {}) { return this.SyncScenario({ ...options, signalled: options.signalled || (() => false), restore: true }); }

  SetScenarioState(state) {
    if (!state || this.scenarioState === state.id) return false;
    for (const collider of this.scenarioColliders) {
      if (this.physics && collider._physicsHandle != null) this.physics.RemoveSolid(collider._physicsHandle);
      const index = this.colliders.indexOf(collider);
      if (index >= 0) this.colliders.splice(index, 1);
    }
    for (const mesh of this.scenarioMeshes) {
      this.scene.remove(mesh); mesh.geometry.dispose();
      const index = this.meshes.indexOf(mesh);
      if (index >= 0) this.meshes.splice(index, 1);
    }
    const sink = new BuildSink();
    sink.SetSector("FirstLevelWhiteboxScenario");
    for (const block of state.blocks) {
      sink.Add(block.semantic, PlaceGeometry(MakeBox(block.w, block.h, block.d, 1, block.id), block));
      if (block.solid !== false) sink.Solid(block.x, block.y, block.z, block.w / 2, block.h / 2, block.d / 2, block.tag, block.ry || 0);
    }
    this.scenarioMeshes = sink.Flush(this.scene, { Get: key => this.materials.get(key) || this.whiteMaterial });
    for (const mesh of this.scenarioMeshes) { mesh.name = `FirstLevelWhitebox_Hub_${state.id}`; mesh.castShadow = true; mesh.receiveShadow = true; this.meshes.push(mesh); }
    this.scenarioColliders = sink.colliders;
    for (const collider of this.scenarioColliders) { this.colliders.push(collider); if (this.physics) this.physics.AddSolid(collider); }
    this.scenarioState = state.id;
    this.BuildCollisionGrid();
    return true;
  }

  BuildLegend() {
    if (!this.layout.scenario || typeof document === "undefined" || this.legend) return;
    const legend = document.createElement("details");
    legend.id = "firstLevelP012Legend";
    legend.open = typeof window === "undefined" || window.innerWidth >= 640;
    // Tutorial objectives must remain readable during long posture/movement
    // drills. Scope to this disposable P012 node; legacy HUD keeps its fade.
    const objectiveStyle = document.createElement("style");
    objectiveStyle.textContent = `body:has(#firstLevelP012Legend) .hudObjective {
      opacity:1 !important; animation:none !important; background:#151a20;
      padding:8px 10px; border:1px solid #76808b; border-radius:5px;
    }
    body:has(#firstLevelP012Legend) .hudObjective .o {
      color:#fff; -webkit-text-stroke:0; text-shadow:none; font-size:16px; line-height:1.35;
    }
    body:has(#firstLevelP012Legend) .hudObjective .objectiveUpdate { display:none; }
    @media(max-width:639px) {
      body:has(#firstLevelP012Legend) .hudTop { width:calc(100vw - 120px); }
      body:has(#firstLevelP012Legend) .hudObjective .o { font-size:13px; }
      #firstLevelP012Legend { top:14px !important; max-width:190px !important; }
    }`;
    legend.appendChild(objectiveStyle);
    legend.style.cssText = "position:fixed;right:12px;top:76px;z-index:25;max-width:220px;padding:8px 10px;background:#151a20df;color:#fff;border:1px solid #76808b;border-radius:5px;font:12px/1.55 sans-serif;pointer-events:auto;";
    const title = document.createElement("summary"); title.textContent = "白盒色标"; title.style.cursor = "pointer"; legend.appendChild(title);
    const direction = document.createElement("div"); direction.textContent = "北：阵地｜南：兵站｜西：铁路"; direction.style.cssText = "font-size:11px;color:#c6d2df;margin:5px 0"; legend.appendChild(direction);
    const coordinates = document.createElement("details");
    const coordinateTitle = document.createElement("summary"); coordinateTitle.textContent = "坐标约定"; coordinates.appendChild(coordinateTitle);
    coordinates.appendChild(document.createTextNode("世界坐标：北 −Z，南 +Z，东 +X；不随镜头转动。"));
    coordinates.style.cssText = "font-size:10px;color:#b7c3d0;margin:3px 0"; legend.appendChild(coordinates);
    const labels = {ground:"通行/奔跑",structure:"车体/建筑结构",step:"跨步/台阶",vault:"翻越",mantle:"攀爬",cover:"掩体",boundary:"不可通行",danger:"危险区域",missionRoute:"任务路线",stretcherRoute:"担架通道"};
    for (const [semantic, label] of Object.entries(labels)) {
      if(this.layout.semanticColors[semantic]===undefined)continue;
      const row = document.createElement("div"); row.style.cssText = "display:inline-flex;align-items:center;gap:5px;width:50%;white-space:nowrap";
      const chip = document.createElement("span"); chip.style.cssText = `display:inline-block;width:10px;height:10px;border:1px solid #aaa;background:#${this.layout.semanticColors[semantic].toString(16).padStart(6,"0")}`;
      row.appendChild(chip); row.appendChild(document.createTextNode(label)); legend.appendChild(row);
    }
    document.body.appendChild(legend); this.legend = legend;
  }

  // Freight side panels slide along the wagon. The collision record follows
  // the visible panel every frame, including when only partly open.
  SetGateProgress(id, progress) {
    const gate=this.gates.get(id);if(!gate)return;
    const value=Math.max(0,Math.min(1,progress));
    if(gate.progress===value)return;
    gate.progress=value;
    const handle=gate.collider?._physicsHandle;
    if(this.physics&&handle!=null)this.physics.RemoveSolid(handle);
    const index=this.colliders.indexOf(gate.collider);if(index>=0)this.colliders.splice(index,1);
    gate.mesh.visible=true;gate.mesh.position.set(gate.spec.x,gate.spec.y,gate.spec.z+value*(gate.spec.d+.15));
    gate.open=value===1;
    if(!gate.open){gate.collider=ColliderRecord({...gate.spec,z:gate.mesh.position.z});this.colliders.push(gate.collider);if(this.physics)this.physics.AddSolid(gate.collider);}
    this.BuildCollisionGrid();
  }

  OpenGate(id) {
    const gate = this.gates.get(id);
    if (!gate || gate.open) return false;
    gate.open = true;
    if (this.layout.scenario) gate.mesh.visible = false;
    else gate.mesh.position.y = gate.spec.y + gate.spec.h + 1.2;
    const handle = gate.collider._physicsHandle;
    if (this.physics && handle !== null && handle !== undefined) this.physics.RemoveSolid(handle);
    const index = this.colliders.indexOf(gate.collider);
    if (index >= 0) this.colliders.splice(index, 1);
    this.BuildCollisionGrid();
    return true;
  }

  CloseGate(id) {
    const gate = this.gates.get(id);
    if (!gate || !gate.open) return false;
    gate.open = false;
    gate.mesh.visible = true;
    gate.mesh.position.y = gate.spec.y;
    gate.mesh.position.z = gate.spec.z; gate.progress = undefined;
    gate.collider = ColliderRecord(gate.spec);
    this.colliders.push(gate.collider);
    if (this.physics) this.physics.AddSolid(gate.collider);
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
      coloredSemantics: Object.keys(this.layout.semanticColors || {}),
      scenarioState: this.scenarioState,
      scenarioColliders: this.scenarioColliders.length,
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
    this.legend?.remove(); this.legend = null;
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
    this.scenarioMeshes = []; this.scenarioColliders = []; this.scenarioState = null;
    this.objectives.length = 0;
  }
}

export default FirstLevelWhiteboxField;
