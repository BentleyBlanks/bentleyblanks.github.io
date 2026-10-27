"""Save an independent rubber-only editable candidate from the protected V42.

Run with Script_BlenderMcp. This corrects encoded base RGB in linear light;
it does not approve the aircraft or reuse stale geometry AO as a fresh bake.
"""
import array, ast, hashlib, json, pathlib, re, shutil, struct, zlib
import bpy
import numpy as np

scriptPath = pathlib.Path(globals().get('__file__', 'Taierzhuang1938/_blender/Script_NakajimaKi4RubberReflectance.py')).resolve()
repo = scriptPath.parents[2]
asset = repo / 'tmp/NakajimaKi4/ReferenceV42_ThreePhotoShape'
author = json.loads((asset / 'Evidence/Data_ThreePhotoShapeAuthor.json').read_text(encoding='utf8'))
source = pathlib.Path(bpy.data.filepath)
sourceRoot = source.parent.parent / 'ReferenceV43_RubberReflectance'
targetSource = sourceRoot / 'Scene_NakajimaKi4.blend'
assert source.resolve() == pathlib.Path(author['sourcePath']).resolve()
assert hashlib.sha256(source.read_bytes()).hexdigest() == author['sourceSha256']
assert not sourceRoot.exists(), 'Use a new external source directory; never overwrite an earlier candidate'
root = bpy.data.objects['NakajimaKi4']
meshes = [obj for obj in root.children_recursive if obj.type == 'MESH']
assert len(meshes) == 928
tree = ast.parse(scriptPath.with_name('Script_NakajimaKi4MainGearUpdate.py').read_text(encoding='utf8'))
function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'MeshFingerprint')
exec(compile(ast.Module(body=[function], type_ignores=[]), str(scriptPath), 'exec'), globals())
bpy.context.view_layer.update()
fingerprints = {obj.name: MeshFingerprint(obj) for obj in meshes}
packed = {image.name: hashlib.sha256(image.packed_file.data).hexdigest()
          for image in bpy.data.images if image.packed_file}
assert packed == author['originalPackedImagesUnchanged'] and len(packed) == 40
material = bpy.data.materials['Material_Ki4TireWeatheredRubber']
baseNodes = [node for node in material.node_tree.nodes
             if getattr(node, 'image', None) and node.image.name == 'Texture_Ki4RubberBase.png']
assert len(baseNodes) == 1
node = baseNodes[0]
original = node.image
assert original.colorspace_settings.name == 'sRGB' and not original.is_float
assert packed[original.name] == 'baef9dbfb3e8714ed34fead3c00224d26171f5ad9eb2cd3d92dfbac3ee843e15'
width, height = original.size
pixels = np.empty(width * height * 4, dtype=np.float32)
original.pixels.foreach_get(pixels)
rgba = np.rint(pixels.reshape(height, width, 4)[::-1] * 255).astype(np.uint8)
rgb = rgba[:, :, :3].astype(np.float64) / 255
linear = np.where(rgb <= .04045, rgb / 12.92, ((rgb + .055) / 1.055) ** 2.4)
weights = np.array([.2126, .7152, .0722])
oldReflectance = float((linear @ weights).mean())
assert abs(oldReflectance - .004659102832746449) < 1e-12
scale = .02 / oldReflectance
changedLinear = np.clip(linear * scale, 0, 1)
encoded = np.where(changedLinear <= .0031308, changedLinear * 12.92,
                   1.055 * np.maximum(changedLinear, 0) ** (1 / 2.4) - .055)
updated = rgba.copy()
updated[:, :, :3] = np.rint(np.clip(encoded, 0, 1) * 255).astype(np.uint8)
assert np.array_equal(updated[:, :, 3], rgba[:, :, 3])

def PngChunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)

scanlines = b''.join(b'\0' + row.tobytes() for row in updated)
png = (b'\x89PNG\r\n\x1a\n' + PngChunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
       + PngChunk(b'IDAT', zlib.compress(scanlines, 9)) + PngChunk(b'IEND', b''))
for folder in ['Textures', 'Scripts', 'Evidence']:
    (sourceRoot / folder).mkdir(parents=True, exist_ok=True)
texturePath = sourceRoot / 'Textures/Texture_Ki4RubberBaseReflectance.png'
texturePath.write_bytes(png)
replacement = bpy.data.images.load(str(texturePath), check_existing=False)
replacement.name = texturePath.name
replacement.colorspace_settings.name = 'sRGB'
replacement.pack()
check = np.empty(width * height * 4, dtype=np.float32)
replacement.pixels.foreach_get(check)
assert np.array_equal(np.rint(check.reshape(height, width, 4)[::-1] * 255).astype(np.uint8), updated)
node.image = replacement
material['rubberBaseReflectanceScope'] = 'Mean linear diffuse reflectance near2percent, inferred PBR calibration; not measured historical Ki4 rubber'
root['materialRevision'] = '20261027ReferenceV43RubberReflectance'
root['materialAuthorScope'] = 'V42 geometry retained exactly. Tire base RGB only calibrated in linear light; full reference and revised geometry AO remain pending.'
root['referenceFidelityPassed'] = False
root['geometryAoPendingForChangedGeometry'] = True
assert fingerprints == {obj.name: MeshFingerprint(obj) for obj in meshes}
for name, digest in packed.items():
    assert hashlib.sha256(bpy.data.images[name].packed_file.data).hexdigest() == digest
