// Authored first-person reload. Times are normalized to the weapon's current
// weapon reload duration; distances are metres and rotations are YXZ radians.
// Support poses describe the load through the left palm, not camera movement.
export const FPS_RIFLE_RELOAD = Object.freeze({
  // A load acts on the supporting hand before the elbow settles. Responses
  // use seconds so preview scrubbing and a different frame rate agree.
  effort: {
    frequencyHz: 3.6, decayPerS: 13, impulseGain:2.4,tailFadeAt:.7,shoulderScale:.18,
    elbowDelayS: .035, shoulderDelayS: .055,
    tailS: .46, finishAt: .985,
    events: [
      {at:.145,pose:[0,.002,.003,.012,.004,-.008],right:[.015,.010,.008],left:[-.008,-.005,.004]},
      {at:.235,pose:[.001,-.002,.008,-.010,.006,.012],right:[.025,-.012,.018],left:[-.010,-.008,.005]},
      {at:.555,pose:[-.001,-.007,.002,-.018,.004,-.012],right:[.025,-.025,.012],left:[-.014,-.016,.006]},
      {at:.650,pose:[0,.003,-.002,.010,-.003,.007],right:[-.012,.016,-.006],left:[.005,.010,-.003]},
      {at:.890,pose:[0,-.002,-.006,.009,-.004,-.008],right:[-.018,-.010,-.016],left:[.006,-.008,-.004]},
      {at:.935,pose:[0,-.003,.002,-.008,.004,.010],right:[.012,-.010,.008],left:[-.005,-.006,.002]},
    ],
  },
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
    { at: 0.235, anchor: "bolt" },
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
  // Thumb opposition leaves/returns to the current authored holding pose
  // independently of the already-authored spatial hand contact path.
  thumbHandoff: {releaseEnd:.060,recoverStart:.948},
  fingerHandoff: {releaseStart:.018,releaseEnd:.035},
  seatedAt: 0.50,
  retainedAt: 0.68,
  clearOffset: [0.030, 0.045, 0.025],
  latchOffset: [0.040, 0.006, -0.025],
  // Release the original grip before changing its digits or palm frame.
  // The bolt grip remains unchanged until its pads have cleared the knob.
  handClearance: {
    grip: [.060, 0, 0], unwrap: [.022, 0, 0], bolt: [.050, 0, 0], boltExit: [.030, -.030, .015], prop: [.050, .010, 0],
    press: [.050, .025, .010], latch: [.050, 0, 0],
    boltEntryExitAt: .26, boltEntryTurnAt: .90,
    boltReleaseExitAt: .35, boltReturnReadyAt: .76,
  },
  hand: [
    { at: .018, anchor: "gripUnwrap" },
    { at: .035, anchor: "gripClear", flow: true },
    { at: .065, anchor: "boltClear", flow: true },
    { at: .085, anchor: "bolt", fingerLagS: [0,.004,.012,.020,.028] },
    { at: .235, anchor: "bolt" },
    { at: .265, anchor: "boltClear", flow: true, through: true },
    { at: .315, anchor: "clip", flow: true, fingerLagS: [0,.008,.016,.024,.030] },
    { at: .490, anchor: "clip" },
    { at: .540, anchor: "press", arc: [.012, .016, .006], flow: true, fingerLagS: [.020,0,.004,.008,.012] },
    { at: .650, anchor: "press" },
    { at: .715, anchor: "pressClear", flow: true, through: true },
    { at: .755, anchor: "boltClear", flow: true },
    { at: .820, anchor: "bolt" },
    { at: .940, anchor: "bolt" },
    { at: .948, anchor: "boltExit", shape: "packetBolt" },
    { at: .958, anchor: "boltClear", flow: true, through: true },
    { at: .988, anchor: "gripClear", flow: true },
  ],
  tactical: {
    effort: {
      frequencyHz:3.6,decayPerS:13,impulseGain:2.4,tailFadeAt:.7,shoulderScale:.18,
      elbowDelayS:.035,shoulderDelayS:.055,tailS:.46,finishAt:.985,
      events: [
        {at:.145,pose:[0,.002,.003,.012,.004,-.008],right:[.015,.010,.008],left:[-.008,-.005,.004]},
        {at:.235,pose:[.001,-.002,.008,-.010,.006,.012],right:[.025,-.012,.018],left:[-.010,-.008,.005]},
        {at:.595,pose:[-.001,-.007,.002,-.018,.004,-.012],right:[.025,-.025,.012],left:[-.014,-.016,.006]},
        {at:.700,pose:[0,.003,-.002,.010,-.003,.007],right:[-.012,.016,-.006],left:[.005,.010,-.003]},
        {at:.890,pose:[0,-.002,-.006,.009,-.004,-.008],right:[-.018,-.010,-.016],left:[.006,-.008,-.004]},
        {at:.935,pose:[0,-.003,.002,-.008,.004,.010],right:[.012,-.010,.008],left:[-.005,-.006,.002]},
      ],
    },
    oldClipVisible: [0.305, 0.415],
    oldClip: [[0.305, 0], [0.350, 1], [0.415, 2]],
    clip: [
      [0.415, 0.140, -0.220, 0.140, 0.500, 0, 0.700],
      [0.455, 0.105, -0.105, 0.095, 0.360, 0.045, 0.470],
      [0.500, 0.035, 0.063, 0.025, 0.160, -0.030, 0.150],
      [0.530, 0.004, 0.039, 0.003, 0.030, 0, 0.035],
      [0.540, 0, 0.010, 0, 0, 0, 0], [1, 0, 0.010, 0, 0, 0, 0],
    ],
    press: [[0, 0], [0.560, 0], [0.585, 0.10], [0.665, 0.88], [0.700, 1], [1, 1]],
    seatedAt: 0.54, retainedAt: 0.725,
    hand: [
      { at: .018, anchor: "gripUnwrap" },
      { at: .035, anchor: "gripClear", flow: true },
      { at: .065, anchor: "boltClear", flow: true },
      { at: .085, anchor: "bolt", fingerLagS: [0,.004,.012,.020,.028] },
      { at: .235, anchor: "bolt" },
      { at: .255, anchor: "boltClear", flow: true },
      { at: .290, anchor: "latchClear", shape: "latch", flow: true, through: true },
      { at: .305, anchor: "latch", shape: "latch", flow: true },
      { at: .320, anchor: "latchClear", shape: "latch", flow: true, through: true },
      { at: .350, anchor: "oldClip", flow: true },
      { at: .415, anchor: "oldClip" },
      { at: 0.435, anchor: "clip", flow: true, fingerLagS: [0,.008,.016,.024,.030] }, { at: 0.530, anchor: "clip" },
      { at: 0.580, anchor: "press", arc: [0.008, 0.012, 0.004], flow: true, fingerLagS: [.020,0,.004,.008,.012] },
      { at: 0.700, anchor: "press" },
      { at: .745, anchor: "pressClear", flow: true, through: true },
      { at: .785, anchor: "boltClear", flow: true },
      { at: .820, anchor: "bolt" },
      { at: .940, anchor: "bolt" },
      { at: .948, anchor: "boltExit", shape: "packetBolt" },
      { at: .958, anchor: "boltClear", flow: true, through: true },
      { at: .988, anchor: "gripClear", flow: true },
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
  // Smith's Gewehr 88 cutaway specifies a full quarter-turn before withdrawal.
  // Keep the palm's measured 1.35-rad reference independent of mechanism travel.
  liftAngleRad: 1.35,
  liftAngleRadByWeapon: { HanYang: Math.PI / 2 },
  // Bring the rifle slightly toward the shoulder while the bolt is worked;
  // a fully lifted handle must not force a straight arm or stretch the wrist.
  supportOffsetByWeapon: { HanYang: [0, 0, 0.020] },
  thumbHandoffByWeapon: {HanYang:{releaseEnd:.100,recoverStart:.900}},
  graspAt: .140, approachFraction:.60, liftLead:.105, releaseGap: .010, clearFraction: .40,
  liftLeadByWeapon:{HanYang:.160},
  clearOffset: [.016,.008,.020],
});

export const FPS_TOP_MAG_RELOAD = Object.freeze({
  blend:[[0,0],[.15,1],[.88,1],[1,0]],
  bodyOffset:{shoulders:{right:[.055,.010,-.035],left:[0,.012,0]},elbowPoles:{right:[.20,0,0],left:[-.02,0,0]},authoredElbows:{right:true}},
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
  discardVelocity:[-.65,.20,-.05],
  // Free palms clear the receiver's right side before changing height. Held
  // contact frames have zero path tangents; only the exterior waypoints flow.
  handApproach:[
    {at:.025,anchor:"grip",offset:[.015,-.020,.015],gripRotationMix:1,shape:"zbClear"},
    {at:.040,anchor:"grip",offset:[.085,.005,.010],gripRotationMix:1,shape:"zbClear"},
    {at:.120,anchor:"home",offset:[.075,.020,.010],gripRotationMix:0,shape:"zbClear"},
    {at:.135,anchor:"home",offset:[.040,.010,0],gripRotationMix:0,shape:"relax"},
  ],
  handGraspAt:.16,handNewGraspAt:.46,
  emptyHandClear:{at:.35,offset:[.070,0,0],shape:"relax",through:true,
    fingerLagS:[0,.008,.013,.018,.022]},
  handReturn:[
    {at:.795,anchor:"home",offset:[.035,.010,.005],gripRotationMix:0,shape:"zbMagazine"},
    {at:.835,anchor:"home",offset:[.085,.015,.010],gripRotationMix:.20,shape:"relax"},
    {at:.895,anchor:"grip",offset:[.085,.040,-.050],gripRotationMix:.75,shape:"relax",through:true},
    {at:.935,anchor:"grip",offset:[.050,-.020,.015],gripRotationMix:1,shape:"zbClear"},
  ],
  charge:[[0,0],[.82,0],[.875,1],[.935,0],[1,0]],
});

// Type 11: six intact five-round rifle chargers stacked vertically. The
// follower is lifted before loading; rounds are stripped only while firing.
// FW Type 11 Nambu and Japanese Infantry Weapons, Intelligence Bulletin.
// Hopper bounds measured on the private, grip-normalized imported mesh.
export const FPS_HOPPER_RELOAD = Object.freeze({
  effort: {
    frequencyHz:3.9,decayPerS:15,impulseGain:2.4,tailFadeAt:.7,shoulderScale:.18,
    elbowDelayS:.035,shoulderDelayS:.055,tailS:.40,finishAt:.985,
    events:[
      {at:.16,pose:[-.001,-.003,.003,-.010,.004,-.010],right:[.010,-.006,.006],left:[-.012,-.014,.008]},
      {at:.84,emptyOnly:true,pose:[0,-.003,.002,-.010,0,-.008],right:[.008,-.006,.004],left:[-.012,-.012,.006]},
      {at:.88,partialOnly:true,pose:[0,-.003,.002,-.010,0,-.008],right:[.008,-.006,.004],left:[-.012,-.012,.006]},
      {at:.910,emptyOnly:true,pose:[.001,0,.007,-.008,.005,.012],right:[.008,-.010,.008],left:[-.020,.008,.024]},
      {at:.940,emptyOnly:true,pose:[0,-.002,-.005,.009,-.003,-.008],right:[-.005,-.006,-.004],left:[.012,-.006,-.014]},
    ],
    seatPose:[0,-.004,.001,-.010,.003,-.008],
    seatRight:[.014,-.018,.008],seatLeft:[-.006,-.008,.003],
    cycleStrength:[1,.88,1.04,.92,1.08,.96],
  },
  supportHand:"right",
  blend:[[0,0],[.16,1],[.88,1],[1,0]],
  bodyOffset:{shoulders:{right:[.004,.012,-.030],left:[0,.012,0]},elbowPoles:{right:[.04,.02,0],left:[-.02,0,0]}},
  support:[
    [0,0,0,0,0,0,0],[.16,-.022,.008,.060,.10,.24,-.30],
    [.24,-.025,.003,.064,.09,.26,-.32],
    [.52,-.024,.005,.062,.10,.25,-.31],
    [.76,-.025,.003,.064,.09,.26,-.32],[.80,-.021,.009,.059,.11,.23,-.29],
    [.88,-.020,.009,.055,.12,.22,-.27],[1,0,0,0,0,0,0],
  ],
  seat:[-.118,-.063,-.120], layerPitchM:.0131,
  // The left hand lifts the rear rim up and forward around the front hinge.
  followerPivot:[-.113,.0245,-.1698], followerAngleRad:-1.42,
  followerRimOffset:[-.060,0,.038],
  // The palm approaches before turning into the grip; release reverses that
  // order so the forearm can unfold without overbending the fixed wrist.
  followerApproach:{at:.035,positionMix:.70,rotationMix:.30,offset:[-.012,-.020,.040]},
  followerRecovery:{at:.9325,positionMix:.30,rotationMix:.30,offset:[-.012,-.020,.040]},
  follower:[[0,0],[.07,0],[.16,1],[.80,1],[.88,0],[1,0]],
  // Empty hopper: close the follower, keep the firing hand on the grip, then
  // draw back and return the separate left operating handle (MID SS19 pp.92-93).
  emptyFollower:[[0,0],[.07,0],[.16,1],[.78,1],[.84,0],[1,0]],
  emptyRightRecovery:[.802,.850],
  rightRecoveryRotationMix:.45,
  charge:{
    graspAt:.875,releaseAt:.945,clearAt:.966,returnAt:.995,
    slide:[[0,0],[.875,0],[.910,1],[.940,0],[1,0]],
    approachAt:.862,approachMix:.55,approachOffset:[-.010,.010,.008],
    recoveryPositionMix:.20,recoveryRotationMix:.38,recoveryOffset:[-.010,.008,.010],
    leftShoulderOffset:[0,.030,-.070],body:[[0,0],[.81,0],[.86,1],[.96,1],[1,0]],
    support:[[0,0,0,0,0,0,0],[.78,0,0,0,0,0,0],
      [.86,0,.065,-.045,0,0,-.10],[.94,0,.065,-.045,0,0,-.10],[1,0,0,0,0,0,0]],
  },
  // Small timing differences avoid six identical stop-start motions. The last
  // charger is still seated before the unchanged inventory commit at .78.
  drawAt:.20, cycle:.10, cycles:[.20,.296,.401,.497,.602,.701,.80],
  alignPhase:.35, seatPhase:.60, releasePhase:.64, clearPhase:.76,
  approachHeightM:.075,
  releaseFingerLagS:[0,.008,.014,.020,.026],
  pouchOffset:[.10,-.060,.090], clearOffset:[.015,.025,.018],
  oldStackLift:[[0,0],[.13,0],[.16,1],[.195,2],[1,2]],
  oldStackVisibleUntil:.195,
  clipDropVelocity:[-.08,-.28,.035],
});
