"""Export the accepted authored tree meshes through Blender 5.2.

Run with scripts/Script_BlenderMcp.mjs start --batch this-file --batch-args args.json.
The two packed .blend sources live outside this repository in OneDrive.
"""
import argparse
import json
import sys
import struct
from pathlib import Path
import bpy

def Main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--source-root',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    args.output.mkdir(parents=True,exist_ok=True)
    exports=[('Tree10','LOD0',38900),('Tree13','LOD0',48456),('Tree13','LOD1',22094)]
    report=[]
    for asset,lod,expected in exports:
        source=args.source_root/asset/f'Scene_WarDamaged{asset}.blend'
        bpy.ops.wm.open_mainfile(filepath=str(source),load_ui=False,use_scripts=False)
        def EnableLayer(layer):
            layer.exclude=False;layer.hide_viewport=False
            layer.collection.hide_viewport=False;layer.collection.hide_render=False
            for child in layer.children:EnableLayer(child)
        EnableLayer(bpy.context.view_layer.layer_collection)
        bpy.ops.object.select_all(action='DESELECT')
        if asset=='Tree10':objects=[bpy.data.objects['Tree10_Budget40K_LOD0']]
        else:
            collection=next(c for c in bpy.data.collections if c.name.startswith(lod+' |'))
            objects=[o for o in collection.all_objects if o.type=='MESH']
        triangles=0
        for obj in objects:
            obj.hide_set(False);obj.hide_viewport=False;obj.hide_render=False;obj.select_set(True)
            obj.data.calc_loop_triangles();triangles+=len(obj.data.loop_triangles)
        assert triangles==expected,(asset,lod,triangles,expected)
        assert all(i.packed_file for i in bpy.data.images if i.source=='FILE')
        target=args.output/f'Model_WarDamaged{asset}{lod.title()}.glb'
        bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',use_selection=True,
                                  export_yup=True,export_apply=False,export_normals=True,
                                  export_texcoords=True,export_tangents=False,
                                  export_vertex_color='ACTIVE',export_image_format='AUTO',
                                  export_animations=False,export_cameras=False,export_lights=False)
        raw=target.read_bytes();jsonLength=struct.unpack_from('<I',raw,12)[0]
        document=json.loads(raw[20:20+jsonLength])
        primitives=[p for mesh in document.get('meshes',[]) for p in mesh['primitives']]
        assert sum(document['accessors'][p['indices']]['count']//3 for p in primitives)==expected
        assert all('COLOR_0' in p['attributes'] for p in primitives)
        record={'asset':asset,'lod':lod,'triangles':triangles,'file':target.name,'source':str(source)}
        report.append(record);print(json.dumps(record),flush=True)
    (args.output/'Data_ExportReport.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
if __name__=='__main__':Main()