assert len([image for image in bpy.data.images if image.packed_file]) == 41
text = bpy.data.texts.get(scriptPath.name) or bpy.data.texts.new(scriptPath.name)
text.clear()
text.write(scriptPath.read_text(encoding='utf8'))
text.use_fake_user = True
shutil.copy2(scriptPath, sourceRoot / 'Scripts' / scriptPath.name)
bpy.ops.wm.save_as_mainfile(filepath=str(targetSource))
assert hashlib.sha256(source.read_bytes()).hexdigest() == author['sourceSha256']
sourceSha = hashlib.sha256(targetSource.read_bytes()).hexdigest()

# Diagnostic export only: neutralize old geometry AO after saving the source.
neutralized = []
for mat in bpy.data.materials:
    if not mat.use_nodes:
        continue
    for imageNode in list(mat.node_tree.nodes):
        image = getattr(imageNode, 'image', None)
        if image is None or not re.search(r'GeometryAo|HardwareAo|TireAo|ShoeAo|SkidAo', image.name, re.I):
            continue
        links = [link for link in mat.node_tree.links if link.from_node == imageNode]
        if not links:
            continue
        white = mat.node_tree.nodes.new('ShaderNodeRGB')
        white.label = 'DiagnosticOnly_UnbakedGeometryAoWhite'
        white.outputs[0].default_value = (1, 1, 1, 1)
        for link in links:
            socket = link.to_socket
            mat.node_tree.links.remove(link)
            mat.node_tree.links.new(white.outputs[0], socket)
        neutralized.append({'material': mat.name, 'image': image.name, 'links': len(links)})
bpy.ops.object.select_all(action='DESELECT')
for obj in [root] + list(root.children_recursive):
    obj.select_set(True)
bpy.context.view_layer.objects.active = root
exportPath = asset / 'Model_NakajimaKi4HighPbrRubberSource.glb'
assert not exportPath.exists()
bpy.ops.export_scene.gltf(filepath=str(exportPath), export_format='GLB', use_selection=True,
                         export_yup=True, export_apply=True, export_extras=True, export_normals=True,
                         export_tangents=True, export_materials='EXPORT', export_animations=False,
                         export_cameras=False, export_lights=False)
newSrgb = updated[:, :, :3].astype(np.float64) / 255
newLinear = np.where(newSrgb <= .04045, newSrgb / 12.92, ((newSrgb + .055) / 1.055) ** 2.4)
result = {'state': 'IndependentV43RubberOnlyEditableSourceSaved_NotAircraftApproval',
          'inputSourcePath': str(source), 'inputSourceSha256': author['sourceSha256'],
          'sourcePath': str(targetSource), 'sourceSha256': sourceSha,
          'exportPath': str(exportPath), 'exportSha256': hashlib.sha256(exportPath.read_bytes()).hexdigest(),
          'sourceMeshes': len(meshes), 'sourceMeshFingerprints': fingerprints,
          'sourcePackedOriginalImages': packed, 'sourcePackedImages': 41,
          'newImageName': replacement.name, 'newImageSha256': hashlib.sha256(png).hexdigest(),
          'newDecodedRgbaSha256': hashlib.sha256(updated.tobytes()).hexdigest(),
          'originalMeanLinearReflectance': oldReflectance, 'linearScale': scale,
          'newMeanLinearReflectance': float((newLinear @ weights).mean()),
          'all928MeshUvNormalAndTransformFingerprintsUnchanged': True,
          'all40OriginalPackedImagesRetained': True, 'geometryAoBranchesNeutralizedInExportOnly': neutralized,
          'savedSourceRetainsOriginalAoNodes': True, 'referenceFidelityPassed': False,
          'canonicalPromoted': False, 'scope': root['materialAuthorScope']}
for path in [asset / 'Evidence/Data_RubberReflectanceAuthor.json', sourceRoot / 'Evidence/Data_RubberReflectanceAuthor.json']:
    path.write_text(json.dumps(result, indent=2), encoding='utf8')
stabilizer = scriptPath.with_name('Script_NakajimaKi4RubberExportStable.py')
exec(compile(stabilizer.read_text(encoding='utf8'), str(stabilizer), 'exec'), {'__file__': str(stabilizer)})
result = json.loads((asset / 'Evidence/Data_RubberReflectanceAuthor.json').read_text(encoding='utf8'))
print(json.dumps({key: result[key] for key in ['state', 'sourceSha256', 'exportSha256', 'sourcePackedImages', 'newMeanLinearReflectance']}))
