// 第一关策划白盒场景：受光语义体块；P012 使用连续可变形土壤地形。
//
// 它与 TengxianField / JieheField / RangeField 实现同一套战场查询接口，但不调用
// 城、城外、道路或植被生成器。正式第一关额外预载并合批自己的工事模型；
// 归档白盒仍只画体块。所有静态体块先进入 BuildSink 合批；
// 两扇剧情门保留为独立 Mesh，收到正式第一章信号后升起并同步移除 Rapier 碰撞体。
//
// GroundHeight 取布局地形（旧布局默认0）；显式 walkableSurfaces 仅引用同一布局实体的顶面。
// 车厢地板/逐级台阶可走解析支撑，屋顶不会因为是Box就自动成为地面。

import * as THREE from "three";
import { Clamp } from "./Script_Noise.mjs";
import { RayAabb, MakeBox, PlaceGeometry } from "./Script_Geo.mjs";
import { BuildSink } from "./Script_World.mjs";
import { DeriveCoversFromColliders } from "./Script_AiCover.mjs";
import { BuildRailwayFromSpec, BuildRoadRibbon } from "./Script_RoadSpline.mjs";
import { MarkDynamicPrepass, MarkNoPrepass } from "./Script_Post.mjs";
import { T } from "./Script_Text.mjs";
import { CreateP012Terrain } from "./Script_FirstLevelP012Terrain.mjs";
import { LoadMissionFortifications, AddMissionFortifications } from "./Script_FirstLevelMissionFortifications.mjs";
import {
  FIRST_LEVEL_WHITEBOX_LAYOUT,
} from "./Data_FirstLevelWhitebox.mjs";
import { IsMissionSandbagBlock } from "./Script_FirstLevelMissionFortificationsData.mjs";
import { TrenchPlanFor } from "./Data_FirstLevelMissionTerrain.mjs";
import { BuildTrenchEarth } from "./Script_TrenchEarth.mjs";
import { TRENCH_APPEARANCE } from "./Data_TrenchAppearance.mjs";
import { TRENCH_SURFACE } from "./Data_TrenchSurface.mjs";
import { TERRAIN_SETS, TERRAIN_MUD_ZONE } from "./Data_Tuning_Terrain.mjs";
import { TerrainLayerUrls } from "./Script_Tuning_Terrain.mjs";
import { VEHICLE_TRACK_GEOMETRY } from "./Data_VehicleTracks.mjs";
import { VehicleTrackField } from "./Script_VehicleTrackField.mjs";
import { VehicleTrackView } from "./Script_VehicleTrackView.mjs";
import { TerrainTrailSystem } from "./Script_TerrainTrails.mjs";
import { LoadTrenchSurface, BuildTrenchSurface, PaintTrenchBatch } from "./Script_TrenchSurface.mjs";
import { MakeTrenchSurfacePatch } from "./Script_TrenchSurfaceMaterial.mjs";
import { CloneShadedMaterial } from "./Script_Materials.mjs";
import { SET_MATERIALS as OPENING_SET_MATERIALS } from "./Data_OpeningSet0103.mjs";
import { TerrainContactField } from "./Script_TerrainContact.mjs";
import { BreakableTrees } from "./Script_BreakableTrees.mjs";
import {
  WhiteboxLooks, LoadWhiteboxTextureSets, BuildWhiteboxWater, BuildRibbonWater,
  PrepareWhiteboxRailwayAssets, BuildInstancedRailTrackKit,
} from "./Script_FirstLevelWhiteboxLooks.mjs";
import { WHITEBOX_RAILWAY_LOOKS, PlanRoofShells } from "./Data_FirstLevelWhiteboxMaterials.mjs";
import { LoadFirstLevelPropDressing, AddFirstLevelPropDressing, AddScenePropModels } from "./Script_FirstLevelPropDressing.mjs";
import { FirstLevelVegetation, LoadFirstLevelVegetationAtlas } from "./Script_FirstLevelVegetation.mjs";
import { BuildInteriorVolumes } from "./Script_FirstLevelInteriors.mjs";
import { SetInteriorVolumes } from "./Script_InteriorSkyOcclusion.mjs";
import { BuildStaticCraterDebris } from "./Script_CraterDebris.mjs";

export function IsP012TrainBlock(id) { return /^Station(?:Car\d|Engine|ExitStep)/.test(id); }
/** 跟着车厢一起平移的那两扇门（SetTrainOffset 每帧改它们的 z）。 */
export function IsTrainGate(spec) {
  return spec?.signal === "P012TrainDoor" || spec?.signal === "MissionTrainStopped";
}
const GRID_SIZE = 12;
const CAMERA_FAR = 430;

export function CompileWhiteboxWalkableSurfaces(layout) {
  return (layout.walkableSurfaces || []).map(surface=>{
    const block=layout.blocks.find(item=>item.id===surface.id);
    if(!block || ["x","y","z","w","h","d"].some(key=>!Number.isFinite(block[key])||block[key]!==surface[key])
      || (block.ry||0)!==(surface.ry||0) || block.w<=0||block.h<=0||block.d<=0)
      throw new Error(`Walkable surface must match a layout block: ${surface.id}`);
    return {...block};
  });
}

export function SampleWhiteboxSurface(surfaces,x,z,baseHeight=0) {
  let height=baseHeight;
  for(const surface of surfaces){
    const dx=x-surface.x,dz=z-surface.z,c=Math.cos(surface.ry||0),s=Math.sin(surface.ry||0);
    if(Math.abs(dx*c-dz*s)<=surface.w/2 && Math.abs(dx*s+dz*c)<=surface.d/2)
      height=Math.max(height,surface.y+surface.h/2);
  }
  return height;
}

function MakeWhiteMaterial(name = "FirstLevelWhiteboxWhite") {
  const material = new THREE.MeshStandardMaterial({
    name,
    color: 0xffffff,
    roughness: 0.88,
    metalness: 0,
  });
  material.userData.firstLevelWhitebox = true;
  return material;
}

function MakeSemanticMaterial(name, color) {
  const material = new THREE.MeshStandardMaterial({ name, color, roughness: 0.82, metalness: 0 });
  material.userData.firstLevelWhitebox = true;
  material.userData.whiteboxSemantic = name;
  return material;
}

/**
 * 白盒体块挨枪的弹着表面。碰撞 tag 一律 whiteboxWall（按 tag 查只能落成砖墙），
 * 这里按体块自己分：显式 surface > 换成沙袋模型的那几段 > layout.semanticSurfaces。
 * 都没有就返回 null，交还 Script_Main.SURFACE_BY_TAG 按 tag 兜底。
 */
export function WhiteboxSurface(spec, layout) {
  if (spec.surface) return spec.surface;
  if (layout?.fortifications && IsMissionSandbagBlock(spec.id || "")) return "sandbag";
  return layout?.semanticSurfaces?.[spec.semantic] || null;
}

/** 把 frozen 的布局规格翻成可挂物理 handle 的碰撞记录。 */
function ColliderRecord(spec) {
  const hx = spec.w * 0.5;
  const hy = spec.h * 0.5;
  const hz = spec.d * 0.5;
  const ry = spec.ry || 0;
  const ax = Math.abs(Math.cos(ry)) * hx + Math.abs(Math.sin(ry)) * hz;
  const az = Math.abs(Math.sin(ry)) * hx + Math.abs(Math.cos(ry)) * hz;
  return {
    min: [spec.x - ax, spec.y - hy, spec.z - az],
    max: [spec.x + ax, spec.y + hy, spec.z + az],
    c: [spec.x, spec.y, spec.z],
    h: [hx, hy, hz],
    ry,
    tag: spec.tag || "whiteboxWall",
    // 2026-10-21：不能攀的块（白盒 01–05 的胸墙、板桥）：Script_Player.ProbeVault 见到它挡在正前方就不翻
    ...(spec.noClimb === true ? { noClimb: true } : {}),
  };
}

export class FirstLevelWhiteboxField {
  constructor(scene, _library, { bounds = null, zones = [], levelId = null, whiteboxLayout = null, quality = "high", debugAirWalls = false } = {}) {
    this.scene = scene;
    this.library = _library;
    this.quality = quality;
    // ?airWalls=1（Script_Main 传进来）：tag:"airWall" 的体块另画一层半透明红板，核对空气墙摆在哪
    //（docs/Data_FirstLevelGuidance20260928.md §3.2）。默认不画，碰撞照旧。
    this.debugAirWalls = !!debugAirWalls;
    // Layered terrain (Script_TerrainMaterial) once PrepareAssets loads it; null keeps the single-PBR path.
    this.terrainLayers = null;
    this.SampleGroundSurface = null;
    this.SampleCraterSurface = null;
    this.staticCraterDebris = null;
    this.vehicleTrackField = null;
    this.vehicleTrackView = null;
    this.groundMeshes = [];
    this.fortificationModels = null;
    this.fortificationPlacements = [];
    this.sharedFortificationMaterials = new Set();
    this.levelId = levelId;
    this.layout = whiteboxLayout || FIRST_LEVEL_WHITEBOX_LAYOUT;
    this.SampleGroundColor = this.layout.SampleGroundColor;
    this.walkableSurfaces = CompileWhiteboxWalkableSurfaces(this.layout);
    this.staticWalkableSurfaces = this.walkableSurfaces.filter(surface=>!IsP012TrainBlock(surface.id));
    this.terrain = this.layout.terrain === "P012Heightfield" ? CreateP012Terrain(this.layout) : null;
    this.bounds = bounds
      ? { minX: bounds.minX, maxX: bounds.maxX, minZ: bounds.minZ, maxZ: bounds.maxZ }
      : { ...this.layout.bounds };
    this.cameraFar = CAMERA_FAR;
    this.wallTopY = null;
    this.physics = null;
    this.meshes = [];
    this.colliders = [];
    this.covers = [];
    this.grid = new Map();
    this.gridSize = GRID_SIZE;
    this.generatedExternalProps = [];
    this.objectives = zones.map((zone, index) => ({
      ...zone,
      index,
      owner: "nra",
      progress: 1,
      contested: false,
      reached: false,
    }));
    this.whiteMaterial = MakeWhiteMaterial();
    this.materials = new Map([["Whitebox", this.whiteMaterial]]);
    for (const [semantic, color] of Object.entries(this.layout.semanticColors || {})) {
      this.materials.set(semantic, MakeSemanticMaterial(`FirstLevelWhitebox_${semantic}`, color));
    }
    // 2026-09-28 B1：布局写了 materialLooks 才按外观表画 PBR（PrepareAssets 里建）；
    // 归档夹具与 Node 测试保持平色语义材质。
    this.looks = null;
    this.railTrackKit = null;
    this.waterMesh = null;
    this.waterRibbons = [];
    this.waterBodies = [];
    this.trainOffsetM = 0; this.trainMeshes = []; this.trainColliders = [];
    this.gates = new Map();
    this.bindables = new Map();
    this.scenarioMeshes = [];
    this.scenarioColliders = [];
    this.scenarioState = null;
    this.legend = null;
    this.stats = {
      groundChunks: 0,
      groundTris: 0,
      structures: 0,
      whiteBoxes: 0,
      dynamicGates: 0,
      bindables: 0,
    };
  }

