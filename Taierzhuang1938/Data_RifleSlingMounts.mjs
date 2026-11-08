// Game/model coordinates in metres. Measured from the actual swivel geometry in BlenderMCP,
// 2026-11-05. HanYang: named attachment loops; Type38: welded loose swivel components.
// The ZhongZheng source has no sling loops: the binding uses a band/stock lashing instead.
export const RIFLE_SLING_MOUNTS = {
  HanYang: {
    source: 'Model/HanYang173R/Model_HanYang173R.glb',
    front: {position:[0,.0068,-.581932],throat:[0,-.007,0],bar:[0,0,1],up:[0,1,0],part:'RearBand_ExternalAttachmentLoop'},
    rear: {position:[0,-.036744,.043710],throat:[0,-.007,0],bar:[0,0,1],up:[0,1,0],part:'RearStock_ExternalAttachmentLoop'},
  },
  Type38: {
    source:'Model/Type38_511/Model_Type38_511.glb',
    front:{position:[.000419725,-.002786136,-.629531075],throat:[0,-.007,0],bar:[1,0,0],up:[0,1,0],part:'Exterior_RetainedImportedBody74'},
    rear:{position:[.000419710,-.070384779,.042830589],throat:[0,-.007,0],bar:[1,0,0],up:[0,1,0],part:'Mesh_Type38_adsNear_3'},
  },
  ZhongZheng: {
    source:'Model/Model_ZhongZheng.tzm.json',lashing:true,
    front:{position:[0,.013096,-.765401],bindingPosition:[0,.031296,-.765401],bar:[1,0,0],up:[0,1,0],part:'front band lashing'},
    rear:{position:[0,-.076736,.13],bindingPosition:[0,-.033836,.13],bar:[1,0,0],up:[0,1,0],part:'stock lashing'},
  },
};
