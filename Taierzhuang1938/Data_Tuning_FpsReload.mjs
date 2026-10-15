// Authored first-person reload. Times are normalized to the weapon's current
// weapon reload duration; distances are metres and rotations are YXZ radians.
// Support poses describe the load through the left palm, not camera movement.
export const FPS_RIFLE_RELOAD = Object.freeze({
  blend: [[0, 0], [0.18, 1], [0.88, 1], [1, 0]],
  bodyOffset: {
    shoulders: { right: [0.004, 0.012, -0.065], left: [-0.006, 0.040, -0.012] },
    elbowPoles: { right: [0.08, 0.02, 0], left: [-0.05, 0.04, 0] },
  },
  // Small elbow leads keep the upper arm alive while palms stay in contact.
  // Columns: time, right XYZ, left XYZ; added to the calibrated pole offsets.
  elbows: [
    [0,0,0,0,0,0,0],[.14,.012,.010,.005,-.004,.004,0],
    [.24,.025,.016,.010,-.008,.006,0],[.40,.035,.025,.018,-.010,.008,.003],
    [.53,.020,.010,.012,-.006,.004,.002],[.64,.010,-.010,.018,-.012,-.008,.004],
    [.76,.025,.015,.012,-.006,.004,.002],[.91,.012,-.008,.010,-.010,-.006,.003],
    [.98,0,0,0,0,0,0],[1,0,0,0,0,0,0],
  ],
  support: [
    [0.000, 0, 0, 0, 0, 0, 0],
    [0.065, -0.006, 0.005, 0.016, 0.025, 0.070, -0.085],
    [0.145, -0.026, 0.036, 0.065, 0.080, 0.270, -0.390],
    [0.235, -0.038, 0.048, 0.083, 0.070, 0.340, -0.450],
    [0.330, -0.031, 0.049, 0.071, 0.100, 0.290, -0.400],
    [0.485, -0.033, 0.051, 0.074, 0.100, 0.300, -0.410],
    [0.545, -0.032, 0.054, 0.072, 0.100, 0.300, -0.410],
    [0.615, -0.039, 0.038, 0.082, 0.055, 0.350, -0.470],
    [0.655, -0.035, 0.046, 0.075, 0.080, 0.320, -0.430],
    [0.750, -0.031, 0.050, 0.069, 0.110, 0.280, -0.390],
    [0.825, -0.035, 0.049, 0.073, 0.100, 0.320, -0.430],
    [0.905, -0.041, 0.037, 0.083, 0.055, 0.350, -0.460],
    [0.940, -0.029, 0.040, 0.065, 0.110, 0.280, -0.370],
    [0.980, -0.005, 0.006, 0.010, 0.020, 0.040, -0.055],
    [0.994, 0.001, -0.001, -0.002, -0.004, -0.008, 0.010],
    [1.000, 0, 0, 0, 0, 0, 0],
  ],
  // Relative to the guide: clear the receiver on an arc, align, then seat.
  // The clip remains seated while the thumb pushes the rounds as one stack.
  clip: [
    [0.315, 0.140, -0.220, 0.140, 0.500, 0, 0.700],
    [0.370, 0.105, -0.105, 0.095, 0.360, 0.045, 0.470],
    [0.435, 0.035, 0.063, 0.025, 0.160, -0.030, 0.150],
    [0.480, 0.004, 0.039, 0.003, 0.030, 0, 0.035],
    [0.500, 0, 0.010, 0, 0, 0, 0],
    [0.690, 0, 0.010, 0, 0, 0, 0],
    [0.735, 0.020, 0.067, 0.010, -0.070, 0, -0.100],
    [0.760, 0.050, 0.170, 0.020, -0.200, 0, -0.300],
  ],
  boltSlide: [[0, 0], [0.145, 0], [0.235, 1], [0.825, 1], [0.890, 0], [1, 0]],
  boltTurn: [[0, 0], [0.085, 0], [0.145, 1], [0.890, 1], [0.935, 0], [1, 0]],
  press: [[0, 0], [0.520, 0], [0.545, 0.10], [0.615, 0.88], [0.650, 1], [1, 1]],
  clipVisible: [0.315, 0.760],
  loadedRoundClearanceM: 0.004,
  // The calibrated hand frame was measured with the bolt fully lifted.
  boltContactReferenceRad: 1.35,
  // Exact contact during the working beats; arcs apply only to released hands.
  hand: [
    { at: 0.055, anchor: "bolt", shape: "relax", offset: [0.016, 0.008, 0.018], arc: [0.008, 0.012, 0.008], through: true },
    { at: 0.085, anchor: "bolt" },
    { at: 0.245, anchor: "bolt" },
    { at: 0.315, anchor: "clip", arc: [0.030, -0.012, 0.020], flow: true },
    { at: 0.490, anchor: "clip" },
    { at: 0.540, anchor: "press", arc: [0.008, 0.012, 0.004], flow: true },
    { at: 0.650, anchor: "press" },
    { at: 0.690, anchor: "clip", arc: [0.010, 0.014, 0.006], flow: true },
    { at: 0.750, anchor: "clip" },
    { at: 0.785, anchor: "clip", toward: "bolt", anchorMix: 0.55, shape: "recover", offset: [0.012,0.015,0.018], through: true },
    { at: 0.820, anchor: "bolt", arc: [0.022, 0.018, 0.020] },
    { at: 0.940, anchor: "bolt" },
    { at: 0.965, anchor: "bolt", shape: "recover", offset: [0.014, 0.010, 0.010], gripPositionMix: 0.42, gripRotationMix: 0.42, through: true },
  ],
});

