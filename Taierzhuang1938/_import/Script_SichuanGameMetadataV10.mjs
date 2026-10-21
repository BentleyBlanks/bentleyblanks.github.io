// Write V10 delivery metadata only after the exact candidate passes its strict audit.
// Usage: node .../Script_SichuanGameMetadataV10.mjs --project=<candidate Taierzhuang1938> --review=<GameV10 output> [--validation=<JSON>] [--visual=<JSON>]
// Read-only report check: node .../Script_SichuanGameMetadataV10.mjs --audit-geometry=<Data_GameGeometry.json>
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {LoadGlb,ReadAccessor,ReadAccessorInt} from './Script_LugouGlbPose.mjs';

const args=process.argv.slice(2);
const Option=name=>args.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3);
const Require=(condition,message)=>{if(!condition)throw Error(message);};
Require(Option('audit-geometry')||(Option('project')&&Option('review')),'Pass --project=<candidate project> and --review=<GameV10 output directory>, or --audit-geometry=<JSON> for a read-only report audit');
const projectDir=path.resolve(Option('project')??'.');
const reviewDir=path.resolve(Option('review')??'.');
const sourceProjectDir=fileURLToPath(new URL('../',import.meta.url));
const validationFile=path.resolve(Option('validation')??path.join(sourceProjectDir,'../tmp/SichuanBlanketPack/Review/CandidateAudit/Data_Validation.json'));
const modelDir=path.join(projectDir,'Model/SichuanBlanketPack');
const modelFile=path.join(modelDir,'Model_SichuanBlanketPack.glb');
const ReadJson=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const Hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const FileEvidence=file=>{const bytes=fs.readFileSync(file);return {path:path.resolve(file),bytes:bytes.length,sha256:Hash(bytes)};};
const SamePath=(a,b)=>path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const partNames=['Pack_Bundle','Pack_Binding','Pack_Jacket','Pack_StrawMat','Pack_Sandals'];
const Near=(a,b,tolerance=1e-6)=>a.length===b.length&&a.every((value,index)=>Math.abs(value-b[index])<=tolerance);
function Multiply(a,b){const result=Array(16).fill(0);for(let row=0;row<4;row++)for(let col=0;col<4;col++)for(let k=0;k<4;k++)result[col*4+row]+=a[k*4+row]*b[col*4+k];return result;}
function NodeMatrix(node){
  if(node.matrix)return node.matrix;
  const [x,y,z,w]=node.rotation??[0,0,0,1],[sx,sy,sz]=node.scale??[1,1,1],[tx,ty,tz]=node.translation??[0,0,0];
  return [(1-2*(y*y+z*z))*sx,2*(x*y+w*z)*sx,2*(x*z-w*y)*sx,0,2*(x*y-w*z)*sy,(1-2*(x*x+z*z))*sy,2*(y*z+w*x)*sy,0,2*(x*z+w*y)*sz,2*(y*z-w*x)*sz,(1-2*(x*x+y*y))*sz,0,tx,ty,tz,1];
}
function Transform(matrix,point){return [matrix[0]*point[0]+matrix[4]*point[1]+matrix[8]*point[2]+matrix[12],matrix[1]*point[0]+matrix[5]*point[1]+matrix[9]*point[2]+matrix[13],matrix[2]*point[0]+matrix[6]*point[1]+matrix[10]*point[2]+matrix[14]];}
function Bounds(points){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const point of points)for(let axis=0;axis<3;axis++){min[axis]=Math.min(min[axis],point[axis]);max[axis]=Math.max(max[axis],point[axis]);}return {min,max,size:max.map((value,index)=>value-min[index]),center:max.map((value,index)=>(value+min[index])/2)};}

