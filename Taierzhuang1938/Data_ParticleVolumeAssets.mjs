// Volume_ is a 3D scalar-field sequence, not a raster texture. Source archives
// remain local; sidecars in Volume/ record hashes, sampling and CC0 provenance.
export const PARTICLE_VOLUME_ASSETS=Object.freeze({
 Campfire:{url:'./Volume/Volume_Campfire.bin.gz?v=202610100100',albedo:[.05,.04,.03],description:'JangaFX CC0 Small Camp Fire'},
 ChimneySmoke:{url:'./Volume/Volume_ChimneySmoke.bin.gz?v=202610100100',albedo:[.32,.31,.29],description:'JangaFX CC0 Industrial Chimney Smoke'},
 DenseSmoke:{url:'./Volume/Volume_DenseSmoke.bin.gz?v=202610100100',albedo:[.32,.31,.29],description:'JangaFX CC0 High-Res Smoke Plume'},
 DitchFireSmoke:{url:'./Volume/Volume_DitchFireSmoke.bin.gz?v=2026112401',albedo:[.061,.057,.054],
   source:'authored',frameCount:12,description:'Rolling fire plume above the left bank of the sunken road'},
 EastSmokeBank:{url:'./Volume/Volume_EastSmokeBank.bin.gz?v=2026112309',albedo:[.103,.108,.111],source:"authored",description:'Advecting soot bank and wind shear over east Gengjiazhuang'},
 EastTrackSoot:{url:'./Volume/Volume_EastTrackSoot.bin.gz?v=2026112407',albedo:[.094,.087,.084],
   source:'authored',description:'Layered windblown soot for the east track'},
 EastTrackSoilBurst:{url:'./Volume/Volume_EastTrackSoilBurst.bin.gz?v=2026112401',albedo:[.077,.061,.050],
   bounds:[1.87,2.32,1.61],source:'authored',description:'Grounded core of the east track soil spray'},
 GroundExplosion:{url:'./Volume/Volume_GroundExplosion.bin.gz?v=202610100100',albedo:[.42,.34,.24],bounds:[7,9,8.16],duration:6.738624338624338,description:'JangaFX CC0 Ground Explosion'},
 DustImpact:{url:'./Volume/Volume_DustImpact.bin.gz?v=202610100100',albedo:[.42,.34,.24],bounds:[10,4.5,13],duration:6.704761904761905,description:'JangaFX CC0 Grenade Dust Impact'},
 SunkenRoadHaze:{url:'./Volume/Volume_SunkenRoadHaze.bin.gz?v=2026112401',albedo:[.0835,.082,.084],
   source:'authored',frameCount:24,description:'Procedural rolling haze for the sunken road'},
});
export const PARTICLE_VOLUME_QUALITY=Object.freeze({
 low:{capacity:128,steps:24,shadowSteps:2},medium:{capacity:160,steps:32,shadowSteps:3},
 high:{capacity:192,steps:48,shadowSteps:4},ultra:{capacity:256,steps:64,shadowSteps:5},
});
