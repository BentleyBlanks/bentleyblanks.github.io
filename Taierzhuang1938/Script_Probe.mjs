// 渲染探针：把材质 / 光照 / 后处理单独摆出来看。开发与视觉审查专用。
// URL 参数：?preset=dusk|smokyDay|burningStreet|night|dawn  &quality=low|medium|high|ultra
//           &scene=materials|street  &gi=0|1（默认 1）  &giDebug=1（画探针球）

import * as THREE from "three";
import { MaterialLibrary } from "./Script_Materials.mjs";
import { SkyDome, SKY_PRESETS } from "./Script_Sky.mjs";
import { LightRig } from "./Script_Light.mjs";
import { PostPipeline } from "./Script_Post.mjs";
import { MakeBox, MakePlane, MakeBrokenWall, MakeRubbleField, MakeInstanced, TILE_METERS, CarveCraters } from "./Script_Geo.mjs";
import { RECIPES } from "./Script_TexBake.mjs";
import { ProbeVolume, MakeGiUniforms, MakeProbeDebugMesh } from "./Script_Gi.mjs";

const params = new URLSearchParams(location.search);
const presetName = params.get("preset") || "smokyDay";
const quality = params.get("quality") || "high";
const sceneKind = params.get("scene") || "street";
const giEnabled = params.get("gi") !== "0";
const giDebug = params.get("giDebug") === "1";

const hint = document.getElementById("hint");
const canvas = document.createElement("canvas");
document.body.appendChild(canvas);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true;
// r185 的 shadowMapTypeDefines 里**只有** PCFShadowMap 与 VSMShadowMap；
// PCFSoftShadowMap(=2) 查不到会掉进 'SHADOWMAP_TYPE_BASIC'，而且 WebGLShadowMap
// 只在 type===PCFShadowMap 时给 depthTexture 设 compareFunction + LinearFilter。
// 写 PCFSoftShadowMap 拿到的是**硬阴影 + 最近邻**，看着就是一圈马赛克边。
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NoToneMapping;      // 色调映射在合成 pass 里做
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.08, 900);
camera.position.set(0, 1.68, 8);

const post = new PostPipeline(renderer, { width: window.innerWidth, height: window.innerHeight, quality });
const ssao = {
  map: { value: post.AoTexture },
  resolution: { value: new THREE.Vector2(post.targets.aoBlur.width, post.targets.aoBlur.height) },
  strength: { value: 0.78 },
};
const giUniforms = MakeGiUniforms();
const library = new MaterialLibrary(renderer, { textureSize: 512, ssao, gi: giEnabled ? giUniforms : null });

const sky = new SkyDome(renderer);
scene.add(sky.mesh);
const lights = new LightRig(scene, { quality });
// 天空 uniform 直接借给探针体：漏空的射线问的是同一片天
const gi = giEnabled
  ? new ProbeVolume(renderer, { quality, skyUniforms: sky.uniforms, uniforms: giUniforms })
  : null;
// 探针体的代理几何体：探针页自己攒一张 AABB 表（正片里直接用 battlefield.colliders）
const giColliders = [];

const state = { ready: false, elapsed: 0, frame: 0 };

async function Boot() {
  const steps = library.PrepareSteps();
  let done = 0;
  const total = Object.keys(RECIPES).length;
  for (const name of steps) {
    done += 1;
    hint.textContent = `烘焙贴图 ${done}/${total} · ${name}`;
    await new Promise((r) => requestAnimationFrame(r));
  }
  const preset = sky.Apply(presetName);
  sky.ClearEnvironment(scene);
  lights.ApplyPreset(preset, sky.sunDirection);
  scene.fog = null;   // 雾收到合成 pass 里
  if (sceneKind === "materials") BuildMaterialScene(); else BuildStreetScene();
  if (gi) {
    gi.ApplyPreset(preset);
    gi.SetWorld({ colliders: giColliders, GroundHeight: () => 0 });
    lights.SetGiActive(1);
    if (giDebug) scene.add(MakeProbeDebugMesh(gi));
  }
  state.ready = true;
  hint.textContent = `preset=${presetName} quality=${quality} scene=${sceneKind}\n`
    + `hdr=${post.hdrCapable} gi=${gi ? `on/${gi.probeCount}探针` : "off"}`;
  window.Probe = { renderer, scene, camera, post, sky, lights, library, gi, state, StepFrames };
}