function AuditGeometryReports(geometry){
  const parts=geometry.parts,finite=Number.isFinite;
  Require(parts&&partNames.every(name=>Number.isInteger(parts[name]?.triangles)&&parts[name].triangles>0),'Actual geometry report must contain all five part counts');
  Require(partNames.reduce((sum,name)=>sum+parts[name].triangles,0)===geometry.totalTriangles&&geometry.totalTriangles<=3000,'Geometry report all-parts total exceeds 3000 or disagrees with its parts');
  const clearance=parts.Pack_Binding.gameBundleClearance??null;
  const patchObject=(parts.Pack_Bundle.objects??[]).find(object=>object.relativeLiftConformance);
  const patchFit=patchObject?.relativeLiftConformance??null;
  const mat=parts.Pack_StrawMat,sandals=parts.Pack_Sandals;
  const physicalCaps={bindingOutwardShiftM:.006,patchSourceToGameShiftM:.006,patchRelativeLiftM:.004,patchNeighborSearchRadiusM:.003};
  const checks={};
  if(clearance){
    Require(clearance.generator==='SichuanMainBindingClearanceV10'&&clearance.trianglesUnchanged===true&&clearance.sourceReferencesUnchanged===true,'Binding clearance must retain its actual geometry/source references');
    Require(finite(clearance.hardMaximumOutwardYM)&&clearance.hardMaximumOutwardYM>0&&clearance.hardMaximumOutwardYM<=physicalCaps.bindingOutwardShiftM,'Binding displacement hard cap exceeds the physical 6 mm limit');
    Require(finite(clearance.maxAdditionalOutwardYM)&&clearance.maxAdditionalOutwardYM>=0&&clearance.maxAdditionalOutwardYM<=clearance.hardMaximumOutwardYM+1e-7&&finite(clearance.maxXZChangeM)&&clearance.maxXZChangeM<=1e-7,'Binding clearance reports an abnormal movement or changed X/Z route');
    Require(finite(clearance.clearanceTargetM)&&clearance.clearanceTargetM>0&&clearance.clearanceTargetM<=.002&&finite(clearance.minimumProjectedOutwardGapM)&&finite(clearance.minimumActualBvhDistanceM)&&clearance.minimumProjectedOutwardGapM>=clearance.clearanceTargetM-1e-7&&clearance.minimumActualBvhDistanceM>=clearance.clearanceTargetM-1e-7,'Binding actual projected/BVH gap does not meet its physical target');
    for(const solve of clearance.minimumDisplacementSolves??[])Require(finite(solve.maximumOutwardShiftM)&&finite(solve.hardShiftLimitM)&&solve.hardShiftLimitM<=physicalCaps.bindingOutwardShiftM&&solve.maximumOutwardShiftM<=solve.hardShiftLimitM+1e-7,'Binding solver bypassed its actual displacement hard cap');
    checks.binding={actualMaximumOutwardShiftM:clearance.maxAdditionalOutwardYM,hardCapM:clearance.hardMaximumOutwardYM,minimumProjectedGapM:clearance.minimumProjectedOutwardGapM,minimumActualBvhDistanceM:clearance.minimumActualBvhDistanceM,xzUnchanged:true};
  }
  if(patchFit){
    Require(patchFit.xzFootprintUnchanged===true&&Array.isArray(patchFit.samples)&&patchFit.samples.length>0,'Patch conformance must retain the footprint and actual sampled support');
    Require(finite(patchFit.maximumActualNeighborRadiusM)&&patchFit.maximumActualNeighborRadiusM>=0&&patchFit.maximumActualNeighborRadiusM<=physicalCaps.patchNeighborSearchRadiusM+1e-8,'Patch conformance exceeded its physical neighboring-source search radius');
    let maxShift=0,minLift=Infinity,maxLift=0;
    for(const sample of patchFit.samples){
      Require(['sourcePatchY','highClothY','relativeHighLiftM','lowClothY','gamePatchY'].every(key=>finite(sample[key])),'Patch support sample contains nonfinite coordinates');
      Require(sample.relativeHighLiftM>0&&sample.relativeHighLiftM<physicalCaps.patchRelativeLiftM&&Math.abs((sample.highClothY-sample.sourcePatchY)-sample.relativeHighLiftM)<1e-7&&Math.abs((sample.lowClothY-sample.relativeHighLiftM)-sample.gamePatchY)<1e-7,'Patch sample does not preserve its actual thin source-to-cloth lift');
      maxShift=Math.max(maxShift,Math.abs(sample.gamePatchY-sample.sourcePatchY));minLift=Math.min(minLift,sample.relativeHighLiftM);maxLift=Math.max(maxLift,sample.relativeHighLiftM);
    }
    Require(maxShift<=physicalCaps.patchSourceToGameShiftM+1e-7,'Patch source-to-game conformance exceeds the physical 6 mm movement hard cap');
    Require(Near(patchFit.sourceLiftRangeM,[minLift,maxLift],1e-7)&&patchFit.triangles===patchObject.triangles,'Patch lift range/triangles disagree with actual sampled conformance');
    checks.patch={object:patchObject.object,maximumSourceToGameShiftM:maxShift,hardCapM:physicalCaps.patchSourceToGameShiftM,actualLiftRangeM:[minLift,maxLift],samples:patchFit.samples.length,actualNeighborRadiusM:patchFit.maximumActualNeighborRadiusM};
  }
  // The user explicitly moved the mat cross-section to baked textures.
  // Retained high windings are source detail, never a required game topology.
  Require(mat.generator==='SichuanGameMatV10'&&Array.isArray(mat.endCaps)&&mat.endCaps.length===2,'Mat provenance must record the actual pair of textured end caps');
  Require(mat.internalSpiralTriangles===0&&mat.internalWindingTextureOnly===true&&mat.coreFissureOpen===false,'Mat internal winding/core relief must be baked texture, without internal game spiral triangles');
  Require(mat.circumferenceStations===24&&Number.isInteger(mat.axialSegments)&&mat.axialSegments>0&&mat.outerShellTriangles===mat.axialSegments*mat.circumferenceStations*2,'Actual mat outer-shell counts disagree with its retained outline grid');
  Require(new Set(mat.endCaps.map(end=>end.end)).size===2&&mat.endCaps.every(end=>end.end===-1||end.end===1),'Mat end-cap provenance must cover opposite ends exactly once');
  for(const end of mat.endCaps){
    Require(end.outlineVertices===mat.circumferenceStations&&end.triangles===end.outlineVertices-2&&end.outlineMatchesShellEndpoint===true,'Mat texture cap must use the actual 24-point shell endpoint outline');
    Require(finite(end.maximumPlanarityErrorM)&&end.maximumPlanarityErrorM>=0&&end.maximumPlanarityErrorM<=1e-6,'Mat texture-cap outline is not a flat axial contour');
    Require(Array.isArray(end.outwardAxis)&&Near(end.outwardAxis,[end.end,0,0],1e-7)&&end.internalSpiralTriangles===0,'Mat texture-cap orientation or internal-triangle report is invalid');
  }
  const capTriangles=mat.endCaps.reduce((sum,end)=>sum+end.triangles,0);
  Require(mat.endCapTriangles===capTriangles&&mat.solidEndCapTriangles===capTriangles&&capTriangles===2*(mat.circumferenceStations-2),'Mat end-cap total must match the two actual outline tessellations');
  Require(sandals.generator==='SichuanGameSandalsV10'&&sandals.shoeCount===2&&Array.isArray(sandals.sandals)&&sandals.sandals.length===2,'Sandal provenance must retain the actual pair');
  for(const shoe of sandals.sandals){
    Require(finite(shoe.realSourcePlaitEnvelopeScale)&&shoe.realSourcePlaitEnvelopeScale>0&&finite(shoe.rimRouteMaximumErrorM)&&shoe.rimRouteMaximumErrorM>=0&&finite(shoe.soleProfileMaximumErrorM)&&shoe.soleProfileMaximumErrorM>=0,'Adaptive sandal source error measurements are missing');
    Require(Array.isArray(shoe.adaptiveRimParameters)&&shoe.adaptiveRimParameters.length===shoe.rimSampleStations&&Array.isArray(shoe.adaptiveSourceSoleRows)&&shoe.adaptiveSourceSoleRows.length===shoe.cupSampleGrid[0],'Adaptive sandal sample counts disagree with their actual source rows');
    Require(shoe.rimCrossSectionSides===4&&shoe.rimRadii?.crossSectionSides===shoe.rimCrossSectionSides&&shoe.raisedRimTriangles===shoe.rimSampleStations*shoe.rimCrossSectionSides*2,'Actual thick-rim triangle count does not match the four-sided source-backed tube');
  }
  checks.mat={endCaps:mat.endCaps.map(end=>({end:end.end,outlineVertices:end.outlineVertices,triangles:end.triangles,maximumPlanarityErrorM:end.maximumPlanarityErrorM})),endCapTriangles:capTriangles,internalSpiralTriangles:mat.internalSpiralTriangles,internalWindingTextureOnly:mat.internalWindingTextureOnly};
  checks.sandals=sandals.sandals.map(shoe=>({sandal:shoe.sandal,rimRouteMaximumErrorM:shoe.rimRouteMaximumErrorM,soleProfileMaximumErrorM:shoe.soleProfileMaximumErrorM,sourceEnvelopeScale:shoe.realSourcePlaitEnvelopeScale,rimCrossSectionSides:shoe.rimCrossSectionSides,raisedRimTriangles:shoe.raisedRimTriangles}));
  return {gameBundleClearance:clearance,patchFit:patchFit?{object:patchObject.object,triangles:patchObject.triangles,report:patchFit}:null,strawMat:mat,sandals,physicalCaps,checks};
}

if(Option('audit-geometry')){
  const auditFile=path.resolve(Option('audit-geometry')),auditGeometry=ReadJson(auditFile),audit=AuditGeometryReports(auditGeometry);
  console.log(JSON.stringify({geometryAuditPassed:true,file:auditFile,totalTriangles:auditGeometry.totalTriangles,byPart:Object.fromEntries(partNames.map(name=>[name,auditGeometry.parts[name].triangles])),physicalCaps:audit.physicalCaps,checks:audit.checks,metadataWritten:false}));
  process.exit(0);
}

