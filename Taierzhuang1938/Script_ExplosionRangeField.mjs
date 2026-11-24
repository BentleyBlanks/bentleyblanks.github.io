// Refactored explosion range whitebox: uncluttered deformable firing field with
// flush distance range lines, optional target sandbag cover wall, and a single
// off-lane vehicle pad whose tank is spawned on demand from the left panel.
import * as THREE from "three";
import { RangeField } from "./Script_RangeField.mjs";
import { BuildSink } from "./Script_World.mjs";
import { MakeBox, MakePlane, PlaceGeometry } from "./Script_Geo.mjs";
import { LoadDocument, InstantiateModel } from "./Script_MeshLoad.mjs";
import {
  EXPLOSION_SPAWN, EXPLOSION_VEHICLES, EXPLOSION_VEHICLE_PAD, EXPLOSION_RANGE_MARKERS,
} from "./Data_ExplosionRange.mjs";

export class ExplosionRangeField extends RangeField {
  constructor(scene, library, options = {}) {
    super(scene, library, options);
    this.materials = new Map();
    this.models = new Map();
    this.textures = [];
    this.activeVehicleId = null;
    this.coverWallGroup = null;
    this.coverCollider = null;
    this.vehicleCollider = null;
    this.cameraFar = 360;
    this.worldLimits = { ...this.bounds, groundLimit: 4000 };
    for (const [name, color] of Object.entries({
      Soil: 0x9ca5a9,
      Pad: 0xc2c8c9,
      Line: 0xd9d4c4,
      Boundary: 0x293439,
      Sandbag: 0x9b8e72,
      Timber: 0x624d38,
      Armor: 0x555c4a,
      Track: 0x3b3d3c,
    })) {
      const material = library.Get("Ground").clone();
      material.map = null;
      material.normalMap = null;
      material.roughnessMap = null;
      material.metalnessMap = null;
      material.aoMap = null;
      material.color.setHex(color);
      material.roughness = 0.96;
      material.metalness = 0;
      this.materials.set(name, material);
    }
  }

  BuildGround() {
    const sink = new BuildSink(), b = this.bounds;
    sink.SetSector("ExplosionGround");
    sink.Add("Soil", PlaceGeometry(MakePlane(b.maxX - b.minX + 120, b.maxZ - b.minZ + 120),
      { x: (b.minX + b.maxX) / 2, y: 0, z: (b.minZ + b.maxZ) / 2 }));
    for (const mesh of sink.Flush(this.scene, { Get: (key) => this.materials.get(key) })) {
      mesh.name = "ExplosionRangeGround";
      mesh.userData.deformableTerrain = true;
      this.meshes.push(mesh);
    }
    this.stats.groundChunks = 1;
    this.stats.groundTris = 2;
  }

  Label(sink, id, text, x, y, z, width = 2.2, color = "#e8e3d2") {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 140;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#1a2326";
    ctx.fillRect(0, 0, 512, 140);
    ctx.strokeStyle = "#b89f63";
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, 504, 132);
    ctx.fillStyle = color;
    ctx.font = "bold 62px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 72, 470);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.textures.push(texture);
    this.materials.set(id, new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
    sink.Add(id, PlaceGeometry(new THREE.PlaneGeometry(width, width * 140 / 512), { x, y, z }));
  }

  BuildStructures() {
    const sink = new BuildSink();
    sink.SetSector("ExplosionStations");
    const Box = (id, material, x, y, z, w, h, d, solid = true, tag = "testFixture") => {
      sink.Add(material, PlaceGeometry(MakeBox(w, h, d, 1, id), { x, y, z }));
      if (solid) sink.Solid(x, y, z, w / 2, h / 2, d / 2, tag);
    };

    // 清晰简洁的投掷距离标尺线（贴地窄条 + 场地左右外侧低矮米数牌，不遮挡中央视场与落坑地面）
    const cx = EXPLOSION_SPAWN.x, sz = EXPLOSION_SPAWN.z;
    for (const dist of EXPLOSION_RANGE_MARKERS) {
      const z = sz - dist;
      // 左右两侧短标线（中段留给真实弹坑形变，避免横跨炮坑悬空）
      Box(`RangeTickL${dist}`, "Line", cx - 12.5, 0.015, z, 3.6, 0.03, 0.14, false);
      Box(`RangeTickR${dist}`, "Line", cx + 12.5, 0.015, z, 3.6, 0.03, 0.14, false);
      Box(`RangePostL${dist}`, "Boundary", cx - 15.2, 0.28, z, 0.14, 0.56, 0.14, false);
      this.Label(sink, `RangeDist${dist}`, `${dist} m`, cx - 15.2, 0.62, z + 0.08, 1.9);
    }

    // 侧方按需战车停放坪（远离主投弹中心线，默认空坪，面板选中某型战车后才放上对应实模）
    const pad = EXPLOSION_VEHICLE_PAD;
    Box("VehicleSidePad", "Pad", pad.x, 0.03, pad.z, 6.2, 0.06, 7.6, true, "testPad");

    // 场地四周低矮围墙（保留边界墙体碰撞，供穿墙截断验证）
    const b = this.bounds;
    for (const x of [b.minX + 0.5, b.maxX - 0.5]) Box("SideBoundary", "Boundary", x, 1.4, (b.minZ + b.maxZ) / 2, 1, 2.8, b.maxZ - b.minZ);
    for (const z of [b.minZ + 0.5, b.maxZ - 0.5]) Box("EndBoundary", "Boundary", (b.minX + b.maxX) / 2, 1.4, z, b.maxX - b.minX, 2.8, 1);

    for (const mesh of sink.Flush(this.scene, { Get: (key) => this.materials.get(key) })) {
      if (mesh.material.isMeshBasicMaterial) mesh.castShadow = false;
      this.meshes.push(mesh);
    }
    this.colliders = sink.colliders;
    this.covers = [];
    this.stats.structures = sink.colliders.length;

    // 可按需开关的目标掩体沙袋墙（用于测试温雷空爆越过掩体杀伤掩体后日军）
    this._BuildCoverWall();
  }