// Mannlicher packet: the complete clip enters the magazine and stays there.
// FW Hanyang Type 88 (2021-06-07) and How Does It Work: Clips (2021-06-16).
// A partial packet is removed before a fresh packet is brought to the action.
export const FPS_PACKET_RELOAD = Object.freeze({
  ...FPS_RIFLE_RELOAD,
  seatedAt: 0.50,
  retainedAt: 0.68,
  clearOffset: [0.030, 0.045, 0.025],
  latchOffset: [0.008, 0.006, -0.025],
  hand: [
    ...FPS_RIFLE_RELOAD.hand.slice(0, 7),
    { at: 0.730, anchor: "clear", toward: "bolt", anchorMix: 0.35, shape: "recover", through: true },
    ...FPS_RIFLE_RELOAD.hand.slice(-3),
  ],
  tactical: {
    oldClipVisible: [0.275, 0.385],
    oldClip: [[0.275, 0], [0.310, 1], [0.385, 2]],
    clip: [
      [0.390, 0.140, -0.220, 0.140, 0.500, 0, 0.700],
      [0.435, 0.105, -0.105, 0.095, 0.360, 0.045, 0.470],
      [0.490, 0.035, 0.063, 0.025, 0.160, -0.030, 0.150],
      [0.525, 0.004, 0.039, 0.003, 0.030, 0, 0.035],
      [0.540, 0, 0.010, 0, 0, 0, 0], [1, 0, 0.010, 0, 0, 0, 0],
    ],
    press: [[0, 0], [0.560, 0], [0.585, 0.10], [0.665, 0.88], [0.700, 1], [1, 1]],
    seatedAt: 0.54, retainedAt: 0.725,
    hand: [
      ...FPS_RIFLE_RELOAD.hand.slice(0, 3),
      { at: 0.275, anchor: "latch", shape: "latch", flow: true },
      { at: 0.310, anchor: "oldClip" },
      { at: 0.385, anchor: "oldClip" },
      { at: 0.405, anchor: "clip", flow: true }, { at: 0.530, anchor: "clip" },
      { at: 0.580, anchor: "press", arc: [0.008, 0.012, 0.004], flow: true },
      { at: 0.700, anchor: "press" },
      { at: 0.755, anchor: "clear", toward: "bolt", anchorMix: 0.45, shape: "recover", through: true },
      ...FPS_RIFLE_RELOAD.hand.slice(-3),
    ],
  },
});

// Metre-scale visual cartridge envelopes, not ammunition/inventory rules.
// Type 88 uses the round-nosed M/88 presentation; Type 38 has its narrower 6.5 mm projectile.
export const FPS_RELOAD_PROPS = Object.freeze({
  profiles: {
    Legacy: { caseLength: 0.048, baseRadius: 0.0046, neckRadius: 0.0044, bulletRadius: 0.0044, bulletLength: 0.020, spacing: 0.0115, jacket: "brass" },
    HanYang: { caseLength: 0.057, baseRadius: 0.00595, neckRadius: 0.00455, bulletRadius: 0.00404, bulletLength: 0.023, spacing: 0.0121, roundNose: true, jacket: "steel" },
    ZhongZheng: { caseLength: 0.057, baseRadius: 0.00595, neckRadius: 0.00455, bulletRadius: 0.00411, bulletLength: 0.023, spacing: 0.0121, jacket: "copper" },
    Type38: { caseLength: 0.050, baseRadius: 0.00565, neckRadius: 0.00385, bulletRadius: 0.00335, bulletLength: 0.025, spacing: 0.0117, jacket: "copper" },
  },
  packetWallThickness: 0.0007,
  gripReferenceBackM: 0.024,
  clipReleaseVelocity: [0.55, 0.50, 0.30],
  packetDropVelocity: [0.025, -0.22, 0.015],
});

