// The laboratory's static floor, curtain frame and banner stand are sector-batched.
// Cloth meshes, contacts and their visual examples belong exclusively to Script_ClothRange.
import * as THREE from "three";
import { RangeField } from "./Script_RangeField.mjs";
import { BuildSink } from "./Script_World.mjs";
import { MakeBox, PlaceGeometry } from "./Script_Geo.mjs";
import { T } from "./Script_Text.mjs";
import { CLOTH_RANGE_ID, CLOTH_RANGE_WORLD, CLOTH_RANGE_CAMERA_FAR, CLOTH_RANGE_STATIONS,
  CLOTH_RANGE_FIXTURES } from "./Data_ClothRange.mjs";

export class ClothRangeField extends RangeField {
  constructor(scene, library, options = {}) {
    super(scene, library, { bounds: CLOTH_RANGE_WORLD, zones: CLOTH_RANGE_STATIONS, levelId: CLOTH_RANGE_ID, ...options });
    this.worldLimits = CLOTH_RANGE_WORLD;
    this.cameraFar = CLOTH_RANGE_CAMERA_FAR;
    this.generatedExternalProps = [];
    this.materials = new Map(Object.entries(CLOTH_RANGE_FIXTURES.palette).map(([name, color]) => [name,
      new THREE.MeshStandardMaterial({ name: "ClothRange" + name, color, roughness: 0.88 })]));
  }
  Block(sink, material, id, x, y, z, w, h, d, solid = false) {
    sink.Add(material, PlaceGeometry(MakeBox(w, h, d, 1, id), { x, y, z }));
    if (solid) sink.Solid(x, y, z, w / 2, h / 2, d / 2, "clothFixture", 0, "wood");
    this.stats.structures++;
  }
  *BuildSteps() {
    yield { label: T("range.build.clothFixtures"), progress: 0.3 };
    const sink = new BuildSink(), b = this.bounds;
    sink.SetSector("ClothFloor");
    this.Block(sink, "Floor", "Floor", 0, -0.10, (b.minZ + b.maxZ) / 2, b.maxX - b.minX, 0.20, b.maxZ - b.minZ);
    this.stats.groundChunks = 1; this.stats.groundTris = 12;
    for (let x = b.minX + 1; x < b.maxX; x++) this.Block(sink, "Grid", "GridX" + x, x, 0.001, (b.minZ + b.maxZ) / 2, 0.008, 0.002, b.maxZ - b.minZ);
    for (let z = b.minZ + 1; z < b.maxZ; z++) this.Block(sink, "Grid", "GridZ" + z, 0, 0.001, z, b.maxX - b.minX, 0.002, 0.008);
    const c = CLOTH_RANGE_FIXTURES.curtain;
    sink.SetSector("ClothCurtainFrame");
    for (const side of [-1, 1]) this.Block(sink, "Wood", "CurtainPost" + side,
      c.x + side * (c.openingWidth + c.beam) / 2, c.top / 2, c.z, c.beam, c.top, c.depth, true);
    this.Block(sink, "Wood", "CurtainLintel", c.x, c.top + c.beam / 2, c.z,
      c.openingWidth + 2 * c.beam, c.beam, c.depth, true);
    const f = CLOTH_RANGE_FIXTURES.banner;
    sink.SetSector("ClothBannerStand");
    for (const side of [-1, 1]) {
      const x = f.x + side * (f.width / 2 + 0.16);
      this.Block(sink, "Metal", "BannerPost" + side, x, f.top / 2, f.z, f.beam, f.top, f.beam, true);
      this.Block(sink, "Metal", "BannerFoot" + side, x, 0.03, f.z, 0.42, 0.06, 0.65);
    }
    this.Block(sink, "Metal", "BannerCrossbar", f.x, f.top + f.beam / 2, f.z,
      f.width + 0.40, f.beam, f.beam, true);
    this.meshes.push(...sink.Flush(this.scene, { Get: name => this.materials.get(name) }));
    this.colliders = sink.colliders;
    this.BuildCollisionGrid();
    yield { label: T("range.build.clothReady"), progress: 1 };
  }
  Dispose() {
    super.Dispose();
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
  }
}
