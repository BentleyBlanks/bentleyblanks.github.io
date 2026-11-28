// 炮击扬尘 / 人物反应测试场共用世界（?impacts=1 / ?reactions=1）：
// 地形、四段样条壕沟、枯树、外部布景、汽油桶、重机枪与战车阵地锚点均从
// Scenes/TestShellImpact/Scene_TestShellImpact.json 读取（缺失时退回 BuildShellImpactLayout）。
import * as THREE from "three";
import { FirstLevelWhiteboxField } from "./Script_FirstLevelWhiteboxField.mjs";
import { BreakableTrees } from "./Script_BreakableTrees.mjs";
import { BuildSink } from "./Script_World.mjs";
import { LoadDocument, InstantiateModel } from "./Script_MeshLoad.mjs";
import { MESHES, TYPE92_HMG_SURFACE } from "./Data_Meshes.mjs";
import { MeshUrl } from "./Script_Meshes.mjs";
import { SHELL_IMPACT_GROUND_TINT } from "./Data_ShellImpactRangeTerrain.mjs";
import { BuildShellImpactLayout } from "./Script_ShellImpactRangeTerrain.mjs";
import {
  SHELL_IMPACT_WORLD, SHELL_IMPACT_CAMERA_FAR, SHELL_IMPACT_TREES, SHELL_IMPACT_DRUMS, SHELL_IMPACT_MG, SHELL_IMPACT_TANKS,
} from "./Data_ShellImpactRange.mjs";

const DRUM = Object.freeze({ radiusM: 0.29, heightM: 0.88, ribRadiusM: 0.3, ribTubeM: 0.022, ribsAt: [0.2, 0.68] });
/** 桶漆：军绿 / 锈褐 / 深灰，按序号轮换。 */
const DRUM_COLORS = Object.freeze([0x5b6247, 0x7b4b33, 0x464a49]);

export class ShellImpactRangeField extends FirstLevelWhiteboxField {
  constructor(scene, library, options = {}) {
    const layout = options.whiteboxLayout || BuildShellImpactLayout();
    super(scene, library, { ...options, whiteboxLayout: layout });
    this.cameraFar = SHELL_IMPACT_CAMERA_FAR;
    this.worldLimits = { ...this.bounds, groundLimit: SHELL_IMPACT_WORLD.groundLimit };
    this.sceneryMaterials = new Map();
    this.tankModels = new Map();
    this.mgDoc = null;
    this.tankDocs = new Map();
    this.sceneryStats = { drums: 0, mg: 0, trees: 0 };
  }

  _TreeSpecs() {
    if (Array.isArray(this.layout?.sceneTrees) && this.layout.sceneTrees.length) {
      return this.layout.sceneTrees;
    }
    return SHELL_IMPACT_TREES.map((tree) => ({
      id: tree.id, x: tree.x, z: tree.z, ry: tree.ry, scale: tree.scale, region: "ImpactRange",
    }));
  }

  _DrumSpecs() {
    const markers = (this.layout?.landmarks || []).filter((m) => m.meta?.kind === "drum");
    if (markers.length) {
      return markers.map((m) => ({ id: m.id, x: m.x, z: m.z, yaw: m.ry || 0, tilt: m.meta?.tilt ?? 0 }));
    }
    return SHELL_IMPACT_DRUMS;
  }

  _MgSpec() {
    const marker = (this.layout?.landmarks || []).find((m) => m.meta?.kind === "mg");
    if (marker) {
      return { weaponId: marker.meta.weaponId || SHELL_IMPACT_MG.weaponId, x: marker.x, z: marker.z, yaw: marker.ry || 0 };
    }
    return SHELL_IMPACT_MG;
  }

  _TankSpecs() {
    const markers = (this.layout?.landmarks || []).filter((m) => m.meta?.kind === "tank" && Object.hasOwn(SHELL_IMPACT_TANKS, m.meta.tankId));
    if (markers.length) {
      return Object.fromEntries(markers.map((m) => [m.meta.tankId, { x: m.x, z: m.z, yaw: m.ry || 0 }]));
    }
    return SHELL_IMPACT_TANKS;
  }

  DirectLaunchPoint(spec) {
    const marker = this.layout?.landmarks?.find((entry) => entry.meta?.kind === "directLaunch" && entry.meta.munitionId === spec.id);
    return marker ? { ...spec.launchPoint, x: marker.x, z: marker.z } : spec.launchPoint;
  }

