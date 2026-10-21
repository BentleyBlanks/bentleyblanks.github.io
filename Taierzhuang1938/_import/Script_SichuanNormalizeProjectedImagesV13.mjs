// Preserve the actual projected PNG payloads after the add-on packs opaque
// ORM channels. Every decoded RGB8 byte must match before any replacement.
import fs from 'node:fs';import path from 'node:path';import {createHash}from'node:crypto';
import {loadSharp,readGlb,viewBytes,writeGlb,geometryEvidence,fileEvidence}from'./Script_SichuanQualityPackageV12.mjs';
const reportFile=path.resolve(process.argv[2]),bake=JSON.parse(fs.readFileSync(reportFile,'utf8')),projection=JSON.parse(fs.readFileSync(bake.projectionBake.path,'utf8'));
const file=bake.glb.path,source=readGlb(file),g=source.document,{sharp}=loadSharp(),hash=b=>createHash('sha256').update(b).digest('hex');
if(!g.materials.every(m=>(m.alphaMode??'OPAQUE')==='OPAQUE'))throw Error('Image canonicalisation requires opaque PBR');
const old=await fileEvidence(file);if(old.sha256!==bake.glb.sha256)throw Error('Addon export changed');
const imageViews=new Set(g.images.map(i=>i.bufferView)),geometryIds=g.bufferViews.flatMap((v,i)=>imageViews.has(i)?[]:[i]),before=geometryEvidence(source,geometryIds),payloads=g.bufferViews.map((v,i)=>viewBytes(source,i)),rows=[];
for(const role of projection.partSubset)for(const channel of ['Base','Normal','Orm']){
 const projected=projection.atlases[role].images[channel],exported=bake.atlases[role].images[channel],input=fs.readFileSync(projected.path),actual=viewBytes(source,exported.bufferView);
 if(hash(input)!==projected.sha256||hash(actual)!==exported.sha256)throw Error('Actual source image changed');
 const x=await sharp(input).removeAlpha().raw({depth:'uchar'}).toBuffer(),y=await sharp(actual).removeAlpha().raw({depth:'uchar'}).toBuffer();
 if(!x.equals(y))throw Error(`Addon changed actual RGB8 ${role} ${channel}; canonicalisation refuses to hide it`);
 payloads[exported.bufferView]=input;rows.push({part:role,channel,addonPayloadSha256:hash(actual),projectedPayloadSha256:hash(input),decodedRgb8Sha256:hash(x),rgb8Identical:true,sourceAlphaPreservedInCanonicalPayload:true});
}
const backup=file.replace(/\.glb$/,'_Addon.glb');fs.copyFileSync(file,backup);writeGlb(file,g,payloads);
const normalized=readGlb(file),after=geometryEvidence(normalized,geometryIds);if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Image payload canonicalisation changed geometry');
for(const role of projection.partSubset)for(const channel of ['Base','Normal','Orm']){
 const entry=bake.atlases[role].images[channel],data=viewBytes(normalized,entry.bufferView);fs.writeFileSync(entry.path,data);Object.assign(entry,await fileEvidence(entry.path));
 if(entry.sha256!==projection.atlases[role].images[channel].sha256)throw Error('Canonical PNG payload differs');
}
bake.originalAddonExportGlb=old;bake.originalAddonExportGlb.path=backup;bake.glb=await fileEvidence(file);bake.requiresImageContainerNormalization=false;delete bake.pendingImageContainerNormalization;
const evidence={generator:'SichuanProjectedPngCanonicalisationV13',originalAddonExport:bake.originalAddonExportGlb,canonicalGlb:bake.glb,opaquePbr:true,allDecodedRgb8BytesIdentical:true,geometryBefore:before,geometryAfter:after,geometryBytesUnchanged:true,images:rows};
const evidenceFile=path.join(path.dirname(reportFile),'Data_ImageCanonicalisationV13.json');fs.writeFileSync(evidenceFile,JSON.stringify(evidence,null,2)+'\n');bake.imageContainerNormalization=await fileEvidence(evidenceFile);fs.writeFileSync(reportFile,JSON.stringify(bake,null,2)+'\n');console.log(JSON.stringify({normalised:true,triangles:bake.actualGlb.totalTriangles,glb:bake.glb}));
