// 《滕县 一九三八》开机冒烟：真浏览器把整页跑起来，看它活不活。
//
// 存在的理由：视觉迭代每一轮都在动 shader 与姿态代码，而 shader 编译失败
// three 是**静默吞掉**的（GL 1282 不抛异常），页面照样跑、画面直接没了。
// 光看 node --check 完全测不出来。所以每轮改完必须跑这一遍。
//
// 用法：node Taierzhuang1938/Script_BootTest.mjs
// 退出码即成败。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const problems = [];
page.on("pageerror", (error) => problems.push(`PAGEERROR ${String(error).slice(0, 300)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const url = message.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;   // 外部字体拉不下来不算事故
  problems.push(`CONSOLE ${message.text().slice(0, 300)}`);
});

// 性能硬红线：5000 draw calls / 600 万三角面，越线即 FAIL。
//
// 人物与尸体的完整可见性仍是更高一级的内容硬规则：优化只能合批或做等价 LOD，
// 不得再隐藏第 N 个活人、删除第 N 具尸体来压测试数字。
const MAX_DRAW_CALLS = 5000;
const MAX_TRIANGLES = 6000000;

let failed = 0;
// 七关各启一次：每关换天光、换切片，是不同的 shader 分支组合与不同的几何量
for (const phase of [0, 1, 2, 3, 4, 5, 6]) {
  problems.length = 0;
  const url = `http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&phase=${phase}&quality=high&scale=small`;
  let health = null;
  try {
    await page.goto(url, { waitUntil: "load", timeout: 120000 });
    await page.waitForFunction(() => window.Taierzhuang !== undefined, { timeout: 180000 });
    await page.waitForFunction(() => window.Taierzhuang.vfx?.loadedExplosionSprites?.size === 4,
      { timeout: 30000 });
    await page.waitForFunction(() => window.Taierzhuang.vfx?.loadedVefectsMasks?.size === 5,
      { timeout: 30000 });
    await page.evaluate(() => window.Taierzhuang.StepFrames(120));
    await page.waitForTimeout(600);
    health = await page.evaluate((testPhase) => {
      const T = window.Taierzhuang;
      const gl = T.renderer.getContext();
      const glError = gl.getError();
      // 贴花回归：命中点不能再沿法线物理抬高；RGB 仍做正常叠色，但 HDR alpha
      // 必须保留，且 fragment shader 必须用预通道把离开承载面的 quad 裁掉。
      const decalPool = T.vfx.pools.decal;
      const decalIndex = decalPool.cursor;
      T.vfx._SpawnDecal({ x: 17, y: 3, z: -9 }, { x: 0, y: 1, z: 0 },
        0.12, [0.5, 0.5, 0.5], [0.1, 0.1, 0.1]);
      const decalOrigin = Array.from(decalPool.arrays.iOrigin.slice(decalIndex * 3, decalIndex * 3 + 3));
      const decalMaterial = decalPool.material;
      let readableIjaMaterials = 0;
      const ija = T.ai.soldiers.find((soldier) => soldier.side === "ija" && soldier.actor);
      if (ija) ija.actor.root.traverse((object) => {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if (material?.userData?.distantIjaReadable) readableIjaMaterials += 1;
        }
      });
      // renderer.info.render 每次 renderer.render() 都会重置，而一帧里有十几个
      // pass。不关掉 autoReset 的话，读到的永远只是最后那一块全屏四边形 = 1。
      T.renderer.info.autoReset = false;
      T.renderer.info.reset();
      // 四套爆炸图各强制播一片，让所有 grid/混合模式/着色器分支都在 Tier 0 真编译。
      // 只在第一关做，位置放到镜头前 18 m；后六关仍保持原本的整帧健康取样。
      if (testPhase === 0) {
        const forward = T.camera.position.clone();
        T.camera.getWorldDirection(forward);
        const blastAt = T.player.position.clone().addScaledVector(forward, 18);
        blastAt.y += 1.2;
        const forced = ["legacy", "compact", "fireball", "heavy"];
        for (let i = 0; i < forced.length; i += 1) {
          const p = blastAt.clone();
          p.x += (i - 1.5) * 2.2;
          T.vfx.Explosion(p, { radius: 2.2, kind: "grenade", spriteVariant: forced[i] });
        }
        // 常驻场景源强制播一组，让三条 authored-mask shader 分支都在 Tier 0 真编译。
        const sceneEffects = ["FireMedium", "GroundFire", "SmokeBlack"];
        const handles = sceneEffects.map((id, index) => T.vfx.SceneEffect(
          { x: blastAt.x + (index - 1) * 2.5, y: blastAt.y - 1.1, z: blastAt.z },
          id, { scale: 0.7 }));
        // 只灌一次发射器，不在 renderer.info.autoReset=false 时多渲染几十帧；
        // 否则性能读数会把 24 帧 draw call/三角形累加起来，形成测试自己的假红。
        T.vfx._UpdateSmokeSources(1);
        for (const handle of handles) T.vfx.RemoveSceneEffect(handle);
      }
      // 不开 preserveDrawingBuffer，取样必须与渲染在同一个任务里。
      // 走 StepFrames(1) 而不是自己调 post.Render：曝光/雾/泛光/去饱和全在 Frame()
      // 里按当关的天光预设装配，这里再抄一份必然抄漏。抄漏的代价不是"少一点效果"——
      // 夜战预设 exposure 是 3.6，被写死成 0.5 时整帧读出来就是纯黑，
      // 探针报"画面近乎纯色"，测的是测试自己写错的曝光，不是画面。
      T.StepFrames(1);
      const glErrorAfterVfx = gl.getError();

      const explosionSpritePools = {};
      const spritePoolNames = {
        legacy: "spriteLegacy", compact: "spriteCompact",
        fireball: "spriteFireball", heavy: "spriteHeavy",
      };
      for (const [key, poolName] of Object.entries(spritePoolNames)) {
        const pool = T.vfx.pools[poolName];
        const image = pool.material.uniforms.uSpriteMap.value.image;
        explosionSpritePools[key] = {
          frames: pool.material.uniforms.uSpriteFrames.value,
          grid: pool.material.uniforms.uSpriteGrid.value.toArray(),
          width: image?.width || 0,
          height: image?.height || 0,
          spawned: pool.cursor,
        };
      }
      const explosionSpriteRouting = {
        smallLow: T.vfx.SelectExplosionSpriteVariant(4, 0.1),
        smallHigh: T.vfx.SelectExplosionSpriteVariant(4, 0.9),
        mediumLow: T.vfx.SelectExplosionSpriteVariant(7, 0.1),
        mediumHigh: T.vfx.SelectExplosionSpriteVariant(7, 0.9),
        heavyLow: T.vfx.SelectExplosionSpriteVariant(15, 0.1),
        heavyHigh: T.vfx.SelectExplosionSpriteVariant(15, 0.9),
      };
      const authoredSourcePools = {};
      for (const poolName of ["sourceSmoke", "sourceFire", "sourceGroundFire"]) {
        const pool = T.vfx.pools[poolName];
        authoredSourcePools[poolName] = {
          masked: "SHAPE_MASKED" in pool.material.defines,
          fire: "MASKED_FIRE" in pool.material.defines,
          width: pool.material.uniforms.uMaskMap.value.image?.width || 0,
          noiseWrap: pool.material.uniforms.uMaskNoiseMap.value.wrapS,
          spawned: pool.cursor,
        };
      }

      // 深度法线预通道的**天空判据**：w = 线性视深度，0 = 这一路没打到东西。
      // 事故：天空穹的 allowOverride = false 只保证"不被换材质"，它照样会用
      // 自己那套着色器画进这一趟，把不透明度 1.0 写成 w —— 整片天空于是变成
      // "一米外有实体"。后果是天空前的烟被软粒子整片抹掉（(1−186)/0.45 → 0）、
      // 大气透视也补不上，二百米外的黑烟柱在天上留下一个越长越大的黑洞。
      // 这里直接从靶上取证：只看 alpha 的半浮点位模式是不是 0，不必解码。
      const nd = T.post.targets.normalDepth;
      const raw = new Uint16Array(nd.width * nd.height * 4);
      T.renderer.readRenderTargetPixels(nd, 0, 0, nd.width, nd.height, raw);
      let skyTexels = 0, geoTexels = 0;
      for (let i = 3; i < raw.length; i += 4) {
        if (raw[i] === 0) skyTexels += 1; else geoTexels += 1;
      }

      const probe = document.createElement("canvas");
      probe.width = 64; probe.height = 36;
      const ctx = probe.getContext("2d");
      ctx.drawImage(T.renderer.domElement, 0, 0, 64, 36);
      const data = ctx.getImageData(0, 0, 64, 36).data;
      let min = 255, max = 0;
      const tones = new Set();
      for (let i = 0; i < data.length; i += 4) {
        const v = (data[i] + data[i + 1] + data[i + 2]) / 3;
        if (v < min) min = v;
        if (v > max) max = v;
        tones.add(Math.round(v / 8));
      }
      const level = T.Debug.Level ? T.Debug.Level().id : "?";
      return {
        glError,
        glErrorAfterVfx,
        spread: max - min,
        tones: tones.size,
        programs: T.renderer.info.programs.length,
        // 环境贴图不是可有可无的装饰：军装背光和金属刀枪都依赖它的 IBL。
        // 少它时整个交战双方会压成黑色，普通的全帧色调统计抓不住这条回归。
        hasEnvironment: T.scene.environment?.isTexture === true,
        geometries: T.renderer.info.memory.geometries,
        soldiers: T.ai ? T.ai.soldiers.length : -1,
        alive: T.ai ? T.ai.aliveCount : -1,
        drawCalls: T.renderer.info.render.calls,
        triangles: T.renderer.info.render.triangles,
        level,
        environment: T.Debug.Environment ? T.Debug.Environment() : null,
        externalProps: T.battlefield?.externalProps || null,
        // 流送稳态：live 是当前在场件数（实例化 batched + 克隆 clones），
        // registered 是全部登记数（碰撞永远全量）
        externalStreaming: T.battlefield?.externalStreamer
          ? T.battlefield.externalStreamer.Stats() : null,
        wallCorridor: level === "L4_Chengqiang" && T.battlefield?.CheckWallCorridor
          ? T.battlefield.CheckWallCorridor() : null,
        sightCorridor: level === "L4_Chengqiang" && T.battlefield?.CheckSightCorridor
          ? T.battlefield.CheckSightCorridor() : null,
        skyTexels,
        geoTexels,
        // 粒子层接没接上预通道与当关的雾：这两条断了，远处的烟就没有大气透视
        vfxDepthValid: T.vfx.shared.uDepthValid.value,
        vfxFogDensity: T.vfx.shared.uFogDensity.value,
        decalOrigin,
        decalPreservesTargetAlpha: decalMaterial.userData.preserveTargetAlpha === true
          && decalMaterial.blendSrcAlpha === 200
          && decalMaterial.blendDstAlpha === 201,
        decalUsesSurfaceClip: decalMaterial.fragmentShader.includes("surfaceTolerance")
          && decalMaterial.fragmentShader.includes("abs(sceneDepth - vViewDepth)"),
        readableIjaMaterials,
        explosionSpritePools,
        explosionSpriteRouting,
        authoredSourcePools,
        loadedVefectsMasks: T.vfx.loadedVefectsMasks.size,
      };
    }, phase);
    await page.evaluate(() => { window.Taierzhuang.renderer.info.autoReset = true; });
  } catch (error) {
    problems.push(`THROW ${String(error).slice(0, 200)}`);
  }

  const bad = [];
  if (problems.length) bad.push(`${problems.length} 个报错`);
  if (!health) bad.push("没拿到健康数据");
  else {
    if (health.glError !== 0) bad.push(`GL 错误 ${health.glError}`);
    if (health.glErrorAfterVfx !== 0) bad.push(`爆炸序列帧 GL 错误 ${health.glErrorAfterVfx}`);
    if (health.loadedVefectsMasks !== 5) bad.push(`Vefects 纹理只载入 ${health.loadedVefectsMasks}/5`);
    const authored = health.authoredSourcePools || {};
    if (!authored.sourceSmoke?.masked || authored.sourceSmoke?.fire
      || !authored.sourceFire?.masked || !authored.sourceFire?.fire
      || !authored.sourceGroundFire?.masked || !authored.sourceGroundFire?.fire
      || Object.values(authored).some((pool) => pool.width <= 1)) {
      bad.push(`Vefects authored pool 接线不完整 ${JSON.stringify(authored)}`);
    }
    // 画面不是纯色：黑屏、只剩天空、只剩雾，三种事故都表现为 spread 极小
    if (health.spread < 8) bad.push(`画面近乎纯色 spread=${health.spread}`);
    // 夜战本来就只有很窄的一段动态，阀值得分档
    const toneFloor = (phase === 3 || phase === 5) ? 5 : 12;
    if (health.tones < toneFloor) bad.push(`色调档位太少 tones=${health.tones}`);
    if (!health.hasEnvironment) bad.push("场景缺少环境贴图（人物与刀枪会变黑）");
    if (health.drawCalls < 12) bad.push(`几乎没画东西 calls=${health.drawCalls}`);
    if (health.triangles < 50000) bad.push(`三角形太少 tris=${health.triangles}`);
    // 性能硬红线（上界）。不能靠隐藏活人与删除尸体把数字压回去。
    if (health.drawCalls > MAX_DRAW_CALLS) {
      bad.push(`draw call 越线 ${health.drawCalls} > ${MAX_DRAW_CALLS}`);
    }
    if (health.triangles > MAX_TRIANGLES) {
      bad.push(`三角形越线 ${(health.triangles / 1e6).toFixed(2)}M > 6.00M`);
    }
    // 预通道的天空判据（见上面取证那一段）。天上看得见天的关，w = 0 的像素
    // 必须有一片；一个都没有就说明又有铺满屏幕的东西把自己写进预通道了。
    if (health.geoTexels === 0) bad.push("预通道是空的");
    if (health.skyTexels === 0) bad.push("预通道里没有 w=0 的天空像素（天空穹又混进预通道了？）");
    if (health.vfxDepthValid !== 1) bad.push("粒子层没接上预通道（远处的烟会没有大气透视）");
    if (!(health.vfxFogDensity > 0)) bad.push(`粒子层的雾没接上 density=${health.vfxFogDensity}`);
    // 生活层必须在实际关卡切片里生成。只查包含对应内容的两关，避免把别关的裁剪
    // 当事故：L0 负责界河村落，L5 负责城内十字街与精细院落。
    if (phase === 0) {
      const outfield = health.environment?.outfield;
      if (!outfield || outfield.villagePropClusters < 1 || outfield.villageProps < 5) {
        bad.push(`村落生活层为空 clusters=${outfield?.villagePropClusters ?? "?"} props=${outfield?.villageProps ?? "?"}`);
      }
      if (!outfield || outfield.banks < 5 || outfield.pits < 25
        || outfield.craters < 35 || outfield.graves < 40 || outfield.trees < 250
        || outfield.villageBuildings < 105) {
        bad.push(`界河战术布设不足 banks=${outfield?.banks ?? "?"} pits=${outfield?.pits ?? "?"}`
          + ` craters=${outfield?.craters ?? "?"} graves=${outfield?.graves ?? "?"}`
          + ` trees=${outfield?.trees ?? "?"} houses=${outfield?.villageBuildings ?? "?"}`);
      }
    }
    if (phase === 5) {
      const city = health.environment?.city;
      if (!city || city.householdProps < 5 || city.streetClusters < 1
        || city.streetProps < 5 || city.roadMarks < 5) {
        bad.push(`城镇生活层不足 household=${city?.householdProps ?? "?"} streetClusters=${city?.streetClusters ?? "?"} streetProps=${city?.streetProps ?? "?"} roadMarks=${city?.roadMarks ?? "?"}`);
      }
    }
    if (phase === 4) {
      const city = health.environment?.city;
      if (!city || city.wallDetails < 80 || city.cornerTowerDetails < 40) {
        bad.push(`城墙细节层不足 wall=${city?.wallDetails ?? "?"} corner=${city?.cornerTowerDetails ?? "?"}`);
      }
      if (!health.wallCorridor?.ok) {
        bad.push(`城墙回廊失联 top=${health.wallCorridor?.topReachableSpan ?? "?"} leak=${health.wallCorridor?.leakSpan ?? "?"}`);
      }
      if (!health.sightCorridor?.ok) {
        bad.push(`西门至十字街通视被挡 blockers=${health.sightCorridor?.blockers?.length ?? "?"}`);
      }
    }
    if (health.decalOrigin.join(",") !== "17,3,-9") bad.push(`贴花仍被物理抬离命中面 ${health.decalOrigin}`);
    if (!health.decalPreservesTargetAlpha) bad.push("贴花混合仍会降低 HDR 目标 alpha");
    if (!health.decalUsesSurfaceClip) bad.push("贴花没有按场景深度裁掉悬空部分");
    if (health.readableIjaMaterials < 2) bad.push(`日军远景辨识材质未接全 count=${health.readableIjaMaterials}`);
    const expectedSprites = {
      legacy: { frames: 16, grid: "4,4", size: 1024 },
      compact: { frames: 25, grid: "5,5", size: 1024 },
      fireball: { frames: 64, grid: "8,8", size: 1024 },
      heavy: { frames: 25, grid: "5,5", size: 2048 },
    };
    for (const [key, expected] of Object.entries(expectedSprites)) {
      const actual = health.explosionSpritePools?.[key];
      if (!actual || actual.frames !== expected.frames || actual.grid.join(",") !== expected.grid
        || actual.width !== expected.size || actual.height !== expected.size) {
        bad.push(`爆炸贴图 ${key} 未按 ${expected.grid}/${expected.frames} 帧加载`
          + ` actual=${actual ? `${actual.grid}/${actual.frames}/${actual.width}x${actual.height}` : "missing"}`);
      }
      if (phase === 0 && !(actual?.spawned > 0)) bad.push(`爆炸贴图 ${key} 未真正生成实例`);
    }
    const expectedRouting = {
      smallLow: "legacy", smallHigh: "compact",
      mediumLow: "compact", mediumHigh: "fireball",
      heavyLow: "fireball", heavyHigh: "heavy",
    };
    for (const [probe, expected] of Object.entries(expectedRouting)) {
      if (health.explosionSpriteRouting?.[probe] !== expected) {
        bad.push(`爆炸威力分档 ${probe}=${health.explosionSpriteRouting?.[probe] ?? "missing"} expected=${expected}`);
      }
    }
    // 期望值从模块自己算（按关写死那几组 + 按 bounds 过滤的城内每户布设），
    // 不再手抄一张会漂移的常数表。
    const expectedExternalProps = await page.evaluate(async (phaseIndex) => {
      const [{ ExternalPropCount }, { PHASES }] = await Promise.all([
        import("./Script_ExternalProps.mjs"), import("./Data_Battle.mjs"),
      ]);
      const p = PHASES[phaseIndex];
      return ExternalPropCount(p.id, p.bounds);
    }, phase);
    if (!health.externalProps || health.externalProps.count !== expectedExternalProps
      || health.externalProps.failed?.length) {
      bad.push(`外部布设未完整接入 count=${health.externalProps?.count ?? "?"}`
        + ` expected=${expectedExternalProps} failed=${health.externalProps?.failed?.join(",") || "none"}`);
    }
    // 流送自洽（实例化语义，2026-08-26）：登记数必须等于摆位数，live 不得超过
    // 登记数；live = 实例化件(batched) + 克隆件(clones)，桶里的实例总数必须
    // 等于 live 实例化件摊开的 parts 数，且容量预留不许被打穿（overflow=0）。
    // live 可以为 0（如一·西关带的摆位离出生点七百米），不做下限断言。
    if (health.externalProps?.count > 0) {
      const s = health.externalStreaming;
      const batchOk = s && s.clones + s.batched === s.live
        && (!s.batch || (s.batch.instances === s.parts && s.batch.overflow === 0));
      if (!s || s.registered !== health.externalProps.count || s.live > s.registered || !batchOk) {
        bad.push(`流送不自洽 registered=${s?.registered ?? "?"} live=${s?.live ?? "?"}`
          + ` batched=${s?.batched ?? "?"} clones=${s?.clones ?? "?"}`
          + ` instances=${s?.batch?.instances ?? "?"} parts=${s?.parts ?? "?"}`
          + ` overflow=${s?.batch?.overflow ?? "?"} count=${health.externalProps.count}`);
      }
    }
  }
  const ok = bad.length === 0;
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} phase=${phase} `
    + (health
      ? `${String(health.level).padEnd(14)} spread=${health.spread} tones=${health.tones} calls=${health.drawCalls} `
        + `tris=${(health.triangles / 1000).toFixed(0)}k programs=${health.programs} alive=${health.alive} `
        + `sky=${(health.skyTexels / (health.skyTexels + health.geoTexels) * 100).toFixed(0)}%`
        + (phase === 0 ? ` villageProps=${health.environment?.outfield?.villageProps ?? "?"}` : "")
        + (phase === 4 ? ` wallDetails=${health.environment?.city?.wallDetails ?? "?"}`
          + ` cornerDetails=${health.environment?.city?.cornerTowerDetails ?? "?"}`
          + ` wallTop=${health.wallCorridor?.topReachableSpan ?? "?"}m`
          + ` leak=${health.wallCorridor?.leakSpan ?? "?"}m` : "")
        + (phase === 5 ? ` streetProps=${health.environment?.city?.streetProps ?? "?"}`
          + ` householdProps=${health.environment?.city?.householdProps ?? "?"}`
          + ` roadMarks=${health.environment?.city?.roadMarks ?? "?"}` : "")
      : "(no health)")
    + (bad.length ? `  << ${bad.join("; ")}` : ""));
  for (const p of problems.slice(0, 4)) console.log(`       ${p}`);
}

await browser.close();
server.close();
console.log(failed === 0 ? "\n开机冒烟全过。" : `\n开机冒烟失败：${failed} 关有问题。`);
process.exit(failed === 0 ? 0 : 1);
