// 《地道里的光》 —— Three.js 2D 渲染层（正交相机 + 手绘贴图精灵）。
// 画面是纯 2D：所有形体由 Script_Art 的手绘矢量画笔烘到离屏 canvas，
// 再作为带透明通道的平面贴图挂进 Three 场景。留在 Three 里是为了保留
// 混合模式、加色光晕、暗场遮罩与后续着色器的自由度。
//
// 层次（z 越小越远）：远山 -30 / 远房 -20 / 近树 -12 / 玩法层 0 / 前景 +6 / 过肩前景 +9
// 视差：正交投影下由渲染层每帧按 parallax 系数手动偏移各层容器。

import * as THREE from "three";
import { SCENES, CHAPTERS, SURFACE_Y, UNDER_Y, CurrentBeatDef, GetBeatTarget, SmokeCovers } from "./Script_Core.mjs";
import * as ART from "./Script_Art.mjs";
import { CreateRig, PoseRig, HandPoint, ShoulderPoint, BODY_SCALE } from "./Script_Rig.mjs";
import { BuildOccluder, CreateOccludedLight, SceneOccluders } from "./Script_Light.mjs";
import { CreateTunnelFluid } from "./Script_Fluid.mjs";

const PPM = 48;              // 贴图像素 / 世界米（尺寸标尺）
const PROP_SS = 4;           // 道具/遮蔽物的贴图超采样倍率（特写不糊）
const DETAIL_SS = 3;         // 塌方堆、油灯这类会被特写到的小件
// 人物要顶得住特写：按 2.6 倍超采样烘焙，世界尺寸不变，只是贴图更密


// ---------------------------------------------------------------------------
// 贴图烘焙
// ---------------------------------------------------------------------------
function MakeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

function CanvasTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  return tex;
}

