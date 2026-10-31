// 枪械编辑器：一把一把地看 Data_Weapons 里那十六条。
//
// 只有台架：这把枪**建出来是什么样**（剪影、比例、挂点）。绕着转，1 m 米格量长度。
// 玩家手里那一份（Script_Viewmodel 的 rig）在「第一人称持枪检查」里看 —— 2026-10-31 起
// 这里原来的「第一人称」视图连同它的动作按钮与放大准心校准都搬了过去，不再两处各一套。
// 原来的「手持」只是 ActorFactory 世界几何的重复检查，早已移除。
//
// 数据面板照抄 Data_Weapons 的字段并标出哪些是**史料**、哪些是**手感调校值** ——
// 那张表头注写得很清楚：尺寸性能有来源，recoil/sway/adsTime 是调出来的。

import * as THREE from "three";
import { Panel, Section, Toggle, Facts, ListBox } from "./Script_EditorUi.mjs";
import { WEAPONS, AMMO, LOADOUTS } from "./Data_Weapons.mjs";
import { MESHES, WEAPON_MESH_BY_ID, BAYONET_MESH_BY_WEAPON } from "./Data_Meshes.mjs";
import { EXTERNAL_GLB_STANDARDS } from "./Data_AssetStandards.mjs";
import { Mulberry32 } from "./Script_Noise.mjs";

const KIND_LABEL = {
  boltRifle: "栓动步枪", lmg: "轻机枪", hmg: "重机枪", pistol: "手枪",
  throwable: "投掷物", melee: "近战", mortar: "曲射/架设武器", vehicle: "车辆",
};
const SIDE_SHORT = { nra: "中", ija: "日", neutral: "待考" };
const SIDE_LONG = {
  nra: "中方（第 22 集团军）", ija: "日方（濑谷支队）",
  neutral: "阵营/来源待考（仅用于资产识别）",
};
const KIND_LABEL_BY_ID = {
  MediumMortar: "迫击炮",
};

function KindLabel(id) {
  return KIND_LABEL_BY_ID[id] || KIND_LABEL[WEAPONS[id]?.kind] || WEAPONS[id]?.kind || "待考";
}

/**
 * 有没有几何。**判据是模型表，不是 kind。**
 *
 * 原来写的是「kind 不是 vehicle 也不是 mortar」——那是在用「这一类东西没人建过模型」
 * 当判据。掷弹筒与两辆车现在都有 .tzm 了，判据要换成「Model 里有没有这一件」，
 * 否则下一件新模型进来还得回这儿改一次。
 */
function HasGeometry(id) {
  const w = WEAPONS[id];
  if (!w) return false;
  if (MESHES[WEAPON_MESH_BY_ID[id]]) return true;
  return w.kind !== "vehicle" && w.kind !== "mortar";
}

/** 车辆：台架上要落地摆、不能像枪那样平举在 1.1 m，人也拿不了它。 */
function IsVehicle(id) {
  const w = WEAPONS[id];
  return !!w && w.kind === "vehicle" && !!MESHES[WEAPON_MESH_BY_ID[id]];
}

/** 架设武器/弹体在台架上按自身包围盒落地，不沿用手枪的 1.1 m 平举姿态。 */
function IsGroundedBench(id) {
  const w = WEAPONS[id];
  return !!w && (w.emplaced === true || w.kind === "mortar")
    && !!MESHES[WEAPON_MESH_BY_ID[id]];
}

/**
 * WeaponGeometry 为人物动作把枪管/刀刃统一到局部 -Z；台架必须再还原成检视姿态。
 *
 * 架设武器不能共用一个「都抬 58°」的猜值：源模型的炮管与规范长轴夹角各不
 * 相同，共用角度会让轻迫击器直挺、另一门炮又整架侧倒。这里逐件按识别截图校正，
 * 外层随后统一用最终包围盒落地，所以脚架/底钣不会因转姿态而悬空。
 */
function BenchPose(id) {
  if (id === "OfficerSwordSet") {
    return { x: -Math.PI / 2, y: 0, z: 0 };
  }
  if (id === "Type92Hmg") {
    // 九二式的三脚架在源几何里已经水平落地；这里只写死零俯仰并由外层包围盒落地，
    // 不能再沿用手持枪的 1.1 m 展示高度，也不能套迫击炮的抬角。
    return { x: 0, y: 0, z: 0 };
  }
  if (id === "MediumMortar") {
    return { x: Math.PI * 0.34, y: 0, z: 0 };
  }
  return { x: 0, y: 0, z: 0 };
}

