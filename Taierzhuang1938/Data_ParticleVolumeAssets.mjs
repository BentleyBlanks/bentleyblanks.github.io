// Volume_ is a 3D scalar-field sequence, not a raster texture. Source archives
// remain local; sidecars in Volume/ record hashes, sampling and CC0 provenance.
export const PARTICLE_VOLUME_ASSETS=Object.freeze({
 Campfire:{url:'./Volume/Volume_Campfire.bin.gz?v=202610100100',albedo:[.05,.04,.03],description:'JangaFX CC0 Small Camp Fire'},
 ChimneySmoke:{url:'./Volume/Volume_ChimneySmoke.bin.gz?v=202610100100',albedo:[.32,.31,.29],description:'JangaFX CC0 Industrial Chimney Smoke'},
 DenseSmoke:{url:'./Volume/Volume_DenseSmoke.bin.gz?v=202610100100',albedo:[.32,.31,.29],description:'JangaFX CC0 High-Res Smoke Plume'},
 GroundExplosion:{url:'./Volume/Volume_GroundExplosion.bin.gz?v=202610100100',albedo:[.42,.34,.24],bounds:[7,9,8.16],duration:6.738624338624338,description:'JangaFX CC0 Ground Explosion'},
 DustImpact:{url:'./Volume/Volume_DustImpact.bin.gz?v=202610100100',albedo:[.42,.34,.24],bounds:[10,4.5,13],duration:6.704761904761905,description:'JangaFX CC0 Grenade Dust Impact'},
});
export const PARTICLE_VOLUME_QUALITY=Object.freeze({
 low:{capacity:128,steps:24,shadowSteps:2},medium:{capacity:160,steps:32,shadowSteps:3},
 high:{capacity:192,steps:48,shadowSteps:4},ultra:{capacity:256,steps:64,shadowSteps:5},
});
