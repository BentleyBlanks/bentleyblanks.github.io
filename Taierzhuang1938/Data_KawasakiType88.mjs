// Independently reconstructed Type 88-II asset. Registration does not activate
// a new aircraft in the existing campaign, formations or strafing logic.
export const KAWASAKI_TYPE88_ASSET = Object.freeze({
  id: "KawasakiType88",
  label: "八八式侦察机二型（参考复原）",
  url: "./Model/KawasakiType88/Model_KawasakiType88.glb?v=20261024TailBracing15Surface09",
  version: "20261024TailBracing15Surface09",
  campaignEnabled: false,
  metresPerUnit: 1,
  noseDir: Object.freeze({ x: 0, z: -1 }),
  fuselageMesh: "AirframeFacetedFuselage",
  sourceTriangles: 226755,
  triangles: 79129,
  triangleBudget: 80000,
  pbr: Object.freeze({ images: 34, materials: 17, detailedMaterials: 14 }),
  dimensionsM: Object.freeze({ wingspan: 15, length: 12.28, height: 3.38 }),
  wheelRadiusM: .47,
  limitsRadians: Object.freeze({ rudder: 25 * Math.PI / 180, elevator: 25 * Math.PI / 180, aileron: 18 * Math.PI / 180 }),
  controls: Object.freeze({
    propeller: "PropellerPivot", wheelLeft: "WheelLeftPivot", wheelRight: "WheelRightPivot",
    rudder: "RudderPivot", elevatorLeft: "ElevatorLeftPivot", elevatorRight: "ElevatorRightPivot",
    aileronLeft: "AileronLeftPivot", aileronRight: "AileronRightPivot",
    aileronLowerLeft: "AileronLowerLeftPivot", aileronLowerRight: "AileronLowerRightPivot",
  }),
  pushrods: Object.freeze({ left: "AileronExternalPushrodLeft", right: "AileronExternalPushrodRight", hornY: .11, hornZ: .10 }),
  references: Object.freeze({
    notion: "https://app.notion.com/p/40260335331c81859cd8ef117fd67a59",
    primary: "https://commons.wikimedia.org/wiki/File:Kawasaki_KDA-2_03_(1_20th_scale_model).png",
    historic: "https://www.airwar.ru/enc/other1/kda2.html",
    specification: "https://ja.wikipedia.org/wiki/八八式偵察機",
    campaignEvidence: "https://ousar.lib.okayama-u.ac.jp/files/public/5/53301/20160528122710481090/scs_014_047_070.pdf",
  }),
  reconstructionScope: "Type 88-II scout, museum model 12 appearance. Subtype, serial and colour are not established for an Uchida squadron aircraft. Hidden structure and unlisted part dimensions remain image-derived reconstruction.",
});
