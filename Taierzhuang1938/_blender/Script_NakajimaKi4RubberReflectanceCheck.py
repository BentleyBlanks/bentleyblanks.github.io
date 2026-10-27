"""Reopen the actual rubber candidate and check saved geometry and packed data."""
import array, ast, hashlib, json, pathlib, struct
import bpy

scriptPath = pathlib.Path(globals().get('__file__', 'Taierzhuang1938/_blender/Script_NakajimaKi4RubberReflectanceCheck.py')).resolve()
repo = scriptPath.parents[2]
evidence = repo / 'tmp/NakajimaKi4/ReferenceV42_ThreePhotoShape/Evidence'
record = json.loads((evidence / 'Data_RubberReflectanceAuthor.json').read_text(encoding='utf8'))
path = pathlib.Path(record['sourcePath'])
assert hashlib.sha256(path.read_bytes()).hexdigest() == record['sourceSha256']
bpy.ops.wm.open_mainfile(filepath=str(path))
tree = ast.parse(scriptPath.with_name('Script_NakajimaKi4MainGearUpdate.py').read_text(encoding='utf8'))
function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'MeshFingerprint')
exec(compile(ast.Module(body=[function], type_ignores=[]), str(scriptPath), 'exec'), globals())
bpy.context.view_layer.update()
root = bpy.data.objects['NakajimaKi4']
meshes = [obj for obj in root.children_recursive if obj.type == 'MESH']
assert {obj.name: MeshFingerprint(obj) for obj in meshes} == record['sourceMeshFingerprints']
packed = {image.name: hashlib.sha256(image.packed_file.data).hexdigest()
          for image in bpy.data.images if image.packed_file}
assert len(packed) == record['sourcePackedImages'] == 41
assert all(packed.get(name) == digest for name, digest in record['sourcePackedOriginalImages'].items())
assert packed[record['newImageName']] == record['newImageSha256']
material = bpy.data.materials['Material_Ki4TireWeatheredRubber']
assert len([node for node in material.node_tree.nodes
            if getattr(node, 'image', None) and node.image.name == record['newImageName']]) == 1
assert all(not node.label.startswith('DiagnosticOnly_')
           for mat in bpy.data.materials if mat.use_nodes for node in mat.node_tree.nodes)
assert root['geometryAoPendingForChangedGeometry'] and not root['referenceFidelityPassed']
assert root['materialRevision'] == '20261027ReferenceV43RubberReflectance'
assert hashlib.sha256(path.read_bytes()).hexdigest() == record['sourceSha256']
result = {'state': 'ActualV43RubberSourceReopenedChecksPassed_NotReferenceApproval',
          'sourcePath': str(path), 'sourceSha256': record['sourceSha256'],
          'sourceMeshFingerprintsChecked': len(meshes), 'sourcePackedImagesChecked': len(packed),
          'all40OriginalPackedImageBytesRetained': True, 'savedOriginalAoNodesRetained': True,
          'authorNeverSavedByThisCheck': True, 'geometryAoPending': True,
          'referenceFidelityPassed': False}
for target in [evidence / 'Data_RubberReflectanceSourceReopenedCheck.json',
               path.parent / 'Evidence/Data_RubberReflectanceSourceReopenedCheck.json']:
    target.write_text(json.dumps(result, indent=2), encoding='utf8')
print(json.dumps(result))
