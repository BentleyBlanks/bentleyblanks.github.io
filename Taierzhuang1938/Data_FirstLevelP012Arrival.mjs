// Pure data. Final braking only: no moving-platform or world teleport fiction.
export const P012_ARRIVAL = Object.freeze({
  brakeSeconds: 3.2, doorSeconds: 1.1, blackoutSeconds: 1.4,
  titleSeconds: 4, gateSignal: 'P012TrainDoor',
  title: '山东·滕县后方兵站', date: '1938年3月',
  muster: '车外：一二二师的弟兄，下车集合！',
  follow: '罗班长：背包拿好，下车跟着我。',
  audio: Object.freeze({ bed: 'trainInterior', brake: 'trainBrake', door: 'carriageDoorSlide' }),
});
