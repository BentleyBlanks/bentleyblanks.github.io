// 加载画面那件道具的 worker 宿主。
//
// 为什么要有它：加载画面上那件能转的道具是主线程的 rAF 在画，而加载本身
// 也在主线程上。实测（quality=low）建首关那 9.3 秒里主线程只交出去 26 帧 ——
// 单块最长的一段（城外村落轮廓 + 树）一口气占住 3.08 秒，模型就那么钉在那儿。
// 「分帧生成」只保证进度条会动，不保证帧率：一次 yield 之间的那一块活儿是
// 不可分的，切得再细也是一块一块地卡。
//
// 所以把展示台整个搬进 worker：画布用 transferControlToOffscreen 过继过来，
// 转动与渲染跑在 worker 自己的时间线上，主线程爱堵多久堵多久，它照转。
// 主线程只剩三件事：收 pointer 事件、量画布尺寸、把名字与注记写进卡片。
//
// 消息协议（两边都短，别加字段加成一套框架）：
//   主 → worker  { type: "init", canvas, width, height, pixelRatio }
//                { type: "show", exceptId }      换一件并起循环
//                { type: "hide" }                停循环（画布留着）
//                { type: "resize", width, height }
//                { type: "drag", dx, dy } / { type: "dragStart" } / { type: "dragEnd" }
//                { type: "dispose" }
//   worker → 主  { type: "ready" }               renderer 建起来了（宿主据此不再退路）
//                { type: "prop", id, name, note }卡片上写什么
//
// **这个文件里没有 import map。** 它 import 的那几个模块一律走相对路径，
// 且那条链上不许出现裸名 "three"（见 Script_BootPropStage 的文件头）。
// 页面那一侧仍然只有一份带戳的 three（拿 import("three") 与相对路径对比过是同一个
// 模块实例）；worker 是另一个 realm，本来就要自己再拿一份，这不是重复加载。
// Stage 是展示台最常改的那层，必须把 worker 自己的 query 继续传给它：只靠
// ETag/max-age 会让刚发布的修复在旧 worker 缓存里继续跑。Stage 再往下的稳定依赖
// （MeshLoad / Noise / Data_Meshes / three）仍走原相对 URL。

const here = new URL(import.meta.url);
const { PropStage, PickShowcase } = await import(
  new URL(`./Script_BootPropStage.mjs${here.search}`, here)
);

let stage = null;
let running = false;
let last = 0;

/**
 * worker 里没有 requestAnimationFrame（DedicatedWorkerGlobalScope 上没有这个 API），
 * 用 setTimeout 排 60 Hz。掉帧无所谓 —— 这是个转圈的静物，不是玩法。
 */
function Loop() {
  if (!running || !stage) return;
  const now = performance.now();
  stage.Tick((now - last) / 1000);
  last = now;
  setTimeout(Loop, 16);
}

function Start() {
  if (running || !stage) return;
  running = true;
  last = performance.now();
  Loop();
}

self.onmessage = async (event) => {
  const msg = event.data || {};
  switch (msg.type) {
    case "init": {
      stage = new PropStage(msg.canvas, { pixelRatio: msg.pixelRatio });
      stage.Resize(msg.width, msg.height);
      self.postMessage({ type: "ready" });
      break;
    }
    case "show": {
      if (!stage) break;
      Start();
      // 先起循环再下模型：下的过程中先转空场，也比黑一块强。
      const card = await stage.Load(PickShowcase(msg.exceptId ?? stage.currentId));
      if (card) self.postMessage({ type: "prop", ...card });
      break;
    }
    case "hide": running = false; break;
    case "resize": stage?.Resize(msg.width, msg.height); break;
    case "dragStart": stage?.DragStart(); break;
    case "drag": stage?.Drag(msg.dx, msg.dy); break;
    case "dragEnd": stage?.DragEnd(); break;
    case "dispose": {
      running = false;
      stage?.Dispose();
      stage = null;
      self.close();
      break;
    }
    default: break;
  }
};
