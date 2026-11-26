import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { LoadGlb, ReadAccessor, ReadAccessorInt } from '../_import/Script_LugouGlbPose.mjs';
import { Pack } from '../Script_StrictTexturePublish.mjs';

const sourceRoot = 'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type89MediumTank';
const outputRoot = path.join(sourceRoot, 'GeometryV55SurfaceV16');
const baseline = path.join(sourceRoot, 'GeometryV55SurfaceV15/Game/Runtime/Model_Type89MediumTank.glb');
const profileFile = new URL('../Model/Type89MediumTank/Data_MetalFinishProfile.json', import.meta.url);
const profileBytes = Buffer.from((await fs.readFile(profileFile,'utf8')).replace(/\r\n/g,'\n'));
const profile = JSON.parse(profileBytes);
const Arg = name => process.argv.find(value => value.startsWith('--' + name + '='))?.slice(name.length + 3);
const output = path.resolve(Arg('output') ?? outputRoot);
const relative = path.relative(outputRoot, output);
assert.ok(!relative.startsWith('..') && !path.isAbsolute(relative));
const original = LoadGlb(baseline);
const Hash = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(Hash(original.buffer), profile.baselineRuntimeSha256);

const imageKey = image => image.name.replace(/\.(?:png|webp)$/i, '') + '.png';
const View = (image, glb) => {
  const view = glb.json.bufferViews[image.bufferView];
  return glb.bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
};

function TriangleUv(glb, primitive, accept) {
  const uv = ReadAccessor(glb, primitive.attributes.TEXCOORD_0).data;
  const positions = accept ? ReadAccessor(glb, primitive.attributes.POSITION).data : null;
  const indices = ReadAccessorInt(glb, primitive.indices).data;
  const triangles = [];
  for (let index = 0; index < indices.length; index += 3) {
    const vertices = indices.subarray(index, index+3);
    if (accept && !accept([...vertices].map(vertex => positions.subarray(vertex*3, vertex*3+3)))) continue;
    triangles.push([...vertices].map(vertex => [...uv.subarray(vertex*2,vertex*2+2)]));
  }
  return triangles;
}

async function Snapshot() {
  const directory = path.join(output,'Snapshot');
  await fs.mkdir(directory,{recursive:true});
  for (const image of original.json.images) {
    await sharp(View(image,original)).ensureAlpha().png().toFile(path.join(directory,imageKey(image)));
  }
  const protectedRoles = new Set(['Rubber','Glass','Exhaust','Shadow']);
  const shapes = {};
  for (const mesh of original.json.meshes) {
    for (const primitive of mesh.primitives) {
      const role = original.json.materials[primitive.material].extras.Type89Role;
      if (!protectedRoles.has(role) || primitive.attributes.TEXCOORD_0 === undefined) continue;
      shapes[role] ??= [];
      shapes[role].push(...TriangleUv(original,primitive));
    }
  }
  const cover = original.json.nodes.find(node => node.name === 'Mesh_BowRoundPortCover');
  shapes.Badge = original.json.meshes[cover.mesh].primitives.flatMap(primitive => TriangleUv(
    original, primitive, points => points.every(point => point[2]>.0145 && point[1]<-.025)
      && points.some(point => point[2]>.0225),
  ));
  assert.ok(shapes.Badge.length >= 10 && shapes.Rubber.length > 100 && shapes.Glass.length > 100);
  await fs.writeFile(path.join(directory,'Data_ProtectedFootprints.json'),JSON.stringify(shapes));
}

