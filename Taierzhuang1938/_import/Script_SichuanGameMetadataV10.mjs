// Write V10 delivery metadata only after the exact candidate passes its strict audit.
// Usage: node .../Script_SichuanGameMetadataV10.mjs --project=<candidate Taierzhuang1938> --review=<GameV10 output> [--validation=<JSON>] [--visual=<JSON>]
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {LoadGlb,ReadAccessor,ReadAccessorInt} from './Script_LugouGlbPose.mjs';

const args=process.argv.slice(2);
const Option=name=>args.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3);
const Require=(condition,message)=>{if(!condition)throw Error(message);};
Require(Option('project')&&Option('review'),'Pass --project=<candidate project> and --review=<GameV10 output directory>');
const projectDir=path.resolve(Option('project'));
const reviewDir=path.resolve(Option('review'));
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
const bundle=measured.Pack_Bundle.bounds;
Require(Near(bundle.size,[.38,.30,.13],.002)&&Math.abs(bundle.min[2])<=.001,'Actual GLB bundle dimensions or back plane differ from the requested contract');
Require(geometry.sourceHighBlend&&geometry.gameBlend&&SamePath(geometry.sourceHighBlend,bake.roughnessBake.sourceBlend.path)&&SamePath(geometry.gameBlend,exportRecord.gameBlend),'High/game source paths disagree across the final provenance');
const highEvidence=FileEvidence(geometry.sourceHighBlend),gameEvidence=FileEvidence(geometry.gameBlend);
Require(highEvidence.sha256===bake.roughnessBake.sourceBlend.sha256&&highEvidence.bytes===bake.roughnessBake.sourceBlend.bytes,'Retained high source changed after the actual projection');
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
const parts=[
  {node:'Pack_Bundle',description:'Folded single homespun blanket with exposed cloth returns, one sewn repair patch and a planar character-contact back'},
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
  materials:{suite:'SichuanBlanketPack',size:[1024,1024],channels:['Base (sRGB)','Normal (linear/OpenGL)','Orm (linear R=AO G=roughness B=metallic)'],dielectrics:true,embeddedInGlb:true,sharedAtlas:'One unique non-overlapping GameUV atlas projected from the retained HighV10 materials and geometry',sourceProvider:'Retained imagegen sources and HighV10 material graphs; actual selected-to-active projection',sharedExistingBlanketRequirement:'Withdrawn by user; this asset has its own independently generated texture set',ormSemantics:'R=actual projected occlusion, G=actual projected high-source roughness, B=0 metallic',roughnessRangeBytes:bake.surfaceBake.roughnessPixels,surfaceRoughnessRangeBytes:bake.surfaceBake.surfaceRoughnessPixels,allThreeImagesLossless:true},
  source:{blend:geometry.gameBlend,blendEvidence:gameEvidence,highBlend:geometry.sourceHighBlend,highBlendEvidence:highEvidence,texturesPacked:exportRecord.packedMaps,reference:referenceFile,referenceEvidence:FileEvidence(referenceFile),nativeAxes:'Blender X right, Z up, -Y outward',rebuild:'../../_blender/Script_SichuanGameBuildV10.py',foldedCloth:'../../_blender/Script_SichuanGameBodyV10.py',binding:'../../_blender/Script_SichuanGameBindingV10.py',civilianJacket:'../../_blender/Script_SichuanGameJacketV10.py',strawMat:'../../_blender/Script_SichuanGameMatV10.py',strawSandals:'../../_blender/Script_SichuanGameSandalsV10.py',gameUv:'../../_blender/Script_SichuanGameUvV10.py',surfaceBake:'../../_blender/Script_SichuanGameBakeV10.py',surfaceEncoder:'../../_import/Script_SichuanGameMapsV10.py',export:'../../_blender/Script_SichuanGameExportV10.py',metadataWriter:'../../_import/Script_SichuanGameMetadataV10.mjs',imagegenStudies:sourceStudies},
  commandsFromRepositoryRoot:[
    'node Taierzhuang1938/_blender/Script_SichuanBlanketPackVerify.mjs --max-triangles=3000',
    'python Taierzhuang1938/_import/Script_SichuanGameMapsV10.py --project="'+projectDir+'" --review="'+path.join(reviewDir,'Bake')+'"',
    'node Taierzhuang1938/_import/Script_SichuanGameMetadataV10.mjs --project="'+projectDir+'" --review="'+reviewDir+'" --validation="'+validationFile+'"'
  ],
  review:{scope:'Actual exported GameV10 GLB',status:visual?(sourceReopenVerified?'TechnicallyAndVisuallyReviewedForUser':'TechnicalValidatedPendingSourceReopen'):'TechnicalValidatedAwaitingVisual',evidenceDirectory:reviewDir,screenshotsLocalOnly:true,referenceApprovedByUser:'2026-10-18, ThreeViewV02',technicalChecks:validation.checks.length,technicalChecksScope:'This exact GLB, every optional part, actual production UVs and complete embedded/external image bytes',strictValidation:FileEvidence(validationFile),sourceReopenVerified,finalModelApprovedByUser:false,visualInspection:visual?{record:FileEvidence(visualFile),checks:visual.checks}: {pending:true,required:['front','back','side','three-quarter','mat-hidden','jacket-hidden','jacket-extracted'],meaning:'Technical compliance does not establish reference fidelity'},backPlane:validation.backPlane,matContact:validation.matContact,jacketExtraction:validation.jacketExtraction,remainingRefinements:[...(!visual?['Final exported-model appearance and original-jacket withdrawal inspection']:[]),...(!sourceReopenVerified?['Reopen the saved GameV10 source and verify packed final textures']:[])],authorizedBudgetTriangles:3000},
  provenance:{geometry:FileEvidence(geometryFile),export:FileEvidence(exportFile),gameUv:FileEvidence(uvFile),textureManifest:FileEvidence(manifestFile),bakeRecord:FileEvidence(bakeRecordFile),projectionMethod:bake.roughnessBake.method,projectionSourceObjects:bake.roughnessBake.sources.length,projectionTargetMeshes:bake.roughnessBake.projection.length},
  reconstructionScope:'Exact size, grey tic-tac-toe binding route, patch, hanging arrangement and indigo jacket corner follow the user-approved design; they are not claimed as a measured 1938 army issue specification.',
  noModernComponents:['zippers','metal buckles','leather','modern backpack pockets or padded harness','text','logos'],
  assetUrl:'./Model/SichuanBlanketPack/Model_SichuanBlanketPack.glb?v='+version,
  assetBytes:assetEvidence.bytes,assetSha256:assetEvidence.sha256
};
const output=path.join(modelDir,'Data_SichuanBlanketPack.json');
const temporary=output+'.tmp';
fs.writeFileSync(temporary,JSON.stringify(metadata,null,2)+'\n');fs.renameSync(temporary,output);
console.log(JSON.stringify({written:output,version,totalTriangles:total,byPart,actualBundleDimensionsM:metadata.actualBundleDimensionsM,technicalPassed:true,visualReviewed:!!visual,sourceReopenVerified,finalModelApprovedByUser:false}));
