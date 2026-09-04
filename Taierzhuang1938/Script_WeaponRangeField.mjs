// Independent firearm range geometry. No town dressing, PCG or external assets.
// Every static surface, including labels and ground, is batched through BuildSink.
// Query/physics methods are inherited from RangeField; its construction routines
// are never called. Flat visible floor and GroundHeight both have top Y = 0.
import * as THREE from "three";
import { RangeField } from "./Script_RangeField.mjs";
import { BuildSink } from "./Script_World.mjs";
import { MakeBox, PlaceGeometry } from "./Script_Geo.mjs";
import {
  WEAPON_RANGE_LEVEL_ID, WEAPON_RANGE_WORLD, WEAPON_RANGE_CAMERA_FAR,
  WEAPON_RANGE_STATIONS, WEAPON_RANGE_FIRING_ORIGIN, WEAPON_RANGE_TABLE,
  WEAPON_RANGE_WEAPONS, WEAPON_RANGE_TARGETS,
} from "./Data_WeaponRange.mjs";

const PALETTE = Object.freeze({ Floor: 0xaeb6bd, White: 0xd1d7db, Table: 0x77838b,
  Frame: 0x394750, Blue: 0x1266c0, Red: 0xb02f39, Lane: 0x929da5 });

/** Stable sign manifest doubles as a pure inspectable accessibility contract. */
export function WeaponRangeSigns() {
  return [
    { id: "WeaponRangeWelcome", text: "枪械白盒靶场", subtext: "长桌 F 领取 · 无限弹药" },
    { id: "WeaponRangeMeasure", text: "蓝点测距 / METRES", subtext: "静靶左 · 动靶右 · 10—200 米" },
    ...WEAPON_RANGE_WEAPONS.map(slot => ({ id: `WeaponRangeGun${slot.slot}`,
      text: `${String(slot.slot + 1).padStart(2, "0")}  ${slot.name}`, subtext: "F 领取  /  无限弹药" })),
    ...WEAPON_RANGE_TARGETS.map(target => ({ id: target.id,
      text: `${target.distanceM} m`, subtext: target.moving ? `${target.id}  移动靶` : `${target.id}  静止靶` })),
  ];
}

