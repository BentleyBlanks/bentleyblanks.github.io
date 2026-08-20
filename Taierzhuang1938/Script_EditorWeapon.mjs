// 枪械编辑器：一把一把地看 Data_Weapons 里那十六条。
//
// 三种看法，各回答一个不同的问题：
//   台架   —— 这把枪**建出来是什么样**（剪影、比例、挂点）。绕着转，1 m 米格量长度。
//   手持   —— 人拿着它是什么样（挂点在不在肩上、两手够不够得着前握）。
//   第一人称 —— 玩家真正看到的那一份（Script_Viewmodel 的 rig，与手持是两套几何）。
//
// 「第一人称与手持是两套几何」是这个项目的既定结构，不是 bug：
// 视图模型要在近裁面里假装 FOV、压深度、做后坐弹簧，用世界几何直接摆会穿模。
// 所以这里两种都留，改了任一边都能立刻对照另一边。
//
// 数据面板照抄 Data_Weapons 的字段并标出哪些是**史料**、哪些是**手感调校值** ——
// 那张表头注写得很清楚：尺寸性能有来源，recoil/sway/adsTime 是调出来的。

import * as THREE from "three";
import { Panel, Section, Slider, Chips, Toggle, ButtonRow, Facts, Note, ListBox }
  from "./Script_EditorUi.mjs";
import { WEAPONS, AMMO, LOADOUTS } from "./Data_Weapons.mjs";
import { MESHES, WEAPON_MESH_BY_ID } from "./Data_Meshes.mjs";
import { Mulberry32 } from "./Script_Noise.mjs";

const KIND_LABEL = {
  boltRifle: "栓动步枪", lmg: "轻机枪", hmg: "重机枪", pistol: "手枪",
  throwable: "投掷物", melee: "近战", mortar: "掷弹筒", vehicle: "车辆",
};

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

/** 人能拿在手里的。车辆不算 —— 手持那一栏对它没有意义。 */
function IsHandheld(id) {
  return HasGeometry(id) && !IsVehicle(id);
}

/**
 * 有没有第一人称视图模型。**掷弹筒也没有** —— 视图模型是给**玩家自己的枪**建的
 * 一套单独几何（Script_Viewmodel 的 rig），中方玩家永远不会端着日军的掷弹筒。
 * 让它去 Equip 一个没登记的 id 只会拿到一支空手。
 */
function IsViewmodel(id) {
  const w = WEAPONS[id];
  return IsHandheld(id) && !!w && w.kind !== "mortar";
}

export class WeaponEditor {
  static id = "weapon";
  static label = "枪械";
  static hint = "台架 / 手持 / 第一人称三视图 + 数据卡";

  constructor(host) {
    this.host = host;
    this.studio = host.studio;
    this.panel = null;
    this.cameraMode = "studio";
    this.weaponId = "ZhongZheng";
    this.mode = "bench";        // bench | held | fp
    this.spin = true;
    this.time = 0;
    this.actor = null;
    this.benchGroup = null;
    this.vehicleNodes = null;
    this.materials = null;
    this.ads = 0;
    this.autoFire = false;
    this.fireTimer = 0;
    this.actorState = { aim: 1, firing: false, throwing: 0, melee: 0, elapsed: 0 };
    this.pulse = null;          // { key, t, dur } 手持模式下的一次性动作
  }

  Enter(root) {
    this.studio.Open(this.host.hideInStudio);
    this.panel = Panel({
      title: "枪械编辑器", sub: "Data_Weapons",
      variant: "work", onClose: () => this.host.Close(),
    });
    root.appendChild(this.panel.root);
    this.BuildUi(this.panel.body);
    this.SetWeapon(this.weaponId);
    return this;
  }