const validation=ReadJson(validationFile);
const assetEvidence=FileEvidence(modelFile);
Require(validation.passed===true&&validation.failed===0&&validation.checks?.length>0&&validation.checks.every(check=>check.ok===true),'The strict candidate validation has not passed; delivery metadata was not written');
Require(validation.triangleLimit===3000&&validation.totalTriangles>0&&validation.totalTriangles<=3000,'The passed validation must use the actual requested 3000-triangle cap');
Require(validation.sha256===assetEvidence.sha256&&SamePath(validation.file,modelFile),'Strict report refers to a different GLB or an earlier candidate revision');
const geometryFile=path.join(reviewDir,'Data_GameGeometry.json');
const exportFile=path.join(reviewDir,'Data_GameExport.json');
const uvFile=path.join(reviewDir,'Bake/Data_GameUvV10.json');
const geometry=ReadJson(geometryFile),exportRecord=ReadJson(exportFile),uv=ReadJson(uvFile);
const manifestFile=path.join(modelDir,'Data_SichuanBlanketPackTextures.json');
const manifest=ReadJson(manifestFile);
const bakeRecordFile=path.resolve(projectDir,manifest.bakeRecord);
const bake=ReadJson(bakeRecordFile);
Require(exportRecord.glb?.sha256===assetEvidence.sha256&&exportRecord.glb?.bytes===assetEvidence.bytes&&exportRecord.exactExternalWebpBytes===true,'Exact-map export record does not match the delivered GLB');
Require(exportRecord.packedMaps===true&&exportRecord.allOptionalPartsIncluded===true,'Source export has not recorded final packed maps and all optional parts');
Require(uv.exactTriangleOverlapFree===true&&uv.everyTriangleContains1024PixelCenter===true&&uv.uvSet==='GameUV'&&uv.texCoord===1,'Actual game UV audit is incomplete');
Require(bake.roughnessBake?.method==='selected-to-active-emission'&&bake.surfaceBake?.padding?.syntheticSurfaceFillPixels===0,'The final PBR maps lack actual source projection evidence');
for(const channel of ['Base','Normal','Orm']){
  const entries=manifest.files.filter(entry=>entry.channel===channel);
  Require(entries.length===1,'The final manifest must register one '+channel+' map');
  const entry=entries[0],actual=FileEvidence(path.resolve(projectDir,entry.path));
  const audited=validation.externalMaps.find(value=>value.channel===channel);
  const encoded=bake.outputs.find(value=>value.channel===channel);
  Require(entry.width===1024&&entry.height===1024&&actual.sha256===entry.sha256&&actual.bytes===entry.bytes&&actual.sha256===audited?.sha256&&actual.sha256===encoded?.sha256,'Final '+channel+' map changed after encoding or strict validation');
}
const glb=LoadGlb(modelFile),document=glb.json;
const measured=Object.fromEntries(partNames.map(name=>[name,{triangleCount:0,points:[],meshNodes:[]}])) ,seen=new Set();
function Walk(index,parentMatrix,owner=null){
  Require(!seen.has(index),'Repeated node in candidate hierarchy');seen.add(index);
  const node=document.nodes[index],world=Multiply(parentMatrix,NodeMatrix(node));
  if(partNames.includes(node.name))owner=node.name;
  if(node.mesh!==undefined){
    Require(owner!==null,'Candidate mesh lies outside the controlled components');
    const part=measured[owner];part.meshNodes.push(node.name);
    for(const primitive of document.meshes[node.mesh].primitives){
      Require((primitive.mode??4)===4,'Candidate contains a non-triangle primitive');
      const positions=ReadAccessor(glb,primitive.attributes.POSITION);
      const count=primitive.indices===undefined?positions.count:ReadAccessorInt(glb,primitive.indices).count;
      Require(count%3===0,'Candidate has invalid triangle index count');part.triangleCount+=count/3;
      for(let index=0;index<positions.count;index++)part.points.push(Transform(world,Array.from(positions.data.subarray(index*3,index*3+3))));
    }
  }
  for(const child of node.children??[])Walk(child,world,owner);
}
const roots=document.scenes[document.scene??0].nodes;
Require(roots.length===1&&document.nodes[roots[0]].name==='Pack_Root'&&Near(NodeMatrix(document.nodes[roots[0]]),identity),'Root transform does not satisfy the identity back-pivot contract');
for(const root of roots)Walk(root,identity);
const byPart={};
for(const name of partNames){
  const part=measured[name];Require(part.points.length>0,name+' has no geometry');part.bounds=Bounds(part.points);byPart[name]=part.triangleCount;
  Require(part.triangleCount===validation.parts[name]?.triangleCount&&part.triangleCount===geometry.parts[name]?.triangles&&part.triangleCount===exportRecord.trianglesByPart[name],name+' counts disagree between actual GLB and geometry/export/strict evidence');
}
const total=Object.values(byPart).reduce((sum,count)=>sum+count,0);
Require(total===validation.totalTriangles&&total===geometry.totalTriangles&&total===exportRecord.totalTriangles&&total===uv.triangles&&total<=3000,'Actual all-parts triangle count differs between final evidence files');
const geometrySourceReports=AuditGeometryReports(geometry);
function ActualMeshTriangles(name,part){
  const nodes=document.nodes.filter(node=>node.name===name&&node.mesh!==undefined);
  Require(nodes.length===1&&measured[part].meshNodes.includes(name),'Reported geometry-fit object is absent from its actual controlled part: '+name);
  return document.meshes[nodes[0].mesh].primitives.reduce((sum,primitive)=>sum+(primitive.indices===undefined?document.accessors[primitive.attributes.POSITION].count:document.accessors[primitive.indices].count)/3,0);
}
if(geometrySourceReports.gameBundleClearance)Require(ActualMeshTriangles(geometrySourceReports.gameBundleClearance.object,'Pack_Binding')===geometrySourceReports.gameBundleClearance.actualTriangles,'Actual fitted main-binding triangle count differs from its conformance report');
if(geometrySourceReports.patchFit)Require(ActualMeshTriangles(geometrySourceReports.patchFit.object,'Pack_Bundle')===geometrySourceReports.patchFit.triangles,'Actual thin-patch geometry differs from its measured fit report');
for(const [part,report] of [['Pack_StrawMat',geometrySourceReports.strawMat],['Pack_Sandals',geometrySourceReports.sandals]])Require(report.objects.reduce((sum,name)=>sum+ActualMeshTriangles(name,part),0)===byPart[part],'Actual '+part+' meshes differ from the complete construction/adaptive-sampling report');
const bundle=measured.Pack_Bundle.bounds;
Require(Near(bundle.size,[.38,.30,.13],.002)&&Math.abs(bundle.min[2])<=.001,'Actual GLB bundle dimensions or back plane differ from the requested contract');
Require(geometry.sourceHighBlend&&geometry.gameBlend&&SamePath(geometry.sourceHighBlend,bake.roughnessBake.sourceBlend.path)&&SamePath(geometry.gameBlend,exportRecord.gameBlend),'High/game source paths disagree across the final provenance');
const highEvidence=FileEvidence(geometry.sourceHighBlend),gameEvidence=FileEvidence(geometry.gameBlend);
Require(highEvidence.sha256===bake.roughnessBake.sourceBlend.sha256&&highEvidence.bytes===bake.roughnessBake.sourceBlend.bytes,'Retained high source changed after the actual projection');
const originalSculptEvidence=geometry.sourceSculptBlend?FileEvidence(geometry.sourceSculptBlend):null;
const supportReportFile=geometry.bakeSupportReport?path.resolve(geometry.bakeSupportReport):null;
const supportReport=supportReportFile?ReadJson(supportReportFile):null;
const IsSha256=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function ActualSourceMaterials(object,sources){
  const matches=sources.filter(source=>source.name===object);
  Require(matches.length===1&&Array.isArray(matches[0].materials)&&matches[0].materials.length>0,'Actual bake source/material slots are missing or ambiguous: '+object);
  return matches[0].materials.map(material=>material.name);
}
function CheckFinalMaterialSlots(object,slots,sources){
  const actual=ActualSourceMaterials(object,sources);
  Require(Array.isArray(slots)&&slots.length===actual.length,'Final source-material slot count differs from the actual bake: '+object);
  const resolved=slots.map((slot,index)=>typeof slot==='string'?{slot:index,material:slot}:slot);
  Require(resolved.every((slot,index)=>slot&&slot.slot===index&&typeof slot.material==='string'&&slot.material===actual[index]&&(!('faceCount' in slot)||(Number.isInteger(slot.faceCount)&&slot.faceCount>=0))),'Final source-material slots differ from actual bake provenance: '+object);
  return resolved;
}
function AuditStrawTone(report,sources,woven){
  Require(report.generator==='SichuanGameStrawToneV10'&&typeof report.recipe==='string'&&report.recipe.length>0,'Current straw-tone recipe is missing');
  Require(report.originalMaterialsRetainedWithFakeUser===true&&report.originalMaterialGraphsChanged===false&&report.geometryChanged===false&&report.uvsChanged===false&&report.transformsChanged===false&&report.imagesChanged===false&&report.runtimeTrianglesAdded===0,'Straw-tone provenance must preserve source graphs, geometry, UVs, transforms and image bytes');
  Require(report.wovenTileAndProjectionUnchanged===true&&woven&&Math.abs(report.wovenTileWidthM-woven.tileWidthM)<1e-8&&Math.abs(report.wovenTileMix-woven.tileWeight)<1e-8,'Straw-tone provenance disagrees with the actual retained woven projection');
  const PositiveTriplet=value=>Array.isArray(value)&&value.length===3&&value.every(component=>Number.isFinite(component)&&component>0);
  Require(PositiveTriplet(report.warmMultiplierLinear)&&Array.isArray(report.rimStrandMultipliersLinear)&&report.rimStrandMultipliersLinear.length===3&&report.rimStrandMultipliersLinear.every(PositiveTriplet),'Actual straw/rim colour multipliers are incomplete');
  Require(Array.isArray(report.assignments)&&report.assignments.length>0&&Array.isArray(report.materials)&&report.materials.length>0,'Actual straw-tone assignments/material chain is missing');
  Require(new Set(report.assignments.map(assignment=>assignment.object)).size===report.assignments.length&&new Set(report.materials.map(material=>material.material)).size===report.materials.length,'Straw-tone source/material identities are ambiguous');
  const materialByName=new Map(report.materials.map(material=>[material.material,material]));
  for(const material of report.materials){
    Require(material.originalRetainedWithFakeUser===true&&material.parentRetainedWithFakeUser===true&&material.atlasRegion==='straw'&&PositiveTriplet(material.multiplierLinear),'Straw-tone material lost its actual parent/original graph: '+material.material);
    if(material.variant==='Warm')Require(material.parent===material.originalBeforeTone&&Near(material.multiplierLinear,report.warmMultiplierLinear),'Warm material does not retain its actual pre-tone parent');
    else {
      const parent=materialByName.get(material.parent);
      Require(parent?.variant==='Warm'&&parent.originalBeforeTone===material.originalBeforeTone,'Rim strand material lacks its retained warm-to-original chain: '+material.material);
    }
  }
  for(const assignment of report.assignments){
    Require(['Pack_StrawMat','Pack_Sandals'].includes(assignment.part)&&!['Pack_MatCottonRetainers','Pack_ThinSandalHangingTwine'].includes(assignment.sourceName),'Straw-tone assignment includes an excluded cloth part');
    const finalSlots=CheckFinalMaterialSlots(assignment.object,assignment.materialsAtBake,sources);
    Require(Array.isArray(assignment.materialNamesAtBake)&&NearNames(assignment.materialNamesAtBake,finalSlots.map(slot=>slot.material)),'Straw-tone final material aliases disagree with its slots');
    Require(Array.isArray(assignment.inputMaterials)&&Array.isArray(assignment.sourceSlotToWarmSlot)&&assignment.inputMaterials.length===assignment.sourceSlotToWarmSlot.length,'Straw-tone pre-tone slot mapping is incomplete');
    for(const [index,input] of assignment.inputMaterials.entries()){
      const final=finalSlots[assignment.sourceSlotToWarmSlot[index]],material=materialByName.get(final?.material);
      Require(final&&(final.atlasRegion==='straw'?material?.variant==='Warm'&&(material.parent===input||(material.reused===true&&material.material===input)):final.material===input),'Straw-tone pre-tone slot mapping does not resolve to its actual warm slot: '+assignment.object);
    }
    for(const slot of finalSlots)if(slot.atlasRegion==='straw')Require(materialByName.has(slot.material),'An actual straw slot lacks its retained material chain');
  }
  Require(Array.isArray(report.rimStrands)&&report.rimStrands.length===6,'Straw-tone report must retain the actual three strands of both sandals');
  const strandKeys=new Set();
  for(const strand of report.rimStrands){
    const key=strand.sandal+':'+strand.strand,assignment=report.assignments.find(value=>value.object===strand.sourceObject);
    Require([1,2].includes(strand.sandal)&&[1,2,3].includes(strand.strand)&&!strandKeys.has(key)&&assignment?.part==='Pack_Sandals','Straw-tone rim source identity is incomplete or duplicated');strandKeys.add(key);
    Require(Number.isInteger(strand.sourceRings)&&strand.sourceRings>2&&Number.isInteger(strand.sourceSectionSides)&&strand.sourceSectionSides>=3&&Array.isArray(strand.sourceVertexRange)&&strand.sourceVertexRange.length===2&&strand.sourceVertexRange.every(Number.isInteger)&&strand.sourceVertexRange[1]-strand.sourceVertexRange[0]===strand.sourceRings*strand.sourceSectionSides,'Actual rim-strand vertex range/ring topology is invalid');
    Require(strand.faceCount===(strand.sourceRings-1)*strand.sourceSectionSides+2&&IsSha256(strand.faceIndexSha256)&&IsSha256(strand.faceTopologySha256)&&typeof strand.faceIndexHashEncoding==='string','Actual rim-strand face counts/topology hashes are missing');
    Require(Near(strand.multiplierLinear,report.rimStrandMultipliersLinear[strand.strand-1])&&Array.isArray(strand.materialsAtBake)&&strand.materialsAtBake.length>0,'Actual rim strand lacks its own recorded colour/material assignment');
    Require(strand.materialsAtBake.reduce((sum,value)=>sum+value.faceCount,0)===strand.faceCount,'Actual rim material assignments disagree with their face count');
    for(const entry of strand.materialsAtBake){
      const material=materialByName.get(entry.material),slot=assignment.materialsAtBake.find(value=>value.material===entry.material);
      Require(Number.isInteger(entry.faceCount)&&entry.faceCount>0&&slot&&slot.faceCount>=entry.faceCount&&material&&material.parent===entry.warmedParent&&material.originalBeforeTone===entry.originalBeforeTone&&Near(material.multiplierLinear,strand.multiplierLinear),'Actual rim-strand material chain does not reach its final bake slot');
    }
  }
  Require(Array.isArray(report.excluded)&&['Pack_MatCottonRetainers','Pack_ThinSandalHangingTwine'].every(name=>report.excluded.some(entry=>entry.sourceName===name)),'The cloth retainers/hanging twine exclusions must be explicitly retained');
  return report;
}
function NearNames(a,b){return a.length===b.length&&a.every((value,index)=>value===b[index]);}
const strawTone=supportReport?.strawTone??null;
const strawToneProvenance=strawTone?{
  sourceUseRecord:FileEvidence(supportReportFile),
  rebuild:FileEvidence(path.join(sourceProjectDir,'_blender/Script_SichuanGameStrawToneV10.py')),
  report:AuditStrawTone(strawTone,bake.roughnessBake.sources,supportReport?.wovenLodSource)
}:null;
const cottonBalance=supportReport?.cottonBalance??null;
let cottonProvenance=null;
if(cottonBalance){
  Require(cottonBalance.generator==='SichuanGameCottonBalanceV10'&&typeof cottonBalance.recipe==='string'&&Array.isArray(cottonBalance.assignments),'Current cotton-balance source recipe/assignments are missing');
  for(const assignment of cottonBalance.assignments){
    const source=bake.roughnessBake.sources.find(value=>value.name===assignment.object);
    const finalMaterial=assignment.materialAtBake??assignment.material;
    Require(!!source&&source.materials.some(material=>material.name===finalMaterial),'Current bake material provenance does not include CottonBalance assignment '+assignment.object+' / '+finalMaterial);
  }
  cottonProvenance={sourceUseRecord:FileEvidence(supportReportFile),rebuild:'../../_blender/Script_SichuanGameCottonBalanceV10.py',report:cottonBalance};
}
const foldEnvelope=geometry.foldEnvelope??geometry.parts.Pack_Bundle.foldEnvelope??supportReport?.foldEnvelope??null;
const foldEnvelopeFile=geometry.foldEnvelopeReport?path.resolve(geometry.foldEnvelopeReport):null;
const foldProvenance=foldEnvelope||foldEnvelopeFile?{
  rebuild:'../../_blender/Script_SichuanGameFoldEnvelopeV10.py',
  geometryRecord:FileEvidence(geometryFile),
  report:foldEnvelopeFile?ReadJson(foldEnvelopeFile):foldEnvelope,
  ...(foldEnvelopeFile?{reportEvidence:FileEvidence(foldEnvelopeFile)}:{})
}:null;
const repairStitches=geometry.parts.Pack_Bundle.repairStitches??null;
let handStitchProvenance=null;
if(repairStitches){
  Require(repairStitches.generator==='SichuanGameRepairStitchesV10'&&Array.isArray(repairStitches.stitches),'Current repair-stitch geometry report is incomplete');
  const stitchNode=document.nodes.find(node=>node.name===repairStitches.object&&node.mesh!==undefined);
  Require(!!stitchNode&&measured.Pack_Bundle.meshNodes.includes(repairStitches.object),'Reported hand stitches are absent from the actual exported bundle');
  const stitchTriangles=document.meshes[stitchNode.mesh].primitives.reduce((sum,primitive)=>sum+(primitive.indices===undefined?document.accessors[primitive.attributes.POSITION].count:document.accessors[primitive.indices].count)/3,0);
  Require(stitchTriangles===repairStitches.triangles&&repairStitches.actualHighStitches===repairStitches.stitches.length,'Actual exported hand-stitch geometry differs from the source-backed report');
  Require(repairStitches.bodyTrianglesAfter===byPart.Pack_Bundle&&repairStitches.packTrianglesAfter===total,'Hand-stitch report records different bundle/all-parts triangle counts');
  Require(bake.roughnessBake.sources.some(source=>source.name===repairStitches.sourceObject),'Actual high hand-stitch source is absent from this bake provenance');
  handStitchProvenance={script:'../../_blender/Script_SichuanGameRepairStitchesV10.py',rebuild:'../../_blender/Script_SichuanGameRepairStitchesV10.py',geometryRecord:FileEvidence(geometryFile),report:repairStitches};
}
const actualProjection=bake.sourceProjection??{};
const projectionSettings={
  method:actualProjection.method??null,
  sourceMaterialNormalPolicy:actualProjection.sourceMaterialNormalPolicy??null,
  sourceMaterialNormalPolicies:[...new Set((actualProjection.groups??[]).map(group=>group.sourceMaterialNormalPolicy).filter(Boolean))],
  localizedGeometricNormalRepairs:actualProjection.normalGeometricRepairs??null,
  coordinateAnchorsAnalyticallyPreserved:actualProjection.coordinateAnchorsAnalyticallyPreserved??null,
  originalHighAndGamePositionsUnchanged:actualProjection.originalHighAndGamePositionsUnchanged??null,
  sourceNormalOrRgbFlipped:actualProjection.sourceNormalOrRgbFlipped??null,
  syntheticSurfaceFillPixels:actualProjection.syntheticSurfaceFillPixels??null,
  supportDepthM:supportReport?.depthM??null,
  supportSourceTrianglesExcludedFromGame:supportReport?.supportTriangles??null,
  groups:(actualProjection.groups??[]).map(group=>{
    const occluders=group.aoOccluders??group.fullAoOccluders??[];
    const hasPartitionCounts=occluders.length>0&&occluders.every(value=>Number.isInteger(value.selectedFaces)&&Number.isInteger(value.occluderFaces)&&Number.isInteger(value.originalFaces));
    return {
      part:group.part,generator:group.generator,targetNormals:group.targetNormals,
      sourceFiltering:group.sourceFiltering,sourceFilterChoice:group.sourceFilterChoice??null,cellSpacingM:group.cellSpacingM,
      sourceMaterialNormalPolicy:group.sourceMaterialNormalPolicy??null,
      microNormalConeDegrees:group.microNormalConeDegrees??null,
      sourceNormalConeDegrees:[...new Set([group.sourceNormalConeDegrees,...(group.groups??[]).map(cell=>cell.sourceNormalConeDegrees)].filter(value=>value!==undefined))],
      minimumSourceFaceDots:[...new Set((group.groups??[]).map(cell=>cell.minimumSourceFaceDot).filter(value=>value!==undefined))],
      aoOccluderObjects:occluders.length,
      aoOccluderSourceNames:[...new Set(occluders.map(value=>value.source))],
      aoSourcePartition:group.aoSourcePartition??group.aoOccluderPolicy??group.fullAoOccluderPolicy??null,
      aoComplementMeshCacheCount:group.aoComplementMeshCacheCount??null,
      recordedAoFacePartitionsBalanced:hasPartitionCounts?occluders.every(value=>value.selectedFaces+value.occluderFaces===value.originalFaces):null
    };
  })
};
const wovenLod=supportReport?.wovenLodSource??null;
let wovenProvenance=null;
if(wovenLod){
  Require(wovenLod.generator==='SichuanWovenLodSourceV11'&&Near(wovenLod.imageResolution,[1024,1024])&&wovenLod.imagePacked===true&&wovenLod.geometryAndUvsUnchanged===true,'The current GrassWeaveV11 source report is incomplete');
  const preparedTile=FileEvidence(wovenLod.imagegenTile);
  Require(preparedTile.sha256===wovenLod.imageSha256,'GrassWeaveV11 prepared tile changed after the actual bake-source preparation');
  const wovenStudyFile=path.join(path.dirname(wovenLod.imagegenTile),'Data_SichuanGrassWeaveV11.json');
  const wovenStudy=ReadJson(wovenStudyFile);
  Require(wovenStudy.generator==='Built-in image_gen__imagegen'&&wovenStudy.promptCapturedVerbatim===false&&typeof wovenStudy.promptSummary==='string'&&wovenStudy.promptSummary.length>0,'GrassWeaveV11 provenance must identify its real provider and distinguish the summary from the missing verbatim prompt');
  Require(wovenStudy.preparedTile?.sha256===preparedTile.sha256&&wovenStudy.preparedTile?.bytes===preparedTile.bytes,'GrassWeaveV11 study record does not match the actual prepared source tile');
  const rawCandidates=[wovenStudy.source,wovenStudy.sourceEvidence?.path,wovenStudy.stagedGeneratedCopy?.path,path.join(path.dirname(wovenLod.imagegenTile),'Texture_SichuanWovenLodGeneratedV11.png')].filter(Boolean);
  const generatedSourceFile=rawCandidates.find(file=>fs.existsSync(file)&&Hash(fs.readFileSync(file))===wovenStudy.sourceSha256);
  Require(generatedSourceFile,'Retained GrassWeaveV11 generated source is missing or no longer matches its provenance');
  Require(Array.isArray(wovenLod.assignments)&&wovenLod.assignments.length>0,'GrassWeaveV11 has no actual high-source material assignments');
  const finalAssignments=wovenLod.assignments.map(assignment=>{
    Require(Array.isArray(assignment.materials)&&assignment.materials.length>0&&assignment.materials.every(name=>typeof name==='string'),'GrassWeaveV11 pre-tone material assignments are missing');
    const toneAssignment=strawTone?.assignments.find(value=>value.object===assignment.object);
    if(toneAssignment)Require(NearNames(toneAssignment.inputMaterials,assignment.materials),'Woven-to-tone material chain differs from the actual pre-tone slots: '+assignment.object);
    const finalSlots=CheckFinalMaterialSlots(assignment.object,assignment.materialsAtBake??toneAssignment?.materialsAtBake??assignment.materials,bake.roughnessBake.sources);
    return {...assignment,materialsAtBake:finalSlots,finalMaterialResolution:assignment.materialsAtBake?'Recorded final source slots':toneAssignment?'Actual StrawTone source-slot assignment':'Original woven slots retained at bake'};
  });
  wovenProvenance={
    generator:wovenLod.generator,studyRecord:FileEvidence(wovenStudyFile),sourceUseRecord:FileEvidence(supportReportFile),
    imagegenSource:FileEvidence(generatedSourceFile),preparedTile,
    provider:wovenStudy.generator,promptSummary:wovenStudy.promptSummary,promptCapturedVerbatim:false,
    imageResolution:wovenLod.imageResolution,tileWidthM:wovenLod.tileWidthM,
    tileWeight:wovenLod.tileWeight,assignments:finalAssignments,
    materials:wovenLod.materials,rollProjection:wovenLod.rollProjection,
    excludedSources:wovenLod.excludedSources,
    geometryAndUvsUnchanged:wovenLod.geometryAndUvsUnchanged,
    ...(wovenLod.originalMaterialsUnchanged!==undefined?{originalMaterialsUnchanged:wovenLod.originalMaterialsUnchanged}:{}),
    ...(wovenLod.originalShaderGraphsUnchanged!==undefined?{originalShaderGraphsUnchanged:wovenLod.originalShaderGraphsUnchanged}:{}),
    ...(wovenLod.originalMaterialsRetainedWithFakeUser!==undefined?{originalMaterialsRetainedWithFakeUser:wovenLod.originalMaterialsRetainedWithFakeUser}:{}),
    rebuild:'../../_blender/Script_SichuanGameWovenLodV10.py'
  };
}
function AuditEndcapSource(report,sources,mat,actualTriangles){
  Require(report.generator==='SichuanGameMatEndImageSourceV10'&&typeof report.source==='string'&&typeof report.sourcePackName==='string'&&typeof report.target==='string','The high-only mat-end source identity is incomplete');
  Require(report.imagePacked===true&&report.imageColourSpace==='sRGB'&&report.imagePixelsEdited===false&&Near(report.imageSize,[1024,1024]),'Mat-end source must retain its actual packed 1024 sRGB image');
  const preparedImage=FileEvidence(report.imageSource),png=fs.readFileSync(report.imageSource);
  Require(preparedImage.sha256===report.imageSha256&&png.length>=24&&png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&png.toString('ascii',12,16)==='IHDR'&&png.readUInt32BE(16)===1024&&png.readUInt32BE(20)===1024,'Actual mat-end prepared PNG changed or has different dimensions');
  const rebuild=FileEvidence(report.rebuildScript);
  Require(rebuild.sha256===report.rebuildScriptSha256,'The actual mat-end carrier rebuild script changed after source preparation');
  let sourceShader=null;
  if(report.albedoFloorLinear!==undefined){
    Require(Array.isArray(report.albedoFloorLinear)&&report.albedoFloorLinear.length===3&&report.albedoFloorLinear.every(value=>Number.isFinite(value)&&value>0&&value<1)&&typeof report.albedoFloorPurpose==='string'&&report.albedoFloorPurpose.length>0,'Mat-end source-shader albedo floor/purpose is incomplete');
    const helper=fs.readFileSync(report.rebuildScript,'utf8');
    const floorValue=helper.match(/floor\.inputs\[1\]\.default_value\s*=\s*\(([^)]+)\)/);
    const implementationFloor=floorValue?.[1].split(',').filter(value=>value.trim().length).map(Number);
    const fullBranchMaximum=/floor\s*=\s*nodes\.new\(['"]ShaderNodeVectorMath['"]\)/.test(helper)&&/floor\.operation\s*=\s*['"]MAXIMUM['"]/.test(helper)&&/links\.new\(\s*texture\.outputs\[['"]Color['"]\]\s*,\s*floor\.inputs\[0\]\s*\)/.test(helper)&&/links\.new\(\s*floor\.outputs\[['"]Vector['"]\]\s*,\s*shader\.inputs\[['"]Base Color['"]\]\s*\)/.test(helper);
    Require(fullBranchMaximum&&implementationFloor&&Near(report.albedoFloorLinear,implementationFloor,1e-10),'Mat-end albedo floor is not the recorded whole-source Base Color MAXIMUM branch in its actual retained helper');
    sourceShader={material:report.sourceMaterial,operation:'Component-wise MAXIMUM',input:'AuthoredWindingBaseColour image RGB',minimumLinearRgb:report.albedoFloorLinear,output:'Principled Base Color',scope:'Every source material sample before selected-to-active projection; no pixel-index exception list',purpose:report.albedoFloorPurpose,imagePixelsEdited:false,geometryHeightLookup:'Original image luminance; Base Color floor is separate',implementationEvidence:rebuild,rawSurfaceValidation:'Existing source-bake black/alpha/normal gates remain unchanged'};
  }
  const finalSlots=CheckFinalMaterialSlots(report.source,report.materialsAtBake??[report.sourceMaterial],sources);
  Require(report.lowGeometryAndUvsUnchanged===true&&report.originalHighSculptObjectsModified===false&&report.exportedAsGameGeometry===false,'Mat-end texture carrier changed original geometry or entered the runtime export');
  Require(report.lowTrianglesBefore===report.lowTrianglesAfter&&report.lowTrianglesAfter===mat.endCapTriangles&&actualTriangles===report.lowTrianglesAfter,'Actual runtime mat-end triangles differ from the unchanged low-cap record');
  Require(IsSha256(report.lowGeometryAndUvsSha256Before)&&report.lowGeometryAndUvsSha256Before===report.lowGeometryAndUvsSha256After&&JSON.stringify(report.lowUvLayerHashesBefore)===JSON.stringify(report.lowUvLayerHashesAfter)&&Object.keys(report.lowUvLayerHashesBefore??{}).length>0&&Object.values(report.lowUvLayerHashesBefore).every(IsSha256),'Mat-end source preparation changed the actual low geometry/UV hashes');
  Require(IsSha256(report.sourceGeometryAndUvsSha256)&&report.carrierUvLayer==='sourceUV'&&IsSha256(report.sourceUvLayerHashes?.sourceUV),'Mat-end carrier geometry/source UV provenance is incomplete');
  Require(report.targetSourceHighObject===report.source&&report.targetBakeSourceNames===report.sourcePackName,'Mat-end low source binding does not identify the actual carrier');
  Require(!document.nodes.some(node=>node.name===report.source||node.name===report.sourcePackName),'High-only mat-end source was exported as game geometry');
  const finite=Number.isFinite;
  Require(finite(report.outwardOffsetM)&&finite(report.microDisplacementPeakToPeakM)&&report.microDisplacementPeakToPeakM>0&&report.microDisplacementPeakToPeakM<=.00030&&finite(report.fallbackOutwardOffsetM)&&report.fallbackOutwardOffsetM>0&&report.fallbackOutwardOffsetM<report.outwardOffsetM-report.microDisplacementPeakToPeakM*.5,'Mat-end source relief/fallback does not retain its shallow outward layer order');
  Require(report.luminanceGeometry?.colourPixelsModified===false&&typeof report.luminanceGeometry?.method==='string','Mat-end geometric relief must distinguish its height lookup from unchanged image pixels');
  Require(Array.isArray(report.ends)&&report.ends.length===2&&new Set(report.ends.map(end=>end.end)).size===2,'Mat-end carrier must cover both actual cap outlines');
  for(const end of report.ends){
    const lowEnd=mat.endCaps.find(value=>value.end===end.end);
    Require(lowEnd&&end.sourceOutlineFootprintMatchesActualLow===true&&end.sourceLowOutlineVertices===lowEnd.outlineVertices&&end.sourceLowTriangles===lowEnd.triangles&&end.fallbackVertices===lowEnd.outlineVertices&&end.fallbackTriangles===lowEnd.triangles&&Number.isInteger(end.subdivisionLevels)&&end.subdivisionLevels>=4&&end.subdivisionLevels<=6&&end.denseTriangles===lowEnd.triangles*4**end.subdivisionLevels&&Number.isInteger(end.denseVertices)&&end.denseVertices>lowEnd.outlineVertices,'Mat-end carrier no longer follows the actual unchanged low outline tessellation');
    Require(end.denseVertices===(end.denseTriangles+end.sourceLowOutlineVertices*2**end.subdivisionLevels)/2+1,'Mat-end dense vertex count does not match its shared-edge subdivision topology');
    Require(finite(end.maximumActualLowPlanarityErrorM)&&end.maximumActualLowPlanarityErrorM>=0&&end.maximumActualLowPlanarityErrorM<=1e-6&&end.imageUMirrored===(end.end<0),'Mat-end source planar outline or mirrored mapping is inconsistent');
    const range=end.displacedSourceOutwardRangeM;
    Require(Array.isArray(range)&&range.length===2&&range.every(finite)&&range[0]<=range[1]&&range[0]>=report.outwardOffsetM-report.microDisplacementPeakToPeakM*.5-1e-8&&range[1]<=report.outwardOffsetM+report.microDisplacementPeakToPeakM*.5+1e-8&&range[0]>report.fallbackOutwardOffsetM&&end.fallbackOutwardOffsetM===report.fallbackOutwardOffsetM,'Actual mat-end carrier relief exceeds its recorded shallow outward range');
  }
  Require(report.highCarrierTriangles===report.ends.reduce((sum,end)=>sum+end.denseTriangles+end.fallbackTriangles,0)&&report.highCarrierVertices===report.ends.reduce((sum,end)=>sum+end.denseVertices+end.fallbackVertices,0),'Mat-end high carrier totals disagree with the actual per-end source counts');
  return {report,preparedImage,rebuild,sourceShader,materialsAtBake:finalSlots,preparedImageClaim:'Actual prepared bake-source image; raw imagegen output and prompt require separate generation provenance'};
}
const endcapSource=supportReport?.endcapSourceProvenance??null;
const endcapSourceProvenance=endcapSource?{
  sourceUseRecord:FileEvidence(supportReportFile),
  ...AuditEndcapSource(endcapSource,bake.roughnessBake.sources,geometrySourceReports.strawMat,ActualMeshTriangles(endcapSource.target,'Pack_StrawMat'))
}:null;
if(endcapSourceProvenance){
  const actualProjectionUses=bake.roughnessBake.projection.filter(operation=>operation.target===endcapSource.target);
  Require(actualProjectionUses.length>0&&actualProjectionUses.every(operation=>operation.part==='Pack_StrawMat'&&operation.selectedToActive===true&&operation.bakeType==='EMIT'&&operation.targetTriangleCount===endcapSource.lowTrianglesAfter&&operation.sources?.includes(endcapSource.source)),'The actual low-cap projection does not use the recorded imagegen carrier');
  endcapSourceProvenance.actualProjectionUses=actualProjectionUses;
  const generationRecordFile=path.join(path.dirname(endcapSource.imageSource),'Data_SichuanMatEndSourceV12.json');
  const generation=ReadJson(generationRecordFile);
  Require(generation.schema==='sichuan-imagegen-mat-end-v12'&&generation.generator==='Built-in image_gen__imagegen'&&generation.promptCapturedVerbatim===true&&typeof generation.prompt==='string'&&generation.prompt.length>0,'MatEndV12 generation record must retain its actual provider and exact prompt');
  const promptFile=FileEvidence(generation.promptFile),savedPrompt=fs.readFileSync(generation.promptFile,'utf8').replace(/^\uFEFF/,'');
  Require(savedPrompt===generation.prompt||savedPrompt.replace(/\r?\n$/,'')===generation.prompt,'Retained MatEndV12 prompt file differs from the exact generation prompt');
  Require(generation.originalGenerated&&IsSha256(generation.originalGenerated.sha256)&&Number.isInteger(generation.originalGenerated.width)&&Number.isInteger(generation.originalGenerated.height),'MatEndV12 original imagegen source evidence is incomplete');
  const generatedCandidates=[generation.originalGenerated,generation.stagedOriginal].filter(entry=>entry?.path&&fs.existsSync(entry.path));
  const actualGenerated=generatedCandidates.find(entry=>FileEvidence(entry.path).sha256===generation.originalGenerated.sha256);
  Require(actualGenerated,'Retained MatEndV12 imagegen output is missing or no longer matches its original recorded hash');
  const generatedImage=FileEvidence(actualGenerated.path),generatedPng=fs.readFileSync(actualGenerated.path);
  Require(generatedImage.bytes===generation.originalGenerated.bytes&&generatedPng.length>=24&&generatedPng.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&generatedPng.toString('ascii',12,16)==='IHDR'&&generatedPng.readUInt32BE(16)===generation.originalGenerated.width&&generatedPng.readUInt32BE(20)===generation.originalGenerated.height,'Actual MatEndV12 original image dimensions/bytes disagree with its generation record');
  Require(generation.prepared?.sha256===endcapSourceProvenance.preparedImage.sha256&&generation.prepared?.bytes===endcapSourceProvenance.preparedImage.bytes&&generation.prepared?.width===1024&&generation.prepared?.height===1024&&SamePath(generation.prepared.path,endcapSource.imageSource),'MatEndV12 generation preparation record differs from the actual carrier image');
  Require(Array.isArray(generation.preparation?.operations)&&generation.preparation.operations.length>0&&generation.preparation.operations.every(operation=>typeof operation==='string')&&generation.preparation.generatedPixelsOtherwiseUnedited===true,'MatEndV12 must retain its actual image preparation operations');
  endcapSourceProvenance.generation={
    studyRecord:FileEvidence(generationRecordFile),provider:generation.generator,
    originalImagegenOutput:{...generation.originalGenerated,retainedEvidence:generatedImage},
    stagedOriginal:generation.stagedOriginal??null,prepared:generation.prepared,
    promptFile,prompt:generation.prompt,promptCapturedVerbatim:true,
    promptFileComparison:'Exact prompt, optionally followed by one text-file newline',
    preparation:generation.preparation,use:generation.use,
    distinction:'The imagegen original retains its recorded native dimensions; the 1024 prepared source is resized separately and is projected into the final shared runtime atlas'
  };
}
const sourceBase=path.dirname(path.dirname(geometry.sourceHighBlend));
const referenceFile=path.join(sourceBase,'Source/Image_SichuanBlanketPackThreeViewV02.png');
Require(fs.existsSync(referenceFile),'The approved V02 modelling reference is missing');
const date=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});
const version=`${date.replaceAll('-','')}GameV10-${assetEvidence.sha256.slice(0,8)}`;
const visualFile=Option('visual')?path.resolve(Option('visual')):null;
let visual=null,sourceReopenVerified=false;
if(visualFile){
  visual=ReadJson(visualFile);
  Require(visual.assetSha256===assetEvidence.sha256&&visual.passed===true&&Array.isArray(visual.checks)&&visual.checks.length>0&&visual.checks.every(check=>check.ok===true&&typeof check.evidence==='string'&&check.evidence.length>0),'Visual record must identify this exact GLB and actual passing evidence');
  const required=['front','back','side','three-quarter','mat-hidden','jacket-hidden','jacket-extracted'];
  for(const id of required)Require(visual.checks.some(check=>check.id===id),'Visual record is missing required final-model inspection '+id);
  if(visual.sourceReopen?.verified===true){
    Require(SamePath(visual.sourceReopen.path,geometry.gameBlend)&&visual.sourceReopen.sha256===gameEvidence.sha256,'Source reopen record does not identify the current saved GameV10 blend');
    sourceReopenVerified=true;
  }
}
const referenceFidelityReviewed=visual?.referenceFidelityReviewed===true;
const sourceStudies=[];
for(const name of ['Data_SichuanCottonReliefV10.json','Data_SichuanWornStrawV10.json','Data_SichuanOldCottonV09.json','Data_SichuanWornFibersV08.json']){
  const file=path.join(sourceProjectDir,'Model/SichuanBlanketPack',name);
  if(!fs.existsSync(file))continue;
  const study=ReadJson(file),source=study.source;
  if(!source)continue;
  const candidates=path.isAbsolute(source)?[source]:['MaterialAtlasV10','MaterialAtlasV09','MaterialAtlasV08'].map(folder=>path.join(sourceBase,'Source',folder,source));
  const actualSource=candidates.find(value=>fs.existsSync(value)&&Hash(fs.readFileSync(value))===study.sourceSha256);
  Require(actualSource,'Retained imagegen source cannot be verified for '+name);
  sourceStudies.push({studyRecord:FileEvidence(file),imagegenSource:FileEvidence(actualSource),generation:study.generationSource??study.generator??study.provider??'See retained source study record'});
}
if(wovenProvenance)sourceStudies.push({studyRecord:wovenProvenance.studyRecord,imagegenSource:wovenProvenance.imagegenSource,preparedTile:wovenProvenance.preparedTile,generation:wovenProvenance.provider,promptSummary:wovenProvenance.promptSummary,promptCapturedVerbatim:false,tileWidthM:wovenProvenance.tileWidthM,tileWeight:wovenProvenance.tileWeight});
if(endcapSourceProvenance?.generation)sourceStudies.push({studyRecord:endcapSourceProvenance.generation.studyRecord,imagegenSource:endcapSourceProvenance.generation.originalImagegenOutput.retainedEvidence,originalResolution:[endcapSourceProvenance.generation.originalImagegenOutput.width,endcapSourceProvenance.generation.originalImagegenOutput.height],preparedTile:endcapSourceProvenance.preparedImage,preparedResolution:endcapSource.imageSize,generation:endcapSourceProvenance.generation.provider,promptFile:endcapSourceProvenance.generation.promptFile,promptCapturedVerbatim:true,preparation:endcapSourceProvenance.generation.preparation});
const parts=[
  {node:'Pack_Bundle',description:'Folded single homespun blanket with exposed cloth returns, one sewn repair patch and a planar character-contact back',...(repairStitches?{repairStitches:{object:repairStitches.object,triangles:repairStitches.triangles,actualHighStitches:repairStitches.actualHighStitches,sourceGeometryUnchanged:repairStitches.sourceGeometryUnchanged,maxPatchConformanceShiftM:repairStitches.maxPatchConformanceShiftM,maxAdditionalOutwardBiasM:repairStitches.maxAdditionalOutwardBiasM}}:{})},
  {node:'Pack_Binding',description:'Continuous grey cloth route with two horizontal and two vertical front passes, two shoulder loops and cloth side knot'},
  {node:'Pack_Sandals',description:'Two cupped straw sandals with open tied uppers and thin hanging cord; one independent assembly'},
  {node:'Pack_StrawMat',description:'Rolled woven grass mat across the top; the two cloth retainers belong to the same optional assembly',visibility:'Hide this node and descendants'},
  {node:'Pack_Jacket',description:'Full-size folded civilian indigo short jacket, exposed cloth corner and cloth knot button retained together',visibility:'Hide this node and descendants',withdrawal:'Translate this original node; all original garment geometry, visible corner and cloth knot button move together',exampleWorldTranslationM:[0,.36,.30],surfaceAreaM2:validation.parts.Pack_Jacket.surfaceAreaM2}
].map(part=>({...part,triangles:byPart[part.node],boundsM:measured[part.node].bounds,meshNodes:measured[part.node].meshNodes}));
const metadata={
  schema:'tengxian-independent-prop-v1',id:'SichuanBlanketPack',version,
  title:'1938 Sichuan Army folded single-blanket pack',
  asset:'Model_SichuanBlanketPack.glb',textureManifest:'Data_SichuanBlanketPackTextures.json',
  units:'metres',upAxis:'+Y',outwardAxis:'+Z',bodyContactPlane:'Z=0, facing -Z',pivotM:[0,0,0],
  nominalBundleDimensionsM:{width:.38,height:.30,thickness:.13},
  actualBundleDimensionsM:{width:bundle.size[0],height:bundle.size[1],thickness:bundle.size[2],includes:'All actual Pack_Bundle meshes, including turned cloth and the repair patch'},
  triangles:{total,limit:3000,includesAllOptionalParts:true,byPart,meetsRequiredFinalLimit:true},requiredFinalTriangleLimit:3000,
  parts,
  materials:{suite:'SichuanBlanketPack',size:[1024,1024],channels:['Base (sRGB)','Normal (linear/OpenGL)','Orm (linear R=AO G=roughness B=metallic)'],dielectrics:true,embeddedInGlb:true,sharedAtlas:'One unique non-overlapping GameUV atlas projected from the retained actual bake-source geometry and material graphs'+(wovenProvenance?', including GrassWeaveV11 imagegen reinforcement':''),sourceProvider:'Retained imagegen studies and real source material graphs; actual selected-to-active projection',sharedExistingBlanketRequirement:'Withdrawn by user; this asset has its own independently generated texture set',ormSemantics:'R=actual projected occlusion, G=actual projected high-source roughness, B=0 metallic',roughnessRangeBytes:bake.surfaceBake.roughnessPixels,surfaceRoughnessRangeBytes:bake.surfaceBake.surfaceRoughnessPixels,allThreeImagesLossless:true},
  source:{blend:geometry.gameBlend,blendEvidence:gameEvidence,highBlend:geometry.sourceHighBlend,highBlendEvidence:highEvidence,originalSculptBlend:geometry.sourceSculptBlend??null,originalSculptEvidence,texturesPacked:exportRecord.packedMaps,reference:referenceFile,referenceEvidence:FileEvidence(referenceFile),nativeAxes:'Blender X right, Z up, -Y outward',rebuild:'../../_blender/Script_SichuanGameBuildV10.py',foldedCloth:'../../_blender/Script_SichuanGameBodyV10.py',patchFit:'../../_blender/Script_SichuanGameBodyV10.py',foldEnvelope:foldProvenance,handStitches:handStitchProvenance,binding:'../../_blender/Script_SichuanGameBindingV10.py',gameBundleClearance:'../../_blender/Script_SichuanGameBindingClearanceV10.py',civilianJacket:'../../_blender/Script_SichuanGameJacketV10.py',strawMat:'../../_blender/Script_SichuanGameMatV10.py',strawSandals:'../../_blender/Script_SichuanGameSandalsV10.py',gameUv:'../../_blender/Script_SichuanGameUvV10.py',prepareBake:'../../_blender/Script_SichuanGamePrepareBakeV10.py',surfaceBake:'../../_blender/Script_SichuanGameExplodedBakeV10.py',projection:'../../_blender/Script_SichuanGameExplodedMergedProjectionV10.py',projectionSettings,supportSources:'../../_blender/Script_SichuanGameBakeSupportV10.py',cottonBalance:cottonProvenance,wovenLodSource:wovenProvenance,strawTone:strawToneProvenance,endcapSourceProvenance,surfaceEncoder:'../../_import/Script_SichuanGameMapsV10.py',export:'../../_blender/Script_SichuanGameExportV10.py',metadataWriter:'../../_import/Script_SichuanGameMetadataV10.mjs',imagegenStudies:sourceStudies},
  commandsFromRepositoryRoot:[
    'node Taierzhuang1938/_blender/Script_SichuanBlanketPackVerify.mjs --max-triangles=3000',
    'python Taierzhuang1938/_import/Script_SichuanGameMapsV10.py --project="'+projectDir+'" --review="'+path.join(reviewDir,'Bake')+'"',
    'node Taierzhuang1938/_import/Script_SichuanGameMetadataV10.mjs --project="'+projectDir+'" --review="'+reviewDir+'" --validation="'+validationFile+'"'
  ],
  review:{scope:'Actual exported GameV10 GLB',status:visual?(referenceFidelityReviewed?(sourceReopenVerified?'TechnicallyAndVisuallyReviewedForUser':'TechnicalValidatedPendingSourceReopen'):'BrowserInteractionsValidatedAwaitingReferenceReview'):'TechnicalValidatedAwaitingVisual',evidenceDirectory:reviewDir,screenshotsLocalOnly:true,referenceApprovedByUser:'2026-10-18, ThreeViewV02',technicalChecks:validation.checks.length,technicalChecksScope:'This exact GLB, every optional part, actual production UVs and complete embedded/external image bytes',strictValidation:FileEvidence(validationFile),sourceReopenVerified,referenceFidelityReviewed,finalModelApprovedByUser:false,visualInspection:visual?{record:FileEvidence(visualFile),checks:visual.checks,referenceFidelityReviewed}: {pending:true,required:['front','back','side','three-quarter','mat-hidden','jacket-hidden','jacket-extracted'],meaning:'Technical compliance does not establish reference fidelity'},backPlane:validation.backPlane,matContact:validation.matContact,jacketExtraction:validation.jacketExtraction,remainingRefinements:[...(!visual?['Final exported-model views and original-jacket withdrawal inspection']:[]),...(!referenceFidelityReviewed?['Compare the actual final material age and straw silhouettes against approved V02']:[]),...(!sourceReopenVerified?['Reopen the saved GameV10 source and verify packed final textures']:[])],authorizedBudgetTriangles:3000},
  provenance:{geometry:FileEvidence(geometryFile),geometryFitReports:geometrySourceReports,export:FileEvidence(exportFile),gameUv:FileEvidence(uvFile),textureManifest:FileEvidence(manifestFile),bakeRecord:FileEvidence(bakeRecordFile),bakeSupportReport:supportReportFile?FileEvidence(supportReportFile):null,projectionMethod:bake.roughnessBake.method,projectionSourceObjects:bake.roughnessBake.sources.length,projectionTargetMeshes:bake.roughnessBake.projection.length},
  reconstructionScope:'Exact size, grey tic-tac-toe binding route, patch, hanging arrangement and indigo jacket corner follow the user-approved design; they are not claimed as a measured 1938 army issue specification.',
  noModernComponents:['zippers','metal buckles','leather','modern backpack pockets or padded harness','text','logos'],
  assetUrl:'./Model/SichuanBlanketPack/Model_SichuanBlanketPack.glb?v='+version,
  assetBytes:assetEvidence.bytes,assetSha256:assetEvidence.sha256
};
const output=path.join(modelDir,'Data_SichuanBlanketPack.json');
const temporary=output+'.tmp';
fs.writeFileSync(temporary,JSON.stringify(metadata,null,2)+'\n');fs.renameSync(temporary,output);
console.log(JSON.stringify({written:output,version,totalTriangles:total,byPart,actualBundleDimensionsM:metadata.actualBundleDimensionsM,technicalPassed:true,visualViewsCaptured:!!visual,referenceFidelityReviewed,sourceReopenVerified,finalModelApprovedByUser:false}));