/** 材质球阵：每种配方一个球 + 一块板，看 PBR 反应。 */
function BuildMaterialScene() {
  const ground = new THREE.Mesh(MakePlane(60, 60, TILE_METERS.ground, 1), library.Get("Ground", { repeat: 1 }));
  ground.receiveShadow = true;
  scene.add(ground);
  const names = Object.keys(RECIPES);
  const perRow = 5;
  names.forEach((name, i) => {
    const x = (i % perRow - (perRow - 1) / 2) * 1.9;
    const z = -Math.floor(i / perRow) * 1.9 - 1.5;
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.6, 48, 32), library.Get(name));
    sphere.position.set(x, 0.75, z);
    sphere.castShadow = true; sphere.receiveShadow = true;
    scene.add(sphere);
    const slab = new THREE.Mesh(MakeBox(1.5, 0.1, 1.5, 1.2, name), library.Get(name));
    slab.position.set(x, 0.05, z + 1.0);
    slab.castShadow = true; slab.receiveShadow = true;
    scene.add(slab);
  });
  camera.position.set(0, 3.2, 6.5);
  camera.lookAt(0, 0.9, -3);
}

/**
 * 记一个 GI 代理盒。正片里这张表由 BuildSink.Solid 攒（物理用的那一张），
 * 探针页没有物理，所以这里手工补几笔 —— 探针体的射线只认这张表。
 */
function AddGiBox(cx, cy, cz, hx, hy, hz, tag) {
  giColliders.push({
    min: [cx - hx, cy, cz - hz],
    max: [cx + hx, cy + hy * 2, cz + hz],
    tag,
  });
}

