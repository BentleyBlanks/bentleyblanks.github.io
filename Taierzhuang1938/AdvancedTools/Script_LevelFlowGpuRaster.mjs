import { EncounterGpuOverlay } from "./Script_LevelFlowGpuOverlay.mjs";
import { FLOW_RENDERING } from "../Data_Tuning_LevelFlow.mjs";
import { TERRAIN_SETS } from "../Data_Tuning_Terrain.mjs";
import { TerrainLayerUrls } from "../Script_Tuning_Terrain.mjs";
import { CAMERA_PROFILES } from "../Data_CameraProfile.mjs";
import { TONEMAP_GLSL } from "../Script_ToneMapCurves.mjs";

// One offscreen context for all panes. Each pane retains its native linear
// depth for GPU overlays and on-demand surface picking.
const Dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
let shared;
let unavailable=false;

// Shared CPU-packed 4-layer MissionPlain terrain textures (albedo+height 512²,
// normal+rough+AO 256²) for WebGL2 multi-layer height-blended terrain splatting.
const EDITOR_TERRAIN_SET = "MissionPlain";
const EDITOR_ALBEDO_SIZE = 512;
const EDITOR_SURFACE_SIZE = 256;
const SRGB_TO_LINEAR = (() => {
  const table = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    table[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }
  return table;
})();

let layerPackPromise = null;
let loadedLayerPack = null;
const layerReadyListeners = new Set();

async function FetchLayerBitmap(url, assetBase) {
  const response = await fetch(new URL(url, assetBase));
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  const blob = await response.blob();
  return createImageBitmap(blob, { premultiplyAlpha: "none", colorSpaceConversion: "none" });
}

function ResizeBitmapRgba(bitmap, size) {
  const canvas = typeof OffscreenCanvas !== "undefined"
    ? new OffscreenCanvas(size, size)
    : Object.assign(document.createElement("canvas"), { width: size, height: size });
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, size, size);
  return ctx.getImageData(0, 0, size, size).data;
}

export function PreloadEncounterTerrainLayers(onReady = null) {
  if (onReady) {
    if (loadedLayerPack) onReady(loadedLayerPack);
    else layerReadyListeners.add(onReady);
  }
  if (loadedLayerPack) return Promise.resolve(loadedLayerPack);
  if (layerPackPromise) return layerPackPromise;
  if (typeof fetch !== "function" || typeof createImageBitmap !== "function") return Promise.resolve(null);
  const set = TERRAIN_SETS[EDITOR_TERRAIN_SET];
  if (!set) return Promise.resolve(null);
  const assetBase = new URL("../", import.meta.url);
  const urls = TerrainLayerUrls(EDITOR_TERRAIN_SET);
  layerPackPromise = Promise.all(urls.map((u) => Promise.all([
    FetchLayerBitmap(u.base, assetBase),
    FetchLayerBitmap(u.normal, assetBase),
    FetchLayerBitmap(u.orh, assetBase),
  ]))).then((bitmaps) => {
    const layers = urls.length;
    const aSize = EDITOR_ALBEDO_SIZE, sSize = EDITOR_SURFACE_SIZE;
    const albedoData = new Uint8Array(aSize * aSize * 4 * layers);
    const surfaceData = new Uint8Array(sSize * sSize * 4 * layers);
    const albedoMean = new Float32Array(4 * layers);
    const surfaceMean = new Float32Array(4 * layers);
    for (let layer = 0; layer < layers; layer++) {
      const [baseBmp, normBmp, orhBmp] = bitmaps[layer];
      const base = ResizeBitmapRgba(baseBmp, aSize);
      const height = ResizeBitmapRgba(orhBmp, aSize);
      const norm = ResizeBitmapRgba(normBmp, sSize);
      const orh = ResizeBitmapRgba(orhBmp, sSize);
      baseBmp.close?.(); normBmp.close?.(); orhBmp.close?.();
      const aOff = aSize * aSize * 4 * layer;
      let r = 0, g = 0, b = 0, h = 0;
      for (let i = 0, n = aSize * aSize; i < n; i++) {
        const src = i * 4, dst = aOff + src;
        albedoData[dst] = base[src];
        albedoData[dst + 1] = base[src + 1];
        albedoData[dst + 2] = base[src + 2];
        albedoData[dst + 3] = height[src + 2];
        r += SRGB_TO_LINEAR[base[src]];
        g += SRGB_TO_LINEAR[base[src + 1]];
        b += SRGB_TO_LINEAR[base[src + 2]];
        h += height[src + 2];
      }
      const aCount = aSize * aSize;
      albedoMean.set([r / aCount, g / aCount, b / aCount, h / aCount / 255], layer * 4);
      const sOff = sSize * sSize * 4 * layer;
      let nx = 0, ny = 0, rough = 0, ao = 0;
      for (let i = 0, n = sSize * sSize; i < n; i++) {
        const src = i * 4, dst = sOff + src;
        surfaceData[dst] = norm[src];
        surfaceData[dst + 1] = norm[src + 1];
        surfaceData[dst + 2] = orh[src + 1];
        surfaceData[dst + 3] = orh[src];
        nx += norm[src]; ny += norm[src + 1]; rough += orh[src + 1]; ao += orh[src];
      }
      const sCount = sSize * sSize * 255;
      surfaceMean.set([nx / sCount, ny / sCount, rough / sCount, ao / sCount], layer * 4);
    }
    loadedLayerPack = {
      setName: EDITOR_TERRAIN_SET,
      layers,
      albedoSize: aSize,
      surfaceSize: sSize,
      albedoData,
      surfaceData,
      albedoMean,
      surfaceMean,
      tileNear: set.layers.map((l) => 1 / l.tileM),
      tileFar: set.layers.map((l) => 1 / l.farTileM),
      normalScale: set.layers.map((l) => l.normalScale),
      heightOffset: set.layers.map((l) => l.heightOffset),
      tints: set.layers.map((l) => l.tint || [1, 1, 1]),
      albedoScale: set.albedoScale ?? 0.87,
    };
    for (const listener of layerReadyListeners) {
      try { listener(loadedLayerPack); } catch {}
    }
    layerReadyListeners.clear();
    return loadedLayerPack;
  }).catch((error) => {
    console.warn("[EncounterTerrain] 4-layer textures unavailable, keeping single color map:", error?.message || error);
    layerPackPromise = null;
    return null;
  });
  return layerPackPromise;
}

export function EncounterGpuRaster() {
  if(unavailable) return null;
  if(shared&&!shared.resourceFailed&&!shared.gl.isContextLost()) return shared;
  try {
    shared=new GpuRaster();
    return shared;
  } catch {
    unavailable=true;
    return null;
  }
}

