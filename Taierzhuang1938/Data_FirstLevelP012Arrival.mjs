// Pure data. Final braking only: no moving-platform or world teleport fiction.
export const P012_ARRIVAL = Object.freeze({
  brakeSeconds: 28, doorSeconds: 1.1, blackoutSeconds: 1.4,
  titleSeconds: 4, gateSignal: 'P012TrainDoor',
  referenceSpeedMps: 13,
  brakeBeats: Object.freeze([
    Object.freeze({ second: 0, text: '车外：前方到站——都坐稳了！' }),
    Object.freeze({ second: 6, text: '同行士兵：抱紧背包，车轮开始收劲了。' }),
    Object.freeze({ second: 13, text: '乘客：窗外的电杆慢下来了。' }),
    Object.freeze({ second: 20, text: '罗班长：都起来活动腿脚，准备下车。' }),
    Object.freeze({ second: 26, text: '罗班长：先别挤门，等车停稳。' }),
  ]),
  title: '山东·滕县后方兵站', date: '1938年3月',
  follow: '罗班长：背包拿好，下车跟着我。',
  audio: Object.freeze({ bed: 'trainInterior', brake: 'trainBrake', door: 'carriageDoorSlide' }),
});
