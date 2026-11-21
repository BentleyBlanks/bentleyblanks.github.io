import { MakeBlockoutPhase } from "./Script_EditorBlockoutLevels.mjs";
import { GetEncounterVariantSpec } from "./Script_EncounterVariants.mjs";

const PAYLOAD_KEY = "tengxian1938_encounter_play_session_v1";

function ResolveInitialVariantSpec() {
  try {
    const fromUrl = new URLSearchParams(globalThis.location?.search || "").get("variant");
    if (fromUrl) return GetEncounterVariantSpec(fromUrl);
    const raw = globalThis.sessionStorage?.getItem(PAYLOAD_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed?.variantId) return GetEncounterVariantSpec(parsed.variantId);
  } catch {}
  return GetEncounterVariantSpec();
}

const initialSpec = ResolveInitialVariantSpec();
const regionMaxZ = initialSpec.playRegionMaxZ || 1440;

export const ENCOUNTER_PLAY_PHASE = MakeBlockoutPhase({
  key: "FirstLevelEncounter",
  label: "第一关 · Encounter Play",
  scene: {
    kind: "scene",
    url: `./Scenes/${initialSpec.scene}/Scene_${initialSpec.scene}.json`,
    region: { minX: -160, maxX: 320, minZ: -480, maxZ: regionMaxZ },
    priorSignals: ["Stage0105Done"],
    placeholder: { bounds: { minX: -160, maxX: 320, minZ: -480, maxZ: regionMaxZ }, spawn: { x: 66.5, z: 64.5, yawDeg: 90 } },
  },
});
