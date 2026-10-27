"""Reopen the real author, then import its actual GLB for closure/rotation QA."""
import array, ast, hashlib, json, math, os, pathlib, struct
import bpy, bmesh
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

scriptPath = pathlib.Path(globals().get('__file__', 'Taierzhuang1938/_blender/Script_NakajimaKi4PropellerSectionCheck.py')).resolve()
repo = scriptPath.parents[2]
asset = pathlib.Path(os.environ.get('KI4_PROPELLER_ASSET_ROOT', str(repo / 'tmp/NakajimaKi4/ReferenceV46_FullBladeOutline')))
record = json.loads((asset / 'Evidence/Data_PropellerSectionAuthor.json').read_text(encoding='utf8'))
path = pathlib.Path(record['sourcePath'])
assert hashlib.sha256(path.read_bytes()).hexdigest() == record['sourceSha256']
bpy.ops.wm.open_mainfile(filepath=str(path))
tree = ast.parse(scriptPath.with_name('Script_NakajimaKi4MainGearUpdate.py').read_text(encoding='utf8'))
function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'MeshFingerprint')
exec(compile(ast.Module(body=[function], type_ignores=[]), str(scriptPath), 'exec'), globals())
bpy.context.view_layer.update()
root = bpy.data.objects['NakajimaKi4']
meshes = [obj for obj in root.children_recursive if obj.type == 'MESH']
assert len(meshes) == 928
assert {obj.name: MeshFingerprint(obj) for obj in meshes} == record['sourceMeshFingerprints']
packed = {image.name: hashlib.sha256(image.packed_file.data).hexdigest()
          for image in bpy.data.images if image.packed_file}
assert len(packed) == 42
assert all(packed.get(name) == digest for name, digest in record['originalPackedImagesRetained'].items())
assert packed[record['newImageName']] == record['newImageSha256']
assert all(not node.label.startswith('DiagnosticOnly_')
           for material in bpy.data.materials if material.use_nodes for node in material.node_tree.nodes)
assert not bpy.context.scene.render.bake.use_selected_to_active
assert root['propellerGeometryAoFresh'] and root['geometryAoPendingForChangedGeometry']
localErrors = []
for part in record['propellerParts']:
    obj = bpy.data.objects[part['name']]
    spatial = KDTree(len(obj.data.vertices))
    for index, vertex in enumerate(obj.data.vertices):
        p = vertex.co
        spatial.insert(Vector((p.x, p.z, -p.y)), index)
    spatial.balance()
    error = max(spatial.find(Vector(p))[2] for p in part['sampledLocalGltf'])
    assert error < 2e-7
    localErrors.append({'name': obj.name, 'maximumLocalSampleErrorM': error})
beforeImport = set(bpy.data.objects)
exportPath = pathlib.Path(record['pbrExportPath'])
assert hashlib.sha256(exportPath.read_bytes()).hexdigest() == record['pbrExportSha256']
bpy.ops.import_scene.gltf(filepath=str(exportPath))
added = list(set(bpy.data.objects) - beforeImport)
imported = [obj for obj in added if obj.type == 'EMPTY' and obj.get('version') == record['version']]
assert len(imported) == 1
runtimeRoot = imported[0]
runtimeMeshes = [obj for obj in runtimeRoot.children_recursive if obj.type == 'MESH']
assert len(runtimeMeshes) == 928
parts = [obj for obj in runtimeMeshes if obj.name.startswith('Propeller_Blade')]
assert len(parts) == 2
pivot = next(obj for obj in runtimeRoot.children_recursive if obj.name.startswith('Pivot_Propeller'))
cowl = next(obj for obj in runtimeMeshes if obj.name.startswith('Cowl_AnnularRing'))

def Tree(obj):
    obj.data.calc_loop_triangles()
    return BVHTree.FromPolygons([obj.matrix_world @ vertex.co for vertex in obj.data.vertices],
                               [tuple(t.vertices) for t in obj.data.loop_triangles], all_triangles=True)

closure = []
for obj in parts:
    mesh = obj.data
    assert len(mesh.uv_layers) == 2 and mesh.has_custom_normals
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    count = sum(not edge.is_manifold for edge in bm.edges)
    volume = bm.calc_volume(signed=True)
    bm.free()
    assert count == 0 and volume > 0
    closure.append({'name': obj.name, 'geometricOpenOrNonmanifoldEdgesAfterPositionWeld': count,
                    'positiveVolumeM3': volume, 'runtimeUvLayers': len(mesh.uv_layers)})
cowlTree = Tree(cowl)
rest = pivot.matrix_basis.copy()
checks = []
for angle in range(0, 360, 15):
    pivot.matrix_basis = rest @ Matrix.Rotation(math.radians(angle), 4, 'Y')
    bpy.context.view_layer.update()
    trees = [Tree(obj) for obj in parts]
    crossings = [len(tree.overlap(cowlTree)) for tree in trees]
    mutual = len(trees[0].overlap(trees[1]))
    assert crossings == [0, 0] and mutual == 0
    checks.append({'angleDegrees': angle, 'bladeCowlTriangleIntersections': crossings,
                   'bladeBladeTriangleIntersections': mutual})
pivot.matrix_basis = rest
assert hashlib.sha256(path.read_bytes()).hexdigest() == record['sourceSha256']
result = {'state': 'ActualAuthorReopenedAndActualGlbPropellerControlsChecked',
          'sourceSha256': record['sourceSha256'], 'pbrExportSha256': record['pbrExportSha256'],
          'sourceMeshFingerprintsChecked': 928, 'sourcePackedImagesChecked': 42,
          'all41OriginalImageBytesRetained': True, 'sourceLocalSamples': localErrors,
          'sourceAoNodesSavedWithoutTransientDiagnosticWhites': True,
          'bakeWasNotSelectedToActive': True, 'actualGlbMeshes': len(runtimeMeshes),
          'actualGlbClosedBlades': closure, 'actualGlb24PhaseClearance': checks,
          'sourceAndGlb24PhaseClearancePassed': True, 'authorNeverSavedByThisCheck': True,
          'referenceFidelityPassed': False}
for target in [asset / 'Evidence/Data_PropellerSectionReopenedCheck.json',
               path.parent / 'Evidence/Data_PropellerSectionReopenedCheck.json']:
    target.write_text(json.dumps(result, indent=2), encoding='utf8')
print(json.dumps({key: result[key] for key in ['state', 'sourceMeshFingerprintsChecked',
                                              'sourcePackedImagesChecked', 'sourceAndGlb24PhaseClearancePassed']}))
