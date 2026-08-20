// 《滕县 一九三八》加载画面里的那件道具。
//
// 为什么加载画面上要有一个能转的东西：加载是这个游戏唯一一段"玩家什么都做不了"
// 的时间（首关建场十几秒）。Easy Red 2 的做法是拿装备展示台把这段时间填掉 ——
// 玩家在等的同时把这一仗要用的东西认了一遍。这里照办，展示的是真·游戏里的
// 那批 TZM 模型（Model/*.tzm.json），不是另做的一套宣传资产：
// 玩家转过的这把汉阳造，进城以后端在手里的就是同一份网格。
//
// 独立性：这个模块**只依赖 three + Script_MeshLoad + Data_Meshes**。
// 它自己开一台小 renderer 画在 #bootProp 上，与主渲染器、材质库、后处理完全无关 ——
// 理由是它要在主场景还没建起来的时候就转，那时候 MaterialLibrary 还不存在。
// 材质因此在这里现造（Script_MeshLoad 头注第 2 条禁的是往游戏场景里造默认材质，
// 那是为了别让 SSAO 注入落空；这台离屏展示台没有预通道，不受那条约束）。

import * as THREE from "three";
import { LoadModel } from "./Script_MeshLoad.mjs";
import { MESHES, MeshUrl } from "./Data_Meshes.mjs";

/**
 * 展示池。**故意不放士兵**：TZM 里的人是静止的绑定姿势（两臂平举），
 * 单独摆出来像具人体模型，与这个游戏对人的态度不合。枪、道具、车都是静物，
 * 摆出来就是它本来的样子。
 */
const SHOWCASE = [
  { id: "HanYang", name: "汉阳造 八八式步枪" },
  { id: "ZhongZheng", name: "中正式 步骑枪" },
  { id: "Zb26", name: "ZB-26 轻机枪" },
  { id: "Type38", name: "三八式 步枪" },
  { id: "Mauser96", name: "驳壳枪 毛瑟 C96" },
  { id: "Grenade", name: "木柄手榴弹" },
  { id: "Dadao", name: "大刀" },
  { id: "Type89Launcher", name: "八九式 重掷弹筒" },
  { id: "Type94Tankette", name: "九四式 轻装甲车" },
  { id: "Type89Tank", name: "八九式 中战车" },
  { id: "Dougong", name: "门楼斗拱" },
  { id: "RidgeBeast", name: "屋脊兽头" },
  { id: "WindowLattice", name: "格子窗棂" },
  { id: "DoorPier", name: "门墩石（抱鼓石）" },
];

/**
 * 展示台的材质。名字是 TZM 里的材质键，值按"这件东西真实是什么"给：
 * 钢是金属、木是木、砖石是死板的粗糙面。查不到的键退回一块中性灰，
 * 不抛错 —— 加载画面永远不许因为一件道具的材质名对不上就白屏。
 */
const PALETTE = {
  steel: { color: 0x6d7075, roughness: 0.42, metalness: 0.85 },
  blade: { color: 0x9aa0a6, roughness: 0.22, metalness: 0.95 },
  wood: { color: 0x6a4b30, roughness: 0.72, metalness: 0.0 },
  grip: { color: 0x503524, roughness: 0.7, metalness: 0.0 },
  red: { color: 0x8e2f27, roughness: 0.66, metalness: 0.0 },
  armor: { color: 0x555c4a, roughness: 0.66, metalness: 0.35 },
  track: { color: 0x3b3d3c, roughness: 0.85, metalness: 0.5 },
  leather: { color: 0x4a3524, roughness: 0.68, metalness: 0.0 },
  WoodBeam: { color: 0x6b4f36, roughness: 0.78, metalness: 0.0 },
  WoodDoor: { color: 0x5c4230, roughness: 0.76, metalness: 0.0 },
  RoofTile: { color: 0x555049, roughness: 0.82, metalness: 0.0 },
  Stone: { color: 0x8b877c, roughness: 0.88, metalness: 0.0 },
};
const DEFAULT_MATERIAL = { color: 0x7c7669, roughness: 0.75, metalness: 0.05 };

/** 材质按需现造并缓存。用 Proxy 是为了让 InstantiateModel 拿任何键都有东西可用。 */
function MaterialBank() {
  const made = new Map();
  return new Proxy({}, {
    get(_target, key) {
      if (typeof key !== "string") return undefined;
      if (!made.has(key)) {
        const spec = PALETTE[key] || DEFAULT_MATERIAL;
        made.set(key, new THREE.MeshStandardMaterial({ ...spec }));
      }
      return made.get(key);
    },
    has() { return true; },
  });
}

/** 随机挑一件，但不连着挑同一件。 */
export function PickShowcase(exceptId = null, random = Math.random) {
  const pool = SHOWCASE.filter((entry) => entry.id !== exceptId);
  const list = pool.length ? pool : SHOWCASE;
  return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
}

/**
 * 注记裁到两行以内。**不是"取第一句"** —— Data_Meshes 里好几条的第一句只是
 * 名字本身（"中正式。"），单取它等于卡片上把名字写了两遍。规则改成：
 * 从头攒句子，攒够 24 个字或攒满两句就停，攒到的第一句要是名字就丢掉重攒。
 */
export function ShortNote(id, name = "") {
  const plain = String(MESHES[id]?.note || "").replace(/\*\*/g, "");
  const parts = plain.split(/(?<=[。；])/).map((piece) => piece.trim()).filter(Boolean);
  const bare = name.replace(/\s+/g, "");
  if (parts[0] && bare.startsWith(parts[0].replace(/[。；]$/, ""))) parts.shift();
  let out = "";
  for (const piece of parts.slice(0, 2)) {
    out += piece;
    if (out.length >= 24) break;
  }
  return out || plain;
}