  async PrepareAssets() {
    await super.PrepareAssets();
    this.breakableTrees = await BreakableTrees.Load(this, this._TreeSpecs());
    this.sceneryStats.trees = this.breakableTrees.trees.length;
    const mgSpec = this._MgSpec();
    const tanksMap = this._TankSpecs();
    const urls = Object.keys(tanksMap).map((id) => [id, `./Model/Model_${id}.tzm.json`]);
    const [finish] = MESHES[mgSpec.weaponId]?.pbrSets ?? [];
    const mgUrl = MESHES[mgSpec.weaponId] ? MeshUrl(mgSpec.weaponId) : `./Model/Model_${mgSpec.weaponId}.tzm.json`;
    const finishLoad = mgSpec.weaponId === "Type92Hmg" && finish && !this.library.baked.has(finish.name)
      ? this.library.LoadExternalSet(finish.name, finish).catch(() => {}) : null;
    const [, mg, ...tanks] = await Promise.all([
      finishLoad, LoadDocument(mgUrl),
      ...urls.map(([, url]) => LoadDocument(url)),
    ]);
    this.mgDoc = mg;
    urls.forEach(([id], index) => this.tankDocs.set(id, tanks[index]));
  }

  *BuildSteps() {
    for (const step of super.BuildSteps()) {
      if (step.progress >= 1) { this.BuildScenery(); this.BuildCollisionGrid(); }
      yield step;
    }
  }

  Material(key, params) {
    let material = this.sceneryMaterials.get(key);
    if (!material) {
      material = this.library.Plain(key, params);
      this.sceneryMaterials.set(key, material);
    }
    return material;
  }

  BuildWhiteBoxes() {
    super.BuildWhiteBoxes();
    const tintTuple = this.layout?.groundTint || SHELL_IMPACT_GROUND_TINT;
    const tint = new THREE.Color().setRGB(tintTuple[0], tintTuple[1], tintTuple[2], THREE.SRGBColorSpace);
    for (const mesh of this.meshes) {
      if (!mesh.userData.trenchEarth || !mesh.userData.groundSurface) continue;
      const color = mesh.geometry.attributes.color;
      if (!color) continue;
      for (let i = 0; i < color.count; i++) color.setXYZ(i, color.getX(i) * tint.r, color.getY(i) * tint.g, color.getZ(i) * tint.b);
      color.needsUpdate = true;
    }
  }

