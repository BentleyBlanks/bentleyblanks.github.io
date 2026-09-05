// 《滕县 一九三八》加载画面里的那件道具。
//
// 为什么加载画面上要有一个能转的东西：加载是这个游戏唯一一段"玩家什么都做不了"
// 的时间（首关建场十几秒）。Easy Red 2 的做法是拿装备展示台把这段时间填掉 ——
// 玩家在等的同时把这一仗要用的东西认了一遍。这里照办，展示的是真·游戏里的
// 那批 TZM 模型（Model/*.tzm.json），不是另做的一套宣传资产：
// 玩家转过的这把汉阳造，进城以后端在手里的就是同一份网格。
//
// 这个文件是**展示台本身**（场景、灯、机位、转动、加载一件模型），
// 与它画在谁身上无关 —— 画布可以是页面里的 <canvas>，也可以是过继给 worker 的
// OffscreenCanvas。两种用法各有一个宿主：
//   · Script_BootPropWorker.mjs  worker 里跑（默认，主线程建关卡它照转不误）
//   · Script_BootProp.mjs        主线程里跑（worker 或 OffscreenCanvas 不可用时的退路）
//
// 独立性：**只依赖 three + Script_MeshLoad + Data_Meshes**，与主渲染器、材质库、
// 后处理完全无关 —— 它要在主场景还没建起来的时候就转，那时候 MaterialLibrary 还不存在。
// 材质因此在这里现造（Script_MeshLoad 头注第 2 条禁的是往游戏场景里造默认材质，
// 那是为了别让 SSAO 注入落空；这台离屏展示台没有预通道，不受那条约束）。
//
// **three 走相对路径引，不写裸名 "three"。** worker 里没有 import map，
// 裸名解析不了；页面侧靠 index.html 那张表把这条相对路径映射到同一个带版本的 URL，
// 所以页面仍然只加载一份 three。同理这条链上的 Script_MeshLoad / Script_Noise
// 也一律走相对路径。

import * as THREE from "./vendor/three/build/three.module.js";
import { LoadModel } from "./Script_MeshLoad.mjs";
import { MESHES, MeshUrl } from "./Data_Meshes.mjs";

/**
 * 展示池。**故意不放士兵**：TZM 里的人是静止的绑定姿势（两臂平举），
 * 单独摆出来像具人体模型，与这个游戏对人的态度不合。枪、道具、车都是静物，
 * 摆出来就是它本来的样子。只展示战斗装备，不混入屋脊、门窗等建筑饰件。
 */
const SHOWCASE = [
  { id: "HanYang", name: "汉阳造 八八式步枪" },
  { id: "ZhongZheng", name: "中正式 步骑枪" },
  { id: "Zb26", name: "ZB-26 轻机枪" },
  { id: "Type38", name: "三八式 步枪" },
  { id: "ServicePistol", name: "外购九毫米 军用手枪" },
  { id: "Grenade", name: "木柄手榴弹" },
  { id: "Dadao", name: "大刀" },
  { id: "Type89Launcher", name: "八九式 重掷弹筒" },
  { id: "Type95HaGo", name: "九五式 轻战车 Ha-Go" },
  { id: "Type97ChiHa", name: "九七式 中战车 Chi-Ha" },
  { id: "Type89Tank", name: "八九式 中战车" },
];

/**
 * 展示台的材质。名字是 TZM 里的材质键，值按"这件东西真实是什么"给：
 * 钢是金属、木是木、砖石是死板的粗糙面。查不到的键退回一块中性灰，
 * 不抛错 —— 加载画面永远不许因为一件道具的材质名对不上就白屏。
 */
