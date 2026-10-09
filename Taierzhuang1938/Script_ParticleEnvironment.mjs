import * as THREE from 'three';
// Small render scenes (the command room, authoring fixtures) use the same
// renderer contract without constructing the battlefield or its VfxSystem.
export function CreateParticleEnvironment(){
 const texture=new THREE.DataTexture(new Uint8Array([0,0,0,0]),1,1,THREE.RGBAFormat);texture.needsUpdate=true;
 const shared={uTime:{value:0},uNormalDepth:{value:texture},uDepthValid:{value:0},uResolution:{value:new THREE.Vector2(1,1)},uGlobalFade:{value:1},
   uFogDensity:{value:0},uFogMax:{value:0},uFogColorSky:{value:new THREE.Vector3()},uSkyColor:{value:new THREE.Vector3(.65,.7,.8)},
   uSunColor:{value:new THREE.Vector3(1,1,1)},uSunDirection:{value:new THREE.Vector3(1,1,1).normalize()},uParticleFireMap:{value:texture},uParticleFireReady:{value:0}};
 return {shared,Dispose:()=>texture.dispose()};
}
