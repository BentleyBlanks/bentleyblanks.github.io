// Script_TimedGrenade.mjs — 爆炸测试场特制拉线温雷木柄手榴弹（仅限爆炸测试场，不改变通用手榴弹契约）。
//
// 职责：
//   1. 状态机：stowed → ready → pulling → cooking → throwing → rearming（含超时手里自爆与安全模式）；
//   2. 第一人称特制木柄弹附加件：Seedream 红布警示环、编织麻绳拉火线、瓷珠拉环、敞口铜尾管与炽热火芯；
//   3. 第一人称与飞行中特效：Seedream 2×2 拉火火花图集与引信硫磺细烟图集、火星溅射、动态暖光、飞行尾迹；
//   4. 准星环引信倒计时提示（可开关）；所有玩家可见文案走 T("range.explosion.timed.*")。

import * as THREE from "three";
import { WEAPONS } from "./Data_Weapons.mjs";
import { TIMED_GRENADE } from "./Data_TimedGrenade.mjs";
import { Clamp01, Mulberry32 } from "./Script_Noise.mjs";
import { T } from "./Script_Text.mjs";

const TMP_POS = new THREE.Vector3();
const TMP_POS2 = new THREE.Vector3();
const TMP_DIR = new THREE.Vector3();
const TMP_TAIL = new THREE.Vector3();
const TMP_TAIL_AXIS = new THREE.Vector3();
const TMP_QUAT = new THREE.Quaternion();
const TMP_EULER = new THREE.Euler(0, 0, 0, "YXZ");
const UP = new THREE.Vector3(0, 1, 0);

const Mix = (a, b, t) => a + (b - a) * t;
const Smooth = (t) => { const x = Clamp01(t); return x * x * (3 - 2 * x); };
const Seg = (t, a, b) => Clamp01((t - a) / Math.max(1e-5, b - a));

/** 把 2×2 图集格号（0..3）写进平面几何 UV（0 左上、1 右上、2 左下、3 右下）。 */
function SetQuadCellUv(geometry, cell) {
  const col = cell & 1;
  const row = (cell >> 1) & 1;
  const u0 = col * 0.5, u1 = u0 + 0.5;
  const v1 = 1 - row * 0.5, v0 = v1 - 0.5;
  const uv = geometry.attributes.uv;
  uv.setXY(0, u0, v1);
  uv.setXY(1, u1, v1);
  uv.setXY(2, u0, v0);
  uv.setXY(3, u1, v0);
  uv.needsUpdate = true;
}

/** 构造一段只采样图集指定 V 区的圆柱侧壁 UV（上区军布，下区麻绳）。 */
function RemapCylinderV(geometry, vMin, vMax, uRepeat = 1) {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) {
    uv.setXY(i, uv.getX(i) * uRepeat, Mix(vMin, vMax, uv.getY(i)));
  }
  uv.needsUpdate = true;
  return geometry;
}

export class TimedStickGrenade {
  constructor(host) {
    this.host = host; // { battlefield, combat, player, camera, scene, library, vfx, audio, hud, viewmodel, CanUse, OnDetonate }
    this.rnd = Mulberry32(19380324);
    this.enabled = false;
    this.state = "stowed"; // "stowed" | "ready" | "pulling" | "cooking" | "throwing" | "rearming"
    this.fuseDurationS = TIMED_GRENADE.defaultFuseS;
    this.showTimer = true;
    this.overcookExplodes = true;

    this.pullT = 0;
    this.pullMode = "hold"; // "hold" | "latch"
    this.releaseQueued = false;
    this.ignited = false;
    this.cookTime = 0;
    this.remainingFuse = this.fuseDurationS;
    this.rearmTimer = 0;
    this.igniteFlashT = 0;
    this.hissTimer = 0;
    this.sparkCarry = 0;
    this.smokeCarry = 0;
    this.elapsed = 0;
    this.throwPower = TIMED_GRENADE.overarmPower;
    this.cordSway = new THREE.Vector2();
    this.cordVel = new THREE.Vector2();
    this.lastYaw = 0;
    this.lastPitch = 0;

    this.stats = {
      pulls: 0,
      throws: 0,
      airbursts: 0,
      overcooks: 0,
      lastThrow: null,
    };

    this.flights = [];
    this.attachedGrenade = null;
    this.textures = {};
    this.materials = {};
    this.disposables = [];

    this._LoadTextures();
    this._BuildMaterials();
    this._BuildPropKit();
    this._BuildFirstPersonVfx();
    this._BuildCrosshairHud();
  }

  _LoadTextures() {
    const loader = new THREE.TextureLoader();
    const Load = (key, url, { srgb = true, wrap = false } = {}) => {
      const tex = loader.load(url);
      tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      if (wrap) {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
      }
      tex.needsUpdate = true;
      this.textures[key] = tex;
      this.disposables.push(tex);
      return tex;
    };
    const T_URLS = TIMED_GRENADE.textures;
    Load("spark", T_URLS.sparkAtlas, { srgb: true });
    Load("smoke", T_URLS.smokeAtlas, { srgb: true });
    Load("bandBase", T_URLS.bandBase, { srgb: true, wrap: true });
    Load("bandNormal", T_URLS.bandNormal, { srgb: false, wrap: true });
    Load("bandOrm", T_URLS.bandOrm, { srgb: false, wrap: true });
  }

