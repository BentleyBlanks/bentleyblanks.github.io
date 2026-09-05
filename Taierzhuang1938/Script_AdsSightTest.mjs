// 开镜视野体检：从 WEAPONS 枚举全部枪，验证真实前准星/照门、直视遮挡与最终画面。
// 现行像素闸把第一人称网格临时标红再计数，避免明亮钢件漏检或正片爆炸暗帧误报；截图前恢复原材质。
//
// 为什么要单独一条：`Script_FixedCenterAimTest` 一直是绿的，因为它只验
// "sight 挂点投影到屏幕正中" —— 而那是 ADS 姿态**解出来的**，它必然为零，
// 等于在验一条恒等式。挂点本身摆错了地方（摆进机匣里、摆在弹匣正下方），
// 那条断言一个字都不会响。用户报的「有的枪右键放大有东西挡住准心」就是这么漏掉的。
//
// 这里改成量画面：抬头对着均匀天光开镜，数屏幕正中 41×41 像素里有多少是"暗的"。
// 天是亮的、枪是暗的，所以这个数就是"瞄准点被枪身糊住了多少"。闸门只看**上半窗**，
// 理由见 BLOCKED_LIMIT。2026-08-25 修之前的上半窗实测（820 是满值）：
// 捷克式 **820（整窗 1681 全糊死，端起来什么都看不见）** / 驳壳枪 **820** /
// 中正式 149 / 汉阳造 0 / 三八式 0。
//
// **必须等姿态收敛再量。** 换枪 + 开镜 + 抬头之后枪还在往位置上收，头几帧读到的是
// 半路上的画面（实测连续四帧 423 / 359 / 322 / 0）。第一版量早了，据此误判汉阳造与
// 三八式也要抬挂点，白改了两支枪。所以这里推 420 帧再连量六帧、取最坏的一帧。
//
// 用法：node Taierzhuang1938/Script_AdsSightTest.mjs [--only=Zb26,HanYang]
// 靶场：追加 --range --range-target=S10（10m）或 S200（200m），输出正片/局部/实体mask对照。

import fs from "node:fs/promises";
import { WEAPONS } from "./Data_Weapons.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

/**
 * 量的是**瞄准点上方那半个窗口**（41×20 = 820 像素）里有多少像素是枪。
 *
 * 为什么不是整个 41×41：准星、准星座、抱箍本来就在瞄准线**下面**，
 * 那是一副正常的照门/准星画面（捷克式修好之后准星尖正落在瞄准点上，
 * 底下那条托臂就吃掉整窗的 20%）。真正的病是"抬眼看出去是一堵钢"，
 * 而那种情况上半窗必然一起黑。改前实测上半窗：中正式 820/820 全黑。
 */
const BLOCKED_LIMIT = 60;

/**
 * 第二条闸：**枪必须骑在瞄准线上**（2026-08-26 加）。
 *
 * 上面那条只量瞄准线**以上**那半个窗口，于是一支整个挂在瞄准点**左边**的枪，
 * 窗口里干干净净，它读成满分 —— 汉阳造与三八式在那条闸上一直是 0/820，
 * 正因为枪压根不在画面正中。用户报的「放大以后枪靠左」就是这么漏过去的。
 *
 * 这里量的是**枪自己的对称面投影到画面哪里**：取枪口前 5% 那段钢件
 * （只有枪管、准星与前箍，严格绕膛线轴对称）x 跨度的中点，投到 NDC。
 * 排除刺刀 —— 刺刀是按 muzzle 挂点摆的，把它算进来等于拿挂点验挂点。
 *
 * 期望值逐枪登记而不是"放宽容差"：捷克式是唯一该偏的一支（弹匣占着正上方，
 * 瞄具史实左偏，见 docs/Data_GunFeelReview.md），其余五支必须落在瞄准线上。
 */
