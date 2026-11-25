// 枪械白盒靶场插件（按需懒加载，场景来自 Scenes/TestWeapon/Scene_TestWeapon.json）。
import { WEAPON_RANGE_PHASE, WEAPON_RANGE_STARTUP } from "./Data_WeaponRange.mjs";
import { WeaponRangeField } from "./Script_WeaponRangeField.mjs";
import { WeaponRangeRuntime } from "./Script_WeaponRangeRuntime.mjs";
import { AttachSceneAsset } from "./Script_SceneAssetLoader.mjs";
import { SandboxInstance } from "./Script_SandboxPluginKit.mjs";

export function CreatePlugin() {
  return {
    phase: AttachSceneAsset(WEAPON_RANGE_PHASE, "TestWeapon"),
    World: WeaponRangeField,
    startup: WEAPON_RANGE_STARTUP,
    Create: (h) => {
      const runtime = new WeaponRangeRuntime({
        ai: h.ai, player: h.player, camera: h.camera, state: h.state, actorFactory: h.actorFactory, battlefield: h.battlefield,
        scene: h.scene, library: h.library, interact: h.interact, viewmodel: h.viewmodel,
        Weapon: h.Weapon, Pickup: h.Pickup, Refill: h.Refill,
      });
      return SandboxInstance(runtime, {
        debugName: "WeaponRange",
        updateSlot: "beforeAi",
        armory: runtime,
        // 补给要先认得「这是枪械射击场」才补成无限：装配层登记完这个实例再补。
        OnInstalled: () => h.EnsureDebugInventory(),
      });
    },
  };
}
