// 《地道里的光》—— 世界画笔与绘制序工具（2026-08-15 从 Script_World.js 的
// CreateWorld 闭包里抽出来的**无状态**那一层）：
//   · 绘制序小工具：LAYER_ORDER / DepthOrder / FixOrder / SetLayerOrder / SetPlayOrder
//     （规矩见 docs/Depth.md「Z 轴深度规范」——带号是绘制顺序，不是位置）
//   · 烘焙工具：MakeCanvas / CanvasTexture / BakeSprite / PlaceSprite(Flip) / ScaleKeepGround
//   · 地形带/背景/影子画笔：AddStrip / AddBandEdge / AddGroundBand / AddGroundPlane /
//     AddRidgeBand / AddParallaxTrees / MakeFlatShadow / MakeCastShadow / AddGroundShadow / AddCover
// 这里的函数只吃参数与模块 import，不碰 CreateWorld 的实例状态——所以能单独
// import、能进无头测试。要动"跟着 state 走"的绘制（AddProp/AddUnderground/
// UpdateOne 一族），去 Script_World.js。可变的雾色（hazeColor）从此走参数
// （AddRidgeBand 的 hazeTint），别再让画笔偷读闭包。
import * as THREE from "three";
import { CoverBandOf, PPM, SpriteOf } from "./Data_Scenes.mjs";
import { BAND, CheckBandZ, PlaceZ } from "./Data_DepthSpec.mjs";
import * as ART from "./Script_Art.mjs";
import { SURFACE_Y } from "./Script_Core.mjs";

