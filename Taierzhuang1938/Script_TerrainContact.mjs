// Reusable terrain/mesh contact field. Same height lattice and diagonal as physics;
// opaque material blending, independent of camera depth, with dirty blast updates.
import * as THREE from 'three';

export class TerrainContactField {
  constructor(terrain) {
    this.terrain = terrain;
    this.data = terrain.heights.slice();
    this.texture = new THREE.DataTexture(this.data, terrain.cols+1, terrain.rows+1,
      THREE.RedFormat, THREE.FloatType);
    this.texture.minFilter = this.texture.magFilter = THREE.NearestFilter;
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.generateMipmaps = false; this.texture.needsUpdate = true;
    this.grid = new THREE.Vector4(terrain.minX,terrain.minZ,terrain.stepX,terrain.stepZ);
    this.updates = 0;
  }
  Update(rects, heightAt) {
    if (!rects.length) return;
    const t=this.terrain,w=t.cols+1;
    for(const r of rects) {
      const x0=Math.max(0,Math.floor((r.minX-t.minX)/t.stepX)-1),x1=Math.min(t.cols,Math.ceil((r.maxX-t.minX)/t.stepX)+1);
      const z0=Math.max(0,Math.floor((r.minZ-t.minZ)/t.stepZ)-1),z1=Math.min(t.rows,Math.ceil((r.maxZ-t.minZ)/t.stepZ)+1);
      for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++)this.data[z*w+x]=heightAt(t.minX+x*t.stepX,t.minZ+z*t.stepZ);
    }
    this.texture.needsUpdate=true;this.updates++;
  }
  Reset(){this.data.set(this.terrain.heights);this.texture.needsUpdate=true;this.updates++;}
  Dispose(){this.texture.dispose();}
}

export const TERRAIN_CONTACT_GLSL = /* glsl */`
uniform sampler2D uContactHeight;
uniform vec4 uContactGrid;
vec4 ContactSurface(vec2 world) {
  vec2 size=vec2(textureSize(uContactHeight,0))-1.0;
  vec2 q=clamp((world-uContactGrid.xy)/uContactGrid.zw,vec2(0),size);
  ivec2 cell=ivec2(min(floor(q),size-1.0));vec2 f=q-vec2(cell);
  float a=texelFetch(uContactHeight,cell,0).r;
  float b=texelFetch(uContactHeight,cell+ivec2(1,0),0).r;
  float c=texelFetch(uContactHeight,cell+ivec2(0,1),0).r;
  float d=texelFetch(uContactHeight,cell+ivec2(1,1),0).r;
  vec2 slope;float h;
  if(f.x+f.y<=1.0){h=a+(b-a)*f.x+(c-a)*f.y;slope=vec2(b-a,c-a)/uContactGrid.zw;}
  else{h=d+(c-d)*(1.0-f.x)+(b-d)*(1.0-f.y);slope=vec2(d-c,d-b)/uContactGrid.zw;}
  return vec4(normalize(vec3(-slope.x,1.0,-slope.y)),h);
}`;
