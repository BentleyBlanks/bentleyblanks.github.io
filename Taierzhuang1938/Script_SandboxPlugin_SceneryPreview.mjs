// 纯环境场景固定机位预览插件（按需懒加载，不进主游戏包）。
import { FirstLevelWhiteboxField } from "./Script_FirstLevelWhiteboxField.mjs";
import { CreateScenePreviewBackdrop, CreateScenePreviewPhase } from "./Script_DevTools.mjs";
import { SceneInfo } from "./Data_SceneAssets.mjs";
import { IsSceneCamera } from "./Script_SceneDoc.mjs";
import { SandboxInstance } from "./Script_SandboxPluginKit.mjs";

const ROADSIDE_DUST_VOLUME = "EastTrackSoilBurst";

function FixedSceneCamera(host, poseForFrame) {
  const camera = host.camera;
  return () => {
    host.SetViewmodelHidden(true);
    const pose = poseForFrame();
    const radians = Math.PI / 180;
    camera.position.set(...pose.position);
    camera.rotation.set(pose.pitchDeg * radians, pose.yawDeg * radians, 0, "YXZ");
    if (camera.fov !== pose.fovDeg) {
      camera.fov = pose.fovDeg;
      camera.updateProjectionMatrix();
    }
  };
}

function RoadsideSoil(vfx, { x, z }, y) {
  const range = (min, max) => ({ mode: "twoConstants", min, max });
  const debris = vfx.FallingSoil({ preset: "SoilHeavyCrumble", config: {
    emitter: { shape: "area", position: [x, y + 0.065, z], width: 0.34, length: 0.32, distribution: "streams",
      streams: 5, streamWidth: 0.062, rotation: [Math.PI, 0, 0.20], clearance: 0.018, seed: 411806 },
    timing: { mode: "once", duration: 0.29, frequency: 60, quantity: 1.35, variation: 0.16,
      intensity: [[0, 1.55], [0.38, 1.21], [0.83, 0.64], [1, 0]] },
    motion: { wind: [0.21, 0, 0.12], turbulence: 0.032 },
    grains: { amount: 39, size: range(0.0025, 0.021), sizeBias: 1.52, speed: range(1.7, 6.7), spread: 2.9,
      gravity: 1.11, drag: 0.58, life: range(0.44, 1.1), color: [0.039, 0.032, 0.026, 0.85], shutter: 0.010, minPixel: 0.34,
      trailOpacity: 0.67, impactDust: 0.005, deposit: false, maxParticles: 1120 },
    clods: { amount: 1.58, size: range(0.022, 0.105), sizeBias: 1.94, speed: range(1.5, 6.6), spread: 3,
      gravity: 1.02, drag: 0.31, life: range(0.54, 1.49), color: [0.046, 0.035, 0.028, 1], aspect: [1, 0.70, 0.86],
      maxParticles: 42, impactDust: 0.55, maxBounces: 1, fragmentChance: 0.07 },
    dust: { amount: 3.0, size: range(0.23, 0.47), speed: range(0.62, 4.35), spread: 1.46, gravity: 0.19,
      life: range(0.65, 1.75), color: [0.067, 0.051, 0.042, 0.33], density: 1.86, diffusion: 2.06, sourceSpread: 0.14,
      veil: false, aspect: 1.20, fadeIn: 0.024, volumetric: false, impactAmount: 0.66, maxParticles: 86 },
    budget: { distance: 48, fadeDistance: 12, rayChecks: 84, grainCollision: false },
  } }).id;
  const plume = vfx.particles.VolumeBurst([x, y + 0.012, z], {
    asset: ROADSIDE_DUST_VOLUME, life: 1.38,
    density: 10.9, color: [1, 1, 1, 0.92], fadeIn: 0.059, seed: 34,
  })?.id;
  return { debris, plume };
}