function MakeSignAtlas(signs) {
  // One locally drawn atlas for all readable signs: no downloaded font/image.
  const cols = 4, rows = Math.ceil(signs.length / cols), tileW = 512, tileH = 128;
  const canvas = document.createElement("canvas");
  canvas.width = cols * tileW;
  canvas.height = rows * tileH;
  const context = canvas.getContext("2d");
  context.fillStyle = "#edf0f0";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const rects = new Map();
  signs.forEach((sign, index) => {
    const col = index % cols, row = Math.floor(index / cols), x = col * tileW, y = row * tileH;
    context.fillStyle = sign.id.startsWith("M") ? "#ad3037" : "#244455";
    context.fillRect(x + 8, y + 8, tileW - 16, 5);
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = "bold 42px sans-serif";
    context.fillText(sign.text, x + tileW / 2, y + 49, tileW - 28);
    context.font = "24px sans-serif";
    context.fillText(sign.subtext, x + tileW / 2, y + 97, tileW - 28);
    rects.set(sign.id, { u0: (x + 3) / canvas.width, u1: (x + tileW - 3) / canvas.width,
      v0: 1 - (y + tileH - 3) / canvas.height, v1: 1 - (y + 3) / canvas.height });
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { texture, rects };
}

export class WeaponRangeField extends RangeField {
  constructor(scene, library, { bounds = WEAPON_RANGE_WORLD, zones = WEAPON_RANGE_STATIONS,
    levelId = WEAPON_RANGE_LEVEL_ID } = {}) {
    super(scene, library, { bounds, zones, levelId });
    this.worldLimits = WEAPON_RANGE_WORLD;
    this.cameraFar = WEAPON_RANGE_CAMERA_FAR;
    this.generatedExternalProps = [];
    this.materials = new Map(Object.entries(PALETTE).map(([name, color]) => [name,
      new THREE.MeshStandardMaterial({ name: `WeaponRange${name}`, color, roughness: 0.88, metalness: 0 })]));
    this.signAtlas = null;
    this.signManifest = WeaponRangeSigns();
  }

  AddBlock(sink, material, id, x, y, z, w, h, d, solid = false) {
    sink.Add(material, PlaceGeometry(MakeBox(w, h, d, 1, id), { x, y, z }));
    if (solid) sink.Solid(x, y, z, w / 2, h / 2, d / 2, "weaponRangeWall");
    this.stats.structures += 1;
  }

  AddSign(sink, id, x, y, z, w, h, rx = 0, ry = 0) {
    const geometry = new THREE.PlaneGeometry(w, h);
    const rect = this.signAtlas.rects.get(id);
    const uv = geometry.getAttribute("uv");
    for (let index = 0; index < uv.count; index += 1) {
      uv.setXY(index, rect.u0 + uv.getX(index) * (rect.u1 - rect.u0),
        rect.v0 + uv.getY(index) * (rect.v1 - rect.v0));
    }
    sink.Add("Signs", PlaceGeometry(geometry, { x, y, z, rx, ry }));
  }

  BuildWhitebox() {
    const sink = new BuildSink();
    const b = this.bounds, origin = WEAPON_RANGE_FIRING_ORIGIN, table = WEAPON_RANGE_TABLE;
    sink.SetSector("WeaponRangeRear");
    this.AddBlock(sink, "Floor", "WeaponRangeFloor", (b.minX + b.maxX) / 2, -0.10,
      (b.minZ + b.maxZ) / 2, b.maxX - b.minX, 0.20, b.maxZ - b.minZ);
    this.stats.groundChunks = 1;
    this.stats.groundTris = 12;
    // Visible enclosing walls coincide with physical barriers.
    for (const x of [b.minX, b.maxX]) this.AddBlock(sink, "White", `WeaponRangeSide${x}`,
      x, 1.5, (b.minZ + b.maxZ) / 2, 0.6, 3, b.maxZ - b.minZ, true);
    this.AddBlock(sink, "White", "WeaponRangeBackstop", (b.minX + b.maxX) / 2,
      3, b.minZ, b.maxX - b.minX, 6, 1.0, true);
    this.AddBlock(sink, "White", "WeaponRangeRearWall", (b.minX + b.maxX) / 2,
      1.5, b.maxZ, b.maxX - b.minX, 3, 0.6, true);

    // Compact preparation bay, one uninterrupted table directly ahead of spawn.
    this.AddBlock(sink, "White", "WeaponRangePreparation", table.x, 0.004, table.z + 2,
      table.width + 5, 0.008, 10);
    this.AddBlock(sink, "Table", "WeaponRangeTableTop", table.x, table.topY - table.slabHeight / 2,
      table.z, table.width, table.slabHeight, table.depth, true);
    for (const x of [table.x - table.width / 2 + 0.35, table.x, table.x + table.width / 2 - 0.35]) {
      for (const dz of [-0.48, 0.48]) this.AddBlock(sink, "Frame", `WeaponRangeLeg${x}${dz}`,
        x, (table.topY - table.slabHeight) / 2, table.z + dz, 0.12, table.topY - table.slabHeight, 0.12, true);
    }
    this.signAtlas = MakeSignAtlas(this.signManifest);
    this.materials.set("Signs", new THREE.MeshBasicMaterial({ name: "WeaponRangeSigns", map: this.signAtlas.texture,
      side: THREE.DoubleSide, toneMapped: false }));
    for (const slot of WEAPON_RANGE_WEAPONS) {
      this.AddBlock(sink, "Blue", `WeaponRangeSlot${slot.slot}`, slot.x, table.topY + 0.006,
        table.z, table.slotSpacing - 0.1, 0.012, table.depth - 0.10);
      this.AddSign(sink, `WeaponRangeGun${slot.slot}`, slot.x, table.topY + 0.014,
        table.z + table.depth / 2 - 0.15, 1.52, 0.25, -Math.PI / 2);
    }

    // Painted crosshair and line share the measurement datum used by target math.
    this.AddBlock(sink, "Blue", "WeaponRangeFiringLine", origin.x, 0.009, origin.z, table.width + 7, 0.018, 0.14);
    this.AddBlock(sink, "Blue", "WeaponRangeOriginCross", origin.x, 0.012, origin.z, 0.15, 0.022, 1.2);
    const ring = new THREE.RingGeometry(0.40, 0.50, 48);
    sink.Add("Blue", PlaceGeometry(ring, { x: origin.x, y: 0.023, z: origin.z, rx: -Math.PI / 2 }));
    this.AddSign(sink, "WeaponRangeMeasure", origin.x + 3.2, 0.025, origin.z + 1.7, 4.0, 1.0, -Math.PI / 2);
    this.AddBlock(sink, "Frame", "WeaponRangeWelcomeBoard", table.x - table.width / 2 - 1.3,
      1.55, table.z - 1.5, 2.25, 0.65, 0.12);
    this.AddSign(sink, "WeaponRangeWelcome", table.x - table.width / 2 - 1.3,
      1.55, table.z - 1.427, 2.15, 0.55);

    // Each target has its own painted corridor, exact radial arc, and a real sign.
    // Markers sit above heads, and are non-colliding, so neither signs nor their
    // supports can absorb a bullet intended for another distance.
    for (const target of WEAPON_RANGE_TARGETS) {
      sink.SetSector(target.distanceM <= 70 ? "WeaponRangeNear" : target.distanceM <= 140 ? "WeaponRangeMid" : "WeaponRangeFar");
      const material = target.moving ? "Red" : "Blue";
      const arcHalf = target.motion.amplitudeRad + 0.8 / target.distanceM;
      const points = [];
      for (let step = 0; step <= 24; step += 1) {
        const angle = target.angleRad - arcHalf + 2 * arcHalf * step / 24;
        points.push({ x: origin.x + Math.sin(angle) * target.distanceM,
          z: origin.z - Math.cos(angle) * target.distanceM });
      }
      for (let step = 1; step < points.length; step += 1) {
        const a = points[step - 1], c = points[step], dx = c.x - a.x, dz = c.z - a.z;
        sink.Add(material, PlaceGeometry(MakeBox(Math.hypot(dx, dz), 0.016, 0.10, 1, `WeaponRangeArc${target.id}${step}`),
          { x: (a.x + c.x) / 2, y: 0.008, z: (a.z + c.z) / 2, ry: -Math.atan2(dz, dx) }));
      }
      this.AddSign(sink, target.id, target.x, 2.65, target.z - 0.25, 1.8, 0.5, 0, -target.angleRad);
      this.AddBlock(sink, "Frame", `WeaponRangeSignPost${target.id}`, target.x, 1.18, target.z - 0.40,
        0.045, 2.36, 0.045);
    }
    for (const mesh of sink.Flush(this.scene, { Get: name => this.materials.get(name) })) {
      if (mesh.material === this.materials.get("Signs")) mesh.castShadow = false;
      this.meshes.push(mesh);
    }
    this.colliders = sink.colliders;
    this.covers = [];
  }

  *BuildSteps() {
    yield { label: "枪械白盒：长桌与测距靶道", progress: 0.3 };
    this.BuildWhitebox();
    yield { label: "枪械白盒：碰撞与标识", progress: 0.85 };
    this.BuildCollisionGrid();
    yield { label: "就绪", progress: 1 };
  }

  CheckSightCorridor() { return { ok: true, blockers: [], scene: "weaponRange", applies: false }; }

  Dispose() {
    super.Dispose();
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
    this.signAtlas?.texture.dispose();
    this.signAtlas = null;
  }
}

export default WeaponRangeField;
