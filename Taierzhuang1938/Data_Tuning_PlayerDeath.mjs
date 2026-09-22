// One first-person collapse: knees give way, shoulder impact, then a held ground view.
// Seconds/metres/radians; shared by camera, skeletal hands and the failure screen.
export const PLAYER_DEATH = Object.freeze({
  durationS: 1.32, impactS: .88, buckleS: .24,
  proneTimeScale: .68, eyeHeightM: .19, clearanceM: .12,
  sideTravelM: .24, forwardTravelM: .12, rollRad: 1.34,
  pitchRad: -.12, yawRad: .10, bounceM: .028,
  handsStartS: .08, handsEndS: .83, handsDropM: .36,
  gunPitchRad: -.74, gunRollRad: .24, gunDropM: .18,
  menuFadeS: .48, dofStartS: .72, dofFadeS: .6,
});