/**
 * 加载画面的道具展示台。
 *
 * 用法（Script_Main）：new BootProp(canvas, label, note) → Show() / Hide() / Dispose()。
 * Show() 每次换一件，所以关与关之间那次加载不会重复看到同一样东西。
 */
export class BootProp {
  constructor(canvas, labelEl = null, noteEl = null) {
    this.canvas = canvas;
    this.labelEl = labelEl;
    this.noteEl = noteEl;
    this.currentId = null;
    this.visible = false;
    this.disposed = false;
    this.token = 0;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.02, 60);
    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);

    // 三盏灯，全是方向光：展示台不需要阴影，也不该有阴影 ——
    // 影子落在虚空里只会让人以为地面丢了。
    const key = new THREE.DirectionalLight(0xffe6bd, 2.1);
    key.position.set(1.1, 1.4, 0.9);
    const fill = new THREE.DirectionalLight(0x9db4d0, 0.75);
    fill.position.set(-1.3, 0.4, 0.7);
    const rim = new THREE.DirectionalLight(0xe0b062, 1.0);
    rim.position.set(-0.4, 0.7, -1.5);
    this.scene.add(key, fill, rim, new THREE.HemisphereLight(0x5b6472, 0x14120f, 0.55));

    // 转动状态：自转 + 拖拽 + 松手后的惯性。
    this.yaw = 0.6;
    this.pitch = 0.18;
    this.spin = 0.28;          // rad/s，慢到不会让人看晕
    this.velocity = 0;
    this.dragging = false;
    this.pointerId = null;
    this.lastX = 0;
    this.lastY = 0;
    this.frame = 0;
    this.lastTime = 0;

    this.materials = MaterialBank();
    this.BindPointer();
    this.Resize();
    this.onResize = () => this.Resize();
    window.addEventListener("resize", this.onResize);
  }

  BindPointer() {
    const canvas = this.canvas;
    this.onDown = (event) => {
      this.dragging = true;
      this.pointerId = event.pointerId;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      this.velocity = 0;
      canvas.setPointerCapture?.(event.pointerId);
      canvas.classList.add("dragging");
    };
    this.onMove = (event) => {
      if (!this.dragging || event.pointerId !== this.pointerId) return;
      const dx = event.clientX - this.lastX;
      const dy = event.clientY - this.lastY;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      this.yaw += dx * 0.01;
      // 俯仰夹住：转到头顶正上方去看，剪影就没了，还会露出模型底面的空洞。
      this.pitch = Math.max(-0.55, Math.min(0.85, this.pitch - dy * 0.008));
      this.velocity = dx * 0.01 * 26;   // 松手后的惯性，按最后一帧的速度给
    };
    this.onUp = (event) => {
      if (event.pointerId !== this.pointerId) return;
      this.dragging = false;
      this.pointerId = null;
      canvas.releasePointerCapture?.(event.pointerId);
      canvas.classList.remove("dragging");
    };
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", this.onUp);
  }

  Resize() {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** 换一件展示品。异步（要下模型），失败就静静保持上一件。 */
  async Load(entry) {
    const url = MeshUrl(entry.id);
    if (!url) return;
    const token = (this.token += 1);
    const root = await LoadModel(url, {
      materials: this.materials, batch: true, castShadow: false, receiveShadow: false,
    });
    if (!root || this.disposed || token !== this.token) return;

    this.pivot.clear();
    // 让模型自己的包围盒中心落到原点：TZM 的原点各按各的规范（枪在握把、
    // 门墩在地面），不归中的话转起来会像被甩着走。
    const box = new THREE.Box3().setFromObject(root.root ?? root);
    const object = root.root ?? root;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    object.position.sub(center);
    this.pivot.add(object);

    // 机位按包围球退：填到画面的七成，长枪与豆战车用同一条规则。
    const radius = Math.max(0.08, size.length() * 0.5);
    const dist = radius / Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5)) * 1.42;
    this.camera.position.set(0, radius * 0.22, dist);
    this.camera.lookAt(0, 0, 0);
    this.camera.far = dist + radius * 4;
    this.camera.updateProjectionMatrix();

    this.currentId = entry.id;
    if (this.labelEl) this.labelEl.textContent = entry.name;
    if (this.noteEl) this.noteEl.textContent = ShortNote(entry.id, entry.name);
  }

  /** 露面：换一件、起循环。 */
  Show() {
    if (this.disposed) return;
    this.visible = true;
    this.canvas.classList.add("on");
    this.Load(PickShowcase(this.currentId));
    this.Resize();
    if (!this.frame) {
      this.lastTime = performance.now();
      this.frame = requestAnimationFrame(this.Tick);
    }
  }

  Hide() {
    this.visible = false;
    this.canvas.classList.remove("on");
    if (this.frame) { cancelAnimationFrame(this.frame); this.frame = 0; }
  }

  Tick = (now) => {
    this.frame = requestAnimationFrame(this.Tick);
    const dt = Math.min(0.05, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;
    if (!this.dragging) {
      this.yaw += (this.spin + this.velocity) * dt;
      this.velocity *= Math.exp(-3.2 * dt);      // 惯性衰减，最后交回匀速自转
    }
    this.pivot.rotation.set(this.pitch, this.yaw, 0);
    this.renderer.render(this.scene, this.camera);
  };

  Dispose() {
    this.disposed = true;
    this.Hide();
    window.removeEventListener("resize", this.onResize);
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerup", this.onUp);
    this.canvas.removeEventListener("pointercancel", this.onUp);
    this.renderer.dispose();
  }
}