/** 一小段台儿庄式街巷：青砖房、夯土院墙、瓦顶、沙包、瓦砾。 */
function BuildStreetScene() {
  const groundGeometry = MakePlane(120, 120, TILE_METERS.ground, 96);
  CarveCraters(groundGeometry, [
    { x: 3.5, z: -6, radius: 2.6, depth: 0.55 },
    { x: -7, z: -18, radius: 3.4, depth: 0.7 },
    { x: 9, z: -26, radius: 2.0, depth: 0.4 },
  ]);
  const ground = new THREE.Mesh(groundGeometry, library.Get("GroundRubble", { repeat: 1 }));
  ground.receiveShadow = true;
  scene.add(ground);

  const brick = library.Get("BrickWall");
  const brickSooty = library.Get("BrickWallSooty");
  const adobe = library.Get("Adobe");
  const roof = library.Get("RoofTile");
  const wood = library.Get("WoodDoor");
  const stone = library.Get("Stone");
  const sandbagMat = library.Get("Sandbag");

  // 街两侧的房子
  for (let i = 0; i < 7; i += 1) {
    for (const side of [-1, 1]) {
      const z = -6 - i * 9.5;
      const x = side * (5.2 + (i % 3) * 0.6);
      const w = 7.5 + (i % 2) * 1.5, h = 3.2 + (i % 3) * 0.5, d = 8.5;
      const ruin = i === 2 || i === 5 ? 0.55 : 0.12;
      const body = new THREE.Mesh(
        MakeBrokenWall(w, h, d, { seed: `house${i}${side}`, slices: 8, ruin, unitsPerTile: TILE_METERS.brick }),
        i % 3 === 1 ? brickSooty : brick);
      body.position.set(x, 0, z);
      body.rotation.y = side > 0 ? 0 : Math.PI;
      body.castShadow = true; body.receiveShadow = true;
      scene.add(body);
      AddGiBox(x, 0, z, w / 2, h / 2, d / 2, "wall");

      if (ruin < 0.3) {
        // 硬山瓦顶：两坡 + 出檐
        const roofMesh = new THREE.Group();
        for (const s of [-1, 1]) {
          const slope = new THREE.Mesh(MakeBox(w + 0.7, 0.14, d * 0.62, TILE_METERS.roof, `roof${i}${side}${s}`), roof);
          slope.position.set(0, h + 0.72, s * d * 0.26);
          slope.rotation.x = s * 0.42;
          slope.castShadow = true; slope.receiveShadow = true;
          roofMesh.add(slope);
        }
        const ridge = new THREE.Mesh(MakeBox(w + 0.8, 0.22, 0.34, TILE_METERS.roof, `ridge${i}`), roof);
        ridge.position.set(0, h + 1.42, 0);
        ridge.castShadow = true;
        roofMesh.add(ridge);
        roofMesh.position.set(x, 0, z);
        scene.add(roofMesh);
      }

      // 门与门墩
      const door = new THREE.Mesh(MakeBox(1.15, 2.0, 0.12, TILE_METERS.wood, `door${i}${side}`), wood);
      door.position.set(x - side * (d / 2 + 0.02), 1.0, z + 1.2);
      door.rotation.y = Math.PI / 2;
      door.castShadow = true; door.receiveShadow = true;
      scene.add(door);
    }
  }

  // 夯土院墙（断续）
  for (let i = 0; i < 5; i += 1) {
    const wall = new THREE.Mesh(
      MakeBrokenWall(6.5, 2.1, 0.45, { seed: `court${i}`, slices: 7, ruin: 0.3 + (i % 3) * 0.18, unitsPerTile: TILE_METERS.adobe }),
      adobe);
    wall.position.set((i % 2 ? 1 : -1) * 9.5, 0, -10 - i * 12);
    wall.rotation.y = Math.PI / 2;
    wall.castShadow = true; wall.receiveShadow = true;
    scene.add(wall);
    AddGiBox((i % 2 ? 1 : -1) * 9.5, 0, -10 - i * 12, 0.22, 1.05, 3.25, "wall");
  }

  // 沙包工事
  const bagGeometry = MakeBox(0.62, 0.24, 0.34, TILE_METERS.sandbag, "bag");
  const bags = [];
  const dummy = new THREE.Object3D();
  for (let row = 0; row < 4; row += 1) {
    for (let i = 0; i < 11; i += 1) {
      dummy.position.set(-3.2 + i * 0.64 + (row % 2) * 0.3, 0.12 + row * 0.23, -14 + row * 0.1);
      dummy.rotation.set(0.03, (i * 0.37 + row) % 0.4 - 0.2, 0.02);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      bags.push(dummy.matrix.clone());
    }
  }
  scene.add(MakeInstanced(bagGeometry, sandbagMat, bags));

  // 瓦砾
  const rubbleGeometry = MakeBox(1, 1, 1, 0.35, "rubbleUnit");
  scene.add(MakeInstanced(rubbleGeometry, library.Get("BrickWallSooty"),
    MakeRubbleField(1100, { seed: "street", area: [26, 80], center: [0, -34], sizeRange: [0.06, 0.26] })));

  // 井台
  const well = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.7, 24), stone);
  well.position.set(-2.4, 0.35, -21);
  well.castShadow = true; well.receiveShadow = true;
  scene.add(well);

  lights.AddFire(new THREE.Vector3(6.5, 1.6, -25), { intensity: 26, radius: 26 });
  lights.AddFire(new THREE.Vector3(-6.0, 1.2, -44), { intensity: 18, radius: 22 });

  camera.position.set(0.4, 1.68, 4);
  camera.lookAt(0, 1.6, -30);
}

function Frame(dt) {
  state.elapsed += dt;
  state.frame += 1;
  sky.Update(state.elapsed);
  lights.Update(dt, state.elapsed);
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  lights.UpdateShadowFrustum(camera.position, forward);
  if (gi) gi.Update(dt, camera.position, lights);
  ssao.map.value = post.AoTexture;
  ssao.resolution.value.set(post.targets.aoBlur.width, post.targets.aoBlur.height);
  const preset = SKY_PRESETS[presetName];
  post.Render(scene, camera, {
    sunDirection: sky.sunDirection,
    sunColor: preset.sunColor,
    fog: preset.fog,
    exposure: preset.exposure,
    bloom: preset.bloom,
    godStrength: preset.godStrength,
    saturation: preset.saturation,
    contrast: preset.contrast,
    grain: 0.014,
    vignette: 0.42,
    fade: 0,
  });
}

/** 给截图脚本用：推进固定帧数（不依赖真实时间，出图可复现）。 */
function StepFrames(count = 1, dt = 1 / 60) {
  for (let i = 0; i < count; i += 1) Frame(dt);
}

let last = performance.now();
function Loop(now) {
  requestAnimationFrame(Loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!state.ready) return;
  Frame(dt);
}
requestAnimationFrame(Loop);

window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  post.SetSize(window.innerWidth, window.innerHeight);
});

Boot().catch((error) => { hint.textContent = "BOOT ERROR: " + error.message; throw error; });
