// Authored first-person bridge-clip reload. Times are normalized to the existing
// weapon reload duration; distances are metres and rotations are YXZ radians.
// Support poses describe the load through the left palm, not camera movement.
export const FPS_RIFLE_RELOAD = Object.freeze({
  blend: [[0, 0], [0.18, 1], [0.88, 1], [1, 0]],
  bodyOffset: {
    shoulders: { right: [0.004, 0.012, -0.020], left: [-0.006, 0.018, -0.012] },
    elbowPoles: { right: [0.08, 0.02, 0], left: [-0.05, 0.04, 0] },
  },
  support: [
    [0.000, 0, 0, 0, 0, 0, 0],
    [0.070, -0.010, 0.010, 0.018, 0.025, 0.090, -0.110],
    [0.165, -0.041, 0.047, 0.075, 0.105, 0.390, -0.540],
    [0.235, -0.044, 0.050, 0.082, 0.085, 0.420, -0.570],
    [0.310, -0.037, 0.055, 0.073, 0.075, 0.370, -0.510],
    [0.470, -0.040, 0.052, 0.079, 0.100, 0.405, -0.550],
    [0.535, -0.039, 0.055, 0.077, 0.090, 0.395, -0.535],
    [0.625, -0.042, 0.047, 0.084, 0.060, 0.415, -0.565],
    [0.685, -0.039, 0.053, 0.078, 0.095, 0.390, -0.530],
    [0.790, -0.033, 0.055, 0.071, 0.115, 0.350, -0.485],
    [0.850, -0.040, 0.047, 0.081, 0.080, 0.400, -0.540],
    [0.925, -0.034, 0.038, 0.068, 0.110, 0.350, -0.470],
    [0.970, -0.008, 0.009, 0.015, 0.020, 0.075, -0.100],
    [0.988, 0.002, -0.001, -0.003, -0.006, -0.018, 0.025],
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
  boltSlide: [[0, 0], [0.155, 0], [0.245, 1], [0.825, 1], [0.905, 0], [1, 0]],
  boltTurn: [[0, 0], [0.105, 0], [0.155, 1], [0.905, 1], [0.935, 0], [1, 0]],
  press: [[0, 0], [0.520, 0], [0.545, 0.10], [0.615, 0.88], [0.650, 1], [1, 1]],
  clipVisible: [0.315, 0.760],
  loadedRoundClearanceM: 0.004,
  // The calibrated hand frame was measured with the bolt fully lifted.
  boltContactReferenceRad: 1.35,
  // Exact contact during the working beats; arcs apply only to released hands.
  hand: [
    { at: 0.075, anchor: "bolt", shape: "open", offset: [0.016, 0.008, 0.018], arc: [0.008, 0.012, 0.008] },
    { at: 0.105, anchor: "bolt" },
    { at: 0.255, anchor: "bolt" },
    { at: 0.315, anchor: "clip", arc: [0.030, -0.012, 0.020] },
    { at: 0.490, anchor: "clip" },
    { at: 0.540, anchor: "press", arc: [0.008, 0.012, 0.004] },
    { at: 0.650, anchor: "press" },
    { at: 0.690, anchor: "clip", arc: [0.010, 0.014, 0.006] },
    { at: 0.750, anchor: "clip" },
    { at: 0.820, anchor: "bolt", arc: [0.022, 0.018, 0.020] },
    { at: 0.940, anchor: "bolt" },
    { at: 0.965, anchor: "bolt", shape: "open", offset: [0.020, 0.010, 0.020], gripRotationMix: 0.55 },
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
    { at: 0.715, anchor: "clear", shape: "open" },
    ...FPS_RIFLE_RELOAD.hand.slice(-3),
  ],
  tactical: {
    oldClipVisible: [0.275, 0.365],
    oldClip: [[0.275, 0], [0.310, 1], [0.360, 2]],
    clip: [
      [0.365, 0.140, -0.220, 0.140, 0.500, 0, 0.700],
      [0.405, 0.105, -0.105, 0.095, 0.360, 0.045, 0.470],
      [0.470, 0.035, 0.063, 0.025, 0.160, -0.030, 0.150],
      [0.515, 0.004, 0.039, 0.003, 0.030, 0, 0.035],
      [0.540, 0, 0.010, 0, 0, 0, 0], [1, 0, 0.010, 0, 0, 0, 0],
    ],
    press: [[0, 0], [0.560, 0], [0.585, 0.10], [0.665, 0.88], [0.700, 1], [1, 1]],
    seatedAt: 0.54, retainedAt: 0.725,
    hand: [
      ...FPS_RIFLE_RELOAD.hand.slice(0, 3),
      { at: 0.275, anchor: "latch", shape: "latch" },
      { at: 0.310, anchor: "oldClip" },
      { at: 0.360, anchor: "oldClip" },
      { at: 0.385, anchor: "clip" }, { at: 0.530, anchor: "clip" },
      { at: 0.580, anchor: "press", arc: [0.008, 0.012, 0.004] },
      { at: 0.700, anchor: "press" },
      { at: 0.755, anchor: "clear", shape: "open" },
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