/** 可切换预览的刺刀必须既有规则支持，也有可挂到枪口的独立模型。 */
function CanPreviewBayonet(id) {
  return !!(WEAPONS[id]?.bayonet && BAYONET_MESH_BY_WEAPON[id]);
}

export class WeaponEditor {
  static id = "weapon";
  static label = "枪械";
  static hint = "台架 + 数据卡";

  constructor(host) {
    this.host = host;
    this.studio = host.studio;
    this.panel = null;
    this.cameraMode = "studio";
    this.weaponId = "ZhongZheng";
    this.weaponVariant = 0;
    this.spin = false;
    this.time = 0;
    this.benchGroup = null;
    this.benchBayonet = null;
    this.vehicleNodes = null;
    this.materials = null;
    this.bayonetPreview = false;
  }

  Enter(root) {
    this.studio.Open(this.host.hideInStudio);
    this.panel = Panel({
      title: "枪械编辑器", sub: "",
      variant: "work", onClose: () => this.host.Close(),
    });
    root.appendChild(this.panel.root);
    this.BuildUi(this.panel.body);
    this.SetWeapon(this.weaponId);
    return this;
  }

  Exit() {
    this.ClearStand();
    // 台架期间藏起玩家手里那一把（它挂在相机上，会挡在展台前面），退出时放回来
    if (this.host.viewmodel) this.host.SetViewmodelVisible(true);
    if (this.panel) this.panel.root.remove();
    this.panel = null;
    this.studio.Close();
  }

  // -------------------------------------------------------------------------
  // 界面
  // -------------------------------------------------------------------------

  BuildUi(body) {
    const pick = Section(body, "武器表");
    this.list = ListBox(pick, { height: 216, onPick: (id) => this.SetWeapon(id) });
    this.list.Fill(Object.keys(WEAPONS).map((id) => {
      const w = WEAPONS[id];
      return {
        id, name: `${w.name}`, tail: `${SIDE_SHORT[w.side] || "待考"}·${KindLabel(id)}`,
        title: w.fullName,
      };
    }));
    this.list.Select(this.weaponId);

    const view = Section(body, "台架");
    const opts = document.createElement("div");
    opts.className = "edBtns";
    view.appendChild(opts);
    this.bayonetToggle = Toggle(opts, "上刺刀预览", false, (on) => {
      this.bayonetPreview = on;
      this.ApplyBayonetPreview();
    });
    Toggle(opts, "自转", false, (on) => { this.spin = on; });
    Toggle(opts, "米格", true, (on) => this.studio.SetGridVisible(on));

    const data = Section(body, "数据卡");
    this.facts = Facts(data, ["模型"]);

    this.RefreshControls();
  }

  /**
   * 选一把枪。`variant` 是**外观变体**序号（见 Data_Meshes.WEAPON_MESH_VARIANTS），
   * 大刀固定使用二十九军战刀；旧变体编号由 WeaponMeshId 回到默认模型，
   * 变体接口保留供其他武器扩展，玩法数值始终读取武器本身的条目。
   */
  SetWeapon(id, variant = 0) {
    this.weaponId = id;
    this.weaponVariant = variant | 0;
    this.bayonetPreview = false;
    if (this.bayonetToggle) this.bayonetToggle.Set(false);
    this.Rebuild();
    this.ApplyBayonetPreview();
    this.RefreshCard();
    this.RefreshControls();
  }

  OnDrag(dx, dy, button) {
    if (this.studio.Active) this.studio.Drag(dx, dy, button);
  }

  RefreshControls() {
    const canPreview = CanPreviewBayonet(this.weaponId);
    if (this.bayonetToggle) this.bayonetToggle.root.hidden = !canPreview;
    if (!canPreview && this.bayonetPreview) {
      this.bayonetPreview = false;
      this.bayonetToggle?.Set(false);
    }
  }

  ApplyBayonetPreview() {
    if (this.benchBayonet) this.benchBayonet.visible = this.bayonetPreview && CanPreviewBayonet(this.weaponId);
  }

  // -------------------------------------------------------------------------
  // 展台
  // -------------------------------------------------------------------------

  ClearStand() {
    this.studio.ClearStand();
    this.benchGroup = null;
    this.benchBayonet = null;
    this.vehicleNodes = null;
  }

  /** 换镜头。退出编辑器时 Studio.Close 会把进来之前那一份原样还回去，
      所以这里只管当前这一档，不必自己存。 */
  SetStudioFov(fov) {
    const camera = this.studio.camera;
    if (!camera || camera.fov === fov) return;
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }

  Rebuild() {
    this.ClearStand();
    this.time = 0;
    const factory = this.host.actorFactory;
    const weapon = WEAPONS[this.weaponId];
    if (!factory || !weapon) return;

    this.host.SetViewmodelVisible(false);
    this.SetStudioFov(42);

    // 台架：把 WeaponGeometry 的每个材质桶各建一个网格，平举在 1.1 m 高
    if (!HasGeometry(this.weaponId)) {
      this.studio.Frame(1.2, 3.0);
      return;
    }
    if (!this.materials) this.materials = factory.ActorMaterials("nra", Mulberry32(7));

    // 车辆：**整棵树落地摆**。不走 WeaponGeometry —— 那条路只收 root 直属的网格，
    // 而炮塔是关节、几何在 turret 节点里，走那条路整个炮塔会不见。
    // 也不抬到 1.1 m：车的原点在地面，抬起来就是一辆悬空的坦克。
    if (IsVehicle(this.weaponId)) {
      const built = factory.ModelInstance(WEAPON_MESH_BY_ID[this.weaponId], this.materials);
      if (built) {
        const holder = new THREE.Group();
        holder.add(built.root);
        holder.rotation.y = Math.PI / 2;      // 车头朝 -Z，转成正侧面看全长
        this.studio.stand.add(holder);
        this.benchGroup = holder;
        this.vehicleNodes = built.nodes;
      }
      const len = weapon.lengthM || 4;
      this.studio.Frame(weapon.heightM || 2, Math.max(4.5, len * 1.9));
      this.studio.orbit.target.set(0, (weapon.heightM || 2) * 0.5, 0);
      this.studio.ApplyCamera();
      return;
    }
    // 台架刺刀由编辑器单独挂载，才能真实切换「上 / 不上」两种外观；常规 Actor
    // 仍按默认规则把高画质刺刀并入武器几何，不改变战场表现。
    const built = factory.WeaponGeometry(this.weaponId, this.weaponVariant | 0, { includeBayonet: false });
    const group = new THREE.Group();
    const pose = new THREE.Group();
    group.add(pose);
    for (const [key, geometry] of built.geometries) {
      const mesh = new THREE.Mesh(geometry, this.materials[key] || this.materials.steel);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      pose.add(mesh);
    }
    const benchPose = BenchPose(this.weaponId);
    pose.rotation.set(benchPose.x, benchPose.y, benchPose.z);
    // 枪的规范朝向是枪口指 -Z，而起手机位也在 -Z —— 不转的话开场是「看着枪口」。
    // 转 90° 变成正侧面：全长、护木分段、表尺、刺刀座一次看全。
    group.rotation.y = Math.PI / 2;
    const grounded = IsGroundedBench(this.weaponId);
    const benchBounds = new THREE.Box3().setFromObject(group);
    const benchSpan = benchBounds.getSize(new THREE.Vector3());
    if (grounded) {
      group.position.y = -benchBounds.min.y;
    } else {
      group.position.y = 1.1;
    }
    this.studio.stand.add(group);
    this.benchGroup = group;

    // 枪口 / 前握两个挂点画成小方块：挂点错位是「枪口焰长在弹匣上」这类事故的根
    const MarkerAt = (vec, hex) => {
      if (!vec) return;
      const marker = new THREE.Mesh(
        new THREE.BoxGeometry(0.016, 0.016, 0.016),
        new THREE.MeshBasicMaterial({ color: hex }));
      marker.position.copy(vec);
      pose.add(marker);
    };
    MarkerAt(built.muzzle, 0xd6604a);
    MarkerAt(built.gripFront, 0x9dc0e4);
    if (CanPreviewBayonet(this.weaponId) && built.muzzle) {
      const bayonet = factory.ModelInstance(BAYONET_MESH_BY_WEAPON[this.weaponId], this.materials);
      const socketNode = bayonet?.nodes.get("socket");
      if (bayonet) {
        bayonet.root.updateMatrixWorld(true);
        const socket = socketNode
          ? new THREE.Vector3().setFromMatrixPosition(socketNode.matrixWorld)
          : new THREE.Vector3();
        bayonet.root.position.set(
          built.muzzle.x - socket.x,
          built.muzzle.y - socket.y,
          built.muzzle.z - socket.z + 0.012,
        );
        bayonet.root.visible = this.bayonetPreview;
        pose.add(bayonet.root);
        this.benchBayonet = bayonet.root;
      }
    }
    const targetY = grounded ? Math.max(0.08, benchSpan.y * 0.5) : 1.1;
    this.studio.Frame(grounded ? Math.max(0.7, benchSpan.y) : 1.2,
      Math.max(1.4, (weapon.lengthM || 1) * 2.0));
    this.studio.orbit.target.set(0, targetY, 0);
    this.studio.ApplyCamera();
  }

