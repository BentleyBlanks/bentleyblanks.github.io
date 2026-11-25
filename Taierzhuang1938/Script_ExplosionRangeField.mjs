// Explosion range whitebox: static deformable ground, boundaries, range ticks and vehicle pad
// come from Scenes/TestExplosion/Scene_TestExplosion.json; dynamic cover wall and on-demand
// vehicles attach to scene markers.
import * as THREE from "three";
import { TestSceneField, CreateSignAtlas, AddAtlasSignToSink } from "./Script_TestSceneField.mjs";
import { LoadDocument, InstantiateModel } from "./Script_MeshLoad.mjs";
import { EXPLOSION_SPAWN, EXPLOSION_VEHICLES, EXPLOSION_VEHICLE_PAD } from "./Data_ExplosionRange.mjs";

export class ExplosionRangeField extends TestSceneField {
  constructor(scene, library, options = {}) {
    super(scene, library, {
      defaultSector: "ExplosionRange",
      defaultColliderTag: "testFixture",
      defaultRoughness: 0.96,
      ...options,
    });
    this.models = new Map();
    this.activeVehicleId = null;
    this.coverWallGroup = null;
    this.coverCollider = null;
    this.vehicleCollider = null;
    this.cameraFar = 360;
    this.worldLimits = { ...this.bounds, groundLimit: 4000 };
  }

  _CloneFlatMaterial(name, colorHex) {
    let mat = this.ownedMaterials.get(name);
    if (!mat) {
      mat = this.library.Get("Ground").clone();
      mat.map = null; mat.normalMap = null; mat.roughnessMap = null; mat.metalnessMap = null; mat.aoMap = null;
      mat.color.setHex(colorHex);
      mat.roughness = 0.96;
      mat.metalness = 0;
      this.ownedMaterials.set(name, mat);
    }
    return mat;
  }

  BuildExtraStructures(sink, materialMap) {
    const signMarkers = this.Markers((m) => !!m.meta?.signId);
    if (signMarkers.length) {
      const signs = signMarkers.map((m) => ({ id: m.meta.signId, text: m.meta.text || m.name, sub: "" }));
      const atlas = CreateSignAtlas(signs, {
        cols: 3, tileW: 512, tileH: 140,
        background: "#1a2326", textColor: "#e8e3d2", borderColor: "#b89f63",
        titleFont: "bold 62px sans-serif", titleY: 72, insetPx: 2, anisotropy: 4,
      });
      this.ownedTextures.push(atlas.texture);
      const signMat = new THREE.MeshBasicMaterial({
        name: "ExplosionRangeSigns",
        map: atlas.texture,
        toneMapped: false,
      });
      this.ownedMaterials.set("ExplosionRangeSigns", signMat);
      materialMap.set("ExplosionRangeSigns", signMat);
      sink.SetSector("ExplosionSigns");
      for (const m of signMarkers) {
        const w = m.meta.w || 1.9;
        AddAtlasSignToSink(sink, "ExplosionRangeSigns", atlas, m.meta.signId,
          m.x, m.y ?? 0.62, m.z, w, w * 140 / 512, 0, m.ry || 0);
      }
    }
    this._BuildCoverWall();
  }

  _BuildCoverWall() {
    const group = new THREE.Group();
    group.name = "ExplosionTargetCoverWall";
    const bagMat = this._CloneFlatMaterial("ExplosionSandbag", 0x9b8e72);
    const timberMat = this._CloneFlatMaterial("ExplosionTimber", 0x624d38);
    const geos = [];
    const Add = (geo, mat, x, y, z) => {
      geos.push(geo);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    };
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
  SetCoverWall(visible, zPos = null) {
    if (!this.coverWallGroup) return false;
    const anchor = this.Marker("DefaultCoverWall");
    const targetZ = zPos ?? anchor?.z ?? (EXPLOSION_SPAWN.z - 20.2);
    const x = anchor?.x ?? EXPLOSION_SPAWN.x;
    const y = typeof this.BaseGroundHeight === "function" ? this.BaseGroundHeight(x, targetZ) : this.GroundHeight(x, targetZ);
    this.coverWallGroup.visible = !!visible;
    this.coverWallGroup.position.set(x, y, targetZ);
    if (this.coverCollider) {
      const idx = this.colliders.indexOf(this.coverCollider);
      if (idx >= 0) this.colliders.splice(idx, 1);
      this.coverCollider = null;
    }
    if (visible) {
      this.coverCollider = {
        minX: x - 4.0, maxX: x + 4.0, minY: y, maxY: y + 1.05, minZ: targetZ - 0.36, maxZ: targetZ + 0.36,
        tag: "sandbag",
      };
      this.colliders.push(this.coverCollider);
    }
    return this.coverWallGroup.visible;
  }

  /** 预载三款日军战车资产但默认全部隐藏，不在进场时一股脑塞满场地。 */
  async LoadVehicles() {
    const padAnchor = this.Marker("VehiclePadAnchor");
    const padX = padAnchor?.x ?? EXPLOSION_VEHICLE_PAD.x;
    const padZ = padAnchor?.z ?? EXPLOSION_VEHICLE_PAD.z;
    const armorMat = this._CloneFlatMaterial("ExplosionArmor", 0x555c4a);
    const trackMat = this._CloneFlatMaterial("ExplosionTrack", 0x3b3d3c);
    for (const spec of EXPLOSION_VEHICLES) {
      const doc = await LoadDocument(`./Model/Model_${spec.id}.tzm.json`);
      if (!doc) throw new Error(`Missing vehicle ${spec.id}`);
      const model = InstantiateModel(doc, {
        materials: { armor: armorMat, steel: this.library.Get("Steel"), track: trackMat },
      });
      model.root.name = `ExplosionVehicle_${spec.id}`;
      model.root.position.set(padX, (spec.y || 0) + 0.06, padZ);
      model.root.visible = false;
      this.scene.add(model.root);
      this.models.set(spec.id, model);
    }
  }

  /** 切换侧方坪上唯一出场的战车（id=null 表示清空不放战车）。 */
  SetActiveVehicle(id) {
    const padAnchor = this.Marker("VehiclePadAnchor");
    const padX = padAnchor?.x ?? EXPLOSION_VEHICLE_PAD.x;
    const padZ = padAnchor?.z ?? EXPLOSION_VEHICLE_PAD.z;
    const next = id && this.models.has(id) ? id : null;
    this.activeVehicleId = next;
    for (const [key, model] of this.models) {
      model.root.visible = key === next;
      if (key === next) {
        const spec = EXPLOSION_VEHICLES.find((s) => s.id === key);
        if (spec) model.root.position.set(padX, (spec.y || 0) + 0.06, padZ);
      }
    }
    if (this.vehicleCollider) {
      const idx = this.colliders.indexOf(this.vehicleCollider);
      if (idx >= 0) this.colliders.splice(idx, 1);
      this.vehicleCollider = null;
    }
    if (next) {
      const hw = 1.08;
      this.vehicleCollider = {
        minX: padX - hw, maxX: padX + hw, minY: 0, maxY: 2.2, minZ: padZ - 2.3, maxZ: padZ + 2.3,
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
  }
}

export default ExplosionRangeField;
