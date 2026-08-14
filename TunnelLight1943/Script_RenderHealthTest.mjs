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
// 板缝里打进来的那几束光：盖板合上才亮、而且必须排在压暗罩之后
//
// 2026-08-13 重做（用户：「序章里的打进来的光要做出来」）。这条守两件事，
// 都是当天真的踩到的：
//   ① **绘制序要在全屏压暗罩（ORDER_DARK 8500）之后。** 光柱是加色的，排在
//      罩子前面就被罩子一起压掉，等于没画。而且不能写裸 renderOrder——
//      ApplyDepthOrder 会按 z 重新派号盖掉它（实测被派成 6252，正压在罩底），
//      必须走 FixOrder。
//   ② **盖板合上（lidShut）才有光。** 板子敞着的时候漏进来的是整格天光，
//      不是板缝那三条；这几束要跟着旗标走，不然白天窖里凭空多三道光。
const beamCheck = await page.evaluate(() => {
  const tl = window.TunnelLight;
  const w = tl.world;
  const { THREE } = w.debugLayers();
  let beam = null;
  w.scene.traverse((o) => { if (o.material?.uniforms?.uShafts) beam = o; });
  if (!beam) return { missing: true };
  let dark = -1;
  w.scene.traverse((o) => { if (o.isMesh && o.renderOrder === 8500) dark = o.renderOrder; });
  const Read = () => ({
    inten: +beam.material.uniforms.uIntensity.value.toFixed(3),
    vis: beam.visible,
  });
  // 亮度是跨帧吸附的，得让渲染侧真的走几十帧才追得上
  tl.state.flags.lidShut = false;
  tl.state.hatchMoon = false;
  tl.Settle(120);
  const off = Read();
  tl.state.flags.lidShut = true;
  tl.Settle(120);
  const on = Read();
  return {
    ord: beam.renderOrder, fixed: beam.userData.fixedOrder, dark,
    count: beam.material.uniforms.uCount.value, off, on, THREE: !!THREE,
  };
});
if (beamCheck.missing) {
  failed += 1;
  console.error("✗ 板缝光柱：一束都没建出来（第一章那口窖口该有）");
} else {
  const 排在罩后 = beamCheck.dark < 0 || beamCheck.ord > beamCheck.dark;
  const 钉住了 = beamCheck.fixed !== undefined;
  const 跟着旗标 = beamCheck.on.inten > 0.3 && beamCheck.off.inten < 0.05;
  if (!排在罩后 || !钉住了 || !跟着旗标 || beamCheck.count < 2) {
    failed += 1;
    console.error(`✗ 板缝光柱不对：${JSON.stringify(beamCheck)}`
      + `（要 ①绘制序 > 压暗罩 ${beamCheck.dark} 且走 FixOrder ②lidShut 落下才亮 ③至少两束）`);
  } else {
    console.log(`✓ 板缝光柱：${beamCheck.count} 束 / 绘制序 ${beamCheck.ord} > 压暗罩 ${beamCheck.dark}`
      + ` / 合板才亮（${beamCheck.off.inten} → ${beamCheck.on.inten}）`);
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
    document.getElementById("btnBag").click();          // 关回去，别影响下面那段
    await new Promise((r) => setTimeout(r, 380));

    // 角上那枚「下一件事」：它自己也是个按得着的钮，同样不许被谁盖住；
    // 而左上角还住着跳过序章那颗钮（现在没有 prologue 拍，但机制留着），
    // 两枚一旦同时亮就得错开——这条是摆位对错，跟画高无关，所以在这儿一起验
    const tab = document.getElementById("objectiveTab");
    out.目标牌 = [];
    for (let i = 0; i < 600 && tab.hidden; i += 1) window.TunnelLight.StepFrames(2, { advance: true });
    if (!tab.hidden) {
      out.目标牌 = [Free("objectiveTab")].filter((r) => r.bad > 0);
      // 下面几行中间不许 await：SyncHud 每帧都会把这两个开关拨回去
      const skip = document.getElementById("btnSkipCine");
      skip.hidden = false;
      tab.classList.add("lower");
      const a = tab.getBoundingClientRect(), b = skip.getBoundingClientRect();
      const 错开 = a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
      if (!错开) out.目标牌.push({ id: "objectiveTab", bad: 1, total: 1, thief: "btnSkipCine" });
      skip.hidden = true;
      tab.classList.remove("lower");
    }
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
    console.log(`✓ ${size.name} 拇指控件三态无遮挡（摇杆 / 互动 / 蹲）＋ 角上目标牌不被压、不跟跳过键叠`);
  }
}