  _BuildMaterials() {
    const bandMat = new THREE.MeshStandardMaterial({
      map: this.textures.bandBase,
      normalMap: this.textures.bandNormal,
      roughnessMap: this.textures.bandOrm,
      aoMap: this.textures.bandOrm,
      roughness: 0.92,
      metalness: 0.0,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0x8f7443,
      roughness: 0.44,
      metalness: 0.72,
    });
    const cavityMat = new THREE.MeshStandardMaterial({
      color: 0x12100e,
      roughness: 0.96,
      metalness: 0.1,
    });
    const beadMat = new THREE.MeshStandardMaterial({
      color: 0xe6dfd0,
      roughness: 0.34,
      metalness: 0.04,
    });
    const emberMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.08, 0.05, 0.04),
      toneMapped: false,
    });
    this.materials = { band: bandMat, brass: brassMat, cavity: cavityMat, bead: beadMat, ember: emberMat };
    this.disposables.push(bandMat, brassMat, cavityMat, beadMat, emberMat);
  }

  _BuildPropKit() {
    const G = TIMED_GRENADE.geometry;
    const root = new THREE.Group();
    root.name = "TimedStickGrenadeKit";

    // 1) 铸铁弹头上的红褐军布警示带（采样 Seedream 图集上半区 v=0.38..0.96）
    const bandGeo = RemapCylinderV(
      new THREE.CylinderGeometry(G.bandRadiusM, G.bandRadiusM, G.bandHeightM, 24, 1, true),
      0.38, 0.96, 2
    );
    bandGeo.rotateX(Math.PI / 2);
    const band = new THREE.Mesh(bandGeo, this.materials.band);
    band.position.z = G.bandZ;
    band.name = "TimedGrenadeCautionBand";
    root.add(band);

    // 警示带两端细铜箍
    const trimGeo = new THREE.TorusGeometry(G.bandRadiusM + 0.0005, 0.0012, 6, 24);
    for (const dz of [-G.bandHeightM * 0.5, G.bandHeightM * 0.5]) {
      const trim = new THREE.Mesh(trimGeo, this.materials.brass);
      trim.position.z = G.bandZ + dz;
      root.add(trim);
    }

    // 2) 木柄颈部麻绳缠绕箍（采样 Seedream 图集下半区麻绳 v=0.05..0.32）
    const wrapGeo = RemapCylinderV(
      new THREE.CylinderGeometry(G.wrapRadiusM, G.wrapRadiusM, G.wrapHeightM, 18, 1, true),
      0.06, 0.31, 2
    );
    wrapGeo.rotateX(Math.PI / 2);
    const wrap = new THREE.Mesh(wrapGeo, this.materials.band);
    wrap.position.z = G.wrapZ;
    wrap.name = "TimedGrenadeHempCollar";
    root.add(wrap);

    // 3) 旋开底盖后露出的铜质螺纹尾口 + 深膛火口 + 炽热引信芯
    const tailCollarGeo = new THREE.CylinderGeometry(0.0150, 0.0146, 0.012, 18, 1, true);
    tailCollarGeo.rotateX(Math.PI / 2);
    const tailCollar = new THREE.Mesh(tailCollarGeo, this.materials.brass);
    tailCollar.position.z = G.tailZ - 0.002;
    root.add(tailCollar);

    const cavityGeo = new THREE.CircleGeometry(0.0122, 16);
    const cavity = new THREE.Mesh(cavityGeo, this.materials.cavity);
    cavity.position.z = G.tailZ + 0.0042;
    root.add(cavity);

    const emberGeo = new THREE.SphereGeometry(0.0062, 10, 8);
    const ember = new THREE.Mesh(emberGeo, this.materials.ember);
    ember.position.z = G.tailZ + 0.003;
    ember.scale.set(1, 1, 0.55);
    ember.userData.skipNormalDepth = true;
    root.add(ember);

    // 4) 动态编织拉火麻绳（多节小圆柱跟随曲线，待拉线时自然垂摆，拉线时紧绷拉长）
    const cordGroup = new THREE.Group();
    cordGroup.name = "TimedGrenadePullCord";
    const segGeo = RemapCylinderV(
      new THREE.CylinderGeometry(G.cordRadiusM, G.cordRadiusM, 1, 8, 1, false),
      0.06, 0.31, 1
    );
    const cordSegs = [];
    for (let i = 0; i < G.cordSegments; i += 1) {
      const m = new THREE.Mesh(segGeo, this.materials.band);
      cordGroup.add(m);
      cordSegs.push(m);
    }

    // 绳尾瓷珠与黄铜拉环
    const beadGroup = new THREE.Group();
    const beadGeo = new THREE.SphereGeometry(G.beadRadiusM, 12, 10);
    const bead = new THREE.Mesh(beadGeo, this.materials.bead);
    bead.scale.set(0.92, 0.92, 1.15);
    const ringGeo = new THREE.TorusGeometry(G.ringRadiusM, G.ringTubeM, 8, 18);
    const ring = new THREE.Mesh(ringGeo, this.materials.brass);
    ring.position.z = G.beadRadiusM + G.ringRadiusM * 0.72;
    ring.rotation.y = Math.PI * 0.5;
    beadGroup.add(bead, ring);
    cordGroup.add(beadGroup);
    root.add(cordGroup);

    // 5) 尾口锚点（给第一人称火花与烟雾取精确位置和喷射轴）
    const tailMouth = new THREE.Object3D();
    tailMouth.position.set(0, 0, G.tailZ + 0.007);
    root.add(tailMouth);

    // 6) 尾口核心喷焰十字面（Seedream 2×2 火花贴图，直接挂在尾口随柄动）
    const jetGroup = new THREE.Group();
    jetGroup.position.set(0, 0, G.tailZ + 0.010);
    const jetQuads = [];
    for (let i = 0; i < 2; i += 1) {
      const qGeo = new THREE.PlaneGeometry(1, 1);
      SetQuadCellUv(qGeo, i === 0 ? 0 : 1);
      const qMat = new THREE.MeshBasicMaterial({
        map: this.textures.spark,
        color: new THREE.Color(3.6, 2.2, 0.95),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      const qMesh = new THREE.Mesh(qGeo, qMat);
      qMesh.userData.skipNormalDepth = true;
      qMesh.frustumCulled = false;
      qMesh.castShadow = false;
      qMesh.receiveShadow = false;
      qMesh.rotation.y = i * Math.PI * 0.5;
      qMesh.rotation.x = Math.PI * 0.5;
      qMesh.position.z = 0.022;
      jetGroup.add(qMesh);
      jetQuads.push({ mesh: qMesh, geo: qGeo, mat: qMat });
      this.disposables.push(qGeo, qMat);
    }
    jetGroup.visible = false;
    root.add(jetGroup);

    // 7) 手部动态暖火点光（温雷时照亮木柄与手指）
    const fuseLight = new THREE.PointLight(0xff9b38, 0, TIMED_GRENADE.vfx.lightDistanceM, 2);
    fuseLight.position.set(0, 0, G.tailZ + 0.032);
    root.add(fuseLight);

    root.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.frustumCulled = false;
      obj.castShadow = false;
      obj.receiveShadow = false;
      if (!obj.userData.skipNormalDepth) obj.userData.firstPersonExternalGlb = true;
    });

    this.propKit = { root, band, wrap, ember, cordGroup, cordSegs, beadGroup, tailMouth, jetGroup, jetQuads, fuseLight };
    this.disposables.push(bandGeo, trimGeo, wrapGeo, tailCollarGeo, cavityGeo, emberGeo, segGeo, beadGeo, ringGeo);
  }

  _BuildFirstPersonVfx() {
    const V = TIMED_GRENADE.vfx;
    const group = new THREE.Group();
    group.name = "TimedGrenadeFpVfx";

    const MakePool = (count, texture, additive) => {
      const items = [];
      for (let i = 0; i < count; i += 1) {
        const geo = new THREE.PlaneGeometry(1, 1);
        SetQuadCellUv(geo, i % 4);
        const mat = new THREE.MeshBasicMaterial({
          map: texture,
          color: additive ? new THREE.Color(4.2, 2.7, 1.18) : new THREE.Color(0.92, 0.90, 0.85),
          transparent: true,
          opacity: 0,
          blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
          depthWrite: false,
          depthTest: true,
          toneMapped: !additive,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.visible = false;
        mesh.frustumCulled = false;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.userData.skipNormalDepth = true;
        mesh.renderOrder = additive ? 14 : 12;
        group.add(mesh);
        items.push({
          mesh, geo, mat,
          alive: false, age: 0, life: 0.3,
          pos: new THREE.Vector3(), vel: new THREE.Vector3(),
          size0: 0.02, size1: 0.06, rot: 0, spin: 0, opacity: 1,
        });
        this.disposables.push(geo, mat);
      }
      return items;
    };

    this.fpVfx = {
      group,
      sparks: MakePool(V.sparkPool, this.textures.spark, true),
      smokes: MakePool(V.smokePool, this.textures.smoke, false),
    };
  }

  _BuildCrosshairHud() {
    const el = document.createElement("div");
    el.className = "timedFuseHud";
    el.setAttribute("aria-live", "polite");
    el.innerHTML = `
      <svg class="tfRing" viewBox="0 0 88 88" aria-hidden="true">
        <circle class="tfTrack" cx="44" cy="44" r="34"></circle>
        <circle class="tfArc" cx="44" cy="44" r="34"></circle>
      </svg>
      <div class="tfTime"></div>
      <div class="tfHint"></div>`;
    el.hidden = true;
    document.body.append(el);
    const arc = el.querySelector(".tfArc");
    const circumference = 2 * Math.PI * 34;
    arc.style.strokeDasharray = `${circumference.toFixed(2)}`;
    arc.style.strokeDashoffset = `${circumference.toFixed(2)}`;
    this.hudEl = {
      root: el,
      arc,
      circumference,
      time: el.querySelector(".tfTime"),
      hint: el.querySelector(".tfHint"),
    };
  }

  // -------------------------------------------------------------------------
  // 公共控制接口（面板 / 快捷键 / 测试口）
  // -------------------------------------------------------------------------

  get Active() { return this.enabled && this.state !== "stowed"; }
  get Lit() { return this.ignited && (this.state === "pulling" || this.state === "cooking" || this.state === "throwing"); }

  Equip() {
    const vm = this.host.viewmodel;
    if (!vm) return false;
    this.enabled = true;
    if (this.host.state) {
      this.host.state.cooking = null;
      this.host.state.cook = 0;
      this.host.state.slots.throwable = "Grenade";
      this.host.state.activeSlot = "throwable";
    }
    if (this.host.ctx) this.host.ctx.currentWeapon = "Grenade";
    if (vm.weaponId !== "Grenade" || !vm.rig?.parts?.grenade) {
      vm.Equip("Grenade", 0, { instant: true });
    }
    this.host.hud?.SetWeaponName?.(T("range.explosion.timed.weaponName"));
    this._EnsureAttached();
    if (this.state === "stowed" || this.state === "rearming") {
      this._ResetToReady();
    }
    this._SyncHud();
    return true;
  }

  Stow({ force = false } = {}) {
    if (!force && this.Lit) return false;
    this.enabled = false;
    this.state = "stowed";
    this.ignited = false;
    this.pullT = 0;
    this.cookTime = 0;
    this.remainingFuse = this.fuseDurationS;
    this.releaseQueued = false;
    this.igniteFlashT = 0;
    this._DetachKit();
    this.host.viewmodel?.SetTimedGrenadePose?.(null);
    this._ClearFpVfx();
    this._SyncHud();
    return true;
  }

  SetFuseDuration(seconds) {
    const next = Number(seconds);
    if (!Number.isFinite(next) || next < 1.0 || next > 10.0) return this.fuseDurationS;
    this.fuseDurationS = next;
    if (!this.Lit) this.remainingFuse = next;
    return this.fuseDurationS;
  }

  SetShowTimer(on) {
    this.showTimer = on === undefined ? !this.showTimer : !!on;
    this._SyncHud();
    return this.showTimer;
  }

  SetOvercookExplodes(on) {
    this.overcookExplodes = on === undefined ? !this.overcookExplodes : !!on;
    return this.overcookExplodes;
  }

  /** 开始拉线（mode: "hold" = 松手投出，"latch" = 拉火后拿在手里等，再点左键/右键投出）。 */
  BeginPull(mode = "hold") {
    if (!this.host.player?.Alive) return false;
    if (!this.Active) this.Equip();
    if (this.state !== "ready") return false;
    this.state = "pulling";
    this.pullMode = mode;
    this.pullT = 0;
    this.ignited = false;
    this.releaseQueued = false;
    this.cookTime = 0;
    this.remainingFuse = this.fuseDurationS;
    this.throwPower = TIMED_GRENADE.overarmPower;
    this.stats.pulls += 1;
    return true;
  }

  /** 松开拉线键或点击投出（在拉线中松开会先完成拉火，再立刻投出）。 */
  RequestThrow(power = TIMED_GRENADE.overarmPower) {
    this.throwPower = Clamp01(power);
    if (this.state === "pulling") {
      this.releaseQueued = true;
      return true;
    }
    if (this.state === "cooking") {
      return this._LaunchThrow(this.throwPower);
    }
    return false;
  }

  /** 输入捕获（由 ExplosionRange.OnKey 转发）：返回 true = 消费，undefined = 交还通用键位。 */
  HandleInput(detail) {
    const { code, down, repeat } = detail;
    // KeyT：任意武器下按住直接掏出特制拉线木柄弹并拉线温雷，松开投出！
    if (code === "KeyT") {
      if (down && !repeat) {
        if (!this.Active) this.Equip();
        if (this.state === "ready") this.BeginPull("hold");
        else if (this.state === "cooking") this.RequestThrow(TIMED_GRENADE.overarmPower);
      } else if (!down) {
        if (this.pullMode === "hold" && (this.state === "pulling" || this.state === "cooking")) {
          this.RequestThrow(TIMED_GRENADE.overarmPower);
        }
      }
      return true;
    }
    // 切槽键：按 1 / 2 / 3 切步枪/大刀时收起未点火的特制弹；按 4 切回特制弹
    if (down && !repeat && (code === "Digit1" || code === "Digit2" || code === "Digit3")) {
      if (this.Lit) return true; // 已经拉火的雷不许塞回兜里！
      if (this.Active) this.Stow({ force: true });
      return undefined;
    }
    if (down && !repeat && code === "Digit4") {
      if (!this.Active) { this.Equip(); return true; }
      return true;
    }
    // G / H 普通弹快捷投掷：如果当前特制弹已拉火则阻挡；未拉火则放行通用 G/H 并暂时收起特制弹
    if (code === "KeyG" || code === "KeyH") {
      if (this.Lit) return true;
      if (down && !repeat && this.Active) this.Stow({ force: true });
      return undefined;
    }
    if (!this.Active) return undefined;

    // 持握特制木柄弹时的左右键交互：
    //   左键按下：未拉线 → 按住拉线并温雷（松开即投）；已拉线（右键模式） → 立即高抛投出
    //   右键按下：未拉线 → 拉线点火并握在手里等（松手不扔）；已拉线 → 近距轻抛投出
    if (code === "Mouse0") {
      if (down && !repeat) {
        if (this.state === "ready") this.BeginPull("hold");
        else if (this.state === "cooking") this.RequestThrow(TIMED_GRENADE.overarmPower);
      } else if (!down) {
        if (this.pullMode === "hold" && (this.state === "pulling" || this.state === "cooking")) {
          this.RequestThrow(TIMED_GRENADE.overarmPower);
        }
      }
      return true;
    }
    if (code === "Mouse2") {
      if (down && !repeat) {
        if (this.state === "ready") this.BeginPull("latch");
        else if (this.state === "cooking") this.RequestThrow(TIMED_GRENADE.underhandPower);
      }
      return true;
    }
    return undefined;
  }

  ActionPrompts() {
    if (!this.Active) return null;
    if (this.state === "ready") {
      return [
        { keys: T("hud.key.mouseLeft"), text: T("range.explosion.timed.promptHoldCook"), kind: "grenade" },
        { keys: T("hud.key.mouseRight"), text: T("range.explosion.timed.promptLatchPull") },
      ];
    }
    if (this.state === "pulling") {
      return [{ keys: "—", text: T("range.explosion.timed.promptPulling"), kind: "grenade" }];
    }
    if (this.state === "cooking") {
      const rem = this.remainingFuse.toFixed(1);
      return this.pullMode === "hold"
        ? [{ keys: T("hud.key.mouseLeft"), text: T("range.explosion.timed.promptReleaseThrow", { s: rem }), kind: "grenade" }]
        : [
          { keys: T("hud.key.mouseLeft"), text: T("range.explosion.timed.promptClickThrow", { s: rem }), kind: "grenade" },
          { keys: T("hud.key.mouseRight"), text: T("range.explosion.timed.promptUnderhand") },
        ];
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // 内部生命周期与特效更新
  // -------------------------------------------------------------------------

  _ResetToReady() {
    this.state = "ready";
    this.pullT = 0;
    this.ignited = false;
    this.releaseQueued = false;
    this.cookTime = 0;
    this.remainingFuse = this.fuseDurationS;
    this.rearmTimer = 0;
    this.igniteFlashT = 0;
    this.hissTimer = 0;
    this.propKit.cordGroup.visible = true;
    this.propKit.jetGroup.visible = false;
    this.propKit.fuseLight.intensity = 0;
    this.materials.ember.color.setRGB(0.08, 0.05, 0.04);
    const grenade = this.host.viewmodel?.rig?.parts?.grenade;
    if (grenade) grenade.visible = true;
  }

  _EnsureAttached() {
    const vm = this.host.viewmodel;
    const grenade = vm?.rig?.parts?.grenade;
    if (!grenade) return false;
    if (this.attachedGrenade !== grenade) {
      this._DetachKit();
      grenade.add(this.propKit.root);
      this.propKit.root.visible = true;
      this.attachedGrenade = grenade;
      if (this.fpVfx.group.parent !== vm.root) vm.root.add(this.fpVfx.group);
      vm.markForegroundPrepass?.();
    }
    return true;
  }

  _DetachKit() {
    if (this.propKit.root.parent) this.propKit.root.parent.remove(this.propKit.root);
    this.propKit.root.visible = false;
    this.propKit.fuseLight.intensity = 0;
    this.attachedGrenade = null;
    if (this.fpVfx.group.parent) this.fpVfx.group.parent.remove(this.fpVfx.group);
  }

  _TriggerIgnition() {
    if (this.ignited) return;
    this.ignited = true;
    this.cookTime = 0;
    this.remainingFuse = this.fuseDurationS;
    this.igniteFlashT = 0.20;
    this.hissTimer = 0.06;
    this.host.audio?.Play(TIMED_GRENADE.audio.pullCue, { volume: 0.92, firstPerson: true, priority: true });
    // 拉线发火那一瞬的微震（反馈手感）
    this.host.player?.shake?.AddTrauma?.(0.09);
    // 瞬间爆出一簇明亮拉火火星与硫磺烟团
    this._EmitTailParticles(TIMED_GRENADE.vfx.igniteBurstSparks, TIMED_GRENADE.vfx.igniteBurstSmoke, 1.5);
  }

  _LaunchThrow(power) {
    const vm = this.host.viewmodel;
    if (!vm || this.state === "throwing") return false;
    this.state = "throwing";
    this.releaseQueued = false;
    this.throwPower = Clamp01(power);
    vm.SetTimedGrenadePose?.(null);
    const cookSnapshot = this.cookTime;
    const fuseTotal = this.fuseDurationS;
    const ok = vm.TriggerThrow(this.throwPower, {
      kind: "Grenade",
      startT: TIMED_GRENADE.throwStartT,
      onRelease: (handPos, releasedPower) => {
        if (!this.host.player?.Alive) return;
        const aim = this.host.player.AimDirection(TMP_DIR).clone();
        const exactFuse = Math.max(TIMED_GRENADE.minReleaseFuseS, this.remainingFuse);
        const p = this.host.combat.Throw("Grenade", releasedPower, handPos, aim, 0, {
          handRelease: true,
          exactFuse,
          timedStick: true,
        });
        this.ignited = false;
        this.propKit.jetGroup.visible = false;
        this.propKit.fuseLight.intensity = 0;
        if (p) {
          this.stats.throws += 1;
          this._AttachFlightVisual(p, { cookTimeS: cookSnapshot, releaseFuseS: exactFuse, fuseTotalS: fuseTotal });
        }
      },
    });
    if (!ok) {
      // 视图模型忙时兜底立即从手前抛出，绝不吞雷
      const eye = this.host.player.EyePosition.clone();
      const aim = this.host.player.AimDirection(TMP_DIR).clone();
      const exactFuse = Math.max(TIMED_GRENADE.minReleaseFuseS, this.remainingFuse);
      const p = this.host.combat.Throw("Grenade", this.throwPower, eye, aim, 0, {
        exactFuse,
        timedStick: true,
      });
      this.ignited = false;
      this.state = "rearming";
      this.rearmTimer = TIMED_GRENADE.rearmDelayS;
      if (p) {
        this.stats.throws += 1;
        this._AttachFlightVisual(p, { cookTimeS: cookSnapshot, releaseFuseS: exactFuse, fuseTotalS: fuseTotal });
      }
    }
    return true;
  }

  _DetonateInHand() {
    const player = this.host.player;
    const aim = player.AimDirection(TMP_DIR).clone();
    const pos = player.EyePosition.clone()
      .addScaledVector(aim, TIMED_GRENADE.overcookBlastAheadM);
    pos.y += TIMED_GRENADE.overcookBlastDropM;
    const spec = WEAPONS.Grenade;
    this.ignited = false;
    this.remainingFuse = 0;
    this.propKit.jetGroup.visible = false;
    this.propKit.fuseLight.intensity = 0;
    const grenade = this.host.viewmodel?.rig?.parts?.grenade;
    if (grenade) grenade.visible = false;
    this.host.viewmodel?.SetTimedGrenadePose?.(null);

    this.stats.overcooks += 1;
    const record = {
      cookTimeS: +this.cookTime.toFixed(2),
      releaseFuseS: 0,
      flightTimeS: 0,
      detonateHeightM: +(pos.y - this.host.battlefield.GroundHeight(pos.x, pos.z)).toFixed(2),
      airburst: false,
      overcooked: true,
      position: pos.toArray(),
    };
    this.stats.lastThrow = record;

    // 真实走 CombatSystem.Blast（爆风、火星、耳鸣、震屏、伤害周围敌军与地形）
    this.host.combat.Blast(pos, spec.radiusM, spec.damage, "grenade", "ija", true, null, "Grenade", null, {
      audioCue: "grenadeExplosionNra",
    });
    this.host.OnDetonate?.(record);
    this.host.hud?.Hint?.(T("range.explosion.timed.hintOvercook"), 3.2);
    this.state = "rearming";
    this.rearmTimer = TIMED_GRENADE.rearmDelayS + 0.35;
  }

  _AttachFlightVisual(projectile, meta) {
    // 给飞行中的特制木柄弹外壳临时套上红布警示环，爆炸/清场时自动卸下不污染对象池
    let collar = null;
    if (projectile.mesh) {
      const G = TIMED_GRENADE.geometry;
      const geo = RemapCylinderV(
        new THREE.CylinderGeometry(G.bandRadiusM + 0.001, G.bandRadiusM + 0.001, G.bandHeightM, 14, 1, true),
        0.38, 0.96, 2
      );
      geo.rotateX(Math.PI / 2);
      collar = new THREE.Mesh(geo, this.materials.band);
      collar.position.z = G.bandZ;
      collar.castShadow = false;
      collar.receiveShadow = false;
      projectile.mesh.add(collar);
    }
    this.flights.push({
      projectile,
      collar,
      cookTimeS: meta.cookTimeS,
      releaseFuseS: meta.releaseFuseS,
      fuseTotalS: meta.fuseTotalS,
      flightTimeS: 0,
      sparkAccum: 0,
      smokeAccum: 0,
      lastPos: projectile.position.clone(),
    });
  }

  Update(dt) {
    this.elapsed += dt;
    this._UpdateFlights(dt);

    if (!this.Active) {
      this._SyncHud();
      return;
    }

    const vm = this.host.viewmodel;
    const player = this.host.player;
    if (!vm || !player) return;

    // 滚轮或别处切槽离开投掷位且未拉火时自然收起；已拉火则死死拿在手里不许塞回兜里
    if (this.state === "ready" && this.host.state && this.host.state.activeSlot !== "throwable") {
      this.Stow({ force: true });
      return;
    }
    // 若视图模型被别处切走（如重生或热重装），重新贴回特制木柄弹
    if (this.state !== "throwing" && vm.weaponId !== "Grenade") {
      vm.Equip("Grenade", 0, { instant: true });
    }
    this._EnsureAttached();

    // 视角转动的绳摆阻尼物理
    const dyaw = (player.yaw || 0) - this.lastYaw;
    const dpitch = (player.pitch || 0) - this.lastPitch;
    this.lastYaw = player.yaw || 0;
    this.lastPitch = player.pitch || 0;
    if (dt > 0) {
      const step = Math.min(dt, 0.05);
      this.cordVel.x += (-dyaw * 3.2 - this.cordSway.x * 28 - this.cordVel.x * 6.5) * step;
      this.cordVel.y += (-dpitch * 2.6 - this.cordSway.y * 28 - this.cordVel.y * 6.5) * step;
      this.cordSway.x = THREE.MathUtils.clamp(this.cordSway.x + this.cordVel.x * step, -0.32, 0.32);
      this.cordSway.y = THREE.MathUtils.clamp(this.cordSway.y + this.cordVel.y * step, -0.26, 0.26);
    }

    if (this.igniteFlashT > 0) this.igniteFlashT = Math.max(0, this.igniteFlashT - dt);

    // --- 状态推进 ------------------------------------------------------------
    if (this.state === "pulling") {
      this.pullT = Math.min(1, this.pullT + dt / TIMED_GRENADE.pullDurationS);
      if (this.pullT >= TIMED_GRENADE.igniteAt && !this.ignited) {
        this._TriggerIgnition();
      }
      if (this.ignited) {
        this.cookTime += dt;
        this.remainingFuse = Math.max(0, this.fuseDurationS - this.cookTime);
      }
      if (this.pullT >= 1) {
        if (this.releaseQueued) {
          this._LaunchThrow(this.throwPower);
        } else {
          this.state = "cooking";
        }
      }
    } else if (this.state === "cooking") {
      this.cookTime += dt;
      this.remainingFuse = Math.max(0, this.fuseDurationS - this.cookTime);
      if (this.remainingFuse <= 0) {
        if (this.overcookExplodes) {
          this._DetonateInHand();
        } else {
          this.remainingFuse = 0.12;
          this._LaunchThrow(this.throwPower);
        }
      }
    } else if (this.state === "throwing") {
      if (this.ignited) {
        this.cookTime += dt;
        this.remainingFuse = Math.max(TIMED_GRENADE.minReleaseFuseS, this.fuseDurationS - this.cookTime);
      }
      if (!vm.action || vm.action.kind !== "throw") {
        this.state = "rearming";
        this.rearmTimer = TIMED_GRENADE.rearmDelayS;
        const grenade = vm.rig?.parts?.grenade;
        if (grenade) grenade.visible = false;
      }
    } else if (this.state === "rearming") {
      this.rearmTimer -= dt;
      if (this.rearmTimer <= 0) {
        this._ResetToReady();
      }
    }

    // --- 燃烧嘶声 ------------------------------------------------------------
    if (this.Lit) {
      this.hissTimer -= dt;
      if (this.hissTimer <= 0) {
        const urgency = Clamp01(1 - this.remainingFuse / Math.max(0.5, this.fuseDurationS));
        this.hissTimer = TIMED_GRENADE.audio.hissIntervalS * Mix(1.05, 0.72, urgency);
        this.host.audio?.Play(TIMED_GRENADE.audio.hissCue, {
          volume: Mix(0.45, 0.82, urgency),
          pitch: Mix(0.95, 1.38, urgency * urgency),
          firstPerson: true,
        });
      }
    }

    // --- 第一人称手部姿势 & 拉绳形变 & 火花/烟雾特效 -------------------------
    this._DriveViewmodelPose();
    this._UpdateCordGeometry();
    this._UpdateTailVisuals(dt);
    this._StepFpVfx(dt);
    this._SyncHud();
  }

  _DriveViewmodelPose() {
    const vm = this.host.viewmodel;
    if (!vm?.SetTimedGrenadePose) return;
    if (this.state === "throwing" || this.state === "stowed") {
      vm.SetTimedGrenadePose(null);
      return;
    }
    const P = TIMED_GRENADE.poses;
    if (this.state === "rearming") {
      const k = 1 - Clamp01(this.rearmTimer / TIMED_GRENADE.rearmDelayS);
      const drop = (1 - Smooth(k)) * 0.24;
      vm.SetTimedGrenadePose({
        mountPos: [P.ready.mountPos[0], P.ready.mountPos[1] - drop, P.ready.mountPos[2] + drop * 0.3],
        mountEuler: P.ready.mountEuler,
        leftHand: [P.ready.leftHand[0], P.ready.leftHand[1] - drop, P.ready.leftHand[2]],
        leftContact: 0,
        leftShape: "open",
        shoulders: { right: P.ready.rightShoulder, left: P.ready.leftShoulder },
        elbowPoles: { right: P.ready.rightElbow, left: P.ready.leftElbow },
      });
      return;
    }
    if (this.state === "ready") {
      const breath = Math.sin(this.elapsed * 2.1) * 0.004;
      vm.SetTimedGrenadePose({
        mountPos: [P.ready.mountPos[0], P.ready.mountPos[1] + breath, P.ready.mountPos[2]],
        mountEuler: P.ready.mountEuler,
        leftHand: [P.ready.leftHand[0], P.ready.leftHand[1] + breath * 0.6, P.ready.leftHand[2]],
        leftContact: 0,
        leftShape: "open",
        shoulders: { right: P.ready.rightShoulder, left: P.ready.leftShoulder },
        elbowPoles: { right: P.ready.rightElbow, left: P.ready.leftElbow },
      });
      return;
    }
    if (this.state === "pulling") {
      const t = this.pullT;
      const reach = Smooth(Seg(t, 0.0, 0.28));
      const yank = Smooth(Seg(t, 0.28, TIMED_GRENADE.igniteAt));
      const settle = Smooth(Seg(t, TIMED_GRENADE.igniteAt, 1.0));
      const mPos = [0, 0, 0], mRot = [0, 0, 0], lPos = [0, 0, 0];
      for (let i = 0; i < 3; i += 1) {
        const a = Mix(P.ready.mountPos[i], P.pullGrab.mountPos[i], reach);
        const b = Mix(a, P.pullYank.mountPos[i], yank);
        mPos[i] = Mix(b, P.cook.mountPos[i], settle * 0.55);

        const ra = Mix(P.ready.mountEuler[i], P.pullGrab.mountEuler[i], reach);
        const rb = Mix(ra, P.pullYank.mountEuler[i], yank);
        mRot[i] = Mix(rb, P.cook.mountEuler[i], settle * 0.55);

        const la = Mix(P.ready.leftHand[i], P.pullGrab.leftHand[i], reach);
        const lb = Mix(la, P.pullYank.leftHand[i], yank);
        lPos[i] = Mix(lb, P.cook.leftHand[i], settle);
      }
      // 猛拉瞬间给右手加一记干脆的向后小反冲
      if (this.igniteFlashT > 0) {
        const kick = this.igniteFlashT / 0.20;
        mPos[1] += kick * 0.018;
        mPos[2] += kick * 0.016;
      }
      vm.SetTimedGrenadePose({
        mountPos: mPos,
        mountEuler: mRot,
        leftHand: lPos,
        leftContact: 0,
        leftShape: t > 0.22 && t < 0.85 ? "clip" : "open",
        shoulders: { right: P.ready.rightShoulder, left: P.ready.leftShoulder },
        elbowPoles: { right: P.ready.rightElbow, left: P.ready.leftElbow },
      });
      return;
    }
    if (this.state === "cooking") {
      // 从拉火完成位置顺滑抬入高举待投位（贴近 FPS_GRENADE_THROW.frames[38]）
      const settle = Smooth(Clamp01(this.cookTime / 0.26));
      const urgency = Clamp01(1 - this.remainingFuse / Math.max(0.5, this.fuseDurationS));
      const shakeAmp = this.remainingFuse < TIMED_GRENADE.criticalFuseS
        ? 0.0085 : (this.remainingFuse < TIMED_GRENADE.urgentFuseS ? 0.0042 : 0.0014);
      const sx = Math.sin(this.elapsed * 53) * shakeAmp;
      const sy = Math.cos(this.elapsed * 67 + 1.1) * shakeAmp;
      const mPos = [0, 0, 0], mRot = [0, 0, 0];
      for (let i = 0; i < 3; i += 1) {
        const startPos = Mix(P.pullYank.mountPos[i], P.cook.mountPos[i], 0.55);
        const startRot = Mix(P.pullYank.mountEuler[i], P.cook.mountEuler[i], 0.55);
        mPos[i] = Mix(startPos, P.cook.mountPos[i], settle);
        mRot[i] = Mix(startRot, P.cook.mountEuler[i], settle);
      }
      mPos[0] += sx;
      mPos[1] += sy;
      mRot[2] += sx * 2.2 + urgency * 0.04;
      vm.SetTimedGrenadePose({
        mountPos: mPos,
        mountEuler: mRot,
        leftHand: P.cook.leftHand,
        leftContact: 0,
        leftShape: "open",
        shoulders: { right: P.cook.rightShoulder, left: P.cook.leftShoulder },
        elbowPoles: { right: P.cook.rightElbow, left: P.cook.leftElbow },
      });
    }
  }

  _UpdateCordGeometry() {
    const { cordGroup, cordSegs, beadGroup } = this.propKit;
    const G = TIMED_GRENADE.geometry;
    if (this.state === "cooking" || this.state === "throwing" || this.state === "rearming") {
      cordGroup.visible = false;
      return;
    }
    if (this.state === "pulling" && this.pullT >= TIMED_GRENADE.igniteAt + 0.14) {
      cordGroup.visible = false;
      return;
    }
    cordGroup.visible = true;

    const startZ = G.tailZ + 0.002;
    // 待拉线时绳尾受重力朝手柄左下方自然垂出（避开右腕衣袖，清楚露出瓷珠与铜环）
    let endX = -0.046 + this.cordSway.x * 0.045;
    let endY = -0.018 + this.cordSway.y * 0.035;
    let endZ = startZ + G.cordRestLengthM;
    let sag = 0.014;

    if (this.state === "pulling") {
      const grab = Smooth(Seg(this.pullT, 0.20, 0.34));
      const pull = Smooth(Seg(this.pullT, 0.22, TIMED_GRENADE.igniteAt));
      const snap = Smooth(Seg(this.pullT, TIMED_GRENADE.igniteAt, TIMED_GRENADE.igniteAt + 0.14));
      const vm = this.host.viewmodel;
      const leftNode = vm?.riggedArms?.gripNodes?.l || vm?.handLeft?.group;
      if (leftNode && grab > 0.01) {
        vm.root.updateMatrixWorld(true);
        leftNode.getWorldPosition(TMP_POS);
        this.propKit.root.worldToLocal(TMP_POS);
        // 直接锁到左手实际捏合点（不短截），确保瓷珠拉环稳稳捏在左手指间
        const maxLen = 0.38;
        const dx = TMP_POS.x, dy = TMP_POS.y, dz = TMP_POS.z - startZ;
        const dist = Math.hypot(dx, dy, dz);
        const clampScale = dist > maxLen ? maxLen / dist : 1;
        endX = Mix(endX, dx * clampScale, grab);
        endY = Mix(endY, dy * clampScale, grab);
        endZ = Mix(endZ, startZ + dz * clampScale, grab);
      } else {
        endX = Mix(endX, -0.108, pull) - snap * 0.05;
        endY = Mix(endY, -0.035, pull) - snap * 0.04;
        endZ = startZ + Mix(G.cordRestLengthM, G.cordPullStretchM, pull) + snap * 0.05;
      }
      sag = Mix(0.014, 0.001, pull);
    }

    const n = cordSegs.length;
    const prev = TMP_POS.set(0, 0, startZ);
    const curr = TMP_POS2;
    for (let i = 0; i < n; i += 1) {
      const t = (i + 1) / n;
      const arch = Math.sin(t * Math.PI) * sag;
      curr.set(endX * t, endY * t - arch, Mix(startZ, endZ, t));
      const seg = cordSegs[i];
      seg.position.copy(prev).add(curr).multiplyScalar(0.5);
      TMP_DIR.subVectors(curr, prev);
      const len = Math.max(1e-4, TMP_DIR.length());
      seg.scale.set(1, len * 1.08, 1);
      seg.quaternion.setFromUnitVectors(UP, TMP_DIR.divideScalar(len));
      prev.copy(curr);
    }
    beadGroup.position.set(endX, endY, endZ);
    beadGroup.rotation.set(0.35 + this.cordSway.y, this.cordSway.x, 0);
  }

  _UpdateTailVisuals(dt) {
    const { ember, jetGroup, jetQuads, fuseLight } = this.propKit;
    const V = TIMED_GRENADE.vfx;
    const burning = this.Lit && this.state !== "throwing";
    if (!burning) {
      jetGroup.visible = false;
      fuseLight.intensity = 0;
      this.materials.ember.color.setRGB(0.08, 0.05, 0.04);
      return;
    }

    const urgency = Clamp01(1 - this.remainingFuse / Math.max(0.5, this.fuseDurationS));
    const critical = this.remainingFuse < TIMED_GRENADE.criticalFuseS;
    const flash = this.igniteFlashT / 0.20;
    const flicker = 0.72 + 0.28 * Math.sin(this.elapsed * 57) * Math.cos(this.elapsed * 91);

    // 火芯炽热发光
    const heat = (2.8 + urgency * 3.5 + flash * 5.0) * (0.85 + 0.15 * flicker);
    this.materials.ember.color.setRGB(heat, heat * Mix(0.45, 0.62, flash), heat * Mix(0.08, 0.25, flash));

    // 尾口火花十字面（高速切换 Seedream 2×2 格）
    jetGroup.visible = true;
    const frameBase = Math.floor(this.elapsed * (critical ? 28 : 18)) & 3;
    const baseScale = flash > 0.05
      ? Mix(0.082, 0.19, flash)
      : Mix(0.068, critical ? 0.148 : 0.108, urgency) * flicker;
    for (let i = 0; i < jetQuads.length; i += 1) {
      const q = jetQuads[i];
      const cell = flash > 0.25 ? (i === 0 ? 0 : 3) : ((frameBase + i) % 3) + (critical ? 1 : 0);
      SetQuadCellUv(q.geo, Math.min(3, cell));
      q.mesh.scale.set(baseScale, baseScale * (i === 1 ? 1.25 : 1.0), 1);
      q.mesh.rotation.z = this.elapsed * (i === 0 ? 9 : -11);
      q.mat.opacity = Clamp01(0.75 + flash * 0.25 + urgency * 0.2) * flicker;
      const gain = (2.4 + urgency * 1.8 + flash * 2.8) * flicker;
      q.mat.color.setRGB(gain, gain * 0.68, gain * 0.28);
    }

    // 手部动态火光
    fuseLight.intensity = (V.lightIntensityBase + urgency * 0.75 + flash * V.lightIntensityIgnite) * flicker;

    // 连续发射第一人称火星与硫磺烟雾
    if (dt > 0) {
      const sparkRate = Mix(V.cookSparkRateBase, V.cookSparkRateCritical, urgency);
      const smokeRate = Mix(V.cookSmokeRateBase, V.cookSmokeRateCritical, urgency);
      this.sparkCarry += sparkRate * dt;
      this.smokeCarry += smokeRate * dt;
      const nSparks = Math.floor(this.sparkCarry);
      const nSmokes = Math.floor(this.smokeCarry);
      this.sparkCarry -= nSparks;
      this.smokeCarry -= nSmokes;
      if (nSparks > 0 || nSmokes > 0) {
        this._EmitTailParticles(nSparks, nSmokes, 0.85 + urgency * 0.55);
      }
    }
  }

  _TailInViewmodelSpace(outPos, outAxis) {
    const vm = this.host.viewmodel;
    const mouth = this.propKit.tailMouth;
    if (!vm?.root || !mouth) return false;
    vm.root.updateMatrixWorld(true);
    mouth.getWorldPosition(outPos);
    vm.root.worldToLocal(outPos);
    TMP_POS2.set(0, 0, 0.06);
    mouth.localToWorld(TMP_POS2);
    vm.root.worldToLocal(TMP_POS2);
    outAxis.subVectors(TMP_POS2, outPos).normalize();
    return true;
  }

  _EmitTailParticles(sparkCount, smokeCount, energy = 1) {
    if (!this._TailInViewmodelSpace(TMP_TAIL, TMP_TAIL_AXIS)) return;
    const R = (lo, hi) => lo + this.rnd() * (hi - lo);

    for (let i = 0; i < sparkCount; i += 1) {
      const slot = this.fpVfx.sparks.find((s) => !s.alive)
        || this.fpVfx.sparks[Math.floor(this.rnd() * this.fpVfx.sparks.length)];
      slot.alive = true;
      slot.age = 0;
      slot.life = R(0.14, 0.34);
      slot.pos.copy(TMP_TAIL).addScaledVector(TMP_TAIL_AXIS, R(0, 0.012));
      const spd = R(0.28, 0.92) * energy;
      slot.vel.copy(TMP_TAIL_AXIS).multiplyScalar(spd);
      slot.vel.x += R(-0.32, 0.32) * energy;
      slot.vel.y += R(-0.22, 0.26) * energy;
      slot.vel.z += R(-0.22, 0.22) * energy;
      slot.size0 = R(0.018, 0.040) * energy;
      slot.size1 = slot.size0 * 0.35;
      slot.rot = R(0, Math.PI * 2);
      slot.spin = R(-10, 10);
      slot.opacity = R(0.90, 1.0);
      SetQuadCellUv(slot.geo, Math.floor(this.rnd() * 4));
      slot.mesh.visible = true;
    }

    for (let i = 0; i < smokeCount; i += 1) {
      const slot = this.fpVfx.smokes.find((s) => !s.alive)
        || this.fpVfx.smokes[Math.floor(this.rnd() * this.fpVfx.smokes.length)];
      slot.alive = true;
      slot.age = 0;
      slot.life = R(0.55, 0.95);
      slot.pos.copy(TMP_TAIL).addScaledVector(TMP_TAIL_AXIS, R(0.008, 0.025));
      slot.vel.copy(TMP_TAIL_AXIS).multiplyScalar(R(0.06, 0.14));
      slot.vel.x += R(-0.12, -0.02) - this.cordSway.x * 0.14;
      slot.vel.y += R(0.20, 0.34);
      slot.vel.z += R(-0.03, 0.03);
      slot.size0 = R(0.044, 0.068);
      slot.size1 = R(0.16, 0.26);
      slot.rot = R(-0.35, 0.35);
      slot.spin = R(-0.8, 0.8);
      slot.opacity = R(0.76, 0.95);
      SetQuadCellUv(slot.geo, Math.floor(this.rnd() * 4));
      slot.mesh.visible = true;
    }
  }

  _StepFpVfx(dt) {
    if (dt <= 0) return;
    const step = Math.min(dt, 0.05);
    for (const s of this.fpVfx.sparks) {
      if (!s.alive) continue;
      s.age += step;
      if (s.age >= s.life) { s.alive = false; s.mesh.visible = false; continue; }
      const u = s.age / s.life;
      s.vel.y -= 1.85 * step;
      s.vel.multiplyScalar(Math.max(0, 1 - 2.4 * step));
      s.pos.addScaledVector(s.vel, step);
      s.rot += s.spin * step;
      s.mesh.position.copy(s.pos);
      s.mesh.rotation.set(0, 0, s.rot);
      const sz = Mix(s.size0, s.size1, u);
      s.mesh.scale.set(sz, sz, 1);
      const fade = (1 - u) * (1 - u);
      s.mat.opacity = s.opacity * fade;
      s.mat.color.setRGB(3.6 * fade + 0.8, 2.2 * fade + 0.2, 0.9 * fade * fade);
    }
    for (const s of this.fpVfx.smokes) {
      if (!s.alive) continue;
      s.age += step;
      if (s.age >= s.life) { s.alive = false; s.mesh.visible = false; continue; }
      const u = s.age / s.life;
      s.vel.y += 0.22 * step;
      s.vel.multiplyScalar(Math.max(0, 1 - 1.6 * step));
      s.pos.addScaledVector(s.vel, step);
      s.rot += s.spin * step;
      s.mesh.position.copy(s.pos);
      s.mesh.rotation.set(0, 0, s.rot);
      const sz = Mix(s.size0, s.size1, Math.pow(u, 0.72));
      s.mesh.scale.set(sz * 0.85, sz * 1.15, 1);
      const fadeIn = Clamp01(u / 0.16);
      const fadeOut = Math.pow(1 - u, 1.35);
      s.mat.opacity = s.opacity * fadeIn * fadeOut;
    }
  }

  _ClearFpVfx() {
    for (const list of [this.fpVfx.sparks, this.fpVfx.smokes]) {
      for (const s of list) { s.alive = false; s.mesh.visible = false; }
    }
  }

  _UpdateFlights(dt) {
    const vfx = this.host.vfx;
    const V = TIMED_GRENADE.vfx;
    for (let i = this.flights.length - 1; i >= 0; i -= 1) {
      const f = this.flights[i];
      const p = f.projectile;
      f.flightTimeS += dt;
      if (p.alive) {
        f.lastPos.copy(p.position);
        // 计算翻滚中的木柄尾端世界坐标（局部 +Z 0.11 m）
        TMP_TAIL.set(0, 0, TIMED_GRENADE.geometry.tailZ + 0.008);
        if (p.mesh) {
          TMP_TAIL.applyQuaternion(p.mesh.quaternion).add(p.position);
        } else {
          TMP_TAIL.copy(p.position);
        }
        // 飞行尾火花与引信烟迹（写入引擎共享 VfxSystem 池）
        if (vfx && dt > 0) {
          f.sparkAccum += dt;
          f.smokeAccum += dt;
          if (f.sparkAccum >= V.flightSparkIntervalS) {
            f.sparkAccum %= V.flightSparkIntervalS;
            vfx.FuseTrailSpark?.(TMP_TAIL, p.velocity, p.fuse);
          }
          if (f.smokeAccum >= V.flightSmokeIntervalS) {
            f.smokeAccum %= V.flightSmokeIntervalS;
            vfx.FuseTrailSmoke?.(TMP_TAIL, p.velocity);
          }
        }
        continue;
      }
      // 爆炸或清场：回收临时红环并结算飞行遥测
      if (f.collar) {
        if (f.collar.parent) f.collar.parent.remove(f.collar);
        f.collar.geometry.dispose();
        f.collar = null;
      }
      // 仅在真正引爆（fuse <= 0）时记录遥测，ClearProjectiles 强制清场不记成空爆
      if (p.fuse <= 0.001) {
        const groundY = this.host.battlefield.GroundHeight(f.lastPos.x, f.lastPos.z);
        const heightM = Math.max(0, f.lastPos.y - groundY);
        const airburst = heightM >= TIMED_GRENADE.airburstHeightM;
        if (airburst) this.stats.airbursts += 1;
        const record = {
          cookTimeS: +f.cookTimeS.toFixed(2),
          releaseFuseS: +f.releaseFuseS.toFixed(2),
          flightTimeS: +f.flightTimeS.toFixed(2),
          detonateHeightM: +heightM.toFixed(2),
          airburst,
          overcooked: false,
          position: f.lastPos.toArray(),
        };
        this.stats.lastThrow = record;
        this.host.OnDetonate?.(record);
      }
      this.flights.splice(i, 1);
    }
  }

  _SyncHud() {
    const h = this.hudEl;
    if (!h) return;
    const visible = this.Active && this.host.CanUse?.() !== false && !this.host.state?.menu;
    h.root.hidden = !visible;
    if (!visible) return;

    const showRing = this.Lit && this.showTimer;
    const isPulling = this.state === "pulling" && !this.ignited;
    const frac = this.Lit
      ? Clamp01(this.remainingFuse / Math.max(0.1, this.fuseDurationS))
      : (isPulling ? this.pullT : 0);

    h.root.classList.toggle("isLit", this.Lit);
    h.root.classList.toggle("isPulling", isPulling);
    h.root.classList.toggle("isUrgent", this.Lit && this.remainingFuse <= TIMED_GRENADE.urgentFuseS);
    h.root.classList.toggle("isCritical", this.Lit && this.remainingFuse <= TIMED_GRENADE.criticalFuseS);
    h.root.classList.toggle("hideTimer", this.Lit && !this.showTimer);

    const offset = h.circumference * (1 - (showRing || isPulling ? frac : 0));
    h.arc.style.strokeDashoffset = offset.toFixed(2);

    const timeText = showRing ? `${this.remainingFuse.toFixed(1)}s` : "";
    if (h.time.textContent !== timeText) h.time.textContent = timeText;

    let hintText = "";
    if (this.state === "ready") hintText = T("range.explosion.timed.hudReady");
    else if (isPulling) hintText = T("range.explosion.timed.hudPulling");
    else if (this.state === "cooking") {
      hintText = this.pullMode === "hold"
        ? T("range.explosion.timed.hudCookHold")
        : T("range.explosion.timed.hudCookLatch");
    }
    if (h.hint.textContent !== hintText) h.hint.textContent = hintText;
  }

  ClearFlights() {
    for (const f of this.flights) {
      if (f.collar) {
        if (f.collar.parent) f.collar.parent.remove(f.collar);
        f.collar.geometry.dispose();
      }
    }
    this.flights.length = 0;
  }

  Reset() {
    this.ClearFlights();
    this._ClearFpVfx();
    if (this.Active) {
      this._ResetToReady();
    }
    this._SyncHud();
  }

  State() {
    return {
      active: this.Active,
      state: this.state,
      lit: this.Lit,
      pullMode: this.pullMode,
      pullT: +this.pullT.toFixed(3),
      fuseDurationS: this.fuseDurationS,
      cookTimeS: +this.cookTime.toFixed(3),
      remainingFuseS: +this.remainingFuse.toFixed(3),
      showTimer: this.showTimer,
      overcookExplodes: this.overcookExplodes,
      inFlight: this.flights.length,
      kitAttached: !!this.attachedGrenade && this.propKit.root.parent === this.attachedGrenade,
      activeSparks: this.fpVfx.sparks.filter((p) => p.alive).length,
      activeSmoke: this.fpVfx.smokes.filter((p) => p.alive).length,
      fuseLightIntensity: +this.propKit.fuseLight.intensity.toFixed(2),
      texturesReady: Object.values(this.textures).every((t) => (t?.image?.naturalWidth || t?.image?.width || 0) > 0),
      pulls: this.stats.pulls,
      throws: this.stats.throws,
      airbursts: this.stats.airbursts,
      overcooks: this.stats.overcooks,
      lastThrow: this.stats.lastThrow ? { ...this.stats.lastThrow } : null,
    };
  }

  Dispose() {
    this.ClearFlights();
    this._DetachKit();
    this.host.viewmodel?.SetTimedGrenadePose?.(null);
    this.hudEl?.root?.remove();
    this.hudEl = null;
    for (const d of this.disposables) d.dispose?.();
    this.disposables.length = 0;
  }
}

export default TimedStickGrenade;