  TerrainHeight(x, z) { return this.terrain?.SampleHeight(x,z) ?? 0; }
  /** 壕沟网络：现行第一关走 terrainSpec，场景（docs/Data_Scene.md §9）带编好的 layout.trenchPlan；都没有是 null。 */
  TrenchPlan() {
    if (this.layout.trenchPlan) return this.layout.trenchPlan;
    return this.layout.terrainSpec?.trenchNetwork ? TrenchPlanFor(this.layout.terrainSpec) : null;
  }
  WalkableHeight(x, z, terrainHeight) { return SampleWhiteboxSurface(this.walkableSurfaces,x,z,terrainHeight); }
  GroundHeight(x, z) { return this.WalkableHeight(x,z,this.TerrainHeight(x,z)); }
  // Load-time environment placement cannot rest on the train that moves away
  // after construction. Terrain and fixed floors still use the shared sampler.
  StaticGroundHeight(x,z){return SampleWhiteboxSurface(this.staticWalkableSurfaces,x,z,this.terrain?.SampleHeight(x,z)??0);}

  async PrepareAssets() {
    // 第一关按需贴图集（Data_LevelTextureSets，docs/Data_TextureAssetStandard.md §6）：造任何网格之前下完。
    // 永不 reject，失败的套退回程序化配方；同一个 library 只下一次（别处再调也不重复下）。
    if (/^FirstLevelMission/.test(this.layout.id || "") && typeof document !== "undefined") await this.library.LoadLevelSets?.("FirstLevel");
    // 白盒体块的 PBR 外观（Data_FirstLevelWhiteboxMaterials）。LoadWhiteboxTextureSets 再问一次加载器
    // （同一 library 取回上面那次的结果），拿到退回了 fallback 的套名。
    if (this.layout.materialLooks && this.library?.Get && typeof document !== "undefined") {
      this.looks = new WhiteboxLooks(this.library, await LoadWhiteboxTextureSets(this.library));
      // 语义键的兼容位：铁路样条按语义键进 BuildSink（UV 是它自己的格子），
      // 其余语义给「这类体块的缺省外观」（Script_FirstLevelFrontBreakables 退路用）。
      for (const semantic of ["plaster", "cover", "structure", "roof", "earthDark", "canvas", "step", "coping", "void"]) {
        const look = this.looks.LookOf({ id: "", semantic });
        if (!look) continue;
        this.materials.get(semantic)?.dispose();
        this.materials.set(semantic, this.looks.Material(look));
      }
      for (const key of Object.keys(WHITEBOX_RAILWAY_LOOKS)) {
        this.materials.get(key)?.dispose();
        this.materials.set(key, this.looks.RailwayMaterial(key));
      }
    }
    const hasRailways = !!(this.layout.railway || this.layout.ways?.railways?.length);
    if (hasRailways && typeof document !== "undefined") {
      this.railTrackKit = await PrepareWhiteboxRailwayAssets({
        library: this.library,
        materials: this.materials,
        sharedMaterials: this.sharedFortificationMaterials,
      });
    }
    if (this.layout.ground?.terrainLayers && this.layout.SampleGroundSurface && typeof document !== "undefined") {
      // Splat-weighted texture-array terrain (docs/Data_TerrainLayers.md). A failed
      // download falls back to the single tiled soil below; the level still builds.
      try {
        const { LoadTerrainLayers, CreateTerrainMaterial, CRATER_SCORCHED_LAYER } = await import("./Script_TerrainMaterial.mjs");
        const trench = !!this.TrenchPlan();
        const staticCraters = !!this.layout.SampleCraterSurface;
        const VersionedLayer = layer => Object.fromEntries(Object.entries(layer)
          .map(([key,url]) => [key, `${url}?v=${TRENCH_SURFACE.version}`]));
        const terrainSet = this.layout.ground.terrainLayers;
        const looseLayerId = TERRAIN_SETS[terrainSet]?.trenchLooseLayer;
        const looseLayer = looseLayerId && TerrainLayerUrls(terrainSet).find(layer => layer.id === looseLayerId);
        this.terrainLayers = await LoadTerrainLayers(terrainSet,
          { anisotropy: this.library.anisotropy, extraLayers: [
              ...(trench ? [VersionedLayer(TRENCH_SURFACE.stoneLayer), looseLayer || VersionedLayer(TRENCH_SURFACE.looseLayer)] : []),
              CRATER_SCORCHED_LAYER,
            ],
            layerOverrides: trench && terrainSet === "MissionPlain"
              ? { 3: VersionedLayer(TRENCH_SURFACE.mudLayer) } : {} });
        if (trench) {
          this.trenchSurface = await LoadTrenchSurface();
          this.terrainContact = new TerrainContactField(this.terrain);
          this.materials.set("TrenchStone", CreateTerrainMaterial(this.library, this.terrainLayers,
            { quality: this.quality, name: "TrenchStone", surface: MakeTrenchSurfacePatch(this.terrainLayers,
              this.quality, this.trenchSurface, this.terrainContact, { stone: true }) }));
          this.materials.get("TrenchStone").userData.terrainBlendReceiver=true;
          this.materials.set("TrenchDryGrass", CloneShadedMaterial(this.library.Plain("TrenchDryGrass",
            { color: TRENCH_SURFACE.grass.color, roughness: TRENCH_SURFACE.grass.roughness, side: THREE.DoubleSide })));
          const grassMaterial=this.materials.get("TrenchDryGrass");
          grassMaterial.map=this.trenchSurface.rootMap;grassMaterial.alphaTest=TRENCH_SURFACE.grass.alphaTest;
          grassMaterial.needsUpdate=true;
        }
        const semantic = this.layout.ground.semantic;
        this.materials.get(semantic)?.dispose();
        this.materials.set(semantic, CreateTerrainMaterial(this.library, this.terrainLayers,
          { quality: this.quality, name: "FirstLevelMissionTerrainLayers", reflections: trench, staticCraters,
            surface: trench ? MakeTrenchSurfacePatch(this.terrainLayers, this.quality, this.trenchSurface, this.terrainContact, { staticCraters }) : null }));
        if(trench)this.materials.get(semantic).userData.terrainBlendSource=true;
        const scratch = [0, 0, 0];
        // 地面脚印与痕迹（docs/Data_TerrainTrails.md）：脚离地多高按**地形**算（楼板、踏板、车上不算，不出印）。
        const { TerrainTrailSystem } = await import("./Script_TerrainTrails.mjs");
        this.trailSystem = TerrainTrailSystem;
        TerrainTrailSystem.AttachGround(this, (x, z) => this.TerrainHeight(x, z));
        this.SampleGroundSurface = this.layout.SampleGroundSurface;
        this.SampleCraterSurface = this.layout.SampleCraterSurface || null;
        this.SampleGroundColor = (x, z, out) => this.layout.SampleGroundSurface(x, z, out, scratch);
      } catch (error) {
        console.warn("[FirstLevelWhiteboxField] terrain layers unavailable, using tiled soil", error);
        this.terrainLayers?.albedo.dispose(); this.terrainLayers?.surface.dispose();
        this.trenchSurface?.Dispose(); this.trenchSurface = null;
        this.terrainContact?.Dispose(); this.terrainContact = null;
        this.terrainLayers = null;
      }
    }
    if (this.layout.ground?.pbr && !this.terrainLayers) {
      const { CloneShadedMaterial } = await import("./Script_Materials.mjs");
      const semantic = this.layout.ground.semantic;
      this.materials.get(semantic)?.dispose();
      const material = CloneShadedMaterial(this.library.Get(this.layout.ground.pbr, this.layout.ground.pbrOptions));
      material.name = "FirstLevelMissionSoil";
      this.materials.set(semantic, material);
    }
    if(this.layout.fortifications)this.fortificationModels=await LoadMissionFortifications(this.library);
    if(this.layout.fortifications)this.breakableTrees=await BreakableTrees.Load(this);
    // 道具换模型 + 植被图集（docs/Data_FirstLevelVegetationProps.md）。
    if(this.layout.fortifications)[this.propDressing,this.vegetationAtlas]=await Promise.all([LoadFirstLevelPropDressing(this.library),LoadFirstLevelVegetationAtlas(this.library)]);
    // 正式场景的道具（场景里资产是 Prop/* 的物件，docs/Data_Scene.md §8）：只下场景用到的那几件。
    if(this.layout.sceneProps?.length&&this.library&&typeof document!=="undefined")
      this.scenePropModels=await LoadFirstLevelPropDressing(this.library,{ids:this.layout.sceneProps.map(entry=>entry.asset)});
    // 正式场景也长现行第一关的枯草丛（按场景的路与沟撒，Data_FirstLevelVegetation.SceneDressingContext）
    if(this.layout.style==="formal"&&this.layout.proceduralDressing!==false&&!this.vegetationAtlas&&this.library&&typeof document!=="undefined")
      this.vegetationAtlas=await LoadFirstLevelVegetationAtlas(this.library);
  }