// ---------------------------------------------------------------------------
// 标题页：四档画高都点得着（章节选择）
//
// 2026-08-14 用户报「移动端横屏过来以及 pc 端不能选择章节了」。病根是一句
// `#titleScreen { display:flex; align-items:center }` 配 `overflow-y:auto`：
// **flex 的居中会把超出的那一半顶到容器上方**，而 scrollTop 的下限是 0——
// 上半截既画不出来也滚不到。实测 1280×620 的桌面窗口 h1 落在 y=−44、
// 667×375 的横屏手机「从第一章开始」落在 y=−75，两处都按不着；机器再矮一档，
// 被顶出去的就轮到章节列表了。
// 这条按**能不能点着**验：滚到顶时不许有东西在 y<0（上方没有够不着的内容），
// 滚到底时最后一枚章节牌必须整个在画框里。
const TITLE_SIZES = [
  { name: "iPhoneSE 横屏", w: 667, h: 375 },
  { name: "iPhone14 横屏", w: 844, h: 390 },
  { name: "矮桌面窗口", w: 1280, h: 620 },
  { name: "桌面 16:9", w: 1280, h: 720 },
];
for (const size of TITLE_SIZES) {
  const tp = await browser.newPage({ viewport: { width: size.w, height: size.h } });
  await tp.goto(`http://127.0.0.1:${port}/TunnelLight1943/`, { waitUntil: "load", timeout: 60000 });
  await tp.waitForFunction(() => document.getElementById("chapterList")?.children.length > 0, { timeout: 60000 });
  const r = await tp.evaluate(() => {
    const t = document.getElementById("titleScreen");
    const l = document.getElementById("chapterList");
    const s2 = document.getElementById("startButton");
    t.scrollTop = 0;
    const top = Math.min(s2.getBoundingClientRect().top,
      ...[...l.children].map((b) => b.getBoundingClientRect().top));
    t.scrollTop = t.scrollHeight;
    const last = l.children[l.children.length - 1].getBoundingClientRect();
    const n = l.children.length;
    t.scrollTop = 0;
    // 收黑罩（#fadeOverlay）CSS 默认全黑、开机没有游戏循环去降它——标题页的
    // z-index 必须压过它，否则玩家一打开是纯黑（2026-08-14 线上就是这么黑的；
    // 罩子 pointer-events:none，按钮盲点得着，所以光测"点得着"抓不住）。
    const zOf = (el) => { const z = parseInt(getComputedStyle(el).zIndex, 10); return Number.isFinite(z) ? z : -1; };
    return { top, lastBottom: last.bottom, vh: window.innerHeight, n,
      titleZ: zOf(t), fadeZ: zOf(document.getElementById("fadeOverlay")) };
  });
  await tp.close();
  if (r.titleZ <= r.fadeZ) {
    failed += 1;
    console.error(`✗ ${size.name} 标题页被收黑罩盖死：#titleScreen z=${r.titleZ} ≤ #fadeOverlay z=${r.fadeZ}`
      + `——开机就是纯黑，玩家什么都看不见`);
  }
  // 0.5px 的余量给亚像素布局
  if (r.top < -0.5 || r.lastBottom > r.vh + 0.5 || r.n < 8) {
    failed += 1;
    console.error(`✗ ${size.name} 标题页够不着：滚到顶时最上沿在 y=${r.top.toFixed(0)}`
      + `（<0 ＝ 被 flex 居中顶出去了，滚不回来）、滚到底时末章下沿 ${r.lastBottom.toFixed(0)} / 画高 ${r.vh}`
      + `、章节 ${r.n} 枚——玩家点不着「开始」或「选章节」`);
  } else {
    console.log(`✓ ${size.name} 标题页开始键与 ${r.n} 枚章节牌都点得着`);
  }
}