export const FPS_BOLT_HAND = Object.freeze({
  graspAt: .140, approachFraction:.60, liftLead:.105, releaseGap: .010, clearFraction: .40,
  liftLeadByWeapon:{HanYang:.130},
  clearOffset: [.016,.008,.020],
});

export const FPS_TOP_MAG_RELOAD = Object.freeze({
  blend:[[0,0],[.15,1],[.88,1],[1,0]],
  bodyOffset:{shoulders:{right:[.004,.010,-.035],left:[0,.012,0]},elbowPoles:{right:[.04,0,0],left:[-.02,0,0]}},
  elbows:[[0,0,0,0,0,0,0],[.28,.025,.015,.010,-.006,.004,0],
    [.43,.035,-.010,.020,-.004,0,.002],[.64,.020,.025,.010,-.008,.006,0],
    [.78,.010,.005,.010,-.010,-.006,.004],[.91,.025,.010,.015,-.005,.004,0],
    [.98,0,0,0,0,0,0],[1,0,0,0,0,0,0]],
  support:[
    [0,0,0,0,0,0,0],[.15,-.030,-.048,.072,.20,.27,-.38],
    [.28,-.033,-.054,.077,.18,.29,-.40],[.43,-.027,-.043,.069,.21,.25,-.35],
    [.64,-.031,-.047,.073,.20,.28,-.38],[.76,-.034,-.058,.080,.17,.30,-.41],
    [.82,-.030,-.050,.072,.22,.27,-.37],[.90,-.025,-.043,.062,.19,.24,-.32],
    [.98,-.003,-.006,.008,.025,.035,-.045],[1,0,0,0,0,0,0],
  ],
  oldMagazine:[[0,0,0,0],[.16,0,0,0],[.28,.006,.105,.020],[.32,.025,.115,.030]],
  retainedMagazine:[[0,0,0,0],[.16,0,0,0],[.28,.006,.105,.020],[.40,.150,-.310,.140]],
  newMagazine:[
    [.43,.150,-.310,.140],[.55,.100,-.080,.070],[.64,.020,.100,.010],
    [.70,0,.050,0],[.76,0,0,0],[1,0,0,0],
  ],
  discardAt:.32,stowAt:.40,drawAt:.43,holdUntil:.78,handBackAt:.965,
  charge:[[0,0],[.82,0],[.875,1],[.935,0],[1,0]],
});

// Type 11: six intact five-round rifle chargers stacked vertically. The
// follower is lifted before loading; rounds are stripped only while firing.
// FW Type 11 Nambu and Japanese Infantry Weapons, Intelligence Bulletin.
// Hopper bounds measured on the private, grip-normalized imported mesh.
export const FPS_HOPPER_RELOAD = Object.freeze({
  blend:[[0,0],[.16,1],[.88,1],[1,0]],
  bodyOffset:{shoulders:{right:[.004,.012,-.030],left:[0,.012,0]},elbowPoles:{right:[.04,.02,0],left:[-.02,0,0]}},
  support:[
    [0,0,0,0,0,0,0],[.16,-.022,.008,.060,.10,.24,-.30],
    [.26,-.025,-.007,.064,.08,.26,-.32],[.30,-.021,.009,.059,.11,.23,-.29],
    [.36,-.025,-.004,.064,.08,.26,-.32],[.40,-.021,.010,.059,.11,.23,-.29],
    [.46,-.025,-.006,.064,.08,.26,-.32],[.50,-.021,.010,.059,.11,.23,-.29],
    [.56,-.025,-.007,.064,.08,.26,-.32],[.60,-.021,.009,.059,.11,.23,-.29],
    [.66,-.025,-.006,.064,.08,.26,-.32],[.70,-.021,.010,.059,.11,.23,-.29],
    [.76,-.026,-.008,.066,.08,.27,-.33],[.80,-.021,.009,.059,.11,.23,-.29],
    [.88,-.020,.009,.055,.12,.22,-.27],[1,0,0,0,0,0,0],
  ],
  seat:[-.118,-.063,-.120], layerPitchM:.0131,
  // The rear handle lifts the follower up and forward around its front hinge.
  followerPivot:[-.113,.0245,-.1698], followerAngleRad:-1.42,
  followerHandleOffset:[-.015,0,.038],
  follower:[[0,0],[.07,0],[.16,1],[.80,1],[.88,0],[1,0]],
  drawAt:.20, cycle:.10, alignPhase:.35, seatPhase:.60, releasePhase:.64, clearPhase:.76,
  approachHeightM:.075,
  pouchOffset:[.10,-.060,.090], clearOffset:[.015,.025,.018],
  oldStackLift:[[0,0],[.13,0],[.16,1],[.195,2],[1,2]],
  oldStackVisibleUntil:.195,
  clipDropVelocity:[-.08,-.28,.035],
});