  BuildWhiteBoxes() {
    const sink = new BuildSink();
    sink.SetSector("FirstLevelWhitebox");
    const ground = this.layout.ground;
      if (this.terrain) {
      for (const chunk of this.terrain.Chunks()) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(chunk.positions, 3));
        geometry.setAttribute("normal", new THREE.BufferAttribute(chunk.normals, 3));
        geometry.setAttribute("uv", new THREE.BufferAttribute(chunk.uvs, 2));
        geometry.setIndex(chunk.indices instanceof Uint32Array || chunk.indices instanceof Uint16Array
          ? new THREE.BufferAttribute(chunk.indices, 1) : chunk.indices);
        sink.SetSector(`P012Terrain_${chunk.id}`);
        sink.Add(ground.semantic || "Whitebox", geometry);
        this.stats.groundTris += chunk.indices.length / 3;
      }
    } else {
      sink.Add(ground.semantic || "Whitebox", PlaceGeometry(MakeBox(ground.w, ground.h, ground.d, 1,
        "FirstLevelWhiteboxGround"), { x: ground.x, y: ground.y, z: ground.z }));
      this.stats.groundTris = 12;
    }
    // Keep the physical soil separate from structural boxes so the shared crater
    // adapter can replace its surface without touching walls or elevated floors.
    const SrgbToLinear = (c) => (c <= 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4));
    for (const mesh of sink.Flush(this.scene, { Get: (key) => this.materials.get(key) || this.whiteMaterial })) {
      mesh.name = "FirstLevelWhitebox_Ground"; mesh.userData.deformableTerrain = true;
      if (this.SampleGroundSurface) {
        // One corridor walk per vertex yields the layered tint and the splat weights.
        const positions=mesh.geometry.attributes.position, posArr=positions.array, count=positions.count;
        const colors=new Float32Array(count*3), layers=new Float32Array(count*4), rgb=[0,0,0], weights=[0,0,0,1];
        const sampleCrater=this.SampleCraterSurface;
        const craters=sampleCrater ? new Float32Array(count*4) : null, craterOut=[0,0,0,0];
        const sample=this.SampleGroundSurface;
        for(let i=0,p3=0,l4=0;i<count;i++,p3+=3,l4+=4) {
          const px=posArr[p3], pz=posArr[p3+2];
          weights[3]=1;
          sample(px,pz,rgb,weights);
          const r=rgb[0],g=rgb[1],b=rgb[2];
          colors[p3]=r===1?1:SrgbToLinear(r);
          colors[p3+1]=g===1?1:SrgbToLinear(g);
          colors[p3+2]=b===1?1:SrgbToLinear(b);
          layers[l4]=weights[0]; layers[l4+1]=weights[1]; layers[l4+2]=weights[2]; layers[l4+3]=weights[3];
          if (craters) {
            sampleCrater(px,pz,craterOut);
            craters[l4]=craterOut[0]; craters[l4+1]=craterOut[1]; craters[l4+2]=craterOut[2]; craters[l4+3]=craterOut[3];
          }
        }
        mesh.geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
        // Float32 on purpose: the crater cutter copies every attribute into Float32 arrays.
        // w = rut lateral coordinate (Data_Tuning_Terrain.TERRAIN_RUTS; 1 = no road).
        mesh.geometry.setAttribute('terrainLayers',new THREE.BufferAttribute(layers,4));
        if (craters) mesh.geometry.setAttribute('terrainCrater',new THREE.BufferAttribute(craters,4));
        mesh.material.vertexColors=true; mesh.material.color.setHex(0xffffff);
      } else if (this.layout.SampleGroundColor) {
        const positions=mesh.geometry.attributes.position, posArr=positions.array, count=positions.count;
        const colors=new Float32Array(count*3);
        const sample=this.layout.SampleGroundColor;
        for(let i=0,p3=0;i<count;i++,p3+=3) {
          const s=sample(posArr[p3],posArr[p3+2]);
          colors[p3]=SrgbToLinear(s[0]); colors[p3+1]=SrgbToLinear(s[1]); colors[p3+2]=SrgbToLinear(s[2]);
        }
        mesh.geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
        mesh.material.vertexColors=true; mesh.material.color.setHex(0xffffff);
      }
      this.meshes.push(mesh);
      this.groundMeshes.push(mesh);
      this.stats.groundChunks++;
    }
    sink.SetSector("FirstLevelWhitebox");
    this._InitVehicleTracks(ground);

    let trenchCrownHeightAt = null;
    if (this.TrenchPlan() && this.terrainLayers) {
      const dressing = new BuildSink();
      if (!this.trenchSurface) this.materials.set("TrenchRoots", new THREE.MeshStandardMaterial({
        name: "TrenchRoots", color: TRENCH_APPEARANCE.rootColor,
        roughness: TRENCH_APPEARANCE.rootRoughness, metalness: 0,
      }));
      this.stats.trenchEarth = BuildTrenchEarth(dressing, this.TrenchPlan(),
        (x, z) => this.TerrainHeight(x, z), { roots: this.trenchSurface ? "ground" : "TrenchRoots",
          clods: this.trenchSurface?.clods, cliffs: this.trenchSurface?.cliffs });
      if (this.trenchSurface) this.stats.trenchSurface = BuildTrenchSurface(dressing,
        this.TrenchPlan(), (x, z) => this.TerrainHeight(x, z), this.trenchSurface,
        {onCrownReady: sample => { trenchCrownHeightAt = sample; }});
      const pieces = dressing.Flush(this.scene, { Get: key => this.materials.get(key) });
      this.stats.trenchEarth.meshes = pieces.length;
      for (const mesh of pieces) {
        if (mesh.material === this.materials.get("TrenchStone") || mesh.material === this.materials.get("TrenchDryGrass")) {
          PaintTrenchBatch(mesh, mesh.material === this.materials.get("TrenchDryGrass"));
        }
        if (mesh.material === this.materials.get(ground.semantic)) {
          const count = mesh.geometry.attributes.position.count;
          const colors = new Float32Array(count * 3).fill(1), layers = new Float32Array(count * 4);
          const uv=mesh.geometry.attributes.uv;
          // Keep material flags outside the real road's signed [-1, 1] coordinate.
          // Positive skin UV.x is its exposed-crown fraction: wall height times
          // exposure, or exposure alone on the spoil skirt. [2,3] preserves it.
          for (let i = 0; i < count; i++) {
            layers[i * 4 + 1] = 1;
            layers[i * 4 + 3]=uv.getX(i)<-15?-3:uv.getX(i)<-7
              ?-2-Math.min(.25,Math.max(0,-uv.getY(i)-9)):uv.getX(i)<-5?-1.25
                :2+Math.min(1,Math.max(0,uv.getX(i)));
          }
          mesh.geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
          mesh.geometry.setAttribute("terrainLayers", new THREE.BufferAttribute(layers, 4));
          if (this.SampleCraterSurface) mesh.geometry.setAttribute("terrainCrater", new THREE.BufferAttribute(new Float32Array(count * 4), 4));
        }
        // The crater adapter clips these details together with the original soil.
        // They never survive as a floating crust over a newly excavated crater.
        mesh.userData.deformableTerrain = true;
        mesh.userData.trenchEarth = true;
        // Crater clipping also owns dressing; only physical soil is a texture exception.
        mesh.userData.groundSurface = mesh.material === this.materials.get(ground.semantic);
        this.meshes.push(mesh);
      }
    }

    if (this.layout.craters?.length && this.library?.Get && typeof document !== "undefined") {
      this.staticCraterDebris = BuildStaticCraterDebris(this.layout.craters, (x, z) => this.TerrainHeight(x, z),
        this.scene, this.library, { bounds: this.bounds });
      this.stats.staticCraterDebris = { count: this.staticCraterDebris.count, stones: this.staticCraterDebris.stones, meshes: this.staticCraterDebris.meshes.length };
    }

    const defenses=this.fortificationModels
      ? AddMissionFortifications(sink,this.layout,this.fortificationModels,(x,z)=>this.GroundHeight(x,z),this.materials)
      : {replaced:new Set(),placements:[]};
    this.fortificationPlacements=defenses.placements;
    // 平色道具盒 / 散块 / foliage 盒换成模型、碎砖瓦与植被：只换外观，碰撞与掩体仍由下面的原块登记。
    this.propDressingStats=this.propDressing?AddFirstLevelPropDressing(sink,this.layout,this.propDressing,(x,z)=>this.StaticGroundHeight(x,z),this.materials,this.library,{scene:this.scene,meshes:this.meshes}):null;
    this.vegetation=this.vegetationAtlas?new FirstLevelVegetation(this.scene,this.layout,this.library,this.vegetationAtlas,(x,z)=>this.TerrainHeight(x,z),this.quality,trenchCrownHeightAt):null;
    trenchCrownHeightAt = null;
    for(const id of [...(this.propDressingStats?.replaced||[]),...(this.vegetation?.plan.replaced||[])])defenses.replaced.add(id);
    // 正式场景的道具模型：盒子不画、碰撞照旧由原块登记（同上面的替换表）。
    this.scenePropStats=this.scenePropModels?AddScenePropModels(sink,this.layout,this.scenePropModels,(x,z)=>this.StaticGroundHeight(x,z),this.materials,this.library,{scene:this.scene,meshes:this.meshes}):null;
    for(const id of this.scenePropStats?.replaced||[])defenses.replaced.add(id);
    for(const [key,material] of this.materials)if(key.startsWith("MissionDefenseMaterial_"))this.sharedFortificationMaterials.add(material);
    const trainSink = new BuildSink(),derailSink=new BuildSink(),airWallSink=this.debugAirWalls?new BuildSink():null;
    // 外观合批（Script_FirstLevelWhiteboxLooks）：静态体块按外观分桶，带风化属性自己合并；
    // 碰撞与 cover 仍走 sink。水盒收成一条连续水面。
    const lookBuckets = new Map(), waterBlocks = [], roofBlocks = [];
    const terrainAt = (x, z) => this.TerrainHeight(x, z);
    for (const block of this.layout.blocks) {
      if(block.dynamic || block.treeModel)continue;
      if(block.waterRibbon) {
        const mesh = BuildRibbonWater(block, this.scene);
        if (!this.waterMesh || block.id === "SandRiverSurface") this.waterMesh = mesh;
        this.waterRibbons.push({
          id: block.id,
          surfaceY: block.y + (block.h || 0) / 2,
          strips: block.waterRibbon,
          minX: block.waterRibbon[0]?.[0] ?? 0,
          maxX: block.waterRibbon[block.waterRibbon.length - 1]?.[0] ?? 0,
        });
        this.meshes.push(mesh);
        continue;
      }
      const targetSink = this.layout.terrain === "P012Heightfield" && IsP012TrainBlock(block.id) ? (this.layout.fortifications && block.id.startsWith(`StationCar${this.layout.derailCar}`) ? derailSink : trainSink) : sink;
      if (this.layout.scenario?.replaceBlockIds.includes(block.id)) continue;
      if(airWallSink&&block.tag==="airWall")airWallSink.Add("AirWallDebug",PlaceGeometry(MakeBox(block.w,block.h,block.d,1,block.id),
        {x:block.x,y:block.y,z:block.z,ry:block.ry||0}));
      const seamOwner=block.id.includes("BagSeam")?block.id.split("BagSeam")[0]:null;
      // visual:false —— 只要碰撞，画面由模型负责（例：接收院的空担架摞）。
      const look = this.looks && targetSink === sink ? this.looks.LookOf(block) : null;
      if(block.visual!==false && !defenses.replaced.has(block.id) && !defenses.replaced.has(seamOwner)) {
        if (targetSink === sink && block.semantic === "water" && !block.blockoutWater) {
          waterBlocks.push(block);
          this.waterBodies.push({
            x: block.x, z: block.z, w: block.w, d: block.d,
            c: Math.cos(block.ry || 0), s: Math.sin(block.ry || 0),
            surfaceY: block.y + (block.h || 0) / 2 - 0.04,
          });
        }
        else if (look) {
          if (!lookBuckets.has(look)) lookBuckets.set(look, []);
          lookBuckets.get(look).push(this.looks.BoxGeometry(block, look, terrainAt));
          if (look === "roofTile" && block.semantic === "roof") roofBlocks.push(block);
        } else targetSink.Add(block.semantic || "Whitebox", PlaceGeometry(MakeBox(block.w, block.h, block.d, 1, block.id), {
          x: block.x,
          y: block.y,
          z: block.z,
          ry: block.ry || 0,
        }));
      }
      if (block.solid !== false) {
        targetSink.Solid(block.x, block.y, block.z, block.w * 0.5, block.h * 0.5,
          block.d * 0.5, block.tag, block.ry || 0, WhiteboxSurface(block, this.layout));
        // 2026-10-21：不能攀（白盒 01–05 的胸墙、板桥）跟着碰撞记录走，Script_Player.ProbeVault 认它
        if (block.noClimb === true) targetSink.colliders[targetSink.colliders.length - 1].noClimb = true;
      }
      if (block.cover) {
        for(const point of block.cover.points||[block])
          targetSink.Cover(point.x, point.z, block.h, block.cover.faceX, block.cover.faceZ);
      }
      this.stats.whiteBoxes += 1;
      this.stats.structures += 1;
    }
    // 铁路走共享样条PCG（道砟堤 + 枕木双轨逐点贴地形），断面只在布局的 railway / ways.railways spec 里。
    // 不登记碰撞：道砟顶只高出土面 0.04..0.18 m（高堤已在高度图里），不建隐形墙也不阻塞弹坑/寻路。
    const railwaySpecs = [
      ...(this.layout.railway ? [this.layout.railway] : []),
      ...(this.layout.ways?.railways || []),
    ];
    if (railwaySpecs.length) {
      const railGroundAt = (x, z) => this.TerrainHeight(x, z);
      this._EnsureFallbackRailwayMaterials();
      const sleeperSpots = this.railTrackKit ? [] : null;
      const fishplateSpots = this.railTrackKit ? [] : null;
      let bedChunks = 0, ties = 0, railSegs = 0, joints = 0;
      for (const spec of railwaySpecs) {
        if (!Array.isArray(spec?.points) || spec.points.length < 2) continue;
        const railway = BuildRailwayFromSpec(sink, spec, {
          groundAt: railGroundAt,
          sleeperSpotsOut: sleeperSpots,
          fishplateSpotsOut: fishplateSpots,
          clipBounds: this.bounds,
        });
        bedChunks += railway.bed.chunks;
        ties += railway.track.ties;
        railSegs += railway.track.railSegs;
        joints += railway.track.joints || 0;
      }
      if (this.railTrackKit && (sleeperSpots?.length || fishplateSpots?.length)) {
        BuildInstancedRailTrackKit({
          kit: this.railTrackKit,
          sleeperSpots: sleeperSpots || [],
          fishplateSpots: fishplateSpots || [],
          materials: this.materials,
          fallbackMaterial: this.whiteMaterial,
          scene: this.scene,
          meshesOut: this.meshes,
        });
      }
      this.stats.railway = { bedChunks, ties, railSegs, joints, instancedKit: !!this.railTrackKit };
    }
    // 村内道路与田间小路样条条带（Script_RoadSpline.BuildRoadRibbon）：仅在未启用分层地表贴图混合时铺平色条带，
    // 启用 terrainLayers 时道路直接由 Splat 权重（CartTrack）+ 解析车辙在地面着色器里渲染，避免平色片遮挡地表贴图。
    if (this.layout.ways?.roadRibbons?.length && !this.terrainLayers) {
      const roadPalette = {
        roadGuandao: 0xbeb08e,
        roadVillage: 0xb5a687,
        roadAlley: 0xa59678,
        roadFootpath: 0x968565,
      };
      for (const [key, hex] of Object.entries(roadPalette)) {
        if (!this.materials.has(key)) this.materials.set(key, MakeSemanticMaterial(`FirstLevelWhitebox_${key}`, hex));
      }
      const roadSpecByKind = {
        guandao: { material: "roadGuandao", crown: 0.032, skirtDrop: 0.18, step: 2.5, widthJitter: 0.06 },
        villageStreet: { material: "roadVillage", crown: 0.024, skirtDrop: 0.16, step: 2.2, widthJitter: 0.05 },
        villageAlley: { material: "roadAlley", crown: 0.018, skirtDrop: 0.14, step: 2.0, widthJitter: 0.06 },
        footpath: { material: "roadFootpath", crown: 0.014, skirtDrop: 0.12, step: 2.0, widthJitter: 0.12 },
      };
      let ribbonChunks = 0;
      for (const r of this.layout.ways.roadRibbons) {
        if (!Array.isArray(r.points) || r.points.length < 2) continue;
        const spec = roadSpecByKind[r.kind] || roadSpecByKind.villageStreet;
        const res = BuildRoadRibbon(sink, {
          points: r.points,
          width: r.width || 2.8,
          material: spec.material,
          groundAt: (x, z) => this.TerrainHeight(x, z),
          crown: spec.crown,
          skirtDrop: spec.skirtDrop,
          step: spec.step,
          widthJitter: r.widthJitter ?? spec.widthJitter,
          seed: r.id || "merged_road",
          colliders: null,
        });
        ribbonChunks += res.chunks;
      }
      this.stats.roadRibbonChunks = ribbonChunks;
    }

    for (const mesh of sink.Flush(this.scene, { Get: (key) => this.materials.get(key) || this.whiteMaterial })) {
      if(!mesh.name.includes("MissionDefense_"))mesh.name = "FirstLevelWhitebox_StaticWhiteBoxes";
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.meshes.push(mesh);
    }
    if (this.looks) {
      // 坡顶外壳：台阶 roof 盒上面盖两片斜瓦面 + 脊，只是外观（Data_FirstLevelWhiteboxMaterials.PlanRoofShells）
      const shells = PlanRoofShells(roofBlocks);
      for (const shell of shells) lookBuckets.get("roofTile").push(...this.looks.RoofShellGeometries(shell, terrainAt));
      this.stats.roofShells = shells.length;
      // 名字沿用 StaticWhiteBoxes：Script_FirstLevelFrontBreakables 按这个名字找静态合批塌顶点。
      this.meshes.push(...this.looks.FlushBuckets(lookBuckets, this.scene, "FirstLevelWhitebox_StaticWhiteBoxes"));
      this.stats.looks = { ...this.looks.stats.looks };
      this.stats.lookFallbackSets = this.looks.stats.fallbackSets.slice();
    }
    if (waterBlocks.length) {
      const pondWaterBlocks = [];
      const riverWaterBlocks = [];
      for (const b of waterBlocks) {
        if (/pond/i.test(b.id || "")) pondWaterBlocks.push(b);
        else riverWaterBlocks.push(b);
      }
      const riverWaterMesh = BuildWhiteboxWater(riverWaterBlocks, this.scene, {
        preset: "muddyRiver",
        name: "FirstLevelWhitebox_Water",
        groundAt: terrainAt,
      });
      if (riverWaterMesh) {
        if (!this.waterMesh) this.waterMesh = riverWaterMesh;
        this.meshes.push(riverWaterMesh);
      }
      const pondWaterMesh = BuildWhiteboxWater(pondWaterBlocks, this.scene, {
        preset: "pond",
        name: "FirstLevelWhitebox_Ponds",
        groundAt: terrainAt,
      });
      if (pondWaterMesh) {
        if (!this.waterMesh) this.waterMesh = pondWaterMesh;
        this.meshes.push(pondWaterMesh);
      }
      this.stats.waterBlocks = waterBlocks.length;
    }
    if(airWallSink){
      // 半透明、不写深度、不投影、不进预通道（运动矢量契约：半透明对象 MarkNoPrepass）。只在 ?airWalls=1 时存在。
      const airWallMaterial=MarkNoPrepass(new THREE.MeshBasicMaterial({name:"FirstLevelAirWallDebug",color:0xd8281c,
        transparent:true,opacity:.32,depthWrite:false,side:THREE.DoubleSide}));
      for(const mesh of airWallSink.Flush(this.scene,{Get:()=>airWallMaterial})){
        mesh.name="FirstLevelWhitebox_AirWallDebug";mesh.castShadow=false;mesh.receiveShadow=false;mesh.renderOrder=10;
        this.meshes.push(mesh);
      }
    }
    this.derailMeshes=derailSink.Flush(this.scene,{Get:key=>this.materials.get(key)||this.whiteMaterial});
    this.derailColliders=derailSink.colliders;
    this.trainMeshes = trainSink.Flush(this.scene, { Get: key => this.materials.get(key) || this.whiteMaterial });
    this.trainMeshes.push(...this.derailMeshes);
    // 车厢与相机同行时，Prepass 的默认世界矩阵历史抵消相机速度。
    // MarkDynamicPrepass 仅保留旧诊断标记；新网格不需要这个调用。
    for (const mesh of this.trainMeshes) {
      mesh.name="P012MovingTrain"; mesh.castShadow=true; mesh.receiveShadow=true;
      MarkDynamicPrepass(mesh);
      this.meshes.push(mesh);
    }
    this.trainColliders = [...trainSink.colliders,...this.derailColliders];
    this.colliders = [...sink.colliders, ...this.trainColliders];
    this.covers = sink.covers.slice();
    // 手工 cover 只标了少数沙袋与土墙；村里的院墙、矮墙、垛子要从实体盒派生，
    // 否则两边的兵在这些地方身边都「没有掩体」（Data_Tuning_AiCover.DERIVED_COVER）。
    this.covers.push(...DeriveCoversFromColliders(sink.colliders,{groundAt:(x,z)=>this.TerrainHeight(x,z),existing:this.covers}));
  }

  // Authored kinematic roll of a single carriage. The transient collider is a
  // conservative envelope; at the 90-degree resting pose it exactly matches
  // each transformed plank. Rebuilding is limited to this short impact.
  SetCarDerailment(car,angle,pivot) {
    if(!this.derailMeshes?.length || Math.abs((this.derailRoll||0)-angle)<1e-7)return;
    this.derailRoll=angle;this.derailCar=car;
    const c=Math.cos(angle),s=Math.sin(angle);
    for(const mesh of this.derailMeshes){
      mesh.rotation.z=angle;mesh.position.x=pivot.x-c*pivot.x+s*pivot.y;
      mesh.position.y=pivot.y-s*pivot.x-c*pivot.y;
    }
    this.walkableSurfaces=this.walkableSurfaces.filter(surface=>!surface.id.startsWith(`StationCar${car}`));
    for(const box of this.derailColliders){
      box.derailSource ||= {c:[...box.c],h:[...box.h],offset:this.trainOffsetM};
      const base=box.derailSource,dx=base.c[0]-pivot.x,dy=base.c[1]-pivot.y;
      this._GridRemove(box);this.physics?.RemoveSolid(box._physicsHandle);
      box.c=[pivot.x+c*dx-s*dy,pivot.y+s*dx+c*dy,base.c[2]+this.trainOffsetM-base.offset];
      box.h=[Math.abs(c)*base.h[0]+Math.abs(s)*base.h[1],Math.abs(s)*base.h[0]+Math.abs(c)*base.h[1],base.h[2]];
      box.min=box.c.map((v,i)=>v-box.h[i]);box.max=box.c.map((v,i)=>v+box.h[i]);
      this.physics?.AddSolid(box);this._GridInsert(box);
    }
    this.physics?.RefreshStaticQueries();
  }

  TrainContains(position, offset = this.trainOffsetM) {
    return this.layout.walkableSurfaces?.some(surface => /^StationCar\dFloor$/.test(surface.id)
      && !(this.derailRoll && surface.id===`StationCar${this.derailCar}Floor`)
      && Math.abs(position.x-surface.x)<surface.w/2 && Math.abs(position.z-surface.z-offset)<surface.d/2
      && position.y>=surface.y+surface.h/2-.25 && position.y<surface.y+surface.h/2+3);
  }

  /**
   * 车厢沿 z 平移。玩家坐在车上，所以相机跟着一起走 —— **车厢在屏幕上是不动的**，
   * 速度靶里就必须是 0。普通 Mesh 由 Prepass 默认跟踪上一帧世界矩阵，
   * 不依赖 BuildWhiteBoxes / BuildGates 的兼容标记。统一规范见
   * docs/Data_MotionVectorContract.md，真实道具门禁见 CarriagePropVelocityTest。
   */
  SetTrainOffset(offset) {
    const delta=offset-this.trainOffsetM;if(Math.abs(delta)<1e-9)return;
    this.trainOffsetM=offset;
    for(const mesh of this.trainMeshes)mesh.position.z=offset;
    for(const surface of this.walkableSurfaces)if(IsP012TrainBlock(surface.id))surface.z+=delta;
    const records=[...this.trainColliders];
    for(const gate of this.gates.values())if(IsTrainGate(gate.spec)){
      gate.mesh.position.z+=delta;if(!gate.open)records.push(gate.collider);
    }
    // Move only the train records inside the spatial hash: rebuilding the whole grid
    // (4.6k boxes) every frame of the 390 m ride was a steady CPU and garbage cost.
    for(const record of records){
      this._GridRemove(record);
      record.c[2]+=delta;record.min[2]+=delta;record.max[2]+=delta;this.physics?.MoveSolid(record);
      this._GridInsert(record);
    }
    this.physics?.RefreshStaticQueries();
  }
  _GridCells(box,fn){
    const size=this.gridSize;
    const x0=Math.floor(box.min[0]/size),x1=Math.floor(box.max[0]/size),z0=Math.floor(box.min[2]/size),z1=Math.floor(box.max[2]/size);
    for(let x=x0;x<=x1;x+=1)for(let z=z0;z<=z1;z+=1)fn(x*100003+z);
  }
  _GridRemove(box){
    this._GridCells(box,(key)=>{const list=this.grid.get(key);if(!list)return;const i=list.indexOf(box);if(i>=0)list.splice(i,1);});
  }
  _GridInsert(box){
    this._GridCells(box,(key)=>{let list=this.grid.get(key);if(!list){list=[];this.grid.set(key,list);}list.push(box);});
  }

  BuildGates() {
    let airWallGateMat = null;
    for (const spec of this.layout.gates) {
      const hidden = spec.visual === false;
      const debugAir = hidden && this.debugAirWalls && spec.tag === "airWall";
      let mesh = null, material = null;
      if (!hidden || debugAir) {
        if (debugAir) {
          airWallGateMat ??= MarkNoPrepass(new THREE.MeshBasicMaterial({
            name: "FirstLevelAirWallDebugGate", color: 0xe64a19,
            transparent: true, opacity: 0.34, depthWrite: false, side: THREE.DoubleSide,
          }));
          material = airWallGateMat;
          mesh = new THREE.Mesh(MakeBox(spec.w, spec.h, spec.d, 1, spec.id), material);
          mesh.castShadow = false;
          mesh.receiveShadow = false;
          mesh.renderOrder = 10;
        } else {
          // 外观表管得到的门/桥件共用外观材质（位姿在 mesh 上，几何留局部系）。
          const look = this.looks && !IsTrainGate(spec) ? this.looks.LookOf(spec) : null;
          material = look ? this.looks.Material(look)
            : this.layout.semanticColors?.[spec.semantic]
            ? MakeSemanticMaterial(`FirstLevelWhitebox_${spec.semantic}_${spec.id}`,
              this.layout.semanticColors[spec.semantic])
            : MakeWhiteMaterial(`FirstLevelWhitebox_${spec.id}`);
          const geometry = look ? this.looks.BoxGeometry(spec, look, (x, z) => this.TerrainHeight(x, z), { place: false })
            : MakeBox(spec.w, spec.h, spec.d, 1, spec.id);
          mesh = new THREE.Mesh(geometry, material);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          // 车门跟着车厢一起平移，速度靶的账与车厢体块同一本（见 BuildWhiteBoxes）。
          if (IsTrainGate(spec)) MarkDynamicPrepass(mesh);
        }
        mesh.position.set(spec.x, spec.y, spec.z);
        mesh.rotation.y = spec.ry || 0;
        mesh.name = `FirstLevelWhitebox_${spec.id}`;
        this.scene.add(mesh);
        this.meshes.push(mesh);
      }
      const collider = ColliderRecord(spec);
      const open = !!spec.appearSignal;
      if (open) { if (mesh) mesh.visible = false; }
      else this.colliders.push(collider);
      this.gates.set(spec.id, { spec, mesh, material, collider, open });
      this.stats.dynamicGates += 1;
      if (!hidden) {
        this.stats.whiteBoxes += 1;
        this.stats.structures += 1;
      }
    }
  }

  /**
   * 建可被 Timeline 动态绑定的场景物件（Scene_*.json 写了 bindId）：
   * 跳过 BuildSink 静态合批，独立挂入 scene 并登记进 this.bindables，遵守 MotionVector 动态速度契约。
   */
  BuildBindables() {
    for (const spec of this.layout.bindables || []) {
      const bindId = spec.bindId || spec.id;
      const hidden = spec.visual === false;
      let mesh = null, material = null;
      if (!hidden) {
        const look = this.looks ? this.looks.LookOf(spec) : null;
        material = look ? this.looks.Material(look)
          : this.layout.semanticColors?.[spec.semantic]
            ? MakeSemanticMaterial(`FirstLevelWhitebox_Bind_${spec.semantic}_${spec.id}`, this.layout.semanticColors[spec.semantic])
            : MakeWhiteMaterial(`FirstLevelWhitebox_Bind_${spec.id}`);
        const geometry = look ? this.looks.BoxGeometry(spec, look, (x, z) => this.TerrainHeight(x, z), { place: false })
          : MakeBox(spec.w, spec.h, spec.d, 1, spec.id);
        mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        MarkDynamicPrepass(mesh);
        mesh.position.set(spec.x, spec.y, spec.z);
        mesh.rotation.set(0, spec.ry || 0, 0);
        mesh.name = `FirstLevelWhitebox_Bindable_${bindId}`;
        this.scene.add(mesh);
        this.meshes.push(mesh);
      }
      const collider = spec.solid !== false ? ColliderRecord(spec) : null;
      if (collider) this.colliders.push(collider);
      const entry = {
        id: spec.id,
        bindId,
        spec,
        mesh,
        material,
        collider,
        basePos: { x: spec.x, y: spec.y, z: spec.z },
        baseRy: spec.ry || 0,
        visible: !hidden,
        solidActive: !!collider,
      };
      this.bindables.set(bindId, entry);
      this.stats.bindables += 1;
    }
  }

  GetBindable(bindId) {
    return this.bindables.get(bindId) || null;
  }

  SetBindableTransform(bindId, pose = {}) {
    const entry = this.bindables.get(bindId);
    if (!entry) return false;
    const x = Number.isFinite(pose.x) ? pose.x : entry.basePos.x;
    const y = Number.isFinite(pose.y) ? pose.y : entry.basePos.y;
    const z = Number.isFinite(pose.z) ? pose.z : entry.basePos.z;
    const rx = Number.isFinite(pose.rx) ? pose.rx : 0;
    const ry = Number.isFinite(pose.ry) ? pose.ry : entry.baseRy;
    const rz = Number.isFinite(pose.rz) ? pose.rz : 0;
    const sx = Number.isFinite(pose.sx) ? pose.sx : 1;
    const sy = Number.isFinite(pose.sy) ? pose.sy : 1;
    const sz = Number.isFinite(pose.sz) ? pose.sz : 1;
    if (entry.mesh) {
      entry.mesh.position.set(x, y, z);
      entry.mesh.rotation.set(rx, ry, rz);
      entry.mesh.scale.set(sx, sy, sz);
      if (pose.visible !== undefined) entry.mesh.visible = !!pose.visible;
    }
    if (entry.collider && entry.solidActive) {
      const c = entry.collider;
      const hx = (entry.spec.w * 0.5) * Math.abs(sx);
      const hy = (entry.spec.h * 0.5) * Math.abs(sy);
      const hz = (entry.spec.d * 0.5) * Math.abs(sz);
      const cos = Math.abs(Math.cos(ry)), sin = Math.abs(Math.sin(ry));
      const ex = hx * cos + hz * sin, ez = hx * sin + hz * cos;
      this._GridRemove(c);
      c.c[0] = x; c.c[1] = y; c.c[2] = z;
      c.h[0] = hx; c.h[1] = hy; c.h[2] = hz;
      c.ry = ry; c.cos = Math.cos(ry); c.sin = Math.sin(ry);
      c.min[0] = x - ex; c.min[1] = y - hy; c.min[2] = z - ez;
      c.max[0] = x + ex; c.max[1] = y + hy; c.max[2] = z + ez;
      this.physics?.MoveSolid?.(c);
      this._GridInsert(c);
      this.physics?.RefreshStaticQueries?.();
    }
    return true;
  }

  SetBindableVisible(bindId, visible) {
    const entry = this.bindables.get(bindId);
    if (!entry) return false;
    entry.visible = !!visible;
    if (entry.mesh) entry.mesh.visible = entry.visible;
    return true;
  }

  ResetBindable(bindId) {
    const entry = this.bindables.get(bindId);
    if (!entry) return false;
    return this.SetBindableTransform(bindId, {
      x: entry.basePos.x, y: entry.basePos.y, z: entry.basePos.z,
      rx: 0, ry: entry.baseRy, rz: 0, sx: 1, sy: 1, sz: 1,
      visible: entry.spec.visual !== false,
    });
  }

  *BuildSteps() {
    yield { label: T("p012.whitebox.build.ground"), progress: 0.24 };
    this.BuildWhiteBoxes();
    // 室内天光遮蔽（Script_InteriorSkyOcclusion）：屋子与门窗口子按本关布局现算，别的布局返回空表。
    SetInteriorVolumes(BuildInteriorVolumes(this.layout, (x, z) => this.TerrainHeight(x, z)));
    yield { label: T("p012.whitebox.build.blocks"), progress: 0.62 };
    this.BuildGates();
    this.BuildBindables();
    this.SetScenarioState(this.layout.scenario?.states[0]);
    this.BuildScenarioWarm();
    this.BuildLegend();
    this.BuildSupplyLabels();
    for(const tree of this.breakableTrees?.trees || [])this.colliders.push(tree.stump,tree.trunk);
    yield { label: T("p012.whitebox.build.collision"), progress: 0.88 };
    this.BuildCollisionGrid();
    yield { label: T("p012.whitebox.build.ready"), progress: 1 };
  }

  /**
   * 正式第一章的事实直接驱动可见空间变化。不存在“走到说明牌，文字说门开了”：
   * 信号真发生 → 白门升起 → 碰撞真移除 → 队伍从院里走出来。
   */
  SyncScenario({ signalled = null, restore = false } = {}) {
    if (typeof signalled !== "function") return 0;
    let opened = 0;
    for (const [id, gate] of this.gates) {
      const absent=!!gate.spec.appearSignal&&!signalled(gate.spec.appearSignal);
      const open=absent||signalled(gate.spec.signal);
      if (!gate.open && open && this.OpenGate(id)) opened += 1;
      else if ((restore||gate.spec.appearSignal) && gate.open && !open && this.CloseGate(id)) opened += 1;
    }
    const states = this.layout.scenario?.states;
    if (states && this.SetScenarioState([...states].reverse().find(state => !state.signal || signalled(state.signal)))) opened += 1;
    return opened;
  }

  /** Checkpoint replay is explicit so legacy callers retain one-way gate semantics. */
  RestoreScenario(options = {}) { return this.SyncScenario({ ...options, signalled: options.signalled || (() => false), restore: true }); }

  SetScenarioState(state) {
    if (!state || this.scenarioState === state.id) return false;
    for (const collider of this.scenarioColliders) {
      if (this.physics && collider._physicsHandle != null) this.physics.RemoveSolid(collider._physicsHandle);
      const index = this.colliders.indexOf(collider);
      if (index >= 0) this.colliders.splice(index, 1);
    }
    for (const mesh of this.scenarioMeshes) {
      this.scene.remove(mesh); mesh.geometry.dispose();
      const index = this.meshes.indexOf(mesh);
      if (index >= 0) this.meshes.splice(index, 1);
    }
    const sink = new BuildSink();
    sink.SetSector("FirstLevelWhiteboxScenario");
    const lookBuckets = new Map();
    for (const block of state.blocks) {
      const look = this.ScenarioLook(block, state.id);
      if (look) {
        if (!lookBuckets.has(look)) lookBuckets.set(look, []);
        lookBuckets.get(look).push(this.looks.BoxGeometry(block, look, (x, z) => this.TerrainHeight(x, z)));
      } else sink.Add(block.semantic, PlaceGeometry(MakeBox(block.w, block.h, block.d, 1, block.id), block));
      if (block.solid !== false) sink.Solid(block.x, block.y, block.z, block.w / 2, block.h / 2, block.d / 2, block.tag, block.ry || 0,
        WhiteboxSurface(block, this.layout));
      // Scenario covers (the 02 mouth spoil) join the AI cover table like static blocks do.
      if (block.cover) for (const point of block.cover.points || [block]) sink.Cover(point.x, point.z, block.h, block.cover.faceX, block.cover.faceZ);
    }
    // A new array only when the scenario covers really change: the AI rebuilds its cover registry
    // (and drops its validation cache) whenever the reference changes (Script_Ai.UpdateFront).
    const was = this.scenarioCovers || [], Key = (c) => `${c.x},${c.z},${c.height},${c.faceX},${c.faceZ}`;
    if (was.length !== sink.covers.length || was.some((cover, i) => Key(cover) !== Key(sink.covers[i]))) {
      this.covers = [...(this.covers || []).filter((cover) => !was.includes(cover)), ...sink.covers];
      this.scenarioCovers = sink.covers.slice();
    }
    if (lookBuckets.has("roofTile")) for (const shell of PlanRoofShells(state.blocks))
      lookBuckets.get("roofTile").push(...this.looks.RoofShellGeometries(shell, (x, z) => this.TerrainHeight(x, z)));
    this.scenarioMeshes = sink.Flush(this.scene, { Get: key => this.ScenarioMaterial(key, state.id) });
    if (lookBuckets.size) this.scenarioMeshes.push(...this.looks.FlushBuckets(lookBuckets, this.scene, `FirstLevelWhitebox_Hub_${state.id}`));
    for (const mesh of this.scenarioMeshes) { mesh.name = `FirstLevelWhitebox_Hub_${state.id}`; mesh.castShadow = true; mesh.receiveShadow = true; this.meshes.push(mesh); }
    this.scenarioColliders = sink.colliders;
    for (const collider of this.scenarioColliders) { this.colliders.push(collider); if (this.physics) this.physics.AddSolid(collider); }
    this.scenarioState = state.id;
    this.BuildCollisionGrid();
    return true;
  }

  /**
   * 前沿可破坏块（Script_FirstLevelFrontBreakables）的一段：按被接管那块的外观取材质与带风化属性的
   * 局部系几何（位姿由调用方设在 mesh 上）。没有外观表（归档夹具 / Node）时返回 null，调用方走老路。
   * @param {{id:string, semantic?:string}} block 被接管的体块（或只有 id/semantic 的描述）
   * @param {{x,y,z,w,h,d,ry}} box 这一段的外廓（世界系中心）
   */
  WhiteboxPiece(block, box) {
    const look = this.looks?.LookOf(block);
    if (!look) return null;
    return {
      material: this.looks.Material(look),
      geometry: this.looks.BoxGeometry({ ...box, id: block.id }, look, (x, z) => this.TerrainHeight(x, z), { place: false }),
    };
  }

  /**
   * 关尾北门夜景（NightGate）的 scenario 体块走外观表，与静态体块同一套材质；
   * 掩蔽部两态归开场布景（B5，下面 ScenarioMaterial 的风化旧木 / 土坯），不接外观。
   */
  ScenarioLook(block, stateId) {
    if (!this.looks || stateId !== "NightGate") return null;
    return this.looks.LookOf(block);
  }

  ScenarioMaterial(key, stateId) {
    if(key==="OpeningEarth")return this.library.Get("Adobe",{color:0x777064,repeat:2});
    // 3A 迭代 B5（2026-09-28）：掩蔽部两态的木料（洞顶、南护壁、门柱、门楣）与开场布景同一份风化旧木
    // （Data_OpeningSet0103.SET_MATERIALS.timber，第一关按需贴图集）；没下到就还是下面原来的程序化木梁。
    const weathered=OPENING_SET_MATERIALS.timber;
    if(stateId!=="NightGate"&&this.library.baked?.has?.(weathered.recipe)&&(key==="OpeningWood"||(this.layout.legend===false&&key==="timber")))
      return this.library.Get(weathered.recipe,weathered.options);
    if(key==="OpeningWood")return this.library.Get("WoodBeam",{color:0x706351,repeat:2});
    if(this.layout.legend===false&&stateId!=="NightGate"&&key==="timber")return this.library.Get("WoodBeam",{color:0x766957,repeat:2});
    if(this.layout.legend===false&&stateId!=="NightGate"&&key==="earthDark")return this.library.Get("Adobe",{color:0x777064,repeat:2});
    return this.materials.get(key) || this.whiteMaterial;
  }

  /**
   * 后面几态（01 洞口塌方、关尾北门夜景）要用的材质先各挂一粒藏起来的小盒子。
   * 这些材质（repeat 2 的土坯 / 木梁）克隆了自己的贴图，第一次出画才上传 GPU：
   * 2026-09-27 实测 01 近爆那一帧 texSubImage2D 占 39 ms。藏着的网格由关卡预热
   * （Script_Main.WarmLevel 的强制出画）画一帧，上传就留在加载画面后面了。
   */
  BuildScenarioWarm() {
    const states = this.layout.scenario?.states;
    if (!states || typeof document === "undefined") return;
    const seen = new Set(this.scenarioMeshes.flatMap(mesh => Array.isArray(mesh.material) ? mesh.material : [mesh.material]));
    const geometry = new THREE.BoxGeometry(0.01, 0.01, 0.01);
    for (const state of states) for (const block of state.blocks) {
      const look = this.ScenarioLook(block, state.id);
      const material = look ? this.looks.Material(look) : this.ScenarioMaterial(block.semantic, state.id);
      if (!material || seen.has(material)) continue;
      seen.add(material);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `FirstLevelWhitebox_ScenarioWarm_${state.id}_${block.semantic}`;
      mesh.visible = false;
      mesh.position.set(block.x, block.y, block.z);
      this.scene.add(mesh); this.meshes.push(mesh);
    }
  }

  BuildSupplyLabels() {
    if(this.layout.terrain!=="P012Heightfield"||typeof document==="undefined")return;
    this.labelTextures=[];
    const labels=this.layout.blocks.flatMap(block=>{
      const gun=block.id==="WeaponCheckTable";
      const ammo=block.id==="WeaponIssueCrate";
      return gun||ammo?[{...block,label:gun?T("p012.whitebox.label.weapon"):T("p012.whitebox.label.ammo"),color:gun?"#f0cf79":"#a4dfd0"}]:[];
    });
    const bank=this.layout.blocks.find(block=>block.id==="NorthNearMissDitchBank");
    if(bank)labels.push({...bank,id:"NorthShelter",x:bank.x+2.8,z:bank.z,label:T("p012.whitebox.label.shelter"),color:"#a5dfff",shelter:true});
    for(const spec of labels){
      const canvas=document.createElement("canvas");canvas.width=512;canvas.height=160;
      const ctx=canvas.getContext("2d");ctx.fillStyle="#182326";ctx.fillRect(0,0,512,160);
      ctx.strokeStyle=spec.color;ctx.lineWidth=10;ctx.strokeRect(5,5,502,150);
      ctx.fillStyle=spec.color;ctx.font="bold 68px sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(spec.label,256,82);
      const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;this.labelTextures.push(texture);
      const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:true}));
      sprite.name=(spec.shelter?"P012ShelterLabel_":"P012SupplyLabel_")+spec.id;sprite.position.set(spec.x,spec.y+spec.h/2+.7,spec.z);sprite.scale.set(spec.shelter?3.6:2.4,.75,1);
      this.scene.add(sprite);this.meshes.push(sprite);
    }
  }

  BuildLegend() {
    // 图例是归档教学白盒（p012-archive）的东西。正式第一关 2026.09.19 起也有
    // scenario（掩蔽部两态 + 关尾夜景片），但它不该在正片里挂一块色标面板 ——
    // 布局显式写 `legend:false` 就不建。
    if (!this.layout.scenario || this.layout.legend === false
      || typeof document === "undefined" || this.legend) return;
    const legend = document.createElement("details");
    legend.id = "firstLevelP012Legend";
    legend.open = typeof window === "undefined" || window.innerWidth >= 640;
    // Tutorial objectives must remain readable during long posture/movement
    // drills. Scope to this disposable P012 node; legacy HUD keeps its fade.
    const objectiveStyle = document.createElement("style");
    objectiveStyle.textContent = `body:has(#firstLevelP012Legend) .hudObjective {
      opacity:1 !important; animation:none !important; background:#151a20;
      padding:8px 10px; border:1px solid #76808b; border-radius:5px;
    }
    body:has(#firstLevelP012Legend) .hudObjective .o {
      color:#fff; -webkit-text-stroke:0; text-shadow:none; font-size:16px; line-height:1.35;
    }
    body:has(#firstLevelP012Legend) .hudObjective .objectiveUpdate { display:none; }
    @media(max-width:639px) {
      body:has(#firstLevelP012Legend) .hudTop { width:calc(100vw - 120px); }
      body:has(#firstLevelP012Legend) .hudObjective .o { font-size:13px; }
      #firstLevelP012Legend { top:14px !important; max-width:190px !important; }
    }`;
    legend.appendChild(objectiveStyle);
    legend.style.cssText = "position:fixed;right:12px;top:76px;z-index:25;max-width:220px;padding:8px 10px;background:#151a20df;color:#fff;border:1px solid #76808b;border-radius:5px;font:12px/1.55 sans-serif;pointer-events:auto;";
    const title = document.createElement("summary"); title.textContent = T("p012.whitebox.legend.title"); title.style.cursor = "pointer"; legend.appendChild(title);
    const direction = document.createElement("div"); direction.textContent = T("p012.whitebox.legend.direction"); direction.style.cssText = "font-size:11px;color:#c6d2df;margin:5px 0"; legend.appendChild(direction);
    const coordinates = document.createElement("details");
    const coordinateTitle = document.createElement("summary"); coordinateTitle.textContent = T("p012.whitebox.legend.coordinates"); coordinates.appendChild(coordinateTitle);
    coordinates.appendChild(document.createTextNode(T("p012.whitebox.legend.coordinatesBody")));
    coordinates.style.cssText = "font-size:10px;color:#b7c3d0;margin:3px 0"; legend.appendChild(coordinates);
    // 色标一行一个语义：语义名是稳定 id，写在屏幕上的那半句在文本表里。
    const labels = {ground:"p012.whitebox.legend.ground",structure:"p012.whitebox.legend.structure",
      step:"p012.whitebox.legend.step",vault:"p012.whitebox.legend.vault",mantle:"p012.whitebox.legend.mantle",
      cover:"p012.whitebox.legend.cover",boundary:"p012.whitebox.legend.boundary",danger:"p012.whitebox.legend.danger",
      missionRoute:"p012.whitebox.legend.missionRoute",stretcherRoute:"p012.whitebox.legend.stretcherRoute"};
    for (const [semantic, key] of Object.entries(labels)) {
      if(this.layout.semanticColors[semantic]===undefined)continue;
      const row = document.createElement("div"); row.style.cssText = "display:inline-flex;align-items:center;gap:5px;width:50%;white-space:nowrap";
      const chip = document.createElement("span"); chip.style.cssText = `display:inline-block;width:10px;height:10px;border:1px solid #aaa;background:#${this.layout.semanticColors[semantic].toString(16).padStart(6,"0")}`;
      row.appendChild(chip); row.appendChild(document.createTextNode(T(key))); legend.appendChild(row);
    }
    document.body.appendChild(legend); this.legend = legend;
  }

  // Freight side panels slide along the wagon. The collision record follows
  // the visible panel every frame, including when only partly open.
  SetGateProgress(id, progress) {
    const gate=this.gates.get(id);if(!gate)return;
    const value=Math.max(0,Math.min(1,progress));
    if(gate.progress===value)return;
    gate.progress=value;
    const handle=gate.collider?._physicsHandle;
    if(this.physics&&handle!=null)this.physics.RemoveSolid(handle);
    const index=this.colliders.indexOf(gate.collider);if(index>=0)this.colliders.splice(index,1);
    gate.mesh.visible=true;gate.mesh.position.set(gate.spec.x,gate.spec.y,gate.spec.z+(gate.spec.signal==="P012TrainDoor"?this.trainOffsetM:0)+value*(gate.spec.d+.15));
    gate.open=value===1;
    if(!gate.open){gate.collider=ColliderRecord({...gate.spec,z:gate.mesh.position.z});this.colliders.push(gate.collider);if(this.physics)this.physics.AddSolid(gate.collider);}
    this.BuildCollisionGrid();
  }

  OpenGate(id) {
    const gate = this.gates.get(id);
    if (!gate || gate.open) return false;
    gate.open = true;
    // hideOpenGates：白盒文件场景（LayoutFromSceneDoc）的随信号体块是塌掉 / 炸掉的东西，消失而不是「白门升起」。
    if (gate.mesh) {
      if (this.layout.scenario || this.layout.terrainSpec || this.layout.hideOpenGates) gate.mesh.visible = false;
      else gate.mesh.position.y = gate.spec.y + gate.spec.h + 1.2;
    }
    const handle = gate.collider._physicsHandle;
    if (this.physics && handle !== null && handle !== undefined) this.physics.RemoveSolid(handle);
    const index = this.colliders.indexOf(gate.collider);
    if (index >= 0) this.colliders.splice(index, 1);
    if(gate.spec.walkableId)this.walkableSurfaces=this.walkableSurfaces.filter(surface=>surface.id!==gate.spec.walkableId);
    this.BuildCollisionGrid();
    return true;
  }

  CloseGate(id) {
    const gate = this.gates.get(id);
    if (!gate || !gate.open) return false;
    gate.open = false;
    if (gate.mesh) {
      gate.mesh.visible = true;
      gate.mesh.position.y = gate.spec.y;
      gate.mesh.position.z = gate.spec.z;
    }
    gate.progress = undefined;
    gate.collider = ColliderRecord(gate.spec);
    this.colliders.push(gate.collider);
    if(gate.spec.walkableId&&!this.walkableSurfaces.some(surface=>surface.id===gate.spec.walkableId)){
      const surface=this.layout.blocks.find(block=>block.id===gate.spec.walkableId);if(surface)this.walkableSurfaces.push({...surface});
    }
    if (this.physics) this.physics.AddSolid(gate.collider);
    this.BuildCollisionGrid();
    return true;
  }

  BuildCollisionGrid() {
    this.grid.clear();
    const size = this.gridSize;
    for (const box of this.colliders) {
      const x0 = Math.floor(box.min[0] / size);
      const x1 = Math.floor(box.max[0] / size);
      const z0 = Math.floor(box.min[2] / size);
      const z1 = Math.floor(box.max[2] / size);
      for (let x = x0; x <= x1; x += 1) {
        for (let z = z0; z <= z1; z += 1) {
          const key = x * 100003 + z;
          if (!this.grid.has(key)) this.grid.set(key, []);
          this.grid.get(key).push(box);
        }
      }
    }
  }

  BoxesNear(x, z) {
    return this.grid.get(Math.floor(x / this.gridSize) * 100003
      + Math.floor(z / this.gridSize)) || [];
  }

  StandHeight(x, z, fromY) {
    let height = this.GroundHeight(x, z);
    const ceiling = fromY + 0.6;
    for (const box of this.BoxesNear(x, z)) {
      if (x < box.min[0] || x > box.max[0] || z < box.min[2] || z > box.max[2]) continue;
      const top = box.max[1];
      if (top > ceiling || top <= height) continue;
      height = top;
    }
    return height;
  }

  WaterDepth(x, z, y) {
    let best = 0;
    for (const r of this.waterRibbons) {
      const strips = r.strips;
      const n = strips.length;
      if (n < 2) continue;
      const loX = Math.min(r.minX, r.maxX);
      const hiX = Math.max(r.minX, r.maxX);
      if (x < loX || x > hiX) continue;
      // 站到桥面或高台上不算涉水（与 TengxianField / EditorSplines 口径一致）
      if (Number.isFinite(y) && y > r.surfaceY + 0.12) continue;
      const asc = strips[n - 1][0] >= strips[0][0];
      let lo = 0, hi = n - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (asc ? strips[mid][0] <= x : strips[mid][0] >= x) lo = mid;
        else hi = mid;
      }
      const a = strips[lo], b = strips[hi];
      const dx = b[0] - a[0];
      const t = Math.abs(dx) > 1e-6 ? Clamp((x - a[0]) / dx, 0, 1) : 0;
      const z0 = a[1] + (b[1] - a[1]) * t;
      const z1 = a[2] + (b[2] - a[2]) * t;
      const zMin = Math.min(z0, z1), zMax = Math.max(z0, z1);
      if (z < zMin || z > zMax) continue;
      const floorY = Number.isFinite(y) ? Math.max(y, this.TerrainHeight(x, z)) : this.TerrainHeight(x, z);
      const depth = r.surfaceY - floorY;
      if (depth > best) best = depth;
    }
    for (const b of this.waterBodies) {
      if (Number.isFinite(y) && y > b.surfaceY + 0.12) continue;
      const dx = x - b.x, dz = z - b.z;
      const lx = dx * b.c - dz * b.s;
      const lz = dx * b.s + dz * b.c;
      if (Math.abs(lx) > b.w * 0.5 || Math.abs(lz) > b.d * 0.5) continue;
      const floorY = Number.isFinite(y) ? Math.max(y, this.TerrainHeight(x, z)) : this.TerrainHeight(x, z);
      const depth = b.surfaceY - floorY;
      if (depth > best) best = depth;
    }
    return best;
  }

  NearbyColliders(x, z, radius = 3) {
    const size = this.gridSize;
    const out = [];
    const x0 = Math.floor((x - radius) / size);
    const x1 = Math.floor((x + radius) / size);
    const z0 = Math.floor((z - radius) / size);
    const z1 = Math.floor((z + radius) / size);
    for (let gx = x0; gx <= x1; gx += 1) {
      for (let gz = z0; gz <= z1; gz += 1) {
        const list = this.grid.get(gx * 100003 + gz);
        if (list) for (const box of list) if (!out.includes(box)) out.push(box);
      }
    }
    return out;
  }

  Raycast(origin, direction, maxDist = 200, options = null) {
    if (this.physics) return this.physics.Raycast(origin, direction, maxDist, options);
    return this.RaycastAabb(origin, direction, maxDist, options);
  }

  RaycastAabb(origin, direction, maxDist = 200, options = null) {
    let best = null;
    const steps = Math.ceil(maxDist / this.gridSize) + 1;
    const seen = new Set();
    for (let i = 0; i <= steps; i += 1) {
      const t = (i / steps) * maxDist;
      const px = origin.x + direction.x * t;
      const pz = origin.z + direction.z * t;
      const gx = Math.floor(px / this.gridSize);
      const gz = Math.floor(pz / this.gridSize);
      for (let ox = -1; ox <= 1; ox += 1) {
        for (let oz = -1; oz <= 1; oz += 1) {
          const key = (gx + ox) * 100003 + (gz + oz);
          if (seen.has(key)) continue;
          seen.add(key);
          const list = this.grid.get(key);
          if (!list) continue;
          for (const box of list) {
            if (options?.excludeCollider === box) continue;
            // 空气墙只挡人不挡射线（与 Script_Physics 的 IG_AIR_WALL 同口径）。
            if (box.tag === "airWall") continue;
            const hit = RayAabb(origin, direction, box, maxDist);
            if (hit !== null && (best === null || hit.t < best.t)) best = hit;
          }
        }
      }
      if (best && best.t < t) break;
    }
    return best;
  }

  ClampToBounds(x, z, margin = 8) {
    return {
      x: Clamp(x, this.bounds.minX + margin, this.bounds.maxX - margin),
      z: Clamp(z, this.bounds.minZ + margin, this.bounds.maxZ - margin),
    };
  }

  CheckSightCorridor() {
    return { ok: true, blockers: [], scene: "firstLevelWhitebox", applies: false };
  }

  CheckWallCorridor() {
    return {
      rampCount: 0,
      topReachableSpan: 0,
      topSegments: 0,
      leakSpan: 0,
      leaks: [],
      ok: true,
      scene: "firstLevelWhitebox",
      applies: false,
    };
  }

  DebugState() {
    return {
      material: this.whiteMaterial.type,
      color: this.whiteMaterial.color.getHex(),
      textured: !!this.whiteMaterial.map,
      coloredSemantics: Object.keys(this.layout.semanticColors || {}),
      scenarioState: this.scenarioState,
      scenarioColliders: this.scenarioColliders.length,
      whiteBoxes: this.stats.whiteBoxes,
      blocks: this.layout.blocks.length,
      sections: (this.layout.sections||[]).map((section) => ({ ...section })),
      gates: [...this.gates.entries()].map(([id, gate]) => ({
        id,
        signal: gate.spec.signal,
        open: gate.open,
        colliding: this.colliders.includes(gate.collider),
      })),
      externalAssets: this.fortificationPlacements.length,
      looks: this.stats.looks || null,
      lookFallbackSets: this.stats.lookFallbackSets || null,
      water: this.waterMesh ? this.waterMesh.name : null,
    };
  }

  _EnsureFallbackRailwayMaterials() {
    const defaults = [
      ["railBallast", 0x6b675f, 0.95, 0],
      ["RailBallast", 0x6b675f, 0.95, 0],
      ["railEarth", 0x8d7e64, 0.96, 0],
      ["railSleeperWood", 0x4f3d2d, 0.92, 0],
      ["SleeperWood", 0x4f3d2d, 0.92, 0],
      ["railSleeperEnd", 0x433426, 0.94, 0],
      ["railSteel", 0x4e4741, 0.56, 0.72],
      ["RailSteel", 0x4e4741, 0.56, 0.72],
      ["railHead", 0xbec4c8, 0.24, 0.88],
      ["railFastener", 0x3e3731, 0.68, 0.68],
    ];
    for (const [key, color, roughness, metalness] of defaults) {
      if (this.materials.has(key)) continue;
      const mat = new THREE.MeshStandardMaterial({
        name: `FirstLevelWhitebox_${key}`, color, roughness, metalness,
      });
      mat.userData.firstLevelWhitebox = true;
      mat.userData.whiteboxSemantic = key;
      this.materials.set(key, mat);
    }
  }

  _InitVehicleTracks(ground) {
    if (!this.terrain || !this.groundMeshes.length) return;
    const hasStatic = Array.isArray(this.layout.vehicleTracks) && this.layout.vehicleTracks.length > 0;
    if (!this.terrainLayers && !hasStatic && !this.layout.vehicleTracksEnabled) return;
    const baseHeight = (x, z) => this.TerrainHeight(x, z);
    const mudBox = TERRAIN_MUD_ZONE.box;
    const soilSoft = VEHICLE_TRACK_GEOMETRY.soilSoftness;
    const scratchRgb = [0, 0, 0], scratchWeights = [0, 0, 0, 1];
    const SoftnessAt = this.layout.SampleTrackSoftness
      ? (x, z) => this.layout.SampleTrackSoftness(x, z)
      : this.SampleGroundSurface
        ? (x, z) => {
            scratchWeights[0] = 0; scratchWeights[1] = 0; scratchWeights[2] = 0; scratchWeights[3] = 1;
            this.SampleGroundSurface(x, z, scratchRgb, scratchWeights);
            const wTrack = scratchWeights[0];
            const wSpoil = scratchWeights[1] * (1 - wTrack);
            const wRest = Math.max(0, 1 - wTrack - wSpoil);
            const wStubble = scratchWeights[2] * wRest * 0.5;
            const wSoil = Math.max(0, wRest - wStubble);
            let soft = wSoil * soilSoft[0] + wTrack * soilSoft[1] + wStubble * soilSoft[2] + wSpoil * soilSoft[3];
            if (x >= mudBox[0] && x <= mudBox[2] && z >= mudBox[1] && z <= mudBox[3]) {
              soft *= VEHICLE_TRACK_GEOMETRY.mudZoneMultiplier;
            }
            return soft;
          }
        : () => 1;
    const CanDeform = (x, z) => {
      const gx = (baseHeight(x + 0.5, z) - baseHeight(x - 0.5, z));
      const gz = (baseHeight(x, z + 0.5) - baseHeight(x, z - 0.5));
      return (1 / Math.hypot(gx, 1, gz)) >= VEHICLE_TRACK_GEOMETRY.slopeRange[0];
    };
    this.vehicleTrackField = new VehicleTrackField({
      BaseHeight: baseHeight,
      SoftnessAt,
      CanDeform,
      bounds: this.bounds,
      quality: this.quality,
    });
    const groundMaterial = this.materials.get(ground.semantic || "Whitebox") || this.whiteMaterial;
    this.vehicleTrackView = new VehicleTrackView({
      scene: this.scene,
      field: this.vehicleTrackField,
      groundMeshes: this.groundMeshes,
      groundMaterial,
      sampleGroundSurface: this.SampleGroundSurface,
      sampleGroundColor: this.SampleGroundColor,
      sampleCraterSurface: this.SampleCraterSurface,
    });
    if (!this.trailSystem) {
      this.trailSystem = TerrainTrailSystem;
      TerrainTrailSystem.AttachGround(this, baseHeight);
    }
    TerrainTrailSystem.AttachDisplacement(this, this.vehicleTrackField, this.vehicleTrackView);
    if (hasStatic) {
      this.stats.staticVehicleTracks = TerrainTrailSystem.AddStaticTracks(this.layout.vehicleTracks);
      this.vehicleTrackView.Sync();
    }
  }

  /** 每帧由帧循环在 TerrainTrailSystem.Update 之后调用，把本帧新压出的车辙脏瓦片同步到 GPU。 */
  UpdateVehicleTracks() {
    return this.vehicleTrackView ? this.vehicleTrackView.Sync() : 0;
  }

  /** 采样某处因车辙产生的真几何高度偏移（负值下凹、正值泥棱）。 */
  VehicleTrackOffsetAt(x, z) {
    return this.vehicleTrackField ? this.vehicleTrackField.OffsetAt(x, z) : 0;
  }

  Dispose() {
    SetInteriorVolumes(null);
    this.vehicleTrackView?.Dispose(); this.vehicleTrackView = null;
    this.vehicleTrackField = null;
    this.groundMeshes.length = 0;
    this.trailSystem?.DetachDisplacement(this);
    this.trailSystem?.DetachGround(this); this.trailSystem = null;
    this.breakableTrees?.Dispose(); this.breakableTrees=null;
    this.staticCraterDebris?.Dispose(); this.staticCraterDebris = null;
    this.SampleCraterSurface = null;
    this.vegetation?.Dispose(); this.vegetation=null; this.vegetationAtlas?.dispose(); this.vegetationAtlas=null;
    this.legend?.remove(); this.legend = null;
    for(const texture of this.labelTextures||[])texture.dispose();
    const disposedMaterials = new Set();
    for (const mesh of this.meshes) {
      this.scene.remove(mesh);
      mesh.geometry?.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (material && !disposedMaterials.has(material) && !this.sharedFortificationMaterials.has(material)) {
          material.dispose();
          disposedMaterials.add(material);
        }
      }
    }
    this.meshes.length = 0;
    this.looks?.Dispose(); this.looks = null; this.waterMesh = null;
    this.waterRibbons = []; this.waterBodies = [];
    this.railTrackKit = null;
    this.trenchSurface?.Dispose(); this.trenchSurface = null;
    this.terrainContact?.Dispose(); this.terrainContact = null;
    this.fortificationModels=null;this.fortificationPlacements=[];this.sharedFortificationMaterials.clear();
    if (this.terrainLayers) {
      this.terrainLayers.albedo.dispose(); this.terrainLayers.surface.dispose();
      this.terrainLayers = null; this.SampleGroundSurface = null;
    }
    this.colliders = [];
    this.covers = [];
    this.grid.clear();
    this.gates.clear();
    this.bindables.clear();
    this.scenarioMeshes = []; this.scenarioColliders = []; this.scenarioState = null;
    this.objectives.length = 0;
  }
}

export default FirstLevelWhiteboxField;
