// Whitebox scene: solid benches, complete game inventory, parallel vehicle lanes.
// Static meshes (including signs) go through BuildSink. Articulated vehicles are
// separate dynamic models so recoil does not rebuild static geometry.
import * as THREE from "three";
import { RangeField } from "./Script_RangeField.mjs";
import { BuildSink } from "./Script_World.mjs";
import { MakeBox, MakePlane, PlaceGeometry } from "./Script_Geo.mjs";
import { LoadDocument, InstantiateModel } from "./Script_MeshLoad.mjs";
import { EXPLOSION_GRENADES, EXPLOSION_VEHICLES, EXPLOSION_CONTROLS, EXPLOSION_PATROL } from "./Data_ExplosionRange.mjs";

export class ExplosionRangeField extends RangeField {
  constructor(scene, library, options = {}) {
    super(scene, library, options);
    this.materials = new Map(); this.models = new Map(); this.textures = [];
    this.cameraFar = 360;
    this.worldLimits = { ...this.bounds, groundLimit: 4000 };
    for (const [name, color] of Object.entries({ Soil: 0x9ca5a9, White: 0xdbe3e6, Boundary: 0x293439,
      Orange: 0xffb12e, Green: 0x48d9b1, Blue: 0x70bfff, Purple: 0xc6a0ff, Armor: 0x555c4a, Track: 0x3b3d3c })) {
      const material = library.Get("Ground").clone();
      material.map = null; material.normalMap = null; material.roughnessMap = null; material.metalnessMap = null;
      material.aoMap = null;
      material.color.setHex(color); material.roughness = 0.96; material.metalness = 0;
      this.materials.set(name, material);
    }
  }
  BuildGround() {
    const sink = new BuildSink(), b = this.bounds;
    sink.SetSector("ExplosionGround");
    sink.Add("Soil", PlaceGeometry(MakePlane(b.maxX - b.minX + 120, b.maxZ - b.minZ + 120),
      { x: (b.minX + b.maxX) / 2, y: 0, z: (b.minZ + b.maxZ) / 2 }));
    for (const mesh of sink.Flush(this.scene, { Get: (key) => this.materials.get(key) })) {
      mesh.name = "ExplosionRangeGround"; mesh.userData.deformableTerrain = true; this.meshes.push(mesh);
    }
    this.stats.groundChunks = 1; this.stats.groundTris = 2;
  }
  Label(sink, id, text, x, y, z, width = 5, color = "#ffffff") {
    const canvas = document.createElement("canvas"); canvas.width = 1024; canvas.height = 180;
    const ctx = canvas.getContext("2d"); ctx.fillStyle = "#16252b"; ctx.fillRect(0, 0, 1024, 180);
    ctx.fillStyle = color; ctx.font = "bold 60px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text, 512, 90, 980);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; this.textures.push(texture);
    this.materials.set(id, new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
    sink.Add(id, PlaceGeometry(new THREE.PlaneGeometry(width, width * 180 / 1024), { x, y, z }));
  }
  BuildStructures() {
    const sink = new BuildSink(); sink.SetSector("ExplosionStations");
    const Box = (id, material, x, y, z, w, h, d, solid = true) => {
      sink.Add(material, PlaceGeometry(MakeBox(w, h, d, 1, id), { x, y, z }));
      if (solid) sink.Solid(x, y, z, w / 2, h / 2, d / 2, "testFixture");
    };
    for (const row of EXPLOSION_GRENADES) {
      Box(`${row.id}TableTop`, "White", row.x, 1.04, row.z, 4.3, 0.16, 1.4);
      for (const dx of [-1.85, 1.85]) for (const dz of [-0.5, 0.5]) Box("TableLeg", "Boundary", row.x + dx, 0.49, row.z + dz, 0.15, 0.98, 0.15);
      this.Label(sink, `${row.id}Sign`, row.name + " · F 领取", row.x, 0.72, row.z + 0.72, 3.8);
    }
    for (const [key, point] of Object.entries(EXPLOSION_CONTROLS)) {
      const color = key === "barrage" ? "Orange" : key === "return" ? "Green" : key === "airstrike" ? "Purple" : "Blue";
      Box(point.id, color, point.x, 0.65, point.z, 1.5, 1.3, 1.2);
      Box(`${point.id}Beacon`, color, point.x, 3.2, point.z - 0.35, 0.15, 4, 0.15, false);
      this.Label(sink, `${point.id}Sign`, point.label, point.x, 3.45, point.z, 5.3, `#${point.color.toString(16)}`);
      if (key === "barrage") this.Label(sink, "BarrageRadius", "F · 玩家周围 16m", point.x, 0.8, point.z + 0.62, 3, "#ffb12e");
      if (key === "airstrike") this.Label(sink, "AirstrikeRadius", "F · 召唤后才有飞机", point.x, 0.8, point.z + 0.62, 3, "#c6a0ff");
    }
    for (const vehicle of EXPLOSION_VEHICLES) {
      const weaponWidth = vehicle.id === "Type97ChiHa" ? 2.475 : 2.15;
      // Models recoil visually, hull collision remains fixed on its concrete pad.
      Box(`${vehicle.id}Pad`, "White", vehicle.x, 0.04, vehicle.z, 6.4, 0.08, 8);
      sink.Solid(vehicle.x, 1, vehicle.z, weaponWidth / 2, 1, 2.3, "testVehicle");
      this.Label(sink, `${vehicle.id}Sign`, `${vehicle.name} · F 单发`, vehicle.x, 0.48, vehicle.z + 4.6, 5.2);
      for (const distance of [10, 20, 30]) this.Label(sink, `${vehicle.id}Distance${distance}`, `${distance} m`, vehicle.x - 5, 0.5, vehicle.z - distance, 2);
    }
    this.Label(sink, "ExplosionTitle", "爆 炸 测 试 场", 2600, 5.4, 2650, 20);
    this.Label(sink, "ExplosionRoute", "通行验证 · 士兵往返穿越炮坑", 2600, 3.3, EXPLOSION_PATROL.z - 5, 17, "#70bfff");
    const b = this.bounds;
    for (const x of [b.minX + 0.5, b.maxX - 0.5]) Box("SideBoundary", "Boundary", x, 1.4, (b.minZ + b.maxZ) / 2, 1, 2.8, b.maxZ - b.minZ);
    for (const z of [b.minZ + 0.5, b.maxZ - 0.5]) Box("EndBoundary", "Boundary", (b.minX + b.maxX) / 2, 1.4, z, b.maxX - b.minX, 2.8, 1);
    for (const mesh of sink.Flush(this.scene, { Get: (key) => this.materials.get(key) })) {
      // Floating instructional signs must not stripe the test surfaces below.
      if (mesh.material.isMeshBasicMaterial) mesh.castShadow = false;
      this.meshes.push(mesh);
    }
    this.colliders = sink.colliders; this.covers = []; this.stats.structures = sink.colliders.length;
  }
  async LoadVehicles() {
    for (const spec of EXPLOSION_VEHICLES) {
      const doc = await LoadDocument(`./Model/${spec.id}.tzm.json`);
      if (!doc) throw new Error(`Missing vehicle ${spec.id}`);
      const model = InstantiateModel(doc, { materials: { armor: this.materials.get("Armor"), steel: this.library.Get("Steel"), track: this.materials.get("Track") } });
      model.root.name = `ExplosionVehicle_${spec.id}`;
      model.root.position.set(spec.x, spec.y + 0.08, spec.z);
      this.scene.add(model.root); this.models.set(spec.id, model);
    }
  }
  Dispose() {
    for (const model of this.models.values()) { this.scene.remove(model.root); model.root.traverse((o) => o.geometry?.dispose()); }
    this.models.clear(); super.Dispose();
    for (const material of this.materials.values()) material.dispose();
    for (const texture of this.textures) texture.dispose();
    this.materials.clear(); this.textures.length = 0;
  }
}