// 画面不许被拉伸（横屏手机）
//
// 2026-08-13 用户报「移动端横屏会被拉伸」。两件事分开钉：
//   ① **真拉伸**＝一米见方的东西投到屏幕上不是正方。来源只有一个：画布缓冲的
//      长宽比跟 CSS 盒对不上（或相机 aspect 跟盒对不上）。逐比例量 pxPerM 的
//      横竖两个数，差一个千分之三都算红。**改了尺寸之后还要再量一遍**——
//      手机上盒子会自己变（地址栏、手势条、旋转），Main 那边靠 ResizeObserver
//      跟住，这里就照着模拟一次。
//   ② **被裁扁**＝屏幕比 16:9 宽时，照画宽走会把上下裁掉近两成，人贴着画框
//      底边，读起来同样是"拉伸了"。所以超宽的那一档改成保画高：**竖直方向
//      的米数必须与 16:9 相等**，多出来的比例往两边加宽。
// 基准画高由第一行（桌面 16:9）自己量出来，后面几行都跟它比
let REF_VIEW_H = 0;
const ASPECT_SIZES = [
  { name: "桌面 16:9", w: 1600, h: 900, dpr: 1 },
  { name: "iPhoneSE 横屏", w: 667, h: 375, dpr: 2 },
  { name: "iPhone15PM 横屏 2.17:1", w: 932, h: 430, dpr: 3 },
  { name: "折叠屏 21:9", w: 1050, h: 450, dpr: 2.5 },
  { name: "iPad 横屏 1.44:1", w: 1180, h: 820, dpr: 2 },
];
const Metrics = (page) => page.evaluate(() => {
  const { THREE, camera } = window.TunnelLight.world.debugLayers();
  const c = document.getElementById("gameCanvas");
  const r = c.getBoundingClientRect();
  const P = (x, y) => {
    const v = new THREE.Vector3(x, y, 0).project(camera);
    return [(v.x * 0.5 + 0.5) * r.width, (-v.y * 0.5 + 0.5) * r.height];
  };
  const o = P(30, 0), px = P(31, 0), py = P(30, 1);
  return {
    boxW: r.width, boxH: r.height, bufW: c.width, bufH: c.height,
    camAspect: camera.aspect,
    pxPerM_x: px[0] - o[0], pxPerM_y: o[1] - py[1],
  };
});
{
  let aspectBad = 0;
  for (const s of ASPECT_SIZES) {
    const page = await browser.newPage({
      viewport: { width: s.w, height: s.h },
      deviceScaleFactor: s.dpr, isMobile: s.w < 1200, hasTouch: s.w < 1200,
    });
    await page.goto(`http://127.0.0.1:${port}/TunnelLight1943/?chapter=1&fast=1`, { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction(() => window.TunnelLight?.world?.debugLayers, { timeout: 60000 });
    await page.waitForTimeout(400);
    // 中途再改一次尺寸：手机上盒子本来就会自己变，改完必须还是不拉伸
    await page.setViewportSize({ width: s.w, height: Math.round(s.h * 0.86) });
    await page.waitForTimeout(400);
    await page.setViewportSize({ width: s.w, height: s.h });
    await page.waitForTimeout(400);
    const m = await Metrics(page);
    await page.close();

    const boxA = m.boxW / m.boxH;
    const bufA = m.bufW / m.bufH;
    const sq = m.pxPerM_x / m.pxPerM_y;          // 1＝一米见方投出来还是正方
    const viewH = m.boxH / m.pxPerM_y;           // 画框里装得下几米高
    const okSquare = Math.abs(sq - 1) < 0.003;
    const okBuf = Math.abs(bufA / boxA - 1) < 0.005;
    const okCam = Math.abs(m.camAspect / boxA - 1) < 0.005;
    // 超宽的那一档保画高：与 16:9 的画高相等（±1%）；不超宽的只要不比它矮
    const okH = boxA > 16 / 9 ? Math.abs(viewH / REF_VIEW_H - 1) < 0.01 : viewH >= REF_VIEW_H - 1e-3;
    if (!(okSquare && okBuf && okCam && okH)) {
      aspectBad += 1;
      failed += 1;
      console.error(`✗ ${s.name}：一米见方投出来是 ${sq.toFixed(4)}（要 1）、`
        + `缓冲比/盒比 ${(bufA / boxA).toFixed(4)}、相机比/盒比 ${(m.camAspect / boxA).toFixed(4)}、`
        + `画高 ${viewH.toFixed(2)}m（16:9 是 ${REF_VIEW_H.toFixed(2)}m）`);
    } else if (s.name === "桌面 16:9") {
      REF_VIEW_H = viewH;
      console.log(`✓ ${s.name} 不拉伸（基准画高 ${viewH.toFixed(2)}m）`);
    } else {
      console.log(`✓ ${s.name} 不拉伸（一米见方 ${sq.toFixed(4)} / 画高 ${viewH.toFixed(2)}m 与 16:9 齐平）`);
    }
  }
  if (!aspectBad) console.log("✓ 各比例画面不拉伸、超宽不裁画高（改尺寸之后仍成立）");
}

await browser.close();
server.close();
if (failed) {
  console.error(`渲染健康检查失败：${failed} 章`);
  process.exit(1);
}
console.log("渲染健康检查全部通过 ✓");
