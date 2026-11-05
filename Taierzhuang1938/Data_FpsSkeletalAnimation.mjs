// Blender-authored first-person animation assets and presentation settings.
export const FPS_SKELETAL_ANIMATION = Object.freeze({
  version: "20261105024236", fps: 60,
  weaponIds: Object.freeze(['HanYang']),
  clips: Object.freeze(['Idle', 'Reload']),
  runtimeEnabled: true,
});

// Reloads played as one Blender clip instead of the procedural reload tracks.
// HanYang `Reload` is digitised beat by beat from the COD WWII Type 38 reload
// (2026-11-02; clip second = reference second - 0.33), see docs/Data_RifleReloadRealism.md.
// The clip starts with the bolt closed. With the bolt already held open (last round
// fired) it starts at `openSkipS`, once the hand has left the pulled-back bolt and receiver,
// and every start cross-fades from the current pose over `blendInS` (`adsBlendInS` when it
// starts from the sights: the rifle comes down further). `controls` are the viewmodel
// nodes the clip owns; `usedPacket` only shows when a partial packet is ejected.
export const FPS_SKELETAL_RELOADS = Object.freeze({
  HanYang: Object.freeze({
    clip: 'Reload', openSkipS: 1.12, blendInS: 0.16, adsBlendInS: 0.34,
    controls: Object.freeze(['weaponMount', 'reloadPivot', 'part_bolt', 'part_cockingPiece',
      'packetProp', 'packetRounds', 'usedPacketProp', 'usedPacketRounds']),
    usedPacket: Object.freeze(['usedPacketProp']),
    // First-person layer while the clip plays ([clip s, weight], eased): depth squeezed by
    // `depthScale` (a narrower view; the arms keep their layout), so the rifle and hands read
    // ~1.5x bigger, as the reference's stock and support hand do at the same muzzle position.
    // The bolt cycle's low pose does the same (FPS_BOLT_CYCLE.HanYang.workDepthScale 0.6).
    // Not while the bolt is opened: closer in, the knob and the working hand leave the frame (the
    // reference's rifle points straighter in than our arms can hold it); it closes in as the
    // rifle turns to take the packet.
    view: Object.freeze({ depthScale: 0.65,
      weight: Object.freeze([[0, 0], [0.72, 0], [1.15, 1], [2.98, 1], [3.38, 0]]),
      // Projection-preserving expansion, separate from the FOV squeeze above:
      // keeps the real close-up fist beyond the render near plane.
      cameraScale: 3 }),
  }),
});

export const FPS_ANIMATION_LABELS = Object.freeze({
  Idle: '持枪呼吸',
  Reload: '换弹（对标 COD 三八式）',
});