  /** 汽油桶 + 重机枪：BuildSink 合批，碰撞照登记。 */
  BuildScenery() {
    const sink = new BuildSink();
    sink.SetSector("ShellImpactScenery");
    const keys = new Map();
    const Key = (key, params) => { keys.set(key, this.Material(key, params)); return key; };
    DRUM_COLORS.forEach((color, i) => Key(`ImpactDrum${i}`, { color, roughness: 0.62, metalness: 0.45 }));
    Key("ImpactDrumRib", { color: 0x2c2f2f, roughness: 0.55, metalness: 0.6 });
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), quaternion = new THREE.Quaternion(),
      scale = new THREE.Vector3(1, 1, 1), euler = new THREE.Euler();
    const body = new THREE.CylinderGeometry(DRUM.radiusM, DRUM.radiusM, DRUM.heightM, 14, 1);
    const rib = new THREE.TorusGeometry(DRUM.ribRadiusM, DRUM.ribTubeM, 5, 14);
    for (const [index, drum] of this._DrumSpecs().entries()) {
      const ground = this.StaticGroundHeight(drum.x, drum.z);
      const lying = drum.tilt === 1;
      const y = ground + (lying ? DRUM.radiusM : DRUM.heightM / 2);
      euler.set(0, drum.yaw, lying ? Math.PI / 2 : 0, "YXZ");
      quaternion.setFromEuler(euler);
      position.set(drum.x, y, drum.z);
      matrix.compose(position, quaternion, scale);
      sink.Add(`ImpactDrum${index % DRUM_COLORS.length}`, body.clone().applyMatrix4(matrix));
      for (const at of DRUM.ribsAt) {
        const local = new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, DRUM.heightM * (at - 0.5), 0);
        sink.Add("ImpactDrumRib", rib.clone().applyMatrix4(matrix.clone().multiply(local)));
      }
      const half = lying ? [DRUM.heightM / 2, DRUM.radiusM, DRUM.radiusM] : [DRUM.radiusM, DRUM.heightM / 2, DRUM.radiusM];
      if (lying) sink.Solid(drum.x, y, drum.z, half[0], half[1], half[2], "prop", drum.yaw);
      else sink.Solid(drum.x, y, drum.z, half[0], half[1], half[2], "prop");
      this.sceneryStats.drums += 1;
    }
    body.dispose(); rib.dispose();
    this.BakeMachineGun(sink, keys);
    for (const mesh of sink.Flush(this.scene, { Get: (key) => keys.get(key) || this.whiteMaterial })) {
      mesh.name = `ShellImpactScenery_${mesh.name}`;
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.meshes.push(mesh);
    }
    this.colliders.push(...sink.colliders);
    this.covers.push(...sink.covers);
  }

  /** 九二式重机枪（三脚架）：模型是 tzm，网格烘进 BuildSink（枪口朝 -Z；yaw 0 = 朝北）。 */
  BakeMachineGun(sink, keys) {
    const spec = this._MgSpec();
    if (!this.mgDoc) return;
    const steel = this.Material("ImpactMgSteel", { color: 0x565b4c, roughness: 0.55, metalness: 0.2 });
    const type92Exterior = this.library.baked.has("Type92HmgExterior")
      ? this.library.Get("Type92HmgExterior", TYPE92_HMG_SURFACE) : steel;
    keys.set("ImpactMgSteel", steel);
    keys.set("ImpactMgExterior", type92Exterior);
    const built = InstantiateModel(this.mgDoc, { materials: { steel, type92Exterior }, batch: true });
    const bounds = built.bounds;
    const cx = (bounds.min.x + bounds.max.x) / 2, cz = (bounds.min.z + bounds.max.z) / 2;
    const ground = this.StaticGroundHeight(spec.x, spec.z);
    built.root.rotation.y = spec.yaw;
    const offset = new THREE.Vector3(-cx, -bounds.min.y, -cz).applyAxisAngle(new THREE.Vector3(0, 1, 0), spec.yaw);
    built.root.position.set(spec.x + offset.x, ground + offset.y, spec.z + offset.z);
    built.root.updateMatrixWorld(true);
    built.root.traverse((object) => {
      if (!object.isMesh) return;
      const key = object.material === steel ? "ImpactMgSteel" : "ImpactMgExterior";
      sink.Add(key, object.geometry.clone().applyMatrix4(object.matrixWorld));
    });
    for (const mesh of built.meshes) mesh.geometry.dispose();
    const half = Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) / 2;
    sink.Solid(spec.x, ground + 0.28, spec.z, half * 0.7, 0.28, half * 0.7, "prop", spec.yaw);
    this.sceneryStats.mg = 1;
  }

  /** 战车炮发射阵地：两辆现有战车（动态模型，炮口坐标给 Script_ShellImpactRange 取）。 */
  async LoadVehicles() {
    const armor89 = this.library.Get("Type89Armor", { side: THREE.DoubleSide });
    const track = this.library.Get("Type89Track", { side: THREE.DoubleSide });
    const steel = this.Material("ImpactTankSteel", { color: 0x40443c, roughness: 0.6, metalness: 0.3 });
    const armorFlat = this.Material("ImpactTankArmor", { color: 0x5b6350, roughness: 0.78, metalness: 0.15, side: THREE.DoubleSide });
    for (const [id, spec] of Object.entries(this._TankSpecs())) {
      const doc = this.tankDocs.get(id);
      if (!doc) throw new Error(`Missing vehicle model ${id}`);
      const built = InstantiateModel(doc, { materials: {
        armor: armorFlat, track: this.Material("ImpactTankTrack", { color: 0x2c2d2a, roughness: 0.9 }), steel,
        type89Armor: armor89, type89Barrel: armor89, type89Track: track,
      } });
      built.root.name = `ShellImpactTank_${id}`;
      const c = Math.cos(spec.yaw), s = Math.sin(spec.yaw);
      const Ground = (dx, dz) => this.GroundHeight(spec.x + dx * c + dz * s, spec.z - dx * s + dz * c);
      const y = (Ground(0, -1.8) + Ground(0, 1.8) + Ground(-1, 0) + Ground(1, 0)) / 4;
      built.root.position.set(spec.x, y, spec.z);
      built.root.rotation.y = spec.yaw;
      built.root.traverse((object) => { if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; } });
      this.scene.add(built.root);
      built.root.updateMatrixWorld(true);
      this.tankModels.set(id, built);
    }
  }

  /** 战车炮口的世界坐标（Script_ShellImpactRange.Fire 用）；没有这辆车返回 null。 */
  TankMuzzle(id) {
    const built = this.tankModels.get(id);
    const node = built?.nodes.get("gunMuzzle");
    if (!node) return null;
    built.root.updateMatrixWorld(true);
    return node.getWorldPosition(new THREE.Vector3());
  }

  Dispose() {
    for (const built of this.tankModels.values()) {
      this.scene.remove(built.root);
      built.root.traverse((object) => object.geometry?.dispose());
    }
    this.tankModels.clear();
    this.sceneryMaterials.clear();
    super.Dispose();
  }
}

export default ShellImpactRangeField;
