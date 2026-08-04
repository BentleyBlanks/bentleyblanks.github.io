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

const PPM = 48;              // 贴图像素 / 世界米
const CHAR_CELL = { w: 116, h: 124, baseline: 112 };
const CHAR_SCALE = 1.35;

// 程序化动画帧表：姿态由 DrawCharacter 按相位算出，烘成图集后按状态播放
const WALK_FRAMES = 8;
const IDLE_FRAMES = 6;
const CROUCH_WALK_FRAMES = 8;
const CROUCH_IDLE_FRAMES = 4;
const CARRY_WALK_FRAMES = 8;
const CARRY_IDLE_FRAMES = 2;
const F_WALK = 0;
const F_IDLE = F_WALK + WALK_FRAMES;                    // 8
const F_CROUCH_WALK = F_IDLE + IDLE_FRAMES;             // 14
const F_CROUCH_IDLE = F_CROUCH_WALK + CROUCH_WALK_FRAMES; // 22
const F_CARRY_WALK = F_CROUCH_IDLE + CROUCH_IDLE_FRAMES;  // 26
const F_CARRY_IDLE = F_CARRY_WALK + CARRY_WALK_FRAMES;    // 34
const CHAR_FRAMES = F_CARRY_IDLE + CARRY_IDLE_FRAMES;     // 36

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
function BakeSprite(wPx, hPx, anchorX, groundYPx, drawFn, blur = 0) {
  const canvas = MakeCanvas(wPx, hPx);
  const ctx = canvas.getContext("2d");
  if (blur > 0) ctx.filter = `blur(${blur}px)`;
  drawFn(ctx, anchorX, groundYPx);
  ctx.filter = "none";
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
const charAtlas = new Map();

function FrameSpec(f) {
  if (f < F_IDLE) {
    return { moving: true, crouch: false, carry: false, phase: (f / WALK_FRAMES) * Math.PI * 2, breath: 0 };
  }
  if (f < F_CROUCH_WALK) {
    const i = f - F_IDLE;
    return { moving: false, crouch: false, carry: false, phase: 0, breath: (i / IDLE_FRAMES) * Math.PI * 2 };
  }
  if (f < F_CROUCH_IDLE) {
    const i = f - F_CROUCH_WALK;
    return { moving: true, crouch: true, carry: false, phase: (i / CROUCH_WALK_FRAMES) * Math.PI * 2, breath: 0 };
  }
  if (f < F_CARRY_WALK) {
    const i = f - F_CROUCH_IDLE;
    return { moving: false, crouch: true, carry: false, phase: 0, breath: (i / CROUCH_IDLE_FRAMES) * Math.PI * 2 };
  }
  if (f < F_CARRY_IDLE) {
    const i = f - F_CARRY_WALK;
    return { moving: true, crouch: false, carry: true, phase: (i / CARRY_WALK_FRAMES) * Math.PI * 2, breath: 0 };
  }
  const i = f - F_CARRY_IDLE;
  return { moving: false, crouch: false, carry: true, phase: 0, breath: (i / CARRY_IDLE_FRAMES) * Math.PI * 2 };
}

function BuildCharAtlas(kind) {
  if (charAtlas.has(kind)) return charAtlas.get(kind);
  const { w, h, baseline } = CHAR_CELL;
  const canvas = MakeCanvas(w * CHAR_FRAMES, h);
  const ctx = canvas.getContext("2d");
  for (let f = 0; f < CHAR_FRAMES; f += 1) {
    ctx.save();
    ctx.translate(f * w, 0);
    const s = FrameSpec(f);
    ART.DrawCharacter(ctx, {
      x: w / 2, y: baseline, scale: CHAR_SCALE, facing: 1, kind, id: kind, ...s,
    });
    ctx.restore();
  }
  const tex = CanvasTexture(canvas);
  tex.repeat.set(1 / CHAR_FRAMES, 1);
  const entry = { canvas, tex };
  charAtlas.set(kind, entry);
  return entry;
}

function MakeCharMesh(kind) {
  const atlas = BuildCharAtlas(kind);
  const tex = atlas.tex.clone();
  tex.needsUpdate = true;
  tex.repeat.set(1 / CHAR_FRAMES, 1);
  const geo = new THREE.PlaneGeometry(CHAR_CELL.w / PPM, CHAR_CELL.h / PPM);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.yOffset = (CHAR_CELL.baseline - CHAR_CELL.h / 2) / PPM;
  return mesh;
}

// 扛着的物件（单独一张小贴图，跟着手走）
function MakeCarryMesh(label) {
  const wPx = label === "水桶" ? 46 : 120;
  const hPx = label === "水桶" ? 42 : 30;
  return BakeSprite(wPx, hPx, wPx / 2, hPx / 2, (ctx, ax, ay) => {
    ART.DrawCarry(ctx, ax, ay - (label === "水桶" ? 8 : 0), 1.5, 1, label);
  });
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
    nearTrees: -7.5, play: 0, fore: 5.5, fx: 0, ots: 12,
  };
  // 透视补偿：整层按 (D_REF - z)/D_REF 放大，于是每个元素仍落在作者标注的
  // 世界坐标与尺寸上，只是移动速率按透视自然变慢——经典视差，且随推拉变化
  const LAYER_COMP = {};
  for (const k of Object.keys(LAYER_Z)) LAYER_COMP[k] = (D_REF - LAYER_Z[k]) / D_REF;
  // 假景深：离玩法层越远，烘焙时越糊
  const LAYER_BLUR = { ridge: 3.2, hills: 2.2, farTown: 1.3, midTrees: 0.7, nearTrees: 0.25, fore: 1.6 };
  for (const k of Object.keys(layers)) {
    layers[k].position.z = LAYER_Z[k];
    layers[k].scale.setScalar(LAYER_COMP[k]);
    scene.add(layers[k]);
  }

  // 暗场遮罩（乘算）与光晕（加色）
  const darkMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0 });
  const darkPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), darkMat);
  darkPlane.position.z = 8;
  darkPlane.renderOrder = 50;
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

  function MakeGlow(radius, color = 0xffc878, opacity = 1) {
    const mat = new THREE.MeshBasicMaterial({
      map: glowTex, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, color, opacity,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), mat);
    m.renderOrder = 60;
    m.position.z = 0.4;   // 贴着玩法层，别被透视放大
    return m;
  }

  const actorSprites = new Map();
  const glows = [];
  let builtKey = "";
  let sceneLights = [];   // 静态灯位 {x,y,r,mesh}
  let smokeMesh = null, smokeCanvas = null, smokeCtx = null;
  let probeMeshes = [];
  let markerMesh = null, markerCanvas = null, markerCtx = null;
  let collapseMeshes = {};
  let itemMeshes = [];
  let carveState = false, carveRebuild = null;
  let otsMesh = null;
  let otsHiddenId = null;
  let vignetteAlpha = 0;
  let dustMotes = [];

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
    }, blur);
    PlaceSprite(mesh, -30, SURFACE_Y + lift, 0);
    ScaleKeepGround(mesh, 2.9, 1);
    mesh.material.opacity = opacity;
    group.add(mesh);
  }

  // 前景：掠过镜头的草丛与枝条，微糊，压暗——一点点就够
  function AddForeground(group, length, night, id) {
    for (let x = 6; x < length; x += 26 + ART.Hash(id + x) * 22) {
      // 只留从画框上缘垂下的枝条：前景一点点就够，压在下缘的草丛会糊成一团
      if (ART.Hash(id + "k" + x) < 0.45) continue;
      const kind = "branch";
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
      }, LAYER_BLUR.fore);
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
        new THREE.PlaneGeometry(0.13, 0.13),
        new THREE.MeshBasicMaterial({
          map: tex, transparent: true, depthWrite: false,
          blending: THREE.AdditiveBlending, opacity: night ? 0.42 : 0.16,
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
    for (let x = xFrom; x < xTo; x += 16 + ART.Hash(id + x) * 12) {
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
        if (ruined) {
          ctx.globalCompositeOperation = "destination-out";
          ctx.fillRect(ax - W * 0.1, ay - H - 30, W * 0.5, H * 0.55);
          ctx.globalCompositeOperation = "source-over";
        }
      }, LAYER_BLUR.farTown);
      PlaceSprite(mesh, x, SURFACE_Y - 0.2, 0);
      // 层的补偿只服务于"铺满画框的背景板"；离散的房子要按透视自然变小
      ScaleKeepGround(mesh, objScale);
      mesh.material.opacity = 0.62;
      group.add(mesh);
    }
  }

  function AddParallaxTrees(group, xFrom, xTo, night, id, { blur = 0, scale = 0.72, opacity = 0.85, step = 19 } = {}) {
    for (let x = xFrom; x < xTo; x += step + ART.Hash(id + x) * 16) {
      const wPx = 150, hPx = 200;
      const mesh = BakeSprite(wPx, hPx, wPx / 2, hPx - 4, (ctx, ax, ay) => {
        ART.DrawTree(ctx, ax, ay, id + x, { big: false, night });
      }, blur);
      PlaceSprite(mesh, x, SURFACE_Y - 0.1, 0);
      if (scale !== 1) ScaleKeepGround(mesh, scale);
      mesh.material.opacity = opacity;
      group.add(mesh);
    }
  }

  function AddProp(group, p, light, ruined, sceneKey) {
    const night = light === "night" || light === "tunnel" || light === "dark";
    const gy = SURFACE_Y;
    const mk = (wPx, hPx, ax, ay, fn, x = p.x, y = gy, z = 0) => {
      const mesh = BakeSprite(wPx, hPx, ax, ay, fn);
      PlaceSprite(mesh, x, y, z);
      group.add(mesh);
      return mesh;
    };
    switch (p.kind) {
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
        const mesh = BakeSprite(p.w * PPM, 260, 0, 254, (ctx) => {
          ctx.fillStyle = "#2a251e";
          ctx.fillRect(0, 150, p.w * PPM, 110);
          ART.DrawBlockhouse(ctx, p.w * PPM * 0.72, 254, p.id, { lit: false });
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

  function AddCover(group, c, light) {
    const night = light === "night" || light === "dark" || light === "tunnel";
    const gy = SURFACE_Y;
    const mk = (wPx, hPx, ax, ay, fn) => {
      const mesh = BakeSprite(wPx, hPx, ax, ay, fn);
      PlaceSprite(mesh, c.x, gy, 0);
      group.add(mesh);
    };
    switch (c.kind) {
      case "haystack": mk(c.w * PPM + 60, c.w * PPM + 90, (c.w * PPM + 60) / 2, c.w * PPM + 80,
        (ctx, ax, ay) => ART.DrawHaystack(ctx, ax, ay, c.w * PPM, c.id, { night })); break;
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
    // 土层铺满整条场景，别在半路露出"地的尽头"
    const x0 = Math.min(range[0] - 6, -20);
    const x1 = Math.max(range[1] + 6, sceneDef.length + 20);
    const wPx = Math.ceil((x1 - x0) * PPM);
    const topWorld = SURFACE_Y;
    const botWorld = UNDER_Y - 2.6;
    const hPx = Math.ceil((topWorld - botWorld) * PPM);
    const toPx = (wx) => (wx - x0) * PPM;
    const toPy = (wy) => (topWorld - wy) * PPM;

    const mesh = BakeSprite(wPx, hPx, 0, toPy(SURFACE_Y), (ctx) => {
      ART.DrawEarthStrata(ctx, 0, wPx, toPy(SURFACE_Y), hPx, sceneKey + "earth");
      const tunTop = toPy(UNDER_Y + 2.15);
      const tunBot = toPy(UNDER_Y);
      ART.DrawTunnelBore(ctx, toPx(range[0]), toPx(range[1]), tunTop, tunBot, sceneKey + "bore");
      // 洞室 / 旁洞
      for (const p of sceneDef.props) {
        if (p.kind === "chamber") {
          ART.DrawChamberVault(ctx, toPx(p.x), p.w * PPM, toPy(UNDER_Y + 3.0), tunBot, p.id);
        } else if (p.kind === "pocket") {
          ART.DrawChamberVault(ctx, toPx(p.x), 5.6 * PPM, toPy(UNDER_Y + 2.5), tunBot, p.id);
        }
      }
      // 支撑木
      for (let x = range[0] + 4; x < range[1] - 2; x += 9) {
        ART.DrawSupportBeam(ctx, toPx(x), tunTop + 4, tunBot, sceneKey + "beam" + x);
      }
      // 竖井
      for (const shaft of sceneDef.shafts) {
        if (shaft.builtFlag && !state.flags[shaft.builtFlag]) continue;
        ART.DrawShaft(ctx, toPx(shaft.x), toPy(SURFACE_Y) - 2, tunTop + 6, shaft.id);
      }
      // 通风眼 / 预警铃
      for (const p of sceneDef.props) {
        if (p.kind === "vent") ART.DrawVentPipe(ctx, toPx(p.x), toPy(SURFACE_Y), tunTop + 4, p.id);
        if (p.kind === "bell") ART.DrawBell(ctx, toPx(p.x), tunTop + 22, p.id, { ringing: false });
      }
    });
    PlaceSprite(mesh, x0, SURFACE_Y, 0);
    group.add(mesh);
  }

  function AddCollapses(group, sceneDef) {
    collapseMeshes = {};
    for (const p of sceneDef.props) {
      if (p.kind !== "collapse") continue;
      const mesh = BakeSprite(130, 110, 65, 104, (ctx, ax, ay) => ART.DrawCollapsePile(ctx, ax, ay, 1, p.id));
      PlaceSprite(mesh, p.x, UNDER_Y, 0);
      group.add(mesh);
      collapseMeshes[p.id] = mesh;
    }
  }

  // -------------------------------------------------------------------------
  function BuildEnvironment(state) {
    const ch = CHAPTERS[state.chapterIndex];
    const key = `${ch.scene}:${ch.light}:${state.flags.ruined ? 1 : 0}:${state.flags.hiddenBuilt ? 1 : 0}`;
    if (key === builtKey) return;
    builtKey = key;
    carveState = !!state.flags.carved;
    carveRebuild = null;
    for (const k of ["sky", "hills", "farTown", "nearTrees", "play", "fore"]) ClearGroup(layers[k]);
    for (const g of glows) scene.remove(g);
    glows.length = 0;
    sceneLights = [];

    const sceneDef = SCENES[ch.scene];
    const L = sceneDef.length;
    const night = ch.light === "night" || ch.light === "dark" || ch.light === "tunnel";

    // 天空
    const skyColors = {
      day: ["#cfd8dc", "#e6dcc0"], night: ["#0e1424", "#1e2740"],
      dawn: ["#8f8fa6", "#e0bc92"], tunnel: ["#141a26", "#2a2418"], dark: ["#0a0d14", "#181410"],
    }[ch.light] || ["#cfd8dc", "#e6dcc0"];
    AddStrip(layers.sky, -80, L + 80, 26, -14, skyColors, "sky");
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
      }, LAYER_BLUR[key] || 0);
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
        { blur: LAYER_BLUR.midTrees, scale: 1 / LAYER_COMP.midTrees, opacity: 0.72, step: 24 });
      AddParallaxTrees(layers.nearTrees, 4, L - 8, night, ch.scene + "ptree",
        { blur: LAYER_BLUR.nearTrees, scale: 1 / LAYER_COMP.nearTrees, opacity: 0.92 });
      AddForeground(layers.fore, L, night, ch.scene + "fg");
    }

    // 地表带：没有地道剖面的场景要一直填到画面下缘，别露出天空底色
    AddGroundBand(layers.play, -30, L + 30, SURFACE_Y, ch.light, ch.scene + "ground",
      sceneDef.walk.under ? 3.2 : 16);

    // 地下剖面
    AddUnderground(layers.play, sceneDef, state, ch.scene);
    AddCollapses(layers.play, sceneDef);

    // 地表道具与遮蔽
    for (const p of sceneDef.props) {
      if (["chamber", "pocket", "vent", "bell", "collapse"].includes(p.kind)) continue;
      AddProp(layers.play, p, ch.light, state.flags.ruined, ch.scene);
    }
    for (const c of sceneDef.covers) AddCover(layers.play, c, ch.light);

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
      g.position.set(spot.x, spot.y, 0.4);
      scene.add(g);
      glows.push(g);
      sceneLights.push(spot);
    }

    // 浮尘
    for (const d of dustMotes) layers.fx.remove(d);
    dustMotes = AddDust(ch.scene === "tunnelFort" ? 26 : 18, night);
  }

  // -------------------------------------------------------------------------
  // 角色
  // -------------------------------------------------------------------------
  function EnsureActorSprite(id, kind) {
    let s = actorSprites.get(id);
    if (!s) {
      const mesh = MakeCharMesh(kind);
      layers.play.add(mesh);
      s = { mesh, prevX: null, phase: 0, kind, carryMesh: null, glow: null };
      actorSprites.set(id, s);
    }
    return s;
  }

  function SetFrame(s, frame, facing) {
    const tex = s.mesh.material.map;
    tex.offset.x = frame / CHAR_FRAMES;
    s.mesh.scale.x = facing >= 0 ? 1 : -1;
  }

  function UpdateOne(s, x, level, heading, crouch, dt, carry = false) {
    const y = level === "under" ? UNDER_Y : SURFACE_Y;
    const moved = s.prevX === null ? 0 : Math.abs(x - s.prevX);
    s.prevX = x;
    // 步频跟着实际位移走（不是定速循环），停下就自然收在站姿
    const isMoving = moved > 0.006;
    if (isMoving) s.phase += moved * 2.3;
    s.idleT = (s.idleT || Math.random() * 6) + dt * 1.25;

    let frame;
    if (carry) {
      frame = isMoving
        ? F_CARRY_WALK + (Math.floor(s.phase) % CARRY_WALK_FRAMES)
        : F_CARRY_IDLE + (Math.floor(s.idleT) % CARRY_IDLE_FRAMES);
    } else if (crouch) {
      frame = isMoving
        ? F_CROUCH_WALK + (Math.floor(s.phase) % CROUCH_WALK_FRAMES)
        : F_CROUCH_IDLE + (Math.floor(s.idleT) % CROUCH_IDLE_FRAMES);
    } else {
      frame = isMoving
        ? F_WALK + (Math.floor(s.phase) % WALK_FRAMES)
        : F_IDLE + (Math.floor(s.idleT) % IDLE_FRAMES);
    }
    SetFrame(s, frame, heading >= 0 ? 1 : -1);
    s.mesh.position.set(x, y + s.mesh.userData.yOffset, 0.1);
    return { x, y, isMoving };
  }

  function UpdateActors(state, time, dt) {
    const seen = new Set(["player"]);
    const p = state.player;
    const ps = EnsureActorSprite("player", "player");
    UpdateOne(ps, p.x, p.level, p.heading, p.crouch, dt, !!p.carry);
    ps.mesh.visible = otsHiddenId !== "player";

    // 扛的东西
    if (p.carry && (!ps.carryMesh || ps.carryLabel !== p.carry)) {
      if (ps.carryMesh) layers.play.remove(ps.carryMesh);
      ps.carryMesh = MakeCarryMesh(p.carry);
      ps.carryLabel = p.carry;
      layers.play.add(ps.carryMesh);
    } else if (!p.carry && ps.carryMesh) {
      layers.play.remove(ps.carryMesh);
      ps.carryMesh = null;
      ps.carryLabel = null;
    }
    if (ps.carryMesh) {
      const y = (p.level === "under" ? UNDER_Y : SURFACE_Y);
      ps.carryMesh.position.set(p.x, y + (p.carry === "水桶" ? 0.85 : 1.95), 0.2);
      ps.carryMesh.scale.x = p.heading >= 0 ? 1 : -1;
    }

    // 煤油灯
    if (p.lamp) {
      if (!ps.glow) {
        ps.glow = MakeGlow(6.5, 0xffb85c, 1.25);
        scene.add(ps.glow);
      }
      ps.glow.position.set(p.x + p.heading * 0.3, (p.level === "under" ? UNDER_Y : SURFACE_Y) + 1.1, 7.6);
      ps.glow.material.opacity = 1.15 + Math.sin(time * 9.7) * 0.12 + Math.sin(time * 23) * 0.05;
    } else if (ps.glow) {
      scene.remove(ps.glow);
      ps.glow = null;
    }

    for (const a of state.actors) {
      seen.add(a.id);
      const s = EnsureActorSprite(a.id, a.kind);
      s.mesh.visible = a.visible !== false && otsHiddenId !== a.id;
      if (!s.mesh.visible) continue;
      UpdateOne(s, a.x, a.level || "surface", a.heading, false, dt);
      // 提灯
      if (a.lantern) {
        if (!s.glow) { s.glow = MakeGlow(4.2, 0xffc878, 0.95); scene.add(s.glow); }
        s.glow.position.set(a.x + (a.heading || 1) * 0.35, (a.level === "under" ? UNDER_Y : SURFACE_Y) + 1.05, 7.6);
        s.glow.visible = true;
      } else if (s.glow) {
        s.glow.visible = false;
      }
    }

    for (const [id, s] of actorSprites) {
      if (id !== "player" && !seen.has(id)) {
        layers.play.remove(s.mesh);
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

    // 烟：一张随前锋滚动的贴图
    if (state.smoke?.active && sceneDef.walk.under) {
      const range = sceneDef.walk.under;
      const east = range[1] + 3;
      const front = Math.max(range[0] - 3, state.smoke.frontX);
      const wWorld = Math.max(0.2, east - front);
      if (!smokeMesh) {
        smokeCanvas = MakeCanvas(1024, 128);
        smokeCtx = smokeCanvas.getContext("2d");
        const tex = CanvasTexture(smokeCanvas);
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.92 });
        smokeMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
        smokeMesh.renderOrder = 20;
        layers.fx.add(smokeMesh);
      }
      smokeCtx.clearRect(0, 0, 1024, 128);
      ART.DrawSmoke(smokeCtx, 0, 1024, 0, 128, time, "smoke");
      smokeMesh.material.map.needsUpdate = true;
      smokeMesh.scale.set(wWorld, 2.4, 1);
      smokeMesh.position.set(front + wWorld / 2, UNDER_Y + 1.1, 0.4);
      smokeMesh.visible = true;
    } else if (smokeMesh) {
      smokeMesh.visible = false;
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
        ART.DrawProbeRod(ctx, 20, 6, 130, "rod" + i, { jab });
        m.material.map.needsUpdate = true;
        m.position.set(state.player.x - 3.2 + i * 3.1 + Math.sin(i * 7) * 1.1,
          SURFACE_Y - (200 / 2 - 6) / PPM, 0.5);
      });
    } else {
      for (const m of probeMeshes) m.visible = false;
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
        markerMesh.renderOrder = 30;
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
    const ch = CHAPTERS[state.chapterIndex];
    const base = { day: 0, dawn: 0.06, night: 0.34, tunnel: 0.46, dark: 0.66 }[ch.light] ?? 0;
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
    const foreZ = Math.min(5.5, dist * 0.28);
    layers.fore.position.z = foreZ;
    layers.fore.scale.setScalar((D_REF - foreZ) / D_REF);
    // 浮尘在画框内循环飘
    for (const d of dustMotes) {
      const u = d.userData;
      u.seed += 0.0016;
      const wrapW = viewW * 1.1, wrapH = viewH * 1.1;
      const bx = ((u.seed * 37 + d.id) % 1);
      d.position.set(
        camX - wrapW / 2 + ((bx * wrapW + u.vx * u.seed * 260) % wrapW),
        camY - wrapH / 2 + (((u.seed * 53) % 1) * wrapH + u.vy * u.seed * 180) % wrapH,
        7.2,
      );
    }
    PlaceOverShoulder(camX, camY, viewW, viewH);
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
    SetOverShoulder, ApplyCamera, Resize, Render,
    get viewSize() { return { w: viewW, h: viewH }; },
  };
}
