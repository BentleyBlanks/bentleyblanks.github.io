"""Synchronize the reviewed exported weight island into this task's source.

Run in the copied FpsHandSkinWeights_20261016 Blender project, with
FPS_PROJECT_ROOT set to the game directory. UV split vertices must map back
to the identical source Basis position within float32 export precision.
Geometry, shape keys and all weight values are preserved; only bone-group
ownership changes. The byte-exact GLB baker remains the publication entry.
"""
import bpy, json, struct, hashlib, re
from pathlib import Path
from mathutils import Vector
from mathutils.kdtree import KDTree

project=Path(FPS_PROJECT_ROOT).resolve()
folder=Path(bpy.data.filepath).resolve().parent
assert folder.name=='FpsHandSkinWeights_20261016', 'Use the independent source copy'
recipe=json.loads((project/'Model/Data_FpsHandSkinWeights.json').read_text(encoding='utf-8'))
basis=folder/'Model_FpsHanYangHands_Basis7c727aa4.glb'
raw=basis.read_bytes()
assert hashlib.sha256(raw).hexdigest()==recipe['basis']['sha256']
length=struct.unpack_from('<I',raw,12)[0]
doc=json.loads(raw[20:20+length]);base=28+length
source=bpy.data.objects['Mesh_FpsScanUnifiedSkin']
points=source.data.shape_keys.key_blocks['Basis'].data if source.data.shape_keys else source.data.vertices
tree=KDTree(len(points))
for vertex in source.data.vertices:tree.insert(source.matrix_world@points[vertex.index].co,vertex.index)
tree.balance()
normalize=lambda name:''.join(c for c in name.lower() if c.isalnum())
groups={normalize(group.name):group for group in source.vertex_groups}
updates={};maximum=0
for edit in recipe['edits']:
    primitive=doc['meshes'][edit['meshIndex']]['primitives'][edit['primitiveIndex']]
    node=next(node for node in doc['nodes'] if node.get('mesh')==edit['meshIndex'] and 'skin' in node)
    names=[normalize(doc['nodes'][index]['name']) for index in doc['skins'][node['skin']]['joints']]
    accessor=doc['accessors'][primitive['attributes']['POSITION']]
    view=doc['bufferViews'][accessor['bufferView']]
    offset=base+view.get('byteOffset',0)+accessor.get('byteOffset',0)+edit['vertex']*view.get('byteStride',12)
    x,y,z=struct.unpack_from('<3f',raw,offset)
    _,index,distance=tree.find(Vector((x,-z,y)))
    assert distance<2e-7, (edit['vertex'],index,distance,'not an exact source position')
    maximum=max(maximum,distance)
    pairs={names[old]:names[new] for old,new,weight in zip(edit['jointsBefore'],edit['jointsAfter'],edit['weightsBefore']) if weight>0 and old!=new}
    assert pairs
    for old,new in pairs.items():
        match=re.search(r'([rl])finger1([12]?)$',old)
        assert match and new==old[:match.start()]+match[1]+'finger2'+match[2], 'Only matching same-side index/middle segments may be reassigned'
    if index in updates:assert updates[index]==pairs, 'UV splits disagree about source ownership'
    updates[index]=pairs

changes=[]
for index,pairs in sorted(updates.items()):
    vertex=source.data.vertices[index]
    original={normalize(source.vertex_groups[item.group].name):item.weight for item in vertex.groups if item.weight>0}
    assert all(old in original for old in pairs), (index,pairs,original,'source weight mismatch')
    for old,new in pairs.items():
        assert new in groups and old in groups
        weight=original[old]
        groups[old].remove([index])
        groups[new].add([index],original.get(new,0)+weight,'REPLACE')
        changes.append({'vertex':index,'from':old,'to':new,'weight':weight})

report={'source':str(Path(bpy.data.filepath).resolve()),'exportVertices':len(recipe['edits']),
        'sourceVertices':len(updates),'maximumExportMappingErrorM':maximum,'changes':changes,
        'geometryAndShapeKeysUnchanged':True,'weightValuesPreserved':True}
source['FpsHandSkinWeightsRecipe']='Data_FpsHandSkinWeights.json'
source['FpsHandSkinWeightsSourceVertices']=len(updates)
for file in ['_blender/Script_FpsHandSkinWeightsBake.py','_blender/Script_FpsHandSkinSourceSync.py','Model/Data_FpsHandSkinWeights.json']:
    name=Path(file).name;text=bpy.data.texts.get(name) or bpy.data.texts.new(name)
    text.clear();text.write((project/file).read_text(encoding='utf-8'))
(folder/'Data_FpsHandSkinSourceSync.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath,compress=True)
print(json.dumps({key:value for key,value in report.items() if key!='changes'}))
