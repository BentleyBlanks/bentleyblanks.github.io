// Historical placement rationale and sources: docs/Data_FirstLevelFortifications.md.
// Authored gameplay coordinates, not surveyed 1938 positions. X east, Z south, metres.
export const MISSION_DEFENSE_POSTS = Object.freeze([
  {id:"StationDefense",x:-65,z:48,w:5.4,h:.85,d:.75},
  {id:"CommunicationNorthDefense",x:-13,z:-98,w:.75,h:.7,d:5.4},
  {id:"CommunicationBendDefense",x:-29,z:-52,w:.75,h:.7,d:5.4},
  {id:"CommunicationSouthDefense",x:-46,z:16,w:.75,h:.7,d:5.4},
  {id:"TransferRoadDefense",x:105,z:86,w:5.4,h:.95,d:.75},
]);

// Existing human-scale solid envelopes become layered bags, retaining their cover/route contract.
export function IsMissionSandbagBlock(id) {
  if(id.includes("BagSeam"))return false;
  return /^(FrontParapet|FrontTraverseCover|MachineGunSideCover|MachineGunRest$|BundleParapet$|FlankParapet$|WithdrawCover|GuardWaitingCover|GuardWaitingWing|VillageRoadBlock$|VillageApproachCover$|TransferEastCover$|TransferCorner$|TransferWestCover$|DrainCorner$|RearExitCover$|FinalAlleyCover$)/.test(id)
    || MISSION_DEFENSE_POSTS.some(post=>post.id===id);
}

export const MISSION_DEFENSE_ASSETS = Object.freeze([
  "battlefieldSandbag01", "battlefieldSandbag02", "battlefieldSandbag03",
  "battlefieldBarbedWire02", "battlefieldBeamObstacle01", "battlefieldSupplyBox",
  "battlefieldCompartmentCrate", "battlefieldCanvasCover01",
]);

// Wire protects the flanks, with broken lanes; no belt across the tank or withdrawal route.
// Individual obstacles keep their measured native dimensions. No filled OBB around an open nest.
export const MISSION_DEFENSE_OBJECTS = Object.freeze([
  ...[-63,-59.8,-56.6,-53.4,-46.8,-43.6,-40.4].map((x,i)=>({id:`WestWire${i}`,asset:"battlefieldBarbedWire02",x,z:-147,ry:0,scale:1,solid:true})),
  ...[44,47.2,50.4,57,60.2,63.4].map((x,i)=>({id:`EastWire${i}`,asset:"battlefieldBarbedWire02",x,z:-137,ry:.12,scale:1,solid:true})),
  {id:"WestRoadTimber",asset:"battlefieldBeamObstacle01",x:-55,z:-139,ry:.3,scale:1,solid:true},
  {id:"EastRoadTimber",asset:"battlefieldBeamObstacle01",x:62,z:-129,ry:-.25,scale:1,solid:true},
  {id:"TransferWireNorth",asset:"battlefieldBarbedWire02",x:104,z:100,ry:Math.PI/2,scale:1,solid:true},
  {id:"TransferWireSouth",asset:"battlefieldBarbedWire02",x:107,z:130,ry:Math.PI/2,scale:1,solid:true},
  {id:"StationReserveStores",asset:"battlefieldSupplyBox",x:-57,z:61,ry:.2,scale:1,solid:true},
  {id:"FrontAmmunition",asset:"battlefieldCompartmentCrate",x:-29,z:-120,ry:.15,scale:1,solid:true},
  {id:"TransferReserveStores",asset:"battlefieldSupplyBox",x:102,z:108,ry:.4,scale:1,solid:true},
  {id:"StationCanvas",asset:"battlefieldCanvasCover01",x:-56,z:62.5,ry:.2,scale:1,solid:false},
]);

export const MISSION_DEFENSE_PACKING = Object.freeze({
  spanM:1.85, layerM:.4, sectorM:32, overlapM:.22, groundEmbedM:.04,
});