class GpuRaster {
  constructor() {
    this.canvas=document.createElement('canvas');
    const gl=this.canvas.getContext('webgl2',{antialias:false,alpha:true,depth:false,preserveDrawingBuffer:false});
    if(!gl||!gl.getExtension('EXT_color_buffer_float')) throw new Error('Float raster unavailable');
    this.gl=gl;
    const Shader=(type,source)=>{
      const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    const vertex=Shader(gl.VERTEX_SHADER,`#version 300 es
      precision highp float;
      layout(location=0) in vec3 position;
      layout(location=1) in vec3 color;
      layout(location=2) in vec3 normal;
      uniform vec2 size;
      uniform bool perspective;
      uniform bool world;
      uniform vec3 eye;
      uniform vec3 right;
      uniform vec3 up;
      uniform vec3 forward;
      uniform vec4 projection;
      out vec3 rgb;
      out float distanceToCamera;
      out vec3 worldPosition;
      out vec3 worldNormal;
      void main() {
        vec3 point=position;
        vec4 clip=vec4(0.0);
        if(world) {
          vec3 relative=position-eye;
          vec3 camera=vec3(dot(relative,right),dot(relative,up),dot(relative,forward));
          float w=perspective?camera.z:1.0;
          point.z=camera.z;
          float near=projection.z,far=projection.w;
          float clipZ=perspective?((far+near)*camera.z-2.0*far*near)/(far-near):(camera.z-near)*2.0/(far-near)-1.0;
          clip=vec4(2.0*camera.x*projection.x/size.x,(projection.y*2.0-1.0)*w-2.0*camera.y*projection.x/size.y,clipZ,w);
        }
        float w=perspective?point.z:1.0;
        // Readback row zero is also Canvas row zero, so no full-frame Y flip.
        gl_Position=world?clip:vec4((point.xy/size*2.0-1.0)*w,0.0,w);
        rgb=color/255.0;
        distanceToCamera=point.z;
        vec2 screen=position.xy/size;
        float cameraScale=perspective?position.z:1.0;
        vec2 cameraXY=vec2((screen.x-0.5)*size.x,(projection.y-screen.y)*size.y)/projection.x*cameraScale;
        worldPosition=world?position:eye+right*cameraXY.x+up*cameraXY.y+forward*position.z;
        worldNormal=world?normal:vec3(0.0);
      }`);
    const fragment=Shader(gl.FRAGMENT_SHADER,`#version 300 es
      precision highp float;
      in vec3 rgb;
      in float distanceToCamera;
      in vec3 worldPosition;
      in vec3 worldNormal;
      uniform bool lit;
      uniform highp sampler2DShadow shadowMap;
      uniform vec3 shadowCenter;
      uniform vec3 shadowRight;
      uniform vec3 shadowUp;
      uniform vec3 sun;
      uniform vec3 eye;
      uniform vec3 right,up,forward;
      uniform vec2 lightBalance;
      uniform vec4 shadowSettings;
      uniform bool terrainSurface;
      uniform bool terrainLayered;
      uniform sampler2D groundColor,distantColor,splatMap,macroTintMap;
      uniform highp sampler2DArray layerAlbedo,layerSurface;
      uniform vec4 groundBounds,distantBounds,riverParams;
      uniform vec4 layerTileNear,layerTileFar,layerNormalScale,layerHeightOffset;
      uniform vec4 layerAlbedoMean0,layerAlbedoMean1,layerAlbedoMean2,layerAlbedoMean3;
      uniform vec4 layerSurfaceMean0,layerSurfaceMean1,layerSurfaceMean2,layerSurfaceMean3;
      uniform vec3 layerTint0,layerTint1,layerTint2,layerTint3;
      uniform float layerAlbedoScale;
      layout(location=0) out vec4 pixel;
      layout(location=1) out float distancePixel;
      layout(location=2) out vec4 normalPixel;

      float TerrainHash(vec2 p) {
        vec3 q=fract(vec3(p.xyx)*0.1031);
        q+=dot(q,q.yzx+33.33);
        return fract((q.x+q.y)*q.z);
      }
      float TerrainNoise(vec2 p) {
        vec2 i=floor(p),f=fract(p);
        f=f*f*(3.0-2.0*f);
        return mix(mix(TerrainHash(i),TerrainHash(i+vec2(1.0,0.0)),f.x),
                   mix(TerrainHash(i+vec2(0.0,1.0)),TerrainHash(i+vec2(1.0,1.0)),f.x),f.y);
      }
      vec2 TerrainHash2(vec2 p) {
        return vec2(TerrainHash(p),TerrainHash(p+vec2(37.2,17.9)));
      }
      // Procedural continuation of March 1938 Lunan strip-farmland beyond groundBounds
      // so the camera never sees a sharp rectangular boundary against flat backdrop color.
      void SampleOuterFarmland(vec2 xz,out float oTrack,out float oSpoil,out float oStubble,out vec3 oTint) {
        const float cellM=92.0;
        vec2 g=xz/cellM;
        vec2 ig=floor(g),fg=fract(g);
        float d1=9.0,d2=9.0;
        vec2 bestId=ig,bestCenter=vec2(0.0);
        for(int oy=-1;oy<=1;oy++) for(int ox=-1;ox<=1;ox++) {
          vec2 id=ig+vec2(float(ox),float(oy));
          vec2 jitter=0.18+0.64*TerrainHash2(id);
          vec2 diff=vec2(float(ox),float(oy))+jitter-fg;
          float d=length(diff);
          if(d<d1) {
            d2=d1;d1=d;bestId=id;bestCenter=(id+jitter)*cellM;
          } else if(d<d2) {
            d2=d;
          }
        }
        float hAng=TerrainHash(bestId+vec2(11.7,3.1));
        float hTurn=TerrainHash(bestId+vec2(29.3,7.9));
        float ang=(hAng-0.5)*0.46+(hTurn<0.25?1.5707963:0.0);
        float ca=cos(ang),sa=sin(ang);
        vec2 rel=xz-bestCenter;
        float u=rel.x*ca-rel.y*sa;
        float stripW=11.0+TerrainHash(bestId+vec2(53.1,19.4))*13.0;
        float stripId=floor(u/stripW);
        float stripF=fract(u/stripW);
        float k=TerrainHash(bestId*1.37+vec2(stripId*7.13,stripId*3.17));
        if(k<0.22) {oTrack=0.0;oSpoil=0.0;oStubble=0.88;oTint=vec3(0.75,0.96,0.63);}
        else if(k<0.42) {oTrack=0.0;oSpoil=0.0;oStubble=0.78;oTint=vec3(0.83,0.98,0.69);}
        else if(k<0.54) {oTrack=0.0;oSpoil=0.04;oStubble=0.66;oTint=vec3(0.92,0.98,0.74);}
        else if(k<0.68) {oTrack=0.0;oSpoil=0.44;oStubble=0.05;oTint=vec3(0.89,0.79,0.69);}
        else if(k<0.80) {oTrack=0.0;oSpoil=0.34;oStubble=0.09;oTint=vec3(0.94,0.84,0.73);}
        else if(k<0.92) {oTrack=0.04;oSpoil=0.06;oStubble=0.52;oTint=vec3(1.07,0.99,0.81);}
        else {oTrack=0.06;oSpoil=0.08;oStubble=0.22;oTint=vec3(1.02,0.97,0.88);}
        float tractBund=smoothstep(1.8,0.45,(d2-d1)*cellM);
        float stripBund=smoothstep(0.60,0.14,min(stripF,1.0-stripF)*stripW)*0.65;
        float bund=max(tractBund,stripBund);
        if(bund>0.001) {
          oTrack=mix(oTrack,0.42,bund);
          oSpoil=mix(oSpoil,0.12,bund);
          oStubble=mix(oStubble,0.16,bund);
          oTint=mix(oTint,vec3(1.04,0.98,0.86),bund);
        }
      }
      float SegDistDir(vec2 p,vec2 a,vec2 b,out vec2 dir) {
        vec2 ab=b-a;
        float len2=max(dot(ab,ab),1e-6);
        float t=clamp(dot(p-a,ab)/len2,0.0,1.0);
        dir=ab*inversesqrt(len2);
        return length(p-(a+ab*t));
      }
      float RiverSmin(float a,float b,float k) {
        float h=clamp(0.5+0.5*(b-a)/k,0.0,1.0);
        return mix(b,a,h)-k*h*(1.0-h);
      }
      float ShaheCenterZ(float x,float zShift) {
        float baseZ=870.3+zShift-(x+160.0)*0.26041667;
        float outX=x<-160.0?(-160.0-x):(x>320.0?(x-320.0):0.0);
        if(outX<=0.0) return baseZ;
        float m=smoothstep(0.0,240.0,outX);
        float meander=sin(x*0.0023+0.45)*48.0+sin(x*0.0061-1.15)*16.0;
        return baseZ+meander*m;
      }
      // Returns vec4(waterT, dampT, sandT, centerDepth) and outputs downstream tangent flowDir
      vec4 SampleUnifiedRiver(vec2 p,bool isMerged,float zShift,out vec2 flowDir,out float shoreLine) {
        flowDir=vec2(-0.968,0.252);
        shoreLine=0.0;

        // 1) North Shahe main river (flows ENE -> WSW)
        float cz=ShaheCenterZ(p.x,zShift);
        float czR=ShaheCenterZ(p.x-8.0,zShift);
        vec2 shaheDir=normalize(vec2(-8.0,czR-cz));
        float sJitter=(TerrainNoise(p*0.035+vec2(4.2,9.1))-0.5)*2.6+(TerrainNoise(p*0.105-vec2(2.7,5.3))-0.5)*0.9;
        float sDist=max(0.0,abs(p.y-cz)+sJitter);
        float wMod=1.0+0.15*sin(p.x*0.0075+1.1)+0.07*cos(p.x*0.019-0.6);
        float sHalfWater=9.2*wMod;
        float sHalfDamp=14.8*wMod;
        float sHalfBed=35.0*wMod;
        float sNorm=sDist/sHalfWater;

        // 2) Hechazi branch creek (continuous from NW upstream -> authored mid -> smooth acute confluence into Shahe)
        float bDist=1e9;
        float bHalfWater=4.6;
        float bHalfBed=8.4;
        vec2 bDir=vec2(0.0,1.0);
        vec2 segD;

        if(p.y<235.0&&p.y>-760.0&&p.x<65.0) {
          const vec2 ne[19]=vec2[19](
            vec2(-2080.0,-690.0),vec2(-1620.0,-560.0),vec2(-1220.0,-470.0),vec2(-910.0,-400.0),vec2(-680.0,-310.0),
            vec2(-510.0,-212.0),vec2(-386.0,-118.0),vec2(-296.0,-34.0),vec2(-232.0,34.0),vec2(-184.0,84.0),
            vec2(-144.0,120.0),vec2(-108.0,144.0),vec2(-74.0,158.0),vec2(-42.0,164.0),vec2(-14.0,166.0),
            vec2(8.0,170.0),vec2(22.0,177.0),vec2(28.5,187.0),vec2(29.3,197.7)
          );
          for(int i=1;i<19;i++) {
            float d=SegDistDir(p,ne[i-1],ne[i],segD);
            if(d<bDist) {
              bDist=d;bDir=segD;
              float tp=1.0-0.35*smoothstep(120.0,1600.0,max(0.0,-p.x));
              bHalfWater=4.2*tp;bHalfBed=7.6*tp;
            }
          }
        }
        if(p.y>180.0&&p.y<380.0&&p.x>-10.0&&p.x<70.0) {
          const vec2 mid[14]=vec2[14](
            vec2(29.3,197.7),vec2(26.8,204.0),vec2(22.7,216.0),vec2(21.5,230.0),vec2(25.0,245.0),
            vec2(32.0,258.0),vec2(37.5,271.0),vec2(37.0,285.0),vec2(31.0,298.0),vec2(24.5,311.0),
            vec2(23.0,325.0),vec2(27.5,338.5),vec2(34.0,351.0),vec2(35.5,355.0)
          );
          for(int i=1;i<14;i++) {
            float d=SegDistDir(p,mid[i-1],mid[i],segD);
            if(d<bDist) {bDist=d;bDir=segD;bHalfWater=4.0;bHalfBed=7.2;}
          }
        }
        if(p.y>340.0&&p.y<945.0+zShift&&p.x>-300.0&&p.x<75.0) {
          if(isMerged) {
            const vec2 ms[20]=vec2[20](
              vec2(35.5,355.0),vec2(36.8,367.0),vec2(31.5,379.0),vec2(17.0,389.0),vec2(-7.0,396.0),
              vec2(-39.0,402.0),vec2(-66.0,408.0),vec2(-80.0,412.0),vec2(-103.0,422.0),vec2(-125.0,440.0),
              vec2(-145.0,468.0),vec2(-159.0,506.0),vec2(-165.0,554.0),vec2(-159.0,608.0),vec2(-149.0,664.0),
              vec2(-149.0,722.0),vec2(-160.0,778.0),vec2(-180.0,826.0),vec2(-212.0,864.0),vec2(-254.0,892.0)
            );
            for(int i=1;i<20;i++) {
              float d=SegDistDir(p,ms[i-1],ms[i],segD);
              if(d<bDist) {bDist=d;bDir=segD;bHalfWater=4.8;bHalfBed=8.4;}
            }
          } else {
            const vec2 es[16]=vec2[16](
              vec2(34.5,574.0),vec2(30.0,598.0),vec2(16.0,626.0),vec2(-8.0,656.0),vec2(-36.0,688.0),
              vec2(-68.0,724.0),vec2(-102.0,766.0),vec2(-132.0,814.0),vec2(-152.0,872.0),vec2(-162.0,940.0),
              vec2(-160.0,1020.0),vec2(-152.0,1105.0),vec2(-154.0,1185.0),vec2(-168.0,1252.0),vec2(-198.0,1304.0),vec2(-248.0,1340.0)
            );
            for(int i=1;i<16;i++) {
              float d=SegDistDir(p,es[i-1],es[i],segD);
              if(d<bDist) {bDist=d;bDir=segD;bHalfWater=4.6;bHalfBed=8.2;}
            }
            if(p.y>350.0&&p.y<580.0&&p.x>12.0&&p.x<56.0) {
              float d=SegDistDir(p,vec2(35.5,355.0),vec2(34.5,574.0),segD);
              if(d<bDist) {bDist=d;bDir=segD;bHalfWater=3.4;bHalfBed=6.2;}
            }
          }
        }
        // Western diverging tributary feeder (tapers naturally upstream, smooth confluence into mid-creek)
        float fDist=1e9,fHalfWater=2.3,fHalfBed=4.4;
        vec2 fDir=vec2(0.83,0.55);
        if(p.y>245.0&&p.y<455.0&&p.x<38.0) {
          const vec2 fe[18]=vec2[18](
            vec2(-1450.0,415.0),vec2(-1080.0,380.0),vec2(-790.0,368.0),vec2(-580.0,376.0),vec2(-425.0,366.0),
            vec2(-310.0,344.0),vec2(-226.0,316.0),vec2(-164.0,292.0),vec2(-116.0,277.0),vec2(-80.0,271.0),
            vec2(-52.0,272.0),vec2(-32.0,278.0),vec2(-18.2,286.9),vec2(-12.0,291.0),vec2(0.0,299.0),
            vec2(10.0,307.0),vec2(17.5,315.0),vec2(23.5,321.0)
          );
          for(int i=1;i<18;i++) {
            float d=SegDistDir(p,fe[i-1],fe[i],segD);
            if(d<fDist) {
              fDist=d;fDir=segD;
              float tp=1.0-0.42*smoothstep(40.0,1100.0,max(0.0,-18.0-p.x));
              fHalfWater=2.3*tp;fHalfBed=4.4*tp;
            }
          }
        }

        float cJitter=(TerrainNoise(p*0.052+vec2(7.3,1.9))-0.5)*1.4;
        float bNorm=bDist<1e8?max(0.0,bDist+cJitter)/bHalfWater:99.0;
        float fNorm=fDist<1e8?max(0.0,fDist+cJitter*0.6)/fHalfWater:99.0;
        // Railway culvert protection at x=-80 (hide surface water directly on top of the rail embankment)
        float bridgeZ=isMerged?860.0:1310.0;
        float railProt=(p.y>=355.0&&p.y<=bridgeZ-22.0)?(1.0-smoothstep(4.2,8.5,abs(p.x+80.0))):0.0;
        bNorm=mix(bNorm,99.0,railProt);

        float creekNorm=RiverSmin(bNorm,fNorm,0.35);
        float pickFeeder=smoothstep(-0.35,0.35,bNorm-fNorm);
        vec2 creekDir=normalize(mix(bDir,fDir,pickFeeder));
        float uNorm=RiverSmin(sNorm,creekNorm,0.38);
        float pickShahe=smoothstep(-0.35,0.35,creekNorm-sNorm);
        flowDir=normalize(mix(creekDir,shaheDir,pickShahe));

        float waterT=1.0-smoothstep(0.84,1.12,uNorm);
        float centerDepth=1.0-smoothstep(0.0,0.95,uNorm);
        shoreLine=smoothstep(0.68,0.92,uNorm)*(1.0-smoothstep(0.92,1.10,uNorm));

        float sSandT=1.0-smoothstep(sHalfBed-3.0,sHalfBed+4.5,sDist);
        float sDampT=1.0-smoothstep(sHalfDamp-2.0,sHalfDamp+5.0,sDist);
        float bBedT=(1.0-smoothstep(bHalfBed,bHalfBed+6.5,bDist+cJitter))*(1.0-railProt);
        float fBedT=1.0-smoothstep(fHalfBed,fHalfBed+4.5,fDist+cJitter*0.6);
        float sandT=max(sSandT,max(bBedT,fBedT));
        float dampT=max(sDampT,max(1.0-smoothstep(0.9,1.55,creekNorm),0.0)*(1.0-railProt));
        return vec4(waterT,dampT,sandT,centerDepth);
      }
      vec4 TerrainVpMix(vec4 a,vec4 b,float t,vec4 mean) {
        float s=inversesqrt(max((1.0-t)*(1.0-t)+t*t,0.5));
        return mean+((a-mean)*(1.0-t)+(b-mean)*t)*s;
      }
      vec2 TerrainGradXZ(vec2 dS,vec2 dPx,vec2 dPy) {
        float det=dPx.x*dPy.y-dPx.y*dPy.x;
        if(abs(det)<1e-12) return vec2(0.0);
        return vec2(dS.x*dPy.y-dS.y*dPx.y,dPx.x*dS.y-dPy.x*dS.x)/det;
      }
      void SampleTerrainLayer(float layer,vec2 meters,vec2 dxM,vec2 dyM,float invTile,float variant,
                              vec4 aMean,vec4 sMean,out vec4 alb,out vec4 surf) {
        vec2 uv=meters*invTile,dx=dxM*invTile,dy=dyM*invTile;
        vec3 at=vec3(uv,layer);
        float band=floor(variant),f=fract(variant);
        float t=smoothstep(0.3,0.7,f);
        float salt=layer*17.0;
        vec2 offA=sin(vec2(3.0,7.0)*(band+salt));
        vec2 offB=sin(vec2(3.0,7.0)*(band+1.0+salt));
        if(t<0.002) {
          alb=textureGrad(layerAlbedo,at+vec3(offA,0.0),dx,dy);
          surf=textureGrad(layerSurface,at+vec3(offA,0.0),dx,dy);
        } else if(t>0.998) {
          alb=textureGrad(layerAlbedo,at+vec3(offB,0.0),dx,dy);
          surf=textureGrad(layerSurface,at+vec3(offB,0.0),dx,dy);
        } else {
          alb=TerrainVpMix(textureGrad(layerAlbedo,at+vec3(offA,0.0),dx,dy),
            textureGrad(layerAlbedo,at+vec3(offB,0.0),dx,dy),t,aMean);
          surf=TerrainVpMix(textureGrad(layerSurface,at+vec3(offA,0.0),dx,dy),
            textureGrad(layerSurface,at+vec3(offB,0.0),dx,dy),t,sMean);
        }
      }
      void SampleLayerNearFar(float layer,vec2 txz,vec2 dxM,vec2 dyM,float invNear,float invFar,float farT,float variant,
                              vec4 aMean,vec4 sMean,out vec4 alb,out vec4 surf) {
        alb=aMean;surf=sMean;
        if(farT<0.999) SampleTerrainLayer(layer,txz,dxM,dyM,invNear,variant,aMean,sMean,alb,surf);
        if(farT>0.001) {
          vec3 farAt=vec3(txz*invFar,layer);
          vec4 farA=textureGrad(layerAlbedo,farAt,dxM*invFar,dyM*invFar);
          vec4 farS=textureGrad(layerSurface,farAt,dxM*invFar,dyM*invFar);
          alb=farT>=0.999?farA:TerrainVpMix(alb,farA,farT,aMean);
          surf=farT>=0.999?farS:TerrainVpMix(surf,farS,farT,sMean);
        }
      }
      ${TONEMAP_GLSL}
      void main() {
        vec3 twDx=dFdx(worldPosition),twDy=dFdy(worldPosition);
        bool smoothTerrain=dot(worldNormal,worldNormal)>0.01;
        vec3 geomN=smoothTerrain?normalize(worldNormal):vec3(0.0,1.0,0.0);
        vec3 litNormal=geomN;
        float terrainAo=1.0;

        vec3 layeredLinear=vec3(0.0);
        bool useLayered=terrainSurface&&terrainLayered&&smoothTerrain;
        if(useLayered) {
          vec2 txz=worldPosition.xz;
          float tDist=max(distanceToCamera,0.0);
          vec2 groundSize=vec2(textureSize(splatMap,0));
          vec2 groundUv=(txz-groundBounds.xy)/groundBounds.zw;
          vec2 outVec=max(groundBounds.xy-txz,txz-(groundBounds.xy+groundBounds.zw));
          float outDist=length(max(outVec,vec2(0.0)));
          vec2 clampedUv=(clamp(groundUv,0.0,1.0)*(groundSize-1.0)+0.5)/groundSize;
          vec4 splat=texture(splatMap,clampedUv);
          vec4 macroTex=texture(macroTintMap,clampedUv);
          vec2 rutD=vec2(dFdx(splat.a),dFdy(splat.a));

          float farT=smoothstep(12.0,48.0,tDist);
          float variant=TerrainNoise(txz*(1.0/5.3))*8.0;

          float wTrack=splat.r;
          float wSpoil=splat.g*(1.0-wTrack);
          float stubbleRaw=splat.b;
          vec3 macroRgb=macroTex.rgb*(255.0/128.0);
          float authoredCov=macroTex.a;
          if(outDist>0.0||authoredCov<0.995) {
            float oTrack,oSpoil,oStubble;vec3 oTint;
            SampleOuterFarmland(txz,oTrack,oSpoil,oStubble,oTint);
            vec2 distantUv=(txz-distantBounds.xy)/distantBounds.zw;
            if(all(greaterThanEqual(distantUv,vec2(0.0)))&&all(lessThanEqual(distantUv,vec2(1.0)))) {
              vec4 paint=textureGrad(distantColor,distantUv,twDx.xz/distantBounds.zw,twDy.xz/distantBounds.zw);
              if(paint.a>0.01) {
                float gScore=clamp((paint.g-paint.r*0.86)*5.0,0.0,1.0);
                float roadScore=clamp((min(paint.r,paint.g)-0.58)*3.5,0.0,1.0);
                float bpTrack=roadScore*0.68;
                float bpSpoil=(1.0-gScore)*(1.0-roadScore)*0.26;
                float bpStubble=mix(0.24,0.84,gScore)*(1.0-bpTrack);
                vec3 bpTint=clamp(paint.rgb/vec3(0.56,0.50,0.39),vec3(0.58),vec3(1.22));
                oTrack=mix(oTrack,bpTrack,paint.a);
                oSpoil=mix(oSpoil,bpSpoil,paint.a);
                oStubble=mix(oStubble,bpStubble,paint.a);
                oTint=mix(oTint,bpTint,paint.a);
              }
            }
            float outerT=smoothstep(0.0,2.4,outDist);
            float procT=max(outerT,1.0-authoredCov);
            float edgeFeatKeep=1.0-smoothstep(0.0,3.2,outDist);
            wTrack=mix(wTrack*edgeFeatKeep,oTrack,procT);
            wSpoil=mix(wSpoil*edgeFeatKeep,oSpoil,procT);
            stubbleRaw=mix(stubbleRaw,oStubble,procT);
            macroRgb=mix(macroRgb,oTint,procT);
            // Where authored inner farmland meets outer Voronoi farmland at groundBounds,
            // finish the seam as a crisp 1.2 m Lunan dirt field-headland bund instead of a blurry band.
            if(outDist>0.0&&outDist<2.2&&authoredCov>0.5) {
              float seamBund=smoothstep(1.3,0.35,abs(outDist-0.55))*smoothstep(0.0,0.2,outDist)*(1.0-smoothstep(0.25,0.60,max(splat.r,oTrack)))*authoredCov;
              if(seamBund>0.001) {
                wTrack=mix(wTrack,0.42,seamBund);
                wSpoil=mix(wSpoil,0.12,seamBund);
                stubbleRaw=mix(stubbleRaw,0.16,seamBund);
                macroRgb=mix(macroRgb,vec3(1.04,0.98,0.86),seamBund);
              }
            }
            // Real SRTM foothill slopes (NE/E Tengzhou-Longshan hills): transition irrigated strips
            // into natural Lunan loess & dry foothill scrub on elevated or steeper hillsides.
            if(outDist>8.0) {
              float hillSlope=smoothstep(0.014,0.065,1.0-geomN.y);
              float hillElev=smoothstep(5.5,24.0,worldPosition.y);
              float hillMix=clamp(max(hillSlope*0.85,hillElev*0.65),0.0,0.92)*smoothstep(8.0,85.0,outDist);
              if(hillMix>0.001) {
                float scrubNoise=TerrainNoise(txz*0.018+7.1)*0.6+TerrainNoise(txz*0.055-3.4)*0.4;
                vec3 hillTint=mix(vec3(0.96,0.89,0.74),vec3(0.82,0.86,0.67),smoothstep(0.35,0.72,scrubNoise));
                wTrack=mix(wTrack,0.04,hillMix);
                wSpoil=mix(wSpoil,mix(0.42,0.18,scrubNoise),hillMix);
                stubbleRaw=mix(stubbleRaw,mix(0.32,0.66,scrubNoise),hillMix);
                macroRgb=mix(macroRgb,hillTint,hillMix);
              }
            }
          }

          float riverWaterT=0.0,riverDepth=0.0,riverShore=0.0;
          vec2 riverFlowDir=vec2(-0.968,0.252);
          if(riverParams.x>0.5) {
            vec4 rv=SampleUnifiedRiver(txz,riverParams.z>0.5,riverParams.y,riverFlowDir,riverShore);
            float sandMask=rv.z*(outDist>0.0?1.0:0.78);
            if(sandMask>0.001) {
              float barNoise=TerrainNoise(txz*0.032+5.7)*0.6+TerrainNoise(txz*0.11-2.3)*0.4;
              vec3 sandTint=mix(vec3(1.08,1.01,0.87),vec3(1.18,1.12,0.96),barNoise);
              wTrack=mix(wTrack,0.10,sandMask);
              wSpoil=mix(wSpoil,0.84,sandMask);
              stubbleRaw=mix(stubbleRaw,0.04,sandMask);
              macroRgb=mix(macroRgb,sandTint,sandMask);
            }
            if(rv.y>0.001) macroRgb*=mix(1.0,0.74,rv.y*0.85);
            riverWaterT=rv.x;
            riverDepth=rv.w;
          }

          float wRest=max(0.0,1.0-wTrack-wSpoil);
          float stubbleNoise=TerrainNoise(txz*0.042)*0.62+TerrainNoise(txz*0.115+11.3)*0.23+TerrainNoise(txz*0.26+5.1)*0.15;
          float stubble=clamp(stubbleRaw*mix(0.76,1.12,smoothstep(0.28,0.72,stubbleNoise)),0.0,1.0);
          vec4 tW=vec4(wRest*(1.0-stubble),wTrack,wRest*stubble,wSpoil);

          vec4 tAlb0=layerAlbedoMean0,tSurf0=layerSurfaceMean0;
          vec4 tAlb1=layerAlbedoMean1,tSurf1=layerSurfaceMean1;
          vec4 tAlb2=layerAlbedoMean2,tSurf2=layerSurfaceMean2;
          vec4 tAlb3=layerAlbedoMean3,tSurf3=layerSurfaceMean3;
          vec4 tH=vec4(0.0);
          if(tW.x>=0.004) {SampleLayerNearFar(0.0,txz,twDx.xz,twDy.xz,layerTileNear.x,layerTileFar.x,farT,variant,layerAlbedoMean0,layerSurfaceMean0,tAlb0,tSurf0);tH.x=clamp(tAlb0.a,0.0,1.0)+layerHeightOffset.x;}
          if(tW.y>=0.004) {SampleLayerNearFar(1.0,txz,twDx.xz,twDy.xz,layerTileNear.y,layerTileFar.y,farT,variant,layerAlbedoMean1,layerSurfaceMean1,tAlb1,tSurf1);tH.y=clamp(tAlb1.a,0.0,1.0)+layerHeightOffset.y;}
          if(tW.z>=0.004) {SampleLayerNearFar(2.0,txz,twDx.xz,twDy.xz,layerTileNear.z,layerTileFar.z,farT,variant,layerAlbedoMean2,layerSurfaceMean2,tAlb2,tSurf2);tH.z=clamp(tAlb2.a,0.0,1.0)+layerHeightOffset.z;}
          if(tW.w>=0.004) {SampleLayerNearFar(3.0,txz,twDx.xz,twDy.xz,layerTileNear.w,layerTileFar.w,farT,variant,layerAlbedoMean3,layerSurfaceMean3,tAlb3,tSurf3);tH.w=clamp(tAlb3.a,0.0,1.0)+layerHeightOffset.w;}

          vec4 tMask=step(vec4(0.004),tW);
          vec4 tHw=(tH+tW)*tMask;
          float tTop=max(max(tHw.x,tHw.y),max(tHw.z,tHw.w))-0.20;
          vec4 tB=max(tHw-tTop,0.0)*tMask;
          tB/=max(dot(tB,vec4(1.0)),1e-4);

          vec3 tAlbedo=tAlb0.rgb*tB.x+tAlb1.rgb*tB.y+tAlb2.rgb*tB.z+tAlb3.rgb*tB.w;
          vec4 tSurface=tSurf0*tB.x+tSurf1*tB.y+tSurf2*tB.z+tSurf3*tB.w;
          vec2 tNxy=(tSurf0.rg*2.0-1.0)*(layerNormalScale.x*tB.x)
            +(tSurf1.rg*2.0-1.0)*(layerNormalScale.y*tB.y)
            +(tSurf2.rg*2.0-1.0)*(layerNormalScale.z*tB.z)
            +(tSurf3.rg*2.0-1.0)*(layerNormalScale.w*tB.w);
          vec3 tPerturb=vec3(tNxy.x,0.0,tNxy.y);

          vec3 tAbsN=abs(geomN);
          float sideT=(1.0-smoothstep(0.50,0.78,tAbsN.y))*(1.0-smoothstep(55.0,95.0,tDist));
          if(sideT>0.004) {
            bool alongX=tAbsN.x>tAbsN.z;
            vec2 sm=alongX?vec2(worldPosition.z,-worldPosition.y):vec2(worldPosition.x,-worldPosition.y);
            vec2 sdx=alongX?vec2(twDx.z,-twDx.y):vec2(twDx.x,-twDx.y);
            vec2 sdy=alongX?vec2(twDy.z,-twDy.y):vec2(twDy.x,-twDy.y);
            vec3 sAlb=vec3(0.0);vec4 sSurf=vec4(0.0);vec2 sNxy=vec2(0.0);vec4 sa,ss;
            if(tB.x>0.0) {SampleTerrainLayer(0.0,sm,sdx,sdy,layerTileNear.x,variant,layerAlbedoMean0,layerSurfaceMean0,sa,ss);sAlb+=sa.rgb*tB.x;sSurf+=ss*tB.x;sNxy+=(ss.rg*2.0-1.0)*(layerNormalScale.x*tB.x);}
            if(tB.y>0.0) {SampleTerrainLayer(1.0,sm,sdx,sdy,layerTileNear.y,variant,layerAlbedoMean1,layerSurfaceMean1,sa,ss);sAlb+=sa.rgb*tB.y;sSurf+=ss*tB.y;sNxy+=(ss.rg*2.0-1.0)*(layerNormalScale.y*tB.y);}
            if(tB.z>0.0) {SampleTerrainLayer(2.0,sm,sdx,sdy,layerTileNear.z,variant,layerAlbedoMean2,layerSurfaceMean2,sa,ss);sAlb+=sa.rgb*tB.z;sSurf+=ss*tB.z;sNxy+=(ss.rg*2.0-1.0)*(layerNormalScale.z*tB.z);}
            if(tB.w>0.0) {SampleTerrainLayer(3.0,sm,sdx,sdy,layerTileNear.w,variant,layerAlbedoMean3,layerSurfaceMean3,sa,ss);sAlb+=sa.rgb*tB.w;sSurf+=ss*tB.w;sNxy+=(ss.rg*2.0-1.0)*(layerNormalScale.w*tB.w);}
            tAlbedo=mix(tAlbedo,sAlb,sideT);
            tSurface=mix(tSurface,sSurf,sideT);
            vec3 sidePerturb=alongX?vec3(0.0,-sNxy.y,sNxy.x):vec3(sNxy.x,-sNxy.y,0.0);
            tPerturb=mix(tPerturb,sidePerturb,sideT);
          }

          float rutRaw=clamp((splat.a*255.0/254.0)*2.0-1.0,-1.0,1.0);
          float rutS=rutRaw*4.0;
          float rutSw=rutS+(TerrainNoise(txz*0.105+3.3)-0.5)*0.20;
          float rutU=(abs(rutSw)-0.72)/0.26;
          float rutPixelM=(abs(rutD.x)+abs(rutD.y))*8.0;
          float rutRoad=tB.y*step(abs(rutRaw),0.92)*(1.0-smoothstep(0.0,2.0,outDist));
          float rutBandFade=rutRoad*(1.0-smoothstep(110.0,240.0,tDist))*(1.0-smoothstep(0.24,0.62,rutPixelM));
          float rutGrooveFade=rutRoad*(1.0-smoothstep(60.0,145.0,tDist))*(1.0-smoothstep(0.12,0.32,rutPixelM));
          float gRut=0.0;float rutSlope=0.0;
          float rutBandU=rutU/2.4;
          if(abs(rutBandU)<1.0&&rutBandFade>0.001) {
            float along=mix(0.62,1.0,TerrainNoise(txz*0.21+9.1));
            float qb=1.0-rutBandU*rutBandU;
            gRut=qb*qb*0.42*rutBandFade*along;
            if(abs(rutU)<1.0&&rutGrooveFade>0.001) {
              float q=1.0-rutU*rutU;
              gRut=max(gRut,q*q*rutGrooveFade*along);
              rutSlope=-4.0*rutU*q*0.075/0.26*sign(rutSw)*rutGrooveFade*along;
            }
          }
          if(rutSlope!=0.0) {
            vec2 rutGrad=TerrainGradXZ(rutD*8.0,twDx.xz,twDy.xz);
            rutGrad/=max(length(rutGrad),1e-4);
            tPerturb+=vec3(rutGrad.x,0.0,rutGrad.y)*rutSlope;
          }

          vec3 tMeanAlb=layerAlbedoMean0.rgb*tB.x+layerAlbedoMean1.rgb*tB.y+layerAlbedoMean2.rgb*tB.z+layerAlbedoMean3.rgb*tB.w;
          float tContrast=mix(1.0,0.45,smoothstep(25.0,120.0,tDist));
          tAlbedo=tMeanAlb+(tAlbedo-tMeanAlb)*tContrast;

          vec3 tTint=layerTint0*tB.x+layerTint1*tB.y+layerTint2*tB.z+layerTint3*tB.w;
          tAlbedo*=tTint;

          float m0=TerrainNoise(txz*(1.0/7.3)+3.7)-0.5;
          float m1=TerrainNoise(txz*(1.0/31.0)+17.31)-0.5;
          float m2=TerrainNoise(txz*(1.0/117.0)+41.7)-0.5;
          vec3 tMacro=(1.0+2.0*(m0*0.05+m1*0.075+m2*0.06))*(1.0+vec3(0.9,0.25,-0.8)*m2*0.10);
          tAlbedo*=tMacro*(1.0-0.22*gRut);

          vec3 macroLin=pow(max(macroRgb,vec3(0.05)),vec3(2.2));
          layeredLinear=max(tAlbedo*macroLin*layerAlbedoScale,vec3(0.0));

          float nFade=mix(1.0,0.28,smoothstep(10.0,140.0,tDist));
          tPerturb*=nFade;
          tPerturb-=geomN*dot(geomN,tPerturb);
          litNormal=normalize(geomN+tPerturb);
          float tAo=clamp(tSurface.a,0.0,1.0);
          float aoKeep=mix(1.0,0.55,farT);
          terrainAo=mix(1.0,tAo,0.72*aoKeep);

          if(riverWaterT>0.001) {
            // Schematic flowing river shader: directional streamlines aligned with flowDir + depth gradient + subtle shoreline edge
            vec2 perpDir=vec2(-riverFlowDir.y,riverFlowDir.x);
            vec2 flowUv=vec2(dot(txz,riverFlowDir),dot(txz,perpDir));
            float stream1=TerrainNoise(vec2(flowUv.x*0.075,flowUv.y*0.48)+vec2(2.1,5.7));
            float stream2=TerrainNoise(vec2(flowUv.x*0.19,flowUv.y*1.15)-vec2(6.3,1.4));
            float streak=smoothstep(0.56,0.86,stream1*0.65+stream2*0.35);
            float ripAlong=(stream2-0.5)*0.055;
            float ripCross=(stream1-0.5)*0.085;
            vec3 waterN=normalize(vec3(
              riverFlowDir.x*ripAlong+perpDir.x*ripCross,
              1.0,
              riverFlowDir.y*ripAlong+perpDir.y*ripCross
            ));
            vec3 viewDir=normalize(eye-worldPosition);
            float fresnel=pow(1.0-clamp(dot(waterN,viewDir),0.0,1.0),3.0);
            vec3 halfVec=normalize(normalize(sun)+viewDir);
            float specGlint=pow(max(dot(waterN,halfVec),0.0),36.0)*0.16;

            // Linear-space calm Lunan schematic river palette: translucent silty bank -> slate-blue channel -> deeper thalweg
            vec3 shallowEdge=vec3(0.115,0.145,0.135);
            vec3 midWater=vec3(0.068,0.132,0.165);
            vec3 deepChannel=vec3(0.042,0.088,0.122);
            vec3 skyTint=vec3(0.165,0.235,0.275);
            vec3 baseWater=mix(shallowEdge,mix(midWater,deepChannel,smoothstep(0.25,0.90,riverDepth)),smoothstep(0.0,0.55,riverDepth));
            vec3 waterCol=mix(baseWater,skyTint,0.14+0.38*fresnel);
            // Subtle directional current lines + soft shoreline meniscus highlight
            waterCol+=vec3(0.032,0.048,0.054)*streak*(0.35+0.65*riverDepth);
            waterCol=mix(waterCol,vec3(0.20,0.23,0.22),riverShore*0.38);
            waterCol+=vec3(specGlint);

            layeredLinear=mix(layeredLinear,waterCol,riverWaterT);
            litNormal=normalize(mix(litNormal,waterN,riverWaterT));
            terrainAo=mix(terrainAo,1.0,riverWaterT);
          }
        }

        float visibility=1.0;
        normalPixel=vec4(0.0);
        if(lit) {
          vec3 normal=normalize(cross(twDx,twDy));
          if(dot(normal,eye-worldPosition)<0.0) normal=-normal;
          vec3 shadingNormal=smoothTerrain?geomN:normal;
          normalPixel=vec4(dot(shadingNormal,right),dot(shadingNormal,up),dot(shadingNormal,forward),smoothTerrain?1.0:0.0);
          // Offset smooth receivers away from their own tessellated surface.
          float normalBias=smoothTerrain?shadowSettings.z*shadowSettings.y*2.0:0.0;
          vec3 relative=worldPosition+shadingNormal*normalBias-shadowCenter;
          vec3 shadow=vec3(dot(relative,shadowRight)/shadowSettings.x,dot(relative,shadowUp)/shadowSettings.x,-dot(relative,sun)/shadowSettings.y)*0.5+0.5;
          vec3 shadowDx=dFdx(shadow),shadowDy=dFdy(shadow);
          float determinant=shadowDx.x*shadowDy.y-shadowDx.y*shadowDy.x;
          vec2 depthGradient=abs(determinant)>1e-10
            ?vec2(shadowDy.y*shadowDx.z-shadowDx.y*shadowDy.z,shadowDx.x*shadowDy.z-shadowDy.x*shadowDx.z)/determinant:vec2(0.0);
          float cosine=abs(dot(normal,sun));
          float slope=sqrt(max(0.0,1.0-cosine*cosine))/max(0.1,cosine);
          vec2 texel=1.0/vec2(textureSize(shadowMap,0));
          float bias=shadowSettings.z+slope*texel.x*shadowSettings.x/shadowSettings.y*1.5;
          if(all(greaterThan(shadow,vec3(0.0)))&&all(lessThan(shadow,vec3(1.0)))) {
            // Each tap is a hardware bilinear depth comparison, so the 3x3 kernel
            // blends 16 texels with smooth weights instead of nine hard steps.
            float lit=0.0;
            for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++) {
              vec2 offset=vec2(x,y)*texel;
              lit+=texture(shadowMap,vec3(shadow.xy+offset,clamp(shadow.z+dot(depthGradient,offset)-bias,0.0,1.0)));
            }
            vec3 shadowDirectNormal=useLayered?litNormal:shadingNormal;
            float direct=lightBalance.y*max(dot(shadowDirectNormal,sun),0.0);
            visibility-=shadowSettings.w*(1.0-lit/9.0)*direct/(lightBalance.x+direct);
          }
        }
        vec3 surface=rgb;
        if(useLayered) {
          float diffuse=max(0.0,dot(litNormal,sun));
          vec3 litLinear=layeredLinear*(lightBalance.x*terrainAo+lightBalance.y*diffuse)*2.55;
          surface=pow(AcesFitted(litLinear*${CAMERA_PROFILES.editorLite.exposure.toFixed(4)}),vec3(1.0/2.2));
        } else if(terrainSurface&&smoothTerrain) {
          surface=vec3(198.0,207.0,169.0)/255.0;
          vec2 distantUv=(worldPosition.xz-distantBounds.xy)/distantBounds.zw;
          if(all(greaterThanEqual(distantUv,vec2(0.0)))&&all(lessThanEqual(distantUv,vec2(1.0)))) {
            vec4 paint=texture(distantColor,distantUv);
            surface=mix(surface,paint.rgb,paint.a);
          }
          vec2 groundUv=(worldPosition.xz-groundBounds.xy)/groundBounds.zw;
          if(all(greaterThanEqual(groundUv,vec2(0.0)))&&all(lessThanEqual(groundUv,vec2(1.0)))) {
            vec2 groundSize=vec2(textureSize(groundColor,0));
            if(groundSize.x>1.5) {
              surface=texture(groundColor,(groundUv*(groundSize-1.0)+0.5)/groundSize).rgb;
            } else {
              vec2 splatSize=vec2(textureSize(splatMap,0));
              if(splatSize.x>1.5) {
                vec2 uv=(groundUv*(splatSize-1.0)+0.5)/splatSize;
                vec4 sp=texture(splatMap,uv);
                vec4 mt=texture(macroTintMap,uv);
                float wT=sp.r,wSp=sp.g*(1.0-wT),wRest=max(0.0,1.0-wT-wSp);
                vec3 baseCol=vec3(0.62,0.56,0.44)*wRest*(1.0-sp.b)+vec3(0.68,0.61,0.48)*wT+vec3(0.58,0.62,0.44)*wRest*sp.b+vec3(0.56,0.47,0.36)*wSp;
                surface=clamp(baseCol*(mt.rgb*(255.0/128.0)),0.0,1.0);
              }
            }
          }
          float diffuse=max(0.0,dot(geomN,sun));
          surface*=lightBalance.x+lightBalance.y*diffuse;
        }
        pixel=vec4(surface*visibility,1.0);
        distancePixel=distanceToCamera;
        gl_FragDepth=distanceToCamera/16384.0;
      }`);
    this.program=gl.createProgram();gl.attachShader(this.program,vertex);gl.attachShader(this.program,fragment);gl.linkProgram(this.program);
    gl.deleteShader(vertex);gl.deleteShader(fragment);
    if(!gl.getProgramParameter(this.program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
    this.size=gl.getUniformLocation(this.program,'size');this.perspective=gl.getUniformLocation(this.program,'perspective');
    this.world=gl.getUniformLocation(this.program,'world');
    this.cameraUniforms=Object.fromEntries(['eye','right','up','forward','projection'].map(name=>[name,gl.getUniformLocation(this.program,name)]));
    this.streamCapacities=new WeakMap();this.validateResources=true;
    this.buffer=gl.createBuffer();this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
    for(let index=0;index<3;index++) {gl.enableVertexAttribArray(index);gl.vertexAttribPointer(index,3,gl.FLOAT,false,36,index*12);}
    this.screenVao=gl.createVertexArray();gl.bindVertexArray(this.screenVao);
    this.screenBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.screenBuffer);
    for(let index=0;index<2;index++) {gl.enableVertexAttribArray(index);gl.vertexAttribPointer(index,3,gl.FLOAT,false,24,index*12);}
    this.targets=new Map();
    const Program=(vertexSource,fragmentSource)=>{
      const program=gl.createProgram(),v=Shader(gl.VERTEX_SHADER,vertexSource),f=Shader(gl.FRAGMENT_SHADER,fragmentSource);
      gl.attachShader(program,v);gl.attachShader(program,f);gl.linkProgram(program);gl.deleteShader(v);gl.deleteShader(f);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      return program;
    };
    this.lightingUniforms=Object.fromEntries(['lit','shadowMap','shadowCenter','shadowRight','shadowUp','sun','shadowSettings','lightBalance'].map(name=>[name,gl.getUniformLocation(this.program,name)]));
    this.surfaceUniforms=Object.fromEntries([
      'terrainSurface','terrainLayered','groundColor','distantColor','splatMap','macroTintMap',
      'layerAlbedo','layerSurface','groundBounds','distantBounds','riverParams',
      'layerTileNear','layerTileFar','layerNormalScale','layerHeightOffset',
      'layerAlbedoMean0','layerAlbedoMean1','layerAlbedoMean2','layerAlbedoMean3',
      'layerSurfaceMean0','layerSurfaceMean1','layerSurfaceMean2','layerSurfaceMean3',
      'layerTint0','layerTint1','layerTint2','layerTint3','layerAlbedoScale',
    ].map(name=>[name,gl.getUniformLocation(this.program,name)]));
    this.surfaceTextures=new Map();
    this.layerTextures=null;
    // 1x1 dummy textures so WebGL2 sampler validation always sees valid bindings on TEXTURE3..6
    this.blank2d=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.blank2d);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([128,128,128,255]));
    this.blankArray=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D_ARRAY,this.blankArray);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY,0,gl.RGBA8,1,1,4,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(16).fill(128));
    this.residentOwners=new Map();
    this.overlay=new EncounterGpuOverlay(gl,Program);
    this.shadowProgram=Program(`#version 300 es
      precision highp float;
      layout(location=0) in vec3 position;
      uniform vec3 shadowCenter,shadowRight,shadowUp,sun;
      uniform vec4 shadowSettings;
      void main() {
        vec3 p=position-shadowCenter;
        gl_Position=vec4(dot(p,shadowRight)/shadowSettings.x,dot(p,shadowUp)/shadowSettings.x,-dot(p,sun)/shadowSettings.y,1.0);
      }`, `#version 300 es
      precision highp float;
      void main() {}`);
    this.shadowUniforms=Object.fromEntries(['shadowCenter','shadowRight','shadowUp','sun','shadowSettings'].map(name=>[name,gl.getUniformLocation(this.shadowProgram,name)]));
    const fullscreenVertex=`#version 300 es
      void main() {
        vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);
        gl_Position=vec4(p*2.0-1.0,0.0,1.0);
      }`;
    // Pass 1 writes the raw ambient light factor (1 = open, aoMinLight = fully
    // occluded) into its own target. Every pixel of a 4x4 block uses a different
    // ray rotation and step offset, so the 8x4 taps cover 16 times more ray
    // directions than they would with a fixed pattern. Fixed taps put every
    // wall edge on two or three discrete rings, which showed up as layered
    // ghost copies of the edge. Pass 2 (aoResolveProgram) averages the 4x4 block.
    this.aoProgram=Program(fullscreenVertex, `#version 300 es
      precision highp float;
      uniform sampler2D sceneColor,sceneDepth,sceneNormal;
      uniform vec2 size,aoSize;
      uniform vec4 projection,aoSettings;
      uniform vec2 terrainAo;
      uniform float minLight;
      uniform bool perspective;
      out vec4 pixel;
      const int bayer[16]=int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5);
      vec3 Position(vec2 p) {
        ivec2 at=clamp(ivec2(p),ivec2(0),ivec2(size)-1);
        float z=min(texelFetch(sceneDepth,at,0).r,projection.w);
        vec2 xy=vec2(p.x-size.x*0.5,size.y*projection.y-p.y)/projection.x;
        return vec3(xy*(perspective?z:1.0),z);
      }
      void main() {
        vec2 p=gl_FragCoord.xy*size/aoSize;
        ivec2 at=clamp(ivec2(p),ivec2(0),ivec2(size)-1);
        pixel=vec4(1.0);
        if(texelFetch(sceneColor,at,0).a==0.0) return;
        ivec2 phaseAt=ivec2(gl_FragCoord.xy);
        int phase=bayer[(phaseAt.x&3)+((phaseAt.y&3)<<2)];
        float turn=float(phase)/16.0*0.785398163;
        float jitter=float((phase*7)&15)/16.0;
        vec3 center=Position(p);
        // Terrain supplies interpolated height-field normals. A depth derivative
        // would expose every fan triangle again along the bank and its foot.
        vec4 surfaceNormal=texelFetch(sceneNormal,at,0);
        vec3 normal=normalize(surfaceNormal.xyz);
        float horizonBias=mix(0.08,terrainAo.y,surfaceNormal.w);
        vec3 left=center-Position(p-vec2(1,0)),right=Position(p+vec2(1,0))-center;
        vec3 top=center-Position(p-vec2(0,1)),bottom=Position(p+vec2(0,1))-center;
        vec3 dx=abs(left.z)<abs(right.z)?left:right,dy=abs(top.z)<abs(bottom.z)?top:bottom;
        vec3 geometricNormal=normalize(cross(dx,dy));
        if(dot(geometricNormal,center)>0.0) geometricNormal=-geometricNormal;
        float radius=clamp(aoSettings.x*projection.x/(perspective?max(center.z,projection.z):1.0),2.0,aoSettings.z);
        float occlusion=0.0;
        for(int direction=0;direction<8;direction++) {
          float angle=float(direction)*0.785398163+turn;
          vec2 ray=vec2(cos(angle),sin(angle));
          for(int step=0;step<4;step++) {
            vec2 sampleAt=p+ray*(1.5+(radius-1.5)*(float(step)+jitter)*0.25);
            if(any(lessThan(sampleAt,vec2(0.5)))||any(greaterThanEqual(sampleAt,size-0.5))) continue;
            if(texelFetch(sceneColor,ivec2(sampleAt),0).a==0.0) continue;
            vec3 delta=Position(sampleAt)-center;
            float distance=length(delta);
            if(distance<0.015||distance>aoSettings.x) continue;
            float horizon=max(0.0,min(dot(normal,delta/distance),dot(geometricNormal,delta/distance))-horizonBias);
            occlusion+=horizon*(1.0-distance/aoSettings.x);
          }
        }
        pixel=vec4(vec3(max(minLight,1.0-occlusion*aoSettings.y*mix(1.0,terrainAo.x,surfaceNormal.w)/32.0)),1.0);
      }`);
    this.aoUniforms=Object.fromEntries(['sceneColor','sceneDepth','sceneNormal','size','aoSize','projection','aoSettings','terrainAo','minLight','perspective'].map(name=>[name,gl.getUniformLocation(this.aoProgram,name)]));
    this.aoResolveProgram=Program(fullscreenVertex, `#version 300 es
      precision highp float;
      uniform sampler2D sceneColor,sceneDepth,aoMap;
      uniform vec2 size;
      uniform float farDepth;
      uniform vec3 hazeSettings,hazeColor;
      out vec4 pixel;
      void main() {
        ivec2 at=ivec2(gl_FragCoord.xy);
        pixel=texelFetch(sceneColor,at,0);
        if(pixel.a==0.0) return;
        float z=min(texelFetch(sceneDepth,at,0).r,farDepth);
        // Depth-aware 4x4 average over exactly one dither period. Neighbours
        // across a wall edge are far away in depth and drop out, so the
        // shadow does not bleed onto the other surface.
        float tolerance=0.03*z+0.12,sum=0.0,total=0.0;
        ivec2 aoSize=textureSize(aoMap,0);
        vec2 aoScale=vec2(aoSize)/size;
        ivec2 aoAt=ivec2(gl_FragCoord.xy*aoScale);
        for(int y=-2;y<2;y++) for(int x=-2;x<2;x++) {
          ivec2 q=clamp(aoAt+ivec2(x,y),ivec2(0),aoSize-1);
          ivec2 sceneAt=clamp(ivec2((vec2(q)+0.5)/aoScale),ivec2(0),ivec2(size)-1);
          if(texelFetch(sceneColor,sceneAt,0).a==0.0) continue;
          float weight=max(0.0,1.0-abs(min(texelFetch(sceneDepth,sceneAt,0).r,farDepth)-z)/tolerance);
          sum+=weight*texelFetch(aoMap,q,0).r;total+=weight;
        }
        pixel.rgb*=total>0.0?sum/total:1.0;
        float haze=smoothstep(hazeSettings.x,hazeSettings.y,z)*hazeSettings.z;
        pixel.rgb=mix(pixel.rgb,hazeColor,haze);
      }`);
    this.aoResolveUniforms=Object.fromEntries(['sceneColor','sceneDepth','aoMap','size','farDepth','hazeSettings','hazeColor'].map(name=>[name,gl.getUniformLocation(this.aoResolveProgram,name)]));
    this.depthSampleProgram=Program(fullscreenVertex,`#version 300 es
      precision highp float;
      precision highp int;
      uniform sampler2D sceneDepth;
      uniform highp usampler2D sampleIndices;
      uniform uint sourceWidth;
      out float pixel;
      void main() {
        uint index=texelFetch(sampleIndices,ivec2(gl_FragCoord.xy),0).r;
        pixel=texelFetch(sceneDepth,ivec2(index%sourceWidth,index/sourceWidth),0).r;
      }`);
    this.depthSampleUniforms=Object.fromEntries(['sceneDepth','sampleIndices','sourceWidth'].map(name=>[name,gl.getUniformLocation(this.depthSampleProgram,name)]));
    this.shadowBuffer=gl.createBuffer();this.shadowVao=gl.createVertexArray();
    gl.bindVertexArray(this.shadowVao);gl.bindBuffer(gl.ARRAY_BUFFER,this.shadowBuffer);
    gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,12,0);
    this.fullscreenVao=gl.createVertexArray();
    const settings=FLOW_RENDERING.lighting;
    this.shadowTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.shadowTexture);
    this.maxTextureSize=gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.shadowSize=Math.min(settings.shadowMapSize,this.maxTextureSize);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_COMPARE_MODE,gl.COMPARE_REF_TO_TEXTURE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_COMPARE_FUNC,gl.LEQUAL);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,this.shadowSize,this.shadowSize,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);
    this.shadowFramebuffer=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,this.shadowFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,this.shadowTexture,0);
    gl.drawBuffers([gl.NONE]);gl.readBuffer(gl.NONE);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) throw new Error('Incomplete shadow framebuffer');
  }

  EnsureLayerTextures() {
    if (this.layerTextures) return this.layerTextures;
    if (!loadedLayerPack) { PreloadEncounterTerrainLayers(); return null; }
    const gl = this.gl, pack = loadedLayerPack;
    this.validateResources = true;
    const anisotropy = gl.getExtension('EXT_texture_filter_anisotropic');
    const maxAniso = anisotropy ? Math.min(FLOW_RENDERING.terrainSurface.anisotropy, gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT)) : 0;
    const MakeArrayTex = (data, size, srgb) => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, srgb ? gl.SRGB8_ALPHA8 : gl.RGBA8, size, size, pack.layers, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
      gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
      if (anisotropy && maxAniso > 1) gl.texParameterf(gl.TEXTURE_2D_ARRAY, anisotropy.TEXTURE_MAX_ANISOTROPY_EXT, maxAniso);
      return tex;
    };
    gl.activeTexture(gl.TEXTURE5);
    const albedo = MakeArrayTex(pack.albedoData, pack.albedoSize, true);
    gl.activeTexture(gl.TEXTURE6);
    const surface = MakeArrayTex(pack.surfaceData, pack.surfaceSize, false);
    gl.activeTexture(gl.TEXTURE0);
    this.layerTextures = { albedo, surface, pack };
    return this.layerTextures;
  }

  BindTerrainSurface(surface) {
    const gl=this.gl,uniforms=this.surfaceUniforms;
    gl.uniform1i(uniforms.terrainSurface,surface?1:0);
    gl.uniform1i(uniforms.groundColor,1);gl.uniform1i(uniforms.distantColor,2);
    gl.uniform1i(uniforms.splatMap,3);gl.uniform1i(uniforms.macroTintMap,4);
    gl.uniform1i(uniforms.layerAlbedo,5);gl.uniform1i(uniforms.layerSurface,6);
    const layerGpu=surface?.splat?this.EnsureLayerTextures():null;
    const layered=!!(surface?.splat&&layerGpu);
    gl.uniform1i(uniforms.terrainLayered,layered?1:0);
    // Keep TEXTURE3..6 bound to valid textures even when layered shading is inactive
    gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,this.blank2d);
    gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,this.blank2d);
    gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D_ARRAY,layerGpu?layerGpu.albedo:this.blankArray);
    gl.activeTexture(gl.TEXTURE6);gl.bindTexture(gl.TEXTURE_2D_ARRAY,layerGpu?layerGpu.surface:this.blankArray);
    if(!surface) {gl.activeTexture(gl.TEXTURE0);return;}
    if(!this.surfaceTextures.has(surface)) {
      this.validateResources=true;
      gl.activeTexture(gl.TEXTURE1);
      // The shared context serves every pane. Reuse the same set of maps,
      // and release replaced scene maps when the editor changes terrain.
      while(this.surfaceTextures.size>=2) {
        const [oldSource,textures]=this.surfaceTextures.entries().next().value;
        for(const texture of textures) if(texture) gl.deleteTexture(texture);
        this.surfaceTextures.delete(oldSource);
      }
      const anisotropy=gl.getExtension('EXT_texture_filter_anisotropic');
      const UploadMap=(map,mipmaps)=>{
        if(!map) return null;
        const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,mipmaps?gl.LINEAR_MIPMAP_LINEAR:gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,map.width||1,map.height||1,0,gl.RGBA,gl.UNSIGNED_BYTE,map.data||new Uint8Array(4));
        if(mipmaps) {
          gl.generateMipmap(gl.TEXTURE_2D);
          if(anisotropy) gl.texParameterf(gl.TEXTURE_2D,anisotropy.TEXTURE_MAX_ANISOTROPY_EXT,
            Math.min(FLOW_RENDERING.terrainSurface.anisotropy,gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
        }
        return texture;
      };
      const sceneMap=Object.getOwnPropertyDescriptor(surface,"scene")?.value||null;
      const textures=[
        UploadMap(sceneMap||{width:1,height:1,data:new Uint8Array(4)},true),
        UploadMap(surface.backdrop||{width:1,height:1,data:new Uint8Array(4)},true),
        // Splat map keeps linear filtering without mipmap bleeding across signed rut coordinates
        UploadMap(surface.splat,false),
        UploadMap(surface.macroTint,true),
      ];
      this.surfaceTextures.set(surface,textures);
    }
    const textures=this.surfaceTextures.get(surface);
    const sceneMap=Object.getOwnPropertyDescriptor(surface,"scene")?.value||null;
    const groundMeta=sceneMap||surface.splat;
    for(const [index,map] of [groundMeta,surface.backdrop].entries()) {
      gl.activeTexture(gl.TEXTURE1+index);gl.bindTexture(gl.TEXTURE_2D,textures[index]);
      gl.uniform1i(index?uniforms.distantColor:uniforms.groundColor,1+index);
      const extent=map?[map.minX,map.minZ,(map.width-(index?0:1))*map.texelM,(map.height-(index?0:1))*map.texelM]:[0,0,1,1];
      gl.uniform4fv(index?uniforms.distantBounds:uniforms.groundBounds,extent);
    }
    if(surface.splat) {
      gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,textures[2]||this.blank2d);
      gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,textures[3]||this.blank2d);
    }
    if(layered) {
      const pack=layerGpu.pack;
      gl.uniform4fv(uniforms.layerTileNear,pack.tileNear);
      gl.uniform4fv(uniforms.layerTileFar,pack.tileFar);
      gl.uniform4fv(uniforms.layerNormalScale,pack.normalScale);
      gl.uniform4fv(uniforms.layerHeightOffset,pack.heightOffset);
      for(let i=0;i<4;i++) {
        gl.uniform4fv(uniforms[`layerAlbedoMean${i}`],pack.albedoMean.subarray(i*4,i*4+4));
        gl.uniform4fv(uniforms[`layerSurfaceMean${i}`],pack.surfaceMean.subarray(i*4,i*4+4));
        gl.uniform3fv(uniforms[`layerTint${i}`],pack.tints[i]);
      }
      gl.uniform1f(uniforms.layerAlbedoScale,pack.albedoScale);
      const geo=surface.geo;
      gl.uniform4f(uniforms.riverParams,geo?1:0,geo?geo.riverZShift:0,geo&&geo.isMerged?1:0,0);
    }
    gl.activeTexture(gl.TEXTURE0);
  }

  Resize(width,height) {
    const gl=this.gl,key=`${width}x${height}`;
    if(this.canvas.width<width||this.canvas.height<height) {this.canvas.width=Math.max(width,this.canvas.width);this.canvas.height=Math.max(height,this.canvas.height);}
    if(this.targets.has(key)) {
      const target=this.targets.get(key);this.targets.delete(key);this.targets.set(key,target);
      this.target=target;this.framebuffer=target.framebuffer;return;
    }
    // Reuse the different sizes of the four panes instead of reallocating GPU
    // attachments when switching from the left pane to the right pane.
    while(this.targets.size>=4) {
      const [oldKey,target]=this.targets.entries().next().value;
      gl.deleteFramebuffer(target.framebuffer);gl.deleteFramebuffer(target.shadedFramebuffer);gl.deleteTexture(target.shadedColor);gl.deleteFramebuffer(target.aoFramebuffer);gl.deleteTexture(target.aoTexture);gl.deleteTexture(target.color);gl.deleteTexture(target.distance);gl.deleteTexture(target.normal);gl.deleteRenderbuffer(target.depth);this.targets.delete(oldKey);
    }
    this.validateResources=true;
    const target={framebuffer:gl.createFramebuffer(),color:gl.createTexture(),distance:gl.createTexture(),normal:gl.createTexture(),depth:gl.createRenderbuffer()};
    this.targets.set(key,target);this.target=target;this.framebuffer=target.framebuffer;
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.framebuffer);
    for(const [texture,attachment,format,type,internal] of [
      [target.color,gl.COLOR_ATTACHMENT0,gl.RGBA,gl.UNSIGNED_BYTE,gl.RGBA8],
      [target.distance,gl.COLOR_ATTACHMENT1,gl.RED,gl.FLOAT,gl.R32F],
      [target.normal,gl.COLOR_ATTACHMENT2,gl.RGBA,gl.HALF_FLOAT,gl.RGBA16F],
    ]) {
      gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texImage2D(gl.TEXTURE_2D,0,internal,width,height,0,format,type,null);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,attachment,gl.TEXTURE_2D,texture,0);
    }
    gl.bindRenderbuffer(gl.RENDERBUFFER,target.depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT32F,width,height);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,target.depth);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1,gl.COLOR_ATTACHMENT2]);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) throw new Error('Incomplete raster framebuffer');
    target.shadedFramebuffer=gl.createFramebuffer();target.shadedColor=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,target.shadedColor);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    gl.bindFramebuffer(gl.FRAMEBUFFER,target.shadedFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,target.shadedColor,0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) throw new Error('Incomplete AO framebuffer');
    target.aoFramebuffer=gl.createFramebuffer();target.aoTexture=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,target.aoTexture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    target.aoWidth=Math.max(1,Math.ceil(width*FLOW_RENDERING.lighting.aoRenderScale));
    target.aoHeight=Math.max(1,Math.ceil(height*FLOW_RENDERING.lighting.aoRenderScale));
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,target.aoWidth,target.aoHeight,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    gl.bindFramebuffer(gl.FRAMEBUFFER,target.aoFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,target.aoTexture,0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) throw new Error('Incomplete AO factor framebuffer');
  }

  PrepareResidentGeometry(raster) {
    if(!raster.resident||!raster.worldBatches.length) return null;
    const gl=this.gl,settings=FLOW_RENDERING.residentGeometry,owner=raster.view.mapData;
    let arena=this.residentOwners.get(owner);
    const pool=owner.terrain?.nativePool,reserved=(pool?.capacity||0)*36;
    if(arena&&arena.pool!==pool) {
      gl.deleteBuffer(arena.buffer);gl.deleteVertexArray(arena.vao);this.residentOwners.delete(owner);arena=null;
    }
    const previous=raster.residentIndexRecord;
    if(previous&&previous.arena===arena&&previous.generation===arena.generation&&previous.batches===raster.worldBatches) return previous;
    let needed=0,total=0,count=0;
    for(const vertices of raster.worldBatches) {
      if(vertices instanceof Uint32Array) {count+=vertices.length;continue;}
      count+=vertices.length/9;
      total+=vertices.byteLength;
      if(!arena?.entries.has(vertices)) needed+=vertices.byteLength;
    }
    if(total+reserved>settings.maxBytes||(pool&&pool.count>pool.capacity)) {raster.MaterializeWorldBatches();return null;}
    if(arena&&arena.used+needed>settings.maxBytes) {
      // Recycle the existing high-water allocation. Index buffers in other panes
      // must be rebuilt before they refer to these offsets again.
      arena.generation++;arena.used=reserved;arena.entries=new WeakMap();needed=total;
    }
    if(!arena) {
      this.validateResources=true;
      while(this.residentOwners.size>=settings.owners) {
        const [oldOwner,old]=this.residentOwners.entries().next().value;
        gl.deleteBuffer(old.buffer);gl.deleteVertexArray(old.vao);this.residentOwners.delete(oldOwner);
      }
      arena={entries:new WeakMap(),buffer:gl.createBuffer(),vao:gl.createVertexArray(),
        generation:0,used:reserved,pool,uploaded:0,capacity:settings.initialBytes,indices:new Uint32Array(0)};
      while(arena.capacity<reserved+needed) arena.capacity*=2;
      gl.bindBuffer(gl.ARRAY_BUFFER,arena.buffer);gl.bufferData(gl.ARRAY_BUFFER,arena.capacity,gl.STATIC_DRAW);
      this.residentOwners.set(owner,arena);
    }
    if(arena.used+needed>arena.capacity) {
      this.validateResources=true;
      let capacity=arena.capacity;
      while(capacity<arena.used+needed) capacity*=2;
      const buffer=gl.createBuffer();gl.bindBuffer(gl.COPY_WRITE_BUFFER,buffer);gl.bufferData(gl.COPY_WRITE_BUFFER,capacity,gl.STATIC_DRAW);
      gl.bindBuffer(gl.COPY_READ_BUFFER,arena.buffer);gl.copyBufferSubData(gl.COPY_READ_BUFFER,gl.COPY_WRITE_BUFFER,0,0,arena.used);
      gl.deleteBuffer(arena.buffer);arena.buffer=buffer;arena.capacity=capacity;
    }
    gl.bindVertexArray(arena.vao);gl.bindBuffer(gl.ARRAY_BUFFER,arena.buffer);
    for(let index=0;index<3;index++) {gl.enableVertexAttribArray(index);gl.vertexAttribPointer(index,3,gl.FLOAT,false,36,index*12);}
    if(pool&&arena.uploaded<pool.count) {
      const first=arena.uploaded*9;
      gl.bufferSubData(gl.ARRAY_BUFFER,first*4,pool.data,first,pool.count*9-first);
      arena.uploaded=pool.count;
    }
    if(arena.indices.length<count) arena.indices=new Uint32Array(2**Math.ceil(Math.log2(count)));
    const uploadStart=arena.used,additions=needed?new Float32Array(needed/4):null;
    let offset=0;
    for(const vertices of raster.worldBatches) {
      if(vertices instanceof Uint32Array) {
        arena.indices.set(vertices,offset);offset+=vertices.length;continue;
      }
      let indices=arena.entries.get(vertices);
      if(!indices) {
        const first=arena.used/36,length=vertices.length/9;
        indices=new Uint32Array(length);
        for(let index=0;index<length;index++) indices[index]=first+index;
        additions.set(vertices,(arena.used-uploadStart)/4);
        arena.used+=vertices.byteLength;arena.entries.set(vertices,indices);
      }
      arena.indices.set(indices,offset);offset+=indices.length;
    }
    if(additions) gl.bufferSubData(gl.ARRAY_BUFFER,uploadStart,additions.subarray(0,(arena.used-uploadStart)/4));
    const indexBuffer=previous?.indexBuffer||gl.createBuffer();
    this.UploadStream(gl.ELEMENT_ARRAY_BUFFER,indexBuffer,arena.indices,count,Math.min(4*1024*1024,reserved/8));
    const record={arena,generation:arena.generation,indexBuffer,count,batches:raster.worldBatches};
    raster.residentIndexRecord=record;
    return record;
  }

  UploadStream(target,buffer,source,count,minimum=65536) {
    if(!count) return;
    const gl=this.gl,bytes=count*source.BYTES_PER_ELEMENT;
    gl.bindBuffer(target,buffer);
    if((this.streamCapacities.get(buffer)||0)<bytes) {
      const capacity=2**Math.ceil(Math.log2(Math.max(bytes,minimum)));
      gl.bufferData(target,capacity,gl.DYNAMIC_DRAW);
      this.streamCapacities.set(buffer,capacity);this.validateResources=true;
    }
    gl.bufferSubData(target,0,source,0,count);
  }

  ResourcesReady() {
    if(this.validateResources) {
      this.validateResources=false;
      const cpu=this.trace?.cpu;
      cpu?.Begin("gl.getError");
      try {this.resourceFailed=this.gl.getError()!==this.gl.NO_ERROR;}
      finally {cpu?.End();}
    }
    return !this.resourceFailed&&!this.gl.isContextLost();
  }

  DrawResidentGeometry() {
    if(!this.residentWorld) return;
    this.gl.bindVertexArray(this.residentWorld.arena.vao);
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER,this.residentWorld.indexBuffer);
    this.gl.drawElements(this.gl.TRIANGLES,this.residentWorld.count,this.gl.UNSIGNED_INT,0);
  }

  BindSceneTarget(raster) {
    const gl=this.gl,target=this.target;
    // Draw distance directly into this pane's picking texture. Other panes of
    // the same size reuse the color targets but keep their own last depth.
    const distance=raster.sparseDepth?this.DepthSnapshot(raster).texture:target.distance;
    gl.bindFramebuffer(gl.FRAMEBUFFER,target.framebuffer);
    if(target.attachedDistance!==distance) {
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT1,gl.TEXTURE_2D,distance,0);
      target.attachedDistance=distance;
    }
  }

  DepthSnapshot(raster) {
    const gl=this.gl;
    let snapshot=raster.depthSnapshot;
    if(!snapshot||snapshot.gl!==gl||snapshot.width!==raster.width||snapshot.height!==raster.height) {
      if(snapshot?.gl===gl) {gl.deleteTexture(snapshot.texture);gl.deleteFramebuffer(snapshot.framebuffer);}
      this.validateResources=true;
      snapshot={gl,width:raster.width,height:raster.height,texture:gl.createTexture(),framebuffer:gl.createFramebuffer()};
      gl.bindTexture(gl.TEXTURE_2D,snapshot.texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.R32F,raster.width,raster.height,0,gl.RED,gl.FLOAT,null);
      gl.bindFramebuffer(gl.FRAMEBUFFER,snapshot.framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,snapshot.texture,0);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0]);gl.bindTexture(gl.TEXTURE_2D,null);
      raster.depthSnapshot=snapshot;
    }
    return snapshot;
  }

  ReadFullDepth(raster) {
    return this.Trace(raster,this.ReadFullDepthContent);
  }

  ReadFullDepthContent(raster) {
    this.Phase("深度回读");
    const gl=this.gl;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER,raster.depthSnapshot.framebuffer);gl.readBuffer(gl.COLOR_ATTACHMENT0);
    this.ReadDepthPixels(raster.width,raster.height,raster.depthData);
  }

  ReadDepthPixels(width,height,data) {
    const gl=this.gl,cpu=this.trace?.cpu;
    cpu?.Begin("gl.readPixels");
    try {gl.readPixels(0,0,width,height,gl.RED,gl.FLOAT,data);}
    finally {cpu?.End();}
  }

  ReadDepthSamples(raster) {
    if(!raster.depthSampleCount) return;
    return this.Trace(raster,this.ReadDepthSamplesContent);
  }

  ReadDepthSamplesContent(raster) {
    this.Phase("深度采样");
    const gl=this.gl,width=FLOW_RENDERING.depthReadback.sampleWidth;
    const rows=Math.ceil(raster.depthSampleCount/width);
    if(rows>this.maxTextureSize) {
      this.ReadFullDepth(raster);raster.fullDepthReady=true;raster.depthSampleCount=0;return;
    }
    if(!this.depthSamples||this.depthSamples.height<rows) {
      if(this.depthSamples) {
        gl.deleteTexture(this.depthSamples.indices);gl.deleteTexture(this.depthSamples.values);gl.deleteFramebuffer(this.depthSamples.framebuffer);
      }
      const height=2**Math.ceil(Math.log2(Math.max(1,rows)));
      const samples={height,indices:gl.createTexture(),values:gl.createTexture(),framebuffer:gl.createFramebuffer(),
        keys:new Uint32Array(width*height),depth:new Float32Array(width*height)};
      gl.activeTexture(gl.TEXTURE1);
      for(const [texture,internal,format,type] of [[samples.indices,gl.R32UI,gl.RED_INTEGER,gl.UNSIGNED_INT],[samples.values,gl.R32F,gl.RED,gl.FLOAT]]) {
        gl.bindTexture(gl.TEXTURE_2D,texture);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
        gl.texImage2D(gl.TEXTURE_2D,0,internal,width,height,0,format,type,null);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER,samples.framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,samples.values,0);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
      this.depthSamples=samples;
    }
    const samples=this.depthSamples;
    samples.keys.set(raster.depthSampleKeys.subarray(0,raster.depthSampleCount));
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,samples.indices);
    gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,width,rows,gl.RED_INTEGER,gl.UNSIGNED_INT,samples.keys.subarray(0,width*rows));
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,raster.depthSnapshot.texture);
    gl.bindFramebuffer(gl.FRAMEBUFFER,samples.framebuffer);gl.viewport(0,0,width,rows);gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.depthSampleProgram);gl.bindVertexArray(this.fullscreenVao);
    gl.uniform1i(this.depthSampleUniforms.sceneDepth,0);gl.uniform1i(this.depthSampleUniforms.sampleIndices,1);
    gl.uniform1ui(this.depthSampleUniforms.sourceWidth,raster.width);
    gl.drawArrays(gl.TRIANGLES,0,3);gl.readBuffer(gl.COLOR_ATTACHMENT0);
    this.ReadDepthPixels(width,rows,samples.depth.subarray(0,width*rows));
    for(let index=0;index<raster.depthSampleCount;index++) raster.depthData[raster.depthSampleKeys[index]]=samples.depth[index];
    for(let index=0;index<raster.depthTiles.length;index++) if(raster.depthTiles[index]===1) raster.depthTiles[index]=2;
    raster.depthSampleCount=0;
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,null);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,null);
  }

  DrawShadows(raster) {
    const gl=this.gl,view=raster.view,settings=view.lighting;
    const sun=FLOW_RENDERING.sky.sunDirection.map(value=>value/Math.hypot(...FLOW_RENDERING.sky.sunDirection));
    const horizontal=Math.hypot(sun[0],sun[2]),right=[sun[2]/horizontal,0,-sun[0]/horizontal];
    const up=[sun[1]*right[2],sun[2]*right[0]-sun[0]*right[2],-sun[1]*right[0]];
    const orthographic=!raster.perspective;
    const distance=Math.min(180,Math.max(20,(view.eye[1]-view.Ground([view.eye[0],view.eye[2]]))/Math.max(0.15,-view.forward[1])));
    const center=orthographic?[...view.aim]:view.eye.map((value,axis)=>value+view.forward[axis]*distance);
    // Radius steps up in 20% increments and the center snaps to whole texels, so
    // shadow edges stay put while the camera moves instead of crawling.
    const wanted=Math.min(settings.shadowMaxRadiusM,Math.max(settings.shadowMinRadiusM,orthographic?Math.max(view.width,view.height)/view.scale*0.65:distance*1.5));
    const radius=Math.min(settings.shadowMaxRadiusM,Math.max(settings.shadowMinRadiusM,1.2**Math.ceil(Math.log(wanted)/Math.log(1.2))));
    const texelSize=radius*2/this.shadowSize,snapRight=Math.round(Dot(center,right)/texelSize)*texelSize-Dot(center,right),snapUp=Math.round(Dot(center,up)/texelSize)*texelSize-Dot(center,up);
    for(let axis=0;axis<3;axis++) center[axis]+=right[axis]*snapRight+up[axis]*snapUp;
    const values={shadowCenter:center,shadowRight:right,shadowUp:up,sun,shadowSettings:[radius,settings.shadowDepthM,settings.shadowBiasM/settings.shadowDepthM/2,settings.shadowStrength]};
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,null);
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.shadowFramebuffer);gl.viewport(0,0,this.shadowSize,this.shadowSize);
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LESS);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);
    gl.clearBufferfv(gl.DEPTH,0,new Float32Array([1]));gl.useProgram(this.shadowProgram);
    for(const [name,value] of Object.entries(values)) {
      if(value.length===4) gl.uniform4fv(this.shadowUniforms[name],value);else gl.uniform3fv(this.shadowUniforms[name],value);
    }
    gl.bindVertexArray(this.shadowVao);
    gl.drawArrays(gl.TRIANGLES,0,raster.shadowVertices.length/3);
    // Visible terrain, vehicles and carried objects also cast shadows.
    this.DrawResidentGeometry();
    if(raster.worldLength) {
      gl.bindVertexArray(this.vao);gl.drawArrays(gl.TRIANGLES,0,raster.worldLength/9);
    }
    return values;
  }

  DrawAmbientOcclusion(raster) {
    this.Phase("环境遮蔽");
    const gl=this.gl,view=raster.view,settings=view.lighting;
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.target.aoFramebuffer);gl.disable(gl.DEPTH_TEST);
    gl.viewport(0,0,this.target.aoWidth,this.target.aoHeight);
    gl.useProgram(this.aoProgram);gl.bindVertexArray(this.fullscreenVao);
    for(const [unit,name,texture] of [[0,'sceneColor',this.target.color],[1,'sceneDepth',this.target.attachedDistance],[2,'sceneNormal',this.target.normal]]) {
      gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(this.aoUniforms[name],unit);
    }
    gl.uniform2f(this.aoUniforms.size,raster.width,raster.height);
    gl.uniform2f(this.aoUniforms.aoSize,this.target.aoWidth,this.target.aoHeight);
    gl.uniform4f(this.aoUniforms.projection,(raster.perspective?view.focal:view.scale)*raster.coordinateScale,raster.perspective?0.49:0.57,view.near,view.far);
    gl.uniform4f(this.aoUniforms.aoSettings,settings.aoRadiusM,settings.aoStrength,settings.aoMaxPixels,0);
    gl.uniform2f(this.aoUniforms.terrainAo,settings.aoTerrainScale??FLOW_RENDERING.lighting.aoTerrainScale,
      settings.aoTerrainBias??FLOW_RENDERING.lighting.aoTerrainBias);
    gl.uniform1f(this.aoUniforms.minLight,settings.aoMinLight);gl.uniform1i(this.aoUniforms.perspective,raster.perspective?1:0);
    gl.drawArrays(gl.TRIANGLES,0,3);
    // Resolve: average the dithered factors and apply them to the lit color.
    this.Phase("遮蔽合成与远雾");
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.target.shadedFramebuffer);
    gl.viewport(0,0,raster.width,raster.height);
    gl.useProgram(this.aoResolveProgram);
    for(const [unit,name,texture] of [[0,'sceneColor',this.target.color],[1,'sceneDepth',this.target.attachedDistance],[2,'aoMap',this.target.aoTexture]]) {
      gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(this.aoResolveUniforms[name],unit);
    }
    gl.uniform2f(this.aoResolveUniforms.size,raster.width,raster.height);gl.uniform1f(this.aoResolveUniforms.farDepth,view.far);
    const haze=FLOW_RENDERING.haze;
    gl.uniform3f(this.aoResolveUniforms.hazeSettings,haze.startM,haze.endM,haze.strength);
    gl.uniform3fv(this.aoResolveUniforms.hazeColor,[1,3,5].map(offset=>parseInt(FLOW_RENDERING.sky.horizon.slice(offset,offset+2),16)/255));
    gl.drawArrays(gl.TRIANGLES,0,3);
    gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,null);
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,null);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,null);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER,this.target.shadedFramebuffer);
  }

  Draw(raster) {
    return this.Trace(raster,this.DrawContent);
  }

  DebugGeometry(raster,vao,first,count) {
    if(vao===this.residentWorld?.arena.vao)
      return {name:"场景静态几何",batches:this.residentWorld.batches.map(batch=>batch instanceof Uint32Array?raster.view.mapData.terrain.expandNative(batch):batch),stride:9};
    if(vao===this.shadowVao)
      return {name:"阴影投射几何",data:raster.shadowVertices,stride:3,immutable:true};
    if(vao===this.vao)
      return {name:"动态世界几何",data:raster.worldVertices.subarray(0,raster.worldLength),stride:9};
    if(vao===this.screenVao)
      return {name:"屏幕空间几何",data:raster.gpuVertices.subarray(0,raster.gpuLength),stride:6};
    if(vao===this.overlay.layout.vao) {
      const stride=this.overlay.layout.stride;
      return {name:"文字与标记批次",data:this.overlay.vertices.subarray(first*stride,(first+count)*stride),stride,colorScale:1};
    }
    return null;
  }

  DebugTargetName(framebuffer) {
    if(!framebuffer) return "视口 Backbuffer";
    if(framebuffer===this.shadowFramebuffer) return "阴影贴图";
    if(framebuffer===this.target?.framebuffer) return "场景 G-Buffer";
    if(framebuffer===this.target?.aoFramebuffer) return "环境遮蔽";
    if(framebuffer===this.target?.shadedFramebuffer) return "场景合成";
    if(framebuffer===this.depthSamples?.framebuffer) return "深度采样";
    if(framebuffer===this.overlay.flagFbo) return "人物可见性";
    return "WebGL2 Render Target";
  }

  DebugProgramName(program) {
    if(program===this.program) return "Encounter Scene";
    if(program===this.shadowProgram) return "Encounter Shadow";
    if(program===this.aoProgram) return "Encounter AO";
    if(program===this.aoResolveProgram) return "Encounter AO Resolve";
    if(program===this.depthSampleProgram) return "Encounter Depth Samples";
    if(program===this.overlay.program) return "Encounter Overlay";
    if(program===this.overlay.probeProgram) return "Encounter Visibility";
    return "WebGL2 Program";
  }

  DebugTextureInfo(raster,texture) {
    const {width,height}=raster,target=this.target;
    if(texture===this.shadowTexture)
      return {name:"阴影贴图",format:"DEPTH_COMPONENT24",width:this.shadowSize,height:this.shadowSize,scalar:true,flipY:false};
    const scene=[
      [target.color,"场景颜色","RGBA8"],
      [target.attachedDistance,"线性距离","R32F",true],
      [target.normal,"场景法线","RGBA16F"],
    ].find(([handle])=>handle===texture);
    if(scene) return {name:scene[1],format:scene[2],width,height,scalar:scene[3],flipY:false};
    if(texture===target.aoTexture)
      return {name:"环境遮蔽",format:"RGBA8",width:target.aoWidth,height:target.aoHeight,flipY:false};
    if(texture===this.depthSamples?.indices)
      return {name:"采样坐标",format:"R32UI",width:FLOW_RENDERING.depthReadback.sampleWidth,height:this.depthSamples.height};
    if(texture===raster.depthSnapshot?.texture)
      return {name:"视口线性距离",format:"R32F",width:raster.depthSnapshot.width,height:raster.depthSnapshot.height,scalar:true,flipY:false};
    if(texture===this.overlay.flags)
      return {name:"人物可见性",format:"RGBA8",width:this.overlay.flagWidth,height:1};
    if(texture===this.overlay.blank)
      return {name:"叠层空白纹理",format:"RGBA8",width:1,height:1};
    if(this.overlay.pages.some(page=>page.texture===texture))
      return {name:"叠层文字图集",format:"RGBA8",width:this.overlay.atlasSize,height:this.overlay.atlasSize,flipY:false};
    const surface=raster.terrainSurface,terrain=surface?this.surfaceTextures.get(surface):null;
    const slot=terrain?.indexOf(texture);
    if(slot>=0) {
      const sceneMap=Object.getOwnPropertyDescriptor(surface,"scene")?.value||null;
      const entries=[
        ["场景地表",sceneMap],
        ["远景地表",surface.backdrop],
        ["地表权重图",surface.splat],
        ["地表宏观色",surface.macroTint],
      ];
      const [label,map]=entries[slot]||["场景地表",sceneMap];
      return {name:label,format:"RGBA8",width:map?.width||1,height:map?.height||1,flipY:false};
    }
    if(this.layerTextures) {
      if(texture===this.layerTextures.albedo)
        return {name:"地形图层反照率",format:"SRGB8_ALPHA8[4]",width:this.layerTextures.pack.albedoSize,height:this.layerTextures.pack.albedoSize,flipY:false};
      if(texture===this.layerTextures.surface)
        return {name:"地形图层法线",format:"RGBA8[4]",width:this.layerTextures.pack.surfaceSize,height:this.layerTextures.pack.surfaceSize,flipY:false};
    }
    return null;
  }

  Trace(raster,method) {
    const trace=raster.debugTrace;
    if(!trace||this.trace===trace) return method.call(this,raster);
    const gl=this.gl,restore=[];
    let inspecting=false;
    this.trace=trace;
    trace.cpu?.Begin("WebGL2");
    try {
      for(const api of ["drawArrays","drawElements","drawArraysInstanced",...(trace.capturing?["clearBufferfv","blitFramebuffer"]:[])]) {
        const original=gl[api],own=Object.hasOwn(gl,api);
        gl[api]=(...args)=>{
          if(inspecting) return original.apply(gl,args);
          const triangles=api==="drawElements"?args[1]/3:api==="drawArrays"?args[2]/3:api==="drawArraysInstanced"?(args[0]===gl.TRIANGLES?args[2]*args[3]/3:0):null;
          const query=trace.BeginGl(gl),timed=trace.capturing||trace.captureDraws;
          const start=timed?performance.now():0;
          try {return original.apply(gl,args);}
          finally {
            const elapsed=timed?performance.now()-start:0;
            inspecting=true;
            try {trace.Gl(gl,this.phase,api,args,triangles,elapsed,query,this,raster);}
            finally {inspecting=false;}
          }
        };
        restore.push(()=>{if(own) gl[api]=original;else delete gl[api];});
      }
      return method.call(this,raster);
    } finally {
      this.Phase(null);this.trace=null;
      for(const undo of restore.reverse()) undo();
      trace.cpu?.End();
    }
  }

  Phase(name) {
    if(!this.trace||name===this.phase) return;
    if(this.phase) {
      this.trace.cpu?.End();
      this.trace.EndGpu();
    }
    this.phase=name;
    if(name) {
      this.trace.BeginGpu(name);
      this.trace.cpu?.Begin(name);
    }
  }

  DrawContent(raster) {
    const gl=this.gl;if(this.resourceFailed||gl.isContextLost()) return false;
    this.trace?.cpu?.Begin("帧缓冲准备");
    try {this.Resize(raster.width,raster.height);} catch {unavailable=true;return false;}
    finally {this.trace?.cpu?.End();}
    this.Phase("几何准备");
    const cpuTrace=this.trace?.cpu;
    cpuTrace?.Begin("常驻顶点与索引");
    try {this.residentWorld=this.PrepareResidentGeometry(raster);} finally {cpuTrace?.End();}
    cpuTrace?.Begin("视口目标和动态缓冲");
    const lighting=raster.view?.lighting&&raster.shadowVertices;
    this.BindSceneTarget(raster);
    this.UploadStream(gl.ARRAY_BUFFER,this.buffer,raster.worldVertices,raster.worldLength);
    this.UploadStream(gl.ARRAY_BUFFER,this.screenBuffer,raster.gpuVertices,raster.gpuLength);
    if(lighting&&this.uploadedShadowVertices!==raster.shadowVertices) {
      this.UploadStream(gl.ARRAY_BUFFER,this.shadowBuffer,raster.shadowVertices,raster.shadowVertices.length);
      this.uploadedShadowVertices=raster.shadowVertices;
    }
    cpuTrace?.End();
    // Resource growth can fail. Validate it before queueing the expensive shadow
    // and scene passes; an unchanged frame needs no synchronous driver query.
    this.Phase(null);
    if(!this.ResourcesReady()) return false;
    if(lighting) this.Phase("阴影");
    const shadowValues=lighting?this.DrawShadows(raster):null;
    this.Phase("主场景");
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.framebuffer);gl.viewport(0,0,raster.width,raster.height);
    gl.disable(gl.BLEND);gl.disable(gl.DITHER);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LESS);
    gl.clearBufferfv(gl.COLOR,0,new Float32Array(4));gl.clearBufferfv(gl.COLOR,1,new Float32Array([Infinity,0,0,0]));
    gl.clearBufferfv(gl.COLOR,2,new Float32Array(4));
    gl.clearBufferfv(gl.DEPTH,0,new Float32Array([1]));
    gl.useProgram(this.program);gl.uniform2f(this.size,raster.width,raster.height);gl.uniform1i(this.perspective,raster.perspective?1:0);
    gl.uniform1i(this.lightingUniforms.lit,lighting?1:0);
    const balance=raster.view?.lighting||FLOW_RENDERING.lighting;
    gl.uniform2f(this.lightingUniforms.lightBalance,balance.ambient,balance.direct);
    const sun=FLOW_RENDERING.sky.sunDirection,sunLength=Math.hypot(...sun);
    gl.uniform3fv(this.lightingUniforms.sun,sun.map(value=>value/sunLength));
    // WebGL validates the shadow sampler even when the lighting branch is off.
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.shadowTexture);gl.uniform1i(this.lightingUniforms.shadowMap,0);
    if(lighting) {
      gl.uniform2f(this.lightingUniforms.lightBalance,raster.view.lighting.ambient,raster.view.lighting.direct);
      for(const [name,value] of Object.entries(shadowValues)) {
        if(value.length===4) gl.uniform4fv(this.lightingUniforms[name],value);else gl.uniform3fv(this.lightingUniforms[name],value);
      }
    }
    const cpu=this.trace?.cpu;
    cpu?.Begin("地表贴图");
    try {this.BindTerrainSurface(raster.terrainSurface);}
    finally {cpu?.End();}
    gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
    if(raster.view) {
      const view=raster.view;
      for(const name of ['eye','right','up','forward']) gl.uniform3fv(this.cameraUniforms[name],view[name]);
      gl.uniform4f(this.cameraUniforms.projection,(raster.perspective?view.focal:view.scale)*raster.coordinateScale,raster.perspective?0.49:0.57,view.near,view.far);
    }
    gl.uniform1i(this.world,1);this.DrawResidentGeometry();
    if(raster.worldLength) {
      gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
      gl.uniform1i(this.world,1);
      gl.drawArrays(gl.TRIANGLES,0,raster.worldLength/9);
    }
    if(raster.gpuLength) {
      gl.uniform1i(this.world,0);gl.bindVertexArray(this.screenVao);
      gl.drawArrays(gl.TRIANGLES,0,raster.gpuLength/6);
    }
    if(!raster.sparseDepth) {
      this.Phase("深度回读");
      gl.readBuffer(gl.COLOR_ATTACHMENT1);this.ReadDepthPixels(raster.width,raster.height,raster.depthData);
    }
    // Keep color on the GPU. Only depth is read back for editor interactions.
    if(lighting) this.DrawAmbientOcclusion(raster);
    this.Phase("输出到视口");
    gl.readBuffer(gl.COLOR_ATTACHMENT0);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,null);
    cpuTrace?.Begin("gl.blitFramebuffer");
    try {gl.blitFramebuffer(0,0,raster.width,raster.height,0,this.canvas.height,raster.width,this.canvas.height-raster.height,gl.COLOR_BUFFER_BIT,gl.NEAREST);}
    finally {cpuTrace?.End();}
    this.Phase(null);
    if(this.trace?.capturing) this.validateResources=true;
    return this.ResourcesReady();
  }
}
