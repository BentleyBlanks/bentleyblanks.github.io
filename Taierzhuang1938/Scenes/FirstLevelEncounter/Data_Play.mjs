// Play configuration belongs to this scene. Existing campaign data is untouched.
export const ENCOUNTER_PLAY = {
  scene:"FirstLevelEncounter", schema:"tengxian-encounter-play/1",
  ui:{stop:"■ 停止 Play",loadFailed:"Play 加载失败",dead:"顺子阵亡",complete:"本段试玩完成",retry:"停止后可从当前关键帧重新开始",interact:"F · 继续当前交互",clear:"清除当前目标",reach:"前往目标"},
  reachM:3, routeReachM:1.2, orderEveryS:0.15, corpseKeepM:100,
  startWeapon:"HanYang", civilianModel:"oldGeng",
  inventory:{spareClips:12,grenades:3,bundles:2},
  casts:{player:"shunzi",winter:"comrade",luo:"luo",he:"heyoutian",liu:"liuwencai",yao:"yaowa",geng:"geng",nier:"nier",interpreter:"interpreter"},
  interactionBeats:["01d","03a","04a","06d","06f","06h","09f","09g","09h","10h"],
  clearGroups:{"09i":["KitchenGuard"],"09j":["VillageGun","VillageRifles","GengHouse"]},
  signals:[{time:40,id:"DugoutCollapsed"},{beat:"04c",id:"L1TrunkLoaded"},{beat:"05a",id:"CartDeparted"},{beat:"06e",id:"L1TrunkTossed"},{beat:"06i",id:"L1SunkenRoadBlocked"},{beat:"09i",id:"SideGateOpen"},{beat:"10a",id:"MgSilenced"},{beat:"10a",id:"EastGateBurst"},{beat:"10d",id:"NorthYardGatesBroken"},{beat:"10g",id:"BarrageHit"},{beat:"10i",id:"LaneWallCollapse"}],
  music:{"01":"firstLevelShellShock","02":"firstLevelTrenchPulse","03":"firstLevelSapTrench","04":"firstLevelFrontLine","05":"firstLevelIronSiege","06":"firstLevelIronSiege","07":"firstLevelDusk","08":"firstLevelWitness","09":"firstLevelCloseQuartersPressure","10":"firstLevelOpenTheWay"},
};