  // -------------------------------------------------------------------------
  // 每帧
  // -------------------------------------------------------------------------

  Update(dt) {
    this.time += dt;
    if (this.benchGroup && this.spin) this.benchGroup.rotation.y += dt * 0.6;
    if (this.host.lights) {
      this.host.lights.UpdateShadowFrustum(
        new THREE.Vector3(0, 1.0, 0), new THREE.Vector3(0, 0, -1));
    }
  }

  /** 数据卡：换枪时刷一次就够，不必每帧重排 DOM。 */
  RefreshCard() {
    const w = WEAPONS[this.weaponId];
    if (!w || !this.facts) return;
    this.facts.Clear();
    const F = (k, v, tone = "") => this.facts.Set(k, v, tone);
    F("全称", w.fullName);
    F("阵营", SIDE_LONG[w.side] || "阵营/来源待考（仅用于资产识别）");
    F("类别", KindLabel(this.weaponId));
    if (w.ammo) {
      const a = AMMO[w.ammo];
      F("弹药", a ? `${a.label} ${a.caliber} · ${a.muzzle} m/s` : w.ammo);
    }
    if (w.lengthM) F("全长", `${(w.lengthM * 1000).toFixed(0)} mm`);
    if (w.bayonetTotalM) F("上刺刀全长", `${(w.bayonetTotalM * 1000).toFixed(0)} mm`);
    if (w.barrelM) F("枪管", `${(w.barrelM * 1000).toFixed(0)} mm`);
    if (w.massKg) F("质量", `${w.massKg.toFixed(2)} kg`);
    if (w.massT) F("质量", `${w.massT} t`);
    if (w.magazine) F("弹仓", `${w.magazine} 发 · ${w.reloadKind || "—"}`);
    if (w.rpm) F("理论射速", `${w.rpm} 发/分`);
    if (w.fireIntervalS) F("射击间隔", `${w.fireIntervalS.toFixed(3)} s`);
    if (w.boltTimeS) F("拉栓", `${w.boltTimeS.toFixed(2)} s`);
    if (w.reloadTimeS) F("装填", `${w.reloadTimeS.toFixed(2)} s`);
    if (w.damage) F("躯干伤害", w.damage);
    if (w.headMultiplier) F("头部倍率", `×${w.headMultiplier}`);
    if (w.effectiveRangeM) F("有效射程", `${w.effectiveRangeM} m`);
    if (w.radiusM) F("杀伤半径", `${w.radiusM} m`);
    if (w.fuseS) F("延期", `${w.fuseS} s`);
    if (w.armorMm) F("装甲", `${w.armorMm[0]}—${w.armorMm[1]} mm`);
    if (w.recoil) {
      F("后坐 pitch/yaw", `${w.recoil.pitch} / ${w.recoil.yaw}`, "warn");
      F("回落 recoverS", `${w.recoil.recoverS} s（残留 ${(1 - w.recoil.recoverFrac) * 100}%）`, "warn");
    }
    if (w.adsTimeS) F("开镜时间", `${w.adsTimeS} s`, "warn");
    if (w.spreadHipDeg) F("散布 腰/镜", `${w.spreadHipDeg}° / ${w.spreadAdsDeg}°`, "warn");
    if (w.bayonet) F("刺刀", `${(w.bayonetLengthM * 1000).toFixed(0)} mm`);

    const meshId = WEAPON_MESH_BY_ID[this.weaponId];
    const mesh = meshId ? MESHES[meshId] : null;
    const authored = this.weaponId==='HanYang' ? EXTERNAL_GLB_STANDARDS.find(asset=>asset.id==='HanYang173R') : null;
    if (authored) {
      F("模型", `${authored.pack} · ${authored.actualTriangles} 三角`);
    } else if (mesh) {
      F("模型", `${mesh.file} · ${mesh.triangles} 三角`);
      F("draw call", `high ${mesh.draws.high} / low ${mesh.draws.low}`);
    } else {
      F("模型", "无（数据条目，不出现在手里）", "bad");
    }
    // 携行表里谁带这把枪 —— 改武器数值之前先知道它进不进玩家的手
    const carriers = Object.entries(LOADOUTS)
      .filter(([, l]) => l.primary === this.weaponId || l.secondary === this.weaponId
        || l.melee === this.weaponId || (l.throwables && l.throwables[this.weaponId]))
      .map(([id]) => id);
    F("玩家携行", carriers.length ? carriers.join(" ") : "（不进玩家背包）");

  }
}

export default WeaponEditor;