  Exit() {
    this.ClearStand();
    if (this.host.viewmodel) {
      // 还回玩家手里那一把：不还的话退出编辑器之后玩家举着刚才预览的枪
      this.host.SetViewmodelVisible(true);
      if (this.host.playerWeaponId) this.host.viewmodel.Equip(this.host.playerWeaponId);
    }
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
        id, name: `${w.name}`, tail: `${w.side === "nra" ? "中" : "日"}·${KIND_LABEL[w.kind] || w.kind}`,
        title: w.fullName,
      };
    }));
    this.list.Select(this.weaponId);

    const view = Section(body, "视图");
    Chips(view, [
      { value: "bench", label: "台架" },
      { value: "held", label: "手持" },
      { value: "fp", label: "第一人称" },
    ], this.mode, (v) => this.SetMode(v));
    const opts = document.createElement("div");
    opts.className = "edBtns";
    view.appendChild(opts);
    Toggle(opts, "自转", true, (on) => { this.spin = on; });
    Toggle(opts, "米格", true, (on) => this.studio.SetGridVisible(on));

    const act = Section(body, "动作");
    ButtonRow(act, [
      { label: "开火", onClick: () => this.Trigger("fire") },
      { label: "拉栓", onClick: () => this.Trigger("bolt") },
      { label: "装填", onClick: () => this.Trigger("reload") },
      { label: "白刃", onClick: () => this.Trigger("melee") },
      { label: "投掷", onClick: () => this.Trigger("throw") },
    ]);
    const autoBox = document.createElement("div");
    autoBox.className = "edBtns";
    act.appendChild(autoBox);
    Toggle(autoBox, "连续开火", false, (on) => { this.autoFire = on; this.fireTimer = 0; });
    this.adsSlider = Slider(act, {
      label: "开镜", min: 0, max: 1, step: 0.01, value: 0,
      onInput: (v) => { this.ads = v; },
    });
    Note(act, "开火/拉栓只在「第一人称」与「手持」里有动作；台架是静态几何。");

    const data = Section(body, "数据卡");
    this.facts = Facts(data);
    this.noteEl = Note(data, "");
    this.sourceNote = Note(data, "", true);
  }

  SetMode(mode) {
    this.mode = mode;
    this.Rebuild();
  }

  SetWeapon(id) {
    this.weaponId = id;
    this.Rebuild();
    this.RefreshCard();
  }

  Trigger(kind) {
    const viewmodel = this.host.viewmodel;
    if (this.mode === "fp" && viewmodel) {
      if (kind === "fire") viewmodel.TriggerFire();
      else if (kind === "bolt") viewmodel.TriggerBolt();
      else if (kind === "reload") viewmodel.TriggerReload();
      else if (kind === "melee") viewmodel.TriggerMelee();
      else if (kind === "throw") viewmodel.TriggerThrow(1);
      return;
    }
    if (this.mode === "held" && this.actor) {
      if (kind === "fire") { this.actorState.firing = true; this.pulse = { key: "fire", t: 0, dur: 0.08 }; }
      else if (kind === "bolt") { this.actorState.firing = true; this.pulse = { key: "fire", t: 0, dur: 0.08 }; }
      else if (kind === "throw") this.pulse = { key: "throwing", t: 0, dur: 1.1 };
      else if (kind === "melee") this.pulse = { key: "melee", t: 0, dur: 0.7 };
      else if (kind === "reload") this.pulse = { key: "throwing", t: 0, dur: 0.6 };
    }
  }

  // -------------------------------------------------------------------------
  // 展台
  // -------------------------------------------------------------------------

  ClearStand() {
    if (this.actor) { this.actor.Dispose(); this.actor = null; }
    this.studio.ClearStand();
    this.benchGroup = null;
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

    this.host.SetViewmodelVisible(this.mode === "fp");

    if (this.mode === "fp") {
      if (this.host.viewmodel) this.host.viewmodel.Equip(IsViewmodel(this.weaponId) ? this.weaponId : null);
      // 第一人称的枪挂在相机上，展台上什么也不放；镜头退到一个看得见枪的距离。
      //
      // **FOV 必须换回正片的 55°。** 摄影棚为了看模型不畸变把相机压到 42
      // （85 mm 等效），而视图模型的每一处位姿都是按 BASE_FOV=55 摆的 ——
      // 42° 的画框比 55° 窄三成，枪整个掉到画面右下角外头去，这一栏只剩地面。
      // 台架/手持两档再换回 42，两种看法各自的镜头语言不串。
      this.SetStudioFov(55);
      this.studio.Frame(1.7, 2.6);
      return;
    }
    this.SetStudioFov(42);

    if (this.mode === "held") {
      const kind = weapon.side === "ija" ? "ija" : "nra";
      this.actor = factory.Create(kind, { seed: 5, weapon: IsHandheld(this.weaponId) ? this.weaponId : null });
      this.studio.stand.add(this.actor.root);
      this.studio.Frame(1.75, 3.2);
      return;
    }

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
    const built = factory.WeaponGeometry(this.weaponId);
    const group = new THREE.Group();
    for (const [key, geometry] of built.geometries) {
      const mesh = new THREE.Mesh(geometry, this.materials[key] || this.materials.steel);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    group.position.y = 1.1;
    // 枪的规范朝向是枪口指 -Z，而起手机位也在 -Z —— 不转的话开场是「看着枪口」。
    // 转 90° 变成正侧面：全长、护木分段、表尺、刺刀座一次看全。
    group.rotation.y = Math.PI / 2;
    this.studio.stand.add(group);
    this.benchGroup = group;

    // 枪口 / 前握两个挂点画成小方块：挂点错位是「枪口焰长在弹匣上」这类事故的根
    const MarkerAt = (vec, hex) => {
      if (!vec) return;
      const marker = new THREE.Mesh(
        new THREE.BoxGeometry(0.016, 0.016, 0.016),
        new THREE.MeshBasicMaterial({ color: hex }));
      marker.position.copy(vec);
      group.add(marker);
    };
    MarkerAt(built.muzzle, 0xd6604a);
    MarkerAt(built.gripFront, 0x9dc0e4);
    this.studio.Frame(1.2, Math.max(1.4, (weapon.lengthM || 1) * 2.0));
    this.studio.orbit.target.set(0, 1.1, 0);
    this.studio.ApplyCamera();
  }

  // -------------------------------------------------------------------------
  // 每帧
  // -------------------------------------------------------------------------

  Update(dt) {
    this.time += dt;
    const weapon = WEAPONS[this.weaponId];

    if (this.autoFire && weapon) {
      this.fireTimer -= dt;
      if (this.fireTimer <= 0) {
        this.fireTimer = Math.max(0.08, weapon.fireIntervalS || 1.2);
        this.Trigger("fire");
      }
    }

    if (this.mode === "bench" && this.benchGroup && this.spin) {
      this.benchGroup.rotation.y += dt * 0.6;
    }

    if (this.mode === "held" && this.actor) {
      const s = this.actorState;
      s.elapsed = this.time;
      s.firing = false;
      s.throwing = 0; s.melee = 0;
      if (this.pulse) {
        this.pulse.t += dt;
        const k = Math.min(1, this.pulse.t / this.pulse.dur);
        if (this.pulse.key === "fire") s.firing = this.pulse.t < 0.05;
        else s[this.pulse.key] = Math.sin(k * Math.PI);
        if (this.pulse.t >= this.pulse.dur) this.pulse = null;
      }
      this.actor.Update(dt, {
        moveSpeed: 0, aim: this.ads * 0.6 + 0.4, crouch: 0, prone: 0,
        firing: s.firing, throwing: s.throwing, melee: s.melee,
        lookYaw: 0, lookPitch: 0, elapsed: s.elapsed,
      });
      if (this.spin) this.actor.root.rotation.y += dt * 0.5;
    }

    if (this.mode === "fp" && this.host.viewmodel) {
      this.host.viewmodel.Update(dt, {
        dt, moveSpeed: 0, strafe: 0, grounded: true, sprint: 0,
        ads: this.ads, lookDeltaYaw: 0, lookDeltaPitch: 0,
        crouch: 0, elapsed: this.time, lowAmmo: false,
      });
    }

    if (this.host.lights) {
      this.host.lights.UpdateShadowFrustum(
        new THREE.Vector3(0, 1.0, 0), new THREE.Vector3(0, 0, -1));
    }
    this.RefreshLive();
  }

  RefreshLive() {
    if (!this.facts) return;
    const viewmodel = this.host.viewmodel;
    this.facts.Set("视图", { bench: "台架", held: "手持", fp: "第一人称" }[this.mode]);
    if (this.mode === "fp" && viewmodel) {
      this.facts.Set("rig 来源", viewmodel.rigSource, viewmodel.rigSource === "model" ? "good" : "");
      this.facts.Set("栓在后", viewmodel.boltOpen ? "是" : "否");
      this.facts.Set("动作中", viewmodel.IsBusy && viewmodel.IsBusy() ? "是" : "否");
    }
  }

  /** 数据卡：换枪时刷一次就够，不必每帧重排 DOM。 */
  RefreshCard() {
    const w = WEAPONS[this.weaponId];
    if (!w || !this.facts) return;
    this.facts.Clear();
    const F = (k, v, tone = "") => this.facts.Set(k, v, tone);
    F("全称", w.fullName);
    F("阵营", w.side === "nra" ? "中方（第 22 集团军）" : "日方（濑谷支队）");
    F("类别", KIND_LABEL[w.kind] || w.kind);
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
    if (mesh) {
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

    this.noteEl.textContent = w.note || "";
    this.sourceNote.textContent = "标琥珀色的几项（后坐 / 开镜 / 散布）是**手感调校值**，"
      + "不是史料；尺寸与初速有来源，见 docs/Data_HistoryMaterial.md。";
  }
}

export default WeaponEditor;
