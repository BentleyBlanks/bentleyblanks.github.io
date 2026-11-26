// 车辆车辙测试场插件（按需懒加载，场景来自 Scenes/TestVehicleTracks/Scene_TestVehicleTracks.json）。
import { VEHICLE_TRACK_RANGE_PHASE } from "./Data_VehicleTrackRange.mjs";
import { VehicleTrackRangeField, DecorateVehicleTrackRangeLayout } from "./Script_VehicleTrackRangeField.mjs";
import { VehicleTrackRange } from "./Script_VehicleTrackRange.mjs";
import { AttachSceneAsset } from "./Script_SceneAssetLoader.mjs";
import { SandboxInstance } from "./Script_SandboxPluginKit.mjs";

export function CreatePlugin() {
  return {
    phase: AttachSceneAsset(VEHICLE_TRACK_RANGE_PHASE, "TestVehicleTracks", {
      layoutTransform: (layout) => DecorateVehicleTrackRangeLayout(layout),
    }),
    World: VehicleTrackRangeField,
    Create: (h) => {
      const runtime = new VehicleTrackRange({
        battlefield: h.battlefield,
        player: h.player,
        camera: h.camera,
        scene: h.scene,
        library: h.library,
        canvas: h.canvas,
        renderer: h.renderer,
        post: h.post,
        state: h.state,
        CanUse: h.CanUse,
        SetViewmodelHidden: h.SetViewmodelHidden,
      });
      runtime.UpdateCamera(0);
      return SandboxInstance(runtime, {
        debugName: "VehicleTracks",
        ownsFrame: true,
        dropDebugOnDispose: true,
        UpdateCamera: (dt) => runtime.UpdateCamera(dt),
      });
    },
  };
}