function SceneryPreview(sceneId, extraPbrSets = [], soilMarker, loadFigures) {
  const phase = CreateScenePreviewPhase(SceneInfo(sceneId));
  return {
    phase, World: FirstLevelWhiteboxField,
    startup: {
      sceneryOnly: true,
      graphicsProfile: "high",
      pbrSets: extraPbrSets && ["Ground", "CraterScorched", "Steel", "WoodStock", "GrenadePbr", "DadaoPbr", ...extraPbrSets],
      audio: { voice: false, ambience: false, music: false, sfx: [] },
    },
    Create(host) {
      const { battlefield, camera, vfx, state } = host;
      const { layout } = battlefield;
      const backdrop = CreateScenePreviewBackdrop(host);
      const volumetrics = host.post.volumetricsPass;
      const fogHandles = (layout.fogVolumes || []).map(({ position: [x, y, z], size: [rx, ry, rz], ...look }) =>
        volumetrics.AddFogVolume({ ...look, position: { x, y, z }, size: { x: rx, y: ry, z: rz } }));
      const spawn = layout.spawn || { x: 0, z: 0, yawDeg: 0 };
      const defaultPose = layout.camera || {
        position: [spawn.x, battlefield.StaticGroundHeight(spawn.x, spawn.z) + 1.65, spawn.z],
        yawDeg: spawn.yawDeg, pitchDeg: 0, fovDeg: 55,
      };
      let pose = defaultPose;
      const ApplyPose = FixedSceneCamera(host, () => pose);
      const impact = soilMarker && layout.landmarks?.find((marker) => marker.id === soilMarker);
      const ground = impact && battlefield.StaticGroundHeight(impact.x, impact.z);
      let untilImpact = 0.4;
      let impactAge = null;
      let soil = null;
      let figures = null;
      let disposed = false;
      const RemoveSoil = () => {
        if (soil?.debris && vfx.particles.FallingSoil.entries.has(soil.debris)) vfx.particles.FallingSoil.Remove(soil.debris);
        if (soil?.plume && vfx.particles.systems.has(soil.plume)) vfx.particles.Clear(soil.plume);
        soil = null;
      };
      const runtime = {
        api: {
          SetCamera(next) {
            if (!IsSceneCamera(next)) return false;
            pose = { ...next, position: [...next.position] };
            return true;
          },
          State: () => ({
            scene: layout.scene, camera: pose, backdrop: backdrop.Stats(), error: phase.blockout.sceneError,
            props: battlefield.scenePropStats?.stats.props ?? 0,
            propTriangles: battlefield.scenePropStats?.stats.propTriangles ?? 0,
            missing: battlefield.scenePropStats?.missing ?? [],
            terrainTriangles: battlefield.stats.groundTris,
            terrainLayers: battlefield.terrainLayers?.setName ?? null,
            fogVolumes: fogHandles.length,
            terrainSet: battlefield.terrainLayers?.setName,
            smoke: vfx.smokeSources.size,
            ...(loadFigures ? { figures: figures?.ids || [] } : {}),
            ...(impact ? { impactAge, soil: soil ? vfx.particles.FallingSoil.Inspect(soil.debris) : null } : {}),
          }),
        },
        Update(dt) {
          if (figures && !figures.root.parent) host.scene.add(figures.root);
          if (impact) {
            untilImpact -= dt;
            if (untilImpact <= 0) {
              RemoveSoil();
              soil = RoadsideSoil(vfx, impact, ground);
              untilImpact += 12;
              impactAge = 0;
            }
            if (impactAge !== null) impactAge += dt;
          }
          vfx.Update(dt, camera, state.elapsed);
        },
        Dispose() {
          disposed = true;
          figures?.Dispose();
          for (const handle of fogHandles) volumetrics.RemoveFogVolume(handle);
          RemoveSoil();
          backdrop.Dispose();
          host.SetViewmodelHidden(false);
        },
      };
      return SandboxInstance(runtime, {
        debugName: "ScenePreview", ownsFrame: true, dropDebugOnDispose: true,
        OnInstalled: ApplyPose,
        UpdateCamera: ApplyPose,
        PostOptions: () => ({
          ...(pose.vignette === undefined ? {} : { vignette: pose.vignette }),
          ...(pose.nearFocusM ? { nearDofFocus: pose.nearFocusM, nearDofRange: pose.nearFocusM * 0.6,
            nearDofStrength: 0.72, nearDofMaxPx: 4.5 } : {}),
        }),
        Warmup: async () => {
          if (impact) vfx.particles.renderer.volumes.Pool(ROADSIDE_DUST_VOLUME);
          const preparingFigures = loadFigures?.(host, layout.landmarks).then((loaded) => {
            if (disposed) loaded.Dispose();
            else figures = loaded;
          });
          await Promise.all([vfx.particles.Ready(), preparingFigures]);
        },
      });
    },
  };
}

const SCENERY_BUILDERS = {
  firstLevelScenePreview: () => SceneryPreview("FirstLevel", null),
  dugoutAidOpenFields: () => SceneryPreview("DugoutAidOpenFields", null),
  gengjiazhuangFieldApproach: () => SceneryPreview("GengjiazhuangFieldApproach"),
  gengjiazhuangEastSmoke: () => SceneryPreview("GengjiazhuangEastSmoke", ["Sandbag"]),
  tanketteAdvanceEastTrack: () => SceneryPreview("TanketteAdvanceEastTrack",
    ["Sandbag", "WoodCrate", "HandcartWood"], "RoadsideSoilBurst",
    async (host, landmarks) => (await import("./Script_EastTrackFigures.mjs")).BuildEastTrackFigures(host, landmarks)),
  aircraftEvacuationDitch: () => SceneryPreview("AircraftEvacuationDitch", ["WoodCrate", "WoodBeam", "HandcartWood", "Sandbag"]),
};

export function CreatePlugin(id) {
  const build = SCENERY_BUILDERS[id];
  if (!build) throw new Error(`Unknown scenery preview plugin: ${id}`);
  return build();
}
