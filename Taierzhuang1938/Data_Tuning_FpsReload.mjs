// Authored first-person bridge-clip reload. Times are normalized to the existing
// weapon reload duration; distances are metres and rotations are YXZ radians.
// Support poses describe the load through the left palm, not camera movement.
export const FPS_RIFLE_RELOAD = Object.freeze({
  blend: [[0, 0], [0.18, 1], [0.88, 1], [1, 0]],
  support: [
    [0.000, 0, 0, 0, 0, 0, 0],
    [0.070, -0.010, -0.008, 0.018, 0.025, 0.090, -0.110],
    [0.165, -0.041, -0.022, 0.080, 0.105, 0.390, -0.540],
    [0.235, -0.044, -0.024, 0.087, 0.085, 0.420, -0.570],
    [0.310, -0.037, -0.019, 0.078, 0.075, 0.370, -0.510],
    [0.470, -0.040, -0.023, 0.084, 0.100, 0.405, -0.550],
    [0.535, -0.039, -0.021, 0.082, 0.090, 0.395, -0.535],
    [0.625, -0.042, -0.029, 0.089, 0.060, 0.415, -0.565],
    [0.685, -0.039, -0.023, 0.083, 0.095, 0.390, -0.530],
    [0.790, -0.033, -0.018, 0.076, 0.115, 0.350, -0.485],
    [0.850, -0.040, -0.022, 0.086, 0.080, 0.400, -0.540],
    [0.925, -0.034, -0.020, 0.073, 0.110, 0.350, -0.470],
    [0.970, -0.008, -0.005, 0.018, 0.020, 0.075, -0.100],
    [0.988, 0.002, 0.001, -0.003, -0.006, -0.018, 0.025],
    [1.000, 0, 0, 0, 0, 0, 0],
  ],
  // Relative to the guide: clear the receiver on an arc, align, then seat.
  // The clip remains seated while the thumb pushes the rounds as one stack.
  clip: [
    [0.285, 0.140, -0.220, 0.140, 0.500, 0, 0.700],
    [0.340, 0.105, -0.105, 0.095, 0.360, 0.045, 0.470],
    [0.420, 0.035, 0.063, 0.025, 0.160, -0.030, 0.150],
    [0.475, 0.004, 0.039, 0.003, 0.030, 0, 0.035],
    [0.500, 0, 0.010, 0, 0, 0, 0],
    [0.720, 0, 0.010, 0, 0, 0, 0],
    [0.770, 0.020, 0.067, 0.010, -0.070, 0, -0.100],
    [0.800, 0.050, 0.170, 0.020, -0.200, 0, -0.300],
  ],
  boltSlide: [[0, 0], [0.120, 0], [0.225, 1], [0.840, 1], [0.925, 0], [1, 0]],
  boltTurn: [[0, 0], [0.055, 0], [0.120, 1], [0.920, 1], [0.965, 0], [1, 0]],
  press: [[0, 0], [0.520, 0], [0.545, 0.10], [0.615, 0.88], [0.650, 1], [1, 1]],
  clipVisible: [0.285, 0.800],
  // Exact contact during the working beats; arcs apply only to released hands.
  hand: [
    { at: 0.075, anchor: "bolt", shape: "open", offset: [0.016, 0.008, 0.018], arc: [0.008, 0.012, 0.008] },
    { at: 0.105, anchor: "bolt" },
    { at: 0.225, anchor: "bolt" },
    { at: 0.285, anchor: "clip", arc: [0.030, -0.012, 0.020] },
    { at: 0.490, anchor: "clip" },
    { at: 0.540, anchor: "press", arc: [0.008, 0.012, 0.004] },
    { at: 0.650, anchor: "press" },
    { at: 0.700, anchor: "clip", arc: [0.010, 0.014, 0.006] },
    { at: 0.790, anchor: "clip" },
    { at: 0.845, anchor: "bolt", arc: [0.022, 0.018, 0.020] },
    { at: 0.955, anchor: "bolt" },
    { at: 0.972, anchor: "bolt", shape: "open", offset: [0.012, 0.004, 0.014], gripRotationMix: 0.45 },
  ],
});
