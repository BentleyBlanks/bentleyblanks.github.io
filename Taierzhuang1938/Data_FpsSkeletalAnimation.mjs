// Blender-authored first-person animation assets and presentation settings.
export const FPS_SKELETAL_ANIMATION = Object.freeze({
  version: "20261102233000", fps: 60,
  weaponIds: Object.freeze(['HanYang']),
  clips: Object.freeze(['Idle', 'Reload']),
  runtimeEnabled: true,
});

// Reloads played as one Blender clip instead of the procedural reload tracks.
// HanYang `Reload` is digitised beat by beat from the COD WWII Type 38 reload
// (2026-11-02; clip second = reference second - 0.33), see docs/Data_RifleReloadRealism.md.
// The clip starts with the bolt closed. With the bolt already held open (last round
// fired) it starts at `openSkipS`, after the hand has let go of the pulled-back bolt,
// and every start cross-fades from the current pose over `blendInS` (`adsBlendInS` when it
// starts from the sights: the rifle comes down further). `controls` are the viewmodel
// nodes the clip owns; `usedPacket` only shows when a partial packet is ejected.
export const FPS_SKELETAL_RELOADS = Object.freeze({
  HanYang: Object.freeze({
    clip: 'Reload', openSkipS: 0.86, blendInS: 0.16, adsBlendInS: 0.28,
    controls: Object.freeze(['weaponMount', 'reloadPivot', 'part_bolt', 'part_cockingPiece',
      'packetProp', 'packetRounds', 'usedPacketProp', 'usedPacketRounds']),
    usedPacket: Object.freeze(['usedPacketProp']),
  }),
});

export const FPS_ANIMATION_LABELS = Object.freeze({
  Idle: '持枪呼吸',
  Reload: '换弹（对标 COD 三八式）',
});
