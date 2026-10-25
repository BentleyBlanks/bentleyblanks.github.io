// Visual reconstruction, not a measured Tengxian ammunition specification.
// TM-E 30-480 (1944), ch. X §17: red/green/white stars, parachute variants,
// reported signal-pistol burning duration 4–15 s. See docs/Data_FlareEffects.md.
export const FLARE_EFFECTS = Object.freeze({
  SignalRed: Object.freeze({label:"红色信号弹", kind:"signal", physical:true, parachute:false,
    apexM:100, ascendS:4.515, igniteS:.12, burnS:3.6, fadeS:.4, adaptS:6,
    descendMS:0, driftMS:1.2, swayM:0, lightColor:0xff2110, groundLux:0,
    candleCd:600, maxIntensity:600, lightRadiusM:110, exposeSight:1, adaptSight:1, smokeRate:0}),
  Illumination: Object.freeze({label:"白光伞降照明弹", kind:"illumination", physical:true, parachute:true,
    apexM:100, ascendS:4.515, igniteS:.25, burnS:12, fadeS:.7, adaptS:6,
    descendMS:2.4, driftMS:1.2, swayM:.16, swayPeriodS:3.2, lightColor:0xfff4df,
    groundLux:0, candleCd:18000, maxIntensity:18000, lightRadiusM:260,
    exposeSight:2.4, adaptSight:.72, smokeRate:0}),
});

export const FLARE_ART = Object.freeze({
  gravity:9.81, launchHeight:1.1, openingS:.65, dragS:.45,
  canopyRadius:.6, canopyHeight:.3, cordLength:1.6, ribs:16,
  glowSize:2.2, smokeCount:96, smokeHz:16, smokeLife:6,
  sparkCount:12, sparkLife:.55,
});
