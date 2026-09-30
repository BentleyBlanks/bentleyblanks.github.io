// 地面脚印与痕迹的 GPU 门禁：真实痕迹靶 pass + 真实地形 / 壕沟着色器，读回像素。口径 docs/Data_TerrainTrails.md §6。
//   node Taierzhuang1938/Script_TerrainTrailsTest.mjs [--shot]
//   --shot  把夹具的对照图（无印 / 有印 / 调试视图）存到 tmp/TerrainTrails/（只留本地）
//
// 查的是：印章真的写进靶（坑深 / 泥边 / 踩乱三通道、左右脚镜像）；整张减淡按色阶走；窗口滑走再滑回来
// 从历史补回（强度按寿命折过）；跨靶边的印章两边都有；地形材质采到后反照率变暗、法线变、积水判据吃坑深；
// 石材变体不编采样；程序全部链接、采样器 ≤ 16、无 GL 错误；pass 关掉时材质侧整段跳过。
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const SHOT = process.argv.includes("--shot");
const root = fileURLToPath(new URL("../", import.meta.url));
const html = await fs.readFile(new URL("./index.html", import.meta.url), "utf8");
const imports = html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[0];
const server = await ServeRoot(root, 0), browser = await LaunchBrowser(), page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
try {
  await page.route("**/TerrainTrailsFixture.html", (r) => r.fulfill({ contentType: "text/html", body: imports }));
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/TerrainTrailsFixture.html`);
  const report = await page.evaluate(async (shot) => {
    const T = await import("three");
    const { TerrainTrails, TerrainTrailsPass, TerrainTrailUniforms } = await import("./Script_TerrainTrails.mjs");
    const { MakeTerrainPatch, TERRAIN_DEBUG_UNIFORM } = await import("./Script_TerrainMaterial.mjs");
    const { MakeTrenchSurfacePatch } = await import("./Script_TrenchSurfaceMaterial.mjs");
    const { ApplyPatches } = await import("./Script_MaterialPatches.mjs");
    const { TerrainContactField } = await import("./Script_TerrainContact.mjs");
    const { TerrainQualityOf } = await import("./Data_Tuning_Terrain.mjs");
    const { TERRAIN_TRAIL_TIERS, TERRAIN_TRAIL_WINDOW } = await import("./Data_Tuning_TerrainTrails.mjs");
    const W = 480, H = 270;
    const renderer = new T.WebGLRenderer({ preserveDrawingBuffer: true });
    renderer.setSize(W, H); renderer.setClearColor(0x223344, 1);
    const gl = renderer.getContext();
    const tier = TERRAIN_TRAIL_TIERS.high, extent = tier.size * tier.texelM;
    const pipeline = { renderer, preset: { terrainTrails: "high" }, targets: {} };
    const system = new TerrainTrails();
    system.AttachGround({}, () => 0);
    const pass = new TerrainTrailsPass(pipeline, system);
    const camera = new T.PerspectiveCamera(50, W / H, 0.05, 60);
    const ctx = { renderer, camera, pipeline };
    const Frame = (dt = 0) => {
      camera.updateMatrixWorld();
      system.Update(dt, { focus: camera.getWorldPosition(new T.Vector3()) });
      if (pass.Enabled()) pass.Render(ctx); else pass.Idle();
    };
    const Read = (x, z) => pass.ReadTexel(renderer, x, z);
    const out = {};

    // --- 1. 印章写进靶 -------------------------------------------------------
    camera.position.set(0, 1.6, 2.2); camera.lookAt(0, 0, 0);
    Frame();
    const right = system.Stamp({ x: 0.2, z: 0, dirX: 0, dirZ: -1, kind: "straw", side: 1, strength: [1, 1, 1] });
    system.Stamp({ x: -0.2, z: 0, dirX: 0, dirZ: -1, kind: "straw", side: -1, strength: [1, 1, 1] });
    Frame();
    out.heel = Read(0.2, 0.27 * 0.35);        // 脚跟（dir = −Z，脚跟在 +z 那头）
    out.ball = Read(0.2, -0.27 * 0.2);
    out.rimSide = Read(0.2 + 0.105 * 0.5 + 0.006, 0);
    out.far = Read(1.5, 1.5);
    // 左右镜像：前掌处右脚的外侧（+x）比内侧窄，左脚反过来 —— 在各自的外侧 3.9 cm 取样应对称
    out.mirror = [Read(0.2 + 0.039, -0.06), Read(-0.2 - 0.039, -0.06), Read(0.2 - 0.039, -0.06), Read(-0.2 + 0.039, -0.06)];
    out.rightStamp = { quadW: right.quadW, quadL: right.quadL };

    // --- 2. 减淡 ---------------------------------------------------------------
    const before = Read(0.2, 0.27 * 0.35);
    for (let i = 0; i < 120; i++) Frame(0.25);   // 系统单帧 dt 上限 0.25 s
    out.decayed = { before, after: Read(0.2, 0.27 * 0.35), steps: TERRAIN_TRAIL_WINDOW.lifeS.map((l) => Math.floor(30 * 255 / l)) };

    // --- 3. 窗口滑走再滑回：清条带 + 历史回填 ----------------------------------
    camera.position.x += extent * 0.75; Frame();
    out.aliased = Read(0.2 + extent, 0.27 * 0.35);   // 同一个纹素现在代表东边一个窗口远的地方：必须是空的
    out.slideStrips = pass.stats.strips;
    camera.position.x -= extent * 0.75; Frame();
    out.restored = Read(0.2, 0.27 * 0.35);
    out.restamped = pass.stats.restamped;

    // --- 4. 跨靶边 -------------------------------------------------------------
    camera.position.set(extent - 1, 1.6, 2.2); camera.lookAt(extent - 1, 0, 0); Frame();
    system.Stamp({ x: extent - 0.005, z: 0.3, dirX: 1, dirZ: 0, kind: "boot", side: 1, strength: [1, 1, 1] });
    Frame();
    out.seam = [Read(extent - 0.06, 0.3), Read(extent + 0.06, 0.3)];

    // --- 5. 地形材质采到它 -----------------------------------------------------
    camera.position.set(0, 1.1, 1.3); camera.lookAt(0, 0, -0.05); Frame();
    const ArrayTexture = (channels, layers = 5) => {
      const data = new Uint8Array(4 * 4 * layers * 4);
      for (let i = 0; i < data.length; i += 4) data.set(channels, i);
      const tex = new T.DataArrayTexture(data, 4, 4, layers);
      tex.needsUpdate = true; tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.generateMipmaps = false;
      tex.minFilter = tex.magFilter = T.LinearFilter;
      return tex;
    };
    const pack = { setName: "MissionPlain", albedo: ArrayTexture([150, 130, 110, 128]), surface: ArrayTexture([128, 128, 230, 255]),
      albedoMean: new Float32Array(16).fill(0.3), surfaceMean: new Float32Array(16).fill(0.5) };
    const Ground = (patch, layers) => {
      const geometry = new T.PlaneGeometry(4, 4, 8, 8); geometry.rotateX(-Math.PI / 2);
      const n = geometry.attributes.position.count, data = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) data.set(layers, i * 4);
      geometry.setAttribute("terrainLayers", new T.BufferAttribute(data, 4));
      geometry.setAttribute("color", new T.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
      const material = new T.MeshStandardMaterial({ roughness: 1, metalness: 0, vertexColors: true });
      ApplyPatches(material, [patch]);
      return new T.Mesh(geometry, material);
    };
    const scene = new T.Scene();
    scene.add(new T.AmbientLight(0xffffff, 0.35));
    const sun = new T.DirectionalLight(0xffffff, 2.2); sun.position.set(-0.6, 1.0, -0.25); scene.add(sun);
    const terrainPatch = MakeTerrainPatch(pack, TerrainQualityOf("high"), { trails: tier });
    // 底土层（layers = 0,0,0,1 → 权重全给底土）
    const ground = Ground(terrainPatch, [0, 0, 0, 1]);
    scene.add(ground);
    const Pixels = () => {
      const buf = new Uint8Array(W * H * 4);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      return buf;
    };
    const Luma = (buf, x, z) => {
      const p = new T.Vector3(x, 0, z).project(camera);
      const px = Math.round((p.x * 0.5 + 0.5) * W), py = Math.round((p.y * 0.5 + 0.5) * H);
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const i = ((py + dy) * W + px + dx) * 4;
        sum += 0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2];
      }
      return sum / 9;
    };
    const Shots = {};
    const Canvas = () => renderer.domElement.toDataURL("image/png");
    // 有印
    renderer.setRenderTarget(null); renderer.render(scene, camera);
    const withPrint = Pixels();
    if (shot) Shots.with = Canvas();
    // 调试视图 8
    TERRAIN_DEBUG_UNIFORM.value = 8; renderer.render(scene, camera);
    const debug = Pixels();
    if (shot) Shots.debug = Canvas();
    TERRAIN_DEBUG_UNIFORM.value = 0;
    // 关掉 pass（Idle）：材质侧整段跳过 = 无印
    pass.Idle(); renderer.render(scene, camera);
    const withoutPrint = Pixels();
    if (shot) Shots.without = Canvas();
    Frame();   // 再开：整张重建
    out.rebuiltAfterIdle = Read(0.2, 0.27 * 0.35);
    const sample = [[0.2, 0.08], [0.2, -0.05], [-0.2, 0.08], [0.8, -0.5]];
    out.luma = sample.map(([x, z]) => ({ at: [x, z], with: +Luma(withPrint, x, z).toFixed(1), without: +Luma(withoutPrint, x, z).toFixed(1) }));
    out.debugRed = +(Luma(debug, 0.2, 0.08)).toFixed(1);
    out.debugOff = +(Luma(debug, 0.8, -0.5)).toFixed(1);
    let changed = 0;
    for (let i = 0; i < withPrint.length; i += 4) if (Math.abs(withPrint[i] - withoutPrint[i]) > 3) changed++;
    out.changedPixels = changed;

    // --- 6. 壕沟湿泥 / 石材变体都能编 ----------------------------------------
    const contact = new TerrainContactField({ cols: 2, rows: 2, minX: -4, minZ: -4, stepX: 4, stepZ: 4, heights: new Float32Array(9) });
    const wet = Ground(MakeTrenchSurfacePatch(pack, "high", null, contact), [0, 1, 0, 1]);
    const stonePatch = MakeTrenchSurfacePatch(pack, "high", null, contact, { stone: true });
    const stone = Ground(stonePatch, [0, 0, 0, 1]);
    wet.position.x = 5; stone.position.x = -5;
    scene.add(wet, stone);
    renderer.render(scene, camera);
    out.patchKeys = { terrain: terrainPatch.key, stone: stonePatch.key, stoneTrails: stonePatch.terrainTrails };
    out.programs = renderer.info.programs.map((p) => {
      const program = p.program, n = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
      let samplers = 0;
      for (let i = 0; i < n; i++) {
        const info = gl.getActiveUniform(program, i);
        if ([gl.SAMPLER_2D, gl.SAMPLER_2D_ARRAY, gl.SAMPLER_3D, gl.SAMPLER_CUBE, gl.SAMPLER_2D_SHADOW].includes(info.type)) samplers += info.size;
      }
      const names = [];
      for (let i = 0; i < n; i++) names.push(gl.getActiveUniform(program, i).name);
      return { name: p.name, key: p.cacheKey.slice(-60), linked: gl.getProgramParameter(program, gl.LINK_STATUS), samplers,
        trailMap: names.includes("uTrailMap") };
    });
    // --- 7. 履带车辆：合成车体（宽 2.18 m）直行 8 m 再原地转 90° ---------------------
    {
      const { TERRAIN_TRAIL_VEHICLES } = await import("./Data_Tuning_TerrainTrails.mjs");
      const vScene = new T.Scene();
      const hull = new T.Group();
      hull.add(new T.Mesh(new T.BoxGeometry(2.18, 1.2, 5.7), new T.MeshBasicMaterial()));
      hull.position.set(20, 0, 0); vScene.add(hull);
      const vSystem = new TerrainTrails();
      vSystem.idleSkip = false;   // 这一节不挂 pass，单独验采集
      vSystem.AttachGround({}, () => 0);
      vSystem.TrackVehicle(hull, TERRAIN_TRAIL_VEHICLES.type89);
      const focus = new T.Vector3(20, 0, 0);
      const Tick = () => { hull.updateMatrixWorld(true); vSystem.Update(1 / 30, { focus, scene: vScene }); };
      Tick();
      const seeded = vSystem.stats.treads;
      for (let i = 0; i < 80; i++) { hull.position.z -= 0.1; Tick(); }   // 车头 −Z，往前开 8 m
      const driven = vSystem.stats.treads - seeded;
      const lines = vSystem.recentVehicle.map((r) => r.x);
      const rightZ = vSystem.recentVehicle.filter((r) => r.x > 20).map((r) => r.z);
      const spacing = rightZ.slice(1).map((v, i) => +(rightZ[i] - v).toFixed(3));
      for (let i = 0; i < 30; i++) { hull.rotation.y += Math.PI / 60; Tick(); }   // 原地左转 90°
      out.vehicle = { seeded, driven, afterPivot: vSystem.stats.treads - seeded - driven,
        xs: [...new Set(lines.map((x) => +x.toFixed(2)))], half: vSystem.vehicles.get(hull).half,
        spacing };
    }
    out.glError = gl.getError();
    out.uniformsAfterIdle = (() => { pass.Idle(); return TerrainTrailUniforms.uTrailWindow.value.w; })();
    out.describe = pass.Describe();
    pass.Dispose(); contact.Dispose(); renderer.dispose();
    return { ...out, shots: Shots };
  }, SHOT);

  const { shots, ...printable } = report;
  console.log(JSON.stringify(printable, null, 1));
  assert.deepEqual(errors, []);
  assert.equal(report.glError, 0, "无 GL 错误");
  assert.ok(report.programs.every((p) => p.linked), "所有程序链接");
  assert.ok(report.programs.every((p) => p.samplers <= 16), "采样器 ≤ 16");
  // 1
  assert.ok(report.heel[0] > 150 && report.ball[0] > 150, `坑深写进 R（脚跟 ${report.heel} 前掌 ${report.ball}）`);
  assert.ok(report.rimSide[1] > 40, `鞋边外有泥边 G（${report.rimSide}）`);
  assert.deepEqual(report.far, [0, 0, 0], "别处是空的");
  const [rOut, lOut, rIn, lIn] = report.mirror;
  assert.ok(Math.abs(rOut[0] - lOut[0]) <= 12 && Math.abs(rIn[0] - lIn[0]) <= 12, `左右脚镜像对称（${JSON.stringify(report.mirror)}）`);
  // 2
  const drop = report.decayed.before[0] - report.decayed.after[0];
  assert.ok(Math.abs(drop - report.decayed.steps[0]) <= 1, `减淡色阶 ${drop} ≈ ${report.decayed.steps[0]}`);
  // 3
  assert.deepEqual(report.aliased, [0, 0, 0], "窗口滑走后别名纹素已清");
  assert.ok(report.slideStrips > 0, "滑窗清了条带");
  assert.ok(report.restored.every((v, c) => Math.abs(v - report.decayed.after[c]) <= 1), `滑回来从历史补回（${report.restored} vs ${report.decayed.after}）`);
  // 4
  assert.ok(report.seam[0][0] > 60 && report.seam[1][0] > 60, `跨靶边两边都有（${JSON.stringify(report.seam)}）`);
  // 5
  const [heel, ball, left, empty] = report.luma;
  assert.ok(heel.with < heel.without - 4 || Math.abs(heel.with - heel.without) > 6, `坑里明暗变了（${JSON.stringify(heel)}）`);
  assert.ok(Math.abs(empty.with - empty.without) < 1, `没印的地方逐像素不变（${JSON.stringify(empty)}）`);
  assert.ok(report.changedPixels > 300, `有印的像素数 ${report.changedPixels}`);
  assert.ok(report.debugRed > 20 && report.debugOff < 2, `调试视图 8：印处有红、别处黑（${report.debugRed} / ${report.debugOff}）`);
  assert.ok(Math.abs(report.rebuiltAfterIdle[0] - report.restored[0]) <= 2, "关掉再开整张重建");
  void ball; void left;
  // 6
  assert.ok(/tr\d+/.test(report.patchKeys.terrain) && !/tr\d+/.test(report.patchKeys.stone) && report.patchKeys.stoneTrails === false,
    "石材变体不编脚印");
  assert.ok(report.programs.some((p) => p.trailMap), "地形程序里 uTrailMap 是活的");
  assert.equal(report.uniformsAfterIdle, 0, "Idle 清有效位");
  // 7
  const V = report.vehicle;
  assert.ok(V.seeded >= 10 && V.seeded <= 16, `停车时两条履带整段着地压痕（${V.seeded}）`);
  assert.ok(Math.abs(V.half - 0.93) < 0.02, `半轨距按包围盒量（${V.half}）`);
  assert.ok(V.driven >= 26 && V.driven <= 30, `开 8 m 两条履带各盖约 14 段（${V.driven}）`);
  assert.deepEqual(V.xs.sort(), [19.07, 20.93], "履带印落在车体两侧 ±半轨距");
  assert.ok(V.spacing.every((d) => Math.abs(d - 0.56) < 0.01), `每段间距 = 图样周期 0.56 m（${V.spacing}）`);
  assert.ok(V.afterPivot > 0, `原地转向也留印（${V.afterPivot}）`);
  if (SHOT) {
    const dir = path.resolve(root, "tmp/TerrainTrails");
    await fs.mkdir(dir, { recursive: true });
    for (const [name, url] of Object.entries(shots)) await fs.writeFile(path.join(dir, `Fixture_${name}.png`), Buffer.from(url.split(",")[1], "base64"));
    console.log(`shots → ${dir}`);
  }
  console.log("TerrainTrailsTest: 印章 / 减淡 / 滑窗回填 / 跨靶边 / 地形着色 / 石材变体 / 采样器预算 / 履带车辆 全部通过");
} finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
