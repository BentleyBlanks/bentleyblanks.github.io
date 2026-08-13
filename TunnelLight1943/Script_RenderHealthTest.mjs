// 《地道里的光》渲染健康检查：真实浏览器逐章启动，读 GL 错误码 + 页面异常 + 画面非纯色。
// 运行：node TunnelLight1943/Script_RenderHealthTest.mjs [截图输出目录]
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const shotsDir = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

const errors = [];
page.on("pageerror", (error) => errors.push(`PAGEERROR ${String(error).slice(0, 200)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  // 外部字体源（Google Fonts）拉不下来不算渲染事故：字体有系统回退，
  // 断网/代理环境里它必然失败，会把八章全刷红、真问题反而看不见。
  // 只豁免这一类资源加载失败——页面自己的 404/JS 异常照抓。
  const url = message.location()?.url || "";
  if (/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url)) return;
  errors.push(`CONSOLE ${message.text().slice(0, 200)}`);
});

let failed = 0;
for (let chapter = 1; chapter <= 8; chapter += 1) {
  errors.length = 0;
  await page.goto(`http://127.0.0.1:${port}/TunnelLight1943/?chapter=${chapter}&fast=1`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => window.TunnelLight !== undefined, { timeout: 60000 });
  // 过章节卡，推进若干帧（进入实际场景渲染）
  await page.evaluate(() => {
    window.TunnelLight.StepFrames(40, { advance: true });
    window.TunnelLight.StepFrames(200, { advance: true });
  });
  // 过场镜头也要走一遍：正反打/插入特写是另一套代码路径。
  // 关键：StepFrames 只推进逻辑，渲染发生在 rAF —— 必须让浏览器真的渲染若干帧，
  // 否则那条路径上的报错测不出来（FRAME_IDLE 未定义就是这么漏过去的）。
  await page.evaluate(() => {
    window.TunnelLight.JumpToChapter(window.TunnelLight.state.chapterIndex);
    for (let i = 0; i < 300; i += 1) {
      if (window.TunnelLight.state?.phase === "playing") break;
      window.TunnelLight.StepFrames(1, { advance: true });
    }
  });
  for (let line = 0; line < 12; line += 1) {
    await page.evaluate(() => window.TunnelLight.StepFrames(18, {}));
    await page.waitForTimeout(220);          // 让 rAF 真渲染这一构图
    await page.evaluate(() => window.TunnelLight.StepFrames(1, { advance: true }));
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(900);

  const health = await page.evaluate(() => {
    const tl = window.TunnelLight;
    const gl = tl.renderer.getContext();
    const glError = gl.getError();
    const canvas = tl.renderer.domElement;
    tl.world.Render(); // 不开 preserveDrawingBuffer，取样必须与渲染同一个任务
    const probe = document.createElement("canvas");
    probe.width = 64; probe.height = 36;
    const ctx = probe.getContext("2d");
    ctx.drawImage(canvas, 0, 0, 64, 36);
    const data = ctx.getImageData(0, 0, 64, 36).data;
    let min = 255, max = 0;
    for (let i = 0; i < data.length; i += 4) {
      const v = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    return {
      glError,
      spread: max - min,
      chapterIndex: tl.state?.chapterIndex,
      phase: tl.state?.phase,
      beat: tl.state ? (tl.state.beatIndex ?? -1) : -1,
    };
  });

  const problems = [];
  if (health.glError !== 0) problems.push(`GL 错误码 ${health.glError}`);
  if (health.chapterIndex !== chapter - 1) problems.push(`章节错位：期望 ${chapter - 1} 实际 ${health.chapterIndex}`);
  if (health.spread < 8) problems.push(`画面近乎纯色（明度差 ${health.spread}）`);
  if (errors.length) problems.push(errors.join(" | "));

  if (shotsDir) {
    await page.screenshot({ path: path.join(shotsDir, `chapter${chapter}.png`) });
  }
  if (problems.length) {
    failed += 1;
    console.error(`✗ 第${chapter}章: ${problems.join("；")}`);
  } else {
    console.log(`✓ 第${chapter}章 渲染正常（明度差 ${health.spread}，beat=${health.beat}）`);
  }
}

// ---------------------------------------------------------------------------
// 「由进度驱动的姿势」真的被进度驱动了吗
//
// 这条是补出来的。Rig 里刨料/投石都写着"姿势由进度直接驱动"，渲染层却把三个
// 进度字段用 ?? 串了起来：`p.vaultK ?? p.poseU ?? p.poseK`。而 vaultK 从建档
// 那一刻就是 0，`0 ?? x` 取的正是 0——于是玩法层算得再准，画面上永远停在起手
// 那一格。纯逻辑测试看不出这个：Core 侧的 poseK 一直是对的。
// 判据用手的世界坐标（state.handAt，渲染层从骨架上取的真挂点）：
// 同一个姿势、不同的进度，手必须真的挪地方。
await page.goto(`http://127.0.0.1:${port}/TunnelLight1943/?chapter=1&fast=1`, { waitUntil: "load", timeout: 60000 });
await page.waitForFunction(() => window.TunnelLight !== undefined, { timeout: 60000 });
await page.evaluate(() => {
  for (let i = 0; i < 400; i += 1) {
    if (window.TunnelLight.state?.phase === "playing") break;
    window.TunnelLight.StepFrames(1, { advance: true });
  }
});
const HandAt = (pose, k) => page.evaluate(({ pose, k }) => {
  const st = window.TunnelLight.state;
  for (let i = 0; i < 40; i += 1) {
    st.player.pose = pose; st.player.poseT = 9;
    st.player.poseK = k; st.player.poseU = k;
    window.TunnelLight.Tick(1, 1 / 30);
  }
  return st.handAt ? { x: +st.handAt.x.toFixed(3), y: +st.handAt.y.toFixed(3) } : null;
}, { pose, k });
for (const [pose, label] of [["throwWind", "投石蓄力"], ["planePush", "刨料推程"], ["pourBasket", "倒土"],
  ["foldCloth", "叠衣裳"], ["layDown", "把衣裳按进坑里"]]) {
  const lo = await HandAt(pose, 0);
  const hi = await HandAt(pose, 1);
  if (!lo || !hi) {
    failed += 1;
    console.error(`✗ ${label}：渲染层没有回填 state.handAt，姿势对不对无从验证`);
  } else if (Math.hypot(hi.x - lo.x, hi.y - lo.y) < 0.12) {
    failed += 1;
    console.error(`✗ ${label}：进度 0→1 手只挪了 ${Math.hypot(hi.x - lo.x, hi.y - lo.y).toFixed(3)}m`
      + "——姿势没有被进度驱动（多半又把 vaultK/poseU/poseK 用 ?? 串起来了）");
  } else {
    console.log(`✓ ${label} 由进度驱动（手从 ${lo.y.toFixed(2)}m 走到 ${hi.y.toFixed(2)}m）`);
  }
}

// ---------------------------------------------------------------------------
// 「手真的落在那件东西上」——挂点姿势的自动验
//
// 2026-08-12 换来的：找吃的那三道手第一版胳膊按角度表摆在半空，画面上是"对着
// 一片草空划拉"；睡姿第一版手直挺挺举向天。这类错**眼睛要盯着截图才看得出**，
// 可它其实是可算的：Core 每帧发布挂点（forage.<件>.grip），渲染层把手 IK 上去，
// 那就该有 |handAt − grip| ≈ 0。差得远＝这一支姿势忘了 AimFrontHand。
//
// 冻帧是这条测试的前提：StepGame 每帧会把 state.forage 清成 null（由链重新发布），
// 不冻的话刚塞进去的挂点下一帧就没了。
// ---------------------------------------------------------------------------
const GripHit = (pose, part, gx, gy) => page.evaluate(({ p, k, x, y }) => {
  const tl = window.TunnelLight;
  const st = tl.state;
  tl.Freeze(true);
  st.player.level = "surface";
  st.player.x = x + 0.42;
  st.player.heading = -1;
  for (let i = 0; i < 40; i += 1) {
    st.player.pose = p; st.player.poseT = 9; st.player.poseU = 0.5; st.player.poseK = 0.5;
    st.forage = { mat: {}, plank: {}, ash: {} };
    st.forage[k] = { grip: { x, y } };
    tl.Tick(1, 1 / 30);
  }
  const h = st.handAt ? { x: +st.handAt.x.toFixed(3), y: +st.handAt.y.toFixed(3) } : null;
  tl.Freeze(false);
  st.player.pose = null; st.player.poseT = undefined;
  return h;
}, { p: pose, k: part, x: gx, y: gy });

for (const [pose, part, label] of [["heaveMat", "mat", "掀苫草"], ["dragPlank", "plank", "拖门板"],
  ["scoopAsh", "ash", "扒烧土"]]) {
  const gx = 20, gy = 0.42;
  const h = await GripHit(pose, part, gx, gy);
  const d = h ? Math.hypot(h.x - gx, h.y - gy) : Infinity;
  if (!h) {
    failed += 1;
    console.error(`✗ ${label}：渲染层没有回填 state.handAt`);
  } else if (d > 0.18) {
    failed += 1;
    console.error(`✗ ${label}：手离挂点 ${d.toFixed(2)}m——这一支姿势没把手 IK 到那件东西上`
      + "（Rig 里补 AimFrontHand，World 的 FORAGE_GRIP 里登记）");
  } else {
    console.log(`✓ ${label} 手真落在挂点上（差 ${d.toFixed(2)}m）`);
  }
}

// ---------------------------------------------------------------------------
// 地下机位不许有前景层
//
// 2026-08-10 用户报的「镜头前面两根白白的模糊一坨」：fore 层的草丛/篱笆按
// SURFACE_Y-4.4 摆位，覆盖 y −4.40→+1.06，而地道内部是 −3.60→−1.55——地表机位
// 下它压在画框外，镜头一沉进地窖就正对着画面中央。这作品地表与地下在同一个场景
// 里，所以"摆到画框下缘之外"这个前提只在地表成立。内容已整个删掉，这条守的是
// 闸门：以后谁再往 fore 层里塞东西，地下机位必须仍然是空的。
const foreCheck = await page.evaluate(() => {
  const w = window.TunnelLight.world;
  const { layers, SURFACE_Y, UNDER_Y } = w.debugLayers();
  const out = [];
  for (const [label, camY] of [["地下", UNDER_Y + 1.3], ["地表", SURFACE_Y + 1.5]]) {
    w.ApplyCamera(42.5, camY, 8.0);
    out.push({ label, camY, visible: layers.fore.visible, count: layers.fore.children.length });
  }
  return out;
});
for (const r of foreCheck) {
  const 有内容 = r.visible && r.count > 0;
  if (r.label === "地下" && 有内容) {
    failed += 1;
    console.error(`✗ 地下机位（camY ${r.camY.toFixed(2)}）画着 ${r.count} 张前景贴图`
      + "——fore 层按地表地平线摆位，沉到地道里就糊在画框中央");
  }
}
console.log(`✓ 地下机位无前景层（fore 存量 ${foreCheck[0].count} 张，地下可见=${foreCheck[0].visible}）`);

// ---------------------------------------------------------------------------
// 井筒内壁必须跟剖面同一个平面、并且压在地表断面带之后
//
// 2026-08-11 用户报的「井有点小渲染bug」：井筒里横着一条硬边，上半截是天色。
// 两处原因，都不是尺寸问题：
//   ① 井壁原来摆在玩家背后（nearBack），洞口却开在 z=2.2 的剖面上——两个平面
//      各走各的透视，只有一个机位对得上，镜头一低就错开、漏出洞口上沿；
//   ② 就算不错开也看不见：近处那条地表断面带（walk−4）横贯全场、从地平线往下
//      铺 3.2 米，正好糊在洞口上，绘制序比井壁还晚。
// 所以这条同时钉住"同平面"和"压在断面带之后"。
const shaftCheck = await page.evaluate(() => {
  const w = window.TunnelLight.world;
  const { layers, THREE } = w.debugLayers();
  let band = -1;                       // 地表断面带（最宽的那张立面贴图）
  const walls = [];
  layers.play.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.parameters || {};
    const p = new THREE.Vector3();
    o.getWorldPosition(p);
    if (o.userData.shaftWall) walls.push({ z: +p.z.toFixed(2), ord: o.renderOrder });
    else if ((g.width || 0) > 100 && Math.abs(p.z) < 0.01) band = Math.max(band, o.renderOrder);
  });
  return { walls, band, faceZ: 2.2 };
});
if (!shaftCheck.walls.length) {
  failed += 1;
  console.error("✗ 井筒内壁：一张都没建出来（第一章那口窖井该有）");
} else {
  const bad = shaftCheck.walls.filter((v) => Math.abs(v.z - shaftCheck.faceZ) > 0.01
    || (shaftCheck.band >= 0 && v.ord <= shaftCheck.band));
  if (bad.length) {
    failed += 1;
    console.error(`✗ 井筒内壁摆错：${JSON.stringify(bad)}（应 z=${shaftCheck.faceZ}、`
      + `绘制序 > 地表断面带 ${shaftCheck.band}）`);
  } else {
    console.log(`✓ 井筒内壁与剖面同平面（z=${shaftCheck.walls[0].z}）且压在断面带之后`
      + `（${shaftCheck.walls[0].ord} > ${shaftCheck.band}）`);
  }
}

// ---------------------------------------------------------------------------
// 拇指落点上不许压着别的东西（横屏手机）
//
// 2026-08-13 用户报的「移动端的按钮触发位置好像有点偏移了」。DOM 按钮的画与
// 点是同一个盒子，不可能真的错位——「偏移」只有一个来源：**被别的元素盖住了
// 一半**，剩下那弯月牙还能按，于是读起来就是触发点挪了地方。
// 当时的真凶是包袱条：右缘一条竖纸带，76vh 高，在 375~430 的画高里必然长到
// 拇指那一排上去，实测盖掉互动钮 52% 的面积；而它拾取时会自己滑出来探头
// 3.2 秒，那会儿世界没冻结，玩家正要按互动。
// 这条按圆形按钮的**有效面积**逐点验：正常玩法、包袱探头、包袱打开三种状态下，
// 摇杆与两颗钮都必须一格不缺。设置面板不在此列——那是玩家自己打开的模态面板，
// 点面板外面本来就是关掉它。
const TOUCH_SIZES = [
  { name: "iPhoneSE 横屏", w: 667, h: 375 },
  { name: "iPhone14 横屏", w: 844, h: 390 },
  { name: "iPhone15PM 横屏", w: 932, h: 430 },
];
for (const size of TOUCH_SIZES) {
  const mob = await browser.newPage({
    viewport: { width: size.w, height: size.h },
    deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  });
  await mob.goto(`http://127.0.0.1:${port}/TunnelLight1943/?chapter=1&fast=1`, { waitUntil: "load", timeout: 60000 });
  await mob.waitForFunction(() => window.TunnelLight !== undefined, { timeout: 60000 });
  await mob.evaluate(() => {
    for (let i = 0; i < 400; i += 1) {
      if (window.TunnelLight.state?.phase === "playing") break;
      window.TunnelLight.StepFrames(1, { advance: true });
    }
  });
  const touch = await mob.evaluate(async () => {
    // 圆形按钮：只数落在圆里的采样点，方角上的空白不算数
    const Free = (id) => {
      const el = document.getElementById(id);
      if (!el) return { id, bad: 1, total: 1, thief: "元素不存在" };
      const b = el.getBoundingClientRect();
      let bad = 0, total = 0, thief = null;
      for (let iy = 0; iy < 5; iy += 1) {
        for (let ix = 0; ix < 5; ix += 1) {
          const x = b.left + b.width * (0.1 + 0.2 * ix);
          const y = b.top + b.height * (0.1 + 0.2 * iy);
          const dx = (x - b.left - b.width / 2) / (b.width / 2);
          const dy = (y - b.top - b.height / 2) / (b.height / 2);
          if (dx * dx + dy * dy > 1) continue;
          total += 1;
          const top = document.elementFromPoint(x, y);
          if (top && (top === el || el.contains(top))) continue;
          bad += 1;
          let n = top;
          while (n && !n.id && n.parentElement) n = n.parentElement;
          thief = n?.id || top?.tagName || "?";
        }
      }
      return { id, bad, total, thief };
    };
    const Sweep = () => ["stick", "btnAct", "btnCrouch"].map(Free).filter((r) => r.bad > 0);
    const out = {};
    out.玩法 = Sweep();
    const bp = document.getElementById("bagPanel");
    bp.hidden = false; bp.classList.add("show");        // 探头（只 show 不 open）
    await new Promise((r) => setTimeout(r, 380));
    out.包袱探头 = Sweep();
    bp.classList.remove("show"); bp.hidden = true;
    document.getElementById("btnBag").click();          // 真打开
    await new Promise((r) => setTimeout(r, 380));
    out.包袱打开 = Sweep();
    return out;
  });
  await mob.close();
  const blocked = Object.entries(touch).filter(([, v]) => v.length);
  if (blocked.length) {
    failed += 1;
    for (const [phase, list] of blocked) {
      for (const r of list) {
        console.error(`✗ ${size.name} · ${phase}：${r.id} 有 ${r.bad}/${r.total} 的面积被 `
          + `#${r.thief} 盖住——玩家按在钮上没反应，读起来就是"触发位置偏了"`);
      }
    }
  } else {
    console.log(`✓ ${size.name} 拇指控件三态无遮挡（摇杆 / 互动 / 蹲）`);
  }
}

await browser.close();
server.close();
if (failed) {
  console.error(`渲染健康检查失败：${failed} 章`);
  process.exit(1);
}
console.log("渲染健康检查全部通过 ✓");
