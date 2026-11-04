// 头发胡子测试场的静态场地：地面、米格线、台座（BuildSink 合批）。胸像与头发归 Script_HairRange。
import * as THREE from "three";
import { RangeField } from "./Script_RangeField.mjs";
import { BuildSink } from "./Script_World.mjs";
import { MakeBox, PlaceGeometry } from "./Script_Geo.mjs";
import { T } from "./Script_Text.mjs";
import { HAIR_RANGE_ID, HAIR_RANGE_WORLD, HAIR_RANGE_CAMERA_FAR, HAIR_RANGE_ROWS, HAIR_RANGE_PEDESTAL as P } from "./Data_HairRange.mjs";

export class HairRangeField extends RangeField {
  constructor(scene, library, options = {}) {
    super(scene, library, { bounds: HAIR_RANGE_WORLD, zones: [], levelId: HAIR_RANGE_ID, ...options });
    this.worldLimits = HAIR_RANGE_WORLD;
    this.cameraFar = HAIR_RANGE_CAMERA_FAR;
    this.generatedExternalProps = [];
    this.materials = new Map([
      ["Floor", new THREE.MeshStandardMaterial({ name: "HairRangeFloor", color: P.floor, roughness: 0.92 })],
      ["Grid", new THREE.MeshStandardMaterial({ name: "HairRangeGrid", color: P.grid, roughness: 0.9 })],
      ["Pedestal", new THREE.MeshStandardMaterial({ name: "HairRangePedestal", color: P.color, roughness: 0.8 })],
      ["PedestalTop", new THREE.MeshStandardMaterial({ name: "HairRangePedestalTop", color: P.top, roughness: 0.7 })],
    ]);
  }
  Block(sink, material, id, x, y, z, w, h, d, solid = false) {
    sink.Add(material, PlaceGeometry(MakeBox(w, h, d, 1, id), { x, y, z }));
    if (solid) sink.Solid(x, y, z, w / 2, h / 2, d / 2, "hairPedestal", 0, "wood");
    this.stats.structures++;
  }
  *BuildSteps() {
    yield { label: T("range.build.hairFixtures"), progress: 0.3 };
    const sink = new BuildSink(), b = this.bounds;
    sink.SetSector("HairFloor");
    this.Block(sink, "Floor", "Floor", 0, -0.10, (b.minZ + b.maxZ) / 2, b.maxX - b.minX, 0.20, b.maxZ - b.minZ);
    this.stats.groundChunks = 1; this.stats.groundTris = 12;
    for (let x = b.minX + 1; x < b.maxX; x++) this.Block(sink, "Grid", "GridX" + x, x, 0.001, (b.minZ + b.maxZ) / 2, 0.008, 0.002, b.maxZ - b.minZ);
    for (let z = b.minZ + 1; z < b.maxZ; z++) this.Block(sink, "Grid", "GridZ" + z, 0, 0.001, z, b.maxX - b.minX, 0.002, 0.008);
    sink.SetSector("HairPedestals");
    for (const row of HAIR_RANGE_ROWS) for (const [i, item] of row.items.entries()) {
      const id = `${row.id}${i}`;
      this.Block(sink, "Pedestal", id + "Column", item.x, (P.height - 0.03) / 2, row.z, P.width, P.height - 0.03, P.width, true);
      this.Block(sink, "PedestalTop", id + "Cap", item.x, P.height - 0.015, row.z, P.width + 0.06, 0.03, P.width + 0.06);
    }
    this.meshes.push(...sink.Flush(this.scene, { Get: (name) => this.materials.get(name) }));
    this.colliders = sink.colliders;
    this.BuildCollisionGrid();
    yield { label: T("range.build.hairReady"), progress: 1 };
  }
  Dispose() {
    super.Dispose();
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
  }
}
