// Pure data. Playable final approach: the wagon, player and camera never move as
// a fake platform; disposable exterior references provide the braking parallax.
export const P012_ARRIVAL = Object.freeze({
  brakeSeconds: 30, doorSeconds: 1.1, blackoutSeconds: 1.4,
  titleSeconds: 4, gateSignal: 'P012TrainDoor',
  referenceSpeedMps: 13,
  brakeBeats: Object.freeze([
    Object.freeze({ second: 0, text: '列车员：滕县快到了——都坐稳！' }),
    Object.freeze({ second: 6, text: '幺娃：顺哥，坐一路了，腿都麻了。' }),
    Object.freeze({ second: 13, text: '何有田：下车莫乱跑，跟着班长。' }),
    Object.freeze({ second: 20, text: '罗班长：都起来活动腿脚，背包拿好。' }),
    Object.freeze({ second: 26, text: '罗班长：别挤门，等车停稳再下。' }),
  ]),
  title: '山东·滕县后方兵站', date: '1938年3月',
  follow: '罗班长：背包拿好，下车跟着我。',
  audio: Object.freeze({ bed: 'trainInterior', brake: 'trainBrake', door: 'carriageDoorSlide' }),
});
