import { MakeBlockoutPhase } from "./Script_EditorBlockoutLevels.mjs";
import { GetEncounterVariantSpec } from "./Script_EncounterVariants.mjs";
import { FIRST_LEVEL_CAMPAIGN_VARIANT_ID } from "./Data_FirstLevelCampaign.mjs";
import { CHAPTER } from "./Data_MissionCh1.mjs";

const PAYLOAD_KEY = "tengxian1938_encounter_play_session_v1";

function ResolveInitialVariantSpec({ campaign = false, variantId = null } = {}) {
  try {
    if (variantId) return GetEncounterVariantSpec(variantId);
    const fromUrl = new URLSearchParams(globalThis.location?.search || "").get("variant");
    if (fromUrl) return GetEncounterVariantSpec(fromUrl);
    if (!campaign) {
      const raw = globalThis.sessionStorage?.getItem(PAYLOAD_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed?.variantId) return GetEncounterVariantSpec(parsed.variantId);
    }
  } catch {}
  return GetEncounterVariantSpec(campaign ? FIRST_LEVEL_CAMPAIGN_VARIANT_ID : undefined);
}

export function CreateEncounterPlayPhase({ variantId = null, campaign = false } = {}) {
  const spec = ResolveInitialVariantSpec({ campaign, variantId });
  const regionMaxZ = spec.playRegionMaxZ || 1440;
  const base = MakeBlockoutPhase({
    key: "FirstLevelEncounter",
    label: campaign ? "第一关 · 往南的路" : "第一关 · Encounter Play",
    scene: {
      kind: "scene",
      url: `./Scenes/${spec.scene}/Scene_${spec.scene}.json`,
      region: { minX: -160, maxX: 320, minZ: -480, maxZ: regionMaxZ },
      priorSignals: ["Stage0105Done"],
      placeholder: { bounds: { minX: -160, maxX: 320, minZ: -480, maxZ: regionMaxZ }, spawn: { x: 66.5, z: 64.5, yawDeg: 90 } },
    },
  });
  if (!campaign) {
    base.encounterVariant = spec.id;
    return base;
  }
  return Object.assign(base, {
    id: "FirstLevelP012Whitebox",
    contentId: CHAPTER.id,
    sandbox: true,
    sandboxKey: "firstLevelP012Whitebox",
    chapter: true,
    artId: CHAPTER.id,
    date: "一九三八年三月",
    label: "第一关 · 往南的路",
    place: "滕县外围 · 界河至北沙河",
    encounterVariant: spec.id,
    encounterCampaign: true,
    minutes: 45,
    brief: [
      "日军突破前沿防线，掩蔽部受炮火震塌。稳住阵脚，突围护送伤员经北沙河撤往滕县。",
      "WASD 移动 · Shift 冲刺 · C 蹲伏 · Z 卧倒 · F 交互 · V 大刀 · G 手榴弹 · H 集束手榴弹",
    ],
    metaText: ["第一关完整流程", spec.title, "遭遇设计同步"],
    playerCast: "shunzi",
    mechanics: { pinFinalZone: true },
    hud: { objectiveMarkers: false, targetDistance: false },
    nraPool: 60,
    poolGain: 0,
    ijaPool: 60,
    ijaPressure: 0,
    loadoutOverride: {
      primary: "HanYang",
      secondary: null,
      melee: "Dadao",
      throwables: { Grenade: 3, GrenadeBundle: 2 },
      spareClips: 12,
    },
    whitebox: {
      ...base.whitebox,
      encounterCampaign: true,
      triggerAimBeforeRecoil: true,
      actorCapacity: 144,
      actualEventsOnly: true,
      storyBeats: [],
      activities: {},
    },
  });
}

export const ENCOUNTER_PLAY_PHASE = CreateEncounterPlayPhase({ campaign: false });
