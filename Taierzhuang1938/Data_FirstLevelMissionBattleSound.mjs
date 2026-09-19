// Authored off-map front: no voices, damage, suppression or mission facts.
// Direct fire still comes from actual AI. Positions remain fixed in world space.
export const MISSION_BATTLE_SOUND = Object.freeze({
  profiles: {
    // 【2026-09-09】车厢那两档原来**不在表里**，而 Update 遇到没有档的 stage 直接
    // return —— 于是开场的一分钟里，外面那条前线一声都没有，然后第一发直接炸在
    // 车边上。用户问的「一开始进车厢怎么就有炮弹爆炸」就是这个：没有由远及近的
    // 铺垫，炮击是**凭空**开始的。
    //   · startAfterS —— 头二十四秒完全留给车厢自己的动静与班里那顿饭的对话；
    //   · rampFromGain / rampS —— 军列正往北开，前线从「几乎听不见」长到「就在前头」；
    //   · airCut —— 隔着木板与铁皮，外面只剩低频（落地那一发不吃这一条，它走 Blast）。
    // 2026.09.19 重构：01 在坍塌的掩蔽部里，外面的前线隔着土与木架，只剩低频；
    // 近爆之后门口破了，外面不再是闷的。
    Trapped: {gain:.62,interval:1.9,startAfterS:24,rampFromGain:.3,rampS:30,airCut:340},
    BunkerRescue:{gain:1,interval:.85,airCut:1400},
    RearTrench:{gain:.85,interval:1},
    Support: {gain:1,interval:1}, MachineGun:{gain:.55,interval:1.2}, Tank:{gain:.55,interval:1.2},
    Orders:{gain:.7,interval:1.15}, South:{gain:.46,interval:1.7},
    Village:{gain:.7,interval:1.25}, Melee:{gain:.6,interval:1.3}, Courtyard:{gain:.75,interval:1.2},
    TransferApproach:{gain:.6,interval:1.3},
    Transfer:{gain:.8,interval:1.1}, CartRide:{gain:.46,interval:1.7},
    AirFirst:{gain:.4,interval:1.5}, Carry:{gain:.65,interval:1.2},
    Dive:{gain:.35,interval:1.6}, Rescue:{gain:.6,interval:1.25},
    Regroup:{gain:.7,interval:1.2}, WallPath:{gain:.5,interval:1.5},
    ReceptionGate:{gain:.55,interval:1.4}, Handover:{gain:.55,interval:1.3},
    Death:{gain:.28,interval:1.8},
    BridgeOrders:{gain:.6,interval:1.3}, BridgeCover:{gain:.85,interval:1.1},
    BridgeWithdraw:{gain:.6,interval:1.3}, NightMarch:{gain:.3,interval:2},
  },
  sources: [
    {id:'WestRifles',cue:'rifleNraFar',x:-100,z:-210,y:5,volume:.055,airCut:1000,first:.7,intervals:[3.2,5.1,2.6,6.3]},
    {id:'EastRifles',cue:'rifleIjaFar',x:116,z:-195,y:5,volume:.055,airCut:950,first:2.1,intervals:[5.5,3.8,6.2,3]},
    {id:'FrontMachineGun',cue:'type92',x:42,z:-226,y:5,volume:.075,airCut:700,burst:5,first:3.4,intervals:[6.7,4.3,8.2,5.6]},
    {id:'NorthArtillery',cue:'amb.cannonFar',x:-72,z:-285,y:12,volume:.55,airCut:650,first:1.5,intervals:[11.2,8.4,13.7,9.5]},
    {id:'EastArtillery',cue:'amb.cannonFar',x:168,z:-250,y:12,volume:.42,airCut:600,first:7.3,intervals:[16.4,12.1,18.2,13.7]},
  ],
  speechGain:.62,
});
