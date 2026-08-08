import * as THREE from "../TunnelBell1942/vendor/three/build/three.module.mjs";
import { GetGroundY, GetLightTarget, GetWindStrength } from "./Script_Rules.mjs?v=20260808z3";
import { GetCameraShot, GetVisualProfile, RenderProfiles, WorldScale } from "./Data_Scene3D.mjs?v=20260808z3";
import { CreateChapterScene3D } from "./Script_Scene3D.mjs?v=20260808z3";
import { GetSceneAssetStatus3D, LoadSceneAssetKit3D } from "./Script_Assets3D.mjs?v=20260808z3";
import { CreateCinematicPostFX3D } from "./Script_PostFX3D.mjs?v=20260808z3";

export async function PreloadRender3D() {
  await LoadSceneAssetKit3D();
  return GetSceneAssetStatus3D();
}

function SelectRenderProfile() {
  const query = new URLSearchParams(window.location.search);
  const forced = query.get("quality");
  if (forced && RenderProfiles[forced]) return { id: forced, ...RenderProfiles[forced] };
  const coarse = window.matchMedia?.("(pointer: coarse)").matches;
  const memory = navigator.deviceMemory || 8;
  if (coarse || memory <= 4) return { id: "mobile", ...RenderProfiles.mobile };
  if (window.innerWidth < 1180 || memory <= 6) return { id: "balanced", ...RenderProfiles.balanced };
  return { id: "desktop", ...RenderProfiles.desktop };
}

function CreateConeMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: 0.14 },
    },
    vertexShader: `
      varying float vHeight;
      varying vec3 vWorldPosition;
      varying float vLocalX;
      void main() {
        vHeight = position.y + 0.5;
        vLocalX = position.x;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vHeight;
      varying vec3 vWorldPosition;
      varying float vLocalX;
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      void main() {
        float halfWidth = max(0.045, 1.0 - vHeight);
        float lateral = 1.0 - smoothstep(0.3, 0.94, abs(vLocalX) / halfWidth);
        float longitudinal = pow(clamp(1.0 - vHeight, 0.0, 1.0), 0.82);
        float noise = 0.82 + hash(floor(vWorldPosition.xy * 18.0)) * 0.18;
        gl_FragColor = vec4(uColor, uOpacity * longitudinal * lateral * noise);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
}

function CreateLightPoolMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: 0.24 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        vec2 p = (vUv - 0.5) * vec2(1.0, 2.4);
        float falloff = pow(clamp(1.0 - length(p) * 1.8, 0.0, 1.0), 1.7);
        gl_FragColor = vec4(uColor, falloff * uOpacity);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
}

function CreateSearchlightRig(hazard, profile, castShadow) {
  const group = new THREE.Group();
  group.name = `Searchlight_${hazard.id}`;
  const light = new THREE.SpotLight(0xe7d7a3, 42, 12, 0.25, 0.72, 1.65);
  light.castShadow = castShadow;
  light.shadow.mapSize.set(768, 768);
  light.shadow.bias = -0.0007;
  light.shadow.normalBias = 0.025;
  const target = new THREE.Object3D();
  light.target = target;
  group.add(light, target);
  const coneGeometry = new THREE.ConeGeometry(1, 1, 24, 1, true);
  const coneMaterial = CreateConeMaterial(profile.accent);
  const cone = new THREE.Mesh(coneGeometry, coneMaterial);
  cone.renderOrder = 2;
  cone.frustumCulled = false;
  group.add(cone);
  const poolGeometry = new THREE.PlaneGeometry(2, 2);
  const poolMaterial = CreateLightPoolMaterial(profile.accent);
  const pool = new THREE.Mesh(poolGeometry, poolMaterial);
  pool.rotation.x = -Math.PI * 0.5;
  pool.renderOrder = 3;
  pool.frustumCulled = false;
  group.add(pool);
  const lampMaterial = new THREE.MeshBasicMaterial({ color: 0xf1dda2 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 7), lampMaterial);
  group.add(lamp);
  return { group, light, target, cone, coneMaterial, coneGeometry, pool, poolMaterial, poolGeometry, lamp, lampMaterial, hazard };
}

function DisposeSearchlight(rig) {
  rig.coneGeometry.dispose();
  rig.coneMaterial.dispose();
  rig.poolGeometry.dispose();
  rig.poolMaterial.dispose();
  rig.lamp.geometry.dispose();
  rig.lampMaterial.dispose();
  rig.light.dispose?.();
}

function CreateAtmosphere(profile, count) {
  const positions = new Float32Array(count * 3);
  let seed = 9217 + profile.fog;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = (random() - 0.5) * 36;
    positions[index * 3 + 1] = random() * 5.8 - 0.2;
    positions[index * 3 + 2] = random() * 10 - 3;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const particleColor = new THREE.Color(profile.fog).lerp(new THREE.Color(profile.accent), 0.22);
  const material = new THREE.PointsMaterial({ color: particleColor, size: 0.018, transparent: true, opacity: 0.11, depthWrite: false, sizeAttenuation: true });
  const points = new THREE.Points(geometry, material);
  points.renderOrder = 3;
  return { points, geometry, material };
}

function Damp(current, target, speed, deltaTime) {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-speed * deltaTime));
}

function CreateEnvironmentSource(profile, chapterId) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  const sky = new THREE.Color(profile.sky);
  const fog = new THREE.Color(profile.fog);
  const ground = new THREE.Color(profile.ground);
  const accent = new THREE.Color(profile.accent);
  const css = (color) => `rgb(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)})`;
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, css(sky.multiplyScalar(chapterId === "tunnel" ? 0.42 : 0.78)));
  gradient.addColorStop(0.52, css(fog));
  gradient.addColorStop(0.7, css(new THREE.Color(fog).lerp(accent, chapterId === "tunnel" ? 0.28 : 0.12)));
  gradient.addColorStop(1, css(ground.multiplyScalar(0.5)));
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const horizon = context.createLinearGradient(0, 70, 0, 100);
  horizon.addColorStop(0, "rgba(255,219,161,0)");
  horizon.addColorStop(0.5, chapterId === "tunnel" ? "rgba(237,151,82,0.18)" : "rgba(237,202,143,0.11)");
  horizon.addColorStop(1, "rgba(255,219,161,0)");
  context.fillStyle = horizon;
  context.fillRect(0, 62, canvas.width, 48);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  return texture;
}

export function CreateRender3D(canvas, initialChapter, initialState) {
  const renderProfile = SelectRenderProfile();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: renderProfile.id !== "mobile", alpha: false, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = renderProfile.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(renderProfile.pixelRatio, window.devicePixelRatio || 1));
  renderer.autoClear = false;
  renderer.info.autoReset = false;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(25, 16 / 9, 0.08, 120);
  camera.position.set(4.8, 2.7, 15.4);
  const postFx = CreateCinematicPostFX3D(renderer, camera, renderProfile);
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();
  const chapterRoot = new THREE.Group();
  const lightRoot = new THREE.Group();
  scene.add(chapterRoot, lightRoot);

  const handle = {
    renderer,
    scene,
    camera,
    renderProfile,
    chapterIndex: -1,
    chapter: null,
    chapterScene: null,
    searchlights: [],
    atmosphere: null,
    hemisphere: null,
    moonLight: null,
    cinematicKey: null,
    activeCueId: null,
    activeCueStartedAt: 0,
    cinematicSegmentKey: "",
    environmentTarget: null,
    environmentSource: null,
    chapterRoot,
    lightRoot,
    time: 0,
    cameraTarget: new THREE.Vector3(),
    focusWorld: new THREE.Vector3(),
    playerFeetProjection: new THREE.Vector3(),
    playerHeadProjection: new THREE.Vector3(),
    stats: { calls: 0, triangles: 0, points: 0, quality: renderProfile.id },
    disposed: false,
  };

  function ClearChapter() {
    if (handle.chapterScene) {
      chapterRoot.remove(handle.chapterScene.root);
      handle.chapterScene.Dispose();
    }
    for (const rig of handle.searchlights) {
      lightRoot.remove(rig.group);
      DisposeSearchlight(rig);
    }
    handle.searchlights.length = 0;
    if (handle.atmosphere) {
      scene.remove(handle.atmosphere.points);
      handle.atmosphere.geometry.dispose();
      handle.atmosphere.material.dispose();
      handle.atmosphere = null;
    }
    if (handle.hemisphere) lightRoot.remove(handle.hemisphere);
    if (handle.moonLight) lightRoot.remove(handle.moonLight);
    if (handle.cinematicKey) {
      lightRoot.remove(handle.cinematicKey, handle.cinematicKey.target);
      handle.cinematicKey.dispose?.();
    }
    handle.hemisphere = null;
    handle.moonLight = null;
    handle.cinematicKey = null;
    handle.activeCueId = null;
    handle.activeCueStartedAt = 0;
    scene.environment = null;
    handle.environmentTarget?.dispose?.();
    handle.environmentSource?.dispose?.();
    handle.environmentTarget = null;
    handle.environmentSource = null;
  }

  function SetChapter(chapterIndex, chapter, state) {
    if (handle.chapterIndex === chapterIndex && handle.chapterScene) return;
    ClearChapter();
    handle.chapterIndex = chapterIndex;
    handle.chapter = chapter;
    const profile = GetVisualProfile(chapter.id);
    handle.environmentSource = CreateEnvironmentSource(profile, chapter.id);
    handle.environmentTarget = pmremGenerator.fromEquirectangular(handle.environmentSource);
    scene.environment = handle.environmentTarget.texture;
    scene.background = new THREE.Color(profile.sky);
    scene.fog = new THREE.FogExp2(profile.fog, profile.fogDensity);
    renderer.toneMappingExposure = profile.exposure;
    postFx.SetChapter(chapter.id);
    handle.chapterScene = CreateChapterScene3D(chapter, renderProfile);
    chapterRoot.add(handle.chapterScene.root);

    const hemisphere = new THREE.HemisphereLight(profile.ambientSky, profile.ambientGround, profile.ambientIntensity);
    lightRoot.add(hemisphere);
    handle.hemisphere = hemisphere;
    const moon = new THREE.DirectionalLight(profile.moon, profile.moonIntensity);
    moon.position.set(chapter.id === "ferry" ? -9 : 11, chapter.id === "tunnel" ? 7 : 12, 7);
    moon.target.position.set(chapter.width * WorldScale * 0.52, 0, -1.5);
    moon.castShadow = renderProfile.shadows;
    moon.shadow.mapSize.set(renderProfile.shadowMap, renderProfile.shadowMap);
    moon.shadow.camera.left = -11;
    moon.shadow.camera.right = 11;
    moon.shadow.camera.top = 7;
    moon.shadow.camera.bottom = -4;
    moon.shadow.camera.near = 1;
    moon.shadow.camera.far = 42;
    moon.shadow.bias = -0.00045;
    moon.shadow.normalBias = 0.035;
    lightRoot.add(moon, moon.target);
    handle.moonLight = moon;

    const cinematicKey = new THREE.SpotLight(profile.moon, chapter.id === "tunnel" ? 9.4 : 10.2, 15, 0.46, 0.92, 2);
    cinematicKey.castShadow = false;
    lightRoot.add(cinematicKey, cinematicKey.target);
    handle.cinematicKey = cinematicKey;

    for (let index = 0; index < (chapter.hazards || []).length; index += 1) {
      const hazard = chapter.hazards[index];
      if (hazard.kind !== "searchlight") continue;
      const rig = CreateSearchlightRig(hazard, profile, renderProfile.shadows);
      lightRoot.add(rig.group);
      handle.searchlights.push(rig);
    }
    handle.atmosphere = CreateAtmosphere(profile, renderProfile.dustCount);
    scene.add(handle.atmosphere.points);
    handle.chapterScene.Update(state, 0.016, handle.time, GetWindStrength(state.elapsed || 0));
  }

  function UpdateSearchlights(state) {
    const chapter = handle.chapter;
    const sourceHeight = chapter.id === "school" ? 4.25 : chapter.id === "ferry" ? 3.9 : 3.55;
    for (const rig of handle.searchlights) {
      const hazard = rig.hazard;
      const sourceZ = chapter.id === "school" ? -1.55 : chapter.id === "blockade" ? -1.45 : -1.55;
      const source = new THREE.Vector3(hazard.sourceX * WorldScale, sourceHeight, sourceZ);
      const targetGameX = GetLightTarget(hazard, state);
      const groundGameY = GetGroundY(chapter, targetGameX, state, 0);
      const surfaceY = groundGameY === null && chapter.id === "blockade"
        ? -0.62 + state.waterLevel * 0.54
        : (groundGameY ?? 0) * WorldScale;
      const target = new THREE.Vector3(targetGameX * WorldScale, surfaceY + 0.035, -1.15);
      const direction = target.clone().sub(source);
      const distance = direction.length();
      const radius = hazard.width * WorldScale;
      direction.normalize();
      rig.light.position.copy(source);
      rig.target.position.copy(target);
      rig.light.distance = Math.max(7.5, distance + 1.2);
      rig.light.angle = Math.atan2(radius * 0.62, Math.max(0.1, distance));
      rig.light.intensity = 30 + state.suspicion * 12;
      rig.lamp.position.copy(source);
      rig.cone.position.copy(source).addScaledVector(direction, distance * 0.5);
      rig.cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), direction);
      rig.cone.scale.set(radius * 0.58, distance, 0.025);
      rig.coneMaterial.uniforms.uOpacity.value = 0.032 + state.suspicion * 0.02;
      rig.pool.position.copy(target);
      rig.pool.position.y += 0.025;
      rig.pool.scale.set(radius * 0.88, radius * 0.38, 1);
      rig.poolMaterial.uniforms.uOpacity.value = 0.07 + state.suspicion * 0.04;
    }
  }

  function UpdateCamera(state, deltaTime, cinematicFrame = null) {
    const chapter = handle.chapter;
    const profile = GetVisualProfile(chapter.id);
    const shot = GetCameraShot(chapter.id, state.player.x);
    const forwardLook = shot.anchorX === undefined ? state.player.facing * 175 : 0;
    const anchorFollow = shot.anchorX === undefined
      ? 0
      : THREE.MathUtils.clamp(state.player.x - shot.anchorX, -280, 280) * 0.55;
    const baseTargetGameX = shot.anchorX === undefined ? state.player.x + forwardLook : shot.anchorX + anchorFollow;
    const baseTargetX = baseTargetGameX * WorldScale;
    const playerY = state.player.y * WorldScale;
    const baseDesiredY = playerY + (shot.lift ?? profile.camera.lift);
    const baseDesiredZ = shot.viewDistance ?? profile.camera.distance;
    const cueState = state.cinematicCue;
    const cueId = cueState?.actionId || null;
    if (cueId !== handle.activeCueId) {
      handle.activeCueId = cueId;
      handle.activeCueStartedAt = handle.time;
    }
    const cueAge = cueState ? handle.time - handle.activeCueStartedAt : Infinity;
    const cueDuration = cueState?.duration || 0;
    const cueProgress = cueDuration > 0 ? THREE.MathUtils.clamp(cueAge / cueDuration, 0, 1) : 0;
    // Ease in and out so a cue reads as a shot change, never as a hard camera
    // snap.  Offsets are authored in metres, matching the scene's world scale.
    const cueBlend = !cinematicFrame?.camera && cueState?.camera && cueProgress > 0 && cueProgress < 1
      ? Math.sin(cueProgress * Math.PI)
      : 0;
    const cueCamera = cueState?.camera;
    const cueTargetX = cueCamera ? state.player.x * WorldScale + cueCamera.targetX : baseTargetX;
    const targetX = THREE.MathUtils.lerp(baseTargetX, cueTargetX, cueBlend);
    const desiredY = THREE.MathUtils.lerp(baseDesiredY, baseDesiredY + (cueCamera?.targetY || 0), cueBlend);
    const desiredZ = THREE.MathUtils.lerp(baseDesiredZ, baseDesiredZ + (cueCamera?.positionZ || 0), cueBlend);
    const desiredCameraX = THREE.MathUtils.lerp(targetX, targetX + (cueCamera?.positionX || 0), cueBlend);
    const desiredCameraY = THREE.MathUtils.lerp(desiredY, desiredY + (cueCamera?.positionY || 0), cueBlend);
    const directorCamera = cinematicFrame?.camera;
    const directorRawProgress = THREE.MathUtils.clamp(Number(cinematicFrame?.segmentProgress || 0), 0, 1);
    const directorProgress = directorRawProgress * directorRawProgress * (3 - 2 * directorRawProgress);
    const directorTrackX = Number(directorCamera?.trackX || 0) * directorProgress;
    const directorDolly = Number(directorCamera?.dolly || 0) * directorProgress;
    const directorCrane = Number(directorCamera?.crane || 0) * directorProgress;
    const directorTargetX = Number.isFinite(directorCamera?.anchorX)
      ? (directorCamera.anchorX + directorTrackX) * WorldScale
      : state.player.x * WorldScale;
    const finalTargetX = directorCamera ? directorTargetX : targetX;
    const finalCameraX = directorCamera ? directorTargetX : desiredCameraX;
    const finalCameraY = directorCamera ? playerY + directorCamera.lift + directorCrane : desiredCameraY;
    const finalCameraZ = directorCamera ? directorCamera.viewDistance + directorDolly : desiredZ - state.suspicion * 0.65;
    const directorSegmentKey = directorCamera ? `${cinematicFrame.id}:${cinematicFrame.segmentIndex}` : "";
    const directorCut = Boolean(directorCamera && directorSegmentKey !== handle.cinematicSegmentKey);
    handle.cinematicSegmentKey = directorSegmentKey;
    const cameraSpeed = directorCamera ? 4.8 : cueBlend > 0 ? 6.2 : 3.15;
    const finalFov = directorCamera?.fov ?? (profile.camera.fov - state.suspicion * 1.2);
    camera.position.x = directorCut ? finalCameraX : Damp(camera.position.x, finalCameraX, cameraSpeed, deltaTime);
    camera.position.y = directorCut ? finalCameraY : Damp(camera.position.y, finalCameraY, directorCamera ? 4.4 : cueBlend > 0 ? 5.4 : 2.7, deltaTime);
    camera.position.z = directorCut ? finalCameraZ : Damp(camera.position.z, finalCameraZ, directorCamera ? 4.0 : 2.4, deltaTime);
    camera.fov = directorCut ? finalFov : Damp(camera.fov, finalFov, directorCamera ? 4.2 : 2.5, deltaTime);
    camera.updateProjectionMatrix();
    handle.cameraTarget.x = directorCut ? finalTargetX : Damp(handle.cameraTarget.x, finalTargetX, directorCamera ? 4.8 : cueBlend > 0 ? 6.2 : 3.2, deltaTime);
    const baseLookLift = shot.lookLift ?? profile.camera.lookLift;
    const finalLookLift = directorCamera
      ? (directorCamera.lookLift ?? baseLookLift) + directorCrane * 0.3
      : baseLookLift + (cueCamera?.targetY || 0) * cueBlend;
    handle.cameraTarget.y = directorCut ? playerY + finalLookLift : Damp(handle.cameraTarget.y, playerY + finalLookLift, directorCamera ? 4.4 : cueBlend > 0 ? 5.4 : 3.2, deltaTime);
    handle.cameraTarget.z = directorCut ? (directorCamera?.targetZ ?? -0.45) : Damp(handle.cameraTarget.z, directorCamera?.targetZ ?? -0.45, directorCamera ? 4.2 : 2, deltaTime);
    camera.lookAt(handle.cameraTarget);
    camera.rotateZ(Math.sin(handle.time * 0.29) * 0.0012 + state.suspicion * 0.0018);
    if (handle.moonLight) {
      handle.moonLight.position.x = camera.position.x + (chapter.id === "ferry" ? -9 : 11);
      handle.moonLight.target.position.x = camera.position.x;
      handle.moonLight.shadow.camera.updateProjectionMatrix();
    }
    if (handle.cinematicKey) {
      const playerX = state.player.x * WorldScale;
      handle.cinematicKey.position.set(playerX - state.player.facing * 1.2, playerY + 3.4, -2.55);
      handle.cinematicKey.target.position.set(playerX, playerY + 0.82, 0.1);
      handle.cinematicKey.intensity = (chapter.id === "tunnel" ? 9.4 : 10.2) * (1 + state.suspicion * 0.08);
    }
  }

  function Resize(width = canvas.clientWidth, height = canvas.clientHeight) {
    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);
    renderer.setSize(safeWidth, safeHeight, false);
    camera.aspect = safeWidth / safeHeight;
    camera.updateProjectionMatrix();
    postFx.Resize(safeWidth, safeHeight, renderer.getPixelRatio());
  }

  function Render(state, chapter, deltaTime, cinematicFrame = null) {
    if (handle.disposed) return;
    handle.time += deltaTime;
    SetChapter(state.chapterIndex, chapter, state);
    const wind = GetWindStrength(state.elapsed || handle.time);
    handle.chapterScene.Update(state, deltaTime, handle.time, wind, cinematicFrame);
    UpdateSearchlights(state);
    UpdateCamera(state, deltaTime, cinematicFrame);
    if (handle.atmosphere) {
      handle.atmosphere.points.position.x = camera.position.x;
      handle.atmosphere.points.rotation.y = handle.time * 0.006;
      const baseOpacity = chapter.id === "tunnel" ? 0.045 : 0.07;
      handle.atmosphere.material.opacity = baseOpacity + wind * (chapter.id === "tunnel" ? 0.018 : 0.03);
    }
    renderer.info.reset();
    handle.chapterScene.actors.player.getWorldPosition(handle.focusWorld);
    const focusDistance = camera.position.distanceTo(handle.focusWorld);
    postFx.Render(scene, handle.time, focusDistance, state.suspicion);
    const info = renderer.info.render;
    handle.playerFeetProjection.set(0, 0, 0);
    handle.playerHeadProjection.set(0, 1.58, 0);
    handle.chapterScene.actors.player.localToWorld(handle.playerFeetProjection);
    handle.chapterScene.actors.player.localToWorld(handle.playerHeadProjection);
    handle.playerFeetProjection.project(camera);
    handle.playerHeadProjection.project(camera);
    handle.stats = {
      calls: info.calls,
      triangles: info.triangles,
      points: info.points,
      quality: renderProfile.id,
      chapter: chapter.id,
      playerNdcX: handle.playerHeadProjection.x,
      playerTopNdcY: handle.playerHeadProjection.y,
      playerBottomNdcY: handle.playerFeetProjection.y,
      blenderAssets: handle.chapterScene.dynamic.blenderAssets.length,
      assetKitReady: GetSceneAssetStatus3D().ready,
      postFxReady: postFx.enabled,
      postFxQuality: postFx.quality,
      cinematic: cinematicFrame?.id || "",
    };
  }

  function SetQuality(profileId) {
    const profile = RenderProfiles[profileId];
    if (!profile) return false;
    renderer.setPixelRatio(Math.min(profile.pixelRatio, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = profile.shadows;
    Resize();
    return true;
  }

  function Dispose() {
    if (handle.disposed) return;
    handle.disposed = true;
    ClearChapter();
    postFx.Dispose();
    pmremGenerator.dispose();
    renderer.dispose();
  }

  handle.SetChapter = SetChapter;
  handle.Render = Render;
  handle.Resize = Resize;
  handle.SetQuality = SetQuality;
  handle.Dispose = Dispose;
  Resize();
  SetChapter(initialState.chapterIndex, initialChapter, initialState);
  return handle;
}