const AXIS_TOLERANCE = 0.020;                        // NDC，1600 宽上约 16 px
const AXIS_EXPECT = {
  // 2026-08-26 实测（依次）：0.0004 / 0.0002 / 0.0000 / 0.0000 / 0.0000 —— 对称面就压在瞄准线上。
  ZhongZheng: 0, HanYang: 0, Type38: 0, ServicePistol: 0,
  Type11: 0, Type92Hmg: 0,
  // 捷克式的瞄具史实左偏，枪身因此必须落在瞄准点**右边**：实测 +0.032。
  // 这不是容差放宽 —— 它偏得比容差多得多，写 0 一样会红。
  Zb26: 0.032,
};
// 手枪也在里面。ServicePistol 也走模型第一人称（MODEL_FP），第四关是它当副武器，
// 玩家会右键把它举到眼前 —— 换了几何就得重量一次瞄准线，这是这条闸的原话。
const ALL_GUNS = Object.values(WEAPONS).filter((weapon) => weapon.ammo && weapon.magazine).map((weapon) => weapon.id);
const onlyId = process.argv.slice(2).find((arg) => arg.startsWith("--only="))?.slice(7);
const GUNS = onlyId ? onlyId.split(",") : ALL_GUNS;
const rangeMode = process.argv.includes("--range");
const rangeTarget = process.argv.find((arg) => arg.startsWith("--range-target="))?.slice(15) || "S10";
const outputName = process.argv.find((arg) => arg.startsWith("--output="))?.slice(9);
if (outputName && !/^[A-Za-z0-9_]+$/.test(outputName)) throw new Error(`非法输出目录：${outputName}`);
if (onlyId && GUNS.some((id) => !ALL_GUNS.includes(id))) {
  throw new Error(`未知武器：${onlyId}`);
}

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: rangeMode ? 1440 : 1600, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

