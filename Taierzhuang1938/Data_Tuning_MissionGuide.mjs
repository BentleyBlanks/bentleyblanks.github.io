// Project tuning for the COD WWII / World at War campaign guidance convention.
// Project values, not claimed measurements of either game.
export const MISSION_GUIDE_TUNING = Object.freeze({
  leaderIndex: 0, stopSpacingM: 16, stopOffsetM: 2.1, arrivalM: .45,
  rejoinM: 7, passedCorridorM: 5, groundDeltaM: .35, capsuleM: .38,
  routeJoinM: 2.2, routeJoinToleranceM:.12, routeJoinProbeY:-.01, collinearEpsilonM: .000001,
  waitDistanceM: 36, resumeDistanceM: 9, markerHeightM: 2.15,
  initialOrderS: 2, storyOrderDelayS: 18, quietAfterStoryS: 3,
  reminderS: 36, repeatS: 55, waitReminderS: 9, voiceRangeM: 55,
  gesturePeriodS: 7, gestureSeconds: 1.7, gestureBlendS: .3,
  watchHoldS: .6, threatSuppression: .35, nearMarkerM: 3.5,
  markerHalfWidthPx:95, markerDetailBottomPx:32, subtitleGapPx:12,
  gestureHand: {x:-.46,y:1.55,z:-.34}, gesturePullM:.22, gestureHz:1.5,
  gesturePole: {x:-.72,y:1.1,z:-.18}, gestureMoveThreshold:.08,
});