  _BuildCoverWall() {
    const group = new THREE.Group();
    group.name = "ExplosionTargetCoverWall";
    const bagMat = this.materials.get("Sandbag");
    const timberMat = this.materials.get("Timber");
    const geos = [];
    const Add = (geo, mat, x, y, z) => {
      geos.push(geo);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    };
    // 8 米宽、1.05 米高错缝沙袋低墙 + 两侧木桩支撑
    for (let row = 0; row < 3; row += 1) {
      const count = row % 2 === 0 ? 8 : 7;
      for (let i = 0; i < count; i += 1) {
        const x = (i - (count - 1) * 0.5) * 0.96;
        Add(new THREE.BoxGeometry(0.90, 0.34, 0.62), bagMat, x, 0.17 + row * 0.34, 0);
      }
    }
    for (const x of [-3.9, 0, 3.9]) {
      Add(new THREE.BoxGeometry(0.14, 1.12, 0.14), timberMat, x, 0.56, 0.36);
    }
    group.visible = false;
    group.userData.geometries = geos;
    this.scene.add(group);
    this.coverWallGroup = group;
  }

  /** 按需显示或隐藏靶区低掩体（与物理碰撞盒同步，隐藏时场地彻底还原为空旷平地）。 */
  SetCoverWall(visible, zPos = EXPLOSION_SPAWN.z - 20.2) {
    if (!this.coverWallGroup) return false;
    this.coverWallGroup.visible = !!visible;
    const x = EXPLOSION_SPAWN.x;
    const y = this.BaseGroundHeight(x, zPos);
    this.coverWallGroup.position.set(x, y, zPos);
    if (this.coverCollider) {
      const idx = this.colliders.indexOf(this.coverCollider);
      if (idx >= 0) this.colliders.splice(idx, 1);
      this.coverCollider = null;
    }
    if (visible) {
      this.coverCollider = {
        minX: x - 4.0, maxX: x + 4.0, minY: y, maxY: y + 1.05, minZ: zPos - 0.36, maxZ: zPos + 0.36,
        tag: "sandbag",
      };
      this.colliders.push(this.coverCollider);
    }
    return this.coverWallGroup.visible;
  }

  /** 预载三款日军战车资产但默认全部隐藏，不在进场时一股脑塞满场地。 */
  async LoadVehicles() {
    for (const spec of EXPLOSION_VEHICLES) {
      const doc = await LoadDocument(`./Model/Model_${spec.id}.tzm.json`);
      if (!doc) throw new Error(`Missing vehicle ${spec.id}`);
      const model = InstantiateModel(doc, {
        materials: { armor: this.materials.get("Armor"), steel: this.library.Get("Steel"), track: this.materials.get("Track") },
      });
      model.root.name = `ExplosionVehicle_${spec.id}`;
      model.root.position.set(spec.x, spec.y + 0.06, spec.z);
      model.root.visible = false;
      this.scene.add(model.root);
      this.models.set(spec.id, model);
    }
  }

  /** 切换侧方坪上唯一出场的战车（id=null 表示清空不放战车）。 */
  SetActiveVehicle(id) {
    const next = id && this.models.has(id) ? id : null;
    this.activeVehicleId = next;
    for (const [key, model] of this.models) {
      model.root.visible = key === next;
      if (key === next) {
        const spec = EXPLOSION_VEHICLES.find((s) => s.id === key);
        if (spec) model.root.position.set(spec.x, spec.y + 0.06, spec.z);
      }
    }
    if (this.vehicleCollider) {
      const idx = this.colliders.indexOf(this.vehicleCollider);
      if (idx >= 0) this.colliders.splice(idx, 1);
      this.vehicleCollider = null;
    }
    if (next) {
      const pad = EXPLOSION_VEHICLE_PAD;
      const hw = next === "Type97ChiHa" ? 1.25 : 1.08;
      this.vehicleCollider = {
        minX: pad.x - hw, maxX: pad.x + hw, minY: 0, maxY: 2.2, minZ: pad.z - 2.3, maxZ: pad.z + 2.3,
        tag: "testVehicle",
      };
      this.colliders.push(this.vehicleCollider);
    }
    return this.activeVehicleId;
  }

  Dispose() {
    for (const model of this.models.values()) {
      this.scene.remove(model.root);
      model.root.traverse((o) => o.geometry?.dispose());
    }
    this.models.clear();
    if (this.coverWallGroup) {
      this.scene.remove(this.coverWallGroup);
      for (const geo of this.coverWallGroup.userData.geometries || []) geo.dispose();
      this.coverWallGroup = null;
    }
    super.Dispose();
    for (const material of this.materials.values()) material.dispose();
    for (const texture of this.textures) texture.dispose();
    this.materials.clear();
    this.textures.length = 0;
  }
}