let failed = 0;
function Check(name, ok, detail = "") {
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

try {
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&manual=1&phase=2&quality=medium&scale=small${rangeMode ? "&weapons=1" : ""}`,
    { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang?.state?.ready, null, { timeout: 240000 });

  const report = {};
  const screenshotDir = path.join(projectDir, "_shots", outputName
    || (rangeMode ? `AdsSightRange_${rangeTarget}` : "AdsSightRepaired"));
  await fs.mkdir(screenshotDir, { recursive: true });
  for (const gun of GUNS) {
    Object.assign(report, await page.evaluate(async ({guns, rangeTarget}) => {
      const THREE = await import("./vendor/three/build/three.module.js");
      const T = window.Taierzhuang;
      const halfWidth = innerWidth / 2, halfHeight = innerHeight / 2;
      const Step = (frames) => T.StepFrames(frames, 1 / 60, false);
      T.player.health = 100;
      T.player.spawnGrace = 99;
      T.state.spawnAccumulator = -1e6;                 // 别在量的中途补兵
      for (const s of (T.Debug.WeaponRange ? [] : T.ai.soldiers)) {
        s.position.x += 900;
        s.body?.Teleport(s.position.x, s.position.y, s.position.z);
      }
      Step(120);

      /**
       * 屏幕正中 41×41 里有多少像素是"暗的"。
       * 先推一帧再读回：绘制缓冲在同一个任务里还没被合成器清掉。
       */
      const maskMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, toneMapped: false });
      const Blocked = () => {
        const swapped = [];
        T.viewmodel.root.traverse((mesh) => {
          if (!mesh.isMesh) return;
          swapped.push([mesh, mesh.material]);
          mesh.material = maskMaterial;
        });
        T.post.hasTaaHistory = false;
        T.StepFrames(1);
        const src = document.querySelector("canvas#view");
        const c = document.createElement("canvas");
        c.width = 41;
        c.height = 41;
        const g = c.getContext("2d");
        g.drawImage(src, Math.round(src.width / 2) - 20, Math.round(src.height / 2) - 20,
          41, 41, 0, 0, 41, 41);
        const d = g.getImageData(0, 0, 41, 41).data;
        let upper = 0, all = 0;
        for (let row = 0; row < 41; row += 1) {
          for (let col = 0; col < 41; col += 1) {
            const i = (row * 41 + col) * 4;
            if (!(d[i] > 60 && d[i] - d[i + 1] > 40 && d[i] - d[i + 2] > 40)) continue;
            all += 1;
            if (row < 20) upper += 1;                  // 第 20 行是瞄准点所在那一行
          }
        }
        for (const [mesh, material] of swapped) mesh.material = material;
        T.post.hasTaaHistory = false;
        T.StepFrames(1);
        return { upper, all };
      };

      const rows = {};
      for (const id of guns) {
        document.dispatchEvent(new MouseEvent("mouseup", { button: 2, bubbles: true }));
        Step(20);
        if (T.player.stance !== "stand") { T.Debug.Key("KeyZ"); Step(60); }
        // 走真实换枪路径：currentWeapon、弹仓、视图模型、ADS 的 FOV 缩放一起换。
        T.interact.hooks.TakeWeapon(id, 5);
        Step(120);
        // 架式武器（捷克式）不架两脚架不许开镜 —— 先趴下再按 T。
        if (!T.Debug.WeaponRange && T.viewmodel.weapon?.bipod && !T.player.bipod) {
          T.Debug.Key("KeyZ"); Step(80);
          T.Debug.Key("KeyT"); Step(90);
        }
        document.dispatchEvent(new MouseEvent("mousedown", { button: 2, bubbles: true }));
        // 架起两脚架后俯仰中心更低；同样的 0.30 只会看见暗墙，背景本身就被误数成枪。
        T.player.pitch = T.viewmodel.weapon?.bipod ? 0.75 : 0.30;
        if (T.Debug.WeaponRange) {
          T.Debug.WeaponRange.GoTo("firing");
          if (!T.Debug.WeaponRange.AimAt(rangeTarget)) throw new Error(`靶场目标不存在：${rangeTarget}`);
        }
        T.player.aimPitch = 0;
        // 两脚架姿态还要把趴姿相机与枪架阻尼一起收敛；420 帧后的第一张仍会扫到墙沿，
        // 后五张才全是天光。多给 120 帧，避免把暗墙当成枪身。
        Step(T.viewmodel.weapon?.bipod ? 540 : 420);
        T.post.hasTaaHistory = false;
        T.StepFrames(24); // settle the temporal image history only for the measured pose
        // 连量六帧、每帧之间隔开推进：开镜姿态收敛之后枪仍在微微摇（呼吸摆动只被压小
        // 没被压死），只取一帧就可能正好赶在摆动的一端读出假的"干净"。取最坏那一帧。
        const shots = [];
        for (let k = 0; k < 6; k += 1) {
          shots.push(Blocked());
          Step(22);
        }
        const first = shots.reduce((a, b) => (a.upper >= b.upper ? a : b));
        const second = shots.reduce((a, b) => (a.upper <= b.upper ? a : b));
        const vm = T.viewmodel;

        // 枪的对称面在画面上的位置。走真几何（顶点），不走挂点 —— 挂点是解出来的。
        const AxisNdc = () => {
          const rig = vm.rig;
          if (!rig || !rig.group) return null;
          const cam = T.camera;
          const Vec3 = cam.position.constructor;
          cam.updateMatrixWorld(true);
          rig.group.updateWorldMatrix(true, true);
          const steel = [];
          let zLo = Infinity, zHi = -Infinity;
          rig.group.traverse((o) => {
            if (!o.isMesh || !o.visible || !o.geometry || !o.geometry.attributes.position) return;
            const name = o.name || "";
            if (name.indexOf("Bayonet") === 0) return;
            // Imported source material buckets also participate in muzzle-axis sampling.
            if (name.indexOf("steel") < 0 && name.indexOf("lq") < 0) return;
            const pos = o.geometry.attributes.position;
            const v = new Vec3();
            const pts = [];
            for (let i = 0; i < pos.count; i += 1) {
              v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).applyMatrix4(cam.matrixWorldInverse);
              pts.push(v.x); pts.push(v.z);
              if (v.z < zLo) zLo = v.z;
              if (v.z > zHi) zHi = v.z;
            }
            steel.push(pts);
          });
          if (!steel.length || !isFinite(zLo)) return null;
          const cut = zLo + (zHi - zLo) * 0.05;         // 相机空间 -z 向前，最小的 z 就是枪口
          let xLo = Infinity, xHi = -Infinity, n = 0;
          for (const pts of steel) {
            for (let i = 0; i < pts.length; i += 2) {
              if (pts[i + 1] > cut) continue;
              n += 1;
              if (pts[i] < xLo) xLo = pts[i];
              if (pts[i] > xHi) xHi = pts[i];
            }
          }
          if (n < 24) return null;
          // 相机空间 → NDC。Vector3.applyMatrix4 自带透视除法，别再除一次 w。
          const mid = new Vec3(0.5 * (xLo + xHi), 0, cut).applyMatrix4(cam.projectionMatrix);
          return { ndcX: mid.x, camX: 0.5 * (xLo + xHi), verts: n };
        };
        const axis = AxisNdc();
        const physicalFront = [];
        const region = vm.rig.ironSights?.frontRegion;
        if (region) {
          const Vec3 = T.camera.position.constructor;
          for (const mesh of vm.rig.ironSights.front) {
            const pos = mesh.geometry.attributes.position;
            const samples = [];
            let top = -Infinity;
            for (let i = 0; i < pos.count; i += 1) {
              if (mesh.name === "VmIronSight_FrontBlade"
                || (Math.abs(pos.getX(i) - region.x) <= 0.004
                  && Math.abs(pos.getZ(i) - region.z) <= 0.016 && pos.getY(i) > region.base)) {
                const v = new Vec3().fromBufferAttribute(pos, i);
                if (v.y > top) top = v.y;
                samples.push(v);
              }
            }
            for (const v of samples) if (v.y >= top - 0.00005) {
              v.applyMatrix4(mesh.matrixWorld).project(T.camera);
              physicalFront.push({ x: v.x * halfWidth, y: -v.y * halfHeight });
            }
          }
        }
        const tip = physicalFront.length ? {
          x: (Math.min(...physicalFront.map((v) => v.x)) + Math.max(...physicalFront.map((v) => v.x))) / 2,
          y: (Math.min(...physicalFront.map((v) => v.y)) + Math.max(...physicalFront.map((v) => v.y))) / 2,
          vertices: physicalFront.length,
        } : null;
        const ray = new THREE.Raycaster();
        ray.layers.enableAll();
        ray.near = T.camera.near;
        const obstruction = [];
        const Visible = (node) => {
          for (let cursor = node; cursor; cursor = cursor.parent) if (!cursor.visible) return false;
          return true;
        };
        // Independent occlusion check sees real triangles, including fingers and
        // receiver faces, even when bright sky makes the steel pass a luma test.
        for (const x of [-8, -4, 0, 4, 8]) for (const y of [2, 5, 10, 18]) {
          ray.setFromCamera(new THREE.Vector2(x / halfWidth, y / halfHeight), T.camera);
          const hit = ray.intersectObject(vm.root, true).find((hit) => Visible(hit.object));
          if (hit) obstruction.push({ x, y, name: hit.object.name });
        }
        let frontHit = null;
        let frontHitLocal = null;
        let frontVisible = false;
        // Thin or bevelled crowns can be subpixel at this eye relief. Sample a
        // two-pixel neighbourhood, always checking the nearest visible triangle.
        for (const px of [0, -1, 1]) for (const py of [0.5, 1, 2, 3]) {
          ray.setFromCamera(new THREE.Vector2(px / halfWidth, -py / halfHeight), T.camera);
          const hit = ray.intersectObject(vm.root, true).find((hit) => Visible(hit.object));
          const local = hit ? vm.rig.group.worldToLocal(hit.point.clone()) : null;
          if (local && region && Math.abs(local.z - region.z) < 0.035) {
            frontHit = hit; frontHitLocal = local; frontVisible = true;
          }
        }
        const rearTops = (vm.rig.ironSights?.rear || []).map((mesh) => {
          const pos = mesh.geometry.attributes.position;
          let top = -Infinity;
          for (let i = 0; i < pos.count; i += 1) top = Math.max(top, pos.getY(i));
          const point = new THREE.Vector3(0, top, 0).applyMatrix4(mesh.matrixWorld).project(T.camera);
          return { x: point.x * halfWidth, y: -point.y * halfHeight };
        });
        rows[id] = {
          frontVisible, frontHit: frontHitLocal && { name: frontHit.object.name, z: frontHitLocal.z },
          rearTops,
          obstruction,
          physicalFront: tip,
          ads: Number(T.player.ads.toFixed(3)),
          diagnostic: {
            grounded: T.player.grounded, stance: T.player.stance, pitch: T.player.pitch,
            statePos: vm.statePivot.position.toArray(), stateRot: vm.statePivot.rotation.toArray(),
            rootRot: vm.root.rotation.toArray(), weaponPos: vm.weaponMount.position.toArray(),
            weaponRot: vm.weaponMount.rotation.toArray(), action: vm.action,
          },
          blocked: first.upper,                        // 四帧里最坏的一帧
          samples: shots.map((x) => x.upper),
          wholeWindow: shots.map((x) => x.all),
          sight: vm.rig?.sight
            ? { x: +vm.rig.sight.x.toFixed(3), y: +vm.rig.sight.y.toFixed(3), z: +vm.rig.sight.z.toFixed(3) }
            : null,
          crosshairOn: document.querySelector(".hudCrosshair").classList.contains("on"),
          axisNdcX: axis ? +axis.ndcX.toFixed(4) : null,
          axisCamX: axis ? +axis.camX.toFixed(5) : null,
          axisVerts: axis ? axis.verts : 0,
          nearDof: {
            strength: T.post.uniformsComposite.uNearDofStrength.value,
            focus: T.post.uniformsComposite.uNearDofFocus.value,
            range: T.post.uniformsComposite.uNearDofRange.value,
            maxPx: T.post.uniformsComposite.uNearDofMaxPx.value,
          },
        };
      }
      maskMaterial.dispose();
      return rows;
    }, {guns:[gun], rangeTarget}));
    await page.screenshot({ path: path.join(screenshotDir, `Scene_${gun}Ads.png`) });
    await page.screenshot({ path: path.join(screenshotDir, `Scene_${gun}Sight.png`), clip: { x: rangeMode ? 480 : 560, y: 330, width: 480, height: 300 } });
    if (rangeMode) {
      await page.evaluate(async () => {
        const THREE = await import("./vendor/three/build/three.module.js");
        const T = window.Taierzhuang;
        T.viewmodel.root.traverse((mesh) => { if (mesh.isMesh) { mesh.userData.adsSavedMaterial = mesh.material; mesh.material = new THREE.MeshBasicMaterial({color:0xff0000,toneMapped:false}); } });
        T.post.hasTaaHistory = false; T.StepFrames(1);
      });
      await page.screenshot({path:path.join(screenshotDir, `Scene_${gun}Mask.png`)});
      await page.evaluate(() => {
        const T = window.Taierzhuang;
        T.viewmodel.root.traverse((mesh) => {
          if (!mesh.userData.adsSavedMaterial) return;
          mesh.material.dispose();
          mesh.material = mesh.userData.adsSavedMaterial;
          delete mesh.userData.adsSavedMaterial;
        });
        T.post.hasTaaHistory = false;
        T.StepFrames(1);
      });
    }
    console.log(gun, JSON.stringify(report[gun]));
  }

  const screenshotPath = path.join(screenshotDir, "Scene_LastAds.png");
  await page.screenshot({ path: screenshotPath });
  const releasedNearDof = await page.evaluate(() => {
    const T = window.Taierzhuang;
    document.dispatchEvent(new MouseEvent("mouseup", { button: 2, bubbles: true }));
    T.StepFrames(20, 1 / 60, false);
    T.StepFrames(1);
    return T.post.uniformsComposite.uNearDofStrength.value;
  });
  await fs.writeFile(path.join(screenshotDir, "Data_AdsSightReport.json"), JSON.stringify({ ...report, releasedNearDof, screenshotPath, errors }, null, 2));
  console.log(JSON.stringify({ ...report, releasedNearDof, screenshotPath, errors }, null, 2));

  for (const id of GUNS) {
    const row = report[id];
    Check(`${id} 前准星真实可见而非被近处枪身遮住`, row?.frontVisible, JSON.stringify(row?.frontHit));
    Check(`${id} 实体照门两肩同高且缺口居中`, row?.rearTops?.length === 2
      && row.rearTops.every((point) => Math.abs(point.y) < 2)
      && Math.abs(row.rearTops[0].x + row.rearTops[1].x) < 2
      && row.rearTops[0].x < -2 && row.rearTops[1].x > 2, JSON.stringify(row?.rearTops));
    Check(`${id} 瞄准线上方真实几何无遮挡`, row?.obstruction?.length === 0, JSON.stringify(row?.obstruction));
    Check(`${id} 实体前准星尖对齐弹道中心（≤ 2px）`, row?.physicalFront && Math.hypot(row.physicalFront.x, row.physicalFront.y) <= 2, JSON.stringify(row?.physicalFront));
    Check(`${id} 开镜到位`, row && row.ads > 0.9, `ads=${row?.ads}`);
    Check(`${id} 瞄准点上方没有被枪身糊住（≤ ${BLOCKED_LIMIT}/820）`,
      row && row.blocked <= BLOCKED_LIMIT,
      `上半窗 ${row?.samples?.join(" / ")}（整窗 ${row?.wholeWindow?.join(" / ")}）`);
    Check(`${id} 开镜时收起腰射准心`, row && row.crosshairOn === false);
    Check(`${id} 开镜景深符合场景设置`, row && (rangeMode ? row.nearDof.strength === 0 : row.nearDof.strength > 0.5 && row.nearDof.strength < 0.8) && row.nearDof.focus > row.nearDof.range
      && row.nearDof.maxPx >= 3 && row.nearDof.maxPx <= 6,
    row ? `strength=${row.nearDof.strength.toFixed(2)} focus=${row.nearDof.focus.toFixed(2)}m max=${row.nearDof.maxPx.toFixed(1)}px` : "无结果");
    const expect = AXIS_EXPECT[id];
    if (expect === null || expect === undefined) {
      console.log(`--   ${id} 枪骑在瞄准线上（未登记期望值） — 实测对称面 NDC x=${row?.axisNdcX}`);
    } else {
      Check(`${id} 枪骑在瞄准线上（对称面 NDC x = ${expect} ± ${AXIS_TOLERANCE}）`,
        row && row.axisNdcX != null && Math.abs(row.axisNdcX - expect) <= AXIS_TOLERANCE,
        `实测 ${row?.axisNdcX}（相机空间 ${row?.axisCamX} m，取样 ${row?.axisVerts} 顶点）`);
    }
  }
  Check("退镜关闭近景景深", releasedNearDof < 0.001,
    `strength=${releasedNearDof}`);
  Check("页面无运行时错误", errors.length === 0, errors.slice(0, 2).join(" | "));
} finally {
  await browser.close();
  server.close();
}

if (failed) {
  console.error(`\n开镜视野体检失败：${failed} 项。`);
  process.exit(1);
}
console.log("\n开镜视野体检全过。");
