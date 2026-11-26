import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

// Real-engine visual & functional verification of first-person blade blood staining,
// 3D pendant dripping, ballistic world drops + ground decals, centrifugal swing-fling,
// coagulation drying, weapon-switch persistence, bayonet independence, and sampler budget.

const project = path.dirname(fileURLToPath(import.meta.url));
const shotsDir = path.join(project, "_shots", "BladeBlood");
const saveShots = process.argv.includes("--shots") || true;

const server = await ServeRoot(path.resolve(project, ".."), 0);
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error" && !/fonts|ERR_BLOCKED_BY_CLIENT/.test(message.text())) {
    errors.push(message.text());
  }
});

async function Capture(name) {
  if (!saveShots) return;
  fs.mkdirSync(shotsDir, { recursive: true });
  await page.screenshot({ path: path.join(shotsDir, name) });
}

try {
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort("blockedbyclient"));
  await page.goto(
    `http://127.0.0.1:${server.address().port}/Taierzhuang1938/?shot=1&manual=1&melee=1&quality=high&scale=small`,
    { waitUntil: "load", timeout: 120000 },
  );
  await page.waitForFunction(
    () => window.Taierzhuang?.state?.ready
      && window.Taierzhuang?.state?.running
      && window.Taierzhuang?.Debug?.MeleeCombat
      && window.Taierzhuang?.Debug?.BladeBlood?.State?.()?.textureReady === true,
    null,
    { timeout: 120000 },
  );

  // Hide melee lab overlay for crisp visual captures.
  const hideOverlay = () => page.evaluate(() => {
    for (const el of document.querySelectorAll(".meleeLab, .meleeLabPanel, .meleeLabBanner")) {
      el.style.display = "none";
    }
  });
  await hideOverlay();

  // 1. Baseline clean Dadao before any strike.
  const cleanInfo = await page.evaluate(() => {
    const T = Taierzhuang;
    const lab = T.Debug.MeleeCombat;
    const Step = (s, render = false) => T.StepFrames(Math.round(s * 60), 1 / 60, render);
    lab.Select("DadaoOne");
    lab.Pause(true);
    Step(0.35, true);
    const enemy = T.ai.soldiers.find((s) => s.side === "ija");
    if (enemy) {
      enemy.position.set(T.player.position.x, T.player.position.y, T.player.position.z - 4.2);
      enemy.body?.Teleport(enemy.position.x, enemy.position.y, enemy.position.z);
    }
    Step(0.15, true);
    return {
      blood: T.Debug.BladeBlood.State(),
      weapon: T.viewmodel.weaponId,
      glError: T.renderer.getContext().getError(),
    };
  });
  assert.equal(cleanInfo.weapon, "Dadao");
  assert.equal(cleanInfo.blood.coverage, 0, "fresh Dadao must start completely clean");
  assert.equal(cleanInfo.blood.visiblePendants, 0, "clean Dadao must show zero pendant drops");
  assert.equal(cleanInfo.blood.textureReady, true, "Texture_BladeBloodDetail.webp must load");
  assert.equal(cleanInfo.glError, 0, "clean baseline GL error");
  await Capture("01_CleanDadao.png");

  // Helper to sample actual rendered PNG pixels inside the Dadao blade's projected screen rect.
  const sampleBladeCrimsonFromPng = async (pngName) => {
    const rect = await page.evaluate(() => {
      const T = Taierzhuang;
      const w = 1280, h = 720;
      const mesh = T.viewmodel?.bladeBlood?.active?.anchorMesh;
      if (!mesh) return [0, 0, 1, 1];
      T.camera.updateMatrixWorld(true);
      mesh.updateWorldMatrix(true, false);
      const posAttr = mesh.geometry?.attributes?.position;
      let minX = w, maxX = 0, minY = h, maxY = 0;
      const v = T.viewmodel._tmpVec;
      const step = Math.max(1, Math.floor((posAttr?.count || 1) / 300));
      for (let i = 0; i < (posAttr?.count || 0); i += step) {
        v.fromBufferAttribute(posAttr, i).applyMatrix4(mesh.matrixWorld).project(T.camera);
        if (v.z < -1 || v.z > 1) continue;
        const sx = Math.round((v.x * 0.5 + 0.5) * w);
        const sy = Math.round((1 - (v.y * 0.5 + 0.5)) * h);
        if (sx >= 0 && sx < w && sy >= 0 && sy < h) {
          if (sx < minX) minX = sx;
          if (sx > maxX) maxX = sx;
          if (sy < minY) minY = sy;
          if (sy > maxY) maxY = sy;
        }
      }
      const rx = Math.max(0, minX), ry = Math.max(0, minY);
      const rw = Math.max(1, Math.min(w - rx, maxX - rx + 1));
      const rh = Math.max(1, Math.min(h - ry, maxY - ry + 1));
      return [rx, ry, rw, rh];
    });
    const { data, info } = await sharp(path.join(shotsDir, pngName))
      .extract({ left: rect[0], top: rect[1], width: rect[2], height: rect[3] })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const ch = info.channels;
    let samples = 0, crimsonPx = 0, redExcessSum = 0;
    for (let i = 0; i < data.length; i += ch) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      samples += 1;
      redExcessSum += r - Math.max(g, b);
      if (r >= 28 && r > g * 1.45 && r > b * 1.45) crimsonPx += 1;
    }
    return { rect, samples, crimsonPx, avgRedExcess: samples ? redExcessSum / samples : 0 };
  };

  const cleanPixels = await sampleBladeCrimsonFromPng("01_CleanDadao.png");

  // 2. Real mouse slash hit on live enemy (non-lethal cut first so we inspect light cut).
  const afterLight = await page.evaluate(() => {
    const T = Taierzhuang;
    const Step = (s, render = false) => T.StepFrames(Math.round(s * 60), 1 / 60, render);
    const enemy = T.ai.soldiers.find((s) => s.side === "ija");
    enemy.health = 240;
    enemy.position.set(T.player.position.x, T.player.position.y, T.player.position.z - 1.32);
    enemy.yaw = Math.PI;
    enemy.body?.Teleport(enemy.position.x, enemy.position.y, enemy.position.z);
    Step(0.05);
    T.Debug.Mouse(0, true);
    Step(0.05);
    T.Debug.Mouse(0, false);
    Step(0.65, true);
    // Move enemy back slightly so screenshots clearly display the player's blade against daylight backdrop.
    enemy.position.set(T.player.position.x + 1.8, T.player.position.y, T.player.position.z - 4.0);
    enemy.body?.Teleport(enemy.position.x, enemy.position.y, enemy.position.z);
    Step(0.25, true);
    return {
      blood: T.Debug.BladeBlood.State(),
      enemyHp: enemy.health,
      vfxEmitted: T.vfx?.bloodEffects?.stats?.emitted ?? 0,
    };
  });
  assert(afterLight.enemyHp < 240, `real Dadao slash must hit enemy (hp=${afterLight.enemyHp})`);
  assert(afterLight.blood.hitCount >= 1, `hitCount should increase: ${JSON.stringify(afterLight.blood)}`);
  assert(afterLight.blood.coverage > 0.30, `blade coverage should rise on slash: ${afterLight.blood.coverage}`);
  assert(afterLight.blood.edge > 0.45, `blade edge blood should rise: ${afterLight.blood.edge}`);
  assert(afterLight.blood.wetness > 0.70, `fresh blood must be glossy wet: ${afterLight.blood.wetness}`);
  await Capture("02_AfterLightCut.png");
  const lightPixels = await sampleBladeCrimsonFromPng("02_AfterLightCut.png");
  assert(
    lightPixels.crimsonPx > cleanPixels.crimsonPx + 60,
    `rendered blade must visibly turn crimson after slash (clean=${cleanPixels.crimsonPx}, light=${lightPixels.crimsonPx})`,
  );

  // 3. Real lethal heavy kill -> soaked blade, 3D swelling pendant drop & real world dripping + ground decals.
  const heavyDrip = await page.evaluate(() => {
    const T = Taierzhuang;
    const Step = (s, render = false) => T.StepFrames(Math.round(s * 60), 1 / 60, render);
    const enemy = T.ai.soldiers.find((s) => s.side === "ija");
    enemy.health = 35;
    enemy.position.set(T.player.position.x, T.player.position.y, T.player.position.z - 1.32);
    enemy.yaw = Math.PI;
    enemy.body?.Teleport(enemy.position.x, enemy.position.y, enemy.position.z);
    Step(0.05);
    T.Debug.Mouse(0, true);
    Step(0.05);
    T.Debug.Mouse(0, false);
    Step(0.30);
    // Let HUD melee kill screen splash fade so we inspect the blade cleanly, then step to watch dripping.
    const dripsBeforeWindow = T.Debug.BladeBlood.State().dripsEmitted;
    const emittedBefore = T.vfx?.bloodEffects?.stats?.emitted ?? 0;
    const impactsBefore = T.vfx?.bloodEffects?.stats?.impacts ?? 0;
    Step(1.10, true);
    let peakPendants = 0;
    let capturedSwell = false;
    for (let f = 0; f < 240; f += 1) {
      T.StepFrames(1, 1 / 60, false);
      const s = T.Debug.BladeBlood.State();
      if (s.visiblePendants > peakPendants) peakPendants = s.visiblePendants;
      const newDrips = s.dripsEmitted - dripsBeforeWindow;
      const p0 = s.pendants?.[0];
      if (!capturedSwell && newDrips >= 2 && s.visiblePendants >= 1 && p0 && p0.progress >= 0.78 && p0.progress <= 0.93) {
        T.StepFrames(1, 0, true);
        capturedSwell = true;
        break;
      }
    }
    if (!capturedSwell) T.StepFrames(1, 0, true);
    const pendantScreen = T.viewmodel.bladeBlood.pendantMeshes.map((m) => {
      if (!m.visible) return null;
      T.camera.updateMatrixWorld(true);
      m.updateWorldMatrix(true, false);
      const p = T.viewmodel._tmpVec.set(0, -1, 0).applyMatrix4(m.matrixWorld).project(T.camera);
      return {
        x: Math.round((p.x * 0.5 + 0.5) * 1280),
        y: Math.round((1 - (p.y * 0.5 + 0.5)) * 720),
        scale: m.scale.toArray().map((n) => +n.toFixed(5)),
        mat: m.material?.name,
      };
    });
    return {
      enemyAlive: enemy.alive,
      blood: T.Debug.BladeBlood.State(),
      newDrips: T.Debug.BladeBlood.State().dripsEmitted - dripsBeforeWindow,
      peakPendants,
      capturedSwell,
      pendantScreen,
      emittedDelta: (T.vfx?.bloodEffects?.stats?.emitted ?? 0) - emittedBefore,
      impactsDelta: (T.vfx?.bloodEffects?.stats?.impacts ?? 0) - impactsBefore,
      decalsCount: T.vfx?.bloodEffects?.decals?.count ?? 0,
    };
  });
  assert.equal(heavyDrip.enemyAlive, false, "lethal slash must kill enemy");
  assert(heavyDrip.blood.coverage > 0.65, `soaked blade coverage expected > 0.65, got ${heavyDrip.blood.coverage}`);
  assert(heavyDrip.peakPendants >= 1, `3D pendant droplet must become visible (peak=${heavyDrip.peakPendants})`);
  assert(heavyDrip.newDrips >= 2, `new drips during drip window should be >= 2, got ${heavyDrip.newDrips}`);
  assert(heavyDrip.emittedDelta >= 2, `BloodEffects must emit falling world droplets (delta=${heavyDrip.emittedDelta})`);
  await Capture("03_HeavyKillDripping.png");
  if (saveShots) {
    // Save a tight magnified crop of the soaked foreground Dadao blade + hanging 3D pendant teardrops.
    await sharp(path.join(shotsDir, "03_HeavyKillDripping.png"))
      .extract({ left: 680, top: 150, width: 420, height: 520 })
      .toFile(path.join(shotsDir, "03c_DadaoCloseUp.png"));
  }

  // Also pitch camera down slightly to verify ground blood drop decals deposited beneath the dripping blade.
  const groundCheck = await page.evaluate(() => {
    const T = Taierzhuang;
    // Step another 1.8s so falling droplets hit ground & deposit decals.
    T.StepFrames(108, 1 / 60, false);
    const savedPitch = T.player.pitch;
    T.player.pitch = -0.68;
    T.StepFrames(2, 1 / 60, true);
    return {
      savedPitch,
      impacts: T.vfx?.bloodEffects?.stats?.impacts ?? 0,
      decals: T.vfx?.bloodEffects?.decals?.count ?? 0,
      drips: T.Debug.BladeBlood.State().dripsEmitted,
    };
  });
  assert(groundCheck.impacts >= 1, `falling blade droplets must impact ground (impacts=${groundCheck.impacts})`);
  await Capture("03b_GroundBloodDrops.png");
  await page.evaluate((savedPitch) => {
    Taierzhuang.player.pitch = savedPitch;
    Taierzhuang.StepFrames(2, 1 / 60, true);
  }, groundCheck.savedPitch);

  // 4. Centrifugal swing blood-fling while wet: execute a quick slash + flick and verify flingsEmitted rises.
  const flingInfo = await page.evaluate(() => {
    const T = Taierzhuang;
    const before = T.Debug.BladeBlood.State();
    let maxTipSpeed = 0;
    T.Debug.Mouse(0, true);
    T.StepFrames(3, 1 / 60, false);
    T.Debug.Mouse(0, false);
    for (let f = 0; f < 36; f += 1) {
      if (f >= 4 && f <= 16) T.Debug.Look(26, 0);
      T.StepFrames(1, 1 / 60, f === 12);
      const s = T.Debug.BladeBlood.State();
      if (s.tipSpeedMps > maxTipSpeed) maxTipSpeed = s.tipSpeedMps;
    }
    T.StepFrames(1, 1 / 60, true);
    return {
      beforeFlings: before.flingsEmitted,
      after: T.Debug.BladeBlood.State(),
      maxTipSpeed,
    };
  });
  assert(
    flingInfo.after.flingsEmitted > flingInfo.beforeFlings,
    `fast swing on wet blade must fling blood (before=${flingInfo.beforeFlings}, after=${flingInfo.after.flingsEmitted}, peakSpeed=${flingInfo.maxTipSpeed})`,
  );
  await Capture("04_SwingFling.png");

  // 5. Coagulation / drying over ~110 seconds: glossy wet sheen dries to dark oxidized residue, dripping stops.
  const driedInfo = await page.evaluate(() => {
    const T = Taierzhuang;
    // Step 110s at 30 Hz (0.0333s steps) so Viewmodel/BladeBlood simulation advances cleanly.
    T.StepFrames(3300, 1 / 30, false);
    T.StepFrames(2, 1 / 60, true);
    return T.Debug.BladeBlood.State();
  });
  assert(driedInfo.wetness < 0.16, `after 110s blood should dry (wetness=${driedInfo.wetness})`);
  assert(driedInfo.coverage > 0.35, `dried dark blood residue must remain on steel (coverage=${driedInfo.coverage})`);
  assert.equal(driedInfo.visiblePendants, 0, "dried blade must stop forming hanging droplets");
  await Capture("05_DriedCoagulated.png");

  // 6. Weapon switch persistence: switch to rifle (primary slot) and back to Dadao (melee slot).
  const persistInfo = await page.evaluate(() => {
    const T = Taierzhuang;
    const Step = (s, render = false) => T.StepFrames(Math.round(s * 60), 1 / 60, render);
    const beforeCov = T.Debug.BladeBlood.State().coverage;
    const beforeHits = T.Debug.BladeBlood.State().hitCount;
    T.Debug.Key(T.Debug.SlotKey("primary"));
    Step(0.60, true);
    const rifleWeapon = T.viewmodel.weaponId;
    const rifleBlood = T.Debug.BladeBlood.State();
    T.Debug.Key(T.Debug.SlotKey("melee"));
    Step(0.65, true);
    const backWeapon = T.viewmodel.weaponId;
    const backBlood = T.Debug.BladeBlood.State();
    return { beforeCov, beforeHits, rifleWeapon, rifleBlood, backWeapon, backBlood };
  });
  assert.equal(persistInfo.rifleWeapon, "HanYang");
  assert.equal(persistInfo.rifleBlood.coverage, 0, "clean HanYang bayonet must not inherit Dadao blood");
  assert.equal(persistInfo.backWeapon, "Dadao");
  assert.equal(persistInfo.backBlood.hitCount, persistInfo.beforeHits, "Dadao hitCount must persist across switch");
  assert(Math.abs(persistInfo.backBlood.coverage - persistInfo.beforeCov) < 0.03, "Dadao stain must persist across switch");
  await Capture("06_WeaponSwitchPersist.png");

  // 7. Bayonet blood independence: select Bayonet scenario (HanYang + fixed bayonet), thrust enemy & verify stain + drip!
  const bayonetInfo = await page.evaluate(() => {
    const T = Taierzhuang;
    const lab = T.Debug.MeleeCombat;
    const Step = (s, render = false) => T.StepFrames(Math.round(s * 60), 1 / 60, render);
    lab.Select("BayonetOne");
    lab.Pause(true);
    Step(0.35, true);
    const enemy = T.ai.soldiers.find((s) => s.side === "ija");
    enemy.health = 220;
    enemy.position.set(T.player.position.x, T.player.position.y, T.player.position.z - 1.38);
    enemy.yaw = Math.PI;
    enemy.body?.Teleport(enemy.position.x, enemy.position.y, enemy.position.z);
    Step(0.05);
    T.Debug.Mouse(0, true);
    Step(0.05);
    T.Debug.Mouse(0, false);
    Step(0.55);
    // Second thrust for a drenched bayonet blade + dripping.
    T.Debug.Mouse(0, true);
    Step(0.05);
    T.Debug.Mouse(0, false);
    Step(0.65);
    enemy.position.set(T.player.position.x + 2.0, T.player.position.y, T.player.position.z - 4.2);
    enemy.body?.Teleport(enemy.position.x, enemy.position.y, enemy.position.z);
    let peakPendants = 0;
    for (let f = 0; f < 120; f += 1) {
      T.StepFrames(1, 1 / 60, false);
      const s = T.Debug.BladeBlood.State();
      if (s.visiblePendants > peakPendants) peakPendants = s.visiblePendants;
    }
    T.StepFrames(2, 1 / 60, true);
    return {
      weapon: T.viewmodel.weaponId,
      bayonetFixed: T.viewmodel.bayonetFixed,
      blood: T.Debug.BladeBlood.State(),
      peakPendants,
    };
  });
  assert.equal(bayonetInfo.weapon, "HanYang");
  assert.equal(bayonetInfo.bayonetFixed, true);
  assert.equal(bayonetInfo.blood.activeKey, "Bayonet:HanYang");
  assert(bayonetInfo.blood.coverage > 0.35, `bayonet blade should stain after thrusts: ${bayonetInfo.blood.coverage}`);
  assert(bayonetInfo.blood.dripsEmitted >= 1, `bayonet blade should drip: ${bayonetInfo.blood.dripsEmitted}`);
  await Capture("07_BayonetBlood.png");

  // 8. WebGL sampler budget & error audit for all compiled blade-blood programs (Dadao + Bayonet).
  const glAudit = await page.evaluate(() => {
    const T = Taierzhuang;
    const gl = T.renderer.getContext();
    const samplerTypes = new Set([
      gl.SAMPLER_2D, gl.SAMPLER_CUBE, gl.SAMPLER_3D, gl.SAMPLER_2D_ARRAY,
      gl.SAMPLER_2D_SHADOW, gl.SAMPLER_CUBE_SHADOW, gl.SAMPLER_2D_ARRAY_SHADOW,
      gl.INT_SAMPLER_2D, gl.UNSIGNED_INT_SAMPLER_2D,
    ]);
    const bloodPrograms = [];
    for (const p of T.renderer.info.programs || []) {
      const frag = p.fragmentShader ? gl.getShaderSource(p.fragmentShader) : "";
      if (!frag || !frag.includes("uBladeBloodMap")) continue;
      const count = gl.getProgramParameter(p.program, gl.ACTIVE_UNIFORMS) || 0;
      let samplers = 0;
      const names = [];
      for (let i = 0; i < count; i += 1) {
        const info = gl.getActiveUniform(p.program, i);
        if (info && samplerTypes.has(info.type)) {
          samplers += info.size || 1;
          names.push(info.size > 1 ? `${info.name}x${info.size}` : info.name);
        }
      }
      bloodPrograms.push({ name: p.name, samplers, names });
    }
    return {
      glError: gl.getError(),
      maxFragUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
      bloodPrograms,
    };
  });
  assert.equal(glAudit.glError, 0, `WebGL error after blade blood render: ${glAudit.glError}`);
  assert(glAudit.bloodPrograms.length >= 2, `expected compiled Dadao + Bayonet blood programs, got ${JSON.stringify(glAudit.bloodPrograms)}`);
  for (const prog of glAudit.bloodPrograms) {
    assert(
      prog.samplers <= glAudit.maxFragUnits && prog.samplers <= 16,
      `blade blood program exceeded 16 sampler budget: ${JSON.stringify(prog)}`,
    );
  }
  assert.deepEqual(errors, [], `console/page errors: ${errors.join(" | ")}`);

  console.log(
    `PASS BladeBloodBrowserTest: crimsonPx ${cleanPixels.crimsonPx}->${lightPixels.crimsonPx}, `
    + `drips=${heavyDrip.blood.dripsEmitted} (pendants=${heavyDrip.peakPendants}, swell=${heavyDrip.capturedSwell}, screen=${JSON.stringify(heavyDrip.pendantScreen)}, vfx+${heavyDrip.emittedDelta}, decals=${groundCheck.decals}), `
    + `flings=${flingInfo.after.flingsEmitted}, dryWet=${driedInfo.wetness}, `
    + `bayonet=${bayonetInfo.blood.coverage}/${bayonetInfo.blood.dripsEmitted}, `
    + `programs=${glAudit.bloodPrograms.map((p) => `${p.samplers}/16`).join(",")}`,
  );
} finally {
  await page.close().catch(() => {});
  await browser.close().catch(() => {});
  await server.close();
}