// ---------------------------------------------------------------------------
// 贴图烘焙
// ---------------------------------------------------------------------------
export function MakeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export function CanvasTexture(canvas) {
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
export function BakeSprite(wPx, hPx, anchorX, groundYPx, drawFn, blur = 0, ss = 1, haze = null) {
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

export function PlaceSprite(mesh, x, y, z) {
  mesh.position.set(x + mesh.userData.offset.x, y + mesh.userData.offset.y, z);
  mesh.userData.anchor = { x, y, z };
}

// 会掉头的贴图（独轮车这类有正反的家伙）：dir<0 时整张左右翻。
// 镜像是绕**网格中心**发生的，所以锚点相对中心的偏移也得跟着翻号，
// 否则车把一翻面、车身就整体平移出去半米。
export function PlaceSpriteFlip(mesh, x, y, z, dir) {
  const s = dir < 0 ? -1 : 1;
  mesh.scale.x = s;
  mesh.position.set(x + mesh.userData.offset.x * s, y + mesh.userData.offset.y, z);
  mesh.userData.anchor = { x, y, z };
}

// 缩放时保持地面锚点不动（否则远景会整体浮起来）
export function ScaleKeepGround(mesh, sx, sy = sx) {
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
//    0.0          行走线：地面、地道剖面、固定在地上的道具
//   +0.3          落地/待拾的活动道具（放下的桶、链上的待拾物）：压在行走
//                 线道具之前、演员之后——玩家放下的东西必须永远看得见
//   +0.6          演员：玩家与所有 NPC —— 永远在行走线物件之前
//   +0.8          演员携带物（木料/水桶），跟着演员走
//   +1.2 ~ +2.4   有意遮挡演员的近处物件；硬性约束：只允许 ≤1.2m 的矮物件
//                 进这一段，高过腰的东西（草垛/断墙/树丛）一律退到负值，
//                 否则会把人整个吞掉。
//   ≥ +3.4        fore 层：真前景，成片掠过镜头
//
// **带号是绘制顺序，不是位置。** 平视镜头下每一档 z 都有自己的地平线，
// 所以行走线上的一切（演员/影子/携带物/放下的东西/推的车/钉在地上的道具）
// 摆位时一律经 `PlaceZ()` 压回 z=0，只有真的站在别的纵深上的东西
//（负号的背景带、正号的前景掩体）才保留自己的 z。见 Data_DepthSpec 的
// 「地平线规范」——那里有各档地平线差多少像素的实测表。
// ===========================================================================
// 深度带的数值来自 Data_DepthSpec.mjs，物体用哪个带来自 Data_PropArt.json；
// 这里只保留层间的绘制序表。
export const LAYER_ORDER = {
  sky: 0, ridge: 1000, hills: 2000, farTown: 3000, midTrees: 4000,
  // cine（过场框景）排在**压暗罩之前**（ORDER_DARK 8500）：夜里/窖里那层罩子
  // 得压得着它。排在罩子后头的话，一进地窖它就是整幅画里最亮的东西——
  // 一根发光的梯子帮杵在两个孩子前面（2026-08-14 实拍抓的）
  nearTrees: 5000, play: 6000, fx: 7000, fore: 8000, cine: 8450, ots: 9000,
};

export const ORDER_DARK = 8500, ORDER_GLOW = 8600, ORDER_INSERT = 9500;

// 层内深度 → 绘制序号。z 越大（越近）画得越晚，压在上面。
export const DepthOrder = (layerKey, z) =>
  (LAYER_ORDER[layerKey] ?? 6000) + Math.round((Math.max(-12, Math.min(12, z)) + 12) * 20);

// 给一个动态对象（演员骨架、携带物、掉落物）派发 play 层的绘制序号。
// 骨架内部各骨头共用同一序号，彼此的前后仍由各自的局部 z 决定。
// 钉死一个元素的绘制序号：既写进 userData（ApplyDepthOrder 重跑时不会被
// 覆盖），也立刻生效——懒创建的元素（流体、标记）等不到下一趟派发。
export function FixOrder(obj, order) {
  obj.userData.fixedOrder = order;
  obj.renderOrder = order;
  return obj;
}

// 背景层里也有演员（远处那条街上干活的乡亲）：同一套深度带，只是层基数不同
export function SetLayerOrder(obj, layerKey, z, tag = layerKey) {
  CheckBandZ(tag, z);
  const order = DepthOrder(layerKey, z);
  obj.traverse((o) => { if (o.isMesh) { o.renderOrder = order; o.userData.fixedOrder = order; } });
}

// nudge 是**同一深度带内**的整数错位：两个人站在一处时谁画在前面必须钉死，
// 否则两具骨架的贴图按摄像机距离互相穿插（各骨头有各自的局部 z），镜头一动
// 前后就翻——读出来是"两个人在打架"。**不许改 z 去错位**：CheckBandZ 只认
// 规范表上那几档，挪 z 会当场记一条深度违规（那张单子必须为空）。
export function SetPlayOrder(obj, z, tag = "SetPlayOrder", nudge = 0) {
  CheckBandZ(tag, z);
  const order = DepthOrder("play", z) + nudge;
  // 同时写进 userData：BuildEnvironment 重建后 ApplyDepthOrder 重跑派发时，
  // 不至于改按 position.z 重新猜（动态物的 position.z 与深度带曾经不一致，
  // 「桶忽前忽后」就是这么来的）。对骨架尤其致命：骨头各自的**局部** z 全是
  // 0，重派一次整个人就被打回行走线那一档，沉到房子立面后头去，而手上提的
  // 桶是层的直接子物、局部 z 就是 CARRY_Z，照旧浮在墙外。
  obj.traverse((o) => { if (o.isMesh) { o.renderOrder = order; o.userData.fixedOrder = order; } });
}

// -------------------------------------------------------------------------
// 场景搭建
// -------------------------------------------------------------------------
export function AddStrip(group, xFrom, xTo, topY, botY, colors, id) {
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
// 反过来也成立：**没打算站在别的纵深上的东西，就不许用别的 z**。行走线上
// 的道具与演员之间那 0.6m 曾经是没人声明过的——结果人的脚比车轮低十来个
// 像素，读出来就是"车和人不在一条水平线上"。现在摆位统一走 PlaceZ()。
//
// 摆道具时从 Data_DepthSpec.mjs 的 BAND 表里挑 z，不要另取数值
//（表已含 backdrop/building/yard/nearBack/walk/loose/facade/clutter 八档）。
// 在某条纵深带的地面上画一道沿线：真正躺平在 y=地平线、深度 z 处，
// 于是它的投影就精确落在那条带的地平线上。
export function AddBandEdge(group, xFrom, xTo, z, light, id) {
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

// ---------------------------------------------------------------------------
// 村道（2026-08-17 重做。用户原话：「明明很多东西应该是放在路上的，结果你放在
// 了路的上沿」）
//
// 老版的路是**两张都指望不上的贴图**拼出来的：
//   · `AddGroundBand` 是一张竖着的幕布，细节全画在贴图第 6~40 行那一指宽里。
//     可它整条其实被 `AddGroundPlane` 的深度写入挡掉了（地面平面躺在它前面），
//     屏幕上只露出地平线底下那七八个像素——所有心思都画在了看不见的地方；
//   · 真正看得见的那片路是 `AddGroundPlane`，而它一张 1400×900 的贴图要摊
//     410 米宽、74.5 米深 —— **横着只有 3.4 像素/米**。一道 8px 宽的车辙在世界
//     里是 2.4 米宽的一条色带，读出来就是"横过整幅画的两道条纹"。
//
// 所以路面另起一块几何：**只管街面这 7 米纵深**，贴图沿路方向按 64 米一循环
// 平铺，密度回到 96 像素/米（跟道具同一把尺）。关键的一条：
//
//   **纵向 UV 按屏幕均分，不按世界均分**。地面在画面上是随纵深收缩的：
//   深度 z 处离视平线 camY/(camD−z)。让贴图每一行对应等量的**屏幕**行，
//   于是贴图上画一条软边，上屏就是一条按透视压扁的带子——远的自己窄、
//   近的自己宽，一个折算都不用手写。
//
// 色号一律比直觉深两档：CanvasTexture 没声明 sRGB，上屏被整体提亮（全作老账）。
//
// **这块几何上只许有调子，不许有碎点**（2026-08-17 用户看序章过场退回：「地面的
// 纹理太丑了 太喧宾夺主了 会抢掉视觉重点」）。上一版按"材质靠形不靠颜色"往路上
// 撒了蹄印、土坷垃、料礓石子、旱裂的泥皮、糠秕、粪蛋、草茬——每一样单看都对，
// 合到一起是一条**明暗对比比人还强**的花带子。两笔账一起记下：
//
//   ① **过场机位比玩法近一倍**：2.8m 半宽下一枚四厘米的石子上屏十几个像素，
//      而这些点铺满画面下三分之一——眼睛先看见地，后看见人。地面是背景，
//      **背景的活是让人立得住，不是自己好看**。
//   ② **这块几何横贯全场、屋里屋外一视同仁**（x0=−60..length+60），所以那些
//      车辙、蹄印、粪蛋是**画在自家屋里的夯土地面上**的——序章整场戏都在屋里，
//      用户看到的正是这个。画得对不够，还得问它铺到了哪儿。
//
// 现在这张贴图只剩三样**大面积软渐变**：路面底色、两道路肩、两条碾道。要交代
// "这是条常年碾压的村道"，一档比田沉的调子就够了。**别再往这儿加离散的记号**
// （点、线、圈、草）——真要在路上摆东西，摆成道具（`Data_Scenes.json` 里挂
// `band`），那是一件一件摆得住、也删得掉的东西。
// ---------------------------------------------------------------------------
export const ROAD_VIEW = {
  camY: 1.85, camD: 9.3,   // 默认玩法机位（PLAY_HW 4.45）——这是把尺子，不是真相机
  farZ: -4.3,              // 街的那一边：房子跟前
  nearZ: 3.4,              // 街的这一边：16:9 画框底下还富余一截
  tileM: 64,               // 沿路每 64 米一循环
  ss: 2,                   // 贴图密度 96px/米
  hPx: 512,                // 纵向行数（屏幕上这一片约 260px 高，两倍采样）
};
const OffOf = (z) => ROAD_VIEW.camY / (ROAD_VIEW.camD - z);
const OFF_FAR = OffOf(ROAD_VIEW.farZ), OFF_NEAR = OffOf(ROAD_VIEW.nearZ);
// 贴图第几行 ↔ 那一行落在哪个纵深（行 0 = 远端）
const RoadRow = (z) => ROAD_VIEW.hPx * (OffOf(z) - OFF_FAR) / (OFF_NEAR - OFF_FAR);
// 横向 96px/米（ROAD_PX_M）与"纵深一米占多少行"（RoadRowsPerM）这两把尺子随撒点
// 一起删了——只画软渐变的话，用得着的只有 RoadRow。要往回加细节先把它们找回来

// 只剩三档色：路面底色、路肩、碾道。**碎点那一族色号已整批删掉**——留着就会有人
// 顺手再撒回去（尤其是 grit/chaff/clodLit 那几个高亮的，它们正是抢眼的正主）
const ROAD_PAL = {
  // 路要比地里的生土**沉一档**：常年碾压的土板结、发暗、带一层灰。老版路面跟
  // 田同色，于是"街"这件东西在画面上根本不存在——两边一样亮，只剩一条空地
  day: {
    face: ["#93794a", "#77602f"],
    track: "rgba(50,36,18,0.26)", shoulder: "rgba(66,56,28,0.30)",
  },
  dawn: {
    face: ["#7d6d52", "#63543c"],
    track: "rgba(42,33,21,0.24)", shoulder: "rgba(58,50,32,0.26)",
  },
  night: {
    face: ["#333b49", "#222833"],
    track: "rgba(12,15,22,0.28)", shoulder: "rgba(13,17,24,0.30)",
  },
  tunnel: {
    face: ["#2e251b", "#201a12"],
    track: "rgba(15,12,8,0.26)", shoulder: "rgba(16,13,9,0.26)",
  },
};
ROAD_PAL.dusk = ROAD_PAL.dawn;
ROAD_PAL.dark = ROAD_PAL.tunnel;

/**
 * 一节村道的贴图（沿路方向可平铺）。W×H 像素 = tileM 米 × farZ..nearZ 那一片。
 * **通篇只有三道软渐变**，一个离散的记号都没有——为什么，见本节开头那段账。
 */
function PaintRoadTile(ctx, W, H, light) {
  const P = ROAD_PAL[light] || ROAD_PAL.day;
  const { farZ, nearZ } = ROAD_VIEW;

  // ① 底：路面比田里的生土沉一档（常年碾压），远端再压一点当空气透视
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, P.face[0]);
  g.addColorStop(1, P.face[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // ② 两道路肩：街跟院子/墙根交界的那一条，土色发灰、车碾不着
  for (const [z0, z1, dir] of [[farZ, farZ + 1.15, 1], [nearZ - 1.0, nearZ, -1]]) {
    const y0 = RoadRow(z0), y1 = RoadRow(z1);
    const sg = ctx.createLinearGradient(0, dir > 0 ? y0 : y1, 0, dir > 0 ? y1 : y0);
    sg.addColorStop(0, P.shoulder);
    sg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = sg;
    ctx.fillRect(0, Math.min(y0, y1), W, Math.abs(y1 - y0));
  }

  // ③ 碾道：车轮常年压的那两条比路心沉一档。**两条软渐变，没有边**——一给它
  // 硬边（老版那三道 lip/rut/rim 描线）就成了横贯全画的两道条纹，近景尤其扎眼
  for (const [z0, z1] of [[-1.95, -0.05], [0.34, 2.25]]) {
    const y0 = RoadRow(z0), y1 = RoadRow(z1);
    const tg = ctx.createLinearGradient(0, y0, 0, y1);
    tg.addColorStop(0, "rgba(0,0,0,0)");
    tg.addColorStop(0.42, P.track);
    tg.addColorStop(0.62, P.track);
    tg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = tg;
    ctx.fillRect(0, y0, W, y1 - y0);
  }
}

/**
 * 街面：一块**真的躺着的几何**，只管 farZ..nearZ 这七米纵深，贴图沿路平铺。
 * 它压在 AddGroundPlane（那张管到 72 米外的大地面）之上、一切立牌之下；
 * 两头用 alpha 化开，不留横贯全画的硬边。
 */
export function AddRoadPlane(group, length, light) {
  const { farZ, nearZ, tileM, ss, hPx } = ROAD_VIEW;
  const W = Math.round(tileM * PPM * ss);
  const canvas = MakeCanvas(W, hPx);
  const ctx = canvas.getContext("2d");
  PaintRoadTile(ctx, W, hPx, light);
  // 两头化开：远端交给田、近端交给画框外的土，中间才是路。
  // **一遍走完整张画布**——`destination-in` 是会连 fillRect 以外的像素一起吃掉的
  // （改这段时栽过一次：分两段淡入淡出，第二段把第一段的成果整个抹成透明，
  // 实拍看着像"这块几何压根没渲染"）
  const ag = ctx.createLinearGradient(0, 0, 0, hPx);
  const at = (z) => Math.max(0, Math.min(1, RoadRow(z) / hPx));
  ag.addColorStop(0, "rgba(0,0,0,0)");
  ag.addColorStop(at(ROAD_VIEW.farZ + 1.6), "rgba(0,0,0,1)");
  ag.addColorStop(at(ROAD_VIEW.nearZ - 0.25), "rgba(0,0,0,1)");
  ag.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalCompositeOperation = "destination-in";
  ctx.fillStyle = ag;
  ctx.fillRect(0, 0, W, hPx);
  ctx.globalCompositeOperation = "source-over";

  const tex = CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  // 这一片是**斜着看**的：纵深方向一个屏幕像素要吃掉近两行贴图，横着却还富余。
  // 各向异性给到 4（CanvasTexture 的默认）就只能靠降 mip 去补，几道渐变的过渡带
  // 会跟着一起糊出台阶
  tex.anisotropy = 16;
  // **横贯全场，屋里屋外一视同仁**——所以这张贴图上不许有"只属于街"的东西
  // （车辙的描线、蹄印、粪蛋）：那些会一并画到自家屋里的夯土地面上
  const x0 = -60, x1 = length + 60;
  const N = 24;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i += 1) {
    // 顶点也按屏幕均分排（跟 UV 同一条尺）：路面越近，纵深方向的顶点越疏，
    // 于是插值出来的贴图行在屏幕上是等距的
    const off = OFF_FAR + (i / N) * (OFF_NEAR - OFF_FAR);
    const z = ROAD_VIEW.camD - ROAD_VIEW.camY / off;
    const v = 1 - i / N;
    pos.push(x0, 0, z, x1, 0, z);
    uv.push(x0 / tileM, v, x1 / tileM, v);
  }
  for (let i = 0; i < N; i += 1) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false,
  }));
  mesh.position.set(0, SURFACE_Y - 0.012, 0);
  FixOrder(mesh, LAYER_ORDER.play - 38);   // 压在大地面之上、路沿与所有立牌之下
  group.add(mesh);
  return mesh;
}
export function AddGroundBand(group, xFrom, xTo, groundY, light, id, depthM = 3.2) {
  const wPx = Math.ceil((xTo - xFrom) * PPM);
  // 地平线以上留的头顶（像素）。老版只留 6px（0.125m），而路肩那撮草的梢画到
  // 1.5−5＝−3.5 行去了——**画出画布＝顶上被裁**：每一撮草都在同一高度被平着切成
  // 一条直边，默认景别 22px 就看得出，特写里是一排"砍了一半的草"（2026-08-18
  // 用户报的）。草最高探到 RISE−9.5 行，留 14 行富余
  const RISE = 14;
  const hPx = Math.round(depthM * PPM) + RISE - 6;
  const colors = light === "day" ? ART.PAL.earthDay
    : light === "dawn" || light === "dusk" ? ART.PAL.earthDawn
      : light === "night" ? ART.PAL.earthNight : ["#5a4a34", "#3d3123"];
  const grassColor = light === "night" ? ART.PAL.grassNight : ART.PAL.grass;
  const mesh = BakeSprite(wPx, hPx, 0, RISE, (ctx) => {
    const grad = ctx.createLinearGradient(0, RISE, 0, hPx);
    grad.addColorStop(0, colors[0]);
    grad.addColorStop(1, colors[1]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, RISE, wPx, hPx - RISE);
    // 地表线（手绘起伏）
    ctx.beginPath();
    ctx.moveTo(0, RISE);
    for (let px = 0; px <= wPx; px += 40) {
      ctx.lineTo(px, RISE + (ART.Hash(id + px) - 0.5) * 4);
    }
    ctx.strokeStyle = ART.IN.ink;
    ctx.lineWidth = 2.6;
    ctx.stroke();
    ART.Speckle(ctx, 0, RISE + 2, wPx, hPx - RISE - 4, id + "sp", { count: Math.round(wPx / 26), alpha: 0.12, size: 2 });
    // **这条带子上画路面是白费**（2026-08-17 实拍量的）：它整条被 AddGroundPlane
    // 的深度写入挡在后头，地平线底下只露出七八个像素。老版把车辙/石子/糠秕/粪蛋
    // 全画在这儿的第 6~40 行，屏幕上就只剩"路的上沿一道条纹"——路面归 AddRoadPlane
    // 那块真躺着的几何管，这儿只管断口这一线。
    // 路肩上剩的那点青：贴着断口一线，草是从路边长起来的，不长在车辙里。
    // **叶梢的高度以 RISE 为准往上算**（画布上头留够了才画得下整片叶子）
    ctx.strokeStyle = grassColor;
    for (let i = 0; i < wPx / 46; i += 1) {
      const gx = ART.Hash(id + "g" + i) * wPx;
      for (let b = 0; b < 3; b += 1) {
        ctx.lineWidth = 1.1 + ART.Hash(id + "gw" + i + b) * 0.9;
        ctx.beginPath();
        ctx.moveTo(gx + b * 2.5, RISE + 0.5);
        ctx.quadraticCurveTo(gx + b * 2.5 + (ART.Hash(id + i + b) - 0.5) * 4, RISE - 3,
          gx + b * 2.5 + (ART.Hash(id + i + b) - 0.5) * 9, RISE - 4.5 - ART.Hash(id + "h" + i + b) * 5);
        ctx.stroke();
      }
    }
  });
  PlaceSprite(mesh, xFrom, groundY, 0);
  // 地表带钉在行走线**之下**：不钉的话它跟 walk 带道具同一个绘制序号，
  // 房子的接地投影（AddGroundShadow）会被这张大贴图整个盖掉——
  // 全画面一个暗部都没有，"干净得像小康村"有一半是这么来的
  FixOrder(mesh, DepthOrder("play", BAND.walk) - 4);
  group.add(mesh);
}

// 大地面躺得比地表线低这么一点点（米）。**这是全场唯一一块不透明、还写深度的
// 几何**，所以它是一把刀：凡是竖着的贴图，低于这条线的那一截会被它齐刷刷切掉，
// 而且切口是一条**笔直的横线**（平面躺着，边在屏幕上就是水平的）。
// 谁要在地平线附近画东西，先问自己"这一笔在这条线的上头还是下头"——
// 剖面断口那撮草就是这么被砍成两半的（见 Script_World.js 的 TURF 那一段）。
export const GROUND_PLANE_DIP = 0.02;

// 真正的水平地面：其余元素都是竖直广告牌，只有这块是躺平的几何。
// 相机在 y≈2.7 平视，于是它自然向地平线收敛 —— 垄沟与车辙的收敛线
// 就是 2.5D 纵深最强的读法，是此前一直缺的那一块。
export function AddGroundPlane(group, length, light, id) {
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
  // 庄稼：村子外头那一大片是**地**，不是空场。1943 年春的冀中，去年秋播的
  // 冬麦已经返青——远处该是一块块青的。只铺在纵深的远半段（贴图上半部），
  // 近处那一条留给村道与院子，不然人就走在麦田里了
  const crop = {
    day: ["#8d9a58", "#a8bf6a"], dawn: ["#7b8560", "#8f9c6b"],
    night: ["#39434a", "#414d52"], tunnel: ["#35362a", "#3c3d2f"], dark: ["#23241c", "#282920"],
  }[light] || ["#8d9a58", "#a8bf6a"];
  ctx.save();
  for (let row = 0; row < 5; row += 1) {
    // 行高按透视收：越远越扁
    const v0 = (row / 5) ** 1.5, v1 = ((row + 1) / 5) ** 1.5;
    const y0 = v0 * hPx * 0.62, y1 = v1 * hPx * 0.62;
    let x = -ART.Hash(id + "fo" + row) * 200;
    let i = 0;
    while (x < wPx) {
      const bw = 90 + ART.Hash(id + "fw" + row + i) * 190;
      if (ART.Hash(id + "fc" + row + i) > 0.4) {
        ctx.globalAlpha = 0.34 + row * 0.07;      // 越近越实
        ctx.fillStyle = ART.Hash(id + "fk" + row + i) > 0.5 ? crop[0] : crop[1];
        ctx.fillRect(x, y0, bw, y1 - y0 + 1);
      }
      // 田埂：地块之间踩出来的土脊
      ctx.globalAlpha = 0.24;
      ctx.fillStyle = "#5b4a32";
      ctx.fillRect(x, y0, 2.4, y1 - y0);
      x += bw;
      i += 1;
    }
  }
  ctx.restore();
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

  // 街跟前那一带（贴图最下面那一条）。**只是给 AddRoadPlane 打的底**：真正看得见
  // 的路面归那块几何，这儿只管把土色压到街的那一档，让两者接得上。
  // 老版这一条铺到贴图下缘 22%，换算过来是 z=−13.9m —— 一条"路"的色调横铺了
  // 十四米深，中景全被它染成路，村子看着像修在停机坪上。现在收到 z=−5.4
  //（房子跟前），再往里就是院子与田。
  ctx.save();
  const ROAD_FAR_Z = -5.4;
  const roadTop = hPx * (1 - (nearZ - ROAD_FAR_Z) / depth);
  // ① 路面比田里的土再压一档：常年碾压，颜色比生土深
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = "#6b573a";
  ctx.fillRect(0, roadTop, wPx, hPx - roadTop);
  // ② 两道车辙：顺路方向的长条，走一段浅一段（车轮跳过去了）
  ctx.globalAlpha = 1;
  for (const [vy, alpha, lw] of [[0.30, 0.26, 9], [0.62, 0.20, 8]]) {
    const ry = roadTop + (hPx - roadTop) * vy;
    ctx.strokeStyle = `rgba(64,49,30,${alpha})`;
    ctx.lineWidth = lw;
    ctx.lineCap = "round";
    let drawing = false;
    ctx.beginPath();
    for (let px = 0; px <= wPx; px += 14) {
      const on = ART.Hash(id + "rut" + vy + Math.floor(px / 120)) > 0.18;
      const yy = ry + (ART.Hash(id + "rw" + vy + px) - 0.5) * 7;
      if (on && !drawing) { ctx.moveTo(px, yy); drawing = true; }
      else if (on) ctx.lineTo(px, yy);
      else drawing = false;
    }
    ctx.stroke();
  }
  // ③ 旱裂的泥皮
  ctx.strokeStyle = "rgba(74,57,35,0.24)";
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 130; i += 1) {
    const cx = ART.Hash(id + "ck" + i) * wPx;
    const cy = roadTop + ART.Hash(id + "cy" + i) * (hPx - roadTop);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    for (let k = 1; k <= 3; k += 1) {
      ctx.lineTo(cx + (ART.Hash(id + "cx" + i + k) - 0.5) * 34,
        cy + (ART.Hash(id + "cz" + i + k) - 0.5) * 16);
    }
    ctx.stroke();
  }
  // ④ 踩塌的浅坑
  for (let i = 0; i < 26; i += 1) {
    const hx = ART.Hash(id + "ho" + i) * wPx;
    const hy = roadTop + ART.Hash(id + "hy" + i) * (hPx - roadTop);
    const hr = 14 + ART.Hash(id + "hr" + i) * 26;
    ctx.fillStyle = "rgba(60,45,27,0.16)";
    ctx.beginPath();
    ctx.ellipse(hx, hy, hr, hr * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // ⑤ 碾碎的料礓石子
  for (let i = 0; i < 420; i += 1) {
    const sx = ART.Hash(id + "gv" + i) * wPx;
    const sy = roadTop + ART.Hash(id + "gy" + i) * (hPx - roadTop);
    ctx.fillStyle = ART.Hash(id + "gc" + i) > 0.5
      ? "rgba(168,152,120,0.30)" : "rgba(92,74,50,0.26)";
    ctx.fillRect(sx, sy, 2 + ART.Hash(id + "gs" + i) * 3, 1.8);
  }
  ctx.restore();

  const tex = CanvasTexture(canvas);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(wWorld, depth),
    new THREE.MeshBasicMaterial({ map: tex, transparent: false, depthWrite: true }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(length / 2, SURFACE_Y - GROUND_PLANE_DIP, (nearZ + farZ) / 2);
  FixOrder(mesh, LAYER_ORDER.play - 40);   // 地面躺在整个玩法层之下
  group.add(mesh);
  return mesh;
}

// 地平线那两条远带。**这是冀中平原，不是山区**——地道战打的就是无险可守的
// 大平原（正因为一马平川，才只能往地下挖）。所以起伏一律压到几个像素：
// 剩下的纵深不靠山脊，靠一层层雾、地里的树行、和远处村落的剪影。
// 原来 amp 给到 40/26，画出来是两道山梁——地理错了，故事也就跟着不成立。
// hazeTint：雾色。它在 World 里是随昼夜重烘变的（let hazeColor），所以走参数
// 递进来，画笔不偷读闭包——漏传就是默认的日间雾色，夜里会发灰，别漏。
export function AddRidgeBand(group, length, color, id, { amp = 5, base = 34, blur = 2.2, lift = 0.6, haze = 0.4, rows = 0, hazeTint = "#e2d8bc" } = {}) {
  const worldW = length * 0.5 + 90;
  const wPx = Math.ceil(worldW * PPM * 0.34);
  const hPx = 180;
  const mesh = BakeSprite(wPx, hPx, 0, hPx, (ctx) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, hPx);
    for (let px = 0; px <= wPx; px += 22) {
      // 平原的地平线不是一把尺子：留一点极缓的起伏（田块与土路的高差）
      const y = hPx - base - Math.sin(px * 0.006 + ART.Hash(id) * 6) * amp - Math.sin(px * 0.017) * (amp * 0.5);
      ctx.lineTo(px, y);
    }
    ctx.lineTo(wPx, hPx);
    ctx.closePath();
    ctx.fill();
    // 平原的纵深全靠地平线上那一排小东西：防风林的树行、几户人家的屋脊。
    // 跟带子同色同一张贴图里画完，不额外增加网格
    // 比带子本身深一档：同色画上去等于没画（用户："背景里有一些山看不清"）
    ctx.fillStyle = Darken(color, 0.82);
    for (let i = 0; i < rows; i += 1) {
      const px = (i + 0.5) * (wPx / rows) + ART.Hash(id + "r" + i) * 60 - 30;
      const top = hPx - base - 2;
      if (ART.Hash(id + "k" + i) > 0.45) {
        // 树行：几团挨着的圆冠，一带就是一道防风林
        const n = 3 + Math.floor(ART.Hash(id + "n" + i) * 4);
        for (let t = 0; t < n; t += 1) {
          const tx = px + t * 9 - n * 4.5;
          const r = 4.5 + ART.Hash(id + "t" + i + t) * 3;
          ctx.beginPath();
          ctx.ellipse(tx, top - r * 0.5, r, r * 0.9, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // 远处的一户：矮墙 + 一道屋脊
        const w2 = 14 + ART.Hash(id + "w" + i) * 12;
        ctx.fillRect(px - w2 / 2, top - 7, w2, 8);
        ctx.beginPath();
        ctx.moveTo(px - w2 / 2 - 3, top - 7);
        ctx.lineTo(px, top - 13);
        ctx.lineTo(px + w2 / 2 + 3, top - 7);
        ctx.closePath();
        ctx.fill();
      }
    }
    // 平原的地平线本来就淡，再叠一层半透明就整个化进天里读不出来了——
    // 这两条带子也一律实心，退感只由染色量给（用户："背景里有一些山看不清"）
  }, blur, 1, { color: hazeTint, amount: haze });
  PlaceSprite(mesh, -30, SURFACE_Y + lift, 0);
  ScaleKeepGround(mesh, 2.9, 1);
  group.add(mesh);
}

// 地平线上的炮楼。1942-43 年的冀中，日军「囚笼政策」把平原用公路、封锁沟和
// **每隔几里一座的炮楼**割成小块——站在村里往哪边看都能看见一两座，
// 这就是"敌后"两个字的字面意思。所以它们不是布景，是这一章的处境本身。
//
// 摆在 hills/farTown 层：一律**只画剪影**（层的糊与雾色会把细节吃掉，
// 画细了是白费）。夜里楼顶点一粒灯——这游戏讲的就是灯。
// 把远景带的颜色压深一档：炮楼是这片空地上唯一的硬边，跟地平线同色就白摆了
export const Darken = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.round(v * k));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

export function AddParallaxTrees(group, xFrom, xTo, night, id, { blur = 0, scale = 0.72, opacity = 0.85, step = 19, hazeOpt = null } = {}) {
  for (let x = xFrom; x < xTo; x += step + ART.Hash(id + x) * 16) {
    const wPx = 150, hPx = 200;
    // **背景那排树也得是 1943 年春的树**（2026-08-18 用户："华北 大家都没东西吃
    // 远处的树咋可能还有叶子呢"）。前景那几棵早就画成秃榆+剥皮了，可这一层
    // 一直是满冠的绿球，一整排排在村子后头——画面上说的是"年景不错"。
    // 现在按位置定死地分三种：**六成薅过的**（低枝空、只剩高处几簇稀叶）、
    // 三成全秃（榆树连皮都刮了，那是死透的）、一成还算完整（够不着的高树/
    // 不能吃的树总还有——全秃一片就成了冬天，而这会儿是谷雨）。
    const kind = ART.Hash(id + "picked" + x);
    const bare = kind < 0.30;
    const picked = !bare && kind < 0.90;
    const mesh = BakeSprite(wPx, hPx, wPx / 2, hPx - 4, (ctx, ax, ay) => {
      ART.DrawTree(ctx, ax, ay, id + x, { big: false, night, bare, picked });
    }, blur, 1, hazeOpt);
    PlaceSprite(mesh, x, SURFACE_Y - 0.1, 0);
    if (scale !== 1) ScaleKeepGround(mesh, scale);
    group.add(mesh);
  }
}

// 落地投影：没有影子的物件永远像浮在地面线上
// 光向：太阳偏在画面左后方，影子朝右前方斜出去
export const SUN = { dx: 0.85, dz: 1.0 };

// 方向性投影：一片躺在地平面上的影子（随地面一起透视），
// 不再是贴在物件脚下的一团。有了它，东西才真的"站"在地上。
export function MakeFlatShadow(lengthM, widthM, strength) {
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

/**
 * 窖口/竖井口那个**躺在地上的黑洞**（2026-08-17 加。用户：「地道口掀开盖这个镜头
 * 太丑了 特别是梯子那里 完全认不出是梯子」）。
 *
 * 病根之一是：**地表上压根没有洞**。梯子那张贴图是竖着的立牌，从上往下看时，
 * 画在它上头的洞口只是地平线上一条被压扁的暗带——俯角越大压得越扁。所以洞得
 * 自己是一块**躺平的几何**（同「贴地光池」那条），俯角一看就是个椭圆的口子，
 * 平视时自己收成一条缝（那也是对的：平视本来就看不进地上的洞）。
 *
 * 排在地面之上、梯子之下：梯子从洞里探上来，两根梯梃压在黑上，"往下去"才成立。
 */
export function MakeShaftMouth(wM, dM, id) {
  const wPx = 256, hPx = 160;
  const canvas = MakeCanvas(wPx, hPx);
  const ctx = canvas.getContext("2d");
  // 口子本身：中间实黑，四边化开成翻上来的土。**不许有干净的边**——
  // 一圈利落的椭圆读出来是"地上摆着个黑盘子"，不是"地被掏了个洞"
  const g = ctx.createRadialGradient(wPx * 0.5, hPx * 0.5, 0, wPx * 0.5, hPx * 0.5, hPx * 0.62);
  g.addColorStop(0, "rgba(6,5,3,0.96)");
  g.addColorStop(0.52, "rgba(9,7,4,0.92)");
  g.addColorStop(0.78, "rgba(26,19,11,0.55)");
  g.addColorStop(1, "rgba(40,30,18,0)");
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i <= 40; i += 1) {
    const a = (i / 40) * Math.PI * 2;
    const r = 0.80 + ART.Hash(id + "m" + i) * 0.18;      // 边缘啃得不匀
    const px = wPx * 0.5 + Math.cos(a) * wPx * 0.5 * r;
    const py = hPx * 0.5 + Math.sin(a) * hPx * 0.5 * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, wPx, hPx);
  ctx.restore();
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(wM, dM),
    new THREE.MeshBasicMaterial({ map: CanvasTexture(canvas), transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

// 灯打出来的影子：从脚下往背光方向拖一条，近端浓、远端散开。
// 贴图的 u=0 一端是脚下，靠 scale.x 的正负决定往哪边拖。
export function MakeCastShadow(strength) {
  const wPx = 256, hPx = 128;
  const canvas = MakeCanvas(wPx, hPx);
  const ctx = canvas.getContext("2d");
  const gx = ctx.createLinearGradient(0, 0, wPx, 0);
  gx.addColorStop(0, `rgba(20,14,8,${strength})`);
  gx.addColorStop(0.42, `rgba(20,14,8,${strength * 0.55})`);
  gx.addColorStop(1, "rgba(20,14,8,0)");
  ctx.fillStyle = gx;
  ctx.fillRect(0, 0, wPx, hPx);
  // 纵向收成一条从脚下张开的椭圆，边缘不留硬口
  ctx.globalCompositeOperation = "destination-in";
  ctx.save();
  ctx.translate(0, hPx / 2);
  ctx.scale(wPx, hPx / 2);
  const gy = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  gy.addColorStop(0, "rgba(0,0,0,1)");
  gy.addColorStop(0.6, "rgba(0,0,0,0.92)");
  gy.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gy;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
  ctx.globalCompositeOperation = "source-over";
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: CanvasTexture(canvas), transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;   // 躺在地面上，长边沿世界 X
  FixOrder(mesh, LAYER_ORDER.play - 19);
  return mesh;
}

export function AddGroundShadow(group, x, halfW, strength = 0.28, z = 0) {
  const w = halfW * 2.3;
  const len = halfW * 3.0;
  const mesh = MakeFlatShadow(len, w, strength);
  // 沿光向偏出去一段，影子才是"投"出来的而不是垫在脚下
  mesh.position.set(x + SUN.dx * halfW * 0.7, SURFACE_Y + 0.015, PlaceZ(z) + SUN.dz * len * 0.34);
  FixOrder(mesh, DepthOrder("play", BAND.walk) - 2);   // 压在地表带之上、道具之下
  group.add(mesh);
}

export function AddCover(group, c, light, ruinedScene = false) {
  const night = light === "night" || light === "dark" || light === "tunnel";
  const gy = SURFACE_Y;
  // 深度按"这东西有多高"来定，不能抽签：高过腰的掩体一旦落到人前面，
  // 就会把角色连人带扛的木料整个吞掉（见 Data_DepthSpec 的 Z 轴规范）。
  // 判定规则（哪些算高、高的退到哪两个带里）写在 Data_PropArt 的 coverBands。
  const cz = CoverBandOf(c, ART.Hash("cz" + c.id));
  CheckBandZ("cover:" + c.kind, cz);
  const S = SpriteOf(c.kind, c, { cover: true });
  if (!S) return;     // ditch：由 props 里的同名物体画，掩体项只管躲藏判定
  AddGroundShadow(group, c.x, (c.w || 2) / 2 + 0.5, 0.22, cz);
  const mk = (fn) => {
    const mesh = BakeSprite(S.w, S.h, S.ax, S.ay, fn, 0, S.ss);
    PlaceSprite(mesh, c.x, gy, cz);
    mesh.userData.kind = c.kind;
    group.add(mesh);
  };
  switch (c.kind) {
    case "haystack": mk(
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
        } else ART.DrawHaystack(ctx, ax, ay, c.w * PPM, c.id, { night, raided: !!c.raided });
      }); break;
    case "firewood": mk((ctx, ax, ay) => ART.DrawFirewood(ctx, ax, ay, c.w * PPM, c.id)); break;
    case "wallSeg": mk((ctx, ax, ay) => ART.DrawWall(ctx, ax, ay, c.w * PPM, S.drawHeightPx, c.id, { burnt: false })); break;
    // 齐胸的土坯院墙：**前景挡人的那一种**（clutter 带，画在演员之前）。
    // 蹲下去整个人没在墙后头、站起来露头——「躲在墙后」就是这么一件东西
    case "yardWallLow":
      mk((ctx, ax, ay) => ART.DrawYardWallLow(ctx, ax, ay, c.w * PPM, (c.h || 1) * PPM, c.id,
        { pier: c.pier !== false, slogan: c.slogan }));
      break;
    case "bush": mk((ctx, ax, ay) => ART.DrawBush(ctx, ax, ay, c.w * PPM, c.id, { night })); break;
    case "ridge": mk((ctx, ax, ay) => ART.DrawRidge(ctx, ax, ay, c.w * PPM, c.id)); break;
    case "crops": mk((ctx, ax, ay) => ART.DrawCrops(ctx, ax, ay, c.w * PPM, c.id, { night })); break;
    default: break;
  }
}