const PALETTE = {
  steel: { color: 0x6d7075, roughness: 0.42, metalness: 0.85, side: THREE.DoubleSide },
  blade: { color: 0x9aa0a6, roughness: 0.22, metalness: 0.95 },
  wood: { color: 0x6a4b30, roughness: 0.72, metalness: 0.0 },
  grip: { color: 0x503524, roughness: 0.7, metalness: 0.0 },
  // Dadao normally gets replaced by its authored PBR set before LoadModel.
  // Keep a sane fallback for offline/partial-cache loading instead of neutral grey.
  dadao: { color: 0x77736f, roughness: 0.58, metalness: 0.72 },
  red: { color: 0x8e2f27, roughness: 0.66, metalness: 0.0 },
  // 摄影测量源偶有单层薄片；展示台必须双面绘制，避免绕到反面时履带/挡泥板消失。
  armor: { color: 0x555c4a, roughness: 0.66, metalness: 0.35, side: THREE.DoubleSide },
  track: { color: 0x3b3d3c, roughness: 0.85, metalness: 0.5, side: THREE.DoubleSide },
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
  const materials = new Proxy({}, {
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
  return {
    materials,
    set(key, material) {
      made.get(key)?.dispose?.();
      made.set(key, material);
    },
    dispose() {
      for (const material of made.values()) material.dispose?.();
      made.clear();
    },
  };
}

async function LoadBitmapTexture(url, { srgb = false } = {}) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`PBR ${url} HTTP ${response.status}`);
  // ImageBitmap uploads ignore WebGL's UNPACK_FLIP_Y_WEBGL flag.  TZM UVs use
  // the same bottom-left convention as the main game's TextureLoader path, so
  // the worker must flip the bitmap during decode.  Without this, the blade
  // samples the handle's dark atlas region and the normal/ORM maps describe a
  // different part of the model, which looks like broken faceted lighting.
  const bitmap = await createImageBitmap(await response.blob(), {
    imageOrientation: "flipY",
    premultiplyAlpha: "none",
  });
  const texture = new THREE.Texture(bitmap);
  texture.flipY = false; // already applied by createImageBitmap above
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

async function LoadDadaoMaterial() {
  const albedo = await LoadBitmapTexture("./Texture/Texture_DadaoBase.webp?v=1", { srgb: true });
  return new THREE.MeshStandardMaterial({
    map: albedo,
    // 这是一把单材质桶的 UV 图：刀刃、木柄和金属环全在同一张图上。战场里有
    // PMREM 天空时可由 ORM 与法线逐像素还原；离屏展示台没有反射环境，直接套
    // 那一套会让宽刃在三盏方向光之间跳成黑亮的碎块（尤其是低面数的刀背）。
    // 因此展示台只保留实拍底色，改用温和的半金属陈列材质——轮廓与锈痕清楚，
    // 拖动时仍有一条连续的钢光，也不会把木柄误画成镜面。游戏内材质不受影响。
    roughness: 0.76,
    metalness: 0.18,
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
 * 展示台。一台小 renderer + 一件模型 + 转动状态。
 *
 * **不碰 DOM**：canvas 由宿主给（HTMLCanvasElement 或 OffscreenCanvas），
 * 尺寸由宿主量好了传进来，卡片上的名字与注记由 Load() 返回给宿主去写。
 * 少了这条，它就进不了 worker。
 */
export class PropStage {
  constructor(canvas, { pixelRatio = 1 } = {}) {
    this.canvas = canvas;
    this.pixelRatio = Math.min(1.5, pixelRatio || 1);
    this.currentId = null;
    this.disposed = false;
    this.token = 0;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(this.pixelRatio);
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

    this.materialBank = MaterialBank();
    this.materials = this.materialBank.materials;
    this.dadaoPbrReady = false;
  }

  /** 宿主量好的 CSS 像素尺寸。 */
  Resize(width, height) {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** 拖动一步（宿主把 pointermove 的增量传进来）。 */
  Drag(dx, dy) {
    this.dragging = true;
    this.yaw += dx * 0.01;
    // 俯仰夹住：转到头顶正上方去看，剪影就没了，还会露出模型底面的空洞。
    this.pitch = Math.max(-0.55, Math.min(0.85, this.pitch - dy * 0.008));
    this.velocity = dx * 0.01 * 26;   // 松手后的惯性，按最后一帧的速度给
  }

  DragStart() { this.dragging = true; this.velocity = 0; }
  DragEnd() { this.dragging = false; }

  /**
   * 换一件展示品。异步（要下模型），失败就静静保持上一件。
   * 返回 { id, name, note } 给宿主写卡片；没换成返回 null。
   */
  async Load(entry) {
    const url = MeshUrl(entry.id);
    if (!url) return null;
    const token = (this.token += 1);
    if (entry.id === "Dadao" && !this.dadaoPbrReady) {
      try {
        this.materialBank.set("dadao", await LoadDadaoMaterial());
        this.dadaoPbrReady = true;
      } catch (error) {
        // 加载画面不能被一张未热好的贴图拖死；PALETTE.dadao 仍能给出正确材质读感。
        console.warn(`[BootProp] 大刀 PBR 加载失败：${String(error).slice(0, 160)}`);
      }
    }
    const root = await LoadModel(url, {
      materials: this.materials, batch: true, castShadow: false, receiveShadow: false,
    });
    if (!root || this.disposed || token !== this.token) return null;

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
    return { id: entry.id, name: entry.name, note: ShortNote(entry.id, entry.name) };
  }

  /** 走一帧。dt 秒。 */
  Tick(dt) {
    if (this.disposed) return;
    const step = Math.min(0.05, Math.max(0, dt));
    if (!this.dragging) {
      this.yaw += (this.spin + this.velocity) * step;
      this.velocity *= Math.exp(-3.2 * step);    // 惯性衰减，最后交回匀速自转
    }
    this.pivot.rotation.set(this.pitch, this.yaw, 0);
    this.renderer.render(this.scene, this.camera);
  }

  Dispose() {
    this.disposed = true;
    this.materialBank.dispose();
    this.renderer.dispose();
  }
}
