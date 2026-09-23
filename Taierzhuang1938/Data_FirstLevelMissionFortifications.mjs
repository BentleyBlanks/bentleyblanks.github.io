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
  // 沟沿上的射击位是 PCG 摆的（Script_TrenchPlan 的 bays 通道），id 是
  // `<段名>TrenchBay<n>` —— 段名在前，所以这条不能锚在开头。
  if(/TrenchBay\d+$/.test(id))return true;
  return /^(FrontParapet|FrontTraverseCover|MachineGunSideCover|MachineGunRest$|RightNestFrontRest$|BundleParapet$|FlankParapet$|WithdrawCover|GuardWaitingCover|GuardWaitingWing|VillageRoadBlock$|VillageApproachCover$|TransferEastCover$|TransferCorner$|TransferWestCover$|DrainCorner$|RearExitCover$|FinalAlleyCover$)/.test(id)
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
  // 2026-09-23 proposal A: the west flank belt moved north with the berm (west of Zhou's gun).
  ...[-63,-59.8,-56.6,-53.4,-46.8,-43.6,-40.4].map((x,i)=>({id:`WestWire${i}`,asset:"battlefieldBarbedWire02",x,z:-153,ry:0,scale:1,solid:true})),
  // Backslope belt east of the gap: the guards on the scrapes can only come down through the gap.
  // It runs 1 m SOUTH of the gap point (z -149): every line the runtime casts onto the gap converges there -
  // the MG seat and the captured gun from the east (z -150.3..-152.4), the tank at Block/Squeeze from the
  // north-east (z -151.3..-158) and the west door (K10, z -150.3) - and wire stakes and strands are ray
  // colliders. North of those lines (z -152.4, then tilted) it cut the seat line and then the tank line.
  // The two east rolls sit 0.6 m further north to clear the right low trench's north-lip firing bay (11.3,-147.8).
  // 09.24 review (K10): the four west rolls sit 1.2 m further south (z -147.8) so that, seen from the west door and
  // the seat, their stakes stand clear of a man crossing the gap instead of on top of him.
  ...[-2.9,.3,3.5,6.7,9.9,13.1].map((x,i)=>({id:`BackslopeWire${i}`,asset:"battlefieldBarbedWire02",x,z:x>8?-149.6:-147.8,ry:0,scale:1,solid:true})),
  ...[55,58.2,61.4,67.8,71.2,74.4].map((x,i)=>({id:`EastWire${i}`,asset:"battlefieldBarbedWire02",x,z:-137,ry:.12,scale:1,solid:true})),
  {id:"WestRoadTimber",asset:"battlefieldBeamObstacle01",x:-55,z:-139,ry:.3,scale:1,solid:true},
  {id:"EastRoadTimber",asset:"battlefieldBeamObstacle01",x:62,z:-129,ry:-.25,scale:1,solid:true},
  {id:"TransferWireNorth",asset:"battlefieldBarbedWire02",x:104,z:100,ry:Math.PI/2,scale:1,solid:true},
  // 2026-09-19 第二波：侧巷挪到装载区东南（SideAlley*，巷身 x 96..112、z 118..126），
  // 这卷网退到巷子**南边**的空地上 —— 横在巷口或巷身里等于把 12 的第二处威胁
  // 封死在自己家门口（TransferAlley* 的出击折线从 x≈96 的巷口往西走）。
  {id:"TransferWireSouth",asset:"battlefieldBarbedWire02",x:106,z:133,ry:Math.PI/2,scale:1,solid:true},
  {id:"StationReserveStores",asset:"battlefieldSupplyBox",x:-57,z:61,ry:.2,scale:1,solid:true},
  {id:"FrontAmmunition",asset:"battlefieldCompartmentCrate",x:-24.2,z:-104.6,ry:.15,scale:1,solid:true},
  {id:"TransferReserveStores",asset:"battlefieldSupplyBox",x:102,z:108,ry:.4,scale:1,solid:true},
  {id:"StationCanvas",asset:"battlefieldCanvasCover01",x:-56,z:62.5,ry:.2,scale:1,solid:false},
]);

export const MISSION_DEFENSE_PACKING = Object.freeze({
  spanM:1.85, layerM:.4, sectorM:32, overlapM:.22, groundEmbedM:.04,
});

// Matches _blender/Script_BuildBarbedWireSet.py: BuildStakeFence, in source GLB metres.
// Wire has open sight/fire gaps; a single full-height collider would make it a bulletproof wall.
export const MISSION_STAKE_FENCE = Object.freeze({
  posts:[[-1.55,-.05],[0,.035],[1.55,-.025]],height:1.28,postRadius:.035,
  wireHeights:[.38,.72,1.06],wireHalfLength:1.6,wireRadius:.014,sag:.055,sagStep:.012,
});
