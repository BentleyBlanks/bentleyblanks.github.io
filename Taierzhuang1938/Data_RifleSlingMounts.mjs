// Game/model coordinates in metres. Measured from the actual swivel geometry in BlenderMCP,
// 2026-11-05. HanYang: named attachment loops; Type38: welded loose swivel components.
// The ZhongZheng source has no sling loops: the binding uses a band/stock lashing instead.
export const RIFLE_SLING_MOUNTS = {
  HanYang: {
    source: 'Model/HanYang173R/Model_HanYang173R.glb',
    front: {position:[0,.0068,-.581932],throat:[0,-.0116,0],bar:[0,0,1],up:[0,1,0],part:'RearBand_ExternalAttachmentLoop'},
    rear: {position:[0,-.036744,.043710],throat:[0,-.0116,0],bar:[0,0,1],up:[0,1,0],part:'RearStock_ExternalAttachmentLoop'},
  },
  Type38: {
    source:'Model/Model_Type38.tzm.json',
    front:{position:[.000420,-.003034,-.652613],throat:[0,-.0116,0],bar:[1,0,0],up:[0,1,0],part:'front swivel, wood mesh loose component'},
    rear:{position:[.000420,-.080926,.069831],throat:[0,-.0116,0],bar:[1,0,0],up:[0,1,0],part:'rear swivel, wood mesh loose component'},
  },
  ZhongZheng: {
    source:'Model/Model_ZhongZheng.tzm.json',lashing:true,
    front:{position:[0,.011096,-.765401],bindingPosition:[0,.031296,-.765401],bar:[1,0,0],up:[0,1,0],part:'front band lashing'},
    rear:{position:[0,-.078736,.13],bindingPosition:[0,-.033836,.13],bar:[1,0,0],up:[0,1,0],part:'stock lashing'},
  },
};
