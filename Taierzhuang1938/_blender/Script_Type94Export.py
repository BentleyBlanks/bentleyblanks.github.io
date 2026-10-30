"""Export a triangulated tangent-complete GLB while retaining editable source faces."""
import bpy
import bmesh
import json
import importlib.util
import struct
import hashlib
from pathlib import Path


def TranslateRootGltf(filepath,translation,nodeName='Type94Tankette'):
    """Apply explicit whole-asset grounding without reserializing mesh poses.

    Only the root transform JSON changes. Geometry/texture BIN bytes and all
    other node transforms are retained verbatim from the standard exporter.
    """
    assert bpy.context.scene.get('BlenderMcpTask')=='Type94Tankette'
    filepath=Path(filepath);payload=filepath.read_bytes()
    size=struct.unpack_from('<I',payload,12)[0];doc=json.loads(payload[20:20+size]);rest=payload[20+size:]
    node=next(node for node in doc['nodes']if node.get('name')==nodeName)
    if 'matrix'in node:
        for i,value in enumerate(translation):node['matrix'][12+i]+=value
    else:node['translation']=[a+b for a,b in zip(node.get('translation',[0,0,0]),translation)]
    text=json.dumps(doc,separators=(',',':')).encode('utf-8');text+=b' '*((-len(text))%4)
    result=struct.pack('<4sII',b'glTF',2,20+len(text)+len(rest))+struct.pack('<I4s',len(text),b'JSON')+text+rest
    assert result[20+len(text):]==rest
    filepath.write_bytes(result)
    return dict(rootName=nodeName,translationGltfM=list(translation),nonJsonChunksUnchanged=True,
        retainedChunksSha256=hashlib.sha256(rest).hexdigest())


def TriangulatedCopy(original):
    """Use the same temporary surface for export and reduction measurements."""
    mesh=original.copy()
    normalAttribute=mesh.attributes.new('Type94ExportLoopNormal','FLOAT_VECTOR','CORNER')
    for target,normal in zip(normalAttribute.data,original.corner_normals):target.vector=normal.vector
    bm=bmesh.new();bm.from_mesh(mesh)
    bmesh.ops.triangulate(bm,faces=list(bm.faces),quad_method='BEAUTY',ngon_method='BEAUTY')
    empty=[face for face in bm.faces if face.calc_area()<1e-14]
    if empty:bmesh.ops.delete(bm,geom=empty,context='FACES_ONLY')
    bm.to_mesh(mesh);bm.free();mesh.update()
    normals=[tuple(value.vector) for value in mesh.attributes['Type94ExportLoopNormal'].data]
    mesh.normals_split_custom_set(normals)
    mesh.attributes.remove(mesh.attributes['Type94ExportLoopNormal'])
    return mesh


def ExportGltf(filepath):
    assert bpy.context.scene.get('BlenderMcpTask')=='Type94Tankette'
    selected=[obj for obj in bpy.context.selected_objects if obj.type=='MESH']
    originals={obj:obj.data for obj in selected}
    copies={}
    try:
        for original in set(originals.values()):
            copies[original]=TriangulatedCopy(original)
        for obj,original in originals.items():obj.data=copies[original]
        bpy.context.view_layer.update()
        bpy.ops.export_scene.gltf(filepath=str(filepath),export_format='GLB',use_selection=True,
            export_yup=True,export_extras=True,export_animations=False,export_tangents=True)
        repairPath=Path(__file__).with_name('Script_Type94TangentRepair.py')
        spec=importlib.util.spec_from_file_location('Type94TangentRepair',repairPath)
        repair=importlib.util.module_from_spec(spec);spec.loader.exec_module(repair)
        report=repair.RepairTangents(filepath)
        reportPath=Path(filepath).parent.parent/'Acceptance'/('Data_TangentRepair'+Path(filepath).stem+'.json')
        reportPath.write_text(json.dumps(report,indent=2),encoding='utf-8')
        print('TYPE94_TANGENT_PRECISION_REPAIR',report['repaired'])
    finally:
        for obj,original in originals.items():obj.data=original
        for mesh in copies.values():
            if mesh.users==0:bpy.data.meshes.remove(mesh)
