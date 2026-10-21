import fs from 'node:fs';import path from 'node:path';import {createHash}from'node:crypto';import {fileURLToPath}from'node:url';
const reportFile=path.resolve(process.argv[2]),repairFile=path.resolve(process.argv[3]),repo=fileURLToPath(new URL('../../',import.meta.url));
const bake=JSON.parse(fs.readFileSync(reportFile,'utf8')),repair=JSON.parse(fs.readFileSync(repairFile,'utf8'));
if(bake.glb.sha256!==repair.originalExportGlb.sha256||!repair.verification.positionsNormalsUvsIndicesImagesJsonUntouched||!repair.verification.allTangentsPassUnchangedGate)throw Error('Actual tangent-only checked export evidence is incomplete');
const script='Taierzhuang1938/_import/Script_SichuanQualityTangentRepairV12.mjs';bake.originalExportGlb=bake.glb;bake.glb=repair.checkedGlb;
bake.tangentBasisRepair={generator:repair.generator,script,scriptSha256:createHash('sha256').update(fs.readFileSync(path.join(repo,script))).digest('hex'),localEvidencePath:repairFile,originalGlb:repair.originalExportGlb,checkedGlb:repair.checkedGlb,correctedVertices:repair.verification.patches,positionsNormalsUvsIndicesImagesJsonUntouched:true,allTangentsPassUnchangedGate:true,bytesOutsidePatchesSha256:repair.verification.bytesOutsidePatchesSha256After};
fs.writeFileSync(reportFile,JSON.stringify(bake,null,2)+'\n');console.log(JSON.stringify({frozen:true,triangles:bake.actualGlb.totalTriangles,glb:bake.glb}));
