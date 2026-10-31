// 炮击扬尘测试场的世界（?impacts=1）：一片第一关同款的分层土壤地形 + 样条壕沟网络，外加布景。
//
// 继承 FirstLevelWhiteboxField —— 它已经包了这一切：连续可变形的土壤高度场（弹坑、Rapier 贴地、角色贴地共用同一份）、
// RefineCells 沟壁细分、MissionPlain 分层地形 PBR（底土 / 草茬 / 沟边翻土）、壕沟表面土块 / 根毯 / 石头
//（BuildTrenchEarth / BuildTrenchSurface）。这里只给它一份自己的布局（Data_ShellImpactRangeTerrain）并补布景：
//   · 枯树（Model_BreakableDeadTree，炮击能打断）走 BreakableTrees.Load 的自带种树表；
//   · 汽油桶、九二式重机枪：静态几何走 BuildSink 合批，碰撞盒照常登记；
//   · 碉堡 / 弹药箱 / 补给箱 / 炮弹堆 / 沙袋：Script_ExternalProps 的 placementsOnly（Script_Main 在建关时接）；
//   · 战车炮的发射阵地：两辆现有战车模型（动态模型，同爆炸测试场 LoadVehicles）。
// 布景坐标一律在 Data_ShellImpactRange，这里不写数。
import * as THREE from "three";
import { FirstLevelWhiteboxField } from "./Script_FirstLevelWhiteboxField.mjs";
import { BreakableTrees } from "./Script_BreakableTrees.mjs";
import { BuildSink } from "./Script_World.mjs";
import { LoadDocument, InstantiateModel } from "./Script_MeshLoad.mjs";
import { BuildShellImpactLayout, SHELL_IMPACT_GROUND_TINT } from "./Data_ShellImpactRangeTerrain.mjs";
import {
  SHELL_IMPACT_WORLD, SHELL_IMPACT_CAMERA_FAR, SHELL_IMPACT_TREES, SHELL_IMPACT_DRUMS, SHELL_IMPACT_MG, SHELL_IMPACT_TANKS,
} from "./Data_ShellImpactRange.mjs";

const DRUM = Object.freeze({ radiusM: 0.29, heightM: 0.88, ribRadiusM: 0.3, ribTubeM: 0.022, ribsAt: [0.2, 0.68] });
/** 桶漆：军绿 / 锈褐 / 深灰，按序号轮换。 */
const DRUM_COLORS = Object.freeze([0x5b6247, 0x7b4b33, 0x464a49]);

export class ShellImpactRangeField extends FirstLevelWhiteboxField {
  constructor(scene, library, options = {}) {
    super(scene, library, { ...options, whiteboxLayout: BuildShellImpactLayout() });
    this.cameraFar = SHELL_IMPACT_CAMERA_FAR;
    this.worldLimits = { ...this.bounds, groundLimit: SHELL_IMPACT_WORLD.groundLimit };
    this.sceneryMaterials = new Map();
    this.tankModels = new Map();
    this.mgDoc = null;
    this.tankDocs = new Map();
    this.sceneryStats = { drums: 0, mg: 0, trees: 0 };
  }

  async PrepareAssets() {
    await super.PrepareAssets();
    // 枯树：自带种树表（第一关的 MakeTreePlacements 只认第一关的坐标）。
    this.breakableTrees = await BreakableTrees.Load(this, SHELL_IMPACT_TREES.map((tree) => ({
      id: tree.id, x: tree.x, z: tree.z, ry: tree.ry, scale: tree.scale, region: "ImpactRange",
    })));
    this.sceneryStats.trees = this.breakableTrees.trees.length;
    const urls = Object.keys(SHELL_IMPACT_TANKS).map((id) => [id, `./Model/Model_${id}.tzm.json`]);
    const [mg, ...tanks] = await Promise.all([
      LoadDocument(`./Model/Model_${SHELL_IMPACT_MG.weaponId}.tzm.json`),
      ...urls.map(([, url]) => LoadDocument(url)),
    ]);
    this.mgDoc = mg;
    urls.forEach(([id], index) => this.tankDocs.set(id, tanks[index]));
  }

