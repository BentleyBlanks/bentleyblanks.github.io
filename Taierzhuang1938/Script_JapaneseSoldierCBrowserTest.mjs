// Soldier C's shipped skin on the existing Mixamo preview, using the runner's shared
// browser slot. Screenshots/reports stay under ignored _shots, at 1280x720.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const root = path.resolve(import.meta.dirname, "..");
const supplied = process.env.JPC_TEST_URL || process.argv.find(arg=>arg.startsWith("--url="))?.slice(6);
const out = path.join(import.meta.dirname, "_shots", supplied ? "JapaneseSoldierCOnline" : "JapaneseSoldierC");
fs.mkdirSync(out, { recursive: true });
const clips = [
  "Animation_Mixamo_RifleAimingIdle_V1.glb", "Animation_Mixamo_WalkWithRifle_V3.glb",
  "Animation_Mixamo_RifleRun_V2.glb", "Animation_Mixamo_SprintForward_V1.glb",
  "Animation_Mixamo_IdleCrouchingAiming_V1.glb", "Animation_Mixamo_ProneFiringRifle_V2.glb",
  "Animation_Mixamo_RifleKneelIdle_V1.glb",
  "Animation_Mixamo_Crawling_V1.glb", "Animation_Mixamo_FiringRifle_V2.glb",
  "Animation_Claude_RifleBoltStand.glb", "Animation_Mixamo_GrenadeThrow_V2.glb",
  "Animation_Mixamo_Dying_V3.glb", "Animation_Mixamo_SittingIdle_V2.glb",
  "Animation_Mixamo_PickingUpObject_V1.glb", "Animation_Mixamo_ClimbingLadder_V1.glb",
  "Animation_Mixamo_Waving_V3.glb", "Animation_Mixamo_CrouchLookAroundCorner_V1.glb",
];
const server = supplied ? null : await ServeRoot(root, 0);
const origin = supplied || `http://127.0.0.1:${server.address().port}`;
const browser = await LaunchBrowser();
const errors = [], results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (/PropertyBinding|Couldn't compile|VALIDATE_STATUS/.test(m.text())) errors.push(m.text()); });
  await page.addInitScript(() => {
    if (location.hostname === "127.0.0.1" || location.hostname === "localhost") {
      localStorage.setItem("tengxian1938_audio_v1", JSON.stringify({ master: 0 }));
      localStorage.setItem("tengxian1938_tools_volume_v1", JSON.stringify({ volume: 0, muted: true }));
    }
  });
  await page.goto(`${origin}/Taierzhuang1938/Tool_MixamoAnimationPreview.html?who=ijaC`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => window.__preview?.action && window.__preview?.rifle, null, { timeout: 180000 });
  const setup = await page.evaluate(() => {
    const P = window.__preview, V = P.camera.position.constructor;
    document.getElementById("edRoot").style.display = "none";
    document.getElementById("follow").checked = false;
    const rifle = document.getElementById("rifle"); rifle.value = "Type38"; rifle.dispatchEvent(new Event("change"));
    P.action.paused = true; P.action.enabled = false;
    P.character.updateMatrixWorld(true);
    const mesh = (() => { let result; P.character.traverse(o => { if (o.isSkinnedMesh) result = o; }); return result; })();
    mesh.skeleton.pose(); P.character.updateMatrixWorld(true);
    const feet = [], hands = [];
    for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
      const p = new V().fromBufferAttribute(mesh.geometry.attributes.position, i).applyMatrix4(mesh.matrixWorld);
      if (p.y < .10) feet.push(i);
      if (Math.abs(p.x) > .710) hands.push(i);
    }
    window.__c = { mesh, feet, hands };
    return { bones: mesh.skeleton.bones.length, vertices: mesh.geometry.attributes.position.count,
      material: mesh.material.name, feet: feet.length, options: [...document.getElementById("who").options].map(o => o.value) };
  });
  assert.equal(setup.bones, 65); assert.match(setup.material, /JapaneseSoldierC/);
  assert.ok(setup.options.includes("ijaJia") && setup.options.includes("ijaA") && setup.options.includes("ijaC"));
  assert.ok(setup.feet > 50);
  await page.waitForFunction(() => window.__preview.rifle?.name, null, { timeout: 60000 });

  async function Shot(name, focus, yaw, pitch, dist) {
    await page.evaluate(({ focus, yaw, pitch, dist }) => {
      const P = window.__preview, o = P.orbit;
      o.target.set(...focus); o.pan.set(0, 0, 0); Object.assign(o, { yaw, pitch, dist });
    }, { focus, yaw, pitch, dist });
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.screenshot({ path: path.join(out, `${name}.png`) });
  }
  await page.evaluate(()=>{
    const P=window.__preview;
    window.__c.propMeshes=[];
    for(const root of [P.rifle,P.grenade,P.dadao,P.stretcher])root?.traverse(o=>{if(o.isMesh){window.__c.propMeshes.push([o,o.visible]);o.visible=false;}});
    window.__c.background=P.scene.background.clone();P.scene.background.set(0xffffff);
    window.__c.staticFloor=[];
    for(const o of P.scene.children)if(o.isGridHelper||o.geometry?.type==="PlaneGeometry"){window.__c.staticFloor.push([o,o.visible]);o.visible=false;}
    const h=2.05,w=h*1280/720;
    P.camera.projectionMatrix.makeOrthographic(-w/2,w/2,h/2,-h/2,.05,200);
    P.camera.projectionMatrixInverse.copy(P.camera.projectionMatrix).invert();
  });
  await Shot("StaticFront", [0, .92, 0], 0, 0, 3.8);
  await Shot("StaticSide", [0, .92, 0], Math.PI/2, 0, 3.8);
  await Shot("StaticRear", [0, .92, 0], Math.PI, 0, 3.8);
  await page.evaluate(()=>{
    const P=window.__preview;P.camera.updateProjectionMatrix();P.scene.background.copy(window.__c.background);
    for(const [o,visible] of window.__c.staticFloor)o.visible=visible;
  });
  await Shot("StaticHeadFront", [0, 1.66, 0], .12, .04, .94);
  await Shot("StaticHeadRear", [0, 1.66, 0], Math.PI - .70, .04, .94);
  await Shot("StaticHeadRearLeft", [0, 1.66, 0], Math.PI + .70, .04, .94);
  await Shot("StaticHeadSide", [0, 1.66, 0], Math.PI/2, .04, .94);
  await Shot("StaticHand", [.755, 1.444, -.025], .35, .85, .60);
  await page.evaluate(()=>{for(const [o,visible] of window.__c.propMeshes)o.visible=visible;});

  for (const file of clips) {
    const result = await page.evaluate(async file => {
      const P = window.__preview, { mesh, feet, hands: handIndices } = window.__c;
      await P.SelectFile(file);
      const a = P.action; a.paused = true; a.enabled = true;
      const mixer = a.getMixer(), duration = a.getClip().duration;
      const V = P.camera.position.constructor, p = new V(), hip = new V();
      const frames = Math.max(1, Math.ceil(duration * 30));
      let floorMin = Infinity, floorMax = -Infinity, handFloorMin = Infinity, skinFloorMin = Infinity, maxRadius = 0, rightGripMax = 0;
      for (let f = 0; f <= frames; f++) {
        a.time = Math.min(f/30, duration-1e-5); mixer.update(0); P.Place();
        mesh.skeleton.update();
        P.character.getObjectByName("Hips").getWorldPosition(hip);
        let minY = Infinity;
        for (const i of feet) {
          mesh.getVertexPosition(i, p).applyMatrix4(mesh.matrixWorld);
          minY = Math.min(minY, p.y);
        }
        floorMin = Math.min(floorMin,minY); floorMax = Math.max(floorMax,minY);
        if (/Crawling/.test(file)) for (const i of handIndices) {
          mesh.getVertexPosition(i,p).applyMatrix4(mesh.matrixWorld); handFloorMin = Math.min(handFloorMin,p.y);
        }
        for (let i = 0; i < mesh.geometry.attributes.position.count; i += /Crawling/.test(file) ? 1 : 29) {
          mesh.getVertexPosition(i,p).applyMatrix4(mesh.matrixWorld);
          if (![p.x,p.y,p.z].every(Number.isFinite)) throw Error(`Nonfinite skin ${file}/${f}/${i}`);
          maxRadius = Math.max(maxRadius,p.distanceTo(hip));
          skinFloorMin = Math.min(skinFloorMin,p.y);
        }
        if (P.rifle?.visible && P.rifleMode === "hand" && !P.current.rifleHand) {
          const hand = P.character.getObjectByName("RightHand").getWorldPosition(new V());
          const middle = P.character.getObjectByName("RightHandMiddle1").getWorldPosition(new V());
          const palm = hand.lerp(middle,.55);
          rightGripMax = Math.max(rightGripMax,palm.distanceTo(P.rifle.getWorldPosition(new V())));
        }
      }
      a.time = duration*.40; mixer.update(0); P.Place();
      const focus = P.character.getObjectByName("Hips").getWorldPosition(new V()).toArray();
      const hands = P.character.getObjectByName("RightHand").getWorldPosition(new V()).lerp(
        P.character.getObjectByName("LeftHand").getWorldPosition(new V()),.5).toArray();
      const head = P.character.getObjectByName("Head").getWorldPosition(new V()).toArray();
      return { file,duration,frames,floorMin,floorMax,handFloorMin:Number.isFinite(handFloorMin)?handFloorMin:null,skinFloorMin,maxRadius,rightGripMax,focus,hands,head };
    }, file);
    results.push(result);
    assert.ok(result.maxRadius < 1.8, `${file}: skin radius ${result.maxRadius}`);
    assert.ok(result.rightGripMax < .045, `${file}: right palm grip ${result.rightGripMax}`);
    if (/RifleAimingIdle/.test(file)) assert.ok(Math.abs(result.floorMin) < .05 && Math.abs(result.floorMax) < .05, `${file}: feet ${result.floorMin}..${result.floorMax}`);
    if (/Crawling/.test(file)) {
      assert.ok(result.floorMin > -.008, `${file}: boots clear ground ${result.floorMin}`);
      assert.ok(result.handFloorMin > -.012, `${file}: palms clear ground ${result.handFloorMin}`);
      assert.ok(result.skinFloorMin > -.045, `${file}: full skin clears ground ${result.skinFloorMin}`);
    }
    const name = file.replace(/^Animation_(Mixamo|Claude)_/, "").replace(/\.glb$/, "");
    await Shot(name, result.focus, .52, .12, 3.65);
    await Shot(`${name}_Detail`, /Rifle|Waving/.test(file) ? result.hands : result.head, -.7, .28, 1.05);
    if (/RifleAimingIdle|RifleKneelIdle|Crawling|Waving|CrouchLook/.test(file)) await Shot(`${name}_Nape`, result.head, Math.PI-.70, .15, .95);
    console.log(`[C] ${name} ${result.frames} frames; feet ${result.floorMin.toFixed(3)}..${result.floorMax.toFixed(3)} m`);
  }
  await page.goto(`${origin}/Taierzhuang1938/?editor=blockout&level=FirstLevel0105&kf=05-1&scale=small&audio=0&manual=1&quality=high`,
    { waitUntil: "load", timeout: 300000 });
  await page.waitForFunction(() => window.Tengxian?.Debug?.Blockout?.State?.().ready, null, { timeout: 300000 });
  await page.waitForFunction(() => {
    const T = window.Tengxian;
    T.StepFrames(1, 1/60, false);
    let ready = false;
    T.scene.traverse(object => {
      const skin = object.userData?.xbotSkin;
      if (skin?.shownValid && skin.kit.key === "ijaC" && skin.current?.file) ready = true;
    });
    return ready;
  }, null, { timeout: 120000 });
  const game = await page.evaluate(() => {
    const T = window.Tengxian;
    const counts = {}, skins = [];
    T.scene.traverse(object => {
      const skin = object.userData?.xbotSkin;
      if (skin?.shownValid && object.visible) {
        counts[skin.kit.key] = (counts[skin.kit.key] || 0) + 1;
        skins.push(skin);
      }
    });
    const character = skins.find(skin => skin.kit.key === "ijaC" && skin.current?.file);
    T.StepFrames(60, 1/60, false);
    const V = T.camera.position.constructor;
    const head = character.H("Head").getWorldPosition(new V());
    const hip = character.H("Hips").getWorldPosition(new V());
    const eye = hip.clone().add(new V(1.8, .5, 1.8));
    const focus = hip.clone().lerp(head, .4);
    const direction = focus.clone().sub(eye).normalize();
    T.Debug.Blockout.Fly(true, {
      x: eye.x, y: eye.y, z: eye.z,
      yawDeg: Math.atan2(-direction.x, -direction.z) * 180 / Math.PI,
      pitchDeg: Math.asin(direction.y) * 180 / Math.PI
    });
    T.StepFrames(16, 1/60, true);
    return { counts, kit: character.kit.key, weaponId: character.actor.weaponId,
      clip: character.current?.file, grip: character.Probe(),
      canvas: T.renderer.domElement.toDataURL("image/png") };
  });
  fs.writeFileSync(path.join(out, "BlockoutC.png"), Buffer.from(game.canvas.split(",")[1], "base64"));
  delete game.canvas;
  assert.ok(game.counts.ijaC > 0, "whitebox instantiates soldier C through the registered pool");
  assert.match(game.grip.mount, /^rifle/, "game uses a held rifle pose");
  assert.ok(game.grip.gripR < .04, `game right palm grip ${game.grip.gripR}`);
  assert.ok(game.grip.contactL !== null && game.grip.contactL < .04, `game left palm contact ${game.grip.contactL}`);
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(out, "Data_Review.json"), JSON.stringify({ origin, setup, results, game, errors }, null, 2));
  console.log(`JapaneseSoldierCBrowserTest ok; ${results.reduce((sum,result) => sum+result.frames+1, 0)} frames; ${out}`);
} finally {
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