async function Build() {
  const glb = structuredClone(original.json);
  const chunks = glb.bufferViews.map(view => original.bin.subarray(
    view.byteOffset ?? 0, (view.byteOffset ?? 0)+view.byteLength,
  ));
  const accessViews = new Set(glb.accessors.map(accessor => accessor.bufferView));
  for (const image of glb.images) {
    assert.ok(!accessViews.has(image.bufferView),'An image cannot share a mesh accessor buffer');
    chunks[image.bufferView] = await fs.readFile(path.join(output,'Game/Maps',imageKey(image)));
    image.mimeType = 'image/png';
  }
  for (const texture of glb.textures) {
    if (texture.extensions?.EXT_texture_webp) {
      texture.source = texture.extensions.EXT_texture_webp.source;
      delete texture.extensions.EXT_texture_webp;
      if (Object.keys(texture.extensions).length === 0) delete texture.extensions;
    }
  }
  for (const key of ['extensionsUsed','extensionsRequired']) {
    if (glb[key]) glb[key] = glb[key].filter(value => value !== 'EXT_texture_webp');
  }
  glb.extensionsUsed ??= [];
  for (const material of glb.materials) {
    const role = material.extras.Type89Role;
    if (!['Armor','CastArmor','Guard'].includes(role)) continue;
    const settings = profile.roles[role];
    material.extensions ??= {};
    material.extensions.KHR_materials_clearcoat = {
      clearcoatFactor: settings.coatWeight,
      clearcoatRoughnessFactor: settings.coatRoughness,
    };
    // Blender's IOR-level default of .5 is the glTF specular factor of 1
    // for this stock dielectric IOR of 1.5.
    material.extensions.KHR_materials_specular = {specularFactor: settings.specular * 2};
  }
  if (!glb.extensionsUsed.includes('KHR_materials_specular')) glb.extensionsUsed.push('KHR_materials_specular');
  glb.asset.extras ??= {};
  glb.asset.extras.Type89MuseumFinish = {revision:profile.revision, materialRecipeSha256:Hash(profileBytes),
    baselineSha256:profile.baselineRuntimeSha256, referenceIds:profile.referenceIds};
  const root = glb.nodes.find(node => node.name === 'Model_Type89MediumTank');
  root.extras.surfaceRevision = profile.revision;
  const destination = path.join(output,'Game/Runtime');
  await fs.mkdir(destination,{recursive:true});
  await fs.writeFile(path.join(destination,'Model_Type89MediumTank.glb'),Pack(glb,chunks));
}

function Geometry(glb) {
  const nodes = glb.json.nodes.map(node => {
    if (node.name !== 'Model_Type89MediumTank') return node;
    const root = structuredClone(node);
    delete root.extras.surfaceRevision;
    return root;
  });
  return [nodes,glb.json.meshes,glb.json.scenes,glb.json.accessors,glb.json.animations];
}

async function Verify() {
  const file = path.join(output,'Game/Runtime/Model_Type89MediumTank.glb');
  const model = LoadGlb(file);
  assert.deepEqual(Geometry(model),Geometry(original));
  const geometryDigest = createHash('sha256');
  geometryDigest.update(JSON.stringify(Geometry(model)));
  for (const index of new Set(model.json.accessors.map(accessor => accessor.bufferView))) {
    const shape = glb => View({bufferView:index},glb);
    const bytes = shape(model);
    assert.ok(bytes.equals(shape(original)),'Geometry, UVs and tangents must be byte-exact');
    geometryDigest.update(bytes);
  }
  const checks=[];
  for (let i=0;i<model.json.images.length;i++) {
    const newImage=model.json.images[i], oldImage=original.json.images[i];
    const name=imageKey(newImage);
    assert.equal(name,imageKey(oldImage));
    const a=await sharp(View(oldImage,original)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const b=await sharp(View(newImage,model)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    assert.deepEqual(a.info,b.info);
    const donor=await sharp(await fs.readFile(path.join(output,'Game/Maps',name))).ensureAlpha().raw().toBuffer();
    const opaqueAlphaMatters=name.includes('GuardBase');
    let rgbChanges=0, rgbErrors=0, alphaErrors=0, aoErrors=0;
    for(let j=0;j<a.data.length;j+=4){
      for(let k=0;k<3;k++){
        if(a.data[j+k]!==b.data[j+k]) rgbChanges++;
        if(b.data[j+k]!==donor[j+k]) rgbErrors++;
      }
      if(opaqueAlphaMatters && (b.data[j+3]!==a.data[j+3] || b.data[j+3]!==donor[j+3])) alphaErrors++;
      if(name.includes('Orm') && b.data[j]!==a.data[j]) aoErrors++;
    }
    assert.deepEqual([rgbErrors,alphaErrors,aoErrors],[0,0,0],name+' exported RGB, retained mask and AO');
    checks.push({name,pixels:[b.info.width,b.info.height],rgbChanges,sha256:Hash(View(newImage,model))});
  }
  assert.ok(checks.every(check => check.rgbChanges > 0));
  const summary={pass:true,baselineSha256:profile.baselineRuntimeSha256,sha256:Hash(model.buffer),
    bytes:model.buffer.length,geometrySha256:geometryDigest.digest('hex'),materialRecipeSha256:Hash(profileBytes),
    geometryAndMotionExact:true,aoExact:true,guardMaskExact:true,checks};
  await fs.writeFile(path.join(output,'Data_MetalRuntimeAudit.json'),JSON.stringify(summary,null,2)+'\n');
  console.log(JSON.stringify(summary));
}

const phase=Arg('phase');
if(phase==='snapshot') await Snapshot();
else if(phase==='build') await Build();
else if(phase==='verify') await Verify();
else throw Error('Specify --phase=snapshot|build|verify');