// 把一段绘制烘成 sprite：drawFn(ctx, originX, groundY) 以 (originX, groundY) 为地面锚点
// blur：假景深——越远的层烘焙时糊得越厉害，前景也糊一点
// ss：超采样倍率。调用处仍按 48px/米 标注尺寸，内部把画布加密 ss 倍，
// 世界尺寸不变、贴图密度变高 —— 特写推到 480px/米 也不糊。
function BakeSprite(wPx, hPx, anchorX, groundYPx, drawFn, blur = 0, ss = 1, haze = null) {
  const canvas = MakeCanvas(wPx * ss, hPx * ss);
  const ctx = canvas.getContext("2d");
  ctx.scale(ss, ss);
  if (blur > 0) ctx.filter = `blur(${blur}px)`;
  drawFn(ctx, anchorX, groundYPx);
  ctx.filter = "none";
  // 空气透视：只染这一张精灵本身（source-atop），不是往画面上盖一层雾
  if (haze && haze.amount > 0) {
    ctx.globalCompositeOperation = "source-atop";
    ctx.globalAlpha = haze.amount;
    ctx.fillStyle = haze.color;
    ctx.fillRect(0, 0, wPx, hPx);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
  const tex = CanvasTexture(canvas);
  const geo = new THREE.PlaneGeometry(wPx / PPM, hPx / PPM);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  // 让世界坐标 (x, y) 对应贴图里的 (anchorX, groundYPx)
  mesh.userData.offset = {
    x: (wPx / 2 - anchorX) / PPM,
    y: (groundYPx - hPx / 2) / PPM,
  };
  return mesh;
}

function PlaceSprite(mesh, x, y, z) {
  mesh.position.set(x + mesh.userData.offset.x, y + mesh.userData.offset.y, z);
  mesh.userData.anchor = { x, y, z };
}

// 缩放时保持地面锚点不动（否则远景会整体浮起来）
function ScaleKeepGround(mesh, sx, sy = sx) {
  mesh.scale.set(sx, sy, 1);
  const h = mesh.geometry.parameters.height;
  const w = mesh.geometry.parameters.width;
  const a = mesh.userData.anchor;
  mesh.position.set(
    a.x + mesh.userData.offset.x * sx + (w / 2) * 0 ,
    a.y + mesh.userData.offset.y * sy,
    a.z,
  );
  // offset.y 是"锚点到中心"的距离，按 sy 缩放后即可保持贴地
  void h;
}

// ---------------------------------------------------------------------------
// 人物精灵图集：每种角色一条横向帧带（8 走 + 站 + 蹲）
// ---------------------------------------------------------------------------
// 扛着的物件（单独一张小贴图，跟着手走）
function MakeCarryMesh(label) {
  const wPx = label === "水桶" ? 46 : 120;
  const hPx = label === "水桶" ? 42 : 30;
  return BakeSprite(wPx, hPx, wPx / 2, hPx / 2, (ctx, ax, ay) => {
    ART.DrawCarry(ctx, ax, ay - (label === "水桶" ? 8 : 0), 1.5, 1, label);
  }, 0, DETAIL_SS);
}

// ---------------------------------------------------------------------------
export function CreateWorld(canvasEl) {
  const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  // 小视角透视相机：画面元素全是 2D 贴图，但分布在不同 z 上——
  // 近大远小、地面向后退、视差随镜头推拉变化，2.5D 的纵深感由此而来。
  const FOV = 30;
  const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.5, 400);
  // 参考机位距离：各层贴图按 (D_REF + z深度)/D_REF 预放大，保证默认景别下比例正确
  const D_REF = 24;

  // 视差层容器
  const layers = {
    sky: new THREE.Group(),        // 天光
    ridge: new THREE.Group(),      // 最远的山脊（糊得最厉害）
    hills: new THREE.Group(),      // 远山
    farTown: new THREE.Group(),    // 远处的村落
    midTrees: new THREE.Group(),   // 中景树列
    nearTrees: new THREE.Group(),  // 近景树
    play: new THREE.Group(),       // 玩法层（清晰）
    fore: new THREE.Group(),       // 前景（掠过镜头，微糊）
    fx: new THREE.Group(),
    ots: new THREE.Group(),        // 过肩前景
  };
  const LAYER_Z = {
    sky: -150, ridge: -62, hills: -44, farTown: -26, midTrees: -15,
    nearTrees: -7.5, play: 0, fore: 3.4, fx: 0, ots: 12,
  };
  // 透视补偿：整层按 (D_REF - z)/D_REF 放大，于是每个元素仍落在作者标注的
  // 世界坐标与尺寸上，只是移动速率按透视自然变慢——经典视差，且随推拉变化
  const LAYER_COMP = {};
  for (const k of Object.keys(LAYER_Z)) LAYER_COMP[k] = (D_REF - LAYER_Z[k]) / D_REF;
  // 假景深：离玩法层越远，烘焙时越糊
  const LAYER_BLUR = { ridge: 3.2, hills: 2.2, farTown: 1.3, midTrees: 0.7, nearTrees: 0.25, fore: 1.6 };
  // 空气透视：越远越向雾色靠拢——在烘焙时染进贴图，见 BakeSprite 的 haze 参数
  const LAYER_FADE = { ridge: 0.62, hills: 0.48, farTown: 0.34, midTrees: 0.20, nearTrees: 0.09, play: 0, fore: 0.26 };
  let hazeColor = "#e2d8bc";
  const HazeFor = (key) => (LAYER_FADE[key] ? { color: hazeColor, amount: LAYER_FADE[key] } : null);

  for (const k of Object.keys(layers)) {
    layers[k].position.z = LAYER_Z[k];
    layers[k].scale.setScalar(LAYER_COMP[k]);
    scene.add(layers[k]);
  }

  // ===========================================================================
  // Z 轴分配规范（唯一事实来源）
  //
  // 画面全是半透明贴图、都不写深度缓冲，先后完全由绘制顺序决定。绘制顺序 =
  // renderOrder（层基数 + 层内深度），不再依赖 three.js 按中心点的自动排序，
  // 免得同层元素在镜头推拉时前后翻面。
  //
  // 层间：见 LAYER_ORDER。层内（play 层，世界单位，+ 为靠近镜头）：
  //   -6.0 ~ -1.0   大体量背景建筑（房屋/牢房/炮楼/围墙/树）
  //   -0.9 ~ -0.2   紧贴行走线之后的物件（门框/庄稼/灯杆/柴垛/井台/磨盘）
  //    0.0          行走线：地面、地道剖面、地上道具的落脚点
  //   +0.6          演员：玩家与所有 NPC —— 永远在行走线物件之前
  //   +0.8          演员携带物（木料/水桶），跟着演员走
  //   +1.2 ~ +2.4   有意遮挡演员的近处物件；硬性约束：只允许 ≤1.2m 的矮物件
  //                 进这一段，高过腰的东西（草垛/断墙/树丛）一律退到负值，
  //                 否则会把人整个吞掉。
  //   ≥ +3.4        fore 层：真前景，成片掠过镜头
  // ===========================================================================
  const ACTOR_Z = 0.6;          // 演员行走深度
  const CARRY_Z = 0.8;          // 演员携带物
  const NEAR_CLUTTER = [1.25, 2.3];   // 允许挡人的矮物件区间
  const LAYER_ORDER = {
    sky: 0, ridge: 1000, hills: 2000, farTown: 3000, midTrees: 4000,
    nearTrees: 5000, play: 6000, fx: 7000, fore: 8000, ots: 9000,
  };
  const ORDER_DARK = 8500, ORDER_GLOW = 8600, ORDER_INSERT = 9500;
  // 层内深度 → 绘制序号。z 越大（越近）画得越晚，压在上面。
  const DepthOrder = (layerKey, z) =>
    (LAYER_ORDER[layerKey] ?? 6000) + Math.round((Math.max(-12, Math.min(12, z)) + 12) * 20);
  // 给一个动态对象（演员骨架、携带物、掉落物）派发 play 层的绘制序号。
  // 骨架内部各骨头共用同一序号，彼此的前后仍由各自的局部 z 决定。
  // 钉死一个元素的绘制序号：既写进 userData（ApplyDepthOrder 重跑时不会被
  // 覆盖），也立刻生效——懒创建的元素（流体、标记）等不到下一趟派发。
  function FixOrder(obj, order) {
    obj.userData.fixedOrder = order;
    obj.renderOrder = order;
    return obj;
  }

  function SetPlayOrder(obj, z) {
    const order = DepthOrder("play", z);
    obj.traverse((o) => { if (o.isMesh) o.renderOrder = order; });
  }

  // 给整层里所有还没被显式钉住的元素派发绘制序号
  function ApplyDepthOrder() {
    for (const key of Object.keys(layers)) {
      layers[key].traverse((o) => {
        if (!o.isMesh) return;
        if (o.userData.fixedOrder !== undefined) { o.renderOrder = o.userData.fixedOrder; return; }
        o.renderOrder = DepthOrder(key, o.position.z);
      });
    }
  }

  // 暗场遮罩（乘算）与光晕（加色）
  // 全屏压暗罩：绝不能参与深度，否则会把后画的灯光晕整片剔掉
  const darkMat = new THREE.MeshBasicMaterial({
    color: 0x000000, transparent: true, opacity: 0, depthWrite: false, depthTest: false,
  });
  const darkPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), darkMat);
  darkPlane.position.z = 8;
  darkPlane.renderOrder = ORDER_DARK;
  scene.add(darkPlane);

  const glowTex = (() => {
    const c = MakeCanvas(128, 128);
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(255,220,150,1)");
    grad.addColorStop(0.35, "rgba(255,180,90,0.42)");
    grad.addColorStop(1, "rgba(255,160,70,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return CanvasTexture(c);
  })();

  let occluder = null;

  // 灯：走遮挡光照着色器——照不穿土层与墙，能顺着竖井漏下去
  function MakeGlow(radius, color = 0xffc878, opacity = 1) {
    if (!occluder) {
      // 掩码还没烘好时退回普通加色晕，避免首帧崩
      const mat = new THREE.MeshBasicMaterial({
        map: glowTex, transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, depthTest: false, color, opacity,
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), mat);
      m.renderOrder = ORDER_GLOW;
      m.position.z = 0.4;
      m.userData.SetLight = (x, y) => m.position.set(x, y, 0.4);
      m.userData.SetIntensity = (v) => { mat.opacity = v; };
      return m;
    }
    const m = CreateOccludedLight(occluder, { radius, color, intensity: opacity });
    m.renderOrder = ORDER_GLOW;
    return m;
  }

  const actorSprites = new Map();
  const glows = [];
  let builtKey = "";
  let sceneLights = [];   // 静态灯位 {x,y,r,mesh}
  let fluid = null, fluidKey = "", fluidMesh = null, fluidCanvas = null, fluidCtx = null, fluidImage = null;
  let probeMeshes = [];
  let markerMesh = null, markerCanvas = null, markerCtx = null;
  let collapseMeshes = {};
  let itemMeshes = [];
  let carveState = false, carveRebuild = null;
  let otsMesh = null;
  let otsHiddenId = null;
  let vignetteAlpha = 0;
  let dustMotes = [];
  let lampMeshes = [];

  function ClearGroup(g) {
    while (g.children.length) {
      const c = g.children.pop();
      c.geometry?.dispose?.();
      if (c.material?.map && c.material.map !== glowTex) c.material.map.dispose?.();
      c.material?.dispose?.();
      g.remove(c);
    }
  }

  // -------------------------------------------------------------------------
  // 场景搭建
  // -------------------------------------------------------------------------
  function AddStrip(group, xFrom, xTo, topY, botY, colors, id) {
    // 一条横向色带（地表/天空），带手绘边缘
    const wPx = Math.ceil((xTo - xFrom) * PPM);
    const hPx = Math.ceil((topY - botY) * PPM);
    const mesh = BakeSprite(wPx, hPx, 0, hPx, (ctx) => {
      const grad = ctx.createLinearGradient(0, 0, 0, hPx);
      grad.addColorStop(0, colors[0]);
      grad.addColorStop(1, colors[1] || colors[0]);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, wPx, hPx);
    });
    PlaceSprite(mesh, xFrom, botY, 0);
    group.add(mesh);
    return mesh;
  }

  // ---------------------------------------------------------------------------
  // 纵深带（配合顶部 Z 轴分配规范使用）
  //
  // 相机永远平视（lookAt 与机位等高），所以地面在画面上是随纵深收缩的：
  // 深度 z 处的地面，屏幕高度 ∝ -camY / (dist - z)。z 越负（越远），它的地平线
  // 在画面上就越高。这是正确的透视，不是 bug——但如果那条地平线看不见，
  // 站在远处的房子就会读成"浮在半空"。
  //
  // 所以：**落地物件一律把贴图底边放在所在层的地平线上（地面 y=0、地道
  // y=UNDER_Y），y 永远不要为了"看起来贴地"而手动抬高**；纵深靠 z 表达，
  // 而每一条纵深带都由 AddBandEdge 画出一道实际躺在该深度地面上的沿线
  // （田埂 / 路沿 / 墙根），让眼睛读得出"它站在更靠后的地面上"。
  //
  // 摆道具时从这张表里挑 z，不要另取数值：
  const BAND = {
    backdrop: -6.0,   // 村外田埂、远处院墙
    building: -3.4,   // 房屋、牢房、炮楼、围墙
    yard: -1.6,       // 院内器物、树、庄稼、灯杆
    walk: 0,          // 行走线：地面/地道，玩家与 NPC 的活动面
    clutter: 1.6,     // 允许挡住演员的矮物件（硬性上限 1.2m 高）
  };
  // 在某条纵深带的地面上画一道沿线：真正躺平在 y=地平线、深度 z 处，
  // 于是它的投影就精确落在那条带的地平线上。
  function AddBandEdge(group, xFrom, xTo, z, light, id) {
    const wPx = 1024, hPx = 64;
    const canvas = MakeCanvas(wPx, hPx);
    const g = canvas.getContext("2d");
    const ink = light === "night" || light === "dark" ? "rgba(18,20,26,0.55)" : "rgba(74,58,38,0.45)";
    const grd = g.createLinearGradient(0, 0, 0, hPx);
    grd.addColorStop(0, "rgba(0,0,0,0)");
    grd.addColorStop(0.45, ink);
    grd.addColorStop(0.62, ink);
    grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, wPx, hPx);
    // 沿线不是直的：踩出来的土棱会起伏
    g.strokeStyle = ink;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, hPx * 0.5);
    for (let px = 0; px <= wPx; px += 32) g.lineTo(px, hPx * 0.5 + (ART.Hash(id + px) - 0.5) * 9);
    g.stroke();
    const tex = CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.set(Math.max(1, Math.round((xTo - xFrom) / 26)), 1);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(xTo - xFrom, 0.85),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.9 }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((xFrom + xTo) / 2, SURFACE_Y + 0.012, z);
    FixOrder(mesh, LAYER_ORDER.play - 25 + Math.round(z));
    group.add(mesh);
    return mesh;
  }

  function AddGroundBand(group, xFrom, xTo, groundY, light, id, depthM = 3.2) {
    const wPx = Math.ceil((xTo - xFrom) * PPM);
    const hPx = Math.round(depthM * PPM);
    const colors = light === "day" ? ART.PAL.earthDay
      : light === "dawn" ? ART.PAL.earthDawn
        : light === "night" ? ART.PAL.earthNight : ["#5a4a34", "#3d3123"];
    const grassColor = light === "night" ? ART.PAL.grassNight : ART.PAL.grass;
    const mesh = BakeSprite(wPx, hPx, 0, 6, (ctx) => {
      const grad = ctx.createLinearGradient(0, 0, 0, hPx);
      grad.addColorStop(0, colors[0]);
      grad.addColorStop(1, colors[1]);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 6, wPx, hPx - 6);
      // 地表线（手绘起伏）
      ctx.beginPath();
      ctx.moveTo(0, 6);
      for (let px = 0; px <= wPx; px += 40) {
        ctx.lineTo(px, 6 + (ART.Hash(id + px) - 0.5) * 4);
      }
      ctx.strokeStyle = ART.IN.ink;
      ctx.lineWidth = 2.6;
      ctx.stroke();
      // 草簇与车辙
      for (let i = 0; i < wPx / 34; i += 1) {
        const gx = ART.Hash(id + "g" + i) * wPx;
        ctx.strokeStyle = grassColor;
        ctx.lineWidth = 1.5;
        for (let b = 0; b < 3; b += 1) {
          ctx.beginPath();
          ctx.moveTo(gx + b * 2.5, 7);
          ctx.lineTo(gx + b * 2.5 + (ART.Hash(id + i + b) - 0.5) * 7, 7 - 5 - ART.Hash(id + "h" + i + b) * 6);
          ctx.stroke();
        }
      }
      ART.Speckle(ctx, 0, 8, wPx, hPx - 10, id + "sp", { count: Math.round(wPx / 26), alpha: 0.12, size: 2 });
    });
    PlaceSprite(mesh, xFrom, groundY, 0);
    group.add(mesh);
  }

  // 真正的水平地面：其余元素都是竖直广告牌，只有这块是躺平的几何。
  // 相机在 y≈2.7 平视，于是它自然向地平线收敛 —— 垄沟与车辙的收敛线
  // 就是 2.5D 纵深最强的读法，是此前一直缺的那一块。
  function AddGroundPlane(group, length, light, id) {
    const nearZ = 2.5, farZ = -72;
    const depth = nearZ - farZ;
    const wWorld = length + 220;
    // 贴图：u 沿 x，v 沿纵深；沿 x 等距的线在透视下会收敛
    const wPx = 1400, hPx = 900;
    const canvas = MakeCanvas(wPx, hPx);
    const ctx = canvas.getContext("2d");
    const pal = {
      day: ["#c6a86c", "#a98c58"], dawn: ["#b09a7c", "#8f7c62"],
      night: ["#3f4756", "#2e3542"], tunnel: ["#3a3229", "#2b251d"], dark: ["#251f1a", "#181410"],
    }[light] || ["#c6a86c", "#a98c58"];
    const g = ctx.createLinearGradient(0, 0, 0, hPx);
    g.addColorStop(0, pal[1]);   // 远端更暗（空气透视）
    g.addColorStop(1, pal[0]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, wPx, hPx);
    // 垄沟：沿纵深方向的长线，透视里会收敛到消失点
    ctx.save();
    ctx.globalAlpha = 0.30;
    ctx.strokeStyle = "#5b4a32";
    for (let i = 0; i < 46; i += 1) {
      const x = (i / 46) * wPx + ART.Hash(id + i) * 12;
      ctx.lineWidth = 1.6 + ART.Hash(id + "w" + i) * 2.6;
      ctx.beginPath();
      ctx.moveTo(x, hPx);
      for (let t = 1; t <= 8; t += 1) {
        ctx.lineTo(x + (ART.Hash(id + i + t) - 0.5) * 10, hPx - (t / 8) * hPx);
      }
      ctx.stroke();
    }
    // 横向的田埂与车辙
    ctx.globalAlpha = 0.22;
    for (let j = 0; j < 9; j += 1) {
      const y = hPx - Math.pow(j / 9, 1.7) * hPx;
      ctx.lineWidth = 2 + (8 - j) * 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let t = 0; t <= 14; t += 1) ctx.lineTo((t / 14) * wPx, y + (ART.Hash(id + "h" + j + t) - 0.5) * 7);
      ctx.stroke();
    }
    ctx.restore();
    ART.Speckle(ctx, 0, 0, wPx, hPx, id + "sp", { count: 520, alpha: 0.10, size: 3, color: "#3d3020" });

    const tex = CanvasTexture(canvas);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(wWorld, depth),
      new THREE.MeshBasicMaterial({ map: tex, transparent: false, depthWrite: true }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(length / 2, SURFACE_Y - 0.02, (nearZ + farZ) / 2);
    FixOrder(mesh, LAYER_ORDER.play - 40);   // 地面躺在整个玩法层之下
    group.add(mesh);
    return mesh;
  }

  function AddRidgeBand(group, length, color, id, { amp = 26, base = 34, blur = 2.2, lift = 0.6, opacity = 1 } = {}) {
    const worldW = length * 0.5 + 90;
    const wPx = Math.ceil(worldW * PPM * 0.34);
    const hPx = 180;
    const mesh = BakeSprite(wPx, hPx, 0, hPx, (ctx) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, hPx);
      for (let px = 0; px <= wPx; px += 22) {
        const y = hPx - base - Math.sin(px * 0.006 + ART.Hash(id) * 6) * amp - Math.sin(px * 0.017) * (amp * 0.5);
        ctx.lineTo(px, y);
      }
      ctx.lineTo(wPx, hPx);
      ctx.closePath();
      ctx.fill();
    }, blur, 1, { color: hazeColor, amount: opacity < 0.9 ? 0.5 : 0.35 });
    PlaceSprite(mesh, -30, SURFACE_Y + lift, 0);
    ScaleKeepGround(mesh, 2.9, 1);
    mesh.material.opacity = opacity;
    group.add(mesh);
  }

  // 前景：掠过镜头的草丛与枝条，微糊，压暗——一点点就够
  function AddForeground(group, length, night, id) {
    for (let x = 6; x < length; x += 15 + ART.Hash(id + x) * 14) {
      // 前景：镜头推近之后画框空，需要有东西从边缘掠过带出纵深。
      // 上缘垂枝、下缘草丛、偶尔一段篱笆——都压暗微糊，只当框景用。
      const h0 = ART.Hash(id + "k" + x);
      const kind = h0 > 0.62 ? "branch" : (h0 > 0.3 ? "grass" : "fence");
      const wPx = kind === "branch" ? 340 : 220;
      const hPx = kind === "branch" ? 200 : 150;
      const mesh = BakeSprite(wPx, hPx, wPx / 2, hPx - 4, (ctx, ax, ay) => {
        const tint = night ? "#0f1218" : "#3d3524";
        if (kind === "grass") {
          for (let i = 0; i < 22; i += 1) {
            const gx = ax - 90 + ART.Hash(id + x + i) * 180;
            const gh = 40 + ART.Hash(id + "h" + x + i) * 78;
            ctx.beginPath();
            ctx.moveTo(gx, ay);
            ctx.quadraticCurveTo(gx + (ART.Hash(id + "c" + i) - 0.5) * 26, ay - gh * 0.6,
              gx + (ART.Hash(id + "t" + i) - 0.5) * 52, ay - gh);
            ctx.strokeStyle = tint;
            ctx.lineWidth = 3.4;
            ctx.lineCap = "round";
            ctx.stroke();
          }
        } else if (kind === "fence") {
          // 一段矮篱笆横在镜头前
          for (let i = 0; i < 7; i += 1) {
            const fx = ax - 140 + i * 46;
            ctx.beginPath();
            ctx.moveTo(fx, ay);
            ctx.lineTo(fx + (ART.Hash(id + "f" + i) - 0.5) * 12, ay - 60 - ART.Hash(id + "fh" + i) * 26);
            ctx.strokeStyle = tint;
            ctx.lineWidth = 9;
            ctx.lineCap = "round";
            ctx.stroke();
          }
          for (let r = 0; r < 2; r += 1) {
            ctx.beginPath();
            ctx.moveTo(ax - 150, ay - 26 - r * 26);
            for (let t = 0; t <= 8; t += 1) {
              ctx.lineTo(ax - 150 + t * 40, ay - 26 - r * 26 + (ART.Hash(id + "r" + r + t) - 0.5) * 9);
            }
            ctx.strokeStyle = tint;
            ctx.lineWidth = 7;
            ctx.stroke();
          }
        } else {
          // 从画框上缘垂下来的一枝
          ctx.beginPath();
          ctx.moveTo(ax - 150, 6);
          ctx.quadraticCurveTo(ax, 40, ax + 150, 16);
          ctx.strokeStyle = tint;
          ctx.lineWidth = 7;
          ctx.stroke();
          for (let i = 0; i < 12; i += 1) {
            const t = i / 12;
            const lx = ax - 150 + t * 300;
            const ly = 12 + Math.sin(t * Math.PI) * 26;
            ctx.beginPath();
            ctx.ellipse(lx, ly + 12, 13, 7, ART.Hash(id + i) * 2, 0, Math.PI * 2);
            ctx.fillStyle = tint;
            ctx.fill();
          }
        }
      }, LAYER_BLUR.fore, 1, HazeFor("fore"));
      // 压到画框下缘/上缘之外，只让边角掠过——一点点就够
      PlaceSprite(mesh, x, kind === "branch" ? SURFACE_Y + 6.6 : SURFACE_Y - 4.4, 0);
      ScaleKeepGround(mesh, 1.5 / LAYER_COMP.fore);
      mesh.material.opacity = night ? 0.34 : 0.2;
      group.add(mesh);
    }
  }

  // 空气里的浮尘：光束里看得见的那种
  function AddDust(count, night) {
    const dust = [];
    const tex = (() => {
      const c = MakeCanvas(32, 32);
      const g = c.getContext("2d");
      const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      grad.addColorStop(0, "rgba(255,236,196,0.9)");
      grad.addColorStop(1, "rgba(255,220,160,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, 32, 32);
      return CanvasTexture(c);
    })();
    for (let i = 0; i < count; i += 1) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(0.055, 0.055),
        new THREE.MeshBasicMaterial({
          map: tex, transparent: true, depthWrite: false,
          blending: THREE.AdditiveBlending, opacity: night ? 0.22 : 0.09,
        }),
      );
      m.userData = {
        seed: Math.random() * 100,
        vy: 0.05 + Math.random() * 0.12,
        vx: (Math.random() - 0.5) * 0.14,
      };
      layers.fx.add(m);
      dust.push(m);
    }
    return dust;
  }

  function AddParallaxTown(group, xFrom, xTo, color, id, { ruined = false, objScale = 1 } = {}) {
    for (let x = xFrom; x < xTo; x += 9 + ART.Hash(id + x) * 9) {
      const w = 9 + ART.Hash(id + "w" + x) * 7;
      const h = 2.6 + ART.Hash(id + "h" + x) * 1.6;
      const wPx = Math.ceil((w + 4) * PPM), hPx = Math.ceil((h + 1.6) * PPM);
      const mesh = BakeSprite(wPx, hPx, wPx / 2, hPx, (ctx, ax, ay) => {
        const W = w * PPM, H = h * PPM;
        // 远景屋：墙 + 出檐坡顶 + 一点窗，比纯剪影耐看
        ART.InkFill(ctx, ART.Rect(ax - W / 2, ay - H, W, H), id + x, color,
          { amp: 1.6, lw: 1.6, line: "rgba(43,31,22,0.35)" });
        ART.InkFill(ctx, [
          [ax - W / 2 - 10, ay - H], [ax - W * 0.26, ay - H - 26],
          [ax + W * 0.26, ay - H - 26], [ax + W / 2 + 10, ay - H],
        ], id + "r" + x, color, { amp: 1.4, lw: 1.6, line: "rgba(43,31,22,0.35)", shade: "rgba(0,0,0,0.12)" });
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = "rgba(30,22,16,0.6)";
        ctx.fillRect(ax - W * 0.2, ay - H * 0.62, W * 0.16, H * 0.2);
        ctx.globalAlpha = 1;
        // 院落配件：矮院墙、柴垛、井架、旗杆——远处也要有生活痕迹
        const v = ART.Hash(id + "v" + x);
        ART.InkFill(ctx, ART.Rect(ax - W / 2 - 34, ay - 26, 34, 26), id + "yard" + x, color,
          { amp: 1.4, lw: 1.4, line: "rgba(43,31,22,0.3)" });
        if (v > 0.72) {
          // 井架
          ART.InkFill(ctx, ART.Rect(ax + W / 2 + 10, ay - 46, 5, 46), id + "wp" + x, color, { amp: 1, lw: 1.2, line: null });
          ART.InkFill(ctx, ART.Rect(ax + W / 2 + 30, ay - 46, 5, 46), id + "wq" + x, color, { amp: 1, lw: 1.2, line: null });
          ART.InkFill(ctx, ART.Rect(ax + W / 2 + 6, ay - 52, 33, 6), id + "wt" + x, color, { amp: 1, lw: 1.2, line: null });
        } else if (v > 0.46) {
          // 柴垛
          for (let k = 0; k < 3; k += 1) {
            ART.InkFill(ctx, ART.Rect(ax + W / 2 + 8, ay - 12 - k * 10, 30 - k * 6, 10),
              id + "wd" + x + k, color, { amp: 1.2, lw: 1.2, line: null });
          }
        } else if (v > 0.3) {
          // 旗杆
          ART.InkFill(ctx, ART.Rect(ax - W / 2 - 18, ay - 74, 4, 74), id + "fp" + x, color, { amp: 1, lw: 1, line: null });
        }
        if (ruined) {
          ctx.globalCompositeOperation = "destination-out";
          ctx.fillRect(ax - W * 0.1, ay - H - 30, W * 0.5, H * 0.55);
          ctx.globalCompositeOperation = "source-over";
        }
      }, LAYER_BLUR.farTown, 1, HazeFor("farTown"));
      PlaceSprite(mesh, x, SURFACE_Y - 0.2, 0);
      // 层的补偿只服务于"铺满画框的背景板"；离散的房子要按透视自然变小
      ScaleKeepGround(mesh, objScale * (0.86 + ART.Hash(id + "s" + x) * 0.4));
      mesh.material.opacity = 0.62;
      group.add(mesh);
    }
  }

  function AddParallaxTrees(group, xFrom, xTo, night, id, { blur = 0, scale = 0.72, opacity = 0.85, step = 19, hazeOpt = null } = {}) {
    for (let x = xFrom; x < xTo; x += step + ART.Hash(id + x) * 16) {
      const wPx = 150, hPx = 200;
      const mesh = BakeSprite(wPx, hPx, wPx / 2, hPx - 4, (ctx, ax, ay) => {
        ART.DrawTree(ctx, ax, ay, id + x, { big: false, night });
      }, blur, 1, hazeOpt);
      PlaceSprite(mesh, x, SURFACE_Y - 0.1, 0);
      if (scale !== 1) ScaleKeepGround(mesh, scale);
      mesh.material.opacity = opacity;
      group.add(mesh);
    }
  }

  // 落地投影：没有影子的物件永远像浮在地面线上
  // 光向：太阳偏在画面左后方，影子朝右前方斜出去
  const SUN = { dx: 0.85, dz: 1.0 };

  // 方向性投影：一片躺在地平面上的影子（随地面一起透视），
  // 不再是贴在物件脚下的一团。有了它，东西才真的"站"在地上。
  function MakeFlatShadow(lengthM, widthM, strength) {
    const wPx = 256, hPx = 256;
    const canvas = MakeCanvas(wPx, hPx);
    const ctx = canvas.getContext("2d");
    const g = ctx.createRadialGradient(wPx * 0.5, hPx * 0.32, 0, wPx * 0.5, hPx * 0.5, hPx * 0.5);
    g.addColorStop(0, `rgba(28,20,12,${strength})`);
    g.addColorStop(0.55, `rgba(28,20,12,${strength * 0.5})`);
    g.addColorStop(1, "rgba(28,20,12,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, wPx, hPx);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(widthM, lengthM),
      new THREE.MeshBasicMaterial({ map: CanvasTexture(canvas), transparent: true, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    FixOrder(mesh, LAYER_ORDER.play - 20);  // 投影压在地面上、在所有立面之下
    return mesh;
  }

  function AddGroundShadow(group, x, halfW, strength = 0.28, z = 0) {
    const w = halfW * 2.3;
    const len = halfW * 3.0;
    const mesh = MakeFlatShadow(len, w, strength);
    // 沿光向偏出去一段，影子才是"投"出来的而不是垫在脚下
    mesh.position.set(x + SUN.dx * halfW * 0.7, SURFACE_Y + 0.015, z + SUN.dz * len * 0.34);
    group.add(mesh);
  }

  function AddProp(group, p, light, ruined, sceneKey) {
    const night = light === "night" || light === "tunnel" || light === "dark";
    const gy = SURFACE_Y;
    const mk = (wPx, hPx, ax, ay, fn, x = p.x, y = gy, z = pz) => {
      const mesh = BakeSprite(wPx, hPx, ax, ay, fn, 0, PROP_SS);
      PlaceSprite(mesh, x, y, z);
      group.add(mesh);
      return mesh;
    };
    // 玩法层内部的纵深：房子退到行走线之后，桌凳门框贴在行走线上，
    // 井台磨盘略微靠前。近大远小与前后遮挡由透视自然给出。
    // 全部 ≤ 0：演员在 ACTOR_Z(+0.6) 上走，因此永远走在这些东西前面。
    // 想让某样东西挡住演员，把它做矮，然后交给 AddCover 的 NEAR_CLUTTER 区间。
    // 一律从 BAND 里取值，别再另立数字——否则又会出现"某个道具刚好卡在
    // 演员前面把人吞掉"或者"孤零零一个深度没有地平线可站"。
    const KIND_Z = {
      house: BAND.building, prison: BAND.building, blockhouse: BAND.backdrop,
      fortWall: BAND.building, fortGate: BAND.yard, tree: BAND.yard,
      crops: BAND.yard, lamppost: BAND.yard,
      doorframe: BAND.walk, bench: BAND.walk, stool: BAND.walk, well: BAND.walk,
      mapBoard: -0.9,   // 紧贴行走线之后：玩家走到它跟前，不会被它挡住
      millstone: BAND.walk, woodpile: BAND.walk, hatch: BAND.walk, ditch: BAND.walk,
    };
    const pz = KIND_Z[p.kind] ?? 0;
    const tagKind = (m) => { if (m) m.userData.kind = p.kind; return m; };
    if (["house", "tree", "well", "millstone", "woodpile", "bench", "blockhouse", "prison"].includes(p.kind)) {
      AddGroundShadow(group, p.x, (p.w || 2.4) / 2 + 0.6, p.kind === "house" ? 0.34 : 0.26, pz);
    }
    switch (p.kind) {
      case "mapBoard": {
        // 卸下来的旧门板，斜靠在歇脚点：第六章把情报一条条钉上去
        const bw = 2.4, bh = 1.9;
        const b = BakeSprite(Math.ceil(bw * PPM) + 24, Math.ceil(bh * PPM) + 20,
          Math.ceil(bw * PPM) / 2 + 12, Math.ceil(bh * PPM) + 12,
          (ctx, ax, ay) => ART.DrawMapBoard(ctx, ax, ay, bw * PPM, bh * PPM, p.id,
            { pinned: pinnedNotes }), 0, PROP_SS);
        PlaceSprite(b, p.x, SURFACE_Y, pz);
        tagKind(b);
        group.add(b);
        break;
      }
      case "house": {
        const W = p.w * PPM, H = p.h * PPM;
        mk(W + 90, H + 90, (W + 90) / 2, H + 84,
          (ctx, ax, ay) => ART.DrawHouse(ctx, ax, ay, W, H, p.id, { burnt: ruined && p.burnable, night }));
        break;
      }
      case "doorframe": {
        const mesh = mk(120, 130, 60, 120, (ctx, ax, ay) => ART.DrawDoorframe(ctx, ax, ay, p.id, { carved: carveState }));
        carveRebuild = () => {
          const c = mesh.material.map.image;
          const ctx = c.getContext("2d");
          ctx.clearRect(0, 0, c.width, c.height);
          ART.DrawDoorframe(ctx, 60, 120, p.id, { carved: true });
          mesh.material.map.needsUpdate = true;
        };
        break;
      }
      case "bench": mk(130, 70, 65, 62, (ctx, ax, ay) => ART.DrawBench(ctx, ax, ay, p.id)); break;
      case "stool": mk(60, 40, 30, 34, (ctx, ax, ay) => ART.DrawStool(ctx, ax, ay, p.id)); break;
      case "wallSeg": mk(p.w * PPM + 30, (p.h || 1.8) * PPM + 40, (p.w * PPM + 30) / 2, (p.h || 1.8) * PPM + 30,
        (ctx, ax, ay) => ART.DrawWall(ctx, ax, ay, p.w * PPM, (p.h || 1.8) * PPM, p.id, { burnt: ruined })); break;
      case "hatch": mk(70, 50, 35, 26, (ctx, ax, ay) => ART.DrawHatch(ctx, ax, ay, p.id, { open: true })); break;
      case "well": mk(140, 120, 70, 108, (ctx, ax, ay) => ART.DrawWell(ctx, ax, ay, p.id, { night })); break;
      case "millstone": mk(110, 70, 55, 62, (ctx, ax, ay) => ART.DrawMillstone(ctx, ax, ay, p.id)); break;
      case "woodpile": mk(120, 80, 60, 74, (ctx, ax, ay) => ART.DrawWoodpile(ctx, ax, ay, p.id)); break;
      case "tree": mk(p.big ? 220 : 150, p.big ? 250 : 200, (p.big ? 220 : 150) / 2, (p.big ? 250 : 200) - 6,
        (ctx, ax, ay) => ART.DrawTree(ctx, ax, ay, p.id, { big: p.big, night, bare: ruined })); break;
      case "lamppost": mk(70, 130, 35, 124, (ctx, ax, ay) => ART.DrawLamppost(ctx, ax, ay, p.id, { lit: night })); break;
      case "ditch": mk(p.w * PPM + 40, 90, (p.w * PPM + 40) / 2, 40,
        (ctx, ax, ay) => ART.DrawDitch(ctx, ax, ay, p.w * PPM, p.id)); break;
      case "crops": mk(p.w * PPM + 40, 110, (p.w * PPM + 40) / 2, 102,
        (ctx, ax, ay) => ART.DrawCrops(ctx, ax, ay, p.w * PPM, p.id, { night })); break;
      case "fortWall": mk(p.w * PPM + 60, p.h * PPM + 90, (p.w * PPM + 60) / 2, p.h * PPM + 66,
        (ctx, ax, ay) => ART.DrawFortWall(ctx, ax, ay, p.w * PPM, p.h * PPM, p.id)); break;
      case "fortGate": {
        mk(160, 150, 80, 142, (ctx, ax, ay) => {
          ART.DrawFortWall(ctx, ax - 56, ay, 34, 116, p.id + "l");
          ART.DrawFortWall(ctx, ax + 56, ay, 34, 116, p.id + "r");
          ART.DrawLamppost(ctx, ax, ay, p.id + "lamp", { lit: true });
        });
        break;
      }
      case "blockhouse": mk(190, 300, 95, 292, (ctx, ax, ay) => ART.DrawBlockhouse(ctx, ax, ay, p.id, { lit: true })); break;
      case "prison": mk(180, 160, 90, 152, (ctx, ax, ay) => ART.DrawPrison(ctx, ax, ay, p.id, { night: true })); break;
      case "fortSilhouette": {
        const mesh = BakeSprite(p.w * PPM, 300, 0, 294, (ctx) => {
          const W2 = p.w * PPM;
          const base = 294;
          // 围墙 + 垛口起伏
          ctx.fillStyle = "#2f2921";
          ctx.fillRect(0, base - 96, W2, 96);
          for (let i = 0; i * 34 < W2; i += 1) {
            const hh = 16 + ART.Hash(p.id + "cr" + i) * 12;
            ctx.fillRect(i * 34, base - 96 - hh, 19, hh);
          }
          // 铁丝网
          ctx.save();
          ctx.globalAlpha = 0.55;
          ctx.strokeStyle = "#3d3730";
          ctx.lineWidth = 2;
          for (let r = 0; r < 3; r += 1) {
            ctx.beginPath();
            ctx.moveTo(0, base - 122 - r * 8);
            for (let t = 0; t <= 24; t += 1) {
              ctx.lineTo((W2 * t) / 24, base - 122 - r * 8 + (ART.Hash(p.id + "w" + r + t) - 0.5) * 9);
            }
            ctx.stroke();
          }
          ctx.restore();
          // 院里错落的房脊
          for (let i = 0; i < 5; i += 1) {
            const rx = W2 * (0.12 + ART.Hash(p.id + "rx" + i) * 0.7);
            const rw = 60 + ART.Hash(p.id + "rw" + i) * 70;
            const rh = 34 + ART.Hash(p.id + "rh" + i) * 26;
            ctx.fillStyle = "#332d25";
            ctx.beginPath();
            ctx.moveTo(rx - rw / 2, base - 96);
            ctx.lineTo(rx - rw * 0.3, base - 96 - rh);
            ctx.lineTo(rx + rw * 0.3, base - 96 - rh);
            ctx.lineTo(rx + rw / 2, base - 96);
            ctx.closePath();
            ctx.fill();
          }
          // 炮楼与探照灯杆
          ART.DrawBlockhouse(ctx, W2 * 0.74, base, p.id, { lit: false });
          ctx.fillStyle = "#2b261f";
          ctx.fillRect(W2 * 0.28, base - 200, 5, 104);
          ctx.beginPath();
          ctx.arc(W2 * 0.28 + 2, base - 204, 10, 0, Math.PI * 2);
          ctx.fill();
        });
        PlaceSprite(mesh, p.x - p.w / 2, SURFACE_Y, 0);
        group.add(mesh);
        break;
      }
      case "pump": {
        mk(140, 120, 70, 112, (ctx, ax, ay) => {
          // 水泵/风箱：日军灌烟灌水用的家伙
          ART.InkFill(ctx, ART.Rect(ax - 44, ay - 46, 88, 46), p.id, "#5f5a4a",
            { amp: 1.4, lw: 2.4, shade: "rgba(0,0,0,0.24)" });
          ART.InkFill(ctx, ART.Rect(ax - 12, ay - 74, 24, 30), p.id + "t", "#6b6555", { amp: 1.1, lw: 2.2 });
          ART.InkLine(ctx, ax + 40, ay - 30, ax + 78, ay - 8, p.id + "hose", { lw: 5, color: "#3e372c", amp: 3 });
          ART.InkLine(ctx, ax - 30, ay - 50, ax - 52, ay - 74, p.id + "handle", { lw: 4, color: "#7a5433" });
        });
        break;
      }
      default: break;
    }
  }

  function AddCover(group, c, light, ruinedScene = false) {
    const night = light === "night" || light === "dark" || light === "tunnel";
    const gy = SURFACE_Y;
    // 深度按"这东西有多高"来定，不能抽签：高过腰的掩体一旦落到人前面，
    // 就会把角色连人带扛的木料整个吞掉（见顶部 Z 轴分配规范）。
    const TALL = { haystack: 1, bush: 1, wallSeg: 1, tree: 1 };
    const lowEnough = !TALL[c.kind] && (c.h || 0.9) <= 1.2;
    const cz = lowEnough ? BAND.clutter : (ART.Hash("cz" + c.id) < 0.5 ? BAND.yard : BAND.building);
    AddGroundShadow(group, c.x, (c.w || 2) / 2 + 0.5, 0.22, cz);
    const mk = (wPx, hPx, ax, ay, fn) => {
      const mesh = BakeSprite(wPx, hPx, ax, ay, fn, 0, PROP_SS);
      PlaceSprite(mesh, c.x, gy, cz);
      mesh.userData.kind = c.kind;
      group.add(mesh);
    };
    switch (c.kind) {
      case "haystack": mk(c.w * PPM + 60, c.w * PPM + 90, (c.w * PPM + 60) / 2, c.w * PPM + 80,
        (ctx, ax, ay) => {
          if (ruinedScene) {
            // 烧塌的草垛：只剩一圈焦黑的底与几根残秆
            ART.InkFill(ctx, [[ax - c.w * PPM * 0.5, ay], [ax - c.w * PPM * 0.3, ay - 22],
              [ax + c.w * PPM * 0.28, ay - 16], [ax + c.w * PPM * 0.5, ay]],
              c.id + "burn", "#3a332a", { amp: 2.4, lw: 2.2, shade: "rgba(0,0,0,0.3)" });
            for (let i = 0; i < 5; i += 1) {
              ART.InkLine(ctx, ax - 20 + i * 10, ay - 8, ax - 26 + i * 12, ay - 34 - ART.Hash(c.id + i) * 18,
                c.id + "st" + i, { lw: 2, color: "#241f18" });
            }
          } else ART.DrawHaystack(ctx, ax, ay, c.w * PPM, c.id, { night });
        }); break;
      case "firewood": mk(c.w * PPM + 60, 90, (c.w * PPM + 60) / 2, 82,
        (ctx, ax, ay) => ART.DrawFirewood(ctx, ax, ay, c.w * PPM, c.id)); break;
      case "wallSeg": mk(c.w * PPM + 40, 120, (c.w * PPM + 40) / 2, 106,
        (ctx, ax, ay) => ART.DrawWall(ctx, ax, ay, c.w * PPM, 72, c.id, { burnt: false })); break;
      case "bush": mk(c.w * PPM + 70, 110, (c.w * PPM + 70) / 2, 100,
        (ctx, ax, ay) => ART.DrawBush(ctx, ax, ay, c.w * PPM, c.id, { night })); break;
      case "ridge": mk(c.w * PPM + 50, 90, (c.w * PPM + 50) / 2, 78,
        (ctx, ax, ay) => ART.DrawRidge(ctx, ax, ay, c.w * PPM, c.id)); break;
      case "crops": mk(c.w * PPM + 40, 110, (c.w * PPM + 40) / 2, 102,
        (ctx, ax, ay) => ART.DrawCrops(ctx, ax, ay, c.w * PPM, c.id, { night })); break;
      case "ditch": break; // 由 props 里的 ditch 绘制
      default: break;
    }
  }

  // 地下剖面：一整条烘成大贴图（含土层/空腔/支撑木/洞室/竖井）
  function AddUnderground(group, sceneDef, state, sceneKey) {
    const range = sceneDef.walk.under;
    if (!range) return;
    // 地道不是一张平贴图：近侧土层剖面掏空 → 看进去是后退的地面 →
    // 尽头是后壁；支撑木分布在不同 z 上，人从木柱之间穿过去。
    const NEAR_Z = 2.2;     // 近侧剖面（被切开的那一刀）
    const BACK_Z = -5.5;    // 地道后壁
    const TUN_TOP = UNDER_Y + 2.05;   // 参考里的坑道能直腰走，窄段才猫腰

    const x0 = Math.min(range[0] - 6, -20);
    const x1 = Math.max(range[1] + 6, sceneDef.length + 20);
    const wPx = Math.ceil((x1 - x0) * PPM);
    const topWorld = SURFACE_Y;
    const botWorld = UNDER_Y - 2.6;
    const hPx = Math.ceil((topWorld - botWorld) * PPM);
    const toPx = (wx) => (wx - x0) * PPM;
    const toPy = (wy) => (topWorld - wy) * PPM;
    const tunTop = toPy(TUN_TOP);
    const tunBot = toPy(UNDER_Y);

    // —— 1) 近侧土层剖面：把地道那一块真正掏成透明，才看得进去
    const face = BakeSprite(wPx, hPx, 0, toPy(SURFACE_Y), (ctx) => {
      ART.DrawEarthStrata(ctx, 0, wPx, toPy(SURFACE_Y), hPx, sceneKey + "earth");
      // 土体整体压暗：参考里的地下几乎是纯黑，细节只留在洞沿一圈
      ctx.save();
      ctx.globalCompositeOperation = "source-atop";
      const dk = ctx.createLinearGradient(0, toPy(SURFACE_Y), 0, hPx);
      dk.addColorStop(0, "rgba(12,9,5,0.44)");
      dk.addColorStop(0.35, "rgba(10,7,4,0.80)");
      dk.addColorStop(1, "rgba(6,4,2,0.92)");
      ctx.fillStyle = dk;
      ctx.fillRect(0, toPy(SURFACE_Y), wPx, hPx);
      ctx.restore();
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      // 走廊：沿 x 按起伏掏出来，边缘是波浪的土沿而不是直线
      ctx.beginPath();
      ctx.moveTo(toPx(range[0]), tunTop);
      for (let wx = range[0]; wx <= range[1]; wx += 1.2) {
        ctx.lineTo(toPx(wx), tunTop + ART.CavityProfile(wx, sceneKey + "cav", 0, 0).top);
      }
      for (let wx = range[1]; wx >= range[0]; wx -= 1.2) {
        ctx.lineTo(toPx(wx), tunBot + ART.CavityProfile(wx, sceneKey + "cav", 0, 0).bot);
      }
      ctx.closePath();
      ctx.fill();
      // 洞室 / 旁洞更高
      for (const p of sceneDef.props) {
        if (p.kind === "chamber") {
          ctx.fillRect(toPx(p.x - p.w / 2), toPy(UNDER_Y + 3.0), p.w * PPM, tunBot - toPy(UNDER_Y + 3.0));
        } else if (p.kind === "pocket") {
          ctx.fillRect(toPx(p.x) - 2.8 * PPM, toPy(UNDER_Y + 2.5), 5.6 * PPM, tunBot - toPy(UNDER_Y + 2.5));
        }
      }
      // 翻口：地道在这一段往下沉一个 U 形弯，得跟走廊一样从土里掏出来
      for (const p of sceneDef.props) {
        if (p.kind !== "waterTrap") continue;
        if (p.builtFlag && !state.flags[p.builtFlag]) continue;
        const tw = 3.4 * PPM, td = 1.05 * PPM;
        ctx.beginPath();
        ctx.moveTo(toPx(p.x) - tw / 2, tunBot);
        ctx.bezierCurveTo(toPx(p.x) - tw * 0.28, tunBot + td,
          toPx(p.x) + tw * 0.28, tunBot + td, toPx(p.x) + tw / 2, tunBot);
        ctx.closePath();
        ctx.fill();
      }
      // 竖井
      for (const shaft of sceneDef.shafts) {
        if (shaft.builtFlag && !state.flags[shaft.builtFlag]) continue;
        ctx.fillRect(toPx(shaft.x) - 0.85 * PPM, toPy(SURFACE_Y), 1.7 * PPM, tunTop - toPy(SURFACE_Y));
      }
      ctx.restore();
      // 洞沿：一圈粗墨线 + 往土里晕开的暗，让"掏出来的洞"读得出来
      ctx.globalCompositeOperation = "source-over";
      ctx.beginPath();
      ctx.moveTo(toPx(range[0]), tunTop);
      for (let wx = range[0]; wx <= range[1]; wx += 1.2) {
        ctx.lineTo(toPx(wx), tunTop + ART.CavityProfile(wx, sceneKey + "cav", 0, 0).top);
      }
      ctx.strokeStyle = "rgba(24,17,10,0.75)";
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(toPx(range[0]), tunBot);
      for (let wx = range[0]; wx <= range[1]; wx += 1.2) {
        ctx.lineTo(toPx(wx), tunBot + ART.CavityProfile(wx, sceneKey + "cav", 0, 0).bot);
      }
      ctx.strokeStyle = "rgba(24,17,10,0.6)";
      ctx.lineWidth = 5;
      ctx.stroke();
    });
    PlaceSprite(face, x0, SURFACE_Y, NEAR_Z);
    group.add(face);

    // 洞口内侧的暗角：顶沿最重、往下渐收。"往里看"的纵深靠它
    const vign = BakeSprite(
      Math.ceil((range[1] - range[0] + 4) * PPM), Math.ceil(1.55 * PPM),
      0, Math.ceil(1.55 * PPM),
      (ctx) => {
        const w = Math.ceil((range[1] - range[0] + 4) * PPM);
        const h = Math.ceil(1.55 * PPM);
        const grd = ctx.createLinearGradient(0, 0, 0, h);
        grd.addColorStop(0, "rgba(18,13,8,0.72)");
        grd.addColorStop(0.42, "rgba(18,13,8,0.18)");
        grd.addColorStop(1, "rgba(18,13,8,0.30)");
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, w, h);
      });
    PlaceSprite(vign, range[0] - 2, UNDER_Y, NEAR_Z - 0.4);
    vign.material.depthWrite = false;
    group.add(vign);

    // —— 2) 地道地面：躺平的几何，从近侧一直铺到后壁，会向纵深收
    const floorTex = (() => {
      const c = MakeCanvas(1200, 400);
      const g = c.getContext("2d");
      const grd = g.createLinearGradient(0, 0, 0, 400);
      grd.addColorStop(0, "#4a3722");    // 远端（后壁根）更暗
      grd.addColorStop(1, "#8a6b46");    // 近端
      g.fillStyle = grd;
      g.fillRect(0, 0, 1200, 400);
      // 踩出来的一条路，和几道拖痕
      g.save();
      g.globalAlpha = 0.30;
      g.strokeStyle = "#6b5236";
      for (let i = 0; i < 24; i += 1) {
        const y = 40 + ART.Hash(sceneKey + "fl" + i) * 320;
        g.lineWidth = 2 + ART.Hash(sceneKey + "fw" + i) * 5;
        g.beginPath();
        g.moveTo(0, y);
        for (let t = 0; t <= 12; t += 1) g.lineTo((t / 12) * 1200, y + (ART.Hash(sceneKey + "f" + i + t) - 0.5) * 12);
        g.stroke();
      }
      g.restore();
      ART.Speckle(g, 0, 0, 1200, 400, sceneKey + "fsp", { count: 300, alpha: 0.14, size: 3, color: "#3a2c1c" });
      return CanvasTexture(c);
    })();
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(range[1] - range[0] + 4, NEAR_Z - BACK_Z),
      new THREE.MeshBasicMaterial({ map: floorTex }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((range[0] + range[1]) / 2, UNDER_Y, (NEAR_Z + BACK_Z) / 2);
    FixOrder(floor, LAYER_ORDER.play - 30);
    group.add(floor);

    // —— 3) 后壁：地道尽头那面土墙，带镐痕
    const backW = range[1] - range[0] + 4;
    const back = BakeSprite(Math.ceil(backW * PPM), Math.ceil(3.6 * PPM), 0, Math.ceil(3.6 * PPM), (ctx) => {
      const w = Math.ceil(backW * PPM), h = Math.ceil(3.6 * PPM);
      const grd = ctx.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, "#3a2c1c");
      grd.addColorStop(1, "#5c4630");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, w, h);
      // 镐痕：一道道弧
      ctx.save();
      ctx.globalAlpha = 0.26;
      ctx.strokeStyle = "#2b2015";
      ctx.lineWidth = 3;
      for (let i = 0; i < w / 26; i += 1) {
        const px = i * 26 + ART.Hash(sceneKey + "pk" + i) * 14;
        const py = 20 + ART.Hash(sceneKey + "pky" + i) * (h - 40);
        ctx.beginPath();
        ctx.arc(px, py, 12 + ART.Hash(sceneKey + "pr" + i) * 10, 0.6, 2.4);
        ctx.stroke();
      }
      ctx.restore();
      ART.Speckle(ctx, 0, 0, w, h, sceneKey + "bsp", { count: Math.round(w / 12), alpha: 0.18, size: 3, color: "#241a10" });
    });
    PlaceSprite(back, range[0] - 2, UNDER_Y, BACK_Z);
    group.add(back);

    // —— 4) 支撑木：分布在不同 z 上，人从木柱之间穿过去
    const beamZ = [BACK_Z + 1.2, -2.4, -0.3, 1.6];
    let bi = 0;
    for (let x = range[0] + 3; x < range[1] - 2; x += 2.8 + ART.Hash(sceneKey + "gap" + Math.round(x)) * 3.4) {
      const z = beamZ[bi % beamZ.length];
      bi += 1;
      const beamH = Math.ceil((TUN_TOP - UNDER_Y) * PPM);
      const beam = BakeSprite(170, beamH + 14, 85, beamH + 6, (ctx, ax, ay) => {
        ART.DrawCrudeTimber(ctx, ax, 6, ay, sceneKey + "bm" + Math.round(x));
      }, 0, 3);
      PlaceSprite(beam, x, UNDER_Y, z);
      // 越近越亮越大（挡在人前面），越远越暗越小 —— 前后关系就读出来了
      const t = (z - BACK_Z) / (NEAR_Z - BACK_Z);          // 0 远 → 1 近
      const tint = 0.74 + t * 0.42;
      beam.material.color.setRGB(tint, tint * 0.97, tint * 0.92);
      beam.material.opacity = 0.9 + t * 0.1;
      group.add(beam);
    }

    // —— 5) 竖井与洞里的零件（贴在中景，人可以从它前后经过）
    for (const shaft of sceneDef.shafts) {
      if (shaft.builtFlag && !state.flags[shaft.builtFlag]) continue;
      const sh = BakeSprite(90, Math.ceil((SURFACE_Y - UNDER_Y + 0.6) * PPM), 45,
        Math.ceil((SURFACE_Y - UNDER_Y + 0.6) * PPM), (ctx, ax, ay) => {
          ART.DrawShaft(ctx, ax, 4, ay - 0.3 * PPM, shaft.id);
        }, 0, 2);
      PlaceSprite(sh, shaft.x, UNDER_Y, -1.2);
      group.add(sh);
    }
    for (const p of sceneDef.props) {
      if (p.kind === "waterTrap") {
        // 挖好之前地上什么也没有——第四章那场烟正是因为还没有它
        if (p.builtFlag && !state.flags[p.builtFlag]) continue;
        const tw = 3.4;
        const t = BakeSprite(Math.ceil(tw * PPM) + 24, 130, Math.ceil(tw * PPM) / 2 + 12, 8,
          (ctx, ax, ay) => ART.DrawWaterTrap(ctx, ax, ay, tw * PPM, p.id), 0, PROP_SS);
        // 近侧那一刀土在 z=2.2；弯要画在它之前，不然连同水一起被土盖掉
        PlaceSprite(t, p.x, UNDER_Y, 2.0);
        group.add(t);
      } else if (p.kind === "vent") {
        const v = BakeSprite(60, Math.ceil((SURFACE_Y - TUN_TOP + 0.4) * PPM), 30,
          Math.ceil((SURFACE_Y - TUN_TOP + 0.4) * PPM), (ctx, ax, ay) => {
            ART.DrawVentPipe(ctx, ax, 4, ay, p.id);
          }, 0, 2);
        PlaceSprite(v, p.x, TUN_TOP, -2.0);
        group.add(v);
      } else if (p.kind === "bell") {
        const b = BakeSprite(80, 90, 40, 78, (ctx, ax, ay) => ART.DrawBell(ctx, ax, ay - 40, p.id, {}), 0, 3);
        PlaceSprite(b, p.x, TUN_TOP - 0.7, -1.0);
        group.add(b);
      } else if (p.kind === "chamber" || p.kind === "pocket") {
        // 洞室的后壁再退一层，读出"这里更深"
        const cw = (p.kind === "chamber" ? p.w : 5.6);
        const cb = BakeSprite(Math.ceil(cw * PPM), Math.ceil(3.4 * PPM), 0, Math.ceil(3.4 * PPM), (ctx) => {
          const w = Math.ceil(cw * PPM), h = Math.ceil(3.4 * PPM);
          const grd = ctx.createLinearGradient(0, 0, 0, h);
          grd.addColorStop(0, "#2e2317");
          grd.addColorStop(1, "#4a3a26");
          ctx.fillStyle = grd;
          ctx.fillRect(0, 0, w, h);
          ART.Speckle(ctx, 0, 0, w, h, p.id + "sp", { count: 90, alpha: 0.2, size: 3, color: "#1e1710" });
        });
        PlaceSprite(cb, p.x - cw / 2, UNDER_Y, BACK_Z - 2.5);
        group.add(cb);
      }
    }
  }

  function AddCollapses(group, sceneDef) {
    collapseMeshes = {};
    for (const p of sceneDef.props) {
      if (p.kind !== "collapse") continue;
      const mesh = BakeSprite(130, 110, 65, 104, (ctx, ax, ay) => ART.DrawCollapsePile(ctx, ax, ay, 1, p.id), 0, DETAIL_SS);
      PlaceSprite(mesh, p.x, UNDER_Y, 0);
      group.add(mesh);
      collapseMeshes[p.id] = mesh;
    }
  }

  // -------------------------------------------------------------------------
  let pinnedNotes = 0;

  function BuildEnvironment(state) {
    // 门板上的纸条是烘进贴图的，钉一条就得重烘一次
    const pins = state.beat?.pinned || 0;
    if (pins !== pinnedNotes) { pinnedNotes = pins; builtKey = ""; }
    const ch0 = CHAPTERS[state.chapterIndex];
    const ch = state.lightOverride ? { ...ch0, light: state.lightOverride } : ch0;
    const key = `${ch.scene}:${ch.light}:${state.flags.ruined ? 1 : 0}:${state.flags.hiddenBuilt ? 1 : 0}`;
    if (key === builtKey) return;
    builtKey = key;
    carveState = !!state.flags.carved;
    carveRebuild = null;
    for (const k of Object.keys(layers)) if (k !== "ots") ClearGroup(layers[k]);
    dustMotes = [];
    for (const g of glows) scene.remove(g);
    glows.length = 0;
    sceneLights = [];

    const sceneDef = SCENES[ch.scene];
    const L = sceneDef.length;
    const night = ch.light === "night" || ch.light === "dark" || ch.light === "tunnel";
    hazeColor = {
      day: "#e2d8bc", dawn: "#d8c6a8", night: "#2a3752", tunnel: "#2c2318", dark: "#171310",
    }[ch.light] || "#e2d8bc";

    // 遮挡掩码：土是实心的，地道/洞室/竖井是掏出来的空气
    const occ = SceneOccluders(sceneDef, state, SURFACE_Y, UNDER_Y);
    occluder = BuildOccluder(occ.bounds, occ.solids, occ.air);

    // 天空
    const skyColors = {
      day: ["#cfd8dc", "#e6dcc0"], night: ["#0e1424", "#1e2740"],
      dawn: ["#8f8fa6", "#e0bc92"], tunnel: ["#141a26", "#2a2418"], dark: ["#0a0d14", "#181410"],
    }[ch.light] || ["#cfd8dc", "#e6dcc0"];
    {
      const skyW = Math.ceil((L + 160) * PPM * 0.14);
      const skyH = 520;
      const skyMesh = BakeSprite(skyW, skyH, 0, skyH, (ctx) => {
        const g = ctx.createLinearGradient(0, 0, 0, skyH);
        g.addColorStop(0, skyColors[0]);
        g.addColorStop(1, skyColors[1] || skyColors[0]);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, skyW, skyH);
        ART.DrawSky(ctx, skyW, skyH, ch.light, ch.scene + "sky");
      });
      PlaceSprite(skyMesh, -80, -14, 0);
      ScaleKeepGround(skyMesh, 7.2, (26 + 14) / (skyH / PPM));
      layers.sky.add(skyMesh);
    }
    // 地平线暖雾：把天和地缝起来，也是纵深的一部分
    {
      const hazeColor = {
        day: "rgba(214,190,148,0.55)", dawn: "rgba(226,186,142,0.6)",
        night: "rgba(58,68,96,0.5)", tunnel: "rgba(52,44,32,0.5)", dark: "rgba(30,26,22,0.5)",
      }[ch.light] || "rgba(214,190,148,0.5)";
      const wPx = Math.ceil((L + 160) * PPM * 0.2);
      const hPx = 200;
      const haze = BakeSprite(wPx, hPx, 0, hPx, (ctx) => {
        const g = ctx.createLinearGradient(0, 0, 0, hPx);
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(1, hazeColor);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, wPx, hPx);
      }, 2);
      PlaceSprite(haze, -80, SURFACE_Y - 0.5, 0);
      ScaleKeepGround(haze, 5, 1);
      layers.hills.add(haze);
    }

    // 远景分层（越远越糊越淡：假景深）
    const pal = {
      day: { ridge: "#b6ab90", hill: "#a08e6a", town: "#a8967a" },
      dawn: { ridge: "#a89c8c", hill: "#8d8474", town: "#9c9080" },
      night: { ridge: "#2a3244", hill: "#212938", town: "#39415a" },
      tunnel: { ridge: "#2a2a30", hill: "#232227", town: "#33313a" },
      dark: { ridge: "#1c1c22", hill: "#17171c", town: "#24232a" },
    }[ch.light] || { ridge: "#b6ab90", hill: "#a08e6a", town: "#a8967a" };

    AddRidgeBand(layers.ridge, L, pal.ridge, ch.scene + "ridge",
      { amp: 40, base: 58, blur: LAYER_BLUR.ridge, lift: 1.6, opacity: 0.7 });
    AddRidgeBand(layers.hills, L, pal.hill, ch.scene + "hill",
      { amp: 26, base: 34, blur: LAYER_BLUR.hills, lift: 0.7, opacity: 0.88 });

    // 各深度层各铺一条地面：透视下它们逐级收向地平线，地就"退"出去了
    const farEarth = {
      day: ["#c0a675", "#ad9260"], dawn: ["#ab9880", "#94826c"],
      night: ["#3f4757", "#333b4a"], tunnel: ["#3a352c", "#2e2a22"], dark: ["#26231e", "#1d1b17"],
    }[ch.light] || ["#c0a675", "#ad9260"];
    for (const [key, tint, depth] of [
      ["hills", 0.55, 9], ["farTown", 0.72, 7], ["midTrees", 0.85, 6], ["nearTrees", 1, 5],
    ]) {
      if (ch.scene === "tunnelFort" && key !== "nearTrees") continue;
      const wPx = Math.ceil((L + 160) * PPM);
      const hPx = Math.round(depth * PPM);
      const band = BakeSprite(wPx, hPx, 0, 4, (ctx) => {
        const g = ctx.createLinearGradient(0, 0, 0, hPx);
        g.addColorStop(0, farEarth[0]);
        g.addColorStop(1, farEarth[1]);
        ctx.fillStyle = g;
        ctx.fillRect(0, 4, wPx, hPx - 4);
        ctx.strokeStyle = "rgba(43,31,22,0.5)";
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(0, 4);
        for (let px = 0; px <= wPx; px += 44) ctx.lineTo(px, 4 + (ART.Hash(key + px) - 0.5) * 5);
        ctx.stroke();
      }, LAYER_BLUR[key] || 0, 1, HazeFor(key));
      PlaceSprite(band, -80, SURFACE_Y, 0);
      band.material.opacity = tint;
      layers[key].add(band);
    }
    if (ch.scene === "village" || ch.scene === "tunnelVillage") {
      AddParallaxTown(layers.farTown, -10, L + 10,
        state.flags.ruined && ch.light !== "night" ? "#7d7466" : pal.town,
        ch.scene + "town", { ruined: state.flags.ruined, objScale: 1 / LAYER_COMP.farTown });
    }
    if (ch.scene !== "tunnelFort") {
      AddParallaxTrees(layers.midTrees, -4, L + 8, night, ch.scene + "mtree",
        { blur: LAYER_BLUR.midTrees, scale: 1 / LAYER_COMP.midTrees, opacity: 0.86, step: 24, hazeOpt: HazeFor("midTrees") });
      AddParallaxTrees(layers.nearTrees, 4, L - 8, night, ch.scene + "ptree",
        { blur: LAYER_BLUR.nearTrees, scale: 1 / LAYER_COMP.nearTrees, opacity: 0.96, hazeOpt: HazeFor("nearTrees") });
      AddForeground(layers.fore, L, night, ch.scene + "fg");
    }

    // 真正的地面（躺平的几何，向地平线收敛）
    AddGroundPlane(layers.play, L, ch.light, ch.scene + "gp");
    // 第八章：院子一带留下焦土
    if (state.flags.ruined) {
      for (const bx of [30, 62, 92]) {
        const scorch = MakeFlatShadow(9, 16, 0.34);
        scorch.position.set(bx, SURFACE_Y + 0.02, -1.2);
        layers.play.add(scorch);
      }
    }
    // 近处的断面带：把玩法线前缘收住，也遮住地平面的近端接缝
    AddGroundBand(layers.play, -30, L + 30, SURFACE_Y, ch.light, ch.scene + "ground",
      sceneDef.walk.under ? 3.2 : 16);

    // 地下剖面
    // 每条纵深带一道看得见的地平线：远处的房子/树才有"地"可站
    if (!sceneDef.underOnly) {
      for (const z of [BAND.backdrop, BAND.building, BAND.yard]) {
        AddBandEdge(layers.play, -30, L + 30, z, ch.light, ch.scene + "be" + z);
      }
    }

    AddUnderground(layers.play, sceneDef, state, ch.scene);
    AddCollapses(layers.play, sceneDef);

    // 地表道具与遮蔽
    for (const p of sceneDef.props) {
      if (["chamber", "pocket", "vent", "waterTrap", "bell", "collapse"].includes(p.kind)) continue;
      AddProp(layers.play, p, ch.light, state.flags.ruined, ch.scene);
    }
    for (const c of sceneDef.covers) AddCover(layers.play, c, ch.light, state.flags.ruined);

    // 静态灯位
    const lampSpots = [];
    for (const p of sceneDef.props) {
      if (p.kind === "lamppost" && night) lampSpots.push({ x: p.x, y: 1.6, r: 4.5, i: 0.9 });
      if (p.kind === "fortGate") lampSpots.push({ x: p.x, y: 2.6, r: 5.5, i: 1.0 });
      if (p.kind === "blockhouse") lampSpots.push({ x: p.x, y: 6.4, r: 7, i: 1.1 });
      if (p.kind === "prison") lampSpots.push({ x: p.x, y: 1.5, r: 4, i: 0.75 });
      if (p.kind === "chamber" && ch.scene === "tunnelVillage") lampSpots.push({ x: p.x, y: UNDER_Y + 1.5, r: 4.2, i: 1.0 });
    }
    for (const spot of lampSpots) {
      const g = MakeGlow(spot.r, 0xffc878, spot.i);
      g.userData.SetLight(spot.x, spot.y);
      scene.add(g);
      glows.push(g);
      sceneLights.push(spot);
    }

    // 浮尘
    for (const d of dustMotes) layers.fx.remove(d);
    dustMotes = AddDust(ch.scene === "tunnelFort" ? 26 : 18, night);

    // 最后统一派发绘制序号：层间靠基数、层内靠深度，先后关系从此确定，
    // 不再受 three.js 按中心点自动排序的影响（镜头推拉时不会前后翻面）
    ApplyDepthOrder();
  }

  // -------------------------------------------------------------------------
  // 角色
  // -------------------------------------------------------------------------
  function EnsureActorSprite(id, kind) {
    let s = actorSprites.get(id);
    if (!s) {
      // 骨骼装配：每块骨头一张贴图，逐帧只转关节
      const rig = CreateRig(kind);
      layers.play.add(rig.group);
      SetPlayOrder(rig.group, ACTOR_Z);
      const shadow = MakeFlatShadow(1.9, 1.15, 0.30);
      layers.play.add(shadow);
      SetPlayOrder(shadow, ACTOR_Z - 0.05);
      s = {
        rig, mesh: rig.group, prevX: null, phase: 0, kind, carryMesh: null, glow: null,
        shadow, idleT: Math.random() * 6, bodyScale: BODY_SCALE[kind] ?? 1,
      };
      actorSprites.set(id, s);
    }
    return s;
  }


  function UpdateOne(s, x, level, heading, crouch, dt, carry = false, extra = {}) {
    const y = level === "under" ? UNDER_Y : SURFACE_Y;
    const moved = s.prevX === null ? 0 : Math.abs(x - s.prevX);
    s.prevX = x;
    // 步频跟着实际位移走（不是定速循环），停下就自然收回站姿
    const isMoving = moved > 0.006;
    if (isMoving) s.phase += moved * 3.4;
    else s.phase += dt * 2.2;      // 挖土/爬梯这类原地动作也要有相位
    s.idleT += dt * 1.4;

    PoseRig(s.rig, {
      phase: s.phase, breath: s.idleT, moving: isMoving, crouch, carry,
      climbing: extra.climbing, digging: extra.digging,
    }, dt);

    s.mesh.position.set(x, y, ACTOR_Z);
    const bs = extra.bodyScale || s.bodyScale || 1;
    s.mesh.scale.set((heading >= 0 ? 1 : -1) * bs, bs, 1);
    if (s.shadow) {
      // 地下没有太阳，影子由手里的灯给，落在脚边就够
      const under = level === "under";
      s.shadow.visible = true;
      s.shadow.scale.set(bs, bs * (under ? 0.55 : 1), 1);
      s.shadow.position.set(
        x + (under ? 0 : SUN.dx * 0.55) * bs,
        y + 0.015,
        ACTOR_Z - 0.05 + (under ? 0.12 : SUN.dz * 0.62) * bs,
      );
      s.shadow.material.opacity = under ? 0.5 : 1;
    }
    return { x, y, isMoving };
  }

  // 手里/肩上的东西。原先只有玩家有，于是"梁木匠把刨子放下"这种戏只能靠
  // 字幕说——演员手上空空。现在所有演员共用这一套。
  function SyncCarry(s, label, heading) {
    if (label && (!s.carryMesh || s.carryLabel !== label)) {
      if (s.carryMesh) layers.play.remove(s.carryMesh);
      s.carryMesh = MakeCarryMesh(label);
      s.carryLabel = label;
      layers.play.add(s.carryMesh);
      SetPlayOrder(s.carryMesh, CARRY_Z);
    } else if (!label && s.carryMesh) {
      layers.play.remove(s.carryMesh);
      s.carryMesh = null;
      s.carryLabel = null;
    }
    if (!s.carryMesh) return;
    // 水桶和刨子提在手上，木料扛在肩上——挂点不同
    const inHand = label === "水桶" || label === "刨子";
    const anchor = inHand ? HandPoint(s.rig) : ShoulderPoint(s.rig);
    const bs = s.bodyScale || 1;
    s.carryMesh.position.set(anchor.x, anchor.y + (inHand ? -0.20 : 0.10), CARRY_Z);
    s.carryMesh.scale.set((heading >= 0 ? 1 : -1) * bs, bs, 1);
    s.carryMesh.rotation.z = inHand ? 0 : (heading >= 0 ? -0.14 : 0.14);
  }

  // 夜戏里人得从背景里读得出来。全屏压暗罩会把演员和土墙一起压成一团，
  // 在手机那种小屏 + 低亮度上就成了"人都看不见"。做法跟《勇敢的心》一样：
  // 把演员本身提亮，让他们始终比环境亮一档——主角比配角再亮一点。
  const NIGHT_LIFT = { day: 1, dawn: 1.06, night: 1.34, tunnel: 1.30, dark: 1.42 };
  function LiftActor(s, light, isPlayer) {
    const lift = (NIGHT_LIFT[light] ?? 1) * (isPlayer ? 1.08 : 1);
    if (s.liftApplied === lift) return;
    s.liftApplied = lift;
    s.mesh.traverse((o) => { if (o.isMesh && o.material?.color) o.material.color.setScalar(lift); });
  }

  function UpdateActors(state, time, dt) {
    const ch = CHAPTERS[state.chapterIndex];
    const sceneDef = SCENES[ch.scene];
    const seen = new Set(["player"]);
    const p = state.player;
    const ps = EnsureActorSprite("player", "player");
    const def = CurrentBeatDef(state);
    const digging = !!(state.beat && !state.beat.quakeActive
      && ((def?.kind === "digSeq" && state.beat.digIndex !== undefined)
        || def?.kind === "buildSpots" || def?.kind === "hold")
      && state.prompt && state.prompt.includes("%"));
    // 柱子在第一章还是个半大孩子，第二章起抽条；妹妹一直矮一头多
    const boyScale = state.chapterIndex === 0 ? 0.80 : 0.93;
    UpdateOne(ps, p.x, p.level, p.heading, p.crouch, dt, !!p.carry,
      { climbing: p.climbT > 0, digging, bodyScale: boyScale });
    ps.mesh.visible = otsHiddenId !== "player";
    LiftActor(ps, ch.light, true);

    SyncCarry(ps, p.carry, p.heading);

    // 煤油灯
    if (p.lamp) {
      if (!ps.glow || ps.glowKey !== builtKey) {
        if (ps.glow) scene.remove(ps.glow);
        ps.glow = MakeGlow(6.5, 0xffb85c, 1.25);
        ps.glowKey = builtKey;
        scene.add(ps.glow);
        // 暗适应：一圈很弱的大范围光，让走廊轮廓读得出，不至于是个黑洞
        if (ps.adapt) scene.remove(ps.adapt);
        ps.adapt = MakeGlow(17, 0xc9a878, 0.30);
        scene.add(ps.adapt);
      }
      if (ps.adapt) ps.adapt.userData.SetLight(p.x, (p.level === "under" ? UNDER_Y : SURFACE_Y) + 1.0);
      ps.glow.position.set(p.x + p.heading * 0.3, (p.level === "under" ? UNDER_Y : SURFACE_Y) + 1.1, 7.6);
      ps.glow.material.opacity = 1.15 + Math.sin(time * 9.7) * 0.12 + Math.sin(time * 23) * 0.05;
    } else if (ps.glow) {
      scene.remove(ps.glow);
      if (ps.adapt) { scene.remove(ps.adapt); ps.adapt = null; }
      ps.glow = null;
    }

    for (const a of state.actors) {
      seen.add(a.id);
      const s = EnsureActorSprite(a.id, a.kind);
      s.mesh.visible = a.visible !== false && otsHiddenId !== a.id;
      if (!s.mesh.visible) continue;
      const sisterScale = a.id === "sister" ? (state.chapterIndex <= 1 ? 0.60 : 0.68) : null;
      // 走廊里净高一米五，NPC 也得猫腰；洞室与旁洞才直得起腰
      const underTunnel = (a.level === "under")
        && (ch.scene === "tunnelVillage" || ch.scene === "tunnelFort");
      const roomy = underTunnel && sceneDef.props.some((pr) =>
        (pr.kind === "chamber" || pr.kind === "pocket")
        && Math.abs(a.x - pr.x) < ((pr.w || 5.6) / 2 + 0.5));
      UpdateOne(s, a.x, a.level || "surface", a.heading, underTunnel && !roomy, dt, !!a.carry,
        sisterScale ? { bodyScale: sisterScale } : {});
      SyncCarry(s, a.carry, a.heading);
      LiftActor(s, ch.light, false);
      // 提灯
      if (a.lantern) {
        if (!s.glow || s.glowKey !== builtKey) {
          if (s.glow) scene.remove(s.glow);
          s.glow = MakeGlow(4.2, 0xffc878, 0.95);
          s.glowKey = builtKey;
          scene.add(s.glow);
        }
        s.glow.userData.SetLight(a.x + (a.heading || 1) * 0.35, (a.level === "under" ? UNDER_Y : SURFACE_Y) + 1.05);
        s.glow.visible = true;
      } else if (s.glow) {
        s.glow.visible = false;
      }
    }

    for (const [id, s] of actorSprites) {
      if (id !== "player" && !seen.has(id)) {
        layers.play.remove(s.rig ? s.rig.group : s.mesh);
        if (s.shadow) layers.play.remove(s.shadow);
        if (s.glow) scene.remove(s.glow);
        if (s.carryMesh) layers.play.remove(s.carryMesh);
        actorSprites.delete(id);
      } else if (id !== "player") {
        const a = state.actors.find((x) => x.id === id);
        if (s.glow && (!a || a.visible === false)) s.glow.visible = false;
      }
    }
  }

  // -------------------------------------------------------------------------
  // 特效层
  // -------------------------------------------------------------------------
  function UpdateProps(state, time, dt) {
    const ch = CHAPTERS[state.chapterIndex];
    const sceneDef = SCENES[ch.scene];
    const def = CurrentBeatDef(state);

    // 可拾取物件
    if (def?.kind === "collect" && state.beat.itemStates) {
      while (itemMeshes.length < state.beat.itemStates.length) {
        const label = def.carryLabel;
        const m = MakeCarryMesh(label);
        layers.play.add(m);
        SetPlayOrder(m, BAND.walk);   // 地上的待拾物：玩家从它前面走过
        itemMeshes.push(m);
      }
      state.beat.itemStates.forEach((it, i) => {
        const m = itemMeshes[i];
        m.visible = !it.carried && !it.delivered;
        m.position.set(it.x, SURFACE_Y + (def.carryLabel === "水桶" ? 0.32 : 0.22 + i * 0.16), 0.15);
      });
    } else if (itemMeshes.length) {
      for (const m of itemMeshes) layers.play.remove(m);
      itemMeshes = [];
    }

    // 烟与水：真解算（半拉格朗日平流 + 压力投影），固体边界就是地道剖面
    const wantsFluid = !!(state.smoke?.active || state.flood?.active);
    if (wantsFluid && sceneDef.walk.under) {
      const range = sceneDef.walk.under;
      if (!fluid || fluidKey !== builtKey) {
        fluid = CreateTunnelFluid({
          x0: range[0] - 3, x1: range[1] + 3,
          yBottom: UNDER_Y - 0.15, yTop: UNDER_Y + 3.1,
          cols: 200, rows: 26,
        });
        const occ = SceneOccluders(sceneDef, state, SURFACE_Y, UNDER_Y);
        fluid.SetAirRects(occ.air);
        fluid.SetVents(sceneDef.props.filter((pp) => pp.kind === "vent").map((pp) => pp.x));
        // 翻口是水封：挖好之后，模拟出来的烟也必须在这儿停住，
        // 否则一维的烟锋停了、画面上的烟还在往西飘，两套说法对不上
        fluid.SetBarriers(sceneDef.props
          .filter((pp) => pp.kind === "waterTrap" && (!pp.builtFlag || state.flags[pp.builtFlag]))
          .map((pp) => pp.x));
        fluidKey = builtKey;
        fluidCanvas = MakeCanvas(fluid.cols, fluid.rows);
        fluidCtx = fluidCanvas.getContext("2d");
        fluidImage = fluidCtx.createImageData(fluid.cols, fluid.rows);
        const tex = CanvasTexture(fluidCanvas);
        tex.minFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
        if (fluidMesh) layers.fx.remove(fluidMesh);
        fluidMesh = new THREE.Mesh(new THREE.PlaneGeometry(
          fluid.x1 - fluid.x0, fluid.yTop - fluid.yBottom), mat);
        fluidMesh.position.set((fluid.x0 + fluid.x1) / 2, (fluid.yBottom + fluid.yTop) / 2, 0.35);
        FixOrder(fluidMesh, LAYER_ORDER.fx + 220);
        layers.fx.add(fluidMesh);
      }
      // 灌烟口/灌水口持续注入
      if (state.smoke?.active) {
        const src = state.smoke.sourceX ?? (sceneDef.shafts[0]?.x ?? fluid.x1 - 4);
        fluid.Emit(src, UNDER_Y + 1.05, { smoke: 30 * Math.min(0.05, dt), vx: -2.6, vy: 0.15, radius: 1.15 });
      }
      if (state.flood?.active) {
        const src = state.flood.sourceX ?? (sceneDef.shafts[0]?.x ?? fluid.x1 - 4);
        fluid.Emit(src, UNDER_Y + 2.0, { water: 34 * Math.min(0.05, dt), vx: -0.8, vy: -1.6, radius: 0.8 });
      }
      fluid.Step(dt);
      fluid.Paint(fluidImage);
      fluidCtx.putImageData(fluidImage, 0, 0);
      fluidMesh.material.map.needsUpdate = true;
      fluidMesh.visible = true;
      // 把解算出来的烟前锋回灌给玩法层，玩法与画面是同一件事。
      // 只在解算确实有烟时才接管，否则保留核心层的解析推进——
      // 玩法判定不能因为解算抽风就失效。
      if (state.smoke?.active) {
        const f = fluid.SmokeFrontX();
        if (f < fluid.x1 - 1.5) state.smoke.frontX = Math.min(state.smoke.frontX, f);
      }
      if (state.flood?.active) state.floodDepth = fluid.WaterDepthAt(state.player.x);
    } else if (fluidMesh) {
      fluidMesh.visible = false;
    }

    // 探杆
    const quakeOn = state.beat && (state.beat.quakeWarn || state.beat.quakeActive)
      && (def?.kind === "digSeq" || def?.kind === "rescueLoop");
    if (quakeOn) {
      if (!probeMeshes.length) {
        for (let i = 0; i < 3; i += 1) {
          const m = BakeSprite(40, 200, 20, 0, () => {});
          m.userData.canvas = m.material.map.image;
          layers.fx.add(m);
          probeMeshes.push(m);
        }
      }
      probeMeshes.forEach((m, i) => {
        m.visible = true;
        const jab = state.beat.quakeActive ? Math.abs(Math.sin(time * 5 + i * 1.7)) : 0.15;
        const c = m.userData.canvas;
        const ctx = c.getContext("2d");
        ctx.clearRect(0, 0, c.width, c.height);
        ART.DrawProbeRod(ctx, 20, 6, 88, "rod" + i, { jab });
        m.material.map.needsUpdate = true;
        m.position.set(state.player.x - 3.2 + i * 3.1 + Math.sin(i * 7) * 1.1,
          SURFACE_Y - (200 / 2 - 6) / PPM, 0.5);
      });
    } else {
      for (const m of probeMeshes) m.visible = false;
    }

    // 地道油灯：熄灯那一段，灯是一盏盏灭下去的
    if (state.lamps) {
      while (lampMeshes.length < state.lamps.length) {
        const i = lampMeshes.length;
        const body = BakeSprite(46, 60, 23, 54, (ctx, ax, ay) => {
          ART.InkFill(ctx, [[ax - 11, ay], [ax + 11, ay], [ax + 8, ay - 16], [ax - 8, ay - 16]],
            "lampBody" + i, "#8a6a45", { amp: 1, lw: 2.2, shade: "rgba(0,0,0,0.2)" });
          ART.InkFill(ctx, [[ax - 7, ay - 16], [ax + 7, ay - 16], [ax + 5, ay - 30], [ax - 5, ay - 30]],
            "lampGlass" + i, "#d8c58a", { amp: 0.9, lw: 2 });
          ART.InkLine(ctx, ax, ay - 30, ax, ay - 40, "lampWire" + i, { lw: 1.6, color: "#6b5a3f" });
        }, 0, DETAIL_SS);
        layers.play.add(body);
        SetPlayOrder(body, BAND.walk);
        const glow = MakeGlow(3.4, 0xffc06a, 1.0);
        scene.add(glow);
        lampMeshes.push({ body, glow });
      }
      state.lamps.forEach((l, i) => {
        const m = lampMeshes[i];
        if (!m) return;
        PlaceSprite(m.body, l.x, UNDER_Y + 1.5, 0.2);
        m.body.visible = true;
        m.glow.visible = l.lit;
        m.glow.userData.SetLight(l.x, UNDER_Y + 1.4);
        m.body.material.opacity = l.lit ? 1 : 0.55;
      });
      for (let i = state.lamps.length; i < lampMeshes.length; i += 1) {
        lampMeshes[i].body.visible = false;
        lampMeshes[i].glow.visible = false;
      }
    } else if (lampMeshes.length) {
      for (const m of lampMeshes) { m.body.visible = false; m.glow.visible = false; }
    }

    // 刻痕
    if (state.flags.carved && !carveState) {
      carveState = true;
      carveRebuild?.();
    }

    // 目标指示
    const target = state.phase === "playing" ? GetBeatTarget(state) : null;
    const showMarker = target && target.x !== undefined && def?.kind !== "cinematic" && !state.microCine;
    if (showMarker) {
      if (!markerMesh) {
        markerCanvas = MakeCanvas(48, 48);
        markerCtx = markerCanvas.getContext("2d");
        const tex = CanvasTexture(markerCanvas);
        markerMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(48 / PPM, 48 / PPM),
          new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
        );
        FixOrder(markerMesh, LAYER_ORDER.fx + 300);
        layers.fx.add(markerMesh);
      }
      markerMesh.visible = true;
      markerCtx.clearRect(0, 0, 48, 48);
      ART.DrawMarker(markerCtx, 24, 30, time);
      markerMesh.material.map.needsUpdate = true;
      const by = (target.level === "under" ? UNDER_Y : SURFACE_Y);
      markerMesh.position.set(target.x, by + 2.5, 0.6);
    } else if (markerMesh) {
      markerMesh.visible = false;
    }
  }

  // 暗场：地道章节压暗，灯光晕负责照明
  function UpdateAtmosphere(state, viewW, viewH, camX, camY, dist) {
    const ch0 = CHAPTERS[state.chapterIndex];
    const ch = state.lightOverride ? { ...ch0, light: state.lightOverride } : ch0;
    const base = { day: 0, dawn: 0.05, night: 0.28, tunnel: 0.42, dark: 0.52 }[ch.light] ?? 0;
    // 呛烟时压得更暗一点
    const choke = (state.smoke?.active && SmokeCovers(state, state.player.x)) ? 0.18 : 0;
    vignetteAlpha += ((base + choke) - vignetteAlpha) * 0.08;
    darkMat.opacity = vignetteAlpha;
    // 暗场贴在相机前 3m，按该距离处的视口尺寸铺满
    const planeZ = dist - 3;
    const k = 3 / dist;
    darkPlane.scale.set(viewW * k * 1.2, viewH * k * 1.2, 1);
    darkPlane.position.set(camX, camY, planeZ);
  }

  // 插入特写卡：镜头真正要看的那个细节，另画一张铺满画框
  const insertCards = new Map();
  let insertMesh = null;

  function SetInsertCard(name) {
    if (!name) {
      if (insertMesh) insertMesh.visible = false;
      return;
    }
    if (!insertCards.has(name)) {
      const W = 1280, H = 720;
      const canvas = MakeCanvas(W, H);
      ART.DrawInsertCard(canvas.getContext("2d"), W, H, name);
      insertCards.set(name, CanvasTexture(canvas));
    }
    if (!insertMesh) {
      insertMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, depthTest: false }),
      );
      insertMesh.renderOrder = ORDER_INSERT;
      scene.add(insertMesh);
    }
    insertMesh.material.map = insertCards.get(name);
    insertMesh.material.needsUpdate = true;
    insertMesh.visible = true;
  }

  function PlaceInsertCard(camX, camY, viewW, viewH, dist) {
    if (!insertMesh?.visible) return;
    const z = dist - 2;
    const k = 2 / dist;
    // 按画框比例铺满：宽高取大者，保证不露边
    const cw = viewW * k, chh = viewH * k;
    const aspect = 1280 / 720;
    const w = Math.max(cw, chh * aspect);
    insertMesh.scale.set(w, w / aspect, 1);
    insertMesh.position.set(camX, camY, z);
  }

  // 过肩前景：把某个角色的剪影放在画面边缘（正反打用）
  function SetOverShoulder(state, spec) {
    if (!spec) {
      if (otsMesh) otsMesh.visible = false;
      otsHiddenId = null;
      return;
    }
    // 被越过的那个人由前景剪影代表，本体要藏起来，否则画面里会出现两个他
    otsHiddenId = spec.id;
    const a = spec.id === "player" ? { kind: "player" } : state.actors.find((x) => x.id === spec.id);
    if (!a) { if (otsMesh) otsMesh.visible = false; return; }
    const kind = spec.id === "player" ? "player" : a.kind;
    if (!otsMesh || otsMesh.userData.kind !== kind) {
      if (otsMesh) layers.ots.remove(otsMesh);
      // 专画一张高分辨率头肩剪影：全身图集放大后会糊成一根柱子
      otsMesh = BakeSprite(560, 460, 280, 400, (ctx, ax, ay) => {
        ART.DrawShoulder(ctx, ax, ay - 210, 1.35, kind, "ots" + kind);
      });
      otsMesh.userData.kind = kind;
      otsMesh.material.opacity = 0.97;
      layers.ots.add(otsMesh);
    }
    otsMesh.visible = true;
    otsMesh.scale.set((spec.facing || 1) * 1.9, 1.9, 1);
    otsMesh.userData.place = spec;
  }

  function PlaceOverShoulder(camX, camY, viewW, viewH) {
    if (!otsMesh?.visible) return;
    const spec = otsMesh.userData.place;
    const side = spec.side || -1;
    const comp = LAYER_COMP.ots;        // 层被整体缩放过，位置要换算回局部坐标
    const dist = camera.userData.dist || 24;
    const otsZ = layers.ots.position.z;
    // 该层比玩法层离相机近，投影会放大 M 倍；构图偏移与体量都要按 M 折算
    const M = dist / Math.max(0.5, dist - otsZ);
    // 剪影在屏幕上应占约 55% 画宽：先除掉透视放大倍率，再反解缩放
    const spriteW = otsMesh.geometry.parameters.width;
    const S = (viewW * 0.55) / (M * spriteW);
    otsMesh.scale.set((spec.facing || 1) * S, S, 1);
    // 头肩落在画框一侧、压住下缘，说话的人留在另一侧
    const worldX = camX + side * (viewW / 2) * 0.58 / M;
    const worldY = camY - (viewH / 2) * 0.62 / M + otsMesh.userData.offset.y * S;
    otsMesh.position.set(worldX / comp, worldY / comp, 0);
  }

  // -------------------------------------------------------------------------
  let viewW = 20, viewH = 11.25;

  function ApplyCamera(camX, camY, halfWidth) {
    const aspect = camera.userData.aspect || 16 / 9;
    // 由目标景别反推机位距离：视差与地面退缩随之自然发生
    const dist = halfWidth / (Math.tan((FOV * Math.PI / 180) / 2) * aspect);
    viewW = halfWidth * 2;
    viewH = viewW / aspect;
    camera.aspect = aspect;
    camera.position.set(camX, camY, dist);
    camera.lookAt(camX, camY, 0);   // 永远正视，不旋转
    camera.updateProjectionMatrix();
    camera.userData.dist = dist;

    // 特写时机位很近（hw=2.2 → dist≈4.6m），固定 z 的前景层与过肩层会跑到
    // 相机背后直接消失。把这两层的深度改成随机位距离浮动，始终在相机与
    // 玩法层之间，正反打的过肩剪影才不会丢。
    const otsZ = Math.min(12, dist * 0.5);
    LAYER_COMP.ots = (D_REF - otsZ) / D_REF;
    layers.ots.position.z = otsZ;
    layers.ots.scale.setScalar(LAYER_COMP.ots);
    // 前景只服务于中远景；特写/插入/过肩本来就不该有枝叶糊在镜头前
    layers.fore.visible = dist > 7;
    // 浮尘在画框内循环飘
    for (const d of dustMotes) {
      const u = d.userData;
      u.seed += 0.0016;
      const wrapW = viewW * 1.1, wrapH = viewH * 1.1;
      const bx = ((u.seed * 37 + d.id) % 1);
      d.position.set(
        camX - wrapW / 2 + ((bx * wrapW + u.vx * u.seed * 260) % wrapW),
        camY - wrapH / 2 + (((u.seed * 53) % 1) * wrapH + u.vy * u.seed * 180) % wrapH,
        0.45,
      );
    }
    PlaceOverShoulder(camX, camY, viewW, viewH);
    PlaceInsertCard(camX, camY, viewW, viewH, dist);
    return { viewW, viewH, dist };
  }

  function Resize(width, height) {
    renderer.setSize(width, height, false);
    camera.userData.aspect = width / height;
  }

  function Render() { renderer.render(scene, camera); }

  return {
    THREE, renderer, scene, camera,
    BuildEnvironment, UpdateActors, UpdateProps, UpdateAtmosphere,
    SetOverShoulder, SetInsertCard, ApplyCamera, Resize, Render,
    get __fluid() { return fluid; },
    // 供 Script_DepthAudit.mjs 做落地体检
    debugLayers: () => ({ layers, SURFACE_Y, UNDER_Y, THREE }),
    get viewSize() { return { w: viewW, h: viewH }; },
  };
}