  *BuildSteps() {
    for (const step of super.BuildSteps()) {
      // 最后一步之前补布景：碰撞盒要赶在 BuildCollisionGrid 之前进表（super 在 progress 1 那一步已建过一次，这里重建）。
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

  /**
   * 地面铺完之后：沟沿抛土裙面（trenchEarth 里吃地面材质的那几片）的顶点色在基类里固定写 1，
   * 而地面本身按 SHELL_IMPACT_GROUND_TINT 偏了黄褐 —— 两边不一致就是一圈灰带。这里把同一个偏色补到这些裙面上
   *（地面顶点色按 sRGB 写进去，所以这里也按 sRGB 转线性再乘）。
   */
  BuildWhiteBoxes() {
    super.BuildWhiteBoxes();
    const tint = new THREE.Color().setRGB(SHELL_IMPACT_GROUND_TINT[0], SHELL_IMPACT_GROUND_TINT[1], SHELL_IMPACT_GROUND_TINT[2], THREE.SRGBColorSpace);
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
    for (const [index, drum] of SHELL_IMPACT_DRUMS.entries()) {
      const ground = this.StaticGroundHeight(drum.x, drum.z);
      // tilt 1：倒在地上的桶（圆柱横着，轴向按 yaw）。
      const lying = drum.tilt === 1;
      const y = ground + (lying ? DRUM.radiusM : DRUM.heightM / 2);
      euler.set(lying ? 0 : 0, drum.yaw, lying ? Math.PI / 2 : 0, "YXZ");
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
    const spec = SHELL_IMPACT_MG;
    if (!this.mgDoc) return;
    // 不用金属度高的 Steel：场里没有环境反射时它是一团黑。深橄榄灰的哑光漆，远看也读得出轮廓。
    const steel = this.Material("ImpactMgSteel", { color: 0x565b4c, roughness: 0.55, metalness: 0.2 });
    keys.set("ImpactMgSteel", steel);
    const built = InstantiateModel(this.mgDoc, { materials: { steel }, batch: true });
    // 模型原点在握把，三脚架脚底在 y = −0.246，枪身中心在 x ≈ −0.2、z ≈ −0.32：把脚底中心放到摆位点。
    const bounds = built.bounds;
    const cx = (bounds.min.x + bounds.max.x) / 2, cz = (bounds.min.z + bounds.max.z) / 2;
    const ground = this.StaticGroundHeight(spec.x, spec.z);
    built.root.rotation.y = spec.yaw;
    const offset = new THREE.Vector3(-cx, -bounds.min.y, -cz).applyAxisAngle(new THREE.Vector3(0, 1, 0), spec.yaw);
    built.root.position.set(spec.x + offset.x, ground + offset.y, spec.z + offset.z);
    built.root.updateMatrixWorld(true);
    built.root.traverse((object) => {
      if (object.isMesh) sink.Add("ImpactMgSteel", object.geometry.clone().applyMatrix4(object.matrixWorld));
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
    // 八九式有自己的装甲贴图；九五式 / 九七式的 UV 是另一套，套八九式的图会花成格子，用哑光军绿。
    const armorFlat = this.Material("ImpactTankArmor", { color: 0x5b6350, roughness: 0.78, metalness: 0.15, side: THREE.DoubleSide });
    for (const [id, spec] of Object.entries(SHELL_IMPACT_TANKS)) {
      const doc = this.tankDocs.get(id);
      if (!doc) throw new Error(`Missing vehicle model ${id}`);
      const built = InstantiateModel(doc, { materials: {
        armor: armorFlat, track: this.Material("ImpactTankTrack", { color: 0x2c2d2a, roughness: 0.9 }), steel,
        type89Armor: armor89, type89Barrel: armor89, type89Track: track,
      } });
      built.root.name = `ShellImpactTank_${id}`;
      // 车头（炮口）局部 -Z；yaw = π/2 → 朝西（-X）。四点取地高，车体贴坡。
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
