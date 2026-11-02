// Authored input grace and mechanical events. Normalized reload times match
// the production hand/part animations; one timeline owns sound and ammo commit.
export const FIRE_CONTROL = Object.freeze({
  inputBufferS: 0.15, sprintFireDelayS: 0.22, timerEpsilonS: 1e-8,
});

const Event = (at, id, cue = null, extra = {}) => Object.freeze({ at, id, cue, ...extra });
export const RELOAD_EVENTS = Object.freeze({
  stripper: Object.freeze([
    Event(0.085, "open", "bolt", { offset: 0, maxDuration: 0.28, volume: 0.45 }),
    Event(0.50, "insert", "stripperLoad", { maxDuration: 0.55, volume: 0.75 }),
    Event(0.65, "loaded"),
    Event(0.825, "close", "bolt", { offset: 0.50, maxDuration: 0.18, volume: 0.45 }),
    Event(0.925, "lock", "bolt", { offset: 0.70, maxDuration: 0.06, volume: 0.5 }),
  ]),
  enBloc: Object.freeze([
    Event(0.085, "open", "bolt", { maxDuration: 0.28, volume: 0.45 }),
    Event(0.50, "insert", "stripperLoad", { maxDuration: 0.55, volume: 0.75 }),
    Event(0.65, "loaded"),
    Event(0.825, "close", "bolt", { offset: 0.50, maxDuration: 0.18, volume: 0.45 }),
    Event(0.925, "lock", "bolt", { offset: 0.70, maxDuration: 0.06, volume: 0.5 }),
  ]),
  enBlocPartial: Object.freeze([
    Event(0.085,"open","bolt",{maxDuration:0.28,volume:0.45}),
    Event(0.305,"releasePacket","bolt",{maxDuration:0.06,volume:0.30}),
    Event(0.54,"insert","stripperLoad",{maxDuration:0.55,volume:0.75}),
    Event(0.70,"loaded"),
    Event(0.825,"close","bolt",{offset:0.50,maxDuration:0.18,volume:0.45}),
    Event(0.925,"lock","bolt",{offset:0.70,maxDuration:0.06,volume:0.5}),
  ]),
  topMag: Object.freeze([
    Event(0.16, "remove", "magIn", { maxDuration: 0.18, volume: 0.4 }),
    Event(0.70, "insert", "magIn", { maxDuration: 0.3, volume: 0.75 }),
    Event(0.76, "loaded"),
    Event(0.88, "close", "bolt", { offset: 0.50, maxDuration: 0.26, volume: 0.5 }),
  ]),
  hopper: Object.freeze([
    ...Array.from({ length: 6 }, (_, index) => Event(0.26 + index * 0.10, `clip${index + 1}`,
      "stripperLoad", { maxDuration: 0.24, volume: 0.55 })),
    Event(0.78, "loaded"),
    Event(0.80, "follower", "bolt", { offset: 0.70, maxDuration: 0.10, volume: 0.35 }),
    Event(0.875,"chargePull","bolt",{maxDuration:0.16,volume:0.45,emptyOnly:true}),
    Event(0.910,"chargeReturn","bolt",{offset:0.50,maxDuration:0.14,volume:0.40,emptyOnly:true}),
  ]),
  stripFeed: Object.freeze([
    Event(0.20, "remove", "bolt", { maxDuration: 0.20, volume: 0.4 }),
    Event(0.58, "insert", "stripperLoad", { maxDuration: 0.5, volume: 0.7 }),
    Event(0.72, "loaded"),
    Event(0.88, "close", "bolt", { offset: 0.50, maxDuration: 0.26, volume: 0.5 }),
  ]),
  boxMag: Object.freeze([
    Event(0.15, "remove", "magIn", { maxDuration: 0.18, volume: 0.4 }),
    Event(0.67, "insert", "magIn", { maxDuration: 0.3, volume: 0.7 }),
    Event(0.71, "loaded"),
    Event(0.88, "close", "bolt", { offset: 0.50, maxDuration: 0.26, volume: 0.5 }),
  ]),
});

// Reloads played as one Blender clip (Data_FpsSkeletalAnimation.FPS_SKELETAL_RELOADS) carry
// their events in clip seconds, where the clip's own beats land. HanYang's bolt sounds are
// the recorded boltHanYang cut at its transients (lift click .23, rear stop .25, forward
// slam .61, lock .68), as in FPS_BOLT_CYCLE; the reference's own hits are 0.88 (rear stop),
// 2.18 (packet in the guides), 2.47 (packet home), 3.10-3.23 (forward), 3.34 (lock).
// `partialOnly`: only when a partial packet is ejected first.
export const RELOAD_CLIP_EVENTS = Object.freeze({
  HanYang: Object.freeze([
    Object.freeze({ atS: 0.30, id: "open", cue: "boltHanYang", offset: 0.215, maxDuration: 0.035, volume: 0.42 }),
    Object.freeze({ atS: 0.55, id: "rear", cue: "boltHanYang", offset: 0.240, maxDuration: 0.085, volume: 0.42 }),
    Object.freeze({ atS: 0.98, id: "releasePacket", cue: "bolt", maxDuration: 0.06, volume: 0.30, partialOnly: true }),
    Object.freeze({ atS: 1.85, id: "insert", cue: "stripperLoad", maxDuration: 0.55, volume: 0.75 }),
    Object.freeze({ atS: 2.14, id: "loaded", cue: null }),
    Object.freeze({ atS: 2.86, id: "close", cue: "boltHanYang", offset: 0.555, maxDuration: 0.110, volume: 0.42 }),
    Object.freeze({ atS: 2.97, id: "lock", cue: "boltHanYang", offset: 0.665, maxDuration: 0.100, volume: 0.42 }),
  ]),
});

// A 30-round rigid strip, cartridges pointing along local -Z. The mouth is
// on the receiver's left; the working hand inserts the strip laterally.
export const STRIP_FEED_RELOAD = Object.freeze({
  seat: [-0.045, 0.035, -0.16],
  widthM: 0.33, roundPitchM: 0.0105, roundCount: 30,
  showAt: 0.34, seatedAt: 0.72, handBackAt: 0.94,
});
